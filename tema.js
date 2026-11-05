/* Prima di disegnare: il tema scelto nell'app (così non lampeggia) e i caratteri di riserva.
   Sta in un file a parte (non dentro la pagina) perché le regole di sicurezza della pagina permettono solo i programmi del sito. */
  try { const t = localStorage.getItem("viatrix-tema"); if (t === "light" || t === "dark") { document.documentElement.dataset.theme = t;
    // prima si ricorda com'erano (colore e "media"), così "Automatico" li rimette giusti
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.dataset.orig = m.content; m.dataset.media = m.getAttribute("media") || ""; m.removeAttribute("media"); m.content = t === "dark" ? "#0D1118" : "#F1F4F7"; }); } } catch (e) {}
// caratteri di riserva per chi non ha un iPhone, caricati senza bloccare la pagina (sull'iPhone si usano quelli di sistema)
try { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap"; document.head.appendChild(l); } catch (e) {}
