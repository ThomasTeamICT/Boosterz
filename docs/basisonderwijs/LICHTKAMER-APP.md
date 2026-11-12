# Lichtkamer in de app: de kortste weg naar de proefklas

Ontwerp van 12 november 2026. Het hoort bij `docs/BASISONDERWIJS.md` (bouwstap 4, 5 en 6) en bij `docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md` (hierna AB). Het werkend voorbeeld staat in `tools/prototypes/lichtkamer/`. Drie ontwerpen ('kleinste stap', 'risico eerst' en 'leerkracht eerst') zijn door een rechter samengevoegd tot dit plan.

## Stand van zaken

| Wat | Stand | Op wie |
|---|---|---|
| Dit ontwerp | **Klaar** (12 november 2026), ter beslissing | eigenaar |
| Beslissingen voor proefles 1 (LK-0, vragen 1 tot 5 onderaan) | **Wacht** | eigenaar, met de proefleerkracht |
| Lichtlogica van het schaduwtheater (LK-1) en bewijsmodel (LK-2) | **Klaar** (12 november 2026), nog in geen scherm gebruikt: `src/lib/basis/lichtkamer/` (zuiver, 38 816 vergelijkingen met het prototype zonder verschil; bij 30/15/10 cm wordt geen geldige aflezing afgekeurd; '12,5' en '12.5' geven 12,5) en `src/lib/basis/bewijs/` (bouwpakket 3, met manifest v1 voor de drie momenten en een GO!-sleutel). Nagekeken door een reviewer en een rechter per pakket | bouwer, kernbouwer |
| 3D-proefpagina met het goedgekeurde prototype (LK-3) | **Kan starten**; de uitrol wacht op vraag 3 | bouwer |
| Lamplicht voor kijkdoos en bord (LK-4) | **Klaar** (12 november 2026): tokens in `src/styles/basis.css` en `src/styles/basis-lichtkamer.css` (nog door geen scherm geladen), met contrastparen in `basisKleuren.test.ts` | bouwer |
| Kijkdoos op three r162 (LK-5) | **Kan starten**; vraag 6 (r162) staat open, maar blokkeert niet tenzij de eigenaar anders beslist | kernbouwer |
| Panelen, spiekkaart, schermen en rooktest (LK-6 tot LK-9) | **Wacht** | bouwer, inhoudschrijver |
| Review en uitrol (LK-10) | **Wacht** | hoofdsessie |
| Bezoek met de ICT-coördinator: toestelproef, 3D-proef en droge les (LK-11, bouwpakket 2) | **Wacht** op een datum (vraag 4) | eigenaar; de hoofdsessie verwerkt |
| Generale repetitie en proefles 1 (LK-12, LK-13) | **Wacht** | eigenaar |
| Ingangen bij doel en leerjaar (LK-14) | **Wacht**, niet nodig voor de proef | bouwer |
| Spoor 2: bewijs per kind met WB1 en proefles 2 (LK-20 tot LK-28) | **Na proefles 1**; de codes wachten ook op het bezoek (AB r. 259) | hoofdsessie, eigenaar |
| Verwijzing in `CLAUDE.md` en een regel in de Stand van zaken van `docs/BASISONDERWIJS.md` | **Klaar** (12 november 2026) | hoofdsessie |

## De keuze in het kort

1. **Twee proeflessen.**
   - Proefles 1 test de Lichtkamer zelf: de 3D op de Chromebooks en op het digibord, de didactiek voor een 3de leerjaar en de spiekkaart. Ze kent geen namen en bewaart niets.
   - Proefles 2 test het bewijs per kind met de korte code WB1.
   - Dat wijkt af van 'Na pakket 13 kan de proefklas starten' (`docs/BASISONDERWIJS.md` r. 200). Het vraagt dus een beslissing (vraag 1).
2. **Eigen schermen in `#/basis`, nog geen oefeningsoort.** Er komen drie lui geladen schermen: de lespagina voor de leerkracht, het bord en het kindscherm. Dat kost 0 bytes op het kritieke leerlingpad. De oefeningsoort in het register komt later (vraag 7).
3. **Alleen het schaduwtheater.** Het moment 'einde 4de leerjaar', met drie oefeningen en de check. Poppenhuis en labo komen later.
4. **three.js r162 in een eigen chunk.** Dat is de laatste versie die nog WebGL 1 kent. Zo blijft 3D mogelijk op Safari en iPadOS 14.1 (vraag 6).
5. **Meten op het echte toestel, zonder de bouw stil te leggen.** Een kleine proefpagina met het goedgekeurde prototype gaat mee naar het bezoek. Het bezoek beslist welke stand de Chromebooks krijgen, en of de 3D daar kan (go of no-go).
6. **Niets voorlopigs.** Het lichtmodel en het volledige bewijsmodel (bouwpakket 3) worden nu al geteste code. Het paneel krijgt een aansluiting voor bewijs:
   - in proefles 1 blijft die in het geheugen;
   - in proefles 2 gaat ze naar de buffer van het toestel.

## Wat de rechter zelf nakeek

- **Het leerlingpad.** Het kritieke leerlingpad weegt 335,4 kB van de 335,7 kB. In `dist/` staan de hoofdbundel (166 174 bytes) en vendor (169 201 bytes); het budget staat in `vite.config.ts` r. 93-102.
  - De luie schermen van `#/basis` staan alleen in het BasisDeel-chunk, niet in de hoofdbundel (nagekeken voor `LesplanScherm`). Een nieuw scherm in `#/basis` kost dus niets op het leerlingpad.
  - Een oefeningsoort in het register kost wel iets: ±0,5 kB plus een icoon.
- **De versie van three.js.** three.js weigert WebGL 1 sinds r163 (`three@0.187.0`, `build/three.module.js` r. 15926). r162 heeft nog het pad voor WebGL 1. `three@0.162.0` en `@types/three@0.162.0` bestaan.
- **De lichten.** Het prototype zet `physicallyCorrectLights = false` (`lk-wereld.js` r. 128). Het gebruikt `sRGBEncoding` en `outputEncoding` (r. 27 en r. 127). In r162 moeten de lichten dus opnieuw afgesteld worden.
- **Het nakijken van het onderzoek.** Bij 30, 20 en 10 cm keurt het nakijken juiste metingen af (`lichtkamer.html` r. 705 en r. 711):
  - 3 van de 27 geldige aflezingen bij het boompje;
  - 9 van de 27 bij het kartonnen kind.

  Bij 30, 15 en 10 cm gebeurt dat nooit, ook niet in hele centimeters. 40 cm kan niet: de lamp gaat in de scène niet verder dan 30 cm (r. 685). Ook 40, 20 en 10 cm keurt nog af.
- **Het getalveld.** Het getalveld van het onderzoek (`type=number`, r. 697) maakt in Chromium van '12,5' de waarde '125'. Een kind dat juist meet, krijgt dan 'Kijk de meting nog eens na', met het foutpatroon 'leest de meetlat niet nauwkeurig af'.
- **De check.** Na een fout antwoord toont de check meteen het juiste antwoord (r. 926). Een werkblad met dezelfde vragen na de digitale check heeft dus geen zin.
- **De zaklamp.** In het onderzoek valt de zaklamp bij 10 cm achter de knoppenbalk.
- **De toestelproef.** De toestelproef meet geen WebGL (0 treffers in `tools/prototypes/toestelproef/maak-proef.mjs`).
- **'Nog niet cruciaal'.** 'Ja per kind mogelijk maar nog niet cruciaal nu' (`docs/BASISONDERWIJS.md` r. 135) was het antwoord op de vraag of het bewijs ook naar buiten moet: een export, het rapport, een leerlingvolgsysteem (commit 6775bb5).
  - Het is dus geen akkoord om het bewijs per kind over te slaan.
  - De eigenaar vroeg 'resultaten per kind, alleen lokaal' (r. 28).
  - Daarom is proefles 1 zonder bewijs een vraag, geen vaststelling.
- **De codes wachten op het bezoek.** Bouwpakket 5 (de codes) hangt af van bouwpakket 2, het bezoek (AB r. 259 en r. 590). WB1 kan dus niet vóór het bezoek klaar zijn.
- **Wanneer bouwen mag.** 'Bouwen begint pas na pakket 1 en 2' (AB r. 3) gaat over de aanmeldpakketten. Voor bouwstap 4 en 5 zegt de Stand van zaken 'Kan verder' (`docs/BASISONDERWIJS.md` r. 46).
- **Het GO!.** Bij 92767 heeft het GO! geen leerplandoel over schaduw voor 8-9 jaar: WT.343 is voor 6-7 jaar, en WT.344 loopt tot 7-8 jaar. WT.407 en WT.408 (eerlijk onderzoek) zijn wel voor 8-9 jaar (`public/basis/go/bij-minimumdoel/3.json`).

## Ontwerp

### Drie schermen in #/basis

| Adres | Voor wie | Wat |
|---|---|---|
| `#/basis/pakket/lichtkamer/einde-4de` | de leerkracht, op de laptop | Doel, Uitproberen, Lesverloop met de spiekkaart (afdrukken), de bordlink en de kindlink met een QR-code |
| `#/basis/bord/lichtkamer/einde-4de` | het digibord | grote letters, de klasvraag, 'Toon de uitkomst' en de presenter. Geen namen, niets bewaard |
| `#/basis/oefen/lichtkamer/einde-4de` | het kind, op de eigen Chromebook | de drie oefeningen, de check en 'Wat ik al kan'. Geen naam, niets bewaard |

- **Adressen.** Elk scherm is een tak van `BasisScherm` (`src/lib/basis/basisRoutes.ts` r. 20-38). Het laadt lui, zoals `LesplanScherm` (`src/pages/basis/BasisDeel.tsx` r. 24). Er komt geen `<Routes>` (`BasisDeel.test.ts`).
- **Schillen.** `BasisDeel` kiest de schil per scherm; nu is dat altijd `BasisSchil` (r. 146).
  - De lespagina houdt `BasisSchil`.
  - Het bord en het kind krijgen een kale schil, zonder de navigatie van de leerkracht en zonder 'Naar Boosterz'.
  - Elk scherm heeft één `main` en één `h1`.
- **Register.** Een klein register `src/lib/basis/pakketten.ts` legt per pakket vast: het moment, de leerjaren (L3, L4) en de doel-id's.
- **Stand voor het 3de leerjaar.** De lespagina heeft een stand '3de leerjaar' (`?leerjaar=L3`). Die toont de noot 'je werkt naar deze doelen toe' (`lichtkamer.html` r. 988) en het lesverloop voor het 3de leerjaar.
- **De kindlink.** De kindlink bevat geen namen en geen klascode. Hij mag dus als QR-code op het bord.
- **De weg naar de lespagina.** De leerkracht vindt de lespagina via een tegel op de startpagina van `#/basis` (`StartScherm.tsx` r. 41-52). Een deel bij het doel en een blok bij het leerjaar komen erna (LK-14). Er komt geen zesde item in de navigatie, want die loopt op 390 px al over twee regels (`GO-LEERPLAN.md` r. 1102).

### De kijkdoos

- **Wat erin zit.** Een controller in TypeScript, met alleen het schaduwtheater:
  - uit `lk-wereld.js`: renderer, licht, texturen, zaklamp, figuren, kaartjes, meetlat en de opstelling;
  - het 3D-deel van de drie oefeningen (`lichtkamer.html` r. 605-720).
- **Opruimen.** Elke keer dat een scherm opent, komt er één nieuwe controller. Bij het sluiten ruimt hij alles op: renderer, PMREM, composer, schaduwkaarten, texturen, de teken-lus, de ResizeObserver en alle luisteraars. In het prototype blijven die globaal staan (`lichtkamer.html` r. 380, 403, 410; `lk-wereld.js` r. 134).
- **Drie standen.**
  - 'hoog', voor het bord: gloed en pixelratio 2;
  - 'midden', zoals het prototype op een Chromebook;
  - 'laag': schaduwkaart 1024, PCFShadowMap, geen antialias, pixelratio 1.

  De controller kiest zelf 'laag' als het toestel zonder grafische kaart tekent of als de eerste beelden traag zijn. Het bezoek legt de standaard vast.
- **Fouten.** Valt de WebGL-context weg, dan verschijnt 'Tik om de kijkdoos opnieuw te laden'. Lukt `import('three')` niet, of is er geen WebGL, dan blijven doel en check werken, zoals `geen3D` in het prototype (r. 371).
- **Gloed.** De gloed laadt in een apart stuk, alleen op het bord.
- **Labels.** Labels op het canvas komen pas na `document.fonts.ready` (Fredoka).
- **Meten.** Met `?meet` toont de kijkdoos zijn frametijden, voor de generale repetitie.

### three.js r162 in de eigen bundel

- **Versie.** `three@0.162.0` en `@types/three@0.162.0`, met een vaste versie.
- **Eigen chunk.** `manualChunkFor` (`src/lib/swBuild.ts` r. 281-292) krijgt een eigen chunk `three`, dat zelf niets importeert. Zo blijft zijn naam gelijk na een uitrol, en halen de Chromebooks het niet opnieuw op.
- **Budget en cache.** Een eigen regel in `BUDGETS` (`vite.config.ts` r. 104-110), zoals pdf.js, en `three` in `NEVER_PRECACHE` (`src/lib/swBuild.ts` r. 40).
- **Laden.** three laadt alleen via `import()`, nooit in `vendor` of op het leerlingpad. `EAGER_ICON_NAMES` blijft ongewijzigd.
- **Geen CDN.** Niets komt van een CDN, dus de CSP blijft zoals ze is (`src/offline/csp.ts` r. 129).
- **De overstap.**
  - `colorSpace` in plaats van `encoding`;
  - `OutputPass` in plaats van `GammaCorrectionShader`;
  - de lichten opnieuw afgesteld, zonder het verouderde `useLegacyLights`. `ColorManagement` uitzetten mag, als het beeld zo dichter bij het prototype blijft.

  De eigenaar keurt het uitzicht goed, naast de schermafbeeldingen van het prototype.

### Bewijs in proefles 1

- **Niets op het toestel.** Het kindscherm legt geen bewijs vast in de opslag van het toestel. De voortgang leeft in het geheugen en in de `sessionStorage` van het tabblad, zodat herladen tijdens de les niets kost.
- **De aansluiting voor bewijs.** Het paneel krijgt een aansluiting `bewijs`.
  - Op het bord en bij uitproberen is die leeg.
  - Op het kindscherm gaat ze in proefles 1 naar het geheugen.
  - In proefles 2 gaat ze naar de buffer van het eigen toestel (bouwpakket 8). Zo hoeft er later niets weg.
- **Wat ik al kan.** Na de check toont 'Wat ik al kan' per doel een vorm en een woord: toont het, nog wankel, nog niet, nog geen bewijs. Dat is `statusVoor` (`lichtkamer.html` r. 960), nu uit bouwpakket 3. De leerkracht ziet het als ze rondloopt.
- **Geen namen.** Er staat nergens een naam in de app. Er is dus niets te wissen, en er is geen nieuwe privacytekst nodig.

### Wat we uit het prototype herstellen

- De meetpunten van het onderzoek worden 30, 15 en 10 cm (vraag 2).
- De tolerantie bij het nakijken past zich aan de afstanden aan (`tolerantieVoor` in `src/lib/basis/lichtkamer/onderzoek.ts`), zodat een geldige aflezing nooit wordt afgekeurd. Daardoor kan 'metingen passen niet bij elkaar' in de app niet meer voorkomen: 4-meten faalt alleen nog met 'leest de meetlat niet nauwkeurig af'. Het manifest houdt dat andere foutpatroon, gelijk met het prototype en zijn voorbeeldklas, maar de spiekkaart (LK-7) maakt er geen rij voor.
- De meting komt in een tekstveld met `inputmode="decimal"` en een eigen lezer: komma en punt mogen allebei.
- De zaklamp valt bij 10 cm niet meer achter de knoppenbalk.
- Css voor Safari 14:
  - een terugval voor `aspect-ratio` onder `@supports not (aspect-ratio: 1)` (nu r. 67-76);
  - `:focus-visible` niet in een selectorlijst (r. 86);
  - geen verloop (r. 141-142);
  - nieuwe tokens voor de donkere kijkdoos (`--stage`, `--on-stage`, `--focus-stage`), met contrastparen in `basisKleuren.test.ts`.
- Op het bord vergroot de regel onder `data-bord` ook de lopende tekst, want `basis.css` zet die vast op 16 px (r. 117-119). De regel heft ook de breedtegrens van 1240 px op (r. 145).
- Geen Google Fonts, geen voorbeeldklas en geen opslag `lichtkamer.v1`.

### Wat blijft zoals het was

- Het leerlingpad, `EAGER_ICON_NAMES`, `PlayerPage`, `registry.tsx` en de klasweg met WF1 blijven ongewijzigd.
- Basispakketten maken geen WF1-inzending (AB r. 124).
- In geen enkele code staat een naam (AB r. 568).
- Het bord bewaart niets en toont geen namen (AB r. 566).

## Verloop van proefles 1

**Vooraf**

- **Bezoek met de ICT-coördinator (LK-11).** We openen de 3D-proefpagina met de meetstand op een Chromebook van het 3de leerjaar, op de Windows-laptop en op het bordtoestel. We kijken na:
  - of de link uit Smartschool opent;
  - of het schoolnetwerk github.io toelaat;
  - of de kinderen een eigen account hebben of een toestel uit de kar.

  Daarna volgt een droge les van 30 minuten: de proefleerkracht speelt de schaduwles op het bord en kiest de oefeningen voor haar klas.
- **Voorbereiden (±20 minuten).** De leerkracht opent de lespagina via de tegel 'Lichtkamer: schaduwtheater' en kiest de stand '3de leerjaar'.
  - Ze leest de drie doelen: 92767, 92775 en 92777, letterlijk uit de set ODS_3408, met de zin in kindertaal en 'zo zie je dat het lukt'.
  - Met 'Uitproberen' doet ze de oefeningen zelf. Er wordt niets bewaard.
  - Ze drukt de spiekkaart af (één A4).
  - Ze zet de kindlink in Smartschool, of toont hem als QR-code op het bord.
- **Generale repetitie (LK-12).** In een les ervoor opent elk kind de link één keer. Zo staat alles in de cache. In de 48 uur vóór de les rollen we niets nieuws uit.
- **Materiaal.** Zaklampen, kartonnen boompjes, kaartjes met een gaatje, een meetlat en wit karton (`lichtkamer.html` r. 1010).

**De les (50 minuten, naar het lesverloop van het prototype, `lichtkamer.html` r. 1000)**

1. **0-5 minuten, start met echt materiaal.** Een zaklamp en een boompje voor het bord: waar komt de schaduw?
2. **5-20 minuten, digibord.** De leerkracht tikt op 'Op het bord'. 'Waar valt de schaduw?' heeft drie rondes.
   - Bij elke ronde opent ze de klasvraag. De kinderen tonen A, B of C met hun vingers.
   - Ze tikt aan wat de klas koos en toont de schaduw en de lichtstralen.
   - Bij de fout 'aan de kant van de lamp' zegt ze de zin van de spiekkaart.
   - Met een presenter gaat PageDown naar de volgende oefening en toont spatie de uitkomst.
   - Er staan geen namen in beeld, en er wordt niets bewaard.
3. **20-40 minuten, op de Chromebook.** Elk kind apart of in duo, zoals de proefleerkracht kiest. Het kind opent de link en ziet 'Lichtkamer: schaduwtheater' met grote tegels: 'Drie kaartjes', 'Onderzoek', en 'Waar valt de schaduw?' om opnieuw te doen. Er is geen naam te kiezen. Bovenaan staan Voorlezen en Prikkelarm.
   - Kaartjes: de gaatjes op één lijn met de lamp zetten, tot 'Ook schuin lukt het!'.
   - Onderzoek:
     1. een hypothese kiezen;
     2. de zaklamp op 30, 15 en 10 cm zetten;
     3. de schaduw aflezen op de meetlat en het getal typen (komma of punt);
     4. een conclusie kiezen en op 'Mijn onderzoek nakijken' tikken.
   - De leerkracht loopt rond met de foutpatronen van de spiekkaart. Wie vastzit, zet 'Lichtstralen' aan. Wie klaar is, test met echte kaartjes.
4. **40-45 minuten, check.** Drie prentvragen; het eerste antwoord telt. Daarna toont 'Wat ik al kan' per doel een vorm en een woord. De leerkracht kijkt mee als ze rondloopt.
5. **45-50 minuten, nabespreking op het bord.** De scharniervraag: waarom valt de schaduw aan de andere kant dan de lamp?

**Na de les.** Er is niets in te leveren en niets te wissen. De eigenaar en de leerkracht vullen het observatieblad in:
- hoe lang elke fase duurde;
- of de 3D vlot liep, en in welke stand;
- waar kinderen vastliepen;
- wat de leerkracht moest improviseren;
- wat ze miste om achteraf te zien wie welk doel haalde.

Dat stuurt spoor 2.

**Plan B op de spiekkaart**

| Storing | Wat de leerkracht doet |
|---|---|
| De kijkdoos laadt niet | De check werkt wel. De klas werkt met de echte zaklamp, het boompje en de meetlat. |
| Het netwerk valt weg | Alleen het bord gebruiken. |
| Een Chromebook valt uit | In duo werken. |
| Een kind zit vast | 'Lichtstralen' aanzetten. |

## Bouwplan

Schrijven en controleren doen altijd twee verschillende agents. Agents committen niet; de hoofdsessie integreert en commit. Een pakket is pas klaar als lint, typecheck en de tests groen zijn.

### Spoor 1: tot proefles 1

| Nr | Pakket | Agent | Omvang | Hangt af van | Klaar als |
|---|---|---|---|---|---|
| LK-0 | Beslissingen voor proefles 1 (vragen 1 tot 5) | eigenaar | klein | - | de antwoorden staan met datum in de Stand van zaken |
| LK-1 | Lichtlogica: schaduwpunt, kaartjes, rondes, nakijken van het onderzoek (afstanden als parameter), het lezen van een meting, checkvragen 4c1 tot 4c3 | bouwer | middel | - | vitest is groen met de nagerekende hoogtes; bij 30/15/10 cm wordt geen geldige aflezing afgekeurd; '12,5' en '12.5' geven 12,5; geen import van three |
| LK-2 | Bewijsmodel (bouwpakket 3), met een GO!-sleutel en manifest v1 voor de drie momenten | kernbouwer | middel | - | de gevallen van AB r. 231-236 zijn groen, plus een geval met een GO!-sleutel |
| LK-3 | 3D-proefpagina: het prototype met three r128 lokaal, `?meet`, drie standen, extra rijen in de checklist | bouwer | klein | - | het maakscript weigert externe adressen; de rooktest opent zonder fout en meet p95 in drie standen |
| LK-4 | Lamplicht: tokens voor de kijkdoos, bordregel, terugval voor Safari 14, vormen per status | bouwer | klein | - | `basisKleuren.test.ts`, `color.test.ts` en `safari14.test.ts` zijn groen |
| LK-5 | Kijkdoos in TypeScript op three r162, eigen chunk en budgetregel, opruimen, standen, contextverlies, `?meet` | kernbouwer | groot | LK-1 | build groen, kritiek pad gelijk; three importeert niets; 20 keer openen en sluiten zonder lek; schermafbeeldingen naast het prototype |
| LK-6 | Panelen, klasvraag, presenter, check, 'Wat ik al kan', voorlezen, rustmodus, tekstveld voor de meting, aansluiting voor bewijs | bouwer | groot | LK-1, LK-2, LK-4, LK-5 | met alleen het toetsenbord haalbaar; localStorage ongewijzigd in elke stand; geen naam op het bord |
| LK-7 | Spiekkaart, plan B, observatieblad, eventueel een meetblad | inhoudschrijver | klein | LK-0, LK-1, LK-2 | de id's staan in het manifest; geen emoji; de nakijker heeft geen open bevindingen |
| LK-8 | Drie schermen, twee schillen, lespagina met afdruk, kindlink met QR-code, tegel op de startpagina | bouwer | middel | LK-6, LK-7 | de rondgang in `basisRoutes.test.ts` is groen; BasisDeel-chunk onder 80 kB; spiekkaart precies één A4 |
| LK-9 | Rooktest `tests/basis/lichtkamer.mjs`, door een andere bouwer | bouwer | middel | LK-8 | alle controles groen, samen met smoke en safari14 |
| LK-10 | Review per invalshoek, rechter, goedkeuring van het uitzicht, integratie en uitrol | hoofdsessie | middel | LK-3, LK-5 tot LK-9 | de volledige poort is groen; de schaduwles staat live |
| LK-11 | Bezoek met de ICT-coördinator, met de 3D-proef en een droge les (bouwpakket 2) | eigenaar | klein | LK-0, LK-3 | de checklist is per toestel ingevuld; go of no-go; standaardstand vastgelegd |
| LK-12 | Generale repetitie en uitrolstop van 48 uur | eigenaar | klein | LK-10, LK-11 | elke stap lukt op de echte toestellen |
| LK-13 | Proefles 1 | eigenaar | klein | LK-12 | het observatieblad is ingevuld; de bevindingen staan in de Stand van zaken |
| LK-14 | Ingangen bij het doel en het leerjaar (niet nodig voor de proef) | bouwer | klein | LK-8 | 92767, 92775 en 92777 tonen de Lichtkamer; geen leeg deel bij andere doelen |

**Go of no-go bij het bezoek.** Minstens één stand moet op de Chromebook van het 3de leerjaar twee dingen halen:
- een p95 van hoogstens 50 ms tijdens het verschuiven van de lamp;
- een eerste beeld binnen 5 seconden.

Die stand wordt de standaard. Haalt geen enkele stand dat, dan stopt LK-12 en beslist de eigenaar: een lichter decor, of 3D alleen op het bord.

### Spoor 2: bewijs per kind en proefles 2

| Nr | Pakket | Agent | Omvang | Hangt af van | Klaar als |
|---|---|---|---|---|---|
| LK-20 | Klaslijst voor het basisonderwijs met kindcode, prent en kleur (bouwpakket 4) | bouwer | klein | - | de gevallen van AB r. 250-254 zijn groen |
| LK-21 | Codes WB1 en WK1, met de grenzen uit het bezoek (bouwpakket 5) | bouwer | middel | LK-2, LK-20, LK-11 | de gevallen van AB r. 281-287 zijn groen; 1 kind geeft QR-versie 3 |
| LK-22 | Inleverpunt neemt WB1 aan, bewijsopslag bij de leerkracht, zonder ontvangstteken (bouwpakket 7) | kernbouwer | middel | LK-2, LK-21 | de gevallen van AB r. 327-334 zijn groen (zonder het teken); WF1 en WFC1 werken zoals voorheen |
| LK-23 | Buffer en identiteit op de eigen Chromebook (bouwpakket 8, alleen de stand eigen) | kernbouwer | klein | LK-2, LK-21 | een mislukte schrijfactie wordt gemeld; `wf.student.v1` blijft leeg |
| LK-24 | Link voor de eigen Chromebook, muur, 'Niet jij?', 'Lever in' (bouwpakket 9 deels, bouwpakket 10 de kern) | bouwer | groot | LK-8, LK-22, LK-23 | de rooktest met twee browsercontexten is groen; geen naam in een QR-code |
| LK-25 | Overzicht per doel, kaal (bouwpakket 12) | bouwer | middel | LK-2, LK-22 | 'nog geen bewijs' klopt; geen naam vóór de vraag over het bord |
| LK-26 | Klasbestand, wissen, privacytekst en GEB-tekst (bouwpakket 13) | kernbouwer | middel | LK-20, LK-22 | bewaren, wissen en terugzetten geeft hetzelfde |
| LK-27 | Review en uitrol van spoor 2 | hoofdsessie | middel | LK-24, LK-25, LK-26 | de poort is groen; alles staat live |
| LK-28 | Proefles 2 met bewijs per kind | eigenaar | klein | LK-13, LK-27 | de bevindingen staan in de Stand van zaken, met de beslissing over het ontvangstteken en de scanner |

Zolang het toestel nooit iets wist, is het ontvangstteken niet nodig. Elke 'Lever in' toont alles, en het Inleverpunt ontdubbelt (AB r. 561-562). Het toestel zegt nooit 'ontvangen'.

### Volgorde

- **Nu, naast elkaar:** LK-1, LK-2, LK-3 en LK-4, elk in een eigen worktree. Ze raken elk andere bestanden.
- **Daarna:**
  1. LK-5;
  2. LK-6;
  3. LK-7, zodra LK-0, LK-1 en LK-2 er zijn;
  4. LK-8, LK-9 en LK-10.
- **Het bezoek (LK-11):** kan zodra LK-3 online staat, en moet vóór de generale repetitie.
- **Spoor 2:** begint na proefles 1. Alleen LK-20 kan eerder, want het hangt van niets af.

## Later

- **De rest van de aanmeldpakketten.**
  - Het ontvangstteken, 'Alles opnieuw doorgeven', afsluiten en wissen op het toestel (bouwpakketten 7 en 8 volledig).
  - De scanner voor een webcam (bouwpakket 6).
  - Een bord dat niets bewaart voor gewone oefeningen en cursusblokken, en een beurt aan het bord (bouwpakket 11).
  - Verplaatsen, 'Ik zag het' en de toestellinks voor gedeelde toestellen (bouwpakketten 9 en 12 volledig).
  - Gedeelde klastoestellen, de inspreeklijst en opgenomen geluid (bouwpakketten 14 tot 16).
- **Meer Lichtkamer.**
  - Het poppenhuis en het labo (`lk-kleuter.js`, `lk-labo.js`). Eerst de metingen van de 3D-proefpagina bekijken, want die scènes zijn tot drie keer zwaarder.
  - Een oefeningsoort 'lichtkamer' in het register, als dunne schil rond dezelfde kijkdoos, met een bewuste verhoging van het budget met ±1 kB.
- **Op de lespagina.**
  - Een toestelcheck en een aanwijzer 'Klaar, ook zonder internet'.
  - 'Achter de schermen': het voorwerp kiezen en de lichtstralen meteen tonen.
  - Een klasoverzicht met echt bewijs.
- **In #/basis.** De themaleerlijn 'licht en schaduw', tellers per rubriek, 'in mijn klas' en zoeken op pakketten (`INGANG.md` r. 841-866).
- **Het GO!.** Aanbod bij de lesplannen van het GO! zodra er een lesplan over licht is (`GO-LEERPLAN.md` r. 1126).
- **Toestellen en materiaal.**
  - 3D op een echte iPad met iPadOS 14 nakijken, als de school zulke iPads gebruikt.
  - Een controlepoort voor nieuw materiaal (bouwstap 7).
- **Bewijs naar buiten.** Pas na een nieuwe privacybeoordeling (AB r. 586).

## Risico's

| Risico | Maatregel |
|---|---|
| De Chromebook toont de scène niet vlot: een schaduwkaart van 2048² met PCFSoft, nooit gemeten | De meting bij het bezoek met go of no-go; de stand 'laag', die de controller zelf kiest; `?meet` bij de generale repetitie |
| Het uitzicht verandert met r162 | Schermafbeeldingen naast het prototype; de eigenaar keurt goed vóór de proefles |
| WebGL-contexten en luisteraars lekken in de app | Eén controller per scherm die alles opruimt; een proef met twintig keer openen en sluiten |
| Een juiste meting wordt afgekeurd: '12,5' wordt '125', en 30/20/10 cm keurt af | Een tekstveld met een eigen lezer; 30/15/10 cm; tests in LK-1 |
| De les is gemaakt voor het 4de leerjaar | Een droge les, de noot en het lesverloop voor het 3de leerjaar, voorlezen, 'Lichtstralen' |
| De kinderen raken niet aan de link: het hekje breekt, of github.io wordt geblokkeerd | Het bezoek test het; een QR-code op het bord mag |
| Iemand verwacht na proefles 1 al resultaten per kind in de app | Vraag 1 vooraf; het observatieblad; het bewijsmodel ligt klaar voor proefles 2 |
| three belandt in het BasisDeel-chunk of op het leerlingpad | Alles laadt lui; de build meet het; een test houdt three uit vendor |
| Het bezoek laat op zich wachten | De bouw loopt door; alleen de generale repetitie en de standaardstand wachten |
| De omvang groeit naar poppenhuis en labo | De lijst 'Later' laten bevestigen bij LK-0 |
| Het netwerk is traag op de dag zelf | De link één keer openen bij de generale repetitie; uitrolstop van 48 uur; terugval zonder 3D |
| Spoor 2 bewaart kindcodes en bewijs | Het klasbestand en de GEB-tekst (LK-26) komen vóór proefles 2 |

## Vragen aan de eigenaar

| Nr | Vraag | Voorstel | Wat ze tegenhoudt |
|---|---|---|---|
| 1 | Mag proefles 1 lopen zonder bewijs per kind in de app? Het bewijs per kind (WB1) komt dan in proefles 2. | Ja. De kinderen zien zelf 'Wat ik al kan'. Het bewijsmodel bouwen we nu al. | of spoor 2 vóór of na proefles 1 komt |
| 2 | Welke oefeningen komen in de les? Mag het onderzoek op 30, 15 en 10 cm meten? | 'Waar valt de schaduw?' op het bord; kaartjes en onderzoek op de Chromebook; de digitale check; 30/15/10 cm. De proefleerkracht beslist mee. | de spiekkaart (LK-7) en de standaard meetpunten (LK-1) |
| 3 | Mag het prototype als proefpagina op de openbare site, niet geïndexeerd? | Ja. De pakketten mogen openbaar, de bron staat al in de repo, en de voorbeeldklas is verzonnen. | de uitrol van LK-3 en de meting bij het bezoek |
| 4 | Wanneer is het bezoek? Mogen de 3D-proef en een droge les erbij? | Zo vroeg mogelijk, met de go of no-go van hierboven. | de generale repetitie, de standaardstand, en de codes in spoor 2 |
| 5 | Werken de kinderen elk op hun eigen Chromebook of in duo? Langs welk kanaal komt de link? | De proefleerkracht kiest. Smartschool, anders een QR-code op het bord. | een regel op de spiekkaart; duo in spoor 2 |
| 6 | Mogen we three.js r162 in de eigen bundel steken? | Ja. Zo blijft 3D mogelijk vanaf Safari en iPadOS 14.1. | niets, tenzij je anders beslist vóór LK-5 start |
| 7 | Komt de Lichtkamer eerst als eigen scherm, en later pas als oefeningsoort? | Ja. Er is maar 0,3 kB ruimte op het leerlingpad, en WF1 zet een naam in de code. | niets |
| 8 | Wil je de leerplandoelen van het GO! op de spiekkaart, ter info? | Ja, met de bron, zonder te beweren dat het GO! deze les zo voorziet. | één regel op de spiekkaart |

## Afwijkingen van eerdere afspraken

- **Twee proeflessen** in plaats van één proefklas na pakket 13 (`docs/BASISONDERWIJS.md` r. 200). Dat geldt alleen als de eigenaar ja zegt op vraag 1.
- **Eerst een eigen scherm, later een oefeningsoort.** Bouwstap 5 spreekt van een oefeningsoort (r. 124); zie vraag 7.
- **Meetpunten 30, 15 en 10 cm** in plaats van 30, 20 en 10 cm (vraag 2).
- **De kindlink van proefles 1 bevat geen namen.** De link voor de eigen Chromebook met voornamen in `n=` (AB r. 388-390) komt pas in spoor 2.
