import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsSheet } from "./NotificationsSheet";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  userId: string;
  className?: string;
  iconClassName?: string;
}

export function NotificationBell({ userId, className, iconClassName }: NotificationBellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    loadUnreadCount();

    // Real-time subscription
    const channelId = `notification-count-${userId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificacoes',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const loadUnreadCount = async () => {
    try {
      const { count, error } = await supabase
        .from("notificacoes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("lida", false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error("Erro ao carregar contagem de notificações:", error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Notificações"
        className={cn(
          "w-11 h-11 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-white/10 text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700/80 transition-all active:scale-95 shrink-0 relative select-none touch-manipulation",
          className
        )}
      >
        <Bell className={cn("w-5 h-5 fill-zinc-900 text-zinc-900 dark:fill-white dark:text-white", iconClassName)} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 shadow-sm animate-in fade-in zoom-in-50">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        userId={userId}
      />
    </>
  );
}
