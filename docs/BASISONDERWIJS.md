# Boosterz voor het basisonderwijs (vanaf november 2026)

## De vraag van de eigenaar (1 november 2026)

Een **volledig apart stuk** in Boosterz, "puur en alleen voor het lager onderwijs" (met de kleuters erbij): dezelfde soort
interface, app en functies, maar echt apart gebouwd en met een **eigen visuele vormgeving** die beter past bij dat onderwijs.
Aanleiding: de invoering van de nieuwe minimumdoelen in het basisonderwijs. Letterlijk: "Ik wil vooral eigenlijk dat de relevante
minimumdoelen er heel duidelijk in komen te staan. Zodat leerkrachten in het lager eigenlijk een goede leider [leidraad] hebben voor
het maken van eigen cursusmateriaal, eigen materiaal op basis van de te halen doelen op een logische manier."

Wat het moet doen, in de volgorde van de eigenaar:

1. **De minimumdoelen kennen en heel duidelijk tonen**: wat moet een kind kennen, in welk leerjaar of op welk moment. "Bij de
   kleuters, het einde van de kleuters, en dan verder naar het vierde en het zesde."
2. **De lesfiches van het GO!** bij die doelen, zodra ze er zijn ("vuur aan mesuur"), zodat het een mooi geheel wordt.
3. **Digitale content maken vanuit de scholengroep**, gebaseerd op de doelen en de lesfiches en gemaakt in deze applicatie. Die
   content heeft **altijd ook een digibord-deel**: diorama's, visuele vormgeving, interactieve dingen.

## Stand van zaken

| Wat | Stand | Op wie |
|---|---|---|
| De vraag vastleggen (dit document) | **Klaar** (1 november 2026) | hoofdsessie |
| Wat Boosterz nu heeft: geen enkele set van het basisonderwijs (het ophaalscript filtert op "secundair"); de app denkt in graden, stromen en studierichtingen | **Nagekeken** (1 november 2026) | hoofdsessie |
| Proefrun van de workflow met een ruimere filter (secundair plus basisonderwijs): setnamen, aantallen, indeling per moment en leergebied; de data-PR wordt niet samengevoegd | Wacht op akkoord | eigenaar |
| Beslissingen: kleuter en lager (ja), buitengewoon basisonderwijs (?), rechten op de lesfiches van het GO! | Wacht | eigenaar |
| Ontwerp fase 1 (de doelen duidelijk tonen), met schetsen; daarna fase 2 (content met een digibord-deel) | Wacht op de proefrun | hoofdsessie |

## Randvoorwaarden (uit de bestaande afspraken)

- **De officiële doelen** komen uit de Onderwijsdoelen-API, letterlijk en met hun bron, maandelijks bijgewerkt via de bestaande
  workflow (`.github/workflows/minimumdoelen.yml`, `tools/leerplannen/haal-minimumdoelen.mjs`). Niets verzinnen; de eerste echte
  run bevestigt de vorm (werkwijze, regel 11).
- **De lesfiches van het GO!** zijn inhoud van het net. De app en de repo zijn openbaar (GitHub Pages). Zonder uitdrukkelijke
  toestemming van het GO! komen lesfiches dus niet in de repo; dan laadt een school of leerkracht ze zelf in op het eigen toestel,
  zoals de leerplannen van de netten (`docs/LEERPLANNEN.md`, § 4 en § 13). Eerst de rechten vragen.
- **AI blijft optioneel**, met de eigen sleutel van de leerkracht of de school; alles werkt ook zonder.
- **Bouwstenen die er al zijn:** 38 soorten oefeningen (o.a. whiteboard, hotspot, tijdlijn, mindmap, memory, quiz met veel
  vraagtypes), cursussen met secties en blokken, delen met een klas, de dekking op doelen, en de lessen uit de proefleerkrachten
  (`docs/NIEUWE-CURSUS.md`): de leerkracht kiest in haar eigen woorden, de app vertaalt naar de doelen.
- **Kosten:** werk in fasen, met één beslissing van de eigenaar tussen elke fase (de vorige ronde was duur door veel agents en
  lange rooktests).

## Fasen (voorstel)

0. **Begrijpen (goedkoop):** de proefrun voor de echte vorm van de doelen basisonderwijs; nagaan hoe de officiële bron ze indeelt
   (per moment: einde kleuter, en verder in het lager; per leergebied); welke onderdelen van de app herbruikbaar zijn.
1. **De doelen duidelijk:** het aparte stuk met een eigen ingang en vormgeving, en een doelenoverzicht per moment en leergebied
   ("wat moet een kind kennen tegen het einde van het 4de leerjaar?"), met zoeken in gewone woorden.
2. **Materiaal maken op basis van de doelen:** een cursus of les per doel of doelengroep, altijd met een digibord-deel
   (presenteren op het grote scherm, visuele en interactieve onderdelen), en de dekking per moment.
3. **De lesfiches van het GO!**, zodra ze er zijn en de rechten geregeld zijn.
