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
| Proefrun met een ruimere filter. De eerste run stopte op een doel dat onder twee rubrieken hangt; het script bewaart zo'n doel nu één keer (commit 166ef73). De tweede run slaagde: 146 nieuwe sets, data-PR #11 | **Klaar**; PR #11 **samengevoegd** op 2 november 2026 (dedda2f): 1096 sets in de app | hoofdsessie |
| Wat de bron bevat (§ "Wat de bron bevat") | **Nagekeken** (1 november 2026) | hoofdsessie |
| Beslissingen: kleuter, lager en buitengewoon lager (**ja**); content voor de scholengroep en haar scholen (**ja**); lesplannen van het GO!: de eigenaar heeft een akkoord; na te gaan of dat ook een openbare website en repo dekt | Grotendeels **klaar**; de reikwijdte van het akkoord **wacht** | eigenaar |
| Antwoorden voor het ontwerp: digibord en vooral Chromebooks; resultaten per kind, alleen lokaal; eerste proef **wetenschap en techniek**; eerste gebruikers zowel de klasleerkracht als de makers in de scholengroep. Het voxeldorp is niet de richting | **Klaar** (1 november 2026) | eigenaar |
| Ontwerp: hoe een interactieve omgeving aan een eindterm hangt (§ "Ontwerp: een oefening aan een eindterm hangen") | **Klaar** (1 november 2026) | hoofdsessie |
| Werkend voorbeeld "Lichtkamer" (W&T, leerlijn licht, drie momenten, 8 oefeningen in 3D-diorama's). Review met 43 bevestigde bevindingen, allemaal opgelost en nagekeken. Bron in `tools/prototypes/lichtkamer/` | **Klaar** (1 november 2026), ter beoordeling bij de eigenaar | eigenaar |
| Tweede ronde antwoorden: overal 3D (op Chromebooks lichter); stijl "diorama met details, zonder te veel afleiding, mag opvallen op een groot digibord"; de zaklamp wijst waar het licht heen gaat; proefklas **3de leerjaar, schaduwles** | **Klaar** (1 november 2026) | eigenaar |
| Derde ronde antwoorden: een **eigen account pas vanaf de 2de graad** (3de leerjaar), daaronder hangt het af van de leeftijd; de pakketten **mogen openbaar** | **Klaar** (1 november 2026) | eigenaar |
| Ontwerp: hoe een kind zich aanmeldt en hoe zijn werk bij de leerkracht komt, per leeftijd (§ "Aanmelden en inleveren per leeftijd"): drie ontwerpen, twee rechters, één model met 16 bouwpakketten | **Klaar** (1 november 2026); de vier vragen zijn beantwoord (2 november 2026) | eigenaar |
| Vierde ronde antwoorden: bewijs per kind naar buiten **mag later**, maar is nu niet cruciaal; "openbaar" geldt **ook voor de lesplannen van het GO!**; PR #11 **samenvoegen**; de Lichtkamer is goed qua detail en opzet en is **het minimum** voor nieuwe pakketten | **Klaar** (2 november 2026) | eigenaar |
| Vóór PR #11: de app deelde "Buitengewoon Lager/Kleuteronderwijs" in bij het buitengewoon secundair, zodat die sets in de keuzelijsten van het secundair zouden opduiken. Hersteld (1c1c032): twee eigen soorten, "Basisonderwijs" en "Buitengewoon basisonderwijs", alleen te zien op de pagina "Officiële minimumdoelen" (of op hun nummer); samenstellen, de inleeswizard en de keuzes in de editor blijven voor het secundair zoals ze waren. Opvolgers van oude basissets houden rekening met het moment en het type; een leerplan uit een basisset krijgt moment en soort doelen in de titel | **Klaar** (2 november 2026), nagekeken door twee reviewers en de rechter | hoofdsessie |
| De maandelijkse ophaling (de 3de van de maand) filtert standaard nog op "secundair": de 146 basissets worden wel bijgewerkt, maar een nieuwe set van het basisonderwijs (de tweede golf van de minimumdoelen) komt er niet vanzelf bij. De standaardfilter verruimen hoort bij bouwstap 2 | **Wacht** | hoofdsessie |
| Vijfde ronde antwoorden: het toestel van de leerkracht is een **Windows-laptop**, naast het digibord; de proef met de ICT-coördinator **mag**; voornamen op de gedeelde toestellen van de 1ste graad **mogen**; voor de geluidjes **zorgt de eigenaar** zodra de rest klaar is | **Klaar** (2 november 2026) | eigenaar |
| Ontwerp van het momentmodel (bouwstap 2b): welke doelen gelden nu voor welk leerjaar (K1 tot L6) in welk schooljaar, met de invoering in twee golven. Spec in `docs/basisonderwijs/MOMENTMODEL.md`: een kalender als gegevens (36 cellen, met bron en zekerheid per cel), zuivere functies in `src/lib/basis/` en één blok "Wanneer gelden deze doelen?" op de pagina Officiële minimumdoelen. Alleen de kleuterklassen zijn **zeker** (uit de einddata van de API); het lager staat op **waarschijnlijk** (zoekfragmenten; geen officiële pagina was bereikbaar), het buitengewoon lager op **onzeker** | **Klaar** (2 november 2026); twee beslissingen wachten | eigenaar |
| Bouw van het momentmodel: kalender, model en het blok "Wanneer gelden deze doelen?" bij elke set van het basisonderwijs op de pagina Officiële minimumdoelen. De maandelijkse ophaling wordt er nooit door tegengehouden: een afwijking van de kalender komt als waarschuwing in de pull request. Nagekeken door een nakijker, drie reviewers en twee rechters | **Klaar** (2 november 2026); stand na de bouw bovenaan `docs/basisonderwijs/MOMENTMODEL.md` | hoofdsessie |
| Toestelproef (bouwpakket 1): een losse proefpagina voor de proef met de ICT-coördinator. Op de Windows-laptop leest de scanner met jsqr, want Chrome en Edge op Windows hebben geen BarcodeDetector (waarschijnlijk; de proef bevestigt het). Online op https://thomasteamict.github.io/Boosterz/proef/toestelproef.html; bron en checklist in `tools/prototypes/toestelproef/`. Acht QR-codes (versie 3, 6, 7 en 10, op 6 en 8 px), een scanner met camerakeuze, de stemmen, een opslagmerkje en een knop "Kopieer de uitslag". Nagekeken door twee reviewers en de rechter (16 bevindingen, 8 bevestigd en opgelost) | **Klaar** (2 november 2026) | hoofdsessie |
| Proef op echte schooltoestellen (bouwpakket 2): een Chromebook van de 1ste graad, een Chromebook van het 3de leerjaar, de Windows-laptop van de leerkracht en het digibord | **Wacht** op de toestelproef, daarna op een afspraak met de ICT-coördinator | eigenaar en hoofdsessie |
| Bouw in de app (§ "Bouwstappen"): het voorbeeld is goedgekeurd en PR #11 mag samengevoegd worden | **Kan verder**: stap 1 en 2 zijn klaar; stap 3 (de eigen ingang voor het basisonderwijs) is de volgende | hoofdsessie |

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

### Bouwstappen (voorstel; stap 1 is klaar)

1. PR #11 samenvoegen: de doelen van het basisonderwijs in de app. **Klaar** (2 november 2026). Bewust nog niet gedaan, voor
   het eigen deel: een filter per moment, een tweelingregel voor gewoon en buitengewoon op doel-id, en "Geldig tot".
2. De volledige doeltekst (met `extra.uitbreiding_op_doelzin`) en een momentmodel: kleuter, 4de, 6de, en welke doelen nu
   gelden per leerjaar (de invoering in twee golven). De volledige doeltekst is **klaar** (2 november 2026): bij 546 doelen
   in 49 sets staat een deel van het doel apart in de bron (de lijst achter "kennen de volgende begrippen:", voorbeelden
   tussen "< bv. … >"). `laadSet` zet die letterlijk achter de doelzin, zodat elk scherm, het leerplan en het nakijken
   dezelfde volledige tekst hebben. Het momentmodel is **klaar** (2 november 2026, `docs/basisonderwijs/MOMENTMODEL.md`).
3. Een aparte ingang voor het basisonderwijs met een eigen vormgeving.
4. Het lichtmodel en het bewijsmodel als geteste code (schaduwpunt, kaartjes, stoffen; bewijs per doel-id).
5. Een oefeningsoort "lichtkamer" in de app, met de digibordstand.
6. De proefklas: 3de leerjaar, de schaduwles, met een spiekkaart voor de leerkracht.
7. Een controlepoort voor nieuw materiaal van de scholengroep, zoals bij de leerplannen.

### Open vragen voor de eigenaar

- **Chromebooks** (beantwoord, 1 november 2026): "Afhankelijk van de leeftijd, pas vanaf 2 graad eigen account." Kleuters
  en de 1ste graad hebben dus geen eigen account; vanaf het 3de leerjaar wel. Hoe het werk bij de leerkracht komt, werkt de
  hoofdsessie uit (zie de stand van zaken).
- **Openbaarheid** (beantwoord, 1 en 2 november 2026): "ja mag openbaar", "ja ook voor lesplannen". De pakketten van de
  scholengroep én de lesplannen van het GO! mogen in de openbare repo en op de openbare site.
- **Bewijs per kind** (beantwoord, 2 november 2026): "Ja per kind mogelijk maar nog niet cruciaal nu". Een export per kind
  komt later; het ontwerp houdt er rekening mee (klasbestand, geen namen in codes), maar bouwt het nu niet.
- **Kwaliteit** (2 november 2026): "detail en opzet [Lichtkamer] is goed, dit moet zowat de minimum zijn". De Lichtkamer
  is de ondergrens voor nieuwe pakketten: een diorama met details, voorspel eerst, bewijs per doel, digibordstand,
  voorlezen, prikkelarm en bediening zonder muis.

## Aanmelden en inleveren per leeftijd (ontwerp, 1 november 2026)

Vertrekpunt is het antwoord van de eigenaar: een eigen account pas vanaf de 2de graad, en de pakketten mogen openbaar. Dit ontwerp gebruikt wat de app al heeft (klaslijst, Inleverpunt, scanner, QR-code) en bouwt alleen bij wat nodig is. Twee rechters kozen het uit drie ontwerpen: het "hoektoestel", met de beste delen van de andere twee erbij.

**De kern.** De laptop van de leerkracht is de bron: daar staan de namen, al het bewijs en het overzicht per doel. Elk ander toestel is een buffer. Het kent een kind alleen als kindcode (2 tekens, vast voor het hele jaar, niet het klasnummer) met een prentje. Het levert zijn bewijs in met één korte bewijscode op het bestaande Inleverpunt. Er is geen server en geen account in Boosterz.

**Per leeftijd.** De leerkracht kiest de stand van een toestel met de link die ze uitdeelt; de app raadt geen leeftijd. Of er voorgelezen wordt en of er voornamen staan, hangt af van de klasinstelling "leest nog niet" of "leest". Zo kan ook het buitengewoon lager mee.

| | Kleuter en 1ste graad | Vanaf het 3de leerjaar | Digibord |
|---|---|---|---|
| Toestel | gedeeld klastoestel in een hoek | eigen Chromebook met eigen account | laptop van de leerkracht |
| Wie werkt? | prentje aantikken op de muur (tegels van minstens 96 px, opgenomen geluid) en dan "Ja, dat ben ik": 2 tikken, 3 in duo | één keer de eigen naam tikken | "Wie komt?" en het prentje, alleen voor een beurt |
| Hoe lang | alleen in het geheugen: terug naar de muur na elke oefening, na "Ik ben klaar", na herladen en na "Ben je er nog?" (2 + 1 min, instelbaar) | het profiel onthoudt het; "Niet jij?" gaat naar de muur, nooit naar een vrije naam | één oefening |
| Namen op het toestel | bij de kleuters nooit; in de 1ste graad mag het (eigenaar, 2 november 2026): de leerkracht zet ze aan, standaard aan bij "leest" | voornamen van de klas | nooit |
| Inleveren | "Voor de juf of meester" na elke hoekenronde, ook door de klasdienst (±20 s per toestel) | "Lever in" op het einde van de les (±6 s per kind) | niet nodig |

**De bewijscode WB1.** De code bevat alleen hoofdletters, cijfers en `. / - *`, en nooit een naam. Erin staan de klascode, het toestel, de bundel, het deel en de dag, en per kind de kindcode, het uur en per bewijs een nummer met de uitkomst. Op het einde staat een controle van 2 tekens.

Een QR-code is hoogstens versie 10 (395 tekens bij foutcorrectie L, zoals in CodeQr) en staat op 8 px per module. Wat groter is, wordt opgesplitst in delen die elk op zich geldig zijn. Gemeten met qrcode 1.5.4:

- 1 kind met 7 bewijzen: 55 tekens, versie 3;
- 8 kinderen: 221 tekens, versie 7;
- 12 kinderen: 341 tekens, versie 10;
- een klas van 25 op één toestel: 2 delen.

De toestelkaart WK1 (zonder namen) is 127 tekens voor 25 kinderen, versie 5. Voornamen reizen alleen in de link, nooit in een QR-code.

**Er gaat niets stil verloren.**

- Een code bevat alles wat de leerkracht nog niet ontving. Opnieuw scannen geeft "al aanwezig", en een gemiste scan komt met de volgende code mee.
- Het Inleverpunt toont als ontvangstteken twee prentjes, en het toestel vraagt welke (gokken lukt 1 keer op 16). Pas dan valt dat bewijs uit de volgende code. Gewist wordt er niets.
- Wissen en afsluiten staan achter een drempel (de klascode typen) en kunnen pas als alles ontvangen is.
- Elke schrijfactie wordt nagekeken.
- Op een gedeeld toestel staat altijd "Nog niet bij de juf of meester: N kinderen". Duidde de leerkracht aan dat het toestel alles vergeet bij afmelden, dan verschijnt die melding groot na elke beurt.
- Zonder camera kan het met kopiëren en plakken, of met een bestand.

**Digibord.** Standaard staat "Op het bord" aan: geen namen, geen inleverknop, en niets bewaard (ook niet in cursusblokken en leesvoortgang). Een beurt aan het bord gaat meteen naar de leerkracht, met een badge in beeld. Het overzicht met namen opent pas na de vraag of het scherm geprojecteerd wordt.

**Privacy.** Namen staan alleen bij de leerkracht: een voornaam, nooit een achternaam of foto. De pakketten zijn openbaar en staan los van de klaslijst. three.js komt in de eigen bundel (bouwstap 5), niet van een CDN. Bij de leerkracht komen een klasbestand als back-up (met een herinnering elke week), "Wis deze klas" en een bewaartermijn tot het einde van het schooljaar (voorstel). Er komt ook een korte tekst voor de GEB van de school. De school blijft verwerkingsverantwoordelijke.

**Bouwpakketten.** Eerst wat de proefklas van het 3de leerjaar nodig heeft, daarna de gedeelde toestellen. De volledige spec per pakket, de harde eisen van de rechters en de risico's staan in `docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md`.

1. Toestelproef: een losse proefpagina met QR-codes van versie 3, 6 en 10 op 6 en 8 px, een scanner met camerakeuze, de stemmen en een opslagmerkje (bouwer).
2. Proef op echte schooltoestellen met de ICT-coördinator; de uitkomst legt de grenzen van de codes vast (hoofdsessie).
3. Het bewijsmodel als geteste code (bouwstap 4): regels, samenvoegen, status per doel en pakketversies (kernbouwer).
4. De klaslijst voor het basisonderwijs: kindcode, prentje, kleur, klasinstelling en de prentenset (bouwer).
5. De codes WB1 en WK1, met controle, delen en grenzen (bouwer).
6. Scanner en QR-code voor een webcam: camerakeuze, gespiegeld beeld, groot kader en 8 px per module (bouwer).
7. Het Inleverpunt neemt bewijs aan; bewijsopslag bij de leerkracht, met het ontvangstteken (kernbouwer).
8. De buffer en de stand van het toestel, en één functie die zegt of er bewaard mag worden (kernbouwer).
9. Toestellinks en klasinstellingen bij de leerkracht (bouwer).
10. Eigen toestel vanaf het 3de leerjaar: naam kiezen, "Lever in" en "Wat ik al kan" (bouwer).
11. Een bordweergave die niets bewaart, en een beurt aan het bord (bouwer).
12. Het overzicht per doel, verplaatsen en "Ik zag het" (bouwer).
13. Klasbestand, wissen, bewaartermijn en privacytekst (kernbouwer).
14. Het gedeelde klastoestel voor de kleuters en de 1ste graad (bouwer).
15. De inspreeklijst: prentnamen en vaste zinnen in kindertaal (inhoudschrijver).
16. Voorlezen met opgenomen geluid (bouwer).

Na pakket 13 kan de proefklas starten, samen met bouwstap 5 (de Lichtkamer als oefeningsoort).

**Antwoorden van de eigenaar (2 november 2026):** "Toestel lkr is Windows laptop en digibord, proef ja, voornamen ja,
geluidjes zorgen we verder voor eens we rond zijn."

- Het toestel van de leerkracht is een **Windows-laptop**, naast het digibord. De scanner van het Inleverpunt leest daar met
  jsqr, want Chrome en Edge op Windows hebben geen BarcodeDetector (waarschijnlijk; de toestelproef bevestigt het). De proef
  kijkt ook of de laptop het digibord aanstuurt of dat er een apart toestel aan het bord hangt, en of de webcam vlot leest.
- De **proef met de ICT-coördinator** mag. Eerst komt de toestelproef (bouwpakket 1).
- **Voornamen** op de gedeelde toestellen van de 1ste graad mogen. De leerkracht zet ze aan per klas (standaard aan bij
  "leest"). Bij de kleuters blijven ze weg; in codes staan nooit namen.
- Voor de **geluidjes** zorgt de eigenaar zodra de rest klaar is. Wij leveren de inspreeklijst (bouwpakket 15); tot de
  opnames er zijn, dient de stem van het toestel of blijft het stil (bouwpakket 16).

**Wat we vonden over Chromebooks** (webonderzoek, 1 november 2026; de hulppagina's van Google voor beheerders waren vanuit
de sessie niet bereikbaar, dus de proef van pakket 2 bevestigt dit):

- Een **beheerde gastsessie** wist bij het afmelden alle lokale gegevens, ook die van websites (zeker). Wat daar niet
  ingeleverd is, is weg.
- Met een **eigen account** blijft de opslag van een website standaard staan, tenzij de beheerder de "ephemeral mode" of het
  wissen van sitegegevens aanzette (zeker). Raakt de schijf vol, dan ruimt ChromeOS de oudste profielen op (waarschijnlijk).
- **Digisprong**: voor de kleuters en het 1ste tot 4de leerjaar koos Vlaanderen enkele gedeelde toestellen per klas, pas
  vanaf het 5de leerjaar een toestel per leerling (waarschijnlijk). Gedeelde toestellen in hoeken zijn dus de regel.
- **LeerID** (Onderwijs Vlaanderen) geeft kinderen in het basisonderwijs al een kaartje met een QR-code en een
  afbeeldingswachtwoord (zeker). Een kaartje voor de camera houden is voor hen dus een bekend gebaar.
- De meeste onderwijs-Chromebooks hebben een webcam aan de kant van het scherm, en BarcodeDetector werkt op ChromeOS
  (waarschijnlijk). De scanner van de app valt elders terug op jsqr.
- Of er op een Chromebook een Nederlandse of Vlaamse stem is, ook offline, is onzeker. Daarom opgenomen geluid.

## Randvoorwaarden (uit de bestaande afspraken)

- **De officiële doelen** komen uit de Onderwijsdoelen-API, letterlijk en met hun bron, maandelijks bijgewerkt via de bestaande
  workflow (`.github/workflows/minimumdoelen.yml`, `tools/leerplannen/haal-minimumdoelen.mjs`). Niets verzinnen; de eerste echte
  run bevestigt de vorm (werkwijze, regel 11).
- **De lesplannen (vroeger lesfiches) van het GO!** zijn inhoud van het net. De eigenaar heeft een akkoord met het GO! en
  bevestigde op 2 november 2026 dat het ook een openbare site en repo dekt ("ja ook voor lesplannen"). Vermeld bij elk
  lesplan de bron (GO!) en neem het letterlijk over.
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
