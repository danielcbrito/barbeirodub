import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Bell, 
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
  agendamento_id: string | null;
}

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

// Componente do Card de Notificação Premium
function NotificationCard({ 
  notification, 
  onMarkAsRead,
  onReschedule 
}: { 
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onReschedule: (id: string) => void;
}) {
  const icons: Record<string, React.ReactNode> = {
    agendamento_confirmado: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    atendimento_concluido: <CheckCircle2 className="w-5 h-5 text-primary" />,
    cancelamento: <XCircle className="w-5 h-5 text-destructive" />,
    cancelamento_massa: <XCircle className="w-5 h-5 text-destructive" />,
    remarcacao: <Calendar className="w-5 h-5 text-primary" />,
    lembrete: <Clock className="w-5 h-5 text-primary" />,
    plano_pendente: <AlertCircle className="w-5 h-5 text-amber-500" />,
  };

  const needsAction = notification.tipo === 'remarcacao' || notification.tipo === 'cancelamento_massa';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative rounded-xl p-4 border transition-all",
        notification.lida
          ? "bg-card border-border"
          : "bg-card border-destructive/30 shadow-md"
      )}
    >
      {/* Indicador de nova notificação */}
      {!notification.lida && (
        <div className="absolute top-4 right-4">
          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
        </div>
      )}

      <div className="flex gap-3">
        {/* Ícone */}
        <div className="flex-shrink-0 mt-0.5">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            notification.lida ? "bg-muted" : "bg-primary/10"
          )}>
            {icons[notification.tipo] || <Bell className="w-5 h-5 text-muted-foreground" />}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className={cn(
              "font-semibold",
              notification.lida ? "text-muted-foreground" : "text-foreground"
            )}>
              {notification.titulo}
            </h4>
            {!notification.lida && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                Nova
              </span>
            )}
          </div>

          <p className={cn(
            "text-sm mb-2 line-clamp-2",
            notification.lida ? "text-muted-foreground" : "text-foreground/80"
          )}>
            {notification.mensagem}
          </p>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.created_at), {
                addSuffix: true,
                locale: ptBR
              })}
            </span>

            <div className="flex items-center gap-2">
              {needsAction && (
                <button
                  onClick={() => onReschedule(notification.id)}
                  className="text-xs bg-primary/15 text-primary px-3 py-1.5 rounded-lg font-medium hover:bg-primary/25 transition-colors"
                >
                  Ver agenda
                </button>
              )}
              {!notification.lida && (
                <button
                  onClick={() => onMarkAsRead(notification.id)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Marcar como lida
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function NotificationsSheet({ open, onOpenChange, userId }: NotificationsSheetProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open && userId) {
      loadNotifications();
    }
  }, [open, userId]);

  useEffect(() => {
    if (!userId) return;
    
    // Real-time subscription for new notifications
    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadNotifications();
          toast.info("Nova notificação recebida!");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const loadNotifications = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      /* Select apenas campos exibidos na lista de notificações */
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, tipo, titulo, mensagem, lida, created_at, agendamento_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
      toast.error("Erro ao carregar notificações");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", notificationId);

      if (error) throw error;
      
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, lida: true } : notif
        )
      );
    } catch (error) {
      console.error("Erro ao marcar como lida:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("user_id", userId)
        .eq("lida", false);

      if (error) throw error;
      
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
      toast.success("Todas marcadas como lidas");
    } catch (error) {
      console.error("Erro ao marcar todas como lidas:", error);
      toast.error("Erro ao marcar notificações como lidas");
    }
  };

  const handleReschedule = (notificationId: string) => {
    markAsRead(notificationId);
    onOpenChange(false);
    navigate("/cliente/agendar");
  };

  const unreadCount = notifications.filter(n => !n.lida).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 bg-background border-border">
        
        {/* HEADER FIXO */}
        <div className="sticky top-0 bg-background border-b border-border px-4 py-4 z-10">
          <div className="flex items-center gap-3 mb-4">
            <button 
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-bold">Notificações</h2>
              <p className="text-sm text-muted-foreground">Acompanhe suas atualizações</p>
            </div>
            
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Marcar todas
              </button>
            )}
          </div>
          
          {/* Badge de contagem */}
          {unreadCount > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2"
            >
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-sm text-primary font-medium">
                {unreadCount} {unreadCount === 1 ? 'nova notificação' : 'novas notificações'}
              </span>
            </motion.div>
          )}
        </div>

        {/* LISTA DE NOTIFICAÇÕES */}
        <div className="p-4 space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto pb-20">
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                <Bell className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhuma notificação
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Você receberá atualizações sobre seus agendamentos aqui
              </p>
            </motion.div>
          ) : (
            <AnimatePresence>
              {notifications.map((notif, index) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <NotificationCard 
                    notification={notif}
                    onMarkAsRead={markAsRead}
                    onReschedule={handleReschedule}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          
        </div>

      </SheetContent>
    </Sheet>
  );
}
