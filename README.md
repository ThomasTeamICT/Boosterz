# ⚡ Boosterz

**Geef je les een boost.** Een volledig functionele webapplicatie om **interactieve oefeningen, toetsen, spelletjes én digitale cursussen** voor je klas te maken, te delen en op te volgen. Alles draait 100% in de browser: geen server, geen account, geen installatie.

**Live:** https://thomasteamict.github.io/Boosterz/ · repository `ThomasTeamICT/Boosterz` (tot 24 september 2026 `Bookwidgetzzz`).

> Boosterz heette tot september 2026 *WidgetFabriek*. De naam en de huisstijl zijn veranderd; de opslag niet: bestaande widgets, cursussen en inzendingen (`wf.*`-sleutels in localStorage, `wf-files` in IndexedDB) blijven gewoon werken, en exportbestanden van vóór de naamsverandering importeren zonder omweg.

## ✨ Functies

### ✨ AI-assistent: van bronmateriaal naar lesmateriaal
Hét verkoopsargument: de leerkracht plakt gangbaar bronmateriaal (cursustekst, hoofdstuk,
artikel) of leerplandoelen en de AI doet het voorbereidende werk — met minimale inspanning
en maximale opvolgbaarheid.
- **AI-studio** (`#/ai-studio`): bron plakken of .txt/.md laden → widgettypes kiezen (20
  genereerbare types) → voorvertoning met vraag-linter → nakijken → in één keer bewaren in
  een map. Met doelgroep, richtaantal, leerdoelkoppeling en **differentiatie** (hints,
  steuntaal, niveaus) als opties.
- **AI in de editor**: vragen bijmaken, hints/uitleg/steuntaal aanvullen, glossarium
  destilleren, zwakke afleiders versterken, items bijmaken bij 20 widgettypes — en bij de
  **video-quiz**: plak het transcript (bv. van YouTube) en krijg kijkvragen op de juiste
  tijdstippen. De AI genereert ook de uitgebreide vraagtypes (keuzelijsten, markeren,
  sorteren, invultabellen, Likert).
- **📄 Pdf inlezen als bron**: in de AI-studio, de AI-cursusbouwer en het editorpaneel
  lees je een tekst-pdf met één knop in — de tekst verschijnt in het bronveld en de AI
  gaat ermee aan de slag (volledig client-side, de pdf verlaat het toestel niet).
- **AI-cursusbouwer**: een volledige cursus genereren **vanuit je eigen bronmateriaal**
  (cursustekst, hoofdstuk uit het handboek of een ingelezen pdf) en/of **leerplandoelen**.
  De AI volgt de opbouw van het materiaal, herschrijft in leerlingtaal en verzint er niets
  bij; met leerplandoelen erbij koppelt ze elke sectie aan een doel. Ook: een bestaande
  cursus herwerken of uitbreiden, één sectie vullen, en optioneel een oefenquiz per
  hoofdstuk (als ingebedde widgets).
- **Feedbacksuggesties** bij het nakijken: taakgericht voorstel (wat lukt, wat nog niet,
  volgende stap) — zonder leerlingnaam in de prompt; de leerkracht past aan en beslist.
- **Eigen sleutel, eigen regie**: werkt met een API-sleutel van Anthropic (Claude),
  Google (Gemini), OpenAI of elke OpenAI-compatibele aanbieder. Sleutel blijft op het
  toestel; elk gebruik staat in een tokenlogboek, ook uitgesplitst per sleutel
  (kostentransparantie). AI-uitvoer landt áltijd eerst in een voorvertoning.
- **Modelkeuze met eerlijke prijsindicatie**: van Claude Sonnet 5 (aanbevolen prijs-kwaliteit)
  over Claude Fable 5.1 en Opus 5 (sterker, duurder) tot Haiku 4.5 (snelst en goedkoopst),
  plus de Gemini-reeks. De systeeminstructie wordt gecachet, zodat een tweede generatie in
  dezelfde reeks fors goedkoper uitvalt; weigert een model een aanvraag, dan krijgt de
  leerkracht een duidelijke melding in plaats van een leeg resultaat.
- **Instel-links voor een testgroep**: deel je AI-instellingen (aanbieder, model, sleutel)
  via één link — de ontvanger hoeft niets in te stellen.

### 🎯 Leerplannen: het doelenregister waar alles aan hangt
- **Leerplannen** (`#/leerplannen`): doelenlijsten met een stabiele **code** per doel
  (bv. `NW 2.3`), rubriek/thema, niveau (basis/uitbreiding) en toelichting. Aanmaken
  blanco in een doelentabel, **uit tekst of pdf** (de AI structureert een leerplan- of
  minimumdoelentekst en behoudt de officiële nummering), of via JSON-import; export als JSON.
  De app haalt de officiële documenten niet zelf op (auteursrecht, CORS) — de pagina wijst
  naar onderwijsdoelen.be, GO!, Katholiek Onderwijs Vlaanderen, OVSG en POV.
- **De doelcode is de ruggengraat**: een cursussectie draagt `goalCodes`, een quizvraag een
  `goalCode`, een inzending levert dus score per doel, en de resultaten (en het klasoverzicht)
  tellen dat op per leerling. Vrije-teksttags blijven werken voor wie geen leerplan gebruikt.
- **Blanco vanuit leerplan**: kies een leerplan en de doelen (per thema), en de
  AI-cursusbouwer bouwt een cursus die **dekkend** is: elk gekozen doel komt in een sectie,
  niet enkel in verdieping, met een samenvatting per hoofdstuk en oefenquizzen waarvan de
  vragen hun doelcode dragen. Combineerbaar met eigen bronmateriaal.
- **Dekking**: per cursus een matrix leerplandoelen × hoofdstukken (secties én ingebedde
  oefeningen), status per doel, percentage op de cursuskaart, lijst van hiaten en de knop
  "Vul de hiaten" die de AI nieuwe secties laat schrijven voor de niet-gedekte doelen.
- **Optimaliseren** van een bestaande cursus: taal vereenvoudigen, differentiëren (basis en
  verdieping per sectie), controlevragen toevoegen, hiaten t.o.v. het leerplan vullen —
  altijd met voorvertoning, mediablokken blijven staan.
- **Oefeningen voorstellen** per sectie: de AI maakt widgets op maat van de sectie en haar
  doelen, bewaart ze en bedt ze in.

### 📥 Bestaand materiaal verwerken
- **Importpagina** (`#/importeren`): sleep of kies **.docx, pdf, markdown, tekst, html** of
  json (widget, vakgroeppakket, cursus), of plak tekst. Word-documenten worden client-side
  omgezet (mammoth, lui geladen) naar markdown met koppen, lijsten en tabellen.
- **Pdf met structuur**: pdf.js geeft losse tekstitems; `lib/pdfMarkdown.ts` maakt er markdown
  mét opbouw van. Lettergroottes worden kopniveaus (`#`, `##`, `###`), vet en cursief blijven
  bewaard (ook over een regeleinde heen), meerregelige titels worden samengevoegd, en
  opsommingsbolletjes die als klein vectorcirkeltje getekend zijn (Word, Docs, browser-pdf's)
  worden lijsten. Gescande pdf's zonder tekstlaag en afbeeldingen krijgen een duidelijke melding.
- Vervolgstappen per bron: **AI-cursus bouwen** (de tekst gaat via een overdracht naar de
  cursusbouwer, met optioneel een leerplan), **AI-oefeningen maken** (naar de AI-studio), of
  **zonder AI omzetten naar een cursus**: `#` wordt hoofdstuk, `##` of `###` sectie (instelbaar:
  een genummerde `###`-titel onder een `##`-groepstitel wordt dan de sectie), tabellen worden
  tabelblokken. Vette run-in-labels worden callouts (*Voorbeeld* → info, *Oefening/Opdracht* →
  doel, *Weetje* → tip, *Let op* → waarschuwing; *Uitleg* blijft tekst), een label dat alleen
  op zijn regel staat neemt de alinea erna mee, en een begrippenlijst ("**Term** uitleg",
  ook zonder eigen titel) wordt een termenblok.
- **Meerdere bestanden → één cursus**: elk bestand (bv. één pdf per hoofdstuk) wordt een
  hoofdstuk, in de volgorde van de lijst; een eigen `#`-titel in het bestand wint.
- **Oefeningen afleiden** (vinkje, standaard aan; `lib/deriveExercises.ts`): zonder AI en dus
  voorspelbaar. Uit elke begrippenlijst een **begrippenquiz** (welk begrip hoort bij deze
  omschrijving, met de term uit de omschrijving gemaskeerd, plus een koppelvraag) en een
  **koppelspel**; uit de vette kernbegrippen per sectie een **invuloefening**; uit de kadertjes
  “Oefening:”/“Opdracht:” een **werkblad met open vragen** dat de leerkracht nakijkt. Ze komen als
  widgetblokken in de cursus (invuloefeningen onderaan de sectie, de rest in een sectie
  “Oefeningen” per hoofdstuk) en dragen de doelcodes van hun sectie.
- **Voorbeeldcursus** (`/cursussen` → 🧪 *Voorbeeldcursus laden*): een echte cursus
  natuurwetenschappen 1e graad van een leerkracht, 14 pdf-hoofdstukken, precies via die weg
  ingelezen en daarna aangevuld met de 111 afbeeldingen uit de pdf's (als bestanden naast de
  app in `public/voorbeelden/nw/`, niet in de opslag), doelcodes van het voorbeeldleerplan op
  elke sectie, per hoofdstuk een flitskaartenset uit de begrippenlijst, de automatisch afgeleide
  oefeningen (begrippenquiz, koppelspel, invuloefeningen, werkblad met de opdrachten) én per
  hoofdstuk een reeks handgeschreven oefeningen in gemengde vormen (quiz met rangschikken,
  sorteren, invultabellen, keuzelijstjes en markeertekst; exit-ticket; toepassingswerkblad met
  rubric; memory, husselwoorden, galgje, woordzoeker, kruiswoordraadsel) op de plek in de sectie
  waar ze horen (`tools/oefeningen/h*.json`, formaat in `SCHEMA.md`, validator `valideer.py`).
  Het script dat alles samenstelt staat in `tools/build-voorbeeldcursus.py` (stap 1:
  `tools/importeer-pdfs.mjs` haalt de pdf's door de echte importpagina); de pdf's zelf zitten
  niet in de repo.
- In de quiz-editor krijgt elke vraag een leerplandoel (autocomplete), en het
  AI-editorpaneel koppelt bestaande vragen in één keer aan leerplandoelen.

### 👥 Klassen: delen en opvolgen met leerlingen en toestellen, zonder server
- **Klassen** (`#/klassen`): klaslijst plakken ("12 Naam" of "Naam" per regel), klascode,
  **opdrachten** (cursus of widget, met deadline en instructie — ook rechtstreeks vanuit het
  deelvenster van een widget of cursus). Elke leerling krijgt een vaste identiteit
  (`studentId`), zodat inzendingen en leesvoortgang niet meer aan een vrij ingetikte naam hangen.
- **Klaslink, QR of klaspakket**: één link (of bestand) met de klaslijst én alle opgedragen
  cursussen en widgets, media inbegrepen. Op eender welk toestel opent die de **leerlinghub**
  (`#/leerling/:code`): naam kiezen uit de lijst, opdrachten met deadlinebadges, en een sectie
  **Inleveren** met de resultaat- en voortgangscodes als QR-code.
- **Inleverpunt** (`#/inleverpunt`): de leerkracht plakt véél codes tegelijk (ontdubbeld, met
  per code leerling, klas, score of voortgang) of **scant de QR-codes** op de schermen van de
  leerlingen met de camera (BarcodeDetector, met jsQR als terugval). Werk voor een onbekende
  widget wordt nooit weggegooid.
- **Klasoverzicht** (`#/klas/:id`): matrix leerlingen × opdrachten (niet gestart, bezig,
  ingediend, score, leesvoortgang), per leerling de **score per leerplandoel** over alle
  opdrachten heen, openstaand nakijkwerk, CSV-export.
- Bewust serverloos: niets verlaat het toestel behalve wat de leerkracht of leerling zelf
  deelt (link, QR, code). Live synchronisatie tussen toestellen is uitgewerkt als
  **klaskanaal** (relay met end-to-end-encryptie, contract in `src/lib/sync/types.ts`,
  ontwerp in [docs/KLASKANAAL.md](docs/KLASKANAAL.md)) en wacht op een beslissing van de school.

### 📚 Cursusmodule: digitale cursussen (BrightBook-achtig, en verder)
- **Authoring**: hoofdstukken → secties → 16 bloktypes (kop, tekst met markdown,
  afbeelding, video, audio, extern kader, kadertjes, citaat, tabel, kolommen, uitklapper,
  begrippenlijst, afvinklijst, bijlage, scheiding, **ingebedde widget**).
- **Ingebedde oefeningen**: elke widget speelt inline in de cursus; inzendingen lopen
  gewoon door de resultaten- en leerdoelenanalyse.
- **Pdf's als bronmateriaal**: upload een pdf (of link naar één) in het **gesplitste
  werkblad** — met **markeerstiften**: de leerkracht legt een kleurenlegende vast
  ("geel = hoofdtitel, blauw = auteur, …"), de leerling markeert in de pdf zelf en de
  markeringen komen mee in de inzending. Ook als **pdf-blok in cursussen** (bladeren,
  zoomen, openen in nieuw tabblad). Uploads staan in IndexedDB (ruim genoeg voor echte
  documenten); voor delen over toestellen heen gebruik je een pdf-URL of geeft de
  leerling het bestand zelf op — de app vraagt er netjes om.
- **Leerdoelen per sectie** en keuzesecties (verdieping, telt niet mee voor "afgewerkt"),
  met een **doelendekking-matrix** in de editor (welke leerplandoelen zijn gedekt, welke
  secties dragen nog geen doel).
- **Delen per hoofdstuk** via draagbare link (ingebedde widgets reizen mee; hoofdstukken
  voegen bij de leerling samen), klascode, QR, **insluitcode voor Smartschool/Moodle**,
  of cursusbestand voor collega's. Printbare versie inbegrepen.
- **Voor de leerling**: zoeken in de cursus, privénotities per sectie (lokaal,
  exporteerbaar, nooit in de voortgangscode) en het toegankelijkheidsmenu.
- **Voortgang volgen**: matrix leerlingen × secties (gelezen/geopend), kijktijd als
  context, per-sectieoverzicht ("waar haakt de klas af?"), widgetresultaten, CSV-export
  en **voortgangscodes** voor thuiswerk — transparant: de leerling ziet wat jij ziet.

### 38 widgettypes, in 5 categorieën

| Categorie | Widgets |
|---|---|
| 📝 **Toetsen & opdrachten** | Quiz · Werkblad · Gesplitst werkblad (bron naast vragen) · Video-quiz (video pauzeert op vragen) · Gesplitst whiteboard · Exit-ticket · Dictee (spraakstem) · Peiling |
| 🎮 **Spelletjes** | Flitskaarten · Kruiswoordraadsel · Woordzoeker · Memory · Galgje · Koppelspel · Husselwoorden · Bingo · Legpuzzel · Zoek de verschillen |
| 🖼️ **Beeld & media** | Tijdlijn · Hotspot-afbeelding · Whiteboard · Fotocarrousel · Afbeeldingsviewer (pan/zoom) · Voor/na-vergelijker · Framesequentie · Tip-tegels · Willekeurige afbeeldingen · Videospeler (YouTube/Vimeo) |
| 🧮 **Rekenen & wiskunde** | Rekenoefening (sommen & maaltafels) · Actieve plot (functiegrafieken met parameter-schuivers, eigen veilige formule-parser) · Grafiek (staaf/lijn/taart, leerlingen kunnen data aanpassen) |
| 🧑‍🏫 **Klashulpjes & projecten** | Rad van fortuin · Klastimer · Checklist · Planner · WebQuest · Mindmap (bekijken of zelf bouwen) · Piano (WebAudio) |

### De quiz ondersteunt 19 vraagtypes
Meerkeuze · meerdere antwoorden · juist/onjuist · kort antwoord · open vraag (manueel beoordeeld, met **rubrics**) · invuloefening met gaten `[zo|alternatief]` · koppelparen · rangschikken · getal met tolerantie · schuiver · infoblok — plus de uitgebreide familie: **keuzelijst-in-zin** `{juist|afleider}` · **woorden markeren** in een tekst (klikbaar, met of zonder puntenaftrek) · **sorteren in categorieën** (tikken, geen slepen nodig) · **invultabel** (per cel vast of invulbaar, `|`-alternatieven) · **aanduiden op afbeelding** (zones met straal) · **stellingenmatrix** (Likert, met presets) · **beoordeling met sterren** · **bestand inleveren** (komt in de nakijkcockpit). Vijftien types worden automatisch verbeterd; open vragen, audio-/tekenantwoorden en ingeleverde bestanden kijk je na in de cockpit. Per vraag: afbeelding, punten, uitleg bij feedback, **hint**, **leerdoel-tag** en **niveau** (voor routes), plus een **voorleesknop** (TTS, instelbaar tempo). Extra: **zekerheidsgraad** met kalibratiefeedback, **getrapte feedback** (controleren per vraag: fout → hint + tweede kans → oplossing), **niveauroutes** (leerling kiest route 1/2/3), **vragenpool**, **oefen-je-fouten**-ronde, **foutenanalyse door de leerling**, score **per leerdoel**, vraagbank-import en bulk-import via geplakte tekst. De editor bevat een **vraag-linter** die bekende constructiefouten signaleert; resultaten tonen **distractor-analyse** en een **doel-heatmap**, en open vragen kijk je na in een **nakijkcockpit** met herbruikbare feedbackbank. Nieuw materiaal start je vanuit een **sjabloonbibliotheek** (3-2-1 exit-ticket, diagnostische instap, herhaalquiz met pool, …).

### Voor de leerkracht
- **Dashboard** met mappen (kleuren), zoeken, dupliceren, omzetten (quiz ↔ werkblad ↔ exit-ticket), verwijderen
- **Editor** met live voorbeeldmodus ("Uitproberen"), automatisch opslaan en per-widget instellingen:
  accentkleur, instructies, schudden, feedback/score tonen, **tijdslimiet**, **maximum aantal pogingen**, naamverplichting, **toetsmodus** (volledig scherm + registratie venster-verlaten, transparant voor de leerling) en **deadline**
- **Resultaten**: scoreoverzicht per leerling, per-vraagstatistieken, live "nu bezig"-overzicht (zelfde toestel), detail per inzending met zekerheid/hintgebruik, **manuele beoordeling** met **rubrics**, feedback voor de leerling, **CSV-export** (ook anoniem voor teamoverleg)
- **Afdrukken/PDF** van quiz-familie, blanco of met correctiesleutel
- **Delen**: klascode (6 tekens) · **draagbare link** (widget zit gecomprimeerd in de URL, werkt op elk toestel) · **QR-code** · Google Classroom-knop · e-mail · **embed-code** (iframe) · JSON-bestand voor collega's
- **Resultaatcode**: leerlingen die thuis via de draagbare link werkten, sturen hun inzending als gecomprimeerde code terug — plakken bij de resultaten en klaar

### Voor de leerling
- Startscherm met naam ("voornaam volstaat"), instructies, tijdsindicatie en een kindvriendelijke privacy-uitleg
- **Opslaan & hervatten**: tussentijds werk blijft bewaard bij herladen of stroomonderbreking; "opnieuw beginnen" op gedeelde toestellen
- Voortgangsbalk, aftellende timer, automatisch indienen als de tijd om is
- Directe feedback met juiste antwoorden en uitleg; **oefen-je-fouten**-ronde; kalibratiefeedback bij zekerheidsgraad
- **Toegankelijkheidsmenu**: tekstgrootte, ruimere letterafstand en rustmodus (minder beweging) — per toestel onthouden

### Hulp & onboarding
Een ingebouwde **"Aan de slag"-pagina** (menu → Hulp) met de drie kernflows en veelgestelde
vragen (gegevens, AI-kosten, thuiswerk-codes, delen met collega's, LMS-insluiting, back-ups).

### UX & toegankelijkheid
- Modern, rustig ontwerp met **licht/donker/automatisch thema**
- Volledig **toetsenbordbedienbaar** (focusstijlen, focus-trap in modals, pijltjesnavigatie in het kruiswoordraadsel, spatie om flitskaarten te draaien)
- ARIA-rollen en live-regions voor schermlezers, `prefers-reduced-motion` wordt gerespecteerd
- **Voorleesknop** (TTS) per vraag en accenttekens-balk voor taalvakken
- Responsief tot op smartphoneformaat; speelvlakken scrollen horizontaal waar nodig

### Didactische onderbouwing
Zie [`DIDACTIEK.md`](./DIDACTIEK.md): welke features didactisch onderbouwd toegevoegd zijn
(formatieve evaluatie, UDL, zelfregulatie, werkdruk, AVG), de roadmap, én wat bewust
**niet** gebouwd is (leaderboards, zware proctoring, streaks/XP).

### Privacy (AVG)
Alles staat lokaal in de browser; de app heeft een eigen **privacypagina** met uitleg in
mensentaal, opschoonknoppen (inzendingen wissen, alles wissen) en een printbare one-pager
voor directie of ouders. CSV kan ook **zonder namen** geëxporteerd worden.

## 🚀 Starten

```bash
npm install
npm run dev        # ontwikkelserver op http://localhost:5173
npm run build      # productie-build in dist/
npm run preview    # productie-build lokaal bekijken
```

**Rooktest** (Playwright, ±100 checks over alle flows incl. foutpaden):

```bash
npm run build && npx vite preview --port 4173 &
node tests/smoke.mjs        # evt. PW_CHROMIUM=/pad/naar/chromium
```

De app is **code-gesplitst**: de hoofdbundel (±95 kB gzip) bevat alleen de leerlingroutes;
widgetmodules en leerkracht-pagina's laden als aparte chunks wanneer ze nodig zijn.
Een mislukte chunk-load (bv. door een nieuwe deploy) herstelt zichzelf met één automatische
herlaadbeurt.

De app gebruikt een **hash-router** en een relatieve basis-URL, dus de `dist/`-map kan op eender welke statische hosting geplaatst worden (GitHub Pages, Netlify, schoolserver, …) — ook in een submap.

## 🎨 Huisstijl

- **Naam en beeldmerk**: Boosterz, met een bliksemschicht op een vlak in het merkverloop (violet → oranje). Het woordmerk schrijft de *z* in de accentkleur. Alles staat in `src/components/Brand.tsx` (`BRAND`, `BrandMark`) en wordt gebruikt in de leerkrachtschil, de leerlingpagina's en de laadschermen.
- **Kleur**: elektrisch violet (`--brand`) als merkkleur, "boost"-oranje (`--accent`) enkel in het beeldmerk, de AI-knoppen en de kopregel van de startpagina. Betekeniskleuren (ok, warn, err) blijven groen, amber en rood; beide thema's (licht/donker) zijn afgestemd.
- **Letter**: Atkinson Hyperlegible voor lopende tekst (ontworpen voor leesbaarheid, ook bij dyslexie), Outfit voor koppen, knoppen en het woordmerk. Beide staan in de app zelf (`src/assets/fonts/`, OFL-licentie): geen verbinding met Google, en ze werken offline.

## 🗂️ Architectuur

```
src/
  lib/            types, localStorage-laag, deellinks (lz-string), beoordeling, seed,
                  ai (providerlaag + streaming), aiWidgetGen (schema's + sanering),
                  aiCourse (cursusgeneratie), courseTypes + courses (cursusmodel/opslag/delen),
                  markdown (veilige mini-markdown)
  components/     ontwerpsysteem-componenten (modals, toasts, velden, score-ring),
                  aiCommon, AIEditorPanel, course/ (BlockRenderer, deel- en AI-modals)
  widgets/        registry + per widgettype één module met Editor & Player
  pages/          landing, dashboard, nieuw, editor, speler, meedoen, resultaten,
                  AI-studio, AI-instellingen, cursussen (overzicht/editor/viewer/volgen/print)
  styles/         global.css — volledig eigen ontwerpsysteem met CSS-variabelen
```

Elk widgettype registreert zich in `src/widgets/registry.tsx` met metadata, standaardconfiguratie, een **Editor**-component (leerkracht) en een **Player**-component (leerling). Een nieuw widgettype toevoegen = één module schrijven + één registratie.

### Gegevensopslag
Alles staat in `localStorage` (`wf.*`-sleutels): widgets, mappen, inzendingen, pogingen, cursussen, leesvoortgang, AI-instellingen en voorkeuren. Bij het eerste bezoek worden voorbeeldwidgets en een voorbeeldcursus geplaatst zodat je meteen kan verkennen.

**Afbeeldingen, audio en bijlagen** staan niet in `localStorage` (dat biedt ±5 MB voor de hele app) maar als blob in IndexedDB (`lib/mediaStore.ts`, zelfde database als de pdf's). In de opgeslagen JSON staat alleen een verwijzing `wfmedia:m_…`; bij het lezen wordt die (via een JSON-reviver in de opslaglaag) een `blob:`-URL, zodat geen enkele widget iets van de opslag hoeft te weten. Uploads worden verkleind (max. 1400 px) en hergecodeerd als WebP/JPEG wanneer dat kleiner is. Draagbare links en exportbestanden krijgen de media weer als data-URL ingebed (`inlineMedia`), en data-URL's die binnenkomen via import, link, AI of resultaatcode worden na het bewaren automatisch verhuisd — dat is meteen de migratie van oudere opslag. Blobs waar niets meer naar verwijst worden bij het opstarten opgeruimd (met een leeftijdsgrens van 10 minuten).

### Beperkingen (bewust, door de serverloze opzet)
- Inzendingen en leesvoortgang komen alleen bij de leerkracht terecht als leerling en leerkracht **dezelfde browseropslag** delen (klascode-scenario) — bij de draagbare link blijven resultaten op het toestel van de leerling. Daarvoor zijn er **resultaatcodes** en **voortgangscodes**.
- "Live" meekijken tijdens het maken is er niet; resultaten verschijnen na het indienen.
- De AI-functies vragen een internetverbinding en een eigen API-sleutel; zonder sleutel blijft de app volledig offline werken.

## ✅ Kwaliteitscontrole
- `npm run build` — TypeScript strict + Vite-build zonder waarschuwingen
- Playwright-rooktest (37 checks) over de volledige flow: landing → dashboard → editor → voorbeeldmodus → leerlingflow via code → resultaten & beoordeling → kruiswoord/woordzoeker/memory/rad/rekenen → nieuwe widget maken → draagbare deellink → joinpagina → donker thema. Zonder console-fouten.
