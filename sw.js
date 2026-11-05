/* Copia dell'app sul telefono: si apre anche senza rete.
   A ogni modifica dei file alzare VERSIONE, altrimenti il telefono resta sulla vecchia. */
const VERSIONE = "viatrix-v11";
const FILE = ["./", "index.html", "stile.css?v=11", "app.js?v=11", "config.js?v=11", "lib/d3.min.js", "lib/topojson-client.min.js",
  "data/paesi.json", "data/mondo.json", "data/globo.json", "manifest.json", "icona-180.png", "icona-512.png", "logo.svg"];
// Con la rete lenta (aeroporto, roaming) si aspetta al massimo 3 secondi, poi si apre la copia
const ATTESA = 3000;
// Foto dei posti da non perdere (Wikimedia Commons): prima la copia, al massimo 400 foto tenute
const FOTO_WIKI = "viatrix-foto-wiki";
let lentaFino = 0;
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // solo le copie di Viatrix: sullo stesso indirizzo (higghy01.github.io) ci sono anche altre app
  // (le foto dei posti da non perdere restano tra una versione e l'altra)
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith("viatrix-") && n !== VERSIONE && n !== FOTO_WIKI).map(n => caches.delete(n)))).then(() => self.clients.claim()));
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
      // pagina, stile e codice: prima la rete (così le novità arrivano subito), ma se tarda più di 3 secondi
      // o non c'è, la copia; la risposta della rete, se arriva dopo, aggiorna comunque la copia per la prossima volta.
      const rete = fetch(e.request);
      // (la copia della risposta si fa prima di darla alla pagina: questo "then" è registrato per primo)
      e.waitUntil(rete.then(r => { if (r.ok) { const c = r.clone(); return caches.open(VERSIONE).then(x => x.put(e.request, c)); } }).catch(() => {}));
      const copia = () => caches.match(e.request).then(r => r || caches.match("index.html"));
      e.respondWith(new Promise(ok => {
        let fatto = false;
        const dai = r => { if (!fatto && r) { fatto = true; ok(r); } };
        // appena la rete si è dimostrata lenta, per mezzo minuto gli altri file vengono subito dalla copia (la rete li aggiorna dopo)
        const giaLenta = Date.now() < lentaFino;
        const t = setTimeout(() => { if (!giaLenta) lentaFino = Date.now() + 30000; caches.match(e.request).then(dai); }, giaLenta ? 0 : ATTESA);
        rete.then(r => { clearTimeout(t); dai(r); }, () => { clearTimeout(t); copia().then(r => dai(r || Response.error())); });
        // se dopo i 3 secondi non c'è nessuna copia, si aspetta comunque la rete (o il suo errore)
      }));
    }
  } else if ((u.host === "commons.wikimedia.org" && u.pathname.startsWith("/wiki/Special:FilePath/")) || u.host === "upload.wikimedia.org") {
    e.respondWith(caches.open(FOTO_WIKI).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => {
      if (n.ok || n.type === "opaque") e.waitUntil(c.put(e.request, n.clone()).then(() => c.keys()).then(k => Promise.all(k.slice(0, Math.max(0, k.length - 400)).map(x => c.delete(x)))));
      return n;
    }))));
  } else if (u.host.endsWith("fonts.googleapis.com") || u.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const c = n.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); return n; })));
  }
});
