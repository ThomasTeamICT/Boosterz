// Wanneer zegt het scherm dat een cursus "een beroepskwalificatie volgt" (docs/STUDIERICHTINGEN.md § 23.7.4)? De zinnen in het
// blok "Minimumdoelen" en in de lijst "Cursussen voor deze richting" verwijzen dan naar het blok "Competenties van de
// beroepskwalificaties". Dat blok telt een cursus alleen mee als haar leerplan minstens één bruikbare `bkRef` heeft
// (`dekkingBk` met `bkVerwijzingen`). Deze test houdt de lichte test van het scherm (`volgtBkCompetenties`) gelijk aan wat dat
// blok werkelijk doet: zeggen de zinnen "zie hieronder", dan staat de cursus daar ook onder "telt mee".

import { describe, expect, it } from 'vitest';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum, CurriculumGoal, CurriculumMethode } from '../../lib/curriculumTypes';
import { bkVerwijzingen, dekkingBk } from '../../lib/dekkingBk';
import { volgtBkCompetenties } from './useRichtingDekking';

function doel(i: number, extra: Partial<CurriculumGoal> = {}): CurriculumGoal {
  return { id: `g${i}`, code: `BK-0390-2.${String(i).padStart(2, '0')}`, text: `Competentie ${i}`, ...extra };
}

function leerplan(methode: CurriculumMethode, goals: unknown[]): Curriculum {
  return {
    id: 'lp1', title: 'Onthaalmedewerker', subject: 'Onthaal', level: '5de jaar', net: 'beroepskwalificaties', kind: 'officieel',
    goals, herkomst: { methode }, createdAt: 0, updatedAt: 0,
  } as unknown as Curriculum;
}

const metRef = (i: number) => doel(i, { bkRefs: [{ bk: 'BK-0390-2', id: `bkc00450${i}` }] });

/** Wat het blok "Competenties van de beroepskwalificaties" doet met een cursus met dit leerplan: telt ze mee? */
function telt(lp: Curriculum): boolean {
  const course = { id: 'c1', title: 'Cursus', curriculumId: lp.id, chapters: [] } as unknown as Course;
  const uit = dekkingBk([], [{ course, leerplan: lp }], []);
  expect(uit.cursussen).toHaveLength(1);
  return uit.cursussen[0].telt;
}

describe('volgtBkCompetenties: dezelfde keuze als het blok met competenties', () => {
  const gevallen: [string, Curriculum, boolean][] = [
    ['een BK-leerplan met competenties', leerplan('beroepskwalificatie', [metRef(1), metRef(2)]), true],
    ['een BK-leerplan waarvan maar één doel een verwijzing heeft', leerplan('beroepskwalificatie', [doel(1), metRef(2), doel(3)]), true],
    ['een BK-leerplan waarvan een doel twee verwijzingen heeft, één kapot', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [{ bk: '', id: 'x' }, { bk: 'BK-0390-2', id: 'bkc1' }] })]), true],
    // N7 (§ 23.6.7): bewaard door een oudere app of geïmporteerd, zonder `bkRefs`.
    ['een BK-leerplan zonder enige verwijzing (N7)', leerplan('beroepskwalificatie', [doel(1), doel(2)]), false],
    ['een BK-leerplan zonder doelen', leerplan('beroepskwalificatie', []), false],
    ['een BK-leerplan met een lege lijst verwijzingen', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [] })]), false],
    ['een BK-leerplan met verwijzingen zonder bk', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [{ bk: '', id: 'bkc1' }] })]), false],
    ['een BK-leerplan met verwijzingen met alleen spaties', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [{ bk: 'BK-0390-2', id: '  ' }] })]), false],
    ['een BK-leerplan met verwijzingen zonder id', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [{ bk: 'BK-0390-2' } as never] })]), false],
    ['een BK-leerplan met een verwijzing met een getal als id', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [{ bk: 'BK-0390-2', id: 45062 } as never] })]), false],
    ['een BK-leerplan met `bkRefs` die geen lijst is', leerplan('beroepskwalificatie', [doel(1, { bkRefs: { bk: 'BK-0390-2', id: 'bkc1' } as never })]), false],
    ['een BK-leerplan met rare elementen in `bkRefs`', leerplan('beroepskwalificatie', [doel(1, { bkRefs: [null, 7, 'tekst', [], ['BK-0390-2', 'bkc1']] as never })]), false],
    ['een BK-leerplan waarvan de doelen geen lijst zijn', { ...leerplan('beroepskwalificatie', []), goals: 'kapot' } as unknown as Curriculum, false],
    ['een leerplan van een net', leerplan('pdf', [doel(1)]), false],
    ['een officiële set', leerplan('officieel', [doel(1, { refs: [{ set: 'ODS_1', id: '1', code: '01' }] })]), false],
    ['een samengestelde lijst', leerplan('samengesteld', [doel(1, { refs: [{ set: 'ODS_1', id: '1', code: '01' }] })]), false],
  ];

  it.each(gevallen)('%s', (_naam, lp, verwacht) => {
    expect(volgtBkCompetenties(lp)).toBe(verwacht);
    // Het blok met competenties telt de cursus precies dan mee: de zinnen verwijzen dus nooit naar een blok dat haar afwijst.
    expect(telt(lp)).toBe(verwacht);
  });

  it('bkVerwijzingen en het scherm zijn het eens over elk doel van de gevallen', () => {
    for (const [, lp] of gevallen) {
      const goals = Array.isArray(lp.goals) ? lp.goals : [];
      const overal = goals.some((g) => g && typeof g === 'object' && bkVerwijzingen(g as CurriculumGoal).length > 0);
      expect(volgtBkCompetenties(lp)).toBe(overal);
    }
  });

  it('rare doelen in kapotte opslag geven geen fout (de dekking zelf rekent alleen met opgeslagen, geschoonde leerplannen)', () => {
    expect(volgtBkCompetenties(leerplan('beroepskwalificatie', [null, 7, 'tekst', metRef(2)]))).toBe(true);
    expect(volgtBkCompetenties(leerplan('beroepskwalificatie', [null, 7, 'tekst']))).toBe(false);
  });

  it('zonder leerplan volgt een cursus geen beroepskwalificatie, en rare invoer geeft geen fout', () => {
    expect(volgtBkCompetenties(undefined)).toBe(false);
    expect(volgtBkCompetenties(null as unknown as Curriculum)).toBe(false);
    expect(volgtBkCompetenties({} as unknown as Curriculum)).toBe(false);
  });
});
