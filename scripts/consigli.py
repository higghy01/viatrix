"""Prepara i "Da non perdere" di Viatrix: per ogni paese i luoghi più famosi (Wikidata), con nome e descrizione
in italiano, foto (Wikimedia Commons), coordinate e pagina Wikipedia. La fama = in quante lingue c'è la pagina Wikipedia.

Uso: python consigli.py <cartella dell'app> [parte totale] [--salta]   (scrive data/consigli/XX.json, uno per paese)
   parte/totale: divide i paesi tra più copie in parallelo (es. 0 3, 1 3, 2 3); --salta: non rifà i paesi già pronti
Fonte: QLever (copia veloce e pubblica di Wikidata, Università di Friburgo). Dati Wikidata: CC0.
Riga di ogni luogo: [id Wikidata, nome, descrizione, lat, lon, foto, titolo it.wikipedia, titolo en.wikipedia, fama, tipo]
"""
import sys, os, json, time, re, urllib.request, urllib.parse
OUT = sys.argv[1]
ARG = [x for x in sys.argv[2:] if not x.startswith("--")]
PARTE, TOT = (int(ARG[0]), int(ARG[1])) if len(ARG) == 2 else (0, 1)
SALTA = "--salta" in sys.argv
EP = "https://qlever.cs.uni-freiburg.de/api/wikidata"
PREF = """PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""
# tipi di luogo → icona nell'app
TIPI = {
  "museo": "Q33506 Q207694 Q2772772 Q1007870 Q17431399 Q588140", "chiesa": "Q2977 Q16970 Q163687 Q160742 Q44613 Q120560 Q56242215",
  "tempio": "Q44539 Q32815 Q842402 Q34627 Q5393308", "castello": "Q23413 Q57821 Q1785071 Q91122 Q83405", "palazzo": "Q16560 Q53536964 Q751876",
  "rovine": "Q839954 Q15661340 Q54831 Q1081138 Q473972 Q109607", "piazza": "Q174782 Q1440300", "ponte": "Q12280", "torre": "Q12518 Q11303 Q1068842",
  "monumento": "Q4989906 Q179700 Q16952 Q575759 Q483453", "parco": "Q22698 Q1107656 Q46169 Q473972 Q43501 Q2416723 Q2281788",
  "montagna": "Q8502 Q8072 Q35666 Q150784 Q133056", "acqua": "Q23397 Q34038 Q40080 Q35509", "citta": "Q676050 Q15243209 Q5084",
  "teatro": "Q153562 Q24354 Q2065736", "luogo": "Q570116"}
CLASSE = {q: t for t, qs in TIPI.items() for q in qs.split()}
VAL = " ".join("wd:" + q for q in CLASSE)

def sparql(q, tentativi=40):
    # QLever a volte è pieno (429): si aspetta e si riprova, con calma
    for k in range(tentativi):
        try:
            req = urllib.request.Request(EP + "?" + urllib.parse.urlencode({"query": PREF + q}),
                headers={"User-Agent": "Viatrix-dati/1.0 (https://github.com/higghy01/viatrix)", "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:
            time.sleep(10 if "429" in str(e) else 5 * min(k + 1, 6))
    raise RuntimeError("QLever non risponde")

codici = {p["c"] for p in json.load(open(f"{OUT}/data/paesi.json"))}
# codice ISO (P297) → elemento Wikidata del paese (se più d'uno, il più famoso)
qid = {}
for r in sparql("SELECT ?c ?iso ?l WHERE { ?c wdt:P297 ?iso ; wikibase:sitelinks ?l . }"):
    iso, c, l = r["iso"]["value"], r["c"]["value"].rsplit("/", 1)[1], int(r["l"]["value"])
    if iso in codici and (iso not in qid or l > qid[iso][1]): qid[iso] = (c, l)
print(len(qid), "paesi trovati su", len(codici))
os.makedirs(f"{OUT}/data/consigli", exist_ok=True)
titolo = lambda u: urllib.parse.unquote(u.rsplit("/wiki/", 1)[1]).replace("_", " ") if u else ""
for n, cc in enumerate(sorted(qid)):
    if n % TOT != PARTE or (SALTA and os.path.exists(f"{OUT}/data/consigli/{cc}.json")): continue
    q = f"""SELECT ?item (SAMPLE(?lab) AS ?nome) (SAMPLE(?d) AS ?desc) (SAMPLE(?co) AS ?coord) (SAMPLE(?im) AS ?img) (MAX(?l) AS ?links)
  (SAMPLE(?ait) AS ?it) (SAMPLE(?aen) AS ?en) (SAMPLE(?cl) AS ?classe) (COUNT(DISTINCT ?pa) AS ?np) WHERE {{
  {{ SELECT DISTINCT ?item ?l WHERE {{
    {{ VALUES ?cl0 {{ {VAL} }} ?item wdt:P31 ?cl0 }} UNION {{ ?item wdt:P1435 wd:Q9259 }}
    ?item wdt:P17 wd:{qid[cc][0]} ; wikibase:sitelinks ?l . FILTER(?l >= 5)
    FILTER NOT EXISTS {{ ?item wdt:P1082 ?pop }}
  }} ORDER BY DESC(?l) LIMIT 220 }}
  ?item wdt:P625 ?co ; wdt:P17 ?pa .
  OPTIONAL {{ VALUES ?cl {{ {VAL} }} ?item wdt:P31 ?cl }}
  OPTIONAL {{ ?item wdt:P18 ?im }}
  OPTIONAL {{ ?item schema:description ?d FILTER(lang(?d) = "it") }}
  OPTIONAL {{ ?item rdfs:label ?lit FILTER(lang(?lit) = "it") }}
  OPTIONAL {{ ?item rdfs:label ?len FILTER(lang(?len) = "en") }}
  BIND(COALESCE(?lit, ?len) AS ?lab)
  OPTIONAL {{ ?ait schema:about ?item ; schema:isPartOf <https://it.wikipedia.org/> }}
  OPTIONAL {{ ?aen schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }}
}} GROUP BY ?item"""
    righe = []
    for r in sparql(q):
        v = lambda k: r.get(k, {}).get("value", "")
        m = re.match(r"point\(([-\d.eE]+) ([-\d.eE]+)\)", v("coord"), re.I)
        if not m or not v("nome") or int(v("np") or 9) > 3: continue      # niente siti sparsi in tanti paesi
        nome = v("nome")
        if re.fullmatch(r"Q\d+", nome): continue
        img = v("img").rsplit("/", 1)[-1] if v("img") else ""
        righe.append([v("item").rsplit("/", 1)[1], nome[:80], v("desc")[:140], round(float(m.group(2)), 4), round(float(m.group(1)), 4),
                      urllib.parse.unquote(img), titolo(v("it")), titolo(v("en")), int(v("links")), CLASSE.get(v("classe").rsplit("/", 1)[-1], "luogo")])
    righe.sort(key=lambda x: -x[8])
    json.dump(righe, open(f"{OUT}/data/consigli/{cc}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{n + 1}/{len(qid)} {cc}: {len(righe)} luoghi" + (f" (primo: {righe[0][1]})" if righe else ""), flush=True)
    time.sleep(1)
# territori senza codice su Wikidata: file vuoto, così l'app non chiede file che non esistono
for cc in sorted(codici - set(qid)):
    json.dump([], open(f"{OUT}/data/consigli/{cc}.json", "w"))
    print("vuoto:", cc)
