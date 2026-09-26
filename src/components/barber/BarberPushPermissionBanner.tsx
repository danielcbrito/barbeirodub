/**
 * BarberPushPermissionBanner
 * Aviso amigável que aparece no painel do barbeiro quando ele ainda não
 * concedeu permissão de notificação. Some sozinho ao conceder.
 * Quando negado, vira um lembrete discreto.
 */
import { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface Props {
  barbeiroId: string | null | undefined;
}

const DISMISS_KEY = 'push_banner_dismissed_at';

export function BarberPushPermissionBanner({ barbeiroId }: Props) {
  const { permission, requestPermission, registering, isSupported, isPreviewBlocked } =
    usePushNotifications(barbeiroId);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const at = localStorage.getItem(DISMISS_KEY);
    if (!at) return false;
    // some por 24h depois de dispensar
    return Date.now() - Number(at) < 24 * 60 * 60 * 1000;
  });

  if (!barbeiroId) return null;
  if (!isSupported) return null;
  if (isPreviewBlocked) return null;
  if (permission === 'granted') return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  if (permission === 'denied') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium text-foreground">Notificações bloqueadas</p>
          <p className="mt-0.5 text-muted-foreground">
            Você não vai receber alertas de novos agendamentos. Para reativar, abra as configurações do navegador e libere notificações para este site.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm">
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
      <div className="flex-1">
        <p className="font-medium text-foreground">Receba alertas em tempo real</p>
        <p className="mt-0.5 text-muted-foreground">
          Ative as notificações para ser avisado de novos agendamentos, cancelamentos e remarcações — mesmo com o app fechado.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={requestPermission}
            disabled={registering}
          >
            {registering ? 'Ativando…' : 'Ativar notificações'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
