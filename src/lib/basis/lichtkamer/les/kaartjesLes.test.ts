import { describe, expect, it } from 'vitest';
import { alleOplossingen, beginStand, lichtKomtDoor, oplossingSleutel, isSchuin } from '../kaartjes';
import {
  KAARTJES_RIJEN,
  beginKaartjesLes,
  gaatTekst,
  kaartjesBewijs,
  kaartjesReducer,
  kaartjesScene,
  kaartjesTerugkoppeling,
  lichtDoor,
  schuinGevonden,
  type KaartjesLesActie,
  type KaartjesLesToestand,
} from './kaartjesLes';

const speel = (acties: KaartjesLesActie[], begin: KaartjesLesToestand = beginKaartjesLes()) => acties.reduce(kaartjesReducer, begin);

/** Gaatje i van de huidige stand verschuift naar hoogte `doel` met de knoppen hoger en lager. */
const zetGatenOp = (t: KaartjesLesToestand, lamp: number, gaten: [number, number, number]): KaartjesLesToestand => {
  const acties: KaartjesLesActie[] = [];
  let l = t.stand.lamp;
  while (l !== lamp) {
    acties.push({ type: 'lamp', d: lamp > l ? 1 : -1 });
    l += lamp > l ? 1 : -1;
  }
  for (const i of [0, 1, 2] as const) {
    let g = t.stand.gaten[i];
    while (g !== gaten[i]) {
      acties.push({ type: 'gat', i, d: gaten[i] > g ? 1 : -1 });
      g += gaten[i] > g ? 1 : -1;
    }
  }
  return speel(acties, t);
};

describe('Drie kaartjes (lesmachine)', () => {
  it('begint zonder licht, zonder oplossingen en zonder terugkoppeling', () => {
    const t = beginKaartjesLes();
    expect(t.stand).toEqual(beginStand());
    expect(lichtDoor(t)).toBe(false);
    expect(t.oplossingen).toEqual([]);
    expect(kaartjesTerugkoppeling(t)).toBeNull();
    expect(kaartjesBewijs(t)).toBeNull();
    expect(kaartjesScene(t)).toEqual({ scene: 'kaartjes', stand: beginStand() });
  });

  it("een hele oefening met alleen knoppen: een rechte oplossing, dan 'Ook schuin lukt het!' en het bewijs", () => {
    // gewoon: de lamp op het midden (index 2), alle gaatjes in het midden (index 1)
    let t = zetGatenOp(beginKaartjesLes(), 2, [1, 1, 1]);
    expect(lichtDoor(t)).toBe(true);
    expect(kaartjesTerugkoppeling(t)?.titel).toBe('Er komt licht op het scherm.');
    expect(schuinGevonden(t)).toBe(false);
    expect(kaartjesBewijs(t)).toBeNull();
    // schuin: de lamp heel hoog (4), gaatje 1 (bij de lamp) hoog, gaatje 2 midden, gaatje 3 (bij het scherm) laag
    t = zetGatenOp(t, 4, [0, 1, 2]);
    expect(lichtDoor(t)).toBe(true);
    expect(kaartjesTerugkoppeling(t)?.titel).toBe('Ook schuin lukt het!');
    expect(kaartjesBewijs(t)).toEqual({ id: '4-kaartjes', juist: true, fout: null });
  });

  it('elke oplossing van de lichtlogica is met knoppen te bereiken, en een schuine geeft het bewijs', () => {
    const schuin = alleOplossingen().find((s) => isSchuin(oplossingSleutel(s))) as NonNullable<ReturnType<typeof alleOplossingen>[number]>;
    const t = zetGatenOp(beginKaartjesLes(), schuin.lamp, schuin.gaten);
    expect(lichtKomtDoor(t.stand)).toBe(true);
    expect(kaartjesTerugkoppeling(t)?.titel).toBe('Ook schuin lukt het!');
    expect(schuinGevonden(t)).toBe(true);
    expect(kaartjesBewijs(t)).toEqual({ id: '4-kaartjes', juist: true, fout: null });
  });

  it('na een oplossing botst het licht tegen een kaartje als het kind iets verzet', () => {
    let t = zetGatenOp(beginKaartjesLes(), 2, [1, 1, 1]);
    t = speel([{ type: 'gat', i: 1, d: 1 }], t);
    expect(lichtDoor(t)).toBe(false);
    expect(kaartjesTerugkoppeling(t)?.titel).toBe('Het licht botst tegen een kaartje.');
  });

  it('het bewijs blijft na een schuine oplossing, ook als het kind daarna iets verzet', () => {
    const schuin = alleOplossingen().find((s) => isSchuin(oplossingSleutel(s))) as ReturnType<typeof alleOplossingen>[number];
    let t = zetGatenOp(beginKaartjesLes(), schuin.lamp, schuin.gaten);
    t = speel([{ type: 'lamp', d: 1 }], t);
    expect(kaartjesBewijs(t)?.juist).toBe(true);
  });

  it('dezelfde oplossing tweemaal vinden telt één keer', () => {
    let t = zetGatenOp(beginKaartjesLes(), 2, [1, 1, 1]);
    t = speel([{ type: 'gat', i: 0, d: 1 }, { type: 'gat', i: 0, d: -1 }], t);
    expect(t.oplossingen).toEqual(['2-111']);
  });

  it('aan de rand van het bereik doet een knop niets (dezelfde toestand terug)', () => {
    const t = speel([{ type: 'lamp', d: -1 }, { type: 'lamp', d: -1 }, { type: 'lamp', d: -1 }]);
    expect(t.stand.lamp).toBe(0);
    expect(kaartjesReducer(t, { type: 'lamp', d: -1 })).toBe(t);
    const g = speel([{ type: 'gat', i: 0, d: -1 }]);
    expect(g.stand.gaten[0]).toBe(0);
    expect(kaartjesReducer(g, { type: 'gat', i: 0, d: -1 })).toBe(g);
  });

  it('een ongeldig gaatje, een ongeldige stap of een ongeldige stand doet niets', () => {
    const t = beginKaartjesLes();
    expect(kaartjesReducer(t, { type: 'gat', i: 3, d: 1 })).toBe(t);
    expect(kaartjesReducer(t, { type: 'gat', i: -1, d: 1 })).toBe(t);
    expect(kaartjesReducer(t, { type: 'gat', i: 0.5, d: 1 })).toBe(t);
    expect(kaartjesReducer(t, { type: 'gat', i: 0, d: NaN })).toBe(t);
    expect(kaartjesReducer(t, { type: 'lamp', d: Infinity })).toBe(t);
    expect(kaartjesReducer(t, { type: 'zet', stand: { lamp: 9, gaten: [0, 0, 0] } })).toBe(t);
    expect(kaartjesReducer(t, { type: 'zet', stand: { lamp: 1, gaten: [0, 0] } as never })).toBe(t);
    expect(kaartjesReducer(t, { type: 'zet', stand: null as never })).toBe(t);
  });

  it("'zet' neemt een stand van de kijkdoos over (de lamp slepen) en onthoudt oplossingen", () => {
    const sleep = zetGatenOp(beginKaartjesLes(), 2, [1, 1, 1]);
    const t = speel([{ type: 'zet', stand: { lamp: 2, gaten: [1, 1, 1] } }], beginKaartjesLes());
    expect(t.stand).toEqual(sleep.stand);
    expect(t.oplossingen).toEqual(['2-111']);
    expect(kaartjesReducer(t, { type: 'zet', stand: { lamp: 2, gaten: [1, 1, 1] } })).toBe(t);
  });

  it("'opnieuw' wist de oplossingen", () => {
    const t = speel([{ type: 'opnieuw' }], zetGatenOp(beginKaartjesLes(), 2, [1, 1, 1]));
    expect(t).toEqual(beginKaartjesLes());
  });

  it('de rijen van het paneel lopen van de lamp naar het scherm en elk gaatje heeft een naam', () => {
    expect(KAARTJES_RIJEN.map((r) => r.i)).toEqual([2, 1, 0]);
    const t = beginKaartjesLes();
    for (const r of KAARTJES_RIJEN) expect(['laag', 'midden', 'hoog']).toContain(gaatTekst(t, r.i));
  });
});
