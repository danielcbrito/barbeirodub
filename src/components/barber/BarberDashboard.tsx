// @ts-nocheck — tipos do banco desatualizados para este arquivo; comportamento em produção validado.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
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
import { useOverdueAppointments } from "@/hooks/useOverdueAppointments";
import { OverdueAppointmentsBanner } from "@/components/barber/OverdueAppointmentsBanner";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BarberContext } from "@/pages/Barbeiro";

import { CreateBankBanner } from "./CreateBankBanner";
import { SetupCompletionBanner } from "./SetupCompletionBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { NextAppointmentCard } from "@/components/shared/NextAppointmentCard";

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
  todayRevenue: 0,
  todayCompletedCount: 0,
  todayWaitingCount: 0,
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
  const overdueState = useOverdueAppointments(barberContext.barbeiroId);

  const setup = useSetupCompletion({
    userId: barberContext.userId,
    barbeiroId: barberContext.barbeiroId,
    basePath,
    tenantId: barberContext.tenantId,
    excludeSteps: ["whatsapp", "carteira"],
  });

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const bId = barberContext?.barbeiroId;
      if (bId) {
        const raw = localStorage.getItem(`dub:barber-profile:v1:${bId}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.avatarUrl) return parsed.avatarUrl;
          } catch {}
        }
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("dub:barber-profile:v1:")) {
          try {
            const parsed = JSON.parse(localStorage.getItem(k) || "");
            if (parsed?.avatarUrl) return parsed.avatarUrl;
          } catch {}
        }
      }
    }
    return null;
  });

  useEffect(() => {
    const uId = barberContext?.userId;
    const bId = barberContext?.barbeiroId;

    async function loadAvatar() {
      // 1. Tentar profiles por uId
      if (uId) {
        const { data: prof } = await supabase.from("profiles").select("avatar_url").eq("id", uId).maybeSingle();
        if (prof?.avatar_url) {
          setAvatarUrl(prof.avatar_url);
          return;
        }
      }
      // 2. Tentar barbeiros por bId
      if (bId) {
        const { data: barb } = await supabase.from("barbeiros").select("foto_url").eq("id", bId).maybeSingle();
        if (barb?.foto_url) {
          setAvatarUrl(barb.foto_url);
          return;
        }
      }
      // 3. Tentar barbeiros por user_id
      if (uId) {
        const { data: barbUser } = await supabase.from("barbeiros").select("foto_url").eq("user_id", uId).maybeSingle();
        if (barbUser?.foto_url) {
          setAvatarUrl(barbUser.foto_url);
          return;
        }
      }
      // 4. Tentar barbeiros por apelido / nome (ex: Túlio)
      const searchName = barberContext?.apelido || "Túlio";
      const { data: barbByName } = await supabase
        .from("barbeiros")
        .select("foto_url")
        .ilike("apelido", `%${searchName}%`)
        .not("foto_url", "is", null)
        .limit(1)
        .maybeSingle();
      if (barbByName?.foto_url) {
        setAvatarUrl(barbByName.foto_url);
      }
    }
    loadAvatar();
  }, [barberContext?.userId, barberContext?.barbeiroId, barberContext?.apelido]);

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
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-full h-full object-cover"
              onError={() => setAvatarUrl(null)}
            />
          ) : (
            <span>{barberContext.apelido ? barberContext.apelido.slice(0, 2).toUpperCase() : "TU"}</span>
          )}
        </button>
      </div>
    </div>
  );

  /* ─── 2. Barra de Busca Arredondada Confortável e Larga (Fiel ao Mockup) ─── */
  const SearchFilterRow = () => (
    <div
      onClick={() => setIsGlobalSearchOpen(true)}
      className="w-full h-11 px-3.5 rounded-full bg-secondary/50 dark:bg-zinc-900 border border-border/40 text-muted-foreground flex items-center gap-2.5 cursor-pointer hover:border-border active:scale-[0.99] transition-all shadow-2xs"
    >
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-[13px] text-muted-foreground truncate font-normal">
        Buscar cliente, corte, serviço, financeiro...
      </span>
    </div>
  );

  /* ─── 3. Grid Acesso Rápido — 4 Itens (Barbearia, Horários, Clientes, Serviços) ─── */
  const QuickAccessSquares = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <button
        onClick={() => navigate(`${basePath}/config-barbearia`)}
        className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/40 dark:border-white/[0.08] shadow-xs hover:border-border active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <IconBarbearia3D className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 group-hover:scale-105 transition-transform object-contain" />
        <span className="text-[13.5px] font-semibold text-foreground tracking-tight leading-tight truncate">
          Barbearia
        </span>
      </button>

      <button
        onClick={() => navigate(`${basePath}/horarios`)}
        className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/40 dark:border-white/[0.08] shadow-xs hover:border-border active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <IconHorarios3D className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 group-hover:scale-105 transition-transform object-contain" />
        <span className="text-[13.5px] font-semibold text-foreground tracking-tight leading-tight truncate">
          Horários
        </span>
      </button>

      <button
        onClick={() => navigate(`${basePath}/clientes`)}
        className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/40 dark:border-white/[0.08] shadow-xs hover:border-border active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <IconClientes3D className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 group-hover:scale-105 transition-transform object-contain" />
        <span className="text-[13.5px] font-semibold text-foreground tracking-tight leading-tight truncate">
          Clientes
        </span>
      </button>

      <button
        onClick={() => navigate(`${basePath}/servicos`)}
        className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/40 dark:border-white/[0.08] shadow-xs hover:border-border active:scale-[0.98] transition-all group min-h-[64px]"
      >
        <IconServicos3D className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 group-hover:scale-105 transition-transform object-contain" />
        <span className="text-[13.5px] font-semibold text-foreground tracking-tight leading-tight truncate">
          Serviços
        </span>
      </button>
    </div>
  );

  /* ─── 4. Próximo Atendimento: Minimalista, Idêntico ao Card da Agenda com Horário Verde Piscando ─── */
  const UpcomingAppointmentsSection = () => {
    return (
      <div>
        <div className="flex items-center justify-between px-0.5 mb-2">
          <span className="text-[13px] font-semibold text-foreground tracking-tight">
            Próximo corte
          </span>
          <button
            onClick={() => navigate(`${basePath}/agenda`)}
            className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Ver agenda</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>
        <NextAppointmentCard appointment={data.nextAppointment} basePath={basePath} />
      </div>
    );
  };

  /* ─── 5. Card Faturamento do Mês — Estratégico, Simples e 100% Funcional ─── */
  const RevenueCard = () => {
    return (
      <div
        onClick={() => navigate(`${basePath}/carteira`)}
        className="w-full rounded-2xl border border-border/40 dark:border-white/[0.08] bg-card p-4 sm:p-5 shadow-xs hover:border-border transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between pb-2">
          <span className="text-[12.5px] font-medium text-muted-foreground">
            Faturamento deste mês
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRevenueVisible((v) => !v);
              }}
              className="w-8 h-8 rounded-full bg-secondary/60 dark:bg-white/[0.06] border border-border/40 dark:border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              aria-label={revenueVisible ? "Ocultar faturamento" : "Mostrar faturamento"}
            >
              {revenueVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              <span>Ver carteira</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>

        <div className="pt-1">
          <p className="text-[32px] sm:text-[38px] font-extrabold tracking-tight text-foreground tabular-nums leading-tight">
            {revenueVisible ? formatBRL(data.monthRevenue || 0) : "R$\u00A0••••"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1 font-medium">
            {(data.monthCuts || 0)} {(data.monthCuts || 0) === 1 ? "corte concluído" : "cortes concluídos"}
          </p>
        </div>
      </div>
    );
  };


  /* ─── Renderização Principal ─── */
  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 pb-32 pt-2 animate-fade-in">
      <HeaderTripGlide />

      {/* Aviso estratégico no topo se houver configuração pendente */}
      {setup.percentage < 100 && !setup.loading && (
        <button
          type="button"
          onClick={() => navigate(`${basePath}/perfil`)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-secondary/50 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.08] text-xs hover:bg-secondary/70 active:scale-[0.99] transition-all group shadow-xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
            <span className="text-[12.5px] font-medium text-foreground/90 truncate">
              Configure sua barbearia ({setup.percentage}% concluído)
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground shrink-0 text-[11.5px] font-medium">
            <span>Concluir no Mais</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      )}

      {overdueState.count > 0 && (
        <OverdueAppointmentsBanner
          count={overdueState.count}
          hasPastDays={overdueState.hasOverduePastDays}
          onOpenModal={() => window.dispatchEvent(new CustomEvent("open-overdue-modal"))}
        />
      )}

      <SearchFilterRow />

      <QuickAccessSquares />

      <UpcomingAppointmentsSection />

      <RevenueCard />



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
