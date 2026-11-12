import { describe, expect, it } from 'vitest';
import {
  AANTAL_RONDES,
  beginVoorspel,
  huidigeRonde,
  isAf,
  juisteLetter,
  kanVolgende,
  letterPlaats,
  uitkomstVan,
  voorspelBewijs,
  voorspelReducer,
  voorspelScene,
  type VoorspelActie,
  type VoorspelToestand,
} from './voorspelLes';

const speel = (acties: VoorspelActie[], begin: VoorspelToestand = beginVoorspel()) => acties.reduce(voorspelReducer, begin);

describe('Waar valt de schaduw? (lesmachine)', () => {
  it('begint in ronde 1, zonder keuze en zonder uitkomst', () => {
    const t = beginVoorspel();
    expect(t.ronde).toBe(0);
    expect(t.getoond).toBe(false);
    expect(t.keuzes).toEqual([null, null, null]);
    expect(voorspelBewijs(t)).toBeNull();
    expect(uitkomstVan(t)).toBeNull();
    expect(voorspelScene(t)).toEqual({ scene: 'voorspel', ronde: 0, getoond: false });
  });

  it('een hele oefening met alleen acties: drie keer juist kiezen geeft bewijs juist', () => {
    let t = beginVoorspel();
    for (let r = 0; r < AANTAL_RONDES; r++) {
      expect(t.ronde).toBe(r);
      expect(voorspelBewijs(t)).toBeNull();
      t = voorspelReducer(t, { type: 'kies', letter: juisteLetter(t) });
      expect(t.getoond).toBe(true);
      expect(uitkomstVan(t)?.juist).toBe(true);
      expect(kanVolgende(t)).toBe(r < AANTAL_RONDES - 1);
      if (r < AANTAL_RONDES - 1) t = voorspelReducer(t, { type: 'volgende' });
    }
    expect(isAf(t)).toBe(true);
    expect(voorspelBewijs(t)).toEqual({ id: '4-voorspel', juist: true, fout: null });
  });

  it('twee juist en één fout telt als juist, met het foutpatroon van de eerste fout', () => {
    let t = beginVoorspel();
    // ronde 1: de letter aan de kant van de lamp kiezen
    const r0 = huidigeRonde(t);
    const kant = [0, 1, 2].find((i) => i !== r0.juistIdx && Math.sign(r0.pos[i] as number) === Math.sign(r0.lamp.x)) as number;
    t = voorspelReducer(t, { type: 'kies', letter: kant });
    expect(uitkomstVan(t)?.fout).toBe('schaduw aan de kant van de lamp');
    t = voorspelReducer(t, { type: 'volgende' });
    t = voorspelReducer(t, { type: 'kies', letter: juisteLetter(t) });
    t = voorspelReducer(t, { type: 'volgende' });
    t = voorspelReducer(t, { type: 'kies', letter: juisteLetter(t) });
    expect(voorspelBewijs(t)).toEqual({ id: '4-voorspel', juist: true, fout: 'schaduw aan de kant van de lamp' });
  });

  it('twee fout is niet juist', () => {
    let t = beginVoorspel();
    for (let r = 0; r < AANTAL_RONDES; r++) {
      const fout = [0, 1, 2].find((i) => i !== juisteLetter(t)) as number;
      t = voorspelReducer(t, { type: 'kies', letter: r === 0 ? juisteLetter(t) : fout });
      if (r < AANTAL_RONDES - 1) t = voorspelReducer(t, { type: 'volgende' });
    }
    expect(voorspelBewijs(t)?.juist).toBe(false);
  });

  it('dubbel tikken: de eerste keuze van een ronde telt, een tweede doet niets', () => {
    const j = juisteLetter(beginVoorspel());
    const fout = [0, 1, 2].find((i) => i !== j) as number;
    const een = speel([{ type: 'kies', letter: fout }]);
    const twee = voorspelReducer(een, { type: 'kies', letter: j });
    expect(twee).toBe(een);
    expect(twee.keuzes[0]).toBe(fout);
    const dubbel = voorspelReducer(een, { type: 'kies', letter: fout });
    expect(dubbel).toBe(een);
  });

  it('een ongeldige letter doet niets', () => {
    const t = beginVoorspel();
    for (const letter of [-1, 3, 1.5, NaN, Infinity]) expect(voorspelReducer(t, { type: 'kies', letter })).toBe(t);
    expect(voorspelReducer(t, { type: 'kies', letter: undefined as unknown as number })).toBe(t);
  });

  it("'volgende' kan pas na de uitkomst en niet na de laatste ronde", () => {
    const t = beginVoorspel();
    expect(voorspelReducer(t, { type: 'volgende' })).toBe(t);
    let u = speel([{ type: 'toon' }, { type: 'volgende' }, { type: 'toon' }, { type: 'volgende' }, { type: 'toon' }]);
    expect(u.ronde).toBe(AANTAL_RONDES - 1);
    expect(voorspelReducer(u, { type: 'volgende' })).toBe(u);
    u = voorspelReducer(u, { type: 'toon' });
    expect(u.getoond).toBe(true);
  });

  it("'toon' zonder keuze (het bord) geeft geen uitkomst en geen bewijs, en sluit de keuze van die ronde", () => {
    const t = speel([{ type: 'toon' }]);
    expect(t.getoond).toBe(true);
    expect(uitkomstVan(t)).toBeNull();
    expect(voorspelReducer(t, { type: 'kies', letter: 0 })).toBe(t);
    expect(voorspelReducer(t, { type: 'toon' })).toBe(t);
    const klaar = speel([{ type: 'toon' }, { type: 'volgende' }, { type: 'toon' }, { type: 'volgende' }, { type: 'toon' }]);
    expect(voorspelBewijs(klaar)).toBeNull();
  });

  it("'opnieuw' begint weer bij ronde 1", () => {
    const t = speel([{ type: 'kies', letter: 0 }, { type: 'volgende' }, { type: 'opnieuw' }]);
    expect(t).toEqual(beginVoorspel());
  });

  it('elke letter heeft een plaats in woorden', () => {
    const t = beginVoorspel();
    for (let i = 0; i < 3; i++) expect(['links', 'rechts', 'in het midden']).toContain(letterPlaats(t, i));
  });
});
