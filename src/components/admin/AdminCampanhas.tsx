/**
 * AdminCampanhas — Hub oficial de campanhas e promoções da barbearia.
 *
 * Padrão 100% sério, minimalista e institucional (alinhado a Atendimento & Notificações e Perfil):
 *  1. Header oficial com ScheduleHeader
 *  2. Card Destaque sem caixas de ícone artificiais e sem pills pesadas
 *  3. Seção "Monte do seu jeito" agrupada em container limpo com divisores sutis
 *  4. Seção "Resumo das minhas promoções" com métricas nítidas
 *  5. Sub-telas no padrão executivo
 *
 * Zero emojis, zero elementos que pareçam gerados por IA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Scissors, Users, Trophy, Ticket, ChevronRight, Loader2,
  CheckCircle2, Share2, Award, ShieldCheck,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminPromocoes } from "./AdminPromocoes";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
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

  /* Métricas */
  const totalCampanhasAtivas = useMemo(() => {
    let count = 0;
    if (fidelidadeAtiva) count++;
    if (convide?.ativo) count++;
    if (clienteMes?.ativo) count++;
    count += 1; // Cupons sempre disponível
    return count;
  }, [fidelidadeAtiva, convide?.ativo, clienteMes?.ativo]);

  const totalIndicacoesCiclo = useMemo(() => {
    return ranking.reduce((acc, r) => acc + (r.total || 0), 0);
  }, [ranking]);

  /* ─────────── Sub-telas Fidelidade e Cupons ─────────── */
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

  /* ─────────── Convide e Ganhe (Indicou Amigo Cortou) ─────────── */
  if (view === "convide") {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background">
        <ScheduleHeader title="Indicou Amigo Cortou" onBack={() => setView("hub")} />

        <div className="flex-1 px-4 pt-3 pb-28 space-y-4 overflow-y-auto scrollbar-none max-w-md mx-auto w-full">
          {/* Card Hero informativo limpo */}
          <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Programa de Indicação
              </span>
              {convide?.ativo ? (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Ativa
                </span>
              ) : (
                <span className="text-[11.5px] font-medium text-muted-foreground">
                  Inativa
                </span>
              )}
            </div>

            <div>
              <h2 className="text-[17px] font-bold text-foreground tracking-tight leading-tight">
                Indicou Amigo Cortou
              </h2>
              <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
                Transforme seus clientes em divulgadores da barbearia. Eles compartilham o link exclusivo no WhatsApp e recebem corte cortesia quando os amigos concluem o atendimento.
              </p>
            </div>
          </div>

          {/* Toggle de ativação rápida */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] shadow-xs">
            <div className="pr-4">
              <p className="text-[13.5px] font-medium text-foreground">Disponibilidade no app</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Exibir banner de indicação no aplicativo de todos os clientes
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
              className="data-[state=checked]:bg-foreground shrink-0"
            />
          </div>

          {/* Como funciona estruturado */}
          <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-5 shadow-xs space-y-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Como funciona o programa
            </p>

            <div className="space-y-3.5">
              <div className="flex items-start gap-3">
                <Share2 className="w-4 h-4 text-foreground/70 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[13px] font-semibold text-foreground leading-tight">1. Compartilhamento do link</h4>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    O cliente acessa o app e compartilha o link oficial de indicação com amigos via WhatsApp.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-foreground/70 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[13px] font-semibold text-foreground leading-tight">2. Validação presencial do corte</h4>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    O amigo corta o cabelo na barbearia e a presença é concluída no sistema. O ponto é validado automaticamente.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Award className="w-4 h-4 text-foreground/70 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[13px] font-semibold text-foreground leading-tight">3. Liberação do corte cortesia</h4>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    Ao atingir a meta estipulada, o cliente recebe 1 corte grátis para resgatar no próximo agendamento.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Configuração de metas */}
          <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-5 shadow-xs space-y-3.5">
            <div>
              <p className="text-[13.5px] font-semibold text-foreground">
                Amigos necessários para 1 corte grátis
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Quantos amigos indicados precisam cortar cabelo para liberar o prêmio
              </p>
            </div>

            <div className="flex gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConvidesNecessarios(n)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all active:scale-95 border",
                    convidesNecessarios === n
                      ? "bg-foreground text-background border-foreground shadow-xs"
                      : "bg-secondary/40 border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {n} {n === 1 ? "amigo" : "amigos"}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[10.5px] text-muted-foreground/80 uppercase tracking-wider font-semibold block mb-1.5">
                Ou digite uma quantidade personalizada
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={convidesNecessarios}
                onChange={(e) => setConvidesNecessarios(Number(e.target.value))}
                className="h-11 text-[13.5px] font-medium bg-secondary/30 border-border/60 rounded-xl px-3.5"
              />
            </div>

            <div className="rounded-xl bg-secondary/50 border border-border/40 p-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-foreground/80 shrink-0 mt-0.5" />
              <p className="text-[12px] text-foreground/90 leading-relaxed font-medium">
                Regra atual: a cada <strong>{convidesNecessarios} {convidesNecessarios === 1 ? "amigo indicado que cortar" : "amigos indicados que cortarem"}</strong>, o cliente ganha 1 corte grátis.
              </p>
            </div>
          </div>

          <Button
            onClick={() =>
              saveMutation.mutate(
                { tipo: "convide_ganhe", indicacoes_necessarias: convidesNecessarios },
                { onSuccess: () => toast.success("Configuração de indicação salva") },
              )
            }
            disabled={saveMutation.isPending || convidesNecessarios < 1}
            className="w-full h-12 rounded-xl text-[13.5px] font-semibold bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all shadow-xs"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Configuração"}
          </Button>
        </div>
      </div>
    );
  }

  /* ─────────── Cliente do Mês ─────────── */
  if (view === "clientemes") {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background">
        <ScheduleHeader title="Cliente do Mês" onBack={() => setView("hub")} />

        <div className="flex-1 px-4 pt-3 pb-28 space-y-4 overflow-y-auto scrollbar-none max-w-md mx-auto w-full">
          {/* Card Hero informativo */}
          <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Torneio Mensal
              </span>
              {clienteMes?.ativo ? (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Ativa
                </span>
              ) : (
                <span className="text-[11.5px] font-medium text-muted-foreground">
                  Inativa
                </span>
              )}
            </div>

            <div>
              <h2 className="text-[17px] font-bold text-foreground tracking-tight leading-tight">
                Disputa Mensal de Clientes
              </h2>
              <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
                Crie um ambiente de competição na barbearia. O cliente com o maior número de novos amigos que cortarem no mês conquista o 1º lugar e 1 corte grátis.
              </p>
            </div>
          </div>

          {/* Toggle de ativação */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] shadow-xs">
            <div className="pr-4">
              <p className="text-[13.5px] font-medium text-foreground">Status do torneio</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Ciclo atual: <strong className="text-foreground capitalize">{mesAtual}</strong>
              </p>
            </div>
            <Switch
              checked={!!clienteMes?.ativo}
              onCheckedChange={toggleClienteMes}
              disabled={saveMutation.isPending || garantirCiclo.isPending}
              className="data-[state=checked]:bg-foreground shrink-0"
            />
          </div>

          {/* Ranking mensal */}
          <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Classificação de {mesAtual}
              </h3>
              <span className="text-[11px] font-medium text-muted-foreground">
                {ranking.length} {ranking.length === 1 ? "participante" : "participantes"}
              </span>
            </div>

            {ranking.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Trophy className="w-6 h-6 stroke-[1.5] text-muted-foreground/60 mx-auto" />
                <p className="text-[13px] font-medium text-foreground">
                  Nenhum corte computado no ciclo
                </p>
                <p className="text-[11.5px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  Os clientes que tiverem amigos que cortaram cabelo neste mês aparecerão no ranking automaticamente.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {ranking.map((r, i) => {
                  const isFirst = i === 0;
                  return (
                    <div
                      key={r.user_id}
                      className={cn(
                        "flex items-center gap-3.5 py-3 px-1 transition-colors",
                        isFirst && "bg-secondary/20 rounded-xl px-2.5 -mx-1"
                      )}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0",
                          isFirst
                            ? "bg-foreground text-background font-black shadow-xs"
                            : "bg-secondary text-muted-foreground font-semibold"
                        )}
                      >
                        {i + 1}º
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-semibold text-foreground truncate">
                            {r.nome}
                          </p>
                          {isFirst && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-foreground text-background">
                              Líder
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {r.total} {r.total === 1 ? "corte confirmado" : "cortes confirmados"}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[13px] font-bold text-foreground">
                          {r.total}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────── Hub Principal de Campanhas (Padrão 100% Sóbrio & Minimalista) ─────────── */
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <ScheduleHeader title="Promoções" onBack={() => navigate(`${basePath}/perfil`)} />

      <div className="flex-1 px-4 pt-2 pb-32 space-y-6 overflow-y-auto scrollbar-none max-w-md mx-auto w-full">
        {/* Subtítulo institucional */}
        <div className="px-0.5">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            As promoções são formas de ajudar sua barbearia a reter clientes, acelerar indicações e alcançar seus objetivos.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════
                1. CARD DESTAQUE PRINCIPAL (Totalmente limpo, sem caixas de ícone ou pills artificiais)
               ══════════════════════════════════════════════════════════════ */}
            <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] p-5 shadow-xs space-y-4">
              {/* Linha superior: título discreto e status sem caixa */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/75">
                  Campanha em destaque
                </span>

                {fidelidadeAtiva ? (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Ativa
                  </span>
                ) : (
                  <span className="text-[11.5px] font-medium text-muted-foreground">
                    Disponível
                  </span>
                )}
              </div>

              {/* Título e valor */}
              <div>
                <h2 className="text-[17px] font-bold text-foreground tracking-tight leading-tight">
                  Programa de Fidelidade
                </h2>
                <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
                  {fidelidadeAtiva
                    ? "A campanha está ativa para garantir o retorno contínuo dos clientes e maior recorrência nos agendamentos da barbearia."
                    : "Ative a fidelidade automática para recompensar clientes assíduos e aumentar a retenção na sua barbearia."}
                </p>
              </div>

              {/* Botão de ação direto */}
              <button
                type="button"
                onClick={() => setView("fidelidade")}
                className="w-full h-11 rounded-xl bg-foreground text-background font-semibold text-[13px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
              >
                {fidelidadeAtiva ? "Ver campanha" : "Configurar e ativar"}
              </button>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                2. SEÇÃO "MONTE DO SEU JEITO" (Container unificado e elegante com divisores finos)
               ══════════════════════════════════════════════════════════════ */}
            <div className="space-y-2.5">
              <div className="px-0.5">
                <h3 className="text-[14.5px] font-bold text-foreground tracking-tight">
                  Monte do seu jeito
                </h3>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  Crie campanhas personalizadas para atender às necessidades da barbearia
                </p>
              </div>

              <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] overflow-hidden divide-y divide-border/25 dark:divide-white/[0.06] shadow-xs">
                {/* 1. Programa de fidelidade */}
                <button
                  type="button"
                  onClick={() => setView("fidelidade")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-secondary/40 active:bg-secondary/60 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
                    <Scissors className="w-5 h-5 text-foreground/80 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                        Programa de fidelidade
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                        Defina a quantidade de cortes para liberar um corte cortesia
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {fidelidadeAtiva ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Ativa</span>
                    ) : null}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 2. Indicou amigo cortou */}
                <button
                  type="button"
                  onClick={() => setView("convide")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-secondary/40 active:bg-secondary/60 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
                    <Users className="w-5 h-5 text-foreground/80 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                        Indicou amigo cortou
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                        Link de indicação com premiação para quem trouxer amigos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {convide?.ativo ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Ativa</span>
                    ) : null}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 3. Cliente do mês */}
                <button
                  type="button"
                  onClick={() => setView("clientemes")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-secondary/40 active:bg-secondary/60 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
                    <Trophy className="w-5 h-5 text-foreground/80 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                        Cliente do mês
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                        Torneio mensal de clientes com premiação para o líder
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {clienteMes?.ativo ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Ativa</span>
                    ) : null}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 4. Cupons de desconto */}
                <button
                  type="button"
                  onClick={() => setView("cupons")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-secondary/40 active:bg-secondary/60 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
                    <Ticket className="w-5 h-5 text-foreground/80 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                        Cupons de desconto
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                        Cupons em % ou R$ com validade e limite de usos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-medium text-muted-foreground">Gerenciar</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                3. SEÇÃO "RESUMO DAS CAMPANHAS" (Métricas limpas e executivas)
               ══════════════════════════════════════════════════════════════ */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2 px-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <h3 className="text-[14px] font-bold text-foreground tracking-tight">
                  Resumo das minhas promoções
                </h3>
              </div>
              <p className="text-[11.5px] text-muted-foreground px-0.5 -mt-1.5">
                Confira o resumo das campanhas e o desempenho recente da barbearia
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* Métrica 1: Promoções ativas */}
                <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] p-4 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">Promoções</span>
                    <button
                      type="button"
                      onClick={() => setView("fidelidade")}
                      className="text-[10.5px] font-medium text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
                    >
                      Ver todas
                    </button>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground/75 block">
                      Ativas no momento
                    </span>
                    <p className="text-[22px] font-bold text-foreground tracking-tight leading-none mt-1">
                      {totalCampanhasAtivas}
                    </p>
                  </div>
                </div>

                {/* Métrica 2: Desempenho do mês */}
                <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] p-4 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">Desempenho</span>
                    <button
                      type="button"
                      onClick={() => setView("clientemes")}
                      className="text-[10.5px] font-medium text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
                    >
                      Ver ranking
                    </button>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground/75 block truncate">
                      Indicações no mês
                    </span>
                    <p className="text-[22px] font-bold text-foreground tracking-tight leading-none mt-1">
                      {totalIndicacoesCiclo}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminCampanhas;
