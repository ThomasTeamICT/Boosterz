// De bewaarmotor van de cursuseditor (debugronde oktober 2026, pakket P6).
//
// Twee motoren op dezelfde (nagebootste) opslag spelen twee tabbladen na. Het
// storage-event van de browser wordt hier met de hand doorgegeven
// (`external()`), zodat ook de volgorde waarin dingen gebeuren vastligt.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCourse, getCourse, getCourses, pdfReferenceCount, saveCourse, saveCourseGuarded } from '../../lib/courses';
import type { Course, CourseBlock, CourseSection } from '../../lib/courseTypes';
import {
  courseCopy, coursePreviewHash, createCourseDraft, decideExternal, pdfIdsInBlocks, pdfRefsInCourse,
  sameCourseContent, sectionHasContent, type CourseDraft, type DraftStore,
} from './editorSync';

// ── Nagebootste opslag ──────────────────────────────────────────────────────

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

let deletedPdfs: string[] = [];
let copies = 0;
function store(over: Partial<DraftStore> = {}): DraftStore {
  return {
    read: (id) => getCourse(id),
    saveGuarded: (c, expected, opts) => saveCourseGuarded(c, expected, opts),
    saveNew: (c) => saveCourse(c),
    pdfRefsSaved: (id) => pdfReferenceCount(id),
    deletePdf: (id) => { deletedPdfs.push(id); },
    newId: () => `kopie${++copies}`,
    newCode: () => `KOP${copies}XY`,
    now: () => Date.now(),
    ...over,
  };
}

const text = (id: string, markdown: string): CourseBlock => ({ id, type: 'text', markdown });
const pdf = (id: string, pdfId: string): CourseBlock => ({ id, type: 'pdf', pdfId, name: `${pdfId}.pdf` });

function course(id = 'c1', blocks: CourseBlock[] = [text('b1', 'Hallo')], over: Partial<Course> = {}): Course {
  return {
    id, title: 'Water', author: 'Juf', coverEmoji: '💧', code: 'ABC123',
    chapters: [{ id: 'ch1', title: 'Hoofdstuk 1', sections: [{ id: 's1', title: 'Sectie 1', blocks }] }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    createdAt: 1000, updatedAt: 1000,
    ...over,
  };
}

/** Een cursus in de opslag zetten zoals een eerdere sessie hem bewaarde (updatedAt blijft). */
function seed(c: Course) {
  saveCourse(c, { keepUpdatedAt: true });
}

/** Een tabblad dat de cursus opent zoals de editor: vers uit de opslag. */
function openTab(id = 'c1', s: DraftStore = store()): CourseDraft {
  return createCourseDraft(s, getCourse(id));
}

const retitle = (title: string) => (c: Course): Course => ({ ...c, title });
const rename = (title: string) => (c: Course): Course => ({
  ...c, chapters: c.chapters.map((ch, i) => (i === 0 ? { ...ch, title } : ch)),
});

beforeEach(() => {
  full = false;
  deletedPdfs = [];
  copies = 0;
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
  vi.useFakeTimers({ now: 50_000 });
  vi.spyOn(console, 'error').mockImplementation(() => {}); // "Opslaan mislukt" bij de volle opslag
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Zuivere hulpen ──────────────────────────────────────────────────────────

describe('decideExternal', () => {
  const base = { stamp: 10, dirty: false, busy: false, hasConflict: false };
  it('dezelfde versie: niets te doen', () => {
    expect(decideExternal({ ...base, stored: { updatedAt: 10 } })).toBe('niets');
  });
  it('andere versie zonder eigen wijzigingen: gewoon herladen', () => {
    expect(decideExternal({ ...base, stored: { updatedAt: 11 } })).toBe('herladen');
  });
  it('een oudere versie (bewust vervangen door een back-up) telt ook als wijziging', () => {
    expect(decideExternal({ ...base, stored: { updatedAt: 3 } })).toBe('herladen');
    expect(decideExternal({ ...base, dirty: true, stored: { updatedAt: 3 } })).toBe('conflict-gewijzigd');
  });
  it('eigen wijzigingen of een open AI-venster: conflict, niets overschrijven', () => {
    expect(decideExternal({ ...base, dirty: true, stored: { updatedAt: 11 } })).toBe('conflict-gewijzigd');
    expect(decideExternal({ ...base, busy: true, stored: { updatedAt: 11 } })).toBe('conflict-gewijzigd');
  });
  it('verwijderd: altijd een conflict, ook zonder eigen wijzigingen', () => {
    expect(decideExternal({ ...base, stored: undefined })).toBe('conflict-verwijderd');
  });
  it('de opslag staat weer op onze versie: het conflict is opgelost', () => {
    expect(decideExternal({ ...base, dirty: true, hasConflict: true, stored: { updatedAt: 10 } })).toBe('opgelost');
  });
  it('een andere versie met dezelfde inhoud als op het scherm is geen conflict (E5)', () => {
    expect(decideExternal({ ...base, dirty: true, sameContent: true, stored: { updatedAt: 11 } })).toBe('gelijk');
    expect(decideExternal({ ...base, busy: true, sameContent: true, stored: { updatedAt: 11 } })).toBe('gelijk');
    expect(decideExternal({ ...base, dirty: true, hasConflict: true, sameContent: true, stored: { updatedAt: 11 } })).toBe('gelijk');
  });
  it('dezelfde inhoud verandert niets aan de andere uitkomsten', () => {
    // zonder eigen wijzigingen: gewoon herladen (de nieuwe versie wordt de basis)
    expect(decideExternal({ ...base, sameContent: true, stored: { updatedAt: 11 } })).toBe('herladen');
    expect(decideExternal({ ...base, dirty: true, sameContent: true, stored: { updatedAt: 10 } })).toBe('niets');
    expect(decideExternal({ ...base, dirty: true, sameContent: true, stored: undefined })).toBe('conflict-verwijderd');
    expect(decideExternal({ ...base, dirty: true, sameContent: false, stored: { updatedAt: 11 } })).toBe('conflict-gewijzigd');
  });
});

describe('sameCourseContent (E5)', () => {
  it('negeert alleen het tijdstempel', () => {
    expect(sameCourseContent(course(), { ...course(), updatedAt: 9999 })).toBe(true);
    expect(sameCourseContent(course(), { ...course(), createdAt: 5 })).toBe(false);
  });
  it('is gelijk bij een nieuw object met dezelfde inhoud, ook met een andere sleutelvolgorde', () => {
    const a = course();
    // dezelfde velden, in omgekeerde volgorde
    const b = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(a))).reverse()) as unknown as Course;
    expect(Object.keys(b)[0]).not.toBe(Object.keys(a)[0]);
    expect(sameCourseContent(a, b)).toBe(true);
  });
  it('ziet een verschil in titel, blok of instelling', () => {
    expect(sameCourseContent(course(), course('c1', [text('b1', 'Hallo')], { title: 'Andere titel' }))).toBe(false);
    expect(sameCourseContent(course(), course('c1', [text('b1', 'Hallo!')]))).toBe(false);
    expect(sameCourseContent(course(), course('c1', [text('b1', 'Hallo'), text('b2', '')]))).toBe(false);
    const c = course();
    expect(sameCourseContent(c, { ...c, settings: { ...c.settings, requireName: true } })).toBe(false);
  });
  it('een niet-leesbare waarde telt als "niet gelijk" (veilige kant)', () => {
    const a = course();
    const rond = { ...course() } as unknown as { self?: unknown };
    rond.self = rond;
    expect(sameCourseContent(a, rond as unknown as Course)).toBe(false);
  });
});

describe('sectionHasContent (CU15e)', () => {
  const s = (over: Partial<CourseSection>): CourseSection => ({ id: 's', title: 'Titel', blocks: [], ...over });
  it('leeg: geen blokken, doelen of doelcodes', () => {
    expect(sectionHasContent(s({}))).toBe(false);
    expect(sectionHasContent(s({ goals: ['', '   '] }))).toBe(false);
  });
  it('doelcodes of een leerdoel tellen als inhoud, ook zonder blokken', () => {
    expect(sectionHasContent(s({ goalCodes: ['NW 4.1'] }))).toBe(true);
    expect(sectionHasContent(s({ goals: ['Ik kan verdamping uitleggen'] }))).toBe(true);
    expect(sectionHasContent(s({ blocks: [text('b', '')] }))).toBe(true);
  });
});

describe('kleine hulpen', () => {
  it('de voorbeeldlink opent de lezer in voorbeeldmodus (CU15c)', () => {
    expect(coursePreviewHash('ABC123')).toBe('#/cursus/lees/ABC123?voorbeeld=1');
  });
  it('een kopie krijgt een eigen id, code en herkenbare titel', () => {
    const k = courseCopy(course(), { id: 'n1', code: 'NIEUW1', now: 7 });
    expect(k).toMatchObject({ id: 'n1', code: 'NIEUW1', title: 'Water (mijn versie)', createdAt: 7, updatedAt: 7 });
    expect(courseCopy(course('c', [], { title: '  ' }), { id: 'x', code: 'X', now: 1 }).title).toBe('Naamloze cursus (mijn versie)');
  });
  it('pdf-verwijzingen tellen', () => {
    const c = course('c1', [pdf('p1', 'A'), text('t', 'x'), pdf('p2', 'A'), pdf('p3', 'B')]);
    expect(pdfIdsInBlocks(c.chapters[0].sections[0].blocks)).toEqual(['A', 'A', 'B']);
    expect(pdfRefsInCourse(c, 'A')).toBe(2);
    expect(pdfRefsInCourse(c, 'C')).toBe(0);
  });
});

// ── Eén tabblad ─────────────────────────────────────────────────────────────

describe('bewaren in één tabblad', () => {
  it('openen schrijft niets: updatedAt blijft staan', () => {
    seed(course());
    const a = openTab();
    vi.advanceTimersByTime(5000);
    expect(getCourse('c1')?.updatedAt).toBe(1000);
    expect(a.getSnapshot()).toMatchObject({ status: 'idle', dirty: false, conflict: null });
  });

  it('een wijziging wordt na de pauze bewaard; "Bewaard" pas daarna', () => {
    seed(course());
    const a = openTab();
    a.edit(retitle('Water en wolken'));
    expect(a.getSnapshot()).toMatchObject({ status: 'saving', dirty: true });
    vi.advanceTimersByTime(799);
    expect(getCourse('c1')?.title).toBe('Water');
    vi.advanceTimersByTime(1);
    expect(getCourse('c1')?.title).toBe('Water en wolken');
    expect(a.getSnapshot()).toMatchObject({ status: 'saved', dirty: false, saveFailed: false });
    expect(a.getSnapshot().savedAt).toBeGreaterThan(0);
  });

  it('volle opslag (CU7): nooit "Bewaard", wijzigingen blijven op het scherm, opnieuw proberen lukt later', () => {
    seed(course());
    const a = openTab();
    full = true;
    a.edit(retitle('Nieuwe titel'));
    vi.advanceTimersByTime(800);
    expect(getCourse('c1')?.title).toBe('Water');
    expect(a.getSnapshot()).toMatchObject({ status: 'idle', saveFailed: true, dirty: true });
    expect(a.current()?.title).toBe('Nieuwe titel');
    expect(a.save()).toBe('mislukt');
    full = false;
    expect(a.save()).toBe('bewaard');
    expect(getCourse('c1')?.title).toBe('Nieuwe titel');
    expect(a.getSnapshot()).toMatchObject({ status: 'saved', saveFailed: false, dirty: false });
  });

  it('twee bewaringen in dezelfde milliseconde krijgen toch een andere versie', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Een'));
    expect(a.save()).toBe('bewaard');
    const v1 = getCourse('c1')!.updatedAt;
    a.edit(retitle('Twee'));
    expect(a.save()).toBe('bewaard');
    const v2 = getCourse('c1')!.updatedAt;
    expect(v2).not.toBe(v1); // de klok staat stil (nepklok), toch twee versies
    // Het andere tabblad merkt dus ook de tweede wijziging op.
    b.edit(rename('van B'));
    expect(b.save()).toBe('conflict');
    expect(getCourse('c1')?.title).toBe('Twee');
  });

  it('oude data zonder updatedAt geeft geen vals conflict', () => {
    const oud = course();
    delete (oud as Partial<Course>).updatedAt;
    localStorage.setItem('wf.courses.v1', JSON.stringify([oud]));
    const a = openTab();
    a.edit(retitle('Bijgewerkt'));
    expect(a.save()).toBe('bewaard');
    expect(getCourse('c1')?.title).toBe('Bijgewerkt');
  });
});

// ── Twee tabbladen (CU2 = OP4) ──────────────────────────────────────────────

describe('twee tabbladen met dezelfde cursus', () => {
  it('zonder eigen wijzigingen toont het andere tabblad gewoon de nieuwe versie', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    vi.advanceTimersByTime(800);
    expect(b.external()).toBe('herladen');
    expect(b.current()?.title).toBe('Van A');
    expect(b.getSnapshot()).toMatchObject({ status: 'reloaded', dirty: false, conflict: null });
    // B werkt verder op de versie van A: niets gaat verloren.
    b.edit(rename('Hoofdstuk van B'));
    vi.advanceTimersByTime(800);
    expect(a.external()).toBe('herladen');
    const opgeslagen = getCourse('c1')!;
    expect(opgeslagen.title).toBe('Van A');
    expect(opgeslagen.chapters[0].title).toBe('Hoofdstuk van B');
    expect(a.current()?.chapters[0].title).toBe('Hoofdstuk van B');
  });

  it('wijzigingen aan beide kanten: niets overschreven, automatisch bewaren pauzeert', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));           // A wacht nog op de pauze
    b.edit(rename('Van B'));
    expect(b.save()).toBe('bewaard');    // B bewaart eerst
    expect(a.external()).toBe('conflict-gewijzigd');
    vi.advanceTimersByTime(5000);        // de timer van A mag niets meer schrijven
    const opgeslagen = getCourse('c1')!;
    expect(opgeslagen.title).toBe('Water');
    expect(opgeslagen.chapters[0].title).toBe('Van B');
    const snap = a.getSnapshot();
    expect(snap.conflict?.kind).toBe('gewijzigd');
    expect(snap.dirty).toBe(true);
    expect(a.current()?.title).toBe('Van A'); // het werk van A staat nog op het scherm
    // Verder typen tijdens het conflict schrijft ook niets.
    a.edit(retitle('Van A, nog meer'));
    vi.advanceTimersByTime(5000);
    expect(getCourse('c1')?.title).toBe('Water');
  });

  it('ook zonder storage-event (het event komt te laat) schrijft de bewaarcontrole niet over B heen', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    b.edit(rename('Van B'));
    b.save();
    vi.advanceTimersByTime(800); // A bewaart zonder het event gezien te hebben
    expect(getCourse('c1')?.chapters[0].title).toBe('Van B');
    expect(getCourse('c1')?.title).toBe('Water');
    expect(a.getSnapshot().conflict?.kind).toBe('gewijzigd');
  });

  it('"Laad die versie": de versie uit de opslag, eigen wijzigingen vervallen bewust', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    b.edit(rename('Van B'));
    b.save();
    a.external();
    expect(a.loadTheirs()).toBe(true);
    expect(a.current()?.chapters[0].title).toBe('Van B');
    expect(a.current()?.title).toBe('Water');
    expect(a.getSnapshot()).toMatchObject({ conflict: null, dirty: false });
    // En daarna gewoon verder bewaren.
    a.edit(retitle('Daarna'));
    vi.advanceTimersByTime(800);
    expect(getCourse('c1')).toMatchObject({ title: 'Daarna' });
    expect(getCourse('c1')?.chapters[0].title).toBe('Van B');
  });

  it('"Mijn versie bewaren": bewust overschrijven; het andere tabblad volgt', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    b.edit(rename('Van B'));
    b.save();
    a.external();
    expect(a.keepMine()).toBe('bewaard');
    expect(getCourse('c1')?.title).toBe('Van A');
    expect(getCourse('c1')?.chapters[0].title).toBe('Hoofdstuk 1');
    expect(a.getSnapshot()).toMatchObject({ conflict: null, dirty: false, status: 'saved' });
    expect(b.external()).toBe('herladen');
    expect(b.current()?.title).toBe('Van A');
  });

  it('"Mijn versie als kopie": beide versies blijven bewaard', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    b.edit(rename('Van B'));
    b.save();
    a.external();
    const kopie = a.saveCopy();
    expect(kopie).not.toBeNull();
    const k = getCourse(kopie!.id)!;
    expect(k).toMatchObject({ title: 'Van A (mijn versie)', code: kopie!.code });
    expect(k.id).not.toBe('c1');
    expect(k.code).not.toBe('ABC123');
    expect(getCourse('c1')?.chapters[0].title).toBe('Van B');
    expect(getCourse('c1')?.title).toBe('Water');
    // Het origineel op het scherm is nu de versie uit de opslag: niets meer te bewaren.
    expect(a.current()?.chapters[0].title).toBe('Van B');
    expect(a.getSnapshot()).toMatchObject({ dirty: false, conflict: null });
  });

  it('een bewust teruggezette oudere back-up wordt niet overschreven', () => {
    seed(course());
    const a = openTab();
    a.edit(retitle('Nieuw in A'));
    // Een ander tabblad zet een oudere versie terug ("Vervangen"): updatedAt springt terug.
    saveCourse(course('c1', [text('b1', 'uit de back-up')], { updatedAt: 500 }), { keepUpdatedAt: true });
    vi.advanceTimersByTime(800);
    expect(getCourse('c1')?.updatedAt).toBe(500);
    expect(a.getSnapshot().conflict?.kind).toBe('gewijzigd');
  });

  it('elders verwijderd: geen stille terugkeer; "Toch bewaren" zet hem terug met dezelfde code', () => {
    seed(course());
    const a = openTab();
    deleteCourse('c1'); // in een ander tabblad
    expect(a.external()).toBe('conflict-verwijderd');
    a.edit(retitle('Nog bezig'));
    vi.advanceTimersByTime(5000);
    expect(getCourse('c1')).toBeUndefined();
    expect(a.save()).toBe('conflict');
    expect(getCourse('c1')).toBeUndefined();
    expect(a.keepMine()).toBe('bewaard');
    expect(getCourse('c1')).toMatchObject({ title: 'Nog bezig', code: 'ABC123' });
  });

  it('elders verwijderd en bewust weggegooid: weggaan schrijft niets', () => {
    seed(course());
    const a = openTab();
    deleteCourse('c1');
    a.external();
    a.edit(retitle('Weg ermee'));
    a.discard();
    expect(a.leave()).toEqual({ copy: null, failed: false });
    expect(getCourses()).toHaveLength(0);
  });

  it('een open AI-venster: geen stil herladen, en na sluiten zonder resultaat wel', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.setBusy(true);
    b.edit(rename('Van B'));
    b.save();
    expect(a.external()).toBe('conflict-gewijzigd');
    a.setBusy(false); // venster dicht zonder resultaat: niets te verliezen
    expect(a.getSnapshot().conflict).toBeNull();
    expect(a.current()?.chapters[0].title).toBe('Van B');
  });

  it('een andere cursus bewaren elders verandert niets', () => {
    seed(course());
    seed(course('c2'));
    const a = openTab();
    const b = openTab('c2');
    b.edit(retitle('Andere'));
    b.save();
    expect(a.external()).toBe('niets');
  });
});

// ── Weggaan ─────────────────────────────────────────────────────────────────

describe('weggaan (andere pagina, tabblad sluiten)', () => {
  it('zonder conflict: de laatste wijziging wordt meteen bewaard', () => {
    seed(course());
    const a = openTab();
    a.edit(retitle('Snel weg'));
    expect(a.leave()).toEqual({ copy: null, failed: false });
    expect(getCourse('c1')?.title).toBe('Snel weg');
  });

  it('met een conflict: de wijzigingen komen in een kopie, het origineel blijft', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    b.edit(rename('Van B'));
    b.save();
    const { copy, failed } = a.leave(); // het event kwam nooit aan
    expect(failed).toBe(false);
    expect(copy?.title).toBe('Van A (mijn versie)');
    expect(getCourse(copy!.id)?.title).toBe('Van A (mijn versie)');
    expect(getCourse('c1')?.chapters[0].title).toBe('Van B');
    expect(getCourse('c1')?.title).toBe('Water');
  });

  it('volle opslag: weggaan meldt dat er niets bewaard kon worden', () => {
    seed(course());
    const a = openTab();
    a.edit(retitle('Past niet'));
    full = true;
    expect(a.leave()).toEqual({ copy: null, failed: true });
  });

  it('niets gewijzigd: weggaan schrijft niets', () => {
    seed(course());
    const a = openTab();
    expect(a.leave()).toEqual({ copy: null, failed: false });
    expect(getCourse('c1')?.updatedAt).toBe(1000);
  });
});

// ── Pdf-bestanden opruimen (CU3) ────────────────────────────────────────────

describe('pdf-bestanden opruimen', () => {
  it('pas na een geslaagde bewaring, en niet zolang een ander blok het bestand nog gebruikt', () => {
    seed(course('c1', [pdf('p1', 'A'), pdf('p2', 'A')]));
    const a = openTab();
    // Eén blok weg: het duplicaat gebruikt het bestand nog.
    a.releasePdf('A');
    a.edit((c) => ({ ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [pdf('p2', 'A')] }] }] }));
    vi.advanceTimersByTime(800);
    expect(deletedPdfs).toEqual([]);
    // Ook het tweede weg: nu pas wissen, na het bewaren.
    a.releasePdf('A');
    a.edit((c) => ({ ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [] }] }] }));
    expect(deletedPdfs).toEqual([]);
    vi.advanceTimersByTime(800);
    expect(deletedPdfs).toEqual(['A']);
  });

  it('een niet-bewaard duplicaat op het scherm houdt het bestand ook vast', () => {
    seed(course('c1', [pdf('p1', 'A')]));
    const a = openTab();
    // Dupliceren en meteen het origineel loskoppelen, binnen de pauze: in de opslag staat maar één verwijzing.
    a.edit((c) => ({ ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [pdf('p1', 'A'), pdf('p9', 'A')] }] }] }));
    a.releasePdf('A');
    a.edit((c) => ({ ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [{ id: 'p1', type: 'pdf' }, pdf('p9', 'A')] }] }] }));
    vi.advanceTimersByTime(800);
    expect(deletedPdfs).toEqual([]);
  });

  it('een andere cursus met hetzelfde bestand houdt het vast', () => {
    seed(course('c1', [pdf('p1', 'A')]));
    seed(course('c2', [pdf('q1', 'A')], { code: 'ZZZ999' }));
    const a = openTab();
    a.releasePdf('A');
    a.edit((c) => ({ ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [] }] }] }));
    vi.advanceTimersByTime(800);
    expect(deletedPdfs).toEqual([]);
  });

  it('bij een conflict wordt niets gewist: "Laad die versie" brengt het blok terug', () => {
    seed(course('c1', [pdf('p1', 'A')]));
    const a = openTab();
    const b = openTab();
    a.releasePdf('A');
    a.edit((c) => ({ ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [] }] }] }));
    b.edit(retitle('Van B'));
    b.save();
    vi.advanceTimersByTime(800);
    expect(a.getSnapshot().conflict?.kind).toBe('gewijzigd');
    expect(deletedPdfs).toEqual([]);
    a.loadTheirs();
    expect(pdfRefsInCourse(a.current()!, 'A')).toBe(1);
    a.edit(retitle('Verder'));
    vi.advanceTimersByTime(800);
    expect(deletedPdfs).toEqual([]);
  });
});

// ── E5: een conflict is een verschil in inhoud ──────────────────────────────

describe('een wijziging zonder inhoudelijk verschil (E5)', () => {
  /** Nieuw object, zelfde inhoud: getypt en teruggedraaid. */
  const zonderVerschil = (c: Course): Course => ({ ...c, chapters: c.chapters.map((ch) => ({ ...ch })) });

  it('weggaan: een ander tabblad stempelde dezelfde inhoud, dus geen kopie', () => {
    seed(course());
    const a = openTab();
    // het andere tabblad bewaart opnieuw, zonder inhoudelijke wijziging
    saveCourseGuarded(getCourse('c1')!, 1000);
    a.edit(zonderVerschil);
    const out = a.leave();
    expect(out).toEqual({ copy: null, failed: false });
    expect(getCourses()).toHaveLength(1);
    expect(a.getSnapshot()).toMatchObject({ dirty: false, conflict: null });
  });

  it('bewaren: geen conflict, geen schrijfactie, en verder bouwen op de nieuwe versie', () => {
    seed(course());
    const a = openTab();
    saveCourseGuarded(getCourse('c1')!, 1000);
    const stamp = getCourse('c1')!.updatedAt;
    a.edit(zonderVerschil);
    expect(a.save()).toBe('niets');
    expect(a.getSnapshot()).toMatchObject({ dirty: false, conflict: null, status: 'idle', saveFailed: false });
    expect(getCourse('c1')!.updatedAt).toBe(stamp); // niets geschreven
    // een echte wijziging bewaart daarna gewoon, zonder conflict
    a.edit(retitle('Echt anders'));
    vi.advanceTimersByTime(800);
    expect(a.getSnapshot()).toMatchObject({ status: 'saved', conflict: null });
    expect(getCourse('c1')?.title).toBe('Echt anders');
  });

  it('storage-event: dezelfde inhoud elders geeft geen conflictbanner', () => {
    seed(course());
    const a = openTab();
    a.edit(zonderVerschil);
    saveCourseGuarded(getCourse('c1')!, 1000);
    expect(a.external()).toBe('gelijk');
    expect(a.getSnapshot()).toMatchObject({ dirty: false, conflict: null, status: 'idle' });
    expect(a.current()?.title).toBe('Water'); // het scherm bleef zoals het was
    a.edit(retitle('Echt anders'));
    vi.advanceTimersByTime(800);
    expect(getCourse('c1')?.title).toBe('Echt anders');
    expect(a.getSnapshot().conflict).toBeNull();
  });

  it('dezelfde titel in beide tabbladen getypt: ook geen conflict', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    b.edit(retitle('Water en wolken'));
    b.save();
    a.edit(retitle('Water en wolken'));
    expect(a.external()).toBe('gelijk');
    expect(a.getSnapshot()).toMatchObject({ dirty: false, conflict: null });
    expect(getCourses()).toHaveLength(1);
  });

  it('een open conflict dat wegvalt omdat het scherm nu gelijk is: weggaan maakt geen kopie', () => {
    seed(course());
    const a = openTab();
    const b = openTab();
    a.edit(retitle('Van A'));
    b.edit(rename('Van B'));
    b.save();
    expect(a.external()).toBe('conflict-gewijzigd');
    // de leerkracht in A maakt haar scherm gelijk aan wat B bewaarde
    a.edit((c) => ({ ...getCourse('c1')!, updatedAt: c.updatedAt }));
    const out = a.leave();
    expect(out).toEqual({ copy: null, failed: false });
    expect(getCourses()).toHaveLength(1);
    expect(a.getSnapshot().conflict).toBeNull();
  });

  it('een echt verschil blijft een conflict en geeft een kopie', () => {
    seed(course());
    const a = openTab();
    saveCourseGuarded({ ...getCourse('c1')!, title: 'Van B' }, 1000);
    a.edit(retitle('Van A'));
    expect(a.external()).toBe('conflict-gewijzigd');
    const out = a.leave();
    expect(out.copy?.title).toBe('Van A (mijn versie)');
    expect(getCourses()).toHaveLength(2);
  });

  it('een open AI-venster en dezelfde inhoud elders: geen conflict', () => {
    seed(course());
    const a = openTab();
    a.setBusy(true);
    saveCourseGuarded(getCourse('c1')!, 1000);
    expect(a.external()).toBe('gelijk');
    expect(a.getSnapshot().conflict).toBeNull();
  });

  it('elders verwijderd blijft een conflict, ook met dezelfde inhoud', () => {
    seed(course());
    const a = openTab();
    a.edit(zonderVerschil);
    deleteCourse('c1');
    expect(a.external()).toBe('conflict-verwijderd');
    expect(a.getSnapshot().conflict).toEqual({ kind: 'verwijderd' });
  });
});

// ── B4: media die bij het overnemen nog ontbrak ─────────────────────────────

describe('refresh: media die later binnenkomt (B4)', () => {
  const image = (url: string): CourseBlock => ({ id: 'i1', type: 'image', url });
  const urlOf = (c: Course | undefined) => (c?.chapters[0].sections[0].blocks[0] as { url: string }).url;
  /** Een opslag waarvan de media-oplossing van buiten te sturen is: eerst een open verwijzing, later een blob-URL. */
  function metMedia() {
    let resolved = false;
    const st = store({
      read: (id) => {
        const c = getCourse(id);
        if (!c) return c;
        return resolved
          ? { ...c, chapters: [{ ...c.chapters[0], sections: [{ ...c.chapters[0].sections[0], blocks: [image('blob:nieuw')] }] }] }
          : c;
      },
    });
    return { st, laad: () => { resolved = true; } };
  }

  it('toont de afbeelding zodra ze binnen is, zonder iets te schrijven', () => {
    seed(course('c1', [image('wfmedia:m_nieuw')]));
    const { st, laad } = metMedia();
    const a = createCourseDraft(st, getCourse('c1'));
    expect(urlOf(a.current())).toBe('wfmedia:m_nieuw');
    laad();
    expect(a.refresh()).toBe(true);
    expect(urlOf(a.current())).toBe('blob:nieuw');
    expect(a.getSnapshot()).toMatchObject({ dirty: false, conflict: null });
    vi.advanceTimersByTime(5000);
    expect(getCourse('c1')!.updatedAt).toBe(1000); // niets geschreven
    expect(urlOf(getCourse('c1'))).toBe('wfmedia:m_nieuw');
  });

  it('doet niets als de media nog niet opgelost raakte (geen lus van vervangingen)', () => {
    seed(course('c1', [image('wfmedia:m_weg')]));
    const a = openTab();
    const voor = a.current();
    expect(a.refresh()).toBe(false);
    expect(a.refresh()).toBe(false);
    expect(a.current()).toBe(voor);
  });

  it('laat onbewaarde wijzigingen met rust', () => {
    seed(course('c1', [image('wfmedia:m_nieuw')]));
    const { st, laad } = metMedia();
    const a = createCourseDraft(st, getCourse('c1'));
    a.edit(retitle('Net getypt'));
    laad();
    expect(a.refresh()).toBe(false);
    expect(a.current()?.title).toBe('Net getypt');
    expect(urlOf(a.current())).toBe('wfmedia:m_nieuw');
  });

  it('laat een open conflict met rust', () => {
    seed(course('c1', [image('wfmedia:m_nieuw')]));
    const { st, laad } = metMedia();
    const a = createCourseDraft(st, getCourse('c1'));
    a.edit(retitle('Van A'));
    saveCourseGuarded({ ...getCourse('c1')!, title: 'Van B' }, 1000);
    expect(a.external()).toBe('conflict-gewijzigd');
    laad();
    expect(a.refresh()).toBe(false);
    expect(a.getSnapshot().conflict?.kind).toBe('gewijzigd');
  });

  it('neemt niets over als de opslag intussen een andere versie draagt', () => {
    seed(course('c1', [image('wfmedia:m_nieuw')]));
    const { st, laad } = metMedia();
    const a = createCourseDraft(st, getCourse('c1'));
    saveCourseGuarded({ ...getCourse('c1')!, title: 'Elders gewijzigd' }, 1000);
    laad();
    expect(a.refresh()).toBe(false);
    expect(a.current()?.title).toBe('Water'); // external() beslist, niet refresh()
  });

  it('een cursus die niet meer bestaat: niets te vernieuwen', () => {
    seed(course('c1', [image('wfmedia:m_nieuw')]));
    const a = openTab();
    deleteCourse('c1');
    expect(a.refresh()).toBe(false);
    expect(createCourseDraft(store(), undefined).refresh()).toBe(false);
  });
});
