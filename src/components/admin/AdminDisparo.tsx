import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Send,
  Smile,
  Users,
  Loader2,
  Search,
  Clock,
  Trash2,
  Play,
  MessageSquare,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Rocket,
  Eye,
  Zap,
  Info,
  Check,
  Wand2,
  Hash,
  UserCheck,
  Inbox,
  MapPin,
  Building2,
  Mic,
  MicOff,
  X,
  Pencil,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getWhatsAppInstance } from "@/lib/whatsappInstanceHelper";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { DispatchScheduleScreen } from "@/components/admin/DispatchScheduleScreen";
import { WhenToSendDrawer } from "@/components/admin/WhenToSendDrawer";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import { WhatsAppRequiredBanner } from "@/components/whatsapp/WhatsAppRequiredBanner";
import { useDeletarDisparo } from "@/hooks/useAdminMutations";
import { useTenantBarbersCount } from "@/hooks/useTenantBarbersCount";
import { DisparoSkeleton } from "@/components/ui/loading";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

/* ═══════════════════════════════════════════════ */
/* Types                                          */
/* ═══════════════════════════════════════════════ */

interface Client {
  id: string;
  nome: string;
  telefone: string | null;
}

interface TenantUnit {
  id: string;
  nome: string;
}

interface ScheduledDispatch {
  id: string;
  mensagem: string;
  contatos_ids: string[];
  data_programada: string;
  executado: boolean;
  created_at: string;
}

type SendMode = "now" | "schedule";

/* ═══════════════════════════════════════════════ */
/* Step Dots — Indicador minimalista              */
/* ═══════════════════════════════════════════════ */

function BackNavButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-transform"
      aria-label="Voltar"
      type="button"
      style={{ touchAction: "manipulation" }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}

function StepProgress({ current, total = 3 }: { current: number; total?: number }) {
  const progress = (current / total) * 100;

  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
      <motion.div
        className="h-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* Client Avatar (Iniciais)                       */
/* ═══════════════════════════════════════════════ */

function ClientInitials({ name, isSelected }: { name: string; isSelected: boolean }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-200 bg-card text-foreground border border-border"
    >
      {initials}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* WhatsApp Preview Bubble                        */
/* ═══════════════════════════════════════════════ */

function WhatsAppPreview({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_CHARS = 280;

  if (!message.trim()) return null;
  const preview = message
    .replace("{nome}", "João Silva")
    .replace("{data}", "15/02/2026")
    .replace("{empresa}", "BarberShop");

  const isLong = preview.length > MAX_CHARS;
  const displayText = !expanded && isLong ? preview.slice(0, MAX_CHARS) + "…" : preview;

  return (
    <div className="rounded-2xl bg-[#0b141a] border border-foreground/[0.04] overflow-hidden">
      {/* WhatsApp top bar */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#1f2c34] border-b border-foreground/[0.04]">
        <div className="w-7 h-7 rounded-full bg-[#005c4b]/60 flex items-center justify-center">
          <Users className="w-3.5 h-3.5 text-foreground/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground/85 truncate">Seus clientes</p>
          <p className="text-[9px] text-foreground/30">online</p>
        </div>
      </div>

      {/* Chat area — sem scroll, conteúdo expande naturalmente */}
      <div className="px-3 py-4"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
        <div className="flex justify-end">
          <div className="bg-[#005c4b] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%] shadow-lg shadow-black/20">
            <p className="text-[12.5px] text-foreground/90 whitespace-pre-wrap leading-[1.55]">
              {displayText}
            </p>
            {isLong && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-[#53bdeb] font-semibold mt-1.5 active:opacity-70 transition-opacity"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Mostrar menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Ler mais
                  </>
                )}
              </button>
            )}
            <div className="flex items-center justify-end gap-1 mt-1">
              <p className="text-[8px] text-foreground/25 tabular-nums">
                {format(new Date(), "HH:mm")}
              </p>
              <Check className="w-3 h-3 text-[#53bdeb]/60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* Variable Chips                                 */
/* ═══════════════════════════════════════════════ */

const VARIABLES = [
  { key: "{nome}", label: "Nome" },
  { key: "{data}", label: "Data" },
  { key: "{empresa}", label: "Empresa" },
];

/* ═══════════════════════════════════════════════ */
/* Main Component                                 */
/* ═══════════════════════════════════════════════ */

interface AdminDisparoProps {
  tenantId?: string;
  basePath?: string;
  barbeiroId?: string;
  canSelectAllClients?: boolean;
}

// Cache síncrono de clientes do disparo — render instantâneo ao entrar na tela.
const DISPATCH_CLIENTS_CACHE_PREFIX = "dub:disparo-clients:v2:";
function dispatchCacheKey(barbeiroId: string | null, tenantId: string | null, audience: string, unitMode: string, unitIds: string[]) {
  const units = unitMode === "specific" ? [...unitIds].sort().join(",") : "";
  return `${DISPATCH_CLIENTS_CACHE_PREFIX}${tenantId ?? "-"}:${barbeiroId ?? "-"}:${audience}:${unitMode}:${units}`;
}
function readDispatchCache(key: string): Client[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Client[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeDispatchCache(key: string, data: Client[]) {
  try {
    if (Array.isArray(data) && data.length > 0) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch {
    /* ignore quota */
  }
}

export function AdminDisparo({ tenantId, basePath = "/admin", barbeiroId, canSelectAllClients }: AdminDisparoProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const deletarDisparo = useDeletarDisparo(tenantId ?? null);

  const isExplicitBarber = basePath.startsWith("/barbeiro") && !tenantId;
  const effectiveCanSelectAll = canSelectAllClients ?? !isExplicitBarber;

  const [step, setStep] = useState(1);

  /* ── State ── */
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "schedule" ? "schedule" : "now";

  const [sendMode, setSendMode] = useState<SendMode>(initialMode);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledDispatches, setScheduledDispatches] = useState<ScheduledDispatch[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showScheduleOverlay, setShowScheduleOverlay] = useState(initialMode === "schedule");
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const [showWhenToSendDrawer, setShowWhenToSendDrawer] = useState(false);

  /** tenant efetivo para contexto (prop ou resolvido via barbeiro) */
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(barbeiroId ?? null);
  const [contextResolved, setContextResolved] = useState<boolean>(!!barbeiroId || basePath.startsWith("/barbeiro") || basePath.startsWith("/tenant/admin"));
  const effectiveBarbeiroId = barbeiroId ?? resolvedBarbeiroId;
  const effectiveTenantId = tenantId ?? resolvedTenantId;

  /* ── WhatsApp gate para tenants/barbeiros ── */
  const { isConnected: whatsAppConnected, isLoading: whatsAppLoading } = useWhatsAppStatus(effectiveBarbeiroId);

  /** Filtro de audiência: "mine" = só meus clientes, "all" = todos da barbearia */
  const [audience, setAudience] = useState<"mine" | "all">(effectiveCanSelectAll ? "all" : "mine");

  /** Audiência pré-estabelecida sem telas de bloqueio */
  const [audienceChosen, setAudienceChosen] = useState(true);

  /** Seleção de unidades para "Todos os clientes" */
  const [units, setUnits] = useState<TenantUnit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [unitSelectionMode, setUnitSelectionMode] = useState<"all" | "specific">("all");
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow do textarea quando `message` muda programaticamente (IA, variáveis, etc.)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message]);

  const [aiMode, setAiMode] = useState(false);
  const [aiResumo, setAiResumo] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [improveLoading, setImproveLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [successScreen, setSuccessScreen] = useState<{
    type: "sent" | "scheduled";
    count: number;
    date?: string;
  } | null>(null);

  // Keyboard height (iOS/Android) — usado para fazer o CTA subir junto do teclado
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setKeyboardHeight(kb > 80 ? kb : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);


  // Resolve barbeiro atual quando a rota não envia o id explicitamente
  useEffect(() => {
    if (barbeiroId) {
      setResolvedBarbeiroId(barbeiroId);
      setContextResolved(true);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        setContextResolved(false);

        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) {
          if (isMounted) setContextResolved(true);
          return;
        }

        let query = supabase
          .from("barbeiros")
          .select("id, tenant_id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (tenantId) {
          query = query.eq("tenant_id", tenantId);
        }

        const { data } = await query.maybeSingle();
        if (!isMounted) return;

        if (data?.id) {
          setResolvedBarbeiroId(data.id);
          if (!tenantId) {
            setResolvedTenantId(data.tenant_id ?? null);
          }
        }
      } finally {
        if (isMounted) setContextResolved(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [barbeiroId, tenantId]);

  useEffect(() => {
    if (tenantId) {
      setResolvedTenantId(tenantId);
      return;
    }
    if (!effectiveBarbeiroId) return;

    (async () => {
      const { data } = await supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("id", effectiveBarbeiroId)
        .maybeSingle();
      setResolvedTenantId(data?.tenant_id ?? null);
    })();
  }, [tenantId, effectiveBarbeiroId]);

  // Configuração automática de audiência: administradores acessam todos os clientes do tenant por padrão
  useEffect(() => {
    if (!contextResolved) return;
    setAudience(effectiveCanSelectAll ? "all" : "mine");
    setAudienceChosen(true);
  }, [contextResolved, effectiveCanSelectAll]);

  useEffect(() => {
    if (audience === "all" && effectiveTenantId && units.length === 0) {
      loadUnits();
    }
  }, [audience, effectiveTenantId, units.length]);

  useEffect(() => {
    if (contextResolved) {
      loadClients();
    }
    loadScheduledDispatches();
    const interval = setInterval(() => loadScheduledDispatches(), 120000);
    return () => clearInterval(interval);
  }, [effectiveTenantId, effectiveBarbeiroId, audience, unitSelectionMode, selectedUnitIds.size, contextResolved]);

  /* ═══════════════════════════════════════════════ */
  /* Data Loading                                   */
  /* ═══════════════════════════════════════════════ */

  /** Carrega unidades do tenant para seleção no disparo */
  const loadUnits = async () => {
    if (!effectiveTenantId) return;
    setLoadingUnits(true);
    try {
      const { data, error } = await supabase
        .from("tenant_unidades")
        .select("id, nome")
        .eq("tenant_id", effectiveTenantId)
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      setUnits(data || []);
    } catch (err) {
      console.error(err);
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const loadClients = async () => {
    const cacheKey = dispatchCacheKey(
      effectiveBarbeiroId ?? null,
      effectiveTenantId ?? null,
      audience,
      unitSelectionMode,
      [...selectedUnitIds],
    );
    const cachedClients = readDispatchCache(cacheKey);
    if (cachedClients && cachedClients.length > 0) {
      setClients(cachedClients);
      setSelectedClients(new Set(cachedClients.map((c) => c.id)));
      setSelectAll(true);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      // 1. Obter IDs de barbeiros para não enviá-los como destinatários de clientes
      const { data: allBarbersData } = await supabase
        .from("barbeiros")
        .select("user_id")
        .not("user_id", "is", null);
      const barberUserIds = (allBarbersData || [])
        .map((b) => b.user_id)
        .filter(Boolean) as string[];

      // 2. Barbeiros do tenant atual
      let tenantBarberIds: string[] = [];
      if (effectiveTenantId) {
        const { data: tbData } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("tenant_id", effectiveTenantId);
        tenantBarberIds = (tbData || []).map((b) => b.id);
      }

      const filterByUnits = audience === "all" && unitSelectionMode === "specific" && selectedUnitIds.size > 0;
      const unitIdsArray = filterByUnits ? [...selectedUnitIds] : [];

      if (filterByUnits && tenantBarberIds.length > 0) {
        const { data: barberUnits } = await supabase
          .from("barbeiro_unidades")
          .select("barbeiro_id")
          .in("unidade_id", unitIdsArray)
          .in("barbeiro_id", tenantBarberIds);
        const unitBarberIds = new Set(barberUnits?.map((bu) => bu.barbeiro_id) || []);
        tenantBarberIds = tenantBarberIds.filter((id) => unitBarberIds.has(id));
      }

      // 3. Agregar IDs de clientes vinculados
      const targetClientIds = new Set<string>();

      if (effectiveTenantId) {
        // Fonte A: Clientes manuais / cadastrados no tenant (tenant_clientes)
        const { data: tenantClientes } = await supabase
          .from("tenant_clientes")
          .select("user_id")
          .eq("tenant_id", effectiveTenantId)
          .not("user_id", "is", null);
        tenantClientes?.forEach((tc) => {
          if (tc.user_id) targetClientIds.add(tc.user_id);
        });

        // Fonte B: Agendamentos
        let agQuery = supabase
          .from("agendamentos")
          .select("user_id")
          .not("user_id", "is", null);

        if (audience === "mine" && effectiveBarbeiroId) {
          agQuery = agQuery.eq("barbeiro_id", effectiveBarbeiroId);
        } else if (tenantBarberIds.length > 0) {
          agQuery = agQuery.in("barbeiro_id", tenantBarberIds);
        }

        if (filterByUnits && unitIdsArray.length > 0) {
          agQuery = agQuery.in("unidade_id", unitIdsArray);
        }

        const { data: agendamentos } = await agQuery;
        agendamentos?.forEach((a) => {
          if (a.user_id) targetClientIds.add(a.user_id);
        });

        // Fallback: se 'mine' não retornou nenhum agendamento, mas estamos no admin do tenant,
        // carrega de todos os barbeiros do tenant para não deixar a tela vazia
        if (targetClientIds.size === 0 && effectiveCanSelectAll && tenantBarberIds.length > 0) {
          const { data: allAgData } = await supabase
            .from("agendamentos")
            .select("user_id")
            .in("barbeiro_id", tenantBarberIds)
            .not("user_id", "is", null);
          allAgData?.forEach((a) => {
            if (a.user_id) targetClientIds.add(a.user_id);
          });
        }

        // Fonte C: Perfis com barbearia preferida vinculada
        const { data: prefProfiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("barbearia_preferida_id", effectiveTenantId);
        prefProfiles?.forEach((p) => {
          if (p.id) targetClientIds.add(p.id);
        });
      } else if (effectiveBarbeiroId) {
        // Barbeiro individual sem tenant explícito
        const { data: agendamentos } = await supabase
          .from("agendamentos")
          .select("user_id")
          .eq("barbeiro_id", effectiveBarbeiroId)
          .not("user_id", "is", null);
        agendamentos?.forEach((a) => {
          if (a.user_id) targetClientIds.add(a.user_id);
        });
      }

      // 4. Buscar os perfis no Supabase
      let profilesQuery = supabase
        .from("profiles")
        .select("id, nome, telefone")
        .not("telefone", "is", null)
        .order("nome", { ascending: true });

      if (targetClientIds.size > 0) {
        // Filtra pelos clientes identificados para a barbearia/barbeiro
        profilesQuery = profilesQuery.in("id", [...targetClientIds]);
      } else if (effectiveTenantId && !effectiveCanSelectAll) {
        // Barbeiro sem nenhum cliente registrado ou agendado
        setClients([]);
        setLoading(false);
        return;
      }
      // Se targetClientIds está vazio mas o usuário é Admin/Tenant Admin,
      // deixamos profilesQuery buscar os perfis — o RLS do Supabase
      // (profile_visible_to_tenant_admin) já garante o isolamento seguro do tenant!

      if (barberUserIds.length > 0) {
        profilesQuery = (profilesQuery as any).not("id", "in", `(${barberUserIds.join(",")})`);
      }

      const { data: profiles, error: pError } = await profilesQuery;
      if (pError) throw pError;

      // 5. Sanitizar clientes: nome e telefone válido (mínimo 8 dígitos numéricos, sem email)
      const validClients: Client[] = (profiles || [])
        .filter((c) => {
          if (!c.nome || !c.telefone) return false;
          const digits = c.telefone.replace(/\D/g, "");
          if (digits.length < 8) return false;
          if (c.telefone.includes("@")) return false;
          return true;
        })
        .map((c) => ({
          id: c.id,
          nome: c.nome.trim(),
          telefone: c.telefone.trim(),
        }));

      setClients(validClients);
      setSelectedClients(new Set(validClients.map((c) => c.id)));
      setSelectAll(true);

      if (validClients.length > 0) {
        writeDispatchCache(cacheKey, validClients);
      }
    } catch (error) {
      console.error("Erro ao carregar clientes do disparo:", error);
      if (!cachedClients || cachedClients.length === 0) {
        toast.error("Erro ao carregar clientes");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadScheduledDispatches = async () => {
    setLoadingScheduled(true);
    try {
      /* Select apenas campos usados na listagem de disparos */
      let query = supabase
        .from("disparos_programados")
        .select("id, mensagem, data_programada, contatos_ids, executado, tenant_id, created_at")
        .eq("executado", false);

      if (effectiveTenantId) {
        query = query.eq("tenant_id", effectiveTenantId);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data, error } = await query.order("data_programada", { ascending: true });
      if (error) throw error;
      setScheduledDispatches(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingScheduled(false);
    }
  };

  /* ═══════════════════════════════════════════════ */
  /* Helpers                                        */
  /* ═══════════════════════════════════════════════ */

  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/\D/g, "");
    if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
    return `${cleaned}@s.whatsapp.net`;
  };

  const filteredClients = useMemo(
    () =>
      clients.filter(
        (c) =>
          c.nome.toLowerCase().includes(search.toLowerCase()) ||
          c.telefone?.includes(search)
      ),
    [clients, search]
  );

  /* ── Selection ── */

  const isAllFilteredSelected = useMemo(
    () => filteredClients.length > 0 && filteredClients.every((c) => selectedClients.has(c.id)),
    [filteredClients, selectedClients]
  );

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      if (search.trim()) {
        const next = new Set(selectedClients);
        filteredClients.forEach((c) => next.delete(c.id));
        setSelectedClients(next);
        setSelectAll(false);
      } else {
        setSelectedClients(new Set());
        setSelectAll(false);
      }
    } else {
      const next = new Set(selectedClients);
      filteredClients.forEach((c) => next.add(c.id));
      setSelectedClients(next);
      setSelectAll(next.size === clients.length);
    }
  };

  const handleSelectClient = (clientId: string, checked: boolean) => {
    const next = new Set(selectedClients);
    checked ? next.add(clientId) : next.delete(clientId);
    setSelectedClients(next);
    setSelectAll(next.size === clients.length && clients.length > 0);
  };

  /* ── Insert Variable ── */

  const insertVariable = (varKey: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage((prev) => prev + varKey);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const nextMessage = message.slice(0, start) + varKey + message.slice(end);
    setMessage(nextMessage);
    setTimeout(() => {
      el.focus();
      const newPos = start + varKey.length;
      el.setSelectionRange(newPos, newPos);
    }, 50);
  };

  /* ═══════════════════════════════════════════════ */
  /* AI Message Generation                          */
  /* ═══════════════════════════════════════════════ */

  /** Gera 3 opções de mensagem com IA */
  const handleGenerateAI = async () => {
    if (!aiResumo.trim()) {
      toast("Descreva o que deseja comunicar.", { icon: "✍️" });
      return;
    }
    setAiLoading(true);
    setAiOptions([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-dispatch-message", {
        body: { resumo: aiResumo.trim(), mode: "generate" },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      // Suporte ao formato antigo (mensagem única) e novo (array)
      if (data?.mensagens && data.mensagens.length > 0) {
        setAiOptions(data.mensagens);
      } else if (data?.mensagem) {
        setAiOptions([data.mensagem]);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar mensagem");
    } finally {
      setAiLoading(false);
    }
  };

  /** Seleciona uma das opções geradas pela IA */
  const handleSelectAiOption = (option: string) => {
    setMessage(option);
    setAiMode(false);
    setAiResumo("");
    setAiOptions([]);
    toast.success("Mensagem selecionada");
    // Avança automaticamente para o próximo step (Destinatários)
    setStep(2);
  };

  /** Melhora a mensagem manual com IA */
  const handleImproveMessage = async () => {
    if (!message.trim()) return;
    setImproveLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-dispatch-message", {
        body: { resumo: message.trim(), mode: "improve" },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.mensagem) {
        setMessage(data.mensagem);
        toast.success("Mensagem aprimorada com sucesso");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao aprimorar mensagem");
    } finally {
      setImproveLoading(false);
    }
  };

  /** Gravação de áudio para transcrição */
  const handleToggleRecording = async () => {
    if (isRecording) {
      // Parar gravação
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          if (!base64) return;
          setAiLoading(true);
          try {
            const { data, error } = await supabase.functions.invoke("speech-to-text", {
              body: { audio: base64 },
            });
            if (error) throw error;
            if (data?.text) {
              setMessage((prev) => (prev ? prev + " " + data.text : data.text));

              toast.success("Áudio transcrito");
            }
          } catch (err) {
            console.error(err);
            toast.error("Erro ao transcrever áudio");
          } finally {
            setAiLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      toast.error("Permissão de microfone negada");
    }
  };

  /* ═══════════════════════════════════════════════ */
  /* Send / Schedule                                */
  /* ═══════════════════════════════════════════════ */

  const handleSendMessages = async () => {
    const { data: config, error: configError } = await supabase
      .from("webhook_config")
      .select("disparo_webhook_url, disparo_ativo")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !config?.disparo_webhook_url || !config?.disparo_ativo) {
      toast.error("Webhook de disparo não configurado. Configure em TI > Webhooks");
      return;
    }

    setSending(true);
    try {
      const selectedList = clients.filter((c) => selectedClients.has(c.id));
      const contatos = selectedList.map((client) => ({
        cliente_id: client.id,
        cliente_nome: client.nome,
        cliente_telefone: client.telefone,
        cliente_telefone_whatsapp: formatPhoneForWhatsApp(client.telefone!),
        mensagem: message.replace("{nome}", client.nome),
      }));

      // Buscar instância WhatsApp conectada
      const whatsappInstance = await getWhatsAppInstance(effectiveBarbeiroId);

      const response = await fetch(config.disparo_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "disparo_mensagem_lote",
          total_contatos: contatos.length,
          contatos,
          timestamp: new Date().toISOString(),
          whatsapp_instance: whatsappInstance,
        }),
      });

      if (response.ok) {
        const count = contatos.length;
        resetFlow();
        setSuccessScreen({ type: "sent", count });
      } else {
        toast.error("Erro ao enviar. Verifique o webhook.");
      }

      await supabase.from("system_logs").insert({
        level: "info",
        category: "disparo",
        message: `Disparo em lote: ${contatos.length} contatos`,
        details: { total: contatos.length, contatos, message_preview: message.substring(0, 100) },
      });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar disparo");
    } finally {
      setSending(false);
    }
  };

  const handleScheduleDispatch = async () => {
    const scheduledTime = new Date(scheduledDate);
    if (scheduledTime <= new Date()) {
      toast.error("A data/hora deve ser no futuro");
      return;
    }

    setScheduling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: inserted, error } = await supabase
        .from("disparos_programados")
        .insert({
          mensagem: message,
          contatos_ids: Array.from(selectedClients),
          data_programada: scheduledTime.toISOString(),
          created_by: user?.id,
          tenant_id: effectiveTenantId, // ✅ obrigatório para o cron processar
        })
        .select()
        .single();

      if (error) throw error;

      const { data: config } = await supabase
        .from("webhook_config")
        .select("disparo_webhook_url, disparo_ativo")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (config?.disparo_webhook_url && config?.disparo_ativo) {
        const selectedList = clients.filter((c) => selectedClients.has(c.id));
        const contatos = selectedList.map((client) => ({
          cliente_id: client.id,
          cliente_nome: client.nome,
          cliente_telefone: client.telefone,
          cliente_telefone_whatsapp: formatPhoneForWhatsApp(client.telefone!),
          mensagem: message.replace("{nome}", client.nome),
        }));

        await fetch(config.disparo_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evento: "disparo_agendado",
            tipo: "notificacao_agendamento",
            disparo_id: inserted.id,
            total_contatos: contatos.length,
            contatos,
            data_programada: scheduledTime.toISOString(),
            data_programada_formatada: format(scheduledTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
            agendado_em: new Date().toISOString(),
            agendado_em_formatado: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
            mensagem_original: message,
            timestamp: new Date().toISOString(),
          }),
        });
      }

      const count = Array.from(selectedClients).length;
      const dateStr = format(scheduledTime, "dd/MM 'às' HH:mm", { locale: ptBR });
      resetFlow();
      loadScheduledDispatches();
      setSuccessScreen({ type: "scheduled", count, date: dateStr });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao agendar");
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelScheduled = (id: string) => {
    deletarDisparo.mutate(id, {
      onSuccess: () => loadScheduledDispatches(),
    });
  };

  const handleExecuteNow = async (dispatch: ScheduledDispatch) => {
    const { data: config, error: configError } = await supabase
      .from("webhook_config")
      .select("disparo_webhook_url, disparo_ativo")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !config?.disparo_webhook_url || !config?.disparo_ativo) {
      toast.error("Webhook não configurado");
      return;
    }

    try {
      const selectedList = clients.filter((c) => dispatch.contatos_ids.includes(c.id));
      const contatos = selectedList.map((client) => ({
        cliente_id: client.id,
        cliente_nome: client.nome,
        cliente_telefone: client.telefone,
        cliente_telefone_whatsapp: formatPhoneForWhatsApp(client.telefone!),
        mensagem: dispatch.mensagem.replace("{nome}", client.nome),
      }));

      // Buscar instância WhatsApp conectada
      const whatsappInstance = await getWhatsAppInstance(effectiveBarbeiroId);

      const response = await fetch(config.disparo_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "disparo_mensagem_lote",
          total_contatos: contatos.length,
          contatos,
          programado: true,
          disparo_id: dispatch.id,
          data_programada: dispatch.data_programada,
          data_programada_formatada: format(new Date(dispatch.data_programada), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
          executado_em: new Date().toISOString(),
          executado_em_formatado: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
          mensagem_original: dispatch.mensagem,
          timestamp: new Date().toISOString(),
          whatsapp_instance: whatsappInstance,
        }),
      });

      if (response.ok) {
        await supabase
          .from("disparos_programados")
          .update({ executado: true, executado_em: new Date().toISOString(), resultado: { success: true, total: contatos.length } })
          .eq("id", dispatch.id);
        toast.success(`${contatos.length} mensagem(ns) enviada(s)`);
        loadScheduledDispatches();
      } else {
        toast.error("Erro ao executar");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao executar disparo");
    }
  };

  const resetFlow = () => {
    setStep(1);
    setMessage("");
    setSelectedClients(new Set(clients.map((c) => c.id)));
    setSelectAll(true);
    setScheduledDate("");
    setSendMode("now");
    setShowWhenToSendDrawer(false);
  };

  /* ═══════════════════════════════════════════════ */
  /* Step Validation                                */
  /* ═══════════════════════════════════════════════ */

  const canAdvance = (): boolean => {
    if (step === 1) return message.trim().length > 0;
    if (step === 2) return selectedClients.size > 0;
    return true;
  };

  const handleNext = () => {
    if (!canAdvance()) {
      if (step === 1) toast("Escreva a mensagem antes de avançar.", { icon: "✍️" });
      if (step === 2) toast("Selecione pelo menos um cliente.", { icon: "👆" });
      return;
    }
    setStep(2);
  };

  const handleBack = () => setStep(1);

  const handleHeaderBack = () => {
    if (showScheduleOverlay) {
      setShowScheduleOverlay(false);
      return;
    }
    if (showScheduledModal) {
      setShowScheduledModal(false);
      return;
    }
    if (showWhenToSendDrawer) {
      setShowWhenToSendDrawer(false);
      return;
    }
    if (step === 1) {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate(basePath);
      }
    } else {
      handleBack();
    }
  };

  const handleConfirm = () => {
    if (selectedClients.size === 0) {
      toast("Selecione pelo menos um cliente.", { icon: "👆" });
      return;
    }
    if (sendMode === "now") handleSendMessages();
    else handleScheduleDispatch();
  };

  const shouldLockMobileViewport = isMobile && showScheduleOverlay;

  // Pré-seleciona automaticamente todos os clientes por padrão
  useEffect(() => {
    if (clients.length > 0 && selectedClients.size === 0) {
      setSelectedClients(new Set(clients.map((c) => c.id)));
      setSelectAll(true);
    }
  }, [clients]);

  /* ── Auto-dismiss success ── */
  useEffect(() => {
    if (successScreen) {
      const timer = setTimeout(() => setSuccessScreen(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successScreen]);

  /* ═══════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════ */
  /* WhatsApp Gate (se não conectado)              */
  /* ═══════════════════════════════════════════════ */

  if (effectiveBarbeiroId && !whatsAppLoading && !whatsAppConnected) {
    return <WhatsAppRequiredBanner variant="fullblock" basePath={basePath} />;
  }

  /* ═══════════════════════════════════════════════ */
  /* RENDER                                         */
  /* ═══════════════════════════════════════════════ */

  return (
    <div className="relative min-h-[100dvh] bg-background pb-32">
      {/* ─── Success Overlay ─── */}
      <AnimatePresence>
        {successScreen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto bg-card/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl flex flex-col items-center text-center mx-4 px-8 py-6 max-w-[300px]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.1 }}
                className="w-11 h-11 rounded-full bg-foreground/10 flex items-center justify-center mb-3"
              >
                <CheckCircle2 className="w-5 h-5 text-foreground" />
              </motion.div>
              <p className="text-[14px] font-bold text-foreground">
                {successScreen.type === "sent" ? "Disparo enviado" : "Disparo agendado"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {successScreen.type === "sent"
                  ? `${selectedClients.size} destinatário${selectedClients.size === 1 ? "" : "s"}`
                  : format(scheduledDate || new Date(), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════ */}
      {/* Header Padronizado — Sistema (ScheduleHeader) */}
      {/* Sem subtítulo ou barras, 100% minimalista   */}
      {/* ═══════════════════════════════════════════ */}
      {!showScheduleOverlay && (
        <ScheduleHeader
          title="Disparo de Mensagens"
          onBack={handleHeaderBack}
          right={
            scheduledDispatches.filter((d) => !d.executado).length > 0 ? (
              <button
                type="button"
                onClick={() => setShowScheduledModal(true)}
                className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="Ver disparos agendados"
                aria-label="Ver disparos agendados"
              >
                <CalendarClock className="w-4 h-4" />
              </button>
            ) : undefined
          }
        />
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* Conteúdo das Etapas                         */}
      {/* ═══════════════════════════════════════════ */}
      <div className={cn(
        "w-full",
        showScheduleOverlay && "h-[100dvh] overflow-hidden p-0"
      )}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.16 }}
          >
            {/* ─── ETAPA 1: Composição da Mensagem ─── */}
            {step === 1 && !showScheduleOverlay && (
              <div
                className="max-w-md mx-auto px-4 pt-4 pb-36 space-y-3"
                style={{
                  paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 90}px` : undefined,
                  transition: "padding-bottom 180ms ease-out",
                }}
              >
                {/* Card Seletor de Modo de Disparo (Abre a Gaveta ao tocar em Alterar) */}
                <button
                  type="button"
                  onClick={() => setShowWhenToSendDrawer(true)}
                  className="w-full rounded-2xl bg-secondary/50 hover:bg-secondary/70 border border-border/40 p-3 flex items-center justify-between text-left transition-colors shadow-xs group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground shrink-0 border border-border/30">
                      {sendMode === "now" ? (
                        <Send className="w-3.5 h-3.5" />
                      ) : (
                        <CalendarClock className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground leading-snug">
                        {sendMode === "now" ? "Disparar agora" : "Disparo agendado"}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                        {sendMode === "now"
                          ? "Envia assim que você confirmar os destinatários"
                          : scheduledDate
                          ? format(new Date(scheduledDate), "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
                          : "Toque para definir data e horário"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground group-hover:text-foreground shrink-0">
                    <span>Alterar</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>

                {/* Quadradinho da Mensagem com ícones dentro e sem tracinho separador */}
                <div className="relative rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 focus-within:border-foreground/40 transition-colors shadow-xs flex flex-col justify-between min-h-[220px]">
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onFocus={() => {
                      setTimeout(() => {
                        textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 200);
                    }}
                    placeholder="Digite a mensagem do disparo..."
                    rows={6}
                    className="w-full bg-transparent border-0 p-0 text-[13.5px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0 resize-none leading-relaxed flex-1"
                  />

                  {/* Barra inferior dentro do próprio quadradinho — SEM TRACINHO SEPARADOR */}
                  <div className="flex items-center justify-between pt-3 gap-2">
                    {/* Variáveis rápidas compactas e minimalistas */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => insertVariable(v.key)}
                          className="h-6 px-2 rounded-md bg-secondary/70 hover:bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all border border-border/30"
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>

                    {/* Áudio e Botão "Melhorar com IA" (SEM AMARELO, 100% minimalista e neutro) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleToggleRecording}
                        title={isRecording ? "Parar gravação" : "Gravar áudio"}
                        aria-label="Gravar áudio"
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 border",
                          isRecording
                            ? "bg-destructive text-destructive-foreground border-destructive animate-pulse"
                            : "bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border-border/30"
                        )}
                      >
                        {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={handleImproveMessage}
                        disabled={improveLoading || message.trim().length < 3}
                        title="Melhorar mensagem com Inteligência Artificial"
                        aria-label="Melhorar com IA"
                        className="h-8 px-2.5 rounded-lg bg-secondary/80 hover:bg-secondary active:scale-95 border border-border/40 text-foreground flex items-center gap-1.5 transition-all disabled:opacity-30 disabled:pointer-events-none"
                      >
                        {improveLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className="text-[11.5px] font-medium tracking-tight">Melhorar com IA</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Modal / Tela Cheia de Agendamento ─── */}
            {showScheduleOverlay && (
              <div className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)]">
                <DispatchScheduleScreen
                  initialDate={scheduledDate || undefined}
                  onBack={() => {
                    setShowScheduleOverlay(false);
                    if (!scheduledDate) setSendMode("now");
                  }}
                  onConfirm={(isoDate) => {
                    setScheduledDate(isoDate);
                    setSendMode("schedule");
                    setShowScheduleOverlay(false);
                  }}
                />
              </div>
            )}

            {/* ─── ETAPA 2: Destinatários e Confirmação ─── */}
            {step === 2 && !showScheduleOverlay && (
              <div className="max-w-md mx-auto px-4 pt-4 pb-36 space-y-3.5">
                {/* Resumo compacto da programação */}
                <div className="rounded-xl bg-card border border-border/60 dark:border-white/[0.08] px-3.5 py-2.5 flex items-center justify-between text-[12px] shadow-xs">
                  <span className="text-muted-foreground font-normal">Envio:</span>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {sendMode === "now" ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        Envio imediato
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {scheduledDate
                          ? format(new Date(scheduledDate), "dd/MM 'às' HH:mm", { locale: ptBR })
                          : "Agendado"}
                      </>
                    )}
                  </span>
                </div>

                {/* Barra de Busca Estratégica e Limpa */}
                <div className="w-full h-11 px-3.5 rounded-xl bg-card border border-border/60 dark:border-white/[0.08] text-muted-foreground flex items-center gap-2.5 shadow-xs">
                  <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nome ou telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-transparent flex-1 text-[13px] outline-none text-foreground placeholder:text-muted-foreground/50 font-normal"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Indicador de clientes selecionados e Ação Marcar/Desmarcar (sem piscar zero) */}
                {!loading && clients.length > 0 && (
                  <div className="flex items-center justify-between px-1 text-[12px]">
                    <span className="text-muted-foreground">
                      {selectedClients.size} de {clients.length} cliente{clients.length === 1 ? "" : "s"} selecionado{selectedClients.size === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-[12px] font-semibold text-foreground hover:opacity-80 active:scale-95 transition-all"
                    >
                      {isAllFilteredSelected ? "Desmarcar todos" : "Marcar todos"}
                    </button>
                  </div>
                )}

                {/* Lista de Clientes com Skeleton suave para evitar gargalo visual */}
                {loading ? (
                  <div className="space-y-3 pt-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="py-2.5 flex items-center justify-between animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-secondary/80" />
                          <div className="space-y-1.5">
                            <div className="w-28 h-3.5 rounded-md bg-secondary/80" />
                            <div className="w-20 h-3 rounded-md bg-secondary/60" />
                          </div>
                        </div>
                        <div className="w-5 h-5 rounded-full bg-secondary/80" />
                      </div>
                    ))}
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="py-16 text-center px-4">
                    <Inbox className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                    <p className="text-[13px] text-muted-foreground font-semibold">Nenhum cliente encontrado</p>
                    <p className="text-[11.5px] text-muted-foreground/60 mt-0.5">
                      {search ? "Tente buscar com outro termo" : "Nenhum cliente disponível nesta lista"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20 pt-1">
                    {filteredClients.map((client) => {
                      const isSelected = selectedClients.has(client.id);
                      return (
                        <div
                          key={client.id}
                          onClick={() => handleSelectClient(client.id, !isSelected)}
                          className="py-2.5 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[12.5px] font-semibold text-foreground shrink-0 border border-border/30">
                              {client.nome.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-semibold text-foreground truncate leading-snug">
                                {client.nome}
                              </p>
                              <p className="text-[11.5px] text-muted-foreground truncate tabular-nums">
                                {client.telefone || "Sem telefone"}
                              </p>
                            </div>
                          </div>

                          <div className={cn(
                            "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                            isSelected
                              ? "bg-foreground border-foreground text-background"
                              : "border-muted-foreground/30"
                          )}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Gaveta (Bottom Sheet Drawer): Quando deseja enviar? ─── */}
      <WhenToSendDrawer
        isOpen={showWhenToSendDrawer && !showScheduleOverlay}
        onClose={() => setShowWhenToSendDrawer(false)}
        selectedMode={sendMode}
        onSelectNow={() => {
          setSendMode("now");
          setScheduledDate("");
        }}
        onSelectSchedule={() => {
          setSendMode("schedule");
          setShowScheduleOverlay(true);
        }}
      />

      {/* ═══════════════════════════════════════════ */}
      {/* Máscara de fade e Barra de Ação Inferior    */}
      {/* Sem botão voltar duplicado                  */}
      {/* ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {!showScheduleOverlay && !showWhenToSendDrawer && (
          <>
            {/* Máscara inferior para evitar sobreposição */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-0 inset-x-0 h-32 pointer-events-none z-[45] bg-gradient-to-t from-background via-background/90 to-transparent"
              aria-hidden="true"
            />

            {/* Container flutuante do botão — 100% centralizado */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-0 inset-x-0 z-[50] pointer-events-none flex justify-center items-center px-4 pb-[calc(1.1rem+env(safe-area-inset-bottom,0px))]"
              style={{
                paddingBottom: keyboardHeight > 0
                  ? `${keyboardHeight + 12}px`
                  : undefined,
                transition: "padding-bottom 180ms ease-out",
              }}
            >
              <div className="w-full max-w-[450px] pointer-events-auto">
                <button
                  type="button"
                  onClick={step === 2 ? handleConfirm : handleNext}
                  disabled={sending || scheduling || !canAdvance()}
                  className={cn(
                    "w-full h-[52px] px-6 rounded-full bg-foreground text-background font-semibold text-[14px] flex items-center justify-center transition-all shadow-[0_16px_40px_rgba(0,0,0,0.35)] active:scale-[0.98]",
                    !canAdvance() && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {step === 1 ? (
                    <span>Continuar</span>
                  ) : sending || scheduling ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </span>
                  ) : sendMode === "now" ? (
                    <span>{selectedClients.size > 0 ? `Enviar para ${selectedClients.size} cliente(s)` : "Disparar agora"}</span>
                  ) : (
                    <span>{selectedClients.size > 0 ? `Agendar para ${selectedClients.size} cliente(s)` : "Agendar disparo"}</span>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════ */}
      {/* Modal / Drawer de Disparos Agendados       */}
      {/* ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {showScheduledModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowScheduledModal(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full sm:max-w-md max-h-[85vh] rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-5 shadow-2xl flex flex-col space-y-4"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-1 sm:hidden" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[17px] font-semibold text-foreground tracking-tight">
                    Disparos Agendados
                  </h4>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Mensagens programadas para envio automático
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduledModal(false)}
                  className="w-8 h-8 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
                {scheduledDispatches.filter((d) => !d.executado).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nenhum disparo agendado pendente.
                  </p>
                ) : (
                  scheduledDispatches
                    .filter((d) => !d.executado)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border/60 dark:border-white/[0.08] p-3.5 space-y-2 bg-secondary/20"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            {format(new Date(item.data_programada), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {item.contatos_ids?.length || 0} destinatários
                          </span>
                        </div>
                        <p className="text-[12.5px] text-foreground/90 line-clamp-2 leading-relaxed">
                          {item.mensagem}
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleCancelScheduled(item.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExecuteNow(item)}
                            className="px-3 py-1 text-[11px] font-semibold bg-foreground text-background rounded-lg active:scale-95 transition-all"
                          >
                            Disparar agora
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
