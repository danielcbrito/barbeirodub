import { MessageSquare, TrendingUp, Quote } from "lucide-react";

interface ReviewKpiStripProps {
  totalReviews: number;
  fiveStarPercent: number;
  withComments: number;
}

/**
 * Faixa de métricas — design minimalista com 3 colunas.
 */
export function ReviewKpiStrip({ totalReviews, fiveStarPercent, withComments }: ReviewKpiStripProps) {
  const items = [
    { icon: MessageSquare, label: "Total", value: String(totalReviews) },
    { icon: TrendingUp, label: "5 estrelas", value: `${fiveStarPercent.toFixed(0)}%` },
    { icon: Quote, label: "Comentários", value: String(withComments) },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="rounded-lg border border-border/15 bg-card px-3 py-2.5 text-center">
          <p className="text-[14px] font-semibold text-foreground tabular-nums">{value}</p>
          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mt-0.5 font-medium">{label}</p>
        </div>
      ))}
    </div>
  );
}
