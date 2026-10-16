import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Scissors,
  Calendar,
  Banknote,
  QrCode,
  CreditCard,
  Crown,
  Gift,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";
import { isWhatsAppAppointment } from "@/lib/walkInName";
import { readSyncCache } from "@/lib/syncQueryCache";

export interface NextAppointmentData {
  id?: string;
  hora: string;
  clientName: string;
  serviceName: string;
  status?: string;
  duracao?: number;
  preco?: number;
  payment_method?: string | null;
  tipo_agendamento?: string | null;
  is_free?: boolean | null;
  barbeiro_confirmou?: boolean | null;
  observacoes?: string | null;
  planUsage?: { used: number; limit: number } | null;
  avatarUrl?: string | null;
  isBlinking?: boolean;
}

interface NextAppointmentCardProps {
  appointment: NextAppointmentData | null;
  basePath: string;
  onNavigate?: (path: string) => void;
  className?: string;
  isBlinking?: boolean;
}

/** Status oficial do sistema com cores solicitadas:
 * - Cancelado: Vermelho suave (#FF3B30)
 * - Faltou: Cinza (zinc-400)
 * - Falta confirmar / Pendente: Azul (#007AFF)
 * - Confirmado: Verde (#34C759)
 * - Concluído: Verde translúcido (#34C759/40)
 */
const getStatusConfig = (status?: string | null, barbeiroConfirmou?: boolean | null) => {
  const isCancelled = status === "cancelled" || status === "cancelled_by_admin" || status === "cancelled_by_user";
  if (isCancelled) {
    return {
      dot: "bg-[#FF3B30] dark:bg-[#FF453A]",
      barColor: "bg-[#FF3B30] dark:bg-[#FF453A]",
      textColor: "text-[#FF3B30] dark:text-[#FF453A]",
      statusLabel: "Cancelado",
    };
  }
  if (status === "no_show") {
    return {
      dot: "bg-zinc-400 dark:bg-zinc-500",
      barColor: "bg-zinc-400 dark:bg-zinc-500",
      textColor: "text-muted-foreground",
      statusLabel: "Faltou",
    };
  }
  if (status === "completed") {
    return {
      dot: "bg-[#34C759]/40 dark:bg-[#30D158]/40",
      barColor: "bg-[#34C759]/40 dark:bg-[#30D158]/40",
      textColor: "text-muted-foreground/75",
      statusLabel: "Concluído",
    };
  }
  if (status === "pending" || barbeiroConfirmou === false) {
    return {
      dot: "bg-[#FF9500] dark:bg-[#FF9F0A]",
      barColor: "bg-[#FF9500] dark:bg-[#FF9F0A]",
      textColor: "text-[#FF9500] dark:text-[#FF9F0A]",
      statusLabel: "Pendente",
    };
  }
  return {
    dot: "bg-[#34C759] dark:bg-[#30D158]",
    barColor: "bg-[#34C759] dark:bg-[#30D158]",
    textColor: "text-[#34C759] dark:text-[#30D158]",
    statusLabel: "Confirmado",
  };
};

/** Ícone, rótulo e cor da forma de pagamento:
 * - Dinheiro: verde (emerald)
 * - PIX: azulzinho (blue)
 * - Cortesia: roxo elegante (purple)
 * - Cartão: neutro/violeta
 */
const getPaymentBadge = (apt?: {
  tipo_agendamento?: string | null;
  payment_method?: string | null;
  is_free?: boolean | null;
}) => {
  if (apt?.tipo_agendamento === "plano" || apt?.payment_method === "plano") {
    return { icon: Crown, label: "Plano", iconColor: "text-amber-500 dark:text-amber-400" };
  }
  if (apt?.is_free) {
    return { icon: Gift, label: "Cortesia", iconColor: "text-purple-500 dark:text-purple-400" };
  }
  const method = (apt?.payment_method || "").toLowerCase();
  if (method === "pix") {
    return { icon: QrCode, label: "PIX", iconColor: "text-blue-500 dark:text-blue-400" };
  }
  if (method === "card" || method === "credit_card" || method === "credit" || method === "debit") {
    return { icon: CreditCard, label: "Cartão", iconColor: "text-violet-400 dark:text-violet-300" };
  }
  return { icon: Banknote, label: "Dinheiro", iconColor: "text-emerald-500 dark:text-emerald-400" };
};

export const NextAppointmentCard: React.FC<NextAppointmentCardProps> = ({
  appointment,
  basePath,
  onNavigate,
  className,
  isBlinking: propIsBlinking,
}) => {
  const navigate = useNavigate();

  // Estado sincronizado com a Agenda do agendamento que está piscando hoje
  const [activeBlinkingState, setActiveBlinkingState] = useState<{ id: string | null; hora: string | null } | null>(() => {
    const cached = readSyncCache<{ id: string | null; hora: string | null; updatedAt: number }>("agenda:activeBlinkingApt");
    if (cached?.data && Date.now() - (cached.data.updatedAt || 0) < 1000 * 60 * 30) {
      return { id: cached.data.id, hora: cached.data.hora };
    }
    return null;
  });

  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // Atualiza relógio local a cada 10 segundos para acionar o efeito piscante exatamente no momento certo
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Ouve eventos disparados em tempo real pela Agenda
  useEffect(() => {
    const handleActiveChanged = (e: any) => {
      if (e.detail) {
        setActiveBlinkingState({ id: e.detail.id, hora: e.detail.hora });
      }
    };
    window.addEventListener("agenda-active-blinking-changed", handleActiveChanged);
    return () => window.removeEventListener("agenda-active-blinking-changed", handleActiveChanged);
  }, []);

  // Determina se o horário deve piscar verde ou permanecer estático
  // Regra solicitada: pisca exclusivamente enquanto o corte estiver em andamento (ex: 18:00 até 18:30).
  // Antes das 18:00 NÃO pisca. Após as 18:30 para de piscar até começar o próximo corte às 19:00.
  const isBlinking = useMemo(() => {
    if (typeof propIsBlinking === "boolean") return propIsBlinking;
    if (!appointment?.hora) return false;
    if (
      appointment.status === "completed" ||
      appointment.status === "no_show" ||
      appointment.status === "cancelled" ||
      appointment.status === "cancelled_by_admin" ||
      appointment.status === "cancelled_by_user"
    ) {
      return false;
    }

    const [h, m] = (appointment.hora || "00:00").split(":").map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    const dur = appointment.duracao || 30;
    const endMin = startMin + dur;

    return currentTimeMinutes >= startMin && currentTimeMinutes < endMin;
  }, [
    propIsBlinking,
    appointment?.hora,
    appointment?.duracao,
    appointment?.status,
    currentTimeMinutes,
  ]);

  const handleCardClick = () => {
    if (appointment?.id) {
      const target = `${basePath}/agendamento/${appointment.id}`;
      if (onNavigate) {
        onNavigate(target);
      } else {
        navigate(target, { state: { appointment } });
      }
    } else {
      const target = `${basePath}/agenda`;
      if (onNavigate) {
        onNavigate(target);
      } else {
        navigate(target);
      }
    }
  };

  if (!appointment) {
    const handleEmptyClick = () => {
      const target = `${basePath}/agenda`;
      if (onNavigate) {
        onNavigate(target);
      } else {
        navigate(target, { state: { openManualBooking: true } });
      }
    };

    return (
      <div
        onClick={handleEmptyClick}
        className={cn(
          "group relative w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card dark:bg-[#141416] p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs hover:border-foreground/20 active:scale-[0.99] transition-all cursor-pointer overflow-hidden",
          className
        )}
      >
        {/* Apple Liquid Glass Rim Reflection */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 dark:via-white/20 to-transparent"
        />

        {/* Informação Operacional Estratégica & Minimalista (Sem textos truncados no iPhone) */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative flex h-2.5 w-2.5 shrink-0 ml-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34C759] opacity-75 duration-1000" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34C759]" />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] sm:text-[14px] font-semibold text-foreground tracking-tight leading-snug">
              Horário livre agora
            </p>
            <p className="text-[11.5px] sm:text-[12px] text-muted-foreground font-normal tracking-tight leading-snug mt-0.5">
              Pronto para novo encaixe
            </p>
          </div>
        </div>

        {/* CTA Cápsula Apple HIG */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleEmptyClick();
          }}
          className="h-10 px-4 rounded-full bg-foreground text-background font-semibold text-[13px] flex items-center gap-1.5 shadow-xs hover:opacity-90 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <Scissors className="w-4 h-4 stroke-[2.2]" />
          <span>Novo Encaixe</span>
        </button>
      </div>
    );
  }

  const horaFormatted = (appointment.hora || "").slice(0, 5);
  const duration = appointment.duracao || 30;
  const statusConfig = getStatusConfig(appointment.status, appointment.barbeiro_confirmou);
  const paymentBadge = getPaymentBadge(appointment);
  const PayIcon = paymentBadge.icon;
  const isPlan = appointment.tipo_agendamento === "plano" || appointment.payment_method === "plano";
  const isFree = Boolean(appointment.is_free);
  const planUsageCount = appointment.planUsage
    ? `${appointment.planUsage.used}/${appointment.planUsage.limit}`
    : "2/4";

  const priceFormatted =
    typeof appointment.preco === "number" && appointment.preco > 0
      ? `R$ ${appointment.preco.toFixed(2).replace(".", ",")}`
      : "R$ 35,00";

  return (
    <div className="admin-mobile-agenda w-full">
      <div
        onClick={handleCardClick}
        className={cn(
          "group relative w-full rounded-2xl border border-border/60 dark:border-white/[0.10] bg-card p-3.5 sm:p-4 overflow-hidden",
          "flex items-center gap-3 active:scale-[0.99] hover:border-border transition-all cursor-pointer shadow-xs",
          className
        )}
      >
        {/* Apple Liquid Glass Rim Reflection */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 dark:via-white/20 to-transparent"
        />
        {/* Coluna de Horário Limpa (sem fundo por trás) */}
        <div className="w-[54px] shrink-0 flex flex-col items-center justify-center text-center">
          <span
            style={
              isBlinking
                ? {
                    animation: "soft-pulse-blink 1.8s ease-in-out infinite",
                    willChange: "opacity",
                  }
                : undefined
            }
            className={cn(
              "agenda-strong font-mono text-[14px] tabular-nums tracking-tight inline-block",
              isBlinking
                ? "text-[#34C759] dark:text-[#30D158] font-semibold animate-soft-blink"
                : "text-foreground font-semibold"
            )}
          >
            {horaFormatted}
          </span>
          <span className="agenda-subtle text-[11px] font-normal text-muted-foreground/75 leading-none mt-0.5">
            {duration} min
          </span>
        </div>

        {/* Barra vertical fina, elegante e minimalista (3px) */}
        <div className={cn("w-[3px] self-stretch rounded-full shrink-0", statusConfig.barColor)} />

        {/* Conteúdo Principal do Agendamento */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          {/* Linha Superior: Nome do Cliente + Preço / Plano */}
          <div className="flex items-center justify-between gap-2 overflow-hidden w-full">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              <span className="agenda-strong text-[14px] sm:text-[15px] font-semibold text-foreground tracking-tight truncate block">
                {appointment.clientName || "Cliente"}
              </span>
              {isWhatsAppAppointment(appointment.observacoes) && <WhatsAppBadge />}
            </div>

            <span className="agenda-strong text-[13.5px] sm:text-[14px] font-semibold tabular-nums text-foreground shrink-0 text-right">
              {isPlan ? "Plano" : isFree ? "Grátis" : priceFormatted}
            </span>
          </div>

          {/* Linha Inferior: Tesourinha + Serviço à esquerda | Forma de Pagamento com ícone (ou contagem X/Y do Plano) à direita */}
          <div className="flex items-center justify-between gap-2 overflow-hidden w-full text-[12px]">
            {/* Esquerda: Tesourinha + Nome do Serviço */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden font-medium text-muted-foreground">
              <Scissors className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              <span className="agenda-subtle truncate text-foreground/80 text-[11.5px] sm:text-[12px] block">
                {appointment.serviceName || "Atendimento"}
              </span>
            </div>

            {/* Direita: Abaixo do Preço ou Abaixo do Plano */}
            {isPlan ? (
              <div className="flex items-center gap-1 shrink-0 font-semibold tabular-nums text-[12px] text-muted-foreground/80 text-right">
                <span className="agenda-subtle">{planUsageCount}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0 text-[11.5px] font-medium text-right">
                <PayIcon className={cn("w-3.5 h-3.5 shrink-0", paymentBadge.iconColor)} />
                <span className="agenda-subtle text-muted-foreground/85">{paymentBadge.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
