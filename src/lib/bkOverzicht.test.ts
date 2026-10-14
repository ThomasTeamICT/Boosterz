// De korte regel over de competenties in "Mijn richtingen" en in de klas (docs/STUDIERICHTINGEN.md § 24.4, I4, I5 en I8).
// Op de fixtures in tests/fixtures/kwalificaties/uit/ met nagebootste laders: geen netwerk. G-0008 "Assistent dierlijke
// productie" heeft Onthaalmedewerker (12 competenties) en Recreatief medewerker (13); G-0009 heeft vandaag BK-9999-1 (3
// competenties, met bestand) en BK-9999-3 (zonder bestand).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BkBestand, BkIndex, KoppelingBestand } from './beroepskwalificaties';
import { wisBkCache } from './beroepskwalificatiesBron';
import { heeftBkCursus, bkKortVoorRichting, type BkLaders } from './bkOverzicht';
import { cursusVoorBk } from './bkCursus';
import { leerplanUitBk, type BkKeuze } from './bkLeerplan';
import { createCourse } from './courses';
import type { Course, CourseSection } from './courseTypes';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { bkKaderDoelen, bkVersiesOmTeLaden, dekkingBk } from './dekkingBk';
import type { CursusBijdrage, MdDekking } from './dekkingMinimumdoelen';
import type { Doelgroep } from './doelgroep';
import { bkKader } from './richtingBk';
import { doelgroepVan, richtingInfo, type RichtingInfo, type SoortKeuze } from './richtingKader';
import { bijdragenVoorKader, bkKortVan, bkRijZin, type BkKort } from './richtingOverzicht';
import type { MatrixBestand } from './studierichtingen';
import type { Widget } from './types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-10';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const NAGEBOOTST_1 = lees('kwalificaties/uit/bk/BK-9999-1.json') as BkBestand;
const NAGEBOOTST_2 = lees('kwalificaties/uit/bk/BK-9999-2.json') as BkBestand;
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([ONTHAAL, RECREATIEF, NAGEBOOTST_1, NAGEBOOTST_2].map((b) => [b.bk, b]));

function richting(groep: string): RichtingInfo {
  const i = richtingInfo(MATRIX, groep, VANDAAG);
  if (!i) throw new Error(`${groep} ontbreekt in de structuurfixtures`);
  return i;
}
const INFO_8 = richting('G-0008');
const INFO_9 = richting('G-0009');
const INFO_NW = richting('G-0193');
const INFO_EERSTE = richting('G-0307');
const dg = (info: RichtingInfo, jaar: number, soort: SoortKeuze = 'so'): Doelgroep => doelgroepVan(info, { groep: info.groep.nummer, soort, jaar });
const DG_8 = (jaar = 3) => dg(INFO_8, jaar);
const DG_9 = (jaar = 3) => dg(INFO_9, jaar);

const alleVan = (b: BkBestand): BkKeuze => ({ bestand: b, competenties: b.competenties.map((c) => c.id) });
const deelVan = (b: BkBestand, van: number, tot: number): BkKeuze => ({ bestand: b, competenties: b.competenties.slice(van, tot).map((c) => c.id) });
const merkVan = (b: BkBestand) => b.sha256.slice(0, 16);

function leerplanMet(id: string, keuzes: BkKeuze[], doelgroep: Doelgroep): Curriculum {
  const merken = new Map(keuzes.map((k) => [k.bestand.bk, merkVan(k.bestand)] as const));
  const u = leerplanUitBk(keuzes, { doelgroep, merken });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return { ...u.leerplan, id };
}

/** Een cursus met het BK-leerplan als geraamte (alle competenties staan er als lege sectie: gepland). */
function bkCursus(id: string, leerplan: Curriculum, doelgroep: Doelgroep): Course {
  const c = cursusVoorBk({ titel: `Cursus ${id}`, auteur: 'Juf An', doelgroep, leerplan, bestanden: BESTANDEN, start: 'geraamte' });
  c.id = id;
  return c;
}

const tekstBlok = (id: string) => ({ id, type: 'text', markdown: 'Uitleg' }) as unknown as CourseSection['blocks'][number];

/** De sectie met deze doelcode krijgt echte inhoud: ze is dan uitgewerkt (gedekt) in plaats van gepland. */
function werkUit(c: Course, code: string): void {
  for (const h of c.chapters) {
    const s = h.sections.find((x) => x.goalCodes?.includes(code));
    if (s) { s.blocks.push(tekstBlok(`t-${c.id}-${code}`)); return; }
  }
  throw new Error(`geen sectie met ${code}`);
}

/**
 * Bedt een oefening in de sectie met deze doelcode in. Alleen een ingebedde oefening telt mee (`computeCoverage`): een
 * oefening die enkel in `widgets` zit, maar in geen enkele sectie staat, verandert de dekking niet.
 */
function bedIn(c: Course, code: string, widgetId: string): void {
  for (const h of c.chapters) {
    const s = h.sections.find((x) => x.goalCodes?.includes(code));
    if (s) { s.blocks.push({ id: `w-${c.id}-${widgetId}`, type: 'widget', widgetId } as CourseSection['blocks'][number]); return; }
  }
  throw new Error(`geen sectie met ${code}`);
}

/** Een cursus op de minimumdoelen: haar leerplan heeft alleen `refs`, geen `bkRefs`. */
function mdCursus(id: string, doelgroep: Doelgroep): { course: Course; leerplan: Curriculum } {
  const leerplan = {
    id: `lp-${id}`, title: 'Minimumdoelen', net: 'eigen', subject: 'x', level: '', createdAt: 0, updatedAt: 0,
    goals: [{ id: 'g1', code: 'MD1', text: 'Doel', refs: [{ set: 'ODS_1', id: '1', code: '1' }] }],
  } as Curriculum;
  const course: Course = {
    ...createCourse('MD', ''), id, curriculumId: leerplan.id, doelgroep,
    chapters: [{ id: 'h', title: 'H', sections: [{ id: 's', title: 'S', blocks: [tekstBlok('t')], goalCodes: ['MD1'] }] }],
  };
  return { course, leerplan };
}

function widgetMet(id: string, codes: string[], curriculumId: string): Widget {
  return {
    id, type: 'quiz', title: `Oefening ${id}`, folderId: null, code: 'QQQ111', settings: {}, createdAt: 0, updatedAt: 0, curriculumId,
    config: { questions: codes.map((goalCode, i) => ({ id: `q${i}`, goalCode })) },
  } as unknown as Widget;
}

// ── Nagebootste laders ──────────────────────────────────────────────────────

interface Oproepen { koppeling: number; index: number; bk: string[] }

/** Laders die de fixtures geven en bijhouden wat er gevraagd werd. `fout`: laat die lader mislukken. */
function maakLaders(o: { koppeling?: KoppelingBestand | null; index?: BkIndex | null; fout?: 'koppeling' | 'index' | 'bk'; ontbreekt?: string[] } = {}): { laders: BkLaders; oproepen: Oproepen } {
  const oproepen: Oproepen = { koppeling: 0, index: 0, bk: [] };
  const laders: BkLaders = {
    koppeling: async () => {
      oproepen.koppeling++;
      if (o.fout === 'koppeling') throw new Error('koppeling mislukt');
      return o.koppeling === undefined ? KOPPELING : o.koppeling;
    },
    index: async () => {
      oproepen.index++;
      if (o.fout === 'index') throw new Error('index mislukt');
      return o.index === undefined ? INDEX : o.index;
    },
    bk: async (versie) => {
      oproepen.bk.push(versie);
      if (o.fout === 'bk') throw new Error('bestand mislukt');
      if (o.ontbreekt?.includes(versie)) return null;
      return BESTANDEN.get(versie) ?? null;
    },
  };
  return { laders, oproepen };
}

const geenVerzoeken = (oproepen: Oproepen) => expect(oproepen).toEqual({ koppeling: 0, index: 0, bk: [] });

/**
 * De invoer van een rij. `soort` is het soort onderwijs zoals het kader het neemt (`effectiefSoort`, zoals `DekkingKort` het
 * afleidt): G-0009 bestaat alleen in het buitengewoon onderwijs, dus daar is het 'buso'.
 */
function invoer(info: RichtingInfo, courses: Course[], curricula: Curriculum[], extra: { soort?: SoortKeuze; widgets?: Widget[] } = {}) {
  const soort = extra.soort ?? doelgroepVan(info, { groep: info.groep.nummer, soort: 'so' }).soort;
  return { info, soort, courses, curricula, matrix: MATRIX, vandaag: VANDAAG, widgets: extra.widgets ?? [] };
}

/**
 * De berekening die `BkDekking` (bk/BkDekking.tsx) deed voor de rij en de klas dezelfde pijplijn kregen: een letterlijke kopie
 * van de stappen van het blok, bij "Alle jaren" en zonder variant, met alleen de React-omhulsel (`useLaadstand`, `useMemo`)
 * weggelaten. Het resultaat gaat door `bkKortVan`, zoals het detail het sinds fase 3b bewaart.
 */
async function oudeBerekening(laders: BkLaders, o: ReturnType<typeof invoer>): Promise<BkKort> {
  const bk = bkKader(await laders.koppeling(), await laders.index(), o.info, { groep: o.info.groep.nummer, soort: o.soort }, o.vandaag);
  const versies = [...new Set(bk.bks.filter((r) => r.zonderBestand !== true).map((r) => r.bk))];
  const geladen = await Promise.all(versies.map((v) => laders.bk(v)));
  const bestanden = new Map<string, BkBestand>();
  versies.forEach((v, i) => { const b = geladen[i]; if (b) bestanden.set(v, b); });
  const bijdragen = bijdragenVoorKader({ courses: o.courses, curricula: o.curricula, info: o.info, soort: o.soort, matrix: o.matrix, vandaag: o.vandaag });
  const kader = bkKaderDoelen(bk, bestanden);
  const dekking = dekkingBk(kader, bijdragen, o.widgets);
  return bkKortVan(dekking, bk, bestanden);
}

async function kortVan(laders: BkLaders, o: ReturnType<typeof invoer>): Promise<BkKort> {
  const uit = await bkKortVoorRichting(o, laders);
  if (uit.soort !== 'kort') throw new Error('verwacht een kort, kreeg "geen"');
  return uit.kort;
}

// ── bkKortVoorRichting ──────────────────────────────────────────────────────

describe('bkKortVoorRichting: geen verzoek zonder kanBkHebben (I5)', () => {
  it('doorstroomfinaliteit (G-0193) en de 1ste graad (G-0307): geen regel en geen enkele lader aangeroepen', async () => {
    for (const info of [INFO_NW, INFO_EERSTE]) {
      const { laders, oproepen } = maakLaders();
      const lp = leerplanMet('lp-x', [alleVan(ONTHAAL)], DG_8());
      const uit = await bkKortVoorRichting(invoer(info, [bkCursus('c1', lp, DG_8())], [lp]), laders);
      expect(uit).toEqual({ soort: 'geen' });
      geenVerzoeken(oproepen);
    }
  });

  it('een afgebouwde richting vraagt ook niets', async () => {
    const { laders, oproepen } = maakLaders();
    const uit = await bkKortVoorRichting(invoer({ ...INFO_8, afgebouwd: true }, [], []), laders);
    expect(uit).toEqual({ soort: 'geen' });
    geenVerzoeken(oproepen);
  });

  it('zonder laders (de gedeelde laders van de app) gaat er voor een richting zonder BK ook geen fetch uit', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('fetch aangeroepen'); });
    vi.stubGlobal('fetch', fetchSpy);
    try {
      expect(await bkKortVoorRichting(invoer(INFO_NW, [], []))).toEqual({ soort: 'geen' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('bkKortVoorRichting: de koppeling zegt niets', () => {
  it('geen koppeling (nog niet opgehaald): geen regel; hoogstens de koppeling en de index zijn gevraagd', async () => {
    const { laders, oproepen } = maakLaders({ koppeling: null });
    expect(await bkKortVoorRichting(invoer(INFO_8, [], []), laders)).toEqual({ soort: 'geen' });
    expect(oproepen.bk).toEqual([]);
  });

  it('de koppeling zegt dat er geen BK is (herkomst "geen"): geen regel, geen bestand', async () => {
    const zonderBk: KoppelingBestand = {
      ...KOPPELING,
      onderdelen: KOPPELING.onderdelen.map((o) => (o.groep === 'G-0008' ? { ...o, erkenningen: [] } : o)),
    };
    const { laders, oproepen } = maakLaders({ koppeling: zonderBk });
    expect(bkKader(zonderBk, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG).herkomst).toBe('geen');
    const lp = leerplanMet('lp-a', [alleVan(ONTHAAL)], DG_8());
    expect(await bkKortVoorRichting(invoer(INFO_8, [bkCursus('c1', lp, DG_8())], [lp]), laders)).toEqual({ soort: 'geen' });
    expect(oproepen.bk).toEqual([]);
  });

  it('een richting waarover de koppeling niets weet (G-0002, nog niet opgehaald): geen regel', async () => {
    const { laders } = maakLaders();
    expect(await bkKortVoorRichting(invoer(richting('G-0429'), [], []), laders)).toEqual({ soort: 'geen' });
  });
});

describe('bkKortVoorRichting: geen BK-cursus, dus geen BK-bestanden (I8)', () => {
  it('zonder cursussen: "zonder-cursus" met het aantal BK\'s; de koppeling en de index één keer, geen enkel bestand', async () => {
    const { laders, oproepen } = maakLaders();
    const kort = await kortVan(laders, invoer(INFO_8, [], []));
    expect(kort).toEqual({ soort: 'zonder-cursus', bks: 2 });
    expect(bkRijZin(kort)).toBe('Nog geen cursus met de competenties van de 2 beroepskwalificaties.');
    expect(oproepen).toEqual({ koppeling: 1, index: 1, bk: [] });
  });

  it('een cursus op de minimumdoelen, een cursus zonder leerplan en een BK-cursus van een andere richting tellen niet mee', async () => {
    const { laders, oproepen } = maakLaders();
    const md = mdCursus('c-md', DG_8());
    const zonderLeerplan: Course = { ...createCourse('Zonder', ''), id: 'c-zonder', doelgroep: DG_8() };
    const lpAnder = leerplanMet('lp-ander', [alleVan(NAGEBOOTST_1)], DG_9());
    const andere = bkCursus('c-ander', lpAnder, DG_9());
    const kort = await kortVan(laders, invoer(INFO_8, [md.course, zonderLeerplan, andere], [md.leerplan, lpAnder]));
    expect(kort).toEqual({ soort: 'zonder-cursus', bks: 2 });
    expect(oproepen.bk).toEqual([]);
  });

  it('een richting met één BK noemt haar titel', async () => {
    const { laders } = maakLaders();
    const kort = await kortVan(laders, invoer(INFO_9, [], []));
    // G-0009 heeft vandaag twee versies (BK-9999-1 met bestand en BK-9999-3 zonder): twee BK's, dus geen titel.
    expect(kort).toEqual({ soort: 'zonder-cursus', bks: 2 });
    const eenBk: KoppelingBestand = {
      ...KOPPELING,
      onderdelen: KOPPELING.onderdelen.map((o) => (o.groep === 'G-0008' ? { ...o, erkenningen: o.erkenningen?.map((e) => ({ ...e, bks: e.bks.filter((b) => b.bk === 'BK-0390-2') })) } : o)),
    };
    const { laders: l2 } = maakLaders({ koppeling: eenBk });
    const k2 = await kortVan(l2, invoer(INFO_8, [], []));
    expect(k2).toEqual({ soort: 'zonder-cursus', bks: 1, titel: 'Onthaalmedewerker' });
    expect(bkRijZin(k2)).toBe('Nog geen cursus met de competenties van Onthaalmedewerker.');
  });
});

describe('bkKortVoorRichting: G-0008, de regressie op het detail (I4)', () => {
  const lpA = leerplanMet('lp-a', [deelVan(ONTHAAL, 0, 8)], DG_8());
  const cursusA = bkCursus('c-a', lpA, DG_8());
  const lpB = leerplanMet('lp-b', [alleVan(RECREATIEF)], DG_8());
  const cursusB = bkCursus('c-b', lpB, DG_8());

  it('cursus A (8 van de 12): 0 van de 25 gedekt, 8 gepland, geen percentage bij twee BK\'s; gelijk aan de oude berekening van het detail', async () => {
    const o = invoer(INFO_8, [cursusA], [lpA]);
    const { laders, oproepen } = maakLaders();
    const kort = await kortVan(laders, o);
    expect(kort).toEqual({ soort: 'getallen', bks: 2, totaal: 25, gedekt: 0, gepland: 8, zonderBestand: 0 });
    expect(bkRijZin(kort)).toBe('Je cursussen dekken 0 van de 25 competenties van 2 beroepskwalificaties. 8 staan gepland.');
    // Letterlijk de oude berekening van het blok op de richtingpagina.
    expect(kort).toEqual(await oudeBerekening(maakLaders().laders, o));
    expect(oproepen.koppeling).toBe(1);
    expect(oproepen.index).toBe(1);
    expect([...oproepen.bk].sort()).toEqual(['BK-0390-2', 'BK-0464-1']);
  });

  it('cursus A en B samen: 21 gepland, en nog steeds gelijk aan de oude berekening', async () => {
    const o = invoer(INFO_8, [cursusA, cursusB], [lpA, lpB]);
    const kort = await kortVan(maakLaders().laders, o);
    expect(kort).toEqual({ soort: 'getallen', bks: 2, totaal: 25, gedekt: 0, gepland: 21, zonderBestand: 0 });
    expect(kort).toEqual(await oudeBerekening(maakLaders().laders, o));
  });

  it('een uitgewerkte sectie is gedekt, en de oefeningen van het toestel tellen mee; gelijk aan de oude berekening', async () => {
    const c = bkCursus('c-uit', lpA, DG_8());
    werkUit(c, 'BK-0390-2.01');
    // De oefening staat echt in een sectie van de cursus (bedIn): alleen dan telt ze mee, en alleen dan bewijst deze test
    // dat de rij de oefeningen doorgeeft aan de dekking.
    bedIn(c, 'BK-0390-2.01', 'w1');
    const w1 = widgetMet('w1', ['BK-0390-2.02'], lpA.id);
    const o = invoer(INFO_8, [c], [lpA], { widgets: [w1] });
    const kort = await kortVan(maakLaders().laders, o);
    expect(kort).toEqual({ soort: 'getallen', bks: 2, totaal: 25, gedekt: 2, gepland: 6, zonderBestand: 0 });
    expect(bkRijZin(kort)).toBe('Je cursussen dekken 2 van de 25 competenties van 2 beroepskwalificaties. 6 staan gepland.');
    expect(kort).toEqual(await oudeBerekening(maakLaders().laders, o));

    // Zonder de oefeningen van het toestel (dezelfde cursus): één competentie minder gedekt, één meer gepland.
    const zonder = await kortVan(maakLaders().laders, invoer(INFO_8, [c], [lpA]));
    expect(zonder).toEqual({ soort: 'getallen', bks: 2, totaal: 25, gedekt: 1, gepland: 7, zonderBestand: 0 });
    expect(zonder).toEqual(await oudeBerekening(maakLaders().laders, invoer(INFO_8, [c], [lpA])));
  });

  it('alle jaren van de graad: een cursus van het 3de en een van het 4de jaar tellen allebei mee, zoals het detail bij "Alle jaren"', async () => {
    const lp4 = leerplanMet('lp-4', [deelVan(RECREATIEF, 0, 4)], DG_8(4));
    const c4 = bkCursus('c-4', lp4, DG_8(4));
    const o = invoer(INFO_8, [cursusA, c4], [lpA, lp4]);
    const kort = await kortVan(maakLaders().laders, o);
    expect(kort).toMatchObject({ soort: 'getallen', totaal: 25, gepland: 12 });
    expect(kort).toEqual(await oudeBerekening(maakLaders().laders, o));
  });

  it('één BK in de koppeling: de titel en het percentage van die ene; gelijk aan de oude berekening', async () => {
    const eenBk: KoppelingBestand = {
      ...KOPPELING,
      onderdelen: KOPPELING.onderdelen.map((x) => (x.groep === 'G-0008' ? { ...x, erkenningen: x.erkenningen?.map((e) => ({ ...e, bks: e.bks.filter((b) => b.bk === 'BK-0390-2') })) } : x)),
    };
    const c = bkCursus('c-uit', lpA, DG_8());
    for (const code of ['BK-0390-2.01', 'BK-0390-2.02', 'BK-0390-2.03']) werkUit(c, code);
    const o = invoer(INFO_8, [c], [lpA]);
    const kort = await kortVan(maakLaders({ koppeling: eenBk }).laders, o);
    expect(kort).toMatchObject({ soort: 'getallen', bks: 1, titel: 'Onthaalmedewerker', totaal: 12, gedekt: 3, gepland: 5, percent: 25, zonderBestand: 0 });
    expect(bkRijZin(kort)).toBe('Je cursussen dekken 3 van de 12 competenties van Onthaalmedewerker (25 %). 5 staan gepland.');
    expect(kort).toEqual(await oudeBerekening(maakLaders({ koppeling: eenBk }).laders, o));
  });

  it('de cursussen en leerplannen worden niet veranderd', async () => {
    const voor = JSON.stringify([cursusA, cursusB, lpA, lpB]);
    await kortVan(maakLaders().laders, invoer(INFO_8, [cursusA, cursusB], [lpA, lpB]));
    expect(JSON.stringify([cursusA, cursusB, lpA, lpB])).toBe(voor);
  });
});

describe('bkKortVoorRichting: nooit een versie zonder bestand (I5)', () => {
  const lp = leerplanMet('lp-9', [alleVan(NAGEBOOTST_1)], DG_9());
  const cursus = bkCursus('c-9', lp, DG_9());

  it('G-0009: BK-9999-1 wordt geladen, BK-9999-3 (zonder bestand in de index) nooit; die telt als "zonder bestand"', async () => {
    const { laders, oproepen } = maakLaders();
    const o = invoer(INFO_9, [cursus], [lp]);
    const kort = await kortVan(laders, o);
    expect(oproepen.bk).toEqual(['BK-9999-1']);
    expect(kort).toEqual({ soort: 'getallen', bks: 1, titel: 'Nagebootste beroepskwalificatie', totaal: 3, gedekt: 0, gepland: 3, percent: 0, zonderBestand: 1 });
    expect(bkRijZin(kort)).toBe(
      'Je cursussen dekken 0 van de 3 competenties van Nagebootste beroepskwalificatie (0 %). 3 staan gepland. Van 1 beroepskwalificatie staan de competenties nog niet in Boosterz.',
    );
    expect(kort).toEqual(await oudeBerekening(maakLaders().laders, o));
  });

  it('de lijst die gevraagd wordt, is precies bkVersiesOmTeLaden van het kader', async () => {
    const { laders, oproepen } = maakLaders();
    await kortVan(laders, invoer(INFO_9, [cursus], [lp]));
    const kader = bkKader(KOPPELING, INDEX, INFO_9, { groep: 'G-0009', soort: 'so' }, VANDAAG);
    expect(oproepen.bk).toEqual(bkVersiesOmTeLaden(kader));
  });

  it('een bestand dat er toch niet blijkt te zijn (de lader geeft null) telt als "zonder bestand"', async () => {
    const { laders } = maakLaders({ ontbreekt: ['BK-9999-1'] });
    const kort = await kortVan(laders, invoer(INFO_9, [cursus], [lp]));
    expect(kort).toMatchObject({ soort: 'getallen', bks: 0, totaal: 0, zonderBestand: 2 });
    expect(bkRijZin(kort)).toBe('');
  });

  it('zonder index kent geen enkele versie een bestand: er wordt er geen gevraagd', async () => {
    const { laders, oproepen } = maakLaders({ index: null });
    const kort = await kortVan(laders, invoer(INFO_9, [cursus], [lp]));
    expect(oproepen.bk).toEqual([]);
    expect(kort).toMatchObject({ soort: 'getallen', totaal: 0, zonderBestand: 2 });
  });
});

describe('bkKortVoorRichting: fouten van de lader', () => {
  const lp = leerplanMet('lp-a', [deelVan(ONTHAAL, 0, 8)], DG_8());
  const o = invoer(INFO_8, [bkCursus('c-a', lp, DG_8())], [lp]);

  it('een mislukte koppeling, index of bestand gooit de fout van de lader (de aanroeper toont "Opnieuw proberen")', async () => {
    await expect(bkKortVoorRichting(o, maakLaders({ fout: 'koppeling' }).laders)).rejects.toThrow('koppeling mislukt');
    await expect(bkKortVoorRichting(o, maakLaders({ fout: 'index' }).laders)).rejects.toThrow('index mislukt');
    await expect(bkKortVoorRichting(o, maakLaders({ fout: 'bk' }).laders)).rejects.toThrow('bestand mislukt');
  });

  it('een mislukt bestand gooit alleen als er een BK-cursus is: zonder BK-cursus wordt er geen bestand gevraagd', async () => {
    const kort = await kortVan(maakLaders({ fout: 'bk' }).laders, invoer(INFO_8, [], []));
    expect(kort.soort).toBe('zonder-cursus');
  });
});

// ── De gedeelde laders van de app ───────────────────────────────────────────

describe('bkKortVoorRichting met de gedeelde laders (fetch nagebootst)', () => {
  let verzoeken: string[];
  beforeEach(() => {
    wisBkCache();
    verzoeken = [];
    vi.stubGlobal('fetch', async (url: string) => {
      verzoeken.push(String(url));
      const naam = String(url).split('/kwalificaties/')[1] ?? '';
      const bestand = naam === 'koppeling.json' ? KOPPELING : naam === 'index.json' ? INDEX : BESTANDEN.get(naam.replace(/^bk\//, '').replace(/\.json$/, ''));
      if (!bestand) return new Response('niet gevonden', { status: 404 });
      return new Response(JSON.stringify(bestand), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    wisBkCache();
  });

  it('G-0008 met een BK-cursus: de koppeling, de index en de twee bestanden, elk één keer; geen 404', async () => {
    const lp = leerplanMet('lp-a', [deelVan(ONTHAAL, 0, 8)], DG_8());
    const uit = await bkKortVoorRichting(invoer(INFO_8, [bkCursus('c-a', lp, DG_8())], [lp]));
    expect(uit).toEqual({ soort: 'kort', kort: { soort: 'getallen', bks: 2, totaal: 25, gedekt: 0, gepland: 8, zonderBestand: 0 } });
    const namen = verzoeken.map((u) => u.split('/kwalificaties/')[1]).sort();
    expect(namen).toEqual(['bk/BK-0390-2.json', 'bk/BK-0464-1.json', 'index.json', 'koppeling.json']);
    // Een tweede rij voor dezelfde richting (of de klas) vraagt niets opnieuw: de beloftes zijn gedeeld.
    await bkKortVoorRichting(invoer(INFO_8, [bkCursus('c-a', lp, DG_8())], [lp]));
    expect(verzoeken).toHaveLength(4);
  });

  it('zonder BK-cursus alleen de koppeling en de index; voor G-0193 en G-0307 helemaal niets', async () => {
    expect(await bkKortVoorRichting(invoer(INFO_8, [], []))).toEqual({ soort: 'kort', kort: { soort: 'zonder-cursus', bks: 2 } });
    expect(verzoeken.map((u) => u.split('/kwalificaties/')[1]).sort()).toEqual(['index.json', 'koppeling.json']);
    verzoeken.length = 0;
    await bkKortVoorRichting(invoer(INFO_NW, [], []));
    await bkKortVoorRichting(invoer(INFO_EERSTE, [], []));
    expect(verzoeken).toEqual([]);
  });

  it('G-0009: nooit een verzoek voor BK-9999-3, de versie zonder bestand', async () => {
    const lp = leerplanMet('lp-9', [alleVan(NAGEBOOTST_1)], DG_9());
    await bkKortVoorRichting(invoer(INFO_9, [bkCursus('c-9', lp, DG_9())], [lp]));
    expect(verzoeken.some((u) => u.includes('BK-9999-3'))).toBe(false);
    expect(verzoeken.filter((u) => u.includes('/bk/')).map((u) => u.split('/bk/')[1])).toEqual(['BK-9999-1.json']);
  });
});

// ── heeftBkCursus en de eigenschapstest van I8 ──────────────────────────────

/** Een kleine, herhaalbare toevalsgenerator (mulberry32): dezelfde reeks bij elke run. */
function toeval(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('heeftBkCursus', () => {
  const lp = leerplanMet('lp-a', [deelVan(ONTHAAL, 0, 3)], DG_8());
  const bk = (id = 'c-a'): CursusBijdrage => ({ course: bkCursus(id, lp, DG_8()), leerplan: lp });

  it('onwaar zonder cursussen', () => {
    expect(heeftBkCursus([])).toBe(false);
  });

  it('waar bij een cursus met een BK-leerplan, ook als er cursussen bij zijn die niet meetellen', () => {
    expect(heeftBkCursus([bk()])).toBe(true);
    const md = mdCursus('c-md', DG_8());
    expect(heeftBkCursus([{ course: md.course, leerplan: md.leerplan }, bk()])).toBe(true);
  });

  it('onwaar bij een cursus op de minimumdoelen, zonder leerplan, met een leerplan dat niet op dit toestel staat of dat een ander is', () => {
    const md = mdCursus('c-md', DG_8());
    expect(heeftBkCursus([{ course: md.course, leerplan: md.leerplan }])).toBe(false);
    expect(heeftBkCursus([{ course: createCourse('Zonder', '') }])).toBe(false);
    expect(heeftBkCursus([{ course: bk().course }])).toBe(false);
    expect(heeftBkCursus([{ course: bk().course, leerplan: { ...lp, id: 'ander' } }])).toBe(false);
    expect(heeftBkCursus([{ course: { ...bk().course, curriculumId: '' }, leerplan: lp }])).toBe(false);
  });

  it('onwaar bij een BK-leerplan zonder bruikbare verwijzingen (N7)', () => {
    const kaal: Curriculum = { ...lp, goals: lp.goals.map((g) => ({ ...g, bkRefs: undefined })) };
    expect(heeftBkCursus([{ course: { ...bk().course, curriculumId: kaal.id }, leerplan: kaal }])).toBe(false);
  });

  it('rare invoer geeft geen fout', () => {
    expect(heeftBkCursus([null, undefined, 7, {}] as never)).toBe(false);
    expect(heeftBkCursus([{ course: bk().course, leerplan: { ...lp, goals: 'kapot' } }] as never)).toBe(false);
  });

  describe('I8: gelijk aan dekkingBk(kader, bijdragen, widgets).cursussen.some(telt), voor elk kader', () => {
    const kader8 = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG);
    const KADERS: [string, ReturnType<typeof bkKaderDoelen>][] = [
      ['een leeg kader', []],
      ['het kader van G-0008 (25 competenties)', bkKaderDoelen(kader8, BESTANDEN)],
      ['één BK', bkKaderDoelen({ ...kader8, bks: kader8.bks.slice(0, 1) }, BESTANDEN)],
      ['een kader van een andere richting', bkKaderDoelen(bkKader(KOPPELING, INDEX, INFO_9, { groep: 'G-0009', soort: 'so' }, VANDAAG), BESTANDEN)],
    ];
    const WIDGETS: Widget[][] = [[], [widgetMet('w1', ['BK-0390-2.01', 'BK-0464-1.02'], 'lp-bk')]];

    /** Eén cursus met een willekeurige vorm van haar leerplan: telt ze mee of niet? */
    function toevalCursus(r: () => number, n: number): CursusBijdrage {
      const kies = <T,>(lijst: readonly T[]): T => lijst[Math.floor(r() * lijst.length)];
      const doelBk = (i: number): CurriculumGoal => ({ id: `g${i}`, code: `BK-0390-2.${String(i).padStart(2, '0')}`, text: `Competentie ${i}`, bkRefs: [{ bk: 'BK-0390-2', id: ONTHAAL.competenties[i % 12].id }] });
      const doelMd = (i: number): CurriculumGoal => ({ id: `m${i}`, code: `MD${i}`, text: `Doel ${i}`, refs: [{ set: 'ODS_1', id: String(i), code: String(i) }] });
      const doelKaal = (i: number): CurriculumGoal => ({ id: `k${i}`, code: `K${i}`, text: `Kaal ${i}` });
      const doelKapot = (i: number): CurriculumGoal => ({ ...doelKaal(i), bkRefs: kies([[], [{ bk: '', id: 'x' }], [{ bk: 'BK-0390-2', id: '  ' }], [{ bk: 'BK-0390-2' }], [null], 'tekst']) } as unknown as CurriculumGoal);
      const doelen = (): CurriculumGoal[] => Array.from({ length: Math.floor(r() * 4) }, (_, i) => kies([doelBk, doelMd, doelKaal, doelKapot])(i + 1));
      const goals = kies<unknown>([doelen(), doelen(), doelen(), [], 'kapot', undefined]);
      const leerplanId = `lp-${n}`;
      const leerplan = kies<Curriculum | undefined>([
        { id: leerplanId, title: 'L', net: 'eigen', subject: 'x', level: '', createdAt: 0, updatedAt: 0, goals } as unknown as Curriculum,
        { id: leerplanId, title: 'L', net: 'eigen', subject: 'x', level: '', createdAt: 0, updatedAt: 0, goals } as unknown as Curriculum,
        { id: 'een-ander-id', title: 'L', net: 'eigen', subject: 'x', level: '', createdAt: 0, updatedAt: 0, goals } as unknown as Curriculum,
        undefined,
      ]);
      const curriculumId = kies<unknown>([leerplanId, leerplanId, leerplanId, '', undefined, 42]);
      const course = { ...createCourse(`Cursus ${n}`, ''), id: `c${n}`, curriculumId } as unknown as Course;
      return { course, ...(leerplan ? { leerplan } : {}) };
    }

    it('voor 400 toevalslijsten van 0 tot 5 cursussen, bij elk kader en met en zonder oefeningen', () => {
      const r = toeval(20261014);
      let metBk = 0;
      let zonderBk = 0;
      for (let ronde = 0; ronde < 400; ronde++) {
        const lijst = Array.from({ length: Math.floor(r() * 6) }, (_, i) => toevalCursus(r, ronde * 10 + i));
        const verwacht = heeftBkCursus(lijst);
        if (verwacht) metBk++; else zonderBk++;
        for (const [naam, kader] of KADERS) {
          for (const widgets of WIDGETS) {
            const dekking = dekkingBk(kader, lijst, widgets);
            expect(verwacht, `ronde ${ronde}, ${naam}`).toBe(dekking.cursussen.some((c) => c.telt));
          }
        }
      }
      // Beide uitkomsten komen echt voor, anders bewijst de proef niets.
      expect(metBk).toBeGreaterThan(20);
      expect(zonderBk).toBeGreaterThan(20);
    });

    it('en bkKortVan geeft "zonder-cursus" precies dan', () => {
      const r = toeval(7);
      for (let ronde = 0; ronde < 100; ronde++) {
        const lijst = Array.from({ length: Math.floor(r() * 5) }, (_, i) => toevalCursus(r, ronde * 10 + i));
        const dekking: MdDekking = dekkingBk(KADERS[1][1], lijst, []);
        const kort = bkKortVan(dekking, kader8, BESTANDEN);
        expect(kort.soort === 'zonder-cursus').toBe(!heeftBkCursus(lijst));
      }
    });
  });
});
