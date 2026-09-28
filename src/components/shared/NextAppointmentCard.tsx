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

/** Status oficial do sistema com cores claras:
 * - Concluído: VERDE (emerald)
 * - Agendado: AZUL (blue)
 * - Pendente: ÂMBAR (amber)
 * - Não veio: VERMELHO (rose)
 */
const getStatusConfig = (status?: string | null, barbeiroConfirmou?: boolean | null) => {
  if (status === "completed") {
    return {
      dot: "bg-emerald-500/70",
      barColor: "bg-emerald-500/75 dark:bg-emerald-500/70",
      textColor: "text-muted-foreground/75",
      statusLabel: "Concluído",
    };
  }
  if (status === "no_show") {
    return {
      dot: "bg-rose-500/70",
      barColor: "bg-rose-500/75 dark:bg-rose-500/70",
      textColor: "text-rose-600/80 dark:text-rose-400/80",
      statusLabel: "Não veio",
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return {
      dot: "bg-blue-500/70",
      barColor: "bg-blue-500/75 dark:bg-blue-500/70",
      textColor: "text-muted-foreground/75",
      statusLabel: "Agendado",
    };
  }
  return {
    dot: "bg-amber-500/70",
    barColor: "bg-amber-500/75 dark:bg-amber-500/70",
    textColor: "text-amber-600/80 dark:text-amber-400/80",
    statusLabel: "Pendente",
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
  const isBlinking = useMemo(() => {
    if (typeof propIsBlinking === "boolean") return propIsBlinking;
    if (typeof appointment?.isBlinking === "boolean") return appointment.isBlinking;

    // Se temos a informação direta de qual agendamento está piscando na Agenda
    if (activeBlinkingState) {
      if (activeBlinkingState.id && appointment?.id) {
        return activeBlinkingState.id === appointment.id;
      }
      if (activeBlinkingState.hora && appointment?.hora) {
        return activeBlinkingState.hora === appointment.hora.slice(0, 5);
      }
    }

    // Fallback: cálculo baseado no horário do agendamento
    if (!appointment?.hora) return false;
    const [h, m] = appointment.hora.split(":").map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    const dur = appointment.duracao || 30;
    const endMin = startMin + dur;

    // Se o agendamento ainda está no futuro (ex: faltam mais de 5 minutos para 13:30),
    // NÃO pisca (quem pisca na agenda é o corte atual das 12:30).
    if (currentTimeMinutes < (startMin - 5)) {
      return false;
    }

    // Pisca quando já está no horário (ou iminente) e ainda dentro da duração
    return currentTimeMinutes < endMin;
  }, [
    propIsBlinking,
    appointment?.isBlinking,
    appointment?.id,
    appointment?.hora,
    appointment?.duracao,
    activeBlinkingState,
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
    return (
      <div
        onClick={handleCardClick}
        className={cn(
          "w-full rounded-xl border border-border/50 dark:border-white/[0.07] bg-card dark:bg-[#141414] p-3.5 sm:p-4 flex items-center gap-3.5 shadow-2xs hover:border-foreground/25 active:scale-[0.99] transition-all cursor-pointer",
          className
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-secondary/80 dark:bg-secondary/60 border border-border/50 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground truncate">
            Sem agendamentos nas próximas horas
          </p>
          <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
            Toque para abrir a agenda do dia
          </p>
        </div>
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
          "w-full rounded-xl border border-border/50 dark:border-white/[0.07] bg-card dark:bg-[#141414] p-3 sm:p-3.5",
          "flex items-center gap-3 active:scale-[0.99] hover:border-foreground/25 transition-all cursor-pointer shadow-2xs",
          className
        )}
      >
        {/* Coluna de Horário da Agenda (Esquerda) com sincronização precisa do efeito piscante */}
        <div className="w-12 shrink-0 flex flex-col items-center justify-center text-center">
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
              "agenda-strong font-mono text-[14.5px] tabular-nums tracking-tight inline-block",
              isBlinking
                ? "text-emerald-600 dark:text-emerald-400/75 font-semibold animate-soft-blink"
                : "text-foreground font-bold"
            )}
          >
            {horaFormatted}
          </span>
          <span className="agenda-subtle text-[11px] font-medium text-muted-foreground/65 mt-0.5">
            {duration} min
          </span>
        </div>

        {/* Barra vertical fina, elegante e minimalista (2.5px) */}
        <div className={cn("w-[2.5px] self-stretch rounded-full shrink-0", statusConfig.barColor)} />

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

            <span className="agenda-strong text-[13.5px] sm:text-[14px] font-bold tabular-nums text-foreground shrink-0 text-right">
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
