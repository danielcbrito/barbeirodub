import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard, Banknote, QrCode, Coins } from "lucide-react";
import { PedidoStatusBadge } from "./PedidoStatusBadge";

interface PedidoCardProps {
  pedido: any;
  onVerDetalhes: (pedido: any) => void;
}

/** Ícone da forma de pagamento */
function PaymentIcon({ method }: { method: string | null }) {
  const cls = "h-3.5 w-3.5 text-muted-foreground";
  switch (method) {
    case "pix":
      return <QrCode className={cls} />;
    case "cartao":
    case "card":
      return <CreditCard className={cls} />;
    case "creditos":
      return <Coins className={cls} />;
    default:
      return <Banknote className={cls} />;
  }
}

/** Iniciais do nome para avatar */
function getInitials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Resumo de itens: "Pomada + 2 itens" */
function resumoItens(itens: any[]): string {
  if (!itens || itens.length === 0) return "Sem itens";
  const primeiro = itens[0]?.nome_produto || "Produto";
  if (itens.length === 1) return primeiro;
  return `${primeiro} + ${itens.length - 1} ${itens.length - 1 === 1 ? "item" : "itens"}`;
}

/**
 * Card horizontal de pedido na lista do admin.
 */
export function PedidoCard({ pedido, onVerDetalhes }: PedidoCardProps) {
  const clienteNome = pedido.cliente?.nome || "Cliente";
  const initials = getInitials(clienteNome);
  const total = pedido.total ?? pedido.valor_total ?? 0;
  const formaPgto = pedido.forma_pagamento || pedido.payment_method;
  const tempoRelativo = pedido.created_at
    ? formatDistanceToNow(new Date(pedido.created_at), { addSuffix: true, locale: ptBR })
    : "";

  return (
    <button
      type="button"
      onClick={() => onVerDetalhes(pedido)}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 
                 hover:border-primary/30 hover:shadow-md transition-all duration-200 text-left group"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary 
                      flex items-center justify-center text-sm font-semibold">
        {initials}
      </div>

      {/* Coluna principal */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground truncate">{clienteNome}</p>
        <p className="text-xs text-muted-foreground truncate">{resumoItens(pedido.itens)}</p>
        <div className="flex items-center gap-1.5">
          <PaymentIcon method={formaPgto} />
          <PedidoStatusBadge status={pedido.status} size="sm" />
        </div>
      </div>

      {/* Coluna direita */}
      <div className="flex-shrink-0 text-right space-y-0.5">
        {pedido.numero_pedido && (
          <p className="text-[10px] text-muted-foreground font-mono">
            {pedido.numero_pedido}
          </p>
        )}
        <p className="text-sm font-semibold text-foreground">
          R$ {Number(total).toFixed(2).replace(".", ",")}
        </p>
        <p className="text-[10px] text-muted-foreground">{tempoRelativo}</p>
      </div>
    </button>
  );
}
