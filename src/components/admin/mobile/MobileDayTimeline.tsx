import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addMinutes, parse, isAfter, isBefore, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Clock,
  User,
  Scissors,
  CheckCircle,
  AlertCircle,
  Coffee,
  X,
  Crown,
  CreditCard,
  Banknote
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { extractWalkInName, extractWhatsAppName, isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

interface TimelineAppointment {
  id: string;
  data: string;
  hora: string;
  status: string;
  preco: number;
  observacoes: string | null;
  barbeiro_confirmou: boolean | null;
  is_free: boolean | null;
  payment_method: string | null;
  tipo_agendamento: string | null;
  user_id: string;
  servico_id: string;
  duracao: number;
  profile: { nome: string; telefone?: string } | null;
  servico: { nome: string; duracao_minutos: number } | null;
}

interface HorarioConfig {
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  aberto: boolean;
}

interface MobileDayTimelineProps {
  selectedDate: Date;
  onSlotClick: (time: string) => void;
  onAppointmentClick: (appointment: TimelineAppointment) => void;
  barbeiroId?: string | null;
}

const SLOT_HEIGHT = 60; // altura de cada slot de 30 minutos em px
const SLOT_INTERVAL = 30; // intervalo em minutos

const getStatusConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  if (status === "completed") {
    return { 
      color: "bg-emerald-500", 
      gradient: "from-emerald-600 to-emerald-700",
      label: "Concluído",
      icon: CheckCircle
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return { 
      color: "bg-sky-500", 
      gradient: "from-sky-600 to-blue-700",
      label: "Agendado",
      icon: CheckCircle
    };
  }
  return { 
    color: "bg-amber-500", 
    gradient: "from-amber-600 to-orange-700",
    label: "Pendente",
    icon: AlertCircle
  };
};

export function MobileDayTimeline({ selectedDate, onSlotClick, onAppointmentClick, barbeiroId }: MobileDayTimelineProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLDivElement>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const queryKey = QUERY_KEYS.admin.timeline(dateStr, barbeiroId);

  /** Fetch agendamentos + horário do dia */
  const fetchTimelineData = useCallback(async () => {
    const dayOfWeek = selectedDate.getDay();

    let appointmentsQuery = supabase
      .from("agendamentos")
      .select("id, data, hora, duracao, status, preco, observacoes, barbeiro_confirmou, cliente_confirmou, ponto_liberado, user_id, servico_id, barbeiro_id, is_free, payment_method, tipo_agendamento, remarcacao_solicitada, motivo_remarcacao")
      .eq("data", dateStr)
      .in("status", ["pending", "confirmed", "completed"])
      .order("hora", { ascending: true });

    if (barbeiroId) {
      appointmentsQuery = appointmentsQuery.eq("barbeiro_id", barbeiroId);
    }

    // Escopo por tenant para evitar vazamento de exceções entre barbearias
    let tenantId: string | null = null;
    if (barbeiroId) {
      const { data: barbRow } = await supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("id", barbeiroId)
        .maybeSingle();
      tenantId = (barbRow as { tenant_id?: string } | null)?.tenant_id ?? null;
    }

    const exceptionalQuery = tenantId
      ? supabase
          .from("horarios_excepcionais")
          .select("aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim")
          .eq("data", dateStr)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null } as { data: null });

    const [horarioRes, exceptionalRes, appointmentsRes] = await Promise.all([
      supabase
        .from("configuracoes_horario")
        .select("aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos")
        .eq("dia_semana", dayOfWeek)
        .maybeSingle(),
      exceptionalQuery,
      appointmentsQuery
    ]);

    let horarioConfig: HorarioConfig;
    if (exceptionalRes.data) {
      horarioConfig = {
        hora_abertura: exceptionalRes.data.hora_abertura || "08:00",
        hora_fechamento: exceptionalRes.data.hora_fechamento || "20:00",
        hora_almoco_inicio: exceptionalRes.data.hora_almoco_inicio,
        hora_almoco_fim: exceptionalRes.data.hora_almoco_fim,
        aberto: exceptionalRes.data.aberto
      };
    } else if (horarioRes.data) {
      horarioConfig = {
        hora_abertura: horarioRes.data.hora_abertura,
        hora_fechamento: horarioRes.data.hora_fechamento,
        hora_almoco_inicio: horarioRes.data.hora_almoco_inicio,
        hora_almoco_fim: horarioRes.data.hora_almoco_fim,
        aberto: horarioRes.data.aberto
      };
    } else {
      horarioConfig = {
        hora_abertura: "08:00",
        hora_fechamento: "20:00",
        hora_almoco_inicio: null,
        hora_almoco_fim: null,
        aberto: true
      };
    }

    const appointmentsWithDetails = await Promise.all(
      (appointmentsRes.data || []).map(async (apt) => {
        const isPlan = apt.tipo_agendamento === 'plano' || apt.payment_method === 'plano';

        const [profileRes, servicoRes, subRes] = await Promise.all([
          supabase.from("profiles").select("nome, telefone").eq("id", apt.user_id).maybeSingle(),
          supabase.from("servicos").select("nome, duracao_minutos").eq("id", apt.servico_id).maybeSingle(),
          isPlan
            ? supabase
                .from("assinaturas")
                .select("payment_method, cash_payment_confirmed, plano_id")
                .eq("user_id", apt.user_id)
                .in("status", ["active", "pending_cash", "suspended"])
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        let planCashPending = false;
        let planPreco = 0;
        if (subRes.data && subRes.data.payment_method === 'cash' && subRes.data.cash_payment_confirmed === false) {
          planCashPending = true;
          if (subRes.data.plano_id) {
            const { data: plano } = await supabase.from("planos").select("preco_mensal").eq("id", subRes.data.plano_id).maybeSingle();
            planPreco = plano?.preco_mensal || 0;
          }
        }

        // Encaixe walk-in ou WhatsApp: nome real do cliente vai em observacoes
        const walkInName = extractWalkInName(apt.observacoes);
        const whatsAppName = extractWhatsAppName(apt.observacoes);
        const displayName = whatsAppName || walkInName || null;
        const profileData = profileRes.data || null;
        const finalProfile = displayName
          ? { ...(profileData || {}), nome: displayName }
          : profileData;

        return {
          ...apt,
          profile: finalProfile,
          servico: servicoRes.data || null,
          _planCashPending: planCashPending,
          _planPreco: planPreco,
        };
      })
    );

    return { appointments: appointmentsWithDetails, horarioConfig };
  }, [selectedDate, barbeiroId, dateStr]);

  const { data: timelineData, isLoading: loading } = useQuery({
    queryKey,
    queryFn: fetchTimelineData,
    staleTime: STALE_TIMES.AGENDA_DIA,
  });

  const appointments = timelineData?.appointments || [];
  const horarioConfig = timelineData?.horarioConfig || null;

  // Realtime — invalida cache quando agendamentos mudam
  useEffect(() => {
    const channelConfig = barbeiroId
      ? { event: '*', schema: 'public', table: 'agendamentos', filter: `barbeiro_id=eq.${barbeiroId}` }
      : { event: '*', schema: 'public', table: 'agendamentos' };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `mobile-timeline-updates-${barbeiroId || 'all'}-${Math.random().toString(36).slice(2, 9)}`;
      channel = supabase
        .channel(channelId)
        .on('postgres_changes', channelConfig as any, () => {
          queryClient.invalidateQueries({ queryKey });
        })
        .subscribe();
    } catch (err) {
      console.warn('[MobileDayTimeline] Erro ao conectar canal Realtime:', err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [barbeiroId, queryClient, queryKey]);

  // Scroll para horário atual ao carregar
  useEffect(() => {
    if (!loading && currentTimeRef.current && isSameDay(selectedDate, new Date())) {
      setTimeout(() => {
        currentTimeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [loading, selectedDate]);

  // Gerar slots de tempo
  const generateTimeSlots = () => {
    if (!horarioConfig) return [];
    
    const slots: { time: string; isLunch: boolean }[] = [];
    const [startH, startM] = horarioConfig.hora_abertura.split(":").map(Number);
    const [endH, endM] = horarioConfig.hora_fechamento.split(":").map(Number);
    
    let current = new Date();
    current.setHours(startH, startM, 0, 0);
    
    const end = new Date();
    end.setHours(endH, endM, 0, 0);

    let lunchStart: Date | null = null;
    let lunchEnd: Date | null = null;
    
    if (horarioConfig.hora_almoco_inicio && horarioConfig.hora_almoco_fim) {
      const [lsH, lsM] = horarioConfig.hora_almoco_inicio.split(":").map(Number);
      const [leH, leM] = horarioConfig.hora_almoco_fim.split(":").map(Number);
      lunchStart = new Date();
      lunchStart.setHours(lsH, lsM, 0, 0);
      lunchEnd = new Date();
      lunchEnd.setHours(leH, leM, 0, 0);
    }

    while (isBefore(current, end) || current.getTime() === end.getTime()) {
      const timeStr = format(current, "HH:mm");
      const isLunch = lunchStart && lunchEnd && 
        (isAfter(current, lunchStart) || current.getTime() === lunchStart.getTime()) && 
        isBefore(current, lunchEnd);
      
      slots.push({ time: timeStr, isLunch: Boolean(isLunch) });
      current = addMinutes(current, SLOT_INTERVAL);
    }

    return slots;
  };

  // Verificar se um slot está ocupado
  const getAppointmentForSlot = (time: string): TimelineAppointment | null => {
    return appointments.find(apt => {
      const aptStart = (apt.hora || "00:00").substring(0, 5);
      const [h, m] = aptStart.split(":").map(Number);
      const aptStartDate = new Date();
      aptStartDate.setHours(h || 0, m || 0, 0, 0);
      
      const aptEndDate = addMinutes(aptStartDate, apt.duracao || apt.servico?.duracao_minutos || 30);
      
      const [slotH, slotM] = time.split(":").map(Number);
      const slotDate = new Date();
      slotDate.setHours(slotH, slotM, 0, 0);
      
      return (isAfter(slotDate, aptStartDate) || slotDate.getTime() === aptStartDate.getTime()) && 
             isBefore(slotDate, aptEndDate);
    }) || null;
  };

  // Verificar se é o primeiro slot de um agendamento
  const isFirstSlotOfAppointment = (time: string): TimelineAppointment | null => {
    return appointments.find(apt => (apt.hora || "00:00").substring(0, 5) === time) || null;
  };

  const timeSlots = generateTimeSlots();

  // Calcular posição do indicador de hora atual
  const getCurrentTimePosition = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    if (!horarioConfig) return null;
    
    const [startH, startM] = horarioConfig.hora_abertura.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const currentMinutes = hours * 60 + minutes;
    
    const slotIndex = (currentMinutes - startMinutes) / SLOT_INTERVAL;
    return slotIndex * SLOT_HEIGHT;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!horarioConfig?.aberto) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-center px-4">
        <X className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground font-medium">Fechado neste dia</p>
      </div>
    );
  }

  const currentTimePosition = getCurrentTimePosition();
  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div 
      ref={scrollRef}
      className="relative overflow-y-auto h-full"
    >
      {/* Indicador de hora atual */}
      {isToday && currentTimePosition !== null && currentTimePosition >= 0 && (
        <div 
          ref={currentTimeRef}
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{ top: currentTimePosition }}
        >
          <div className="relative flex items-center">
            <div className="w-3 h-3 rounded-full bg-primary shadow-glow-red" />
            <div className="flex-1 h-0.5 bg-primary/80" />
            <div className="absolute left-4 -top-2.5 px-2 py-0.5 rounded bg-primary text-[10px] font-bold text-primary-foreground">
              {format(new Date(), "HH:mm")}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative pl-16 pr-4">
        {timeSlots.map(({ time, isLunch }, index) => {
          const appointmentStart = isFirstSlotOfAppointment(time);
          const appointmentInSlot = getAppointmentForSlot(time);
          const isOccupied = appointmentInSlot !== null;
          const isFirstSlot = appointmentStart !== null;

          // Calcular altura do card baseado na duração
          const duration = appointmentStart?.duracao || appointmentStart?.servico?.duracao_minutos || 30;
          const cardHeight = (duration / SLOT_INTERVAL) * SLOT_HEIGHT;

          return (
            <div key={time} className="relative" style={{ height: SLOT_HEIGHT }}>
              {/* Marcador de tempo */}
              <div className="absolute left-0 -translate-x-full pr-3 flex items-center h-full">
                <span className={cn(
                  "text-xs font-medium tabular-nums",
                  isLunch ? "text-amber-500" : "text-muted-foreground"
                )}>
                  {time}
                </span>
              </div>

              {/* Linha de grade */}
              <div className={cn(
                "absolute left-0 right-0 top-0 border-t",
                isLunch ? "border-amber-500/20" : "border-border/30"
              )} />

              {/* Slot de almoço */}
              {isLunch && !isOccupied && (
                <div className="absolute inset-x-0 top-0 h-full flex items-center justify-center bg-amber-500/5 border-l-2 border-amber-500/30">
                  <div className="flex items-center gap-2 text-amber-500/60">
                    <Coffee className="w-4 h-4" />
                    <span className="text-xs font-medium">Almoço</span>
                  </div>
                </div>
              )}

              {/* Card do agendamento (apenas no primeiro slot) */}
              {isFirstSlot && appointmentStart && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => onAppointmentClick(appointmentStart)}
                  className="absolute inset-x-0 top-1 z-10 mx-1"
                  style={{ height: cardHeight - 8 }}
                >
                  {(() => {
                    const statusConfig = getStatusConfig(appointmentStart.status, appointmentStart.barbeiro_confirmou);
                    const isPlan = appointmentStart.tipo_agendamento === 'plano';
                    const isFree = appointmentStart.is_free;
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <div 
                        className={cn(
                          "h-full rounded-xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform",
                          "bg-gradient-to-br border border-foreground/10",
                          statusConfig.gradient
                        )}
                      >
                        <div className="h-full p-3 flex flex-col justify-between">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Scissors className="w-3.5 h-3.5 text-foreground/80 flex-shrink-0" />
                                <span className="text-sm font-semibold text-foreground truncate">
                                  {(() => {
                                    if (appointmentStart.observacoes?.startsWith("Serviços:")) {
                                      return appointmentStart.observacoes.split(".")[0].replace("Serviços: ", "");
                                    }
                                    const sName = appointmentStart.servico?.nome || "Serviço";
                                    const sDur = appointmentStart.servico?.duracao_minutos || 0;
                                    const aDur = (appointmentStart as any).duracao || 0;
                                    if (sDur > 0 && aDur > sDur) {
                                      const qty = Math.round(aDur / sDur);
                                      if (qty > 1) return `${qty}x ${sName}`;
                                    }
                                    return sName;
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <User className="w-3 h-3 text-foreground/60 flex-shrink-0" />
                                <span className="text-xs text-foreground/80 truncate">
                                  {appointmentStart.profile?.nome || "Cliente"}
                                </span>
                                {isWhatsAppAppointment(appointmentStart.observacoes) && <WhatsAppBadge />}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <StatusIcon className="w-4 h-4 text-foreground/80" />
                              {isPlan && (appointmentStart as any)._planCashPending ? (
                                <Badge className="h-4 px-1 bg-amber-500/30 text-amber-200 border-0 text-[9px]">
                                  <Banknote className="w-2.5 h-2.5 mr-0.5" />
                                  COBRAR R$ {((appointmentStart as any)._planPreco || 0).toFixed(0)}
                                </Badge>
                              ) : isPlan ? (
                                <Badge className="h-4 px-1 bg-foreground/20 text-foreground border-0 text-[9px]">
                                  <Crown className="w-2.5 h-2.5 mr-0.5" />
                                  PLANO
                                </Badge>
                              ) : null}
                              {isFree && (
                                <Badge className="h-4 px-1 bg-foreground/20 text-foreground border-0 text-[9px]">
                                  <CreditCard className="w-2.5 h-2.5 mr-0.5" />
                                  GRÁTIS
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {cardHeight > 70 && (
                            <div className="flex items-center justify-between mt-auto">
                              <div className="flex items-center gap-1 text-foreground/60 text-[10px]">
                                <Clock className="w-3 h-3" />
                                {duration}min
                              </div>
                              {(appointmentStart.tipo_agendamento === "plano" || appointmentStart.payment_method === "plano") ? (
                                <div className="flex items-center gap-1 bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  <Crown className="w-2.5 h-2.5 fill-blue-400/20" />
                                  PLANO
                                </div>
                              ) : (
                                <span className="text-sm font-bold text-foreground">
                                  R$ {typeof appointmentStart.preco === 'number' && !isNaN(appointmentStart.preco) ? appointmentStart.preco.toFixed(0) : '0'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}

              {/* Slot vazio (clicável) */}
              {!isOccupied && !isLunch && (
                <button
                  onClick={() => onSlotClick(time)}
                  className="absolute inset-x-0 top-0 h-full flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity group"
                >
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 active:scale-95 transition-transform">
                    <Plus className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Encaixar às {time}</span>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
