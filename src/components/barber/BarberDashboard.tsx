import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  Clock,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  MapPin,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  IconBarbearia3D,
  IconHorarios3D,
  IconClientes3D,
  IconServicos3D,
  PinLocationSolid,
} from "@/components/shared/Category3DIcons";
import { GlobalSearchModal } from "@/components/shared/GlobalSearchModal";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useBarberDashboard, type DashboardData } from "@/hooks/useBarberDashboard";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BarberContext } from "@/pages/Barbeiro";

import { CreateBankBanner } from "./CreateBankBanner";
import { SetupCompletionBanner } from "./SetupCompletionBanner";
import { CampaignPromoBanners } from "@/components/admin/CampaignPromoBanners";
import { NotificationBell } from "@/components/NotificationBell";

/* ─────────────────────────────────────────────
 * BarberDashboard — tela inicial do barbeiro.
 * Fiel à referência visual de alto padrão:
 * - Topo com Hello, Nome + Localização + Sino preto + Foto
 * - Barra de busca arredondada (Pill)
 * - Grid 3x2 com Ícones 3D coloridos
 * - Card de Data verde + Card Faturamento/Métricas
 * - Seção Próximos agendamentos com pills de Data/Hora
 * ───────────────────────────────────────────── */

interface BarberDashboardProps {
  barberContext: BarberContext;
  basePath?: string;
  isTenantAdmin?: boolean;
  tenantNome?: string;
}

const formatBRL = (n: number) =>
  `R$\u00A0${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const EMPTY_DASHBOARD: DashboardData = {
  todayCount: 0,
  yesterdayCount: 0,
  pendingCount: 0,
  nextAppointment: null,
  monthRevenue: 0,
  lastMonthRevenue: 0,
  monthCuts: 0,
  lastMonthCuts: 0,
  recentAppointments: [],
};

export function BarberDashboard({
  barberContext,
  basePath = "/barbeiro",
  tenantNome,
}: BarberDashboardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { data: dashboardData } = useBarberDashboard(barberContext.barbeiroId);
  const data = dashboardData ?? EMPTY_DASHBOARD;

  const [revenueVisible, setRevenueVisible] = useState(true);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  const setup = useSetupCompletion({
    userId: barberContext.userId,
    barbeiroId: barberContext.barbeiroId,
    basePath,
    tenantId: barberContext.tenantId,
    excludeSteps: ["whatsapp", "carteira"],
  });

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const uId = barberContext?.userId;
    const bId = barberContext?.barbeiroId;
    if (!uId && !bId) return;

    async function loadAvatar() {
      if (uId) {
        const { data: prof } = await supabase.from("profiles").select("avatar_url").eq("id", uId).maybeSingle();
        if (prof?.avatar_url) {
          setAvatarUrl(prof.avatar_url);
          return;
        }
      }
      if (bId) {
        const { data: barb } = await supabase.from("barbeiros").select("foto_url").eq("id", bId).maybeSingle();
        if (barb?.foto_url) {
          setAvatarUrl(barb.foto_url);
        }
      }
    }
    loadAvatar();
  }, [barberContext?.userId, barberContext?.barbeiroId]);

  /* Realtime — invalida cache quando agendamentos mudam */
  useEffect(() => {
    const channel = supabase
      .channel(`barber-dash-realtime-${barberContext.barbeiroId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `barbeiro_id=eq.${barberContext.barbeiroId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.barbeiro.dashboard(barberContext.barbeiroId),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [barberContext.barbeiroId, queryClient]);

  const revenueGrowth = useMemo(() => {
    if (!data || data.lastMonthRevenue === 0) return 0;
    return Math.round(((data.monthRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100);
  }, [data]);

  const handleUpdateAppointmentStatus = async (
    appointmentId?: string,
    newStatus?: "completed" | "no_show" | "cancelled_by_admin"
  ) => {
    if (!appointmentId || !newStatus) return;

    try {
      const updates: Record<string, any> = { status: newStatus };
      if (newStatus === "completed") {
        updates.barbeiro_confirmou = true;
      } else if (newStatus === "no_show") {
        updates.barbeiro_confirmou = false;
        updates.ponto_liberado = false;
      }

      const { error } = await supabase
        .from("agendamentos")
        .update(updates)
        .eq("id", appointmentId);

      if (error) throw error;

      if (newStatus === "completed") {
        toast.success("Atendimento concluído com sucesso!");
      } else if (newStatus === "no_show") {
        toast.info("Agendamento marcado como falta.");
      } else if (newStatus === "cancelled_by_admin") {
        toast.success("Agendamento cancelado.");
      }

      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.dashboard(barberContext.barbeiroId),
      });
    } catch (err: any) {
      console.error("Erro ao atualizar status do agendamento:", err);
      toast.error("Não foi possível atualizar o agendamento.");
    }
  };

  /* ─── 1. Topo: Hello + Localização / Sino preto + Avatar ─── */
  const HeaderTripGlide = () => (
    <div className="flex items-center justify-between gap-3 pt-1">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
          Olá, {barberContext.apelido || "Barbeiro"}
        </h1>
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-0.5">
          <PinLocationSolid className="w-[18px] h-[18px] shrink-0" />
          <span className="font-semibold text-foreground/90 truncate">
            {tenantNome || "Barbearia DUB"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <NotificationBell
          userId={barberContext.userId}
          className="w-11 h-11 rounded-full bg-white dark:bg-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-white/90 dark:border-white/10 flex items-center justify-center hover:bg-zinc-50 transition-all active:scale-95"
          iconClassName="w-5 h-5 text-zinc-900 fill-zinc-900 dark:text-white dark:fill-white"
        />
        <button
          onClick={() => navigate(`${basePath}/perfil`)}
          aria-label="Perfil"
          className="w-11 h-11 rounded-full overflow-hidden border-2 border-white dark:border-white/20 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-95 transition-all hover:ring-2 hover:ring-foreground/20"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{barberContext.apelido ? barberContext.apelido.slice(0, 2).toUpperCase() : "BD"}</span>
          )}
        </button>
      </div>
    </div>
  );

  /* ─── 2. Barra de Busca Arredondada Confortável e Larga (Fiel ao Mockup) ─── */
  const SearchFilterRow = () => (
    <div
      onClick={() => setIsGlobalSearchOpen(true)}
      className="w-full h-12 px-4 rounded-full bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 text-muted-foreground flex items-center gap-3 cursor-pointer hover:border-zinc-300 dark:hover:border-white/20 active:scale-[0.99] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
    >
      <Search className="w-5 h-5 text-zinc-900 dark:text-white stroke-[2.2] shrink-0" />
      <span className="text-[13.5px] text-zinc-400 truncate font-normal">
        Buscar cliente, corte, serviço, financeiro...
      </span>
    </div>
  );

  /* ─── 3. Grid Acesso Rápido — 4 Itens (Barbearia, Horários, Clientes, Serviços) ─── */
  const QuickAccessSquares = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <button
        onClick={() => navigate(`${basePath}/config-barbearia`)}
        className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <IconBarbearia3D className="w-7 h-7" />
        </div>
        <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
          Barbearia
        </span>
      </button>

      <button
        onClick={() => navigate(`${basePath}/horarios`)}
        className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <IconHorarios3D className="w-7 h-7" />
        </div>
        <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
          Horários
        </span>
      </button>

      <button
        onClick={() => navigate(`${basePath}/clientes`)}
        className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <IconClientes3D className="w-7 h-7" />
        </div>
        <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
          Clientes
        </span>
      </button>

      <button
        onClick={() => navigate(`${basePath}/servicos`)}
        className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <IconServicos3D className="w-7 h-7" />
        </div>
        <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
          Serviços
        </span>
      </button>
    </div>
  );

  /* ─── 4. Próximo Atendimento: Minimalista, Estratégico (Sem corte de nome, horário grande, chevron elegante) ─── */
  const UpcomingAppointmentsSection = () => {
    if (!data.nextAppointment) {
      return (
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
              Próximo corte
            </span>
            <button
              onClick={() => navigate(`${basePath}/agenda`)}
              className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <span>Ver agenda</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
          <div
            onClick={() => navigate(`${basePath}/agenda`)}
            className="w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 sm:p-4.5 flex items-center gap-3.5 shadow-xs hover:border-border active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="w-[52px] h-[52px] rounded-xl bg-secondary/80 dark:bg-secondary/60 border border-border/50 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-foreground truncate">
                Sem agendamentos nas próximas horas
              </p>
              <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                Toque para abrir a agenda do dia
              </p>
            </div>
          </div>
        </div>
      );
    }

    const statusLabel =
      data.nextAppointment.status === "completed"
        ? "Concluído"
        : data.nextAppointment.status === "confirmed"
        ? "Agendado"
        : "Pendente";

    return (
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
            Próximo corte
          </span>
          <button
            onClick={() => navigate(`${basePath}/agenda`)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Ver agenda</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>
        <div
          onClick={() => {
            if (data.nextAppointment?.id) {
              navigate(`${basePath}/agendamento/${data.nextAppointment.id}`);
            } else {
              navigate(`${basePath}/agenda`);
            }
          }}
          className="w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-3.5 sm:p-4 flex items-center gap-3.5 shadow-xs hover:border-border active:scale-[0.99] transition-all cursor-pointer"
        >
          {/* Horário minimalista e limpo */}
          <div className="w-[54px] h-[54px] rounded-xl bg-secondary/70 dark:bg-secondary/50 border border-border/50 flex flex-col items-center justify-center shrink-0">
            <span className="text-[16px] font-bold font-mono text-foreground leading-tight tracking-tight">
              {data.nextAppointment.hora}
            </span>
            <span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mt-0.5">
              Hoje
            </span>
          </div>

          {/* Nome do cliente (sem ícone verde) e corte com status */}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] sm:text-[15.5px] font-bold text-foreground truncate tracking-tight">
              {data.nextAppointment.clientName || "Cliente"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <span className="text-[12.5px] text-muted-foreground truncate">
                {data.nextAppointment.serviceName || "Atendimento"}
              </span>
              <span className="text-muted-foreground/30">•</span>
              <span className="text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ─── 5. Card Faturamento 100% Sério e Minimalista (Com cor apenas nas letras) ─── */
  const RevenueCard = () => {
    return (
      <div
        onClick={() => navigate(`${basePath}/carteira`)}
        className="w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 sm:p-4.5 shadow-xs hover:border-border transition-all cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-muted-foreground">
            Faturamento do mês
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRevenueVisible((v) => !v);
            }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label={revenueVisible ? "Ocultar receita" : "Mostrar receita"}
          >
            {revenueVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-baseline gap-2.5 mt-2 flex-wrap">
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
            {revenueVisible ? formatBRL(data.monthRevenue) : "R$\u00A0••••"}
          </span>
          {revenueVisible && revenueGrowth !== 0 && (
            <span
              className={cn(
                "text-[12.5px] font-semibold tabular-nums",
                revenueGrowth > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {revenueGrowth > 0 ? `+${revenueGrowth}%` : `${revenueGrowth}%`} vs mês anterior
            </span>
          )}
        </div>
      </div>
    );
  };

  /* ─── Renderização Principal ─── */
  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 pb-6 pt-2 animate-fade-in">
      <HeaderTripGlide />

      <SearchFilterRow />

      <QuickAccessSquares />

      <UpcomingAppointmentsSection />

      <RevenueCard />

      <SetupCompletionBanner
        percentage={setup.percentage}
        steps={setup.steps}
        loading={setup.loading}
        variant="compact"
      />

      {/* Banners Estratégicos */}
      <CampaignPromoBanners basePath={basePath} tenantId={barberContext.tenantId} />

      <div className="pt-2">
        <CreateBankBanner barbeiroId={barberContext.barbeiroId} basePath={basePath} />
      </div>

      {/* Modal de Busca Global Inteligente */}
      <GlobalSearchModal
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        basePath={basePath}
      />
    </div>
  );
}
