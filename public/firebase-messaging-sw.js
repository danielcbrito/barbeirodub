/* Firebase Cloud Messaging - service worker (background notifications)
   Mantém-se em escopo / para receber pushes mesmo com o app fechado. */
/* global importScripts, firebase, clients */

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAsVJKSYDXAEDtoD9VHi5jU0z9vrsQEWDM',
  authDomain: 'dubagenda-e5f62.firebaseapp.com',
  projectId: 'dubagenda-e5f62',
  messagingSenderId: '953046689414',
  appId: '1:953046689414:web:47b2d4ddd0b5a990ed9307',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'DUB Agenda';
  const body = payload?.notification?.body || payload?.data?.body || '';
  const url = payload?.fcmOptions?.link || payload?.data?.url || '/barbeiro';

  self.registration.showNotification(title, {
    body,
    icon: '/app-icon.png',
    badge: '/app-icon.png',
    data: { url, ...(payload?.data || {}) },
    tag: payload?.data?.appointment_id || undefined,
    renotify: true,
  });
});

// Listener nativo de push da Web Push API (iOS 16.4+ Safari PWA, Android Chrome, navegadores desktop)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const notification = data.notification || data;
  const title = notification.title || data.title || 'DUB Agenda';
  const body = notification.body || data.body || '';
  const url = data?.data?.url || data?.url || '/barbeiro';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/app-icon.png',
      badge: '/app-icon.png',
      data: { url, ...(data.data || {}) },
      tag: data.tag || data.appointment_id || undefined,
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/barbeiro';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          try { client.navigate(targetUrl); } catch { /* ignore */ }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    }),
  );
});
