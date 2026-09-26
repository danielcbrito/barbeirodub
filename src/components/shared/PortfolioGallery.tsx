import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, X, Loader2 } from "lucide-react";

interface PortfolioImage {
  id: string;
  image_url: string;
  caption: string | null;
  barbeiro_id: string;
}

interface PortfolioGalleryProps {
  /** IDs dos barbeiros para exibir imagens */
  barberIds: string[];
  /** Título da seção */
  title?: string;
  /** Limite de imagens */
  limit?: number;
}

/**
 * Galeria somente-leitura para exibição pública de portfólio
 * (ex: TenantLandingPage, perfil público do barbeiro)
 */
export function PortfolioGallery({
  barberIds,
  title = "Nossos Trabalhos",
  limit = 12,
}: PortfolioGalleryProps) {
  const [images, setImages] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (!barberIds.length) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("portfolio_images")
        .select("id, image_url, caption, barbeiro_id")
        .in("barbeiro_id", barberIds)
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(limit);

      setImages((data as PortfolioImage[]) || []);
      setLoading(false);
    };

    load();
  }, [barberIds.join(","), limit]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (images.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.4 }}
      className="mt-6 px-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[12px] text-muted-foreground">{images.length}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {images.map((img, idx) => (
          <motion.div
            key={img.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.04 * idx }}
            className="aspect-[4/5] bg-muted rounded-xl cursor-pointer overflow-hidden shadow-sm"
            onClick={() => setPreviewImage(img.image_url)}
          >
            <img
              src={img.image_url}
              alt={img.caption || "Corte"}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center text-foreground hover:bg-foreground/20 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
