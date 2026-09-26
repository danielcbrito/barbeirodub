import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, TrendingUp, Building2, User, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { FinancialRole } from "./FinancialModule";
import { useFinancialRelatorios } from "@/hooks/useFinancialRelatorios";

interface Props {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
}

/**
 * Relatórios e Analytics Financeiros (migrado para TanStack Query)
 */
export function FinancialRelatorios({ role, userId, barbeiroId }: Props) {
  const isMobile = useIsMobile();
  const { data: monthlyData = [], isLoading: loading } = useFinancialRelatorios(userId, barbeiroId);
  const isBarber = role === "barber";

  /* Dados do mês atual */
  const currentMonthData = monthlyData.find((m) => m.isCurrent);
  const receitaPessoalMes = currentMonthData?.receitaPessoal || 0;
  const receitaBarbeariaMes = currentMonthData?.receitaBarbearia || 0;
  const assinantesMes = currentMonthData?.assinantesCount || 0;

  // Detalhamento: apenas meses já fechados
  const closedMonths = monthlyData.filter((m) => !m.isCurrent);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={isMobile ? "space-y-6" : "space-y-6 mt-2"}>
      <div>
        <h3 className="text-lg font-bold">Relatórios</h3>
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest">
          Análise financeira completa
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Receita pessoal do mês */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 border border-border/30 bg-card/30"
        >
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-emerald-500" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest">
              Minha Receita
            </span>
          </div>
          <span className="text-xl font-bold tabular-nums">
            R$ {receitaPessoalMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
          <p className="text-[10px] text-muted-foreground mt-1">
            {format(new Date(), "MMMM", { locale: ptBR })}
          </p>
        </motion.div>

        {/* Card 2: Receita da barbearia — apenas para admin */}
        {!isBarber && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl p-5 border border-border/30 bg-card/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest">
                Barbearia
              </span>
            </div>
            <span className="text-xl font-bold tabular-nums">
              R$ {receitaBarbeariaMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
            <p className="text-[10px] text-muted-foreground mt-1">
              {format(new Date(), "MMMM", { locale: ptBR })}
            </p>
          </motion.div>
        )}

        {/* Card 3: Assinantes do mês */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-5 border border-border/30 bg-card/30"
        >
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-amber-500" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest">
              Assinantes
            </span>
          </div>
          <span className="text-xl font-bold tabular-nums">
            {assinantesMes}
          </span>
          <p className="text-[10px] text-muted-foreground mt-1">
            {assinantesMes === 1 ? "novo assinante" : "novos assinantes"} em {format(new Date(), "MMMM", { locale: ptBR })}
          </p>
        </motion.div>
      </div>

      {/* Chart - meses fechados */}
      {closedMonths.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-5 border border-border/30 bg-card/30"
        >
          <h4 className="text-sm font-semibold mb-4">Comparativo Mensal</h4>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
            <BarChart data={closedMonths} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `R$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(value: number | undefined, name: string) => [
                  `R$ ${(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
                  name === "receitaPessoal" ? "Minha Receita" : "Barbearia",
                ]}
              />
              <Legend
                formatter={(value) =>
                  value === "receitaPessoal" ? "Minha Receita" : "Barbearia"
                }
                wrapperStyle={{ fontSize: "11px" }}
              />
              <Bar dataKey="receitaPessoal" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              {!isBarber && <Bar dataKey="receitaBarbearia" fill="hsl(var(--muted-foreground))" radius={[6, 6, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Monthly Breakdown */}
      {closedMonths.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground px-1">Detalhamento por Mês</h4>
          {closedMonths.map((m) => (
            <div
              key={m.month}
              className="rounded-xl bg-secondary/10 hover:bg-secondary/20 transition-colors overflow-hidden"
            >
              {/* Mês header */}
              <div className="px-4 pt-3 pb-1">
                <span className="text-sm font-semibold capitalize">
                  {format(new Date(`${m.month.substring(0, 7)}-15`), "MMMM yyyy", { locale: ptBR })}
                </span>
              </div>
              {/* Valores */}
              <div className="px-4 pb-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Minha:</span>
                  <span className="text-sm font-semibold tabular-nums text-emerald-500">
                    R$ {(m.receitaPessoal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {!isBarber && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3 h-3 text-primary" />
                    <span className="text-xs text-muted-foreground">Barbearia:</span>
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      R$ {(m.receitaBarbearia ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {m.assinantesCount > 0 && (
                  <div className="flex items-center gap-2">
                    <Users className="w-3 h-3 text-amber-500" />
                    <span className="text-xs text-muted-foreground">Assinantes:</span>
                    <span className="text-sm font-semibold tabular-nums text-amber-500">
                      {m.assinantesCount}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {closedMonths.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum mês fechado ainda para exibir no detalhamento.
        </div>
      )}
    </div>
  );
}
