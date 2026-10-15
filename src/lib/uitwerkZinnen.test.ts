import { describe, expect, it } from 'vitest';
import { computeCoverage, geplandeRijen } from './coverage';
import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { uitwerkKaartje, uitwerkPercent, uitwerkTelling, uitwerkZin } from './uitwerkZinnen';

const T = (totaal: number, uitgewerkt: number, gepland: number) => ({ totaal, uitgewerkt, gepland, open: totaal - uitgewerkt - gepland });

describe('uitwerkTelling', () => {
  it('splitst het gedekte deel in uitgewerkt en gepland, en rekent de rest als open', () => {
    expect(uitwerkTelling({ total: 6, covered: 4 }, 3)).toEqual({ totaal: 6, uitgewerkt: 1, gepland: 3, open: 2 });
    expect(uitwerkTelling({ total: 6, covered: 6 }, 0)).toEqual({ totaal: 6, uitgewerkt: 6, gepland: 0, open: 0 });
    expect(uitwerkTelling({ total: 6, covered: 6 }, 6)).toEqual({ totaal: 6, uitgewerkt: 0, gepland: 6, open: 0 });
  });

  it('kapotte aantallen geven nooit meer doelen dan er zijn of een negatief aantal', () => {
    expect(uitwerkTelling({ total: 3, covered: 9 }, 9)).toEqual({ totaal: 3, uitgewerkt: 0, gepland: 3, open: 0 });
    expect(uitwerkTelling({ total: 3, covered: 2 }, -4)).toEqual({ totaal: 3, uitgewerkt: 2, gepland: 0, open: 1 });
    expect(uitwerkTelling({ total: Number.NaN, covered: 1 }, 1)).toEqual({ totaal: 0, uitgewerkt: 0, gepland: 0, open: 0 });
    expect(uitwerkTelling({ total: 5, covered: 2.7 }, 0.9)).toEqual({ totaal: 5, uitgewerkt: 2, gepland: 0, open: 3 });
  });
});

describe('uitwerkZin (weergave Leerplan)', () => {
  it('niets uitgewerkt en alles nog niet (0)', () => {
    expect(uitwerkZin(T(6, 0, 0))).toBe('0 van de 6 doelen zijn uitgewerkt. 6 nog niet.');
  });

  it('één uitgewerkt: enkelvoud van het werkwoord', () => {
    expect(uitwerkZin(T(6, 1, 0))).toBe('1 van de 6 doelen is uitgewerkt. 5 nog niet.');
    expect(uitwerkZin(T(6, 1, 1))).toBe('1 van de 6 doelen is uitgewerkt. 1 staat gepland (de sectie is nog leeg), 4 nog niet.');
  });

  it('twee uitgewerkt: meervoud, met gepland en nog niet', () => {
    expect(uitwerkZin(T(6, 2, 3))).toBe('2 van de 6 doelen zijn uitgewerkt. 3 staan gepland (de sectie is nog leeg), 1 nog niet.');
    expect(uitwerkZin(T(6, 2, 2))).toBe('2 van de 6 doelen zijn uitgewerkt. 2 staan gepland (de sectie is nog leeg), 2 nog niet.');
  });

  it('wat 0 is valt weg', () => {
    expect(uitwerkZin(T(6, 4, 2))).toBe('4 van de 6 doelen zijn uitgewerkt. 2 staan gepland (de sectie is nog leeg).');
    expect(uitwerkZin(T(6, 4, 0))).toBe('4 van de 6 doelen zijn uitgewerkt. 2 nog niet.');
  });

  it('alles uitgewerkt', () => {
    expect(uitwerkZin(T(6, 6, 0))).toBe('Alle 6 doelen zijn uitgewerkt.');
    expect(uitwerkZin(T(2, 2, 0))).toBe('Alle 2 doelen zijn uitgewerkt.');
  });

  it('alles gepland: een leeg geraamte is niet "dekkend"', () => {
    const zin = uitwerkZin(T(6, 0, 6));
    expect(zin).toBe('0 van de 6 doelen zijn uitgewerkt. 6 staan gepland (de sectie is nog leeg).');
    expect(zin).not.toMatch(/dekkend|alle 6 doelen komen aan bod/i);
    expect(uitwerkZin(T(2, 0, 2))).toBe('0 van de 2 doelen zijn uitgewerkt. 2 staan gepland (de sectie is nog leeg).');
  });

  it('één doel in het leerplan: geen "0 van de 1 doelen"', () => {
    expect(uitwerkZin(T(1, 1, 0))).toBe('Het enige doel is uitgewerkt.');
    expect(uitwerkZin(T(1, 0, 1))).toBe('Het enige doel staat gepland (de sectie is nog leeg).');
    expect(uitwerkZin(T(1, 0, 0))).toBe('Het enige doel is nog niet uitgewerkt.');
  });

  it('geen doelen', () => {
    expect(uitwerkZin(T(0, 0, 0))).toBe('Dit leerplan bevat nog geen doelen.');
  });

  it('geen groepnummers of woorden uit het vakjargon in de zinnen', () => {
    for (const t of [T(6, 0, 0), T(6, 2, 3), T(6, 6, 0), T(6, 0, 6), T(1, 0, 1)]) {
      expect(uitwerkZin(t)).not.toMatch(/widget|G-\d|ODS_|hiaten|geraamte|dekkend|gedekt/i);
    }
  });
});

describe('uitwerkPercent en uitwerkKaartje (cursuskaartje)', () => {
  it('"{p} % uitgewerkt" zonder geplande doelen', () => {
    expect(uitwerkKaartje(T(6, 0, 0))).toBe('0 % uitgewerkt');
    expect(uitwerkKaartje(T(6, 3, 0))).toBe('50 % uitgewerkt');
    expect(uitwerkKaartje(T(6, 6, 0))).toBe('100 % uitgewerkt');
  });

  it('met geplande doelen komt er " · {g} gepland" achter', () => {
    expect(uitwerkKaartje(T(6, 0, 6))).toBe('0 % uitgewerkt · 6 gepland');
    expect(uitwerkKaartje(T(6, 2, 1))).toBe('33 % uitgewerkt · 1 gepland');
    expect(uitwerkKaartje(T(43, 3, 20))).toBe('7 % uitgewerkt · 20 gepland');
  });

  it('100 % betekent echt alles: een afronding naar boven blijft 99', () => {
    expect(uitwerkPercent({ totaal: 300, uitgewerkt: 299 })).toBe(99);
    expect(uitwerkPercent({ totaal: 300, uitgewerkt: 300 })).toBe(100);
    expect(uitwerkPercent({ totaal: 0, uitgewerkt: 0 })).toBe(0);
  });

  it('zonder doelen in het leerplan geen "0 % uitgewerkt"', () => {
    expect(uitwerkKaartje(T(0, 0, 0))).toBe('Nog geen doelen in het leerplan');
  });
});

// ── Samen met de echte rekenregel: een vers geraamte telt als gepland, niet als uitgewerkt ──

const leerplan = {
  id: 'lp', title: 'Leerplan', net: 'eigen', subject: '', level: '', kind: 'leerplan', createdAt: 0, updatedAt: 0,
  goals: [
    { id: 'g1', code: 'A1', text: 'Doel 1.' },
    { id: 'g2', code: 'A2', text: 'Doel 2.' },
    { id: 'g3', code: 'A3', text: 'Doel 3.' },
  ],
} as unknown as Curriculum;

function cursus(secties: { goalCodes: string[]; blocks: unknown[] }[]): Course {
  return {
    id: 'c', title: 'Cursus', author: '', coverEmoji: '', code: 'ABC123', curriculumId: 'lp', settings: {}, createdAt: 0, updatedAt: 0,
    chapters: [{ id: 'h1', title: 'Hoofdstuk', sections: secties.map((s, i) => ({ id: `s${i}`, title: `Sectie ${i}`, ...s })) }],
  } as unknown as Course;
}

const DOELEN_BLOK = { id: 'b0', type: 'callout', kind: 'goal', text: 'Doelen' };
const TEKST_BLOK = { id: 'b1', type: 'text', text: 'Uitleg' };

function zinVoor(c: Course): { zin: string; kaartje: string } {
  const res = computeCoverage(c, leerplan, []);
  const t = uitwerkTelling(res, geplandeRijen(res, c, []).length);
  return { zin: uitwerkZin(t), kaartje: uitwerkKaartje(t) };
}

describe('met computeCoverage en geplandeRijen', () => {
  it('een geraamte met alleen de doelen-callout: alles gepland, 0 % uitgewerkt', () => {
    const c = cursus([
      { goalCodes: ['A1'], blocks: [DOELEN_BLOK] },
      { goalCodes: ['A2', 'A3'], blocks: [DOELEN_BLOK] },
    ]);
    // De rekenregel zelf blijft: dit telt als gedekt.
    expect(computeCoverage(c, leerplan, []).summary).toBe('Dekkend: alle 3 doelen komen aan bod.');
    expect(zinVoor(c)).toEqual({
      zin: '0 van de 3 doelen zijn uitgewerkt. 3 staan gepland (de sectie is nog leeg).',
      kaartje: '0 % uitgewerkt · 3 gepland',
    });
  });

  it('een sectie met inhoud werkt haar doelen uit; een doel zonder sectie blijft "nog niet"', () => {
    const c = cursus([
      { goalCodes: ['A1'], blocks: [DOELEN_BLOK, TEKST_BLOK] },
      { goalCodes: ['A2'], blocks: [DOELEN_BLOK] },
    ]);
    expect(zinVoor(c)).toEqual({
      zin: '1 van de 3 doelen is uitgewerkt. 1 staat gepland (de sectie is nog leeg), 1 nog niet.',
      kaartje: '33 % uitgewerkt · 1 gepland',
    });
  });

  it('alles uitgewerkt', () => {
    const c = cursus([{ goalCodes: ['A1', 'A2', 'A3'], blocks: [TEKST_BLOK] }]);
    expect(zinVoor(c)).toEqual({ zin: 'Alle 3 doelen zijn uitgewerkt.', kaartje: '100 % uitgewerkt' });
  });
});
