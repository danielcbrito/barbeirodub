import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Star } from "lucide-react";

interface ProdutoCardProps {
  produto: any;
  onEdit?: (produto: any) => void;
  onToggleAtivo?: () => void;
  onExcluir?: () => void;
  /** Modo somente leitura — oculta controles de edição */
  readOnly?: boolean;
  /** Permite exclusão de produto (default true). Se false, oculta botão lixeira */
  canDelete?: boolean;
}

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

/**
 * Card individual de produto no grid admin.
 * Exibe foto, nome, categoria, preço, estoque e controles.
 */
export function ProdutoCard({ produto, onEdit, onToggleAtivo, onExcluir, readOnly = false, canDelete = true }: ProdutoCardProps) {
  const imagens = produto.imagens || [];
  const emoji = CATEGORY_EMOJI[produto.categoria] || "📦";

  // Badge de estoque
  const renderEstoqueBadge = () => {
    if (produto.estoque === 0) {
      return (
        <Badge variant="destructive" className="text-[10px] px-1.5">
          Sem estoque
        </Badge>
      );
    }
    if (produto.estoque <= produto.estoque_minimo) {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5">
          Estoque baixo ({produto.estoque})
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5">
        Em estoque ({produto.estoque})
      </Badge>
    );
  };

  return (
    <Card className="overflow-hidden border-border/50 bg-card hover:bg-card-elevated transition-all duration-300 group flex flex-col">
      {/* Imagem ou emoji placeholder */}
      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {imagens.length > 0 ? (
          <img
            src={imagens[0]}
            alt={produto.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <span className="text-5xl select-none">{emoji}</span>
        )}

        {/* Badge destaque */}
        {produto.destaque && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-amber-500/90 text-foreground gap-1 text-[10px]">
              <Star className="h-3 w-3" fill="currentColor" />
              Destaque
            </Badge>
          </div>
        )}

        {/* Opacity overlay se inativo */}
        {!produto.ativo && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground bg-background/80 px-2 py-1 rounded">
              Inativo
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        <h3 className="font-medium text-sm text-foreground truncate" title={produto.nome}>
          {produto.nome}
        </h3>

        <p className="text-xs text-muted-foreground truncate">{produto.categoria}</p>

        {/* Preço */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-amber-400">
            R$ {Number(produto.preco).toFixed(2).replace(".", ",")}
          </span>
          {produto.preco_original && Number(produto.preco_original) > Number(produto.preco) && (
            <span className="text-xs text-muted-foreground line-through">
              R$ {Number(produto.preco_original).toFixed(2).replace(".", ",")}
            </span>
          )}
        </div>

        {/* Estoque badge */}
        {renderEstoqueBadge()}

        {/* Controles — ocultos no modo somente leitura */}
        {!readOnly && (
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={produto.ativo}
                onCheckedChange={onToggleAtivo}
                className="scale-75"
              />
              <span className="text-[10px] text-muted-foreground">
                {produto.ativo ? "Ativo" : "Inativo"}
              </span>
            </div>

            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit?.(produto)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={onExcluir}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
