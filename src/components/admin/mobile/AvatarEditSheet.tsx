import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Check, X, ZoomIn, ZoomOut } from "lucide-react";
import Cropper, { Area } from "react-easy-crop";

interface AvatarEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  initials: string;
  storagePath?: string;
  /** Arquivo selecionado da galeria — carregado automaticamente ao abrir */
  selectedFile: File | null;
  onAvatarUpdated: (newUrl: string | null) => void;
}

/**
 * Sheet de recorte circular de foto de perfil.
 * Recebe o arquivo já selecionado e exibe o cropper.
 */
export function AvatarEditSheet({
  open,
  onOpenChange,
  userId,
  initials,
  storagePath = "admins",
  selectedFile,
  onAvatarUpdated,
}: AvatarEditSheetProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);

  // Carregar imagem quando o arquivo é recebido
  useEffect(() => {
    if (selectedFile && open) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      };
      reader.readAsDataURL(selectedFile);
    }
  }, [selectedFile, open]);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels || !userId) return;

    setUploading(true);
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (!croppedBlob) throw new Error("Falha ao recortar imagem");

      const fileName = `${storagePath.replace("/", "-")}-${userId}-${Date.now()}.webp`;
      const filePath = `${storagePath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, { upsert: true, contentType: "image/webp" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Atualizar avatar no profiles
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Se for barbeiro, atualizar também foto_url na tabela barbeiros
      // para que a foto apareça corretamente no app do cliente
      if (storagePath === "barbeiros") {
        const { error: barberError } = await supabase
          .from("barbeiros")
          .update({ foto_url: publicUrl })
          .eq("user_id", userId);

        if (barberError) {
          console.error("Erro ao atualizar foto do barbeiro:", barberError);
          // Não bloqueia o fluxo, mas avisa
          toast.error("Foto salva no perfil, mas houve erro ao sincronizar com o app do cliente");
        }
      }

      onAvatarUpdated(publicUrl);
      toast.success("Foto atualizada!");
      handleClose();
    } catch (error: any) {
      console.error("Erro ao salvar foto:", error);
      toast.error(error.message || "Erro ao atualizar foto");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-t border-border/50 bg-background p-0 h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-[15px] font-semibold text-foreground">Ajustar foto</p>
          <button
            onClick={handleSave}
            disabled={uploading || !imageSrc}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Cropper Area */}
        <div className="flex-1 relative bg-black/90 mx-4 rounded-2xl overflow-hidden mb-4">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div className="px-8 pb-8 flex items-center gap-4">
          <ZoomOut className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1 accent-primary bg-muted-foreground/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
          />
          <ZoomIn className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Utilitário: recortar imagem via Canvas ─── */

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Tamanho final do avatar (512x512 para boa qualidade)
  const size = 512;
  canvas.width = size;
  canvas.height = size;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/webp",
      0.9
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
    image.src = url;
  });
}