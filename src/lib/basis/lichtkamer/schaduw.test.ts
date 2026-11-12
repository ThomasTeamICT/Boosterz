import { describe, expect, it } from 'vitest';
import {
  LENS_AFSTAND,
  SIL_TOP,
  VOORWERPEN,
  afstandCm,
  beschrijfSchaduw,
  kantVanLamp,
  lampZVoorAfstand,
  lensVan,
  schaduwHoogteBijAfstandCm,
  schaduwHoogteCm,
  schaduwPunt,
} from './schaduw';

describe('schaduwPunt', () => {
  it('rekent de lichtstraal door voor een lamp links van het voorwerp', () => {
    // lamp op (-1,2 ; 0,5 ; 2,17), punt (0 ; 0,7) op z = 1: de straal komt rechts van het midden op het scherm
    const s = schaduwPunt({ x: -1.2, y: 0.5, z: 2.17 }, 0, 0.7, 1);
    const f = 2.17 / 1.17;
    expect(s.x).toBeCloseTo(-1.2 + 1.2 * f, 12);
    expect(s.y).toBeCloseTo(0.5 + 0.2 * f, 12);
    expect(s.x).toBeGreaterThan(0);
  });

  it('een lamp recht voor het voorwerp geeft een schaduw recht erachter', () => {
    expect(schaduwPunt({ x: 0, y: 0.5, z: 2 }, 0, 1, 1).x).toBe(0);
  });

  it('een punt in het vlak van het scherm blijft staan', () => {
    const s = schaduwPunt({ x: 0.4, y: 0.5, z: 3 }, 0.1, 0.9, 0);
    expect(s.x).toBeCloseTo(0.1, 12);
    expect(s.y).toBeCloseTo(0.9, 12);
  });
});

describe('schaduwhoogte, nagerekend tegen het prototype', () => {
  // y = 0,5 + (top - 0,5) * (1 + d) / d, met d de afstand lens-voorwerp in 10 cm; hoogte in cm = y * 10
  const verwacht: Record<string, Record<number, number>> = {
    boom: { 30: 35 / 3, 20: 12.5, 15: 40 / 3, 10: 15 },
    huis: { 30: 35 / 3, 20: 12.5, 15: 40 / 3, 10: 15 },
    kind: { 30: 11.4, 20: 12.2, 15: 13.0, 10: 14.6 },
  };
  for (const v of VOORWERPEN) {
    for (const cm of [30, 20, 15, 10]) {
      it(`${v} bij ${cm} cm`, () => {
        expect(schaduwHoogteBijAfstandCm(cm, v)).toBeCloseTo(verwacht[v]![cm]!, 9);
      });
    }
  }

  it('de lamp met handgreep geeft dezelfde hoogte als de lens op dezelfde afstand', () => {
    for (const v of VOORWERPEN)
      for (const cm of [30, 15, 10]) {
        const lamp = { x: 0, y: 0.5, z: lampZVoorAfstand(cm) };
        expect(schaduwHoogteCm(lamp, v)).toBeCloseTo(schaduwHoogteBijAfstandCm(cm, v), 9);
        expect(afstandCm(lamp)).toBe(cm);
      }
  });

  it('LENS_AFSTAND is 0,23, zoals de spot op -0,23 in tools/prototypes/lichtkamer/lk-wereld.js', () => {
    expect(LENS_AFSTAND).toBe(0.23);
  });

  it('de lens zit LENS_AFSTAND vóór de lamp', () => {
    expect(lensVan({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 - LENS_AFSTAND });
  });

  it('hoe dichter de lamp, hoe hoger de schaduw', () => {
    for (const v of VOORWERPEN) {
      const h = [30, 20, 15, 10].map((cm) => schaduwHoogteBijAfstandCm(cm, v));
      for (let i = 1; i < h.length; i++) expect(h[i]).toBeGreaterThan(h[i - 1]!);
    }
  });

  it('elke silhouet heeft de top als eerste punt', () => {
    for (const v of VOORWERPEN) expect(SIL_TOP[v][0]![0]).toBe(0);
  });
});

describe('beschrijfSchaduw', () => {
  it('lamp links', () => {
    expect(beschrijfSchaduw({ x: -1.2, y: 0.5, z: 2.4 }, 'boom')).toBe(
      'De zaklamp staat links van het boompje, op 12 centimeter ervan. De schaduw valt rechts op het scherm en is ongeveer 14 centimeter hoog.',
    );
  });
  it('lamp rechts, met het kartonnen kind', () => {
    expect(beschrijfSchaduw({ x: 1.0, y: 0.5, z: 1.8 }, 'kind')).toBe(
      'De zaklamp staat rechts van het kartonnen kind, op 6 centimeter ervan. De schaduw valt links op het scherm en is ongeveer 18 centimeter hoog.',
    );
  });
  it('lamp recht voor het voorwerp', () => {
    expect(beschrijfSchaduw({ x: 0, y: 0.5, z: lampZVoorAfstand(30) }, 'huis')).toBe(
      'De zaklamp staat recht voor het huisje, op 30 centimeter ervan. De schaduw valt recht achter het voorwerp op het scherm en is ongeveer 12 centimeter hoog.',
    );
  });
  it('verborgen schaduw', () => {
    expect(beschrijfSchaduw({ x: 0, y: 0.5, z: lampZVoorAfstand(10) }, 'boom', true)).toBe(
      'De zaklamp staat recht voor het boompje, op 10 centimeter ervan. De schaduw is verborgen.',
    );
  });
  it('de kant van de lamp heeft een dode zone van 1,5 cm rond het midden', () => {
    expect(kantVanLamp({ x: -0.15, y: 0.5, z: 2 })).toBe('recht');
    expect(kantVanLamp({ x: 0.15, y: 0.5, z: 2 })).toBe('recht');
    expect(kantVanLamp({ x: -0.16, y: 0.5, z: 2 })).toBe('links');
    expect(kantVanLamp({ x: 0.16, y: 0.5, z: 2 })).toBe('rechts');
  });
});
