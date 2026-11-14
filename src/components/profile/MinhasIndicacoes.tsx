import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MousePointerClick,
  UserPlus,
  CalendarCheck,
  CheckCircle2,
  Search,
  Loader2,
  Gift,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MinhasIndicacoesProps {
  basePath?: string;
  /** Tenant a ser monitorado. Se omitido, resolve pelo usuário logado. */
  tenantId?: string;
}

interface IndicadorAgg {
  indicador_id: string;
  nome: string | null;
  referral_code: string | null;
  cliques: number;      // link_clicked_em not null
  cadastros: number;    // indicado_id not null
  agendamentos: number; // agendado_em not null
  finalizados: number;  // liberado_em not null
  total: number;        // total de rows
}

/**
 * Resolve o tenant_id do contexto do usuário atual (admin/tenant_admin/barbeiro).
 * Prioridade: tenant_members → barbeiros.tenant_id.
 */
async function resolveCurrentTenantId(): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return null;

  const { data: mem } = await supabase
    .from("tenant_members")
    .select("tenant_id, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mem?.tenant_id) return mem.tenant_id as string;

  const { data: barb } = await supabase
    .from("barbeiros")
    .select("tenant_id")
    .eq("user_id", uid)
    .eq("ativo", true)
    .is("deleted_at", null)
    .not("tenant_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (barb?.tenant_id as string) ?? null;
}

/**
 * Monitor de indicações escopado à barbearia atual. Mostra somente as
 * indicações cujo INDICADO é cliente desta barbearia (tenant_clientes),
 * ou cujo agendamento qualificador ocorreu nesta barbearia.
 * 100% dados reais.
 */
export function MinhasIndicacoes({ basePath = "/admin", tenantId }: MinhasIndicacoesProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<IndicadorAgg[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 0) Resolver tenant atual
        const tId = tenantId ?? (await resolveCurrentTenantId());
        if (!tId) {
          setRows([]);
          return;
        }

        // 1) IDs de usuários que são clientes desta barbearia
        const { data: clientes, error: cliErr } = await supabase
          .from("tenant_clientes")
          .select("user_id")
          .eq("tenant_id", tId);
        if (cliErr) throw cliErr;
        const tenantUserIds = new Set(
          (clientes ?? []).map((c: any) => c.user_id).filter(Boolean),
        );

        // 2) (Agendamento como fallback foi removido: agendamentos usa
        //    unidade_id, não tenant_id; o vínculo em tenant_clientes já cobre
        //    todos os indicados desta barbearia.)


        // 3) Indicações do sistema; RLS libera para staff
        const { data: indicacoes, error } = await supabase
          .from("indicacoes")
          .select(
            "indicador_id, indicado_id, link_clicked_em, agendado_em, liberado_em, agendamento_qualificador_id",
          );
        if (error) throw error;

        // 4) Filtrar por INDICADOR pertencente a esta barbearia.
        //    O link de indicação é gerado por um cliente do tenant, então
        //    a indicação "pertence" à barbearia do indicador. Isso captura
        //    também cliques sem cadastro (indicado_id ainda nulo).
        const scoped = ((indicacoes ?? []) as any[]).filter(
          (r) => r.indicador_id && tenantUserIds.has(r.indicador_id),
        );



        // 5) Agregar por indicador
        const agg = new Map<string, IndicadorAgg>();
        for (const r of scoped) {
          const cur = agg.get(r.indicador_id) ?? {
            indicador_id: r.indicador_id,
            nome: null,
            referral_code: null,
            cliques: 0,
            cadastros: 0,
            agendamentos: 0,
            finalizados: 0,
            total: 0,
          };
          cur.total += 1;
          if (r.link_clicked_em) cur.cliques += 1;
          if (r.indicado_id) cur.cadastros += 1;
          if (r.agendado_em) cur.agendamentos += 1;
          if (r.liberado_em) cur.finalizados += 1;
          agg.set(r.indicador_id, cur);
        }

        // 6) Enriquecer nome/referral_code dos indicadores (somente os que
        //    já apareceram — nada de listar usuários de outras barbearias)
        const ids = Array.from(agg.keys());
        if (ids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, nome, referral_code")
            .in("id", ids);
          for (const p of (profs ?? []) as any[]) {
            const cur = agg.get(p.id);
            if (cur) {
              cur.nome = p.nome ?? null;
              cur.referral_code = p.referral_code ?? null;
            }
          }
        }

        const list = Array.from(agg.values()).sort(
          (a, b) => b.total - a.total || b.cliques - a.cliques,
        );
        setRows(list);
      } catch (e: any) {
        console.error("[MinhasIndicacoes]", e);
        toast.error(e?.message || "Erro ao carregar indicações");
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.nome ?? "").toLowerCase().includes(q) ||
        (r.referral_code ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          usuarios: acc.usuarios + (r.referral_code ? 1 : 0),
          cliques: acc.cliques + r.cliques,
          cadastros: acc.cadastros + r.cadastros,
          agendamentos: acc.agendamentos + r.agendamentos,
          finalizados: acc.finalizados + r.finalizados,
        }),
        { usuarios: 0, cliques: 0, cadastros: 0, agendamentos: 0, finalizados: 0 },
      ),
    [rows],
  );

  return (
    <div className="pb-8 -mx-3 -mt-3">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={() => navigate(`${basePath}/config-barbearia`)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-bold tracking-tight text-foreground flex-1">
            Indicações — Monitor Global
          </h1>
        </div>
        <div className="px-4 pb-3 pt-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou código..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-secondary/50 border border-border/30 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-5">
          {/* Totais gerais */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { icon: Gift, label: "Usuários com link", value: totals.usuarios },
              { icon: MousePointerClick, label: "Cliques totais", value: totals.cliques },
              { icon: UserPlus, label: "Cadastros", value: totals.cadastros },
              { icon: CalendarCheck, label: "Agendamentos", value: totals.agendamentos },
              { icon: CheckCircle2, label: "Finalizados", value: totals.finalizados },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-border/20 bg-card p-4"
              >
                <c.icon className="w-4 h-4 text-muted-foreground mb-2" strokeWidth={1.8} />
                <p className="text-[22px] font-bold text-foreground leading-none">{c.value}</p>
                <p className="text-[11px] font-semibold text-foreground/90 mt-1.5 leading-tight">
                  {c.label}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Top 3 por métrica */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopCard
              title="Mais cliques no link"
              icon={MousePointerClick}
              rows={rows}
              metric="cliques"
              search={search}
            />
            <TopCard
              title="Mais cadastros gerados"
              icon={UserPlus}
              rows={rows}
              metric="cadastros"
              search={search}
            />
            <TopCard
              title="Mais agendamentos"
              icon={CalendarCheck}
              rows={rows}
              metric="agendamentos"
              search={search}
            />
            <TopCard
              title="Mais serviços finalizados"
              icon={CheckCircle2}
              rows={rows}
              metric="finalizados"
              search={search}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function TopCard({
  title,
  icon: Icon,
  rows,
  metric,
  search,
}: {
  title: string;
  icon: React.ElementType;
  rows: IndicadorAgg[];
  metric: "cliques" | "cadastros" | "agendamentos" | "finalizados";
  search: string;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          (r.nome ?? "").toLowerCase().includes(q) ||
          (r.referral_code ?? "").toLowerCase().includes(q),
      )
    : rows;

  const top = filtered
    .filter((r) => r[metric] > 0)
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-border/20 bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/20 bg-secondary/20">
        <Icon className="w-4 h-4 text-primary" strokeWidth={2} />
        <p className="text-[12px] font-bold text-foreground uppercase tracking-wide">{title}</p>
      </div>

      {top.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[12px] text-muted-foreground">Sem dados ainda</p>
        </div>
      ) : (
        <div className="divide-y divide-border/10">
          {top.map((r, i) => (
            <div key={r.indicador_id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-[18px] w-6 text-center">{MEDALS[i]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">
                  {r.nome || "—"}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  {r.referral_code ?? "sem código"}
                </p>
              </div>
              <span className="text-[18px] font-bold text-foreground tabular-nums">
                {r[metric]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MinhasIndicacoes;
