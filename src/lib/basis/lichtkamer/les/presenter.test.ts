import { describe, expect, it } from 'vitest';
import { OEFENING_VOLGORDE } from './teksten';
import { focusSoort, naastOefening, presenterActie, type FocusSoort, type PresenterContext } from './presenter';

const bord = (o: Partial<PresenterContext> = {}): PresenterContext => ({ stand: 'bord', oefening: 'waar-valt-de-schaduw', uitkomstGetoond: false, ...o });
const SOORTEN: FocusSoort[] = ['geen', 'knop', 'link', 'invoer', 'tab', 'overig'];

describe('presentertoetsen op het bord', () => {
  it('PageDown en PageUp gaan naar de volgende en vorige oefening, ook als een knop, link of tab de focus heeft', () => {
    for (const f of SOORTEN.filter((s) => s !== 'invoer')) {
      expect(presenterActie('PageDown', f, bord()), f).toEqual({ type: 'volgende-oefening' });
      expect(presenterActie('PageUp', f, bord()), f).toEqual({ type: 'vorige-oefening' });
    }
  });

  it('spatie toont de uitkomst alleen als geen knop, link, tab of invoerveld de focus heeft', () => {
    expect(presenterActie(' ', 'geen', bord())).toEqual({ type: 'toon-uitkomst' });
    expect(presenterActie(' ', 'overig', bord())).toEqual({ type: 'toon-uitkomst' });
    for (const f of ['knop', 'link', 'tab', 'invoer'] as FocusSoort[]) expect(presenterActie(' ', f, bord()), f).toBeNull();
  });

  it('spatie doet niets als de uitkomst al getoond is of de oefening geen uitkomst heeft', () => {
    expect(presenterActie(' ', 'geen', bord({ uitkomstGetoond: true }))).toBeNull();
    expect(presenterActie(' ', 'geen', bord({ oefening: 'drie-kaartjes' }))).toBeNull();
    expect(presenterActie(' ', 'geen', bord({ oefening: null }))).toBeNull();
  });

  it('in een invoerveld doet geen enkele presentertoets iets', () => {
    for (const t of ['PageDown', 'PageUp', ' ']) expect(presenterActie(t, 'invoer', bord())).toBeNull();
  });

  it('op het kindscherm en bij uitproberen doen de presentertoetsen niets', () => {
    for (const stand of ['kind', 'uitproberen'] as const) for (const t of ['PageDown', 'PageUp', ' ']) expect(presenterActie(t, 'geen', bord({ stand }))).toBeNull();
  });

  it('andere toetsen doen niets', () => {
    for (const t of ['Enter', 'ArrowRight', 'Tab', 'a', 'Escape', 'Home', '']) expect(presenterActie(t, 'geen', bord())).toBeNull();
  });

  it('vertaalt een gefocust element naar zijn soort', () => {
    expect(focusSoort('BUTTON', null, false)).toBe('knop');
    expect(focusSoort('summary', null, false)).toBe('knop');
    expect(focusSoort('div', 'button', false)).toBe('knop');
    expect(focusSoort('a', null, false)).toBe('link');
    expect(focusSoort('input', null, false)).toBe('invoer');
    expect(focusSoort('SELECT', null, false)).toBe('invoer');
    expect(focusSoort('textarea', null, false)).toBe('invoer');
    expect(focusSoort('div', null, true)).toBe('invoer');
    expect(focusSoort('div', 'tab', false)).toBe('tab');
    expect(focusSoort('body', null, false)).toBe('geen');
    expect(focusSoort(undefined, undefined, false)).toBe('geen');
    expect(focusSoort('canvas', null, false)).toBe('overig');
  });
});

describe('de volgorde van de oefeningen', () => {
  it('loopt rond: na de laatste komt weer de eerste, voor de eerste de laatste', () => {
    expect(naastOefening('waar-valt-de-schaduw', 'volgende')).toBe('drie-kaartjes');
    expect(naastOefening('drie-kaartjes', 'volgende')).toBe('onderzoek-schaduw');
    expect(naastOefening('onderzoek-schaduw', 'volgende')).toBe('waar-valt-de-schaduw');
    expect(naastOefening('waar-valt-de-schaduw', 'vorige')).toBe('onderzoek-schaduw');
    expect(naastOefening('onderzoek-schaduw', 'vorige')).toBe('drie-kaartjes');
  });

  it('zonder oefening in beeld begint volgende bij de eerste en vorige bij de laatste', () => {
    expect(naastOefening(null, 'volgende')).toBe(OEFENING_VOLGORDE[0]);
    expect(naastOefening(null, 'vorige')).toBe(OEFENING_VOLGORDE[2]);
  });

  it('de volgorde is die van het prototype: voorspellen, kaartjes, onderzoek', () => {
    expect(OEFENING_VOLGORDE).toEqual(['waar-valt-de-schaduw', 'drie-kaartjes', 'onderzoek-schaduw']);
  });
});
