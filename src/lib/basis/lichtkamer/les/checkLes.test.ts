import { describe, expect, it } from 'vitest';
import { CHECKS_4, juisteIndex } from '../checks';
import {
  AANTAL_VRAGEN,
  beginCheckLes,
  beginCheckLesUitStand,
  checkBewijzen,
  checkReducer,
  eersteAntwoordBij,
  huidigeVraag,
  isKlaar,
  uitkomstBij,
  type CheckLesActie,
  type CheckLesToestand,
} from './checkLes';

const speel = (acties: CheckLesActie[], begin: CheckLesToestand = beginCheckLes()) => acties.reduce(checkReducer, begin);
const fout = (i: number) => CHECKS_4[i]!.opties.findIndex((o) => !o.juist);
const alleJuist = (): CheckLesActie[] => CHECKS_4.flatMap((v) => [{ type: 'kies', keuze: juisteIndex(v) } as CheckLesActie, { type: 'volgende' } as CheckLesActie]);

describe('check (lesmachine)', () => {
  it('begint bij vraag 1 zonder bewijs', () => {
    const t = beginCheckLes();
    expect(huidigeVraag(t)?.id).toBe('4c1');
    expect(isKlaar(t)).toBe(false);
    expect(checkBewijzen(t)).toEqual([]);
  });

  it('een hele check met alleen acties: drie juiste antwoorden', () => {
    let t = beginCheckLes();
    for (let i = 0; i < AANTAL_VRAGEN; i++) {
      expect(huidigeVraag(t)?.id).toBe(CHECKS_4[i]!.id);
      t = speel([{ type: 'kies', keuze: juisteIndex(CHECKS_4[i]!) }], t);
      expect(uitkomstBij(t, i)?.juist).toBe(true);
      t = speel([{ type: 'volgende' }], t);
    }
    expect(isKlaar(t)).toBe(true);
    expect(checkBewijzen(t)).toEqual([
      { id: '4c1', juist: true, fout: null },
      { id: '4c2', juist: true, fout: null },
      { id: '4c3', juist: true, fout: null },
    ]);
  });

  it('een fout antwoord geeft het foutpatroon en het juiste antwoord als uitleg', () => {
    const t = speel([{ type: 'kies', keuze: 0 }]);
    const u = uitkomstBij(t, 0);
    expect(u?.juist).toBe(false);
    expect(u?.fout).toBe('schaduw aan de kant van de lamp');
    expect(u?.uitleg).toMatch(/^Het juiste antwoord is C: /);
    expect(checkBewijzen(t)).toEqual([{ id: '4c1', juist: false, fout: 'schaduw aan de kant van de lamp' }]);
  });

  it('het eerste antwoord telt: dubbel tikken verandert niets', () => {
    const een = speel([{ type: 'kies', keuze: 0 }]);
    expect(checkReducer(een, { type: 'kies', keuze: juisteIndex(CHECKS_4[0]!) })).toBe(een);
    expect(checkReducer(een, { type: 'kies', keuze: 0 })).toBe(een);
  });

  it("'volgende' kan pas na een antwoord, en niet voorbij de laatste vraag", () => {
    const t = beginCheckLes();
    expect(checkReducer(t, { type: 'volgende' })).toBe(t);
    const klaar = speel(alleJuist());
    expect(isKlaar(klaar)).toBe(true);
    expect(checkReducer(klaar, { type: 'volgende' })).toBe(klaar);
    expect(checkReducer(klaar, { type: 'kies', keuze: 0 })).toBe(klaar);
  });

  it('een ongeldige keuze doet niets', () => {
    const t = beginCheckLes();
    for (const keuze of [-1, 3, 0.5, NaN]) expect(checkReducer(t, { type: 'kies', keuze })).toBe(t);
  });

  it("'opnieuw' kan alleen na de laatste vraag", () => {
    const t = speel([{ type: 'kies', keuze: 0 }]);
    expect(checkReducer(t, { type: 'opnieuw' })).toBe(t);
  });

  it('daarna mag het kind de check nog eens proberen: de eerste antwoorden blijven het bewijs', () => {
    // eerste ronde: overal een fout antwoord
    let t = speel(CHECKS_4.flatMap((_, i) => [{ type: 'kies', keuze: fout(i) } as CheckLesActie, { type: 'volgende' } as CheckLesActie]));
    const bewijsEerst = checkBewijzen(t);
    expect(bewijsEerst.every((b) => !b.juist)).toBe(true);
    expect(eersteAntwoordBij(t, 0)).toBeNull();
    // oefenronde: overal juist
    t = speel([{ type: 'opnieuw' }], t);
    expect(t.oefenronde).toBe(true);
    expect(t.vraag).toBe(0);
    expect(t.antwoorden).toEqual([null, null, null]);
    for (let i = 0; i < AANTAL_VRAGEN; i++) {
      t = speel([{ type: 'kies', keuze: juisteIndex(CHECKS_4[i]!) }], t);
      expect(uitkomstBij(t, i)?.juist).toBe(true);
      expect(eersteAntwoordBij(t, i)?.titel).toBe('Je eerste antwoord telt: nog niet.');
      t = speel([{ type: 'volgende' }], t);
    }
    expect(isKlaar(t)).toBe(true);
    expect(checkBewijzen(t)).toEqual(bewijsEerst);
  });
});

describe('de check na het herladen', () => {
  it('met alle drie de check-id\'s in de stand begint de check als oefenronde, met het eerste antwoord uit de stand', () => {
    const t = beginCheckLesUitStand({
      '4c1': { juist: false, fout: 'schaduw aan de kant van de lamp' },
      '4c2': { juist: true, fout: null },
      '4c3': { juist: false, fout: 'verwacht dat licht een bocht maakt' },
    });
    expect(t.oefenronde).toBe(true);
    expect(t.vraag).toBe(0);
    expect(t.eerste).toEqual([0, 0, 2]);
    expect(t.antwoorden).toEqual([null, null, null]);
    expect(checkBewijzen(t)).toEqual([
      { id: '4c1', juist: false, fout: 'schaduw aan de kant van de lamp' },
      { id: '4c2', juist: true, fout: null },
      { id: '4c3', juist: false, fout: 'verwacht dat licht een bocht maakt' },
    ]);
    expect(eersteAntwoordBij(t, 0)?.titel).toBe('Je eerste antwoord telt: nog niet.');
  });

  it('een onbekend foutpatroon geeft toch een foute optie; ontbreekt een id, dan begint de check gewoon', () => {
    const t = beginCheckLesUitStand({ '4c1': { juist: false, fout: 'iets vreemds' }, '4c2': { juist: true, fout: null }, '4c3': { juist: true, fout: null } });
    expect(t.eerste[0]).toBe(0);
    expect(beginCheckLesUitStand({ '4c1': { juist: true, fout: null }, '4c2': { juist: true, fout: null } })).toEqual(beginCheckLes());
    expect(beginCheckLesUitStand({})).toEqual(beginCheckLes());
  });
});
