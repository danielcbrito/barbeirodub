import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

/**
 * HOOK DE DISPONIBILIDADE DE HORÁRIOS - V4 (PARTIAL UPDATES)
 * 
 * MELHORIAS NA V4:
 * - Updates parciais: apenas slots que mudaram são atualizados no state
 * - Sem re-render completo da lista
 * - Mantém posição do scroll
 * - Transições suaves
 * 
 * REGRA DE DISPONIBILIDADE:
 * próximo_horário_disponível = horário_fim_do_serviço + delay (10min)
 */

export interface TimeSlot {
  time: string;
  available: boolean;
  blockedReason?: 'occupied' | 'minimum_advance' | 'lunch' | 'closed';
}

interface OccupiedSlot {
  hora: string;
  duracao: number;
  status: string;
  source: 'agendamento' | 'pending_booking';
  fim?: string;
  fimComDelay?: string;
}

/** Resposta bruta da Edge Function: { success: true, data: { ... } } */
interface RawApiResponse {
  success: boolean;
  data?: AvailabilityData;
  error?: { code: string; message: string };
}

interface AvailabilityData {
  date: string;
  slots: TimeSlot[];
  occupiedSlots: OccupiedSlot[];
  message?: string;
}

const SUPABASE_URL = 'https://djtpzvujzmrrslirzwun.supabase.co';

// Constantes de configuração padrão
const DEFAULT_DELAY_MINUTES = 10;
const DEFAULT_SLOT_INTERVAL = 5;
const MINIMUM_ADVANCE_MINUTES = 30; // 30 minutos de antecedência (igual ao backend)

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Compara dois arrays de slots e retorna se são diferentes
 */
function slotsAreDifferent(oldSlots: TimeSlot[], newSlots: TimeSlot[]): boolean {
  if (oldSlots.length !== newSlots.length) return true;
  
  for (let i = 0; i < oldSlots.length; i++) {
    if (oldSlots[i].time !== newSlots[i].time ||
        oldSlots[i].available !== newSlots[i].available ||
        oldSlots[i].blockedReason !== newSlots[i].blockedReason) {
      return true;
    }
  }
  return false;
}

/**
 * Aplica updates parciais aos slots existentes
 * Retorna um novo array apenas se houve mudanças
 */
function applyPartialUpdate(existingSlots: TimeSlot[], newSlots: TimeSlot[]): TimeSlot[] | null {
  if (existingSlots.length === 0) return newSlots;
  if (newSlots.length === 0) return null;
  
  // Criar mapa dos novos slots
  const newSlotsMap = new Map<string, TimeSlot>();
  newSlots.forEach(slot => newSlotsMap.set(slot.time, slot));
  
  let hasChanges = false;
  const updatedSlots = existingSlots.map(existingSlot => {
    const newSlot = newSlotsMap.get(existingSlot.time);
    
    if (!newSlot) {
      // Slot removido - manter como indisponível
      if (existingSlot.available) {
        hasChanges = true;
        return { ...existingSlot, available: false, blockedReason: 'occupied' as const };
      }
      return existingSlot;
    }
    
    // Verificar se o slot mudou
    if (existingSlot.available !== newSlot.available || 
        existingSlot.blockedReason !== newSlot.blockedReason) {
      hasChanges = true;
      return newSlot;
    }
    
    return existingSlot;
  });
  
  // Verificar se há novos slots que não existiam
  const existingTimes = new Set(existingSlots.map(s => s.time));
  const newUniqueTimes = newSlots.filter(s => !existingTimes.has(s.time));
  
  if (newUniqueTimes.length > 0) {
    hasChanges = true;
    // Inserir novos slots na posição correta
    const allSlots = [...updatedSlots, ...newUniqueTimes];
    allSlots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    return allSlots;
  }
  
  return hasChanges ? updatedSlots : null;
}

export function useSlotAvailability(
  selectedDate: Date | undefined,
  serviceDuration: number,
  excludeAppointmentId?: string | null,
  barbeiroId?: string | null
) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlot[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);
  const lastSlotsRef = useRef<TimeSlot[]>([]);

  /**
   * Função principal que carrega os slots do BACKEND
   * Usa partial updates para evitar re-render completo
   */
  const loadSlots = useCallback(async (forceFullUpdate = false) => {
    if (!selectedDate || serviceDuration <= 0) {
      console.log('[useSlotAvailability] Data ou duração inválida, limpando slots');
      setSlots([]);
      setOccupiedSlots([]);
      lastSlotsRef.current = [];
      isInitialLoadRef.current = true;
      return;
    }

    // ISOLAMENTO MULTI-TENANT: não buscar sem barbeiro selecionado
    if (!barbeiroId) {
      console.log('[useSlotAvailability] Sem barbeiro selecionado - limpando slots para isolamento');
      setSlots([]);
      setOccupiedSlots([]);
      lastSlotsRef.current = [];
      isInitialLoadRef.current = true;
      return;
    }

    // Cancelar requisição anterior se existir
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Loading apenas no carregamento inicial
    if (isInitialLoadRef.current || forceFullUpdate) {
      setLoading(true);
    }
    setError(null);

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    console.log('[useSlotAvailability] Buscando slots...', isInitialLoadRef.current ? '(inicial)' : '(update parcial)');

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/check-availability`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            date: dateStr,
            duration: serviceDuration,
            excludeAppointmentId: excludeAppointmentId || undefined,
            barbeiro_id: barbeiroId || undefined
          }),
          signal: abortControllerRef.current.signal
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const raw: RawApiResponse = await response.json();

      if (!raw.success || !raw.data) {
        throw new Error(raw.error?.message || 'Erro ao verificar disponibilidade');
      }

      /* Unwrap: a Edge Function retorna { success, data: { slots, ... } } */
      const result = raw.data;

      // ============================================
      // PARTIAL UPDATE: Atualizar apenas slots que mudaram
      // ============================================
      if (isInitialLoadRef.current || forceFullUpdate || lastSlotsRef.current.length === 0) {
        // Primeiro load ou força update: substituir tudo
        console.log('[useSlotAvailability] Load completo:', result.slots.length, 'slots');
        setSlots(result.slots);
        lastSlotsRef.current = result.slots;
        isInitialLoadRef.current = false;
      } else {
        // Update parcial: atualizar apenas o que mudou
        const updatedSlots = applyPartialUpdate(lastSlotsRef.current, result.slots);
        
        if (updatedSlots) {
          // Contar quantos slots mudaram
          let changedCount = 0;
          for (let i = 0; i < Math.min(lastSlotsRef.current.length, updatedSlots.length); i++) {
            if (lastSlotsRef.current[i].available !== updatedSlots[i].available) {
              changedCount++;
            }
          }
          console.log(`[useSlotAvailability] Update parcial: ${changedCount} slot(s) alterado(s)`);
          
          setSlots(updatedSlots);
          lastSlotsRef.current = updatedSlots;
        } else {
          console.log('[useSlotAvailability] Nenhuma mudança detectada');
        }
      }

      setOccupiedSlots(result.occupiedSlots);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[useSlotAvailability] Requisição cancelada');
        return;
      }
      console.error('[useSlotAvailability] ERRO na Edge Function:', err);
      setError('Erro ao carregar horários');
      
      // Fallback: carregar direto do banco se Edge Function falhar
      console.log('[useSlotAvailability] Usando FALLBACK direto do banco...');
      await loadSlotsFromDatabase(dateStr, forceFullUpdate);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, serviceDuration, excludeAppointmentId, barbeiroId]);

  /**
   * Fallback CORRIGIDO: carregar slots diretamente do banco
   * Usa as MESMAS regras do backend (intervalo de 10min, delay de 10min)
   * Também usa partial updates para evitar re-render completo
   */
  const loadSlotsFromDatabase = useCallback(async (dateStr: string, forceFullUpdate = false) => {
    try {
      // ISOLAMENTO: não carregar sem barbeiro selecionado
      if (!barbeiroId) {
        console.log('[useSlotAvailability FALLBACK] Sem barbeiro - limpando slots');
        setSlots([]);
        setOccupiedSlots([]);
        lastSlotsRef.current = [];
        return;
      }

      console.log('[useSlotAvailability FALLBACK] Iniciando carregamento direto...');
      
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const isToday = dateStr === todayStr;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const minimumAdvanceMinutes = isToday ? currentMinutes + MINIMUM_ADVANCE_MINUTES : 0;

      // Buscar configuração do dia - priorizar barbeiro se fornecido
      const dateObj = new Date(dateStr + 'T12:00:00');
      const dayOfWeek = dateObj.getDay();

      let config: any = null;
      let daySlotOverride: number | null = null;

      // 1. Tentar config do barbeiro
      if (barbeiroId) {
        const { data: barberExcecao } = await supabase
          .from('horarios_excepcionais_barbeiro')
          .select('aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim')
          .eq('barbeiro_id', barbeiroId)
          .eq('data', dateStr)
          .maybeSingle();

        if (barberExcecao) {
          config = {
            aberto: barberExcecao.aberto ?? false,
            hora_abertura: barberExcecao.hora_abertura || '09:00',
            hora_fechamento: barberExcecao.hora_fechamento || '20:00',
            hora_almoco_inicio: barberExcecao.hora_almoco_inicio,
            hora_almoco_fim: barberExcecao.hora_almoco_fim,
            delay_entre_servicos: 10
          };
        } else {
          const { data: barberConfig } = await supabase
            .from('configuracoes_horario_barbeiro')
            .select('aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('barbeiro_id', barbeiroId)
            .eq('dia_semana', dayOfWeek)
            .maybeSingle();

          if (barberConfig) {
            config = {
              aberto: barberConfig.aberto ?? false,
              hora_abertura: barberConfig.hora_abertura || '09:00',
              hora_fechamento: barberConfig.hora_fechamento || '20:00',
              hora_almoco_inicio: barberConfig.hora_almoco_inicio,
              hora_almoco_fim: barberConfig.hora_almoco_fim,
              delay_entre_servicos: barberConfig.delay_entre_servicos || DEFAULT_DELAY_MINUTES
            };
            const dv = (barberConfig as { slot_interval_minutes?: number | null }).slot_interval_minutes;
            if (typeof dv === 'number' && dv >= 1 && dv <= 120) daySlotOverride = dv;
          }
        }
      }

      // 2. Fallback para config global
      if (!config) {
        const { data: configData } = await supabase
          .from('configuracoes_horario')
          .select('aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos')
          .eq('dia_semana', dayOfWeek)
          .maybeSingle();

        config = configData ? {
          aberto: configData.aberto,
          hora_abertura: configData.hora_abertura,
          hora_fechamento: configData.hora_fechamento,
          hora_almoco_inicio: configData.hora_almoco_inicio,
          hora_almoco_fim: configData.hora_almoco_fim,
          delay_entre_servicos: configData.delay_entre_servicos || DEFAULT_DELAY_MINUTES
        } : {
          aberto: dayOfWeek !== 0,
          hora_abertura: '09:00',
          hora_fechamento: '21:00',
          hora_almoco_inicio: '13:00',
          hora_almoco_fim: '14:00',
          delay_entre_servicos: DEFAULT_DELAY_MINUTES
        };
      }

      console.log(`[useSlotAvailability FALLBACK] Config do dia ${dayOfWeek}: ${config.hora_abertura} - ${config.hora_fechamento}`);

      if (!config.aberto) {
        console.log('[useSlotAvailability FALLBACK] Dia fechado');
        setSlots([]);
        setOccupiedSlots([]);
        lastSlotsRef.current = [];
        return;
      }

      const OPEN_MINUTES = timeToMinutes(config.hora_abertura);
      const CLOSE_MINUTES = timeToMinutes(config.hora_fechamento);
      const LUNCH_START = config.hora_almoco_inicio ? timeToMinutes(config.hora_almoco_inicio) : null;
      const LUNCH_END = config.hora_almoco_fim ? timeToMinutes(config.hora_almoco_fim) : null;
      const DELAY_MINUTES = config.delay_entre_servicos || DEFAULT_DELAY_MINUTES;

      // Buscar agendamentos com status bloqueante - FILTRAR POR BARBEIRO
      let aptQuery = supabase
        .from('agendamentos')
        .select('id, hora, duracao, status')
        .eq('data', dateStr)
        .in('status', ['pending', 'confirmed', 'completed']);

      if (barbeiroId) {
        aptQuery = aptQuery.eq('barbeiro_id', barbeiroId);
      }

      const { data: appointments, error: aptError } = await aptQuery;

      if (aptError) throw aptError;

      // Buscar pending_bookings não expirados - FILTRAR POR BARBEIRO
      let pbQuery = supabase
        .from('pending_bookings')
        .select('id, hora, duracao, expires_at')
        .eq('data', dateStr)
        .gt('expires_at', now.toISOString());

      if (barbeiroId) {
        pbQuery = pbQuery.eq('barbeiro_id', barbeiroId);
      }

      const { data: pendingBookings } = await pbQuery;

      // Processar slots ocupados
      const allOccupied: OccupiedSlot[] = [
        ...(appointments || []).map(apt => {
          const startMinutes = timeToMinutes(apt.hora);
          const endMinutes = startMinutes + apt.duracao;
          return {
            hora: apt.hora,
            duracao: apt.duracao,
            status: apt.status,
            source: 'agendamento' as const,
            fim: minutesToTime(endMinutes),
            fimComDelay: minutesToTime(endMinutes + DELAY_MINUTES)
          };
        }),
        ...(pendingBookings || []).map(pb => {
          const startMinutes = timeToMinutes(pb.hora);
          const endMinutes = startMinutes + pb.duracao;
          return {
            hora: pb.hora,
            duracao: pb.duracao,
            status: 'pending_booking',
            source: 'pending_booking' as const,
            fim: minutesToTime(endMinutes),
            fimComDelay: minutesToTime(endMinutes + DELAY_MINUTES)
          };
        })
      ];

      // Resolver slot_interval: dia específico > tenant > default
      let slotInterval = DEFAULT_SLOT_INTERVAL;
      if (barbeiroId) {
        const { data: bRow } = await supabase
          .from('barbeiros')
          .select('tenant_id')
          .eq('id', barbeiroId)
          .maybeSingle();
        const tId = (bRow as { tenant_id?: string } | null)?.tenant_id;
        if (tId) {
          const { data: tRow } = await supabase
            .from('tenants')
            .select('slot_interval_minutes')
            .eq('id', tId)
            .maybeSingle();
          const v = (tRow as { slot_interval_minutes?: number } | null)?.slot_interval_minutes;
          if (typeof v === 'number' && v >= 1 && v <= 120) slotInterval = v;
        }
      }
      if (typeof daySlotOverride === 'number' && daySlotOverride >= 1 && daySlotOverride <= 120) {
        slotInterval = daySlotOverride;
      }

      // Gerar slots com intervalo configurável pela barbearia
      const generatedSlots: TimeSlot[] = [];

      for (let slotStartMinutes = OPEN_MINUTES; slotStartMinutes < CLOSE_MINUTES; slotStartMinutes += slotInterval) {
        const timeStr = minutesToTime(slotStartMinutes);
        const slotEndMinutes = slotStartMinutes + serviceDuration;

        // 1. Verificar se cabe antes do fechamento
        if (slotEndMinutes > CLOSE_MINUTES) continue;

        // 2. Verificar almoço
        if (LUNCH_START !== null && LUNCH_END !== null) {
          if (slotStartMinutes >= LUNCH_START && slotStartMinutes < LUNCH_END) continue;
          if (slotEndMinutes > LUNCH_START && slotEndMinutes <= LUNCH_END) continue;
          if (slotStartMinutes < LUNCH_START && slotEndMinutes > LUNCH_END) continue;
        }

        // 3. Verificar antecedência mínima
        if (isToday && slotStartMinutes < minimumAdvanceMinutes) {
          generatedSlots.push({ time: timeStr, available: false, blockedReason: 'minimum_advance' });
          continue;
        }

        // 4. Verificar conflitos (MESMA LÓGICA DO BACKEND)
        let isBlocked = false;
        for (const occupied of allOccupied) {
          const occStartMinutes = timeToMinutes(occupied.hora);
          const occEndMinutes = occStartMinutes + occupied.duracao;
          const occEndWithDelayMinutes = occEndMinutes + DELAY_MINUTES;

          // Conflito: novo slot começa antes do fim+delay E termina depois do início
          const hasConflict = (slotStartMinutes < occEndWithDelayMinutes) && (slotEndMinutes > occStartMinutes);

          if (hasConflict) {
            isBlocked = true;
            break;
          }
        }

        generatedSlots.push({
          time: timeStr,
          available: !isBlocked,
          blockedReason: isBlocked ? 'occupied' : undefined
        });
      }

      // ============================================
      // PARTIAL UPDATE: Atualizar apenas slots que mudaram
      // ============================================
      if (isInitialLoadRef.current || forceFullUpdate || lastSlotsRef.current.length === 0) {
        console.log('[useSlotAvailability FALLBACK] Load completo:', generatedSlots.length, 'slots');
        setSlots(generatedSlots);
        lastSlotsRef.current = generatedSlots;
        isInitialLoadRef.current = false;
      } else {
        const updatedSlots = applyPartialUpdate(lastSlotsRef.current, generatedSlots);
        if (updatedSlots) {
          console.log('[useSlotAvailability FALLBACK] Update parcial aplicado');
          setSlots(updatedSlots);
          lastSlotsRef.current = updatedSlots;
        }
      }

      setOccupiedSlots(allOccupied);

    } catch (err) {
      console.error('[useSlotAvailability FALLBACK] Erro:', err);
      setError('Erro ao carregar horários');
    }
  }, [serviceDuration, barbeiroId]);

  /**
   * Configurar listeners em tempo real e polling
   * Usa partial updates para evitar scroll jump
   */
  useEffect(() => {
    if (!selectedDate || serviceDuration <= 0 || !barbeiroId) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Reset initial load flag quando data muda
    isInitialLoadRef.current = true;
    lastSlotsRef.current = [];

    // Limpar canal anterior
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Limpar polling anterior
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Carregar slots inicialmente (full load)
    loadSlots(true);

    // Configurar canal de realtime - usa partial updates
    const channelName = `slot-availability-${dateStr}-${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agendamentos',
          filter: `data=eq.${dateStr}`
        },
        (payload) => {
          console.log('[Realtime] Mudança em agendamentos:', payload.eventType, '(partial update)');
          // Partial update - não força reload completo
          loadSlots(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_bookings',
          filter: `data=eq.${dateStr}`
        },
        (payload) => {
          console.log('[Realtime] Mudança em pending_bookings:', payload.eventType, '(partial update)');
          // Partial update - não força reload completo
          loadSlots(false);
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Status do canal:`, status);
      });

    channelRef.current = channel;

    // Polling de backup (a cada 10 segundos) - usa partial updates
    pollIntervalRef.current = setInterval(() => {
      loadSlots(false);
    }, 10000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [selectedDate, serviceDuration, loadSlots]);

  /**
   * Função para forçar recarga completa dos slots
   * Usado quando o usuário quer atualizar manualmente
   */
  const refreshSlots = useCallback(() => {
    loadSlots(true);
  }, [loadSlots]);

  /**
   * Função para verificar se um horário específico está disponível
   * Faz uma verificação DIRETA no banco (double-check)
   */
  const verifySlotAvailability = useCallback(async (time: string): Promise<{
    available: boolean;
    message?: string;
  }> => {
    if (!selectedDate) {
      return { available: false, message: 'Data não selecionada' };
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const slotStartMinutes = timeToMinutes(time);
    const slotEndMinutes = slotStartMinutes + serviceDuration;

    console.log(`[verifySlotAvailability] Verificando ${dateStr} ${time} (${minutesToTime(slotStartMinutes)}-${minutesToTime(slotEndMinutes)})`);

    try {
      // ISOLAMENTO: verificar apenas com barbeiro selecionado
      if (!barbeiroId) {
        return { available: false, message: 'Selecione um profissional' };
      }

      // Buscar delay do barbeiro primeiro, fallback global
      const dateObj = new Date(dateStr + 'T12:00:00');
      const dayOfWeek = dateObj.getDay();

      const { data: barberConfigData } = await supabase
        .from('configuracoes_horario_barbeiro')
        .select('delay_entre_servicos, slot_interval_minutes')
        .eq('barbeiro_id', barbeiroId)
        .eq('dia_semana', dayOfWeek)
        .maybeSingle();

      let DELAY_MINUTES = barberConfigData?.delay_entre_servicos || DEFAULT_DELAY_MINUTES;
      const daySlotOverride = (barberConfigData as { slot_interval_minutes?: number | null } | null)?.slot_interval_minutes ?? null;

      if (!barberConfigData) {
        const { data: configData } = await supabase
          .from('configuracoes_horario')
          .select('delay_entre_servicos')
          .eq('dia_semana', dayOfWeek)
          .maybeSingle();
        DELAY_MINUTES = configData?.delay_entre_servicos || DEFAULT_DELAY_MINUTES;
      }

      // Buscar agendamentos - SEMPRE filtrado por barbeiro (isolamento)
      let query = supabase
        .from('agendamentos')
        .select('id, hora, duracao, status')
        .eq('data', dateStr)
        .eq('barbeiro_id', barbeiroId)
        .in('status', ['pending', 'confirmed', 'completed']);

      if (excludeAppointmentId) {
        query = query.neq('id', excludeAppointmentId);
      }

      const { data: appointments, error } = await query;

      if (error) {
        console.error('[verifySlotAvailability] Erro:', error);
        return { available: false, message: 'Erro ao verificar disponibilidade' };
      }

      // Verificar conflitos com agendamentos
      for (const apt of appointments || []) {
        const aptStartMinutes = timeToMinutes(apt.hora);
        const aptEndMinutes = aptStartMinutes + apt.duracao;
        const aptEndWithDelayMinutes = aptEndMinutes + DELAY_MINUTES;

        const hasConflict = (slotStartMinutes < aptEndWithDelayMinutes) && (slotEndMinutes > aptStartMinutes);

        if (hasConflict) {
          console.log(`[verifySlotAvailability] ❌ CONFLITO com ${apt.hora} (${apt.status})`);
          return {
            available: false,
            message: 'Este horário já foi reservado. Por favor, escolha outro.'
          };
        }
      }

      // Verificar pending_bookings - SEMPRE filtrado por barbeiro (isolamento)
      const { data: pendingBookings } = await supabase
        .from('pending_bookings')
        .select('id, hora, duracao')
        .eq('data', dateStr)
        .eq('barbeiro_id', barbeiroId)
        .gt('expires_at', new Date().toISOString());

      for (const pb of pendingBookings || []) {
        const pbStartMinutes = timeToMinutes(pb.hora);
        const pbEndMinutes = pbStartMinutes + pb.duracao;
        const pbEndWithDelayMinutes = pbEndMinutes + DELAY_MINUTES;

        const hasConflict = (slotStartMinutes < pbEndWithDelayMinutes) && (slotEndMinutes > pbStartMinutes);

        if (hasConflict) {
          console.log(`[verifySlotAvailability] ❌ CONFLITO com pending_booking ${pb.hora}`);
          return {
            available: false,
            message: 'Este horário está temporariamente reservado. Tente outro horário.'
          };
        }
      }

      console.log(`[verifySlotAvailability] ✅ Horário DISPONÍVEL`);
      return { available: true };

    } catch (err) {
      console.error('[verifySlotAvailability] Erro geral:', err);
      return { available: false, message: 'Erro ao verificar disponibilidade' };
    }
  }, [selectedDate, serviceDuration, excludeAppointmentId, barbeiroId]);

  return {
    slots,
    loading,
    error,
    occupiedSlots,
    refreshSlots,
    verifySlotAvailability
  };
}
