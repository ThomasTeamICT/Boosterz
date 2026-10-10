import { describe, expect, it } from 'vitest';
import type { Course } from './courseTypes';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import type { CursusBijdrage, KaderDoel, MdRij, MdStatus } from './dekkingMinimumdoelen';
import {
  codesVoorDoelen,
  cursussenVoorGaten,
  openNietVerplicht,
  openPerSet,
  openVerplichteDoelen,
  selectieVanOpen,
} from './gatenDichten';

// ── Hulp ────────────────────────────────────────────────────────────────────

function kaderDoel(set: string, id: string, extra: Partial<KaderDoel> = {}): KaderDoel {
  return { set, setNaam: set === 'ODS_1' ? 'Biologie' : 'Chemie', id, code: `C${id}`, tekst: `Doel ${id}`, optioneel: false, verplichteSet: true, ...extra };
}

function rij(doel: KaderDoel, status: MdStatus): MdRij {
  return { doel, status, via: [] };
}

function leerplanMet(goals: { code: string; refs?: { set: string; id: string | number }[] }[], id = 'lp1'): Curriculum {
  return {
    id, title: 'Leerplan', net: 'minimumdoelen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
    goals: goals.map((g, i) => ({
      id: `g${i}`, code: g.code, text: `Tekst ${g.code}`,
      ...(g.refs ? { refs: g.refs.map((r) => ({ set: r.set, id: r.id as string, code: '' })) } : {}),
    } as CurriculumGoal)),
  } as Curriculum;
}

function cursus(id: string, title: string, curriculumId?: string): Course {
  return {
    id, title, author: '', coverEmoji: '📘', code: id.toUpperCase(), chapters: [{ id: 'h', title: 'H', sections: [] }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    ...(curriculumId ? { curriculumId } : {}), createdAt: 1, updatedAt: 1,
  };
}

// ── openVerplichteDoelen ────────────────────────────────────────────────────

describe('openVerplichteDoelen', () => {
  const a1 = kaderDoel('ODS_1', '1001');
  const a2 = kaderDoel('ODS_1', '1002');
  const a3 = kaderDoel('ODS_1', '1003');
  const a4 = kaderDoel('ODS_1', '1004');
  const optioneel = kaderDoel('ODS_1', '1005', { optioneel: true });
  const uitbreiding = kaderDoel('ODS_3', '3001', { verplichteSet: false });
  const b1 = kaderDoel('ODS_2', '2001');

  it('neemt alleen verplichte doelen met status open; gepland, verdieping, gedekt, optioneel en uitbreiding blijven erbuiten', () => {
    const rijen = [
      rij(a1, 'open'),
      rij(a2, 'gepland'),
      rij(a3, 'verdieping'),
      rij(a4, 'gedekt'),
      rij(optioneel, 'open'),
      rij(uitbreiding, 'open'),
      rij(b1, 'open'),
    ];
    expect(openVerplichteDoelen({ rijen })).toEqual([a1, b1]);
  });

  it('geeft elk doel (set + vast nummer) één keer, in de volgorde van de rijen', () => {
    const dubbel = { ...a1, code: 'ANDERS' };
    expect(openVerplichteDoelen({ rijen: [rij(b1, 'open'), rij(a1, 'open'), rij(dubbel, 'open'), rij(a2, 'open')] })).toEqual([b1, a1, a2]);
  });

  it('hetzelfde vaste nummer in een andere set is een ander doel', () => {
    const ander = kaderDoel('ODS_2', '1001');
    expect(openVerplichteDoelen({ rijen: [rij(a1, 'open'), rij(ander, 'open')] })).toHaveLength(2);
  });

  it('is tolerant voor kapotte invoer en geeft dan niets', () => {
    expect(openVerplichteDoelen({ rijen: [] })).toEqual([]);
    expect(openVerplichteDoelen({ rijen: undefined as unknown as MdRij[] })).toEqual([]);
    expect(openVerplichteDoelen({ rijen: [null, undefined, {} as MdRij, rij(a1, 'open')] as MdRij[] })).toEqual([a1]);
  });
});

describe('openNietVerplicht', () => {
  it('telt open optionele doelen en doelen uit een uitbreidingsset, elk één keer; verplichte en niet-open doelen niet', () => {
    const rijen = [
      rij(kaderDoel('ODS_1', '1', { optioneel: true }), 'open'),
      rij(kaderDoel('ODS_1', '1', { optioneel: true }), 'open'),
      rij(kaderDoel('ODS_3', '2', { verplichteSet: false }), 'open'),
      rij(kaderDoel('ODS_3', '3', { verplichteSet: false }), 'gepland'),
      rij(kaderDoel('ODS_3', '4', { verplichteSet: false, optioneel: true }), 'open'),
      rij(kaderDoel('ODS_1', '5'), 'open'),
    ];
    expect(openNietVerplicht({ rijen })).toBe(3);
    expect(openNietVerplicht({ rijen: [] })).toBe(0);
  });
});

// ── openPerSet en selectieVanOpen ───────────────────────────────────────────

describe('openPerSet en selectieVanOpen', () => {
  const doelen = [
    kaderDoel('ODS_1', '1001'), kaderDoel('ODS_1', '1004'),
    kaderDoel('ODS_2', '2001'),
    kaderDoel('ODS_4', '4001'), kaderDoel('ODS_4', '4002'), kaderDoel('ODS_4', '4003'),
  ];

  it('groepeert per set in de volgorde van het kader, met de naam van de set', () => {
    const perSet = openPerSet(doelen);
    expect(perSet.map((s) => [s.set, s.setNaam, s.doelen.length])).toEqual([['ODS_1', 'Biologie', 2], ['ODS_2', 'Chemie', 1], ['ODS_4', 'Chemie', 3]]);
    expect(perSet[2].doelen.map((d) => d.id)).toEqual(['4001', '4002', '4003']);
  });

  it('geeft een lijst vaste nummers per gekozen set, in de volgorde van de set', () => {
    const selectie = selectieVanOpen(openPerSet(doelen), new Set(['ODS_4', 'ODS_1']));
    expect([...selectie]).toEqual([['ODS_1', ['1001', '1004']], ['ODS_4', ['4001', '4002', '4003']]]);
  });

  it('is voor een volledige set waarvan alles open staat nog steeds een lijst, nooit "alle"', () => {
    const selectie = selectieVanOpen(openPerSet(doelen), new Set(['ODS_4']));
    const waarde: unknown = selectie.get('ODS_4');
    expect(Array.isArray(waarde)).toBe(true);
    expect(waarde).not.toBe('alle');
    for (const ids of selectie.values()) expect(Array.isArray(ids)).toBe(true);
  });

  it('laat sets weg die niet gekozen zijn of niet bestaan, en geeft niets bij geen keuze', () => {
    expect([...selectieVanOpen(openPerSet(doelen), new Set(['ODS_2', 'ODS_999'])).keys()]).toEqual(['ODS_2']);
    expect(selectieVanOpen(openPerSet(doelen), new Set()).size).toBe(0);
    expect(selectieVanOpen([], new Set(['ODS_1'])).size).toBe(0);
  });

  it('groepeert een doel dat er twee keer in staat maar één keer', () => {
    const perSet = openPerSet([doelen[0], doelen[0], doelen[1]]);
    expect(perSet).toHaveLength(1);
    expect(perSet[0].doelen.map((d) => d.id)).toEqual(['1001', '1004']);
  });
});

// ── codesVoorDoelen ─────────────────────────────────────────────────────────

describe('codesVoorDoelen', () => {
  // Leerplan van een net: g3 verwijst naar twee minimumdoelen, g4 naar hetzelfde nummer in een andere set.
  const leerplan = leerplanMet([
    { code: 'bio 1.1', refs: [{ set: 'ODS_1', id: '1001' }] },
    { code: 'zonder verwijzing' },
    { code: 'B2', refs: [{ set: 'ODS_1', id: '1002' }, { set: 'ODS_2', id: '2001' }] },
    { code: 'B3', refs: [{ set: 'ODS_9', id: '1001' }] },
    { code: 'B4', refs: [{ set: 'ODS_1', id: '1001' }] },
    { code: 'B5', refs: [{ set: 'ODS_1', id: 1003 }] },
  ]);
  const doel = (set: string, id: string) => ({ set, id });

  it('geeft de genormaliseerde code van het eerste leerplandoel dat naar het doel verwijst', () => {
    const r = codesVoorDoelen(leerplan, [doel('ODS_1', '1001')]);
    // B4 verwijst ook naar dit doel, maar het eerste leerplandoel wint.
    expect(r.codes).toEqual(['BIO 1.1']);
    expect(r.inLeerplan).toEqual([doel('ODS_1', '1001')]);
    expect(r.nietInLeerplan).toEqual([]);
  });

  it('werkt strikt op set + vast nummer: hetzelfde nummer in een andere set of versie telt niet', () => {
    const r = codesVoorDoelen(leerplan, [doel('ODS_2', '1001'), doel('ODS_9', '1001'), doel('ODS_1', '1001')]);
    expect(r.inLeerplan).toEqual([doel('ODS_9', '1001'), doel('ODS_1', '1001')]);
    expect(r.nietInLeerplan).toEqual([doel('ODS_2', '1001')]);
    expect(r.codes).toEqual(['BIO 1.1', 'B3']);
  });

  it('een leerplandoel van een net met twee verwijzingen geeft één code voor beide doelen', () => {
    const r = codesVoorDoelen(leerplan, [doel('ODS_2', '2001'), doel('ODS_1', '1002')]);
    expect(r.codes).toEqual(['B2']);
    expect(r.inLeerplan).toHaveLength(2);
  });

  it('zet de codes in de volgorde van het leerplan, niet van de doelen, elk één keer', () => {
    const r = codesVoorDoelen(leerplan, [doel('ODS_1', '1003'), doel('ODS_1', '1002'), doel('ODS_1', '1001'), doel('ODS_2', '2001')]);
    expect(r.codes).toEqual(['BIO 1.1', 'B2', 'B5']);
    // `inLeerplan` houdt de volgorde van de doelen.
    expect(r.inLeerplan.map((d) => `${d.set}/${d.id}`)).toEqual(['ODS_1/1003', 'ODS_1/1002', 'ODS_1/1001', 'ODS_2/2001']);
  });

  it('een vast nummer als getal in de verwijzing telt als tekst', () => {
    expect(codesVoorDoelen(leerplan, [doel('ODS_1', '1003')]).codes).toEqual(['B5']);
  });

  it('een doel dat er twee keer in staat, telt één keer; doelen die nergens in staan komen in nietInLeerplan', () => {
    const r = codesVoorDoelen(leerplan, [doel('ODS_1', '1001'), doel('ODS_1', '1001'), doel('ODS_1', '4242')]);
    expect(r.inLeerplan).toHaveLength(1);
    expect(r.nietInLeerplan).toEqual([doel('ODS_1', '4242')]);
  });

  it('twee leerplandoelen met dezelfde code (ook in een andere schrijfwijze) geven die code één keer, voor beide doelen', () => {
    const lp = leerplanMet([
      { code: 'X 1', refs: [{ set: 'ODS_1', id: '1' }] },
      { code: 'Y2', refs: [{ set: 'ODS_1', id: '3' }] },
      { code: ' x  1', refs: [{ set: 'ODS_1', id: '2' }] },
    ]);
    const r = codesVoorDoelen(lp, [doel('ODS_1', '2'), doel('ODS_1', '1'), doel('ODS_1', '3')]);
    expect(r.codes).toEqual(['X 1', 'Y2']);
    expect(r.inLeerplan).toHaveLength(3);
    expect(r.nietInLeerplan).toEqual([]);
    expect(codesVoorDoelen(lp, [doel('ODS_1', '2'), doel('ODS_1', '1')]).codes).toEqual(['X 1']);
  });

  it('slaat een leerplandoel zonder bruikbare code over en neemt dan het volgende dat naar het doel verwijst', () => {
    const lp = leerplanMet([
      { code: '…', refs: [{ set: 'ODS_1', id: '1' }] },
      { code: 'ok 1', refs: [{ set: 'ODS_1', id: '1' }] },
      { code: '—', refs: [{ set: 'ODS_1', id: '2' }] },
    ]);
    const r = codesVoorDoelen(lp, [doel('ODS_1', '1'), doel('ODS_1', '2')]);
    expect(r.codes).toEqual(['OK 1']);
    expect(r.nietInLeerplan).toEqual([doel('ODS_1', '2')]);
  });

  it('geeft niets voor een leerplan zonder doelen, zonder verwijzingen of kapotte invoer', () => {
    expect(codesVoorDoelen(leerplanMet([]), [doel('ODS_1', '1')])).toEqual({ codes: [], inLeerplan: [], nietInLeerplan: [doel('ODS_1', '1')] });
    expect(codesVoorDoelen(leerplanMet([{ code: 'A' }]), []).codes).toEqual([]);
    const kapot = { ...leerplanMet([{ code: 'A' }]), goals: [null, { code: 'B', refs: 'x' }, { code: 7, refs: [null, { set: 1 }] }] } as unknown as Curriculum;
    expect(codesVoorDoelen(kapot, [doel('ODS_1', '1')]).codes).toEqual([]);
  });

  it('behoudt het type van de doelen (bv. KaderDoel)', () => {
    const k = kaderDoel('ODS_1', '1001');
    const r = codesVoorDoelen(leerplan, [k]);
    expect(r.inLeerplan[0].tekst).toBe('Doel 1001');
  });
});

// ── cursussenVoorGaten ──────────────────────────────────────────────────────

describe('cursussenVoorGaten', () => {
  const gekozen = [
    { set: 'ODS_1', id: '1001' }, { set: 'ODS_1', id: '1002' }, { set: 'ODS_2', id: '2001' },
  ];
  const lpDrie = leerplanMet([
    { code: 'A', refs: [{ set: 'ODS_1', id: '1001' }] },
    { code: 'B', refs: [{ set: 'ODS_1', id: '1002' }] },
    { code: 'C', refs: [{ set: 'ODS_2', id: '2001' }] },
  ], 'lp3');
  const lpEen = leerplanMet([{ code: 'A', refs: [{ set: 'ODS_1', id: '1001' }] }], 'lp1');
  const lpGeen = leerplanMet([{ code: 'Z', refs: [{ set: 'ODS_7', id: '7001' }] }], 'lp0');

  function bijdrage(c: Course, leerplan?: Curriculum): CursusBijdrage {
    return leerplan ? { course: c, leerplan } : { course: c };
  }

  it('sorteert op het aantal passende doelen (meeste eerst), dan op titel (nl)', () => {
    const r = cursussenVoorGaten(gekozen, [
      bijdrage(cursus('c1', 'Wiskunde', 'lp1'), lpEen),
      bijdrage(cursus('c2', 'Biologie', 'lp1'), lpEen),
      bijdrage(cursus('c3', 'Chemie', 'lp3'), lpDrie),
      bijdrage(cursus('c4', 'écologie', 'lp1'), lpEen),
    ]);
    expect(r.kandidaten.map((k) => [k.course.title, k.passend])).toEqual([['Chemie', 3], ['Biologie', 1], ['écologie', 1], ['Wiskunde', 1]]);
    expect(r.kandidaten[0].leerplan).toBe(lpDrie);
    expect(r.zonderPassend).toBe(0);
  });

  it('telt cursussen met een leerplan zonder passend doel in zonderPassend, en toont ze niet als kandidaat', () => {
    const r = cursussenVoorGaten(gekozen, [
      bijdrage(cursus('c1', 'A', 'lp1'), lpEen),
      bijdrage(cursus('c2', 'B', 'lp0'), lpGeen),
      bijdrage(cursus('c3', 'C', 'lp0'), lpGeen),
    ]);
    expect(r.kandidaten.map((k) => k.course.id)).toEqual(['c1']);
    expect(r.zonderPassend).toBe(2);
  });

  it('cursussen zonder leerplan vallen weg en tellen nergens mee', () => {
    const r = cursussenVoorGaten(gekozen, [
      bijdrage(cursus('c1', 'Zonder leerplan')),
      bijdrage(cursus('c2', 'Leerplan ontbreekt', 'lp-weg')),
      bijdrage(cursus('c3', 'Ander leerplan dan de cursus', 'lp3'), lpEen),
      bijdrage(cursus('c4', 'Goed', 'lp1'), lpEen),
    ]);
    expect(r.kandidaten.map((k) => k.course.id)).toEqual(['c4']);
    expect(r.zonderPassend).toBe(0);
  });

  it('telt elke cursus één keer', () => {
    const c = cursus('c1', 'A', 'lp1');
    const r = cursussenVoorGaten(gekozen, [bijdrage(c, lpEen), bijdrage(c, lpEen)]);
    expect(r.kandidaten).toHaveLength(1);
  });

  it('zonder doelen of zonder cursussen is er niets', () => {
    expect(cursussenVoorGaten([], [bijdrage(cursus('c1', 'A', 'lp1'), lpEen)])).toEqual({ kandidaten: [], zonderPassend: 1 });
    expect(cursussenVoorGaten(gekozen, [])).toEqual({ kandidaten: [], zonderPassend: 0 });
  });
});
