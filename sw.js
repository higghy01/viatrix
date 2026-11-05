/* Copia dell'app sul telefono: si apre anche senza rete.
   A ogni modifica dei file alzare VERSIONE (e il ?v= in index.html), altrimenti il telefono resta sulla vecchia.
   Se cambiano i file in data/, alzare DATI (qui e in app.js): i dati vecchi si buttano. */
const VERSIONE = "viatrix-v15";
const DATI = "d3";
const FILE = ["./", "index.html", "tema.js?v=15", "stile.css?v=15", "app.js?v=15", "config.js?v=15", "lib/d3.min.js", "lib/topojson-client.min.js",
  `data/paesi.json?v=${DATI}`, `data/mondo.json?v=${DATI}`, `data/globo.json?v=${DATI}`, "manifest.json", "icona-180.png", "icona-512.png", "logo.svg"];
// Con la rete lenta (aeroporto, roaming) si aspetta al massimo 3 secondi, poi si apre la copia
const ATTESA = 3000;
// Città e posti da non perdere scaricati quando servono: in una copia a parte che resta tra una versione e l'altra
// (così dopo un aggiornamento restano disponibili anche senza rete); si butta solo quando cambia DATI.
const CACHE_DATI = "viatrix-dati";
// Foto dei posti da non perdere (miniature di Wikimedia Commons): prima la copia, al massimo 400 foto tenute
const FOTO_WIKI = "viatrix-foto-wiki";
let lentaFino = 0;
// "reload": i file si prendono dalla rete, non dalla memoria del browser (GitHub tiene le copie 10 minuti: si rischiavano file vecchi)
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // solo le copie di Viatrix: sullo stesso indirizzo (higghy01.github.io) ci sono anche altre app
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith("viatrix-") && n !== VERSIONE && n !== FOTO_WIKI && n !== CACHE_DATI).map(n => caches.delete(n))))
    // nei dati scaricati si tengono solo quelli della versione attuale dei dati
    .then(() => caches.open(CACHE_DATI)).then(c => c.keys().then(k => Promise.all(k.filter(r => new URL(r.url).searchParams.get("v") !== DATI).map(r => c.delete(r)))))
    .catch(() => {}).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin) {
    if (!u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    if (/\/(lib|data)\//.test(u.pathname)) {
      // mappa, città, posti e librerie cambiano solo con una versione nuova: prima la copia
      e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => {
        if (n.ok && u.pathname.includes("/data/")) { const c = n.clone(); e.waitUntil(caches.open(CACHE_DATI).then(x => x.put(e.request, c)).catch(() => {})); }
        return n;
      })));
      return;
    }
    // pagina, stile e codice: prima la rete (così le novità arrivano subito), ma se tarda più di 3 secondi
    // o non c'è, o risponde con un errore, la copia; la risposta buona della rete aggiorna comunque la copia per la prossima volta.
    const rete = fetch(e.request);
    e.waitUntil(rete.then(r => { if (r.ok) { const c = r.clone(); return caches.open(VERSIONE).then(x => x.put(e.request, c)); } }).catch(() => {}));
    // la pagina di riserva (index.html) solo per l'apertura dell'app, mai al posto di un'immagine o di un file
    const copia = () => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : null));
    e.respondWith(new Promise(ok => {
      let fatto = false;
      const dai = r => { if (!fatto && r) { fatto = true; ok(r); } };
      // appena la rete si è dimostrata lenta, per mezzo minuto gli altri file vengono subito dalla copia (la rete li aggiorna dopo)
      const giaLenta = Date.now() < lentaFino;
      const t = setTimeout(() => { if (!giaLenta) lentaFino = Date.now() + 30000; caches.match(e.request).then(dai); }, giaLenta ? 0 : ATTESA);
      rete.then(r => {
        clearTimeout(t);
        if (r.ok) return dai(r);
        // errore del sito (404, 503…): meglio la copia, se c'è
        copia().then(c => dai(c || r));
      }, () => { clearTimeout(t); copia().then(r => dai(r || Response.error())); });
      // se dopo i 3 secondi non c'è nessuna copia, si aspetta comunque la rete (o il suo errore)
    }));
  } else if (u.host === "upload.wikimedia.org" && u.pathname.startsWith("/wikipedia/commons/thumb/")) {
    // le miniature arrivano con crossorigin (risposte "vere", non opache): si tengono solo quelle andate bene
    e.respondWith(caches.open(FOTO_WIKI).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => {
      if (n.ok && n.type !== "opaque") e.waitUntil(c.put(e.request, n.clone()).then(() => c.keys()).then(k => Promise.all(k.slice(0, Math.max(0, k.length - 400)).map(x => c.delete(x)))).catch(() => {}));
      return n;
    }))).catch(() => fetch(e.request)));
  }
  // i caratteri di Google non si tengono più in copia: erano risposte "opache" che occupano molto spazio
  // (sull'iPhone si usano comunque quelli di sistema)
});
