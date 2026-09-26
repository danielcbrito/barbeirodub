import { useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, ShoppingCart, Star } from "lucide-react";
import { toast } from "sonner";

/** Emoji placeholder por categoria */
const CATEGORY_EMOJI: Record<string, string> = {
  "Pomadas e finalizadores": "🪮",
  "Shampoos e condicionadores": "🧴",
  "Óleos e séruns": "💧",
  "Acessórios": "✂️",
  "Lâminas e navalhas": "🪒",
  "Perfumaria": "🌸",
  "Merchandising": "👕",
  "Outros": "📦",
};

interface ProdutoDetalheSheetProps {
  produto: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCarrinho: (produto: any, quantidade: number) => void;
}

/**
 * Bottom sheet com detalhes do produto e controle de quantidade.
 */
export function ProdutoDetalheSheet({
  produto,
  open,
  onOpenChange,
  onAddCarrinho,
}: ProdutoDetalheSheetProps) {
  const [quantidade, setQuantidade] = useState(1);

  // Reset quantidade ao abrir
  const handleOpenChange = (value: boolean) => {
    if (value) setQuantidade(1);
    onOpenChange(value);
  };

  if (!produto) return null;

  const imagens = produto.imagens || [];
  const emoji = CATEGORY_EMOJI[produto.categoria] || "📦";
  const semEstoque = produto.estoque === 0;
  const estoqueMax = produto.estoque || 0;

  const handleAdd = () => {
    onAddCarrinho(produto, quantidade);
    toast.success("Adicionado ao carrinho!");
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="overflow-y-auto">
          {/* Foto / Emoji */}
          <div className="h-[200px] bg-muted flex items-center justify-center overflow-hidden">
            {imagens.length > 0 ? (
              <img
                src={imagens[0]}
                alt={produto.nome}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-7xl select-none">{emoji}</span>
            )}
          </div>

          {/* Conteúdo */}
          <div className="px-4 py-4 space-y-4">
            {/* Nome */}
            <h2 className="text-lg font-medium text-foreground">{produto.nome}</h2>

            {/* Preço */}
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-amber-400">
                R$ {Number(produto.preco).toFixed(2).replace(".", ",")}
              </span>
              {produto.preco_original &&
                Number(produto.preco_original) > Number(produto.preco) && (
                  <span className="text-sm text-muted-foreground line-through">
                    R$ {Number(produto.preco_original).toFixed(2).replace(".", ",")}
                  </span>
                )}
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {produto.categoria}
              </Badge>
              {produto.destaque && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs gap-1">
                  <Star className="h-3 w-3" fill="currentColor" />
                  Destaque
                </Badge>
              )}
            </div>

            {/* Descrição */}
            {produto.descricao && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {produto.descricao}
              </p>
            )}

            {/* Divisória */}
            <div className="border-t border-border" />

            {/* Controle de quantidade */}
            {semEstoque ? (
              <p className="text-sm text-destructive font-medium text-center py-2">
                Produto sem estoque no momento
              </p>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Minus className="h-4 w-4 text-foreground" />
                </button>
                <span className="text-lg font-bold text-foreground w-8 text-center">
                  {quantidade}
                </span>
                <button
                  onClick={() =>
                    setQuantidade((q) => Math.min(estoqueMax, q + 1))
                  }
                  className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Plus className="h-4 w-4 text-foreground" />
                </button>
              </div>
            )}

            {/* Botão adicionar */}
            <Button
              onClick={handleAdd}
              disabled={semEstoque}
              className="w-full gap-2"
              size="lg"
            >
              <ShoppingCart className="h-4 w-4" />
              {semEstoque ? "Sem estoque" : "Adicionar ao carrinho"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
