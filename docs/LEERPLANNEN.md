# Leerplannen — ontwerp voor sluitend inlezen van doelen

*Status: ontwerp (fase 2), nog niet gebouwd. Fase 1 (een echt API-antwoord en per net één echt
leerplan) moet de punten met "te bevestigen" afvinken vóór het bouwen begint.*

## Stand van zaken (bijgewerkt 5 oktober 2026)

| Wat | Stand |
|---|---|
| API-sleutel Onderwijsdoelen-API | **Bestaat.** Aangevraagd via het portaalformulier op 18 december 2025, aangemaakt op 9 januari 2026 door de Centrale cel ICT. De sleutel kwam per mail in de ICT-mailbox van de scholengroep en geldt voor alle open API's van Onderwijs & Vorming. Hij staat nergens in de repo. |
| Sleutel als GitHub-geheim `ONDERWIJSDOELEN_API_KEY` | **Gedaan** op 5 oktober 2026 (repository secret voor Actions). |
| Pakket L1 (ophaalscript, workflow, datatest) | Gebouwd en gereviewd (twee reviewers, rechter). Volgende stap: eerste run met de hand starten en het rapport nakijken; daarna de API-vorm vastleggen. |
| Vragen aan het departement (§ 12) | Nog te stellen. Sinds 24 maart 2026 **alleen via het formulier van TechLoket Onderwijs**, niet meer per mail (Nieuwsbrief API K&C van AHOVOKS). |
| Vragen aan KOV, GO!, OVSG, POV (§ 12) | Teksten klaar in het aanvraagdossier (Claude Docs, "Aanvraagdossier leerplangegevens"); nog niet verstuurd. |
| Eerste toepassing | De cursus "Aardrijkskunde: bodem en landschap" (leerplan KOV I-Aar-a) krijgt doelcodes zodra laag 1 en het leerplan erin zitten. |

Wijzigingen in de doelensets worden aangekondigd in de Nieuwsbrief API K&C (onder meer: minimumdoelen
basisonderwijs gewijzigd in juni 2026, correcties basiseducatie in september 2026).

## 1. Waarom

Een doelcode is de ruggengraat van Boosterz: secties, vragen, de dekking en het klasoverzicht
praten via die code met elkaar. Als een doel verkeerd, onvolledig of verzonnen is, klopt alles
wat erop steunt ook niet. "Sluitend" betekent hier:

1. **Elk doel komt uit een officiële bron**, met een herkomst die je kan nagaan.
2. **Een script controleert** dat elk doel letterlijk en volledig is overgenomen. Geen model
   heeft het laatste woord.
3. **Elk leerplandoel weet bij welk minimumdoel het hoort**, zodat de dekking ook klopt over de
   netten heen.

## 2. Wat er vandaag mis is

| Probleem | Waar |
|---|---|
| De AI mag doelen "lichtjes inkorten"; niets controleert of een doel letterlijk in de bron staat | `SYSTEM` in `src/lib/aiCurriculum.ts` |
| Tekst na 40.000 tekens valt weg (`MAX_CURRICULUM_CHARS`); er is geen controle op volledigheid | `buildCurriculumPrompt` in `src/lib/aiCurriculum.ts` |
| Een leerplandoel kent zijn minimumdoelen niet | `CurriculumGoal` in `src/lib/curriculumTypes.ts` |
| Geen herkomst: geen versie, geen "geldig vanaf", geen vingerafdruk van de bron | `Curriculum.source` is vrije tekst |
| Doelen zijn altijd bewerkbaar, ook als ze officieel zijn | `CurriculaPage.tsx` |
| Zonder `curriculumId` zoekt `findGoalByCode` over alle leerplannen heen: "LPD 9" van twee vakken botst | `src/lib/curriculum.ts` |

## 3. Drie lagen

```
Laag 1  Minimumdoelen (Vlaamse overheid)      officieel, voor elk net hetzelfde, meegeleverd
           ▲ verwijst naar (refs)
Laag 2  Leerplan van het net (KOV, GO!, OVSG, POV) of eigen leerplan     per school ingelezen
           ▲ doelcodes
Laag 3  Cursussecties en vragen                                           al aanwezig
```

De dekking rekent op twee lagen: tegen het leerplan van de school (zoals nu) én, via de
verwijzingen, tegen de minimumdoelen. Werkt een school met een ander net, dan klopt de
minimumdoelendekking nog altijd.

## 4. Bronnen en wat we ermee mogen

| Laag | Bron | Vorm | Juridisch |
|---|---|---|---|
| 1 | Onderwijsdoelen-API van het Departement Onderwijs en Vorming: `https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel?paginanr=…&rijen_per_pagina=…`, sleutel in de kop `x-api-key` | JSON, gepagineerd (`gegevens.member[]`, `gegevens.totalItems`) | Op officiële akten rust geen auteursrecht (art. XI.172 §2 WER). Hergebruiksvoorwaarden van de API: **te bevestigen** (waarschijnlijk Modellicentie Gratis Hergebruik, gelijk aan CC-BY: bron vermelden) |
| 2 | Leerplannen van KOV (LLinkid, pdf op PRO.), GO! (pdf op pro.g-o.be), OVSG, POV | Export of API: **per net te bevestigen**. Anders pdf | Auteursrechtelijk beschermd. Niet meeleveren zonder toestemming van het net. Een school leest haar eigen leerplan in voor eigen gebruik |

De velden van de API komen uit de broncode van een open-sourceproject dat dezelfde API
gebruikt (`tibodepauw/Leerkrachtentools`). Fase 1 bevestigt ze met een echt antwoord. Per doel:
`code`, `omschrijving`, `onderwijsdoel_type`, en onder `onderwijsdoelenset`: de naam van de set,
`onderwijsstructuur` (`graad`, `stroom`, `leerjaar`) en `vlaamse_sleutelcompetentie` (`nr`,
`naam`). Sets voor het secundair heten bijvoorbeeld `SO_1STE_GRAAD_V2_1`.

## 5. Laag 1: minimumdoelen meeleveren

**Ophalen gebeurt nooit in de browser.** De sleutel zou dan in de publieke bundel staan, en de
API laat vermoedelijk geen verzoeken van andere sites toe (CORS, te bevestigen).

- `tools/leerplannen/haal-minimumdoelen.mjs` (Node 22.18 of nieuwer, geen afhankelijkheden;
  de normalisatie zelf staat in `src/lib/minimumdoelen.ts`): haalt alle pagina's op met
  `ONDERWIJSDOELEN_API_KEY` uit de omgeving, normaliseert, en schrijft per gekozen set een bestand.
  Opties: `--bron <bestand>` (offline, met een opgeslagen antwoord), `--uit`, `--rapport`,
  `--filter <regex>` (standaard de sets van het secundair).
- **Niets stil verliezen.** Het script schrijft niets en stopt met exitcode 3 als in een gekozen set
  een doel botst (zelfde code, andere tekst), een variant heeft (zelfde code en tekst, andere
  gegevens), wordt overgeslagen (geen code of omschrijving) of meerwaardige velden heeft, en ook als
  `totalItems` ontbreekt. Exitcode 1 bij een aantal dat niet klopt met `totalItems`, records die
  dubbel binnenkomen (verschuivende paginering), een fout halverwege en andere fouten; 2 als geen set
  herkend wordt. Het rapport toont altijd wat er binnenkwam (`veldInventaris`, `typeInventaris`,
  `paginaSleutels`, `alleSets`, `problemen`), zodat de eerste echte run de API-vorm laat zien.
  Sets die al een bestand hebben, worden altijd mee bijgewerkt, ook buiten de filter.
- **De sleutel beschermd.** Nooit in logs, rapport of bestanden (het script stopt als een tekst de
  sleutel bevat), en het volgt geen doorverwijzingen, want een eigen kop zoals `x-api-key` gaat
  daarbij mee naar de andere host.
- **Ongewijzigd = niet aanraken.** Een set waarvan het opnieuw gebouwde bestand byte voor byte
  gelijk is (met het oude tijdstip), wordt niet herschreven; zo is er geen verschil en geen pull
  request.
- `.github/workflows/minimumdoelen.yml`: met de hand te starten (Actions → Minimumdoelen bijwerken →
  Run workflow) en maandelijks (de 3de). Het ophalen gebeurt vóór `npm ci --ignore-scripts`, zodat
  geen installscript de stap met het geheim kan beïnvloeden. Het rapport komt altijd als artifact
  `minimumdoelen-rapport` mee. Bij wijzigingen pusht de taak een branch `minimumdoelen/bijwerken-…`
  en opent een pull request naar `claude/bookwidgets-web-app-kvcfim`. Een mens keurt het verschil
  goed; niets gaat automatisch live. Daarvoor moet in de repo-instellingen "Allow GitHub Actions to
  create and approve pull requests" aan staan (Settings → Actions → General); anders faalt de taak
  zichtbaar, met de vergelijkingslink in de samenvatting.
- De sleutel staat nooit in de repo, nooit in een log en nooit in een chat.

**Bestandsformaat**: `public/leerplannen/minimumdoelen/<SET>.json`, plus een `index.json`
met de beschikbare sets (zelfde kopvelden, plus `bestand`).

```json
{
  "app": "boosterz", "kind": "minimumdoelen", "v": 1,
  "set": {
    "id": "SO_1STE_GRAAD_V2_1", "naam": "…", "graad": "…", "stroom": "…", "leerjaar": "…",
    "sleutelcompetenties": [{ "nr": "…", "naam": "…" }],
    "bron": "https://www.onderwijsdoelen.be/doelen/SO_1STE_GRAAD_V2_1",
    "api": "https://onderwijs.api.vlaanderen.be/onderwijsdoelen",
    "naamsvermelding": "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)",
    "licentie": "nog te bevestigen", "opgehaald": "2026-10-05T10:00:00Z",
    "aantal": 0, "sha256": "…"
  },
  "doelen": [
{ "code": "…", "tekst": "…", "type": "…", "sleutelcompetentie": { "nr": "…", "naam": "…" }, "extra": { "…": "…" } }
  ]
}
```

- `graad`, `stroom` en `leerjaar` staan op setniveau als alle doelen dezelfde waarde hebben; per
  doel alleen als die afwijkt. `extra` bewaart onbekende tekstvelden van de API, zodat niets
  verloren gaat. `sha256` is de vingerafdruk van de doelen (canonieke JSON). Een `versie`-veld en
  de echte vorm van de set-id volgen na de eerste echte run.
- De bestanden gaan **niet** in localStorage (de volledige set is te groot) en niet in de
  hoofdbundel. De app haalt ze pas op als iemand ze nodig heeft. De service worker bewaart
  ze daarna voor offline gebruik ("andere eigen bestanden: netwerk eerst, cache als terugval").
- Een unittest (`src/lib/minimumdoelen.test.ts`) leest elk meegeleverd bestand en eist dat de
  codes uniek zijn, de teksten niet leeg, `aantal` klopt en `sha256` overeenkomt met de doelen.
  Zo blokkeert de bestaande uitrolpoort een kapot bestand.

## 6. Laag 2: leerplannen van de netten inlezen

Vaste volgorde, van meest naar minst betrouwbaar:

1. **Gestructureerde export of API van het net**, als die bestaat. Eén vertaler per net naar
   het formaat hieronder.
2. **De officiële pdf, met een vaste lezer per net.** Geen AI: elk net gebruikt een vaste opmaak
   (bv. "LPD 9 De leerlingen …" met verwijzingen naar minimumdoelen). De pdf wordt in de browser
   gelezen, zoals nu al bij "Pdf inlezen". De lezer zet tekst om naar doelen met code, tekst,
   rubriek, niveau en verwijzingen.
3. **AI, als laatste redmiddel.** De opdracht vraagt letterlijk overnemen (nooit inkorten).
   Lange teksten gaan in stukken in plaats van afgekapt te worden.

Alle drie de wegen eindigen in dezelfde controlepoort (§ 7). Een leerplan dat er niet door
geraakt, kan je bewaren als "niet gecontroleerd", maar nooit als "gecontroleerd".

## 7. De controlepoort

Een pure functie, `src/lib/curriculumCheck.ts`, zonder model:

```ts
checkCurriculum(goals, sourceText, { minimumdoelen?, expectedPrefix? }) → CheckReport
```

| Controle | Regel | Gevolg |
|---|---|---|
| **Letterlijk** | Elk doel staat woord voor woord in de bron, na normalisatie: witruimte samenvouwen, zachte afbreekstreepjes weg, afbreking op regeleinde herstellen ("verwe-\nring" → "verwering"), typografische aanhalingstekens en ligaturen gelijktrekken, opsommingstekens vooraan weg | Doel rood; leerplan kan niet "gecontroleerd" worden |
| **Volledig** | Nummering per reeks zonder gaten of dubbels (LPD 1…n); geen afgekapte bron; aantal gelijk aan wat de bron zelf meldt (als ze dat doet) | Ontbrekende nummers staan in het rapport |
| **Verwijzingen** | Elke verwijzing naar een minimumdoel bestaat in de gekozen set, voor die graad en stroom | Onbekende verwijzing rood |
| **Dekking van laag 1** | Welke minimumdoelen van de betrokken sleutelcompetenties door geen enkel leerplandoel gedekt worden | Ter info, geen blokkering |
| **Herkomst** | Net, leerplancode, versie, geldig vanaf, bron-URL en sha-256 van het bronbestand zijn ingevuld | Ontbrekend veld rood |

Daarna **controleert een mens**: per doel de tekst naast de vindplaats in de bron, met de
afwijkingen gemarkeerd. Bevestigen zet de status op "gecontroleerd" met naam en datum en zet het
leerplan op slot. Wie toch iets wil wijzigen, maakt een kopie; die is "eigen" en niet meer
"gecontroleerd".

## 8. Datamodel (versie 2)

Alle nieuwe velden zijn optioneel. Bestaande leerplannen blijven werken zonder omzetting; ze
krijgen in de lijst het label "niet gecontroleerd".

```ts
interface Curriculum {
  // … bestaande velden
  kind?: 'leerplan' | 'eigen';                 // laag 1 zit niet in localStorage
  herkomst?: {
    methode: 'export' | 'pdf' | 'ai' | 'handmatig';
    leerplancode?: string;                      // bv. "I-Aar-a"
    versie?: string;
    geldigVanaf?: string;                       // ISO-datum
    bronUrl?: string;
    bronSha256?: string;                        // vingerafdruk van het bronbestand
    ingelezenOp: number;
  };
  controle?: {
    status: 'niet-gecontroleerd' | 'gecontroleerd' | 'gewijzigd';
    rapport?: CheckReport;
    door?: string;                              // naam van wie bevestigde
    op?: number;
    doelenSha256?: string;                      // vingerafdruk van de doelen bij bevestiging
  };
  minimumdoelenSet?: string;                    // bv. "SO_1STE_GRAAD_V2_1"
}

interface CurriculumGoal {
  // … bestaande velden
  refs?: string[];                              // codes van minimumdoelen in minimumdoelenSet
  niveau?: 'basis' | 'verdieping' | 'keuze';    // vertaling van de termen van elk net
}
```

- `controle.doelenSha256` maakt wijzigingen zichtbaar. Bij import van een gedeeld bestand
  rekent de app de vingerafdruk opnieuw uit; klopt die niet, dan wordt de status "gewijzigd".
  Dat is geen beveiliging, wel eerlijkheid over wat je voor je hebt.
- `sanitizeCurriculum` en `exportCurriculumJson` nemen de nieuwe velden mee. Exportbestanden van
  versie 1 blijven inleesbaar.
- Doelcodes worden altijd binnen één leerplan opgezocht (`curriculumId` van de cursus of de
  widget). Het zoeken over alle leerplannen heen verdwijnt uit de dekking en het klasoverzicht.

## 9. Dekking

`computeCoverage` (in `src/lib/coverage.ts`) krijgt een tweede uitvoer: per minimumdoel van de
gekozen set de leerplandoelen die ernaar verwijzen, en daarlangs de secties en vragen.
`GoalCoverage.tsx` toont een schakelaar "Leerplan · Minimumdoelen". Het percentage op de
cursuskaart blijft dat van het leerplan.

## 10. Schermen

- **Leerplannen**: bovenaan "Officiële minimumdoelen" (set kiezen, alleen lezen, met bron en
  ophaaldatum), daaronder de leerplannen van de school met een label: gecontroleerd,
  niet gecontroleerd of gewijzigd.
- **Inlezen**: een stappenplan in vier stappen: net kiezen, bron kiezen (export, pdf of AI),
  het controlerapport, en het nakijkscherm met doel en bron naast elkaar.
- Toegankelijk zoals de rest van de app: één `h1`, alles met het toetsenbord bedienbaar, en de
  status niet alleen met kleur aangeduid.

## 11. Werkpakketten

| Pakket | Inhoud | Agent | Poort |
|---|---|---|---|
| L1 | Ophaalscript, workflow, `index.json`, datatest | `bouwer` | test op een opgenomen API-antwoord |
| L2 | Datamodel v2, sanering, export en import, vingerafdrukken | `kernbouwer` | unittests, oude exportbestanden blijven inleesbaar |
| L3 | Controlepoort `curriculumCheck.ts` met normalisatie | `kernbouwer` | unittests met echte pdf-tekstfragmenten (afbreking, ligaturen, kolommen) |
| L4 | Pdf-lezer per net (KOV, GO!, OVSG, POV), elk in een eigen worktree | `bouwer` ×4 | per net: alle doelen van één echt leerplan letterlijk en volledig |
| L5 | Schermen: officiële sets, inleesstappen, nakijkscherm, labels | `bouwer` | rooktest, 390 px, toetsenbord |
| L6 | Dekking op twee lagen | `bouwer` | unittests op `computeCoverage` |
| L7 | AI-import aanscherpen: letterlijk, in stukken, door de poort | `bouwer` | test met nagebootste AI |
| Review | Correctheid, privacy en juridisch, toegankelijkheid, bundel | `reviewer` per invalshoek, `rechter` | alleen bevestigde bevindingen |

**Testmateriaal**: leerplannen zijn auteursrechtelijk beschermd. In de publieke repo komen
alleen korte fragmenten die de opmaak tonen (of nagemaakte tekst in dezelfde opmaak). De test
op een volledig echt leerplan draait lokaal, met de pdf buiten de repo.

**Bundel**: de minimumdoelen en de pdf-lezers horen niet op het kritieke leerlingpad. De
leerplanpagina is al lui geladen; de lezers komen in een eigen chunk.

## 12. Open vragen

**Aan het Departement Onderwijs en Vorming** (via TechLoket Onderwijs; de sleutel is er al):
1. Mag de bestaande sleutel ook voor Boosterz gebruikt worden, of is er een sleutel per toepassing nodig?
2. Onder welke licentie mogen de opgehaalde doelen bewaard en in een publieke webapp getoond
   worden, en met welke naamsvermelding?
3. Laat de API verzoeken toe vanuit een browser op een ander domein (CORS)? Antwoord bepaalt
   alleen of een latere versie ook rechtstreeks kan ophalen.
4. Is er een veld of een eindpunt dat de koppeling tussen leerplandoelen en minimumdoelen geeft,
   of beheert elk net die zelf?
5. Is de Nieuwsbrief API K&C de plek waar nieuwe versies van een set aangekondigd worden, of geeft
   de API zelf ook een versie aan?

**Aan elk net (KOV, GO!, OVSG, POV)**:
1. Bestaat er een gestructureerde export of API van de leerplandoelen, met de verwijzingen naar
   de minimumdoelen?
2. Mag een leerkracht het leerplan van de eigen school inlezen in een gratis, lokale webapp?
   Wij gaan ervan uit van wel, voor eigen gebruik.
3. Mogen we de leerplandoelen meeleveren in de app, met bronvermelding en zonder wijzigingen?
   Zo nee, dan leest elke school ze zelf in.

**Voor de beheerder van Boosterz**:
1. De bestaande sleutel (mail van 9 januari 2026) als GitHub-geheim `ONDERWIJSDOELEN_API_KEY` zetten.
2. Optioneel: in de cloudomgeving `onderwijs.api.vlaanderen.be`, `www.onderwijsdoelen.be` en de
   sites van de netten toelaten, zodat fase 1 de formaten rechtstreeks kan testen.
3. De repo heeft geen licentie. Kies er een voordat er overheidsdata met naamsvermelding in komt,
   zodat duidelijk is wat voor de code geldt en wat voor de data.

## 13. Bewust niet

- **Geen leerplannen van de netten in de repo** zonder schriftelijke toestemming.
- **Geen ophalen vanuit de browser met een sleutel.**
- **Geen automatische updates van officiële doelen zonder menselijke goedkeuring.**
- **Geen "slimme" correctie van doelteksten.** Wat niet letterlijk klopt, wordt gemeld, niet
  stil verbeterd.
