# Vaste regels voor bouwagents (oktober 2026)

Geef elke bouwagent dit bestand mee (`docs/werkwijze/regels-bouwagents.md`). Het stond eerst alleen in de scratchpad van een sessie.

Project: Boosterz, volledig client-side (React 18, TypeScript strict, Vite, hash router, localStorage en
IndexedDB, geen server). Het ontwerp met alle details staat in `docs/STUDIERICHTINGEN.md` in de repo (lees de
paragrafen die je opdracht noemt, en § 1, § 7 en § 18.2). Vastgestelde feiten uit echte API-antwoorden:
de bevindingen in `docs/ONDERWIJS-API.md` en `docs/STUDIERICHTINGEN.md` (§ 3 en § 23.3).

## Werkplek
- Je werkt in je eigen git-worktree. Maak eerst in de root van je worktree: `ln -s /home/user/Bookwidgetzzz/node_modules node_modules`
  (staat er al een node_modules, laat die dan staan).
- Raak alleen de bestanden aan die je opdracht noemt. Andere pakketten werken tegelijk aan andere bestanden. Heb je een
  bestand buiten je lijst nodig: meld het in je verslag en wijzig het niet.
- NOOIT: `git stash`, `git checkout -- …`, `git reset`, `git commit`, `git push`, `git clean`. De hoofdsessie integreert en commit.
- NOOIT aanraken: `tools/leerplannen/haal-minimumdoelen.mjs`, `src/lib/minimumdoelen.ts` (alleen importeren),
  `public/leerplannen/minimumdoelen/**`, `computeCoverage` in `src/lib/coverage.ts`, `vite.config.ts`, de bestaande checks in
  `tests/smoke.mjs`, `src/components/curriculum/CurriculumPicker.tsx`.
- Geen echte API-sleutel en geen echte API-oproep. De Onderwijs-API is vanuit deze omgeving niet bereikbaar. Tests gebruiken
  nagebootste antwoorden (bestanden of een lokale `node:http`-server) en een herkenbare nepsleutel zoals `test-sleutel-1234`.
- Tests schrijven nooit in `public/leerplannen/` of `tools/leerplannen/rapport/`: alleen in een tijdelijke map (os.tmpdir()).
- Geen echte AI-oproep, geen echte AI-sleutel.

## Taal en ontwerp
- Alle tekst in de app en alle code-commentaar in Vlaams Nederlands, kort en zonder vakjargon. Op het scherm nooit een
  groepnummer (G-…), set-id (ODS_…) of het woord "structuuronderdeel".
- "Oefening" overal op het scherm, ook voor de leerkracht (nooit meer "widget" in een zichtbare tekst; in code mag het); verder "leerplan", "nakijken", "toewijzen", "bewaren", "uitproberen".
- Pure logica in `src/lib/` (vitest draait met environment node, zonder DOM).

## Poorten (alle groen vóór je oplevert)
```bash
npm run lint          # 0 fouten; niet meer dan 47 waarschuwingen in totaal, en geen nieuwe in jouw bestanden
npm run typecheck
npx vitest run        # alles; timingtests kunnen flakken onder last: herhaal dan alleen dat bestand
```
Pakketten met schermen ook: `npm run build` (meld de grootte van het kritieke pad) en de bestaande rooktest op een eigen poort:
```bash
node node_modules/vite/bin/vite.js preview --port <JOUW_POORT> --strictPort &
SMOKE_BASE=http://localhost:<JOUW_POORT> PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
```
Stop je previewserver met `kill <pid>` (nooit `pkill -f`).

## Verslag (je eindantwoord, in het Nederlands)
1. Wat je bouwde, per acceptatiecriterium: gehaald of niet, met het bewijs (test, functie).
2. Gewijzigde en nieuwe bestanden (volledige lijst, met het pad van je worktree).
3. Uitkomst van elke poort (aantallen tests, lintfouten/-waarschuwingen).
4. Afwijkingen van het ontwerp, met de reden, en wat je opviel buiten je opdracht (niet zelf opgelost).
