import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AddClientScreen } from "@/components/shared/AddClientScreen";
import { ListSkeleton } from "@/components/ui/loading";
import {
  Search,
  Phone,
  Mail,
  Calendar,
  Award,
  Inbox,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Users,
  UserPlus,
  Ban,
  CheckCircle,
  CreditCard,
  Trash2,
  UserX,
  Building2,
  Plus,
  MoreHorizontal,
  X,
  User,
  Scissors,
  History,
  CalendarCheck,
  Banknote,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarberContext } from "@/pages/Barbeiro";
import { useIsMobile } from "@/hooks/use-mobile";
import { PendingPlanPayments } from "./PendingPlanPayments";
import { motion, AnimatePresence } from "framer-motion";
import whatsappLogo from "@/assets/whatsapp-logo.png";
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
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { useBarberClientes, useTenantClientes, useClientSubscriptionDetail, type BarberClient, type BlockDetail } from "@/hooks/useBarberClientes";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useBlockClient, useUnblockClient, useUnblockSpecific, useRemoveClient } from "@/hooks/useBarberMutations";
import { BlockClientModal } from "./BlockClientModal";
import { supabase } from "@/integrations/supabase/client";
import { ClientPlanConversionScreen } from "@/components/shared/ClientPlanConversionScreen";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { useConfirmarPagamentoPlano } from "@/hooks/useAdminMutations";
import {
  checkClientPendingCancellationDebt,
  dispenseCancellationDebt,
  fetchBarberPendingCancellationDebts,
  formatItemReason,
  type ClienteDebitoCancelamento,
} from "@/lib/barberCancellationFee";
import { BarberDebitosPendentesModal } from "./BarberDebitosPendentesModal";

/* ─── Helper: WhatsApp SVG Icon ─── */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/* ─── Helper: Histórico de Visitas (No máximo 3 visitas no card) ─── */
function ClientHistorySection({
  clientUserId,
  onViewAll,
}: {
  clientUserId: string;
  onViewAll?: () => void;
}) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["client-history-view-short", clientUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, data, hora, status, preco, payment_method, servico:servicos(nome)")
        .eq("user_id", clientUserId)
        .order("data", { ascending: false })
        .limit(3);
      if (error) return [];
      return data ?? [];
    },
    staleTime: 30_000,
    enabled: !!clientUserId,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/20 bg-secondary/15 p-4 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-border/20 bg-secondary/15 p-4 text-center">
        <p className="text-[12px] text-muted-foreground/60">Nenhum agendamento registrado ainda.</p>
      </div>
    );
  }

  const getStatusLabel = (status: string) => {
    if (status === "completed") return { label: "Concluído", color: "text-emerald-500" };
    if (status === "no_show") return { label: "Não compareceu", color: "text-amber-500" };
    if (status.includes("cancel")) return { label: "Cancelado", color: "text-destructive" };
    return { label: "Agendado", color: "text-foreground/75" };
  };

  return (
    <div className="rounded-2xl border border-border/20 bg-secondary/15 overflow-hidden">
      <div className="divide-y divide-border/15">
        {history.map((h: any) => {
          const statusCfg = getStatusLabel(h.status);
          const horaFormatted = (h.hora || "00:00").substring(0, 5);
          return (
            <div
              key={h.id}
              onClick={onViewAll}
              className={cn(
                "flex items-center justify-between p-3.5 transition-colors",
                onViewAll && "cursor-pointer hover:bg-secondary/25 active:bg-secondary/40"
              )}
            >
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-[13px] font-semibold text-foreground truncate">
                  {h.servico?.nome || "Atendimento"}
                </p>
                <p className="text-[11.5px] text-muted-foreground/65 mt-0.5 tabular-nums">
                  {format(new Date(`${h.data}T12:00:00`), "dd/MM/yyyy")} · {horaFormatted}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12.5px] font-semibold text-foreground tabular-nums">
                  {h.payment_method === "plano"
                    ? "No Plano"
                    : typeof h.preco === "number"
                    ? `R$ ${h.preco.toFixed(2).replace(".", ",")}`
                    : "—"}
                </p>
                <p className={cn("text-[10px] font-medium mt-0.5", statusCfg.color)}>
                  {statusCfg.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="w-full py-2.5 px-3 bg-secondary/30 hover:bg-secondary/50 border-t border-border/15 text-[12px] font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors active:opacity-70"
        >
          <span>Ver histórico completo</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
        </button>
      )}
    </div>
  );
}

/* ─── Tela Completa Dedicada: Todas as Visitas do Cliente ─── */
function ClientAllVisitsScreen({
  client,
  onBack,
}: {
  client: BarberClient;
  onBack: () => void;
}) {
  const { data: allVisits = [], isLoading } = useQuery({
    queryKey: ["client-all-visits", client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, data, hora, status, preco, payment_method, servico:servicos(nome), barbeiro:barbeiros(apelido)")
        .eq("user_id", client.id)
        .order("data", { ascending: false })
        .limit(200);
      if (error) return [];
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const getStatusLabel = (status: string) => {
    if (status === "completed") return { label: "Concluído", color: "text-emerald-500", bg: "bg-emerald-500/10" };
    if (status === "no_show") return { label: "Não compareceu", color: "text-amber-500", bg: "bg-amber-500/10" };
    if (status.includes("cancel")) return { label: "Cancelado", color: "text-destructive", bg: "bg-destructive/10" };
    return { label: "Agendado", color: "text-foreground/75", bg: "bg-foreground/5" };
  };

  return (
    <div className="pb-12 min-h-app bg-background">
      <ScheduleHeader
        title={`Visitas de ${client.nome}`}
        onBack={onBack}
        right={
          <span className="text-[12px] font-semibold text-muted-foreground/70 tabular-nums">
            {allVisits.length} {allVisits.length === 1 ? "visita" : "visitas"}
          </span>
        }
      />

      <div className="max-w-md mx-auto px-4 pt-3 space-y-3">
        <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
          Histórico completo de todos os agendamentos e cortes realizados por este cliente.
        </p>

        {isLoading ? (
          <div className="rounded-2xl border border-border/20 bg-secondary/15 p-12 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : allVisits.length === 0 ? (
          <div className="rounded-2xl border border-border/20 bg-secondary/15 p-8 text-center">
            <Inbox className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-[13px] font-semibold text-foreground">Nenhuma visita registrada</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">Este cliente ainda não realizou atendimentos.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/30 bg-card overflow-hidden divide-y divide-border/20 shadow-xs">
            {allVisits.map((v: any) => {
              const statusCfg = getStatusLabel(v.status);
              const horaFormatted = (v.hora || "00:00").substring(0, 5);
              return (
                <div key={v.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-foreground truncate">
                      {v.servico?.nome || "Atendimento"}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground/80 mt-0.5 tabular-nums">
                      {format(new Date(`${v.data}T12:00:00`), "dd/MM/yyyy")} · {horaFormatted}
                      {v.barbeiro?.apelido ? ` · ${v.barbeiro.apelido}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-semibold text-foreground tabular-nums">
                      {v.payment_method === "plano"
                        ? "No Plano"
                        : typeof v.preco === "number"
                        ? `R$ ${v.preco.toFixed(2).replace(".", ",")}`
                        : "—"}
                    </p>
                    <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1", statusCfg.color, statusCfg.bg)}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Tela Completa Dedicada: Taxa de Cancelamento do Cliente ─── */
function ClientCancellationDebtScreen({
  client,
  barbeiroId,
  tenantId,
  onBack,
}: {
  client: BarberClient;
  barbeiroId: string;
  tenantId?: string | null;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState(false);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);

  const { data: debt, isLoading } = useQuery({
    queryKey: ["client-pending-debt-screen", client.id],
    queryFn: () => checkClientPendingCancellationDebt(client.id),
    staleTime: 5_000,
  });

  const handleRelease = async () => {
    if (!debt) return;
    setReleasing(true);
    try {
      await dispenseCancellationDebt({
        debitoId: debt.id,
        clienteId: client.id,
        barbeiroId,
        tenantId,
      });
      toast.success(`${client.nome} foi liberado(a)! Aplicativo desbloqueado.`);
      queryClient.invalidateQueries({ queryKey: ["client-pending-debt-screen", client.id] });
      queryClient.invalidateQueries({ queryKey: ["client-pending-debt", client.id] });
      queryClient.invalidateQueries({ queryKey: ["barber-pending-debts-list"] });
      setConfirmReleaseOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao liberar cliente");
    } finally {
      setReleasing(false);
    }
  };

  const total = Number(debt?.total_pendente ?? debt?.valor_taxa ?? 0);

  return (
    <div className="pb-12 min-h-app bg-background text-foreground">
      <ScheduleHeader
        title="Taxa de cancelamento"
        onBack={onBack}
      />

      <div className="max-w-md mx-auto px-4 pt-3 space-y-4">
        {isLoading ? (
          <div className="rounded-2xl border border-border/20 bg-secondary/15 p-12 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">Verificando débitos...</span>
          </div>
        ) : debt && total > 0 ? (
          <div className="space-y-4">
            {/* Card com status e valor */}
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-5 space-y-4 shadow-xs text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Débito Pendente
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  App Bloqueado
                </span>
              </div>

              <div>
                <p className="text-[12px] text-muted-foreground">Total pendente a acertar</p>
                <p className="text-[32px] font-extrabold text-foreground tracking-tight tabular-nums mt-0.5">
                  R$ {total.toFixed(2).replace(".", ",")}
                </p>
                {debt.porcentagem_aplicada ? (
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    Calculado como {debt.porcentagem_aplicada}% do valor original do serviço
                  </p>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    Taxa por cancelamento com menos de 2h ou falta (no-show)
                  </p>
                )}
              </div>

              <div className="h-px bg-border/40" />

              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">{client.nome}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Profissional</span>
                  <span className="font-semibold text-foreground">{debt.barbeiro_nome || "Barbearia"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Data da ocorrência</span>
                  <span className="font-semibold text-foreground">
                    {format(new Date(debt.created_at), "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                </div>
              </div>
            </div>

            {/* Histórico / discriminação dos itens de falta ou cancelamento */}
            {debt.itens && debt.itens.length > 0 && (
              <div className="rounded-2xl border border-border/30 bg-card p-4 space-y-2.5 text-left shadow-xs">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Motivo e detalhamento
                </p>
                <div className="divide-y divide-border/20">
                  {debt.itens.map((it, idx) => (
                    <div key={it.id || idx} className="py-2.5 flex items-center justify-between gap-3 text-[12.5px]">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {formatItemReason(it)}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground mt-0.5">
                          Status: <span className="capitalize">{it.status === "pendente" ? "Pendente" : it.status}</span>
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums text-foreground shrink-0">
                        R$ {Number(it.valor_taxa || 0).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aviso explicativo */}
            <div className="p-3.5 rounded-xl bg-secondary/25 border border-border/30 text-left space-y-1">
              <p className="text-[12.5px] font-semibold text-foreground">
                Regra de desbloqueio do cliente
              </p>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                O aplicativo deste cliente permanece bloqueado para novos agendamentos até que ele realize o acerto via Pix no app dele, o valor seja somado em um agendamento presencial no balcão, ou você dispense a taxa abaixo.
              </p>
            </div>

            {/* Botão de Liberar */}
            <button
              type="button"
              onClick={() => setConfirmReleaseOpen(true)}
              disabled={releasing}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
            >
              {releasing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              <span>Dispensar taxa (Liberar cliente)</span>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/20 bg-secondary/15 p-8 text-center space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mx-auto">
              <ShieldCheck className="w-5 h-5 stroke-[1.8]" />
            </div>
            <p className="text-[14px] font-semibold text-foreground">
              Nenhuma taxa pendente
            </p>
            <p className="text-[12px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
              {client.nome} está em dia e não possui nenhum débito ou bloqueio de cancelamento no aplicativo.
            </p>
          </div>
        )}
      </div>

      {/* AlertDialog de Confirmação para Dispensar Taxa */}
      <AlertDialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl border border-border/60 p-6 bg-background">
          <AlertDialogHeader className="space-y-2 text-center sm:text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400 mb-1">
              <Unlock className="w-6 h-6 stroke-[1.8]" />
            </div>
            <AlertDialogTitle className="text-[17px] font-semibold tracking-tight text-foreground">
              Dispensar taxa de {client.nome}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] text-muted-foreground leading-relaxed">
              A cobrança pendente de <strong className="text-foreground">R$ {total.toFixed(2).replace(".", ",")}</strong> será cancelada por cortesia e o aplicativo de <strong className="text-foreground">{client.nome}</strong> será desbloqueado imediatamente para novos agendamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="pt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmReleaseOpen(false)}
              disabled={releasing}
              className="flex-1 h-11 rounded-full bg-secondary border border-border/60 text-[13px] font-medium text-foreground hover:bg-secondary/80 transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={releasing}
              className="flex-1 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold active:scale-[0.99] transition-all shadow-xs flex items-center justify-center gap-1.5"
            >
              {releasing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>Confirmar</span>
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Helper: open WhatsApp ─── */
function openWhatsApp(telefone: string | null) {
  if (!telefone) {
    toast.error("Cliente não possui telefone cadastrado");
    return;
  }
  const cleaned = telefone.replace(/\D/g, "");
  const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
  window.open(`https://wa.me/${number}`, "_blank");
}

type ViewMode = "todos" | "meus";

interface TenantUnit {
  id: string;
  nome: string;
}

interface BarberClientesProps {
  barberContext: BarberContext;
  basePath?: string;
  forceViewMode?: ViewMode;
  initialUnitId?: string | null;
  hideHeader?: boolean;
  onBack?: () => void;
}

/* ═══════════════════════════════════════ */
/*       BARBER CLIENTES COMPONENT         */
/* ═══════════════════════════════════════ */
export function BarberClientes({
  barberContext,
  basePath = "/barbeiro",
  forceViewMode,
  initialUnitId = null,
  hideHeader = false,
  onBack,
}: BarberClientesProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = searchParams.get("view");

  /* ── TanStack Query: dados dos clientes ── */
  const { data: queryResult, isLoading: loading } = useBarberClientes(barberContext.barbeiroId);
  const clients = useMemo(() => queryResult?.clients ?? [], [queryResult?.clients]);
  const barberTenantId = queryResult?.tenantId ?? null;
  const loyaltyEnabled = queryResult?.loyaltyEnabled ?? false;

  const [search, setSearch] = useState("");
  /** Filtro: mostrar apenas clientes com plano ativo */
  const [planFilterOnly, setPlanFilterOnly] = useState(false);
  /** Estado do FAB expansível (abre/fecha as mini-ações) */
  const [fabOpen, setFabOpen] = useState(false);

  /* ── View mode: Todos (tenant-wide) vs Meus (barber-only) ── */
  const queryMode = searchParams.get("mode") as ViewMode | null;
  const canAccessTenantClients = !!barberContext.isTenantAdmin && !!barberContext.tenantId;
  const resolvedForcedViewMode = forceViewMode || queryMode || undefined;
  const showViewModeToggle = canAccessTenantClients && !forceViewMode && !queryMode && !!barberContext.barbeiroId;
  const defaultView: ViewMode = canAccessTenantClients ? "todos" : "meus";
  const [viewMode, setViewMode] = useState<ViewMode>(
    canAccessTenantClients ? (resolvedForcedViewMode ?? defaultView) : "meus"
  );

  useEffect(() => {
    if (canAccessTenantClients) {
      if (resolvedForcedViewMode) {
        setViewMode(resolvedForcedViewMode);
      }
    } else {
      setViewMode("meus");
    }
  }, [resolvedForcedViewMode, canAccessTenantClients]);

  /* ── Unit selector for "Todos" mode ── */
  const [units, setUnits] = useState<TenantUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialUnitId);

  /* ── All tenant clients (modo "Todos") via hook otimizado com cache instantâneo ── */
  const {
    data: allTenantClientsData,
    isLoading: loadingTenantClients,
    refetch: refetchTenantClients,
  } = useTenantClientes(
    viewMode === "todos" ? barberContext.tenantId : null,
    selectedUnitId,
    barberContext.barbeiroId
  );
  const allTenantClients = allTenantClientsData || [];
  const loadingAllClients = loadingTenantClients && allTenantClients.length === 0;

  /* ── Checar se a barbearia possui planos ativos ── */
  const { data: tenantHasPlans = false } = useQuery({
    queryKey: ["tenant-has-active-plans", barberTenantId || barberContext.tenantId],
    queryFn: async () => {
      const tid = barberTenantId || barberContext.tenantId;
      if (!tid) return false;
      const { count, error } = await supabase
        .from("planos")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("ativo", true);
      if (error) return false;
      return (count ?? 0) > 0;
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!(barberTenantId || barberContext.tenantId),
  });

  /* ── Load units ── */
  useEffect(() => {
    if (!barberContext.tenantId || !canAccessTenantClients) return;
    (async () => {
      const { data } = await supabase
        .from("tenant_unidades")
        .select("id, nome")
        .eq("tenant_id", barberContext.tenantId!)
        .eq("ativo", true)
        .order("is_sede", { ascending: false });
      setUnits(data || []);
    })();
  }, [barberContext.tenantId, canAccessTenantClients]);

  useEffect(() => {
    if (resolvedForcedViewMode && viewMode !== resolvedForcedViewMode) {
      setViewMode(resolvedForcedViewMode);
    }
  }, [resolvedForcedViewMode, viewMode]);

  useEffect(() => {
    setSelectedUnitId(initialUnitId);
  }, [initialUnitId]);

  /* Add client full-screen */
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientToConvert, setClientToConvert] = useState<BarberClient | null>(null);
  const [viewingAllVisitsClient, setViewingAllVisitsClient] = useState<BarberClient | null>(null);
  const [viewingDebtClient, setViewingDebtClient] = useState<BarberClient | null>(null);
  const [debitosModalOpen, setDebitosModalOpen] = useState(false);

  /* Block dialog */
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [clientToBlock, setClientToBlock] = useState<BarberClient | null>(null);

  /* Delete dialog */
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<BarberClient | null>(null);

  /* Cancel plan dialog */
  const [cancelPlanDialogOpen, setCancelPlanDialogOpen] = useState(false);
  const [clientToCancelPlan, setClientToCancelPlan] = useState<BarberClient | null>(null);
  const [cancellingPlan, setCancellingPlan] = useState(false);

  /* Consulta débitos pendentes de cancelamento da barbearia para badges na lista */
  const { data: barberDebtsList = [] } = useQuery({
    queryKey: ["barber-pending-debts-list", barberContext.barbeiroId, barberTenantId || barberContext.tenantId],
    queryFn: async () => {
      if (!barberContext.barbeiroId) return [];
      return fetchBarberPendingCancellationDebts(
        barberContext.barbeiroId,
        barberTenantId || barberContext.tenantId || undefined
      );
    },
    enabled: !!barberContext.barbeiroId,
    staleTime: 1000 * 30,
  });

  const clientsWithDebtSet = useMemo(() => {
    return new Set(barberDebtsList.map((d) => d.cliente_id));
  }, [barberDebtsList]);

  /** Invalida o cache de clientes e revalida listas */
  const invalidateClients = () => {
    if (barberContext.barbeiroId) {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.clientes(barberContext.barbeiroId),
      });
    }
    queryClient.invalidateQueries({
      queryKey: ["tenant-clientes"],
    });
    queryClient.invalidateQueries({
      queryKey: ["barber-pending-debts-list"],
    });
    if (viewId) {
      queryClient.invalidateQueries({
        queryKey: ["client-subscription-detail", viewId],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-pending-debt", viewId],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-pending-debt-screen", viewId],
      });
    }
    refetchTenantClients();
  };

  /* ── Realtime: assinaturas + usos do plano ──
     Atualiza a lista quando um cliente assina, cancela ou tem o plano alterado
     em qualquer aplicativo (cliente, admin ou barbearia), e também quando um
     uso de plano é registrado/liberado (para refletir "cortes usados" em tempo real). */
  useEffect(() => {
    const channelKey = barberContext.tenantId || barberContext.barbeiroId || barberContext.userId || "global";

    const handleChange = () => {
      invalidateClients();
    };

    const channel = supabase
      .channel(`barber-clientes-realtime-${channelKey}-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assinaturas" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "plano_agendamentos_usos" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenant_clientes" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos_plano_barbearia" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "debitos_cancelamento" }, handleChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [barberContext.barbeiroId, barberContext.tenantId, barberContext.userId, viewId]);

  /* ── Realtime específico para o cliente sendo visualizado em detalhes ── */
  useEffect(() => {
    if (!viewId) return;

    const handleDetailChange = () => {
      queryClient.invalidateQueries({
        queryKey: ["client-subscription-detail", viewId],
      });
      invalidateClients();
    };

    const channel = supabase
      .channel(`barber-client-view-${viewId}-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assinaturas", filter: `user_id=eq.${viewId}` }, handleDetailChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "plano_agendamentos_usos", filter: `user_id=eq.${viewId}` }, handleDetailChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "debitos_cancelamento", filter: `cliente_id=eq.${viewId}` }, handleDetailChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewId]);

  /* ─── Active list source based on view mode ─── */
  const activeClients = viewMode === "todos" ? allTenantClients : clients;

  /* ─── Single client detail fresh query (prevents cache discrepancy) ─── */
  const { data: detailActivePlan, isFetched: detailFetched } = useClientSubscriptionDetail(
    viewId,
    barberTenantId || barberContext.tenantId
  );

  const baseClient = useMemo(() => {
    if (!viewId) return null;
    return activeClients.find((c) => c.id === viewId) || null;
  }, [activeClients, viewId]);

  const activeClient = useMemo(() => {
    if (!baseClient) return null;
    if (detailFetched) {
      return {
        ...baseClient,
        activePlan: detailActivePlan !== undefined ? detailActivePlan : baseClient.activePlan,
      };
    }
    return baseClient;
  }, [baseClient, detailFetched, detailActivePlan]);

  /* ─── Consulta débito de cancelamento pendente do cliente em visualização ─── */
  const { data: activeClientDebt } = useQuery({
    queryKey: ["client-pending-debt", viewId],
    queryFn: async () => {
      if (!viewId) return null;
      return checkClientPendingCancellationDebt(viewId);
    },
    enabled: !!viewId,
    staleTime: 1000 * 15,
  });

  /* ─── Filtered list ─── */
  const filteredClients = useMemo(() => {
    let list = activeClients;
    if (planFilterOnly) {
      list = list.filter((c) => !!c.activePlan);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.telefone?.includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [activeClients, search, planFilterOnly]);

  const totalClients = activeClients.length;
  

  /* ─── Mutations ─── */
  const blockMutation = useBlockClient();
  const unblockMutation = useUnblockClient();
  const unblockSpecificMutation = useUnblockSpecific();
  const removeMutation = useRemoveClient();
  const confirmarPlanoMutation = useConfirmarPagamentoPlano();
  const deleting = removeMutation.isPending;

  const [quitarPlanDialogOpen, setQuitarPlanDialogOpen] = useState(false);
  const [clientToQuitarPlan, setClientToQuitarPlan] = useState<BarberClient | null>(null);
  const [formaPagamentoPlano, setFormaPagamentoPlano] = useState<"dinheiro" | "pix" | "cartao">("dinheiro");

  const handleQuitarPlan = async () => {
    if (!clientToQuitarPlan?.activePlan) return;
    try {
      await confirmarPlanoMutation.mutateAsync({
        assinaturaId: clientToQuitarPlan.activePlan.assinatura_id,
        userId: clientToQuitarPlan.id,
        planoNome: clientToQuitarPlan.activePlan.plano_nome,
        formaPagamento: formaPagamentoPlano,
      });
      setQuitarPlanDialogOpen(false);
      setClientToQuitarPlan(null);
      invalidateClients();
    } catch (err: any) {
      console.warn("Falha no invoke Edge Function confirm-plan-payment, tentando fallback direto:", err);
      try {
        const nextBilling = new Date();
        nextBilling.setDate(nextBilling.getDate() + 30);
        const { error: directError } = await supabase
          .from("assinaturas")
          .update({
            status: "active",
            cash_payment_confirmed: true,
            next_billing_date: nextBilling.toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientToQuitarPlan.activePlan.assinatura_id);

        if (directError) throw directError;

        const competenciaMonth = new Date().toISOString().slice(0, 7) + "-01";
        await supabase.from("pagamentos_plano_barbearia").insert({
          assinatura_id: clientToQuitarPlan.activePlan.assinatura_id,
          user_id: clientToQuitarPlan.id,
          barbeiro_id: barberContext.barbeiroId,
          confirmado_por: barberContext.userId,
          valor: clientToQuitarPlan.activePlan.preco_mensal || 0,
          competencia: competenciaMonth,
          observacoes: `Forma de pagamento: ${formaPagamentoPlano.toUpperCase()}`,
        });

        toast.success("Pagamento confirmado! Plano liberado.");
        setQuitarPlanDialogOpen(false);
        setClientToQuitarPlan(null);
        invalidateClients();
      } catch (fallbackErr: any) {
        console.error("Erro ao quitar plano:", fallbackErr);
        toast.error(fallbackErr?.message || "Erro ao quitar plano");
      }
    }
  };

  /* ─── Block / unblock ─── */
  const canManageTenantWideBlock = barberContext.canManageTenantWideClientBlock;

  /* Selective unblock dialog state */
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [clientToUnblock, setClientToUnblock] = useState<BarberClient | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);

  const handleAddIncludedCut = async (client: BarberClient) => {
    if (!client.activePlan?.assinatura_id) return;

    const promise = new Promise(async (resolve, reject) => {
      try {
        const { error } = await supabase.from("plano_agendamentos_usos").insert({
          assinatura_id: client.activePlan!.assinatura_id,
          user_id: client.id,
          competencia: new Date().toISOString().slice(0, 10),
          agendamento_id: null,
        });

        if (error) throw error;
        
        // Atualizar lista local via TanStack Query e cache sincronizado
        invalidateClients();
        
        resolve(true);
      } catch (err) {
        reject(err);
      }
    });

    toast.promise(promise, {
      loading: "Registrando uso do plano...",
      success: "Corte debitado com sucesso!",
      error: (err: any) => err.message || "Erro ao registrar uso do plano",
    });
  };

  const confirmBlock = (client: BarberClient) => {
    setClientToBlock(client);
    setBlockDialogOpen(true);
  };

  /** Desbloquear — abre dialog seletivo se múltiplos bloqueios, senão ação direta */
  const handleUnblockClient = (client: BarberClient) => {
    if (!barberTenantId) return;

    // Filtrar bloqueios que este barbeiro pode remover
    const removableBlocks = canManageTenantWideBlock
      ? client.blockDetails
      : client.blockDetails.filter(
          (d) => d.scope === "barber" && d.barbeiro_id === barberContext.barbeiroId
        );

    if (removableBlocks.length === 0) {
      toast.error("Você não tem permissão para remover esses bloqueios");
      return;
    }

    if (removableBlocks.length === 1) {
      // Ação direta — remove o único bloqueio
      unblockSpecificMutation.mutate({
        blockIds: [removableBlocks[0].id],
        clientId: client.id,
        barbeiroId: barberContext.barbeiroId,
      });
    } else {
      // Múltiplos bloqueios → abrir dialog seletivo
      setClientToUnblock(client);
      setSelectedBlockIds(removableBlocks.map((b) => b.id));
      setUnblockDialogOpen(true);
    }
  };

  /** Confirmar remoção seletiva de bloqueios */
  const handleConfirmSelectiveUnblock = () => {
    if (!clientToUnblock || selectedBlockIds.length === 0) return;
    unblockSpecificMutation.mutate(
      {
        blockIds: selectedBlockIds,
        clientId: clientToUnblock.id,
        barbeiroId: barberContext.barbeiroId,
      },
      {
        onSuccess: () => {
          setUnblockDialogOpen(false);
          setClientToUnblock(null);
          setSelectedBlockIds([]);
        },
      }
    );
  };

  /** Bloquear — chamado pelo BlockClientModal */
  const handleBlockConfirm = (params: { scope: "barber" | "unit" | "tenant"; unidadesIds?: string[]; motivo?: string }) => {
    if (!clientToBlock || !barberTenantId) return;
    blockMutation.mutate(
      {
        clientId: clientToBlock.id,
        tenantId: barberTenantId,
        barbeiroId: barberContext.barbeiroId,
        blockedByUserId: barberContext.userId,
        scope: params.scope,
        unidadesIds: params.unidadesIds,
      },
      {
        onSuccess: () => {
          setBlockDialogOpen(false);
          setClientToBlock(null);
        },
      }
    );
  };

  /* ─── Remove from list (tenant-scoped) ─── */
  const openDeleteDialog = (client: BarberClient) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleRemoveClient = () => {
    if (!clientToDelete || !barberTenantId) return;
    removeMutation.mutate(
      {
        clientId: clientToDelete.id,
        tenantId: barberTenantId,
        barbeiroId: barberContext.barbeiroId,
      },
      {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setClientToDelete(null);
        },
      }
    );
  };

  /* ─── Cancelar plano do cliente ───
     Atualiza o status da assinatura para 'cancelled'. RLS permite que o
     tenant_admin/barbeiro do mesmo tenant atualize a assinatura. O realtime
     em assinaturas dispara a atualização da lista para todos os usuários. */
  const handleCancelPlan = async () => {
    if (!clientToCancelPlan?.activePlan) return;
    setCancellingPlan(true);
    try {
      const { error } = await supabase
        .from("assinaturas")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", clientToCancelPlan.activePlan.assinatura_id);
      if (error) throw error;
      toast.success("Plano cancelado com sucesso");
      setCancelPlanDialogOpen(false);
      setClientToCancelPlan(null);
      invalidateClients();
    } catch (err: any) {
      console.error("Erro ao cancelar plano:", err);
      toast.error(err?.message || "Erro ao cancelar plano");
    } finally {
      setCancellingPlan(false);
    }
  };

  const openClientView = (id: string) => {
    setSearchParams({ view: id });
  };

  const goBack = () => {
    setSearchParams({});
  };

  /* ─── Loading ─── */
  if (loading) {
    return <ListSkeleton rows={8} showAvatar />;
  }

  // ═══════════════════════════════════
  // ADD CLIENT FULL-SCREEN VIEW
  // ═══════════════════════════════════
  if (addClientOpen) {
    return (
      <AddClientScreen
        onBack={() => setAddClientOpen(false)}
        onClientAdded={() => {
          setAddClientOpen(false);
          invalidateClients();
        }}
        tenantId={barberTenantId || undefined}
      />
    );
  }

  if (clientToConvert) {
    return (
      <ClientPlanConversionScreen
        client={clientToConvert}
        tenantId={barberTenantId || barberContext.tenantId || null}
        currentUserId={barberContext.userId}
        lockedBarbeiroId={viewMode === "meus" ? barberContext.barbeiroId : null}
        unitId={viewMode === "todos" ? selectedUnitId : null}
        onBack={() => setClientToConvert(null)}
        onConverted={() => {
          // Remove apenas o viewId, preservando demais filtros (unit/scope) na URL.
          // NÃO limpamos a lista local (setAllTenantClients) — isso causava
          // o flash de "0 clientes" enquanto o realtime/refetch chegava.
          setClientToConvert(null);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete("view");
            return next;
          });
          invalidateClients();
        }}
      />
    );
  }

  if (viewingAllVisitsClient) {
    return (
      <ClientAllVisitsScreen
        client={viewingAllVisitsClient}
        onBack={() => setViewingAllVisitsClient(null)}
      />
    );
  }

  if (viewingDebtClient) {
    return (
      <ClientCancellationDebtScreen
        client={viewingDebtClient}
        barbeiroId={barberContext.barbeiroId}
        tenantId={barberTenantId || barberContext.tenantId}
        onBack={() => {
          setViewingDebtClient(null);
          invalidateClients();
        }}
      />
    );
  }

  // ═══════════════════════════════════
  // CLIENT DETAIL FULL-PAGE VIEW
  // ═══════════════════════════════════
  if (viewId) {
    if (!activeClient && (loading || loadingAllClients)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />
        </div>
      );
    }

    if (!activeClient) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Users className="w-10 h-10 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Cliente não encontrado</p>
          <button onClick={goBack} className="text-xs text-primary hover:underline">Voltar</button>
        </div>
      );
    }

    const client = activeClient;

    return (
      <div className="pb-8">
        {/* Header no padrão oficial com botão Voltar */}
        <ScheduleHeader
          title={client.nome}
          onBack={goBack}
          right={
            client.blocked ? (
              <div className="flex flex-wrap gap-1 justify-end">
                {client.blockDetails.map((d) => (
                  <BlockBadge key={d.id} detail={d} />
                ))}
              </div>
            ) : null
          }
        />

        <div className="mx-auto w-full max-w-md pb-6 space-y-3.5 pt-2">
          {/* ── CARD PRINCIPAL: INFORMAÇÕES DE CONTATO ── */}
          <div className="px-4">
            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3.5 shadow-sm">
              {/* Telefone */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Phone className="w-4 h-4 text-foreground/70" />
                  <span className="text-[13px] font-medium">Telefone</span>
                </div>
                {client.telefone ? (
                  <button
                    type="button"
                    onClick={() => openWhatsApp(client.telefone)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums hover:opacity-80 active:scale-95 transition-all"
                    title="Conversar no WhatsApp"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>{client.telefone}</span>
                  </button>
                ) : (
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Não informado
                  </span>
                )}
              </div>

              <div className="h-px bg-border/40" />

              {/* Email */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Mail className="w-4 h-4 text-foreground/70 flex-shrink-0" />
                  <span className="text-[13px] font-medium">Email</span>
                </div>
                <span className="text-[13px] font-semibold text-foreground truncate">
                  {client.email || "Não informado"}
                </span>
              </div>

              <div className="h-px bg-border/40" />

              {/* Total de Agendamentos */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Calendar className="w-4 h-4 text-foreground/70" />
                  <span className="text-[13px] font-medium">Total de visitas</span>
                </div>
                <span className="text-[13px] font-semibold text-foreground tabular-nums">
                  {client.total_agendamentos} {client.total_agendamentos === 1 ? "agendamento" : "agendamentos"}
                </span>
              </div>
            </div>
          </div>

          {/* ── CARD PLANO / FIDELIDADE (Apenas se tiver plano ativo ou pontos) ── */}
          {client.activePlan && (
            <div className="px-4">
              <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CalendarCheck className="w-4 h-4 text-foreground/80 stroke-[1.8] flex-shrink-0" />
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">Uso do Plano</p>
                      <p className="text-[10px] text-muted-foreground truncate">{client.activePlan.plano_nome}</p>
                    </div>
                  </div>
                  <span className="text-[15px] font-bold text-foreground tabular-nums">
                    {client.activePlan.usados}/{client.activePlan.limite}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {Array.from({ length: client.activePlan.limite }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 flex-1 min-w-[14px] rounded-full transition-all",
                        i < client.activePlan.usados ? "bg-foreground" : "bg-secondary"
                      )}
                    />
                  ))}
                </div>
                {client.activePlan.usados >= client.activePlan.limite ? (
                  <p className="text-[11px] font-medium text-amber-500">Limite mensal atingido</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {client.activePlan.limite - client.activePlan.usados}{" "}
                    {client.activePlan.limite - client.activePlan.usados === 1 ? "corte restante" : "cortes restantes"}
                  </p>
                )}

                {/* Detalhes de renovação e pagamento */}
                <div className="pt-2 border-t border-border/40 space-y-2 text-[11.5px] text-muted-foreground">
                  {client.activePlan.is_pending_cash && (
                    <div className="flex justify-between items-center">
                      <span>Status do pagamento</span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-foreground/[0.06] border border-border/80 text-foreground tabular-nums">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        A cobrar R$ {client.activePlan.preco_mensal.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Próxima renovação</span>
                    <span className="font-medium text-foreground">
                      {client.activePlan.next_billing_date
                        ? format(new Date(client.activePlan.next_billing_date + "T12:00:00"), "dd/MM/yyyy")
                        : "Não definida"}
                    </span>
                  </div>
                  {client.activePlan.barbeiro_responsavel_nome && (
                    <div className="flex justify-between">
                      <span>Responsável</span>
                      <span className="font-medium text-foreground">{client.activePlan.barbeiro_responsavel_nome}</span>
                    </div>
                  )}

                  {client.activePlan.is_pending_cash && (
                    <div className="pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setClientToQuitarPlan(client);
                          setQuitarPlanDialogOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 h-10 rounded-full bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/90 active:scale-[0.99] transition-all shadow-xs"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Quitar pagamento do plano
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}



          {!client.activePlan && loyaltyEnabled && client.pontos > 0 && (
            <div className="px-4">
              <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Award className="w-4 h-4 text-amber-500 stroke-[1.8] flex-shrink-0" />
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">Programa Fidelidade</p>
                      <p className="text-[10px] text-muted-foreground">Pontos acumulados</p>
                    </div>
                  </div>
                  <span className="text-[15px] font-bold text-foreground tabular-nums">
                    {client.pontos}/8
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 flex-1 min-w-[12px] rounded-full transition-all",
                        i < client.pontos ? "bg-amber-500" : "bg-secondary"
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── CARD HISTÓRICO DE VISITAS (Últimas visitas - máx. 3) ── */}
          <div className="px-4">
            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Últimas visitas (máx. 3)
                </p>
                <button
                  type="button"
                  onClick={() => setViewingAllVisitsClient(client)}
                  className="text-[11.5px] font-semibold text-foreground/80 hover:text-foreground hover:underline"
                >
                  Ver todas
                </button>
              </div>
              <ClientHistorySection
                clientUserId={client.id}
                onViewAll={() => setViewingAllVisitsClient(client)}
              />
            </div>
          </div>

          {/* ── AÇÕES ── */}
          <div className="px-4 pt-1 space-y-3">
            {/* Ações em Card Agrupado */}
            <div className="rounded-2xl bg-card border border-border/60 overflow-hidden divide-y divide-border/40 shadow-sm">
              {client.activePlan && (
                <>
                  <ActionRow
                    icon={Scissors}
                    label="Adicionar corte incluso"
                    onClick={() => handleAddIncludedCut(client)}
                  />
                  <ActionRow
                    icon={X}
                    label="Cancelar plano do cliente"
                    onClick={() => {
                      setClientToCancelPlan(client);
                      setCancelPlanDialogOpen(true);
                    }}
                    destructive
                  />
                </>
              )}

              <ActionRow
                icon={Banknote}
                label="Taxa de cancelamento"
                badge={
                  activeClientDebt ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold tabular-nums">
                      R$ {activeClientDebt.valor_taxa.toFixed(2).replace(".", ",")} pendente
                    </span>
                  ) : (
                    <span className="text-[11.5px] font-medium text-muted-foreground/60">
                      Em dia
                    </span>
                  )
                }
                onClick={() => setViewingDebtClient(client)}
              />

              <ActionRow
                icon={client.blocked ? CheckCircle : Ban}
                label={client.blocked ? "Desbloquear cliente" : "Bloquear cliente"}
                onClick={() => (client.blocked ? handleUnblockClient(client) : confirmBlock(client))}
                disabled={unblockSpecificMutation.isPending || unblockMutation.isPending}
                loading={unblockSpecificMutation.isPending || unblockMutation.isPending}
              />
              <ActionRow
                icon={Trash2}
                label="Remover da lista"
                onClick={() => openDeleteDialog(client)}
                destructive
              />
            </div>

            {/* Detalhes dos bloqueios ativos */}
            {client.blocked && client.blockDetails.length > 0 && (
              <div className="mt-3 rounded-2xl border border-border/60 bg-secondary/20 p-3.5 space-y-1.5 shadow-sm">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                  Bloqueios ativos
                </p>
                {client.blockDetails.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <BlockBadge detail={d} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dialogs */}
        <BlockClientModal
          open={blockDialogOpen}
          onOpenChange={setBlockDialogOpen}
          client={clientToBlock}
          tenantId={barberTenantId}
          barbeiroId={barberContext.barbeiroId}
          blockedByUserId={barberContext.userId}
          canManageTenantWide={canManageTenantWideBlock}
          onConfirm={handleBlockConfirm}
          isPending={blockMutation.isPending}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
                <Trash2 className="w-4 h-4 text-destructive" />
                Remover cliente
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[12px] space-y-2">
                <p>
                  Remover <span className="text-foreground font-medium">{clientToDelete?.nome}</span> da sua lista de clientes?
                </p>
                <p className="text-[10px] text-muted-foreground">
                  O cliente será removido da sua lista, mas poderá agendar novamente no futuro.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting} className="h-8 text-[11px]">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveClient}
                disabled={deleting}
                className="h-8 text-[11px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Removendo...</>
                ) : (
                  "Confirmar remoção"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cancel Plan Dialog */}
        <AlertDialog open={cancelPlanDialogOpen} onOpenChange={setCancelPlanDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
                <X className="w-4 h-4 text-destructive" />
                Cancelar plano
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[12px] space-y-2">
                <p>
                  Cancelar o plano de{" "}
                  <span className="text-foreground font-medium">{clientToCancelPlan?.nome}</span>?
                </p>
                <p className="text-[10px] text-muted-foreground">
                  O cliente voltará a ser um cliente comum e perderá os benefícios do plano imediatamente.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancellingPlan} className="h-8 text-[11px]">
                Voltar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelPlan}
                disabled={cancellingPlan}
                className="h-8 text-[11px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancellingPlan ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Cancelando...</>
                ) : (
                  "Cancelar plano"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Quitar Plan Payment Drawer (Gaveta) */}
        <Drawer open={quitarPlanDialogOpen} onOpenChange={setQuitarPlanDialogOpen}>
          <DrawerContent className="max-w-md mx-auto rounded-t-[28px] border-t border-border/60 bg-background px-5 pb-8 pt-2">
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-12 h-12 rounded-full bg-foreground/5 border border-border/60 flex items-center justify-center mx-auto text-foreground mb-2.5">
                <Banknote className="w-6 h-6 stroke-[1.8]" />
              </div>
              <DrawerTitle className="text-[18px] font-semibold tracking-tight text-foreground">
                Confirmar pagamento do plano
              </DrawerTitle>
              <DrawerDescription className="text-[13px] text-muted-foreground leading-relaxed mt-1 max-w-xs">
                Confirmar recebimento de <span className="font-semibold text-foreground">R$ {clientToQuitarPlan?.activePlan?.preco_mensal ? clientToQuitarPlan.activePlan.preco_mensal.toFixed(2).replace('.', ',') : '0,00'}</span> referente ao plano <span className="font-semibold text-foreground">{clientToQuitarPlan?.activePlan?.plano_nome}</span>?
              </DrawerDescription>
            </div>

            <div className="pt-4 pb-1 space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground block text-left">
                Forma de pagamento
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "dinheiro", label: "Dinheiro" },
                  { id: "pix", label: "PIX" },
                  { id: "cartao", label: "Cartão" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormaPagamentoPlano(opt.id as any)}
                    className={cn(
                      "h-11 rounded-xl text-[13px] font-medium border transition-all flex items-center justify-center active:scale-95",
                      formaPagamentoPlano === opt.id
                        ? "bg-foreground text-background border-foreground font-semibold shadow-xs"
                        : "bg-secondary/40 text-foreground border-border/60 hover:bg-secondary/70"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 space-y-2.5">
              <button
                type="button"
                onClick={handleQuitarPlan}
                disabled={confirmarPlanoMutation.isPending}
                className="w-full h-12 rounded-full bg-foreground text-background text-[13.5px] font-semibold hover:bg-foreground/90 active:scale-[0.99] transition-all shadow-xs flex items-center justify-center gap-2"
              >
                {confirmarPlanoMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Confirmando...</>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Sim, confirmar pagamento
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setQuitarPlanDialogOpen(false)}
                disabled={confirmarPlanoMutation.isPending}
                className="w-full h-9 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar
              </button>
            </div>
          </DrawerContent>
        </Drawer>

        {/* Selective Unblock Dialog */}
        <AlertDialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Remover bloqueios
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-[12px] space-y-3">
                  <p>
                    Selecione quais bloqueios remover de{" "}
                    <span className="text-foreground font-medium">{clientToUnblock?.nome}</span>:
                  </p>
                  <div className="space-y-2">
                    {(clientToUnblock?.blockDetails || [])
                      .filter((d) =>
                        canManageTenantWideBlock
                          ? true
                          : d.scope === "barber" && d.barbeiro_id === barberContext.barbeiroId
                      )
                      .map((d) => (
                        <label
                          key={d.id}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/30 hover:bg-secondary/30 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selectedBlockIds.includes(d.id)}
                            onCheckedChange={(checked) => {
                              setSelectedBlockIds((prev) =>
                                checked
                                  ? [...prev, d.id]
                                  : prev.filter((id) => id !== d.id)
                              );
                            }}
                          />
                          <BlockBadge detail={d} />
                        </label>
                      ))}
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={unblockSpecificMutation.isPending}
                className="h-8 text-[11px]"
              >
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmSelectiveUnblock}
                disabled={unblockSpecificMutation.isPending || selectedBlockIds.length === 0}
                className="h-8 text-[11px] bg-emerald-600 text-foreground hover:bg-emerald-700"
              >
                {unblockSpecificMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Removendo...</>
                ) : (
                  `Remover ${selectedBlockIds.length} bloqueio(s)`
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ═══════════════════════════════════
  // CLIENT LISTING PAGE
  // ═══════════════════════════════════
  return (
    <div className="pb-28 lg:pb-12">
      {!hideHeader && (
        <ScheduleHeader
          title="Clientes"
          onBack={onBack ? onBack : () => navigate(`${basePath}/config-barbearia`)}
          right={
            <span className="text-[12px] text-muted-foreground/70 font-medium tabular-nums">
              {filteredClients.length} {filteredClients.length === 1 ? "cliente" : "clientes"}
            </span>
          }
        />
      )}

      <div className="px-4 pt-3 space-y-3.5">
        <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
          {viewMode === "todos"
            ? "Visualize todos os clientes cadastrados da barbearia, histórico de visitas e status de planos."
            : "Visualize os clientes que realizaram agendamentos com você e o histórico de atendimentos."}
        </p>

        {/* ── View Mode Toggle: Todos / Meus ── */}
        {showViewModeToggle && (
          <div className="flex bg-secondary/40 rounded-xl p-1 border border-border/20">
            <button
              onClick={() => setViewMode("meus")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200",
                viewMode === "meus"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground/70 hover:text-foreground"
              )}
            >
              <User className="w-4 h-4" />
              Meus Clientes
            </button>
            <button
              onClick={() => setViewMode("todos")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200",
                viewMode === "todos"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground/70 hover:text-foreground"
              )}
            >
              <Users className="w-4 h-4" />
              Todos os Clientes
            </button>
          </div>
        )}

        {/* ── Unit Selector Pills (only for "Todos" mode with units) ── */}
        {viewMode === "todos" && units.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setSelectedUnitId(null)}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all",
                !selectedUnitId
                  ? "bg-foreground text-background border-foreground shadow-xs font-semibold"
                  : "bg-secondary/30 text-muted-foreground border-border/30 hover:bg-secondary/50"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              Todas as unidades
            </button>
            {units.map((unit) => (
              <button
                key={unit.id}
                onClick={() => setSelectedUnitId(selectedUnitId === unit.id ? null : unit.id)}
                className={cn(
                  "flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all",
                  selectedUnitId === unit.id
                    ? "bg-foreground text-background border-foreground shadow-xs font-semibold"
                    : "bg-secondary/30 text-muted-foreground border-border/30 hover:bg-secondary/50"
                )}
              >
                {unit.nome}
              </button>
            ))}
          </div>
        )}

        {/* ── Search Bar: Fluida e Nativa Apple HIG ── */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full h-11 pl-10 pr-9 rounded-xl bg-secondary/50 dark:bg-white/[0.05] border border-border/40 focus:border-foreground/30 focus:bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/50 transition-all outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center text-foreground/70 active:scale-90 transition-all"
              aria-label="Limpar busca"
            >
              <X className="w-3 h-3" strokeWidth={2.2} />
            </button>
          )}
        </div>

        {/* ── Filtro rápido de planos ── */}
        {planFilterOnly && (
          <div className="flex items-center">
            <button
              onClick={() => setPlanFilterOnly(false)}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 h-7 rounded-full bg-foreground text-background text-[11px] font-semibold tracking-tight active:scale-95 transition-transform shadow-xs"
              aria-label="Remover filtro de planos"
            >
              <CreditCard className="w-3 h-3" />
              Apenas clientes com plano
              <X className="w-3 h-3 opacity-80" />
            </button>
          </div>
        )}

        {/* ── Pending plan payments ── */}
        {viewMode === "meus" && (
          <PendingPlanPayments barbeiroId={barberContext.barbeiroId} />
        )}

        {/* ── Banner de Clientes com Taxas Pendentes ── */}
        {barberDebtsList.length > 0 && (
          <button
            type="button"
            onClick={() => setDebitosModalOpen(true)}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/[0.08] hover:bg-amber-500/[0.12] border border-amber-500/25 text-left transition-all active:scale-[0.99] shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                  {barberDebtsList.length} {barberDebtsList.length === 1 ? "cliente com taxa pendente" : "clientes com taxas pendentes"}
                </p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                  Gerenciar débitos de cancelamento/falta e liberar clientes
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-600/70 dark:text-amber-400/70 shrink-0" />
          </button>
        )}

        {/* ── Loading indicator ── */}
        {viewMode === "todos" && loadingAllClients && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* ── Client List: Fluida diretamente na tela (sem card de fundo) ── */}
        {!loadingAllClients && filteredClients.length === 0 ? (
          <div className="py-14 text-center">
            <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground/25" strokeWidth={1.5} />
            <p className="text-[14px] font-semibold text-foreground">
              {search
                ? "Nenhum cliente encontrado"
                : viewMode === "meus"
                ? "Nenhum cliente atendido por você ainda"
                : "Nenhum cliente nesta seleção"}
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {search
                ? "Tente ajustar o termo de busca ou telefone"
                : viewMode === "meus"
                ? "Clientes que agendarem com você aparecerão aqui"
                : "Selecione outra unidade ou limpe os filtros"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/25">
            <AnimatePresence mode="popLayout">
              {filteredClients.map((client, index) => (
                <motion.button
                  key={client.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(index * 0.015, 0.2) }}
                  onClick={() => openClientView(client.id)}
                  className="w-full flex items-center gap-3.5 py-3.5 px-1 sm:px-2 text-left hover:opacity-80 active:opacity-60 transition-opacity"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-2xl bg-foreground/10 border border-border/40 flex items-center justify-center">
                      <span className="text-[15px] font-bold text-foreground">
                        {client.nome.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Informações */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] font-semibold text-foreground truncate">{client.nome}</p>
                    <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                      {client.telefone || client.email || "Sem telefone cadastrado"}
                    </p>
                  </div>

                  {/* Lado Direito */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11.5px] text-muted-foreground tabular-nums hidden sm:inline">
                      {client.total_agendamentos} {client.total_agendamentos === 1 ? "agendamento" : "agendamentos"}
                    </span>
                    {clientsWithDebtSet.has(client.id) && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold tabular-nums">
                        Taxa pendente
                      </span>
                    )}
                    {client.activePlan ? (
                      <div className="flex items-center gap-1.5">
                        {client.activePlan.is_pending_cash && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 tabular-nums">
                            A cobrar
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-secondary/80 text-foreground/80 border border-border/40 text-[10.5px] font-medium">
                          Plano
                        </span>
                      </div>
                    ) : client.blocked ? (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-medium">
                        Bloqueado
                      </span>
                    ) : client.pontos > 0 ? (
                      <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-[10px] font-medium text-amber-500 border border-amber-500/20 tabular-nums">
                        <Award className="w-3 h-3 stroke-[1.8]" />
                        {client.pontos}
                      </span>
                    ) : null}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" strokeWidth={1.8} />
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* FAB expansível — Filtro de planos + Adicionar cliente */}
      {!viewId && typeof document !== "undefined" && createPortal(
        <div
          className={cn(
            "fixed z-[90] flex flex-col items-end gap-3",
            isMobile
              ? "bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4"
              : "bottom-6 right-6",
          )}
        >
          {/* Mini ações (aparecem com animação) */}
          <AnimatePresence>
            {fabOpen && (
              <>
                <motion.button
                  key="filter-plans"
                  initial={{ opacity: 0, y: 12, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.85 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  onClick={() => {
                    setPlanFilterOnly((v) => !v);
                    setFabOpen(false);
                  }}
                  className="flex items-center gap-3 pr-5 pl-2 h-12 rounded-full bg-background border border-border/40 shadow-lg active:scale-95 hover:scale-[1.02] transition-transform"
                  aria-label={planFilterOnly ? "Ver todos os clientes" : "Mostrar apenas clientes com plano"}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      planFilterOnly ? "bg-foreground text-background" : "bg-secondary text-foreground",
                    )}
                  >
                    <CreditCard className="w-4 h-4" />
                  </span>
                  <span className="text-[13.5px] font-semibold tracking-tight text-foreground">
                    {planFilterOnly ? "Mostrar todos" : "Apenas planos"}
                  </span>
                </motion.button>

                <motion.button
                  key="add-client"
                  initial={{ opacity: 0, y: 12, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.85 }}
                  transition={{ duration: 0.18, ease: "easeOut", delay: 0.04 }}
                  onClick={() => {
                    setAddClientOpen(true);
                    setFabOpen(false);
                  }}
                  className="flex items-center gap-3 pr-5 pl-2 h-12 rounded-full bg-background border border-border/40 shadow-lg active:scale-95 hover:scale-[1.02] transition-transform"
                  aria-label="Adicionar cliente"
                >
                  <span className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center">
                    <UserPlus className="w-4 h-4" />
                  </span>
                  <span className="text-[13.5px] font-semibold tracking-tight text-foreground">
                    Adicionar cliente
                  </span>
                </motion.button>
              </>
            )}
          </AnimatePresence>

          {/* Botão principal — tamanho padrão do sistema (w-12 h-12) */}
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
            onClick={() => setFabOpen((v) => !v)}
            className={cn(
              "relative w-12 h-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center active:scale-95 hover:opacity-90 transition-all",
            )}
            aria-label={fabOpen ? "Fechar menu" : "Abrir menu de ações"}
            aria-expanded={fabOpen}
          >
            <motion.span
              animate={{ rotate: fabOpen ? 90 : 0, scale: fabOpen ? 0.9 : 1 }}
              transition={{ duration: 0.2 }}
              className="flex"
            >
              {fabOpen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
            </motion.span>
            {/* Indicador de filtro ativo */}
            {planFilterOnly && !fabOpen && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-background" />
            )}
          </motion.button>
        </div>,
        document.body,
      )}

      <AnimatePresence>
        {clientToConvert && (
          <div className="fixed inset-0 z-[100] bg-background pt-[env(safe-area-inset-top)]">
            <ClientPlanConversionScreen
              client={clientToConvert}
              tenantId={barberTenantId || barberContext.tenantId || null}
              currentUserId={barberContext.userId}
              lockedBarbeiroId={viewMode === "meus" ? barberContext.barbeiroId : null}
              unitId={viewMode === "todos" ? selectedUnitId : null}
              onBack={() => setClientToConvert(null)}
              onConverted={() => {
                setClientToConvert(null);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("view");
                  return next;
                });
                invalidateClients();
              }}
            />
          </div>
        )}
      </AnimatePresence>

      <BarberDebitosPendentesModal
        open={debitosModalOpen}
        onOpenChange={setDebitosModalOpen}
        barbeiroId={barberContext.barbeiroId}
        tenantId={barberTenantId || barberContext.tenantId}
        onDebtUpdated={invalidateClients}
      />
    </div>
  );
}

/* ═══ Block Badge ═══ */

const BLOCK_BADGE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  barber: {
    label: "Bloqueado por você",
    icon: UserX,
    className: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  unit: {
    label: "Bloqueado na unidade",
    icon: Building2,
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  tenant: {
    label: "Bloqueado na barbearia",
    icon: Ban,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

function BlockBadge({ detail }: { detail: BlockDetail }) {
  const config = BLOCK_BADGE_CONFIG[detail.scope] || BLOCK_BADGE_CONFIG.barber;
  const Icon = config.icon;
  const label =
    detail.scope === "unit" && detail.unidade_nome
      ? `Bloqueado: ${detail.unidade_nome}`
      : config.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
        config.className
      )}
      title={detail.scope === "unit" ? detail.unidade_nome || undefined : undefined}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

/* ═══ Reusable Sub-components ═══ */

function KpiCard({
  icon: Icon,
  label,
  value,
  accentClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4 text-center shadow-sm">
      <Icon className={cn("w-4 h-4 mx-auto mb-1.5", accentClass || "text-foreground/70")} />
      <p className="text-[16px] font-bold text-foreground leading-none tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1.5">{label}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40 last:border-b-0">
      <Icon className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
      <span className="text-[11px] text-muted-foreground uppercase tracking-[0.08em] w-20 flex-shrink-0">
        {label}
      </span>
      <span className="text-[13px] font-medium text-foreground truncate flex-1">{value}</span>
    </div>
  );
}

/* ─── ActionRow: linha de ação minimalista (lista agrupada) ─── */
function ActionRow({
  icon: Icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
  loading = false,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 px-4 h-12 text-left transition-colors",
        "hover:bg-secondary/40 active:bg-secondary/60",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
      ) : (
        <Icon
          className={cn(
            "w-4 h-4 flex-shrink-0",
            destructive ? "text-destructive" : "text-muted-foreground"
          )}
          strokeWidth={1.8}
        />
      )}
      <span
        className={cn(
          "text-[13.5px] font-medium tracking-tight flex-1",
          destructive ? "text-destructive" : "text-foreground"
        )}
      >
        {label}
      </span>
      {badge}
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
}
