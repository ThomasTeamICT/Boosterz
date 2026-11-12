import { describe, expect, it } from 'vitest';
import {
  alleOplossingen,
  beginStand,
  beschrijfKaartjes,
  gaatNaam,
  isSchuin,
  kaartjesFeedback,
  lichtKomtDoor,
  lichtweg,
  oplossingSleutel,
  zetGat,
  zetLamp,
} from './kaartjes';

describe('lichtKomtDoor', () => {
  it('de beginstand laat geen licht door', () => {
    expect(lichtKomtDoor(beginStand())).toBe(false);
  });

  it('even hoog op de hoogte van de lamp: het licht komt door', () => {
    expect(lichtKomtDoor({ lamp: 2, gaten: [1, 1, 1] })).toBe(true);
    expect(lichtKomtDoor({ lamp: 1, gaten: [0, 0, 0] })).toBe(true);
    expect(lichtKomtDoor({ lamp: 3, gaten: [2, 2, 2] })).toBe(true);
  });

  it('schuin op één lijn: de lamp laag, de gaatjes stijgen', () => {
    // lamp 0,2; gaatjes 0,35 (kaartje 1), 0,5, 0,65 (kaartje 3)
    expect(lichtKomtDoor({ lamp: 0, gaten: [2, 1, 0] })).toBe(true);
  });

  it('niet op één lijn: het licht komt niet door', () => {
    expect(lichtKomtDoor({ lamp: 2, gaten: [1, 0, 1] })).toBe(false);
    expect(lichtKomtDoor({ lamp: 2, gaten: [2, 1, 0] })).toBe(false);
  });

  it('er zijn precies vijf oplossingen: drie rechte en twee schuine', () => {
    const o = alleOplossingen();
    expect(o).toHaveLength(5);
    expect(o.filter((s) => isSchuin(oplossingSleutel(s)))).toHaveLength(2);
    const sleutels = o.map(oplossingSleutel).sort();
    expect(sleutels).toEqual(['0-210', '1-000', '2-111', '3-222', '4-012']);
  });
});

describe('isSchuin', () => {
  it('de drie rechte oplossingen zijn niet schuin', () => {
    for (const k of ['2-111', '1-000', '3-222']) expect(isSchuin(k)).toBe(false);
  });
  it('de andere zijn schuin', () => {
    for (const k of ['0-210', '4-012']) expect(isSchuin(k)).toBe(true);
  });
  it('weigert tekst die geen oplossing is', () => {
    expect(() => isSchuin('abc')).toThrow(RangeError);
  });
});

describe('lichtweg', () => {
  it('een oplossing komt op het scherm uit, op de hoogte van de lamp bij een rechte stand', () => {
    const w = lichtweg({ lamp: 2, gaten: [1, 1, 1] });
    expect(w.door).toBe(true);
    expect(w.geblokkeerdBij).toBeNull();
    expect(w.eind.z).toBe(0);
    expect(w.eind.y).toBeCloseTo(0.5, 12);
  });

  it('een schuine oplossing eindigt hoger of lager dan de lamp', () => {
    const w = lichtweg({ lamp: 0, gaten: [2, 1, 0] });
    expect(w.door).toBe(true);
    expect(w.eind.y).toBeCloseTo(0.2 + 0.15 * (3.4 / 0.8), 12);
  });

  it('de beginstand: het licht botst tegen kaartje 2', () => {
    const w = lichtweg(beginStand());
    expect(w.door).toBe(false);
    expect(w.geblokkeerdBij).toBe(2);
    expect(w.eind.z).toBe(1.8);
  });

  it('hangt de blokkade af van de lamp: kaartje 3 houdt het licht tegen als alleen dat gaatje fout zit', () => {
    const w = lichtweg({ lamp: 2, gaten: [0, 1, 1] });
    expect(w.geblokkeerdBij).toBe(3);
    expect(w.eind.z).toBe(1.0);
  });

  it('door en geblokkeerdBij zijn consistent voor alle standen', () => {
    for (let l = 0; l < 5; l++)
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++)
          for (let c = 0; c < 3; c++) {
            const s = { lamp: l, gaten: [a, b, c] as [number, number, number] };
            const w = lichtweg(s);
            expect(w.door).toBe(lichtKomtDoor(s));
            if (w.door) expect(w.geblokkeerdBij).toBeNull();
          }
  });
});

describe('zetGat en zetLamp', () => {
  it('veranderen niets aan het origineel en blijven binnen de grenzen', () => {
    const s = beginStand();
    const t = zetGat(s, 0, 5);
    expect(s.gaten).toEqual([0, 2, 1]);
    expect(t.gaten).toEqual([2, 2, 1]);
    expect(zetGat(s, 1, -5).gaten[1]).toBe(0);
    expect(zetLamp(s, 9).lamp).toBe(4);
    expect(zetLamp(s, -9).lamp).toBe(0);
  });
  it('weigert een gaatje dat niet bestaat', () => {
    expect(() => zetGat(beginStand(), 3, 1)).toThrow(RangeError);
  });
});

describe('beschrijfKaartjes en gaatNaam', () => {
  it('de beginstand in woorden', () => {
    expect(beschrijfKaartjes(beginStand())).toBe(
      'De zaklamp staat in het midden. Gaatje 1 (bij de lamp) zit in het midden, gaatje 2 hoog, gaatje 3 laag. Er komt geen licht op het scherm.',
    );
    expect(beschrijfKaartjes({ lamp: 2, gaten: [1, 1, 1] })).toContain('Er valt een lichtvlek op het scherm.');
    expect(gaatNaam(beginStand(), 1)).toBe('hoog');
  });
});

describe('kaartjesFeedback', () => {
  it('niets te zeggen zolang er geen oplossing was en het licht niet doorkomt', () => {
    expect(kaartjesFeedback(beginStand(), new Set())).toBeNull();
  });
  it('een rechte oplossing: vraag om de lamp hoger of lager te zetten', () => {
    const s = { lamp: 2, gaten: [1, 1, 1] as [number, number, number] };
    const f = kaartjesFeedback(s, new Set([oplossingSleutel(s)]));
    expect(f).toMatchObject({ soort: 'ok', titel: 'Er komt licht op het scherm.', bewijsSchuin: false });
  });
  it('een schuine oplossing telt als bewijs', () => {
    const s = { lamp: 0, gaten: [2, 1, 0] as [number, number, number] };
    const f = kaartjesFeedback(s, new Set([oplossingSleutel(s)]));
    expect(f).toMatchObject({ soort: 'ok', titel: 'Ook schuin lukt het!', bewijsSchuin: true });
  });
  it('een schuine oplossing van eerder telt ook als het licht nu doorkomt in een rechte stand', () => {
    const recht = { lamp: 2, gaten: [1, 1, 1] as [number, number, number] };
    const f = kaartjesFeedback(recht, new Set(['0-210', oplossingSleutel(recht)]));
    expect(f?.bewijsSchuin).toBe(true);
  });
  it('na een oplossing: het licht botst tegen een kaartje', () => {
    const f = kaartjesFeedback(beginStand(), new Set(['2-111']));
    expect(f).toMatchObject({ soort: 'info', titel: 'Het licht botst tegen een kaartje.' });
  });
});
