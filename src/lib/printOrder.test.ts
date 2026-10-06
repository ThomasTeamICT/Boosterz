import { describe, expect, it } from 'vitest';
import {
  inversePermutation, matchKeyLetters, orderKeyPlaces, placeLetter, printOrdered, printPermutation,
} from './printOrder';

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);
const isIdentity = (perm: number[]) => perm.every((v, k) => v === k);

describe('printPermutation', () => {
  it('is deterministisch: zelfde zaad en lengte geven dezelfde volgorde', () => {
    for (const seed of ['abc', 'q1', 'k3x9f2lm', '']) {
      for (const n of [2, 3, 5, 9]) {
        expect(printPermutation(n, seed)).toEqual(printPermutation(n, seed));
      }
    }
  });

  it('geeft altijd een geldige permutatie van 0..n-1', () => {
    for (let n = 0; n <= 14; n++) {
      for (let s = 0; s < 40; s++) {
        const perm = printPermutation(n, `vraag-${s}`);
        expect(perm).toHaveLength(n);
        expect([...perm].sort((a, b) => a - b)).toEqual(identity(n));
      }
    }
  });

  it('is bij twee of meer items nooit de identiteit', () => {
    for (let n = 2; n <= 12; n++) {
      for (let s = 0; s < 400; s++) {
        expect(isIdentity(printPermutation(n, `id-${s}`))).toBe(false);
      }
    }
  });

  it('twee items wisselen altijd van plaats (ook als de schudbeurt de identiteit gaf)', () => {
    // Bij n = 2 is de helft van de zaden een identiteit voor de correctie: die schuiven één plaats op.
    for (let s = 0; s < 200; s++) {
      expect(printPermutation(2, `zaad-${s}`)).toEqual([1, 0]);
    }
  });

  it('doet niets bij 0 of 1 items', () => {
    expect(printPermutation(0, 'x')).toEqual([]);
    expect(printPermutation(1, 'x')).toEqual([0]);
    expect(printPermutation(-3, 'x')).toEqual([]);
  });

  it('hangt van het zaad af: verschillende vragen krijgen verschillende volgordes', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 200; s++) seen.add(printPermutation(5, `vraag-${s}`).join(','));
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe('printOrdered', () => {
  it('geeft dezelfde items in de volgorde van de permutatie', () => {
    const items = ['Oostende', 'Gent', 'Brussel', 'Luik'];
    const perm = printPermutation(items.length, 'orden-1');
    expect(printOrdered(items, 'orden-1')).toEqual(perm.map((i) => items[i]));
    expect([...printOrdered(items, 'orden-1')].sort()).toEqual([...items].sort());
    expect(printOrdered(items, 'orden-1')).not.toEqual(items);
  });

  it('laat een lijst van één item ongemoeid', () => {
    expect(printOrdered(['alleen'], 'x')).toEqual(['alleen']);
  });
});

describe('inversePermutation', () => {
  it('is de inverse van de permutatie', () => {
    for (let n = 2; n <= 10; n++) {
      const perm = printPermutation(n, `inv-${n}`);
      const inverse = inversePermutation(perm);
      perm.forEach((designIndex, printed) => expect(inverse[designIndex]).toBe(printed));
      inverse.forEach((printed, designIndex) => expect(perm[printed]).toBe(designIndex));
    }
  });
});

describe('placeLetter', () => {
  it('telt zoals lower-alpha: a..z, aa, ab, …', () => {
    expect(placeLetter(0)).toBe('a');
    expect(placeLetter(1)).toBe('b');
    expect(placeLetter(25)).toBe('z');
    expect(placeLetter(26)).toBe('aa');
    expect(placeLetter(27)).toBe('ab');
    expect(placeLetter(51)).toBe('az');
    expect(placeLetter(52)).toBe('ba');
  });
});

describe('correctiesleutel', () => {
  const pairs = [
    { left: 'Brugge', right: 'West-Vlaanderen' },
    { left: 'Hasselt', right: 'Limburg' },
    { left: 'Leuven', right: 'Vlaams-Brabant' },
    { left: 'Gent', right: 'Oost-Vlaanderen' },
    { left: 'Antwerpen', right: 'Antwerpen (provincie)' },
  ];

  it('koppelvraag: de letter bij elk linkeritem wijst naar het juiste rechteritem', () => {
    for (let s = 0; s < 50; s++) {
      const seed = `koppel-${s}`;
      const perm = printPermutation(pairs.length, seed);
      const rightColumn = perm.map((i) => pairs[i].right); // zoals afgedrukt, a, b, c, …
      const letters = matchKeyLetters(perm);
      expect(rightColumn).not.toEqual(pairs.map((p) => p.right));
      pairs.forEach((p, i) => {
        const position = letters[i].charCodeAt(0) - 97;
        expect(rightColumn[position]).toBe(p.right);
      });
    }
  });

  it('koppelvraag: een leerkracht die de sleutel volgt, verbetert alles juist', () => {
    // Leerling vult per linkeritem de letter in die de sleutel aanwijst: de speler-grader
    // verwacht dan voor elk linkeritem dat het rechteritem met dezelfde ontwerpindex gekozen is.
    const perm = printPermutation(pairs.length, 'koppel-sleutel');
    const letters = matchKeyLetters(perm);
    const chosenDesignIndex = letters.map((l) => perm[l.charCodeAt(0) - 97]);
    expect(chosenDesignIndex).toEqual(identity(pairs.length));
  });

  it('ordenvraag: de plaatsnummers van de sleutel leggen de afgedrukte items in de juiste volgorde', () => {
    const items = ['Oostende', 'Gent', 'Brussel', 'Luik'];
    for (let s = 0; s < 50; s++) {
      const perm = printPermutation(items.length, `orden-${s}`);
      const printed = printOrdered(items, `orden-${s}`);
      const places = orderKeyPlaces(perm);
      expect(printed).not.toEqual(items);
      const solved: string[] = [];
      printed.forEach((item, k) => { solved[places[k] - 1] = item; });
      expect(solved).toEqual(items);
    }
  });
});
