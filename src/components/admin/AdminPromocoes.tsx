import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Gift, Pencil, ChevronDown, Loader2, ChevronRight, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EditPromotionModal } from "./EditPromotionModal";
import { AdminCupons } from "./AdminCupons";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import {
  useTogglePromocao,
  useDeletePromocao,
  useUpdatePromocao,
} from "@/hooks/useAdminMutations";
import { ScheduleHeader, CurvedBackArrow } from "@/components/shared/ScheduleHeader";

interface Promocao {
  id: string;
  nome: string;
  descricao: string | null;
  pontos_necessarios: number;
  ativo: boolean;
  weekly_required: boolean;
}

type TabType = "cupons" | "fidelidade";

interface AdminPromocoesProps {
  tenantId?: string | null;
  basePath?: string;
  /** Aba inicial quando aberto a partir do hub de campanhas. */
  initialTab?: TabType;
  /** Sobrescreve o botão voltar (ex.: retornar ao hub de campanhas). */
  onBack?: () => void;
}

export function AdminPromocoes({ tenantId, basePath = "/admin", initialTab = "cupons", onBack }: AdminPromocoesProps = {}) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promocao | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  // Aberto a partir do hub de campanhas: mostra só a seção escolhida (sem abas).
  const singleTab = !!onBack;
  const screenTitle = activeTab === "cupons" ? "Cupons de desconto" : "Programa de Fidelidade";
  const screenSubtitle =
    activeTab === "cupons"
      ? "Crie cupons em reais ou porcentagem, com validade e limite de usos. Os cupons ativos aparecem no aplicativo do cliente."
      : "Defina quantos cortes o cliente precisa acumular para ganhar um corte grátis. O progresso aparece no aplicativo do cliente.";


  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);

  // Mobile full-screen edit form state
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editPontos, setEditPontos] = useState(8);
  const [editWeekly, setEditWeekly] = useState(false);
  const [editAtivo, setEditAtivo] = useState(false);

  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Mutation hooks
  const toggleMutation = useTogglePromocao(resolvedTenantId);
  const deleteMutation = useDeletePromocao(resolvedTenantId);
  const updateMutation = useUpdatePromocao(resolvedTenantId);

  const resolveTenantId = useCallback(async (): Promise<string | null> => {
    if (tenantId) return tenantId;
    const { data: tenantFromRole } = await supabase.rpc("get_user_tenant_id");
    if (tenantFromRole) return tenantFromRole as string;
    if (basePath === "/barbeiro") {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      if (!currentUserId) return null;
      const { data: barberRow } = await supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("user_id", currentUserId)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (barberRow?.tenant_id as string | null) ?? null;
    }
    return null;
  }, [tenantId, basePath]);

  // Resolve tenant on mount
  useEffect(() => {
    resolveTenantId().then((id) => setResolvedTenantId(id));
  }, [resolveTenantId]);

  // useQuery for promocoes
  const queryKey = QUERY_KEYS.admin.promocoes(resolvedTenantId);
  const { data: promocoes = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("promocoes")
        .select("id, nome, descricao, pontos_necessarios, ativo, weekly_required, tenant_id, created_at")
        .order("created_at", { ascending: false });

      if (resolvedTenantId) {
        query = query.eq("tenant_id", resolvedTenantId);
      } else if (basePath !== "/barbeiro") {
        query = query.is("tenant_id", null);
      }

      let { data, error } = await query;
      if (error) throw error;

      // Fallback: garante plano padrão para tenant
      if (resolvedTenantId && (!data || data.length === 0)) {
        const { error: ensureError } = await supabase.rpc("ensure_default_loyalty_promotion", {
          p_tenant_id: resolvedTenantId,
        });
        if (!ensureError) {
          const retry = await supabase
            .from("promocoes")
            .select("id, nome, descricao, pontos_necessarios, ativo, weekly_required, tenant_id, created_at")
            .eq("tenant_id", resolvedTenantId)
            .order("created_at", { ascending: false });
          data = retry.data || [];
          if (retry.error) throw retry.error;
        }
      }

      return (data || []) as Promocao[];
    },
    enabled: resolvedTenantId !== undefined,
    staleTime: STALE_TIMES.SERVICOS,
  });

  // Realtime subscription for invalidation
  useEffect(() => {
    const channelId = `admin-promocoes-${resolvedTenantId || 'global'}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "promocoes",
        ...(resolvedTenantId ? { filter: `tenant_id=eq.${resolvedTenantId}` } : {}),
      }, () => queryClient.invalidateQueries({ queryKey }))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [resolvedTenantId, queryClient, queryKey]);

  const handleTogglePromo = (id: string, currentStatus: boolean) => {
    toggleMutation.mutate({ id, ativo: currentStatus });
  };

  const handleDeletePromo = (id: string, nome: string) => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    deleteMutation.mutate(id);
  };

  const handleCreateDefaultFidelity = async () => {
    if (!resolvedTenantId) {
      toast.error("Não foi possível identificar a barbearia");
      return;
    }
    try {
      const { error } = await supabase.rpc("ensure_default_loyalty_promotion", {
        p_tenant_id: resolvedTenantId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey });
      toast.success("Plano de fidelidade criado com sucesso");
    } catch (error) {
      console.error("Error creating default loyalty promotion:", error);
      toast.error("Erro ao criar plano de fidelidade");
    }
  };

  const mainPromo = promocoes.find((p) => p.ativo) || promocoes[0] || null;

  /** Abre tela full-screen de edição no mobile */
  const openMobileEdit = (promo: Promocao) => {
    setEditingPromo(promo);
    setEditNome(promo.nome);
    setEditDescricao(promo.descricao || "");
    setEditPontos(promo.pontos_necessarios);
    setEditWeekly(promo.weekly_required);
    setEditAtivo(promo.ativo);
    setMobileEditOpen(true);
  };

  const handleMobileSave = () => {
    if (!editingPromo) return;
    if (!editNome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editPontos < 2) { toast.error("Mínimo 2 cortes"); return; }

    updateMutation.mutate(
      {
        id: editingPromo.id,
        nome: editNome.trim(),
        descricao: editDescricao.trim() || null,
        pontos_necessarios: editPontos,
        weekly_required: editWeekly,
        ativo: editAtivo,
      },
      {
        onSuccess: () => {
          setMobileEditOpen(false);
          setEditingPromo(null);
        },
      }
    );
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: "cupons", label: "Cupons" },
    { key: "fidelidade", label: "Fidelidade" },
  ];

  const activePromos = promocoes.filter((p) => p.ativo).length;
  const inactivePromos = promocoes.filter((p) => !p.ativo).length;

  /* ─── Mobile: Full-screen Edit ─── */
  if (isMobile && mobileEditOpen && editingPromo) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <ScheduleHeader
          title="Editar Fidelidade"
          onBack={() => { setMobileEditOpen(false); setEditingPromo(null); }}
        />

        {/* Form content */}
        <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28 scrollbar-none">
          <div className="space-y-6">
            {/* Seção: Informações */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
                Informações da Promoção
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Nome da Promoção
                  </label>
                  <Input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    placeholder="Ex: Plano Fidelidade"
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Descrição (opcional)
                  </label>
                  <Textarea
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                    placeholder="Descreva a promoção para seus clientes..."
                    rows={3}
                    className="text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 py-3 placeholder:text-muted-foreground/30 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Seção: Regras */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
                Regras de Fidelidade
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Cortes necessários para 1 grátis
                  </label>
                  <div className="flex gap-2 mt-2">
                    {[5, 6, 8, 10, 12].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditPontos(p)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[12.5px] font-semibold transition-all active:scale-95 border",
                          editPontos === p
                            ? "bg-foreground text-background border-foreground shadow-xs"
                            : "bg-secondary/40 border-border/60 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={2}
                    max={50}
                    value={editPontos}
                    onChange={(e) => setEditPontos(Number(e.target.value))}
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30 mt-2"
                    placeholder="Valor personalizado"
                  />
                </div>
              </div>
            </div>

            {/* Seção: Configurações */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
                Configurações
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/30">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Promoção ativa</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Quando ativa, os clientes acumulam pontos automaticamente
                    </p>
                  </div>
                  <Switch checked={editAtivo} onCheckedChange={setEditAtivo} />
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/30">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Frequência semanal</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Exige frequência semanal para acumular pontos
                    </p>
                  </div>
                  <Switch checked={editWeekly} onCheckedChange={setEditWeekly} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer fixo */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 py-3">
          <Button
            onClick={handleMobileSave}
            disabled={updateMutation.isPending || !editNome.trim() || editPontos < 2}
            className="w-full h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90"
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Alterações"}
          </Button>
        </div>
      </div>
    );
  }

  /* ─── Mobile Layout ─── */
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background overflow-hidden">
        <ScheduleHeader
          title={singleTab ? screenTitle : "Programa de Fidelidade"}
          onBack={() => (onBack ? onBack() : navigate(basePath))}
        />

          {singleTab ? (
            <p className="px-4 pb-3 pt-1 text-[12.5px] text-muted-foreground leading-relaxed">
              {screenSubtitle}
            </p>
          ) : (
            <div className="px-4 pb-3.5 pt-2">
              <div className="flex bg-card rounded-xl p-1 border border-border/30">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      "flex-1 py-2.5 text-[12px] font-semibold rounded-lg transition-all duration-200",
                      activeTab === t.key
                        ? "bg-foreground text-background shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

        <div className={cn("flex-1 px-4 pt-4 pb-28 min-h-0", activeTab === "cupons" ? "overflow-hidden" : "overflow-y-auto scrollbar-none")}>
          {activeTab === "cupons" ? (
            <AdminCupons tenantId={resolvedTenantId} />
          ) : (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : mainPromo ? (
                <>
                  <button
                    onClick={() => openMobileEdit(mainPromo)}
                    className="w-full rounded-2xl border border-border/30 bg-card/80 overflow-hidden shadow-sm p-4 flex items-center gap-3.5 text-left active:bg-muted/20 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-red)" }}
                    >
                      <Gift className="w-4.5 h-4.5 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-foreground truncate">
                          {mainPromo.nome}
                        </span>
                        <span className={cn(
                          "text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide uppercase shrink-0",
                          mainPromo.ativo
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted/40 text-muted-foreground border border-border/30"
                        )}>
                          {mainPromo.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        A cada {mainPromo.pontos_necessarios} cortes → 1 grátis
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  </button>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/30">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">
                        {mainPromo.ativo ? "Programa ativo" : "Programa inativo"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {mainPromo.ativo
                          ? "Clientes estão acumulando pontos"
                          : "Ative para os clientes verem o programa"}
                      </p>
                    </div>
                    <Switch
                      checked={mainPromo.ativo}
                      onCheckedChange={() => handleTogglePromo(mainPromo.id, mainPromo.ativo)}
                    />
                  </div>

                  <button
                    onClick={() => handleDeletePromo(mainPromo.id, mainPromo.nome)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-destructive/30 text-destructive text-[12px] font-medium hover:bg-destructive/10 active:scale-[0.98] transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir promoção
                  </button>
                </>
              ) : (
                <div className="text-center py-20 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border/20 flex items-center justify-center mx-auto">
                    <Gift className="w-6 h-6 text-muted-foreground/30" strokeWidth={1.5} />
                  </div>
                  <p className="text-[12px] text-muted-foreground">Nenhuma promoção configurada</p>
                  {resolvedTenantId ? (
                    <Button
                      onClick={handleCreateDefaultFidelity}
                      className="h-8 px-4 text-[11px]"
                      variant="outline"
                    >
                      Criar plano padrão
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70">Barbearia não identificada</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Desktop Layout ─── */
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {singleTab && (
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <CurvedBackArrow className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {singleTab ? screenTitle : "Promoções e Cupons"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {singleTab ? screenSubtitle : "Gerencie cupons de desconto e o programa de fidelidade"}
          </p>
        </div>
      </div>

      {!singleTab && (
        <div className="flex items-center gap-6 border-b border-border/30 pb-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "pb-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px]",
                activeTab === t.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/70"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}


      {activeTab === "cupons" ? (
        <AdminCupons tenantId={resolvedTenantId} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/30">
              <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Total</span>
              <span className="text-xs font-bold text-foreground">{promocoes.length}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Ativos</span>
              <span className="text-xs font-bold text-foreground">{activePromos}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/30">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
              <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Inativos</span>
              <span className="text-xs font-bold text-foreground">{inactivePromos}</span>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-border/30 bg-card p-12 text-center">
              <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mainPromo ? (
            <div className="grid grid-cols-1 gap-3 max-w-xl">
              <div className="group rounded-xl border border-border/30 bg-card p-4 transition-all duration-200 hover:border-border/60 hover:shadow-md">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Gift className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-semibold text-foreground truncate">{mainPromo.nome}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {mainPromo.pontos_necessarios} {mainPromo.pontos_necessarios === 1 ? "corte" : "cortes"} → 1 grátis
                    </p>
                  </div>
                </div>

                {mainPromo.descricao && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                    {mainPromo.descricao}
                  </p>
                )}

                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border",
                    mainPromo.ativo
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      : "bg-muted/30 text-muted-foreground border-border/30"
                  )}>
                    {mainPromo.ativo ? "Ativo" : "Inativo"}
                  </span>
                  {mainPromo.weekly_required && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/20 border border-border/20 text-[10px] text-muted-foreground">
                      Semanal
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-border/20">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={mainPromo.ativo}
                      onCheckedChange={() => handleTogglePromo(mainPromo.id, mainPromo.ativo)}
                      className="scale-90"
                    />
                    <button
                      onClick={() => handleDeletePromo(mainPromo.id, mainPromo.nome)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-destructive opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10"
                      title="Excluir promoção"
                    >
                      <Trash2 className="w-3 h-3" />
                      Excluir
                    </button>
                  </div>
                  <button
                    onClick={() => { setEditingPromo(mainPromo); setEditModalOpen(true); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-muted/40 hover:text-foreground"
                  >
                    <Pencil className="w-3 h-3" />
                    Editar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/30 bg-card p-12 text-center">
              <Gift className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" strokeWidth={1} />
              <p className="text-sm text-muted-foreground">Nenhuma promoção configurada</p>
              {resolvedTenantId ? (
                <Button
                  onClick={handleCreateDefaultFidelity}
                  variant="outline"
                  className="mt-4"
                >
                  Criar plano padrão
                </Button>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground/70">Barbearia não identificada</p>
              )}
            </div>
          )}
        </div>
      )}

      <EditPromotionModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        promocao={editingPromo}
        onSuccess={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}
