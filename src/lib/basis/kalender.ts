// Invoeringskalender van de nieuwe minimumdoelen in het basisonderwijs (bouwstap 2b,
// zie docs/basisonderwijs/MOMENTMODEL.md).
//
// De kalender is een gegevensbestand: de enige plaats met jaartallen, vakken en bronnen
// van de invoering. Het momentmodel (moment.ts) en het blok "Wanneer gelden deze doelen?"
// rekenen ermee, en kalenderTegenGegevens legt ze naast de einddata van de officiële
// gegevens. Wijzigt de invoering, dan verandert alleen dit bestand.
//
// Pure module, bewust zonder imports en alleen "erasable" TypeScript (geen enums,
// namespaces, parameter properties of decorators): Node 22 kan dit bestand rechtstreeks
// importeren via type stripping, net als src/lib/minimumdoelen.ts. Het schooljaar is
// altijd een parameter: dit bestand leest nergens de klok.
//
// Hoe zeker is wat hier staat?
// - 'zeker' vraagt een bron met hoe 'gegevens' of 'gelezen' (zie controleerKalender). Een
//   zoekresultaat maakt nooit zeker, en een bron die nog te lezen is is nooit de enige steun.
// - Elke cel heeft haar eigen zekerheid, en elk vak ook voor zijn golf. De zekerheid van een
//   invoering is de laagste van die twee (de berekening staat in moment.ts).
// - Een bron met hoe 'gelezen' komt er pas als iemand de officiële tekst heeft nagelezen.
//   Tot dan is de kalender samengesteld uit de einddata in de gegevens en uit zoekresultaten.

export type LeerjaarBasis = 'K1' | 'K2' | 'K3' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export const LEERJAREN_BASIS: readonly LeerjaarBasis[] = ['K1', 'K2', 'K3', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

/** Einde kleuteronderwijs (3de kleuterklas), einde 4de leerjaar, einde 6de leerjaar. */
export type Eindmoment = 'K3' | 'L4' | 'L6';
/** Naar welk eindmoment elk leerjaar toewerkt. */
export const WERKT_NAAR: Readonly<Record<LeerjaarBasis, Eindmoment>> = {
  K1: 'K3',
  K2: 'K3',
  K3: 'K3',
  L1: 'L4',
  L2: 'L4',
  L3: 'L4',
  L4: 'L4',
  L5: 'L6',
  L6: 'L6',
};

/** Golf 1: Nederlands, wiskunde, wetenschap en techniek. Golf 2: de andere vakken. */
export type Golf = 1 | 2;
export type Zekerheid = 'zeker' | 'waarschijnlijk' | 'onzeker';
/** Deel van SoortOnderwijs (minimumdoelenBron.ts): gewoon en buitengewoon basisonderwijs. */
export type SoortBasis = 'bao' | 'bubao';
/** Gelijk aan MomentBasis (minimumdoelenBron.ts), hier herhaald omdat dit bestand niets importeert. */
export type MomentKalender = 'kleuter' | 'lager';
/** Beginjaar van het schooljaar: 2026 is 2026-2027. */
export type Schooljaar = number;

/**
 * Hoe de bron gekend is.
 * - gegevens: de officiële gegevens (de Onderwijsdoelen-API) zelf.
 * - gelezen: de officiële tekst is geopend en nagelezen.
 * - zoekfragment: alleen gezien in een zoekresultaat, de pagina is niet geopend.
 * - afgeleid: nagerekend uit de rest van de kalender.
 * - nog-te-lezen: gekend, maar nog niet geopend.
 */
export type BronHoe = 'gegevens' | 'gelezen' | 'zoekfragment' | 'afgeleid' | 'nog-te-lezen';
export const BRON_HOE_WAARDEN: readonly BronHoe[] = ['gegevens', 'gelezen', 'zoekfragment', 'afgeleid', 'nog-te-lezen'];
export const ZEKERHEID_WAARDEN: readonly Zekerheid[] = ['zeker', 'waarschijnlijk', 'onzeker'];

export interface KalenderBron {
  id: string;
  titel: string;
  /** Alleen https. */
  url?: string;
  hoe: BronHoe;
  /** JJJJ-MM-DD: wanneer de bron gevonden of bekeken is. Bij hoe 'gelezen': de dag van het nalezen. */
  gevondenOp: string;
  citaat?: string;
}

export interface KalenderVak {
  /** 1 tot 10: het eerste getal van de code van de doelen. */
  nr: number;
  /** Het label. */
  naam: string;
  /** De korteNaam van de set zonder accenten, in kleine letters, met één spatie. */
  sleutel: string;
  golf: Golf;
  /** Hoe zeker het is dat dit vak bij deze golf hoort. */
  zekerheid: Zekerheid;
  bronnen: readonly string[];
}

export interface KalenderCel {
  soort: SoortBasis;
  golf: Golf;
  leerjaar: LeerjaarBasis;
  /** Eerste schooljaar waarin het nieuwe verplicht is. */
  vanaf: Schooljaar;
  zekerheid: Zekerheid;
  bronnen: readonly string[];
  opmerking?: string;
}

export interface Invoeringskalender {
  v: 1;
  /** JJJJ-MM-DD: wanneer deze kalender is samengesteld. Dat is geen nalezing in de officiële tekst. */
  samengesteldOp: string;
  /** Eerste schooljaar waarin de nieuwe sets al mochten (geldigVan van alle nieuwe sets). */
  vrijwilligVanaf: Schooljaar;
  bronnen: readonly KalenderBron[];
  vakken: readonly KalenderVak[];
  cellen: readonly KalenderCel[];
}

// ─── Opmerkingen ────────────────────────────────────────────────────────────

const OPMERKING_GETUIGSCHRIFT_GOLF1_L4 =
  'In 2026-2027 mag het 4de leerjaar de oude eindtermen nog volgen. Deze leerlingen halen hun getuigschrift (2028-2029) wel op de nieuwe minimumdoelen Nederlands, wiskunde en wetenschap en techniek.';
const OPMERKING_UITERLIJK_GOLF1_L6 = 'Uiterlijk 2028-2029: de oude eindtermen voor deze vakken gelden tot 31 augustus 2028.';
const OPMERKING_UITERLIJK_GOLF2_L6 = 'Uiterlijk 2030-2031: de oude eindtermen voor deze vakken gelden tot 31 augustus 2030.';
const OPMERKING_BUBAO_LAGER =
  'Volgt de kalender van het gewoon basisonderwijs: de oude doelen eindigen op dezelfde dagen. Of de invoering per leerjaar hier ook zo loopt, is nog niet bevestigd.';

// ─── De kalender ────────────────────────────────────────────────────────────

export const INVOERINGSKALENDER: Invoeringskalender = {
  v: 1,
  samengesteldOp: '2026-11-02',
  vrijwilligVanaf: 2025,
  bronnen: [
    {
      id: 'api',
      titel: 'Onderwijsdoelen-API: einddata van de oude sets (opgehaald op 1 november 2026)',
      url: 'https://www.onderwijsdoelen.be/',
      hoe: 'gegevens',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'codex',
      titel: 'Decreet basisonderwijs, overgangsbepaling (Codex Vlaanderen)',
      url: 'https://codex.vlaanderen.be/Portals/Codex/documenten/1005384.html',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'decreet-2025',
      titel: 'Decreet van 18 juli 2025 over de minimumdoelen (Edulex)',
      url: 'https://data-onderwijs.vlaanderen.be/edulex/document.aspx?docid=12254',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'klasse-2026',
      titel: 'Klasse: wat is nieuw in onderwijs op 1 september 2026',
      url: 'https://www.klasse.be/783462/wat-is-nieuw-in-onderwijs-op-1-september-2026/',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
      citaat:
        'Dit schooljaar ga je in het kleuteronderwijs en in het eerste tot en met derde leerjaar lager onderwijs verplicht aan de slag met de nieuwe minimumdoelen Nederlands, wiskunde en wetenschap en techniek',
    },
    {
      id: 'klasse-momenten',
      titel: 'Klasse: nieuwe minimumdoelen basisonderwijs',
      url: 'https://www.klasse.be/775114/nieuwe-minimumdoelen-basisonderwijs-2/',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'kenniswest',
      titel: 'KennisWest: inwerkingtreding van de minimumdoelen',
      url: 'https://www.kenniswest.be/publicatie/decreet-tot-wijziging-decreet-basisonderwijs-wat-vaststelling-en-inwerkingtreding-minimumdoelen-betreft/270144',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'ovsg',
      titel: 'OVSG: minimumdoelen basisonderwijs',
      url: 'https://www.ovsg.be/onze-themas/leerplannen-didactiek/basisonderwijs/minimumdoelen-basisonderwijs',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'sensoa',
      titel: 'Sensoa: tabel van de invoering per leerjaar',
      url: 'https://www.sensoa.be/relationele-en-seksuele-vorming-de-vlaamse-minimumdoelen-en-eindtermen',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'vanin',
      titel: 'Van In: invoering per leerjaar',
      url: 'https://www.vanin.be/iedereenmee/',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'kov-toetsen',
      titel: 'Katholiek Onderwijs Vlaanderen: Vlaamse toetsen, vragen en antwoorden',
      url: 'https://pro.katholiekonderwijs.vlaanderen/vlaamsetoetsen/faq',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'mvt-od36',
      titel: 'Memorie van toelichting bij Onderwijsdecreet XXXVI',
      url: 'https://themis.vlaanderen.be/files/d8f9aa50-4adb-11f1-909c-bd967777a5f1/download?name=VR+2026+0805+DOC.0465-3+Onderwijsdecreet+XXXVI+-+MvT+TER.pdf&content-disposition=inline',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'vlaams-parlement',
      titel: 'Vlaams Parlement: commissieverslag (eindpunt 2030-2031)',
      url: 'https://docs.vlaamsparlement.be/files/pfile?id=2287211',
      hoe: 'zoekfragment',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'cohortregel',
      titel: 'Afgeleid: het getuigschriftjaar van elke groep, nagerekend tegen de cellen',
      hoe: 'afgeleid',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'vlaanderen-tabel',
      titel: 'Vlaamse overheid: nieuwe minimumdoelen in het basisonderwijs',
      url: 'https://www.vlaanderen.be/onderwijs-en-vorming/leerstof/onderwijsdoelen/nieuwe-minimumdoelen-in-het-basisonderwijs',
      hoe: 'nog-te-lezen',
      gevondenOp: '2026-11-02',
    },
    {
      id: 'vraag-antwoord',
      titel: 'Vlaamse overheid: vraag en antwoord nieuwe minimumdoelen (pdf)',
      url: 'https://data-onderwijs.vlaanderen.be/documenten/bestanden/nieuwe-minimumdoelen-vraag-antwoord.pdf',
      hoe: 'nog-te-lezen',
      gevondenOp: '2026-11-02',
    },
  ],

  // De golf per vak. 'zeker' alleen voor de vakken waarvan een oude basisset met (vrijwel)
  // dezelfde vaknaam in de gegevens op de einddatum van die golf eindigt (bij wetenschap en
  // techniek heet de oude set "Wetenschappen en techniek"; Nederlands, wiskunde en
  // wetenschap en techniek in 2026 en 2028, de andere vier in 2027 en 2030). Voor
  // aardrijkskunde, geschiedenis en attitudes bestaat geen oude set met die naam: hun golf
  // steunt alleen op het decreet, zoals zoekresultaten het citeren ("de overige").
  vakken: [
    { nr: 1, naam: 'Nederlands', sleutel: 'nederlands', golf: 1, zekerheid: 'zeker', bronnen: ['api', 'decreet-2025', 'kenniswest'] },
    { nr: 2, naam: 'Wiskunde', sleutel: 'wiskunde', golf: 1, zekerheid: 'zeker', bronnen: ['api', 'decreet-2025', 'kenniswest'] },
    {
      nr: 3,
      naam: 'Wetenschap en techniek',
      sleutel: 'wetenschap en techniek',
      golf: 1,
      zekerheid: 'zeker',
      bronnen: ['api', 'decreet-2025', 'kenniswest'],
    },
    { nr: 4, naam: 'Aardrijkskunde', sleutel: 'aardrijkskunde', golf: 2, zekerheid: 'waarschijnlijk', bronnen: ['decreet-2025', 'kenniswest'] },
    { nr: 5, naam: 'Geschiedenis', sleutel: 'geschiedenis', golf: 2, zekerheid: 'waarschijnlijk', bronnen: ['decreet-2025', 'kenniswest'] },
    { nr: 6, naam: 'Muzische vorming', sleutel: 'muzische vorming', golf: 2, zekerheid: 'zeker', bronnen: ['api', 'decreet-2025', 'kenniswest'] },
    {
      nr: 7,
      naam: 'Lichamelijke opvoeding',
      sleutel: 'lichamelijke opvoeding',
      golf: 2,
      zekerheid: 'zeker',
      bronnen: ['api', 'decreet-2025', 'kenniswest'],
    },
    { nr: 8, naam: 'ICT', sleutel: 'ict', golf: 2, zekerheid: 'zeker', bronnen: ['api', 'decreet-2025', 'kenniswest'] },
    { nr: 9, naam: 'Attitudes', sleutel: 'attitudes', golf: 2, zekerheid: 'waarschijnlijk', bronnen: ['decreet-2025', 'kenniswest'] },
    { nr: 10, naam: 'Frans', sleutel: 'frans', golf: 2, zekerheid: 'zeker', bronnen: ['api', 'decreet-2025', 'kenniswest'] },
  ],

  cellen: [
    // ── Gewoon basisonderwijs, golf 1 ──────────────────────────────────────
    // De oude kleutersets ODS_2104, 2105 en 2106 eindigen op 2026-08-31.
    { soort: 'bao', golf: 1, leerjaar: 'K1', vanaf: 2026, zekerheid: 'zeker', bronnen: ['api', 'codex', 'klasse-2026'] },
    { soort: 'bao', golf: 1, leerjaar: 'K2', vanaf: 2026, zekerheid: 'zeker', bronnen: ['api', 'codex', 'klasse-2026'] },
    { soort: 'bao', golf: 1, leerjaar: 'K3', vanaf: 2026, zekerheid: 'zeker', bronnen: ['api', 'codex', 'klasse-2026'] },
    { soort: 'bao', golf: 1, leerjaar: 'L1', vanaf: 2026, zekerheid: 'waarschijnlijk', bronnen: ['codex', 'klasse-2026', 'cohortregel'] },
    { soort: 'bao', golf: 1, leerjaar: 'L2', vanaf: 2026, zekerheid: 'waarschijnlijk', bronnen: ['codex', 'klasse-2026', 'cohortregel'] },
    { soort: 'bao', golf: 1, leerjaar: 'L3', vanaf: 2026, zekerheid: 'waarschijnlijk', bronnen: ['codex', 'klasse-2026', 'cohortregel'] },
    {
      soort: 'bao',
      golf: 1,
      leerjaar: 'L4',
      vanaf: 2027,
      zekerheid: 'waarschijnlijk',
      bronnen: ['codex', 'vanin', 'sensoa', 'kov-toetsen', 'cohortregel'],
      opmerking: OPMERKING_GETUIGSCHRIFT_GOLF1_L4,
    },
    { soort: 'bao', golf: 1, leerjaar: 'L5', vanaf: 2027, zekerheid: 'waarschijnlijk', bronnen: ['codex', 'vanin', 'sensoa', 'cohortregel'] },
    {
      soort: 'bao',
      golf: 1,
      leerjaar: 'L6',
      vanaf: 2028,
      zekerheid: 'waarschijnlijk',
      bronnen: ['codex', 'api', 'kov-toetsen', 'cohortregel'],
      opmerking: OPMERKING_UITERLIJK_GOLF1_L6,
    },

    // ── Gewoon basisonderwijs, golf 2 ──────────────────────────────────────
    // De oude kleutersets ODS_2102, 2103 en 2107 eindigen op 2027-08-31.
    { soort: 'bao', golf: 2, leerjaar: 'K1', vanaf: 2027, zekerheid: 'zeker', bronnen: ['api', 'kenniswest', 'ovsg', 'klasse-2026'] },
    { soort: 'bao', golf: 2, leerjaar: 'K2', vanaf: 2027, zekerheid: 'zeker', bronnen: ['api', 'kenniswest', 'ovsg', 'klasse-2026'] },
    { soort: 'bao', golf: 2, leerjaar: 'K3', vanaf: 2027, zekerheid: 'zeker', bronnen: ['api', 'kenniswest', 'ovsg', 'klasse-2026'] },
    { soort: 'bao', golf: 2, leerjaar: 'L1', vanaf: 2027, zekerheid: 'waarschijnlijk', bronnen: ['sensoa', 'ovsg', 'cohortregel'] },
    { soort: 'bao', golf: 2, leerjaar: 'L2', vanaf: 2027, zekerheid: 'waarschijnlijk', bronnen: ['sensoa', 'ovsg', 'cohortregel'] },
    { soort: 'bao', golf: 2, leerjaar: 'L3', vanaf: 2027, zekerheid: 'waarschijnlijk', bronnen: ['sensoa', 'ovsg', 'cohortregel'] },
    { soort: 'bao', golf: 2, leerjaar: 'L4', vanaf: 2028, zekerheid: 'waarschijnlijk', bronnen: ['sensoa', 'cohortregel'] },
    { soort: 'bao', golf: 2, leerjaar: 'L5', vanaf: 2029, zekerheid: 'waarschijnlijk', bronnen: ['sensoa', 'cohortregel'] },
    {
      soort: 'bao',
      golf: 2,
      leerjaar: 'L6',
      vanaf: 2030,
      zekerheid: 'waarschijnlijk',
      bronnen: ['api', 'mvt-od36', 'vlaams-parlement', 'cohortregel'],
      opmerking: OPMERKING_UITERLIJK_GOLF2_L6,
    },

    // ── Buitengewoon basisonderwijs, golf 1 ────────────────────────────────
    // De oude kleutersets ODS_2297, 2303, 2329, 2359 en 2360 eindigen op 2026-08-31.
    { soort: 'bubao', golf: 1, leerjaar: 'K1', vanaf: 2026, zekerheid: 'zeker', bronnen: ['api'] },
    { soort: 'bubao', golf: 1, leerjaar: 'K2', vanaf: 2026, zekerheid: 'zeker', bronnen: ['api'] },
    { soort: 'bubao', golf: 1, leerjaar: 'K3', vanaf: 2026, zekerheid: 'zeker', bronnen: ['api'] },
    { soort: 'bubao', golf: 1, leerjaar: 'L1', vanaf: 2026, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 1, leerjaar: 'L2', vanaf: 2026, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 1, leerjaar: 'L3', vanaf: 2026, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 1, leerjaar: 'L4', vanaf: 2027, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 1, leerjaar: 'L5', vanaf: 2027, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 1, leerjaar: 'L6', vanaf: 2028, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },

    // ── Buitengewoon basisonderwijs, golf 2 ────────────────────────────────
    // Twaalf andere oude kleutersets (ook de lege ODS_2958) eindigen op 2027-08-31; ODS_2306 en ODS_2331 hebben geen einddatum.
    { soort: 'bubao', golf: 2, leerjaar: 'K1', vanaf: 2027, zekerheid: 'zeker', bronnen: ['api'] },
    { soort: 'bubao', golf: 2, leerjaar: 'K2', vanaf: 2027, zekerheid: 'zeker', bronnen: ['api'] },
    { soort: 'bubao', golf: 2, leerjaar: 'K3', vanaf: 2027, zekerheid: 'zeker', bronnen: ['api'] },
    { soort: 'bubao', golf: 2, leerjaar: 'L1', vanaf: 2027, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 2, leerjaar: 'L2', vanaf: 2027, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 2, leerjaar: 'L3', vanaf: 2027, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 2, leerjaar: 'L4', vanaf: 2028, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 2, leerjaar: 'L5', vanaf: 2029, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
    { soort: 'bubao', golf: 2, leerjaar: 'L6', vanaf: 2030, zekerheid: 'onzeker', bronnen: ['api'], opmerking: OPMERKING_BUBAO_LAGER },
  ],
};

// ─── Schooljaar ─────────────────────────────────────────────────────────────

/**
 * Het schooljaar (beginjaar) waarin een datum 'JJJJ-MM-DD' valt. Een schooljaar begint op 1 september:
 * september tot en met december horen bij het jaar zelf, januari tot en met augustus bij het jaar ervoor.
 * Een tijd na de datum telt niet mee. Een tekst die niet te lezen is geeft undefined.
 */
export function schooljaarVan(datum: string | undefined): Schooljaar | undefined {
  if (typeof datum !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(datum);
  if (!m) return undefined;
  const jaar = Number(m[1]);
  const maand = Number(m[2]);
  const dag = Number(m[3]);
  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return undefined;
  return maand >= 9 ? jaar : jaar - 1;
}

/** Zoals schooljaarVan, voor een Date in lokale tijd. Een ongeldige Date geeft undefined. */
export function schooljaarVanDatum(d: Date): Schooljaar | undefined {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return undefined;
  const jaar = d.getFullYear();
  return d.getMonth() >= 8 ? jaar : jaar - 1;
}

/** 2026 wordt '2026-2027'. */
export function schooljaarTekst(sj: Schooljaar): string {
  return `${sj}-${sj + 1}`;
}

// ─── Opzoeken ───────────────────────────────────────────────────────────────

export function celVoor(
  soort: SoortBasis,
  golf: Golf,
  leerjaar: LeerjaarBasis,
  k: Invoeringskalender = INVOERINGSKALENDER,
): KalenderCel | undefined {
  return k.cellen.find((c) => c.soort === soort && c.golf === golf && c.leerjaar === leerjaar);
}

const LEERJAREN_PER_MOMENT: Readonly<Record<MomentKalender, readonly LeerjaarBasis[]>> = {
  kleuter: ['K1', 'K2', 'K3'],
  lager: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
};

/**
 * Het laatste 'vanaf' van een soort, golf en moment: het schooljaar waarin het nieuwe voor het hele moment
 * verplicht is (grootste 'vanaf' over K1-K3 of over L1-L6). Een kalender zonder cellen voor dat moment geeft
 * vrijwilligVanaf; controleerKalender meldt zo'n kalender.
 */
export function laatsteVanaf(soort: SoortBasis, golf: Golf, moment: MomentKalender, k: Invoeringskalender = INVOERINGSKALENDER): Schooljaar {
  let hoogste: Schooljaar | undefined;
  for (const lj of LEERJAREN_PER_MOMENT[moment]) {
    const cel = celVoor(soort, golf, lj, k);
    if (cel && (hoogste === undefined || cel.vanaf > hoogste)) hoogste = cel.vanaf;
  }
  return hoogste ?? k.vrijwilligVanaf;
}

/** De einddatum die de oude sets van deze soort, golf en moment moeten hebben: 31 augustus voor het laatste 'vanaf'. */
export function eindeOudVoor(soort: SoortBasis, golf: Golf, moment: MomentKalender, k: Invoeringskalender = INVOERINGSKALENDER): string {
  return `${laatsteVanaf(soort, golf, moment, k)}-08-31`;
}

/**
 * De dag waarop een bron in de officiële tekst is nagelezen: de laatste gevondenOp van de bronnen met hoe 'gelezen'.
 * Zonder zo'n bron is de officiële tekst nog niet nagelezen en geeft dit undefined.
 */
export function nagelezenOp(k: Invoeringskalender = INVOERINGSKALENDER): string | undefined {
  let laatste: string | undefined;
  for (const b of k.bronnen) {
    if (b.hoe === 'gelezen' && (laatste === undefined || b.gevondenOp > laatste)) laatste = b.gevondenOp;
  }
  return laatste;
}

// ─── Controle ───────────────────────────────────────────────────────────────

const SOORTEN: readonly SoortBasis[] = ['bao', 'bubao'];
const GOLVEN: readonly Golf[] = [1, 2];
const SOORT_NAAM: Readonly<Record<SoortBasis, string>> = { bao: 'gewoon basisonderwijs', bubao: 'buitengewoon basisonderwijs' };
const soortNaam = (soort: SoortBasis): string => SOORT_NAAM[soort] ?? String(soort);

function sleutelVan(tekst: string): string {
  return tekst
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isDatum(tekst: unknown): boolean {
  if (typeof tekst !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/**
 * Bewaakt de vorm en de regels van de kalender. Geeft de fouten als leesbare zinnen; een lege lijst betekent dat
 * alles in orde is.
 */
export function controleerKalender(k: Invoeringskalender = INVOERINGSKALENDER): string[] {
  const fouten: string[] = [];
  const fout = (tekst: string) => fouten.push(tekst);

  if (k.v !== 1) fout(`De versie van de kalender is ${String(k.v)}, verwacht 1.`);
  if (!isDatum(k.samengesteldOp)) fout(`De datum waarop de kalender is samengesteld (${String(k.samengesteldOp)}) is geen geldige datum JJJJ-MM-DD.`);
  if (!Number.isInteger(k.vrijwilligVanaf)) fout(`vrijwilligVanaf (${String(k.vrijwilligVanaf)}) is geen geheel schooljaar.`);

  // Bronnen
  const bronnen = new Map<string, KalenderBron>();
  for (const b of k.bronnen) {
    if (typeof b.id !== 'string' || b.id.trim() === '') {
      fout('Een bron heeft geen id.');
      continue;
    }
    if (bronnen.has(b.id)) fout(`De bron '${b.id}' staat meer dan één keer in de lijst.`);
    else bronnen.set(b.id, b);
    if (typeof b.titel !== 'string' || b.titel.trim() === '') fout(`De bron '${b.id}' heeft geen titel.`);
    if (b.url !== undefined && !(typeof b.url === 'string' && b.url.startsWith('https://') && b.url.length > 'https://'.length)) {
      fout(`De url van de bron '${b.id}' begint niet met https://.`);
    }
    if (!BRON_HOE_WAARDEN.includes(b.hoe)) fout(`De bron '${b.id}' heeft een onbekende waarde voor hoe: '${String(b.hoe)}'.`);
    if (!isDatum(b.gevondenOp)) fout(`De bron '${b.id}' heeft geen geldige datum gevondenOp (${String(b.gevondenOp)}).`);
  }

  // Elke verwijzing naar bronnen, voor cellen en vakken: bestaat ze, en hoe zeker mag het dan zijn?
  const controleerSteun = (wie: string, zekerheid: Zekerheid, ids: readonly string[]) => {
    if (!ZEKERHEID_WAARDEN.includes(zekerheid)) fout(`${wie} heeft een onbekende zekerheid: '${String(zekerheid)}'.`);
    const gekend: KalenderBron[] = [];
    for (const id of ids ?? []) {
      const b = bronnen.get(id);
      if (b) gekend.push(b);
      else fout(`${wie} verwijst naar de onbekende bron '${id}'.`);
    }
    if (zekerheid === 'zeker' && !gekend.some((b) => b.hoe === 'gegevens' || b.hoe === 'gelezen')) {
      fout(`${wie} staat op 'zeker' zonder een bron uit de gegevens of een nagelezen bron.`);
    }
    if (!gekend.some((b) => b.hoe !== 'nog-te-lezen')) fout(`${wie} steunt op geen enkele bron die al gekend is.`);
  };

  // Cellen: elke combinatie precies één keer
  const aantal = new Map<string, number>();
  for (const c of k.cellen) {
    const sleutel = `${c.soort}|${c.golf}|${c.leerjaar}`;
    aantal.set(sleutel, (aantal.get(sleutel) ?? 0) + 1);
    const onbekend = !SOORTEN.includes(c.soort) || !GOLVEN.includes(c.golf) || !LEERJAREN_BASIS.includes(c.leerjaar);
    if (onbekend) fout(`Er staat een cel met een onbekende soort, golf of leerjaar: ${sleutel}.`);
  }
  for (const soort of SOORTEN) {
    for (const golf of GOLVEN) {
      for (const lj of LEERJAREN_BASIS) {
        const n = aantal.get(`${soort}|${golf}|${lj}`) ?? 0;
        if (n === 0) fout(`De cel van ${soortNaam(soort)}, golf ${golf}, ${lj} ontbreekt.`);
        else if (n > 1) fout(`De cel van ${soortNaam(soort)}, golf ${golf}, ${lj} staat ${n} keer in de kalender.`);
      }
    }
  }

  for (const c of k.cellen) {
    const wie = `De cel van ${soortNaam(c.soort)}, golf ${c.golf}, ${c.leerjaar}`;
    if (!Number.isInteger(c.vanaf) || c.vanaf < 2025 || c.vanaf > 2035) {
      fout(`${wie} start in ${String(c.vanaf)}: dat is geen geheel schooljaar van 2025 tot 2035.`);
    } else if (c.vanaf < k.vrijwilligVanaf) {
      fout(`${wie} start in ${c.vanaf}, vóór het eerste schooljaar waarin het nieuwe mocht (${k.vrijwilligVanaf}).`);
    }
    controleerSteun(wie, c.zekerheid, c.bronnen);
  }

  // Verbanden tussen cellen (alleen tussen cellen die bestaan; ontbrekende cellen zijn al gemeld)
  const vanaf = (soort: SoortBasis, golf: Golf, lj: LeerjaarBasis) => celVoor(soort, golf, lj, k)?.vanaf;
  for (const soort of SOORTEN) {
    for (const golf of GOLVEN) {
      const naam = `${soortNaam(soort)}, golf ${golf}`;
      const k1 = vanaf(soort, golf, 'K1');
      for (const lj of ['K2', 'K3'] as const) {
        const v = vanaf(soort, golf, lj);
        if (k1 !== undefined && v !== undefined && v !== k1) fout(`${naam}: ${lj} start in ${v}, maar K1 in ${k1}. De kleuterklassen starten samen.`);
      }
      const lager = LEERJAREN_PER_MOMENT.lager;
      for (let i = 1; i < lager.length; i++) {
        const vorige = vanaf(soort, golf, lager[i - 1]);
        const volgende = vanaf(soort, golf, lager[i]);
        if (vorige === undefined || volgende === undefined) continue;
        if (volgende < vorige) fout(`${naam}: ${lager[i]} (${volgende}) start vóór ${lager[i - 1]} (${vorige}).`);
        else if (volgende > vorige + 1) {
          fout(`${naam}: ${lager[i]} (${volgende}) start meer dan een jaar na ${lager[i - 1]} (${vorige}). Een groep valt nooit terug op de oude doelen.`);
        }
      }
    }
    for (const lj of LEERJAREN_BASIS) {
      const een = vanaf(soort, 1, lj);
      const twee = vanaf(soort, 2, lj);
      if (een !== undefined && twee !== undefined && twee < een) {
        fout(`${soortNaam(soort)}, ${lj}: golf 2 start in ${twee}, vóór golf 1 (${een}).`);
      }
    }
  }
  for (const golf of GOLVEN) {
    for (const lj of LEERJAREN_BASIS) {
      const gewoon = vanaf('bao', golf, lj);
      const buitengewoon = vanaf('bubao', golf, lj);
      if (gewoon !== undefined && buitengewoon !== undefined && gewoon !== buitengewoon) {
        fout(`Golf ${golf}, ${lj}: het buitengewoon basisonderwijs start in ${buitengewoon}, het gewoon in ${gewoon}. De jaren moeten gelijk zijn.`);
      }
    }
  }

  // Vakken
  const nummers = new Map<number, number>();
  const sleutels = new Map<string, number>();
  for (const v of k.vakken) {
    nummers.set(v.nr, (nummers.get(v.nr) ?? 0) + 1);
    sleutels.set(v.sleutel, (sleutels.get(v.sleutel) ?? 0) + 1);
    const wie = `Het vak '${v.naam}' (nummer ${v.nr})`;
    if (!Number.isInteger(v.nr) || v.nr < 1 || v.nr > 10) fout(`${wie} heeft een nummer buiten 1 tot 10.`);
    if (typeof v.naam !== 'string' || v.naam.trim() === '') fout(`Het vak met nummer ${v.nr} heeft geen naam.`);
    if (typeof v.sleutel !== 'string' || v.sleutel === '' || v.sleutel !== sleutelVan(v.sleutel)) {
      fout(`${wie} heeft een sleutel ('${String(v.sleutel)}') die niet in kleine letters, zonder accenten en met één spatie staat.`);
    }
    if (!GOLVEN.includes(v.golf)) fout(`${wie} heeft golf ${String(v.golf)}: dat moet 1 of 2 zijn.`);
    controleerSteun(wie, v.zekerheid, v.bronnen);
  }
  for (let nr = 1; nr <= 10; nr++) {
    const n = nummers.get(nr) ?? 0;
    if (n === 0) fout(`Het vak met nummer ${nr} ontbreekt.`);
    else if (n > 1) fout(`Het vak met nummer ${nr} staat ${n} keer in de lijst.`);
  }
  for (const [sleutel, n] of sleutels) {
    if (n > 1) fout(`De sleutel '${sleutel}' komt bij ${n} vakken voor.`);
  }

  return fouten;
}
