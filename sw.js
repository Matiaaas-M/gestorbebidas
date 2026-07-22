/* =====================================================
   GestorBebidas — Service Worker
   Estrategia: Cache-First para assets, Network-First para API
   ===================================================== */

const CACHE_NAME    = 'gestorbebidas-v1';
const RUNTIME_CACHE = 'gestorbebidas-runtime-v1';

// Assets que se cachean al instalar el SW
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

// ─── Install: pre-cachear assets estáticos ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        // Algunos CDN pueden fallar; ignoramos errores individuales
        console.warn('[SW] Pre-cache parcial:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: limpiar caches viejos ───
self.addEventListener('activate', (event) => {
  const CURRENT_CACHES = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: estrategia según tipo de petición ───
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Supabase API → siempre Network, sin cache
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({ error: 'Sin conexión a internet' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503,
      })
    ));
    return;
  }

  // Fonts e íconos de Google → Cache-First con runtime cache
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Tailwind CDN → Cache-First
  if (url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Archivos locales (HTML, imágenes, etc.) → Cache-First
  if (url.origin === self.location.origin || request.url.startsWith('file://')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Resto → Network con fallback a cache
  event.respondWith(networkFirst(request));
});

// ─── Helpers ───

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Sin conexión', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}

// ─── Push notifications (base, para futuro uso) ───
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'GestorBebidas', {
    body:  data.body  || '',
    icon:  './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
  });
});
