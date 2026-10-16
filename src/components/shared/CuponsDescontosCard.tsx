import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, TrendingDown } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CuponsDescontosCardProps {
  tenantId: string | null | undefined;
}

interface UsoRow {
  valor_descontado: number;
  used_at: string;
  cupom: { codigo: string; tenant_id: string } | null;
}

/**
 * Card "Descontos por cupom (mês)" — mostra total descontado e top códigos.
 * Filtrado por tenant_id (somente descontos da barbearia atual).
 */
export function CuponsDescontosCard({ tenantId }: CuponsDescontosCardProps) {
  const { mesLabel, inicioMes, fimMes } = useMemo(() => {
    const now = new Date();
    return {
      mesLabel: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
      inicioMes: startOfMonth(now),
      fimMes: endOfMonth(now),
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["barber", "cupons-descontos-mes", tenantId, format(inicioMes, "yyyy-MM")],
    queryFn: async () => {
      if (!tenantId) return [] as UsoRow[];
      const { data, error } = await supabase
        .from("cupom_usos" as any)
        .select("valor_descontado, used_at, cupom:cupons!inner(codigo, tenant_id)")
        .eq("cupom.tenant_id", tenantId)
        .gte("used_at", inicioMes.toISOString())
        .lte("used_at", fimMes.toISOString());
      if (error) throw error;
      return (data || []) as unknown as UsoRow[];
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  });

  const total = (data || []).reduce(
    (acc, u) => acc + Number(u.valor_descontado || 0),
    0
  );

  // Top 3 códigos mais usados
  const topCodigos = useMemo(() => {
    const map = new Map<string, { qtd: number; total: number }>();
    for (const u of data || []) {
      const codigo = u.cupom?.codigo;
      if (!codigo) continue;
      const cur = map.get(codigo) || { qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += Number(u.valor_descontado || 0);
      map.set(codigo, cur);
    }
    return Array.from(map.entries())
      .map(([codigo, v]) => ({ codigo, ...v }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 3);
  }, [data]);

  return (
    <div className="rounded-2xl bg-card border border-border/30 px-5 py-4 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="w-4 h-4 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">
          Descontos por cupom
        </p>
        <span className="text-[10px] text-muted-foreground/60 ml-auto capitalize">
          {mesLabel}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Total descontado</span>
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-destructive" />
          <span className="text-lg font-bold text-foreground tabular-nums">
            {isLoading ? "—" : `R$ ${total.toFixed(2).replace(".", ",")}`}
          </span>
        </div>
      </div>

      {topCodigos.length > 0 && (
        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
            Mais usados
          </p>
          {topCodigos.map((t) => (
            <div
              key={t.codigo}
              className="flex items-center justify-between text-xs"
            >
              <span className="font-mono font-semibold text-foreground tracking-wider">
                {t.codigo}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground tabular-nums">
                  {t.qtd}× usado
                </span>
                <span className="text-foreground font-semibold tabular-nums">
                  R$ {t.total.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (data || []).length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Nenhum cupom usado neste mês.
        </p>
      )}
    </div>
  );
}
