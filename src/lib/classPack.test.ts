import { beforeEach, describe, expect, it } from 'vitest';
import {
  adoptClassPack, classPackFileName, classPackToJson, decodeClassPack, encodeClassPackToUrl,
  findStudentClass, getClassPacks, importClassPackJson,
} from './classPack';
import {
  createAssignment, createClass, getClassByCode, getStudentContext, loadClassContext, saveAssignment,
  saveClass, setStudentContext, statusForAssignment,
} from './classes';
import { processCodes } from './inbox';
import { encodeSubmission } from './share';
import { getCourse, saveCourse } from './courses';
import { getWidget, saveSubmission, saveWidget } from './storage';
import type { Course } from './courseTypes';
import type { Submission, Widget } from './types';

// ── Nep-localStorage: de opslaglaag van de app draait hier in het geheugen ───

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

/** Vers "toestel": lege opslag. */
function freshDevice() {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
}

beforeEach(freshDevice);

function testWidget(): Widget {
  return {
    id: 'w-quiz', type: 'quiz', title: 'Quiz over België', folderId: null,
    code: 'WQUIZ1',
    config: { questions: [{ id: 'q1', type: 'tf', prompt: 'België is een federale staat.', points: 1, answer: true, goalCode: 'GES 1.2' }] },
    settings: {
      accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true,
      timeLimitMin: 0, maxAttempts: 0, requireName: true, instructions: '',
    },
    curriculumId: 'cur-1',
    createdAt: 1, updatedAt: 2,
  };
}

function testCourse(): Course {
  return {
    id: 'c-water', title: 'De waterkringloop', author: 'Juf An', coverEmoji: '💧', code: 'CWATER',
    chapters: [{
      id: 'ch1', title: 'Verdamping', emoji: '☁️',
      sections: [{
        id: 's1', title: 'Wat is verdamping?',
        blocks: [
          { id: 'b1', type: 'text', markdown: 'De zon verwarmt het water.' },
          { id: 'b2', type: 'widget', widgetId: 'w-quiz' },
        ],
      }],
    }],
    settings: { accentColor: '#0891b2', requireName: true, showProgressToStudent: true },
    createdAt: 1, updatedAt: 2,
  };
}

/** Klas met opdrachten, klaar om te delen (op het toestel van de leerkracht). */
function setupTeacherDevice() {
  const widget = testWidget();
  const course = testCourse();
  saveWidget(widget);
  saveCourse(course);
  const cls = createClass({
    name: 'Voorbeeldklas 1A',
    schoolYear: '2025-2026',
    students: [
      { id: 'st1', name: 'Emma Peeters', number: 1 },
      { id: 'st2', name: 'Noah Claes', number: 2 },
    ],
  });
  saveClass(cls);
  const opdrachten = [
    createAssignment({ classId: cls.id, kind: 'course', targetId: course.id, dueAt: 1770000000000, note: 'Lees dit tegen vrijdag.' }),
    createAssignment({ classId: cls.id, kind: 'widget', targetId: widget.id }),
  ];
  opdrachten.forEach(saveAssignment);
  return { cls, opdrachten, widget, course };
}

describe('klaspakket', () => {
  it('codeert en decodeert een volledig pakket (klas, opdrachten en inhoud)', async () => {
    const { cls, opdrachten } = setupTeacherDevice();
    const encoded = await encodeClassPackToUrl(cls, opdrachten);
    expect(encoded.url).toContain('#/klas/open?d=');
    expect(encoded.length).toBe(encoded.url.length);
    expect(encoded.unresolved).toBe(0);

    const d = encoded.url.split('d=')[1];
    const decoded = decodeClassPack(d);
    expect(decoded).not.toBeNull();
    expect(decoded!.klas.name).toBe('Voorbeeldklas 1A');
    expect(decoded!.klas.code).toBe(cls.code);
    expect(decoded!.klas.students.map((s) => s.name)).toEqual(['Emma Peeters', 'Noah Claes']);
    expect(decoded!.opdrachten).toHaveLength(2);

    const cursusOpdracht = decoded!.opdrachten.find((a) => a.kind === 'course')!;
    expect(cursusOpdracht.course?.title).toBe('De waterkringloop');
    expect(cursusOpdracht.dueAt).toBe(1770000000000);
    expect(cursusOpdracht.note).toBe('Lees dit tegen vrijdag.');
    // De ingebedde oefening van de cursus reist mee
    expect(cursusOpdracht.widgets?.map((w) => w.id)).toEqual(['w-quiz']);

    const widgetOpdracht = decoded!.opdrachten.find((a) => a.kind === 'widget')!;
    expect(widgetOpdracht.widget?.title).toBe('Quiz over België');
    // Het leerplan van de widget blijft bewaard (anders vallen doelcodes weg)
    expect(widgetOpdracht.widget?.curriculumId).toBe('cur-1');
  });

  it('neemt het pakket over op een leeg toestel en vindt de klas terug', async () => {
    const { cls, opdrachten } = setupTeacherDevice();
    const encoded = await encodeClassPackToUrl(cls, opdrachten);
    const d = encoded.url.split('d=')[1];

    freshDevice(); // toestel van de leerling: nog niets
    expect(getCourse('c-water')).toBeUndefined();

    const pack = decodeClassPack(d)!;
    const report = adoptClassPack(pack);
    expect(report.courses).toBe(1);
    expect(getCourse('c-water')?.title).toBe('De waterkringloop');
    expect(getWidget('w-quiz')?.title).toBe('Quiz over België');

    // De klas staat apart (leerlingzijde), niet in de klassenlijst van de leerkracht
    expect(getClassByCode(cls.code)).toBeUndefined();
    expect(getClassPacks()).toHaveLength(1);

    const view = findStudentClass(cls.code.toLowerCase());
    expect(view).not.toBeNull();
    expect(view!.fromPack).toBe(true);
    expect(view!.cls.students).toHaveLength(2);
    expect(view!.assignments).toHaveLength(2);
  });

  it('bewaart het pakket ook als bestand en leest dat weer in', async () => {
    const { cls, opdrachten } = setupTeacherDevice();
    const { pack } = await encodeClassPackToUrl(cls, opdrachten);
    const json = classPackToJson(pack);
    expect(classPackFileName(cls)).toBe('voorbeeldklas-1a.klaspakket.json');

    freshDevice();
    const ingelezen = importClassPackJson(json);
    expect(ingelezen?.klas.code).toBe(cls.code);
    expect(ingelezen?.opdrachten).toHaveLength(2);
    adoptClassPack(ingelezen!);
    expect(findStudentClass(cls.code)?.assignments).toHaveLength(2);
  });

  it('weigert rommel en knutselwerk netjes', () => {
    expect(decodeClassPack('dit-is-geen-pakket')).toBeNull();
    expect(decodeClassPack('')).toBeNull();
    expect(importClassPackJson('{')).toBeNull();
    expect(importClassPackJson('{"kind":"cursus"}')).toBeNull();
    // klas zonder naam → onbruikbaar
    expect(importClassPackJson('{"v":1,"kind":"klas","klas":{"id":"x","students":[]}}')).toBeNull();
  });

  it('hangt opdrachten uit het pakket altijd aan de klas uit datzelfde pakket', () => {
    const pack = importClassPackJson(
      JSON.stringify({
        v: 1, kind: 'klas',
        klas: { id: 'k-echt', name: '1A', code: 'AAAAAA', students: [{ id: 's', name: 'Emma' }] },
        opdrachten: [{ id: 'a1', classId: 'k-vervalst', kind: 'widget', targetId: 'w1' }],
      })
    );
    expect(pack?.opdrachten[0].classId).toBe('k-echt');
  });

  it('laat geen javascript:-URL door in een cursus uit een klaspakket (pdf-blok en bijlage)', () => {
    const pack = importClassPackJson(
      JSON.stringify({
        v: 1, kind: 'klas',
        klas: { id: 'k1', name: '1A', code: 'KLAS11', students: [{ id: 'l1', name: 'Emma' }] },
        opdrachten: [{
          id: 'o1', kind: 'course', targetId: 'c_pack',
          course: {
            id: 'c_pack', title: 'Cursus', code: 'PCK123',
            chapters: [{ id: 'ch1', title: 'H1', sections: [{ id: '__proto__', title: 'S1', blocks: [
              { id: 'b1', type: 'pdf', url: 'javascript:window.parent.__xss=1' },
              { id: 'b2', type: 'attachment', name: 'huiswerk.pdf', dataUrl: ' JaVaScRiPt:window.__xss=1' },
            ] }] }],
          },
          widgets: [],
        }],
      })
    )!;
    adoptClassPack(pack);
    const course = getCourse('c_pack')!;
    const section = course.chapters[0].sections[0];
    expect(section.id).not.toBe('__proto__');
    expect(section.blocks.map((b) => b.type)).toEqual(['attachment']);
    expect(section.blocks[0].type === 'attachment' && section.blocks[0].dataUrl).toBe('');
  });
});

// ── Van klaslink tot inleverpunt: de hele keten in één test ─────────────────

describe('de keten klas → leerling → inleverpunt', () => {
  it('brengt werk van het leerlingtoestel terug onder de juiste leerling', async () => {
    // 1. Leerkrachttoestel: klas met een oefening als opdracht.
    const leerkracht = memoryStorage();
    (globalThis as unknown as { localStorage: Storage }).localStorage = leerkracht;
    const { cls, opdrachten, widget } = setupTeacherDevice();
    const encoded = await encodeClassPackToUrl(cls, opdrachten);
    const d = encoded.url.split('d=')[1];

    // 2. Toestel van de leerling: pakket overnemen, naam kiezen, oefening maken.
    const leerling = memoryStorage();
    (globalThis as unknown as { localStorage: Storage }).localStorage = leerling;
    adoptClassPack(decodeClassPack(d)!);
    const view = findStudentClass(cls.code)!;
    const emma = view.cls.students[0];
    setStudentContext({
      classId: view.cls.id, classCode: view.cls.code, className: view.cls.name,
      studentId: emma.id, studentName: emma.name,
    });
    const ctxOpToestel = getStudentContext()!;
    const inzending: Submission = {
      id: 'sub-thuis', widgetId: widget.id, widgetCode: widget.code,
      studentName: ctxOpToestel.studentName, classId: ctxOpToestel.classId, studentId: ctxOpToestel.studentId,
      startedAt: 1000, submittedAt: 2000, durationSec: 42,
      answers: { q1: true }, itemScores: { q1: { earned: 1, max: 1, mode: 'auto' } },
      totalEarned: 1, totalMax: 1, status: 'graded',
    };
    saveSubmission(inzending);
    const code = await encodeSubmission(inzending);
    expect(code.startsWith('WF1.')).toBe(true);

    // 3. Terug op het toestel van de leerkracht: code in het inleverpunt.
    (globalThis as unknown as { localStorage: Storage }).localStorage = leerkracht;
    const report = processCodes(code);
    expect(report.nieuw).toBe(1);
    expect(report.rows[0].studentName).toBe('Emma Peeters');
    expect(report.rows[0].className).toBe('Voorbeeldklas 1A');

    // 4. En het klasoverzicht telt haar werk mee, op studentId.
    const ctx = loadClassContext(opdrachten);
    const status = statusForAssignment(opdrachten[1], emma, ctx);
    expect(status.state).toBe('ingediend');
    expect(status.scorePct).toBe(100);
    // Dezelfde code een tweede keer verandert niets meer.
    expect(processCodes(code).dubbel).toBe(1);
  });
});
