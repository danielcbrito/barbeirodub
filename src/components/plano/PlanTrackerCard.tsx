/**
 * ═══════════════════════════════════════════════════════════
 * PlanTrackerCard — Card de progresso do plano no dashboard do cliente
 * ═══════════════════════════════════════════════════════════
 *
 * Exibe usos, dias restantes e botão de renovação.
 * Usa RPC get_assinatura_status para dados em tempo real.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Crown,
  Sparkles,
  CalendarClock,
  RefreshCw,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RenovacaoSheet } from "./RenovacaoSheet";
import { cn } from "@/lib/utils";

/* ─── Props ────────────────────────────────────────────── */

interface PlanTrackerCardProps {
  userId: string;
}

/* ─── Componente ───────────────────────────────────────── */

export function PlanTrackerCard({ userId }: PlanTrackerCardProps) {
  const queryClient = useQueryClient();
  const [renewSheetOpen, setRenewSheetOpen] = useState(false);

  /* ─── Query: get_assinatura_status ─────────────────── */

  const { data: planData, isLoading } = useQuery({
    queryKey: ["assinatura-status", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_assinatura_status", {
        p_user_id: userId,
      });
      if (error) throw error;
      return data as {
        assinatura_id: string;
        plano_nome: string;
        plano_preco: number;
        servico_nome: string;
        status: string;
        usos_realizados: number;
        limite_usos: number;
        usos_restantes: number;
        ciclo_inicio: string;
        ciclo_fim: string;
        dias_restantes: number;
        pode_renovar: boolean;
        total_renovacoes: number;
      } | null;
    },
    staleTime: 60_000,
    enabled: !!userId,
  });

  /* ─── Sem plano ativo ──────────────────────────────── */

  if (isLoading) {
    return (
      <Card className="p-5 border-0">
        <Skeleton className="h-5 w-2/3 mb-3" />
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  if (!planData || !planData.assinatura_id) return null;

  /* ─── Cálculos ─────────────────────────────────────── */

  const {
    assinatura_id,
    plano_nome,
    plano_preco,
    servico_nome,
    usos_realizados,
    limite_usos,
    usos_restantes,
    dias_restantes,
    pode_renovar,
    total_renovacoes,
  } = planData;

  const progressPercent = limite_usos > 0 ? (usos_realizados / limite_usos) * 100 : 0;

  /* ─── Render ─────────────────────────────────────────── */

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="overflow-hidden border-0 shadow-lg">
          {/* Header gradiente */}
          <div
            className="p-4 pb-3"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--primary) / 0.04) 100%)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{plano_nome}</p>
                  <p className="text-xs text-muted-foreground">{servico_nome}</p>
                </div>
              </div>

              {pode_renovar && (
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-semibold">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Pronto para renovar!
                  </Badge>
                </motion.div>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="p-4 pt-3 space-y-4">
            {/* Progresso */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {usos_realizados} de {limite_usos} serviços usados
                </span>
                <span className="font-semibold text-foreground">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {/* Dias restantes */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="w-3.5 h-3.5" />
              <span>
                {dias_restantes > 0
                  ? `${dias_restantes} dia${dias_restantes !== 1 ? "s" : ""} restante${dias_restantes !== 1 ? "s" : ""} no ciclo`
                  : "Ciclo encerrado"}
              </span>
            </div>

            {/* Renovações */}
            {total_renovacoes > 0 && (
              <p className="text-[10px] text-muted-foreground/70">
                Renovado {total_renovacoes} vez{total_renovacoes !== 1 ? "es" : ""}
              </p>
            )}

            {/* Botão renovar */}
            <Button
              onClick={() => setRenewSheetOpen(true)}
              disabled={!pode_renovar}
              className={cn(
                "w-full h-11 text-sm font-semibold transition-all duration-300",
                pode_renovar
                  ? "bg-primary hover:bg-primary/90"
                  : "opacity-40 cursor-not-allowed"
              )}
            >
              {pode_renovar ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Renovar plano
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Renovar plano
                </>
              )}
            </Button>

            {/* Mensagem explicativa se bloqueado */}
            {!pode_renovar && usos_restantes > 0 && (
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Use os {usos_restantes} serviço{usos_restantes !== 1 ? "s" : ""} restante{usos_restantes !== 1 ? "s" : ""} para renovar
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Sheet de renovação */}
      <RenovacaoSheet
        open={renewSheetOpen}
        onOpenChange={setRenewSheetOpen}
        assinaturaId={assinatura_id}
        planoNome={plano_nome}
        planoPreco={plano_preco}
        servicoNome={servico_nome}
        onRenovado={() => {
          queryClient.invalidateQueries({ queryKey: ["assinatura-status", userId] });
        }}
      />
    </>
  );
}
