# Toestelproef: een losse proefpagina voor de schooltoestellen

Eén zelfstandige pagina, los van de React-app, die op de echte schooltoestellen meet wat het ontwerp voor het basisonderwijs aanneemt (`docs/BASISONDERWIJS.md`, § "Aanmelden en inleveren per leeftijd"; pakket 1 en 2 in `docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md`). Het kind toont later een bewijscode (QR) op zijn Chromebook en de webcam van de laptop van de leerkracht leest die. Deze pagina meet of dat kan.

Ze doet geen enkele aanvraag (geen CDN, geen lettertypes, geen `fetch`, geen tracking), bevat geen persoonsgegevens en bewaart alleen het merkje dat je zelf zet. De database `boosterz-toestelproef` staat los van de databases van de app. In de pagina zit `jsqr` (Apache-2.0) ongewijzigd, met zijn licentieregel erboven.

Wat ze doet:

- **Codes tonen.** 8 QR-codes in de vorm van WB1 (alleen `0-9 A-Z . / - *`, foutcorrectie L): versie 3, 6, 7 en 10, elk op 6 en 8 px per module. De tekst is verzonnen en gevuld tot het maximum van de versie (77, 195, 224 en 395 tekens). Eén code tegelijk, met `(modules + 4) × px` css-pixels: versie 10 op 8 px is 488 px.
- **Scanner.** Camerakeuze, gespiegeld beeld (alleen op het scherm), `BarcodeDetector` of anders `jsqr` op 640 px, en een log met versie, px, decoder, tijd sinds de meting, beeldresolutie en gemiddelde rekentijd per beeld.
- **Stem.** De lijst van `speechSynthesis.getVoices()` en een knop die de zin uitspreekt met de eerste stem in de volgorde nl-BE, nl-NL, nl.
- **Opslag.** Een merkje in `localStorage` en IndexedDB, `persisted()` en `estimate()`.
- **Toestel en uitslag.** Platform, scherm, camera's en een knop die alles als platte tekst kopieert. De uitslag bevat ook waarom de camera niet startte (met de Windows-hint), de toestemming bij het openen en nu, de Nederlandse stemmen met `localService` en of het toestel online was bij de laatste stempoging, en de volledige log van de meting.

## Maken en testen

```bash
node tools/prototypes/toestelproef/maak-proef.mjs     # schrijft public/proef/toestelproef.html
npm run build                                         # kopieert ze naar dist/proef/
node node_modules/vite/bin/vite.js preview --port 4183 --strictPort &
PROEF_BASE=http://localhost:4183 node tools/prototypes/toestelproef/rooktest.mjs
```

`maak-proef.mjs` faalt hard (exit 1, melding in het Nederlands) en schrijft dan niets, tenzij:

- elke code bij foutcorrectie L precies de bedoelde versie haalt, uit één alfanumeriek segment bestaat en uit alleen toegelaten tekens;
- `jsqr` de getekende code (het pad uit de pagina, niet de matrix) in node exact terugleest;
- de pagina geen `http://`, `https://`, `<script src>`, `<link>`, `url()` of netwerkaanroep bevat.

De rooktest start Chromium met een nepcamera (`--use-file-for-fake-video-capture`, een y4m met de code van versie 6 op 8 px, gemaakt in een tijdelijke map). Chromium: `PW_CHROMIUM`, anders `/opt/pw-browsers/chromium`. De pagina wordt niet door de service worker bewaard en staat niet in de voorcache: offline herladen kan dus niet.

Het adres na uitrol is hetzelfde als dat van Boosterz, met `proef/toestelproef.html` erachter. Dat is bewust: zo gelden dezelfde opslag en dezelfde toelating voor de camera als voor de app.

## Checklist voor de proef (pakket 2, met de ICT-coördinator)

Per toestel: de pagina openen, het toestel kiezen, de uitslag kopiëren en bij de andere uitslagen plakken. Geen namen van kinderen of leerkrachten.

| | Chromebook 1ste graad | Chromebook 3de leerjaar | Laptop leerkracht | Digibord |
|---|---|---|---|---|
| Account (gastsessie, klasaccount, eigen account) | | | | |
| Zoom op 100 %, pixelverhouding genoteerd | | | | |
| Merkje gezet, afgemeld en aangemeld: nog aanwezig in localStorage en IndexedDB? (uitslag kopiëren vlak voor het afmelden en nog eens na het aanmelden) | | | | |
| `persisted()` en `estimate()` genoteerd | | | | |
| Camera zonder vraag toegelaten (VideoCaptureAllowedUrls)? Lees "bij het openen" in een schoon profiel; noteer ook `chrome://policy` | n.v.t. | n.v.t. | | |
| Welke decoder: BarcodeDetector of jsqr? | | | | |
| Leest de webcam (720p) versie 10 op 8 px vlot? | n.v.t. | n.v.t. | | |
| Idem versie 7, 6 en 3, en alles op 6 px | n.v.t. | n.v.t. | | |
| Camera's: aantal, naam, spiegeling goed? | | | | |
| Nederlandse stem (nl-BE, nl-NL, nl) aanwezig? | | | | |
| Stem werkt zonder internet (`localService`)? | | | | |
| Welk toestel hangt aan het digibord, en heeft het een webcam? | n.v.t. | n.v.t. | n.v.t. | |
| 3D-proef geopend (`proef/lichtkamer-proef.html?meet`): komt de pagina op en staat de meetstand rechtsonder? Opent de link uit Smartschool? | n.v.t. | | | |
| 3D digibord-stand: eerste beeld (s) en p95 (ms), uit de uitslag | n.v.t. | | | |
| 3D gewoon: eerste beeld (s) en p95 (ms) | n.v.t. | | | |
| 3D licht: eerste beeld (s) en p95 (ms) | n.v.t. | | | |
| 3D go of no-go: p95 hoogstens 50 ms én eerste beeld binnen 5 s, per stand; de standaardstand is de beste stand die op de Chromebook van het 3de leerjaar haalt | n.v.t. | | | |

De uitkomst komt in `docs/BASISONDERWIJS.md` en legt twee grenzen vast voor pakket 5: de hoogste QR-versie per deel (voorstel: 10) en het aantal px per module (voorstel: 8). Leest de webcam versie 10 op 8 px niet vlot, dan zakt de grens naar versie 7 (224 tekens).

## 3D-proef van de Lichtkamer (LK-3)

Naast deze proef staat een tweede proefpagina, `proef/lichtkamer-proef.html`: het goedgekeurde prototype van de Lichtkamer (`tools/prototypes/lichtkamer/`) met three r128 lokaal en een meetstand. Ze meet of de 3D-kijkdoos vlot loopt op de toestellen van de school (`docs/basisonderwijs/LICHTKAMER-APP.md`, 'Go of no-go bij het bezoek', pakket LK-11). Ze is niet geïndexeerd en haalt niets van buiten. Maken, testen en gebruik staan in `tools/prototypes/lichtkamer/README.md`.

Per toestel (Chromebook van het 3de leerjaar, laptop van de leerkracht, bordtoestel):

1. Open `proef/lichtkamer-proef.html?meet` (bij een eerste bezoek, liefst in een gastsessie of privévenster).
2. Wacht tot het beeld er staat en tik op 'Meet alle drie de standen'. Laat het toestel ongeveer 20 seconden met rust.
3. Het eerste beeld per stand meet je bij het openen: tik daarna op 'Open opnieuw: digibord' en 'Open opnieuw: licht' en wacht telkens tot het beeld er staat. De uitslag blijft staan zolang het tabblad open is. Alleen het eerste beeld van het eerste bezoek is 'koud' (alles moet nog opgehaald worden): noteer dat getal apart, de volgende zijn sneller door de cache. Laat het tabblad tijdens het meten open staan: wissel je van tabblad, dan zegt de pagina 'Meting ongeldig' en meet je opnieuw.
4. Lees het blok tekst af, noteer de rijen in de tabel hierboven (eerste beeld in seconden, p95 in milliseconden) of kopieer de uitslag, en noteer het oordeel 'GO' of 'NO-GO' dat er per stand onder staat.

Een stand haalt de proef als de p95 hoogstens 50 ms is en het eerste beeld binnen 5 seconden komt. Minstens één stand moet dat doen op de Chromebook van het 3de leerjaar; die stand wordt de standaard. Haalt geen enkele stand het, dan stopt de generale repetitie en beslist de eigenaar: een lichter decor, of 3D alleen op het bord.
