import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useToggleInstagramPosts } from "@/hooks/useBarberMutations";
import { motion } from "framer-motion";
import { Loader2, ExternalLink, Unlink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import instagramIcon from "@/assets/instagram-icon.png";

interface InstagramSectionProps {
  barbeiroId: string;
  basePath?: string;
}

interface InstagramConnection {
  id: string;
  ig_username: string;
  show_posts_on_landing: boolean;
  token_expires_at: string | null;
}

/**
 * Seção de conexão com Instagram no perfil do barbeiro.
 * Permite conectar/desconectar e configurar exibição de posts na landing page.
 */
export function InstagramSection({ barbeiroId, basePath = "/barbeiro" }: InstagramSectionProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connection, setConnection] = useState<InstagramConnection | null>(null);

  useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      try {
        const { data } = await supabase
          .from("instagram_connections")
          .select("id, ig_username, show_posts_on_landing, token_expires_at")
          .eq("barbeiro_id", barbeiroId)
          .maybeSingle();
        if (mounted) setConnection(data as InstagramConnection | null);
      } catch (err) {
        console.error("Erro ao carregar conexão Instagram:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [barbeiroId]);

  const loadConnection = async () => {
    try {
      const { data } = await supabase
        .from("instagram_connections")
        .select("id, ig_username, show_posts_on_landing, token_expires_at")
        .eq("barbeiro_id", barbeiroId)
        .maybeSingle();
      setConnection(data as InstagramConnection | null);
    } catch (err) {
      console.error("Erro ao carregar conexão Instagram:", err);
    } finally {
      setLoading(false);
    }
  };

  /** Abre a tela de conexão do Instagram */
  const handleConnect = () => {
    navigate(`${basePath}/instagram`);
  };

  /** Desconecta o Instagram */
  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      const { data, error } = await supabase.functions.invoke("instagram-auth", {
        body: { action: "disconnect", barbeiro_id: barbeiroId },
      });

      if (error) {
        toast.error("Erro ao desconectar");
        return;
      }

      setConnection(null);
      toast.success("Instagram desconectado");
    } catch (err) {
      toast.error("Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  /** Atualiza cache de posts */
  const handleRefreshPosts = async () => {
    try {
      setRefreshing(true);
      const { error } = await supabase.functions.invoke("instagram-auth", {
        body: { action: "refresh_posts", barbeiro_id: barbeiroId },
      });

      if (error) {
        toast.error("Erro ao atualizar posts");
        return;
      }

      toast.success("Posts atualizados!");
    } catch (err) {
      toast.error("Erro ao atualizar posts");
    } finally {
      setRefreshing(false);
    }
  };

  /** Toggle exibição de posts na landing page — usa mutation */
  const toggleMutation = useToggleInstagramPosts();
  const handleToggleShowPosts = () => {
    if (!connection) return;
    const newVal = !connection.show_posts_on_landing;

    // Optimistic update local
    setConnection({ ...connection, show_posts_on_landing: newVal });

    toggleMutation.mutate(
      { connectionId: connection.id, newValue: newVal },
      {
        onError: () => {
          // Rollback local
          setConnection({ ...connection, show_posts_on_landing: !newVal });
        },
      }
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="mt-6 mx-5"
    >
      {/* Título da seção */}
      <div className="flex items-center gap-2.5 mb-3">
        <img
          src={instagramIcon}
          alt="Instagram"
          className="w-5 h-5 object-contain"
          style={{ imageRendering: "auto" }}
        />
        <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
          Redes Sociais
        </span>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        {connection ? (
          /* ═══ CONECTADO ═══ */
          <>
            {/* Info da conta */}
            <div className="flex items-center gap-3 p-4">
              <img
                src={instagramIcon}
                alt="Instagram"
                className="w-9 h-9 object-contain flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-foreground">@{connection.ig_username}</p>
                <p className="text-[11px] text-emerald-500 font-medium">Conectado</p>
              </div>
              <a
                href={`https://www.instagram.com/${connection.ig_username}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center"
                aria-label="Abrir Instagram"
              >
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
            </div>

            <div className="h-px bg-border/30" />

            {/* Toggle: mostrar posts na landing */}
            <button
              onClick={handleToggleShowPosts}
              className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 active:bg-secondary/40 transition-colors"
            >
              <div className="min-w-0 text-left">
                <span className="text-[13px] font-medium text-foreground block truncate">Exibir posts na página</span>
                <span className="text-[11px] text-muted-foreground block truncate">
                  Seus clientes verão seus posts ao acessar a barbearia
                </span>
              </div>
              <div className={cn(
                "w-10 h-6 rounded-full transition-colors relative shrink-0",
                connection.show_posts_on_landing ? "bg-emerald-500" : "bg-muted"
              )}>
                <div className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                  connection.show_posts_on_landing ? "translate-x-[18px]" : "translate-x-0.5"
                )} />
              </div>
            </button>

            <div className="h-px bg-border/30" />

            {/* Atualizar posts */}
            <button
              onClick={handleRefreshPosts}
              disabled={refreshing}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-secondary/40 transition-colors"
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-[13px] font-medium text-foreground">Atualizar posts</span>
            </button>

            <div className="h-px bg-border/30" />

            {/* Desconectar */}
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-secondary/40 transition-colors"
            >
              {disconnecting ? (
                <Loader2 className="w-4 h-4 text-destructive animate-spin" />
              ) : (
                <Unlink className="w-4 h-4 text-destructive" />
              )}
              <span className="text-[13px] font-medium text-destructive">Desconectar Instagram</span>
            </button>
          </>
        ) : (
          /* ═══ NÃO CONECTADO ═══ */
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center gap-3.5 p-4 active:bg-secondary/40 transition-colors"
          >
            <img
              src={instagramIcon}
              alt="Instagram"
              className="w-9 h-9 object-contain flex-shrink-0"
            />
            <div className="flex-1 text-left min-w-0">
              <span className="text-[14px] font-medium text-foreground block">Conectar Instagram</span>
              <span className="text-[11px] text-muted-foreground">
                Exiba seus trabalhos na página da barbearia
              </span>
            </div>
            {connecting ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
            ) : (
              <div className="h-8 px-4 rounded-full bg-foreground text-background text-[12px] font-semibold flex items-center justify-center shrink-0 shadow-xs">
                Conectar
              </div>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
