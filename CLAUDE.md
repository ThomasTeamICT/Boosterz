# Boosterz: afspraken voor Claude

Boosterz is een volledig client-side leerplatform: React 18 en TypeScript strict, Vite, hash router, opslag in localStorage en IndexedDB, geen server. De repository is `ThomasTeamICT/Boosterz` (tot 24 september 2026 `Bookwidgetzzz`). De app draait op https://thomasteamict.github.io/Boosterz/ en wordt uitgerold vanaf de branch `claude/bookwidgets-web-app-kvcfim`.

- Alle tekst in de app en alle rapportage aan de gebruiker in Vlaams Nederlands. Toegankelijkheid telt: labels, toetsenbord, contrast.
- Nooit API-sleutels of persoonsgegevens in de repo. De AI-functies gebruiken de eigen sleutel van de leerkracht, en de app blijft bruikbaar zonder sleutel.
- Sync tussen toestellen is nog een concept: zie `docs/KLASKANAAL.md` en `src/lib/sync/types.ts`.
- Leerplannen sluitend inlezen (minimumdoelen via de officiële API, leerplannen van de netten met een controlepoort): ontwerp én stand van zaken (wat klaar is, wat wacht) bovenaan `docs/LEERPLANNEN.md`. Lees die eerst als het over leerplannen of doelen gaat.
- De grondige debugronde van oktober 2026 (bevindingen, uitspraken, herstelpakketten): stand van zaken bovenaan `docs/DEBUGRONDE-2026-10.md`.
- API's van Onderwijs (matrix van de studierichtingen via de API Structuuronderdelen, filter op studierichting in de doelen-API, aanbod, kwalificaties): bevindingen, stand van zaken en voorstel voor de import in `docs/ONDERWIJS-API.md`.
- Studierichtingen (import van de matrix en van de doelen per richting, cursushulp per richting en jaar, dekking over cursussen heen; fase 2 gaten dichten, mijn richtingen, klas; fase 3 beroepskwalificaties per richting, alle drie klaar en live): ontwerp, bouwplan in pakketten en stand van zaken bovenaan `docs/STUDIERICHTINGEN.md`. Fase 3b (dekking op competenties overal, competenties plannen) is klaar en live sinds 14 oktober 2026: § 24 en bijlage F; het blok "Hervatten" bovenaan geeft wat nog wacht.
- **Geparkeerd op 15 oktober 2026. Begin bij het blok "Hervatten" bovenaan `docs/NIEUWE-CURSUS.md`**: wat live staat, de afgesproken lijn (eenvoudige ingang "Nieuwe cursus", daarna de AI-cursusbouwer in etappes), wat wacht en op wie, en hoe je een sessie begint. Regels voor bouwagents: `docs/werkwijze/regels-bouwagents.md`.
- Boosterz voor het basisonderwijs (een apart stuk voor kleuter en lager, met eigen vormgeving: de nieuwe minimumdoelen duidelijk per moment, later de lesfiches van het GO!, en digitale content met een digibord-deel): vraag, randvoorwaarden en stand van zaken bovenaan `docs/BASISONDERWIJS.md`. Live: de eigen ingang `#/basis` (spec en stand in `docs/basisonderwijs/INGANG.md`), het momentmodel (`docs/basisonderwijs/MOMENTMODEL.md`) en de toestelproef (`tools/prototypes/toestelproef/`). Leerplan en lesplannen van het GO! (drie lagen: minimumdoel, leerplandoel, lesplan; bron: de Drive-map van de eigenaar): ontwerp en stand in `docs/basisonderwijs/GO-LEERPLAN.md`; live sinds 9 november 2026 in `#/basis/go` (volledig leerplan en de eerste 8 lesplannen, import met `tools/basis/go/maak.ts`, foutenlijst voor het GO! in `docs/basisonderwijs/go-bronfouten.md`); doorgelicht en verbeterd op 10 november 2026; op 11 november 2026 WI.706 met 2.4.3 als voorstel en een compactere lijst van leerplandoelen; wat later komt staat in de stand van zaken. Het werkend voorbeeld (Lichtkamer, 3D-diorama's rond licht) staat los van de app in `tools/prototypes/lichtkamer/`; de weg naar de app en de proefklas (ontwerp, bouwplan LK-0 tot LK-28, vragen en stand) staat bovenaan `docs/basisonderwijs/LICHTKAMER-APP.md`.
- Niveaumodel (vaardigheidsniveaus E tot A van de Vlaamse toetsen, eerste toepassing basisgeletterdheid): opdracht voor later, nog niet begonnen. Opdracht en stand van zaken in `docs/NIVEAUS.md`; pas starten op teken van de eigenaar.

## Kwaliteitspoort

```bash
npm run lint        # 0 fouten; waarschuwingen niet bijmaken
npm run typecheck
npx vitest run
python3 -I -B -m unittest discover -s tools/basis/go   # de lezers van de GO!-import (ook in de deploy-workflow)
npm run build       # bewaakt het bundelbudget
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &   # in de cloud per beurt opnieuw starten
PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
PW_CHROMIUM=/opt/pw-browsers/chromium node tests/safari14.mjs   # nagebootste Safari 14.1
PW_CHROMIUM=/opt/pw-browsers/chromium node tests/ai/mock-studio.mjs [fout]   # AI-studio met nagebootste AI, zonder sleutel
```

De deploy-workflow draait lint, typecheck, unit tests, de Python-tests van de lezers en build. Een lintfout blokkeert de uitrol. De mappen `tests/` en `tools/` vallen buiten ESLint. Een andere poort geef je mee met `SMOKE_BASE=http://localhost:<poort>`.

- **Bundel.** Het kritieke leerlingpad is de hoofdbundel plus `vendor` (budget in `vite.config.ts`). Gebruik je een nieuw Lucide-icoon op het leerlingpad (`PlayerPage`, `JoinPage`, `OpenSharedPage`, `ui.tsx`, `registry.tsx`, `A11yMenu`), zet de naam dan in `EAGER_ICON_NAMES`, anders faalt de build. Iconen van lui geladen pagina's komen vanzelf in `widget-icons`.
- **Oudere browsers.** Boosterz werkt vanaf Safari en iPadOS 14.1 (beslissing van de eigenaar, 11 november 2026): `build.target` in `vite.config.ts` zet dat vast, en de bouwcontrole `wf-safari14-syntaxis` daar weigert syntaxis die Safari 14 niet kent in de uitgegeven bestanden. Geen lookbehind (`(?<=`, `(?<!`) in `src/`, want dan opent een heel scherm niet op iPadOS vóór 16.4 (`src/lib/geenLookbehind.test.ts`; hoe het zonder kan: `src/lib/tekenErvoor.ts`). In css: een `color-mix()` zonder `var()` krijgt eerst een gewone declaratie; met `var()` helpt dat niet (Safari 14 maakt de waarde dan leeg bij het berekenen), dus dan een terugvalregel in `@supports not (color: color-mix(in srgb, red, blue))` onderaan `global.css`, of in code kiezen met `kanColorMix` (`src/lib/color.ts`); een terugval voor `aspect-ratio` onder `@supports not (aspect-ratio: 1)`, `:focus-visible` en `:has()` niet in een selectorlijst, `:has()` alleen cosmetisch en nooit in `basis-*.css`, `overflow-wrap: break-word` vóór `anywhere`; `src/lib/safari14.test.ts` bewaakt dat. pdf.js kiest op oude toestellen een eigen worker met polyfills (`src/lib/pdfWorker.ts`, `src/lib/oudePolyfills.ts`).
- **Service worker.** `dist/sw.js` wordt bij elke build gemaakt uit `src/offline/serviceWorker.js`. Hernoem of verplaats `sw.js` niet. Uitschakelen kan alleen met een `sw.js` die zichzelf afmeldt; zie het commentaar in `src/offline/`.

## Ontwerp en taal

- Iconen, maten, kleuren en de emoji-regel staan in `docs/ontwerp/ICONEN.md`. Eén iconenset (Lucide), vaste iconen per actie in `src/components/icons.ts`, een tegel per widgetsoort met `TypeTile`. `src/lib/color.test.ts` bewaakt het contrast van de tokens in `global.css`.
- Nieuwe css per scherm in een eigen bestand in `src/styles/`, met de tokens. Nooit witte tekst op `--brand`: gebruik `--brand-fill`. Tekst in de accentkleur van een widget via `color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))`.
- Termen: "oefening" overal, ook in de schermen van de leerkracht (beslissing van de eigenaar, 15 oktober 2026, na de proefleerkrachten; "widget" alleen nog in code en bestandsnamen). Verder altijd "leerplan", "nakijken", "toewijzen", "bewaren" en "uitproberen".
- Elk scherm heeft één `main` en één `h1`, tikdoelen van 44 pixels op leerlingschermen, en werkt op 390 pixels breed zonder horizontaal te scrollen.

## Voorbeeldcursus natuurwetenschappen

- Bron: de pdf's van een leerkracht, niet in de repo. `tools/importeer-pdfs.mjs` haalt ze door de echte importpagina; `tools/build-voorbeeldcursus.py` voegt afbeeldingen, doelcodes, flitskaarten en oefeningen toe.
- Handgeschreven oefeningen staan in `tools/oefeningen/hNN.json`. Het formaat staat in `SCHEMA.md`, de controle in `valideer.py`. De `inhoudschrijver` schrijft ze, de `nakijker` kijkt ze na.

## Geheugen bijwerken

Het werkwijzeblok hieronder is ook de bron van `docs/werkwijze/installeer-werkwijze.sh`, dat de werkwijze in elke repo en elke cloudomgeving klaarzet. Pas je het blok of een agent in `.claude/agents/` aan, draai dan `node tools/maak-werkwijze-installer.mjs`. Een unittest bewaakt dat het script gelijk loopt.

<!-- werkwijze:start -->
## Werkwijze: modellen en agents

Afgesproken met de gebruiker in september 2026, aangevuld in oktober 2026. Geldt voor elk project en vervangt de eerdere afspraak om alle agents op opus te laten draaien.

**Kernregel.** Het duurste model zet je in waar een fout duur is en moeilijk te zien. Het goedkoopste zet je in waar een test of script de fout toch vangt. Schrijven en controleren doen altijd twee verschillende agents.

**Modelnamen.** `haiku`, `sonnet`, `opus` en `fable` gaan van goedkoop naar duur en van snel naar sterk. De namen wijzen altijd naar de nieuwste versie: bij een nieuwe release verandert er niets aan deze afspraken of aan de agentbestanden. Fable is het sterkste en duurste model en denkt langer per stap; zet het niet in voor regiewerk dat opus aankan.

| Taak | Agent | Model |
|---|---|---|
| Regie, ontwerp, integratie, eindcontrole en commits | de hoofdsessie | opus; fable (met /model) voor een fase die vooral moeilijk ontwerp is |
| Lesinhoud schrijven: oefeningen, uitleg, cursustekst | `inhoudschrijver` | opus |
| Lesinhoud nakijken tegen de brontekst | `nakijker` | sonnet |
| Bevindingen en twijfelgevallen beoordelen | `rechter` | opus |
| Afgebakende code met een duidelijke spec | `bouwer`, in een worktree bij parallel werk | sonnet |
| Moeilijke code: synchronisatie, versleuteling, opslag, migraties | `kernbouwer` | opus; fable voor het zwaarste ontwerp |
| Codereview vanuit één invalshoek | `reviewer` | sonnet |
| Mechanisch werk: lint, hernoemen, logs lezen, tellen | `klusjes` | haiku |
| Code doorzoeken | `Explore`, ingebouwd | standaard |
| Alles wat een script kan controleren | geen model | validator, typecheck, tests, rooktest |

**Zo werken we**

1. Kleine taken doet de hoofdsessie zelf, zonder agents: een fix, een tekstwijziging, een vraag.
2. Grote taken gaan in fasen: begrijpen, ontwerpen, bouwen, reviewen. Per fase draait één workflow of een handvol agents. Tussen de fasen beoordeelt de hoofdsessie de resultaten en rapporteert aan de gebruiker.
3. Eerst de automatische poorten. Een agent levert pas op als validator, typecheck en tests groen zijn. Een model controleert niet wat een script kan controleren.
4. Elke opdracht aan een agent staat op zichzelf: het doel, de bestanden, het schema of de spec, het validatiecommando en wat niet aangeraakt mag worden. Agents committen niet. De hoofdsessie integreert, controleert en commit.
5. Lesinhoud: de `inhoudschrijver` schrijft, de `nakijker` controleert, twijfelgevallen gaan naar de `rechter`, en de hoofdsessie past de bron aan.
6. Review: een `reviewer` per invalshoek zoekt, de `rechter` bevestigt of weerlegt. Alleen bevestigde bevindingen worden opgelost.
7. De grondige modus met veel agents is voor grote fasen: een nieuwe module, een volledige audit, een grote inhoudsronde. Niet voor kleine klussen.
8. Communicatie met de gebruiker in Vlaams Nederlands: eerst het resultaat, kort, en zonder vakjargon waar het kan.
9. Werk dat over meerdere sessies loopt, krijgt bovenaan zijn ontwerpdocument een tabel "Stand van zaken": wat klaar is, wat wacht en op wie. CLAUDE.md van het project verwijst ernaar. Zo zit het geheugen in de repo, niet in één sessie.
10. Geheimen (API-sleutels, wachtwoorden) nooit in een chat, de repo of een log. Ze gaan rechtstreeks als geheim in GitHub of in de omgeving, en de gebruiker zet ze daar zelf.
11. Een externe bron die nog niet bereikbaar of gekend is (geblokkeerd netwerk, onbekende API-vorm): tolerant bouwen, testen met een nagebootst antwoord, en de eerste echte run de vorm laten bevestigen voor iemand erop verder bouwt.
<!-- werkwijze:end -->
