# Officina PDF

Una raccolta di strumenti per lavorare con i PDF e convertire file P7M della Pubblica Amministrazione italiana — **tutto nel browser**, senza upload, senza server.

## Strumenti inclusi

| # | Strumento | Cosa fa |
|---|-----------|---------|
| 01 | **Unisci PDF** | Combina più PDF in uno, con riordino drag-and-drop |
| 02 | **Dividi PDF** | Estrae pagine o intervalli (es. `1-3, 5, 8-10`) |
| 03 | **Ruota e riordina** | Anteprime cliccabili per ruotare singole pagine |
| 04 | **Comprimi PDF** | Ricomprime le immagini in JPEG, qualità regolabile |
| 05 | **PDF → Immagini** | Esporta ogni pagina come PNG ad alta risoluzione |
| 06 | **P7M → PDF** | Estrae il PDF originale dai file firmati digitalmente (CMS/PKCS#7) |

## Tecnologia

Tutto client-side, nessun build step:

- [**pdf-lib**](https://github.com/Hopding/pdf-lib) — manipolazione PDF (unione, divisione, rotazione, ricostruzione)
- [**PDF.js**](https://mozilla.github.io/pdf.js/) — rendering pagine per anteprime e conversione in immagini
- [**node-forge**](https://github.com/digitalbazaar/forge) — parsing PKCS#7/CMS per i file P7M

Le librerie sono caricate da CDN (cdnjs). Nessuna dipendenza npm, niente `package.json`, niente bundler.

## Avvio locale

```bash
# Qualsiasi server statico funziona. Esempio con Python:
python3 -m http.server 8000

# Oppure con Node:
npx serve .
```

Apri poi `http://localhost:8000`.

> **Nota**: aprire direttamente `index.html` con `file://` non funziona — PDF.js richiede un web worker e questo richiede un server.

## Deploy su GitHub Pages

1. Crea un repo su GitHub (es. `officina-pdf`)
2. Pusha questa cartella:
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/TUO-USER/officina-pdf.git
   git push -u origin main
   ```
3. Vai su **Settings → Pages**, scegli `main` come branch e `/` come root
4. Dopo qualche minuto il sito sarà su `https://TUO-USER.github.io/officina-pdf/`

## Note sul tool P7M

I file `.p7m` sono buste crittografiche (Cryptographic Message Syntax, RFC 5652) che incapsulano un documento firmato digitalmente. Il tool gestisce:

- ✅ P7M in formato **DER** (binario, caso più comune)
- ✅ P7M in formato **PEM** (base64 con header `-----BEGIN…-----`)
- ✅ P7M con **firme nidificate** (es. doppia firma)
- ⚠️ Alcuni P7M dell'**Agenzia delle Dogane** usano strutture CMS non standard che possono non essere riconosciute da node-forge. In quel caso il fallback è:
  ```bash
  openssl smime -verify -noverify \
    -in file.pdf.p7m -inform DER \
    -out file.pdf
  ```

Il tool **non verifica** la validità della firma digitale, estrae solo il contenuto. Per verifiche legali usa strumenti certificati (Dike, ArubaSign, ecc.).

## Privacy

Nessun file viene mai inviato a un server. Tutto avviene nel browser usando le API `File` e `Blob`. Puoi verificarlo aprendo gli strumenti di sviluppo (tab Network) durante l'uso.

## Licenza

MIT. Vedi `LICENSE`.
