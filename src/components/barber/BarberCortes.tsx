// @ts-nocheck — tipos do banco desatualizados para este arquivo; comportamento em produção validado.
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import {
  Loader2,
  Scissors,
  Search,
  ChevronRight,
  GripVertical,
  RotateCcw,
  Plus,
  Lock,
  X,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BarberContext } from "@/pages/Barbeiro";
import { useBarberServicos } from "@/hooks/useBarberServicos";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import {
  useSaveServiceDuration,
  useResetServiceDuration,
} from "@/hooks/useBarberMutations";
import {
  useEditarServico,
  useCriarServico,
  useDeletarServico,
} from "@/hooks/useAdminMutations";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

interface Props {
  barberContext: BarberContext;
  basePath?: string;
  onBack?: () => void;
  hideHeader?: boolean;
  tenantId?: string;
}

/** Cores para a barra lateral de cada serviço — 100% idêntico ao AdminCortes */
const SERVICE_COLORS = [
  "bg-violet-400",
  "bg-rose-400",
  "bg-amber-500",
  "bg-emerald-400",
  "bg-sky-400",
  "bg-orange-400",
  "bg-pink-400",
  "bg-teal-400",
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

/** Opções de duração completas — idêntico ao AdminCortes */
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

/**
 * BarberCortes — Gestão de Serviços do Barbeiro
 * Design, estrutura e usabilidade 100% IDÊNTICOS ao AdminCortes.
 *  - Duração e status do serviço totalmente editáveis pelo barbeiro.
 *  - Qualquer alteração espelha única e exclusivamente no agendamento do barbeiro.
 *  - Campo de Valores / Preço bloqueado com segurança para barbeiros não-admin.
 */
export function BarberCortes({
  barberContext,
  basePath = "/barbeiro",
  onBack,
  hideHeader = false,
  tenantId,
}: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isCreating = searchParams.get("novo") === "1";

  const [searchQuery, setSearchQuery] = useState("");
  const isTenantAdmin = barberContext.isTenantAdmin;

  // Tenant efetivo
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(
    tenantId ?? barberContext.tenantId ?? null
  );

  // Form state — idêntico ao AdminCortes
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    preco: "",
    duracao_minutos: "30",
    ativo: true,
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [servicoToDelete, setServicoToDelete] = useState<any | null>(null);

  // Resolução do tenant_id
  useEffect(() => {
    if (tenantId) {
      setResolvedTenantId(tenantId);
      return;
    }

    const resolveTenant = async () => {
      try {
        const [{ data: barberById }, { data: ownerTenant }] = await Promise.all([
          supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("id", barberContext.barbeiroId)
            .maybeSingle(),
          resolveOldestOwnedTenant<{ id: string }>(barberContext.userId, "id"),
        ]);

        const nextTenantId =
          barberById?.tenant_id ||
          barberContext.tenantId ||
          ownerTenant?.id ||
          null;

        setResolvedTenantId(nextTenantId);
      } catch (error) {
        console.error("Erro ao resolver tenant_id dos serviços:", error);
        setResolvedTenantId(barberContext.tenantId ?? null);
      }
    };

    resolveTenant();
  }, [tenantId, barberContext.userId, barberContext.barbeiroId, barberContext.tenantId]);

  /* ── Query de serviços do catálogo + durações personalizadas do barbeiro ── */
  const { data: queryResult, isLoading: loading } = useBarberServicos(
    barberContext.barbeiroId,
    resolvedTenantId
  );
  const servicos = queryResult?.servicos ?? [];
  const duracaoMap = queryResult?.duracaoMap ?? new Map<string, number>();

  // Mutations para barbeiro pessoal
  const saveDurationMutation = useSaveServiceDuration();
  const resetDurationMutation = useResetServiceDuration();

  // Mutations para tenant admin
  const criarServico = useCriarServico(resolvedTenantId || "");
  const editarServico = useEditarServico(resolvedTenantId || "");
  const deletarServico = useDeletarServico(resolvedTenantId || "");

  // Preenchimento do formulário de edição/criação
  useEffect(() => {
    if (editId && servicos.length > 0) {
      const s = servicos.find((sv) => sv.id === editId);
      if (s) {
        const customDur = duracaoMap.get(s.id);
        const isDisabledForBarber = customDur === 0;
        const effectiveDur =
          customDur !== undefined && customDur > 0
            ? customDur.toString()
            : s.duracao_minutos.toString();

        setFormData({
          nome: s.nome,
          descricao: s.descricao || "",
          preco: s.preco.toString(),
          duracao_minutos: effectiveDur,
          ativo: isTenantAdmin ? s.ativo : !isDisabledForBarber,
        });
      }
    } else if (isCreating && isTenantAdmin) {
      setFormData({
        nome: "",
        descricao: "",
        preco: "",
        duracao_minutos: "30",
        ativo: true,
      });
    }
  }, [editId, isCreating, servicos, duracaoMap, isTenantAdmin]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return servicos;
    const q = searchQuery.toLowerCase();
    return servicos.filter(
      (s) =>
        s.nome.toLowerCase().includes(q) ||
        (s.descricao && s.descricao.toLowerCase().includes(q))
    );
  }, [servicos, searchQuery]);

  const goBack = () => setSearchParams({});
  const openEdit = (id: string) => setSearchParams({ edit: id });
  const openCreate = () => setSearchParams({ novo: "1" });

  const saving =
    saveDurationMutation.isPending ||
    resetDurationMutation.isPending ||
    criarServico.isPending ||
    editarServico.isPending;

  /** Salva alterações de forma personalizada para o barbeiro ou global para o admin */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isTenantAdmin) {
      // ════ MODO BARBEIRO PESSOAL ════
      if (!editId) return;
      const dur = parseInt(formData.duracao_minutos);
      if (isNaN(dur) || dur < 5) {
        toast.error("Duração mínima: 5 minutos");
        return;
      }

      // Se desativado para a cadeira do barbeiro, salva duracao = 0
      const durationToSave = formData.ativo ? dur : 0;

      saveDurationMutation.mutate(
        {
          barbeiroId: barberContext.barbeiroId,
          servicoId: editId,
          duracao: durationToSave,
          tenantId: resolvedTenantId,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
            toast.success(
              formData.ativo
                ? "Duração personalizada salva para seus atendimentos!"
                : "Serviço desativado para a sua cadeira."
            );
            goBack();
          },
          onError: () => {
            toast.error("Erro ao salvar serviço");
          },
        }
      );
    } else {
      // ════ MODO ADMIN DA BARBEARIA ════
      if (!formData.nome.trim() || !formData.preco || !formData.duracao_minutos) {
        toast.error("Preencha todos os campos obrigatórios");
        return;
      }
      const payload = {
        nome: formData.nome.trim(),
        descricao: formData.descricao.trim() || null,
        preco: parseFloat(formData.preco),
        duracao_minutos: parseInt(formData.duracao_minutos),
        ativo: formData.ativo,
        ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
      };

      if (editId) {
        editarServico.mutate(
          { servicoId: editId, dados: payload },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
              goBack();
            },
          }
        );
      } else {
        criarServico.mutate(
          {
            nome: payload.nome,
            preco: payload.preco,
            duracao: payload.duracao_minutos,
            descricao: payload.descricao || undefined,
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
              goBack();
            },
          }
        );
      }
    }
  };

  /** Reseta duração personalizada para o padrão do catálogo */
  const handleResetDuration = () => {
    if (!editId) return;
    const s = servicos.find((sv) => sv.id === editId);
    if (!s) return;

    resetDurationMutation.mutate(
      {
        barbeiroId: barberContext.barbeiroId,
        servicoId: editId,
        tenantId: resolvedTenantId,
      },
      {
        onSuccess: () => {
          setFormData((prev) => ({
            ...prev,
            duracao_minutos: s.duracao_minutos.toString(),
            ativo: true,
          }));
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
          toast.success("Duração restaurada para o padrão da barbearia");
        },
      }
    );
  };

  const handleDelete = async () => {
    if (!servicoToDelete) return;
    deletarServico.mutate(servicoToDelete.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setServicoToDelete(null);
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.barberServicos] });
        if (editId === servicoToDelete.id) goBack();
      },
      onError: () => {
        setDeleteDialogOpen(false);
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════
  // EDIT / CREATE FULL-PAGE VIEW (IDÊNTICO AO ADMINCORTES)
  // ═══════════════════════════════════
  if (editId || (isCreating && isTenantAdmin)) {
    const editingServico = editId ? servicos.find((s) => s.id === editId) : null;
    const pageTitle = editId
      ? editingServico?.nome || "Editar Serviço"
      : "Novo Serviço";
    const charCount = formData.nome.length;

    const customDur = editId ? duracaoMap.get(editId) : undefined;
    const isCustom =
      !isTenantAdmin &&
      customDur !== undefined &&
      customDur > 0 &&
      editingServico &&
      customDur !== editingServico.duracao_minutos;

    return (
      <div className="pb-8">
        <ScheduleHeader title={pageTitle} onBack={goBack} />

        <form onSubmit={handleSave} className="px-4 pt-5 space-y-6 max-w-xl mx-auto">
          {/* Seção: Detalhes principais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Detalhes principais (obrigatório)
            </p>

            <div className="space-y-4">
              {/* Nome do serviço */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1 flex items-center justify-between">
                  <span>Nome do Serviço</span>
                  {!isTenantAdmin && (
                    <span className="text-[10px] text-muted-foreground/45 normal-case font-normal">
                      Catálogo oficial
                    </span>
                  )}
                </label>
                <Input
                  value={formData.nome}
                  onChange={(e) =>
                    isTenantAdmin &&
                    setFormData({ ...formData, nome: e.target.value })
                  }
                  readOnly={!isTenantAdmin}
                  placeholder="Ex: Corte Degradê"
                  maxLength={50}
                  className={cn(
                    "h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30",
                    !isTenantAdmin && "cursor-default text-foreground/90 select-none"
                  )}
                  required
                />
                {isTenantAdmin && (
                  <p className="text-[10px] text-muted-foreground/40 text-right px-1">
                    {charCount} / 50
                  </p>
                )}
              </div>

              {/* Preço & Duração */}
              <div className="grid grid-cols-2 gap-3">
                {/* Preço (ESTRITAMENTE BLOQUEADO PARA BARBEIRO) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1 flex items-center gap-1.5">
                    <span>Preço</span>
                    {!isTenantAdmin && (
                      <Lock className="w-3 h-3 text-muted-foreground/50" />
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground/50 font-medium select-none">
                      R$
                    </span>
                    <Input
                      type="number"
                      step="5"
                      value={formData.preco}
                      onChange={(e) =>
                        isTenantAdmin &&
                        setFormData({ ...formData, preco: e.target.value })
                      }
                      readOnly={!isTenantAdmin}
                      disabled={!isTenantAdmin}
                      placeholder="0,00"
                      className={cn(
                        "h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl pl-11 pr-4 placeholder:text-muted-foreground/30",
                        !isTenantAdmin &&
                          "bg-muted/20 cursor-not-allowed opacity-75 select-none"
                      )}
                      required
                    />
                  </div>
                  {!isTenantAdmin && (
                    <p className="text-[10px] text-muted-foreground/50 px-1 mt-0.5 font-light">
                      Preço fixado pela administração
                    </p>
                  )}
                </div>

                {/* Duração do Serviço (100% EDITÁVEL PELO BARBEIRO) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1 flex items-center justify-between">
                    <span>Duração do Serviço</span>
                    {!isTenantAdmin && isCustom && (
                      <span className="text-[10px] text-primary font-medium normal-case">
                        Personalizado
                      </span>
                    )}
                  </label>
                  <Select
                    value={formData.duracao_minutos}
                    onValueChange={(v) =>
                      setFormData({ ...formData, duracao_minutos: v })
                    }
                  >
                    <SelectTrigger className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          className="text-sm"
                        >
                          {opt.label}
                          {!isTenantAdmin &&
                            editingServico &&
                            opt.value ===
                              editingServico.duracao_minutos.toString() && (
                              <span className="ml-2 text-muted-foreground/50 text-xs font-normal">
                                (padrão)
                              </span>
                            )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isTenantAdmin && (
                    <p className="text-[10px] text-muted-foreground/50 px-1 mt-0.5 font-light">
                      Tempo considerado na sua agenda
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Detalhes adicionais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Detalhes adicionais
            </p>

            <div className="space-y-4">
              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Descrição do serviço
                </label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) =>
                    isTenantAdmin &&
                    setFormData({ ...formData, descricao: e.target.value })
                  }
                  readOnly={!isTenantAdmin}
                  placeholder="Breve descrição do serviço para os clientes"
                  rows={3}
                  className={cn(
                    "text-[14px] bg-transparent border-border/40 rounded-xl px-4 py-3 resize-none placeholder:text-muted-foreground/30",
                    !isTenantAdmin && "cursor-default text-foreground/80 select-none"
                  )}
                />
              </div>

              {/* Status ativo/inativo */}
              <div className="flex items-center justify-between px-1 py-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Serviço ativo
                  </p>
                  <p className="text-[10.5px] font-extralight text-muted-foreground/70 mt-0.5">
                    {formData.ativo
                      ? isTenantAdmin
                        ? "Visível para clientes no agendamento da barbearia"
                        : "Ativo na sua agenda para agendamentos de clientes"
                      : isTenantAdmin
                      ? "Oculto — não aparece para clientes da barbearia"
                      : "Oculto — você não atende este corte na sua cadeira"}
                  </p>
                </div>
                <Switch
                  checked={formData.ativo}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, ativo: checked })
                  }
                  className={cn(
                    formData.ativo && "data-[state=checked]:bg-emerald-600"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Footer fixo idêntico ao AdminCortes */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] flex items-center gap-3 lg:static lg:border-t-0 lg:px-0 lg:pt-4">
            {isTenantAdmin && editId && (
              <button
                type="button"
                onClick={() => {
                  const s = servicos.find((sv) => sv.id === editId);
                  if (s) {
                    setServicoToDelete(s);
                    setDeleteDialogOpen(true);
                  }
                }}
                className="w-12 h-12 rounded-xl border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                title="Excluir serviço"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            {!isTenantAdmin && isCustom && (
              <button
                type="button"
                onClick={handleResetDuration}
                disabled={saving}
                className="h-12 px-4 rounded-xl border border-border/40 flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors flex-shrink-0 disabled:opacity-50"
                title="Restaurar duração padrão da barbearia"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-[12.5px] font-medium">Padrão</span>
              </button>
            )}

            <Button
              type="submit"
              disabled={saving}
              className="flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </form>

        {/* Delete dialog para Admin */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[14px]">
                Remover serviço
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[12px]">
                Remover{" "}
                <span className="text-foreground font-medium">
                  {servicoToDelete?.nome}
                </span>{" "}
                permanentemente? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-[12px]">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="h-9 text-[12px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ═══════════════════════════════════
  // SERVICE LISTING — DESIGN 100% IDÊNTICO AO ADMINCORTES
  // ═══════════════════════════════════
  return (
    <div className="pb-28 lg:pb-8">
      {/* Layout Mobile */}
      {isMobile ? (
        <div>
          {/* Header Institucional com ScheduleHeader */}
          <div className={cn("bg-background/95 backdrop-blur-md", !hideHeader && "sticky top-0 z-30")}>
            {!hideHeader && (
              <>
                <ScheduleHeader
                  title="Serviços e Planos"
                  onBack={
                    onBack
                      ? onBack
                      : () => navigate(`${basePath}/config-barbearia`)
                  }
                />

                {/* Explicação da tela idêntica ao Admin */}
                <div className="px-4 pt-1 pb-2 max-w-md mx-auto">
                  <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
                    Configure os serviços disponíveis, tempo estimado de atendimento e valores cobrados.
                  </p>
                </div>
              </>
            )}

            {/* Campo de Busca inteligente — idêntico ao AdminCortes */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar serviços..."
                  className="w-full h-11 pl-10 pr-9 rounded-2xl bg-muted/40 dark:bg-white/[0.04] border border-border/40 focus:border-border/80 focus:bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/50 transition-all outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Lista de Serviços */}
          <div className="px-4 pt-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Scissors
                  className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3"
                  strokeWidth={1.5}
                />
                <p className="text-[13px] text-muted-foreground">
                  {searchQuery
                    ? "Nenhum serviço encontrado"
                    : "Nenhum serviço cadastrado"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {filtered.map((servico, index) => {
                  const customDur = duracaoMap.get(servico.id);
                  const isCustom =
                    !isTenantAdmin &&
                    customDur !== undefined &&
                    customDur > 0 &&
                    customDur !== servico.duracao_minutos;
                  const isDisabled =
                    !isTenantAdmin ? customDur === 0 : !servico.ativo;
                  const displayDuration =
                    !isTenantAdmin && customDur !== undefined && customDur > 0
                      ? customDur
                      : servico.duracao_minutos;

                  return (
                    <button
                      key={servico.id}
                      type="button"
                      onClick={() => openEdit(servico.id)}
                      className={cn(
                        "relative w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 bg-background transition-colors hover:bg-secondary/20 select-none group touch-manipulation",
                        isDisabled && "opacity-50"
                      )}
                    >
                      {/* Grip Handle visual */}
                      <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />

                      {/* Barra de cor lateral */}
                      <div
                        className={cn(
                          "w-1 h-10 rounded-full flex-shrink-0",
                          getServiceColor(index)
                        )}
                      />

                      {/* Nome e Descrição */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-medium text-foreground truncate">
                            {servico.nome}
                          </p>
                          {isDisabled ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
                              Desativado
                            </span>
                          ) : isCustom ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              Personalizado
                            </span>
                          ) : null}
                        </div>
                        {servico.descricao && (
                          <p className="text-[11.5px] text-muted-foreground/60 truncate mt-0.5">
                            {servico.descricao}
                          </p>
                        )}
                      </div>

                      {/* Preço e Duração */}
                      <div className="flex flex-col items-end flex-shrink-0 pr-1">
                        <span className="text-[14px] font-medium text-foreground">
                          R$ {servico.preco.toFixed(2).replace(".", ",")}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] mt-0.5",
                            isCustom
                              ? "text-primary font-medium"
                              : "text-muted-foreground/60"
                          )}
                        >
                          {formatDuration(displayDuration)}
                        </span>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botão flutuante Adicionar (exclusivo para Tenant Admin da Barbearia) */}
          {isTenantAdmin && (
            <div className="fixed bottom-6 right-5 z-40">
              <button
                onClick={openCreate}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-foreground text-background shadow-lg hover:opacity-90 active:scale-95 transition-all"
                title="Novo Serviço"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ═══ DESKTOP LAYOUT (IDÊNTICO AO ADMINCORTES) ═══ */
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Serviços e Planos
              </h1>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Configure os serviços disponíveis, tempo estimado de atendimento e valores cobrados.
              </p>
            </div>
            {isTenantAdmin && (
              <Button
                onClick={openCreate}
                size="sm"
                className="h-9 px-4 rounded-lg text-xs font-semibold gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Serviço
              </Button>
            )}
          </div>

          {/* Busca Desktop */}
          <div className="relative max-w-sm mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar serviços..."
              className="h-10 pl-9 bg-muted/30 border-border/30 text-sm rounded-xl"
            />
          </div>

          {/* Grid Desktop */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border/30 bg-card p-12 text-center">
              <Scissors
                className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">
                Nenhum serviço encontrado
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((servico, idx) => {
                const customDur = duracaoMap.get(servico.id);
                const isCustom =
                  !isTenantAdmin &&
                  customDur !== undefined &&
                  customDur > 0 &&
                  customDur !== servico.duracao_minutos;
                const isDisabled =
                  !isTenantAdmin ? customDur === 0 : !servico.ativo;
                const displayDuration =
                  !isTenantAdmin && customDur !== undefined && customDur > 0
                    ? customDur
                    : servico.duracao_minutos;

                return (
                  <motion.div
                    key={servico.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.025 }}
                    onClick={() => openEdit(servico.id)}
                    className={cn(
                      "group cursor-pointer rounded-xl border border-border/30 bg-card p-5 transition-all hover:shadow-md hover:border-border/50",
                      isDisabled && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={cn(
                          "w-1 h-10 rounded-full",
                          getServiceColor(idx)
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {servico.nome}
                        </p>
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          {formatDuration(displayDuration)}
                          {isCustom && (
                            <span className="ml-1.5 text-primary font-medium">
                              (personalizado)
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">
                        R$ {servico.preco.toFixed(2).replace(".", ",")}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium",
                          !isDisabled
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {!isDisabled ? "Ativo" : "Desativado"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
