# Lezers voor het leerplan en de lesplannen van het GO!

Dit is stap 1 van de import (ontwerp: `docs/basisonderwijs/GO-LEERPLAN.md`, pakket G2). De scripts lezen docx en xlsx
naar neutrale ruwe JSON. Ze weten niets van het GO!: alle betekenis (vorm, koppeling, controles) zit in
`maak.ts` en de modules in `src/lib/basis/go/` (pakket G3).

Alleen de standaardbibliotheek van Python. Draai altijd `python3 -I -B` (de bestanden komen van buiten; `-B` schrijft geen
`__pycache__`, en `.gitignore` kent die map voor het geval je het vergeet).

## Regels voor elk script

- De werkmap en alle uitvoer liggen buiten de repo, in de scratchpad (bv. `.../scratchpad/go-<datum>/`). Een
  pad binnen een git-repository wordt geweigerd.
- Zip-leden met `..`, een absoluut pad of een backslash worden geweigerd, net als een naam die twee keer voorkomt en
  een versleuteld lid; hoogstens 50 MB uitgepakt, met een grens op de verhouding uitgepakt/ingepakt; xml met
  `<!DOCTYPE` of `<!ENTITY`, of met een nulbyte (UTF-16 zonder BOM), wordt geweigerd vóór het parsen.
- Uit `docProps/core.xml` lezen de scripts alleen de datum (`dcterms:created` bij docx, `dcterms:modified` bij
  xlsx), nooit `dc:creator` of `cp:lastModifiedBy`.
- Exit 0: gelukt. Exit 3: het bestand is onveilig of niet zoals verwacht (ook een onverwachte vorm, bv. een cel of
  rij zonder `r`, met de naam van de fout in de boodschap; nooit een traceback). Exit 2: verkeerd gebruik.
- De lezers maken de map van het uitvoerbestand zelf aan (bv. `<werkmap>/ruw/`).

## Stappen per reeks

1. **Ophalen** (de hoofdsessie, met de Drive-tools; zie "Ophalen" in het ontwerp). Alleen op id, eerst de metadata
   (`fileSize`, `modifiedTime`, `mimeType`, naam).
2. **Decoderen** van het opgeslagen tool-resultaat:

   ```bash
   python3 -I -B tools/basis/go/decodeer.py --werkmap <map> --drive-id <id> --bytes <fileSize> \
     --gewijzigd <modifiedTime> <toolresult.json>
   ```

   Controleert id, mimeType, titel (`LPxxxx[a-z].docx` of `Doelenset BaO <vak>.xlsx`), het aantal bytes en de zip,
   schrijft `<map>/bron/<naam>` en een regel in `<map>/manifest.json` (naam, soort, bytes, sha256, drive_id, gewijzigd).
3. **Controleren** van alle bestanden tegen het manifest (bytes en sha256):

   ```bash
   python3 -I -B tools/basis/go/decodeer.py --controleer <map> [--sta-onbevestigd-toe] [--aanvulling <uit.json>]
   ```

   Een bestand dat niet in het manifest staat (of zonder bytes of sha256) is "onbevestigd" en geeft exit 3, tenzij
   `--sta-onbevestigd-toe`. Zo staan de 12 xlsx van de eerste reeks er nog buiten: het manifest van de eerste reeks
   heeft alleen de 8 docx. `--aanvulling` schrijft de berekende bytes en sha256, voor de hoofdsessie om bewust over te
   nemen; dat is geen bevestiging tegen de Drive (daarvoor is `fileSize` uit `get_file_metadata` nodig).
4. **Lezen**:

   ```bash
   python3 -I -B tools/basis/go/lees_docx.py <map>/bron/LPxxxx.docx <map>/ruw/LPxxxx.json [--tekst]
   python3 -I -B tools/basis/go/lees_xlsx.py "<map>/bron/Doelenset BaO <vak>.xlsx" "<map>/ruw/Doelenset BaO <vak>.json"
   ```

   `--tekst` schrijft ook `<ruw>.txt`, een leesbare weergave voor de nakijker. Lees elk bestand in `bron/` opnieuw
   als het veranderde: de ruwe JSON draagt de bytes en sha256 van het gelezen bestand (`bron`), en `maak.ts` stopt als
   die niet bij het origineel in `bron/` passen.
5. **Omzetten** met `maak.ts` (pakket G3):

   ```bash
   npx vite-node tools/basis/go/maak.ts --werkmap <map> --uit <map buiten de repo of public/basis/go> \
     [--ingelezen JJJJ-MM-DD] [--aanvaard-wijzigingen]
   ```

   De getoonde beelden (de WebP van de mindmap 'Mijn lichaam') staan in `<map>/beelden/`; ontbreekt een beeld daar,
   dan neemt `maak.ts` het uit `--uit` (bij de echte import `public/basis/go/beelden/`) zolang het byte-gelijk is aan
   de sha256 in `bekende-afwijkingen.json`. Een andere omzetting van het beeld vraagt dus bewust een nieuwe sha256.
   Bij exit 3 leest de hoofdsessie de regels `GESTOPT`, `WIJZIGING` en `NIEUW` (en zo nodig `<map>/rapport.json`) en
   kiest bewust. Een wijziging aan iets dat al bestaat (tekst, koppeling, leeftijd, niveau, vlaggen of schakels,
   rubriek, inhoud, een lesplan) stopt tot `--aanvaard-wijzigingen`; een ontbrekende doelenset of een bestand in
   `--uit` dat de nieuwe index niet noemt, stopt ook met die vlag.

   De rooktest (`tests/basis/go.mjs` en `go-tekst.mjs`) leest de codes van de lesplannen zelf uit de gebouwde
   `public/basis/go/index.json` en eist er minstens 8. Een nieuw lesplan krijgt dus vanzelf de browsercontrole (één
   main, één h1, geen horizontaal scrollen op 390 px, bronvermelding), zonder dat je een lijst in `tests/` bijwerkt.
   Draai na het bouwen: `SMOKE_BASE=http://localhost:<poort> PW_CHROMIUM=/opt/pw-browsers/chromium node tests/basis/go-los.mjs`.

## Vorm van de ruwe JSON

### docx (`lees_docx.py`)

`{bestand, bron, gemaakt, media, stijlen, tellingen, body}`

- `bron` is `{bytes, sha256}` van het gelezen bestand.

- `body` is een lijst blokken: `{t:'p', stijl, stijlen_ruw, num, runs}`, `{t:'tbl', rijen:[{cellen:[{span, vmerge,
  vulling, blokken}]}]}` of `{t:'onbekend', tag}`.
- `stijl` is de eerste `w:pStyle` die in `styles.xml` bestaat (een kop heeft er twee: `2` en `Heading2`); `stijlen_ruw`
  bewaart ze allemaal.
- `num` is `{numId, ilvl, fmt, start}` uit `numbering.xml` (`fmt` is `bullet` of `decimal`).
- Een run is `{t:'tekst', tekst, b?, i?, u?, strike?, vertAlign?}`, `{t:'br', soort}`, `{t:'tab'}` of
  `{t:'beeld', rid, bestand, sha1, breed, hoog, naam, alt}`. De tekst staat letterlijk in `tekst`, ook een regeleinde
  in `w:t` (18 keer in de eerste reeks); runs worden hier niet samengevoegd.
- `media` heeft naam, grootte en sha1 van elk bestand in `word/media/`.
- `tellingen` telt alles wat de validator moet kunnen weigeren (`hyperlinks`, `ins`, `del`, `sdt`, `tekstvakken`,
  `velden`, `commentaar_ankers`, `tab`, `tabellen_genest`) en alle `rpr:*`-eigenschappen die voorkomen.
- De voettekst en alles buiten de body worden niet gelezen.

### xlsx (`lees_xlsx.py`)

`{bestand, bron, gewijzigd, bladnamen, blad, merged, tellingen, vreemde_cellen, verborgen_rijen, verborgen_kolommen,
opmerkingen, beelden, rijen}`

- `bron` is `{bytes, sha256}` van het gelezen bestand.
- `vreemde_cellen`: elke cel die geen gedeelde tekst, inlineStr of boolean is (een getal, een foutwaarde zoals
  `#REF!`, een formuletekst, een datum) en elke waarde met een Excel-escape (`_x000D_`), als `{r, k, soort, waarde}`
  (`k` vanaf 0, `waarde` hoogstens 40 tekens). De omzetting stopt op elk ervan: zo'n cel kwam anders letterlijk als
  tekst online. Eerste reeks: geen.
- `verborgen_rijen` (rijnummers van verborgen rijen met een waarde), `verborgen_kolommen` (`[van, tot]`, vanaf 0),
  `opmerkingen` (het aantal leden `xl/comments*.xml` en `xl/threadedComments/*`) en `beelden` (`[rij, kolom]` van elk
  anker in de drawing van het blad: beeld, vorm of grafiek; rij vanaf 1, kolom vanaf 0). De omzetting stopt op een
  verborgen rij of kolom en op een opmerking; een beeld alleen als het niet als `xlsx-beeld` in
  `bekende-afwijkingen.json` staat. Eerste reeks: alleen de vijf piepkleine ankers in wiskunde (rij 898, 1346 en 1367
  in kolom 2, rij 836 in kolom 7 en rij 846 in kolom 10).

- Alleen het eerste blad wordt gelezen; `bladnamen` toont alle bladen met hun staat, zodat de validator er één kan eisen.
- Elke rij is `{r, c, opmaak?}`; `c` zijn de cellen als platte tekst, vanaf kolom 0. Rijen zonder enige waarde ontbreken.
- `opmaak` (kolomnummer -> runs) bestaat alleen als een cel doorhaling (`strike`) of super-/subschrift (`vertAlign`)
  heeft, in een run van de gedeelde tekst of via de celstijl (`cel: true`), of een cursieve run (`i`, alleen uit een run,
  nooit via de celstijl; vet telt nergens). `c` bevat die tekst wel, zodat niets verdwijnt, maar de omzetting moet over
  doorhaling en superschrift bewust beslissen (rechtzetting van de rechter: doorgehaalde tekst is geen echte tekst);
  cursief bewaart ze zonder melding.
- `tellingen` heeft onder meer `run:strike`, `run:vertAlign` en `run:i` (eerste reeks: BU 3, NL 1, WI 13 doorgehaald;
  GE 3, WI 8 superschrift; WI 8 cursief).

## Poort

```bash
python3 -I -B -m unittest discover -s tools/basis/go
GO_WERKMAP=<werkmap> python3 -I -B -m unittest discover -s tools/basis/go
```

De eerste regel draait ook in de uitrol (`.github/workflows/deploy.yml`). Zonder `GO_WERKMAP` worden de vijf tests op
de echte bestanden overgeslagen. Met `GO_WERKMAP` (een werkmap met `bron/` zoals `decodeer.py` ze maakt, of de oudere
indeling met `docx/` en `xlsx/` met korte namen) controleren ze de tellingen van de eerste reeks: per lesplan het aantal
alinea's, lijstalinea's, beelden en tabellen, per doelenset het aantal rijen per TYPE (samen 3490 doelzinnen), de runs
met doorhaling, superschrift of cursief, de vreemde cellen, verborgen rijen, opmerkingen en beelden, en het manifest
(8 bevestigd en 12 onbevestigd, of 20 bevestigd). `maak.ts` zelf heeft een scripttest in vitest
(`src/lib/basis/go/maak.script.test.ts`).
