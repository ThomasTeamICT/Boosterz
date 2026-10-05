# Boosterz: afspraken voor Claude

Boosterz is een volledig client-side leerplatform: React 18 en TypeScript strict, Vite, hash router, opslag in localStorage en IndexedDB, geen server. De repository is `ThomasTeamICT/Boosterz` (tot 24 september 2026 `Bookwidgetzzz`). De app draait op https://thomasteamict.github.io/Boosterz/ en wordt uitgerold vanaf de branch `claude/bookwidgets-web-app-kvcfim`.

- Alle tekst in de app en alle rapportage aan de gebruiker in Vlaams Nederlands. Toegankelijkheid telt: labels, toetsenbord, contrast.
- Nooit API-sleutels of persoonsgegevens in de repo. De AI-functies gebruiken de eigen sleutel van de leerkracht, en de app blijft bruikbaar zonder sleutel.
- Sync tussen toestellen is nog een concept: zie `docs/KLASKANAAL.md` en `src/lib/sync/types.ts`.
- Leerplannen sluitend inlezen (minimumdoelen via de officiële API, leerplannen van de netten met een controlepoort): ontwerp én stand van zaken (wat klaar is, wat wacht) bovenaan `docs/LEERPLANNEN.md`. Lees die eerst als het over leerplannen of doelen gaat.

## Kwaliteitspoort

```bash
npm run lint        # 0 fouten; waarschuwingen niet bijmaken
npm run typecheck
npx vitest run
npm run build       # bewaakt het bundelbudget
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &   # in de cloud per beurt opnieuw starten
PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
PW_CHROMIUM=/opt/pw-browsers/chromium node tests/ai/mock-studio.mjs [fout]   # AI-studio met nagebootste AI, zonder sleutel
```

De deploy-workflow draait lint, typecheck, unit tests en build. Een lintfout blokkeert de uitrol. De mappen `tests/` en `tools/` vallen buiten ESLint. Een andere poort geef je mee met `SMOKE_BASE=http://localhost:<poort>`.

- **Bundel.** Het kritieke leerlingpad is de hoofdbundel plus `vendor` (budget in `vite.config.ts`). Gebruik je een nieuw Lucide-icoon op het leerlingpad (`PlayerPage`, `JoinPage`, `OpenSharedPage`, `ui.tsx`, `registry.tsx`, `A11yMenu`), zet de naam dan in `EAGER_ICON_NAMES`, anders faalt de build. Iconen van lui geladen pagina's komen vanzelf in `widget-icons`.
- **Service worker.** `dist/sw.js` wordt bij elke build gemaakt uit `src/offline/serviceWorker.js`. Hernoem of verplaats `sw.js` niet. Uitschakelen kan alleen met een `sw.js` die zichzelf afmeldt; zie het commentaar in `src/offline/`.

## Ontwerp en taal

- Iconen, maten, kleuren en de emoji-regel staan in `docs/ontwerp/ICONEN.md`. Eén iconenset (Lucide), vaste iconen per actie in `src/components/icons.ts`, een tegel per widgetsoort met `TypeTile`. `src/lib/color.test.ts` bewaakt het contrast van de tokens in `global.css`.
- Nieuwe css per scherm in een eigen bestand in `src/styles/`, met de tokens. Nooit witte tekst op `--brand`: gebruik `--brand-fill`. Tekst in de accentkleur van een widget via `color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))`.
- Termen: "widget" in de leerkrachtschil (met als uitleg "oefening, spel of hulpmiddel"), "oefening" op leerlingschermen, nooit "widget". Verder altijd "leerplan", "nakijken", "toewijzen", "bewaren" en "uitproberen".
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
