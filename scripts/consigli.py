"""Prepara i "Da non perdere" di Viatrix: per ogni paese i luoghi più famosi (Wikidata), con nome e descrizione
in italiano, foto (Wikimedia Commons), coordinate e pagina Wikipedia. La fama = in quante lingue c'è la pagina Wikipedia.

Uso: python consigli.py <cartella dell'app> [parte totale] [--salta]   (scrive data/consigli/XX.json, uno per paese)
   parte/totale: divide i paesi tra più copie in parallelo (es. 0 3, 1 3, 2 3); --salta: non rifà i paesi già pronti
Fonte: QLever (copia veloce e pubblica di Wikidata, Università di Friburgo). Dati Wikidata: CC0.

Riga di ogni luogo: [id Wikidata, nome, descrizione, lat, lon, foto, titolo it.wikipedia, titolo en.wikipedia, fama, tipo]
- "foto" è il percorso su Commons ("d/de/Colosseo_2020.jpg"): l'app costruisce l'indirizzo della miniatura
  https://upload.wikimedia.org/wikipedia/commons/thumb/<percorso>/<330|500|960>px-<nome> (misure standard di Wikimedia).
- Si prendono i luoghi delle categorie qui sotto e di tutte le loro sottocategorie (es. "torre dell'orologio" → torre,
  così c'è il Big Ben), più i patrimoni UNESCO; niente centri abitati (hanno la popolazione) e niente luoghi divisi tra più di 3 paesi.
- Il tipo (per l'icona) si sceglie con PRIORITA: prima castello, palazzo, chiesa…, "museo" quasi per ultimo
  (tanti castelli e palazzi sono anche musei: il Castello di Windsor deve restare "castello").
"""
import sys, os, json, time, re, hashlib, urllib.request, urllib.parse
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
TIPI = {
  "museo": "Q33506", "castello": "Q23413 Q57821", "palazzo": "Q16560", "chiesa": "Q16970 Q2977 Q160742 Q44613",
  "tempio": "Q44539 Q32815 Q34627 Q1370598", "teatro": "Q24354 Q153562", "torre": "Q12518 Q11303", "ponte": "Q12280",
  "piazza": "Q174782", "monumento": "Q4989906 Q179700 Q483453", "rovine": "Q839954 Q15661340 Q109607",
  "citta": "Q676050 Q15243209", "parco": "Q22698 Q1107656 Q46169 Q43501 Q2416723 Q2281788",
  "acqua": "Q23397 Q34038 Q40080 Q35509", "montagna": "Q8502 Q8072 Q35666 Q150784", "luogo": "Q570116"}
PRIORITA = ["castello", "palazzo", "chiesa", "tempio", "torre", "ponte", "teatro", "rovine", "piazza", "monumento",
            "citta", "parco", "acqua", "montagna", "museo", "luogo"]
CLASSE = {q: t for t, qs in TIPI.items() for q in qs.split()}
VAL = " ".join("wd:" + q for q in CLASSE)
ESTENSIONI = {"jpg", "jpeg", "png", "gif", "webp", "svg", "tif", "tiff"}

def sparql(q, tentativi=60):
    # QLever a volte è pieno (429): si aspetta e si riprova, con calma
    for k in range(tentativi):
        try:
            req = urllib.request.Request(EP + "?" + urllib.parse.urlencode({"query": PREF + q}),
                headers={"User-Agent": "Viatrix-dati/1.0 (https://github.com/higghy01/viatrix)", "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:
            time.sleep(8 if "429" in str(e) else 5 * min(k + 1, 6))
    raise RuntimeError("QLever non risponde")

def percorso_foto(url):
    """da http://commons.wikimedia.org/wiki/Special:FilePath/Nome%20file.jpg al percorso delle miniature: "d/de/Nome_file.jpg" """
    if not url: return ""
    nome = urllib.parse.unquote(url.rsplit("/", 1)[-1]).replace(" ", "_")
    if nome.rsplit(".", 1)[-1].lower() not in ESTENSIONI: return ""
    h = hashlib.md5(nome.encode("utf-8")).hexdigest()
    return f"{h[0]}/{h[:2]}/{nome}"

titolo = lambda u: urllib.parse.unquote(u.rsplit("/wiki/", 1)[1]).replace("_", " ") if u else ""

def luoghi(qid):
    q = f"""SELECT ?item (SAMPLE(?lab) AS ?nome) (SAMPLE(?d) AS ?desc) (SAMPLE(?co) AS ?coord) (SAMPLE(?im) AS ?img) (MAX(?l) AS ?links)
  (SAMPLE(?ait) AS ?it) (SAMPLE(?aen) AS ?en) (COUNT(DISTINCT ?pa) AS ?np) WHERE {{
  {{ SELECT DISTINCT ?item ?l WHERE {{
    {{ VALUES ?c0 {{ {VAL} }} ?item wdt:P31/wdt:P279* ?c0 . }} UNION {{ ?item wdt:P1435 wd:Q9259 }}
    ?item wdt:P17 wd:{qid} ; wikibase:sitelinks ?l . FILTER(?l >= 5)
    FILTER NOT EXISTS {{ ?item wdt:P1082 ?pop }}
  }} ORDER BY DESC(?l) LIMIT 220 }}
  ?item wdt:P625 ?co ; wdt:P17 ?pa .
  OPTIONAL {{ ?item wdt:P18 ?im }}
  OPTIONAL {{ ?item schema:description ?d FILTER(lang(?d) = "it") }}
  OPTIONAL {{ ?item rdfs:label ?lit FILTER(lang(?lit) = "it") }}
  OPTIONAL {{ ?item rdfs:label ?len FILTER(lang(?len) = "en") }}
  BIND(COALESCE(?lit, ?len) AS ?lab)
  OPTIONAL {{ ?ait schema:about ?item ; schema:isPartOf <https://it.wikipedia.org/> }}
  OPTIONAL {{ ?aen schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }}
}} GROUP BY ?item"""
    righe = sparql(q)
    # i tipi, con una seconda richiesta (tutte le categorie a cui appartiene ogni luogo)
    tipi = {}
    ids = [r["item"]["value"].rsplit("/", 1)[1] for r in righe]
    if ids:
        for r in sparql(f"""SELECT ?item ?cl WHERE {{ VALUES ?item {{ {' '.join('wd:' + i for i in ids)} }} VALUES ?cl {{ {VAL} }} ?item wdt:P31/wdt:P279* ?cl . }}"""):
            tipi.setdefault(r["item"]["value"].rsplit("/", 1)[1], set()).add(CLASSE[r["cl"]["value"].rsplit("/", 1)[1]])
    out = []
    for r in righe:
        v = lambda k: r.get(k, {}).get("value", "")
        m = re.match(r"point\(([-\d.eE]+) ([-\d.eE]+)\)", v("coord"), re.I)
        nome = v("nome")
        if not m or not nome or re.fullmatch(r"Q\d+", nome) or int(v("np") or 9) > 3: continue
        q_ = v("item").rsplit("/", 1)[1]
        t = next((p for p in PRIORITA if p in tipi.get(q_, ())), "luogo")
        out.append([q_, nome[:80], v("desc")[:140], round(float(m.group(2)), 4), round(float(m.group(1)), 4),
                    percorso_foto(v("img")), titolo(v("it")), titolo(v("en")), int(v("links")), t])
    out.sort(key=lambda x: -x[8])
    return out

codici = {p["c"] for p in json.load(open(f"{OUT}/data/paesi.json"))}
# codice ISO (P297) → elemento Wikidata del paese (se più d'uno, il più famoso)
qid = {}
for r in sparql("SELECT ?c ?iso ?l WHERE { ?c wdt:P297 ?iso ; wikibase:sitelinks ?l . }"):
    iso, c, l = r["iso"]["value"], r["c"]["value"].rsplit("/", 1)[1], int(r["l"]["value"])
    if iso in codici and (iso not in qid or l > qid[iso][1]): qid[iso] = (c, l)
print(len(qid), "paesi trovati su", len(codici), flush=True)
os.makedirs(f"{OUT}/data/consigli", exist_ok=True)
for n, cc in enumerate(sorted(qid)):
    if n % TOT != PARTE or (SALTA and os.path.exists(f"{OUT}/data/consigli/{cc}.json")): continue
    righe = luoghi(qid[cc][0])
    with open(f"{OUT}/data/consigli/{cc}.json.tmp", "w", encoding="utf-8") as f:
        json.dump(righe, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(f"{OUT}/data/consigli/{cc}.json.tmp", f"{OUT}/data/consigli/{cc}.json")
    print(f"{n + 1}/{len(qid)} {cc}: {len(righe)} luoghi" + (f" (primo: {righe[0][1]})" if righe else ""), flush=True)
    time.sleep(1)
# territori senza codice su Wikidata: file vuoto, così l'app non chiede file che non esistono
if PARTE == 0:
    for cc in sorted(codici - set(qid)):
        if not os.path.exists(f"{OUT}/data/consigli/{cc}.json"):
            json.dump([], open(f"{OUT}/data/consigli/{cc}.json", "w"))
            print("vuoto:", cc)
