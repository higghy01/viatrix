"""Prepara i dati di Viatrix: mappa del mondo, paesi in italiano, città per paese.

Uso: python prepara.py <cartella dei file scaricati> <cartella dell'app>
File da scaricare nella prima cartella:
  countries-50m.json   https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
  wc.json              https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json
  cities5000.zip, cities1000.zip, admin1CodesASCII.txt   https://download.geonames.org/export/dump/
  alt_it.tsv           nomi italiani, da alternateNamesV2.zip (stesso indirizzo):
                       unzip -p alternateNamesV2.zip alternateNamesV2.txt | awk -F'\t' '$3=="it" && $7=="" && $8=="" && $9=="" {print $2"\t"$4"\t"$5"\t"$6}' > alt_it.tsv
Dopo, per alleggerire la mappa (da 740 a 290 KB):
  npx mapshaper@0.6.102 -i data/mondo.json -simplify 35% keep-shapes -o format=topojson quantization=1e5 data/mondo.json force
  (Russia e Figi escono "rovesciate": l'app le raddrizza da sola all'avvio.)
"""
import json, sys, os, zipfile, io, collections
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(f"{OUT}/data/citta", exist_ok=True)

wc = json.load(open(f"{SRC}/wc.json"))
CONT = {"Europe": "eu", "Asia": "as", "Africa": "af", "Oceania": "oc", "Antarctic": "an"}
def continente(c):
    if c["region"] == "Americas":
        return "sa" if c["subregion"] == "South America" else "na"
    return CONT[c["region"]]

# nomi italiani delle città (GeoNames)
alt = {}
if os.path.exists(f"{SRC}/alt_it.tsv"):
    for line in open(f"{SRC}/alt_it.tsv", encoding="utf-8"):
        gid, nome, pref, short = line.rstrip("\n").split("\t")
        if gid not in alt or pref == "1":
            alt[gid] = nome

# regioni (admin1)
adm = {}
for line in open(f"{SRC}/admin1CodesASCII.txt", encoding="utf-8"):
    k, nome, ascii_, gid = line.rstrip("\n").split("\t")
    adm[k] = alt.get(gid, nome).removeprefix("Regione ")

def leggi(zipname):
    z = zipfile.ZipFile(f"{SRC}/{zipname}")
    with z.open(z.namelist()[0]) as f:
        for line in io.TextIOWrapper(f, encoding="utf-8"):
            yield line.rstrip("\n").split("\t")

DETTAGLIO = {"IT", "SM", "VA", "MT"}   # per l'Italia anche i paesi piccoli (da 1000 abitanti)
citta = collections.defaultdict(dict)
capitali = {}
for zipname, soglia in (("cities5000.zip", 5000), ("cities1000.zip", 1000)):
    for r in leggi(zipname):
        gid, nome, cc, fcode, a1, pop = r[0], r[1], r[8], r[7], r[10], int(r[14] or 0)
        if zipname == "cities1000.zip" and cc not in DETTAGLIO: continue
        if fcode in ("PPLX", "PPLH", "PPLQ", "PPLW"): continue   # quartieri e luoghi storici
        it = alt.get(gid, nome)
        if fcode == "PPLC": capitali[cc] = it
        citta[cc][gid] = (gid, it, round(float(r[4]), 3), round(float(r[5]), 3), pop, adm.get(f"{cc}.{a1}", ""), nome)

paesi = []
UN = {c["cca2"] for c in wc if c["unMember"]} | {"PS"}
C3 = {c["cca3"]: c["cca2"] for c in wc}
for c in wc:
    cc = c["cca2"]
    paesi.append({"c": cc, "n": c["translations"]["ita"]["common"], "k": continente(c),
                  "cap": capitali.get(cc, (c.get("capital") or [""])[0]), "a": round(c["area"]) if c["area"] > 0 else 0,
                  "ll": [round(x, 2) for x in c["latlng"]], "o": 1 if cc in UN else 0,
                  "b": [C3[x] for x in c.get("borders", []) if x in C3]})
    lista = sorted(citta.get(cc, {}).values(), key=lambda x: -x[4])
    reg = sorted({x[5] for x in lista if x[5]})
    ri = {n: i for i, n in enumerate(reg)}
    righe = []
    for gid, it, la, lo, pop, rg, orig in lista:
        riga = [int(gid), it, la, lo, pop, ri.get(rg, -1)]
        if orig != it: riga.append(orig)
        righe.append(riga)
    if righe:
        json.dump({"r": reg, "c": righe}, open(f"{OUT}/data/citta/{cc}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("paesi nel conto:", len(UN))
json.dump(sorted(paesi, key=lambda p: p["n"]), open(f"{OUT}/data/paesi.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# mappa: solo il codice del paese, senza Antartide
t = json.load(open(f"{SRC}/countries-50m.json"))
byn = {c["ccn3"]: c["cca2"] for c in wc if c.get("ccn3")}
NOMI = {"Kosovo": "XK", "N. Cyprus": "CY", "Somaliland": "SO", "Siachen Glacier": "IN"}
geo = []
for g in t["objects"]["countries"]["geometries"]:
    cc = byn.get(g.get("id")) or NOMI.get(g["properties"]["name"])
    if not cc or cc == "AQ": continue
    g.pop("id", None); g["properties"] = {"c": cc}
    geo.append(g)
t["objects"]["countries"]["geometries"] = geo
t["objects"].pop("land", None)
json.dump(t, open(f"{OUT}/data/mondo.json", "w"), separators=(",", ":"))
