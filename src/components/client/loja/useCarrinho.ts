import { useState, useCallback, useMemo } from "react";

/**
 * Item no carrinho de compras da loja.
 */
export interface ItemCarrinho {
  produto_id: string;
  nome: string;
  preco: number;
  emoji: string;
  imagem_url?: string;
  quantidade: number;
  estoque_disponivel: number;
}

/**
 * Hook de estado do carrinho — memória pura, sem persistência.
 * Instanciar no nível de Cliente.tsx para manter estado entre abas.
 */
export function useCarrinho() {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);

  const totalItens = useMemo(
    () => itens.reduce((acc, item) => acc + item.quantidade, 0),
    [itens]
  );

  const totalValor = useMemo(
    () => itens.reduce((acc, item) => acc + item.preco * item.quantidade, 0),
    [itens]
  );

  const adicionarItem = useCallback(
    (produto: Omit<ItemCarrinho, "quantidade">, quantidade = 1) => {
      setItens((prev) => {
        const existing = prev.find((i) => i.produto_id === produto.produto_id);
        if (existing) {
          // Não ultrapassar estoque
          const novaQtd = Math.min(
            existing.quantidade + quantidade,
            produto.estoque_disponivel
          );
          return prev.map((i) =>
            i.produto_id === produto.produto_id
              ? { ...i, quantidade: novaQtd }
              : i
          );
        }
        return [
          ...prev,
          { ...produto, quantidade: Math.min(quantidade, produto.estoque_disponivel) },
        ];
      });
    },
    []
  );

  const removerItem = useCallback((produto_id: string) => {
    setItens((prev) => prev.filter((i) => i.produto_id !== produto_id));
  }, []);

  const alterarQuantidade = useCallback(
    (produto_id: string, delta: -1 | 1) => {
      setItens((prev) =>
        prev
          .map((i) => {
            if (i.produto_id !== produto_id) return i;
            const novaQtd = i.quantidade + delta;
            if (novaQtd <= 0) return null as any;
            return {
              ...i,
              quantidade: Math.min(novaQtd, i.estoque_disponivel),
            };
          })
          .filter(Boolean)
      );
    },
    []
  );

  const limparCarrinho = useCallback(() => {
    setItens([]);
  }, []);

  return {
    itens,
    totalItens,
    totalValor,
    adicionarItem,
    removerItem,
    alterarQuantidade,
    limparCarrinho,
  };
}
