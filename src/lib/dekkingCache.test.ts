import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DekkingKortGetallen } from './richtingOverzicht';

// De cache heeft toestand op moduleniveau (en meldt zich bij het eerste gebruik aan), dus elke test begint met een vers
// exemplaar van de module én van de opslaglaag waarop ze zich aanmeldt.
async function laad() {
  vi.resetModules();
  const cache = await import('./dekkingCache');
  const opslag = await import('./storage');
  return { ...cache, notifyChange: opslag.notifyChange };
}

const NW: DekkingKortGetallen = { totaal: 171, gedekt: 9, gepland: 4, percent: 5, eersteGraad: false };
const EEN_A: DekkingKortGetallen = { totaal: 40, gedekt: 40, gepland: 0, percent: 100, eersteGraad: true };

const echteOpslag = (globalThis as { localStorage?: Storage }).localStorage;
afterEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = echteOpslag;
});

describe('dekkingCache', () => {
  it('geeft niets terug voor een sleutel die nooit bewaard werd', async () => {
    const { leesDekkingKort } = await laad();
    expect(leesDekkingKort('G-0193|so')).toBeUndefined();
  });

  it('bewaart en leest de getallen per sleutel', async () => {
    const { bewaarDekkingKort, leesDekkingKort } = await laad();
    bewaarDekkingKort('G-0193|so', NW);
    bewaarDekkingKort('1|A|so', EEN_A);
    expect(leesDekkingKort('G-0193|so')).toEqual(NW);
    expect(leesDekkingKort('1|A|so')).toEqual(EEN_A);
    expect(leesDekkingKort('G-0117|so')).toBeUndefined();
  });

  it('geeft telkens hetzelfde object terug (stabiel voor React) en dat is bevroren', async () => {
    const { bewaarDekkingKort, leesDekkingKort } = await laad();
    bewaarDekkingKort('G-0193|so', NW);
    const een = leesDekkingKort('G-0193|so');
    expect(leesDekkingKort('G-0193|so')).toBe(een);
    expect(Object.isFrozen(een)).toBe(true);
  });

  it('bewaart een kopie met alleen de vijf getallenvelden', async () => {
    const { bewaarDekkingKort, leesDekkingKort } = await laad();
    const vuil = { ...NW, extra: 'x', rijen: [1, 2, 3] } as DekkingKortGetallen;
    bewaarDekkingKort('G-0193|so', vuil);
    expect(Object.keys(leesDekkingKort('G-0193|so')!).sort()).toEqual(['eersteGraad', 'gedekt', 'gepland', 'percent', 'totaal']);
    // Wat de aanroeper daarna aan zijn object verandert, raakt de cache niet.
    vuil.gedekt = 100;
    expect(leesDekkingKort('G-0193|so')?.gedekt).toBe(9);
  });

  it('bewaart geen getallen die geen getal zijn', async () => {
    const { bewaarDekkingKort, leesDekkingKort } = await laad();
    bewaarDekkingKort('a', { ...NW, percent: NaN });
    bewaarDekkingKort('b', { ...NW, totaal: Infinity });
    bewaarDekkingKort('c', { ...NW, gedekt: '9' as unknown as number });
    expect(leesDekkingKort('a')).toBeUndefined();
    expect(leesDekkingKort('b')).toBeUndefined();
    expect(leesDekkingKort('c')).toBeUndefined();
  });

  it('wordt ongeldig bij elke wijziging in de opslag', async () => {
    const { bewaarDekkingKort, leesDekkingKort, notifyChange } = await laad();
    bewaarDekkingKort('G-0193|so', NW);
    bewaarDekkingKort('1|A|so', EEN_A);
    notifyChange();
    expect(leesDekkingKort('G-0193|so')).toBeUndefined();
    expect(leesDekkingKort('1|A|so')).toBeUndefined();
    // En ze werkt daarna gewoon weer, tot de volgende wijziging.
    bewaarDekkingKort('G-0193|so', NW);
    expect(leesDekkingKort('G-0193|so')).toEqual(NW);
    notifyChange();
    expect(leesDekkingKort('G-0193|so')).toBeUndefined();
  });

  it('meldt zich al bij het eerste lezen aan (ook als er nooit iets bewaard wordt)', async () => {
    const { leesDekkingKort, bewaarDekkingKort, notifyChange } = await laad();
    expect(leesDekkingKort('x')).toBeUndefined();
    bewaarDekkingKort('x', NW);
    notifyChange();
    expect(leesDekkingKort('x')).toBeUndefined();
  });

  it('een berekening die begon vóór een wijziging, bewaart haar uitkomst niet meer', async () => {
    const { bewaarDekkingKort, leesDekkingKort, dekkingGeneratie, notifyChange } = await laad();
    const begin = dekkingGeneratie();
    notifyChange(); // iets in de opslag veranderde terwijl de berekening liep
    bewaarDekkingKort('G-0193|so', NW, begin);
    expect(leesDekkingKort('G-0193|so')).toBeUndefined();
    // Een berekening die na de wijziging begon, mag wel.
    bewaarDekkingKort('G-0193|so', NW, dekkingGeneratie());
    expect(leesDekkingKort('G-0193|so')).toEqual(NW);
  });

  it('de generatie gaat bij elke wijziging omhoog en blijft anders gelijk', async () => {
    const { dekkingGeneratie, bewaarDekkingKort, leesDekkingKort, notifyChange } = await laad();
    const a = dekkingGeneratie();
    bewaarDekkingKort('x', NW);
    leesDekkingKort('x');
    expect(dekkingGeneratie()).toBe(a);
    notifyChange();
    expect(dekkingGeneratie()).toBe(a + 1);
    notifyChange();
    expect(dekkingGeneratie()).toBe(a + 2);
  });

  it('raakt localStorage nooit aan', async () => {
    const aangeraakt: string[] = [];
    (globalThis as { localStorage?: Storage }).localStorage = new Proxy({} as Storage, {
      get(_doel, naam) { aangeraakt.push(String(naam)); throw new Error('localStorage aangeraakt'); },
      set(_doel, naam) { aangeraakt.push(String(naam)); throw new Error('localStorage aangeraakt'); },
    });
    const { bewaarDekkingKort, leesDekkingKort, dekkingGeneratie, notifyChange } = await laad();
    bewaarDekkingKort('G-0193|so', NW);
    expect(leesDekkingKort('G-0193|so')).toEqual(NW);
    dekkingGeneratie();
    notifyChange();
    expect(leesDekkingKort('G-0193|so')).toBeUndefined();
    expect(aangeraakt).toEqual([]);
  });

  describe('met een gewone nep-localStorage', () => {
    let data: Map<string, string>;
    beforeEach(() => {
      data = new Map();
      (globalThis as { localStorage?: Storage }).localStorage = {
        get length() { return data.size; },
        key: (i: number) => [...data.keys()][i] ?? null,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { data.set(k, String(v)); },
        removeItem: (k: string) => { data.delete(k); },
        clear: () => data.clear(),
      } as Storage;
    });

    it('schrijft niets weg, dus na een herlading (nieuwe module) is er niets meer', async () => {
      const een = await laad();
      een.bewaarDekkingKort('G-0193|so', NW);
      expect(data.size).toBe(0);
      const twee = await laad();
      expect(twee.leesDekkingKort('G-0193|so')).toBeUndefined();
    });
  });

  it('houdt hoogstens 400 richtingen: de oudste valt weg', async () => {
    const { bewaarDekkingKort, leesDekkingKort } = await laad();
    for (let i = 0; i < 401; i++) bewaarDekkingKort(`sleutel-${i}`, NW);
    expect(leesDekkingKort('sleutel-0')).toBeUndefined();
    expect(leesDekkingKort('sleutel-1')).toEqual(NW);
    expect(leesDekkingKort('sleutel-400')).toEqual(NW);
    // Een bestaande sleutel opnieuw bewaren verdringt niets.
    bewaarDekkingKort('sleutel-1', { ...NW, gedekt: 10 });
    expect(leesDekkingKort('sleutel-2')).toEqual(NW);
    expect(leesDekkingKort('sleutel-1')?.gedekt).toBe(10);
  });
});
