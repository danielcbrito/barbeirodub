import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Calendar, ChevronRight, CreditCard, Gift, History, Loader2, LogOut, MessageCircle, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClienteLoja } from "@/components/client/loja/ClienteLoja";
import { useCarrinho } from "@/components/client/loja/useCarrinho";
import type { ClienteTab } from "@/components/BottomNavigation";

import { PointsDetailModal } from "@/components/PointsDetailModal";
import { PendingPaymentCard } from "@/components/PendingPaymentCard";
import { MyPlansSheet } from "@/components/MyPlansSheet";
import { SubscribePlanSheet } from "@/components/SubscribePlanSheet";
import { NotificationsSheet } from "@/components/NotificationsSheet";
import { WalletSheet } from "@/components/WalletSheet";
import { AnnouncementDialog } from "@/components/AnnouncementDialog";
import { CancelledAppointmentBanner } from "@/components/CancelledAppointmentBanner";

import { BottomNavigation } from "@/components/BottomNavigation";
import { AppointmentHistorySheet } from "@/components/AppointmentHistorySheet";
import { SupportChatBubble } from "@/components/support/SupportChatBubble";
import { useAuthReady } from "@/hooks/useAuthReady";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";
import { redeemPendingReferral } from "@/lib/referral";
import { ClientCampaignsSheet } from "@/components/client/ClientCampaignsSheet";
import { useClientCampaigns } from "@/hooks/useClientCampaigns";

// Premium components
import { ClientHeader } from "@/components/client/ClientHeader";
import { LoyaltyCard } from "@/components/client/LoyaltyCard";
import { ScheduleButton } from "@/components/client/ScheduleButton";
import { AppointmentCardPremium } from "@/components/client/AppointmentCardPremium";
import { PlanTrackerCard } from "@/components/plano/PlanTrackerCard";

interface Appointment {
  id: string;
  data: string;
  hora: string;
  servico: { nome: string };
  status: string;
  duracao?: number;
  preco?: number;
  observacoes?: string;
  cancelado_em?: string;
  visivel_para_usuario?: boolean;
  cliente_confirmou?: boolean;
  barbeiro_confirmou?: boolean;
  ponto_liberado?: boolean;
  remarcacao_solicitada?: boolean;
  motivo_remarcacao?: string;
  pagamentos?: Array<{
    metodo: string;
    status: string;
  }>;
}

const CLIENT_HOME_CACHE_PREFIX = "client-home:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const Cliente = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: authUser, isReady: isAuthReady } = useAuthReady();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [points, setPoints] = useState(0);
  const [redemptions, setRedemptions] = useState(0);
  const [requiredPoints, setRequiredPoints] = useState(8);
  const [loyaltyActive, setLoyaltyActive] = useState(false);
  const [hasActivePlan, setHasActivePlan] = useState(false);
  
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [completedAppointments, setCompletedAppointments] = useState(0);
  const [plansSheetOpen, setPlansSheetOpen] = useState(false);
  const [subscribeSheetOpen, setSubscribeSheetOpen] = useState(false);
  const [notificationsSheetOpen, setNotificationsSheetOpen] = useState(false);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [campaignsSheetOpen, setCampaignsSheetOpen] = useState(false);
  const [_availableCredits, setAvailableCredits] = useState(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [recentCancellations, setRecentCancellations] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<ClienteTab>("inicio");
  const carrinho = useCarrinho();
  const { data: campaigns } = useClientCampaigns(profile?.barbearia_preferida_id ?? null, !!authUser);

  // Ref para proteção contra unmount em chamadas assíncronas
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    setUser(authUser);

    if (!authUser) {
      setProfile(null);
      navigate("/", { replace: true });
      return;
    }

    applyCachedUserData(authUser.id);
    void loadUserData(authUser.id);
    void redeemPendingReferral(authUser.id);
  }, [authUser, isAuthReady, navigate]);
  // Realtime: escutar qualquer mudança em assinaturas do cliente
  // (nova assinatura, ativação por admin/barbeiro, renovação ou cancelamento).
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`assinatura-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assinaturas",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["assinatura-status", user.id] });
          queryClient.invalidateQueries({ queryKey: ["assinatura-status"] });
          queryClient.invalidateQueries({ queryKey: ["client-active-subscription", user.id] });
          loadUserData(user.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plano_agendamentos_usos",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["assinatura-status", user.id] });
          loadUserData(user.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUserData(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Removido listener duplicado de agendamentos pois o canal assinatura-realtime já trata as atualizações em tempo real de forma centralizada.

  // Realtime sync for promotions - o snapshot já traz fidelidade pronta.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`promocoes-realtime-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'promocoes' },
        () => {
          loadUserData(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Realtime já cobre as mudanças importantes; polling curto estava
    // multiplicando consultas e deixando o banco ocupado sem necessidade.
    const interval = setInterval(() => {
      loadUserData(user.id);
    }, 120000);
    return () => clearInterval(interval);
  }, [user]);

  const getRequiredPointsForUser = async (currentUserId: string): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc("get_client_loyalty_required_points", {
        p_user_id: currentUserId,
      });

      if (error) throw error;
      return typeof data === "number" && data >= 2 ? data : 8;
    } catch {
      return 8;
    }
  };

  const applyBundleToState = (bundle: Record<string, unknown>, userId: string) => {
    const profileData = isRecord(bundle.profile) ? bundle.profile : null;
    const appointmentsData = normalizeArray<Appointment>(bundle.appointments);
    const pendingBookingsData = normalizeArray<any>(bundle.pendingBookings);
    const required = Math.max(2, toNumber(bundle.requiredPoints, 8));

    setHasActivePlan(bundle.hasActivePlan === true);
    setAvailableCredits(toNumber(bundle.availableCredits));
    setProfile(profileData);
    setAppointments(appointmentsData);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    setRecentCancellations(
      appointmentsData.filter((apt) =>
        apt.status === "cancelled_by_admin" &&
        !!apt.cancelado_em &&
        new Date(apt.cancelado_em) > twoDaysAgo &&
        apt.observacoes?.includes("Cancelado em massa:")
      )
    );

    setPayments(
      appointmentsData.flatMap((apt) =>
        (apt.pagamentos || []).map((p, index) => ({
          id: `${apt.id}-${index}`,
          agendamento_id: apt.id,
          status: p.status,
          metodo: p.metodo,
        }))
      )
    );
    setCompletedAppointments(toNumber(bundle.totalCompletedCount));
    setRequiredPoints(required);
    setPoints(toNumber(bundle.points));
    setRedemptions(toNumber(bundle.redemptionsAvailable));
    setPendingBookings(pendingBookingsData);
    setLoyaltyActive(bundle.loyaltyActive === true);

    writeSyncCache(`${CLIENT_HOME_CACHE_PREFIX}${userId}`, bundle);
  };

  const applyCachedUserData = (userId: string) => {
    const cached = readSyncCache<Record<string, unknown>>(`${CLIENT_HOME_CACHE_PREFIX}${userId}`);
    if (cached?.data) {
      applyBundleToState(cached.data, userId);
    }
  };

  const loadUserData = async (userId: string) => {
    applyCachedUserData(userId);

    const { data: bundleData, error: bundleError } = await supabase.rpc("get_client_home_bundle");
    if (!bundleError && isRecord(bundleData)) {
      if (!mountedRef.current) return;
      applyBundleToState(bundleData, userId);

      if (bundleData.isStale === true) {
        void supabase.rpc("refresh_client_home_snapshot", { p_user_id: userId }).then(() => {
          if (mountedRef.current) void loadUserData(userId);
        });
      }
      return;
    }

    console.warn("[Cliente] Bundle rápido falhou, usando fallback:", bundleError);
    await loadUserDataFallback(userId);
  };

  const loadUserDataFallback = async (userId: string) => {
    // Verificar se o usuário tem plano ativo para esconder o banner de fidelidade
    const { data: subData } = await supabase
      .from("assinaturas")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["active", "pending_cash"])
      .maybeSingle();
    
    if (mountedRef.current) {
      setHasActivePlan(!!subData);
    }

    const { data: creditsData } = await supabase
      .rpc('get_user_available_credits', { p_user_id: userId });
    
    if (!mountedRef.current) return;
    setAvailableCredits(creditsData || 0);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, nome, telefone, avatar_url, banner_url, barbearia_preferida_id")
      .eq("id", userId)
      .single();
    
    if (!mountedRef.current) return;
    setProfile(profileData);

    const { data: appointmentsData } = await supabase
      .from("agendamentos")
      .select(`
        id,
        data,
        hora,
        status,
        duracao,
        preco,
        observacoes,
        cancelado_em,
        visivel_para_usuario,
        cliente_confirmou,
        barbeiro_confirmou,
        ponto_liberado,
        remarcacao_solicitada,
        motivo_remarcacao,
        tipo_agendamento,
        criado_por,
        servico:servicos(nome),
        barbeiros(apelido),
        pagamentos(metodo, status)
      `)
      .eq("user_id", userId)
      .eq("visivel_para_usuario", true)
      // Encaixes walk-in usam o user_id do barbeiro como referência;
      // não devem aparecer na agenda pessoal do cliente/barbeiro.
      .neq("tipo_agendamento", "encaixe_manual")
      .order("data", { ascending: false })
      .order("hora", { ascending: false })
      .limit(5);

    if (!mountedRef.current) return;
    setAppointments(appointmentsData || []);
    
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const recentlyCancelled = (appointmentsData || []).filter(apt => 
      apt.status === 'cancelled_by_admin' && 
      apt.cancelado_em &&
      new Date(apt.cancelado_em) > twoDaysAgo &&
      apt.observacoes?.includes("Cancelado em massa:")
    );
    
    if (!mountedRef.current) return;
    setRecentCancellations(recentlyCancelled);

    /* Select apenas campos usados pelo AppointmentCardPremium */
    const { data: paymentsData } = await supabase
      .from("pagamentos")
      .select("id, agendamento_id, status")
      .eq("user_id", userId);
    
    if (!mountedRef.current) return;
    setPayments(paymentsData || []);

    // Contar cortes CONCLUÍDOS e PAGOS (não grátis) para calcular pontos reais
    const { count: paidCompletedCount } = await supabase
      .from("agendamentos")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("is_free", false);

    const paidCompleted = paidCompletedCount || 0;
    
    // Contar total de cortes concluídos (incluindo grátis) para estatísticas
    const { count: totalCompletedCount } = await supabase
      .from("agendamentos")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", userId)
      .eq("status", "completed");

    if (!mountedRef.current) return;
    setCompletedAppointments(totalCompletedCount || 0);

    const currentRequiredPoints = await getRequiredPointsForUser(userId);
    if (!mountedRef.current) return;
    setRequiredPoints(currentRequiredPoints);

    // Buscar total de resgates (usados + disponíveis) para calcular ciclos completos
    const { data: allRedemptions } = await supabase
      .from("resgates")
      .select("id, status")
      .eq("user_id", userId);

    const totalRedemptions = allRedemptions?.length || 0;
    const availableRedemptions = allRedemptions?.filter(r => r.status === 'available').length || 0;

    // Calcular pontos no ciclo atual baseado em cortes pagos
    // Fórmula: pontos = cortes_pagos - (resgates_totais * pontosNecessarios)
    // Se der negativo (dados inconsistentes), usar 0
    const calculatedPoints = Math.max(0, paidCompleted - (totalRedemptions * currentRequiredPoints));
    
    if (!mountedRef.current) return;
    setPoints(calculatedPoints);
    setRedemptions(availableRedemptions);

    const { data: pendingBookingsData } = await supabase
      .from("pending_bookings")
      .select(`
        id,
        data,
        hora,
        servico_id,
        preco,
        payment_method,
        created_at,
        servico:servicos(nome)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!mountedRef.current) return;
    setPendingBookings(pendingBookingsData || []);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado");
    navigate("/");
  };

  const handleResumePayment = (bookingId: string) => {
    sessionStorage.setItem('resumePendingBookingId', bookingId);
    navigate("/cliente/agendar");
  };

  const handleCancelPendingBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("pending_bookings")
        .delete()
        .eq("id", bookingId);

      if (error) throw error;

      setPendingBookings(prev => prev.filter(b => b.id !== bookingId));
      toast.success("Reserva cancelada");
    } catch (error) {
      console.error("Error canceling pending booking:", error);
      toast.error("Erro ao cancelar reserva");
    }
  };

  const handleConfirmAppointment = async (appointmentId: string) => {
    const { error } = await supabase
      .from("agendamentos")
      .update({ cliente_confirmou: true } as any)
      .eq("id", appointmentId);

    if (error) {
      toast.error("Erro ao confirmar atendimento");
      return;
    }

    const { data: appointmentRow } = await supabase
      .from("agendamentos")
      .select("barbeiro_confirmou, ponto_liberado")
      .eq("id", appointmentId)
      .single();

    const barberConfirmed = (appointmentRow as any)?.barbeiro_confirmou;
    const pointReleased = (appointmentRow as any)?.ponto_liberado;

    if (barberConfirmed && !pointReleased) {
      const { error: pointError } = await supabase
        .from("agendamentos")
        .update({ 
          ponto_liberado: true,
          status: 'completed' as any
        } as any)
        .eq("id", appointmentId);

      if (!pointError) {
        toast.success("🎉 Atendimento confirmado! 1 ponto adicionado ao seu programa de fidelidade.");
        if (user) loadUserData(user.id);
      }
    } else {
      toast.success("✅ Aguardando confirmação do barbeiro");
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-app bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando conta do cliente...</p>
        </div>
      </div>
    );
  }

  const profileName = profile?.nome || "Cliente Teste";
  const profileInitial = profileName.charAt(0).toUpperCase();
  const contactPhone = profile?.telefone || "Telefone não cadastrado";

  return (
    <div className="min-h-app bg-background flex flex-col">
      {/* Header com saudação */}
      <ClientHeader
        profileName={profile?.nome}
        email={authUser?.email}
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(7rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))" }}>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

          {/* ═══ ABA LOJA ═══ */}
          {activeTab === "loja" && profile?.barbearia_preferida_id && user && (
            <ClienteLoja
              tenantId={profile.barbearia_preferida_id}
              clienteId={user.id}
              carrinho={carrinho}
            />
          )}

          {/* ═══ ABA INÍCIO (conteúdo original) ═══ */}
          {activeTab === "inicio" && (
            <>
              {/* Loyalty Card — só exibe se o programa estiver ativo e o usuário NÃO tiver plano */}
              {loyaltyActive && !hasActivePlan && (
                <LoyaltyCard
                  points={points}
                  redemptions={redemptions}
                  requiredPoints={requiredPoints}
                  onViewDetails={() => setPointsModalOpen(true)}
                />
              )}

              {/* Campanhas ativas da barbearia */}
              {(campaigns?.convide?.ativo || campaigns?.clienteMes?.ativo) && (
                <button
                  onClick={() => setCampaignsSheetOpen(true)}
                  className="w-full rounded-2xl border border-border/60 bg-card px-4 py-4 text-left transition-colors hover:bg-card/80 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Convide e ganhe</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {campaigns?.convide?.ativo
                          ? `Faltam ${campaigns.convide.faltam} convite(s) para 1 corte grátis`
                          : "Concorra ao prêmio de cliente do mês"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              )}

              {/* Plan Tracker Card */}
              {user && <PlanTrackerCard userId={user.id} />}


              {/* Schedule Button */}
              <ScheduleButton onClick={() => navigate("/cliente/agendar")} />

              {/* Pending Bookings */}
              <AnimatePresence>
                {pendingBookings.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-yellow-500 rounded-full" />
                      Pagamentos Pendentes
                    </h3>
                    <div className="space-y-3">
                      {pendingBookings.map((booking) => (
                        <PendingPaymentCard
                          key={booking.id}
                          booking={booking}
                          onResumePayment={handleResumePayment}
                          onCancel={handleCancelPendingBooking}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Appointments Section */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary rounded-full" />
                  Meus Agendamentos
                </h3>
                
                {/* Recent Cancellation Banners */}
                <AnimatePresence>
                  {recentCancellations.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3 mb-4"
                    >
                      {recentCancellations.map(apt => {
                        const reason = apt.observacoes?.replace("Cancelado em massa: ", "") || "Não informado";
                        return (
                          <CancelledAppointmentBanner
                            key={apt.id}
                            reason={reason}
                            serviceName={apt.servico?.nome || "Serviço"}
                            date={apt.data}
                            time={apt.hora}
                          />
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {appointments.length === 0 && pendingBookings.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card className="p-8 text-center border-dashed border-2 bg-card/50">
                      <div 
                        className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                        }}
                      >
                        <Calendar className="w-8 h-8 text-primary/50" />
                      </div>
                      <p className="text-sm text-muted-foreground font-medium">
                        Você ainda não tem agendamentos
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Toque em "Agendar Horário" para começar
                      </p>
                    </Card>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {appointments.map((apt, index) => (
                      <AppointmentCardPremium
                        key={apt.id}
                        appointment={apt}
                        onCancel={() => loadUserData(user.id)}
                        onConfirm={handleConfirmAppointment}
                        userId={user?.id}
                        payments={payments}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "suporte" && (
            <div className="space-y-4">
              <Card className="overflow-hidden border-border/60 bg-card">
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground">Suporte DUB</h2>
                      <p className="text-sm text-muted-foreground">Abra o chat oficial do cliente sem sair da conta de teste.</p>
                    </div>
                  </div>

                  <Button className="w-full" onClick={() => navigate("/suporte")}>
                    Abrir suporte
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "perfil" && (
            <div className="space-y-4">
              <Card className="overflow-hidden border-border/60 bg-card">
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold shadow-md">
                      {profileInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-foreground">{profileName}</p>
                      <p className="truncate text-sm text-muted-foreground">{authUser?.email}</p>
                      <p className="truncate text-xs text-muted-foreground mt-1">{contactPhone}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border-border/60 bg-card">
                <div className="divide-y divide-border/60">
                  {[
                    { icon: Wallet, label: "Minha carteira", action: () => setWalletSheetOpen(true) },
                    { icon: CreditCard, label: "Meus planos", action: () => setPlansSheetOpen(true) },
                    { icon: Bell, label: "Notificações", action: () => setNotificationsSheetOpen(true) },
                    { icon: History, label: "Histórico", action: () => setHistorySheetOpen(true) },
                    { icon: Gift, label: "Programa de pontos", action: () => setPointsModalOpen(true) },
                    { icon: Users, label: "Campanhas e convites", action: () => setCampaignsSheetOpen(true) },
                    { icon: MessageCircle, label: "Suporte", action: () => navigate("/suporte") },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </Card>

              <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          )}
        </div>
      </div>


      <ClientCampaignsSheet
        open={campaignsSheetOpen}
        onOpenChange={setCampaignsSheetOpen}
        tenantId={profile?.barbearia_preferida_id ?? null}
      />

      {/* My Plans Sheet */}
      <MyPlansSheet
        open={plansSheetOpen}
        onOpenChange={setPlansSheetOpen}
        userId={user?.id}
      />

      {/* Subscribe Plan Sheet */}
      <SubscribePlanSheet
        open={subscribeSheetOpen}
        onOpenChange={setSubscribeSheetOpen}
        userId={user?.id}
      />

      <NotificationsSheet
        open={notificationsSheetOpen}
        onOpenChange={setNotificationsSheetOpen}
        userId={user?.id}
      />

      {/* Points Detail Modal */}
      <PointsDetailModal
        open={pointsModalOpen}
        onOpenChange={setPointsModalOpen}
        points={points}
        completedAppointments={completedAppointments}
        redemptions={redemptions}
        requiredPoints={requiredPoints}
      />

      {/* Wallet Sheet */}
      <WalletSheet
        open={walletSheetOpen}
        onOpenChange={setWalletSheetOpen}
        userId={user?.id}
      />

      {/* Announcement Dialog */}
      <AnnouncementDialog />

      {/* History Sheet */}
      <AppointmentHistorySheet
        open={historySheetOpen}
        onOpenChange={setHistorySheetOpen}
        userId={user?.id}
      />

      {/* Support Chat Bubble */}
      <SupportChatBubble />

      {/* Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
};

export default Cliente;
