import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import {
  Loader2, Scissors, Clock, Search, ChevronRight,
  GripVertical, RotateCcw,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
}

/**
 * BarberCortes — Tela de serviços do barbeiro com design idêntico ao AdminCortes.
 * O barbeiro vê todos os serviços da barbearia mas só pode editar
 * o TEMPO PESSOAL que ele gasta em cada um. Nome, preço e status são read-only.
 */
export function BarberCortes({ barberContext, basePath = "/barbeiro" }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [searchQuery, setSearchQuery] = useState("");

  // Form state para edição
  const [formDuracao, setFormDuracao] = useState("");
  const [originalDuracao, setOriginalDuracao] = useState("");
  

  // Tenant efetivo com resolução robusta (contexto -> owner -> barbeiro)
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(barberContext.tenantId ?? null);

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

  // Ao entrar na edição, popular o formulário
  useEffect(() => {
    if (editId && servicos.length > 0) {
      const s = servicos.find(sv => sv.id === editId);
      if (s) {
        const custom = duracaoMap.get(s.id);
        const dur = (custom ?? s.duracao_minutos).toString();
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

  const hasChanges = formDuracao !== originalDuracao;

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
      { onSuccess: () => setOriginalDuracao(formDuracao) }
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
        },
      }
    );
  };

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

    const isCustom = duracaoMap.has(editId);
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
            {isCustom && (
              <span className="text-[9px] bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider flex-shrink-0">
                Personalizado
              </span>
            )}
          </div>
        </div>

        <div className="px-4 pt-5 space-y-6">
          {/* Seção: Informações do serviço (read-only) */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Informações do serviço
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

          {/* Seção: Meu tempo pessoal (editável) */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Meu tempo pessoal
            </p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Tempo que eu gasto neste serviço
                </label>
                <Select value={formDuracao} onValueChange={setFormDuracao}>
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
                  Essa duração será usada no cálculo da sua agenda e nos agendamentos dos clientes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer fixo — botões */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 py-3 flex items-center gap-3 lg:static lg:border-t-0 lg:px-4 lg:pt-6">
          {isCustom && !hasChanges && (
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
            disabled={saving || !hasChanges}
            className={cn(
              "flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider transition-all",
              !hasChanges && "opacity-30"
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // SERVICE LISTING — design idêntico ao AdminCortes
  // ═══════════════════════════════════
  if (isMobile) {
    return (
      <div className="pb-28 lg:pb-8 -mx-3 -mt-3">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
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
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Meus Serviços</h1>
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
                  const displayDur = customDur ?? servico.duracao_minutos;
                  const isCustom = customDur !== undefined;
                  const isInactive = !servico.ativo;

                  return (
                    <motion.button
                      key={servico.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      onClick={() => openEdit(servico.id)}
                      className="w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors"
                    >
                      {/* Drag handle (visual only) */}
                      <GripVertical className="w-4 h-4 text-muted-foreground/25 flex-shrink-0" />

                      {/* Color bar */}
                      <div className={cn("w-1 h-10 rounded-full flex-shrink-0", getServiceColor(index))} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">{servico.nome}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[12px] text-muted-foreground/60">
                            {formatDuration(displayDur)}
                          </span>
                          {isInactive && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              Inativo
                            </span>
                          )}
                          {isCustom && (
                            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              Meu tempo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price + chevron */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[14px] font-semibold text-foreground">
                          R$ {servico.preco.toFixed(2).replace(".", ",")}
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
            Personalize o tempo que você gasta em cada serviço · {servicos.length} serviços
          </p>
        </div>
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
            const displayDur = customDur ?? servico.duracao_minutos;
            const isCustom = customDur !== undefined;
            const isInactive = !servico.ativo;

            return (
              <motion.div
                key={servico.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.025 }}
                onClick={() => openEdit(servico.id)}
                className="group cursor-pointer rounded-xl border border-border/30 bg-card p-5 transition-all hover:shadow-md hover:border-border/50"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn("w-1 h-10 rounded-full", getServiceColor(idx))} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{servico.nome}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground/50">{formatDuration(displayDur)}</span>
                      {isInactive && (
                        <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Inativo
                        </span>
                      )}
                      {isCustom && (
                        <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Meu tempo
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">
                    R$ {servico.preco.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
