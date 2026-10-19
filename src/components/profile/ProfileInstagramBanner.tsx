import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ExternalLink, RefreshCw, Unlink, Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import instagramIcon from "@/assets/instagram-icon.png";

interface ProfileInstagramBannerProps {
  barbeiroId: string | null;
  basePath?: string;
}

interface InstagramConnection {
  id: string;
  ig_username: string;
  show_posts_on_landing: boolean;
  token_expires_at: string | null;
}

const getCachedConnection = (bId: string | null): InstagramConnection | null => {
  if (!bId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`dub:ig_conn:${bId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function ProfileInstagramBanner({ barbeiroId, basePath = "/barbeiro" }: ProfileInstagramBannerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    const shouldHighlight =
      searchParams.get("highlight") === "instagram" ||
      (location.state as any)?.highlight === "instagram";
    if (shouldHighlight) {
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [searchParams, location.state]);

  const cached = getCachedConnection(barbeiroId);
  const [loading, setLoading] = useState(!cached && !!barbeiroId);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [connection, setConnection] = useState<InstagramConnection | null>(cached);

  useEffect(() => {
    if (!barbeiroId) {
      setLoading(false);
      return;
    }
    let mounted = true;

    const loadConn = async () => {
      try {
        const { data } = await supabase
          .from("instagram_connections")
          .select("id, ig_username, show_posts_on_landing, token_expires_at")
          .eq("barbeiro_id", barbeiroId)
          .maybeSingle();

        if (mounted) {
          if (data) {
            try {
              localStorage.setItem(`dub:ig_conn:${barbeiroId}`, JSON.stringify(data));
            } catch {}
            setConnection(data as InstagramConnection);
          } else {
            try {
              localStorage.removeItem(`dub:ig_conn:${barbeiroId}`);
            } catch {}
            setConnection(null);
          }
        }
      } catch (err) {
        console.error("Erro ao verificar conexão Instagram:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadConn();

    const channel = supabase
      .channel(`ig-conn-${barbeiroId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instagram_connections",
          filter: `barbeiro_id=eq.${barbeiroId}`,
        },
        () => loadConn()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [barbeiroId]);

  const handleConnect = () => {
    navigate(`${basePath}/instagram`);
  };

  const handleRefreshPosts = async () => {
    if (!barbeiroId) return;
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("instagram-auth", {
        body: { action: "refresh_posts", barbeiro_id: barbeiroId },
      });
      if (error) throw error;
      toast.success("Posts do Instagram atualizados!");
    } catch {
      toast.error("Erro ao atualizar posts");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!barbeiroId) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from("instagram_connections")
        .delete()
        .eq("barbeiro_id", barbeiroId);
      if (error) throw error;
      try {
        localStorage.removeItem(`dub:ig_conn:${barbeiroId}`);
      } catch {}
      setConnection(null);
      setShowOptions(false);
      toast.success("Instagram desconectado");
    } catch {
      toast.error("Erro ao desconectar conta");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading && !connection) {
    return (
      <div className="w-full h-20 rounded-2xl bg-secondary/20 border border-border/30 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />
      </div>
    );
  }

  // ═══ NÃO CONECTADO: BANNER LIMPO E ESTRATÉGICO ═══
  if (!connection) {
    return (
      <div
        className={cn(
          "w-full rounded-2xl border bg-card p-4 shadow-xs flex items-center justify-between gap-3 transition-all",
          isHighlighted
            ? "border-emerald-500 ring-2 ring-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.35)] animate-pulse"
            : "border-border/50 hover:border-border/80"
        )}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={instagramIcon}
            alt="Instagram"
            className="w-9 h-9 object-contain shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground leading-tight">
              Conectar Instagram
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
              Exiba seus cortes e trabalhos na barbearia
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleConnect}
          className="h-8 px-4 rounded-full bg-foreground text-background font-semibold text-[12px] flex items-center justify-center shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer"
        >
          <span>Conectar</span>
        </button>
      </div>
    );
  }

  // ═══ CONECTADO: BANNER COM CONTA CONECTADA E AÇÕES ═══
  return (
    <div className="w-full rounded-2xl border border-border/50 bg-card p-4 shadow-xs space-y-3 transition-all">
      <div
        onClick={() => navigate(`${basePath}/instagram`)}
        className="flex items-center justify-between gap-3 cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={instagramIcon}
            alt="Instagram"
            className="w-9 h-9 object-contain shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[14px] font-semibold text-foreground truncate leading-tight">
                @{connection.ig_username}
              </p>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={`https://www.instagram.com/${connection.ig_username}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            title="Abrir perfil no Instagram"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => setShowOptions((prev) => !prev)}
            className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
            title="Opções"
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showOptions && "rotate-180")} />
          </button>
        </div>
      </div>

      {showOptions && (
        <div className="pt-2 border-t border-border/30 flex items-center justify-between gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/instagram`)}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium py-1 px-2.5 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Gerenciar</span>
          </button>

          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-1.5 text-destructive hover:opacity-80 font-medium py-1 px-2.5 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            {disconnecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Unlink className="w-3.5 h-3.5" />
            )}
            <span>Desconectar</span>
          </button>
        </div>
      )}
    </div>
  );
}
