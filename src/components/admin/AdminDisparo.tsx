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
  Sparkles,
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { getWhatsAppInstance } from "@/lib/whatsappInstanceHelper";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { DispatchScheduleScreen } from "@/components/admin/DispatchScheduleScreen";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import { WhatsAppRequiredBanner } from "@/components/whatsapp/WhatsAppRequiredBanner";
import { useDeletarDisparo } from "@/hooks/useAdminMutations";
import { useTenantBarbersCount } from "@/hooks/useTenantBarbersCount";
import { DisparoSkeleton } from "@/components/ui/loading";

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

function StepProgress({ current, total = 4 }: { current: number; total?: number }) {
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
const DISPATCH_CLIENTS_CACHE_PREFIX = "dub:disparo-clients:v1:";
function dispatchCacheKey(barbeiroId: string | null, tenantId: string | null, audience: string, unitMode: string, unitIds: string[]) {
  const units = unitMode === "specific" ? [...unitIds].sort().join(",") : "";
  return `${DISPATCH_CLIENTS_CACHE_PREFIX}${tenantId ?? "-"}:${barbeiroId ?? "-"}:${audience}:${unitMode}:${units}`;
}
function readDispatchCache(key: string): Client[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Client[]) : null;
  } catch {
    return null;
  }
}
function writeDispatchCache(key: string, data: Client[]) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function AdminDisparo({ tenantId, basePath = "/admin", barbeiroId, canSelectAllClients = false }: AdminDisparoProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const deletarDisparo = useDeletarDisparo(tenantId ?? null);

  const [step, setStep] = useState(1);

  /* ── State ── */
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledDispatches, setScheduledDispatches] = useState<ScheduledDispatch[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showScheduleOverlay, setShowScheduleOverlay] = useState(false);

  /** tenant efetivo para contexto (prop ou resolvido via barbeiro) */
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(barbeiroId ?? null);
  const [contextResolved, setContextResolved] = useState<boolean>(!!barbeiroId || basePath.startsWith("/barbeiro") || basePath.startsWith("/tenant/admin"));
  const effectiveBarbeiroId = barbeiroId ?? resolvedBarbeiroId;
  const effectiveTenantId = tenantId ?? resolvedTenantId;

  /* ── WhatsApp gate para tenants/barbeiros ── */
  const { isConnected: whatsAppConnected, isLoading: whatsAppLoading } = useWhatsAppStatus(effectiveBarbeiroId);

  /** Filtro de audiência: "mine" = só meus clientes, "all" = todos da barbearia */
  const [audience, setAudience] = useState<"mine" | "all">("mine");

  /** Tela de escolha de audiência — quem tem permissão deve escolher antes de prosseguir */
  const [audienceChosen, setAudienceChosen] = useState(false);

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

  // Só faz sentido oferecer "todos os clientes / escolher unidades" quando a
  // barbearia tem mais de um barbeiro. Admin solo vai direto para "meus clientes".
  const { hasMultiple: tenantHasMultipleBarbers, loading: barbersCountLoading } =
    useTenantBarbersCount(effectiveTenantId);
  const canSendToAllClients = canSelectAllClients && tenantHasMultipleBarbers;
  // A tela de escolha de audiência só aparece se o usuário TEM permissão para enviar para todos
  // Barbeiros comuns (canSelectAllClients=false) ou admins solo vão direto para "meus clientes"
  const shouldChooseAudienceFirst = canSendToAllClients;

  // Regra de entrada da jornada:
  // - Se pode escolher audiência → mostra tela de seleção
  // - Se é barbeiro comum / admin solo → pula direto para "mine" sem tela intermediária
  useEffect(() => {
    if (!contextResolved) return;
    if (canSelectAllClients && barbersCountLoading) return;

    if (shouldChooseAudienceFirst) {
      setAudience(effectiveBarbeiroId ? "mine" : "all");
      setSelectedClients(new Set());
      setSelectAll(false);
      setAudienceChosen(false);
      return;
    }

    // Barbeiro comum, admin global ou admin solo → pula tela de audiência
    setAudience("mine");
    setAudienceChosen(true);
  }, [contextResolved, shouldChooseAudienceFirst, effectiveBarbeiroId, canSelectAllClients, barbersCountLoading]);

  useEffect(() => {
    if (audienceChosen) loadClients();
    loadScheduledDispatches();
    // Refetch de programados a cada 2 min (antes 30s) — reduz carga sem impactar UX.
    const interval = setInterval(() => loadScheduledDispatches(), 120000);
    return () => clearInterval(interval);
  }, [effectiveTenantId, audienceChosen]);

  useEffect(() => {
    if (audienceChosen) loadClients();
  }, [audience, effectiveTenantId, effectiveBarbeiroId, audienceChosen, unitSelectionMode, selectedUnitIds.size]);

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
    // 1) Hidratação síncrona do cache — mostra a lista imediatamente sem spinner.
    const cacheKey = dispatchCacheKey(
      effectiveBarbeiroId ?? null,
      effectiveTenantId ?? null,
      audience,
      unitSelectionMode,
      [...selectedUnitIds],
    );
    const cachedClients = readDispatchCache(cacheKey);
    if (cachedClients) {
      setClients(cachedClients);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      // Filtrar clientes por contexto: barbeiro individual ou tenant.
      // Paralelizamos a busca de barbeiros (para exclusão) com a busca de
      // IDs permitidos para reduzir o tempo total de round-trip.
      let allowedClientIds: string[] | null = null;
      const filterByUnits = audience === "all" && unitSelectionMode === "specific" && selectedUnitIds.size > 0;
      const unitIdsArray = filterByUnits ? [...selectedUnitIds] : [];

      const barberUserIdsPromise = supabase
        .from("barbeiros")
        .select("user_id")
        .not("user_id", "is", null)
        .then((r) => r.data?.map((b) => b.user_id).filter(Boolean) || []);

      if (effectiveBarbeiroId && !effectiveTenantId) {
        const [barberUserIds, { data: agendamentos }] = await Promise.all([
          barberUserIdsPromise,
          supabase
            .from("agendamentos")
            .select("user_id")
            .eq("barbeiro_id", effectiveBarbeiroId)
            .not("user_id", "is", null),
        ]);
        allowedClientIds = [...new Set(agendamentos?.map((a) => a.user_id) || [])];
        return await finishLoad(allowedClientIds, barberUserIds, cacheKey);
      }

      if (effectiveTenantId && audience === "mine" && effectiveBarbeiroId) {
        const [barberUserIds, { data: agendamentos }] = await Promise.all([
          barberUserIdsPromise,
          supabase
            .from("agendamentos")
            .select("user_id")
            .eq("barbeiro_id", effectiveBarbeiroId)
            .not("user_id", "is", null),
        ]);
        allowedClientIds = [...new Set(agendamentos?.map((a) => a.user_id) || [])];
        return await finishLoad(allowedClientIds, barberUserIds, cacheKey);
      }

      if (effectiveTenantId) {
        // "Todos os clientes": rodar todas as fontes em paralelo em vez de sequencial.
        const [barberUserIds, tenantBarbersRes, tenantClientesRes, preferredProfilesRes] = await Promise.all([
          barberUserIdsPromise,
          supabase
            .from("barbeiros")
            .select("id")
            .eq("tenant_id", effectiveTenantId)
            .eq("ativo", true),
          supabase
            .from("tenant_clientes")
            .select("user_id")
            .eq("tenant_id", effectiveTenantId)
            .not("user_id", "is", null),
          supabase
            .from("profiles")
            .select("id")
            .eq("barbearia_preferida_id", effectiveTenantId),
        ]);

        let tenantBarberIds = tenantBarbersRes.data?.map((b) => b.id) || [];
        if (filterByUnits && tenantBarberIds.length > 0) {
          const { data: barberUnits } = await supabase
            .from("barbeiro_unidades")
            .select("barbeiro_id")
            .in("unidade_id", unitIdsArray)
            .in("barbeiro_id", tenantBarberIds);
          const unitBarberIds = new Set(barberUnits?.map((bu) => bu.barbeiro_id) || []);
          tenantBarberIds = tenantBarberIds.filter((id) => unitBarberIds.has(id));
        }

        const idsSet = new Set<string>();
        if (tenantBarberIds.length > 0) {
          let agQuery = supabase
            .from("agendamentos")
            .select("user_id")
            .in("barbeiro_id", tenantBarberIds)
            .not("user_id", "is", null);
          if (filterByUnits) agQuery = agQuery.in("unidade_id", unitIdsArray);
          const { data: agendamentos } = await agQuery;
          agendamentos?.forEach((a) => idsSet.add(a.user_id));
        }
        tenantClientesRes.data?.forEach((tc) => idsSet.add(tc.user_id));
        preferredProfilesRes.data?.forEach((p) => idsSet.add(p.id));
        allowedClientIds = [...idsSet];
        return await finishLoad(allowedClientIds, barberUserIds, cacheKey);
      }

      const barberUserIds = await barberUserIdsPromise;
      await finishLoad(null, barberUserIds, cacheKey);
    } catch (error) {
      console.error(error);
      if (!cachedClients) toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  };

  const finishLoad = async (
    allowedClientIds: string[] | null,
    barberUserIds: string[],
    cacheKey: string,
  ) => {
    if (allowedClientIds !== null && allowedClientIds.length === 0) {
      setClients([]);
      writeDispatchCache(cacheKey, []);
      return;
    }
    let query = supabase
      .from("profiles")
      .select("id, nome, telefone")
      .not("telefone", "is", null)
      .order("nome", { ascending: true });
    if (allowedClientIds !== null) query = query.in("id", allowedClientIds);
    if (barberUserIds.length > 0) {
      query = (query as any).not("id", "in", `(${barberUserIds.join(",")})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const filtered = (data || []).filter((c) => c.telefone) as Client[];
    setClients(filtered);
    writeDispatchCache(cacheKey, filtered);
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

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedClients(checked ? new Set(filteredClients.map((c) => c.id)) : new Set());
  };

  const handleSelectClient = (clientId: string, checked: boolean) => {
    const next = new Set(selectedClients);
    checked ? next.add(clientId) : next.delete(clientId);
    setSelectedClients(next);
    setSelectAll(next.size === filteredClients.length && filteredClients.length > 0);
  };

  /* ── Insert Variable ── */

  const insertVariable = (varKey: string) => {
    setMessage((prev) => prev + varKey);
    textareaRef.current?.focus();
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
    // Avança automaticamente para o próximo step
    setStep(3);
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
        toast.success("Mensagem aprimorada pela IA");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao melhorar mensagem");
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
    setSelectedClients(new Set());
    setSelectAll(false);
    setScheduledDate("");
    setSendMode("now");
  };

  /* ═══════════════════════════════════════════════ */
  /* Step Validation                                */
  /* ═══════════════════════════════════════════════ */

  const canAdvance = (): boolean => {
    if (step === 1) return selectedClients.size > 0;
    if (step === 2) return message.trim().length > 0;
    if (step === 3) return sendMode === "now" || (sendMode === "schedule" && !!scheduledDate);
    return true;
  };

  const handleNext = () => {
    if (!canAdvance()) {
      if (step === 1) toast("Selecione pelo menos um cliente.", { icon: "👆" });
      if (step === 2) toast("Escreva a mensagem antes de avançar.", { icon: "✍️" });
      if (step === 3) toast("Selecione a data e horário.", { icon: "📅" });
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleConfirm = () => {
    if (sendMode === "now") handleSendMessages();
    else handleScheduleDispatch();
  };

  const charCount = message.length;
  const shouldLockMobileViewport = isMobile && (showScheduleOverlay || step === 3);

  /* ── Auto-dismiss success ── */
  useEffect(() => {
    if (successScreen) {
      const timer = setTimeout(() => setSuccessScreen(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successScreen]);

  /* ═══════════════════════════════════════════════ */
  /* RENDER                                         */
  /* ═══════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════ */
  /* Audience Selection Screen — SEMPRE PRIMEIRO     */
  /* (WhatsApp gate vem DEPOIS para evitar flash)    */
  /* ═══════════════════════════════════════════════ */

  if (!contextResolved) {
    return <DisparoSkeleton rows={8} />;
  }

  if (shouldChooseAudienceFirst && !audienceChosen && !showUnitPicker) {
    const handleChooseAudience = (choice: "all" | "mine") => {
      if (choice === "all" && !canSendToAllClients) {
        toast.error("Este perfil só pode enviar para os próprios clientes.");
        return;
      }

      if (choice === "all") {
        // Ir para seleção de unidades antes de prosseguir
        setAudience("all");
        loadUnits();
        setShowUnitPicker(true);
        return;
      }

      setAudience(choice);
      setSelectedClients(new Set());
      setSelectAll(false);
      setAudienceChosen(true);
    };

    return (
      <div className={cn(
        "flex flex-col",
        isMobile ? "-mx-3 -mt-3 min-h-[100dvh]" : "min-h-[70vh]"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center gap-3",
          isMobile ? "px-4 h-14" : "px-6 pt-6 pb-3"
        )}>
          <BackNavButton onClick={() => navigate(basePath)} />
          <h1 className="text-[17px] font-semibold text-foreground tracking-tight">
            Disparo de Mensagens
          </h1>
        </div>

        {/* Conteúdo centralizado */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm flex flex-col items-center"
          >
            <p className="text-[13px] text-muted-foreground text-center">
              Para quem deseja enviar?
            </p>

            {/* Cards */}
            <div className="w-full mt-8 space-y-2.5">
              {/* Todos os clientes */}
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => canSendToAllClients && handleChooseAudience("all")}
                disabled={!canSendToAllClients}
                className={cn(
                  "group w-full flex items-center gap-4 rounded-2xl p-4 transition-all duration-200 text-left",
                  "bg-card border border-border",
                  canSendToAllClients && "hover:border-foreground/20 active:scale-[0.98]",
                  !canSendToAllClients && "opacity-40 cursor-not-allowed"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <Users className="w-4.5 h-4.5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-foreground">
                    Todos os clientes
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {canSendToAllClients ? "Toda a base da barbearia" : "Requer vínculo com barbearia"}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              </motion.button>

              {/* Meus clientes */}
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => effectiveBarbeiroId && handleChooseAudience("mine")}
                disabled={!effectiveBarbeiroId}
                className={cn(
                  "group w-full flex items-center gap-4 rounded-2xl p-4 transition-all duration-200 text-left",
                  "bg-card border border-border",
                  effectiveBarbeiroId && "hover:border-foreground/20 active:scale-[0.98]",
                  !effectiveBarbeiroId && "opacity-40 cursor-not-allowed"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <UserCheck className="w-4.5 h-4.5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-foreground">
                    Somente meus clientes
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {effectiveBarbeiroId ? "Clientes que já agendaram com você" : "Requer perfil de barbeiro"}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════ */
  /* Unit Selection Screen — Full Page               */
  /* ═══════════════════════════════════════════════ */

  if (showUnitPicker) {
    const handleUnitConfirm = () => {
      if (unitSelectionMode === "specific" && selectedUnitIds.size === 0) {
        toast("Selecione pelo menos uma unidade.", { icon: "📍" });
        return;
      }
      setSelectedClients(new Set());
      setSelectAll(false);
      setShowUnitPicker(false);
      setAudienceChosen(true);
    };

    const handleSelectAllUnits = () => {
      setUnitSelectionMode("all");
      setSelectedUnitIds(new Set());
    };

    const handleToggleUnit = (unitId: string) => {
      // Quando toca numa unidade específica, sai do modo "todas"
      setUnitSelectionMode("specific");
      setSelectedUnitIds((prev) => {
        const next = new Set(prev);
        next.has(unitId) ? next.delete(unitId) : next.add(unitId);
        return next;
      });
    };

    const allSelected = unitSelectionMode === "all";
    const canConfirm = allSelected || selectedUnitIds.size > 0;

    return (
      <div className={cn(
        "flex flex-col",
        isMobile ? "-mx-3 -mt-3 min-h-[100dvh]" : "min-h-[70vh]"
      )}>
        {/* ── Header ── */}
        <div className={cn(
          "sticky top-0 z-10 bg-background",
          isMobile ? "px-4 h-14 flex items-center" : "px-6 pt-6 pb-4"
        )}>
          <div className="flex items-center gap-3 w-full">
            <BackNavButton
              onClick={() => {
                setShowUnitPicker(false);
                setSelectedUnitIds(new Set());
                setUnitSelectionMode("all");
              }}
            />
            <h1 className="text-[17px] font-semibold text-foreground tracking-tight flex-1">
              Unidades
            </h1>
          </div>
        </div>

        {/* ── Corpo ── */}
        <div className={cn(
          "flex-1 overflow-y-auto",
          isMobile ? "px-4 pb-32" : "px-6 pb-8"
        )}>
          {loadingUnits ? (
            <div className="py-20 text-center">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mx-auto mb-3" />
              <p className="text-[12px] text-muted-foreground">Carregando...</p>
            </div>
          ) : units.length === 0 ? (
            <div className="py-20 text-center">
              <Building2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" strokeWidth={1.5} />
              <p className="text-[13px] text-muted-foreground font-medium">Nenhuma unidade cadastrada</p>
              <Button
                onClick={() => {
                  setUnitSelectionMode("all");
                  setShowUnitPicker(false);
                  setAudienceChosen(true);
                }}
                className="mt-6 h-11 rounded-2xl text-[13px] font-semibold px-6"
              >
                Continuar sem filtro
              </Button>
            </div>
          ) : (
            <div className="space-y-1 pt-1">
              {/* Todas as unidades — linha compacta */}
              <button
                onClick={handleSelectAllUnits}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 transition-all duration-150 text-left",
                  allSelected ? "bg-foreground/[0.05]" : "hover:bg-secondary/40"
                )}
              >
                <div className={cn(
                  "w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                  allSelected ? "bg-foreground border-foreground" : "border-muted-foreground/30"
                )}>
                  {allSelected && <Check className="w-3 h-3 text-background" />}
                </div>
                <span className="text-[13px] font-medium text-foreground flex-1">
                  Todas as unidades
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {units.length}
                </span>
              </button>

              <div className="h-px bg-border/40 mx-3.5" />

              {/* Unidades individuais */}
              {units.map((unit) => {
                const isSelected = !allSelected && selectedUnitIds.has(unit.id);
                return (
                  <button
                    key={unit.id}
                    onClick={() => handleToggleUnit(unit.id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 transition-all duration-150 text-left",
                      isSelected
                        ? "bg-foreground/[0.05]"
                        : allSelected ? "opacity-35" : "hover:bg-secondary/40"
                    )}
                  >
                    <div className={cn(
                      "w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                      isSelected ? "bg-foreground border-foreground" : "border-muted-foreground/30"
                    )}>
                      {isSelected && <Check className="w-3 h-3 text-background" />}
                    </div>
                    <span className="flex-1 text-[13px] font-medium text-foreground truncate">
                      {unit.nome}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Botão circular fixo ── */}
        {units.length > 0 && (
          <div
            className={cn(
              "fixed z-[80] pointer-events-none",
              isMobile ? "right-4" : "right-6"
            )}
            style={{
              bottom: isMobile
                ? "calc(5rem + env(safe-area-inset-bottom))"
                : "1.25rem",
            }}
          >
            <button
              type="button"
              onClick={handleUnitConfirm}
              disabled={!canConfirm}
              aria-label="Continuar"
              className={cn(
                "pointer-events-auto w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)]",
                "bg-foreground text-background hover:opacity-90 active:scale-95",
                "disabled:opacity-35 disabled:cursor-not-allowed"
              )}
            >
              <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] ml-[2px]" fill="currentColor" aria-hidden="true">
                <path d="M2.5 3.2c-.5-.2-1 .3-.8.8l3 7.3c.1.3.4.5.7.5l9.3.7c.2 0 .2.3 0 .3l-9.3.7c-.3 0-.6.2-.7.5l-3 7.3c-.2.5.3 1 .8.8l19-8.7c.5-.2.5-.9 0-1.1l-19-8.7z" />
              </svg>
            </button>
          </div>
        )}

      </div>
    );
  }



  /* audiência, nunca antes (evita flash)             */
  /* ═══════════════════════════════════════════════ */

  if (effectiveBarbeiroId && !whatsAppLoading && !whatsAppConnected) {
    return <WhatsAppRequiredBanner variant="fullblock" basePath={basePath} />;
  }

  /* ═══════════════════════════════════════════════ */
  /* RENDER                                         */
  /* ═══════════════════════════════════════════════ */

  return (
    <div className={cn(
      "relative",
      isMobile
        ? shouldLockMobileViewport
          ? "h-[100dvh] overflow-hidden overscroll-none -mx-3 -mt-3"
          : step === 4
            ? "pb-0 -mx-3 -mt-3"
            : "pb-28 -mx-3 -mt-3"
        : "pb-28"
    )}>

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
            <div className="pointer-events-auto bg-card/95 backdrop-blur-xl border border-border/30 rounded-2xl shadow-2xl flex flex-col items-center text-center mx-4 px-8 py-6 max-w-[300px]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.1 }}
                className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center mb-3"
              >
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </motion.div>
              <p className="text-[14px] font-bold text-foreground">
                {successScreen.type === "sent" ? "Disparo enviado" : "Disparo agendado"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {successScreen.type === "sent"
                  ? `${successScreen.count} mensagen${successScreen.count > 1 ? "s enviadas" : " enviada"} com sucesso`
                  : `Agendado para ${successScreen.date}`}
              </p>
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 3, ease: "linear" }}
                className="w-full h-0.5 bg-primary/20 rounded-full mt-3 origin-left"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════ */}
      {/* Header                                     */}
      {/* ═══════════════════════════════════════════ */}

      {isMobile ? (
        <AnimatePresence>
          {!showScheduleOverlay && (
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="sticky top-0 z-30 bg-background"
            >
              <div className="px-4 pt-3 pb-3">
                <div className="relative flex items-center justify-center h-10">
                  <div className="absolute left-0">
                    <BackNavButton onClick={() => {
                      if (step > 1) handleBack();
                      else navigate(basePath);
                    }} />
                  </div>
                  <h2 className="text-[15px] font-semibold text-foreground">
                    Disparo
                  </h2>
                </div>
                <div className="pt-3">
                  <StepProgress current={step} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className={cn("mb-6", showScheduleOverlay && "hidden")}>
          <div className="relative flex items-center justify-center h-10 mb-4">
            <div className="absolute left-0">
              <BackNavButton onClick={() => {
                if (step > 1) handleBack();
                else navigate(basePath);
              }} />
            </div>
            <h1 className="text-[15px] font-semibold text-foreground tracking-tight">
              Disparo de Mensagens
            </h1>
          </div>
          <div className="max-w-[420px] mx-auto">
            <StepProgress current={step} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* Step Content                               */}
      {/* ═══════════════════════════════════════════ */}

      <div className={cn(
        isMobile && !showScheduleOverlay && (step === 3 || step === 4 ? "px-4 h-[calc(100dvh-56px)] overflow-hidden" : "px-4 pt-4"),
        showScheduleOverlay && "h-[100dvh] overflow-hidden"
      )}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className={cn(isMobile && (step === 3 || step === 4) && !showScheduleOverlay && "h-full")}
          >

            {/* ─── STEP 1: Seleção de Clientes ─── */}
            {step === 1 && (
              <div className={cn(!isMobile && "flex gap-6")}>
                <div className={cn("flex-1 min-w-0 space-y-3")}>

                  {/* Indicador de audiência — discreto, sem ícone */}
                  {!!shouldChooseAudienceFirst && audienceChosen && (
                    <button
                      onClick={() => {
                        setAudienceChosen(false);
                        setShowUnitPicker(false);
                        setSelectedUnitIds(new Set());
                        setUnitSelectionMode("all");
                      }}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-fit"
                    >
                      <span className="font-medium">
                        {audience === "all" ? "Todos os clientes" : "Meus clientes"}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">· Alterar</span>
                    </button>
                  )}

                  {/* Barra de busca — estilo Auth (floating, alto, arredondado) */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-5 h-5 text-muted-foreground/50 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        placeholder="Buscar cliente"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-12 h-14 rounded-2xl border border-border/30 bg-secondary/30 text-[15px] font-normal placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                      />
                    </div>
                    {selectedClients.size > 0 && (
                      <div className="flex items-center gap-1.5 h-14 px-4 rounded-2xl bg-primary/10 text-primary text-[14px] font-bold tabular-nums shrink-0 transition-all">
                        <UserCheck className="w-4 h-4" />
                        {selectedClients.size}
                      </div>
                    )}
                  </div>


                  {/* Selecionar todos */}
                  <button
                    onClick={() => handleSelectAll(!selectAll)}
                    className="flex items-center gap-2 px-1 py-1"
                  >
                    <div className={cn(
                      "w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                      selectAll ? "bg-primary border-primary" : "border-muted-foreground/30"
                    )}>
                      {selectAll && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className="text-[12px] text-muted-foreground font-medium">
                      {selectAll ? "Desmarcar todos" : "Selecionar todos"} ({filteredClients.length})
                    </span>
                  </button>

                  {/* Lista de clientes */}
                  <div className="overflow-hidden">
                    {loading ? (
                      <div className="py-14 text-center">
                        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mx-auto mb-2" />
                        <p className="text-[11px] text-muted-foreground">Carregando clientes...</p>
                      </div>
                    ) : filteredClients.length === 0 ? (
                      <div className="py-14 text-center">
                        <p className="text-[12px] text-muted-foreground">Nenhum cliente encontrado</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/40 pb-[calc(9rem+env(safe-area-inset-bottom))]">
                        {filteredClients.map((client) => {
                          const isSelected = selectedClients.has(client.id);
                          return (
                            <div
                              key={client.id}
                              className="flex items-center gap-3.5 cursor-pointer transition-colors duration-100 px-2 py-4 active:bg-secondary/40"
                              onClick={() => handleSelectClient(client.id, !isSelected)}
                              style={{ touchAction: "manipulation" }}
                            >
                              <ClientInitials name={client.nome} isSelected={isSelected} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-medium text-foreground truncate leading-tight">
                                  {client.nome}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                                  {client.telefone}
                                </p>
                              </div>
                              <div className={cn(
                                "w-[24px] h-[24px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                                isSelected
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground/25"
                              )}>
                                {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Desktop: Resumo lateral */}
                {!isMobile && (
                  <div className="w-64 shrink-0 space-y-4">
                    <div className="rounded-xl border border-border bg-card p-5 sticky top-4">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Selecionados</p>
                          <p className="text-2xl font-bold text-foreground tabular-nums">{selectedClients.size}</p>
                        </div>
                      </div>
                      <div className="h-px bg-border mb-3" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {selectedClients.size === 0
                          ? "Selecione os clientes na lista ao lado."
                          : `${selectedClients.size} de ${clients.length} clientes receberão a mensagem.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── STEP 2: Mensagem ─── */}
            {step === 2 && (
              <div className={cn("flex flex-col justify-center", isMobile ? "min-h-[70vh]" : "min-h-[65vh]")}>
                <div
                  className={cn("w-full flex flex-col flex-1 justify-center", isMobile ? "max-w-[98%] mx-auto" : "max-w-2xl mx-auto")}
                  style={{
                    transform: isMobile && keyboardHeight > 0
                      ? `translateY(-${Math.min(keyboardHeight * 0.45, 140)}px)`
                      : undefined,
                    transition: "transform 200ms ease-out",
                  }}
                >
                  <div className="w-full space-y-4">
                    {/* Editor estilo WhatsApp — pill branca + botão circular externo */}
                    <div className="flex items-end gap-2">
                      <div className="relative flex-1 rounded-3xl bg-white dark:bg-white/5 shadow-sm flex items-end gap-1 pl-3 pr-1 py-1.5 border border-transparent dark:border-white/10">
                        <textarea
                          ref={textareaRef}
                          value={message}
                          rows={1}
                          onChange={(e) => {
                            setMessage(e.target.value);
                            const el = e.currentTarget;
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                          }}
                          onFocus={(e) => {
                            const el = e.currentTarget;
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                          }}
                          placeholder="Mensagem"
                          className="flex-1 resize-none bg-transparent border-0 outline-none focus:outline-none focus:ring-0 !min-h-[36px] max-h-[160px] overflow-y-auto text-[15px] leading-[1.4] px-1 py-[7px] transition-[height] duration-150 ease-out text-[#111b21] dark:text-white placeholder:text-[#8696a0] dark:placeholder:text-white/40"
                        />

                        {/* Botão IA à direita, dentro da pill */}
                        <button
                          type="button"
                          onClick={handleImproveMessage}
                          disabled={improveLoading || message.trim().length < 3}
                          className="shrink-0 self-end mb-[3px] text-[13px] font-bold tracking-wide rounded-full px-2.5 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60"
                          style={{ color: "#f43f5e" }}
                          aria-label="Otimizar com IA"
                        >
                          {improveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "IA"}
                        </button>
                      </div>

                      {/* Botão circular externo — enviar/gravar */}
                      <button
                        type="button"
                        onClick={message.trim().length > 0 ? handleNext : handleToggleRecording}
                        className={cn(
                          "shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95",
                          message.trim().length > 0
                            ? "bg-accent-red hover:brightness-110 shadow-sm"
                            : isRecording
                              ? "bg-accent-red animate-pulse shadow-sm"
                              : "bg-transparent border border-white/15 dark:border-white/20 hover:bg-white/5"
                        )}
                        style={{ color: message.trim().length > 0 || isRecording ? "#ffffff" : "#e5e7eb" }}
                        aria-label={message.trim().length > 0 ? "Enviar" : isRecording ? "Parar gravação" : "Gravar áudio"}
                      >
                        {message.trim().length > 0
                          ? (
                              <svg
                                viewBox="0 0 24 24"
                                className="w-[22px] h-[22px] ml-[2px]"
                                fill="#ffffff"
                                aria-hidden="true"
                              >
                                <path d="M2.5 3.2c-.5-.2-1 .3-.8.8l3 7.3c.1.3.4.5.7.5l9.3.7c.2 0 .2.3 0 .3l-9.3.7c-.3 0-.6.2-.7.5l-3 7.3c-.2.5.3 1 .8.8l19-8.7c.5-.2.5-.9 0-1.1l-19-8.7z" />
                              </svg>
                            )

                          : isRecording
                            ? <MicOff className="w-[19px] h-[19px]" strokeWidth={1.6} />
                            : <Mic className="w-[19px] h-[19px]" strokeWidth={1.6} />}
                      </button>
                    </div>


                    <p className="text-[10.5px] text-white/90 text-center px-2 leading-relaxed">
                      Toque em <span className="font-semibold" style={{ color: "#f43f5e" }}>IA</span> para deixar sua mensagem mais estratégica, direta e adequada ao WhatsApp.
                    </p>

                  </div>

                </div>
              </div>
            )}


            {/* ─── STEP 3: Envio ─── */}
            {step === 3 && !showScheduleOverlay && (
              <div className={cn(
                "flex flex-col items-center justify-center",
                isMobile ? "h-full" : "min-h-[60vh]"
              )}>
                <div className={cn("w-full space-y-3", isMobile ? "max-w-sm" : "max-w-md")}>

                  {/* Contextual label */}
                  <div className="text-center mb-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
                      Quando enviar?
                    </p>
                  </div>

                  {/* Enviar Agora */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSendMode("now");
                      setScheduledDate("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 text-left",
                      sendMode === "now"
                        ? "border-foreground/20 bg-foreground/[0.04]"
                        : "border-border bg-card hover:bg-card/80"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                      sendMode === "now" ? "bg-foreground/10" : "bg-secondary"
                    )}>
                      <Zap className={cn("w-4 h-4 transition-colors", sendMode === "now" ? "text-foreground" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        Enviar agora
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {selectedClients.size} contato{selectedClients.size !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className={cn(
                      "w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                      sendMode === "now" ? "bg-foreground border-foreground" : "border-muted-foreground/25"
                    )}>
                      {sendMode === "now" && <Check className="w-3 h-3 text-background" />}
                    </div>
                  </motion.button>

                  {/* Agendar envio */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSendMode("schedule");
                      setShowScheduleOverlay(true);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 text-left",
                      sendMode === "schedule" && scheduledDate
                        ? "border-foreground/20 bg-foreground/[0.04]"
                        : "border-border bg-card hover:bg-card/80"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                      sendMode === "schedule" && scheduledDate ? "bg-foreground/10" : "bg-secondary"
                    )}>
                      <CalendarClock className={cn("w-4 h-4 transition-colors", sendMode === "schedule" && scheduledDate ? "text-foreground" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        Agendar envio
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {scheduledDate
                          ? format(new Date(scheduledDate), "dd/MM 'às' HH:mm", { locale: ptBR })
                          : "Escolha data e horário"}
                      </p>
                    </div>
                    <div className={cn(
                      "w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                      sendMode === "schedule" && scheduledDate ? "bg-foreground border-foreground" : "border-muted-foreground/25"
                    )}>
                      {sendMode === "schedule" && scheduledDate && <Check className="w-3 h-3 text-background" />}
                    </div>
                  </motion.button>

                  {/* Scheduled date badge */}
                  <AnimatePresence>
                    {sendMode === "schedule" && scheduledDate && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="flex items-center justify-center"
                      >
                        <button
                          onClick={() => setShowScheduleOverlay(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/50 border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <CalendarClock className="w-3 h-3" />
                          <span className="capitalize">
                            {format(new Date(scheduledDate), "EEEE, dd MMM · HH:mm", { locale: ptBR })}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">· editar</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* ─── Schedule Full Screen ─── */}
            {step === 3 && showScheduleOverlay && (
              <div className="fixed inset-0 z-40 bg-background pt-[env(safe-area-inset-top)]">
                <DispatchScheduleScreen
                  initialDate={scheduledDate || undefined}
                  onBack={() => {
                    setShowScheduleOverlay(false);
                    if (!scheduledDate) setSendMode("now");
                  }}
                  onConfirm={(isoDate) => {
                    setScheduledDate(isoDate);
                    setShowScheduleOverlay(false);
                  }}
                />
              </div>
            )}

            {/* ─── STEP 4: Revisão ─── */}
            {step === 4 && (
              <div className={cn(
                "flex flex-col",
                isMobile ? "h-full justify-center" : "max-w-2xl"
              )}>

                {/* Resumo compacto — destinatários + modo de envio */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-card">
                    <UserCheck className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[13px] font-semibold text-foreground tabular-nums">{selectedClients.size}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedClients.size === 1 ? "destinatário" : "destinatários"}
                    </span>
                  </div>

                  <div className="w-px h-5 bg-border" />

                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-card">
                    {sendMode === "now" ? (
                      <Zap className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <CalendarClock className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span className="text-[12px] font-medium text-foreground">
                      {sendMode === "now" 
                        ? "Envio imediato" 
                        : scheduledDate 
                          ? format(new Date(scheduledDate), "dd MMM · HH:mm", { locale: ptBR })
                          : "—"
                      }
                    </span>
                  </div>
                </div>

                {/* WhatsApp Preview — protagonista da tela */}
                <div>
                  <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-[0.18em] mb-3 text-center">
                    Prévia da mensagem
                  </p>
                  <WhatsAppPreview message={message} />
                </div>

              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* Botão de ação — simples, branco, centralizado */}
      {/* ═══════════════════════════════════════════ */}

      <AnimatePresence>
        {!showScheduleOverlay && !(step === 1 && selectedClients.size === 0) && step !== 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "z-[80] pointer-events-none",
              isMobile ? "fixed right-4" : "fixed right-6"
            )}
            style={
              isMobile
                ? {
                    bottom:
                      keyboardHeight > 0
                        ? `calc(${keyboardHeight}px + 12px)`
                        : "calc(5rem + env(safe-area-inset-bottom))",
                    transition: "bottom 180ms ease-out",
                  }
                : { bottom: "1.25rem" }
            }
          >
            {step < 4 ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleNext}
                disabled={!canAdvance()}
                aria-label="Continuar"
                className={cn(
                  "pointer-events-auto w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)]",
                  "bg-foreground text-background hover:opacity-90",
                  "disabled:opacity-35 disabled:cursor-not-allowed"
                )}
              >
                <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] ml-[2px]" fill="currentColor" aria-hidden="true">
                  <path d="M2.5 3.2c-.5-.2-1 .3-.8.8l3 7.3c.1.3.4.5.7.5l9.3.7c.2 0 .2.3 0 .3l-9.3.7c-.3 0-.6.2-.7.5l-3 7.3c-.2.5.3 1 .8.8l19-8.7c.5-.2.5-.9 0-1.1l-19-8.7z" />
                </svg>
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleConfirm}
                disabled={sending || scheduling}
                aria-label="Confirmar envio"
                className={cn(
                  "pointer-events-auto w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)]",
                  "bg-foreground text-background hover:opacity-90 disabled:opacity-40"
                )}
              >
                {(sending || scheduling) ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] ml-[2px]" fill="currentColor" aria-hidden="true">
                    <path d="M2.5 3.2c-.5-.2-1 .3-.8.8l3 7.3c.1.3.4.5.7.5l9.3.7c.2 0 .2.3 0 .3l-9.3.7c-.3 0-.6.2-.7.5l-3 7.3c-.2.5.3 1 .8.8l19-8.7c.5-.2.5-.9 0-1.1l-19-8.7z" />
                  </svg>
                )}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>



    </div>
  );
}
