import { useState, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Eye,
  EyeOff,
  ArrowUpFromLine,
  ArrowDownToLine,
  Receipt,
  BarChart3,
  ChevronRight,
  Scissors,
  Shield,
  Landmark,
  Plus,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FinancialRole } from "./FinancialModule";
import { useFinancialOverview } from "@/hooks/useFinancialOverview";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface Props {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
  userName?: string;
  userPhoto?: string | null;
  onNavigate?: (section: string) => void;
}

import { getBancoName, getBancoLogo } from "@/lib/bankLogos";


export function FinancialOverview({ role, userId, barbeiroId, userName, userPhoto, onNavigate }: Props) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [balanceVisible, setBalanceVisible] = useState(true);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── TanStack Query: dados do overview ── */
  const { data: overviewData, isLoading: loading } = useFinancialOverview(userId, barbeiroId);
  const stats = overviewData?.stats ?? { saldoDisponivel: 0, saldoProcessando: 0, totalEntradas: 0, totalSaques: 0, totalDepositos: 0 };
  const recentTxns = overviewData?.recentTxns ?? [];
  const defaultPixKey = overviewData?.defaultPixKey ?? null;

  /** Realtime: invalida cache quando dados financeiros mudam */
  useEffect(() => {
    if (!userId) return;

    const invalidate = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.overview(userId, barbeiroId) });
      }, 1500);
    };

    const rand = Math.random().toString(36).slice(2, 9);
    const paymentsChannel = supabase
      .channel(`financial-payments-sync-${userId}-${rand}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos', filter: `user_id=eq.${userId}` }, invalidate)
      .subscribe();

    const appointmentsChannel = supabase
      .channel(`financial-appointments-sync-${userId}-${rand}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agendamentos', ...(barbeiroId ? { filter: `barbeiro_id=eq.${barbeiroId}` } : {}) }, (payload) => {
        if ((payload.new as Record<string, unknown>)?.status === 'completed') invalidate();
      })
      .subscribe();

    const saquesChannel = supabase
      .channel(`financial-saques-sync-${userId}-${rand}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saques', filter: `user_id=eq.${userId}` }, invalidate)
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(appointmentsChannel);
      supabase.removeChannel(saquesChannel);
    };
  }, [userId, barbeiroId, queryClient]);

  const fmt = (value: number) =>
    balanceVisible ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "••••••";

  const getTxnIcon = (cat: string) => {
    switch (cat) {
      case "comissao": return Scissors;
      case "saque": return ArrowUpFromLine;
      case "deposito": return ArrowDownToLine;
      default: return Receipt;
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const quickActions = [
    { id: "saque", label: "Sacar", icon: ArrowUpFromLine },
    { id: "extrato", label: "Extrato", icon: Receipt },
  ];

  return (
    <div className={isMobile ? "space-y-7" : ""}>
      {/* ═══ SALDO — desktop: fixo no topo ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={isMobile ? "" : "mt-0"}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] text-muted-foreground/60 font-medium uppercase tracking-[0.12em]">Total recebido</span>
          <button
            onClick={() => setBalanceVisible(!balanceVisible)}
            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-foreground/[0.06] transition-colors"
          >
            {balanceVisible ? (
              <Eye className="w-3 h-3 text-muted-foreground" />
            ) : (
              <EyeOff className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-muted-foreground text-sm font-medium">R$</span>
          <span className="text-[38px] font-bold tracking-[-1.5px] tabular-nums leading-none text-foreground">
            {fmt(stats.saldoDisponivel)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-2.5">
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span className="text-[11px] text-muted-foreground/50">
            Saldo disponível para saque na sua chave PIX
          </span>
        </div>

        {stats.saldoProcessando > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span className="text-[11px] text-muted-foreground/50">
              Processando: {balanceVisible ? `R$ ${stats.saldoProcessando.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ ••••••"}
            </span>
          </div>
        )}

      </motion.div>

      {/* ═══ RESTANTE — desktop: espaço separado do saldo ═══ */}
      <div className={isMobile ? "space-y-7 mt-7" : "space-y-7 mt-8"}>

      {/* ═══ CONTA BANCÁRIA ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.2 }}
      >
        <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-[0.12em] block mb-3">Chave PIX para saque</span>

        {defaultPixKey ? (
          <button
            onClick={() => onNavigate?.("configuracoes")}
            className="w-full flex items-center gap-3.5 px-4 py-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-[12px] bg-foreground/[0.06] border border-border/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {defaultPixKey.instituicao && getBancoLogo(defaultPixKey.instituicao) ? (
                <img src={getBancoLogo(defaultPixKey.instituicao)} alt={getBancoName(defaultPixKey.instituicao)} className="w-7 h-7 object-contain" />
              ) : (
                <Landmark className="w-[18px] h-[18px] text-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground/80 truncate">
                {defaultPixKey.instituicao ? getBancoName(defaultPixKey.instituicao) : (defaultPixKey.apelido || "Conta PIX")}
              </p>
              {defaultPixKey.nome_titular && (
                <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                  {defaultPixKey.nome_titular}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/40 font-mono tracking-wide truncate mt-0.5">
                {defaultPixKey.chave}
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 flex-shrink-0" />
          </button>
        ) : (
          <button
            onClick={() => onNavigate?.("configuracoes")}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border border-dashed border-border/30 hover:border-border/50 hover:bg-secondary/20 transition-colors"
          >
            <div className="w-10 h-10 rounded-[12px] bg-foreground/[0.04] flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4 text-muted-foreground/40" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[12px] font-medium text-foreground/60">Cadastrar chave PIX</p>
              <p className="text-[10px] text-muted-foreground/40">Necessária para confirmar seus saques via PIX</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 flex-shrink-0" />
          </button>
        )}
      </motion.div>

      {/* ═══ AÇÕES RÁPIDAS ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.2 }}
      >
        <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-[0.12em] block mb-3">Ações rápidas</span>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate?.(id)}
              className="rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors p-4 text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-foreground/[0.06] flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-foreground/70" />
              </div>
              <p className="text-[12px] font-semibold text-foreground/80">{label}</p>
            </button>
          ))}
        </div>
      </motion.div>


      {/* ═══ ATIVIDADE RECENTE ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-[0.12em]">Atividade recente</span>
          <button
            onClick={() => onNavigate?.("extrato")}
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground font-medium flex items-center gap-0.5 transition-colors"
          >
            Ver tudo
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {recentTxns.length === 0 ? (
          <div className="text-center py-10">
            <Receipt className="w-6 h-6 mx-auto text-muted-foreground/15 mb-2" />
            <p className="text-[11px] text-muted-foreground/30">Nenhuma movimentação</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {recentTxns.map((txn, idx) => {
              const Icon = getTxnIcon(txn.categoria);
              return (
                <motion.div
                  key={txn.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-foreground/[0.04]">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground/70 truncate">{txn.descricao}</p>
                    <span className="text-[10px] text-muted-foreground/50">
                      {txn.data ? format(new Date(txn.data), "dd MMM", { locale: ptBR }) : "—"}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[12px] font-semibold tabular-nums",
                    txn.tipo === "entrada" ? "text-foreground/70" : "text-muted-foreground"
                  )}>
                    {txn.tipo === "entrada" ? "+" : "−"} R$ {txn.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ═══ CONFIGURAÇÕES ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.2 }}
        className="pb-4"
      >
        <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-[0.12em] block mb-3">Configurações</span>
        <div className="space-y-1">

          <button
            onClick={() => onNavigate?.("seguranca")}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[12px] font-medium text-foreground/60">Segurança</p>
              <p className="text-[10px] text-muted-foreground/50">PIN e configurações de acesso</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20" />
          </button>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
