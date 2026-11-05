/* Viatrix — i posti in cui hai viaggiato, sulla mappa.
   Tutto resta sul telefono (IndexedDB): paesi, città, viaggi e foto. Niente account, niente server. */
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// versione dei file in data/: se cambiano, alzarla anche in sw.js (DATI)
const DATI_V = "d3";
const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pocoMoto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOLLA = "cubic-bezier(.32,.72,0,1)";
const norm = s => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, " ").trim();
const bandiera = c => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt(0))) : "🏳️";

/* ---------- Cose fisse ---------- */
const STATI = {
  v: { t: "Visitato", e: "📍", cv: "--v", cf: "--v-f" },
  l: { t: "Ci vivo", e: "🏡", cv: "--l", cf: "--l-f" },
  w: { t: "Vorrei andarci", e: "✨", cv: "--w", cf: "--w" }
};
const RANGO = { l: 3, v: 2, w: 1 };
const MEZZI = [["aereo", "✈️", "Aereo"], ["treno", "🚆", "Treno"], ["auto", "🚗", "Auto"], ["nave", "⛴️", "Nave"], ["bus", "🚌", "Pullman"],
  ["camper", "🚐", "Camper"], ["moto", "🏍️", "Moto"], ["bici", "🚲", "Bici"], ["piedi", "🥾", "A piedi"]];
const MZ = Object.fromEntries(MEZZI.map(m => [m[0], m]));
// vale solo se la chiave è proprio dell'oggetto (non "constructor", "toString"… ereditati)
const proprio = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
const CONT = { eu: "Europa", as: "Asia", af: "Africa", na: "America del Nord", sa: "America del Sud", oc: "Oceania", an: "Antartide" };
const ORDINE_CONT = ["eu", "as", "af", "na", "sa", "oc", "an"];

const ICO = {
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  vai: `<svg class="vai" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  piu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  cerca: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  foto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  condividi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"/></svg>`,
  salva: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>`,
  aggHome: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
  ingr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>`
};

/* ---------- Archivio sul telefono ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open("viatrix", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("stato");
        d.createObjectStore("foto", { keyPath: "id" }).createIndex("k", "k");
      };
      r.onsuccess = () => {
        const d = this.db = r.result; this.aperto = true;
        d.onclose = () => { if (this.db === d) this.db = null; };
        d.onversionchange = () => { d.close(); if (this.db === d) this.db = null; };
        ok();
      };
      r.onerror = () => ko(r.error);
    });
  },
  aperto: false,
  // connessione persa: si riapre (solo se all'avvio si era aperto davvero: in una finestra privata no)
  riapri() { if (!this.aperto) return Promise.reject(new Error("niente archivio")); this.db = null; return this.open(); },
  persa: e => !!e && /InvalidState|UnknownError|closing|connection/i.test((e.name || "") + " " + (e.message || "")),
  // true se all'avvio i dati salvati non si sono letti: allora non si scrive più niente (si cancellerebbero)
  bloccato: false,
  tx(store, mode, fn, riprova = true) {
    const di_nuovo = () => this.riapri().then(() => this.tx(store, mode, fn, false));
    return new Promise((ok, ko) => {
      if (mode === "readwrite" && this.bloccato) { ko(new Error("bloccato")); return; }
      if (!this.db) { if (riprova && this.aperto) di_nuovo().then(ok, ko); else ko(new Error("niente archivio")); return; }
      let t;
      try { t = this.db.transaction(store, mode); }
      catch (e) { if (riprova && this.persa(e)) di_nuovo().then(ok, ko); else ko(e); return; }
      const req = fn(t.objectStore(store));
      t.oncomplete = () => ok(req && req.result);
      const male = () => { if (riprova && this.persa(t.error)) di_nuovo().then(ok, ko); else ko(t.error); };
      t.onerror = () => {};   // si decide in onabort, che arriva sempre dopo (anche per lo spazio pieno: resta un errore)
      t.onabort = male;
    });
  },
  get: (s, k) => DB.tx(s, "readonly", st => st.get(k)),
  all: s => DB.tx(s, "readonly", st => st.getAll()),
  put: (s, v, k) => DB.tx(s, "readwrite", st => k === undefined ? st.put(v) : st.put(v, k)),
  del: (s, k) => DB.tx(s, "readwrite", st => st.delete(k)),
  // ripristino: tutto in un colpo, o non cambia niente
  sostituisci(dati, foto, riprova = true) {
    return new Promise((ok, ko) => {
      if (this.bloccato) { ko(new Error("bloccato")); return; }
      if (!this.db) { if (riprova && this.aperto) this.riapri().then(() => this.sostituisci(dati, foto, false)).then(ok, ko); else ko(new Error("niente archivio")); return; }
      let t;
      try { t = this.db.transaction(["stato", "foto"], "readwrite"); }
      catch (e) { if (riprova && this.persa(e)) this.riapri().then(() => this.sostituisci(dati, foto, false)).then(ok, ko); else ko(e); return; }
      try { t.objectStore("stato").put(dati, "dati"); const sf = t.objectStore("foto"); sf.clear(); foto.forEach(f => sf.put(f)); }
      catch (e) { t.abort(); ko(e); return; }
      t.oncomplete = () => ok(); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error);
    });
  }
};

/* ---------- I dati ----------
   dati.paesi[codice] = { s: "v"|"l"|"w"|null, dal, al, mezzi: [], nota }
   dati.citta[id]      = { id, c: paese, n: nome, r: regione, ll: [lat, lon] | null, s, dal, al, mezzi, nota, t } */
let dati = { paesi: {}, citta: {} };
let PAESI = [], P = {};            // dal file data/paesi.json
const FOTO = new Map();            // chiave luogo → [{ id, t, mini, blob }]
let tSalva = null;
function salva(subito) {
  clearTimeout(tSalva); tSalva = null;
  if (!DB.db) return;   // finestra privata: l'avviso è già comparso all'avvio
  if (DB.bloccato) { avvisoLettura(); return; }   // i dati veri non si sono letti: mai scriverci sopra
  const fai = () => { tSalva = null; DB.put("stato", dati, "dati").catch(e => toast(e && e.name === "QuotaExceededError" ? "Non riesco a salvare: lo spazio del telefono è pieno" : "Non riesco a salvare: riprova tra poco")); };
  if (subito) fai(); else tSalva = setTimeout(fai, 250);
}
// Quando l'app va in secondo piano o si chiude: si salva subito quello che aspettava (anche la nota appena scritta)
let notaInSospeso = null;
function salvaSubito() { if (notaInSospeso) notaInSospeso(); if (tSalva) salva(true); }
const cittaDi = c => Object.values(dati.citta).filter(x => x.c === c);
function statoPaese(c) {
  let s = dati.paesi[c]?.s || null;
  for (const x of Object.values(dati.citta)) if (x.c === c && x.s && (!s || RANGO[x.s] > RANGO[s])) s = x.s;
  return s;
}
const stati = () => { const m = {}; for (const p of PAESI) { const s = statoPaese(p.c); if (s) m[p.c] = s; } return m; };
const keyPaese = c => "p:" + c, keyCitta = id => "c:" + id;
function pulisciVuoto(c) {
  const d = dati.paesi[c];
  if (d && !d.s && !d.dal && !d.al && !(d.mezzi || []).length && !d.nota && !(FOTO.get(keyPaese(c)) || []).length) delete dati.paesi[c];
}
function conti() {
  const st = stati();
  const vis = PAESI.filter(p => st[p.c] === "v" || st[p.c] === "l");
  const onu = vis.filter(p => p.o);
  const tot = PAESI.filter(p => p.o).length || 195;
  const areaTot = PAESI.filter(p => p.k !== "an").reduce((a, p) => a + p.a, 0);
  return { st, vis, onu, tot, pct: onu.length / tot, area: vis.filter(p => p.k !== "an").reduce((a, p) => a + p.a, 0) / areaTot,
    w: PAESI.filter(p => st[p.c] === "w").length, l: PAESI.filter(p => st[p.c] === "l").length };
}
// sotto il 10% con un decimale (2,6%), poi intero
const pctTesto = f => { const p = f * 100; return p > 0 && p < 10 ? p.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%" : Math.round(p) + "%"; };

/* ---------- Date ---------- */
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const pd = s => { const [y, m, d] = String(s).split("-").map(Number); return { y, m: m - 1, d }; };
const fmtData = s => { if (!s) return ""; const x = pd(s); return `${x.d} ${MESI[x.m]} ${x.y}`; };
function fmtPeriodo(dal, al) {
  if (!dal && !al) return "";
  if (!al || al === dal) return fmtData(dal || al);
  if (!dal) return "fino al " + fmtData(al);
  const a = pd(dal), b = pd(al);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MESI[b.m]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MESI[a.m]} – ${b.d} ${MESI[b.m]} ${b.y}`;
  return `${fmtData(dal)} – ${fmtData(al)}`;
}
const giornoN = s => Math.round(Date.UTC(...(x => [x.y, x.m, x.d])(pd(s))) / 864e5);
const giorni = (dal, al) => dal && al && al >= dal ? giornoN(al) - giornoN(dal) + 1 : dal ? 1 : 0;
const nGiorni = n => n === 1 ? "1 giorno" : `${n} giorni`;
// Un viaggio ha sempre il primo giorno: "al giorno" da solo diventa un viaggio di un giorno (chi ci vive può avere solo "fino al").
function sistemaData(d) { if (d && d.s !== "l" && d.al && !d.dal) d.dal = d.al; }
function sistemaDate(x) { Object.values(x.paesi || {}).forEach(sistemaData); Object.values(x.citta || {}).forEach(sistemaData); }

/* ---------- Colori dal foglio di stile ---------- */
let COL = {};
function leggiColori() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  COL = { shelf: g("--shelf"), land: g("--land"), line: g("--land-line"), v: g("--v"), l: g("--l"), w: g("--w"), ink: g("--ink"), ocean: g("--ocean"), ocean2: g("--ocean-2"), surface: g("--surface") };
}
const colore = s => s ? COL[s] : COL.land;

/* =====================================================================
   MAPPA DEL MONDO
   Disegnata su canvas: i paesi sono preparati una volta sola (Path2D),
   poi a ogni movimento si ridisegna solo con un'altra scala: fluida anche col pinch.
   ===================================================================== */
const M = { feats: [], byC: {}, W: 0, H: 0, dpr: 1, t: d3.zoomIdentity, raf: 0, anim: new Map(), onde: [], flash: null, main: {}, tw: {}, scelto: null, intro: null };
let MONDO = null;
const NOMI_CORTI = { US: "Stati Uniti", GB: "Regno Unito", CD: "RD Congo", CF: "Centrafrica", DO: "Rep. Dominicana", BA: "Bosnia", AE: "Emirati Arabi", SA: "Arabia Saudita", PG: "Papua N. Guinea", KP: "Corea del Nord", KR: "Corea del Sud", MK: "Macedonia del Nord", TT: "Trinidad e Tobago", GQ: "Guinea Equat." };
const nomeCorto = c => NOMI_CORTI[c] || P[c]?.n || c;
/* Nella mappa di partenza alcuni territori d'oltremare sono dentro la forma del loro paese (la Guyana francese e la Riunione
   dentro la Francia, le Svalbard dentro la Norvegia): toccandoli si apriva il paese sbagliato. Qui diventano forme a sé:
   ogni isola va al territorio più vicino della lista (entro 500 km dal suo punto in paesi.json). */
const OLTREMARE = { FR: ["GF", "GP", "MQ", "RE", "YT"], NO: ["SJ"] };
function separaOltremare(fs) {
  const nuove = [];
  for (const f of fs) {
    const ter = (OLTREMARE[f.properties.c] || []).filter(c => P[c]); if (!ter.length) continue;
    const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates, resta = [], per = {};
    for (const p of polys) {
      const ce = d3.geoCentroid({ type: "Polygon", coordinates: p });
      const vic = ter.map(c => [c, d3.geoDistance(ce, [P[c].ll[1], P[c].ll[0]])]).sort((a, b) => a[1] - b[1])[0];
      if (vic[1] < .08) (per[vic[0]] = per[vic[0]] || []).push(p); else resta.push(p);
    }
    if (!resta.length || !Object.keys(per).length) continue;
    f.geometry = { type: "MultiPolygon", coordinates: resta };
    for (const [c, ps] of Object.entries(per)) nuove.push({ type: "Feature", properties: { c }, geometry: { type: "MultiPolygon", coordinates: ps } });
  }
  return fs.concat(nuove);
}
function preparaMappa() {
  const box = $("#mappa");
  box.innerHTML = `<canvas id="cv"></canvas>`;
  const cv = $("#cv");
  M.cv = cv; M.ctx = cv.getContext("2d");
  // zoom e trascinamento (anche col pinch); tocco = apri il paese
  M.zoom = d3.zoom().scaleExtent([1, 60]).clickDistance(6)
    .on("zoom", e => { M.t = e.transform; richiedi(); });
  misura();
  M.sel = d3.select(cv).call(M.zoom);
  M.sel.on("dblclick.zoom", null);
  cv.addEventListener("click", tocca);
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => {
    // il punto del mondo al centro dello schermo e la grandezza restano gli stessi dopo la rotazione
    const t = M.t, centro = M.proj.invert(t.invert([M.W / 2, M.H / 2])), scala = t.k * M.proj.scale();
    misura();
    const k = Math.max(1, Math.min(60, scala / M.proj.scale())), xy = M.proj(centro);
    M.sel.call(M.zoom.transform, centro && xy ? d3.zoomIdentity.translate(M.W / 2, M.H / 2).scale(k).translate(-xy[0], -xy[1]) : t);
    // con il foglio a metà aperto si rifà il volo: il paese torna nella parte libera sopra il foglio
    const top = pila[pila.length - 1]; if (top && top.meta && tabAttiva === "mappa") modoFoglio(top);
  }, 150); });
}
function misura() {
  const box = $("#mappa"), W = box.clientWidth, H = box.clientHeight, dpr = Math.min(3, devicePixelRatio || 1);
  Object.assign(M, { W, H, dpr });
  M.cv.width = Math.round(W * dpr); M.cv.height = Math.round(H * dpr);
  M.cv.style.width = W + "px"; M.cv.style.height = H + "px";
  const fc = { type: "FeatureCollection", features: MONDO };
  // in verticale il mondo occupa la larghezza; spazio in alto per la scheda col titolo
  const top = Math.min(150, H * .2), bot = Math.min(110, H * .14);
  const proj = d3.geoNaturalEarth1().fitExtent([[10, top], [W - 10, H - bot]], fc);
  const gp = d3.geoPath(proj);
  M.proj = proj; M.gp = gp; M.main = {};
  M.feats = MONDO.map(f => {
    const b = gp.bounds(f);
    return { c: f.properties.c, f, p: new Path2D(gp(f) || ""), b, a: (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]), cen: proj(d3.geoCentroid(f)) };
  });
  M.byC = {};
  for (const x of M.feats) (M.byC[x.c] = M.byC[x.c] || []).push(x);
  M.sfera = new Path2D(gp({ type: "Sphere" }));
  M.grat = new Path2D(gp(d3.geoGraticule10()));
  M.zoom && M.zoom.extent([[0, 0], [W, H]]).translateExtent(limiti(false));
  richiedi();
}
/* La parte principale di un paese (senza territori lontani): per inquadrarlo e per il nome */
const PARTI = {};
function parteMain(c) {
  if (c in PARTI) return PARTI[c];
  const fs = (M.byC[c] || []).map(x => x.f);
  if (!fs.length) return (PARTI[c] = null);
  const polys = [];
  fs.forEach(x => { const g = x.geometry; (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach(co => polys.push({ type: "Polygon", coordinates: co })); });
  polys.forEach(q => { q.ar = d3.geoArea(q); q.ce = d3.geoCentroid(q); });
  const big = polys.reduce((a, q) => q.ar > a.ar ? q : a);
  return (PARTI[c] = { type: "GeometryCollection", geometries: polys.filter(q => q === big || (q.ar > big.ar * .004 && d3.geoDistance(q.ce, big.ce) < .22)), big });
}
function main(c) {
  if (M.main[c]) return M.main[c];
  const g = parteMain(c);
  let r = null;
  if (g) { const lbl = M.proj(d3.geoCentroid(g.big)); r = { b: riquadroVicino(g, lbl[0]), lbl }; }
  else if (P[c]) { const xy = M.proj([P[c].ll[1], P[c].ll[0]]); r = { b: [[xy[0] - 1, xy[1] - 1], [xy[0] + 1, xy[1] + 1]], lbl: xy }; }
  return (M.main[c] = r);
}
/* Riquadro di una forma sulla mappa, ma solo dalla parte del suo centro: Nuova Zelanda (isole Chatham), Russia (Ciukotka)
   e Figi passano la linea del cambio di data, e un pezzetto finisce all'altro capo della mappa (il volo inquadrava il mondo intero). */
function riquadroVicino(g, lx) {
  const b = [[Infinity, Infinity], [-Infinity, -Infinity]], soglia = (M.W - 20) / 2;
  const punto = (x, y) => { if (Math.abs(x - lx) > soglia) return; b[0][0] = Math.min(b[0][0], x); b[1][0] = Math.max(b[1][0], x); b[0][1] = Math.min(b[0][1], y); b[1][1] = Math.max(b[1][1], y); };
  const nulla = () => {};
  d3.geoStream(g, M.proj.stream({ point: punto, lineStart: nulla, lineEnd: nulla, polygonStart: nulla, polygonEnd: nulla, sphere: nulla }));
  return isFinite(b[0][0]) ? b : M.gp.bounds(g);
}
const richiedi = () => { if (!M.raf) M.raf = requestAnimationFrame(disegna); };
// paesi piccoli o senza forma (Malta, Vaticano, isole): un pallino se sono segnati
const PICCOLO = 6;   // pixel a zoom 1
// tutti = anche quelli non segnati (si vedono e si toccano quando la mappa è ingrandita: Malta, San Marino, Vaticano…)
const PICCOLI_DA = 3.5;   // ingrandimento da cui compaiono i paesi piccoli non segnati
function puntiPiccoli(st, tutti) {
  const out = [];
  for (const p of PAESI) {
    const s = st[p.c] || null; if (!s && !tutti) continue;
    const m = main(p.c); if (!m) continue;
    if (Math.max(m.b[1][0] - m.b[0][0], m.b[1][1] - m.b[0][1]) * M.t.k >= PICCOLO) continue;
    if (m.lbl && isFinite(m.lbl[0])) out.push({ c: p.c, s, xy: m.lbl });
  }
  return out;
}
const chiaro = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
function disegna(now) {
  M.raf = 0;
  const { ctx, dpr, t, W, H } = M;
  now = now || performance.now();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // entrata: i paesi compaiono a onda dal centro, poi si colorano quelli segnati
  let ip = 1;
  if (M.intro) { ip = (now - M.intro) / 1500; if (ip >= 1) { M.intro = null; ip = 1; } }
  ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
  // globo e reticolo leggero
  ctx.globalAlpha = .55 * chiaro(ip, 0, .3); ctx.fillStyle = COL.ocean; ctx.fill(M.sfera);
  ctx.lineWidth = .8 / t.k; ctx.strokeStyle = COL.ink; ctx.globalAlpha = .06 * chiaro(ip, 0, .3); ctx.stroke(M.grat); ctx.globalAlpha = 1;
  // paesi (solo quelli che si vedono)
  const x0 = -t.x / t.k, y0 = -t.y / t.k, x1 = (W - t.x) / t.k, y1 = (H - t.y) / t.k;
  const st = M.st || {};
  let vivo = !!M.intro;
  const vis = M.feats.filter(f => !(f.b[1][0] < x0 || f.b[0][0] > x1 || f.b[1][1] < y0 || f.b[0][1] > y1));
  const cx = W / 2, cy = H / 2, dmax = Math.hypot(cx, cy);
  const ritardo = f => Math.hypot(f.cen[0] * t.k + t.x - cx, f.cen[1] * t.k + t.y - cy) / dmax;
  // piattaforma chiara intorno alle coste (come le carte nautiche)
  piattaforma(vis, chiaro(ip, .1, .5));
  ctx.lineJoin = "round";
  ctx.lineWidth = .7 / t.k; ctx.strokeStyle = COL.line;
  for (const f of vis) {
    let col = colore(st[f.c]);
    if (M.intro) {
      const d = ritardo(f);
      ctx.globalAlpha = chiaro(ip, d * .35, d * .35 + .25);
      if (st[f.c]) col = d3.interpolateRgb(COL.land, col)(d3.easeCubicOut(chiaro(ip, .45 + d * .3, .7 + d * .3)));
    }
    const a = M.anim.get(f.c);
    if (a) { const k = Math.min(1, Math.max(0, (now - a.t0) / 700)); col = d3.interpolateRgb(a.da, col)(d3.easeCubicOut(k)); if (k < 1) vivo = true; else M.anim.delete(f.c); }
    ctx.fillStyle = col; ctx.fill(f.p); ctx.stroke(f.p);
  }
  ctx.globalAlpha = 1;
  // paese scelto (foglio aperto): contorno marcato
  if (M.scelto && M.byC[M.scelto]) {
    ctx.lineWidth = 2.2 / t.k; ctx.strokeStyle = COL.ink; ctx.globalAlpha = .75;
    M.byC[M.scelto].forEach(f => ctx.stroke(f.p)); ctx.globalAlpha = 1;
  }
  // paese scelto piccolissimo (Malta, Vaticano, isole): un cerchio intorno, altrimenti non si vede quale è
  const sm = M.scelto && main(M.scelto);
  if (sm && Math.max(sm.b[1][0] - sm.b[0][0], sm.b[1][1] - sm.b[0][1]) * t.k < 16) {
    ctx.beginPath(); ctx.arc(sm.lbl[0], sm.lbl[1], 13 / t.k, 0, 7);
    ctx.lineWidth = 2.2 / t.k; ctx.strokeStyle = COL.ink; ctx.globalAlpha = .75; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // tocco: il paese si illumina un attimo
  if (M.flash) {
    const k = (now - M.flash.t0) / 450;
    if (k < 1) { ctx.globalAlpha = .35 * (1 - k); ctx.fillStyle = "#fff"; (M.byC[M.flash.c] || []).forEach(f => ctx.fill(f.p)); ctx.globalAlpha = 1; vivo = true; } else M.flash = null;
  }
  // pallini dei paesi piccoli (grandezza fissa sullo schermo)
  // (quando la mappa è ingrandita anche quelli non segnati, più piccoli e del colore della terra: così si possono toccare)
  if (!M.intro || ip > .6) for (const d of puntiPiccoli(st, t.k >= PICCOLI_DA)) {
    ctx.beginPath(); ctx.arc(d.xy[0], d.xy[1], (d.s ? 4.5 : 3.4) / t.k, 0, 7);
    if (d.s) { ctx.fillStyle = COL[d.s]; ctx.fill(); ctx.lineWidth = 1.5 / t.k; ctx.strokeStyle = COL.line; ctx.stroke(); }
    else { ctx.fillStyle = COL.land; ctx.fill(); ctx.lineWidth = 1.3 / t.k; ctx.strokeStyle = COL.ink; ctx.globalAlpha = .5; ctx.stroke(); ctx.globalAlpha = 1; }
  }
  // onde quando si segna un paese nuovo
  M.onde = M.onde.filter(o => {
    const k = (now - o.t0) / 1300; if (k >= 1) return false;
    vivo = true; if (k < 0) return true;
    for (const r of [0, .18]) {
      const kk = k - r; if (kk <= 0) continue;
      const e = d3.easeCubicOut(Math.min(1, kk / (1 - r)));
      ctx.beginPath(); ctx.arc(o.xy[0], o.xy[1], (6 + 80 * e) / t.k, 0, 7);
      ctx.lineWidth = (3 - 2 * e) / t.k; ctx.strokeStyle = COL[o.s]; ctx.globalAlpha = (1 - e) * .9; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return true;
  });
  // i posti da non perdere del paese aperto: puntini bianchi (verdi se già visti)
  if (M.stelle && M.scelto) for (const st of M.stelle) {
    const [px, py] = M.proj([st.ll[1], st.ll[0]]);
    const v = visto(st.q);
    ctx.beginPath(); ctx.arc(px, py, 4.2 / t.k, 0, 7); ctx.fillStyle = v ? COL.l : "#fff"; ctx.fill();
    ctx.lineWidth = (v ? 2 : 1.6) / t.k; ctx.strokeStyle = v ? "#fff" : COL.w; ctx.stroke();
  }
  // la città aperta: un segnaposto sulla mappa grande
  if (M.pin) {
    const [px, py] = M.proj([M.pin.ll[1], M.pin.ll[0]]);
    ctx.beginPath(); ctx.arc(px, py, 8 / t.k, 0, 7); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 5 / t.k, 0, 7); ctx.fillStyle = COL[M.pin.s]; ctx.fill();
    ctx.lineWidth = 1 / t.k; ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(px, py, 8 / t.k, 0, 7); ctx.stroke();
  }
  // nomi dei paesi quando si ingrandisce
  if (t.k >= 2.2 && (!M.intro || ip > .75)) {
    const entrataNomi = M.intro ? chiaro(ip, .75, 1) : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "600 11.5px -apple-system, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const fatti = new Set();
    for (const f of vis) {
      if (fatti.has(f.c)) continue; fatti.add(f.c);
      const m = main(f.c); if (!m) continue;
      const w = (m.b[1][0] - m.b[0][0]) * t.k, h = (m.b[1][1] - m.b[0][1]) * t.k;
      const nome = nomeCorto(f.c);
      const tw = M.tw[f.c] || (M.tw[f.c] = ctx.measureText(nome).width);
      if (w < tw + 10 || h < 16) continue;
      const x = m.lbl[0] * t.k + t.x, y = m.lbl[1] * t.k + t.y;
      if (x < -50 || x > W + 50 || y < 0 || y > H) continue;
      const s = st[f.c];
      ctx.globalAlpha = entrataNomi * Math.min(1, (t.k - 2.2) * 2) * (s ? 1 : .55);
      // sul giallo ("vorrei andarci") testo scuro; su corallo e verde testo bianco con un alone deciso
      ctx.fillStyle = s === "w" ? "#2E2200" : s ? "#fff" : COL.ink;
      if (s) { ctx.lineWidth = 3.5; ctx.strokeStyle = s === "w" ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.45)"; ctx.strokeText(nome, x, y); }
      ctx.fillText(nome, x, y);
    }
    ctx.globalAlpha = 1;
  }
  if (vivo) richiedi();
}
/* La piattaforma delle coste è la parte più pesante del disegno (un contorno largo intorno a ogni paese).
   Se la mappa è ferma (entrata, paesi che si colorano, onde) si disegna una volta in un'immagine a parte
   e poi si copia: stesso aspetto, molto meno lavoro. Mentre si trascina o si ingrandisce si disegna come prima. */
function piattaforma(vis, alfa) {
  const { ctx, t, dpr, W, H } = M;
  if (alfa <= 0) return;
  const chiave = [t.k, t.x, t.y, W, H, dpr, COL.shelf].join("|");
  if (M.pChiave !== chiave && M.pUltima === chiave) {
    // ferma da due disegni: si prepara l'immagine
    const c = M.pCv || (M.pCv = document.createElement("canvas"));
    if (c.width !== M.cv.width || c.height !== M.cv.height) { c.width = M.cv.width; c.height = M.cv.height; }
    const x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
    x.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    x.lineJoin = "round"; x.lineWidth = 7 / t.k; x.strokeStyle = COL.shelf;
    for (const f of vis) x.stroke(f.p);
    M.pChiave = chiave;
  }
  M.pUltima = chiave;
  ctx.globalAlpha = alfa;
  if (M.pChiave === chiave) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(M.pCv, 0, 0); ctx.restore(); }
  else { ctx.lineJoin = "round"; ctx.lineWidth = 7 / t.k; ctx.strokeStyle = COL.shelf; for (const f of vis) ctx.stroke(f.p); }
  ctx.globalAlpha = 1;
}
function cambiaColore(c, primaS) {
  M.st = stati();
  if ((M.st[c] || null) !== (primaS || null) && !pocoMoto()) M.anim.set(c, { da: colore(primaS), t0: performance.now() });
  richiedi();
}
function onda(c, s) {
  if (pocoMoto()) return;
  const m = main(c);
  if (m) { M.onde.push({ xy: [(m.b[0][0] + m.b[1][0]) / 2, (m.b[0][1] + m.b[1][1]) / 2], s, t0: performance.now() + 150 }); richiedi(); }
}
function tocca(e) {
  if (e.defaultPrevented || inApertura) return;
  /* Foglio a metà aperto (dalla mappa): la mappa sopra resta viva. Un altro paese → si passa a quello;
     lo stesso paese o il mare → si chiude. Ma non subito dopo l'apertura (secondo tocco di un doppio tocco)
     e non se si sta scrivendo o si è appena chiuso il calendario (su iPhone quel tocco arriva fin qui). */
  const aperto = pila.length > 0;
  if (aperto) {
    if (!document.documentElement.classList.contains("meta") || Date.now() - apertoAlle < 450) return;
    const a = document.activeElement;
    if (a && a.matches("input,textarea,select")) { a.blur(); return; }
    if (Date.now() - ultimoCampo < 700) return;
  }
  const r = M.cv.getBoundingClientRect(), t = M.t;
  const px = (e.clientX - r.left - t.x) / t.k, py = (e.clientY - r.top - t.y) / t.k;
  // prima i pallini dei paesi piccoli segnati, poi le forme (dalla più piccola: le isole dentro i laghi…),
  // poi i pallini dei paesi piccoli non segnati (vincono sulla forma intorno solo se il tocco è proprio sopra)
  let hit = null, best = 1e9;
  const piccoli = puntiPiccoli(M.st || {}, t.k >= PICCOLI_DA).map(d => ({ ...d, dd: Math.hypot((d.xy[0] - px) * t.k, (d.xy[1] - py) * t.k) }));
  for (const d of piccoli) if (d.s && d.dd < 18 && d.dd < best) { best = d.dd; hit = d.c; }
  if (!hit) {
    const ctx = M.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cand = M.feats.filter(f => px >= f.b[0][0] && px <= f.b[1][0] && py >= f.b[0][1] && py <= f.b[1][1]).sort((a, b) => a.a - b.a);
    for (const f of cand) if (ctx.isPointInPath(f.p, px, py)) { hit = f.c; break; }
    ctx.restore();
    const vicino = piccoli.filter(d => !d.s && d.c !== "AQ" && d.dd < (hit ? 9 : 16)).sort((a, b) => a.dd - b.dd)[0];
    if (vicino) hit = vicino.c;
  }
  if (hit && !P[hit]) hit = null;
  if (aperto) {
    const radice = pila[0];
    if (!hit || (radice.tipo === "paese" && radice.c === hit)) { chiudiTutto(); return; }
    tocco();
    M.flash = { c: hit, t0: performance.now() }; richiedi();
    cambiaPaese(hit);
    return;
  }
  if (!hit) return;
  tocco();
  M.flash = { c: hit, t0: performance.now() }; richiedi();
  inApertura = true;
  setTimeout(() => { if (inApertura) apriLivello({ tipo: "paese", c: hit, meta: true }); }, 90);
}
// dal foglio a metà a un altro paese: il foglio resta aperto e cambia contenuto (se c'erano città o posti aperti, si torna prima al primo livello)
let dopoRitorno = null;
function cambiaPaese(c) {
  const l = { tipo: "paese", c, meta: true };
  if (pila.length <= 1) { sostituisciLivello(l); apertoAlle = Date.now(); return; }
  dopoRitorno = l; history.go(-(pila.length - 1));
}
// limiti del trascinamento: più larghi quando si vola su un paese (Cile, Sudafrica… finirebbero sotto il foglio)
const limiti = largo => largo ? [[-M.W, -M.H], [M.W * 2, M.H * 2]] : [[-M.W * .3, -M.H * .1], [M.W * 1.3, M.H * 1.1]];
function rientra() {
  if (!M.sel) return;
  M.zoom.translateExtent(limiti(false));
  const t = M.zoom.constrain()(M.t, [[0, 0], [M.W, M.H]], limiti(false));
  if (t.x !== M.t.x || t.y !== M.t.y) M.sel.interrupt().transition().duration(pocoMoto() ? 0 : 500).ease(d3.easeCubicOut).call(M.zoom.transform, t);
}
// la parte di mappa che resta visibile sopra il foglio a metà
const META = .4;
function areaLibera(meta) {
  const sat = parseFloat(getComputedStyle($(".m-top")).paddingTop) - 10 || 0;
  const top = sat + 18, bottom = meta ? M.H - (M.H - sat - 22) * (1 - META) - 14 : M.H - Math.min(110, M.H * .14);
  return { x0: 24, x1: M.W - 24, y0: top, y1: Math.max(top + 60, bottom) };
}
function volaA(b, meta, kMax) {
  if (!M.sel) return;
  const A = areaLibera(meta);
  const bw = Math.max(1, b[1][0] - b[0][0]), bh = Math.max(1, b[1][1] - b[0][1]);
  const k = Math.max(1, Math.min(kMax || 30, Math.min((A.x1 - A.x0) / bw, (A.y1 - A.y0) / bh) * .82));
  const T = d3.zoomIdentity.translate((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2).scale(k).translate(-(b[0][0] + b[1][0]) / 2, -(b[0][1] + b[1][1]) / 2);
  if (meta) M.zoom.translateExtent(limiti(true));
  M.sel.interrupt().transition().duration(pocoMoto() ? 0 : 900).ease(d3.easeCubicInOut).call(M.zoom.transform, T);
}
function volaAPaese(c, meta) { const m = main(c); if (m) volaA(m.b, meta); }
function volaACitta(x, meta) {
  const m = main(x.c); if (!x.ll || !m) return volaAPaese(x.c, meta);
  const xy = M.proj([x.ll[1], x.ll[0]]);
  const d = Math.max(m.b[1][0] - m.b[0][0], m.b[1][1] - m.b[0][1]) / 5;
  volaA([[xy[0] - d, xy[1] - d], [xy[0] + d, xy[1] + d]], meta, 45);
}
function vediTutto() {
  tocco();
  M.sel.interrupt().transition().duration(pocoMoto() ? 0 : 750).ease(d3.easeCubicInOut).call(M.zoom.transform, d3.zoomIdentity);
}
// all'apertura: i paesi segnati in vista, oppure l'Europa
function vistaIniziale() {
  const st = M.st || {};
  let cs = Object.keys(st).filter(c => st[c] === "v" || st[c] === "l");
  if (!cs.length) cs = ["IT"];
  // all'avvio basta la forma più grande di ogni paese (veloce anche con tanti paesi)
  let [x0, y0, x1, y1] = [1e9, 1e9, -1e9, -1e9];
  cs.forEach(c => { const fs = M.byC[c]; if (!fs) return; const f = fs.reduce((a, x) => x.a > a.a ? x : a); x0 = Math.min(x0, f.b[0][0]); y0 = Math.min(y0, f.b[0][1]); x1 = Math.max(x1, f.b[1][0]); y1 = Math.max(y1, f.b[1][1]); });
  if (x0 > x1) return;
  const { W, H } = M, top = Math.min(150, H * .2), bot = Math.min(110, H * .14);
  const pad = 40, aw = W - 2 * pad, ah = H - top - bot - 2 * pad;
  let k = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0));
  k = Math.max(1, Math.min(Object.keys(st).length ? 5 : 3.2, k * .9));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  M.sel.call(M.zoom.transform, d3.zoomIdentity.translate(W / 2, top + pad + ah / 2).scale(k).translate(-cx, -cy));
}

/* Riepilogo sopra la mappa */
let pctPrima = -1;
function aggiornaTesta() {
  const k = conti();
  const n = $("#m-num"), pct = k.pct;
  if (pctPrima !== pct) {
    contaSu(n, pctPrima < 0 ? 0 : pctPrima * 100, pct * 100, v => pctTesto(v / 100));
    $("#m-ring").style.strokeDashoffset = 100 - Math.max(pct > 0 ? 2 : 0, pct * 100);
    if (pctPrima >= 0 && !pocoMoto() && $("#m-pct").animate) $("#m-pct").animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 600, easing: "cubic-bezier(.34,1.56,.64,1)", delay: 250 });
    pctPrima = pct;
  }
  const lv = livello(k.onu.length);
  $("#m-liv").textContent = `${lv.e} ${lv.t}`;
  $("#m-sub").textContent = `${k.onu.length} su ${k.tot} paesi`;
  $("#legenda").innerHTML = ["v", "l", "w"].map((s, i) => {
    const n = s === "v" ? k.vis.length - k.l : s === "l" ? k.l : k.w;
    return n ? `<span class="leg" style="--c:var(${STATI[s].cv});--i:${i}"><i></i>${STATI[s].t} <b>${n}</b></span>` : "";
  }).join("");
  $("#m-hint").classList.toggle("via", Object.keys(k.st).length > 0);
}
function contaSu(el, da, a, fmt) {
  if (pocoMoto() || da === a) { el.textContent = fmt(a); return; }
  const t0 = performance.now(), d = 900;
  const passo = now => { const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(da + (a - da) * e); if (k < 1) requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
}

/* =====================================================================
   SCHEDE: Mappa · Paesi · Numeri
   ===================================================================== */
const SCHEDE = ["mappa", "paesi", "numeri"];
let tabAttiva = "mappa";
function vai(tab) {
  const v = $("#v-" + tab);
  if (tab === tabAttiva) { if (tab === "mappa") vediTutto(); else v.scrollTo({ top: 0, behavior: pocoMoto() ? "auto" : "smooth" }); return; }
  const da = $("#v-" + tabAttiva);
  tabAttiva = tab;
  document.documentElement.dataset.tab = tab;
  if (tab === "paesi") disegnaPaesi(true);
  if (tab === "numeri") disegnaNumeri(true);
  $$(".tab").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  $("#tabbar").style.setProperty("--k", SCHEDE.indexOf(tab));
  da.classList.remove("on"); v.classList.add("on");
  barraTitolo();
  if (!pocoMoto() && v.animate) {
    // solo dissolvenza: niente scivolate di lato
    v.animate([{ opacity: 0, transform: "scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: MOLLA });
    da.animate([{ opacity: 1, visibility: "visible" }, { opacity: 0, visibility: "visible" }], { duration: 180, easing: "ease-out" });
  }
  const ic = $(`.tab[data-tab="${tab}"] svg`);
  if (ic && ic.animate && !pocoMoto()) ic.animate([{ transform: "scale(1)" }, { transform: "scale(.8) translateY(2px)" }, { transform: "scale(1.12) translateY(-2px)" }, { transform: "scale(1)" }], { duration: 480, easing: "ease-out" });
  tocco();
}
let navOn = null;
function barraTitolo() {
  const v = $("#v-" + tabAttiva);
  const on = tabAttiva !== "mappa" && v.scrollTop > 56;
  if (on !== navOn) { navOn = on; $("#navbar").classList.toggle("on", on); }
  $("#nav-t").textContent = tabAttiva === "paesi" ? "Paesi" : "Numeri";
}

/* ---------- Paesi ---------- */
let filtro = "tutti", cerca = "", paesiFatti = false;
function disegnaPaesi(entrata) {
  const v = $("#v-paesi");
  if (!paesiFatti) {
    paesiFatti = true;
    v.innerHTML = `<header class="top"><div><div class="kicker">${PAESI.filter(p => p.o).length} paesi nel mondo</div><h1>Paesi</h1></div></header>
      <div class="search">${ICO.cerca}<input id="q" type="search" placeholder="Cerca un paese" autocomplete="off" autocorrect="off" enterkeyhint="search" aria-label="Cerca un paese"></div>
      <div class="filtri" id="filtri" role="group" aria-label="Mostra"></div>
      <div id="elenco"></div>`;
    let tq; $("#q").addEventListener("input", e => { clearTimeout(tq); tq = setTimeout(() => { cerca = norm(e.target.value); elencoPaesi(false); }, 90); });
    $("#q").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
    $("#filtri").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; tocco(); filtro = b.dataset.f; elencoPaesi(false); });
  }
  elencoPaesi(entrata);
}
function elencoPaesi(entrata) {
  const st = stati();
  const n = s => Object.values(st).filter(x => x === s).length;
  $("#filtri").innerHTML = [["tutti", "Tutti", ""], ["v", "Visitati", n("v")], ["l", "Ci vivo", n("l")], ["w", "Vorrei andarci", n("w")]]
    .filter(([k, , c]) => k === "tutti" || c || filtro === k)
    .map(([k, t, c]) => `<button class="chip-f" data-f="${k}" aria-pressed="${filtro === k}" ${k !== "tutti" ? `style="--c:var(${STATI[k].cv})"` : ""}>${k !== "tutti" ? "<i></i>" : ""}${t}${c ? ` · ${c}` : ""}</button>`).join("");
  const cc = Object.values(dati.citta).reduce((m, x) => (m[x.c] = (m[x.c] || 0) + 1, m), {});
  let i = 0, html = "";
  for (const k of ORDINE_CONT) {
    const tutti = PAESI.filter(p => p.k === k);
    const lista = tutti.filter(p => (filtro === "tutti" || st[p.c] === filtro) && (!cerca || norm(p.n).includes(cerca) || norm(p.cap).includes(cerca) || p.c.toLowerCase() === cerca));
    if (!lista.length) continue;
    const onu = tutti.filter(p => p.o), fatti = onu.filter(p => st[p.c] === "v" || st[p.c] === "l").length;
    html += `<section class="cont${entrata ? " entra" : ""}" style="--i:${Math.min(i++, 5)}"><div class="cont-h"><h2><span class="ce">${EMOJI_CONT[k]}</span>${CONT[k]}</h2>${onu.length ? `<small>${fatti} di ${onu.length} · ${pctTesto(fatti / onu.length)}</small>` : ""}</div>
      ${onu.length ? `<div class="barra"><i style="--f:${entrata ? 0 : fatti / onu.length}" data-f="${fatti / onu.length}"></i></div>` : ""}
      <div class="lista">${lista.map(p => rigaPaese(p, st[p.c], cc[p.c])).join("")}</div></section>`;
  }
  $("#elenco").innerHTML = html || `<div class="vuoto"><b>Nessun paese</b>${cerca ? "Prova a scrivere il nome in un altro modo." : "Qui compariranno i paesi che segni."}</div>`;
  if (entrata) requestAnimationFrame(() => requestAnimationFrame(() => $$("#elenco .barra i").forEach(b => b.style.setProperty("--f", b.dataset.f))));
}
function rigaPaese(p, s, nc) {
  const d = dati.paesi[p.c] || {};
  const sub = [nc ? (nc === 1 ? "1 città" : `${nc} città`) : "", d.s === "v" || d.s === "l" ? fmtPeriodo(d.dal, d.al) : ""].filter(Boolean).join(" · ");
  return `<button class="riga" data-paese="${p.c}"><span class="flag">${bandiera(p.c)}</span><span class="nm"><b>${esc(p.n)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
    ${s ? `<span class="pill ${s}" style="--c:var(${STATI[s].cf})">${STATI[s].t}</span>` : ICO.vai}</button>`;
}

/* ---------- Numeri ---------- */
// nomi uguali per tutti (né al maschile né al femminile)
const LIVELLI = [[0, "🧳", "Valigia pronta"], [1, "📍", "Prima tappa"], [3, "📸", "Turista"], [6, "🎒", "Zaino in spalla"], [10, "🧭", "Nuovi orizzonti"],
  [20, "🌍", "Giramondo"], [35, "✈️", "Globetrotter"], [50, "⛵", "Vele spiegate"], [80, "🏆", "Leggenda"], [120, "🌐", "Senza confini"]];
function livello(n) {
  let i = 0; while (i + 1 < LIVELLI.length && n >= LIVELLI[i + 1][0]) i++;
  const [min, e, t] = LIVELLI[i], nx = LIVELLI[i + 1];
  return { i, e, t, min, next: nx ? { n: nx[0], e: nx[1], t: nx[2] } : null };
}
const TROFEI = [
  ["primo", "🚩", "Primo paese", "Il primo paese sulla mappa", S => S.n >= 1],
  ["casa", "🏡", "Casa mia", "Segna dove vivi", S => S.l >= 1],
  ["cinque", "🖐️", "Cinque paesi", "5 paesi visitati", S => S.n >= 5],
  ["dieci", "🔟", "Dieci paesi", "10 paesi visitati", S => S.n >= 10],
  ["venticinque", "🎖️", "Venticinque", "25 paesi visitati", S => S.n >= 25],
  ["cinquanta", "🏅", "Cinquanta", "50 paesi visitati", S => S.n >= 50],
  ["cont2", "🗺️", "Due continenti", "Paesi in 2 continenti", S => S.nCont >= 2],
  ["cont4", "🧭", "Quattro continenti", "Paesi in 4 continenti", S => S.nCont >= 4],
  ["cont6", "🌐", "Tutto il mondo", "Tutti e 6 i continenti", S => S.nCont >= 6],
  ["oceania", "🦘", "Agli antipodi", "Un paese in Oceania", S => S.contSet.has("oc")],
  ["citta", "🏙️", "Prima città", "Aggiungi una città", S => S.nCitta >= 1],
  ["citta10", "🌆", "Dieci città", "10 città visitate", S => S.nCitta >= 10],
  ["citta50", "🏰", "Cinquanta città", "50 città visitate", S => S.nCitta >= 50],
  ["foto", "📷", "Primo ricordo", "Aggiungi una foto", S => S.nFoto >= 1],
  ["foto25", "🖼️", "Album pieno", "25 foto", S => S.nFoto >= 25],
  ["sogni", "✨", "Sogni nel cassetto", "5 paesi in Vorrei andarci", S => S.w >= 5],
  ["settimana", "🗓️", "Una settimana via", "7 giorni in viaggio", S => S.gg >= 7],
  ["mese", "🌙", "Un mese in giro", "30 giorni in viaggio", S => S.gg >= 30],
  ["volo", "✈️", "In volo", "Un viaggio in aereo", S => S.mz.has("aereo")],
  ["binari", "🚆", "Sui binari", "Un viaggio in treno", S => S.mz.has("treno")],
  ["mare", "⛴️", "Per mare", "Un viaggio in nave", S => S.mz.has("nave")],
  ["strada", "🚗", "Su strada", "Auto, camper o moto", S => ["auto", "camper", "moto"].some(m => S.mz.has(m))],
  ["meraviglia", "🌟", "Prima meraviglia", "Segna un posto da non perdere", S => S.mv >= 1],
  ["meraviglie10", "🎟️", "Dieci meraviglie", "10 posti da non perdere visti", S => S.mv >= 10]
];
function statistiche() {
  const k = conti();
  const citta = Object.values(dati.citta).filter(x => x.s === "v" || x.s === "l");
  const nFoto = [...FOTO.values()].reduce((a, l) => a + l.length, 0);
  // giorni in viaggio: unione dei periodi (senza contare due volte paese e città dello stesso viaggio)
  const per = [...Object.values(dati.paesi), ...Object.values(dati.citta)].filter(x => x.s === "v" && x.dal).map(x => [giornoN(x.dal), giornoN(x.al && x.al >= x.dal ? x.al : x.dal)]).sort((a, b) => a[0] - b[0]);
  let gg = 0, fine = -1e9;
  for (const [a, b] of per) { if (a > fine) { gg += b - a + 1; fine = b; } else if (b > fine) { gg += b - fine; fine = b; } }
  const cont = ORDINE_CONT.filter(c => c !== "an").map(c => {
    const onu = PAESI.filter(p => p.k === c && p.o); const f = onu.filter(p => k.st[p.c] === "v" || k.st[p.c] === "l").length;
    return { c, f, n: onu.length };
  });
  const mz = new Map();
  [...Object.values(dati.paesi), ...Object.values(dati.citta)].filter(x => x.s === "v" || x.s === "l").forEach(x => (x.mezzi || []).forEach(m => proprio(MZ, m) && mz.set(m, (mz.get(m) || 0) + 1)));
  return { ...k, n: k.onu.length, nCitta: citta.length, nFoto, gg, per, cont, nCont: cont.filter(x => x.f).length,
    contSet: new Set(cont.filter(x => x.f).map(x => x.c)), mz, mv: Object.keys(dati.meraviglie || {}).length, anno: per.length ? new Date(per[0][0] * 864e5).getUTCFullYear() : null };
}

/* Premi: nuovo livello o traguardo → festa (una alla volta) */
function controllaPremi() {
  const S = statistiche();
  const ora = TROFEI.filter(t => t[4](S)).map(t => t[0]);
  const lv = livello(S.n);
  if (!Array.isArray(dati.visti)) { dati.visti = ora; dati.liv = lv.i; salva(); return; }
  const nuovi = ora.filter(id => !dati.visti.includes(id));
  const su = lv.i > (dati.liv || 0);
  if (!nuovi.length && !su) return;
  dati.visti = [...dati.visti, ...nuovi]; if (su) dati.liv = lv.i;
  salva();
  if (su) festeggia({ e: lv.e, k: "Nuovo livello", t: lv.t, d: lv.next ? `Prossimo: ${lv.next.t} a ${lv.next.n} paesi` : "Il livello più alto!", grande: true });
  nuovi.forEach(id => { const t = TROFEI.find(x => x[0] === id); festeggia({ e: t[1], k: "Traguardo", t: t[2], d: t[3] }); });
}

let globoAttivo = null;
function disegnaNumeri(entrata) {
  const S = statistiche(), v = $("#v-numeri");
  const lv = livello(S.n);
  const mzL = [...S.mz.entries()].sort((a, b) => b[1] - a[1]);
  const mzMax = mzL.length ? mzL[0][1] : 1;
  const ultimi = [...Object.entries(dati.paesi).map(([c, d]) => ({ tipo: "paese", c, d, n: P[c]?.n })), ...Object.values(dati.citta).map(d => ({ tipo: "citta", c: d.c, d, n: d.n }))]
    .filter(x => x.d.dal && x.n && (x.d.s === "v" || x.d.s === "l")).sort((a, b) => (b.d.dal || "").localeCompare(a.d.dal || "")).slice(0, 8);
  const ok = new Set(TROFEI.filter(t => t[4](S)).map(t => t[0]));
  // timbri del passaporto: ogni paese visitato, con l'anno del primo viaggio
  const dataVista = x => x && (x.s === "v" || x.s === "l") ? x.dal : null;
  const annoDi = c => { const ds = [dataVista(dati.paesi[c]), ...cittaDi(c).map(dataVista)].filter(Boolean).sort(); return ds[0] ? ds[0].slice(0, 4) : ""; };
  const timbri = S.vis.map(p => ({ p, s: S.st[p.c], a: annoDi(p.c) })).sort((a, b) => (a.a || "9999").localeCompare(b.a || "9999") || a.p.n.localeCompare(b.p.n, "it"));
  const seme = c => (c.charCodeAt(0) * 31 + c.charCodeAt(1) * 7) % 100;
  const prog = lv.next ? (S.n - lv.min) / (lv.next.n - lv.min) : 1;
  const ent = entrata ? " entra" : "";

  v.innerHTML = `<header class="top"><div><div class="kicker">${S.anno ? `In viaggio dal ${S.anno}` : "Il mio mondo"}</div><h1>Numeri</h1></div>
      <button class="round-btn" id="b-imp" aria-label="Impostazioni">${ICO.ingr}</button></header>
    <section class="hero${ent}">
      <div class="ring-wrap"><svg class="big-ring" viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="g-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--w)"/><stop offset="1" style="stop-color:var(--v)"/></linearGradient></defs>
        <circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" id="n-ring" cx="60" cy="60" r="54" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${entrata ? 100 : 100 - Math.max(S.pct > 0 ? 2 : 0, S.pct * 100)}"/></svg>
        <canvas id="globo" aria-label="Il mondo con i paesi visitati: trascina per girarlo"></canvas></div>
      <div class="hero-t"><b class="pct" id="n-pct">0%</b><h2>del mondo visitato</h2>
        <p>${S.n === 1 ? "1 paese" : S.n + " paesi"} su ${S.tot}${S.nCont ? ` · ${S.nCont === 1 ? "1 continente" : S.nCont + " continenti"}` : ""}</p>
        <p class="terra">${pctTesto(S.area)} della terra emersa</p></div>
    </section>
    <section class="liv${ent}" style="--i:1">
      <span class="liv-e">${lv.e}</span>
      <div class="liv-t"><small>Livello ${lv.i + 1}</small><b>${lv.t}</b>
        <div class="barra oro"><i style="--f:${entrata ? 0 : prog}" data-f="${prog}"></i></div>
        <span>${lv.next ? `Ancora ${lv.next.n - S.n === 1 ? "1 paese" : lv.next.n - S.n + " paesi"} per il livello «${lv.next.t}» ${lv.next.e}` : "Hai raggiunto il livello più alto"}</span></div>
    </section>
    <div class="tiles">
      ${tile("🏙️", S.nCitta, "città", 2, entrata)}
      ${tile("🗓️", S.gg, S.gg === 1 ? "giorno in viaggio" : "giorni in viaggio", 3, entrata)}
      ${tile("📷", S.nFoto, "foto", 4, entrata)}
      ${tile("✨", S.w, S.w === 1 ? "paese da sognare" : "paesi da sognare", 5, entrata)}
    </div>
    ${timbri.length ? `<div class="sez-h">Il mio passaporto <small>${timbri.length === 1 ? "1 timbro" : timbri.length + " timbri"}</small></div>
    <div class="passaporto">${timbri.map((x, i) => { const h = seme(x.p.c);
      return `<button class="timbro f${h % 3}${entrata ? " stampa" : ""}" data-paese="${x.p.c}" style="--r:${(h % 9) - 4}deg;--c:var(${STATI[x.s].cf});--i:${Math.min(i, 12)}">
        <span class="tf">${bandiera(x.p.c)}</span><b>${esc(nomeCorto(x.p.c))}</b><small>${x.s === "l" ? "casa" : x.a || "visitato"}</small></button>`; }).join("")}</div>` : ""}
    <div class="sez-h">Traguardi <small>${ok.size} di ${TROFEI.length}</small></div>
    <div class="trofei">${TROFEI.map((t, i) => `<div class="trofeo${ok.has(t[0]) ? " ok" : ""}${entrata ? " entra" : ""}" style="--i:${Math.min(i, 10)}"><span class="te">${ok.has(t[0]) ? t[1] : "🔒"}</span><b>${t[2]}</b><small>${t[3]}</small></div>`).join("")}</div>
    <div class="sez-h">Continenti</div>
    <div class="cont-st">${S.cont.map(x => `<div class="r"><div><span class="ce">${EMOJI_CONT[x.c]}</span>${CONT[x.c]}<span>${x.f} di ${x.n}</span></div>
      <div class="barra"><i style="--f:${entrata ? 0 : x.f / x.n}" data-f="${x.f / x.n}"></i></div></div>`).join("")}</div>
    ${mzL.length ? `<div class="sez-h">Come viaggi</div><div class="cont-st mezzi-st" style="padding:14px 16px">${mzL.map(([m, n]) => `<div class="mz"><span class="e">${MZ[m][1]}</span>
      <div>${MZ[m][2]}<div class="barra"><i style="--f:${entrata ? 0 : n / mzMax}" data-f="${n / mzMax}"></i></div></div><span>${n}</span></div>`).join("")}</div>` : ""}
    ${ultimi.length ? `<div class="sez-h">Ultimi viaggi</div><div class="viaggi">${ultimi.map(x => {
      const f = (FOTO.get(x.tipo === "paese" ? keyPaese(x.c) : keyCitta(x.d.id)) || [])[0];
      return `<button class="vg" ${x.tipo === "paese" ? `data-paese="${x.c}"` : `data-citta="${esc(x.d.id)}"`}><span class="ic">${f ? `<img src="${esc(f.mini)}" alt="">` : bandiera(x.c)}</span>
        <span class="nm"><b>${esc(x.n)}</b><small>${esc(fmtPeriodo(x.d.dal, x.d.al))}</small></span><span class="mzs">${(x.d.mezzi || []).map(m => MZ[m]?.[1] || "").join("")}</span></button>`;
    }).join("")}</div>` : ""}
    ${!S.vis.length ? `<div class="vuoto"><b>Ancora niente</b>Segna sulla mappa i paesi che hai visitato: qui compariranno i tuoi numeri, i timbri e i traguardi.</div>` : ""}
    <p class="about">Viatrix · città, foto e ricordi restano su questo telefono</p>`;
  $("#b-imp").onclick = () => { tocco(); apriLivello({ tipo: "imp" }); };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("#n-ring").style.strokeDashoffset = 100 - Math.max(S.pct > 0 ? 2 : 0, S.pct * 100);
    $$("#v-numeri .barra i").forEach(b => b.style.setProperty("--f", b.dataset.f));
  }));
  contaSu($("#n-pct"), entrata ? 0 : S.pct * 100, S.pct * 100, x => pctTesto(x / 100));
  if (entrata) $$("#v-numeri .tile b[data-n]").forEach(b => contaSu(b, 0, +b.dataset.n, x => Math.round(x).toLocaleString("it-IT")));
  avviaGlobo(S.st);
}
const EMOJI_CONT = { eu: "🏰", as: "🏯", af: "🦁", na: "🗽", sa: "🦜", oc: "🐨", an: "🐧" };
const tile = (e, n, t, i, entrata) => `<div class="tile${entrata ? " entra" : ""}" style="--i:${i}"><span class="e">${e}</span><b data-n="${n}">${n.toLocaleString("it-IT")}</b><span>${t}</span></div>`;

/* Il globo che gira (Numeri): Natural Earth 1:110m, si trascina col dito */
let GLOBO = null, GIRO_GLOBO = null;   // GIRO_GLOBO: dove era girato il globo (ridisegnando la pagina resta lì)   // forme del globo (1:110m)
async function avviaGlobo(st) {
  const cv = $("#globo"); if (!cv) return;
  if (!GLOBO) { try { const t = await (await fetch(`data/globo.json?v=${DATI_V}`)).json(); GLOBO = topojson.feature(t, t.objects.countries).features; } catch (e) { return; } }
  if (!cv.isConnected) return;
  const size = 104, dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + "px";
  const ctx = cv.getContext("2d");
  const proj = d3.geoOrthographic().scale(size / 2 - 1).translate([size / 2, size / 2]).clipAngle(90).precision(.6);
  const gp = d3.geoPath(proj, ctx);
  // si parte con i paesi visitati davanti
  const vis = GLOBO.filter(f => st[f.properties.c] === "v" || st[f.properties.c] === "l");
  const ce = vis.length ? d3.geoCentroid({ type: "FeatureCollection", features: vis }) : [12, 42];
  const g = globoAttivo = { cv, rot: GIRO_GLOBO || [-ce[0] + 25, -Math.max(-35, Math.min(35, ce[1])) * .7], vel: pocoMoto() ? 0 : .012, drag: null, raf: 0, last: 0 };
  const grat = d3.geoGraticule10();
  const disegnaG = () => {
    proj.rotate(g.rot);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); gp({ type: "Sphere" }); ctx.fillStyle = COL.ocean2; ctx.fill();
    ctx.beginPath(); gp(grat); ctx.strokeStyle = COL.ink; ctx.globalAlpha = .07; ctx.lineWidth = .5; ctx.stroke(); ctx.globalAlpha = 1;
    for (const f of GLOBO) { ctx.beginPath(); gp(f); ctx.fillStyle = colore(st[f.properties.c]); ctx.fill(); }
    ctx.beginPath(); gp({ type: "Sphere" }); ctx.lineWidth = 1; ctx.strokeStyle = COL.ink; ctx.globalAlpha = .12; ctx.stroke(); ctx.globalAlpha = 1;
    // luce: riflesso in alto a sinistra e ombra in basso a destra
    const lg = ctx.createRadialGradient(size * .32, size * .28, 2, size * .5, size * .5, size * .55);
    lg.addColorStop(0, "rgba(255,255,255,.35)"); lg.addColorStop(.5, "rgba(255,255,255,0)"); lg.addColorStop(1, "rgba(0,0,0,.18)");
    ctx.beginPath(); gp({ type: "Sphere" }); ctx.fillStyle = lg; ctx.fill();
  };
  const giro = now => {
    g.raf = 0;
    if (globoAttivo !== g || !cv.isConnected || tabAttiva !== "numeri" || document.hidden || pila.length || !g.visibile) { disegnaG(); return; }
    const dt = Math.min(50, now - (g.last || now)); g.last = now;
    if (!g.drag) g.rot[0] += g.vel * dt;
    disegnaG();
    if (g.vel || g.drag) g.raf = requestAnimationFrame(giro);
  };
  GIRO_GLOBO = g.rot;
  g.visibile = true;
  g.riparti = () => { if (!g.raf && g.visibile) { g.last = 0; g.raf = requestAnimationFrame(giro); } };
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { g.visibile = es[0].isIntersecting; if (g.visibile) g.riparti(); }).observe(cv);
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); g.drag = { x: e.clientX, y: e.clientY, r: [...g.rot] }; g.riparti(); };
  cv.onpointermove = e => { if (!g.drag) return; g.rot[0] = g.drag.r[0] + (e.clientX - g.drag.x) * .7; g.rot[1] = Math.max(-60, Math.min(60, g.drag.r[1] - (e.clientY - g.drag.y) * .7)); };
  cv.onpointerup = cv.onpointercancel = () => { g.drag = null; };
  disegnaG(); g.riparti();
}

/* ---------- Festa: coriandoli e premi ---------- */
const FX = { cv: null, ctx: null, pz: [], raf: 0, last: 0 };
function coriandoli(x, y, o = {}) {
  if (pocoMoto()) return;
  if (!FX.cv) { FX.cv = document.createElement("canvas"); FX.cv.className = "festa"; FX.cv.setAttribute("aria-hidden", "true"); document.body.appendChild(FX.cv); FX.ctx = FX.cv.getContext("2d"); }
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
  if (FX.cv.width !== cw || FX.cv.height !== ch) { FX.cv.width = cw; FX.cv.height = ch; }
  FX.dpr = dpr;
  const cols = o.colori || [COL.v, COL.l, COL.w, "#5B8CFF", "#FF7AB6", "#FFFFFF"];
  const n = o.n || 80, now = performance.now();
  for (let i = 0; i < n; i++) {
    const piove = o.pioggia;
    const ang = -Math.PI / 2 + (Math.random() - .5) * (o.apertura || 1.7);
    const sp = piove ? 0 : (o.forza || 9) * (.45 + Math.random() * .75);
    FX.pz.push({ x: piove ? Math.random() * innerWidth : x, y: piove ? -20 - Math.random() * 200 : y,
      vx: piove ? (Math.random() - .5) * 2 : Math.cos(ang) * sp, vy: piove ? 1 + Math.random() * 2 : Math.sin(ang) * sp,
      g: piove ? .06 : .26, rot: Math.random() * 6, vr: (Math.random() - .5) * .35, s: o.stelle ? 7 + Math.random() * 7 : 5 + Math.random() * 5,
      c: cols[i % cols.length], f: o.stelle ? "s" : Math.random() < .6 ? "r" : "c", t0: now + (piove ? Math.random() * 500 : 0), life: (piove ? 2600 : 1500) + Math.random() * 700 });
  }
  if (!FX.raf) { FX.last = now; FX.raf = requestAnimationFrame(passoFX); }
}
function stella(ctx, s) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? s * .42 : s, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
}
function passoFX(now) {
  const { ctx, dpr } = FX, dt = Math.min(34, now - FX.last) / 16.67; FX.last = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, FX.cv.width, FX.cv.height);
  FX.pz = FX.pz.filter(p => {
    const age = now - p.t0; if (age < 0) return true;
    if (age > p.life || p.y > innerHeight + 30) return false;
    p.vx *= Math.pow(.985, dt); p.vy = p.vy * Math.pow(.985, dt) + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr); ctx.rotate(p.rot);
    ctx.globalAlpha = 1 - chiaro(age, p.life * .7, p.life);
    ctx.fillStyle = p.c;
    if (p.f === "s") stella(ctx, p.s / 2);
    else if (p.f === "c") { ctx.beginPath(); ctx.arc(0, 0, p.s / 3, 0, 7); ctx.fill(); }
    else { ctx.scale(1, Math.cos(p.rot * 2.3)); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
    return true;
  });
  ctx.globalAlpha = 1;
  FX.raf = FX.pz.length ? requestAnimationFrame(passoFX) : 0;
  if (!FX.raf) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, FX.cv.width, FX.cv.height); }
}
const coda = [];
let premioOn = false;
function festeggia(p) {
  // un nuovo paese sostituisce quello ancora in attesa; in coda al massimo 3 premi
  if (p.paese) for (let i = coda.length - 1; i >= 0; i--) if (coda[i].paese) coda.splice(i, 1);
  coda.push(p);
  while (coda.length > 3) coda.splice(coda.findIndex(x => !x.grande), 1);
  if (!premioOn) prossimoPremio();
}
function prossimoPremio() {
  const p = coda.shift();
  if (!p) { premioOn = false; document.documentElement.classList.remove("con-premio"); return; }
  premioOn = true;
  let el = $("#premio");
  if (!el) { el = document.createElement("div"); el.id = "premio"; el.className = "premio"; el.setAttribute("role", "status"); document.body.appendChild(el); el.onclick = () => chiudiPremio(); }
  el.innerHTML = `<span class="pe">${p.e}</span><div><small>${esc(p.k)}</small><b>${esc(p.t)}</b><span>${esc(p.d || "")}</span></div>`;
  el._p = p;
  el.classList.toggle("grande", !!p.grande);
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  document.documentElement.classList.add("con-premio");
  tocco();
  if (p.grande) coriandoli(0, 0, { pioggia: true, n: 140 });
  else setTimeout(() => { const r = el.getBoundingClientRect(); if (el.classList.contains("on")) coriandoli(r.left + 40, r.top + r.height / 2, { n: 40, forza: 7, apertura: 3 }); }, 380);
  clearTimeout(el._t); el._t = setTimeout(chiudiPremio, p.grande ? 3000 : 2200);
}
// il paese è stato tolto subito dopo averlo segnato: via il suo "Nuovo paese" (in coda o già sullo schermo)
function ritiraPremio(c) {
  for (let i = coda.length - 1; i >= 0; i--) if (coda[i].paese && coda[i].c === c) coda.splice(i, 1);
  const el = $("#premio"); if (el && el._p && el._p.paese && el._p.c === c) chiudiPremio();
}
function chiudiPremio() {
  const el = $("#premio"); if (!el || !el.classList.contains("on")) return;
  clearTimeout(el._t); el.classList.remove("on");
  setTimeout(() => { if (!coda.length) document.documentElement.classList.remove("con-premio"); prossimoPremio(); }, 420);
}

/* =====================================================================
   FOGLI DAL BASSO (a livelli: paese → città → …)
   Ogni livello è un passo nella cronologia: il gesto "indietro" torna su.
   ===================================================================== */
const pila = [];
let viewerAperto = false;
/* Conferma in due tocchi: il secondo vale solo dopo 0,6 secondi (un doppio tocco per sbaglio non cancella niente)
   e entro 5 secondi; poi il pulsante torna com'era. */
function armato(b, testo) {
  const ora = Date.now();
  if (b._armato && ora - b._armato < 600) return false;
  if (b._armato && ora - b._armato < 5000) { clearTimeout(b._t); b._armato = 0; return true; }
  b._armato = ora; if (!b._testo) b._testo = b.textContent;
  b.classList.add("sicuro"); b.textContent = testo; tocco();
  clearTimeout(b._t); b._t = setTimeout(() => { b._armato = 0; b.classList.remove("sicuro"); b.textContent = b._testo; }, 5000);
  return false;
}
let apertoAlle = 0, inApertura = false;
function apriLivello(l) {
  // lo stesso livello due volte di fila (doppio tocco): niente
  const top = pila[pila.length - 1];
  if (top && top.tipo === l.tipo && top.c === l.c && top.id === l.id && top.q === l.q) return;
  inApertura = false;
  pila.push(l);
  history.pushState({ l: pila.length }, "");
  mostra(true);
}
function sostituisciLivello(l) {
  pila[pila.length - 1] = l;
  history.replaceState({ l: pila.length }, "");
  mostra(true);
}
const indietro = () => history.back();
function chiudiTutto() { if (pila.length) history.go(-(pila.length + (viewerAperto ? 1 : 0))); }
if (history.state && (history.state.l || history.state.foto)) history.replaceState(null, "");
window.addEventListener("popstate", () => {
  const st = history.state || {};
  // "avanti" verso un foglio che non c'è più: la voce si allinea a quello che si vede
  if ((st.l || 0) > pila.length && !(st.foto && viewerAperto)) { history.replaceState(pila.length ? { l: pila.length } : null, ""); return; }
  if (viewerAperto && !st.foto) { viewerAperto = false; $("#viewer").classList.remove("on"); liberaGrandi(); }
  const l = st.l || 0;
  if (l < pila.length) {
    pila.length = l;
    const dopo = dopoRitorno; dopoRitorno = null;
    if (l === 0) chiudiFoglio();
    else if (dopo && l === 1) { sostituisciLivello(dopo); apertoAlle = Date.now(); }
    else mostra(false);
  }
});
// [meta, colore originale, "media" originale]: il tema scelto a mano in index.html li cambia, ma prima se li segna
const COLORI_BARRA = $$('meta[name="theme-color"]').map(m => [m, m.dataset.orig || m.content, m.dataset.media ?? (m.getAttribute("media") || "")]);
function sfondo(on) {
  if (document.documentElement.classList.contains("aperto") === on) return;
  document.documentElement.classList.toggle("aperto", on);
  COLORI_BARRA.forEach(([m]) => { if (on) { m.dataset.c = m.content; m.content = "#000000"; } else if (m.dataset.c) m.content = m.dataset.c; });
}
/* Foglio a metà (aperto dalla mappa): sopra si vede il paese, che si colora dal vivo */
function modoFoglio(top) {
  const sh = $("#sheet"), root = document.documentElement;
  const meta = !!top.meta && (top.tipo === "paese" || top.tipo === "citta" || top.tipo === "mv");
  sh.classList.toggle("meta", meta); root.classList.toggle("meta", meta);
  $("#scrim").classList.toggle("trasp", meta);
  sfondo(!meta);
  const c = top.tipo === "paese" || top.tipo === "mv" ? top.c : top.tipo === "citta" ? dati.citta[top.id]?.c : null;
  M.scelto = meta ? c : null;
  if (!meta || (M.stelle && M.stelle.c !== c)) M.stelle = null;
  const x = top.tipo === "citta" ? dati.citta[top.id] : null;
  const r = top.tipo === "mv" ? (CONSIGLI.get(top.c) || []).find(z => z[0] === top.q) : null;
  M.pin = meta && x && x.ll ? { ll: x.ll, s: x.s || "w" } : meta && r ? { ll: [r[3], r[4]], s: visto(r[0]) ? "l" : "w" } : null;
  richiedi();
  if (meta && c && tabAttiva === "mappa") { if (top.tipo === "paese") volaAPaese(c, true); else if (top.tipo === "citta") volaACitta(dati.citta[top.id], true); else if (r) volaACitta({ c, ll: [r[3], r[4]] }, true); }
  tingi(top);
}
function tingi(top) {
  const c = top.tipo === "paese" ? top.c : top.tipo === "citta" ? dati.citta[top.id]?.c : null;
  const s = top.tipo === "citta" ? dati.citta[top.id]?.s : c ? statoPaese(c) : null;
  $("#sheet").style.setProperty("--tinta", s ? `var(${STATI[s].cv})` : "transparent");
  if (M.pin && top.tipo === "citta") { M.pin.s = s || "w"; richiedi(); }
}
let espansoAlle = 0;
function espandi() {
  const top = pila[pila.length - 1];
  if (!top || !top.meta) return;
  tocco(); top.meta = false; espansoAlle = Date.now(); modoFoglio(top);
}
function mostra(avanti) {
  const top = pila[pila.length - 1];
  if (!top) return;
  const sh = $("#sheet"), giaAperto = sh.classList.contains("on");
  const html = top.tipo === "paese" ? htmlPaese(top.c) : top.tipo === "citta" ? htmlCitta(top.id) : top.tipo === "scegli" ? htmlScegli(top.c) : top.tipo === "stat" ? htmlStat() : top.tipo === "mv" ? htmlMv(top) : htmlImp();
  if (html == null) { indietro(); return; }
  const fai = () => {
    const y = top.scroll || 0;
    sh.classList.toggle("nuovo", !top._visto); top._visto = true;
    sh.innerHTML = `<div class="grab" data-grab></div>` + html;
    sh.scrollTop = y;
    collega(top);
    // (i posti da non perdere, se già scaricati, si disegnano subito dentro collega: si torna al punto giusto)
    sh.scrollTop = y; top.scroll = y;
  };
  modoFoglio(top);
  apertoAlle = Date.now();   // a ogni cambio di livello: il secondo tocco di un doppio tocco non chiude il foglio
  if (!giaAperto) {
    fai();
    $("#scrim").classList.add("on");
    requestAnimationFrame(() => sh.classList.add("on"));
  } else if (pocoMoto() || !sh.animate) fai();
  else {
    // cambio di livello dentro il foglio: dissolvenza con un piccolo movimento in verticale (mai di lato)
    // durante la dissolvenza il foglio vecchio non si tocca (un doppio tocco aprirebbe due volte la stessa cosa)
    sh._fade = true;
    sh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out" }).onfinish = () => {
      fai(); sh._fade = false;
      sh.animate([{ opacity: 0, transform: `translateY(${avanti ? 10 : -6}px)` }, { opacity: 1, transform: "none" }], { duration: 300, easing: MOLLA });
    };
  }
}
function chiudiFoglio() {
  pila.length = 0;
  document.documentElement.classList.remove("meta");
  M.scelto = null; M.pin = null; M.stelle = null; richiedi();
  rientra();
  $("#sheet").classList.remove("on");
  $("#scrim").classList.remove("on");
  sfondo(false);
  liberaGrandi();
  aggiornaTutto();
}
/* Tocco sulla mappa dietro la scheda: chiude, ma non se si sta scrivendo o si è appena scelta una data
   (su iPhone il tocco che chiude il calendario o la tastiera può arrivare fin qui) */
let ultimoCampo = 0;
document.addEventListener("change", e => { if (e.target.matches?.("input,textarea,select")) ultimoCampo = Date.now(); }, true);
document.addEventListener("focusout", e => { if (e.target.matches?.("input,textarea,select")) ultimoCampo = Date.now(); }, true);
$("#scrim").onclick = () => {
  if (Date.now() - apertoAlle < 450) return;   // il secondo tocco di un doppio tocco sulla mappa
  const a = document.activeElement;
  if (a && a.matches("input,textarea,select")) { a.blur(); return; }
  if (Date.now() - ultimoCampo < 700) return;
  chiudiTutto();
};
document.addEventListener("keydown", e => { if (e.key === "Escape" && (pila.length || viewerAperto)) history.back(); });
// durante il cambio di livello, e per un attimo dopo, i tocchi nel foglio non contano (il secondo tocco di un doppio tocco
// finirebbe sul livello nuovo, magari su "Visitato")
$("#sheet").addEventListener("click", e => { if ($("#sheet")._fade || Date.now() - apertoAlle < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
// si ricorda dove eri nel foglio, per tornarci con "indietro"
$("#sheet").addEventListener("scroll", () => { const top = pila[pila.length - 1]; if (top) top.scroll = $("#sheet").scrollTop; }, { passive: true });

/* Trascinare giù per chiudere (ascolti passivi: lo scorrimento non aspetta mai) */
(() => {
  const sh = $("#sheet"), root = document.documentElement; let y0 = null, dy = 0, t0 = 0, vel = 0, yPrima = 0;
  sh.addEventListener("touchstart", e => { if (sh.scrollTop <= 0 && !e.target.closest("input,textarea,.pick-list")) { y0 = yPrima = e.touches[0].clientY; dy = 0; vel = 0; t0 = e.timeStamp; } else y0 = null; }, { passive: true });
  sh.addEventListener("touchmove", e => {
    if (y0 === null) return;
    const y = e.touches[0].clientY; dy = y - y0;
    const dt = Math.max(1, e.timeStamp - t0); vel = (y - yPrima) / dt; yPrima = y; t0 = e.timeStamp;
    if (dy > 0) {
      const meta = sh.classList.contains("meta");
      sh.classList.add("drag"); if (!meta) root.classList.add("trascina");
      sh.style.transform = meta ? `translateY(calc(${META * 100}% + ${dy}px))` : `translateY(${dy}px)`;
      root.style.setProperty("--p", Math.max(0, 1 - dy / Math.max(300, sh.offsetHeight)).toFixed(3));
    } else if (sh.classList.contains("drag")) { sh.classList.remove("drag"); root.classList.remove("trascina"); sh.style.transform = ""; root.style.removeProperty("--p"); }
  }, { passive: true });
  const rimetti = () => { sh.classList.remove("drag"); root.classList.remove("trascina"); sh.style.transform = ""; root.style.removeProperty("--p"); };
  sh.addEventListener("touchend", () => {
    if (y0 === null) return;
    rimetti();
    if (dy > 110 || (dy > 30 && vel > .6)) chiudiTutto();
    y0 = null;
  });
  // tocco interrotto dal sistema (una chiamata, il Centro di Controllo): il foglio torna al suo posto, senza chiudersi
  sh.addEventListener("touchcancel", () => { if (y0 === null) return; rimetti(); y0 = null; });
})();

const barraFoglio = () => {
  const prima = pila[pila.length - 2];
  const nome = !prima ? "" : prima.tipo === "paese" ? P[prima.c]?.n : prima.tipo === "citta" ? dati.citta[prima.id]?.n : "Indietro";
  return `<div class="sh-bar">${prima ? `<button class="back" data-back>${ICO.back}<span>${esc(nome || "Indietro")}</span></button>` : ""}<button class="x" data-chiudi aria-label="Chiudi">${ICO.x}</button></div>`;
};

/* ---------- Parti comuni di paese e città ---------- */
const suggerimento = (s, eff) => s ? "Tocca di nuovo per togliere." : eff ? "Sulla mappa è già colorato per le città che hai segnato." : "Scegli una delle tre: il posto si colora sulla mappa.";
function htmlStato(s, eff) {
  return `<div class="seg" role="group" aria-label="Stato">${Object.entries(STATI).map(([k, x]) =>
    `<button data-stato="${k}" aria-pressed="${s === k}" style="--c:var(${x.cf})"><span class="e">${x.e}</span>${x.t}</button>`).join("")}</div>
    <p class="piccolo" id="st-hint">${suggerimento(s, eff)}</p>`;
}
function htmlViaggio(d) {
  const s = d.s;
  if (s !== "v" && s !== "l") return "";
  const vivo = s === "l";
  const n = giorni(d.dal, d.al);
  return `<div class="blk-h">${vivo ? "Da quando" : "Quando"}</div>
    <div class="card"><div class="campi">
      <div class="campo"><label for="f-dal">${vivo ? "Dal" : "Dal giorno"}</label><input type="date" id="f-dal" value="${esc(d.dal || "")}"></div>
      <div class="campo"><label for="f-al">${vivo ? "Fino al" : "Al giorno"}</label><input type="date" id="f-al" value="${esc(d.al || "")}" ${d.dal ? `min="${esc(d.dal)}"` : ""}></div>
    </div>${n && !vivo ? `<div class="durata"><span>${nGiorni(n)}</span>${d.dal || d.al ? `<button data-nodate>Togli le date</button>` : ""}</div>` : ""}</div>
    <div class="blk-h">${vivo ? "Come ti sposti" : "Come hai viaggiato"}</div>
    <div class="mezzi">${MEZZI.map(([k, e, t]) => `<button class="chip-m" data-mezzo="${k}" aria-pressed="${(d.mezzi || []).includes(k)}"><span class="e">${e}</span>${t}</button>`).join("")}</div>`;
}
function htmlFoto(k) {
  const l = FOTO.get(k) || [];
  return `<div class="blk-h">Foto <small>${l.length ? (l.length === 1 ? "1 foto" : `${l.length} foto`) : ""}</small></div>
    <div class="album" id="album">${l.map((f, i) => `<button class="ph" data-foto="${esc(f.id)}" style="animation-delay:${Math.min(i, 8) * 30}ms"><img src="${esc(f.mini)}" alt=""></button>`).join("")}
      <label class="add">${ICO.foto}<span>Aggiungi</span><input type="file" accept="image/*" multiple id="f-foto"></label></div>`;
}
const htmlNota = d => `<div class="blk-h">Note</div><textarea class="nota" id="f-nota" placeholder="Un ricordo, un posto dove hai mangiato bene…" maxlength="2000">${esc(d.nota || "")}</textarea>`;

/* ---------- Mini mappa del paese (con le città) ---------- */
function miniMappa(c, selId) {
  const p = P[c]; if (!p) return "";
  const W = 640, H = 400;
  const fs = M.byC[c] || [];
  // si inquadra la parte principale del paese (niente territori lontani: Guyana francese, Hawaii…)
  // paesi senza forma (isolette, Antartide): un cerchio grande quanto il paese, visto dall'alto (va bene anche ai poli)
  const obiettivo = fs.length ? parteMain(c) : d3.geoCircle().center([p.ll[1], p.ll[0]]).radius(Math.max(1.2, Math.sqrt(p.a || 0) / 222))();
  const ce = d3.geoCentroid(obiettivo);
  const proj = fs.length ? d3.geoMercator().rotate([-ce[0], 0]).fitExtent([[36, 36], [W - 36, H - 36]], obiettivo)
    : d3.geoAzimuthalEqualArea().rotate([-p.ll[1], -p.ll[0]]).fitExtent([[36, 36], [W - 36, H - 36]], obiettivo);
  // se il paese è piccolissimo, un po' di contorno
  if (fs.length && proj.scale() > 9000) proj.scale(9000).translate([W / 2, H / 2]).center([0, ce[1]]).rotate([-ce[0], 0]);
  const gp = d3.geoPath(proj);
  const s = statoPaese(c);
  const nb = new Set(p.b || []);
  // paese piccolissimo anche nel riquadro (Malta, San Marino): un cerchio intorno
  const bq = fs.length ? gp.bounds(obiettivo) : null;
  const anello = bq && Math.max(bq[1][0] - bq[0][0], bq[1][1] - bq[0][1]) < 34 ? [(bq[0][0] + bq[1][0]) / 2, (bq[0][1] + bq[1][1]) / 2] : null;
  // vicini e paesi che entrano nel riquadro
  const box = [[-40, -40], [W + 40, H + 40]];
  const altri = M.feats.filter(f => f.c !== c && (nb.has(f.c) || (() => { const b = gp.bounds(f.f); return b[1][0] > box[0][0] && b[0][0] < box[1][0] && b[1][1] > box[0][1] && b[0][1] < box[1][1] && (b[1][0] - b[0][0]) < W * 30; })()));
  const cit = cittaDi(c).filter(x => x.ll && (x.s || x.id === selId));
  const pts = cit.map(x => ({ x, xy: proj([x.ll[1], x.ll[0]]) })).filter(o => o.xy && o.xy[0] > -20 && o.xy[0] < W + 20 && o.xy[1] > -20 && o.xy[1] < H + 20);
  const etichette = pts.length <= 8 || selId;
  return `<div class="mini"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    ${altri.map(f => `<path class="vic" d="${gp(f.f)}"/>`).join("")}
    ${fs.length ? fs.map(f => `<path class="qui${s ? " s-" + s : ""}" pathLength="1" d="${gp(f.f)}"/>`).join("") : (([x, y]) => `<circle class="qui solo${s ? " s-" + s : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="20"/><text class="lbl" x="${x.toFixed(1)}" y="${(y + 52).toFixed(1)}" text-anchor="middle">${esc(p.n)}</text>`)(proj([p.ll[1], p.ll[0]]))}
    ${anello ? `<circle class="anello" cx="${anello[0].toFixed(1)}" cy="${anello[1].toFixed(1)}" r="30"/>` : ""}
    ${pts.map((o, i) => `<circle style="--i:${Math.min(i, 10)}" class="cit s-${o.x.s || "w"}${o.x.id === selId ? " sel" : ""}" cx="${o.xy[0].toFixed(1)}" cy="${o.xy[1].toFixed(1)}" r="${o.x.id === selId ? 10 : 7}"/>`).join("")}
    ${etichette ? pts.filter(o => !selId || o.x.id === selId || pts.length <= 8).map(o => `<text class="lbl" x="${(o.xy[0] + 16).toFixed(1)}" y="${(o.xy[1] + 7).toFixed(1)}" ${o.xy[0] > W - 180 ? `text-anchor="end" dx="-32"` : ""}>${esc(o.x.n)}</text>`).join("") : ""}
  </svg></div>`;
}

/* ---------- Foglio del paese ---------- */
function htmlPaese(c) {
  const p = P[c]; if (!p) return null;
  const d = dati.paesi[c] || {};
  const cs = cittaDi(c).sort((a, b) => (b.dal || "").localeCompare(a.dal || "") || a.n.localeCompare(b.n, "it"));
  return `${barraFoglio()}<div class="sh-body">
    <div class="p-head"><span class="flag">${bandiera(c)}</span><div><h2>${esc(p.n)}</h2><small>${CONT[p.k]}${p.cap ? " · capitale " + esc(p.cap) : ""}</small></div></div>
    <div id="mini-box">${miniMappa(c)}</div>
    <div class="blk-h">Questo paese</div>
    ${htmlStato(d.s || null, statoPaese(c))}
    <div id="viaggio">${htmlViaggio(d)}</div>
    <div class="blk-h">Città <small>${cs.length ? cs.length + (cs.length === 1 ? " città" : " città") : ""}</small></div>
    <div class="card citta">
      ${cs.map(x => `<button class="riga" data-citta="${esc(x.id)}"><span class="dot" style="--c:var(${x.s ? STATI[x.s].cv : "--line"})"></span>
        <span class="nm"><b>${esc(x.n)}</b><small>${esc([x.s ? STATI[x.s].t : "", fmtPeriodo(x.dal, x.al), (x.mezzi || []).map(m => MZ[m]?.[1]).join("")].filter(Boolean).join(" · "))}</small></span>${ICO.vai}</button>`).join("")}
      <button class="add-row" data-aggiungi>${ICO.piu}Aggiungi una città</button>
    </div>
    <div id="consigli"></div>
    ${htmlFoto(keyPaese(c))}
    ${htmlNota(d)}
  </div>`;
}

/* ---------- Foglio della città ---------- */
function htmlCitta(id) {
  const x = dati.citta[id]; if (!x) return null;
  const p = P[x.c];
  return `${barraFoglio()}<div class="sh-body">
    <div class="p-head"><span class="flag">${bandiera(x.c)}</span><div><h2>${esc(x.n)}</h2><small>${esc([x.r, p?.n].filter(Boolean).join(" · "))}</small></div></div>
    ${x.ll ? `<div id="mini-box">${miniMappa(x.c, x.id)}</div>` : ""}
    <div class="blk-h">Questa città</div>
    ${htmlStato(x.s || null)}
    <div id="viaggio">${htmlViaggio(x)}</div>
    <div id="consigli"></div>
    ${htmlFoto(keyCitta(id))}
    ${htmlNota(x)}
    <button class="btn rosso" id="b-togli">Togli questa città</button>
  </div>`;
}

/* ---------- Scegli una città ---------- */
/* ---------- Da non perdere: i posti più famosi di ogni paese e città ----------
   Dati preparati da scripts/consigli.py (Wikidata: la fama = in quante lingue c'è la pagina Wikipedia).
   Riga: [id, nome, descrizione, lat, lon, foto, titolo it.wikipedia, titolo en.wikipedia, fama, tipo].
   La spunta "visto" resta sul telefono (dati.meraviglie). Foto da Wikimedia Commons, testo da Wikipedia. */
const CONSIGLI = new Map(), IN_ARRIVO = new Map();
function caricaConsigli(c) {
  if (CONSIGLI.has(c)) return Promise.resolve(CONSIGLI.get(c));
  if (!IN_ARRIVO.has(c)) IN_ARRIVO.set(c, fetch(`data/consigli/${c}.json?v=${DATI_V}`).then(r => r.ok ? r.json() : []).then(d => { CONSIGLI.set(c, Array.isArray(d) ? d : []); return CONSIGLI.get(c); })
    .catch(() => null).finally(() => IN_ARRIVO.delete(c)));   // senza rete: null, si riprova la prossima volta
  return IN_ARRIVO.get(c);
}
const TIPO_MV = { museo: ["🖼️", "Museo"], chiesa: ["⛪", "Chiesa"], tempio: ["🛕", "Luogo sacro"], castello: ["🏰", "Castello"], palazzo: ["👑", "Palazzo"],
  rovine: ["🏛️", "Sito antico"], piazza: ["🏙️", "Piazza"], ponte: ["🌉", "Ponte"], torre: ["🗼", "Torre"], monumento: ["⛲", "Monumento"],
  parco: ["🌳", "Parco"], montagna: ["⛰️", "Montagna"], acqua: ["🏞️", "Natura"], citta: ["🏘️", "Borgo storico"], teatro: ["🎭", "Teatro"], luogo: ["⭐", "Da vedere"] };
const tipoMv = t => TIPO_MV[proprio(TIPO_MV, t) ? t : "luogo"];
// f = percorso su Commons ("d/de/Nome.jpg"); w = misura standard di Wikimedia (330, 500, 960)
function fotoWiki(f, w) {
  if (!f || !/^[0-9a-f]\/[0-9a-f]{2}\/[^/]+$/.test(f)) return "";
  const nome = f.slice(5), est = nome.split(".").pop().toLowerCase();
  const mini = est === "svg" ? `${w}px-${nome}.png` : est === "tif" || est === "tiff" ? `lossy-page1-${w}px-${nome}.jpg` : `${w}px-${nome}`;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${f.slice(0, 5)}${encodeURIComponent(nome)}/${encodeURIComponent(mini)}`;
}
const visto = q => !!(dati.meraviglie && proprio(dati.meraviglie, q) && dati.meraviglie[q]);
const kmTra = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
// i posti da mostrare: per un paese i 12 più famosi, per una città gli 8 più famosi entro 15 km.
// Elenco vario: al massimo 3 dello stesso tipo, 2 torri o grattacieli, 3 tra montagne e acque (la Cina non sono solo vette, Dubai non solo grattacieli)
function vari(righe, quanti) {
  // montagne e acque distribuite: al massimo una ogni 4 posti (le altre aspettano il loro turno)
  const out = [], per = {}, attesa = [];
  const nat = t => t === "montagna" || t === "acqua";
  let fine = false;
  const puo = r => (per[r[9]] || 0) >= (r[9] === "torre" ? 2 : 3) ? false : nat(r[9]) && (per.natura || 0) >= (fine ? 3 : Math.min(3, Math.floor(out.length / 4) + 1)) ? "dopo" : true;
  const metti = r => { per[r[9]] = (per[r[9]] || 0) + 1; if (nat(r[9])) per.natura = (per.natura || 0) + 1; out.push(r); };
  const recupera = () => { for (let i = 0; i < attesa.length && out.length < quanti; i++) if (puo(attesa[i]) === true) { metti(attesa.splice(i, 1)[0]); i = -1; } };
  for (const r of righe) {
    recupera();
    if (out.length >= quanti) break;
    const p = puo(r);
    if (p === true) metti(r); else if (p === "dopo") attesa.push(r);
  }
  fine = true; recupera();
  return out;
}
function sceltaConsigli(righe, top) {
  if (top.tipo === "citta") {
    const x = dati.citta[top.id]; if (!x || !x.ll) return [];
    return vari(righe.filter(r => kmTra(x.ll[0], x.ll[1], r[3], r[4]) <= 15), 8);
  }
  return vari(righe, 12);
}
function riempiConsigli(top) {
  const box = $("#consigli"); if (!box) return;
  const c = top.tipo === "paese" ? top.c : dati.citta[top.id]?.c;
  if (top.tipo === "citta" && !dati.citta[top.id]?.ll) return;
  if (CONSIGLI.has(c)) return disegnaConsigli(box, top, c, CONSIGLI.get(c));
  box.innerHTML = `<div class="blk-h">Da non perdere</div><div class="mv-grid mv-attesa"><span></span><span></span></div>`;
  caricaConsigli(c).then(righe => { if (box.isConnected && pila[pila.length - 1] === top) disegnaConsigli(box, top, c, righe); });
}
function disegnaConsigli(box, top, c, righe) {
  if (!righe) { box.innerHTML = ""; return; }
  const lista = sceltaConsigli(righe, top);
  top.mv = lista;
  if (top.meta) { M.stelle = Object.assign(lista.map(r => ({ ll: [r[3], r[4]], q: r[0] })), { c }); richiedi(); }
  if (!lista.length) { box.innerHTML = ""; return; }
  const nome = top.tipo === "citta" ? dati.citta[top.id].n : null;
  const s = top.tipo === "citta" ? dati.citta[top.id].s : statoPaese(c);
  const quanti = top.tutti ? lista.length : Math.min(lista.length, 4);
  box.innerHTML = `<div class="blk-h">Da non perdere${nome ? " a " + esc(nome) : ""} <small id="mv-n">${contaVisti(lista)}</small></div>
    <p class="piccolo mv-intro">${introMv((top.tipo === "citta" ? dati.citta[top.id].s : (dati.paesi[c] || {}).s) || s)}</p>
    <div class="mv-grid">${lista.slice(0, quanti).map((r, i) => cartaMv(r, i)).join("")}</div>
    ${lista.length > quanti ? `<button class="btn ghost mv-altri" id="mv-altri">Mostra altri ${lista.length - quanti}</button>` : ""}`;
  collegaMv(box, top);
}
const introMv = s => s === "w" ? "Per quando ci andrai. Segna ✓ quelli che vedi." : s ? "Segna ✓ quelli che hai visto." : "I più famosi, secondo Wikipedia.";
const contaVisti = l => { const n = l.filter(r => visto(r[0])).length; return n ? `${n} di ${l.length} visti` : `${l.length} posti`; };
function cartaMv(r, i) {
  const [e] = tipoMv(r[9]);
  return `<div class="mv" style="--i:${Math.min(i, 8)}">
    <button class="mv-apri" data-mv="${esc(r[0])}"><span class="mv-img" data-e="${e}">${fotoWiki(r[5], 500) ? `<img src="${esc(fotoWiki(r[5], 500))}" alt="" loading="lazy" decoding="async" crossorigin="anonymous">` : ""}</span>
      <span class="mv-t"><b>${esc(r[1])}</b><small>${esc(r[2] || tipoMv(r[9])[1])}</small></span></button>
    <button class="mv-ok" data-visto="${esc(r[0])}" aria-pressed="${visto(r[0])}" aria-label="Visto: ${esc(r[1])}">✓</button></div>`;
}
// foto: dissolvenza quando arriva, emoji del tipo se non c'è o non si carica
// se la miniatura grande non c'è (foto originale piccola), si prova la misura standard più piccola
const MISURE = [1280, 960, 500, 330];
function misuraSotto(im) {
  const m = im.src.match(/\/(?:lossy-page1-)?(\d+)px-/), i = m ? MISURE.indexOf(+m[1]) : -1;
  if (i < 0 || i === MISURE.length - 1) return false;
  im.src = im.src.replace(`/${m[0].slice(1)}`, `/${m[0].slice(1).replace(m[1] + "px-", MISURE[i + 1] + "px-")}`);
  return true;
}
function legaFoto(el) {
  el.querySelectorAll(".mv-img img:not([data-l])").forEach(im => {
    im.dataset.l = 1;
    const ok = () => im.classList.add("ok"), ko = () => { if (!misuraSotto(im)) im.remove(); };
    if (im.complete && im.naturalWidth) ok(); else { im.addEventListener("load", ok); im.addEventListener("error", ko); }
  });
}
function collegaMv(box, top) {
  legaFoto(box);
  // "Mostra altri": si aggiungono solo quelli nuovi, gli altri restano fermi
  box.querySelector("#mv-altri")?.addEventListener("click", e => {
    tocco(); top.tutti = true;
    const g = box.querySelector(".mv-grid"), gia = g.children.length;
    g.insertAdjacentHTML("beforeend", top.mv.slice(gia).map((r, i) => cartaMv(r, i)).join(""));
    legaFoto(g); e.currentTarget.remove();
  });
  box.onclick = e => {
    const v = e.target.closest("[data-visto]");
    if (v) { segnaVisto(v.dataset.visto, v, top); return; }
    const a = e.target.closest("[data-mv]");
    if (a) { tocco(); apriLivello({ tipo: "mv", c: top.tipo === "paese" ? top.c : dati.citta[top.id].c, q: a.dataset.mv, meta: top.meta }); }
  };
}
function segnaVisto(q, b, top) {
  tocco();
  dati.meraviglie = dati.meraviglie || {};
  const ora = !visto(q);
  if (ora) dati.meraviglie[q] = 1; else delete dati.meraviglie[q];
  salva();
  $$(`[data-visto="${CSS.escape(q)}"]`).forEach(x => x.setAttribute("aria-pressed", ora));
  if (top && top.mv && $("#mv-n")) $("#mv-n").textContent = contaVisti(top.mv);
  if (ora && b && !pocoMoto()) {
    b.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 450, easing: "cubic-bezier(.34,1.56,.64,1)" });
    const r = b.getBoundingClientRect(); coriandoli(r.left + r.width / 2, r.top + r.height / 2, { n: 18, forza: 5, apertura: 3, colori: [COL.l, COL.w, "#fff"] });
  }
  if (M.pin && pila[pila.length - 1]?.tipo === "mv") M.pin.s = ora ? "l" : "w";
  richiedi();
  dopoCambio(null);
}

/* La pagina di un posto: foto grande, testo di Wikipedia, "L'ho visto", Mappe */
function htmlMv(top) {
  const r = (CONSIGLI.get(top.c) || []).find(x => x[0] === top.q); if (!r) return null;
  const [e, t] = tipoMv(r[9]);
  const mappe = suIOS() ? `https://maps.apple.com/?ll=${r[3]},${r[4]}&q=${encodeURIComponent(r[1])}` : `https://www.google.com/maps/search/?api=1&query=${r[3]},${r[4]}`;
  const wiki = r[6] ? `https://it.wikipedia.org/wiki/${encodeURIComponent(r[6].replace(/ /g, "_"))}` : r[7] ? `https://en.wikipedia.org/wiki/${encodeURIComponent(r[7].replace(/ /g, "_"))}` : "";
  return `${barraFoglio()}<div class="sh-body">
    <div class="mv-hero" data-e="${e}">${fotoWiki(r[5], 1280) ? `<img src="${esc(fotoWiki(r[5], 1280))}" alt="" crossorigin="anonymous">` : ""}</div>
    <div class="kicker" style="margin-top:14px">${e} ${t} · ${bandiera(top.c)} ${esc(P[top.c]?.n || "")}</div>
    <h2 class="mv-h">${esc(r[1])}</h2>
    ${r[2] ? `<p class="mv-desc">${esc(r[2])}</p>` : ""}
    <p class="mv-testo" id="mv-testo">${r[6] || r[7] ? "Carico da Wikipedia…" : ""}</p>
    <button class="btn ${visto(r[0]) ? "pieno" : "ghost"}" id="mv-visto" data-q="${esc(r[0])}">${visto(r[0]) ? "✓ L'hai visto" : "L'ho visto"}</button>
    <div class="row2"><a class="btn ghost" href="${esc(mappe)}" target="_blank" rel="noopener">🧭 Mappe</a>${wiki ? `<a class="btn ghost" href="${esc(wiki)}" target="_blank" rel="noopener">📖 Wikipedia</a>` : ""}</div>
    <p class="about">Testo: Wikipedia (CC BY-SA) · Foto: Wikimedia Commons · Dati: Wikidata</p>
  </div>`;
}
const RIASSUNTI = new Map();
async function collegaMvPagina(top) {
  const r = (CONSIGLI.get(top.c) || []).find(x => x[0] === top.q); if (!r) return;
  const hero = $(".mv-hero img");
  if (hero) { const ok = () => hero.classList.add("ok"); if (hero.complete && hero.naturalWidth) ok(); else { hero.addEventListener("load", ok); hero.addEventListener("error", () => { if (!misuraSotto(hero)) hero.remove(); }); } }
  $("#mv-visto").addEventListener("click", e => {
    const b = e.currentTarget; segnaVisto(r[0], b, null);
    b.className = "btn " + (visto(r[0]) ? "pieno" : "ghost"); b.textContent = visto(r[0]) ? "✓ L'hai visto" : "L'ho visto";
  });
  const p = $("#mv-testo"); if (!p || (!r[6] && !r[7])) return;
  // riassunto dalla Wikipedia italiana (o inglese se manca); testo semplice, mai HTML
  const chiave = r[0];
  let testo = RIASSUNTI.get(chiave);
  if (!testo) {
    for (const [lingua, tit] of [["it", r[6]], ["en", r[7]]]) {
      if (!tit) continue;
      try {
        const res = await fetch(`https://${lingua}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tit.replace(/ /g, "_"))}`);
        if (!res.ok) continue;
        const d = await res.json();
        if (typeof d.extract === "string" && d.extract.trim()) { testo = { t: d.extract.trim(), en: lingua === "en" }; break; }
      } catch (e) {}
    }
    if (testo) RIASSUNTI.set(chiave, testo);
  }
  if (!p.isConnected) return;
  p.textContent = testo ? testo.t + (testo.en ? " (da Wikipedia in inglese)" : "") : navigator.onLine ? "" : "Il testo di Wikipedia arriva quando c'è internet.";
  if (testo && p.animate && !pocoMoto()) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
}

const CITTA = new Map();   // paese → { r, c, idx } (caricate quando servono)
const CITTA_IN_ARRIVO = new Map();
function caricaCitta(c) {
  if (CITTA.has(c)) return Promise.resolve(CITTA.get(c));
  if (!CITTA_IN_ARRIVO.has(c)) CITTA_IN_ARRIVO.set(c, (async () => {
    let d = { r: [], c: [] };
    try { const r = await fetch(`data/citta/${c}.json?v=${DATI_V}`); if (r.ok) d = await r.json(); } catch (e) { d.errore = true; }
    d.idx = d.c.map(x => norm(x[1]) + (x[6] ? "|" + norm(x[6]) : ""));
    if (!d.errore) CITTA.set(c, d);
    return d;
  })().finally(() => CITTA_IN_ARRIVO.delete(c)));
  return CITTA_IN_ARRIVO.get(c);
}
function htmlScegli(c) {
  return `${barraFoglio()}<div class="sh-body">
    <h2 style="font-size:26px;margin-top:4px">Aggiungi una città</h2>
    <p class="piccolo" style="margin:4px 0 0">${esc(P[c]?.n || "")} · scrivi il nome, o scegli tra le più grandi</p>
    <div class="search">${ICO.cerca}<input id="qc" type="search" placeholder="Cerca una città" autocomplete="off" autocorrect="off" enterkeyhint="search" aria-label="Cerca una città"></div>
    <div class="card pick-list" id="pick"><div class="vuoto">Carico le città…</div></div>
  </div>`;
}
async function elencoScegli(c) {
  const d = await caricaCitta(c);
  const top = pila[pila.length - 1];
  const box = $("#pick"); if (!box || !top || top.tipo !== "scegli" || top.c !== c) return;
  const q = norm($("#qc")?.value || "");
  const gia = new Set(cittaDi(c).map(x => x.id));
  let ris = [];
  if (!q) ris = d.c.slice(0, 40);
  else {
    const prima = [], poi = [];
    for (let i = 0; i < d.c.length && prima.length < 60; i++) {
      const s = d.idx[i];
      if (s.startsWith(q) || s.includes("|" + q)) prima.push(d.c[i]); else if (poi.length < 40 && s.includes(q)) poi.push(d.c[i]);
    }
    ris = [...prima, ...poi].slice(0, 60);
  }
  const fmtPop = n => n >= 1e6 ? (n / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " mln" : n >= 1000 ? Math.round(n / 1000) + " mila" : "";
  const esatto = ris.some(x => norm(x[1]) === q);
  box.innerHTML = (d.errore ? `<div class="vuoto">Non riesco a caricare l'elenco: serve internet la prima volta.</div>` : "") +
    ris.map(x => `<button class="riga" data-g="${x[0]}"><span class="nm"><b>${esc(x[1])}</b><small>${esc([d.r[x[5]], x[6] && x[6] !== x[1] ? x[6] : ""].filter(Boolean).join(" · "))}</small></span>
      ${gia.has("g" + x[0]) ? `<span class="ok">✓ aggiunta</span>` : `<span class="pop">${fmtPop(x[4])}</span>`}</button>`).join("") +
    (q.length >= 2 && !esatto ? `<button class="add-row" data-nuova>${ICO.piu}Aggiungi «${esc($("#qc").value.trim())}»</button>` : "") +
    (!ris.length && q.length < 2 && !d.errore ? `<div class="vuoto">Nessuna città in elenco: scrivi il nome per aggiungerla.</div>` : "");
}
function scegliCitta(c, x) {
  const id = x ? "g" + x[0] : "u" + nuovoId();
  if (!dati.citta[id]) {
    const d = CITTA.get(c);
    const sp = statoPaese(c), prima = sp, primaPct = conti().pct;
    dati.citta[id] = x ? { id, c, n: x[1], r: d?.r[x[5]] || "", ll: [x[2], x[3]], s: sp === "w" ? "w" : "v", mezzi: [], t: Date.now() }
      : { id, c, n: String($("#qc").value).trim().slice(0, 60), r: "", ll: null, s: sp === "w" ? "w" : "v", mezzi: [], t: Date.now() };
    salva(true);
    // anche aggiungendo una città il paese diventa visitato: stessa festa del pulsante
    dopoCambio(c, prima);
    if (statoPaese(c) === "v" && prima !== "v" && prima !== "l") { const k = conti(); festeggia({ paese: true, e: bandiera(c), k: "Nuovo paese", t: P[c].n, d: k.pct > primaPct ? `Ora sei al ${pctTesto(k.pct)} del mondo` : "È sulla tua mappa" }); }
  }
  tocco();
  sostituisciLivello({ tipo: "citta", id, meta: !!pila[pila.length - 2]?.meta });
}

/* ---------- Impostazioni ---------- */
function htmlImp() {
  const tema = leggiLS("viatrix-tema") || "auto";
  return `${barraFoglio()}<div class="sh-body">
    <h2 style="font-size:28px;margin-top:4px">Impostazioni</h2>
    <div class="blk-h">Aspetto</div>
    <div class="opz" id="tema">${[["auto", "Automatico"], ["light", "Chiaro"], ["dark", "Scuro"]].map(([k, t]) => `<button data-tema="${k}" aria-pressed="${tema === k}">${t}</button>`).join("")}</div>
    ${installata() ? "" : `<button class="btn ghost" id="b-home" style="margin-top:16px">${ICO.aggHome} Come metterla sulla schermata Home</button>`}
    <div class="blk-h">I tuoi dati</div>
    <p class="piccolo" style="margin-top:0">Città, date, foto e note restano <b>solo su questo telefono</b>. Ogni tanto salva una copia (per esempio su ${suIOS() ? "iCloud Drive" : "Google Drive"}): serve se cambi telefono.</p>
    <button class="btn pieno" id="b-salva">Salva una copia</button>
    <label class="btn ghost" style="cursor:pointer">Ripristina da una copia<input type="file" accept="${ACCETTA_COPIA}" id="b-file" hidden></label>
    <div id="b-conf"></div>
    <button class="btn rosso" id="b-canc" style="margin-top:28px">Cancella tutto</button>
    ${statAttive() && adminDentro() ? `<button class="btn ghost" id="b-stat" style="margin-top:12px">📊 Statistiche (solo per te)</button>` : ""}
    <p class="about" id="b-ver">Viatrix · versione ${VERSIONE_APP}<br>Mappa: Natural Earth · Città: GeoNames<br>Posti da non perdere: Wikidata · Foto: Wikimedia Commons · Testi: Wikipedia</p>
  </div>`;
}

/* ---------- Collegare i comandi del foglio ---------- */
function collega(top) {
  const sh = $("#sheet");
  sh.querySelector("[data-chiudi]")?.addEventListener("click", () => { tocco(); chiudiTutto(); });
  sh.querySelector("[data-back]")?.addEventListener("click", () => { tocco(); indietro(); });
  sh.querySelector("[data-grab]")?.addEventListener("click", espandi);
  if (top.tipo === "paese" || top.tipo === "citta") collegaLuogo(top);
  if (top.tipo === "scegli") {
    const c = top.c;
    elencoScegli(c);
    let tq; $("#qc").addEventListener("input", () => { clearTimeout(tq); tq = setTimeout(() => elencoScegli(c), 80); });
    $("#qc").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
    $("#pick").addEventListener("click", e => {
      const b = e.target.closest("[data-g],[data-nuova]"); if (!b) return;
      if (b.dataset.nuova !== undefined) return scegliCitta(c, null);
      const d = CITTA.get(c), x = d && d.c.find(r => String(r[0]) === b.dataset.g);
      if (x) scegliCitta(c, x);
    });
  }
  if (top.tipo === "imp") collegaImp();
  if (top.tipo === "stat") collegaStat();
  if (top.tipo === "mv") collegaMvPagina(top);
}
function collegaLuogo(top) {
  const sh = $("#sheet");
  const paese = top.tipo === "paese";
  const c = paese ? top.c : dati.citta[top.id]?.c;
  const kFoto = paese ? keyPaese(c) : keyCitta(top.id);
  const rec = () => paese ? (dati.paesi[c] = dati.paesi[c] || { s: null, mezzi: [] }) : dati.citta[top.id];
  riempiConsigli(top);
  // stato: visitato / ci vivo / vorrei andarci
  sh.querySelector(".seg").addEventListener("click", e => {
    const b = e.target.closest("[data-stato]"); if (!b) return;
    const seg = e.currentTarget; if (Date.now() - (seg._t || 0) < 400) return; seg._t = Date.now();
    tocco();
    const d = rec(), prima = statoPaese(c), primaPct = conti().pct;
    d.s = d.s === b.dataset.stato ? null : b.dataset.stato;
    sistemaData(d);
    if (paese) pulisciVuoto(c);
    salva(true);
    $$(".seg [data-stato]").forEach(x => x.setAttribute("aria-pressed", x.dataset.stato === (d.s || "")));
    $("#st-hint").textContent = suggerimento(d.s, paese ? statoPaese(c) : null);
    const vb = $("#viaggio"), nuovo = htmlViaggio(d), cera = vb.innerHTML.trim() !== "";
    vb.innerHTML = nuovo; collegaViaggio(rec);
    if (nuovo && !cera && vb.animate && !pocoMoto()) vb.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: MOLLA });
    aggiornaMini(top);
    tingi(top);
    const intro = $(".mv-intro"); if (intro) intro.textContent = introMv(d.s || (paese ? statoPaese(c) : null));
    // la festa: coriandoli dal pulsante, stelline per i sogni
    if (d.s && !pocoMoto()) {
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 3;
      if (d.s === "w") coriandoli(x, y, { stelle: true, n: 22, forza: 7, colori: [COL.w, "#FFE08A", "#FFC94D"] });
      else coriandoli(x, y, { n: 70 });
      const em = b.querySelector(".e"); em && em.animate([{ transform: "scale(1)" }, { transform: "scale(1.6) rotate(-12deg)", offset: .35 }, { transform: "scale(.9) rotate(4deg)", offset: .7 }, { transform: "scale(1.15) rotate(-6deg)" }], { duration: 650, easing: "ease-out" });
    }
    const dopo = statoPaese(c);
    if ((dopo === "v" || dopo === "l") && prima !== "v" && prima !== "l") {
      const k = conti();
      festeggia({ paese: true, c, e: bandiera(c), k: dopo === "l" ? "Casa tua" : "Nuovo paese", t: P[c].n, d: k.pct > primaPct ? `Ora sei al ${pctTesto(k.pct)} del mondo` : "È sulla tua mappa" });
    }
    if ((prima === "v" || prima === "l") && dopo !== "v" && dopo !== "l") ritiraPremio(c);
    dopoCambio(c, prima);
  });
  collegaViaggio(rec);
  // foto
  $("#f-foto").addEventListener("change", e => { const files = [...e.target.files]; e.target.value = ""; if (files.length) aggiungiFoto(kFoto, files, top); });
  $("#album").addEventListener("click", e => { const b = e.target.closest("[data-foto]"); if (b) apriFoto(kFoto, b.dataset.foto, top); });
  // note
  const ta = $("#f-nota");
  let tn; const applicaNota = () => { clearTimeout(tn); notaInSospeso = null; rec().nota = ta.value.slice(0, 2000); if (paese) pulisciVuoto(c); salva(); };
  ta.addEventListener("input", () => { clearTimeout(tn); notaInSospeso = applicaNota; tn = setTimeout(applicaNota, 300); });
  if (paese) {
    sh.querySelector("[data-aggiungi]").addEventListener("click", () => { tocco(); apriLivello({ tipo: "scegli", c }); });
    sh.querySelectorAll(".citta [data-citta]").forEach(b => b.addEventListener("click", () => { tocco(); apriLivello({ tipo: "citta", id: b.dataset.citta, meta: top.meta }); }));
  } else {
    $("#b-togli").addEventListener("click", async e => {
      const b = e.currentTarget;
      if (!armato(b, "Tocca ancora per togliere")) return;
      const prima = statoPaese(c);
      if (DB.bloccato) { avvisoLettura(); return; }
      try { for (const f of [...(FOTO.get(kFoto) || [])]) { await DB.del("foto", f.id); FOTO.set(kFoto, FOTO.get(kFoto).filter(x => x !== f)); } }
      catch (er) { toast("Non riesco a togliere le foto della città: riprova"); b.classList.remove("sicuro"); b.textContent = b._testo || "Togli questa città"; return; }
      FOTO.delete(kFoto);
      delete dati.citta[top.id]; salva(true);
      dopoCambio(c, prima);
      toast("Città tolta");
      indietro();
    });
  }
}
function collegaViaggio(rec) {
  const dal = $("#f-dal"), al = $("#f-al");
  if (!dal) return;
  /* Le caselle delle date NON si ridisegnano mai: su iPhone il calendario resta aperto mentre si sceglie,
     e togliere la casella sotto il dito lo chiude di colpo (il tocco poi finiva sulla mappa e chiudeva la scheda).
     Si aggiornano solo i valori diversi, il minimo della seconda data e la riga "N giorni". */
  const aggiornaDurata = () => {
    const d = rec(), vivo = d.s === "l", n = giorni(d.dal, d.al);
    if (dal.value !== (d.dal || "")) dal.value = d.dal || "";
    if (al.value !== (d.al || "")) al.value = d.al || "";
    if (d.dal) al.min = d.dal; else al.removeAttribute("min");
    const card = dal.closest(".card");
    let du = card.querySelector(".durata");
    if (n && !vivo) {
      if (!du) { du = document.createElement("div"); du.className = "durata"; card.appendChild(du); }
      du.innerHTML = `<span>${nGiorni(n)}</span><button data-nodate>Togli le date</button>`;
      du.querySelector("[data-nodate]").addEventListener("click", togliDate);
    } else if (du) du.remove();
  };
  const togliDate = () => { tocco(); const d = rec(); d.dal = d.al = null; salva(); aggiornaDurata(); dopoCambio(null); };
  // senza il primo giorno non resta un "al giorno" da solo (tranne per chi ci vive: "fino al" ha senso anche da solo)
  dal.addEventListener("change", () => { const d = rec(); d.dal = dal.value || null; if (!d.dal && d.s !== "l") d.al = null; if (d.al && d.dal && d.al < d.dal) d.al = d.dal; salva(); aggiornaDurata(); dopoCambio(null); });
  al.addEventListener("change", () => { const d = rec(); d.al = al.value || null; sistemaData(d); if (d.al && d.dal && d.al < d.dal) d.dal = d.al; salva(); aggiornaDurata(); dopoCambio(null); });
  $("#viaggio [data-nodate]")?.addEventListener("click", togliDate);
  $$("#viaggio [data-mezzo]").forEach(b => b.addEventListener("click", () => {
    tocco();
    const d = rec(), m = b.dataset.mezzo; d.mezzi = d.mezzi || [];
    d.mezzi = d.mezzi.includes(m) ? d.mezzi.filter(x => x !== m) : [...d.mezzi, m];
    b.setAttribute("aria-pressed", d.mezzi.includes(m));
    const e = b.querySelector(".e"); if (e && e.animate && !pocoMoto() && d.mezzi.includes(m)) e.animate(VIAGGIO_MEZZO[m] || VIAGGIO_MEZZO.auto, { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)" });
    salva(); dopoCambio(null);
  }));
}
function aggiornaMini(top) {
  const box = $("#mini-box"); if (!box) return;
  const c = top.tipo === "paese" ? top.c : dati.citta[top.id]?.c;
  const s = statoPaese(c);
  box.querySelectorAll(".qui").forEach(q => { q.classList.remove("s-v", "s-l", "s-w"); if (s) q.classList.add("s-" + s); });
  if (top.tipo === "citta") { const x = dati.citta[top.id]; box.querySelectorAll(".cit.sel").forEach(q => { q.classList.remove("s-v", "s-l", "s-w"); q.classList.add("s-" + (x.s || "w")); }); }
}
// dopo ogni modifica: colori della mappa e riepilogo (le liste si ridisegnano quando si chiude il foglio)
let tPremi = null;
function dopoCambio(c, primaS) {
  if (c) cambiaColore(c, primaS);
  if (c && (statoPaese(c) === "v" || statoPaese(c) === "l") && primaS !== "v" && primaS !== "l") onda(c, statoPaese(c));
  aggiornaTesta();
  clearTimeout(tPremi); tPremi = setTimeout(controllaPremi, 500);
  programmaStat();
}
// ogni mezzo parte a modo suo: l'aereo decolla, la nave dondola, gli scarponi saltano
const VIAGGIO_MEZZO = {
  aereo: [{ transform: "none", opacity: 1 }, { transform: "translate(18px,-14px) rotate(-12deg)", opacity: 0, offset: .4 }, { transform: "translate(-16px,10px)", opacity: 0, offset: .41 }, { transform: "none", opacity: 1 }],
  auto: [{ transform: "none", opacity: 1 }, { transform: "translateX(20px)", opacity: 0, offset: .4 }, { transform: "translateX(-18px)", opacity: 0, offset: .41 }, { transform: "none", opacity: 1 }],
  nave: [{ transform: "none" }, { transform: "rotate(-14deg) translateY(-2px)" }, { transform: "rotate(10deg)" }, { transform: "rotate(-5deg)" }, { transform: "none" }],
  piedi: [{ transform: "none" }, { transform: "translateY(-8px) rotate(-8deg)" }, { transform: "none" }, { transform: "translateY(-5px) rotate(6deg)" }, { transform: "none" }]
};
["treno", "bus", "camper", "moto", "bici"].forEach(m => VIAGGIO_MEZZO[m] = VIAGGIO_MEZZO.auto);
function aggiornaTutto() {
  M.st = stati(); richiedi(); aggiornaTesta();
  if (tabAttiva === "paesi") { const y = $("#v-paesi").scrollTop; elencoPaesi(false); $("#v-paesi").scrollTop = y; }
  if (tabAttiva === "numeri") { const y = $("#v-numeri").scrollTop; disegnaNumeri(false); $("#v-numeri").scrollTop = y; }
}
// liste: tocco su un paese o una città (in Paesi e in Numeri)
document.addEventListener("click", e => {
  if (e.target.closest("#sheet")) return;
  const b = e.target.closest("[data-paese],[data-citta]"); if (!b) return;
  tocco();
  if (b.dataset.paese) apriLivello({ tipo: "paese", c: b.dataset.paese });
  else if (dati.citta[b.dataset.citta]) apriLivello({ tipo: "citta", id: b.dataset.citta });
});

/* ---------- Impostazioni: tema, copia, cancella ---------- */
function applicaTema(t) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
  scriviLS("viatrix-tema", t === "auto" ? null : t);
  const scuro = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  COLORI_BARRA.forEach(([m, orig, media]) => {
    if (t === "auto") { if (media) m.setAttribute("media", media); else m.removeAttribute("media"); m.dataset.c = orig; }
    else { m.removeAttribute("media"); m.dataset.c = scuro ? "#0D1118" : "#F1F4F7"; }
    m.content = document.documentElement.classList.contains("aperto") ? "#000000" : m.dataset.c;
  });
  leggiColori(); richiedi();
}
function collegaImp() {
  $("#tema").addEventListener("click", e => {
    const b = e.target.closest("[data-tema]"); if (!b) return; tocco();
    $$("#tema [data-tema]").forEach(x => x.setAttribute("aria-pressed", x === b));
    applicaTema(b.dataset.tema);
  });
  $("#b-salva").addEventListener("click", esportaCopia);
  $("#b-home")?.addEventListener("click", () => { chiudiTutto(); setTimeout(() => avvisoHome(true), 500); });
  $("#b-stat")?.addEventListener("click", () => { tocco(); apriLivello({ tipo: "stat" }); });
  // entrata nascosta: 5 tocchi sulla riga della versione
  let n = 0, tn; $("#b-ver").addEventListener("click", () => { clearTimeout(tn); tn = setTimeout(() => n = 0, 1500); if (++n >= 5 && statAttive()) { n = 0; tocco(); apriLivello({ tipo: "stat" }); } });
  $("#b-file").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) chiediRipristino(f); });
  $("#b-canc").addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!armato(b, "Tocca ancora: cancella paesi, città e foto")) return;
    if (DB.bloccato) { avvisoLettura(); return; }
    try {
      await DB.sostituisci({ paesi: {}, citta: {} }, []);
      programmaStat(1000);
      dati = { paesi: {}, citta: {}, visti: [], liv: 0, meraviglie: {} }; FOTO.clear(); pctPrima = -1;
      chiudiTutto(); toast("Tutto cancellato");
    } catch (er) { toast("Non riesco a cancellare"); }
  });
}
const blobInData = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(b); });
// Il file della copia: ogni foto diventa subito un pezzo di file (Blob), così il testo lungo delle foto non resta tutto in memoria.
async function preparaCopia() {
  const testa = JSON.stringify({ app: "viatrix", versione: 1, creata: new Date().toISOString(), dati });
  const pezzi = [testa.slice(0, -1) + ',"foto":['];
  const foto = await DB.all("foto");
  for (let k = 0; k < foto.length; k++) {
    const f = foto[k];
    pezzi.push(new Blob([(k ? "," : "") + JSON.stringify({ id: f.id, k: f.k, t: f.t, mini: f.mini, data: await blobInData(f.blob) })]));
  }
  pezzi.push("]}");
  return new File(pezzi, `viatrix-copia-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
}
function scaricaFile(file) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
// Condivide la copia (iPhone: "Salva su File", AirDrop…). Dice se è andata; "tardi" se serve un tocco nuovo.
async function condividiCopia(file) {
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { scaricaFile(file); return "ok"; }
  try { await navigator.share({ files: [file], title: "Copia di Viatrix" }); return "ok"; }
  catch (e) {
    if (e.name === "AbortError") return "annullata";
    // Safari lascia condividere solo subito dopo un tocco: con tante foto la preparazione dura di più
    if (e.name === "NotAllowedError") return "tardi";
    scaricaFile(file); return "ok";
  }
}
async function esportaCopia(ev) {
  const b = ev?.currentTarget || $("#b-salva"), testo = "Salva una copia";
  if (b._copia) {   // copia già pronta: questo è il tocco nuovo
    const file = b._copia; b._copia = null; b.classList.remove("pronta"); b.textContent = testo;
    const r = await condividiCopia(file);
    if (r === "ok") toast("Copia pronta");
    else if (r === "tardi") { b._copia = file; b.classList.add("pronta"); b.textContent = "La copia è pronta: tocca per salvarla"; }
    return;
  }
  if (b.disabled) return;
  if (DB.bloccato) { avvisoLettura(); return; }   // in memoria non c'è niente: la copia sarebbe vuota
  b.textContent = "Preparo la copia…"; b.disabled = true;
  const t0 = Date.now();
  try {
    const file = await preparaCopia();
    // se ci ha messo tanto, il tocco di prima non vale più: si chiede un tocco nuovo
    const r = Date.now() - t0 > 3000 && navigator.canShare && navigator.canShare({ files: [file] }) ? "tardi" : await condividiCopia(file);
    b.disabled = false;
    if (r === "tardi") { b._copia = file; b.classList.add("pronta"); b.textContent = "La copia è pronta: tocca per salvarla"; tocco(); return; }
    if (r === "ok") toast("Copia pronta");
  } catch (e) { toast("Non riesco a fare la copia: riprova"); }
  b.textContent = testo; b.disabled = false;
}
const CODICE = /^[A-Z]{2}$/;
// un'immagine vera in formato testo (niente virgolette o altro che possa uscire dall'attributo src)
const IMG_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
function pulisciDati(d) {
  const out = { paesi: {}, citta: {}, meraviglie: Object.fromEntries(Object.keys(d?.meraviglie && typeof d.meraviglie === "object" ? d.meraviglie : {}).filter(q => /^Q\d{1,12}$/.test(q)).slice(0, 5000).map(q => [q, 1])), visti: Array.isArray(d?.visti) ? d.visti.filter(x => typeof x === "string").slice(0, 100) : undefined, liv: Math.max(0, Math.min(LIVELLI.length - 1, Math.floor(+d?.liv) || 0)) };
  const data = v => { if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const t = new Date(v + "T00:00:00Z"); return !isNaN(t) && t.toISOString().slice(0, 10) === v ? v : null; };
  const ordina = x => { if (x.dal && x.al && x.al < x.dal) [x.dal, x.al] = [x.al, x.dal]; return x; };
  const st = v => v === "v" || v === "l" || v === "w" ? v : null;
  const mz = v => Array.isArray(v) ? [...new Set(v.filter(m => proprio(MZ, m)))] : [];
  const nota = v => typeof v === "string" ? v.slice(0, 2000) : "";
  for (const [c, x] of Object.entries(d?.paesi || {})) if (CODICE.test(c) && proprio(P, c) && x) out.paesi[c] = ordina({ s: st(x.s), dal: data(x.dal), al: data(x.al), mezzi: mz(x.mezzi), nota: nota(x.nota) });
  for (const x of Object.values(d?.citta || {})) {
    if (!x || typeof x.id !== "string" || !CODICE.test(x.c) || !proprio(P, x.c) || typeof x.n !== "string") continue;
    const ll = Array.isArray(x.ll) && x.ll.length === 2 && x.ll.every(n => typeof n === "number" && isFinite(n)) ? x.ll : null;
    const id = x.id.slice(0, 40);
    if (out.citta[id]) continue;
    out.citta[id] = ordina({ id, c: x.c, n: x.n.slice(0, 60), r: typeof x.r === "string" ? x.r.slice(0, 60) : "", ll, s: st(x.s), dal: data(x.dal), al: data(x.al), mezzi: mz(x.mezzi), nota: nota(x.nota), t: +x.t || Date.now() });
  }
  return out;
}
/* Lettura della copia a pezzi (4 MB alla volta): anche una copia con centinaia di foto non riempie la memoria del telefono.
   Il file è {"app":"viatrix",…,"dati":{…},"foto":[{…},{…}]}: prima si legge la testa fino a "foto":[, poi una foto alla volta. */
const PEZZO = 4 * 1024 * 1024;
async function leggiTesta(file) {
  let testo = "", pos = 0;
  const dec = new TextDecoder();   // a pezzi, senza spezzare le lettere accentate tra un pezzo e l'altro
  while (pos < file.size && testo.length < 64 * 1024 * 1024) {
    testo += dec.decode(await file.slice(pos, pos + PEZZO).arrayBuffer(), { stream: true }); pos += PEZZO;
    const i = testo.indexOf(',"foto":[');
    if (i >= 0) { let d; try { d = JSON.parse(testo.slice(0, i) + "}"); } catch (e) { return null; } return { d, inizio: new Blob([testo.slice(0, i)]).size + 9 }; }
  }
  // copia senza foto o scritta in un altro ordine: si legge tutta (solo se non è enorme)
  if (file.size > 64 * 1024 * 1024) return null;
  try { const d = JSON.parse(await file.text()); return { d, foto: Array.isArray(d.foto) ? d.foto : [] }; } catch (e) { return null; }
}
// una foto alla volta: si contano le parentesi fuori dalle stringhe
async function* fotoDellaCopia(file, inizio) {
  let pos = inizio, buf = "", prof = 0, inStr = false, esc_ = false, da = -1;
  const dec = new TextDecoder();
  while (pos < file.size) {
    const pezzo = dec.decode(await file.slice(pos, pos + PEZZO).arrayBuffer(), { stream: true }); pos += PEZZO;
    let i = buf.length; buf += pezzo;
    for (; i < buf.length; i++) {
      const ch = buf[i];
      if (inStr) { if (esc_) esc_ = false; else if (ch === "\\") esc_ = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") { if (prof++ === 0) da = i; }
      else if (ch === "}") { if (--prof === 0 && da >= 0) { try { yield JSON.parse(buf.slice(da, i + 1)); } catch (e) {} da = -1; } }
      else if (ch === "]" && prof === 0) return;
    }
    // si tiene solo la foto ancora a metà
    if (da >= 0) { buf = buf.slice(da); da = 0; } else buf = "";
  }
}
async function chiediRipristino(file) {
  const t = await leggiTesta(file);
  const d = t && t.d;
  if (!d || d.app !== "viatrix" || !d.dati || typeof d.dati !== "object") { toast("Questo file non è una copia di Viatrix"); return; }
  const nd = pulisciDati(d.dati);
  const mb = Math.max(1, Math.round(file.size / 1048576));
  $("#b-conf").innerHTML = `<div class="conf"><p>La copia ha <b>${(n => n === 1 ? "1 paese" : n + " paesi")(Object.keys(nd.paesi).length)}</b>, ${Object.keys(nd.citta).length} città, ${(n => n === 1 ? "1 posto visto" : n + " posti visti")(Object.keys(nd.meraviglie).length)} e le foto (${mb} MB in tutto). Sostituisce tutto quello che c'è adesso.</p>
    <div class="row2"><button class="btn ghost" id="r-no">Annulla</button><button class="btn pieno" id="r-si">Ripristina</button></div></div>`;
  $("#r-no").onclick = () => $("#b-conf").innerHTML = "";
  $("#r-si").onclick = async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Ripristino…";
    try {
      const chiavi = new Set([...Object.keys(nd.paesi).map(keyPaese), ...Object.keys(nd.citta).map(keyCitta)]);
      const foto = [], visti = new Set();
      const tutte = t.foto ? (async function* () { yield* t.foto; })() : fotoDellaCopia(file, t.inizio);
      for await (const f of tutte) {
        if (!f || typeof f !== "object" || !IMG_OK.test(f.data) || !chiavi.has(f.k)) continue;
        const id = String(f.id).slice(0, 40); if (visti.has(id)) continue; visti.add(id);
        const blob = await (await fetch(f.data)).blob();
        f.data = null;   // il testo lungo della foto non serve più: si libera la memoria
        const mini = IMG_OK.test(f.mini) ? f.mini : await miniDa(blob);
        foto.push({ id, k: f.k, t: +f.t || Date.now(), mini, blob });
        if (foto.length % 10 === 0) b.textContent = `Ripristino… ${foto.length} foto`;
      }
      sistemaDate(nd);
      await DB.sostituisci(nd, foto);
      programmaStat(1000);
      dati = nd; FOTO.clear(); foto.forEach(indicizzaFoto); pctPrima = -1;
      chiudiTutto(); toast("Copia ripristinata");
    } catch (er) { b.disabled = false; b.textContent = "Ripristina"; toast("Ripristino non riuscito: i dati di prima sono ancora tutti qui"); }
  };
}

/* ---------- Foto ---------- */
function indicizzaFoto(f) { const l = FOTO.get(f.k) || []; l.push(f); l.sort((a, b) => b.t - a.t); FOTO.set(f.k, l); }
function caricaImg(blob) { return new Promise((ok, ko) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => ok({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); ko(); }; im.src = u; }); }
// Le tele usate per rimpicciolire si svuotano subito (width = height = 0): Safari ne tiene poche in memoria.
const libera = c => { c.width = c.height = 0; };
async function rimpicciolita(im, lato) {
  const k = Math.min(1, lato / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", .82));
  libera(c);
  if (!blob) throw new Error("foto");
  return blob;
}
function quadrata(im, lato) {
  const s = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement("canvas");
  c.width = c.height = lato;
  c.getContext("2d").drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, lato, lato);
  const u = c.toDataURL("image/jpeg", .78); libera(c); return u;
}
async function miniDa(blob) { const { im, u } = await caricaImg(blob); const m = quadrata(im, 300); URL.revokeObjectURL(u); return m; }
async function aggiungiFoto(k, files, top) {
  if (!DB.db) { toast("In una finestra privata le foto non si possono salvare"); return; }
  if (DB.bloccato) { avvisoLettura(); return; }
  toast(files.length === 1 ? "Aggiungo la foto…" : `Aggiungo ${files.length} foto…`);
  let n = 0, illeggibili = 0, errSalva = null;
  for (const file of files.slice(0, 30)) {
    let f;
    try {
      const { im, u } = await caricaImg(file);
      try { f = { id: nuovoId(), k, t: Date.now() + n, mini: quadrata(im, 300), blob: await rimpicciolita(im, 1600) }; }
      finally { URL.revokeObjectURL(u); }
    } catch (e) { illeggibili++; continue; }
    // se il salvataggio non riesce (di solito lo spazio è pieno) è inutile provare con le altre
    try { await DB.put("foto", f); } catch (e) { errSalva = e; break; }
    indicizzaFoto(f); n++;
  }
  if (errSalva) toast(errSalva.name === "QuotaExceededError" ? (n ? `${n} foto aggiunte, poi lo spazio del telefono è finito` : "Lo spazio del telefono è pieno: la foto non si salva")
    : (n ? `${n} foto aggiunte, le altre non si sono salvate: riprova` : "Non riesco a salvare la foto: riprova"));
  if (!n) { if (!errSalva) toast(illeggibili > 1 ? "Non riesco a leggere queste foto" : "Non riesco a leggere questa foto"); return; }
  if (!errSalva) toast(n === 1 ? "Foto aggiunta" : `${n} foto aggiunte${illeggibili ? `, ${illeggibili} non si leggono` : ""}`);
  clearTimeout(tPremi); tPremi = setTimeout(controllaPremi, 600);
  programmaStat();
  if (pila[pila.length - 1] === top) {
    const y = $("#sheet").scrollTop;
    const box = $("#album"), prima = new Set([...box.querySelectorAll("[data-foto]")].map(x => x.dataset.foto));
    const tmp = document.createElement("div"); tmp.innerHTML = htmlFoto(k);
    const nuovo = tmp.lastElementChild; nuovo.classList.add("fermo");
    nuovo.querySelectorAll("[data-foto]").forEach(x => { if (!prima.has(x.dataset.foto)) x.classList.add("nuova"); });
    box.previousElementSibling.replaceWith(tmp.firstElementChild); box.replaceWith(nuovo);
    $("#f-foto").addEventListener("change", e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) aggiungiFoto(k, fs, top); });
    $("#album").addEventListener("click", e => { const b = e.target.closest("[data-foto]"); if (b) apriFoto(k, b.dataset.foto, top); });
    $("#sheet").scrollTop = y;
  }
  if (k.startsWith("p:")) { const c = k.slice(2); dati.paesi[c] = dati.paesi[c] || { s: null, mezzi: [] }; salva(); }
}
const urlGrandi = new Map();
function liberaGrandi() { const v = [...urlGrandi.values()]; urlGrandi.clear(); setTimeout(() => v.forEach(u => URL.revokeObjectURL(u)), 600); }
function apriFoto(k, id, top) {
  const f = (FOTO.get(k) || []).find(x => x.id === id); if (!f) return;
  tocco();
  if (!urlGrandi.has(id)) urlGrandi.set(id, URL.createObjectURL(f.blob));
  const v = $("#viewer");
  v.innerHTML = `<button class="vx" data-x aria-label="Chiudi">${ICO.x}</button><img src="${urlGrandi.get(id)}" alt="">
    <div class="vbar"><button data-del>Elimina</button></div>`;
  history.pushState({ l: pila.length, foto: 1 }, ""); viewerAperto = true;
  requestAnimationFrame(() => v.classList.add("on"));
  v.querySelector("[data-x]").onclick = () => { if (viewerAperto) history.back(); };
  v.onclick = e => { if (e.target === v && viewerAperto) history.back(); };
  v.querySelector("[data-del]").onclick = async e => {
    const b = e.currentTarget;
    if (!armato(b, "Tocca ancora per eliminare")) return;
    // se non si cancella davvero, resta anche qui (prima spariva e poi tornava alla riapertura)
    try { await DB.del("foto", id); } catch (er) { toast(DB.bloccato ? "Non salvo niente: prima riapri l'app" : "Non riesco a eliminare la foto: riprova"); return; }
    FOTO.set(k, (FOTO.get(k) || []).filter(x => x.id !== id));
    if (!FOTO.get(k).length) FOTO.delete(k);
    if (k.startsWith("p:")) { pulisciVuoto(k.slice(2)); salva(); }
    if (viewerAperto) history.back();
    setTimeout(() => { if (pila[pila.length - 1] === top) { top.scroll = $("#sheet").scrollTop; mostra(false); } }, 60);
    toast("Foto eliminata");
  };
}

/* ---------- Statistiche anonime (per Sasha) ----------
   Ogni telefono manda al progetto Firebase di Viatrix un riepilogo senza nomi: paesi segnati (solo i codici),
   quante città e foto, livello, mezzi, se è sulla Home, primo e ultimo giorno di uso. Mai città, date dei viaggi, foto o note.
   Le regole del database fanno leggere tutto solo a Sasha, che entra con email e password nella sua sezione. */
const VERSIONE_APP = "3.0";
const FB = window.VIATRIX_FIREBASE || {};
const statAttive = () => !!(FB.progetto && FB.chiaveWeb);
const FS_DOC = p => `https://firestore.googleapis.com/v1/projects/${FB.progetto}/databases/(default)/documents/${p}`;
const leggiLS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const scriviLS = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const oggiISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let ID_MEM = null;
function idDispositivo() {
  if (ID_MEM) return ID_MEM;
  let id = leggiLS("viatrix-id");
  if (!id || !/^[a-z0-9]{20,40}$/.test(id)) {
    const b = new Uint8Array(18); crypto.getRandomValues(b);
    id = [...b].map(x => x.toString(36).padStart(2, "0")).join("").slice(0, 28);
    scriviLS("viatrix-id", id);
    if (leggiLS("viatrix-id") !== id) return null;   // finestra privata o dati bloccati
  }
  return (ID_MEM = id);
}
// valori nel formato di Firestore
const fsV = v => typeof v === "boolean" ? { booleanValue: v } : Number.isInteger(v) ? { integerValue: String(v) } : typeof v === "string" ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: v.length ? { values: v.map(fsV) } : {} } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsV(x)])) } };
const daFS = v => !v ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? +v.integerValue : "booleanValue" in v ? v.booleanValue
  : "arrayValue" in v ? (v.arrayValue.values || []).map(daFS) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, daFS(x)])) : null;
let tStat = null;
function programmaStat(ms) { if (!FB.progetto || DB.bloccato) return; clearTimeout(tStat); tStat = setTimeout(inviaStat, ms ?? 8000); }
async function inviaStat() {
  if (!FB.progetto || !navigator.onLine || !PAESI.length) return;
  const id = idDispositivo(); if (!id) return;
  try {
    const S = statistiche();
    const lista = s => Object.keys(S.st).filter(c => S.st[c] === s).sort();
    if (!leggiLS("viatrix-primo")) scriviLS("viatrix-primo", oggiISO());
    const doc = {
      v: VERSIONE_APP, casa: installata(), os: suIOS() ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "altro",
      primo: leggiLS("viatrix-primo") || oggiISO(), ultimo: oggiISO(), aperture: Math.min(999999, +leggiLS("viatrix-aperture") || 1),
      paesi: lista("v"), vivo: lista("l"), sogni: lista("w"),
      citta: S.nCitta, foto: S.nFoto, giorni: Math.min(99999, S.gg), livello: livello(S.n).i, trofei: TROFEI.filter(t => t[4](S)).length,
      mezzi: Object.fromEntries([...S.mz.entries()].filter(([m]) => proprio(MZ, m)).slice(0, 12))
    };
    await fetch(FS_DOC("dispositivi/" + id), { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, fsV(v)])) }) });
  } catch (e) {}
}

/* Accesso di Sasha (Firebase Authentication con email e password, senza librerie) */
let tokenAdmin = null;
const adminDentro = () => !!tokenAdmin || !!leggiLS("viatrix-admin");
async function entraAdmin(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FB.chiaveWeb)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || "errore");
  scriviLS("viatrix-admin", d.refreshToken);
  tokenAdmin = { id: d.idToken, scade: Date.now() + (+d.expiresIn - 60) * 1000 };
}
async function tokenValido() {
  if (tokenAdmin && Date.now() < tokenAdmin.scade) return tokenAdmin.id;
  const rt = leggiLS("viatrix-admin"); if (!rt) throw new Error("fuori");
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FB.chiaveWeb)}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(rt) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 400) scriviLS("viatrix-admin", null); throw new Error(r.status === 400 ? "fuori" : "rete"); }
  scriviLS("viatrix-admin", d.refresh_token);
  tokenAdmin = { id: d.id_token, scade: Date.now() + (+d.expires_in - 60) * 1000 };
  return tokenAdmin.id;
}
async function leggiDispositivi() {
  const tok = await tokenValido(), out = [];
  let pt = "";
  for (let i = 0; i < 20; i++) {
    const r = await fetch(FS_DOC("dispositivi") + `?pageSize=300${pt ? "&pageToken=" + encodeURIComponent(pt) : ""}`, { headers: { Authorization: "Bearer " + tok } });
    if (r.status === 403) throw new Error("permesso");
    if (!r.ok) throw new Error("rete");
    const d = await r.json();
    (d.documents || []).forEach(x => out.push(pulisciRiepilogo(x.name.split("/").pop(), Object.fromEntries(Object.entries(x.fields || {}).map(([k, v]) => [k, daFS(v)])))));
    if (!d.nextPageToken) break; pt = d.nextPageToken;
    if (i === 19) out.tagliato = true;
  }
  return out;
}

/* I riepiloghi arrivano da telefoni sconosciuti: si tiene solo ciò che ha la forma giusta (codici veri, numeri interi) */
const intero = (n, max) => Number.isInteger(n) && n >= 0 ? Math.min(n, max) : 0;
const codiciVeri = l => Array.isArray(l) ? [...new Set(l.filter(c => typeof c === "string" && CODICE.test(c) && proprio(P, c)))] : [];
const giornoOk = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
function pulisciRiepilogo(id, x) {
  const mz = x.mezzi && typeof x.mezzi === "object" && !Array.isArray(x.mezzi) ? x.mezzi : {};
  return { id, v: typeof x.v === "string" ? x.v.slice(0, 10) : "", casa: x.casa === true, os: ["ios", "android", "altro"].includes(x.os) ? x.os : "altro",
    primo: giornoOk(x.primo), ultimo: giornoOk(x.ultimo), paesi: codiciVeri(x.paesi), vivo: codiciVeri(x.vivo), sogni: codiciVeri(x.sogni),
    citta: intero(x.citta, 1e5), foto: intero(x.foto, 1e6), giorni: intero(x.giorni, 1e5), livello: intero(x.livello, LIVELLI.length - 1),
    mezzi: Object.fromEntries(Object.entries(mz).filter(([m, n]) => proprio(MZ, m) && Number.isInteger(n) && n >= 0).map(([m, n]) => [m, Math.min(n, 1e5)])) };
}
function htmlStat() {
  if (!adminDentro()) return `${barraFoglio()}<div class="sh-body">
    <h2 style="font-size:28px;margin-top:4px">Statistiche</h2>
    <p class="piccolo" style="margin-top:6px">Sezione solo per te: entra con l'account che hai creato su Firebase.</p>
    <form id="f-adm" class="adm-form" autocomplete="on">
      <div class="card campi" style="grid-template-columns:1fr">
        <div class="campo"><label for="adm-e">Email</label><input id="adm-e" type="email" autocomplete="username" required></div>
        <div class="campo"><label for="adm-p">Password</label><input id="adm-p" type="password" autocomplete="current-password" required></div>
      </div>
      <button class="btn pieno" id="adm-ok" type="submit">Entra</button>
      <p class="piccolo" id="adm-err" role="alert"></p>
    </form></div>`;
  return `${barraFoglio()}<div class="sh-body">
    <div class="kicker" style="margin-top:4px">Solo per te</div><h2 style="font-size:28px">Statistiche</h2>
    <div id="stat-box"><div class="vuoto">Carico i numeri…</div></div>
    <button class="btn ghost" id="adm-esci" style="margin-top:22px">Esci dalle statistiche</button>
  </div>`;
}
function collegaStat() {
  const f = $("#f-adm");
  if (f) {
    f.addEventListener("submit", async e => {
      e.preventDefault(); const b = $("#adm-ok"); b.disabled = true; b.textContent = "Entro…"; $("#adm-err").textContent = "";
      try { await entraAdmin($("#adm-e").value.trim(), $("#adm-p").value); tocco(); mostra(true); }
      catch (er) {
        const m = String(er.message);
        $("#adm-err").textContent = /INVALID|PASSWORD|EMAIL_NOT_FOUND|USER/.test(m) ? "Email o password sbagliate." : /TOO_MANY/.test(m) ? "Troppi tentativi: riprova tra qualche minuto." : "Non riesco a entrare: serve internet.";
        b.disabled = false; b.textContent = "Entra";
      }
    });
    return;
  }
  $("#adm-esci").addEventListener("click", () => { tocco(); scriviLS("viatrix-admin", null); tokenAdmin = null; indietro(); toast("Statistiche chiuse"); });
  caricaStat();
}
async function caricaStat() {
  const box = $("#stat-box");
  let l;
  try { l = await leggiDispositivi(); }
  catch (e) {
    if (!$("#stat-box")) return;
    if (e.message === "fuori") { box.innerHTML = `<div class="vuoto">L'accesso è scaduto: esci e rientra.</div>`; return; }
    box.innerHTML = `<div class="vuoto">${e.message === "permesso" ? "Il database non ti fa leggere: controlla le regole su Firebase." : "Non riesco a leggere i numeri: serve internet."}</div>`;
    return;
  }
  if (!$("#stat-box")) return;
  if (!l.length) { box.innerHTML = `<div class="vuoto"><b>Ancora nessuno</b>I numeri compaiono quando qualcuno apre l'app.</div>`; return; }
  const oggi = giornoN(oggiISO()), da = s => s ? oggi - giornoN(s) : 9999;
  const conta = k => { const m = new Map(); l.forEach(x => x[k].forEach(c => m.set(c, (m.get(c) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1] || P[a[0]].n.localeCompare(P[b[0]].n, "it")); };
  const vis = conta("paesi"), sogni = conta("sogni"), vivo = conta("vivo");
  const somma = k => l.reduce((a, x) => a + x[k], 0);
  const nPaesi = l.reduce((a, x) => a + x.paesi.length + x.vivo.length, 0);
  const mz = new Map(); l.forEach(x => Object.entries(x.mezzi).forEach(([m, n]) => mz.set(m, (mz.get(m) || 0) + n)));
  const mzL = [...mz.entries()].sort((a, b) => b[1] - a[1]);
  const liv = new Map(); l.forEach(x => liv.set(x.livello, (liv.get(x.livello) || 0) + 1));
  const io = idDispositivo();
  const classifica = (righe, cv) => { const max = righe[0]?.[1] || 1; return righe.slice(0, 10).map(([c, n]) => `<div class="mz"><span class="e">${bandiera(c)}</span>
    <div>${esc(nomeCorto(c))}<div class="barra" style="--bc:var(${cv})"><i style="--f:0" data-f="${n / max}"></i></div></div><span>${n === 1 ? "1 persona" : esc(n) + " persone"}</span></div>`).join(""); };
  box.innerHTML = `
    <section class="hero" style="grid-template-columns:1fr;margin-top:14px">
      <div class="hero-t"><b class="pct">${l.length}</b><h2>${l.length === 1 ? "persona usa Viatrix" : "persone usano Viatrix"}</h2>
      <p>${l.filter(x => da(x.ultimo) <= 7).length} attive negli ultimi 7 giorni · ${l.filter(x => x.casa).length} sulla schermata Home</p>
      <p>${l.filter(x => da(x.primo) <= 7).length} nuove questa settimana${l.some(x => x.id === io) ? " · compreso questo telefono" : ""}</p></div>
    </section>
    <canvas id="stat-mappa" class="stat-mappa" aria-label="Mappa: più è scuro, più persone ci sono state"></canvas>
    <div class="tiles">
      ${tile("🌍", nPaesi, "paesi segnati in tutto", 1, true)}
      ${tile("🏙️", somma("citta"), "città", 2, true)}
      ${tile("📷", somma("foto"), "foto", 3, true)}
      ${tile("🗓️", somma("giorni"), "giorni in viaggio", 4, true)}
    </div>
    ${vis.length ? `<div class="sez-h">Paesi più visitati</div><div class="cont-st mezzi-st" style="padding:14px 16px">${classifica(vis, "--v")}</div>` : ""}
    ${sogni.length ? `<div class="sez-h">Paesi più sognati</div><div class="cont-st mezzi-st" style="padding:14px 16px">${classifica(sogni, "--w")}</div>` : ""}
    ${vivo.length ? `<div class="sez-h">Dove vivono</div><div class="cont-st mezzi-st" style="padding:14px 16px">${classifica(vivo, "--l")}</div>` : ""}
    <div class="sez-h">Livelli</div><div class="cont-st">${[...liv.entries()].sort((a, b) => b[0] - a[0]).map(([i, n]) => `<div class="r"><div>${LIVELLI[i][1]} ${LIVELLI[i][2]}<span>${n === 1 ? "1 persona" : esc(n) + " persone"}</span></div></div>`).join("")}</div>
    ${mzL.length ? `<div class="sez-h">Mezzi più usati</div><div class="cont-st mezzi-st" style="padding:14px 16px">${mzL.map(([m, n]) => `<div class="mz"><span class="e">${MZ[m][1]}</span>
      <div>${MZ[m][2]}<div class="barra"><i style="--f:0" data-f="${n / (mzL[0][1] || 1)}"></i></div></div><span>${esc(n)}</span></div>`).join("")}</div>` : ""}
    <div class="sez-h">Telefoni</div><div class="cont-st">
      <div class="r"><div>iPhone<span>${l.filter(x => x.os === "ios").length}</span></div></div>
      <div class="r"><div>Android<span>${l.filter(x => x.os === "android").length}</span></div></div>
      ${l.some(x => x.os === "altro") ? `<div class="r"><div>Computer o altro<span>${l.filter(x => x.os === "altro").length}</span></div></div>` : ""}
      <div class="r"><div>Con la versione ${VERSIONE_APP}<span>${l.filter(x => x.v === VERSIONE_APP).length} di ${l.length}</span></div></div></div>
    <p class="piccolo">Numeri anonimi: niente nomi, città, date, foto o note. Si aggiornano quando qualcuno apre l'app.${l.tagliato ? " Elenco tagliato: ci sono più di 6.000 riepiloghi, si vedono i primi." : ""}</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$("#stat-box .barra i").forEach(b => b.style.setProperty("--f", b.dataset.f))));
  $$("#stat-box .tile b[data-n]").forEach(b => contaSu(b, 0, +b.dataset.n, x => Math.round(x).toLocaleString("it-IT")));
  const tutti = new Map(vis); vivo.forEach(([c, n]) => tutti.set(c, (tutti.get(c) || 0) + n));
  disegnaMappaStat(tutti);
}
// piccola mappa del mondo: più persone ci sono state, più il paese è scuro
function disegnaMappaStat(conti) {
  const cv = $("#stat-mappa"); if (!cv || !M.feats.length) return;
  const w = cv.clientWidth || 340, dpr = Math.min(3, devicePixelRatio || 1);
  let [x0, y0, x1, y1] = [1e9, 1e9, -1e9, -1e9];
  M.feats.forEach(f => { x0 = Math.min(x0, f.b[0][0]); y0 = Math.min(y0, f.b[0][1]); x1 = Math.max(x1, f.b[1][0]); y1 = Math.max(y1, f.b[1][1]); });
  const s = (w - 16) / (x1 - x0), h = Math.round((y1 - y0) * s + 16);
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + "px";
  const ctx = cv.getContext("2d"), max = Math.max(1, ...conti.values());
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (8 - x0 * s), dpr * (8 - y0 * s));
  ctx.lineWidth = .6 / s; ctx.strokeStyle = COL.line; ctx.lineJoin = "round";
  for (const f of M.feats) {
    const n = conti.get(f.c) || 0;
    ctx.fillStyle = n ? d3.interpolateRgb(COL.land, COL.v)(.35 + .65 * n / max) : COL.land;
    ctx.fill(f.p); ctx.stroke(f.p);
  }
}

/* ---------- Avviso: mettila sulla schermata Home ----------
   Aperta da Safari (non dalla Home) l'iPhone può cancellare i dati di un sito che non si apre per qualche settimana:
   per questo, finché non è sulla Home, compare un cartoncino con i passi. "Più tardi" lo rimanda di 3 giorni. */
// su Android la copia scaricata o arrivata da WhatsApp/Drive può avere un altro tipo: senza questi non si potrebbe sceglierla
const ACCETTA_COPIA = "application/json,.json,text/plain,application/octet-stream";
/* Android (Chrome, Samsung Internet): il telefono offre l'installazione con un tocco. Si tiene l'invito
   e nel cartoncino compare il pulsante "Installa Viatrix" (i passi a mano restano sotto, se non funziona). */
let invitoInstalla = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); invitoInstalla = e; pulsanteInstalla(); });
addEventListener("appinstalled", () => { invitoInstalla = null; if ($("#home-av [data-installa]")) chiudiCartoncino(); });
function pulsanteInstalla() {
  const el = $("#home-av"), dopo = el.querySelector("[data-dopo]");
  if (!invitoInstalla || !el.querySelector(".ha-passi.android") || el.querySelector("[data-installa]") || !dopo) return;
  const b = document.createElement("button"); b.className = "btn pieno ha-btn"; b.dataset.installa = ""; b.textContent = "Installa Viatrix";
  b.onclick = async () => {
    tocco(); const inv = invitoInstalla; if (!inv) return;
    invitoInstalla = null;
    try { inv.prompt(); const r = await inv.userChoice; if (r && r.outcome === "accepted") { scriviLS("viatrix-home-dopo", String(Date.now() + 3 * 864e5)); chiudiCartoncino(); return; } } catch (e) {}
    b.remove();   // rifiutato o non disponibile: restano i passi a mano
  };
  el.insertBefore(b, dopo);
}
const installata = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const suIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const suTelefono = () => suIOS() || /Android/.test(navigator.userAgent);
const ciSonoDati = () => Object.keys(dati.paesi).length > 0 || Object.keys(dati.citta).length > 0 || FOTO.size > 0 || Object.keys(dati.meraviglie || {}).length > 0;
function avvisoHome(forza) {
  if (installata() || (!forza && !suTelefono())) return false;
  if (!forza && Date.now() < (+leggiLS("viatrix-home-dopo") || 0)) return false;
  const el = $("#home-av");
  // Su iPhone l'app sulla Home ha un archivio suo, separato da Safari: quello che è segnato qui non passa da solo.
  const daPortare = suIOS() && ciSonoDati();
  const passi = suIOS()
    ? [[ICO.condividi, "Tocca <b>Condividi</b>", "il quadrato con la freccia nella barra di Safari (se non lo vedi, prima i tre puntini «…»)"],
       [ICO.aggHome, "Scegli <b>Aggiungi alla schermata Home</b>", "se non c'è, scorri un po' l'elenco"],
       [`<img src="icona-180.png" alt="">`, "Apri <b>Viatrix</b> dalla Home", "da lì è un'app vera, anche senza internet"]]
    : /SamsungBrowser/.test(navigator.userAgent)
    ? [["≡", "Apri il <b>menu</b> di Samsung Internet", "le tre righe in basso a destra"],
       [ICO.aggHome, "Scegli <b>Aggiungi pagina a</b>, poi <b>Schermata Home</b>", ""],
       [`<img src="icona-180.png" alt="">`, "Apri <b>Viatrix</b> dalla Home", "da lì è un'app vera, anche senza internet"]]
    : [["⋮", "Apri il <b>menu</b> del browser", "i tre puntini vicino all'indirizzo"],
       [ICO.aggHome, "Scegli <b>Installa app</b> o <b>Aggiungi a schermata Home</b>", ""],
       [`<img src="icona-180.png" alt="">`, "Apri <b>Viatrix</b> dalla Home", "da lì è un'app vera, anche senza internet"]];
  if (daPortare) {
    passi.unshift([ICO.salva, "Prima tocca <b>Salva una copia</b>", "qui sotto, e tienila per esempio su iCloud Drive"]);
    passi.push(["↺", "Nell'app scegli <b>Ripristina da una copia</b>", "Impostazioni, la rotellina in Numeri"]);
  }
  el.innerHTML = `<button class="x" data-x aria-label="Chiudi">${ICO.x}</button>
    <div class="ha-t"><b>Mettila sulla schermata Home</b><span>${daPortare
      ? "Così si apre come un'app vera, anche senza internet. Attenzione: l'app sulla Home parte vuota, i viaggi segnati qui non passano da soli. Per portarli, una copia:"
      : `Così si apre come un'app vera, anche senza internet. Aperta solo da ${suIOS() ? "Safari" : "browser"}, il telefono potrebbe cancellare i dati dopo qualche settimana.`}</span></div>
    <ol class="ha-passi${suIOS() ? "" : " android"}">${passi.map((p, i) => `<li style="--i:${i}"><span class="ha-ic">${p[0]}</span><div>${p[1]}${p[2] ? `<small>${p[2]}</small>` : ""}</div></li>`).join("")}</ol>
    ${daPortare ? `<button class="btn pieno ha-btn" data-copia>Salva una copia</button>` : ""}
    <button class="ha-dopo" data-dopo>Più tardi</button>`;
  const chiudi = () => {
    tocco();
    scriviLS("viatrix-home-dopo", String(Date.now() + 3 * 864e5));
    el.classList.remove("on"); document.documentElement.classList.remove("avviso-home");
  };
  el.querySelector("[data-x]").onclick = chiudi;
  el.querySelector("[data-dopo]").onclick = chiudi;
  el.querySelector("[data-copia]")?.addEventListener("click", esportaCopia);
  pulsanteInstalla();
  apriCartoncino(el);
  return true;
}
function apriCartoncino(el) {
  document.documentElement.classList.add("avviso-home");
  requestAnimationFrame(() => el.classList.add("on"));
}
function chiudiCartoncino() { $("#home-av").classList.remove("on"); document.documentElement.classList.remove("avviso-home"); }
/* Nell'app sulla Home, con la mappa ancora vuota: se i viaggi sono stati segnati prima in Safari, si riportano con una copia.
   Compare solo su iPhone, solo con la mappa vuota, e con "No, grazie" non torna più. */
function avvisoCopia() {
  if (!installata() || !suIOS() || ciSonoDati() || leggiLS("viatrix-copia-no") || !DB.db) return false;
  const el = $("#home-av");
  el.innerHTML = `<button class="x" data-x aria-label="Chiudi">${ICO.x}</button>
    <div class="ha-t"><b>Hai già segnato dei viaggi in Safari?</b><span>L'app sulla Home ha un archivio suo: se in Safari hai salvato una copia, riportala qui e ritrovi tutto.</span></div>
    <label class="btn pieno ha-btn">Ripristina una copia<input type="file" accept="${ACCETTA_COPIA}" data-file hidden></label>
    <button class="ha-dopo" data-dopo>No, grazie: comincio da zero</button>`;
  const via = () => { tocco(); scriviLS("viatrix-copia-no", "1"); chiudiCartoncino(); };
  el.querySelector("[data-x]").onclick = via;
  el.querySelector("[data-dopo]").onclick = via;
  el.querySelector("[data-file]").addEventListener("change", e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    chiudiCartoncino(); apriLivello({ tipo: "imp" }); chiediRipristino(f);
  });
  apriCartoncino(el);
  return true;
}
/* I dati salvati non si sono letti (succede di rado, se l'archivio del telefono non risponde):
   l'app non scrive niente per non cancellarli, e chiede di riaprirla. */
let tLettura = 0;
function avvisoLettura(subito) {
  if (!subito) { if (Date.now() - tLettura > 4000) { tLettura = Date.now(); toast("Non salvo niente: prima riapri l'app, così ritrovi i tuoi viaggi"); } return; }
  const el = $("#home-av");
  el.innerHTML = `<div class="ha-t" style="padding-right:0"><b>Non riesco a leggere i tuoi viaggi</b><span>Sono ancora sul telefono, ma l'archivio non ha risposto. Per non cancellarli non salvo niente finché non riapri l'app.</span></div>
    <button class="btn pieno ha-btn" data-riprova>Riapri l'app</button>`;
  el.querySelector("[data-riprova]").onclick = () => { tocco(); location.reload(); };
  apriCartoncino(el);
}

/* ---------- Tocco e avvisi ---------- */
function tocco() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
let tt;
function toast(t) {
  const el = $("#toast");
  el.textContent = t;
  el.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => el.classList.remove("on"), 2400);
}

/* ---------- Avvio ---------- */
document.addEventListener("gesturestart", e => e.preventDefault());
document.addEventListener("gesturechange", e => e.preventDefault());
$$(".tab").forEach(b => b.onclick = () => vai(b.dataset.tab));
$("#m-reset").onclick = vediTutto;
$("#m-pct").onclick = () => vai("numeri");
$$(".vista.scorre").forEach(v => {
  let attesa = false;
  v.addEventListener("scroll", () => { if (attesa) return; attesa = true; requestAnimationFrame(() => { barraTitolo(); attesa = false; }); }, { passive: true });
});
/* Tastiera dell'iPhone: il campo scelto resta visibile (nel foglio a metà prima si apre del tutto) */
document.addEventListener("focusin", e => { if (e.target.closest?.("#sheet.meta") && e.target.matches("input:not([type=date]):not([type=file]),textarea")) espandi(); });
document.addEventListener("focusin", e => {
  const c = e.target.closest("textarea,input[type=search]"); if (!c) return;
  // se il foglio si sta allargando (0,55 secondi) si aspetta che sia fermo
  setTimeout(() => c.scrollIntoView({ block: "center", behavior: pocoMoto() ? "auto" : "smooth" }), Date.now() - espansoAlle < 150 ? 650 : 320);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { leggiColori(); richiedi(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) globoAttivo?.riparti?.(); else { salvaSubito(); if (tStat) { clearTimeout(tStat); tStat = null; inviaStat(); } } });
addEventListener("pagehide", salvaSubito);

(async () => {
  leggiColori();
  $("#mappa").innerHTML = `<div class="caric">Preparo la mappa…</div>`;
  const entro = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error("tempo")), ms))]);
  try { await entro(DB.open(), 4000); }
  catch (e) { if (e.message === "tempo") DB.bloccato = true; else toast("Il telefono non lascia salvare i dati: forse è una finestra privata"); }
  if (DB.db && !DB.bloccato) {
    // Lettura dei dati salvati, con due tentativi in più (su iPhone a volte l'archivio risponde in ritardo).
    // Se non si leggono, l'app parte ma NON salva niente: altrimenti la mappa vuota cancellerebbe quella vera.
    for (let i = 0; ; i++) {
      try {
        const d = await entro(DB.get("stato", "dati"), 4000), foto = await entro(DB.all("foto"), 4000);
        if (d) dati = { paesi: d.paesi || {}, citta: d.citta || {}, visti: d.visti, liv: d.liv || 0, meraviglie: d.meraviglie || {} };
        sistemaDate(dati);
        FOTO.clear(); foto.forEach(indicizzaFoto);
        break;
      } catch (e) {
        if (i < 2) { await new Promise(r => setTimeout(r, 400 * (i + 1))); continue; }
        DB.bloccato = true; break;
      }
    }
    if (!DB.bloccato && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  try {
    const [pa, mo] = await Promise.all([fetch(`data/paesi.json?v=${DATI_V}`).then(r => r.json()), fetch(`data/mondo.json?v=${DATI_V}`).then(r => r.json())]);
    PAESI = pa; P = Object.fromEntries(pa.map(p => [p.c, p]));
    MONDO = topojson.feature(mo, mo.objects.countries).features;
    // forme che passano la linea del cambio di data (Russia, Figi): se risultano "rovesciate" si girano i bordi
    MONDO.forEach(f => { if (d3.geoArea(f) > 2 * Math.PI) { const g = f.geometry; (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach(p => { if (d3.geoArea({ type: "Polygon", coordinates: p }) > 2 * Math.PI) p.forEach(r => r.reverse()); }); } });
    MONDO = separaOltremare(MONDO);
  } catch (e) {
    $("#mappa").innerHTML = `<div class="caric">Non riesco a caricare la mappa: controlla internet e riapri l'app.</div>`;
    return;
  }
  preparaMappa();
  M.st = stati();
  if (!pocoMoto()) { M.intro = performance.now() + 120; document.documentElement.classList.add("avvio"); setTimeout(() => document.documentElement.classList.remove("avvio"), 2600); }
  vistaIniziale();
  aggiornaTesta();
  if (DB.bloccato) { avvisoLettura(true); return; }   // niente premi, statistiche o altri avvisi finché non si riapre
  if (!Array.isArray(dati.visti)) controllaPremi();
  setTimeout(() => { if (!pila.length) avvisoHome() || avvisoCopia(); }, 2400);
  scriviLS("viatrix-aperture", String((+leggiLS("viatrix-aperture") || 0) + 1));
  programmaStat(3000);
})();

if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude|anthropic/.test(location.hostname)) navigator.serviceWorker.register("sw.js").catch(() => {});
