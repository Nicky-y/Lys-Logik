// Only public offline assets enter Cache Storage. API requests and application
// navigation always use the network; no customer records or auth responses are cached.
const CACHE = 'lys-logik-offline-__BUILD_ID__';
const OFFLINE_ASSETS = ['/offline.html', '/icons/app-v12-192.png'];
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PUSH_CAPABILITY')
    event.ports[0]?.postMessage({ push: true });
});
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    /* Generic notification if payload is invalid. */
  }
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const leadId =
    typeof payload.leadId === 'string' && uuid.test(payload.leadId)
      ? payload.leadId
      : null;
  const deliveryId =
    typeof payload.deliveryId === 'string' && uuid.test(payload.deliveryId)
      ? payload.deliveryId
      : 'new-lead';
  event.waitUntil(
    self.registration.showNotification('Ny henvendelse · Lys & Logik', {
      body: 'Der er kommet en ny henvendelse. Åbn appen for at se sagen.',
      icon: '/icons/app-v12-192.png',
      badge: '/icons/app-v12-192.png',
      tag: deliveryId,
      renotify: false,
      data: { leadId },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data?.leadId;
  const valid =
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const target =
    self.location.origin + (valid ? '/#/leads/' + id : '/#/pipeline');
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const app = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (app) {
        await app.navigate(target);
        await app.focus();
      } else await self.clients.openWindow(target);
    })(),
  );
});
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)),
  );
  // No skipWaiting: a release must not interrupt open forms in existing tabs.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('lys-logik-offline-') && key !== CACHE)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        const fallback = await cache.match('/offline.html');
        // Static hosts may redirect .html URLs before caching. Navigation cannot
        // consume a redirected response, so return the saved body as a fresh one.
        return fallback
          ? new Response(fallback.body, {
              status: fallback.status,
              statusText: fallback.statusText,
              headers: fallback.headers,
            })
          : Response.error();
      }),
    );
  } else if (!url.search && OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(url.pathname)) || fetch(request);
      })(),
    );
  }
});
