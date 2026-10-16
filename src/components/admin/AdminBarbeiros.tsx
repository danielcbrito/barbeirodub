import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { useToggleBarberAtivo, useDeletarBarbeiro } from "@/hooks/useAdminMutations";
import { toast } from "sonner";
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
import {
  Search,
  Users,
  Loader2,
  Trash2,
  AlertTriangle,
  Inbox,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  Copy,
  Check,
  Phone,
  Mail,
  UserCheck,
  UserX,
  Sparkles,
  Percent,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

/* ─── Ícone SVG oficial do WhatsApp ─── */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      stroke="currentColor"
      strokeWidth="0"
      fill="currentColor"
      className={className}
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.83 7.34C8.63 7.34 8.43 7.35 8.25 7.68C8.04 8.06 7.42 8.64 7.42 9.85C7.42 11.06 8.3 12.23 8.42 12.39C8.55 12.56 10.15 15.02 12.6 16.08C13.18 16.33 13.64 16.48 13.99 16.59C14.58 16.78 15.12 16.75 15.54 16.69C16.01 16.62 16.99 16.1 17.19 15.52C17.4 14.95 17.4 14.46 17.34 14.36C17.27 14.25 17.1 14.19 16.84 14.06C16.58 13.93 15.34 13.32 15.11 13.23C14.88 13.15 14.71 13.11 14.54 13.36C14.37 13.61 13.88 14.19 13.73 14.36C13.58 14.53 13.44 14.55 13.18 14.42C12.93 14.29 12.11 14.02 11.14 13.16C10.39 12.49 9.88 11.66 9.73 11.41C9.58 11.16 9.71 11.02 9.84 10.9C9.96 10.78 10.1 10.6 10.23 10.45C10.36 10.3 10.4 10.19 10.48 10.02C10.57 9.85 10.53 9.7 10.46 9.57C10.4 9.44 9.9 8.23 9.69 7.73C9.49 7.24 9.28 7.31 9.13 7.3C8.98 7.3 8.81 7.3 8.64 7.3L8.83 7.34Z" />
    </svg>
  );
}

/* ─── Tipagem ─── */
interface Barbeiro {
  id: string;
  apelido: string;
  ativo: boolean | null;
  comissao_pct: number | null;
  created_at: string | null;
  foto_url: string | null;
  google_calendar_connected: boolean | null;
  setup_completed: boolean | null;
  updated_at: string | null;
  user_id: string | null;
  email?: string | null;
  telefone?: string | null;
  nome_completo?: string | null;
  isAdmin?: boolean;
}

export interface AdminBarbeirosProps {
  basePath?: string;
  tenantId?: string | null;
  hideHeader?: boolean;
  onBack?: () => void;
}

export function AdminBarbeiros({
  basePath = "/admin",
  tenantId,
  hideHeader = false,
  onBack,
}: AdminBarbeirosProps = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = searchParams.get("view");

  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  /* Ações de aprovação/rejeição/remoção */
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Barbeiro | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Barbeiro | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Barbeiro | null>(null);

  /* Nível de Acesso */
  const [updatingRole, setUpdatingRole] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  /* ─── Resolver tenant_id específico ou do admin logado ─── */
  const [adminTenantId, setAdminTenantId] = useState<string | null | undefined>(
    tenantId !== undefined ? tenantId : undefined
  );

  useEffect(() => {
    if (tenantId !== undefined) {
      setAdminTenantId(tenantId);
      return;
    }

    const resolveAdminTenant = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: tenant } = await resolveOldestOwnedTenant<{ id: string }>(
        session.user.id,
        "id"
      );

      if (tenant?.id) {
        setAdminTenantId(tenant.id);
        return;
      }

      const { data: barber } = await supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("user_id", session.user.id)
        .not("tenant_id", "is", null)
        .maybeSingle();

      if (barber?.tenant_id) {
        setAdminTenantId(barber.tenant_id);
        return;
      }

      setAdminTenantId(null);
    };

    resolveAdminTenant();
  }, [tenantId]);

  useEffect(() => {
    if (adminTenantId === undefined) return;

    loadBarbeiros();

    const channel = supabase
      .channel(`admin-barbeiros-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "barbeiros" }, () => {
        loadBarbeiros();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminTenantId]);

  /* ─── Carga de Barbeiros da Barbearia ─── */
  const loadBarbeiros = async () => {
    if (adminTenantId === undefined) return;

    try {
      let query = supabase
        .from("barbeiros")
        .select(
          "id, apelido, foto_url, ativo, comissao_pct, user_id, tenant_id, unidade_id, setup_completed, google_calendar_connected, created_at, updated_at"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (adminTenantId === null) {
        query = query.is("tenant_id", null);
      } else {
        query = query.eq("tenant_id", adminTenantId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const barberIds = (data || []).map((b) => b.id);
      let privatesMap: Record<string, { email?: string; telefone?: string; nome_completo?: string }> = {};

      if (barberIds.length > 0) {
        const { data: privateData } = await supabase
          .from("barbeiros_private")
          .select("barbeiro_id, email, telefone, nome_completo")
          .in("barbeiro_id", barberIds);

        if (privateData) {
          privateData.forEach((p) => {
            privatesMap[p.barbeiro_id] = {
              email: p.email || undefined,
              telefone: p.telefone || undefined,
              nome_completo: p.nome_completo || undefined,
            };
          });
        }
      }

      // Buscar quais barbeiros possuem role tenant_admin ou admin
      const userIds = (data || [])
        .map((b) => b.user_id)
        .filter((uid): uid is string => Boolean(uid));

      const adminUserIds = new Set<string>();
      if (userIds.length > 0) {
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
          .in("role", ["tenant_admin", "admin"]);

        if (rolesData) {
          rolesData.forEach((r) => adminUserIds.add(r.user_id));
        }
      }

      const enriched: Barbeiro[] = (data || []).map((b) => ({
        ...b,
        email: privatesMap[b.id]?.email || null,
        telefone: privatesMap[b.id]?.telefone || null,
        nome_completo: privatesMap[b.id]?.nome_completo || null,
        isAdmin: b.user_id ? adminUserIds.has(b.user_id) : false,
      }));

      setBarbeiros(enriched);
    } catch (error) {
      console.error("Erro ao carregar barbeiros:", error);
      toast.error("Erro ao carregar equipe");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Link Oficial de Convite da Barbearia ─── */
  const inviteUrl = useMemo(() => {
    let origin = "https://barbeirodub.lovable.app";
    if (typeof window !== "undefined" && window.location.origin) {
      if (!window.location.origin.includes("localhost")) {
        origin = window.location.origin.replace("dubadmin.lovable.app", "barbeirodub.lovable.app");
      }
    }

    const params = new URLSearchParams();
    params.set("mode", "signup");
    params.set("invite", "barbeiro");
    if (adminTenantId) params.set("tenant", adminTenantId);

    return `${origin}/login?${params.toString()}`;
  }, [adminTenantId]);

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      toast.success("Link de cadastro de barbeiro copiado!");
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  const handleSendViaWhatsApp = () => {
    const mensagem = `Olá! Você foi convidado para fazer parte da nossa equipe na barbearia.\n\nClique no link abaixo para criar seu cadastro e configurar seus atendimentos:\n${inviteUrl}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(waUrl, "_blank");
  };

  /* ─── Alternar Papel: Barbeiro vs Administrador ─── */
  const handleToggleAdminRole = async (targetBarbeiro: Barbeiro, makeAdmin: boolean) => {
    if (!targetBarbeiro.user_id) {
      toast.error("Este barbeiro ainda não concluiu o vínculo da sua conta de login.");
      return;
    }
    setUpdatingRole(true);
    try {
      if (makeAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .upsert(
            { user_id: targetBarbeiro.user_id, role: "tenant_admin" as any },
            { onConflict: "user_id,role" }
          );
        if (error) throw error;

        setBarbeiros((prev) =>
          prev.map((b) => (b.id === targetBarbeiro.id ? { ...b, isAdmin: true } : b))
        );
        toast.success(`${targetBarbeiro.apelido} agora é Administrador com acesso total!`);
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", targetBarbeiro.user_id)
          .eq("role", "tenant_admin" as any);
        if (error) throw error;

        setBarbeiros((prev) =>
          prev.map((b) => (b.id === targetBarbeiro.id ? { ...b, isAdmin: false } : b))
        );
        toast.success(`${targetBarbeiro.apelido} agora tem acesso padrão de Barbeiro.`);
      }
    } catch (err: any) {
      console.error("Erro ao alterar nível de acesso:", err);
      toast.error(err?.message || "Erro ao alterar nível de acesso");
    } finally {
      setUpdatingRole(false);
    }
  };


  /* ─── Filtros Estratégicos: Pendentes de Aprovação vs Ativos ─── */
  const pendingBarbeiros = useMemo(() => {
    return barbeiros.filter((b) => b.ativo === false);
  }, [barbeiros]);

  const activeBarbeiros = useMemo(() => {
    let list = barbeiros.filter((b) => b.ativo === true);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (b) =>
          b.apelido.toLowerCase().includes(q) ||
          b.email?.toLowerCase().includes(q) ||
          b.nome_completo?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [barbeiros, searchTerm]);

  /* ─── Ações de Aprovação e Recusa ─── */
  const handleAprovarBarbeiro = async (barbeiro: Barbeiro) => {
    setApprovingId(barbeiro.id);
    try {
      const { error } = await supabase
        .from("barbeiros")
        .update({
          ativo: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", barbeiro.id);

      if (error) throw error;

      toast.success(`${barbeiro.apelido} foi aprovado e agora faz parte da equipe! 🎉`);
      setSearchParams({});
      loadBarbeiros();
    } catch (err: any) {
      console.error("Erro ao aprovar barbeiro:", err);
      toast.error(err?.message || "Erro ao aprovar barbeiro");
    } finally {
      setApprovingId(null);
    }
  };

  const handleRecusarBarbeiro = async () => {
    if (!rejectTarget) return;
    try {
      const { error } = await supabase
        .from("barbeiros")
        .delete()
        .eq("id", rejectTarget.id);

      if (error) throw error;

      toast.success("Solicitação de cadastro recusada.");
      setRejectTarget(null);
      setSearchParams({});
      loadBarbeiros();
    } catch (err: any) {
      console.error("Erro ao recusar cadastro:", err);
      toast.error(err?.message || "Erro ao recusar cadastro");
    }
  };

  /* ─── Desativação / Exclusão de Membro Ativo ─── */
  const toggleAtivoMutation = useToggleBarberAtivo(adminTenantId || "");
  const deletarMutation = useDeletarBarbeiro(adminTenantId || "");

  const handleToggleStatus = (barbeiro: Barbeiro) => {
    if (barbeiro.ativo) {
      setDeactivateTarget(barbeiro);
    } else {
      toggleAtivoMutation.mutate({
        barbeiroId: barbeiro.id,
        ativo: true,
      });
    }
  };

  const confirmDeactivate = () => {
    if (deactivateTarget) {
      toggleAtivoMutation.mutate({
        barbeiroId: deactivateTarget.id,
        ativo: false,
      });
      setDeactivateTarget(null);
    }
  };

  const handleDeleteBarbeiro = () => {
    if (!deleteTarget) return;
    deletarMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setSearchParams({});
      },
    });
  };

  const openBarberView = (id: string) => {
    setSearchParams({ view: id });
  };

  const goBack = () => {
    setSearchParams({});
    setRoleModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TELA 1: DETALHES DO BARBEIRO (APROVAÇÃO OU GESTÃO)
  // ═══════════════════════════════════════════════════════════
  if (viewId) {
    const barbeiro = barbeiros.find((b) => b.id === viewId);
    if (!barbeiro) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Users className="w-10 h-10 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Barbeiro não encontrado</p>
          <button onClick={goBack} className="text-xs text-primary hover:underline">
            Voltar
          </button>
        </div>
      );
    }

    const isPendingApproval = barbeiro.ativo === false;

    return (
      <div className="pb-10 min-h-app bg-background">
        <ScheduleHeader
          title={isPendingApproval ? "Revisar Solicitação" : barbeiro.apelido}
          onBack={goBack}
          right={
            isPendingApproval ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Em Análise
              </span>
            ) : null
          }
        />

        <div className="px-4 pt-4 space-y-5 max-w-md mx-auto">
          {/* Card de Perfil */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/20">
            <div className="w-16 h-16 rounded-2xl bg-foreground/5 border border-border/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {barbeiro.foto_url ? (
                <img src={barbeiro.foto_url} alt={barbeiro.apelido} className="w-16 h-16 object-cover" />
              ) : (
                <span className="text-2xl font-bold text-foreground">
                  {barbeiro.apelido.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-semibold text-foreground truncate">{barbeiro.apelido}</h2>
                {barbeiro.isAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-foreground/10 text-foreground border border-foreground/20 shrink-0">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground/75 truncate mt-0.5">
                {barbeiro.nome_completo || "Nome não informado"}
              </p>
              {barbeiro.created_at && (
                <p className="text-[11px] text-muted-foreground/50 mt-1">
                  Cadastrou em {format(new Date(barbeiro.created_at), "dd 'de' MMMM", { locale: ptBR })}
                </p>
              )}
            </div>
          </div>

          {/* Banner de Solicitação se estiver pendente */}
          {isPendingApproval && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[13px] font-semibold text-amber-500">Aguardando sua aprovação</p>
              </div>
              <p className="text-[12px] text-foreground/80 leading-relaxed">
                Este profissional realizou o cadastro pelo link de convite. Aprove o cadastro para liberar o acesso dele à agenda da barbearia.
              </p>
            </div>
          )}

          {/* ─── Informações do Profissional (Contato) ─── */}
          <div className="space-y-2">
            <h3 className="text-[13.5px] font-semibold text-foreground px-1">
              Informações do profissional
            </h3>
            <div className="rounded-2xl border border-border/20 bg-secondary/20 overflow-hidden divide-y divide-border/15">
              {/* Telefone */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-muted-foreground/60" />
                  <span className="text-[12.5px] text-muted-foreground">Telefone / WhatsApp</span>
                </div>
                {barbeiro.telefone ? (
                  <a
                    href={`https://wa.me/55${barbeiro.telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-emerald-500 hover:underline flex items-center gap-1.5"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    {barbeiro.telefone}
                  </a>
                ) : (
                  <span className="text-[12.5px] text-muted-foreground/50">Não informado</span>
                )}
              </div>

              {/* E-mail */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-muted-foreground/60" />
                  <span className="text-[12.5px] text-muted-foreground">E-mail</span>
                </div>
                <span className="text-[13px] text-foreground font-medium truncate max-w-[190px]">
                  {barbeiro.email || "Não informado"}
                </span>
              </div>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO DECISIVOS */}
          {isPendingApproval ? (
            /* ─── AÇÕES PARA BARBEIRO EM ANÁLISE ─── */
            <div className="space-y-2.5 pt-2">
              {/* Configuração Formal de Nível de Acesso */}
              <button
                type="button"
                disabled={updatingRole || !barbeiro.user_id}
                onClick={() => setRoleModalOpen(true)}
                className="w-full h-11 rounded-full text-[13px] font-medium flex items-center justify-between px-4 border border-border/25 bg-secondary/30 hover:bg-secondary/45 text-foreground transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-foreground/75" />
                  <span>Permissão de Acesso</span>
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  {updatingRole ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <span>{barbeiro.isAdmin ? "Administrador" : "Barbeiro"}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </>
                  )}
                </div>
              </button>

              <button
                type="button"
                disabled={approvingId === barbeiro.id}
                onClick={() => handleAprovarBarbeiro(barbeiro)}
                className="w-full h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[14.5px] flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50"
              >
                {approvingId === barbeiro.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Aprovar Barbeiro
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setRejectTarget(barbeiro)}
                className="w-full h-11 rounded-full text-destructive hover:bg-destructive/10 border border-destructive/25 font-semibold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <UserX className="w-4 h-4" />
                Recusar Cadastro
              </button>
            </div>
          ) : (
            /* ─── AÇÕES PARA BARBEIRO JÁ ATIVO ─── */
            <div className="space-y-2.5 pt-2">
              {/* Configuração Formal de Nível de Acesso (acima de Desativar Temporariamente) */}
              <button
                type="button"
                disabled={updatingRole || !barbeiro.user_id}
                onClick={() => setRoleModalOpen(true)}
                className="w-full h-11 rounded-full text-[13px] font-medium flex items-center justify-between px-4 border border-border/25 bg-secondary/30 hover:bg-secondary/45 text-foreground transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-foreground/75" />
                  <span>Permissão de Acesso</span>
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  {updatingRole ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <span>{barbeiro.isAdmin ? "Administrador" : "Barbeiro"}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </>
                  )}
                </div>
              </button>

              <button
                onClick={() => handleToggleStatus(barbeiro)}
                className={cn(
                  "w-full h-11 rounded-full text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 border",
                  barbeiro.ativo
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15"
                )}
              >
                {barbeiro.ativo ? "Desativar Temporariamente" : "Reativar Barbeiro"}
              </button>

              <button
                onClick={() => setDeleteTarget(barbeiro)}
                className="w-full h-11 rounded-full text-[13px] font-semibold flex items-center justify-center gap-2 text-destructive border border-destructive/20 hover:bg-destructive/10 transition-all active:scale-95"
              >
                Remover da Equipe
              </button>
            </div>
          )}
        </div>

        {/* Dialogs de Confirmação */}
        <AlertDialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
          <AlertDialogContent className="max-w-xs rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base font-semibold">
                Recusar solicitação?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground">
                O cadastro de {rejectTarget?.apelido} será recusado e o acesso à barbearia não será liberado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="h-9 text-xs rounded-full">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRecusarBarbeiro}
                className="h-9 text-xs rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Recusar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <RoleDialog
          open={roleModalOpen}
          onOpenChange={setRoleModalOpen}
          barbeiro={barbeiro}
          updating={updatingRole}
          onSelectRole={async (makeAdmin) => {
            await handleToggleAdminRole(barbeiro, makeAdmin);
            setRoleModalOpen(false);
          }}
        />

        <DeactivateDialog
          open={!!deactivateTarget}
          onOpenChange={(open) => !open && setDeactivateTarget(null)}
          barbeiro={deactivateTarget}
          onConfirm={confirmDeactivate}
        />

        <DeleteDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          barbeiro={deleteTarget}
          deleting={deletarMutation.isPending}
          onConfirm={handleDeleteBarbeiro}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TELA 2: LISTA DE BARBEIROS (ORGANIZADA & ESTRATÉGICA)
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="pb-28 min-h-app bg-background">
      {!hideHeader && (
        <ScheduleHeader
          title="Barbeiros & Equipe"
          onBack={onBack ? onBack : () => navigate(`${basePath}/configuracoes-perfil`)}
          right={
            <span className="text-[11px] text-muted-foreground/60 font-medium tabular-nums">
              {activeBarbeiros.length} {activeBarbeiros.length === 1 ? "ativo" : "ativos"}
            </span>
          }
        />
      )}

      <div className="px-4 pt-3 max-w-md mx-auto space-y-5">
        <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
          Cadastre profissionais, gerencie os barbeiros ativos da equipe e defina as permissões de acesso.
        </p>

        {/* ─── CARD ESTRATÉGICO: CONVITE DA BARBEARIA (1 CLIQUE) ─── */}
        <div className="p-4 rounded-3xl bg-secondary/35 border border-border/30 space-y-3 shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-foreground/80" />
            <h3 className="text-[14px] font-semibold text-foreground">Convidar Novo Barbeiro</h3>
          </div>
          <p className="text-[12px] text-muted-foreground/75 leading-relaxed">
            Envie este link para qualquer barbeiro entrar na sua equipe. Ao se cadastrar, o profissional passará pela sua aprovação.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="flex-1 h-10 rounded-full bg-foreground text-background hover:bg-foreground/90 font-semibold text-[12.5px] flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSendViaWhatsApp}
              className="flex-1 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[12.5px] flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 text-white" />
              WhatsApp
            </button>
          </div>
        </div>

        {/* ─── SEÇÃO DE CADASTROS EM ANÁLISE (EM DESTAQUE SE HOUVER) ─── */}
        {pendingBarbeiros.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="text-[14px] font-semibold text-amber-500">
                  Cadastros em análise
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 tabular-nums">
                {pendingBarbeiros.length}
              </span>
            </div>

            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {pendingBarbeiros.map((barbeiro) => (
                  <motion.button
                    key={barbeiro.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => openBarberView(barbeiro.id)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-left active:scale-[0.99] transition-all shadow-xs"
                  >
                    <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold text-[15px] shrink-0">
                      {barbeiro.apelido.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold text-foreground truncate">
                        {barbeiro.apelido}
                      </p>
                      <p className="text-[12px] text-muted-foreground/80 truncate mt-0.5">
                        {barbeiro.telefone || barbeiro.email || "Solicitação pendente"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-500">
                        Revisar
                      </span>
                      <ChevronRight className="w-4 h-4 text-amber-500/50" />
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ─── SEÇÃO DE EQUIPE ATIVA ─── */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[15px] font-semibold text-foreground">
              Equipe da barbearia
            </h3>
            <span className="text-[12px] text-muted-foreground/60 tabular-nums">
              {activeBarbeiros.length} {activeBarbeiros.length === 1 ? "profissional" : "profissionais"}
            </span>
          </div>

          {/* Barra de Pesquisa Minimalista sem divisor */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar profissional..."
              className="w-full h-11 pl-10 pr-9 rounded-2xl bg-secondary/40 border border-border/20 text-[13.5px] font-normal text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1.5 focus:ring-foreground/20 focus:border-foreground/30 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center text-muted-foreground active:scale-95 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Lista de Barbeiros Ativos */}
          {activeBarbeiros.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl bg-secondary/15 border border-border/20">
              <Inbox className="w-9 h-9 mx-auto text-muted-foreground/25 mb-2.5" strokeWidth={1.5} />
              <p className="text-[13.5px] font-semibold text-foreground">
                {searchTerm ? "Nenhum barbeiro encontrado" : "Nenhum barbeiro ativo"}
              </p>
              <p className="text-[12px] text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                {searchTerm
                  ? "Tente buscar com outro nome."
                  : "Envie o link de convite acima para adicionar profissionais à barbearia."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {activeBarbeiros.map((barbeiro, index) => (
                  <motion.button
                    key={barbeiro.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.02 }}
                    onClick={() => openBarberView(barbeiro.id)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-secondary/20 hover:bg-secondary/35 border border-border/20 text-left active:opacity-70 transition-all"
                  >
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-xl bg-foreground/5 border border-border/30 flex items-center justify-center overflow-hidden">
                        {barbeiro.foto_url ? (
                          <img
                            src={barbeiro.foto_url}
                            alt={barbeiro.apelido}
                            className="w-11 h-11 object-cover"
                          />
                        ) : (
                          <span className="text-[15px] font-bold text-foreground">
                            {barbeiro.apelido.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background bg-emerald-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14.5px] font-semibold text-foreground truncate">
                          {barbeiro.apelido}
                        </p>
                        {barbeiro.isAdmin && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-foreground/10 text-foreground border border-foreground/15 shrink-0">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted-foreground/60 truncate mt-0.5">
                        {barbeiro.telefone || barbeiro.email || "Ativo na barbearia"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30" strokeWidth={2} />
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Subcomponentes de Diálogo ─── */
function DeactivateDialog({
  open,
  onOpenChange,
  barbeiro,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiro: Barbeiro | null;
  onConfirm: () => void;
}) {
  if (!barbeiro) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xs rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold">
            Desativar {barbeiro.apelido}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            O barbeiro não aparecerá para agendamentos até ser reativado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-9 text-xs rounded-full">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="h-9 text-xs rounded-full bg-amber-600 text-white hover:bg-amber-700"
          >
            Desativar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  barbeiro,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiro: Barbeiro | null;
  deleting: boolean;
  onConfirm: () => void;
}) {
  if (!barbeiro) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xs rounded-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <AlertDialogTitle className="text-base font-semibold">
              Remover {barbeiro.apelido}?
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs text-muted-foreground space-y-2">
            <p>Esta ação removerá o barbeiro da barbearia.</p>
            <p className="text-[10px] text-destructive font-medium">Esta ação não pode ser desfeita.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={deleting} className="h-9 text-xs rounded-full">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="h-9 text-xs rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Removendo..." : "Remover"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RoleDialog({
  open,
  onOpenChange,
  barbeiro,
  updating,
  onSelectRole,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiro: Barbeiro | null;
  updating: boolean;
  onSelectRole: (makeAdmin: boolean) => Promise<void>;
}) {
  if (!barbeiro) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xs rounded-3xl p-5 border-border/30">
        <AlertDialogHeader className="space-y-1 text-left">
          <AlertDialogTitle className="text-[16px] font-semibold text-foreground">
            Permissão de Acesso
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12px] text-muted-foreground leading-relaxed">
            Defina o tipo de permissão de {barbeiro.apelido} no sistema.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-3">
          <button
            type="button"
            disabled={updating}
            onClick={() => onSelectRole(false)}
            className={cn(
              "w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between active:scale-[0.99]",
              !barbeiro.isAdmin
                ? "border-foreground bg-foreground/5 shadow-2xs"
                : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
            )}
          >
            <div>
              <p className="text-[13.5px] font-semibold text-foreground">Barbeiro</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Agenda pessoal, atendimentos e clientes
              </p>
            </div>
            {!barbeiro.isAdmin && <Check className="w-4 h-4 text-foreground shrink-0" />}
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={() => onSelectRole(true)}
            className={cn(
              "w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between active:scale-[0.99]",
              barbeiro.isAdmin
                ? "border-foreground bg-foreground/5 shadow-2xs"
                : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
            )}
          >
            <div>
              <p className="text-[13.5px] font-semibold text-foreground">Administrador</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Acesso total à gestão, finanças e barbearia
              </p>
            </div>
            {barbeiro.isAdmin && <Check className="w-4 h-4 text-foreground shrink-0" />}
          </button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={updating} className="w-full h-10 rounded-full text-xs font-semibold">
            Fechar
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
