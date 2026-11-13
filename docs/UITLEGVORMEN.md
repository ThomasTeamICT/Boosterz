# Uitlegvormen: een vaste set manieren om leerstof aan te brengen

Ontwerp van 13 november 2026, op vraag van de eigenaar: "Ik zou een paar consequente, basisgoede mogelijkheden willen hebben om
het deftig uitgelegd te krijgen." Een lesplan of cursus met wat interactiviteit moet de uitleg op een vaste, herkenbare manier
kunnen aanbrengen. De **bordles** is de eerste van die uitlegvormen. Het werkend voorbeeld staat in `tools/prototypes/bordles/`
(los te openen in de browser; ook gepubliceerd als demo voor de eigenaar).

## Stand van zaken

| Wat | Stand | Op wie |
|---|---|---|
| Demo bordles (Pythagoras: kijk mee, doe mee, zoek de fout, alleen), met hand en krijt, vijf handposes en instelbare snelheid | **Klaar en goedgekeurd** (13 november 2026): "dat is een heel pak beter", "de rest van de animatie vind ik wel geslaagd" | eigenaar |
| Handafbeeldingen in vijf poses (schrijven, lijn, opgetild, wijzen, tikken) | **Aangeleverd** door de eigenaar (13 november 2026), bewerkt in `tools/prototypes/bordles/handen/` (krijtstreep weg, mouw vervaagd, krijtpunt opgemeten in `krijtpunten.json`) | klaar |
| Dit ontwerp: de set uitlegvormen (§ 1) en het lesgeraamte (§ 2) | **Aangevuld** (13 november 2026) met zeven didactische punten (§ 4), op vraag en met akkoord van de eigenaar; de set blijft vier vormen | klaar |
| Lesformaat en controle (BL-1) | **Klaar** (13 november 2026): `BordlesConfig` in `src/lib/types.ts`, controle en antwoordregels in `src/lib/bordles/formaat.ts` (met tests). Afwijkend van § 3.2: elementen hebben een optionele `id` en `vervangt` (een later element doet een eerder verdwijnen), en de oplossing van een invulstap komt als gewone stap erna in plaats van met een aparte vlag | klaar |
| Tekenmotor (BL-2) | **Klaar** (13 november 2026): `src/lib/bordles/vormen.ts` (zuiver: paden, timing, met tests) en `src/lib/bordles/motor.ts` (hand met vijf poses, schrijven met een knipvlak, krijtstof, afmaken met een tik). De handen als WebP in `public/bordles/` (niet in de voorcache), het krijtlettertype Patrick Hand lokaal (`src/assets/fonts/`) | klaar |
| Speler en eenvoudige editor (BL-3) | **Gebouwd** (13 november 2026): oefeningssoort `bordles` (categorie Beeld & verkennen), `src/widgets/bordles.tsx` en `src/styles/bordles.css`. Instapvraag met overslaan, de vier fases, deeldoelen, waaromvraag, invul met gekende fouten en hintladder (na 3 pogingen de oplossing), keuze, zekerheid, klasmoment in de bordstand, woorden, snelheid, voorlezen, resultaten (invul- en keuzestappen buiten Kijk mee, 'oplossing getoond' telt niet). De editor start van de voorbeeldles Pythagoras (`src/lib/bordles/voorbeeldPythagoras.ts`) en laat de les als JSON aanpassen. Rooktest `tests/bordles.mjs`. Budget van het leerlingpad bewust verhoogd met 0,5 kB (icoon) | hoofdsessie |
| Review van BL-1 tot BL-3 (correctheid, toegankelijkheid, Safari 14) | **Klaar** (13 november 2026): een reviewer vond 12 punten, door de hoofdsessie nagekeken en alle verwerkt (o.a. de hand na 'nog eens bekijken', een klasmoment telt niet als eigen werk, het cijfertoetsenbord alleen bij een getal zonder teken, focus na een foute keuze, unieke id's, Afronden nooit met een pijltoets). Kwaliteitspoort groen: lint, typecheck, 8500+ unittests, build, rooktest (1403 checks), Safari 14, `tests/bordles.mjs` (33 checks) | klaar |
| Formules (BL-4) | **Wacht**; tot dan schrijft een les formules als tekst (², √, ·) | bouwer |
| Bordles: editor voor de leerkracht (BL-5, BL-6) | **Wacht** | bouwer |
| Bordles: AI-voorstel in de AI-studio (BL-7) | **Wacht** | hoofdsessie |
| Voorbeeldlessen en rooktest (BL-8, BL-9) | **Wacht** | inhoudschrijver, nakijker, bouwer |
| De andere uitlegvormen (§ 1, nummer 2 tot 4) | **Later**, na de bordles | eigenaar kiest de volgorde |

## 1. De set: welke uitlegvorm bij welk soort leerdoel

Het uitgangspunt: de vorm volgt uit **wat** de leerling moet leren, niet uit wat er technisch kan. Zo kiest een leerkracht (of de
AI-cursusbouwer) consequent, en herkennen leerlingen de vorm van les tot les.

| # | Uitlegvorm | Past bij | Kern | Bestaat al? |
|---|---|---|---|---|
| 1 | **Bordles** | procedures en redeneringen: een formule toepassen, een breuk vereenvoudigen, een zin ontleden, een berekening opbouwen | voordoen op het bord, stap voor stap; daarna stappen afbouwen tot de leerling het alleen kan; een fout voorbeeld | nieuw (dit ontwerp) |
| 2 | **Voorspel en kijk** | oorzaak en gevolg, natuurwetenschappelijke begrippen: licht en schaduw, krachten, oplossen | eerst voorspellen, dan proberen in een eenvoudige simulatie, dan verklaren | deels: de Lichtkamer, de actieve plot |
| 3 | **Stappenfilm** | processen en volgordes in de tijd: de waterkringloop, een proefopstelling, een historisch verloop | een proces in beelden met korte tekst, met ophaalvragen tussendoor | deels: framesequentie |
| 4 | **Vergelijken en ordenen** | begrippen die op elkaar lijken of een structuur vormen: soorten zinnen, staatsstructuur, klassen van dieren | naast elkaar zetten, kenmerken laten sorteren, een schema laten opbouwen | deels: mindmap, sorteren in categorieën |

Wat de vier gemeen hebben (de "consequente" kant):

- **Dezelfde bediening**: terug, volgende, nog eens, snelheid, voorlezen; tik op het bord om een animatie af te maken.
- **Een bordstand en een leerlingstand**: klassikaal voordoen op het digibord, dezelfde uitleg individueel op tablet of laptop.
- **Een ingebouwd check-moment**: geen uitleg zonder dat de leerling iets doet (invullen, kiezen, voorspellen), met getrapte
  feedback en de bestaande hintladder.
- **Resultaten naar het leerdoel**: "zonder hulp", "met hulp", "oplossing getoond", en de zekerheidsgraad, in de bestaande
  resultaten en de doel-heatmap.
- **Iedereen antwoordt** in de bordstand: klasmomenten ("schrijf op je wisbordje", "duim omhoog of omlaag") vóór het bord de
  oplossing toont, zodat niet één leerling antwoordt terwijl de rest kijkt.
- **Van concreet naar abstract**: elke vorm laat toe om te starten bij iets concreets of een context, via een schema naar de
  abstracte notatie (zoals gebruikelijk in het basisonderwijs). Dat is een eigenschap van elke vorm, geen aparte vorm.
- **Taal als drempel weggenomen**: vakwoorden zijn aanklikbaar in de bestaande woordenlijst, met steuntaal en voorlezen (TAL).
- **Toegankelijk**: minder beweging, voorlezen, toetsenbord, 44 pixels, 390 pixels breed, Safari 14.

Een video of een verhaal is geen vijfde uitlegvorm: die horen bij de instap, om te tonen waarom de leerstof ertoe doet.

## 2. Het lesgeraamte: waar de uitlegvorm in een les zit

Een standaardgeraamte voor een les of cursussectie, met bestaande bouwstenen. Het is een **standaard, geen verplichting**: de
leerkracht kan stappen weglaten of verschuiven, anders voelt het als een keurslijf.

1. **Instap**
   - Het leerdoel en waarom je dit leert, in leerlingentaal (feed-up; de leerdoelen bestaan al).
   - Optioneel een context of probleem dat de vraag oproept (een korte video of een verhaal hoort hier).
   - Een korte instaptoets: wie het al kan, gaat via de bestaande niveauroutes meteen naar zelfstandig werk of een uitdaging
     (voordoen remt leerlingen die het al kennen).
2. **Uitleg**: één uitlegvorm uit § 1.
3. **Inoefenen**: bestaande oefeningen (quiz, invullen, flitskaarten), met hintladder, **gevarieerd en door elkaar** (andere
   vormen, andere onbekende, een vraagstuk in context), niet tien keer dezelfde opgave.
4. **Check**: een exitticket, gekoppeld aan het leerdoel (bestaat).
5. **Terugblik**: de leerling vat zelf samen, bv. de stappen in de juiste volgorde zetten of in één zin zeggen wat hij leerde.
6. **Herhalen**: dezelfde leerstof komt na enkele dagen terug (Leitner, bestaat voor flitskaarten).

De AI-cursusbouwer kan dit geraamte later per sectie invullen: per leerdoel kiest hij de uitlegvorm volgens de tabel in § 1, en
de leerkracht keurt goed in de voorvertoning.

## 3. De bordles in detail

### 3.1 Didactiek (goedgekeurd in de demo)

- **Kijk mee**: uitgewerkt voorbeeld. Tekening en tekst samen, dezelfde kleur per begrip in tekening en formule, één nieuwe
  stap tegelijk, vorige stappen gedimd, tempo bij de leerling.
- **Doe mee**: afbouwen. Hetzelfde soort opgave, de laatste stappen vult de leerling zelf in. Fout: eerst een hint en een tweede
  kans, na drie pogingen de oplossing. Bekende fouten krijgen gerichte uitleg.
- **Zoek de fout**: een fout voorbeeld van een fictieve leerling; de leerling kiest wat er misging, elke keuze krijgt uitleg.
- **Alleen**: zelfstandig, met de zekerheidsvraag vóór het controleren.
- Niet elke bordles hoeft alle vier fases te hebben; de leerkracht kiest welke.

Aanvullingen na het expertadvies (13 november 2026, zie § 4):

- **Waaromvragen in Kijk mee**: af en toe stopt het bord met een korte vraag ("Waarom tellen we de oppervlaktes op en niet de
  zijden?"), met keuzes of een open antwoord. Kijken alleen geeft snel de schijn van begrip.
- **Elke stap een deeldoel**: een kort label ("Zoek de langste zijde", "Kwadrateer") boven de uitleg, en in de tekst hardop
  denken ("Ik kijk eerst welke zijde tegenover de rechte hoek ligt"). De labels zijn de kapstok in Doe mee: de leerling ziet
  welk deeldoel hij nu zelf doet.
- **Variatie tussen de voorbeelden**: een andere stand of vorm, een andere onbekende, een vraagstuk in context. Regel voor
  de inhoudschrijver en een tip in de editor; de AI-voorstellen moeten het ook doen.
- **Klasmoment in de bordstand**: vóór een invulstap of keuze kan het bord vragen dat iedereen antwoordt (wisbordje, duim),
  met een knop "Toon de oplossing" voor de leerkracht.
- **Overslaan wie het kan**: een bordles kan starten met één controlevraag; juist betekent meteen naar Alleen (de leerling kan
  altijd terug naar Kijk mee).
- **Woordenlijst**: vakwoorden in de uitleg verwijzen naar de bestaande woordenlijst met steuntaal.

### 3.2 Het lesformaat (voorstel voor `BordlesConfig`)

Een bordles is data, geen code. Het bord is 600 op 500 eenheden; de speler schaalt mee.

```ts
interface BordlesConfig {
  titel: string;
  standaardSnelheid?: 'traag' | 'normaal' | 'snel' | 'meteen';
  leerdoel?: string;              // in leerlingentaal, getoond bij de start
  instapvraag?: BordlesStap;      // juist = meteen naar de fase 'alleen'
  woorden?: string[];             // vakwoorden die naar de woordenlijst verwijzen
  fases: BordlesFase[];
}
interface BordlesFase {
  soort: 'kijk' | 'doe' | 'fout' | 'alleen';
  titel?: string;
  stappen: BordlesStap[];
}
interface BordlesStap {
  id?: string;
  deeldoel?: string;              // kort label met het doel van de stap, bv. "Kwadrateer"
  uitleg: string;                 // tekst naast het bord, ook voorgelezen; mag hardop denken
  waarom?: {                      // waaromvraag in Kijk mee: keuzes of open, met uitleg erna
    vraag: string; opties?: { tekst: string; juist?: boolean; uitleg: string }[]; modelantwoord?: string;
  };
  klasmoment?: { opdracht: string };   // bordstand: iedereen antwoordt eerst (wisbordje, duim)
  teken: BordElement[];           // wat de hand in deze stap tekent of schrijft
  invul?: {                       // leerling vult in (doe, alleen)
    label: string; antwoord: number | string; hints: string[];
    gekendeFouten?: { antwoord: string; uitleg: string }[];
    zekerheid?: boolean;
  };
  keuze?: {                       // zoek de fout
    opties: { tekst: string; juist?: boolean; uitleg: string }[];
  };
  wijsNaar?: { x: number; y: number };  // de hand wijst hierheen na het tekenen
}
type Krijtkleur = 'wit' | 'geel' | 'blauw' | 'roze' | 'groen' | 'oranje';
type BordElement =
  | { soort: 'lijn'; van: [number, number]; naar: [number, number]; kleur?: Krijtkleur }
  | { soort: 'veelhoek'; punten: [number, number][]; gesloten?: boolean; kleur?: Krijtkleur; vulling?: boolean }
  | { soort: 'cirkel'; midden: [number, number]; straal: number; kleur?: Krijtkleur }
  | { soort: 'pijl'; van: [number, number]; naar: [number, number]; kleur?: Krijtkleur }
  | { soort: 'tekst'; plek: [number, number]; delen: { tekst: string; kleur?: Krijtkleur }[]; grootte?: number;
      uitlijning?: 'links' | 'midden' | 'rechts'; verborgenTot?: string }   // verborgenTot: id van een invulstap
  | { soort: 'formule'; plek: [number, number]; latex: string; kleur?: Krijtkleur };  // later, zie BL-4
```

`verborgenTot` vervangt de vaste logica van de demo: een getal toont "?" tot de invulstap met dat id opgelost is.

### 3.3 Techniek

- Een nieuw oefeningstype `bordles` in `src/widgets/`, lui geladen zoals de andere; niets op het kritieke leerlingpad.
- De tekenmotor uit de demo wordt een zuivere module (`src/lib/bordles/`): elementen naar paden, de hand die een pad volgt, de
  schrijfanimatie met een groeiend knipvlak, krijtstof, afmaken bij een tik. Testbaar zonder scherm.
- De handafbeeldingen als WebP in `public/` (samen ±70 kB), met de krijtpunten uit `krijtpunten.json`; pas geladen als een
  bordles opent, en niet in de voorcache van de service worker.
- Safari 14: `getTotalLength` en `getPointAtLength` op `<path>` werken daar; geen lookbehind; `async` mag. Wordt nagekeken met
  `tests/safari14.mjs`.
- Het krijtlettertype (Patrick Hand, open licentie) lokaal meeleveren via `src/offline/lettertypes.ts`, niet van Google Fonts.

### 3.4 Bouwplan

| Pakket | Wat | Wie |
|---|---|---|
| BL-1 | Lesformaat in `src/lib/types.ts` en een validator met tests (o.a. `verborgenTot` wijst naar een bestaande invulstap, een waaromvraag heeft een juiste optie of een modelantwoord) | kernbouwer |
| BL-2 | Tekenmotor als zuivere module, met tests op paden en timing | bouwer |
| BL-3 | Speler: de vier fases, deeldoelen, waaromvragen, instapvraag met overslaan, invul met hintladder en gekende fouten, keuze, zekerheid, snelheid, voorlezen, woordenlijst, bord- en leerlingstand met klasmomenten, resultaten | bouwer |
| BL-4 | Formules (lichte weergave, eigen chunk) | bouwer |
| BL-5 | Editor: fases en stappen, vormen plaatsen op een raster, deeldoel en uitleg, waaromvraag, invulstap, foute stap, klasmoment, standaardsnelheid, tip over variatie, voorvertoning | bouwer |
| BL-6 | Sjabloon "Bordles" in de sjabloonbibliotheek, met de Pythagorasles | hoofdsessie |
| BL-7 | AI-studio: een bordles voorstellen in dit formaat, door de validator, met voorvertoning | hoofdsessie |
| BL-8 | Twee voorbeeldlessen (wiskunde en een ander vak), met deeldoelen, waaromvragen en variatie tussen de voorbeelden, geschreven door de inhoudschrijver, nagekeken door de nakijker | inhoudschrijver, nakijker |
| BL-9 | Rooktest `tests/bordles.mjs` en review per invalshoek (didactiek, toegankelijkheid, oude toestellen) | bouwer, reviewer, rechter |

## 4. Expertadvies van 13 november 2026 (verwerkt)

De eigenaar vroeg of de opzet didactisch klopt en wat er nog ontbreekt. Het oordeel: de opzet klopt en steunt op goed onderzochte
principes (uitgewerkte voorbeelden, afbouwen, fouten laten zoeken, ophalen, gespreid herhalen); de volgorde in de demo is juist
(het foute voorbeeld pas na de basis). Zeven aanvullingen, door de eigenaar aanvaard en hierboven verwerkt:

| # | Punt | Waarom | Waar verwerkt |
|---|---|---|---|
| 1 | Waaromvragen in Kijk mee | kijken naar een mooie animatie geeft de schijn van begrip; zelfverklaren maakt uitgewerkte voorbeelden pas echt sterk | § 3.1, § 3.2 (`waarom`) |
| 2 | Deeldoel per stap en hardop denken | benoemde deeldoelen helpen de aanpak meenemen naar nieuwe opgaven | § 3.1, § 3.2 (`deeldoel`) |
| 3 | Variatie tussen de voorbeelden | dezelfde vorm en onbekende leren een truc, geen inzicht | § 2 (inoefenen), § 3.1, BL-5, BL-8 |
| 4 | Overslaan wie het kan | voordoen helpt beginners, maar remt leerlingen die het al kennen | § 2 (instap), § 3.2 (`instapvraag`) |
| 5 | Iedereen antwoordt in de bordstand | anders antwoordt één leerling en kijkt de rest | § 1, § 3.2 (`klasmoment`) |
| 6 | Leerdoel en waarom bij de instap, terugblik op het einde; geraamte als standaard | feed-up en zelf samenvatten; geen keurslijf | § 2 |
| 7 | Vakwoorden naar de woordenlijst met steuntaal | taal is een drempel, zeker voor TAL | § 1, § 3.2 (`woorden`) |

## Vragen aan de eigenaar

1. Mag ik starten met BL-1 tot BL-3 (lesformaat, tekenmotor en speler), zodat je de bordles in Boosterz kunt uitproberen?
