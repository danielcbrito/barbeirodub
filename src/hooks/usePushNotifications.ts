/**
 * usePushNotifications
 * --------------------
 * Solicita permissão de notificação web/PWA, captura o FCM token do dispositivo
 * e mantém-o atualizado na tabela `barber_fcm_tokens` para o barbeiro logado.
 *
 * Também escuta mensagens em foreground e exibe um toast.
 *
 * Uso: chamar uma vez no painel do barbeiro com o `barbeiroId` resolvido.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { onForegroundMessage, requestFcmToken } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const isInIframe = (() => {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('id-preview--') ||
    window.location.hostname.includes('lovableproject.com'));

function getInitialPermission(): PushPermission {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return (Notification.permission as PushPermission) ?? 'default';
}

export function usePushNotifications(barbeiroId: string | null | undefined) {
  const [permission, setPermission] = useState<PushPermission>(getInitialPermission);
  const [token, setToken] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const lastSyncedToken = useRef<string | null>(null);

  /** Salva/atualiza o token do dispositivo na tabela do barbeiro. */
  const syncToken = useCallback(
    async (newToken: string) => {
      if (!barbeiroId) return;
      if (lastSyncedToken.current === newToken) return;
      const { error } = await supabase.from('barber_fcm_tokens').upsert(
        {
          barbeiro_id: barbeiroId,
          token: newToken,
          platform: 'web',
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );
      if (error) {
        console.warn('[push] erro ao salvar token', error);
        return;
      }
      lastSyncedToken.current = newToken;
    },
    [barbeiroId],
  );

  /** Pede permissão (gesto do usuário) e registra o token. */
  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (registering) return permission;
    setRegistering(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== 'granted') return result as PushPermission;

      const fcmToken = await requestFcmToken();
      if (fcmToken) {
        setToken(fcmToken);
        await syncToken(fcmToken);
      }
      return 'granted';
    } finally {
      setRegistering(false);
    }
  }, [permission, registering, syncToken]);

  // Auto-registra se já tem permissão concedida
  useEffect(() => {
    if (!barbeiroId) return;
    if (isInIframe || isPreviewHost) return; // SW não funciona dentro do preview iframe
    if (permission !== 'granted') return;

    let cancelled = false;
    (async () => {
      const fcmToken = await requestFcmToken();
      if (cancelled || !fcmToken) return;
      setToken(fcmToken);
      await syncToken(fcmToken);
    })();
    return () => {
      cancelled = true;
    };
  }, [barbeiroId, permission, syncToken]);

  // Listener de mensagens com app aberto — exibe toast
  useEffect(() => {
    if (!barbeiroId) return;
    if (isInIframe || isPreviewHost) return;
    if (permission !== 'granted') return;

    let unsubscribe: () => void = () => undefined;
    (async () => {
      unsubscribe = await onForegroundMessage((payload) => {
        const title = payload.notification?.title || (payload.data?.title as string) || 'Nova notificação';
        const body = payload.notification?.body || (payload.data?.body as string) || '';
        toast({ title, description: body });
      });
    })();
    return () => unsubscribe();
  }, [barbeiroId, permission]);

  return {
    permission,
    token,
    registering,
    requestPermission,
    isSupported: permission !== 'unsupported',
    isPreviewBlocked: isInIframe || isPreviewHost,
  };
}
