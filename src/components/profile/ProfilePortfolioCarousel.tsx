import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, ChevronRight, Loader2, Plus, X, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PortfolioImage {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}

interface ProfilePortfolioCarouselProps {
  barbeiroId: string | null;
  tenantId?: string | null;
  basePath?: string;
}

export function ProfilePortfolioCarousel({
  barbeiroId,
  tenantId,
  basePath = "/admin",
}: ProfilePortfolioCarouselProps) {
  const navigate = useNavigate();
  const [images, setImages] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<PortfolioImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = async () => {
    if (!barbeiroId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("portfolio_images")
        .select("id, image_url, caption, created_at")
        .eq("barbeiro_id", barbeiroId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!error && data) {
        setImages(data as PortfolioImage[]);
      }
    } catch (err) {
      console.error("Erro ao carregar fotos do portfólio:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();

    if (!barbeiroId) return;

    const channelName = `portfolio-carousel-${barbeiroId}-${Math.random().toString(36).slice(2, 9)}`;
    let channel: any = null;

    try {
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "portfolio_images",
            filter: `barbeiro_id=eq.${barbeiroId}`,
          },
          () => loadImages()
        )
        .subscribe();
    } catch (err) {
      console.warn("Erro ao registrar canal de portfolio:", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [barbeiroId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !barbeiroId) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A foto deve ter no máximo 5MB");
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${barbeiroId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("portfolio")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (storageError) throw storageError;

      const { data: publicUrlData } = supabase.storage
        .from("portfolio")
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      const { data: newRow, error: dbError } = await supabase
        .from("portfolio_images")
        .insert({
          barbeiro_id: barbeiroId,
          tenant_id: tenantId || null,
          image_url: publicUrl,
          caption: null,
          ordem: 0,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      if (newRow) {
        setImages((prev) => [newRow as PortfolioImage, ...prev]);
      }
      toast.success("Foto adicionada ao portfólio!");
    } catch (err: any) {
      console.error("Erro ao enviar foto para o portfólio:", err);
      toast.error("Erro ao salvar foto no portfólio");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const goToFullPortfolio = () => {
    navigate(`${basePath}/portfolio`);
  };

  return (
    <div className="space-y-3">
      {/* Input oculto para adicionar foto com 1 clique */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Cabeçalho do Portfólio */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-foreground tracking-tight">
            Portfólio de Cortes
          </p>
          {images.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-full border border-border/40 tabular-nums">
              {images.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={goToFullPortfolio}
          className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground active:opacity-70 transition-colors cursor-pointer"
        >
          <span>Ver todos</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Carrossel Horizontal */}
      {loading ? (
        <div
          className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar overscroll-x-contain [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-[105px] h-[140px] rounded-2xl bg-secondary/30 border border-border/30 animate-pulse shrink-0"
            />
          ))}
        </div>
      ) : (
        <div
          className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar overscroll-x-contain [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* Card 1: Botão de Adicionar Foto */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-[105px] h-[140px] rounded-2xl border-2 border-dashed border-border/70 hover:border-foreground/40 bg-secondary/25 hover:bg-secondary/40 flex flex-col items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-95 transition-all text-muted-foreground hover:text-foreground group shadow-xs disabled:opacity-60 touch-manipulation"
            title="Adicionar nova foto"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-foreground" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-background border border-border/60 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <Plus className="w-4 h-4 text-foreground stroke-[2.4]" />
              </div>
            )}
            <span className="text-[11.5px] font-medium text-foreground leading-tight">
              {uploading ? "Enviando..." : "Novo corte"}
            </span>
          </button>

          {/* Cards 2..N: Fotos dos Cortes do Barbeiro */}
          {images.map((img) => (
            <div
              key={img.id}
              onClick={() => setPreviewImage(img)}
              className="w-[105px] h-[140px] rounded-2xl overflow-hidden relative border border-border/40 bg-muted shrink-0 cursor-pointer active:scale-95 transition-all shadow-xs group select-none touch-manipulation"
            >
              <img
                src={img.image_url}
                alt={img.caption || "Corte de cabelo"}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          ))}

          {/* Se não houver fotos adicionais além do botão adicionar */}
          {images.length === 0 && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-w-[190px] h-[140px] rounded-2xl border border-border/40 bg-secondary/15 p-3.5 flex flex-col justify-center cursor-pointer hover:bg-secondary/30 transition-colors select-none"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Camera className="w-3.5 h-3.5" />
                <span className="text-[12px] font-semibold text-foreground">Mostre seu trabalho</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Adicione fotos dos seus cortes para exibir aos clientes na sua página de agendamento.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Preview em Tela Cheia */}
      <AnimatePresence>
        {previewImage && (
          <div
            className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col justify-between p-4"
            onClick={() => setPreviewImage(null)}
          >
            {/* Header da Lightbox */}
            <div className="flex items-center justify-between text-white shrink-0 pt-2 px-1">
              <span className="text-[13px] font-medium text-white/80">
                Visualizar Corte
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Imagem Centralizada */}
            <div className="flex-1 flex items-center justify-center my-4 overflow-hidden">
              <motion.img
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.2 }}
                src={previewImage.image_url}
                alt="Corte"
                className="max-h-[75vh] max-w-[92vw] object-contain rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Rodapé com botão de Gerenciar no Portfólio */}
            <div className="shrink-0 pb-4 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setPreviewImage(null);
                  goToFullPortfolio();
                }}
                className="h-10 px-5 rounded-full bg-white text-black font-semibold text-[13px] flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Gerenciar no Portfólio</span>
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
