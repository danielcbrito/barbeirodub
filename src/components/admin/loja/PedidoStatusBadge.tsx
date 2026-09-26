import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PedidoStatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

/** Mapeamento de status → visual do badge */
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_payment: {
    label: "Aguardando pgto.",
    className: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  },
  paid: {
    label: "Pago",
    className: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  },
  preparing: {
    label: "Em separação",
    className: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  },
  ready_pickup: {
    label: "Pronto p/ retirada",
    className: "bg-amber-600/15 text-amber-700 border-amber-600/30",
  },
  picked_up: {
    label: "Retirado",
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
  expired: {
    label: "Expirado",
    className: "bg-muted text-muted-foreground border-border",
  },
};

/**
 * Badge reutilizável para status de pedido da loja.
 */
export function PedidoStatusBadge({ status, size = "md" }: PedidoStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border whitespace-nowrap",
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5",
        config.className
      )}
    >
      {config.label}
    </Badge>
  );
}
