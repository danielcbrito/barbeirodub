/**
 * AdminCampanhas — Hub de campanhas da barbearia.
 *
 * Tela que abre em "Ative uma campanha" (perfil). Lista os banners de cada
 * campanha disponível e abre a configuração de cada uma:
 *  1. Programa de Fidelidade  (promocoes)
 *  2. Convide e Ganhe         (campanhas_config.convide_ganhe + indicacoes)
 *  3. Cliente do Mês          (campanhas_config.cliente_do_mes + ciclos_indicacao)
 *  4. Cupons de desconto      (AdminCupons)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, Users, Crown, Ticket, ChevronRight, Loader2, Trophy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminPromocoes } from "./AdminPromocoes";
import {
  useCampanhasConfig,
  useSaveCampanha,
  useCicloMensal,
  useGarantirCicloMensal,
  useRankingMensal,
} from "@/hooks/useCampanhas";

type View = "hub" | "fidelidade" | "cupons" | "convide" | "clientemes";

interface AdminCampanhasProps {
  tenantId?: string | null;
  basePath?: string;
}

const BackArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a4 4 0 0 1 4 4v1" />
  </svg>
);

/** Banner no mesmo formato do card "Dub Pago" da carteira. */
function CampaignBanner({
  eyebrow,
  eyebrowAccent,
  icon,
  title,
  subtitle,
  status,
  onClick,
}: {
  eyebrow: string;
  eyebrowAccent: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status?: "ativo" | "inativo";
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="relative w-full text-left active:scale-[0.99] transition-transform">
      <div className="relative rounded-2xl bg-muted/60 dark:bg-muted/30 overflow-hidden">
        <div className="relative bg-card rounded-2xl border border-border/60 shadow-sm px-4 pt-3 pb-3.5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-baseline">
              <span className="text-[12px] font-bold text-primary tracking-tight leading-none">{eyebrow}</span>
              <span className="text-[12px] font-bold text-primary italic tracking-tight leading-none">{eyebrowAccent}</span>
            </div>
            {status && (
              <span
                className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide uppercase",
                  status === "ativo"
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    : "bg-muted/40 text-muted-foreground border border-border/30",
                )}
              >
                {status === "ativo" ? "Ativa" : "Inativa"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-foreground flex-shrink-0">{icon}</span>
            <p className="flex-1 text-[14px] font-medium text-foreground leading-tight">{title}</p>
            <ChevronRight className="h-[15px] w-[15px] text-muted-foreground/60" strokeWidth={1.8} />
          </div>
        </div>
        <div className="relative px-4 py-2.5">
          <p className="text-[11.5px] font-normal text-muted-foreground leading-tight">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-20 bg-background">
      <div className="flex items-center gap-2.5 px-4 h-14">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground hover:bg-secondary/50 active:scale-95 transition-all"
          aria-label="Voltar"
        >
          <BackArrow />
        </button>
        <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">{title}</h1>
      </div>
    </div>
  );
}

export function AdminCampanhas({ tenantId, basePath = "/admin" }: AdminCampanhasProps = {}) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("hub");
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);

  const resolveTenantId = useCallback(async (): Promise<string | null> => {
    if (tenantId) return tenantId;
    const { data: tenantFromRole } = await supabase.rpc("get_user_tenant_id");
    if (tenantFromRole) return tenantFromRole as string;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    const { data: barberRow } = await supabase
      .from("barbeiros")
      .select("tenant_id")
      .eq("user_id", uid)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (barberRow?.tenant_id as string | null) ?? null;
  }, [tenantId]);

  useEffect(() => {
    resolveTenantId().then(setResolvedTenantId);
  }, [resolveTenantId]);

  const { data: campanhas = [], isLoading } = useCampanhasConfig(resolvedTenantId);
  const saveMutation = useSaveCampanha(resolvedTenantId);
  const convide = campanhas.find((c) => c.tipo === "convide_ganhe");
  const clienteMes = campanhas.find((c) => c.tipo === "cliente_do_mes");

  /* Fidelidade — status do programa */
  const [fidelidadeAtiva, setFidelidadeAtiva] = useState<boolean | null>(null);
  useEffect(() => {
    if (!resolvedTenantId) return;
    let alive = true;
    supabase
      .from("promocoes")
      .select("ativo")
      .eq("tenant_id", resolvedTenantId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (alive) setFidelidadeAtiva(!!data); });
    return () => { alive = false; };
  }, [resolvedTenantId, view]);

  /* Convide e Ganhe — form local */
  const [convidesNecessarios, setConvidesNecessarios] = useState(2);
  useEffect(() => {
    if (convide) setConvidesNecessarios(convide.indicacoes_necessarias);
  }, [convide]);

  /* Cliente do Mês */
  const { data: ciclo } = useCicloMensal(resolvedTenantId);
  const garantirCiclo = useGarantirCicloMensal(resolvedTenantId);
  const { data: ranking = [] } = useRankingMensal(view === "clientemes" ? ciclo?.id : null);

  const toggleClienteMes = async (next: boolean) => {
    if (next && !ciclo) {
      try {
        await garantirCiclo.mutateAsync();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!/sobreposto|ativo/i.test(msg)) {
          toast.error("Não foi possível iniciar o ciclo mensal");
          return;
        }
      }
    }
    saveMutation.mutate(
      { tipo: "cliente_do_mes", ativo: next },
      { onSuccess: () => toast.success(next ? "Campanha ativada" : "Campanha desativada") },
    );
  };

  const mesAtual = useMemo(
    () => new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    [],
  );

  /* ─────────── Sub-telas reaproveitando AdminPromocoes ─────────── */
  if (view === "fidelidade" || view === "cupons") {
    return (
      <AdminPromocoes
        tenantId={resolvedTenantId}
        basePath={basePath}
        initialTab={view === "cupons" ? "cupons" : "fidelidade"}
        onBack={() => setView("hub")}
      />
    );
  }

  /* ─────────── Convide e Ganhe ─────────── */
  if (view === "convide") {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background">
        <ScreenHeader title="Convide e Ganhe" onBack={() => setView("hub")} />
        <div className="flex-1 px-4 pt-3 pb-28 space-y-6 overflow-y-auto scrollbar-none">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            O cliente compartilha o link da barbearia. Quando o convidado corta o cabelo e você
            confirma o atendimento, o convite é validado. Ao atingir a quantidade configurada de
            convites validados, o cliente ganha um corte grátis automaticamente.
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/30">
            <div className="pr-4">
              <p className="text-[13px] font-semibold text-foreground">Campanha ativa</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Aparece no aplicativo do cliente como “Convide e Ganhe”
              </p>
            </div>
            <Switch
              checked={!!convide?.ativo}
              onCheckedChange={(v) =>
                saveMutation.mutate(
                  { tipo: "convide_ganhe", ativo: v, indicacoes_necessarias: convidesNecessarios },
                  { onSuccess: () => toast.success(v ? "Campanha ativada" : "Campanha desativada") },
                )
              }
            />
          </div>

          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
              Convites necessários para 1 corte grátis
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConvidesNecessarios(n)}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[13px] font-bold transition-all border",
                    convidesNecessarios === n
                      ? "bg-foreground/10 border-foreground/40 text-foreground"
                      : "bg-transparent border-border/40 text-muted-foreground hover:border-foreground/30",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={50}
              value={convidesNecessarios}
              onChange={(e) => setConvidesNecessarios(Number(e.target.value))}
              className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 mt-2"
            />
            <p className="text-[11px] text-muted-foreground mt-2 px-1">
              A cada {convidesNecessarios} {convidesNecessarios === 1 ? "convite validado" : "convites validados"} → 1 corte grátis
            </p>
          </div>

          <Button
            onClick={() =>
              saveMutation.mutate(
                { tipo: "convide_ganhe", indicacoes_necessarias: convidesNecessarios },
                { onSuccess: () => toast.success("Regra salva") },
              )
            }
            disabled={saveMutation.isPending || convidesNecessarios < 1}
            className="w-full h-12 rounded-xl text-[14px] font-semibold bg-foreground text-background hover:bg-foreground/90"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar regra"}
          </Button>
        </div>
      </div>
    );
  }

  /* ─────────── Cliente do Mês ─────────── */
  if (view === "clientemes") {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background">
        <ScreenHeader title="Cliente do Mês" onBack={() => setView("hub")} />
        <div className="flex-1 px-4 pt-3 pb-28 space-y-6 overflow-y-auto scrollbar-none">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Todo mês, o cliente que mais trouxer novos clientes para a barbearia ganha um corte
            grátis. Só contam os convites validados — quando o convidado corta e você confirma.
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/30">
            <div className="pr-4">
              <p className="text-[13px] font-semibold text-foreground">Campanha ativa</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ciclo mensal {ciclo ? "em andamento" : "será criado ao ativar"}
              </p>
            </div>
            <Switch
              checked={!!clienteMes?.ativo}
              onCheckedChange={toggleClienteMes}
              disabled={saveMutation.isPending || garantirCiclo.isPending}
            />
          </div>

          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
              Ranking de {mesAtual}
            </p>
            {ranking.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-muted/30 border border-border/20 flex items-center justify-center mx-auto">
                  <Trophy className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
                </div>
                <p className="text-[12px] text-muted-foreground">Nenhum convite validado ainda</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/30 bg-card overflow-hidden">
                {ranking.map((r, i) => (
                  <div
                    key={r.user_id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i > 0 && "border-t border-border/30",
                    )}
                  >
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center",
                        i === 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-foreground truncate">{r.nome}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {r.total} {r.total === 1 ? "convite" : "convites"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────── Hub ─────────── */
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <ScreenHeader title="Campanhas" onBack={() => navigate(`${basePath}/perfil`)} />
      <div className="flex-1 px-4 pt-2 pb-28 space-y-4 overflow-y-auto scrollbar-none">
        <p className="text-[12.5px] text-muted-foreground leading-relaxed px-1">
          Ative campanhas para atrair e fidelizar clientes. Elas aparecem automaticamente no
          aplicativo do cliente.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CampaignBanner
              eyebrow="Programa"
              eyebrowAccent="Fidelidade"
              icon={<Gift className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              title="Cortes que viram corte grátis"
              subtitle="Configure quantos cortes o cliente precisa para ganhar um grátis"
              status={fidelidadeAtiva === null ? undefined : fidelidadeAtiva ? "ativo" : "inativo"}
              onClick={() => setView("fidelidade")}
            />

            <CampaignBanner
              eyebrow="Convide"
              eyebrowAccent="e Ganhe"
              icon={<Users className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              title="Indicou e o amigo cortou? Corte grátis"
              subtitle={`A cada ${convide?.indicacoes_necessarias ?? 2} convites validados o cliente ganha 1 corte`}
              status={convide?.ativo ? "ativo" : "inativo"}
              onClick={() => setView("convide")}
            />

            <CampaignBanner
              eyebrow="Cliente"
              eyebrowAccent=" do Mês"
              icon={<Crown className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              title="Quem mais indicar ganha o mês"
              subtitle="O cliente que mais trouxer novos clientes no mês ganha um corte grátis"
              status={clienteMes?.ativo ? "ativo" : "inativo"}
              onClick={() => setView("clientemes")}
            />

            <CampaignBanner
              eyebrow="Cupons"
              eyebrowAccent=" de desconto"
              icon={<Ticket className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              title="Crie cupons promocionais"
              subtitle="Descontos em reais ou porcentagem, com validade e limite de usos"
              onClick={() => setView("cupons")}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default AdminCampanhas;
