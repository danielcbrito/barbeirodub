import { useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppointmentDetailsView } from "@/components/admin/AppointmentDetailsView";
import { fetchAgendaDia } from "@/lib/fetchers/agendaFetchers";
import { supabase } from "@/integrations/supabase/client";
import { saveAgendaSelectedDate } from "@/lib/agendaDatePersistence";
import type { TimelineAppointment } from "@/hooks/useBarberAgenda";

interface AppointmentDetailsPageLocationState {
  appointment?: TimelineAppointment;
}

interface AppointmentDetailsPageProps {
  /** Caminho base para onde voltar quando o usuário fecha a tela (ex: /admin, /barbeiro). */
  basePath: string;
}

export default function AppointmentDetailsPage({ basePath }: AppointmentDetailsPageProps) {
  const navigate = useNavigate();
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const state = (location.state as AppointmentDetailsPageLocationState | null) || {};

  const { data: appointment } = useQuery({
    queryKey: ["appointment-details", appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;

      let barbeiroId = state.appointment?.barbeiro_id;
      let data = state.appointment?.data;

      if (!barbeiroId || !data) {
        const { data: apts, error } = await supabase
          .from("agendamentos")
          .select("barbeiro_id, data")
          .eq("id", appointmentId)
          .limit(1);
        if (error || !apts || apts.length === 0) return null;
        barbeiroId = apts[0].barbeiro_id;
        data = apts[0].data;
      }

      if (!barbeiroId || !data) return null;
      const list = await fetchAgendaDia(barbeiroId, data);
      return list.find((a) => a.id === appointmentId) ?? null;
    },
    enabled: !!appointmentId,
    staleTime: 1000 * 60,
    initialData: state.appointment,
  });

  // Persiste a data imediatamente na sessão para caso o usuário use o botão voltar nativo do navegador
  useEffect(() => {
    const targetDate = appointment?.data || state.appointment?.data;
    if (targetDate) {
      saveAgendaSelectedDate(targetDate);
    }
  }, [appointment?.data, state.appointment?.data]);

  useEffect(() => {
    if (appointment === null && !state.appointment) {
      navigate(`${basePath}/agenda`, { replace: true });
    }
  }, [appointment, state.appointment, basePath, navigate]);

  const handleClose = () => {
    const targetDate = appointment?.data || state.appointment?.data;
    if (targetDate) {
      saveAgendaSelectedDate(targetDate);
    }
    navigate(`${basePath}/agenda`, {
      replace: false,
      state: targetDate ? { selectedDate: targetDate } : undefined,
    });
  };

  const handleUpdate = () => {
    try {
      queryClient.invalidateQueries({ queryKey: ["appointment-details"] });
      if (state.appointment?.barbeiro_id && state.appointment?.data) {
        queryClient.invalidateQueries({
          queryKey: ["barbeiro", "agenda", state.appointment.barbeiro_id, state.appointment.data],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["barbeiro"] });
    } catch {
      /* não impede o fechamento */
    }
  };

  if (!appointment) {
    return (
      <div className="fixed inset-0 z-[80] bg-background flex flex-col items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppointmentDetailsView
      appointment={appointment}
      renderAsPage
      onClose={handleClose}
      onUpdate={handleUpdate}
      barbeiroId={appointment.barbeiro_id ?? null}
    />
  );
}
