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
import { onForegroundMessage, requestFcmToken, VAPID_KEY } from '@/lib/firebase';
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(barbeiroId: string | null | undefined) {
  const [permission, setPermission] = useState<PushPermission>(getInitialPermission);
  const [token, setToken] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const lastSyncedToken = useRef<string | null>(null);

  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  );
  const isIOSWithoutPWA = isIOS && !isStandalone;

  /** Salva a assinatura nativa do Web Push API na tabela push_subscriptions */
  const syncPushSubscription = useCallback(
    async (fcmToken?: string | null) => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      try {
        const swReg = await navigator.serviceWorker.ready;
        if (!swReg || !swReg.pushManager) return;

        let sub = await swReg.pushManager.getSubscription();
        if (!sub && VAPID_KEY) {
          try {
            sub = await swReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
            });
          } catch (subErr) {
            console.warn('[push] Falha ao assinar pushManager nativo:', subErr);
          }
        }

        if (sub) {
          const subJson = sub.toJSON();
          const p256dh = subJson.keys?.p256dh || null;
          const auth = subJson.keys?.auth || null;
          const deviceType = isIOS
            ? (isStandalone ? 'ios_pwa' : 'safari')
            : (isStandalone ? 'android_pwa' : 'web');

          const { data: userAuth } = await supabase.auth.getUser();
          const userId = userAuth?.user?.id || null;

          await (supabase as any).from('push_subscriptions').upsert(
            {
              user_id: userId,
              barbeiro_id: barbeiroId || null,
              endpoint: sub.endpoint,
              p256dh,
              auth,
              subscription_json: { ...subJson, fcmToken: fcmToken || null },
              device_type: deviceType,
              user_agent: navigator.userAgent,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'endpoint' }
          );
        }
      } catch (err) {
        console.warn('[push] Erro ao sincronizar push_subscriptions:', err);
      }
    },
    [barbeiroId, isIOS, isStandalone],
  );

  /** Salva/atualiza o token do dispositivo na tabela barber_fcm_tokens */
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
      } else {
        lastSyncedToken.current = newToken;
      }

      // Sincroniza também com push_subscriptions
      await syncPushSubscription(newToken);
    },
    [barbeiroId, syncPushSubscription],
  );

  /** Pede permissão (gesto do usuário ou primeiro acesso) e registra o token */
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
      } else {
        await syncPushSubscription(null);
      }
      return 'granted';
    } finally {
      setRegistering(false);
    }
  }, [permission, registering, syncToken, syncPushSubscription]);

  // Solicita permissão automaticamente no primeiro acesso se ainda estiver em 'default'
  useEffect(() => {
    if (!barbeiroId) return;
    if (isInIframe || isPreviewHost) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'default') {
      const timer = setTimeout(() => {
        // No iOS Safari normal (não PWA), Web Push não é suportado até ser adicionado à Tela de Início
        if (isIOSWithoutPWA) {
          console.log('[push] iOS Safari detectado: Web Push requer app na Tela de Início.');
          return;
        }
        requestPermission().catch(() => {});
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [barbeiroId, isIOSWithoutPWA, requestPermission]);

  // Auto-registra se já tem permissão concedida
  useEffect(() => {
    if (!barbeiroId) return;
    if (isInIframe || isPreviewHost) return;
    if (permission !== 'granted') return;

    let cancelled = false;
    (async () => {
      const fcmToken = await requestFcmToken();
      if (cancelled) return;
      if (fcmToken) {
        setToken(fcmToken);
        await syncToken(fcmToken);
      } else {
        await syncPushSubscription(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [barbeiroId, permission, syncToken, syncPushSubscription]);

  // Listener de mensagens com app aberto — exibe toast limpo com mesmo formato do push
  useEffect(() => {
    if (!barbeiroId) return;
    if (isInIframe || isPreviewHost) return;
    if (permission !== 'granted') return;

    let unsubscribe: () => void = () => undefined;
    (async () => {
      unsubscribe = await onForegroundMessage((payload) => {
        const title = payload.notification?.title || (payload.data?.title as string) || 'Notificação';
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
    isIOS,
    isStandalone,
    isIOSWithoutPWA,
  };
}
