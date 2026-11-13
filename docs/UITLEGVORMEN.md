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
| Dit ontwerp: de set uitlegvormen (§ 1) en het lesgeraamte (§ 2) | **Voorstel**, wacht op akkoord van de eigenaar (vragen onderaan) | eigenaar |
| Bordles als oefeningstype: speler (BL-1 tot BL-4) | **Wacht** op akkoord | hoofdsessie, bouwer |
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
- **Toegankelijk**: minder beweging, voorlezen, toetsenbord, 44 pixels, 390 pixels breed, Safari 14.

## 2. Het lesgeraamte: waar de uitlegvorm in een les zit

Voorstel voor een vast geraamte van een les of cursussectie, met bestaande bouwstenen:

1. **Instap**: wat ken je al? (diagnostische instap of een korte poll, bestaat).
2. **Uitleg**: één uitlegvorm uit § 1.
3. **Inoefenen**: bestaande oefeningen (quiz, invullen, flitskaarten), met hintladder.
4. **Check**: een exitticket, gekoppeld aan het leerdoel (bestaat).
5. **Herhalen**: dezelfde leerstof komt na enkele dagen terug (Leitner, bestaat voor flitskaarten).

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

### 3.2 Het lesformaat (voorstel voor `BordlesConfig`)

Een bordles is data, geen code. Het bord is 600 op 500 eenheden; de speler schaalt mee.

```ts
interface BordlesConfig {
  titel: string;
  standaardSnelheid?: 'traag' | 'normaal' | 'snel' | 'meteen';
  fases: BordlesFase[];
}
interface BordlesFase {
  soort: 'kijk' | 'doe' | 'fout' | 'alleen';
  titel?: string;
  stappen: BordlesStap[];
}
interface BordlesStap {
  uitleg: string;                 // tekst naast het bord, ook voorgelezen
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
| BL-1 | Lesformaat in `src/lib/types.ts` en een validator met tests (o.a. `verborgenTot` wijst naar een bestaande invulstap) | kernbouwer |
| BL-2 | Tekenmotor als zuivere module, met tests op paden en timing | bouwer |
| BL-3 | Speler: de vier fases, invul met hintladder en gekende fouten, keuze, zekerheid, snelheid, voorlezen, bord- en leerlingstand, resultaten | bouwer |
| BL-4 | Formules (lichte weergave, eigen chunk) | bouwer |
| BL-5 | Editor: fases en stappen, vormen plaatsen op een raster, uitleg, invulstap, foute stap, standaardsnelheid, voorvertoning | bouwer |
| BL-6 | Sjabloon "Bordles" in de sjabloonbibliotheek, met de Pythagorasles | hoofdsessie |
| BL-7 | AI-studio: een bordles voorstellen in dit formaat, door de validator, met voorvertoning | hoofdsessie |
| BL-8 | Twee voorbeeldlessen (wiskunde en een ander vak), geschreven door de inhoudschrijver, nagekeken door de nakijker | inhoudschrijver, nakijker |
| BL-9 | Rooktest `tests/bordles.mjs` en review per invalshoek (didactiek, toegankelijkheid, oude toestellen) | bouwer, reviewer, rechter |

## Vragen aan de eigenaar

1. Klopt de set van vier uitlegvormen in § 1, of mist er een (bv. een uitleg met video, of een verhaal)?
2. Klopt het lesgeraamte in § 2 als vaste opbouw voor een les of cursussectie?
3. Mag ik na je akkoord starten met BL-1 tot BL-3 (de speler), zodat je de bordles eerst in Boosterz kunt uitproberen?
