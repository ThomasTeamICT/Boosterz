// De verwachte vorm van de bronbestanden van het GO!, als gegevens (docs/basisonderwijs/GO-LEERPLAN.md, "Import" en
// "Controles", met de rechtzettingen van de rechter).
//
// De import (omzetten.ts, koppelen.ts, rondgang.ts en tools/basis/go/maak.ts) vergelijkt elk bestand met wat hier
// staat. Wijkt iets af, dan stopt de import met exit 3: de hoofdsessie breidt deze vorm dan bewust uit, of neemt de
// afwijking met een reden op in tools/basis/go/bekende-afwijkingen.json. Een nieuwe vorm (andere stapnamen, andere
// tabellen, een andere vorm van een activiteit van 'Trainen') stopt de import dus met opzet.
//
// Zuiver: alleen gegevens en kleine functies, geen I/O.
import type { GoIcoon, GoMoment, GoRubriekSoort, GoVak } from './types';

// ── Lesplan (docx) ───────────────────────────────────────────────────

/** De koppen van niveau 2, in deze volgorde. Deel 7 bestaat alleen via bekende-afwijkingen.json (LP0014a). */
export const LESPLAN_DELEN: readonly string[] = [
  '1. Wat moet de leraar weten?',
  '2. Wat moet de leerling kennen en kunnen?',
  '3. Samenhang',
  '4. Lesopbouw',
  '5. Trainen',
  '6. Didactisch materiaal bij dit lesplan',
];
export const LESPLAN_DEEL_BIJLAGEN = '7. Bijlagen';

/** De kop van niveau 1: 'Lesplan LP0065 Dieren classificeren (2,5-4 jaar)'. */
export const RE_LESPLAN_TITEL = /^Lesplan (LP\d{4}[a-z]?) (.+) \(([0-9,]+-[0-9]+) jaar\)$/;

/** De metaregels van deel 0, elk met een vet label 'Label:', in deze volgorde. */
export const METAREGELS: readonly string[] = ['Vakdiscipline', 'Lessenlijn', 'Lessenreeks', 'Lesplan', 'Didactische fiche'];
/** 'DFWT005 Kenmerken van de organismen: Taxonomie van de fauna'; meer fiches met '; ' ertussen. */
export const RE_FICHE = /^(DF[A-Z]{2}\d{3}) (.+)$/;
/** Het pad in GO! Navigator achteraan de regel 'Didactische fiche:'. */
export const FICHE_NAVIGATOR = ' (GO! Navigator > ';

/** Koppen van niveau 3 en 4: alleen in deel 3, precies in deze volgorde (9 per lesplan in de eerste reeks). */
export const KOPPEN_DEEL3: readonly { niveau: 3 | 4; tekst: string }[] = [
  { niveau: 3, tekst: 'Verticale samenhang' },
  { niveau: 3, tekst: 'Horizontale samenhang binnen de vakdiscipline' },
  { niveau: 4, tekst: 'Vlaggen en schakels' },
  { niveau: 4, tekst: "Samenhang tussen diploma's en deelconcepten" },
  { niveau: 4, tekst: 'Samenhang tussen deelconcepten en GO! concepten' },
  { niveau: 3, tekst: 'Horizontale samenhang over de vakdisciplines heen' },
  { niveau: 4, tekst: 'Vlaggen en schakels' },
  { niveau: 4, tekst: 'Denklenzen' },
  { niveau: 4, tekst: 'Geïntegreerde samenhang met leren leren, ICT, sociale vaardigheden met dit lesplan' },
];

/** De vulling van de grijze koprij (kolomkop). */
export const KOPRIJ_VULLING = 'F2F2F2';
/** De kolomkoppen van de tabellen in deel 1, 2 en 4. */
export const KOLOMKOPPEN_WAT_HOE: readonly string[] = ['', 'Inhoud (Wat?)', 'Didactiek (Hoe?)'];

/**
 * De tabellen per deel. `rijkoppen`: de tekst in de eerste kolom van elke rij onder de koprij (de rijkop); een lege
 * string is een vervolgcel van een verticale samenvoeging. `koppen`: de kolomkoppen, met het pictogram ervoor.
 */
export interface TabelVorm {
  kolommen: number;
  koppen: readonly { icoon?: GoIcoon; tekst: string }[];
  /** Alleen bij de tabellen met een rijkop (deel 1, 2 en 4). */
  rijkoppen?: readonly string[];
}

export const TABELLEN: Readonly<Record<number, readonly TabelVorm[]>> = {
  1: [{ kolommen: 3, koppen: KOLOMKOPPEN_WAT_HOE.map((tekst) => ({ tekst })), rijkoppen: ['Kennis', 'Misconcept'] }],
  2: [{ kolommen: 3, koppen: KOLOMKOPPEN_WAT_HOE.map((tekst) => ({ tekst })), rijkoppen: ['Leerplandoelen'] }],
  3: [
    { kolommen: 2, koppen: [{ icoon: 'diploma', tekst: 'Diploma' }, { icoon: 'deelconcept', tekst: 'Deelconcepten' }] },
    { kolommen: 2, koppen: [{ icoon: 'deelconcept', tekst: 'Deelconcepten' }, { icoon: 'go-concept', tekst: 'GO! concepten' }] },
    { kolommen: 2, koppen: [{ icoon: 'denklens', tekst: 'Denklenzen' }, { tekst: 'Voorbeeldvragen binnen dit lesplan' }] },
  ],
  // Deel 4: de rij 'Leskern' is verticaal samengevoegd over de stappen (5 of 6, zie STAPPEN).
  4: [{ kolommen: 3, koppen: KOLOMKOPPEN_WAT_HOE.map((tekst) => ({ tekst })) }],
};

/** De rijkoppen van deel 4, in deze volgorde; 'Leskern' staat in een samenvoeging over de rijen van de stappen. */
export const RIJKOPPEN_LESOPBOUW: readonly string[] = ['Voorkennis', 'Doeloriëntatie / belang', 'Lesdoel', 'Leskern', 'Vastlegging'];
export const RIJKOP_LESKERN = 'Leskern';
export const RIJKOP_LESDOEL = 'Lesdoel';

/** De stappen van de leskern, in deze volgorde; de eerste 5 of alle 6 (LP0014b heeft er 5). */
export const STAPPEN: readonly string[] = [
  'Verkennen',
  'Voorkeursinstructie',
  'Terugkoppelen',
  'Begeleid inoefenen',
  'Kleine lesafsluiting',
  'Zelfstandige verwerking',
];
export const MIN_STAPPEN = 5;

/** De pictogrammen: alleen op hun bestandsnaam in word/media (descr en title zijn leeg in de bron). */
export const ICOON_MEDIA: Readonly<Record<string, GoIcoon>> = {
  'word/media/lesplan-vlag.png': 'vlag',
  'word/media/lesplan-schakel.png': 'schakel',
  'word/media/lesplan-diploma.png': 'diploma',
  'word/media/lesplan-deelconcept.png': 'deelconcept',
  'word/media/lesplan-go-concept.png': 'go-concept',
  'word/media/lesplan-denklens.png': 'denklens',
};

/** wp:extent staat in EMU; 9525 EMU is één pixel. */
export const EMU_PER_PX = 9525;

/** Een doelregel in deel 2: vette code, cursief niveau tussen haken, de tekst, de leeftijden tussen haakjes. */
export const RE_DOELREGEL = /^([A-Z]{2}\.\d{3}) \[(begrijpen|gebruiken|engageren)\] (.+) \(([^()]+)\)$/;
/** Een doelregel bij een diploma in deel 4: zonder tekst ('WT.001 [begrijpen] (2,5-4 jaar)'). */
export const RE_IKDOEL_KOP = /^([A-Z]{2}\.\d{3}) \[(begrijpen|gebruiken|engageren)\] \(([^()]+)\)$/;
/** Een MIA-blok in deel 2: vet 'MIA', dan ' — ' en de titel, gevolgd door een lijst met de items. */
export const MIA_LABEL = 'MIA';
export const MIA_SCHEIDING = ' — ';
/** 'Te hanteren begrippen: de baby' (vet label). */
export const BEGRIPPEN_LABEL = 'Te hanteren begrippen:';

/** De kop van een diploma in de rij Lesdoel ('… vanuit het diploma: De dierenkenner 2,5-4 jaar'). */
export const RE_DIPLOMA_KOP = /^Leerdoelen op leerlingenniveau vanuit het diploma: (.+) ([0-9,]+-[0-9]+) jaar$/;
/** De regel met het pad in GO! Navigator onder een diploma. */
export const DIPLOMA_NAVIGATOR = "(GO! Navigator > Basisonderwijs > Het nieuwe GO! Leerplan > Conceptkaarten > Diploma's)";
/** Na de ik-doelen mag deze regel staan, gevolgd door de begrippen (LP0001). */
export const DIPLOMA_BEGRIPPEN = 'Als ik vertel / iets uitleg, gebruik ik volgende begrippen:';

/** De eerste alinea van deel 5 (cursief). */
export const TRAINEN_INLEIDING =
  'Deze activiteiten geven richting over hoe je tot oefenen komt met de leerlingen. Beperk je niet tot deze activiteiten, maar gebruik ook jouw eigen creativiteit.';

/**
 * De vormen van een activiteit van 'Trainen' (rechtzetting 6 van de rechter). Een activiteit begint bij een titel en
 * loopt tot vóór de volgende titel of tot het einde van deel 5. Alle titels van één lesplan hebben dezelfde vorm. Wat
 * tussen de inleiding en de eerste titel staat, is één activiteit zonder titel (LP0014a en LP0014b: 'De verzorgende
 * routines en vaste hoeken …', waar alleen de beginwoorden vet zijn). Zonder titels is deel 5 precies één lijst, en elk item een activiteit zonder titel (LP0017).
 * Een andere vorm geeft exit 3.
 */
export type TrainenVorm = 'lijst-vet' | 'alinea-vet' | 'opsomteken-vet' | 'vet-regeleinde' | 'geen-titel';
export const TRAINEN_VORMEN: Readonly<Record<TrainenVorm, string>> = {
  'lijst-vet': 'een lijstitem dat helemaal vet is, witruimte achteraan mag (LP0014a, LP0074, LP0087)',
  'alinea-vet': 'een gewone alinea die helemaal vet is (LP0014b, LP0094)',
  'opsomteken-vet': "een alinea met '•' en een spatie, en daarna alleen vette tekst (LP0001)",
  'vet-regeleinde': 'een alinea die vet begint met direct daarna een regeleinde, de tekst in dezelfde alinea (LP0065)',
  'geen-titel': 'geen titels: deel 5 is één lijst en elk item is een activiteit (LP0017)',
};
/** Het opsommingsteken van de vorm 'opsomteken-vet'. */
export const OPSOMTEKEN = '•';

// ── Doelenset (xlsx) ─────────────────────────────────────────────────

/** De 24 kolomkoppen, letterlijk en in deze volgorde. */
export const KOLOMMEN: readonly string[] = [
  'TYPE',
  'GO! NR.',
  'INHOUD',
  'KO nummer',
  'KO minimumdoel',
  'KO omschrijving',
  'L4 nummer',
  'L4 minimumdoel',
  'L4 omschrijving',
  'L6 nummer',
  'L6 minimumdoel',
  'L6 omschrijving',
  'KENNISVERWERKING',
  '2,5-4',
  '4-5',
  '5-6',
  '6-7',
  '7-8',
  '8-9',
  '9-10',
  '10-11',
  '11-12',
  'VLAGGEN',
  'SCHAKELS',
];

export const KOL = {
  type: 0,
  code: 1,
  inhoud: 2,
  kennisverwerking: 12,
  eersteLeeftijd: 13,
  laatsteLeeftijd: 21,
  vlaggen: 22,
  schakels: 23,
} as const;

/** Per moment: de kolom met de codes en de twee kolommen met de tekst van het minimumdoel (alleen op minimumdoel-rijen). */
export const MOMENT_KOLOMMEN: Readonly<Record<GoMoment, { nummer: number; tekst: readonly number[] }>> = {
  KO: { nummer: 3, tekst: [4, 5] },
  L4: { nummer: 6, tekst: [7, 8] },
  L6: { nummer: 9, tekst: [10, 11] },
};

/** De soort van een rij volgens de kolom TYPE. Een TYPE dat hier niet staat, geeft exit 3. */
export type RijSoort =
  | { soort: 'rubriek'; rubriek: GoRubriekSoort }
  | { soort: 'doelzin' }
  | { soort: 'minimumdoel' }
  | { soort: 'mia-titel' }
  | { soort: 'mia'; aanklikbaar: boolean }
  | { soort: 'begrip' }
  | { soort: 'voorbeelden-titel' }
  | { soort: 'voorbeeld' }
  | { soort: 'voetnoot' };

export const TYPES: Readonly<Record<string, RijSoort>> = {
  onderwerp: { soort: 'rubriek', rubriek: 'onderwerp' },
  subthema: { soort: 'rubriek', rubriek: 'subthema' },
  rubriek: { soort: 'rubriek', rubriek: 'rubriek' },
  subrubriek: { soort: 'rubriek', rubriek: 'subrubriek' },
  doelzin: { soort: 'doelzin' },
  minimumdoel: { soort: 'minimumdoel' },
  'MIA - titel': { soort: 'mia-titel' },
  'MIA - aanklikbaar': { soort: 'mia', aanklikbaar: true },
  'MIA - niet aanklikbaar': { soort: 'mia', aanklikbaar: false },
  'te hanteren begrippen': { soort: 'begrip' },
  'voorbeelden - titel': { soort: 'voorbeelden-titel' },
  'voorbeelden - bullet': { soort: 'voorbeeld' },
  asterisk: { soort: 'voetnoot' },
};

/** De rijsoorten die een eigen code mogen dragen (een fijnere koppeling op het niveau van een MIA). */
export const RIJSOORTEN_MET_KOPPELING: readonly RijSoort['soort'][] = ['mia-titel', 'mia', 'voorbeelden-titel', 'voorbeeld'];

/**
 * Naar welke vakken van de minimumdoelen (het eerste getal van de code) elke vakdiscipline verwijst, zoals nagerekend
 * in de eerste reeks. Een verwijzing naar een ander vak is een afwijking: met een reden in bekende-afwijkingen.json
 * wordt ze een officiële koppeling met twijfel 'ander-vak' (bv. WI.706 → KO 4.2.3). Zo valt een code van het verkeerde
 * vak op, ook al vindt ze een doel.
 */
export const VERWACHTE_MINIMUMDOELVAKKEN: Readonly<Record<GoVak, readonly number[]>> = {
  NL: [1],
  WI: [2, 8],
  WT: [3, 9],
  AA: [2, 4],
  GE: [2, 5],
  MV: [6],
  LO: [7, 9],
  IT: [8],
  BU: [5, 9],
  FR: [10],
  LL: [9],
  SV: [9],
};

/** Een code van een leerplandoel in de kolommen VLAGGEN en SCHAKELS. */
export const RE_GO_CODE = /^(AA|BU|FR|GE|IT|LL|LO|MV|NL|SV|WI|WT)\.(\d{3})$/;
/** De vorm cijfer.cijfer.cijfer: anders is een code 'onleesbaar'. */
export const RE_CODEVORM = /^\d+\.\d+\.\d+$/;

/** Is een cel leeg? Ontbrekend, leeg of alleen witruimte (een spatie telt niet als inhoud). */
export function isLeeg(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === '';
}

/** Witruimte (ook een harde spatie of een regeleinde) als één spatie, zonder witruimte vooraan of achteraan. */
export function gewoon(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
