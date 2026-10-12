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
import { Checkbox } from "@/components/ui/checkbox";
import { useBarberClientes, type BarberClient, type BlockDetail } from "@/hooks/useBarberClientes";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useBlockClient, useUnblockClient, useUnblockSpecific, useRemoveClient } from "@/hooks/useBarberMutations";
import { BlockClientModal } from "./BlockClientModal";
import { supabase } from "@/integrations/supabase/client";
import { ClientPlanConversionScreen } from "@/components/shared/ClientPlanConversionScreen";

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
}

/* ═══════════════════════════════════════ */
/*       BARBER CLIENTES COMPONENT         */
/* ═══════════════════════════════════════ */
export function BarberClientes({
  barberContext,
  basePath = "/barbeiro",
  forceViewMode,
  initialUnitId = null,
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
  const canAccessTenantClients = !!barberContext.isTenantAdmin && !!barberContext.tenantId;
  const resolvedForcedViewMode = forceViewMode && canAccessTenantClients ? forceViewMode : undefined;
  const showViewModeToggle = canAccessTenantClients && !resolvedForcedViewMode;
  const [viewMode, setViewMode] = useState<ViewMode>(resolvedForcedViewMode ?? "meus");

  /* ── Unit selector for "Todos" mode ── */
  const [units, setUnits] = useState<TenantUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialUnitId);

  /* ── All tenant client IDs by unit (for "Todos" mode) ── */
  const [allTenantClients, setAllTenantClients] = useState<BarberClient[]>([]);
  const [loadingAllClients, setLoadingAllClients] = useState(false);
  /** Bump para forçar refetch do modo "Todos" em mudanças realtime (assinaturas/usos). */
  const [allTenantTick, setAllTenantTick] = useState(0);

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

  /* ── Load ALL tenant clients when in "Todos" mode ── */
  useEffect(() => {
    if (viewMode !== "todos" || !barberContext.tenantId) {
      setAllTenantClients([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingAllClients(true);
      try {
        const tenantId = barberContext.tenantId!;

        /* Buscar barbeiros para excluir */
        const { data: allBarbeiros } = await supabase
          .from("barbeiros")
          .select("user_id")
          .not("user_id", "is", null);
        const barberUserIds = allBarbeiros?.map((b) => b.user_id).filter(Boolean) || [];

        /* Buscar IDs de barbeiros do tenant */
        const { data: tenantBarbersData } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("ativo", true);
        const tenantBarberIds = tenantBarbersData?.map((b) => b.id) || [];

        /* Buscar clientes manuais */
        const { data: tenantClientes } = await supabase
          .from("tenant_clientes")
          .select("user_id, created_at")
          .eq("tenant_id", tenantId);
        const manualClientIds = tenantClientes?.map((tc) => tc.user_id) || [];
        const tenantRegistrationMap: Record<string, string> = {};
        for (const tc of tenantClientes || []) {
          tenantRegistrationMap[tc.user_id] = tc.created_at;
        }

        /* Buscar agendamentos — opcionalmente filtrados por unidade */
        let agQuery = supabase
          .from("agendamentos")
          .select("user_id, barbeiro_id, unidade_id, data, created_at")
          .in("barbeiro_id", tenantBarberIds.length > 0 ? tenantBarberIds : ["__none__"]);

        if (selectedUnitId) {
          agQuery = agQuery.eq("unidade_id", selectedUnitId);
        }

        const { data: agendamentos } = await agQuery;
        const agClientIds = agendamentos?.map((a) => a.user_id) || [];
        const allClientIds = [...new Set([...agClientIds, ...manualClientIds])];

        if (allClientIds.length === 0) {
          if (!cancelled) { setAllTenantClients([]); setLoadingAllClients(false); }
          return;
        }

        /* Buscar perfis */
        let profilesQuery = supabase
          .from("profiles")
          .select("id, nome, telefone, created_at")
          .in("id", allClientIds);
        if (barberUserIds.length > 0) {
          profilesQuery = profilesQuery.not("id", "in", `(${barberUserIds.join(",")})`);
        }
        const { data: profiles } = await profilesQuery;
        const userIds = profiles?.map((p) => p.id) || [];

        if (userIds.length === 0) {
          if (!cancelled) { setAllTenantClients([]); setLoadingAllClients(false); }
          return;
        }

        /* Stats (incluindo contagem de agendamentos do mês corrente) */
        const monthPrefix = new Date().toISOString().slice(0, 7);
        const clientStats = new Map<string, { count: number; monthCount: number; lastDate: string | null }>();
        for (const ag of agendamentos || []) {
          const isThisMonth = typeof ag.data === "string" && ag.data.startsWith(monthPrefix);
          const existing = clientStats.get(ag.user_id);
          if (!existing) {
            clientStats.set(ag.user_id, { count: 1, monthCount: isThisMonth ? 1 : 0, lastDate: ag.data });
          } else {
            existing.count += 1;
            if (isThisMonth) existing.monthCount += 1;
            if (ag.data > (existing.lastDate || "")) existing.lastDate = ag.data;
          }
        }

        /* Pontos + bloqueios + assinaturas ativas */
        const [{ data: pontos }, { data: blocks }, { data: assinaturas }] = await Promise.all([
          supabase.from("pontos").select("user_id, pontos").in("user_id", userIds),
          supabase.from("client_booking_blocks").select("id, client_user_id, scope, barbeiro_id, unidade_id").eq("tenant_id", tenantId),
          supabase
            .from("assinaturas")
            .select("id, user_id, status, payment_method, barbeiro_id, created_at, next_billing_date, plano:planos(nome, limite_agendamentos_mes, tenant_id)")
            .in("user_id", userIds)
            .in("status", ["active", "pending_cash"]),
        ]);

        const blockMap: Record<string, BlockDetail[]> = {};
        for (const b of blocks || []) {
          const detail: BlockDetail = {
            id: b.id,
            scope: b.scope as BlockDetail["scope"],
            barbeiro_id: b.barbeiro_id,
            unidade_id: b.unidade_id,
            unidade_nome: null,
          };
          if (!blockMap[b.client_user_id]) blockMap[b.client_user_id] = [];
          blockMap[b.client_user_id].push(detail);
        }

        // Filtra assinaturas pelo tenant atual e calcula usos
        const tenantAssinaturas = (assinaturas || []).filter(
          (a: any) => a.plano && a.plano.tenant_id === tenantId,
        );
        const assinaturaIds = tenantAssinaturas.map((a: any) => a.id);
        const usosMap: Record<string, number> = {};
        if (assinaturaIds.length > 0) {
          const { data: usos } = await supabase
            .from("plano_agendamentos_usos")
            .select("assinatura_id")
            .in("assinatura_id", assinaturaIds)
            .is("released_at", null);
          for (const u of usos || []) {
            usosMap[u.assinatura_id] = (usosMap[u.assinatura_id] || 0) + 1;
          }
        }
        // Buscar nomes dos barbeiros responsáveis pelas assinaturas
        const respBarbeiroIds = [
          ...new Set(
            (tenantAssinaturas as any[])
              .map((a) => a.barbeiro_id)
              .filter((id): id is string => !!id),
          ),
        ];
        const respBarbeiroNomeMap: Record<string, string> = {};
        if (respBarbeiroIds.length > 0) {
          const { data: respBarbeiros } = await supabase
            .from("barbeiros")
            .select("id, apelido")
            .in("id", respBarbeiroIds);
          for (const b of respBarbeiros || []) {
            respBarbeiroNomeMap[b.id] = b.apelido || "Sem nome";
          }
        }
        const planMap: Record<string, BarberClient["activePlan"]> = {};
        for (const a of tenantAssinaturas as any[]) {
          const isPendingCash = a.status === "pending_cash";
          const limite = isPendingCash ? 1 : a.plano.limite_agendamentos_mes || 4;
          const usados = usosMap[a.id] || 0;
          const existing = planMap[a.user_id];
          if (existing && existing.status === "active" && a.status !== "active") continue;
          planMap[a.user_id] = {
            assinatura_id: a.id,
            plano_nome: a.plano.nome,
            limite,
            usados,
            restantes: Math.max(0, limite - usados),
            status: a.status,
            is_pending_cash: isPendingCash,
            barbeiro_responsavel_id: a.barbeiro_id || null,
            barbeiro_responsavel_nome: a.barbeiro_id ? respBarbeiroNomeMap[a.barbeiro_id] || null : null,
            created_at: a.created_at,
            next_billing_date: a.next_billing_date || null,
            payment_method: a.payment_method || null,
          };
        }

        const result: BarberClient[] = (profiles || []).map((p) => {
          const stats = clientStats.get(p.id);
          const details = blockMap[p.id] || [];
          const isBlocked = details.some(
            (d) => d.scope === "tenant" || d.scope === "unit" || (d.scope === "barber" && d.barbeiro_id === barberContext.barbeiroId)
          );
          return {
            id: p.id,
            nome: p.nome || "Sem nome",
            telefone: p.telefone || null,
            email: null,
            total_agendamentos: stats?.count || 0,
            agendamentos_mes: stats?.monthCount || 0,
            ultimo_agendamento: stats?.lastDate || null,
            pontos: (pontos || []).find((pt) => pt.user_id === p.id)?.pontos || 0,
            created_at: tenantRegistrationMap[p.id] || p.created_at,
            creditos: 0,
            blocked: isBlocked,
            blockDetails: details,
            activePlan: planMap[p.id] || null,
          };
        });

        result.sort((a, b) => {
          if (!a.ultimo_agendamento) return 1;
          if (!b.ultimo_agendamento) return -1;
          return b.ultimo_agendamento.localeCompare(a.ultimo_agendamento);
        });

        if (!cancelled) { setAllTenantClients(result); }
      } catch (err) {
        console.error("Error loading all tenant clients:", err);
      } finally {
        if (!cancelled) setLoadingAllClients(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, barberContext.tenantId, selectedUnitId, barberContext.barbeiroId, allTenantTick]);

  /* Add client full-screen */
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientToConvert, setClientToConvert] = useState<BarberClient | null>(null);

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

  /** Invalida o cache de clientes */
  const invalidateClients = () => {
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.barbeiro.clientes(barberContext.barbeiroId),
    });
  };

  /* ── Realtime: assinaturas + usos do plano ──
     Atualiza a lista quando um cliente assina, cancela ou tem o plano alterado
     em qualquer aplicativo (cliente, admin ou barbearia), e também quando um
     uso de plano é registrado/liberado (para refletir "cortes usados" em tempo real). */
  useEffect(() => {
    if (!barberContext.barbeiroId) return;

    const handleChange = () => {
      invalidateClients();
      // Força refetch do modo "Todos" também (que usa state local, não TanStack Query).
      setAllTenantTick((t) => t + 1);
    };

    const channel = supabase
      .channel(`barber-clientes-realtime-${barberContext.barbeiroId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assinaturas" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "plano_agendamentos_usos" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenant_clientes" }, handleChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberContext.barbeiroId]);

  /* ─── Active list source based on view mode ─── */
  const activeClients = viewMode === "todos" ? allTenantClients : clients;

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
  const deleting = removeMutation.isPending;

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
        
        // Atualizar lista local se necessário (embora o realtime já deva tratar)
        setAllTenantTick(t => t + 1);
        
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
      setAllTenantTick((t) => t + 1);
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
          // Força refetch do modo "Todos" imediatamente — o realtime confirma depois.
          setAllTenantTick((t) => t + 1);
        }}
      />
    );
  }

  // ═══════════════════════════════════
  // CLIENT DETAIL FULL-PAGE VIEW
  // ═══════════════════════════════════
  if (viewId) {
    const client = activeClients.find((c) => c.id === viewId);
    if (!client) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Users className="w-10 h-10 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Cliente não encontrado</p>
          <button onClick={goBack} className="text-xs text-primary hover:underline">Voltar</button>
        </div>
      );
    }

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header fixo */}
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
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1 truncate">
              {client.nome}
            </h1>
            {client.activePlan ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 bg-foreground text-background">
                Plano
              </span>
            ) : !client.blocked ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Ativo
              </span>
            ) : (
              <div className="flex flex-wrap gap-1 justify-end flex-shrink-0">
                {client.blockDetails.map((d) => (
                  <BlockBadge key={d.id} detail={d} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pt-5 space-y-6">
          {/* Avatar + nome */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-primary">
                {client.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-foreground truncate">{client.nome}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Cadastro em {format(new Date(client.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>

          {/* Faixa destacada do plano ativo */}
          {client.activePlan && (
            <div className="rounded-2xl border border-foreground/10 bg-foreground text-background px-4 py-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-background/60">
                  Cliente plano
                </p>
                <p className="text-[15px] font-semibold tracking-tight truncate mt-0.5">
                  {client.activePlan.plano_nome}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <p className="text-[22px] font-bold leading-none tabular-nums">
                  {client.activePlan.usados}
                  <span className="text-[13px] font-medium text-background/60">
                    /{client.activePlan.limite}
                  </span>
                </p>
                <p className="text-[10px] text-background/60 mt-1 uppercase tracking-wider">
                  cortes usados
                </p>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div
            className={cn(
              "grid gap-3",
              client.activePlan ? "grid-cols-2" : loyaltyEnabled ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            <KpiCard
              icon={Calendar}
              label="Agendamentos no mês"
              value={String(client.agendamentos_mes)}
            />
            {client.activePlan ? (
              <KpiCard
                icon={User}
                label="Responsável"
                value={client.activePlan.barbeiro_responsavel_nome || "—"}
              />
            ) : (
              loyaltyEnabled && (
                <KpiCard
                  icon={Award}
                  label="Pontos"
                  value={String(client.pontos)}
                  accentClass="text-amber-500"
                />
              )
            )}
          </div>

          {/* Detalhes do plano */}
          {client.activePlan && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
                Detalhes do plano
              </p>
              <div className="space-y-0 rounded-xl border border-border/30 overflow-hidden">
                <DetailRow
                  icon={Calendar}
                  label="Assinou em"
                  value={format(new Date(client.activePlan.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                />
                <DetailRow
                  icon={Calendar}
                  label="Próxima renovação"
                  value={
                    client.activePlan.next_billing_date
                      ? format(new Date(client.activePlan.next_billing_date + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : "Não definida"
                  }
                />
                <DetailRow
                  icon={CreditCard}
                  label="Pagamento"
                  value={
                    client.activePlan.payment_method === "cash"
                      ? "Dinheiro"
                      : client.activePlan.payment_method === "pix"
                      ? "PIX"
                      : client.activePlan.payment_method === "credit_card"
                      ? "Cartão de crédito"
                      : client.activePlan.payment_method || "Não informado"
                  }
                />
              </div>
            </div>
          )}

          {/* Dados de contato */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
              Informações de contato
            </p>
            <div className="space-y-0 rounded-xl border border-border/30 overflow-hidden">
              <DetailRow icon={Mail} label="Email" value={client.email || "Não informado"} />
              <DetailRow icon={Phone} label="Telefone" value={client.telefone || "Não informado"} />
            </div>
          </div>

          {/* Aviso quando não há programa de pontos (e não há plano ativo) */}
          {!loyaltyEnabled && !client.activePlan && (
            <p className="text-[11px] text-muted-foreground/60 px-1 -mt-2">
              Esta barbearia não tem programa de pontos.
            </p>
          )}

          {/* Ações */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
              Ações
            </p>

            {/* CTA primário monocromático */}
            <button
              onClick={() => openWhatsApp(client.telefone)}
              className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-foreground text-background hover:bg-foreground/90 active:scale-[0.99] transition-all duration-200 mb-3"
            >
              <img src={whatsappLogo} alt="" className="w-5 h-5" />
              <span className="text-[14px] font-semibold tracking-tight">Conversar no WhatsApp</span>
            </button>

            {/* Lista de ações secundárias agrupadas */}
            <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/30">
              {!client.activePlan && (
                <ActionRow
                  icon={CreditCard}
                  label="Transformar em plano"
                  onClick={() => setClientToConvert(client)}
                />
              )}

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
              <div className="mt-3 rounded-xl border border-border/30 bg-secondary/20 p-3 space-y-1.5">
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
    <div className="pb-28 lg:pb-8">
      {isMobile ? (
        <div className="-mx-3 -mt-3">
          {/* Header */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
            <div className="flex items-center gap-2.5 px-4 h-14">
              <button
                onClick={() => navigate(`${basePath}/configuracoes-perfil`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all lg:hidden"
                aria-label="Voltar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a4 4 0 0 1 4 4v1" />
                </svg>
              </button>
              <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Clientes</h1>
              <span className="text-[11px] text-muted-foreground/60 font-medium tabular-nums">
                {filteredClients.length} cliente{filteredClients.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* ── View Mode Toggle: Todos / Meus ── */}
            {showViewModeToggle && (
              <div className="px-4 pb-2">
                <div className="flex bg-secondary/40 rounded-xl p-1 border border-border/20">
                  <button
                    onClick={() => setViewMode("meus")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200",
                      viewMode === "meus"
                        ? "bg-foreground text-background shadow-md"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    <User className="w-4 h-4" />
                    Meus Clientes
                  </button>
                  <button
                    onClick={() => setViewMode("todos")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200",
                      viewMode === "todos"
                        ? "bg-foreground text-background shadow-md"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    <Users className="w-4 h-4" />
                    Todos os Clientes
                  </button>
                </div>
              </div>
            )}

            {/* ── Unit Selector Pills (only for "Todos" mode with units) ── */}
            {viewMode === "todos" && units.length > 1 && (
              <div className="px-4 pb-2">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setSelectedUnitId(null)}
                    className={cn(
                      "flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium border transition-all",
                      !selectedUnitId
                        ? "bg-foreground text-background border-foreground shadow-sm"
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
                        "flex-shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-medium border transition-all",
                        selectedUnitId === unit.id
                          ? "bg-foreground text-background border-foreground shadow-sm"
                          : "bg-secondary/30 text-muted-foreground border-border/30 hover:bg-secondary/50"
                      )}
                    >
                      {unit.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-4 pb-3 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou telefone..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/30 border border-border/20 text-[13px] font-normal text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
              </div>

              {/* Chip de filtro ativo */}
              {planFilterOnly && (
                <button
                  onClick={() => setPlanFilterOnly(false)}
                  className="mt-4 inline-flex items-center gap-1.5 pl-2.5 pr-2 h-7 rounded-full bg-foreground text-background text-[11px] font-semibold tracking-tight active:scale-95 transition-transform"
                  aria-label="Remover filtro de planos"
                >
                  <CreditCard className="w-3 h-3" />
                  Apenas planos
                  <X className="w-3 h-3 opacity-80" />
                </button>
              )}
            </div>
          </div>

          {/* Pending plan payments */}
          {viewMode === "meus" && (
            <div className="px-4 pt-3">
              <PendingPlanPayments barbeiroId={barberContext.barbeiroId} />
            </div>
          )}

          {/* Loading indicator for "Todos" mode */}
          {viewMode === "todos" && loadingAllClients && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Client list */}
          <div className="px-4 pt-2">
            {!loadingAllClients && filteredClients.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  {search
                    ? "Nenhum cliente encontrado"
                    : viewMode === "meus"
                    ? "Nenhum cliente atendido por você ainda"
                    : "Nenhum cliente nesta seleção"}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {search
                    ? "Tente ajustar a busca"
                    : viewMode === "meus"
                    ? "Clientes que agendarem com você aparecerão aqui"
                    : "Selecione outra unidade ou verifique os filtros"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                <AnimatePresence mode="popLayout">
                  {filteredClients.map((client, index) => (
                    <motion.button
                      key={client.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      onClick={() => openClientView(client.id)}
                      className="w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <span className="text-[14px] font-bold text-primary">
                            {client.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        {/* Status indicator — sempre ativo para barbeiro */}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background bg-emerald-500" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">{client.nome}</p>
                        <p className="text-[12px] text-muted-foreground/60 truncate mt-0.5">
                          {client.email || client.telefone || "Sem contato"}
                        </p>
                      </div>

                      {/* Right side badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {client.activePlan ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-foreground text-background text-[9px] font-bold uppercase tracking-wider">
                            Plano
                          </span>
                        ) : (
                          client.pontos > 0 && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-bold text-amber-500">
                              <Award className="w-2.5 h-2.5" />
                              {client.pontos}
                            </span>
                          )
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" strokeWidth={1.8} />
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ═══ DESKTOP LAYOUT ═══ */
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-lg font-bold text-foreground">Clientes</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalClients} cliente{totalClients !== 1 ? "s" : ""}{" "}
                {viewMode === "meus" ? "atendidos por você" : "da unidade selecionada"}
              </p>
            </div>
          </div>

          {/* View mode toggle (desktop) */}
          {showViewModeToggle && (
            <div className="mb-5">
              <div className="inline-flex bg-secondary/40 rounded-xl p-1 border border-border/20">
                <button
                  onClick={() => setViewMode("meus")}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                    viewMode === "meus"
                      ? "bg-foreground text-background shadow-md"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                >
                  <User className="w-4 h-4" />
                  Meus Clientes
                </button>
                <button
                  onClick={() => setViewMode("todos")}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                    viewMode === "todos"
                      ? "bg-foreground text-background shadow-md"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Todos os Clientes
                </button>
              </div>
            </div>
          )}

          {/* Unit pills (desktop) */}
          {viewMode === "todos" && units.length > 1 && (
            <div className="flex gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setSelectedUnitId(null)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-all",
                  !selectedUnitId
                    ? "bg-foreground text-background border-foreground"
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
                    "px-4 py-2 rounded-lg text-xs font-medium border transition-all",
                    selectedUnitId === unit.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-secondary/30 text-muted-foreground border-border/30 hover:bg-secondary/50"
                  )}
                >
                  {unit.nome}
                </button>
              ))}
            </div>
          )}

          {/* Pending plan payments */}
          {viewMode === "meus" && (
            <div className="mb-5">
              <PendingPlanPayments barbeiroId={barberContext.barbeiroId} />
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="h-9 pl-9 bg-muted/30 border-border/30 text-sm rounded-lg"
              />
            </div>
          </div>

          {/* Loading for "Todos" */}
          {viewMode === "todos" && loadingAllClients && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Grid */}
          {!loadingAllClients && filteredClients.length === 0 ? (
            <div className="rounded-xl border border-border/30 bg-card p-10 text-center">
              <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                {search
                  ? "Nenhum cliente encontrado"
                  : viewMode === "meus"
                  ? "Nenhum cliente atendido por você ainda"
                  : "Nenhum cliente nesta seleção"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredClients.map((client, idx) => (
                <motion.div
                  key={client.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.015 }}
                  onClick={() => openClientView(client.id)}
                  className="group cursor-pointer rounded-xl border border-border/30 bg-card p-5 transition-all hover:shadow-md hover:border-border/50"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {client.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{client.nome}</p>
                      <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
                        {client.email || client.telefone || "Sem contato"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground/50">
                        {client.total_agendamentos} agend.
                      </span>
                      {!client.activePlan && client.pontos > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500">
                          <Award className="w-3 h-3" />
                          {client.pontos}
                        </span>
                      )}
                    </div>
                    {client.activePlan ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-foreground text-background">
                        Plano
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-500">
                        Ativo
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

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
    <div className="rounded-xl bg-secondary/30 border border-border/20 p-3.5 text-center">
      <Icon className={cn("w-4 h-4 mx-auto mb-1.5", accentClass || "text-muted-foreground/50")} />
      <p className="text-[15px] font-bold text-foreground leading-none tabular-nums">{value}</p>
      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mt-1">{label}</p>
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-b-0">
      <Icon className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.08em] w-16 flex-shrink-0">
        {label}
      </span>
      <span className="text-[13px] text-foreground truncate flex-1">{value}</span>
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
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
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
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground/40 flex-shrink-0"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
