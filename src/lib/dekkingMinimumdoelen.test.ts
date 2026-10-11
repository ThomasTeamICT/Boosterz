import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Course, CourseSection } from './courseTypes';
import { computeCoverage } from './coverage';
import type { Curriculum } from './curriculumTypes';
import {
  cursussenVoorRichting,
  dekkingMinimumdoelen,
  kaderDoelen,
  percentVan,
  setsAlsKader,
  type CursusBijdrage,
  type KaderDoel,
  type MdDekking,
} from './dekkingMinimumdoelen';
import { leerplanUitSelectie } from './doelenSamenstellen';
import type { Doelgroep } from './doelgroep';
import type { MinimumdoelenIndex, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import {
  bouwKader,
  kaderGroepSleutel,
  naarSetKeuzes,
  richtingInfo,
  selectieVanKader,
  type RichtingKader,
  type KaderSet,
} from './richtingKader';
import type {
  Graad,
  MatrixBestand,
  RichtingDoelenBestand,
  RichtingDoelenIndex,
  StudierichtingGroep,
  Structuuronderdeel,
} from './studierichtingen';
import type { Widget } from './types';

const VANDAAG = '2026-10-09';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte sets ─────────────────────────────────────────────────────────

const BIO = 'ODS_101';
const CHE = 'ODS_102';
const UIT = 'ODS_103';
/** Een andere versie van Biologie, met dezelfde vaste nummers: niet in het kader. */
const BIO_OUD = 'ODS_104';

interface DoelIn { id?: string; code: string; tekst?: string; optioneel?: boolean; rubriek?: string }

function setBestand(id: string, naam: string, korteNaam: string | undefined, doelen: DoelIn[]): MinimumdoelenSetBestand {
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id, naam, ...(korteNaam ? { korteNaam } : {}), geldigheid: 'Geldig', graad: '2de graad', sleutelcompetenties: [],
      bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x', opgehaald: '2026-10-05T10:00:00Z', aantal: doelen.length, sha256: SHA,
    },
    doelen: doelen.map((d) => ({
      ...(d.id !== undefined ? { id: d.id } : {}),
      code: d.code,
      tekst: d.tekst ?? `Doel ${d.code}`,
      ...(d.optioneel || d.rubriek ? {
        extra: {
          ...(d.optioneel ? { optioneel: true } : {}),
          ...(d.rubriek ? { titels: { 1: { titel: d.rubriek, nr: '1' } } } : {}),
        },
      } : {}),
    })),
  };
}

const bioBestand = setBestand(BIO, 'Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen', 'Biologie', [
  { id: '1001', code: ' 01.01 ', tekst: '<p>De leerlingen <b>beschrijven</b> de cel.</p>', rubriek: 'Cellen' },
  { id: '1002', code: '01.02' },
  { id: '1003', code: '01.03' },
  { id: '1004', code: '01.04' },
  { id: '1005', code: '01.05', optioneel: true },
]);
const cheBestand = setBestand(CHE, 'Secundair onderwijs 2de graad -  Chemie - Cesuurdoelen', 'Chemie', [
  { id: '2001', code: '02.01' },
  { id: '2002', code: '02.02' },
  { id: '2003', code: '02.03' },
  { id: '2004', code: '02.04' },
]);
const uitBestand = setBestand(UIT, 'Secundair onderwijs 1ste graad A-stroom -  Nederlands - Uitbreidingsdoelen', 'Nederlands uitbreiding', [
  { id: '3001', code: '03.01' },
  { id: '3002', code: '03.02' },
]);
const bestanden = new Map([[BIO, bioBestand], [CHE, cheBestand], [UIT, uitBestand]]);

function indexSet(b: MinimumdoelenSetBestand): MinimumdoelenIndexSet {
  return {
    id: b.set.id, naam: b.set.naam, ...(b.set.korteNaam ? { korteNaam: b.set.korteNaam } : {}), aantal: b.doelen.length,
    sha256: SHA, opgehaald: b.set.opgehaald, bestand: `${b.set.id}.json`,
  };
}

function kaderSet(b: MinimumdoelenSetBestand, ids: string[], volledig: boolean, verplicht = true): KaderSet {
  return { set: indexSet(b), ids, volledig, verplicht, versieGelijk: true };
}

function kaderMet(sets: KaderSet[]): RichtingKader {
  const aantal = sets.reduce((n, s) => n + s.ids.length, 0);
  return {
    keuze: { groep: 'G-0193', soort: 'so' }, herkomst: 'api', sets, aantalDoelen: aantal,
    aantalVerplicht: sets.filter((s) => s.verplicht).reduce((n, s) => n + s.ids.length, 0),
    nietVoorDitJaar: [], verborgenOud: 0, verborgenAndereSoort: 0, onbekend: [], teGroot: false,
  };
}

/**
 * Het kader van de hoofdgevallen (9 doelen):
 * - Biologie, volledig: 1001, 1002, 1003, 1004 en 1005 (optioneel);
 * - Chemie, een deelset: 2002 en 2004;
 * - Nederlands uitbreiding (niet verplicht): 3001 en 3002.
 * Verplicht (telt in het totaal): 1001 tot 1004, 2002 en 2004 = 6. Optioneel: 1005, 3001 en 3002 = 3.
 */
const KADER = kaderMet([
  kaderSet(bioBestand, ['1001', '1002', '1003', '1004', '1005'], true),
  kaderSet(cheBestand, ['2002', '2004'], false),
  kaderSet(uitBestand, ['3001', '3002'], true, false),
]);
const DOELEN = kaderDoelen(KADER, bestanden);

// ── Nagemaakte cursussen, leerplannen en oefeningen ──────────────────────────

type Ref = [set: string, id: string];

function leerplan(id: string, goals: { code: string; refs?: Ref[] }[], extra: Partial<Curriculum> = {}): Curriculum {
  return {
    id, title: `Leerplan ${id}`, net: 'eigen', subject: 'Natuurwetenschappen', level: '2de graad', createdAt: 0, updatedAt: 0,
    goals: goals.map((g, i) => ({
      id: `${id}-g${i}`, code: g.code, text: `Doel ${g.code}`,
      ...(g.refs ? { refs: g.refs.map(([set, rid]) => ({ set, id: rid, code: rid })) } : {}),
    })),
    ...extra,
  };
}

const tekst = (id: string) => ({ id, type: 'text', markdown: 'Uitleg' });
const doelenCallout = (id: string) => ({ id, type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text: '…' });
const oefening = (id: string, widgetId: string) => ({ id, type: 'widget', widgetId });

function sectie(id: string, goalCodes: string[], blocks: unknown[], optional = false): CourseSection {
  return { id, title: `Sectie ${id}`, goalCodes, blocks, ...(optional ? { optional: true } : {}) } as unknown as CourseSection;
}

function cursus(id: string, title: string, curriculumId: string | undefined, sections: CourseSection[], extra: Partial<Course> = {}): Course {
  return {
    id, title, author: '', coverEmoji: '📘', code: 'ABC123',
    ...(curriculumId !== undefined ? { curriculumId } : {}),
    settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
    createdAt: 0, updatedAt: 0,
    chapters: [{ id: `${id}-h1`, title: 'Hoofdstuk', sections }],
    ...extra,
  };
}

function widgetMet(id: string, codes: string[], curriculumId?: string): Widget {
  return {
    id, type: 'quiz', title: `Oefening ${id}`, folderId: null, code: 'QQQ111', settings: {}, createdAt: 0, updatedAt: 0,
    ...(curriculumId ? { curriculumId } : {}),
    config: { questions: codes.map((goalCode, i) => ({ id: `q${i}`, goalCode })) },
  } as unknown as Widget;
}

// Cursus 1: Biologie, met een samengestelde lijst die naar de eigen set verwijst.
const LP_BIO = leerplan('lp-bio', [
  { code: 'BIO1', refs: [[BIO, '1001']] },
  { code: 'BIO2', refs: [[BIO, '1002']] },
  { code: 'BIO3', refs: [[BIO, '1003']] },
  { code: 'BIO5', refs: [[BIO, '1005']] },
  { code: 'BIOX', refs: [[BIO_OUD, '1004']] }, // een andere versie van de set: buiten het kader
]);
const C_BIO = cursus('c-bio', 'Biologie in het 3de jaar', 'lp-bio', [
  sectie('s1', ['BIO1'], [tekst('t1')]), // gedekt
  sectie('s2', ['BIO2'], [doelenCallout('d2')]), // gepland: alleen een doelen-callout
  sectie('s3', ['BIO3'], [tekst('t3')], true), // verdieping: alleen in een keuzesectie
  sectie('s4', ['BIO5'], [tekst('t4')]), // gedekt (een optioneel minimumdoel)
  sectie('s5', ['BIOX'], [tekst('t5')]), // gedekt, maar via een set buiten het kader
]);

// Cursus 2: Chemie, met een leerplan van een net: twee verwijzingen per doel.
const LP_NET = leerplan('lp-net', [
  { code: 'CH1', refs: [[CHE, '2002'], [BIO, '1002']] },
  { code: 'CH2', refs: [[CHE, '2003'], [UIT, '3001']] }, // 2003 hoort niet bij de deelset van de richting
  { code: 'CH3', refs: [[CHE, '2004']] }, // de cursus behandelt dit doel niet
], { net: 'kov', kind: 'leerplan' });
const W_CH1 = widgetMet('w-ch1', ['CH1'], 'lp-net');
const C_CHE = cursus('c-che', 'Chemie', 'lp-net', [
  sectie('t1', [], [oefening('o1', 'w-ch1')]), // CH1 via een oefening in een gewone sectie: gedekt
  sectie('t2', ['CH2'], [doelenCallout('d1')]), // gepland
]);

const C_GEEN = cursus('c-geen', 'Zonder leerplan', undefined, [sectie('g1', ['BIO1'], [tekst('x')])]);
const C_WEG = cursus('c-weg', 'Leerplan van een ander toestel', 'lp-weg', [sectie('g1', ['BIO1'], [tekst('x')])]);
const LP_ZONDER = leerplan('lp-zonder', [{ code: 'BIO1' }, { code: 'BIO2', refs: [] }]);
const C_ZONDER = cursus('c-zonder', 'Leerplan zonder verwijzingen', 'lp-zonder', [sectie('g1', ['BIO1', 'BIO2'], [tekst('x')])]);

const BIJDRAGEN: CursusBijdrage[] = [
  { course: C_BIO, leerplan: LP_BIO },
  { course: C_CHE, leerplan: LP_NET },
  { course: C_GEEN },
  { course: C_WEG },
  { course: C_ZONDER, leerplan: LP_ZONDER },
];

const statussen = (d: MdDekking) => Object.fromEntries(d.rijen.map((r) => [`${r.doel.set}|${r.doel.id}`, r.status]));
const tellers = (d: MdDekking) => ({ totaal: d.totaal, gedekt: d.gedekt, gepland: d.gepland, verdieping: d.verdieping, open: d.open, percent: d.percent });

// ── kaderDoelen en setsAlsKader ─────────────────────────────────────────────

describe('kaderDoelen', () => {
  it('de doelen in de volgorde van het kader: volledige sets helemaal, deelsets alleen hun nummers, uitbreiding niet verplicht', () => {
    expect(DOELEN.map((d) => `${d.set}|${d.id}`)).toEqual([
      `${BIO}|1001`, `${BIO}|1002`, `${BIO}|1003`, `${BIO}|1004`, `${BIO}|1005`, `${CHE}|2002`, `${CHE}|2004`, `${UIT}|3001`, `${UIT}|3002`,
    ]);
    expect(DOELEN.filter((d) => d.optioneel).map((d) => d.id)).toEqual(['1005']);
    expect(DOELEN.filter((d) => !d.verplichteSet).map((d) => d.id)).toEqual(['3001', '3002']);
  });

  it('elk doel: korte setnaam, getrimde code, tekst zonder HTML, rubriek uit de titels', () => {
    expect(DOELEN[0]).toEqual({
      set: BIO, setNaam: 'Biologie', id: '1001', code: '01.01', tekst: 'De leerlingen beschrijven de cel.', rubriek: 'Cellen',
      optioneel: false, verplichteSet: true,
    });
    expect(DOELEN[1]).not.toHaveProperty('rubriek');
    expect(DOELEN[7].setNaam).toBe('Nederlands uitbreiding');
  });

  it('een volledige set neemt de huidige inhoud van het bestand (§ 7), ook als de koppeling minder nummers noemde', () => {
    const k = kaderMet([kaderSet(bioBestand, ['1001', '1002'], true)]);
    expect(kaderDoelen(k, bestanden).map((d) => d.id)).toEqual(['1001', '1002', '1003', '1004', '1005']);
  });

  it('een deelset: in de volgorde van de set, zonder nummers die niet (meer) in het bestand staan', () => {
    const k = kaderMet([kaderSet(cheBestand, ['2004', ' 2002 ', '2999', ''], false)]);
    expect(kaderDoelen(k, bestanden).map((d) => d.id)).toEqual(['2002', '2004']);
  });

  it('een set zonder geladen bestand, of met het bestand van een andere set, valt weg', () => {
    // Biologie is een volledige set: met het bestand van Chemie zouden er 4 doelen van Chemie als Biologie in staan.
    const anders = kaderMet([kaderSet(bioBestand, ['1001'], true), kaderSet(cheBestand, ['2002'], false)]);
    expect(kaderDoelen(anders, new Map([[BIO, cheBestand]]))).toEqual([]);
    expect(setsAlsKader([BIO], new Map([[BIO, cheBestand]]))).toEqual([]);
    expect(kaderDoelen(anders, new Map([[CHE, cheBestand]])).map((d) => d.id)).toEqual(['2002']);
  });

  it('een doel zonder vast nummer valt weg; een dubbel nummer telt één keer; zonder korte naam de volledige naam', () => {
    const b = setBestand('ODS_105', 'Secundair onderwijs 2de graad -  Fysica - Cesuurdoelen', undefined, [
      { id: '5001', code: '1' }, { code: '2' }, { id: '5001', code: '3' }, { id: '5002', code: '4' },
    ]);
    const doelen = kaderDoelen(kaderMet([kaderSet(b, ['5001', '5002'], true)]), new Map([['ODS_105', b]]));
    expect(doelen.map((d) => `${d.id}:${d.code}`)).toEqual(['5001:1', '5002:4']);
    expect(doelen[0].setNaam).toBe('Secundair onderwijs 2de graad -  Fysica - Cesuurdoelen');
  });
});

describe('setsAlsKader', () => {
  it('alle doelen van de sets in de gegeven volgorde, elke set één keer, een uitbreidingsset niet verplicht', () => {
    const doelen = setsAlsKader([CHE, BIO, CHE, 'ODS_999', ` ${UIT} `], bestanden);
    expect(doelen.map((d) => d.id)).toEqual(['2001', '2002', '2003', '2004', '1001', '1002', '1003', '1004', '1005', '3001', '3002']);
    expect(doelen.filter((d) => !d.verplichteSet).map((d) => d.set)).toEqual([UIT, UIT]);
    expect(doelen.find((d) => d.id === '1005')!.optioneel).toBe(true);
  });

  it('zonder sets of zonder bestanden: een leeg kader', () => {
    expect(setsAlsKader([], bestanden)).toEqual([]);
    expect(setsAlsKader([BIO], new Map())).toEqual([]);
  });
});

// ── dekkingMinimumdoelen ────────────────────────────────────────────────────

describe('dekkingMinimumdoelen: twee cursussen met verschillende leerplannen', () => {
  const d = dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1]);

  it('status per doel: gedekt > gepland > verdieping > open, over de cursussen heen', () => {
    expect(statussen(d)).toEqual({
      [`${BIO}|1001`]: 'gedekt', // BIO1 in een gewone sectie met inhoud
      [`${BIO}|1002`]: 'gedekt', // gepland in Biologie (BIO2), gedekt in Chemie (CH1): de beste status wint
      [`${BIO}|1003`]: 'verdieping', // alleen in een keuzesectie
      [`${BIO}|1004`]: 'open', // alleen via een andere versie van de set: telt strikt niet
      [`${BIO}|1005`]: 'gedekt',
      [`${CHE}|2002`]: 'gedekt', // CH1 via de oefening
      [`${CHE}|2004`]: 'open', // CH3 staat nergens in de cursus
      [`${UIT}|3001`]: 'gepland', // CH2 staat alleen op een sectie met een doelen-callout
      [`${UIT}|3002`]: 'open',
    });
  });

  it('via: beste status eerst, met de cursus en de doelcode van haar leerplan', () => {
    const rij = d.rijen.find((r) => r.doel.id === '1002')!;
    expect(rij.via).toEqual([
      { courseId: 'c-che', courseTitle: 'Chemie', code: 'CH1', status: 'gedekt' },
      { courseId: 'c-bio', courseTitle: 'Biologie in het 3de jaar', code: 'BIO2', status: 'gepland' },
    ]);
    expect(d.rijen.find((r) => r.doel.id === '1003')!.via).toEqual([
      { courseId: 'c-bio', courseTitle: 'Biologie in het 3de jaar', code: 'BIO3', status: 'verdieping' },
    ]);
    expect(d.rijen.find((r) => r.doel.id === '1004')!.via).toEqual([]);
    expect(d.rijen.find((r) => r.doel.id === '2004')!.via).toEqual([]);
  });

  it('totaal en percent alleen over de 6 verplichte doelen: 3 gedekt, 1 verdieping, 2 open = 50 %', () => {
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 3, gepland: 0, verdieping: 1, open: 2, percent: 50 });
  });

  it('optionele doelen en de uitbreidingsset apart: 3 doelen, waarvan 1 gedekt (1005)', () => {
    expect(d.optioneel).toEqual({ totaal: 3, gedekt: 1 });
  });

  it('perSet telt alle doelen van elke set, in de volgorde van het kader', () => {
    expect(d.perSet).toEqual([
      { set: BIO, setNaam: 'Biologie', totaal: 5, gedekt: 3, gepland: 0, verdieping: 1 },
      { set: CHE, setNaam: 'Chemie', totaal: 2, gedekt: 1, gepland: 0, verdieping: 0 },
      { set: UIT, setNaam: 'Nederlands uitbreiding', totaal: 2, gedekt: 0, gepland: 1, verdieping: 0 },
    ]);
  });

  it('per cursus: telt mee of niet met de reden, draagtBij en buitenKader', () => {
    expect(d.cursussen).toEqual([
      // 1001, 1002, 1003 en 1005; BIOX wijst naar ODS_104|1004
      { courseId: 'c-bio', titel: 'Biologie in het 3de jaar', telt: true, draagtBij: 4, buitenKader: 1 },
      // 2002, 1002 en 3001; CH2 wijst ook naar ODS_102|2003; CH3 behandelt de cursus niet en telt dus niet
      { courseId: 'c-che', titel: 'Chemie', telt: true, draagtBij: 3, buitenKader: 1 },
      { courseId: 'c-geen', titel: 'Zonder leerplan', telt: false, reden: 'geen-leerplan', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-weg', titel: 'Leerplan van een ander toestel', telt: false, reden: 'leerplan-ontbreekt', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-zonder', titel: 'Leerplan zonder verwijzingen', telt: false, reden: 'geen-verwijzingen', draagtBij: 0, buitenKader: 0 },
    ]);
  });

  it('zelfdeNummerAndereSet: 1004 zou gedekt zijn als ODS_104|1004 meetelde (2003 staat in geen andere kaderset)', () => {
    expect(d.zelfdeNummerAndereSet).toBe(1);
  });

  it('samenvatting', () => {
    expect(d.samenvatting).toBe(
      'Je cursussen dekken 3 van de 6 minimumdoelen (50 %). 0 doelen staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 2 nog niet.',
    );
  });

  it('zonder de oefening is CH1 niet behandeld: 2002 open en 1002 alleen gepland', () => {
    const z = dekkingMinimumdoelen(DOELEN, BIJDRAGEN, []);
    expect(statussen(z)[`${CHE}|2002`]).toBe('open');
    expect(statussen(z)[`${BIO}|1002`]).toBe('gepland');
    expect(tellers(z)).toEqual({ totaal: 6, gedekt: 1, gepland: 1, verdieping: 1, open: 3, percent: 17 });
    expect(z.samenvatting).toBe(
      'Je cursussen dekken 1 van de 6 minimumdoelen (17 %). 1 doel staat al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 3 nog niet.',
    );
  });

  it('een oefening van een ander leerplan dekt niets (zoals in computeCoverage)', () => {
    const z = dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [widgetMet('w-ch1', ['CH1'], 'lp-ander')]);
    expect(statussen(z)[`${CHE}|2002`]).toBe('open');
  });

  it('de volgorde van de cursussen verandert de statussen en de tellers niet', () => {
    const omgekeerd = dekkingMinimumdoelen(DOELEN, [...BIJDRAGEN].reverse(), [W_CH1]);
    expect(statussen(omgekeerd)).toEqual(statussen(d));
    expect(tellers(omgekeerd)).toEqual(tellers(d));
    expect(omgekeerd.rijen.find((r) => r.doel.id === '1002')!.via.map((v) => v.status)).toEqual(['gedekt', 'gepland']);
  });
});

describe('dekkingMinimumdoelen: volgorde van de statussen binnen één leerplan', () => {
  // Drie doelen van één leerplan wijzen naar BIO|1001 (gedekt, gepland en verdieping), twee naar BIO|1002 (alleen gepland
  // en verdieping). De volgorde in het leerplan is met opzet niet de volgorde van de statussen: voor 1001 eerst de
  // verdieping, voor 1002 eerst gepland. Zo valt "de eerste wint", "de laatste wint" en een verkeerde rangorde op.
  const lp = leerplan('lp-volg', [
    { code: 'V1', refs: [[BIO, '1001']] }, // in een keuzesectie: verdieping
    { code: 'P1', refs: [[BIO, '1001']] }, // op een sectie met alleen een doelen-callout: gepland
    { code: 'P2', refs: [[BIO, '1002']] }, // gepland
    { code: 'G1', refs: [[BIO, '1001']] }, // op een gewone sectie met inhoud: gedekt
    { code: 'V2', refs: [[BIO, '1002']] }, // verdieping
  ]);
  const c = cursus('c-volg', 'Volgorde', 'lp-volg', [
    sectie('g', ['G1'], [doelenCallout('dg'), tekst('tg')]),
    sectie('p', ['P1', 'P2'], [doelenCallout('dp')]),
    sectie('k', ['V1', 'V2'], [tekst('tk')], true),
  ]);
  const d = dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []);
  const viaVan = (id: string) => d.rijen.find((r) => r.doel.id === id)!.via.map((v) => `${v.code}:${v.status}`);

  it('gedekt, gepland en verdieping op hetzelfde minimumdoel: gedekt, met via in de volgorde gedekt, gepland, verdieping', () => {
    expect(statussen(d)[`${BIO}|1001`]).toBe('gedekt');
    expect(viaVan('1001')).toEqual(['G1:gedekt', 'P1:gepland', 'V1:verdieping']);
  });

  it('alleen gepland en verdieping: gepland, met via in de volgorde gepland, verdieping', () => {
    expect(statussen(d)[`${BIO}|1002`]).toBe('gepland');
    expect(viaVan('1002')).toEqual(['P2:gepland', 'V2:verdieping']);
  });

  it('de tellers: 1 gedekt, 1 gepland, de 4 andere verplichte doelen open; 1 van 6 = 16,7 % → 17', () => {
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 1, gepland: 1, verdieping: 0, open: 4, percent: 17 });
    expect(d.perSet[0]).toEqual({ set: BIO, setNaam: 'Biologie', totaal: 5, gedekt: 1, gepland: 1, verdieping: 0 });
    expect(d.cursussen[0]).toEqual({ courseId: 'c-volg', titel: 'Volgorde', telt: true, draagtBij: 2, buitenKader: 0 });
  });
});

describe('dekkingMinimumdoelen: een netleerplan met 2 verwijzingen per doel', () => {
  it('dekt beide minimumdoelen van elk doel', () => {
    const lp = leerplan('lp-kov', [
      { code: 'N1', refs: [[BIO, '1001'], [CHE, '2002']] },
      { code: 'N2', refs: [[BIO, '1002'], [CHE, '2004']] },
    ], { net: 'kov', kind: 'leerplan' });
    const c = cursus('c-kov', 'Wetenschappen', 'lp-kov', [sectie('a', ['N1', 'N2'], [tekst('t')])]);
    const d = dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []);
    expect(d.rijen.filter((r) => r.status === 'gedekt').map((r) => r.doel.id)).toEqual(['1001', '1002', '2002', '2004']);
    expect(d.rijen.find((r) => r.doel.id === '2002')!.via.map((v) => v.code)).toEqual(['N1']);
    // 4 van de 6 verplichte doelen: 66,7 % → 67
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 4, gepland: 0, verdieping: 0, open: 2, percent: 67 });
    expect(d.cursussen).toEqual([{ courseId: 'c-kov', titel: 'Wetenschappen', telt: true, draagtBij: 4, buitenKader: 0 }]);
  });
});

describe('dekkingMinimumdoelen: een vers geraamte', () => {
  // Het leerplan van de richting zoals de cursushulp het maakt (selectieVanKader → naarSetKeuzes → leerplanUitSelectie),
  // en een geraamte: elke sectie draagt doelcodes en heeft alleen een doelen-callout.
  const { keuzes } = naarSetKeuzes(selectieVanKader(KADER), bestanden);
  const r = leerplanUitSelectie(keuzes, { titel: 'Natuurwetenschappen' });
  const lp = r.leerplan;
  const geraamte = (metInhoud: string[] = []) => cursus('c-nieuw', 'Nieuw', lp.id,
    lp.goals.map((g, i) => sectie(`s${i}`, [g.code], metInhoud.includes(g.code) ? [doelenCallout(`d${i}`), tekst(`t${i}`)] : [doelenCallout(`d${i}`)])));

  it('het leerplan bevat de verplichte sets van het kader, zonder de uitbreidingsset', () => {
    expect(r.bevestigd).toBe(true);
    expect(lp.goals.map((g) => g.refs?.map((x) => `${x.set}|${x.id}`).join())).toEqual([
      `${BIO}|1001`, `${BIO}|1002`, `${BIO}|1003`, `${BIO}|1004`, `${BIO}|1005`, `${CHE}|2002`, `${CHE}|2004`,
    ]);
  });

  it('is 0 % gedekt en alles gepland (computeCoverage zegt 100 %: daarom bestaat gepland)', () => {
    const c = geraamte();
    expect(computeCoverage(c, lp, []).percent).toBe(100);
    const d = dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []);
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 0, gepland: 6, verdieping: 0, open: 0, percent: 0 });
    expect(d.optioneel).toEqual({ totaal: 3, gedekt: 0 });
    expect(statussen(d)[`${BIO}|1005`]).toBe('gepland');
    expect(statussen(d)[`${UIT}|3001`]).toBe('open');
    expect(d.cursussen[0]).toEqual({ courseId: 'c-nieuw', titel: 'Nieuw', telt: true, draagtBij: 7, buitenKader: 0 });
    expect(d.samenvatting).toBe(
      'Je cursussen dekken 0 van de 6 minimumdoelen (0 %). 6 doelen staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 0 nog niet.',
    );
  });

  it('wordt gedekt per sectie die inhoud krijgt', () => {
    const eerste = lp.goals[0].code;
    const d = dekkingMinimumdoelen(DOELEN, [{ course: geraamte([eerste]), leerplan: lp }], []);
    // 1 van de 6: 16,7 % → 17
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 1, gepland: 5, verdieping: 0, open: 0, percent: 17 });
  });
});

describe('dekkingMinimumdoelen: wanneer een cursus niet meetelt', () => {
  const metSectie = (cid: string | undefined) => cursus('c', 'Cursus', cid, [sectie('a', ['BIO1'], [tekst('t')])]);
  const reden = (b: CursusBijdrage) => dekkingMinimumdoelen(DOELEN, [b], []).cursussen[0];

  it('zonder leerplan, ook als er een leerplan meegegeven wordt', () => {
    expect(reden({ course: metSectie(undefined), leerplan: LP_BIO })).toMatchObject({ telt: false, reden: 'geen-leerplan' });
    expect(reden({ course: metSectie(''), leerplan: LP_BIO })).toMatchObject({ telt: false, reden: 'geen-leerplan' });
  });

  it('het leerplan staat niet op dit toestel; en nooit met een ander leerplan dan dat van de cursus', () => {
    expect(reden({ course: metSectie('lp-bio') })).toMatchObject({ telt: false, reden: 'leerplan-ontbreekt' });
    expect(reden({ course: metSectie('lp-bio'), leerplan: LP_NET })).toMatchObject({ telt: false, reden: 'leerplan-ontbreekt' });
  });

  it('geen enkel doel met een bruikbare verwijzing, of kapotte doelen: geen-verwijzingen, zonder fout', () => {
    const kapot = leerplan('lp-k', [{ code: 'BIO1' }]);
    kapot.goals[0].refs = [{ set: '', id: '1001', code: '' }, null, { set: BIO }, { set: BIO, id: '  ' }] as unknown as Curriculum['goals'][number]['refs'];
    expect(reden({ course: metSectie('lp-k'), leerplan: kapot })).toMatchObject({ telt: false, reden: 'geen-verwijzingen' });
    const zonderDoelen = { ...leerplan('lp-k', []), goals: undefined } as unknown as Curriculum;
    expect(reden({ course: metSectie('lp-k'), leerplan: zonderDoelen })).toMatchObject({ telt: false, reden: 'geen-verwijzingen' });
  });

  it('een cursus die niet meetelt, verandert niets aan de statussen', () => {
    const d = dekkingMinimumdoelen(DOELEN, [{ course: C_GEEN }, { course: C_WEG }, { course: C_ZONDER, leerplan: LP_ZONDER }], []);
    expect(d.rijen.every((r) => r.status === 'open' && r.via.length === 0)).toBe(true);
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 0, gepland: 0, verdieping: 0, open: 6, percent: 0 });
  });

  it('een vast nummer als getal (oude opslag) telt zoals de tekst', () => {
    const lp = leerplan('lp-g', [{ code: 'BIO1' }]);
    lp.goals[0].refs = [{ set: BIO, id: 1001, code: '01.01' }] as unknown as Curriculum['goals'][number]['refs'];
    const d = dekkingMinimumdoelen(DOELEN, [{ course: metSectie('lp-g'), leerplan: lp }], []);
    expect(statussen(d)[`${BIO}|1001`]).toBe('gedekt');
  });
});

describe('dekkingMinimumdoelen: strikt op set + vast nummer', () => {
  it('een verwijzing naar een andere set met hetzelfde nummer dekt niets, en telt in buitenKader', () => {
    const lp = leerplan('lp-oud', [{ code: 'A', refs: [[BIO_OUD, '1001']] }, { code: 'B', refs: [[BIO_OUD, '1002']] }]);
    const c = cursus('c-oud', 'Oude versie', 'lp-oud', [sectie('a', ['A', 'B'], [tekst('t')])]);
    const d = dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []);
    expect(d.gedekt).toBe(0);
    expect(d.cursussen[0]).toMatchObject({ telt: true, draagtBij: 0, buitenKader: 2 });
    expect(d.zelfdeNummerAndereSet).toBe(2);
  });

  it('een nummer dat niet in de deelset van de richting staat, telt niet, ook al is de set een kaderset', () => {
    const lp = leerplan('lp-d', [{ code: 'A', refs: [[CHE, '2001']] }]);
    const c = cursus('c-d', 'Deelset', 'lp-d', [sectie('a', ['A'], [tekst('t')])]);
    const d = dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []);
    expect(d.gedekt).toBe(0);
    expect(d.cursussen[0]).toMatchObject({ draagtBij: 0, buitenKader: 1 });
    expect(d.zelfdeNummerAndereSet).toBe(0); // 2001 staat in geen andere kaderset
  });

  it('buitenKader telt elk minimumdoel één keer per cursus, en alleen van doelen die de cursus behandelt', () => {
    const lp = leerplan('lp-b', [
      { code: 'A', refs: [[BIO_OUD, '1001']] },
      { code: 'B', refs: [[BIO_OUD, '1001'], ['ODS_999', '9']] },
      { code: 'C', refs: [['ODS_999', '10']] }, // niet behandeld
    ]);
    const c = cursus('c-b', 'B', 'lp-b', [sectie('a', ['A', 'B'], [tekst('t')])]);
    expect(dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []).cursussen[0].buitenKader).toBe(2);
  });

  it('zelfdeNummerAndereSet telt een doel niet dat al strikt gedekt is; wel een doel dat strikt open of verdieping is', () => {
    const lp = leerplan('lp-z', [
      { code: 'A', refs: [[BIO_OUD, '1001']] }, // gedekt, maar 1001 is al strikt gedekt via B → telt niet
      { code: 'B', refs: [[BIO, '1001']] },
      { code: 'C', refs: [[BIO_OUD, '1002']] }, // via de andere set gepland, 1002 strikt open → telt
      { code: 'D', refs: [[BIO_OUD, '1003']] }, // via de andere set gedekt, 1003 strikt alleen verdieping → telt
      { code: 'E', refs: [[BIO, '1003']] },
    ]);
    const c = cursus('c-z', 'Z', 'lp-z', [
      sectie('a', ['A', 'B', 'D'], [tekst('t')]),
      sectie('b', ['C'], [doelenCallout('d')]),
      sectie('k', ['E'], [tekst('t2')], true),
    ]);
    const d = dekkingMinimumdoelen(DOELEN, [{ course: c, leerplan: lp }], []);
    expect(statussen(d)[`${BIO}|1001`]).toBe('gedekt');
    expect(statussen(d)[`${BIO}|1002`]).toBe('open');
    expect(statussen(d)[`${BIO}|1003`]).toBe('verdieping');
    expect(d.zelfdeNummerAndereSet).toBe(2); // 1002 en 1003
    expect(d.cursussen[0]).toMatchObject({ draagtBij: 2, buitenKader: 3 });
  });

  describe('zelfdeNummerAndereSet: een telling van verplichte doelen', () => {
    /** Andere versies en soorten (bv. de kopie voor het buitengewoon onderwijs) van de sets: geen van alle in het kader. */
    const BIO_BUSO = 'ODS_110';
    const CHE_BUSO = 'ODS_111';
    const UIT_OUD = 'ODS_112';
    const met = (lp: Curriculum, secties: CourseSection[], id = 'c-n') => ({ course: cursus(id, id, lp.id, secties), leerplan: lp });

    it('elke status via de andere set telt: gedekt, gepland en verdieping (3 doelen)', () => {
      const lp = leerplan('lp-n1', [
        { code: 'A', refs: [[BIO_OUD, '1001']] }, // gedekt
        { code: 'B', refs: [[BIO_OUD, '1002']] }, // gepland
        { code: 'C', refs: [[CHE_BUSO, '2002']] }, // verdieping
      ]);
      const d = dekkingMinimumdoelen(DOELEN, [met(lp, [
        sectie('a', ['A'], [tekst('t')]), sectie('b', ['B'], [doelenCallout('d')]), sectie('k', ['C'], [tekst('t2')], true),
      ])], []);
      expect(d.gedekt + d.gepland + d.verdieping).toBe(0); // strikt dekt niets
      expect(d.zelfdeNummerAndereSet).toBe(3); // 1001, 1002 en 2002
    });

    it('alleen verplichte doelen: een optioneel doel en een doel uit een uitbreidingsset tellen niet (1 doel)', () => {
      const lp = leerplan('lp-n2', [
        { code: 'A', refs: [[BIO_OUD, '1005']] }, // 1005 is optioneel → telt niet
        { code: 'B', refs: [[UIT_OUD, '3001']] }, // 3001 zit in de uitbreidingsset → telt niet
        { code: 'C', refs: [[BIO_OUD, '1004']] }, // 1004 is verplicht en open → telt
      ]);
      const d = dekkingMinimumdoelen(DOELEN, [met(lp, [sectie('a', ['A', 'B', 'C'], [tekst('t')])])], []);
      expect(d.zelfdeNummerAndereSet).toBe(1);
      expect(d.cursussen[0]).toMatchObject({ draagtBij: 0, buitenKader: 3 });
    });

    it('telt doelen, geen verwijzingen: één doel via twee sets, twee leerplandoelen en twee cursussen telt één keer', () => {
      const lp1 = leerplan('lp-n3', [
        { code: 'A', refs: [[BIO_OUD, '1002'], [BIO_BUSO, '1002']] },
        { code: 'B', refs: [[BIO_OUD, '1002']] },
      ]);
      const lp2 = leerplan('lp-n4', [{ code: 'X', refs: [[BIO_BUSO, '1002']] }]);
      const d = dekkingMinimumdoelen(DOELEN, [
        met(lp1, [sectie('a', ['A', 'B'], [tekst('t')])], 'c-n3'),
        met(lp2, [sectie('a', ['X'], [doelenCallout('d')])], 'c-n4'),
      ], []);
      expect(d.zelfdeNummerAndereSet).toBe(1);
    });

    it('een doel dat een andere cursus strikt dekt, telt niet; een doel dat strikt alleen gepland is, wel (1 doel)', () => {
      const oud = leerplan('lp-n5', [{ code: 'A', refs: [[BIO_OUD, '1001']] }, { code: 'B', refs: [[BIO_OUD, '1004']] }]);
      const strikt = leerplan('lp-n6', [{ code: 'S', refs: [[BIO, '1001']] }, { code: 'T', refs: [[BIO, '1004']] }]);
      const d = dekkingMinimumdoelen(DOELEN, [
        met(oud, [sectie('a', ['A', 'B'], [tekst('t')])], 'c-n5'),
        met(strikt, [sectie('a', ['S'], [tekst('t')]), sectie('b', ['T'], [doelenCallout('d')])], 'c-n6'),
      ], []);
      expect(statussen(d)[`${BIO}|1001`]).toBe('gedekt');
      expect(statussen(d)[`${BIO}|1004`]).toBe('gepland');
      expect(d.zelfdeNummerAndereSet).toBe(1); // 1004
    });

    it('een leerplandoel dat de cursus niet behandelt, of een cursus die niet meetelt: telt niet (0 doelen)', () => {
      const lp = leerplan('lp-n7', [{ code: 'A', refs: [[BIO, '1001']] }, { code: 'B', refs: [[BIO_OUD, '1002']] }]);
      const ander = leerplan('lp-n8', [{ code: 'A', refs: [[BIO_OUD, '1003']] }]);
      const d = dekkingMinimumdoelen(DOELEN, [
        met(lp, [sectie('a', ['A'], [tekst('t')])], 'c-n7'), // B staat nergens in de cursus
        // Het meegegeven leerplan is niet dat van de cursus: de cursus telt niet mee, ook haar verwijzingen niet.
        { course: cursus('c-n8', 'Ander', 'lp-ontbreekt', [sectie('a', ['A'], [tekst('t')])]), leerplan: ander },
      ], []);
      expect(d.cursussen.map((x) => x.reden ?? 'telt')).toEqual(['telt', 'leerplan-ontbreekt']);
      expect(d.zelfdeNummerAndereSet).toBe(0);
    });
  });

  it('hetzelfde nummer in twee kadersets: een verwijzing dekt alleen het doel van haar eigen set', () => {
    const tweede = setBestand('ODS_106', 'Secundair onderwijs 2de graad -  STEM - Cesuurdoelen', 'STEM', [{ id: '1001', code: 'S1' }]);
    const doelen = kaderDoelen(kaderMet([kaderSet(bioBestand, ['1001'], false), kaderSet(tweede, ['1001'], true)]),
      new Map([[BIO, bioBestand], ['ODS_106', tweede]]));
    expect(doelen.map((x) => `${x.set}|${x.id}`)).toEqual([`${BIO}|1001`, 'ODS_106|1001']);
    const lp = leerplan('lp-s', [{ code: 'A', refs: [[BIO, '1001']] }]);
    const c = cursus('c-s', 'S', 'lp-s', [sectie('a', ['A'], [tekst('t')])]);
    const d = dekkingMinimumdoelen(doelen, [{ course: c, leerplan: lp }], []);
    expect(d.rijen.map((x) => x.status)).toEqual(['gedekt', 'open']);
    expect(d.zelfdeNummerAndereSet).toBe(0); // de verwijzing staat in het kader: ze telt niet voor een andere set
  });
});

describe('dekkingMinimumdoelen: grenzen en samenvatting', () => {
  it('een leeg kader: niets te dekken, percent 0, elke verwijzing buiten het kader', () => {
    const d = dekkingMinimumdoelen([], [{ course: C_BIO, leerplan: LP_BIO }], []);
    expect(d.rijen).toEqual([]);
    expect(d.perSet).toEqual([]);
    expect(tellers(d)).toEqual({ totaal: 0, gedekt: 0, gepland: 0, verdieping: 0, open: 0, percent: 0 });
    expect(d.optioneel).toEqual({ totaal: 0, gedekt: 0 });
    // BIO1, BIO2, BIO3, BIO5 en BIOX worden behandeld: 5 verschillende minimumdoelen
    expect(d.cursussen[0]).toMatchObject({ telt: true, draagtBij: 0, buitenKader: 5 });
    expect(d.zelfdeNummerAndereSet).toBe(0);
    expect(d.samenvatting).toBe('Er zijn geen minimumdoelen om te dekken.');
  });

  it('zonder cursussen: alles open', () => {
    const d = dekkingMinimumdoelen(DOELEN, [], []);
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 0, gepland: 0, verdieping: 0, open: 6, percent: 0 });
    expect(d.optioneel).toEqual({ totaal: 3, gedekt: 0 });
    expect(d.cursussen).toEqual([]);
    expect(d.samenvatting).toBe('Nog geen cursus voor deze richting: de dekking is 0 van de 6 doelen.');
  });

  it('alleen niet verplichte doelen: geen totaal, wel de optionele teller', () => {
    const doelen = DOELEN.filter((x) => x.optioneel || !x.verplichteSet);
    const d = dekkingMinimumdoelen(doelen, [{ course: C_BIO, leerplan: LP_BIO }], []);
    expect(d.totaal).toBe(0);
    expect(d.percent).toBe(0);
    expect(d.optioneel).toEqual({ totaal: 3, gedekt: 1 });
    expect(d.samenvatting).toBe('Er zijn geen verplichte minimumdoelen om te dekken.');
  });

  it('alles gedekt: 100 % en één zin', () => {
    const doelen = DOELEN.filter((x) => x.id === '1001' || x.id === '1005');
    const d = dekkingMinimumdoelen(doelen, [{ course: C_BIO, leerplan: LP_BIO }], []);
    expect(tellers(d)).toEqual({ totaal: 1, gedekt: 1, gepland: 0, verdieping: 0, open: 0, percent: 100 });
    expect(d.samenvatting).toBe('Je cursussen dekken 1 van de 1 minimumdoelen (100 %).');
  });

  it('nooit 100 % zolang er een verplicht doel niet gedekt is: 399 van 400 is 99 %', () => {
    const groot = setBestand('ODS_200', 'Secundair onderwijs 2de graad -  Groot - Eindtermen', 'Groot',
      Array.from({ length: 400 }, (_, i) => ({ id: String(9000 + i), code: String(i + 1) })));
    const doelen = setsAlsKader(['ODS_200'], new Map([['ODS_200', groot]]));
    expect(doelen).toHaveLength(400);
    const goals = Array.from({ length: 399 }, (_, i) => ({ code: `G${i}`, refs: [['ODS_200', String(9000 + i)]] as Ref[] }));
    const lp = leerplan('lp-groot', goals);
    const c = cursus('c-groot', 'Groot', 'lp-groot', [sectie('a', goals.map((g) => g.code), [tekst('t')])]);
    const d = dekkingMinimumdoelen(doelen, [{ course: c, leerplan: lp }], []);
    expect(d.gedekt).toBe(399);
    expect(Math.round((399 / 400) * 100)).toBe(100); // gewoon afronden zou 100 % zeggen
    expect(d.percent).toBe(99);
  });

  it('afronden: 1 van 3 verplichte doelen is 33 % (33,3 naar beneden), 2 van 3 is 67 % (66,7 naar boven)', () => {
    const drie = DOELEN.filter((x) => ['1001', '1002', '1003'].includes(x.id));
    expect(drie.every((x) => !x.optioneel && x.verplichteSet)).toBe(true);
    // C_BIO: 1001 gedekt, 1002 gepland, 1003 verdieping
    const een = dekkingMinimumdoelen(drie, [{ course: C_BIO, leerplan: LP_BIO }], []);
    expect(tellers(een)).toEqual({ totaal: 3, gedekt: 1, gepland: 1, verdieping: 1, open: 0, percent: 33 });
    const lp = leerplan('lp-twee', [{ code: 'A', refs: [[BIO, '1001']] }, { code: 'B', refs: [[BIO, '1002']] }]);
    const c = cursus('c-twee', 'Twee', 'lp-twee', [sectie('a', ['A', 'B'], [tekst('t')])]);
    const twee = dekkingMinimumdoelen(drie, [{ course: c, leerplan: lp }], []);
    expect(tellers(twee)).toEqual({ totaal: 3, gedekt: 2, gepland: 0, verdieping: 0, open: 1, percent: 67 });
  });

  describe('nooit 100 % zolang een verplicht doel niet gedekt is (gewoon afronden zou 100 zeggen)', () => {
    // 200 verplichte doelen (9000 tot 9199) en 1 optioneel doel (9200) in één set. 199 van 200 is precies 99,5 %:
    // Math.round geeft 100, de regel geeft 99, of het laatste doel nu open, gepland of verdieping is.
    const groot = setBestand('ODS_201', 'Secundair onderwijs 2de graad -  Groot - Eindtermen', 'Groot', [
      ...Array.from({ length: 200 }, (_, i) => ({ id: String(9000 + i), code: String(i + 1) })),
      { id: '9200', code: '201', optioneel: true },
    ]);
    const doelen = setsAlsKader(['ODS_201'], new Map([['ODS_201', groot]]));
    const goals = Array.from({ length: 200 }, (_, i) => ({ code: `G${i}`, refs: [['ODS_201', String(9000 + i)]] as Ref[] }));
    const lp = leerplan('lp-200', goals);
    const codes = goals.map((g) => g.code);
    /** De eerste 199 doelen op een gewone sectie met inhoud; het laatste zoals `laatste` zegt. */
    const met = (laatste: 'open' | 'gepland' | 'verdieping' | 'gedekt') => {
      const secties = [sectie('a', laatste === 'gedekt' ? codes : codes.slice(0, 199), [tekst('t')])];
      if (laatste === 'gepland') secties.push(sectie('b', ['G199'], [doelenCallout('d')]));
      if (laatste === 'verdieping') secties.push(sectie('k', ['G199'], [tekst('t2')], true));
      return dekkingMinimumdoelen(doelen, [{ course: cursus('c-200', 'Groot', 'lp-200', secties), leerplan: lp }], []);
    };

    it('de opstelling: 200 verplichte doelen, 1 optioneel, en 199 / 200 rondt af naar 100', () => {
      expect(doelen.filter((x) => !x.optioneel)).toHaveLength(200);
      expect(Math.round((199 / 200) * 100)).toBe(100);
    });

    it('het laatste verplichte doel open: 99 %', () => {
      expect(tellers(met('open'))).toEqual({ totaal: 200, gedekt: 199, gepland: 0, verdieping: 0, open: 1, percent: 99 });
      expect(met('open').samenvatting).toBe(
        'Je cursussen dekken 199 van de 200 minimumdoelen (99 %). 0 doelen staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 1 nog niet.',
      );
    });

    it('het laatste verplichte doel gepland of verdieping: ook 99 %', () => {
      expect(tellers(met('gepland'))).toEqual({ totaal: 200, gedekt: 199, gepland: 1, verdieping: 0, open: 0, percent: 99 });
      expect(tellers(met('verdieping'))).toEqual({ totaal: 200, gedekt: 199, gepland: 0, verdieping: 1, open: 0, percent: 99 });
    });

    it('alle verplichte doelen gedekt: 100 %, ook al staat het optionele doel nog open', () => {
      const d = met('gedekt');
      expect(tellers(d)).toEqual({ totaal: 200, gedekt: 200, gepland: 0, verdieping: 0, open: 0, percent: 100 });
      expect(d.optioneel).toEqual({ totaal: 1, gedekt: 0 });
    });
  });

  it('een dubbel doel in het kader telt één keer', () => {
    const d = dekkingMinimumdoelen([DOELEN[0], { ...DOELEN[0] }, DOELEN[1]], [], []);
    expect(d.rijen.map((r) => r.doel.id)).toEqual(['1001', '1002']);
    expect(d.totaal).toBe(2);
  });

  it('puur: de invoer blijft ongewijzigd', () => {
    const voor = JSON.stringify({ DOELEN, BIJDRAGEN, W_CH1 });
    dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1]);
    expect(JSON.stringify({ DOELEN, BIJDRAGEN, W_CH1 })).toBe(voor);
  });
});

// ── cursussenVoorRichting ───────────────────────────────────────────────────

function onderdeel(nummer: number, groep: string, leerjaren: string[]): Structuuronderdeel {
  return {
    nummer, groep, titel: `Onderdeel ${nummer}`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
    leerjaren: leerjaren.map((code) => ({ code })), hoofdstructuren: ['311'], ov4: true,
  };
}

function groep(nummer: string, titel: string, graad: Graad, onderdelen: number[]): StudierichtingGroep {
  return { nummer, titel, graad, ...(graad === '1' ? {} : { finaliteit: 'DO' }), onderdelen };
}

const MATRIX: MatrixBestand = {
  app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
  opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: 4, aantalOnderdelen: 4, sha256: SHA,
  groepen: [
    groep('G-0193', 'Natuurwetenschappen', '2', [193]),
    groep('G-0307', 'Eerste leerjaar A', '1', [307]),
    groep('G-0311', 'Tweede leerjaar A: Stem-wetenschappen', '1', [311]),
    groep('G-0315', 'Eerste leerjaar B', '1', [315]),
  ],
  onderdelen: [onderdeel(193, 'G-0193', ['3', '4']), onderdeel(307, 'G-0307', ['1']), onderdeel(311, 'G-0311', ['2']), onderdeel(315, 'G-0315', ['1'])],
};

/** Zoals het scherm: hoort bij de richting als de kaderGroepSleutel gelijk is. */
function hoortBij(groepNr: string, soort: 'so' | 'buso' = 'so'): (d: Doelgroep) => boolean {
  const sleutel = kaderGroepSleutel(richtingInfo(MATRIX, groepNr, VANDAAG)!, soort);
  return (d) => {
    const info = richtingInfo(MATRIX, d.groep, VANDAAG);
    return info !== undefined && kaderGroepSleutel(info, d.soort) === sleutel;
  };
}

function dg(groepNr: string, extra: Partial<Doelgroep> = {}): Doelgroep {
  const graad = groepNr === 'G-0193' ? 2 : 1;
  return { groep: groepNr, titel: `Titel ${groepNr}`, graad, soort: 'so', ...extra } as Doelgroep;
}

// ── De optie `verwijzingen` (K7: dezelfde regels voor de competenties van beroepskwalificaties) ──

describe('dekkingMinimumdoelen: de vierde parameter `opties.verwijzingen`', () => {
  it('standaard verandert er niets; een eigen functie bepaalt welke verwijzingen tellen (en wordt gesaneerd); percentVan is te gebruiken', () => {
    const basis = dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1]);
    // Zonder opties, met lege opties, met een niet-bestaande functie of met een functie die `refs` teruggeeft: hetzelfde.
    expect(dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1], undefined)).toEqual(basis);
    expect(dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1], {})).toEqual(basis);
    expect(dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1], { verwijzingen: undefined })).toEqual(basis);
    expect(dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [W_CH1], { verwijzingen: (g) => g.refs ?? [] })).toEqual(basis);

    // Alleen het doel BIO1 verwijst nog, naar Biologie 1001 (en één lege verwijzing, die wegvalt). Het leerplan zonder `refs`
    // (LP_ZONDER) heeft ook een doel BIO1: die cursus telt nu wel mee, het netleerplan van Chemie niet meer.
    const alleenBio1 = (g: { code: string }) => (g.code === 'BIO1' ? [{ set: BIO, id: '1001' }, { set: ' ', id: '' }] : []);
    const d = dekkingMinimumdoelen(DOELEN, BIJDRAGEN, [], { verwijzingen: alleenBio1 });
    expect(statussen(d)).toEqual({
      [`${BIO}|1001`]: 'gedekt', [`${BIO}|1002`]: 'open', [`${BIO}|1003`]: 'open', [`${BIO}|1004`]: 'open', [`${BIO}|1005`]: 'open',
      [`${CHE}|2002`]: 'open', [`${CHE}|2004`]: 'open', [`${UIT}|3001`]: 'open', [`${UIT}|3002`]: 'open',
    });
    expect(tellers(d)).toEqual({ totaal: 6, gedekt: 1, gepland: 0, verdieping: 0, open: 5, percent: 17 });
    expect(d.cursussen).toEqual([
      { courseId: 'c-bio', titel: 'Biologie in het 3de jaar', telt: true, draagtBij: 1, buitenKader: 0 },
      { courseId: 'c-che', titel: 'Chemie', telt: false, reden: 'geen-verwijzingen', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-geen', titel: 'Zonder leerplan', telt: false, reden: 'geen-leerplan', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-weg', titel: 'Leerplan van een ander toestel', telt: false, reden: 'leerplan-ontbreekt', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-zonder', titel: 'Leerplan zonder verwijzingen', telt: true, draagtBij: 1, buitenKader: 0 },
    ]);

    // percentVan is geëxporteerd: afgerond, 0 bij een leeg kader en 99 in plaats van 100 zolang er een niet gedekt is.
    expect([percentVan(1, 3), percentVan(2, 3), percentVan(3, 3), percentVan(0, 0), percentVan(199, 200)]).toEqual([33, 67, 100, 0, 99]);
  });
});

describe('cursussenVoorRichting', () => {
  const lp1A = leerplan('lp-1a', [], { doelgroep: dg('G-0311') });
  const lpJaar = leerplan('lp-jaar', [], { doelgroep: dg('G-0307', { jaar: 2 }) }); // een jaar op een leerplan telt niet
  const lp2de = leerplan('lp-2de', [], { doelgroep: dg('G-0193') });
  const courses: Course[] = [
    cursus('c1', '1A', undefined, [], { doelgroep: dg('G-0307', { jaar: 1 }) }),
    cursus('c2', '2A', 'lp-ontbreekt', [], { doelgroep: dg('G-0311', { jaar: 2 }) }),
    cursus('c3', '1B', undefined, [], { doelgroep: dg('G-0315', { jaar: 1 }) }),
    cursus('c4', 'Via het leerplan', 'lp-1a', []),
    cursus('c5', 'Buitengewoon', undefined, [], { doelgroep: dg('G-0307', { jaar: 1, soort: 'buso' }) }),
    cursus('c6', 'Zonder richting', 'lp-ontbreekt', []),
    cursus('c7', 'Kapotte eigen doelgroep', 'lp-1a', [], { doelgroep: { groep: 'X' } as unknown as Doelgroep }),
    cursus('c8', 'Leerplan met een jaar', 'lp-jaar', []),
    cursus('c9', 'Eigen doelgroep wint', 'lp-1a', [], { doelgroep: dg('G-0315') }),
    cursus('c10', '2de graad', 'lp-2de', []),
  ];
  const curricula = [lp1A, lpJaar, lp2de];
  const ids = (b: CursusBijdrage[]) => b.map((x) => x.course.id);

  it('1ste graad: 1A en 2A van de A-stroom tellen samen (kaderGroepSleutel), niet 1B en niet het buitengewoon onderwijs', () => {
    expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0307')))).toEqual(['c1', 'c2', 'c4', 'c7', 'c8']);
    expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0311')))).toEqual(['c1', 'c2', 'c4', 'c7', 'c8']);
    expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0315')))).toEqual(['c3', 'c9']);
    expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0307', 'buso')))).toEqual(['c5']);
  });

  it('jaarfilter: de cursus heeft dat jaar of geen jaar (een leerplan draagt nooit een jaar)', () => {
    expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0307'), 1))).toEqual(['c1', 'c4', 'c7', 'c8']);
    expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0307'), 2))).toEqual(['c2', 'c4', 'c7', 'c8']);
  });

  it('jaarfilter met jaar 7 (3de graad, het 7de jaar is een geldig jaar): alleen het 7de jaar en de cursussen zonder jaar', () => {
    const derde = (id: string, jaar?: number): Course =>
      cursus(id, id, undefined, [], { doelgroep: { groep: 'G-0400', titel: 'Derde graad', graad: 3, soort: 'so', ...(jaar ? { jaar } : {}) } });
    const lijst = [derde('j5', 5), derde('j6', 6), derde('j7', 7), derde('j0')];
    const hoort = (d: Doelgroep) => d.groep === 'G-0400';
    expect(ids(cursussenVoorRichting(lijst, [], hoort))).toEqual(['j5', 'j6', 'j7', 'j0']);
    expect(ids(cursussenVoorRichting(lijst, [], hoort, 7))).toEqual(['j7', 'j0']);
    expect(ids(cursussenVoorRichting(lijst, [], hoort, 6))).toEqual(['j6', 'j0']);
  });

  it('een ongeldig jaar filtert niet', () => {
    const alle = ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0307')));
    for (const j of [Number.NaN, 0, 8, 1.5]) expect(ids(cursussenVoorRichting(courses, curricula, hoortBij('G-0307'), j))).toEqual(alle);
  });

  it('elke cursus met haar eigen leerplan, als het op dit toestel staat', () => {
    const r = cursussenVoorRichting(courses, curricula, hoortBij('G-0307'));
    expect(r.map((x) => x.leerplan?.id)).toEqual([undefined, undefined, 'lp-1a', 'lp-1a', 'lp-jaar']);
    expect(r[1]).not.toHaveProperty('leerplan');
  });

  it('2de graad: de jaren van de graad samen, of één jaar', () => {
    const tweede: Course[] = [
      cursus('d3', '3de jaar', undefined, [], { doelgroep: dg('G-0193', { jaar: 3 }) }),
      cursus('d4', '4de jaar', undefined, [], { doelgroep: dg('G-0193', { jaar: 4 }) }),
      cursus('d0', 'Hele graad', undefined, [], { doelgroep: dg('G-0193') }),
      cursus('d9', 'Jaar buiten de graad', undefined, [], { doelgroep: dg('G-0193', { jaar: 5 }) }), // jaar valt weg bij het saneren
    ];
    expect(ids(cursussenVoorRichting(tweede, [], hoortBij('G-0193')))).toEqual(['d3', 'd4', 'd0', 'd9']);
    expect(ids(cursussenVoorRichting(tweede, [], hoortBij('G-0193'), 3))).toEqual(['d3', 'd0', 'd9']);
    expect(ids(cursussenVoorRichting(tweede, [], hoortBij('G-0193'), 4))).toEqual(['d4', 'd0', 'd9']);
    expect(ids(cursussenVoorRichting(tweede, [], hoortBij('G-0307')))).toEqual([]);
  });

  it('hoort krijgt altijd een gesaneerde doelgroep', () => {
    const gezien: Doelgroep[] = [];
    cursussenVoorRichting([cursus('x', 'X', 'lp-jaar', [], { doelgroep: { groep: 'G-0193', titel: '  A\nB ', jaar: 3, graad: '2', extra: 1 } as unknown as Doelgroep })],
      curricula, (d) => { gezien.push(d); return true; });
    expect(gezien).toEqual([{ groep: 'G-0193', titel: 'A B', graad: 2, jaar: 3, soort: 'so' }]);
  });

  it('samen met dekkingMinimumdoelen: een cursus van de richting zonder leerplan op dit toestel staat er met de reden', () => {
    const d = dekkingMinimumdoelen(DOELEN, cursussenVoorRichting(courses, curricula, hoortBij('G-0307'), 2), []);
    expect(d.cursussen.map((c) => `${c.courseId}:${c.reden ?? 'telt'}`)).toEqual([
      'c2:leerplan-ontbreekt', 'c4:geen-verwijzingen', 'c7:geen-verwijzingen', 'c8:geen-verwijzingen',
    ]);
  });
});

// ── Op de fixtures van G-0193 en de echte sets (tolerant voor een maandelijkse update, § 7) ──

const WORTEL = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(WORTEL, 'tests', 'fixtures', 'structuur', 'uit');
const MINIMUMDOELEN_MAP = join(WORTEL, 'public', 'leerplannen', 'minimumdoelen');
const HEEFT_GEGEVENS = existsSync(join(FIXTURES, 'studierichtingen.json')) && existsSync(join(FIXTURES, 'richtingdoelen', 'G-0193.json'))
  && existsSync(join(MINIMUMDOELEN_MAP, 'index.json'));

function leesJson<T>(pad: string): T {
  return JSON.parse(readFileSync(pad, 'utf8')) as T;
}

describe.runIf(HEEFT_GEGEVENS)('op de fixtures van G-0193 en de echte sets', () => {
  it('een vers geraamte uit het leerplan van de richting: 0 % gedekt; wat het leerplan noemt is gepland, de rest open', () => {
    const matrix = leesJson<MatrixBestand>(join(FIXTURES, 'studierichtingen.json'));
    const koppeling = leesJson<RichtingDoelenIndex>(join(FIXTURES, 'richtingdoelen', 'index.json'));
    const bestand = leesJson<RichtingDoelenBestand>(join(FIXTURES, 'richtingdoelen', 'G-0193.json'));
    const index = leesJson<MinimumdoelenIndex>(join(MINIMUMDOELEN_MAP, 'index.json')).sets;
    const info = richtingInfo(matrix, 'G-0193', VANDAAG)!;
    const kader = bouwKader(bestand, koppeling.groepen.find((r) => r.groep === 'G-0193'), index, { groep: 'G-0193', jaar: 4, soort: 'so' }, info);
    const sets = new Map<string, MinimumdoelenSetBestand>();
    for (const k of kader.sets) {
      const pad = join(MINIMUMDOELEN_MAP, k.set.bestand);
      if (existsSync(pad)) sets.set(k.set.id, leesJson<MinimumdoelenSetBestand>(pad));
    }
    const doelen: KaderDoel[] = kaderDoelen(kader, sets);
    expect(doelen.length).toBeGreaterThan(0);
    const lp = leerplanUitSelectie(naarSetKeuzes(selectieVanKader(kader), sets).keuzes, { titel: 'Natuurwetenschappen' }).leerplan;
    expect(lp.goals.length).toBeGreaterThan(0);
    const c = cursus('c-g', 'Geraamte', lp.id, lp.goals.map((g, i) => sectie(`s${i}`, [g.code], [doelenCallout(`d${i}`)])));
    const d = dekkingMinimumdoelen(doelen, [{ course: c, leerplan: lp }], []);

    expect(d.gedekt).toBe(0);
    expect(d.percent).toBe(0);
    expect(d.gepland).toBeGreaterThan(0);
    expect(d.totaal).toBe(doelen.filter((x) => !x.optioneel && x.verplichteSet).length);
    const inLeerplan = new Set(lp.goals.flatMap((g) => (g.refs ?? []).map((r) => `${r.set}|${r.id}`)));
    for (const rij of d.rijen) expect(rij.status).toBe(inLeerplan.has(`${rij.doel.set}|${rij.doel.id}`) ? 'gepland' : 'open');
    expect(d.cursussen[0]).toMatchObject({ telt: true, buitenKader: 0 });
  });
});
