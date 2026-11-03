# Eigen ingang basisonderwijs (bouwstap 3): spec

Ontworpen op 2 november 2026: drie verkenners (app en code, de doelen als inhoud, vormgeving en gebruikers), drie ontwerpen (mijn klas eerst, leerlijn eerst, later materiaal eerst), een rechter die koos en samenvoegde, en een criticus die narekende. Stand van zaken: `docs/BASISONDERWIJS.md`.

## Beslissingen (gaan voor op de spec hieronder)

Volgorde van voorrang: (1) de antwoorden van de eigenaar, (2) de beslissingen van de hoofdsessie, (3) de rest van de spec.

**Antwoorden van de eigenaar (3 november 2026)**

- **E1. Vormgeving "Lamplicht" met Fredoka** voor de koppen: inktblauw met lampgeel, in de stijl van de Lichtkamer. Fredoka (OFL) staat zelf gehost in de repo, wordt alleen in dit deel geladen, nooit van een CDN.
- **E2. Mag nu al online, met "waarschijnlijk" erbij.** Wat zeker is, staat bovenaan; naast elke status staat de zekerheid met uitleg. Zodra de officiële tabel nagelezen is, verandert alleen `src/lib/basis/kalender.ts`.
- **E3. Zoekwoorden:** eerst een eigen lijst (inhoudschrijver schrijft, nakijker controleert, rechter bij twijfel). Later vullen de proefleerkracht en een maker van de scholengroep elk 10 tot 15 woorden aan.

**Beslissingen van de hoofdsessie (op de punten van de criticus)**

- **H1. "Leerjaar", niet "klas", in code en adressen**: `#/basis/leerjaar/:soort/:leerjaar`, `LeerjaarScherm`, `leerjaarOverzicht.ts`, de kiezer `LeerjaarKiezer`. In de navigatie: "Mijn leerjaar". "Klas" blijft vrij voor de echte klas met kinderen (bouwstap 4). De vragen op het scherm blijven gewone taal ("Wat geldt voor je 3de leerjaar?", "Welk leerjaar geef je?").
- **H2. De volledige doeltekst overal.** Geen enkel scherm laat een deel van een officieel doel weg. Op de doelpagina en de vakpagina staat de uitbreiding open. In de leerlijn en de zoekresultaten mag ze ingeklapt staan in een `<details>` naast (niet in) de link, met als knoptekst "Toon de opsomming (n punten)" bij een lijst en "Toon de toelichting" anders. Staat een zoektreffer alleen in de uitbreiding of de woordenschat, dan staat die open met het woord in `<mark>`.
- **H3. Zoeken rangschikt.** Elk doel krijgt een score (welke zoekwoorden en synoniemen erin staan, in de doelzin, de uitbreiding, de woordenschat of de rubriek). Doelen met alle woorden staan eerst. Zijn dat er minder dan 5, dan volgt "Ook met een deel van je woorden:". Acceptatie: "schaduw", "schaduw onderzoeken", "schaduw maken" en "licht en schaduw" geven 92767 in de top 3 voor einde 4de leerjaar. Een vraag zonder zoekwoord (alleen stopwoorden) geeft een hulpzin; een vraag die alleen een moment noemt, geeft een link naar dat moment. "lager" is alleen een moment in "lager onderwijs" of als enig woord.
- **H4. Tests op de echte gegevens volgen het patroon van `momentmodel.echt.test.ts`.** Verbanden altijd; exacte aantallen en lijsten van id's alleen achter de momentopname-wacht; voorbeeld-html als tekst in het testbestand. Alle `src/lib/basis/*.echt.test.ts` slaan over met `GEGEVENSRUN=1` en draaien in de bestaande stap van de maandelijkse ophaling met `continue-on-error` en rapport (`src/lib/minimumdoelenWorkflow.test.ts` aanpassen). Drempels voor de zoekkwaliteit horen niet in de uitrolpoort: die staan in een meetscript.
- **H5. Geen lege kopjes.** "Mag al" en "Oude doelen die dit schooljaar nog gelden" staan er alleen als de lijst niet leeg is. Is alles verplicht: "Alle vakken zijn dit schooljaar verplicht." Unittests met schooljaar 2026, 2027, 2029 en 2031; de rooktest heeft een tweede klok.
- **H6. Wat het model al zegt, staat ook op de leerjaarpagina**: de unieke opmerkingen van de invoering onder de inleiding (bv. bij het 4de leerjaar in 2026 de zin over het getuigschrift), de zin dat het leerplan van het net de tussenstappen vastlegt, en bij het buitengewoon de opmerking dat het de kalender van het gewoon onderwijs volgt.
- **H7. De bronvermelding komt uit de index** (naamsvermelding en ophaaldatum, zoals op de pagina Officiële minimumdoelen), in de voet en op de doelpagina, met een link naar "Privacy en opslag".
- **H8. De keuze gewoon of buitengewoon** kan op elk scherm gewijzigd worden (leerjaar, moment, vak, leerlijn, zoeken). Zonder bewaarde keuze is het "gewoon", met de schakelaar zichtbaar.
- **H9. Vaste adressen per vak**: een vaste tabel van vaknummer (1 tot 10) naar slug in de code, met een test die de tien slugs vastlegt, niet afgeleid uit de kalender of de API.
- **H10. Geen koppeling van oude op nieuwe vakken**, ook niet in de zoekwoorden: geen "wo" of "wereldoriëntatie" naar vak 3, 4 en 5. Alle lijsten (synoniemen, vakwoorden, stopwoorden) gaan door inhoudschrijver, nakijker en rechter.
- **H11. Geen zin die het model niet staaft.** Weg: "Tot dan gelden voor deze vakken nog de oude eindtermen/ontwikkelingsdoelen" en de zin over Frans bij L1 tot L4. Wel: "Tot dan mogen de oude doelen nog. Welke oude doelen nog gelden, staat hieronder." (alleen als die lijst er is).
- **H12. [F], [I] en [I/F]** blijven letterlijk in de tekst, zonder `abbr` of uitleg in fase 1 (de betekenis is nog niet nagelezen).
- **H13. De css-regel** (elke selector begint met `:root[data-deel='basis']` of `.b-`) geldt alleen voor de nieuwe bestanden; `basis-moment.css` valt erbuiten.
- **H14. Het bundelbudget** mag stijgen met wat de luie route `/basis/*` kost (gemeten, hoogstens 1 kB), met een commentaar in `vite.config.ts`. Niets van `src/lib/basis/` of `src/pages/basis/` komt in de hoofdbundel.
- **H15. De rooktest van het basisdeel** is een eigen module met een eigen uitvoerder, kort (doel: onder een minuut), en hangt niet aan de lange `tests/smoke.mjs`.
- **H16. Documentatie, CLAUDE.md en commits** zijn voor de hoofdsessie. Agents committen niet.

## Keuze van de rechter

Basis: ontwerp 1, "Mijn klas eerst". Het brengt de vier gebruikers het snelst bij hun antwoord. De klasleerkracht heeft één tik nodig en bij een volgend bezoek geen. Op de schermafbeelding schets-klas/shots/2-mijnklas-L3-390.png staan de kop "Dit schooljaar verplicht" en de drie vakkaarten al in het eerste beeld.

**Uit ontwerp 3 neem ik over:**
- de doelpagina #/basis/doel/<set>/<id> als vaste plek. Die url is precies een MinimumdoelRef {set, id} (src/lib/curriculumTypes.ts:75-82), met een geordende lijst DOEL_DELEN waaraan latere fasen een regel toevoegen;
- de zoekmechaniek. In mijn kruismeting geeft die de beste verhouding tussen gevonden doelen en ruis;
- de kleinere omvang voor het buitengewoon onderwijs: geen typekeuze en geen lijst met oude sets per type in fase 1;
- de sleutelnaam wf.basis.keuze.v1;
- de optionele props van WanneerGelden.

**Uit ontwerp 2 neem ik over:**
- zoektreffers gegroepeerd per leerlijnrij (vak › onderwerp);
- de rubriek alleen als heel woord;
- de markering "je klas werkt hiernaartoe" in de leerlijn;
- de rooktest als losse module met een eigen uitvoerder.

**Afgewezen:**
- het zoeken op het laatste deel van een samenstelling (ontwerp 1): meer ruis, zie de redenen;
- een klaskiezer die op 390 px het hele eerste beeld vult (ontwerp 2);
- ingekorte doelteksten in de leerlijn. De schets van ontwerp 1 laat "De leerlingen kennen" weg, en dat mag niet: officiële teksten blijven letterlijk;
- de lijst met oude sets per type in het buitengewoon (ontwerp 1). Het momentmodel vraagt eerst een keuze per type (MOMENTMODEL.md:664).

**Eén rechtzetting geldt voor alle drie.** De oude doelen die dit schooljaar nog gelden, staan bij elk ontwerp ingeklapt. Voor het 4de tot 6de leerjaar zijn dat in 2026-2027 net de sets die gelden: bij het 5de leerjaar zijn 0 nieuwe sets verplicht en gelden nog 10 oude. In deze spec staat die lijst open in beeld.

### Redenen

- **De vier gebruikers (criterium 1).** Ik heb de schermafbeeldingen zelf bekeken.
- Ontwerp 1 (schets-klas/shots/2-mijnklas-L3-390.png): na één tik staan de h1, de zin over het eindmoment, het zoekveld en de drie verplichte vakkaarten in het eerste beeld van 390 px. Dat is zeker.
- Ontwerp 2 (leerlijn/shots/basis-390-light.png): de klaskiezer vult het eerste beeld. Het antwoord begint pas onderaan.
- Ontwerp 3 (doel-eerst/shots/doel-390-licht.png): de sterkste doelpagina. De tweeling en 'verplicht in het 1ste, 2de en 3de leerjaar' staan in de eerste schermhoogte.
- De '30 seconden' is geteld in tikken. Er is niet getest met leerkrachten (waarschijnlijk).
- **De gegevens zelf nagerekend** met setsDieGelden (ongewijzigd), via het script (scratchpad van de ontwerpsessie, niet bewaard) basis-ingang/rechter/klas.ts. Uitvoer in klas.uit.txt. Zeker.
- **bao L3, 2026**: werkt naar L4. Verplicht: 3 sets, 238 doelen (ODS_3395 72, ODS_3406 122, ODS_3408 44), waarschijnlijk. Mag al: 6 sets, 130 doelen, vanaf 2027. Geldt nog: 7 oude sets, 185 doelen.
- **bao K2**: verplicht NL 42 (ODS_3397 35 na te streven + ODS_3401 7 populatie), WI 59 (ODS_3404 + ODS_3405) en W&T 21, allemaal zeker. Mag al: MV en LO zeker; AK, GE en ATT waarschijnlijk. Oud: ODS_2102, ODS_2103 en ODS_2107.
- **bao L5**: verplicht 0, geldt nog 10 oude sets (331 doelen), mag al 10 sets (422 doelen).
- **bubao L3**: alles 'onzeker'. 22 oude sets, en ODS_2959 als lege set.
- **Invariant**: elk vak heeft één status en één verplichtVanaf, en het eindmoment is WERKT_NAAR. Over 2 soorten × 9 leerjaren × 2025-2031 = 126 klassen: 0 afwijkingen (invariant.ts).
- **Leerlijn zelf nagerekend** op de ruwe setbestanden (leerlijn.ts, uitvoer in leerlijn.uit.txt). Zeker.
- Gewoon en buitengewoon geven allebei 998 unieke id's, 48 combinaties vak.onderwerp met 0 naamconflicten, 124 rijen (onderwerp × subthema), 322 cellen, 29 lege cellen en een grootste cel van 15.
- Alleen het kleuter-NL en het kleuter-WI van het gewoon onderwijs hebben twee sets. Gesorteerd op code blijven de subthema's in 27 van 27 groepen aaneengesloten.
- **De rechtzetting bij 'oude doelen'.** Alle drie de ontwerpen zetten de oude sets die nog gelden in een ingeklapt blok. Bij ontwerp 1 L5 zie je dat op schets-klas/shots/9-mijnklas-L5-1366.png, met '(10 sets)' dicht. Voor L4, L5 en L6 zijn dat dit schooljaar de sets die gelden: bij L5 zijn er 0 nieuwe verplicht. Daarom staan ze in deze spec open, als lijst, met de zin dat de bron oud en nieuw niet koppelt.
- **Vormgeving (criterium 3).** Ik rekende het contrast zelf na met contrastRatio en oklchToHex uit src/lib/color.ts. Ik legde de globale tokens eronder zoals de cascade doet (contrast.ts, uitvoer in contrast.uit.txt).
- Ontwerp 1 en 3: 0 controles onder hun minimum, op 116 per ontwerp (58 per thema).
- Ontwerp 2 laat --accent globaal staan. #ff6a2a op wit geeft 2,86:1.
- Ontwerp 1 heeft de volledigste set: met color-scheme en de tegeltokens.
- Vakkleuren: het icoon op de tegel minstens 5,69 (licht) en 8,16 (donker), de vaknaam op de tegel minstens 13,72 en 11,00 (vak.ts).
- **Leerlingpad en bundel (criterium 4).** De bouwproeven heb ik gelezen in de logs, niet opnieuw gedraaid:
- vertrekpunt 334,5 kB;
- alleen de route: 334,7 kB;
- met de padlezer en het echte gebruik van de lib: 334,8 tot 334,9 kB;
- met <Routes>/<Route>: 336,0 kB.
Bronnen: bouwproef/build-*.log, doel-eerst/build-*.log en leerlijn/bouwproef/build-match.log. Een padlezer zonder <Routes> is dus nodig. Het budget gaat bewust ±0,3 kB omhoog.
- **Zoeken.** Ik heb de drie prototypes zonder woordentabel (alleen de mechaniek) laten lopen op elkaars vooraf vastgelegde toetsvragen (kruis-zoek.ts, uitvoer in kruis-zoek.uit.txt). Zeker voor de cijfers.

Recall in deze volgorde: de huidige zoekfunctie, ontwerp 1, ontwerp 2, ontwerp 3. Daarna de precisie van ontwerp 1 tegenover die van ontwerp 3.
- Goud van ontwerp 1: recall 0,63 / 0,79 / 0,76 / 0,78; precisie 0,84 tegenover 0,94.
- Goud van ontwerp 2: recall 0,34 / 0,54 / 0,49 / 0,49.
- Goud van ontwerp 3: recall 0,49 / 0,65 / 0,65 / 0,70.

Het zoeken in samenstellingen van ontwerp 1 geeft ruis: 'tellen' 39 treffers tegenover 12, 'persoonsvorm' 49 tegenover 4.

Geen enkel algoritme vindt bij 'schaduw' doel 92767 zonder woordentabel. Met één regel (schaduw → lichtbron, lichtrichting, belichting, =licht) staat 92767 als eerste bij einde 4de (schaduw.ts).
- **Veilig tonen van de doeltekst.** Ik draaide het prototype van ontwerp 1 op alle 998 doelen (doeltekst-check.ts):
- 0 overgebleven tags;
- alleen 93407 houdt '<' of '>', en terecht;
- 0 keer U+200B;
- 14 doelen met geneste lijsten, 55 breuken, 3 beelden, 6 links, 159 voorbeelden, 18 toelichtingen en 152 labels [F]/[I].
Het probleem bestaat echt: htmlNaarTekst laat bij 93177 letterlijk '<math><mfrac>…' staan (html.ts).
- **Later aanhaken (criterium 6).** De doelpagina van ontwerp 3 sleutelt op set en id, precies zoals de bestaande MinimumdoelRef. Fase 2 (materiaal, via de bestaande refs in leerplannen), fase 3 (lesplannen per doel-id), bouwstap 4 (bewijs per doel-id) en bouwstap 5 (pakketmanifest met id-lijsten) voegen elk een deel toe aan DOEL_DELEN, zonder herbouw.
- **Klein en testbaar (criterium 5).** De logica zit in zuivere modules naast moment.ts, dat onaangeroerd blijft. moment.test.ts bewaakt wat moment.ts importeert.
- Er komt één route in App.tsx.
- Er is één opslagsleutel.
- De rooktest is een losse module van 12 checks.
- De toetsvragen voor het zoeken heb ik bevroren als id-lijsten: 66 vragen, sha256 4671c4c7…, in (scratchpad van de ontwerpsessie, niet bewaard) basis-ingang/rechter/zoektoets.json. Zonder woordentabel geeft de mechaniek van ontwerp 3 daarop recall 0,62 en P@3 0,82, tegenover 0,45 en 0,73 nu.
- **Weerlegd of rechtgezet in de ontwerpen:**
- 'veiligeLink' (ontwerp 3) bestaat niet: het is webUrl in src/lib/veiligeUrl.ts.
- leesVraag van ontwerp 3 herkent 'W&T' niet: het kijkt maar naar twee woorden en 'w en t' zijn er drie.
- De link 'Bekijk de doelen per moment' in de kiezer van ontwerp 1 is maar 20 px hoog (schets-klas/proef.uit.txt).
- '112 van 112' bij ontwerp 2 klopt alleen voor zijn eigen lijst paren; --accent haalt het niet.
- In de repo is niets gewijzigd: git status heeft 0 regels.

## Kern

Een apart deel van Boosterz voor kleuter en lager, met een eigen kop en een eigen vormgeving ('Lamplicht'), maar dezelfde onderdelen, iconen en themawissel. Het gebruikt geen leerkrachtschil.

**Wat een leerkracht doet.**
1. Ze kiest één keer gewoon of buitengewoon onderwijs en haar leerjaar (K1 tot L6). Die keuze wordt per toestel onthouden.
2. Ze krijgt meteen het antwoord op 'Wat geldt voor je 3de leerjaar?':
   - **zeker**: naar welk eindmoment de klas werkt en hoeveel doelen in welke vakken;
   - **met de zekerheid erbij**: welke vakken dit schooljaar verplicht zijn, welke al mogen, en welke oude doelen nog gelden (open in beeld).

**Vier wegen voor de makers van de scholengroep:**
- doelen per moment en per vak, met de rubrieken;
- de leerlijn van een vak over einde kleuter, einde 4de en einde 6de;
- een vaste doelpagina per doel (set + doelnummer);
- zoeken in gewone woorden, zonder AI.

**Techniek.**
- Één lui geladen route '/basis/*' met een eigen padlezer.
- De tokens staan op html[data-deel='basis'].
- Zuivere modules naast het onaangeroerde momentmodel.
- Één opslagsleutel (wf.basis.keuze.v1).
- Officiële doelteksten blijven overal letterlijk. Nergens wordt een koppeling oud-nieuw of doel-doel over momenten heen beweerd.

## Routes

### `#/basis`: Start (keuze of doorsturen)

**Met een bewaarde keuze**: navigate(basisPad({s:'klas', soort, leerjaar}), {replace: true}).

**Zonder keuze**:
- h1 'Welke klas heb je?';
- KlasKiezer: Gewoon of Buitengewoon (aria-pressed), en 9 leerjaarknoppen van minstens 48 px in drie fieldsets met legend: 'Kleuterklassen · werken naar het einde van de kleuterklas', '1ste tot 4de leerjaar · werken naar het einde van het 4de leerjaar' en '5de en 6de leerjaar · werken naar het einde van het 6de leerjaar';
- een zoekveld;
- drie momenttegels: Einde kleuter 208, Einde 4de leerjaar 368 en Einde 6de leerjaar 422. De aantallen komen uit de index;
- de tegelknop 'Leerlijnen per vak'.

Alle tegels en knoppen zijn minstens 44 px. Een tik op een leerjaar bewaart de keuze en opent #/basis/klas/<soort>/<leerjaar>.

### `#/basis/kies`: Kies je klas

h1 'Kies je klas', met dezelfde kiezer. De bewaarde klas heeft aria-current='true'. Daaronder 'Vergeet mijn klas' (alleen als er een keuze is): wisKeuze() en terug naar #/basis.

### `#/basis/klas/:soort/:leerjaar  (soort gewoon|buitengewoon; leerjaar K1..K3|L1..L6, hoofdletters maken niet uit)`: Wat geldt voor je klas

Van boven naar onder:

1. **KlasBalk** ('Mijn klas: 3de leerjaar · gewoon onderwijs' met 'Andere klas'). Is dit niet de bewaarde klas: 'Klas: …' met 'Onthoud als mijn klas'.

2. **h1** 'Wat geldt voor je 3de leerjaar?', via leerjarenTekst([lj]).

3. **Lead (zeker)**: 'Je klas werkt naar de doelen van het einde van het 4de leerjaar: 368 doelen in 9 vakken.' Bij het buitengewoon komt erbij: 'In het buitengewoon basisonderwijs zijn het dezelfde doelen, telkens na te streven.' Daaronder 'Schooljaar 2026-2027', uit schooljaarVanDatum(new Date()).

4. **Zoekveld** binnen het eindmoment van de klas.

5. **h2 'Dit schooljaar verplicht'**: VakKaarten met lampstreep, het aantal doelen en de soort. Bij twee soorten: '42 doelen: 7 te bereiken (populatie) · 35 na te streven'. Een ZekerheidBadge per kaart als die niet zeker is.
   Is de lijst leeg: h2 'Dit schooljaar zijn nog geen nieuwe doelen verplicht' en de zin 'Voor je klas gelden dit schooljaar nog de oude <eindtermen|ontwikkelingsdoelen> (hieronder).'

6. **h2 'Mag al'**: kaarten met 'verplicht vanaf <schooljaarTekst>' en een badge. Daarbij de zin 'Tot dan gelden voor deze vakken nog de oude eindtermen' (bij K: ontwikkelingsdoelen, uit SOORT_DOELEN_LABEL).

7. **Noot zonderNieuweSet**: bij K 'ICT en Frans hebben geen doelen voor de kleuterklas', bij L1 tot L4 'Frans heeft alleen doelen voor het einde van het 6de leerjaar'.

8. **h2 'Oude doelen die dit schooljaar nog gelden'**:
   - Gewoon: OPEN in beeld. Een lijst met naam, aantal, label (SOORT_DOELEN_LABEL) en een link naar /leerplannen/minimumdoelen/<id>, plus de zin 'De officiële gegevens koppelen de oude en de nieuwe doelen niet aan elkaar.'
   - Buitengewoon: geen lijst, wel de zin 'Daarnaast gelden in het buitengewoon onderwijs nog de oude ontwikkelingsdoelen van je type of van het basisaanbod. Die vind je bij Officiële minimumdoelen, met de soort Buitengewoon basisonderwijs.' en een link.

9. **details 'Hoe zeker is dit?'**: zekerheidUitleg en samengesteldTekst().

Alleen de index wordt geladen.

### `#/basis/moment/:soort/:eind  (eind einde-kleuter|einde-4de|einde-6de)`: Doelen per moment

- h1 'Doelen voor het einde van het 4de leerjaar'. Bij K3: 'het einde van de kleuterklas'.
- De zin '<leerjarenTekst> werken hiernaartoe'.
- Een momentschakelaar en een soortschakelaar (pillen met aria-current).
- VakKaarten zonder status, met aantal en soort uit vakkenOpMoment.
- De noot zonderNieuweSet.
Alleen de index wordt geladen.

### `#/basis/vak/:soort/:eind/:vak[?klas=L3][&onderwerp=3.5]  (vak nederlands|wiskunde|wetenschap-en-techniek|aardrijkskunde|geschiedenis|muzische-vorming|lichamelijke-opvoeding|ict|attitudes|frans)`: Een vak op een moment, per rubriek

Laadt de 1 of 2 sets van setsVoorVak en voegt ze samen op code.

**Kop.**
- Kruimelpad: met klas 'Mijn klas: 3de leerjaar › Wetenschap en techniek', zonder klas 'Doelen › Einde 4de leerjaar › …'.
- h1 met de vaknaam en de vaktegel.
- De onderregel 'Doelen voor het einde van het 4de leerjaar · 44 doelen · te bereiken (populatie)'.
- Met klas de statusregel 'Voor je 3de leerjaar: verplicht in 2026-2027' (invoering(info, klas, schooljaar)) met een badge.

**Inhoud.**
- RubriekenLijst: knoppen per onderwerp met het aantal, die scrollen en de focus zetten.
- Per onderwerp een h2, per subthema een h3, met een ol van DoelKaarten.
- Links 'Leerlijn van dit vak' en 'Officiële set'.

?onderwerp scrollt erheen. Een klas die niet bij het eindmoment past, wordt genegeerd.

### `#/basis/leerlijn/:soort[?klas=L3]`: Leerlijnen

h1 'Leerlijnen', een uitlegzin en 10 vaktegels naar #/basis/leerlijn/<soort>/<vak>.

### `#/basis/leerlijn/:soort/:vak[?klas=L3][&onderwerp=3.5]`: Leerlijn van een vak

Laadt de sets van het vak op elk moment (2 tot 4).

**Kop.** h1 'Leerlijn wetenschap en techniek' en de zin 'Per onderwerp staan de doelen van de drie momenten naast elkaar. De codes lopen niet door, en de bron zegt niet welk doel uit welk ander volgt.'

**Per onderwerp een LeerlijnTabel:**
- caption met nr en naam;
- kolommen Einde kleuter, Einde 4de leerjaar en Einde 6de leerjaar;
- rijen per subthema;
- in elke cel DoelRij's met de code en de letterlijke doelzin, met '+ opsomming (n punten)' als er een uitbreiding is.

**Lege cellen.** Een lege cel: 'Op dit moment niet apart vermeld'. Een vak zonder set op een moment: 'Geen doelen voor dit moment'.

**Je klas.** De kolom van de klas heeft --lamp-soft en '(je klas)'.

**Op 760 px of smaller** wordt elke rij een kaart. Het moment van de klas staat open, de andere zijn details met hun aantal.

### `#/basis/doel/:setId/:doelId`: Doelpagina: de vaste plek

**Doelkaart** met lampstreep:
- de rubriekregel en h1 'Minimumdoel 3.5.4' met de onderregel 'einde 4de leerjaar';
- DoeltekstWeergave (1,35rem);
- de richtinggevende woordenschat als die er is;
- badges: de soort (doelInfo(doel, set)) en het soort onderwijs;
- de regel 'Ook in het buitengewoon basisonderwijs: hetzelfde doel (nummer en tekst), daar na te streven', met de link naar #/basis/doel/<tweeling>/<id>. Vanuit het buitengewoon geldt het omgekeerde. Bij twee kandidaten (buitengewoon K3 NL of WI) worden beide sets geladen en wordt de set gekozen die het id bevat;
- de voet 'Nummer 92767 · set ODS_3408 · Alle doelen van dit vak · Officiële set'.

**DOEL_DELEN** (section met h2):
1. 'wanneer': WanneerGelden met kopNiveau 2, kopId 'b-wanneer-kop' en toonTweeling false;
2. 'leerlijn': de doelen in dezelfde rubriek op elk moment (zelfdeRubriek), met het eigen doel als 'dit doel' en aria-current, plus de link naar de leerlijn met ?onderwerp.

Hoogstens 6 sets, allemaal van één vak.

**Niet gevonden** (onbekende set of id niet in de set):
- h1 'Dit doel vonden we niet';
- de zin 'Doel 92767 staat niet in set ODS_…. Misschien kreeg de set een nieuw nummer.';
- links naar #/basis/zoek?q=92767&bereik=alles en naar 'Mijn klas'.

### `#/basis/zoek?q=…&soort=gewoon|buitengewoon&klas=L3&bereik=klas|alles`: Zoeken in de doelen

**Standaarden.** De soort komt uit de url, dan uit de keuze, anders gewoon. Bereik is 'klas' als er een klas is, anders 'alles'.

**Laden.** Met bereik klas de nieuwe sets van het eindmoment (8 tot 10), met bereik alles alle nieuwe sets van de soort (29 of 27). Met de status 'De doelen worden geladen (n sets)'.

**Kop.**
- h1 'Zoeken in de doelen', ZoekVeld (role=search) en een statusregel (role=status) met het aantal;
- chips met de herkende filters;
- de knop 'Zoek in alle vakken en momenten';
- 'Ook gezocht op: …' als de woordentabel meedeed;
- de melding bij een versoepelde zoekopdracht.

**Treffers** per leerlijnrij: een h2 'Wetenschap en techniek › Natuurkundige verschijnselen (n)' met DoelRij's en <mark>.

**Bijzondere vragen.**
- Alleen een vakwoord: links naar dat vak per moment.
- Een doelnummer: dat doel.
- Een code: die code op elk moment.
- 0 treffers: tips en vaktegels.

### `#/basis/<al de rest>`: Onbekende pagina in het basisdeel

Eigen melding in de basisschil, met één h1 'Deze pagina bestaat niet in het deel basisonderwijs' en links naar 'Mijn klas' en 'Zoeken'. Nooit JoinPage.

## Vormgeving

**Richting 'Lamplicht'.** Inktblauw met lampgeel als enige accent: de taal van de goedgekeurde Lichtkamer (lichtkamer.html:7-29), in de tokennamen van de app.

**Waar.** In src/styles/basis.css, op html, niet op een wrapper. Zo kleuren portals mee (ui.tsx:25 en :98), en ook --boost. BasisDeel zet dataset.deel = 'basis' in een useLayoutEffect en haalt het weg bij het opruimen.

**Licht blok** `:root[data-deel='basis']`, buiten @media screen:
- --font-display: 'Fredoka', 'Outfit', 'Segoe UI', system-ui, sans-serif;
- --radius-s 10px; --radius-m 16px; --radius-l 24px;
- --brand #2b5bd0; --brand-strong #2149b0; --brand-soft #e3ebff; --brand-fill #2b5bd0; --brand-fill-strong #2149b0;
- --accent #a14a00; --accent-soft #fff3cf; --accent-fill #a14a00;
- --lamp #ffc53d; --lamp-soft #fff3cf; --on-lamp #16203a;
- --ok #17784a; --ok-soft #ddf3e6; --ok-text #135f3b;
- --warn #8a5300; --warn-soft #fff0d4; --warn-text #7a4800;
- --err #b02a1f; --err-soft #fde4e1; --err-text #9c2219;
- --ok-strong #17784a; --err-strong #b02a1f;
- --tile-l 0.95; --tile-c 0.045; --icon-l 0.47; --icon-c 0.16;
- --bg #eef2fa; --bg-raised #ffffff; --bg-sunken #e3e9f5;
- --text #16203a; --text-soft #4f5b76; --text-faint #5a6580;
- --line #d5dcec; --line-strong #7d89a6;
- color-scheme light.

**Donker blok** binnen @media screen, `:root[data-deel='basis'][data-theme='dark']`, met exact dezelfde sleutels (font en radii herhaald):
- --brand #8fb0ff; --brand-strong #a9c2ff; --brand-soft #1e2c52; --brand-fill #2f5fd6; --brand-fill-strong #2550c0;
- --accent #ffcf5c; --accent-soft #3a3016; --accent-fill #a14a00;
- --lamp #ffcf5c; --lamp-soft #3a3016; --on-lamp #16203a;
- --ok #71d6a3; --ok-soft #12301f; --ok-text #71d6a3;
- --warn #ffc46b; --warn-soft #3a2c0a; --warn-text #ffc46b;
- --err #ff9a8f; --err-soft #3d1513; --err-text #ff9a8f;
- --ok-strong #17784a; --err-strong #b02a1f;
- --tile-l 0.31; --tile-c 0.07; --icon-l 0.85; --icon-c 0.12;
- --bg #0d1322; --bg-raised #161f35; --bg-sunken #0a0f1c;
- --text #e9eefb; --text-soft #aab4cc; --text-faint #98a3bd;
- --line #2b3757; --line-strong #6b7898;
- color-scheme dark.

**Waarom alles herhaald wordt.** theme.ts zet altijd data-theme light of dark op html, ook bij 'automatisch' (theme.ts:5-10). Het lichte basisblok (0,2,0) wint van het globale donkere blok (0,1,0), dus het donkere basisblok moet elke sleutel opnieuw zetten.

**Contrast, zelf nagerekend** met color.ts en de globale tokens eronder (rechter/contrast.ts, vak.ts). 116 controles, 0 onder het minimum. Waarden (licht | donker):
- tekst op bg 14,38 | 15,96;
- zachte tekst op bg 6,06 | 8,92;
- vage tekst op het verzonken vlak 4,78 | 7,57;
- link (--brand) op bg 5,33 | 8,67, en op een kaart 5,98 | 7,66;
- wit op --brand-fill 5,98 | 5,63; wit op --accent-fill 6,01;
- --on-lamp op --lamp 10,22 | 11,01;
- tekst op --lamp-soft 14,57 | 11,20;
- badge 'waarschijnlijk' 6,78 | 8,65;
- ok, warn en err op bg 4,90, 5,64 en 5,85 | 10,46, 11,79 en 9,06;
- rand van een invoerveld 3,50 | 3,72;
- gekozen pil (var(--text) als vlak, var(--bg-raised) als tekst) 16,13 | 14,11.

Verboden en door een test bewaakt:
- --lamp als tekst (1,58 op wit);
- wit op --brand in donker (2,14).

**Vakkleuren.** De formule van de oefentegels (global.css:157-164), met de tinten NL 25, WI 255, W&T 150, AK 195, GE 65, MV 330, LO 110, ICT 285, ATT 0 en FR 225. Icoon op tegel minstens 5,69 | 8,16, tekst op tegel minstens 13,72 | 11,00.

Lucide-iconen staan in src/components/basis/vakIconen.ts, niet in icons.ts (dat A11yMenu op het leerlingpad importeert): BookOpen, Calculator, FlaskConical, Earth, Landmark, Palette, PersonStanding, Monitor, HeartHandshake en Languages. Merk: Lamp. Alle aanwezig in lucide-react 1.48.0.

**Typografie.**
- Koppen in Fredoka 600. Het bestand komt uit (scratchpad van de ontwerpsessie, niet bewaard) basis-ingang/fonts/s_fredoka_v17_X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWu89U.woff2 (29.732 B) en gaat naar src/assets/fonts/fredoka-latin.woff2.
- @font-face alleen in basis.css: font-weight 300 700; swap; dezelfde unicode-range als outfit-latin.
- Tekst in Atkinson.
- `:root[data-deel='basis'] body { font-size: 16px }`.
- h1 clamp(1.55rem, 1.2rem + 1.4vw, 2.1rem).

**Vormen.**
- Afrondingen 10, 16 en 24 px en pilvormige keuzes.
- Een gekozen pil heeft een inktvulling en een ring van 3 px in --lamp.
- De lampstreep (6 px --lamp links) op verplichte vakkaarten, de doelkaart en 'dit doel'.
- Een witte kop met een rand van 4 px in --lamp eronder.
- De inhoud is hoogstens 1240 px breed.
- Geen verloop, geen mascotte, geen emoji.

**Regels voor de css.** Elke selector in basis*.css begint met `:root[data-deel='basis']` of met `.b-`. Alles wat je kan aantikken is minstens 44 px; alleen links in lopende tekst mogen lager.

**Anders en toch dezelfde app.** Anders: geen paarse topbar of violet verloop, Fredoka in plaats van Outfit, een blauwgrijze achtergrond en lampgeel. Hetzelfde: de tokennamen (dus .btn, .badge, LaadStatus en WanneerGelden kleuren mee), Lucide, de themawissel (cycleTheme), Atkinson, één main en één h1, en 'Naar Boosterz'.

## Functies

### `basisRoute / basisPad / doelPad`

```ts
src/lib/basis/basisRoutes.ts:

```ts
export type BasisScherm =
  | {s:'start'}
  | {s:'kies'}
  | {s:'klas'; soort:SoortBasis; leerjaar:LeerjaarBasis}
  | {s:'moment'; soort:SoortBasis; eind:Eindmoment}
  | {s:'vak'; soort:SoortBasis; eind:Eindmoment; vak:number; klas?:LeerjaarBasis; onderwerp?:string}
  | {s:'leerlijnen'; soort:SoortBasis; klas?:LeerjaarBasis}
  | {s:'leerlijn'; soort:SoortBasis; vak:number; klas?:LeerjaarBasis; onderwerp?:string}
  | {s:'doel'; setId:string; doelId:string}
  | {s:'zoek'; soort:SoortBasis; vraag:string; klas?:LeerjaarBasis; bereik:'klas'|'alles'}
  | {s:'onbekend'};
export function basisRoute(splat: string, zoek: string): BasisScherm;
export function basisPad(s: BasisScherm): string;
export function doelPad(ref: {set: string; id: string}): string;
export const SOORT_SLUG: Record<SoortBasis, 'gewoon'|'buitengewoon'>;
export const EIND_SLUG: Record<Eindmoment, 'einde-kleuter'|'einde-4de'|'einde-6de'>;
export function vakSlug(nr: number): string|undefined;
export function vakVanSlug(slug: string): number|undefined;
```
```

Een zuivere padlezer voor useParams()['*'] en location.search. Er komt geen <Routes>/<Route> in het basisdeel: dat kost +1,5 kB op het leerlingpad (gemeten).

**Slugs.**
- Vakken: INVOERINGSKALENDER.vakken[].sleutel met spaties als '-'.
- Set-id: /^ODS_\d+$/.
- Doel-id: /^\d+$/.
- Leerjaar: hoofdletters maken niet uit.

**Wat wegvalt.**
- ?klas valt weg als het geen geldig leerjaar is, of bij 'vak' als WERKT_NAAR[klas] niet het eindmoment is.
- ?onderwerp moet /^\d{1,2}\.\d{1,2}$/ zijn.
- Al de rest geeft {s:'onbekend'}. De functie gooit nooit een fout.

**De rondgang.** basisRoute van basisPad(x) geeft opnieuw x. Elke link in het deel komt uit basisPad of doelPad.

### `klasOverzicht`

```ts
src/lib/basis/klasOverzicht.ts:

```ts
export interface VakRegel {
  vak: KalenderVak; status: 'verplicht'|'mag'; sets: Geldend[]; aantal: number;
  perSoort: {soort: SoortDoelen; aantal: number}[]; zekerheid: Zekerheid; verplichtVanaf?: Schooljaar;
}
export interface KlasOverzicht {
  soort: SoortBasis; leerjaar: LeerjaarBasis; schooljaar: Schooljaar; eindmoment: Eindmoment;
  verplicht: VakRegel[]; magAl: VakRegel[]; zonderNieuweSet: KalenderVak[];
  oud: Geldend[]; leeg: MinimumdoelenIndexSet[]; zekerheid: Zekerheid;
  aantalDoelen: number; aantalVakken: number;
}
export function klasOverzicht(
  alle: readonly MinimumdoelenIndexSet[],
  klas: {soort: SoortBasis; leerjaar: LeerjaarBasis},
  schooljaar: Schooljaar,
  k?: Invoeringskalender,
): KlasOverzicht;
```
```

Een laag op setsDieGelden (moment.ts:450, onveranderd).

**Per vak.**
- Groepeert verplicht en magAl per info.vak.nr, in vakvolgorde.
- aantal = de som van set.aantal.
- perSoort komt uit info.soortDoelen per set, in de volgorde populatie, individueel, nastreven.
- zekerheid = laagsteZekerheid over de sets.

**Verder.**
- zonderNieuweSet: de vakken van INVOERINGSKALENDER zonder nieuwe set van die soort op dat eindmoment, berekend uit de index. Dat geeft: K3 ICT en Frans, L4 Frans, L6 geen.
- oud = g.geldtNog.
- aantalDoelen en aantalVakken tellen alleen de nieuwe sets.

Er wordt geen koppeling oud-nieuw gemaakt.

### `doelenVanSet / codeVergelijk / samenvoegen / rubrieken`

```ts
src/lib/basis/doelBasis.ts:

```ts
export interface DoelBasis {
  setId: string; id: string; code: string; soort: SoortBasis; eind: Eindmoment;
  vak: number; onderwerpNr: string; onderwerp: string; subthema?: string;
  soortDoel?: SoortDoelen; doelzinHtml: string; uitbreidingHtml?: string; woordenschatHtml?: string;
}
export function doelenVanSet(bestand: MinimumdoelenSetBestand, info: BasisSet): DoelBasis[];
export function codeVergelijk(a: string, b: string): number;
export function samenvoegen(lijsten: readonly (readonly DoelBasis[])[]): DoelBasis[];
export interface Onderwerp {
  nr: string; naam: string; aantal: number;
  subthemas: {naam?: string; doelen: DoelBasis[]}[];
}
export function rubrieken(doelen: readonly DoelBasis[]): Onderwerp[];
```
```

**doelenVanSet.** Alleen voor een nieuwe set met eindmoment; anders [].
- Eindigt de tekst op `\n${extra.uitbreiding_op_doelzin.trim()}` (zo voegt laadSet de uitbreiding toe, minimumdoelen.ts:695-706), dan wordt dat achtervoegsel de uitbreidingHtml en de rest de doelzinHtml. Anders is doelzinHtml de hele tekst.
- onderwerp en subthema komen uit rubriekenVan(doel)[0] en [1] (minimumdoelenLeerplan.ts:48).
- onderwerpNr = de eerste twee getallen van de code.
- soortDoel = doelInfo(doel, info).soortDoel.

**codeVergelijk.** Numeriek per deel.

**samenvoegen.** Sorteert stabiel op code.

**rubrieken.** Behoudt de volgorde. Een groep zonder subthema krijgt geen h3.

### `leerlijnVanVak / voegVolgordeSamen / zelfdeRubriek`

```ts
src/lib/basis/doelBasis.ts:

```ts
export interface LeerlijnOnderwerp {
  nr: string; naam: string; aantal: Record<Eindmoment, number>;
  rijen: {subthema?: string; cellen: Record<Eindmoment, DoelBasis[]>}[];
}
export function leerlijnVanVak(doelen: readonly DoelBasis[]): LeerlijnOnderwerp[];
export function voegVolgordeSamen(lijsten: readonly (readonly string[])[]): string[];
export function zelfdeRubriek(doel: DoelBasis, vakDoelen: readonly DoelBasis[]):
  {niveau: 'subthema'|'onderwerp'; per: Record<Eindmoment, DoelBasis[]>};
```
```

**leerlijnVanVak.**
- Onderwerpen gesorteerd op onderwerpNr, numeriek.
- Subthema's in de samengevoegde volgorde van K3, L4 en L6; elke invoerlijst blijft een deelrij.
- Cellen op code gesorteerd.
- Er staan geen pijlen in.
- Nagerekend: 124 rijen, 322 cellen, 29 leeg, grootste cel 15, 48 onderwerpen, 0 naamconflicten, voor gewoon en buitengewoon.

**zelfdeRubriek.** Geeft hetzelfde vak, onderwerpNr en subthema op elk moment. Ontbreekt het subthema op een moment, dan valt het daar terug op het hele onderwerp (niveau 'onderwerp'). Voor 3.5: kleuter 5, 4de 7, 6de 7.

### `vakkenOpMoment / setsVoorVak / setsVanVak`

```ts
src/lib/basis/doelBasis.ts:

```ts
export function vakkenOpMoment(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis, eind: Eindmoment):
  {vak: KalenderVak; sets: MinimumdoelenIndexSet[]; aantal: number; perSoort: {soort: SoortDoelen; aantal: number}[]}[];
export function setsVoorVak(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis, eind: Eindmoment, vak: number):
  MinimumdoelenIndexSet[];
export function setsVanVak(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis, vak: number):
  Partial<Record<Eindmoment, MinimumdoelenIndexSet[]>>;
```
```

Alleen de index, en alleen nieuwe, niet-lege basissets (basisSet).

Twee sets per cel komen alleen voor bij gewoon K3 NL (ODS_3397 + ODS_3401) en gewoon K3 WI (ODS_3404 + ODS_3405).

### `doeltekstBlokken / blokkenAlsTekst`

```ts
src/lib/basis/doeltekst.ts:

```ts
export type Inline =
  | {t:'tekst'; s:string}
  | {t:'sterk'|'nadruk'; kids:Inline[]}
  | {t:'breuk'; teller:string; noemer:string}
  | {t:'wiskunde'; s:string}
  | {t:'link'; s:string; href?:string}
  | {t:'beeld'; alt:string}
  | {t:'voorbeeld'|'toelichting'; kids:Inline[]}
  | {t:'kennis'; s:'F'|'I'|'I/F'}
  | {t:'regel'};
export type Blok =
  | {t:'alinea'; kids:Inline[]}
  | {t:'lijst'; geordend:boolean; items:Blok[][]};
export function doeltekstBlokken(html: string): Blok[];
export function blokkenAlsTekst(b: readonly Blok[]): string;
```
```

Neem het prototype over: (scratchpad van de ontwerpsessie, niet bewaard) basis-ingang/ontwerp-klas/doeltekst.proto.ts. Het is een tagscanner zonder DOM, voor de 12 tags uit de bron: p, ul, li, br, strong, em, a, img, math, mfrac, mi, mn.

**Wat het doet.**
- Ontcijfert entiteiten en haalt U+200B en U+00AD weg.
- '< bv. … >' wordt voorbeeld, andere '< … >' met letters wordt toelichting.
- [F], [I] en [I/F] worden kennis.
- Een onbekende tag wordt tekst.
- href alleen via webUrl (src/lib/veiligeUrl.ts:27), en alleen als het adres met https: begint.
- img wordt alleen zijn alt-tekst.

**Nagerekend op 998 doelen**: 0 tags, alleen 93407 houdt < of >, 14 genest, 55 breuken, 3 beelden, 6 links, 159 voorbeelden, 18 toelichtingen en 152 kennislabels.

htmlNaarTekst blijft ongewijzigd.

### `leesVraag / zoekDoelen / zoekDoelVan / normaal / varianten`

```ts
src/lib/basis/zoekBasis.ts:

```ts
export interface Zoekwoorden {
  stop: readonly string[];
  vak: Readonly<Record<string, readonly number[]>>;
  ook: Readonly<Record<string, readonly string[]>>;
}
export interface ZoekDoel {
  id: string; code: string; setId: string; eind: Eindmoment; vak: number;
  onderwerpNr: string; onderwerp: string; subthema?: string;
  doelzin: string; uitbreiding?: string; woordenschat?: string;
}
export interface Term { eigen: string; alts: string[]; tabel: string[] }
export interface Vraag {
  termen: Term[]; vakken?: number[]; eind?: Eindmoment[];
  filters: string[]; id?: string; code?: string;
}
export interface Treffer { doel: ZoekDoel; score: number; termen: number; viaTabel: string[] }
export interface Groep { sleutel: string; vak: number; onderwerp: string; treffers: Treffer[] }
export interface Uitslag {
  vraag: Vraag; treffers: Treffer[]; groepen: Groep[]; versoepeld: boolean; alleenVak: boolean;
}
export function normaal(t: string): string;
export function varianten(t: string): string[];
export function leesVraag(q: string, w: Zoekwoorden): Vraag;
export function zoekDoelen(doelen: readonly ZoekDoel[], vraag: Vraag, opties?: {eigenEind?: Eindmoment}): Uitslag;
export function zoekDoelVan(d: DoelBasis): ZoekDoel;
```
```

Neem het prototype over ((scratchpad van de ontwerpsessie, niet bewaard) basis-ingang/doel-eerst/zoekBasis.kort.proto.ts), met deze aanvullingen.

**leesVraag.**
- Vakwoorden met de langste match eerst, over 3, 2 en dan 1 woord, zodat 'w en t' en 'muzische vorming' passen.
- Een vraag van 5 cijfers zet id; 3.5 of 3.5.4 zet code.
- Momentwoorden worden filters: '3de leerjaar' L4, 'kleuters' K3, 'lager' L4 en L6.
- Stopwoorden vallen weg.
- Elk overgebleven woord wordt een Term: varianten + ook[variant].

**Passen.**
- Op woordbegin.
- Woorden van 4 letters of minder, en '='-woorden, als heel woord met de buiging '', e, en, n, s of es.
- De rubriek alleen als heel woord.
- Een woordgroep als woordgroep.
- Nooit op het laatste deel van een samenstelling.

**Score.** Doelzin 3, rubriek 2, uitbreiding of woordenschat 1.

**Combineren.** EN over de termen. Versoepelen alleen bij 0 treffers en meer dan één term. termen = [] met vakken gezet geeft alleenVak.

**Volgorde.** Aantal termen, score, eerst eigenEind, de kortere doelzin, en dan de code.

**Groepen.** Per vak + onderwerpNr, in de volgorde van de beste treffer.

**zoekDoelVan** maakt de tekst met blokkenAlsTekst(doeltekstBlokken(…)), nooit met htmlNaarTekst.

Gemeten zonder tabel op de bevroren toets: recall 0,62 en P@3 0,82, tegenover 0,45 en 0,73 nu.

### `ZOEKWOORDEN`

```ts
src/lib/basis/zoekwoorden.ts: export const ZOEKWOORDEN: Zoekwoorden
```

Gegevens, geen code.

**stop**: de, het, een, en, of, van, in, op, met, voor, aan, bij, te, tot, om, die, dat, er, over, naar, uit, door, hoe, wat, wie, welke, mijn, je, ik, we, kinderen, leerlingen, leerling, les, doelen, doel, kunnen, kennen.

**vak**:
- nederlands, taal, nl → [1];
- wiskunde, rekenen, 'wiskundige initiatie' → [2];
- wetenschap, techniek, 'w en t' → [3];
- wo, wereldorientatie → [3,4,5];
- aardrijkskunde → [4];
- geschiedenis → [5];
- 'muzische vorming', muzische, muvo, muzo → [6];
- lo, turnen, gym, sport, bewegingsopvoeding, 'lichamelijke opvoeding' → [7];
- ict → [8];
- attitudes → [9];
- frans → [10].

**ook**: in P3 alleen { schaduw: ['lichtbron','lichtrichting','belichting','=licht'] }. Nagerekend: zo komt 92767 eerst. P5 vult aan.

**Regels voor ook**:
- de sleutel is gestamd zoals varianten() hem maakt;
- elk bronwoord komt voor in de 998 doelen;
- elk bronwoord heeft minstens 4 letters zonder '=';
- geen regel voor een vraag uit zoektoets.json.

### `leesKeuze / bewaarKeuze / wisKeuze / saneerKeuze`

```ts
src/lib/basis/basisKeuze.ts:

```ts
export const KEUZE_SLEUTEL = 'wf.basis.keuze.v1';
export interface BasisKeuze { soort: SoortBasis; leerjaar: LeerjaarBasis }
export function saneerKeuze(x: unknown): BasisKeuze | undefined;
export function leesKeuze(opslag?: Pick<Storage, 'getItem'>): BasisKeuze | undefined;
export function bewaarKeuze(k: BasisKeuze, opslag?: Pick<Storage, 'setItem'>): boolean;
export function wisKeuze(opslag?: Pick<Storage, 'removeItem'>): void;
```
```

**Vorm.** Er wordt exact `{"v":1,"soort":"bao","leerjaar":"L3"}` geschreven.

**Lezen.** Alles in try/catch; localStorage wordt binnen de try opgevraagd. Kapotte JSON, een andere v, een onbekende soort of een onbekend leerjaar geeft undefined. Extra velden vallen weg.

**Waar.** Niet in storage.ts of Prefs: die zitten op het leerlingpad.

**De hook** useBasisKeuze() (src/components/basis/useBasisKeuze.ts) volgt het storage-event.

### `WanneerGelden (vier optionele props)`

```ts
src/components/basis/WanneerGelden.tsx:

```ts
kopId?: string = 'md-wanneer-kop';
kopNiveau?: 2 | 3 = 3;
setLink?: (id: string) => string = (id) => `/leerplannen/minimumdoelen/${id}`;
toonTweeling?: boolean = true;
```
```

Zonder props is de uitvoer byte voor byte gelijk aan vandaag (WanneerGelden.tsx:47-48, 128, 141, 170, 220). De bestaande WanneerGelden.test.ts blijft groen.

Op de doelpagina: kopId 'b-wanneer-kop', kopNiveau 2, toonTweeling false.

## Componenten

- **BasisDeel (src/pages/basis/BasisDeel.tsx).** Het enige luie chunk dat App.tsx kent.
- Zet data-deel op html in een useLayoutEffect, met opruimen, en importeert basis.css.
- Kiest het scherm met basisRoute(useParams()['*'], useLocation().search).
- Gebruikt alleen useParams, useLocation, useNavigate en Link.
- Rendert BasisSchil met het scherm erin.
- Het chunk is hoogstens 80 kB. Is het groter, dan worden ZoekScherm en LeerlijnScherm binnen BasisDeel met React.lazy geladen.
- **BasisSchil (src/components/basis/BasisSchil.tsx).** - **Skiplink** 'Naar de inhoud', die de focus naar main zet, zoals Layout.tsx:359-371.
- **Kop**: lamptegel, 'Boosterz' en de pil 'basisonderwijs' (--on-lamp op --lamp), als link naar #/basis.
- **nav** aria-label 'Basisonderwijs' met Mijn klas, Doelen, Leerlijnen en Zoeken, met aria-current.
- **Themaknop** met cycleTheme. Het label 'Thema: …' is sr-only onder 640 px.
- **'Naar Boosterz'** (#/).
- **Main**: precies één <main id='main' tabIndex={-1}>. Bij een schermwissel gaat de focus naar main.
- **Voet** 'Bron: Onderwijsdoelen, Vlaamse overheid'.
- Tikdoelen zijn minstens 44 px.
- **StartScherm, KlasScherm, MomentScherm, VakScherm, LeerlijnScherm, DoelScherm, ZoekScherm (src/pages/basis/).** Eén per route. Elk scherm zet precies één h1, uit de route en ook tijdens het laden. Het schooljaar komt uit schooljaarVanDatum(new Date()) in het scherm, nooit in src/lib/basis. Laden via useBasisSets, met LaadBericht en FoutBericht.
- **useBasisSets (src/components/basis/useBasisSets.ts).** laadIndex via useLaadstand (src/lib/useLaadstand.ts), en useSetBestanden(ids) (components/curriculum/samenstellen/useSetBestanden.ts). Geen eigen cache.
- **KlasKiezer + KlasBalk (src/components/basis/KlasKiezer.tsx).** **KlasKiezer**: Gewoon of Buitengewoon met aria-pressed, 9 knoppen met een zichtbare tekst in drie fieldsets, en de bewaarde klas met aria-current. Een tik roept bewaarKeuze aan en navigeert.

**KlasBalk**: de klas, met 'Andere klas' en eventueel 'Onthoud als mijn klas'.
- **VakKaart (src/components/basis/VakKaart.tsx).** Een link-kaart van minstens 72 px: vaktegel (.b-vaktegel met --h en het icoon, aria-hidden), naam, aantal en soort, bij 'mag' 'verplicht vanaf …', een ZekerheidBadge, en een lampstreep als prop.
- **ZekerheidBadge (src/components/basis/ZekerheidBadge.tsx).** <span className='badge badge-warn'> met zekerheidLabel(z). Bij 'zeker' komt er niets.
- **DoelKaart + DoelRij (src/components/basis/).** **DoelKaart**: een li met de code, DoeltekstWeergave, het soortlabel als het vak meer dan één soort heeft, en een link 'Open doel 3.5.4' van 44 px.

**DoelRij**: een link van minstens 44 px met het moment, de code, de letterlijke doelzin, '+ opsomming (n punten)', eventueel 'dit doel' en <mark>.

Geen enkele component kort een doeltekst in.
- **DoeltekstWeergave (src/components/basis/DoeltekstWeergave.tsx).** Rendert Blok[] als React-elementen:
- lijsten genest;
- 'Voorbeeld:' en 'Toelichting:' als een ondergeschikt blok;
- een breuk als <span className='b-breuk' role='math' aria-label='1 op 10'>;
- [F] en [I] als <abbr>;
- https-links in een nieuw tabblad met noopener en een sr-only melding;
- een beeld als 'Afbeelding in de bron: …'.
Nooit dangerouslySetInnerHTML.
- **RubriekenLijst, LeerlijnTabel, ZoekVeld, ZoekResultaten (src/components/basis/).** **RubriekenLijst**: knoppen die scrollen en de focus op de h2 zetten.

**LeerlijnTabel**: een table met caption, scope=col en scope=row, '(je klas)' en lege cellen met tekst. Op 760 px of smaller worden de rijen kaarten.

**ZoekVeld**: een form role=search met een sr-only label, een invoer van 48 px en de knop 'Zoek'.

**ZoekResultaten**: de statusregel met role=status, chips, 'Ook gezocht op', groepen per leerlijnrij, en hulp bij alleenVak en bij 0 treffers.
- **Stijlen en lettertype.** **Stijlen**:
- src/styles/basis.css: tokens, @font-face, schil en .b-vaktegel;
- basis-klas.css;
- basis-doelen.css;
- basis-leerlijn.css;
- basis-zoek.css.

**Lettertype**: src/assets/fonts/fredoka-latin.woff2 met OFL-Fredoka.txt (de OFL 1.1, met de copyrightregel van het Fredoka-project) en een rij in LEESMIJ.md.

## Zoeken

Zonder AI en zonder sleutel, met een zuivere mechaniek (zoekBasis.ts) en een kleine woordentabel als gegevens (zoekwoorden.ts).

**De stappen.**
1. Leerjaar-, moment- en vakwoorden worden filters, zichtbaar als chips. Zonder momentwoord geldt het eindmoment van de klas, met 'Zoek in alle vakken en momenten'.
2. Stopwoorden vallen weg, en elk woord krijgt een lichte stam (magneten wordt magnet en magneet, liedjes wordt lied).
3. Een woord past op woordbegin. Korte woorden (4 letters of minder) en rubrieken alleen als heel woord. Nooit midden in een woord.
4. Score: doelzin 3, rubriek 2, uitbreiding of woordenschat 1.
5. Alle woorden moeten passen. Alleen bij 0 treffers volstaat een deel van de woorden, met een melding.
6. De treffers staan gegroepeerd per leerlijnrij, het moment van de klas eerst.
7. De woordentabel zet woorden van leerkrachten om naar woorden van de bron, met in beeld: 'Ook gezocht op: …'.

**Voorbeelden**, nagerekend met rechter/kruis-zoek.ts en schaduw.ts:
- 'schaduw' voor een 3de leerjaar: nu 4 treffers, zonder het W&T-doel. Met de tabelregel staat 92767 '3.5.4 De leerlingen kennen licht: rechtlijnige beweging.' eerst.
- 'licht' bij einde 4de: 92767 eerst. Nu staat 92988 ('(even) licht') eerst.
- 'weer': 21 treffers met weergeven bovenaan wordt 9 met 92566 eerst.
- 'tellen': 90 wordt 12, met 92961 eerst.
- 'persoonsvorm': 49 wordt 4.
- 'wiskunde breuken' en 'breuken 6de leerjaar': 0 wordt 29 en 19.
- 'rijmen': 0 wordt 3.
- 'taal': links naar Nederlands per moment.
- '92767' en '3.5.4' vinden het doel.

**Meting.** Een bevroren toets: (scratchpad van de ontwerpsessie, niet bewaard) basis-ingang/rechter/zoektoets.json, 66 vragen, sha256 4671c4c7c4ec40bf72c7b32362733afd59018d616197dae9fc20abed7327cb6f.
- Zonder tabel: nu recall 0,45, P@3 0,73 en 14 vragen zonder treffer. Nieuw: 0,62, 0,82 en 6.
- Het goud is het oordeel van agents. Echte winst komt uit de woordentabel (P5), te toetsen op woorden van leerkrachten.

## Wat onthouden wordt

**Per toestel één sleutel**: 'wf.basis.keuze.v1' = {"v":1,"soort":"bao"|"bubao","leerjaar":"K1".."L6"}.
- Hij past in de familie wf.basis.*.v1 uit AANMELDEN-BOUWPAKKETTEN.md, zonder botsing.
- De naam bevat bewust niet 'klas', voor de klaslijst van bouwpakket 4.

**Wanneer.** Alleen bewaard bij een tik in de kiezer of op 'Onthoud als mijn klas'. Een gedeelde link overschrijft niets. 'Vergeet mijn klas' wist de sleutel.

**Waar.** In een eigen module, met try/catch en controle. Niet in storage.ts of wf.prefs.v1. Het thema blijft in wf.prefs.v1 via cycleTheme.

**Valt onder** 'Alles wissen', de meting van de opslag en het storage-event. Niet onder 'leerlinggegevens wissen'.

**Privacypagina.** Bij Voorkeuren komt erbij: 'en in het deel basisonderwijs het leerjaar dat je koos (gewoon of buitengewoon)'.

**Nooit bewaard**: namen, zoekvragen of zoekgeschiedenis, bezochte vakken of doelen, de stand van details, een bordstand, het schooljaar. Het schooljaar komt uit de klok en staat in beeld.

## Toegang

**Naar /basis:**
1. **StartPage**: in beide toestanden een kader .start-basis-box naar het model van .start-student-box (StartPage.tsx:255-259), met de zin 'Kleuter of lager? Bekijk wat je klas moet kennen, per vak en per leerjaar.' en de link 'Naar het basisonderwijs'. Sectie 1 van de rooktest blijft geldig.
2. **Menu 'Meer'** (Layout.tsx:343-352): het item {label 'Basisonderwijs', hint 'Minimumdoelen per leerjaar, kleuter en lager', Icon School, to '/basis'} vóór Thema. Thema blijft het laatste, dus End blijft werken (smoke.mjs:5527-5532).
3. **Officiële minimumdoelen**: na de toelichting over het basisonderwijs (MinimumdoelenPage.tsx:206-210) een nieuwe paragraaf .md-toelichting met een link naar /basis. Niets in .page-head-actions of in de wegwijzer van Leerplannen.
4. **Rechtstreeks**: de link .../Boosterz/#/basis.

**Terug.** 'Naar Boosterz' in de kop, links naar de officiële setpagina, en de terugknop van de browser. Bij het verlaten haalt BasisDeel data-deel weg.

**Leerlingpad.** Alleen App.tsx verandert:
- `const BasisDeel = lazyRetry(() => import('./pages/basis/BasisDeel').then((m) => ({ default: m.BasisDeel })), 'BasisDeel');`
- `{ path: '/basis/*', element: lz(<BasisDeel />), errorElement }`, buiten Layout en vóór '*'.

**Paginatitels** (paginaTitel.ts is lui), allemaal vóór ['/', 'Start']:
- ['/basis/kies', 'Kies je klas · Basisonderwijs'];
- ['/basis/klas', 'Mijn klas · Basisonderwijs'];
- ['/basis/moment', 'Doelen per moment · Basisonderwijs'];
- ['/basis/vak', 'Doelen per vak · Basisonderwijs'];
- ['/basis/leerlijn', 'Leerlijn · Basisonderwijs'];
- ['/basis/doel', 'Minimumdoel · Basisonderwijs'];
- ['/basis/zoek', 'Zoeken · Basisonderwijs'];
- ['/basis', 'Basisonderwijs'].

**Kost**: +0,3 tot 0,4 kB (gemeten 334,8 tot 334,9 tegen een budget van 334,6). maxKb gaat naar de meting + 0,5, met een regel geschiedenis.

**Niet aangeraakt**: EAGER_ICON_NAMES, PlayerPage, JoinPage, OpenSharedPage, ui.tsx, registry.tsx, A11yMenu, icons.ts en storage.ts.

## Later

Alles hangt aan twee sleutels:
- set + doelnummer: de bestaande MinimumdoelRef;
- de leerlijnrij: vak.onderwerp + subthema + eindmoment.
De doelpagina heeft DOEL_DELEN, een geordende lijst {id, kop, Deel}. Een deel zonder inhoud rendert null.

**Fase 2 (materiaal en digibord):**
- DOEL_DELEN 'materiaal' met materiaalBijDoel(doelId, leerplannen, cursussen, oefeningen), dat op refs.id zoekt;
- de knop 'Maak materiaal bij dit doel' via 'Gebruik als leerplan';
- tellers per rubriek en per leerlijncel;
- het digibord: html[data-bord] naast data-deel, met regels onder :root[data-deel='basis'][data-bord] (letters op 135 %, geen breedtegrens), en de schakelaar 'Op het bord' die niets bewaart;
- routes /basis/bord/… in basisRoutes.

**Fase 3 (lesplannen van het GO!):**
- gegevens per lesplan in public/basis/lesplannen/, met de bron GO! en de doel-id's;
- DOEL_DELEN 'lesplannen' en de route #/basis/lesplan/:id;
- een controlepoort zoals bij de leerplannen.

**Bouwstap 4 (bewijs):** DOEL_DELEN 'in mijn klas', alleen op de laptop van de leerkracht, op doel-id. De keuze krijgt een tweede bron zonder migratie.

**Bouwstap 5:**
- een pakketmanifest met id-lijsten (92729, 92730, 92734, 92735, 92767, 92775, 92777, 92833, 92836, 92849);
- DOEL_DELEN 'op het bord' en 'Pakketten bij dit onderwerp' op de leerlijn;
- de themaleerlijn 'licht en schaduw' als gegevens, met de route #/basis/thema/:id;
- de oefeningsoort in registry.tsx, met een eigen budgetvraag.

**Daarna**: de typekeuze voor het buitengewoon (typeVanSet exporteren) en de lijst oude ontwikkelingsdoelen per type.

## Tests

- **basisRoutes.test.ts.**
- Elk scherm wordt gelezen.
- De rondgang basisRoute(basisPad(x)) geeft x terug, voor alle combinaties.
- 'l3' wordt 'L3'.
- ?klas=L5 bij einde-4de valt weg.
- Onzin geeft 'onbekend', zonder fout.
- doelPad({set:'ODS_3408', id:'92767'}) is '/basis/doel/ODS_3408/92767'.
- 10 unieke vakslugs uit INVOERINGSKALENDER.
- **klasOverzicht.test.ts.** Met zelfgemaakte koppen:
- groeperen;
- twee sets van één vak geven één regel met perSoort;
- leeg;
- zonderNieuweSet;
- oud zonder vak.
- **doelBasis.test.ts.**
- De doelzin komt los van de uitbreiding.
- codeVergelijk: 2.3.28 na 2.3.4, 10.1.1 na 9.3.5.
- Een subthema met dezelfde naam onder een ander onderwerp blijft apart.
- leerlijnVanVak: lege cellen.
- voegVolgordeSamen als eigenschapstest.
- zelfdeRubriek valt terug op het onderwerp.
- **doeltekst.test.ts.** Met de echte html van:
- 93177: 2 breuken, '1/10' en '1/100';
- 92739 en 92787: diepte 3 en 4;
- 92830: 3 alt-teksten en geen src;
- 92713: een https-link; javascript: wordt tekst;
- een doel met U+200B;
- '< bv. >' wordt voorbeeld;
- 93407 houdt '<' en '>';
- een onbekende tag wordt tekst.
Plus een grep: geen dangerouslySetInnerHTML in src/pages/basis en src/components/basis.
- **zoekBasis.test.ts.**
- varianten: magneten, liedjes, zwemmen;
- 'weer' past niet op 'weergeven', 'licht' niet op 'toelichten', 'persoonsvorm' niet op de rubriek 'Persoonsvormende …';
- filters: '3de leerjaar' L4, '2de kleuterklas' K3, 'W&T' 3, 'muzische vorming' 6, 'lager' L4 en L6;
- versoepelen alleen bij 0 treffers;
- volgorde en groepen;
- alleenVak;
- id en code.
- **basisKeuze.test.ts.**
- bewaren en lezen geven hetzelfde terug, met de exacte string;
- kapot, v:2, 'L7' of 'so' geven undefined;
- extra velden vallen weg;
- een opslag die gooit, breekt niets;
- alleen de sleutel wf.basis.keuze.v1 wordt geschreven.
- **basisKleuren.test.ts.** Leest global.css en basis.css en legt basis over globaal, zoals rechter/contrast.ts.
- **Contrast**: de PAIRS uit color.test.ts plus tekst, tekst-soft en tekst-faint op bg, bg-raised en bg-sunken; tekst op lamp-soft ≥ 7; brand en tekst-soft op lamp-soft ≥ 4,5; line-strong op bg-raised ≥ 3; wit op brand-fill, brand-fill-strong, accent-fill, ok-strong en err-strong ≥ 4,5; on-lamp op lamp ≥ 4,5; 10 vaktinten (icoon ≥ 4,5, tekst ≥ 7), in licht en donker.
- **Blokken**: dezelfde sleutels in het lichte en het donkere blok, en het donkere blok in @media screen.
- **Selectors**: alleen :root[data-deel='basis'] of .b-.
- **Verboden**: geen Google Fonts, geen color: var(--lamp), geen witte tekst op var(--brand).
- **basisBronnen.test.ts.** De zuivere modules lezen de klok niet en gebruiken geen React, fetch of opslag. Alleen basisKeuze.ts gebruikt localStorage.
- **basisIngang.echt.test.ts.** Met de wacht: existsSync, it.runIf(ODS_3395) en describe.skipIf(GEGEVENSRUN). Te controleren:
- bao L3 2026: 3 verplicht (NL 72, WI 122, W&T 44), 6 mag vanaf 2027, Frans, 7 oud, 368 doelen in 9 vakken;
- K2: NL 7 + 35, MV en LO zeker, AK, GE en ATT waarschijnlijk, oud ODS_2102, 2103 en 2107;
- L5: 0 verplicht, 10 oud, 10 mag;
- bubao L3: onzeker, leeg = ODS_2959;
- de invariant over 126 klassen;
- de leerlijn voor bao en bubao: 998 id's, 48 onderwerpen, 124 rijen, 322 cellen, 29 leeg, max 15;
- doeltekst op 998 doelen: 0 tags, 55 breuken, 14 genest, 3 beelden, 6 links;
- 'schaduw' met L4 geeft 92767 eerst;
- zoektoets.json zonder ook: recall ≥ 0,60, P@3 ≥ 0,78, hoogstens 6 vragen zonder treffer, en hoger dan doelPastBijZoek;
- zoekwoorden.echt.test.ts: elk bronwoord raakt een doel.
- **Componenten** (renderToStaticMarkup in een StaticRouter):
- BasisSchil: één main en de skiplink;
- elk scherm één h1;
- KlasKiezer: 9 + 2 knoppen met aria-pressed;
- VakKaart;
- ZekerheidBadge toont niets bij 'zeker';
- LeerlijnTabel met scope en '(je klas)';
- DoeltekstWeergave zonder '<math'.
WanneerGelden.test.ts krijgt nieuwe gevallen erbij (h2#b-wanneer-kop, toonTweeling false). paginaTitel.test.ts krijgt 8 nieuwe titels.
- **Build.** Het budget; een grep op index-*.js naar 'wf\.basis\.keuze|Wat geldt voor je|kenniswest' geeft niets; vendor 169.201 B; BasisDeel ≤ 80 kB.
- **Rooktest.** De module tests/basis/ingang.mjs (`export async function basisIngang({ browser, BASE, check, errors, sleep })`), de uitvoerder ingang-los.mjs, en in smoke.mjs de aanroep '20b-2c' na 20b-2b. Een eigen context zonder service worker, klok 2026-11-02T10:00:00Z.

De 12 checks:
1. #/basis met de h1, data-deel, de titel en --brand-fill #2b5bd0.
2. Tik '3de leerjaar': de url, de 3 kaarten 72, 122 en 44, 'waarschijnlijk' en 7 oude sets.
3. localStorage exact.
4. #/basis stuurt door.
5. De vakpagina W&T: 44 kaarten en 3.5.4 met een link.
6. Doel 92767: h1, tweelinglink en b-wanneer-kop.
7. 93177 zonder '<math', met 2 .b-breuk.
8. De leerlijn W&T met 3.5.2, 3.5.4 en '(je klas)'.
9. 'schaduw' geeft 92767 eerst.
10. 390 px zonder horizontaal scrollen, en 44 px.
11. Donker: --bg #0d1322 en --brand-fill #2f5fd6.
12. 'Naar Boosterz' haalt data-deel weg en zet --brand-fill weer op #5b3df5; #/basis/xyz toont de eigen melding.
Geen console- of paginafouten.

## Acceptatie

- `npm run lint` geeft 0 fouten en geen nieuwe waarschuwingen. `npm run typecheck` en `npx vitest run` zijn groen. `npm run build` blijft binnen alle budgetten, met CRITICAL_PATH.maxKb = de meting + 0,5 kB en een regel geschiedenis.
- `git diff --stat` raakt geen van deze bestanden: storage.ts, PlayerPage, JoinPage, OpenSharedPage, ui.tsx, registry.tsx, A11yMenu, icons.ts, moment.ts, kalender.ts, momentTeksten.ts, minimumdoelenBron.ts, minimumdoelen.ts, global.css en color.test.ts. In vite.config.ts verandert alleen maxKb, met zijn commentaar.
- `grep -lE 'wf\.basis\.keuze|Wat geldt voor je|kenniswest' dist/assets/index-*.js` vindt niets. vendor-*.js is 169.201 B. Het chunk van BasisDeel is ≤ 80 kB.
- #/basis zonder keuze (klok 2026-11-02): één main, één h1 'Welke klas heb je?', html[data-deel=basis], titel 'Basisonderwijs · Boosterz', 2 + 9 keuzeknoppen en de momenttegels 208, 368 en 422.
- Tik '3de leerjaar'. De url wordt #/basis/klas/gewoon/L3.
- De lead zegt 'einde van het 4de leerjaar' en '368 doelen in 9 vakken'.
- Verplicht: precies NL 72 (ODS_3395), WI 122 (ODS_3406) en W&T 44 (ODS_3408), met 'waarschijnlijk'.
- Mag al: AK 21, GE 19, MV 38, LO 16, ICT 9 en ATT 27, met 'verplicht vanaf 2027-2028'.
- De open lijst oude doelen: ODS_2108, 2109, 2111, 2114, 2115, 2116 en 2117.
- Er staat een zin over Frans.
- localStorage['wf.basis.keuze.v1'] is exact '{"v":1,"soort":"bao","leerjaar":"L3"}', zonder andere nieuwe sleutel. Een goto naar #/basis landt zonder tik op #/basis/klas/gewoon/L3.
- #/basis/klas/gewoon/K2:
- NL '42 doelen: 7 te bereiken (populatie) · 35 na te streven';
- verplicht zonder badge;
- MV en LO zonder badge, AK, GE en ATT met 'waarschijnlijk';
- oud: ODS_2102, 2103 en 2107, als ontwikkelingsdoelen.
- #/basis/klas/gewoon/L5: de h2 'Dit schooljaar zijn nog geen nieuwe doelen verplicht'. De 10 oude sets ODS_2108 tot ODS_2117 staan open. Er zijn 10 kaarten 'mag al': NL, WI en W&T vanaf 2027-2028, de rest vanaf 2029-2030.
- #/basis/klas/buitengewoon/L3: 'nog onzeker', 'dezelfde doelen, telkens na te streven', de kaarten uit ODS_3465, ODS_3467 en ODS_3469, en geen lijst van 22 oude sets maar een zin met een link.
- #/basis/vak/gewoon/einde-4de/wetenschap-en-techniek?klas=L3:
- 44 doelkaarten en 7 h2's;
- 3.5.4 met letterlijk 'De leerlingen kennen licht: rechtlijnige beweging.' en een link naar #/basis/doel/ODS_3408/92767;
- de statusregel 'verplicht' voor 2026-2027 met 'waarschijnlijk'.
- #/basis/vak/gewoon/einde-kleuter/wiskunde: 59 doelen uit ODS_3404 en ODS_3405, op codevolgorde, met per doel de soort.
- #/basis/doel/ODS_3408/92767:
- h1 'Minimumdoel 3.5.4' en 'Te bereiken op populatieniveau';
- een link naar #/basis/doel/ODS_3469/92767;
- een h2#b-wanneer-kop en geen #md-wanneer-kop;
- in de leerlijn kleuter 5 en 6de 7 doelen, met 'dit doel' gemarkeerd.
- #/basis/doel/ODS_3406/93177 heeft geen '<math' en 2 breuken met de aria-label '1 op 10' en '1 op 100'. #/basis/doel/ODS_9999/92767 toont 'Dit doel vonden we niet' en een zoeklink.
- #/basis/leerlijn/gewoon/wetenschap-en-techniek?klas=L3: 7 onderwerpen. De rij 'Natuurkundige verschijnselen' bevat 3.5.2 (kleuter) en 3.5.4 (4de en 6de), met '(je klas)' bij einde 4de en letterlijke doelzinnen.
- Zoeken:
- schaduw met klas L3: 92767 eerst, in de groep 'Wetenschap en techniek › Natuurkundige verschijnselen', met 'Ook gezocht op';
- 'wiskunde breuken' (alles): de chip Wiskunde en 29 treffers;
- 'breuken 6de leerjaar': 19 treffers, alle bij einde 6de;
- 'rijmen': 92930, 92959 en 92960;
- 'weer': zonder 93039;
- 'persoonsvorm': hoogstens 4 treffers;
- 'taal': links per moment;
- '92767': dat doel.
- Op 390 px scrolt geen basisscherm horizontaal. Bediening is minstens 44 px. Elk scherm heeft één main en één h1, ook tijdens het laden.
- Donker: --bg #0d1322 en --brand-fill #2f5fd6. Na 'Naar Boosterz' geen data-deel en --brand-fill #5b3df5. #/basis/xyz toont de eigen melding.
- Toegang:
- het kader op de startpagina in beide toestanden;
- 'Basisonderwijs' in Meer vóór Thema, en End plus Enter werkt nog;
- de link op Officiële minimumdoelen;
- de privacyzin.
- De volledige rooktest is groen met de sectie 20b-2c (12 checks). ingang-los.mjs loopt op zichzelf.

## Pakketten

### P0. Beslissingen en het spec vastleggen

Agent: hoofdsessie (opus).

Leg het spec vast in docs/basisonderwijs/INGANG.md met de tabel 'Stand van zaken', een verwijzing in BASISONDERWIJS.md en een regel in CLAUDE.md. Vraag de eigenaar de drie beslissingen. Het bouwen wacht niet; online gaan wacht op beslissing 1.

Bestanden: `docs/basisonderwijs/INGANG.md`, `docs/BASISONDERWIJS.md`, `CLAUDE.md`

### P1. Zuivere kern

Agent: bouwer (sonnet), worktree.

basisRoutes.ts, klasOverzicht.ts en doelBasis.ts volgens 'functies', met unit tests.

Niet aanraken: moment.ts, kalender.ts, momentTeksten.ts, minimumdoelenBron.ts en minimumdoelen.ts.

Poort: `npx vitest run src/lib/basis`, typecheck, lint.

Bestanden: `src/lib/basis/basisRoutes.ts`, `src/lib/basis/basisRoutes.test.ts`, `src/lib/basis/klasOverzicht.ts`, `src/lib/basis/klasOverzicht.test.ts`, `src/lib/basis/doelBasis.ts`, `src/lib/basis/doelBasis.test.ts`

### P2. Doeltekst

Agent: bouwer (sonnet), worktree.

doeltekst.ts naar ontwerp-klas/doeltekst.proto.ts (href via webUrl), DoeltekstWeergave en de grep-test. Poort: vitest, typecheck, lint.

Bestanden: `src/lib/basis/doeltekst.ts`, `src/lib/basis/doeltekst.test.ts`, `src/components/basis/DoeltekstWeergave.tsx`

### P3. Zoekmechaniek

Agent: bouwer (sonnet), worktree.

zoekBasis.ts naar doel-eerst/zoekBasis.kort.proto.ts, met de aanvullingen. zoekwoorden.ts met alleen de regel voor schaduw.

Kopieer rechter/zoektoets.json naar src/lib/basis/zoektoets.json en controleer sha256 4671c4c7c4ec40bf72c7b32362733afd59018d616197dae9fc20abed7327cb6f.

Poort: vitest, typecheck, lint.

Bestanden: `src/lib/basis/zoekBasis.ts`, `src/lib/basis/zoekBasis.test.ts`, `src/lib/basis/zoekwoorden.ts`, `src/lib/basis/zoektoets.json`

### P4. Tests op de echte gegevens (een andere agent dan P1 tot P3)

Agent: bouwer (sonnet), andere agent.

basisIngang.echt.test.ts met de wacht en de getallen, en basisBronnen.test.ts. Bij een rode test: melden met het set-id, de code niet aanpassen. Poort: vitest.

Bestanden: `src/lib/basis/basisIngang.echt.test.ts`, `src/lib/basis/basisBronnen.test.ts`

### P5. Woordentabel

Agent: inhoudschrijver (opus), nakijker (sonnet), rechter (opus).

Vul ZOEKWOORDEN.ook vanuit woorden van leerkrachten, met de woorden van de eigenaar eerst. Elk bronwoord komt voor in de doelen; niets afgestemd op zoektoets.json. De nakijker kijkt na tegen de 998 doelen; twijfel gaat naar de rechter. Daarna zoekwoorden.echt.test.ts, en de meting in INGANG.md.

Bestanden: `src/lib/basis/zoekwoorden.ts`, `src/lib/basis/zoekwoorden.echt.test.ts`

### P6. Vormgeving

Agent: bouwer (sonnet), worktree.

basis.css met de tokens letterlijk en @font-face. Het lettertype uit scratchpad/basis-ingang/fonts/s_fredoka_v17_X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWu89U.woff2, met OFL-Fredoka.txt en LEESMIJ.md. basisKleuren.test.ts naar rechter/contrast.ts.

Niet aanraken: global.css, color.test.ts en lettertypes.test.ts.

Bestanden: `src/styles/basis.css`, `src/assets/fonts/fredoka-latin.woff2`, `src/assets/fonts/OFL-Fredoka.txt`, `src/assets/fonts/LEESMIJ.md`, `src/lib/basis/basisKleuren.test.ts`

### P7. Schil, route, titels en budget

Agent: bouwer (sonnet); de hoofdsessie controleert App.tsx en vite.config.ts.

- BasisDeel, BasisSchil, vakIconen en useBasisSets.
- App.tsx: één lazyRetry-regel en de route '/basis/*' (zonder <Routes>).
- paginaTitel.ts met de 8 titels en hun test.
- npm run build, daarna maxKb = de meting + 0,5, met een regel geschiedenis.

Poort: de hele kwaliteitspoort plus de grep.

Niet aanraken: leerlingroutes, EAGER_ICON_NAMES, storage.ts, Layout.tsx en icons.ts.

Bestanden: `src/pages/basis/BasisDeel.tsx`, `src/components/basis/BasisSchil.tsx`, `src/components/basis/vakIconen.ts`, `src/components/basis/useBasisSets.ts`, `src/App.tsx`, `src/lib/paginaTitel.ts`, `src/lib/paginaTitel.test.ts`, `vite.config.ts`

### P8. Mijn klas

Agent: bouwer (sonnet).

basisKeuze.ts en de hook, StartScherm, KlasScherm, KlasKiezer, VakKaart en ZekerheidBadge. De oude doelen staan open; in het buitengewoon alleen de zin en de link. Met componenttests.

Bestanden: `src/lib/basis/basisKeuze.ts`, `src/lib/basis/basisKeuze.test.ts`, `src/components/basis/useBasisKeuze.ts`, `src/pages/basis/StartScherm.tsx`, `src/pages/basis/KlasScherm.tsx`, `src/components/basis/KlasKiezer.tsx`, `src/components/basis/VakKaart.tsx`, `src/components/basis/ZekerheidBadge.tsx`, `src/components/basis/basis.test.ts`, `src/styles/basis-klas.css`

### P9. Moment, vak en doelpagina

Agent: bouwer (sonnet).

MomentScherm, VakScherm, DoelScherm (DOEL_DELEN, de tweeling, 'niet gevonden'), DoelKaart, DoelRij en RubriekenLijst. WanneerGelden krijgt de vier props; WanneerGelden.test.ts alleen uitbreiden.

Bestanden: `src/pages/basis/MomentScherm.tsx`, `src/pages/basis/VakScherm.tsx`, `src/pages/basis/DoelScherm.tsx`, `src/components/basis/DoelKaart.tsx`, `src/components/basis/DoelRij.tsx`, `src/components/basis/RubriekenLijst.tsx`, `src/components/basis/WanneerGelden.tsx`, `src/components/basis/WanneerGelden.test.ts`, `src/styles/basis-doelen.css`

### P10. Leerlijn

Agent: bouwer (sonnet).

LeerlijnScherm en LeerlijnTabel: echte tabellen, '(je klas)', lege cellen met tekst, kaarten op 760 px of smaller, en letterlijke doelzinnen.

Bestanden: `src/pages/basis/LeerlijnScherm.tsx`, `src/components/basis/LeerlijnTabel.tsx`, `src/styles/basis-leerlijn.css`

### P11. Zoekpagina

Agent: bouwer (sonnet).

ZoekScherm, ZoekVeld en ZoekResultaten: laden per bereik, chips, 'Ook gezocht op', 'versoepeld', groepen, <mark>, alleenVak, nummer en code, en 0 treffers.

Bestanden: `src/pages/basis/ZoekScherm.tsx`, `src/components/basis/ZoekVeld.tsx`, `src/components/basis/ZoekResultaten.tsx`, `src/styles/basis-zoek.css`

### P12. Toegang

Agent: bouwer (sonnet).

Het kader op StartPage, het item 'Basisonderwijs' in Meer vóór Thema, de paragraaf op MinimumdoelenPage en de zin op PrivacyPage. Geen bestaande rooktestcheck aanraken.

Bestanden: `src/pages/StartPage.tsx`, `src/styles/start.css`, `src/components/Layout.tsx`, `src/pages/MinimumdoelenPage.tsx`, `src/pages/PrivacyPage.tsx`

### P13. Rooktest (een andere agent dan P8 tot P11)

Agent: bouwer (sonnet), andere agent.

tests/basis/ingang.mjs met 12 checks, de losse uitvoerder, en de aanroep 20b-2c in smoke.mjs.

Poort: build, preview op 4173 (stop ze met kill op haar pid), de losse uitvoerder, en daarna één keer de volledige smoke.mjs.

Bestanden: `tests/basis/ingang.mjs`, `tests/basis/ingang-los.mjs`, `tests/smoke.mjs`

### P14. Review vanuit drie invalshoeken

Agent: 3 × reviewer (sonnet), rechter (opus).

Elke reviewer kijkt vanuit één invalshoek:
- (a) leerlingpad, bundel, opslag en secundair;
- (b) toegankelijkheid, taal, 44 px, 390 px en contrast;
- (c) eerlijkheid tegenover de bron: letterlijke tekst, de soort per paar (doel, set), de zekerheid als tekst, geen koppeling oud-nieuw, de oude doelen zichtbaar.
De rechter bevestigt of weerlegt.

Bestanden: 

### P15. Integratie en commit

Agent: hoofdsessie (opus).

Draai de volledige poort met de rooktest, werk de stand van zaken bij in INGANG.md en BASISONDERWIJS.md, zet de regel in CLAUDE.md, en commit op claude/bookwidgets-web-app-kvcfim, pas na beslissing 1.

Bestanden: `docs/basisonderwijs/INGANG.md`, `docs/BASISONDERWIJS.md`, `CLAUDE.md`

## Risico's

- **De invoeringstabel voor het lager is niet nagelezen** (zeker, MOMENTMODEL.md:688): de status is waarschijnlijk, in het buitengewoon onzeker. Remedie: wat zeker is, staat bovenaan, er staan badges, en online gaan hangt aan beslissing 1.
- **De woordentabel is inhoud**: zonder de tabel vindt 'schaduw' doel 92767 niet (zeker). Remedie: P5, een bevroren toets, en woorden van echte leerkrachten.
- **Buitengewoon zonder typekeuze**: een oude set van het eigen type kan gemist worden. Remedie: een zichtbare zin en een link.
- **data-deel kan blijven hangen of css kan lekken.** Remedie: cleanup, gescopete selectors met een test, en rooktestcheck 12.
- **Specificiteit**: het lichte basisblok wint ook in donker. Remedie: de test op dezelfde sleutels.
- **Bundel**: +0,3 tot 0,4 kB. Onder 5 % alleen een waarschuwing. De poort is de grep plus een bewuste verhoging.
- **Fredoka**: niet in de voorcache, dus offline pas na het eerste bezoek; anders Outfit. De copyrightregel moet nagelezen worden (fontTools ontbrak).
- **Laden**: 29 sets bij 'alle momenten'. De cache van 40 sets is gedeeld. Remedie: standaard alleen het eindmoment van de klas.
- **Gevoelige attitudedoelen** (92642, 92666, 92667): alleen leerkrachtschermen in fase 1.
- **Externe beelden en links** (92830, 92713 tot 92715): alt-tekst en een externe link; offline werken ze niet.
- **Twee waarheden en de klok**: het label 'Geldig' tegenover de berekening op datum. Het schooljaar staat altijd in beeld.
- **De leerlijn kan als koppeling gelezen worden**: geen pijlen, een uitlegzin en tekst in lege cellen.
- **Een set-id kan verouderen**: het scherm 'niet gevonden' met zoeken op het doelnummer.
- **De duur van de rooktest** is niet gemeten: een losse uitvoerder en 12 checks.

## Bewust niet nu

- Oefeningen, cursussen of materiaal maken, en tellers van dekking (fase 2).
- Een digibordstand of de schakelaar 'Op het bord'. Alleen data-bord is voorzien.
- De lesplannen van het GO! (fase 3).
- De klaslijst, het aanmelden, inleveren en bewijs per kind (bouwstap 4).
- De Lichtkamer als oefeningsoort, het pakketmanifest en themaleerlijnen (bouwstap 5).
- Een typekeuze en lijsten van oude ontwikkelingsdoelen per type in het buitengewoon.
- Een koppeling van oude op nieuwe vakken.
- Een uitleg per soort doel uit de decreettekst.
- Een keuze van het schooljaar om vooruit te kijken.
- Zoeken met AI, op het laatste deel van een samenstelling, of door samenstellingen te ontleden.
- Externe beelden of de woordenlijst Frans bundelen.
- Moment of leerjaar bewaren in een leerplan, cursus of klas.
- Favorieten of zoekgeschiedenis.
- Aanpassingen aan Leerplannen, Samenstellen, de wizard, de editor of htmlNaarTekst. De MathML-tags op Officiële minimumdoelen worden later apart opgelost.
- De standaardfilter van de maandelijkse ophaling verruimen, en de officiële tabel nalezen (beslissing 1).

## Rechtzettingen van de criticus (verwerkt in H1 tot H16)

### Wat niet klopte

- **Spec:** Spec, DoelKaart/DoelRij: 'Geen enkele component kort een doeltekst in', terwijl DoelRij 'de letterlijke doelzin + opsomming (n punten)' toont.
  **Werkelijk:** In de leerlijn en in de zoekresultaten ontbreekt voor 273 van 998 gewone doelen (172 met een doelzin die op ':' eindigt) de uitbreiding op het scherm. Voor 85 daarvan bestaat geen lijst, dus 'n punten' is niet gedefinieerd.
- **Spec:** Spec, klaspagina punt 7: 'bij L1 tot L4 Frans heeft alleen doelen voor het einde van het 6de leerjaar'.
  **Werkelijk:** Voor L1 tot L4 gelden nog oude Frans-eindtermen (ODS_2117 'Lager Onderwijs - Leergebied - Frans - Eindtermen', 27 doelen, tot 2030-08-31). Die staan op dezelfde pagina in de lijst van oude doelen. De zin is alleen waar voor de nieuwe doelen.
- **Spec:** Spec, 'Mag al': 'Tot dan gelden voor deze vakken nog de oude eindtermen/ontwikkelingsdoelen'.
  **Werkelijk:** Voor de kleuterklas zijn er maar drie oude sets (ODS_2102 Lichamelijke opvoeding, ODS_2103 Muzische vorming, ODS_2107 Mens en maatschappij). Voor Attitudes bestaat geen oude set, en voor Aardrijkskunde en Geschiedenis enkel via een naamverwantschap die het model bewust niet beweert (MOMENTMODEL.md:663, :726). De zin is dus niet voor elk vak op de kaart te staven.
- **Spec:** Spec, kern: 'Nergens wordt een koppeling oud-nieuw beweerd' en nietNu 'Een koppeling van oude op nieuwe vakken'.
  **Werkelijk:** ZOEKWOORDEN.vak zet 'wo' en 'wereldorientatie' om naar vak [3, 4, 5]. Dat is een vertaling van een oud leergebied naar nieuwe vakken, een koppeling waarvan MOMENTMODEL.md:663 zegt dat ze een inhoudelijke vergelijking vraagt (inhoudschrijver, nakijker, rechter). In de spec loopt ze niet door P5. Het oude 'Mens en maatschappij' (ODS_2107/2111) valt er bovendien buiten.

### Wat ontbrak

- **De klaspagina (KlasScherm, klasOverzicht/VakRegel) laat twee teksten weg die het momentmodel al levert: Invoering.opmerking en de zin dat het net de tussenstappen vastlegt.** (ernst middel). Bestanden: src/lib/basis/moment.ts:94 en :104 (opmerking in Invoering en KalenderRegel), src/lib/basis/kalender.ts:110 en :281, src/components/basis/WanneerGelden.tsx:158 en :209 (toont ze nu), src/lib/basis/momentTeksten.ts:153 (voorWieTekst: 'het leerplan van je net legt de tussenstappen vast'). VakRegel in de spec heeft geen opmerking en de lijst van het scherm (punt 1 tot 9) noemt ze niet. Mijn script criticus/opm.ts roept setsDieGelden aan voor alle 18 klassen in 2026 tot 2029. De opmerking komt voor bij bao L4 (2026 mag/geldt, 2027 tot 2029 verplicht: 'halen hun getuigschrift (2028-2029) wel op de nieuwe minimumdoelen'), bij bao L6 (2 teksten: 'Uiterlijk 2028-2029…' en 'Uiterlijk 2030-2031…') en bij alle bubao-leerjaren ('Volgt de kalender van het gewoon basisonderwijs… nog niet bevestigd'). Scenario: een leerkracht van het 4de leerjaar opent in 2026 haar klaspagina en leest 'Dit schooljaar zijn nog geen nieuwe doelen verplicht'. Dat de leerlingen hun getuigschrift wel op de nieuwe doelen halen, ziet ze alleen op de pagina van één set. Een leerkracht van het 1ste tot 3de leerjaar leest '72 doelen verplicht', zonder dat dit doelen voor het einde van het 4de leerjaar zijn waarvan het net de tussenstappen bepaalt. Zekerheid: zeker (code en spec). **Voorstel:** Voeg opmerkingen (uniek) toe aan VakRegel of aan KlasOverzicht en toon ze onder de lead. Neem de zin uit voorWieTekst over bij L1 tot L3. Neem de opmerking van bubao op in 'Hoe zeker is dit?'. Test: bao L4 2026 geeft de getuigschrifttekst.
- **De doelrijen (DoelRij in de leerlijn en in de zoekresultaten) tonen alleen de doelzin en '+ opsomming (n punten)'. Zo is het doel niet letterlijk en volledig, en de zoektreffer is vaak onzichtbaar.** (ernst middel). Spec: DoelRij en LeerlijnTabel ('letterlijke doelzin, met + opsomming (n punten)'); dezelfde spec zegt 'Geen enkele component kort een doeltekst in'. docs/BASISONDERWIJS.md:111-115 beslist dat elk scherm de volledige tekst heeft (laadSet zet de uitbreiding erachter). Een DoelRij is een link (<a>), dus uitklappen kan er niet in. Mijn tellingen (criticus/verborgen.ts, leerlijn.py): 273 van 998 gewone doelen hebben een uitbreiding (188 met een lijst, 85 alleen voorbeeld of toelichting, daar is 'n punten' 0 of ongedefinieerd). 172 doelzinnen eindigen op een dubbele punt. Op de bevroren zoektoets (66 vragen, prototype van de spec) zit het zoekwoord bij 216 van 641 treffers (34 %) alleen in de uitbreiding of woordenschat, en 44 van de 66 vragen hebben zo'n treffer. Voorbeeld: 'magneet' vindt 92729 (3.5.1). De rij toont 'De kleuters kennen de volgende begrippen met betrekking tot natuurkundige verschijnselen: + opsomming', zonder 'magneet' en dus zonder <mark>. In de leerlijn van 'licht' verdwijnen precies de begrippenlijsten (92729, 92830). Zekerheid: zeker (spec, data); dat '+ opsomming' een vaste markering is en geen knop, volgt uit de link. **Voorstel:** Toon de uitbreiding in de rij: een <details> naast of onder de link, of de volledige tekst in de kaart. In de leerlijn mag dat ingeklapt, maar dan met knoptekst 'Toon de opsomming (11 punten)'. Toon bij een treffer die alleen in de uitbreiding staat het fragment met <mark>. Definieer de markering voor doelen zonder lijst ('met voorbeeld').
- **Zoeken: 'EN over alle woorden, versoepelen alleen bij 0 treffers' verbergt het doel van de schaduwles bij natuurlijke vragen van de proefklas.** (ernst middel). Bron: het prototype dat de spec 'over te nemen' noemt (doel-eerst/zoekBasis.kort.proto.ts, regel 'if (en.length > 0 || vraag.termen.length === 1) return'). De spec herhaalt de regel. Uitvoer van mijn script criticus/zoek-eigen.ts met de stop- en vakwoorden uit de spec en alleen de regel voor schaduw: 'schaduw onderzoeken' geeft 1 treffer, 92509 (4.3.4 'actueel ruimtelijk vraagstuk'); 'schaduw maken' geeft 93024 en 92509; 'lichtbron schaduw' geeft 4. 92767 en 92775/92777 (de onderzoeksdoelen van de Lichtkamer) komen er niet in, en er volgt geen versoepeling want er is al een treffer. Alleen 'schaduw' en '3de leerjaar licht en schaduw' geven 92767 eerst. De acceptatielijst toetst enkel die gevallen. Zekerheid: zeker voor het prototype; waarschijnlijk voor de definitieve code, want de spec beschrijft dezelfde regel. **Voorstel:** Versoepel ook bij weinig treffers (bijvoorbeeld minder dan 3), of toon onder de EN-lijst 'Ook met een deel van je woorden:'. Voeg 'schaduw onderzoeken', 'schaduw maken' en 'licht en schaduw' toe aan de acceptatie en eis 92767 in de top 3 voor einde 4de.
- **De nieuwe echte-gegevenstests (basisIngang.echt.test.ts, zoekwoorden.echt.test.ts, mogelijk doeltekst.test.ts) hebben harde getallen en vallen buiten het alarm van de maandelijkse ophaling.** (ernst middel). Spec: 'describe.skipIf(GEGEVENSRUN)' met 998 id's, 48 onderwerpen, 124 rijen, 322 cellen, 29 leeg, 55 breuken, 14 geneste lijsten, recall ≥ 0,60. De workflow (.github/workflows/minimumdoelen.yml:159-176) zet GEGEVENSRUN=1 en draait daarna enkel src/lib/basis/momentmodel.echt.test.ts in een continue-on-error-stap met rapport. src/lib/minimumdoelenWorkflow.test.ts:762-775 dwingt af dat die stap precies dat ene bestand draait. deploy.yml:33-36 draait 'npm test' zonder GEGEVENSRUN. momentmodel.echt.test.ts:10-17 kent daarom een 'momentopname'-wacht; de spec noemt die niet. Scenario: een maandelijkse data-run wijzigt één doeltekst of voegt een set toe. De PR is groen (de tests slaan over) en niemand krijgt een rapport. Na het samenvoegen staat de uitrol rood en blijft de live site op de vorige versie, tot iemand de getallen aanpast. Staat in doeltekst.test.ts 'de echte html' als lezing uit public/leerplannen zonder wacht, dan blokkeert zo'n wijziging zelfs de hele data-PR (MOMENTMODEL.md:699). Zekerheid: mechanisme zeker; de kans is een vermoeden. **Voorstel:** Volg het patroon van momentmodel.echt.test.ts: verbanden altijd, exacte aantallen en id-lijsten in it.runIf(momentopname). Zet fixtures voor doeltekst.test.ts als tekst in het testbestand. Laat de nieuwe echte tests meelopen in de bestaande continue-on-error-stap, met een bijpassende aanpassing van minimumdoelenWorkflow.test.ts. Zet de drempels voor zoeken (≥ 0,60, ≥ 0,78) niet in de uitrolpoort.
- **Lege secties op de klaspagina vanaf 1 september 2027: de spec beschrijft alleen de lege lijst 'verplicht' (punt 5), niet de lege lijsten 'Mag al' en 'Oude doelen die dit schooljaar nog gelden'.** (ernst middel). Mijn script criticus/scan-klas.ts (setsDieGelden voor alle klassen en schooljaren 2025 tot 2031): bao 2027 geeft K1 tot K3 verplicht 10 / mag 0 / oud 0 en L1 tot L3 9 / 0 / 0; 2029 geeft L5 10 / 0 / 0; vanaf 2030 geldt dat voor alle klassen. De spec zet h2 'Mag al' (punt 6) en h2 'Oude doelen…' (punt 8, 'OPEN in beeld') vast, zonder voorwaarde. De zin 'Tot dan gelden voor deze vakken nog de oude…' blijft dan staan zonder vakken. Tests en rooktest draaien alleen met schooljaar 2026 (klok 2026-11-02, echte test 'bao L3 2026'). Scenario: op 1 september 2027 (over tien maanden) toont de pagina van elke kleuterklas en van het 1ste tot 3de leerjaar twee lege koppen, wat tegen 'één h1, bruikbare kopstructuur' ingaat en verwart. Zekerheid: zeker voor de gegevens; waarschijnlijk voor de weergave (de spec zegt niets over voorwaarden). **Voorstel:** Render 'Mag al' en 'Oude doelen' alleen bij een niet-lege lijst. Test het scherm met schooljaar 2027, 2029 en 2031 en voeg in de rooktest een tweede klok toe. Overweeg een korte zin als 'Alle vakken zijn dit schooljaar verplicht'.
- **De bronvermelding in BasisSchil is hard geschreven en wijkt af van de officiële naamsvermelding. Daarnaast ontbreekt de opgehaald-datum en een weg naar 'Privacy en opslag'.** (ernst laag). Spec: voet 'Bron: Onderwijsdoelen, Vlaamse overheid'. public/leerplannen/minimumdoelen/index.json heeft naamsvermelding 'Bron: Vlaamse overheid, Onderwijs en Vorming (onderwerp onderwijsdoelen.be)' (letterlijk: 'Bron: Vlaamse overheid, Onderwijs en Vorming (onderwijsdoelen.be)') en licentie 'nog te bevestigen'. src/pages/MinimumdoelenPage.tsx:216 en :640 tonen die gegevens met 'opgehaald op'; src/lib/minimumdoelenLeerplan.ts:222 gebruikt ze in de bron van een leerplan. /basis toont de doelen letterlijk op zeven schermen. De licentie is nog niet bevestigd en de spec kiest zelf een andere zin. De spec voegt ook een privacyzin toe aan PrivacyPage, maar de schil heeft geen link ernaartoe. Zekerheid: zeker. **Voorstel:** Haal de naamsvermelding en de ophaaldatum uit de index (zoals MinimumdoelenPage) en toon ze in de voet en op de doelpagina. Voeg 'Privacy en opslag' toe aan de voet. Test dat de tekst uit de index komt.
- **Zoekvragen zonder zoekterm (alleen stopwoorden of alleen een momentwoord) zijn niet gedefinieerd; 'lager' wordt altijd een filter.** (ernst laag). Spec: 'termen = [] met vakken gezet geeft alleenVak'. Voor termen = [] zonder vak staat er niets. Prototype (criticus/zoek-eigen.ts): 'doelen', 'de' en 'kinderen' geven 998 treffers; 'kleuters' 208; 'lager' 790, allemaal ongerangschikt onder een statusregel 'n treffers'. 'lager' is ook een gewoon woord: 'hoger of lager' en 'getallen lager dan' worden gefilterd op L4/L6 en het woord valt uit de termen. Doel 92985 is het enige met het woord 'lager' in de doeltekst (data: rows.json) en ligt in de kleuterklas, dus het wordt niet gevonden. Zekerheid: zeker voor het prototype. **Voorstel:** Bij termen = [] zonder vak: toon hulp ('typ een woord') of, bij een momentwoord, een link naar het momentscherm. Lees 'lager' alleen als moment bij 'lager onderwijs' of 'lager' als enige woord. Voeg de gevallen toe aan zoekBasis.test.ts.
- **De soortkeuze (gewoon of buitengewoon) kan niet gewijzigd worden op de leerlijn-, vak- en doelschermen, en de nav-links 'Doelen' en 'Leerlijnen' hebben zonder bewaarde keuze geen gedefinieerd doel.** (ernst laag). Spec: 'een momentschakelaar en een soortschakelaar' alleen bij MomentScherm. De routes /basis/leerlijn/:soort en /basis/vak/:soort/… hebben geen schakelaar. Voor buitengewoon verschilt de weergave wel (alles 'na te streven', andere sets), en een leerkracht zonder bewaarde klas die via de navigatie komt, krijgt een soort zonder dat ze die koos. Zekerheid: zeker (de spec zegt het niet); gevolg laag. **Voorstel:** Zet dezelfde soortschakelaar in de koppen van leerlijn en vak, en definieer wat de nav doet zonder bewaarde keuze (standaard 'gewoon', met een zichtbare schakelaar).
- **De naam 'klas' botst met wat in deze fase nog volgt (bouwstap 4): route /basis/klas/…, KlasScherm, klasOverzicht.ts en de titel 'Mijn klas' zijn straks dubbelzinnig.** (ernst laag). docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md plant een klaslijst per klas (pakket 4, 9, 12), 'KlasoverzichtBasis.tsx', 'overzicht.ts' en 'wf.bewijs.v1.<klasId>'. In de app is src/lib/paginaTitel.ts al 'Mijn klas' voor /leerling en /klas/open (de kant van de leerling). De spec weet het van de opslagsleutel ('bevat bewust niet klas'), maar niet van de URL en de bestandsnamen. De URL is bedoeld om te delen ('Een gedeelde link overschrijft niets'). Een hernoeming breekt dan gedeelde links. Zekerheid: vermoeden (toekomst), de botsing in de documenten is aantoonbaar. **Voorstel:** Noem het deel 'leerjaar': /basis/leerjaar/…, LeerjaarScherm, leerjaarOverzicht.ts, titel 'Mijn leerjaar'. Houd 'klas' vrij voor de echte klas met kinderen.
- **De URL's per vak hangen af van een sleutel die uit de API-naam komt.** (ernst laag). De spec leidt vakSlug af uit INVOERINGSKALENDER.vakken[].sleutel (kalender.ts: 'korteNaam zonder accenten, kleine letters'; nu 'wetenschap en techniek' op regel 262-achtige vaktabel). De kalender verandert volgens zijn eigen ontwerp bij elke wijziging van de API (MOMENTMODEL.md:652), en de oude sets heten 'Wetenschappen en techniek' (MOMENTMODEL.md:703). Een naamswijziging maakt alle gedeelde links /basis/vak/…/wetenschap-en-techniek en de leerlijnlinks 'onbekend'. Zekerheid: vermoeden. **Voorstel:** Een vaste tabel nr naar slug in basisRoutes.ts (het vaknummer, de eerste cijfers van de code, is stabiel), met een test die de 10 slugs vastlegt en niet uit de kalender haalt.
- **Kleine inconsistenties met bestaande bestanden en documenten.** (ernst laag). (1) De cssregel 'elke selector in basis*.css begint met :root[data-deel='basis'] of .b-' en de test erop botsen als ze globben met src/styles/basis-moment.css, dat al bestaat en 57 regels met .md-wanneer… heeft. (2) docs/BASISONDERWIJS.md:56-57 beweert dat de rubrieken 'per vak op elk moment dezelfde' zijn. Dat klopt op onderwerp (35 van 35 in de negen vakken met drie momenten), maar niet op subthema (mijn telling: 67 van 92 op drie momenten, 25 missen er één) en niet voor ICT en Frans. P15 zegt niet dat dit wordt rechtgezet. (3) [F] en [I] worden <abbr>. De uitleg ('feitelijke' en 'inzichtelijke' kennis) is volgens BASISONDERWIJS.md:58-59 'waarschijnlijk', en [I/F] staat nergens in de docs; een title-attribuut werkt niet op toetsenbord of touch. (4) ZOEKWOORDEN.vak en .stop staan in de spec zelf en lopen niet door de keten inhoudschrijver, nakijker en rechter van P5 (enkel .ook). **Voorstel:** Beperk de csstest tot de bestanden die de bouw maakt (basis.css, basis-klas.css, …) of sluit basis-moment.css uit. Corrigeer BASISONDERWIJS.md:56-57 in P15. Zet de uitleg van [F]/[I] als zichtbare tekst met zekerheid, niet als title. Laat vak en stop door P5 lopen.

### Nagerekend en juist

- Klasuitkomsten kloppen (criticus/tabel.ts, eigen run van setsDieGelden): bao L3 2026 geeft verplicht ODS_3395 (72), ODS_3406 (122), ODS_3408 (44) = 238 doelen; mag al 6 sets/130 doelen vanaf 2027; geldt nog 7 sets/185 doelen (ODS_2108, 2109, 2111, 2114, 2115, 2116, 2117); nieuw totaal 368 doelen in 9 vakken. K2: NL 35+7, WI 47+12, W&T 21 (zeker); mag al ODS_3411/3414/3425 (waarschijnlijk) en ODS_3417/3420 (zeker); oud ODS_2102, 2103, 2107. L5: verplicht 0, mag al 10 sets/422, oud 10 sets/331. bubao L3: onzeker, 22 oude sets/1043 doelen, ODS_2959 als lege set.
- De invariant over 126 klassen (rechter/invariant.ts, opnieuw gedraaid): 0 afwijkingen. zonderNieuweSet: bao en bubao K3 'ICT, Frans', L4 'Frans', L6 'geen'.
- Leerlijn (criticus/leerlijn.py op de ruwe setbestanden, bao en bubao): 998 unieke id's per soort; rubriek 1 is altijd onderwerp (998), rubriek 2 altijd subthema (944); 48 onderwerpen zonder naamconflict; 124 rijen; 322 cellen waarvan 29 leeg (de vakken ICT en Frans tellen enkel de momenten met een set; 372 met alle drie de momenten); grootste cel 15. De splitsing van de uitbreiding (tekst eindigt op '\n'+uitbreiding.trim()) werkt bij 273 van 273 doelen; geen enkel doel heeft de uitbreiding al in de tekst.
- Zoektoets: sha256 4671c4c7… klopt en de toets is deterministisch te herbouwen (maak-zoektoets.ts gaf dezelfde hash). Cijfers reproduceren: nu recall 0,45 / P@3 0,73 / 14 vragen zonder treffer; prototype 0,62 / 0,82 / 6. 'schaduw' geeft 92767 eerst bij '3de leerjaar', 92730 bij kleuters en 92833 bij '6de leerjaar'.
- Doeltekst (rechter/doeltekst-check.ts opnieuw gedraaid): 0 overgebleven tags, enkel 93407 houdt '<' of '>', 55 breuken, 14 doelen met geneste lijsten, 3 beelden, 6 links, 159 voorbeelden, 18 toelichtingen, 152 kennislabels. Het langste ondeelbare woord is 24 tekens, de langere tokens hebben koppeltekens of een schuine streep: geen horizontaal scrollen te verwachten bij 1,35rem op 390 px.
- Contrast (criticus/contrast2.ts met contrastRatio uit src/lib/color.ts): met de tokens uit de spec haalt elke combinatie van tekst, zachte tekst, vage tekst, brand, brand-strong, accent, ok, warn, err, ok-text, warn-text en err-text op bg, bg-raised, bg-sunken, brand-soft, lamp-soft en de drie statusvlakken minstens 4,5:1, in licht en donker. Wit op brand-fill, brand-fill-strong, accent-fill, ok-strong en err-strong haalt 5,49 tot 7,94. Lampgeel is nergens tekst. Randen van invoervelden (line-strong) halen 3,50 op wit en 3,12 op bg; op bg-sunken (2,87) en brand-soft (2,93) niet, maar .input heeft zelf bg-raised (global.css:306-310).
- Techniek: alle 12 Lucide-namen bestaan in lucide-react 1.48.0 (School, Lamp, BookOpen, Calculator, FlaskConical, Earth, Landmark, Palette, PersonStanding, Monitor, HeartHandshake, Languages). tsconfig heeft resolveJsonModule en vitest neemt alleen src/**/*.test.ts, zoals de spec veronderstelt. De lade van Layout gebruikt dezelfde lijst 'more' als de desktop, dus één nieuw item volstaat. smoke.mjs:5527-5532 (End op Thema) blijft geldig als het item vóór Thema staat, en de twee zinnen op .md-intro (smoke.mjs:780) blijven bestaan. moment.test.ts:1129-1139 bewaakt alleen wat moment.ts importeert; de spec raakt moment.ts niet. De bouwproeven in bouwproef/build-H.log en doel-eerst/build-3-echt-gebruik.log geven 334,8 en 334,9 kB met vendor 169,20 kB, zoals de spec zegt.
- Doelpagina: doel 92767 staat in ODS_3408 (populatie) en in ODS_3469 (na te streven); tweelingSets werkt in beide richtingen, dus ODS_3485 geeft ODS_3397 en ODS_3401. De vakslugs (nederlands, wiskunde, wetenschap-en-techniek, … frans) kloppen met de sleutels van de kalender.
