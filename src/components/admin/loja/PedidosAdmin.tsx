import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { PedidoCard } from "./PedidoCard";
import { PedidoDetalheSheet } from "./PedidoDetalheSheet";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { ClipboardList, Package, DollarSign, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface PedidosAdminProps {
  tenantId: string;
  /** Modo somente leitura — oculta ações no detalhe do pedido */
  readOnly?: boolean;
  /** Exibe anotações internas no detalhe do pedido (default true) */
  showAdminNotes?: boolean;
}

/** Status filter chips */
const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending_payment", label: "Aguardando pgto" },
  { value: "paid", label: "Pago" },
  { value: "preparing", label: "Em separação" },
  { value: "ready_pickup", label: "Pronto" },
  { value: "picked_up", label: "Retirado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

/**
 * Gestão completa de pedidos da loja — tab "Pedidos" no AdminLoja.
 * Realtime + som de notificação em novos pedidos.
 */
export function PedidosAdmin({ tenantId, readOnly = false, showAdminNotes = true }: PedidosAdminProps) {
  const queryClient = useQueryClient();
  const { playNotificationSound } = useNotificationSound();
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedPedido, setSelectedPedido] = useState<any | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Query principal ──────────────────────────────────────
  const { data: pedidosRaw, isLoading } = useQuery({
    queryKey: QUERY_KEYS.loja.pedidos(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tenant_pedidos_admin", {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const pedidos: any[] = pedidosRaw ?? [];

  // ── Realtime ─────────────────────────────────────────────
  useEffect(() => {
    const channelId = `pedidos-loja-${tenantId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pedidos",
          filter: "tenant_id=eq." + tenantId,
        },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.pedidos(tenantId) });
          playNotificationSound();
          toast.success("Novo pedido " + (payload.new?.numero_pedido || "") + " recebido!");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pedidos",
          filter: "tenant_id=eq." + tenantId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loja.pedidos(tenantId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, queryClient, playNotificationSound]);

  // ── KPIs client-side ─────────────────────────────────────
  const kpis = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const pedidosHoje = pedidos.filter(
      (p) => p.created_at?.slice(0, 10) === hoje
    );
    const pedidosPagosHoje = pedidosHoje.filter((p) => p.status === "paid" || p.status === "picked_up" || p.status === "preparing" || p.status === "ready_pickup");
    const receitaHoje = pedidosPagosHoje.reduce(
      (sum, p) => sum + Number(p.total ?? p.valor_total ?? 0),
      0
    );
    const aguardandoAcao = pedidos.filter((p) =>
      ["paid", "preparing", "ready_pickup"].includes(p.status)
    ).length;
    const pedidosPagos = pedidos.filter(
      (p) => !["pending_payment", "cancelled", "expired"].includes(p.status)
    );
    const ticketMedio =
      pedidosPagos.length > 0
        ? pedidosPagos.reduce((s, p) => s + Number(p.total ?? p.valor_total ?? 0), 0) / pedidosPagos.length
        : 0;

    return {
      pedidosHoje: pedidosHoje.length,
      receitaHoje,
      aguardandoAcao,
      ticketMedio,
    };
  }, [pedidos]);

  // ── Filtro ───────────────────────────────────────────────
  const filteredPedidos = useMemo(() => {
    if (activeFilter === "all") return pedidos;
    return pedidos.filter((p) => p.status === activeFilter);
  }, [pedidos, activeFilter]);

  const handleVerDetalhes = (pedido: any) => {
    setSelectedPedido(pedido);
    setSheetOpen(true);
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          label="Pedidos hoje"
          value={String(kpis.pedidosHoje)}
          color="text-blue-500"
        />
        <KpiCard
          icon={DollarSign}
          label="Receita do dia"
          value={`R$ ${kpis.receitaHoje.toFixed(2).replace(".", ",")}`}
          color="text-emerald-500"
        />
        <KpiCard
          icon={Clock}
          label="Aguardando ação"
          value={String(kpis.aguardandoAcao)}
          color={kpis.aguardandoAcao > 0 ? "text-amber-500" : "text-muted-foreground"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket médio"
          value={`R$ ${kpis.ticketMedio.toFixed(2).replace(".", ",")}`}
          color="text-purple-500"
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? pedidos.length
              : pedidos.filter((p) => p.status === f.value).length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setActiveFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                activeFilter === f.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/30"
              )}
            >
              {f.label} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : filteredPedidos.length === 0 ? (
        <Card className="p-8 flex flex-col items-center justify-center text-center border-border/50">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <ClipboardList className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum pedido</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {activeFilter === "all"
              ? "Quando clientes realizarem compras, os pedidos aparecerão aqui."
              : "Nenhum pedido com esse status encontrado."}
          </p>
        </Card>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {filteredPedidos.map((pedido, idx) => (
              <motion.div
                key={pedido.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
              >
                <PedidoCard pedido={pedido} onVerDetalhes={handleVerDetalhes} />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Sheet de detalhes */}
      <PedidoDetalheSheet
        pedido={selectedPedido}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tenantId={tenantId}
        readOnly={readOnly}
        showAdminNotes={showAdminNotes}
      />
    </div>
  );
}

// ── KPI Card subcomponent ──────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="p-4 border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </Card>
  );
}
