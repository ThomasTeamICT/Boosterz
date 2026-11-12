import { describe, expect, it } from 'vitest';
import { LETTERS, RONDES, beoordeelRonde, beschrijfLetters, beschrijfRonde, maakRonde, plaatsVan, rondesBewijs } from './rondes';
import { VOORWERPEN } from './schaduw';

describe('maakRonde', () => {
  it('ronde 1 voor het boompje: lamp links, juiste letter C rechts', () => {
    const r = maakRonde(0, 'boom');
    expect(r.juistIdx).toBe(0);
    expect(r.pos[0]).toBeGreaterThan(0.35);
    expect(plaatsVan(r, 0)).toBe('rechts');
    // de letter aan de kant van de lamp staat links
    expect(plaatsVan(r, 1)).toBe('links');
    expect(r.pos[2]).toBe(0);
    expect(beschrijfLetters(r)).toBe('Op het scherm staan drie letters: A rechts, B links, C in het midden.');
  });

  it('de letters staan in de vaste volgorde van de rondes', () => {
    expect(VOORWERPEN.map((v) => [0, 1, 2].map((i) => maakRonde(i, v).juistIdx))).toEqual([
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ]);
  });

  it('ronde 3 heeft een schaduw dicht bij het midden: de andere letters wijken uit', () => {
    const r = maakRonde(2, 'boom');
    expect(Math.abs(r.schaduwX)).toBeLessThan(0.35);
    // lamp rechts: de foute letter aan de lampkant staat 1,0 rechts van de schaduw
    expect(r.pos[1]).toBeCloseTo(r.schaduwX + 1.0, 12);
    expect(r.pos[0]).toBeCloseTo(r.schaduwX - 1.0, 12);
  });

  it('elke ronde heeft precies één juiste letter, en alle plaatsen verschillen', () => {
    for (const v of VOORWERPEN)
      for (let i = 0; i < RONDES.length; i++) {
        const r = maakRonde(i, v);
        expect(new Set(r.pos.map((x) => x.toFixed(6))).size).toBe(3);
        expect([0, 1, 2].filter((k) => beoordeelRonde(r, k).juist)).toEqual([r.juistIdx]);
        expect(r.pos[r.juistIdx]).toBeCloseTo(r.schaduwX, 12);
      }
  });

  it('weigert een ronde die niet bestaat', () => {
    expect(() => maakRonde(3, 'boom')).toThrow(RangeError);
    expect(() => maakRonde(-1, 'boom')).toThrow(RangeError);
  });

  it('beschrijft de ronde zonder de schaduw te verklappen', () => {
    const t = beschrijfRonde(maakRonde(0, 'boom'), 'boom');
    expect(t).toContain('De schaduw is verborgen.');
    expect(t).toContain('Op het scherm staan drie letters');
    expect(t).not.toContain('centimeter hoog');
  });
});

describe('beoordeelRonde', () => {
  it('juist: uitleg over het rechtdoorgaande licht', () => {
    const r = maakRonde(0, 'boom');
    const u = beoordeelRonde(r, r.juistIdx);
    expect(u).toMatchObject({ juist: true, kantFout: false, fout: null, soort: 'ok', titel: 'Juist voorspeld.' });
    expect(u.uitleg).toContain('daar is de schaduw');
  });

  it('een letter aan de kant van de lamp: de uitleg over de andere kant', () => {
    for (const v of VOORWERPEN)
      for (let i = 0; i < RONDES.length; i++) {
        const r = maakRonde(i, v);
        const kantFouten = [0, 1, 2].filter((k) => beoordeelRonde(r, k).kantFout);
        // in elke ronde is er één letter aan de kant van de lamp
        expect(kantFouten).toHaveLength(1);
        const u = beoordeelRonde(r, kantFouten[0]!);
        expect(u).toMatchObject({ juist: false, fout: 'schaduw aan de kant van de lamp', soort: 'warn', titel: 'Kijk naar de lichtstralen.' });
        expect(u.uitleg).toBe('De schaduw valt niet aan de kant van de lamp, maar aan de andere kant. Volg de rechte lijn van de lamp langs het voorwerp.');
        expect(Math.sign(r.pos[kantFouten[0]!]!)).toBe(Math.sign(r.lamp.x));
      }
  });

  it('de andere foute letter geeft de algemene uitleg', () => {
    const r = maakRonde(0, 'boom');
    const andere = [0, 1, 2].find((k) => k !== r.juistIdx && !beoordeelRonde(r, k).kantFout)!;
    const u = beoordeelRonde(r, andere);
    expect(u.fout).toBe('andere fout');
    expect(u.uitleg).toBe('Volg de rechte lijn van de lamp langs de top van het voorwerp tot op het scherm.');
  });

  it('weigert een keuze buiten A tot C', () => {
    const r = maakRonde(0, 'boom');
    expect(() => beoordeelRonde(r, 3)).toThrow(RangeError);
    expect(() => beoordeelRonde(r, -1)).toThrow(RangeError);
    expect(() => beoordeelRonde(r, 0.5)).toThrow(RangeError);
    expect(LETTERS).toEqual(['A', 'B', 'C']);
  });
});

describe('rondesBewijs', () => {
  const j = { juist: true, fout: null } as const;
  const f = { juist: false, fout: 'schaduw aan de kant van de lamp' } as const;
  it('twee van drie juist telt als juist', () => {
    expect(rondesBewijs([j, j, f])).toEqual({ juist: true, score: '2/3', fout: 'schaduw aan de kant van de lamp' });
    expect(rondesBewijs([j, j, j])).toEqual({ juist: true, score: '3/3', fout: null });
  });
  it('één van drie telt niet', () => {
    expect(rondesBewijs([f, j, f]).juist).toBe(false);
    expect(rondesBewijs([f, f, f]).score).toBe('0/3');
  });
});

describe('de rondes volgen het prototype (vastgezette waarden uit tools/prototypes/lichtkamer/lichtkamer.html)', () => {
  const POS: [number, number, number][] = [
    [1.0256, -0.9231, 0],
    [1.5789, -1.7544, 0],
    [-1.2304, 0.7696, -0.2304],
  ];
  const SCHADUW_X = [1.0256, -1.7544, -0.2304];
  const LETTER_Y: Record<string, number[]> = { boom: [0.7855, 0.8754, 0.7461], huis: [0.7855, 0.8754, 0.7461], kind: [0.7632, 0.8424, 0.7286] };

  it.each(VOORWERPEN)('%s: plaats van de letters, de schaduw en de hoogte van de letters per ronde', (voorwerp) => {
    for (let ronde = 0; ronde < 3; ronde++) {
      const r = maakRonde(ronde, voorwerp);
      r.pos.forEach((x, i) => expect(x, `ronde ${ronde}, letter ${i}`).toBeCloseTo(POS[ronde]![i]!, 4));
      expect(r.schaduwX, `ronde ${ronde}`).toBeCloseTo(SCHADUW_X[ronde]!, 4);
      expect(r.letterY, `ronde ${ronde}`).toBeCloseTo(LETTER_Y[voorwerp]![ronde]!, 4);
    }
  });
});
