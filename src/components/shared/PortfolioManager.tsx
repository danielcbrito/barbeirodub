import { Wand2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Loader2, ImageIcon, ChevronRight,
  Crop, RotateCcw, ZoomIn, ZoomOut, Copy, Check,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Cropper from "react-easy-crop";
import { getCroppedImage, type CroppedArea } from "@/lib/cropImage";

/* ─── Types ─── */
interface PortfolioImage {
  id: string;
  barbeiro_id: string;
  tenant_id: string | null;
  image_url: string;
  caption: string | null;
  ordem: number;
  created_at: string;
}

interface PortfolioManagerProps {
  barbeiroId: string;
  tenantId?: string | null;
  basePath?: string;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

/** Seta curvada padrão DUB */
function CurvedBackArrow({ className = "text-foreground" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

/* ── Aspect ratio presets ── */
const ASPECT_RATIOS = [
  { label: "1:1", value: 1, icon: "⬜" },
  { label: "4:5", value: 4 / 5, icon: "▯" },
  { label: "16:9", value: 16 / 9, icon: "▭" },
] as const;

/* ── Converte File/URL para base64 para enviar à IA ── */
async function imageToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/* ══════════════════════════════════════════════════════════
   AI CAPTION COMPONENT — Sutil e estratégico
   ══════════════════════════════════════════════════════════ */
function AICaptionEnhancer({
  caption,
  imageUrl,
  onSelect,
}: {
  caption: string;
  imageUrl: string | null;
  onSelect: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let imageBase64: string | undefined;
      if (imageUrl) {
        try {
          imageBase64 = await imageToBase64(imageUrl);
        } catch { /* fallback */ }
      }

      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          caption: caption.trim() || undefined,
          imageBase64,
          context: "Corte de cabelo masculino profissional em barbearia",
        },
      });
      if (error) throw error;

      if (data?.suggestions?.length > 0) {
        onSelect(data.suggestions[0]);
        toast.success("Legenda aplicada com sucesso");
      } else {
        toast.error("Não foi possível gerar a legenda");
      }
    } catch {
      toast.error("Erro ao aprimorar legenda");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      title={caption.trim() ? "Aprimorar legenda" : "Sugerir legenda"}
      className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 active:scale-90 transition-all disabled:opacity-40"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Wand2 className="w-4 h-4" />
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   SINGLE-STEP NEW POST FLOW
   Imagem + edição inline + legenda — tudo em uma tela
   ══════════════════════════════════════════════════════════ */
function NewPostFlow({
  open,
  onClose,
  previewUrl,
  onPublish,
  publishing,
}: {
  open: boolean;
  onClose: () => void;
  previewUrl: string | null;
  onPublish: (caption: string) => void;
  publishing: boolean;
}) {
  const [caption, setCaption] = useState("");
  const [showCropEditor, setShowCropEditor] = useState(false);

  /* Crop state */
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedArea | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCaption("");
      setShowCropEditor(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setAspect(1);
      setCroppedAreaPixels(null);
      if (croppedPreview) URL.revokeObjectURL(croppedPreview);
      setCroppedPreview(null);
    }
  }, [open]);

  const onCropComplete = useCallback((_: any, croppedPixels: CroppedArea) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  /** Aplica o crop e fecha o editor */
  const handleApplyCrop = async () => {
    if (previewUrl && croppedAreaPixels) {
      try {
        const blob = await getCroppedImage(previewUrl, croppedAreaPixels);
        if (croppedPreview) URL.revokeObjectURL(croppedPreview);
        setCroppedPreview(URL.createObjectURL(blob));
      } catch { /* fallback */ }
    }
    setShowCropEditor(false);
  };

  if (!open || !previewUrl) return null;

  const displayImage = croppedPreview || previewUrl;

  return (
    <AnimatePresence mode="wait">
      {/* ═══════ CROP EDITOR (overlay sobre a tela principal) ═══════ */}
      {showCropEditor && (
        <motion.div
          key="crop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[120] bg-background flex flex-col pt-[env(safe-area-inset-top)]"
        >
          <div className="flex items-center justify-between h-12 px-4 shrink-0 border-b border-border/10">
            <button
              onClick={() => setShowCropEditor(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all"
            >
              <CurvedBackArrow />
            </button>
            <p className="text-[14px] font-bold text-foreground tracking-tight">Editar imagem</p>
            <button
              onClick={handleApplyCrop}
              className="text-[13px] font-bold text-primary hover:text-primary/80 active:scale-95 transition-all px-2"
            >
              Aplicar
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden bg-muted/10">
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              cropShape="rect"
              showGrid={true}
              objectFit="contain"
              style={{
                containerStyle: { background: "hsl(var(--muted) / 0.15)" },
                cropAreaStyle: { border: "2px solid hsl(var(--primary) / 0.5)" },
              }}
            />
          </div>

          <div className="shrink-0 bg-background border-t border-border/10 px-4 pt-3 pb-5 space-y-3">
            <div className="flex items-center justify-center gap-1.5">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.label}
                  onClick={() => setAspect(ar.value)}
                  className={`h-9 px-5 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                    aspect === ar.value
                      ? "bg-foreground text-background shadow-md"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border/10"
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground hover:bg-muted/50 active:scale-95 transition-all">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <input
                type="range" min={1} max={3} step={0.05} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 max-w-[120px] h-1 bg-border/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow"
              />
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground hover:bg-muted/50 active:scale-95 transition-all">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border/20" />
              <button onClick={() => setRotation((r) => (r + 90) % 360)} className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground hover:bg-muted/50 active:scale-95 transition-all">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════ TELA PRINCIPAL — Imagem + Legenda ═══════ */}
      <motion.div
        key="main-post"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[110] bg-background flex flex-col pt-[env(safe-area-inset-top)]"
      >
        {/* Header — Voltar | Título | Publicar */}
        <div className="flex items-center justify-between h-12 px-4 shrink-0 border-b border-border/10">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all"
          >
            <CurvedBackArrow />
          </button>
          <p className="text-[14px] font-bold text-foreground tracking-tight">Nova publicação</p>
          <button
            onClick={() => onPublish(caption)}
            disabled={publishing}
            className="text-[13px] font-bold text-primary hover:text-primary/80 active:scale-95 transition-all px-1 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publicar"}
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-auto">
          {/* Imagem com botão de editar no canto */}
          <div className="relative w-full aspect-square bg-muted/5 overflow-hidden">
            <img
              src={displayImage}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            {/* Ícone de editar — canto inferior direito da imagem */}
            <button
              onClick={() => setShowCropEditor(true)}
              className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-foreground/90 hover:bg-black/70 active:scale-90 transition-all shadow-lg"
              aria-label="Editar imagem"
            >
              <Crop className="w-4 h-4" />
            </button>
          </div>

          {/* Área de legenda */}
          <div className="px-4 pt-4 space-y-3">
            {/* Campo de texto com botão IA integrado */}
            <div className="relative">
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escreva uma legenda..."
                className="min-h-[88px] pr-12 bg-muted/5 border border-border/15 rounded-xl text-foreground placeholder:text-muted-foreground/40 text-[14px] resize-none px-4 py-3 focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:border-primary/30 transition-all leading-relaxed"
                maxLength={300}
                autoFocus
              />
              {/* Botão IA — canto inferior direito do campo */}
              <div className="absolute bottom-2.5 right-2.5">
                <AICaptionEnhancer
                  caption={caption}
                  imageUrl={displayImage}
                  onSelect={(text) => setCaption(text)}
                />
              </div>
              {/* Contador */}
              <span className={`absolute bottom-2.5 left-4 text-[10px] font-medium tabular-nums ${
                caption.length > 250 ? "text-destructive/60" : "text-muted-foreground/25"
              }`}>
                {caption.length}/300
              </span>
            </div>

            {/* Hashtags rápidas */}
            <div className="flex items-center gap-2 pt-3 overflow-x-auto no-scrollbar">
              {["#barber", "#fade", "#barbershop", "#hairstyle"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => setCaption(prev => prev.trim() ? `${prev.trim()} ${tag}` : tag)}
                  className="shrink-0 h-8 px-3 rounded-full text-[11px] font-medium border border-border/10 text-muted-foreground/50 hover:text-primary hover:bg-primary/5 hover:border-primary/20 active:scale-95 transition-all"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════════════════════════
   IMAGE DETAIL VIEW
   ══════════════════════════════════════════════════════════ */
function ImageDetailView({
  image,
  onClose,
  onDelete,
  deleting,
}: {
  image: PortfolioImage;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background flex flex-col pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center justify-between h-12 px-4 border-b border-border/10 shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all">
          <CurvedBackArrow />
        </button>
        <span className="text-[14px] font-bold text-foreground tracking-tight">Publicação</span>
        <button onClick={onDelete} disabled={deleting} className="w-9 h-9 rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 active:scale-95 transition-all">
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <motion.img
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          src={image.image_url}
          alt={image.caption || "Corte"}
          className="w-full aspect-square object-cover"
        />
        <div className="px-5 pt-5 pb-8">
          {image.caption && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-3.5 rounded-full bg-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Legenda</span>
              </div>
              <p className="text-[14px] text-foreground leading-relaxed pl-3">{image.caption}</p>
            </div>
          )}
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground/50">
            <div className="w-1 h-1 rounded-full bg-muted-foreground/25" />
            {new Date(image.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   PORTFOLIO MANAGER — Grid Instagram
   ══════════════════════════════════════════════════════════ */
export function PortfolioManager({
  barbeiroId,
  tenantId,
  title = "Meu Portfólio",
  showBack = false,
  onBack,
}: PortfolioManagerProps) {
  const [images, setImages] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<PortfolioImage | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("portfolio_images")
        .select("id, barbeiro_id, tenant_id, image_url, caption, ordem, created_at, updated_at")
        .eq("barbeiro_id", barbeiroId)
        .order("created_at", { ascending: false });
      if (!error && data) setImages(data as PortfolioImage[]);
    } catch (err) {
      console.error("Erro ao carregar portfólio:", err);
    } finally {
      setLoading(false);
    }
  }, [barbeiroId]);

  useEffect(() => {
    loadImages();
    const channel = supabase
      .channel(`portfolio-${barbeiroId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_images", filter: `barbeiro_id=eq.${barbeiroId}` }, () => loadImages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [barbeiroId, loadImages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); e.target.value = ""; return; }
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); e.target.value = ""; return; }
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setShowNewPost(true);
    e.target.value = "";
  };

  const handlePublish = async (caption: string) => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const ext = pendingFile.name.split(".").pop() || "jpg";
      const path = `${barbeiroId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: storageError } = await supabase.storage.from("portfolio").upload(path, pendingFile, { contentType: pendingFile.type });
      if (storageError) { toast.error("Erro ao enviar imagem"); return; }
      const { data: publicUrl } = supabase.storage.from("portfolio").getPublicUrl(path);
      const { error: dbError } = await supabase.from("portfolio_images").insert({
        barbeiro_id: barbeiroId, tenant_id: tenantId || null,
        image_url: publicUrl.publicUrl, caption: caption.trim() || null, ordem: 0,
      });
      if (dbError) { toast.error("Erro ao salvar"); return; }
      toast.success("Publicação criada! 🔥");
      closeNewPost();
      loadImages();
    } catch { toast.error("Erro inesperado"); } finally { setUploading(false); }
  };

  const closeNewPost = () => {
    setShowNewPost(false);
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
  };

  const handleDelete = async (image: PortfolioImage) => {
    setDeletingId(image.id);
    try {
      const url = new URL(image.image_url);
      const storagePath = url.pathname.split("/portfolio/")[1];
      if (storagePath) await supabase.storage.from("portfolio").remove([decodeURIComponent(storagePath)]);
      const { error } = await supabase.from("portfolio_images").delete().eq("id", image.id);
      if (error) throw error;
      toast.success("Removida");
      if (previewImage?.id === image.id) setPreviewImage(null);
      loadImages();
    } catch { toast.error("Erro ao remover"); } finally { setDeletingId(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/15">
        <div className="flex items-center h-[52px] px-4">
          {showBack && onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all mr-3" aria-label="Voltar">
              <CurvedBackArrow />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-bold text-foreground tracking-tight leading-tight">{title}</h1>
          </div>
          <span className="text-[12px] text-muted-foreground font-medium tabular-nums ml-3">
            {images.length} {images.length === 1 ? "post" : "posts"}
          </span>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

      {/* Empty State */}
      {images.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center py-12 px-6">
          <ImageIcon className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
          <p className="text-[15px] font-semibold text-muted-foreground">
            Nenhuma foto no portfólio.
          </p>
          <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[260px] leading-relaxed">
            Adicione fotos dos seus melhores cortes. Clientes veem o portfólio na sua página de agendamento.
          </p>
        </motion.div>
      )}

      {/* Grid */}
      {images.length > 0 && (
        <div className="pt-3 px-3">
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {images.map((img, idx) => (
                <motion.div key={img.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3, delay: idx * 0.03 }} className="relative aspect-[4/5] bg-muted rounded-xl cursor-pointer overflow-hidden group shadow-sm" onClick={() => setPreviewImage(img)}>
                  <img src={img.image_url} alt={img.caption || "Corte"} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* FAB */}
      <div className="fixed bottom-6 left-5 right-5 z-30">
        <button onClick={() => fileInputRef.current?.click()} className="w-full h-[52px] rounded-2xl bg-foreground text-background font-semibold text-[14px] flex items-center justify-center gap-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:opacity-90 active:scale-[0.98] transition-all duration-200">
          <Plus className="w-5 h-5" strokeWidth={2.2} />
          Adicionar publicação
        </button>
      </div>

      <NewPostFlow open={showNewPost} onClose={closeNewPost} previewUrl={pendingPreview} onPublish={handlePublish} publishing={uploading} />

      <AnimatePresence>
        {previewImage && (
          <ImageDetailView image={previewImage} onClose={() => setPreviewImage(null)} onDelete={() => handleDelete(previewImage)} deleting={deletingId === previewImage.id} />
        )}
      </AnimatePresence>
    </div>
  );
}
