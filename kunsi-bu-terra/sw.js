// sw.js — Service Worker do "Kunsi bu Terra"
// Faz cache do "app shell" para o jogo funcionar 100% offline depois da primeira visita.

// IMPORTANTE: sempre que publicares uma alteração ao index.html (ou a qualquer
// ficheiro da lista abaixo), muda este número de versão. Isso força os
// telemóveis dos jogadores a descarregar a versão nova (o toast "Nova versão
// disponível" que já existe no index.html vai aparecer).
const CACHE_VERSION = 'v4';
const CACHE_NAME = 'kunsibuterra-' + CACHE_VERSION;

// Ficheiros essenciais para o jogo abrir e funcionar sem internet.
// Se adicionares mais ficheiros ao projeto (novos ícones, imagens, etc.),
// acrescenta-os aqui também.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---------- Instalação: guarda o app shell em cache ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        // Não deixa a instalação falhar por causa de um único ficheiro em falta
        console.warn('[SW] Falha ao pré-carregar alguns ficheiros do app shell:', err);
      });
    })
  );
  // Não ativa logo — fica "à espera" até o jogador confirmar no toast de
  // atualização (ver showUpdateToast no index.html). Isto evita que uma
  // partida em curso seja interrompida por uma atualização súbita.
});

// ---------- Espera pelo sinal do index.html para ativar a versão nova ----------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---------- Ativação: limpa caches antigas ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- Fetch: cache-first com atualização em segundo plano ----------
self.addEventListener('fetch', (event) => {
  // Só trata pedidos GET (POST/PUT para o Supabase, por exemplo, passam direto)
  if (event.request.method !== 'GET') return;

  // Não guardar em cache pedidos a outros domínios (ex: Supabase, CDNs)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sem rede: se pediram uma página (navegação), devolve o index.html
          // guardado em cache para o jogo continuar a abrir offline.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return cached;
        });

      // Responde já com a versão em cache (rápido) e atualiza-a em segundo
      // plano; se não houver nada em cache, espera pela rede.
      return cached || networkFetch;
    })
  );
});
