import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import instagramIcon from "@/assets/instagram-icon.png";

interface InstagramFeedSectionProps {
  tenantId: string;
}

interface CachedPost {
  id: string;
  media_type: string;
  media_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  permalink: string | null;
}

/**
 * Seção de feed do Instagram na landing page pública.
 * Mostra os posts cacheados dos barbeiros que habilitaram a exibição.
 */
export function InstagramFeedSection({ tenantId }: InstagramFeedSectionProps) {
  const [posts, setPosts] = useState<CachedPost[]>([]);
  const [igUsername, setIgUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, [tenantId]);

  const loadPosts = async () => {
    try {
      // Buscar barbeiros do tenant que têm Instagram conectado e habilitado
      const { data: barbers } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("ativo", true)
        .is("deleted_at", null)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

      if (!barbers || barbers.length === 0) { setLoading(false); return; }

      const barberIds = barbers.map((b) => b.id);

      // Buscar conexões que permitem exibição
      const { data: connections } = await supabase
        .from("instagram_connections")
        .select("id, ig_username, barbeiro_id")
        .in("barbeiro_id", barberIds)
        .eq("show_posts_on_landing", true);

      if (!connections || connections.length === 0) { setLoading(false); return; }

      // Usar o primeiro username encontrado para o link
      setIgUsername(connections[0].ig_username);

      const connIds = connections.map((c) => c.id);

      // Buscar posts cacheados
      const { data: cachedPosts } = await supabase
        .from("instagram_posts_cache")
        .select("id, media_type, media_url, thumbnail_url, caption, permalink")
        .in("connection_id", connIds)
        .order("post_timestamp", { ascending: false })
        .limit(9);

      setPosts((cachedPosts as CachedPost[]) || []);
    } catch (err) {
      console.error("Erro ao carregar feed Instagram:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || posts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.35 }}
      className="mt-6 px-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <img src={instagramIcon} alt="Instagram" className="w-4 h-4 object-contain" />
          <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
            Instagram
          </span>
        </div>
        {igUsername && (
          <a
            href={`https://www.instagram.com/${igUsername}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-medium text-primary active:opacity-70 transition-opacity"
          >
            @{igUsername}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Grid de posts */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
        {posts.map((post, idx) => {
          const imageUrl = post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url;
          if (!imageUrl) return null;

          return (
            <motion.a
              key={post.id}
              href={post.permalink || "#"}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: 0.4 + idx * 0.04 }}
              className="aspect-square overflow-hidden relative group"
            >
              <img
                src={imageUrl}
                alt={post.caption?.slice(0, 60) || "Post do Instagram"}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              {/* Video indicator */}
              {post.media_type === "VIDEO" && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                  <span className="text-foreground text-[8px]">▶</span>
                </div>
              )}
            </motion.a>
          );
        })}
      </div>
    </motion.div>
  );
}
