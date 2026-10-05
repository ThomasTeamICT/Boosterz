# Leerplannen — ontwerp voor sluitend inlezen van doelen

*Status: ontwerp (fase 2), nog niet gebouwd. Fase 1 (een echt API-antwoord en per net één echt
leerplan) moet de punten met "te bevestigen" afvinken vóór het bouwen begint.*

## Stand van zaken (bijgewerkt 5 oktober 2026)

| Wat | Stand |
|---|---|
| API-sleutel Onderwijsdoelen-API | **Bestaat.** Aangevraagd via het portaalformulier op 18 december 2025, aangemaakt op 9 januari 2026 door de Centrale cel ICT. De sleutel kwam per mail in de ICT-mailbox van de scholengroep en geldt voor alle open API's van Onderwijs & Vorming. Hij staat nergens in de repo. |
| Sleutel als GitHub-geheim `ONDERWIJSDOELEN_API_KEY` | **Gedaan** op 5 oktober 2026 (repository secret voor Actions). |
| Pakket L1 (ophaalscript, workflow, datatest) | Gebouwd en gereviewd (twee reviewers, rechter). **Eerste echte run (5 oktober 2026)**: volledig opgehaald (24019 doelen, 49 pagina's, `totalItems` klopt), maar terecht gestopt (exit 3): sets met dezelfde lange naam vielen samen. Opgelost: de setsleutel is nu `ODS_<onderwijsdoelenset_id>`, elk doel krijgt zijn `@id`, en alle API-velden gaan mee in `extra`. Run 2 en 3 toonden de rest: binnen een set is een code niet altijd uniek (§ 5, "Wat de echte gegevens leren"); een doel wordt nu herkend aan zijn `@id`. **Run 4 geslaagd**: pull request #2 met 950 sets (15 324 doelen, 15 MB), nagekeken door de hoofdsessie (datatest en build groen) en op 5 oktober 2026 samengevoegd op vraag van de eigenaar. **Laag 1 is klaar.** Elke maand haalt de taak de doelen opnieuw op en opent een pull request als er iets verandert. Volgende stap: laag 2 (doelen tonen in de app, koppeling met leerplannen en cursussen). |
| Laag 2, ronde 1 (§ 14): inleesweg, verwijzingen, hulp | **Bezig** sinds 5 oktober 2026. Basis klaar (types v2, `sha256.ts`, `doelenVingerafdruk`, `htmlNaarTekst`, geldigheid per set). Kern (`kernbouwer`) en minimumdoelen in de app (`bouwer`) volgen, daarna de inleeswizard. |
| Vraag aan het GO! (via een contactpersoon bij PBD) | Concept klaar bij de eigenaar (5 oktober 2026): een afgebakend experiment met enkele leerplannen. Nog te versturen. |
| Vragen aan het departement (§ 12) | Nog te stellen. Sinds 24 maart 2026 **alleen via het formulier van TechLoket Onderwijs**, niet meer per mail (Nieuwsbrief API K&C van AHOVOKS). |
| Vragen aan KOV, GO!, OVSG, POV (§ 12) | Teksten klaar in het aanvraagdossier (Claude Docs, "Aanvraagdossier leerplangegevens"); nog niet verstuurd. |
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
    "naamsvermelding": "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)",
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
  "Onbekend". De geldigheid staat per doel in `extra.geldigheid` (`type`, `geldig_van_dt`,
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
  minimumdoelenSets?: string[];                 // bv. ["ODS_3287"]: een leerplan raakt vaak meer sets
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

