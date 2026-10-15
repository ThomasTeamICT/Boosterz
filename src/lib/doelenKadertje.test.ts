// Het doelenkadertje van een sectie volgt de doelen van die sectie (punt c van pakket Q2), zonder een kadertje aan te
// raken dat de leerkracht zelf aanpaste.

import { describe, expect, it } from 'vitest';
import type { CourseBlock } from './courseTypes';
import { createCurriculum } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import { doelenKadertjeTekst, doelRegel, werkDoelenKadertjeBij } from './doelenKadertje';
import { geraamteHoofdstukken } from './richtingCursus';

function leerplanMet(goals: { code: string; text: string; theme?: string }[]): Curriculum {
  return createCurriculum({
    title: 'Testleerplan', net: 'minimumdoelen', subject: '', level: '',
    goals: goals.map((g, i) => ({ id: `g${i}`, ...g })),
  });
}

describe('doelRegel', () => {
  it('"<code> — <volledige zin>", met witruimte als één spatie, of alleen de code zonder tekst', () => {
    expect(doelRegel('A1', '  Eerste\n  regel.  ')).toBe('A1 — Eerste regel.');
    expect(doelRegel('A1', '')).toBe('A1');
    expect(doelRegel('A1', undefined)).toBe('A1');
  });
});

describe('doelenKadertjeTekst', () => {
  it('geeft per code een regel in de volgorde van de codes en slaat onbekende codes over', () => {
    const lp = leerplanMet([{ code: 'A1', text: 'Een.' }, { code: 'B2', text: 'Twee.' }]);
    expect(doelenKadertjeTekst(['b2', 'ONBEKEND', 'A1', 'a1'], lp)).toBe('B2 — Twee.\nA1 — Een.');
    expect(doelenKadertjeTekst(undefined, lp)).toBe('');
    expect(doelenKadertjeTekst([], lp)).toBe('');
  });
});

describe('werkDoelenKadertjeBij: het kadertje met de doelen volgt de doelen van de sectie', () => {
  const LANG_A = 'De leerlingen passen technieken voor levensreddend handelen toe in een gesimuleerde leeromgeving en lichten hun keuzes toe.';
  const LANG_B = 'De leerlingen analyseren demografische processen en verklaren de oorzaken en gevolgen ervan voor een regio of een land.';
  const LANG_C = 'De leerlingen bespreken kritisch hoe mensen met elkaar omgaan en hoe ze samen afspraken maken in een groep.';
  const lp = leerplanMet([
    { code: 'A1', text: LANG_A, theme: 'Vak › Rubriek' },
    { code: 'B2', text: LANG_B, theme: 'Vak › Rubriek' },
    { code: 'C3', text: LANG_C, theme: 'Vak › Rubriek' },
  ]);

  /** Het kadertje zoals het geraamte het voor deze codes zet. */
  const geraamteKadertje = (codes: string[]): CourseBlock => {
    const ch = geraamteHoofdstukken(lp, codes);
    return ch[0].sections[0].blocks[0];
  };
  const tekstVan = (blokken: readonly CourseBlock[], i = 0): string => {
    const b = blokken[i];
    return b.type === 'callout' ? b.text : '';
  };
  const eigenTekst: CourseBlock = { id: 'eigen', type: 'text', markdown: 'Eigen uitleg van de leerkracht.' };

  it('een doel loskoppelen: het kadertje toont alleen nog de overgebleven doelen, in volledige zinnen', () => {
    const blokken = [geraamteKadertje(['A1', 'B2', 'C3']), eigenTekst];
    const uit = werkDoelenKadertjeBij(blokken, ['A1', 'B2', 'C3'], ['A1', 'C3'], lp);
    expect(tekstVan(uit)).toBe(`A1 — ${LANG_A}\nC3 — ${LANG_C}`);
    // De rest van de sectie en de rest van het blok blijven gelijk (zelfde id, titel en soort).
    expect(uit[0]).toMatchObject({ id: blokken[0].id, type: 'callout', kind: 'goal', title: 'Doelen in deze sectie' });
    expect(uit[1]).toBe(eigenTekst);
    // De oorspronkelijke blokken zijn niet aangepast.
    expect(tekstVan(blokken)).toContain('B2 — ');
  });

  it('een doel toevoegen: het komt in het kadertje, in de volgorde van de codes van de sectie', () => {
    const blokken = [geraamteKadertje(['A1'])];
    const uit = werkDoelenKadertjeBij(blokken, ['A1'], ['A1', 'C3'], lp);
    expect(tekstVan(uit)).toBe(`A1 — ${LANG_A}\nC3 — ${LANG_C}`);
    // En het resultaat is weer wat het geraamte voor die codes zou zetten: een volgende wijziging werkt dus ook.
    expect(tekstVan(uit)).toBe(tekstVan([geraamteKadertje(['A1', 'C3'])]));
    expect(tekstVan(werkDoelenKadertjeBij(uit, ['A1', 'C3'], ['C3'], lp))).toBe(`C3 — ${LANG_C}`);
  });

  it('codes in kleine letters of met spaties worden genormaliseerd; een code die niet in het leerplan staat, krijgt geen regel', () => {
    const blokken = [geraamteKadertje(['A1'])];
    const uit = werkDoelenKadertjeBij(blokken, [' a1 '], ['a1', 'b2', 'NIET IN HET LEERPLAN'], lp);
    expect(tekstVan(uit)).toBe(`A1 — ${LANG_A}\nB2 — ${LANG_B}`);
  });

  it('een kadertje van een oudere cursus (doeltekst afgekapt op 90 tekens) wordt herkend en bijgewerkt', () => {
    const oud = (code: string, tekst: string) => `${code} — ${tekst.slice(0, 89)}…`;
    const blokken: CourseBlock[] = [{ id: 'k', type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text: `${oud('A1', LANG_A)}\n${oud('B2', LANG_B)}` }];
    const uit = werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['A1'], lp);
    expect(tekstVan(uit)).toBe(`A1 — ${LANG_A}`);
  });

  it('alle doelen losgekoppeld: de tekst wordt leeg, het blok blijft, en bij een nieuw doel wordt het weer gevuld', () => {
    const blokken = [geraamteKadertje(['A1'])];
    const leeg = werkDoelenKadertjeBij(blokken, ['A1'], [], lp);
    expect(leeg).toHaveLength(1);
    expect(tekstVan(leeg)).toBe('');
    const weer = werkDoelenKadertjeBij(leeg, [], ['B2'], lp);
    expect(tekstVan(weer)).toBe(`B2 — ${LANG_B}`);
  });

  describe('een kadertje dat de leerkracht zelf aanpaste, blijft altijd zoals het is', () => {
    const geraamteTekst = (codes: string[]) => tekstVan([geraamteKadertje(codes)]);
    const metTekst = (text: string, extra: Partial<Extract<CourseBlock, { type: 'callout' }>> = {}): CourseBlock[] => [
      { id: 'k', type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text, ...extra },
    ];

    it('extra tekst erbij, een regel weg, een woord veranderd of de volgorde omgedraaid', () => {
      const basis = geraamteTekst(['A1', 'B2']);
      const [eerste, tweede] = basis.split('\n');
      const aangepast = [
        `${basis}\nMijn eigen opmerking.`,
        `Let op dit doel!\n${basis}`,
        eerste,
        `${tweede}\n${eerste}`,
        basis.replace('analyseren', 'bestuderen'),
        `${basis} `,
        basis.toLowerCase(),
      ];
      for (const text of aangepast) {
        const blokken = metTekst(text);
        expect(werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['A1'], lp)).toBe(blokken);
      }
    });

    it('een andere titel of een ander soort kadertje (tip, info, de kennis en vaardigheden uit een beroepskwalificatie)', () => {
      const tekst = geraamteTekst(['A1', 'B2']);
      const andere: CourseBlock[][] = [
        metTekst(tekst, { title: 'Wat leer je hier?' }),
        metTekst(tekst, { title: 'Kennis en vaardigheden uit de beroepskwalificatie' }),
        metTekst(tekst, { title: undefined }),
        metTekst(tekst, { kind: 'info' }),
        metTekst(tekst, { kind: 'tip' }),
        metTekst(tekst, { kind: 'warn' }),
      ];
      for (const blokken of andere) {
        expect(werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['A1'], lp)).toBe(blokken);
      }
    });

    it('een tekstblok of een ander soort blok met dezelfde tekst wordt niet aangeraakt', () => {
      const blokken: CourseBlock[] = [{ id: 't', type: 'text', markdown: geraamteTekst(['A1', 'B2']) }];
      expect(werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['A1'], lp)).toBe(blokken);
    });

    it('de codes van de sectie passen niet bij het kadertje (het was al niet meer bijgewerkt): niets aanraken', () => {
      const blokken = metTekst(geraamteTekst(['A1', 'B2', 'C3']));
      expect(werkDoelenKadertjeBij(blokken, ['A1', 'C3'], ['A1'], lp)).toBe(blokken);
    });

    it('zonder leerplan, of met een leerplan waarin de vorige codes niet staan: niets aanraken', () => {
      const blokken = metTekst(geraamteTekst(['A1', 'B2']));
      expect(werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['A1'], undefined)).toBe(blokken);
      const ander = leerplanMet([{ code: 'Z9', text: 'Iets anders.', theme: 'Vak' }]);
      expect(werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['Z9'], ander)).toBe(blokken);
    });

    it('verandert er niets (dezelfde codes), dan komt dezelfde lijst terug', () => {
      const blokken = metTekst(geraamteTekst(['A1', 'B2']));
      expect(werkDoelenKadertjeBij(blokken, ['A1', 'B2'], ['A1', 'B2'], lp)).toBe(blokken);
      expect(werkDoelenKadertjeBij([], ['A1'], ['B2'], lp)).toEqual([]);
    });
  });
});

describe('werkDoelenKadertjeBij: zuinig met het leerplan (O6)', () => {
  /** Een leerplan waarvan de doelen tellen hoe vaak ze doorzocht of doorlopen worden. */
  function metTeller(goals: { code: string; text: string }[]): { lp: Curriculum; toegang: () => number } {
    let n = 0;
    const lijst = new Proxy(goals.map((g, i) => ({ id: `g${i}`, ...g })), {
      get(doel, prop, ontvanger) {
        if (prop === 'find' || prop === 'filter' || prop === 'some' || prop === Symbol.iterator) n++;
        return Reflect.get(doel, prop, ontvanger);
      },
    });
    const lp = createCurriculum({ title: 'T', net: 'minimumdoelen', subject: '', level: '' });
    lp.goals = lijst;
    return { lp, toegang: () => n };
  }
  const doelen = Array.from({ length: 300 }, (_, i) => ({ code: `D${i + 1}`, text: `Doel ${i + 1}.` }));
  const kadertje = (codes: string[], lp: Curriculum): CourseBlock => geraamteHoofdstukken(lp, codes)[0].sections[0].blocks[0];

  it('zonder kadertje van het geraamte geeft ze dezelfde lijst terug, zonder het leerplan te doorzoeken', () => {
    const { lp, toegang } = metTeller(doelen);
    const blokken: CourseBlock[] = [{ id: 't', type: 'text', markdown: 'Eigen tekst.' }, { id: 'k', type: 'callout', kind: 'goal', title: 'Mijn doelen', text: 'D1' }];
    expect(werkDoelenKadertjeBij(blokken, ['D1'], ['D1', 'D2'], lp)).toBe(blokken);
    expect(toegang()).toBe(0);
  });

  it('met een kadertje bouwt ze het leerplan één keer om, ook bij 300 codes', () => {
    const { lp, toegang } = metTeller(doelen);
    const codes = doelen.map((d) => d.code);
    const start = toegang(); // het kadertje hieronder doorloopt het leerplan zelf ook
    const blok = kadertje(codes, lp);
    const na = toegang();
    expect(na).toBeGreaterThan(start);
    const uit = werkDoelenKadertjeBij([blok], codes, codes.slice(1), lp);
    expect(toegang() - na).toBeLessThanOrEqual(1);
    const tekst = uit[0].type === 'callout' ? uit[0].text : '';
    expect(tekst.split('\n')).toHaveLength(299);
    expect(tekst.startsWith('D2 — Doel 2.')).toBe(true);
  });

  it('bij een dubbele code in het leerplan wint het eerste doel, zoals in het geraamte', () => {
    const lp = leerplanMet([{ code: 'A1', text: 'Eerste.' }, { code: 'a1', text: 'Tweede.' }, { code: 'B2', text: 'Derde.' }]);
    expect(doelenKadertjeTekst(['A1', 'B2'], lp)).toBe('A1 — Eerste.\nB2 — Derde.');
  });
});
