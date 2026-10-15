# Eenvoudige ingang "Nieuwe cursus" (oktober 2026)

De eigenaar (15 oktober 2026), na het testen voor een demo: "over het algemeen gaat dit nog te moeilijk werken voor de gemiddelde
leerkracht, dus we moeten een betere manier vinden." Een gewone leerkracht denkt in "ik geef Nederlands in 1B en wil een cursus over
begrijpend lezen", niet in sets, minimumdoelen, leerplannen of beroepskwalificaties. De app moet die vertaling zelf maken.

Afgesproken werkwijze: (1) proefleerkrachten in de echte app, (2) voorstellen voor de ingang met schetsen, de eigenaar kiest,
(3) bouwen in stappen met review en rechter. Daarnaast: de AI-cursusbouwer in etappes (eerst het kader, dan per hoofdstuk), zie § 3.

## Stand van zaken

| Wat | Stand | Op wie |
|---|---|---|
| Proefleerkrachten (vier personas, zonder AI-sleutel) en synthese | **Klaar** (15 oktober 2026): § 2 | agents |
| Verkenning AI-cursusbouwer (waarom hij vastloopt) | **Klaar** (15 oktober 2026): § 3 | agents |
| Snelle verbeteringen uit § 2.5 | **Bezig** (15 oktober 2026, akkoord van de eigenaar); de telling van code 0000 apart (eerst nakijken) | bouwers, reviewers, rechter |
| Voorstellen voor de ingang "Nieuwe cursus" (met schetsen) | Wacht op de eigenaar | hoofdsessie |
| Beslissing: "widget" of "oefening" in de schermen van de leerkracht (§ 2.3) | **Beslist** (15 oktober 2026): "oefening" overal; CLAUDE.md aangepast. Omzetting van de schermteksten: na de snelle verbeteringen | eigenaar; bouwers |
| Sturender samenstellen en de brug naar een cursus (LEERPLANNEN.md § 16) | **Klaar en live** (15 oktober 2026) | bouwers, hoofdsessie |

## 1. Waarom

Zie de vraag hierboven. De proef in § 2 bevestigt het: alle vier de nagespeelde leerkrachten haalden hun doel, maar niemand
vond de weg via de startpagina, en elk twijfelde over welke ingang, welke "set" hun vak is en welk dekkingscijfer klopt.

## 2. Proefleerkrachten: synthese (15 oktober 2026)

Vier nagespeelde leerkrachten probeerden de app zonder AI-sleutel. Het waren AI-agents met een persona, geen echte leerkrachten. Ze lazen alles aandachtig, dus echte leerkrachten haken waarschijnlijk eerder af. De verwijzingen naar bestanden en regels komen uit de verslagen. Een deel heb ik nagekeken in de code: global.css, opvolgen.css, coverage.ts, GoalCoverage.tsx, richtingCursus.ts, ShareModal.tsx, StartPage.tsx en vakZoektabel.ts.

### 2.1 Bereikt een gewone leerkracht vandaag zijn doel?

Ja: alle vier maakten zonder AI-sleutel een cursus met de juiste officiële doelen, maar niemand vond de weg via de startpagina. Ze gingen allemaal via "Nieuw" rechtsboven, en elk van hen twijfelde onderweg over welke ingang de juiste is, welke "set" hun vak is en welk dekkingscijfer klopt.

| Leerkracht | Doel bereikt | Waarom |
|---|---|---|
| Nederlands 1B (lezen) | Ja | Het kortste pad was ongeveer 10 klikken. Ze gokte bij "Cursus voor een studierichting". De dekking zei "alles dekkend" voor een lege cursus. |
| Praktijk Onthaal en recreatie, 5de jaar | Ja | Ongeveer 20 klikken tot een cursus met 6 competenties. Een vergeten competentie kon niet bij de bestaande cursus ("onbekende code"). |
| LO, 3de graad | Ja | Ongeveer 60 handelingen, klas inbegrepen. Ze moest raden dat "Lichamelijke en geestelijke gezondheid" LO is. De grote klascode werkt niet op de gsm van de leerlingen. |
| Aardrijkskunde, cursus uit Word | Ja, met een omweg | Het Word-bestand stond er na 5 klikken. De doelen pas na een omweg langs een ander tabblad, en daarna elk hoofdstuk zelf koppelen. |

### 2.2 Struikelpunten, van zwaarst naar lichtst

Zwaarte betekent hier: wat het kost als het misloopt. Daarna telt hoeveel leerkrachten erop botsten.

**1. De cijfers over de dekking spreken elkaar tegen en voelen als een verwijt (4 van 4)**
- **Citaat:** "Dekkend: alle 6 doelen komen aan bod." en "Dekking 100% (6/6)". In dezelfde cursus staat ook "Deze cursus dekt 0 van de 12 competenties (0 %)".
- **Wat er gebeurt:**
  - Een lege sectie met een doel telt in de tab Leerplan en op het cursuskaartje als gedekt, maar elders als gepland.
  - Doelen die de leerkracht bewust koos, geven "33%" of "43%".
  - De pagina van de richting telt de doelen van alle vakken: "3 van de 200", "Plan de 197 doelen", "2 van de 160".
  - Verder: 19 of 24 voor hetzelfde aantal, het kopje "Cursussen die niet meetellen", en een "doel 0000" dat eigenlijk uitleg is.
- **Oorzaak:**
  - `src/lib/coverage.ts:184-188` telt een lege sectie bewust als gedekt (commentaar op 192-196). `src/components/course/GoalCoverage.tsx:198` zet die zin vet.
  - Het kaartje: `src/pages/CoursesPage.tsx:114-120` en `398-399`.
  - De richting: `src/lib/dekkingMinimumdoelen.ts:287` en `src/lib/dekkingWeergave.ts:200`.
  - 19 tegen 24: `src/components/richting/bk/BkLijst.tsx:88-91`. "Telt niet mee": `src/lib/bkWeergave.ts:436`.
  - Code 0000 zit in 46 officiële sets.
- **Wat zou helpen:**
  - Overal dezelfde drie woorden: uitgewerkt, gepland (nog leeg), nog niet.
  - Eerst rekenen tegen de doelen die de leerkracht zelf koos ("Jouw vak: 3 van 7"). De hele richting pas op een tweede regel: "alle vakken samen, ook die van je collega's".
  - Doel 0000 tonen als uitleg bij de set en niet meetellen.

**2. Delen: de grote code werkt niet op het toestel van de leerling (2 van 4)**
- **Citaat:** "Geen opdracht, cursus of klas gevonden met code 49F9VU op dit toestel."
- **Wat er gebeurt:**
  - De code staat groot in beeld, met een QR-code.
  - Wat wel werkt, het klaspakket, staat lager: een link van 2.735 tekens, zonder QR-code.
  - De startpagina belooft "een code van 6 tekens".
  - Bij delen staat de voorbeeldklas al gekozen.
  - "Losse code (zelfde toestel/browser)" is onduidelijk.
  - De LO-leerkracht schatte in dat dit in de les fout zou lopen.
- **Oorzaak:** `src/pages/ClassDashboardPage.tsx:603-617` en `626`, `src/pages/StartPage.tsx:216`, `src/pages/JoinPage.tsx:40`, `src/components/ShareModal.tsx:267` en `src/components/course/CourseShareModal.tsx:78`.
- **Wat zou helpen:**
  - Eerst vragen: "Werken je leerlingen op hun eigen toestel?"
  - Dan de link die werkt bovenaan zetten, met een kopieerknop en "plak in Smartschool".
  - De startpagina eerlijk maken.
  - De voorbeeldklas nooit vooraf kiezen.

**3. Doelen kiezen en later aanvullen (4 van 4)**
- **Citaat:** "BK-0390-2.11 onbekende code" en "Geen cursus van deze richting heeft een van de gekozen competenties in haar leerplan."
- **Wat er gebeurt:**
  - Bij het maken kies je alleen hele sets. Nederlands en LO moesten achteraf doelen loskoppelen, met 33% en 43% als gevolg.
  - De praktijkleerkracht kreeg een officiële competentie van haar eigen beroep niet in haar cursus.
  - De aardrijkskundeleerkracht moest in een ander tabblad een set "als leerplan bewaren". Die set verscheen pas in haar cursus na sluiten en opnieuw openen.
- **Oorzaak:**
  - Per doel kiezen kan alleen in een ander scherm: `src/components/richting/NieuweRichtingCursus.tsx:982`.
  - Doelen komen alleen uit het leerplan van de cursus: `src/components/curriculum/GoalCodeInput.tsx:82` en `118-124`, `src/lib/bkWeergave.ts:569`.
  - De lijst met leerplannen laadt maar één keer (`src/pages/CourseEditorPage.tsx:1161`), en "Leerplannen beheren" opent een nieuw tabblad (`:1191`).
- **Wat zou helpen:**
  - Per doel aan- en uitvinken bij het maken van de cursus.
  - Een doel van hetzelfde vak of beroep toevoegen breidt het leerplan stil mee uit.
  - Officiële doelen kiezen zonder de cursus te verlaten.

**4. De tabel met de dekking verbergt de status (3 van 4)**
- **Citaat:** "LEERPLANDOEL · 09.01 DE LEERLINGEN ANALYSEREN DEMOGRAFISCHE PROCESSEN …"
- **Wat er gebeurt:** de doelen staan in hoofdletters op één lange regel. De kolommen per hoofdstuk en de kolom "gedekt" vallen buiten beeld, op de gsm helemaal.
- **Oorzaak:**
  - `src/styles/global.css:924-928` zet hoofdletters en "niet afbreken" op elke tabelkop.
  - De correctie voor de eerste kolom staat alleen in `src/styles/opvolgen.css:69-73`. Die stijl laadt pas na een bezoek aan de klas- of resultatenpagina (`ClassDashboardPage.tsx:41` en andere).
  - Dat verklaart waarom de LO-leerkracht, die eerst haar klas had gemaakt, wél een nette tabel zag. Ik heb dat nagekeken op haar schermafdruk `(schermafdruk van de proef, niet bewaard)`.
- **Wat zou helpen:** die correctie naar `global.css` verhuizen. Klein werk, grote winst.

**5. De ingang vinden en "waar is mijn vak?" (4 van 4)**
- **Citaat:** "Voor deze richting gelden 200 minimumdoelen uit 20 sets."
- **Wat er gebeurt:**
  - De startpagina spreekt niet over een cursus maken of over Word.
  - Voor 1B voelt "studierichting" als de verkeerde knop.
  - Vakken staan nergens met hun naam: LO heet "Lichamelijke en geestelijke gezondheid", aardrijkskunde heet "Ruimtelijk bewustzijn".
  - Zoeken op "lichamelijke opvoeding" geeft een oude set van het buitengewoon onderwijs uit 2002.
  - De lijst van 411 sets begint met buitengewoon onderwijs en volwassenenonderwijs.
  - De praktijkleerkracht ziet eerst 76 doelen van de algemene vakken, met een knop die daar een cursus van maakt. Het venster begint over minimumdoelen en vult "Onthaalmedewerker" in als vak.
- **Oorzaak:**
  - Startpagina en menu: `src/pages/StartPage.tsx:251`, `src/components/Layout.tsx:182`.
  - Zoeken: `src/lib/vakZoektabel.ts:35` (kent alleen "lichamelijke", "sport", "turnen") en `src/lib/minimumdoelenBron.ts:267`.
  - Volgorde van de sets: `src/pages/MinimumdoelenPage.tsx:111`.
  - Het venster: `src/components/richting/NieuweRichtingCursus.tsx:350` en `716`.
  - De knop staat pas onder de sets: `src/components/richting/RichtingDoelen.tsx:426`.
- **Wat zou helpen:**
  - Vooraan vragen naar het vak, in de woorden van de leerkracht. Dat veld bestaat al in het venster en werkte bij Nederlands en LO.
  - Bij een praktijkrichting eerst vragen: "algemeen vak of praktijk?"

**6. Wat de opbouw klaarzet en wat de leerling ziet (2 van 4)**
- **Citaat:** "01.01 — De leerlingen passen technieken voor levensreddend handelen toe in een gesimuleerde leero…"
- **Wat er gebeurt:**
  - Het kadertje met de doelen dat leerlingen zien, toont na het loskoppelen nog alle doelen, afgeknipt midden in een woord.
  - De sectie heet "Doelen" en het hoofdstuk krijgt de naam van de set.
  - De leerling ziet "Voorbeeld:" in de titel en een uitleg die voor de leerkracht bedoeld is.
- **Oorzaak:**
  - `src/lib/richtingCursus.ts:46` en `514` knippen af op 90 tekens; `:523` zet het kadertje één keer en werkt het daarna niet meer bij; `:51` en `:519` geven de namen.
  - `src/pages/CourseEditorPage.tsx:865-869` past bij het loskoppelen het kadertje niet aan.
  - `src/components/course/BlockRenderer.tsx:732-733` toont de uitleg voor de leerkracht op het leerlingscherm.
- **Wat zou helpen:** het kadertje laten volgen uit de doelen van de sectie, met volledige zinnen, en de cursustitel als naam gebruiken.

**7. Zonder AI-sleutel lijken de AI-knoppen klaar (4 van 4)**
- **Citaat:** "AI-assistent nog niet ingesteld … Voeg één keer een API-sleutel toe"
- **Wat er gebeurt:**
  - Vijf paarse AI-knoppen zien er even bruikbaar uit als de rest.
  - De praktijkleerkracht liep vast bij "Stel oefeningen voor": het venster biedt geen weg zonder AI.
  - De aardrijkskundeleerkracht kreeg zonder AI geen enkel voorstel welk doel bij welk hoofdstuk past.
- **Oorzaak:** `src/components/course/GoalCoverage.tsx:212-216`, `src/pages/CourseEditorPage.tsx:522` en `src/components/aiCommon.tsx:16-20`.
- **Wat zou helpen:** zonder sleutel de knoppen rustiger tonen met "(AI-sleutel nodig)", en in het venster de weg zonder AI aanwijzen: "Blok toevoegen > oefening".

**8. Word omzetten: kleine missers (1 van 4)**
- De Word-stijl "Titel" wordt niet herkend. De titelregel wordt een extra hoofdstuk en de cursus heet "Hoofdstuk 1: …" (`src/lib/mammothDocx.ts:34`, `src/lib/importers.ts:648`).
- Elk hoofdstuk krijgt één sectie "Inleiding" (`importers.ts:656`).
- "Opdracht:" werd geen werkblad, hoewel het scherm dat belooft (`src/lib/deriveExercises.ts:201` en `214`).

**9. De leerkracht op de gsm (2 van 4)**
- De kopbalk van de cursuseditor neemt 246 van de 844 pixels in (`CourseEditorPage.tsx:395`, `global.css:423`).
- De tabel met de status per leerling verbergt de statuskolom (`ClassDashboardPage.tsx:278`).

**10. Kleinigheden**
- Er verschijnt vanzelf een voorbeeldcursus tussen de eigen cursussen (`CoursesPage.tsx:79-82`).
- "Nieuwe widget maken" opent zonder melding een nieuw tabblad (`blockEditors.tsx:883`).
- Het doel van een quizvraag zit verstopt onder "Extra", en er staat "11 vraagtypes" terwijl de lijst er 20 toont (`quiz.tsx:893`, `registry.tsx:95`).
- Codes als ZX52BU staan er zonder uitleg.
- "Kennis en vaardigheden (10 + 14)" zegt niet wat de getallen betekenen.

### 2.3 Jargon

| Woord in de app | Botsten erop | Voorstel |
|---|---|---|
| minimumdoelen | 4 | "eindtermen" of "officiële doelen (eindtermen)": het woord dat leerkrachten kennen |
| set, sets, ODS_3351 | 4 (nummer: 3) | De naam van het vak tonen. Set en nummer verbergen. Bij een vreemde naam het vak erbij: "(o.a. LO)", "(aardrijkskunde)". |
| finaliteit, duaal mogelijk, opleidingsvorm, ontwikkelingsdoelen | 4 / 3 / 4 / 2 | Verbergen. Als filter: "gericht op verder studeren / op werk / allebei". |
| doelcode, leerplandoelen (codes) | 4 | "Doelen van deze sectie", met de code klein achter de zin |
| dekking, dekkend, gedekt, gepland, hiaten | 4 | "uitgewerkt / gepland (nog leeg) / nog niet", en "wat nog ontbreekt" in plaats van "hiaten" |
| nagekeken leerplan, leerplan bewaren | 4 | Verbergen: de app maakt het leerplan zelf |
| geraamte, rubriek | 3 / 2 | "Een lege opbouw met je doelen al klaar" |
| widget | 4 | "Oefening" op de startpagina en bij "Blok toevoegen". Let op: CLAUDE.md houdt "widget" in de schermen van de leerkracht. De proef wijst de andere kant op; dat is jouw keuze. |
| verdiepings-/keuzesectie | 4 | "Extra sectie (telt niet mee voor afgewerkt)" |
| feed-up | 4 | "Wat leer je hier?" |
| Optimaliseer, Herwerk met AI, API-sleutel | 4 / 2 | Zonder sleutel verbergen, of "(AI-sleutel nodig)" erbij zetten |
| JSON openen, insluiten, inleverpunt | 4 / 2 / 3 | Naar "Gevorderd", of kort uitleggen bij het woord |
| klascode, losse code, klaslink, klaspakket, draagbare link, voortgangscode | 2 | Eén begrip: "link voor je leerlingen" en "code (werkt alleen op dit toestel)" |
| API Structuuronderdelen, G-0308, BK-0390-2 | 3 | Verbergen |

"Beroepskwalificatie" mag blijven. De praktijkleerkracht kende het van de visitatie en vond de uitleg in gewone taal goed.

### 2.4 Wat goed werkt en moet blijven

- **Menu Nieuw:** "Cursus voor een studierichting" en "Pdf of Word omzetten". Alle vier vonden daar hun weg.
- **Een richting zoeken** vindt ze meteen ("onthaal", "Economie-moderne talen"), en 1B staat bovenaan.
- **Het vakveld in het venster** vinkt zelf de juiste set aan, met de eerlijke uitleg "een hulp bij het kiezen, geen officiële koppeling". De LO-leerkracht noemde dat "het knappe moment".
- **De zoekhint** "aardrijkskunde vindt ook Ruimtelijk bewustzijn".
- **De doelen letterlijk, met hun bron.** De beroepskwalificaties staan in gewone taal, met herkenbare competenties en een teller bij het kiezen.
- **Een cursus in één klik, zonder AI-sleutel,** met een duidelijke bevestiging. Word omzetten in 5 klikken, alles blijft op het toestel, en de privacy wordt uitgelegd.
- **Automatisch bewaren.**
- **Kant-en-klaar materiaal:** de oefening over de honingbij. Een quiz uit een ander tabblad verschijnt meteen in de cursus.
- **De schermen die het onderscheid wél maken:**
  - "Gedekt in 'Begrijpend lezen'"
  - "Gepland in … (de sectie is nog leeg)"
  - de filter "Nog niet gedekt" met rode kruisjes
  - "Mijn richtingen"
  - "2 van 9 gedekt, dit ontbreekt nog"
- **Een klas maken met een geplakte namenlijst.** Een leerling kiest zijn naam zonder account.
- **"Als leerling" en de leerlingschermen** werken op de gsm zonder zijwaarts scrollen.
- **"Plan ze in deze cursus"** legt eerst uit wat er gebeurt. Smartschool staat er letterlijk bij het delen.
- **Geen foutmeldingen** tijdens de proeven.

### 2.5 Wat dit betekent voor "Nieuwe cursus"

De bouwstenen bestaan al: een richting zoeken, het vakveld dat de doelen voorstelt, een cursus in één klik en Word omzetten. De nieuwe ingang moet ze vooral in de juiste volgorde zetten en de vakwoorden weghalen.

**Eisen: dit moet de ingang oplossen**
1. **Een grote knop "Nieuwe cursus" op de startpagina.** Alle vier zochten hem daar.
2. **Voor wie:**
   - Leerjaar en richting in gewone woorden: 1B, 5 Onthaal, 3 Economische wetenschappen. Geen "studierichting" voor de 1ste graad.
   - Meer dan één richting moet kunnen; de aardrijkskundeleerkracht geeft les in vier richtingen.
   - Bij een praktijkrichting de vraag "algemeen vak of praktijk?". Praktijk leidt naar de competenties van het beroep.
3. **Waarover:**
   - Het vak in eigen woorden: "LO", "lichamelijke opvoeding", "aardrijkskunde", "praktijk onthaal".
   - De app kiest de officiële doelen en toont ze als volledige zinnen, met een vinkje per doel.
   - Geen sets en geen nummers.
4. **Hoe starten:** met een lege opbouw met de doelen, uit Word of pdf, of met een kant-en-klare oefening.
   - Bij Word zijn de doelen dan al gekozen, zodat de omweg langs een ander tabblad verdwijnt.
   - AI alleen tonen als er een sleutel is.
5. **Het leerplan maakt de app zelf, onzichtbaar.** Later een doel van hetzelfde vak of beroep toevoegen moet gewoon kunnen, zonder "onbekende code".
6. **Eén telling vanaf de eerste minuut:** uitgewerkt, gepland en nog niet, tegen de doelen die de leerkracht zelf koos.
7. **Een opbouw met bruikbare namen** (de cursustitel, niet "Doelen") en een kadertje dat de doelen volgt.
8. **Afsluiten met "Geef aan je klas"**, met de link die op het toestel van de leerling werkt.

De app kan vandaag bij het vak de juiste set voorstellen. Per hoofdstuk of per sectie een doel voorstellen zonder AI kan ze nog niet. De aardrijkskundeleerkracht stelde voor om op kernwoorden te zoeken, bijvoorbeeld "broeikaseffect" bij doel 09.06. Dat is nieuw werk en vraagt een eigen proef.

**Wat naar "Gevorderd" mag**
- Leerplannen beheren, "Gebruik als leerplan", "Bewaar als leerplan", "Kies doelen uit deze set" en de samenstelwizard.
- De bibliotheek met alle officiële sets: 411 sets, de nummers, het buitengewoon onderwijs en het volwassenenonderwijs.
- De pagina van de richting met alle vakken: de filters op finaliteit en duaal, de dekking van de hele richting ("3 van 200", "Plan de 197"), "Mijn richtingen" en het planvenster.
  - Wel goed bereikbaar houden: de praktijkleerkracht en de aardrijkskundeleerkracht vonden "wat komt nog nergens aan bod" waardevol voor hun jaarplanning.
- JSON openen, insluiten en voortgangscodes.

**Snelle verbeteringen, los van de nieuwe ingang** (van meeste naar minste winst)
1. **De dekkingstabel leesbaar maken:** de correctie uit `src/styles/opvolgen.css:69-73` naar `src/styles/global.css` verhuizen.
2. **De vette "Dekkend"-zin en het kaartje** tonen gepland apart (`GoalCoverage.tsx:198`, `CoursesPage.tsx:398-399`). De rekenregel in `coverage.ts` mag blijven.
3. **Het kadertje voor de leerling:** volledige zinnen (`richtingCursus.ts:514`), en mee bijwerken bij het loskoppelen (`CourseEditorPage.tsx:865-869`).
4. **Delen:**
   - de voorbeeldklas niet vooraf kiezen (`ShareModal.tsx:267`)
   - de link die werkt bovenaan zetten (`ClassDashboardPage.tsx:603-626`)
   - de belofte op de startpagina aanpassen (`StartPage.tsx:216`)
   - de teksten in `JoinPage.tsx:40` en `CourseShareModal.tsx:78` herschrijven
5. **Zoeken:** "lichamelijke opvoeding" en "LO" toevoegen aan `vakZoektabel.ts:35`.
6. **De lijst met leerplannen** in de cursus verversen als de leerkracht terugkeert naar het tabblad (`CourseEditorPage.tsx:1161`).
7. **De opbouw:** de cursustitel gebruiken in plaats van "Doelen" en de naam van de set (`richtingCursus.ts:51` en `519`).
8. **AI-knoppen zonder sleutel:** "(AI-sleutel nodig)" erbij, en in het venster een weg zonder AI (`aiCommon.tsx:16-20`).
9. **Kleine telfouten:** doelen met code 0000 niet meetellen, één getal in plaats van 19 en 24 (`BkLijst.tsx:88-91`), en "telt niet mee" positief formuleren (`bkWeergave.ts:436`).
10. **Het leerlingscherm** zonder de uitleg die voor de leerkracht bedoeld is (`BlockRenderer.tsx:732-733`).
11. **Kleine teksten en details:**
    - "11 vraagtypes" laten kloppen (`registry.tsx:95`)
    - "Extra: doelcode, afbeelding …" in de quiz (`quiz.tsx:893`)
    - "(opent in een nieuw tabblad)" (`blockEditors.tsx:883`)
    - de Word-stijl "Titel" herkennen (`mammothDocx.ts:34`)
    - het gewone secundair eerst in de lijst met sets (`MinimumdoelenPage.tsx:111`)

Tijdens deze synthese is er niets gewijzigd in /home/user/Bookwidgetzzz.


## 3. Waarom de AI-cursusbouwer vastloopt (verkenning, 15 oktober 2026)

- Een nieuwe cursus is **één AI-oproep** die in één JSON-antwoord de hele cursus moet geven: alle hoofdstukken, secties en
  blokken, en standaard een quiz per hoofdstuk (`CourseAIModal.tsx` r. 252-275, `buildNewCoursePrompt` in `aiCourse.ts`).
- De uitvoer is begrensd op 32.000 tokens (OpenAI 16.384). Een sectie kost gemiddeld ±2.340 tekens (gemeten op de
  voorbeeldcursus). Basisgeletterdheid (40 doelen) vraagt ±32.000 tokens: precies de grens. 150 doelen vraagt ±74.000 tokens.
- Er is geen grens op het aantal doelen, geen grootte-controle vooraf en geen redding van een half antwoord: mislukt het, dan
  is **alles weg** (ook de bron uit de importpagina) en "Opnieuw proberen" stelt dezelfde te grote vraag.
- Waarschijnlijke oorzaak van het "blokkeren": bij elk stukje tekst zet de stream de hele tekst opnieuw in de state en scrolt
  het venster mee (`CourseAIModal.tsx` r. 251, `aiCommon.tsx` r. 35-66); bij ±100.000 tekens wordt de pagina traag.
- Herbruikbaar voor werken in etappes: `runBatch` (`aiBatch.ts`: wachtrij, fout per item, één item opnieuw), optimaliseren
  per hoofdstuk (`buildOptimizeChapterPrompt`, 16.000 tokens per hoofdstuk), sectie vullen (8.000) en oefeningen per sectie
  (12.000), het geraamte met doelcodes (`geraamteHoofdstukken`), en de nagebootste AI in `tests/ai/mock-cursus.mjs`.
