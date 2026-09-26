import { useState, useEffect, memo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useManualBooking } from "@/hooks/useAdminMutations";
import { toast } from "sonner";
import { Loader2, AlertCircle, Search, User, Clock, DollarSign, Calendar, Check, ChevronRight, ChevronLeft, Plus, Minus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from "./ErrorBoundary";
import { cn } from "@/lib/utils";

interface ManualBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  onSuccess: () => void;
  /** Quando true, pula validação de conflito de horário */
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
  cpf: string | null;
}

interface Barber {
  id: string;
  apelido: string;
  foto_url: string | null;
}

// Helper: Promise com timeout
const promiseWithTimeout = <T,>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: operação demorou mais que ' + ms + 'ms')), ms)
    )
  ]);
};

export function ManualBookingModal({ open, onOpenChange, date, time, onSuccess, skipValidation = false, barbeiroId, tenantId }: ManualBookingModalProps) {
  const initialStoredBarbeiroId = typeof window !== "undefined" ? localStorage.getItem("barbeiroId") : null;
  const manualBookingMutation = useManualBooking();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  
  // Form state
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [fallbackBarbeiroId, setFallbackBarbeiroId] = useState<string | null>(barbeiroId || initialStoredBarbeiroId);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [manualClientName, setManualClientName] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [observations, setObservations] = useState("");
  const [validationError, setValidationError] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<"idle" | "success" | "error">("idle");
  
  // Prevent multiple submits
  const isSubmittingRef = useRef(false);
  
  // Resolve barbeiro ID: prop -> seleção -> fallback local/session
  const resolvedBarbeiroId = barbeiroId || selectedBarber?.id || fallbackBarbeiroId || null;
  const shouldShowBarberSelection = !barbeiroId && !fallbackBarbeiroId;

  useEffect(() => {
    if (open) {
      loadServices();
      loadClients();
      if (shouldShowBarberSelection) loadBarbers();
      resetForm();
    }
  }, [open, shouldShowBarberSelection]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredClients([]);
    } else {
      const filtered = clients.filter(
        (c) =>
          c.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.telefone?.includes(searchQuery) ||
          c.cpf?.includes(searchQuery)
      );
      setFilteredClients(filtered);
    }
  }, [searchQuery, clients]);

  const resetForm = () => {
    setStep(1);
    setSelectedClient(null);
    setSelectedBarber(null);
    setFallbackBarbeiroId(barbeiroId || initialStoredBarbeiroId);
    setManualClientName("");
    setSelectedService("");
    setQuantity(1);
    setObservations("");
    setValidationError("");
    setSearchQuery("");
    setFilteredClients([]);
    setConfirmStatus("idle");
  };

  const loadServices = async () => {
    try {
      // ── Resolver tenant_id efetivo ──
      let effectiveTenantId = tenantId || null;

      // Se tenantId não foi passado, resolver a partir do barbeiro
      if (!effectiveTenantId) {
        const barberIdToResolve = barbeiroId || fallbackBarbeiroId;
        if (barberIdToResolve) {
          const { data: barberData } = await supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("id", barberIdToResolve)
            .maybeSingle();
          if (barberData?.tenant_id) {
            effectiveTenantId = barberData.tenant_id;
            console.log('[ManualBooking] Tenant resolvido via barbeiro:', effectiveTenantId);
          }
        }

        // Fallback: buscar barbeiro do usuário logado
        if (!effectiveTenantId) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const { data: ownBarber } = await supabase
              .from("barbeiros")
              .select("id, tenant_id")
              .eq("user_id", session.user.id)
              .eq("ativo", true)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (ownBarber?.tenant_id) {
              effectiveTenantId = ownBarber.tenant_id;
              console.log('[ManualBooking] Tenant resolvido via barbeiro logado:', effectiveTenantId);
              // Também resolver o barbeiro se necessário
              if (!barbeiroId && !fallbackBarbeiroId) {
                setFallbackBarbeiroId(ownBarber.id);
              }
            }
          }
        }
      }

      console.log('[ManualBooking] Tenant efetivo para serviços:', effectiveTenantId);

      let query = supabase
        .from("servicos")
        .select("id, nome, descricao, duracao_minutos, preco")
        .eq("ativo", true);
      
      if (effectiveTenantId) {
        query = query.eq("tenant_id", effectiveTenantId);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data, error } = await query.order("nome");

      if (error) {
        console.error("[ManualBooking] Erro ao carregar serviços:", error);
        toast.error("Erro ao carregar serviços");
        return;
      }

      console.log(`[ManualBooking] ${data?.length || 0} serviços carregados para tenant ${effectiveTenantId || 'global'}`);
      
      let finalServices = data || [];

      // Fallback: se nenhum serviço encontrado para o tenant, buscar globais
      if (finalServices.length === 0 && effectiveTenantId) {
        console.warn('[ManualBooking] Nenhum serviço do tenant, tentando fallback global...');
        const { data: fallbackData } = await supabase
          .from("servicos")
          .select("id, nome, descricao, duracao_minutos, preco")
          .eq("ativo", true)
          .is("tenant_id", null)
          .order("nome");
        
        if (fallbackData && fallbackData.length > 0) {
          console.log(`[ManualBooking] Fallback: ${fallbackData.length} serviços globais`);
          finalServices = fallbackData;
        }
      }

      setServices(finalServices);
    } catch (error) {
      console.error("Error loading services:", error);
      toast.error("Erro ao carregar serviços");
    }
  };

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, telefone, cpf")
        .order("nome");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast.error("Erro ao carregar clientes");
    }
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
      setSelectedBarber(ownBarber as Barber);
      return ownBarber.id;
    }

    return null;
  };

  const loadBarbers = async () => {
    try {
      let query = supabase
        .from("barbeiros")
        .select("id, apelido, foto_url, user_id")
        .eq("ativo", true)
        .is("deleted_at", null);

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const [barbersRes, sessionRes] = await Promise.all([
        query.order("apelido"),
        supabase.auth.getSession()
      ]);

      if (barbersRes.error) throw barbersRes.error;
      const barbersData = barbersRes.data || [];
      setBarbers(barbersData);

      // Auto-resolver profissional do usuário logado para evitar bloqueio indevido no step 2
      const currentUserId = sessionRes.data.session?.user?.id;
      if (currentUserId) {
        const ownBarber = barbersData.find((b) => (b as any).user_id === currentUserId);

        if (ownBarber) {
          setFallbackBarbeiroId(ownBarber.id);
          setSelectedBarber(ownBarber as Barber);
        } else {
          let ownBarberQuery = supabase
            .from("barbeiros")
            .select("id, apelido, foto_url, user_id")
            .eq("user_id", currentUserId)
            .eq("ativo", true)
            .is("deleted_at", null);

          if (tenantId) {
            ownBarberQuery = ownBarberQuery.eq("tenant_id", tenantId);
          }

          const { data: ownBarberByUser } = await ownBarberQuery.maybeSingle();
          if (ownBarberByUser) {
            setFallbackBarbeiroId(ownBarberByUser.id);
            setSelectedBarber(ownBarberByUser as Barber);
          }
        }
      }
    } catch (error) {
      console.error("Error loading barbers:", error);
    }
  };

  const validateTimeSlot = async (effectiveBarbeiroId?: string | null) => {
    const selectedServiceData = services.find((s) => s.id === selectedService);
    if (!selectedServiceData) return false;

    try {
      const finalBarbeiroId = effectiveBarbeiroId ?? await resolveBarbeiroIdForBooking();

      // Usar edge function para validação atômica
      console.log('[ManualBooking] Validando horário via edge function...');
      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-appointment', {
        body: {
          data: date,
          hora: time,
          duracao: selectedServiceData.duracao_minutos,
          userId: 'manual-booking',
          barbeiro_id: finalBarbeiroId,
          barberId: finalBarbeiroId,
          skipValidation: skipValidation
        }
      });

      if (validationError) {
        console.error('[ManualBooking] Erro na validação:', validationError);
        setValidationError("Erro ao verificar disponibilidade. Tente novamente.");
        return false;
      }

      // A edge function retorna { success, data: { valid, message } }
      const result = validation?.data ?? validation;
      if (!result?.valid) {
        console.log('[ManualBooking] Horário INDISPONÍVEL:', result?.message);
        setValidationError(result?.message || "Horário indisponível.");
        return false;
      }

      console.log('[ManualBooking] Horário DISPONÍVEL');
      setValidationError("");
      return true;
    } catch (error) {
      console.error('[ManualBooking] Erro na validação:', error);
      setValidationError("Erro ao verificar disponibilidade.");
      return false;
    }
  };

  const handleSubmit = async () => {
    console.log('[Encaixe] Iniciando confirmação', { date, time, selectedService, selectedClient, manualClientName });
    
    // Prevent double-submit
    if (isSubmittingRef.current || manualBookingMutation.isPending) {
      console.warn('[Encaixe] Submit já em andamento, ignorando');
      return;
    }
    
    isSubmittingRef.current = true;
    setLoading(true);
    setValidationError("");

    try {
      // Sempre validar conflitos, mesmo em encaixe (skipValidation só pula horário comercial/almoço)
      console.log('[Encaixe] Validando horário...');
      const effectiveBarbeiroId = await resolveBarbeiroIdForBooking();
      const isValid = await promiseWithTimeout(validateTimeSlot(effectiveBarbeiroId), 8000);
      if (!isValid) {
        console.warn('[Encaixe] Validação falhou');
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }
      console.log('[Encaixe] Horário validado com sucesso');

      const selectedServiceData = services.find((s) => s.id === selectedService);
      if (!selectedServiceData) throw new Error("Serviço não encontrado");

      let clientId = selectedClient?.id;
      let appointmentObservations = observations.trim();

      // Se cliente digitado manualmente (walk-in), usar o barbeiro logado como referência
      if (!selectedClient && manualClientName.trim()) {
        console.log('[Encaixe] Cliente walk-in (manual):', manualClientName.trim());
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error("Você precisa estar logado para criar encaixes");
        }
        clientId = session.user.id;
        const walkInNote = `🚶 Cliente walk-in: ${manualClientName.trim()}`;
        appointmentObservations = appointmentObservations 
          ? `${walkInNote}\n${appointmentObservations}`
          : walkInNote;
      }

      if (!clientId || !effectiveBarbeiroId) throw new Error("Dados incompletos");

      // Buscar duração personalizada do barbeiro para este serviço
      let finalDuration = selectedServiceData.duracao_minutos;
      if (effectiveBarbeiroId) {
        const { data: customDuration } = await supabase
          .from("barbeiro_servico_duracao")
          .select("duracao_personalizada")
          .eq("barbeiro_id", effectiveBarbeiroId)
          .eq("servico_id", selectedService)
          .maybeSingle();
        if (customDuration?.duracao_personalizada) {
          finalDuration = customDuration.duracao_personalizada;
        }
      }

      // Criar N agendamentos consecutivos (encaixes em sequência)
      const [hh, mm] = time.split(":").map(Number);
      const startMinutes = hh * 60 + mm;
      const qty = Math.max(1, quantity);

      try {
        for (let i = 0; i < qty; i++) {
          const slotMinutes = startMinutes + finalDuration * i;
          const sH = Math.floor(slotMinutes / 60).toString().padStart(2, "0");
          const sM = (slotMinutes % 60).toString().padStart(2, "0");
          const slotHora = `${sH}:${sM}`;

          await manualBookingMutation.mutateAsync({
            userId: clientId,
            servicoId: selectedService,
            data: date,
            hora: slotHora,
            duracao: finalDuration,
            preco: selectedServiceData.preco,
            observacoes: appointmentObservations || null,
            barbeiroId: effectiveBarbeiroId,
          });
        }

        setConfirmStatus("success");
        setTimeout(() => {
          onSuccess();
          onOpenChange(false);
        }, 1200);
      } catch (err: any) {
        setConfirmStatus("error");
        setValidationError(err?.message || "Erro ao criar encaixe.");
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    } catch (error: any) {
      console.error('[Encaixe] Erro na preparação:', error);
      setConfirmStatus("error");
      setValidationError(error.message || "Erro ao criar encaixe.");
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const selectedServiceData = services.find((s) => s.id === selectedService);

  const canProceedStep1 = selectedClient || manualClientName.trim();
  const canProceedStep2 = selectedService && !!resolvedBarbeiroId;

  return (
    <ErrorBoundary>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[480px] max-h-[85vh] flex flex-col" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <span>Criar Encaixe Manual</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4" />
            {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { 
              weekday: 'short', 
              day: '2-digit', 
              month: 'short'
            })}
            <span className="text-muted-foreground/50">•</span>
            <Clock className="h-4 w-4" />
            {time}
          </DialogDescription>
        </DialogHeader>

        {/* Premium Stepper */}
        <div className="flex items-center justify-center gap-1 py-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold transition-all duration-300",
                step >= s 
                  ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(255,59,59,0.4)]' 
                  : 'bg-foreground/[0.05] text-muted-foreground border border-foreground/[0.08]'
              )}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-10 h-0.5 mx-1 transition-all duration-300 rounded-full",
                  step > s ? 'bg-primary' : 'bg-foreground/[0.08]'
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 -mr-2">
          {/* Step 1: Cliente */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center pb-2">
                <h3 className="font-semibold text-lg">Selecione o Cliente</h3>
                <p className="text-sm text-muted-foreground">Busque ou digite o nome</p>
              </div>
              {selectedClient ? (
                <Card className="border-2 border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{selectedClient.nome}</p>
                          {selectedClient.telefone && (
                            <p className="text-sm text-muted-foreground">{selectedClient.telefone}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedClient(null)}
                      >
                        Trocar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  {filteredClients.length > 0 && (
                    <Card className="max-h-40 overflow-auto">
                      <div className="p-2 space-y-1">
                        {filteredClients.map((client) => (
                          <button
                            key={client.id}
                            onClick={() => {
                              setSelectedClient(client);
                              setSearchQuery("");
                              setManualClientName("");
                            }}
                            className="w-full text-left p-2 hover:bg-muted rounded-md transition-colors flex items-center gap-2"
                          >
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">{client.nome}</p>
                              {client.telefone && (
                                <p className="text-xs text-muted-foreground">{client.telefone}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </Card>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-background px-2 text-muted-foreground">ou digite</span>
                    </div>
                  </div>

                  <Input
                    placeholder="Nome do cliente"
                    value={manualClientName}
                    onChange={(e) => {
                      setManualClientName(e.target.value);
                      setSearchQuery("");
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Barbeiro (se necessário) + Serviço */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Seleção de Barbeiro (apenas quando não conseguimos resolver automaticamente) */}
              {shouldShowBarberSelection && (
                <div className="space-y-3">
                  <div className="text-center pb-1">
                    <h3 className="font-semibold text-lg">Selecione o Barbeiro</h3>
                    <p className="text-sm text-muted-foreground">Escolha o profissional</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {barbers.map((barber) => (
                      <button
                        key={barber.id}
                        onClick={() => setSelectedBarber(barber)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                          selectedBarber?.id === barber.id
                            ? "bg-primary/10 border-primary"
                            : "bg-secondary/30 border-border/30 hover:bg-secondary/50"
                        )}
                      >
                        <User className="w-4 h-4" />
                        <span className="font-medium">{barber.apelido}</span>
                        {selectedBarber?.id === barber.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border/20 pt-3" />
                </div>
              )}

              <div className="text-center pb-2">
                <h3 className="font-semibold text-lg">Selecione o Serviço</h3>
                <p className="text-sm text-muted-foreground">Escolha o tipo de atendimento</p>
              </div>

              {services.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center mb-3">
                    <AlertCircle className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Nenhum serviço encontrado</p>
                  <p className="text-xs text-muted-foreground/60 text-center mt-1">
                    Verifique se existem serviços ativos cadastrados para esta barbearia.
                  </p>
                </div>
              ) : (
                <div className="grid gap-2 max-h-80 overflow-y-auto pr-2">
                  {services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      selected={selectedService === service.id}
                      onClick={() => setSelectedService(service.id)}
                    />
                  ))}
                </div>
              )}

              {/* Quantidade de serviços (encaixes consecutivos) */}
              {selectedService && (
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-secondary/30 p-3">
                  <div>
                    <p className="text-sm font-semibold">Quantidade</p>
                    <p className="text-xs text-muted-foreground">
                      Cria {quantity} horário{quantity > 1 ? "s" : ""} em sequência
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-bold text-base">{quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                      disabled={quantity >= 10}
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Resumo */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center pb-2">
                <h3 className="font-semibold text-lg">Confirme os Dados</h3>
                <p className="text-sm text-muted-foreground">Revise antes de confirmar</p>
              </div>

              {/* Cliente Info */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <User className="h-4 w-4" />
                    Cliente
                  </div>
                  <p className="font-semibold">{selectedClient?.nome || manualClientName}</p>
                </CardContent>
              </Card>

              {/* Serviço Info */}
              {selectedServiceData && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Serviço
                    </div>
                    <div>
                      <p className="font-semibold mb-2">
                        {selectedServiceData.nome}
                        {quantity > 1 && (
                          <span className="ml-2 text-xs font-medium text-primary">×{quantity}</span>
                        )}
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted rounded-md">
                          <p className="text-xs text-muted-foreground">Duração</p>
                          <p className="font-bold text-sm">{selectedServiceData.duracao_minutos * quantity}min</p>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <p className="text-xs text-muted-foreground">Preço</p>
                          <p className="font-bold text-sm">R$ {(selectedServiceData.preco * quantity).toFixed(2)}</p>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <p className="text-xs text-muted-foreground">Término</p>
                          <p className="font-bold text-sm">
                            {(() => {
                              const [h, m] = time.split(":").map(Number);
                              const endMinutes = h * 60 + m + selectedServiceData.duracao_minutos * quantity;
                              const endH = Math.floor(endMinutes / 60);
                              const endM = endMinutes % 60;
                              return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Observações */}
              <div className="space-y-2">
                <Label htmlFor="observations" className="text-sm">
                  Observações <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="observations"
                  placeholder="Ex: Cliente preferencial..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {validationError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
              )}

              {confirmStatus === "success" && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <Check className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-600">
                    Encaixe criado com sucesso!
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && step < 3 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          )}
          
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}

          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
              Próximo
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {step === 3 && (
            <Button onClick={handleSubmit} disabled={loading || manualBookingMutation.isPending || confirmStatus === "success"} className="min-w-32">
              {(loading || manualBookingMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmStatus === "success" ? "Confirmado!" : "Confirmar"}
            </Button>
          )}
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
}

// Memoized service card component to prevent unnecessary re-renders
const ServiceCard = memo(({ service, selected, onClick }: {
  service: Service;
  selected: boolean;
  onClick: () => void;
}) => (
  <Card
    className={`cursor-pointer transition-all hover:shadow-md ${
      selected ? 'border-2 border-primary bg-primary/5' : 'border hover:border-primary/30'
    }`}
    onClick={onClick}
  >
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h4 className="font-semibold mb-0.5">{service.nome}</h4>
          {service.descricao && (
            <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{service.descricao}</p>
          )}
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {service.duracao_minutos}min
            </Badge>
            <Badge variant="outline" className="gap-1">
              <DollarSign className="h-3 w-3" />
              R$ {service.preco.toFixed(2)}
            </Badge>
          </div>
        </div>
        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
        }`}>
          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      </div>
    </CardContent>
  </Card>
));