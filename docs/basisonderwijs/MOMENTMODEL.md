# Momentmodel basisonderwijs (bouwstap 2b): spec

Ontworpen op 2 november 2026: drie verkenners (gegevens, code, officiële kalender), drie ontwerpen (data eerst, leerkracht eerst, toekomst eerst), een rechter die koos en samenvoegde, en een criticus die narekende. Stand van zaken en beslissingen: `docs/BASISONDERWIJS.md`. **De rechtzettingen van de criticus (onderaan) gaan voor op de spec.**

## Keuze van de rechter

Basis: ontwerp 1. De kalender is een gegevensbestand, het model bestaat uit zuivere functies, er komt één blok in het paneel van een set, en minimumdoelenBron.ts blijft onaangeroerd.

Uit ontwerp 3 neem ik over:
- de map src/lib/basis/, die docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md:222 al voorziet;
- de tolerante redenen 'einddatum-buiten-kalender' en 'onbekend-vak';
- de vlag 'leeg' voor de schijnsets ODS_2958 en ODS_2959;
- de controle van de kalender tegen de API;
- de regel 'een groep valt nooit terug op de oude doelen'.

Uit ontwerp 2 neem ik over:
- de tijdloze kalender per set (kalenderVoorSet: 'verplicht vanaf' en 'geldt tot en met' per groep leerjaren). Zo hangt de rooktest bijna niet van de klok af;
- de opmerking over het getuigschrift bij golf 1, 4de leerjaar;
- een vaste regel voor 'zeker' in controleerKalender. Die maak ik strenger: 'zeker' alleen met steun van de gegevens of van een nagelezen tekst, nooit van zoekfragmenten alleen.

Bewust niet overgenomen:
- de filter 'Moment' en het klasblok van ontwerp 2: volgens docs/BASISONDERWIJS.md:107-108 horen die bij de eigen ingang;
- de koppeltabel van oude naar nieuwe vakken van ontwerp 2: die staat niet in de bron;
- doelkaart, leerlijn en zoekOpSleutel van ontwerp 3: niet nodig in 2b;
- de status 'verplicht' voor oude sets in ontwerp 3.

## Kern

Drie zuivere modules in src/lib/basis/. Geen React, geen fetch, geen localStorage en nooit Date.now(): het schooljaar is altijd een parameter.

1. kalender.ts is importvrij en gebruikt alleen erasable TypeScript, zoals src/lib/minimumdoelen.ts:4-6. Er staan 36 cellen in (soort bao/bubao × golf 1/2 × leerjaar K1-L6). Elke cel heeft het eerste verplichte schooljaar, een zekerheid, bron-id's en eventueel een opmerking. Verder de vaktabel 1-10 met de golf per vak, de vaste regel WERKT_NAAR (K1-K3 → K3, L1-L4 → L4, L5-L6 → L6) en de bronnenlijst. controleerKalender bewaakt vorm en regels.

2. moment.ts leidt per set uit de index af:
- soort en moment (de bestaande soortVanSet en momentVanSet);
- soort doelen (laatste deel van de naam);
- generatie nieuw/oud;
- eindmoment: alleen bij nieuwe sets, uit set.leerjaar met de naam als terugval;
- vak: alleen bij nieuwe sets, uit korteNaam;
- golf: bij nieuwe sets uit het vak, bij oude sets uit hun eigen geldigTot tegenover de kalender;
- de vlag leeg.
Daarmee rekent moment.ts per leerjaar en schooljaar een status uit: verplicht, mag, nog-niet, geldt, vervangen of vervallen, met de zekerheid erbij. Het rekent nooit met het label 'Geldig', want dat ligt vast op de ophaaldatum.

3. momentTeksten.ts bevat de vaste Vlaamse teksten.

De zekerheidsregel: een uitkomst is 'zeker' als ze uit de gegevens volgt. Dat is zo bij nog-niet en vervallen, bij een set zonder einddatum, en vanaf het schooljaar waarin er van die soort, dat moment en die golf geen oude set meer geldt. In alle andere gevallen geldt de zekerheid van de cel. 'Zeker' in een cel vraagt een bron met hoe 'gegevens' of 'gelezen'. Daardoor zijn vandaag alleen de kleutercellen zeker.

Zichtbaar wordt alleen dit, en alleen voor bao en bubao op de pagina 'Officiële minimumdoelen':
- in de feiten van een set wordt 'Leerjaar' vervangen door 'Moment', en 'Soort doelen' komt erbij;
- 'Geldig tot 31 augustus 2028' bij oude sets die nog gelden, in de feiten en in de lijst;
- het blok 'Wanneer gelden deze doelen?' met voor wie de doelen zijn, de lijn 'Dit schooljaar', de tijdloze kalender per groep leerjaren met zekerheidslabels als tekst, de tweeling in de andere basissoort en de bronnen.

Het secundair, Samenstellen, de inleeswizard, SetsKiezen, alle bewaarde formaten en het leerlingpad blijven ongewijzigd.

## Datamodel

NIEUW: src/lib/basis/kalender.ts. Importvrij, alleen erasable TypeScript: geen enums, namespaces of parameter properties. Een test eist dat er geen regel 'import' in staat.
```ts
export type LeerjaarBasis = 'K1'|'K2'|'K3'|'L1'|'L2'|'L3'|'L4'|'L5'|'L6';
export const LEERJAREN_BASIS: readonly LeerjaarBasis[] = ['K1','K2','K3','L1','L2','L3','L4','L5','L6'];
export type Eindmoment = 'K3'|'L4'|'L6';                 // einde kleuteronderwijs (3de kleuterklas), einde 4de, einde 6de leerjaar
export const WERKT_NAAR: Readonly<Record<LeerjaarBasis, Eindmoment>> = { K1:'K3', K2:'K3', K3:'K3', L1:'L4', L2:'L4', L3:'L4', L4:'L4', L5:'L6', L6:'L6' };
export type Golf = 1|2;
export type Zekerheid = 'zeker'|'waarschijnlijk'|'onzeker';
export type SoortBasis = 'bao'|'bubao';                  // deel van SoortOnderwijs (minimumdoelenBron.ts:141)
export type MomentKalender = 'kleuter'|'lager';           // gelijk aan MomentBasis (minimumdoelenBron.ts:187), hier herhaald omdat dit bestand niets importeert
export type Schooljaar = number;                          // beginjaar: 2026 = 2026-2027
export type BronHoe = 'gegevens'|'gelezen'|'zoekfragment'|'afgeleid'|'nog-te-lezen';
export interface KalenderBron { id: string; titel: string; url?: string /* alleen https */; hoe: BronHoe; geraadpleegd: string /* JJJJ-MM-DD */; citaat?: string }
export interface KalenderVak { nr: number /* 1..10, eerste getal van de code */; naam: string /* label */; sleutel: string /* korteNaam zonder accenten, kleine letters, één spatie */; golf: Golf }
export interface KalenderCel { soort: SoortBasis; golf: Golf; leerjaar: LeerjaarBasis; vanaf: Schooljaar /* eerste schooljaar waarin het nieuwe verplicht is */; zekerheid: Zekerheid; bronnen: readonly string[]; opmerking?: string }
export interface Invoeringskalender { v: 1; nagekekenOp: string /* '2026-11-02' */; vrijwilligVanaf: Schooljaar /* 2025 */; bronnen: readonly KalenderBron[]; vakken: readonly KalenderVak[]; golfIndeling: { zekerheid: Zekerheid; bronnen: readonly string[] }; cellen: readonly KalenderCel[] }
export const INVOERINGSKALENDER: Invoeringskalender;   // inhoud: zie invoeringstabel
```

NIEUW: src/lib/basis/moment.ts. Importeert alleen:
- uit ../minimumdoelenBron: soortVanSet, isBasisSoort, momentVanSet, zonderAccenten, geldigheidVan, geldigheidTekst, datumLeesbaar en het type MomentBasis;
- het type MinimumdoelenIndexSet uit ../minimumdoelen;
- ./kalender.
```ts
export type SoortDoelen = 'populatie'|'individueel'|'nastreven'|'ontwikkelingsdoelen'|'eindtermen';
export interface SetKopBasis { id: string; naam: string; korteNaam?: string; leerjaar?: string; geldigheid?: string; geldigVan?: string; geldigTot?: string; aantal?: number }
// MinimumdoelenIndexSet (minimumdoelen.ts:77-94) en MinimumdoelenSetKop (minimumdoelen.ts:44-67) passen er allebei op.
export interface BasisSet {
  id: string; soort: SoortBasis; moment: MomentBasis;
  generatie: 'nieuw'|'oud';                 // nieuw = laatste naamdeel bevat 'minimumdoelen'
  soortDoelen?: SoortDoelen;
  eindmoment?: Eindmoment;                  // alleen nieuw
  leerjaren: readonly LeerjaarBasis[];      // nieuw: de leerjaren met WERKT_NAAR = eindmoment; oud kleuter K1-K3; oud lager L1-L6
  vak?: KalenderVak;                        // alleen nieuw
  golf?: Golf; golfUit: 'vak'|'einddatum'|'geen';
  geldigVanaf?: Schooljaar; geldigTotEnMet?: Schooljaar;  // schooljaarVan(geldigVan) en schooljaarVan(geldigTot)
  leeg: boolean;                            // korteNaam 'Alle leergebieden' en aantal ≤ 1 (ODS_2958, ODS_2959)
}
export type InvoeringStatus = 'verplicht'|'mag'|'nog-niet'|'geldt'|'vervangen'|'vervallen';
export type InvoeringReden = 'geen-einddatum'|'einddatum-buiten-kalender'|'onbekend-vak';
export interface Invoering { leerjaar: LeerjaarBasis; status: InvoeringStatus; zekerheid: Zekerheid; verplichtVanaf?: Schooljaar; laatsteSchooljaar?: Schooljaar; reden?: InvoeringReden; opmerking?: string; bronnen: readonly string[] }
export interface KalenderRegel { leerjaren: LeerjaarBasis[]; soort: 'verplicht-vanaf'|'laatste-schooljaar'|'geen-einde'|'onbekend'; jaar?: Schooljaar; zekerheid: Zekerheid; reden?: InvoeringReden; opmerking?: string; bronnen: readonly string[] }
export interface Geldend { set: MinimumdoelenIndexSet; info: BasisSet; invoering: Invoering }
export interface GeldendeSets { soort: SoortBasis; leerjaar: LeerjaarBasis; schooljaar: Schooljaar; verplicht: Geldend[]; geldtNog: Geldend[]; magAl: Geldend[]; leeg: MinimumdoelenIndexSet[]; zekerheid: Zekerheid }
export interface DoelInfoBasis { eindmoment?: Eindmoment; vak?: number; soortDoel?: SoortDoelen }
```

NIEUW: src/lib/basis/momentTeksten.ts. Alleen constanten met satisfies Record<…> en leerjarenTekst. De letterlijke teksten staan bij de functies.

NIET RAKEN: niets komt erbij en niets verandert in:
- wf.curricula.v1 (curriculum.ts:25);
- MinimumdoelRef {set, id, code} (curriculumTypes.ts:75-82);
- herkomst (sanitizeHerkomst, curriculum.ts:500-518);
- doelenVingerafdruk (curriculum.ts:657-677);
- Doelgroep (doelgroep.ts:13-46);
- de set- en indexbestanden met hun sha256;
- minimumdoelen.ts en minimumdoelenBron.ts (geen nieuwe export).
Het model rekent alles opnieuw uit. Er is dus niets te migreren, en een bewaard leerplan uit een basisset blijft vindbaar.

## Invoeringskalender

WAAR. Alleen in INVOERINGSKALENDER in src/lib/basis/kalender.ts. Geen andere module bevat een jaartal of een vaknaam, op de grens van 1 september in schooljaarVan na. nagekekenOp: '2026-11-02'. vrijwilligVanaf: 2025, want alle 56 nieuwe sets hebben geldigVan 2025-09-01.

VAKKEN (nr · naam · sleutel · golf):
- golf 1: 1 · Nederlands · 'nederlands'; 2 · Wiskunde · 'wiskunde'; 3 · Wetenschap en techniek · 'wetenschap en techniek';
- golf 2: 4 · Aardrijkskunde · 'aardrijkskunde'; 5 · Geschiedenis · 'geschiedenis'; 6 · Muzische vorming · 'muzische vorming'; 7 · Lichamelijke opvoeding · 'lichamelijke opvoeding'; 8 · ICT · 'ict'; 9 · Attitudes · 'attitudes'; 10 · Frans · 'frans'.
golfIndeling: zeker, bronnen [api, decreet-2025, kenniswest]. De oude sets van precies NL, WI en W&T eindigen in 2026 (kleuter) of 2028 (lager), de rest in 2027 of 2030 (r3_kalender.py). Alle 56 nieuwe sets passen op een sleutel (r1_gegevens.py).

CELLEN BAO (golf · leerjaar · eerste verplichte schooljaar · zekerheid · bronnen · opmerking).
Golf 1:
- K1, K2, K3 · 2026-2027 · zeker · [api, codex, klasse-2026]. De oude kleutersets ODS_2104, 2105 en 2106 eindigen op 2026-08-31.
- L1, L2, L3 · 2026-2027 · waarschijnlijk · [codex, klasse-2026, cohortregel]. Dit was 'zeker' in de drie ontwerpen, maar de API zegt hier niets over.
- L4 · 2027-2028 · waarschijnlijk · [codex, vanin, sensoa, kov-toetsen, cohortregel] · opmerking 'In 2026-2027 mag het 4de leerjaar de oude eindtermen nog volgen. Deze leerlingen halen hun getuigschrift (2028-2029) wel op de nieuwe minimumdoelen Nederlands, wiskunde en wetenschap en techniek.'
- L5 · 2027-2028 · waarschijnlijk · [codex, vanin, sensoa, cohortregel].
- L6 · 2028-2029 · waarschijnlijk · [codex, api, kov-toetsen, cohortregel] · opmerking 'Uiterlijk 2028-2029: de oude eindtermen voor deze vakken gelden tot 31 augustus 2028.'
Golf 2:
- K1, K2, K3 · 2027-2028 · zeker · [api, kenniswest, ovsg, klasse-2026]. ODS_2102, 2103 en 2107 eindigen op 2027-08-31.
- L1, L2, L3 · 2027-2028 · waarschijnlijk · [sensoa, ovsg, cohortregel].
- L4 · 2028-2029 · waarschijnlijk · [sensoa, cohortregel].
- L5 · 2029-2030 · waarschijnlijk · [sensoa, cohortregel].
- L6 · 2030-2031 · waarschijnlijk · [api, mvt-od36, vlaams-parlement, cohortregel] · opmerking 'Uiterlijk 2030-2031: de oude eindtermen voor deze vakken gelden tot 31 augustus 2030.'

CELLEN BUBAO: dezelfde jaren. controleerKalender eist dat ze gelijk zijn aan bao.
- K-cellen: zeker · [api]. Golf 1: ODS_2297, 2303, 2329, 2359 en 2360 eindigen op 2026-08-31. Golf 2: de 12 andere oude kleutersets eindigen op 2027-08-31.
- L-cellen: onzeker · [api] · opmerking 'Volgt de kalender van het gewoon basisonderwijs: de oude doelen eindigen op dezelfde dagen. Of de invoering per leerjaar hier ook zo loopt, is nog niet bevestigd.'

BRONNEN (id · titel · url · hoe). Alle bronnen hebben geraadpleegd '2026-11-02'. De url's komen uit het rapport van de kalenderverkenner en zijn door niemand geopend.
- api · 'Onderwijsdoelen-API: einddata van de oude sets (opgehaald op 1 november 2026)' · https://www.onderwijsdoelen.be/ · gegevens.
- codex · 'Decreet basisonderwijs, overgangsbepaling (Codex Vlaanderen)' · https://codex.vlaanderen.be/Portals/Codex/documenten/1005384.html · zoekfragment.
- decreet-2025 · 'Decreet van 18 juli 2025 over de minimumdoelen (Edulex)' · https://data-onderwijs.vlaanderen.be/edulex/document.aspx?docid=12254 · zoekfragment.
- klasse-2026 · 'Klasse: wat is nieuw in onderwijs op 1 september 2026' · https://www.klasse.be/783462/wat-is-nieuw-in-onderwijs-op-1-september-2026/ · zoekfragment, met citaat 'Dit schooljaar ga je in het kleuteronderwijs en in het eerste tot en met derde leerjaar lager onderwijs verplicht aan de slag met de nieuwe minimumdoelen Nederlands, wiskunde en wetenschap en techniek'.
- klasse-momenten · 'Klasse: nieuwe minimumdoelen basisonderwijs' · https://www.klasse.be/775114/nieuwe-minimumdoelen-basisonderwijs-2/ · zoekfragment.
- kenniswest · 'KennisWest: inwerkingtreding van de minimumdoelen' · https://www.kenniswest.be/publicatie/decreet-tot-wijziging-decreet-basisonderwijs-wat-vaststelling-en-inwerkingtreding-minimumdoelen-betreft/270144 · zoekfragment.
- ovsg · 'OVSG: minimumdoelen basisonderwijs' · https://www.ovsg.be/onze-themas/leerplannen-didactiek/basisonderwijs/minimumdoelen-basisonderwijs · zoekfragment.
- sensoa · 'Sensoa: tabel van de invoering per leerjaar' · https://www.sensoa.be/relationele-en-seksuele-vorming-de-vlaamse-minimumdoelen-en-eindtermen · zoekfragment.
- vanin · 'Van In: invoering per leerjaar' · https://www.vanin.be/iedereenmee/ · zoekfragment.
- kov-toetsen · 'Katholiek Onderwijs Vlaanderen: Vlaamse toetsen, vragen en antwoorden' · https://pro.katholiekonderwijs.vlaanderen/vlaamsetoetsen/faq · zoekfragment.
- mvt-od36 · 'Memorie van toelichting bij Onderwijsdecreet XXXVI' · https://themis.vlaanderen.be/files/d8f9aa50-4adb-11f1-909c-bd967777a5f1/download?name=VR+2026+0805+DOC.0465-3+Onderwijsdecreet+XXXVI+-+MvT+TER.pdf&content-disposition=inline · zoekfragment.
- vlaams-parlement · 'Vlaams Parlement: commissieverslag (eindpunt 2030-2031)' · https://docs.vlaamsparlement.be/files/pfile?id=2287211 · zoekfragment.
- cohortregel · 'Afgeleid: het getuigschriftjaar van elke groep, nagerekend tegen de cellen' · geen url · afgeleid.
- vlaanderen-tabel · 'Vlaamse overheid: nieuwe minimumdoelen in het basisonderwijs' · https://www.vlaanderen.be/onderwijs-en-vorming/leerstof/onderwijsdoelen/nieuwe-minimumdoelen-in-het-basisonderwijs · nog-te-lezen.
- vraag-antwoord · 'Vlaamse overheid: vraag en antwoord nieuwe minimumdoelen (pdf)' · https://data-onderwijs.vlaanderen.be/documenten/bestanden/nieuwe-minimumdoelen-vraag-antwoord.pdf · nog-te-lezen.

ZO BLIJFT DE ONZEKERHEID ZICHTBAAR.
(1) controleerKalender laat 'zeker' alleen toe met een bron met hoe 'gegevens' of 'gelezen'. Een zoekfragment maakt nooit zeker, en een bron met hoe 'nog-te-lezen' is nooit de enige steun.
(2) Elke Invoering en elke KalenderRegel draagt de zekerheid en de bronnen van de cel.
(3) Het blok toont 'waarschijnlijk' of 'nog onzeker' als tekstbadge. Daarbij staat één uitlegzin en een uitklapper 'Waarop steunt dit?' met per bron hoe ze gekend is. Zijn er niet-zekere regels, dan komen ook de bronnen die nog te lezen zijn erbij.
(4) Bijwerken na het lezen van de officiële tabel raakt alleen dit bestand: de cel op 'zeker' en de bron op hoe 'gelezen'.
(5) Wijzigt de API een einddatum, dan faalt kalenderTegenGegevens in de maandelijkse data-PR (minimumdoelen.yml draait npx vitest run).

## Functies

### `schooljaarVan / schooljaarVanDatum / schooljaarTekst`

```ts
schooljaarVan(datum: string | undefined): Schooljaar | undefined; schooljaarVanDatum(d: Date): Schooljaar | undefined; schooljaarTekst(sj: Schooljaar): string  (kalender.ts)
```

schooljaarVan leest het begin 'JJJJ-MM-DD' (een tijd erna telt niet mee). Een maand van 9 tot 12 geeft het jaar zelf, een maand van 1 tot 8 het jaar ervoor. Een maand buiten 1..12 of een tekst die niet te lezen is, geeft undefined. Voorbeelden: '2026-08-31' geeft 2025; '2026-09-01' en '2026-09-01T00:00:00Z' geven 2026. schooljaarVanDatum doet hetzelfde met de lokale getFullYear en getMonth, en geeft undefined bij een ongeldige Date. schooljaarTekst(2026) geeft '2026-2027'.

### `celVoor / laatsteVanaf / eindeOudVoor`

```ts
celVoor(soort: SoortBasis, golf: Golf, leerjaar: LeerjaarBasis, k = INVOERINGSKALENDER): KalenderCel | undefined; laatsteVanaf(soort, golf, moment: MomentKalender, k?): Schooljaar; eindeOudVoor(soort, golf, moment, k?): string  (kalender.ts)
```

laatsteVanaf is het grootste 'vanaf' over K1-K3 (kleuter) of L1-L6 (lager). eindeOudVoor geeft `${laatsteVanaf}-08-31`. Met de tabel geeft dat: kleuter golf 1 '2026-08-31', kleuter golf 2 '2027-08-31', lager golf 1 '2028-08-31' en lager golf 2 '2030-08-31', voor bao en voor bubao.

### `controleerKalender`

```ts
controleerKalender(k = INVOERINGSKALENDER): string[]  (kalender.ts)
```

Geeft fouten in leesbare Vlaamse zinnen; een lege lijst betekent dat alles in orde is. De regels:
- elke combinatie van soort, golf en leerjaar staat precies één keer in de cellen (36 cellen);
- vanaf is een geheel getal van 2025 tot 2035 en nooit kleiner dan vrijwilligVanaf;
- per soort en golf zijn K1, K2 en K3 gelijk;
- per soort en golf daalt L1 tot L6 niet, en geldt vanaf(L(n+1)) ≤ vanaf(Ln) + 1: een groep valt nooit terug op de oude doelen;
- per soort en leerjaar start golf 2 nooit vóór golf 1;
- per golf en leerjaar zijn de jaren van bubao gelijk aan die van bao;
- de vaknummers 1..10 komen elk precies één keer voor, de sleutels zijn uniek en de golf is 1 of 2;
- de bron-id's zijn uniek, elke verwijzing (cel en golfIndeling) bestaat, een url begint met https:// en hoe heeft een geldige waarde;
- zekerheid 'zeker' vraagt minstens één bron met hoe 'gegevens' of 'gelezen';
- een cel heeft minstens één bron met een andere hoe dan 'nog-te-lezen'.

### `soortDoelVan`

```ts
soortDoelVan(type: string | undefined): SoortDoelen | undefined  (moment.ts)
```

Werkt na trim, kleine letters en één spatie per reeks:
- 'te bereiken minimumdoelen op populatieniveau' geeft populatie;
- 'te bereiken minimumdoelen op individueel niveau' geeft individueel;
- 'na te streven minimumdoelen op populatieniveau' geeft nastreven;
- 'ontwikkelingsdoelen' en 'eindtermen' blijven zichzelf;
- al de rest geeft undefined.
Wordt gebruikt op doel.type en op het laatste deel van de setnaam (split /\s+-\s+/).

### `vakVanKorteNaam`

```ts
vakVanKorteNaam(korteNaam: string | undefined, k?): KalenderVak | undefined  (moment.ts)
```

Neemt zonderAccenten, maakt van elke reeks spaties één spatie en trimt. Zoekt dan exact op de sleutel. Alleen bedoeld voor nieuwe sets: de oude sets 'Nederlands' (ODS_2110) en 'Wiskunde' (ODS_2113) passen ook, maar basisSet roept deze functie bij oude sets nooit aan.

### `basisSet`

```ts
basisSet(set: SetKopBasis, k = INVOERINGSKALENDER): BasisSet | undefined  (moment.ts)
```

Geeft undefined tenzij isBasisSoort(soortVanSet(naam)) waar is en momentVanSet een moment geeft. Secundair, volwassenenonderwijs en lerarenopleiding vallen dus altijd weg.
- soortDoelen = soortDoelVan(laatste naamdeel).
- generatie is 'nieuw' als het laatste naamdeel /minimumdoelen/i bevat, anders 'oud'. Vandaag zijn dat precies de 56 sets met versie 2.0.
- eindmoment, alleen bij een nieuwe set: kleuter geeft 'K3'. Bij lager geeft leerjaar '4de leerjaar' 'L4' en '6de leerjaar' 'L6'. Zonder leerjaar zoekt de functie /\b([46])de\s+leerjaar\b/i in de naam; anders blijft het eindmoment leeg.
- leerjaren: bij een nieuwe set LEERJAREN_BASIS met WERKT_NAAR gelijk aan het eindmoment (zonder eindmoment: []). Een oude kleuterset krijgt K1-K3, een oude lagere set L1-L6.
- vak en golf bij een nieuwe set: vakVanKorteNaam en vak.golf, met golfUit 'vak'. Zonder vak: golfUit 'geen'.
- golf bij een oude set: golfVanOudeSet, met golfUit 'einddatum'. Zonder treffer: 'geen'.
- geldigVanaf = schooljaarVan(geldigVan) en geldigTotEnMet = schooljaarVan(geldigTot).
- leeg = (zonderAccenten(korteNaam).trim() === 'alle leergebieden' && (aantal ?? 0) <= 1).

### `golfVanOudeSet`

```ts
golfVanOudeSet(soort: SoortBasis, moment: MomentBasis, geldigTot: string | undefined, k?): Golf | undefined  (moment.ts)
```

Zoekt de golf g waarvoor schooljaarVan(geldigTot) gelijk is aan laatsteVanaf(soort, g, moment) − 1. Precies één treffer geeft die golf. Geen treffer, twee treffers of geen geldigTot geeft undefined. Voorbeelden: ODS_2110 (2028-08-31) geeft 1, ODS_2108 (2030-08-31) geeft 2, ODS_2302 (2027-08-31, kleuter) geeft 2. ODS_2311 (2020-08-31) en ODS_2306 (geen einde) geven undefined.

### `invoering`

```ts
invoering(set: BasisSet, leerjaar: LeerjaarBasis, schooljaar: Schooljaar, k = INVOERINGSKALENDER): Invoering | undefined  (moment.ts)
```

Geeft undefined als het leerjaar niet in set.leerjaren staat. Anders de eerste regel die past:
(1) geldigVanaf bestaat en schooljaar < geldigVanaf: 'nog-niet', zeker, bronnen ['api'].
(2) Oude set, geldigTotEnMet bestaat en schooljaar > geldigTotEnMet: 'vervallen', zeker, bronnen ['api'].
(3) Nieuwe set met golf, cel = celVoor(soort, golf, leerjaar): 'verplicht' als schooljaar ≥ cel.vanaf, anders 'mag'. verplichtVanaf = cel.vanaf.
(4) Oude set zonder geldigTot: 'geldt', zeker, reden 'geen-einddatum'.
(5) Oude set met golf: 'vervangen' als schooljaar ≥ cel.vanaf, anders 'geldt'. laatsteSchooljaar = min(cel.vanaf − 1, geldigTotEnMet).
(6) Oude set met geldigTot maar zonder golf: 'geldt', laatsteSchooljaar = geldigTotEnMet. De zekerheid is 'zeker' als geldigTotEnMet < k.vrijwilligVanaf, anders 'onzeker' met reden 'einddatum-buiten-kalender'.
(7) Nieuwe set zonder vak of golf: 'mag', onzeker, reden 'onbekend-vak'. Nooit 'verplicht'.
Zekerheid in (3) en (5): 'zeker' als schooljaar ≥ laatsteVanaf(soort, golf, moment), anders cel.zekerheid. In (3) en (5) komen opmerking en bronnen uit de cel.

### `invoeringVanSet`

```ts
invoeringVanSet(set: BasisSet, schooljaar: Schooljaar, k?): Invoering[]  (moment.ts)
```

Eén Invoering per leerjaar van de set, in de volgorde van LEERJAREN_BASIS. Voorbeelden in 2026:
- ODS_3395: L1-L3 verplicht (waarschijnlijk), L4 mag (waarschijnlijk, verplichtVanaf 2027);
- ODS_2110: L1-L3 vervangen, L4 en L5 geldt (laatsteSchooljaar 2026), L6 geldt (2027);
- ODS_2104: K1-K3 vervallen;
- ODS_3411: K1-K3 mag (zeker, vanaf 2027);
- ODS_3469: L1-L3 verplicht (onzeker).

### `kalenderVoorSet`

```ts
kalenderVoorSet(set: BasisSet, k?): KalenderRegel[]  (moment.ts)
```

De tijdloze kalender: zonder schooljaar, dus hij veroudert niet. Per leerjaar van de set:
- nieuwe set met golf: soort 'verplicht-vanaf' met jaar = cel.vanaf;
- nieuwe set zonder golf: 'onbekend', onzeker;
- oude set met golf: 'laatste-schooljaar' met jaar = min(cel.vanaf − 1, geldigTotEnMet);
- oude set zonder einde: 'geen-einde', zeker;
- oude set met einde maar zonder golf: 'laatste-schooljaar' met jaar = geldigTotEnMet, en de zekerheid zoals in regel (6) van invoering.
De zekerheid is die van de cel, zonder ophoging. Opeenvolgende leerjaren met gelijke soort, jaar, zekerheid, reden en opmerking worden één regel. Een lege set geeft [].
Voorbeelden:
- ODS_3395 en ODS_3408: [{L1,L2,L3; 2026; waarschijnlijk}, {L4; 2027; waarschijnlijk; met de opmerking}];
- ODS_3409: [{L5; 2027}, {L6; 2028; met de opmerking}];
- ODS_2110 en ODS_2112: [{L1-L3; laatste 2025}, {L4,L5; 2026}, {L6; 2027}];
- ODS_3401: [{K1-K3; 2026; zeker}];
- ODS_2306: [{K1-K3; geen-einde}].

### `setsDieGelden`

```ts
setsDieGelden(alle: readonly MinimumdoelenIndexSet[], vraag: { soort: SoortBasis; leerjaar: LeerjaarBasis; schooljaar: Schooljaar }, k?): GeldendeSets  (moment.ts)
```

Het antwoord op 'welke doelen gelden voor dit leerjaar in dit schooljaar'. Neemt alle sets van die soort waarvoor basisSet bestaat en invoering iets geeft, in de volgorde van de index:
- status verplicht gaat naar verplicht;
- geldt naar geldtNog;
- mag naar magAl;
- vervangen, vervallen en nog-niet vallen weg;
- een lege set met status verplicht, geldt of mag gaat alleen naar leeg.
De zekerheid is de laagste over verplicht, geldtNog en magAl ('zeker' als die leeg zijn). Geen scherm gebruikt dit in 2b: het is de basis voor /basis (bouwstap 3).

### `tweelingSets`

```ts
tweelingSets(set: BasisSet, alle: readonly MinimumdoelenIndexSet[], k?): MinimumdoelenIndexSet[]  (moment.ts)
```

Geeft de nieuwe sets van de andere basissoort met hetzelfde vak.nr en eindmoment, in de volgorde van de index. Een oude set, of een set zonder vak of eindmoment, geeft []. Voorbeelden: ODS_3408 geeft [ODS_3469]; ODS_3485 geeft [ODS_3397, ODS_3401]; ODS_3484 geeft [ODS_3404, ODS_3405]; ODS_3428 geeft [ODS_3483]; ODS_2110 geeft []. De bestaande zijnTweeling voor SO en BuSO blijft ongewijzigd.

### `doelInfo`

```ts
doelInfo(doel: { code: string; type?: string }, set: BasisSet): DoelInfoBasis  (moment.ts)
```

- eindmoment = set.eindmoment: geen enkel doel van de 6554 heeft een eigen leerjaar (r1_gegevens.py).
- vak: alleen bij een nieuwe set en een code /^\d+\.\d+\.\d+$/. Het is Number(code.split('.')[0]), maar alleen tussen 1 en 10: '10.2.1' geeft 10.
- soortDoel = soortDoelVan(doel.type) ?? set.soortDoelen. De soort doel hoort dus bij (doel, set), nooit bij het id alleen. Zo is 92767 in ODS_3408 populatie en in ODS_3469 nastreven.

### `geldigheidTekstBasis`

```ts
geldigheidTekstBasis(naam: string, g: { geldigheid?: string; geldigVan?: string; geldigTot?: string }): string | undefined  (moment.ts)
```

Geeft `Geldig tot ${datumLeesbaar(g.geldigTot)}` (bv. 'Geldig tot 31 augustus 2028'), maar alleen als aan drie voorwaarden voldaan is:
- isBasisSoort(soortVanSet(naam)) is waar;
- geldigheidVan(g) is 'G';
- g.geldigTot begint met JJJJ-MM-DD.
In elk ander geval geeft de functie precies geldigheidTekst(g). geldigheidTekst zelf blijft ongewijzigd, want ook StapDoelen, StapSets, StapKoppelen en setKeuze gebruiken ze.

### `kalenderTegenGegevens`

```ts
kalenderTegenGegevens(alle: readonly MinimumdoelenIndexSet[], k?): string[]  (moment.ts)
```

Fouten in leesbare zinnen:
- (a) een set met soort bao of bubao waarvoor basisSet undefined geeft;
- (b) een nieuwe set zonder vak (met de korteNaam erbij), zonder eindmoment of met lege leerjaren;
- (c) een oude set met schooljaarVan(geldigTot) ≥ k.vrijwilligVanaf en golfUit 'geen';
- (d) voor elke soort, golf en moment: eindeOudVoor komt bij geen enkele oude set van die soort en dat moment voor als geldigTot.
Op de index van vandaag geeft dit [].

### `leerjarenTekst en de vaste teksten`

```ts
leerjarenTekst(lj: readonly LeerjaarBasis[], metLidwoord = false): string; EINDMOMENT_LABEL; MOMENT_OUD_LABEL; SOORT_DOELEN_LABEL; STATUS_LABEL; ZEKERHEID_LABEL; ZEKERHEID_UITLEG; BRON_HOE_LABEL  (momentTeksten.ts)
```

leerjarenTekst:
- ['L1','L2','L3'] geeft '1ste, 2de en 3de leerjaar';
- ['L4','L5'] geeft '4de en 5de leerjaar';
- ['K1','K2','K3'] geeft '1ste, 2de en 3de kleuterklas';
- met lidwoord wordt dat 'het … leerjaar' of 'de … kleuterklas'.
EINDMOMENT_LABEL: K3 'Einde kleuteronderwijs (3de kleuterklas)', L4 'Einde 4de leerjaar', L6 'Einde 6de leerjaar'.
MOMENT_OUD_LABEL: kleuter 'Kleuteronderwijs', lager 'Lager onderwijs (één set voor alle leerjaren)'.
SOORT_DOELEN_LABEL: populatie 'Te bereiken op populatieniveau', individueel 'Te bereiken op individueel niveau', nastreven 'Na te streven', ontwikkelingsdoelen 'Ontwikkelingsdoelen (oud)', eindtermen 'Eindtermen (oud)'.
STATUS_LABEL: verplicht 'verplicht', mag 'mag al', geldt 'geldt nog', vervangen 'vervangen door de nieuwe minimumdoelen', vervallen 'geldt niet meer', nog-niet 'nog niet'.
ZEKERHEID_LABEL: waarschijnlijk 'waarschijnlijk', onzeker 'nog onzeker'. Bij zeker komt er geen badge.
ZEKERHEID_UITLEG:
- waarschijnlijk: 'Waarschijnlijk: afgeleid uit het decreet zoals Klasse en de Codex het citeren. De officiële tabel van de Vlaamse overheid is nog niet nagelezen.'
- onzeker (buitengewoon): 'Nog onzeker: de oude doelen eindigen op dezelfde dagen als in het gewoon basisonderwijs, maar of de invoering per leerjaar hier ook zo loopt, is nog niet bevestigd.'
- einddatum-buiten-kalender: 'Nog onzeker: de einddatum van deze set past niet in de kalender van de app. Kijk de officiële bron na.'
- onbekend-vak: 'Nog onzeker: dit vak staat nog niet in de kalender van de app.'
BRON_HOE_LABEL: gegevens 'gegevens van de officiële bron', gelezen 'nagelezen', zoekfragment 'alleen via een zoekmachine gezien', afgeleid 'afgeleid', nog-te-lezen 'nog na te lezen'.
Nooit het woord 'widget'.

### `WanneerGelden (component)`

```ts
WanneerGelden({ set, alleSets, schooljaar, kalender = INVOERINGSKALENDER }: { set: BasisSet; alleSets: readonly MinimumdoelenIndexSet[]; schooljaar: Schooljaar; kalender?: Invoeringskalender }): JSX.Element | null  (src/components/basis/WanneerGelden.tsx)
```

Geeft null als elke invoering van invoeringVanSet(set, schooljaar) 'vervallen' is: de bestaande melding md-verouderd zegt het dan al, bv. bij ODS_2104.
Een lege set geeft <section className="md-wanneer" aria-labelledby="md-wanneer-kop"> met de h3 en alleen de zin 'De bron legt voor deze groep geen specifieke ontwikkelingsdoelen vast.'
Anders, in deze volgorde:
(1) h3#md-wanneer-kop 'Wanneer gelden deze doelen?'
(2) p.md-wanneer-voorwie. Bij een nieuwe set: 'Doelen voor het einde van het 4de leerjaar. Het 1ste, 2de en 3de leerjaar werken ernaartoe; het leerplan van je net legt de tussenstappen vast.' Bij L6 '… Het 5de leerjaar werkt ernaartoe; …', bij K3 '… De 1ste en 2de kleuterklas werken ernaartoe; …'. Bij een oude set: 'Oude eindtermen voor het hele lager onderwijs.' of 'Oude ontwikkelingsdoelen voor het hele kleuteronderwijs.' (lager: 'voor het hele lager onderwijs').
(3) p.md-wanneer-nu: `Dit schooljaar (${schooljaarTekst(schooljaar)}): ` met delen per status in de volgorde verplicht, mag, geldt, vervangen, nog-niet, gescheiden door ' · '. Elk deel is `${STATUS_LABEL} in ${leerjarenTekst(lj, true)}`, bv. 'verplicht in het 1ste, 2de en 3de leerjaar · mag al in het 4de leerjaar'. Is de laagste zekerheid niet 'zeker', dan volgt een badge.
(4) ul.md-wanneer-lijst met één li per KalenderRegel. Vormen: '1ste, 2de en 3de leerjaar: verplicht vanaf 2026-2027', '4de en 5de leerjaar: geldt tot en met 2026-2027', '1ste, 2de en 3de kleuterklas: geldt; de bron geeft geen einddatum' en '…: nog niet in de kalender van de app'. Is de regel niet zeker, dan volgt <span className="badge badge-warn">waarschijnlijk</span> of 'nog onzeker'.
(5) Bij een nieuwe set p 'Mag al sinds 2025-2026.', uit geldigVanaf.
(6) Elke opmerking één keer, als p.md-wanneer-noot.
(7) Eén uitlegzin per zekerheid of reden die voorkomt (ZEKERHEID_UITLEG).
(8) Als tweelingSets niet leeg is: bij bao 'Dezelfde doelen (zelfde nummers) staan ook in het buitengewoon basisonderwijs, daar na te streven:', bij bubao '… staan ook in het basisonderwijs:'. Daarna een <Link to="/leerplannen/minimumdoelen/<id>"> per set met tekst `‘${korteNaam}’ (${id})`.
(9) <details> met <summary>'Waarop steunt dit?'</summary>. Daarin een ul met de bronnen van de getoonde regels (in de volgorde van kalender.bronnen); als er een regel niet zeker is, komen de bronnen met hoe 'nog-te-lezen' erbij. Elke li geeft de titel, en is er een url, dan is de titel de linktekst: href via veiligeLink, target _blank, rel 'noopener noreferrer' en <span className="sr-only"> (opent in een nieuw tabblad)</span>. Daarna ' — ' met BRON_HOE_LABEL. Nooit een kale url als tekst. Onderaan p 'Kalender nagekeken op 2 november 2026.' (datumLeesbaar(nagekekenOp)).
Geen nieuwe Lucide-iconen.

## Schermen

- **Officiële minimumdoelen › paneel van een set (SetPaneel, src/pages/MinimumdoelenPage.tsx:372-621), alleen als basisSet(kop) bestaat.** Maak `const basisInfo = useMemo(() => (kop ? basisSet(kop) : undefined), [kop])` en `const schooljaar = useMemo(() => schooljaarVanDatum(new Date()) ?? INVOERINGSKALENDER.vrijwilligVanaf, [])`.

Feiten (419-430):
- als basisInfo bestaat, vervangt 'Moment' het feit 'Leerjaar' (regel 424) op dezelfde plaats. De waarde is EINDMOMENT_LABEL bij een nieuwe set en MOMENT_OUD_LABEL bij een oude;
- direct daarna komt 'Soort doelen' (SOORT_DOELEN_LABEL), als die bekend is;
- regel 426 gebruikt geldigheidTekstBasis(kop.naam, geldigheid) in plaats van geldigheidTekst(geldigheid). Voor niet-basissets is de uitkomst dezelfde.

Na het blok {verouderd && …} (469-522) en vóór {stem && …} (524) komt `{basisInfo && <WanneerGelden set={basisInfo} alleSets={alleSets} schooljaar={schooljaar} />}`.

Voor elke andere set blijft alles letterlijk gelijk, ook 'Leerjaar 3de leerjaar' bij ODS_3361. De rooktest op ODS_2104 (smoke.mjs:903) blijft waar: het blok is daar null, en 'Soort onderwijs Basisonderwijs' blijft het eerste feit.
- **Officiële minimumdoelen › een set in de lijst (SetKnop, MinimumdoelenPage.tsx:312-331).** Regel 314: `geldigheidTekst(set)` wordt `geldigheidTekstBasis(set.naam, set)`. Alleen de 54 basissets die 'Geldig' zijn en een geldigTot hebben, veranderen, bv. ODS_2110 'Geldig tot 31 augustus 2028' in plaats van 'Geldig sinds 2010'. De eerste .md-set-meta (de kenmerken: 'Basisonderwijs · …', smoke.mjs:787-791 en 891-892) blijft gelijk. Filters, sortering, het vinkje 'oude versies', de filter 'actueel' en de tellingen blijven ook gelijk.
- **Nieuw: src/components/basis/WanneerGelden.tsx, met de stijl in src/styles/basis-moment.css (de component importeert die zelf).** De klassen .md-wanneer, .md-wanneer-voorwie, .md-wanneer-nu, .md-wanneer-lijst, .md-wanneer-noot en .md-wanneer-bronnen, alleen met tokens uit global.css. Geen vaste breedtes, en `overflow-wrap: anywhere` voor links. Op 390 px scrollt er niets horizontaal. De zekerheid staat altijd als tekst in de bestaande .badge.badge-warn, nooit alleen als kleur. Geen witte tekst op --brand. Het blok heeft een h3, want de pagina heeft één h1 en het paneel een h2.
- **Samenstellen, inleeswizard, SetsKiezen, editor, Leerplannen, studierichtingen, het hele secundair en het leerlingpad.** Geen wijziging. Geen van die schermen importeert iets uit src/lib/basis/. Er komt geen route (App.tsx blijft), geen wijziging in vite.config.ts of EAGER_ICON_NAMES, en minimumdoelenBron.ts, minimumdoelen.ts, setKeuze.ts en de curriculum-modules blijven onaangeroerd.

## Tests

- src/lib/basis/kalender.test.ts, zonder bestanden. controleerKalender(INVOERINGSKALENDER) geeft []. Elk van deze gebroken kopieën geeft minstens één fout:
- een cel ontbreekt of staat dubbel;
- K2 ≠ K1;
- L5 < L4;
- L6 = L5 + 2 (een groep valt terug);
- golf 2 vóór golf 1;
- bubao L4 ≠ bao L4;
- een onbekende bron-id;
- een url met http://;
- 'zeker' met alleen zoekfragmenten;
- een cel met alleen 'nog-te-lezen';
- vaknummer 3 dubbel.
- kalender.test.ts: schooljaarVan geeft voor '2026-08-31' 2025, voor '2026-09-01' en '2026-09-01T00:00:00Z' 2026, voor '2027-01-15' 2026, en voor 'onzin', '2026-13-01' en undefined telkens undefined. schooljaarVanDatum(new Date(2026, 7, 31)) is 2025 en schooljaarVanDatum(new Date(2026, 8, 1)) is 2026. schooljaarTekst(2026) is '2026-2027'. eindeOudVoor geeft voor bao en bubao: kleuter 2026-08-31 en 2027-08-31, lager 2028-08-31 en 2030-08-31. Nergens Date.now() en nergens new Date() zonder argumenten.
- kalender.test.ts, cohortcontrole (intern, niet als bewijs van de regel). Met G = j + 6 − n geldt voor golf 1: nieuw ⇔ (j ≥ 2026 en G ≥ 2029) of (j ≥ 2027 en G ≥ 2028). Voor golf 2: nieuw ⇔ j ≥ 2027 en G ≥ 2030. Het eerste j per L1 tot L6 is gelijk aan vanaf in de bao-cellen van beide golven.
- kalender.test.ts: readFileSync van kalender.ts bevat geen regel /^\s*import\s/m. Zo blijft het bestand bruikbaar in tools/ via Node.
- src/lib/basis/moment.test.ts, met zelfgemaakte koppen in de echte naamvorm (met de dubbele spatie):
- 'Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - Te bereiken minimumdoelen op populatieniveau' met leerjaar '4de leerjaar' geeft nieuw, L4, vak 3, golf 1 (golfUit 'vak'), populatie en de leerjaren L1-L4. Zonder leerjaar haalt de functie L4 uit de naam.
- 'Buitengewoon Kleuteronderwijs -  Wiskunde - Na te streven minimumdoelen op populatieniveau' geeft bubao, K3, vak 2 en nastreven.
- 'Lager Onderwijs - Leergebied - Nederlands - Eindtermen' geeft oud, de leerjaren L1-L6 en geen vak. Met geldigTot 2028-08-31 is het golf 1, met 2030-08-31 golf 2, met 2029-08-31 en zonder einddatum geen golf.
- Leeg: 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Alle leergebieden - Ontwikkelingsdoelen' met aantal 1.
- Een set van het secundair en 'Lerarenopleiding - Opleiding - Leraar Kleuteronderwijs - Eindtermen' geven undefined.
- moment.test.ts, invoering met de echte kalender:
- de L4-set in 2026: L3 verplicht (waarschijnlijk), L4 mag met verplichtVanaf 2027, L5 undefined; in 2028: L4 verplicht en zeker; in 2024: nog-niet;
- de oude lagere set van golf 1: in 2026 L3 vervangen en L4 geldt met laatsteSchooljaar 2026; in 2027 L6 geldt met laatsteSchooljaar 2027; in 2028 vervallen;
- een oude set zonder einde: geldt, zeker, reden geen-einddatum;
- een oude set met einde 2029-08-31: geldt, onzeker, einddatum-buiten-kalender;
- een oude set met einde 2020-08-31: in 2019 geldt en zeker, in 2026 vervallen;
- een nieuwe set met korteNaam 'Burgerschap': mag, onzeker, onbekend-vak, ook in 2035;
- de bubao-tweeling van de L4-set in 2026: L3 verplicht en onzeker; de bubao-kleuterset van golf 1 in 2026 is verplicht en zeker.
- moment.test.ts, invoering met een NAGEBOOTSTE kalender. Dat bewijst dat de jaren uit de gegevens komen (regel 11). Een kopie met bao golf 1 L4 en L5 vanaf 2040 en L6 vanaf 2041 geeft voor L4 in 2030 'mag' met verplichtVanaf 2040. Een oude lagere set van golf 1 krijgt dan alleen nog een golf met geldigTot 2040-08-31.
- moment.test.ts:
- kalenderVoorSet en het groeperen: L1-L3 worden één regel, L4 apart met de opmerking; bij een oude set L4 en L5 samen, L6 apart.
- leerjarenTekst: '1ste, 2de en 3de leerjaar', '4de leerjaar', 'het 4de en 5de leerjaar' en 'de 1ste, 2de en 3de kleuterklas'.
- setsDieGelden op een nagebootste index van 8 sets (nieuw en oud, beide golven, een lege set, een set zonder einde): de juiste verdeling over verplicht, geldtNog, magAl en leeg, de volgorde van de index en de laagste zekerheid.
- moment.test.ts:
- geldigheidTekstBasis: bao 'Geldig' met geldigTot 2028-08-31 geeft 'Geldig tot 31 augustus 2028'. Bao zonder geldigTot geeft 'Geldig sinds 2025'. 'Niet meer geldig' geeft precies geldigheidTekst. Een set van het secundair met 'Geldig' én een geldigTot geeft precies geldigheidTekst.
- doelInfo: code '10.2.1' in een nieuwe set geeft vak 10; 'HD 3' en 'INFO' geven geen vak; het type van het doel wint van set.soortDoelen.
- src/lib/basis/momentmodel.echt.test.ts, op de echte gegevens. Wacht zoals minimumdoelenBron.test.ts:689-694: existsSync op index.json, heeftBasis = index.some((s) => s.id === 'ODS_3395') en it.runIf; per setbestand existsSync zoals op regel 188. Te testen:
- kalenderTegenGegevens(index) geeft [];
- basisSet bestaat precies voor de sets met isBasisSoort(soortVanSet(naam));
- generatie 'nieuw' valt samen met versie '2.0';
- in elke nieuwe set is het eerste getal van de code van elk doel gelijk aan vak.nr, en soortDoelVan(doel.type) gelijk aan set.soortDoelen;
- in elke basisset is soortDoelVan(doel.type) gelijk aan set.soortDoelen;
- leeg valt samen met 'elk doel heeft code INFO'.
- momentmodel.echt.test.ts, tweelingen en xor:
- elk doel-id van een nieuwe bao-set staat in precies één set uit tweelingSets(set), met dezelfde code en tekst, en daar met soortDoel 'nastreven';
- voor bao en bubao, de schooljaren 2024 tot 2031, elk leerjaar en elke golf: precies één van 'een nieuwe set van die golf is verplicht' of 'een oude, niet-lege set van die golf geldt nog'.
- momentmodel.echt.test.ts, de acceptatievoorbeelden per set-id met it.runIf per id. Zie 'acceptatie': ODS_3395, 2110, 2104, 3411, 3401, 3469, 3485, 2306, 2959, setsDieGelden voor bao L3, K2, L4 en L6 en bubao L3, en de Lichtkamer-id's 92729, 92767 en 92833.
- momentmodel.echt.test.ts, het secundair onveranderd. Voor elke set waarvoor isBasisSoort onwaar is:
- basisSet geeft undefined;
- geldigheidTekstBasis(naam, s) is gelijk aan geldigheidTekst(s).
- src/components/basis/WanneerGelden.test.ts, met renderToStaticMarkup binnen StaticRouter, zoals RichtingDekking.test.ts:79. Met schooljaar 2026 en zelfgemaakte koppen in de echte vorm:
- de L4-set heeft de h3, 'Dit schooljaar (2026-2027): verplicht in het 1ste, 2de en 3de leerjaar · mag al in het 4de leerjaar', de regels 'verplicht vanaf 2026-2027' en 'verplicht vanaf 2027-2028' met de badge 'waarschijnlijk', 'Mag al sinds 2025-2026.' en de opmerking over het getuigschrift één keer;
- de oude set heeft '4de en 5de leerjaar: geldt tot en met 2026-2027';
- de kleuterset van golf 2 heeft geen enkele badge;
- een set die helemaal vervallen is, geeft '';
- de lege set heeft alleen de melding;
- elke externe link heeft rel 'noopener noreferrer', target _blank en de sr-only tekst, en geen enkele linktekst begint met 'http'.
- tests/smoke.mjs, nieuw deel '20b-3. Momentmodel basisonderwijs' direct na 20b-2. Een eigen context browser.newContext({ serviceWorkers: 'block', viewport: { width: 1360, height: 900 } }), een eigen page pb met pb.clock.setFixedTime(new Date('2026-11-02T10:00:00Z')) vóór de eerste goto, en een eigen go. Te controleren:
- ODS_3395: .md-wanneer bevat 'Wanneer gelden deze doelen?', 'Dit schooljaar (2026-2027): verplicht in het 1ste, 2de en 3de leerjaar', '4de leerjaar: verplicht vanaf 2027-2028' en 'waarschijnlijk'. De dt's van .md-feiten bevatten 'Moment' en 'Soort doelen' en niet 'Leerjaar', met 'Einde 4de leerjaar'.
- ODS_2110: '6de leerjaar: geldt tot en met 2027-2028' en het feit 'Geldig tot 31 augustus 2028'.
- ODS_3469: 'nog onzeker' en a[href$="/ODS_3408"] in .md-wanneer.
- ODS_2959: 'geen specifieke ontwikkelingsdoelen' zonder .md-wanneer-lijst.
- ODS_2104: .md-wanneer telt 0.
- ODS_3287 en ODS_3361: .md-wanneer telt 0; de dt's van ODS_3361 zijn ['Soort onderwijs','Graad','Leerjaar','Versie','Geldigheid','Aantal doelen','Nummer van de set'] (de stroom alleen als de set er een heeft: lees eerst de index na en leg de lijst letterlijk vast).
- De lijst met soort 'bao': de set ODS_2110 toont 'Geldig tot 31 augustus 2028'.
- Op 390 px: ODS_3395 met de details open scrollt niet horizontaal (eigen passtOpSmal op pb), met één main en één h1.
Sluit de context op het einde. De bestaande controles op regel 778-791, 889-911, 927-931 en 992-996 blijven letterlijk staan.
- Bundel, na npm run build:
- het kritieke leerlingpad blijft binnen het ongewijzigde budget van 334,6 kB (vite.config.ts:91-99);
- het aantal js-bestanden in dist/assets is gelijk aan dat van een build van de commit ervoor;
- grep -l 'Wanneer gelden deze doelen' dist/assets/*.js vindt alleen MinimumdoelenPage-*.js;
- grep -c 'nieuwe-minimumdoelen-in-het-basisonderwijs' dist/assets/index-*.js is 0;
- MinimumdoelenPage-*.js blijft onder 80 kB.
Daarna npm run lint (0 fouten, geen nieuwe waarschuwingen), npm run typecheck en npx vitest run.

## Acceptatie

- controleerKalender(INVOERINGSKALENDER) geeft [], en kalenderTegenGegevens(index) op de index van 1 november 2026 geeft ook [].
- basisSet bestaat voor precies 144 sets: 45 bao en 99 bubao. Daarvan zijn 56 nieuw (29 bao en 27 bubao) en 88 oud. Voor de 952 andere sets van de 1096 geeft basisSet undefined.
- Elke nieuwe set heeft een vak, een eindmoment en een golf. Bij alle 1996 nieuwe doelrijen is het eerste getal van de code gelijk aan vak.nr (0 afwijkingen). Bij alle 6554 basisdoelen is soortDoelVan(doel.type) gelijk aan set.soortDoelen (0 afwijkingen).
- Golf van de oude sets uit hun einddatum:
- bao: kleuter 3 in golf 1 (2026-08-31) en 3 in golf 2 (2027-08-31); lager 3 in golf 1 (2028-08-31) en 7 in golf 2 (2030-08-31);
- bubao: kleuter 5 en 12; lager 8 en 21;
- geen golf: de 22 bubao-sets die eindigen op 2020-08-31 en de 4 sets zonder einde (ODS_2306, ODS_2308, ODS_2331 en ODS_2354).
ODS_2302 en ODS_2327 (Type 2 Wereldoriëntatie) zitten in golf 2.
- leeg is waar voor precies ODS_2958 en ODS_2959, en dat zijn de enige sets met doelen met code 'INFO' (90245 en 90246).
- invoeringVanSet in 2026:
- ODS_3395: L1-L3 'verplicht' (waarschijnlijk), L4 'mag' met verplichtVanaf 2027 (waarschijnlijk);
- ODS_2110: L1-L3 'vervangen', L4 en L5 'geldt' met laatsteSchooljaar 2026, L6 'geldt' met 2027;
- ODS_2104: K1-K3 'vervallen' (zeker);
- ODS_3411: K1-K3 'mag' met verplichtVanaf 2027 (zeker);
- ODS_3401 en ODS_3485: K1-K3 'verplicht' (zeker);
- ODS_3469: L1-L3 'verplicht' (onzeker);
- ODS_2306: 'geldt' (zeker, geen einddatum).
In 2028 is ODS_3395 L4 'verplicht' en zeker.
- kalenderVoorSet:
- ODS_3408: [{L1, L2, L3: verplicht vanaf 2026, waarschijnlijk}, {L4: verplicht vanaf 2027, waarschijnlijk, met de opmerking over het getuigschrift}];
- ODS_3409: [{L5: 2027}, {L6: 2028}];
- ODS_2112: [{L1-L3: laatste schooljaar 2025}, {L4, L5: 2026}, {L6: 2027}];
- ODS_2959: [].
- setsDieGelden bao L3 2026:
- verplicht [ODS_3395, ODS_3406, ODS_3408];
- geldtNog [ODS_2108, ODS_2109, ODS_2111, ODS_2114, ODS_2115, ODS_2116, ODS_2117];
- magAl [ODS_3412, ODS_3415, ODS_3418, ODS_3421, ODS_3423, ODS_3426].
- setsDieGelden bao K2 2026:
- verplicht [ODS_3397, ODS_3401, ODS_3404, ODS_3405, ODS_3410];
- geldtNog [ODS_2102, ODS_2103, ODS_2107];
- magAl [ODS_3411, ODS_3414, ODS_3417, ODS_3420, ODS_3425].
- setsDieGelden bao L4 2026: verplicht [], 10 sets in geldtNog (ODS_2108 tot ODS_2117) en 9 in magAl. bao L6 2030: verplicht [ODS_3396, ODS_3407, ODS_3409, ODS_3413, ODS_3416, ODS_3419, ODS_3422, ODS_3424, ODS_3427, ODS_3428] en geldtNog []. bubao L3 2026: verplicht [ODS_3465, ODS_3467, ODS_3469] en leeg [ODS_2959].
- De xor-regel op de echte gegevens: 288 combinaties (2 soorten × 8 schooljaren 2024-2031 × 9 leerjaren × 2 golven), 0 fouten.
- Tweelingen:
- tweelingSets geeft ODS_3408 → [ODS_3469], ODS_3485 → [ODS_3397, ODS_3401], ODS_3484 → [ODS_3404, ODS_3405], ODS_3428 → [ODS_3483] en ODS_2110 → [];
- alle 998 doel-id's van de nieuwe bao-sets staan in hun tweeling, met dezelfde code en tekst en met soortDoel 'nastreven'.
- doelInfo Lichtkamer:
- 92729 in ODS_3410: K3, vak 3, nastreven;
- 92767 in ODS_3408: L4, vak 3, populatie; in ODS_3469: nastreven;
- 92833 in ODS_3409: L6, vak 3, populatie.
- geldigheidTekstBasis:
- precies 54 sets krijgen 'Geldig tot …' (13 bao en 41 bubao), bv. ODS_2110 'Geldig tot 31 augustus 2028' en ODS_2102 'Geldig tot 31 augustus 2027';
- ODS_3395 blijft 'Geldig sinds 2025' en ODS_2104 blijft 'Niet meer geldig (1998–2026)';
- bij alle 952 niet-basissets is de uitkomst gelijk aan geldigheidTekst.
- Rooktest met de klok op 2026-11-02:
- ODS_3395 toont 'Dit schooljaar (2026-2027): verplicht in het 1ste, 2de en 3de leerjaar', met 'Moment' en 'Einde 4de leerjaar' in de feiten en zonder 'Leerjaar';
- ODS_2110 toont '6de leerjaar: geldt tot en met 2027-2028';
- ODS_2104, ODS_3287 en ODS_3361 hebben 0 keer .md-wanneer;
- ODS_3361 houdt het feit 'Leerjaar';
- alle bestaande controles van 20b en 20b-2 blijven groen, en op 390 px scrollt niets horizontaal.
- Bundel:
- het kritieke leerlingpad blijft ≤ 334,6 kB zonder dat het budget verandert, en het aantal js-chunks blijft gelijk aan dat van de vorige commit;
- 'Wanneer gelden deze doelen' staat alleen in MinimumdoelenPage-*.js;
- de url van de vlaanderen-tabel staat 0 keer in index-*.js.
- Er verandert geen byte in public/, tools/, minimumdoelenBron.ts, minimumdoelen.ts, curriculum*.ts of doelgroep.ts. Er komt geen nieuwe sleutel in localStorage of IndexedDB.

## Pakketten

### P1. De invoeringskalender als gegevens

Agent: bouwer (sonnet) schrijft; nakijker (sonnet) controleert cel per cel tegen de spec.

Schrijf src/lib/basis/kalender.ts:
- de types en constanten uit het datamodel;
- INVOERINGSKALENDER, letterlijk volgens de invoeringstabel: 15 bronnen, 10 vakken, golfIndeling en 36 cellen, met de opmerkingen woord voor woord;
- schooljaarVan, schooljaarVanDatum, schooljaarTekst, celVoor, laatsteVanaf, eindeOudVoor en controleerKalender.
Importvrij en alleen erasable TypeScript. Schrijf kalender.test.ts met de kalendertests uit 'tests'.
Daarna vergelijkt de nakijker elke cel (jaar, zekerheid, bron-id's, opmerking), elke url en elke 'hoe' met de invoeringstabel van deze spec. Twijfel gaat naar de rechter.
Poort: npx vitest run src/lib/basis/kalender.test.ts, npm run typecheck en npm run lint.
Niet aanraken: alles buiten deze twee bestanden. Agents committen niet.

Bestanden: `src/lib/basis/kalender.ts`, `src/lib/basis/kalender.test.ts`

### P2. Het momentmodel en de teksten

Agent: bouwer (sonnet).

Schrijf src/lib/basis/moment.ts met soortDoelVan, vakVanKorteNaam, basisSet, golfVanOudeSet, invoering, invoeringVanSet, kalenderVoorSet, setsDieGelden, tweelingSets, doelInfo, geldigheidTekstBasis en kalenderTegenGegevens, precies zoals in 'functies'. Schrijf src/lib/basis/momentTeksten.ts met de letterlijke teksten uit 'functies', met satisfies Record<…>, en leerjarenTekst.
Importeer alleen de bestaande exports van minimumdoelenBron.ts (geen nieuwe export erbij), de types van minimumdoelen.ts en ./kalender. Geen React, geen fetch, geen localStorage, geen Date.now().
Schrijf moment.test.ts met de nagebootste tests uit 'tests', ook die met de nagebootste kalender.
Poort: npx vitest run src/lib/basis, lint (0 fouten, geen nieuwe waarschuwingen) en typecheck.
Niet aanraken: minimumdoelenBron.ts, minimumdoelen.ts, kalender.ts (fouten in de gegevens meld je aan de hoofdsessie), curriculum*, doelgroep.ts, setKeuze.ts, public/ en tools/.

Bestanden: `src/lib/basis/moment.ts`, `src/lib/basis/moment.test.ts`, `src/lib/basis/momentTeksten.ts`

### P3. De controle op de echte gegevens (een andere agent dan die van P2)

Agent: bouwer (sonnet), een andere agent dan die van P2: schrijven en controleren apart.

Schrijf src/lib/basis/momentmodel.echt.test.ts uit de signaturen in 'functies', de tests op de echte gegevens en de lijst 'acceptatie'. Gebruik de wacht van minimumdoelenBron.test.ts:689-694 en existsSync per bestand. Test verbanden, en per set-id de acceptatievoorbeelden. Dit pakket mag parallel met P2 lopen zodra P1 klaar is.
Kleurt een test rood op de code van P2, dan meldt de agent dat aan de hoofdsessie, met set-id en verwachting, en past hij de code niet aan.
Poort: npx vitest run.
Niet aanraken: alle andere bestanden en public/.

Bestanden: `src/lib/basis/momentmodel.echt.test.ts`

### P4. Het blok op de pagina Officiële minimumdoelen

Agent: bouwer (sonnet).

Pas dit pakket pas na P2 en P3 toe, als die groen zijn. Inhoud:
(1) src/components/basis/WanneerGelden.tsx en WanneerGelden.test.ts zoals in 'functies' en 'tests', met src/styles/basis-moment.css.
(2) MinimumdoelenPage.tsx: alleen de wijzigingen uit 'schermen'. Dat zijn basisInfo en schooljaar in SetPaneel, de feiten 'Moment' en 'Soort doelen' alleen voor basissets, geldigheidTekstBasis op regel 314 en 426, en het blok tussen {verouderd && …} en {stem && …}.
(3) Het rooktestdeel 20b-3 uit 'tests', met een vaste klok op een eigen page.
Poort: de hele kwaliteitspoort uit CLAUDE.md (lint, typecheck, vitest, build, preview en PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs), plus de greps en de chunktelling uit de bundeltest.
Niet aanraken: geldigheidTekst, filterSets, setKenmerken, opvolgersVan, heeftActueleSets, de filters en hun labels, Samenstellen, de inleeswizard, SetsKiezen, App.tsx, vite.config.ts, EAGER_ICON_NAMES en de bestaande controles in smoke.mjs.

Bestanden: `src/components/basis/WanneerGelden.tsx`, `src/components/basis/WanneerGelden.test.ts`, `src/styles/basis-moment.css`, `src/pages/MinimumdoelenPage.tsx`, `tests/smoke.mjs`

### P5. Review vanuit drie invalshoeken

Agent: reviewer (sonnet, 3x) en rechter (opus).

Drie reviewers lezen, elk vanuit één invalshoek:
(a) datums en kalender: de grens van 1 september, de volgorde van de regels in invoering, de zekerheidsregel en de ophoging, golfVanOudeSet, lege sets, sets zonder einde en de tolerante redenen;
(b) secundair, opslag en bundel: het verschil in MinimumdoelenPage alleen achter basisInfo, geldigheidTekstBasis gelijk aan geldigheidTekst buiten basis, niets bewaard, geen nieuw chunk, geen import van src/lib/basis buiten MinimumdoelenPage;
(c) toegankelijkheid en taal: één main en één h1, de h3, badges als tekst, links in een nieuw tabblad met sr-only, geen kale url's, 390 px, de termen uit CLAUDE.md en Vlaams Nederlands.
De rechter bevestigt of weerlegt elke bevinding. Alleen bevestigde bevindingen gaan terug naar P2 of P4.

Bestanden: 

### P6. Integratie, geheugen en commit

Agent: hoofdsessie (opus).

Draai de hele kwaliteitspoort opnieuw. Werk dan docs/BASISONDERWIJS.md bij:
- in de stand van zaken (regel 40): het momentmodel is klaar;
- een § 'Momentmodel' met de tabel van de cellen met zekerheid en bron, de regels 'het model bewaart niets' en 'de soort doel hoort bij (doel, set)', een verwijzing naar src/lib/basis/kalender.ts en moment.ts, en de open punten: de officiële tabel nalezen (met de twee url's die nog te lezen zijn) en de vraag over het buitengewoon lager.
Commit op claude/bookwidgets-web-app-kvcfim.

Bestanden: `docs/BASISONDERWIJS.md`

## Risico's

- De lagercellen steunen alleen op zoekfragmenten: golf 1 L1 tot L6 en golf 2 L1 tot L6. Niemand opende een primaire bron (curl 000, proxy 403). De controle tegen de API vangt alleen de laatste cel per moment, niet een verkeerd jaar daarbinnen (bv. golf 2 L5 in 2028 in plaats van 2029). Remedie: de labels 'waarschijnlijk' en 'nog onzeker' staan altijd in beeld, de bronnen 'nog na te lezen' staan erbij, en bijwerken raakt één bestand. Dat wacht op de eigenaar.
- Het buitengewoon lager werkt vaak in leeftijdsgroepen en met een individueel aangepast curriculum, en de oude sets bestaan per type. setsDieGelden geeft voor bubao L3 in 2026 22 oude sets van verschillende types (r5_spec.py). Geen scherm toont die lijst in 2b. Bouwstap 3 heeft een keuze per type nodig voor ze getoond wordt.
- Twee waarheden. De lijst en de filter 'actueel' lezen het label 'Geldig', dat vastligt op de ophaaldatum; het blok rekent met datums. Tussen 1 september en de ophaling van de 3de kan de lijst een oude set nog als 'Geldig tot 31 augustus …' tonen terwijl het blok 'geldt niet meer' zegt. De tekst blijft juist.
- Verschuift een decreet de invoering, dan verandert de API een einddatum. Dan falen kalenderTegenGegevens en de xor-test in de maandelijkse data-PR, en die blijft hangen tot de kalender bijgewerkt is. Dat is bedoeld als alarm. Afspraak: de hoofdsessie werkt de kalender dezelfde dag bij.
- Een nieuwe basisset met een vak dat niet in de tabel staat, bv. nieuwe doelen voor Vlaamse gebarentaal, of een van de ontbrekende nummers 3398-3400, 3402, 3403 of 3457-3459, geeft 'onbekend-vak'. Het model blijft dan werken, maar de gegevenstest faalt. Zo'n set komt er pas bij als de standaardfilter van de ophaling verruimd wordt (BASISONDERWIJS.md:36).
- Bundel: het leerlingpad heeft maar 0,1 kB marge, en die meting komt uit dist van 09:34, vóór 259a22b. Importeert een tweede lui geladen module moment.ts, dan maakt Rollup een gedeeld chunk en wordt de preloadlijst langer. In 2b importeert alleen MinimumdoelenPage het blok. Bouwstap 3 (/basis) moet het budget bewust verhogen.
- src/lib/basis/toestel.ts (bouwpakket 8) komt in dezelfde map en zit op het leerlingpad, want PlayerPage importeert het. Het mag nooit kalender.ts of moment.ts importeren. De grep op de url van de vlaanderen-tabel in index-*.js is de echte poort, want onder 5 % groei geeft het budget alleen een waarschuwing.
- De lijn 'Dit schooljaar' volgt de klok van het toestel. Een verkeerde datum geeft een verkeerd schooljaar, maar het blok noemt het schooljaar altijd uitdrukkelijk. De tijdloze regels hangen niet van de datum af.
- De opmerking over het getuigschrift bij golf 1, 4de leerjaar komt uit een zoekfragment (memorie van toelichting bij Onderwijsdecreet XXXVI). Het is geen advies van de app, en de cel staat op 'waarschijnlijk'.
- Instapklas en peuterklas krijgen geen eigen leerjaar: ze vallen onder de kleuterklassen met dezelfde cellen. Waarschijnlijk juist, maar niet nagekeken.

## Bewust niet nu

- Een filter 'Moment', 'Leerjaar' of 'Schooljaar' in de lijst, en een blok 'Wat geldt voor mijn klas?' met keuze van leerjaar en vak. Dat komt in de eigen ingang /basis (bouwstap 3, BASISONDERWIJS.md:107-108), op setsDieGelden. De rooktest eist standaard alle sets (smoke.mjs:782-791).
- Een koppeling van oude op nieuwe vakken (Mens en maatschappij, Leren leren, Sociale vaardigheden, Wereldoriëntatie). Die staat niet in de bron en vraagt een inhoudelijke vergelijking (inhoudschrijver, nakijker en rechter). Het model werkt per golf en heeft ze niet nodig.
- Het type van de klas in het buitengewoon basisonderwijs (Type 2, 3, 7, Basisaanbod; typeVanSet exporteren) en leeftijdsgroepen. Nodig voor /basis voor bubao-lijsten getoond worden.
- Doelkaart, leerlijn over de momenten (extra.titels), de sleutel 'L4 3.5.4' en zoekOpSleutel (ontwerp 3). De sleutel is uniek nagerekend (998 van 998 per soort) en kan later bovenop, voor de lesplannen van het GO! en de Lichtkamer.
- momentVanRef(ref, index): een eenregelige hulp op basisSet voor bewaarde verwijzingen. Komt mee met bouwstap 4.
- Een uitleg per soort doel ('op populatieniveau', 'individueel', 'na te streven'). Die moet uit de decreettekst komen, via inhoudschrijver en nakijker, zodra die tekst leesbaar is. In 2b staat alleen het officiële label.
- [F], [I] en [I/F] in wiskunde, en het veilig en offline tonen van HTML, MathML en de afbeeldingen van assets.vlaanderen.be (doel 92830).
- De standaardfilter van de maandelijkse ophaling verruimen tot het basisonderwijs, en nagaan waarom de nummers 3398-3400, 3402, 3403 en 3457-3459 ontbreken.
- Moment, leerjaar of doelgroep van het basisonderwijs bewaren in een leerplan, cursus of klas. Dat vraagt een nieuw formaat naast Doelgroep ('so'|'buso'), met saneren en migratie (bouwpakket 4 of later).
- 'Geldig tot' en geldigheid op datum in Samenstellen en de inleeswizard, en de filter 'actueel' op datum in plaats van op het label.
- Een keuze van het schooljaar in het blok (vooruitkijken). De tijdloze regels tonen al 'verplicht vanaf …'.
- Leerlijnlabels per doel-id voor de Lichtkamer: 6 van de 10 id's zijn algemene onderzoeksdoelen zonder lichtwoord. Dat hoort bij bouwstap 4 en 5, in het pakketmanifest.
- De officiële tabel nalezen en de cellen op 'zeker' zetten. Dat wacht op de eigenaar (hosts toelaten of zelf bevestigen).

## Beslissingen voor de eigenaar

- De officiële invoeringstabel. Geen enkele officiële pagina was te openen. De app toont daarom bij het lager onderwijs 'waarschijnlijk', ook bij het 1ste tot 3de leerjaar dit schooljaar. Voorstel: laat in de netwerkinstellingen van de omgeving www.vlaanderen.be, codex.vlaanderen.be en data-onderwijs.vlaanderen.be toe. Dan leest de hoofdsessie de overgangsbepaling en zet ze de cellen op 'zeker'; alleen het kalenderbestand verandert. Kan dat niet, kijk dan zelf de tabel op vlaanderen.be na en bevestig of verbeter deze jaren. Nederlands, wiskunde en wetenschap en techniek: 1ste tot 3de leerjaar 2026-2027, 4de en 5de 2027-2028, 6de 2028-2029. De andere vakken: 1ste tot 3de leerjaar 2027-2028, 4de 2028-2029, 5de 2029-2030, 6de 2030-2031. De kleuterklassen staan al vast in de gegevens: 2026-2027 en 2027-2028.
- Het buitengewoon lager onderwijs. Geen enkele bron zegt hoe de invoering daar per leerjaar loopt, en er wordt vaak in leeftijdsgroepen gewerkt. De oude doelen eindigen wel op dezelfde dagen als in het gewoon onderwijs. Voorstel: dezelfde jaren tonen als in het gewoon lager, met het label 'nog onzeker' en één zin uitleg. Weet u, of het GO!, hoe het buitengewoon lager het doet, dan passen we alleen de kalender aan.

## Wat de eerste echte bron moet bevestigen

Drie dingen moeten eerst bevestigd zijn voor iemand verder bouwt.

(1) De officiële bron voor de lagercellen. Dat is het overgangsartikel van het decreet basisonderwijs of de tabel op https://www.vlaanderen.be/onderwijs-en-vorming/leerstof/onderwijsdoelen/nieuwe-minimumdoelen-in-het-basisonderwijs. Ze moet de 12 lagercellen van het gewoon basisonderwijs bevestigen, vooral de jaren die alleen uit zoekfragmenten komen:
- golf 1: 1ste tot 3de leerjaar 2026-2027, 4de en 5de 2027-2028;
- golf 2: 1ste tot 3de leerjaar 2027-2028, 4de 2028-2029, 5de 2029-2030.
Pas dan mag bouwstap 3 een lijst 'wat geldt voor mijn klas' tonen die leerkrachten als antwoord lezen.

(2) De volgende maandelijkse ophaling op 3 december 2026. kalenderTegenGegevens, de xor-test en de tweelingtest moeten groen blijven op verse gegevens: dezelfde einddata (2026-08-31, 2027-08-31, 2028-08-31, 2030-08-31) en geen nieuwe basisset zonder vak.

(3) Een verse build. Die moet bevestigen dat het kritieke leerlingpad onder 334,6 kB blijft en dat het aantal chunks niet groeit; de bekende meting komt uit dist van 09:34, vóór commit 259a22b.

## Rechtzettingen van de criticus (gaan voor op de spec)

### Wat niet klopt

- **Spec:** Risico's: 'Dan falen kalenderTegenGegevens en de xor-test in de maandelijkse data-PR, en die blijft hangen tot de kalender bijgewerkt is.' (ook in eersteEchteControle punt 2)
  **Werkelijk:** Er komt dan helemaal geen pull request. De stap 'Pull request openen' heeft 'if: success()' en komt na de stap 'npx vitest run' met 'set -euo pipefail'. De run haalt in één keer minimumdoelen, studierichtingen, doelen per richting en beroepskwalificaties op. Een rode kalendertest voor het basisonderwijs blokkeert dus ook de update van het secundair, de richtingen en de kwalificaties. De gewijzigde gegevens staan alleen op de runner (alleen het rapport wordt als artifact bewaard), dus 'de hoofdsessie werkt de kalender dezelfde dag bij' kan niet op de nieuwe bestanden rusten. Het scenario is realistisch: de verkenner noemt voorstel van decreet 674 dat de invoering een jaar wilde uitstellen. Ernst middel, zekerheid zeker (code).
  **Bewijs:** .github/workflows/minimumdoelen.yml regel 157-160 (vitest-stap), 542-543 (stap 'Pull request openen' met if: success()), 1-8 en 62 (één run voor alles, cron '23 5 3 * *'); de opties onderdelen/groepen slaan vitest niet over.
- **Spec:** invoeringstabel: golfIndeling.zekerheid 'zeker' en de K-cellen van golf 2 (bao en bubao) 'zeker'; acceptatie 'ODS_3411: K1-K3 mag met verplichtVanaf 2027 (zeker)'. Reden: 'de oude sets van precies NL, WI en W&T eindigen in 2026 of 2028, de rest in 2027 of 2030'.
  **Werkelijk:** De gegevens koppelen alleen die vakken aan een golf waarvan de oude set dezelfde naam draagt: Nederlands, wiskunde en W&T (golf 1), LO, muzische vorming, ICT en Frans (golf 2). Voor aardrijkskunde, geschiedenis en attitudes (nieuwe vakken 4, 5 en 9) bestaat er geen enkele oude basisset met die naam. De korteNamen van alle 88 oude sets bevatten die woorden nergens (c7.py). Voor die drie vakken, waaronder ODS_3411, ODS_3414 en ODS_3425 voor de kleuters, steunt 'golf 2' alleen op de zoekfragmenten van het decreet. De spec zegt zelf dat de koppeling oud-nieuw 'niet in de bron staat'. De regel in controleerKalender ('zeker' vraagt een bron met hoe gegevens of gelezen) passeert hier formeel door de bron 'api', maar die bron bewijst de vak-golfindeling niet. Zo wordt 'zeker' toch op zoekfragmenten gezet, wat de spec uitsluit. Ernst middel, zekerheid zeker.
  **Bewijs:** c2.py en c7.py in (scratchpad van de ontwerpsessie, niet bewaard) momentmodel/crit/: oude korteNamen zijn Alle leergebieden, Communicatie..., Frans, Ict, Leren Leren, Lichamelijke Opvoeding, Mens en maatschappij, Motorische..., Muzische Vorming, Nederlands, Sociaal-Emotionele Ontwikkeling, Sociale Vaardigheden, Wereldoriëntatie, Wetenschappen en techniek, Wiskunde...; geen aardrijkskunde, geschiedenis of attitudes.
- **Spec:** WanneerGelden (9): onderaan 'Kalender nagekeken op 2 november 2026.', met nagekekenOp '2026-11-02' en geraadpleegd '2026-11-02' bij alle 15 bronnen.
  **Werkelijk:** Geen enkele bron is geopend (de spec zegt zelf: 'door niemand geopend'), en de officiële tabel is niet gelezen. In deze app betekent 'nagekeken' dat een mens of de nakijkpoort iets gecontroleerd heeft (leerplannen 'nagekeken'). De leerkracht leest dus een geruststelling die de spec elders ontkent. Ernst middel, zekerheid zeker (tekst in de spec).
  **Bewijs:** Spec, WanneerGelden punt (9) en de bronnenlijst ('De url's ... zijn door niemand geopend'); src/pages/MinimumdoelenPage.tsx:447 gebruikt 'nagekeken' voor een gecontroleerd leerplan.
- **Spec:** WanneerGelden (2): bij een oude set 'Oude eindtermen voor het hele lager onderwijs' of 'Oude ontwikkelingsdoelen voor het hele kleuteronderwijs' (de keuze volgt het moment).
  **Werkelijk:** Het woord hangt niet af van het moment maar van de soort doelen. Alle 10 oude bao-lagersets zijn Eindtermen, maar alle 53 oude bubao-lagersets zijn Ontwikkelingsdoelen. Een tekst per moment zegt bij die 53 sets 'eindtermen', terwijl het feit 'Soort doelen' in hetzelfde paneel 'Ontwikkelingsdoelen (oud)' zegt. Ernst laag, zekerheid zeker.
  **Bewijs:** Telling (soort, moment, soort doelen) over de oude sets: bubao lager ontwikkelingsdoelen 53, bubao kleuter ontwikkelingsdoelen 19, bao lager eindtermen 10, bao kleuter ontwikkelingsdoelen 6 (scratchpad .../crit/c7.py en de telling na c4.py).
- **Spec:** WanneerGelden geeft null als alles vervallen is, 'de bestaande melding md-verouderd zegt het dan al'.
  **Werkelijk:** md-verouderd hangt aan het label (geldigheid 'N' of oudere versie), dat vastligt op de ophaaldatum. Op 1 september 2027 (kleuter golf 2: ODS_2102, 2103, 2107 en 12 bubao-sets), 2028 en 2030 zegt het model 'vervallen' terwijl het label nog 'Geldig' is, tot de maandelijkse pull request is samengevoegd. Dan geeft het blok niets en toont de pagina geen melding, maar wel 'Geldig tot 31 augustus 2027'. De spec noemt 'twee waarheden' als risico, maar de beweringen 'zegt het dan al' en 'de tekst blijft juist' gelden niet voor dat venster. Ernst laag tot middel, zekerheid zeker (code).
  **Bewijs:** src/pages/MinimumdoelenPage.tsx:403-405 (verouderd = code === 'N' || oudereVersie) en 469 (melding alleen bij verouderd); data: geldigTot 2027-08-31 bij 15 sets met label Geldig.
- **Spec:** Rooktest: 'nieuw deel 20b-3. Momentmodel basisonderwijs direct na 20b-2'.
  **Werkelijk:** 20b-3 bestaat al: '20b-3. Eigen doelenlijst samenstellen' (kop en console.log). Dubbele nummering maakt de uitvoer en latere verwijzingen dubbelzinnig. Ernst laag, zekerheid zeker. Kies bijvoorbeeld 20b-2b.
  **Bewijs:** tests/smoke.mjs:1009-1010.
- **Spec:** Schermen: 'Alleen regel 314 en regel 426 gebruiken geldigheidTekstBasis'. Op de pagina wijzigt verder niets aan de geldigheidstekst.
  **Werkelijk:** Regel 510 in dezelfde pagina toont bij de opvolgers van een oude set nog geldigheidTekst(o). Een opvolger die een oude maar nog geldende set is (bv. ODS_2571, Basisaanbod Nederlands, tot 2028, die de rooktest bij ODS_2311 verwacht) staat in de lijst als 'Geldig tot 31 augustus 2028' en in de opvolgerlijst als 'Geldig sinds 2020'. Ernst laag, zekerheid zeker.
  **Bewijs:** src/pages/MinimumdoelenPage.tsx:510; tests/smoke.mjs:899-911 (ODS_2311 verwacht ODS_2571).
- **Spec:** Echte-gegevenstest: 'generatie nieuw valt samen met versie 2.0'.
  **Werkelijk:** Vermoeden: de versie is geen stabiel kenmerk van 'nieuw'. In dezelfde index staan secundaire sets met versie 2.1 (bv. ODS_3287, ODS_3361), dus een rechtgezette publicatie van een basisset kan 2.1 worden. De test faalt dan in de data-run (zie het eerste punt: dat blokkeert de hele update) zonder dat er iets mis is. Gebruik liever de naam of geldigVan >= 2025-09-01 als tegenhanger. Ernst laag, zekerheid vermoeden.
  **Bewijs:** public/leerplannen/minimumdoelen/index.json: ODS_3287 en ODS_3361 hebben versie 2.1.

### Wat ontbreekt

- **Een niet-blokkerende route voor afwijkingen van de kalender tegen de gegevens** (ernst middel). De kalendertests op de echte gegevens (kalenderTegenGegevens, xor, tweelingen) staan in dezelfde vitest-run die de maandelijkse pull request voorafgaat. Een verschoven einddatum in de API of een nieuwe basisset zonder vak laat de hele update van alle leerplangegevens (ook secundair, richtingen en kwalificaties) niet doorgaan (.github/workflows/minimumdoelen.yml:157-160, 542-543). Zekerheid: zeker. **Voorstel:** Laat in de data-run alleen structuurfouten falen (vorm van de gegevens, tweelingen, xor). Geef einddatum- en vakafwijkingen via een apart rapport in de pull request (tekst of waarschuwing), of draai die test in een eigen workflowstap met continue-on-error en een zichtbare melding. Vermeld in de spec en in docs/BASISONDERWIJS.md wat er gebeurt als de run rood wordt en hoe je de nieuwe einddata leest (het artifact minimumdoelen-rapport).
- **Bij een oude, deels vervangen set staat geen verwijzing naar de nieuwe sets, en de status 'vervangen door de nieuwe minimumdoelen' beweert een koppeling die de spec elders afwijst** (ernst laag). opvolgersVan staat alleen in het blok md-verouderd (labels 'Niet meer geldig'). Een leerkracht die ODS_2110 opent ('Geldig tot 31 augustus 2028', md-verouderd afwezig) leest 'vervangen door de nieuwe minimumdoelen in het 1ste, 2de en 3de leerjaar' zonder link naar ODS_3395 of ODS_3396. tweelingSets geeft voor oude sets []. Voor oude sets zonder tegenhanger (Leren leren ODS_2115, Sociale vaardigheden ODS_2116, Mens en maatschappij ODS_2107 en ODS_2111, Frans in het 1ste tot 4de leerjaar omdat de nieuwe Frans-set alleen het 5de en 6de dekt) is 'vervangen door' niet te staven. De spec zet die koppeling zelf bij 'nietNu' omdat ze niet in de bron staat. Zekerheid: zeker (code en gegevens). **Voorstel:** Toon in het blok bij een oude set die nog geldt of deels vervangen is dezelfde sets als bij opvolgersVan, of laat 'vervangen' weg ten voordele van 'niet meer verplicht; de nieuwe minimumdoelen gelden' zonder set te noemen. Neem het geval 'oude set zonder nieuwe tegenhanger' op in de tests.
- **Bij de bronnen in het blok ontbreekt de vak-golfindeling zelf** (ernst laag). golfIndeling (welk vak in welke golf, met bronnen decreet-2025 en kenniswest) draagt elke uitkomst voor aardrijkskunde, geschiedenis, ICT, attitudes en Frans, maar het blok toont alleen de bronnen van de cellen (punt 9). De bronnen decreet-2025 en klasse-momenten verschijnen daardoor nooit en de leerkracht ziet niet waarom 'verplicht vanaf 2027-2028' bij een set staat. Zekerheid: zeker (spec). **Voorstel:** Toon bij een nieuwe set één zin 'Dit vak hoort bij de eerste/tweede golf' met de zekerheid van golfIndeling en de bronnen ervan in 'Waarop steunt dit?'.
- **P6 en docs/BASISONDERWIJS.md: vier plaatsen die na dit werk niet meer kloppen of door de spec tegengesproken worden** (ernst laag). (1) Regel 54-55 beweert dat de rubrieken (onderwerp en subthema) 'per vak op elk moment dezelfde zijn': voor wiskunde zijn de subthema's 15, 23 en 24 per moment, en bij ICT zijn de onderwerpen 3 en 4 zonder kleuterset (scratchpad .../crit/c7.py). (2) Regel 36 zegt dat een nieuwe set van de tweede golf er niet vanzelf bijkomt, terwijl de 56 sets al alle tien de vakken van beide golven dekken; en 'de 146 basissets' zijn 144 plus de lerarenopleidingen ODS_2842 en ODS_2843. (3) Regel 107-108 noemt 'Geldig tot' en de tweelingregel als zaken voor het eigen deel, terwijl de spec ze nu bouwt. (4) De rij 'standaardfilter verruimen hoort bij bouwstap 2' blijft 'Wacht' maar de spec zet het bij nietNu zonder dat P6 dat benoemt. Zekerheid: zeker. **Voorstel:** Voeg aan P6 toe dat deze vier plaatsen worden bijgewerkt, met de data-aantallen (144 en 56) en de afspraak dat het ophaalfilter pas met bouwstap 3 verruimd wordt.

### Nagerekend en juist

- 144 basissets: 45 bao en 99 bubao. Daarvan 56 nieuw (29 bao, 27 bubao, allemaal versie 2.0 en geldigVan 2025-09-01) en 88 oud; 952 van de 1096 sets vallen buiten het model. Script (scratchpad van de ontwerpsessie, niet bewaard) momentmodel/crit/c1.py en c7.py.
- Het laatste naamdeel van de 144 sets heeft precies 5 waarden (Eindtermen 10, Ontwikkelingsdoelen 78, drie keer Te bereiken/Na te streven minimumdoelen 56). soortDoelVan(doel.type) is gelijk aan de soort doelen uit de setnaam bij 6554 van 6554 doelen (0 afwijkingen), c4.py.
- Het vak uit korteNaam past bij alle 56 nieuwe sets op de vaktabel 1 tot 10, en het eerste getal van de code is gelijk aan dat vak bij alle 1996 nieuwe doelrijen (0 afwijkingen). Het eindmoment is voor alle 56 af te leiden (leerjaar of naam). c2.py en c4.py.
- leeg is waar voor precies ODS_2958 en ODS_2959, en dat zijn de enige sets met een doel met code 'INFO' (90245 en 90246). c4.py en de INFO-telling.
- Golf van de oude sets uit geldigTot: bao kleuter 3 en 3, bao lager 3 en 7, bubao kleuter 5 en 12 (met de lege ODS_2958), bubao lager 8 en 21 (met de lege ODS_2959); 22 bubao-sets (2020-08-31) en 4 zonder einde krijgen geen golf; ODS_2302 en ODS_2327 vallen in golf 2. c2.py en c3.py.
- De lijsten van setsDieGelden uit de acceptatie komen exact terug met een Python-nabootsing van de regels (c5.py): bao L3 2026, bao K2 2026, bao L4 2026 (10 geldtNog, 9 magAl), bao L6 2030 (10 verplicht, 0 geldtNog) en bubao L3 2026 (3 verplicht, 22 oude sets in geldtNog, ODS_2959 in leeg). De xor-regel geeft 288 combinaties met 0 fouten.
- Tweelingen op vak en eindmoment: alle 998 doel-id's van de nieuwe bao-sets staan in precies één set uit tweelingSets, met dezelfde code en tekst en type 'Na te streven'; omgekeerd ook voor bubao (c6.py). ODS_3408 geeft ODS_3469, ODS_3485 geeft ODS_3397 en ODS_3401, ODS_3484 geeft ODS_3404 en ODS_3405, ODS_3428 geeft ODS_3483.
- doelInfo van de Lichtkamer: 92729 staat in ODS_3410 (K3, vak 3, na te streven); 92767 in ODS_3408 (L4, populatie) en in ODS_3469 (na te streven); 92833 in ODS_3409 (L6, populatie) en in ODS_3470 (na te streven). c6.py.
- 'Geldig' met een geldigTot komt in de hele index alleen voor bij 54 basissets (13 bao, 41 bubao); geen enkele set van het secundair. Dus geldigheidTekstBasis verandert daar niets. De lijst met feiten van ODS_3361 (Soort onderwijs, Graad, Leerjaar, Versie, Geldigheid, Aantal doelen, Nummer) klopt, want de set heeft geen stroom. Index-uitvoer van de controle.
- De cohortregel in de spec (G = j + 6 - n) geeft de 12 lagercellen van de tabel terug voor beide golven (handrekening). Dat blijft een interne controle, geen bewijs van de regel zelf.
- Techniek: page.clock.setFixedTime wordt in tests/smoke.mjs al gebruikt (regel 3160 en 3241) met playwright-core 1.62.1; de bestaande controle op .md-acties a[target=_blank] (regel 810) telt links buiten .md-wanneer niet mee; de wacht-aanpak van de echte-gegevenstests staat in src/lib/minimumdoelenBron.test.ts:689-694; alle benodigde exports staan al in src/lib/minimumdoelenBron.ts (regels 158, 169, 193, 209, 222, 252, 364); componenttests met createElement en een css-import bestaan al (src/components/richting/RichtingDekking.test.ts); de map src/lib/basis bestaat nog niet en wordt door docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md:222 al voorzien.
