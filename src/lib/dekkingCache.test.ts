import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BkKort, DekkingKortGetallen } from './richtingOverzicht';

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

// ── De BK-ingang (fase 3b, § 24.4) ──────────────────────────────────────────

const BK_EEN: BkKort = { soort: 'getallen', bks: 1, titel: 'Onthaalmedewerker', totaal: 12, gedekt: 5, gepland: 3, percent: 42, zonderBestand: 0 };
const BK_TWEE: BkKort = { soort: 'getallen', bks: 2, totaal: 25, gedekt: 9, gepland: 4, zonderBestand: 1 };
const BK_ZONDER: BkKort = { soort: 'zonder-cursus', bks: 2 };

describe('dekkingCache: de BK-ingang naast de MD-ingang', () => {
  it('geeft niets terug voor een sleutel die nooit bewaard werd', async () => {
    const { leesBkKort } = await laad();
    expect(leesBkKort('G-0008|so')).toBeUndefined();
  });

  it('bewaart en leest de korte regel per sleutel, in elke vorm', async () => {
    const { bewaarBkKort, leesBkKort } = await laad();
    bewaarBkKort('G-0008|so', BK_EEN);
    bewaarBkKort('G-0009|so', BK_TWEE);
    bewaarBkKort('G-0393|so', BK_ZONDER);
    expect(leesBkKort('G-0008|so')).toEqual(BK_EEN);
    expect(leesBkKort('G-0009|so')).toEqual(BK_TWEE);
    expect(leesBkKort('G-0393|so')).toEqual(BK_ZONDER);
    expect(leesBkKort('G-0429|so')).toBeUndefined();
  });

  it('geeft telkens hetzelfde object terug (stabiel voor React) en dat is bevroren', async () => {
    const { bewaarBkKort, leesBkKort } = await laad();
    bewaarBkKort('G-0008|so', BK_EEN);
    const een = leesBkKort('G-0008|so');
    expect(leesBkKort('G-0008|so')).toBe(een);
    expect(Object.isFrozen(een)).toBe(true);
  });

  it('bewaart een kopie met alleen de bekende velden', async () => {
    const { bewaarBkKort, leesBkKort } = await laad();
    const vuil = { ...BK_EEN, extra: 'x', dekking: [1, 2, 3] } as BkKort;
    bewaarBkKort('G-0008|so', vuil);
    expect(Object.keys(leesBkKort('G-0008|so')!).sort()).toEqual(['bks', 'gedekt', 'gepland', 'percent', 'soort', 'titel', 'totaal', 'zonderBestand']);
    (vuil as { gedekt: number }).gedekt = 100;
    expect((leesBkKort('G-0008|so') as { gedekt: number }).gedekt).toBe(5);
    bewaarBkKort('G-0009|so', { ...BK_ZONDER, extra: 1 } as BkKort);
    expect(Object.keys(leesBkKort('G-0009|so')!).sort()).toEqual(['bks', 'soort']);
  });

  it('bewaart niets bij een getal dat geen getal is of een onbekende soort', async () => {
    const { bewaarBkKort, leesBkKort } = await laad();
    bewaarBkKort('a', { ...BK_EEN, totaal: NaN });
    bewaarBkKort('b', { ...BK_EEN, gepland: '3' as unknown as number });
    bewaarBkKort('c', { ...BK_EEN, percent: Infinity });
    bewaarBkKort('d', { ...BK_EEN, zonderBestand: undefined as unknown as number });
    bewaarBkKort('e', { ...BK_ZONDER, bks: NaN });
    bewaarBkKort('f', { soort: 'iets-anders', bks: 1 } as unknown as BkKort);
    bewaarBkKort('g', null as unknown as BkKort);
    for (const s of 'abcdefg') expect(leesBkKort(s), s).toBeUndefined();
  });

  it('wordt ongeldig bij elke wijziging in de opslag, samen met de MD-ingang', async () => {
    const { bewaarBkKort, leesBkKort, bewaarDekkingKort, leesDekkingKort, notifyChange } = await laad();
    bewaarBkKort('G-0008|so', BK_EEN);
    bewaarDekkingKort('G-0008|so', NW);
    notifyChange();
    expect(leesBkKort('G-0008|so')).toBeUndefined();
    expect(leesDekkingKort('G-0008|so')).toBeUndefined();
    bewaarBkKort('G-0008|so', BK_EEN);
    expect(leesBkKort('G-0008|so')).toEqual(BK_EEN);
  });

  it('meldt zich al bij het eerste lezen aan (ook als er nooit iets bewaard wordt)', async () => {
    const { leesBkKort, bewaarBkKort, notifyChange } = await laad();
    expect(leesBkKort('x')).toBeUndefined();
    bewaarBkKort('x', BK_EEN);
    notifyChange();
    expect(leesBkKort('x')).toBeUndefined();
  });

  it('een berekening die begon vóór een wijziging, bewaart haar uitkomst niet meer', async () => {
    const { bewaarBkKort, leesBkKort, dekkingGeneratie, notifyChange } = await laad();
    const begin = dekkingGeneratie();
    notifyChange();
    bewaarBkKort('G-0008|so', BK_EEN, begin);
    expect(leesBkKort('G-0008|so')).toBeUndefined();
    // Een berekening die na de wijziging begon, mag wel; en dezelfde generatie als de MD-ingang.
    bewaarBkKort('G-0008|so', BK_EEN, dekkingGeneratie());
    expect(leesBkKort('G-0008|so')).toEqual(BK_EEN);
  });

  it('een BK-ingang raakt nooit een MD-ingang, ook niet met dezelfde sleutel (I3)', async () => {
    const { bewaarBkKort, leesBkKort, bewaarDekkingKort, leesDekkingKort } = await laad();
    bewaarDekkingKort('G-0008|so', NW);
    bewaarBkKort('G-0008|so', BK_EEN);
    expect(leesDekkingKort('G-0008|so')).toEqual(NW);
    expect(leesBkKort('G-0008|so')).toEqual(BK_EEN);
    // Overschrijven of een oude generatie aan de ene kant laat de andere ongemoeid.
    bewaarBkKort('G-0008|so', BK_TWEE);
    expect(leesDekkingKort('G-0008|so')).toEqual(NW);
    bewaarDekkingKort('G-0008|so', EEN_A);
    expect(leesBkKort('G-0008|so')).toEqual(BK_TWEE);
  });

  it('de leeskant: onder een sleutel waar alleen de andere soort staat, geeft elke lezer niets terug (I3)', async () => {
    // `kaderGroepSleutel` is voor de minimumdoelen en de competenties dezelfde sleutel. Een MD-ingang mag nooit als `BkKort`
    // gelezen worden (`bkRijZin` zou 'undefined beroepskwalificaties' maken), en een BK-ingang nooit als getallen.
    const { bewaarBkKort, leesBkKort, bewaarDekkingKort, leesDekkingKort } = await laad();
    bewaarDekkingKort('G-0008|so', NW);
    expect(leesBkKort('G-0008|so')).toBeUndefined();
    bewaarBkKort('G-0009|so', BK_EEN);
    expect(leesDekkingKort('G-0009|so')).toBeUndefined();
    // En ook als beide kanten een sleutel hebben, blijft elke lezer bij zijn eigen soort.
    expect(leesDekkingKort('G-0008|so')).toEqual(NW);
    expect(leesBkKort('G-0009|so')).toEqual(BK_EEN);
    expect(leesBkKort('G-0008|so')).toBeUndefined();
    expect(leesDekkingKort('G-0009|so')).toBeUndefined();
  });

  it('een volle BK-kant verdringt geen MD-ingang, en een volle MD-kant geen BK-ingang', async () => {
    const { bewaarBkKort, leesBkKort, bewaarDekkingKort, leesDekkingKort } = await laad();
    bewaarDekkingKort('eerste', NW);
    for (let i = 0; i < 401; i++) bewaarBkKort(`sleutel-${i}`, BK_EEN);
    expect(leesDekkingKort('eerste')).toEqual(NW);
    expect(leesBkKort('sleutel-0')).toBeUndefined();
    expect(leesBkKort('sleutel-400')).toEqual(BK_EEN);
    for (let i = 0; i < 401; i++) bewaarDekkingKort(`md-${i}`, NW);
    expect(leesBkKort('sleutel-1')).toEqual(BK_EEN);
  });

  it('houdt hoogstens 400 richtingen: de oudste valt weg; een bestaande sleutel opnieuw bewaren verdringt niets', async () => {
    const { bewaarBkKort, leesBkKort } = await laad();
    for (let i = 0; i < 400; i++) bewaarBkKort(`sleutel-${i}`, BK_EEN);
    bewaarBkKort('sleutel-0', BK_TWEE);
    expect(leesBkKort('sleutel-1')).toEqual(BK_EEN);
    expect(leesBkKort('sleutel-0')).toEqual(BK_TWEE);
    bewaarBkKort('sleutel-400', BK_EEN);
    expect(leesBkKort('sleutel-0')).toBeUndefined();
    expect(leesBkKort('sleutel-400')).toEqual(BK_EEN);
  });

  it('raakt localStorage nooit aan', async () => {
    const aangeraakt: string[] = [];
    (globalThis as { localStorage?: Storage }).localStorage = new Proxy({} as Storage, {
      get(_doel, naam) { aangeraakt.push(String(naam)); throw new Error('localStorage aangeraakt'); },
      set(_doel, naam) { aangeraakt.push(String(naam)); throw new Error('localStorage aangeraakt'); },
    });
    const { bewaarBkKort, leesBkKort, notifyChange } = await laad();
    bewaarBkKort('G-0008|so', BK_EEN);
    expect(leesBkKort('G-0008|so')).toEqual(BK_EEN);
    notifyChange();
    expect(leesBkKort('G-0008|so')).toBeUndefined();
    expect(aangeraakt).toEqual([]);
  });
});
