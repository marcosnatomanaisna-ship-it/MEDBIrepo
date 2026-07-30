// sw.js — Service Worker para MEDBI
// Estrategia: cache-first con actualización en segundo plano (stale-while-revalidate)

const CACHE_NAME = 'medbi-cache-v32'; // v32: caminhos relativos (corrige 404 do cache.addAll)

// Caminhos relativos: resolvem sempre em relação à pasta onde este sw.js
// está (ex: /MEDBIrepo/medbi-mi/), seja qual for o repositório/subpasta.
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Instalação: guarda o HTML em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falha por inteiro se um único arquivo der 404 — usamos
      // add() individual com catch para não perder o cache todo por
      // causa de um ícone/arquivo que falhe.
      return Promise.all(
        FILES_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('MEDBI SW: falha ao cachear', url, err);
          })
        )
      );
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
