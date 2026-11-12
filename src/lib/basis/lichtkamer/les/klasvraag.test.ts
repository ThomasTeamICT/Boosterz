import { describe, expect, it } from 'vitest';
import { beginStand } from '../kaartjes';
import { alleOplossingen } from '../kaartjes';
import { maakRonde } from '../rondes';
import {
  KLASVRAAG_GESLOTEN,
  SLUIT_NA_MS,
  klasvraagActiesBij,
  klasvraagReducer,
  klasvraagVoor,
  sluitNaMs,
  type KlasvraagActie,
  type KlasvraagToestand,
} from './klasvraag';

const speel = (acties: KlasvraagActie[], begin: KlasvraagToestand = KLASVRAAG_GESLOTEN) => acties.reduce(klasvraagReducer, begin);
const ctx = (ronde = 0) => ({ voorwerp: 'boom' as const, ronde, aantalRondes: 3, kaartjes: beginStand() });

describe('klasvraag (lesmachine)', () => {
  it('een hele klasvraag met alleen acties: open, de keuze van de klas aantikken, de uitkomst, volgende ronde, sluiten', () => {
    let t = speel([{ type: 'open', aantal: 3 }]);
    expect(t).toEqual({ open: true, aantal: 3, gekozen: null, getoond: false });
    t = speel([{ type: 'kies', i: 2 }], t);
    expect(t.gekozen).toBe(2);
    t = speel([{ type: 'kies', i: 1 }], t);
    expect(t.gekozen).toBe(1);
    t = speel([{ type: 'toon' }], t);
    expect(t.getoond).toBe(true);
    // na de uitkomst staan de keuzes vast
    expect(klasvraagReducer(t, { type: 'kies', i: 0 })).toBe(t);
    t = speel([{ type: 'volgende' }], t);
    expect(t).toEqual({ open: true, aantal: 3, gekozen: null, getoond: false });
    t = speel([{ type: 'toon' }, { type: 'sluit' }], t);
    expect(t).toEqual(KLASVRAAG_GESLOTEN);
  });

  it('een gesloten dialoog doet niets, behalve openen', () => {
    for (const a of [{ type: 'kies', i: 0 }, { type: 'toon' }, { type: 'volgende' }, { type: 'sluit' }] as KlasvraagActie[]) {
      expect(klasvraagReducer(KLASVRAAG_GESLOTEN, a)).toBe(KLASVRAAG_GESLOTEN);
    }
  });

  it('dubbel tikken: tweemaal openen of tonen verandert niets; een ongeldige keuze of aantal doet niets', () => {
    const open = speel([{ type: 'open', aantal: 3 }]);
    expect(klasvraagReducer(open, { type: 'open', aantal: 2 })).toBe(open);
    expect(klasvraagReducer(open, { type: 'kies', i: 3 })).toBe(open);
    expect(klasvraagReducer(open, { type: 'kies', i: -1 })).toBe(open);
    expect(klasvraagReducer(open, { type: 'volgende' })).toBe(open);
    const getoond = speel([{ type: 'toon' }], open);
    expect(klasvraagReducer(getoond, { type: 'toon' })).toBe(getoond);
    expect(klasvraagReducer(KLASVRAAG_GESLOTEN, { type: 'open', aantal: 1 })).toBe(KLASVRAAG_GESLOTEN);
    expect(klasvraagReducer(KLASVRAAG_GESLOTEN, { type: 'open', aantal: NaN })).toBe(KLASVRAAG_GESLOTEN);
  });

  it('sluit na 4,5 seconden, behalve in de prikkelarme stand', () => {
    expect(SLUIT_NA_MS).toBe(4500);
    expect(sluitNaMs(false)).toBe(4500);
    expect(sluitNaMs(true)).toBeNull();
  });

  it("'Waar valt de schaduw?': A, B of C, het juiste antwoord per ronde, en volgende ronde tot de laatste", () => {
    for (let r = 0; r < 3; r++) {
      const k = klasvraagVoor('waar-valt-de-schaduw', ctx(r));
      expect(k?.tekst).toBe('Waar valt de schaduw?');
      expect(k?.opties).toEqual(['A', 'B', 'C']);
      expect(k?.keuzes).toEqual(['A', 'B', 'C']);
      expect(k?.juist).toBe(maakRonde(r, 'boom').juistIdx);
      expect(k?.metVolgende).toBe(r < 2);
      expect(k?.uitleg).toBe('Iedereen kiest eerst: A, B of C. Tik dan aan wat de klas het meest koos.');
    }
  });

  it("'Drie kaartjes': ja of nee, met het woord bij het nummer", () => {
    const k = klasvraagVoor('drie-kaartjes', ctx());
    expect(k?.tekst).toBe('Komt het licht op het scherm?');
    expect(k?.keuzes).toEqual(['1 (ja)', '2 (nee)']);
    expect(k?.uitleg).toBe('Iedereen kiest eerst: 1 (ja) of 2 (nee). Tik dan aan wat de klas het meest koos.');
    expect(k?.juist).toBe(1);
    expect(k?.metVolgende).toBe(false);
    const op = alleOplossingen()[0]!;
    expect(klasvraagVoor('drie-kaartjes', { ...ctx(), kaartjes: op })?.juist).toBe(0);
  });

  it('het onderzoek heeft geen klasvraag', () => {
    expect(klasvraagVoor('onderzoek-schaduw', ctx())).toBeNull();
  });
});

describe('klasvraag en paneel lopen gelijk op', () => {
  const paneelActie = (t: KlasvraagToestand, a: { type: string }) => klasvraagActiesBij(a, t.open).reduce(klasvraagReducer, t);

  it('niets te doen als de klasvraag dicht is', () => {
    for (const type of ['kies', 'toon', 'volgende', 'opnieuw']) expect(klasvraagActiesBij({ type }, false)).toEqual([]);
    expect(klasvraagActiesBij({ type: 'iets-anders' }, true)).toEqual([]);
  });

  it("een keuze of 'toon' in het paneel toont de uitkomst ook in de dialoog", () => {
    const open = speel([{ type: 'open', aantal: 3 }, { type: 'kies', i: 1 }]);
    for (const type of ['kies', 'toon']) {
      const t = paneelActie(open, { type });
      expect(t.getoond, type).toBe(true);
      expect(t.gekozen).toBe(1);
    }
  });

  it("'volgende' in het paneel zet de dialoog terug naar een nieuwe ronde (niet getoond), ook als de uitkomst al getoond was", () => {
    const getoond = speel([{ type: 'open', aantal: 3 }, { type: 'kies', i: 2 }, { type: 'toon' }]);
    expect(paneelActie(getoond, { type: 'volgende' })).toEqual({ open: true, aantal: 3, gekozen: null, getoond: false });
    expect(paneelActie(getoond, { type: 'opnieuw' })).toEqual({ open: true, aantal: 3, gekozen: null, getoond: false });
    // een dialoog die pas na de uitkomst openging, krijgt ook een verse ronde
    const vers = speel([{ type: 'open', aantal: 3 }]);
    expect(paneelActie(vers, { type: 'volgende' })).toBe(vers);
  });

  it("de hele reeks: dialoog open, uitkomst, 'Volgende ronde' in het paneel: de dialoog toont ronde 2 nog niet", () => {
    let t = speel([{ type: 'open', aantal: 3 }, { type: 'toon' }]);
    expect(t.getoond).toBe(true);
    t = paneelActie(t, { type: 'volgende' });
    expect(t.getoond).toBe(false);
    expect(t.open).toBe(true);
    expect(klasvraagReducer(KLASVRAAG_GESLOTEN, { type: 'reset' })).toBe(KLASVRAAG_GESLOTEN);
  });
});
