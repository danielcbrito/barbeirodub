import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminAgenda, TimelineAppointment } from "@/components/admin/AdminAgenda";
import { AdminMobileAgenda } from "@/components/admin/mobile/AdminMobileAgenda";
import { AppointmentDetailsSidebar } from "@/components/admin/AppointmentDetailsSidebar";
import { ManualBookingModal } from "@/components/admin/ManualBookingModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminContext } from "@/pages/Admin";
import { resolveOldestOwnedTenant, resolvePrimaryBarberForUser } from "@/lib/tenantOwnership";

/**
 * Página de agenda em tela cheia (sem sidebar, sem menu)
 * Usada quando o admin abre a agenda em nova aba
 */
const AgendaFullScreen = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedAppointment, setSelectedAppointment] = useState<TimelineAppointment | null>(null);
  const [manualBookingOpen, setManualBookingOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState({ date: "", time: "" });
  const [adminContext, setAdminContext] = useState<(AdminContext & { tenantId?: string | null }) | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setAuthLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }

      const userId = session.user.id;

      const [{ data: roles }, { data: barbeiro, error: barberError }, { data: ownedTenant }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .in("role", ["admin", "tenant_admin", "barber"]),
        resolvePrimaryBarberForUser<{
          id: string;
          apelido: string | null;
          user_id: string;
          tenant_id: string | null;
        }>(userId),
        resolveOldestOwnedTenant<{ id: string }>(userId, "id"),
      ]);

      if (barberError) {
        throw barberError;
      }

      const hasAdminRole = !!roles?.some((r) => r.role === "admin");
      const hasTenantAdminRole = !!roles?.some((r) => r.role === "tenant_admin");
      const hasBarberRole = !!roles?.some((r) => r.role === "barber");

      if (!hasAdminRole && !hasTenantAdminRole && !hasBarberRole && !ownedTenant?.id) {
        toast.error("Você não tem permissão para acessar a agenda.");
        navigate("/", { replace: true });
        return;
      }

      const resolvedTenantId = barbeiro?.tenant_id || ownedTenant?.id || null;

      setAdminContext({
        barbeiroId: barbeiro?.id || null,
        apelido: barbeiro?.apelido || null,
        userId,
        // Admin global vê tudo. Dono de barbearia usa escopo do tenant quando houver tenantId.
        // Barbeiro normal continua limitado ao próprio barbeiroId pelo AdminAgenda.
        isAdmin: hasAdminRole,
        tenantId: resolvedTenantId,
      });
    } catch (error) {
      console.error("[AgendaFullScreen] Falha ao preparar agenda:", error);
      toast.error("Não foi possível abrir a agenda. Tente novamente.");
      navigate("/admin", { replace: true });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAppointmentClick = (appointment: any) => {
    setSelectedAppointment(appointment as TimelineAppointment);
  };

  const handleAddClick = (date: string, time: string) => {
    setSelectedSlot({ date, time });
    setManualBookingOpen(true);
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="h-dvh w-full bg-background relative overflow-hidden flex flex-col">
        {/* Premium Background Light Effects - Mobile */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[10%] left-[15%] w-[300px] h-[300px] rounded-full bg-primary/8 blur-[100px] animate-pulse" />
          <div className="absolute bottom-[20%] right-[10%] w-[250px] h-[250px] rounded-full bg-primary/6 blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        {/* Mobile Agenda */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
          {adminContext ? (
            <AdminMobileAgenda 
              onAppointmentClick={handleAppointmentClick}
              onAddClick={handleAddClick}
              barbeiroId={adminContext.barbeiroId}
              tenantId={adminContext?.tenantId}
            />
          ) : authLoading ? (
            <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
              Carregando agenda...
            </div>
          ) : null}
        </div>

        {/* Modals */}
        <AppointmentDetailsSidebar
          appointment={selectedAppointment}
          open={!!selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onUpdate={() => {
            // Dispara o refresh manual da agenda mobile (state local)
            window.dispatchEvent(new Event('agenda-refresh'));
          }}
          barbeiroId={adminContext?.barbeiroId}
        />

        <ManualBookingModal
          open={manualBookingOpen}
          onOpenChange={setManualBookingOpen}
          date={selectedSlot.date}
          time={selectedSlot.time}
          onSuccess={() => {
            window.dispatchEvent(new Event('agenda-refresh'));
          }}
          skipValidation={true}
          barbeiroId={adminContext?.barbeiroId || undefined}
          tenantId={adminContext?.tenantId || null}
        />
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="min-h-screen w-full bg-background relative overflow-hidden">
      {/* Premium Background Light Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Main red light orbs */}
        <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-primary/6 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/4 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
        
        {/* Smaller scattered red dots */}
        <div className="absolute top-[25%] right-[25%] w-3 h-3 rounded-full bg-primary/40 blur-[2px] animate-pulse" />
        <div className="absolute top-[60%] left-[20%] w-2 h-2 rounded-full bg-primary/30 blur-[1px] animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-[35%] right-[35%] w-4 h-4 rounded-full bg-primary/35 blur-[3px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[15%] right-[45%] w-2 h-2 rounded-full bg-primary/25 blur-[1px] animate-pulse" style={{ animationDelay: '0.8s' }} />
        <div className="absolute bottom-[15%] left-[40%] w-3 h-3 rounded-full bg-primary/30 blur-[2px] animate-pulse" style={{ animationDelay: '1.2s' }} />
        
        {/* Subtle depth gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 p-8">
        {adminContext ? (
          <AdminAgenda adminContext={adminContext} tenantId={adminContext.tenantId} />
        ) : authLoading ? (
          <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
            Carregando agenda...
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AgendaFullScreen;
