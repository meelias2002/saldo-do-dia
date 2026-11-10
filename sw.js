// Offline: responde do cache e atualiza em segundo plano (a versão nova aparece na abertura seguinte).
const C = 'saldo-v1';
const ARQ = ['./', 'index.html', 'logic.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(ARQ)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(C).then(async c => {
    const guardado = await c.match(e.request);
    const rede = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => guardado);
    return guardado || rede;
  }));
});
