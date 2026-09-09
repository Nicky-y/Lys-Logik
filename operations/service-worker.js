// Only public offline assets enter Cache Storage. API requests and application
// navigation always use the network; no customer records or auth responses are cached.
const CACHE = 'lys-logik-offline-__BUILD_ID__';
const OFFLINE_ASSETS = ['/offline.html', '/icons/app-192.png'];
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
