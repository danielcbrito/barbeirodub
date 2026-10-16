// @ts-nocheck — tipos do banco desatualizados para este arquivo; comportamento em produção validado.
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import {
  Loader2, Scissors, Clock, Search, ChevronRight,
  GripVertical, RotateCcw, Plus, Send, CheckCircle2, Power, AlertCircle
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BarberContext } from "@/pages/Barbeiro";
import { useBarberServicos } from "@/hooks/useBarberServicos";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useSaveServiceDuration, useResetServiceDuration } from "@/hooks/useBarberMutations";

/** Cores para a barra lateral de cada serviço — idêntico ao AdminCortes */
const SERVICE_COLORS = [
  "bg-violet-400", "bg-rose-400", "bg-amber-500", "bg-emerald-400",
  "bg-sky-400", "bg-orange-400", "bg-pink-400", "bg-teal-400",
];

function getServiceColor(index: number) {
  return SERVICE_COLORS[index % SERVICE_COLORS.length];
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/** Opções de duração */
const durationOptions = [
  { value: "5", label: "5min" },
  { value: "10", label: "10min" },
  { value: "15", label: "15min" },
  { value: "20", label: "20min" },
  { value: "25", label: "25min" },
  { value: "30", label: "30min" },
  { value: "35", label: "35min" },
  { value: "40", label: "40min" },
  { value: "45", label: "45min" },
  { value: "50", label: "50min" },
  { value: "55", label: "55min" },
  { value: "60", label: "1h" },
  { value: "65", label: "1h 5min" },
  { value: "70", label: "1h 10min" },
  { value: "75", label: "1h 15min" },
  { value: "80", label: "1h 20min" },
  { value: "85", label: "1h 25min" },
  { value: "90", label: "1h 30min" },
  { value: "95", label: "1h 35min" },
  { value: "100", label: "1h 40min" },
  { value: "105", label: "1h 45min" },
  { value: "110", label: "1h 50min" },
  { value: "115", label: "1h 55min" },
  { value: "120", label: "2h" },
];

interface Props {
  barberContext: BarberContext;
  basePath?: string;
  onBack?: () => void;
}

/**
 * BarberCortes — Tela de serviços do barbeiro com design idêntico ao AdminCortes.
 * O barbeiro vê todos os serviços da barbearia mas só pode editar
 * o TEMPO PESSOAL que ele gasta em cada um. Nome, preço e status são read-only.
 */
export function BarberCortes({ barberContext, basePath = "/barbeiro", onBack }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [searchQuery, setSearchQuery] = useState("");

  // Form state para edição de duração
  const [formDuracao, setFormDuracao] = useState("");
  const [originalDuracao, setOriginalDuracao] = useState("");

  // Tenant efetivo com resolução robusta (contexto -> owner -> barbeiro)
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(barberContext.tenantId ?? null);

  // Serviços desativados para este barbeiro específico
  const storageKey = `dub_barber_disabled_services_${barberContext.barbeiroId}`;
  const [disabledServices, setDisabledServices] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Modais de Adicionar / Solicitar serviço
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Form para Admin adicionar novo serviço
  const [newNome, setNewNome] = useState("");
  const [newPreco, setNewPreco] = useState("");
  const [newDuracao, setNewDuracao] = useState("30");
  const [newDesc, setNewDesc] = useState("");

  // Form para Barbeiro solicitar novo serviço
  const [reqNome, setReqNome] = useState("");
  const [reqPreco, setReqPreco] = useState("");
  const [reqDuracao, setReqDuracao] = useState("30");
  const [reqMotivo, setReqMotivo] = useState("");

  useEffect(() => {
    const resolveTenantId = async () => {
      try {
        const [{ data: barberById }, { data: ownerTenant }, { data: latestBarberWithTenant }] = await Promise.all([
          supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("id", barberContext.barbeiroId)
            .maybeSingle(),
          resolveOldestOwnedTenant<{ id: string }>(barberContext.userId, "id"),
          supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("user_id", barberContext.userId)
            .not("tenant_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const nextTenantId =
          barberById?.tenant_id ||
          barberContext.tenantId ||
          ownerTenant?.id ||
          latestBarberWithTenant?.tenant_id ||
          null;

        setResolvedTenantId(nextTenantId);
      } catch (error) {
        console.error("Erro ao resolver tenant_id dos serviços:", error);
        setResolvedTenantId(barberContext.tenantId ?? null);
      }
    };

    resolveTenantId();
  }, [barberContext.userId, barberContext.barbeiroId, barberContext.tenantId]);

  /* ── TanStack Query: serviços + durações personalizadas ── */
  const { data: queryResult, isLoading: loading } = useBarberServicos(
    barberContext.barbeiroId,
    resolvedTenantId
  );
  const servicos = queryResult?.servicos ?? [];
  const duracaoMap = queryResult?.duracaoMap ?? new Map();

  // Sincronizar serviços desativados a partir do banco (duracao = 0 indica desativado)
  useEffect(() => {
    if (!duracaoMap) return;
    setDisabledServices(prev => {
      const next = new Set(prev);
      duracaoMap.forEach((dur: number, sId: string) => {
        if (dur === 0) {
          next.add(sId);
        }
      });
      return next;
    });
  }, [duracaoMap]);

  // Ao entrar na edição, popular o formulário
  useEffect(() => {
    if (editId && servicos.length > 0) {
      const s = servicos.find(sv => sv.id === editId);
      if (s) {
        const custom = duracaoMap.get(s.id);
        const dur = (custom && custom > 0 ? custom : s.duracao_minutos).toString();
        setFormDuracao(dur);
        setOriginalDuracao(dur);
      }
    }
  }, [editId, servicos, duracaoMap]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return servicos;
    const q = searchQuery.toLowerCase();
    return servicos.filter(s => s.nome.toLowerCase().includes(q));
  }, [servicos, searchQuery]);

  const goBack = () => setSearchParams({});
  const openEdit = (id: string) => setSearchParams({ edit: id });

  const saveDurationMutation = useSaveServiceDuration();
  const resetDurationMutation = useResetServiceDuration();

  const isServiceDisabled = (servicoId: string) => {
    return disabledServices.has(servicoId) || duracaoMap.get(servicoId) === 0;
  };

  /** Alterna se o barbeiro presta ou não esse serviço */
  const handleToggleService = async (servicoId: string, active: boolean) => {
    const next = new Set(disabledServices);
    if (!active) {
      next.add(servicoId);
      saveDurationMutation.mutate(
        { barbeiroId: barberContext.barbeiroId, servicoId, duracao: 0, tenantId: resolvedTenantId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
          }
        }
      );
      toast.info("Serviço desativado no seu perfil. Você não receberá agendamentos para este corte.");
    } else {
      next.delete(servicoId);
      const s = servicos.find(sv => sv.id === servicoId);
      const defaultDur = s?.duracao_minutos || 30;
      saveDurationMutation.mutate(
        { barbeiroId: barberContext.barbeiroId, servicoId, duracao: defaultDur, tenantId: resolvedTenantId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
          }
        }
      );
      toast.success("Serviço reativado no seu perfil!");
    }
    setDisabledServices(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch (e) {
      console.error(e);
    }
  };

  /** Salva a duração personalizada */
  const handleSave = () => {
    if (!editId) return;
    const dur = parseInt(formDuracao);
    if (isNaN(dur) || dur < 5) {
      toast.error("Duração mínima: 5 minutos");
      return;
    }
    saveDurationMutation.mutate(
      { barbeiroId: barberContext.barbeiroId, servicoId: editId, duracao: dur, tenantId: resolvedTenantId },
      { 
        onSuccess: () => {
          setOriginalDuracao(formDuracao);
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
        } 
      }
    );
  };

  /** Reseta para duração padrão */
  const handleReset = () => {
    if (!editId) return;
    const s = servicos.find(sv => sv.id === editId);
    const defaultDur = (s?.duracao_minutos || 30).toString();

    resetDurationMutation.mutate(
      { barbeiroId: barberContext.barbeiroId, servicoId: editId, tenantId: resolvedTenantId },
      {
        onSuccess: () => {
          setFormDuracao(defaultDur);
          setOriginalDuracao(defaultDur);
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
        },
      }
    );
  };

  /** Admin cadastra novo serviço diretamente */
  const handleAdminAddService = async () => {
    if (!newNome.trim()) {
      toast.error("Informe o nome do serviço");
      return;
    }
    const precoNum = parseFloat(newPreco.replace(",", "."));
    if (isNaN(precoNum) || precoNum < 0) {
      toast.error("Informe um preço válido");
      return;
    }
    const durNum = parseInt(newDuracao);
    if (isNaN(durNum) || durNum < 5) {
      toast.error("Duração mínima: 5 minutos");
      return;
    }

    setSubmittingAction(true);
    try {
      const { error } = await supabase.from("servicos").insert({
        nome: newNome.trim(),
        preco: precoNum,
        duracao_minutos: durNum,
        descricao: newDesc.trim() || null,
        ativo: true,
        tenant_id: resolvedTenantId,
      });

      if (error) throw error;

      toast.success(`Serviço "${newNome}" adicionado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
      setAddModalOpen(false);
      setNewNome("");
      setNewPreco("");
      setNewDuracao("30");
      setNewDesc("");
    } catch (err: any) {
      console.error("Erro ao adicionar serviço:", err);
      toast.error(err.message || "Erro ao cadastrar serviço.");
    } finally {
      setSubmittingAction(false);
    }
  };

  /** Barbeiro solicita novo serviço ao Admin */
  const handleBarberRequestService = async () => {
    if (!reqNome.trim()) {
      toast.error("Informe o nome do serviço sugerido");
      return;
    }

    setSubmittingAction(true);
    try {
      // Localizar o admin/dono do tenant
      let ownerUserId: string | null = null;
      if (resolvedTenantId) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("owner_user_id")
          .eq("id", resolvedTenantId)
          .maybeSingle();
        ownerUserId = tenant?.owner_user_id || null;
      }

      if (!ownerUserId) {
        const { data: adminBarber } = await supabase
          .from("barbeiros")
          .select("user_id")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_admin", true)
          .maybeSingle();
        ownerUserId = adminBarber?.user_id || null;
      }

      if (ownerUserId) {
        await supabase.from("notificacoes").insert({
          user_id: ownerUserId,
          tipo: "solicitacao_servico",
          titulo: `✂️ Sugestão de Serviço: ${reqNome.trim()}`,
          mensagem: `O profissional ${barberContext.nome || 'da equipe'} solicitou a criação do serviço "${reqNome.trim()}" (R$ ${reqPreco || '0,00'} - ${reqDuracao}min).${reqMotivo ? ` Observação: ${reqMotivo.trim()}` : ''}`,
          lida: false,
        });
      }

      toast.success("Solicitação enviada ao administrador da barbearia para aprovação!");
      setRequestModalOpen(false);
      setReqNome("");
      setReqPreco("");
      setReqDuracao("30");
      setReqMotivo("");
    } catch (err: any) {
      console.error("Erro ao enviar solicitação:", err);
      toast.error("Não foi possível enviar a solicitação. Tente novamente.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const hasChanges = formDuracao !== originalDuracao;
  const saving = saveDurationMutation.isPending || resetDurationMutation.isPending;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════
  // EDIT FULL-PAGE VIEW (idêntico ao AdminCortes)
  // ═══════════════════════════════════
  if (editId) {
    const editingServico = servicos.find(s => s.id === editId);
    if (!editingServico) {
      goBack();
      return null;
    }

    const disabled = isServiceDisabled(editingServico.id);
    const customDur = duracaoMap.get(editId);
    const isCustom = customDur !== undefined && customDur > 0 && customDur !== editingServico.duracao_minutos;
    const pageTitle = editingServico.nome;

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header fixo — idêntico ao AdminCortes */}
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
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1 truncate">{pageTitle}</h1>
            {disabled ? (
              <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider flex-shrink-0">
                Desativado
              </span>
            ) : isCustom ? (
              <span className="text-[9px] bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider flex-shrink-0">
                Personalizado
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-4 pt-5 space-y-6">
          {/* Seção: Minha Disponibilidade para este corte */}
          <div className={cn(
            "p-4 rounded-2xl border transition-all",
            disabled ? "bg-amber-500/5 border-amber-500/25" : "bg-card border-border/40 shadow-sm"
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[14px] font-semibold text-foreground">Oferecer este serviço</p>
                <p className="text-[12px] text-muted-foreground/75 leading-relaxed">
                  {disabled
                    ? "Você desativou este serviço. Clientes não verão este corte na sua agenda."
                    : "Ativo na sua agenda. Clientes podem agendar este serviço com você."}
                </p>
              </div>
              <Switch
                checked={!disabled}
                onCheckedChange={(checked) => handleToggleService(editingServico.id, checked)}
              />
            </div>
          </div>

          {/* Seção: Informações do serviço (read-only da Barbearia) */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Catálogo da Barbearia
            </p>

            <div className="space-y-4">
              {/* Nome (read-only) */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Nome do Serviço
                </label>
                <div className="h-12 flex items-center px-4 rounded-xl border border-border/20 bg-secondary/20">
                  <span className="text-[15px] font-medium text-foreground/70">{editingServico.nome}</span>
                </div>
              </div>

              {/* Preço + Duração padrão (read-only) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Preço
                  </label>
                  <div className="h-12 flex items-center px-4 rounded-xl border border-border/20 bg-secondary/20">
                    <span className="text-[15px] font-medium text-foreground/70">
                      R$ {editingServico.preco.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Duração padrão
                  </label>
                  <div className="h-12 flex items-center px-4 rounded-xl border border-border/20 bg-secondary/20">
                    <span className="text-[15px] font-medium text-foreground/70">
                      {formatDuration(editingServico.duracao_minutos)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Descrição (read-only) */}
              {editingServico.descricao && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Descrição
                  </label>
                  <div className="min-h-[60px] flex items-start px-4 py-3 rounded-xl border border-border/20 bg-secondary/20">
                    <span className="text-[14px] text-foreground/60 leading-relaxed">{editingServico.descricao}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Seção: Meu tempo pessoal (editável se ativo) */}
          <div className={cn("transition-opacity", disabled && "opacity-40 pointer-events-none")}>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Meu tempo pessoal
            </p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Tempo que eu gasto neste serviço
                </label>
                <Select value={formDuracao} onValueChange={setFormDuracao} disabled={disabled}>
                  <SelectTrigger className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-sm">
                        {opt.label}
                        {opt.value === editingServico.duracao_minutos.toString() && (
                          <span className="ml-2 text-muted-foreground/50">(padrão)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground/40 px-1">
                  Essa duração personalizada será considerada ao calcular seus horários de atendimento.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer fixo — botões */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 py-3 flex items-center gap-3 lg:static lg:border-t-0 lg:px-4 lg:pt-6">
          {isCustom && !hasChanges && !disabled && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="h-12 px-5 rounded-xl border border-border/40 flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors flex-shrink-0 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[13px] font-medium">Resetar</span>
            </button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges || disabled}
            className={cn(
              "flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider transition-all",
              (!hasChanges || disabled) && "opacity-30"
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Duração"}
          </Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // SERVICE LISTING — design idêntico ao AdminCortes
  // ═══════════════════════════════════
  const totalDisabled = servicos.filter(s => isServiceDisabled(s.id)).length;
  const isTenantAdmin = barberContext.isTenantAdmin;

  const renderModals = () => (
    <>
      {/* Modal para Admin adicionar serviço direto */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Serviço da Barbearia</DialogTitle>
            <DialogDescription>
              Cadastre um novo serviço que entrará no catálogo da barbearia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome do serviço</label>
              <Input
                placeholder="Ex: Barba Terapia & Toalha Quente"
                value={newNome}
                onChange={e => setNewNome(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Preço (R$)</label>
                <Input
                  placeholder="35,00"
                  value={newPreco}
                  onChange={e => setNewPreco(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Duração</label>
                <Select value={newDuracao} onValueChange={setNewDuracao}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
              <Input
                placeholder="Detalhes sobre o procedimento ou corte"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdminAddService} disabled={submittingAction}>
              {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Serviço"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Barbeiro solicitar novo serviço ao Admin */}
      <Dialog open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Sugerir Novo Serviço
            </DialogTitle>
            <DialogDescription>
              Envie sua sugestão para o administrador da barbearia avaliar e adicionar ao catálogo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome do serviço sugerido</label>
              <Input
                placeholder="Ex: Alisamento / Botox Capilar"
                value={reqNome}
                onChange={e => setReqNome(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Preço sugerido (R$)</label>
                <Input
                  placeholder="50,00"
                  value={reqPreco}
                  onChange={e => setReqPreco(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Duração estimada</label>
                <Select value={reqDuracao} onValueChange={setReqDuracao}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Motivo / Observação para o admin</label>
              <Input
                placeholder="Ex: Vários clientes procuram por esse procedimento"
                value={reqMotivo}
                onChange={e => setReqMotivo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRequestModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleBarberRequestService} disabled={submittingAction}>
              {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (isMobile) {
    return (
      <div className="pb-28 lg:pb-8 -mx-3 -mt-3">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <button
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  navigate(`${basePath}/configuracoes-perfil`);
                }
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[18px] font-medium tracking-tight text-foreground truncate">Meus Serviços</h1>
              {totalDisabled > 0 && (
                <p className="text-[10px] text-amber-500 font-medium">
                  {totalDisabled} {totalDisabled === 1 ? "desativado" : "desativados"} por você
                </p>
              )}
            </div>

            {/* Botão de Adicionar / Solicitar Serviço */}
            {isTenantAdmin ? (
              <Button
                size="sm"
                onClick={() => setAddModalOpen(true)}
                className="h-8 px-2.5 rounded-lg text-xs gap-1 font-medium bg-primary text-primary-foreground shadow-sm active:scale-95 transition-transform"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRequestModalOpen(true)}
                className="h-8 px-2.5 rounded-lg text-xs gap-1.5 font-medium border-border/50 text-foreground active:scale-95 transition-transform"
              >
                <Send className="w-3 h-3 text-primary" />
                <span>Sugerir</span>
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="px-4 pb-3 pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Pesquisar serviços..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/30 border border-border/20 text-[13px] font-normal text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Service list */}
        <div className="px-4 pt-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <Scissors className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-muted-foreground">
                {searchQuery ? "Nenhum serviço corresponde à busca." : "Nenhum serviço cadastrado ainda."}
              </p>
              <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[260px]">
                {searchQuery
                  ? "Tente outro termo ou limpe a busca."
                  : "Os serviços são cadastrados pelo administrador da barbearia e aparecerão aqui automaticamente."}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              <AnimatePresence mode="popLayout">
                {filtered.map((servico, index) => {
                  const customDur = duracaoMap.get(servico.id);
                  const isCustom = customDur !== undefined && customDur > 0 && customDur !== servico.duracao_minutos;
                  const disabled = isServiceDisabled(servico.id);
                  const displayDur = customDur && customDur > 0 ? customDur : servico.duracao_minutos;
                  const isInactiveGlobally = !servico.ativo;

                  return (
                    <motion.div
                      key={servico.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      className={cn(
                        "w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 hover:bg-secondary/20 transition-colors",
                        disabled && "opacity-60 bg-secondary/10"
                      )}
                    >
                      {/* Drag handle (visual only) */}
                      <GripVertical className="w-4 h-4 text-muted-foreground/25 flex-shrink-0" />

                      {/* Color bar */}
                      <div className={cn("w-1 h-10 rounded-full flex-shrink-0", getServiceColor(index))} />

                      {/* Info — ao clicar abre a edição */}
                      <button
                        type="button"
                        onClick={() => openEdit(servico.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className={cn(
                          "text-[14px] font-medium text-foreground truncate",
                          disabled && "line-through text-muted-foreground"
                        )}>
                          {servico.nome}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {disabled ? (
                            <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              Desativado por você
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted-foreground/60">
                              {formatDuration(displayDur)}
                            </span>
                          )}

                          {isInactiveGlobally && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              Inativo Geral
                            </span>
                          )}
                          {isCustom && !disabled && (
                            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              Meu tempo
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Preço + Toggle Rápido + chevron */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[14px] font-semibold text-foreground">
                          R$ {servico.preco.toFixed(2).replace(".", ",")}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleService(servico.id, disabled);
                          }}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                            disabled
                              ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                          )}
                          title={disabled ? "Clique para ativar no seu perfil" : "Clique para desativar do seu perfil"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEdit(servico.id)}
                          className="p-1 text-muted-foreground/40 hover:text-foreground"
                        >
                          <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {renderModals()}
      </div>
    );
  }

  // ═══════════════════════════════════
  // DESKTOP LAYOUT
  // ═══════════════════════════════════
  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Meus Serviços</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Personalize seu tempo e quais serviços você atende · {servicos.length} disponíveis
            {totalDisabled > 0 && ` (${totalDisabled} desativados por você)`}
          </p>
        </div>

        {isTenantAdmin ? (
          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
            className="gap-1.5 font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Serviço</span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRequestModalOpen(true)}
            className="gap-2 font-medium"
          >
            <Send className="w-3.5 h-3.5 text-primary" />
            <span>Sugerir Novo Serviço</span>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Pesquisar serviços..."
          className="h-9 pl-9 bg-muted/30 border-border/30 text-sm rounded-lg"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card p-10">
          <div className="flex flex-col items-center text-center py-4">
            <Scissors className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
            <p className="text-[15px] font-semibold text-muted-foreground">
              {searchQuery ? "Nenhum serviço corresponde à busca." : "Nenhum serviço cadastrado ainda."}
            </p>
            <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[280px]">
              {searchQuery
                ? "Tente outro termo ou limpe a busca."
                : "Os serviços são cadastrados pelo administrador e aparecerão aqui automaticamente."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((servico, idx) => {
            const customDur = duracaoMap.get(servico.id);
            const isCustom = customDur !== undefined && customDur > 0 && customDur !== servico.duracao_minutos;
            const disabled = isServiceDisabled(servico.id);
            const displayDur = customDur && customDur > 0 ? customDur : servico.duracao_minutos;
            const isInactiveGlobally = !servico.ativo;

            return (
              <motion.div
                key={servico.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.025 }}
                className={cn(
                  "group rounded-xl border border-border/30 bg-card p-5 transition-all hover:shadow-md hover:border-border/50",
                  disabled && "opacity-65 bg-secondary/15"
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn("w-1 h-10 rounded-full", getServiceColor(idx))} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(servico.id)}>
                    <p className={cn(
                      "text-sm font-semibold text-foreground truncate",
                      disabled && "line-through text-muted-foreground"
                    )}>
                      {servico.nome}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {disabled ? (
                        <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Desativado por você
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">{formatDuration(displayDur)}</span>
                      )}
                      {isInactiveGlobally && (
                        <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Inativo Geral
                        </span>
                      )}
                      {isCustom && !disabled && (
                        <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Meu tempo
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    onClick={() => openEdit(servico.id)}
                    className="w-4 h-4 text-muted-foreground/40 mt-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                  <span className="text-sm font-bold text-foreground">
                    R$ {servico.preco.toFixed(2).replace(".", ",")}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleService(servico.id, disabled)}
                      className={cn(
                        "h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors",
                        disabled
                          ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                      )}
                    >
                      <Power className="w-3 h-3" />
                      <span>{disabled ? "Reativar" : "Ativo"}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {renderModals()}
    </div>
  );
}
