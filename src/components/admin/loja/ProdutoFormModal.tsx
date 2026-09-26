import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCroppedImage, type CroppedArea } from "@/lib/cropImage";
import Cropper from "react-easy-crop";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Camera, X, Loader2 } from "lucide-react";

/** Categorias padrão */
const CATEGORIAS = [
  "Pomadas e finalizadores",
  "Shampoos e condicionadores",
  "Óleos e séruns",
  "Acessórios",
  "Lâminas e navalhas",
  "Perfumaria",
  "Merchandising",
  "Outros",
];

/** Schema de validação */
const produtoSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório").max(100),
  descricao: z.string().max(500).optional().or(z.literal("")),
  preco: z.coerce.number().min(0, "Preço inválido"),
  preco_original: z.coerce.number().min(0).optional().nullable(),
  estoque: z.coerce.number().int().min(0, "Estoque inválido"),
  estoque_minimo: z.coerce.number().int().min(0).default(5),
  categoria: z.string().min(1, "Categoria obrigatória"),
  ativo: z.boolean().default(true),
  destaque: z.boolean().default(false),
});

type ProdutoFormValues = z.infer<typeof produtoSchema>;

interface ProdutoFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  produto?: any | null;
}

/**
 * Drawer (mobile) ou Dialog (desktop) para criar/editar produto.
 * Inclui upload de até 3 fotos com crop 1:1.
 */
export function ProdutoFormModal({
  open,
  onOpenChange,
  tenantId,
  produto,
}: ProdutoFormModalProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const isEditing = !!produto;

  // Estado de imagens
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedArea | null>(null);

  const form = useForm<ProdutoFormValues>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      nome: "",
      descricao: "",
      preco: 0,
      preco_original: null,
      estoque: 0,
      estoque_minimo: 5,
      categoria: "Outros",
      ativo: true,
      destaque: false,
    },
  });

  // Preencher valores ao editar
  useEffect(() => {
    if (produto) {
      form.reset({
        nome: produto.nome || "",
        descricao: produto.descricao || "",
        preco: Number(produto.preco) || 0,
        preco_original: produto.preco_original ? Number(produto.preco_original) : null,
        estoque: produto.estoque || 0,
        estoque_minimo: produto.estoque_minimo || 5,
        categoria: produto.categoria || "Outros",
        ativo: produto.ativo ?? true,
        destaque: produto.destaque ?? false,
      });
      setImageUrls(produto.imagens || []);
    } else {
      form.reset({
        nome: "",
        descricao: "",
        preco: 0,
        preco_original: null,
        estoque: 0,
        estoque_minimo: 5,
        categoria: "Outros",
        ativo: true,
        destaque: false,
      });
      setImageUrls([]);
    }
  }, [produto, open]);

  // Crop callbacks
  const onCropComplete = useCallback((_: any, croppedArea: CroppedArea) => {
    setCroppedAreaPixels(croppedArea);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropConfirm = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    try {
      setUploading(true);
      const blob = await getCroppedImage(cropSrc, croppedAreaPixels, "image/webp", 0.85);
      const idx = imageUrls.length;
      const prodId = produto?.id || "novo";
      const path = `${tenantId}/${prodId}/foto-${idx + 1}-${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from("produto-fotos")
        .upload(path, blob, { contentType: "image/webp", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("produto-fotos")
        .getPublicUrl(path);

      setImageUrls((prev) => [...prev, publicUrl.publicUrl]);
      setCropSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch (err) {
      console.error("Erro no upload:", err);
      toast.error("Erro ao fazer upload da foto");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  // Mutation criar/editar
  const mutation = useMutation({
    mutationFn: async (values: ProdutoFormValues) => {
      if (isEditing) {
        const { error } = await supabase
          .from("produtos")
          .update({
            nome: values.nome,
            descricao: values.descricao || null,
            preco: values.preco,
            preco_original: values.preco_original || null,
            estoque: values.estoque,
            estoque_minimo: values.estoque_minimo,
            categoria: values.categoria,
            ativo: values.ativo,
            destaque: values.destaque,
            imagens: imageUrls,
          })
          .eq("id", produto.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("produtos")
          .insert({
            tenant_id: tenantId,
            nome: values.nome,
            descricao: values.descricao || null,
            preco: values.preco,
            preco_original: values.preco_original || null,
            estoque: values.estoque,
            estoque_minimo: values.estoque_minimo,
            categoria: values.categoria,
            ativo: values.ativo,
            destaque: values.destaque,
            imagens: imageUrls,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Produto atualizado!" : "Produto criado!");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.produtosAdmin(tenantId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.stats(tenantId) });
      onOpenChange(false);
    },
    onError: (err) => {
      console.error("Erro ao salvar produto:", err);
      toast.error("Erro ao salvar produto. Tente novamente.");
    },
  });

  const onSubmit = (values: ProdutoFormValues) => {
    mutation.mutate(values);
  };

  // ─── Conteúdo do formulário ───
  const formContent = (
    <ScrollArea className="max-h-[70vh] pr-2">
      {/* Crop overlay */}
      {cropSrc && (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-4 bg-black">
          <Cropper
            image={cropSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-10">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setCropSrc(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCropConfirm}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
        </div>
      )}

      {/* Preview de imagens */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {imageUrls.map((url, idx) => (
          <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
            >
              <X className="h-3 w-3 text-foreground" />
            </button>
          </div>
        ))}

        {imageUrls.length < 3 && !cropSrc && (
          <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
            <Camera className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-[9px] text-muted-foreground">Adicionar</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="produto-form">
          {/* Nome */}
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Pomada modeladora" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Categoria */}
          <FormField
            control={form.control}
            name="categoria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORIAS.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Descrição */}
          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descrição opcional do produto..."
                    rows={3}
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Preço + Preço original */}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="preco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço (R$) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="preco_original"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço original</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Riscado"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Estoque + Mínimo */}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="estoque"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estoque *</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="estoque_minimo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estoque mínimo</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Toggles */}
          <div className="flex gap-6 pt-2">
            <FormField
              control={form.control}
              name="ativo"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <Label className="text-sm">Ativo</Label>
                </div>
              )}
            />
            <FormField
              control={form.control}
              name="destaque"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <Label className="text-sm">Destaque</Label>
                </div>
              )}
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-4"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Salvar alterações" : "Criar produto"}
          </Button>
        </form>
      </Form>
    </ScrollArea>
  );

  const title = isEditing ? "Editar produto" : "Novo produto";

  // ─── Renderização: Drawer (mobile) ou Dialog (desktop) ───
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          {formContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
