import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createWooviCharge } from '../_shared/woovi-charge.ts';
import { assertWooviMethod } from '../_shared/woovi-payment-policy.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Valida CPF usando o algoritmo oficial
 */
function validateCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/\D/g, '');
  
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
}

/**
 * Verifica disponibilidade do horário de forma atômica
 * CRÍTICO: Evita race conditions e agendamentos duplicados
 */
// Helper function: convert HH:MM to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Verifica disponibilidade do horário de forma atômica
 * CRÍTICO: Evita race conditions e agendamentos duplicados
 * ATUALIZADO: Usa configurações do banco de dados em vez de valores hardcoded
 */
async function checkTimeSlotAvailability(
  supabase: any,
  data: string,
  hora: string,
  duracao: number,
  excludeAppointmentId?: string,
  barbeiroId?: string | null
): Promise<{ available: boolean; message: string }> {
  
  console.log('[checkTimeSlotAvailability] Verificando:', { data, hora, duracao, excludeAppointmentId, barbeiroId });
  
  // Parse time
  const [startHour, startMinute] = hora.split(':').map(Number);
  const startTimeInMinutes = startHour * 60 + startMinute;
  const endTimeInMinutes = startTimeInMinutes + duracao;

  // Get day of week
  const appointmentDate = new Date(data + 'T12:00:00');
  const dayOfWeek = appointmentDate.getDay();

  // ============================================
  // BUSCAR CONFIGURAÇÕES DE HORÁRIO DO BANCO
  // Prioridade: barbeiro > global
  // ============================================
  let config: any = null;

  if (barbeiroId) {
    // 1. Exceção do barbeiro
    const { data: barberExcecao } = await supabase
      .from('horarios_excepcionais_barbeiro')
      .select('*')
      .eq('barbeiro_id', barbeiroId)
      .eq('data', data)
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
      // 2. Config do barbeiro para o dia da semana
      const { data: barberConfig } = await supabase
        .from('configuracoes_horario_barbeiro')
        .select('*')
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
          delay_entre_servicos: barberConfig.delay_entre_servicos || 10
        };
      }
    }
  }

  if (!config) {
    // 3. Exceção do tenant do barbeiro (evita vazamento entre barbearias)
    let tenantId: string | null = null;
    if (barbeiroId) {
      const { data: barbRow } = await supabase
        .from('barbeiros')
        .select('tenant_id')
        .eq('id', barbeiroId)
        .maybeSingle();
      tenantId = (barbRow as { tenant_id?: string } | null)?.tenant_id ?? null;
    }

    const excecaoGlobal = tenantId
      ? (await supabase
          .from('horarios_excepcionais')
          .select('*')
          .eq('data', data)
          .eq('tenant_id', tenantId)
          .maybeSingle()).data
      : null;

    if (excecaoGlobal) {
      config = {
        aberto: excecaoGlobal.aberto ?? false,
        hora_abertura: excecaoGlobal.hora_abertura || '09:00',
        hora_fechamento: excecaoGlobal.hora_fechamento || '20:00',
        hora_almoco_inicio: excecaoGlobal.hora_almoco_inicio,
        hora_almoco_fim: excecaoGlobal.hora_almoco_fim,
        delay_entre_servicos: 10
      };
    } else {
      // 4. Config global do dia da semana
      const { data: configData, error: configError } = await supabase
        .from('configuracoes_horario')
        .select('*')
        .eq('dia_semana', dayOfWeek)
        .maybeSingle();

      if (configError) {
        console.error('[checkTimeSlotAvailability] Erro ao buscar config:', configError.message);
      }

      config = configData ? {
        aberto: configData.aberto,
        hora_abertura: configData.hora_abertura,
        hora_fechamento: configData.hora_fechamento,
        hora_almoco_inicio: configData.hora_almoco_inicio,
        hora_almoco_fim: configData.hora_almoco_fim,
        delay_entre_servicos: configData.delay_entre_servicos || 10
      } : {
        aberto: dayOfWeek !== 0,
        hora_abertura: '09:00',
        hora_fechamento: '21:00',
        hora_almoco_inicio: '13:00',
        hora_almoco_fim: '14:00',
        delay_entre_servicos: 10
      };
    }
  }

  console.log(`[checkTimeSlotAvailability] Config dia ${dayOfWeek} (barbeiro: ${barbeiroId || 'global'}): ${config.hora_abertura}-${config.hora_fechamento}`);

  // Check if day is closed
  if (!config.aberto) {
    return { available: false, message: 'A barbearia não funciona neste dia.' };
  }

  // Get business hours from config
  const OPEN_MINUTES = timeToMinutes(config.hora_abertura);
  const CLOSE_MINUTES = timeToMinutes(config.hora_fechamento);
  const LUNCH_START = config.hora_almoco_inicio ? timeToMinutes(config.hora_almoco_inicio) : null;
  const LUNCH_END = config.hora_almoco_fim ? timeToMinutes(config.hora_almoco_fim) : null;

  // Check business hours (DYNAMIC from database)
  if (startTimeInMinutes < OPEN_MINUTES || endTimeInMinutes > CLOSE_MINUTES) {
    return { available: false, message: `Horário fora do expediente (${config.hora_abertura}-${config.hora_fechamento}).` };
  }

  // Check lunch break (if configured)
  if (LUNCH_START !== null && LUNCH_END !== null) {
    if (
      (startTimeInMinutes >= LUNCH_START && startTimeInMinutes < LUNCH_END) ||
      (endTimeInMinutes > LUNCH_START && endTimeInMinutes <= LUNCH_END) ||
      (startTimeInMinutes < LUNCH_START && endTimeInMinutes > LUNCH_END)
    ) {
      return { available: false, message: `Horário de almoço (${config.hora_almoco_inicio}-${config.hora_almoco_fim}).` };
    }
  }

  // ============================================
  // VERIFICAÇÃO CRÍTICA: Conflitos
  // ============================================
  const DELAY_MINUTES = config.delay_entre_servicos;
  
  // Check existing appointments - FILTRAR POR BARBEIRO para isolamento correto
  let query = supabase
    .from('agendamentos')
    .select('id, hora, duracao, status')
    .eq('data', data)
    .in('status', ['pending', 'confirmed', 'completed']);

  if (barbeiroId) {
    query = query.eq('barbeiro_id', barbeiroId);
  }

  if (excludeAppointmentId) {
    query = query.neq('id', excludeAppointmentId);
  }

  const { data: existingAppointments, error: aptError } = await query;

  if (aptError) {
    console.error('[checkTimeSlotAvailability] Erro:', aptError);
    return { available: false, message: 'Erro ao verificar disponibilidade.' };
  }

  // Check conflicts with delay
  for (const apt of existingAppointments || []) {
    const [aptHour, aptMinute] = apt.hora.split(':').map(Number);
    const aptStart = aptHour * 60 + aptMinute;
    const aptEnd = aptStart + apt.duracao;
    const aptEndWithDelay = aptEnd + DELAY_MINUTES;

    // Overlap: início1 < fim2+delay E fim1 > início2
    const hasConflict = startTimeInMinutes < aptEndWithDelay && endTimeInMinutes > aptStart;

    if (hasConflict) {
      console.log('[checkTimeSlotAvailability] CONFLITO:', { 
        requestedTime: hora, 
        conflictingTime: apt.hora,
        aptId: apt.id
      });
      return { 
        available: false, 
        message: 'Horário indisponível. Já existe um agendamento nesse período.' 
      };
    }
  }

  // Check pending bookings - FILTRAR POR BARBEIRO para isolamento correto
  let pbQuery = supabase
    .from('pending_bookings')
    .select('id, hora, duracao')
    .eq('data', data)
    .gt('expires_at', new Date().toISOString());

  if (barbeiroId) {
    pbQuery = pbQuery.eq('barbeiro_id', barbeiroId);
  }

  const { data: pendingBookings } = await pbQuery;

  for (const pending of pendingBookings || []) {
    const [pendingHour, pendingMinute] = pending.hora.split(':').map(Number);
    const pendingStart = pendingHour * 60 + pendingMinute;
    const pendingEnd = pendingStart + pending.duracao;
    const pendingEndWithDelay = pendingEnd + DELAY_MINUTES;

    // Overlap with delay
    const hasConflict = startTimeInMinutes < pendingEndWithDelay && endTimeInMinutes > pendingStart;

    if (hasConflict) {
      console.log('[checkTimeSlotAvailability] CONFLITO com pending:', pending.id);
      return { 
        available: false, 
        message: 'Horário temporariamente reservado. Tente novamente em alguns minutos.' 
      };
    }
  }

  return { available: true, message: 'Horário disponível' };
}

interface CreatePaymentRequest {
  bookingData: {
    servico_id: string;
    servico_ids?: string[];
    barbeiro_id: string | null;
    data: string;
    hora: string;
    duracao: number;
    preco: number;
    observacoes?: string;
  };
  metodo: 'card' | 'pix' | 'cash';
  customerInfo?: {
    name: string;
    email: string;
    cpf: string;
  };
  cardInfo?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  rescheduleFromId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticating user...');
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    const { bookingData, metodo, customerInfo, cardInfo, rescheduleFromId }: CreatePaymentRequest = await req.json();

    assertWooviMethod(metodo);
    if (!bookingData?.barbeiro_id || !bookingData.servico_id) throw new Error('Serviço e barbeiro obrigatórios');
    const serviceIds = [...new Set(bookingData.servico_ids ?? [bookingData.servico_id])];
    if (!serviceIds.length || serviceIds.length > 20 || !serviceIds.includes(bookingData.servico_id)) throw new Error('Serviços inválidos');
    const { data: barber, error: barberError } = await supabase.from('barbeiros').select('tenant_id').eq('id', bookingData.barbeiro_id).eq('ativo', true).single();
    const { data: services, error: servicesError } = await supabase.from('servicos').select('id,preco,duracao_minutos,tenant_id').in('id', serviceIds).eq('ativo', true);
    const { data: durations, error: durationError } = await supabase.from('barbeiro_servico_duracao').select('servico_id,duracao_personalizada').eq('barbeiro_id', bookingData.barbeiro_id).in('servico_id', serviceIds);
    if (barberError || servicesError || durationError || !barber || services?.length !== serviceIds.length) throw new Error('Não foi possível validar os serviços');
    if (services.some(service => service.tenant_id !== barber.tenant_id)) throw new Error('Serviço não pertence à barbearia selecionada');
    const officialPrice = services.reduce((sum, service) => sum + Math.round(Number(service.preco) * 100), 0);
    // Partial credits need atomic consumption when the callback creates the appointment.
    // Fail closed rather than sell a discounted appointment without consuming credit.
    if (Math.round(Number(bookingData.preco) * 100) !== officialPrice) {
      return new Response(JSON.stringify({ error: 'Preço divergente ou créditos parciais: esta combinação precisa ser reconciliada antes do pagamento.', code: 'PRICE_RECONCILIATION_REQUIRED' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    bookingData.preco = officialPrice / 100;
    bookingData.duracao = services.reduce((sum, service) => sum + Number(durations?.find(duration => duration.servico_id === service.id)?.duracao_personalizada ?? service.duracao_minutos), 0);
    if (rescheduleFromId) {
      const { data: owned } = await supabase.from('agendamentos').select('id').eq('id', rescheduleFromId).eq('user_id', user.id).maybeSingle();
      if (!owned) throw new Error('Agendamento anterior não pertence ao cliente');
    }

    console.log('Received payment request:', { bookingData, metodo, hasCustomerInfo: !!customerInfo, hasCardInfo: !!cardInfo, isRescheduling: !!rescheduleFromId });

    // ============================================
    // VERIFICAÇÃO CRÍTICA DE DISPONIBILIDADE
    // Deve acontecer ANTES de qualquer inserção
    // ============================================
    console.log('[create-payment] Verificando disponibilidade do horário...');
    const availability = await checkTimeSlotAvailability(
      supabase,
      bookingData.data,
      bookingData.hora,
      bookingData.duracao,
      rescheduleFromId, // Excluir agendamento atual se for reagendamento
      bookingData.barbeiro_id // Filtrar por barbeiro para isolamento
    );

    if (!availability.available) {
      console.log('[create-payment] Horário INDISPONÍVEL:', availability.message);
      return new Response(
        JSON.stringify({ 
          error: availability.message,
          code: 'TIME_SLOT_UNAVAILABLE'
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('[create-payment] Horário DISPONÍVEL, prosseguindo...');

    // Fetch user profile for name and CPF used in payment validation
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('nome, cpf')
      .eq('id', user.id)
      .single();
 
    if (profileError || !profile) {
      console.warn('Profile not found for user, proceeding with limited data:', { userId: user.id, error: profileError?.message });
    }

    // Validate CPF if payment requires profile validation (PIX or Card)
    if ((metodo === 'pix' || metodo === 'card') && profile?.cpf && !validateCPF(profile.cpf)) {
      console.error('Invalid CPF detected:', profile.cpf);
      return new Response(
        JSON.stringify({ 
          error: 'CPF inválido. Por favor, atualize seu perfil com um CPF válido antes de prosseguir com o pagamento.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle "cash" payment - create appointment immediately
    if (metodo === 'cash') {
      console.log('Creating cash appointment as confirmed (auto-confirm)');
      
      // If rescheduling, cancel old appointment first
      if (rescheduleFromId) {
        console.log('Cancelling previous appointment:', rescheduleFromId);
        await supabase
          .from('agendamentos')
          .update({
            status: 'cancelled_by_user',
            visivel_para_usuario: false,
          })
          .eq('id', rescheduleFromId);
      }
      
      // Create the appointment — AUTO-CONFIRMADO
      const { data: appointment, error: aptError } = await supabase
        .from('agendamentos')
        .insert({
          user_id: user.id,
          servico_id: bookingData.servico_id,
          barbeiro_id: bookingData.barbeiro_id,
          data: bookingData.data,
          hora: bookingData.hora,
          duracao: bookingData.duracao,
          preco: bookingData.preco,
          observacoes: bookingData.observacoes,
          status: 'confirmed', // AUTO-CONFIRMADO: sem necessidade de aprovação manual
          barbeiro_confirmou: true, // AUTO-CONFIRMADO
          cliente_confirmou: false,
          payment_method: 'cash',
          remarcado_de: rescheduleFromId || null,
        })
        .select()
        .single();

      if (aptError) {
        console.error('Failed to create appointment:', aptError);
        throw aptError;
      }

      // ============================================
      // INTEGRAÇÃO GOOGLE CALENDAR - Criar evento
      // ============================================
      try {
        const { data: servico } = await supabase
          .from('servicos')
          .select('nome')
          .eq('id', bookingData.servico_id)
          .single();

        const startDateTime = `${bookingData.data}T${bookingData.hora}:00`;
        const endDate = new Date(`${bookingData.data}T${bookingData.hora}`);
        endDate.setMinutes(endDate.getMinutes() + bookingData.duracao);
        const endDateTime = endDate.toISOString().slice(0, 19);

        console.log('Creating Google Calendar event for cash appointment:', appointment.id);
        
        // Chamar edge function de sync com Google Calendar
        const googleCalendarResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-sync`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              action: 'create',
              appointmentId: appointment.id,
              summary: `Agendamento: ${servico?.nome || 'Serviço'}`,
              description: `Cliente agendou ${servico?.nome || 'serviço'} - Pagamento em DINHEIRO (aguardando confirmação)`,
              startDateTime,
              endDateTime,
            }),
          }
        );

        if (googleCalendarResponse.ok) {
          console.log('Google Calendar event created successfully');
        } else {
          console.error('Failed to create Google Calendar event:', await googleCalendarResponse.text());
        }
      } catch (gcError) {
        console.error('Error creating Google Calendar event:', gcError);
        // Não bloqueia o fluxo se Google Calendar falhar
      }

      // Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('pagamentos')
        .insert({
          user_id: user.id,
          agendamento_id: appointment.id,
          metodo: 'cash',
          valor: bookingData.preco,
          status: 'pending', // Pagamento pendente até confirmação
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Failed to create payment:', paymentError);
        throw paymentError;
      }

      console.log('Cash appointment created (auto-confirmed):', appointment.id);

      // Notificação ao barbeiro
      try {
        if (bookingData.barbeiro_id) {
          const { data: barbeiro } = await supabase
            .from('barbeiros')
            .select('user_id')
            .eq('id', bookingData.barbeiro_id)
            .single();

          if (barbeiro?.user_id) {
            const { data: servico } = await supabase
              .from('servicos')
              .select('nome')
              .eq('id', bookingData.servico_id)
              .single();

            const dateParts = bookingData.data.split('-');
            const dateFormatted = `${dateParts[2]}/${dateParts[1]}`;

            await supabase.from('notificacoes').insert({
              user_id: barbeiro.user_id,
              agendamento_id: appointment.id,
              titulo: '🔴 Novo Agendamento',
              mensagem: `${profile?.nome || 'Cliente'} agendou ${servico?.nome || 'serviço'} para ${dateFormatted} às ${bookingData.hora.substring(0, 5)} — Pagamento na barbearia.`,
              tipo: 'geral',
              lida: false,
            });
          }
        }
      } catch (notifError) {
        console.error('Error sending barber notification:', notifError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentMethod: 'cash',
          appointment,
          payment,
          appointmentId: appointment.id,
          message: 'Agendamento confirmado!',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For PIX and Card, create pending booking first
    console.log('Creating pending booking for PIX/Card payment');
    
    const { data: pendingBooking, error: pendingError } = await supabase
      .from('pending_bookings')
      .insert({
        user_id: user.id,
        servico_id: bookingData.servico_id,
        barbeiro_id: bookingData.barbeiro_id,
        data: bookingData.data,
        hora: bookingData.hora,
        duracao: bookingData.duracao,
        preco: bookingData.preco,
        observacoes: bookingData.observacoes,
        payment_method: metodo,
      })
      .select()
      .single();

    if (pendingError) {
      console.error('Failed to create pending booking:', pendingError);
      throw pendingError;
    }

    console.log('Pending booking created:', pendingBooking.id);

    if (!bookingData.barbeiro_id) throw new Error('Barbeiro obrigatório');
    const wooviPayment = await createWooviCharge(supabase, {
      correlationID: `book-${pendingBooking.id}`, userId: user.id,
      barberId: bookingData.barbeiro_id, amount: pendingBooking.preco,
      comment: `Reserva ${pendingBooking.id.slice(0, 8)}`,
      target: { pending_booking_id: pendingBooking.id, metadata: { reschedule_from_id: rescheduleFromId ?? null } },
    });
    const { error: saveError } = await supabase.from('pending_bookings').update({
      payment_intent_id: wooviPayment.id,
      pix_qr_code: wooviPayment.pixQrCode.encodedImage,
      pix_payload: wooviPayment.pixQrCode.payload,
    }).eq('id', pendingBooking.id);
    if (saveError) throw saveError;
    return new Response(JSON.stringify({ success: true, paymentMethod: 'pix',
      pendingBookingId: pendingBooking.id, pendingBooking, wooviPayment,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error processing payment:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Erro ao processar pagamento',
        details: error.toString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
