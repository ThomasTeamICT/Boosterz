// Bewaarcontrole voor de cursuseditor (debugronde oktober 2026, CU2/OP4):
// saveCourseGuarded en onCoursesChangedElsewhere.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCourse, getCourses, onCoursesChangedElsewhere, saveCourse, saveCourseGuarded } from './courses';
import type { Course } from './courseTypes';

let full = false;
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw Object.assign(new Error('vol'), { name: 'QuotaExceededError' });
      data.set(k, String(v));
    },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

function course(over: Partial<Course> = {}): Course {
  return {
    id: 'c1', title: 'Water', author: '', coverEmoji: '💧', code: 'ABC123',
    chapters: [{ id: 'ch1', title: 'H1', sections: [{ id: 's1', title: 'S1', blocks: [] }] }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    createdAt: 1, updatedAt: 100,
    ...over,
  };
}

beforeEach(() => {
  full = false;
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  saveCourse(course(), { keepUpdatedAt: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe('saveCourseGuarded', () => {
  it('bewaart als de opgeslagen versie nog dezelfde is, met een nieuwe versie', () => {
    const r = saveCourseGuarded(course({ title: 'Nieuw' }), 100);
    expect(r.ok).toBe(true);
    const opgeslagen = getCourse('c1')!;
    expect(opgeslagen.title).toBe('Nieuw');
    expect(r.ok && opgeslagen.updatedAt === r.updatedAt).toBe(true);
    expect(opgeslagen.updatedAt).not.toBe(100);
  });

  it('schrijft niets als er intussen een andere versie staat, en geeft die terug', () => {
    saveCourse(course({ title: 'Van elders' }));
    const voor = localStorage.getItem('wf.courses.v1');
    const r = saveCourseGuarded(course({ title: 'Van mij' }), 100);
    expect(r).toMatchObject({ ok: false, reason: 'gewijzigd', stored: { title: 'Van elders' } });
    expect(localStorage.getItem('wf.courses.v1')).toBe(voor);
  });

  it('een oudere versie in de opslag is ook "anders" (geen vergelijking op nieuwer)', () => {
    saveCourse(course({ updatedAt: 5, title: 'Back-up' }), { keepUpdatedAt: true });
    expect(saveCourseGuarded(course({ title: 'Van mij' }), 100)).toMatchObject({ ok: false, reason: 'gewijzigd' });
    expect(getCourse('c1')?.title).toBe('Back-up');
  });

  it('brengt een elders verwijderde cursus niet stil terug', () => {
    localStorage.setItem('wf.courses.v1', '[]');
    expect(saveCourseGuarded(course({ title: 'Van mij' }), 100)).toEqual({ ok: false, reason: 'verwijderd' });
    expect(getCourses()).toHaveLength(0);
  });

  it('met force: toch bewaren, ook na verwijderen (met dezelfde code)', () => {
    localStorage.setItem('wf.courses.v1', '[]');
    const r = saveCourseGuarded(course({ title: 'Toch' }), 100, { force: true });
    expect(r.ok).toBe(true);
    expect(getCourse('c1')).toMatchObject({ title: 'Toch', code: 'ABC123' });
    saveCourse(course({ title: 'Van elders' }));
    expect(saveCourseGuarded(course({ title: 'Mijn keuze' }), 100, { force: true }).ok).toBe(true);
    expect(getCourse('c1')?.title).toBe('Mijn keuze');
    expect(getCourses()).toHaveLength(1);
  });

  it('volle opslag: "mislukt" en de opslag blijft zoals ze was', () => {
    full = true;
    expect(saveCourseGuarded(course({ title: 'Past niet' }), 100)).toEqual({ ok: false, reason: 'mislukt' });
    full = false;
    expect(getCourse('c1')).toMatchObject({ title: 'Water', updatedAt: 100 });
  });

  it('de nieuwe versie verschilt altijd van de vorige, ook in dezelfde milliseconde', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const r1 = saveCourseGuarded(course({ title: 'A' }), 100);
    expect(r1).toEqual({ ok: true, updatedAt: 101 });
    // Ook een derde keer: nooit terug naar een versie die een ander tabblad nog kent.
    const r2 = saveCourseGuarded(course({ title: 'B' }), 101);
    expect(r2).toEqual({ ok: true, updatedAt: 102 });
  });
});

describe('onCoursesChangedElsewhere', () => {
  function fakeWindow() {
    const target = new EventTarget();
    (globalThis as { window?: unknown }).window = target;
    return (key: string | null, area: unknown = localStorage) =>
      target.dispatchEvent(Object.assign(new Event('storage'), { key, storageArea: area }));
  }

  it('reageert alleen op de cursussen (of op alles wissen) in localStorage', () => {
    const fire = fakeWindow();
    const fn = vi.fn();
    const off = onCoursesChangedElsewhere(fn);
    fire('wf.widgets.v1');
    fire('wf.courseprogress.v1');
    expect(fn).not.toHaveBeenCalled();
    fire('wf.courses.v1');
    fire(null);
    expect(fn).toHaveBeenCalledTimes(2);
    fire('wf.courses.v1', { andere: 'opslag' }); // sessionStorage
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    fire('wf.courses.v1');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('zonder window (server, test): een lege opzegfunctie', () => {
    const off = onCoursesChangedElsewhere(() => {});
    expect(() => off()).not.toThrow();
  });
});
