import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUpFromLine,
  ArrowDownToLine,
  Scissors,
  Receipt,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FinancialRole } from "./FinancialModule";
import { useFinancialExtrato, type Transaction } from "@/hooks/useFinancialExtrato";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface Props {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
}



/**
 * Extrato Bancário — Histórico de transações com paginação server-side
 */
export function FinancialExtrato({ role, userId, barbeiroId }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagina, setPagina] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── TanStack Query: transações paginadas ── */
  const { data: paginatedData, isLoading: loading, isFetching } = useFinancialExtrato(role, userId, barbeiroId, pagina);
  const transactions = paginatedData?.transacoes ?? [];
  const totalPaginas = paginatedData?.totalPaginas ?? 0;

  /** Realtime: invalida cache */
  useEffect(() => {
    if (!userId) return;
    const invalidate = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.extrato(userId, barbeiroId, pagina) });
      }, 1500);
    };
    const channelId = `extrato-realtime-sync-${userId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos', filter: `user_id=eq.${userId}` }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agendamentos', filter: `user_id=eq.${userId}` }, (payload) => {
        if ((payload.new as Record<string, unknown>)?.status === 'completed') invalidate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saques', filter: `user_id=eq.${userId}` }, invalidate)
      .subscribe();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, barbeiroId, pagina, queryClient]);

  /* ── Filtro local apenas por busca ── */
  const filtered = transactions.filter((t) => {
    if (search && !t.descricao.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getIcon = (t: Transaction) => {
    switch (t.categoria) {
      case "comissao":
        return <Scissors className="w-4 h-4" />;
      case "saque":
        return <ArrowUpFromLine className="w-4 h-4" />;
      case "deposito":
        return <ArrowDownToLine className="w-4 h-4" />;
      default:
        return <Receipt className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Concluído":
        return "text-emerald-500";
      case "Pendente":
      case "Aguardando":
        return "text-amber-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
        <Input
          placeholder="Buscar transação..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 bg-secondary/20 border-border/20 text-sm"
        />
      </div>

      {/* Transactions List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Receipt className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma transação encontrada</p>
        </div>
      ) : (
        <>
          {/* Indicador sutil de refetch em background */}
          {isFetching && !loading && (
            <div className="flex justify-center">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          <div className="space-y-1">
            {filtered.map((txn, idx) => (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary/20 transition-colors"
              >
                {/* Icon */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                    txn.tipo === "entrada"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : txn.tipo === "saida"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {getIcon(txn)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{txn.descricao}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">
                      {txn.data ? format(new Date(txn.data), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                    </span>
                    <span className={cn("text-[10px] font-medium", getStatusColor(txn.status))}>
                      {txn.status}
                    </span>
                  </div>
                </div>

                {/* Value */}
                <div className="text-right flex-shrink-0">
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      txn.tipo === "entrada" ? "text-emerald-500" : "text-foreground"
                    )}
                  >
                    {txn.tipo === "entrada" ? "+" : "-"}R${" "}
                    {txn.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Paginação ── */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/10">
              <Button
                variant="ghost"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                className="text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Página {pagina + 1} de {totalPaginas}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pagina >= totalPaginas - 1}
                onClick={() => setPagina((p) => p + 1)}
                className="text-xs gap-1"
              >
                Próxima
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
