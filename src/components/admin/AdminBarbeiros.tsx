import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { useToggleBarberAtivo, useDeletarBarbeiro } from "@/hooks/useAdminMutations";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Eye,
  EyeOff,
  Users,
  UserCheck,
  UserX,
  Loader2,
  Scissors,
  Mail,
  Phone,
  Lock,
  Trash2,
  AlertTriangle,
  Inbox,
  ChevronRight,
  Calendar,
  CreditCard,
  Percent,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ─── */
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
}

type FilterType = "all" | "active" | "inactive";

/* ═══════════════════════════════════════ */
/*          MAIN COMPONENT                 */
/* ═══════════════════════════════════════ */
interface AdminBarbeirosProps {
  basePath?: string;
  hideHeader?: boolean;
  onBack?: () => void;
}

export function AdminBarbeiros({
  basePath = "/admin",
  hideHeader = false,
  onBack,
}: AdminBarbeirosProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = searchParams.get("view");

  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCreateScreen, setShowCreateScreen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  /* Form fields */
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [nomeCompleto, setNomeCompleto] = useState("");

  /* Deactivate confirmation */
  const [deactivateTarget, setDeactivateTarget] = useState<Barbeiro | null>(null);

  /* Delete dialog */
  const [deleteTarget, setDeleteTarget] = useState<Barbeiro | null>(null);
  

  /* ─── Resolver tenant_id do admin logado ─── */
  const [adminTenantId, setAdminTenantId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const resolveAdminTenant = async () => {
      const { data: { session } } = await supabase.auth.getSession();
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
  }, []);

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

  /* ─── Data loading ─── */
  const loadBarbeiros = async () => {
    if (adminTenantId === undefined) return; // ainda resolvendo

    try {
      // Filtrar barbeiros pelo tenant do admin
      let query = supabase
        .from("barbeiros")
        .select("id, apelido, foto_url, ativo, comissao_pct, user_id, tenant_id, unidade_id, setup_completed, google_calendar_connected, created_at, updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (adminTenantId === null) {
        // Admin global → apenas barbeiros sem tenant
        query = query.is("tenant_id", null);
      } else {
        // Admin de tenant → apenas barbeiros desse tenant
        query = query.eq("tenant_id", adminTenantId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const barberIds = (data || []).map((b) => b.id);
      let emailsMap: Record<string, string> = {};

      if (barberIds.length > 0) {
        const { data: privateData } = await supabase
          .from("barbeiros_private")
          .select("barbeiro_id, email")
          .in("barbeiro_id", barberIds);

        if (privateData) {
          privateData.forEach((p) => {
            if (p.email) emailsMap[p.barbeiro_id] = p.email;
          });
        }
      }

      const enriched = (data || []).map((b) => ({
        ...b,
        email: emailsMap[b.id] || null,
      }));

      setBarbeiros(enriched);
    } catch (error) {
      console.error("Erro ao carregar barbeiros:", error);
      toast.error("Erro ao carregar barbeiros");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Filtered & searched list ─── */
  const filteredBarbeiros = useMemo(() => {
    let result = barbeiros;

    switch (filter) {
      case "active":
        result = result.filter((b) => b.ativo);
        break;
      case "inactive":
        result = result.filter((b) => !b.ativo);
        break;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          b.apelido.toLowerCase().includes(q) ||
          b.email?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [barbeiros, filter, searchTerm]);

  /* ─── Stats ─── */
  const totalBarbeiros = barbeiros.length;

  /* ─── Create barber ─── */
  const handleCreateBarbeiro = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim() || !email.trim() || !senha.trim() || !nomeCompleto.trim() || !cpf.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (senha.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-barber", {
        body: {
          email: email.trim(),
          password: senha,
          nome: nome.trim(),
          telefone: telefone.trim() || null,
          cpf: cpf.trim() || null,
          nome_completo: nomeCompleto.trim() || null,
        },
      });

      if (error) {
        let errorMsg = "Erro ao criar barbeiro";
        if (data?.error) {
          errorMsg = data.error;
        } else if (error?.message) {
          try {
            const match = error.message.match(/\{.*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              errorMsg = parsed.error || errorMsg;
            }
          } catch {
            errorMsg = error.message;
          }
        }
        toast.error(errorMsg);
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || "Erro ao criar barbeiro");
        return;
      }

      toast.success("Barbeiro cadastrado com sucesso!");
      resetForm();
      setIsDialogOpen(false);
      setShowCreateScreen(false);
      loadBarbeiros();
    } catch (error) {
      console.error("Erro ao criar barbeiro:", error);
      toast.error("Erro ao criar barbeiro");
    } finally {
      setCreating(false);
    }
  };

  /* ─── Toggle status (via mutation hook) ─── */
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

  /* ─── Delete barber (via mutation hook com cascade completo) ─── */
  const handleDeleteBarbeiro = () => {
    if (!deleteTarget) return;
    deletarMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setSearchParams({});
      },
    });
  };

  const resetForm = () => {
    setNome("");
    setEmail("");
    setSenha("");
    setTelefone("");
    setCpf("");
    setNomeCompleto("");
    setShowPassword(false);
  };

  /* ─── Navigation helpers ─── */
  const openBarberView = (id: string) => {
    setSearchParams({ view: id });
  };

  const goBack = () => {
    setSearchParams({});
  };

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════
  // BARBER DETAIL FULL-PAGE VIEW
  // ═══════════════════════════════════
  if (viewId) {
    const barbeiro = barbeiros.find((b) => b.id === viewId);
    if (!barbeiro) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Users className="w-10 h-10 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Barbeiro não encontrado</p>
          <button onClick={goBack} className="text-xs text-primary hover:underline">Voltar</button>
        </div>
      );
    }

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header fixo */}
        <div className="sticky top-0 z-30 bg-background">
          <div className="flex items-center gap-2 px-4 h-16">
            <button
              onClick={goBack}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1 truncate ml-1">
              {barbeiro.apelido}
            </h1>
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider flex-shrink-0",
                barbeiro.ativo
                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                  : "bg-muted/50 text-muted-foreground/60 border border-border/30"
              )}
            >
              {barbeiro.ativo ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>

        <div className="px-4 pt-5 space-y-6">
          {/* Avatar + nome */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {barbeiro.foto_url ? (
                <img src={barbeiro.foto_url} alt={barbeiro.apelido} className="w-16 h-16 object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">
                  {barbeiro.apelido.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-foreground truncate">{barbeiro.apelido}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {barbeiro.created_at
                  ? `Cadastro em ${format(new Date(barbeiro.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                  : "Data de cadastro indisponível"}
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={Percent}
              label="Comissão"
              value={barbeiro.comissao_pct ? `${barbeiro.comissao_pct}%` : "—"}
            />
            <KpiCard
              icon={Calendar}
              label="Google Cal"
              value={barbeiro.google_calendar_connected ? "Conectado" : "Não"}
              accentClass={barbeiro.google_calendar_connected ? "text-emerald-500" : undefined}
            />
          </div>

          {/* Informações */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
              Informações
            </p>
            <div className="space-y-0 rounded-xl border border-border/30 overflow-hidden">
              <DetailRow icon={Mail} label="Email" value={barbeiro.email || "Sem e-mail"} />
              <DetailRow
                icon={Calendar}
                label="Cadastro"
                value={
                  barbeiro.created_at
                    ? format(new Date(barbeiro.created_at), "dd/MM/yyyy", { locale: ptBR })
                    : "—"
                }
              />
              <DetailRow
                icon={Scissors}
                label="Comissão"
                value={barbeiro.comissao_pct ? `${barbeiro.comissao_pct}%` : "Não definida"}
              />
              <DetailRow
                icon={CheckCircle}
                label="Setup"
                value={barbeiro.setup_completed ? "Completo" : "Incompleto"}
              />
            </div>
          </div>

          {/* Ações */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-3 px-1">
              Ações
            </p>
            <div className="space-y-2">
              {/* Toggle status */}
              <button
                onClick={() => handleToggleStatus(barbeiro)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors",
                  barbeiro.ativo
                    ? "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
                    : "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
                )}
              >
                {barbeiro.ativo ? (
                  <>
                    <XCircle className="w-4.5 h-4.5 text-amber-500" />
                    <span className="text-[13px] font-medium text-amber-500">Desativar barbeiro</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
                    <span className="text-[13px] font-medium text-emerald-400">Ativar barbeiro</span>
                  </>
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => setDeleteTarget(barbeiro)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4.5 h-4.5 text-destructive" />
                <span className="text-[13px] font-medium text-destructive">Remover barbeiro</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dialogs */}
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

  // ═══════════════════════════════════
  // FULL-SCREEN CREATE BARBER VIEW
  // ═══════════════════════════════════
  if (showCreateScreen) {
    const charCount = nome.length;

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header fixo */}
        <div className="sticky top-0 z-30 bg-background">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <button
              onClick={() => { setShowCreateScreen(false); resetForm(); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Novo Barbeiro</h1>
          </div>
        </div>

        <form onSubmit={handleCreateBarbeiro} className="px-4 pt-5 space-y-6">
          {/* Seção: Dados de Exibição */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Dados de exibição (obrigatório)
            </p>

            <div className="space-y-4">
              {/* Apelido */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Apelido / Nome de exibição
                </label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Pedro"
                  maxLength={30}
                  className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  required
                />
                <p className="text-[10px] text-muted-foreground/40 text-right px-1">{charCount} / 30</p>
              </div>
            </div>
          </div>

          {/* Seção: Dados Pessoais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Dados pessoais
            </p>

            <div className="space-y-4">
              {/* Nome Completo */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Nome Completo
                </label>
                <Input
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  placeholder="Nome completo do barbeiro"
                  className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  required
                />
              </div>

              {/* CPF e Telefone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    CPF
                  </label>
                  <Input
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Telefone
                  </label>
                  <Input
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Credenciais de Acesso */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Credenciais de acesso
            </p>

            <div className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  required
                />
              </div>

              {/* Senha */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Senha
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 pr-12 placeholder:text-muted-foreground/30"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer fixo: botão salvar */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] flex items-center gap-3 lg:static lg:border-t-0 lg:px-0 lg:pt-4">
            <Button
              type="submit"
              disabled={creating}
              className="flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cadastrar"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="pb-28 lg:pb-8">
      {isMobile ? (
        <div className={cn(!hideHeader && "-mx-3 -mt-3")}>
          {/* Header + Filters sticky bar */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
            {!hideHeader && (
              <div className="flex items-center gap-2 px-4 h-16">
                <button
                  onClick={() => (onBack ? onBack() : navigate(`${basePath}/configuracoes-perfil`))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all lg:hidden"
                  aria-label="Voltar"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h10a4 4 0 0 1 4 4v1" />
                  </svg>
                </button>
                <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1 ml-1">Barbeiros</h1>
                <span className="text-[11px] text-muted-foreground/60 font-medium tabular-nums">
                  {totalBarbeiros} cadastrados
                </span>
              </div>
            )}

            {/* Segmented filter */}
            <div className="px-4 pb-2">
              <div className="flex bg-secondary/30 rounded-lg p-0.5 border border-border/20">
                {([
                  { key: "all" as FilterType, label: "Todos" },
                  { key: "active" as FilterType, label: "Ativos" },
                  { key: "inactive" as FilterType, label: "Inativos" },
                ] as const).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                      filter === f.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="px-4 pb-3 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/30 border border-border/20 text-[13px] font-normal text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Barber list */}
          <div className="px-4 pt-2">
            {filteredBarbeiros.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  {searchTerm ? "Nenhum barbeiro encontrado" : "Nenhum barbeiro cadastrado"}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {searchTerm ? "Tente ajustar a busca" : "Cadastre o primeiro barbeiro"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                <AnimatePresence mode="popLayout">
                  {filteredBarbeiros.map((barbeiro, index) => (
                    <motion.button
                      key={barbeiro.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      onClick={() => openBarberView(barbeiro.id)}
                      className="w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors"
                    >
                      {/* Avatar with status dot */}
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                          {barbeiro.foto_url ? (
                            <img src={barbeiro.foto_url} alt={barbeiro.apelido} className="w-10 h-10 object-cover" />
                          ) : (
                            <span className="text-[14px] font-bold text-primary">
                              {barbeiro.apelido.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                            barbeiro.ativo ? "bg-emerald-500" : "bg-muted-foreground/40"
                          )}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">{barbeiro.apelido}</p>
                        <p className="text-[12px] text-muted-foreground/60 truncate mt-0.5">
                          {barbeiro.email || "Sem e-mail"}
                        </p>
                      </div>

                      {/* Right side badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {barbeiro.comissao_pct && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-[9px] font-bold text-blue-400">
                            <Percent className="w-2.5 h-2.5" />
                            {barbeiro.comissao_pct}
                          </span>
                        )}
                        {!barbeiro.ativo && (
                          <span className="px-1.5 py-0.5 rounded-md bg-muted/50 text-[9px] font-bold text-muted-foreground/60">
                            Inativo
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" strokeWidth={1.8} />
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* FAB — Novo Barbeiro */}
          <button
            onClick={() => setShowCreateScreen(true)}
            className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 w-12 h-12 rounded-2xl bg-foreground text-background shadow-lg shadow-black/20 flex items-center justify-center hover:bg-foreground/90 active:scale-95 transition-all"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      ) : (
        /* ═══ DESKTOP LAYOUT ═══ */
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-lg font-bold text-foreground">Barbeiros</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{totalBarbeiros} barbeiros cadastrados</p>
            </div>
            <Button size="sm" className="h-8 text-[11px] gap-1.5" onClick={() => setShowCreateScreen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Novo Barbeiro
            </Button>
          </div>

          {/* Filters + Search */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex bg-secondary/30 rounded-lg p-0.5 border border-border/20">
              {([
                { key: "all" as FilterType, label: "Todos" },
                { key: "active" as FilterType, label: "Ativos" },
                { key: "inactive" as FilterType, label: "Inativos" },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-4 py-1.5 text-[11px] font-medium rounded-md transition-all",
                    filter === f.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground/60"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar barbeiro..."
                className="h-9 pl-9 bg-secondary/30 border-border/20 text-[13px] rounded-xl"
              />
            </div>
          </div>

          {/* Desktop list */}
          {filteredBarbeiros.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-border/30">
              <Inbox className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
              <p className="text-[13px] text-muted-foreground">Nenhum barbeiro encontrado</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/30 overflow-hidden bg-card">
              {filteredBarbeiros.map((barbeiro, index) => (
                <button
                  key={barbeiro.id}
                  onClick={() => openBarberView(barbeiro.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-border/20 last:border-b-0 hover:bg-secondary/20 transition-colors"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                      {barbeiro.foto_url ? (
                        <img src={barbeiro.foto_url} alt={barbeiro.apelido} className="w-9 h-9 object-cover" />
                      ) : (
                        <span className="text-[13px] font-bold text-primary">
                          {barbeiro.apelido.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                        barbeiro.ativo ? "bg-emerald-500" : "bg-muted-foreground/40"
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{barbeiro.apelido}</p>
                    <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                      {barbeiro.email || "Sem e-mail"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {barbeiro.comissao_pct && (
                      <span className="text-[11px] text-muted-foreground/50">
                        {barbeiro.comissao_pct}%
                      </span>
                    )}
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider",
                        barbeiro.ativo
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-muted/50 text-muted-foreground/60 border border-border/30"
                      )}
                    >
                      {barbeiro.ativo ? "Ativo" : "Inativo"}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" strokeWidth={1.8} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
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

/* ═══════════════════════════════════ */
/*         SUB-COMPONENTS              */
/* ═══════════════════════════════════ */

/* ── KPI Card ── */
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
    <div className="rounded-xl border border-border/30 bg-card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("w-3.5 h-3.5", accentClass || "text-muted-foreground/50")} />
        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.1em] font-medium">
          {label}
        </span>
      </div>
      <p className={cn("text-[18px] font-bold leading-none", accentClass || "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

/* ── Detail Row ── */
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
      <span className="text-[11px] text-muted-foreground/60 w-20 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-foreground truncate flex-1">{value}</span>
    </div>
  );
}

/* ── Create Barber Dialog ── */
function CreateBarberDialog({
  nome, setNome,
  nomeCompleto, setNomeCompleto,
  cpf, setCpf,
  email, setEmail,
  senha, setSenha,
  showPassword, setShowPassword,
  telefone, setTelefone,
  creating,
  onSubmit,
  onCancel,
}: {
  nome: string; setNome: (v: string) => void;
  nomeCompleto: string; setNomeCompleto: (v: string) => void;
  cpf: string; setCpf: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  senha: string; setSenha: (v: string) => void;
  showPassword: boolean; setShowPassword: (v: boolean) => void;
  telefone: string; setTelefone: (v: string) => void;
  creating: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-[14px]">
          <Scissors className="w-4 h-4 text-primary" />
          Cadastrar Novo Barbeiro
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-3 mt-3">
        <CompactFormField label="Apelido / Nome de exibição" required icon={Scissors} value={nome} onChange={setNome} placeholder="Ex: Pedro" />
        <CompactFormField label="Nome Completo" required icon={Users} value={nomeCompleto} onChange={setNomeCompleto} placeholder="Nome completo do barbeiro" />
        <CompactFormField label="CPF" required icon={CreditCard} value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
        <CompactFormField label="Email" required icon={Mail} value={email} onChange={setEmail} placeholder="email@exemplo.com" type="email" />
        <div>
          <label className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.1em] font-medium block mb-1">
            Senha <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <Input
              type={showPassword ? "text" : "password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="h-8 pl-8 pr-8 bg-muted/30 border-border/30 text-[12px] text-foreground placeholder:text-muted-foreground/40 rounded-lg"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <CompactFormField label="Telefone" icon={Phone} value={telefone} onChange={setTelefone} placeholder="(00) 00000-0000" />

        <div className="flex gap-2 pt-3">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-9 text-[11px]">
            Cancelar
          </Button>
          <Button type="submit" disabled={creating} className="flex-1 h-9 text-[11px]">
            {creating ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Criando...</>
            ) : (
              <><Plus className="w-3.5 h-3.5 mr-1.5" /> Cadastrar</>
            )}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/* ── Deactivate Dialog ── */
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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
            <UserX className="w-4 h-4 text-destructive" />
            Desativar barbeiro
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12px]">
            Tem certeza que deseja desativar{" "}
            <span className="text-foreground font-medium">{barbeiro?.apelido}</span>?
            Ele não receberá novos agendamentos enquanto estiver inativo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-[11px]">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="h-8 text-[11px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Desativar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Delete Dialog ── */
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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[14px]">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Remover barbeiro
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12px] space-y-2">
            <p>
              Remover{" "}
              <span className="text-foreground font-medium">{barbeiro?.apelido}</span>?
            </p>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2.5 space-y-1">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Horários, comissões, avaliações e configurações serão removidos. Agendamentos futuros serão cancelados.
              </p>
              <p className="text-[10px] text-foreground/70 leading-relaxed">
                O barbeiro terá <span className="font-semibold">7 dias de acesso</span> para resolver pendências financeiras.
              </p>
            </div>
            <p className="text-[10px] text-destructive font-medium">Esta ação não pode ser desfeita.</p>
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
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Removendo...</>
            ) : (
              "Remover definitivamente"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Compact Form Field ── */
function CompactFormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  icon?: React.ElementType;
}) {
  return (
    <div>
      <label className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.1em] font-medium block mb-1">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
        )}
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || label}
          className={cn(
            "h-8 bg-muted/30 border-border/30 text-[12px] text-foreground placeholder:text-muted-foreground/40 rounded-lg focus:border-border/50 focus:ring-0",
            Icon && "pl-8"
          )}
          required={required}
        />
      </div>
    </div>
  );
}

/* ── Form Field Row (full-screen style) ── */
function FormFieldRow({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-b-0">
      <Icon className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-[11px] text-muted-foreground/60 w-20 flex-shrink-0">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        className="h-8 flex-1 bg-transparent border-0 shadow-none text-[13px] text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 p-0"
        required={required}
      />
    </div>
  );
}
