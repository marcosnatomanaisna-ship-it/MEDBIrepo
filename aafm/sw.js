// Service worker do Arquivo AAFM.
// Estratégia: "network-first" — tenta sempre ir buscar a versão mais recente à rede
// (para nunca mostrar documentos desatualizados), e só usa a cópia guardada em cache
// quando não há ligação à internet. Isto permite instalar a app no telemóvel/computador
// e abri-la mesmo sem rede (mostra a última versão vista), sem arriscar mostrar dados
// antigos quando há ligação.

const NOME_CACHE = 'arquivo-aafm-v1';
const FICHEIROS_APP = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then((cache) => cache.addAll(FICHEIROS_APP))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.filter((nome) => nome !== NOME_CACHE).map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  // Só intercetamos pedidos GET da própria app (ficheiros estáticos).
  // Tudo o resto (Supabase, fontes, PDFs anexados, etc.) vai sempre direto à rede,
  // para nunca mostrar dados desatualizados nem quebrar o envio de formulários.
  if (evento.request.method !== 'GET') return;
  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
