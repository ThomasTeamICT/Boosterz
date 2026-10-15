# Leerplannen — ontwerp voor sluitend inlezen van doelen

*Status: ontwerp (fase 2), nog niet gebouwd. Fase 1 (een echt API-antwoord en per net één echt
leerplan) moet de punten met "te bevestigen" afvinken vóór het bouwen begint.*

## Stand van zaken (bijgewerkt 10 oktober 2026)

| Wat | Stand |
|---|---|
| API-sleutel Onderwijsdoelen-API | **Bestaat.** Aangevraagd via het portaalformulier op 18 december 2025, aangemaakt op 9 januari 2026 door de Centrale cel ICT. De sleutel kwam per mail in de ICT-mailbox van de scholengroep en geldt voor alle open API's van Onderwijs & Vorming. Hij staat nergens in de repo. |
| Sleutel als GitHub-geheim `ONDERWIJSDOELEN_API_KEY` | **Gedaan** op 5 oktober 2026 (repository secret voor Actions). |
| Pakket L1 (ophaalscript, workflow, datatest) | Gebouwd en gereviewd (twee reviewers, rechter). **Eerste echte run (5 oktober 2026)**: volledig opgehaald (24019 doelen, 49 pagina's, `totalItems` klopt), maar terecht gestopt (exit 3): sets met dezelfde lange naam vielen samen. Opgelost: de setsleutel is nu `ODS_<onderwijsdoelenset_id>`, elk doel krijgt zijn `@id`, en alle API-velden gaan mee in `extra`. Run 2 en 3 toonden de rest: binnen een set is een code niet altijd uniek (§ 5, "Wat de echte gegevens leren"); een doel wordt nu herkend aan zijn `@id`. **Run 4 geslaagd**: pull request #2 met 950 sets (15 324 doelen, 15 MB), nagekeken door de hoofdsessie (datatest en build groen) en op 5 oktober 2026 samengevoegd op vraag van de eigenaar. **Laag 1 is klaar.** Elke maand haalt de taak de doelen opnieuw op en opent een pull request als er iets verandert. Volgende stap: laag 2 (doelen tonen in de app, koppeling met leerplannen en cursussen). |
| Laag 2, ronde 1 (§ 14): inleesweg, verwijzingen, hulp | **Bezig** sinds 5 oktober 2026. Klaar en live: basis, kern (lezer, verwijzingen, nakijkpoort), de pagina "Officiële minimumdoelen", wegwijzer en nakijkstatus. **Ronde 1 klaar** (5 oktober 2026): officiële minimumdoelen in de app, inleeswizard met nakijkpoort, verwijzingen naar set + vast nummer, wegwijzer en hulp. Twee reviews met rechter, alle bevestigde punten hersteld; 2004 unittests en de rooktest groen. Pull request #3 (geldigheid per set) samengevoegd: oude versies zijn standaard verborgen, en een oude set wijst zijn opvolger aan. Ook een set met geldigheid "Onbekend" naast een geldige set met dezelfde naam (128 keer versie 2.0 naast 2.1) geldt nu als oudere versie. Een STEM-set legt uit dat de bron niet per vak indeelt en dat het leerplan van het net zegt wat bij een vak hoort; je kan zoeken in de doelen van een set. Een eigen doelenlijst samenstellen uit hele sets of losse doelen (§ 15): gebouwd, gereviewd (twee reviewers, rechter) en hersteld, live (6 oktober 2026). Daarna loopt een grondige debugronde over de hele app. Volgende: echte leerplan-pdf's om de lezer te bevestigen (KOV I-Aar-a, een GO!-leerplan), daarna de dekking op twee lagen (L6). |
| Studierichtingen en dekking op twee lagen (L6) | **Klaar en live** (10 oktober 2026): import van de matrix en van de doelen per richting (maandelijks via de workflow "Leerplangegevens bijwerken"), cursushulp per richting en jaar zonder AI, en de dekking op minimumdoelen via de verwijzingen (L6), per cursus en over alle cursussen van een richting. Eindreview met rechters en rooktest op echte data gedaan. Fase 2 (gaten dichten, mijn richtingen, klas) is live. Fase 3 (beroepskwalificaties per richting: een nagekeken leerplan met competenties, methode `beroepskwalificatie` met `bkRefs`, en de dekking erop) is klaar en live (11 oktober 2026). Ontwerp en stand van zaken: `docs/STUDIERICHTINGEN.md`. |
| Vraag aan het GO! (via een contactpersoon bij PBD) | Concept klaar bij de eigenaar (5 oktober 2026): een afgebakend experiment met enkele leerplannen. Nog te versturen. |
| Vragen aan het departement (§ 12) | Nog te stellen. Onderzoek van 11 oktober 2026 en een kant-en-klare vraag (licentie, naamsvermelding: onderwijsdoelen.be noemt AHOVOKS als uitgever, niet het departement) in `docs/STUDIERICHTINGEN.md` § 23.10. Sinds 24 maart 2026 **alleen via het formulier van TechLoket Onderwijs**, niet meer per mail (Nieuwsbrief API K&C van AHOVOKS). |
| Vragen aan KOV, GO!, OVSG, POV (§ 12) | Teksten klaar in het aanvraagdossier (Claude Docs, "Aanvraagdossier leerplangegevens"); nog niet verstuurd. |
| Sturender samenstellen en de brug naar een cursus (§ 16) | **Bezig** sinds 15 oktober 2026, op vraag van de eigenaar bij het testen voor een demo: eerst de leerlingen kiezen, tweelingen (gewoon/buitengewoon) en gemengde stromen met één klik oplossen, geen set-nummers meer in de waarschuwingen, en na het bewaren "Wat nu?" met "Maak een cursus met deze doelen" en "Gebruik ze in een cursus die je al hebt" (ook op de pagina Leerplannen). Stand in § 16. |
| Eerste toepassing | De cursus "Aardrijkskunde: bodem en landschap" (leerplan KOV I-Aar-a) krijgt doelcodes zodra laag 1 en het leerplan erin zitten. De bijhorende minimumdoelen: `ODS_3287` (1ste graad A-stroom, ruimtelijk bewustzijn, 09.01–09.08, geldig). |

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
| Zonder `curriculumId` zoekt `findGoalByCode` over alle leerplannen heen: "LPD 9" van twee vakken botst. **Opgelost voor de scores en de dekking** (oktober 2026): een doelscore draagt het leerplan van de widget (`GoalScore.curriculumId`, sleutel leerplan + code), en een oefening uit een ander leerplan telt niet als dekking (`otherCurriculumWidgets`). Voor de juiste doeltekst moeten de schermen dat `curriculumId` nog meegeven aan `goalLabel` (volgend pakket); zonder `curriculumId` zoekt `findGoalByCode` nog altijd overal | `src/lib/curriculum.ts`; opgelost in `src/lib/goals.ts`, `src/lib/coverage.ts` |

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
- `.github/workflows/minimumdoelen.yml` (sinds oktober 2026 "Leerplangegevens bijwerken": ook de
  studierichtingen en hun doelen, zie `docs/STUDIERICHTINGEN.md` § 6): met de hand te starten (Actions →
  Leerplangegevens bijwerken → Run workflow, met de keuze alles, minimumdoelen of studierichtingen) en
  maandelijks (de 3de). Beide ophaalstappen draaien vóór `npm ci --ignore-scripts`, zodat
  geen installscript de stap met het geheim kan beïnvloeden. De poort is de volledige `npx vitest run`. De
  rapporten komen altijd als artifacts `minimumdoelen-rapport` en `studierichtingen-rapport` mee. Bij
  wijzigingen pusht de taak een branch `leerplangegevens/bijwerken-…`
  en opent een pull request naar `claude/bookwidgets-web-app-kvcfim`. Een mens keurt het verschil
  goed; niets gaat automatisch live. Daarvoor moet in de repo-instellingen "Allow GitHub Actions to
  create and approve pull requests" aan staan (Settings → Actions → General); anders faalt de taak
  zichtbaar, met de vergelijkingslink in de samenvatting.
- De sleutel staat nooit in de repo, nooit in een log en nooit in een chat.

**Bestandsformaat**: `public/leerplannen/minimumdoelen/ODS_<id>.json`, plus een `index.json`
met de beschikbare sets (zelfde kopvelden, plus `bestand`). `<id>` is het `onderwijsdoelenset_id`
van de API: uniek en stabiel, ook als een setnaam verandert. Setnamen zijn lang en vaak bijna
gelijk; een sleutel uit de naam viel in de eerste echte run samen voor verschillende sets.

```json
{
  "app": "boosterz", "kind": "minimumdoelen", "v": 1,
  "set": {
    "id": "ODS_1234", "naam": "…", "apiId": "1234", "korteNaam": "…", "versie": "…",
    "graad": "…", "stroom": "…", "leerjaar": "…",
    "sleutelcompetenties": [{ "nr": "…", "naam": "…" }],
    "bron": "https://www.onderwijsdoelen.be/",
    "api": "https://onderwijs.api.vlaanderen.be/onderwijsdoelen",
    "naamsvermelding": "Bron: Vlaamse overheid, Onderwijs en Vorming (onderwijsdoelen.be)",
    "licentie": "nog te bevestigen", "opgehaald": "2026-10-05T10:00:00Z",
    "aantal": 0, "sha256": "…"
  },
  "doelen": [
{ "id": "…", "code": "…", "tekst": "…", "type": "…", "sleutelcompetentie": { "nr": "…", "naam": "…" }, "extra": { "…": "…" } }
  ]
}
```

- `graad`, `stroom` en `leerjaar` staan op setniveau als alle doelen dezelfde waarde hebben; per
  doel alleen als die afwijkt. `id` is het vaste nummer van het doel in de API (`@id`). `extra`
  bewaart alle andere velden van de API ongewijzigd (kennisdimensies, `titels`, `geldigheid`,
  `optioneel`, …), zodat niets verloren gaat. `sha256` is de vingerafdruk van de doelen (canonieke
  JSON). `bron` wijst naar de site zelf: het patroon van een link naar één set is nog niet gekend.
  `omschrijving` is vaak HTML (`<p>…</p>`) en blijft letterlijk; de app maakt er bij het tonen
  veilige tekst van (laag 2).
- De bestanden gaan **niet** in localStorage (de volledige set is te groot) en niet in de
  hoofdbundel. De app haalt ze pas op als iemand ze nodig heeft. De service worker bewaart
  ze daarna voor offline gebruik ("andere eigen bestanden: netwerk eerst, cache als terugval").
- Een unittest (`src/lib/minimumdoelen.test.ts`) leest elk meegeleverd bestand en eist dat elk
  doel uniek is (aan zijn `id`, of zonder id aan zijn code), de teksten niet leeg zijn, de volgorde
  klopt (code, dan id), `aantal` klopt en `sha256` overeenkomt met de doelen.
  Zo blokkeert de bestaande uitrolpoort een kapot bestand.

**Wat de echte gegevens leren** (runs van 5 oktober 2026, 24019 doelen, 672 sets):

- Een doel heeft een vast nummer (`@id`). Dat is de enige sleutel die altijd uniek is. Hetzelfde
  doel kan in meer dan één set staan (bv. Artistieke Opvoeding in twee sets met dezelfde ids).
- Een code is niet uniek binnen een set. De nummering begint opnieuw per rubriek of pakket:
  Artistieke Opvoeding heeft een doel 1 bij Muzikale opvoeding én bij Plastische opvoeding;
  Fysica heeft 11.17.01 in "bouwkunde pakket 1" en "pakket 2". De rubriek staat in `extra.titels`.
  Het script meldt zulke codes in `rapport.dubbeleCodes`; laag 2 toont daarom altijd code én
  rubriek, en verwijst intern naar het `id`.
- Sommige STEM-sets bevatten verwijzingen: code "zie eindterm", tekst "6.15". Ze blijven letterlijk
  staan; laag 2 moet ze als verwijzing naar een ander doel lezen, niet als eigen doel.
- In de volwassenenonderwijsset Moderne Talen heeft code "BC AAV MVT 032" twee verschillende
  teksten zonder ander onderscheid dan het id. Mogelijk een fout in de bron: vraag voor TechLoket.
- De API geeft ook oude sets. Van de 950 gekozen sets zijn er 408 geldig, 411 niet meer geldig
  (bv. de vakgebonden eindtermen aardrijkskunde 1997–2020, `ODS_2118`) en 131 met geldigheid
  "Onbekend". Van die 131 zijn er 128 versie 2.0 (2021) van een set die nu als versie 2.1 geldt; alleen
  3 sets van het volwassenenonderwijs (`ODS_2704`–`ODS_2706`) hebben geen nieuwere versie. De geldigheid staat per doel in `extra.geldigheid` (`type`, `geldig_van_dt`,
  `geldig_tot_dt`). We bewaren alles (herkomst en oude verwijzingen blijven naspeurbaar); laag 2
  toont standaard alleen geldige doelen.
- 383 sets hebben exact dezelfde doelen als een andere set (dezelfde doelen voor een andere
  onderwijsvorm of stroom). Ze blijven apart, want elke set is een eigen officiële publicatie.
- Ongeveer 40 % van de teksten is HTML (`<p>…</p>`, `&nbsp;`); laag 2 zet dat om naar veilige tekst.

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
    methode: 'officieel' | 'samengesteld' | 'export' | 'pdf' | 'tekst' | 'ai' | 'handmatig';
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
  minimumdoelenSets?: string[];                 // bv. ["ODS_3287"]: een leerplan raakt vaak meer sets
  weggelatenCodes?: { code: string; set: string; id: string }[];  // § 15: codes die bij het aanpassen
                                                // van een samengestelde lijst wegvielen; nooit hergebruikt
}

interface CurriculumGoal {
  // … bestaande velden
  refs?: { set: string; id: string; code: string }[];  // set + vast nummer (@id); de code alleen is niet uniek
  refsBron?: string;                            // de verwijzing zoals ze in de bron staat, bv. "MD 09.01"
}
```

Zo gebouwd in `src/lib/curriculumTypes.ts` (5 oktober 2026). `niveau` uit de eerste versie van dit
ontwerp is vervallen: het bestaande veld `level` (basis, uitbreiding) volstaat.

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
- De lijst toont standaard geen oude versies (`oudeVersieIds`): niet wat "Niet meer geldig" is, en niet wat
  "Onbekend" is terwijl dezelfde set (zelfde naam, soort, graad en stroom) nu geldt; die heet "Oudere versie".
  "Toon ook oude versies" toont ze erbij. De wizard en de editor stellen ze ook niet voor. De
  1ste graad A-stroom heeft drie generaties: per vak (tot 2020), per sleutelcompetentie (2019–2025)
  en de herziene versie (sinds 2024).
- Een set die niet meer geldt, krijgt een waarschuwing die de opvolger aanwijst (`opvolgersVan`):
  dezelfde set in een nieuwere versie, of voor een oude vakset de sets van nu voor dat vak (bv.
  natuurwetenschappen → "Wiskunde, exacte wetenschappen en technologie"), met een knop om ze te
  openen; daarnaast "Toch als leerplan gebruiken". Het leerplan heet dan "… (niet meer geldig)". Zoeken op een vak vindt ook de sleutelcompetentie
  waar het sinds 2019 onder valt (bv. aardrijkskunde → ruimtelijk bewustzijn): een hulp bij het
  zoeken, geen officiële koppeling.
- Een STEM-set ("wiskunde, exacte wetenschappen en technologie", `isStemSet`) bundelt wiskunde,
  natuurwetenschappen en techniek; de bron zegt niet welk doel bij welk vak hoort. Het scherm zegt dat,
  verwijst naar het leerplan van het net als basis voor een cursus, biedt voorbeeldwoorden om in de doelen
  te zoeken, en wijst in de 2de en 3de graad de aparte sets voor biologie, chemie en fysica aan
  (`vakSetsBijStem`). Vanaf 10 doelen staat er een zoekveld boven de doelen; "Gebruik als leerplan" neemt
  altijd de hele set.
- Een eigen doelenlijst samenstellen uit meerdere sets of uit een deel van een set (bv. de NW-doelen uit
  de STEM-set, of basisgeletterdheid uit Nederlands, wiskunde en digitale competenties): zie § 15.

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
6. Is `@id` van een onderwijsdoel stabiel over de tijd, zodat we er blijvend naar kunnen verwijzen?
7. In de set Moderne Talen (volwassenenonderwijs) heeft code "BC AAV MVT 032" twee verschillende
   teksten. Is dat bedoeld, en zo ja, hoe onderscheid je ze?
8. Hoe ziet een link naar één set op onderwijsdoelen.be eruit, zodat elk bestand naar zijn bron wijst?

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
4. De licentie van de minimumdoelen (vraag 2 aan het departement) moet beantwoord zijn vóór een
   brede uitrol: de bestanden staan nu met "licentie: nog te bevestigen" publiek op de site.

## 13. Bewust niet

- **Geen leerplannen van de netten in de repo** zonder schriftelijke toestemming.
- **Geen ophalen vanuit de browser met een sleutel.**
- **Geen automatische updates van officiële doelen zonder menselijke goedkeuring.**
- **Geen "slimme" correctie van doelteksten.** Wat niet letterlijk klopt, wordt gemeld, niet
  stil verbeterd.

## 14. Laag 2, ronde 1: inleesweg, verwijzingen en hulp (oktober 2026)

Doel van de ronde: een leerkracht krijgt het leerplan van zijn net vlot en betrouwbaar in
Boosterz, met verwijzingen naar de officiële minimumdoelen die kloppen, en vindt zonder uitleg
de weg. Wat er nog niet in zit: de leesregels per net bevestigd met echte pdf's (die ontbreken
nog, regel 11 van de werkwijze), en de dekking op twee lagen (L6).

**Basis (hoofdsessie, klaar).** Types v2 in `curriculumTypes.ts`; `sha256.ts` (synchroon, zonder
afhankelijkheden); in `curriculum.ts`: `doelenVingerafdruk`, `controleStatus`, `bevestigLeerplan`,
`maakEigenKopie`; in `minimumdoelen.ts`: `htmlNaarTekst` en `geldigheidVanDoelen`. Het ophaalscript
zet `geldigheid`, `geldigVan` en `geldigTot` in de kop van elke set en in de index.

**Kern (`kernbouwer`): pure modules met unittests.**
- `curriculum.ts`: saneren van versie 2 (soort, herkomst, controle, sets, verwijzingen), export
  met `v: 2`, import van versie 1 en 2. Een nagekeken leerplan waarvan de vingerafdruk niet meer
  klopt, wordt "gewijzigd" bij import en bij bewaren.
- `pdfText.ts`: `extractPdfLines`, met regels in plaats van één lange tekst en zonder afkappen.
  De groepering van tekststukken in regels is een pure, geteste functie.
- `leerplanLezer.ts`: van tekst naar doelen (code, tekst, rubriek, verwijzing zoals in de bron,
  regelnummer, bronfragment). Herkent de gangbare nummeringen zelf, herstelt afbreking aan het
  regeleinde, slaat kop- en voetregels over. Getest met nagemaakte tekst in de opmaak van de netten.
- `minimumdoelVerwijzing.ts`: verwijzingen vinden ("MD 09.01", "ET 9.1", reeksen), codes
  gelijkstellen (09.01 = 9.1), oplossen naar set + vast nummer, met "onbekend" en
  "dubbelzinnig" als uitkomst; sets voorstellen bij graad, stroom en zoekwoorden.
- `curriculumCheck.ts`: de controlepoort van § 7, met bevindingen in gewone taal, per doel de
  vindplaats in de bron, en `kanBevestigen`.

**Minimumdoelen in de app (`bouwer`).**
- `minimumdoelenBron.ts`: index en sets lui ophalen uit `public/leerplannen/minimumdoelen/`, met
  cache, controle van het set-id en `valideerSetBestand`.
- Pagina "Officiële minimumdoelen" (`/leerplannen/minimumdoelen`): zoeken, filteren (standaard
  alleen geldige sets), een set lezen per rubriek, en "Gebruik als leerplan": een nagekeken
  leerplan met verwijzingen naar zichzelf, rechtstreeks uit de officiële set.
- Leerplannenpagina: een wegwijzer met drie wegen (officiële minimumdoelen gebruiken, leerplan van
  je net inlezen, bestand van een collega), waar je het leerplan van je net vindt, en labels per
  leerplan: "Nagekeken", "Niet nagekeken", "Gewijzigd na nakijken" (icoon en tekst, niet alleen
  kleur). Een nagekeken leerplan staat op slot; wijzigen kan in een eigen kopie.

**Inleeswizard (`bouwer`, na de kern).** Vier stappen: wat lees je in (net, vak, graad, stroom,
leerplancode), de bron (pdf of geplakte tekst; AI als laatste redmiddel), welke minimumdoelen
(voorgestelde sets, verwijzingen automatisch opgelost), en nakijken (per doel de tekst naast de
bron, rood, oranje of groen, verwijzingen kiezen waar ze dubbelzinnig zijn). Bevestigen vraagt een
naam en een vinkje "Ik heb elk doel met de bron vergeleken"; bewaren zonder nakijken kan altijd.

**Woordkeuze in de app.** "Nakijken" en "nagekeken", nooit "controleren"; "leerplan",
"bewaren". De interne status blijft `gecontroleerd`.

**Poorten.** Lint, typecheck, unittests en build; de rooktest dekt de nieuwe pagina's op 390 px.
Daarna een review per invalshoek (juistheid, toegankelijkheid en taal, privacy en juridisch) met
de rechter.

**Review (5 oktober 2026, juistheid; rechter).** Op te lossen in deze ronde: `htmlNaarTekst` liet
tekens als `<` en `>` vallen, plette machten (`<sup>`) en plakte tabelcellen aan elkaar (23 doelen in
13 sets, ook geldige); de poort vergeleek de verwijzingen uit de bron niet met de gekoppelde, keurde
goed zonder bron, en zag afgekapte of samengevoegde doelen en niet-gelezen doelregels niet; de lezer
kapte een doel af na "o.a." of "t.o.v." aan het regeleinde; `bevestigLeerplan` eiste geen geslaagd
rapport; de lezer was kwadratisch bij lange bronnen.

Bewust later of zo gelaten:
- Gaten in de nummering blijven een waarschuwing (§ 7); een ontbrekend laatste doel vangt de poort
  via de doelcodes in de bron.
- "Aantal zoals de bron het meldt" wacht op echte pdf's: melden leerplannen zo'n aantal?
- De vingerafdruk dekt alleen de doelen, niet de herkomst (§ 8). Later eventueel een eigen
  vingerafdruk voor de herkomst, met een versie, zodat bestaande nagekeken leerplannen niet omslaan.
- Een gedeeld bestand kan "nagekeken" of "officieel" vervalsen: bewust geen beveiliging. Later bij
  de import van een officieel leerplan de doelen opnieuw afleiden uit de set.
- Tabelkolommen door elkaar, en een tweede zin met een hoofdletter op een nieuwe regel: vermoedens
  of dubbelzinnig; de eerste echte pdf beslist (werkwijze, regel 11).
- Doorgehaalde tekst (`<s>`, bv. ODS_3120 en ODS_3266): nagaan op onderwijsdoelen.be wat de officiële
  tekst is; tot dan blijft de doorhaling zichtbaar.
- Officiële leerplannen die vóór het herstel bewaard werden (5 oktober), kunnen een fout omgezette
  tekst hebben; "Gebruik als leerplan" maakt na het herstel een nieuw, juist leerplan.

**Review schermen (5 oktober 2026, toegankelijkheid en taal; privacy en juridisch; rechter).**
Bevestigd en in herstel: een oude set stond vooraan en werd zonder waarschuwing "nagekeken"; de
AI-weg zei "alles blijft op dit toestel" terwijl de tekst naar de AI-aanbieder gaat; stap 2 liep
dood zonder gevonden doelen; dubbelzinnige verwijzingen toonden geen stroom; jargon ("set-id",
"de lezer", regelnummers); focus na bewaren; de privacypagina noemde de naam van wie nakeek niet;
een doel-id als "constructor" liet de wizard vastlopen; import zonder groottegrens.

Bewust later: een Content-Security-Policy (app-breed, botst met een eigen AI-adres); vertraging
bij gekunstelde eigen invoer van vele megabytes; finaliteit (aso, tso, bso, …) voor de 2de en
3de graad in de wizard; "set" overal hernoemen (één uitlegzin volstaat).


## 15. Eigen doelenlijst samenstellen (oktober 2026)

**Vraag van de eigenaar.** Een leerkracht wil een cursus baseren op een deel van de minimumdoelen:
de doelen van één vak uit een set die vakken bundelt (natuurwetenschappen uit de STEM-set), of
doelen uit meerdere sets samen (basisgeletterdheid: Nederlands, STEM en digitale competenties).
"Gebruik als leerplan" neemt alleen één hele set.

**Ontwerp.**
- Nieuwe herkomst `samengesteld`: letterlijk overgenomen doelen uit één of meer officiële sets,
  gekozen door de leerkracht (src/lib/doelenSamenstellen.ts). Elk doel verwijst naar precies één
  minimumdoel (set + vast nummer); `minimumdoelenSets` noemt de sets in volgorde.
- De nakijkpoort kijkt per doel na in plaats van per volledige set: elke tekst gelijk aan die van
  zijn minimumdoel, geen minimumdoel twee keer, geen verwijzing naar een set buiten de lijst. Geen
  fout voor wat niet gekozen is en geen waarschuwing over gaten in de nummering; de dekking zegt
  "Je koos 12 van de 44 doelen van …". Lukt het nakijken, dan is de lijst meteen nagekeken door de
  officiële bron, en blijft ze dat na exporteren en importeren.
- Codes: zoals bij "Gebruik als leerplan"; botst een code tussen gekozen sets (bv. BG02.01 in de
  A- en de B-stroom), dan krijgen de botsende codes een onderscheid: de stroom, de graad, graad en
  stroom samen, de korte naam van de set (ingekort op een woordgrens tot 16 tekens, of tot 30 als
  dat niet onderscheidt, bv. "0000 (DUURZAAMHEID)"), en pas als laatste terugval het set-id (als
  de korte namen ze niet onderscheiden; herstel oktober 2026, zie STUDIERICHTINGEN.md § 14.9). Bij
  het aanpassen van een bewaarde lijst behoudt een doel zijn code, en een code van een weggelaten
  doel gaat nooit naar een ander doel, ook niet over meerdere aanpassingen heen: de lijst onthoudt
  die codes in `weggelatenCodes` (buiten de vingerafdruk). Een doel dat terugkomt, krijgt zijn oude
  code terug. Een koppeling in een cursus wijst zo nooit stil naar iets anders.
- Het scherm `/leerplannen/samenstellen` in drie stappen: sets kiezen, doelen kiezen (hele set of
  losse doelen, zoeken over alle gekozen sets), naam en bewaren. Ingangen: de wegwijzer bij
  Leerplannen, de pagina "Officiële minimumdoelen" (ook "Kies doelen uit deze set" per set) en
  "Keuze aanpassen" bij een bewaarde lijst. Een eigen kopie van zo'n lijst pas je aan in de editor.
- Label: "Officiële doelen, zelf gekozen". Een samengestelde lijst is vrij te delen (officiële tekst).

**Review (6 oktober 2026; correctheid en opslag, toegankelijkheid en taal; rechter).** Geen fout
gevonden waardoor een lijst met een niet-letterlijke tekst of een verkeerde verwijzing als nagekeken
bewaard wordt. Bevestigd en hersteld: de STEM-hint beschreef een handeling die niets deed zolang
de hele set gekozen was (de STEM-link opent nu met niets aangevinkt); een oude code kon over twee
aanpassingen heen naar een ander doel gaan (`weggelatenCodes`); aanpassen haalde doelen weg zonder
melding; hetzelfde minimumdoel in twee sets (gewoon en buitengewoon secundair) stond stil twee keer
in de lijst (nu een waarschuwing, bewust geen ontdubbeling: een minimumdoel is set + vast nummer);
twee sets met dezelfde naam waren voor een schermlezer niet te onderscheiden; focus die verloren
ging; meldingen over sets uit een link; een knop op de pagina Leerplannen; teksten bij een lijst die
niet nagekeken is. Bewust niet: geheugen voor een deelselectie bij weghalen en terugzetten; een
tekstronde over de namen van de functie.

## 16. Sturender samenstellen en de brug naar een cursus (oktober 2026)

**Vraag van de eigenaar (15 oktober 2026), bij het testen voor een demo.** Stap 3 van "Stel je eigen doelenlijst samen" toonde
zes waarschuwingen met set-nummers ("Nederlands (ODS_3346): 3 doelen staan ook in Nederlands (ODS_3343) …"): de leerkracht had
voor basisgeletterdheid in de 1ste graad alle twaalf sets gekozen, terwijl dat drie vakken zijn, elk voor de A- en de B-stroom
en voor het gewoon en het buitengewoon onderwijs. "Kan het sturender, zodat een leerkracht juiste keuzes maakt?" En: "het is me
nog niet duidelijk waar de brug met de cursus naartoe gaat."

### Stand van zaken § 16

| Wat | Stand | Op wie |
|---|---|---|
| Verkenning (wizard, sets, dubbels; wegen van een leerplan naar een cursus) | **Klaar** (15 oktober 2026) | twee verkenners |
| Ontwerp (deze paragraaf) | **Klaar** (15 oktober 2026) | hoofdsessie |
| S-A Sturen in de wizard (16.2 en 16.3) | Wacht | bouwer |
| S-B De brug naar een cursus (16.4 en 16.5) | Wacht | bouwer |
| Review, rechter, integratie, uitrol | Wacht | reviewers, rechter, hoofdsessie |

### 16.1 Wat de verkenning vond

- Van de 408 geldige sets zijn er 183 voor het gewoon secundair (SO), 192 voor het buitengewoon secundair (BuSO) en 33 voor het
  volwassenenonderwijs. Alle 180 geldige BuSO-sets van opleidingsvorm 4 hebben een SO-"tweeling" met **exact dezelfde vaste
  nummers**; hun namen zijn gelijk na het weglaten van "Buitengewoon " en " Opleidingsvorm 4". Geldige A- en B-stroomsets delen
  nooit nummers. Een stroom bestaat alleen in de 1ste graad.
- Stap 1 heeft filters op zoekterm, graad en soort onderwijs (standaard "alle"), maar **geen filter op stroom**. De korte naam is
  bij een tweeling gelijk ("Nederlands"); alleen de kenmerken onder de naam verschillen.
- Stap 3 gebruikt `setInBericht` (naam plus set-id) in elke waarschuwing, ook met een richting in de link.
- Na het bewaren zonder richting landt de leerkracht op het leerplan (`/leerplannen?open=`) met alleen de tip "Koppel deze doelen
  daarna aan je cursussen via Cursussen". Er is **geen enkele knop** van een leerplan naar een cursus buiten de studierichtingen.
  "Zelf bouwen" op Cursussen vraagt alleen een titel; het leerplan kies je achteraf in de instellingen van de cursus.
- Bouwstenen die al bestaan: `geraamteHoofdstukken` en `cursusVoorRichting` (`src/lib/richtingCursus.ts`; een samengestelde
  lijst geeft "een hoofdstuk per set, een sectie per rubriek"), `passendeCodes`, `setHandoff` voor de AI, de stijl `.rc-keuze`
  in `richtingcursus.css`, en de zinnen `FOUT_CURSUS_*` in `gatenWeergave.ts`.

### 16.2 Stap 1: eerst de leerlingen

- Bovenaan stap 1, vóór het zoekveld, staat een blok met als kop (h3) **"Voor welke leerlingen is deze lijst?"** en de uitleg
  **"Boosterz toont dan alleen de sets voor die leerlingen. Veel sets bestaan in meer versies: voor de A- en de B-stroom, en voor
  het gewoon en het buitengewoon onderwijs."**
  - Fieldset met legend **"Onderwijs"**, vier keuzerondjes: **"Gewoon secundair onderwijs"** (so), **"Buitengewoon secundair
    onderwijs"** (buso), **"Volwassenenonderwijs"** (vwo), **"Alle sets"** (alle). Dit vervangt de bestaande select "Soort
    onderwijs" (zelfde waarde in de filterstaat).
  - De bestaande select **"Graad"** schuift mee in dit blok.
  - Alleen als de graad "1ste graad" is: fieldset met legend **"Stroom"** en drie keuzerondjes **"A-stroom"**, **"B-stroom"**,
    **"Allebei"**. Een nieuwe filter `stroom` (`'' | 'A-stroom' | 'B-stroom'`) in `filterSets`; een set zonder stroom valt nooit
    weg door die filter. Een andere graad zet de stroom terug op "Allebei".
- **Beginwaarden.** Een nieuwe lijst zonder sets in de link: onderwijs "Gewoon secundair onderwijs", alle graden, stroom
  "Allebei". Staan er sets in de link (`?sets=`, `?richting=`, of een bewaarde lijst bij "Keuze aanpassen"), dan volgt het blok
  die sets: allemaal BuSO → "Buitengewoon …", allemaal SO → "Gewoon …", gemengd → "Alle sets"; één gemeenschappelijke graad en
  stroom worden overgenomen. Zo verdwijnt een set uit de link nooit uit beeld.
- Onder de resultaten staat, als de keuze sets verbergt: **"{n} sets voor andere leerlingen staan niet in de lijst."** met de
  knop **"Toon alle sets"** (zet onderwijs op "Alle sets" en stroom op "Allebei"; focus naar het zoekveld). Enkelvoud: "1 set
  voor andere leerlingen staat niet in de lijst."
- **Bij de gekozen sets** (onder de chips, `aria-live="polite"`, met een waarschuwingsicoon en tekst):
  - Een chip waarvan de **tweeling** ook gekozen is, krijgt onder de kenmerken: **"Dezelfde doelen als een andere set die je
    koos. Je hebt er maar één nodig."** De tweeling wordt herkend aan de naam (BuSO-naam zonder "Buitengewoon " en
    " Opleidingsvorm 4" gelijk aan de SO-naam, hoofdletters en dubbele spaties genegeerd) en dient alleen voor deze hulp; de
    echte controle op vaste nummers blijft die van stap 3.
  - Gekozen sets van het gewoon én het buitengewoon onderwijs: **"Je koos sets voor het gewoon én het buitengewoon onderwijs.
    Een lijst is meestal voor één groep leerlingen."**
  - Gekozen sets van de A- én de B-stroom: **"Je koos sets voor de A-stroom én de B-stroom. Een lijst is meestal voor één
    stroom."**

### 16.3 Stap 3: in gewone taal, met één klik

- **Tweelingen gekozen** (minstens één SO/BuSO-paar uit 16.2 in de selectie): een eigen melding (warn, `role="group"` met een
  label, boven "Let op: enkele dingen"):
  **"Je koos dezelfde doelen twee keer: voor het gewoon en voor het buitengewoon secundair onderwijs ({k} {set|sets} van elk).
  Een lijst is meestal voor één groep leerlingen. Voor wie is deze lijst?"** met drie knoppen: **"Gewoon secundair onderwijs"**,
  **"Buitengewoon secundair onderwijs"**, **"Allebei houden"**.
  - De eerste twee halen de tweelingen van de andere soort weg (alleen sets met een tweeling in de selectie; een set zonder
    tweeling blijft), zetten het blok van 16.2 op die soort, en tonen een statusregel (`aria-live="polite"`): **"De sets voor het
    {buitengewoon|gewoon} onderwijs zijn weggehaald. Je lijst telt nu {n} doelen."** De focus gaat naar de kop "Zo wordt je
    lijst bewaard".
  - "Allebei houden" verbergt de melding voor deze selectie (tot de keuze verandert); de gewone waarschuwing over dubbele
    doelen blijft in "Let op".
  - Bij tweelingen staat de gewone dubbelwaarschuwing van die paren niet ook nog in "Let op" (geen dubbele boodschap).
- **A- en B-stroom gemengd**: dezelfde vorm: **"Je lijst mengt sets voor de A-stroom en de B-stroom. Voor welke stroom is ze?"**
  met **"A-stroom"**, **"B-stroom"**, **"Allebei houden"**. Haalt de sets van de andere stroom weg (sets zonder stroom blijven),
  statusregel **"De sets voor de {B|A}-stroom zijn weggehaald. Je lijst telt nu {n} doelen."**
- **Geen set-nummers meer in de waarschuwingen.** `setInBericht` wordt: korte naam plus de kenmerken (`setKenmerken`: soort,
  graad, stroom, context) tussen haakjes, bv. "Nederlands (Buitengewoon secundair onderwijs · 1ste graad · A-stroom ·
  Opleidingsvorm 4 · Eindtermen basisgeletterdheid)". Alleen als twee sets daarna nog gelijk ogen, komt het set-id erbij. De
  dubbelzin wordt: **"‘{naam}’ ({kenmerken}) heeft {n} doelen die ook in ‘{naam2}’ ({kenmerken2}) staan. Ze komen nu twee keer
  in je lijst. Wil je ze maar één keer, haal dan een van beide sets weg."** (enkelvoud: "heeft 1 doel dat ook in … staat. Het
  komt nu twee keer …").
- **Naamvoorstel.** `voorstelTitel` voegt " · BuSO" toe als alle sets BuSO zijn (na het niveau): "Basisgeletterdheid · 1ste
  graad A-stroom · BuSO". Verder ongewijzigd.
- **Bewust niet:** automatisch ontdubbelen (een minimumdoel is set + vast nummer, § 15); de codes van botsende doelen (de
  terugval op het set-id blijft, want na "Gewoon …" of "Buitengewoon …" botst er niets meer).

### 16.4 Na het bewaren: "Wat nu?"

- Na een geslaagde "Bewaar de lijst" (met én zonder richting) blijft de leerkracht in de wizard en ziet ze in plaats van de
  stappen een paneel (component `NaBewaren`), met de focus op de kop:
  - kop (h2) **"Je lijst is bewaard"**;
  - **"‘{titel}’ staat bij Leerplannen, met {n} doelen{, nagekeken}. Hang ze nu aan een cursus: dan zie je in de cursus welke
    doelen ze dekt."** (", nagekeken" alleen als de lijst nagekeken is);
  - knoppen **"Maak een cursus met deze doelen"** (primair) en **"Gebruik ze in een cursus die je al hebt"**;
  - links **"Naar je leerplannen"** (`/leerplannen?open=<id>`) en, met een richting, **"Terug naar de studierichting"**
    (`richtingPad`).
- De toast na het bewaren verdwijnt (het paneel zegt het). Mislukt het bewaren, dan blijft alles zoals nu.

### 16.5 De twee vensters, ook op de pagina Leerplannen

**Venster "Nieuwe cursus met deze doelen"** (Modal, titel als h2):
- veld **"Titel van de cursus"**, vooraf ingevuld met de titel van de lijst; verplicht;
- fieldset legend **"Hoe begin je?"**, keuzerondjes (stijl `.rc-keuze`):
  - **"Met een geraamte"**: "Een hoofdstuk per set en een sectie per rubriek, met de doelcodes al op de secties. Je vult ze
    daarna zelf in." (standaard);
  - **"Met een lege cursus"**: "De cursus hangt aan je lijst. Je zet de doelcodes zelf op je secties.";
  - **"Laat de AI een eerste versie maken"**: "Met je eigen AI-sleutel." Zonder sleutel `aria-disabled` met "Nog geen AI-sleutel
    ingesteld." en een link "AI-instellingen" (zoals in het venster van de studierichting);
- voet: **"Annuleren"** en **"Maak de cursus"** (`aria-disabled` met "Nog nodig: een titel." zolang de titel leeg is).
- Zonder AI: `cursusVoorRichting` met een **optionele** doelgroep (de doelgroep van het leerplan als die geldig is; anders geen),
  `saveCourse` (de uitkomst wordt gecontroleerd: lukt het niet, dan in het venster **"Er is niets bewaard: de opslag van dit
  toestel is vol of geblokkeerd."**), daarna de editor met de toast **"Cursus gemaakt: {h} {hoofdstuk|hoofdstukken}, {c}
  {doelcode|doelcodes} klaar op de secties."** (geraamte) of **"Cursus gemaakt. Ze hangt aan ‘{lijst}’: zet de doelcodes op je
  secties."** (leeg). Met AI: `setHandoff({ source: '', title, curriculumId, goalCodes: [] })` en `/cursussen?ai=nieuw`.

**Venster "Gebruik deze doelen in een cursus"**:
- fieldset legend **"Welke cursus?"**, een keuzerondje per cursus op dit toestel (nieuwste eerst), met eronder
  "Nog geen leerplan" of "Hangt nu aan ‘{titel}’" of "Hangt al aan deze lijst", en als de cursus doelcodes heeft: "{k} van de
  {m} doelcodes in deze cursus staan in je lijst." (`passendeCodes`);
- geen cursussen: **"Je hebt nog geen cursussen op dit toestel."** met de knop **"Maak een cursus met deze doelen"** (opent het
  andere venster);
- hangt de gekozen cursus aan een ander leerplan: melding **"Deze cursus hangt nu aan ‘{oud}’. Kies je deze lijst, dan telt de
  doelendekking voortaan op ‘{nieuw}’. Wat in de cursus staat, verandert niet; doelcodes die niet in je lijst staan, zie je in de
  doelendekking."**;
- voet: **"Annuleren"** en **"Koppel aan deze cursus"** (`aria-disabled` met "Nog nodig: een cursus."); hangt de gekozen cursus
  al aan deze lijst, dan heet de knop **"Open de cursus"**;
- koppelen: lees de cursus opnieuw, zet alleen `curriculumId`, bewaar met `saveCourseGuarded`; fouten met `FOUT_CURSUS_GEWIJZIGD`,
  `FOUT_CURSUS_VERWIJDERD`, `FOUT_OPSLAG_VOL`; daarna de editor met de toast **"‘{cursus}’ hangt nu aan ‘{lijst}’."** Niets anders
  aan de cursus verandert (diep gelijk buiten `curriculumId` en `updatedAt`).

**Pagina Leerplannen.** In `LeerplanOpSlot` en in de editor van een leerplan met minstens één doel vervangt een blok de tip
"Koppel deze doelen daarna aan je cursussen via Cursussen …": kop (h3) **"Gebruik in een cursus"**, de zin **"Hang deze doelen
aan een cursus: dan zie je in de cursus welke doelen ze dekt."** en dezelfde twee knoppen. Niet bij een BK-leerplan (dat houdt
zijn knop "Studierichting openen").

**Bundel en laden.** De twee vensters zitten in een lui chunk dat pas bij de klik laadt (met de melding "Dit kon niet geladen
worden. Controleer je verbinding en probeer opnieuw." als dat mislukt). Het kritieke pad groeit niet; de chunks van
SamenstellenPage en CurriculaPage blijven onder 80 kB.

**Toegankelijkheid en taal.** Eén main en één h1 per scherm (de h1 van de wizard blijft); h2 in een venster en voor "Je lijst
is bewaard"; fieldsets met legend; `aria-disabled` met "Nog nodig: …", nooit `disabled`; focus na elke actie zoals hierboven;
tikdoelen van 44 px op ≤ 640 px; 390 px zonder horizontaal scrollen; nooit een set-id of groepnummer in de nieuwe teksten.
