import { describe, expect, it } from 'vitest';
import { computeCoverage, coveragePercent, geplandeRijen, sectieHeeftInhoud, uncoveredGoalLines } from './coverage';
import type { Course, CourseSection } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import type { Widget } from './types';

const curriculum = {
  id: 'cur1',
  title: 'Voorbeeld',
  net: 'eigen',
  subject: 'Natuurwetenschappen',
  level: '1e graad',
  goals: [
    { id: 'g1', code: 'NW 1.1', text: 'Waterkringloop beschrijven', theme: 'Systeem aarde' },
    { id: 'g2', code: 'NW 1.2', text: 'Wolken verklaren', theme: 'Systeem aarde' },
    { id: 'g3', code: 'NW 2.1', text: 'Aggregatietoestanden', theme: 'Materie' },
    { id: 'g4', code: 'NW 2.2', text: 'Toestandsveranderingen', theme: 'Materie' },
  ],
  createdAt: 0,
  updatedAt: 0,
} as Curriculum;

const course = {
  id: 'c1', title: 'Water', author: '', coverEmoji: '💧', code: 'ABC123',
  curriculumId: 'cur1',
  settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
  createdAt: 0, updatedAt: 0,
  chapters: [
    {
      id: 'ch1', title: 'Verdamping', emoji: '☁️',
      sections: [
        // kleine letters + dubbele spatie: moet genormaliseerd worden
        { id: 's1', title: 'In de zon', goalCodes: ['nw  1.1'], blocks: [] },
        { id: 's2', title: 'Oefenen', goalCodes: [], blocks: [{ id: 'b1', type: 'widget', widgetId: 'w1' }] },
      ],
    },
    {
      id: 'ch2', title: 'Neerslag', emoji: '🌧️',
      sections: [
        // enkel in een keuzesectie → telt niet als gedekt
        { id: 's3', title: 'Van wolk tot regen', optional: true, goalCodes: ['NW 1.2', 'XX 9.9'], blocks: [] },
        { id: 's4', title: 'Zonder doel', blocks: [] },
      ],
    },
  ],
} as unknown as Course;

const widget = {
  id: 'w1', type: 'quiz', title: 'Quiz materie', folderId: null, code: 'QQQ111',
  settings: {}, createdAt: 0, updatedAt: 0,
  config: { questions: [{ id: 'q1', goalCode: 'NW 2.1' }, { id: 'q2', goalCode: 'nw 2.1' }, { id: 'q3' }] },
} as unknown as Widget;

describe('computeCoverage', () => {
  const res = computeCoverage(course, curriculum, [widget]);

  it('koppelt secties aan doelen, ongeacht schrijfwijze van de code', () => {
    const row = res.rows.find((r) => r.code === 'NW 1.1')!;
    expect(row.sections.map((s) => s.sectionTitle)).toEqual(['In de zon']);
    expect(row.status).toBe('covered');
  });

  it('telt een ingebedde oefening mee als dekking', () => {
    const row = res.rows.find((r) => r.code === 'NW 2.1')!;
    expect(row.sections).toHaveLength(0);
    expect(row.widgets.map((w) => w.title)).toEqual(['Quiz materie']);
    expect(row.status).toBe('covered');
  });

  it('markeert doelen die alleen in een keuzesectie staan', () => {
    expect(res.rows.find((r) => r.code === 'NW 1.2')!.status).toBe('optional');
  });

  it('markeert doelen die nergens voorkomen', () => {
    expect(res.rows.find((r) => r.code === 'NW 2.2')!.status).toBe('missing');
  });

  it('vat samen hoeveel doelen gedekt zijn', () => {
    expect(res.covered).toBe(2);
    expect(res.total).toBe(4);
    expect(res.percent).toBe(50);
    expect(res.summary).toBe('Dekkend: 2 van 4 doelen.');
    expect(res.uncovered.map((r) => r.code)).toEqual(['NW 1.2', 'NW 2.2']);
  });

  it('signaleert codes die niet in het leerplan staan en secties zonder code', () => {
    expect(res.unknownCodes).toEqual(['XX 9.9']);
    expect(res.sectionsWithoutCode.map((s) => s.sectionTitle)).toEqual(['Zonder doel']);
  });

  it('negeert widgets die niet in de cursus ingebed staan', () => {
    const los = { ...widget, id: 'w2' } as Widget;
    const zonder = computeCoverage(course, curriculum, [los]);
    expect(zonder.rows.find((r) => r.code === 'NW 2.1')!.status).toBe('missing');
  });

  it('kan om met een ontbrekend leerplan en een leerplan zonder doelen', () => {
    const geen = computeCoverage(course, undefined);
    expect(geen.rows).toEqual([]);
    expect(geen.percent).toBe(0);
    expect(geen.summary).toContain('geen doelen');
    expect(computeCoverage(course, { ...curriculum, goals: [] }).total).toBe(0);
  });

  it('telt een oefening uit een ánder leerplan met dezelfde code niet als dekking', () => {
    const vreemd = { ...widget, curriculumId: 'curB' } as Widget;
    const r = computeCoverage(course, curriculum, [vreemd]);
    const row = r.rows.find((x) => x.code === 'NW 2.1')!;
    expect(row.widgets).toEqual([]);
    expect(row.status).toBe('missing');
    expect(r.covered).toBe(1);
    expect(r.unknownCodes).toEqual(['XX 9.9']); // de vreemde code is geen "onbekende code" van dit leerplan
    expect(r.sectionsWithoutCode.map((s) => s.sectionTitle)).toEqual(['Oefenen', 'Zonder doel']);
    expect(r.otherCurriculumWidgets).toEqual([{
      widgetId: 'w1', title: 'Quiz materie', sectionId: 's2', sectionTitle: 'Oefenen', optional: false, curriculumId: 'curB',
    }]);
  });

  it('telt een oefening van hetzelfde leerplan of zonder leerplan wel mee', () => {
    for (const w of [{ ...widget, curriculumId: 'cur1' }, { ...widget, curriculumId: '' }, widget] as Widget[]) {
      const r = computeCoverage(course, curriculum, [w]);
      expect(r.rows.find((x) => x.code === 'NW 2.1')!.status).toBe('covered');
      expect(r.otherCurriculumWidgets).toEqual([]);
    }
  });

  it('vergelijkt met het meegegeven leerplan, anders met dat van de cursus', () => {
    const vreemd = { ...widget, curriculumId: 'curB' } as Widget;
    // ander leerplan meegegeven dan dat van de cursus: dat leerplan telt
    const r = computeCoverage(course, { ...curriculum, id: 'curB' }, [vreemd]);
    expect(r.rows.find((x) => x.code === 'NW 2.1')!.status).toBe('covered');
    // zonder leerplan: de vreemde oefening wordt toch gemeld via het leerplan van de cursus
    expect(computeCoverage(course, undefined, [vreemd]).otherCurriculumWidgets).toHaveLength(1);
    // cursus zonder leerplan en geen leerplan meegegeven: niets om mee te vergelijken
    const zonder = { ...course, curriculumId: undefined } as Course;
    expect(computeCoverage(zonder, undefined, [vreemd]).otherCurriculumWidgets).toEqual([]);
  });

  it('meldt een vreemde oefening zonder doelcodes niet', () => {
    const leeg = { ...widget, curriculumId: 'curB', config: { questions: [{ id: 'q1' }] } } as unknown as Widget;
    expect(computeCoverage(course, curriculum, [leeg]).otherCurriculumWidgets).toEqual([]);
  });

  it('levert een percentage en promptregels voor de hiaten', () => {
    expect(coveragePercent(course, curriculum, [widget])).toBe(50);
    expect(uncoveredGoalLines(res)).toEqual([
      'NW 1.2 — Wolken verklaren',
      'NW 2.2 — Toestandsveranderingen',
    ]);
  });
});

// ── Gepland: doelen op secties die nog leeg zijn (docs/STUDIERICHTINGEN.md § 13.1) ──

describe('sectieHeeftInhoud', () => {
  const sectie = (blocks: unknown) => ({ id: 's', title: 'S', blocks } as unknown as CourseSection);
  const doelen = { id: 'd', type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text: 'NW 1.1 — Water' };

  it('leeg: geen blokken, of alleen doelen-callouts', () => {
    expect(sectieHeeftInhoud(sectie([]))).toBe(false);
    expect(sectieHeeftInhoud(sectie([doelen]))).toBe(false);
    expect(sectieHeeftInhoud(sectie([doelen, { ...doelen, id: 'd2' }]))).toBe(false);
  });

  it('inhoud: elk ander blok, ook een andere callout, een oefening of een scheidingslijn', () => {
    expect(sectieHeeftInhoud(sectie([doelen, { id: 't', type: 'text', markdown: 'Uitleg' }]))).toBe(true);
    expect(sectieHeeftInhoud(sectie([{ id: 'i', type: 'callout', kind: 'info', text: 'Let op' }]))).toBe(true);
    expect(sectieHeeftInhoud(sectie([{ id: 'w', type: 'widget', widgetId: 'w1' }]))).toBe(true);
    expect(sectieHeeftInhoud(sectie([{ id: 'l', type: 'divider' }]))).toBe(true);
  });

  it('kapotte invoer telt als leeg en geeft geen fout', () => {
    expect(sectieHeeftInhoud(sectie(undefined))).toBe(false);
    expect(sectieHeeftInhoud(sectie('tekst'))).toBe(false);
    expect(sectieHeeftInhoud(sectie([null, undefined, doelen]))).toBe(false);
    expect(sectieHeeftInhoud(sectie([null, { id: 't', type: 'text', markdown: '' }]))).toBe(true);
  });
});

describe('geplandeRijen', () => {
  const tekst = (id: string) => ({ id, type: 'text', markdown: 'Uitleg' });
  const doelen = (id: string) => ({ id, type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text: '…' });
  const oefening = (id: string, widgetId: string) => ({ id, type: 'widget', widgetId });
  const cursusMet = (sections: unknown[]) => ({ ...course, chapters: [{ id: 'chx', title: 'H', sections }] } as unknown as Course);
  const codes = (rows: { code: string }[]) => rows.map((r) => r.code);

  it('op de bestaande cursus: NW 1.1 staat alleen op een lege sectie, NW 2.1 komt via een oefening aan bod', () => {
    const r = computeCoverage(course, curriculum, [widget]);
    expect(r.covered).toBe(2); // computeCoverage zelf verandert niet: beide tellen daar als gedekt
    expect(codes(geplandeRijen(r, course, [widget]))).toEqual(['NW 1.1']);
  });

  it('een sectie met alleen een doelen-callout is gepland; één gewone sectie met inhoud maakt het doel uitgewerkt', () => {
    const c = cursusMet([
      { id: 'a', title: 'A', goalCodes: ['NW 1.1', 'NW 1.2'], blocks: [doelen('d1')] },
      { id: 'b', title: 'B', goalCodes: ['nw  1.2'], blocks: [tekst('t1')] }, // andere schrijfwijze, met inhoud
    ]);
    const r = computeCoverage(c, curriculum, []);
    expect(r.rows.filter((x) => x.status === 'covered').map((x) => x.code)).toEqual(['NW 1.1', 'NW 1.2']);
    expect(codes(geplandeRijen(r, c))).toEqual(['NW 1.1']);
  });

  it('inhoud of een oefening in een keuzesectie maakt een doel niet uitgewerkt', () => {
    const c = cursusMet([
      { id: 'a', title: 'A', goalCodes: ['NW 1.1', 'NW 2.1'], blocks: [doelen('d1')] },
      { id: 'k', title: 'Keuze', optional: true, goalCodes: ['NW 1.1'], blocks: [tekst('t1'), oefening('o1', 'w1')] },
    ]);
    const r = computeCoverage(c, curriculum, [widget]); // de oefening draagt NW 2.1, maar staat in de keuzesectie
    expect(r.rows.find((x) => x.code === 'NW 2.1')!.widgets.map((w) => w.optional)).toEqual([true]);
    expect(codes(geplandeRijen(r, c, [widget]))).toEqual(['NW 1.1', 'NW 2.1']);
  });

  it('een oefening in een gewone sectie maakt het doel uitgewerkt, ook als die sectie de code zelf niet draagt', () => {
    const c = cursusMet([
      { id: 'a', title: 'A', goalCodes: ['NW 2.1'], blocks: [] },
      { id: 'b', title: 'B', goalCodes: [], blocks: [oefening('o1', 'w1')] },
    ]);
    const r = computeCoverage(c, curriculum, [widget]);
    expect(geplandeRijen(r, c, [widget])).toEqual([]);
  });

  it('alleen rijen met status covered: verdieping en ontbrekend komen er nooit in', () => {
    const c = cursusMet([
      { id: 'a', title: 'A', goalCodes: ['NW 1.1'], blocks: [] },
      { id: 'k', title: 'Keuze', optional: true, goalCodes: ['NW 1.2'], blocks: [] },
    ]);
    const r = computeCoverage(c, curriculum, []);
    expect(r.rows.map((x) => x.status)).toEqual(['covered', 'optional', 'missing', 'missing']);
    expect(codes(geplandeRijen(r, c))).toEqual(['NW 1.1']);
  });

  it('een andere callout (geen doelen-callout) is inhoud', () => {
    const c = cursusMet([{ id: 'a', title: 'A', goalCodes: ['NW 1.1'], blocks: [{ id: 'i', type: 'callout', kind: 'tip', text: 'Tip' }] }]);
    expect(geplandeRijen(computeCoverage(c, curriculum, []), c)).toEqual([]);
  });
});
