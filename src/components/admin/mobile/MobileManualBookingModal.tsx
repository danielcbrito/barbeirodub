import { useState, useEffect, memo, useRef } from "react";
import { format, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Search, 
  User, 
  Clock, 
  DollarSign, 
  Calendar, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Loader2,
  AlertCircle,
  Scissors,
  ArrowRight,
  Plus,
  Minus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MobileManualBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  initialTime: string;
  onSuccess: () => void;
  /** Quando true, permite encaixe em qualquer horário sem validação de conflito */
  skipValidation?: boolean;
  /** ID do barbeiro para associar ao agendamento */
  barbeiroId?: string;
  /** ID do tenant para filtrar serviços e barbeiros */
  tenantId?: string | null;
}

interface Service {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  preco: number;
}

interface Client {
  id: string;
  nome: string;
  telefone: string | null;
}

interface Barber {
  id: string;
  apelido: string;
  foto_url: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface ScheduleConfig {
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  aberto?: boolean | null;
  delay_entre_servicos?: number | null;
}

export function MobileManualBookingModal({ 
  open, 
  onOpenChange, 
  date, 
  initialTime, 
  onSuccess,
  skipValidation = false,
  barbeiroId,
  tenantId
}: MobileManualBookingModalProps) {
  const initialStoredBarbeiroId = typeof window !== "undefined" ? localStorage.getItem("barbeiroId") : null;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // Form state
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [fallbackBarbeiroId, setFallbackBarbeiroId] = useState<string | null>(barbeiroId || initialStoredBarbeiroId);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [manualClientName, setManualClientName] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [observations, setObservations] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchScreenOpen, setIsSearchScreenOpen] = useState(false);
  const [validationError, setValidationError] = useState("");
  
  const isSubmittingRef = useRef(false);

  // Resolve barbeiro ID: prop -> seleção -> fallback local/session
  const resolvedBarbeiroId = barbeiroId || selectedBarber?.id || fallbackBarbeiroId || null;
  const shouldShowBarberSelection = !barbeiroId && !fallbackBarbeiroId;

  useEffect(() => {
    if (open) {
      loadInitialData();
      setSelectedTime(initialTime);
      resetForm();
    }
  }, [open, initialTime]);

  // Trava o scroll do fundo (agenda) quando o modal estiver aberto
  useEffect(() => {
    if (!open) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open && selectedService) {
      loadAvailableSlots();
    }
  }, [open, selectedService, quantity, date]);

  const resetForm = () => {
    setStep(1);
    setSelectedClient(null);
    setSelectedBarber(null);
    setFallbackBarbeiroId(barbeiroId || initialStoredBarbeiroId);
    setManualClientName("");
    setSelectedService(null);
    setQuantity(1);
    setObservations("");
    setSearchQuery("");
    setIsSearchScreenOpen(false);
    setValidationError("");
  };

  const resolveBarbeiroIdForBooking = async (): Promise<string | null> => {
    if (resolvedBarbeiroId) return resolvedBarbeiroId;

    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    if (!currentUserId) return null;

    let ownBarberQuery = supabase
      .from("barbeiros")
      .select("id, apelido, foto_url")
      .eq("user_id", currentUserId)
      .eq("ativo", true)
      .is("deleted_at", null);

    if (tenantId) {
      ownBarberQuery = ownBarberQuery.eq("tenant_id", tenantId);
    }

    const { data: ownBarber } = await ownBarberQuery.maybeSingle();

    if (ownBarber?.id) {
      setFallbackBarbeiroId(ownBarber.id);
      setSelectedBarber(ownBarber);
      return ownBarber.id;
    }

    return null;
  };

  const loadInitialData = async () => {
    try {
      console.log('[MobileEncaixe] Carregando dados iniciais...', { tenantId, barbeiroId });
      const { data: { session } } = await supabase.auth.getSession();

      // ── Resolver tenant_id efetivo ──
      // Se não vier por prop, resolver a partir do barbeiro (prop ou logado)
      let effectiveTenantId = tenantId || null;

      // Auto-resolver profissional do usuário logado
      if (session?.user?.id) {
        let ownBarberQuery = supabase
          .from("barbeiros")
          .select("id, apelido, foto_url, tenant_id")
          .eq("user_id", session.user.id)
          .eq("ativo", true)
          .is("deleted_at", null);

        if (effectiveTenantId) {
          ownBarberQuery = ownBarberQuery.eq("tenant_id", effectiveTenantId);
        }

        const { data: ownBarber } = await ownBarberQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (ownBarber) {
          setFallbackBarbeiroId(ownBarber.id);
          setSelectedBarber({ id: ownBarber.id, apelido: ownBarber.apelido, foto_url: ownBarber.foto_url });
          // Resolver tenant a partir do barbeiro encontrado
          if (!effectiveTenantId && ownBarber.tenant_id) {
            effectiveTenantId = ownBarber.tenant_id;
            console.log('[MobileEncaixe] Tenant resolvido via barbeiro logado:', effectiveTenantId);
          }
        }
      }

      // Se barbeiroId foi passado por prop mas sem tenantId, buscar tenant do barbeiro
      if (!effectiveTenantId && barbeiroId) {
        const { data: barberData } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", barbeiroId)
          .maybeSingle();
        if (barberData?.tenant_id) {
          effectiveTenantId = barberData.tenant_id;
          console.log('[MobileEncaixe] Tenant resolvido via barbeiroId prop:', effectiveTenantId);
        }
      }

      console.log('[MobileEncaixe] Tenant efetivo para serviços:', effectiveTenantId);

      // Filtrar serviços pelo tenant resolvido
      let servicesQuery = supabase
        .from("servicos")
        .select("id, nome, descricao, duracao_minutos, preco")
        .eq("ativo", true);
      
      if (effectiveTenantId) {
        servicesQuery = servicesQuery.eq("tenant_id", effectiveTenantId);
      } else {
        servicesQuery = servicesQuery.is("tenant_id", null);
      }

      const [servicesRes, clientsRes] = await Promise.all([
        servicesQuery.order("nome"),
        supabase.from("profiles").select("id, nome, telefone").order("nome")
      ]);

      if (servicesRes.error) {
        console.error('[MobileEncaixe] Erro ao carregar serviços:', servicesRes.error);
        toast.error("Erro ao carregar serviços");
      } else {
        console.log(`[MobileEncaixe] ${servicesRes.data?.length || 0} serviços carregados para tenant ${effectiveTenantId || 'global'}`);
      }

      if (clientsRes.error) {
        console.error('[MobileEncaixe] Erro ao carregar clientes:', clientsRes.error);
      }

      const loadedServices = servicesRes.data || [];
      setServices(loadedServices);
      setClients(clientsRes.data || []);

      // Fallback: se nenhum serviço encontrado, tentar globais
      if (loadedServices.length === 0 && effectiveTenantId) {
        console.warn('[MobileEncaixe] Nenhum serviço encontrado para o tenant, tentando fallback global...');
        const { data: fallbackServices, error: fallbackError } = await supabase
          .from("servicos")
          .select("id, nome, descricao, duracao_minutos, preco")
          .eq("ativo", true)
          .is("tenant_id", null)
          .order("nome");

        if (!fallbackError && fallbackServices && fallbackServices.length > 0) {
          console.log(`[MobileEncaixe] Fallback: ${fallbackServices.length} serviços globais encontrados`);
          setServices(fallbackServices);
        }
      }
      
      // Carregar barbeiros apenas quando necessário selecionar manualmente
      if (!barbeiroId && !fallbackBarbeiroId) {
        let barbersQuery = supabase
          .from("barbeiros")
          .select("id, apelido, foto_url")
          .eq("ativo", true)
          .is("deleted_at", null);
        
        if (effectiveTenantId) {
          barbersQuery = barbersQuery.eq("tenant_id", effectiveTenantId);
        } else {
          barbersQuery = barbersQuery.is("tenant_id", null);
        }

        const { data: barbersData } = await barbersQuery.order("apelido");
        setBarbers(barbersData || []);
      }
    } catch (error) {
      console.error("[MobileEncaixe] Error loading data:", error);
      toast.error("Erro ao carregar dados do encaixe");
    }
  };

  const loadAvailableSlots = async () => {
    if (!selectedService) return;
    
    setLoadingSlots(true);
    try {
      // Encaixe manual (skipValidation=true): barbeiro tem liberdade total de agenda.
      // Gera TODOS os slots do dia sem filtrar conflitos — o barbeiro decide onde encaixar.
      if (skipValidation) {
        const slots: TimeSlot[] = [];
        let current = new Date();
        current.setHours(6, 0, 0, 0);
        
        const end = new Date();
        end.setHours(23, 0, 0, 0);

        while (current <= end) {
          const timeStr = format(current, "HH:mm");
          slots.push({ time: timeStr, available: true });
          current = addMinutes(current, 10);
        }

        setAvailableSlots(slots);
        setLoadingSlots(false);
        return;
      }

      const dayOfWeek = new Date(date + "T12:00:00").getDay();
      
      // Buscar config do barbeiro primeiro, fallback para global
      let config: ScheduleConfig | null = null;
      const effectiveBarberId = resolvedBarbeiroId;

      if (effectiveBarberId) {
        const { data: barberConfig } = await supabase
          .from("configuracoes_horario_barbeiro")
          .select("hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, aberto, delay_entre_servicos")
          .eq("barbeiro_id", effectiveBarberId)
          .eq("dia_semana", dayOfWeek)
          .maybeSingle();
        if (barberConfig) config = barberConfig;
      }

      if (!config) {
        // Escopo por tenant do barbeiro para evitar vazamento entre barbearias
        let tenantId: string | null = null;
        if (effectiveBarberId) {
          const { data: barbRow } = await supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("id", effectiveBarberId)
            .maybeSingle();
          tenantId = (barbRow as { tenant_id?: string } | null)?.tenant_id ?? null;
        }
        const exceptionalData = tenantId
          ? (await supabase
              .from("horarios_excepcionais")
              .select("hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, aberto")
              .eq("data", date)
              .eq("tenant_id", tenantId)
              .maybeSingle()).data
          : null;
        if (exceptionalData) {
          config = exceptionalData;
        } else {
          const { data: globalConfig } = await supabase
            .from("configuracoes_horario")
            .select("hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, aberto, delay_entre_servicos")
            .eq("dia_semana", dayOfWeek)
            .maybeSingle();
          config = globalConfig;
        }
      }

      if (!config) {
        config = {
          hora_abertura: "08:00",
          hora_fechamento: "20:00",
          hora_almoco_inicio: null,
          hora_almoco_fim: null
        };
      }

      const DELAY_MINUTES = config.delay_entre_servicos || 10;

      // Buscar agendamentos FILTRADOS por barbeiro
      let appointmentsQuery = supabase
        .from("agendamentos")
        .select("hora, duracao")
        .eq("data", date)
        .in("status", ["pending", "confirmed", "completed"]);
      
      if (effectiveBarberId) {
        appointmentsQuery = appointmentsQuery.eq("barbeiro_id", effectiveBarberId);
      }

      const { data: appointmentsData } = await appointmentsQuery;

      const existingAppointments = appointmentsData || [];
      
      const slots: TimeSlot[] = [];
      const [startH, startM] = config.hora_abertura.split(":").map(Number);
      const [endH, endM] = config.hora_fechamento.split(":").map(Number);
      
      let current = new Date();
      current.setHours(startH, startM, 0, 0);
      
      const end = new Date();
      end.setHours(endH, endM, 0, 0);

      const totalSelectedDuration = selectedService.duracao_minutos * Math.max(1, quantity);
      const lastPossibleStart = addMinutes(end, -totalSelectedDuration);

      while (current <= lastPossibleStart) {
        const timeStr = format(current, "HH:mm");
        
        let isLunch = false;
        if (config.hora_almoco_inicio && config.hora_almoco_fim) {
          const [lsH, lsM] = config.hora_almoco_inicio.split(":").map(Number);
          const [leH, leM] = config.hora_almoco_fim.split(":").map(Number);
          const currentMinutes = current.getHours() * 60 + current.getMinutes();
          const lunchStart = lsH * 60 + lsM;
          const lunchEnd = leH * 60 + leM;
          isLunch = currentMinutes >= lunchStart && currentMinutes < lunchEnd;
        }

        const serviceEnd = addMinutes(current, totalSelectedDuration);
        let hasConflict = false;
        
        for (const apt of existingAppointments) {
          const [aptH, aptM] = apt.hora.split(":").map(Number);
          const aptStart = new Date();
          aptStart.setHours(aptH, aptM, 0, 0);
          const aptEnd = addMinutes(aptStart, apt.duracao || 30);
          const aptEndWithDelay = addMinutes(aptEnd, DELAY_MINUTES);
          
          if (current < aptEndWithDelay && serviceEnd > aptStart) {
            hasConflict = true;
            break;
          }
        }

        slots.push({
          time: timeStr,
          available: !isLunch && !hasConflict
        });

        current = addMinutes(current, 10);
      }

      setAvailableSlots(slots);
    } catch (error) {
      console.error("Error loading slots:", error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setLoading(true);
    setValidationError("");

    try {
      const effectiveBarbeiroId = await resolveBarbeiroIdForBooking();

      // Encaixe manual: conflitos não são filtrados — o barbeiro tem liberdade total de agenda
      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-appointment', {
        body: {
          data: date,
          hora: selectedTime,
          duracao: (selectedService?.duracao_minutos || 30) * Math.max(1, quantity),
          userId: 'manual-booking',
          barbeiro_id: effectiveBarbeiroId,
          barberId: effectiveBarbeiroId,
          skipValidation: skipValidation
        }
      });

      // A edge function retorna { success, data: { valid, message } }
      const result = validation?.data ?? validation;
      if (validationError || !result?.valid) {
        setValidationError(result?.message || "Horário indisponível. Já existe um agendamento nesse período.");
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      let clientId = selectedClient?.id;
      let appointmentObservations = observations.trim();

      // Cliente walk-in
      if (!selectedClient && manualClientName.trim()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error("Você precisa estar logado");
        }
        
        clientId = session.user.id;
        const walkInNote = `🚶 Cliente walk-in: ${manualClientName.trim()}`;
        appointmentObservations = appointmentObservations 
          ? `${walkInNote}\n${appointmentObservations}`
          : walkInNote;
      }

      if (!clientId || !selectedService || !effectiveBarbeiroId) throw new Error("Dados incompletos");

      // Buscar duração personalizada do barbeiro para este serviço
      let finalDuration = selectedService.duracao_minutos;
      if (effectiveBarbeiroId) {
        const { data: customDuration } = await supabase
          .from("barbeiro_servico_duracao")
          .select("duracao_personalizada")
          .eq("barbeiro_id", effectiveBarbeiroId)
          .eq("servico_id", selectedService.id)
          .maybeSingle();
        if (customDuration?.duracao_personalizada) {
          finalDuration = customDuration.duracao_personalizada;
        }
      }

      // Criar N agendamentos consecutivos (encaixes em sequência)
      const qty = Math.max(1, quantity);
      const [bh, bm] = selectedTime.split(":").map(Number);
      const baseMinutes = bh * 60 + bm;
      const rows = Array.from({ length: qty }, (_, i) => {
        const slot = baseMinutes + finalDuration * i;
        const sH = Math.floor(slot / 60).toString().padStart(2, "0");
        const sM = (slot % 60).toString().padStart(2, "0");
        return {
          user_id: clientId!,
          servico_id: selectedService.id,
          data: date,
          hora: `${sH}:${sM}:00`,
          duracao: finalDuration,
          preco: selectedService.preco,
          status: "confirmed" as const,
          barbeiro_confirmou: true,
          cliente_confirmou: true,
          observacoes: appointmentObservations || null,
          tipo_agendamento: "encaixe_manual",
          criado_por: "barbeiro",
          payment_method: "cash",
          barbeiro_id: effectiveBarbeiroId,
        };
      });

      const { error: appointmentError } = await supabase
        .from("agendamentos")
        .insert(rows);

      if (appointmentError) throw appointmentError;

      toast.success(qty > 1 ? `✅ ${qty} encaixes criados!` : "✅ Encaixe criado com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Erro ao criar encaixe:", error);
      setValidationError(error instanceof Error ? error.message : "Erro ao criar encaixe");
      toast.error("Erro ao criar encaixe");
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const filteredClients = searchQuery.trim() 
    ? clients.filter(c => 
        c.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.telefone?.includes(searchQuery)
      )
    : [];

  const canProceedStep1 = selectedService !== null && !!resolvedBarbeiroId;
  const canProceedStep2 = selectedTime !== "";
  const canProceedStep3 = selectedClient || manualClientName.trim();

  if (!open) return null;

  const showCTA = (step === 1 && canProceedStep1) || (step === 2 && canProceedStep2) || (step === 3 && canProceedStep3) || step === 4;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background flex flex-col pt-[env(safe-area-inset-top)]"
      >
        {/* ═══ HEADER FIXO — fora do scroll ═══ */}
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/40 z-10">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}
                className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95 transition-all text-foreground shadow-sm"
                aria-label="Voltar"
              >
                {step > 1 ? <ChevronLeft className="w-5 h-5 stroke-[2.2]" /> : <X className="w-5 h-5 stroke-[2.2]" />}
              </button>
              
              <div className="text-center">
                <h2 className="font-semibold text-[15px] text-foreground tracking-tight">Novo Encaixe</h2>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {format(new Date(date + "T12:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
              </div>
              
              <div className="w-9" />
            </div>

            {/* Stepper compacto inline */}
            <div className="flex items-center justify-center gap-1.5">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                    step > s
                      ? "bg-foreground text-background"
                      : step === s 
                        ? "bg-foreground text-background shadow-sm ring-2 ring-foreground/20" 
                        : "bg-secondary text-muted-foreground/60 border border-border/40"
                  )}>
                    {step > s ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : s}
                  </div>
                  {s < 4 && (
                    <div className={cn(
                      "w-6 h-0.5 mx-1 transition-all rounded-full",
                      step > s ? "bg-foreground" : "bg-border/40"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>

        {/* ═══ SCROLL AREA — isolada entre header e footer ═══ */}
        <div className={cn("flex-1 min-h-0 overflow-y-auto overscroll-contain", showCTA ? "pb-4" : "pb-8")}>
          <div>
            {/* Step 1: Barbeiro + Serviço */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="px-4 pt-2 pb-4 space-y-4"
              >
                {/* Seleção de Barbeiro (card seletor compacto) */}
                {shouldShowBarberSelection && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Profissional</p>
                    <div className="flex flex-wrap gap-2">
                      {barbers.map((barber) => {
                        const isSelected = selectedBarber?.id === barber.id;
                        return (
                          <button
                            key={barber.id}
                            onClick={() => setSelectedBarber(barber)}
                            className={cn(
                              "flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border transition-all active:scale-[0.97] shadow-sm",
                              isSelected
                                ? "bg-card border-foreground/40 ring-1 ring-foreground/20 text-foreground"
                                : "bg-card border-border/60 text-muted-foreground hover:bg-secondary/40"
                            )}
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                              isSelected ? "bg-foreground text-background" : "bg-secondary text-foreground"
                            )}>
                              {barber.apelido.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">
                              {barber.apelido}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-foreground stroke-[2.5]" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-border/30 mt-2" />
                  </div>
                )}

                {/* Serviços — lista em cards modernos */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Serviço</p>

                  {services.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 rounded-2xl bg-card border border-border/60">
                      <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                        <AlertCircle className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Nenhum serviço encontrado</p>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Verifique se existem serviços ativos cadastrados para esta barbearia.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {services.map((service) => {
                        const isSelected = selectedService?.id === service.id;
                        return (
                          <div
                            key={service.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedService(service);
                              setQuantity(1);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedService(service);
                                setQuantity(1);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer shadow-sm",
                              isSelected
                                ? "bg-card border-foreground/40 ring-1 ring-foreground/15"
                                : "bg-card border-border/60 hover:bg-secondary/30"
                            )}
                          >
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                              isSelected ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
                            )}>
                              <Scissors className="w-4 h-4" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className={cn("text-[14px] font-semibold truncate", isSelected ? "text-foreground" : "text-foreground/90")}>
                                {service.nome}
                              </p>
                              {service.descricao && (
                                <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{service.descricao}</p>
                              )}
                              <p className="text-[11px] text-muted-foreground mt-0.5">{service.duracao_minutos} min</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isSelected ? (
                                <div
                                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 px-1.5 py-1 shadow-sm"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                    disabled={quantity <= 1}
                                    className="w-7 h-7 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition text-foreground"
                                    aria-label="Diminuir quantidade"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="w-5 text-center text-sm font-bold tabular-nums text-foreground">
                                    {quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                                    disabled={quantity >= 10}
                                    className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-sm"
                                    aria-label="Aumentar quantidade"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[13px] text-foreground font-semibold tabular-nums">
                                  R$ {service.preco.toFixed(0)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 2: Horário */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="px-4 pt-2 pb-4 space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Horário</p>
                  <p className="text-[12px] text-muted-foreground">
                    {quantity > 1 ? `${quantity}× ` : ""}{selectedService?.nome} · {(selectedService?.duracao_minutos || 0) * quantity} min
                  </p>
                </div>

                {loadingSlots ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 animate-spin text-foreground/50" />
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.map(({ time, available }) => (
                      <button
                        key={time}
                        onClick={() => available && setSelectedTime(time)}
                        disabled={!available}
                        className={cn(
                          "py-2.5 rounded-xl text-[13px] font-semibold transition-all tabular-nums",
                          selectedTime === time
                            ? "bg-foreground text-background shadow-md shadow-foreground/20 active:scale-95"
                            : available
                              ? "bg-card border border-border/60 text-foreground hover:bg-secondary/50 active:scale-95 shadow-sm"
                              : "bg-secondary/15 text-muted-foreground/30 cursor-not-allowed border border-border/20 line-through"
                        )}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                )}

                {selectedTime && selectedService && (
                  <div className="p-3 px-4 rounded-2xl bg-card border border-border/60 shadow-sm flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedTime} às {(() => {
                        const [h, m] = selectedTime.split(":").map(Number);
                        const end = new Date();
                        end.setHours(h, m, 0, 0);
                        return format(addMinutes(end, selectedService.duracao_minutos * quantity), "HH:mm");
                      })()}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-muted-foreground bg-secondary/80 px-2.5 py-0.5 rounded-full">
                      {selectedService.duracao_minutos * quantity} min
                    </span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Cliente */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="px-4 pt-2 pb-4 space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Cliente</p>
                  <p className="text-[12px] text-muted-foreground">Selecione na lista ou digite o nome</p>
                </div>

                {selectedClient ? (
                  <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-foreground font-bold text-base shrink-0">
                        {selectedClient.nome ? selectedClient.nome.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground text-[15px] truncate">{selectedClient.nome}</p>
                        {selectedClient.telefone && (
                          <p className="text-[12px] text-muted-foreground truncate mt-0.5">{selectedClient.telefone}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(null);
                        setSearchQuery("");
                      }}
                      className="h-9 px-4 rounded-full bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold transition-colors shrink-0 shadow-sm active:scale-95"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Barra de pesquisa mais larga — abre a tela de busca dedicada */}
                    <div
                      onClick={() => setIsSearchScreenOpen(true)}
                      className="w-full h-[54px] px-5 rounded-full bg-card border border-border/80 text-muted-foreground flex items-center gap-3.5 cursor-pointer hover:border-foreground/40 active:scale-[0.99] transition-all shadow-sm"
                    >
                      <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="text-[14px] text-muted-foreground/70 truncate">
                        Buscar cliente cadastrado...
                      </span>
                    </div>

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border/40" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-background px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          ou digite o nome
                        </span>
                      </div>
                    </div>

                    {/* Input do cliente avulso mais largo e confortável */}
                    <input
                      type="text"
                      placeholder="Nome do cliente avulso (walk-in)..."
                      value={manualClientName}
                      onChange={(e) => {
                        setManualClientName(e.target.value);
                        setSelectedClient(null);
                      }}
                      className="w-full h-[54px] px-5 rounded-full bg-card border border-border/80 text-foreground placeholder:text-muted-foreground/60 text-[14px] focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 shadow-sm transition-all"
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 4: Confirmação */}
            {step === 4 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="px-4 pt-2 pb-4 space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Confirmação</p>
                  <p className="text-[12px] text-muted-foreground">Revise os detalhes do encaixe</p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-sm space-y-1">
                    <div className="flex items-center gap-2.5 text-muted-foreground mb-1">
                      <Calendar className="w-4 h-4 text-foreground/70" />
                      <span className="text-[12px] font-semibold uppercase tracking-wider">Data e Horário</span>
                    </div>
                    <p className="text-[16px] font-bold text-foreground capitalize">
                      {format(new Date(date + "T12:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </p>
                    <p className="text-[14px] font-semibold text-foreground/80 tabular-nums">
                      Horário: {selectedTime}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-sm space-y-1.5">
                    <div className="flex items-center gap-2.5 text-muted-foreground mb-1">
                      <Scissors className="w-4 h-4 text-foreground/70" />
                      <span className="text-[12px] font-semibold uppercase tracking-wider">Serviço</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[15px] font-bold text-foreground truncate">
                        {selectedService?.nome}
                        {quantity > 1 && <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-foreground">×{quantity}</span>}
                      </p>
                      <span className="text-[15px] font-bold text-foreground tabular-nums">
                        R$ {((selectedService?.preco || 0) * quantity).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {(selectedService?.duracao_minutos || 0) * quantity} minutos de duração
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-card border border-border/60 shadow-sm space-y-1">
                    <div className="flex items-center gap-2.5 text-muted-foreground mb-1">
                      <User className="w-4 h-4 text-foreground/70" />
                      <span className="text-[12px] font-semibold uppercase tracking-wider">Cliente</span>
                    </div>
                    <p className="text-[15px] font-bold text-foreground">
                      {selectedClient?.nome || manualClientName}
                    </p>
                    {selectedClient?.telefone && (
                      <p className="text-[12px] text-muted-foreground">{selectedClient.telefone}</p>
                    )}
                  </div>

                  <Textarea
                    placeholder="Observações adicionais (opcional)..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="min-h-[80px] rounded-2xl bg-card border-border/70 text-[13px] p-3.5 shadow-sm focus-visible:ring-1 focus-visible:ring-foreground/20 placeholder:text-muted-foreground/60"
                  />

                  {validationError && (
                    <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                      <p className="text-sm text-destructive">{validationError}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* ═══ BOTÃO FLUTUANTE DE AÇÃO — PRETO, LIMPO, LARGO E ARREDONDADO ═══ */}
        <AnimatePresence>
          {showCTA && !isSearchScreenOpen && (
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex-shrink-0 z-30 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-background via-background/90 to-transparent"
            >
              <div className="relative mx-auto max-w-md">
                <button
                  type="button"
                  onClick={() => {
                    if (step === 4) handleSubmit();
                    else setStep((s) => (s + 1) as 2 | 3 | 4);
                  }}
                  disabled={step === 4 && loading}
                  className={cn(
                    "w-full h-[52px] rounded-full font-bold text-[15px] flex items-center justify-center tracking-tight",
                    "bg-foreground text-background shadow-lg shadow-foreground/20 active:scale-[0.98] transition-all",
                    loading && "cursor-wait opacity-70"
                  )}
                >
                  {step === 4 ? (
                    loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-background mr-2" />
                        <span>Criando encaixe...</span>
                      </>
                    ) : (
                      <span>Confirmar Encaixe</span>
                    )
                  ) : (
                    <span>Continuar</span>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ TELA DEDICADA DE BUSCA DE CLIENTES (FULL OVERLAY) ═══ */}
        <AnimatePresence>
          {isSearchScreenOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[99999] bg-background w-full h-[100dvh] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overscroll-none select-none"
            >
              {/* Header da busca — minimalista e direto */}
              <div className="px-4 py-3 border-b border-border/40 bg-background flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchScreenOpen(false);
                    setSearchQuery("");
                  }}
                  className="w-9 h-9 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center text-foreground/80 hover:text-foreground shrink-0 active:scale-95 transition-all"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2]" />
                </button>
                
                <div className="relative flex-1 flex items-center">
                  <Search className="absolute left-3.5 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Buscar cliente por nome ou telefone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-9 rounded-full bg-secondary/30 border border-border/50 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border/80 focus:bg-secondary/40 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground active:scale-90 transition-all"
                      aria-label="Limpar texto"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista minimalista em fila */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {searchQuery.trim() === "" ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium tracking-wider text-muted-foreground/50 uppercase px-2 mb-2">
                      Clientes Cadastrados ({clients.length})
                    </p>
                    <div className="divide-y divide-border/20">
                      {clients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setSelectedClient(client);
                            setSearchQuery("");
                            setManualClientName("");
                            setIsSearchScreenOpen(false);
                          }}
                          className="w-full py-3 px-2 flex items-center justify-between hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <User className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground shrink-0 transition-colors" />
                            <div className="min-w-0">
                              <p className="text-[14px] font-normal text-foreground truncate">
                                {client.nome}
                              </p>
                              {client.telefone && (
                                <p className="text-[12px] text-muted-foreground/50 truncate tabular-nums">
                                  {client.telefone}
                                </p>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : filteredClients.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium tracking-wider text-muted-foreground/50 uppercase px-2 mb-2">
                      Resultados ({filteredClients.length})
                    </p>
                    <div className="divide-y divide-border/20">
                      {filteredClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setSelectedClient(client);
                            setSearchQuery("");
                            setManualClientName("");
                            setIsSearchScreenOpen(false);
                          }}
                          className="w-full py-3 px-2 flex items-center justify-between hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <User className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground shrink-0 transition-colors" />
                            <div className="min-w-0">
                              <p className="text-[14px] font-normal text-foreground truncate">
                                {client.nome}
                              </p>
                              {client.telefone && (
                                <p className="text-[12px] text-muted-foreground/50 truncate tabular-nums">
                                  {client.telefone}
                                </p>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center space-y-4">
                    <p className="text-[14px] text-muted-foreground/60">
                      Nenhum cliente cadastrado encontrado
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setManualClientName(searchQuery.trim());
                        setSelectedClient(null);
                        setSearchQuery("");
                        setIsSearchScreenOpen(false);
                      }}
                      className="px-5 py-2.5 rounded-full bg-foreground text-background font-medium text-xs shadow-sm active:scale-95 transition-all"
                    >
                      Usar &quot;{searchQuery.trim()}&quot; como cliente avulso
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

