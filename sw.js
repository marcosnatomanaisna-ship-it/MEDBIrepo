// sw.js — Service Worker para MEDBI
// Estrategia: cache-first con actualización en segundo plano (stale-while-revalidate)
// Esto permite que la app funcione 100% offline después de la primera carga.

const CACHE_NAME = 'medbi-cache-v28'; // <-- sube este número cada vez que subas una nueva versión del HTML
const FILES_TO_CACHE = [
  '/MEDBI-MEDICINA-INTERNA/',
  '/MEDBI-MEDICINA-INTERNA/index.html'
];

// Instalación: guarda el HTML en caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activación: borra cachés viejas de versiones anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: responde desde caché primero (offline-first),
// y en paralelo intenta actualizar la caché si hay internet.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Si la red responde bien, actualiza la caché para la próxima vez
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // sin internet: usa lo cacheado

      // Si ya hay algo en caché, lo devuelve de inmediato (rápido y offline)
      return cachedResponse || fetchPromise;
    })
  );
});
