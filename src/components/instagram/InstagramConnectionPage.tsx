import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

interface InstagramConnectionPageProps {
  barbeiroId?: string | null;
  basePath?: string;
  tenantNome?: string;
  barberName?: string;
  tenantId?: string | null;
  onBack?: () => void;
}

interface InstagramConnection {
  id: string;
  barbeiro_id: string;
  ig_username: string;
  show_posts_on_landing: boolean;
  token_expires_at: string | null;
  updated_at?: string;
  created_at?: string;
}

function formatConnectedDate(raw: unknown): string {
  if (!raw) return "";
  try {
    const d = new Date(String(raw));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function InstagramConnectionPage({
  barbeiroId: propBarbeiroId,
  basePath = "/barbeiro",
  onBack: onBackProp,
}: InstagramConnectionPageProps) {
  const navigate = useNavigate();
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(
    propBarbeiroId || null
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [connection, setConnection] = useState<InstagramConnection | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChangingHandle, setIsChangingHandle] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // 1. Resolver o barbeiroId se não foi passado via prop
  useEffect(() => {
    if (propBarbeiroId) {
      setResolvedBarbeiroId(propBarbeiroId);
      return;
    }
    const saved = localStorage.getItem("barbeiroId");
    if (saved) {
      setResolvedBarbeiroId(saved);
      return;
    }
    const resolveUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: b } = await supabase
            .from("barbeiros")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (b?.id) {
            setResolvedBarbeiroId(b.id);
          }
        }
      } catch (err) {
        console.error("Erro ao resolver barbeiro:", err);
      }
    };
    resolveUser();
  }, [propBarbeiroId]);

  // 2. Carregar conexão existente do Instagram
  const loadConnection = async (bId?: string | null) => {
    const idToUse = bId || resolvedBarbeiroId;
    if (!idToUse) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("instagram_connections")
        .select("id, barbeiro_id, ig_username, show_posts_on_landing, token_expires_at, updated_at, created_at")
        .eq("barbeiro_id", idToUse)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Erro ao buscar conexão Instagram:", error);
      }
      setConnection((data as InstagramConnection) || null);
      if (data?.ig_username) {
        setUsernameInput(data.ig_username);
      }
    } catch (err) {
      console.error("Erro ao carregar Instagram:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resolvedBarbeiroId) {
      loadConnection(resolvedBarbeiroId);
    } else {
      setLoading(false);
    }
  }, [resolvedBarbeiroId]);

  // 3. Conectar e validar duplicidade no banco
  const handleConnectInstagram = async () => {
    if (!resolvedBarbeiroId) {
      toast.error("Identificação do barbeiro não encontrada");
      return;
    }

    const cleanHandle = usernameInput
      .trim()
      .replace(/^@+/, "")
      .replace(/\/+$/, "")
      .split("/")
      .pop()!
      .toLowerCase()
      .trim();

    if (!cleanHandle || cleanHandle.length < 2) {
      setErrorMessage("Informe um nome de usuário válido do Instagram");
      return;
    }

    // Regras padrão de handle do Instagram: letras, números, pontos e underlines
    const validUsernameRegex = /^[a-zA-Z0-9._]+$/;
    if (!validUsernameRegex.test(cleanHandle)) {
      setErrorMessage("O nome de usuário só pode conter letras, números, pontos e sublinhados");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      // ═══ REGRA SUPREMA: Verificar se nenhum outro barbeiro já conectou este Instagram ═══
      const { data: existingConns, error: checkError } = await supabase
        .from("instagram_connections")
        .select("id, barbeiro_id, ig_username")
        .ilike("ig_username", cleanHandle);

      if (checkError) {
        console.error("Erro ao verificar duplicidade do Instagram:", checkError);
      }

      const isTakenByOther = (existingConns || []).some(
        (c) => c.barbeiro_id !== resolvedBarbeiroId
      );

      if (isTakenByOther) {
        const msg = `O perfil @${cleanHandle} já está cadastrado por outro barbeiro no aplicativo.`;
        setErrorMessage(msg);
        toast.error(msg);
        setActionLoading(false);
        return;
      }

      // ═══ Upsert na tabela instagram_connections ═══
      const { error: upsertError } = await supabase
        .from("instagram_connections")
        .upsert(
          {
            barbeiro_id: resolvedBarbeiroId,
            ig_username: cleanHandle,
            ig_user_id: `manual_${cleanHandle}`,
            access_token: `connected_${cleanHandle}`,
            show_posts_on_landing: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "barbeiro_id" }
        );

      if (upsertError) {
        console.error("Erro ao salvar conexão Instagram:", upsertError);
        toast.error("Erro ao conectar Instagram. Tente novamente.");
        setActionLoading(false);
        return;
      }

      toast.success(`Instagram @${cleanHandle} conectado com sucesso!`);
      setIsChangingHandle(false);
      setConfirmDisconnect(false);
      await loadConnection(resolvedBarbeiroId);
    } catch (err) {
      console.error("Erro inesperado:", err);
      toast.error("Erro ao processar conexão do Instagram");
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Desconectar Instagram
  const handleDisconnect = async () => {
    if (!resolvedBarbeiroId) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("instagram_connections")
        .delete()
        .eq("barbeiro_id", resolvedBarbeiroId);

      if (error) throw error;
      setConnection(null);
      setUsernameInput("");
      setIsChangingHandle(false);
      setConfirmDisconnect(false);
      toast.success("Instagram desconectado com sucesso");
    } catch (err) {
      console.error("Erro ao desconectar:", err);
      toast.error("Erro ao desconectar Instagram");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBack = () => {
    if (onBackProp) return onBackProp();
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(basePath);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header idêntico ao padrão Apple HIG e do WhatsApp */}
      <ScheduleHeader title="Instagram" onBack={handleBack} />

      <main className="w-full max-w-md mx-auto px-4 pt-4 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-[12.5px] text-muted-foreground">
                Carregando dados do Instagram...
              </p>
            </div>
          ) : connection && !isChangingHandle ? (
            /* ═══ TELA: INSTAGRAM CONECTADO (100% IDÊNTICO AO WHATSAPP) ═══ */
            <div className="space-y-6 pt-1">
              <div className="space-y-3 pt-1">
                {/* Logo oficial do Instagram limpo, sem caixas/fundos artificiais */}
                <div className="w-12 h-12 flex items-center justify-center">
                  <img
                    src="/instagram-logo.png"
                    alt="Instagram"
                    className="w-12 h-12 object-contain"
                  />
                </div>

                <div>
                  <h2 className="text-[20px] font-bold text-foreground tracking-tight">
                    Instagram Conectado
                  </h2>
                </div>

                <div className="pt-1">
                  <p className="text-[22px] font-bold text-foreground tracking-tight">
                    @{connection.ig_username}
                  </p>
                  {connection.updated_at && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Conectado desde {formatConnectedDate(connection.updated_at)}
                    </p>
                  )}
                </div>
              </div>

              {/* Lista de Ações — Padrão Atendimento & Notificações (espaçoso, divide-y, sem emprensar) */}
              <div className="divide-y divide-border/25 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `https://www.instagram.com/${connection.ig_username}/`,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all disabled:opacity-50 group cursor-pointer"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[13.5px] font-medium text-foreground leading-snug">
                      Ver perfil no Instagram
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                      Abre a página oficial do Instagram no navegador.
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsChangingHandle(true);
                    setUsernameInput(connection.ig_username);
                    setErrorMessage(null);
                  }}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all disabled:opacity-50 group cursor-pointer"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[13.5px] font-medium text-foreground leading-snug">
                      Conectar outro perfil do Instagram
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                      Altera a conta do Instagram vinculada à sua barbearia.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group cursor-pointer"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[13.5px] font-medium text-destructive leading-snug">
                      Desconectar Instagram
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                      Remove o vínculo deste perfil com a sua barbearia no DUB.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-destructive/50 group-hover:text-destructive transition-colors shrink-0" />
                </button>
              </div>

              {/* Confirmação de desconexão idêntica ao WhatsApp */}
              <AnimatePresence>
                {confirmDisconnect && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 mt-3"
                  >
                    <p className="text-[13px] text-foreground leading-relaxed">
                      Ao desconectar, o perfil @{connection.ig_username} não ficará mais visível aos clientes da sua barbearia. Deseja continuar?
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={actionLoading}
                        className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-[13px] font-semibold active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                          "Confirmar desconexão"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnect(false)}
                        className="flex-1 h-10 rounded-xl border border-border/70 text-foreground text-[13px] font-medium hover:bg-muted/40 active:scale-[0.98] transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* ═══ TELA: FORMULÁRIO DE CONEXÃO (100% IDÊNTICO AO WHATSAPP) ═══ */
            <div className="space-y-6 pt-1">
              <div className="space-y-4">
                {/* Logo oficial do Instagram limpo, sem caixas/fundos artificiais */}
                <div className="w-12 h-12 flex items-center justify-center">
                  <img
                    src="/instagram-logo.png"
                    alt="Instagram"
                    className="w-12 h-12 object-contain"
                  />
                </div>

                <div>
                  <h2 className="text-[20px] font-bold text-foreground tracking-tight">
                    {isChangingHandle ? "Trocar Perfil do Instagram" : "Conectar Instagram"}
                  </h2>
                  <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                    Informe o perfil do Instagram da barbearia para vincular ao DUB.
                  </p>
                </div>

                {/* Campo com @ fixo e validação idêntica ao +55 do WhatsApp */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[12.5px] font-medium text-foreground">
                    Perfil do Instagram
                  </label>
                  <div
                    className={cn(
                      "flex items-center h-12 rounded-xl border bg-card px-3.5 transition-all shadow-xs",
                      errorMessage
                        ? "border-destructive ring-1 ring-destructive/20"
                        : "border-border/70 dark:border-white/[0.1] focus-within:border-foreground"
                    )}
                  >
                    <span className="text-[14px] font-semibold text-muted-foreground mr-2.5 tabular-nums select-none border-r border-border/50 pr-2.5">
                      @
                    </span>
                    <input
                      value={usernameInput}
                      onChange={(e) => {
                        const raw = e.target.value
                          .replace(/^@+/, "")
                          .replace(/\s+/g, "")
                          .toLowerCase();
                        setUsernameInput(raw);
                        setErrorMessage(null);
                      }}
                      placeholder="seuperfil"
                      className="flex-1 bg-transparent outline-none text-[15px] font-medium text-foreground placeholder:text-muted-foreground/40"
                      autoFocus
                      disabled={actionLoading}
                    />
                    {usernameInput.trim().length >= 2 && !errorMessage && (
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

                {/* Botão de Ação */}
                <button
                  type="button"
                  onClick={handleConnectInstagram}
                  disabled={actionLoading || !usernameInput.trim()}
                  className="w-full h-12 rounded-xl bg-foreground text-background text-[14px] font-semibold flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-40 shadow-xs hover:opacity-90 cursor-pointer"
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Conectar Instagram"
                  )}
                </button>

                {isChangingHandle && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangingHandle(false);
                        setErrorMessage(null);
                      }}
                      className="text-[12.5px] text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer"
                    >
                      Cancelar e manter perfil atual
                    </button>
                  </div>
                )}

                <p className="text-[11.5px] text-muted-foreground/75 leading-relaxed pt-1">
                  Seus cortes e fotos deste perfil ficam acessíveis aos clientes da sua barbearia.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

export default InstagramConnectionPage;
