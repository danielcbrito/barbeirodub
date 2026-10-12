import { Bell, RefreshCw } from "lucide-react";
import logoDub from "@/assets/logo-dub.png";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface AdminMobileHeaderProps {
  onMenuClick: () => void;
  pendingCount: number;
  currentTitle?: string;
}

export function AdminMobileHeader({ 
  onMenuClick, 
  pendingCount,
  currentTitle = "Visão Geral"
}: AdminMobileHeaderProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('agenda-refresh'));
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo + Título */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={logoDub} 
                alt="DUB" 
                className="w-9 h-9 object-contain drop-shadow-[0_0_6px_rgba(239,68,68,0.3)]" 
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-bold tracking-wide text-foreground">
                {currentTitle}
              </span>
              <span className="text-[10px] text-muted-foreground tracking-widest uppercase -mt-0.5">
                Admin
              </span>
            </div>
          </div>

          {/* Right - Refresh + Notificações */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center bg-secondary/40 active:scale-95 transition-all",
                refreshing && "animate-spin"
              )}
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>

            {pendingCount > 0 && (
              <div className="relative">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
