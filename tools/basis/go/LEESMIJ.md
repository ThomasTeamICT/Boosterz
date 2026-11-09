# Lezers voor het leerplan en de lesplannen van het GO!

Dit is stap 1 van de import (ontwerp: `docs/basisonderwijs/GO-LEERPLAN.md`, pakket G2). De scripts lezen docx en xlsx
naar neutrale ruwe JSON. Ze weten niets van het GO!: alle betekenis (vorm, koppeling, controles) zit in
`maak.ts` en de modules in `src/lib/basis/go/` (pakket G3).

Alleen de standaardbibliotheek van Python. Draai altijd `python3 -I` (de bestanden komen van buiten). De scripts schrijven zelf geen
`__pycache__`; alleen `unittest discover` laat er één achter van het testbestand zelf (verwijderen voor je commit).

## Regels voor elk script

- De werkmap en alle uitvoer liggen buiten de repo, in de scratchpad (bv. `.../scratchpad/go-<datum>/`). Een
  pad binnen een git-repository wordt geweigerd.
- Zip-leden met `..`, een absoluut pad of een backslash worden geweigerd; hoogstens 50 MB uitgepakt, met een
  grens op de verhouding uitgepakt/ingepakt; xml met `<!DOCTYPE` of `<!ENTITY` wordt geweigerd vóór het parsen.
- Uit `docProps/core.xml` lezen de scripts alleen de datum (`dcterms:created` bij docx, `dcterms:modified` bij
  xlsx), nooit `dc:creator` of `cp:lastModifiedBy`.
- Exit 0: gelukt. Exit 3: het bestand is onveilig of niet zoals verwacht. Exit 2: verkeerd gebruik.

## Stappen per reeks

1. **Ophalen** (de hoofdsessie, met de Drive-tools; zie "Ophalen" in het ontwerp). Alleen op id, eerst de metadata
   (`fileSize`, `modifiedTime`, `mimeType`, naam).
2. **Decoderen** van het opgeslagen tool-resultaat:

   ```bash
   python3 -I tools/basis/go/decodeer.py --werkmap <map> --drive-id <id> --bytes <fileSize> \
     --gewijzigd <modifiedTime> <toolresult.json>
   ```

   Controleert id, mimeType, titel (`LPxxxx[a-z].docx` of `Doelenset BaO <vak>.xlsx`), het aantal bytes en de zip,
   schrijft `<map>/bron/<naam>` en een regel in `<map>/manifest.json` (naam, soort, bytes, sha256, drive_id, gewijzigd).
3. **Controleren** van alle bestanden tegen het manifest (bytes en sha256):

   ```bash
   python3 -I tools/basis/go/decodeer.py --controleer <map> [--sta-onbevestigd-toe] [--aanvulling <uit.json>]
   ```

   Een bestand dat niet in het manifest staat (of zonder bytes of sha256) is "onbevestigd" en geeft exit 3, tenzij
   `--sta-onbevestigd-toe`. Zo staan de 12 xlsx van de eerste reeks er nog buiten: het manifest van de eerste reeks
   heeft alleen de 8 docx. `--aanvulling` schrijft de berekende bytes en sha256, voor de hoofdsessie om bewust over te
   nemen; dat is geen bevestiging tegen de Drive (daarvoor is `fileSize` uit `get_file_metadata` nodig).
4. **Lezen**:

   ```bash
   python3 -I tools/basis/go/lees_docx.py <LPxxxx.docx> <ruw/LPxxxx.json> [--tekst]
   python3 -I tools/basis/go/lees_xlsx.py <vak.xlsx> <ruw/<vak>.json>
   ```

   `--tekst` schrijft ook `<ruw>.txt`, een leesbare weergave voor de nakijker.
5. **Omzetten** met `maak.ts` (pakket G3). Bij exit 3 leest de hoofdsessie het rapport en kiest bewust.

## Vorm van de ruwe JSON

### docx (`lees_docx.py`)

`{bestand, gemaakt, media, stijlen, tellingen, body}`

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

`{bestand, gewijzigd, bladnamen, blad, merged, tellingen, rijen}`

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
python3 -I -m unittest discover -s tools/basis/go
GO_WERKMAP=<werkmap met docx/, xlsx/ en manifest.json> python3 -I -m unittest discover -s tools/basis/go
```

Zonder `GO_WERKMAP` worden de vier tests op de echte bestanden overgeslagen. Met `GO_WERKMAP` controleren ze de
tellingen van de eerste reeks: per lesplan het aantal alinea's, lijstalinea's, beelden en tabellen, en per doelenset
het aantal rijen per TYPE (samen 3490 doelzinnen), de runs met doorhaling, superschrift of cursief, en het manifest.
