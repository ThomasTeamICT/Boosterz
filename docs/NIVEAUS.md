# Niveaumodel (vaardigheidsniveaus E tot A)

Opdracht van de eigenaar (8 oktober 2026), **voor later**: nog niet aan begonnen. Dit document
bewaart de opdracht zoals ze gegeven is, zodat een volgende sessie ze kan oppakken.

## Stand van zaken

| Wat | Stand |
|---|---|
| Opdracht vastgelegd | **Klaar** (dit document). |
| 1. Bron doorlopen en gegevens inlezen | Wacht: op het startsein van de eigenaar. |
| 2. Datamodel en migratie | Wacht. |
| 3. Scherm om een schaal in te lezen of te maken | Wacht. |
| 4. Niveau koppelen aan doelen en oefeningen/vragen | Wacht. |
| 5. Afgeleid niveau in de opvolging | Wacht. |
| 6. Voorbeeldcursus basisgeletterdheid | Wacht. |
| 7. Testen en samenvatting | Wacht. |

## Doel

Een algemeen niveaumodel in Boosterz, zodat leerkrachten naar vaardigheidsniveaus kunnen toewerken
(E tot A van de Vlaamse toetsen). Eerste toepassing: een cursus basisgeletterdheid met doelen uit
meerdere vakken (sluit aan bij "Stel je eigen doelenlijst samen", `docs/LEERPLANNEN.md` § 15).

## Uitgangspunt

Boosterz heeft al leerplannen met doelcodes. Een code koppelt een cursussectie, een quizvraag en een
resultaat aan hetzelfde doel. Cursussen tonen de dekking, en leerkrachten delen materiaal via .json.
Het niveaumodel komt in die bestaande structuur, zonder iets te breken. Eerst de code lezen: hoe
doelen, secties, vragen en resultaten nu opgeslagen zijn, en het model hieronder daarop afstemmen.

## Bron doorlopen en integreren (belangrijk)

Officiële bron:
https://www.vlaanderen.be/onderwijs-en-vorming/vlaamse-toetsen/resultaten-van-de-vlaamse-toetsen/overzicht-vaardigheidsniveaus

- De pagina laadt de lijst dynamisch in (filters op toets, leerjaar, stroom, jaartal). Een gewone
  fetch geeft enkel de inleiding. Een browser gebruiken, of de onderliggende databron van de pagina
  zoeken, en alle toetsen, leerjaren en stromen doorlopen.
- Per toetsonderdeel de niveaus E tot A met hun omschrijving ophalen en laden als standaardschaal
  "Vlaamse toetsen" in het datamodel, met bron-url en jaartal/versie.
- Die gegevens gebruiken in de app-logica: bij het koppelen van niveaus aan doelen en oefeningen, bij
  het voorstellen van niveaus bij een toetsonderdeel, en bij het berekenen van het afgeleide niveau.
- Waar mogelijk de toetsonderdelen koppelen aan de minimumdoelen die Boosterz al kent (bv. de set
  basisgeletterdheid). Elke koppeling in de bron controleren. Onduidelijke koppelingen leeg laten en
  oplijsten in een overzicht voor de eigenaar.
- Het inlezen herhaalbaar maken (script of import), zodat nieuwe jaartallen later opnieuw ingelezen
  kunnen worden.
- Na afloop een overzicht: welke toetsen en onderdelen ingelezen zijn, wat ontbrak, welke koppelingen
  onzeker zijn.

## Datamodel

- **Niveauschaal**: id, naam, bron-url, versie/jaartal.
- **Onderdeel** (in een schaal): id, naam, leerjaar/stroom.
- **Niveau** (in een onderdeel): code (E…A), volgorde, omschrijving.
- **Doel**: optioneel onderdeelId.
- **Sectie, oefening en quizvraag**: optioneel niveau `{schaalId, onderdeelId, code}`.
- **Resultaat**: afgeleid niveau per leerling per onderdeel = hoogste niveau waarop de leerling
  minstens X % juist heeft (drempel instelbaar).

## Regels

- Alles is optioneel: bestaande cursussen en .json-bestanden blijven werken.
- Niveaus gelden per onderdeel. Nooit een algemeen of gemiddeld niveau over onderdelen heen tonen.
- Het afgeleide niveau is een indicatie voor de leerkracht, geen officiële toetsuitslag. Dat staat zo
  in de interface.
- Schalen zijn gegevens: inlezen, zelf maken (eigen schaal van de school) en delen via het bestaande
  .json-bestand.
- Niets verzinnen: wat niet in de bron staat, blijft leeg.
- Interface in gewoon Nederlands, zonder jargon.

## Bouwvolgorde

1. Bron doorlopen en gegevens inlezen.
2. Datamodel en migratie.
3. Scherm om een schaal in te lezen of te maken.
4. Niveau koppelen aan doelen en aan oefeningen/vragen, met de ingelezen gegevens als voorstel.
5. Afgeleid niveau tonen in de opvolging per leerling en per onderdeel.
6. Voorbeeldcursus basisgeletterdheid, als test van het hele traject.
7. Testen en kort samenvatten wat er veranderd is.

## Aandachtspunten voor de start (hoofdsessie, nog niet uitgezocht)

- **Netwerk.** Of vlaanderen.be en zijn databron bereikbaar zijn vanuit de cloudomgeving, is niet
  gekend. Afspraak 11 van de werkwijze geldt: tolerant bouwen, testen met een nagebootst antwoord, en
  de eerste echte run de vorm laten bevestigen. Lukt het inlezen niet in de cloud, dan kan het script
  lokaal of in een GitHub-workflow draaien (zoals het ophaalscript van de minimumdoelen).
- **Hergebruik van de teksten.** Nagaan onder welke voorwaarden de omschrijvingen van de niveaus
  hergebruikt mogen worden, en de bron en het jaartal bij de gegevens bewaren. De minimumdoelen staan
  al als bestanden in `public/leerplannen/`; voor de schaal ligt een gelijkaardige aanpak voor de hand.
- **Aansluiten op wat er is.** Doelscores per leerplan (`goalScoreKey`, `GoalScore.curriculumId`,
  `pending`), "voorlopig" voor wat nog nagekeken moet worden, en de dekking in `coverage.ts`. Het
  afgeleide niveau rekent best met dezelfde regels (beste poging, open vragen tellen niet mee tot ze
  nagekeken zijn).
- **Zwaar werk.** Datamodel en migratie (stap 2) horen volgens de werkwijze bij de `kernbouwer`, met
  een review en een rechter voor het online gaat. Het inlezen van de bron krijgt een nakijkronde
  tegen de bron (geen verzonnen niveaus of koppelingen).
