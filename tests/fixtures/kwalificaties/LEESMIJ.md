# Fixtures van de beroepskwalificaties (fase 3, pakket K2)

Ontwerp: `docs/STUDIERICHTINGEN.md` § 23.5.12. Alles hier is **nagebootst**: geen officiële koppeling en geen
officiële competenties. De vorm volgt het uittreksel van de verkenning in `api/ruw/` (ronde 6 en 7); wat daar niet
in staat, is herkenbaar testdata (`BK-9999-…`, competentiecodes `bkc9…`, teksten "Nagebootste …"). Een tekst die in
het uittreksel ingekort was, eindigt hier op "…". De koppeling hangt aan onderdelen die al in de structuurfixtures
(`tests/fixtures/structuur/uit/studierichtingen.json`) staan; die fixtures veranderen niet.

## `api/`: de nagebootste antwoorden

- `lijst.json`: twee pagina's van de BK-lijst (`gegevens[]`, `meta.total_elements` 3, `links.next.href`).
  BK-9999 heeft als laatst erkende versie BK-9999-2, zodat BK-9999-1 een "nieuwere versie" krijgt.
- `onderdelen.json`: `{"<nummer>": <detail> | {"status": 404}, "nagebootst": "…"}` voor elk onderdeel dat op
  2026-10-10 gevraagd wordt (14), plus onderdeel 11 (afgebouwd, wordt niet gevraagd):
  - 8 (G-0008, 2de graad A, duaal): een afgelopen erkenning (BK-0390-1, alleen als verwijzing) en een geldende met
    BK-0390-2 en BK-0464-1 en vijf studiebekrachtigingen (één met `onderwijskwalificatie: true`, één DBK);
  - 565 (G-0008, aanloop): alleen BK-0464-1; de afgelopen erkenning heeft geen status of datums (die komen uit de
    matrix, T2);
  - 9, 10, 12, 931 (G-0009, BuSO A): 9 een erkenning zonder lijst, 10 BK-9999-1 en een toekomstige erkenning
    (ADV-1999, vanaf 2027-09-01) met BK-9999-2, 12 BK-9999-3, 931 een 404;
  - 247 (G-0193, DO): een lege lijst; 129, 417 (DO), 379, 908, 915 (1ste graad) en 679, 680 (7de jaar): een erkenning
    zonder veld `beroepskwalificaties`, zoals onderdeel 413 in ronde 6.
- `bks.json`: `{"BK-0390-2": <detail> | {"status": 404}, …, "nagebootst": "…"}`: BK-0390-2 (12 competenties) en
  BK-0464-1 (13) in de vorm van ronde 7, met de eerste competentie zoals in het uittreksel; BK-9999-1 met HTML in een
  tekst en een competentie zonder `nr` (de doelcodes volgen dan de plaats); BK-9999-2 deelt één competentiecode met
  BK-9999-1 (versieOverlap); BK-9999-3 geeft 404.

## `uit/`: de verwachte uitvoer

`uit/` is de uitvoer van één run in een lege map:

```bash
node tools/leerplannen/haal-beroepskwalificaties.mjs \
  --bron-lijst tests/fixtures/kwalificaties/api/lijst.json \
  --bron-onderdelen tests/fixtures/kwalificaties/api/onderdelen.json \
  --bron-bks tests/fixtures/kwalificaties/api/bks.json \
  --nu 2026-10-10T00:00:00Z --vandaag 2026-10-10 \
  --structuur tests/fixtures/structuur/uit \
  --uit tests/fixtures/kwalificaties/uit --rapport /tmp/rapport-beroepskwalificaties.json
```

Verander je `api/` of het script, maak `uit/` dan opnieuw zo (eerst de oude `uit/` weg). De scripttest
(`src/lib/beroepskwalificaties.script.test.ts`) controleert dat deze run byte voor byte `uit/` geeft. De datatest, de
app-tests en de rooktest gebruiken `uit/`.

De kennis van BK-9999-1 staat in `api/` in dezelfde volgorde als in `uit/` (anders kan een run in een lege map nooit
`uit/` geven). Dat de oude volgorde blijft als de API ze verandert (T6), test de scripttest met een omgekeerde kopie.
