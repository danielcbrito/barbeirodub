import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useToggleClienteBloqueado, useToggleClienteBloqueadoGlobal } from "@/hooks/useAdminMutations";
import { AddClientScreen } from "@/components/shared/AddClientScreen";
import {
  Search,
  Mail,
  Phone,
  Award,
  Ban,
  CheckCircle,
  Trash2,
  Calendar,
  CreditCard,
  Inbox,
  ChevronRight,
  ChevronLeft,
  Users,
  Loader2,
  Wallet,
  UserPlus,
  Building2,
  User,
  Scissors,
  Crown,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { ClientPlanConversionScreen } from "@/components/shared/ClientPlanConversionScreen";

/* ─── Types ─── */
interface Client {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  blocked: boolean;
  created_at: string;
  email: string | null;
  pontos: number;
  total_agendamentos: number;
  plano: { id: string; assinatura_id: string; nome: string; status: string; created_at: string; next_billing_date: string | null } | null;
  creditos: number;
}

type FilterType = "all" | "active" | "blocked" | "plan";
type ViewMode = "todos" | "meus";

interface TenantUnit {
  id: string;
  nome: string;
}

/** Cor do indicador de status do cliente */
function getStatusColor(blocked: boolean) {
  return blocked ? "bg-destructive" : "bg-emerald-500";
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

/* ═══════════════════════════════════════ */
/*          MAIN COMPONENT                 */
/* ═══════════════════════════════════════ */
interface AdminClientesProps {
  basePath?: string;
  tenantId?: string;
  /** ID do barbeiro logado (para filtro "Meus Clientes") */
  barbeiroId?: string;
}

export function AdminClientes({ basePath = "/admin", tenantId, barbeiroId }: AdminClientesProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = searchParams.get("view");
  const requestedUnitId = searchParams.get("unit");
  /** Quando aberto via Perfil do barbeiro (?scope=mine), trava em "Meus Clientes" e oculta toggles/unidades */
  const forceMyClients = searchParams.get("scope") === "mine" && !!barbeiroId;

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  /* ── View mode: Todos vs Meus ── */
  const [viewMode, setViewMode] = useState<ViewMode>(forceMyClients ? "meus" : "todos");

  /* ── Unit selector ── */
  const [units, setUnits] = useState<TenantUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(requestedUnitId);

  /* ── Track per-barber client IDs for "Meus" filter ── */
  const [myClientIds, setMyClientIds] = useState<Set<string>>(new Set());

  /* Block dialog */
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [clientToBlock, setClientToBlock] = useState<Client | null>(null);

  /* Delete dialog */
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* Add client full-screen */
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientToConvert, setClientToConvert] = useState<Client | null>(null);




  /* ── Load units for tenant ── */
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from("tenant_unidades")
        .select("id, nome")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("is_sede", { ascending: false });
      setUnits(data || []);
    })();
  }, [tenantId]);

  useEffect(() => {
    setSelectedUnitId(requestedUnitId);
  }, [requestedUnitId]);

  useEffect(() => {
    loadClients();
    const channel = supabase
      .channel(`admin-clients-${tenantId || "global"}-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadClients())
      // Realtime: assinaturas + usos — reflete em tempo real quando um cliente assina,
      // cancela o plano ou tem um uso de corte registrado.
      .on("postgres_changes", { event: "*", schema: "public", table: "assinaturas" }, () => loadClients())
      .on("postgres_changes", { event: "*", schema: "public", table: "plano_agendamentos_usos" }, () => loadClients())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, selectedUnitId]);

  useEffect(() => {
    if (!viewId) return;
    const selectedClient = clients.find((c) => c.id === viewId);
    if (!selectedClient || selectedClient.email) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("manage-clients", {
          body: { action: "get-email", userId: selectedClient.id },
        });
        if (error || !data?.email || cancelled) return;
        setClients((prev) =>
          prev.map((client) =>
            client.id === selectedClient.id ? { ...client, email: data.email } : client
          )
        );
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, [viewId, clients]);

  /* ─── Data loading ─── */
  const loadClients = async () => {
    try {
      // Buscar barbeiros para excluir da lista de clientes
      const { data: barbeiros } = await supabase
        .from("barbeiros")
        .select("user_id")
        .not("user_id", "is", null);
      const barberUserIds = barbeiros?.map((b) => b.user_id).filter(Boolean) || [];

      // Dados tenant-scoped
      let tenantClientIds: string[] | null = null;
      let tenantBarberIds: string[] = [];
      let tenantRegistrationMap: Record<string, string> = {};
      let tenantBlockedMap: Record<string, boolean> = {};

      if (tenantId) {
        const [tenantBarbersRes, tenantClientesRes] = await Promise.all([
          supabase.from("barbeiros").select("id").eq("tenant_id", tenantId).eq("ativo", true),
          supabase.from("tenant_clientes").select("user_id, blocked, created_at").eq("tenant_id", tenantId),
        ]);

        tenantBarberIds = tenantBarbersRes.data?.map((b) => b.id) || [];
        const manualClients = tenantClientesRes.data || [];
        const manualClientIds = manualClients.map((tc) => tc.user_id);

        for (const tc of manualClients) {
          tenantBlockedMap[tc.user_id] = tc.blocked ?? false;
          tenantRegistrationMap[tc.user_id] = tc.created_at;
        }

        // Buscar agendamentos — opcionalmente filtrados por unidade
        let agQuery = supabase
          .from("agendamentos")
          .select("user_id, barbeiro_id, unidade_id")
          .in("barbeiro_id", tenantBarberIds.length > 0 ? tenantBarberIds : ["__none__"]);

        if (selectedUnitId) {
          agQuery = agQuery.eq("unidade_id", selectedUnitId);
        }

        const { data: agendamentos } = await agQuery;
        const agendamentoClientIds = agendamentos?.map((a) => a.user_id) || [];

        // Track "my" clients (agendamentos with this specific barber)
        if (barbeiroId) {
          const myIds = new Set(
            (agendamentos || [])
              .filter((a) => a.barbeiro_id === barbeiroId)
              .map((a) => a.user_id)
          );
          setMyClientIds(myIds);
        }

        tenantClientIds = [...new Set([...agendamentoClientIds, ...manualClientIds])];

        // Se filtrando por unidade, intersectar com os IDs da unidade
        if (selectedUnitId) {
          const unitClientIdSet = new Set(agendamentoClientIds);
          tenantClientIds = tenantClientIds.filter((id) => unitClientIdSet.has(id) || manualClientIds.includes(id));
        }
      }

      let profilesQuery = supabase
        .from("profiles")
        .select("id, nome, cpf, blocked, created_at, telefone")
        .order("created_at", { ascending: false });

      if (tenantClientIds !== null) {
        if (tenantClientIds.length === 0) {
          setClients([]);
          setLoading(false);
          return;
        }
        profilesQuery = profilesQuery.in("id", tenantClientIds);
      }

      if (barberUserIds.length > 0) {
        profilesQuery = profilesQuery.not("id", "in", `(${barberUserIds.join(",")})`);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;

      // Buscar emails via edge function
      let usersMap: Record<string, { email?: string }> = {};
      try {
        const response = await supabase.functions.invoke("manage-clients", {
          body: { action: "list" },
        });
        if (response.data?.users) usersMap = response.data.users;
      } catch {
        /* silent */
      }

      const userIds = profiles?.map((p) => p.id) || [];

      if (userIds.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      // Agendamentos filtrados por barbeiros do tenant
      let appointmentsQuery = supabase.from("agendamentos").select("user_id, created_at").in("user_id", userIds);
      if (tenantId && tenantBarberIds.length > 0) {
        appointmentsQuery = appointmentsQuery.in("barbeiro_id", tenantBarberIds);
      }

      const [{ data: pontos }, { data: appointments }, { data: assinaturas }, { data: creditos }] =
        await Promise.all([
          supabase.from("pontos").select("user_id, pontos").in("user_id", userIds),
          appointmentsQuery,
          supabase
            .from("assinaturas")
            .select("id, user_id, status, created_at, next_billing_date, plano_id, planos(nome)")
            .in("status", ["active", "pending_cash", "pending_renewal"])
            .in("user_id", userIds)
            .order("created_at", { ascending: false }),
          supabase.from("creditos").select("user_id, valor, usado").eq("usado", false).in("user_id", userIds),
        ]);

      const clientsData =
        profiles?.map((profile) => {
          const userData = usersMap[profile.id];
          const userPoints = pontos?.find((p) => p.user_id === profile.id);
          const userAppointments = appointments?.filter((a) => a.user_id === profile.id);
          const userSub = assinaturas?.find((a) => a.user_id === profile.id);
          const userCredits =
            creditos
              ?.filter((c) => c.user_id === profile.id)
              .reduce((sum, c) => sum + (c.valor || 0), 0) || 0;

          const isBlocked = tenantId ? (tenantBlockedMap[profile.id] ?? false) : (profile.blocked ?? false);

          let registrationDate = profile.created_at;
          if (tenantId) {
            if (tenantRegistrationMap[profile.id]) {
              registrationDate = tenantRegistrationMap[profile.id];
            } else if (userAppointments && userAppointments.length > 0) {
              const earliest = userAppointments.reduce(
                (min, a) => (a.created_at < min ? a.created_at : min),
                userAppointments[0].created_at
              );
              registrationDate = earliest;
            }
          }

          return {
            ...profile,
            blocked: isBlocked,
            created_at: registrationDate,
            email: userData?.email || null,
            pontos: userPoints?.pontos || 0,
            total_agendamentos: userAppointments?.length || 0,
            plano: userSub
              ? {
                  id: userSub.plano_id,
                  assinatura_id: (userSub as any).id,
                  nome: (userSub as any).planos?.nome || "Plano",
                  status: userSub.status,
                  created_at: userSub.created_at,
                  next_billing_date: userSub.next_billing_date,
                }
              : null,
            creditos: userCredits,
          };
        }) || [];

      setClients(clientsData);
      setLoading(false);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast.error("Erro ao carregar clientes");
      setLoading(false);
    }
  };

  /* ─── Filtered & searched list ─── */
  const filteredClients = useMemo(() => {
    let result = clients;

    // Apply "Meus Clientes" filter
    if (viewMode === "meus" && barbeiroId) {
      result = result.filter((c) => myClientIds.has(c.id));
    }

    switch (filter) {
      case "active":
        result = result.filter((c) => !c.blocked);
        break;
      case "blocked":
        result = result.filter((c) => c.blocked);
        break;
      case "plan":
        result = result.filter((c) => c.plano !== null);
        break;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.cpf?.includes(q)
      );
    }
    return result;
  }, [clients, filter, search, viewMode, myClientIds, barbeiroId]);

  /* ─── Stats ─── */
  const totalClients = viewMode === "meus" ? filteredClients.length : clients.length;

  const handleAddIncludedCut = async (client: Client) => {
    if (!client.plano?.assinatura_id) return;

    const promise = new Promise(async (resolve, reject) => {
      try {
        const { error } = await supabase.from("plano_agendamentos_usos").insert({
          assinatura_id: client.plano!.assinatura_id,
          user_id: client.id,
          competencia: new Date().toISOString().slice(0, 10),
          agendamento_id: null,
        });

        if (error) throw error;
        
        loadClients();
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

  /* ─── Block / unblock ─── */
  const toggleBlockMutation = useToggleClienteBloqueado(tenantId || "");
  const toggleBlockGlobalMutation = useToggleClienteBloqueadoGlobal();

  const confirmBlock = (client: Client) => {
    if (client.blocked) {
      if (tenantId) {
        toggleBlockMutation.mutate({ clienteId: client.id, bloqueado: false });
      } else {
        toggleBlockGlobalMutation.mutate({ clienteId: client.id, blocked: false });
      }
    } else {
      setClientToBlock(client);
      setBlockDialogOpen(true);
    }
  };

  const executeBlock = () => {
    if (!clientToBlock) return;
    const onDone = () => {
      setBlockDialogOpen(false);
      setClientToBlock(null);
    };
    if (tenantId) {
      toggleBlockMutation.mutate({ clienteId: clientToBlock.id, bloqueado: true }, { onSuccess: onDone });
    } else {
      toggleBlockGlobalMutation.mutate({ clienteId: clientToBlock.id, blocked: true }, { onSuccess: onDone });
    }
  };

  /* ─── Delete ─── */
  const openDeleteDialog = async (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
    if (!client.email) {
      try {
        const { data, error } = await supabase.functions.invoke("manage-clients", {
          body: { action: "get-email", userId: client.id },
        });
        if (!error && data?.email) {
          setClientToDelete((prev) => (prev ? { ...prev, email: data.email } : null));
        }
      } catch {
        /* silent */
      }
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    setDeleting(true);
    try {
      if (tenantId) {
        const { error } = await supabase
          .from("tenant_clientes")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("user_id", clientToDelete.id);
        if (error) throw error;
        toast.success("Cliente removido da lista");
      } else {
        const { data, error } = await supabase.functions.invoke("manage-clients", {
          body: { action: "delete", userId: clientToDelete.id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Cliente excluído com sucesso");
      }
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      loadClients();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Erro ao excluir cliente");
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Navigation helpers ─── */
  const openClientView = (id: string) => setSearchParams({ view: id });
  const goBack = () => setSearchParams({});

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
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
          loadClients();
        }}
        tenantId={tenantId}
      />
    );
  }

  // ═══════════════════════════════════
  // CLIENT PLAN CONVERSION (Moved to overlay pattern)
  // ═══════════════════════════════════
  // We handle this via the overlay at the end of the return statement
  // to ensure consistency with the AppointmentDetailsSidebar experience.

  // ═══════════════════════════════════
  // CLIENT DETAIL FULL-PAGE VIEW
  // ═══════════════════════════════════
  if (viewId) {
    const client = clients.find((c) => c.id === viewId);
    if (!client) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Users className="w-10 h-10 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Cliente não encontrado</p>
          <Button variant="outline" size="sm" onClick={goBack}>
            Voltar
          </Button>
        </div>
      );
    }

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header fixo */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-card border border-border/60 hover:bg-secondary/50 active:scale-95 transition-all text-foreground shrink-0 shadow-sm"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground flex-1 truncate">
              {client.nome}
            </h1>
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider flex-shrink-0",
                !client.blocked
                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              )}
            >
              {client.blocked ? "Bloqueado" : "Ativo"}
            </span>
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
                Cadastro em{" "}
                {format(new Date(client.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className={cn("grid gap-3", tenantId ? "grid-cols-2" : "grid-cols-3")}>
            <KpiCard icon={Calendar} label="Agendamentos" value={String(client.total_agendamentos)} />
            <KpiCard icon={Award} label="Pontos" value={String(client.pontos)} accentClass="text-amber-500" />
            {!tenantId && (
              <KpiCard
                icon={Wallet}
                label="Créditos"
                value={`R$ ${client.creditos.toFixed(0)}`}
                accentClass="text-purple-400"
              />
            )}
          </div>

          {/* Dados de contato */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2.5 px-1">
              Informações de contato
            </p>
            <div className="space-y-0 rounded-2xl bg-card border border-border/60 overflow-hidden shadow-sm">
              <DetailRow icon={Mail} label="Email" value={client.email || "Não informado"} />
              <DetailRow icon={Phone} label="Telefone" value={client.telefone || "Não informado"} />
            </div>
          </div>

          {/* Plano ativo */}
          {client.plano && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2.5 px-1">
                Plano ativo
              </p>
              <div className="rounded-2xl bg-card border border-border/60 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <CreditCard className="w-4 h-4 text-foreground/70" />
                    {client.plano.nome}
                  </span>
                  <span className="text-[10px] text-emerald-500 font-semibold px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full uppercase tracking-wider">
                    Ativo
                  </span>
                </div>
                {client.plano.next_billing_date && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Próxima renovação:{" "}
                    {format(new Date(client.plano.next_billing_date + "T12:00:00"), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Créditos — apenas admin global */}
          {!tenantId && client.creditos > 0 && !client.plano && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2.5 px-1">
                Créditos
              </p>
              <div className="rounded-2xl bg-card border border-border/60 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <Wallet className="w-4 h-4 text-foreground/70" />
                    Créditos disponíveis
                  </span>
                  <span className="text-[14px] font-bold text-foreground tabular-nums">
                    R$ {client.creditos.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Ações */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2.5 px-1">
              Ações
            </p>
            <div className="space-y-2">
              <button
                onClick={() => openWhatsApp(client.telefone)}
                className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 shadow-lg"
              >
                <img src={whatsappLogo} alt="WhatsApp" className="w-7 h-7" />
                <span className="text-[14px] font-semibold tracking-wide">Conversar no WhatsApp</span>
              </button>

              {client.plano && (
                <button
                  onClick={() => handleAddIncludedCut(client)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors"
                >
                  <Scissors className="w-4.5 h-4.5 text-foreground" />
                  <span className="text-[13px] font-medium text-foreground">Adicionar corte incluso</span>
                </button>
              )}

              <button
                onClick={() => setClientToConvert(client)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <CreditCard className="w-4.5 h-4.5 text-primary" />
                <span className="text-[13px] font-medium text-primary">Transformar cliente em plano</span>
              </button>

              <button
                onClick={() => confirmBlock(client)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors",
                  client.blocked
                    ? "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
                )}
              >
                {client.blocked ? (
                  <>
                    <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
                    <span className="text-[13px] font-medium text-emerald-400">Desbloquear cliente</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-4.5 h-4.5 text-amber-500" />
                    <span className="text-[13px] font-medium text-amber-500">Bloquear cliente</span>
                  </>
                )}
              </button>

              <button
                onClick={() => openDeleteDialog(client)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4.5 h-4.5 text-destructive" />
                <span className="text-[13px] font-medium text-destructive">
                  {tenantId ? "Remover cliente da lista" : "Excluir cliente permanentemente"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Dialogs */}
        <BlockDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen} client={clientToBlock} onConfirm={executeBlock} />
        <DeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          client={clientToDelete}
          deleting={deleting}
          onConfirm={handleDeleteClient}
          isTenant={!!tenantId}
        />
      </div>
    );
  }

  // ═══════════════════════════════════
  // CLIENT LISTING PAGE
  // ═══════════════════════════════════
  const showViewModeToggle = false;
  const showUnitPills = !forceMyClients;

  return (
    <div className="pb-28 lg:pb-8">
      {isMobile ? (
        <div className="-mx-3 -mt-3">
          {/* ── Header ── */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
            <div className="flex items-center gap-2.5 px-4 h-14">
              <button
                onClick={() => navigate(`${basePath}/configuracoes-perfil`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all lg:hidden"
                aria-label="Voltar"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-foreground"
                >
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
                </div>
              </div>
            )}

            {/* ── Unit Selector Pills (only for "Todos" mode with units) ── */}
            {viewMode === "todos" && showUnitPills && units.length > 1 && (
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

            {/* ── Segmented filter ── */}
            <div className="px-4 pb-2">
              <div className="flex bg-secondary/30 rounded-lg p-0.5 border border-border/20">
                {(
                  [
                    { key: "all" as FilterType, label: "Todos" },
                    { key: "active" as FilterType, label: "Ativos" },
                    { key: "blocked" as FilterType, label: "Bloqueados" },
                    { key: "plan" as FilterType, label: "Plano" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                      filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground/60"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Search ── */}
            <div className="px-4 pb-3 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou CPF..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/30 border border-border/20 text-[13px] font-normal text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
              </div>
            </div>
          </div>

          {/* ── Client list ── */}
          <div className="px-4 pt-2">
            {filteredClients.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  {search
                    ? "Nenhum cliente encontrado"
                    : viewMode === "meus"
                    ? "Nenhum cliente atendido por você ainda"
                    : "Nenhum cliente cadastrado"}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {search
                    ? "Tente ajustar a busca"
                    : viewMode === "meus"
                    ? "Clientes que agendarem com você aparecerão aqui"
                    : "Clientes aparecerão aqui ao se cadastrarem"}
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
                      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.3) }}
                      onClick={() => openClientView(client.id)}
                      className="w-full flex items-center gap-3 py-3.5 text-left border-b border-border/10 last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors rounded-lg px-1"
                    >
                      {/* Avatar with status dot */}
                      <div className="relative flex-shrink-0">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <span className="text-[15px] font-bold text-primary">
                            {client.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                            getStatusColor(client.blocked)
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-semibold text-foreground truncate">{client.nome}</p>
                          {client.plano && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                        </div>
                        {client.plano ? (
                          <div className="flex gap-2 mt-2">
                             <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddIncludedCut(client);
                                }}
                                className="h-8 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center gap-1.5 transition-all text-[10px] font-bold border border-primary/20"
                              >
                                <Scissors className="w-3 h-3" />
                                Debitar Corte
                              </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setClientToConvert(client);
                              }}
                              className="h-8 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-sm"
                            >
                              <Crown className="w-3 h-3" />
                              Assinar Plano
                            </button>
                          </div>
                        )}
                        <p className="text-[12px] text-muted-foreground/50 truncate mt-1">
                          {client.total_agendamentos} agendamento{client.total_agendamentos !== 1 ? "s" : ""}
                          {client.telefone && ` · ${client.telefone}`}
                        </p>
                      </div>


                      {/* Right side badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {client.pontos > 0 && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-bold text-amber-500">
                            <Award className="w-2.5 h-2.5" />
                            {client.pontos}
                          </span>
                        )}
                        {client.blocked && (
                          <span className="px-1.5 py-0.5 rounded-md bg-destructive/10 text-[9px] font-bold text-destructive">
                            Bloqueado
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30" strokeWidth={1.8} />
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
        <DesktopClientList
          clients={filteredClients}
          totalClients={totalClients}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          onViewClient={openClientView}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showViewModeToggle={showViewModeToggle}
          units={units}
          selectedUnitId={selectedUnitId}
          onUnitChange={setSelectedUnitId}
        />
      )}
      <AnimatePresence>
        {clientToConvert && (
          <div className="fixed inset-0 z-[100] bg-background pt-[env(safe-area-inset-top)]">
            <ClientPlanConversionScreen
              client={clientToConvert}
              tenantId={tenantId || null}
              currentUserId={null}
              lockedBarbeiroId={forceMyClients ? barbeiroId || null : null}
              unitId={!forceMyClients ? selectedUnitId : null}
              onBack={() => setClientToConvert(null)}
              onConverted={() => {
                setClientToConvert(null);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("view");
                  return next;
                });
                loadClients();
              }}
            />
          </div>
        )}
      </AnimatePresence>

      {/* FAB — Adicionar cliente */}
      {!viewId &&
        typeof document !== "undefined" &&
        createPortal(
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
            onClick={() => setAddClientOpen(true)}
            className={cn(
              "fixed z-[90] w-12 h-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center active:scale-95 hover:opacity-90 transition-all",
              isMobile ? "bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4" : "bottom-6 right-6"
            )}
            aria-label="Adicionar cliente"
          >
            <UserPlus className="w-5 h-5" />
          </motion.button>,
          document.body
        )}

      {/* Dialogs */}
      <BlockDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen} client={clientToBlock} onConfirm={executeBlock} />
      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        client={clientToDelete}
        deleting={deleting}
        onConfirm={handleDeleteClient}
        isTenant={!!tenantId}
      />
    </div>
  );
}

/* ═══════════════════════════════════ */
/*       DESKTOP CLIENT LIST           */
/* ═══════════════════════════════════ */
function DesktopClientList({
  clients,
  totalClients,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onViewClient,
  viewMode,
  onViewModeChange,
  showViewModeToggle,
  units,
  selectedUnitId,
  onUnitChange,
}: {
  clients: Client[];
  totalClients: number;
  search: string;
  onSearchChange: (q: string) => void;
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
  onViewClient: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  showViewModeToggle: boolean;
  units: TenantUnit[];
  selectedUnitId: string | null;
  onUnitChange: (id: string | null) => void;
}) {


  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Clientes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalClients} cliente{totalClients !== 1 ? "s" : ""}{" "}
            {viewMode === "meus" ? "atendidos por você" : "cadastrados"}
          </p>
        </div>
      </div>

      {/* View mode toggle */}
      {showViewModeToggle && (
        <div className="mb-5">
          <div className="inline-flex bg-secondary/40 rounded-xl p-1 border border-border/20">
            <button
              onClick={() => onViewModeChange("todos")}
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
            <button
              onClick={() => onViewModeChange("meus")}
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
          </div>
        </div>
      )}

      {/* Unit pills (desktop) */}
      {viewMode === "todos" && units.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button
            onClick={() => onUnitChange(null)}
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
              onClick={() => onUnitChange(selectedUnitId === unit.id ? null : unit.id)}
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

      {/* Filters + Search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex bg-secondary/30 rounded-lg p-0.5 border border-border/20">
          {(
            [
              { key: "all" as FilterType, label: "Todos" },
              { key: "active" as FilterType, label: "Ativos" },
              { key: "blocked" as FilterType, label: "Bloqueados" },
              { key: "plan" as FilterType, label: "Plano" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground/60"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nome, e-mail ou CPF..."
            className="h-9 pl-9 bg-muted/30 border-border/30 text-sm rounded-lg"
          />
        </div>
      </div>

      {/* Grid */}
      {clients.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card p-10 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {clients.map((client, idx) => (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(idx * 0.015, 0.3) }}
              onClick={() => onViewClient(client.id)}
              className={cn(
                "group cursor-pointer rounded-xl border border-border/30 bg-card p-5 transition-all hover:shadow-md hover:border-border/50",
                client.blocked && "opacity-60"
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {client.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                      getStatusColor(client.blocked)
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{client.nome}</p>
                    {client.plano && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
                    {client.email || client.telefone || "Sem contato"}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              {/* Desktop Quick Actions for Plans */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/10">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground/50">{client.total_agendamentos} agend.</span>
                  {client.pontos > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500">
                      <Award className="w-3 h-3" />
                      {client.pontos}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-full font-medium",
                      !client.blocked ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {client.blocked ? "Bloqueado" : "Ativo"}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
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

function BlockDialog({
  open,
  onOpenChange,
  client,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
            <Ban className="w-4 h-4 text-destructive" />
            Bloquear cliente
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12px]">
            Tem certeza que deseja bloquear{" "}
            <span className="text-foreground font-medium">{client?.nome}</span>? Ele não poderá mais agendar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-[11px]">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="h-8 text-[11px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Bloquear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  client,
  deleting,
  onConfirm,
  isTenant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  deleting: boolean;
  onConfirm: () => void;
  isTenant?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
            <Trash2 className="w-4 h-4 text-destructive" />
            {isTenant ? "Remover cliente" : "Excluir cliente"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12px] space-y-2">
            <p>
              {isTenant ? "Remover " : "Excluir "}
              <span className="text-foreground font-medium">{client?.nome}</span>
              {isTenant ? " da sua lista de clientes?" : " permanentemente?"}
            </p>
            {isTenant ? (
              <p className="text-[10px] text-muted-foreground">
                O cliente será removido da sua lista, mas poderá agendar novamente no futuro.
              </p>
            ) : (
              <>
                {client && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2.5">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      <span className="text-muted-foreground/70">E-mail:</span>{" "}
                      <span className="text-foreground">{client.email || "Não informado"}</span>
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-destructive font-medium">Esta ação não pode ser desfeita.</p>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting} className="h-8 text-[11px]">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="h-8 text-[11px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> {isTenant ? "Removendo..." : "Excluindo..."}
              </>
            ) : isTenant ? (
              "Confirmar remoção"
            ) : (
              "Confirmar exclusão"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
