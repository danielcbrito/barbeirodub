import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { useSavePlano, useDeletePlano } from "@/hooks/useAdminMutations";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, Plus, Crown, Clock, Search, ChevronRight,
  DollarSign, Trash2, Check, Calendar, Users,
  Scissors, X,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminAssinaturas } from "./AdminAssinaturas";

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  limite_agendamentos_mes: number | null;
  prioridade_agendamento: number | null;
  beneficios_json: string[] | null;
  ativo: boolean;
  servico_id: string | null;
  controle_vagas_ativo?: boolean | null;
  vagas?: number | null;
}

interface ServicoOption {
  id: string;
  nome: string;
  preco?: number | null;
  duracao_minutos?: number | null;
}

interface AdminPlanosProps {
  tenantId?: string;
  basePath?: string;
  /** Oculta o cabeçalho interno quando embutido em outra tela */
  hideHeader?: boolean;
}

/** Cores para a barra lateral de cada plano */
const PLAN_COLORS = [
  "bg-amber-500", "bg-violet-400", "bg-rose-400", "bg-emerald-400",
  "bg-sky-400", "bg-orange-400", "bg-pink-400", "bg-teal-400",
];

function getPlanColor(index: number) {
  return PLAN_COLORS[index % PLAN_COLORS.length];
}

export function AdminPlanos({ tenantId, basePath = "/admin", hideHeader = false }: AdminPlanosProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isCreating = searchParams.get("novo") === "1";

  const [searchQuery, setSearchQuery] = useState("");
  const [localSearch, setLocalSearch] = useState(""); // Local search for the thicker input
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planoToDelete, setPlanoToDelete] = useState<Plano | null>(null);

  const [formData, setFormData] = useState({
    nome: "", descricao: "", preco_mensal: "", limite_agendamentos_mes: "4",
    prioridade_agendamento: "0", beneficios_json: [""], ativo: true, servico_id: "",
    servico_ids: [] as string[],
    controle_vagas_ativo: false, vagas: "",
  });
  const [activeTab, setActiveTab] = useState("planos");
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.admin.planos(resolvedTenantId);

  // Mutation hooks
  const saveMutation = useSavePlano(resolvedTenantId);
  const deletePlanMutation = useDeletePlano(resolvedTenantId);

  useEffect(() => { setResolvedTenantId(tenantId ?? null); }, [tenantId]);

  // useQuery for planos
  const { data: planos = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("planos")
        .select("id, nome, descricao, preco_mensal, limite_agendamentos_mes, prioridade_agendamento, beneficios_json, ativo, servico_id, controle_vagas_ativo, vagas")
        .order("prioridade_agendamento", { ascending: false });
      if (resolvedTenantId) { query = query.eq("tenant_id", resolvedTenantId); }
      else { query = query.is("tenant_id", null); }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(plano => ({
        ...plano,
        beneficios_json: Array.isArray(plano.beneficios_json)
          ? plano.beneficios_json
          : typeof plano.beneficios_json === 'string'
          ? JSON.parse(plano.beneficios_json)
          : []
      })) as Plano[];
    },
    staleTime: STALE_TIMES.SERVICOS,
    enabled: !!resolvedTenantId || resolvedTenantId === null,
  });

  // Fetch servicos do tenant (carrossel multi-seleção)
  const { data: servicos = [] } = useQuery({
    queryKey: ["admin", "servicos-options", resolvedTenantId],
    queryFn: async () => {
      if (!resolvedTenantId) return [];
      const { data, error } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao_minutos")
        .eq("tenant_id", resolvedTenantId)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as ServicoOption[];
    },
    staleTime: STALE_TIMES.SERVICOS,
    enabled: !!resolvedTenantId,
  });

  // Vínculos plano ↔ múltiplos serviços
  const { data: planoServicosMap = {} } = useQuery({
    queryKey: ["admin", "plano-servicos", resolvedTenantId, planos.map((p) => p.id).join(",")],
    queryFn: async () => {
      const ids = planos.map((p) => p.id);
      if (ids.length === 0) return {} as Record<string, string[]>;
      const { data, error } = await supabase
        .from("plano_servicos")
        .select("plano_id, servico_id")
        .in("plano_id", ids);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data || []).forEach((r: { plano_id: string; servico_id: string }) => {
        (map[r.plano_id] ||= []).push(r.servico_id);
      });
      return map;
    },
    enabled: planos.length > 0,
    staleTime: STALE_TIMES.SERVICOS,
  });

  // Realtime invalidation
  useEffect(() => {
    const channelId = `admin-planos-${resolvedTenantId || 'global'}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "planos",
        ...(resolvedTenantId ? { filter: `tenant_id=eq.${resolvedTenantId}` } : {}),
      }, () => queryClient.invalidateQueries({ queryKey }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [resolvedTenantId, queryClient, queryKey]);

  // Populate form when editing
  useEffect(() => {
    if (editId && planos.length > 0) {
      const p = planos.find(pl => pl.id === editId);
      if (p) {
        const linkedServicos = planoServicosMap[p.id] || (p.servico_id ? [p.servico_id] : []);
        setFormData({
          nome: p.nome,
          descricao: p.descricao || "",
          preco_mensal: p.preco_mensal.toString(),
          limite_agendamentos_mes: (p.limite_agendamentos_mes || 4).toString(),
          prioridade_agendamento: (p.prioridade_agendamento || 0).toString(),
          beneficios_json: p.beneficios_json && p.beneficios_json.length > 0 ? p.beneficios_json : [""],
          ativo: p.ativo,
          servico_id: p.servico_id || "",
          servico_ids: linkedServicos,
          controle_vagas_ativo: !!p.controle_vagas_ativo,
          vagas: p.vagas != null ? String(p.vagas) : "",
        });
      }
    }
    if (isCreating) {
      setFormData({ nome: "", descricao: "", preco_mensal: "", limite_agendamentos_mes: "4", prioridade_agendamento: "0", beneficios_json: [""], ativo: true, servico_id: "", servico_ids: [], controle_vagas_ativo: false, vagas: "" });
    }
  }, [editId, isCreating, planos, planoServicosMap]);

  useEffect(() => {
    const resolveTenantId = async () => {
      if (resolvedTenantId) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      const [{ data: barberRow }, { data: ownerTenant }] = await Promise.all([
        supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        resolveOldestOwnedTenant<{ id: string }>(userId, "id"),
      ]);

      setResolvedTenantId(barberRow?.tenant_id || ownerTenant?.id || null);
    };

    resolveTenantId();
  }, [resolvedTenantId]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return planos;
    const q = searchQuery.toLowerCase();
    return planos.filter(p => p.nome.toLowerCase().includes(q));
  }, [planos, searchQuery]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.preco_mensal) {
      toast.error("Preencha nome e preço do plano");
      return;
    }
    const payload: Record<string, unknown> = {
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim() || null,
      preco_mensal: parseFloat(formData.preco_mensal),
      limite_agendamentos_mes: parseInt(formData.limite_agendamentos_mes) || 4,
      prioridade_agendamento: parseInt(formData.prioridade_agendamento) || 0,
      beneficios_json: formData.beneficios_json.filter(b => b.trim() !== ""),
      ativo: formData.ativo,
      // Mantém compat: grava o primeiro serviço como servico_id "principal"
      servico_id: formData.servico_ids[0] || null,
      controle_vagas_ativo: formData.controle_vagas_ativo,
      vagas: formData.controle_vagas_ativo
        ? (parseInt(formData.vagas, 10) > 0 ? parseInt(formData.vagas, 10) : null)
        : null,
    };
    if (formData.controle_vagas_ativo && !payload.vagas) {
      toast.error("Defina o número de vagas (mínimo 1) ou desative o controle de vagas");
      return;
    }
    if (resolvedTenantId) payload.tenant_id = resolvedTenantId;

    saveMutation.mutate(
      { id: editId, payload, servicoIds: formData.servico_ids },
      { onSuccess: () => goBack() },
    );
  };

  const handleDelete = () => {
    if (!planoToDelete) return;
    deletePlanMutation.mutate(planoToDelete.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setPlanoToDelete(null);
        if (editId === planoToDelete.id) goBack();
      },
      onError: () => setDeleteDialogOpen(false),
    });
  };

  const goBack = () => {
    setSearchParams({});
  };

  const openEdit = (id: string) => {
    setSearchParams({ edit: id });
  };

  const openCreate = () => {
    setSearchParams({ novo: "1" });
  };

  const addBeneficio = () => {
    setFormData(prev => ({ ...prev, beneficios_json: [...prev.beneficios_json, ""] }));
  };

  const updateBeneficio = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      beneficios_json: prev.beneficios_json.map((b, i) => i === index ? value : b),
    }));
  };

  const removeBeneficio = (index: number) => {
    setFormData(prev => ({
      ...prev,
      beneficios_json: prev.beneficios_json.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════
  // EDIT / CREATE FULL-PAGE VIEW
  // ═══════════════════════════════════
  if (editId || isCreating) {
    const editingPlano = editId ? planos.find(p => p.id === editId) : null;
    const pageTitle = editId ? (editingPlano?.nome || "Editar Plano") : "Novo Plano";
    const charCount = formData.nome.length;

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <button
              onClick={goBack}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">{pageTitle}</h1>
          </div>
        </div>

        <form onSubmit={handleSave} className="px-4 pt-4 space-y-7">
          {/* ─────────── 1. IDENTIDADE ─────────── */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <p className="text-[11px] font-semibold text-foreground/90 uppercase tracking-[0.12em]">Identidade</p>
              <span className="text-[10px] text-muted-foreground/40">{charCount}/50</span>
            </div>
            <Input
              value={formData.nome}
              onChange={e => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Nome do plano"
              maxLength={50}
              className="h-13 text-[16px] font-semibold bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30 placeholder:font-normal"
              required
            />
            <Textarea
              value={formData.descricao}
              onChange={e => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição curta exibida ao cliente"
              rows={2}
              className="text-[13.5px] bg-transparent border-border/40 rounded-xl px-4 py-3 resize-none placeholder:text-muted-foreground/30 leading-relaxed"
            />
          </section>

          {/* ─────────── 2. PREÇO & LIMITES ─────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold text-foreground/90 uppercase tracking-[0.12em] px-1">Preço & limites</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/40 px-4 py-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-1.5">Mensalidade</p>
                <div className="flex items-center gap-1">
                  <span className="text-[13px] text-muted-foreground/60 font-medium">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.preco_mensal}
                    onChange={e => setFormData({ ...formData, preco_mensal: e.target.value })}
                    placeholder="0,00"
                    className="h-7 p-0 text-[18px] font-bold bg-transparent border-0 focus-visible:ring-0 placeholder:text-muted-foreground/30"
                    required
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border/40 px-4 py-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-1.5">Cortes/mês</p>
                <Input
                  type="number"
                  min="1"
                  value={formData.limite_agendamentos_mes}
                  onChange={e => setFormData({ ...formData, limite_agendamentos_mes: e.target.value })}
                  placeholder="4"
                  className="h-7 p-0 text-[18px] font-bold bg-transparent border-0 focus-visible:ring-0 placeholder:text-muted-foreground/30"
                />
              </div>
            </div>
          </section>

          {/* ─────────── 3. SERVIÇOS INCLUSOS ─────────── */}
          {servicos.length > 0 && (
            <section className="space-y-3">
              <p className="text-[11px] font-semibold text-foreground/90 uppercase tracking-[0.12em] px-1">Serviços inclusos</p>
              <button
                type="button"
                onClick={() => setServicePickerOpen(true)}
                className="w-full min-h-14 rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-left flex items-center gap-3 hover:bg-secondary/30 active:scale-[0.99] transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center flex-shrink-0">
                  <Scissors className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {formData.servico_ids.length === 0 ? (
                    <p className="text-[14px] text-muted-foreground/60">Selecionar serviços</p>
                  ) : (
                    <>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                        {formData.servico_ids.length} serviço{formData.servico_ids.length > 1 ? "s" : ""}
                      </p>
                      <p className="text-[13.5px] font-semibold text-foreground truncate">
                        {servicos.filter((s) => formData.servico_ids.includes(s.id)).map((s) => s.nome).join(", ")}
                      </p>
                    </>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              </button>
            </section>
          )}

          {/* ─────────── 4. BENEFÍCIOS ─────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold text-foreground/90 uppercase tracking-[0.12em]">Benefícios</p>
              <button
                type="button"
                onClick={addBeneficio}
                className="text-[11px] font-semibold text-foreground hover:text-foreground/70 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {formData.beneficios_json.map((beneficio, index) => (
                <div key={index} className="relative">
                  <Input
                    placeholder={`Benefício ${index + 1}`}
                    value={beneficio}
                    onChange={e => updateBeneficio(index, e.target.value)}
                    className={cn(
                      "h-11 text-[14px] bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30",
                      formData.beneficios_json.length > 1 && "pr-10",
                    )}
                  />
                  {formData.beneficios_json.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBeneficio(index)}
                      aria-label={`Remover benefício ${index + 1}`}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-secondary/50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ─────────── 5. PUBLICAÇÃO ─────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold text-foreground/90 uppercase tracking-[0.12em] px-1">Publicação</p>

            {/* Plano ativo */}
            <div className="flex items-center justify-between rounded-xl border border-border/40 px-4 py-3.5">
              <div className="pr-3 min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground">Plano ativo</p>
                <p className="text-[11px] font-light text-muted-foreground/80 mt-0.5 leading-snug">
                  {formData.ativo ? "Visível para clientes" : "Oculto — não aparece para clientes"}
                </p>
              </div>
              <Switch
                checked={formData.ativo}
                onCheckedChange={checked => setFormData({ ...formData, ativo: checked })}
                className={cn(formData.ativo && "data-[state=checked]:bg-emerald-600")}
              />
            </div>


            {/* Controle de vagas */}
            <div className={cn(
              "rounded-xl border transition-colors",
              formData.controle_vagas_ativo
                ? "border-foreground/20 bg-secondary/30"
                : "border-border/40 bg-transparent",
            )}>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="pr-3 min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Limitar vagas
                  </p>
                  <p className="text-[11px] font-light text-muted-foreground/80 mt-0.5 leading-snug">
                    {formData.controle_vagas_ativo
                      ? "Esgotando, o plano fica transparente no app"
                      : "Vagas ilimitadas"}
                  </p>
                </div>
                <Switch
                  checked={formData.controle_vagas_ativo}
                  onCheckedChange={checked => setFormData({ ...formData, controle_vagas_ativo: checked })}
                  className={cn(formData.controle_vagas_ativo && "data-[state=checked]:bg-emerald-600")}
                />
              </div>

              <AnimatePresence initial={false}>
                {formData.controle_vagas_ativo && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden border-t border-border/30"
                  >
                    <div className="px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
                          Número de vagas
                        </label>
                        <div className="flex gap-1.5">
                          {[5, 10, 20, 50].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setFormData({ ...formData, vagas: String(preset) })}
                              className={cn(
                                "h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors",
                                String(preset) === formData.vagas
                                  ? "bg-foreground text-background"
                                  : "bg-background/50 text-muted-foreground hover:text-foreground border border-border/40",
                              )}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <Input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={formData.vagas}
                        onChange={e => setFormData({ ...formData, vagas: e.target.value })}
                        placeholder="Ex: 10"
                        className="h-12 text-[18px] font-bold text-center bg-background/60 border-border/40 rounded-xl placeholder:text-muted-foreground/30 placeholder:font-normal placeholder:text-[15px]"
                      />

                      <p className="text-[10.5px] text-muted-foreground/60 leading-snug px-0.5">
                        Quando um cliente cancelar, a vaga libera automaticamente.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Footer: botões */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 py-3 flex items-center gap-3 lg:static lg:border-t-0 lg:px-0 lg:pt-4">
            {editId && (
              <button
                type="button"
                onClick={() => {
                  const p = planos.find(pl => pl.id === editId);
                  if (p) { setPlanoToDelete(p); setDeleteDialogOpen(true); }
                }}
                aria-label="Remover plano"
                className="w-12 h-12 rounded-xl border border-border/50 bg-transparent flex items-center justify-center text-foreground/70 hover:text-foreground hover:border-foreground/40 hover:bg-secondary/40 active:scale-95 transition-all flex-shrink-0"
              >
                <Trash2 className="w-[18px] h-[18px]" strokeWidth={1.6} />
              </button>
            )}
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 h-12 rounded-xl text-[14px] font-semibold bg-foreground text-background hover:bg-foreground/90 active:scale-[0.99] transition-all flex items-center justify-center disabled:opacity-60 disabled:pointer-events-none"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? "Salvar alterações" : "Criar plano")}
            </button>
          </div>
        </form>

        {/* Delete dialog (edit context) */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[14px]">Remover plano</AlertDialogTitle>
              <AlertDialogDescription className="text-[12px]">
                Remover <span className="text-foreground font-medium">{planoToDelete?.nome}</span> permanentemente?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-[12px]">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="h-9 text-[12px] bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Overlay carrossel de seleção de serviços (multi) */}
        <ServiceCarouselPicker
          open={servicePickerOpen}
          onClose={() => setServicePickerOpen(false)}
          servicos={servicos}
          selectedIds={formData.servico_ids}
          onToggle={(id) => {
            setFormData((prev) => ({
              ...prev,
              servico_ids: prev.servico_ids.includes(id)
                ? prev.servico_ids.filter((x) => x !== id)
                : [...prev.servico_ids, id],
            }));
          }}
        />
      </div>
    );
  }

  // ═══════════════════════════════════
  // PLAN LISTING PAGE
  // ═══════════════════════════════════
  return (
    <div className="pb-28 lg:pb-8">
      {/* Mobile layout */}
      {isMobile ? (
        <div className="-mx-3 -mt-3">
          {/* Header */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
            {!hideHeader && (
            <div className="flex items-center gap-2.5 px-4 h-14">
              <button
                onClick={() => navigate(`${basePath}/configuracoes-perfil`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
                aria-label="Voltar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a4 4 0 0 1 4 4v1" />
                </svg>
              </button>
              <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Planos e Assinaturas</h1>
            </div>
            )}

            {/* Search */}
            <div className="px-5 py-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar planos..."
                  className="w-full h-14 pl-12 pr-4 bg-secondary/30 border border-border/30 rounded-2xl text-[15px] font-normal text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Plan list */}
          <div className="px-4 pt-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Crown className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  {searchQuery ? "Nenhum plano encontrado" : "Nenhum plano cadastrado"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                <AnimatePresence mode="popLayout">
                  {filtered.map((plano, index) => {
                    const benefits = plano.beneficios_json || [];
                    return (
                      <motion.button
                        key={plano.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.02 }}
                        onClick={() => openEdit(plano.id)}
                        className={cn(
                          "w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors",
                          !plano.ativo && "opacity-50"
                        )}
                      >
                        {/* Color bar */}
                        <div className={cn("w-1 h-10 rounded-full flex-shrink-0", getPlanColor(index))} />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[14px] font-medium text-foreground truncate">{plano.nome}</p>
                            {!plano.ativo && (
                              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Inativo</span>
                            )}
                          </div>
                          <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                            {plano.limite_agendamentos_mes ? `${plano.limite_agendamentos_mes} agend./mês` : "Ilimitado"}
                            {benefits.length > 0 && ` · ${benefits.length} benefício${benefits.length > 1 ? "s" : ""}`}
                          </p>
                        </div>

                        {/* Price + chevron */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[14px] font-semibold text-foreground">
                            R$ {plano.preco_mensal.toFixed(2).replace(".", ",")}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40" strokeWidth={1.8} />
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* FAB Adicionar */}
          <div className="fixed bottom-6 right-5 z-40">
            <button
              onClick={openCreate}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-foreground text-background shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        /* ═══ DESKTOP LAYOUT ═══ */
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/30 border border-border/30 mb-5">
            <TabsTrigger value="planos" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <Crown className="w-3.5 h-3.5" />
              Planos
            </TabsTrigger>
            <TabsTrigger value="assinaturas" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <Users className="w-3.5 h-3.5" />
              Clientes com Plano
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planos">
            <DesktopPlanList
              planos={filtered}
              allPlanos={planos}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onEdit={openEdit}
              onCreate={openCreate}
              onDelete={(p) => { setPlanoToDelete(p); setDeleteDialogOpen(true); }}
            />
          </TabsContent>

          <TabsContent value="assinaturas">
            <AdminAssinaturas tenantId={resolvedTenantId} />
          </TabsContent>
        </Tabs>
      )}

      {/* Delete dialog (listing context) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px]">Remover plano</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Remover <span className="text-foreground font-medium">{planoToDelete?.nome}</span> permanentemente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-[12px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="h-9 text-[12px] bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═══════════════════════════════════ */
/* Desktop Plan List                   */
/* ═══════════════════════════════════ */

function DesktopPlanList({
  planos,
  allPlanos,
  searchQuery,
  onSearchChange,
  onEdit,
  onCreate,
  onDelete,
}: {
  planos: Plano[];
  allPlanos: Plano[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
  onDelete: (p: Plano) => void;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Planos e Assinaturas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{allPlanos.length} planos cadastrados</p>
        </div>
        <Button onClick={onCreate} size="sm" className="h-9 px-4 rounded-lg text-xs font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Novo Plano
        </Button>
      </div>

      {/* Search */}
      <div className="px-5 py-4 lg:px-0">
        <div className="relative group max-w-sm lg:max-w-none">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Pesquisar planos..."
            className="w-full h-14 pl-12 pr-4 bg-secondary/30 border border-border/30 rounded-2xl text-[15px] font-normal text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </div>

      {/* List */}
      {planos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <Crown className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "Nenhum plano encontrado" : "Nenhum plano cadastrado"}
          </p>
        </div>
      ) : (
        <div className="border border-border/30 rounded-xl overflow-hidden divide-y divide-border/30">
          {planos.map((plano, index) => {
            const benefits = plano.beneficios_json || [];
            return (
              <button
                key={plano.id}
                onClick={() => onEdit(plano.id)}
                className={cn(
                  "w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-secondary/30 transition-colors",
                  !plano.ativo && "opacity-50"
                )}
              >
                <div className={cn("w-1 h-10 rounded-full flex-shrink-0", getPlanColor(index))} />
                <Crown className={cn("w-5 h-5 flex-shrink-0", plano.ativo ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{plano.nome}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {plano.limite_agendamentos_mes ? `${plano.limite_agendamentos_mes} agend./mês` : "Ilimitado"}
                    {benefits.length > 0 && ` · ${benefits.length} benefício${benefits.length > 1 ? "s" : ""}`}
                  </p>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
                  R$ {plano.preco_mensal.toFixed(2).replace(".", ",")}
                  <span className="text-xs font-normal text-muted-foreground/50">/mês</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ServiceCarouselPicker
   Carrossel vertical full-screen com fundo borrado para
   seleção MÚLTIPLA de serviços vinculados a um plano.
   Mesmo padrão visual do BarberCarouselPicker.
   ═══════════════════════════════════════════════════════════ */

interface ServiceCarouselPickerProps {
  open: boolean;
  onClose: () => void;
  servicos: ServicoOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

function ServiceCarouselPicker({
  open,
  onClose,
  servicos,
  selectedIds,
  onToggle,
}: ServiceCarouselPickerProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: "y",
    align: "center",
    containScroll: false,
    loop: false,
    duration: 22,
  });
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelectEmbla = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelectEmbla);
    emblaApi.on("reInit", onSelectEmbla);
    onSelectEmbla();
    return () => {
      emblaApi.off("select", onSelectEmbla);
      emblaApi.off("reInit", onSelectEmbla);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!open || !emblaApi) return;
    const firstSelectedIdx = servicos.findIndex((s) => selectedIds.includes(s.id));
    const targetIndex = firstSelectedIdx >= 0 ? firstSelectedIdx : 0;
    requestAnimationFrame(() => {
      emblaApi.reInit();
      emblaApi.scrollTo(targetIndex, true);
      setCurrentIndex(targetIndex);
    });
    // selectedIds intencionalmente fora das deps — só posiciona ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emblaApi, servicos]);

  const activeServico = servicos[currentIndex];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60]"
          onClick={onClose}
        >
          {/* Fundo borrado */}
          <div className="absolute inset-0 bg-background/10 backdrop-blur-md" />

          {/* Header — contagem */}
          <div
            className="absolute top-0 left-0 right-0 z-20 px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 flex items-center justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-background/60 backdrop-blur-md border border-border/30 flex items-center justify-center text-foreground"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-[12px] font-semibold text-foreground bg-background/60 backdrop-blur-md border border-border/30 rounded-full px-3 py-1.5">
              {selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Viewport */}
          <div
            ref={emblaRef}
            className="absolute inset-0 z-10 overflow-hidden touch-pan-y"
            style={{ paddingBottom: "18vh", paddingTop: "10vh" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <div className="flex h-full flex-col">
              {servicos.map((servico, idx) => {
                const isActive = idx === currentIndex;
                const distance = Math.abs(idx - currentIndex);
                const isSelected = selectedIds.includes(servico.id);
                return (
                  <div
                    key={servico.id}
                    className="flex-[0_0_140px] min-h-0 flex items-center justify-center px-5"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) {
                          onToggle(servico.id);
                        } else {
                          emblaApi?.scrollTo(idx);
                        }
                      }}
                      className={cn(
                        "w-full max-w-[320px] h-[110px] rounded-3xl border backdrop-blur-md flex items-center gap-4 px-5 text-left",
                        "transition-all duration-300 ease-out will-change-transform",
                        isActive
                          ? cn(
                              "shadow-2xl scale-100 opacity-100",
                              isSelected
                                ? "bg-foreground text-background border-foreground"
                                : "bg-card/95 text-foreground border-foreground/30",
                            )
                          : distance === 1
                            ? "bg-card/50 border-border/20 scale-90 opacity-40"
                            : "bg-card/30 border-border/10 scale-[0.78] opacity-[0.15]",
                      )}
                    >
                      <div
                        className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0",
                          isActive && isSelected
                            ? "bg-background/15"
                            : "bg-foreground/10",
                        )}
                      >
                        <Scissors className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-[0.2em] mb-1",
                            isActive && isSelected
                              ? "text-background/70"
                              : "text-muted-foreground",
                          )}
                        >
                          Serviço
                        </p>
                        <h3 className="text-[17px] font-bold leading-tight truncate">
                          {servico.nome}
                        </h3>
                        {servico.preco != null && (
                          <p
                            className={cn(
                              "text-[11px] mt-0.5",
                              isActive && isSelected
                                ? "text-background/70"
                                : "text-muted-foreground",
                            )}
                          >
                            R$ {Number(servico.preco).toFixed(2).replace(".", ",")}
                            {servico.duracao_minutos
                              ? ` · ${servico.duracao_minutos}min`
                              : ""}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <div
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                            isSelected
                              ? "bg-background text-foreground"
                              : "border-2 border-foreground/30",
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botão fixo de confirmar / continuar adicionando */}
          <div
            className="absolute bottom-0 left-0 right-0 z-20 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              onClick={() => {
                if (activeServico) {
                  // Toggle do ativo se ainda não estiver selecionado, depois fecha
                  if (!selectedIds.includes(activeServico.id)) {
                    onToggle(activeServico.id);
                  }
                }
                onClose();
              }}
              disabled={!activeServico}
              className="w-full h-12 rounded-xl bg-foreground/90 text-background hover:bg-foreground/95 font-semibold shadow-lg"
            >
              {selectedIds.length > 0 ? "Confirmar seleção" : "Adicionar este serviço"}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
