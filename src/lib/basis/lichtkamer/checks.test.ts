import { describe, expect, it } from 'vitest';
import { CHECKS_4, juisteIndex, kijkCheckNa } from './checks';

describe('CHECKS_4', () => {
  it('drie vragen, 4c1 tot 4c3, allemaal bij doel 92767', () => {
    expect(CHECKS_4.map((v) => v.id)).toEqual(['4c1', '4c2', '4c3']);
    expect(CHECKS_4.every((v) => v.doel === '92767')).toBe(true);
  });

  it('elke vraag heeft precies één juist antwoord en een foutpatroon bij elk fout antwoord', () => {
    for (const v of CHECKS_4) {
      expect(v.opties.filter((o) => o.juist)).toHaveLength(1);
      for (const o of v.opties) expect(!!o.juist !== !!o.fout, `${v.id} ${o.t}`).toBe(true);
    }
  });

  it('de juiste antwoorden: 4c1 C, 4c2 groter, 4c3 A', () => {
    expect(CHECKS_4.map((v) => v.opties[juisteIndex(v)]!.t)).toEqual(['C', 'groter', 'A']);
  });

  it('4c3 heeft uitleg bij de prent', () => {
    expect(CHECKS_4[2]!.uitleg).toContain('Kaartje 1 staat het dichtst bij de lamp');
  });
});

describe('kijkCheckNa', () => {
  const [c1, c2, c3] = CHECKS_4 as [(typeof CHECKS_4)[number], (typeof CHECKS_4)[number], (typeof CHECKS_4)[number]];

  it('juist antwoord', () => {
    const u = kijkCheckNa(c1, 2);
    expect(u).toMatchObject({ juist: true, fout: null, soort: 'ok', titel: 'Juist.', uitleg: null, spreek: 'Juist', vraagId: '4c1' });
    expect(u.bewijs).toEqual({ juist: true, fout: null, doel: '92767', keuze: 2 });
  });

  it('fout antwoord: het juiste antwoord erbij, en het foutpatroon in het bewijs', () => {
    const u = kijkCheckNa(c1, 0);
    expect(u).toMatchObject({ juist: false, fout: 'schaduw aan de kant van de lamp', soort: 'warn', titel: 'Nog niet.', juisteIdx: 2 });
    expect(u.uitleg).toBe('Het juiste antwoord is C: de schaduw valt rechts op het scherm.');
    expect(u.spreek).toBe('Nog niet. Het juiste antwoord is C: de schaduw valt rechts op het scherm');
    expect(u.bewijs).toEqual({ juist: false, fout: 'schaduw aan de kant van de lamp', doel: '92767', keuze: 0 });
  });

  it('zonder label staat de tekst van de knop in het juiste antwoord', () => {
    const u = kijkCheckNa(c2, 1);
    expect(u.uitleg).toBe('Het juiste antwoord is groter.');
    expect(u.fout).toBe('verwacht een kleinere schaduw als de lamp dichterbij staat');
  });

  it('4c3: de foutpatronen van de spiekkaart', () => {
    expect(kijkCheckNa(c3, 1).fout).toBe('zet de gaatjes even hoog, niet op één lijn met de lamp');
    expect(kijkCheckNa(c3, 2).fout).toBe('verwacht dat licht een bocht maakt');
  });

  it('bij een eerder antwoord: "Je eerste antwoord telt"', () => {
    expect(kijkCheckNa(c2, 0, true).titel).toBe('Je eerste antwoord telt: juist.');
    expect(kijkCheckNa(c2, 1, true).titel).toBe('Je eerste antwoord telt: nog niet.');
  });

  it('weigert een keuze die niet bestaat', () => {
    expect(() => kijkCheckNa(c1, 3)).toThrow(RangeError);
    expect(() => kijkCheckNa(c1, -1)).toThrow(RangeError);
    expect(() => kijkCheckNa(c1, 1.5)).toThrow(RangeError);
  });
});
