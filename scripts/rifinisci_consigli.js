/* Ripulisce data/consigli/*.json dopo consigli.py:
   - toglie i doppioni (stesso nome entro 15 km: resta il più famoso)
   - toglie i posti che stanno dentro un ALTRO paese (es. il ghiacciaio Perito Moreno, argentino, dall'elenco del Cile)
   - toglie i fondali (banchi e monti sottomarini) che non stanno in nessun paese
   Uso: node scripts/rifinisci_consigli.js <cartella dell'app>     (usa d3 e topojson di lib/ e la mappa data/mondo.json) */
const fs = require("fs"), path = require("path");
const DIR = process.argv[2] || ".";
const d3 = require(path.resolve(DIR, "lib/d3.min.js")), topojson = require(path.resolve(DIR, "lib/topojson-client.min.js"));
const mo = JSON.parse(fs.readFileSync(path.join(DIR, "data/mondo.json")));
const feats = topojson.feature(mo, mo.objects.countries).features;
// stesse correzioni dell'app per le forme "rovesciate" (Russia, Figi)
feats.forEach(f => { if (d3.geoArea(f) > 2 * Math.PI) { const g = f.geometry; (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach(p => { if (d3.geoArea({ type: "Polygon", coordinates: p }) > 2 * Math.PI) p.forEach(r => r.reverse()); }); } });
const perPaese = {}; feats.forEach(f => (perPaese[f.properties.c] = perPaese[f.properties.c] || []).push(f));
const dentro = (fs_, p) => fs_.some(f => d3.geoContains(f, p));
const anello = p => [[0, 0], [.25, 0], [-.25, 0], [0, .25], [0, -.25], [.18, .18], [-.18, .18], [.18, -.18], [-.18, -.18]].map(([a, b]) => [p[0] + a, p[1] + b]);
const norm = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const km = (a, b) => d3.geoDistance(a, b) * 6371;
const FONDALE = /\b(bank|guyot|seamount|tablemount|sottomarin|banco|fossa|trench|ridge|dorsale)\b/i;
const territori = new Set(JSON.parse(fs.readFileSync(path.join(DIR, "data/paesi.json"))).filter(p => !p.o).map(p => p.c));
let tolti = { doppioni: 0, altroPaese: 0, fondali: 0, spostati: 0 }, esempi = [], daSpostare = {};
for (const fn of fs.readdirSync(path.join(DIR, "data/consigli")).filter(f => f.endsWith(".json"))) {
  const c = fn.slice(0, 2), file = path.join(DIR, "data/consigli", fn);
  const righe = JSON.parse(fs.readFileSync(file)), mie = perPaese[c] || [], altri = feats.filter(f => f.properties.c !== c);
  const tenuti = [];
  for (const r of righe) {
    const p = [r[4], r[3]];
    if (tenuti.some(t => norm(t[1]) === norm(r[1]) && km([t[4], t[3]], p) < 15)) { tolti.doppioni++; esempi.push(`${c} doppione: ${r[1]}`); continue; }
    if (mie.length && !anello(p).some(q => dentro(mie, q))) {
      const dove = altri.find(f => d3.geoContains(f, p));
      if (dove) {
        // un territorio d'oltremare (Nuova Caledonia, Polinesia francese…): il posto si sposta lì invece di sparire
        if (territori.has(dove.properties.c)) { (daSpostare[dove.properties.c] = daSpostare[dove.properties.c] || []).push(r); tolti.spostati++; esempi.push(`${c} → ${dove.properties.c}: ${r[1]}`); continue; }
        tolti.altroPaese++; esempi.push(`${c} in un altro paese: ${r[1]}`); continue;
      }
      if ((r[9] === "montagna" || r[9] === "acqua" || r[9] === "luogo") && FONDALE.test(r[1] + " " + r[2])) { tolti.fondali++; esempi.push(`${c} fondale: ${r[1]}`); continue; }
    }
    tenuti.push(r);
  }
  if (tenuti.length !== righe.length) fs.writeFileSync(file, JSON.stringify(tenuti));
}
for (const [c, nuove] of Object.entries(daSpostare)) {
  const file = path.join(DIR, "data/consigli", c + ".json"), d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
  const ids = new Set(d.map(r => r[0]));
  nuove.forEach(r => { if (!ids.has(r[0])) { d.push(r); ids.add(r[0]); } });
  d.sort((a, b) => b[8] - a[8]);
  fs.writeFileSync(file, JSON.stringify(d));
}
console.log(tolti);
console.log(esempi.filter(e => / → /.test(e)).slice(0, 12).join("\n"));
