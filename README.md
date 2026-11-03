# Viatrix

*Viatrix* in latino vuol dire **"la viaggiatrice"**.

Un'app per segnare sulla mappa del mondo i posti in cui sei stata:

- **Mappa**: i paesi si colorano — visitato (corallo), ci vivo (verde mare), vorrei andarci (ambra). Si ingrandisce con due dita.
- **Paese**: tocchi un paese e scegli se ci sei stata, ci vivi o vorresti andarci; poi le date (dal giorno al giorno), il mezzo di trasporto, le città, le foto e una nota.
- **Città**: per ogni paese si possono aggiungere tutte le città (elenco già pronto, anche i paesi piccoli in Italia), ognuna con le sue date, mezzi e foto.
- **Paesi**: tutti i paesi divisi per continente, con la ricerca e quanti ne hai visti.
- **Numeri**: la percentuale del mondo visitato (su 195 paesi), i continenti, i giorni in viaggio, i mezzi più usati e gli ultimi viaggi.

Funziona sull'iPhone come un'app vera: Safari → Condividi → **Aggiungi alla schermata Home**. Si apre anche senza internet.

## I dati
Paesi, città e foto restano **solo sul telefono** (niente account, niente server). Nelle Impostazioni (rotellina in Numeri) c'è **Salva una copia**, da tenere per esempio su iCloud Drive.

## Come è fatta
- `index.html`, `stile.css`, `app.js`: l'app. `sw.js`: la copia per usarla senza rete (a ogni modifica alzare `VERSIONE` e il `?v=`).
- `data/mondo.json`: confini dei paesi (Natural Earth 1:50m, semplificati). `data/paesi.json`: nomi in italiano, continenti, capitali. `data/citta/XX.json`: le città di ogni paese (GeoNames, da 5000 abitanti; in Italia, San Marino, Vaticano e Malta da 1000), con i nomi in italiano.
- `scripts/prepara.py`: rifà i file in `data/` (istruzioni in testa al file).
- Librerie: d3 7.9.0 e topojson-client 3.1.0 (in `lib/`).

Dati: © Natural Earth (pubblico dominio), © GeoNames (CC BY 4.0), world-countries (ODbL).
