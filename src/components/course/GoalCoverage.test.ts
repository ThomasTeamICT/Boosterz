// De schakelaar van GoalCoverage tijdens het laden van de zware weergave (docs/STUDIERICHTINGEN.md § 24.6.1, pakket 3b-S1): wat
// de leerkracht het laatst koos, blijft staan, ook als het chunk pas daarna binnenkomt.
//
// Vitest draait hier zonder DOM. Daarom staat er een kleine eigen haakjesmachine in plaats van een echte render: `useState`,
// `useRef` en `useMemo` zijn vervangen door vaste plaatsen die per render in dezelfde volgorde worden gelezen. De component
// wordt zelf aangeroepen, de knoppen worden uit de teruggegeven elementen gehaald en `onClick` wordt met de hand aangeroepen.
// De twee luie chunks (`MinimumdoelenDekking` en `BkCursusDekking`) zijn nagebootst met een poort die de test opent of laat falen.

import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';

const haak = vi.hoisted(() => ({ plaatsen: [] as unknown[], teller: 0 }));

vi.mock('react', async (importOriginal) => {
  const echt = await importOriginal<typeof import('react')>();
  return {
    ...echt,
    useState: ((begin: unknown) => {
      const i = haak.teller++;
      if (!(i in haak.plaatsen)) haak.plaatsen[i] = typeof begin === 'function' ? (begin as () => unknown)() : begin;
      const zet = (w: unknown) => { haak.plaatsen[i] = typeof w === 'function' ? (w as (v: unknown) => unknown)(haak.plaatsen[i]) : w; };
      return [haak.plaatsen[i], zet];
    }) as unknown as typeof echt.useState,
    useRef: ((begin: unknown) => {
      const i = haak.teller++;
      if (!(i in haak.plaatsen)) haak.plaatsen[i] = { current: begin };
      return haak.plaatsen[i];
    }) as unknown as typeof echt.useRef,
    useMemo: ((maak: () => unknown) => maak()) as unknown as typeof echt.useMemo,
  };
});

// ── De fixtures ─────────────────────────────────────────────────────────────

const CURSUS = {
  id: 'c1', title: 'Cursus', author: 'Juf An', coverEmoji: '', code: 'C1', chapters: [], settings: {}, createdAt: 1, updatedAt: 1,
} as unknown as Course;

const MD_LEERPLAN = {
  id: 'lp-md', title: 'Leerplan met minimumdoelen', net: 'minimumdoelen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
  minimumdoelenSets: ['ODS_9101'],
  goals: [{ id: 'g1', code: 'B01', text: 'Doel 1.', refs: [{ set: 'ODS_9101', id: 'b1', code: 'B01' }] }],
} as unknown as Curriculum;

const BK_LEERPLAN = {
  id: 'lp-bk', title: 'Leerplan met competenties', net: 'eigen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
  herkomst: { methode: 'beroepskwalificatie' },
  goals: [{ id: 'g1', code: 'BK01', text: 'Competentie 1.', bkRefs: [{ bk: 'BK-0001-1', id: 'c1' }] }],
} as unknown as Curriculum;

// ── Een scherm met een poort voor het luie chunk ────────────────────────────

type Gewenst = 'leerplan' | 'extra';

/** Een GoalCoverage in de haakjesmachine. `open()` laat het chunk binnenkomen, `faal()` laat het laden mislukken. */
async function maakScherm(leerplan: Curriculum) {
  vi.resetModules();
  haak.plaatsen.length = 0;
  let uitkomst!: (fout: boolean) => void;
  const poort = new Promise<boolean>((r) => { uitkomst = r; });
  let aantalImports = 0;
  const chunk = (naam: string) => async () => {
    aantalImports += 1;
    if (await poort) throw new Error('offline');
    return { [naam]: () => null };
  };
  vi.doMock('./MinimumdoelenDekking', chunk('MinimumdoelenDekking'));
  vi.doMock('./BkCursusDekking', chunk('BkCursusDekking'));
  const { GoalCoverage } = await import('./GoalCoverage');

  const wortel = GoalCoverage({ course: CURSUS, curriculum: leerplan, widgets: [] }) as ReactElement;
  const Binnen = wortel.type as (p: unknown) => ReactNode;
  const render = (): ReactNode => { haak.teller = 0; return Binnen(wortel.props); };

  type Knoop = { type?: unknown; props?: Record<string, unknown> };
  const loop = (knoop: unknown, dit: (k: Knoop) => void): void => {
    if (Array.isArray(knoop)) { knoop.forEach((k) => loop(k, dit)); return; }
    if (!knoop || typeof knoop !== 'object') return;
    const k = knoop as Knoop;
    dit(k);
    loop(k.props?.children, dit);
  };
  /** De knoppen van de schakelaar, in de volgorde van het scherm: eerst "Leerplan", dan de zware weergave. */
  const knoppen = (): Knoop[] => {
    const uit: Knoop[] = [];
    loop(render(), (k) => { if (k.type === 'button' && k.props && 'aria-pressed' in k.props) uit.push(k); });
    return uit;
  };
  const alert = (): boolean => {
    let gevonden = false;
    loop(render(), (k) => { if (k.props?.role === 'alert') gevonden = true; });
    return gevonden;
  };

  return {
    /** Welke knoppen staan aan, als [Leerplan, zware weergave]. */
    aan: (): boolean[] => knoppen().map((k) => k.props?.['aria-pressed'] === true),
    klik: (welke: Gewenst) => (knoppen()[welke === 'leerplan' ? 0 : 1].props?.onClick as () => void)(),
    alert,
    imports: () => aantalImports,
    /** Laat het chunk binnenkomen (of mislukken) en wacht tot de beloftes van de klik afgehandeld zijn. */
    async klaar(fout = false) {
      uitkomst(fout);
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

// ── De tests ────────────────────────────────────────────────────────────────

describe.each([
  ['de weergave Minimumdoelen', MD_LEERPLAN],
  ['de weergave Beroepskwalificatie', BK_LEERPLAN],
])('GoalCoverage: de schakelaar tijdens het laden van %s', (_naam, leerplan) => {
  beforeEach(() => { haak.plaatsen.length = 0; });

  it('begint op "Leerplan"', async () => {
    const s = await maakScherm(leerplan);
    expect(s.aan()).toEqual([true, false]);
  });

  it('de zware weergave komt pas na het laden, en dan staat ze aan', async () => {
    const s = await maakScherm(leerplan);
    s.klik('extra');
    expect(s.aan()).toEqual([true, false]);
    await s.klaar();
    expect(s.imports()).toBe(1);
    expect(s.aan()).toEqual([false, true]);
    expect(s.alert()).toBe(false);
  });

  it('wie tijdens het laden terug naar "Leerplan" gaat, blijft op "Leerplan" als het chunk binnenkomt', async () => {
    const s = await maakScherm(leerplan);
    s.klik('extra');
    s.klik('leerplan');
    expect(s.aan()).toEqual([true, false]);
    await s.klaar();
    expect(s.aan()).toEqual([true, false]);
  });

  it('de laatste keuze telt: Leerplan, dan weer de zware weergave tijdens hetzelfde laden', async () => {
    const s = await maakScherm(leerplan);
    s.klik('extra');
    s.klik('leerplan');
    s.klik('extra');
    await s.klaar();
    // Eén verzoek voor drie klikken: tijdens het laden begint een tweede klik geen nieuw verzoek.
    expect(s.imports()).toBe(1);
    expect(s.aan()).toEqual([false, true]);
  });

  it('een chunk dat niet laadt, geeft een melding bij wie de zware weergave nog wil', async () => {
    const s = await maakScherm(leerplan);
    s.klik('extra');
    await s.klaar(true);
    expect(s.aan()).toEqual([true, false]);
    expect(s.alert()).toBe(true);
  });

  it('een chunk dat niet laadt, geeft geen melding bij wie intussen naar "Leerplan" ging', async () => {
    const s = await maakScherm(leerplan);
    s.klik('extra');
    s.klik('leerplan');
    await s.klaar(true);
    expect(s.aan()).toEqual([true, false]);
    expect(s.alert()).toBe(false);
  });
});

// ── De eerlijke zin en de AI-knop in de weergave "Leerplan" ─────────────────────────────────────────────────────────────
//
// Een geraamte met alleen de doelen-callout telt voor `computeCoverage` als gedekt. De zin boven de matrix zegt dat niet meer
// ("Dekkend: alle 6 doelen komen aan bod") maar splitst het in uitgewerkt, gepland en nog niet (docs/NIEUWE-CURSUS.md § 2.2).
// Zonder AI-sleutel krijgt de knop "Vul de hiaten" een rustiger stijl en " (AI-sleutel nodig)" in het label.

const ZONDER_BRON_LEERPLAN = {
  id: 'lp-vrij', title: 'Eigen leerplan', net: 'eigen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
  goals: [
    { id: 'g1', code: 'A1', text: 'Doel 1.' },
    { id: 'g2', code: 'A2', text: 'Doel 2.' },
    { id: 'g3', code: 'A3', text: 'Doel 3.' },
  ],
} as unknown as Curriculum;

const DOELEN_CALLOUT = { id: 'b0', type: 'callout', kind: 'goal', text: 'Doelen' };
const UITLEG = { id: 'b1', type: 'text', text: 'Uitleg' };

function cursusMet(secties: { goalCodes: string[]; blocks: unknown[] }[]): Course {
  return {
    ...CURSUS, curriculumId: 'lp-vrij',
    chapters: [{ id: 'h1', title: 'Hoofdstuk', sections: secties.map((s, i) => ({ id: `s${i}`, title: `Sectie ${i}`, ...s })) }],
  } as unknown as Course;
}

type Element = { type?: unknown; props?: Record<string, unknown> };

function tekstVan(knoop: unknown): string {
  if (Array.isArray(knoop)) return knoop.map(tekstVan).join('');
  if (typeof knoop === 'string' || typeof knoop === 'number') return String(knoop);
  if (!knoop || typeof knoop !== 'object') return '';
  return tekstVan((knoop as Element).props?.children);
}

function vind(knoop: unknown, past: (k: Element) => boolean, uit: Element[] = []): Element[] {
  if (Array.isArray(knoop)) { knoop.forEach((k) => vind(k, past, uit)); return uit; }
  if (!knoop || typeof knoop !== 'object') return uit;
  const k = knoop as Element;
  if (past(k)) uit.push(k);
  vind(k.props?.children, past, uit);
  return uit;
}

/** Het scherm van de weergave "Leerplan" met een AI-sleutel die er wel of niet is. */
async function leerplanScherm(course: Course, sleutel: boolean): Promise<{ zin: string; knop: Element | undefined }> {
  vi.resetModules();
  haak.plaatsen.length = 0;
  vi.doMock('./MinimumdoelenDekking', () => ({ MinimumdoelenDekking: () => null }));
  vi.doMock('./BkCursusDekking', () => ({ BkCursusDekking: () => null }));
  vi.doMock('../../lib/ai', () => ({ hasAIKey: () => sleutel }));
  const { GoalCoverage } = await import('./GoalCoverage');
  const wortel = GoalCoverage({ course, curriculum: ZONDER_BRON_LEERPLAN, widgets: [], onFillGaps: () => {} }) as ReactElement;
  const Binnen = wortel.type as (p: unknown) => ReactNode;
  haak.teller = 0;
  const boom = Binnen(wortel.props);
  const zin = vind(boom, (k) => k.type === 'strong').map((k) => tekstVan(k))[0] ?? '';
  const knop = vind(boom, (k) => k.type === 'button' && tekstVan(k).includes('Vul de hiaten'))[0];
  vi.doUnmock('../../lib/ai');
  return { zin, knop };
}

describe('GoalCoverage: de eerlijke zin in de weergave Leerplan', () => {
  beforeEach(() => { haak.plaatsen.length = 0; });

  it('een geraamte met alleen de doelen-callout is gepland, niet dekkend of uitgewerkt', async () => {
    const { zin } = await leerplanScherm(cursusMet([
      { goalCodes: ['A1'], blocks: [DOELEN_CALLOUT] },
      { goalCodes: ['A2', 'A3'], blocks: [DOELEN_CALLOUT] },
    ]), false);
    expect(zin).toBe('0 van de 3 doelen zijn uitgewerkt. 3 staan gepland (de sectie is nog leeg).');
    expect(zin).not.toMatch(/dekkend|komen aan bod/i);
  });

  it('uitgewerkt, gepland en nog niet naast elkaar', async () => {
    const { zin } = await leerplanScherm(cursusMet([
      { goalCodes: ['A1'], blocks: [DOELEN_CALLOUT, UITLEG] },
      { goalCodes: ['A2'], blocks: [DOELEN_CALLOUT] },
    ]), false);
    expect(zin).toBe('1 van de 3 doelen is uitgewerkt. 1 staat gepland (de sectie is nog leeg), 1 nog niet.');
  });

  it('alles uitgewerkt', async () => {
    const { zin, knop } = await leerplanScherm(cursusMet([{ goalCodes: ['A1', 'A2', 'A3'], blocks: [UITLEG] }]), true);
    expect(zin).toBe('Alle 3 doelen zijn uitgewerkt.');
    // Er is niets meer te vullen: de knop staat er dan niet.
    expect(knop).toBeUndefined();
  });
});

describe('GoalCoverage: "Vul de hiaten" zonder en met AI-sleutel', () => {
  const cursus = cursusMet([{ goalCodes: ['A1'], blocks: [DOELEN_CALLOUT, UITLEG] }]);

  it('zonder sleutel: een rustige knop met " (AI-sleutel nodig)" in het label', async () => {
    const { knop } = await leerplanScherm(cursus, false);
    expect(knop).toBeDefined();
    expect(tekstVan(knop).trim()).toBe('Vul de hiaten (AI-sleutel nodig)');
    expect(knop?.props?.className).toContain('btn-ghost');
    expect(knop?.props?.className).not.toContain('btn-ai');
    // De knop werkt nog: ze opent de uitleg om een sleutel in te stellen.
    expect(typeof knop?.props?.onClick).toBe('function');
  });

  it('met sleutel: de paarse AI-knop, zonder toevoeging', async () => {
    const { knop } = await leerplanScherm(cursus, true);
    expect(tekstVan(knop).trim()).toBe('Vul de hiaten');
    expect(knop?.props?.className).toContain('btn-ai');
    expect(knop?.props?.className).not.toContain('btn-ghost');
  });
});
