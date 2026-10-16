// Service worker: o app abre sem internet. Sempre tenta a versão nova primeiro (rede) e cai no cache se estiver offline.
// Pedidos ao Google (Drive, login) não passam pelo cache.
const CACHE = "banco-laudos-v4";
const ARQUIVOS = ["./", "index.html", "app.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "lib/db.js", "lib/drive.js", "lib/nuvem.js", "lib/ponte.js", "lib/regras.js", "lib/filtros.js", "lib/secoes.js", "lib/laudo2notion.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // "no-cache": confere com o GitHub se o arquivo mudou (sem isso o navegador usa a cópia antiga por até 10 min)
  e.respondWith(fetch(e.request.url, { cache: "no-cache" }).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
