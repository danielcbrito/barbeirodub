import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Bell, 
  ChevronLeft,
  Check
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

function NotificationRow({ 
  notification, 
  onMarkAsRead,
  onReschedule 
}: { 
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onReschedule: (id: string) => void;
}) {
  const needsAction = notification.tipo === 'remarcacao' || notification.tipo === 'cancelamento_massa';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn(
        "relative p-4 rounded-2xl border transition-all",
        notification.lida
          ? "bg-card/50 border-border/40"
          : "bg-card border-border/80 shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!notification.lida && (
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-label="Não lida" />
          )}
          <h4 className={cn(
            "text-[14px] leading-tight truncate",
            notification.lida ? "font-medium text-muted-foreground" : "font-semibold text-foreground"
          )}>
            {notification.titulo}
          </h4>
        </div>

        <span className="text-[11px] text-muted-foreground/70 shrink-0 font-normal">
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true,
            locale: ptBR
          })}
        </span>
      </div>

      <p className={cn(
        "text-[13px] leading-relaxed mt-1.5",
        notification.lida ? "text-muted-foreground/75" : "text-muted-foreground"
      )}>
        {notification.mensagem}
      </p>

      {(needsAction || !notification.lida) && (
        <div className="flex items-center justify-end gap-2.5 mt-3 pt-2 border-t border-border/40">
          {needsAction && (
            <button
              onClick={() => onReschedule(notification.id)}
              className="text-[11.5px] font-semibold bg-foreground text-background px-3.5 py-1.5 rounded-full hover:opacity-90 active:scale-95 transition-all"
            >
              Ver agenda
            </button>
          )}
          {!notification.lida && (
            <button
              onClick={() => onMarkAsRead(notification.id)}
              className="text-[11.5px] text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              Marcar como lida
            </button>
          )}
        </div>
      )}
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
    const channelId = `user-notifications-${userId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
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
      toast.success("Notificações lidas");
    } catch (error) {
      console.error("Erro ao marcar todas como lidas:", error);
    }
  };

  const handleReschedule = (notificationId: string) => {
    markAsRead(notificationId);
    onOpenChange(false);
    navigate("/cliente/agendar");
  };

  const hasUnread = notifications.some(n => !n.lida);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-background border-l border-border flex flex-col h-full">
        
        {/* TOPO LIMPO: Apenas a setinha com círculo por trás e título, sem barra de fundo */}
        <div className="px-5 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <button 
              onClick={() => onOpenChange(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary text-foreground active:scale-95 transition-all shadow-sm shrink-0"
              aria-label="Fechar notificações"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
            <h2 className="text-[18px] font-bold text-foreground tracking-tight">Notificações</h2>
          </div>
          
          {hasUnread && (
            <button 
              onClick={markAllAsRead}
              className="text-[12.5px] text-muted-foreground hover:text-foreground font-medium transition-colors px-2 py-1 rounded-md"
            >
              Marcar todas
            </button>
          )}
        </div>

        {/* LISTA DE NOTIFICAÇÕES */}
        <div className="flex-1 p-4 space-y-2.5 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <Bell className="w-8 h-8 text-muted-foreground/30 stroke-[1.5] mb-3" />
              <p className="text-[14px] font-semibold text-foreground">
                Nenhuma notificação
              </p>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-[220px]">
                Você receberá avisos sobre seus agendamentos aqui.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {notifications.map((notif) => (
                <NotificationRow 
                  key={notif.id}
                  notification={notif}
                  onMarkAsRead={markAsRead}
                  onReschedule={handleReschedule}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

      </SheetContent>
    </Sheet>
  );
}
