// sw.js — Service Worker do "Kunsi bu Terra"
// Faz cache do "app shell" para o jogo funcionar 100% offline depois da primeira visita.

// IMPORTANTE: sempre que publicares uma alteração ao index.html (ou a qualquer
// ficheiro da lista abaixo), muda este número de versão. Isso força os
// telemóveis dos jogadores a descarregar a versão nova (o toast "Nova versão
// disponível" que já existe no index.html vai aparecer).
const CACHE_VERSION = 'v10';
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
  './icons/icon-512.png',
  './audio/bg-music.m4a',
  './audio/bg-music.mp3'
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
          // status 206 = resposta parcial (Range request, comum em áudio/vídeo
          // a fazer streaming). A Cache API não aceita guardar respostas
          // parciais, por isso ignoramos o cache nesse caso e só guardamos
          // respostas completas (200).
          if (response && response.ok && response.status !== 206) {
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
self.addEventListener('push', (event) => {
  let data = { title: 'Kunsi bu Terra', body: 'Tens uma notificação nova.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/apple-touch-icon.png',
      badge: 'icons/favicon-32.png',
      data: { url: data.url || '/' },
      tag: 'kbt-streak-reminder', // evita empilhar várias notificações repetidas
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
