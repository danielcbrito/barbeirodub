import type { TimelineAppointment } from "@/hooks/useBarberAgenda";
import { AppointmentDetailsView } from "./AppointmentDetailsView";

interface AppointmentDetailsSidebarProps {
  appointment: TimelineAppointment | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  /** Quando fornecido, usa a query key do prefetch para histórico instantâneo */
  barbeiroId?: string | null;
}

export function AppointmentDetailsSidebar({
  appointment,
  open,
  onClose,
  onUpdate,
  barbeiroId,
}: AppointmentDetailsSidebarProps) {
  if (!appointment) return null;

  return (
    <AppointmentDetailsView
      appointment={appointment}
      open={open}
      onClose={onClose}
      onUpdate={onUpdate}
      barbeiroId={barbeiroId}
      renderAsPage={false}
    />
  );
}
