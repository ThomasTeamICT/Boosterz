# Lichtkamer: prototype voor het basisonderwijs

Een werkend voorbeeld van hoe een interactieve 3D-omgeving aan de minimumdoelen hangt (wetenschap en techniek, leerlijn licht).
Het staat los van de app: één pagina met three.js r128 van de CDN en drie eigen modules. Ontwerp, beslissingen en stand van
zaken: `docs/BASISONDERWIJS.md`, § "Ontwerp: een oefening aan een eindterm hangen".

| Bestand | Wat |
|---|---|
| `lichtkamer.html` | De pagina: doelen, oefeningen per moment (einde kleuter, 4de, 6de), check, klasoverzicht, lesverloop, digibordstand. Zonder `<html>`, `<head>` en `<body>`: het publiceren voegt die toe. |
| `lk-wereld.js` | De 3D-basis: renderer, licht, texturen, zaklamp, figuren, kaartjes, meetlat, het schaduwtheater (4de). |
| `lk-kleuter.js` | Het poppenhuis (einde kleuter) en zijn voorwerpen. |
| `lk-labo.js` | Het labo (6de): houder met stoffen, lichtmeters, gordijnstaal. |
| `SPEC-decor.md` | Afspraken tussen de pagina en de decors: vrije zones, maten, de API van de voorwerpen. |
| `lk-meet.js` | De meetstand van de proefpagina (`?meet`): eerste beeld en p95 van de frametijden in drie standen (LK-3). Doet niets zonder `?meet`. |
| `maak-proef.mjs` | Maakt de proefpagina `public/proef/lichtkamer-proef.html` met de bestanden ernaast (zie hieronder). |
| `rooktest-proef.mjs` | Rooktest van de gebouwde proefpagina, met Playwright. |
| `vendor/three-r128/` | Vastgelegde kopie van three@0.128.0 (alleen de gebruikte bestanden, met `LICENSE`), met een controlesom per bestand in `SHA256SUMS`. Herkomst: `vendor/three-r128/HERKOMST.md`. |
| `test.cjs` | Rooktest met Playwright: alle oefeningen, de digibordstand en 390 pixels breed, zonder internet. |

De rooktest bedient three.js lokaal. Pak eerst `npm pack three@0.128.0` uit en geef de map `package` mee:

```bash
THREE_PKG=/pad/naar/package node tools/prototypes/lichtkamer/test.cjs "$PWD/tools/prototypes/lichtkamer" lichtkamer.html /tmp/lichtkamer-shots alles
```

De uitvoer eindigt op `ERRORS:` en een lege lijst als alles goed gaat, met de schermafbeeldingen in de opgegeven map.

De voorbeeldklas is verzonnen. Resultaten blijven in de browser (localStorage) en de digibordstand bewaart niets.

## De 3D-proefpagina (LK-3)

`proef/lichtkamer-proef.html` is dit prototype als losse pagina voor de toestelproef met de ICT-coördinator, naast `proef/toestelproef.html` (`tools/prototypes/toestelproef/`, daar staat ook de checklist). Ze haalt niets van buiten: three.js en de voorbeeldscripts komen uit `vendor/three-r128/`, de lettertypes vallen terug op `Verdana` en `system-ui`, en de pagina is niet geïndexeerd (`noindex`). De voorbeeldklas is verzonnen; het script weigert een andere lijst. Resultaten van de voorbeeldklas staan onder de sleutel `lichtkamer-proef.v1`, niet onder die van het prototype.

```bash
node tools/prototypes/lichtkamer/maak-proef.mjs                  # schrijft public/proef/lichtkamer-proef.html en public/proef/lichtkamer/
node tools/prototypes/lichtkamer/maak-proef.mjs --uit /tmp/proef # naar een andere map (voor de test)
npm run build                                                    # Vite kopieert public/ naar dist/proef/
node node_modules/vite/bin/vite.js preview --port 4183 --strictPort &
LK_PROEF_BASE=http://localhost:4183 node tools/prototypes/lichtkamer/rooktest-proef.mjs
```

Het adres na uitrol is dat van Boosterz met `proef/lichtkamer-proef.html` erachter (`https://thomasteamict.github.io/Boosterz/proef/lichtkamer-proef.html`); voeg `?meet` toe voor de meetstand.

`maak-proef.mjs` faalt hard (exit 1, melding in het Nederlands) en schrijft dan niets, tenzij: elk bestand van three.js zijn controlesom uit `SHA256SUMS` heeft, het prototype geen script laadt dat niet is vastgelegd, de voorbeeldklas de verzonnen lijst is, en de uitvoer geen extern webadres, `<link>` (behalve het lege icoontje), CDN of Google Fonts bevat. In de three-bestanden staan negen webadressen als commentaar of naamruimte; die staan met naam in het script en zijn geen aanvragen. `src/lib/lichtkamerProef.test.ts` bewaakt dat, ook dat wat in `public/proef/` staat gelijk is aan wat het script nu maakt.

Service worker en beveiligingsbeleid: net als de toestelproef staat de pagina naast de app. De CSP is alleen een `<meta>` in `index.html` en geldt dus niet voor deze pagina; de service worker haalt de pagina en haar scripts eerst van het netwerk (netwerk eerst) en bewaart ze niet in de voorcache. Voor een eerste bezoek zonder cache: privévenster. De meetstand toont hoeveel kB er is opgehaald (0 betekent: uit de cache).

### De meetstand (`?meet`)

Een paneel rechtsonder, met knoppen van minstens 44 px en een blok tekst om af te lezen. Het meet:

- **Eerste beeld**: van het openen van de pagina tot het eerste beeld van de kijkdoos met een voorwerp erin (`gl.finish()` en het volgende beeld).
- **p95 van de frametijden**: de tijd tussen twee beelden terwijl de zaklamp 4 seconden heen en weer schuift in de oefening 'Onderzoek: lamp dichterbij' van het 4de leerjaar, met dezelfde aanroep als slepen (`pick.drag`). De eerste 0,6 seconde telt niet mee. Ook het gemiddelde, het traagste beeld, het aantal beelden, de tekentijd (p95) en de grootte van het canvas staan in de uitslag.
- **Drie standen**: `Digibord` (de digibordstand van het prototype: gloed, pixelverhouding tot 2, stofjes in de bundel), `Gewoon` (de Chromebookstand: pixelverhouding hoogstens 1,25, geen gloed) en `Licht` (pixelverhouding 1, geen gloed, schaduwkaarten hoogstens 1024 en de eenvoudige schaduwrand). Het adres kiest de stand bij het openen: `?meet&stand=bord`, `?meet&stand=gewoon` of `?meet&stand=licht`.
- **Oordeel** per stand: GO bij een p95 van hoogstens 50 ms én een eerste beeld binnen 5 seconden, anders NO-GO.

Verder: `&duur=2500` (milliseconden meten, hoogstens 20 000) en `&auto` (meet alle drie de standen zodra het eerste beeld er staat, voor de rooktest en de generale repetitie). De uitslag blijft in `sessionStorage` staan, zodat hij het herladen tussen de standen overleeft. Er worden geen namen bewaard.
