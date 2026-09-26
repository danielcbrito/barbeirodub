import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, ShoppingCart, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ProdutoCard } from "./ProdutoCard";
import { ProdutoDetalheSheet } from "./ProdutoDetalheSheet";
import type { useCarrinho } from "./useCarrinho";

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

interface ClienteLojaProps {
  tenantId: string;
  clienteId: string;
  carrinho: ReturnType<typeof useCarrinho>;
}

/**
 * Vitrine de produtos — visão do cliente.
 * Grid 2 colunas com filtro por categoria e carrinho flutuante.
 */
export function ClienteLoja({ tenantId, clienteId, carrinho }: ClienteLojaProps) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todos");
  const [produtoDetalhe, setProdutoDetalhe] = useState<any | null>(null);

  // Buscar produtos ativos via query direta (RPC pode não existir ainda)
  const { data: produtos, isLoading } = useQuery({
    queryKey: QUERY_KEYS.loja.produtos(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("destaque", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 120_000,
  });

  // Categorias distintas
  const categorias = useMemo(() => {
    if (!produtos) return [];
    const set = new Set(produtos.map((p: any) => p.categoria as string));
    return ["Todos", ...Array.from(set).sort()];
  }, [produtos]);

  // Filtrar por categoria
  const produtosFiltrados = useMemo(() => {
    if (!produtos) return [];
    if (categoriaSelecionada === "Todos") return produtos;
    return produtos.filter((p: any) => p.categoria === categoriaSelecionada);
  }, [produtos, categoriaSelecionada]);

  const getEmoji = (categoria: string) => CATEGORY_EMOJI[categoria] || "📦";

  const handleAddCarrinho = (produto: any) => {
    carrinho.adicionarItem({
      produto_id: produto.id,
      nome: produto.nome,
      preco: Number(produto.preco),
      emoji: getEmoji(produto.categoria),
      imagem_url: produto.imagens?.[0] || undefined,
      estoque_disponivel: produto.estoque,
    });
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          Produtos
        </h2>
        {carrinho.totalItens > 0 && (
          <Badge variant="destructive" className="h-6 min-w-[24px] px-2 text-xs font-bold">
            {carrinho.totalItens}
          </Badge>
        )}
      </div>

      {/* Chips de categoria — scroll horizontal */}
      {categorias.length > 1 && (
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaSelecionada(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
                  categoriaSelecionada === cat
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="h-0" />
        </ScrollArea>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {!isLoading && produtosFiltrados.length === 0 && (
        <div className="text-center py-12">
          <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum produto disponível no momento
          </p>
        </div>
      )}

      {/* Grid de produtos */}
      {!isLoading && produtosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {produtosFiltrados.map((produto: any, index: number) => (
              <motion.div
                key={produto.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                layout
              >
                <ProdutoCard
                  produto={produto}
                  emoji={getEmoji(produto.categoria)}
                  onTap={() => setProdutoDetalhe(produto)}
                  onAddCarrinho={() => handleAddCarrinho(produto)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Barra flutuante do carrinho */}
      <AnimatePresence>
        {carrinho.totalItens > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="sticky bottom-0 left-0 right-0 z-40"
          >
            <div className="bg-card border border-border/50 rounded-xl p-3 flex items-center justify-between shadow-lg mx-1">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {carrinho.totalItens} {carrinho.totalItens === 1 ? "item" : "itens"} — R${" "}
                  {carrinho.totalValor.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <Button size="sm" className="gap-1 text-xs">
                Ver carrinho
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet de detalhe do produto */}
      <ProdutoDetalheSheet
        produto={produtoDetalhe}
        open={!!produtoDetalhe}
        onOpenChange={(open) => !open && setProdutoDetalhe(null)}
        onAddCarrinho={(produto, qtd) => {
          carrinho.adicionarItem(
            {
              produto_id: produto.id,
              nome: produto.nome,
              preco: Number(produto.preco),
              emoji: getEmoji(produto.categoria),
              imagem_url: produto.imagens?.[0] || undefined,
              estoque_disponivel: produto.estoque,
            },
            qtd
          );
        }}
      />
    </div>
  );
}
