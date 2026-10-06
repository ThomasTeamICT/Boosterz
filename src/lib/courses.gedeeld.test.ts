// Gedeelde inhoud overnemen (debugronde oktober 2026, pakket GEDEELD):
// versies (LL3/CU5), eigen werk nooit stil overschrijven (V3), kopieën,
// pdf's in het cursusbestand (CU4/OP12), CU7, CU11, CU15a, AI9 en id's als
// "__proto__" in de voortgang.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';
import {
  adoptSharedContent, adoptSharedCourse, adoptSharedLinkUpdate, conflictKey, decodeCourseFromParam,
  decodeCourseProgress, deleteCourse, encodeCourseProgress,
  ensureDemoCourse, exportCourseJson, findSharedConflicts, getCourse, getCourses, importCourseJson,
  importProgressCode, mergeProgressRecords, restoreCoursePdfs, sanitizeCourse, saveCourse, saveStudentProgress,
  sharedCourseDiffers, sharedLinkQuestion, startProgress, touchSection, getStudentProgress,
  type DecodedCourse, type SharedLinkQuestion,
} from './courses';
import { getWidget, getWidgets, saveWidget } from './storage';
import type { Course, CourseChapter, CourseProgress } from './courseTypes';
import type { Widget } from './types';
import { defaultSettings } from '../widgets/registry';

// ── Nep-pdfopslag (IndexedDB bestaat niet in de testomgeving) ───────────────

const pdfMock = vi.hoisted(() => ({
  pdfs: new Map<string, { name: string; dataUrl: string }>(),
  failImport: false,
}));

vi.mock('./pdfStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdfStore')>()),
  deletePdf: async () => {},
  getPdf: async (id: string) => (pdfMock.pdfs.has(id) ? { name: pdfMock.pdfs.get(id)!.name, blob: new Blob() } : null),
  pdfToDataUrl: async (id: string) => pdfMock.pdfs.get(id) ?? null,
  importPdfFromDataUrl: async (id: string, name: string, dataUrl: string) => {
    if (pdfMock.failImport) return false;
    pdfMock.pdfs.set(id, { name, dataUrl });
    return true;
  },
}));

// ── Nep-localStorage en een klok die wij bepalen ────────────────────────────

let failKey: string | null = null;

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failKey && k === failKey) throw Object.assign(new Error('vol'), { name: 'QuotaExceededError' });
      data.set(k, String(v));
    },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
  failKey = null;
  pdfMock.pdfs.clear();
  pdfMock.failImport = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(100_000);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Klok vooruit zetten (een leerkracht die later iets bewerkt, een nieuwere link). */
function later(ms = 1000) {
  vi.setSystemTime(Date.now() + ms);
}

function widget(over: Partial<Widget> = {}): Widget {
  return {
    id: 'w1', type: 'quiz', title: 'Quiz over België', folderId: null, code: 'WQUIZ1',
    config: { questions: [{ id: 'q1', type: 'tf', prompt: 'België is een federale staat.', points: 1, answer: true }] } as unknown as Widget['config'],
    settings: defaultSettings(),
    createdAt: 1, updatedAt: 50_000,
    ...over,
  };
}

function course(over: Partial<Course> = {}): Course {
  return {
    id: 'c1', title: 'De waterkringloop', author: 'Juf An', coverEmoji: '💧', code: 'CWATER',
    chapters: [{
      id: 'ch1', title: 'Verdamping', sections: [{
        id: 's1', title: 'Wat is verdamping?', optional: false,
        blocks: [
          { id: 'b1', type: 'text', markdown: 'De zon verwarmt het water.' },
          { id: 'b2', type: 'widget', widgetId: 'w1' },
        ],
      }],
    }],
    settings: { accentColor: '#0891b2', requireName: true, showProgressToStudent: true },
    createdAt: 1, updatedAt: 50_000,
    ...over,
  };
}

/** Wat een leerling of leerkracht via een link of pakket binnenkrijgt: altijd door de sanering. */
function viaLink(c: Course): Course {
  return sanitizeCourse(JSON.parse(JSON.stringify(c)))!;
}

function widgetTitel(id: string): string | undefined {
  return getWidget(id)?.title;
}

// ── LL3/CU5: een nieuwere versie werkt bij, een oudere nooit ────────────────

describe('versies van gedeelde inhoud (LL3/CU5)', () => {
  it('bewaart de versie van de bron in plaats van "nu" te stempelen', () => {
    adoptSharedCourse(viaLink(course()), [widget()], { gedeeld: true });
    expect(getCourse('c1')!.updatedAt).toBe(50_000);
    expect(getWidget('w1')!.updatedAt).toBe(50_000);
  });

  it('v1 → v2 nieuwer: vervangen; v2 → v1 ouder (oude link): blijft v2', () => {
    const r1 = adoptSharedCourse(viaLink(course()), [widget()], { gedeeld: true });
    expect(r1.added).toBe(2);

    const v2 = course({ title: 'Waterkringloop v2', updatedAt: 60_000 });
    const w2 = widget({ title: 'Quiz v2', updatedAt: 60_000 });
    const r2 = adoptSharedCourse(viaLink(v2), [w2], { gedeeld: true });
    expect(r2.updated).toBe(2);
    expect(getCourse('c1')!.title).toBe('Waterkringloop v2');
    expect(widgetTitel('w1')).toBe('Quiz v2');

    const r3 = adoptSharedCourse(viaLink(course()), [widget()], { gedeeld: true });
    expect(r3.updated).toBe(0);
    expect(getCourse('c1')!.title).toBe('Waterkringloop v2');
    expect(widgetTitel('w1')).toBe('Quiz v2');
  });

  it('een versie uit de toekomst wordt nu: ze kan later gewoon bijgewerkt worden', () => {
    adoptSharedContent([], [widget({ updatedAt: 9_999_999_999_999 })], { gedeeld: true });
    expect(getWidget('w1')!.updatedAt).toBe(100_000);
    later();
    adoptSharedContent([], [widget({ title: 'Echte v2', updatedAt: Date.now() })], { gedeeld: true });
    expect(widgetTitel('w1')).toBe('Echte v2');
  });

  it('een aangepaste kopie is eigen werk geworden: geen stille update meer', () => {
    adoptSharedContent([], [widget()], { gedeeld: true });
    later();
    saveWidget({ ...getWidget('w1')!, title: 'Mijn aanpassing' });
    later();
    const res = adoptSharedContent([], [widget({ title: 'Versie van de bron', updatedAt: Date.now() })], { gedeeld: true });
    expect(res.kept).toBe(1);
    expect(widgetTitel('w1')).toBe('Mijn aanpassing');
  });

  it('dezelfde widget in twee cursussen: de nieuwste versie wint', () => {
    adoptSharedContent([], [widget({ title: 'oud', updatedAt: 1000 }), widget({ title: 'nieuw', updatedAt: 2000 })], { gedeeld: true });
    expect(widgetTitel('w1')).toBe('nieuw');
  });
});

// ── V3: eigen werk nooit stil overschrijven ─────────────────────────────────

describe('eigen werk van de leerkracht (V3)', () => {
  /** De leerkracht maakte cursus en widget zelf op dit toestel (stempel = nu). */
  function eigenWerk() {
    saveWidget(widget({ title: 'Mijn quiz' }));
    saveCourse(course({ title: 'Mijn cursus' }));
    later();
  }

  it('een nieuwere, andere versie overschrijft niets zonder keuze', async () => {
    eigenWerk();
    const gekaapt = viaLink(course({ title: 'Gekaapt', updatedAt: 9_999_999_999_999 }));
    const w = widget({ title: 'Gekaapte quiz', updatedAt: 9_999_999_999_999 });
    const conflicten = await findSharedConflicts([gekaapt], [w]);
    expect(conflicten.map(conflictKey).sort()).toEqual(['course:c1', 'widget:w1']);
    expect(conflicten.every((c) => !c.older)).toBe(true);

    const res = adoptSharedCourse(gekaapt, [w], { gedeeld: true });
    expect(res.kept).toBe(2);
    expect(getCourse('c1')!.title).toBe('Mijn cursus');
    expect(widgetTitel('w1')).toBe('Mijn quiz');
  });

  it('keuze "bijwerken": vervangt, de map van dit toestel blijft', async () => {
    saveWidget(widget({ title: 'Mijn quiz', folderId: 'mijn-map' }));
    saveCourse(course({ title: 'Mijn cursus' }));
    later();
    const nieuw = viaLink(course({ title: 'Nieuwe versie', updatedAt: Date.now() }));
    const w = widget({ title: 'Nieuwe quiz', folderId: 'map-van-collega', updatedAt: Date.now() });
    const conflicten = await findSharedConflicts([nieuw], [w]);
    adoptSharedCourse(nieuw, [w], { gedeeld: true, conflicts: { choice: 'bijwerken', keys: conflicten.map(conflictKey) } });
    expect(getCourse('c1')!.title).toBe('Nieuwe versie');
    expect(getWidget('w1')!.title).toBe('Nieuwe quiz');
    expect(getWidget('w1')!.folderId).toBe('mijn-map');
    // Vanaf nu een zuivere kopie: een nog nieuwere versie werkt stil bij.
    later();
    adoptSharedContent([], [widget({ title: 'Nog nieuwer', updatedAt: Date.now() })], { gedeeld: true });
    expect(widgetTitel('w1')).toBe('Nog nieuwer');
  });

  it('keuze "kopie": eigen werk blijft, de versie van de bron staat ernaast en verwijst juist', async () => {
    eigenWerk();
    const nieuw = viaLink(course({ title: 'Versie collega', updatedAt: Date.now() }));
    const w = widget({ title: 'Quiz collega', updatedAt: Date.now() });
    const conflicten = await findSharedConflicts([nieuw], [w]);
    const res = adoptSharedCourse(nieuw, [w], { gedeeld: true, conflicts: { choice: 'kopie', keys: conflicten.map(conflictKey) } });
    expect(res.copied).toBe(2);
    // Eigen werk ongewijzigd.
    expect(getCourse('c1')!.title).toBe('Mijn cursus');
    expect(widgetTitel('w1')).toBe('Mijn quiz');
    // De kopieën: eigen id, eigen code, "(kopie)" in de titel.
    const kopieCursusId = res.courseIds.get('c1')!;
    const kopieWidgetId = res.widgetIds.get('w1')!;
    expect(kopieCursusId).not.toBe('c1');
    expect(kopieWidgetId).not.toBe('w1');
    const kopie = getCourse(kopieCursusId)!;
    expect(kopie.title).toBe('Versie collega (kopie)');
    expect(kopie.code).not.toBe('CWATER');
    expect(widgetTitel(kopieWidgetId)).toBe('Quiz collega (kopie)');
    // De kopie van de cursus wijst naar de kopie van de widget.
    const blok = kopie.chapters[0].sections[0].blocks[1];
    expect(blok.type === 'widget' && blok.widgetId).toBe(kopieWidgetId);
    const eigenBlok = getCourse('c1')!.chapters[0].sections[0].blocks[1];
    expect(eigenBlok.type === 'widget' && eigenBlok.widgetId).toBe('w1');
  });

  it('kopie van alleen een widget: de cursus van de bron gaat mee als kopie (eigen cursus blijft onaangeroerd)', async () => {
    eigenWerk();
    // Cursus inhoudelijk gelijk (zelfde versie), alleen de widget is nieuwer en anders.
    const zelfde = viaLink(course({ title: 'Mijn cursus', updatedAt: getCourse('c1')!.updatedAt }));
    const w = widget({ title: 'Quiz collega', updatedAt: Date.now() });
    const conflicten = await findSharedConflicts([zelfde], [w]);
    expect(conflicten.map(conflictKey)).toEqual(['widget:w1']);
    const res = adoptSharedCourse(zelfde, [w], { gedeeld: true, conflicts: { choice: 'kopie', keys: conflicten.map(conflictKey) } });
    const kopieCursus = getCourse(res.courseIds.get('c1')!)!;
    expect(kopieCursus.id).not.toBe('c1');
    const blok = kopieCursus.chapters[0].sections[0].blocks[1];
    expect(blok.type === 'widget' && blok.widgetId).toBe(res.widgetIds.get('w1'));
    const eigenBlok = getCourse('c1')!.chapters[0].sections[0].blocks[1];
    expect(eigenBlok.type === 'widget' && eigenBlok.widgetId).toBe('w1');
  });

  it('keuze "houden": niets verandert, nieuwe onderdelen komen er wel bij', async () => {
    eigenWerk();
    const nieuw = viaLink(course({ title: 'Versie collega', updatedAt: Date.now() }));
    const extra = widget({ id: 'w2', code: 'WEXTRA', title: 'Extra oefening', updatedAt: Date.now() });
    const conflicten = await findSharedConflicts([nieuw], [extra]);
    adoptSharedCourse(nieuw, [extra], { gedeeld: true, conflicts: { choice: 'houden', keys: conflicten.map(conflictKey) } });
    expect(getCourse('c1')!.title).toBe('Mijn cursus');
    expect(widgetTitel('w2')).toBe('Extra oefening');
  });

  it('dezelfde inhoud in een nieuwere versie is geen conflict en verandert niets', async () => {
    eigenWerk();
    const zelfde = viaLink({ ...getCourse('c1')!, updatedAt: Date.now() });
    expect(await findSharedConflicts([zelfde], [{ ...getWidget('w1')!, updatedAt: Date.now() }])).toEqual([]);
  });

  it('een oudere, andere versie: geen vraag bij een pakket, wel bij een bestand (back-up)', async () => {
    eigenWerk();
    const ouder = viaLink(course({ title: 'Oude back-up', updatedAt: 10 }));
    expect(await findSharedConflicts([ouder], [])).toEqual([]);
    const metOuder = await findSharedConflicts([ouder], [], { includeOlder: true });
    expect(metOuder).toHaveLength(1);
    expect(metOuder[0].older).toBe(true);
    adoptSharedCourse(ouder, [], { gedeeld: true });
    expect(getCourse('c1')!.title).toBe('Mijn cursus');
    // Bewust terugzetten mag wel.
    adoptSharedCourse(ouder, [], { gedeeld: true, conflicts: { choice: 'bijwerken', keys: metOuder.map(conflictKey) } });
    expect(getCourse('c1')!.title).toBe('Oude back-up');
  });

  it('oude opgeslagen data (van vóór het register) telt als eigen werk en wordt nooit stil overschreven', async () => {
    // Zo stond het vroeger op een toestel: bij het overnemen gestempeld, geen register.
    localStorage.setItem('wf.widgets.v1', JSON.stringify([{ ...widget(), title: 'Oude kopie', updatedAt: 70_000 }]));
    localStorage.setItem('wf.courses.v1', JSON.stringify([{ ...course(), title: 'Oude cursus', updatedAt: 70_000 }]));
    expect(getCourses()).toHaveLength(1);
    const nieuw = viaLink(course({ title: 'Nieuw', updatedAt: 90_000 }));
    const w = widget({ title: 'Nieuwe quiz', updatedAt: 90_000 });
    expect((await findSharedConflicts([nieuw], [w])).map(conflictKey).sort()).toEqual(['course:c1', 'widget:w1']);
    adoptSharedCourse(nieuw, [w], { gedeeld: true });
    expect(getCourse('c1')!.title).toBe('Oude cursus');
    expect(widgetTitel('w1')).toBe('Oude kopie');
  });

  it('een kapot register breekt niets (alles telt dan als eigen werk)', async () => {
    adoptSharedContent([], [widget()], { gedeeld: true });
    localStorage.setItem('wf.gedeeld.v1', '{kapot');
    later();
    const res = adoptSharedContent([], [widget({ title: 'v2', updatedAt: Date.now() })], { gedeeld: true });
    expect(res.kept).toBe(1);
    expect(widgetTitel('w1')).toBe('Quiz over België');
    localStorage.setItem('wf.gedeeld.v1', JSON.stringify({ c: 'x', w: [[1, 2], ['w1', 'x'], null] }));
    expect(adoptSharedContent([], [widget({ title: 'v3', updatedAt: Date.now() })], { gedeeld: true }).kept).toBe(1);
  });

  it('force (uitdrukkelijk "bijwerken"): cursus altijd, widgets alleen als ze nieuwer zijn', () => {
    eigenWerk();
    adoptSharedCourse(viaLink(course({ title: 'Origineel voorbeeld', updatedAt: 10 })), [widget({ title: 'Oude quiz', updatedAt: 10 })], { gedeeld: true, force: true });
    expect(getCourse('c1')!.title).toBe('Origineel voorbeeld');
    expect(widgetTitel('w1')).toBe('Mijn quiz');
  });

  it('een id "__proto__" of "constructor" breekt het overnemen niet', () => {
    const rare = [widget({ id: '__proto__', code: 'PROTO1' }), widget({ id: 'constructor', code: 'CONST1' })];
    const res = adoptSharedContent([], rare, { gedeeld: true });
    expect(res.added).toBe(2);
    expect(getWidgets().map((w) => w.id).sort()).toEqual(['__proto__', 'constructor']);
    later();
    // Zuivere kopieën: het register vindt ze terug (Map, geen object met prototype).
    const r2 = adoptSharedContent([], rare.map((w) => ({ ...w, title: 'v2', updatedAt: Date.now() })), { gedeeld: true });
    expect(r2.updated).toBe(2);
    expect(({} as Record<string, unknown>).title).toBeUndefined();
  });
});

// ── sharedCourseDiffers: moet de lezer vragen? (LL3, V3, CU15a) ─────────────

describe('sharedCourseDiffers', () => {
  it('niets lokaal: geen vraag', async () => {
    expect(await sharedCourseDiffers(viaLink(course()))).toBe(false);
  });

  it('eigen, ongewijzigd bestand terug (andere sleutelvolgorde, ontbrekende standaardvelden): geen vraag (CU15a)', async () => {
    // Zo bewaart de editor een eigen cursus: zonder "optional", sleutels in
    // een eigen volgorde. De sanering bij export → import zet optional:false
    // erbij en ordent de sleutels anders.
    const { chapters, ...rest } = course({ title: 'Mijn cursus' });
    const eigen = {
      chapters: chapters.map((ch) => ({
        sections: ch.sections.map(({ optional: _o, ...se }) => ({ blocks: se.blocks, title: se.title, id: se.id })),
        title: ch.title,
        id: ch.id,
      })),
      ...rest,
    } as Course;
    saveCourse(eigen);
    const terug = viaLink(getCourse('c1')!);
    expect(terug.chapters[0].sections[0].optional).toBe(false);
    expect(await sharedCourseDiffers(terug)).toBe(false);
    expect(await findSharedConflicts([terug], [], { includeOlder: true })).toEqual([]);
    // Ter controle: een echte wijziging telt wel (bij een bestand ook als ze niet nieuwer is).
    const gewijzigd = viaLink({ ...getCourse('c1')!, title: 'Anders' });
    expect(await findSharedConflicts([gewijzigd], [], { includeOlder: true })).toHaveLength(1);
  });

  it('eigen werk, nieuwere andere versie: vragen; oudere: niet (de lokale blijft)', async () => {
    saveCourse(course({ title: 'Mijn cursus' }));
    later();
    expect(await sharedCourseDiffers(viaLink(course({ title: 'Anders', updatedAt: Date.now() })))).toBe(true);
    expect(await sharedCourseDiffers(viaLink(course({ title: 'Anders', updatedAt: 10 })))).toBe(false);
  });

  it('zuivere kopie, nieuwere versie: geen vraag, overnemen werkt stil bij', async () => {
    adoptSharedCourse(viaLink(course()), [widget()], { gedeeld: true });
    const v2 = viaLink(course({ title: 'v2', updatedAt: 60_000 }));
    expect(await sharedCourseDiffers(v2)).toBe(false);
    adoptSharedCourse(v2, [], { gedeeld: true });
    expect(getCourse('c1')!.title).toBe('v2');
  });

  it('let ook op meereizende widgets als die meegegeven worden', async () => {
    saveCourse(course());
    saveWidget(widget({ title: 'Mijn quiz' }));
    later();
    const zelfdeCursus = viaLink({ ...getCourse('c1')! });
    expect(await sharedCourseDiffers(zelfdeCursus)).toBe(false);
    expect(await sharedCourseDiffers(zelfdeCursus, undefined, [widget({ title: 'Andere quiz', updatedAt: Date.now() })])).toBe(true);
  });
});

// ── Gedeeltelijke link (enkele hoofdstukken) ────────────────────────────────

describe('gedeeltelijke link', () => {
  const metHoofdstukken = (over: Partial<Course> = {}, titels: Record<string, string> = {}) => course({
    chapters: ['ch1', 'ch2'].map((id) => ({
      id, title: titels[id] ?? `Hoofdstuk ${id}`,
      sections: [{ id: `s-${id}`, title: 'S', optional: false, blocks: [{ id: `b-${id}`, type: 'text', markdown: 'x' }] }],
    })),
    ...over,
  });

  it('zuivere kopie: vervangt het gedeelde hoofdstuk, voegt nieuwe toe, laat de rest staan', async () => {
    adoptSharedCourse(viaLink(metHoofdstukken()), [], { gedeeld: true });
    const deel = viaLink(course({
      updatedAt: 70_000,
      chapters: [
        { id: 'ch2', title: 'H2 nieuw', sections: [{ id: 's-ch2', title: 'S', blocks: [] }] },
        { id: 'ch3', title: 'H3', sections: [{ id: 's-ch3', title: 'S', blocks: [] }] },
      ],
    }));
    expect(await sharedCourseDiffers(deel, ['ch2', 'ch3'])).toBe(false);
    adoptSharedCourse(deel, [], { gedeeld: true, partial: true });
    expect(getCourse('c1')!.chapters.map((ch) => ch.title)).toEqual(['Hoofdstuk ch1', 'H2 nieuw', 'H3']);
  });

  it('eigen cursus: zonder keuze niets gewijzigd, met force samengevoegd', async () => {
    saveCourse(metHoofdstukken({ title: 'Mijn cursus' }));
    later();
    const deel = viaLink(course({
      updatedAt: Date.now(),
      chapters: [{ id: 'ch2', title: 'H2 van de link', sections: [{ id: 's-ch2', title: 'S', blocks: [] }] }],
    }));
    expect(await sharedCourseDiffers(deel, ['ch2'])).toBe(true);
    adoptSharedCourse(deel, [], { gedeeld: true, partial: true });
    expect(getCourse('c1')!.chapters.map((ch) => ch.title)).toEqual(['Hoofdstuk ch1', 'Hoofdstuk ch2']);
    adoptSharedCourse(deel, [], { gedeeld: true, partial: true, force: true });
    expect(getCourse('c1')!.chapters.map((ch) => ch.title)).toEqual(['Hoofdstuk ch1', 'H2 van de link']);
  });
});

// ── Herstelpakket H1: de linkroute zoals CourseOpenPage ze doorloopt ───────

/** Een deellink zoals de lezer ze krijgt: door decodeCourseFromParam. */
function link(c: Course, w: Widget[] = [], partial = false): DecodedCourse {
  const d = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, kind: 'cursus', c, w, ...(partial ? { partial: true } : {}) }));
  return decodeCourseFromParam(d)!;
}

/**
 * Hetzelfde pad als CourseOpenPage: eerst de vraag (sharedLinkQuestion), bij
 * een vraag de keuze van de gebruiker, anders stil overnemen met `gedeeld`.
 * Geeft de vraag terug (null = geen vraag).
 */
async function openLink(d: DecodedCourse, kies: 'bijwerken' | 'houden' = 'houden'): Promise<SharedLinkQuestion | null> {
  const existing = getCourse(d.course.id);
  const vraag = existing
    ? await sharedLinkQuestion(d.course, d.partial ? d.course.chapters.map((ch) => ch.id) : undefined, d.widgets)
    : null;
  if (existing && vraag) {
    if (kies === 'bijwerken') adoptSharedLinkUpdate(d, vraag);
    return vraag;
  }
  adoptSharedCourse(d.course, d.widgets, { partial: d.partial, gedeeld: true });
  return null;
}

function hfst(id: string, tekst: string): CourseChapter {
  return { id, title: id, sections: [{ id: `s-${id}`, title: 'S', optional: false, blocks: [{ id: `b-${id}`, type: 'text', markdown: tekst }] }] };
}

/** De tekst van het eerste blok van elk hoofdstuk van c1. */
function teksten(): string[] {
  return getCourse('c1')!.chapters.map((ch) => {
    const b = ch.sections[0].blocks[0];
    return b.type === 'text' ? b.markdown : b.type;
  });
}

describe('S1: alleen wat via link of pakket binnenkwam, wordt stil bijgewerkt', () => {
  it('bestand of voorbeeld: een latere link met dezelfde id\'s vraagt eerst en overschrijft zonder keuze niets', async () => {
    // Een teruggezette back-up (CoursesPage.finishImport): zonder `gedeeld`.
    adoptSharedCourse(viaLink(course({ title: 'Mijn back-up' })), [widget({ title: 'Mijn quiz' })]);
    later();
    // Een leerling met een deellink past de cursus aan en deelt ze opnieuw:
    // zelfde id's, stempel "nu".
    const nep = link(course({ title: 'Nagemaakt', updatedAt: Date.now() }), [widget({ title: 'Nagemaakte quiz', updatedAt: Date.now() })]);
    expect(await sharedCourseDiffers(nep.course, undefined, nep.widgets)).toBe(true);
    const vraag = await openLink(nep, 'houden');
    expect(vraag).not.toBeNull();
    expect(vraag!.course).toBe(true);
    expect(vraag!.widgets.map(conflictKey)).toEqual(['widget:w1']);
    // Ook wie de vraag overslaat (gewoon overnemen met `gedeeld`), overschrijft niets.
    const res = adoptSharedCourse(nep.course, nep.widgets, { gedeeld: true });
    expect(res.kept).toBe(2);
    expect(getCourse('c1')!.title).toBe('Mijn back-up');
    expect(widgetTitel('w1')).toBe('Mijn quiz');
  });

  it('een bestand over een zuivere kopie maakt er eigen werk van: de volgende link vraagt eerst', async () => {
    await openLink(link(course(), [widget()]));
    later();
    // Zelfde cursus nu uit een bestand, nieuwere versie (de leerkracht zette ze terug).
    adoptSharedCourse(viaLink(course({ title: 'Uit het bestand', updatedAt: Date.now() })), [widget({ title: 'Quiz uit het bestand', updatedAt: Date.now() })]);
    expect(getCourse('c1')!.title).toBe('Uit het bestand');
    later();
    const vraag = await openLink(link(course({ title: 'Link', updatedAt: Date.now() }), [widget({ title: 'Quiz uit de link', updatedAt: Date.now() })]));
    expect(vraag?.course).toBe(true);
    expect(vraag?.widgets.map(conflictKey)).toEqual(['widget:w1']);
    expect(getCourse('c1')!.title).toBe('Uit het bestand');
    expect(widgetTitel('w1')).toBe('Quiz uit het bestand');
  });

  it('LL3: link v1 → link v2 gaat stil, een oude link daarna zet niets terug', async () => {
    expect(await openLink(link(course({ title: 'v1', updatedAt: 40_000 }), [widget({ title: 'Quiz v1', updatedAt: 40_000 })]))).toBeNull();
    later();
    expect(await openLink(link(course({ title: 'v2', updatedAt: 60_000 }), [widget({ title: 'Quiz v2', updatedAt: 60_000 })]))).toBeNull();
    expect(getCourse('c1')!.title).toBe('v2');
    expect(widgetTitel('w1')).toBe('Quiz v2');
    later();
    expect(await openLink(link(course({ title: 'v1', updatedAt: 40_000 }), [widget({ title: 'Quiz v1', updatedAt: 40_000 })]))).toBeNull();
    expect(getCourse('c1')!.title).toBe('v2');
    expect(widgetTitel('w1')).toBe('Quiz v2');
  });
});

describe('S3: de vraag op de linkroute noemt de oefeningen, en bijwerken vervangt alleen wat ze noemde', () => {
  it('eigen oefening, cursus zuiver: de link vraagt eerst en noemt de oefening', async () => {
    await openLink(link(course(), [widget({ title: 'Bron v1' })]));
    later();
    saveWidget({ ...getWidget('w1')!, title: 'Mijn eigen quiz' });
    later();
    const v2 = link(course({ title: 'Cursus v2', updatedAt: Date.now() }), [widget({ title: 'Bron v2', updatedAt: Date.now() })]);
    const vraag = await openLink(v2, 'houden');
    expect(vraag).toEqual({
      course: false,
      widgets: [expect.objectContaining({ kind: 'widget', id: 'w1', localTitle: 'Mijn eigen quiz', title: 'Bron v2' })],
    });
    // "Huidige versie behouden": niets veranderd.
    expect(widgetTitel('w1')).toBe('Mijn eigen quiz');
    // "Bijwerken" vervangt wat de vraag noemde; de zuivere cursus volgt de gewone regels.
    adoptSharedLinkUpdate(v2, vraag!);
    expect(widgetTitel('w1')).toBe('Bron v2');
    expect(getCourse('c1')!.title).toBe('Cursus v2');
  });

  it('bijwerken laat eigen werk staan dat de vraag niet noemde (ook geen oudere cursus terug)', async () => {
    saveCourse(course({ title: 'Mijn cursus' }));
    saveWidget(widget({ title: 'Mijn quiz' }));
    later();
    // Oudere cursus (zou niets vervangen), nieuwere en andere oefening.
    const d = link(
      course({ title: 'Oude cursus', updatedAt: 10 }),
      [widget({ title: 'Quiz uit de link', updatedAt: Date.now() }), widget({ id: 'w2', code: 'WTWEE1', title: 'Tweede uit de link', updatedAt: Date.now() })],
    );
    const vraag = await sharedLinkQuestion(d.course, undefined, d.widgets);
    expect(vraag).toEqual({ course: false, widgets: [expect.objectContaining({ id: 'w1' })] });
    // Terwijl de vraag openstaat, maakt de leerkracht in een ander tabblad een eigen w2.
    later();
    saveWidget(widget({ id: 'w2', code: 'WTWEE1', title: 'Mijn tweede quiz' }));
    later();
    adoptSharedLinkUpdate(d, vraag!);
    expect(widgetTitel('w1')).toBe('Quiz uit de link');
    expect(widgetTitel('w2')).toBe('Mijn tweede quiz');
    expect(getCourse('c1')!.title).toBe('Mijn cursus');
  });

  it('noemt de vraag de cursus, dan neemt bijwerken ook een gedeeltelijke link in eigen werk over', async () => {
    saveCourse(course({ title: 'Mijn cursus', chapters: [hfst('ch1', 'eigen 1'), hfst('ch2', 'eigen 2')] }));
    later();
    const deel = link(course({ updatedAt: Date.now(), chapters: [hfst('ch2', 'link 2')] }), [], true);
    const vraag = await openLink(deel, 'bijwerken');
    expect(vraag).toEqual({ course: true, widgets: [] });
    expect(teksten()).toEqual(['eigen 1', 'link 2']);
  });

  it('sharedLinkQuestion geeft dezelfde beslissing als sharedCourseDiffers met de widgets', async () => {
    await openLink(link(course(), [widget()]));
    later();
    const zelfde = link(course(), [widget()]);
    expect(await sharedLinkQuestion(zelfde.course, undefined, zelfde.widgets)).toBeNull();
    expect(await sharedCourseDiffers(zelfde.course, undefined, zelfde.widgets)).toBe(false);
    saveWidget({ ...getWidget('w1')!, title: 'Eigen' });
    later();
    const nieuw = link(course(), [widget({ title: 'Nieuw', updatedAt: Date.now() })]);
    expect(await sharedLinkQuestion(nieuw.course, undefined, nieuw.widgets)).not.toBeNull();
    expect(await sharedCourseDiffers(nieuw.course, undefined, nieuw.widgets)).toBe(true);
  });
});

describe('G4: bij een zuivere kopie volstaat "niet ouder"', () => {
  it('gedeeltelijk, daarna volledig met dezelfde versie: alle hoofdstukken', async () => {
    const vol = course({ updatedAt: 60_000, chapters: [hfst('ch1', 'a1'), hfst('ch2', 'a2'), hfst('ch3', 'a3')] });
    expect(await openLink(link({ ...vol, chapters: [vol.chapters[0]] }, [], true))).toBeNull();
    expect(teksten()).toEqual(['a1']);
    later(86_400_000);
    expect(await openLink(link(vol))).toBeNull();
    expect(teksten()).toEqual(['a1', 'a2', 'a3']);
  });

  it('twee gedeeltelijke links na een bewerking geven samen de nieuwe stand', async () => {
    await openLink(link(course({ updatedAt: 60_000, chapters: [hfst('ch1', 'a1'), hfst('ch2', 'a2'), hfst('ch3', 'a3')] })));
    const v2 = course({ updatedAt: 70_000, chapters: [hfst('ch1', 'a1'), hfst('ch2', 'N2'), hfst('ch3', 'N3')] });
    later();
    expect(await openLink(link({ ...v2, chapters: [v2.chapters[1]] }, [], true))).toBeNull();
    later();
    expect(await openLink(link({ ...v2, chapters: [v2.chapters[2]] }, [], true))).toBeNull();
    expect(teksten()).toEqual(['a1', 'N2', 'N3']);
  });

  it('een oude volledige link na gedeeltelijke updates zet niets terug', async () => {
    const v1 = course({ updatedAt: 60_000, chapters: [hfst('ch1', 'a1'), hfst('ch2', 'a2'), hfst('ch3', 'a3')] });
    await openLink(link(v1));
    const v2 = course({ updatedAt: 70_000, chapters: [hfst('ch1', 'a1'), hfst('ch2', 'N2'), hfst('ch3', 'N3')] });
    later();
    await openLink(link({ ...v2, chapters: [v2.chapters[1], v2.chapters[2]] }, [], true));
    later();
    expect(await openLink(link(v1))).toBeNull();
    expect(teksten()).toEqual(['a1', 'N2', 'N3']);
  });

  it('een bestand met dezelfde versie over een gedeeltelijke zuivere kopie: geen vraag, alle hoofdstukken', async () => {
    const vol = course({ updatedAt: 60_000, chapters: [hfst('ch1', 'a1'), hfst('ch2', 'a2')] });
    await openLink(link({ ...vol, chapters: [vol.chapters[0]] }, [], true));
    later();
    // Zoals CoursesPage een bestand inleest: ook oudere versies voorleggen.
    expect(await findSharedConflicts([viaLink(vol)], [], { includeOlder: true })).toEqual([]);
    adoptSharedCourse(viaLink(vol), []);
    expect(teksten()).toEqual(['a1', 'a2']);
  });

  it('eigen werk: een even oude, andere versie vraagt niets en vervangt niets', async () => {
    saveCourse(course({ title: 'Mijn cursus' }));
    const zelfdeStempel = getCourse('c1')!.updatedAt;
    later();
    expect(await openLink(link(course({ title: 'Anders', updatedAt: zelfdeStempel })))).toBeNull();
    expect(getCourse('c1')!.title).toBe('Mijn cursus');
  });

  it('dezelfde link opnieuw openen bewaart de oefeningen niet opnieuw', async () => {
    await openLink(link(course(), [widget()]));
    later();
    const schrijf = vi.spyOn(localStorage, 'setItem');
    expect(await openLink(link(course(), [widget()]))).toBeNull();
    expect(schrijf.mock.calls.filter(([k]) => k === 'wf.widgets.v1')).toHaveLength(0);
    expect(widgetTitel('w1')).toBe('Quiz over België');
  });
});

describe('S7c en S9: invoer uit bestanden en codes', () => {
  it('een pdf-id met het voorvoegsel van de media wordt geweigerd', () => {
    const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';
    const c = course({
      chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [
        { id: 'p1', type: 'pdf', pdfId: 'm_0123456789abcdef0123456789abcdef', name: 'kaap.pdf' },
        { id: 'p2', type: 'pdf', pdfId: 'echtepdf1', name: 'werkblad.pdf' },
      ] }] }],
    });
    const res = importCourseJson(JSON.stringify({
      app: 'boosterz', kind: 'cursus', v: 1, course: c, widgets: [],
      pdfs: [
        { id: 'm_0123456789abcdef0123456789abcdef', name: 'kaap.pdf', dataUrl: PDF },
        { id: 'echtepdf1', name: 'werkblad.pdf', dataUrl: PDF },
      ],
    }))!;
    expect(res.pdfs.map((p) => p.id)).toEqual(['echtepdf1']);
  });

  it('voortgangscode: 1e999 en negatieve tijdstippen worden geweigerd (geen null in de opslag)', () => {
    const raw = '{"courseId":"c1","studentName":"Emma","lastSeenAt":1,"startedAt":1e999,'
      + '"sections":{"s1":{"openedAt":1e999,"completedAt":1e999,"secondsSpent":3},'
      + '"s2":{"openedAt":-5,"completedAt":-1,"secondsSpent":1},"s3":{"openedAt":7000,"completedAt":8000,"secondsSpent":2}}}';
    const p = decodeCourseProgress('WFC1.' + LZString.compressToEncodedURIComponent(raw))!;
    expect(p.startedAt).toBe(100_000);
    expect(p.sections.s1.openedAt).toBe(100_000);
    expect(p.sections.s1.completedAt).toBeUndefined();
    expect(p.sections.s2.openedAt).toBe(100_000);
    expect(p.sections.s2.completedAt).toBeUndefined();
    expect(p.sections.s3).toMatchObject({ openedAt: 7000, completedAt: 8000 });
    expect(importProgressCode(p)).toBe(true);
    const bewaard = getStudentProgress('c1', 'Emma')!;
    expect(bewaard.startedAt).toBe(100_000);
    expect(bewaard.sections.s1.openedAt).toBe(100_000);
  });
});

// ── KL1: voortgang inlezen zonder "nu" te stempelen ─────────────────────────

describe('voortgang (KL1)', () => {
  const p = (over: Partial<CourseProgress> = {}): CourseProgress => ({
    courseId: 'c1', courseCode: 'CWATER', studentName: 'Emma',
    sections: {}, lastSeenAt: 5000, startedAt: 1000, ...over,
  });

  it('importProgressCode houdt "laatst gezien" uit de codes (maximum), niet het moment van inlezen', () => {
    importProgressCode(p({ lastSeenAt: 7000, sections: { s4: { openedAt: 1, secondsSpent: 1 } } }));
    importProgressCode(p({ lastSeenAt: 9000, sections: { s1: { openedAt: 1, secondsSpent: 1 } } }));
    importProgressCode(p({ lastSeenAt: 3000, sections: { s2: { openedAt: 1, secondsSpent: 1 } } }));
    const opgeslagen = getStudentProgress('c1', 'emma')!;
    expect(opgeslagen.lastSeenAt).toBe(9000);
    expect(Object.keys(opgeslagen.sections).sort()).toEqual(['s1', 's2', 's4']);
  });

  it('de lezer stempelt wel nu (gewoon bewaren)', () => {
    const rec = p();
    saveStudentProgress(rec);
    expect(rec.lastSeenAt).toBe(100_000);
    expect(getStudentProgress('c1', 'Emma')!.lastSeenAt).toBe(100_000);
  });

  it('een "laatst gezien" in de toekomst uit een code wordt nu', () => {
    const code = encodeCourseProgress(p({ lastSeenAt: 9_999_999_999_999 }));
    expect(decodeCourseProgress(code)!.lastSeenAt).toBe(100_000);
  });

  it('bewaren mislukt: false (geen stille "gelukt")', () => {
    failKey = 'wf.courseprogress.v1';
    expect(importProgressCode(p())).toBe(false);
  });
});

// ── Id's als "__proto__" of "constructor" in voortgang ─────────────────────

describe('voortgang met id\'s uit Object.prototype', () => {
  it('een sectie-id "__proto__" of "constructor" uit een code wordt een gewone sectie', () => {
    const raw = '{"courseId":"c1","studentName":"Emma","lastSeenAt":1,"startedAt":1,"sections":{"__proto__":{"openedAt":1,"secondsSpent":3,"checks":{"__proto__":["a"]}},"constructor":{"openedAt":2,"secondsSpent":4}}}';
    const code = 'WFC1.' + LZString.compressToEncodedURIComponent(raw);
    const p = decodeCourseProgress(code)!;
    expect(Object.getPrototypeOf(p.sections)).toBe(Object.prototype);
    expect(Object.keys(p.sections).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.keys(p.sections['__proto__'].checks!)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).openedAt).toBeUndefined();
  });

  it('samenvoegen en touchSection gebruiken alleen eigen sleutels', () => {
    const a: CourseProgress = { courseId: 'c1', courseCode: '', studentName: 'E', sections: {}, lastSeenAt: 1, startedAt: 1 };
    const b: CourseProgress = { ...a, sections: { constructor: { openedAt: 5, secondsSpent: 9 } }, lastSeenAt: 2 };
    const merged = mergeProgressRecords(a, b);
    expect(merged.sections.constructor).toEqual({ openedAt: 5, secondsSpent: 9 });
    const leeg = startProgress(course(), 'Noah');
    const sp = touchSection(leeg, 'toString');
    expect(sp.secondsSpent).toBe(0);
    expect(typeof leeg.sections.toString).toBe('object');
  });
});

// ── CU7: saveCourse zegt of het lukte ───────────────────────────────────────

describe('saveCourse (CU7)', () => {
  it('geeft true bij succes en false bij een volle opslag', () => {
    expect(saveCourse(course())).toBe(true);
    failKey = 'wf.courses.v1';
    expect(saveCourse(course({ title: 'Niet bewaard' }))).toBe(false);
    failKey = null;
    expect(getCourse('c1')!.title).toBe('De waterkringloop');
  });

  it('adoptSharedContent meldt een mislukte bewaring (ok: false)', () => {
    failKey = 'wf.widgets.v1';
    expect(adoptSharedContent([], [widget()], { gedeeld: true }).ok).toBe(false);
  });
});

// ── AI9: geen "…" als doel of doelcode ──────────────────────────────────────

describe('sanitizeCourse: doelen zonder letter of cijfer (AI9)', () => {
  it('laat "…", "-" en lege doelen en doelcodes weg', () => {
    const c = sanitizeCourse({
      ...course(),
      chapters: [{ id: 'ch1', title: 'H', sections: [{
        id: 's1', title: 'S', blocks: [],
        goalCodes: ['…', 'NW 1.1', ' - ', '...'],
        goals: ['…', 'Ik kan verdamping uitleggen', '  ', '—'],
      }] }],
    })!;
    expect(c.chapters[0].sections[0].goalCodes).toEqual(['NW 1.1']);
    expect(c.chapters[0].sections[0].goals).toEqual(['Ik kan verdamping uitleggen']);
  });

  it('alleen "…" als doelcode: geen doelcodes', () => {
    const c = sanitizeCourse({ ...course(), chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [], goalCodes: ['…'] }] }] })!;
    expect(c.chapters[0].sections[0].goalCodes).toBeUndefined();
  });
});

// ── CU4/OP12: pdf's reizen mee in het cursusbestand ─────────────────────────

describe('pdf\'s in het cursusbestand (CU4/OP12)', () => {
  const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';
  const metPdf = () => course({
    chapters: [{ id: 'ch1', title: 'H', sections: [{ id: 's1', title: 'S', blocks: [
      { id: 'p1', type: 'pdf', pdfId: 'pdf_een', name: 'werkblad.pdf' },
    ] }] }],
  });

  it('export zet de geüploade pdf erin, ook als het type ontbrak', async () => {
    pdfMock.pdfs.set('pdf_een', { name: 'werkblad.pdf', dataUrl: 'data:application/octet-stream;base64,JVBERi0xLjQK' });
    const json = JSON.parse(await exportCourseJson(metPdf()));
    expect(json.pdfs).toEqual([{ id: 'pdf_een', name: 'werkblad.pdf', dataUrl: PDF }]);
  });

  it('export zonder pdf of met een ontbrekende pdf: geen pdfs-veld', async () => {
    const json = JSON.parse(await exportCourseJson(metPdf()));
    expect(json.pdfs).toBeUndefined();
  });

  it('import houdt alleen echte pdf-data over waar de cursus naar verwijst', () => {
    const res = importCourseJson(JSON.stringify({
      app: 'boosterz', kind: 'cursus', v: 1, course: metPdf(), widgets: [],
      pdfs: [
        { id: 'pdf_een', name: 'werkblad.pdf', dataUrl: PDF },
        { id: 'pdf_een', name: 'dubbel', dataUrl: PDF },
        { id: 'pdf_vreemd', name: 'x.pdf', dataUrl: PDF },
        { id: '../kwaad', name: 'x.pdf', dataUrl: PDF },
        { id: 'pdf_een', name: 'html', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' },
        { id: 'pdf_een', name: 'rommel', dataUrl: 'data:application/pdf;base64,<script>' },
        'onzin',
      ],
    }))!;
    expect(res.pdfs).toEqual([{ id: 'pdf_een', name: 'werkblad.pdf', dataUrl: PDF }]);
  });

  it('terugzetten: ontbrekende pdf wordt bewaard, een bestaande blijft, mislukken wordt geteld', async () => {
    pdfMock.pdfs.set('bestaat', { name: 'eigen.pdf', dataUrl: 'data:application/pdf;base64,AAAA' });
    const r = await restoreCoursePdfs([
      { id: 'nieuw', name: 'n.pdf', dataUrl: PDF },
      { id: 'bestaat', name: 'ander.pdf', dataUrl: PDF },
    ]);
    expect(r).toEqual({ restored: 1, failed: 0 });
    expect(pdfMock.pdfs.get('bestaat')!.name).toBe('eigen.pdf');
    pdfMock.failImport = true;
    expect(await restoreCoursePdfs([{ id: 'nog', name: 'x.pdf', dataUrl: PDF }])).toEqual({ restored: 0, failed: 1 });
  });
});

// ── CU11: democursus komt niet terug en sluit geen eigen werk in ────────────

describe('ensureDemoCourse (CU11)', () => {
  it('maakt de democursus één keer; verwijderd blijft verwijderd', () => {
    ensureDemoCourse();
    const demo = getCourses();
    expect(demo).toHaveLength(1);
    deleteCourse(demo[0].id);
    ensureDemoCourse();
    expect(getCourses()).toHaveLength(0);
  });

  it('sluit alleen een voorbeeldoefening in, nooit een eigen quiz', () => {
    saveWidget(widget({ id: 'eigen', title: 'Mijn toets' }));
    ensureDemoCourse();
    const blokken = getCourses()[0].chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks));
    expect(blokken.some((b) => b.type === 'widget')).toBe(false);

    localStorage.clear();
    saveWidget(widget({ id: 'eigen', title: 'Mijn toets' }));
    saveWidget(widget({ id: 'vb', title: 'Voorbeeld: quiz over België', code: 'VB0001' }));
    ensureDemoCourse();
    const ids = getCourses()[0].chapters.flatMap((ch) => ch.sections.flatMap((s) => s.blocks))
      .flatMap((b) => (b.type === 'widget' ? [b.widgetId] : []));
    expect(ids).toEqual(['vb']);
  });

  it('wie al cursussen heeft, krijgt nooit een democursus (ook niet na alles te verwijderen)', () => {
    saveCourse(course());
    ensureDemoCourse();
    expect(getCourses()).toHaveLength(1);
    deleteCourse('c1');
    ensureDemoCourse();
    expect(getCourses()).toHaveLength(0);
  });
});

// ── storage: saveWidget stempelt standaard, behoudt op vraag ────────────────

describe('saveWidget', () => {
  it('stempelt "nu", behalve met keepUpdatedAt; geeft true/false terug', () => {
    expect(saveWidget(widget({ updatedAt: 5 }))).toBe(true);
    expect(getWidget('w1')!.updatedAt).toBe(100_000);
    saveWidget(widget({ updatedAt: 5 }), { keepUpdatedAt: true });
    expect(getWidget('w1')!.updatedAt).toBe(5);
    failKey = 'wf.widgets.v1';
    expect(saveWidget(widget())).toBe(false);
  });
});
