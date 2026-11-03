// De bewaarde keuze van het deel basisonderwijs: de exacte vorm, het tolerant lezen en de grenzen van de opslag.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEUZE_SLEUTEL, bewaarKeuze, leesKeuze, saneerKeuze, wisKeuze } from './basisKeuze';
import { LEERJAREN_BASIS } from './kalender';

/** Een opslag in het geheugen die bijhoudt wat er geschreven en gewist werd. */
function geheugen(begin: Record<string, string> = {}) {
  const data = new Map(Object.entries(begin));
  const schrijf: string[] = [];
  return {
    data,
    schrijf,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      schrijf.push(k);
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

describe('basisKeuze', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('de sleutel is wf.basis.keuze.v1', () => {
    expect(KEUZE_SLEUTEL).toBe('wf.basis.keuze.v1');
  });

  it('bewaren en lezen geven hetzelfde terug, met de exacte string', () => {
    const o = geheugen();
    expect(bewaarKeuze({ soort: 'bao', leerjaar: 'L3' }, o)).toBe(true);
    expect(o.data.get('wf.basis.keuze.v1')).toBe('{"v":1,"soort":"bao","leerjaar":"L3"}');
    expect(leesKeuze(o)).toEqual({ soort: 'bao', leerjaar: 'L3' });
  });

  it('alle 18 combinaties maken de ronde', () => {
    for (const soort of ['bao', 'bubao'] as const) {
      for (const leerjaar of LEERJAREN_BASIS) {
        const o = geheugen();
        expect(bewaarKeuze({ soort, leerjaar }, o)).toBe(true);
        expect(leesKeuze(o)).toEqual({ soort, leerjaar });
      }
    }
  });

  it('alleen de sleutel wf.basis.keuze.v1 wordt geschreven', () => {
    const o = geheugen();
    bewaarKeuze({ soort: 'bubao', leerjaar: 'K2' }, o);
    bewaarKeuze({ soort: 'bao', leerjaar: 'L6' }, o);
    expect(new Set(o.schrijf)).toEqual(new Set(['wf.basis.keuze.v1']));
    expect([...o.data.keys()]).toEqual(['wf.basis.keuze.v1']);
  });

  it.each([
    ['kapotte JSON', '{"v":1,"soort":'],
    ['geen object', '"L3"'],
    ['een lijst', '[1,"bao","L3"]'],
    ['null', 'null'],
    ['een andere versie', '{"v":2,"soort":"bao","leerjaar":"L3"}'],
    ['zonder versie', '{"soort":"bao","leerjaar":"L3"}'],
    ['een onbekend leerjaar', '{"v":1,"soort":"bao","leerjaar":"L7"}'],
    ['een leerjaar in kleine letters', '{"v":1,"soort":"bao","leerjaar":"l3"}'],
    ['een onbekende soort', '{"v":1,"soort":"so","leerjaar":"L3"}'],
    ['een ontbrekend leerjaar', '{"v":1,"soort":"bao"}'],
  ])('%s geeft undefined', (_naam, ruw) => {
    expect(leesKeuze(geheugen({ [KEUZE_SLEUTEL]: ruw }))).toBeUndefined();
  });

  it('zonder bewaarde waarde is er geen keuze', () => {
    expect(leesKeuze(geheugen())).toBeUndefined();
  });

  it('extra velden vallen weg', () => {
    const o = geheugen({ [KEUZE_SLEUTEL]: '{"v":1,"soort":"bubao","leerjaar":"L1","naam":"Greet","extra":[1]}' });
    const k = leesKeuze(o);
    expect(k).toEqual({ soort: 'bubao', leerjaar: 'L1' });
    expect(Object.keys(k ?? {}).sort()).toEqual(['leerjaar', 'soort']);
  });

  it('saneerKeuze controleert ook een waarde die niet uit de opslag komt', () => {
    expect(saneerKeuze({ v: 1, soort: 'bao', leerjaar: 'K1' })).toEqual({ soort: 'bao', leerjaar: 'K1' });
    expect(saneerKeuze(undefined)).toBeUndefined();
    expect(saneerKeuze(42)).toBeUndefined();
    expect(saneerKeuze({ v: 1, soort: 'bao', leerjaar: 3 })).toBeUndefined();
  });

  it('een opslag die gooit, breekt niets', () => {
    const kapot = {
      getItem: () => {
        throw new Error('geblokkeerd');
      },
      setItem: () => {
        throw new Error('vol');
      },
      removeItem: () => {
        throw new Error('geblokkeerd');
      },
    };
    expect(leesKeuze(kapot)).toBeUndefined();
    expect(bewaarKeuze({ soort: 'bao', leerjaar: 'L3' }, kapot)).toBe(false);
    expect(() => wisKeuze(kapot)).not.toThrow();
  });

  it('zonder localStorage breekt niets', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(leesKeuze()).toBeUndefined();
    expect(bewaarKeuze({ soort: 'bao', leerjaar: 'L3' })).toBe(false);
    expect(() => wisKeuze()).not.toThrow();
  });

  it('een ongeldige keuze wordt niet bewaard', () => {
    const o = geheugen();
    // @ts-expect-error bewust een ongeldig leerjaar
    expect(bewaarKeuze({ soort: 'bao', leerjaar: 'L7' }, o)).toBe(false);
    expect(o.schrijf).toEqual([]);
  });

  it('wisKeuze haalt de sleutel weg', () => {
    const o = geheugen();
    bewaarKeuze({ soort: 'bao', leerjaar: 'L3' }, o);
    wisKeuze(o);
    expect(leesKeuze(o)).toBeUndefined();
    expect(o.data.size).toBe(0);
  });
});
