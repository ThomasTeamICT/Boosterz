# API's van Onderwijs en Vorming: wat zit erin

Verkenning van oktober 2026, op vraag van de eigenaar: kunnen we de geldende matrix van alle
studierichtingen van het secundair onderwijs als data ophalen, en wat geven de API's van Onderwijs
verder? Aanvulling op `docs/LEERPLANNEN.md` (de minimumdoelen komen al uit de Onderwijsdoelen-API).

## Stand van zaken

| Wat | Stand |
|---|---|
| Verkenning met de sleutel (drie runs van `verken-onderwijs-api.yml`, 9 oktober 2026) | **Klaar.** |
| Matrix van de studierichtingen als data | **In de repo** sinds de eerste echte run (PR #6, 9 oktober 2026), via de API Structuuronderdelen (§ 2). |
| Herhaalbare import van de matrix in Boosterz (script, workflow, datatest, zoals de minimumdoelen) | **Klaar en live** (10 oktober 2026): de matrix (545 groepen) en de doelen per richting staan in `public/leerplannen/structuur/` en worden maandelijks bijgewerkt via de workflow "Leerplangegevens bijwerken" (met een pull request). Ontwerp en stand van zaken: `docs/STUDIERICHTINGEN.md`. |
| Koppeling studierichting → doelen | **Uitgezocht** (runs 4 en 5): de filter op naam mengt graden en breekt op een komma; de filter `structuuronderdeel_groep_nummer` werkt per graad. Zie § 3. Bouw: `docs/STUDIERICHTINGEN.md`. |
| Beroepskwalificaties bij richtingen met arbeidsmarktfinaliteit (O11 van STUDIERICHTINGEN.md) | **Gevonden** (ronde 6, run 38044584119, 10 oktober 2026): via het detail per structuuronderdeel, en de competenties via het detail per BK-versie (§ 4). Volgende: ronde 7 (curriculumdossier, volledige vorm van een BK), daarna een ontwerp voor de import. |
| Aanbod per school (welke school welke richting inricht) | Later: de API's zijn bereikbaar (§ 4), het juiste adres voor het ingerichte aanbod is nog niet gevonden. |

## 1. Toegang

- Eén sleutel voor de publieke API's van het API-portaal (https://onderwijs-api-portaal.vlaanderen.be/).
  Boosterz gebruikt het geheim `ONDERWIJSDOELEN_API_KEY` in GitHub; de sleutel komt nooit in de repo,
  een chat of een log.
- Kop `x-api-key`, host `onderwijs.api.vlaanderen.be`. Er is ook een acceptatieomgeving
  (`onderwijs-acceptatie.api.vlaanderen.be`), die we niet gebruiken.
- De cloudomgeving van Claude kan de API niet bereiken; GitHub Actions wel. Daarom draait alles in een
  workflow.

## 2. Matrix: API Structuuronderdelen (Kwalificaties en Curriculum)

`GET /kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeelgroep`: 545 groepen in 28
pagina's van 20 (volgende pagina via `links.next.href`, aantallen in `meta`). Een groep is één
studierichting zoals ze in de matrix staat; ze bevat één of meer structuuronderdelen (bv. dezelfde
richting in drie studiedomeinen, of een duale variant), elk met een eigen nummer.

- **Groep:** `structuuronderdeel_groep_nummer` (G-0001), `titel`, `graad`, `finaliteit` (DO doorstroom,
  DU dubbele finaliteit, A arbeidsmarkt), `onderwijsniveau`, `soort_leerjaar`, `opleidingsvorm` (BuSO),
  `type_7de_leerjaar`.
- **Structuuronderdeel:** `structuuronderdeel_nummer`, `titel`, `onderwijsvorm` (ASO, TSO, KSO, BSO),
  `studiedomein`, `stem_classificatie`, `niche`, `duaal`, `aanloop`, `discipline`, `begindatum`,
  `einddatum`, `studierichting_nummer_oud`, `leerjaren`, `hoofdstructuren`, `onderwijsstelsels`,
  `instellingstypes`, `structuuronderdeel_details` (ADV-nummer, versie, status zoals ERKEND, met data),
  `voorbereidende_` en `vervolg_structuuronderdelen`, `historiek_structuuronderdelen` (vorige en
  volgende), `api_url` naar `/structuuronderdeel/{nummer}`.
- Detail per nummer: `/structuuronderdeel/{nummer}` werkt. De lijst `/structuuronderdeel` zonder
  nummer geeft 404.

Eerste ophaling (9 oktober 2026): 961 structuuronderdelen, waarvan 833 vandaag geldig.

| Deel | Aantal |
|---|---|
| Gewoon voltijds secundair onderwijs (de matrix) | 244 |
| Duale varianten in de 2de en 3de graad | 107 |
| Aanloopjaren duaal leren | 88 |
| Zevende leerjaren | 237 |
| Buitengewoon secundair onderwijs | 157 |
| Afgebouwd (met einddatum) | 128 |

De 244 per graad: 1ste graad 22 (eerste leerjaar A en B, basisopties), 2de graad 81 (DO 24, DU 33,
A 24), 3de graad 139 (DO 35, DU 53, A 51), en 2 zonder graad (OKAN, basisverpleegkunde).

## 3. Doelen: Onderwijsdoelen-API

- `GET /onderwijsdoelen/onderwijsdoel?paginanr=&rijen_per_pagina=`: 24019 doelen, Hydra/JSON-LD.
  Velden per doel: `code`, `omschrijving`, `attitude`, `optioneel`, `voetnoot`, `memorie`,
  `onderwijsdoel_type`, `geldigheid`, `onderwijsdoelenset` (met `onderwijsstructuur`: niveau, soort,
  graad, stroom, opleidingsvorm; en `vlaamse_sleutelcompetentie`).
- **Filter `structuuronderdeel_groep_nummer=<G-nummer>` werkt per richting en per graad** (run 5, 9 oktober
  2026): G-0117 (Humane wetenschappen, 2de graad) geeft 796 doelen in 86 sets, G-0327 (3de graad) 862. Het
  antwoord bevat ook de sets van het buitengewoon secundair onderwijs (opleidingsvorm 4) en oude versies. De
  basisvorming komt als volledige set, cesuurdoelen en specifieke eindtermen als deel van een set. Groepen van
  de 1ste graad geven 404: daar koppelt de bron per stroom, niet per richting.
- De filter `studierichting=<naam>` werkt ook, maar mengt de graden (Humane wetenschappen: 1658 = beide
  graden), is hoofdlettergevoelig en breekt op een komma in de naam. Niet gebruiken.
- Andere werkende filters: `geldig=Geldig`, `versie=2.1`, `leerjaar=3de leerjaar`, `onderwijsdoel_type=Eindtermen`,
  `onderwijsniveau=Secundair onderwijs`. Genegeerd (alle 24019 doelen): `so_graad`, `stroom`, `so_gr2_finaliteit`,
  `so_gr3_finaliteit`, `onderwijssoort`, `structuuronderdeel`, `onderwijsstructuur`. De volledige lijst met
  parameternamen komt uit de webapp onderwijsdoelen.be (run 4).
- `/onderwijsdoelen/filters/{naam}` antwoordt voor elke naam hetzelfde (`totalItems: 1`); niet bruikbaar.
- Ook: `/onderwijsdoelen/uitgangspunten/{id}` en `/onderwijsdoel/xls` (Excel-export).

## 4. Andere API's met dezelfde sleutel

- **Onderwijsaanbod SO** `/instellingsgegevens/onderwijsaanbod_so/v2/administratievegroep`: 3021
  administratieve groepen (één leerjaar van een richting), met code, graad, leerjaar, onderwijsvorm,
  `administratievegroep_ingericht`, `schooljaar` en de koppeling `structuuronderdeel_nummer`. De
  parameter `schooljaar` verandert niets aan het aantal.
- **Instellingen** `/instellingsgegevens/instelling/v2/instelling`: lijst van scholen.
- **Beroepskwalificaties** `/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie`:
  604, met versies en synoniemen. Lijst: `gegevens[]` met `beroepskwalificatie_nr`, `laatst_erkende_versie`
  (`versie_nr_lang`, `titel`, data) en `versies[]` (titel, definitie, status, `vks_niveau`, domeinen); totaal in
  `meta.total_elements`. **Het detail werkt alleen met het versienummer** (`…/beroepskwalificatie/BK-0454-1`; met
  `BK-0454` komt 404 "Er werd geen data gevonden."). Het detail geeft `beroepskwalificatie` met titel, status,
  `vks_niveau`, definitie, domeinen en **`competenties[]`** (`competentie_type`, `nr`, `competentie_code` zoals
  `bkc0039200`, `waarde` = de tekst, `kennis[]`, `vaardigheden[]`, `referenties[]`), plus omgevings- en
  handelingscontext, autonomie en verantwoordelijkheid (ronde 6, 10 oktober 2026). Filters op de lijst
  (`structuuronderdeel_nummer`, `adv`, `sector`, …) worden genegeerd.
- **Koppeling studierichting → beroepskwalificatie** (ronde 6): het detail
  `/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeel/{nummer}` heeft per erkenning
  (`structuuronderdeel_details[]`, met `structuuronderdeel_detail_nummer` = het ADV-nummer) een lijst
  `beroepskwalificaties[]` (`beroepskwalificatie_nr`, `versie_nr_kort`, `versie_nr_lang`, `titel`, `api_url`) en
  `studiebekrachtigingen[]` (met `onderwijskwalificatie` waar/onwaar, `uitgebreide_naam`, een `beroepskwalificatie`
  of een `deelkwalificatie` zoals `BK-0130-5-DBK-01`), en een adres `curriculumdossier`
  (`…/structuuronderdeel_detail/ADV-0842/curriculumdossier`). Voorbeelden: onderdeel 504 (Onthaal en recreatie,
  3de graad A) → BK-0390-2 Onthaalmedewerker en BK-0464-1 Recreatief medewerker; onderdeel 1 (Afwerking bouw
  duaal) → drie BK's en drie deelkwalificaties. De lijst van de groepen (`structuuronderdeelgroep`, wat de import
  nu ophaalt) bevat die velden **niet**: daarvoor is het detail per onderdeel nodig. Het omgekeerde (in een BK
  naar de onderdelen zoeken) bestaat niet. Adressen voor onderwijskwalificaties en opleidingsprofielen geven 404.
- **Opleidingstrajecten** `/kwalificaties-en-curriculum/trajecten/v1/opleidingstraject`: 682 (in een
  steekproef van 141: duaal leren, BuSO OV3 en volwassenenonderwijs), detail per id.
- **App Opleidingsinhouden** `/app-opleidingsinhouden/v1/secundair-onderwijs/opleidingsinhoud/{ADV-nummer}`
  (beschrijving, doorstroomprofiel, curriculumdossier): onze sleutel krijgt 401.

Niet bereikbaar vanuit GitHub Actions: data-onderwijs.vlaanderen.be (exports aanbod-so), het portaal
zelf, de omzendbrief SO 37. Het oude apigee-portaal geeft 404.

## 5. De verkenning opnieuw draaien

Workflow `Verkenning Onderwijs-API's` (`.github/workflows/verken-onderwijs-api.yml`), met de hand te
starten. Stand `matrix` (standaard) zet één regel per studierichting in het logboek (`RICHTING|{…}`),
plus de filters en de aantallen van het aanbod; stand `volledig` doet de brede verkenning met verslag;
stand `kwalificaties` (ronde 6, hoogstens 60 oproepen) zoekt hoe een studierichting aan beroepskwalificaties
(`BK-…`) en onderwijskwalificaties vastzit en zet de bevindingen in het logboek (`KWAL|{…}`, afgesloten met
`KWAL-SAMENVATTING|{…}`, ook in `tools/verkenning/rapport/kwalificaties.json`). Stand `dossier` (ronde 7, hoogstens 30 oproepen) kijkt bij drie erkenningen (finaliteit A, DU en DO) wat het curriculumdossier is (json, pdf, html of 404, een pdf wordt niet bewaard of gelogd, ook niet als ze met een regeleinde of een verkeerd type binnenkomt) en of het naar onderwijsdoelen of beroepskwalificaties verwijst (hoogstens één eigen API-pad uit de dossiers wordt gevolgd, alleen onder `kwalificaties-en-curriculum`, `onderwijsdoelen`, `instellingsgegevens` of `app-opleidingsinhouden` en zonder `.` of `..`), en haalt twee beroepskwalificaties volledig op met de vorm van hun competenties en van de studiebekrachtigingen (logboek `DOSSIER|{…}`, afgesloten met `DOSSIER-SAMENVATTING|{…}`, ook in `tools/verkenning/rapport/dossier.json`; de veldnamen staan daar op aparte regels in plaats van ingekort). Een logboekregel is hoogstens
8 KB: past hij niet, dan krimpt het script eerst `proef`, dan `velden`, `itemVelden` en `relevant`, en zet
`"ingekort": true`; het rapportbestand houdt de volledige regels. Bij elke lijst staat in `idVeld` welk veld van
het eerste element als id gekozen is (eigen velden gaan vóór geneste). Een filter krijgt `werkt` of `genegeerd`
alleen als het totaal of de lijst (lengte en eerste element) echt te vergelijken is, anders `onbekend` (met een
`reden`, en in de samenvatting onder `onbekend`). Het script gebruikt de sleutel getrimd en waarschuwt (zonder de
waarde) als het geheim witruimte of stuurtekens heeft; de sleutel verdwijnt uit alle uitvoer, ook getrimd en per regel.
Script: `tools/verkenning/verken-onderwijs-api.mjs`.

Les uit ronde 2: de scripts van de webapps van de overheid bevatten hun eigen publieke sleutels. Het
script verbergt sindsdien alle sleutels en sleutelvormige reeksen; de run met die sleutels in het logboek
is gewist.

## 6. Voorstel voor de import (vervangen door `docs/STUDIERICHTINGEN.md`)

Zoals de minimumdoelen (`tools/leerplannen/haal-minimumdoelen.mjs`, `minimumdoelen.yml`):

1. Een ophaalscript schrijft de groepen en structuuronderdelen naar
   `public/leerplannen/structuur/so-studierichtingen.json`, met bron, ophaaldatum en de velden uit § 2.
   Afgebouwde richtingen blijven erin, met hun einddatum en opvolger.
2. Een datatest controleert vorm en aantallen; de workflow opent een pull request bij verschillen.
3. In de app: bij een studierichting de doelen tonen via de filter `studierichting` (naam eerst
   controleren tegen de doelen-API), en in "Stel je eigen doelenlijst samen" de matrix als ingang.
