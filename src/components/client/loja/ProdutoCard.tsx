import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Check, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProdutoCardProps {
  produto: any;
  emoji: string;
  onTap: () => void;
  onAddCarrinho: () => void;
}

/**
 * Card compacto de produto para vitrine do cliente.
 * 2 por linha, foto/emoji + nome + preço + botão "+".
 */
export function ProdutoCard({ produto, emoji, onTap, onAddCarrinho }: ProdutoCardProps) {
  const [added, setAdded] = useState(false);
  const imagens = produto.imagens || [];
  const semEstoque = produto.estoque === 0;

  const handleAdd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (semEstoque) return;
      onAddCarrinho();
      setAdded(true);
      setTimeout(() => setAdded(false), 1000);
    },
    [onAddCarrinho, semEstoque]
  );

  return (
    <div
      onClick={onTap}
      className="relative bg-card border border-border/40 rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-150"
    >
      {/* Imagem / Emoji */}
      <div className="relative h-[110px] bg-muted flex items-center justify-center overflow-hidden">
        {imagens.length > 0 ? (
          <img
            src={imagens[0]}
            alt={produto.nome}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-4xl select-none">{emoji}</span>
        )}

        {/* Overlay sem estoque */}
        {semEstoque && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-destructive bg-background/80 px-2 py-0.5 rounded">
              Sem estoque
            </span>
          </div>
        )}

        {/* Badge destaque */}
        {produto.destaque && (
          <div className="absolute top-1.5 left-1.5">
            <Badge className="bg-amber-500/90 text-foreground gap-0.5 text-[9px] px-1.5 py-0">
              <Star className="h-2.5 w-2.5" fill="currentColor" />
              Destaque
            </Badge>
          </div>
        )}
      </div>

      {/* Corpo */}
      <div className="p-2.5 space-y-1">
        <p className="text-[13px] font-medium text-foreground leading-tight line-clamp-2">
          {produto.nome}
        </p>

        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold text-amber-400">
            R$ {Number(produto.preco).toFixed(2).replace(".", ",")}
          </span>
          {produto.preco_original &&
            Number(produto.preco_original) > Number(produto.preco) && (
              <span className="text-[11px] text-muted-foreground line-through">
                R$ {Number(produto.preco_original).toFixed(2).replace(".", ",")}
              </span>
            )}
        </div>
      </div>

      {/* Botão "+" */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={handleAdd}
        disabled={semEstoque}
        className={`absolute bottom-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300 ${
          semEstoque
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : added
            ? "bg-emerald-500 text-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {added ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </motion.button>
    </div>
  );
}
