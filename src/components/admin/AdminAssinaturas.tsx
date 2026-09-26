/**
 * ═══════════════════════════════════════════════════════════
 * AdminAssinaturas — Listagem de clientes com plano ativo
 * ═══════════════════════════════════════════════════════════
 *
 * Exibe assinaturas ativas/pendentes do tenant com:
 * - KPIs de renovação
 * - Status de ciclo (em uso / pronto p/ renovar / aguardando pgto)
 * - Botão de renovação manual (dinheiro)
 * - Filtro "Prontos para renovar"
 */

import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Search, RefreshCw, Crown, Users,
  Clock, CheckCircle, AlertCircle, Plus, Scissors, CreditCard,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreateManualSubscriptionDialog } from "./CreateManualSubscriptionDialog";

/* ─── Types ─────────────────────────────────────────────── */

interface Assinatura {
  id: string;
  user_id: string;
  plano_id: string;
  barbeiro_id: string | null;
  status: string;
  usos_ciclo_atual: number;
  total_renovacoes: number;
  ciclo_inicio: string | null;
  ciclo_fim: string | null;
  payment_method: string | null;
  updated_at: string | null;
  created_at: string | null;
  // Joined
  plano_nome: string;
  plano_preco: number;
  limite_usos: number;
  servico_nome: string | null;
  cliente_nome: string;
  cliente_telefone: string | null;
  barbeiro_apelido: string | null;
}

interface AdminAssinaturasProps {
  tenantId: string | null;
  /** Quando definido, lista somente assinaturas vinculadas a este barbeiro
   *  e usa-o como pré-seleção ao criar uma nova manualmente. */
  barbeiroIdFilter?: string | null;
  /** Esconde a coluna "Barbeiro" (útil quando já está filtrado por barbeiro) */
  hideBarbeiroColumn?: boolean;
}

/* ─── Component ─────────────────────────────────────────── */

export function AdminAssinaturas({
  tenantId,
  barbeiroIdFilter = null,
  hideBarbeiroColumn = false,
}: AdminAssinaturasProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterProntos, setFilterProntos] = useState(false);
  const [renewDialog, setRenewDialog] = useState<Assinatura | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const queryKey = ["admin", "assinaturas", tenantId, barbeiroIdFilter];

  /* ─── Fetch assinaturas ────────────────────────────── */

  const { data: assinaturas = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      // Buscar barbeiros do tenant para filtrar assinaturas
      const { data: barbers } = await supabase
        .from("barbeiros")
        .select("id, apelido, tenant_id")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("created_at", { ascending: true });

      const filteredBarbers = (barbers || []).filter((barber: any) => {
        if (tenantId) {
          return barber.tenant_id === tenantId;
        }
        return barber.tenant_id === null;
      });

      const barberIds = filteredBarbers.map((b: any) => b.id);
      if (barberIds.length === 0) return [];

      // Mapa de id->apelido para join client-side
      const barberMap = new Map<string, string>(
        filteredBarbers.map((b: any) => [b.id, b.apelido])
      );

      // Se houver filtro por barbeiro, restringir IDs
      const effectiveBarberIds = barbeiroIdFilter
        ? barberIds.filter((id) => id === barbeiroIdFilter)
        : barberIds;

      if (effectiveBarberIds.length === 0) return [];

      const { data, error } = await supabase
        .from("assinaturas")
        .select(`
          id, user_id, plano_id, barbeiro_id, status, usos_ciclo_atual, total_renovacoes,
          ciclo_inicio, ciclo_fim, next_billing_date, payment_method, cash_payment_confirmed,
          updated_at, created_at
        `)
        .in("barbeiro_id", effectiveBarberIds)
        .in("status", ["active", "pending_renewal", "pending_cash"])
        .order("updated_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Lookups separados — evita silêncio de !inner com RLS
      const userIds = Array.from(new Set(data.map((r: any) => r.user_id).filter(Boolean)));
      const planoIds = Array.from(new Set(data.map((r: any) => r.plano_id).filter(Boolean)));

      const [{ data: profilesData }, { data: planosData }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, nome, telefone").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        planoIds.length
          ? supabase
              .from("planos")
              .select("id, nome, preco_mensal, limite_agendamentos_mes, servico_id")
              .in("id", planoIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map<string, any>((profilesData || []).map((p: any) => [p.id, p]));
      const planoMap = new Map<string, any>((planosData || []).map((p: any) => [p.id, p]));

      return data.map((row: any) => {
        const profile = profileMap.get(row.user_id);
        const plano = planoMap.get(row.plano_id);
        return {
          id: row.id,
          user_id: row.user_id,
          plano_id: row.plano_id,
          barbeiro_id: row.barbeiro_id,
          status: row.status,
          usos_ciclo_atual: row.usos_ciclo_atual ?? 0,
          total_renovacoes: row.total_renovacoes ?? 0,
          ciclo_inicio: row.ciclo_inicio,
          ciclo_fim: row.ciclo_fim ?? row.next_billing_date ?? null,
          payment_method: row.payment_method,
          updated_at: row.updated_at,
          created_at: row.created_at,
          plano_nome: plano?.nome || "—",
          plano_preco: Number(plano?.preco_mensal) || 0,
          limite_usos: plano?.limite_agendamentos_mes || 4,
          servico_nome: null,
          cliente_nome: profile?.nome || "Cliente",
          cliente_telefone: profile?.telefone || null,
          barbeiro_apelido: row.barbeiro_id ? barberMap.get(row.barbeiro_id) || null : null,
        };
      }) as Assinatura[];
    },
    staleTime: STALE_TIMES.SERVICOS,
  });

  /* ─── KPIs ─────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const prontosRenovar = assinaturas.filter(
      (a) => a.status === "active" && a.usos_ciclo_atual >= a.limite_usos
    ).length;
    const aguardandoPagamento = assinaturas.filter(
      (a) => a.status === "pending_renewal"
    ).length;
    return { total: assinaturas.length, prontosRenovar, aguardandoPagamento };
  }, [assinaturas]);

  /* ─── Filtro e busca ───────────────────────────────── */

  const filtered = useMemo(() => {
    let list = assinaturas;
    if (filterProntos) {
      list = list.filter(
        (a) => a.status === "active" && a.usos_ciclo_atual >= a.limite_usos
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.cliente_nome.toLowerCase().includes(q) ||
          a.plano_nome.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assinaturas, filterProntos, search]);

  /* ─── Renovação manual (dinheiro) ──────────────────── */

  const handleRenew = async () => {
    if (!renewDialog) return;
    setRenewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("renew-subscription", {
        body: {
          assinatura_id: renewDialog.id,
          forma_pagamento: "dinheiro",
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success(`Plano renovado para ${renewDialog.cliente_nome}`);
      queryClient.invalidateQueries({ queryKey });
      setRenewDialog(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao renovar plano");
    } finally {
      setRenewing(false);
    }
  };

  /* ─── Status badge helper ──────────────────────────── */

  const formatPaymentMethod = (method: string | null) => {
    if (!method) return "—";
    const map: Record<string, string> = {
      cash: "Dinheiro",
      pix: "PIX",
      credit_card: "Cartão crédito",
      debit_card: "Cartão débito",
      asaas: "App",
    };
    return map[method] || method;
  };

  const getStatusBadge = (a: Assinatura) => {
    if (a.status === "pending_renewal") {
      return (
        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-500 bg-blue-500/10">
          Aguardando pagamento
        </Badge>
      );
    }
    if (a.status === "pending_cash") {
      return (
        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 bg-amber-500/10">
          Pgto. dinheiro pendente
        </Badge>
      );
    }
    const usos_restantes = a.limite_usos - a.usos_ciclo_atual;
    if (usos_restantes <= 0) {
      return (
        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 bg-amber-500/10">
          Pronto p/ renovar
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
        Em uso ({usos_restantes} restantes)
      </Badge>
    );
  };

  /* ─── Dias restantes ───────────────────────────────── */

  const getDiasRestantes = (cicloFim: string | null) => {
    if (!cicloFim) return "—";
    const dias = differenceInDays(parseISO(cicloFim), new Date());
    if (dias < 0) return "Vencido";
    if (dias === 0) return "Hoje";
    return `${dias}d`;
  };

  /* ─── Loading ──────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  /* ─── Render ───────────────────────────────────────── */

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Assinaturas ativas", value: kpis.total, icon: Crown, color: "text-primary" },
          { label: "Prontos p/ renovar", value: kpis.prontosRenovar, icon: AlertCircle, color: "text-amber-500" },
          { label: "Aguardando pagamento", value: kpis.aguardandoPagamento, icon: Clock, color: "text-blue-500" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-border/30 bg-card p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("w-4 h-4", kpi.color)} />
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
                  {kpi.label}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente ou plano..."
            className="h-9 pl-9 bg-muted/30 border-border/30 text-sm rounded-lg"
          />
        </div>
        <button
          onClick={() => setFilterProntos(!filterProntos)}
          className={cn(
            "h-9 px-3 rounded-lg text-xs font-medium border transition-colors",
            filterProntos
              ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
              : "bg-card border-border/30 text-muted-foreground hover:text-foreground"
          )}
        >
          Prontos p/ renovar
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => queryClient.invalidateQueries({ queryKey })}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-xs">Adicionar plano</span>
        </Button>
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/40 p-12 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((a, i) => {
              const usosRestantes = Math.max(0, a.limite_usos - a.usos_ciclo_atual);
              const podeRenovar = a.status === "active" && usosRestantes <= 0;
              const progresso = Math.min(100, (a.usos_ciclo_atual / Math.max(1, a.limite_usos)) * 100);
              const inicial = (a.cliente_nome || "?").trim().charAt(0).toUpperCase();
              const diasRest = a.ciclo_fim ? differenceInDays(parseISO(a.ciclo_fim), new Date()) : null;
              const venceProximo = diasRest !== null && diasRest >= 0 && diasRest <= 5;

              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  className="group relative rounded-2xl border border-border/40 bg-card p-4 hover:border-border/70 hover:shadow-sm transition-all"
                >
                  {/* Header — Avatar + Nome + Status */}
                  <div className="flex items-start gap-3 mb-3.5">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">{inicial}</span>
                      </div>
                      {a.status === "active" && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground leading-tight truncate">
                        {a.cliente_nome}
                      </p>
                      {a.cliente_telefone && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 tabular-nums">
                          {a.cliente_telefone}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">{getStatusBadge(a)}</div>
                  </div>

                  {/* Plano */}
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-border/30">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">
                        Plano
                      </p>
                      <p className="text-xs font-medium text-foreground truncate">
                        {a.plano_nome}
                      </p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        R$ {a.plano_preco.toFixed(2).replace(".", ",")}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50">/mês</p>
                    </div>
                  </div>

                  {/* Progresso de usos */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                        Uso do ciclo
                      </span>
                      <span className="text-[11px] font-semibold text-foreground tabular-nums">
                        {a.usos_ciclo_atual}/{a.limite_usos}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          progresso >= 100 ? "bg-amber-500" : progresso >= 75 ? "bg-primary" : "bg-emerald-500"
                        )}
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta — Ciclo · Pgto · Renovações · Barbeiro */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground/70">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span className={cn(venceProximo && "text-amber-500 font-medium")}>
                        {a.ciclo_fim
                          ? `${format(parseISO(a.ciclo_fim), "dd MMM", { locale: ptBR })} · ${getDiasRestantes(a.ciclo_fim)}`
                          : "—"}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      {formatPaymentMethod(a.payment_method)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {a.total_renovacoes}×
                    </span>
                    {!hideBarbeiroColumn && a.barbeiro_apelido && (
                      <span className="inline-flex items-center gap-1">
                        <Scissors className="w-3 h-3" />
                        {a.barbeiro_apelido}
                      </span>
                    )}
                  </div>

                  {/* Ação */}
                  {podeRenovar && (
                    <Button
                      size="sm"
                      className="w-full mt-3.5 h-8 text-[11px] gap-1.5"
                      onClick={() => setRenewDialog(a)}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Registrar renovação
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Confirm renewal dialog */}
      <AlertDialog open={!!renewDialog} onOpenChange={() => setRenewDialog(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Confirmar renovação manual</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Confirmar renovação manual para{" "}
              <span className="text-foreground font-medium">{renewDialog?.cliente_nome}</span>?
              <br />
              O novo ciclo começa hoje. Forma de pagamento: Dinheiro na barbearia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs" disabled={renewing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRenew}
              disabled={renewing}
              className="h-9 text-xs"
            >
              {renewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar renovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual subscription dialog */}
      <CreateManualSubscriptionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
        lockedBarbeiroId={barbeiroIdFilter}
        onCreated={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}
