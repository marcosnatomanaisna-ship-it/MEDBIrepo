// sw.js — Service Worker para MEDBI
// Estrategia: cache-first con actualización en segundo plano (stale-while-revalidate)

const CACHE_NAME = 'medbi-cache-v30'; // v30: correcção de path + force-update
const FILES_TO_CACHE = [
  '/MEDBIrepo/',
  '/MEDBIrepo/index.html'
];

// Instalação: guarda o HTML em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting(); // activa imediatamente sem esperar fechar tabs antigas
});

// Activação: apaga TODAS as caches antigas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('MEDBI SW: apagando cache antiga:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim(); // toma controlo de todas as tabs imediatamente
});

// Mensagem do cliente para forçar skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: responde desde cache primeiro (offline-first),
// e em paralelo tenta actualizar a cache se houver internet.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
