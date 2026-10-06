import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Het echte opruimen gaat via IndexedDB (pdfStore); hier tellen we alleen
// welke bestanden weg moeten. collectFileIds blijft de echte.
const cleanup = vi.hoisted(() => vi.fn<(ids: Iterable<string>) => void>());
vi.mock('./storage', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./storage')>();
  return { ...echt, cleanupStudentFiles: cleanup };
});

import { AUTOSAVE_MAX_AGE_MS, clearProgress, expiredFilesCleanup, hasProgress, loadProgress, saveProgress } from './autosave';

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

/** De ids die cleanupStudentFiles over alle aanroepen samen kreeg. */
const opgeruimd = () => cleanup.mock.calls.flatMap(([ids]) => [...ids]).sort();
const upload = (fileId: string) => ({ name: 'werk.pdf', size: 1234, fileId });

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('verlopen tussentijds werk (OP13)', () => {
  it('wist bij het verlopen ook de ingeleverde bestanden die alleen daar in stonden', async () => {
    saveProgress('w1', 'Emma', { q1: upload('bestand1'), q2: 'tekst', q3: upload('bestand2') }, 0);
    vi.setSystemTime(Date.now() + AUTOSAVE_MAX_AGE_MS + 1000);
    expect(loadProgress('w1', 'Emma')).toBeNull();
    expect(localStorage.getItem('wf.autosave.w1.emma')).toBeNull();
    await expiredFilesCleanup;
    expect(opgeruimd()).toEqual(['bestand1', 'bestand2']);
  });

  it('laat een bestand staan waar een ingediende inzending nog naar verwijst', async () => {
    saveProgress('w1', 'Emma', { q1: upload('gedeeld'), q2: upload('alleenhier') }, 0);
    localStorage.setItem('wf.submissions.v1', JSON.stringify([{ id: 's1', widgetId: 'w1', answers: { q1: upload('gedeeld') } }]));
    vi.setSystemTime(Date.now() + AUTOSAVE_MAX_AGE_MS + 1000);
    expect(hasProgress('w1', 'Emma')).toBe(false);
    await expiredFilesCleanup;
    expect(opgeruimd()).toEqual(['alleenhier']);
  });

  it('ruimt niets op zolang het werk niet verlopen is', async () => {
    saveProgress('w1', 'Emma', { q1: upload('bestand1') }, 2);
    vi.setSystemTime(Date.now() + AUTOSAVE_MAX_AGE_MS - 1000);
    expect(loadProgress('w1', 'Emma')?.idx).toBe(2);
    await expiredFilesCleanup;
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('clearProgress (na indienen of opnieuw beginnen) wist nooit bestanden: de inzending heeft ze nodig', () => {
    saveProgress('w1', 'Emma', { q1: upload('bestand1') }, 0);
    clearProgress('w1', 'Emma');
    expect(localStorage.getItem('wf.autosave.w1.emma')).toBeNull();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('verlopen werk zonder bestanden geeft niets om op te ruimen', async () => {
    saveProgress('w1', 'Emma', { q1: 'a' }, 0);
    vi.setSystemTime(Date.now() + AUTOSAVE_MAX_AGE_MS + 1000);
    expect(loadProgress('w1', 'Emma')).toBeNull();
    await expiredFilesCleanup;
    expect(cleanup).not.toHaveBeenCalled();
  });
});
