// De bak die alles vrijgeeft (zuiver).
import { describe, expect, it, vi } from 'vitest';
import { Bak, luister } from './bak';

describe('bak', () => {
  it('geeft alles vrij, het laatst opgenomene eerst', () => {
    const volgorde: string[] = [];
    const b = new Bak();
    const a = b.neem({ dispose: () => volgorde.push('a') });
    b.bijHetOpruimen(() => volgorde.push('b'));
    b.neem({ dispose: () => volgorde.push('c') });
    expect(a).toBeDefined();
    expect(b.aantal).toBe(3);
    b.leeg();
    expect(volgorde).toEqual(['c', 'b', 'a']);
    expect(b.aantal).toBe(0);
  });

  it('twee keer leegmaken geeft niets twee keer vrij', () => {
    const f = vi.fn();
    const b = new Bak();
    b.bijHetOpruimen(f);
    b.leeg();
    b.leeg();
    expect(f).toHaveBeenCalledTimes(1);
    expect(b.keerLeeg).toBe(2);
  });

  it('een fout bij één ding houdt de rest niet tegen', () => {
    const waarschuw = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = vi.fn();
    const b = new Bak();
    b.bijHetOpruimen(f);
    b.bijHetOpruimen(() => {
      throw new Error('kapot');
    });
    expect(() => b.leeg()).not.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
    expect(waarschuw).toHaveBeenCalledTimes(1);
    waarschuw.mockRestore();
  });

  it('wat tijdens het leegmaken bijkomt, blijft voor de volgende keer', () => {
    const b = new Bak();
    const later = vi.fn();
    b.bijHetOpruimen(() => b.bijHetOpruimen(later));
    b.leeg();
    expect(later).not.toHaveBeenCalled();
    b.leeg();
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('luister haalt de luisteraar weer weg, met dezelfde opties', () => {
    const doel = new EventTarget();
    const f = vi.fn();
    const b = new Bak();
    luister(b, doel, 'tik', f, { passive: true });
    doel.dispatchEvent(new Event('tik'));
    expect(f).toHaveBeenCalledTimes(1);
    b.leeg();
    doel.dispatchEvent(new Event('tik'));
    expect(f).toHaveBeenCalledTimes(1);
  });
});
