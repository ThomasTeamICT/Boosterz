# Studierichtingen: matrix, doelen per richting, cursushulp en dekking

*Ontwerp van 9 oktober 2026: de synthese van drie ontwerpen (data eerst, leerkracht eerst, risico eerst) en de oordelen van drie juryleden. Basis is het ontwerp "data eerst". De fouten die de jury aantoonde, zijn hersteld en in de code nagekeken. De beste stukken uit de andere twee ontwerpen zijn overgenomen. Dit document bouwt verder op `docs/LEERPLANNEN.md` (laag 1, § 9 dekking, § 15 samenstellen) en `docs/ONDERWIJS-API.md`. Feiten uit de verkenningsruns 3 tot 5 en uit de code gaan voor op aannames. Alles wat nieuw is, staat er uitdrukkelijk als **nieuw** bij.*

De opdracht van de eigenaar, letterlijk: "ja, doe die import maar, einddoel is de volledige en duidelijke dekking (ook updatebaar via api enzovoorts) en een duidelijk hulpmiddel om cursussen te maken voor bepaalde richtingen, jaargangen meteen gekoppeld aan de juiste doelen en leerplannen etc".

## Stand van zaken

| Wat | Stand | Op wie |
|---|---|---|
| Ontwerp (dit document) | **Klaar** (9 oktober 2026): drie ontwerpen, drie juryleden, één synthese. De eigenaar gaf het startsein ("doe die import maar"). Voor de open vragen (§ 19) geldt de werkkeuze die erbij staat, tot de eigenaar anders beslist. | hoofdsessie |
| P0 Ontwerp in de repo, icoon | **Klaar** | hoofdsessie |
| P1 Datamodule studierichtingen | **Klaar** (review: één blokkerende fout en ontbrekende tests, hersteld en met een mutatieproef nagekeken) | kernbouwer |
| P2 Ophaalscript, nagebootste API en fixtures | **Klaar** (review met opmerkingen; hersteld: tests voor HTTP-fouten en sleutelfilter, vingerafdruk voor de fixtures, D8 strenger, tweede ronde voor 404) | kernbouwer |
| P3 Datatest | **Klaar** (review: herstel nodig; hersteld: versiemerktest op een eigen minimale map, elke zelftestcase met de verwachte melding, info zichtbaar) | bouwer (een andere agent dan die van P2) |
| P4 Workflow "Leerplangegevens bijwerken" | **Klaar** (review veiligheid: goed, met tekstopmerkingen, verwerkt) | bouwer, nagelezen door een reviewer |
| P5 Doelgroep in het datamodel | **Klaar** (review goed met opmerkingen; de opmerkingen zijn verwerkt) | kernbouwer |
| P6 Lader, kader en keuzehulp | **Klaar** (review met opmerkingen; hersteld: tests tolerant voor een maandelijkse update, lader behandelt een html-antwoord als 'ontbreekt', test op volledig tegen setAantal) | bouwer |
| P7 Cursushulp-logica | **Klaar** (review: herstel nodig; hersteld: STEM-sets herkend op het woord STEM, een ontbrekend setbestand maakt het leerplan niet bevestigd, uitbreidingssets blijven bij bijwerken, randgevallen van vergelijkMetKader en hergebruik) | bouwer |
| I1 Integratie van de data (P1, P2, P4; P3 volgt) | **Klaar** | hoofdsessie |
| G1 Eerste echte run, in stappen | **Klaar** (9 oktober 2026). Stap 1 en 2 als proef (PR #4 en #5, gesloten), stap 3 volledig (run 37958333744, ±23 minuten): PR #6 nagekeken en samengevoegd. De data staan in `public/leerplannen/structuur/`. De strenge controles F5, F6 en M5 staan aan. Zie § 17.1. | hoofdsessie |
| I2 Integratie van de logica (P5 tot P7) en stubs | **Klaar** | hoofdsessie |
| P8 Richtingenscherm | **Klaar** (review: herstel nodig; hersteld: "Haal weg" alleen waar het werkt, "Maak een cursus" altijd aan, knop en lijst van leerplannen gelijk, unieke variantlabels in `richtingWeergave.ts`, focus na acties, 44 px; door een andere agent nagekeken) | bouwer, worktree A |
| P9 Cursus maken, koppelen en instellen | **Klaar** (review goed met opmerkingen; hersteld in twee rondes: kiezer behoudt de doelgroep, focus, melding bij ontbrekende doelen, geen set-id in waarschuwingen, dubbele setnamen, stand zonder minimumdoelen, 44 px; hulpen in `richtingVenster.ts`) | bouwer, worktree B |
| P10 Samenstellen en inlezen met een richting | **Klaar** (review: één blokkerende fout, de doelgroep bij inlezen; hersteld, met `beginUitBewaarde` volgens `vergelijkMetKader`, gemeld jaar en soort, geen set-id in de richtingflow van de wizards). Open voor I4: set-id's in bibliotheekteksten (`setInBericht`, dubbele namen in `doelenSamenstellen.ts`, bronfouten, verwijzingen in inlezen stap 4) | bouwer, worktree C |
| I3 Integratie van de schermen: ingangen, hulp, budget | **Klaar** (menu, minimumdoelenpagina, wegwijzer, twee hulpvragen; kritiek pad 333,4 kB, budget bewust naar 333,9 kB) | hoofdsessie |
| P11 Dekkingsmodule (L6) | **Klaar** (review goed met opmerkingen; tests aangevuld, regels voor percent en zelfdeNummerAndereSet vastgelegd in § 13.2) | kernbouwer |
| P12 Dekking op de schermen | **Klaar** (twee reviewers en een rechter: 4 van 10 bevindingen bevestigd en hersteld: juiste noot bij een kader dat nog niet opgehaald is, herladen na een mislukt chunk, 'Toon: Nog niet gedekt' laat sets weg en zegt hoeveel, lange titels breken af). Teksten met getallen in `dekkingWeergave.ts`. CourseEditorPage 74,8 kB, kritiek pad 333,7 kB (budget 334,2 kB) | bouwer |
| P13 Rooktest studierichtingen | **Klaar** (10 oktober 2026): sectie 20d op de fixtures (49 checks) en 20e op de echte data voor G-0193 en G-0327 (40 checks, alleen regex), twee keer na elkaar groen; de valkuil (§ 9.5) wordt in localStorage nagegaan. Geen fouten in de app gevonden | bouwer (een andere agent dan die van P8 tot P12) |
| I4 Review, rechter, herstel, rooktest op echte data, uitrol | **Klaar** (10 oktober 2026). Vier reviewers (datastroom, juistheid, toegankelijkheid en taal, bundel en opslag), elk met een rechter: 21 bevindingen, 9 bevestigd, geen blokkerende. De vijf kleine punten (workflowteksten, links naar de wizard met `sets=`, zichtbaar onderscheid tussen gelijke setnamen, herlaadmelding) en de vier logicapunten (rij hieronder) zijn hersteld en onafhankelijk nagekeken. Sectie 20e (echte data) zit in P13 | hoofdsessie, reviewers, rechter |
| I4 Herstel van vier punten uit de eindreview (logica) | **Klaar** (10 oktober 2026): drie rondes, telkens door een andere agent nagekeken, en samengevoegd. (1) Een onderdeel met `nietMeerInBron` telt niet meer als geldig (`geldigeOnderdelen`, § 9.2). (2) Een volledige set die groeit of krimpt, valt nu op: tweede afdruk `kaderVolledig`, één regel `veranderdSindsLeerplan` (§ 11.2); leerplannen van daarvoor werken zoals vroeger. (3) Na "Keuze aanpassen" met een andere keuze valt `volgtKader` weg (§ 10.2). (4) Botsende doelcodes krijgen de korte naam van de set in plaats van het set-id (§ 14.9). Tweede ronde: een cursus draagt nooit `kaderVolledig` (`doelgroepVoorCursus`), en de bekende beperking bij een andere lijst sets staat in § 11.2 | kernbouwer en een onafhankelijke controleur; integratie: hoofdsessie |
| Fase 2 (§ 22): vingerafdruk per set, gaten dichten, mijn richtingen, klas en richting | **Klaar en live** (10 oktober 2026): alle pakketten A1 tot I-C, met review en rechter; de tabel "Stand van zaken fase 2" staat in § 22, de pakketten in bijlage D. | hoofdsessie, bouwers |
| Fase 3 (§ 23): beroepskwalificaties per richting (import, leerplan met competenties, sectie op de richtingpagina, dekking) | **Bezig** sinds 10 oktober 2026 (fase 2 is af): Q0 klaar, K1 en K5 lopen; eigen tabel "Stand van zaken fase 3" in § 23, pakketten in bijlage E. | hoofdsessie, bouwers |
| Verkenning beroepskwalificaties (O11) | **Ronde 6 klaar** (run 38044584119): een richting verwijst in het detail van haar structuuronderdeel naar haar beroepskwalificaties; de competenties staan in het detail per BK-versie. Bevindingen in `docs/ONDERWIJS-API.md` § 4. Ronde 7 klaar (run 38047507450): het curriculumdossier is een Word-document; de competenties van een beroepskwalificatie zijn gestructureerd. Volgende: ontwerp voor de import (fase 3). | hoofdsessie |
| Licentie en naamsvermelding API Structuuronderdelen | Te bevestigen via TechLoket, zoals bij laag 1 | eigenaar |

## 0. In het kort

1. **Import.** Eén nieuw script haalt de matrix (API Structuuronderdelen) en per richting de officiële koppeling met de minimumdoelen op. Die koppeling komt uit de Onderwijsdoelen-API, met de filter `structuuronderdeel_groep_nummer`. Het script draait in dezelfde maandelijkse workflow als de minimumdoelen en komt in dezelfde pull request terecht. De volledige testsuite is de poort. Harde poorten stoppen elke onbetrouwbare update. Daarnaast is er een datatest, geschreven door een andere agent.
2. **Doelen en leerplannen per richting en jaar.** Een pure functie maakt per richting, jaar en soort onderwijs het doelenkader: alleen sets die nu gelden, de juiste soort onderwijs, en voor de 1ste graad de sets van de stroom. Wat wegvalt, blijft zichtbaar. Het officiële leerplan van een richting is een gewone samengestelde lijst, meteen nagekeken door de bron. Van de netten tonen we alleen links en wat de school zelf inleest, nooit inhoud.
3. **Cursushulp zonder AI.** Op de pagina van een richting kies je het jaar. In één venster kies je daarna de sets van je vak (met een voorstel, dat geen officiële koppeling is). Je krijgt een nagekeken leerplan en een cursus met de doelcodes al op de secties. Per doel kiezen kan via de bestaande samenstelwizard met `?richting=`. Met een AI-sleutel kan de AI een eerste versie maken.
4. **Dekking.** Per cursus en over alle cursussen van een richting rekenen we via de verwijzingen (set + vast nummer) op de minimumdoelen. Dat is L6 uit LEERPLANNEN.md § 9. Het werkt ook met de leerplannen van de netten die de school inlas. Elk doel heeft een status: gedekt, gepland (staat op een sectie die nog leeg is), alleen in verdieping, of nog open. Bij elke cursus die niet meetelt, staat de reden.

## 1. Beslissingen

| # | Beslissing | Waarom |
|---|---|---|
| B1 | De koppeling richting → doelen loopt **alleen op groepnummer** (`structuuronderdeel_groep_nummer=G-…`), nooit op naam. | De filter op naam voegt graden samen (Humane wetenschappen: 1658 doelen = G-0117 + G-0327), is hoofdlettergevoelig en breekt op een komma. Het ordeningskader in de sets gebruikt hetzelfde nummer. |
| B2 | De import bewaart het API-antwoord **volledig**: per set de exacte vaste nummers (@id), ook BuSO-sets en oude versies, plus een **versiemerk** (`setSha`) van de set. De app filtert, zichtbaar. | Niets verzinnen en niets stil verliezen. |
| B3 | Minimumdoelen, matrix en koppeling komen uit **één workflow-run, één poort (`npx vitest run`) en één pull request**. `haal-minimumdoelen.mjs` blijft byte voor byte gelijk. De stap "Minimumdoelen ophalen" krijgt alleen een `if:`. | Kruiscontroles hebben alleen zin op één consistente momentopname. Met de volledige vitest-run breken tests met echte data niet meer pas bij de uitrol. |
| B4 | **Harde poorten** tegen: een filter die de API negeert (D2), onvolledigheid, dubbels, onbekende sets of nummers, graadconflicten, massaverlies en een groep uit het ordeningskader zonder koppeling. De kruiscontrole op het niveau van de nummers is zacht, tot de eerste echte run. | De API negeert onbekende parameters stil en geeft dan alle 24 019 doelen. |
| B5 | **Niets wissen.** Verdwenen groepen en onderdelen blijven staan, met `nietMeerInBron`. Een koppeling die wegvalt, blijft staan als "laatst bekende koppeling". | Bestaande leerplannen en cursussen blijven werken. De massaverliespoort vangt een kapot eindpunt. |
| B6 | In de **1ste graad** schrijft het script een gewoon koppelingsbestand met methode `graad-en-stroom`. **7de jaren** krijgen alleen wat de API geeft: Boosterz maakt daar geen eigen koppeling. | Run 5: G-0307 en G-0311 geven 404. Voor de 7de jaren is niets bekend, en niets verzinnen gaat voor. |
| B7 | **Versiemerk per set.** Tests en app controleren strikt wat bij dezelfde versie van een set hoort. Bij een andere versie melden ze het verschil, zonder te falen. | Zo breekt geen volgorde van updates (bv. een noodrun met alleen de minimumdoelen) de uitrol. |
| B8 | **Nieuw:** één optioneel veld `doelgroep` op `Course` en op `Curriculum`. Het wordt aan elke grens gesaneerd, telt niet mee in de vingerafdruk en kan nooit door de AI ingevuld worden. Geen formaatversie gaat omhoog. | Leerplan-id's zijn per toestel willekeurig. Het groepnummer moet met de cursus meereizen: deellink, bestand, klaspakket. |
| B9 | Het leerplan van een richting is een **samengestelde lijst** (`leerplanUitSelectie`). Per doel kiezen gebeurt in de bestaande samenstelwizard, met `?richting=`. Er komt geen tweede doelenkiezer. | De nakijkpoort, stabiele codes en `weggelatenCodes` bestaan al. Een tweede kiezer zou de valkuil `zetDoelen`/`bouwSetKeuzes` herhalen (§ 9.5). |
| B10 | **Cursushulp zonder AI:** een venster per richting en jaar. Je kiest op het niveau van de sets, met een vakvoorstel (hulp, geen koppeling) en eerlijke uitleg bij STEM-sets. Het venster maakt een geraamte met de doelcodes al op de secties. "Alle doelen van de richting" is niet de standaard. | Dit is de eis van de eigenaar. Een vakleerkracht wil niet standaard 229 doelen over alle vakken heen. |
| B11 | **Dekking op minimumdoelen** via `refs`, strikt op set + vast nummer. De status "gepland" bestaat alleen in de nieuwe dekkingsmodule. `computeCoverage` verandert niet. | Het pad "Vul de hiaten", de percentages op de cursuskaart en `coverage.test.ts` blijven gelijk. Een vers geraamte staat niet meer op "100 % gedekt". |
| B12 | **Optionele minimumdoelen en uitbreidingsdoelen** tellen niet mee in het totaal en het percentage. Ze krijgen een eigen teller. | Een leerkracht hoort niet "nog niet gedekt" te zien bij doelen die niet verplicht zijn. |
| B13 | **Eén** nieuwe lui geladen route `/cursussen/richtingen/:groep?`. De ingangen staan buiten de lijsten die de rooktest letterlijk controleert. Het budget gaat alleen omhoog voor de route. | `courses.ts`, `curriculum.ts` en `handoff.ts` staan niet op het kritieke pad (JoinPage laadt `courses.ts` lui; `courses-*.js` is een eigen chunk). |
| B14 | **Netten:** nooit inhoud. We tonen links, wat de school zelf inlas (met de overlap via `refs`) en de inleeswizard met `?richting=`. | Auteursrecht (LEERPLANNEN.md § 4 en § 13). |
| B15 | De schermen zijn **testbaar vóór de eerste echte run**. Het script maakt zelf de fixtures uit een nagebootste API, en de rooktest gebruikt die via `page.route`. | Regel 11 vraagt een nagebootst antwoord. De schermen hoeven zo niet op G1 te wachten. |

## 2. De datastroom

```
(1) haal-minimumdoelen.mjs       Onderwijsdoelen-API                → public/leerplannen/minimumdoelen/   (bestaat, ongewijzigd)
(2) haal-studierichtingen.mjs    API Structuuronderdelen            → public/leerplannen/structuur/studierichtingen.json
                                 Onderwijsdoelen-API, per groep
                                 ?structuuronderdeel_groep_nummer=G-…  → public/leerplannen/structuur/richtingdoelen/index.json
                                                                       + richtingdoelen/G-xxxx.json
                                 leest (1) voor de poorten D3, D4, D8 en voor de 1ste graad
(3) npx vitest run               alle tests, ook de datatests van (1) en (2)
(4) groen → één pull request → een mens keurt goed → deploy.yml

App (alleen bestanden uit public/, nooit de API):
  laadMatrix · laadRichtingDoelenIndex · laadRichtingDoelen(G) · laadIndex · laadSet
  → richtingInfo → bouwKader → leerplanVoorRichting (samengesteld, nagekeken) → cursusVoorRichting
  → dekkingMinimumdoelen (per cursus en over alle cursussen van een richting)
```

De service worker behandelt de nieuwe bestanden zoals de minimumdoelen: netwerk eerst, met de cache als terugval. `knownFiles` (src/lib/swBuild.ts) neemt ze vanzelf op in KNOWN, zonder codewijziging.

## 3. Bestanden in de repo (nieuw)

### 3.1 Algemene regels (zoals laag 1)

- De kop staat met 2 spaties inspringing. Daarna volgt één compact record per regel, en het bestand eindigt op een regeleinde.
- Records zijn gesorteerd op hun sleutel en lijsten binnen een record ook. Lege velden, `null` en lege tekst vallen weg.
- `sha256` is altijd sha256 van `canoniek(…)` uit `src/lib/minimumdoelen.ts`.
- Elke kop vermeldt de herkomst: `bron`, `api`, `naamsvermelding`, `licentie: "nog te bevestigen"` en `opgehaald` (ISO).
- Het pad is `public/leerplannen/structuur/`. De bestandsnaam wordt `studierichtingen.json` en niet `so-studierichtingen.json`, omdat de matrix ook BuSO, OKAN en 7de jaren bevat. ONDERWIJS-API.md § 6 wordt daarop aangepast.

### 3.2 De matrix: `public/leerplannen/structuur/studierichtingen.json`

```json
{
  "app": "boosterz",
  "kind": "studierichtingen",
  "v": 1,
  "bron": "https://onderwijs-api-portaal.vlaanderen.be/",
  "api": "https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeelgroep",
  "naamsvermelding": "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen)",
  "licentie": "nog te bevestigen",
  "opgehaald": "2026-11-03T05:41:12Z",
  "aantalGroepen": 545,
  "aantalOnderdelen": 961,
  "sha256": "<sha256(canoniek({groepen, onderdelen}))>",
  "groepen": [
{"nummer":"G-0193","titel":"Natuurwetenschappen","graad":"2","finaliteit":"DO","soortLeerjaar":"Leerjaar","onderdelen":[247]}
  ],
  "onderdelen": [
{"nummer":247,"groep":"G-0193","titel":"Natuurwetenschappen","onderwijsvorm":"ASO","studiedomein":{"omschrijving":"DOMEINOVERSCHRIJDEND"},"begindatum":"…","leerjaren":[{"code":"1"},{"code":"2"}],"hoofdstructuren":["311","321"],"oudNummer":"1311","ov4":true}
  ]
}
```

**Groep** (`StudierichtingGroep`). Velden:
- `nummer`: `structuuronderdeel_groep_nummer`, moet passen op `/^G-\d{4,6}$/`;
- `titel`;
- `graad?`: `graad.code`, "1" | "2" | "3";
- `finaliteit?`: `finaliteit.code`, als tekst. De app vertaalt DO, DU en A en toont een onbekende code zoals ze is;
- `onderwijsniveau?`, `soortLeerjaar?`;
- `opleidingsvorm?` ({code?, omschrijving?}, BuSO);
- `type7?`: `type_7de_leerjaar.code`;
- `onderdelen`: de nummers, oplopend;
- `nietMeerInBron?` (JJJJ-MM-DD);
- `extra?`: alle andere bovenste velden.

**Structuuronderdeel** (`Structuuronderdeel`). Velden:
- `nummer`, `groep`, `titel`;
- `onderwijsvorm?`, `studiedomein?` ({code?, omschrijving?}), `stem?` (uit `stem_classificatie`), `discipline?`, `coefficient?`;
- `niche?`, `duaal?`, `aanloop?`: alleen als `true`;
- **`ov4?`**: `true` uit het officiële veld `ov4_mogelijk`. Dit vervangt de afleiding uit hoofdstructuur 321 (467 van de ±490 niet-BuSO-groepen hebben 321);
- `begindatum?`, `einddatum?`;
- `leerjaren` ([{code, omschrijving?, begindatum?, einddatum?}]), `hoofdstructuren` (codes), `onderwijsstelsels?`, `instellingstypes?`;
- `erkenningen?` (uit `structuur­onderdeel_details`: {nummer ADV-…, versie?, status?, begindatum?, einddatum?});
- `vorige?`, `volgende?` (uit `historiek_structuuronderdelen`, tolerant op sleutels die met `vorige` of `volgende` beginnen), `voorbereidend?`, `vervolg?`: alleen nummers;
- `oudNummer?` (`studierichting_nummer_oud` of `afdeling_nummer_oud`), `faseBuso?`, `laatsteWijziging?`, `nietMeerInBron?`;
- `extra?`: de overige velden, zonder `api_url` (die volgt uit het nummer).

Een sleutel `__proto__` gaat via `defineProperty`, zoals in `normaliseerRecord`.

**Niets stil verliezen (vastgelegd in P1).** De sleutels van `extra` zijn recursief gesorteerd. Van de lijsten `leerjaren`, `erkenningen` (uit `structuuronderdeel_details`), `hoofdstructuren`, `onderwijsstelsels` en `instellingstypes` staat de rest van elk element (alles wat niet in het getypte element komt, bv. de omschrijving van een hoofdstructuur) in `extra.<lijstnaam>`: een lijst die gelijk loopt met de getypte, gesorteerde lijst, met `{}` waar niets overbleef. Twee elementen met hetzelfde getypte deel maar een andere rest maken de lijst onleesbaar: ze gaat dan letterlijk naar `extra`, en voor een nodig veld komt er een probleem. Bewust weg vallen: de omschrijving bij een bekend {code, omschrijving}-veld bovenaan (graad, finaliteit, type 7de leerjaar), titel en api_url van een verwijzing, `api_url`, null en lege tekst, en de tijd achter een datum. `valideerMatrixBestand` controleert de vorm van `extra.<lijst>` (`controleerLijstRest`) en weigert `api_url` ook bij een groep.

**Een vast nummer mag in meer sets staan** van één koppelingsbestand (een andere versie of de BuSO-kopie delen hun nummers; bv. 73740 in ODS_2118 en ODS_2334). De validator eist uniekheid alleen per set. Het rapport bevat de veldinventaris van het echte antwoord, zodat de eerste run toont wat er binnenkomt.

**Omvang.** De platte verkenning was 676 kB. Verwacht: ±600 tot 800 kB, ±70 tot 90 kB gzip. Het bestand wordt lui geladen, alleen op de richtingschermen en in de richtingkiezer.

### 3.3 De index van de koppeling: `public/leerplannen/structuur/richtingdoelen/index.json`

```json
{
  "app": "boosterz",
  "kind": "richtingdoelen-index",
  "v": 1,
  "bron": "https://www.onderwijsdoelen.be/",
  "api": "https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel?structuuronderdeel_groep_nummer=",
  "naamsvermelding": "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)",
  "licentie": "nog te bevestigen",
  "matrixSha256": "<gelijk aan studierichtingen.json → sha256>",
  "groepen": [
{"groep":"G-0117","status":"gekoppeld","methode":"api","aantal":796,"sets":86,"sha256":"…","opgehaald":"2026-11-03T05:52:40Z","bestand":"G-0117.json"},
{"groep":"G-0307","status":"gekoppeld","methode":"graad-en-stroom","aantal":0,"sets":0,"sha256":"…","opgehaald":"…","bestand":"G-0307.json"},
{"groep":"G-0402","status":"geen","opgehaald":"2026-11-03T05:53:02Z"},
{"groep":"G-0500","status":"geen","opgehaald":"…","nietMeerInBron":"2026-11-03","bestand":"G-0500.json"},
{"groep":"G-0601","status":"nog-niet-opgehaald"}
  ]
}
```

In het voorbeeld zijn de aantallen van G-0307 0. Het script vult daar de echte aantallen in.

- Er staat **één regel per groep uit de matrix**, ook voor groepen die niet meer in de bron staan. De regels zijn gesorteerd met `vergelijkGroepnummer`.
- `status` heeft drie waarden:
  - `gekoppeld`: er is een bestand;
  - `geen`: de API gaf twee keer na elkaar 404. Was de groep vroeger gekoppeld, dan blijft het bestand staan als laatst bekende koppeling, met `nietMeerInBron`;
  - `nog-niet-opgehaald`: een proefrun met `--groepen`, of een nieuwe groep na een run met alleen de matrix.
- `matrixSha256` legt vast tegen welke matrix gekoppeld werd. Ook een run met alleen de matrix werkt de index bij (nieuwe groepen, `matrixSha256`), zonder verzoeken.

### 3.4 De doelen per richting: `public/leerplannen/structuur/richtingdoelen/G-0193.json`

```json
{
  "app": "boosterz",
  "kind": "richtingdoelen",
  "v": 1,
  "groep": "G-0193",
  "titel": "Natuurwetenschappen",
  "graad": "2",
  "methode": "api",
  "filter": "structuuronderdeel_groep_nummer=G-0193",
  "bron": "https://www.onderwijsdoelen.be/",
  "api": "https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel",
  "naamsvermelding": "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)",
  "licentie": "nog te bevestigen",
  "opgehaald": "2026-11-03T05:52:40Z",
  "aantal": 612,
  "sha256": "<sha256(canoniek(sets))>",
  "sets": [
{"set":"ODS_3132","setSha":"3f9c0a1b2c3d4e5f","setAantal":13,"ids":["…","…","…","…"]},
{"set":"ODS_3244","onderwijssoort":"Buitengewoon","setSha":"…","setAantal":13,"ids":["…"]}
  ]
}
```

- `set` is `ODS_<onderwijsdoelenset_id>`, precies `M.setVan(record).setSleutel`.
- `ids` zijn de vaste nummers zoals `M.normaliseerRecord(record).doel.id` ze geeft, natuurlijk gesorteerd en uniek. We bewaren **altijd** de ids, ook voor een hele set.
- `setSha` bevat de eerste 16 hex-tekens van de `sha256` van die set in `minimumdoelen/index.json` op het moment van koppelen. Dat is het **versiemerk** (§ 7).
- `setAantal` is het `aantal` van de set in de index op het moment van koppelen. De app leidt "hele set" af als `ids.length === setAantal`.
- `onderwijssoort` is de letterlijke waarde van `onderwijsdoelenset.onderwijsstructuur.onderwijssoort`. Het veld staat er alleen als het niet leeg is. Het is officieel en gestructureerd, dus beter dan de soort uit de setnaam.
- `aantal` is het totaal van alle ids. Het moet gelijk zijn aan `totalItems` van de filter, min de letterlijk gelijke records die samengevoegd werden.
- Methode `graad-en-stroom` (1ste graad):
  - `filter` is `"graad=1ste graad; stroom=A-stroom (regel van Boosterz: de bron koppelt de 1ste graad niet per richting)"`;
  - de sets zijn alle sets uit `minimumdoelen/index.json` met graad "1ste graad" en dezelfde stroom, gewoon én BuSO, alle versies, dus even volledig als een API-antwoord;
  - de stroom komt uit `stroomVanEersteGraad(titel)`. De vier groepen heten "Eerste leerjaar A", "Eerste leerjaar B", "Tweede leerjaar A" en "Tweede leerjaar B". De basisopties zijn onderdelen van G-0311 en G-0355.
- `nietMeerInBron?` staat er als de API de groep niet meer koppelt (zie § 3.3).
- **Omvang.** Er zijn 545 groepen. Verwacht: tussen ±256 en ±545 bestanden van 3 tot 8 kB (de 7de jaren zijn onbekend), samen 1,5 tot 4 MB. De app laadt er één per richting. sw.js (nu 66 kB, met ±950 namen) groeit met hoogstens ±25 kB. sw.js staat niet op het kritieke pad.

### 3.5 Het rapport: `tools/leerplannen/rapport/laatste-studierichtingen.json`

Het rapport staat in .gitignore (de map is al uitgesloten) en gaat mee als artifact `studierichtingen-rapport`.

```json
{
  "tijdstip": "…", "bron": "api", "stand": "alles",
  "matrix": {"paginas": 28, "lijstPad": "…", "totaalVolgensApi": 545, "groepen": 545, "onderdelen": 961,
             "perSoort": {"gewoon": 0, "zevende": 0, "aanloop": 0, "buso": 0, "ander": 0},
             "nieuw": [], "gewijzigd": [], "nietMeerInBron": [], "afgebouwdSindsVorige": [], "veldInventaris": {}},
  "koppeling": {"verzoeken": 0, "duurSeconden": 0, "totaalZonderFilter": 24019,
                "gekoppeld": 0, "geen": 0, "graadEnStroom": 0, "nogNietOpgehaald": 0,
                "geenPerSoort": {"gewoon": 0, "zevende": 0, "aanloop": 0, "buso": 0, "ander": 0},
                "nieuw": [], "gewijzigd": [], "nuZonderDoelen": [], "eersteGraadNuGekoppeld": [],
                "samengevoegdeDubbels": 0, "onderwijssoortVerschillen": [],
                "ordeningskader": {"groepen": 0, "zonderKoppeling": []},
                "kruiscontrole": {"setsBekeken": 0, "verschillen": 0, "verschillenGeldigSo": 0, "voorbeelden": []},
                "voorbeeld404": "<ingekort antwoord, zonder sleutel>"},
  "problemen": [], "waarschuwingen": [], "fout": null
}
```

### 3.6 Nagebootste API en fixtures (nieuw, `tests/fixtures/structuur/`)

- `api/matrix.json`: API-pagina's in de vorm uit feiten A (`links.next.href` met een spatie, `meta.total_elements`), met de hand gemaakt. De hoofdsessie geeft daarvoor een uittreksel van de verkenning (`matrix-ruw.json`). Er staan 9 groepen in:
  - G-0193 Natuurwetenschappen (2de graad, DO, met `ov4_mogelijk`);
  - G-0117 en G-0327 Humane wetenschappen (2de en 3de graad);
  - G-0307 Eerste leerjaar A;
  - G-0311 Tweede leerjaar A, met twee basisopties;
  - G-0008 Assistent dierlijke productie (alleen duaal, A, met een aanloop-onderdeel);
  - G-0002 Animator (7de jaar, afgebouwd sinds 2025-08-31, met een opvolger);
  - G-0009 (BuSO, zonder graad).
- `api/koppeling.json`: `{"totaal": 24019, "groepen": {...}}`, gemaakt door het nieuwe hulpscript `tools/leerplannen/maak-nagebootste-koppeling.mjs` uit de echte setbestanden:
  - deelsets uit de ordeningskader-tags van de groep;
  - hele sets volgens een vaste regel in het script (geldige sets van de graad die de finaliteit van de groep in de naam noemen), met hun BuSO-kopie en één oude versie;
  - een 404 voor de 1ste graad, het 7de jaar en BuSO.
  
  Het script zegt uitdrukkelijk dat dit **nagebootst** is en geen officiële koppeling.
- `api/koppeling.json` draagt `vingerafdrukMinimumdoelen`: de sha256 van de gebruikte velden van alle sets in `minimumdoelen/index.json` op het moment van maken. Verschilt de huidige index (na een maandelijkse update), dan slaan de twee reproductietests over in plaats van te falen. Opnieuw maken: `node tools/leerplannen/maak-nagebootste-koppeling.mjs` en daarna het script met de opties hieronder (P2).
- Het rapport heeft naast § 3.5 ook `koppeling.eersteGraadPerStroom {A, B}`, `koppeling.tweedeRonde {groepen, verzoeken}` en `koppeling.ordeningskader.nietMeegeteld`.
- `uit/`: de uitvoer van `haal-studierichtingen.mjs --bron-matrix … --bron-koppeling … --nu 2026-10-09T00:00:00Z --vandaag 2026-10-09`. De datatest (positief geval), de kadertests en de rooktest (via `page.route`) gebruiken die uitvoer.

## 4. Gedeelde datamodule `src/lib/studierichtingen.ts` (nieuw)

De module is puur: geen imports en alleen erasable TypeScript, zoals `minimumdoelen.ts`. Het script, de datatest en de app laden ze alle drie. `canoniek` en de sha256 haalt het script zelf (uit `minimumdoelen.ts` en `node:crypto`).

```ts
export const STRUCTUUR_API = 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2';
export const STRUCTUUR_BRON = 'https://onderwijs-api-portaal.vlaanderen.be/';
export const STRUCTUUR_NAAMSVERMELDING = 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen)';
export const KOPPEL_PARAMETER = 'structuuronderdeel_groep_nummer';
export const GROEP_NUMMER = /^G-\d{4,6}$/;
export type Graad = '1' | '2' | '3';
export type GroepSoort = 'gewoon' | 'zevende' | 'aanloop' | 'buso' | 'ander';
export type KoppelMethode = 'api' | 'graad-en-stroom';
export type KoppelStatus = 'gekoppeld' | 'geen' | 'nog-niet-opgehaald';
export interface Code { code?: string; omschrijving?: string }
export interface StudierichtingGroep { /* velden § 3.2 */ }
export interface Structuuronderdeel { /* velden § 3.2 */ }
export interface MatrixBestand { /* kop § 3.2 + groepen + onderdelen */ }
export interface RichtingDoelenSet { set: string; onderwijssoort?: string; setSha: string; setAantal: number; ids: string[] }
export interface RichtingDoelenBestand { /* kop § 3.4 + sets */ }
export interface RichtingDoelenIndexRegel { groep: string; status: KoppelStatus; methode?: KoppelMethode; aantal?: number; sets?: number;
  sha256?: string; opgehaald?: string; bestand?: string; nietMeerInBron?: string }
export interface RichtingDoelenIndex { /* kop § 3.3 + groepen */ }

// voor het script: tolerant (regel 11)
export function lijstVanPagina(pagina: unknown): { lijst: unknown[]; pad: string } | { fout: string };
//   de ENIGE lijst van objecten met structuuronderdeel_groep_nummer, op welke sleutel ook; geen of meer dan één → fout
export function volgendeLink(pagina: unknown): string | undefined;   // links.next.href, spaties → %20
export function totaalVanPagina(pagina: unknown): number | undefined; // meta.total_elements, als getal of tekst
export function normaliseerGroep(raw: unknown): { groep?: StudierichtingGroep; onderdelen: Structuuronderdeel[]; problemen: string[] };
export function onderwijssoortVanRecord(record: unknown): string | undefined; // onderwijsdoelenset.onderwijsstructuur.onderwijssoort

// gedeeld
export function vergelijkGroepnummer(a: string, b: string): number;          // numeriek: G-0009 < G-0010 < G-01000
export function vergelijkNatuurlijk(a: string, b: string): number;           // voor ids, zoals vergelijkCodes
export function stroomVanEersteGraad(titel: string): 'A' | 'B' | undefined; // /^(eerste|tweede) leerjaar ([ab])\b/i
export function soortVanGroep(g: StudierichtingGroep, onderdelen: readonly Structuuronderdeel[]): GroepSoort;
export function jaarVan(graad: string | undefined, leerjaarCode: string): number | undefined; // (graad-1)*2 + code; 3de graad code 3 → 7
export function isAfgebouwd(o: { einddatum?: string }, vandaag: string): boolean;
export function groepnummersVanDoel(doel: { extra?: Record<string, unknown> }): string[];
//   uit extra.titels[*].ordeningskader.studierichtingen[*].structuuronderdeel_groep_nummer
export interface KruisVerschil { groep: string; set: string; alleenApi: string[]; alleenOrdeningskader: string[] }
export function kruiscontrole(koppeling: ReadonlyMap<string, readonly RichtingDoelenSet[]>,
  setDoelen: ReadonlyMap<string, readonly { id?: string; extra?: Record<string, unknown> }[]>): KruisVerschil[];
export function valideerMatrixBestand(json: unknown): string[];
export function valideerRichtingDoelenIndex(json: unknown): string[];
export function valideerRichtingDoelenBestand(json: unknown, groep?: string): string[];
```

**`normaliseerGroep`** is tolerant. Een veld mag tekst zijn of een object {code, omschrijving}, en een lijst met één element telt als dat element. Ontbrekende velden mogen. Onbekende velden gaan naar `extra`. In `problemen` komt een groep zonder geldig nummer, een onderdeel zonder nummer, een nummer dat geen geheel getal is (de tekst "505" wordt het getal 505, "abc" geeft een probleem) en een dubbel onderdeel.

**`soortVanGroep`** beslist in deze volgorde:
1. `opleidingsvorm` → `buso`;
2. `type7` → `zevende`;
3. alle onderdelen `aanloop` → `aanloop`;
4. een graad én een onderdeel met hoofdstructuur 311 → `gewoon` (ook de 1ste graad en de groepen met alleen duale onderdelen). OKAN en Basisverpleegkunde hebben 311 maar geen graad: die worden `ander` (vastgesteld in P1 op de verkenningsdata);
5. anders `ander` (OKAN, basisverpleegkunde).

Volgens de verkenning: 256 gewone groepen in de 2de en 3de graad (48 daarvan met alleen duale onderdelen), 4 in de 1ste graad, 219 zevende, 55 BuSO, 9 aanloop en 2 ander. De eerste echte run bevestigt dat.

## 5. Ophaalscript `tools/leerplannen/haal-studierichtingen.mjs` (nieuw)

Het script volgt het model van `haal-minimumdoelen.mjs`: Node 22.18 of nieuwer en geen afhankelijkheden. Het gebruikt:
- `redirect: 'manual'`;
- 4 nieuwe pogingen bij 429, 5xx of een netwerkfout (na 2, 4, 8 en 16 s);
- een time-out van 60 s per verzoek;
- `veilig()` voor elke logregel;
- de sleutelcontrole op alle teksten vóór het schrijven.

De hulpfuncties (`schoon`, `veilig`, `Fout`, `wacht`) worden gekopieerd. Er wordt nu niets gerefactord. Het script importeert `../../src/lib/minimumdoelen.ts` en `../../src/lib/studierichtingen.ts`.

### 5.1 Opdrachtregel

```
ONDERWIJSDOELEN_API_KEY=… node tools/leerplannen/haal-studierichtingen.mjs [opties]
--alleen alles|matrix|koppeling   standaard alles; "koppeling" leest het bestaande matrixbestand (ontbreekt → 1)
--groepen G-0117,G-0327           proefrun: alleen deze groepen koppelen (hoogstens 50, elk op GROEP_NUMMER, anders 1);
                                  de rest houdt zijn regel of krijgt "nog-niet-opgehaald"
--bron-matrix <bestand>           offline: één API-pagina, een array pagina's of een array groepen
--bron-koppeling <bestand>        offline: {"totaal": 24019, "groepen": {"G-0117": <pagina | pagina's | {"status":404}>}}
--uit <map>                       standaard public/leerplannen/structuur
--minimumdoelen <map>             standaard public/leerplannen/minimumdoelen (alleen lezen)
--rapport <bestand>               standaard tools/leerplannen/rapport/laatste-studierichtingen.json
--vandaag JJJJ-MM-DD              voor tests (standaard vandaag, UTC)
--nu <ISO-tijd>                   voor tests: het tijdstip "opgehaald" (alleen met --bron-*)
Omgeving (de bestaande namen):
  ONDERWIJSDOELEN_API_KEY         verplicht zonder --bron-*
  ONDERWIJSDOELEN_API_BASE        standaard https://onderwijs.api.vlaanderen.be/onderwijsdoelen
  STRUCTUURONDERDELEN_API_BASE    nieuw; standaard STRUCTUUR_API; moet dezelfde origin hebben als ONDERWIJSDOELEN_API_BASE
  ONDERWIJSDOELEN_WACHT_FACTOR    0 in tests
Uitgangscodes: 0 in orde (ook "niets veranderd") · 1 fout of onvolledig · 2 geen groepen · 3 gegevens niet betrouwbaar.
Bij 1, 2 en 3 is alleen het rapport geschreven.
```

De sleutel gaat alleen naar de origin van `ONDERWIJSDOELEN_API_BASE`. Een volgende-link of een doorverwijzing naar een andere origin is een fout.

### 5.2 Stappen

1. **Matrix ophalen.** Het script bladert door `…/structuuronderdeelgroep`:
   - de lijst komt uit `lijstVanPagina`, en het pad komt in het rapport;
   - de volgende pagina komt uit `volgendeLink`: alleen op dezelfde origin, hoogstens 100 pagina's, en een adres dat al gezien is, is een fout;
   - per groep volgt `normaliseerGroep`.
2. **Samenvoegen met het bestaande bestand.** Een groep of onderdeel die niet meer in de API staat, blijft staan met `nietMeerInBron: <vandaag>`. Die datum blijft bij volgende runs gelijk. Komt het terug, dan valt het veld weg. Wat veranderde, komt in het rapport.
3. **Totaal zonder filter.** `onderwijsdoel?paginanr=1&rijen_per_pagina=1` geeft `T` (nu 24 019).
4. **Koppeling per groep.** Elke groep die nu in de API staat, of alleen de groepen uit `--groepen`, wordt opgevraagd met `paginanr=N&rijen_per_pagina=500&structuuronderdeel_groep_nummer=G-…`. Per record berekent het script:
   - de set: `M.setVan(record).setSleutel` (moet `ODS_<getal>` zijn);
   - het vaste nummer: `M.normaliseerRecord(record)?.doel.id` (verplicht);
   - de soort onderwijs: `S.onderwijssoortVanRecord(record)`.

   Het script wacht 250 ms tussen twee verzoeken: samen ±800 verzoeken, ±12 minuten. Wat het antwoord zegt:
   - 200: methode `api`;
   - 404 op pagina 1: de groep gaat naar een **tweede ronde** na alle andere groepen (gewone wachttijd, geen extra 5 s; zo blijft de looptijd beperkt bij ±290 groepen zonder doelen). Een tweede 404 betekent "geen doelen". Het rapport telt `koppeling.tweedeRonde: {groepen, verzoeken}`. Voor een gewone groep van de 1ste graad wordt het dan methode `graad-en-stroom`. Anders wordt het `status: "geen"`, en een bestaand bestand blijft staan met `nietMeerInBron`;
   - een 404 op een latere pagina of elke andere status: fout 1.
5. **Bouwen.** Het script bouwt het matrixbestand, één bestand per gekoppelde groep en de index. Daarbij gelden drie regels:
   - het versiemerk (`setSha`, `setAantal`) komt uit `--minimumdoelen/index.json`;
   - een bestand dat opnieuw gebouwd is met het oude `opgehaald` en byte voor byte gelijk is, wordt **niet aangeraakt**;
   - de uitvoer hangt niet af van de volgorde van de invoer.
6. **Poorten** (§ 5.3), daarna de sleutelcontrole, het schrijven en het rapport.

### 5.3 Harde poorten (niets schrijven behalve het rapport)

| Code | Wanneer |
|---|---|
| 1 | Een HTTP-fout na de herhalingen, een doorverwijzing, geen JSON, een link naar een andere origin, een lus in de paginering, een 404 op een latere pagina |
| 1 | Matrix onvolledig: het aantal groepen is niet `meta.total_elements` |
| 1 | Koppeling onvolledig: het aantal ontvangen records is niet `gegevens.totalItems`, of dezelfde eerste record staat op twee pagina's |
| 1 | De sleutel staat in een tekst, `--groepen` is ongeldig, of `--alleen koppeling` vindt geen matrix |
| 2 | Geen enkele groep ontvangen |
| 3 | L1: er is geen lijstpad, of meer dan één, of `meta.total_elements` of `totalItems` ontbreekt |
| 3 | D1: een dubbel groepnummer of structuuronderdeelnummer, een onderdeel in twee groepen, of een groep of onderdeel zonder geldig nummer |
| 3 | D2, **de filter wordt genegeerd**: `totalItems` van een groep ≥ `T`, of > 5000 |
| 3 | D3: een set uit de koppeling staat niet in `minimumdoelen/index.json`, of een nummer staat niet in dat setbestand. De melding: "De minimumdoelen in de repository lopen achter op de API. Start de workflow met ‘alles’." |
| 3 | D4: de graad van een set (index) verschilt van de graad van de groep, als beide gekend zijn (niet bij `graad-en-stroom`) |
| 3 | D5: binnen één set van één groep komt meer dan één `onderwijssoort` voor |
| 3 | D6, massaverlies: het aantal groepen of onderdelen in de API daalt met meer dan 10 % tegenover het bestaande bestand; of meer dan max(5, 10 %) van de gekoppelde groepen valt naar "geen"; of, bij een volledige run, is minder dan 50 % van de gewone groepen van de 2de en 3de graad gekoppeld |
| 3 | D7: een record zonder vast nummer of zonder set |
| 3 | D8, ordeningskader: bij een volledige run moet elk groepnummer dat in een geldige set van `--minimumdoelen` getagd is (nu 133, allemaal actueel, 2de of 3de graad, DO of DU), gekoppeld zijn, als het nu in de matrix staat als gewone, niet-afgebouwde groep van de 2de of 3de graad. Anders: "de filter lijkt niet meer te werken". Een getagde groep die niet meetelt, komt met de reden in de waarschuwingen (`ordeningskader.nietMeegeteld`). Staat een getagde groep helemaal niet in de matrix en telt de matrix minstens 100 groepen, dan is het ook exit 3. |

### 5.4 Zachte controles (in het rapport en de PR-tekst, geen stop)

- De kruiscontrole met het ordeningskader op het niveau van de nummers (`kruiscontrole`). Na G1 wordt ze streng als de geldige SO-sets 0 verschillen geven.
- Verdwenen of afgebouwde groepen en onderdelen; richtingen die nu geen doelen meer hebben.
- Het aantal 404's per soort groep; een groep van de 1ste graad die plots wél gekoppeld is.
- `onderwijssoort` die verschilt van `soortVanSet(naam)`.
- `vorige` of `volgende` die niet in de matrix staan; onbekende velden.

## 6. Workflow: één update, één pull request

We passen `.github/workflows/minimumdoelen.yml` aan. De bestandsnaam blijft, zodat de geschiedenis en de cron (`23 5 3 * *`) blijven.

- `name: Leerplangegevens bijwerken`; concurrency-groep `leerplangegevens`; `timeout-minutes: 60`.
- Invoer bij `workflow_dispatch`:
  - `filter` (blijft);
  - `onderdelen` (keuze `alles` | `minimumdoelen` | `studierichtingen`, standaard `alles`);
  - `groepen` (tekst: leeg is alle groepen, `geen` is alleen de matrix, anders een lijst van groepnummers).
  - Alle invoer gaat via `env`, nooit rechtstreeks in de opdrachtregel. `GROEPEN` wordt nagekeken tegen `^(geen|G-[0-9]{4,6}(,G-[0-9]{4,6}){0,49})?$`; anders exit 1.
- Stappen:
  1. checkout en setup-node 22;
  2. "Minimumdoelen ophalen": de inhoud (env en run) blijft **ongewijzigd**; erbij komt alleen `if: ${{ inputs.onderdelen != 'studierichtingen' }}`. Bij de geplande run is de invoer leeg, dus lopen beide stappen;
  3. **"Studierichtingen en koppeling ophalen"**: `if: ${{ inputs.onderdelen != 'minimumdoelen' }}`. Het geheim staat alleen in de env van deze stap, en de stap draait vóór `npm ci --ignore-scripts`. `geen` wordt `--alleen matrix`; een lijst wordt `--groepen`;
  4. `npm ci --ignore-scripts`;
  5. **"Geschreven bestanden en de hele app controleren": `npx vitest run`**, alle tests. Dat dicht het gat dat tests met echte ODS-ids pas in deploy.yml liepen;
  6. de artifacts `minimumdoelen-rapport` en `studierichtingen-rapport` (`always`);
  7. de samenvatting met beide tabellen. Alle tekst uit de API of het rapport gaat via `kort()`;
  8. de pull request: `git status --porcelain -- public/leerplannen`, branch `leerplangegevens/bijwerken-<datum>-<run>`, titel "Leerplangegevens bijgewerkt (<datum>)", `git add -- public/leerplannen`. De foutafhandeling (vergelijkingslink) blijft zoals nu.
- De PR-tekst krijgt bovenop de bestaande delen:
  - "Studierichtingen: nieuw / gewijzigd / afgebouwd / niet meer in de bron (bestanden blijven staan)";
  - "Doelen per richting: nieuw / gewijzigd / nu zonder doelen (laatst bekende koppeling blijft staan: kijk dit na)";
  - "Kruiscontrole met het ordeningskader: N verschillen (M in geldige sets van het gewoon secundair)";
  - "1ste graad: per stroom (regel), of nu wél gekoppeld";
  - bij `groepen`: "**Proefrun** voor <groepen>: niet samenvoegen".
- Faalt één ophaalstap, dan komt er geen PR, dus nooit een halve update. Blijft de koppeling stuk, dan laat de noodinvoer `onderdelen=minimumdoelen` de minimumdoelen toch door. Het versiemerk (§ 7) houdt de datatest dan groen.

## 7. Versiemerk per set: de regel voor tests en app

> Wie de koppeling met de minimumdoelen combineert, controleert **strikt** wat bij dezelfde versie van een set hoort: `setSha` is gelijk aan de eerste 16 tekens van de `sha256` in de index. Wat sindsdien veranderde, wordt **gemeld**, niet als fout behandeld.

- **Altijd strikt:**
  - vorm, sortering en sha256 van elk bestand;
  - elke set bestaat in `minimumdoelen/index.json` (het minimumdoelenscript wist nooit een setbestand: de index wordt uit de bestaande bestanden opgebouwd);
  - elk groepnummer bestaat in de matrix.
- **Strikt bij een gelijk versiemerk:**
  - elk nummer staat in het setbestand;
  - `setAantal` is gelijk aan het aantal in de index.
- **Bij een ander versiemerk:**
  - de datatest slaat die regel over, met `console.info`;
  - de app neemt van een hele set de **huidige** inhoud;
  - van een deelset neemt de app de nummers die nog bestaan, en zegt: "<n> doelen uit de koppeling staan niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.";
  - `leerplanUitSelectie` meldt dat zelf ook ("gekozen doel staat niet (meer) in de set").

## 8. Datatest `src/lib/studierichtingen.data.test.ts` (nieuw)

Een **andere agent** schrijft dit bestand dan de schrijver van het script. Hij werkt alleen uit de invarianten hieronder. Het bestand draait in deploy.yml (`npm test`) en in de workflow.

De kern is één functie in het testbestand: `controleerStructuurMap(uit, minimumdoelen): { fouten: string[]; info: string[] }`. Ze draait op:
1. de echte map `public/leerplannen/structuur` (`describe.runIf(existsSync(matrix))`, met een harde fout als er `richtingdoelen/*.json` staan zonder index);
2. `tests/fixtures/structuur/uit` (altijd, als positief geval);
3. kapotte kopieën in een tijdelijke map: de **zelftest**. Minstens 8 gebroken invarianten moeten gevonden worden: sha256, sortering, onbekende set, onbekend nummer bij een gelijk versiemerk, graadconflict, index tegenover bestand, dubbel groepnummer, `graad-en-stroom` buiten de 1ste graad.

Invarianten:
- **Matrix**
  - M1: de kop, `aantalGroepen` en `aantalOnderdelen` kloppen, en de sha256 klopt.
  - M2: gesorteerd en uniek; groepnummers op `GROEP_NUMMER`; onderdeelnummers gehele getallen > 0.
  - M3: elk `onderdeel.groep` bestaat, en `groep.onderdelen` noemt precies de onderdelen met die groep.
  - M4: geldige datums. Een einddatum vóór de begindatum mag: 8 geannuleerde 7de jaren hebben dat in de echte data (status NIET_ERKEND), vastgesteld in P1.
  - M5: `vorige`, `volgende`, `voorbereidend` en `vervolg` worden geteld. Is dat 0 bij G1, dan wordt het een harde regel.
  - M6: `valideerMatrixBestand` geeft [].
  - M7: elke gewone groep van de 1ste graad heeft een stroom (`stroomVanEersteGraad`).
- **Index**
  - I1: `matrixSha256 === matrix.sha256`.
  - I2: precies één regel per groep, gesorteerd.
  - I3: status en methode zijn geldig; `graad-en-stroom` komt alleen bij graad "1" voor.
  - I4: "gekoppeld" betekent: het bestand bestaat en `aantal`, `sets`, `sha256` en `opgehaald` zijn gelijk aan de kop. "geen" met een bestand betekent: dat bestand heeft `nietMeerInBron`. "nog-niet-opgehaald" heeft geen bestand.
  - I5: in de map staan geen bestanden buiten de index.
- **Per bestand**
  - F1: `valideerRichtingDoelenBestand` geeft []; `groep` is gelijk aan de bestandsnaam; de sha256 klopt; `aantal` is de som van de ids.
  - F2: de set staat in de index (altijd). Bij een gelijk versiemerk staat elk nummer in het setbestand en geldt `setAantal` = `aantal` (§ 7).
  - F3: de graad van de set klopt met de graad van de groep.
  - F4: bij `graad-en-stroom` hebben alle sets graad "1ste graad" en de stroom van de groep, en staat elke set er volledig in.
  - F5: `onderwijssoort` "Buitengewoon" tegenover `soortVanSet(naam) === 'buso'` wordt geteld. Na G1 wordt `ONDERWIJSSOORT_STRENG` true als de telling 0 is.
  - F6: de kruiscontrole wordt geteld. Na G1 wordt `KRUISCONTROLE_STRENG` true als de geldige SO-sets 0 verschillen geven.
  - F7 (komt erbij in G1): een vaste verwachting op de echte data. G-0193 heeft in ODS_3132 precies de nummers die het ordeningskader aan G-0193 geeft (4 van de 13), alleen bij een gelijk versiemerk.

## 9. Welke doelen horen bij een richting en een jaar (`src/lib/richtingKader.ts`, nieuw)

### 9.1 Regels

Het **kader** van een keuze `{groep, jaar?, soort, onderdeel?}` volgt uit het koppelingsbestand en `minimumdoelen/index.json`. De app maakt zelf nooit een koppeling.

| Regel | Inhoud | Bron |
|---|---|---|
| R1 | Alleen sets uit de index. De rest gaat naar `onbekend`. | data |
| R2 | Soort: `onderwijssoort` "Buitengewoon" → `buso`, anders `soortVanSet(naam)`. Standaard is de keuze `so`. `buso` kan alleen als een geldig onderdeel `ov4` heeft. Een BuSO-groep is altijd `buso`. | officieel veld, met terugval |
| R3 | Actueel: wat in `oudeVersieIds(index)` staat, valt weg en wordt geteld in `verborgenOud`. | bestaande, geteste regel |
| R4 | Jaar. Een groep van de 3de graad zonder `type7`: sets met leerjaar "3de leerjaar" gaan naar `nietVoorDitJaar`. Een groep van een 7de jaar: als er sets met "3de leerjaar" zijn, alleen die; anders alles. **Te bevestigen** bij G1. | het officiële veld `leerjaar` |
| R5 | `volledig = ids.length === setAantal`; `versieGelijk = setSha === index.sha256.slice(0, 16)` | data |
| R6 | `verplicht = !isUitbreidingsSet(naam)`: het laatste deel na " - " is "Uitbreidingsdoelen" (ODS_3357 en ODS_3359, 1ste graad). | officiële naam |
| R7 | Volgorde: oplopend setnummer, de doelen in setvolgorde. Deterministisch, zodat de leerplancodes op elk toestel gelijk zijn. | ontwerp |

Wat weggefilterd is, blijft zichtbaar: `nietVoorDitJaar` als lijst, `verborgenOud` en `verborgenAndereSoort` als aantallen, `onbekend` als lijst.

Gemeten op de gegevens van run 4 (actueel, gewoon secundair, eigen graad): hoogstens ±26 sets en ±250 doelen per richting. Dat is ruim binnen MAX_SETS 50 en MAX_DOELEN 5000. `bouwKader` zet toch `teGroot` als het kader die grenzen overschrijdt.

### 9.2 Bijzondere gevallen

- **1ste graad.** Dezelfde code als de rest, met methode `graad-en-stroom`. 1A en 2A delen het kader van de A-stroom (20 actuele SO-sets).
- **Status `geen`.** De herkomst is `geen`. Is er een laatst bekend bestand, dan toont het scherm dat met een waarschuwing.
- **Status `nog-niet-opgehaald`** of geen index: de herkomst is `nog-niet-opgehaald`.
- **Afgebouwd.** Een onderdeel met een einddatum vóór vandaag. Een groep is afgebouwd als al zijn onderdelen dat zijn. In de huidige matrix zijn dat alleen 7de jaren (86 groepen). De opvolgers komen uit `volgende`, via hun groep.
- **Niet meer in de bron** (herstel oktober 2026). Een onderdeel met `nietMeerInBron` blijft in de matrix staan (B5), zonder einddatum, maar telt niet als geldig: niet voor de soort, de jaren, vormen en domeinen, `kanBuso`, "afgebouwd" en de variantkeuze (`geldigeOnderdelen`). De opvolgers komen wel uit alle onderdelen. Staat geen enkel onderdeel van de groep nog in de bron, dan tellen alle onderdelen: die beschrijven de richting zoals ze was. Zo doet het ophaalscript het ook (`soortenVan`).
- **Jaren van een groep.** De unie van de geldige `leerjaren.code` van de geldige onderdelen (nog in de bron) die geen aanloop zijn, via `jaarVan`. G-0307 → 1, G-0311 → 2, 2de graad → 3 en 4, 3de graad → 5 en 6, 7de jaar → 7. BuSO zonder graad heeft geen jaar.
- **Dezelfde naam in een andere graad** (27 namen): het detail toont "Deze richting bestaat ook in de 3de graad: …" met een link.

### 9.3 Signaturen

```ts
// src/lib/richtingKader.ts (nieuw; gebruikt studierichtingen.ts, minimumdoelenBron.ts, minimumdoelen.ts, sha256.ts, doelgroep.ts, doelenSamenstellen.ts)
export type SoortKeuze = 'so' | 'buso';
export interface RichtingKeuze { groep: string; jaar?: number; soort: SoortKeuze; onderdeel?: number }
export interface RichtingInfo {
  groep: StudierichtingGroep; onderdelen: Structuuronderdeel[]; soort: GroepSoort; graad?: 1 | 2 | 3;
  jaren: number[]; stroom?: 'A' | 'B'; vormen: string[]; domeinen: string[]; duaal: boolean; kanBuso: boolean;
  afgebouwd: boolean; afgebouwdSinds?: string; opvolgers: StudierichtingGroep[]; zelfdeNaam: StudierichtingGroep[];
  nietMeerInBron?: string;
}
//   onderdelen: alle, ook de afgebouwde en die niet meer in de bron staan; de rest rekent alleen met die nog in de bron staan
export function richtingInfo(matrix: MatrixBestand, groep: string, vandaag: string): RichtingInfo | undefined;
export function geldigeOnderdelen(info: RichtingInfo, vandaag: string): Structuuronderdeel[];
//   waaruit een variant te kiezen valt: nog in de bron en geldig; bij een afgebouwde richting alle die nog in de bron staan;
//   staat geen onderdeel meer in de bron, dan alle (herstel oktober 2026; vroeger in RichtingDetail.tsx)
export interface RichtingFilter { graad?: 1 | 2 | 3; finaliteit?: string; zoek: string; ookMeer: boolean; afgebouwd: boolean }
export function filterRichtingen(matrix: MatrixBestand, filter: RichtingFilter, vandaag: string): RichtingInfo[];
//   standaard: soort gewoon en ander, niet afgebouwd; ookMeer: ook zevende, aanloop, buso; zoeken zonder accenten
export type KaderHerkomst = 'api' | 'graad-en-stroom' | 'geen' | 'nog-niet-opgehaald';
export interface KaderSet { set: MinimumdoelenIndexSet; ids: readonly string[]; volledig: boolean; verplicht: boolean; versieGelijk: boolean }
export interface RichtingKader {
  keuze: RichtingKeuze; herkomst: KaderHerkomst; opgehaald?: string; nietMeerInBron?: string;
  sets: KaderSet[]; aantalDoelen: number; aantalVerplicht: number; nietVoorDitJaar: KaderSet[];
  verborgenOud: number; verborgenAndereSoort: number; onbekend: string[]; teGroot: boolean;
}
export function isUitbreidingsSet(naam: string): boolean;
export function setPastBijJaar(set: { leerjaar?: string }, info: RichtingInfo, heeftLj3: boolean): boolean;
export function bouwKader(bestand: RichtingDoelenBestand | null, regel: RichtingDoelenIndexRegel | undefined,
  index: readonly MinimumdoelenIndexSet[], keuze: RichtingKeuze, info: RichtingInfo): RichtingKader;
export function selectieVanKader(kader: RichtingKader, opties?: { sets?: readonly string[]; ookUitbreiding?: boolean }):
  Map<string, 'alle' | readonly string[]>;   // volledig → 'alle', deel → de ids; uitbreiding alleen op vraag
export function naarSetKeuzes(selectie: ReadonlyMap<string, 'alle' | readonly string[]>,
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): { keuzes: SetKeuze[]; ontbrekend: { set: string; ids: string[] }[] };
//   een deelset geeft ALTIJD een lijst ids, nooit 'alle' (§ 9.5); ids die niet meer in het bestand staan → ontbrekend
export function kaderVingerafdruk(kader: RichtingKader, sets?: readonly string[]): string;
//   sha256Hex van de gesorteerde regels "set|id" (een volledige set als "set|*"), beperkt tot `sets`. Ziet een deelset die
//   verandert en een set die volledig wordt of niet meer, NIET een volledige set die groeit of krimpt. Formaat nooit
//   veranderen: elk bewaard leerplan van een richting draagt deze afdruk als `doelgroep.kader`.
export function volledigeSetsVingerafdruk(kader: RichtingKader, sets?: readonly string[]): string;
//   sha256Hex van de gesorteerde regels "set|id" van alleen de volledige sets, beperkt tot `sets`; bewaard als
//   `doelgroep.kaderVolledig` (herstel oktober 2026). Formaat ook nooit veranderen.
export function kaderAfdrukken(kader: RichtingKader, sets: readonly string[]): { kader: string; kaderVolledig: string };
//   beide afdrukken over de sets die echt in het leerplan zitten: wat een leerplan van een richting bij het maken krijgt
export type KaderVerandering = 'niets' | 'alles' | ReadonlySet<string>;
export function veranderdSindsLeerplan(leerplan: Pick<Curriculum, 'kind' | 'doelgroep' | 'minimumdoelenSets'>,
  kader: RichtingKader): KaderVerandering;
//   de ene regel van § 11.2 voor vergelijkMetKader én beginUitBewaarde: niets, alles, of alleen deze (volledige) sets
export function kaderGroepSleutel(info: RichtingInfo, soort: SoortKeuze): string;  // 1ste graad: "1|A|so"; anders "G-0193|so"
export function kenmerkenVan(info: RichtingInfo): string;  // "2de graad · Doorstroomfinaliteit · aso · Domeinoverschrijdend · 3de en 4de jaar"
export const FINALITEIT_LABEL: Record<string, string>;     // DO Doorstroomfinaliteit, DU Dubbele finaliteit, A Arbeidsmarktfinaliteit
export function doelgroepVan(info: RichtingInfo, keuze: RichtingKeuze, extra?: { vak?: string }): Doelgroep;
```

### 9.4 Lader en hook

```ts
// src/lib/studierichtingenBron.ts (nieuw, naar het model van minimumdoelenBron.ts)
export const STRUCTUUR_MAP = `${import.meta.env.BASE_URL}leerplannen/structuur/`;
export const FOUT_NOG_NIET_OPGEHAALD = 'De lijst van de studierichtingen staat nog niet in Boosterz. Ze wordt elke maand opgehaald bij de Vlaamse overheid.';
export const FOUT_STUDIERICHTINGEN = 'De studierichtingen konden niet geladen worden. Controleer je verbinding en probeer opnieuw.';
export function laadMatrix(): Promise<MatrixBestand>;            // gedeelde belofte; 404, 200 met text/html of geen JSON → Error(FOUT_NOG_NIET_OPGEHAALD); fout → belofte gewist
export function laadRichtingDoelenIndex(): Promise<RichtingDoelenIndex | null>; // 404 → null
export function laadRichtingDoelen(groep: string): Promise<RichtingDoelenBestand | null>;
//   ongeldig groepnummer → Error zonder verzoek; 404 → null; cache van 20; groep in het bestand = gevraagde groep
export function wisStudierichtingenCache(): void;

// src/components/richting/useRichtingGegevens.ts (nieuw, dunne hooks op useLaadstand)
export function useRichtingGegevens(): { stand: Laadstand<{ matrix: MatrixBestand; koppeling: RichtingDoelenIndex | null; index: MinimumdoelenIndex }>; opnieuw: () => void };
export function useRichtingKader(info: RichtingInfo | undefined, keuze: RichtingKeuze | undefined):
  { stand: Laadstand<{ bestand: RichtingDoelenBestand | null; kader: RichtingKader }>; opnieuw: () => void };
```

Elk bestand gaat door de `valideer…`-functie uit `studierichtingen.ts`. De gegevens blijven in het geheugen, nooit in localStorage.

### 9.5 Valkuil in de bestaande keuzelogica (getest)

`zetDoelen` maakt van een selectie weer `'alle'` zodra alle *kiesbare* doelen gekozen zijn (samenstelKeuze.ts r. 227-239). `bouwSetKeuzes` maakt van `'alle'` de hele set (r. 304-323). Een scherm dat een beperkte lijst kiesbare doelen doorgeeft (bv. alleen de 4 van de 13 Biologie-doelen van een richting), zou zo stil 13 doelen opleveren. Daarom:
- geeft geen enkel richtingscherm een beperkte `kiesbaar` door: de samenstelwizard werkt altijd met `kiesbareDoelen(bestand)` van de hele set;
- geeft `naarSetKeuzes` voor een deelset altijd een lijst nummers;
- komt er een regressietest in `samenstelKeuze.test.ts` en `richtingCursus.test.ts`: een deelset van 4 van 13 blijft 4 doelen na `beginUitKeuze` + `bouwSetKeuzes`, en na `naarSetKeuzes` + `leerplanUitSelectie`.

## 10. Doelgroep in het datamodel

### 10.1 `src/lib/doelgroep.ts` (nieuw, puur, zonder imports)

```ts
export interface Doelgroep {
  groep: string;          // 'G-0193' (structuuronderdeel_groep_nummer): de sleutel, gelijk op elk toestel
  titel: string;          // momentopname voor weergave: de titel van de groep of van het gekozen onderdeel; één regel, ≤ 160
  graad?: 1 | 2 | 3;      // ontbreekt bij BuSO en OKAN
  jaar?: number;          // 1–7, past bij de graad (1: 1–2, 2: 3–4, 3: 5–7); leeg = de hele graad (op een leerplan altijd leeg)
  soort: 'so' | 'buso';
  onderdeel?: number;     // structuuronderdeelnummer (basisoptie, variant): alleen weergave
  vak?: string;           // vrije tekst ≤ 80, alleen weergave en voorstel, geen koppeling
  kader?: string;         // 64 hex: kaderVingerafdruk bij het maken (alleen zinvol op een leerplan)
  kaderVolledig?: string; // 64 hex: volledigeSetsVingerafdruk bij het maken; alleen samen met kader (nieuw, oktober 2026;
                          // leerplannen van daarvoor hebben het niet, zie § 11.2)
  volgtKader?: true;      // leerplan gemaakt per set: "Werk het leerplan bij" mag nieuwe doelen van de koppeling toevoegen
}
export const MAX_DOELGROEP_TITEL = 160;
export const MAX_DOELGROEP_VAK = 80;
export function sanitizeDoelgroep(raw: unknown): Doelgroep | undefined;
export function doelgroepVoorLeerplan(raw: unknown): Doelgroep | undefined; // saneert en laat het jaar weg (P5)
export function doelgroepVoorCursus(raw: unknown): Doelgroep | undefined;   // saneert en laat kader, kaderVolledig en volgtKader weg
export function jaarTekst(jaar: number): string;        // "1ste jaar" … "7de jaar"
export function graadTekst(graad: 1 | 2 | 3): string;   // "2de graad"
export function doelgroepTekst(d: Doelgroep, opties?: { zonderVak?: boolean }): string;
//   "Biologie · Natuurwetenschappen · 4de jaar" · "Natuurwetenschappen · 2de graad" · "… · buitengewoon (OV4)";
//   in de 1ste graad zonder jaar: "Tweede leerjaar A: Stem-wetenschappen"
export function zelfdeRichting(a: Doelgroep | undefined, b: Doelgroep | undefined): boolean; // zelfde groep en soort
```

**Tekstregels van `doelgroepTekst` (vastgelegd in P5).**
- In de 1ste graad komt er nooit "· 1ste jaar" of "· 1ste graad" achter de titel, ook niet met een jaar: de titel noemt het leerjaar al ("Nederlands · Eerste leerjaar A").
- BuSO: "· buitengewoon (OV4)" als er een graad is, anders "· buitengewoon".
- `doelgroepTekst` en `zelfdeRichting` saneren hun invoer eerst.

**Leerplangrenzen.** `sanitizeCurriculumMetRapport`, `leerplanUitSelectie` en `bouwOntwerp` gebruiken `doelgroepVoorLeerplan`: een leerplan draagt nooit een jaar (het geldt voor de hele graad). Zo valt een cursus zonder eigen doelgroep niet stil weg uit de andere jaren van de graad.

**Eigen kopie.** `maakEigenKopie` neemt de doelgroep mee zonder `kader`, `kaderVolledig` en `volgtKader`: een eigen kopie volgt de officiële koppeling niet meer. De knoppen "Werk het leerplan bij" en "Kies de doelen opnieuw" verschijnen alleen bij `kind !== 'eigen'`.

**Cursus.** Een cursus draagt nooit `kader`, `kaderVolledig` of `volgtKader`: die horen bij een leerplan. `doelgroepVoorCursus` haalt ze altijd alle drie samen weg; `cursusVoorRichting` en de overdracht naar de AI-cursusbouwer (CoursesPage.tsx) gebruiken die functie.

**AI.** `sanitizeAICourse` neemt naast de doelgroep ook `curriculumId` nooit uit het AI-antwoord: alleen uit de opties of de bestaande cursus.

**Saneren.**
- Is de invoer geen object, of past de groep niet op `/^G-\d{4,6}$/`, dan is het resultaat `undefined`.
- `titel` wordt getrimd en één regel, ≤ 160 tekens. Is ze leeg, dan wordt het de groep zelf.
- `graad` is 1 tot 3 (ook als tekst). `jaar` is een geheel getal van 1 tot 7 dat bij de graad past; anders valt het weg.
- `soort` is alleen `buso` bij precies `'buso'`.
- `onderdeel` is een geheel getal van 1 tot 999999.
- `vak` wordt getrimd, ≤ 80 tekens; leeg valt weg.
- `kader` geldt alleen als 64 hex-tekens. `kaderVolledig` ook, en alleen samen met een geldig `kader`: wie `kader` weghaalt, verliest `kaderVolledig` zo ook bij de volgende sanering. `volgtKader` geldt alleen als `true`.
- Er komt altijd een nieuw object met alleen deze sleutels, dus geen `__proto__`. De functie is idempotent.

Het bestand staat niet op het kritieke pad: `courses.ts`, `curriculum.ts` en `handoff.ts` worden alleen lui geladen.

### 10.2 Elke grens

| Waar | Wat |
|---|---|
| `Course` (courseTypes.ts) | `doelgroep?: Doelgroep`. In `sanitizeCourse` (courses.ts r. 1330): `...(dg ? { doelgroep: dg } : {})` met `dg = sanitizeDoelgroep(c.doelgroep)`. Daarmee zijn de deellink (v blijft 1), het cursusbestand (v 1), het klaspakket (classPack.ts r. 119), `adoptSharedCourse` en `comparable` gedekt. |
| `sanitizeAICourse` (aiCourse.ts r. 666-675) | In `full`, **na** `...resolved`: `doelgroep: base?.doelgroep`. De AI kan nooit een doelgroep zetten, en "Herwerk met AI" of "Vul de hiaten" houdt ze. |
| `Curriculum` (curriculumTypes.ts) | `doelgroep?: Doelgroep`. In `sanitizeCurriculumMetRapport` (curriculum.ts r. 534), naast `weggelatenCodes`. Het veld telt **niet** mee in `doelenVingerafdruk`: een nagekeken leerplan blijft nagekeken. Export v2 neemt het vanzelf mee. |
| `SamenstelOpties` (doelenSamenstellen.ts r. 42) | `doelgroep?: Doelgroep`. `leerplanUitSelectie` zet in `kop` (dat bij `bestaand` alleen id en createdAt overneemt): `doelgroep = opties.doelgroep ?? doelgroepVanBestaand(bestaand, selectie)`, alleen als die bestaat. Anders verdwijnt de richting bij "Keuze aanpassen". Zonder nieuwe doelgroep blijft alles van `bestaand` (ook `kader` en `kaderVolledig`), behalve `volgtKader` als de keuze veranderde: andere sets of per set andere vaste nummers (`zelfdeSelectie`; volgorde en dubbels tellen niet). Anders zou "Werk het leerplan bij" de eigen keuze overschrijven; zonder `volgtKader` biedt het scherm "Kies de doelen opnieuw". Een ongewijzigde keuze houdt `volgtKader` (herstel oktober 2026). |
| `OntwerpOpties` (leerplanInlezen.ts) | `doelgroep?: Doelgroep`. `bouwOntwerp` (r. 489) zet het, of houdt dat van `bestaand`. |
| `Handoff` (handoff.ts) | `doelgroep?: Doelgroep`. `peekHandoff` saneert het met `sanitizeDoelgroep`. |
| `AIStart` (CoursesPage.tsx r. 31) | `doelgroep?: Doelgroep`, uit de overdracht via `doelgroepVoorCursus` (zonder `kader`, `kaderVolledig` en `volgtKader`, ook als een andere bron ze meegeeft). `onResult` bewaart `aiStart.doelgroep ? { ...course, doelgroep } : course`. |
| Lezen | `getCourses` en `getCurricula` saneren niet. Elke lezer gaat daarom via `sanitizeDoelgroep`, en het richtingscherm via `doelgroepVanCursus(course, curricula)`: die van de cursus, anders die van haar leerplan. |

`maakEigenKopie` en het bewerken in de editor spreiden het object, dus het veld blijft vanzelf. Bestaande bestanden, links en het voorbeeldmateriaal blijven geldig (examples.test.ts).

## 11. Leerplannen per richting

### 11.1 Het officiële leerplan van een richting

`src/lib/richtingCursus.ts` (nieuw, zie ook § 12):

```ts
export function leerplanVoorRichting(kader: RichtingKader, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>, doelgroep: Doelgroep,
  opties?: { sets?: readonly string[]; ookUitbreiding?: boolean; bestaand?: Curriculum; titel?: string; vak?: string; oudeVersies?: ReadonlySet<string> }):
  Samengesteld & { ontbrekend: { set: string; ids: string[] }[]; ontbrekendeSets: string[] };
//   een gevraagde set zonder bruikbaar setbestand: waarschuwing vooraan ('De set "…" kon niet geladen worden.'),
//   in ontbrekendeSets, en bevestigd = false (niets bewaren). Bij bestaand blijven de uitbreidingssets van het
//   leerplan gevraagd (P7).
//   = leerplanUitSelectie(naarSetKeuzes(selectieVanKader(kader, opties), bestanden).keuzes,
//       { titel, vak, bestaand, oudeVersies, doelgroep: { ...doelgroep, jaar: undefined, ...kaderAfdrukken(kader, sets), volgtKader: true } })
//   met `sets` de sets die echt in het leerplan zitten; kaderAfdrukken geeft `kader` en `kaderVolledig` (§ 11.2)
export function titelVoorRichtingLeerplan(info: RichtingInfo, kader: RichtingKader, sets?: readonly string[], vak?: string): string;
export function selectieVanKeuzes(keuzes: readonly SetKeuze[]): Map<string, string[]>;
export function vindLeerplanMetSelectie(curricula: readonly Curriculum[], selectie: ReadonlyMap<string, readonly string[]>, doelgroep?: Doelgroep): Curriculum | undefined;
//   samengesteld, kind ≠ 'eigen', effectieveStatus 'gecontroleerd', geen doelgroep van een andere groep, en
//   selectieVanLeerplan gelijk aan selectie (zonder op de volgorde te letten) (P7)
export function vergelijkMetKader(leerplan: Curriculum, kader: RichtingKader): { nieuw: number; vervallen: number; setsNietMeerInKader: string[] };
```

- **Titels** (≤ 120 tekens):
  - "Natuurwetenschappen · 2de graad" (alle sets);
  - "Biologie · Natuurwetenschappen · 2de graad" (met een vak, of één set);
  - "Nederlands en 3 andere · Natuurwetenschappen · 2de graad";
  - in de 1ste graad: "A-stroom · 1ste graad".
- **Hergebruik.** `vindLeerplanMetSelectie` voorkomt dubbels in localStorage.
- **Niet nagekeken = niet bewaren.** Is `bevestigd` false (meer dan 50 sets, geen doelen, een doel valt weg bij het saneren), dan wordt er niets bewaard en toont het scherm de eerste waarschuwing.

### 11.2 Bijwerken na een maandelijkse update

**Twee vingerafdrukken.** Een leerplan van een richting krijgt bij het maken twee afdrukken van het kader, allebei over de sets die echt in het leerplan zitten (`kaderAfdrukken(kader, leerplan.minimumdoelenSets)`):
- `doelgroep.kader` (`kaderVingerafdruk`): de nummers van de deelsets, en welke sets volledig zijn (als "set|*"). Dit formaat bestaat sinds het begin en verandert nooit.
- `doelgroep.kaderVolledig` (`volledigeSetsVingerafdruk`, nieuw in oktober 2026): de nummers van de volledige sets. Zonder deze afdruk zag de app niet dat een volledige set groeide of kromp (een update waarin koppeling en set samen bijgewerkt zijn): de regel "set|*" blijft dan gelijk.

In gewone woorden: de app onthoudt bij het maken van een leerplan hoe de officiële koppeling er toen uitzag. De eerste afdruk ziet of er bij een deel van een set doelen bijkwamen of wegvielen, en of een set volledig werd of niet meer. De tweede ziet of een set die je helemaal koos, groter of kleiner werd. Is er niets veranderd, dan meldt de app niets en blijft je keuze zoals ze is, ook wat je zelf koos. Veranderde alleen een volledige set, dan kijkt de app alleen die sets na: wat je bij een deel van een set koos, blijft staan.

**Eén regel: `veranderdSindsLeerplan(leerplan, kader)`** (richtingKader.ts). `vergelijkMetKader` (de melding en "Werk het leerplan bij") en `beginUitBewaarde` ("Kies de doelen opnieuw") rekenen allebei met deze regel, zodat scherm en melding niet uiteenlopen.

| Geval | Uitkomst |
|---|---|
| Een eigen kopie (`kind` 'eigen'), een kader dat nog niet opgehaald is, of een kader 'geen' zonder sets | `'niets'` |
| `kader` en `kaderVolledig` gelijk aan die van het huidige kader over de sets van het leerplan | `'niets'` |
| `kader` gelijk, `kaderVolledig` ontbreekt (een leerplan van vóór oktober 2026) | `'niets'`, zoals vroeger. Of een volledige set sindsdien groeide, is niet te zien, en wat in een volledige set ontbreekt, kan een eigen keuze zijn. Zo'n leerplan krijgt `kaderVolledig` bij "Werk het leerplan bij" of als het opnieuw met een richting bewaard wordt. |
| `kader` gelijk, `kaderVolledig` anders | De volledige sets van het leerplan: alleen die worden vergeleken. De deelsets en welke sets volledig zijn, veranderden zeker niet: daar vervalt niets en komt niets bij (ook niet wat de leerkracht zelf koos, en niets uit sets buiten het kader). Een volledige set met een andere versie geeft 0 nieuw en 0 vervallen. |
| `kader` anders of ontbreekt | `'alles'`: de volledige berekening |

`vergelijkMetKader` geeft dan, voor de sets die vergeleken worden:
- `vervallen`: verwijzingen die niet meer in het kader staan: de hele set staat er niet meer in (bv. een set die een oude versie werd), of het nummer staat niet meer in de koppeling. Een volledige set met een andere versie dan bij de koppeling (`versieGelijk` onwaar) telt niet: de app neemt daarvan de huidige inhoud.
- `nieuw`: alleen bij `volgtKader`, en alleen voor sets van het leerplan: nummers uit de koppeling die nog niet in het leerplan staan. Bij een volledige set alleen als de versie gelijk is (anders kennen we de nummers niet): een volledige set die groeide (ook als er tegelijk evenveel nummers wegvielen), of een deelset die volledig werd. Een volledige set kan dus ook "nieuw" geven, niet alleen een deelset.
- `setsNietMeerInKader`: met hun opvolger uit `opvolgersVan` als die in het kader staat.

Wat het scherm aanbiedt:
- Bij `volgtKader` de knop "Werk het leerplan bij". Die doet `leerplanVoorRichting(…, { bestaand, sets })`, met de sets van het leerplan die nog in het kader staan plus hun opvolgers. De codes blijven (`kenCodesToe`); vervallen codes gaan naar `weggelatenCodes`; cursussen blijven werken. Het bijgewerkte leerplan krijgt beide afdrukken opnieuw.
- Zonder `volgtKader` (per doel gekozen) de knop "Kies de doelen opnieuw", naar `/leerplannen/samenstellen/<id>?richting=…`. De wizard begint dan met de bewaarde keuze, zonder de vervallen doelen. "Vervallen" volgt dezelfde regel als `vergelijkMetKader`: geeft `veranderdSindsLeerplan` `'niets'`, dan vervalt er niets en blijft de keuze precies zoals bewaard, ook doelen die de leerkracht zelf toevoegde. Veranderde alleen een volledige set, dan worden alleen de volledige sets nagekeken. Er komt niets automatisch bij. Melding: "<n> doelen staan niet (meer) in de koppeling van de officiële bron en zijn niet aangevinkt."
- "Keuze aanpassen" op de pagina Leerplannen (zonder richting) houdt `kader` en `kaderVolledig`. `volgtKader` valt weg als de keuze veranderde (§ 10.2), zodat "Werk het leerplan bij" de eigen keuze nooit overschrijft.

**Bekende beperking** (bestond al vóór het herstel van oktober 2026). De afdrukken gaan over alle sets van het leerplan samen. "Keuze aanpassen" zonder richting kent het kader niet en kan ze dus niet herrekenen. Komt er daar een set bij die in het kader staat, of valt zo'n set weg (een set buiten het kader telt niet mee in de afdruk), dan verschilt de afdruk over de nieuwe lijst sets van de bewaarde, ook als de koppeling niet veranderde. Dan wordt alles vergeleken, en een doel dat de leerkracht zelf bij een deelset koos, telt als vervallen; "Kies de doelen opnieuw" vinkt het dan niet meer aan. Voorbeeld: deelsets A (koppeling a1) en B (koppeling b1); de leerkracht neemt a2 erbij (niets te melden) en haalt later B weg: dan telt a2 als vervallen. **Opgelost in fase 2 (A1, § 22.3)** voor leerplannen met `setAfdrukken` (een afdruk per set): alleen sets met een afdruk worden vergeleken, dus deze valse melding komt niet meer. Een leerplan van vóór fase 2 houdt de beperking tot het opnieuw bewaard wordt met zijn richting. Beide gedragingen staan vast in de tests "bekende beperking" in `doelenSamenstellen.test.ts`.

### 11.3 Leerplannen van de netten

- Alleen `NettenLinks` (bestaat) en de vaste uitleg over het auteursrecht.
- "Op dit toestel": `leerplannenBijRichting(curricula, kaderSleutels, groep)` (§ 12.1). Dat zijn leerplannen met dezelfde `doelgroep.groep`, of leerplannen waarvan de `refs` het kader raken. Ze worden gesorteerd op de overlap ("verwijst naar 42 doelen van deze richting"), met hun status.
- **Inlezen voor een richting:** `/leerplannen/inlezen?richting=G-0193&jaar=4&soort=so`.
  - graad, stroom (1ste graad) en onderwijs in `LeerplanKeuze` worden vooraf ingevuld;
  - `useSetKandidaten` geeft `richtingSets` door aan `kandidaatSets`: de kadersets komen eerst, en de lijst blijft daartoe beperkt. Zo is het gekende punt "finaliteit in de inleeswizard" (LEERPLANNEN.md § 14) opgelost met officiële gegevens;
  - `bouwOntwerp` bewaart `doelgroep`.
- Bewust niet: een tabel richting → leerplancode van een net (open vraag).

## 12. Cursushulp: zonder en met AI

### 12.1 `src/lib/richtingCursus.ts` (vervolg)

```ts
export type Startvorm = 'geraamte' | 'leeg';
export interface VakVoorstel { sets: string[]; stemSets: string[] }
export function vakVoorstel(kader: RichtingKader, vak: string): VakVoorstel;
//   setNoemtVak (setKeuze.ts, nieuw geëxporteerd; met vakZoektabel) op de kadersets; STEM-sets apart, NOOIT vooraf aangevinkt.
//   STEM = isStemSet of het losse woord 'STEM' in korte naam of naam (bv. 'STEM - Cesuurdoelen', ODS_3142) (P7)
export function voorstelCursusTitel(d: Doelgroep): string;   // "Biologie · Natuurwetenschappen · 4de jaar"
export function leerplannenBijRichting(curricula: readonly Curriculum[], kaderSleutels: ReadonlySet<string>, groep: string):
  { curriculum: Curriculum; raakt: number; viaDoelgroep: boolean }[];   // kaderSleutels: "set|id"
export function geraamteHoofdstukken(leerplan: Curriculum, codes?: readonly string[]): CourseChapter[];
export function cursusVoorRichting(o: { titel: string; auteur: string; doelgroep: Doelgroep; leerplan: Curriculum;
  codes?: readonly string[]; start: Startvorm }): Course;
export function passendeCodes(course: Course, leerplan: Curriculum): { passend: number; totaal: number };
```

### 12.2 Het geraamte

- Er komt een hoofdstuk per eerste deel van `goal.theme` (vóór " › "). Bij een samengestelde lijst is dat het setlabel. Zonder thema heet het hoofdstuk "Doelen". De volgorde is die van het eerste voorkomen.
- Daarin een sectie per rest van het thema (de rubriek), of "Doelen".
- `goalCodes` zijn de codes van die doelen.
- Er is één blok `callout` met `kind: 'goal'`, de titel "Doelen in deze sectie" en per regel "<code> — <shortGoalText(tekst, 90)>".
- Invariant: elke gekozen code staat in precies één niet-optionele sectie.
- Bij meer dan 400 doelen komt er één sectie per hoofdstuk. Titels zijn hoogstens 120 tekens.
- Leerplannen van een net groeperen op hun eigen `theme`.
- `cursusVoorRichting` vertrekt van `createCourse(titel, auteur)` en zet dan `chapters`, `curriculumId = leerplan.id`, `subtitle = doelgroepTekst(d)` en `doelgroep` (via `doelgroepVoorCursus`: zonder `kader`, `kaderVolledig` en `volgtKader`).
- Bij `leeg` blijft het ene lege hoofdstuk van `createCourse`.
- Een sectie met alleen een doelen-callout telt in de nieuwe dekking als **gepland**, niet als gedekt (§ 13).

### 12.3 Het venster "Nieuwe cursus voor deze richting" (`NieuweRichtingCursus.tsx`)

Props (vast, zodat P8 en P9 parallel kunnen):

```tsx
<NieuweRichtingCursus info={RichtingInfo} kader={RichtingKader} keuze={RichtingKeuze} onClose={() => void} />
<RichtingKiezerModal titel={string} huidig={Doelgroep | undefined} onKies={(d: Doelgroep | undefined) => void} onClose={() => void} />
```

Stroom, in één `Modal`:
1. de titel, met een voorstel;
2. het vak (mag leeg blijven), met een voorstel;
3. welke doelen. Er zijn drie keuzes:
   - "Kies de sets voor deze cursus" (standaard, niets aangevinkt zonder vak);
   - "Alle minimumdoelen van de richting (N)";
   - "Een leerplan dat al op dit toestel staat".
   
   Daaronder de link "Liever per doel kiezen? Stel je doelenlijst samen". Die gaat naar `/leerplannen/samenstellen?richting=…&jaar=…&soort=…&sets=<aangevinkt>&zelf=<STEM-sets>`;
4. hoe beginnen: met een geraamte (standaard), met een lege cursus, of met AI.

Gedrag bij "Maak de cursus":
1. De gekozen kadersets worden geladen (`useSetBestanden`, cache van 40).
2. `naarSetKeuzes` en dan `vindLeerplanMetSelectie`. Is er niets bruikbaars, dan `leerplanVoorRichting`. Is het resultaat niet bevestigd, dan wordt er niets bewaard, met de callout uit § 14.4.
3. `saveCurriculum`. Bij `false` meldt de opslaglaag het en blijft het venster open.
4. Met AI: `setHandoff({ source: '', title, curriculumId, goalCodes, doelgroep })`, dan `navigate('/cursussen?ai=nieuw')`. CoursesPage vult "Vak / onderwerp" en "Doelgroep" vooraf in (nieuwe props `initialSubject` en `initialAudience` op CourseAIModal), en `onResult` bewaart met `doelgroep`. Zonder sleutel (`hasAIKey()` false) staat die keuze op `aria-disabled`, met uitleg.
5. Anders `cursusVoorRichting` en `saveCourse`. Bij `false` wordt een leerplan dat net nieuw gemaakt werd weer gewist (`deleteCurriculum`) en blijft het venster open.
6. Toast, en `navigate('/cursus/bewerk/<id>')`.

## 13. Dekking

### 13.1 `src/lib/dekkingMinimumdoelen.ts` (nieuw, L6)

```ts
export interface KaderDoel { set: string; setNaam: string; id: string; code: string; tekst: string; rubriek?: string;
  optioneel: boolean; verplichteSet: boolean }
export function kaderDoelen(kader: RichtingKader, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): KaderDoel[];
export function setsAlsKader(sets: readonly string[], bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): KaderDoel[]; // per cursus zonder richting
export type MdStatus = 'gedekt' | 'gepland' | 'verdieping' | 'open';
export interface MdVia { courseId: string; courseTitle: string; code: string; status: Exclude<MdStatus, 'open'> }
export interface MdRij { doel: KaderDoel; status: MdStatus; via: MdVia[] }
export type NietMeeReden = 'geen-leerplan' | 'leerplan-ontbreekt' | 'geen-verwijzingen';
export interface CursusBijdrage { course: Course; leerplan?: Curriculum }   // leerplan leeg = niet op dit toestel
export interface CursusInDekking { courseId: string; titel: string; telt: boolean; reden?: NietMeeReden;
  draagtBij: number; buitenKader: number }
export interface MdDekking {
  rijen: MdRij[];
  perSet: { set: string; setNaam: string; totaal: number; gedekt: number; gepland: number; verdieping: number }[];
  totaal: number; gedekt: number; gepland: number; verdieping: number; open: number; percent: number;
  optioneel: { totaal: number; gedekt: number };
  cursussen: CursusInDekking[];
  zelfdeNummerAndereSet: number;
  samenvatting: string;
}
export function dekkingMinimumdoelen(kader: readonly KaderDoel[], bijdragen: readonly CursusBijdrage[], widgets: readonly Widget[]): MdDekking;
export function cursussenVoorRichting(courses: readonly Course[], curricula: readonly Curriculum[],
  hoort: (d: Doelgroep) => boolean, jaar?: number): CursusBijdrage[];
//   hoort = zelfde kaderGroepSleutel; jaar: de cursus heeft dat jaar of geen jaar
```

In `src/lib/coverage.ts` komen er **alleen nieuwe exports** bij. `computeCoverage` verandert niet:

```ts
export function sectieHeeftInhoud(section: CourseSection): boolean;  // minstens één blok dat geen callout met kind 'goal' is
export function geplandeRijen(result: CoverageResult, course: Course, widgets?: readonly Widget[]): CoverageRow[];
//   rijen met status 'covered' waarvan elke gewone sectie die de code draagt leeg is (sectieHeeftInhoud) en geen oefening ze draagt
```

### 13.2 Regels

1. **Telt een cursus niet mee?** Zonder `curriculumId` is de reden `geen-leerplan`. Staat het leerplan niet op dit toestel: `leerplan-ontbreekt`. Heeft geen enkel doel `refs`: `geen-verwijzingen`.
2. Per cursus draait `computeCoverage(course, leerplan, widgets)`, ongewijzigd, met altijd het leerplan van de cursus zelf.
3. Status per rij:
   - status `covered` met inhoud (een gewone sectie met `sectieHeeftInhoud`, of een oefening in een gewone sectie) → `gedekt`;
   - status `covered` zonder inhoud → `gepland`;
   - status `optional` → `verdieping`.
4. Voor elke `ref` in `row.goal.refs` met sleutel `set|id`:
   - staat de ref in het kader, dan levert ze een `MdVia` op;
   - anders telt ze in `buitenKader`, en bestaat hetzelfde nummer in een andere kaderset, ook in `zelfdeNummerAndereSet`.
   
   De vergelijking is **strikt op set + vast nummer**, de afspraak van het project (open vraag O6).

   `zelfdeNummerAndereSet` telt **doelen** (P11): verplichte kaderdoelen die nu niet gedekt zijn en die een meetellende cursus behandelt via een leerplandoel met een verwijzing buiten het kader maar met hetzelfde vaste nummer (een andere versie of de BuSO-kopie). Elk doel telt één keer.
5. Over cursussen heen: gedekt > gepland > verdieping > open.
6. `totaal` en `percent` gaan alleen over de verplichte doelen (niet `isOptioneel`, en geen uitbreidingsset). Optionele doelen hebben hun eigen teller. `percent = Math.round(gedekt / totaal × 100)`, 0 bij een leeg kader, en **99 in plaats van 100** zolang er een verplicht doel niet gedekt is (gepland, verdieping of open); optionele doelen spelen voor die grens geen rol (P11).
7. De dekking volgt de verwijzingen van het leerplan. Een doel van een netleerplan met twee refs dekt dus twee minimumdoelen.
8. Lineair in het kader plus de refs. Puur: geen opslag en geen DOM.

### 13.3 Per cursus (cursuseditor)

- `GoalCoverage.tsx` krijgt de schakelaar "Leerplan" / "Minimumdoelen": twee knoppen met `aria-pressed`. Hij verschijnt alleen als het leerplan doelen met `refs` heeft.
  - Met een `doelgroep` is het kader dat van de richting.
  - Anders zijn het de sets van `leerplan.minimumdoelenSets` (`setsAlsKader`).
- De weergave "Minimumdoelen" is een **lui geladen** component `MinimumdoelenDekking.tsx`. Het chunk van CourseEditorPage weegt al 67,8 van 80 kB.
- De weergave "Leerplan" blijft dezelfde. Er komt één regel bij als `geplandeRijen` iets geeft (§ 14.5).
- Het percentage op de cursuskaart blijft dat van het leerplan.

### 13.4 Over alle cursussen van een richting

- Het gaat over alle cursussen met dezelfde `kaderGroepSleutel`. In de 1ste graad tellen 1A en 2A dus samen, en in de andere graden de jaren van de graad.
- Er is een filter "Tel mee": alle jaren van de graad, of alleen het gekozen jaar.
- Het scherm toont een samenvatting, een lijst per set, de doelen die nog niet gedekt zijn, per doel de cursussen die eraan werken, en de cursussen die niet meetellen, met de reden.
- Op 390 px zijn het kaarten en lijsten, geen brede tabel.

## 14. Schermen en teksten

### 14.1 Route, titel en bestanden

- In `App.tsx`: `const RichtingenPage = lazyRetry(() => import('./pages/RichtingenPage').then((m) => ({ default: m.RichtingenPage })), 'RichtingenPage');` en `{ path: '/cursussen/richtingen/:groep?', element: lz(<RichtingenPage />) }`. Eén route-object, ±0,4 kB.
- De querystring:
  - `jaar` (1 tot 7, past bij de groep);
  - `soort` (`so` | `buso`);
  - `variant` (een onderdeelnummer van de groep);
  - op de lijst `graad`, `finaliteit`, `zoek` en `meer`, met `replace: true`.
  
  Alles wordt gevalideerd; `groep` tegen `GROEP_NUMMER`. Een ongeldige waarde wordt stil genegeerd.
- `paginaTitel.ts`: `['/cursussen/richtingen', 'Studierichtingen']` komt vóór `['/cursussen', 'Cursussen']`.
- "Materiaal" is vanzelf actief (MATERIAL_PATHS). Een subscherm krijgt een terugknop (`btn btn-sm btn-quiet` met `BackIcon` boven `.page-head`).
- Het icoon: `RichtingIcon` = Lucide `Signpost`, in `src/components/icons.ts` en `docs/ontwerp/ICONEN.md`. Het hoort niet bij het leerlingpad, dus niet in `EAGER_ICON_NAMES`.
- Css: `src/styles/richtingen.css` (voorvoegsel `ri-`), `src/styles/richtingcursus.css` (`rc-`) en `src/styles/dekking.css` (`dk-`). Alleen tokens, en nooit witte tekst op `--brand`.

### 14.2 Lijst `/cursussen/richtingen`

- Terugknop "Cursussen".
- h1 **"Doelen en cursussen per studierichting"**.
- .sub: "Kies een studierichting en een jaar. Je ziet welke officiële minimumdoelen erbij horen, maakt er meteen een cursus mee en volgt wat je cursussen samen dekken."
- `details.callout.mat-details` met summary "Hoe werkt dit?":
  - "De studierichtingen komen uit de officiële matrix van het secundair onderwijs. Welke minimumdoelen bij een richting horen, komt uit de Onderwijsdoelen-API van de Vlaamse overheid. Boosterz haalt beide elke maand op en verzint geen koppelingen."
  - "De minimumdoelen gelden per graad, niet per jaar. Welke doelen je in welk jaar behandelt, staat in het leerplan van je net."
  - "Leerplannen van de netten levert Boosterz niet mee: ze zijn auteursrechtelijk beschermd. Je vindt ze op de site van je net en leest het leerplan van je school zelf in."
- Filters:
  - fieldset "Graad" met de radio's "Alle graden", "1ste graad", "2de graad" en "3de graad";
  - select "Finaliteit" (niet bij de 1ste graad): "Alle finaliteiten", "Doorstroomfinaliteit", "Dubbele finaliteit", "Arbeidsmarktfinaliteit";
  - veld "Zoek een richting", placeholder "bv. Humane wetenschappen";
  - vinkjes "Toon ook 7de jaren, aanloopjaren en buitengewoon secundair onderwijs" en "Toon ook afgebouwde richtingen".
- Teller (`aria-live="polite"`): "1 richting", "42 richtingen", of "Geen richting gevonden. Pas de filters aan."
- De lijst per graad met een h2 ("1ste graad", "2de graad", "3de graad", "Andere"), 60 per keer, en de knop "Toon meer".
  - Elke regel is een link met de titel, de kenmerken (`kenmerkenVan`) en de badges "Duaal mogelijk" en "Afgebouwd", in tekst en niet alleen in kleur.
- Bron: "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen), opgehaald op <datum>."
- Laden: `LaadBericht` "De studierichtingen worden geladen…". Fout: `FoutBericht` met `FOUT_STUDIERICHTINGEN` en "Opnieuw proberen".
- Nog geen data: een callout met "De lijst van de studierichtingen staat nog niet in Boosterz. Ze wordt elke maand opgehaald bij de Vlaamse overheid. Intussen kan je doelen kiezen met ‘Zelf doelen samenstellen’." en een link.

### 14.3 Een richting `/cursussen/richtingen/G-0193?jaar=4`

**Kop**
- Terugknop "Alle richtingen".
- h1: de titel van de richting.
- .sub: de kenmerken, bv. "2de graad · Doorstroomfinaliteit · aso · Domeinoverschrijdend".
- Dezelfde naam in een andere graad: "Deze richting bestaat ook in de 3de graad: <link>."
- Afgebouwd: `callout warn` met "Deze richting is afgebouwd sinds <datum>." en "Opvolger: <link>".
- Niet meer in de bron: "Deze richting staat sinds <datum> niet meer in de officiële matrix."
- fieldset "Voor welk jaar?" met de radio's per jaar ("3de jaar", "4de jaar") en "Beide jaren (de hele graad)". Hint: "De minimumdoelen gelden voor de hele graad. Het jaar bepaalt voor welke cursussen je werkt en wat de dekking telt." In de 1ste graad staat er geen keuze: het jaar volgt uit de groep.
- fieldset "Soort onderwijs" (alleen als `kanBuso`): "Gewoon secundair onderwijs" / "Buitengewoon secundair onderwijs, opleidingsvorm 4".
- select "Variant" (alleen bij meer dan één geldig onderdeel, bv. de basisopties van "Tweede leerjaar A").
- Onbekend groepnummer: h1 "Studierichting niet gevonden", de tekst "Deze studierichting bestaat niet (meer) in de matrix." en de link "Alle richtingen".

**h2 "De officiële minimumdoelen"**
- "Voor deze richting gelden <N> minimumdoelen uit <S> sets."
- Herkomst:
  - `api`: "Welke doelen bij deze richting horen, komt uit de Onderwijsdoelen-API van de Vlaamse overheid (opgehaald op <datum>)."
  - `graad-en-stroom`: "In de 1ste graad koppelt de officiële bron de doelen niet per richting of basisoptie, maar per stroom. Hier staan alle sets van de 1ste graad A-stroom die nu gelden."
  - `geen`: "De officiële bron koppelt geen minimumdoelen aan deze richting. Kies zelf sets bij ‘Zelf doelen samenstellen’." Met een laatst bekende koppeling: "De officiële bron koppelt sinds <datum> geen minimumdoelen meer aan deze richting. Hieronder staat de laatst bekende koppeling (opgehaald op <datum>)."
  - `nog-niet-opgehaald`: "De doelen van deze richting zijn nog niet opgehaald."
- h3 "Een deel van een set, voor deze richting". Hint: "Van deze sets koppelt de bron alleen de doelen die bij deze richting horen, bv. de cesuurdoelen of de specifieke eindtermen van je richting." Elke regel: "<korte naam> · 4 van 13 doelen", met de link "Bekijk de set".
- h3 "Hele sets". Hint: "Van deze sets horen alle doelen bij deze richting." Elke regel: "<korte naam> · 16 doelen". Bij een uitbreidingsset staat er "(uitbreidingsdoelen: mag, moet niet)".
- Een ander versiemerk: "<n> doelen uit de koppeling staan niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt."
- `details` "Niet voor dit jaar (<n> sets)".
- "Niet getoond: <x> oudere versies en <y> sets van het buitengewoon secundair onderwijs." (alleen bij een aantal groter dan 0)
- Knoppen:
  - primair **"Maak een cursus voor deze richting"**: staat altijd aan, ook zonder verplichte sets (herkomst `geen`); het venster van § 14.4 toont dan zelf wat er kan (een leerplan op dit toestel, inlezen, zelf samenstellen);
  - **"Bewaar als leerplan"** (alle doelen van de richting, `volgtKader`), of "Open het leerplan" als het al bestaat; zonder verplichte sets staat de knop op `aria-disabled` met uitleg. Na het bewaren gaat de focus naar "Open het leerplan";
  - link **"Kies zelf doelen"** naar `/leerplannen/samenstellen?richting=G-0193&jaar=4&soort=so`.
- Toast: "Leerplan bewaard en nagekeken." Lukt het nakijken niet: `callout err` met "Het leerplan kon niet als nagekeken bewaard worden: <eerste waarschuwing>. Kies zelf doelen, dan zie je wat er misloopt."

**h2 "Leerplannen"**
- h3 "Leerplannen van deze richting op dit toestel": "<titel> · Nagekeken · 229 doelen", met "Open". Het leerplan waar "Open het leerplan" naar wijst, staat er altijd bij, ook zonder doelgroep (knop en lijst zeggen hetzelfde). Leeg: "Nog geen leerplan van deze richting op dit toestel."
- Veranderd: `callout warn` met "De officiële koppeling van deze richting is veranderd sinds je ‘<titel>’ maakte: <n> doelen nieuw, <m> vervallen." en de knop "Werk het leerplan bij" of "Kies de doelen opnieuw" (§ 11.2). Toast: "Leerplan bijgewerkt. De doelcodes in je cursussen blijven dezelfde."
- h3 "Leerplan van je net": "Boosterz levert de leerplannen van de netten niet mee: ze zijn auteursrechtelijk beschermd. Haal het leerplan van je school bij je net en lees het in. De verwijzingen naar de minimumdoelen worden dan nagekeken, en het leerplan telt mee in de dekking."
  - `NettenLinks`.
  - "Op dit toestel: <titel> · verwijst naar 42 doelen van deze richting". Leeg: "Nog geen leerplan van een net op dit toestel dat naar doelen van deze richting verwijst."
  - Knop "Leerplan inlezen voor deze richting".

**h2 "Cursussen voor deze richting"**
- Elke regel: "<titel>" (een link naar de editor), met "4de jaar · Biologie · Leerplan: <titel>". In fase C komt er "Telt mee voor 16 doelen" of de reden bij (§ 14.3, dekking).
- Leeg: "Nog geen cursussen voor deze richting."
- Knop "Koppel een bestaande cursus": een venster met de h2 "Bestaande cursus koppelen".
  - Een lijst met keuzerondjes van de cursussen zonder richting, gesorteerd op "raakt <n> doelen van deze richting".
  - De select "Jaar".
  - De knop "Koppel". Het bewaren gebeurt met `saveCourseGuarded(course, course.updatedAt)`. Bij "gewijzigd": "Deze cursus werd intussen elders aangepast. Probeer opnieuw." Toast: "Cursus gekoppeld aan <richting>."
  - Leeg: "Er zijn geen cursussen zonder richting."
- Per cursus de knop "Haal weg uit deze richting", maar alleen als het wegnemen echt werkt: de cursus heeft een eigen doelgroep bij deze richting en haar leerplan hoort niet bij dezelfde richting. Hoort ze bij de richting via haar leerplan, dan staat er "Hoort bij deze richting via het leerplan ‘<titel>’." Toast: "‘<cursus>’ hoort niet meer bij deze richting." Na "Haal weg" en "Werk het leerplan bij" gaat de focus naar de kop van de sectie.
- Een cursus waarvan het leerplan ontbreekt (bv. gedeeld vanaf een ander toestel) krijgt de knop "Koppel aan het leerplan van deze richting". Die zoekt of maakt het leerplan van de richting en geeft `passendeCodes`. Passen niet alle codes, dan volgt eerst de vraag: "<x> van de <y> doelcodes van deze cursus staan niet in dat leerplan. Toch koppelen?"

**h2 "Wat je cursussen samen dekken"** (fase C)
- fieldset "Tel mee": "Alle jaren van de graad" / "Alleen het <jaar>".
- Samenvatting (`aria-live="polite"`): "Je cursussen dekken <c> van de <N> minimumdoelen (<p> %)." en "<g> doelen staan al gepland op een sectie die nog leeg is, <v> komen alleen in verdieping aan bod, <o> nog niet."
- Zonder cursussen: "Nog geen cursus voor deze richting: de dekking is 0 van de <N> doelen."
- 1ste graad: "In de 1ste graad tellen de cursussen van het 1ste en het 2de jaar samen: de minimumdoelen gelden voor de hele graad."
- Optioneel: "Daarnaast zijn er <k> optionele doelen en uitbreidingsdoelen. Die tellen niet mee in het percentage (<j> gedekt)."
- Per set: `details` met de summary "<korte naam>: 6 van 8 gedekt". Daarin per doel de code, de korte tekst en de status (icoon én tekst):
  - "Gedekt in ‘<cursus>’";
  - "Gepland in ‘<cursus>’ (de sectie is nog leeg)";
  - "Alleen in verdieping (‘<cursus>’)";
  - "Nog niet gedekt".
- Radio "Toon": "Alle doelen" / "Nog niet gedekt".
- Bij de cursussen:
  - "Telt niet mee: deze cursus hangt aan geen leerplan. Kies er een in de instellingen van de cursus."
  - "Telt niet mee: het leerplan van deze cursus staat niet op dit toestel."
  - "Telt niet mee: het leerplan ‘<titel>’ verwijst niet naar minimumdoelen."
  - "<k> verwijzingen van deze cursus horen niet bij deze richting, of wijzen naar een andere versie van een set."
- Als `zelfdeNummerAndereSet > 0`: "<n> doelen zouden ook meetellen als verwijzingen naar een andere versie of soort van dezelfde set meetellen."

### 14.4 Venster "Nieuwe cursus" (`NieuweRichtingCursus.tsx`)

- Modal-titel (h2): "Nieuwe cursus voor <titel> · <jaar of graad>".
- Intro: "Kies welke doelen deze cursus behandelt. Boosterz maakt een nagekeken leerplan met precies die doelen en een cursus die eraan hangt. Een AI-sleutel heb je niet nodig."
- Field "Titel van de cursus", met het voorstel `voorstelCursusTitel`.
- Field "Je vak (mag leeg blijven)", placeholder "bv. Biologie". Hint: "Boosterz vinkt de sets aan die bij dat vak passen. Dat is een hulp bij het kiezen, geen officiële koppeling."
- Voorstel (`aria-live`): "Voorgesteld bij ‘Biologie’: Biologie." Of: "Geen set gevonden bij ‘Muziek’. Kies zelf hieronder."
- fieldset "Welke doelen behandelt deze cursus?":
  - "Kies de sets voor deze cursus" (standaard). Daaronder vakjes in twee groepen met een h3, zoals op het detail: "<korte naam> · 4 doelen" / "· 16 doelen";
  - een STEM-set uit `stemSets`: een callout met "De set ‘<korte naam>’ bundelt wiskunde, natuurwetenschappen en techniek. De overheid zegt niet welke van die doelen bij <vak> horen. Neem de hele set, of kies de doelen zelf." De set staat niet aangevinkt, en er is een link "Kies de doelen zelf";
  - "Alle minimumdoelen van de richting (<N>)";
  - "Een leerplan dat al op dit toestel staat", met een select "Leerplan" (`leerplannenBijRichting`);
  - de link "Liever per doel kiezen? Stel je doelenlijst samen.";
  - een teller (`aria-live`): "Je koos 2 sets met samen 20 doelen."
- fieldset "Hoe begin je?":
  - "Met een geraamte" (standaard). Hint: "Een hoofdstuk per set en een sectie per rubriek, met de doelcodes al op de secties. Zolang een sectie leeg is, telt ze als ‘gepland’, nog niet als gedekt."
  - "Met een lege cursus". Hint: "Je zet de doelcodes zelf op je secties."
  - "Laat de AI een eerste versie maken". Zonder sleutel `aria-disabled`, met "Daarvoor heb je een eigen AI-sleutel nodig (AI-instellingen). Zonder sleutel werkt al de rest."
- Knoppen **"Maak de cursus"** (primair) en "Annuleren". Wat ontbreekt, via `zegOntbreekt`: "Nog nodig: een titel, minstens één set."
- Laden: `LaadBericht` "De sets worden geladen…".
- Toast:
  - "Cursus gemaakt: <h> hoofdstukken, <n> doelcodes klaar op de secties." (geraamte);
  - "Cursus gemaakt met <n> doelen van <richting>." (leeg).
- Niet nagekeken: dezelfde `callout err` als in § 14.3.
- Een bevestigd leerplan met doelen uit de koppeling die niet meer in de set staan: de toast krijgt erbij "<n> doelen uit de koppeling staan niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt."
- "Nog nodig:" alleen met zaken (titel, set, leerplan). Laden en fouten krijgen een eigen zin: "De sets worden nog geladen." en "Een set kon niet geladen worden. Probeer opnieuw."
- Twee sets met dezelfde korte naam: de voorstelzin noemt de naam één keer; het vakje krijgt een zichtbaar achtervoegsel dat ze onderscheidt (`setLabels`: " (een deel van de set)" of " (de volledige set)", anders de soort doelen zoals " (Eindtermen basisgeletterdheid)", anders graad en stroom, anders een volgnummer). Het STEM-kader hangt met `aria-describedby` aan zijn vakje.
- De links naar de samenstelwizard ("Liever per doel kiezen?", "Kies de doelen zelf", "Kies zelf doelen") geven altijd `sets=` mee, ook leeg: zonder `sets` vinkt de wizard alle verplichte sets aan, en dat is niet de standaard (B10). Alleen bij "Alle minimumdoelen van de richting" valt `sets` weg.
- Richting zonder minimumdoelen (herkomst `geen`): het venster gaat toch open. Geen graaduitleg, "Alle minimumdoelen" is niet te kiezen, en er staat "Een leerplan dat al op dit toestel staat" als `leerplannenBijRichting` iets geeft, anders "Voor deze richting geeft de officiële bron geen minimumdoelen. Lees het leerplan van je net in of stel zelf een doelenlijst samen." met links naar inlezen (met de richting) en samenstellen.
- Richtingkiezer: dezelfde richting bevestigen zonder iets te wijzigen geeft de doelgroep onveranderd terug (onderdeel en vak blijven). Na het laden staat de focus in het zoekveld, en de huidige richting staat aangevinkt in de lijst.

### 14.5 Cursuseditor, cursuslijst en GoalCoverage

- `CourseSettingsModal`:
  - Field "Studierichting", hint "Zo telt de cursus mee in de dekking per studierichting.";
  - waarde: `doelgroepTekst` of "Nog geen studierichting gekozen.";
  - knoppen "Kies een richting" (of "Wijzig") en "Geen richting".
  - "Kies een richting" opent het **lui geladen** `RichtingKiezerModal`, met de h2 "Studierichting van deze cursus". Daarin:
    - fieldset "Graad";
    - het veld "Zoek een richting";
    - keuzerondjes (hoogstens 30, met "Toon meer");
    - fieldset "Jaar";
    - het vinkje "Buitengewoon secundair onderwijs, opleidingsvorm 4" (alleen als dat kan);
    - de knoppen "Kies deze richting" en "Annuleren".
- `GoalCoverage`:
  - de schakelaar "Leerplan" / "Minimumdoelen" (§ 13.3);
  - de samenvatting "Deze cursus dekt <c> van de <N> minimumdoelen van <richting> (<graad>)." of "… van de sets van je leerplan.";
  - in de weergave "Leerplan" een regel: "<n> doelen staan alleen op secties die nog leeg zijn: die zijn gepland, nog niet uitgewerkt.";
  - met een doelgroep de link "Bekijk wat al je cursussen voor <richting> samen dekken", naar `/cursussen/richtingen/<G>?jaar=<j>`.
- Cursuskaart (CoursesPage): onder de titel een kleine regel met `doelgroepTekst`. Het percentage blijft dat van het leerplan.

### 14.6 Samenstellen en inlezen met een richting

**SamenstellenPage**
- Het kopcommentaar krijgt erbij:
  - `?richting=G-…&jaar=…&soort=…[&sets=…][&zelf=…]`: begint bij stap 2 met de koppeling, eventueel beperkt tot `sets`; sets in `zelf` staan gekozen met niets aangevinkt;
  - `/:curriculumId?richting=…`: de bewaarde keuze zonder de vervallen doelen.
- De remount-key bevat `richting`, `jaar`, `soort` en `zelf`.
- `beginKeuze` krijgt een kader erbij, met `beginUitKeuze(selectie)`. `beginUitKeuze` is **nieuw** in samenstelKeuze.ts, met `Map<set, 'alle' | ids>`; een lege lijst betekent "gekozen, niets aangevinkt".
- Het titelvoorstel komt uit `titelVoorRichtingLeerplan`, en `leerplanUitSelectie` krijgt `doelgroep`.
- Een callout boven de stappen: "Je begint met de doelen die de officiële bron aan de studierichting <titel> (<graad>) koppelt. Vink uit wat je niet nodig hebt."
- Een onbekende of ongeldige richting: `callout warn` met "Deze link noemt een studierichting die Boosterz niet (meer) kent. Je begint met een lege keuze."
- Na het bewaren met een richting: `navigate('/cursussen/richtingen/<G>?jaar=…&soort=…')` en de toast "Leerplan bewaard en nagekeken. Maak er nu een cursus mee."
- Zonder `?richting` blijft alles letterlijk zoals nu (rooktest 20b-3).

**LeerplanInlezenPage**
- `?richting=…&jaar=…&soort=…` vult de keuze vooraf in.
- Een callout: "Je leest een leerplan in voor <titel> (<graad>). Boosterz toont de sets van die richting; andere sets zoek je zelf."
- `bouwOntwerp` krijgt `doelgroep` (via een prop `doelgroep` op `StapNakijken`).
- Een ongeldig jaar of soort in de link wordt genegeerd en gemeld: "Het jaar in de link is niet bruikbaar en werd genegeerd." / "Het soort onderwijs in de link is niet bekend; Boosterz gebruikt gewoon secundair onderwijs."
- "Verder zonder studierichting" zet de focus op de kop van de stap.

**LeerplanOpSlot**
- Het feit "Studierichting" met de waarde `doelgroepTekst` en een link naar de richting. Het staat er alleen als er een doelgroep is.

### 14.7 Ingangen (buiten de lijsten die de rooktest letterlijk controleert)

| Waar | Wat |
|---|---|
| CoursesPage, `page-head-actions`, na "Blanco vanuit leerplan" | `<Link to="/cursussen/richtingen" className="btn btn-ghost" title="Kies een richting en een jaar: de cursus hangt meteen aan de juiste doelen"><RichtingIcon size={18} /> Voor een studierichting</Link>` |
| CoursesPage, lege toestand | De eerste zin wordt "Er zijn vier manieren om te starten." Er komt een vierde kaart bij: "Voor een studierichting", "Kies je richting en je jaar. De cursus krijgt meteen de officiële minimumdoelen, ook zonder AI.", met de link "Richting kiezen". |
| Layout `NEW_ITEMS`, na "Cursus" | "Cursus voor een studierichting", hint "Met de officiële doelen van een richting en een jaar", naar `/cursussen/richtingen` |
| MinimumdoelenPage `.md-intro` | "Geef je les in een bepaalde studierichting? Bekijk welke doelen erbij horen bij <Link>Doelen per studierichting</Link>." |
| LeerplanWegwijzer, na `ul.lw-wegen` | `<p className="lw-richting">Geef je les in een bepaalde studierichting? Bekijk welke minimumdoelen erbij horen en maak er meteen een cursus mee bij <Link to="/cursussen/richtingen">Doelen per studierichting</Link>.</p>` Het aantal `.lw-weg` blijft 4, en `.lw-keuzehulp` en de knoppen op /leerplannen blijven ongewijzigd (smoke r. 538-541 en 745-747). |

### 14.8 Hulp (`HelpPage.tsx`, FAQ)

- "Hoe maak ik een cursus voor een studierichting en een jaar?" — "Ga naar Cursussen en kies ‘Voor een studierichting’. Kies de graad, de richting en het jaar: je ziet welke officiële minimumdoelen erbij horen. Met ‘Maak een cursus voor deze richting’ kies je de sets van je vak. Boosterz maakt dan een nagekeken leerplan en een cursus met de doelcodes al op de secties. Een AI-sleutel heb je daarvoor niet nodig."
- "Zie ik wat al mijn cursussen voor een richting samen dekken?" — "Ja. Onderaan de pagina van een studierichting zie je per minimumdoel welke cursus het dekt, wat al gepland staat en wat nog ontbreekt. Een cursus telt mee als je er een richting aan koppelt en als zijn leerplan naar de minimumdoelen verwijst."

### 14.9 Tekstbank: eerlijke uitleg waar de bron grof is

- Per graad: "De minimumdoelen gelden voor de hele graad. In welk jaar je een doel behandelt, staat in het leerplan van je net, niet in de officiële bron."
- 1ste graad: "In de 1ste graad koppelt de officiële bron de doelen niet per richting of basisoptie, maar per stroom."
- STEM: "De overheid zegt niet welke van die doelen bij <vak> horen."
- Arbeidsmarktfinaliteit, als er geen deelsets zijn: "Voor deze richting koppelt de officiële bron alleen hele sets. De beroepsgerichte doelen staan in het leerplan van je net."
- Vakvoorstel: "Dat is een hulp bij het kiezen, geen officiële koppeling."
- Netten: "Boosterz levert de leerplannen van de netten niet mee: ze zijn auteursrechtelijk beschermd."

Op het scherm staan nooit een groepnummer, een set-id, "structuuronderdeel" of "Hele set" voor een deelset. Het groepnummer staat alleen in de bronvermelding onderaan het detail, als "nummer in de matrix: G-0193".

Doelcodes: botst een code tussen gekozen sets en onderscheiden stroom en graad ze niet, dan krijgt ze de korte naam van haar set erbij, ingekort op een woordgrens tot 16 tekens, of tot 30 als dat niet onderscheidt (bv. "0000 (DUURZAAMHEID)" en "0000 (JURIDISCHE)"; `onderscheidVoor` en `naamAlsOnderscheid` in doelenSamenstellen.ts, herstel oktober 2026). Het set-id blijft alleen de laatste terugval, als de korte namen de sets niet onderscheiden: dezelfde korte naam (bv. dezelfde competentie in twee finaliteiten van dezelfde graad), namen die pas na 30 tekens verschillen, of een set zonder naam.

In de bestaande wizards (samenstellen en inlezen) geldt dat zolang er een richting in de link staat: `StapDoelen`, `StapSets` en `StapKoppelen` krijgen dan `verbergSetId` (geen set-id in de meta, op de setrijen of in de zoekhints; zoeken op nummer blijft werken). Zonder richting blijven ze zoals ze waren. De keuzeknop "Hele set" in Samenstellen blijft: hij is een bewuste klik en staat alleen aan als echt alle doelen van de set gekozen zijn. Waarschuwingen uit de bibliotheek gaan eerst door een filter dat set-ids weghaalt.

## 15. Bundel, opslag en toegankelijkheid

**Bundel**
- Het kritieke pad groeit alleen met de route (±0,4 kB), van 332,7 naar ±333,1 kB. De hoofdsessie meet dat en zet `CRITICAL_PATH.maxKb` bewust op de meting + 0,5 (verwacht 333,5), met een geschiedenisregel in vite.config.ts.
- Al de rest is lui:
  - het chunk `RichtingenPage` blijft onder 80 kB;
  - `RichtingKiezerModal` en `MinimumdoelenDekking` zijn eigen luie imports, zodat CourseEditorPage (67,8 kB) onder 80 kB blijft;
  - `widget-icons` krijgt +0,4 kB (67,5 van 80 kB).
- De data in `public/` telt niet mee.

**Opslag**
- Een leerplan van een hele richting: ±240 doelen × ±310 bytes, dus ±75 kB in `wf.curricula.v1`. Een leerplan per vak is kleiner.
- Hergebruik (`vindLeerplanMetSelectie`) voorkomt dubbels.
- `saveCurriculum` en `saveCourse` geven `false` bij een volle opslag. Het scherm zegt dan nooit "bewaard", en een leerplan dat net nieuw gemaakt werd, wordt teruggedraaid.
- Matrix en koppeling komen nooit in localStorage. In het geheugen zitten de matrix (één gedeelde belofte), de koppeling (cache van 20) en `laadSet` (40; een kader telt hoogstens ±26 sets).

**Toegankelijkheid**
- Geen eigen `main` en één h1 per scherm. Koppen in vensters zijn h2.
- Radio's staan in fieldsets met een legend. Tellers en samenvattingen staan in `aria-live`.
- Een status nooit alleen met kleur.
- Knoppen die nog niet kunnen: `aria-disabled` met "Nog nodig: …".
- 44 px tikdoelen op ≤ 640 px, zoals in inlezen.css.
- Op 390 px niets horizontaal scrollen: lijsten in één kolom, lange namen breken af.
- Links naar buiten krijgen `target=_blank`, `rel noopener` en een sr-only "(opent in een nieuw tabblad)".

## 16. Tests

| Bestand | Wat | Pakket |
|---|---|---|
| `src/lib/studierichtingen.test.ts` | `normaliseerGroep`: Toerisme met 3 domeinen, G-0001 met een duale variant, BuSO zonder graad, 7de jaar, leerjaren met einddatum, tekst- en objectvelden, een lijst met één element, onbekend veld → `extra`, `api_url` valt weg, `__proto__`, nummer "505" en "abc", dubbel onderdeel. `lijstVanPagina` (onder elke sleutel; twee lijsten → fout; geen lijst → fout), `volgendeLink` (spatie → %20), `totaalVanPagina`, `onderwijssoortVanRecord`, `stroomVanEersteGraad`, `soortVanGroep`, `jaarVan` (1–7), `isAfgebouwd`, `groepnummersVanDoel` (vorm van ODS_3116), `kruiscontrole`, de drie validators (≥ 3 positieve en ≥ 6 negatieve gevallen elk). **Laadbaar in Node:** `node --input-type=module -e "await import('./src/lib/studierichtingen.ts')"`. | P1 |
| `src/lib/studierichtingen.script.test.ts` | Het script met `--bron-*` en met een nagebootste http-API (`node:http`, `ONDERWIJSDOELEN_API_BASE`, `STRUCTUURONDERDELEN_API_BASE`, `ONDERWIJSDOELEN_WACHT_FACTOR=0`), en 2 of 3 nagebootste setbestanden met een index in een tijdelijke `--minimumdoelen`. Gevallen: exit 0 en de bestanden zoals in § 3; een tweede run raakt niets aan (bytes en mtime); de uitvoer hangt niet af van de invoervolgorde; paginering met een spatie; andere origin → 1; doorverwijzing → 1 zonder tweede verzoek; 401 → 1; onvolledig → 1; totaal ontbreekt → 3; lijstpad onduidelijk → 3; dubbel → 3; filter genegeerd → 3; set onbekend → 3; nummer onbekend → 3; graadconflict → 3; twee soorten in één set → 3; massaverlies → 3; ordeningskadergroep zonder koppeling → 3; 404 één keer en daarna 200 → gekoppeld; twee keer 404 → "geen", en een bestaand bestand blijft met `nietMeerInBron`; 1ste graad → `graad-en-stroom`, en bij 200 → `api` met een melding; verdwenen groep → `nietMeerInBron`; `--alleen matrix` werkt de index bij zonder verzoeken; `--groepen` raakt de andere bestanden niet aan; de nepsleutel `test-sleutel-1234` staat nergens in stdout, stderr, het rapport of de bestanden; tests schrijven alleen in een tijdelijke map (`eisRapport`). En: opnieuw draaien op `tests/fixtures/structuur/api` geeft byte voor byte `uit/` (`it.runIf` als alle versiemerken kloppen). | P2 |
| `src/lib/studierichtingen.data.test.ts` | M1–M7, I1–I5, F1–F6 op de echte data (`runIf`) en op de fixtures; de zelftest met ≥ 8 kapotte kopieën; F7 komt erbij in G1. | P3 |
| `src/lib/doelgroep.test.ts` | Geldig en ongeldig, `__proto__`, te lange titel, jaar 0, 8, 2.5 en buiten de graad, `vak` > 80, `kader` geen hex, idempotent; `jaarTekst`, `graadTekst`, `doelgroepTekst`, `zelfdeRichting`. | P5 |
| `courses.test.ts`, `courses.gedeeld.test.ts`, `aiCourse.test.ts`, `curriculum.test.ts`, `doelenSamenstellen.test.ts`, `leerplanInlezen.test.ts` (uitbreiding) | De doelgroep overleeft `sanitizeCourse`, de deellink (encode/decode, v blijft 1), het cursusbestand, het klaspakket en `comparable`. Een doelgroep uit de AI wordt genegeerd en die van `base` blijft. De vingerafdruk verandert niet en "nagekeken" blijft. Export en import v2. `leerplanUitSelectie` met en zonder `bestaand`. `bouwOntwerp`. Bestanden zonder doelgroep blijven ongewijzigd (examples.test.ts groen). | P5 |
| `src/lib/richtingKader.test.ts` | R1–R7 met fixtures: oude versie verborgen, BuSO verborgen bij `so` en omgekeerd (via `onderwijssoort` en via de naam), `ov4`, jaar 5/6/7 en "3de leerjaar", volledig tegenover deel, versie gelijk en anders, onbekende set, uitbreidingsset niet verplicht; `selectieVanKader` en `naarSetKeuzes` (een deelset blijft een lijst, ontbrekend); `kaderVingerafdruk` stabiel en onafhankelijk van de volgorde; `filterRichtingen` (graad, finaliteit, zoeken zonder accenten, afgebouwd, ookMeer); `richtingInfo` (jaren, opvolgers, zelfdeNaam); `kaderGroepSleutel` (1A = 2A). Op `tests/fixtures/structuur/uit`: G-0193, G-0307, G-0002. **runIf echte data:** voor elke gekoppelde groep en elk jaar ≤ 50 sets en ≤ 5000 doelen. | P6 |
| `src/lib/studierichtingenBron.test.ts` | Een nagebootste `fetch`, zoals minimumdoelenBron.test.ts: 404 → `FOUT_NOG_NIET_OPGEHAALD`; een ongeldig groepnummer geeft geen verzoek; een bestand met een andere groep → fout; de gedeelde belofte kan na een fout opnieuw; cache van 20. | P6 |
| `setKeuze.test.ts`, `samenstelKeuze.test.ts` (uitbreiding) | `setNoemtVak`; `kandidaatSets` met `richtingSets` (kadersets eerst, beperkt); `beginUitKeuze`; **regressie van de valkuil** (§ 9.5). | P6 |
| `src/lib/richtingCursus.test.ts` | Geraamte: elke code precies één keer in een niet-optionele sectie, volgorde, rubrieken, terugval "Doelen", grens van 400, netleerplan op thema; `cursusVoorRichting` (doelgroep zonder `kader`, curriculumId, subtitle, leeg); `sanitizeCourse(geraamte)` laat alles staan; titels ≤ 120; `vindLeerplanMetSelectie` (exact, geen eigen kopie); `vakVoorstel('Biologie')` (Biologie in `sets`, STEM in `stemSets`); `leerplannenBijRichting` (overlap, doelgroep); `vergelijkMetKader`; `passendeCodes`. **runIf echte sets:** `leerplanVoorRichting` op het kader van G-0193 (fixture) is `bevestigd`; een deelset geeft precies de 4 nummers, niet 13. | P7 |
| `src/lib/dekkingMinimumdoelen.test.ts` en `coverage.test.ts` (alleen nieuwe gevallen) | `sectieHeeftInhoud` en `geplandeRijen`; twee cursussen met verschillende leerplannen; gedekt, gepland, verdieping; een vers geraamte = 0 % gedekt en alles gepland; een netleerplan met 2 refs per doel; een cursus zonder leerplan, met een ontbrekend leerplan, of met een leerplan zonder refs; `buitenKader`; `zelfdeNummerAndereSet`; optionele doelen en uitbreidingssets buiten het percentage; `perSet`; `cursussenVoorRichting` (jaarfilter, 1A + 2A); samenvatting. Met de hand nagerekende aantallen. De bestaande gevallen in coverage.test.ts blijven ongewijzigd. | P11 |
| `paginaTitel.test.ts` | `/cursussen/richtingen` en `/cursussen/richtingen/G-0193` → "Studierichtingen". | P8 |
| `tests/ai/mock-cursus.mjs` | Een geval "vanuit een studierichting": overdracht met doelgroep, "Doelgroep" en "Vak / onderwerp" vooraf ingevuld, en het resultaat met `doelgroep`. | P9 |
| `tests/smoke.mjs` sectie **20d. Studierichtingen** (vlak vóór `// ── 21. Importeren`) | `page.route('**/leerplannen/structuur/**')` serveert `tests/fixtures/structuur/uit`. (1) Op /cursussen `a.btn[href="#/cursussen/richtingen"]` "Voor een studierichting". (2) Lijst: 1 main, 1 h1 "Doelen en cursussen per studierichting", titel "Studierichtingen · Boosterz", 390 px. (3) "2de graad" + zoeken "natuurwet" → link `#/cursussen/richtingen/G-0193`. (4) Detail: h1 "Natuurwetenschappen", /Voor deze richting gelden \d+ minimumdoelen uit \d+ sets\./, /komt uit de Onderwijsdoelen-API van de Vlaamse overheid/, /Biologie · \d+ van \d+ doelen/. (5) "4de jaar" → `?jaar=4`. (6) "Maak een cursus voor deze richting" → dialoog-h2 /Nieuwe cursus voor Natuurwetenschappen · 4de jaar/; vak "Biologie" → /Voorgesteld bij ‘Biologie’/ en Biologie aangevinkt; de AI-keuze `aria-disabled`; "Maak de cursus" → `/cursus/bewerk/`. In localStorage: `doelgroep` {groep G-0193, jaar 4, vak Biologie}, een leerplan met herkomst samengesteld en status gecontroleerd, en precies de deelset-nummers van Biologie (de valkuil); de secties hebben goalCodes. (7) Terug: de cursus staat onder "Cursussen voor deze richting", /Je cursussen dekken 0 van de \d+ minimumdoelen/ en /\d+ doelen staan al gepland/. (8) "Eerste leerjaar A" → de zin over de 1ste graad. (9) `#/cursussen/richtingen/G-9999` → "Deze studierichting bestaat niet (meer) in de matrix." (10) `#/leerplannen/samenstellen?richting=G-0193&jaar=4` → stap 2 met de callout. (11) Cursusinstellingen: "Studierichting" toont "Biologie · Natuurwetenschappen · 4de jaar". (12) 390 px op de lijst, het detail en het venster. (13) Geen console- of paginafouten. "Terug zoals het was". | P13 |
| `tests/smoke.mjs` sectie **20e** (na G1) | Dezelfde stroom op de echte data (G-0193 en G-0327), alleen met regex, `runIf` het echte bestand bestaat. | I4 |

## 17. Eerste echte run (regel 11), in stappen

De hoofdsessie start de workflow (workflow_dispatch). Na elke stap leest ze het rapport.
1. `onderdelen=studierichtingen`, `groepen=geen` (alleen de matrix). Bevestigen:
   - het lijstpad en 545 groepen;
   - de veldinventaris;
   - de vorm van `ov4_mogelijk` en van de historiek;
   - de verdeling per `GroepSoort`.
   De PR wordt nagekeken en gesloten.
2. `onderdelen=studierichtingen`, `groepen=G-0117,G-0327,G-0193,G-0307,G-0311,G-0223,G-0001,G-0008,G-0002,G-0009`. Bevestigen:
   - de body van een 404 (`voorbeeld404`), en of "twee keer 404 = geen doelen" geldt voor alle soorten;
   - of `onderwijssoort` er altijd staat en klopt met de naam;
   - de versiemerken;
   - wat het 7de jaar, BuSO en de groepen met alleen duale onderdelen geven;
   - of de 3de graad (jaar 5 en 6) sets "3de leerjaar" meekrijgt (R4);
   - de kruiscontrole.
   De PR wordt nagekeken en gesloten.
3. `onderdelen=alles`. Bevestigen: de looptijd, het aantal verzoeken, D6 en D8, en de aantallen per soort. De data-PR wordt nagekeken: een steekproef van 5 richtingen tegen onderwijsdoelen.be, de 1ste graad per stroom, de kruiscontrole. De PR wordt samengevoegd op teken van de eigenaar.
4. Daarna:
   - `KRUISCONTROLE_STRENG` en `ONDERWIJSSOORT_STRENG` op true als de tellingen 0 zijn;
   - F7 toevoegen;
   - R4 bevestigen of aanpassen;
   - `soortVanGroep` en de lijstfilters bijsturen;
   - `timeout-minutes` aanpassen aan de gemeten looptijd;
   - de stand van zaken bijwerken.

Een afwijking van de vorm wordt hersteld door een kernbouwer, als een kleine aanpassing van `studierichtingen.ts` of het script, met een test. Daarna start de stap opnieuw.

### 17.1 Wat de eerste echte run bevestigde (9 oktober 2026)

- **Stap 1, matrix** (run 37957531412, PR #4 gesloten): 28 pagina's, 545 groepen, 961 onderdelen; de validators geven geen fouten. Soorten: 260 gewoon, 219 zevende, 55 BuSO, 9 aanloop, 2 ander, precies zoals de verkenning. 674 onderdelen met `ov4`, 475 duaal, 128 met een einddatum, 125 met `vorige` en 124 met `volgende`. Het bestand is 1,37 MB (63 kB gzip), groter dan geschat omdat de omschrijvingen van hoofdstructuren, instellingstypes en stelsels bewaard blijven. Onbekende velden in `extra`: `aantal_semesters_7de_leerjaar` (332 onderdelen), `basisoptiecombinaties` (7) en bij de vier groepen van de 1ste graad een veld `stroom` {code A_STROOM|B_STROOM, omschrijving}: de officiële stroom, die de afleiding uit de titel bevestigt.
- **Stap 2, tien groepen** (run 37957872355, PR #5 gesloten): G-0001, G-0008, G-0117, G-0193, G-0223 en G-0327 gekoppeld via de API (500 tot 862 doelen, 62 tot 92 sets, telkens de helft BuSO-sets, alle versiemerken gelijk). G-0307 en G-0311 (1ste graad) volgens de regel graad en stroom (104 sets, A-stroom). G-0002 (7de jaar) en G-0009 (BuSO) geven twee keer 404: geen doelen. G-0223 (naam met een komma) werkt via het groepsnummer. Geen problemen en geen waarschuwingen; de kruiscontrole met het ordeningskader geeft 0 verschillen.
- **Kader van een richting** (actueel, gewoon secundair): G-0193 Natuurwetenschappen 23 sets en 171 doelen (16 hele sets, 7 deelsets, bv. Biologie 4 van 13, Chemie 9 van 25); G-0117 22 sets en 147 doelen; G-0327 24 sets en 164 doelen; G-0001 Afwerking bouw 16 hele sets en 76 doelen (arbeidsmarkt: geen deelsets).
- **Stap 3, alles** (run 37958333744, PR #6 samengevoegd): minimumdoelen ongewijzigd (24 019 doelen, 950 sets). 545 groepen; 265 gekoppeld via de API en 4 volgens de regel per stroom (A 2, B 2). Elke gewone groep (260) en elk aanloopjaar (9) is gekoppeld; de 7de jaren (219), het buitengewoon onderwijs (55) en OKAN/basisverpleegkunde (2) hebben volgens de bron geen doelen. Looptijd van de studierichtingen ±20 minuten, de hele taak ±23 minuten. Data: 5,1 MB in 271 bestanden.
- **Onafhankelijke kruiscontrole:** voor de 127 richtingen waarvan de naam maar in één graad bestaat, geeft de filter op naam (verkenningsrun 4) exact hetzelfde totaal en dezelfde verdeling over de sets als de koppeling op groepsnummer. De datatest op de echte data: 0 verwijzingen naar een onbekend onderdeel (M5, 482 verwijzingen), 0 afwijkingen in de soort onderwijs (F5, 262 sets), 0 verschillen met het ordeningskader (F6, 265 groepen). Daarom staan `KRUISCONTROLE_STRENG`, `ONDERWIJSSOORT_STRENG` en `HISTORIEK_STRENG` nu op true.
- **R4.** De API koppelt de sets "3de graad 3de leerjaar" (bv. ODS_3371, 1 doel) ook aan een gewone richting van de 3de graad (G-0327). R4 blijft: in het 5de en 6de jaar staan die sets bij "Niet voor dit jaar", niet weg.

## 18. Bouwplan

### 18.1 Fasen

```
P0 ─┬─ P1 ─┬─ P2 ─┬─ P4 ─┐
    │      │      │      ├─ I1 ─ G1 (echte run, loopt naast fase B) ──────────────────────────┐
    │      └─ P3 ─┘ (oplevering na P2)                                                         │
    └─ P5 ────────────┴─ P6 ─ P7 ─ I2 ─┬─ P8  (worktree A) ─┐                                  │
                           │           ├─ P9  (worktree B) ─┼─ I3 ─┬─ P12 ─ P13 ─ I4 ──────────┘
                           │           └─ P10 (worktree C) ─┘      │
                           └─ P11 (zuivere dekking, mag naast fase B) ┘
```

- **Fase A, data en zuivere logica, met nagebootste API-antwoorden:** P1 tot P7. P1 en P5 lopen parallel. P3 begint na P1, naast P2.
- **Fase B, schermen:** P8, P9 en P10, parallel in drie worktrees, op de fixtures. De stubs uit I2 maken het mogelijk.
- **Fase C, dekking:** P11 (zuiver; mag al na P6 starten, want het raakt geen bestanden van fase B) en P12 (de schermen).
- **Fase D:** P13 (de rooktest) en I4.
- G1 loopt zodra de data-pakketten geïntegreerd zijn (I1), naast fase B.

### 18.2 Afspraken voor elk pakket

- Elke opdracht vermeldt het doel, de bestanden, de relevante paragrafen van dit document, de poorten en wat niet aangeraakt mag worden. Agents committen niet. De hoofdsessie integreert, controleert en commit.
- **De poorten:**
  - `npm run lint` (0 fouten, niet meer dan de 48 waarschuwingen van nu);
  - `npm run typecheck`;
  - `npx vitest run`;
  - voor pakketten met UI ook `npm run build` (budget gemeld) en de bestaande rooktest op `vite preview` (`PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs`).
- **Nooit aanraken**, behalve waar een pakket het uitdrukkelijk noemt:
  - `tools/leerplannen/haal-minimumdoelen.mjs`, `src/lib/minimumdoelen.ts` (alleen importeren) en `public/leerplannen/minimumdoelen/**`;
  - `computeCoverage` (in `coverage.ts` komen alleen nieuwe exports, in P11);
  - `vite.config.ts` (alleen de hoofdsessie);
  - de bestaande checks in `tests/smoke.mjs` (alleen P13 voegt een sectie toe);
  - `CurriculumPicker.tsx`.
- Schrijven en controleren doen twee verschillende agents: P3 controleert P2, P13 controleert P8 tot P12, en in I4 controleren reviewers en een rechter.

### 18.3 Pakketten

De volledige lijst met bestanden, afhankelijkheden en acceptatiecriteria staat in de tabel met pakketten bij dit ontwerp. Samengevat:

- **P0 (hoofdsessie)** — dit document, CLAUDE.md (één regel), ONDERWIJS-API.md (stand en § 6), LEERPLANNEN.md (stand: L6 in dit werk), `icons.ts` (`RichtingIcon`) en ICONEN.md.
- **P1 (kernbouwer)** — `src/lib/studierichtingen.ts` en de test.
- **P2 (kernbouwer)** — het script, `maak-nagebootste-koppeling.mjs`, `tests/fixtures/structuur/**` en de scripttest.
- **P3 (bouwer, een andere agent)** — de datatest.
- **P4 (bouwer)** — `minimumdoelen.yml`.
- **P5 (kernbouwer)** — `doelgroep.ts` en alle grenzen.
- **P6 (bouwer)** — de lader, het kader, `useRichtingGegevens.ts`, `setKeuze.ts` en `samenstelKeuze.ts`.
- **P7 (bouwer)** — `richtingCursus.ts`.
- **I1 (hoofdsessie)** — P1 tot P4 integreren, de poort, commit en push.
- **G1 (hoofdsessie)** — § 17.
- **I2 (hoofdsessie)** — P5 tot P7 integreren, plus de stubs `NieuweRichtingCursus.tsx` en `RichtingKiezerModal.tsx` met de vaste props.
- **P8, P9, P10 (bouwers, worktrees)** — de schermen.
- **I3 (hoofdsessie)** — de worktrees samenvoegen; de ingangen in Layout, MinimumdoelenPage, LeerplanWegwijzer en HelpPage; het budget meten en `vite.config.ts` aanpassen.
- **P11 (kernbouwer)** — de dekkingsmodule.
- **P12 (bouwer)** — de dekking op de schermen.
- **P13 (bouwer, een andere agent)** — de rooktest 20d.
- **I4 (hoofdsessie)** — de review, de rechter, het herstel, rooktest 20e, de docs en de uitrol.

### 18.4 Wat de hoofdsessie zelf doet

- **P0:** het ontwerp en de stand van zaken in de repo, de verwijzing in CLAUDE.md (buiten het werkwijzeblok, dus `maak-werkwijze-installer.mjs` hoeft niet), het icoon.
- **I1 tot I4:** worktrees samenvoegen, de volledige kwaliteitspoort draaien (lint, typecheck, vitest, build, rooktest, `tests/ai/mock-studio.mjs`), committen en pushen naar `claude/bookwidgets-web-app-kvcfim`.
- **Budget:** meten na P8 en na I3, en `CRITICAL_PATH.maxKb` bewust verhogen, met een geschiedenisregel.
- **Rooktest:** `vite preview` per beurt opnieuw starten; de rooktest twee keer na elkaar groen; na G1 sectie 20e op de echte data.
- **Workflow:** de echte runs in stappen starten (§ 17), de rapporten lezen, de proef-PR's sluiten, de data-PR nakijken en samenvoegen op teken van de eigenaar.
- **Review:** vier reviewers (1. datastroom, script en workflow; 2. juistheid van kader, cursushulp en dekking; 3. toegankelijkheid, taal en 390 px; 4. bundel, opslag, sanering en privacy), daarna de rechter. Alleen bevestigde bevindingen worden hersteld.
- **Docs:** de stand van zaken in dit document, ONDERWIJS-API.md en LEERPLANNEN.md bijwerken, en een kort verslag aan de eigenaar in het Vlaams.

## 19. Open vragen voor de eigenaar (met de werkkeuze tot de eigenaar beslist)

- O1. Mag "gepland" (een doel staat op een sectie die nog leeg is) later ook in de gewone dekking komen: de cursuskaart, de weergave "Leerplan" en "Vul de hiaten"? Nu staat het alleen in de nieuwe dekking op de minimumdoelen, plus een hint in de weergave "Leerplan", zodat bestaande percentages niet veranderen. **Werkkeuze: "gepland" alleen in de nieuwe dekking.**
- O2. Mag het budget van het leerlingpad bewust van 333 naar ±333,5 kB, voor de ene nieuwe route? **Werkkeuze: ja, bewust en gemeten, met een geschiedenisregel.**
- O3. Mogen minimumdoelen en studierichtingen in één maandelijkse taak "Leerplangegevens bijwerken", met één pull request? Dat is de aanbeveling: zo kloppen de gegevens onderling. **Werkkeuze: ja, één taak en één pull request.**
- O4. Wil je de data-PR van de eerste volledige run zelf nakijken en samenvoegen, of mag de hoofdsessie dat doen na de checklist van § 17? De proefruns worden gesloten, niet samengevoegd. **Werkkeuze: de hoofdsessie kijkt de data-PR na volgens § 17 en voegt samen (de eigenaar gaf het startsein voor de import); de proefruns worden gesloten.**
- O5. Buitengewoon onderwijs: opleidingsvorm 4 is een keuze bij gewone richtingen. Moeten OV1 tot OV3, de 7de jaren en de aanloopjaren zichtbaar zijn achter "Toon ook …", met een eerlijke melding als de bron er geen doelen aan koppelt? **Werkkeuze: ja, achter "Toon ook …", met een eerlijke melding.**
- O6. Dekking: moet een verwijzing naar hetzelfde vaste nummer in een andere set (een andere versie, of de BuSO-kopie) ook meetellen? Nu telt het strikt op set + vast nummer, met een teller die toont hoeveel het zou schelen. **Werkkeuze: strikt, met de teller.**
- O7. Werkregel voor de 3de graad tot de eerste run of TechLoket het bevestigt: in het 5de en 6de jaar zonder de sets "3de leerjaar"; in een 7de jaar alleen die sets, als de bron ze koppelt. Akkoord? **Werkkeuze: ja, tot G1 het bevestigt.**
- O8. 1ste graad: horen de uitbreidingsdoelen ("mag, moet niet") niet standaard in het leerplan en de dekking, alleen als de leerkracht ze aanvinkt? **Werkkeuze: ja, alleen op vraag.**
- O9. Gaan de licentie en de naamsvermelding van de API Structuuronderdelen, en de vraag of groepnummers stabiel blijven over de schooljaren, mee in het formulier van TechLoket? **Werkkeuze: ja, mee in de vragen aan TechLoket (§ 12 van LEERPLANNEN.md).**
- O10. Zullen we de netten vragen om per richting de leerplancodes te mogen tonen (alleen metadata, geen inhoud)? Tot dan tonen we links en wat de school zelf inleest. **Werkkeuze: later, samen met de andere vragen aan de netten.**
- O11. Arbeidsmarktfinaliteit: daar koppelt de bron vooral de basisvorming. Wil je later de beroepskwalificaties (die API bestaat) als extra laag? **Werkkeuze: later.**

## 20. Risico's

- **De vorm is nog niet bevestigd** (regel 11): het lijstpad van de matrix, de 404 buiten de 1ste graad, wat de 7de jaren, BuSO en de groepen met alleen duale onderdelen geven, en of `onderwijssoort` er altijd staat. Opvang: een tolerante normalisatie, exit 3 bij twijfel, de eerste run in stappen, en de STRENG-vlaggen pas na G1.
- **Een 404 is niet te onderscheiden van een kapot eindpunt.** Opvang: een tweede poging, de massaverliespoort, de poort op 50 % gekoppeld, de ordeningskaderpoort, en de laatst bekende koppeling blijft staan.
- **Een filter die de API negeert**, zou elke richting alle doelen geven. Opvang: D2 (≥ T of > 5000) en D4.
- **R4 ("3de leerjaar") is afgeleid**, niet bevestigd. Opvang: wat wegvalt, blijft zichtbaar ("Niet voor dit jaar"), en G1 beslist.
- **De stroom van de 1ste graad hangt aan de groepstitel.** Opvang: M7 en F4 laten een titelwijziging zichtbaar falen.
- **Eén run voor drie gegevenssets:** een blijvend probleem in de koppeling houdt ook de minimumdoelen tegen. Opvang: de noodinvoer `onderdelen=minimumdoelen` en het versiemerk.
- **Het versiemerk** laat de koppeling tot een maand achterlopen op een set die bijgewerkt werd. De app meldt dat; de volgende run maakt het goed.
- **De looptijd:** ±800 extra verzoeken (±12 minuten). Opvang: een time-out van 60 minuten, en de meting in het rapport.
- **"Actueel" rust op de heuristiek `oudeVersieIds`** (naam, soort, graad, stroom). Verandert de geldigheid in de bron, dan verandert het kader mee.
- **De dekking volgt de verwijzingen van een leerplan.** Zijn de refs van een ingelezen netleerplan fout, dan is de dekking dat ook. De nakijkpoort vangt alleen wat ze kan nagaan.
- **Leerplancodes zijn per toestel gelijk zolang de koppeling gelijk is.** Een gedeelde cursus telt op een ander toestel pas mee als ze daar aan een leerplan hangt. Het scherm biedt dat aan, met `passendeCodes`.
- **localStorage:** een leerplan van een hele richting is ±75 kB. Met veel richtingen kan de opslag vollopen. Opvang: hergebruik, leerplannen per vak, en eerlijke meldingen.
- **sw.js** groeit met tot ±545 namen (±25 kB). Het staat niet op het kritieke pad.
- **CourseEditorPage zit op 67,8 van 80 kB.** Een statische import van de kiezer of van de dekking op minimumdoelen zou het budget breken. Opvang: luie imports en een budgetmeting in I3.
- **De licentie** van de matrix is niet bevestigd. Er komt een tweede publieke overheidsdataset in de repo, die zelf geen licentie heeft.
- **De fixtures volgen de echte setbestanden.** Na een maandelijkse update kan de reproductietest overslaan (versiemerk). De rooktest gebruikt daarom regex, geen vaste aantallen.

## 21. Bewust niet, of later

- Een eigen koppeling voor de 7de jaren of de BuSO-opleidingen: niets verzinnen. Alleen wat de API geeft.
- Een tweede doelenkiezer in de cursushulp: per doel kiezen gebeurt in de bestaande samenstelwizard.
- "Gepland" in `computeCoverage` en de cursuskaart: dat is O1.
- Leerplancodes of inhoud van de netten per richting: nooit zonder toestemming.
- Een richting en een jaar op een klas (`ClassGroup`), het aanbod per school, beroepskwalificaties bij A-richtingen: later.
- "Maak een cursus voor wat nog niet gedekt is" vanuit de dekking: in fase 2 (§ 22.4), samen met "een richting op een klas" (§ 22.6).
- Het minimumdoelenscript laten overstappen op gedeelde hulpfuncties: een aparte opruimtaak.

## 22. Fase 2: vingerafdruk per set, gaten dichten, mijn richtingen, klas en richting

*Ontwerp van 10 oktober 2026: de synthese van twee ontwerpen ("leerkracht eerst" en "risico eerst") door een jurylid. Elke bewering over bestaande code is in de code nagekeken (stand na I4, commit fc4c8a0). Waar een ontwerp de code verkeerd las, staat de juiste lezing hier. Fase 2 gebruikt geen nieuwe API-gegevens: alles rekent op de matrix, de koppeling, de setbestanden en de opslag die al in de repo staan.*

### Stand van zaken fase 2

| Wat | Stand | Op wie |
|---|---|---|
| Ontwerp fase 2 in de repo (deze § 22, bijlage D, verwijzing in de stand van zaken bovenaan) | **Klaar** (10 oktober 2026) | hoofdsessie |
| A1 Vingerafdruk per set (F2.1) en `doelgroepVoorKlas` | **Klaar** (10 oktober 2026): onafhankelijk nagekeken met 20.000 willekeurige gevallen voor de oude regel en 30.000 voor de nieuwe, geen verschil; twee kleine punten hersteld (een `setAfdrukken` met alleen ongeldige ingangen valt terug op de oude regel; komma in een nummer eenduidig), één weerlegd met een test | kernbouwer |
| A2 Logica gaten dichten (F2.2) | **Klaar** (10 oktober 2026): `gatenDichten.ts` en `gatenCursus.ts`, 78 tests met de valkuilregressie; onafhankelijk nagekeken, drie kleine punten hersteld (titel houdt graad en OV4, een al bewaarde cursus verliest nooit haar leerplan, zes overlevende mutaties nu gedood) | bouwer |
| A3 Logica mijn richtingen en klas met richting (F2.3, F2.4) | **Klaar** (10 oktober 2026): `doelgroepGebruik.ts`, `richtingOverzicht.ts`, `dekkingCache.ts`, `ClassGroup.doelgroep` met `zetKlasRichting`; onafhankelijk nagekeken, één belangrijk punt hersteld (jaren van klassen niet bij de cursussen in de meta) en twee kleine | bouwer |
| I-A Integratie van de logica, hook verhuizen, stubs | **Klaar** (10 oktober 2026): `useRichtingDekking.ts` (met `bijdragenVoorKader`, cache bij "Alle jaren"), stubs `DekkingKort.tsx` en `RichtingKlassen.tsx`; rooktest twee keer groen | hoofdsessie |
| B1 Schermen gaten dichten | **Klaar** (10 oktober 2026): `GatenVenster.tsx` (lui), het paneel "Plan in deze cursus" in de editor, `gatenWeergave.ts` (28 tests); nagekeken, geen blokkerende of belangrijke fout; één klein punt hersteld (enkelvoud "Zet het in deze cursus") | bouwer |
| B2 Scherm mijn richtingen | **Klaar** (10 oktober 2026): `MijnRichtingen.tsx`, echte `DekkingKort` (cache, zichtbaarheid, één richting tegelijk met `rijWachtrij.ts`); nagekeken, één klein punt hersteld (in de klas een eerlijke zin als de matrix nog niet opgehaald is) | bouwer |
| B3 Schermen klas en richting | **Klaar** (10 oktober 2026): sectie "Studierichting" in de klas met `KlasRichting.tsx`, optgroups bij toewijzen, "Klassen van deze richting"; nagekeken, één belangrijk punt hersteld (de telling "2 van de 3 cursussen" telt dezelfde cursussen als de lijst erboven) en één klein (een melding blijft niet hangen bij een andere klas) | bouwer |
| I-B Integratie van de schermen, hulp, budget, docs | **Klaar** (10 oktober 2026): samengevoegd, twee hulpvragen, docs bijgewerkt | hoofdsessie |
| C1 Rooktest 20f | **Klaar** (10 oktober 2026): sectie 20f (82 checks, stap 1 tot 9 van § 22.9, ook de controle dat F2.1 de valse melding weghaalt) en regex-checks in 20e; twee keer na elkaar groen; geen fouten in de app gevonden | bouwer (een andere agent dan B1 tot B3) |
| I-C Review, rechter, herstel, uitrol | **Klaar** (10 oktober 2026): vier reviewers (juistheid, opslag en grenzen, toegankelijkheid en taal, bundel en kost), elk met een rechter: 8 bevindingen, 2 bevestigd (klein) en hersteld: toewijzen bij een volle opslag meldt geen succes meer (`upsertAssignment` geeft `ok`), en de dekking in de klas laadt de richtingpagina niet meer mee (`DekkingKortKlas.ts`, `setNamenVan` in `lib/setNamen.ts`). Kritiek pad 334,1 kB, budget bewust naar 334,6 kB (V6) | hoofdsessie, reviewers, rechter |
| Open vragen V1 tot V10 (§ 22.12) | Wacht: de werkkeuze geldt tot de eigenaar beslist | eigenaar |

### 22.1 In het kort

| Onderdeel | Wat de leerkracht merkt | De kern |
|---|---|---|
| **F2.1** Vingerafdruk per set | Na "Keuze aanpassen" komt er geen valse melding "De officiële koppeling van deze richting is veranderd" meer, en een eigen doel valt niet meer vals weg bij "Kies de doelen opnieuw". | Eén nieuw veld `doelgroep.setAfdrukken`: per set een afdruk van 16 hex-tekens. Een set zonder afdruk wordt nooit vergeleken. Leerplannen van vóór fase 2 houden precies de oude regel tot ze met hun richting opnieuw bewaard worden. `kader` en `kaderVolledig` blijven geschreven. |
| **F2.2** Gaten dichten | Op de richtingpagina: **"Plan de 37 doelen die nog nergens aan bod komen"**. In één venster kiest ze de sets en "In een nieuwe cursus" of "In een cursus die je al hebt". In de editor: **"Plan ze in deze cursus"**. | De doelen komen als lege secties met doelcodes op een cursus en tellen meteen als "gepland". Een nieuwe cursus krijgt een nagekeken leerplan met precies die doelen (of hergebruikt er een). Een bestaand leerplan past Boosterz nooit zelf aan: wat er niet in staat, komt niet op de cursus, met uitleg en een link naar het leerplan. |
| **F2.3** Mijn richtingen | Bovenaan `/cursussen/richtingen` de eigen richtingen, met het aantal cursussen en klassen en wat de cursussen samen dekken. | De rijen komen meteen uit de opslag, zonder netwerk. De dekking rekent per zichtbare rij, één richting tegelijk, met dezelfde functies als het detail, en een samenvatting in het geheugen die bij elke opslagwijziging vervalt. Het detail vult die samenvatting ook. |
| **F2.4** Klas en richting | In de klas: "Studierichting: Natuurwetenschappen · 4de jaar", de cursussen van die richting met "Toewijzen", en op vraag de dekking. Bij "Opdracht toevoegen" staan die cursussen bovenaan. Op de richtingpagina de klassen van die richting. | `ClassGroup.doelgroep` met een witte lijst (`doelgroepVoorKlas`: geen vak, geen kadervelden). Het veld reist mee in het klaspakket (link, bestand, opslag bij de leerling) en wordt overal gesaneerd via `sanitizeClass`. Geen persoonsgegevens. |

**Regel voor heel fase 2.** Niets wordt weggeschreven zonder een uitdrukkelijke klik. Een mislukte schrijfpoging zegt dat er niets bewaard of veranderd is. Niets wat al bewaard is, verandert van betekenis zonder dat de leerkracht het ziet.

### 22.2 Beslissingen

| # | Beslissing | Waarom |
|---|---|---|
| F2-B1 | Eén afdruk per set (`setAfdrukken: Record<setId, 16 hex>`) die de vaste nummers van de koppeling en "volledig of deel" samen dekt. | Het kleinste formaat dat § 11.2 oplost: één afdruk ziet wat `kader` en `kaderVolledig` samen zagen, maar per set. |
| F2-B2 | Een set **zonder** afdruk wordt nooit vergeleken. | Wat zonder kader gekozen is, is een eigen keuze en geen koppeling. Zo komt er geen valse melding. |
| F2-B3 | **Geen automatische migratie en geen vastpinnen.** Een leerplan zonder `setAfdrukken` volgt de huidige regel byte voor byte, tot het met zijn richting opnieuw bewaard wordt. | "Niets stil veranderen". Vastpinnen (ontwerp "risico eerst") zou in minstens drie schrijfpaden code vragen (zie keuzes), voor leerplannen van 9 en 10 oktober. De fout die overblijft is zichtbaar: de wizard meldt wat hij niet aanvinkt. |
| F2-B4 | `kader` en `kaderVolledig` blijven geschreven, in hetzelfde formaat, op elk leerplan dat `setAfdrukken` krijgt. | Een oudere app-versie (een tabblad dat niet herladen werd) saneert `setAfdrukken` weg en valt dan veilig terug op de oude regel. |
| F2-B5 | Gaten dichten neemt alleen verplichte doelen met status `open`. Gepland, verdieping, optioneel en uitbreiding blijven erbuiten. | Gepland staat al op een sectie; verdieping komt al aan bod; optioneel telt niet mee in het percentage (B12). Anders ontstaan dubbels. |
| F2-B6 | Een selectie uit de dekking is **altijd een lijst vaste nummers per set**, nooit `'alle'`, en gaat nooit door de samenstelwizard. | De valkuil van § 9.5. Een link (`sets=`, `zelf=`) kan geen selectie per doel dragen (B9). |
| F2-B7 | (a) maakt altijd een **geraamte**, nooit een lege cursus. | Een lege cursus laat de doelen op "open" staan: het gat zou na de klik even groot zijn. |
| F2-B8 | (b) **past een leerplan nooit aan.** Alleen doelen die al in het leerplan van de gekozen cursus staan, komen op de cursus. De rest wordt niet geplaatst, met de reden en een link "Open het leerplan". | Het eenvoudigste juiste gedrag (§ 22.4.4): geen stil neveneffect op andere cursussen die het leerplan delen, geen stil verlies van `volgtKader`, geen tweestapsbewaring zonder transactie, en één gedrag voor elk soort leerplan. Een leerplan aanpassen is een bewuste stap die al bestaat ("Keuze aanpassen"). |
| F2-B9 | In de **editor** alleen "op deze cursus", inline in de weergave Minimumdoelen (geen tweede venster), via `draft.edit`. | De Doelendekking is zelf al een venster: een genest venster vraagt extra afspraken voor Escape en focus. De bewaarmotor bewaakt het bewaren al. De editor heeft geen "ongedaan maken", dus de leerkracht kiest de sets eerst. |
| F2-B10 | Mijn richtingen en de klas tonen **dezelfde dekking** als het detail bij "Alle jaren van de graad", met dezelfde functies (`bijdragenVoorKader`). | Het getal waarop je klikt, is het getal dat je daarna ziet. |
| F2-B11 | Een klas krijgt richting, titel, graad, jaar, soort en onderdeel (witte lijst). Geen vak, geen kadervelden. | Een klas is geen leerplan; het vak hoort bij de cursus. Een witte lijst laat een veld dat later bijkomt nooit per vergissing op een klas belanden. |
| F2-B12 | De klasrichting bewaart met **opnieuw lezen en alleen dat veld wijzigen** (`zetKlasRichting`). | `saveClass` vervangt de hele klas: met een oude kopie zou een klaslijst uit een ander tabblad stil verdwijnen. |
| F2-B13 | "Toewijzen" vanuit de klas opent het bestaande venster "Opdracht toevoegen" met de cursus al gekozen. | Eén bestaand bewaarpad met deadline en instructie; geen tweede manier om een opdracht te maken. |
| F2-B14 | Geen nieuwe route. Het venster van de gaten, de dekking per rij en de kiezer in de klas zijn lui. | Het kritieke pad staat op 333,7 van 334,2 kB. |

### 22.3 F2.1 Vingerafdruk per set

#### 22.3.1 Het probleem

Een leerplan van een richting bewaart nu twee afdrukken over al zijn sets samen (`kaderAfdrukken(kader, insluiten)` in `leerplanVoorRichting`, `doelgroepBijRichting` in samenstellen en inlezen). Verandert de lijst sets zonder richting, dan verschilt de afdruk over de nieuwe lijst en geeft `veranderdSindsLeerplan` `'alles'`. Dan telt een doel dat de leerkracht zelf bij een deelset koos als vervallen, en "Kies de doelen opnieuw" vinkt het uit (test "bekende beperking (§ 11.2)" in `doelenSamenstellen.test.ts`, r. 768).

De lijst sets van een leerplan verandert op meer plaatsen dan "Keuze aanpassen": `leerplanUitSelectie` met `bestaand` (doelenSamenstellen.ts r. 739), `bouwOntwerp` bij opnieuw inlezen (leerplanInlezen.ts r. 520) en de setkiezer van een bewerkbaar leerplan (CurriculaPage.tsx r. 704). Een afdruk per set werkt voor alle drie zonder extra code.

#### 22.3.2 Datamodel (`src/lib/doelgroep.ts`)

```ts
export interface Doelgroep {
  // … bestaande velden ongewijzigd: groep, titel, graad, jaar, soort, onderdeel, vak, kader, kaderVolledig, volgtKader
  /**
   * Nieuw (fase 2). Per set van het leerplan die bij het bewaren in het kader van de richting stond: `setAfdruk`
   * (16 kleine hex-tekens). Aanwezig (ook leeg) = nieuw formaat: dan beslist alleen dit veld wat vergeleken wordt.
   * Alleen samen met een geldig `kader`, alleen op een leerplan, hoogstens 50 sets. Formaat nooit veranderen.
   */
  setAfdrukken?: Record<string, string>;
}
export const MAX_SET_AFDRUKKEN = 50;                                    // = MAX_SETS van een leerplan
export function zonderKaderVelden(d: Doelgroep): Doelgroep;             // nieuw object zonder kader, kaderVolledig, setAfdrukken, volgtKader
export function doelgroepVoorKlas(raw: unknown): Doelgroep | undefined; // F2.4: sanitizeDoelgroep, dan alleen groep, titel, graad, jaar, soort, onderdeel
// doelgroepVoorCursus(raw) wordt: const d = sanitizeDoelgroep(raw); return d ? zonderKaderVelden(d) : undefined;
```

**De afdruk van één set** (`src/lib/richtingKader.ts`):

```ts
export function setAfdruk(k: KaderSet): string;
//   sha256Hex(`${k.set.id}|${k.volledig ? '*' : '-'}|${ids}`).slice(0, 16), met ids = de vaste nummers van k.ids, getrimd,
//   leeg weg, uniek, gesorteerd op code-eenheid, gescheiden door komma's. Ziet een deelset die verandert, een set die
//   volledig wordt of niet meer, en een volledige set die groeit of krimpt. Het versiemerk zit er niet in (zoals nu).
export function afdrukkenPerSet(kader: RichtingKader, sets: readonly string[]): Record<string, string>;
//   alleen de sets van `sets` die in kader.sets staan; sleutels gesorteerd
export function kaderAfdrukken(kader: RichtingKader, sets: readonly string[]):
  { kader: string; kaderVolledig: string; setAfdrukken: Record<string, string> };   // uitgebreid, zelfde signatuur voor de rest
export function veranderdSindsLeerplan(leerplan, kader): KaderVerandering;          // zelfde signatuur en type
```

Omdat `leerplanVoorRichting` en `doelgroepBijRichting` het resultaat van `kaderAfdrukken` al spreiden, krijgen alle schrijvers het nieuwe veld zonder codewijziging.

#### 22.3.3 Sanering en grenzen

| Waar | Wat |
|---|---|
| `sanitizeDoelgroep` | `setAfdrukken` blijft alleen bij een geldig `kader` en als het een gewoon object is (geen array). Een sleutel moet passen op `/^ODS_\d{1,9}$/` (zoals `SET_ID` in curriculum.ts r. 202), een waarde op `/^[0-9a-f]{16}$/`; de rest valt weg. Alleen eigen eigenschappen (`eigen`). Sleutels gesorteerd op code-eenheid, hoogstens 50. Altijd een nieuw object; `__proto__` haalt de regex nooit. Een leeg object blijft (nieuw formaat zonder sets in het kader). Idempotent. |
| `doelgroepVoorLeerplan` | houdt het veld |
| `doelgroepVoorCursus` | via `zonderKaderVelden`: geen enkel kaderveld |
| `maakEigenKopie` (curriculum.ts r. 612) | de inline destructuring wordt `zonderKaderVelden(doelgroep)` |
| `sanitizeCourse` (courses.ts r. 1333) | gebruikt voortaan `doelgroepVoorCursus` in plaats van `sanitizeDoelgroep`. Een cursus draagt zo nooit kadervelden, ook niet uit een geknutseld bestand. De app zelf schrijft ze nooit op een cursus, dus bestaande cursussen veranderen niet. |
| `doelgroepVanBestaand` (doelenSamenstellen.ts r. 659) | snoeit `setAfdrukken` tot de sets van de nieuwe selectie (een set die wegvalt, verliest haar afdruk; een set die later zonder richting terugkomt, is een eigen keuze, F2-B2). Daarna de bestaande regel voor `volgtKader`. Een leerplan zonder `setAfdrukken` krijgt er hier geen. |
| Export v2, deellink, cursusbestand, klaspakket, overdracht | niets nieuw: het veld reist mee in `doelgroep` en wordt aan elke grens gesaneerd. `doelenVingerafdruk` (curriculum.ts r. 549) rekent alleen over de doelen: "nagekeken" blijft nagekeken. |

#### 22.3.4 De ene regel

```ts
export function veranderdSindsLeerplan(leerplan, kader): KaderVerandering {
  if (!leerplan || leerplan.kind === 'eigen') return 'niets';
  if (kader.herkomst === 'nog-niet-opgehaald' || (kader.herkomst === 'geen' && kader.sets.length === 0)) return 'niets';
  const dg = doelgroepVoorLeerplan(leerplan.doelgroep);
  const sets = Array.isArray(leerplan.minimumdoelenSets) ? leerplan.minimumdoelenSets : [];
  if (dg?.setAfdrukken !== undefined) {                        // nieuw formaat
    const perSet = new Map(kader.sets.map((k) => [k.set.id, k]));
    const veranderd = new Set<string>();
    for (const set of new Set(sets)) {
      if (!Object.prototype.hasOwnProperty.call(dg.setAfdrukken, set)) continue;   // eigen keuze: nooit vergelijken
      const k = perSet.get(set);
      if (!k || setAfdruk(k) !== dg.setAfdrukken[set]) veranderd.add(set);
    }
    return veranderd.size > 0 ? veranderd : 'niets';           // 'alles' komt in het nieuwe formaat nooit voor
  }
  return oudeRegel(dg, kader, sets);                            // r. 683-691 van nu, ongewijzigd
}
```

`vergelijkMetKader` (richtingCursus.ts r. 331) en `beginUitBewaarde` (richtingLink.ts r. 183) veranderen niet: ze rekenen al met `telt(set) = bekijk === 'alles' || bekijk.has(set)`. Wat dat geeft:
- Een set die uit het kader viel (bv. een oude versie): haar afdruk past niet meer, ze wordt vergeleken en geeft `setsNietMeerInKader` en de vervallen verwijzingen, zoals nu.
- Een volledige set die groeide: vergeleken; bij `volgtKader` en een gelijke versie geeft ze "nieuw", zoals nu.
- Een afdruk van een set die niet meer in het leerplan staat: telt niet.
- Wat blijft: veranderde de koppeling van een deelset **echt**, dan wordt die set vergeleken en kan een eigen extra doel daarin als vervallen tellen, zoals vandaag bij een echte verandering. De **valse** melding is weg.

#### 22.3.5 Wie schrijft wat

| Pad | `kader`, `kaderVolledig` | `setAfdrukken` | `volgtKader` |
|---|---|---|---|
| `leerplanVoorRichting` ("Maak een cursus", "Bewaar als leerplan", "Werk het leerplan bij") | nieuw, over `insluiten` | nieuw, over `insluiten` (vanzelf via `kaderAfdrukken`) | ja |
| `doelgroepBijRichting` in SamenstellenPage (r. 430, 488) en LeerplanInlezenPage (r. 303) | nieuw | nieuw | nee |
| "Keuze aanpassen" zonder richting (`doelgroepVanBestaand`) | blijven | gesnoeid tot de nieuwe sets; een oud leerplan krijgt er geen | valt weg als de keuze veranderde (ongewijzigd) |
| `bouwOntwerp` met `bestaand` zonder nieuwe doelgroep, setkiezer CurriculaPage r. 704 | blijven | blijven (niet gesnoeid; de regel kijkt alleen naar sets die nog in het leerplan staan) | blijft |
| F2.2 (a): nieuw leerplan voor de gaten | nieuw (via `doelgroepBijRichting`) | nieuw | nee |
| `maakEigenKopie`, cursus, klas | weg | weg | weg |

#### 22.3.6 Migratie en de bestaande velden

| Stand van een bewaard leerplan | Wat de app doet | Verandert er iets in de opslag? |
|---|---|---|
| Zonder doelgroep, of een eigen kopie | zoals nu | nee |
| `kader` (+ `kaderVolledig`), zonder `setAfdrukken` | de oude regel, byte voor byte (ook "zonder `kaderVolledig`: `'niets'` bij een gelijke `kader`") | nee |
| … bewaard via "Keuze aanpassen" zonder richting | blijft oud formaat (de bekende beperking blijft voor dit leerplan bestaan) | alleen wat de leerkracht zelf bewaart |
| … bewaard met de richting ("Werk het leerplan bij", "Kies de doelen opnieuw", inlezen met richting) | nieuw formaat, over het kader van nu (een bewuste herbasering) | ja, bij een bewuste bewaring |
| Met `setAfdrukken` | de nieuwe regel | nee |
| Met `setAfdrukken`, bewaard door een oudere app-versie | die saneert `setAfdrukken` weg; `kader` en `kaderVolledig` staan er nog: de oude regel | alleen door die oudere versie |

`kader` en `kaderVolledig` blijven geschreven (±130 tekens per leerplan); de app leest ze alleen bij een leerplan zonder `setAfdrukken`. De formaten van `kaderVingerafdruk` en `volledigeSetsVingerafdruk` veranderen niet. Wanneer we ze niet meer schrijven, is open vraag V7.

#### 22.3.7 Schermen

Geen nieuwe teksten. Het enige zichtbare verschil: geen valse callout "De officiële koppeling van deze richting is veranderd …" en geen valse melding "<n> doelen staan niet (meer) in de koppeling …" in de wizard.

#### 22.3.8 Tests (A1)

- **Let op, bestaande tests:** `kaderAfdrukken` geeft voortaan ook `setAfdrukken`. Tests die hun doelgroep bouwen met `...kaderAfdrukken(…)` en de **oude** regel bedoelen (richtingKader.test.ts, richtingCursus.test.ts, richtingLink.test.ts, doelenSamenstellen.test.ts), bouwen ze voortaan expliciet zonder dat veld (helper `oudFormaat(kader, sets)` in de test). Hun verwachte uitkomsten veranderen niet. Dat is acceptatie, geen vrijheid.
- `doelgroep.test.ts`: geldig; sleutel geen set-id; waarde geen 16 hex; hoofdletters in de hex; meer dan 50; `__proto__` en `constructor` als sleutel; geen object of een array; zonder `kader` weg; leeg object blijft; idempotent. `zonderKaderVelden` haalt de vier velden weg; `doelgroepVoorCursus` ook; `doelgroepVoorKlas` laat alleen de witte lijst over (ook `vak` en een onbekende sleutel weg).
- `richtingKader.test.ts`: `setAfdruk` hangt niet af van de volgorde of dubbels; deel en volledig met dezelfde nummers verschillen; een volledige set die groeit of krimpt verandert de afdruk; `afdrukkenPerSet` slaat sets buiten het kader over. `veranderdSindsLeerplan` nieuw formaat: niets veranderd → `'niets'`; één deelset veranderd → `{A}`; volledige set gegroeid → `{V}`; set uit het kader → `{S}`; set zonder afdruk → nooit; afdruk van een set die niet meer in het leerplan staat → telt niet; leeg object → `'niets'`. Oud formaat: alle bestaande gevallen.
- `doelenSamenstellen.test.ts`: de test "bekende beperking" wordt twee tests. (1) **nieuw formaat**: `zonderB` geeft `vervallen: 0`, `beginUitBewaarde` houdt a2, en `zonderB.doelgroep.setAfdrukken` heeft alleen nog ODS_9001. (2) **oud formaat** (dezelfde stappen met `oudFormaat`): `vervallen: 1`, zoals vandaag. Plus: een set die zonder richting terugkomt, heeft geen afdruk.
- `richtingCursus.test.ts`, `richtingLink.test.ts`: `leerplanVoorRichting` en `doelgroepBijRichting` geven `setAfdrukken` voor precies de sets in het leerplan; `vergelijkMetKader` en `beginUitBewaarde` komen op dezelfde set-uitkomst.
- `curriculum.test.ts`: `maakEigenKopie` zonder kadervelden; export en import v2 houden `setAfdrukken`; vingerafdruk en status "gecontroleerd" blijven; een leerplan-JSON van vóór fase 2 komt ongewijzigd door de sanering.
- `courses.test.ts`: een cursusbestand met `kader` of `setAfdrukken` op de doelgroep verliest ze; zonder die velden verandert er niets (examples.test.ts blijft groen).
- Mutatieproef door de reviewer: wie de tak voor het nieuwe formaat weghaalt, laat test (1) falen.

### 22.4 F2.2 Gaten dichten vanuit de dekking

#### 22.4.1 Welke doelen

1. Alleen rijen van de dekking die op het scherm staat, met status `open`, `verplichteSet` waar en `optioneel` onwaar, elk (set, id) één keer, in de volgorde van het kader. Wat je ziet, is wat je krijgt.
2. Op de richtingpagina volgt het de keuze "Tel mee". Bij "Alleen het 4de jaar" zijn het de open doelen van de cursussen van dat jaar, en het venster zegt dat.
3. De leerkracht kiest per set (vakjes, standaard alles aan), niet per doel. Per doel bijsturen kan daarna in de cursus.
4. De selectie is per set altijd een lijst vaste nummers (F2-B6), ook als alle doelen van een volledige set open zijn. Dit pad gaat nooit langs `zetDoelen`, `bouwSetKeuzes` of een beperkte `kiesbaar`.

#### 22.4.2 (a) Een nieuwe cursus

1. Bij het openen een momentopname van de open doelen per set. De setbestanden komen uit de dekking (al geladen; `DekkingGegevens.bestanden`, zie I-A).
2. `keuzes = naarSetKeuzes(selectieVanOpen(…), bestanden)`. `ontbrekend` is normaal leeg (dezelfde bestanden); is het dat niet, dan wordt niets bewaard (melding "veranderd").
3. **Hergebruik:** `vindLeerplanMetSelectie(getCurricula(), selectieVanKeuzes(keuzes), dg)` met de opslag op het moment van de klik. Twee keer hetzelfde gat plannen geeft hetzelfde leerplan.
4. Anders `leerplanUitSelectie(keuzes, { titel, oudeVersies, doelgroep: doelgroepBijRichting(info, kader, setIds) })`: zonder `volgtKader` (anders zou "Werk het leerplan bij" de lijst met de rest van de sets vullen, die een andere cursus al dekt), met `kader`, `kaderVolledig` en `setAfdrukken` over `setIds` (de sets met minstens één gekozen doel). Niet bevestigd: niets bewaren, eerste waarschuwing tonen.
5. `cursusVoorRichting({ titel, auteur: getPrefs().teacherName, doelgroep: doelgroepVan(info, keuze), leerplan, start: 'geraamte' })`. Het jaar komt van de pagina.
6. Bewaren met `bewaarNieuweGatenCursus` (§ 22.4.6), dan een toast en `/cursus/bewerk/<id>`. Beveiligd tegen dubbel klikken (een `gemaakt`-ref, zoals NieuweRichtingCursus).

**Titels** (hoogstens 120 tekens, met `samenTitel`, dat richtingCursus.ts daarvoor exporteert):
- leerplan: "Aanvulling · " + `titelVoorRichtingLeerplan(info, kader, setIds)`, bv. "Aanvulling · Chemie · Natuurwetenschappen · 2de graad" of "Aanvulling · Chemie en 2 andere · Natuurwetenschappen · 2de graad";
- voorstel voor de cursus, één set: `voorstelCursusTitel({ ...dg, vak: '<setnaam>' })` = "Chemie · Natuurwetenschappen · 4de jaar"; meer sets: `voorstelCursusTitel({ ...dg, vak: 'Aanvulling' })` = "Aanvulling · Natuurwetenschappen · 4de jaar". De doelgroep van de cursus zelf krijgt geen vak.

#### 22.4.3 (b) Een bestaande cursus

1. **Kandidaten:** de cursussen die in de dekking op het scherm meetellen (`DekkingGegevens.bijdragen` met een leerplan) en waarvan het leerplan minstens één gekozen doel bevat, de meeste eerst (`cursussenVoorGaten`). Cursussen met 0 passende doelen staan niet als keuze in de lijst; het venster telt ze wel.
2. Per cursus: `codesVoorDoelen(leerplan, gekozen)`: strikt op set + vast nummer (O6), per doel de code van het eerste leerplandoel dat ernaar verwijst. Werkt ook met een ingelezen leerplan van een net (via `refs`).
3. Bij de klik leest `bewaarGatenOpCursus` de cursus opnieuw (`getCourse`), controleert dat ze nog aan hetzelfde leerplan hangt, voegt de secties toe aan die verse versie (`voegGeplandeSectiesToe`) en bewaart met `saveCourseGuarded(nieuw, vers.updatedAt)` in één synchrone stap.
4. Daarna een toast; het venster sluit en de focus gaat naar `#ri-dekking-kop` (krijgt `tabIndex={-1}`). Door de opslagwijziging rekent de dekking opnieuw: de doelen staan op "gepland".

#### 22.4.4 Waarom (b) het leerplan nooit aanpast

1. Een leerplan wordt bewust gedeeld (`vindLeerplanMetSelectie`, het leerplan van de hele richting). Uitbreiden laat bij **elke** cursus die eraan hangt doelen als "nog niet behandeld" verschijnen, en het percentage op haar cursuskaart (`computeCoverage`) zakt stil.
2. Alleen een samengestelde lijst kan opnieuw samengesteld worden; `leerplanUitSelectie` gooit een `Error` bij elk ander leerplan. Uitbreiden zou dus per soort leerplan anders werken.
3. De keuze verandert: `volgtKader` valt weg (`doelgroepVanBestaand`) en daarmee verdwijnt "Werk het leerplan bij" stil.
4. Opnieuw samenstellen bouwt ook de teksten en labels van de bestaande doelen opnieuw uit de huidige setbestanden (`themaMet(labels…)`, `setLabels` hangt af van de andere sets), dus "puur toevoegen" is niet gewaarborgd.
5. Leerplan en cursus zijn twee schrijfacties zonder transactie; `saveCurriculum` heeft geen bewaking tegen een ander tabblad.

Wat de leerkracht dan doet: de doelen in een nieuwe cursus zetten (één klik in hetzelfde venster), of het leerplan bewust aanpassen via de link "Open het leerplan" (`/leerplannen?open=<id>`, bestaat: CurriculaPage r. 57), waar "Keuze aanpassen" staat. In de praktijk is het gewone geval van (b) een cursus die aan een groter leerplan hangt (bv. dat van de hele richting) en nog niet alle doelen op een sectie heeft: dat werkt altijd.

#### 22.4.5 In de cursuseditor

- Alleen in de weergave Minimumdoelen (`MinimumdoelenDekking.tsx`), alleen als `GoalCoverage` de nieuwe prop `onEdit` meekrijgt (CourseEditorPage geeft `onEdit={edit}`, met `edit = draft.edit`, dat een functie aanvaardt: r. 256 en 320).
- "Open" betekent in de editor: deze cursus dekt het niet. De editor plant dus alleen doelen die in het leerplan van de cursus staan en nog op geen enkele sectie staan. Een nieuwe cursus maken kan in de editor niet: dat zou dubbels geven met de andere cursussen van de richting. Daarvoor staat er een zin bij de bestaande link naar de richting.
- Een inline paneel in dezelfde weergave (geen genest venster): sets kiezen, dan "Zet ze in deze cursus". Bij de klik laadt de editor `gatenCursus` lui en roept `onEdit((c) => voegGeplandeSectiesToe(c, curriculum, codes).course)` aan. De functie draait op de laatste stand van de cursus; de bewaarmotor bewaart met zijn eigen bewaking en meldingen.

#### 22.4.6 Logica

```ts
// src/lib/gatenDichten.ts (nieuw, licht: alleen types en normalizeGoalCode; mag in het chunk van MinimumdoelenDekking)
export function openVerplichteDoelen(dekking: Pick<MdDekking, 'rijen'>): KaderDoel[];
export interface OpenSet { set: string; setNaam: string; doelen: KaderDoel[] }
export function openPerSet(doelen: readonly KaderDoel[]): OpenSet[];                         // volgorde van het kader
export function openNietVerplicht(dekking: Pick<MdDekking, 'rijen'>): number;                // voor de hint over optionele doelen
export function selectieVanOpen(open: readonly OpenSet[], sets: ReadonlySet<string>): Map<string, string[]>;  // altijd lijsten
export function codesVoorDoelen<T extends { set: string; id: string }>(leerplan: Curriculum, doelen: readonly T[]):
  { codes: string[]; inLeerplan: T[]; nietInLeerplan: T[] };                                 // codes genormaliseerd, uniek, in leerplanvolgorde
export interface Doelcursus { course: Course; leerplan: Curriculum; passend: number }
export function cursussenVoorGaten(doelen: readonly { set: string; id: string }[], bijdragen: readonly CursusBijdrage[]):
  { kandidaten: Doelcursus[]; zonderPassend: number };                                       // meeste passend eerst, dan titel (nl)

// src/lib/gatenCursus.ts (nieuw, zwaar: richtingCursus, doelenSamenstellen; alleen lui geladen)
export type GatenLeerplan =
  | { soort: 'hergebruik' | 'nieuw'; leerplan: Curriculum }
  | { soort: 'niet-nagekeken'; waarschuwing: string }          // al door zonderSetId
  | { soort: 'veranderd' };                                     // ontbrekend > 0 of een set zonder bestand
export function leerplanVoorGaten(o: { info: RichtingInfo; kader: RichtingKader; selectie: ReadonlyMap<string, readonly string[]>;
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>; curricula: readonly Curriculum[]; oudeVersies?: ReadonlySet<string> }): GatenLeerplan;
export function titelsVoorGaten(info: RichtingInfo, kader: RichtingKader, keuze: RichtingKeuze, setIds: readonly string[],
  setNamen: ReadonlyMap<string, string>): { cursus: string; leerplan: string };
export function voegGeplandeSectiesToe(course: Course, leerplan: Curriculum, codes: readonly string[]):
  { course: Course; toegevoegd: string[]; alOpCursus: string[]; hoofdstukken: number };
//  - codes die al op een sectie staan (ook een keuzesectie) → alOpCursus, niet opnieuw;
//  - de rest via geraamteHoofdstukken(leerplan, rest);
//  - een nieuw hoofdstuk met dezelfde titel als een bestaand (getrimd, toLocaleLowerCase('nl')) → zijn secties achteraan
//    in dat hoofdstuk; anders een nieuw hoofdstuk achteraan;
//  - INVARIANT: elk bestaand hoofdstuk, elke sectie en elk blok blijft diep gelijk en in dezelfde volgorde; nieuwe ids
//    (uid); er komen nooit keuzesecties bij; een nieuwe sectie bevat alleen de doelen-callout en telt dus als 'gepland'.
export interface GatenOpslag {
  saveCurriculum(c: Curriculum): boolean; deleteCurriculum(id: string): void; saveCourse(c: Course): boolean;
  getCourse(id: string): Course | undefined; saveCourseGuarded(c: Course, verwacht: number): GuardedSaveResult;
}
export function bewaarNieuweGatenCursus(o: { leerplan: Curriculum; nieuwLeerplan: boolean; cursus: Course }, opslag: GatenOpslag):
  { ok: true } | { ok: false; wat: 'leerplan' | 'cursus' };
//  eerst het leerplan (alleen als het nieuw is); lukt de cursus niet, dan wordt een nieuw leerplan weer gewist
export function bewaarGatenOpCursus(o: { courseId: string; leerplan: Curriculum; codes: readonly string[] }, opslag: GatenOpslag):
  | { ok: true; course: Course; toegevoegd: number }
  | { ok: false; reden: 'gewijzigd' | 'verwijderd' | 'mislukt' | 'ander-leerplan' | 'niets-te-doen' };
```

`DekkingGegevens` (RichtingDekking) krijgt `bijdragen`, `bestanden` en `kader` erbij (I-A): dezelfde berekening, geen tweede.

#### 22.4.7 Schermen en letterlijke teksten

**Richtingpagina, sectie "Wat je cursussen samen dekken"**, onder de samenvatting, alleen bij status klaar:

| Toestand | Tekst |
|---|---|
| Minstens één open verplicht doel | primaire knop met `PlannedIcon`: "Plan de 37 doelen die nog nergens aan bod komen" · enkelvoud: "Plan het doel dat nog nergens aan bod komt" |
| Geen enkel open verplicht doel | "Er zijn geen verplichte minimumdoelen meer die nergens aan bod komen." |

**Venster `GatenVenster.tsx`** (lui geladen bij de klik; Modal, titel als h2):

| Waar | Tekst |
|---|---|
| Titel | "Plan wat nog nergens aan bod komt" |
| Intro | "Boosterz zet de gekozen doelen als lege secties in een cursus, met de doelcodes erop. Zo staan ze gepland; daarna werk je ze zelf uit. Een AI-sleutel heb je niet nodig." |
| Hint | "Doelen die al gepland staan of alleen in verdieping aan bod komen, blijven waar ze staan." |
| Alleen als `openNietVerplicht > 0` | "De 4 optionele doelen en uitbreidingsdoelen die nog nergens aan bod komen, zitten er niet in." · enkelvoud: "Het optionele doel of uitbreidingsdoel dat nog nergens aan bod komt, zit er niet in." |
| Bij "Tel mee: alleen het jaar" | "Je telt nu alleen de cursussen van het 4de jaar." |
| fieldset | legend "Welke doelen?" · hint "Vink uit wat in een andere cursus thuishoort." · per set een vakje "Chemie · 9 doelen" / "Chemie · 1 doel" (setnaam via `setNamenVan`, nooit een set-id) · `details` met summary "Toon de doelen" en per doel "<code> — <korte tekst>" |
| Teller (`aria-live="polite"`) | "Je koos 21 doelen uit 3 sets." · "Je koos 9 doelen uit 1 set." · "Je koos 1 doel uit 1 set." · "Je koos nog geen doelen." |
| fieldset | legend "Waar komen ze?" · radio "In een nieuwe cursus" (standaard) · radio "In een cursus die je al hebt" |
| Geen kandidaat | de tweede radio op `aria-disabled`, met de hint "Geen cursus van deze richting heeft een van de gekozen doelen in haar leerplan. Maak er een nieuwe cursus voor, of pas eerst het leerplan van een cursus aan bij Leerplannen." |
| Bij "In een nieuwe cursus" | Field "Titel van de cursus" (met voorstel) · hint "Boosterz maakt er een nagekeken leerplan bij met precies deze doelen, of gebruikt het leerplan dat er al is." |
| Bij "In een cursus die je al hebt" | fieldset legend "Welke cursus?" · per kandidaat een radio "<titel>" met de meta "4de jaar" of "hele graad" en "<k> van de <n> gekozen doelen staan in haar leerplan" (enkelvoud: "1 van de <n> gekozen doelen staat in haar leerplan") |
| Onder de lijst, als `zonderPassend > 0` | "3 andere cursussen van deze richting hebben geen van deze doelen in hun leerplan." · enkelvoud: "1 andere cursus van deze richting heeft geen van deze doelen in haar leerplan." |
| Voorbeeldzin (`aria-live`), k = n | "Alle 21 gekozen doelen staan in het leerplan van ‘Biologie 4de jaar’. Ze komen er als lege secties bij; wat al in de cursus staat, blijft zoals het is." |
| Voorbeeldzin, k < n | "17 gekozen doelen staan niet in het leerplan van ‘Biologie 4de jaar’ en komen er niet bij: Boosterz past een leerplan nooit zelf aan." met de link "Open het leerplan" en daarna "of kies ‘In een nieuwe cursus’." |
| Knoppen | "Annuleren" · primair "Maak de cursus" / "Zet ze in deze cursus" (bij één gekozen doel "Zet het in deze cursus") / bij k < n "Zet de 4 doelen in deze cursus" (enkelvoud "Zet het doel in deze cursus") |
| Voet (`voetTekst` + `zegOntbreekt`, `aria-disabled`) | "Nog nodig: minstens één doel en een titel." · "Nog nodig: minstens één doel en een cursus." (zoals `zegOntbreekt` het elders schrijft) |
| Fouten (`callout err`, focus erheen) | "Deze doelen staan al op een sectie van deze cursus. Er is niets veranderd." · "Het leerplan kon niet als nagekeken bewaard worden: <eerste waarschuwing>. Er is niets bewaard." · "De sets zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard." · "Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd." · "Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw." · "Deze cursus bestaat niet meer. Er is niets veranderd." · "Deze cursus hangt intussen aan een ander leerplan. Er is niets veranderd. Probeer opnieuw." |
| Gelukt (a) | toast "Cursus gemaakt: 3 hoofdstukken, 21 doelcodes klaar op de secties." en bij hergebruik erachter " Er stond al een leerplan met precies deze doelen: de cursus hangt daaraan." Daarna de editor. |
| Gelukt (b) | toast "21 doelen staan nu gepland in ‘Biologie 4de jaar’." · enkelvoud "1 doel staat nu gepland in ‘Biologie 4de jaar’." |

De zin over de volle opslag herhaalt de melding van de opslaglaag niet (`reportWriteFailure` meldt die zelf, zoals `bewaarFout('mislukt')` nu leeg is): ze zegt alleen dat er niets bewaard is.

**Cursuseditor** (`MinimumdoelenDekking.tsx`, alleen met `onEdit`, alleen bij een klare dekking):

| Waar | Tekst |
|---|---|
| Regel | "3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie." · enkelvoud: "1 doel uit het leerplan van deze cursus staat nog op geen enkele sectie." |
| Knop | "Plan ze in deze cursus" · enkelvoud "Plan het in deze cursus" |
| Paneel (`role="group"`, h3 "Plan in deze cursus", focus erheen) | "Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is." · bij meer dan één set de fieldset "Welke doelen?" zoals in het venster; bij één set "Chemie · 3 doelen" · knoppen "Zet ze in deze cursus" en "Annuleren" |
| Andere open doelen | "12 andere doelen die deze cursus niet dekt, staan niet in haar leerplan." (enkelvoud "1 ander doel …, staat …") en, met een richting, vóór de bestaande link: "Wat geen enkele cursus behandelt, plan je bij de studierichting." |
| Toast | "3 doelen staan nu gepland in deze cursus." · fout bij het laden: "Dit kon niet geladen worden. Controleer je verbinding en probeer opnieuw." |

Of de wijziging bewaard is, toont de bewaarstatus van de editor, zoals bij elke bewerking. Na "Annuleren" of na het toevoegen gaat de focus terug naar de knop of naar de samenvatting.

Css: `src/styles/gaten.css` (voorvoegsel `gt-`), alleen tokens. Teksten met getallen in `src/lib/gatenWeergave.ts`.

#### 22.4.8 Tests (A2, B1)

- `gatenDichten.test.ts`: `openVerplichteDoelen` laat gepland, verdieping, optioneel en uitbreiding weg; `selectieVanOpen` geeft voor een volledige set waarvan alles open is een lijst; `codesVoorDoelen` strikt op set + id, een netleerplan met twee refs per doel, een andere versie van een set geeft `nietInLeerplan`; `cursussenVoorGaten` sorteert en telt `zonderPassend`, cursussen zonder leerplan vallen weg.
- `gatenCursus.test.ts` (met de hand nagerekend):
  - **valkuil**: een deelset van 4 van 13 geeft in het leerplan precies 4 doelen; een volledige set waarvan 3 van de 16 open zijn, geeft er 3;
  - het nieuwe leerplan: samengesteld, bevestigd, zonder `volgtKader`, met `setAfdrukken` voor precies de sets met een gekozen doel, zonder jaar;
  - hergebruik van een nagekeken leerplan met dezelfde selectie; geen hergebruik van een eigen kopie of een leerplan van een andere groep;
  - een ontbrekend setbestand of `ontbrekend > 0` geeft `veranderd`; meer dan 50 sets geeft `niet-nagekeken`;
  - `voegGeplandeSectiesToe`: het bestaande deel diep gelijk, samenvoegen op titel, achteraan, `alOpCursus`, geen dubbele code, `sanitizeCourse` laat alles staan, daarna geeft `dekkingMinimumdoelen` voor precies die doelen "gepland";
  - `bewaarNieuweGatenCursus` en `bewaarGatenOpCursus` met een nagebootste opslag: leerplan vol, cursus vol (nieuw leerplan gewist, hergebruikt leerplan blijft), `gewijzigd`, `verwijderd`, `ander-leerplan`, niets te doen;
  - titels ≤ 120 tekens, zonder set-id.
- `gatenWeergave.test.ts`: elke tekst in enkelvoud en meervoud, geen set-id.

### 22.5 F2.3 Mijn richtingen op `/cursussen/richtingen`

#### 22.5.1 Wat telt als "mijn"

- Een cursus via `doelgroepVanCursus` (haar doelgroep, anders die van haar leerplan). De functie verhuist puur naar `src/lib/doelgroepGebruik.ts`; `RichtingDoelen.tsx` exporteert ze daaruit verder, zodat bestaande imports blijven werken.
- Een klas via `ClassGroup.doelgroep` (F2.4).
- Eén rij per `groep|soort`. 1A en 2A (G-0307 en G-0311) zijn twee rijen, gewoon en buitengewoon ook.
- Een richting met alleen een leerplan telt niet (V5).
- Volgorde: op titel (nl), dan op groepnummer; groepen die niet in de matrix staan achteraan.

#### 22.5.2 Hoe het licht blijft

1. **De rijen** komen zonder netwerk uit de opslag: titel uit de doelgroep (momentopname), zodra de matrix er is uit `info.groep.titel`; de tellers; de link. De lijstpagina laadt de matrix al.
2. **De dekking per rij** alleen voor een rij met minstens één cursus, alleen als de rij zichtbaar is (`IntersectionObserver`, `rootMargin: '200px'`; zonder IO meteen), en **één richting tegelijk** (een wachtrij op moduleniveau). Zo wisselen de 40 plaatsen van de cache van `laadSet` nooit tussen twee richtingen, en vraagt het netwerk hoogstens wat één bezoek aan het detail vraagt (±23 setbestanden). Een mislukte rij houdt de wachtrij niet op.
3. **Een samenvatting in het geheugen** (`src/lib/dekkingCache.ts`), sleutel `kaderGroepSleutel(info, soort)` (in de 1ste graad rekenen 1A en 2A zo één keer). Alleen getallen. Elke `onStorageChange` verhoogt een generatie en maakt alles ongeldig. Nooit in localStorage: geen oud getal na een herlading, geen risico bij een volle opslag.
4. **Het detail vult de cache** als het rekent met "Alle jaren van de graad". Wie terugkeert naar de lijst, ziet het getal meteen.
5. **Dezelfde getallen** als het detail: `DekkingKort` gebruikt `useRichtingKader`, `useRichtingDekking` (na I-A in een eigen bestand) met `telMee = 'alle'` en daarin `bijdragenVoorKader`. Het kader hangt niet van jaar of variant af (richtingKader.ts r. 457 tot 548: alleen groep en soort), dus de sleutel klopt.

Tijdens het laden staat er "De dekking wordt berekend…", ook bij rijen die wachten. Geen `aria-live` per rij (veel rijen zouden te veel voorlezen); de regel wordt voorgelezen als je erop komt.

#### 22.5.3 Logica

```ts
// src/lib/richtingOverzicht.ts (nieuw)
export function bijdragenVoorKader(o: { courses: readonly Course[]; curricula: readonly Curriculum[]; info: RichtingInfo;
  soort: SoortKeuze; matrix: MatrixBestand; vandaag: string; jaar?: number }): CursusBijdrage[];
//   precies de logica die nu inline in useRichtingDekking staat (RichtingDekking.tsx r. 104-115): hoort = zelfde
//   kaderGroepSleutel, met richtingInfo voor andere groepen; jaar = telJaar
export interface MijnRichting { sleutel: string; groep: string; soort: SoortKeuze; titel: string; graad?: 1 | 2 | 3;
  cursussen: number; klassen: number; jaren: number[] }
export function mijnRichtingen(o: { courses: readonly Course[]; curricula: readonly Curriculum[];
  klassen: readonly Pick<ClassGroup, 'doelgroep'>[] }): MijnRichting[];               // zonder matrix; titel = nieuwste momentopname
export function mijnRichtingMeta(r: MijnRichting): string;   // "2de graad · 3 cursussen (3de en 4de jaar) · 1 klas"
export function linkVoorRij(r: MijnRichting): string;        // ?jaar=<j> als alle doelgroepen één jaar delen; &soort=buso
export interface DekkingKortGetallen { totaal: number; gedekt: number; gepland: number; percent: number; eersteGraad: boolean }
export function kortVan(d: MdDekking, eersteGraad: boolean): DekkingKortGetallen;
export function dekkingRijZin(d: DekkingKortGetallen): string;
export function klasDekkingZin(richtingMetGraad: string, d: DekkingKortGetallen): string;   // F2.4

// src/lib/dekkingCache.ts (nieuw; abonneert zich bij het eerste gebruik op onStorageChange)
export function leesDekkingKort(sleutel: string): DekkingKortGetallen | undefined;
export function bewaarDekkingKort(sleutel: string, d: DekkingKortGetallen): void;

// src/components/richting/rijWachtrij.ts (nieuw, B2)
export function useBeurt(wil: boolean): { aanDeBeurt: boolean; klaar: () => void };   // één tegelijk, ook na een fout
```

```tsx
// src/components/richting/DekkingKort.tsx (stub in I-A met deze vaste props, echt in B2)
export interface DekkingKortProps {
  groep: string; soort: SoortKeuze;
  plaats: 'rij' | 'klas';       // 'rij' wacht op zichtbaarheid en beurt; 'klas' rekent meteen (in een open details)
  titel: string;                // voor de sr-only bij "Opnieuw proberen"
}
// laadt zelf de gegevens met useRichtingGegevens (gedeelde belofte) en vandaag() uit richtingLink.ts
```

#### 22.5.4 Scherm en letterlijke teksten

Het blok staat in RichtingLijst direct onder de kop, vóór "Hoe werkt dit?", alleen als er minstens één rij is (`src/components/richting/MijnRichtingen.tsx`).

| Waar | Tekst |
|---|---|
| h2 | "Mijn richtingen" |
| Hint | "De richtingen waarvoor je cursussen of klassen hebt op dit toestel, met wat je cursussen samen dekken." |
| Rij (`ul` > `li`, de link minstens 44 px hoog) | link met de titel "Natuurwetenschappen"; meta "2de graad · 3 cursussen (3de en 4de jaar) · 1 klas" · "1 cursus" · "nog geen cursus" · "2 klassen" · buitengewoon erachter "· buitengewoon (OV4)" · afgebouwd "· afgebouwd" |
| Dekking, bezig | "De dekking wordt berekend…" |
| Dekking, klaar | "Je cursussen dekken 9 van de 171 minimumdoelen (5 %)." met erbij " 4 staan gepland." (enkelvoud " 1 staat gepland.") |
| 1ste graad | erachter " Het 1ste en het 2de jaar tellen samen." |
| Geen cursus (alleen klassen) | "Nog geen cursus voor deze richting." (geen berekening) |
| Geen kader | "De officiële bron koppelt geen minimumdoelen aan deze richting." |
| Nog niet opgehaald | "De doelen van deze richting zijn nog niet opgehaald." |
| Fout | "De dekking kon niet berekend worden." met de knop "Opnieuw proberen" (sr-only " (Natuurwetenschappen)", 44 px) |
| Groep niet in de matrix | "Deze richting staat niet (meer) in de officiële matrix." (de rij is dan geen link) |
| Matrix nog niet in Boosterz | geen dekkingsregel: de bestaande melding `NogGeenData` zegt het al |

Nooit een groepnummer op het scherm. Op 390 px één kolom, lange titels breken af (`overflow-wrap: anywhere`). Css in `src/styles/mijnrichtingen.css` (`mr-`).

#### 22.5.5 Tests (A3, B2)

- `richtingOverzicht.test.ts`: een richting via de cursus, via het leerplan en via een klas; so en buso apart; 1A en 2A apart; jaren; sortering; meta in enkelvoud en meervoud; `linkVoorRij` met één jaar en gemengd; een ongeldige doelgroep valt weg; `kortVan`, `dekkingRijZin`, `klasDekkingZin`. **Regressie:** `bijdragenVoorKader` geeft op de fixture (ook de 1ste graad, ook met `jaar`) hetzelfde als de huidige inline berekening.
- `dekkingCache.test.ts`: lezen, bewaren, ongeldig na een opslagwijziging.
- `rijWachtrij.test.ts`: één tegelijk; de volgende krijgt de beurt na `klaar`, ook na een fout; een rij die verdwijnt geeft haar beurt terug.

### 22.6 F2.4 Een klas koppelen aan een richting en een jaar

#### 22.6.1 Datamodel en grenzen

```ts
// classTypes.ts
import type { Doelgroep } from './doelgroep';
export interface ClassGroup { /* … */ doelgroep?: Doelgroep }   // alleen via doelgroepVoorKlas
```

| Grens | Wat |
|---|---|
| `sanitizeClass` (classes.ts r. 72) | `const dg = doelgroepVoorKlas(c.doelgroep)` en `...(dg ? { doelgroep: dg } : {})`. Idempotent. Daarmee gedekt: `getClasses` (`wf.classes.v1`), `sanitizePack` (klaspakket als link en als `.klaspakket.json`, classPack.ts r. 107) en `readPacks` (opslag bij de leerling, `wf.classpacks.v1`, r. 295). |
| `saveClass`, `buildClassPack` | spreiden het object: het veld reist vanzelf mee. Geen formaatversie omhoog (v blijft 1). `classPack.ts` verandert niet. |
| Export en import | een klas reist alleen via het klaspakket; er is geen andere export van klassen (`wf.classes.v1` wordt alleen in classes.ts gelezen en in storageHealth.ts geteld). De CSV-export gaat over leerlingen en krijgt het veld niet. |
| Bij de leerling | het veld staat in `wf.classpacks.v1` en wordt nergens getoond. Het is geen persoonsgegeven: een groepnummer, een titel uit de matrix, een jaar. |
| Klaskanaal (concept) | een `pack` gaat als blob mee (`src/lib/sync/types.ts`, `packHash`), dus er is niets apart nodig. Eén zin in `docs/KLASKANAAL.md` § 4.2: "Het klaspakket draagt ook `klas.doelgroep` (studierichting en jaar, geen persoonsgegevens)." |
| Oudere app-versie | saneert het veld weg; wie vanuit een oud tabblad een klas bewaart, verliest de keuze van de richting (R7). |
| Opdrachten (`Assignment`) | ongewijzigd |

#### 22.6.2 Logica

```ts
// src/lib/doelgroepGebruik.ts (nieuw, licht: alleen doelgroep.ts en types)
export function doelgroepVanCursus(course: Pick<Course, 'doelgroep' | 'curriculumId'>,
  curricula: readonly Pick<Curriculum, 'id' | 'doelgroep'>[]): Doelgroep | undefined;     // verhuisd uit RichtingDoelen.tsx r. 58, zelfde gedrag
export function pastBijKlas(klas: Doelgroep, cursus: Doelgroep): boolean;
//   zelfdeRichting (groep en soort), en het jaar ontbreekt bij één van beide of is gelijk; 1A en 2A passen dus niet
export function cursussenVoorToewijzen(courses: readonly Course[], curricula: readonly Curriculum[], klas?: Doelgroep):
  { passend: Course[]; andere: Course[] };              // passend: eerst hetzelfde jaar, dan zonder jaar; binnen elk de volgorde van courses
export function klassenVoorToewijzen(classes: readonly ClassGroup[], cursus?: Doelgroep): { passend: ClassGroup[]; andere: ClassGroup[] };
export function klassenVanRichting(classes: readonly ClassGroup[], groep: string, soort: 'so' | 'buso'): ClassGroup[];  // op jaar, dan naam

// src/lib/classes.ts, sectie "Studierichting van een klas"
export function zetKlasRichting(classId: string, d: Doelgroep | undefined): 'ok' | 'weg' | 'mislukt';
//   leest de klas opnieuw (getClass), zet of wist alleen `doelgroep` (via doelgroepVoorKlas) en bewaart met saveClass
```

#### 22.6.3 Wat het oplevert

1. **Klasoverzicht** (`/klas/:id`, ClassDashboardPage): een sectie "Studierichting" na "Opdrachten". De richting kiezen met het bestaande `RichtingKiezerModal`, lui geladen zoals in de cursusinstellingen (CourseEditorPage r. 1090-1106). Met een richting: de cursussen van die richting (`KlasRichting.tsx`), elk met "Staat in deze klas" of de knop "Toewijzen", die "Opdracht toevoegen" opent met die cursus al gekozen (nieuwe prop `voorgekozen` op `NewAssignmentModal`). Op vraag (`details`) de dekking van de richting (`DekkingKort`, plaats `klas`): zo laadt de matrix (1,37 MB, 63 kB gzip) niet bij elk bezoek aan de klas.
2. **"Opdracht toevoegen"** (`NewAssignmentModal`): met een klasrichting en minstens één passende cursus krijgt de keuzelijst twee `optgroup`'s. Er wordt niets vooraf gekozen, behalve via `voorgekozen`.
3. **Toewijzen vanuit een cursus** (`AssignToClassSection` in ShareModal.tsx): een optionele prop `doelgroep`, die `CourseShareModal` berekent met `doelgroepVanCursus(course, getCurricula())`. De passende klassen staan bovenaan in een eigen `optgroup`. ShareModal importeert zelf geen curriculum.ts. Geen voorkeuze (bestaand gedrag blijft: alleen bij precies één klas).
4. **Richtingpagina**: een sectie "Klassen van deze richting" (`RichtingKlassen.tsx`) na "Cursussen voor deze richting".
5. **Mijn klassen** (ClassesPage): de richting achter de klascode-regel.
6. **Mijn richtingen** telt de klassen mee (F2.3).

#### 22.6.4 Schermen en letterlijke teksten

**ClassDashboardPage, `section` met h2 "Studierichting"**

| Toestand | Tekst en knoppen |
|---|---|
| Geen richting | "Koppel deze klas aan een studierichting en een jaar. Dan zie je hier de cursussen van die richting, en bij ‘Opdracht toevoegen’ staan ze bovenaan." · knop "Kies een studierichting" |
| Met richting | vet "Natuurwetenschappen · 4de jaar" (`doelgroepTekst`) · knoppen "Wijzig" (sr-only " de studierichting") en "Geen richting" |
| Kiezer | titel "Studierichting van deze klas" · laadt hij niet: toast "De lijst met studierichtingen kon niet geladen worden. Controleer je verbinding en herlaad de pagina." (bestaande tekst) |
| Toasts | "Studierichting van ‘4NWA’: Natuurwetenschappen · 4de jaar." · "‘4NWA’ heeft geen studierichting meer." |
| Fouten (`callout err`) | "De studierichting kon niet bewaard worden: de opslag van dit toestel is vol of geblokkeerd." · "Deze klas bestaat niet meer op dit toestel." |
| Focus | na "Geen richting" naar "Kies een studierichting"; na het kiezen naar "Wijzig" |

**`KlasRichting.tsx`** (onder de richting, in dezelfde sectie)

| Waar | Tekst |
|---|---|
| h3 | "Cursussen voor deze richting" |
| Rij | link "<titel>" naar de editor · meta "4de jaar" of "hele graad" · badge "Staat in deze klas" of knop "Toewijzen" (sr-only " (<titel>)", 44 px) |
| Geen cursus | "Nog geen cursus voor deze richting op dit toestel." met de link "Maak er een bij de studierichting" (`richtingLinkNaar`) |
| `details` summary | "Toon wat je cursussen voor deze richting dekken" |
| Daarin | bezig "De dekking wordt berekend…" · klaar "Je cursussen voor Natuurwetenschappen (2de graad) dekken 9 van de 171 minimumdoelen (5 %)." · met de link "Bekijk per doel wat ze dekken" · de andere toestanden zoals in § 22.5.4 |

**Andere plaatsen**

| Waar | Tekst |
|---|---|
| NewAssignmentModal | `optgroup` "Voor Natuurwetenschappen · 4de jaar" en "Andere cursussen" · hint onder de keuzelijst "De cursussen voor de studierichting van deze klas staan bovenaan." |
| AssignToClassSection | `optgroup` "Klassen voor Natuurwetenschappen · 4de jaar" en "Andere klassen" (de richting van de cursus, `doelgroepTekst(d, { zonderVak: true })`) |
| ClassesPage | achter de klascode-regel: " · Natuurwetenschappen · 4de jaar" |
| Richtingpagina, h2 | "Klassen van deze richting" |
| Rij | link "<klasnaam>" naar `/klas/<id>` · meta "4de jaar · 22 leerlingen" of "Hele graad · 22 leerlingen" (enkelvoud "1 leerling") · "2 van de 3 cursussen van deze richting staan in deze klas." |
| Geen klas | "Nog geen klas met deze studierichting. Je kiest de studierichting van een klas in het klasoverzicht." met de link "Naar mijn klassen" |

Teksten met getallen in `src/lib/klasRichtingWeergave.ts`. Css in `src/styles/klasrichting.css` (`kr-`). Icoon `RichtingIcon` (bestaat; niet op het leerlingpad).

#### 22.6.5 Tests (A3, B3)

- `classes.test.ts`: `sanitizeClass` houdt een geldige doelgroep, laat vak, kader, `setAfdrukken`, `volgtKader` en onbekende sleutels weg, laat een ongeldige doelgroep weg, is idempotent; `saveClass` en `getClasses` houden het veld; `zetKlasRichting` houdt een klaslijst die intussen elders gewijzigd werd, geeft `weg` en `mislukt`.
- `classPack.test.ts`: heen en terug via link en bestand houdt `klas.doelgroep`; een geknutseld pakket met `__proto__` of een slecht groepnummer laat het veld weg; een pakket zonder veld blijft geldig; `readPacks` houdt het veld; naast `doelgroep` komt er geen enkel nieuw veld in het pakket.
- `doelgroepGebruik.test.ts`: `pastBijKlas` (jaar leeg of gelijk, andere soort, 1A tegenover 2A); de volgorde bij het toewijzen; `klassenVanRichting`; `doelgroepVanCursus` gelijk aan het oude gedrag.
- `klasRichtingWeergave.test.ts`: enkelvoud en meervoud.

### 22.7 Bundel

Gemeten op `dist` van de stand na I4 (kB = 1000 bytes).

| Chunk | Nu | Verwacht | Budget | Hoe |
|---|---|---|---|---|
| Kritiek pad (index + vendor) | 333,7 | 333,7 tot 333,9 | 334,2 | Geen gewijzigde module zit in de statische sluiting van het leerlingpad; JoinPage laadt classes lui (r. 33). `EAGER_ICON_NAMES` verandert niet. Groei kan alleen uit de preloadlijst (`__vite__mapDeps`) komen als een route er een nieuw statisch chunk bij krijgt: helpers staan daarom in bestaande of lichte modules, en elk B-pakket meet en meldt. |
| CourseEditorPage | 74,97 | ≤ 75,1 | 80 | alleen de prop `onEdit={edit}`; geen import van `gatenDichten` of `gatenCursus` |
| MinimumdoelenDekking (lui) | 10,6 | ±12,5 | 80 | `gatenDichten` (licht); `gatenCursus` pas bij de klik |
| GatenVenster + gatenCursus (lui, nieuw) | – | ±9 | 80 | pas bij de klik |
| RichtingenPage | 60,6 | ±66 | 80 | MijnRichtingen en RichtingKlassen inline; DekkingKort en het venster lui |
| DekkingKort (lui, gedeeld) | – | ±3 | 80 | lijst en klas |
| ClassDashboardPage | 23,7 | ±27 | 80 | sectie, KlasRichting en optgroups inline; kiezer en DekkingKort lui |
| classes | 9,7 | ±10 | 80 | `doelgroepVoorKlas` (doelgroep.ts heeft geen imports) |
| ShareModal | 11,1 | ±11,4 | 80 | optgroups; doelgroep als prop |

Overschrijdt het kritieke pad 334,2 kB, dan verplaatst de hoofdsessie eerst code; pas daarna een bewuste verhoging met een geschiedenisregel in `vite.config.ts` (V6). Alleen de hoofdsessie raakt `vite.config.ts` aan.

### 22.8 Toegankelijkheid, 390 px en taal (voor elk schermpakket)

- Geen eigen `main`; één h1 per scherm (bestaand); koppen in vensters zijn h2, in panelen h3.
- Vakjes en radio's in een fieldset met een legend; tellers en voorbeeldzinnen in `aria-live="polite"`; een status nooit alleen met kleur.
- Knoppen die nog niet kunnen: `aria-disabled` met "Nog nodig: …", nooit `disabled`.
- Focus na elke actie waarbij een knop verdwijnt: zoals per scherm beschreven.
- Knoppen, labels en rijen minstens 44 px op ≤ 640 px. Op 390 px één kolom, `overflow-wrap: anywhere`, niets horizontaal scrollen.
- Nooit een set-id of groepnummer op het scherm: setnamen via `setNamenVan` en `veiligeSetNaam`, waarschuwingen via `zonderSetId`. Termen uit CLAUDE.md: leerplan, toewijzen, bewaren. Css alleen met tokens; nooit witte tekst op `--brand`.

### 22.9 Rooktest, sectie 20f (op de fixtures, na 20e en vóór "21. Importeren")

`rtOpen('20f', { fixtures: true })`, verse opslag, tot slot "Terug zoals het was".

1. `/cursussen/richtingen` heeft geen h2 "Mijn richtingen".
2. Via het detail van G-0193 (`?jaar=4`) "Maak een cursus voor deze richting", vak "Biologie", met een geraamte. Terug naar de lijst: h2 "Mijn richtingen", een link `#/cursussen/richtingen/G-0193?jaar=4` met "Natuurwetenschappen" en /1 cursus/, binnen 15 s /Je cursussen dekken \d+ van de \d+ minimumdoelen \(\d+ %\)\./; op 390 px niets horizontaal, de rij minstens 44 px.
3. Detail: de knop /Plan de \d+ doelen die nog nergens aan bod komen/; venster-h2 "Plan wat nog nergens aan bod komt". Alleen het eerste vakje laten staan, de teller /Je koos (\d+) doel(en)? uit 1 set\./ geeft n. "In een cursus die je al hebt" staat op `aria-disabled` met /Geen cursus van deze richting heeft een van de gekozen doelen/ (het Biologie-leerplan bevat ze niet). "Maak de cursus" → `/cursus/bewerk/`. In localStorage: een nieuw leerplan, samengesteld en gecontroleerd, `doelgroep.groep` G-0193, exact n refs allemaal in die ene set, geen `volgtKader`, `doelgroep.setAfdrukken` met precies die set als sleutel en een waarde op /^[0-9a-f]{16}$/; de cursus heeft jaar 4 en secties met goalCodes. Terug op het detail: het aantal geplande doelen steeg met precies n.
4. Een tweede cursus via "Alle minimumdoelen van de richting" en "Met een lege cursus". Venster: alle vakjes aan, "In een cursus die je al hebt", die cursus; de voorbeeldzin /Alle \d+ gekozen doelen staan in het leerplan van/; "Zet ze in deze cursus" → toast /staan nu gepland in/. In localStorage: het eerste hoofdstuk van die cursus diep gelijk aan vroeger, nieuwe hoofdstukken achteraan met goalCodes, het leerplan ongewijzigd (zelfde id en `updatedAt`). Op het detail: "Er zijn geen verplichte minimumdoelen meer die nergens aan bod komen."
5. Editor: een cursus via "Kies de sets voor deze cursus" (Biologie) met een lege cursus; Doelendekking → Minimumdoelen → /\d+ doelen uit het leerplan van deze cursus staan nog op geen enkele sectie/ → "Plan ze in deze cursus" → "Zet ze in deze cursus" → toast /staan nu gepland in deze cursus/; een sectie met de callout "Doelen in deze sectie"; de dekking toont "gepland".
6. F2.1: bij Leerplannen "Keuze aanpassen" (zonder richting) op het leerplan van de hele richting: één doel erbij in een deelset en een andere set weg, bewaren. Het detail toont **geen** /De officiële koppeling van deze richting is veranderd/.
7. Klas: `/klassen` → nieuwe klas "Proefklas 4NW" → "Kies een studierichting", zoeken "natuurwet", Natuurwetenschappen, "4de jaar", "Kies deze richting". De sectie toont "Natuurwetenschappen · 4de jaar"; `wf.classes.v1` heeft `doelgroep` {groep G-0193, jaar 4, soort so} zonder vak, kader of `setAfdrukken`. "Toewijzen" bij een cursus opent "Opdracht toevoegen" met die cursus gekozen; "Toevoegen"; de rij toont "Staat in deze klas". "Opdracht toevoegen" heeft `optgroup[label="Voor Natuurwetenschappen · 4de jaar"]`. Het detail van G-0193 toont "Klassen van deze richting" met een link naar `#/klas/<id>`; Mijn richtingen toont /1 klas/. De klaslink ("Klaslink & pakket") gedecodeerd in Node met lz-string: `klas.doelgroep.groep === 'G-0193'` en geen `vak`.
8. Op 390 px: het detail met het venster, de lijst met Mijn richtingen, de klas met de sectie; elk scherm 1 main en 1 h1; de nieuwe knoppen minstens 44 px.
9. Geen console- of paginafouten. Twee keer na elkaar groen.

Sectie 20e (echte data) krijgt alleen regex-checks voor stap 2 en 3 op G-0193.

### 22.10 Hulp en docs (I-B)

**HelpPage.tsx**, twee vragen:
- "Hoe plan ik wat mijn cursussen nog niet dekken?" — "Open je studierichting bij Cursussen, ‘Voor een studierichting’. Onderaan, bij ‘Wat je cursussen samen dekken’, kies je ‘Plan de … doelen die nog nergens aan bod komen’. Je zet ze in een nieuwe cursus of in een cursus die je al hebt. Ze komen er als lege secties met de doelcodes op; daarna werk je ze zelf uit. Een AI-sleutel heb je daarvoor niet nodig."
- "Kan ik een klas aan een studierichting koppelen?" — "Ja. Open de klas en kies bij ‘Studierichting’ de richting en het jaar. Je ziet dan de cursussen van die richting, en bij ‘Opdracht toevoegen’ staan die cursussen bovenaan."

**Docs:** in STUDIERICHTINGEN.md een rij "Fase 2 (§ 22)" in de stand van zaken bovenaan; § 11.2: de bekende beperking is opgelost voor leerplannen met `setAfdrukken` (verwijzing naar § 22.3); § 21: "een richting op een klas" en "een cursus voor wat nog niet gedekt is" gaan naar fase 2. KLASKANAAL.md: één zin (A3). CLAUDE.md: geen wijziging (de verwijzing naar STUDIERICHTINGEN.md volstaat; het werkwijzeblok blijft onaangeroerd).

### 22.11 Risico's

| # | Risico | Opvang |
|---|---|---|
| R1 | Een leerplan van vóór fase 2 houdt de bekende beperking | Bewust (F2-B3). De wizard meldt wat hij niet aanvinkt; bij de eerste bewaring met de richting komt het nieuwe formaat. Het gaat om leerplannen van 9 en 10 oktober. |
| R2 | Een oudere app-versie bewaart een leerplan en laat `setAfdrukken` weg | `kader` en `kaderVolledig` blijven geschreven: de oude regel geldt, zonder valse melding door het nieuwe veld. |
| R3 | Binnen een set die echt veranderde, telt een eigen extra doel als vervallen | Huidig gedrag bij een echte verandering, vastgelegd in § 22.3.4. |
| R4 | Gaten: stil `'alle'` (§ 9.5) | Altijd lijsten, geen pad langs `zetDoelen`/`bouwSetKeuzes`, een regressietest. |
| R5 | Gaten: een gedeeld leerplan verandert | (b) past een leerplan nooit aan; (a) maakt een nieuw leerplan of hergebruikt er een met precies dezelfde doelen. |
| R6 | (a): leerplan bewaard, cursus niet | Een nieuw leerplan wordt weer gewist; een hergebruikt blijft. Getest met een nagebootste opslag. |
| R7 | Een oud tabblad bewaart een klas en laat `doelgroep` weg | Kleine kans, gevolg alleen de keuze van de richting; staat in de docs. |
| R8 | Meer opslag door aanvullingsleerplannen | Hergebruik; alleen open doelen (±310 B per doel); de titel "Aanvulling · …" maakt opruimen makkelijk. |
| R9 | Kost van Mijn richtingen | Alleen zichtbare rijen met een cursus, één tegelijk, samenvatting in het geheugen, het detail vult ze; per rij hoogstens één bezoek aan het detail. |
| R10 | De matrix laadt in de klas | Alleen met een klasrichting én pas bij het openen van de dekking; gedeelde belofte en service worker. De lijst met cursussen heeft geen matrix nodig. |
| R11 | Overzicht en detail tonen andere getallen | Dezelfde functies (`bijdragenVoorKader`, `useRichtingDekking`), een regressietest en een rookcheck. |
| R12 | Een nieuw gedeeld chunk doet de preloadlijst van de hoofdbundel groeien | Lichte modules, luie imports pas bij een klik, meting na elk B-pakket. |
| R13 | Een hoofdstuktitel die toevallig gelijk is | De secties komen dan in dat hoofdstuk; zichtbaar en makkelijk te verplaatsen. |
| R14 | De editor heeft geen "ongedaan maken" | Eerst sets kiezen in het paneel; alleen toevoegen, nooit iets wijzigen. |
| R15 | De klasdekking gaat over de hele richting, niet over wat de klas kreeg | De zin noemt "je cursussen voor <richting>"; per klas is V4. |

### 22.12 Open vragen voor de eigenaar (met werkkeuze)

- **V1.** Moet "Plan" ook doelen meenemen die al gepland staan of alleen in verdieping aan bod komen? **Werkkeuze: nee, alleen wat nergens aan bod komt.**
- **V2.** Mag Boosterz bij "In een cursus die je al hebt" het leerplan van die cursus zelf uitbreiden? **Werkkeuze: nee. Wat niet in het leerplan staat, komt er niet bij; het venster wijst naar "Open het leerplan" en naar een nieuwe cursus.**
- **V3.** Moeten leerplannen van vóór fase 2 bij de eerste "Keuze aanpassen" hun oude afdruk "vastpinnen" (ontwerp "risico eerst")? **Werkkeuze: nee; ze krijgen het nieuwe formaat bij de eerste bewaring met de richting.**
- **V4.** Dekking in de klas: over de hele richting, of alleen over de cursussen die de klas als opdracht kreeg? **Werkkeuze: de hele richting, op vraag, met dezelfde getallen als de richtingpagina. Per klas: later.**
- **V5.** Moet Mijn richtingen ook richtingen tonen met alleen een leerplan, zonder cursus of klas? **Werkkeuze: nee.**
- **V6.** Mag het budget van het kritieke pad bewust tot ±334,6 kB als een nieuw chunk de preloadlijst doet groeien? **Werkkeuze: ja, gemeten en met een geschiedenisregel, maar eerst code verplaatsen.**
- **V7.** Blijven we `kader` en `kaderVolledig` schrijven naast `setAfdrukken`? **Werkkeuze: ja (±130 tekens per leerplan); opruimen is een latere beslissing.**
- **V8.** Een AI-start in het venster van de gaten? **Werkkeuze: nee; de AI kan daarna op de cursus zelf.**
- **V9.** Toewijzen op de exacte richting, zodat 1A en 2A niet door elkaar lopen? **Werkkeuze: ja.**
- **V10.** Moet het klasoverzicht zelf een richting voorstellen op basis van de cursussen die de klas al kreeg? **Werkkeuze: niet in fase 2.**

### 22.13 Bewust niet in fase 2

- Een leerplan uitbreiden vanuit de dekking (V2), en `saveCurriculumGuarded`.
- Een selectie per doel in de samenstelwizard (`?doelen=`).
- "Gepland" in `computeCoverage` (O1 blijft).
- Een richting kiezen bij het aanmaken van een klas; een richtingvoorstel uit de opdrachten (V10); een dekking per klas (V4).
- De dekkingssamenvatting in localStorage.
- Mijn richtingen voor leerplannen zonder cursus (V5).
- Vastpinnen van oude afdrukken (V3).
- Eén klik "Toewijzen" zonder het venster "Opdracht toevoegen".
- Beroepskwalificaties (O11).

## 23. Fase 3: beroepskwalificaties

*Ontwerp van 10 oktober 2026: de synthese van twee ontwerpen ("data eerst" en "leerkracht eerst"), gemaakt door een jurylid. De basis is het ontwerp "data eerst" voor de import, de poorten en het datamodel, en het ontwerp "leerkracht eerst" voor de bestandsindeling, de schermen en het geraamte. Elke bewering over bestaande code is nagekeken in de code (stand na commit 7635d62, fase 2 A1 klaar). Over de API geldt alleen wat in `docs/ONDERWIJS-API.md` § 1, § 2 en § 4 staat (ronde 6, run 38044584119, en ronde 7, run 38047507450). Waar een ontwerp de code verkeerd las of iets miste, staat de juiste lezing in § 23.14. Wat de API nog niet toonde, staat in § 23.3: het ontwerp is daar tolerant, en de eerste echte run bevestigt de vorm (regel 11).*

### Stand van zaken fase 3

Fase 3 start pas na fase 2 (na I-C, zie § 22). Tot dan wacht alles.

| Wat | Stand | Op wie |
|---|---|---|
| Q0 Ontwerp in de repo (§ 23, bijlage E, rij in de stand bovenaan, één regel in CLAUDE.md), icoon, uittreksel van de runs van ronde 6 en 7 | **Klaar** (10 oktober 2026): `BeroepIcon`, regel in CLAUDE.md, uittreksel in `tests/fixtures/kwalificaties/api/ruw/` (de logregels van beide runs: vorm en proeven, geen volledige antwoorden, want de artifacts zijn vanuit de cloudsessie niet te downloaden) | hoofdsessie |
| K1 Datamodule `beroepskwalificaties.ts` en API-hulp `onderwijsApi.mjs` | Wacht: start na fase 2, na Q0 | kernbouwer |
| K2 Ophaalscript, fixtures en scripttest | Wacht: na K1 | kernbouwer |
| K3 Datatest | Wacht: na K1, levert op na K2 | bouwer (een andere agent dan die van K2) |
| K4 Workflow "Leerplangegevens bijwerken" | Wacht: na K1 (naast K2) | bouwer, nagelezen door een reviewer (veiligheid) |
| K5 Datamodel van het leerplan (`bkRefs`, `bkVersies`, methode, vingerafdruk) | Wacht: start na fase 2, na Q0 (naast K1) | kernbouwer |
| I1 Integratie van de data en het datamodel | Wacht: na K1 tot K5 | hoofdsessie |
| G1 Eerste echte run in stappen | Wacht: na I1 | hoofdsessie |
| K6 Lader, BK-kader van een richting, BK-leerplan en nakijkpoort | Wacht: na I1 | kernbouwer |
| K7 Geraamte, dekking en teksten | Wacht: na K6 | bouwer |
| I2 Integratie van de logica, hook en stubs | Wacht: na K7 | hoofdsessie |
| S1 Sectie "Beroepskwalificaties" en kopregel | Wacht: na I2 (worktree A) | bouwer |
| S2 Venster "Nieuwe cursus" met competenties | Wacht: na I2 (worktree B) | bouwer |
| S3 Dekking, leerplanpagina en leerplannenlijst | Wacht: na I2 (worktree C) | bouwer |
| I3 Integratie van de schermen, hulp, budget en docs | Wacht: na S1 tot S3 | hoofdsessie |
| R1 Rooktest 20g (fixtures) en 20h (echte data) | Wacht: na I3 en G1 | bouwer (een andere agent dan S1 tot S3) |
| I4 Review, rechter, herstel en uitrol | Wacht: na R1 en na de data-PR van G1 stap 3 | hoofdsessie, reviewers, rechter |
| Licentie en naamsvermelding van de BK-gegevens, vragen aan TechLoket (§ 23.10) | Wacht | eigenaar |
| Open vragen W1 tot W15 (§ 23.12) | Wacht: de werkkeuze geldt tot de eigenaar beslist | eigenaar |

### 23.1 In het kort

**Het scenario.** Een praktijkleerkracht van het 5de jaar Onthaal en recreatie (G-0393, 3de graad, A) opent de richting bij Cursussen, "Voor een studierichting". Onder de titel staat al: "Beroepskwalificaties: Onthaalmedewerker en Recreatief medewerker." Bij de kaart "Onthaalmedewerker" klikt ze op "Maak een cursus met deze competenties". Het venster staat ingevuld: de titel, de 12 competenties aangevinkt, "Met een geraamte". Ze klikt op "Maak de cursus". Ze krijgt een nagekeken leerplan en een cursus met een sectie per competentie. Op elke sectie staan de doelcode, de competentie en de kennis en vaardigheden. Ze ziet nergens een set-id, groepnummer, ADV-nummer of competentiecode, en heeft geen AI-sleutel nodig.

| Onderdeel | Wat de leerkracht merkt | De kern |
|---|---|---|
| **Import** | Bij een richting staan de beroepskwalificaties met hun competenties, kennis en vaardigheden. Ze worden elke maand bijgewerkt. | Een nieuw script in dezelfde workflow en dezelfde pull request. Het haalt het detail van elk geldig structuuronderdeel op (833) en daarna het detail van elke gekoppelde BK-versie (geschat 250 tot 450). Het schrijft één map `public/leerplannen/kwalificaties/`: een koppeling, een index en één bestand per BK-versie met een versiemerk. Harde poorten stoppen elke onbetrouwbare update. Er wordt niets gewist. De twee bestaande scripts blijven byte voor byte gelijk. |
| **Datamodel** | Een competentie is een gewoon doel in een leerplan, met een doelcode zoals "BK-0390-2.03". Het leerplan is "Nagekeken" door de officiële bron. | Een eigen soort leerplan (methode `beroepskwalificatie`, net `beroepskwalificaties`). Elk doel verwijst via een **apart veld `bkRefs`** naar één competentie. `refs` blijft alleen voor minimumdoelen. Bestaande leerplannen, hun vingerafdruk, hun nakijkstatus en de dekking op minimumdoelen veranderen niet: een gouden test bewaakt dat. `Doelgroep` verandert niet. |
| **Richtingpagina** | Een kopregel onder de titel en een sectie "Beroepskwalificaties" met een kaart per beroepskwalificatie, de knoppen "Maak een cursus met deze competenties" en "Bewaar als leerplan", en eerlijke meldingen als de bron veranderde. | Lui geladen, en alleen bij een richting die beroepskwalificaties kan hebben (finaliteit A of DU, 7de jaar, aanloopjaar, BuSO, niet afgebouwd). Bij doorstroomfinaliteit en in de 1ste graad gaat er geen verzoek uit en verandert er niets. |
| **Venster "Nieuwe cursus"** | Een vierde keuze: "De competenties van een beroepskwalificatie", met per competentie een vakje. | Een eigen bouwfunctie en een eigen nakijkpoort. Het geraamte heeft een hoofdstuk per beroepskwalificatie en een sectie per competentie. |
| **Dekking** | In "Wat je cursussen samen dekken" een tweede blok "Competenties van de beroepskwalificaties", met een percentage per beroepskwalificatie. | Dezelfde functie `dekkingMinimumdoelen`, met één nieuwe optionele parameter die zegt welke verwijzingen tellen. Zonder die parameter is het resultaat byte voor byte hetzelfde als nu. |

**Nooit stil.** Een nieuwe BK-versie of een tekstcorrectie verandert een bewaard leerplan nooit vanzelf. De app meldt het, en de leerkracht beslist met een klik. De doelcode bevat de versie, zodat een code nooit naar een competentie van een andere versie kan wijzen.

### 23.2 Beslissingen

| # | Beslissing | Waarom |
|---|---|---|
| F3-B1 | **Een nieuw script**, `tools/leerplannen/haal-beroepskwalificaties.mjs`, als derde ophaalstap in dezelfde run en dezelfde pull request. `haal-minimumdoelen.mjs` en `haal-studierichtingen.mjs` blijven byte voor byte gelijk. De API-hulp komt in een nieuw `tools/leerplannen/onderwijsApi.mjs` met een eigen test; alleen het nieuwe script gebruikt het. | Eén momentopname en één poort (B3). Het script van de studierichtingen telt al 1501 regels en heeft strenge reproductietests. Een apart script isoleert het risico. |
| F3-B2 | Het script vraagt het **detail van alle geldige onderdelen** op (nu 833), niet alleen van A en DU (510 met BuSO en aanloop). BK-versies haalt het alleen op voor erkenningen die vandaag gelden of later beginnen. | We nemen niet aan welke finaliteit beroepskwalificaties heeft (regel 11). Het kost ±323 oproepen extra (±3 tot 4 minuten). Het rapport toont of DO en de 1ste graad er echt geen hebben. |
| F3-B3 | **Eén eigen map** `public/leerplannen/kwalificaties/`: `koppeling.json`, `index.json` en `bk/BK-0390-2.json`. Versiemerk (`sha256`) per BK-bestand, in de index. De koppeling draagt geen versiemerk per BK. | Eén map is eenvoudig voor de datatest, de rooktest (één `page.route`) en de structuurfixtures, die niet veranderen. De koppeling noemt alleen versienummers; een versiemerk erin zou bij elke tekstcorrectie ook de koppeling doen veranderen, zonder nut. |
| F3-B4 | **Niets wissen.** Een BK-bestand en een record in de koppeling blijven altijd staan. Wat niet meer gekoppeld is, krijgt `nietMeerGekoppeld`; wat twee keer 404 geeft, krijgt `nietMeerInBron`. | Bestaande leerplannen blijven nakijkbaar en tonen hun competenties. De massaverliespoort vangt een kapot eindpunt. |
| F3-B5 | Het script **volgt nooit** een `api_url`, een `curriculumdossier`-adres of een doorverwijzing. Elk adres wordt gebouwd uit een gevalideerd nummer. De sleutel gaat alleen naar de origin van `ONDERWIJSDOELEN_API_BASE`. | Zo komt de sleutel nergens anders, en kan een antwoord geen ander pad laten aanroepen. |
| F3-B6 | De **lijst van alle beroepskwalificaties** (604) is een zachte bron: ze dient alleen voor "er bestaat een nieuwere erkende versie" en voor kruiscontroles. Een onvolledige lijst is een waarschuwing, geen stop. | De lijst is niet nodig voor de koppeling of de competenties. Een harde poort op een bijzaak maakt de hele maandelijkse update breekbaar. |
| F3-B7 | Verwijzing via een **apart veld `bkRefs`** (`{bk, id}`), niet via `refs` en niet als "set". `bkRefs` blijft bij het saneren alleen staan op een leerplan met methode `beroepskwalificatie`. | `refs` en sets betekenen overal "minimumdoel" (§ 23.6.1). Met de beperking kan een leerplan van een net of van de AI geen BK-verwijzing dragen die niemand nakijkt. |
| F3-B8 | Een BK-leerplan is een **eigen soort** en is **nooit gemengd** met minimumdoelen. | Elk pad dat een samengestelde lijst opnieuw opbouwt ("Keuze aanpassen", "Werk het leerplan bij", gaten dichten), slaat een BK-leerplan zo vanzelf over (`methode !== 'samengesteld'`). Een gemengd leerplan kan later (W1). |
| F3-B9 | De **doelcode** is de BK-versie, een punt en het volgnummer met minstens twee cijfers: "BK-0390-2.03". Het volgnummer is `nr` als elke competentie van het bestand een uniek geheel `nr` heeft, anders de plaats in het bestand. Een competentiecode komt nooit in een doelcode. | Uniek in een leerplan met meer beroepskwalificaties, gebouwd uit officiële nummers, en met de versie erin kan een code nooit stil naar een competentie van een andere versie wijzen. De terugval op de plaats houdt de competentiecode van het scherm. |
| F3-B10 | **Kennis en vaardigheden niet in het leerplan**, wel in het geraamte van een nieuwe cursus (een tweede doelen-callout, ingekort en begrensd). Op de richtingpagina staan ze altijd volledig. | Een doel blijft kort (±300 B), zodat het leerplan nakijkbaar blijft. In het geraamte ziet de leerkracht wat ze in de sectie moet uitwerken. Een doelen-callout houdt de sectie op "gepland". |
| F3-B11 | **Nieuwe BK-versie: een nieuw leerplan, op een klik**; het oude blijft. **Tekstcorrectie binnen dezelfde versie:** "Werk het leerplan bij", alleen als de lijst competenties gelijk bleef; de codes blijven dan. | Niets stil veranderen. Of `competentie_code` stabiel is over versies, is onbekend. |
| F3-B12 | De **dekking** rekent met `dekkingMinimumdoelen` (ongewijzigde regels) via een nieuwe optionele parameter `verwijzingen`. Er is een percentage per beroepskwalificatie, geen samengeteld percentage. | Eén kern voor gedekt, gepland, verdieping en open, zonder tweede kopie van de regels en zonder namaakverwijzingen in het geheugen. Een richting met drie beroepskwalificaties is geen één lijst. |
| F3-B13 | De **erkenning die geldt** wordt in de app bepaald, met `vandaag`. Het script haalt ook de BK's van toekomstige erkenningen op. | De wissel op 1 september gebeurt vanzelf, zonder dat het script die dag moet draaien. |
| F3-B14 | **Deelkwalificaties (DBK) en studiebekrachtigingen alleen bij naam.** Geen competenties van een DBK, geen afgeleide koppeling DBK → BK. | Er is geen gedocumenteerd adres voor een DBK. We raden niets. |
| F3-B15 | Geen nieuwe route. De sectie, de keuze in het venster en het dekkingsblok zitten in één lui chunk `bk`; de lader in een klein lui chunk. Op de richtingpagina gaat er alleen een verzoek uit als de richting beroepskwalificaties kan hebben. | Het kritieke pad en de bestaande rooktests 20d, 20e en 20f blijven letterlijk gelijk. Chromium meldt een 404 als consolefout: de app vraagt dus nooit een bestand op waar het niet hoort. |

### 23.3 Wat we weten, en wat de eerste run moet bevestigen

**Bekend** (ONDERWIJS-API.md § 1, § 2 en § 4):
- Host `onderwijs.api.vlaanderen.be`, kop `x-api-key`, geheim `ONDERWIJSDOELEN_API_KEY`. Alleen GitHub Actions bereikt de API.
- `GET …/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeel/{nummer}` werkt. Per erkenning (`structuuronderdeel_details[]`, met `structuuronderdeel_detail_nummer` = het ADV-nummer) staan er `beroepskwalificaties[]` (`beroepskwalificatie_nr`, `versie_nr_kort`, `versie_nr_lang`, `titel`, `api_url`), `studiebekrachtigingen[]` (`onderwijskwalificatie`, `uitgebreide_naam`, een `beroepskwalificatie` of een `deelkwalificatie` zoals `BK-0130-5-DBK-01`) en een adres `curriculumdossier`. De lijst van de groepen bevat die velden niet.
- `GET …/beroepskwalificaties/v2/beroepskwalificatie`: 604 beroepskwalificaties, `gegevens[]` met `beroepskwalificatie_nr`, `laatst_erkende_versie` (`versie_nr_lang`, `titel`, datums) en `versies[]`; het totaal in `meta.total_elements`. Filters op de lijst worden genegeerd.
- `GET …/beroepskwalificatie/BK-0454-1` werkt alleen met het versienummer; zonder versie komt 404. Het antwoord bevat `beroepskwalificatie` met titel, status, `vks_niveau`, definitie, domeinen en `competenties[]` (`competentie_type`, `nr`, `competentie_code` zoals `bkc0039200`, `waarde` tot ±105 tekens, `kennis[]` met `kennis_type` en `waarde` tot ±400 tekens, `vaardigheden[]` met `vaardigheid_type` en `waarde`, `referenties[]` met `referentie_nr`), plus omgevings- en handelingscontext, autonomie en verantwoordelijkheid.
- Vaste waarden: onderdeel 504 (Onthaal en recreatie, 3de graad A, ADV-0842) → BK-0390-2 (12 competenties) en BK-0464-1 (13), zonder gedeelde competentiecodes, met 5 studiebekrachtigingen waarvan 1 met `onderwijskwalificatie: true`. Onderdeel 1 → 3 BK's en 3 deelkwalificaties. In de proef was `competentie_type` altijd "Vakspecifieke competentie".
- Het curriculumdossier is een Word-document in base64. Het wordt niet opgehaald, niet bewaard en niet gelinkt.

**Onbekend: tolerant bouwen, de eerste run bevestigt het.** Deze lijst komt zo in het rapport (`teBevestigen`).

| # | Vraag | Tolerant ontwerp | Wie bevestigt |
|---|---|---|---|
| T1 | Geeft `versie_nr_lang` letterlijk "BK-0390-2"? | `bkVersieVan`: `versie_nr_lang` als het op `BK_VERSIE` past, anders `beroepskwalificatie_nr` + "-" + `versie_nr_kort`, anders een probleem (exit 3) | G1 stap 1 |
| T2 | Heeft het detail per erkenning status en datums? | Zo niet, dan uit de matrix (zelfde ADV-nummer), met een telling in het rapport | G1 stap 1 |
| T3 | Is de BK of DBK in een studiebekrachtiging tekst of een object? | Beide: een tekst, of een object met een veld dat op `BK_VERSIE` of `DBK_NUMMER` past; de rest naar `extra`, geteld als "vorm onbekend" | G1 stap 1 |
| T4 | Staat er HTML in `waarde`? Staat `nr` er altijd, en is het uniek? Welke waarden hebben `kennis_type` en `vaardigheid_type`? | Teksten letterlijk bewaard; de app zet ze om met `htmlNaarTekst`. Zonder bruikbaar `nr` valt de doelcode terug op de plaats. Alles geteld, mild tot na G1 | G1 stap 1 en 2 |
| T5 | Paginering en paginagrootte van de BK-lijst | Bladeren met `volgendeLink` (zoals de matrix): alleen dezelfde origin en hetzelfde pad, hoogstens 100 pagina's, een adres dat al gezien is, is een fout | G1 stap 1 |
| T6 | Is de volgorde van kennis en vaardigheden stabiel over twee runs? | Zijn de elementen gelijk zonder op de volgorde te letten, dan blijft de oude volgorde (en het oude bestand) | G1 stap 2 |
| T7 | Blijft `competentie_code` gelijk over versies van dezelfde beroepskwalificatie? Verandert een erkende versie nog? | De versie zit in de doelcode; een nieuwe versie geeft een nieuw leerplan; het rapport meet `versieOverlap` | rapporten, TechLoket |
| T8 | Welke soorten en finaliteiten hebben beroepskwalificaties (DO? 2de graad A? 7de jaren? BuSO OV3?) | Alles ophalen en tellen per soort, graad en finaliteit | G1 stap 2 |
| T9 | Wat betekent een 404 op het detail van een onderdeel of een BK-versie? | Een tweede ronde; daarna `niet-gevonden` of `nietMeerInBron`, met de massaverliespoort | G1 stap 3 |
| T10 | Velden van context, autonomie, verantwoordelijkheid en domeinen | Ongetypeerd in `extra` (sleutels recursief gesorteerd), telt mee in de sha, niet op het scherm in fase 3 | G1 stap 1 |

### 23.4 Aantallen en duur

Geteld op `public/leerplannen/structuur/studierichtingen.json` (opgehaald op 9 oktober 2026). Geldig = niet `nietMeerInBron` en geen einddatum vóór 10 oktober 2026. Beide ontwerpen telden juist.

| Soort (`soortVanGroep`) | Graad | Finaliteit | Groepen | Geldige onderdelen | Waarvan duaal |
|---|---|---|---|---|---|
| gewoon | 2 | A | 72 | 115 (43 aanloop) | 91 |
| gewoon | 2 | DU | 29 | 33 | 0 |
| gewoon | 3 | A | 51 | 128 (36 aanloop) | 77 |
| gewoon | 3 | DU | 47 | 71 | 18 |
| **gewoon A en DU samen** | | | **199** | **347** | |
| aanloopjaar | 2 | A | 9 | 9 | 9 |
| BuSO | – | A | 52 | 154 | 64 |
| **met finaliteit A of DU samen** | | | **260** | **510** | |
| 7de jaar | 3 | – | 133 (van 219; 86 afgebouwd) | 237 | 96 |
| gewoon | 2 en 3 | DO | 57 | 59 | 0 |
| 1ste graad, OKAN en basisverpleegkunde, BuSO zonder finaliteit | | | 9 | 27 | 0 |
| **alle geldige onderdelen** | | | | **833** | |

Elk geldig onderdeel heeft vandaag precies één erkenning die geldt (status ERKEND, begonnen, niet afgelopen). Er is geen enkele toekomstige erkenning. 191 onderdelen hebben meer dan één erkenning; erkenningen overlapten vroeger wel een schooljaar (onderdeel 1: ADV-1193 tot 31 augustus 2024, ADV-1608 vanaf 1 september 2023). In de matrix komen de statussen ERKEND, GEANNULEERD en NIET_ERKEND voor.

**Schatting van de BK-versies.** Duale en aanloopvarianten delen hun beroepskwalificaties waarschijnlijk met de gewone variant. Met 1 tot 3 per richting (504 → 2, 1 → 3), de 7de jaren (meestal 1) en BuSO OV3 (grotendeels dezelfde als BSO) verwachten we **±250 tot 450 unieke BK-versies**; de bovengrens is de 604 van de lijst plus oudere versies.

| Oproepen | Aantal |
|---|---|
| Detail per geldig onderdeel | 833 |
| BK-lijst | ±13 tot 31 pagina's (paginagrootte onbekend) |
| Detail per BK-versie | ±250 tot 450 |
| Tweede ronde (404) | weinig |
| **Samen** | **±1.120 tot 1.320** |

Met ±400 ms per oproep plus 250 ms pauze is dat **±12 tot 15 minuten**; bij ±1 s per oproep ±25 tot 28 minuten. De hele taak gaat van ±23 naar ±35 tot 50 minuten. `timeout-minutes` gaat daarom van 60 naar **90**, en wordt na G1 bijgesteld op de meting.

**Omvang.** Een BK-bestand weegt ±6 tot 30 kB; samen ±3 tot 10 MB in de repo (±2 MB gzip). De koppeling weegt ±250 tot 350 kB (±35 kB gzip), de index ±60 tot 100 kB. `sw.js` groeit met ±15 tot 20 kB aan namen en staat niet op het kritieke pad. De app laadt per richting de koppeling, de index en 1 tot 3 BK-bestanden: ±25 kB gzip, alleen op de richtingpagina.

### 23.5 Import

#### 23.5.1 Datastroom

```
(1) haal-minimumdoelen.mjs          ongewijzigd → public/leerplannen/minimumdoelen/
(2) haal-studierichtingen.mjs       ongewijzigd → public/leerplannen/structuur/
(3) haal-beroepskwalificaties.mjs   NIEUW, leest (2)/studierichtingen.json (alleen lezen)
      GET …/beroepskwalificaties/v2/beroepskwalificatie            lijst (zacht)
      GET …/structuuronderdelen/v2/structuuronderdeel/{nr}         833 keer
      GET …/beroepskwalificaties/v2/beroepskwalificatie/{BK-x-v}   per unieke versie
      → public/leerplannen/kwalificaties/koppeling.json
      → public/leerplannen/kwalificaties/index.json
      → public/leerplannen/kwalificaties/bk/BK-0390-2.json …
(4) npx vitest run   alle tests, ook beroepskwalificaties.data.test.ts
(5) groen → één pull request → een mens keurt goed → deploy.yml

App (alleen bestanden uit public/, nooit de API):
  laadBkKoppeling · laadBkIndex · laadBk(versie)
  → bkKader(richting, keuze, vandaag) → kaart en venster → leerplanUitBk (nagekeken) → cursusVoorBk
  → dekkingBk = dekkingMinimumdoelen(…, { verwijzingen: bkVerwijzingen })
```

De service worker neemt de nieuwe bestanden vanzelf op (`knownFiles`); ze laden met netwerk eerst en de cache als terugval, zoals de minimumdoelen.

#### 23.5.2 Bestanden

Voor elk bestand gelden de regels van § 3.1: kop met 2 spaties inspringing, één compact record per regel, regeleinde op het einde, alles gesorteerd, lege velden, `null` en lege tekst vallen weg, `sha256` = sha256 van `canoniek(…)` uit `minimumdoelen.ts`. Elke kop vermeldt `bron`, `api`, `naamsvermelding`, `licentie: "nog te bevestigen"` en `opgehaald`. Wordt een bestand opnieuw gebouwd met het oude `opgehaald` en is het dan byte voor byte gelijk, dan wordt het niet aangeraakt; per record in de koppeling geldt hetzelfde voor zijn `opgehaald`.

**`kwalificaties/koppeling.json`**: per onderdeel de erkenningen met hun beroepskwalificaties.

```json
{
  "app": "boosterz",
  "kind": "richtingkwalificaties",
  "v": 1,
  "bron": "https://onderwijs-api-portaal.vlaanderen.be/",
  "api": "https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeel/",
  "naamsvermelding": "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen)",
  "licentie": "nog te bevestigen",
  "opgehaald": "2026-11-03T06:10:00Z",
  "matrixSha256": "<sha256 van studierichtingen.json bij het koppelen>",
  "aantalOnderdelen": 961,
  "sha256": "<sha256(canoniek(onderdelen))>",
  "onderdelen": [
{"onderdeel":1,"groep":"G-0001","status":"opgehaald","opgehaald":"…","erkenningen":[{"adv":"ADV-1193","versie":"S-1-V1","status":"ERKEND","begindatum":"2017-09-01","einddatum":"2024-08-31","bks":[{"bk":"BK-…","titel":"…"}]},{"adv":"ADV-1608","versie":"S-1-V2","status":"ERKEND","begindatum":"2023-09-01","bks":[…],"bekrachtigingen":[{"naam":"…","dbk":"BK-0130-5-DBK-01"}]}]},
{"onderdeel":2,"groep":"G-0002","status":"nog-niet-opgehaald"},
{"onderdeel":504,"groep":"G-0393","status":"opgehaald","opgehaald":"…","erkenningen":[{"adv":"ADV-0842","versie":"S-504-V1","status":"ERKEND","begindatum":"2023-09-01","bks":[{"bk":"BK-0390-2","titel":"Onthaalmedewerker"},{"bk":"BK-0464-1","titel":"Recreatief medewerker"}],"bekrachtigingen":[{"naam":"…","onderwijskwalificatie":true},{"naam":"…","bk":"BK-0390-2"}]}]}
  ]
}
```

- **Eén record per onderdeel van de matrix** (nu 961), gesorteerd op nummer. `status`:
  - `opgehaald`: het detail gaf 200;
  - `niet-gevonden`: twee keer 404. Een vroeger record houdt zijn erkenningen, met `nietMeerInBron` (JJJJ-MM-DD, blijft gelijk bij volgende runs);
  - `nog-niet-opgehaald`: niet gevraagd in deze run (proefrun, nieuw, afgebouwd of niet meer in de bron) en nooit eerder opgehaald. Een vroeger record blijft zoals het was.
- `erkenningen`: **alle** erkenningen uit het detail, ook afgelopen, gesorteerd op begindatum en dan ADV. Status en datums uit het detail; ontbreken ze daar, dan uit de matrix (zelfde ADV).
- `bks`: uniek en gesorteerd met `vergelijkBkVersie`. `titel` is een momentopname; de app gebruikt ze alleen als er geen BK-bestand is. Heeft een erkenning geen veld `beroepskwalificaties`, dan staat er `"geenLijst": true` (niet hetzelfde als een lege lijst; geteld voor de vormpoort).
- `bekrachtigingen`: `naam` (`uitgebreide_naam`), `onderwijskwalificatie` (alleen `true`), `bk` (op `BK_VERSIE`) of `dbk` (op `DBK_NUMMER`), de rest in `extra`. Gesorteerd op naam (nl), dan bk, dan dbk.
- `api_url` en `curriculumdossier` vallen altijd weg. Elk veld in `extra` is hoogstens 20 kB; een langer veld valt weg met een waarschuwing, zodat er nooit een base64-blob in de repo komt.

**`kwalificaties/index.json`**: één regel per BK-versie die ooit gekoppeld was.

```json
{
  "app": "boosterz", "kind": "beroepskwalificaties-index", "v": 1,
  "bron": "https://onderwijs-api-portaal.vlaanderen.be/",
  "api": "https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/",
  "naamsvermelding": "<BK_NAAMSVERMELDING>", "licentie": "nog te bevestigen", "opgehaald": "…",
  "lijstTotaal": 604, "sha256": "<sha256(canoniek(bks))>",
  "bks": [
{"bk":"BK-0390-2","nummer":"BK-0390","versie":2,"titel":"Onthaalmedewerker","vks":3,"status":"ERKEND","aantal":12,"sha256":"…64 hex…","opgehaald":"…","bestand":"bk/BK-0390-2.json","laatstErkend":"BK-0390-2"},
{"bk":"BK-0130-4","nummer":"BK-0130","versie":4,"titel":"…","aantal":9,"sha256":"…","opgehaald":"…","bestand":"bk/BK-0130-4.json","nietMeerGekoppeld":"2026-12-03"},
{"bk":"BK-0611-1","nummer":"BK-0611","versie":1,"opgehaald":"…","nietGevonden":true}
  ]
}
```

- Gesorteerd met `vergelijkBkVersie` (nummer, dan versie, numeriek: BK-0390-2 < BK-0390-10 < BK-0391-1).
- `laatstErkend` komt uit de lijst (`laatst_erkende_versie.versie_nr_lang`). Is de lijst onvolledig of niet opgehaald, dan blijft de oude waarde, en ook `lijstTotaal`.
- `nietMeerGekoppeld` (JJJJ-MM-DD): geen enkele erkenning in de koppeling, afgelopen of niet, noemt de versie nog. Het veld valt weg als de versie terugkomt.
- `nietMeerInBron`: het detail gaf twee keer 404, maar er is een laatst bekend bestand.
- `nietGevonden: true` (twee keer 404) of `onbruikbaar: true` (een probleem in de competenties): er was nooit een bestand. Zo'n regel heeft geen `bestand`.

**`kwalificaties/bk/BK-0390-2.json`**: één bestand per BK-versie.

```json
{
  "app": "boosterz", "kind": "beroepskwalificatie", "v": 1,
  "bk": "BK-0390-2", "nummer": "BK-0390", "versie": 2,
  "titel": "Onthaalmedewerker", "status": "ERKEND", "vks": 3, "definitie": "…",
  "bron": "https://onderwijs-api-portaal.vlaanderen.be/",
  "api": "https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/BK-0390-2",
  "naamsvermelding": "<BK_NAAMSVERMELDING>", "licentie": "nog te bevestigen", "opgehaald": "…",
  "aantal": 12,
  "sha256": "<sha256(canoniek({bk, titel, status, vks, definitie, competenties, extra}))>",
  "competenties": [
{"id":"bkc0039200","nr":1,"type":"Vakspecifieke competentie","tekst":"…","kennis":[{"type":"…","tekst":"…"}],"vaardigheden":[{"type":"…","tekst":"…"}],"referenties":["…"]}
  ],
  "extra": {"domeinen": […], "…": "…"}
}
```

- `id` = `competentie_code` (op `COMPETENTIE_CODE`), de sleutel. `nr` alleen als geheel getal (ook uit tekst "3"); anders weg, met een waarschuwing.
- `competenties` gesorteerd op `nr` (numeriek) en dan `id`; zonder `nr` in de volgorde van de bron, achteraan. Binnen een competentie blijven `kennis` en `vaardigheden` in de volgorde van de bron (T6).
- `tekst` is `waarde` letterlijk, getrimd. De app zet om met `tekstVanCompetentie` (§ 23.6.4).
- `vks` alleen als geheel getal van 1 tot 8; anders in `extra`.
- Context, autonomie, verantwoordelijkheid en domeinen staan ongetypeerd in `extra` (T10).

#### 23.5.3 Gedeelde module `src/lib/beroepskwalificaties.ts` (K1)

Puur: geen imports en alleen erasable TypeScript, zoals `studierichtingen.ts`. Het script, de datatest en de app laden ze alle drie.

```ts
export const BK_API = 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2';
export const BK_BRON = 'https://onderwijs-api-portaal.vlaanderen.be/';
/** Werkkeuze tot TechLoket antwoordt (§ 23.10): geen naam van een agentschap. Eén constante; aanpassen = een nieuwe run. */
export const BK_NAAMSVERMELDING = 'Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties)';
export const BK_NUMMER = /^BK-\d{3,6}$/;
export const BK_VERSIE = /^BK-\d{3,6}-\d{1,4}$/;
export const DBK_NUMMER = /^BK-\d{3,6}-\d{1,4}-DBK-\d{1,4}$/;
export const COMPETENTIE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;   // altijd als Map-sleutel, nooit als objecteigenschap
export const MAX_EXTRA_VELD = 20_000;
export const MAX_BK_PER_LEERPLAN = 20;

export type OnderdeelStatus = 'opgehaald' | 'niet-gevonden' | 'nog-niet-opgehaald';
export interface KoppelingBk { bk: string; titel?: string }
export interface Bekrachtiging { naam: string; onderwijskwalificatie?: true; bk?: string; dbk?: string; extra?: Record<string, unknown> }
export interface Erkenning { adv: string; versie?: string; status?: string; begindatum?: string; einddatum?: string;
  bks: KoppelingBk[]; geenLijst?: true; bekrachtigingen: Bekrachtiging[]; extra?: Record<string, unknown> }
export interface OnderdeelKwalificaties { onderdeel: number; groep: string; status: OnderdeelStatus; opgehaald?: string;
  nietMeerInBron?: string; erkenningen?: Erkenning[] }
export interface KoppelingBestand { /* kop § 23.5.2 */ onderdelen: OnderdeelKwalificaties[] }
export interface BkIndexRegel { bk: string; nummer: string; versie: number; titel?: string; vks?: number; status?: string;
  aantal?: number; sha256?: string; opgehaald: string; bestand?: string; laatstErkend?: string;
  nietMeerGekoppeld?: string; nietMeerInBron?: string; nietGevonden?: true; onbruikbaar?: true }
export interface BkIndex { /* kop */ lijstTotaal?: number; sha256: string; bks: BkIndexRegel[] }
export interface BkTekst { type?: string; tekst: string }
export interface Competentie { id: string; nr?: number; type?: string; tekst: string; kennis: BkTekst[]; vaardigheden: BkTekst[];
  referenties?: string[]; extra?: Record<string, unknown> }
export interface BkBestand { /* kop § 23.5.2 */ competenties: Competentie[]; extra?: Record<string, unknown> }

// voor het script: tolerant (regel 11), met problemen (→ poorten) en waarschuwingen (→ rapport)
export function lijstVanBkPagina(pagina: unknown): { lijst: unknown[]; pad: string } | { fout: string };
//   de enige lijst van objecten met beroepskwalificatie_nr, op welke sleutel ook; geen of meer dan één → fout
export function normaliseerBkLijstItem(raw: unknown): { nummer?: string; laatstErkend?: string; problemen: string[] };
export function bkVersieVan(v: unknown): string | undefined;                    // T1
export function normaliseerOnderdeelDetail(raw: unknown, gevraagd: number):
  { nummer?: number; erkenningen: Erkenning[]; velden: string[]; problemen: string[]; waarschuwingen: string[] };
//   nummer = wat het antwoord ZELF zegt (structuuronderdeel_nummer); een veld mag tekst of {code, omschrijving} zijn; een lijst
//   met één element telt als dat element; api_url en curriculumdossier vallen weg; __proto__ via defineProperty
export function normaliseerBkDetail(raw: unknown, gevraagd: string):
  { bk?: string; inhoud?: Pick<BkBestand, 'titel' | 'status' | 'vks' | 'definitie' | 'competenties' | 'extra'>; problemen: string[]; waarschuwingen: string[] };

// gedeeld
export function splitsBk(bk: string): { nummer: string; versie: number } | undefined;
export function vergelijkBkVersie(a: string, b: string): number;
export function geldtOp(e: Pick<Erkenning, 'status' | 'begindatum' | 'einddatum'>, vandaag: string): boolean;
//   status ERKEND (hoofdletterongevoelig, tekst of {code}), begindatum leeg of ≤ vandaag, einddatum leeg of ≥ vandaag
export function erkenningenOp(e: readonly Erkenning[], vandaag: string): { nu: Erkenning[]; toekomst: Erkenning[] };
export function doelcodesVanBestand(b: Pick<BkBestand, 'bk' | 'competenties'>): Map<string, string>;
//   id → "BK-0390-2.03": `${bk}.${n}` met n minstens 2 cijfers; n = nr als ELKE competentie een uniek geheel nr ≥ 1 heeft,
//   anders de plaats (1-based) in het bestand; nooit langer dan 60 tekens
export function valideerKoppelingBestand(json: unknown): string[];
export function valideerBkIndex(json: unknown): string[];
export function valideerBkBestand(json: unknown, bk?: string): string[];
```

**Problemen** (naar de poorten): een detail zonder eigen nummer of met een ander nummer dan gevraagd; een BK-detail zonder `beroepskwalificatie` of met een andere versie; een BK-verwijzing die niet op `BK_VERSIE` past en geen DBK is, of waarvan de versie niet met haar `beroepskwalificatie_nr` begint; een competentie zonder geldig `id` of zonder tekst; een dubbel `id` in één versie. **Waarschuwingen** (naar het rapport): een ontbrekend of dubbel `nr`, HTML in een tekst, een onbekende vorm van een studiebekrachtiging, een te lang veld in `extra`, een titel in de koppeling die verschilt van die in het detail.

#### 23.5.4 Script `tools/leerplannen/haal-beroepskwalificaties.mjs` (K2)

Node 22.18 of nieuwer, zonder afhankelijkheden. `tools/leerplannen/onderwijsApi.mjs` (K1) is `haalJson` uit `haal-studierichtingen.mjs` (r. 270 tot 337) als kopie, met `redirect: 'manual'` (elke 3xx is fout 1, zonder tweede verzoek), 401 en 403 als fout 1, `mag404`, 4 nieuwe pogingen bij 429, 5xx of een netwerkfout (na 2, 4, 8 en 16 s), een time-out van 60 s, de origincontrole, `schoon`, `veilig` en `kort`. Het script importeert `minimumdoelen.ts` (`canoniek`), `studierichtingen.ts` (`valideerMatrixBestand`, `volgendeLink`, `totaalVanPagina`, `soortVanGroep`) en `beroepskwalificaties.ts`.

```
ONDERWIJSDOELEN_API_KEY=… node tools/leerplannen/haal-beroepskwalificaties.mjs [opties]
--onderdelen 504,1              proefrun: alleen deze onderdelen (hoogstens 50, elk een geheel getal dat in de matrix staat,
                                anders 1); de andere records blijven, of krijgen "nog-niet-opgehaald"
--zonder-lijst                  de BK-lijst niet ophalen (laatstErkend en lijstTotaal blijven)
--bron-lijst <bestand>          offline: één pagina of een array pagina's van de BK-lijst
--bron-onderdelen <bestand>     offline: {"504": <detail> | {"status": 404}, …}
--bron-bks <bestand>            offline: {"BK-0390-2": <detail> | {"status": 404}, …}
--structuur <map>               standaard public/leerplannen/structuur (alleen lezen: studierichtingen.json)
--uit <map>                     standaard public/leerplannen/kwalificaties
--rapport <bestand>             standaard tools/leerplannen/rapport/laatste-beroepskwalificaties.json
--vandaag JJJJ-MM-DD · --nu <ISO> (alleen met --bron-*)
Omgeving:
  ONDERWIJSDOELEN_API_KEY          verplicht zonder --bron-*
  ONDERWIJSDOELEN_API_BASE         bepaalt de enige origin waar de sleutel heen mag
  STRUCTUURONDERDELEN_API_BASE     standaard STRUCTUUR_API; zelfde origin, anders 1
  BEROEPSKWALIFICATIES_API_BASE    nieuw; standaard BK_API; zelfde origin, anders 1
  ONDERWIJSDOELEN_WACHT_FACTOR     0 in tests
Uitgangscodes: 0 in orde (ook "niets veranderd") · 1 fout of onvolledig · 2 niets te vragen of niets ontvangen ·
3 gegevens niet betrouwbaar. Bij 1, 2 en 3 schrijft het script alleen het rapport.
```

**Adressen.** Een onderdeelnummer wordt een geheel getal van 1 tot 999999; een BK-versie moet op `BK_VERSIE` passen; daarna `encodeURIComponent`. Alleen `${STRUCTUURONDERDELEN_API_BASE}/structuuronderdeel/${nr}`, `${BEROEPSKWALIFICATIES_API_BASE}/beroepskwalificatie/${versie}` en `${BEROEPSKWALIFICATIES_API_BASE}/beroepskwalificatie` met zijn volgende pagina's. 250 ms pauze tussen twee verzoeken.

**Stappen**

1. **Matrix lezen.** `studierichtingen.json` moet bestaan en `valideerMatrixBestand` moet [] geven, anders fout 1. Te vragen: elk onderdeel zonder `nietMeerInBron` en zonder einddatum vóór vandaag (nu 833), of de proeflijst.
2. **BK-lijst** (behalve met `--zonder-lijst`). Per `beroepskwalificatie_nr` de laatst erkende versie. Is het aantal niet `meta.total_elements`, of ontbreekt dat, dan is de lijst onvolledig: een waarschuwing, en de lijst dient dan niet (F3-B6).
3. **Detail per onderdeel**, oplopend. 200 → `normaliseerOnderdeelDetail` en een zachte kruiscontrole van de ADV-nummers met de matrix. 404 → een tweede ronde na alle andere; een tweede 404 → `niet-gevonden`. Elke andere status → fout 1.
4. **BK-versies verzamelen**: de `bks` van alle erkenningen die vandaag gelden of later beginnen, van de records die in deze run opgehaald zijn; uniek, gesorteerd. Van afgelopen erkenningen bewaren we alleen de verwijzing.
5. **Detail per BK-versie.** 200 → `normaliseerBkDetail`. Een versie met een probleem in haar competenties is **onbruikbaar**: haar laatst bekende bestand blijft ongewijzigd, of ze krijgt `onbruikbaar: true`. 404 → tweede ronde; twee keer 404 → `nietMeerInBron` (bestand blijft) of `nietGevonden`.
6. **Samenvoegen** met het bestaande (niets wissen): records die niet gevraagd werden, blijven; `nietMeerGekoppeld` wordt over alle records berekend.
7. **Bouwen**: eerst de BK-bestanden, dan de index, dan de koppeling. Zijn kennis en vaardigheden gelijk zonder op de volgorde te letten, dan blijft de oude volgorde (T6). De uitvoer hangt niet af van de volgorde van de invoer. Elk gebouwd bestand gaat door zijn validator.
8. **Poorten** (§ 23.5.5), dan de sleutelcontrole op elk bestand en het rapport, dan schrijven (eerst `bk/`, de index en de koppeling als laatste), tot slot het rapport.

#### 23.5.5 Harde poorten (niets schrijven behalve het rapport)

| Code | Exit | Wanneer |
|---|---|---|
| P1 | 1 | Een HTTP-fout na de herhalingen, een doorverwijzing, geen JSON, een adres op een andere origin, een lus in de paginering, de sleutel in een tekst, ongeldige opties, geen bruikbare matrix, een andere status dan 200 of 404 op een detail |
| P2 | 2 | Geen enkel onderdeel te vragen, of geen enkel detail ontvangen |
| P3 | 3 | **Het detail negeert het nummer**: een onderdeel noemt een ander `structuuronderdeel_nummer` dan gevraagd, of geen; een BK-detail noemt een andere versie, of heeft geen `beroepskwalificatie`. Het tegenstuk van D2 (de filters op de lijst worden al genegeerd). |
| P4 | 3 | Een BK-verwijzing die niet op `BK_VERSIE` past en geen DBK is, of waarvan de versie niet met haar `beroepskwalificatie_nr` begint |
| P5 | 3 | **De koppeling lijkt niet meer te werken** (bij een volledige run): minder dan 50 % van de geldige gewone onderdelen van de 3de graad met finaliteit A die geen aanloop zijn en status `opgehaald` hebben, heeft een beroepskwalificatie in een erkenning van nu. G1 stelt de grens bij op de meting min een marge. |
| P6 | 3 | Massaverlies tegenover het bestaande bestand: (a) het aantal onderdelen met minstens één BK in een erkenning van nu daalt met meer dan 10 %; (b) het aantal unieke gekoppelde BK-versies daalt met meer dan 10 %; (c) meer dan max(5, 5 %) van de gevraagde onderdelen geeft twee keer 404; (d) meer dan max(3, 5 %) van de gevraagde BK-versies geeft twee keer 404 |
| P7 | 3 | Meer dan max(3, 2 %) van de gevraagde BK-versies is onbruikbaar |

#### 23.5.6 Zachte controles (rapport en PR-tekst)

- Met en zonder BK per soort, graad en finaliteit; een onderdeel met doorstroomfinaliteit of van de 1ste graad dat toch een beroepskwalificatie heeft (info: dan wordt `kanBkHebben` verruimd, § 23.7).
- Onderdelen met 0 of meer dan 1 erkenning van nu; erkenningen in de toekomst met een andere lijst; ADV-nummers die verschillen van de matrix; erkenningen zonder lijst.
- Versies met een nieuwere erkende versie (`laatstErkend ≠ bk`); gekoppelde versies die niet (erkend) in de lijst staan.
- **Inhoud van een bestaande versie veranderd** (andere sha256): vetgedrukt in de PR, want leerplannen met die versie melden het (§ 23.6.6).
- Competenties zonder of met dubbel `nr` (terugval op de plaats), HTML in teksten, de soorten kennis en vaardigheden, de langste tekst.
- `versieOverlap`: twee versies van hetzelfde nummer in één run: het aandeel gedeelde competentiecodes en of hun teksten gelijk zijn (voor T7).
- Studiebekrachtigingen: totaal, met `onderwijskwalificatie`, DBK's, vorm onbekend, met een voorbeeld.
- De veldinventaris van de drie antwoorden en een ingekort voorbeeld van een 404 (zonder sleutel).

#### 23.5.7 Wat er gebeurt als iets verandert

| Gebeurtenis | Script en bestanden | App |
|---|---|---|
| Een erkenning verwijst voortaan naar een nieuwe versie (BK-0390-2 → BK-0390-3) | Nieuw `bk/BK-0390-3.json`. `BK-0390-2.json` blijft; zolang een erkenning in de koppeling haar noemt, blijft ze gekoppeld, anders `nietMeerGekoppeld`. PR: "Andere versie gekoppeld". | De kaart toont versie 3. Een leerplan op versie 2 krijgt "Maak een leerplan met de versie van nu". Cursussen blijven aan het oude leerplan hangen. |
| Een nieuwe erkenning begint op 1 september | De run van augustus haalt de BK's van de toekomstige erkenning al op | Vóór die datum een regel "Vanaf 1 september 2027 hoort bij deze richting: …" (alleen als de lijst verschilt); op die datum wisselt de kaart vanzelf (`geldtOp`) |
| Er is een nieuwere versie erkend, maar de richting verwijst nog naar de oude | `laatstErkend` in de index | Info bij de kaart: "Er bestaat een nieuwere erkende versie …; Boosterz volgt de richting." |
| Dezelfde versie krijgt een andere inhoud | Bestand opnieuw geschreven (andere sha256); PR vetgedrukt | Een leerplan meldt "tekst aangepast" (met "Werk het leerplan bij") of "lijst aangepast" (met "Maak een nieuw leerplan") |
| Het detail van een BK-versie geeft twee keer 404 | Tweede ronde, poort P6(d); bestand blijft met `nietMeerInBron`, of `nietGevonden` | Kaart met waarschuwing en de laatst bekende competenties, of een kaart zonder competenties en knoppen op `aria-disabled` |
| Een BK hoort niet meer bij de richting | Koppeling zonder die BK; het bestand blijft | De kaart verdwijnt; een leerplan ervoor krijgt "… hoort volgens de officiële bron niet meer bij deze richting. Je leerplan blijft werken." |
| Het detail van een onderdeel geeft twee keer 404 | Record blijft met `nietMeerInBron`, status `niet-gevonden` | De laatst bekende koppeling, met een waarschuwing |
| Een onderdeel wordt afgebouwd of verdwijnt uit de matrix | Niet meer gevraagd; het record blijft | De richting volgt `geldigeOnderdelen` (§ 9.2); een afgebouwde richting toont geen sectie |

#### 23.5.8 Sleutel en veiligheid (zoals nu)

- De sleutel staat alleen als geheim `ONDERWIJSDOELEN_API_KEY` in de `env` van de BK-stap, die vóór `npm ci --ignore-scripts` draait.
- De workflow zet geen enkele `*_API_BASE`: de origin is altijd `https://onderwijs.api.vlaanderen.be`.
- `redirect: 'manual'`; een volgende link of een adres op een andere origin is fout 1. `api_url` en `curriculumdossier` worden nooit gevolgd.
- `veilig()` op elke logregel; de sleutelcontrole op elk bestand en het rapport vóór het schrijven. Vindt ze de sleutel, dan wordt niets geschreven.

#### 23.5.9 Workflow `.github/workflows/minimumdoelen.yml` (K4)

- `onderdelen` krijgt twee keuzes erbij: `beroepskwalificaties` (alleen de BK-stap, met de matrix uit de repo) en `zonder-beroepskwalificaties` (minimumdoelen en studierichtingen, zoals `alles` vóór fase 3: de noodinvoer als de BK-stap stuk blijft; § 23.14 punt 6).
- Nieuwe invoer `bk_onderdelen`: "Proefrun voor de beroepskwalificaties: structuuronderdeelnummers zoals 504,1 (leeg = alle geldige onderdelen; hoogstens 50)". Via `env`, nagekeken tegen `^([0-9]{1,6}(,[0-9]{1,6}){0,49})?$`; anders exit 1.
- Van de twee bestaande ophaalstappen verandert **alleen de `if:`**, positief geschreven:
  - Minimumdoelen: `inputs.onderdelen == '' || inputs.onderdelen == 'alles' || inputs.onderdelen == 'minimumdoelen' || inputs.onderdelen == 'zonder-beroepskwalificaties'`;
  - Studierichtingen: idem met `studierichtingen`;
  - nieuw **"Beroepskwalificaties per richting ophalen"**: `'' | alles | beroepskwalificaties`, na de studierichtingen en vóór `npm ci`, met het geheim alleen in zijn `env`.
- `timeout-minutes: 90`. Een nieuw artifact `beroepskwalificaties-rapport` (`always`). De samenvatting krijgt een derde tabel (alle tekst via `kort()`); `metMinimumdoelen`, `metStudierichtingen` en `proefrun` volgen de nieuwe keuzes, en er komt `metBeroepskwalificaties`.
- De PR-stap verandert niet: `git add -- public/leerplannen` neemt de nieuwe map mee. Faalt één ophaalstap, dan komt er geen PR.

**PR-tekst** (bovenop de bestaande delen, letterlijk, met de getallen):

```
### Beroepskwalificaties per richting
- Onderdelen opgevraagd: 833; met een beroepskwalificatie in de erkenning van nu: 412 (3de graad A: 118 van 128 …).
- Nieuw gekoppeld: … · Niet meer gekoppeld: … (de bestanden blijven staan) · Andere versie gekoppeld: onderdeel 504 BK-0390-2 → BK-0390-3.
- Niet gevonden (twee keer 404; de laatst bekende koppeling blijft staan, kijk dit na): geen.

### Beroepskwalificaties zelf
- Versies: 312 (nieuw 4: BK-0390-3, …).
- **Inhoud van een bestaande versie veranderd: BK-0464-1.** Kijk na: leerplannen met die versie melden het aan de leerkracht.
- Niet meer in de bron (het bestand blijft staan): geen · Onbruikbaar (competentie zonder code of tekst): geen.
- Nieuwere erkende versie bestaat, maar de richting verwijst nog naar de oude: BK-0101-2 (laatst erkend BK-0101-3).
- Studiebekrachtigingen: 1.630 (onderwijskwalificatie 410; deelkwalificaties 220, alleen bij naam).

**Proefrun** voor de onderdelen 504, 1: niet samenvoegen.        (alleen met bk_onderdelen)
```

#### 23.5.10 Rapport `tools/leerplannen/rapport/laatste-beroepskwalificaties.json`

```json
{"tijdstip":"…","bron":"api","proef":null,"verzoeken":0,"duurSeconden":0,"teBevestigen":["T1","…"],
 "lijst":{"paginas":0,"pad":"…","totaal":604,"ontvangen":604,"volledig":true,"nietInLijst":[],"nieuwereVersie":[]},
 "onderdelen":{"gevraagd":833,"opgehaald":0,"nietGevonden":0,"tweedeRonde":{"onderdelen":0,"verzoeken":0},
   "perSoortGraadFinaliteit":{"gewoon|3|A":{"metBk":0,"zonderBk":0}},"erkenningenNu":{"0":0,"1":0,"meer":0},"toekomst":0,
   "geenLijst":0,"advVerschilMetMatrix":[],"nieuw":[],"nietMeerGekoppeld":[],"andereVersie":[],"veldInventaris":{}},
 "bks":{"gevraagd":0,"nieuw":[],"inhoudVeranderd":[],"nietMeerInBron":[],"nietGevonden":[],"onbruikbaar":[],"versieOverlap":[],
   "competenties":{"totaal":0,"zonderNr":0,"dubbelNr":0,"metHtml":0,"kennisTypes":{},"vaardigheidTypes":{},"langsteTekst":0},
   "veldInventaris":{}},
 "bekrachtigingen":{"totaal":0,"onderwijskwalificatie":0,"dbk":0,"vormOnbekend":0,"voorbeeld":null},
 "omvang":{"bestanden":0,"bytes":0},"voorbeeld404":"<ingekort, zonder sleutel>","problemen":[],"waarschuwingen":[],"fout":null}
```

De map staat al in .gitignore.

#### 23.5.11 Datatest `src/lib/beroepskwalificaties.data.test.ts` (K3)

Een **andere agent** schrijft dit bestand dan de schrijver van het script; hij werkt alleen uit de invarianten hieronder. Het draait in deploy.yml en in de workflow.

De kern is één functie in het testbestand: `controleerKwalificatieMap(uit, structuur): { fouten: string[]; info: string[] }`. Ze draait op (1) de echte map (`runIf`; een harde fout als er `bk/*.json` staan zonder index), (2) `tests/fixtures/kwalificaties/uit` (altijd) en (3) een **zelftest** met minstens 10 kapotte kopieën, elk met de verwachte melding: sha256, sortering, een bestand buiten de index, een BK van nu zonder indexregel, een dubbele competentiecode, `bk` ≠ bestandsnaam, een onderdeel dat niet in de matrix staat, een fout `aantal`, een ongeldige status, een doelcode die niet uniek is.

| Code | Invariant | Mild of streng |
|---|---|---|
| KP1 | Kop, `aantalOnderdelen` en sha256 van de koppeling kloppen; `valideerKoppelingBestand` geeft [] | streng |
| KP2 | Gesorteerd en uniek; elk onderdeel staat in de matrix (de matrix wist niets) | streng |
| KP3 | Dezelfde groep als in de matrix, en precies één record per onderdeel van de matrix | streng bij een gelijke `matrixSha256`, anders info (een run met alleen de studierichtingen) |
| KP4 | Status geldig; `opgehaald` heeft `erkenningen`; datums geldig; elke `bk` op `BK_VERSIE`, elke `dbk` op `DBK_NUMMER`; lijsten gesorteerd | streng |
| KP5 | Elke BK van een erkenning die nu geldt of later begint, staat in de index (met bestand, of `nietGevonden`/`onbruikbaar`) | streng |
| KP6 | Elk geldig gewoon onderdeel van de 3de graad A, geen aanloop, met status `opgehaald`, heeft een BK nu (`BK_A3_STRENG`) | mild tot G1, daarna streng als de telling 0 is |
| KP7 | ADV-nummers van het record tegenover de matrix (`ERKENNING_KRUIS_STRENG`) | mild tot G1, idem |
| BX1 | Kop en sha256 van de index; `valideerBkIndex` geeft [] | streng |
| BX2 | Gesorteerd met `vergelijkBkVersie`, uniek; `nummer` en `versie` horen bij `bk` | streng |
| BX3 | Met `bestand`: het bestand bestaat, en `sha256`, `aantal`, `titel` en `opgehaald` zijn gelijk; zonder `bestand`: `nietGevonden` of `onbruikbaar` | streng |
| BX4 | Geen bestanden in `bk/` buiten de index | streng |
| BB1 | `valideerBkBestand` geeft []; `bk` = bestandsnaam; sha256 klopt; `aantal` = aantal competenties | streng |
| BB2 | Competentiecodes uniek en op `COMPETENTIE_CODE`; elke tekst, kennis en vaardigheid niet leeg na `tekstVanCompetentie` | streng |
| BB3 | `doelcodesVanBestand`: uniek, ≤ 60 tekens, begint met `${bk}.`, en `normalizeGoalCode` verandert ze niet | streng |
| BB4 | `nr` geheel getal en uniek in elke versie (`NR_STRENG`) | mild tot G1, daarna streng als de telling 0 is |
| BB5 | Geen HTML-tags in teksten (`TEKST_STRENG`) | mild tot G1, idem |
| BC1 | (komt erbij in G1) Onderdeel 504 heeft in ADV-0842 precies BK-0390-2 en BK-0464-1, met 12 en 13 competenties en geen gedeelde codes; alleen zolang ADV-0842 geldt en de index die versies met bestand noemt | streng met voorwaarde |

#### 23.5.12 Fixtures en scripttest (K2)

- `tests/fixtures/kwalificaties/api/`: `lijst.json` (twee pagina's met `links.next.href` en `meta.total_elements`), `onderdelen.json`, `bks.json`. **De structuurfixtures veranderen niet**: de nagebootste koppeling hangt aan onderdelen die er al staan. Het bestand zegt uitdrukkelijk `"nagebootst": "geen officiële koppeling"`.
  - onderdeel 8 (G-0008, 2de graad A, duaal): een afgelopen en een geldende erkenning; de geldende noemt BK-0390-2 en BK-0464-1; vijf studiebekrachtigingen, één met `onderwijskwalificatie: true` en één DBK;
  - onderdeel 565 (G-0008, aanloop): alleen BK-0464-1 ("alleen in: aanloop");
  - onderdelen 9 tot 12 en 931 (G-0009, BuSO A): een erkenning zonder lijst, een toekomstige erkenning met BK-9999-2, een 404 voor onderdeel 931;
  - onderdeel 247 (G-0193, DO): een lege lijst.
- `bks.json`: BK-0390-2 en BK-0464-1 in de vorm van ronde 7, uit het uittreksel dat de hoofdsessie in Q0 maakt (teksten mogen ingekort zijn); BK-9999-1 met HTML in een tekst, een competentie zonder `nr` en kennis in een andere volgorde dan in `uit/`; twee keer 404 voor BK-9999-3.
- `uit/`: de uitvoer met `--bron-* --nu 2026-10-10T00:00:00Z --vandaag 2026-10-10 --structuur tests/fixtures/structuur/uit`. De datatest, de app-tests en de rooktest gebruiken die uitvoer.
- `src/lib/beroepskwalificaties.script.test.ts`, met `--bron-*` en met een nagebootste http-API (`node:http`, de drie `*_API_BASE`, wachtfactor 0):
  - exit 0 met de bestanden van § 23.5.2; opnieuw draaien op `api/` geeft byte voor byte `uit/`;
  - een tweede run raakt niets aan (bytes en mtime), ook niet met kennis in een andere volgorde;
  - de uitvoer hangt niet af van de invoervolgorde;
  - een andere origin in een volgende link → 1; een doorverwijzing → 1 zonder tweede verzoek; 401 → 1;
  - een `api_url` in een antwoord wordt nooit gevraagd (de server telt de verzoeken);
  - P3 tot P7 geven elk 3; een onvolledige lijst geeft 0 met een waarschuwing en houdt `laatstErkend`;
  - één keer 404 en daarna 200 → opgehaald; twee keer 404 → `niet-gevonden` (record blijft met `nietMeerInBron`) en een BK-bestand blijft met `nietMeerInBron`;
  - `nietMeerGekoppeld` houdt zijn datum en valt weg als de versie terugkomt;
  - een onbruikbare versie houdt haar oude bestand;
  - `--onderdelen` en `--zonder-lijst` raken de andere records niet aan;
  - een `extra`-veld van 30 kB valt weg met een waarschuwing;
  - de nepsleutel `test-sleutel-1234` staat nergens (stdout, stderr, rapport, bestanden).
- `src/lib/onderwijsApi.test.ts` test de hulp apart (K1).

#### 23.5.13 Eerste echte run in stappen (G1, regel 11)

1. `onderdelen=beroepskwalificaties`, `bk_onderdelen=504,1,505,8` plus één geldig 7de jaar en één BuSO OV3-onderdeel (de hoofdsessie kiest de nummers uit de matrix). Bevestigen: T1 tot T5 en T10, de vaste waarden van ronde 6 en 7, de omvang per bestand. PR nakijken en sluiten.
2. ±25 onderdelen verspreid over alle soorten (2de graad A gewoon, duaal, aanloop; 2de graad DU; 3de graad A gewoon en duaal; 3de graad DU; 2 DO; 3 zevende; 3 BuSO OV3; een aanloopgroep; de 1ste graad), **twee keer na elkaar**: de tweede run geeft 0 verschillen (T6). Bevestigen: T4, T8. PR's sluiten.
3. `onderdelen=beroepskwalificaties` volledig. Bevestigen: looptijd, aantal verzoeken, P5 tot P7, verdeling per soort, omvang, de datatest op de echte data. De data-PR nakijken met een steekproef van 5 richtingen (G-0393, G-0001, een richting met dubbele finaliteit, een 7de jaar, een BuSO OV3-opleiding) tegen het logboek van ronde 6 en twee competenties met hun kennis en vaardigheden. Samenvoegen op teken van de eigenaar (W11).
4. Daarna: `NR_STRENG`, `TEKST_STRENG`, `BK_A3_STRENG` en `ERKENNING_KRUIS_STRENG` op true waar de telling 0 is; BC1 erbij; de grens van P5 bijstellen; `timeout-minutes` bijstellen; `kanBkHebben` verruimen als het rapport DO of 1ste graad met BK toont; T7 en de werkkeuze W2 nakijken; de stand van zaken bijwerken.

Een afwijking van de vorm herstelt een kernbouwer als kleine aanpassing in `beroepskwalificaties.ts` of het script, met een test. Daarna start de stap opnieuw.

### 23.6 Datamodel in de app

#### 23.6.1 Hoe een leerplandoel naar een competentie verwijst

| Optie | Wat er breekt | Besluit |
|---|---|---|
| (a) Een beroepskwalificatie als "set" in `refs` | `sanitizeRefs` (curriculum.ts r. 239) gooit alles weg dat niet op `SET_ID` (`/^ODS_\d{1,9}$/`, r. 202) past. `SET_ID` verruimen raakt `minimumdoelenSets`, `weggelatenCodes`, `setAfdrukken` (fase 2), `oudeVersieIds` en elke lezer van `refs`; `dekkingMinimumdoelen` telt zulke refs als `buitenKader` en verandert. | afgewezen |
| (b) `refs` met een veld `soort` | Elke lezer van `refs` moet filteren: `dekkingMinimumdoelen`, `leerplannenBijRichting`, `codesVoorDoelen` (fase 2), `selectieVanLeerplan`, `curriculumCheck`, het inlezen, de verwijzingseditor. Eén vergeten filter telt een competentie als minimumdoel. Een oudere app gooit de ref toch weg. | afgewezen |
| (c) **Een apart veld `bkRefs`**, een eigen methode en een eigen lijst `bkVersies` | Geen enkele bestaande lezer ziet het. Alleen nieuwe code leest het. | **gekozen** |

#### 23.6.2 Types (`src/lib/curriculumTypes.ts`, K5)

```ts
export type CurriculumNet = 'minimumdoelen' | 'beroepskwalificaties' | 'go' | 'kov' | 'ovsg' | 'pov' | 'eigen';
// CURRICULUM_NETS krijgt na 'minimumdoelen': { id: 'beroepskwalificaties', label: 'Beroepskwalificaties (Vlaamse overheid)',
//   hint: 'Vlaamse kwalificatiestructuur' }. NET_KEUZES (leerplanNetten.ts) sluit het uit, zoals 'minimumdoelen'.
export type CurriculumMethode = … | 'beroepskwalificatie';   // competenties letterlijk uit één of meer BK-versies (bkLeerplan.ts)

/** Verwijzing van een leerplandoel naar één competentie van een beroepskwalificatie. Formaat nooit veranderen: telt mee in de vingerafdruk. */
export interface BkRef {
  /** BK-versie, bv. "BK-0390-2". */
  bk: string;
  /** competentie_code, bv. "bkc0039200": met `bk` de sleutel. */
  id: string;
}
/** Een BK-versie van een leerplan bij het maken: de eerste 16 hex-tekens van haar sha256 in de index, en of alle competenties gekozen werden. */
export interface BkVersieMerk { bk: string; sha: string; alle?: true }

export interface CurriculumGoal { /* … ongewijzigd … */ bkRefs?: BkRef[] }
export interface Curriculum {
  /* … ongewijzigd … */
  /** BK-versies van een BK-leerplan. Telt niet mee in de vingerafdruk (zoals minimumdoelenSets). */
  bkVersies?: BkVersieMerk[];
}
```

`Doelgroep` (`doelgroep.ts`) verandert niet. Een BK-leerplan krijgt `doelgroepVoorLeerplan(doelgroepVan(info, keuze, { vak }))`: zonder `kader`, `kaderVolledig`, `setAfdrukken` en `volgtKader`.

#### 23.6.3 Sanering en vingerafdruk (`src/lib/curriculum.ts`, K5)

| Plaats | Wijziging | Wat bestaande gegevens merken |
|---|---|---|
| `saneerDoel` (r. 300) | `sanitizeBkRefs`: een array; `bk` op `BK_VERSIE_ID` (inline regex, gelijk aan `BK_VERSIE`; een test vergelijkt de bron), `id` op `/^[A-Za-z0-9_.-]{1,64}$/` (getrimd; een getal wordt tekst); ontdubbeld op `bk + id`, hoogstens 10; leeg = weg. Idempotent. | niets: ze hebben het veld niet |
| `sanitizeCurriculumMetRapport` (r. 499) | Na de herkomst: `bkVersies` saneren (`bk` op `BK_VERSIE_ID`, `sha` op `/^[0-9a-f]{16}$/`, `alle` alleen `true`, ontdubbeld op `bk`, hoogstens 20). Is de methode niet `beroepskwalificatie`, dan vallen `bkRefs` op elk doel en `bkVersies` weg. | niets |
| `METHODES` (r. 226) | `'beroepskwalificatie'` erbij | niets |
| `doelenVingerafdruk` (r. 549) | Na `refsBron`, alleen als er verwijzingen zijn: `if (g.bkRefs && g.bkRefs.length > 0) o.bkRefs = g.bkRefs.map((r) => ({ bk: r.bk, id: r.id }));` | **niets**: zonder `bkRefs` is de JSON byte voor byte gelijk |
| `maakEigenKopie` (r. 612) | `bkRefs: g.bkRefs?.map((r) => ({ ...r }))` naast `refs`; `bkVersies` blijft. `zonderKaderVelden` staat er al (fase 2 A1). | niets |
| `leerplanStatus.ts` | `isBkLeerplan(cur) = cur.herkomst?.methode === 'beroepskwalificatie'`; `uitOfficieleBron` = `isOfficieel || isSamengesteld || isBkLeerplan` | niets: alleen voor de nieuwe methode |
| `leerplanNetten.ts` | `NET_KEUZES` laat ook `beroepskwalificaties` weg | de inleeswizard blijft gelijk |

**Gouden test (eerste stap van K5, vóór elke wijziging):** de vingerafdruk van (1) het voorbeeldleerplan uit `seed.ts`, (2) een samengestelde lijst uit de structuurfixtures, (3) een netleerplan met twee `refs` per doel en (4) een leerplan van vóór versie 2 gaat als vaste sha in `curriculum.test.ts`. Die waarden mogen na K5 niet veranderen. Daarnaast: een leerplan-JSON van vóór fase 3 komt diep gelijk door `sanitizeCurriculum`, zonder nieuwe sleutels, met dezelfde `effectieveStatus`; export en import v2 van een BK-leerplan houden "gecontroleerd"; een `bkRefs` op een leerplan van een net valt weg en dat leerplan wordt "gewijzigd" als het nagekeken was met die verwijzingen. Mutatieproef door de reviewer: zonder de regel in `doelenVingerafdruk` faalt de importtest.

Wat het effect van `uitOfficieleBron` is, nagekeken in de code: geen `DEEL_HINT` bij exporteren (CurriculaPage r. 337); geen MD-verwijzingen in LeerplanOpSlot (r. 39); niet in "Leerplan van je net" (RichtingLeerplannen r. 77) maar wel in "Leerplannen van deze richting op dit toestel" (r. 70: via de doelgroep), met status en aantal doelen; de inleespagina weigert het als bestaand leerplan (LeerplanInlezenPage r. 102; de zin daar wordt aangepast in S3). In de editor van CurriculaPage rekent `uitBron` (r. 455) nog zelf met `officieel || samengesteld`: S3 vervangt dat door `uitOfficieleBron`, anders verschijnt "Nakijken en bevestigen" bij een BK-leerplan.

#### 23.6.4 Het BK-leerplan (`src/lib/bkLeerplan.ts`, K6)

```ts
export function tekstVanCompetentie(c: Competentie): string;   // normaliseerDoeltekst(htmlNaarTekst(c.tekst)): bouwer én poort
export interface BkKeuze { bestand: BkBestand; competenties: readonly string[] }   // ALTIJD een lijst ids, nooit 'alle'
export function leerplanUitBk(keuzes: readonly BkKeuze[], o: {
  doelgroep: Doelgroep; merken: ReadonlyMap<string, string>;   // bk → 16 hex uit de index
  titel?: string; vak?: string; bestaand?: Curriculum;
}): { leerplan: Curriculum; rapport: ControleRapport; bevestigd: boolean; waarschuwingen: string[] };
export function controleerBkLeerplan(cur: Curriculum, bestanden: readonly BkBestand[]): ControleRapport;
export function selectieVanBkLeerplan(cur: Curriculum): Map<string, string[]>;      // bk → ids; leeg voor een ander leerplan
export function vindBkLeerplan(curricula: readonly Curriculum[], selectie: ReadonlyMap<string, readonly string[]>,
  doelgroep: Doelgroep, merken: ReadonlyMap<string, string>): Curriculum | undefined;
//   isBkLeerplan, kind ≠ 'eigen', effectieveStatus 'gecontroleerd', geen doelgroep van een andere groep, dezelfde selectie
//   (volgorde telt niet) én per BK hetzelfde versiemerk als nu
export function titelVoorBkLeerplan(info: RichtingInfo, titels: readonly string[], deel?: { gekozen: number; totaal: number }): string;
//   "Onthaalmedewerker · Onthaal en recreatie · 3de graad" · "Onthaalmedewerker en Recreatief medewerker · …" ·
//   "Onthaalmedewerker (8 van 12 competenties) · …"; hoogstens 120 tekens
```

**Een doel per competentie:** `code` uit `doelcodesVanBestand` ("BK-0390-2.03"); `text` = `tekstVanCompetentie(c)`; `theme` = "<BK-titel> › <type>", of de BK-titel zonder type (twee gekozen BK's met dezelfde titel krijgen " (BK-0390)" erachter); `bkRefs: [{ bk, id }]`; geen `refs`, geen `note`. Volgorde: de BK's in de gekozen volgorde, de competenties in de volgorde van het bestand.

**Het leerplan:** `net: 'beroepskwalificaties'`, `kind: 'leerplan'`, `subject` = het vak (anders de BK-titel), `level` = `graadTekst(info.graad)` (leeg zonder graad), `source` = "Vlaamse kwalificatiestructuur: Onthaalmedewerker (BK-0390-2)" (meer BK's met " · " ertussen, hoogstens 500 tekens), `herkomst: { methode: 'beroepskwalificatie', bronUrl: BK_BRON, ingelezenOp }`, `bkVersies: [{ bk, sha, alle? }]`, de doelgroep, nagekeken door `NAGEKEKEN_DOOR_BRON` met de samenvatting "Letterlijk overgenomen uit de beroepskwalificatie Onthaalmedewerker (12 competenties)."

**De nakijkpoort `controleerBkLeerplan`** (`curriculumCheck.ts` blijft ongewijzigd; `bevestigLeerplan` doet de rest, met `dekking: []` in het rapport). Fout als:
1. de methode niet `beroepskwalificatie` is, of een doel `refs` heeft, of het leerplan `minimumdoelenSets` heeft;
2. een doel niet precies één `bkRef` heeft, naar een BK uit `bkVersies` waarvan het bestand meegegeven is;
3. de competentie niet in dat bestand staat, of de tekst niet gelijk is aan `tekstVanCompetentie`;
4. een competentie twee keer voorkomt, of er twee versies van hetzelfde BK-nummer in staan;
5. een code niet uniek is (na `normalizeGoalCode`), langer is dan 60 tekens, of niet begint met de eigen BK-versie en een punt;
6. het leerplan meer dan 20 BK's of 5000 doelen heeft, of geen enkel doel.

Valt bij het saneren een doel of een `bkRef` weg, dan is het niet bevestigd en wordt er niets bewaard (zoals `leerplanUitSelectie`). Berichten in gewone taal, zonder competentiecode. De poort eist bewust niet dat een code gelijk is aan wat `doelcodesVanBestand` nu zou geven: "Werk het leerplan bij" houdt de oude codes.

**Bij `bestaand`** ("Werk het leerplan bij", zelfde versie): `bestaand` moet een BK-leerplan zijn met precies dezelfde lijst competenties per BK, anders gooit de functie een `Error` (het scherm biedt dan "Maak een nieuw leerplan" aan). Het id, `createdAt` en de code per `bk + id` blijven; teksten en versiemerken zijn nieuw; het leerplan wordt opnieuw nagekeken.

#### 23.6.5 Wat de bestaande paden met een BK-leerplan doen (nagekeken in de code)

| Pad | Gedrag | Waarom |
|---|---|---|
| `leerplanUitSelectie` met een BK-leerplan als `bestaand` | gooit een `Error` | doelenSamenstellen.ts r. 705: alleen `samengesteld` |
| SamenstellenPage `/:id` | "niet-samengesteld" | r. 89, `isSamengesteld` |
| `vindLeerplanMetSelectie`, `useBestaandLeerplan`, `vergelijkMetKader`, `veranderdSindsLeerplan` | geven niets, worden niet opgeroepen, of slaan het over | filteren op `samengesteld` (RichtingLeerplannen r. 73) |
| `dekkingMinimumdoelen` zonder optie | de cursus krijgt `geen-verwijzingen`; de getallen veranderen niet | rekent alleen met `refs` |
| Gaten dichten (fase 2) | 0 passende doelen; telt in `zonderPassend` | `codesVoorDoelen` rekent met `refs` |
| `leerplannenBijRichting` (venster, lijst) | het BK-leerplan staat erbij via de doelgroep | een cursus aan een bestaand BK-leerplan hangen mag |
| Mijn richtingen, klas met richting (fase 2) | een BK-cursus telt als cursus van de richting, telt niet mee in de MD-getallen | ze heeft een gewone `doelgroep` |
| GoalCoverage in de editor | de weergave "Leerplan" is al de dekking per competentie; geen schakelaar "Minimumdoelen" | de schakelaar verschijnt alleen met `refs` |

#### 23.6.6 Bijwerken na een maandelijkse update (`vergelijkMetBk`, K6)

```ts
export type BkMelding =
  | { soort: 'andere-versie'; bk: string; nu: string }             // de richting verwijst nu naar een andere versie van hetzelfde nummer
  | { soort: 'niet-meer-bij-richting'; bk: string }                // geen versie van dit nummer meer in het kader (herkomst 'api')
  | { soort: 'tekst-aangepast'; bk: string; aantal: number }       // zelfde lijst: "Werk het leerplan bij"
  | { soort: 'lijst-aangepast'; bk: string };                      // een competentie weg, of een nieuwe bij `alle`
export function vergelijkMetBk(leerplan: Curriculum, kader: RichtingBk, bestanden: ReadonlyMap<string, BkBestand>,
  merken: ReadonlyMap<string, string>): BkMelding[];               // [] voor kind 'eigen' of een ander leerplan
```

Regels: gelijk versiemerk → niets. Ander versiemerk → per competentie vergelijken met het huidige bestand (sleutel `bk + id`): ontbreekt een id, of staat er bij `alle` een nieuw id, dan `lijst-aangepast`; verschillen alleen teksten, dan `tekst-aangepast`; anders niets (kennis of context veranderde: niets te doen). Ontbreekt een bestand (404, onbruikbaar, laden mislukt), dan komt er geen melding: liever geen dan een valse. Een nieuwe versie wordt nooit in een bestaand leerplan geschoven.

#### 23.6.7 Wat nooit stil verandert

| # | Belofte | Bewaakt door |
|---|---|---|
| N1 | Een bestaand leerplan houdt zijn velden, zijn vingerafdruk en zijn nakijkstatus | gouden test (K5), examples.test.ts |
| N2 | Een BK-leerplan verandert alleen na een klik ("Werk het leerplan bij", "Maak een leerplan met de versie van nu") | geen enkel schrijfpad zonder knop; review I4 |
| N3 | Een doelcode wijst nooit naar een competentie van een andere versie | de versie zit in de code; poortregel 5 |
| N4 | Een BK-bestand of een record van de koppeling wordt nooit gewist | script en datatest (BX3, BX4) |
| N5 | De dekking op minimumdoelen is dezelfde met of zonder BK-cursussen, en zonder de nieuwe optie byte voor byte dezelfde | bestaande tests ongewijzigd groen, plus één nieuw geval in `dekkingMinimumdoelen.test.ts` |
| N6 | Een bestaande cursus wordt in fase 3 nooit aangepast; het geraamte bestaat alleen bij het maken | geen schrijfpad naar een bestaande cursus |
| N7 | De nakijkstatus is eerlijk: een BK-leerplan dat een oudere app zonder `bkRefs` bewaarde, is "gewijzigd" | `bewaakControle`, ongewijzigd |

#### 23.6.8 Samenleven met fase 2

| Bestand van fase 2 | Wat fase 3 eraan doet |
|---|---|
| `doelgroep.ts`, `richtingKader.ts`, `doelenSamenstellen.ts`, `courses.ts`, `classes.ts`, `MinimumdoelenDekking.tsx` | niets; alleen importeren |
| `curriculum.ts` | K5: de plaatsen van § 23.6.3, na fase 2 |
| `RichtingDekking.tsx`, `useRichtingDekking.ts` | S3: "Tel mee" bovenaan de sectie, een h3 "Minimumdoelen" alleen als er een BK-blok is, de plaats voor het BK-blok, en de redentekst bij een BK-cursus (`CursusUitkomst.bk`). Berekening en getallen blijven gelijk. |
| `richtingCursus.ts` | K7: één optionele parameter `hoofdstukken` in `cursusVoorRichting` |
| `NieuweRichtingCursus.tsx` (props vast in fase 2) | S2: twee optionele props, pas na fase 2 |
| `richtingOverzicht.ts` (`bijdragenVoorKader`, fase 2 A3) | het BK-blok gebruikt dezelfde functie, zodat "Tel mee" voor beide blokken hetzelfde betekent |

#### 23.6.9 Logica (K6 en K7)

```ts
// src/lib/beroepskwalificatiesBron.ts (K6, zoals studierichtingenBron.ts)
export const KWALIFICATIES_MAP = `${import.meta.env.BASE_URL}leerplannen/kwalificaties/`;
export const FOUT_BK = 'De beroepskwalificaties konden niet geladen worden. Controleer je verbinding en probeer opnieuw.';
export function laadBkKoppeling(): Promise<KoppelingBestand | null>;  // gedeelde belofte; 404 of 200 met text/html → null; fout → belofte gewist
export function laadBkIndex(): Promise<BkIndex | null>;
export function laadBk(versie: string): Promise<BkBestand | null>;     // ongeldig → Error zonder verzoek; 404 → null; cache van 20;
                                                                        // `bk` in het bestand = de gevraagde versie
export function wisBkCache(): void;
// Elk bestand gaat door zijn validator. Niets in localStorage.

// src/lib/richtingBk.ts (K6)
export type BkHerkomst = 'api' | 'geen' | 'nog-niet-opgehaald';
export interface RichtingBkRegel { bk: string; nummer: string; versie: number; titel: string; vks?: number; aantal?: number;
  onderdelen: number[]; alleOnderdelen: boolean; totDatum?: string; nieuwereVersie?: string; nietMeerInBron?: string; zonderBestand?: true }
export interface RichtingBk { herkomst: BkHerkomst; opgehaald?: string; bks: RichtingBkRegel[];
  bekrachtigingen: { naam: string; soort: 'onderwijskwalificatie' | 'beroepskwalificatie' | 'deelkwalificatie' | 'ander' }[];
  toekomst?: { vanaf: string; titels: string[] } }
export function bkKader(koppeling: KoppelingBestand | null, index: BkIndex | null, info: RichtingInfo,
  keuze: RichtingKeuze, vandaag: string): RichtingBk;
//   onderdelen: keuze.onderdeel, anders geldigeOnderdelen(info, vandaag); per onderdeel erkenningenOp(…).nu; unie op versie.
//   'api': minstens één onderdeel opgehaald (ook 'niet-gevonden' met een laatst bekend record); 'geen': alles opgehaald, geen BK;
//   'nog-niet-opgehaald': geen koppeling of geen enkel onderdeel opgehaald. Jaar en soort (OV4) veranderen niets.
//   totDatum: elke erkenning met deze BK heeft een einddatum (de vroegste). bks op titel (nl), dan vergelijkBkVersie.
//   toekomst: alleen als de BK's van de toekomstige erkenningen een andere lijst geven.

// src/lib/bkCursus.ts (K7)
export function bkGeraamte(leerplan: Curriculum, bestanden: ReadonlyMap<string, BkBestand>, codes?: readonly string[]): CourseChapter[];
//   een hoofdstuk per BK-versie (eerste deel van het thema, hoogstens 120) en een sectie per competentie
//   (titel shortGoalText(tekst, 110), goalCodes [code], nooit optioneel); blok 1: callout 'goal' "Doel in deze sectie" met
//   "<code> — <tekst>"; blok 2 (alleen als er kennis of vaardigheden zijn): callout 'goal' "Kennis en vaardigheden uit de
//   beroepskwalificatie" met regels "Kennis: …" en "Vaardigheid: …" (elk shortGoalText(…, 300), hoogstens 12 regels, daarna
//   "… en nog <n>: zie ‘Beroepskwalificaties’ bij de studierichting."). Beide blokken zijn doelen-callouts: de sectie telt als
//   gepland. Invariant van § 12.2: elke gekozen code in precies één sectie; sanitizeCourse laat alles staan.
//   Ontbreekt een bestand, dan geen blok 2 voor die BK.
export function cursusVoorBk(o: { titel: string; auteur: string; doelgroep: Doelgroep; leerplan: Curriculum;
  bestanden: ReadonlyMap<string, BkBestand>; codes?: readonly string[]; start: Startvorm }): Course;
//   = cursusVoorRichting({ …o, hoofdstukken: o.start === 'geraamte' ? bkGeraamte(…) : undefined })

// src/lib/dekkingBk.ts (K7)
export function bkKaderDoelen(kader: RichtingBk, bestanden: ReadonlyMap<string, BkBestand>): KaderDoel[];
//   set = bk, setNaam = titel, id = competentiecode, code = doelcode, tekst = tekstVanCompetentie, rubriek = type,
//   optioneel false, verplichteSet true
export function bkVerwijzingen(goal: CurriculumGoal): { set: string; id: string }[];   // bkRefs → {set: bk, id}
export function dekkingBk(kader: readonly KaderDoel[], bijdragen: readonly CursusBijdrage[], widgets: readonly Widget[]): MdDekking;
//   = dekkingMinimumdoelen(kader, bijdragen, widgets, { verwijzingen: bkVerwijzingen }). perSet = per BK;
//   zelfdeNummerAndereSet = dezelfde competentiecode via een andere versie. `samenvatting` wordt niet gebruikt (bkWeergave.ts).

// src/lib/dekkingMinimumdoelen.ts (K7, alleen dit)
//   nieuwe vierde parameter opties?: { verwijzingen?: (goal: CurriculumGoal) => readonly { set: string; id: string }[] },
//   standaard de huidige `verwijzingenVan(goal.refs)`, gebruikt in `heeftVerwijzingen` en in de lus; `percentVan` wordt geëxporteerd.

// src/lib/richtingCursus.ts (K7, alleen dit): cursusVoorRichting krijgt `hoofdstukken?: CourseChapter[]`, gebruikt bij 'geraamte'.

// src/lib/bkWeergave.ts (K7): elke tekst met een getal, enkelvoud en meervoud, zonder ADV-nummer of competentiecode.
```

### 23.7 Schermen en letterlijke teksten

**Waar het komt.** `kanBkHebben(info)` (in `src/components/richting/useRichtingBk.ts`, licht) is waar bij finaliteit A of DU, of soort `zevende`, `aanloop` of `buso`, en niet afgebouwd. Alleen dan laadt de hook `useRichtingBk` met een dynamische import de lader en `richtingBk.ts`, en geeft hij `{ status: 'niet-van-toepassing' }` of een `Laadstand<RichtingBk>`. De hook staat in `RichtingInhoud` (RichtingDetail.tsx); het resultaat gaat via `RichtingContext.bk?` (alleen het type in RichtingDoelen.tsx) naar de sectie, het venster en de dekking. De schermdelen zitten in het luie chunk `bk` (`src/components/richting/bk/`: `BkSectie.tsx` met `BkKopRegel`, `BkKaart.tsx`, `BkKeuze.tsx`, `BkDekking.tsx`). Css in `src/styles/beroepskwalificaties.css` (voorvoegsel `bk-`), alleen tokens. Icoon `BeroepIcon` = Lucide `BriefcaseBusiness`, niet in `EAGER_ICON_NAMES`.

**Het BK-nummer op het scherm: ja, als bijkomende info.** "officieel nummer BK-0390-2" staat in de meta van een kaart, in de bron van een BK-leerplan, en in de doelcode. Een set-id of een groepnummer is een interne sleutel van een database; het BK-nummer is de officiële, openbare aanduiding in de Vlaamse kwalificatiestructuur, waarmee een leerkracht of coördinator de beroepskwalificatie terugvindt. Het staat altijd ná de titel, nooit als enige naam en nooit in een kop of knop. **Nooit** op het scherm: de competentiecode, het ADV-nummer, het onderdeelnummer, het groepnummer (behalve de bestaande bronregel, § 14.9) en een set-id.

#### 23.7.1 Kopregel (`BkKopRegel`, onder de `.sub` van de richting, S1)

| Toestand | Tekst |
|---|---|
| Een tot drie BK's | "Beroepskwalificaties: Onthaalmedewerker en Recreatief medewerker." met de knop (btn-quiet, 44 px) "Naar de beroepskwalificaties": scrollt en zet de focus op `#ri-bk-kop` (`tabIndex={-1}`). Geen ankerlink: dat botst met de hash-router. |
| Meer dan drie | "Beroepskwalificaties: Onthaalmedewerker, Recreatief medewerker, Baliemedewerker en 2 andere." |
| Laden, fout, geen, niet van toepassing | geen regel |

#### 23.7.2 Sectie "Beroepskwalificaties" (na "De officiële minimumdoelen", vóór "Leerplannen", S1)

De sectie staat er als het kader BK's heeft, of als de richting finaliteit A of DU heeft (dan met de tekst voor "nog niet opgehaald" of "geen"). Bij een 7de jaar of BuSO zonder BK staat ze er niet.

| Waar | Tekst |
|---|---|
| h2 (`id="ri-bk-kop"`) | "Beroepskwalificaties" |
| Laden | `LaadBericht` "De beroepskwalificaties worden geladen…" |
| Fout | `FoutBericht` met `FOUT_BK` en "Opnieuw proberen" |
| Nog niet opgehaald | "De beroepskwalificaties van deze richting zijn nog niet opgehaald. Boosterz haalt ze elke maand op bij de Vlaamse overheid." |
| Geen | "De officiële bron koppelt geen beroepskwalificatie aan deze richting. De beroepsgerichte doelen staan dan in het leerplan van je net." |
| Intro | "Bij deze richting horen 2 beroepskwalificaties." / "Bij deze richting hoort 1 beroepskwalificatie." en "Een beroepskwalificatie beschrijft wat iemand moet kunnen om een beroep uit te oefenen: de competenties, met de kennis en vaardigheden die erbij horen. De beroepsgerichte vorming van de richting is erop gebouwd; de minimumdoelen hierboven gaan vooral over de basisvorming." |
| `details` (één keer) | summary "Wat betekent het niveau?" → "Het niveau in de Vlaamse kwalificatiestructuur gaat van 1 tot 8. Hoe hoger, hoe zelfstandiger en complexer het werk." |
| Kaart (`li` > `article`, h3) | de titel, bv. "Onthaalmedewerker" |
| Meta | "Niveau 3 · 12 competenties · officieel nummer BK-0390-2" (zonder niveau valt dat deel weg); erachter " · alleen in: duaal" (met `variantLabels`) of " · loopt af op 31 augustus 2027" als dat geldt |
| `details` | summary "Wat houdt dit beroep in?" met de definitie (alleen als ze er is) |
| `details` | summary "Toon de 12 competenties" → `ol`, per competentie de tekst, met een geneste `details` "Kennis en vaardigheden (8 + 5)" en daarin h4 "Kennis" en h4 "Vaardigheden", elk een `ul`. Een soort ("(<type>) " vooraan) alleen als er in die lijst meer dan één soort is; een h4 per soort competentie alleen als er meer dan één is. Leeg: "De bron geeft bij deze competentie geen kennis of vaardigheden." |
| Knoppen | primair "Maak een cursus met deze competenties" (sr-only " (Onthaalmedewerker)") · "Bewaar als leerplan" (alle competenties), of "Open het leerplan" als `vindBkLeerplan` er een vindt. Na het bewaren gaat de focus naar "Open het leerplan". |
| Nieuwere versie | `callout` (role note): "Er bestaat een nieuwere erkende versie van deze beroepskwalificatie. De richting verwijst nog naar deze versie; Boosterz volgt de richting." |
| Niet meer in de bron | `callout warn`: "De Vlaamse overheid geeft deze versie sinds 3 december 2026 niet meer. Je ziet de laatst bekende competenties." |
| Zonder bestand | "De competenties van deze beroepskwalificatie staan nog niet in Boosterz. Boosterz vraagt ze bij de volgende maandelijkse update opnieuw." De knoppen staan op `aria-disabled`, met "Nog nodig: de competenties van de beroepskwalificatie." |
| Toast | "Leerplan bewaard en nagekeken." |
| Niet nagekeken | `callout err`: "Het leerplan kon niet als nagekeken bewaard worden: <eerste waarschuwing>. Er is niets bewaard." |
| Melding `andere-versie` (op de kaart van de BK) | `callout warn`: "Je leerplan ‘<titel>’ volgt een vorige versie van ‘Onthaalmedewerker’. De richting verwijst nu naar een nieuwe versie. Boosterz past je leerplan niet zelf aan." · knop "Maak een leerplan met de versie van nu" · hint "Je cursussen blijven aan het oude leerplan hangen. De doelcodes van de nieuwe versie zijn andere: koppel een cursus pas om nadat je haar doelcodes nakeek." |
| Melding `tekst-aangepast` | `callout warn`: "De officiële tekst van 2 competenties van ‘Onthaalmedewerker’ werd aangepast sinds je ‘<titel>’ maakte." (enkelvoud "1 competentie") · knop "Werk het leerplan bij" · toast "Leerplan bijgewerkt. De doelcodes in je cursussen blijven dezelfde." |
| Melding `lijst-aangepast` | `callout warn`: "De officiële lijst competenties van ‘Onthaalmedewerker’ werd aangepast sinds je ‘<titel>’ maakte." · knop "Maak een nieuw leerplan met de lijst van nu" |
| Melding `niet-meer-bij-richting` (onder de kaarten) | `callout` (role note): "Je leerplan ‘<titel>’ volgt ‘<BK-titel>’, maar die beroepskwalificatie hoort volgens de officiële bron niet meer bij deze richting. Je leerplan blijft werken." |
| Toekomst | "Vanaf 1 september 2027 hoort bij deze richting: Onthaalmedewerker en Baliemedewerker." |
| `details` | summary "Wat leerlingen in deze richting kunnen behalen (5)" → per rij de naam, met " (onderwijskwalificatie)", " (beroepskwalificatie)" of " (deelkwalificatie)". Met een DBK de hint: "Een deelkwalificatie is een deel van een beroepskwalificatie. Welke competenties erbij horen, staat niet in de gegevens die Boosterz ophaalt." |
| Bronregel | "Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen, opgehaald op 3 november 2026. Boosterz toont de competenties letterlijk en verzint geen koppelingen." |

Na "Werk het leerplan bij" of "Maak een leerplan met de versie van nu" gaat de focus naar de kop van de sectie. Een BK-leerplan staat ook in de bestaande lijst "Leerplannen van deze richting op dit toestel" (vanzelf, via `uitOfficieleBron`); daar verandert niets.

**Bestaande zinnen.** In RichtingDoelen.tsx r. 370 en NieuweRichtingCursus.tsx r. 570 staat "De beroepsgerichte doelen staan in het leerplan van je net." Heeft het kader BK's, dan wordt dat: "De beroepsgerichte vorming staat in de beroepskwalificaties van deze richting, verderop op deze pagina." (venster: "…: kies daarvoor ‘De competenties van een beroepskwalificatie’."). Zonder BK's blijft de oude zin.

#### 23.7.3 Venster "Nieuwe cursus" (S2, `NieuweRichtingCursus.tsx`)

Nieuwe optionele props `bk?: Laadstand<RichtingBk>` en `startBk?: string`. De bestaande props en het gedrag voor een richting zonder BK's blijven gelijk. `Doelen` krijgt `'bk'`; ook bij een leeg MD-kader kan `'bk'` (vandaag wordt dat `'bestaand'`). `BkKeuze` laadt lui. De sectie opent het venster zelf, met `startBk`.

| Waar | Tekst en gedrag |
|---|---|
| fieldset "Welke doelen behandelt deze cursus?", vierde keuze (alleen met minstens één BK met bestand) | radio "De competenties van een beroepskwalificatie" · hint "Boosterz maakt een nagekeken leerplan met precies de competenties die je kiest. Minimumdoelen en competenties komen in aparte leerplannen: een cursus volgt één leerplan." |
| Standaard | `startBk` gegeven: deze keuze, alleen die BK aangevinkt, het vak gelijk aan haar titel. Een richting zonder minimumdoelen (herkomst `geen`) met BK's: deze keuze, en is er maar één BK, dan staat die aangevinkt. Anders blijft "Kies de sets voor deze cursus" de standaard. |
| Hint bij een andere keuze (A of DU) | "Geef je een beroepsgericht vak? Kies dan de competenties van een beroepskwalificatie." |
| Per BK (`BkKeuze`) | fieldset, legend "Onthaalmedewerker · 12 competenties" · vakje "Alle 12 competenties" (gedeeltelijk aangevinkt bij een deel) · `details` "Kies zelf de competenties (12 van 12)" met per competentie een vakje "<tekst>" (rij van 44 px) |
| Teller (`aria-live="polite"`) | "Je koos 12 competenties uit 1 beroepskwalificatie." · "Je koos 25 competenties uit 2 beroepskwalificaties." · "Je koos 1 competentie uit 1 beroepskwalificatie." · "Je koos nog geen competenties." |
| Titelvoorstel | `voorstelCursusTitel({ ...dg, vak: <BK-titel> })` = "Onthaalmedewerker · Onthaal en recreatie · 5de jaar"; bij meer BK's vak "Beroepsgerichte vorming" |
| "Met een geraamte" (hint bij deze keuze) | "Een hoofdstuk per beroepskwalificatie en een sectie per competentie, met de doelcode en de kennis en vaardigheden erop. Zolang een sectie leeg is, telt ze als ‘gepland’, nog niet als gedekt." |
| Voet | "Nog nodig: een titel, minstens één competentie." · laden: "De beroepskwalificaties worden geladen…" · fout: "Een beroepskwalificatie kon niet geladen worden. Probeer opnieuw." |
| Toast | "Cursus gemaakt: 1 hoofdstuk, 12 competenties klaar op de secties." (geraamte) · "Cursus gemaakt met 12 competenties van Onthaalmedewerker." (leeg) · bij hergebruik erachter " Er stond al een leerplan met precies deze competenties: de cursus hangt daaraan." |
| "Een leerplan dat al op dit toestel staat" met een BK-leerplan | het geraamte komt van `cursusVoorBk` (de BK-bestanden worden geladen), niet van `geraamteHoofdstukken`, dat alle competenties in één sectie "Vakspecifieke competentie" zou zetten |

Bij "Maak de cursus": de BK-bestanden laden; de selectie, altijd als lijst ids; `vindBkLeerplan`, anders `leerplanUitBk` (niet bevestigd: niets bewaren, de `callout err`); `saveCurriculum`; `cursusVoorBk` en `saveCourse` (lukt de cursus niet, dan wordt een nieuw leerplan weer gewist). Met AI: `setHandoff` met de `goalCodes` en de doelgroep, zoals nu.

#### 23.7.4 Dekking: tweede blok (S3)

In "Wat je cursussen samen dekken" staat "Tel mee" bovenaan zodra een van beide blokken getoond wordt; het geldt voor beide. Heeft de richting BK's, dan komt er een h3 "Minimumdoelen" vóór het bestaande blok (of vóór `geenDekkingTekst`) en daarna het luie `BkDekking`. Zonder BK's is de sectie letterlijk zoals nu. `BkDekking` rekent zelf zijn bijdragen met `bijdragenVoorKader` (fase 2), ook als het MD-blok `geen` is.

| Waar | Tekst |
|---|---|
| h3 | "Competenties van de beroepskwalificaties" |
| Samenvatting (`aria-live="polite"`) | "Je cursussen dekken 9 van de 25 competenties." en "4 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 11 nog niet." (enkelvoud "1 competentie staat al gepland …") |
| Zonder BK-cursus | "Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van de 25 competenties." |
| Per BK (`details`) | summary "Onthaalmedewerker: 5 van 12 gedekt (42 %)" (`percentVan`: 99 en niet 100 zolang er een niet gedekt is). Per competentie "<code> — <korte tekst>" met icoon én tekst: "Gedekt in ‘<cursus>’" · "Gepland in ‘<cursus>’ (de sectie is nog leeg)" · "Alleen in verdieping (‘<cursus>’)" · "Nog niet gedekt" |
| Toon | radio "Alle competenties" / "Nog niet gedekt" |
| Cursussen die niet meetellen | "4 cursussen van deze richting volgen geen beroepskwalificatie en tellen hier niet mee." (enkelvoud "1 cursus … volgt … telt …") · "Telt niet mee: het leerplan van deze cursus staat niet op dit toestel." |
| Andere versie | als `zelfdeNummerAndereSet > 0`: "3 competenties zouden meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij ‘Beroepskwalificaties’." |
| Blok "Minimumdoelen", bij een BK-cursus | "Telt hier niet mee: deze cursus volgt een beroepskwalificatie (zie ‘Competenties van de beroepskwalificaties’)." in plaats van "… verwijst niet naar minimumdoelen." Alleen de tekst; reden en getallen blijven. |
| "Cursussen voor deze richting", bij een BK-cursus | "Volgt een beroepskwalificatie: zie ‘Competenties van de beroepskwalificaties’ hieronder." |

#### 23.7.5 Leerplanpagina, lijst en inleespagina (S3)

- `OfficieelLabel` (ControleLabel.tsx) krijgt `soort: 'set' | 'samengesteld' | 'bk'`: "Officiële beroepskwalificatie", of "Kopie van een officiële beroepskwalificatie". `LeerplanOpSlot` en de lijst in CurriculaPage tonen het; de bronregel (`source`) staat er al.
- CurriculaPage, editor: `uitBron` via `uitOfficieleBron` (geen "Nakijken en bevestigen", geen `DEEL_HINT`); de keuzelijst "Net / uitgever" toont `beroepskwalificaties` alleen als het de huidige waarde is. Geen "Keuze aanpassen".
- LeerplanInlezenPage (r. 111) bij een BK-leerplan: "<titel> komt rechtstreeks uit een officiële beroepskwalificatie. Er valt niets in te lezen: de competenties staan letterlijk zoals in de officiële bron."

#### 23.7.6 Hulp (I3)

- "Hoe maak ik een cursus voor een beroepskwalificatie?" — "Open je studierichting bij Cursussen, ‘Voor een studierichting’. Bij een richting met beroepskwalificaties zie je per beroepskwalificatie de competenties, met de kennis en vaardigheden. Kies ‘Maak een cursus met deze competenties’: Boosterz maakt een nagekeken leerplan en een cursus met een sectie per competentie. Een AI-sleutel heb je daarvoor niet nodig."
- "Waar komen de beroepskwalificaties vandaan?" — "Uit de Vlaamse kwalificatiestructuur van de Vlaamse overheid. Boosterz haalt ze elke maand op en verzint geen koppelingen: welke beroepskwalificaties bij een richting horen, staat zo in de officiële bron."

#### 23.7.7 Toegankelijkheid en 390 px (voor S1 tot S3)

- Geen eigen `main`; één h1 per scherm. h2 voor de sectie, h3 per kaart en voor de blokken in de dekking, h4 voor kennis en vaardigheden; in het venster een h2.
- Vakjes en keuzerondjes in een fieldset met een legend. Tellers en samenvattingen in `aria-live="polite"`. Een status nooit alleen met kleur. Knoppen die nog niet kunnen: `aria-disabled` met "Nog nodig: …", nooit `disabled`.
- Summaries, knoppen en vakjesrijen minstens 44 px op ≤ 640 px. Op 390 px één kolom, `overflow-wrap: anywhere` voor titels, competenties en kennisteksten; niets scrolt horizontaal.
- Termen: leerplan, bewaren, nakijken, toewijzen; "competentie" en "beroepskwalificatie" volgen de bron. Nooit witte tekst op `--brand`.

### 23.8 Rooktest (R1)

**Sectie 20g** (fixtures, na 20f en vóór "21. Importeren"): `rtOpen('20g', { fixtures: true })` plus `page.route('**/leerplannen/kwalificaties/**')` op `tests/fixtures/kwalificaties/uit` (404 voor wat er niet is); verse opslag; tot slot "Terug zoals het was".

1. Detail G-0008 (`?jaar=3`): /Beroepskwalificaties: .+\./ onder de titel; "Naar de beroepskwalificaties" zet de focus op h2 "Beroepskwalificaties".
2. Kaart h3 met /Niveau \d · \d+ competenties · officieel nummer BK-\d+-\d+/; "Toon de N competenties" toont N `li`; een geneste "Kennis en vaardigheden"; "Wat leerlingen in deze richting kunnen behalen". Geen /ODS_|ADV-|bkc\d|G-0\d/ buiten `.ri-bron`.
3. "Maak een cursus met deze competenties": venster met de keuze aan; /Je koos (\d+) competenties uit 1 beroepskwalificatie\./ geeft n; één competentie uitvinken via "Kies zelf de competenties" geeft n-1 (de valkuil); "Maak de cursus" → `/cursus/bewerk/`.
4. localStorage: een leerplan met methode `beroepskwalificatie`, net `beroepskwalificaties`, status `gecontroleerd`, precies n-1 doelen met elk precies één `bkRefs` naar die BK, codes op /^BK-\d{3,6}-\d{1,4}\.\d{2,3}$/, zonder `refs` en zonder `minimumdoelenSets`; een cursus met `doelgroep.groep` G-0008, één hoofdstuk, n-1 secties met elk één `goalCode` en alleen doelen-callouts.
5. Terug op het detail: h3 "Competenties van de beroepskwalificaties" met /Je cursussen dekken 0 van de \d+ competenties\./ en /staan al gepland/; in het blok "Minimumdoelen" de BK-tekst bij die cursus.
6. "Bewaar als leerplan" bij de andere BK → toast "Leerplan bewaard en nagekeken.", daarna "Open het leerplan" met de focus erop; de leerplanpagina toont "Officiële beroepskwalificatie" en "Nagekeken".
7. G-0193: geen h2 "Beroepskwalificaties" en **geen enkel verzoek** naar `leerplannen/kwalificaties/` (`page.on('request')`).
8. Op 390 px: het detail met de kaarten en het venster; niets horizontaal, de nieuwe knoppen en vakjes minstens 44 px, 1 main en 1 h1.
9. Geen console- of paginafouten. Twee keer na elkaar groen.

**Sectie 20h** (echte data, na G1, `runIf` als `public/leerplannen/kwalificaties/koppeling.json` bestaat): G-0393 met alleen regex: de kopregel, minstens één kaart, "Toon de \d+ competenties".

### 23.9 Bundel

| Chunk | Verwacht | Budget | Hoe |
|---|---|---|---|
| Kritiek pad | ongewijzigd (stand na fase 2) | 334,2 kB of wat fase 2 meet | Geen gewijzigde module op het leerlingpad; `curriculum.ts` en `leerplanStatus.ts` laden lui; `EAGER_ICON_NAMES` blijft gelijk |
| RichtingenPage | ±66 → ±67,5 kB | 80 | alleen de hook, `kanBkHebben`, de kopregel-wrapper, de luie imports en het type in de context |
| BK-gegevens (lui) | ±8 tot 12 kB | 80 | lader, `richtingBk.ts`, validators |
| `bk` (lui) | ±25 tot 35 kB | 80 | sectie, kaart, keuze, dekking, `bkLeerplan`, `bkCursus`, `dekkingBk`, `bkWeergave` |
| curriculum | +±1 kB | – | `sanitizeBkRefs`, vingerafdruk, methode |
| CourseEditorPage | ongewijzigd | 80 | niets |

Elk S-pakket meet en meldt; de hoofdsessie meet na I2 en I3. Alleen de hoofdsessie raakt `vite.config.ts` aan.

### 23.10 Licentie en naamsvermelding

**In de app:**
- In de kop van elk bestand: `bron`, `api`, `naamsvermelding` en `licentie: "nog te bevestigen"`. De koppeling noemt de API Structuuronderdelen (zoals de matrix), de index en de BK-bestanden `BK_NAAMSVERMELDING`.
- Op het scherm de bronregel onder de sectie (§ 23.7.2), met de ophaaldatum.
- In elk BK-leerplan: `source` "Vlaamse kwalificatiestructuur: <titel> (BK-…)" en `herkomst.bronUrl` naar het portaal (zonder sleutel). Dat reist mee bij export en delen.
- BK-leerplannen gelden als "uit de officiële bron" (geen `DEEL_HINT`), zoals de minimumdoelen (W10).
- Het curriculumdossier (Word) wordt niet opgehaald, niet getoond en niet gelinkt.

**Werkkeuze voor de naamsvermelding:** "Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties)", zonder naam van een agentschap. ONDERWIJS-API.md noemt er geen; de opdracht noemt AKOV, LEERPLANNEN.md noemt de nieuwsbrief van de API Kwalificaties en Curriculum van AHOVOKS. Tot TechLoket antwoordt, noemen we geen naam die verkeerd kan zijn. Het is één constante en een nieuwe run.

**De eigenaar vraagt via het formulier van TechLoket Onderwijs** (sinds 24 maart 2026 de enige weg; mee met O9 en LEERPLANNEN.md § 12):
1. Onder welke licentie mogen de gegevens van de API Beroepskwalificaties en de API Structuuronderdelen bewaard worden in een publieke repository, letterlijk getoond in een publieke webapp, en opgenomen in leerplannen en cursussen die leerkrachten delen? Met welke naamsvermelding (welk agentschap)?
2. Blijft `competentie_code` gelijk over de versies van een beroepskwalificatie? Verandert een erkende versie nog na de erkenning? (T7, W2)
3. Waar staan de competenties van een deelkwalificatie (`BK-…-DBK-…`) in de API? (W4)
4. Een erkenning verwijst naar een oudere versie terwijl er een nieuwere erkend is: welke versie geldt voor de school?
5. Is er een publiek adres zonder sleutel voor een beroepskwalificatie, zodat de app ernaar kan verwijzen?

Tot dan blijft de werkwijze van laag 1: "nog te bevestigen", de bron vermelden, niets verzinnen. Een licentie voor de repo zelf (LEERPLANNEN.md § 12, punt 3) blijft een open punt vóór een brede uitrol.

### 23.11 Risico's

| # | Risico | Opvang |
|---|---|---|
| R1 | De vorm is niet bevestigd (§ 23.3) | Tolerante normalisatie, exit 3 alleen op wat een sleutel is, de veldinventaris, G1 in stappen, STRENG-vlaggen pas na G1 |
| R2 | Een detail negeert het nummer (zoals de lijst de filters negeert) | P3: het antwoord moet zijn eigen nummer of versie noemen |
| R3 | Een 404 is niet te onderscheiden van een kapot eindpunt | Tweede ronde, P5 en P6, laatst bekende records en bestanden blijven |
| R4 | `competentie_code` blijkt niet uniek, of `nr` onbruikbaar | Een dubbele code maakt de versie onbruikbaar (P7); zonder bruikbaar `nr` de plaats in de doelcode, geteld |
| R5 | `competentie_code` is niet stabiel over versies | Versie in de doelcode; een nieuwe versie geeft een nieuw leerplan; `versieOverlap` meet het |
| R6 | Een oudere app (tabblad niet herladen) ziet een BK-leerplan als "Gewijzigd na nakijken" en bewaart het zo | Kleine kans en zichtbaar; "Werk het leerplan bij" of "Bewaar als leerplan" maakt het opnieuw nagekeken |
| R7 | Een BK-probleem houdt ook de minimumdoelen en de matrix tegen | Noodinvoer `zonder-beroepskwalificaties`; KP3 en KP7 melden een andere matrix alleen |
| R8 | Looptijd ±12 tot 28 minuten extra | `timeout-minutes: 90`, meting in het rapport, bijstellen na G1 |
| R9 | De repo groeit met ±3 tot 10 MB; `sw.js` met ±15 tot 20 kB | Alleen gewijzigde bestanden in een PR; boven 15 MB beslist de eigenaar (bv. `referenties` en `extra` alleen in het rapport) |
| R10 | Base64 of grote velden in `extra` | Grens van 20 kB per veld; het dossier nooit; test |
| R11 | Een 404 op een databestand verschijnt als consolefout | Alleen verzoeken bij `kanBkHebben`; rooktest 20g stap 7; uitrol pas na de data-PR van G1 stap 3 |
| R12 | Een leerplan van een net of de AI met verzonnen BK-verwijzingen | `bkRefs` alleen bij methode `beroepskwalificatie`; de dekking telt strikt op officiële codes |
| R13 | Een samengeteld percentage over alle BK's misleidt | Percentage per BK; samen alleen aantallen |
| R14 | Het geraamte met kennis en vaardigheden maakt een cursus groter in localStorage | 300 tekens per regel, hoogstens 12 regels per sectie: ±10 tot 45 kB per cursus van 12 competenties |
| R15 | De licentie is niet bevestigd; een derde overheidsdataset publiek in de repo | Zelfde status als minimumdoelen en matrix; naamsvermelding overal; TechLoket vóór een brede uitrol |
| R16 | RichtingenPage nadert 80 kB | Alles lui behalve de hook en de kopregel; meting na I2 en I3 |

### 23.12 Open vragen voor de eigenaar (met werkkeuze)

- **W1.** Een gemengd leerplan, met minimumdoelen en competenties? **Werkkeuze: niet in fase 3**; twee cursussen. Het datamodel laat het later toe.
- **W2.** Een nieuwe BK-versie: een nieuw leerplan, of het leerplan bijwerken met de codes op `competentie_code`? **Werkkeuze: een nieuw leerplan**, tot TechLoket of de rapporten tonen dat de codes stabiel zijn.
- **W3.** Het detail van alle 833 geldige onderdelen, of alleen van de 510 met finaliteit A of DU? **Werkkeuze: alle.**
- **W4.** Deelkwalificaties als doelen? **Werkkeuze: nee, alleen bij naam.**
- **W5.** De studiebekrachtigingen tonen? **Werkkeuze: ja, ingeklapt** ("Wat leerlingen in deze richting kunnen behalen").
- **W6.** Kennis en vaardigheden: in het leerplan, of alleen op vraag en in het geraamte? **Werkkeuze: niet in het leerplan; wel in het geraamte (ingekort) en volledig op de richtingpagina.**
- **W7.** Het BK-nummer op het scherm? **Werkkeuze: ja**, na de titel, in de doelcode en in de bron van een leerplan; de competentiecode nooit.
- **W8.** Een percentage per beroepskwalificatie, geen samengeteld? **Werkkeuze: ja.**
- **W9.** De dekking strikt op versie + competentiecode, met een teller voor een andere versie? **Werkkeuze: ja** (zoals O6).
- **W10.** BK-leerplannen als "uit de officiële bron" (vrij te delen, met bronvermelding) tot TechLoket antwoordt? **Werkkeuze: ja, zoals de minimumdoelen.**
- **W11.** De data-PR van de eerste volledige BK-run: wie voegt samen? **Werkkeuze: de hoofdsessie na de checklist van § 23.5.13, op teken van de eigenaar.**
- **W12.** Mag de taak "Leerplangegevens bijwerken" tot 90 minuten duren? **Werkkeuze: ja**, bijgesteld na G1.
- **W13.** Mag het dataspoor (K1 tot K4 en G1) al naast fase 2 lopen? Het raakt geen bestand van fase 2. **Werkkeuze: nee, na fase 2 zoals afgesproken; op teken van de eigenaar mag het eerder.**
- **W14.** De BK-dekking ook in de cursuseditor, in "Mijn richtingen" en in de klas, en "Plan de competenties die nog nergens aan bod komen"? **Werkkeuze: later (fase 3b).**
- **W15.** De sectie ook bij 7de jaren en BuSO OV3? **Werkkeuze: ja, als de data er zijn.**

### 23.13 Bewust niet in fase 3

- Het curriculumdossier ophalen, ontleden, tonen of linken.
- De competenties van een deelkwalificatie raden, of een eigen koppeling richting → beroepskwalificatie maken. Zoeken van een beroepskwalificatie naar haar richtingen (de API heeft dat niet).
- Gemengde leerplannen (W1); doelcodes automatisch omzetten naar een nieuwe versie (W2); gaten dichten voor competenties en de BK-dekking buiten de richtingpagina (W14).
- "Keuze aanpassen" voor een BK-leerplan in de samenstelwizard: wie anders kiest, maakt een nieuw leerplan vanaf de richting.
- AI die BK-verwijzingen zet. Context, autonomie en verantwoordelijkheid op het scherm.
- Onderwijskwalificaties en opleidingsprofielen (404), opleidingstrajecten, het aanbod per school.
- De bestaande scripts laten overstappen op `onderwijsApi.mjs`: een aparte opruimtaak.

### 23.14 Nagekeken: wat de ontwerpen verkeerd lazen of misten

1. **Terugval van de doelcode** ("leerkracht eerst"): `${bk}.${competentie_code}` zou de competentiecode op het scherm zetten, tegen de eigen regel in, en `normalizeGoalCode` (curriculum.ts r. 77) maakt er hoofdletters van. Hier: de plaats in het bestand.
2. **Nakijkpoort** ("leerkracht eerst"): de eis "de code is `bkDoelcode`" botst met "Werk het leerplan bij", dat de oude codes houdt. Hier: uniek, ≤ 60, en het voorvoegsel van de eigen versie.
3. **Versiemerk in de koppeling** ("leerkracht eerst"): overbodig, omdat de koppeling alleen versienummers noemt; het zou de koppeling bij elke tekstcorrectie doen veranderen.
4. **Harde poort op de BK-lijst** ("data eerst", Q2 en Q4): de lijst is niet nodig voor de koppeling of de competenties. Hier zacht.
5. **Aparte dekkingsmodule** ("data eerst") of **namaakverwijzingen in het geheugen** ("leerkracht eerst"): hier één optionele parameter in `dekkingMinimumdoelen`; `dekkingMinimumdoelen` valideert de set niet (alleen `set|id`), dus de regels werken ongewijzigd voor competenties.
6. **Noodinvoer** (beide gemist): met de BK-stap in `alles` bestaat er geen run meer die minimumdoelen en studierichtingen samen haalt. `studierichtingen` alleen faalt op D3 zodra de minimumdoelen in de repo achterlopen ("Start de workflow met ‘alles’"). Daarom de keuze `zonder-beroepskwalificaties`. Ook de booleans in de samenvattingsstap (`metMinimumdoelen = onderdelen !== 'studierichtingen'`) moeten de nieuwe keuzes volgen.
7. **Editor en inleespagina** (beide gemist): CurriculaPage rekent `uitBron` (r. 455) zelf met `officieel || samengesteld` en zou "Nakijken en bevestigen" tonen; de inleespagina (r. 111) zegt "komt rechtstreeks uit de officiële minimumdoelen". Beide worden aangepast in S3.
8. **Consolefouten** (impliciet bij "leerkracht eerst", gemist bij "data eerst"): Chromium meldt elke 404 op een fetch als consolefout, en de rooktest faalt daarop. Geen verzoek buiten `kanBkHebben`, en uitrol na de echte data.
9. **Structuurfixtures** ("leerkracht eerst"): G-0393 toevoegen verandert de fixtures van fase 1 en hun reproductietests. Hier hangt de nagebootste koppeling aan G-0008, G-0009 en G-0193.
10. **`maakEigenKopie`**: beide schreven "na A1 van fase 2"; `zonderKaderVelden` staat er al (commit 7635d62).
11. **BK-leerplannen in "Leerplannen van deze richting"** ("data eerst" wilde ze uitsluiten): ze komen er vanzelf in via `uitOfficieleBron` en de doelgroep (RichtingLeerplannen r. 70), met status en aantal. Dat klopt; er is geen tweede lijst nodig.
12. Juist nagekeken in beide ontwerpen: de tellingen (347, 510, 833; één erkenning nu per geldig onderdeel; geen toekomstige), `sanitizeRefs` met `SET_ID` (r. 202, 239), `doelenVingerafdruk` (r. 549), `METHODES` (r. 226), `haalJson` (r. 270 tot 337), de zinnen in RichtingDoelen.tsx r. 370 en NieuweRichtingCursus.tsx r. 570, de bronregel met het groepnummer.

## Bijlage A. Pakketten

Uit de synthese, met bestanden, afhankelijkheden en acceptatiecriteria.

### P0 Ontwerp vastleggen en icoon

- **Wie:** hoofdsessie
- **Na:** -
- **Doel:** Het ontwerp en de stand van zaken in de repo zetten (werkwijze regel 9), en het icoon vastleggen dat de schermpakketten P8 en P9 allebei gebruiken. Zo is er geen afhankelijkheid tussen de worktrees.
- **Bestanden:** `docs/STUDIERICHTINGEN.md (nieuw)`, `CLAUDE.md`, `docs/ONDERWIJS-API.md`, `docs/LEERPLANNEN.md`, `src/components/icons.ts`, `docs/ontwerp/ICONEN.md`
- **Acceptatie:**
  - docs/STUDIERICHTINGEN.md bevat dit ontwerp, met bovenaan de tabel 'Stand van zaken' (elk pakket: stand en op wie)
  - CLAUDE.md verwijst in één regel naar docs/STUDIERICHTINGEN.md, buiten het werkwijzeblok. tools/maak-werkwijze-installer.mjs hoeft daarom niet te draaien
  - De stand van zaken en § 6 van ONDERWIJS-API.md wijzen naar public/leerplannen/structuur/studierichtingen.json en naar de koppeling op groepnummer, niet op naam. LEERPLANNEN.md vermeldt L6 als onderdeel van dit werk
  - icons.ts exporteert RichtingIcon (Lucide Signpost). ICONEN.md heeft er een regel voor. Het icoon staat niet in EAGER_ICON_NAMES
  - npm run lint, typecheck, npx vitest run en npm run build zijn groen

### P1 Datamodule studierichtingen

- **Wie:** kernbouwer
- **Na:** P0
- **Doel:** Een pure module met types, tolerante normalisatie, lijst- en paginahulp, validatie en kruiscontrole voor de matrix en de koppeling. Het script, de datatest en de app gebruiken ze alle drie.
- **Bestanden:** `src/lib/studierichtingen.ts (nieuw)`, `src/lib/studierichtingen.test.ts (nieuw)`
- **Acceptatie:**
  - Geen imports en alleen erasable TypeScript. Een test laadt de module met Node: execFileSync node --input-type=module -e "await import('./src/lib/studierichtingen.ts')"
  - De exports en signaturen zijn exact die van § 4 van het ontwerp, met de velden van § 3.2 tot § 3.4. Het veld ov4 komt uit ov4_mogelijk, niet uit hoofdstructuur 321
  - normaliseerGroep is tolerant: tekst of object, een lijst met één element, onbekend veld naar extra, api_url valt weg, __proto__ via defineProperty. Een ongeldig of dubbel nummer komt in problemen
  - lijstVanPagina vindt de enige lijst met groepnummers onder elke sleutel. Bij nul of meer dan één zulke lijst geeft ze een fout. volgendeLink zet een spatie om naar %20
  - Elke validator heeft minstens 3 positieve en 6 negatieve gevallen. stroomVanEersteGraad, soortVanGroep, jaarVan (1 tot 7), isAfgebouwd, groepnummersVanDoel (de vorm van ODS_3116) en kruiscontrole zijn getest
  - Lint (0 fouten, niet meer dan 48 waarschuwingen), typecheck en npx vitest run zijn groen

### P2 Ophaalscript, nagebootste API en fixtures

- **Wie:** kernbouwer
- **Na:** P1
- **Doel:** tools/leerplannen/haal-studierichtingen.mjs haalt de matrix en de koppeling per groepnummer op. Het controleert hard tegen de minimumdoelen en schrijft git-vriendelijke bestanden, of niets. Daarnaast komt er een nagebootste API en een set fixtures die het script zelf maakt.
- **Bestanden:** `tools/leerplannen/haal-studierichtingen.mjs (nieuw)`, `tools/leerplannen/maak-nagebootste-koppeling.mjs (nieuw)`, `src/lib/studierichtingen.script.test.ts (nieuw)`, `tests/fixtures/structuur/api/matrix.json (nieuw)`, `tests/fixtures/structuur/api/koppeling.json (nieuw)`, `tests/fixtures/structuur/uit/** (nieuw, uitvoer van het script)`
- **Acceptatie:**
  - De CLI, de omgevingsnamen (ONDERWIJSDOELEN_API_KEY, ONDERWIJSDOELEN_API_BASE, STRUCTUURONDERDELEN_API_BASE, ONDERWIJSDOELEN_WACHT_FACTOR), de uitgangscodes, de bestanden en het rapport zijn exact zoals in § 3 en § 5
  - De set komt uit M.setVan(record).setSleutel en het vaste nummer uit M.normaliseerRecord(record)?.doel.id. Er is geen eigen afleiding
  - Elke harde poort (L1, D1 tot D8, en de gevallen van exit 1 en 2) heeft een integratietest met de verwachte exitcode. Bij een stop wordt niets geschreven behalve het rapport
  - Een tweede run met dezelfde invoer raakt geen enkel bestand aan (bytes en mtime gelijk). De uitvoer hangt niet af van de invoervolgorde
  - 404 werkt zo: één keer 404 en daarna 200 geeft gekoppeld. Twee keer 404 geeft 'geen', en een bestaand bestand blijft staan met nietMeerInBron. De 1ste graad krijgt methode graad-en-stroom, en bij 200 de methode api met een melding. Verdwenen groepen en onderdelen krijgen nietMeerInBron en worden nooit gewist
  - --alleen matrix werkt de index bij zonder verzoeken. --groepen raakt de andere bestanden niet aan
  - Een herkenbare nepsleutel staat in geen enkele uitvoer. Een doorverwijzing of een link naar een andere origin wordt nooit gevolgd. Tests schrijven alleen in een tijdelijke map (eisRapport)
  - De fixtures bestaan voor de 9 groepen uit § 3.6. tests/fixtures/structuur/uit is de uitvoer van het script met --nu en --vandaag. Een test (runIf als alle versiemerken kloppen) bewijst dat opnieuw draaien byte voor byte dezelfde uitvoer geeft. maak-nagebootste-koppeling.mjs zegt in commentaar en in uitvoer dat het om een nagebootste koppeling gaat
  - Lint, typecheck en npx vitest run zijn groen. haal-minimumdoelen.mjs en minimumdoelen.ts zijn byte voor byte gelijk (git diff leeg)

### P3 Datatest op de meegeleverde bestanden

- **Wie:** bouwer (een andere agent dan die van P2; mag starten na P1, oplevering na P2)
- **Na:** P1, P2
- **Doel:** Een onafhankelijke controle van de matrix, de index en de koppelingsbestanden, met kruisregels naar de minimumdoelen en de versietolerantie. De test draait in de uitrolpoort en in de workflow.
- **Bestanden:** `src/lib/studierichtingen.data.test.ts (nieuw)`
- **Acceptatie:**
  - Geschreven alleen uit de invarianten M1 tot M7, I1 tot I5 en F1 tot F6 van § 8, met de versieregel van § 7
  - De echte data wordt alleen getest als ze bestaat (describe.runIf). Zonder data is de test overgeslagen en groen. Een harde fout volgt als er richtingdoelen-bestanden staan zonder index
  - De fixtures in tests/fixtures/structuur/uit gaan als positief geval door
  - Een zelftest in een tijdelijke map bewijst dat minstens 8 gebroken invarianten gevonden worden: sha256, sortering, onbekende set, onbekend nummer bij een gelijk versiemerk, graadconflict, index tegenover bestand, dubbel groepnummer, graad-en-stroom buiten de 1ste graad
  - Bij een ander versiemerk komt er console.info en geen fout. KRUISCONTROLE_STRENG en ONDERWIJSSOORT_STRENG staan op false, met uitleg in commentaar
  - Lint, typecheck en npx vitest run zijn groen

### P4 Workflow 'Leerplangegevens bijwerken'

- **Wie:** bouwer (nagelezen door een reviewer met de invalshoek veiligheid, niet door de schrijver)
- **Na:** P2
- **Doel:** minimumdoelen.yml haalt de minimumdoelen, de matrix en de koppeling op in één run, met de volledige testsuite als poort en één pull request. Proefruns zijn mogelijk met groepen.
- **Bestanden:** `.github/workflows/minimumdoelen.yml`
- **Acceptatie:**
  - De stap 'Minimumdoelen ophalen' is inhoudelijk ongewijzigd (env en run). Er komt alleen if: inputs.onderdelen != 'studierichtingen' bij
  - Er is een nieuwe stap 'Studierichtingen en koppeling ophalen' met if: inputs.onderdelen != 'minimumdoelen'. Het geheim staat alleen in de env van de twee ophaalstappen, en beide draaien vóór npm ci --ignore-scripts
  - De invoer onderdelen (alles|minimumdoelen|studierichtingen) en groepen gaat via env. GROEPEN wordt nagekeken tegen ^(geen|G-[0-9]{4,6}(,G-[0-9]{4,6}){0,49})?$
  - De controlestap is npx vitest run (alle tests). Er zijn twee artifacts (always). De samenvatting en de PR-tekst bevatten de delen uit § 6, met alle tekst uit de API via kort(). Bij een proefrun staat er 'Proefrun … niet samenvoegen'
  - name 'Leerplangegevens bijwerken', concurrency leerplangegevens, timeout-minutes 60, branch leerplangegevens/bijwerken-<datum>-<run>, git add -- public/leerplannen. Een PR die niet opent, laat de taak zichtbaar falen (zoals nu)
  - De YAML wordt geparsed met een parser (python3 yaml of een node-script in de scratchpad). npx vitest run is groen

### P5 Doelgroep in het datamodel

- **Wie:** kernbouwer
- **Na:** P0
- **Doel:** Een optioneel, gesaneerd veld doelgroep op Curriculum en Course. Het overleeft elke grens (export, deellink, bestand, klaspakket, AI, opnieuw samenstellen, inlezen, overdracht) en raakt de nakijkstatus niet.
- **Bestanden:** `src/lib/doelgroep.ts (nieuw)`, `src/lib/doelgroep.test.ts (nieuw)`, `src/lib/courseTypes.ts`, `src/lib/courses.ts`, `src/lib/aiCourse.ts`, `src/lib/handoff.ts`, `src/lib/curriculumTypes.ts`, `src/lib/curriculum.ts`, `src/lib/doelenSamenstellen.ts`, `src/lib/leerplanInlezen.ts`, `src/lib/courses.test.ts`, `src/lib/courses.gedeeld.test.ts`, `src/lib/aiCourse.test.ts`, `src/lib/curriculum.test.ts`, `src/lib/doelenSamenstellen.test.ts`, `src/lib/leerplanInlezen.test.ts`
- **Acceptatie:**
  - sanitizeDoelgroep volgt § 10.1: idempotent, weert __proto__, laat ongeldige velden weg, een jaar moet bij de graad passen. doelgroep.ts heeft geen imports
  - De doelgroep telt niet mee in doelenVingerafdruk: een nagekeken leerplan blijft nagekeken als er een doelgroep bijkomt of afgaat
  - Het veld overleeft: export en import v2, encodeCourseToUrl/decodeCourseFromParam (v blijft 1), het cursusbestand, het klaspakket, comparable, leerplanUitSelectie met bestaand ('Keuze aanpassen'), bouwOntwerp en peekHandoff
  - sanitizeAICourse zet doelgroep: base?.doelgroep na ...resolved. Een doelgroep uit de AI-uitvoer wordt genegeerd
  - Bestanden en links zonder doelgroep blijven ongewijzigd: examples.test.ts en courses.gedeeld.test.ts zijn groen zonder aanpassing van bestaande verwachtingen
  - vite.config.ts is niet aangeraakt. npm run build meldt geen groei van het kritieke pad door dit pakket
  - Lint, typecheck en npx vitest run zijn groen

### P6 Lader, kader en keuzehulp

- **Wie:** bouwer
- **Na:** P1, P2, P5
- **Doel:** De app laadt matrix en koppeling lui en berekent per richting, jaar en soort het doelenkader volgens R1 tot R7, zonder zelf koppelingen te maken. Daarnaast komen de kleine uitbreidingen van de keuzelogica, met de regressie op de valkuil.
- **Bestanden:** `src/lib/studierichtingenBron.ts (nieuw)`, `src/lib/studierichtingenBron.test.ts (nieuw)`, `src/lib/richtingKader.ts (nieuw)`, `src/lib/richtingKader.test.ts (nieuw)`, `src/components/richting/useRichtingGegevens.ts (nieuw)`, `src/lib/setKeuze.ts`, `src/lib/setKeuze.test.ts`, `src/lib/samenstelKeuze.ts`, `src/lib/samenstelKeuze.test.ts`
- **Acceptatie:**
  - De signaturen zijn exact die van § 9.3 en § 9.4. Afwijken mag alleen na overleg met de hoofdsessie
  - De lader gebruikt een gedeelde belofte of een cache van 20 en wist die bij een fout. Hij valideert met de functies uit P1, weigert een ongeldig groepnummer zonder verzoek en geeft de Vlaamse foutmeldingen uit § 9.4
  - bouwKader past R1 tot R7 toe, met ov4 voor BuSO, een deelset met versieGelijk, en uitbreidingssets als niet verplicht. Wat wegvalt, staat in nietVoorDitJaar, verborgenOud, verborgenAndereSoort en onbekend. De kadertests draaien ook op tests/fixtures/structuur/uit (G-0193, G-0307, G-0002)
  - naarSetKeuzes geeft voor een deelset altijd een lijst nummers, nooit 'alle'. Een regressietest in samenstelKeuze.test.ts toont dat een deelset van 4 van 13 na beginUitKeuze en bouwSetKeuzes 4 doelen blijft
  - setKeuze.ts exporteert setNoemtVak, en kandidaatSets gebruikt het. kandidaatSets aanvaardt richtingSets (kadersets eerst, en de lijst blijft daartoe beperkt). Zonder die optie zijn de uitkomsten ongewijzigd: de bestaande tests zijn groen
  - runIf echte data: voor elke gekoppelde groep en elk jaar hoogstens 50 sets en 5000 doelen
  - Lint, typecheck en npx vitest run zijn groen

### P7 Cursushulp-logica

- **Wie:** bouwer
- **Na:** P5, P6
- **Doel:** Het leerplan van een richting (of een deel ervan) maken of hergebruiken, een vakvoorstel doen, en een cursus bouwen zonder AI: een geraamte met de doelcodes al op de secties.
- **Bestanden:** `src/lib/richtingCursus.ts (nieuw)`, `src/lib/richtingCursus.test.ts (nieuw)`
- **Acceptatie:**
  - De signaturen zijn exact die van § 11.1 en § 12.1
  - leerplanVoorRichting levert via leerplanUitSelectie een samengesteld leerplan met doelgroep (kader, volgtKader, zonder jaar). Op echte sets (runIf, het kader van G-0193 uit de fixtures) is het bevestigd. Een deelset geeft precies de nummers van de koppeling, niet de hele set
  - Het geraamte zet elke gekozen code in precies één niet-optionele sectie. De hoofdstukken volgen de setvolgorde en de secties de rubrieken, met de terugval 'Doelen' en de grens van 400. Elke sectie heeft één callout met kind 'goal'. sanitizeCourse(geraamte) laat alles staan
  - vakVoorstel zet STEM-sets apart en vinkt ze nooit vooraf aan. vindLeerplanMetSelectie geeft alleen een exacte selectie terug, nooit een eigen kopie. Titels zijn hoogstens 120 tekens
  - leerplannenBijRichting telt de overlap op set + vast nummer. vergelijkMetKader en passendeCodes zijn getest
  - Geen React en geen DOM. Lint, typecheck en npx vitest run zijn groen

### I1 Integratie van de data

- **Wie:** hoofdsessie
- **Na:** P1, P2, P3, P4
- **Doel:** P1 tot P4 samenvoegen en controleren, zodat de eerste echte run kan starten terwijl de rest verder bouwt.
- **Bestanden:** `(integratie van P1 tot P4)`, `docs/STUDIERICHTINGEN.md (stand van zaken)`
- **Acceptatie:**
  - De kwaliteitspoort uit CLAUDE.md is groen: lint, typecheck, vitest en build
  - Commit en push naar claude/bookwidgets-web-app-kvcfim. De deploy-workflow is groen
  - De stand van zaken is bijgewerkt

### G1 Eerste echte run in stappen

- **Wie:** hoofdsessie
- **Na:** I1
- **Doel:** De vorm bevestigen met echte antwoorden (regel 11) en de eerste matrix en koppeling in de repo krijgen.
- **Bestanden:** `public/leerplannen/structuur/** (via de PR van de workflow)`, `src/lib/studierichtingen.data.test.ts (de STRENG-vlaggen en F7)`, `src/lib/richtingKader.ts (R4 als het moet)`, `docs/STUDIERICHTINGEN.md`, `docs/ONDERWIJS-API.md`
- **Acceptatie:**
  - De drie stappen van § 17 zijn uitgevoerd, de rapporten gelezen en de proef-PR's gesloten
  - De checklist is afgewerkt: lijstpad, 545 groepen, de 404-regel per soort, onderwijssoort, versiemerken, 7de jaren, BuSO, groepen met alleen duale onderdelen, '3de leerjaar' in de 3de graad, kruiscontrole, looptijd. Afwijkingen zijn verwerkt als kleine aanpassingen met een test (door een kernbouwer)
  - De data-PR van de volledige run is nagekeken (een steekproef van 5 richtingen tegen onderwijsdoelen.be) en samengevoegd op teken van de eigenaar
  - De STRENG-vlaggen staan aan waar de tellingen 0 zijn. F7 (G-0193 in ODS_3132) staat in de datatest. De stand van zaken is bijgewerkt

### I2 Integratie van de logica en stubs voor de schermen

- **Wie:** hoofdsessie
- **Na:** P5, P6, P7
- **Doel:** P5 tot P7 samenvoegen en de twee componenten vastleggen die P8 en P9 delen, zodat de drie worktrees parallel kunnen bouwen.
- **Bestanden:** `(integratie van P5 tot P7)`, `src/components/richting/NieuweRichtingCursus.tsx (stub met de vaste props uit § 12.3)`, `src/components/richting/RichtingKiezerModal.tsx (stub met de vaste props uit § 12.3)`
- **Acceptatie:**
  - De stubs exporteren de componenten met exact de props uit § 12.3 en tonen een eenvoudige Modal met de juiste h2
  - De kwaliteitspoort is groen. Commit en push

### P8 Richtingenscherm

- **Wie:** bouwer (worktree A)
- **Na:** I2
- **Doel:** Het hulpmiddel zelf: een lijst en een detail per richting en jaar, met de doelen en hun herkomst, de leerplannen (officieel en van het net), en de cursussen van de richting (koppelen, weghalen, herkoppelen).
- **Bestanden:** `src/pages/RichtingenPage.tsx (nieuw)`, `src/components/richting/RichtingLijst.tsx (nieuw)`, `src/components/richting/RichtingDetail.tsx (nieuw)`, `src/components/richting/RichtingDoelen.tsx (nieuw)`, `src/components/richting/RichtingLeerplannen.tsx (nieuw)`, `src/components/richting/RichtingCursussen.tsx (nieuw)`, `src/components/richting/CursusKoppelen.tsx (nieuw)`, `src/styles/richtingen.css (nieuw)`, `src/App.tsx`, `src/lib/paginaTitel.ts`, `src/lib/paginaTitel.test.ts`
- **Acceptatie:**
  - Raakt geen bestanden van P9 of P10. NieuweRichtingCursus wordt alleen via de props uit § 12.3 gebruikt
  - De route /cursussen/richtingen/:groep? is lui geladen. paginaTitel geeft 'Studierichtingen', en de test is uitgebreid
  - Alle schermteksten staan er letterlijk zoals in § 14.2 en § 14.3 (de delen zonder de dekking), met de tekstbank van § 14.9. Er staat geen groepnummer op het scherm, behalve in de bronvermelding
  - Querystring-parameters worden gevalideerd. Een onbekende groep geeft 'Studierichting niet gevonden'. Zonder data in public/leerplannen/structuur verschijnt de vriendelijke melding, zonder console-fouten
  - 'Bewaar als leerplan' bewaart alleen een bevestigd leerplan. 'Koppel een bestaande cursus' bewaart met saveCourseGuarded
  - Eén h1, geen eigen main. Werkt op 390 px zonder horizontaal scrollen en volledig met het toetsenbord. Tellers staan in aria-live. Een status nooit alleen met kleur
  - npm run build: het chunk RichtingenPage blijft onder 80 kB en de meting van het kritieke pad staat in de oplevering. vite.config.ts is niet aangeraakt. Lint, typecheck, vitest en de bestaande rooktest zijn groen (handmatig nagekeken op de fixtures)

### P9 Cursus maken, koppelen en instellen

- **Wie:** bouwer (worktree B)
- **Na:** I2
- **Doel:** Een cursus maken voor een richting (geraamte, leeg of AI), een richting kiezen in de cursusinstellingen, en de ingangen en de doelgroep in de cursuslijst.
- **Bestanden:** `src/components/richting/NieuweRichtingCursus.tsx (vervangt de stub)`, `src/components/richting/RichtingKiezerModal.tsx (vervangt de stub)`, `src/styles/richtingcursus.css (nieuw)`, `src/pages/CoursesPage.tsx`, `src/pages/CourseEditorPage.tsx`, `src/components/course/CourseAIModal.tsx`, `tests/ai/mock-cursus.mjs`
- **Acceptatie:**
  - De props van NieuweRichtingCursus en RichtingKiezerModal zijn exact die van § 12.3. De teksten staan er letterlijk zoals in § 14.4, § 14.5 en § 14.7 (CoursesPage)
  - Zonder AI-sleutel werkt alles (geraamte of leeg). De AI-keuze staat dan op aria-disabled, met uitleg. Met een sleutel gaat de overdracht naar /cursussen?ai=nieuw met doelgroep. CourseAIModal krijgt de nieuwe props initialSubject en initialAudience, en onResult bewaart de doelgroep
  - Er wordt niets bewaard als het leerplan niet bevestigd is. Bij een volle opslag wordt een leerplan dat net nieuw gemaakt werd, teruggedraaid. Een bestaand leerplan met dezelfde selectie wordt hergebruikt
  - Standaard staat 'Kies de sets voor deze cursus' aan, met het vakvoorstel. STEM-sets staan niet vooraf aangevinkt. 'Liever per doel kiezen?' linkt naar samenstellen met richting, sets en zelf
  - RichtingKiezerModal wordt lui geladen in CourseSettingsModal. Het chunk van CourseEditorPage blijft onder 80 kB
  - node tests/ai/mock-cursus.mjs is groen, met het nieuwe geval. De rooktest-checks op /cursussen blijven groen. Lint, typecheck, vitest en build zijn groen

### P10 Samenstellen en inlezen met een richting

- **Wie:** bouwer (worktree C)
- **Na:** I2
- **Doel:** De bestaande wizards nemen een richting mee. Samenstellen begint met de koppeling of werkt een bewaarde keuze bij. Inlezen krijgt de juiste setvoorstellen en de doelgroep. LeerplanOpSlot toont de studierichting.
- **Bestanden:** `src/pages/SamenstellenPage.tsx`, `src/pages/LeerplanInlezenPage.tsx`, `src/components/curriculum/inlezen/useSetKandidaten.ts`, `src/components/curriculum/LeerplanOpSlot.tsx`
- **Acceptatie:**
  - ?richting=…&jaar=…&soort=…[&sets=][&zelf=] laadt matrix, koppeling en index vóór de wizard monteert, begint bij stap 2 met beginUitKeuze(selectieVanKader(…)), stelt titelVoorRichtingLeerplan voor en bewaart de doelgroep. Na het bewaren gaat het naar de richting, met de toast uit § 14.6
  - /:curriculumId?richting= begint met de bewaarde keuze zonder de vervallen doelen. De remount-key bevat de nieuwe parameters
  - Zonder ?richting werkt alles letterlijk zoals nu: rooktest 20b-3 is groen zonder aanpassing. Ongeldige parameters worden stil genegeerd en gemeld, zoals linkOvergeslagen
  - /leerplannen/inlezen?richting= vult graad, stroom en onderwijs vooraf in, geeft richtingSets door aan kandidaatSets en bewaart de doelgroep via bouwOntwerp
  - LeerplanOpSlot toont het feit 'Studierichting' alleen als er een doelgroep is
  - Lint, typecheck, vitest, build en de bestaande rooktest zijn groen

### I3 Integratie van de schermen: ingangen, hulp, budget

- **Wie:** hoofdsessie
- **Na:** P8, P9, P10
- **Doel:** De worktrees samenvoegen, de ingangen en de hulp in de gedeelde schil aanpassen, en het bundelbudget bewust en gemeten verhogen.
- **Bestanden:** `(integratie van P8 tot P10)`, `src/components/Layout.tsx`, `src/pages/MinimumdoelenPage.tsx`, `src/components/curriculum/LeerplanWegwijzer.tsx`, `src/pages/HelpPage.tsx`, `vite.config.ts`, `docs/STUDIERICHTINGEN.md`
- **Acceptatie:**
  - De ingangen en de FAQ staan er letterlijk zoals in § 14.7 en § 14.8. De checks van de rooktest op /leerplannen (aantal lw-weg, keuzehulp, knoppen in de page-head) en op /hulp (minstens 6 details) blijven ongewijzigd groen
  - Het kritieke pad is gemeten. CRITICAL_PATH.maxKb is bewust verhoogd tot de meting + 0,5 kB (verwacht 333,5), met een geschiedenisregel. Elk chunk blijft onder zijn budget
  - De volledige kwaliteitspoort is groen, ook de rooktest en mock-studio. Commit en push

### P11 Dekkingsmodule (L6)

- **Wie:** kernbouwer (mag starten na P6, naast fase B)
- **Na:** P5, P6
- **Doel:** Een pure functie die per minimumdoel van een kader de dekking geeft over één of meer cursussen, via de refs op set + vast nummer. Ook als de cursussen aan verschillende leerplannen hangen, met de status 'gepland' en de redenen waarom een cursus niet meetelt.
- **Bestanden:** `src/lib/dekkingMinimumdoelen.ts (nieuw)`, `src/lib/dekkingMinimumdoelen.test.ts (nieuw)`, `src/lib/coverage.ts (alleen de nieuwe exports sectieHeeftInhoud en geplandeRijen)`, `src/lib/coverage.test.ts (alleen nieuwe gevallen)`
- **Acceptatie:**
  - De signaturen en regels zijn exact die van § 13.1 en § 13.2: gedekt > gepland > verdieping > open, strikt op set + vast nummer, buitenKader, zelfdeNummerAndereSet, de drie redenen, optionele doelen en uitbreidingssets buiten het totaal en het percentage
  - computeCoverage is ongewijzigd (diff) en de bestaande gevallen in coverage.test.ts zijn ongewijzigd groen
  - Alle testgevallen uit § 16 voor dit pakket zijn er, met de hand nagerekende aantallen. Een vers geraamte geeft 0 % gedekt en alles gepland. Een netleerplan met 2 refs per doel dekt beide minimumdoelen
  - Puur: geen opslag en geen DOM. Lineair in kader plus refs. Lint, typecheck en npx vitest run zijn groen

### P12 Dekking op de schermen

- **Wie:** bouwer
- **Na:** I3, P11
- **Doel:** De dekking over alle cursussen van een richting op het richtingenscherm, en de dekking op minimumdoelen per cursus in de cursuseditor (L6), met eerlijke statussen en redenen.
- **Bestanden:** `src/components/richting/RichtingDekking.tsx (nieuw)`, `src/components/richting/RichtingDetail.tsx`, `src/components/richting/RichtingCursussen.tsx`, `src/components/course/GoalCoverage.tsx`, `src/components/course/MinimumdoelenDekking.tsx (nieuw)`, `src/styles/dekking.css (nieuw)`, `src/styles/richtingen.css`
- **Acceptatie:**
  - De teksten staan er letterlijk zoals in § 14.3 (h2 'Wat je cursussen samen dekken', redenen bij de cursussen) en § 14.5 (schakelaar, samenvatting, regel over geplande doelen, link naar de richting)
  - MinimumdoelenDekking is een eigen luie import in GoalCoverage. Het chunk van CourseEditorPage blijft onder 80 kB. De weergave 'Leerplan' is ongewijzigd, op de nieuwe regel na
  - De filter 'Tel mee' (alle jaren of één jaar) werkt. In de 1ste graad tellen 1A en 2A samen
  - De status staat er met icoon én tekst. De schakelaar heeft aria-pressed. Op 390 px zijn het lijsten en kaarten, zonder horizontaal scrollen
  - Lint, typecheck, vitest, build en de bestaande rooktest zijn groen

### P13 Rooktest studierichtingen

- **Wie:** bouwer (een andere agent dan de bouwers van P8 tot P12)
- **Na:** P12
- **Doel:** Een onafhankelijke controle in de browser van het hele pad, op de fixtures: richting kiezen, cursus maken zonder AI, de valkuil, de dekking met 'gepland', samenstellen met een richting, op 390 px.
- **Bestanden:** `tests/smoke.mjs`
- **Acceptatie:**
  - Sectie 20d staat vlak vóór '// ── 21. Importeren' en volgt § 16, met de letterlijke teksten uit § 14. page.route serveert tests/fixtures/structuur/uit
  - In localStorage wordt nagegaan dat het leerplan precies de deelset-nummers van Biologie bevat (de valkuil) en dat de cursus doelgroep, curriculumId en goalCodes heeft
  - De sectie zet localStorage terug ('Terug zoals het was'). De bestaande checks zijn ongewijzigd
  - De hele rooktest (PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs op vite preview, poort 4173) slaagt twee keer na elkaar, zonder console- of paginafouten

### I4 Review, rechter, herstel, rooktest op echte data, uitrol

- **Wie:** hoofdsessie (met reviewers en rechter)
- **Na:** P13, G1
- **Doel:** De laatste controle voor de uitrol: review per invalshoek, alleen bevestigde punten herstellen, de rooktest ook op echte data, docs en rapportage.
- **Bestanden:** `(herstel in de bestanden van P1 tot P13)`, `tests/smoke.mjs (sectie 20e, na G1)`, `docs/STUDIERICHTINGEN.md`, `docs/LEERPLANNEN.md`, `docs/ONDERWIJS-API.md`
- **Acceptatie:**
  - Vier reviewers: datastroom, script en workflow; juistheid van kader, cursushulp en dekking; toegankelijkheid, taal en 390 px; bundel, opslag, sanering en privacy. Daarna de rechter. Alleen bevestigde bevindingen zijn hersteld
  - Sectie 20e draait dezelfde stroom op de echte data (G-0193, G-0327), alleen met regex, en is groen
  - De volledige kwaliteitspoort is groen: lint, typecheck, npx vitest run, build met budget, rooktest twee keer, tests/ai/mock-studio.mjs en tests/ai/mock-cursus.mjs. Commit en push. De deploy-workflow is groen
  - De stand van zaken in docs/STUDIERICHTINGEN.md, LEERPLANNEN.md (L6 gebouwd) en ONDERWIJS-API.md is bijgewerkt. Een kort verslag aan de eigenaar, in het Vlaams

## Bijlage B. Beslissingen van de synthese

- Basis is het ontwerp 'data eerst': de jury vond het het meest correct op de punten waar een fout duur is. De veldnamen setVan().setSleutel en normaliseerRecord().doel.id kloppen; er is een poort tegen een filter die de API negeert; de kop van leerplanUitSelectie wordt mee aangepast; de volledige vitest-run zit in de workflow; en het ontwerp dekt alle vier de delen van de opdracht.
- De koppeling richting → doelen loopt alleen op groepnummer (structuuronderdeel_groep_nummer). De filter op naam voegt graden samen en breekt op hoofdletters en komma's.
- Eén workflow en één pull request voor minimumdoelen, matrix en koppeling. haal-minimumdoelen.mjs blijft byte voor byte gelijk; de stap 'Minimumdoelen ophalen' krijgt alleen een if:. Kruiscontroles hebben enkel zin op één momentopname, en het gat van de tests met echte data in de uitrol gaat dicht.
- Het versiemerk setSha per set komt uit 'risico eerst'. Met een gelijk versiemerk is alles strikt; bij een ander versiemerk wordt het verschil gemeld. Zo werkt de noodrun met alleen de minimumdoelen echt, en breekt geen volgorde van updates de uitrol (jury 2 en 3).
- Harde poorten: D2 (filter genegeerd: totalItems ≥ T of > 5000), D3 (set of nummer onbekend), D4 (graadconflict), D5, D6 (massaverlies, en minder dan 50 % gekoppeld, verlaagd van 80 % omdat 48 groepen alleen duaal zijn), D7 en D8 (de 133 groepen uit het ordeningskader moeten gekoppeld zijn, uit 'risico eerst'). De kruiscontrole per nummer blijft zacht tot G1.
- Niets wissen: verdwenen groepen en onderdelen blijven met nietMeerInBron, en een koppeling die wegvalt blijft als laatst bekende koppeling (jury 3). 'Risico eerst' liet het script stoppen bij verdwijnen (--sta-verdwijnen-toe); dat is vervangen door de massaverliespoort.
- OV4 komt uit het officiële veld ov4_mogelijk, niet uit hoofdstructuur 321 (jury 1 tot 3: 321 staat bij bijna alle groepen).
- Het lijstpad van de matrix zoekt tolerant met lijstVanPagina en geeft exit 3 bij twijfel (regel 11, uit 'risico eerst'). De eerste echte run gaat in drie stappen: matrix, 10 groepen, alles. Met de invoer groepen kunnen proefruns, en hun PR's worden gesloten.
- De omgevingsnamen blijven de bestaande ONDERWIJSDOELEN_* (jury 1). Er komt alleen STRUCTUURONDERDELEN_API_BASE bij, met dezelfde origin.
- Het bestand heet studierichtingen.json en niet so-studierichtingen.json, omdat de matrix ook BuSO, OKAN en 7de jaren bevat. De koppeling staat per groep in een eigen bestand: lui laden, en een git-diff per richting. Er komen tot ±545 bestanden, niet ±250 (jury 2).
- Eén optioneel veld doelgroep op Course én Curriculum (uit 'data eerst' en 'leerkracht eerst'). Het jaar wordt gestructureerd, zodat de dekking per jaar kan filteren, en de richting reist met de cursus mee over toestellen heen. Het veld wordt aan elke grens gesaneerd, telt niet mee in de vingerafdruk, en sanitizeAICourse zet het expliciet uit base. Geen formaatversie omhoog.
- De doelgroep staat niet op het kritieke pad. courses.ts, curriculum.ts en handoff.ts worden alleen lui geladen (in de code nagekeken: JoinPage laadt courses.ts met await import; de student-modules importeren het niet). De verhoging van het budget naar 334 kB uit 'data eerst' vervalt; alleen de route kost iets (verwacht 333,5).
- Eén nieuwe route /cursussen/richtingen/:groep?, lui geladen. De ingangen staan buiten de lijsten die de rooktest letterlijk vastlegt: op /leerplannen een zin onder de wegwijzer, geen vijfde knop (uit 'risico eerst').
- Cursushulp: een venster op het niveau van de sets, met een vakvoorstel via vakZoektabel ('hulp, geen officiële koppeling'). STEM-sets staan nooit vooraf aangevinkt en krijgen eerlijke uitleg. 'Alle doelen van de richting' is niet de standaard (jury 2). Per doel kiezen gebeurt in de bestaande samenstelwizard met ?richting=; er komt geen tweede doelenkiezer, die de valkuil zetDoelen/bouwSetKeuzes zou herhalen (jury 3).
- De valkuil van zetDoelen en bouwSetKeuzes (een deelset wordt stil een hele set) krijgt verplichte regressietests, en naarSetKeuzes geeft voor een deelset altijd nummers (uit 'leerkracht eerst').
- De status 'gepland' bestaat alleen in de nieuwe dekkingsmodule. coverage.ts krijgt alleen nieuwe exports (sectieHeeftInhoud, geplandeRijen), en computeCoverage verandert niet (aanbeveling van jury 3). Een vers geraamte meldt zo geen 100 %, terwijl 'Vul de hiaten' en de bestaande percentages gelijk blijven. 'Gepland' ook in de gewone dekking is open vraag O1.
- Optionele minimumdoelen (isOptioneel) en uitbreidingssets tellen niet mee in het totaal en het percentage. Ze krijgen een eigen teller (jury 1 en 2).
- De dekking is strikt op set + vast nummer, de afspraak van het project. Een teller zelfdeNummerAndereSet toont wat een ruimere regel zou opleveren; de keuze ligt bij de eigenaar (O6).
- Bij elke cursus die niet meetelt, staat de reden (geen leerplan, leerplan niet op dit toestel, geen verwijzingen). Een gedeelde cursus kan opnieuw aan het leerplan van de richting gekoppeld worden, met passendeCodes (jury 3).
- RichtingKiezerModal en de dekking op minimumdoelen worden lui geladen in CourseEditorPage (chunk 67,8 van 80 kB, gemeten in dist van 6 oktober).
- Het script maakt zelf de fixtures uit een nagebootste API. De rooktest draait daarop via page.route, zodat de schermen niet op de eerste echte run wachten. Na G1 komt een tweede sectie op de echte data.
- In de 1ste graad schrijft het script een koppelingsbestand met methode graad-en-stroom: de app heeft één codepad. Voor 7de jaren maakt Boosterz geen eigen koppeling (jury: niets verzinnen).
- De volgorde van bouwen: eerst data en zuivere logica (P1 tot P7, met nagebootste antwoorden), dan de schermen (P8 tot P10, in drie worktrees, met stubs uit I2), dan de dekking (P11 en P12), dan de rooktest door een andere agent. De datatest (P3) schrijft een andere agent dan die van het script (P2). Het icoon RichtingIcon komt in P0, zodat P8 en P9 niet van elkaar afhangen (jury 3).

## Bijlage C. Bewust niet overgenomen uit de ontwerpen

- Uit 'leerkracht eerst': de eigen koppeling voor het 7de jaar (alle sets '3de leerjaar' als terugval). Dat is een verzonnen koppeling; feiten B zeggen dat het onbekend is.
- Uit 'leerkracht eerst': de tolerante afhandeling zonder harde poorten (één 404 = geen doelen, onbekende sets alleen tellen, geen massaverlies, geen poort voor een genegeerde filter). Die is vervangen door de poorten D1 tot D8.
- Uit 'leerkracht eerst': één bestand richtingdoelen.json voor alle 545 groepen, dat de app helemaal laadt. In de plaats komt één bestand per groep: lui laden en een git-diff per richting.
- Uit 'leerkracht eerst': de status 'planned' in computeCoverage en CoverageStatus. Die verandert de bestaande percentages en het pad 'Vul de hiaten', en vraagt een aanpassing van de fixture in coverage.test.ts. 'Gepland' staat nu alleen in de nieuwe module; de rest is open vraag O1.
- Uit 'leerkracht eerst': de eigen wizard in vier stappen met een eigen doelenkiezer (kiesbaarVoorKader, normaliseerVoorKader, bouwRichtingKeuzes). Die dupliceert de samenstelwizard en precies de valkuil. Het venster werkt nu op setniveau en per doel kiezen gaat via samenstellen met ?richting=.
- Uit 'leerkracht eerst': Doelgroep.richtingen als lijst van tot 10 richtingen. Dat maakt saneren en filteren complexer zonder dat de opdracht het vraagt; het is één richting geworden.
- Uit 'leerkracht eerst': twee nieuwe routes (wizard en dekking). Eén route met lijst en detail volstaat, en kost maar ±0,4 kB.
- Uit 'leerkracht eerst': de fixturetest 'elk @id uit de fixture staat in het setbestand van de repo', die altijd geldt. Hij bindt de uitrol aan de maandelijkse data en geldt nu alleen bij een gelijk versiemerk.
- Uit 'leerkracht eerst': de groepering 'Eigen aan <richting>' tegenover 'Voor iedereen' op basis van de setnaam. Die is vervangen door de officiële indeling deelset tegenover hele set uit het API-antwoord.
- Uit 'risico eerst': een aparte workflow studierichtingen.yml op de 10de. Die vraagt elke maand een menselijke volgorde en laat het gat in de uitrolpoort van minimumdoelen.yml open. Het versiemerk is wel overgenomen.
- Uit 'risico eerst': de richting alleen op het leerplan, met het jaar als vrije tekst in de ondertitel. Dan kan de dekking niet per jaar filteren, en verdwijnt de band met een netleerplan of op een ander toestel.
- Uit 'risico eerst': exit 3 bij een verdwenen groep, met de vlag --sta-verdwijnen-toe (niet bereikbaar in de workflow), en de vlag --negeer-onbekende-sets. Die zijn vervangen door nietMeerInBron, de massaverliespoort en de melding 'draai met alles'.
- Uit 'risico eerst': de foutieve veldnamen M.setVan(record).sleutel en M.normaliseerRecord(record)?.id. De echte namen zijn setSleutel en doel.id.
- Uit 'risico eerst': het pad so-studierichtingen.json en de map doelen/. Die zijn vervangen door studierichtingen.json en richtingdoelen/.
- Uit 'risico eerst': de rooktest en de schermen pas na de eerste echte run. Fixtures via page.route maken ze vroeger testbaar.
- Uit 'risico eerst': het verbod om Course, sanitizeCourse, sanitizeAICourse en handoff aan te raken. Het doelgroepveld vraagt die grenzen; ze worden met tests bewaakt.
- Uit 'data eerst': de premisse dat doelgroep.ts via courses.ts → JoinPage op het kritieke pad staat, en de verhoging naar 334 kB die daarop steunde. JoinPage laadt courses.ts lui.
- Uit 'data eerst': OV4 afleiden uit hoofdstructuur 321. Het officiële veld ov4_mogelijk vervangt dat.
- Uit 'data eerst': de poort '80 % gekoppeld'. Die is verlaagd tot 50 % en aangevuld met de poort op het ordeningskader, omdat 48 van de 256 gewone groepen alleen duaal zijn.
- Uit 'data eerst': een koppelingsbestand wissen als een groep op 'geen' valt. Het bestand blijft als laatst bekende koppeling, met nietMeerInBron.
- Uit 'data eerst': de dekking via hetzelfde vaste nummer in een andere set (andereSet) als standaard. Nu is het strikt op set + vast nummer, met een teller en open vraag O6.
- Uit 'data eerst': 'Alle minimumdoelen van de richting' als standaard in het venster. De standaard is nu sets kiezen met een vakvoorstel.
- Uit 'data eerst': het groepnummer in de herkomsttekst op het scherm. Het staat nu alleen in de bronvermelding.
- Uit 'data eerst': de omgevingsnamen ONDERWIJS_API_BASE en ONDERWIJS_WACHT_FACTOR. De bestaande ONDERWIJSDOELEN_* blijven.
- Uit 'data eerst': F5 (onderwijssoort tegenover setnaam) als harde poort vóór de eerste run. Het is een telling tot G1, net als de kruiscontrole.
- Uit 'data eerst': vite.config.ts aanpassen in een bouwpakket (P5). Het budget past alleen de hoofdsessie aan, na een meting.
- Uit 'data eerst': R4 met een aparte groepsleutel 'lj3' voor jaar 7. 7de jaren zijn in de matrix eigen groepen (type7), dus de sleutel is gewoon het groepnummer.

## Bijlage D. Pakketten fase 2

```
A1 kernbouwer (F2.1 + doelgroepVoorKlas) ─┬─ A2 bouwer (F2.2 logica) ─┐
                                          └─ A3 bouwer (F2.3/F2.4 logica) ┴─ I-A hoofdsessie ─┬─ B1 bouwer (F2.2 schermen, worktree A) ─┐
                                                                                             ├─ B2 bouwer (F2.3 scherm,   worktree B) ─┼─ I-B ─ C1 bouwer (rooktest 20f) ─ I-C
                                                                                             └─ B3 bouwer (F2.4 schermen, worktree C) ─┘
```

Voor elk pakket: het levert pas op als `npm run lint` (0 fouten, geen extra waarschuwingen), `npm run typecheck` en `npx vitest run` groen zijn; voor B1 tot B3 ook `npm run build` (budget gemeld) en de bestaande rooktest op `vite preview`. Agents committen niet. A2 en A3, en B1, B2 en B3, raken nooit hetzelfde bestand.

| Pakket | Wie | Na | Bestanden (alleen deze) | Acceptatie |
|---|---|---|---|---|
| **A1** Vingerafdruk per set | kernbouwer | – | `src/lib/doelgroep.ts` (+test), `src/lib/richtingKader.ts` (+test), `src/lib/doelenSamenstellen.ts` (alleen `doelgroepVanBestaand`) (+test), `src/lib/curriculum.ts` (alleen `maakEigenKopie`) (+test), `src/lib/courses.ts` (alleen de regel in `sanitizeCourse`) + `courses.test.ts`, `richtingCursus.test.ts`, `richtingLink.test.ts`, commentaar in `richtingCursus.ts` en `richtingLink.ts` | § 22.3 volledig; `doelgroepVoorKlas` en `zonderKaderVelden` bestaan; formaten van `kaderVingerafdruk` en `volledigeSetsVingerafdruk` ongewijzigd; tests van § 22.3.8, met de oude-regeltests expliciet in het oude formaat en hun verwachte uitkomsten ongewijzigd; de test "bekende beperking" is twee tests |
| **A2** Logica gaten dichten | bouwer | A1 | nieuw `src/lib/gatenDichten.ts`, `src/lib/gatenCursus.ts` en hun tests; `src/lib/richtingCursus.ts` (alleen `export` voor `samenTitel`) | § 22.4.1 tot 22.4.6; puur (geen React, geen opslag behalve de meegegeven `GatenOpslag`); tests van § 22.4.8 met de valkuilregressie; geen set-id in een tekst |
| **A3** Logica mijn richtingen en klas | bouwer | A1 | `src/lib/classTypes.ts`, `src/lib/classes.ts` (alleen `sanitizeClass` en de nieuwe sectie), nieuw `src/lib/doelgroepGebruik.ts`, `src/lib/richtingOverzicht.ts`, `src/lib/dekkingCache.ts` en hun tests, `classes.test.ts`, `classPack.test.ts`, `src/components/richting/RichtingDoelen.tsx` (alleen `doelgroepVanCursus` verhuist en wordt verder geëxporteerd), `docs/KLASKANAAL.md` (één zin) | § 22.5.3 en § 22.6.1 tot 22.6.2; tests van § 22.5.5 en § 22.6.5; de regressie van `bijdragenVoorKader` op de fixture; `classPack.ts` ongewijzigd |
| **I-A** Integratie en stubs | hoofdsessie | A2, A3 | `useRichtingDekking` verhuist naar `src/components/richting/useRichtingDekking.ts` (gebruikt `bijdragenVoorKader`; `DekkingGegevens` krijgt `bijdragen`, `bestanden`, `kader`; schrijft de cache bij "Alle jaren"); `RichtingDekking.tsx` en `RichtingDetail.tsx` importeren van daar; stubs `DekkingKort.tsx` (vaste props van § 22.5.3, toont "De dekking wordt berekend…") en `RichtingKlassen.tsx` (geeft niets), die in `RichtingDetail` gemonteerd wordt | volledige poort; rooktest 20d en 20e ongewijzigd groen (de dekking op het detail blijft gelijk); budget gemeten; commit |
| **B1** Schermen gaten dichten | bouwer, worktree A | I-A | nieuw `GatenVenster.tsx` (lui), `src/lib/gatenWeergave.ts` (+test), `src/styles/gaten.css`; `RichtingDekking.tsx` (knop en luie import), `MinimumdoelenDekking.tsx` (paneel), `GoalCoverage.tsx` (prop doorgeven), `CourseEditorPage.tsx` (alleen `onEdit={edit}`) | teksten van § 22.4.7 letterlijk; bewaren alleen via `bewaarNieuweGatenCursus`, `bewaarGatenOpCursus` en `onEdit`; focus zoals beschreven; CourseEditorPage ≤ 75,1 kB; 44 px en 390 px |
| **B2** Scherm mijn richtingen | bouwer, worktree B | I-A | nieuw `MijnRichtingen.tsx`, `rijWachtrij.ts` (+test), `src/styles/mijnrichtingen.css`; `DekkingKort.tsx` (stub wordt echt); `RichtingLijst.tsx` (blok monteren) | § 22.5.2 en § 22.5.4 letterlijk; zonder rijen geen blok; één richting tegelijk; niets in localStorage; de props van DekkingKort ongewijzigd |
| **B3** Schermen klas en richting | bouwer, worktree C | I-A | `ClassDashboardPage.tsx` (sectie, `NewAssignmentModal` met optgroups en `voorgekozen`), nieuw `src/components/klas/KlasRichting.tsx`, `RichtingKlassen.tsx` (stub wordt echt), `ShareModal.tsx`, `CourseShareModal.tsx`, `ClassesPage.tsx`, nieuw `src/lib/klasRichtingWeergave.ts` (+test), `src/styles/klasrichting.css` | § 22.6.3 en § 22.6.4 letterlijk; bewaren alleen via `zetKlasRichting`, en elke `false` krijgt een melding; DekkingKort via de stub; de kiezer lui; ClassDashboardPage < 28 kB |
| **I-B** Integratie van de schermen | hoofdsessie | B1, B2, B3 | samenvoegen; `HelpPage.tsx` (§ 22.10); `vite.config.ts` alleen als V6 nodig is; docs (§ 22.10) | volledige poort, rooktest twee keer groen, kritiek pad gemeten en gemeld |
| **C1** Rooktest 20f | bouwer (een andere agent dan B1 tot B3) | I-B | `tests/smoke.mjs` (alleen een nieuwe sectie 20f vóór "21. Importeren", plus de regex-checks in 20e) | § 22.9; twee keer na elkaar groen; bestaande checks ongewijzigd |
| **I-C** Review en uitrol | hoofdsessie, vier reviewers, rechter | C1 | herstel in de bestanden van A1 tot C1; stand van zaken | vier invalshoeken: (1) juistheid van F2.1 en F2.2 (afdrukken, oude regel, valkuil, codes, secties), (2) opslag en grenzen (sanering, klaspakket, terugdraaien, nooit stil overschrijven), (3) toegankelijkheid, taal en 390 px, (4) bundel en kost; daarna de rechter; alleen bevestigde punten worden hersteld; volledige poort met `tests/ai/mock-studio.mjs`; commit en push; deploy groen |

**Wat niemand aanraakt** (behalve waar het hierboven staat): `computeCoverage`; `tools/leerplannen/haal-*.mjs` en `public/leerplannen/**`; `vite.config.ts` (alleen de hoofdsessie); de bestaande checks in `tests/smoke.mjs`; `CurriculumPicker.tsx`; `NieuweRichtingCursus.tsx` en `RichtingKiezerModal.tsx` (hun props blijven vast); `classPack.ts`; de formaten van `kaderVingerafdruk` en `volledigeSetsVingerafdruk`.

## Bijlage E. Pakketten fase 3

```
(na fase 2 I-C)
Q0 ─┬─ K1 kernbouwer ─┬─ K2 kernbouwer ─┐
    │                 ├─ K3 bouwer (andere agent, levert op na K2) ─┤
    │                 └─ K4 bouwer + reviewer ─┤
    └─ K5 kernbouwer (naast K1) ───────────────┴─ I1 ─┬─ G1 echte run in stappen (naast K6 tot S3) ───────────┐
                                                      └─ K6 kernbouwer ─ K7 bouwer ─ I2 ─┬─ S1 (worktree A) ─┐ │
                                                                                         ├─ S2 (worktree B) ─┼─ I3 ─ R1 ─ I4
                                                                                         └─ S3 (worktree C) ─┘
```

Voor elk pakket: het levert pas op als `npm run lint` (0 fouten, geen extra waarschuwingen), `npm run typecheck` en `npx vitest run` groen zijn; voor S1 tot S3 ook `npm run build` (budget gemeld) en de bestaande rooktest op `vite preview`. Agents committen niet. K1 en K5, K2, K3 en K4, en S1, S2 en S3 raken nooit hetzelfde bestand.

| Pakket | Wie | Na | Bestanden (alleen deze) | Acceptatie |
|---|---|---|---|---|
| **Q0** Ontwerp en voorbereiding | hoofdsessie | fase 2 I-C | `docs/STUDIERICHTINGEN.md` (§ 23, bijlage E, rij in de stand bovenaan), `docs/ONDERWIJS-API.md` (stand), CLAUDE.md (één regel, buiten het werkwijzeblok), `src/components/icons.ts` (`BeroepIcon`), `docs/ontwerp/ICONEN.md`, uittreksel `tests/fixtures/kwalificaties/api/ruw/` uit de artifacts van run 38044584119 en 38047507450 | ontwerp in de repo; het uittreksel bevat geen sleutel en noemt zijn bron |
| **K1** Datamodule en API-hulp | kernbouwer | Q0 | nieuw `src/lib/beroepskwalificaties.ts` (+test), `tools/leerplannen/onderwijsApi.mjs`, `src/lib/onderwijsApi.test.ts` | § 23.5.3; puur en laadbaar in Node; per normalisatie- en validatiefunctie ≥ 3 positieve en ≥ 6 negatieve gevallen (tekst of object, lijst met één element, `__proto__`, ander nummer, DBK, ontbrekend `nr`, HTML, T1 beide vormen); `doelcodesVanBestand` met nr en met terugval; `geldtOp` en `erkenningenOp` met overlap, toekomst en de drie statussen van de matrix |
| **K2** Script, fixtures, scripttest | kernbouwer | K1 | nieuw `tools/leerplannen/haal-beroepskwalificaties.mjs`, `tests/fixtures/kwalificaties/**`, `src/lib/beroepskwalificaties.script.test.ts` | § 23.5.4 tot 23.5.8, 23.5.10 en 23.5.12; elk geval van de scripttest; de bestaande scripts en `tests/fixtures/structuur/**` byte voor byte gelijk |
| **K3** Datatest | bouwer, een andere agent dan K2 | K1 (oplevering na K2) | nieuw `src/lib/beroepskwalificaties.data.test.ts` | § 23.5.11; de zelftest vindt ≥ 10 gebroken invarianten, elk met de verwachte melding; mild en streng zoals beschreven; info zichtbaar; de datatest van de studierichtingen blijft ongewijzigd groen |
| **K4** Workflow | bouwer, nagelezen door een reviewer (veiligheid) | K1 (naast K2) | `.github/workflows/minimumdoelen.yml` | § 23.5.9; van de bestaande ophaalstappen verandert alleen de `if:`; geen `*_API_BASE`; het geheim alleen in de `env` van de ophaalstappen; de nieuwe stap vóór `npm ci`; invoer via `env` en met een regex nagekeken; samenvatting en PR-tekst letterlijk |
| **K5** Datamodel van het leerplan | kernbouwer | Q0 (naast K1) | `src/lib/curriculumTypes.ts`, `src/lib/curriculum.ts` (alleen de plaatsen van § 23.6.3), `src/lib/leerplanStatus.ts`, `src/lib/leerplanNetten.ts` (alleen `NET_KEUZES`), `curriculum.test.ts`, `leerplanStatus.test.ts` | de gouden vingerafdrukken eerst, vóór de wijziging; N1 en N7; `bkRefs` en `bkVersies` alleen bij methode `beroepskwalificatie`; export en import v2 houden "Nagekeken"; typecheck vangt elke `Record` of `switch` op de unions; examples.test.ts groen; mutatieproef door de reviewer |
| **I1** Integratie data en datamodel | hoofdsessie | K1 tot K5 | – | volledige poort; commit en push |
| **G1** Eerste echte run | hoofdsessie | I1 | STRENG-vlaggen en BC1 in de datatest, de grens van P5, `timeout-minutes`, `kanBkHebben` (alleen verruimen), de stand van zaken | § 23.5.13; proefruns gesloten; de data-PR nagekeken en samengevoegd op teken van de eigenaar |
| **K6** Lader, kader, BK-leerplan | kernbouwer | I1 | nieuw `src/lib/beroepskwalificatiesBron.ts`, `src/lib/richtingBk.ts`, `src/lib/bkLeerplan.ts` en hun tests | § 23.6.4 tot 23.6.6 en § 23.6.9; op `tests/fixtures/kwalificaties/uit`: G-0008 geeft 2 BK's, onderdeel 565 alleen in de aanloopvariant, G-0009 `geen` of `api` zoals de fixture zegt; een deelselectie van 4 van 12 geeft precies 4 doelen (de valkuil); dezelfde selectie geeft dezelfde vingerafdruk; elke poortfout; hergebruik alleen bij gelijke selectie en versiemerk; alle gevallen van `vergelijkMetBk`; de paden van § 23.6.5 |
| **K7** Geraamte, dekking, teksten | bouwer | K6 | nieuw `src/lib/bkCursus.ts`, `src/lib/dekkingBk.ts`, `src/lib/bkWeergave.ts` en hun tests; `src/lib/dekkingMinimumdoelen.ts` (alleen de optionele parameter en `export percentVan`) + één nieuw geval in de test; `src/lib/richtingCursus.ts` (alleen `hoofdstukken` in `cursusVoorRichting`) + `richtingCursus.test.ts` | met de hand nagerekende dekking (gedekt, gepland, verdieping, een andere versie); de bestaande tests van `dekkingMinimumdoelen` ongewijzigd groen (N5); het geraamte houdt de invariant van § 12.2 en de grenzen van blok 2; elke tekst in enkelvoud en meervoud, zonder competentiecode |
| **I2** Integratie en stubs | hoofdsessie | K7 | `src/components/richting/useRichtingBk.ts` (+ `kanBkHebben`); `RichtingContext.bk?` (RichtingDoelen.tsx, alleen het type); RichtingDetail.tsx (de hook, `BkKopRegel` en de sectie lui gemonteerd in `KaderSecties`); stubs `bk/BkSectie.tsx`, `bk/BkKeuze.tsx`, `bk/BkDekking.tsx` met vaste props; de optionele props `bk` en `startBk` op NieuweRichtingCursus (alleen doorgeven) | volledige poort; rooktests 20d tot 20f ongewijzigd groen; geen verzoek naar `kwalificaties/` bij G-0193; budget gemeten; commit |
| **S1** Sectie en kopregel | bouwer, worktree A | I2 | `bk/BkSectie.tsx`, nieuw `bk/BkKaart.tsx`, `src/styles/beroepskwalificaties.css` | § 23.7.1 en § 23.7.2 letterlijk; bewaren alleen via `leerplanUitBk` en `saveCurriculum`, elke `false` gemeld; focus zoals beschreven; 44 px en 390 px |
| **S2** Venster | bouwer, worktree B | I2 | `NieuweRichtingCursus.tsx`, `bk/BkKeuze.tsx`, `src/lib/richtingVenster.ts` (teksten), `RichtingDoelen.tsx` (alleen de zin van r. 370), `src/styles/richtingcursus.css`, `tests/ai/mock-cursus.mjs` (een geval "competenties", als dat bestand er is) | § 23.7.3 letterlijk; bestaande keuzes en standaard ongewijzigd voor een richting zonder BK's; een nieuw leerplan wordt teruggedraaid als de cursus niet bewaard kan worden |
| **S3** Dekking en leerplanpagina | bouwer, worktree C | I2 | `bk/BkDekking.tsx`, `RichtingDekking.tsx`, `useRichtingDekking.ts`, `RichtingCursussen.tsx`, `src/components/curriculum/ControleLabel.tsx`, `LeerplanOpSlot.tsx`, `CurriculaPage.tsx` (alleen `uitBron`, het label en de keuzelijst "Net"), `LeerplanInlezenPage.tsx` (alleen de zin van r. 111), `src/styles/dekking.css` | § 23.7.4 en § 23.7.5 letterlijk; de getallen van de dekking op minimumdoelen veranderen niet; zonder BK's is de sectie letterlijk zoals nu |
| **I3** Integratie schermen | hoofdsessie | S1 tot S3 | samenvoegen; `HelpPage.tsx` (§ 23.7.6); `vite.config.ts` alleen als het budget het vraagt; docs | volledige poort; rooktest twee keer groen; kritiek pad gemeten en gemeld |
| **R1** Rooktest | bouwer, een andere agent dan S1 tot S3 | I3 en G1 | `tests/smoke.mjs` (alleen de nieuwe secties 20g en 20h vóór "21. Importeren") | § 23.8; twee keer na elkaar groen; bestaande checks ongewijzigd |
| **I4** Review en uitrol | hoofdsessie, vier reviewers, rechter | R1, en de data-PR van G1 stap 3 samengevoegd | herstel in de bestanden van K1 tot R1; de stand van zaken | vier invalshoeken: (1) datastroom, script, workflow en sleutel; (2) datamodel: N1 tot N7, nakijkpoort, codes, dekking; (3) toegankelijkheid, taal en 390 px; (4) bundel, opslag en omvang. Daarna de rechter; alleen bevestigde punten worden hersteld. Volledige poort met `tests/ai/mock-studio.mjs`; commit en push; deploy groen |

**Wat niemand aanraakt** (behalve waar het hierboven staat): `tools/leerplannen/haal-minimumdoelen.mjs` en `haal-studierichtingen.mjs`; `public/leerplannen/**` (alleen de workflow-PR); `tests/fixtures/structuur/**`; `computeCoverage`, `curriculumCheck.ts`, `doelgroep.ts`, `richtingKader.ts`, `doelenSamenstellen.ts`, `courses.ts`, `classes.ts`, `classPack.ts`; `refs`, `sanitizeRefs`, `SET_ID`; de formaten van `kaderVingerafdruk`, `volledigeSetsVingerafdruk` en `setAfdruk`; de bestaande checks in `tests/smoke.mjs`; `vite.config.ts` (alleen de hoofdsessie).
