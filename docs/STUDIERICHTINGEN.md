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
| Fase 2 (§ 22): vingerafdruk per set, gaten dichten, mijn richtingen, klas en richting | **Ontwerp klaar** (10 oktober 2026): twee ontwerpen en een synthese; de eigen tabel "Stand van zaken fase 2" staat in § 22, de pakketten in bijlage D. Bouwen loopt. | hoofdsessie, bouwers |
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

**Bekende beperking** (bestond al vóór het herstel van oktober 2026). De afdrukken gaan over alle sets van het leerplan samen. "Keuze aanpassen" zonder richting kent het kader niet en kan ze dus niet herrekenen. Komt er daar een set bij die in het kader staat, of valt zo'n set weg (een set buiten het kader telt niet mee in de afdruk), dan verschilt de afdruk over de nieuwe lijst sets van de bewaarde, ook als de koppeling niet veranderde. Dan wordt alles vergeleken, en een doel dat de leerkracht zelf bij een deelset koos, telt als vervallen; "Kies de doelen opnieuw" vinkt het dan niet meer aan. Voorbeeld: deelsets A (koppeling a1) en B (koppeling b1); de leerkracht neemt a2 erbij (niets te melden) en haalt later B weg: dan telt a2 als vervallen. Een echte oplossing bewaart een afdruk per set; dat verandert het formaat van de doelgroep en is voor later. Het huidige gedrag staat vast in de test "bekende beperking (§ 11.2)" in `doelenSamenstellen.test.ts`.

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
| A1 Vingerafdruk per set (F2.1) en `doelgroepVoorKlas` | Wacht | kernbouwer |
| A2 Logica gaten dichten (F2.2) | Wacht, na A1 | bouwer |
| A3 Logica mijn richtingen en klas met richting (F2.3, F2.4) | Wacht, na A1 (naast A2) | bouwer |
| I-A Integratie van de logica, hook verhuizen, stubs | Wacht, na A2 en A3 | hoofdsessie |
| B1 Schermen gaten dichten | Wacht, na I-A (worktree A) | bouwer |
| B2 Scherm mijn richtingen | Wacht, na I-A (worktree B) | bouwer |
| B3 Schermen klas en richting | Wacht, na I-A (worktree C) | bouwer |
| I-B Integratie van de schermen, hulp, budget, docs | Wacht, na B1 tot B3 | hoofdsessie |
| C1 Rooktest 20f | Wacht, na I-B | bouwer (een andere agent dan B1 tot B3) |
| I-C Review, rechter, herstel, uitrol | Wacht, na C1 | hoofdsessie, reviewers, rechter |
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
| Knoppen | "Annuleren" · primair "Maak de cursus" / "Zet ze in deze cursus" / bij k < n "Zet de 4 doelen in deze cursus" (enkelvoud "Zet het doel in deze cursus") |
| Voet (`voetTekst` + `zegOntbreekt`, `aria-disabled`) | "Nog nodig: minstens één doel, een titel." · "Nog nodig: minstens één doel, een cursus." |
| Fouten (`callout err`, focus erheen) | "Het leerplan kon niet als nagekeken bewaard worden: <eerste waarschuwing>. Er is niets bewaard." · "De sets zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard." · "Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd." · "Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw." · "Deze cursus bestaat niet meer. Er is niets veranderd." · "Deze cursus hangt intussen aan een ander leerplan. Er is niets veranderd. Probeer opnieuw." |
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
