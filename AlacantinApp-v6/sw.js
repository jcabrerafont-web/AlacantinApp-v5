// ============================================================================
// ALACANTINAPP V6 - SERVICE WORKER (OFFLINE-FIRST)
// Club Gallina Alacantina (ESGA025)
// ============================================================================

const CACHE_NAME = 'alacantinapp-v6-static-v2';
const DYNAMIC_CACHE = 'alacantinapp-v6-dynamic-v2';

// Recursos estáticos nucleares que se precachean
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './pdf-engine.js',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precacheando recursos estáticos del núcleo PWA...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Algunos recursos no pudieron precachearse directamente:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activación y limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
            console.log('[SW] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de Fetch: Stale-While-Revalidate para estáticos y Network-First con fallback para CDNs
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones a la API REST o Auth de Supabase (las maneja SyncQueue)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Peticiones de navegación o assets estáticos
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // En segundo plano revalidar si hay red
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {
          // Sin conexión: respuesta de caché ya servida
        });
        return cachedResponse;
      }

      // Si no está en caché, intentar red y almacenar en DYNAMIC_CACHE
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback offline para navegación
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Escucha de mensajes para forzar sincronización o actualizar
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
