import { beforeEach, describe, expect, it } from 'vitest';
import { importProgress } from './progressTransfer';
import { getSubmissions } from './storage';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

const bestand = (submissions: unknown[]) => JSON.stringify({ app: 'boosterz', kind: 'voortgang', v: 1, naam: 'Emma', datum: '', submissions });
const inzending = (over: Record<string, unknown> = {}) => ({
  id: 's1', widgetId: 'w1', widgetCode: 'ABC', studentName: 'Emma', startedAt: 1, submittedAt: 2, durationSec: 1,
  answers: { q1: 1 }, itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted', ...over,
});

describe('importProgress (zelfde sanering als resultaatcodes)', () => {
  it('slaat kapotte inzendingen over en saneert de rest', () => {
    const res = importProgress(bestand([
      inzending(),
      inzending({ id: 's2', submittedAt: 3, itemScores: 'nee', totalMax: 'x' }),
      inzending({ id: 's3', studentName: 12345 }),
      inzending({ id: 's4', answers: [1] }),
      'onzin',
    ]))!;
    expect(res.imported).toBe(2);
    const s2 = getSubmissions().find((s) => s.id === 's2')!;
    expect(s2.itemScores).toBeNull();
    expect(s2.totalMax).toBe(0);
  });

  it('een ouder bestand zonder indienmoment of id blijft inleesbaar', () => {
    const res = importProgress(bestand([inzending({ id: undefined, submittedAt: undefined })]))!;
    expect(res.imported).toBe(1);
    const s = getSubmissions()[0];
    expect(typeof s.id).toBe('string');
    expect(typeof s.submittedAt).toBe('number');
  });

  it('ontdubbelt binnen het bestand en tegenover wat er al staat', () => {
    expect(importProgress(bestand([inzending(), inzending({ id: 'ander' })]))!.imported).toBe(1);
    expect(importProgress(bestand([inzending()]))!.imported).toBe(0);
    expect(getSubmissions()).toHaveLength(1);
  });

  it('geen voortgangsbestand: null', () => {
    expect(importProgress('{"kind":"pakket"}')).toBeNull();
    expect(importProgress('{')).toBeNull();
  });
});
