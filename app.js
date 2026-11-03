/* Viatrix — i posti in cui sei stata, sulla mappa.
   Tutto resta sul telefono (IndexedDB): paesi, città, viaggi e foto. Niente account, niente server. */
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pocoMoto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOLLA = "cubic-bezier(.32,.72,0,1)";
const norm = s => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, " ").trim();
const bandiera = c => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt(0))) : "🏳️";

/* ---------- Cose fisse ---------- */
const STATI = {
  v: { t: "Visitato", e: "📍", cv: "--v" },
  l: { t: "Ci vivo", e: "🏡", cv: "--l" },
  w: { t: "Vorrei andarci", e: "✨", cv: "--w" }
};
const RANGO = { l: 3, v: 2, w: 1 };
const MEZZI = [["aereo", "✈️", "Aereo"], ["treno", "🚆", "Treno"], ["auto", "🚗", "Auto"], ["nave", "⛴️", "Nave"], ["bus", "🚌", "Pullman"],
  ["camper", "🚐", "Camper"], ["moto", "🏍️", "Moto"], ["bici", "🚲", "Bici"], ["piedi", "🥾", "A piedi"]];
const MZ = Object.fromEntries(MEZZI.map(m => [m[0], m]));
const CONT = { eu: "Europa", as: "Asia", af: "Africa", na: "America del Nord", sa: "America del Sud", oc: "Oceania", an: "Antartide" };
const ORDINE_CONT = ["eu", "as", "af", "na", "sa", "oc", "an"];

const ICO = {
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  vai: `<svg class="vai" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  piu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  cerca: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  foto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
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
      r.onsuccess = () => { this.db = r.result; ok(); };
      r.onerror = () => ko(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((ok, ko) => {
      if (!this.db) { ko(new Error("niente archivio")); return; }
      const t = this.db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    });
  },
  get: (s, k) => DB.tx(s, "readonly", st => st.get(k)),
  all: s => DB.tx(s, "readonly", st => st.getAll()),
  put: (s, v, k) => DB.tx(s, "readwrite", st => k === undefined ? st.put(v) : st.put(v, k)),
  del: (s, k) => DB.tx(s, "readwrite", st => st.delete(k)),
  // ripristino: tutto in un colpo, o non cambia niente
  sostituisci(dati, foto) {
    return new Promise((ok, ko) => {
      const t = this.db.transaction(["stato", "foto"], "readwrite");
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
  clearTimeout(tSalva);
  const fai = () => DB.put("stato", dati, "dati").catch(() => toast("Non riesco a salvare: lo spazio del telefono è pieno?"));
  if (subito) fai(); else tSalva = setTimeout(fai, 250);
}
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
  return { st, vis, onu, tot, pct: onu.length / tot, area: vis.reduce((a, p) => a + p.a, 0) / areaTot,
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

/* ---------- Colori dal foglio di stile ---------- */
let COL = {};
function leggiColori() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  COL = { land: g("--land"), line: g("--land-line"), v: g("--v"), l: g("--l"), w: g("--w"), ink: g("--ink"), ocean: g("--ocean"), ocean2: g("--ocean-2"), surface: g("--surface") };
}
const colore = s => s ? COL[s] : COL.land;

/* =====================================================================
   MAPPA DEL MONDO
   Disegnata su canvas: i paesi sono preparati una volta sola (Path2D),
   poi a ogni movimento si ridisegna solo con un'altra scala: fluida anche col pinch.
   ===================================================================== */
const M = { feats: [], byC: {}, W: 0, H: 0, dpr: 1, t: d3.zoomIdentity, raf: 0, anim: new Map(), onde: [], flash: null };
let MONDO = null;
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
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { const t = M.t; misura(); M.sel.call(M.zoom.transform, t); }, 150); });
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
  M.proj = proj;
  M.feats = MONDO.map(f => {
    const b = gp.bounds(f);
    return { c: f.properties.c, f, p: new Path2D(gp(f) || ""), b, a: (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]), cen: proj(d3.geoCentroid(f)) };
  });
  M.byC = {};
  for (const x of M.feats) (M.byC[x.c] = M.byC[x.c] || []).push(x);
  M.sfera = new Path2D(gp({ type: "Sphere" }));
  M.grat = new Path2D(gp(d3.geoGraticule10()));
  M.zoom && M.zoom.extent([[0, 0], [W, H]]).translateExtent([[-W * .3, -H * .1], [W * 1.3, H * 1.1]]);
  richiedi();
}
const richiedi = () => { if (!M.raf) M.raf = requestAnimationFrame(disegna); };
// paesi piccoli o senza forma (Malta, Vaticano, isole): un pallino se sono segnati
const PICCOLO = 6;   // pixel a zoom 1
function puntiPiccoli(st) {
  const out = [];
  for (const p of PAESI) {
    const s = st[p.c]; if (!s) continue;
    const fs = M.byC[p.c];
    const big = fs && fs.some(x => Math.max(x.b[1][0] - x.b[0][0], x.b[1][1] - x.b[0][1]) * M.t.k >= PICCOLO);
    if (big) continue;
    const xy = fs ? fs.reduce((a, x) => x.a > a.a ? x : a).cen : M.proj([p.ll[1], p.ll[0]]);
    if (xy && isFinite(xy[0])) out.push({ c: p.c, s, xy });
  }
  return out;
}
function disegna(now) {
  M.raf = 0;
  const { ctx, dpr, t, W, H } = M;
  now = now || performance.now();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
  // globo e reticolo leggero
  ctx.fillStyle = COL.ocean; ctx.globalAlpha = .55; ctx.fill(M.sfera); ctx.globalAlpha = 1;
  ctx.lineWidth = .8 / t.k; ctx.strokeStyle = COL.ink; ctx.globalAlpha = .06; ctx.stroke(M.grat); ctx.globalAlpha = 1;
  // paesi (solo quelli che si vedono)
  const x0 = -t.x / t.k, y0 = -t.y / t.k, x1 = (W - t.x) / t.k, y1 = (H - t.y) / t.k;
  const st = M.st || {};
  let vivo = false;
  ctx.lineWidth = .7 / t.k; ctx.strokeStyle = COL.line; ctx.lineJoin = "round";
  for (const f of M.feats) {
    if (f.b[1][0] < x0 || f.b[0][0] > x1 || f.b[1][1] < y0 || f.b[0][1] > y1) continue;
    const a = M.anim.get(f.c);
    let col = colore(st[f.c]);
    if (a) { const k = Math.min(1, (now - a.t0) / 700); col = d3.interpolateRgb(a.da, col)(d3.easeCubicOut(k)); if (k < 1) vivo = true; else M.anim.delete(f.c); }
    ctx.fillStyle = col; ctx.fill(f.p); ctx.stroke(f.p);
  }
  // tocco: il paese si illumina un attimo
  if (M.flash) {
    const k = (now - M.flash.t0) / 450;
    if (k < 1) { ctx.globalAlpha = .35 * (1 - k); ctx.fillStyle = "#fff"; (M.byC[M.flash.c] || []).forEach(f => ctx.fill(f.p)); ctx.globalAlpha = 1; vivo = true; } else M.flash = null;
  }
  // pallini dei paesi piccoli (grandezza fissa sullo schermo)
  for (const d of puntiPiccoli(st)) {
    ctx.beginPath(); ctx.arc(d.xy[0], d.xy[1], 4.5 / t.k, 0, 7);
    ctx.fillStyle = COL[d.s]; ctx.fill(); ctx.lineWidth = 1.5 / t.k; ctx.strokeStyle = COL.line; ctx.stroke();
  }
  // onde quando si segna un paese nuovo
  M.onde = M.onde.filter(o => {
    const k = (now - o.t0) / 1100; if (k >= 1) return false;
    vivo = true; if (k < 0) return true;
    const e = d3.easeCubicOut(k);
    ctx.beginPath(); ctx.arc(o.xy[0], o.xy[1], (8 + 70 * e) / t.k, 0, 7);
    ctx.lineWidth = 2.5 / t.k; ctx.strokeStyle = COL[o.s]; ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1;
    vivo = true; return true;
  });
  if (vivo) richiedi();
}
function cambiaColore(c, primaS) {
  M.st = stati();
  if ((M.st[c] || null) !== (primaS || null) && !pocoMoto()) M.anim.set(c, { da: colore(primaS), t0: performance.now() });
  richiedi();
}
function onda(c, s) {
  if (pocoMoto()) return;
  const fs = M.byC[c], p = P[c];
  const xy = fs ? fs.reduce((a, x) => x.a > a.a ? x : a).cen : p && M.proj([p.ll[1], p.ll[0]]);
  if (xy) { M.onde.push({ xy, s, t0: performance.now() + 250 }); richiedi(); }
}
function tocca(e) {
  if (e.defaultPrevented) return;
  const r = M.cv.getBoundingClientRect(), t = M.t;
  const px = (e.clientX - r.left - t.x) / t.k, py = (e.clientY - r.top - t.y) / t.k;
  // prima i pallini dei paesi piccoli, poi le forme (dalla più piccola: le isole dentro i laghi, il Vaticano…)
  let hit = null, best = 1e9;
  for (const d of puntiPiccoli(M.st || {})) {
    const dd = Math.hypot((d.xy[0] - px) * t.k, (d.xy[1] - py) * t.k);
    if (dd < 18 && dd < best) { best = dd; hit = d.c; }
  }
  if (!hit) {
    const ctx = M.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cand = M.feats.filter(f => px >= f.b[0][0] && px <= f.b[1][0] && py >= f.b[0][1] && py <= f.b[1][1]).sort((a, b) => a.a - b.a);
    for (const f of cand) if (ctx.isPointInPath(f.p, px, py)) { hit = f.c; break; }
    ctx.restore();
  }
  if (!hit || !P[hit]) return;
  tocco();
  M.flash = { c: hit, t0: performance.now() }; richiedi();
  setTimeout(() => apriLivello({ tipo: "paese", c: hit }), 90);
}
function vediTutto() {
  tocco();
  M.sel.transition().duration(pocoMoto() ? 0 : 750).ease(d3.easeCubicInOut).call(M.zoom.transform, d3.zoomIdentity);
}
// all'apertura: i paesi segnati in vista, oppure l'Europa
function vistaIniziale() {
  const st = M.st || {};
  let fs = M.feats.filter(f => st[f.c] === "v" || st[f.c] === "l");
  if (!fs.length) fs = M.byC.IT || [];
  // per i paesi con territori lontani (Francia, Stati Uniti…) basta la forma più grande
  const tenuti = Object.values(fs.reduce((m, f) => { if (!m[f.c] || f.a > m[f.c].a) m[f.c] = f; return m; }, {}));
  if (!tenuti.length) return;
  let [x0, y0, x1, y1] = [1e9, 1e9, -1e9, -1e9];
  tenuti.forEach(f => { x0 = Math.min(x0, f.b[0][0]); y0 = Math.min(y0, f.b[0][1]); x1 = Math.max(x1, f.b[1][0]); y1 = Math.max(y1, f.b[1][1]); });
  const { W, H } = M, top = Math.min(150, H * .2), bot = Math.min(110, H * .14);
  const pad = 40, aw = W - 2 * pad, ah = H - top - bot - 2 * pad;
  let k = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0));
  k = Math.max(1, Math.min(st && Object.keys(st).length ? 5 : 3.2, k * .9));
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
    pctPrima = pct;
  }
  $("#m-sub").textContent = `${k.onu.length} su ${k.tot} paesi`;
  $("#legenda").innerHTML = ["v", "l", "w"].map(s => {
    const n = s === "v" ? k.vis.length - k.l : s === "l" ? k.l : k.w;
    return n ? `<span class="leg" style="--c:var(${STATI[s].cv})"><i></i>${STATI[s].t} <b>${n}</b></span>` : "";
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
    html += `<section class="cont${entrata ? " entra" : ""}" style="--i:${Math.min(i++, 5)}"><div class="cont-h"><h2>${CONT[k]}</h2>${onu.length ? `<small>${fatti} di ${onu.length} · ${pctTesto(fatti / onu.length)}</small>` : ""}</div>
      ${onu.length ? `<div class="barra"><i style="--f:${entrata ? 0 : fatti / onu.length}" data-f="${fatti / onu.length}"></i></div>` : ""}
      <div class="lista">${lista.map(p => rigaPaese(p, st[p.c], cc[p.c])).join("")}</div></section>`;
  }
  $("#elenco").innerHTML = html || `<div class="vuoto"><b>Nessun paese</b>${cerca ? "Prova a scrivere il nome in un altro modo." : "Qui compariranno i paesi che segni."}</div>`;
  if (entrata) requestAnimationFrame(() => requestAnimationFrame(() => $$("#elenco .barra i").forEach(b => b.style.setProperty("--f", b.dataset.f))));
}
function rigaPaese(p, s, nc) {
  const d = dati.paesi[p.c] || {};
  const sub = [nc ? (nc === 1 ? "1 città" : `${nc} città`) : "", fmtPeriodo(d.dal, d.al)].filter(Boolean).join(" · ");
  return `<button class="riga" data-paese="${p.c}"><span class="flag">${bandiera(p.c)}</span><span class="nm"><b>${esc(p.n)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
    ${s ? `<span class="pill ${s}" style="--c:var(${STATI[s].cv})">${STATI[s].t}</span>` : ICO.vai}</button>`;
}

/* ---------- Numeri ---------- */
function disegnaNumeri(entrata) {
  const k = conti(), v = $("#v-numeri");
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
  const nCont = cont.filter(x => x.f).length;
  const mz = {};
  [...Object.values(dati.paesi), ...Object.values(dati.citta)].forEach(x => (x.mezzi || []).forEach(m => mz[m] = (mz[m] || 0) + 1));
  const mzL = Object.entries(mz).filter(([m]) => MZ[m]).sort((a, b) => b[1] - a[1]);
  const mzMax = mzL.length ? mzL[0][1] : 1;
  const ultimi = [...Object.entries(dati.paesi).map(([c, d]) => ({ tipo: "paese", c, d, n: P[c]?.n })), ...Object.values(dati.citta).map(d => ({ tipo: "citta", c: d.c, d, n: d.n }))]
    .filter(x => x.d.dal && x.n && x.d.s !== "w").sort((a, b) => (b.d.dal || "").localeCompare(a.d.dal || "")).slice(0, 8);
  const anni = per.length ? new Date(per[0][0] * 864e5).getUTCFullYear() : null;

  v.innerHTML = `<header class="top"><div><div class="kicker">${anni ? `In viaggio dal ${anni}` : "Il mio mondo"}</div><h1>Numeri</h1></div>
      <button class="round-btn" id="b-imp" aria-label="Impostazioni">${ICO.ingr}</button></header>
    <section class="hero${entrata ? " entra" : ""}">
      <div class="ring-wrap"><svg class="big-ring" viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="50"/>
        <circle class="fg" id="n-ring" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>
        <div class="in"><b id="n-pct">0%</b></div></div>
      <div><h2>del mondo visitato</h2><p>${k.onu.length} paesi su ${k.tot}${nCont ? ` · ${nCont === 1 ? "1 continente" : nCont + " continenti"}` : ""}</p>
      <p>${pctTesto(k.area)} della terra emersa</p></div>
    </section>
    <div class="tiles">
      ${tile("🏙️", citta.length, "città", 1, entrata)}
      ${tile("🗓️", gg, gg === 1 ? "giorno in viaggio" : "giorni in viaggio", 2, entrata)}
      ${tile("📷", nFoto, "foto", 3, entrata)}
      ${tile("✨", k.w, k.w === 1 ? "paese da vedere" : "paesi da vedere", 4, entrata)}
    </div>
    <div class="sez-h">Continenti</div>
    <div class="cont-st${entrata ? " entra" : ""}" style="--i:3">${cont.map(x => `<div class="r"><div>${CONT[x.c]}<span>${x.f} di ${x.n}</span></div>
      <div class="barra"><i style="--f:0" data-f="${x.f / x.n}"></i></div></div>`).join("")}</div>
    ${mzL.length ? `<div class="sez-h">Come viaggi</div><div class="cont-st mezzi-st" style="padding:14px 16px">${mzL.map(([m, n]) => `<div class="mz"><span class="e">${MZ[m][1]}</span>
      <div>${MZ[m][2]}<div class="barra"><i style="--f:0" data-f="${n / mzMax}"></i></div></div><span>${n}</span></div>`).join("")}</div>` : ""}
    ${ultimi.length ? `<div class="sez-h">Ultimi viaggi</div><div class="viaggi">${ultimi.map(x => {
      const f = (FOTO.get(x.tipo === "paese" ? keyPaese(x.c) : keyCitta(x.d.id)) || [])[0];
      return `<button class="vg" ${x.tipo === "paese" ? `data-paese="${x.c}"` : `data-citta="${esc(x.d.id)}"`}><span class="ic">${f ? `<img src="${f.mini}" alt="">` : bandiera(x.c)}</span>
        <span class="nm"><b>${esc(x.n)}</b><small>${esc(fmtPeriodo(x.d.dal, x.d.al))}</small></span><span class="mzs">${(x.d.mezzi || []).map(m => MZ[m]?.[1] || "").join("")}</span></button>`;
    }).join("")}</div>` : ""}
    ${!k.vis.length ? `<div class="vuoto"><b>Ancora niente</b>Segna sulla mappa i paesi in cui sei stata: qui compariranno i tuoi numeri.</div>` : ""}
    <p class="about">Viatrix · i tuoi dati restano solo su questo telefono</p>`;
  $("#b-imp").onclick = () => { tocco(); apriLivello({ tipo: "imp" }); };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("#n-ring").style.strokeDashoffset = 100 - Math.max(k.pct > 0 ? 2 : 0, k.pct * 100);
    $$("#v-numeri .barra i").forEach(b => b.style.setProperty("--f", b.dataset.f));
  }));
  contaSu($("#n-pct"), entrata ? 0 : k.pct * 100, k.pct * 100, x => pctTesto(x / 100));
  if (entrata) $$("#v-numeri .tile b[data-n]").forEach(b => contaSu(b, 0, +b.dataset.n, x => Math.round(x).toLocaleString("it-IT")));
}
const tile = (e, n, t, i, entrata) => `<div class="tile${entrata ? " entra" : ""}" style="--i:${i}"><span class="e">${e}</span><b data-n="${n}">${n.toLocaleString("it-IT")}</b><span>${t}</span></div>`;

/* =====================================================================
   FOGLI DAL BASSO (a livelli: paese → città → …)
   Ogni livello è un passo nella cronologia: il gesto "indietro" torna su.
   ===================================================================== */
const pila = [];
let viewerAperto = false;
function apriLivello(l) {
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
window.addEventListener("popstate", () => {
  const st = history.state || {};
  if (viewerAperto && !st.foto) { viewerAperto = false; $("#viewer").classList.remove("on"); liberaGrandi(); }
  const l = st.l || 0;
  if (l < pila.length) { pila.length = l; if (l === 0) chiudiFoglio(); else mostra(false); }
});
const COLORI_BARRA = $$('meta[name="theme-color"]').map(m => [m, m.content]);
function sfondo(on) {
  document.documentElement.classList.toggle("aperto", on);
  COLORI_BARRA.forEach(([m]) => { if (on) { m.dataset.c = m.content; m.content = "#000000"; } else if (m.dataset.c) m.content = m.dataset.c; });
}
function mostra(avanti) {
  const top = pila[pila.length - 1];
  if (!top) return;
  const sh = $("#sheet"), giaAperto = sh.classList.contains("on");
  const html = top.tipo === "paese" ? htmlPaese(top.c) : top.tipo === "citta" ? htmlCitta(top.id) : top.tipo === "scegli" ? htmlScegli(top.c) : htmlImp();
  if (html == null) { indietro(); return; }
  const fai = () => {
    sh.innerHTML = `<div class="grab"></div>` + html;
    sh.scrollTop = top.scroll || 0;
    collega(top);
  };
  if (!giaAperto) {
    fai();
    $("#scrim").classList.add("on"); sfondo(true);
    requestAnimationFrame(() => sh.classList.add("on"));
  } else if (pocoMoto() || !sh.animate) fai();
  else {
    // cambio di livello dentro il foglio: dissolvenza con un piccolo movimento in verticale (mai di lato)
    sh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out" }).onfinish = () => {
      fai();
      sh.animate([{ opacity: 0, transform: `translateY(${avanti ? 10 : -6}px)` }, { opacity: 1, transform: "none" }], { duration: 300, easing: MOLLA });
    };
  }
}
function chiudiFoglio() {
  pila.length = 0;
  $("#sheet").classList.remove("on");
  $("#scrim").classList.remove("on");
  sfondo(false);
  liberaGrandi();
  aggiornaTutto();
}
$("#scrim").onclick = () => chiudiTutto();
document.addEventListener("keydown", e => { if (e.key === "Escape" && (pila.length || viewerAperto)) history.back(); });
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
      sh.classList.add("drag"); root.classList.add("trascina");
      sh.style.transform = `translateY(${dy}px)`;
      root.style.setProperty("--p", Math.max(0, 1 - dy / Math.max(300, sh.offsetHeight)).toFixed(3));
    } else if (sh.classList.contains("drag")) { sh.classList.remove("drag"); root.classList.remove("trascina"); sh.style.transform = ""; root.style.removeProperty("--p"); }
  }, { passive: true });
  sh.addEventListener("touchend", () => {
    if (y0 === null) return;
    sh.classList.remove("drag"); root.classList.remove("trascina"); sh.style.transform = ""; root.style.removeProperty("--p");
    if (dy > 110 || (dy > 30 && vel > .6)) chiudiTutto();
    y0 = null;
  });
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
    `<button data-stato="${k}" aria-pressed="${s === k}" style="--c:var(${x.cv})"><span class="e">${x.e}</span>${x.t}</button>`).join("")}</div>
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
    <div class="blk-h">${vivo ? "Come ti sposti" : "Come ci sei andata"}</div>
    <div class="mezzi">${MEZZI.map(([k, e, t]) => `<button class="chip-m" data-mezzo="${k}" aria-pressed="${(d.mezzi || []).includes(k)}"><span class="e">${e}</span>${t}</button>`).join("")}</div>`;
}
function htmlFoto(k) {
  const l = FOTO.get(k) || [];
  return `<div class="blk-h">Foto <small>${l.length ? (l.length === 1 ? "1 foto" : `${l.length} foto`) : ""}</small></div>
    <div class="album" id="album">${l.map((f, i) => `<button class="ph" data-foto="${esc(f.id)}" style="animation-delay:${Math.min(i, 8) * 30}ms"><img src="${f.mini}" alt=""></button>`).join("")}
      <label class="add">${ICO.foto}<span>Aggiungi</span><input type="file" accept="image/*" multiple id="f-foto"></label></div>`;
}
const htmlNota = d => `<div class="blk-h">Note</div><textarea class="nota" id="f-nota" placeholder="Un ricordo, un posto dove hai mangiato bene…" maxlength="2000">${esc(d.nota || "")}</textarea>`;

/* ---------- Mini mappa del paese (con le città) ---------- */
function miniMappa(c, selId) {
  const p = P[c]; if (!p) return "";
  const W = 640, H = 400;
  const fs = M.byC[c] || [];
  // si inquadra la parte principale del paese (niente territori lontani: Guyana francese, Hawaii…)
  let obiettivo;
  if (fs.length) {
    const polys = [];
    fs.forEach(x => { const g = x.f.geometry; (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach(co => polys.push({ type: "Polygon", coordinates: co })); });
    polys.forEach(q => { q.ar = d3.geoArea(q); q.ce = d3.geoCentroid(q); });
    const big = polys.reduce((a, q) => q.ar > a.ar ? q : a);
    const vicini = polys.filter(q => q === big || (q.ar > big.ar * .004 && d3.geoDistance(q.ce, big.ce) < .22));
    obiettivo = { type: "GeometryCollection", geometries: vicini };
  } else obiettivo = d3.geoCircle().center([p.ll[1], p.ll[0]]).radius(1.2)();
  const ce = d3.geoCentroid(obiettivo);
  const proj = d3.geoMercator().rotate([-ce[0], 0]).fitExtent([[36, 36], [W - 36, H - 36]], obiettivo);
  // se il paese è piccolissimo, un po' di contorno
  if (proj.scale() > 9000) proj.scale(9000).translate([W / 2, H / 2]).center([0, ce[1]]).rotate([-ce[0], 0]);
  const gp = d3.geoPath(proj);
  const s = statoPaese(c);
  const nb = new Set(p.b || []);
  // vicini e paesi che entrano nel riquadro
  const box = [[-40, -40], [W + 40, H + 40]];
  const altri = M.feats.filter(f => f.c !== c && (nb.has(f.c) || (() => { const b = gp.bounds(f.f); return b[1][0] > box[0][0] && b[0][0] < box[1][0] && b[1][1] > box[0][1] && b[0][1] < box[1][1] && (b[1][0] - b[0][0]) < W * 30; })()));
  const cit = cittaDi(c).filter(x => x.ll && (x.s || x.id === selId));
  const pts = cit.map(x => ({ x, xy: proj([x.ll[1], x.ll[0]]) })).filter(o => o.xy && o.xy[0] > -20 && o.xy[0] < W + 20 && o.xy[1] > -20 && o.xy[1] < H + 20);
  const etichette = pts.length <= 8 || selId;
  return `<div class="mini"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    ${altri.map(f => `<path class="vic" d="${gp(f.f)}"/>`).join("")}
    ${fs.length ? fs.map(f => `<path class="qui${s ? " s-" + s : ""}" d="${gp(f.f)}"/>`).join("") : `<circle class="qui${s ? " s-" + s : ""}" cx="${proj([p.ll[1], p.ll[0]])[0]}" cy="${proj([p.ll[1], p.ll[0]])[1]}" r="14"/>`}
    ${pts.map(o => `<circle class="cit s-${o.x.s || "w"}${o.x.id === selId ? " sel" : ""}" cx="${o.xy[0].toFixed(1)}" cy="${o.xy[1].toFixed(1)}" r="${o.x.id === selId ? 10 : 7}"/>`).join("")}
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
      ${cs.map(x => `<button class="riga" data-citta="${esc(x.id)}"><span class="dot" style="--c:var(${STATI[x.s || "w"].cv})"></span>
        <span class="nm"><b>${esc(x.n)}</b><small>${esc([x.s ? STATI[x.s].t : "", fmtPeriodo(x.dal, x.al), (x.mezzi || []).map(m => MZ[m]?.[1]).join("")].filter(Boolean).join(" · "))}</small></span>${ICO.vai}</button>`).join("")}
      <button class="add-row" data-aggiungi>${ICO.piu}Aggiungi una città</button>
    </div>
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
    ${htmlFoto(keyCitta(id))}
    ${htmlNota(x)}
    <button class="btn rosso" id="b-togli">Togli questa città</button>
  </div>`;
}

/* ---------- Scegli una città ---------- */
const CITTA = new Map();   // paese → { r, c, idx } (caricate quando servono)
async function caricaCitta(c) {
  if (CITTA.has(c)) return CITTA.get(c);
  let d = { r: [], c: [] };
  try { const r = await fetch(`data/citta/${c}.json`); if (r.ok) d = await r.json(); } catch (e) { d.errore = true; }
  d.idx = d.c.map(x => norm(x[1]) + (x[6] ? "|" + norm(x[6]) : ""));
  if (!d.errore) CITTA.set(c, d);
  return d;
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
  const box = $("#pick"); if (!box) return;
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
    const sp = statoPaese(c), prima = sp;
    dati.citta[id] = x ? { id, c, n: x[1], r: d?.r[x[5]] || "", ll: [x[2], x[3]], s: sp === "w" ? "w" : "v", mezzi: [], t: Date.now() }
      : { id, c, n: String($("#qc").value).trim().slice(0, 60), r: "", ll: null, s: sp === "w" ? "w" : "v", mezzi: [], t: Date.now() };
    salva(true);
    dopoCambio(c, prima);
  }
  tocco();
  sostituisciLivello({ tipo: "citta", id });
}

/* ---------- Impostazioni ---------- */
function htmlImp() {
  let tema = "auto"; try { tema = localStorage.getItem("viatrix-tema") || "auto"; } catch (e) {}
  return `${barraFoglio()}<div class="sh-body">
    <h2 style="font-size:28px;margin-top:4px">Impostazioni</h2>
    <div class="blk-h">Aspetto</div>
    <div class="opz" id="tema">${[["auto", "Automatico"], ["light", "Chiaro"], ["dark", "Scuro"]].map(([k, t]) => `<button data-tema="${k}" aria-pressed="${tema === k}">${t}</button>`).join("")}</div>
    <div class="blk-h">I tuoi dati</div>
    <p class="piccolo" style="margin-top:0">Paesi, città e foto restano <b>solo su questo telefono</b>. Ogni tanto salva una copia (per esempio su iCloud Drive): serve se cambi telefono.</p>
    <button class="btn pieno" id="b-salva">Salva una copia</button>
    <label class="btn ghost" style="cursor:pointer">Ripristina da una copia<input type="file" accept="application/json,.json" id="b-file" hidden></label>
    <div id="b-conf"></div>
    <button class="btn rosso" id="b-canc" style="margin-top:28px">Cancella tutto</button>
    <p class="about">Viatrix · versione 1<br>Mappa: Natural Earth · Città: GeoNames</p>
  </div>`;
}

/* ---------- Collegare i comandi del foglio ---------- */
function collega(top) {
  const sh = $("#sheet");
  sh.querySelector("[data-chiudi]")?.addEventListener("click", () => { tocco(); chiudiTutto(); });
  sh.querySelector("[data-back]")?.addEventListener("click", () => { tocco(); indietro(); });
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
}
function collegaLuogo(top) {
  const sh = $("#sheet");
  const paese = top.tipo === "paese";
  const c = paese ? top.c : dati.citta[top.id]?.c;
  const kFoto = paese ? keyPaese(c) : keyCitta(top.id);
  const rec = () => paese ? (dati.paesi[c] = dati.paesi[c] || { s: null, mezzi: [] }) : dati.citta[top.id];
  // stato: visitato / ci vivo / vorrei andarci
  sh.querySelector(".seg").addEventListener("click", e => {
    const b = e.target.closest("[data-stato]"); if (!b) return;
    tocco();
    const d = rec(), prima = statoPaese(c), primaPct = conti().pct;
    d.s = d.s === b.dataset.stato ? null : b.dataset.stato;
    if (paese) pulisciVuoto(c);
    salva(true);
    $$(".seg [data-stato]").forEach(x => x.setAttribute("aria-pressed", x.dataset.stato === (d.s || "")));
    $("#st-hint").textContent = suggerimento(d.s, paese ? statoPaese(c) : null);
    const vb = $("#viaggio"), nuovo = htmlViaggio(d), cera = vb.innerHTML.trim() !== "";
    vb.innerHTML = nuovo; collegaViaggio(rec);
    if (nuovo && !cera && vb.animate && !pocoMoto()) vb.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: MOLLA });
    aggiornaMini(top);
    dopoCambio(c, prima);
    const dopo = statoPaese(c), k = conti();
    if ((dopo === "v" || dopo === "l") && prima !== "v" && prima !== "l") toast(k.pct > primaPct ? `🎉 Nuovo paese! Ora sei al ${pctTesto(k.pct)} del mondo` : `🎉 ${paese ? P[c].n : dati.citta[top.id].n} è sulla tua mappa`);
  });
  collegaViaggio(rec);
  // foto
  $("#f-foto").addEventListener("change", e => { const files = [...e.target.files]; e.target.value = ""; if (files.length) aggiungiFoto(kFoto, files, top); });
  $("#album").addEventListener("click", e => { const b = e.target.closest("[data-foto]"); if (b) apriFoto(kFoto, b.dataset.foto, top); });
  // note
  let tn; $("#f-nota").addEventListener("input", e => { clearTimeout(tn); tn = setTimeout(() => { rec().nota = e.target.value.slice(0, 2000); if (paese) pulisciVuoto(c); salva(); }, 300); });
  if (paese) {
    sh.querySelector("[data-aggiungi]").addEventListener("click", () => { tocco(); apriLivello({ tipo: "scegli", c }); });
    sh.querySelectorAll(".citta [data-citta]").forEach(b => b.addEventListener("click", () => { tocco(); apriLivello({ tipo: "citta", id: b.dataset.citta }); }));
  } else {
    $("#b-togli").addEventListener("click", async e => {
      const b = e.currentTarget;
      if (!b.classList.contains("sicuro")) { b.classList.add("sicuro"); b.textContent = "Tocca ancora per togliere"; tocco(); return; }
      const prima = statoPaese(c);
      for (const f of FOTO.get(kFoto) || []) await DB.del("foto", f.id).catch(() => {});
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
  const aggiornaDurata = () => {
    const d = rec(); const vb = $("#viaggio"); const y = $("#sheet").scrollTop;
    vb.innerHTML = htmlViaggio(d); collegaViaggio(rec); $("#sheet").scrollTop = y;
  };
  dal.addEventListener("change", () => { const d = rec(); d.dal = dal.value || null; if (d.al && d.dal && d.al < d.dal) d.al = d.dal; salva(); aggiornaDurata(); dopoCambio(null); });
  al.addEventListener("change", () => { const d = rec(); d.al = al.value || null; if (d.al && d.dal && d.al < d.dal) d.dal = d.al; salva(); aggiornaDurata(); dopoCambio(null); });
  $("#viaggio [data-nodate]")?.addEventListener("click", () => { tocco(); const d = rec(); d.dal = d.al = null; salva(); aggiornaDurata(); dopoCambio(null); });
  $$("#viaggio [data-mezzo]").forEach(b => b.addEventListener("click", () => {
    tocco();
    const d = rec(), m = b.dataset.mezzo; d.mezzi = d.mezzi || [];
    d.mezzi = d.mezzi.includes(m) ? d.mezzi.filter(x => x !== m) : [...d.mezzi, m];
    b.setAttribute("aria-pressed", d.mezzi.includes(m));
    const e = b.querySelector(".e"); if (e && e.animate && !pocoMoto() && d.mezzi.includes(m)) e.animate([{ transform: "scale(1)" }, { transform: "scale(1.35) rotate(-8deg)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
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
function dopoCambio(c, primaS) {
  if (c) cambiaColore(c, primaS);
  if (c && (statoPaese(c) === "v" || statoPaese(c) === "l") && primaS !== "v" && primaS !== "l") onda(c, statoPaese(c));
  aggiornaTesta();
}
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
  try { if (t === "auto") localStorage.removeItem("viatrix-tema"); else localStorage.setItem("viatrix-tema", t); } catch (e) {}
  const scuro = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  COLORI_BARRA.forEach(([m, orig]) => {
    if (t === "auto") { const md = orig === "#0D1118" ? "(prefers-color-scheme: dark)" : "(prefers-color-scheme: light)"; m.setAttribute("media", md); m.dataset.c = orig; }
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
  $("#b-file").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) chiediRipristino(f); });
  $("#b-canc").addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!b.classList.contains("sicuro")) { b.classList.add("sicuro"); b.textContent = "Tocca ancora: cancella paesi, città e foto"; tocco(); return; }
    try {
      await DB.sostituisci({ paesi: {}, citta: {} }, []);
      dati = { paesi: {}, citta: {} }; FOTO.clear(); pctPrima = -1;
      chiudiTutto(); toast("Tutto cancellato");
    } catch (er) { toast("Non riesco a cancellare"); }
  });
}
const blobInData = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
async function esportaCopia() {
  const b = $("#b-salva"); b.textContent = "Preparo la copia…"; b.disabled = true;
  try {
    const testa = JSON.stringify({ app: "viatrix", versione: 1, creata: new Date().toISOString(), dati });
    const pezzi = [testa.slice(0, -1) + ',"foto":['];
    const foto = await DB.all("foto");
    for (let k = 0; k < foto.length; k++) {
      const f = foto[k];
      pezzi.push((k ? "," : "") + JSON.stringify({ id: f.id, k: f.k, t: f.t, mini: f.mini, data: await blobInData(f.blob) }));
    }
    pezzi.push("]}");
    const nome = `viatrix-copia-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File(pezzi, nome, { type: "application/json" });
    let fatta = true;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Copia di Viatrix" }); }
      catch (e) { if (e.name === "AbortError") fatta = false; else throw e; }
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    if (fatta) toast("Copia pronta");
  } catch (e) { toast("Non riesco a fare la copia"); }
  b.textContent = "Salva una copia"; b.disabled = false;
}
const CODICE = /^[A-Z]{2}$/;
function pulisciDati(d) {
  const out = { paesi: {}, citta: {} };
  const data = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const st = v => v === "v" || v === "l" || v === "w" ? v : null;
  const mz = v => Array.isArray(v) ? v.filter(m => MZ[m]) : [];
  const nota = v => typeof v === "string" ? v.slice(0, 2000) : "";
  for (const [c, x] of Object.entries(d?.paesi || {})) if (CODICE.test(c) && P[c] && x) out.paesi[c] = { s: st(x.s), dal: data(x.dal), al: data(x.al), mezzi: mz(x.mezzi), nota: nota(x.nota) };
  for (const x of Object.values(d?.citta || {})) {
    if (!x || typeof x.id !== "string" || !P[x.c] || typeof x.n !== "string") continue;
    const ll = Array.isArray(x.ll) && x.ll.length === 2 && x.ll.every(n => typeof n === "number" && isFinite(n)) ? x.ll : null;
    out.citta[x.id] = { id: x.id.slice(0, 40), c: x.c, n: x.n.slice(0, 60), r: typeof x.r === "string" ? x.r.slice(0, 60) : "", ll, s: st(x.s), dal: data(x.dal), al: data(x.al), mezzi: mz(x.mezzi), nota: nota(x.nota), t: +x.t || Date.now() };
  }
  return out;
}
function chiediRipristino(file) {
  const r = new FileReader();
  r.onload = () => {
    let d; try { d = JSON.parse(r.result); } catch (e) {}
    if (!d || d.app !== "viatrix" || !d.dati) { toast("Questo file non è una copia di Viatrix"); return; }
    const nd = pulisciDati(d.dati);
    $("#b-conf").innerHTML = `<div class="conf"><p>La copia ha <b>${(n => n === 1 ? "1 paese" : n + " paesi")(Object.keys(nd.paesi).length)}</b>, ${Object.keys(nd.citta).length} città e ${d.foto?.length || 0} foto. Sostituisce tutto quello che c'è adesso.</p>
      <div class="row2"><button class="btn ghost" id="r-no">Annulla</button><button class="btn pieno" id="r-si">Ripristina</button></div></div>`;
    $("#r-no").onclick = () => $("#b-conf").innerHTML = "";
    $("#r-si").onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Ripristino…";
      try {
        const chiavi = new Set([...Object.keys(nd.paesi).map(keyPaese), ...Object.keys(nd.citta).map(keyCitta)]);
        const foto = [];
        for (const f of d.foto || []) {
          if (!f || typeof f.data !== "string" || !f.data.startsWith("data:image/") || !chiavi.has(f.k)) continue;
          const mini = typeof f.mini === "string" && f.mini.startsWith("data:image/") ? f.mini : await miniDa(await (await fetch(f.data)).blob());
          foto.push({ id: String(f.id), k: f.k, t: +f.t || Date.now(), mini, blob: await (await fetch(f.data)).blob() });
        }
        await DB.sostituisci(nd, foto);
        dati = nd; FOTO.clear(); foto.forEach(indicizzaFoto); pctPrima = -1;
        chiudiTutto(); toast("Copia ripristinata");
      } catch (er) { b.disabled = false; b.textContent = "Ripristina"; toast("Ripristino non riuscito: i dati di prima sono ancora tutti qui"); }
    };
  };
  r.readAsText(file);
}

/* ---------- Foto ---------- */
function indicizzaFoto(f) { const l = FOTO.get(f.k) || []; l.push(f); l.sort((a, b) => b.t - a.t); FOTO.set(f.k, l); }
function caricaImg(blob) { return new Promise((ok, ko) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => ok({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); ko(); }; im.src = u; }); }
function suCanvas(im, lato) {
  const k = Math.min(1, lato / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); return c;
}
function quadrata(im, lato) {
  const s = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement("canvas");
  c.width = c.height = lato;
  c.getContext("2d").drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, lato, lato);
  return c.toDataURL("image/jpeg", .78);
}
async function miniDa(blob) { const { im, u } = await caricaImg(blob); const m = quadrata(im, 300); URL.revokeObjectURL(u); return m; }
async function aggiungiFoto(k, files, top) {
  toast(files.length === 1 ? "Aggiungo la foto…" : `Aggiungo ${files.length} foto…`);
  let n = 0;
  for (const file of files.slice(0, 30)) {
    try {
      const { im, u } = await caricaImg(file);
      const blob = await new Promise(ok => suCanvas(im, 1600).toBlob(ok, "image/jpeg", .82));
      const f = { id: nuovoId(), k, t: Date.now() + n, mini: quadrata(im, 300), blob };
      URL.revokeObjectURL(u);
      await DB.put("foto", f);
      indicizzaFoto(f); n++;
    } catch (e) {}
  }
  if (!n) { toast("Non riesco a leggere questa foto"); return; }
  toast(n === 1 ? "Foto aggiunta" : `${n} foto aggiunte`);
  if (pila[pila.length - 1] === top) {
    const y = $("#sheet").scrollTop;
    const box = $("#album"); const tmp = document.createElement("div"); tmp.innerHTML = htmlFoto(k);
    box.previousElementSibling.replaceWith(tmp.firstElementChild); box.replaceWith(tmp.lastElementChild);
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
  v.querySelector("[data-x]").onclick = () => history.back();
  v.onclick = e => { if (e.target === v) history.back(); };
  v.querySelector("[data-del]").onclick = async e => {
    const b = e.currentTarget;
    if (!b.classList.contains("sicuro")) { b.classList.add("sicuro"); b.textContent = "Tocca ancora per eliminare"; tocco(); return; }
    await DB.del("foto", id).catch(() => {});
    FOTO.set(k, (FOTO.get(k) || []).filter(x => x.id !== id));
    if (!FOTO.get(k).length) FOTO.delete(k);
    if (k.startsWith("p:")) pulisciVuoto(k.slice(2));
    history.back();
    setTimeout(() => { if (pila[pila.length - 1] === top) { top.scroll = $("#sheet").scrollTop; mostra(false); } }, 60);
    toast("Foto eliminata");
  };
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
/* Tastiera dell'iPhone: il campo scelto resta visibile */
document.addEventListener("focusin", e => {
  const c = e.target.closest("textarea,input[type=search]"); if (!c) return;
  setTimeout(() => c.scrollIntoView({ block: "center", behavior: pocoMoto() ? "auto" : "smooth" }), 320);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { leggiColori(); richiedi(); });

(async () => {
  leggiColori();
  $("#mappa").innerHTML = `<div class="caric">Preparo la mappa…</div>`;
  try {
    await DB.open();
    const d = await DB.get("stato", "dati");
    if (d) dati = { paesi: d.paesi || {}, citta: d.citta || {} };
    (await DB.all("foto")).forEach(indicizzaFoto);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    toast("Il telefono non lascia salvare i dati: forse è una finestra privata");
  }
  try {
    const [pa, mo] = await Promise.all([fetch("data/paesi.json").then(r => r.json()), fetch("data/mondo.json").then(r => r.json())]);
    PAESI = pa; P = Object.fromEntries(pa.map(p => [p.c, p]));
    MONDO = topojson.feature(mo, mo.objects.countries).features;
    // forme che passano la linea del cambio di data (Russia, Figi): se risultano "rovesciate" si girano i bordi
    MONDO.forEach(f => { if (d3.geoArea(f) > 2 * Math.PI) { const g = f.geometry; (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach(p => { if (d3.geoArea({ type: "Polygon", coordinates: p }) > 2 * Math.PI) p.forEach(r => r.reverse()); }); } });
  } catch (e) {
    $("#mappa").innerHTML = `<div class="caric">Non riesco a caricare la mappa: controlla internet e riapri l'app.</div>`;
    return;
  }
  preparaMappa();
  M.st = stati();
  vistaIniziale();
  aggiornaTesta();
})();

if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude|anthropic/.test(location.hostname)) navigator.serviceWorker.register("sw.js").catch(() => {});
