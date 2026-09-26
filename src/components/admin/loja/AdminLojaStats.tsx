import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Package, AlertTriangle, ShoppingCart, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminLojaStatsProps {
  tenantId: string;
}

/**
 * 4 cards de KPI da Loja:
 * Produtos ativos · Estoque baixo · Pedidos hoje · Receita hoje
 */
export function AdminLojaStats({ tenantId }: AdminLojaStatsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: QUERY_KEYS.loja.stats(tenantId),
    queryFn: async () => {
      // Produtos ativos
      const { count: produtosAtivos } = await supabase
        .from("produtos")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("ativo", true);

      // Estoque baixo (estoque <= estoque_minimo AND estoque > 0)
      const { data: lowStock } = await supabase
        .from("produtos")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .gt("estoque", 0)
        .filter("estoque", "lte", "estoque_minimo");

      // Sem estoque
      const { count: semEstoque } = await supabase
        .from("produtos")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .eq("estoque", 0);

      // Pedidos hoje
      const today = new Date().toISOString().split("T")[0];
      const { count: pedidosHoje } = await supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      // Receita hoje (pedidos pagos)
      const { data: receitaData } = await supabase
        .from("pedidos")
        .select("total")
        .eq("tenant_id", tenantId)
        .eq("status", "paid")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      const receitaHoje = (receitaData || []).reduce(
        (acc, p) => acc + Number(p.total || 0),
        0
      );

      const estoqueBaixoCount = (lowStock?.length || 0) + (semEstoque || 0);

      return {
        produtosAtivos: produtosAtivos || 0,
        estoqueBaixo: estoqueBaixoCount,
        pedidosHoje: pedidosHoje || 0,
        receitaHoje,
      };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Produtos ativos",
      value: stats?.produtosAtivos || 0,
      icon: Package,
      color: "text-primary",
    },
    {
      label: "Estoque baixo",
      value: stats?.estoqueBaixo || 0,
      icon: AlertTriangle,
      color: stats?.estoqueBaixo ? "text-yellow-500" : "text-muted-foreground",
    },
    {
      label: "Pedidos hoje",
      value: stats?.pedidosHoje || 0,
      icon: ShoppingCart,
      color: "text-primary",
    },
    {
      label: "Receita hoje",
      value: `R$ ${(stats?.receitaHoje || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      })}`,
      icon: DollarSign,
      color: "text-emerald-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="p-4 border-border/50 bg-card hover:bg-card-elevated transition-colors duration-200"
        >
          <div className="flex items-center gap-2 mb-1">
            <card.icon className={`h-4 w-4 ${card.color}`} />
            <span className="text-xs text-muted-foreground">{card.label}</span>
          </div>
          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
        </Card>
      ))}
    </div>
  );
}
