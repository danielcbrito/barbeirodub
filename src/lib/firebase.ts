// Inicialização do Firebase + helpers de FCM no cliente.
// Apenas web/PWA. Nenhuma chave aqui é secreta — todas são públicas.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
  type MessagePayload,
} from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: 'AIzaSyAsVJKSYDXAEDtoD9VHi5jU0z9vrsQEWDM',
  authDomain: 'dubagenda-e5f62.firebaseapp.com',
  projectId: 'dubagenda-e5f62',
  messagingSenderId: '953046689414',
  appId: '1:953046689414:web:47b2d4ddd0b5a990ed9307',
};

export const VAPID_KEY =
  'BO5FB5acGkN8IFCoBG0GibjSFv1UoXDe4qYAWxaxMO1gEhp2N71dMAoepp6x0ijbJdS1KS5RtwOWlIgx5XT-nII';

let appInstance: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;
  appInstance = getApps()[0] ?? initializeApp(firebaseConfig);
  return appInstance;
}

export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (messagingInstance) return messagingInstance;
  try {
    if (!(await isSupported())) return null;
    messagingInstance = getMessaging(getFirebaseApp());
    return messagingInstance;
  } catch (e) {
    console.warn('[FCM] não suportado neste browser', e);
    return null;
  }
}

/** Registra o service worker dedicado do FCM e retorna o token do dispositivo. */
export async function requestFcmToken(): Promise<string | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  if (!('serviceWorker' in navigator)) return null;

  // Registra (ou recupera) o SW dedicado no escopo raiz (necessário p/ iOS PWA).
  // Não usamos navigator.serviceWorker.ready: ele só resolve quando um SW controla
  // a página e travava para sempre, impedindo o registro do aparelho.
  const swReg = await navigator.serviceWorker
    .register('/firebase-messaging-sw.js', { scope: '/' })
    .catch((e) => {
      console.warn('[FCM] erro ao registrar service worker', e);
      return null;
    });
  if (!swReg) return null;
  if (!swReg.active) {
    const sw = swReg.installing || swReg.waiting;
    if (sw) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 10000);
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') { clearTimeout(t); resolve(); }
        });
      });
    }
  }

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    return token || null;
  } catch (e) {
    console.warn('[FCM] erro ao obter token', e);
    return null;
  }
}

/** Listener para mensagens recebidas com o app aberto/em foreground. */
export async function onForegroundMessage(
  cb: (payload: MessagePayload) => void,
): Promise<() => void> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => undefined;
  return onMessage(messaging, cb);
}
