// Kill-switch do antigo service worker de app-shell.
//
// Alguns celulares ainda podem estar controlados por um SW antigo/cache antigo,
// causando tela branca após publicação. Este arquivo precisa continuar existindo
// em /sw.js por um ciclo de release para apagar caches Workbox e se desregistrar.
// O worker de push/FCM real fica separado em /firebase-messaging-sw.js.

function isLegacyAppCache(name) {
  const isWorkboxCache = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  const belongsToThisScope = name.endsWith(self.registration.scope) || name.includes(self.location.origin);
  const isPushCache = /firebase|fcm|messaging|onesignal/i.test(name);
  return !isPushCache && (isWorkboxCache || belongsToThisScope);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const legacyCaches = cacheNames.filter(isLegacyAppCache);
        await Promise.allSettled(legacyCaches.map((name) => caches.delete(name)));

        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(
          clients.map((client) => {
            if ("navigate" in client) return client.navigate(client.url);
            return undefined;
          }),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});
