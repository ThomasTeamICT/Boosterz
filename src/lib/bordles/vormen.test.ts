import { describe, expect, it } from 'vitest';
import { lijnDuur, padVoor, tekstAnker, tekstDuur, verplaatsDuur, voorleesTekst, vulPad, zacht } from './vormen';

describe('padVoor', () => {
  it('maakt een lijn', () => {
    expect(padVoor({ soort: 'lijn', van: [0, 0], naar: [10, 5] })).toBe('M0 0 L10 5');
  });
  it('sluit een veelhoek tenzij gesloten false', () => {
    expect(padVoor({ soort: 'veelhoek', punten: [[0, 0], [10, 0], [0, 10]] })).toBe('M0 0 L10 0 L0 10 Z');
    expect(padVoor({ soort: 'veelhoek', punten: [[0, 0], [10, 0]], gesloten: false })).toBe('M0 0 L10 0');
  });
  it('tekent een cirkel als twee bogen vanaf de top', () => {
    expect(padVoor({ soort: 'cirkel', midden: [50, 50], straal: 10 })).toBe('M50 40 A10 10 0 1 1 50 60 A10 10 0 1 1 50 40');
  });
  it('geeft een pijl een punt die op het einde aansluit', () => {
    const d = padVoor({ soort: 'pijl', van: [0, 0], naar: [100, 0] });
    expect(d.startsWith('M0 0 L100 0 M')).toBe(true);
    // twee lijntjes van de punt: ze komen samen op het eindpunt en liggen links ervan
    expect(d).toBe('M0 0 L100 0 M87.4 6.1 L100 0 L87.4 -6.1');
  });
  it('vult alleen een gesloten veelhoek met vulling', () => {
    expect(vulPad({ soort: 'veelhoek', punten: [[0, 0], [1, 0], [0, 1]], vulling: true })).not.toBeNull();
    expect(vulPad({ soort: 'veelhoek', punten: [[0, 0], [1, 0], [0, 1]] })).toBeNull();
  });
});

describe('timing', () => {
  it('is trager bij traag en nooit nul', () => {
    expect(lijnDuur(330, 'normaal')).toBeCloseTo(1000);
    expect(lijnDuur(330, 'traag')).toBeGreaterThan(lijnDuur(330, 'snel'));
    expect(lijnDuur(1, 'snel')).toBeGreaterThanOrEqual(220);
    expect(tekstDuur(10, 'normaal')).toBeCloseTo(1000);
    expect(verplaatsDuur(10000, 'traag')).toBe(520);
    expect(verplaatsDuur(0, 'snel')).toBe(110);
  });
  it('zacht loopt van 0 naar 1', () => {
    expect(zacht(0)).toBe(0); expect(zacht(1)).toBe(1); expect(zacht(0.5)).toBeCloseTo(0.5);
  });
});

describe('tekst', () => {
  it('kiest het anker', () => {
    expect(tekstAnker()).toBe('start'); expect(tekstAnker('midden')).toBe('middle'); expect(tekstAnker('rechts')).toBe('end');
  });
  it('leest wiskundetekens in woorden voor', () => {
    expect(voorleesTekst('c² = √25 = 5 · 1')).toBe('c kwadraat = wortel van 25 = 5  maal  1');
  });
});
