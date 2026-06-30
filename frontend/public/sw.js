// BMB Studio — service worker
//
// Strategy:
// 1. NEVER cache /api/* responses — those must always come from the network so
//    things like "did Daniela cancel her booking?" reflect within seconds.
// 2. Network-first for HTML navigations (so a new build replaces the old shell
//    on first reload, even if the user is offline we fall back to cache).
// 3. Cache-first for static hashed assets (Vite outputs immutable filenames in
//    /assets/, so they are safe to cache aggressively until the next deploy
//    invalidates them via a new filename).
//
// VERSION must be bumped (or auto-bumped at build time) whenever the cache
// strategy or precached files change. The activate handler removes any caches
// that don't match the current version.

const VERSION = 'br-v5';
const STATIC_CACHE = `${VERSION}-static`;

self.addEventListener('install', (event) => {
  // NOTE: We intentionally do NOT call self.skipWaiting() here. We want a new SW
  // to stay in the 'waiting' state so the page can detect it and show the
  // "nueva versión disponible" banner. The activation (skipWaiting) happens only
  // when the user taps "Recargar", which posts the SKIP_WAITING message handled
  // below.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(VERSION))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
      // Notify all open tabs that a new version is active so they can hard-refresh
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SW_UPDATED', version: VERSION });
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 0. Solo http(s). Ignora chrome-extension://, data:, etc. — la Cache API no las soporta
  //    y `cache.put` reventaba con "Request scheme 'chrome-extension' is unsupported".
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. API calls — always fresh, never touched by SW
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('railway.app') ||
    url.hostname.startsWith('api.')
  ) {
    return; // let the browser handle, no SW intervention
  }

  // 2. HTML navigations — network-first with cache fallback for offline
  if (
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // 3. Hashed static assets — cache-first
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|eot|css|js)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        });
      })
    );
  }
});

// Allow the page to trigger an immediate activation of a waiting SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Web Push — mostrar la notificación recibida (aunque la pantalla esté bloqueada)
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || 'Casa Shé';
  const options = {
    body: payload.body || '',
    icon: '/casashe/favicon-casashe.png',
    badge: '/casashe/favicon-casashe.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en la notificación — enfocar una pestaña abierta o abrir la app en la pantalla correcta
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) { client.focus(); client.navigate(targetUrl); return; }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })()
  );
});
