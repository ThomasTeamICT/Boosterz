import { describe, expect, it } from 'vitest';
import { leesMeting } from './meting';

describe('leesMeting', () => {
  it('komma en punt geven hetzelfde: nooit 125', () => {
    expect(leesMeting('12,5')).toBe(12.5);
    expect(leesMeting('12.5')).toBe(12.5);
    expect(leesMeting('12')).toBe(12);
    expect(leesMeting('0,5')).toBe(0.5);
    expect(leesMeting('14,6')).toBe(14.6);
  });

  it('randgevallen die toch een getal zijn', () => {
    expect(leesMeting('  12,5  ')).toBe(12.5);
    expect(leesMeting('12,5 cm')).toBe(12.5);
    expect(leesMeting('12,5cm')).toBe(12.5);
    expect(leesMeting('12 CM')).toBe(12);
    expect(leesMeting(',5')).toBe(0.5);
    expect(leesMeting('.5')).toBe(0.5);
    expect(leesMeting('12,')).toBe(12);
    expect(leesMeting('12.')).toBe(12);
    expect(leesMeting('0')).toBe(0);
    expect(leesMeting('007,5')).toBe(7.5);
    expect(leesMeting('11,666')).toBeCloseTo(11.666, 12);
  });

  it('een getal als getal blijft staan', () => {
    expect(leesMeting(12.5)).toBe(12.5);
    expect(leesMeting(0)).toBe(0);
    expect(leesMeting(-1)).toBeNull();
    expect(leesMeting(Number.NaN)).toBeNull();
    expect(leesMeting(Infinity)).toBeNull();
  });

  it('geeft null voor wat geen meting is', () => {
    for (const x of ['', ' ', '   ', 'abc', 'cm', ',', '.', '-', '-3', '+3', '1e3', '12,5,3', '12.5.3', '1.250,5', '1,250.5', '12 5', '12,5 cmm', '12,5x', '١٢', '0x10', 'NaN', 'Infinity'])
      expect(leesMeting(x), JSON.stringify(x)).toBeNull();
    for (const x of [null, undefined, {}, [], true, false]) expect(leesMeting(x)).toBeNull();
  });

  it('elke aflezing van 0,5 cm tot 30 cm geeft in beide schrijfwijzen dezelfde waarde', () => {
    for (let k = 0; k <= 60; k++) {
      const v = k / 2;
      const punt = String(v);
      expect(leesMeting(punt)).toBe(v);
      expect(leesMeting(punt.replace('.', ','))).toBe(v);
    }
  });
});
