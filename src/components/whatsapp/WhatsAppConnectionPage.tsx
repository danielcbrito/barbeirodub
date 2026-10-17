import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, QrCode, RefreshCw, CheckCircle2, Copy, Check,
  ArrowRight, ShieldCheck, Smartphone, Bot, Bell, Sparkles,
  SlidersHorizontal, MessageSquare, Clock, Zap, ChevronRight,
  ChevronDown, Save, AlertCircle, AlertTriangle, CalendarClock, Store, Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInterval } from "@/hooks/useInterval";
import { resolvePrimaryBarberForUser } from "@/lib/tenantOwnership";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

interface WhatsAppConnectionPageProps {
  barbeiroId?: string | null;
  userId?: string;
  basePath?: string;
  tenantNome?: string;
  barberName?: string;
  hideHeader?: boolean;
  tenantId?: string | null;
  unidadeId?: string | null;
  unidadeNome?: string | null;
  onUnitChange?: (unitId: string) => void;
  onBack?: () => void;
  onBackProp?: () => void;
  hideAgent?: boolean;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
type Method = "pairing" | "qrcode";
type PageView = "main" | "agent-config" | "whatsapp-connection" | "trocar-barbearia";

interface NotificationSettings {
  notificarAgendamento: boolean;
  notificarCancelamento: boolean;
  notificarChegada: boolean;
  lembreteAtivo: boolean;
  lembreteHorasAntes: number;
  pedirAvaliacao: boolean;
}

interface AgentConfig {
  nome: string;
  tom?: string;
  pausaMinutos: number;
  lembreteAtivo: boolean;
  lembreteHorasAntes: number;
  instrucoesExtras: string;
}

const PAIRING_TTL_MS = 180_000;

const DEFAULT_NOTIF_SETTINGS: NotificationSettings = {
  notificarAgendamento: true,
  notificarCancelamento: true,
  notificarChegada: true,
  lembreteAtivo: true,
  lembreteHorasAntes: 3,
  pedirAvaliacao: true,
};

function parseSafeNotif(raw: any): NotificationSettings {
  if (!raw) return DEFAULT_NOTIF_SETTINGS;
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!p || typeof p !== "object") return DEFAULT_NOTIF_SETTINGS;
    return {
      notificarAgendamento: p.notificarAgendamento !== false,
      notificarCancelamento: p.notificarCancelamento !== false,
      notificarChegada: p.notificarChegada !== false,
      lembreteAtivo: p.lembreteAtivo !== false,
      lembreteHorasAntes: typeof p.lembreteHorasAntes === "number" ? p.lembreteHorasAntes : 3,
      pedirAvaliacao: p.pedirAvaliacao !== false,
    };
  } catch {
    return DEFAULT_NOTIF_SETTINGS;
  }
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  nome: "Agente de IA",
  pausaMinutos: 30,
  lembreteAtivo: false,
  lembreteHorasAntes: 2,
  instrucoesExtras: "",
};

function parseSafeAgentConfig(raw: any): AgentConfig {
  if (!raw) return DEFAULT_AGENT_CONFIG;
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!p || typeof p !== "object") return DEFAULT_AGENT_CONFIG;
    return {
      nome: p.nome && p.nome !== "Bia" ? String(p.nome) : "Agente de IA",
      pausaMinutos: typeof p.pausaMinutos === "number" ? p.pausaMinutos : 30,
      lembreteAtivo: Boolean(p.lembreteAtivo),
      lembreteHorasAntes: typeof p.lembreteHorasAntes === "number" ? p.lembreteHorasAntes : 2,
      instrucoesExtras: typeof p.instrucoesExtras === "string" ? p.instrucoesExtras : "",
    };
  } catch {
    return DEFAULT_AGENT_CONFIG;
  }
}

/** (99) 99999-9999 → exibição amigável de um número em dígitos (com ou sem DDI). */
function formatPhoneDisplay(raw: unknown): string {
  if (!raw) return "";
  const str = String(raw).trim();
  if (!str) return "";
  let d = str.replace(/\D/g, "");
  let ddi = "";
  if (d.length > 11) {
    ddi = d.slice(0, d.length - 11);
    d = d.slice(-11);
  }
  const prefix = ddi ? `+${ddi} ` : "";
  if (d.length === 11) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return prefix + d;
}

/** Formata data de conexão com segurança */
function formatConnectedDate(raw: unknown): string {
  if (!raw) return "";
  try {
    const d = new Date(String(raw));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Máscara progressiva enquanto digita: (11) 99999-9999 */
function maskPhoneInput(value: unknown): string {
  const d = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Agrupa o código em blocos de 4: ABCD-1234 */
function formatPairingCode(code: unknown): string {
  const clean = String(code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.match(/.{1,4}/g)?.join("-") ?? clean;
}

const STEPS = [
  "Abra o WhatsApp no seu celular",
  "Toque em Configurações",
  "Entre em Aparelhos conectados",
  "Toque em Conectar aparelho",
  'Escolha "Conectar com número de telefone"',
  "Digite o código mostrado acima",
];

/**
 * Conexão do WhatsApp da barbearia — código de pareamento como método padrão,
 * QR Code disponível como alternativa. Cada barbeiro/barbearia tem sua instância isolada.
 */
export function WhatsAppConnectionPage({
  barbeiroId: barbeiroIdProp,
  userId,
  hideHeader = false,
  tenantId: tenantIdProp,
  unidadeId: unidadeIdProp,
  unidadeNome: unidadeNomeProp,
  tenantNome: tenantNomeProp,
  barberName,
  onUnitChange: onUnitChangeProp,
  onBack: onBackProp,
  hideAgent = false,
}: WhatsAppConnectionPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isHighlightedAgente, setIsHighlightedAgente] = useState(false);
  const aiAgentOptionRef = useRef<HTMLDivElement | null>(null);

  // Cache instantâneo por barbearia (0ms de latência, zero piscadas de desconectado)
  const unitStateCacheRef = useRef<Record<string, {
    barberId: string | null;
    status: ConnectionStatus;
    instanceName: string | null;
    connectedAt: string | null;
    phoneNumber: string | null;
    qrCode: string | null;
    pairingCode: string | null;
    expiresAt: number | null;
    agentActive: boolean;
  }>>({});
  const [unitStatuses, setUnitStatuses] = useState<Record<string, ConnectionStatus>>({});

  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(barbeiroIdProp || null);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantIdProp || null);

  const onUnitChangeRef = useRef(onUnitChangeProp);
  useEffect(() => {
    onUnitChangeRef.current = onUnitChangeProp;
  }, [onUnitChangeProp]);

  const prevUnidadeIdPropRef = useRef(unidadeIdProp);
  const selectedUnitIdRef = useRef<string | null>(unidadeIdProp || null);

  // Deep-link para o Agente de IA com destaque pastel e rolagem suave
  useEffect(() => {
    const shouldHighlight = searchParams.get("highlight") === "agente" || (location.state as any)?.highlight === "agente";
    if (shouldHighlight) {
      setIsHighlightedAgente(true);
      const scrollTimer = setTimeout(() => {
        aiAgentOptionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 350);

      const fadeTimer = setTimeout(() => {
        setIsHighlightedAgente(false);
      }, 5000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(fadeTimer);
      };
    }
  }, [searchParams, location.state]);

  const updateUnitCache = useCallback((unitId: string, partial: Partial<{
    barberId: string | null;
    status: ConnectionStatus;
    instanceName: string | null;
    connectedAt: string | null;
    phoneNumber: string | null;
    qrCode: string | null;
    pairingCode: string | null;
    expiresAt: number | null;
    agentActive: boolean;
  }>) => {
    if (!unitId) return;
    const current = unitStateCacheRef.current[unitId] || {
      barberId: null,
      status: "disconnected",
      instanceName: null,
      connectedAt: null,
      phoneNumber: null,
      qrCode: null,
      pairingCode: null,
      expiresAt: null,
      agentActive: false,
    };
    const updated = { ...current, ...partial };
    unitStateCacheRef.current[unitId] = updated;
    if (partial.status) {
      setUnitStatuses((prev) => ({ ...prev, [unitId]: partial.status! }));
    }
  }, []);

  // Multi-unidade
  const [unidadesList, setUnidadesList] = useState<Array<{
    id: string;
    nome: string;
    is_sede?: boolean;
    whatsapp?: string | null;
    telefone?: string | null;
    logo_url?: string | null;
  }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(unidadeIdProp || null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [method, setMethod] = useState<Method>("pairing");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [wantsNewNumber, setWantsNewNumber] = useState(false);

  const [currentView, setCurrentView] = useState<PageView>("main");

  const [agentConfig, setAgentConfig] = useState<AgentConfig>(() => {
    try {
      const suffix = unidadeIdProp ? `unit_${unidadeIdProp}` : (barbeiroIdProp || "global");
      const key = `dub_whatsapp_agent_cfg_${suffix}`;
      const saved = localStorage.getItem(key) || (unidadeIdProp ? localStorage.getItem(`dub_whatsapp_agent_cfg_${unidadeIdProp}`) : null);
      return parseSafeAgentConfig(saved);
    } catch {
      return DEFAULT_AGENT_CONFIG;
    }
  });

  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => {
    try {
      const suffix = unidadeIdProp ? `unit_${unidadeIdProp}` : (barbeiroIdProp || "global");
      const key = `dub_whatsapp_notif_${suffix}`;
      const saved = localStorage.getItem(key) || (unidadeIdProp ? localStorage.getItem(`dub_whatsapp_notif_${unidadeIdProp}`) : null);
      return parseSafeNotif(saved);
    } catch {
      return DEFAULT_NOTIF_SETTINGS;
    }
  });

  const [agentActive, setAgentActive] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);

  // Controle de salvamento dinâmico das instruções adicionais
  const [savedInstructions, setSavedInstructions] = useState<string>(() => {
    try {
      const suffix = unidadeIdProp ? `unit_${unidadeIdProp}` : (barbeiroIdProp || "global");
      const key = `dub_whatsapp_agent_cfg_${suffix}`;
      const saved = localStorage.getItem(key) || (unidadeIdProp ? localStorage.getItem(`dub_whatsapp_agent_cfg_${unidadeIdProp}`) : null);
      return parseSafeAgentConfig(saved).instrucoesExtras || "";
    } catch {
      return "";
    }
  });
  const [savingInstructions, setSavingInstructions] = useState(false);

  // Modal para confirmação ao ligar lembrete comum quando o da IA já estiver ativo
  const [confirmSwitchToStandardModal, setConfirmSwitchToStandardModal] = useState(false);
  // Modal de conscientização ao ativar o atendimento com IA
  const [showAgentActivatedModal, setShowAgentActivatedModal] = useState(false);
  // Modal de confirmação para escolher se ativa IA apenas na filial atual ou em todas as filiais
  const [showMultiUnitModal, setShowMultiUnitModal] = useState(false);
  // Lista de filiais sem WhatsApp conectado ao ativar atendimento para todas
  const [unitsMissingWhatsapp, setUnitsMissingWhatsapp] = useState<Array<{ id: string; nome: string }>>([]);
  // Drawer (gaveta de baixo para cima) para selecionar qual barbearia configurar sem sair da tela
  const [showSelectUnitDrawer, setShowSelectUnitDrawer] = useState(false);

  // Indica se o texto de instruções extras foi alterado em relação ao que está salvo (100% seguro contra null/undefined)
  const instructionsDirty = (agentConfig?.instrucoesExtras || "").trim() !== (savedInstructions || "").trim();

  const phoneDigits = useMemo(() => String(phoneInput || "").replace(/\D/g, ""), [phoneInput]);
  const phoneValid = phoneDigits.length === 10 || phoneDigits.length === 11;

  const getStorageKey = useCallback((prefix: string) => {
    const suffix = selectedUnitId ? `unit_${selectedUnitId}` : (resolvedBarbeiroId || "global");
    return `${prefix}_${suffix}`;
  }, [selectedUnitId, resolvedBarbeiroId]);

  /** Troca de unidade com isolamento total de agente, notificações e WhatsApp (0ms de latência, sem piscar desconectado) */
  const handleSwitchUnit = useCallback(async (newUnitId: string) => {
    if (!newUnitId) return;
    prevUnidadeIdPropRef.current = newUnitId;
    setSelectedUnitId(newUnitId);
    selectedUnitIdRef.current = newUnitId;
    onUnitChangeRef.current?.(newUnitId);

    // 1. Limpeza de campos de formulário e inputs voláteis
    setPhoneInput("");
    setMethod("pairing");
    setErrorMessage(null);
    setWantsNewNumber(false);
    setConfirmDisconnect(false);

    // 2. Se a unidade já estiver no cache, aplica IMEDIATAMENTE (0ms)!
    const cached = unitStateCacheRef.current[newUnitId];
    if (cached) {
      setStatus(cached.status);
      setInstanceName(cached.instanceName);
      setConnectedAt(cached.connectedAt);
      setPhoneNumber(cached.phoneNumber);
      setQrCode(cached.qrCode);
      setPairingCode(cached.pairingCode);
      setExpiresAt(cached.expiresAt);
      setAgentActive(cached.agentActive);
      if (cached.barberId) setResolvedBarbeiroId(cached.barberId);
      setLoading(false);
    } else {
      // Apenas se nunca foi carregada mostra loading temporário
      setLoading(true);
    }

    // 3. Carrega configurações isoladas do agente e notificações da unidade
    try {
      const keyAgent = `dub_whatsapp_agent_cfg_unit_${newUnitId}`;
      const savedAgent = localStorage.getItem(keyAgent) || localStorage.getItem(`dub_whatsapp_agent_cfg_${newUnitId}`);
      const parsedAgent = parseSafeAgentConfig(savedAgent);
      setAgentConfig(parsedAgent);
      setSavedInstructions(parsedAgent.instrucoesExtras || "");

      const keyNotif = `dub_whatsapp_notif_unit_${newUnitId}`;
      const savedNotif = localStorage.getItem(keyNotif) || localStorage.getItem(`dub_whatsapp_notif_${newUnitId}`);
      setNotifSettings(parseSafeNotif(savedNotif));
    } catch { /* ignore */ }

    // 4. Resolver ou associar barbeiro exclusivo vinculado a essa unidade em background
    try {
      let targetBarberId: string | null = cached?.barberId || null;
      let tId = resolvedTenantId || tenantIdProp;

      if (!targetBarberId) {
        if (!tId && resolvedBarbeiroId) {
          const { data: b } = await supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("id", resolvedBarbeiroId)
            .maybeSingle();
          if (b?.tenant_id) tId = b.tenant_id;
        }

        // a) Buscar barbeiro direto com unidade_id
        const { data: barbUnit } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("unidade_id", newUnitId)
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (barbUnit?.id) {
          targetBarberId = barbUnit.id;
        } else {
          // b) Buscar via tabela barbeiro_unidades
          const { data: linkUnit } = await (supabase as any)
            .from("barbeiro_unidades")
            .select("barbeiro_id")
            .eq("unidade_id", newUnitId)
            .limit(1)
            .maybeSingle();

          if (linkUnit?.barbeiro_id) {
            targetBarberId = linkUnit.barbeiro_id;
          } else {
            // c) Sede fallback: se for a sede ou se já temos o barbeiro principal, usa ele antes de inventar um novo
            const targetUnit = unidadesList.find((u) => u.id === newUnitId);
            if (targetUnit?.is_sede && (resolvedBarbeiroId || barbeiroIdProp)) {
              targetBarberId = resolvedBarbeiroId || barbeiroIdProp || null;
            } else if (tId) {
              // d) Se a unidade ainda não tem barbeiro, cria perfil administrativo
              const unitName = targetUnit?.nome || "Unidade";
              let uId = userId;
              if (!uId) {
                const { data: { user } } = await supabase.auth.getUser();
                uId = user?.id;
              }

              const { data: newBarb } = await supabase
                .from("barbeiros")
                .insert({
                  tenant_id: tId,
                  unidade_id: newUnitId,
                  apelido: unitName,
                  user_id: uId || null,
                  ativo: true,
                  setup_completed: true,
                })
                .select("id")
                .single();

              if (newBarb?.id) {
                targetBarberId = newBarb.id;
                await (supabase as any)
                  .from("barbeiro_unidades")
                  .insert({
                    barbeiro_id: newBarb.id,
                    unidade_id: newUnitId,
                    role: "admin",
                  })
                  .catch(() => {});
              }
            }
          }
        }
      }

      if (targetBarberId) {
        if (selectedUnitIdRef.current === newUnitId) {
          setResolvedBarbeiroId(targetBarberId);
        }

        // Carregar a instância do WhatsApp para este barbeiro/unidade
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("instance_name, status, qrcode_base64, connected_at, phone_number, pairing_code, pairing_expires_at, connection_method")
          .eq("barbeiro_id", targetBarberId)
          .maybeSingle();

        // Status do agente de IA para esta unidade
        const { data: cfg } = await (supabase as any)
          .from("agente_config")
          .select("ativo")
          .eq("barbeiro_id", targetBarberId)
          .maybeSingle();

        const isConnected = inst && inst.status === "connected";
        const isConnecting = inst && inst.status === "connecting";
        const newStatus: ConnectionStatus = isConnected ? "connected" : isConnecting ? "connecting" : "disconnected";
        const newPhone = inst?.phone_number ?? null;
        const newInstName = inst?.instance_name ?? null;
        const newConnAt = isConnected ? (inst?.connected_at ?? null) : null;
        const newQr = isConnecting ? (inst?.qrcode_base64 ?? null) : null;
        let newPairing: string | null = null;
        let newExp: number | null = null;
        if (isConnecting && inst?.pairing_code && inst?.pairing_expires_at) {
          const exp = new Date(inst.pairing_expires_at).getTime();
          if (exp > Date.now()) {
            newPairing = inst.pairing_code;
            newExp = exp;
          }
        }
        const isAgent = !!cfg?.ativo;

        // Atualiza o cache da unidade
        unitStateCacheRef.current[newUnitId] = {
          barberId: targetBarberId,
          status: newStatus,
          instanceName: newInstName,
          connectedAt: newConnAt,
          phoneNumber: newPhone,
          qrCode: newQr,
          pairingCode: newPairing,
          expiresAt: newExp,
          agentActive: isAgent,
        };
        setUnitStatuses((prev) => ({ ...prev, [newUnitId]: newStatus }));

        // Se o usuário ainda estiver com essa unidade selecionada, atualiza os estados na tela
        if (selectedUnitIdRef.current === newUnitId) {
          setStatus(newStatus);
          setInstanceName(newInstName);
          setConnectedAt(newConnAt);
          setPhoneNumber(newPhone);
          setQrCode(newQr);
          setPairingCode(newPairing);
          setExpiresAt(newExp);
          if (inst?.connection_method === "qrcode") setMethod("qrcode");
          setAgentActive(isAgent);
        }
      }
    } catch (err) {
      console.error("[handleSwitchUnit error]", err);
    } finally {
      if (selectedUnitIdRef.current === newUnitId) {
        setLoading(false);
      }
    }
  }, [unidadesList, resolvedTenantId, tenantIdProp, userId, resolvedBarbeiroId, barbeiroIdProp]);

  /* ─── resolver barbeiro ─── */
  useEffect(() => {
    if (barbeiroIdProp) {
      setResolvedBarbeiroId(barbeiroIdProp);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        let uId = userId;
        if (!uId) {
          const { data: { user } } = await supabase.auth.getUser();
          uId = user?.id;
        }
        if (!uId) {
          if (mounted) setLoading(false);
          return;
        }
        const { data } = await resolvePrimaryBarberForUser<{ id: string; tenant_id?: string }>(uId);
        if (!mounted) return;
        if (data?.id) {
          setResolvedBarbeiroId(data.id);
          if (data.tenant_id && !resolvedTenantId) setResolvedTenantId(data.tenant_id);
        } else {
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [barbeiroIdProp, userId, resolvedTenantId]);

  /* ─── Multi-unidade: Carregar barbearias do tenant e pré-carregar instâncias ─── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      let tId = resolvedTenantId || tenantIdProp;
      if (!tId && resolvedBarbeiroId) {
        const { data: b } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", resolvedBarbeiroId)
          .maybeSingle();
        if (b?.tenant_id) {
          tId = b.tenant_id;
          if (mounted) setResolvedTenantId(b.tenant_id);
        }
      }
      if (!tId) return;

      try {
        const { data: units } = await supabase
          .from("tenant_unidades")
          .select("id, nome, is_sede, whatsapp, telefone, logo_url")
          .eq("ativo", true)
          .eq("tenant_id", tId)
          .order("is_sede", { ascending: false })
          .order("created_at", { ascending: true });

        if (!mounted || !units || units.length === 0) return;

        setUnidadesList(units);

        // Pre-carrega em paralelo todos os barbeiros, links e instâncias do tenant
        const [barbersRes, linksRes, agentConfigsRes] = await Promise.all([
          supabase
            .from("barbeiros")
            .select("id, unidade_id, apelido, tenant_id, user_id")
            .eq("tenant_id", tId)
            .eq("ativo", true)
            .is("deleted_at", null),
          (supabase as any)
            .from("barbeiro_unidades")
            .select("barbeiro_id, unidade_id"),
          (supabase as any)
            .from("agente_config")
            .select("barbeiro_id, ativo"),
        ]);

        const allBarbers = (barbersRes.data || []) as any[];
        const allLinks = (linksRes.data || []) as any[];
        const allAgentConfigs = (agentConfigsRes.data || []) as any[];
        const barberIds = allBarbers.map((b) => b.id);

        let instancesData: any[] = [];
        if (barberIds.length > 0) {
          const { data: insts } = await supabase
            .from("whatsapp_instances")
            .select("barbeiro_id, instance_name, status, qrcode_base64, connected_at, phone_number, pairing_code, pairing_expires_at, connection_method")
            .in("barbeiro_id", barberIds);
          instancesData = insts || [];
        }

        const initialStatuses: Record<string, ConnectionStatus> = {};

        units.forEach((u) => {
          let bId: string | null = null;
          const direct = allBarbers.find((b) => b.unidade_id === u.id);
          if (direct) {
            bId = direct.id;
          } else {
            const link = allLinks.find((l) => l.unidade_id === u.id);
            if (link) {
              bId = link.barbeiro_id;
            } else if (u.is_sede) {
              bId = resolvedBarbeiroId || barbeiroIdProp || allBarbers[0]?.id || null;
            }
          }

          const inst = bId ? instancesData.find((i) => i.barbeiro_id === bId) : null;
          const agentCfg = bId ? allAgentConfigs.find((a) => a.barbeiro_id === bId) : null;
          const uStatus: ConnectionStatus = (inst?.status as ConnectionStatus) || "disconnected";

          unitStateCacheRef.current[u.id] = {
            barberId: bId,
            status: uStatus,
            instanceName: inst?.instance_name ?? null,
            connectedAt: inst?.connected_at ?? null,
            phoneNumber: inst?.phone_number ?? null,
            qrCode: inst?.qrcode_base64 ?? null,
            pairingCode: inst?.pairing_code ?? null,
            expiresAt: inst?.pairing_expires_at ? new Date(inst.pairing_expires_at).getTime() : null,
            agentActive: !!agentCfg?.ativo,
          };
          initialStatuses[u.id] = uStatus;
        });

        if (mounted) {
          setUnitStatuses(initialStatuses);
          const initialId = selectedUnitId || unidadeIdProp || units[0].id;
          handleSwitchUnit(initialId);
        }
      } catch (err) {
        console.error("Erro ao carregar unidades para WhatsApp:", err);
      }
    })();
    return () => { mounted = false; };
  }, [tenantIdProp, resolvedTenantId, resolvedBarbeiroId, unidadeIdProp, handleSwitchUnit]);

  // Se a prop unidadeId mudar externamente pelo pai, sincroniza a unidade
  useEffect(() => {
    if (unidadeIdProp && unidadeIdProp !== prevUnidadeIdPropRef.current) {
      prevUnidadeIdPropRef.current = unidadeIdProp;
      handleSwitchUnit(unidadeIdProp);
    }
  }, [unidadeIdProp, handleSwitchUnit]);

  const activeUnit = useMemo(() => {
    if (!unidadesList.length) return null;
    return unidadesList.find((u) => u.id === selectedUnitId) || unidadesList[0] || null;
  }, [unidadesList, selectedUnitId]);

  const activeUnitName = useMemo(() => {
    return activeUnit?.nome || unidadeNomeProp || (tenantNomeProp && tenantNomeProp !== "Barbearia DUB" ? tenantNomeProp : null) || activeUnit?.nome || tenantNomeProp || "Barbearia";
  }, [activeUnit, unidadeNomeProp, tenantNomeProp]);

  /* ─── estado persistido ─── */
  const loadCurrentState = useCallback(async () => {
    if (!resolvedBarbeiroId) return;
    try {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status, qrcode_base64, connected_at, phone_number, pairing_code, pairing_expires_at, connection_method")
        .eq("barbeiro_id", resolvedBarbeiroId)
        .maybeSingle();

      if (data && data.status) {
        setStatus((data.status as ConnectionStatus) ?? "disconnected");
        setInstanceName(data.instance_name);
        setConnectedAt(data.connected_at);
        setPhoneNumber(data.phone_number ?? null);
        setQrCode(data.qrcode_base64 ?? null);
        if (data.connection_method === "qrcode" && data.status === "connecting") setMethod("qrcode");

        if (data.status === "connecting" && data.pairing_code && data.pairing_expires_at) {
          const exp = new Date(data.pairing_expires_at).getTime();
          if (exp > Date.now()) {
            setPairingCode(data.pairing_code);
            setExpiresAt(exp);
          }
        }
      } else {
        setStatus("disconnected");
        setInstanceName(null);
        setConnectedAt(null);
        setPhoneNumber(null);
        setQrCode(null);
        setPairingCode(null);
        setExpiresAt(null);
      }
    } finally {
      setLoading(false);
    }
  }, [resolvedBarbeiroId]);

  useEffect(() => { loadCurrentState(); }, [loadCurrentState]);

  useEffect(() => {
    if (!resolvedBarbeiroId && !selectedUnitId) return;
    try {
      const key = getStorageKey("dub_whatsapp_notif");
      const saved = localStorage.getItem(key);
      if (saved) setNotifSettings(parseSafeNotif(saved));
    } catch { /* ignore */ }
  }, [resolvedBarbeiroId, selectedUnitId, getStorageKey]);

  useEffect(() => {
    if (!resolvedBarbeiroId && !selectedUnitId) return;
    try {
      const key = getStorageKey("dub_whatsapp_agent_cfg");
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = parseSafeAgentConfig(saved);
        setAgentConfig(parsed);
        setSavedInstructions(parsed.instrucoesExtras || "");
      }
    } catch { /* ignore */ }
  }, [resolvedBarbeiroId, selectedUnitId, getStorageKey]);

  const syncWebhookConfigLembrete = async (lembreteLigado: boolean) => {
    try {
      const { data: existingWc } = await supabase
        .from("webhook_config")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingWc?.id) {
        await supabase.from("webhook_config").update({
          lembrete_ativo: lembreteLigado,
          updated_at: new Date().toISOString(),
        }).eq("id", existingWc.id);
      }
    } catch (e) {
      console.warn("[sync webhook_config lembrete]", e);
    }
  };

  const updateNotifSetting = (key: keyof NotificationSettings, value: any) => {
    let agentWasActive = false;

    // EXCLUSÃO MÚTUA: se ativou lembrete nas notificações padrão, desativa no agente
    if (key === "lembreteAtivo" && value === true) {
      if (agentConfig.lembreteAtivo) {
        agentWasActive = true;
        setAgentConfig((prev) => {
          const next = { ...prev, lembreteAtivo: false };
          try {
            const keyStr = getStorageKey("dub_whatsapp_agent_cfg");
            localStorage.setItem(keyStr, JSON.stringify(next));
          } catch { /* ignore */ }
          return next;
        });
        toast.info("Lembrete pelo Agente de IA desativado para evitar mensagens duplicadas.");
      }
      syncWebhookConfigLembrete(true);
    } else if (key === "lembreteAtivo" && value === false) {
      if (!agentConfig.lembreteAtivo) {
        syncWebhookConfigLembrete(false);
      }
    }

    setNotifSettings((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        const keyStr = getStorageKey("dub_whatsapp_notif");
        localStorage.setItem(keyStr, JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });

    if (!agentWasActive) {
      toast.success("Preferência de notificação salva");
    }
  };

  // Auto-salvamento imediato para opções de clique (pausa, lembrete e antecedência)
  const updateAgentOptionAutoSave = async (
    key: "pausaMinutos" | "lembreteAtivo" | "lembreteHorasAntes",
    value: any
  ) => {
    const nextConfig: AgentConfig = { ...agentConfig, [key]: value };
    setAgentConfig(nextConfig);

    try {
      const keyStr = getStorageKey("dub_whatsapp_agent_cfg");
      localStorage.setItem(keyStr, JSON.stringify(nextConfig));
    } catch { /* ignore */ }

    // Se ligou o lembrete da IA, desativa o lembrete comum
    if (key === "lembreteAtivo") {
      if (value === true) {
        if (notifSettings.lembreteAtivo) {
          setNotifSettings((prev) => {
            const nextNotif = { ...prev, lembreteAtivo: false };
            try {
              const keyStr = getStorageKey("dub_whatsapp_notif");
              localStorage.setItem(keyStr, JSON.stringify(nextNotif));
            } catch { /* ignore */ }
            return nextNotif;
          });
          toast.info("Lembrete padrão desativado para evitar mensagens duplicadas.");
        }
        await syncWebhookConfigLembrete(true);
      } else {
        if (!notifSettings.lembreteAtivo) {
          await syncWebhookConfigLembrete(false);
        }
      }
    }

    // Sincronização remota em background com Supabase
    if (resolvedBarbeiroId) {
      try {
        const { data: barbeiro } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", resolvedBarbeiroId)
          .maybeSingle();

        if (barbeiro?.tenant_id) {
          const promptData = JSON.stringify({
            nome: "Agente de IA",
            pausaMinutos: key === "pausaMinutos" ? value : nextConfig.pausaMinutos,
            lembreteAtivo: key === "lembreteAtivo" ? value : nextConfig.lembreteAtivo,
            lembreteHorasAntes: key === "lembreteHorasAntes" ? value : nextConfig.lembreteHorasAntes,
            instrucoesExtras: nextConfig.instrucoesExtras,
          });
          await (supabase as any).from("ai_agents").update({
            name: "Agente de IA",
            system_prompt: promptData,
            updated_at: new Date().toISOString(),
          }).eq("barbershop_id", barbeiro.tenant_id);
        }
      } catch (err) {
        console.warn("[auto-save agent option]", err);
      }
    }
  };

  // Salvar apenas instruções adicionais quando clicado no botão flutuante
  const handleSaveInstructions = async () => {
    setSavingInstructions(true);
    try {
      const keyAgent = getStorageKey("dub_whatsapp_agent_cfg");
      localStorage.setItem(keyAgent, JSON.stringify(agentConfig));

      if (resolvedBarbeiroId) {
        const { data: barbeiro } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", resolvedBarbeiroId)
          .maybeSingle();

        if (barbeiro?.tenant_id) {
          const promptData = JSON.stringify({
            nome: "Agente de IA",
            pausaMinutos: agentConfig.pausaMinutos,
            lembreteAtivo: agentConfig.lembreteAtivo,
            lembreteHorasAntes: agentConfig.lembreteHorasAntes,
            instrucoesExtras: agentConfig.instrucoesExtras,
          });
          await (supabase as any).from("ai_agents").update({
            name: "Agente de IA",
            system_prompt: promptData,
            updated_at: new Date().toISOString(),
          }).eq("barbershop_id", barbeiro.tenant_id);
        }
      }

      setSavedInstructions(agentConfig.instrucoesExtras);
    } catch (err) {
      console.error("[save instructions error]", err);
      setSavedInstructions(agentConfig.instrucoesExtras);
    } finally {
      setSavingInstructions(false);
    }
  };

  // Intercepta ativação do lembrete comum quando o da IA já está ligado
  const handleToggleNotifLembrete = (checked: boolean) => {
    if (checked && agentConfig.lembreteAtivo) {
      setConfirmSwitchToStandardModal(true);
      return;
    }
    updateNotifSetting("lembreteAtivo", checked);
  };

  const handleConfirmSwitchToStandard = () => {
    // Desativa no agente
    setAgentConfig((prev) => {
      const next = { ...prev, lembreteAtivo: false };
      try {
        const keyStr = getStorageKey("dub_whatsapp_agent_cfg");
        localStorage.setItem(keyStr, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });

    // Ativa nas notificações
    setNotifSettings((prev) => {
      const updated = { ...prev, lembreteAtivo: true };
      try {
        const keyStr = getStorageKey("dub_whatsapp_notif");
        localStorage.setItem(keyStr, JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });

    syncWebhookConfigLembrete(true);
    setConfirmSwitchToStandardModal(false);
  };

  const updateAgentConfig = (key: keyof AgentConfig, value: any) => {
    setAgentConfig((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        const keyStr = getStorageKey("dub_whatsapp_agent_cfg");
        localStorage.setItem(keyStr, JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  };

  const refreshAgent = useCallback(async () => {
    if (!resolvedBarbeiroId) return;
    try {
      const [{ data }, { data: cfg }] = await Promise.all([
        supabase.functions.invoke("whatsapp-proxy", {
          body: { action: "agent_status", barbeiro_id: resolvedBarbeiroId },
        }),
        (supabase as any)
          .from("agente_config")
          .select("ativo")
          .eq("barbeiro_id", resolvedBarbeiroId)
          .maybeSingle(),
      ]);
      setAgentActive(!!data?.active || !!cfg?.ativo);
    } catch (err) {
      console.error("[Agent status]", err);
    }
  }, [resolvedBarbeiroId]);

  useEffect(() => {
    if (resolvedBarbeiroId) refreshAgent();
  }, [resolvedBarbeiroId, refreshAgent]);

  const executeToggleAgent = async (next: boolean, applyToAll: boolean = false) => {
    if (!resolvedBarbeiroId || agentSaving) return;
    setAgentSaving(true);
    const prev = agentActive;
    setAgentActive(next);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: next ? "agent_enable" : "agent_disable", barbeiro_id: resolvedBarbeiroId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: barbeiro } = await supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("id", resolvedBarbeiroId)
        .maybeSingle();

      const tId = barbeiro?.tenant_id || resolvedTenantId;

      if (applyToAll && tId && next) {
        // Ativa em todas as filiais do tenant
        const { data: allBarbeiros } = await supabase
          .from("barbeiros")
          .select("id, unidade_id")
          .eq("tenant_id", tId);

        if (allBarbeiros && allBarbeiros.length > 0) {
          const upsertPayload = allBarbeiros.map((b) => ({
            barbeiro_id: b.id,
            tenant_id: tId,
            ativo: true,
            atualizado_em: new Date().toISOString(),
          }));
          await (supabase as any).from("agente_config").upsert(upsertPayload, { onConflict: "barbeiro_id" });

          // Identifica quais filiais do tenant possuem WhatsApp conectado
          const barberIds = allBarbeiros.map((b) => b.id);
          const [{ data: instances }, { data: links }] = await Promise.all([
            supabase
              .from("whatsapp_instances")
              .select("barbeiro_id, status")
              .in("barbeiro_id", barberIds),
            (supabase as any)
              .from("barbeiro_unidades")
              .select("barbeiro_id, unidade_id")
              .in("barbeiro_id", barberIds),
          ]);

          const connectedBarberIds = new Set(
            (instances || [])
              .filter((inst) => inst.status === "connected")
              .map((inst) => inst.barbeiro_id)
          );

          const connectedUnitIds = new Set(
            allBarbeiros
              .filter((b) => b.unidade_id && connectedBarberIds.has(b.id))
              .map((b) => b.unidade_id)
          );

          (links || []).forEach((l: any) => {
            if (l.unidade_id && connectedBarberIds.has(l.barbeiro_id)) {
              connectedUnitIds.add(l.unidade_id);
            }
          });

          // Se a filial atual estiver conectada, garante que não seja listada como faltante
          const missing = unidadesList.filter((u) => {
            if (u.id === selectedUnitId && status === "connected") return false;
            return !connectedUnitIds.has(u.id);
          });

          if (missing.length > 0) {
            setUnitsMissingWhatsapp(missing.map((u) => ({ id: u.id, nome: u.nome })));
          } else {
            setShowAgentActivatedModal(true);
          }
        } else {
          setShowAgentActivatedModal(true);
        }
      } else {
        await (supabase as any).from("agente_config").upsert(
          {
            barbeiro_id: resolvedBarbeiroId,
            tenant_id: tId ?? null,
            ativo: next,
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: "barbeiro_id" },
        );
        if (next) {
          setShowAgentActivatedModal(true);
        }
      }

      await refreshAgent();
    } catch (err: any) {
      setAgentActive(prev);
      const msg = typeof err?.message === "string" && err.message.length < 160
        ? err.message
        : "Não foi possível atualizar o agente. Tente novamente.";
      toast.error(msg);
    } finally {
      setAgentSaving(false);
    }
  };

  const handleToggleAgent = (next: boolean) => {
    if (!resolvedBarbeiroId || agentSaving) return;
    if (next && status !== "connected") {
      toast.error("Conecte o WhatsApp desta barbearia antes de ativar o atendimento com IA.");
      return;
    }
    if (next && unidadesList.length > 1) {
      setShowMultiUnitModal(true);
      return;
    }
    executeToggleAgent(next, false);
  };

  /* ─── contagem regressiva do código ─── */
  useEffect(() => {
    if (!expiresAt) { setCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) setExpiresAt(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  /* ─── sincronização contínua com a Evolution ─── */
  const checkConnectionStatus = useCallback(async () => {
    if (!instanceName) return;
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "status", instanceName, barbeiro_id: resolvedBarbeiroId },
      });
      if (error) return;

      if (data?.connected) {
        setStatus((prev) => {
          if (prev !== "connected") toast.success("WhatsApp conectado com sucesso!");
          return "connected";
        });
        setPairingCode(null);
        setExpiresAt(null);
        setQrCode(null);
        setErrorMessage(null);
        setConnectedAt((prev) => prev ?? new Date().toISOString());
        if (data.phone_number) setPhoneNumber(data.phone_number);
        if (selectedUnitIdRef.current) {
          updateUnitCache(selectedUnitIdRef.current, {
            status: "connected",
            phoneNumber: data.phone_number || phoneNumber,
            connectedAt: new Date().toISOString(),
          });
        }
        return;
      }

      // Desconectado na Evolution (por lá ou por queda) → refletir no app
      setStatus((prev) => {
        if (prev === "connected") {
          toast.warning("O WhatsApp foi desconectado. Toque em reconectar.");
          return "disconnected";
        }
        return prev;
      });
      if (data?.connected === false) {
        setConnectedAt(null);
        if (selectedUnitIdRef.current) {
          updateUnitCache(selectedUnitIdRef.current, {
            status: "disconnected",
            connectedAt: null,
          });
        }
      }
    } catch { /* silencioso — tentamos de novo no próximo ciclo */ }
  }, [instanceName, resolvedBarbeiroId]);

  useInterval(
    checkConnectionStatus,
    !instanceName ? null : status === "connecting" ? 3000 : status === "connected" ? 5000 : 8000,
  );

  // Verificação imediata ao abrir a tela
  useEffect(() => {
    if (instanceName) checkConnectionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName]);

  /* ─── tempo real: mudanças na linha da instância refletem na hora ─── */
  useEffect(() => {
    if (!resolvedBarbeiroId) return;

    const channel = supabase
      .channel(`whatsapp-instance-${resolvedBarbeiroId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_instances",
          filter: `barbeiro_id=eq.${resolvedBarbeiroId}`,
        },
        (payload) => {
          const row = (payload.new ?? {}) as {
            status?: string;
            instance_name?: string | null;
            phone_number?: string | null;
            connected_at?: string | null;
          };
          if (!row.status) return;

          if (row.instance_name) setInstanceName(row.instance_name);
          if (row.phone_number) setPhoneNumber(row.phone_number);

          if (row.status === "connected") {
            setStatus((prev) => {
              if (prev !== "connected") toast.success("WhatsApp conectado com sucesso!");
              return "connected";
            });
            setPairingCode(null);
            setExpiresAt(null);
            setQrCode(null);
            setErrorMessage(null);
            setConnectedAt(row.connected_at ?? new Date().toISOString());
            if (selectedUnitIdRef.current) {
              updateUnitCache(selectedUnitIdRef.current, {
                status: "connected",
                phoneNumber: row.phone_number || phoneNumber,
                instanceName: row.instance_name || instanceName,
                connectedAt: row.connected_at ?? new Date().toISOString(),
              });
            }
          } else if (row.status === "disconnected") {
            setStatus((prev) => {
              if (prev === "connected") toast.warning("O WhatsApp foi desconectado. Toque em reconectar.");
              return prev === "connecting" ? prev : "disconnected";
            });
            setConnectedAt(null);
            if (selectedUnitIdRef.current) {
              updateUnitCache(selectedUnitIdRef.current, {
                status: "disconnected",
                connectedAt: null,
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedBarbeiroId]);

  /* ─── revalidação imediata ao voltar para a tela / recuperar rede ─── */
  useEffect(() => {
    if (!instanceName) return;
    const revalidate = () => {
      if (document.visibilityState === "visible") checkConnectionStatus();
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [instanceName, checkConnectionStatus]);


  /* ─── gerar código de pareamento / reconectar ─── */
  const requestPairing = async (opts?: { reconnect?: boolean }) => {
    const isReconnect = !!opts?.reconnect;
    if (!isReconnect && !phoneValid) {
      setErrorMessage("Verifique o número informado e tente novamente.");
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    setMethod("pairing");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: {
          action: isReconnect ? "reconnect" : "pair",
          ...(isReconnect ? {} : { phone: phoneDigits }),
          barbeiro_id: resolvedBarbeiroId,
        },
      });

      if (error || !data?.success) {
        const code = (data as any)?.code;
        setErrorMessage(
          code === "INVALID_PHONE"
            ? "Verifique o número informado e tente novamente."
            : code === "EVOLUTION_UNAVAILABLE"
            ? "Não conseguimos conectar ao serviço neste momento. Tente novamente em alguns instantes."
            : "Não foi possível gerar o código de conexão. Tente novamente."
        );
        return;
      }

      setInstanceName(data.instance_name);
      setWantsNewNumber(false);

      if (data.already_connected) {
        setStatus("connected");
        setPairingCode(null);
        setExpiresAt(null);
        setConnectedAt(new Date().toISOString());
        if (data.phone_number) setPhoneNumber(data.phone_number);
        toast.success("WhatsApp já está conectado.");
        return;
      }

      setPairingCode(data.pairing_code);
      setPhoneNumber(data.phone_number);
      setExpiresAt(Date.now() + PAIRING_TTL_MS);
      setStatus("connecting");
      setQrCode(null);
    } catch {
      setErrorMessage("Não conseguimos conectar ao serviço neste momento. Tente novamente em alguns instantes.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeneratePairing = () => requestPairing();
  const handleReconnect = () => requestPairing({ reconnect: true });


  /* ─── alternativa: QR Code ─── */
  const handleUseQrCode = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    setMethod("qrcode");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "create", barbeiro_id: resolvedBarbeiroId },
      });

      if (error || !data?.success) {
        setErrorMessage("Não foi possível gerar o QR Code. Tente novamente.");
        return;
      }

      setInstanceName(data.instance_name);
      setQrCode(data.qrcode_base64 ?? null);
      setPairingCode(null);
      setExpiresAt(null);
      setStatus("connecting");
      if (!data.qrcode_base64) setErrorMessage("QR Code ainda não disponível. Toque em atualizar em alguns segundos.");
    } catch {
      setErrorMessage("Não conseguimos conectar ao serviço neste momento. Tente novamente em alguns instantes.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshQR = async () => {
    if (!instanceName) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "qrcode", instanceName, barbeiro_id: resolvedBarbeiroId },
      });
      if (error) {
        setErrorMessage("Não foi possível atualizar o QR Code. Tente novamente.");
        return;
      }
      if (data?.already_connected) {
        setStatus("connected");
        setQrCode(null);
        setConnectedAt(new Date().toISOString());
        return;
      }
      if (data?.qrcode_base64) setQrCode(data.qrcode_base64);
      else setErrorMessage("QR Code não disponível. Aguarde alguns segundos e tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── ações do estado conectado ─── */
  const handleTestConnection = async () => {
    if (!instanceName) return;
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "status", instanceName, barbeiro_id: resolvedBarbeiroId },
      });
      if (data?.connected) {
        if (data.phone_number) setPhoneNumber(data.phone_number);
        setStatus("connected");
        toast.success("Conexão ativa e funcionando.");
      } else {
        setStatus("disconnected");
        setConnectedAt(null);
        setWantsNewNumber(false);
        toast.warning("A conexão está inativa. Toque em reconectar.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!instanceName) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "disconnect", instanceName, barbeiro_id: resolvedBarbeiroId },
      });
      if (error) {
        toast.error("Não foi possível desconectar. Tente novamente.");
        return;
      }
      // A instância é preservada: o número fica guardado para reconexão rápida.
      setStatus("disconnected");
      setConnectedAt(null);
      setPairingCode(null);
      setExpiresAt(null);
      setQrCode(null);
      setMethod("pairing");
      setWantsNewNumber(false);
      setConfirmDisconnect(false);
      if (selectedUnitIdRef.current) {
        updateUnitCache(selectedUnitIdRef.current, {
          status: "disconnected",
          connectedAt: null,
          pairingCode: null,
          expiresAt: null,
          qrCode: null,
        });
      }
      toast.success("WhatsApp desconectado. Você pode reconectar quando quiser.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode.replace(/[^A-Za-z0-9]/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  const handleReset = () => {
    setPairingCode(null);
    setExpiresAt(null);
    setQrCode(null);
    setStatus("disconnected");
    setErrorMessage(null);
    setMethod("pairing");
  };

  const showReconnectCard = status === "disconnected" && !!phoneNumber && !wantsNewNumber;

  /* ─── status da luzinha indicadora do robô ─── */
  const robotLight = useMemo(() => {
    if (status !== "connected") {
      return {
        color: "bg-amber-500",
        ring: "ring-amber-500/30",
        glow: "shadow-[0_0_12px_rgba(245,158,11,0.6)]",
        label: "WhatsApp Desconectado",
        pulse: true,
      };
    }
    if (agentActive) {
      return {
        color: "bg-emerald-500",
        ring: "ring-emerald-500/30",
        glow: "shadow-[0_0_12px_rgba(16,185,129,0.6)]",
        label: "Atendimento Ativo",
        pulse: true,
      };
    }
    return {
      color: "bg-red-500",
      ring: "ring-red-500/30",
      glow: "shadow-[0_0_10px_rgba(239,68,68,0.5)]",
      label: "Atendimento Desativado",
      pulse: false,
    };
  }, [status, agentActive]);

  if (loading || !resolvedBarbeiroId) {
    return (
      <div className="pb-10">
        {!hideHeader && (
          <ScheduleHeader title="Atendimento & Notificações" onBack={onBackProp || (() => navigate(-1))} />
        )}
        <div className="flex items-center justify-center min-h-[50vh] px-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              <p className="text-xs text-muted-foreground">Carregando WhatsApp...</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">Nenhum perfil de barbeiro encontrado.</p>
          )}
        </div>
      </div>
    );
  }

  const codeExpired = !!pairingCode && countdown === 0;

  const renderConnectionFlow = () => {
    if (pairingCode && method === "pairing") {
      return (
        <div className="space-y-6 pt-1">
          <div className="space-y-3">
            <div className="w-12 h-12 flex items-center justify-center">
              <img src="/whatsapp-logo.png" alt="WhatsApp" className="w-12 h-12 object-contain" />
            </div>

            <div>
              <h2 className="text-[20px] font-bold text-foreground tracking-tight">
                Conectar Aparelho
              </h2>
              <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground mt-1">
                <Store className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{activeUnitName}</span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                Digite o código abaixo no WhatsApp do seu celular para concluir a conexão.
              </p>
            </div>
          </div>

          {/* Código em destaque minimalista */}
          <div className="py-5 px-4 rounded-2xl bg-muted/40 border border-border/50 flex flex-col items-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Código de Pareamento
            </span>
            <motion.div
              key={pairingCode}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "text-[32px] sm:text-[36px] font-mono font-bold tracking-[0.16em] tabular-nums select-all",
                codeExpired ? "text-muted-foreground/40 line-through" : "text-foreground"
              )}
            >
              {formatPairingCode(pairingCode)}
            </motion.div>

            <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px]">
              {codeExpired ? (
                <span className="text-destructive font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Código expirado
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1 tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  Expira em {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              )}
            </div>
          </div>

          {codeExpired ? (
            <button
              onClick={handleGeneratePairing}
              disabled={actionLoading}
              className="w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold active:scale-[0.98] transition-all disabled:opacity-50 shadow-xs hover:opacity-90 flex items-center justify-center"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar novo código"}
            </button>
          ) : (
            <button
              onClick={handleCopy}
              className={cn(
                "w-full h-12 rounded-xl text-[13.5px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all border shadow-xs",
                copied
                  ? "bg-foreground text-background border-transparent"
                  : "bg-card text-foreground border-border/70 hover:bg-muted/40"
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Código copiado!
                  </motion.span>
                ) : (
                  <motion.span key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                    <Copy className="w-4 h-4" /> Copiar código
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}

          {/* Passo a Passo */}
          <div className="space-y-3 pt-2">
            <p className="text-[13px] font-semibold text-foreground">Passo a passo no seu celular</p>
            <div className="space-y-2.5">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-secondary text-[11px] font-bold text-foreground flex items-center justify-center shrink-0 mt-0.5 border border-border/50">
                    {i + 1}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground leading-tight pt-0.5">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {!codeExpired && (
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-foreground shrink-0" />
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Aguardando confirmação…</p>
                <p className="text-[11px] text-muted-foreground">Assim que você digitar o código no celular, a conexão é concluída.</p>
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="text-[12px] text-destructive text-center">{errorMessage}</p>
          )}

          <div className="flex flex-col items-center gap-2 pt-2">
            <button onClick={handleUseQrCode} className="text-[12.5px] text-muted-foreground hover:text-foreground underline underline-offset-4">
              Usar conexão por QR Code
            </button>
            <button onClick={handleReset} className="text-[12.5px] text-muted-foreground/70 hover:text-foreground">
              Trocar de número
            </button>
          </div>
        </div>
      );
    }

    if (method === "qrcode" && status === "connecting") {
      return (
        <div className="space-y-6 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <img src="/whatsapp-logo.png" alt="WhatsApp" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <h2 className="text-[18px] font-bold text-foreground tracking-tight">
                  Escanear QR Code
                </h2>
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Store className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span>{activeUnitName}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleRefreshQR}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border/60 text-[11.5px] font-medium text-foreground hover:bg-secondary active:scale-95 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          {qrCode ? (
            <div className="flex justify-center my-2">
              <div className="bg-white p-4 rounded-2xl border border-border/40 shadow-xs">
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  className="w-56 h-56 object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">Gerando QR Code...</span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40 flex items-start gap-2.5 text-left">
            <Smartphone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho → aponte a câmera para o QR Code acima.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-foreground shrink-0" />
            <div>
              <p className="text-[12.5px] font-medium text-foreground">Aguardando leitura…</p>
              <p className="text-[11px] text-muted-foreground">Aguardando a confirmação do WhatsApp.</p>
            </div>
          </div>

          {errorMessage && <p className="text-[12px] text-destructive text-center">{errorMessage}</p>}

          <div className="text-center pt-1">
            <button onClick={handleReset} className="text-[12.5px] text-muted-foreground hover:text-foreground underline underline-offset-4">
              Voltar para código numérico
            </button>
          </div>
        </div>
      );
    }

    if (showReconnectCard) {
      return (
        <div className="space-y-6 pt-1">
          <div className="space-y-3">
            <div className="w-12 h-12 flex items-center justify-center">
              <img src="/whatsapp-logo.png" alt="WhatsApp" className="w-12 h-12 object-contain" />
            </div>

            <div>
              <h2 className="text-[20px] font-bold text-foreground tracking-tight">
                WhatsApp Desconectado
              </h2>
              <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground mt-1">
                <Store className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{activeUnitName}</span>
              </div>
            </div>

            <p className="text-[18px] font-semibold text-foreground tabular-nums font-mono pt-1">
              {formatPhoneDisplay(phoneNumber)}
            </p>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              O número foi mantido para a <strong>{activeUnitName}</strong>. Clique abaixo para restabelecer a conexão.
            </p>
          </div>

          {errorMessage && <p className="text-[12px] text-destructive">{errorMessage}</p>}

          <button
            onClick={handleReconnect}
            disabled={actionLoading}
            className="w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-40 shadow-xs hover:opacity-90"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reconectar WhatsApp"}
          </button>

          <div className="text-center pt-2">
            <button
              onClick={() => { setWantsNewNumber(true); setPhoneInput(""); setErrorMessage(null); }}
              className="text-[12.5px] text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Conectar outro número
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 pt-1">
        <div className="space-y-4">
          {/* Logo oficial do WhatsApp limpo, sem caixas/fundos artificiais */}
          <div className="w-12 h-12 flex items-center justify-center">
            <img src="/whatsapp-logo.png" alt="WhatsApp" className="w-12 h-12 object-contain" />
          </div>

          <div>
            <h2 className="text-[20px] font-bold text-foreground tracking-tight">
              Conectar WhatsApp
            </h2>
            <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground mt-1">
              <Store className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{activeUnitName}</span>
            </div>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              Informe o número de telefone da barbearia para gerar o código de pareamento.
            </p>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-[12.5px] font-medium text-foreground">
              Número do WhatsApp
            </label>
            <div className={cn(
              "flex items-center h-12 rounded-xl border bg-card px-3.5 transition-all shadow-xs",
              errorMessage ? "border-destructive ring-1 ring-destructive/20" : "border-border/70 dark:border-white/[0.1] focus-within:border-foreground"
            )}>
              <span className="text-[14px] font-semibold text-muted-foreground mr-2.5 tabular-nums select-none border-r border-border/50 pr-2.5">
                +55
              </span>
              <input
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(maskPhoneInput(e.target.value));
                  setErrorMessage(null);
                }}
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                className="flex-1 bg-transparent outline-none text-[15px] font-medium text-foreground placeholder:text-muted-foreground/40 tabular-nums"
                autoFocus
              />
              {phoneValid && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
              )}
            </div>
            {errorMessage && (
              <p className="text-[12px] text-destructive flex items-center gap-1 mt-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          <button
            onClick={handleGeneratePairing}
            disabled={actionLoading || !phoneValid}
            className="w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-40 shadow-xs hover:opacity-90"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar código"}
          </button>

          <p className="text-[11.5px] text-muted-foreground/75 leading-relaxed pt-1">
            Instância dedicada e exclusiva desta barbearia. As mensagens não se misturam com outras unidades.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleUseQrCode}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Prefere conectar via QR Code?</span>
          </button>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ VISÃO DEDICADA: CONFIGURAR AGENTE (TELA INTEIRA COM SETA VOLTAR) ═══ */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (currentView === "agent-config") {
    return (
      <div className="pb-20">
        {!hideHeader && (
          <ScheduleHeader
            title="Configurações do Agente"
            onBack={() => setCurrentView("main")}
          />
        )}

        <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="px-1">
              <h2 className="text-[17px] font-bold text-foreground tracking-tight">
                Regras de Atendimento
              </h2>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                Opções são salvas automaticamente ao selecionar.
              </p>
            </div>

            {/* Lembrete de Corte com Confirmação (Minimalista e Sério) */}
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 pr-2">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    Lembrete com confirmação
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                    Avisa o cliente antes do corte perguntando se ele vai comparecer (Sim/Não). Se responder <strong>Não</strong>, cancela e libera o horário no sistema automaticamente.
                  </p>
                </div>
                <Switch
                  checked={agentConfig.lembreteAtivo}
                  onCheckedChange={(val) => updateAgentOptionAutoSave("lembreteAtivo", val)}
                  className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0 mt-0.5"
                />
              </div>

              {agentConfig.lembreteAtivo && (
                <div className="pt-2.5 border-t border-border/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted-foreground font-medium">
                      Tempo de antecedência:
                    </span>
                    <span className="text-[11.5px] font-semibold text-foreground">
                      {agentConfig.lembreteHorasAntes === 24 ? "24h antes" : `${agentConfig.lembreteHorasAntes}h antes`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[
                      { hours: 1, label: "1h" },
                      { hours: 2, label: "2h (ideal)" },
                      { hours: 3, label: "3h" },
                      { hours: 24, label: "24h" },
                    ].map((h) => (
                      <button
                        key={h.hours}
                        type="button"
                        onClick={() => updateAgentOptionAutoSave("lembreteHorasAntes", h.hours)}
                        className={cn(
                          "flex-1 py-1.5 text-[11.5px] font-medium rounded-xl transition-all border",
                          agentConfig.lembreteHorasAntes === h.hours
                            ? "bg-black text-white dark:bg-white dark:text-black border-transparent font-semibold shadow-sm"
                            : "bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground"
                        )}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    Substitui o lembrete comum das notificações para não duplicar envios.
                  </p>
                </div>
              )}
            </div>

            {/* Pausa após intervenção humana (Auto-save ao tocar) */}
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-semibold text-foreground">
                  Pausa ao responder manualmente
                </label>
                <span className="text-[11.5px] font-semibold text-foreground">
                  {agentConfig.pausaMinutos} min
                </span>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Ao responder o cliente diretamente no WhatsApp, a IA pausa para não interferir na sua conversa.
              </p>
              <div className="flex items-center gap-2 pt-1">
                {[
                  { min: 15, label: "15 min" },
                  { min: 30, label: "30 min" },
                  { min: 60, label: "1 hora" },
                ].map((p) => (
                  <button
                    key={p.min}
                    type="button"
                    onClick={() => updateAgentOptionAutoSave("pausaMinutos", p.min)}
                    className={cn(
                      "flex-1 py-2 text-[12px] font-medium rounded-xl transition-all border",
                      agentConfig.pausaMinutos === p.min
                        ? "bg-black text-white dark:bg-white dark:text-black border-transparent font-semibold shadow-sm"
                        : "bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Instruções Adicionais da Barbearia */}
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[13px] font-semibold text-foreground">
                  Instruções Adicionais da Barbearia
                </label>
                {instructionsDirty && (
                  <span className="text-[10.5px] font-medium text-amber-500 dark:text-amber-400">
                    Não salvo
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Informações extras para a IA responder aos clientes (cortesias, regras de atraso, estacionamento, pagamento).
              </p>
              <textarea
                rows={4}
                value={agentConfig.instrucoesExtras}
                onChange={(e) => updateAgentConfig("instrucoesExtras", e.target.value)}
                placeholder="Ex: Temos café cortesia, estacionamento próprio, tolerância de atraso de 10 minutos..."
                className="w-full p-3.5 mt-1 rounded-xl border border-border/60 bg-background text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:border-foreground/50 outline-none transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Como Funciona o Atendimento (Discreto, sério e institucional) */}
            <div className="rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card p-4 space-y-2.5">
              <p className="text-[12.5px] font-semibold text-foreground tracking-tight">
                Como funciona o atendimento
              </p>
              <div className="space-y-2 text-[11.5px] text-muted-foreground leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 mt-1.5 shrink-0" />
                  <p><strong className="text-foreground font-medium">Agendamento direto:</strong> Consulta horários livres e grava na agenda em tempo real sem sobreposições.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 mt-1.5 shrink-0" />
                  <p><strong className="text-foreground font-medium">Informações da barbearia:</strong> Tira dúvidas de preços, catálogo de serviços e localização.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 mt-1.5 shrink-0" />
                  <p><strong className="text-foreground font-medium">Pausa humana:</strong> Ao responder manualmente pelo WhatsApp, a resposta automática pausa temporariamente para você conversar.</p>
                </div>
              </div>
            </div>

            {/* Balão / Botão Flutuante de Salvar: aparece somente quando houver alteração nas instruções */}
            <AnimatePresence>
              {instructionsDirty && (
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed bottom-6 inset-x-4 max-w-sm mx-auto z-50 pointer-events-auto"
                >
                  <button
                    type="button"
                    onClick={handleSaveInstructions}
                    disabled={savingInstructions}
                    className="w-full h-12 px-5 rounded-2xl bg-black text-white dark:bg-white dark:text-black text-[13.5px] font-semibold flex items-center justify-between shadow-2xl ring-1 ring-black/10 dark:ring-white/10 active:scale-[0.98] transition-transform"
                  >
                    <span className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                      <span>Salvar instruções</span>
                    </span>
                    {savingInstructions ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="text-[12px] opacity-75 font-normal">Toque para salvar</span>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ VISÃO DEDICADA: CONEXÃO DO WHATSAPP (TELA INTEIRA COM VOLTAR) ═══ */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (currentView === "whatsapp-connection") {
    return (
      <div className="pb-10">
        {!hideHeader && (
          <ScheduleHeader
            title="WhatsApp"
            onBack={() => setCurrentView("main")}
          />
        )}

        <div className="px-4 pt-4 max-w-md mx-auto space-y-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {status === "connected" ? (
              <>
                {/* Header do WhatsApp Conectado — Flat, sem caixa envolvente, 100% sério */}
                <div className="space-y-3 pt-1">
                  <div className="w-12 h-12 flex items-center justify-center">
                    <img src="/whatsapp-logo.png" alt="WhatsApp" className="w-12 h-12 object-contain" />
                  </div>

                  <div>
                    <h2 className="text-[20px] font-bold text-foreground tracking-tight">
                      WhatsApp Conectado
                    </h2>
                    <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground mt-1">
                      <Store className="w-3.5 h-3.5 text-muted-foreground/70" />
                      <span>{activeUnitName}</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    {phoneNumber && (
                      <p className="text-[22px] font-bold text-foreground tracking-tight tabular-nums font-mono">
                        {formatPhoneDisplay(phoneNumber)}
                      </p>
                    )}
                    {connectedAt && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Conectado desde {formatConnectedDate(connectedAt)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Lista de Ações — Padrão Atendimento & Notificações (espaçoso, divide-y, sem emprensar) */}
                <div className="divide-y divide-border/25 pt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all disabled:opacity-50 group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13.5px] font-medium text-foreground leading-snug">
                        Testar conexão
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                        Envia um teste para validar o funcionamento do envio.
                      </p>
                    </div>
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all disabled:opacity-50 group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13.5px] font-medium text-foreground leading-snug">
                        Reconectar sessão
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                        Sincroniza novamente a conexão sem perder o número configurado.
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13.5px] font-medium text-destructive leading-snug">
                        Desconectar WhatsApp
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                        Desativa o envio de mensagens e o agente de IA desta barbearia.
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-destructive/50 group-hover:text-destructive transition-colors shrink-0" />
                  </button>
                </div>

                <AnimatePresence>
                  {confirmDisconnect && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                      className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
                    >
                      <p className="text-[13px] text-foreground leading-relaxed">
                        Ao desconectar, o agente de IA e as notificações automáticas deixam de funcionar até que seja reconectado. Deseja continuar?
                      </p>
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => setConfirmDisconnect(false)}
                          className="flex-1 h-11 rounded-xl border border-border/50 text-[13px] font-medium text-foreground active:scale-[0.98] transition-transform"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleDisconnect}
                          disabled={actionLoading}
                          className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground text-[13px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Desconectar"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              renderConnectionFlow()
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ VISÃO DEDICADA: SELECIONAR BARBEARIA (100% LIMPO & DIRETO) ══════ */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (currentView === "trocar-barbearia") {
    return (
      <div className="pb-10">
        <ScheduleHeader title="Configurar Barbearia" onBack={() => setCurrentView("main")} />

        <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
          <div className="space-y-3">
            {unidadesList.map((u) => {
              const isCurrent = (selectedUnitId || unidadesList[0]?.id) === u.id;
              const cachedUnit = unitStateCacheRef.current[u.id];
              const unitStatus = isCurrent ? status : (unitStatuses[u.id] || cachedUnit?.status || "disconnected");
              const isConnected = unitStatus === "connected";
              const unitPhone = isCurrent
                ? (phoneNumber || u.whatsapp)
                : (cachedUnit?.phoneNumber || u.whatsapp);

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    handleSwitchUnit(u.id);
                    setCurrentView("main");
                  }}
                  className={cn(
                    "w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 active:scale-[0.99] group",
                    isCurrent
                      ? "bg-secondary/40 border-foreground/30 shadow-xs ring-1 ring-foreground/20"
                      : "bg-card border-border/70 dark:border-white/[0.08] hover:border-foreground/30 hover:bg-secondary/20"
                  )}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm",
                      isCurrent
                        ? "bg-foreground text-background"
                        : "bg-secondary text-foreground group-hover:bg-secondary/80"
                    )}>
                      <Store className="w-5 h-5 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14.5px] font-bold text-foreground truncate block leading-tight">
                          {u.nome}
                        </span>
                        {u.is_sede && (
                          <span className="text-[9.5px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                            Sede
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 mt-1">
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          isConnected ? "bg-emerald-500" : "bg-muted-foreground/40"
                        )} />
                        <span className="truncate">
                          {isConnected && unitPhone
                            ? formatPhoneDisplay(unitPhone)
                            : unitPhone
                            ? formatPhoneDisplay(unitPhone)
                            : "WhatsApp não conectado"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isCurrent ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        Configurando
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-0.5">
                        Configurar
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ VISÃO PRINCIPAL (2 ABAS: ATENDIMENTO & NOTIFICAÇÕES) ══════════════ */
  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="pb-10">
      {!hideHeader && (
        <ScheduleHeader title="Atendimento & Notificações" onBack={onBackProp || (() => navigate(-1))} />
      )}

      <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
        {/* Se o tenant tiver mais de 1 filial cadastrada, exibe o seletor minimalista da filial ativa */}
        {unidadesList.length > 1 && (
          <div className="flex items-center justify-between px-1 py-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-semibold text-foreground truncate">
                {activeUnitName}
              </span>
              {activeUnit?.is_sede && (
                <span className="text-[9.5px] font-medium uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                  Sede
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowSelectUnitDrawer(true)}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/40"
            >
              <Store className="w-3.5 h-3.5 opacity-70" />
              <span>Configurar outra filial</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </div>
        )}

        {/* Card do WhatsApp Conectado / Desconectado */}
        <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn(
              "w-2 h-2 rounded-full shrink-0",
              status === "connected"
                ? "bg-emerald-500"
                : status === "connecting"
                ? "bg-amber-500 animate-pulse"
                : "bg-muted-foreground/40"
            )} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {status === "connected"
                  ? "WhatsApp Conectado"
                  : status === "connecting"
                  ? "Conectando WhatsApp..."
                  : "WhatsApp Desconectado"}
              </p>
              <p className="text-[11.5px] text-muted-foreground truncate">
                {status === "connected" && phoneNumber
                  ? formatPhoneDisplay(phoneNumber)
                  : status === "connecting"
                  ? "Aguardando confirmação"
                  : "Conecte para ativar avisos e atendimento"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCurrentView("whatsapp-connection")}
            className={cn(
              "shrink-0 flex items-center gap-1 active:scale-95 transition-all",
              status === "connected"
                ? "px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12px] font-medium border border-border/40"
                : "px-3.5 py-1.5 rounded-xl bg-foreground text-background text-[12px] font-semibold shadow-xs"
            )}
          >
            <span>{status === "connected" ? "Gerenciar" : "Conectar"}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Lista Unificada Única (Sem abas, padrão 100% minimalista e sério) */}
        <div className="divide-y divide-border/25 pt-1">
          {/* Opção: Agente de IA */}
          {!hideAgent && (
            <div
              ref={aiAgentOptionRef}
              className="py-4 relative"
            >
              {/* Destaque infinito de tela a tela: faixa de ponta a ponta sem bordas, 100% na mesma cor (estilo marcador), piscando exatamente 3 vezes */}
              {isHighlightedAgente && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [0, 1, 0, 1, 0, 1, 0],
                  }}
                  transition={{
                    delay: 0.3,
                    duration: 2.1,
                    times: [0, 0.16, 0.33, 0.5, 0.66, 0.83, 1],
                    ease: "easeInOut",
                  }}
                  onAnimationComplete={() => setIsHighlightedAgente(false)}
                  className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-screen bg-emerald-500/[0.12] dark:bg-emerald-500/[0.16] pointer-events-none"
                />
              )}

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div className="min-w-0 pr-2">
                  <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                    Agente de IA
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    Responde dúvidas sobre valores, serviços, endereço e realiza agendamentos no sistema.
                  </p>
                </div>
                <Switch
                  checked={agentActive && status === "connected"}
                  onCheckedChange={handleToggleAgent}
                  disabled={status !== "connected"}
                  className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
                />
              </div>

              {/* Quando ativo: surge imediatamente abaixo o acesso às Configurações do Atendimento */}
              <AnimatePresence>
                {agentActive && status === "connected" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden pt-2.5 relative z-10"
                  >
                    <button
                      type="button"
                      onClick={() => setCurrentView("agent-config")}
                      className="w-full py-2.5 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 flex items-center justify-between text-left transition-colors group border border-border/30"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-[12.5px] font-medium text-foreground">
                          Configurações do atendimento
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          Tempo de pausa, tolerância de atraso e instruções da barbearia
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Opção 1: Avisar quando agendar */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="min-w-0 pr-2">
              <p className="text-[13.5px] font-medium text-foreground leading-snug">
                Avisar o cliente quando agendar
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                Envia confirmação imediata com data, horário, barbeiro e serviço assim que o agendamento for realizado.
              </p>
            </div>
            <Switch
              checked={notifSettings.notificarAgendamento}
              onCheckedChange={(val) => updateNotifSetting("notificarAgendamento", val)}
              className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
            />
          </div>

          {/* Opção 2: Avisar quando cancelar */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="min-w-0 pr-2">
              <p className="text-[13.5px] font-medium text-foreground leading-snug">
                Avisar o cliente quando cancelar
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                Notifica o cliente caso um agendamento seja desmarcado ou cancelado.
              </p>
            </div>
            <Switch
              checked={notifSettings.notificarCancelamento}
              onCheckedChange={(val) => updateNotifSetting("notificarCancelamento", val)}
              className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
            />
          </div>

          {/* Opção 3: Lembrete antes do corte */}
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-medium text-foreground leading-snug">
                    Lembrete antes do corte
                  </p>
                  {agentConfig.lembreteAtivo && (
                    <span className="text-[11px] text-muted-foreground font-normal">
                      · Com confirmação
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                  {agentConfig.lembreteAtivo
                    ? "Ativo no atendimento com confirmação automática (Sim/Não)."
                    : "Lembra o cliente no WhatsApp horas antes do corte para evitar faltas."}
                </p>
              </div>
              <Switch
                checked={notifSettings.lembreteAtivo}
                onCheckedChange={handleToggleNotifLembrete}
                className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
              />
            </div>

            {notifSettings.lembreteAtivo && (
              <div className="pt-2 flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-muted-foreground font-medium">
                  Tempo de antecedência:
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { hours: 1, label: "1h" },
                    { hours: 2, label: "2h" },
                    { hours: 3, label: "3h" },
                    { hours: 24, label: "24h" },
                  ].map((item) => (
                    <button
                      key={item.hours}
                      type="button"
                      onClick={() => updateNotifSetting("lembreteHorasAntes", item.hours)}
                      className={cn(
                        "px-3 py-1.5 text-[12px] font-medium rounded-xl transition-all",
                        notifSettings.lembreteHorasAntes === item.hours
                          ? "bg-black text-white dark:bg-white dark:text-black font-semibold shadow-sm"
                          : "bg-muted/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drawer de Escolha de Filial para Ativação da IA (Gaveta de baixo para cima) */}
        <AnimatePresence>
          {showMultiUnitModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setShowMultiUnitModal(false)} />
              <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-6 pb-8 sm:pb-6 shadow-2xl space-y-4"
              >
                {/* Handle pill no topo para visual de gaveta nativa */}
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden" />

                <div>
                  <h4 className="text-[17px] font-semibold text-foreground tracking-tight">
                    Onde deseja ativar a IA?
                  </h4>
                  <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                    Escolha o alcance do atendimento automático com inteligência artificial:
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMultiUnitModal(false);
                      executeToggleAgent(true, false);
                    }}
                    className="w-full p-4 rounded-2xl border border-border/70 hover:border-foreground/30 hover:bg-muted/30 bg-background text-left transition-all active:scale-[0.98] flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold text-foreground group-hover:text-foreground">
                        Apenas nesta barbearia
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                        {activeUnit?.nome || "Unidade atual selecionada"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMultiUnitModal(false);
                      executeToggleAgent(true, true);
                    }}
                    className="w-full p-4 rounded-2xl border border-foreground/20 bg-foreground text-background text-left transition-all active:scale-[0.98] shadow-md flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold">
                        Ativar em todas as barbearias
                      </p>
                      <p className="text-[12px] opacity-85 mt-0.5">
                        Aplica a ativação para todas as {unidadesList.length} filiais
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMultiUnitModal(false)}
                    className="w-full h-11 rounded-xl border border-border/60 text-[13px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Drawer para filiais sem WhatsApp conectado ao ativar em lote (Gaveta de baixo para cima) */}
        <AnimatePresence>
          {unitsMissingWhatsapp.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setUnitsMissingWhatsapp([])} />
              <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-6 pb-8 sm:pb-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
              >
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

                <div className="shrink-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mb-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp pendente</span>
                  </div>
                  <h4 className="text-[17px] font-semibold text-foreground tracking-tight">
                    Conecte o WhatsApp nas outras barbearias
                  </h4>
                  <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                    A IA foi habilitada, mas as barbearias abaixo precisam ter o WhatsApp conectado para começar a responder:
                  </p>
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[40vh] pr-1 py-1">
                  {unitsMissingWhatsapp.map((unit) => (
                    <div
                      key={unit.id}
                      className="p-3.5 rounded-2xl border border-border/70 bg-background/80 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-foreground truncate">
                          {unit.nome}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span>WhatsApp desconectado</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setUnitsMissingWhatsapp([]);
                          await handleSwitchUnit(unit.id);
                          setCurrentView("whatsapp-connection");
                        }}
                        className="shrink-0 px-3.5 py-1.5 rounded-xl bg-foreground text-background text-[12px] font-semibold hover:opacity-90 active:scale-[0.96] transition-all flex items-center gap-1.5"
                      >
                        Conectar
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setUnitsMissingWhatsapp([])}
                    className="w-full h-11 rounded-xl border border-border/60 text-[13px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all"
                  >
                    Conectar mais tarde
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal/Drawer Estratégico de Conscientização ao Ativar Atendimento com IA */}
        <AnimatePresence>
          {showAgentActivatedModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setShowAgentActivatedModal(false)} />
              <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="relative w-full sm:max-w-sm rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-6 pb-8 sm:pb-6 shadow-2xl space-y-4"
              >
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-2.5">
                    <Sparkles className="w-3 h-3" />
                    Ativo
                  </div>
                  <h4 className="text-[17px] font-semibold text-foreground tracking-tight">
                    Atendimento com IA ativado
                  </h4>
                  <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                    A partir de agora, a IA responderá dúvidas de serviços, valores e realizará agendamentos automaticamente para os clientes no WhatsApp desta filial.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAgentActivatedModal(false)}
                    className="w-full h-11 rounded-xl bg-foreground text-background text-[13px] font-semibold active:scale-[0.98] transition-transform"
                  >
                    Entendi
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal Estratégico de Notificação ao trocar lembrete da IA pelo lembrete padrão (Centralizado no meio da tela) */}
        <AnimatePresence>
          {confirmSwitchToStandardModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setConfirmSwitchToStandardModal(false)} />
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                className="relative w-full max-w-[340px] rounded-[24px] border border-border/70 dark:border-white/[0.1] bg-card p-5 text-center shadow-2xl space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
                  <CalendarClock className="w-6 h-6 stroke-[1.8]" />
                </div>
                <div>
                  <h4 className="text-[16px] font-bold text-foreground">
                    Substituir lembrete da IA?
                  </h4>
                  <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
                    O lembrete com confirmação interativa já está ativo pelo Agente de IA. Deseja desativá-lo para usar o lembrete comum?
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmSwitchToStandardModal(false)}
                    className="flex-1 h-10 rounded-xl border border-border/70 text-[13px] font-medium text-foreground hover:bg-secondary active:scale-[0.98] transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSwitchToStandard}
                    className="flex-1 h-10 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Substituir
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Drawer Estratégico (Gaveta de Baixo para Cima) para Selecionar Barbearia para Configurar */}
        <AnimatePresence>
          {showSelectUnitDrawer && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setShowSelectUnitDrawer(false)} />
              <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
              >
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[16px] font-bold text-foreground tracking-tight">
                      Configurar Barbearia
                    </h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Selecione a filial para gerenciar atendimento e WhatsApp
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSelectUnitDrawer(false)}
                    className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 text-xs font-semibold"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2.5 pt-1">
                  {unidadesList.map((u) => {
                    const isCurrent = (selectedUnitId || unidadesList[0]?.id) === u.id;
                    const cachedUnit = unitStateCacheRef.current[u.id];
                    const unitStatus = isCurrent ? status : (unitStatuses[u.id] || cachedUnit?.status || "disconnected");
                    const isConnected = unitStatus === "connected";
                    const unitPhone = isCurrent
                      ? (phoneNumber || u.whatsapp)
                      : (cachedUnit?.phoneNumber || u.whatsapp);

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          handleSwitchUnit(u.id);
                          setShowSelectUnitDrawer(false);
                        }}
                        className={cn(
                          "w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 active:scale-[0.99] group",
                          isCurrent
                            ? "bg-secondary/40 border-foreground/30 shadow-xs ring-1 ring-foreground/20"
                            : "bg-card border-border/70 dark:border-white/[0.08] hover:border-foreground/30 hover:bg-secondary/20"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-colors",
                            isCurrent
                              ? "bg-foreground text-background"
                              : "bg-secondary text-foreground group-hover:bg-secondary/80"
                          )}>
                            <Store className="w-5 h-5 stroke-[1.8]" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-foreground truncate block leading-tight">
                                {u.nome}
                              </span>
                              {u.is_sede && (
                                <span className="text-[9.5px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                                  Sede
                                </span>
                              )}
                            </div>
                            <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-1">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                isConnected ? "bg-emerald-500" : "bg-muted-foreground/40"
                              )} />
                              <span className="truncate">
                                {isConnected && unitPhone
                                  ? formatPhoneDisplay(unitPhone)
                                  : unitPhone
                                  ? formatPhoneDisplay(unitPhone)
                                  : "WhatsApp não conectado"}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 pl-2">
                          {isCurrent ? (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                              Configurando
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-0.5">
                              Selecionar
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
