import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, QrCode, RefreshCw, CheckCircle2, Copy, Check,
  ArrowRight, ShieldCheck, Smartphone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInterval } from "@/hooks/useInterval";
import { resolvePrimaryBarberForUser } from "@/lib/tenantOwnership";

interface WhatsAppConnectionPageProps {
  barbeiroId?: string | null;
  userId?: string;
  basePath?: string;
  tenantNome?: string;
  barberName?: string;
  hideHeader?: boolean;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
type Method = "pairing" | "qrcode";

const PAIRING_TTL_MS = 180_000;

/** (99) 99999-9999 → exibição amigável de um número em dígitos (com ou sem DDI). */
function formatPhoneDisplay(raw: string | null): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
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

/** Máscara progressiva enquanto digita: (11) 99999-9999 */
function maskPhoneInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Agrupa o código em blocos de 4: ABCD-1234 */
function formatPairingCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
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
}: WhatsAppConnectionPageProps) {
  const navigate = useNavigate();
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(barbeiroIdProp || null);
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


  const phoneDigits = useMemo(() => phoneInput.replace(/\D/g, ""), [phoneInput]);
  const phoneValid = phoneDigits.length === 10 || phoneDigits.length === 11;

  /* ─── resolver barbeiro ─── */
  useEffect(() => {
    if (barbeiroIdProp) {
      setResolvedBarbeiroId(barbeiroIdProp);
      return;
    }
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await resolvePrimaryBarberForUser<{ id: string }>(userId);
        if (data?.id) setResolvedBarbeiroId(data.id);
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [barbeiroIdProp, userId]);

  /* ─── estado persistido ─── */
  const loadCurrentState = useCallback(async () => {
    if (!resolvedBarbeiroId) return;
    try {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status, qrcode_base64, connected_at, phone_number, pairing_code, pairing_expires_at, connection_method")
        .eq("barbeiro_id", resolvedBarbeiroId)
        .maybeSingle();

      if (data) {
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
      }
    } finally {
      setLoading(false);
    }
  }, [resolvedBarbeiroId]);

  useEffect(() => { loadCurrentState(); }, [loadCurrentState]);

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
      if (data?.connected === false) setConnectedAt(null);
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
          } else if (row.status === "disconnected") {
            setStatus((prev) => {
              if (prev === "connected") toast.warning("O WhatsApp foi desconectado. Toque em reconectar.");
              return prev === "connecting" ? prev : "disconnected";
            });
            setConnectedAt(null);
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



  if (loading || !resolvedBarbeiroId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        {loading ? (
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum perfil de barbeiro encontrado.</p>
        )}
      </div>
    );
  }

  const codeExpired = !!pairingCode && countdown === 0;

  return (
    <div className="pb-10 -mx-3 -mt-3">
      {!hideHeader && (
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[20px] font-medium tracking-tight text-foreground flex-1">WhatsApp</h1>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 max-w-md mx-auto space-y-5">
        {/* ═══ CONECTADO ═══ */}
        {status === "connected" ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-2xl border border-border/40 bg-card p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h2 className="mt-4 text-[17px] font-semibold text-foreground">WhatsApp conectado</h2>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">Conectado</span>
              </div>
              {phoneNumber && (
                <p className="mt-3 text-[15px] font-medium text-foreground tabular-nums">{formatPhoneDisplay(phoneNumber)}</p>
              )}
              {connectedAt && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Desde {new Date(connectedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
              <button
                onClick={handleTestConnection}
                disabled={actionLoading}
                className="w-full flex items-center justify-between px-5 h-14 text-[14px] text-foreground active:bg-secondary/40 transition-colors disabled:opacity-50"
              >
                Testar conexão
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <ArrowRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              <button
                onClick={handleReconnect}
                disabled={actionLoading}
                className="w-full flex items-center justify-between px-5 h-14 text-[14px] text-foreground active:bg-secondary/40 transition-colors disabled:opacity-50"
              >
                Reconectar
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                onClick={() => setConfirmDisconnect(true)}
                className="w-full flex items-center justify-between px-5 h-14 text-[14px] text-destructive active:bg-destructive/5 transition-colors"
              >
                Desconectar WhatsApp
                <ArrowRight className="w-4 h-4 text-destructive/50" />
              </button>
            </div>

            <AnimatePresence>
              {confirmDisconnect && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
                >
                  <p className="text-[13px] text-foreground leading-relaxed">
                    Ao desconectar, as mensagens automáticas e os disparos deixam de funcionar. Deseja continuar?
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
          </motion.div>
        ) : pairingCode && method === "pairing" ? (
          /* ═══ CÓDIGO DE PAREAMENTO ═══ */
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-2xl border border-border/40 bg-card p-6 text-center">
              <p className="text-[12px] text-muted-foreground uppercase tracking-[0.14em]">Seu código de conexão</p>
              <motion.p
                key={pairingCode}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`mt-3 text-[34px] leading-none font-semibold tracking-[0.12em] tabular-nums ${codeExpired ? "text-muted-foreground/40" : "text-foreground"}`}
              >
                {formatPairingCode(pairingCode)}
              </motion.p>

              {codeExpired ? (
                <p className="mt-3 text-[12px] text-destructive">O código expirou. Gere um novo código para continuar.</p>
              ) : (
                <p className="mt-3 text-[12px] text-muted-foreground tabular-nums">
                  Válido por {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </p>
              )}

              {codeExpired ? (
                <button
                  onClick={handleGeneratePairing}
                  disabled={actionLoading}
                  className="mt-5 w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Gerar novo código"}
                </button>
              ) : (
                <button
                  onClick={handleCopy}
                  className="mt-5 w-full h-12 rounded-xl border border-border/50 text-[14px] font-medium text-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                      <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500" /> Código copiado!
                      </motion.span>
                    ) : (
                      <motion.span key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <Copy className="w-4 h-4" /> Copiar código
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              )}
            </div>

            {/* Passo a passo */}
            <div className="rounded-2xl border border-border/40 bg-card p-5">
              <p className="text-[13px] font-semibold text-foreground mb-4">Como conectar</p>
              <ol className="space-y-3">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-[1px] w-5 h-5 rounded-full bg-secondary text-[11px] font-semibold text-foreground flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[13px] text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Aguardando */}
            {!codeExpired && (
              <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card px-5 py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-foreground">Aguardando conexão…</p>
                  <p className="text-[11px] text-muted-foreground">Estamos aguardando a confirmação do WhatsApp.</p>
                </div>
              </div>
            )}

            {errorMessage && (
              <p className="text-[12px] text-destructive text-center">{errorMessage}</p>
            )}

            <div className="flex flex-col items-center gap-2 pt-1">
              <button onClick={handleUseQrCode} className="text-[12px] text-muted-foreground underline underline-offset-4">
                Está com dificuldade? Usar QR Code
              </button>
              <button onClick={handleReset} className="text-[12px] text-muted-foreground/70">
                Usar outro número
              </button>
            </div>
          </motion.div>
        ) : method === "qrcode" && status === "connecting" ? (
          /* ═══ QR CODE (alternativa) ═══ */
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-2xl border border-border/40 bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-muted-foreground" />
                  <p className="text-[13px] font-semibold text-foreground">QR Code</p>
                </div>
                <button
                  onClick={handleRefreshQR}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border/50 text-[11px] font-medium text-foreground active:scale-95 transition-transform disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
                  Atualizar
                </button>
              </div>

              {qrCode ? (
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-xl">
                    <img
                      src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code para conectar o WhatsApp"
                      className="w-56 h-56 object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="mt-4 flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie o código.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card px-5 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Aguardando conexão…</p>
                <p className="text-[11px] text-muted-foreground">Estamos aguardando a confirmação do WhatsApp.</p>
              </div>
            </div>

            {errorMessage && <p className="text-[12px] text-destructive text-center">{errorMessage}</p>}

            <div className="text-center">
              <button onClick={handleReset} className="text-[12px] text-muted-foreground underline underline-offset-4">
                Voltar para o código de conexão
              </button>
            </div>
          </motion.div>
        ) : showReconnectCard ? (
          /* ═══ DESCONECTADO — RECONEXÃO DA MESMA INSTÂNCIA ═══ */
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-2xl border border-border/40 bg-card p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
                <RefreshCw className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="mt-4 text-[17px] font-semibold text-foreground">WhatsApp desconectado</h2>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">Desconectado</span>
              </div>
              <p className="mt-3 text-[15px] font-medium text-foreground tabular-nums">{formatPhoneDisplay(phoneNumber)}</p>
              <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
                Sua conexão continua guardada. Reconecte para voltar a usar o mesmo número — nenhuma conexão extra é criada.
              </p>

              {errorMessage && <p className="mt-3 text-[12px] text-destructive">{errorMessage}</p>}

              <button
                onClick={handleReconnect}
                disabled={actionLoading}
                className="mt-5 w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reconectar WhatsApp"}
              </button>
            </div>

            <div className="text-center space-y-2">
              <button
                onClick={() => { setWantsNewNumber(true); setPhoneInput(""); setErrorMessage(null); }}
                className="text-[12px] text-muted-foreground underline underline-offset-4"
              >
                Conectar outro número
              </button>
            </div>
          </motion.div>
        ) : (
          /* ═══ ENTRADA DO NÚMERO (padrão) ═══ */

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-2xl border border-border/40 bg-card p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-emerald-500" aria-hidden="true">
                  <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
                  <path d="M12.04 2C6.6 2 2.18 6.42 2.18 11.86c0 1.74.46 3.44 1.32 4.94L2 22l5.35-1.4a9.84 9.84 0 0 0 4.69 1.2h.01c5.43 0 9.85-4.42 9.85-9.86 0-2.63-1.02-5.11-2.88-6.97A9.79 9.79 0 0 0 12.04 2Zm0 17.96h-.01a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-3.1.81.83-3.02-.2-.31a8.14 8.14 0 0 1-1.25-4.36c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.86 5.8 2.4a8.15 8.15 0 0 1 2.4 5.8c0 4.52-3.68 8.2-8.2 8.2Z" />
                </svg>
              </div>
              <h2 className="mt-4 text-[17px] font-semibold text-foreground">Conecte seu WhatsApp</h2>
              <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
                Use o número de WhatsApp do seu negócio para iniciar a conexão de forma rápida e segura.
              </p>

              <label className="block mt-5 text-[12px] font-medium text-muted-foreground">Número do WhatsApp</label>
              <div className="mt-2 flex items-center gap-2 h-14 rounded-2xl border border-border/50 bg-background px-4 focus-within:border-foreground/40 transition-colors">
                <span className="text-[15px] text-muted-foreground tabular-nums">+55</span>
                <input
                  value={phoneInput}
                  onChange={(e) => { setPhoneInput(maskPhoneInput(e.target.value)); setErrorMessage(null); }}
                  inputMode="numeric"
                  placeholder="(11) 99999-9999"
                  className="flex-1 bg-transparent outline-none text-[16px] text-foreground placeholder:text-muted-foreground/50 tabular-nums"
                />
              </div>

              {errorMessage && <p className="mt-2 text-[12px] text-destructive">{errorMessage}</p>}

              <button
                onClick={handleGeneratePairing}
                disabled={actionLoading || !phoneValid}
                className="mt-4 w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar código de conexão"}
              </button>

              <div className="mt-4 flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  A conexão é exclusiva desta barbearia e deste barbeiro. Nada é compartilhado com outras unidades.
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[12px] text-muted-foreground">Prefere usar QR Code?</p>
              <button
                onClick={handleUseQrCode}
                disabled={actionLoading}
                className="mt-2 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border/50 text-[13px] font-medium text-foreground active:scale-95 transition-transform disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                Usar QR Code
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
