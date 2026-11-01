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
| Proefrun met een ruimere filter. De eerste run stopte op een doel dat onder twee rubrieken hangt; het script bewaart zo'n doel nu één keer (commit 166ef73). De tweede run slaagde: 146 nieuwe sets, data-PR #11 | **Klaar**, PR #11 **niet samenvoegen** zonder teken van de eigenaar | hoofdsessie; eigenaar beslist over PR #11 |
| Wat de bron bevat (§ "Wat de bron bevat") | **Nagekeken** (1 november 2026) | hoofdsessie |
| Beslissingen: kleuter, lager en buitengewoon lager (**ja**); content voor de scholengroep en haar scholen (**ja**); lesplannen van het GO!: de eigenaar heeft een akkoord; na te gaan of dat ook een openbare website en repo dekt | Grotendeels **klaar**; de reikwijdte van het akkoord **wacht** | eigenaar |
| Antwoorden voor het ontwerp: digibord en vooral Chromebooks; resultaten per kind, alleen lokaal; eerste proef **wetenschap en techniek**; eerste gebruikers zowel de klasleerkracht als de makers in de scholengroep. Het voxeldorp is niet de richting | **Klaar** (1 november 2026) | eigenaar |
| Ontwerp: hoe een interactieve omgeving aan een eindterm hangt (§ "Ontwerp: een oefening aan een eindterm hangen") | **Klaar** (1 november 2026) | hoofdsessie |
| Werkend voorbeeld "Lichtkamer" (W&T, leerlijn licht, drie momenten, 8 oefeningen in 3D-diorama's). Review met 43 bevestigde bevindingen, allemaal opgelost en nagekeken. Bron in `tools/prototypes/lichtkamer/` | **Klaar** (1 november 2026), ter beoordeling bij de eigenaar | eigenaar |
| Tweede ronde antwoorden: overal 3D (op Chromebooks lichter); stijl "diorama met details, zonder te veel afleiding, mag opvallen op een groot digibord"; de zaklamp wijst waar het licht heen gaat; proefklas **3de leerjaar, schaduwles** | **Klaar** (1 november 2026) | eigenaar |
| Open vragen (§ "Open vragen voor de eigenaar"): accounts op de Chromebooks en werk inleveren, wat met het bewijs per kind, openbaarheid van de pakketten en de inhoud van het GO! | **Wacht** | eigenaar |
| Bouw in de app (§ "Bouwstappen"): begint pas na het oordeel over het voorbeeld en het teken voor PR #11 | **Wacht** | eigenaar, daarna hoofdsessie |

## Wat de bron bevat (proefrun van 1 november 2026)

- **Drie momenten**, elk met eigen sets: Kleuteronderwijs (einde derde kleuterklas), Lager Onderwijs 4de leerjaar en
  6de leerjaar. Er is geen moment op het einde van het 2de leerjaar; de tussenstappen per leerjaar legt het leerplan van het net vast.
- **Tien vakdisciplines**, met het nummer als eerste cijfer van de code: 1 Nederlands, 2 Wiskunde, 3 Wetenschap en techniek,
  4 Aardrijkskunde, 5 Geschiedenis, 6 Muzische vorming, 7 Lichamelijke opvoeding, 8 ICT (vanaf het 4de), 9 Attitudes,
  10 Frans (alleen het 6de). Gewoon onderwijs: 998 doelen (kleuter 208, 4de 368, 6de 422), sets ODS_3395 tot ODS_3428.
- **Drie soorten doelen**: "te bereiken op populatieniveau" (4de en 6de, en in de kleuterklas 7 doelen Nederlands en
  12 wiskunde), "te bereiken op individueel niveau" (alleen 6de leerjaar Nederlands en wiskunde: elk kind) en
  "na te streven op populatieniveau" (de rest van de kleuterdoelen).
- **Buitengewoon basisonderwijs**: eigen sets (ODS_3456 tot ODS_3485) met **dezelfde doelen** (zelfde id en tekst), maar
  telkens "na te streven". De oude ontwikkelingsdoelen per type staan er nog, met einddata.
- **De codes lopen niet door** tussen de momenten: 2.1.1 is in de kleuterklas iets anders dan in het 4de. Een leerlijn
  volg je via de rubrieken (`extra.titels`: onderwerp en subthema), die per vak op elk moment dezelfde zijn.
- **Vorm**: de tekst is HTML en loopt soms verder in `extra.uitbreiding_op_doelzin` (de opsomming na een dubbele punt). In
  wiskunde staat [F] (feitelijke kennis) of [I] (inzichtelijke kennis) in de tekst (waarschijnlijk, memorie van toelichting).
- **Invoering in twee golven** (einddata van de oude sets in de API; de kalender zelf komt uit secundaire bronnen):
  Nederlands, wiskunde en wetenschap en techniek eerst (kleuter oud tot 31-08-2026, lager oud tot 31-08-2028); de rest daarna
  (kleuter oud tot 31-08-2027, lager oud tot 31-08-2030). De app moet dus tonen **welke doelen nu gelden** voor welk leerjaar.
- **GO!**: een nieuw leerplan basisonderwijs in GO! navigator (sinds 29 juni 2026). De lesfiches heten nu lesplannen (één A4
  per lesuur); een eerste reeks van ruim 110 lesplannen **wetenschap en techniek** komt vanaf 9 november 2026 in GO! studio
  (waarschijnlijk, berichten van het GO!).
- Open: de officiële invoeringstabel per leerjaar (vlaanderen.be was niet bereikbaar vanuit de sessie), de licentie van de API,
  en de reikwijdte van het akkoord met het GO!.

## Ontwerp: een oefening aan een eindterm hangen (1 november 2026)

**Bewijs eerst.** Per minimumdoel leggen we eerst vast welke handeling een kind toont als het doel bereikt is (de
kernhandeling), welke fouten typisch zijn en hoe de oefening dat bewijs vastlegt, met het id van het doel erbij. De
3D-omgeving maakt die handeling mogelijk (voorspellen, verzetten, meten, sorteren); ze is geen versiering. Op het
digibord voorspelt de klas eerst en ziet ze pas daarna de uitkomst. Geen punten, geen mascotte, wel voorlezen en een
prikkelarme stand.

**Het voorbeeld: Lichtkamer** (W&T, leerlijn licht, dezelfde rubriek op de drie momenten). Elk moment heeft een eigen
diorama: een poppenhuis voor de kleuters, een schaduwtheater voor het 4de, een labo voor het 6de.

| Moment | Oefening | Doelen (code, id) | Bewijs |
|---|---|---|---|
| Einde kleuter | Wie maakt licht? | 3.5.2 (92730), 3.5.1 (92729) | lichtbronnen aanzetten, spiegel en bal niet |
| Einde kleuter | Breng licht bij de beer | 3.5.2 (92730), 3.6.2 (92735) | spiegel draaien tot het licht bij de beer komt; kringgesprek (de leerkracht duidt aan) |
| Einde kleuter | Grote en kleine schaduw | 3.6.1 (92734), 3.5.1 (92729) | schaduw groot en daarna klein maken |
| 4de leerjaar | Drie kaartjes met een gaatje | 3.5.4 (92767) | gaatjes en lamp op één rechte lijn zetten |
| 4de leerjaar | Waar valt de schaduw? | 3.5.4 (92767) | in drie rondes voorspellen, daarna de stralen tonen |
| 4de leerjaar | Onderzoek: lamp dichterbij, schaduw groter? | 3.6.3 (92775), 3.6.4 (92777) | hypothese, drie metingen op de meetlat, conclusie |
| 6de leerjaar | Stoffen in de lichtstraal | 3.5.4 (92833) | voorspellen met 10 lichtbolletjes, meten, sorteren |
| 6de leerjaar | Welk gordijn houdt het meeste licht tegen? | 3.5.7 (92836), 3.6.4 (92849) | onderzoek opzetten (één ding veranderen), meten, herhalen, besluiten |

Elk pakket heeft dezelfde vaste delen:

- **Doel**: de letterlijke doeltekst met code en id, een zin in kindertaal, "zo zie je dat het lukt" en dezelfde
  leerlijn op de andere momenten. Bij het 4de staat erbij dat een 3de leerjaar naar deze doelen toe werkt.
- **Oefeningen** in 3D, altijd ook te bedienen met knoppen en het toetsenbord. Elke stand van de scène wordt in tekst
  beschreven.
- **Digibordstand**: groter, met een klasvraag (stemmen per letter of nummer). Het bord toont geen namen en bewaart niets.
- **Check** met korte vragen en een **klasoverzicht** per kind: per doel "toont het", "nog wankel" of "nog niet", alleen in
  de browser.
- **Lesverloop** voor de leerkracht, met de lesduur en de verwijzing naar de oefeningen.

**Techniek van het voorbeeld.** three.js r128 van de CDN, met gloed alleen op het digibord en lichter op Chromebooks (geen
gloed, geen stofjes in de lichtbundel). Werkt de 3D niet, dan blijven de doelen, de check, het klasoverzicht en het
lesverloop bruikbaar. Bron en rooktest: `tools/prototypes/lichtkamer/`. Het voorbeeld is gepubliceerd als privé artifact
van de eigenaar; de eigenaar beslist met wie het gedeeld wordt.

### Bouwstappen (voorstel, wacht op de eigenaar)

1. PR #11 samenvoegen (teken van de eigenaar): de doelen van het basisonderwijs in de app.
2. De volledige doeltekst (met `extra.uitbreiding_op_doelzin`) en een momentmodel: kleuter, 4de, 6de, en welke doelen nu
   gelden per leerjaar (de invoering in twee golven).
3. Een aparte ingang voor het basisonderwijs met een eigen vormgeving.
4. Het lichtmodel en het bewijsmodel als geteste code (schaduwpunt, kaartjes, stoffen; bewijs per doel-id).
5. Een oefeningsoort "lichtkamer" in de app, met de digibordstand.
6. De proefklas: 3de leerjaar, de schaduwles, met een spiekkaart voor de leerkracht.
7. Een controlepoort voor nieuw materiaal van de scholengroep, zoals bij de leerplannen.

### Open vragen voor de eigenaar

- **Chromebooks**: werken de kinderen met een eigen account, of via een QR-code of klascode? Hoe komt hun werk bij de
  leerkracht?
- **Bewijs per kind**: blijft het bij bekijken in de klas, of moet het ook naar buiten (een export, het rapport, een
  leerlingvolgsysteem)?
- **Openbaarheid**: mogen de pakketten van de scholengroep in de openbare repo en op de openbare site? En dekt het akkoord
  met het GO! ook de inhoud van de lesplannen op een openbare site?

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
