/* ============================================================
   TAZOS DORADOS · Service Worker
   Estrategia:
   - HTML/JS/CSS: NETWORK-FIRST (siempre intenta bajar nuevo,
     si no hay red usa cache). Así los cambios aparecen rápido.
   - Imágenes (Cloudinary): CACHE-FIRST (se guardan para ver
     offline y la app se siente instantánea).
   - Supabase API: NUNCA se cachea (datos siempre frescos).
   ============================================================ */

// IMPORTANTE: cambiar este número cada vez que haya cambios grandes
// para que los usuarios reciban la versión nueva automáticamente.
const CACHE_VERSION = 'v17';
const STATIC_CACHE = `tazos-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `tazos-images-${CACHE_VERSION}`;

// Archivos clave que precacheamos al instalar el SW
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// ================ INSTALL ================
self.addEventListener('install', (event) => {
  // Al instalar, precacheamos lo esencial
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] precache parcial:', err);
      });
    })
  );
  // Activar el nuevo SW inmediatamente
  self.skipWaiting();
});

// ================ ACTIVATE ================
self.addEventListener('activate', (event) => {
  // Limpiar caches viejos de versiones anteriores
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.endsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ================ FETCH ================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptamos GETs
  if (request.method !== 'GET') return;

  // Supabase (API): siempre network, nunca cache
  if (url.hostname.includes('supabase.co')) {
    return; // Dejar que el navegador lo maneje directo
  }

  // Cloudinary (imágenes): cache-first
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Todo lo demás (HTML, JS, CSS, íconos): network-first
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Recursos externos (fonts, supabase client CDN, etc.): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

// ================ STRATEGIES ================

// Network-first: intenta red, si falla usa cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    // Cachear la respuesta nueva para uso offline futuro
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    // Sin red: intentar cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Si es navegación y no hay cache, servir el index cached
    if (request.mode === 'navigate') {
      const indexCached = await caches.match('./index.html');
      if (indexCached) return indexCached;
    }
    throw err;
  }
}

// Cache-first: si está en cache, úsalo; si no, red
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    throw err;
  }
}

// Stale-while-revalidate: sirve cache, actualiza en el fondo
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(cacheName).then((cache) => {
        cache.put(request, response.clone()).catch(() => {});
      });
    }
    return response;
  }).catch(() => null);
  return cached || networkPromise;
}

// ================ MESSAGE HANDLER ================
// Permite a la app forzar un skip-waiting (para actualizar al instante)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
