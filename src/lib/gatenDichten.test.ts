import { describe, expect, it } from 'vitest';
import type { Course } from './courseTypes';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { bkVerwijzingen } from './dekkingBk';
import type { CursusBijdrage, KaderDoel, MdRij, MdStatus } from './dekkingMinimumdoelen';
import {
  codesVoorDoelen,
  cursussenVoorGaten,
  openNietVerplicht,
  openPerSet,
  openVerplichteDoelen,
  selectieVanOpen,
  type Verwijzingen,
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

// ── Vastgelegd vóór pakket 3b-L1: zonder de nieuwe parameter is de uitkomst byte voor byte gelijk (I3) ──────────────

// De gouden uitkomsten zijn gemaakt met `codesVoorDoelen` en `cursussenVoorGaten` zoals ze vóór het algemeen maken
// waren (docs/STUDIERICHTINGEN.md § 24.4, 3b-L1) en daarna niet meer aangepast. Elke uitkomst is `JSON.stringify(…, null, 1)`,
// in regels (`opmaak`): ook de volgorde van de velden telt mee.

// @@GOUD-BEGIN@@
const GOUD: Record<string, readonly string[]> = {
  codes: [
    '{',
    ' "alles": {',
    '  "codes": ["BIO 1.1","B2","B3","B5","X 7","BK 1"],',
    '  "inLeerplan": [',
    '   {"set":"ODS_1","id":"1001","code":"C1","tekst":"eerste"},',
    '   {"set":"ODS_2","id":"2001","code":"C2","tekst":"tweede"},',
    '   {"set":"ODS_9","id":"1001","code":"C3","tekst":"derde"},',
    '   {"set":"ODS_1","id":"1003","code":"C4","tekst":"vierde"},',
    '   {',
    '    "set": "ODS_4",',
    '    "id": "4007",',
    '    "code": "C6",',
    '    "tekst": "de verwijzing in het leerplan heeft spaties"',
    '   },',
    '   {"set":" ODS_1 ","id":" 1002 ","code":"C7","tekst":"dit doel zelf heeft spaties"},',
    '   {',
    '    "set": "ODS_1",',
    '    "id": "1004",',
    '    "code": "C8",',
    '    "tekst": "het leerplandoel heeft ook een bkRef"',
    '   }',
    '  ],',
    '  "nietInLeerplan": [',
    '   {',
    '    "set": "ODS_3",',
    '    "id": "3001",',
    '    "code": "C5",',
    '    "tekst": "het leerplandoel heeft geen bruikbare code"',
    '   },',
    '   {',
    '    "set": "ODS_1",',
    '    "id": "1005",',
    '    "code": "C9",',
    '    "tekst": "alleen een bkRef met hetzelfde nummer: telt niet"',
    '   },',
    '   {"set":"ODS_7","id":"7","code":"C10","tekst":"staat nergens"}',
    '  ]',
    ' },',
    ' "omgekeerd": {',
    '  "codes": ["BIO 1.1","B2","B3","B5","X 7","BK 1"],',
    '  "inLeerplan": [',
    '   {',
    '    "set": "ODS_1",',
    '    "id": "1004",',
    '    "code": "C8",',
    '    "tekst": "het leerplandoel heeft ook een bkRef"',
    '   },',
    '   {',
    '    "set": " ODS_1 ",',
    '    "id": " 1002 ",',
    '    "code": "C7",',
    '    "tekst": "dit doel zelf heeft spaties"',
    '   },',
    '   {',
    '    "set": "ODS_4",',
    '    "id": "4007",',
    '    "code": "C6",',
    '    "tekst": "de verwijzing in het leerplan heeft spaties"',
    '   },',
    '   {"set":"ODS_1","id":"1001","code":"dubbel","tekst":"komt twee keer voor"},',
    '   {"set":"ODS_1","id":"1003","code":"C4","tekst":"vierde"},',
    '   {"set":"ODS_9","id":"1001","code":"C3","tekst":"derde"},',
    '   {"set":"ODS_2","id":"2001","code":"C2","tekst":"tweede"}',
    '  ],',
    '  "nietInLeerplan": [',
    '   {"set":"ODS_7","id":"7","code":"C10","tekst":"staat nergens"},',
    '   {',
    '    "set": "ODS_1",',
    '    "id": "1005",',
    '    "code": "C9",',
    '    "tekst": "alleen een bkRef met hetzelfde nummer: telt niet"',
    '   },',
    '   {',
    '    "set": "ODS_3",',
    '    "id": "3001",',
    '    "code": "C5",',
    '    "tekst": "het leerplandoel heeft geen bruikbare code"',
    '   }',
    '  ]',
    ' },',
    ' "eerste_twee": {',
    '  "codes": ["BIO 1.1","B2"],',
    '  "inLeerplan": [',
    '   {"set":"ODS_1","id":"1001","code":"C1","tekst":"eerste"},',
    '   {"set":"ODS_2","id":"2001","code":"C2","tekst":"tweede"}',
    '  ],',
    '  "nietInLeerplan": []',
    ' },',
    ' "zonder_doelen": {"codes":[],"inLeerplan":[],"nietInLeerplan":[]},',
    ' "geen_lijst": {"codes":[],"inLeerplan":[],"nietInLeerplan":[]},',
    ' "zonder_goals": {',
    '  "codes": [],',
    '  "inLeerplan": [],',
    '  "nietInLeerplan": [',
    '   {"set":"ODS_1","id":"1001","code":"C1","tekst":"eerste"},',
    '   {"set":"ODS_2","id":"2001","code":"C2","tekst":"tweede"}',
    '  ]',
    ' },',
    ' "geen_leerplan": {',
    '  "codes": [],',
    '  "inLeerplan": [],',
    '  "nietInLeerplan": [',
    '   {"set":"ODS_1","id":"1001","code":"C1","tekst":"eerste"},',
    '   {"set":"ODS_2","id":"2001","code":"C2","tekst":"tweede"}',
    '  ]',
    ' },',
    ' "kapotte_doelen": {',
    '  "codes": ["BIO 1.1"],',
    '  "inLeerplan": [{"set":"ODS_1","id":"1001","code":"ok"}],',
    '  "nietInLeerplan": [null,{"set":"ODS_1"},{"id":"1001"}]',
    ' }',
    '}',
  ],
  cursussen: [
    '{',
    ' "kandidaten": [',
    '  {"cursus":"c3","titel":"Chemie","leerplan":"lp3","passend":3},',
    '  {"cursus":"c2","titel":"Biologie","leerplan":"lp1","passend":1},',
    '  {"cursus":"c4","titel":"écologie","leerplan":"lp1","passend":1},',
    '  {"cursus":"c1","titel":"Wiskunde","leerplan":"lp1","passend":1}',
    ' ],',
    ' "zonderPassend": 1,',
    ' "geen_doelen": 5,',
    ' "geen_cursussen": {"kandidaten":[],"zonderPassend":0},',
    ' "geen_lijst": {"kandidaten":[],"zonderPassend":0}',
    '}',
  ],
};
// @@GOUD-END@@

/** JSON in regels: wat in `breedte` tekens past, blijft op één regel, de rest staat onder elkaar (zoals Prettier het zou doen). */
function opmaak(waarde: unknown, breedte = 110): string[] {
  const compact = JSON.stringify(waarde);
  if (waarde === null || typeof waarde !== 'object' || compact.length <= breedte) return [compact];
  const lijst = Array.isArray(waarde);
  const kinderen = lijst
    ? waarde.map((w) => opmaak(w, breedte - 1))
    : Object.entries(waarde)
      .filter(([, w]) => w !== undefined)
      .map(([k, w]) => {
        const r = opmaak(w, breedte - k.length - 5);
        r[0] = `${JSON.stringify(k)}: ${r[0]}`;
        return r;
      });
  const regels = [lijst ? '[' : '{'];
  kinderen.forEach((r, i) => r.forEach((regel, j) => regels.push(` ${regel}${j === r.length - 1 && i < kinderen.length - 1 ? ',' : ''}`)));
  regels.push(lijst ? ']' : '}');
  return regels;
}

function controleerGoud(naam: string, uitkomst: unknown): void {
  expect(opmaak(uitkomst)).toEqual(GOUD[naam]);
}

describe('vastgelegd vóór 3b-L1: codesVoorDoelen en cursussenVoorGaten zonder de nieuwe parameter', () => {
  /** Een leerplan van een net met alles wat de functie moet verdragen: een getal als nummer, spaties, dubbele codes, een doel zonder bruikbare code. */
  const leerplan = {
    ...leerplanMet([]),
    goals: [
      { id: 'g0', code: 'bio 1.1', text: 'a', refs: [{ set: 'ODS_1', id: '1001', code: '' }] },
      { id: 'g1', code: 'zonder verwijzing', text: 'b' },
      { id: 'g2', code: 'B2', text: 'c', refs: [{ set: 'ODS_1', id: '1002', code: '' }, { set: 'ODS_2', id: '2001', code: '' }] },
      { id: 'g3', code: 'B3', text: 'd', refs: [{ set: 'ODS_9', id: '1001', code: '' }] },
      { id: 'g4', code: 'B4', text: 'e', refs: [{ set: 'ODS_1', id: '1001', code: '' }] },
      { id: 'g5', code: 'B5', text: 'f', refs: [{ set: 'ODS_1', id: 1003, code: '' }] },
      { id: 'g6', code: '…', text: 'g', refs: [{ set: 'ODS_3', id: '3001', code: '' }] },
      { id: 'g7', code: ' x  7', text: 'h', refs: [{ set: ' ODS_4 ', id: ' 4007 ', code: '' }] },
      { id: 'g8', code: 'BK 1', text: 'i', refs: [{ set: 'ODS_1', id: '1004', code: '' }], bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0045062' }] },
      { id: 'g9', code: 'BK 2', text: 'j', bkRefs: [{ bk: 'ODS_1', id: '1005' }] },
      { id: 'g10', code: 'B10', text: 'k', refs: 'kapot' },
      null,
      { id: 'g12', code: 7, text: 'l', refs: [null, { set: 1 }] },
    ],
  } as unknown as Curriculum;

  const doelen = [
    { set: 'ODS_1', id: '1001', code: 'C1', tekst: 'eerste' },
    { set: 'ODS_2', id: '2001', code: 'C2', tekst: 'tweede' },
    { set: 'ODS_9', id: '1001', code: 'C3', tekst: 'derde' },
    { set: 'ODS_1', id: '1003', code: 'C4', tekst: 'vierde' },
    { set: 'ODS_1', id: '1001', code: 'dubbel', tekst: 'komt twee keer voor' },
    { set: 'ODS_3', id: '3001', code: 'C5', tekst: 'het leerplandoel heeft geen bruikbare code' },
    { set: 'ODS_4', id: '4007', code: 'C6', tekst: 'de verwijzing in het leerplan heeft spaties' },
    { set: ' ODS_1 ', id: ' 1002 ', code: 'C7', tekst: 'dit doel zelf heeft spaties' },
    { set: 'ODS_1', id: '1004', code: 'C8', tekst: 'het leerplandoel heeft ook een bkRef' },
    { set: 'ODS_1', id: '1005', code: 'C9', tekst: 'alleen een bkRef met hetzelfde nummer: telt niet' },
    { set: 'ODS_7', id: '7', code: 'C10', tekst: 'staat nergens' },
  ];

  it('codesVoorDoelen: codes, inLeerplan en nietInLeerplan, in alle volgordes en met kapotte invoer', () => {
    controleerGoud('codes', {
      alles: codesVoorDoelen(leerplan, doelen),
      omgekeerd: codesVoorDoelen(leerplan, [...doelen].reverse()),
      eerste_twee: codesVoorDoelen(leerplan, doelen.slice(0, 2)),
      zonder_doelen: codesVoorDoelen(leerplan, []),
      geen_lijst: codesVoorDoelen(leerplan, undefined as never),
      zonder_goals: codesVoorDoelen({ ...leerplan, goals: undefined } as unknown as Curriculum, doelen.slice(0, 2)),
      geen_leerplan: codesVoorDoelen(undefined as never, doelen.slice(0, 2)),
      kapotte_doelen: codesVoorDoelen(leerplan, [null, { set: 'ODS_1' }, { id: '1001' }, { set: 'ODS_1', id: '1001', code: 'ok' }] as never),
    });
  });

  it('codesVoorDoelen: een tweede aanroep met dezelfde invoer geeft hetzelfde; het leerplan en de doelen veranderen niet', () => {
    const leerplanVoor = JSON.stringify(leerplan);
    const doelenVoor = JSON.stringify(doelen);
    const een = codesVoorDoelen(leerplan, doelen);
    expect(codesVoorDoelen(leerplan, doelen)).toEqual(een);
    expect(JSON.stringify(leerplan)).toBe(leerplanVoor);
    expect(JSON.stringify(doelen)).toBe(doelenVoor);
    // De doelen zelf komen terug (dezelfde objecten), niet een kopie.
    expect(een.inLeerplan[0]).toBe(doelen[0]);
  });

  /** Drie leerplannen (id's `lp3`, `lp1`, `lp0`), cursussen met en zonder leerplan, een dubbele cursus en een ander leerplan dan de cursus. */
  const lpDrie = leerplanMet([
    { code: 'A', refs: [{ set: 'ODS_1', id: '1001' }] },
    { code: 'B', refs: [{ set: 'ODS_1', id: '1002' }] },
    { code: 'C', refs: [{ set: 'ODS_2', id: '2001' }] },
  ], 'lp3');
  const lpEen = leerplanMet([{ code: 'A', refs: [{ set: 'ODS_1', id: '1001' }] }], 'lp1');
  const lpGeen = leerplanMet([{ code: 'Z', refs: [{ set: 'ODS_7', id: '7001' }] }], 'lp0');
  const gekozen = [{ set: 'ODS_1', id: '1001' }, { set: 'ODS_1', id: '1002' }, { set: 'ODS_2', id: '2001' }];
  const cursusDubbel = cursus('c1', 'Wiskunde', 'lp1');
  const bijdragen: CursusBijdrage[] = [
    { course: cursusDubbel, leerplan: lpEen },
    { course: cursus('c2', 'Biologie', 'lp1'), leerplan: lpEen },
    { course: cursus('c3', 'Chemie', 'lp3'), leerplan: lpDrie },
    { course: cursus('c4', 'écologie', 'lp1'), leerplan: lpEen },
    { course: cursus('c5', 'Geen passend doel', 'lp0'), leerplan: lpGeen },
    { course: cursus('c6', 'Zonder leerplan') },
    { course: cursus('c7', 'Leerplan ontbreekt', 'lp-weg') },
    { course: cursus('c8', 'Ander leerplan dan de cursus', 'lp3'), leerplan: lpEen },
    { course: cursusDubbel, leerplan: lpEen },
  ];

  it('cursussenVoorGaten: de kandidaten in volgorde, met hun passende doelen, en het aantal zonder passend doel', () => {
    const r = cursussenVoorGaten(gekozen, bijdragen);
    controleerGoud('cursussen', {
      kandidaten: r.kandidaten.map((k) => ({ cursus: k.course.id, titel: k.course.title, leerplan: k.leerplan.id, passend: k.passend })),
      zonderPassend: r.zonderPassend,
      geen_doelen: cursussenVoorGaten([], bijdragen).zonderPassend,
      geen_cursussen: cursussenVoorGaten(gekozen, []),
      geen_lijst: cursussenVoorGaten(gekozen, undefined as never),
    });
    // De kandidaat bevat de cursus en het leerplan zelf, niet een kopie.
    expect(r.kandidaten[0].course).toBe(bijdragen[2].course);
    expect(r.kandidaten[0].leerplan).toBe(lpDrie);
  });
});

// ── De nieuwe parameter `verwijzingen` (pakket 3b-L1) ───────────────────────

/** Een kleine, vaste toevalsgenerator (mulberry32): dezelfde zaadwaarde geeft altijd dezelfde reeks, ook op een andere machine. */
function maakToeval(zaad: number): () => number {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Een leerplan met willekeurige, ook kapotte doelen: dubbele en lege codes, getallen als nummer, spaties, `refs` die geen lijst zijn, `bkRefs`. */
function willekeurigLeerplan(toeval: () => number, id: string): Curriculum {
  const kies = <T>(lijst: readonly T[]): T => lijst[Math.floor(toeval() * lijst.length)];
  const sets = ['ODS_1', 'ODS_2', ' ODS_3 ', '', 'ODS_1'];
  const nummers: (string | number)[] = ['1', '2', '3', 4, ' 5 ', '', '1', 2];
  const codes = ['A1', 'a1', ' b2 ', 'B3', '…', '', 'C 4', 'C4', 'D5', 'E6'];
  const aantal = Math.floor(toeval() * 9);
  const goals: unknown[] = [];
  for (let i = 0; i < aantal; i++) {
    const soort = toeval();
    if (soort < 0.08) { goals.push(null); continue; }
    const goal: Record<string, unknown> = { id: `g${i}`, code: toeval() < 0.05 ? 7 : kies(codes), text: `Doel ${i}` };
    if (toeval() < 0.8) {
      goal.refs = toeval() < 0.1
        ? kies(['kapot', 5, {}, null])
        : Array.from({ length: Math.floor(toeval() * 4) }, () => (toeval() < 0.1 ? kies([null, 3, 'x']) : { set: kies(sets), id: kies(nummers), code: '' }));
    }
    if (toeval() < 0.3) goal.bkRefs = [{ bk: kies(['BK-1-1', 'ODS_1']), id: kies(['1', '2', 'bkc1']) }];
    goals.push(goal);
  }
  return { ...leerplanMet([], id), goals } as unknown as Curriculum;
}

function willekeurigeDoelen(toeval: () => number): { set: string; id: string; tekst: string }[] {
  const sets = ['ODS_1', 'ODS_2', 'ODS_3', ' ODS_1 ', 'ODS_9', 'BK-1-1', ''];
  const nummers = ['1', '2', '3', '4', '5', ' 2 ', '', 'bkc1'];
  return Array.from({ length: Math.floor(toeval() * 8) }, (_, i) => ({
    set: sets[Math.floor(toeval() * sets.length)], id: nummers[Math.floor(toeval() * nummers.length)], tekst: `doel ${i}`,
  }));
}

describe('de standaardtak van codesVoorDoelen en cursussenVoorGaten is `goal.refs`', () => {
  const refs = (goal: CurriculumGoal) => goal.refs ?? [];

  it('geeft voor 400 willekeurige leerplannen dezelfde uitkomst zonder parameter als met `(g) => g.refs`', () => {
    const toeval = maakToeval(20261014);
    let metCodes = 0;
    for (let i = 0; i < 400; i++) {
      const leerplan = willekeurigLeerplan(toeval, `lp${i}`);
      const doelen = willekeurigeDoelen(toeval);
      const standaard = codesVoorDoelen(leerplan, doelen);
      expect(codesVoorDoelen(leerplan, doelen, refs), `leerplan ${i}`).toEqual(standaard);
      expect(JSON.stringify(codesVoorDoelen(leerplan, doelen, refs))).toBe(JSON.stringify(standaard));
      if (standaard.codes.length > 0) metCodes++;
    }
    // De proef zegt iets: er zijn leerplannen waar wel codes uitkomen.
    expect(metCodes).toBeGreaterThan(40);
  });

  it('cursussenVoorGaten geeft ook dezelfde uitkomst', () => {
    const toeval = maakToeval(14102026);
    for (let i = 0; i < 100; i++) {
      const doelen = willekeurigeDoelen(toeval);
      const bijdragen: CursusBijdrage[] = Array.from({ length: 1 + Math.floor(toeval() * 5) }, (_, k) => {
        const leerplan = willekeurigLeerplan(toeval, `lp${i}-${k}`);
        return { course: cursus(`c${i}-${k}`, `Cursus ${k % 3}`, leerplan.id), leerplan };
      });
      const standaard = cursussenVoorGaten(doelen, bijdragen);
      const met = cursussenVoorGaten(doelen, bijdragen, refs);
      expect(met.zonderPassend).toBe(standaard.zonderPassend);
      expect(met.kandidaten.map((k) => [k.course.id, k.passend])).toEqual(standaard.kandidaten.map((k) => [k.course.id, k.passend]));
    }
  });

  it('een parameter die undefined is, telt als geen parameter', () => {
    const leerplan = leerplanMet([{ code: 'A', refs: [{ set: 'ODS_1', id: '1' }] }]);
    expect(codesVoorDoelen(leerplan, [{ set: 'ODS_1', id: '1' }], undefined).codes).toEqual(['A']);
    expect(cursussenVoorGaten([{ set: 'ODS_1', id: '1' }], [{ course: cursus('c1', 'A', 'lp1'), leerplan: { ...leerplan, id: 'lp1' } }], undefined).kandidaten).toHaveLength(1);
  });
});

describe('codesVoorDoelen met een eigen `verwijzingen`', () => {
  const leerplan = leerplanMet([
    { code: 'A', refs: [{ set: 'ODS_1', id: '1' }] },
    { code: 'B', refs: [{ set: 'ODS_1', id: '2' }] },
    { code: '…', refs: [{ set: 'ODS_1', id: '3' }] },
  ]);
  const doelen = [{ set: 'ODS_1', id: '1' }, { set: 'ODS_1', id: '2' }, { set: 'ODS_1', id: '3' }, { set: 'ODS_X', id: 'x' }];

  it('gebruikt wat de functie teruggeeft in plaats van `refs`', () => {
    const r = codesVoorDoelen(leerplan, doelen, (goal) => (goal.code === 'A' ? [{ set: 'ODS_X', id: 'x' }] : []));
    expect(r.codes).toEqual(['A']);
    expect(r.inLeerplan).toEqual([{ set: 'ODS_X', id: 'x' }]);
    expect(r.nietInLeerplan).toHaveLength(3);
  });

  it('laat de uitkomst nog door dezelfde controle gaan als `refs`: spaties, een getal als nummer, en niets bij een kapotte verwijzing', () => {
    const lp = leerplanMet([{ code: 'A' }, { code: 'B' }, { code: 'C' }, { code: 'D' }]);
    const eigen: Verwijzingen = (goal) => ({
      A: [{ set: ' ODS_1 ', id: ' 1 ' }],
      B: [{ set: 'ODS_1', id: 2 }, null, { set: '', id: '9' }, { set: 'ODS_1' }, 'x'],
      C: 'geen lijst',
      D: undefined,
    }[goal.code] as never);
    const r = codesVoorDoelen(lp, [{ set: 'ODS_1', id: '1' }, { set: 'ODS_1', id: '2' }, { set: 'ODS_1', id: '9' }], eigen);
    expect(r.codes).toEqual(['A', 'B']);
    expect(r.inLeerplan.map((d) => d.id)).toEqual(['1', '2']);
    expect(r.nietInLeerplan.map((d) => d.id)).toEqual(['9']);
  });

  it('wordt niet aangeroepen voor een leerplandoel zonder bruikbare code, of voor een doel dat geen object is', () => {
    const kapot = { ...leerplan, goals: [null, 'x', { id: 'z', code: '…', text: 'z' }, { id: 'a', code: 'A', text: 'a' }] } as unknown as Curriculum;
    const gezien: unknown[] = [];
    codesVoorDoelen(kapot, doelen, (goal) => { gezien.push(goal); return []; });
    expect(gezien).toEqual([{ id: 'a', code: 'A', text: 'a' }]);
  });

  it('past het leerplan en de doelen niet aan', () => {
    const voor = JSON.stringify([leerplan, doelen]);
    codesVoorDoelen(leerplan, doelen, () => [{ set: 'ODS_1', id: '1' }]);
    expect(JSON.stringify([leerplan, doelen])).toBe(voor);
  });
});

describe('I6: een BK-cursus is nooit kandidaat voor de gaten van de minimumdoelen, en omgekeerd', () => {
  const mdLeerplan = leerplanMet([{ code: 'MD 1', refs: [{ set: 'ODS_1', id: '1001' }] }], 'lp-md');
  const bkLeerplan = {
    ...leerplanMet([], 'lp-bk'),
    goals: [
      { id: 'g1', code: 'BK-0390-2.01', text: 'Werkt in teamverband', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0000001' }] },
      { id: 'g2', code: 'BK-0390-2.02', text: 'Ontvangt gasten', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0000002' }] },
    ],
  } as Curriculum;
  /** Een leerplan met allebei, zoals een kapotte opslag het zou kunnen geven: elke kant ziet alleen zijn eigen verwijzing. */
  const beide = {
    ...leerplanMet([], 'lp-beide'),
    goals: [{ id: 'g1', code: 'X 1', text: 'x', refs: [{ set: 'ODS_1', id: '1001', code: '' }], bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0000001' }] }],
  } as Curriculum;

  const mdDoelen = [{ set: 'ODS_1', id: '1001' }];
  const bkDoelen = [{ set: 'BK-0390-2', id: 'bkc0000001' }, { set: 'BK-0390-2', id: 'bkc0000002' }];
  const bijdragen: CursusBijdrage[] = [
    { course: cursus('md', 'MD-cursus', 'lp-md'), leerplan: mdLeerplan },
    { course: cursus('bk', 'BK-cursus', 'lp-bk'), leerplan: bkLeerplan },
  ];

  it('bkVerwijzingen ziet alleen `bkRefs`, de standaard alleen `refs`', () => {
    expect(codesVoorDoelen(bkLeerplan, bkDoelen, bkVerwijzingen).codes).toEqual(['BK-0390-2.01', 'BK-0390-2.02']);
    expect(codesVoorDoelen(bkLeerplan, bkDoelen).codes).toEqual([]);
    expect(codesVoorDoelen(mdLeerplan, mdDoelen).codes).toEqual(['MD 1']);
    expect(codesVoorDoelen(mdLeerplan, mdDoelen, bkVerwijzingen).codes).toEqual([]);
    expect(codesVoorDoelen(beide, mdDoelen).codes).toEqual(['X 1']);
    expect(codesVoorDoelen(beide, bkDoelen).codes).toEqual([]);
    expect(codesVoorDoelen(beide, bkDoelen, bkVerwijzingen).codes).toEqual(['X 1']);
    expect(codesVoorDoelen(beide, mdDoelen, bkVerwijzingen).codes).toEqual([]);
  });

  it('de gaten van de minimumdoelen: alleen de MD-cursus is kandidaat, de BK-cursus telt bij zonderPassend', () => {
    const r = cursussenVoorGaten(mdDoelen, bijdragen);
    expect(r.kandidaten.map((k) => k.course.id)).toEqual(['md']);
    expect(r.zonderPassend).toBe(1);
  });

  it('de gaten van de competenties: alleen de BK-cursus is kandidaat, de MD-cursus telt bij zonderPassend', () => {
    const r = cursussenVoorGaten(bkDoelen, bijdragen, bkVerwijzingen);
    expect(r.kandidaten.map((k) => [k.course.id, k.passend])).toEqual([['bk', 2]]);
    expect(r.zonderPassend).toBe(1);
  });

  it('de verkeerde combinatie geeft nooit een kandidaat', () => {
    expect(cursussenVoorGaten(bkDoelen, bijdragen)).toMatchObject({ kandidaten: [], zonderPassend: 2 });
    expect(cursussenVoorGaten(mdDoelen, bijdragen, bkVerwijzingen)).toMatchObject({ kandidaten: [], zonderPassend: 2 });
  });
});
