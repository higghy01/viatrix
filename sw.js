/* Copia dell'app sul telefono: si apre anche senza rete.
   A ogni modifica dei file alzare VERSIONE, altrimenti il telefono resta sulla vecchia. */
const VERSIONE = "viatrix-v7";
const FILE = ["./", "index.html", "stile.css?v=7", "app.js?v=7", "config.js?v=7", "lib/d3.min.js", "lib/topojson-client.min.js",
  "data/paesi.json", "data/mondo.json", "data/globo.json", "manifest.json", "icona-180.png", "icona-512.png", "logo.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // solo le copie di Viatrix: sullo stesso indirizzo (higghy01.github.io) ci sono anche altre app
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith("viatrix-") && n !== VERSIONE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin) {
    if (!u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    const fisso = /\/(lib|data)\//.test(u.pathname);
    if (fisso) {
      // mappa, città e librerie cambiano solo con una versione nuova: prima la copia
      e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { if (n.ok) { const c = n.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); } return n; })));
    } else {
      // pagina, stile e codice: prima la rete (così le novità arrivano subito), senza rete la copia
      e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); } return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
    }
  } else if (u.host.endsWith("fonts.googleapis.com") || u.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const c = n.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); return n; })));
  }
});
