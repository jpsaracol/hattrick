// Guarda os arquivos do app para abrir rápido e funcionar sem internet.
// Ao mudar qualquer arquivo, aumente a VERSAO para os celulares baixarem de novo.
const VERSAO = "hattrick-v3";
const ARQUIVOS = [
  "./", "index.html", "painel.html", "privacidade.html", "manifest.webmanifest",
  "css/app.css?v=3", "js/config.js?v=3", "js/agenda.js?v=3", "js/app.js?v=3", "js/painel.js?v=3", "css/painel.css?v=3",
  "img/logo-hattrick.png", "img/icone-192.png", "img/icone-512.png",
  "fonts/barlow-400-latin.woff2", "fonts/barlow-500-latin.woff2", "fonts/barlow-condensed-700-latin.woff2",
];
self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Rede primeiro (pega novidades); sem internet, usa o que está guardado.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(VERSAO).then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
