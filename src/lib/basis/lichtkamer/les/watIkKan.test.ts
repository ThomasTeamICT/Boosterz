import { describe, expect, it } from 'vitest';
import { STATUS_TEKST } from '../../bewijs/bewijs';
import { lichtkamerMoment } from '../../bewijs/lichtkamerManifest';
import { LEGE_STAND, type BewijsStand } from './bewijsOntvanger';
import { STATUS_VORM, watIkKan } from './watIkKan';

const j = (juist: boolean) => ({ juist, fout: juist ? null : 'fout' });

describe("'Wat ik al kan'", () => {
  it('zonder bewijs: per doel van het manifest "nog geen bewijs"', () => {
    const rijen = watIkKan(LEGE_STAND);
    expect(rijen.map((r) => r.id)).toEqual(lichtkamerMoment('einde-4de')!.doelen.map((d) => d.id));
    expect(rijen.map((r) => r.id)).toEqual(['92767', '92775', '92777']);
    for (const r of rijen) {
      expect(r.status).toBe('nog-geen-bewijs');
      expect(r.woord).toBe('nog geen bewijs');
      expect(r.vorm).toBe('leeg');
      expect(r.kind.length).toBeGreaterThan(10);
    }
  });

  it('alles juist: toont het (92767 heeft vijf bewijzen, 92775 één, 92777 twee)', () => {
    const stand: BewijsStand = { '4c1': j(true), '4c2': j(true), '4c3': j(true), '4-kaartjes': j(true), '4-voorspel': j(true), '4-meten': j(true), '4-besluit': j(true) };
    expect(watIkKan(stand).map((r) => r.woord)).toEqual(['toont het', 'toont het', 'toont het']);
  });

  it('een doel met één juist en één fout bewijs is nog wankel; allemaal fout is nog niet', () => {
    const wankel = watIkKan({ '4c1': j(true), '4c2': j(false) });
    expect(wankel[0]!.status).toBe('nog-wankel');
    expect(wankel[0]!.vorm).toBe('wankel');
    const niet = watIkKan({ '4c1': j(false) });
    expect(niet[0]!.status).toBe('nog-niet');
    expect(niet[0]!.vorm).toBe('niet');
  });

  it('een doel met maar één juist bewijs van vijf is wankel, niet toont het (minstens twee nodig)', () => {
    expect(watIkKan({ '4c1': j(true) })[0]!.status).toBe('nog-wankel');
    expect(watIkKan({ '4c1': j(true), '4c2': j(true) })[0]!.status).toBe('toont-het');
  });

  it('92775 hangt alleen aan 4-meten; 92777 aan 4-meten en 4-besluit', () => {
    const r = watIkKan({ '4-meten': j(true) });
    expect(r[1]!.status).toBe('toont-het');
    expect(r[2]!.status).toBe('nog-wankel');
    expect(watIkKan({ '4-meten': j(true), '4-besluit': j(false) })[2]!.status).toBe('nog-wankel');
    expect(watIkKan({ '4-meten': j(false), '4-besluit': j(false) })[2]!.status).toBe('nog-niet');
  });

  it('de woorden zijn die van STATUS_TEKST en elke stand heeft een eigen vorm', () => {
    for (const [status, woord] of Object.entries(STATUS_TEKST)) {
      expect(woord.length).toBeGreaterThan(0);
      expect(STATUS_VORM[status as keyof typeof STATUS_VORM]).toBeDefined();
    }
    expect(new Set(Object.values(STATUS_VORM)).size).toBe(4);
  });

  it('een vreemd bewijs-id telt niet mee', () => {
    expect(watIkKan({ 'bestaat-niet': j(true) }).every((r) => r.status === 'nog-geen-bewijs')).toBe(true);
  });

  it('een onbekend moment geeft geen rijen', () => {
    expect(watIkKan(LEGE_STAND, 'bestaat-niet' as never)).toEqual([]);
  });
});
