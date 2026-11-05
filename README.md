# Viatrix

*Viatrix* in latino vuol dire **"la viaggiatrice"**.

Un'app per segnare sulla mappa del mondo i posti che hai visitato:

- **Mappa**: i paesi si colorano — visitato (corallo), ci vivo (verde mare), vorrei andarci (ambra). Si ingrandisce con due dita.
- **Paese**: tocchi un paese e scegli se l'hai visitato, ci vivi o vorresti andarci; poi le date (dal giorno al giorno), il mezzo di trasporto, le città, le foto e una nota.
- **Città**: per ogni paese si possono aggiungere tutte le città (elenco già pronto, anche i paesi piccoli in Italia), ognuna con le sue date, mezzi e foto.
- **Da non perdere**: in ogni paese e città i posti più famosi (musei, monumenti, natura), con foto, testo di Wikipedia e il tasto per aprirli in Mappe; si segnano con ✓ quando li vedi.
- **Paesi**: tutti i paesi divisi per continente, con la ricerca e quanti ne hai visti.
- **Numeri**: la percentuale del mondo visitato (su 195 paesi), i continenti, i giorni in viaggio, i mezzi più usati e gli ultimi viaggi.

Funziona sull'iPhone come un'app vera: Safari → Condividi → **Aggiungi alla schermata Home**. Si apre anche senza internet.

## I dati
Paesi, città e foto restano **solo sul telefono** (niente account, niente server). Nelle Impostazioni (rotellina in Numeri) c'è **Salva una copia**, da tenere per esempio su iCloud Drive.
Su iPhone l'app sulla schermata Home ha un archivio suo, separato da Safari: chi ha già segnato dei viaggi in Safari salva una copia e la ripristina nell'app (il cartoncino "Mettila sulla schermata Home" lo spiega).

## Statistiche anonime
Se in `config.js` c'è il progetto Firebase, ogni telefono manda un riepilogo **anonimo** (nome casuale, nessun nome di persona): codici dei paesi segnati, quante città e foto, livello, mezzi usati, se l'app è sulla Home, primo e ultimo giorno d'uso. Mai città, date dei viaggi, foto o note. Lo legge solo il proprietario, nella sezione Statistiche (Impostazioni). Regole del database in `firestore.rules`: accettano solo codici di due lettere maiuscole (al massimo 260), mezzi conosciuti e numeri interi; la sezione ripulisce comunque ogni riepilogo prima di mostrarlo (tiene solo i codici dei paesi veri).

## Come è fatta
- `index.html`, `stile.css`, `app.js`: l'app. `config.js`: impostazioni pubbliche di Firebase per le statistiche. `sw.js`: la copia per usarla senza rete (a ogni modifica alzare `VERSIONE` e il `?v=`).
- `data/mondo.json`: confini dei paesi (Natural Earth 1:50m, semplificati). `data/paesi.json`: nomi in italiano, continenti, capitali. `data/citta/XX.json`: le città di ogni paese (GeoNames, da 5000 abitanti; in Italia, San Marino, Vaticano e Malta da 1000), con i nomi in italiano.
- `scripts/prepara.py`: rifà i file in `data/` (istruzioni in testa al file).
- `scripts/consigli.py`: prepara `data/consigli/XX.json`, i posti da non perdere di ogni paese (Wikidata tramite QLever; la fama = in quante lingue c'è la pagina Wikipedia).
- Librerie: d3 7.9.0 e topojson-client 3.1.0 (in `lib/`).

Dati: © Natural Earth (pubblico dominio), © GeoNames (CC BY 4.0), world-countries (ODbL), Wikidata (CC0); foto da Wikimedia Commons e testi da Wikipedia (CC BY-SA), caricati al momento.
