import { beforeEach, describe, expect, it, vi } from 'vitest';

// IndexedDB bestaat hier niet: we tellen wat er opgeruimd zou worden.
const cleanup = vi.hoisted(() => vi.fn<(ids: Iterable<string>) => void>());
const prune = vi.hoisted(() => vi.fn<(opts: { only?: Iterable<string>; minAgeMs?: number }) => Promise<number>>(async () => 0));
vi.mock('./storage', async (importOriginal) => ({ ...(await importOriginal<typeof import('./storage')>()), cleanupStudentFiles: cleanup }));
vi.mock('./mediaStore', async (importOriginal) => ({ ...(await importOriginal<typeof import('./mediaStore')>()), pruneOrphanMedia: prune }));

import { cleanupExpiredAutosaveFiles, hasStudentData, studentDataKeys, unreferencedFileIds, wipeStudentData } from './leerlingWissen';
import { onStorageChange } from './storage';

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

const set = (k: string, v: unknown) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
const upload = (fileId: string) => ({ name: 'werk.pdf', size: 10, fileId });

/** Een leerkrachttoestel met van alles: leerling- én leerkrachtgegevens. */
function vulToestel() {
  set('wf.submissions.v1', [{ id: 's1', answers: { q1: upload('ingediend1'), q2: 'wfmedia:m_tekening1' } }]);
  set('wf.autosave.w1.emma', { answers: { q1: upload('nietingediend'), q2: 'wfmedia:m_tekening2' }, idx: 0, savedAt: 1 });
  set('wf.attempts.v1', { w1: { emma: 1 } });
  set('wf.coursenotes.c1', { s1: 'mijn notitie' });
  set('wf.markeringen.w2.emma', [{ from: 1, to: 4 }]);
  set('wf.leitner.w3', { k1: 2 });
  set('wf.deadline.w1.emma', '1700000000000');
  set('wf.classpacks.v1', [{ id: 'p1', students: ['Emma'] }]);
  // blijft staan
  set('wf.widgets.v1', [{ id: 'w1', config: { image: 'wfmedia:m_tekening2' } }]);
  set('wf.classes.v1', [{ id: 'k1', students: ['Emma', 'Noor'] }]);
  set('wf.feedbackbank.v1', ['Goed gedaan']);
  set('wf.ai.v1', { apiKey: 'sk-NEP' });
}

describe('wipeStudentData (V6)', () => {
  it('wist ook de ingeleverde bestanden van werk dat nog niet ingediend was', () => {
    vulToestel();
    const r = wipeStudentData();
    expect(r.fileIds).toEqual(['ingediend1', 'nietingediend']);
    expect(cleanup).toHaveBeenCalledWith(['ingediend1', 'nietingediend']);
  });

  it('geeft de tekeningen uit inzendingen én tussentijds werk door aan de opruiming, zonder leeftijdsgrens', () => {
    vulToestel();
    wipeStudentData();
    expect(prune).toHaveBeenCalledTimes(1);
    const opts = prune.mock.calls[0][0];
    expect([...(opts.only ?? [])].sort()).toEqual(['m_tekening1', 'm_tekening2']);
    expect(opts.minAgeMs).toBe(0);
  });

  it('wist alle leerlingsleutels en laat klaslijsten, feedbackbank, widgets en de AI-sleutel staan', () => {
    vulToestel();
    const r = wipeStudentData();
    expect(r.keys).toEqual([
      'wf.attempts.v1', 'wf.autosave.w1.emma', 'wf.classpacks.v1', 'wf.coursenotes.c1', 'wf.deadline.w1.emma',
      'wf.leitner.w3', 'wf.markeringen.w2.emma', 'wf.submissions.v1',
    ]);
    const over = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort();
    expect(over).toEqual(['wf.ai.v1', 'wf.classes.v1', 'wf.feedbackbank.v1', 'wf.widgets.v1']);
    expect(hasStudentData()).toBe(false);
  });

  it('wist geen bestand waar nog iets anders naar verwijst', () => {
    set('wf.autosave.w1.emma', { answers: { q1: upload('gedeeld'), q2: upload('enkelhier') } });
    set('wf.widgets.v1', [{ id: 'w9', note: 'verwijst toevallig naar gedeeld' }]);
    expect(wipeStudentData().fileIds).toEqual(['enkelhier']);
  });

  it('verwittigt de schermen (opslaglaag) na het wissen', () => {
    vulToestel();
    const fn = vi.fn();
    const stop = onStorageChange(fn);
    wipeStudentData();
    stop();
    expect(fn).toHaveBeenCalled();
  });

  it('een leeg toestel: niets te wissen, geen fout', () => {
    const r = wipeStudentData();
    expect(r.keys).toEqual([]);
    expect(r.fileIds).toEqual([]);
    expect(prune).not.toHaveBeenCalled();
  });
});

describe('hasStudentData (knop inschakelen)', () => {
  it('ook zonder inzendingen: notities of tussentijds werk tellen', () => {
    expect(hasStudentData()).toBe(false);
    set('wf.coursenotes.c1', { s1: 'notitie' });
    expect(studentDataKeys()).toEqual(['wf.coursenotes.c1']);
    expect(hasStudentData()).toBe(true);
  });

  it('lege lijsten en objecten tellen niet, leerkrachtgegevens ook niet', () => {
    set('wf.submissions.v1', '[]');
    set('wf.attempts.v1', '{}');
    set('wf.classes.v1', [{ id: 'k1' }]);
    expect(hasStudentData()).toBe(false);
  });

  it('onleesbare opslag: niets', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      get length() { throw new Error('geblokkeerd'); },
    } as unknown as Storage;
    expect(hasStudentData()).toBe(false);
  });
});

describe('unreferencedFileIds', () => {
  it('houdt alleen ids over waar geen wf.*-sleutel naar verwijst', () => {
    localStorage.setItem('wf.submissions.v1', '[{"answers":{"q":{"fileId":"a1"}}}]');
    localStorage.setItem('wf.autosave.w2.jan', '{"answers":{"q":{"fileId":"b2"}}}');
    localStorage.setItem('ander.sleutel', 'c3'); // geen Boosterz-sleutel: telt niet
    expect([...unreferencedFileIds(['a1', 'b2', 'c3', 'd4'])].sort()).toEqual(['c3', 'd4']);
  });

  it('gooit bij twijfel niets weg: onleesbare opslag geeft een lege lijst', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      get length() { throw new Error('geblokkeerd'); },
    } as unknown as Storage;
    expect([...unreferencedFileIds(['a1'])]).toEqual([]);
  });

  it('een lege invoer blijft leeg', () => {
    expect(unreferencedFileIds([]).size).toBe(0);
  });
});

describe('cleanupExpiredAutosaveFiles (OP13)', () => {
  it('ruimt alleen de bestanden op die nergens anders meer voorkomen', () => {
    set('wf.submissions.v1', [{ answers: { q: upload('ingediend') } }]);
    cleanupExpiredAutosaveFiles(JSON.stringify({ answers: { a: upload('ingediend'), b: upload('verlopen') } }));
    expect(cleanup).toHaveBeenCalledWith(new Set(['verlopen']));
  });
});
