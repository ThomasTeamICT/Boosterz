import { describe, expect, it } from 'vitest';
import { AFDRUK_ATTRIBUUT, koppelAfdruk, openVoorAfdruk, sluitNaAfdruk, type DetailsLike, type WortelLike } from './afdruk';

/** Een nagebootste details: `open` en het markeringsattribuut, en een kiezer die op die twee kijkt. */
function maakDetails(open: boolean) {
  const attributen = new Map<string, string>();
  const d: DetailsLike & { attributen: Map<string, string> } = {
    open,
    attributen,
    setAttribute: (n, w) => void attributen.set(n, w),
    removeAttribute: (n) => void attributen.delete(n),
  };
  return d;
}
function maakWortel(...lijst: ReturnType<typeof maakDetails>[]): WortelLike {
  return {
    querySelectorAll: (kiezer) => {
      if (kiezer === 'details:not([open])') return lijst.filter((d) => !d.open);
      if (kiezer === `details[${AFDRUK_ATTRIBUUT}]`) return lijst.filter((d) => d.attributen.has(AFDRUK_ATTRIBUUT));
      throw new Error(`onbekende kiezer ${kiezer}`);
    },
  };
}

describe('afdrukken: dichte uitklappers gaan open en daarna weer dicht', () => {
  it('opent wat dicht is en laat wat al open was ongemoeid', () => {
    const dicht = maakDetails(false);
    const open = maakDetails(true);
    const wortel = maakWortel(dicht, open);
    expect(openVoorAfdruk(wortel)).toBe(1);
    expect(dicht.open).toBe(true);
    expect(dicht.attributen.has(AFDRUK_ATTRIBUUT)).toBe(true);
    expect(open.attributen.has(AFDRUK_ATTRIBUUT)).toBe(false);
  });

  it('sluit na het afdrukken alleen wat wij openden: de stand is dezelfde als ervoor', () => {
    const dicht = maakDetails(false);
    const open = maakDetails(true);
    const wortel = maakWortel(dicht, open);
    openVoorAfdruk(wortel);
    expect(sluitNaAfdruk(wortel)).toBe(1);
    expect(dicht.open).toBe(false);
    expect(open.open).toBe(true);
    expect(dicht.attributen.size).toBe(0);
  });

  it('twee keer afdrukken geeft hetzelfde resultaat', () => {
    const a = maakDetails(false);
    const b = maakDetails(true);
    const wortel = maakWortel(a, b);
    for (let n = 0; n < 2; n++) {
      openVoorAfdruk(wortel);
      sluitNaAfdruk(wortel);
    }
    expect([a.open, b.open]).toEqual([false, true]);
  });

  it('koppelAfdruk luistert naar beforeprint en afterprint en laat los', () => {
    const d = maakDetails(false);
    const wortel = maakWortel(d);
    const luisteraars = new Map<string, () => void>();
    const venster = {
      addEventListener: (n: string, f: () => void) => void luisteraars.set(n, f),
      removeEventListener: (n: string) => void luisteraars.delete(n),
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
    const los = koppelAfdruk(venster, () => wortel);
    luisteraars.get('beforeprint')?.();
    expect(d.open).toBe(true);
    luisteraars.get('afterprint')?.();
    expect(d.open).toBe(false);
    los();
    expect(luisteraars.size).toBe(0);
  });
});
