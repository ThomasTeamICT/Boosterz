import { describe, expect, it } from 'vitest';
import type { ClassGroup } from './classTypes';
import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { doelgroepVoorLeerplan, sanitizeDoelgroep, type Doelgroep } from './doelgroep';
import {
  cursussenVoorToewijzen,
  doelgroepVanCursus,
  klassenVanRichting,
  klassenVoorToewijzen,
  pastBijKlas,
} from './doelgroepGebruik';

// ── Nagemaakte gegevens ─────────────────────────────────────────────────────

const KADER = 'ab'.repeat(32);

function dg(groep: string, extra: Partial<Doelgroep> = {}): Doelgroep {
  return { groep, titel: `Richting ${groep}`, soort: 'so', ...extra };
}

const NW = (jaar?: number, extra: Partial<Doelgroep> = {}): Doelgroep =>
  dg('G-0193', { titel: 'Natuurwetenschappen', graad: 2, ...(jaar !== undefined ? { jaar } : {}), ...extra });

function cursus(id: string, doelgroep?: Doelgroep, curriculumId?: string): Course {
  return {
    id, title: `Cursus ${id}`, author: '', coverEmoji: '📘', code: 'CRS001', chapters: [],
    settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
    ...(doelgroep ? { doelgroep } : {}), ...(curriculumId ? { curriculumId } : {}),
    createdAt: 0, updatedAt: 0,
  };
}

function leerplan(id: string, doelgroep?: Doelgroep): Curriculum {
  return { id, title: `Leerplan ${id}`, net: 'eigen', subject: 'Biologie', level: '2de graad', goals: [], ...(doelgroep ? { doelgroep } : {}) } as unknown as Curriculum;
}

function klas(id: string, name: string, doelgroep?: Doelgroep): ClassGroup {
  return { id, name, code: id.toUpperCase().padEnd(6, 'X').slice(0, 6), students: [], ...(doelgroep ? { doelgroep } : {}), createdAt: 0, updatedAt: 0 };
}

const ids = (lijst: readonly { id: string }[]) => lijst.map((x) => x.id);

// ── doelgroepVanCursus ──────────────────────────────────────────────────────

/** De functie zoals ze stond in RichtingDoelen.tsx voor ze verhuisde: letterlijk, om het gedrag te vergelijken. */
function oudeDoelgroepVanCursus(course: Course, curricula: readonly Curriculum[]): Doelgroep | undefined {
  const eigen = sanitizeDoelgroep(course.doelgroep);
  if (eigen) return eigen;
  const lp = course.curriculumId ? curricula.find((c) => c.id === course.curriculumId) : undefined;
  return lp ? doelgroepVoorLeerplan(lp.doelgroep) : undefined;
}

describe('doelgroepVanCursus', () => {
  const lp = leerplan('lp1', NW(4, { kader: KADER, kaderVolledig: KADER, volgtKader: true, vak: 'Biologie' }));

  it('de eigen doelgroep van de cursus gaat voor, met jaar en gesaneerd', () => {
    const d = doelgroepVanCursus(cursus('c1', NW(3, { vak: ' Chemie ' }), 'lp1'), [lp]);
    expect(d).toEqual({ groep: 'G-0193', titel: 'Natuurwetenschappen', soort: 'so', graad: 2, jaar: 3, vak: 'Chemie' });
  });

  it('zonder eigen doelgroep: die van het leerplan, zonder jaar en zonder verder te wijzigen', () => {
    const d = doelgroepVanCursus(cursus('c1', undefined, 'lp1'), [lp]);
    expect(d?.groep).toBe('G-0193');
    expect(d?.jaar).toBeUndefined();
    expect(d?.kader).toBe(KADER);
    expect(d?.vak).toBe('Biologie');
  });

  it('een ongeldige eigen doelgroep valt terug op het leerplan', () => {
    const kapot = { groep: 'kapot', titel: 'x', soort: 'so' } as Doelgroep;
    expect(doelgroepVanCursus(cursus('c1', kapot, 'lp1'), [lp])?.groep).toBe('G-0193');
  });

  it('geen doelgroep: zonder leerplan, met een onbekend leerplan, of met een leerplan zonder doelgroep', () => {
    expect(doelgroepVanCursus(cursus('c1'), [lp])).toBeUndefined();
    expect(doelgroepVanCursus(cursus('c1', undefined, 'bestaat-niet'), [lp])).toBeUndefined();
    expect(doelgroepVanCursus(cursus('c1', undefined, 'lp2'), [leerplan('lp2')])).toBeUndefined();
    expect(doelgroepVanCursus(cursus('c1', undefined, 'lp1'), [])).toBeUndefined();
  });

  it('geeft precies hetzelfde als de oude functie, over alle combinaties', () => {
    const eigen: (Doelgroep | undefined)[] = [
      undefined, NW(4), NW(), NW(3, { kader: KADER, setAfdrukken: { ODS_1: '0123456789abcdef' } }),
      { groep: 'kapot', titel: 'x', soort: 'so' } as Doelgroep, dg('G-0307', { graad: 1, jaar: 2 }), dg('G-0009', { soort: 'buso' }),
    ];
    const leerplannen: (Curriculum | undefined)[] = [
      undefined, leerplan('lp', undefined), leerplan('lp', NW(4)), leerplan('lp', NW(4, { kader: KADER, volgtKader: true })),
      leerplan('lp', { groep: 'kapot', titel: 'x', soort: 'so' } as Doelgroep), leerplan('lp', dg('G-0311', { graad: 1, soort: 'buso' })),
    ];
    for (const e of eigen) {
      for (const l of leerplannen) {
        for (const verwijst of [false, true]) {
          const c = cursus('c', e, verwijst ? 'lp' : undefined);
          const lijst = l ? [l] : [];
          expect(doelgroepVanCursus(c, lijst)).toEqual(oudeDoelgroepVanCursus(c, lijst));
        }
      }
    }
  });
});

// ── pastBijKlas ─────────────────────────────────────────────────────────────

describe('pastBijKlas', () => {
  it('hetzelfde jaar past, een ander jaar niet', () => {
    expect(pastBijKlas(NW(4), NW(4))).toBe(true);
    expect(pastBijKlas(NW(4), NW(3))).toBe(false);
  });

  it('een jaar dat bij één van beide ontbreekt, past (de hele graad)', () => {
    expect(pastBijKlas(NW(), NW(4))).toBe(true);
    expect(pastBijKlas(NW(4), NW())).toBe(true);
    expect(pastBijKlas(NW(), NW())).toBe(true);
  });

  it('een andere soort onderwijs of een andere richting past niet', () => {
    expect(pastBijKlas(NW(4), NW(4, { soort: 'buso' }))).toBe(false);
    expect(pastBijKlas(NW(4, { soort: 'buso' }), NW(4))).toBe(false);
    expect(pastBijKlas(NW(4), dg('G-0117', { graad: 2, jaar: 4 }))).toBe(false);
  });

  it('1A (G-0307) en 2A (G-0311) passen niet bij elkaar, ook niet zonder jaar', () => {
    const een = dg('G-0307', { titel: 'Eerste leerjaar A', graad: 1 });
    const twee = dg('G-0311', { titel: 'Tweede leerjaar A', graad: 1 });
    expect(pastBijKlas(een, twee)).toBe(false);
    expect(pastBijKlas(twee, een)).toBe(false);
    expect(pastBijKlas(een, een)).toBe(true);
  });

  it('vak, onderdeel en kadervelden tellen niet mee', () => {
    expect(pastBijKlas(NW(4, { onderdeel: 247 }), NW(4, { vak: 'Biologie', kader: KADER, volgtKader: true }))).toBe(true);
  });

  it('een ongeldige doelgroep past nergens', () => {
    const kapot = { groep: 'x', titel: 'x', soort: 'so' } as Doelgroep;
    expect(pastBijKlas(kapot, NW(4))).toBe(false);
    expect(pastBijKlas(NW(4), kapot)).toBe(false);
    expect(pastBijKlas(kapot, kapot)).toBe(false);
    expect(pastBijKlas(undefined as unknown as Doelgroep, NW(4))).toBe(false);
  });
});

// ── cursussenVoorToewijzen ──────────────────────────────────────────────────

describe('cursussenVoorToewijzen', () => {
  const lp = leerplan('lp-nw', NW(4)); // een leerplan geldt voor de hele graad: zonder jaar
  const courses = [
    cursus('a-geen'),
    cursus('b-zonder-jaar', NW()),
    cursus('c-jaar4', NW(4)),
    cursus('d-jaar3', NW(3)),
    cursus('e-leerplan', undefined, 'lp-nw'),
    cursus('f-jaar4', NW(4, { vak: 'Chemie' })),
    cursus('g-andere-richting', dg('G-0117', { graad: 2, jaar: 4 })),
    cursus('h-buso', NW(4, { soort: 'buso' })),
    cursus('i-1a', dg('G-0307', { graad: 1, jaar: 1 })),
  ];

  it('passend: eerst hetzelfde jaar, dan de rest die past, binnen elk de volgorde van de cursussen', () => {
    const { passend, andere } = cursussenVoorToewijzen(courses, [lp], NW(4));
    expect(ids(passend)).toEqual(['c-jaar4', 'f-jaar4', 'b-zonder-jaar', 'e-leerplan']);
    expect(ids(andere)).toEqual(['a-geen', 'd-jaar3', 'g-andere-richting', 'h-buso', 'i-1a']);
  });

  it('elke cursus staat in precies één van de twee lijsten', () => {
    const { passend, andere } = cursussenVoorToewijzen(courses, [lp], NW(4));
    expect([...ids(passend), ...ids(andere)].sort()).toEqual(ids(courses).sort());
  });

  it('een klas zonder jaar: alles voor de richting past, in de volgorde van de cursussen', () => {
    const { passend, andere } = cursussenVoorToewijzen(courses, [lp], NW());
    expect(ids(passend)).toEqual(['b-zonder-jaar', 'c-jaar4', 'd-jaar3', 'e-leerplan', 'f-jaar4']);
    expect(ids(andere)).toEqual(['a-geen', 'g-andere-richting', 'h-buso', 'i-1a']);
  });

  it('een klas van het 1ste leerjaar A krijgt het 2de leerjaar A niet als passend', () => {
    const lijst = [cursus('een', dg('G-0307', { graad: 1 })), cursus('twee', dg('G-0311', { graad: 1 }))];
    const { passend, andere } = cursussenVoorToewijzen(lijst, [], dg('G-0307', { graad: 1 }));
    expect(ids(passend)).toEqual(['een']);
    expect(ids(andere)).toEqual(['twee']);
  });

  it('zonder klasrichting (of met een ongeldige) is alles "andere", in dezelfde volgorde', () => {
    expect(cursussenVoorToewijzen(courses, [lp])).toEqual({ passend: [], andere: courses });
    const kapot = { groep: 'x', titel: 'x', soort: 'so' } as Doelgroep;
    expect(cursussenVoorToewijzen(courses, [lp], kapot)).toEqual({ passend: [], andere: courses });
  });

  it('wijzigt de invoer niet en geeft nieuwe lijsten', () => {
    const kopie = [...courses];
    const uit = cursussenVoorToewijzen(courses, [lp], NW(4));
    expect(courses).toEqual(kopie);
    expect(uit.andere).not.toBe(courses);
  });
});

// ── klassenVoorToewijzen ────────────────────────────────────────────────────

describe('klassenVoorToewijzen', () => {
  const klassen = [
    klas('k1', '4NWA', NW(4)),
    klas('k2', '3NWA', NW(3)),
    klas('k3', 'Zonder richting'),
    klas('k4', 'Hele graad', NW()),
    klas('k5', 'Humane', dg('G-0117', { graad: 2, jaar: 4 })),
  ];

  it('passend zijn de klassen met de richting van de cursus, in de volgorde van de klassen', () => {
    const { passend, andere } = klassenVoorToewijzen(klassen, NW(4));
    expect(ids(passend)).toEqual(['k1', 'k4']);
    expect(ids(andere)).toEqual(['k2', 'k3', 'k5']);
  });

  it('een cursus zonder jaar past bij elke klas van de richting', () => {
    const { passend, andere } = klassenVoorToewijzen(klassen, NW());
    expect(ids(passend)).toEqual(['k1', 'k2', 'k4']);
    expect(ids(andere)).toEqual(['k3', 'k5']);
  });

  it('zonder doelgroep van de cursus is alles "andere"', () => {
    expect(klassenVoorToewijzen(klassen)).toEqual({ passend: [], andere: klassen });
  });
});

// ── klassenVanRichting ──────────────────────────────────────────────────────

describe('klassenVanRichting', () => {
  it('geeft de klassen van die richting en soort, op jaar en dan op naam', () => {
    const klassen = [
      klas('k1', '4NWB', NW(4)),
      klas('k2', '3NWA', NW(3)),
      klas('k3', '4NWA', NW(4)),
      klas('k4', 'Andere richting', dg('G-0117', { graad: 2, jaar: 4 })),
      klas('k5', 'Zonder richting'),
      klas('k6', 'Buso', NW(4, { soort: 'buso' })),
    ];
    expect(ids(klassenVanRichting(klassen, 'G-0193', 'so'))).toEqual(['k2', 'k3', 'k1']);
    expect(ids(klassenVanRichting(klassen, 'G-0193', 'buso'))).toEqual(['k6']);
    expect(ids(klassenVanRichting(klassen, 'G-0117', 'so'))).toEqual(['k4']);
    expect(klassenVanRichting(klassen, 'G-9999', 'so')).toEqual([]);
  });

  it('een klas voor de hele graad komt na de klassen met een jaar', () => {
    const klassen = [klas('k1', 'A hele graad', NW()), klas('k2', 'Z vierde', NW(4)), klas('k3', 'M derde', NW(3))];
    expect(ids(klassenVanRichting(klassen, 'G-0193', 'so'))).toEqual(['k3', 'k2', 'k1']);
  });

  it('de naam sorteert natuurlijk en zonder verschil in hoofdletters', () => {
    const klassen = [klas('k1', '4NW10', NW(4)), klas('k2', '4nw2', NW(4)), klas('k3', '4NW1', NW(4))];
    expect(ids(klassenVanRichting(klassen, 'G-0193', 'so'))).toEqual(['k3', 'k2', 'k1']);
  });

  it('1A en 2A zijn twee richtingen', () => {
    const klassen = [klas('k1', '1A', dg('G-0307', { graad: 1, jaar: 1 })), klas('k2', '2A', dg('G-0311', { graad: 1, jaar: 2 }))];
    expect(ids(klassenVanRichting(klassen, 'G-0307', 'so'))).toEqual(['k1']);
    expect(ids(klassenVanRichting(klassen, 'G-0311', 'so'))).toEqual(['k2']);
  });

  it('gelijke klassen houden hun volgorde, en de invoer blijft zoals ze was', () => {
    const klassen = [klas('k1', 'Zelfde', NW(4)), klas('k2', 'Zelfde', NW(4)), klas('k3', 'zelfde', NW(4))];
    const kopie = [...klassen];
    expect(ids(klassenVanRichting(klassen, 'G-0193', 'so'))).toEqual(['k1', 'k2', 'k3']);
    expect(klassen).toEqual(kopie);
  });
});
