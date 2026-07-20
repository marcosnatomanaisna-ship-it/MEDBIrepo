// Service Worker — Biologia Pré-Médico
// Faz cache dos ficheiros essenciais na instalação e serve-os offline depois.
// Como a app é um único ficheiro HTML sem recursos externos, basta cachear
// o próprio index.html (e o manifest/ícones) para funcionar 100% offline.

const CACHE_NAME = "biologia-premedico-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalação: guarda os ficheiros essenciais em cache
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação: remove caches antigas de versões anteriores
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            return name !== CACHE_NAME;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch: tenta a cache primeiro (offline-first); se não encontrar, vai à rede
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then(function (networkResponse) {
          return caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(function () {
          // Sem rede e sem cache: se for navegação, devolve o index.html
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
