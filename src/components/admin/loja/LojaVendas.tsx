import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ShoppingCart, TrendingUp, Package } from "lucide-react";

interface LojaVendasProps {
  tenantId: string;
}

const PERIODOS = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
];

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/**
 * Métricas de vendas da loja: receita, pedidos, ticket médio e ranking de produtos.
 */
export function LojaVendas({ tenantId }: LojaVendasProps) {
  const [periodo, setPeriodo] = useState("30");

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.loja.vendas(tenantId, periodo),
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(periodo));

      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select("id, status, total, desconto, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", desde.toISOString());
      if (error) throw error;

      const pagos = (pedidos || []).filter((p: any) => ["paid", "preparing", "ready", "completed", "delivered"].includes(p.status));
      const receita = pagos.reduce((acc: number, p: any) => acc + Number(p.total || 0), 0);
      const descontos = pagos.reduce((acc: number, p: any) => acc + Number(p.desconto || 0), 0);
      const ticket = pagos.length ? receita / pagos.length : 0;

      const ids = pagos.map((p: any) => p.id);
      let topProdutos: { nome: string; qtd: number; total: number }[] = [];
      if (ids.length) {
        const { data: itens } = await supabase
          .from("pedido_itens")
          .select("nome_produto, quantidade, subtotal, pedido_id")
          .in("pedido_id", ids);
        const map = new Map<string, { nome: string; qtd: number; total: number }>();
        (itens || []).forEach((i: any) => {
          const nome = i.nome_produto || "Produto";
          const cur = map.get(nome) || { nome, qtd: 0, total: 0 };
          cur.qtd += Number(i.quantidade || 0);
          cur.total += Number(i.subtotal || 0);
          map.set(nome, cur);
        });
        topProdutos = Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
      }

      return {
        receita,
        descontos,
        ticket,
        pedidosPagos: pagos.length,
        pedidosTotal: (pedidos || []).length,
        topProdutos,
      };
    },
    staleTime: 60_000,
  });

  const kpis = useMemo(
    () => [
      { icon: DollarSign, label: "Receita", value: brl(data?.receita || 0) },
      { icon: ShoppingCart, label: "Pedidos pagos", value: String(data?.pedidosPagos || 0) },
      { icon: TrendingUp, label: "Ticket médio", value: brl(data?.ticket || 0) },
      { icon: Package, label: "Descontos", value: brl(data?.descontos || 0) },
    ],
    [data]
  );

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="flex gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              periodo === p.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <Card key={k.label} className="p-4">
              <k.icon className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{k.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Ranking */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Produtos mais vendidos</h3>
        {isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : !data?.topProdutos.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma venda no período selecionado.
          </p>
        ) : (
          <div className="space-y-3">
            {data.topProdutos.map((p, i) => (
              <div key={p.nome} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">{p.qtd} un.</p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground shrink-0">{brl(p.total)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
