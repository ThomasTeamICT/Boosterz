import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adoptClassPack, classPackConflicts, classPackFileName, classPackToJson, decodeClassPack, encodeClassPackToUrl,
  findStudentClass, getClassPacks, importClassPackJson, readPastedClassPack,
} from './classPack';
import {
  createAssignment, createClass, getClass, getClassByCode, getStudentContext, loadClassContext, saveAssignment,
  saveClass, setStudentContext, statusForAssignment, zetKlasRichting,
} from './classes';
import type { Doelgroep } from './doelgroep';
import { processCodes } from './inbox';
import { encodeSubmission } from './share';
import { adoptSharedCourse, conflictKey, getCourse, saveCourse } from './courses';
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

// ── LL3 + V3: een nieuw pakket werkt bij, een oud nooit, eigen werk nooit stil ──

describe('klaspakket opnieuw openen: versies (LL3) en eigen werk (V3)', () => {
  /** Pakket met één widgetopdracht, zoals de leerkracht het deelt. */
  function pakket(w: Partial<Widget> = {}, c?: Partial<Course>) {
    const widget = { ...testWidget(), ...w };
    const opdrachten: unknown[] = [{ id: 'a-w', classId: 'k1', kind: 'widget', targetId: widget.id, createdAt: 1, widget }];
    if (c) {
      const course = { ...testCourse(), ...c };
      opdrachten.push({ id: 'a-c', classId: 'k1', kind: 'course', targetId: course.id, createdAt: 2, course, widgets: [widget] });
    }
    return importClassPackJson(JSON.stringify({
      v: 1, kind: 'klas',
      klas: { id: 'k1', name: '1A', code: 'KLAS01', students: [{ id: 'st1', name: 'Emma' }] },
      opdrachten,
    }))!;
  }
  const antwoord = () => (getWidget('w-quiz')!.config as unknown as { questions: { answer: boolean }[] }).questions[0].answer;
  const metAntwoord = (answer: boolean, updatedAt: number): Partial<Widget> => ({
    updatedAt,
    config: { questions: [{ id: 'q1', type: 'tf', prompt: 'België is een federale staat.', points: 1, answer }] } as unknown as Widget['config'],
  });

  it('v1 → v2 nieuwer: de oefening (met de verbeterde sleutel) wordt bijgewerkt', async () => {
    adoptClassPack(pakket(metAntwoord(false, 1000)));
    expect(antwoord()).toBe(false);
    const v2 = pakket(metAntwoord(true, 2000));
    expect(await classPackConflicts(v2)).toEqual([]);
    const r = adoptClassPack(v2);
    expect(r.updated).toBe(1);
    expect(antwoord()).toBe(true);
  });

  it('v2 → v1 ouder (oude link later opnieuw geopend): blijft v2', async () => {
    adoptClassPack(pakket(metAntwoord(true, 2000)));
    const oud = pakket(metAntwoord(false, 1000));
    expect(await classPackConflicts(oud)).toEqual([]);
    adoptClassPack(oud);
    expect(antwoord()).toBe(true);
  });

  it('LL3: link v1 → link v2 → pakket v3 gaat stil (link en pakket zijn gedeelde inhoud)', async () => {
    const viaLink = (versie: string, updatedAt: number) => adoptSharedCourse(
      { ...testCourse(), title: 'Cursus ' + versie, updatedAt },
      [{ ...testWidget(), ...metAntwoord(false, updatedAt), title: 'Quiz ' + versie }],
      { gedeeld: true },
    );
    viaLink('v1', 1000);
    viaLink('v2', 2000);
    expect(getCourse('c-water')!.title).toBe('Cursus v2');
    const v3 = pakket({ ...metAntwoord(true, 3000), title: 'Quiz v3' }, { title: 'Cursus v3', updatedAt: 3000 });
    expect(await classPackConflicts(v3)).toEqual([]);
    adoptClassPack(v3);
    expect(getCourse('c-water')!.title).toBe('Cursus v3');
    expect(getWidget('w-quiz')!.title).toBe('Quiz v3');
    expect(antwoord()).toBe(true);
    // Wat uit het pakket kwam, is nog altijd een zuivere kopie: v4 gaat ook stil.
    const v4 = pakket({ ...metAntwoord(true, 4000), title: 'Quiz v4' }, { title: 'Cursus v4', updatedAt: 4000 });
    expect(await classPackConflicts(v4)).toEqual([]);
    adoptClassPack(v4);
    expect(getCourse('c-water')!.title).toBe('Cursus v4');
    expect(getWidget('w-quiz')!.title).toBe('Quiz v4');
  });

  it('S1: na een teruggezet cursusbestand vraagt een pakket met dezelfde id\'s eerst', async () => {
    // Back-up terugzetten (CoursesPage.finishImport, zonder `gedeeld`): eigen werk.
    adoptSharedCourse({ ...testCourse(), title: 'Mijn back-up', updatedAt: 1000 }, [{ ...testWidget(), title: 'Mijn quiz', updatedAt: 1000 }]);
    const nep = pakket({ title: 'Nagemaakte quiz', updatedAt: 2000 }, { title: 'Nagemaakt', updatedAt: 2000 });
    expect((await classPackConflicts(nep)).map(conflictKey).sort()).toEqual(['course:c-water', 'widget:w-quiz']);
    adoptClassPack(nep);
    expect(getCourse('c-water')!.title).toBe('Mijn back-up');
    expect(getWidget('w-quiz')!.title).toBe('Mijn quiz');
  });

  it('lokaal nieuwer dan het pakket (zelf aangepast): blijft', async () => {
    adoptClassPack(pakket(metAntwoord(false, 1000)));
    saveWidget({ ...getWidget('w-quiz')!, title: 'Zelf aangepast' }); // stempelt nu
    adoptClassPack(pakket(metAntwoord(true, 2000)));
    expect(getWidget('w-quiz')!.title).toBe('Zelf aangepast');
  });

  it('een geknutseld pakket met de id van een eigen cursus overschrijft niets zonder vraag (V3)', async () => {
    // Leerkrachttoestel: eigen cursus en widget.
    saveWidget(testWidget());
    saveCourse({ ...testCourse(), title: 'Mijn cursus' });
    // Het pakket komt later binnen dan de laatste eigen bewerking (dezelfde
    // milliseconde zou als "niet nieuwer" tellen: dan blijft alles sowieso staan).
    await new Promise((r) => setTimeout(r, 5));
    const kaap = pakket({ title: 'Gekaapte quiz', updatedAt: 9_999_999_999_999 }, { title: 'Gekaapt', updatedAt: 9_999_999_999_999 });
    const conflicten = await classPackConflicts(kaap);
    expect(conflicten.map((c) => `${c.kind}:${c.id}`).sort()).toEqual(['course:c-water', 'widget:w-quiz']);

    adoptClassPack(kaap);
    expect(getCourse('c-water')!.title).toBe('Mijn cursus');
    expect(getWidget('w-quiz')!.title).toBe('Quiz over België');
  });

  it('"als kopie bewaren": eigen werk blijft, de opdrachten wijzen naar de kopieën', async () => {
    saveWidget(testWidget());
    saveCourse({ ...testCourse(), title: 'Mijn cursus' });
    await new Promise((r) => setTimeout(r, 5));
    const ander = pakket({ title: 'Quiz collega', updatedAt: Date.now() }, { title: 'Cursus collega', updatedAt: Date.now() });
    const conflicten = await classPackConflicts(ander);
    const r = adoptClassPack(ander, { conflicts: { choice: 'kopie', keys: conflicten.map(conflictKey) } });
    expect(r.copied).toBe(2);
    expect(getCourse('c-water')!.title).toBe('Mijn cursus');
    expect(getWidget('w-quiz')!.title).toBe('Quiz over België');
    const opdrachten = getClassPacks()[0].opdrachten;
    const cursusDoel = opdrachten.find((a) => a.kind === 'course')!.targetId;
    const widgetDoel = opdrachten.find((a) => a.kind === 'widget')!.targetId;
    expect(cursusDoel).not.toBe('c-water');
    expect(widgetDoel).not.toBe('w-quiz');
    expect(getCourse(cursusDoel)!.title).toBe('Cursus collega (kopie)');
    expect(getWidget(widgetDoel)!.title).toBe('Quiz collega (kopie)');
  });

  it('"bijwerken": vervangt eigen werk na de keuze', async () => {
    saveWidget(testWidget());
    saveCourse({ ...testCourse(), title: 'Mijn cursus' });
    await new Promise((r) => setTimeout(r, 5));
    const ander = pakket({ title: 'Quiz collega', updatedAt: Date.now() }, { title: 'Cursus collega', updatedAt: Date.now() });
    const conflicten = await classPackConflicts(ander);
    adoptClassPack(ander, { conflicts: { choice: 'bijwerken', keys: conflicten.map(conflictKey) } });
    expect(getCourse('c-water')!.title).toBe('Cursus collega');
    expect(getWidget('w-quiz')!.title).toBe('Quiz collega');
  });

  it('de leraar opent zijn eigen pakket om te testen: niets verandert, geen vraag', async () => {
    const { cls, opdrachten } = setupTeacherDevice();
    const encoded = await encodeClassPackToUrl(cls, opdrachten);
    const pack = decodeClassPack(encoded.url.split('d=')[1])!;
    expect(await classPackConflicts(pack)).toEqual([]);
    const voor = JSON.stringify([getCourse('c-water'), getWidget('w-quiz')]);
    adoptClassPack(pack);
    expect(JSON.stringify([getCourse('c-water'), getWidget('w-quiz')])).toBe(voor);
  });

  it('opslag vol: het rapport zegt het (ok: false)', () => {
    const vol = memoryStorage();
    const setItem = vol.setItem.bind(vol);
    vol.setItem = (k: string, v: string) => {
      if (k === 'wf.widgets.v1') throw Object.assign(new Error('vol'), { name: 'QuotaExceededError' });
      setItem(k, v);
    };
    (globalThis as unknown as { localStorage: Storage }).localStorage = vol;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(adoptClassPack(pakket()).ok).toBe(false);
    spy.mockRestore();
  });
});

// ── LL12: geplakte klaslink ─────────────────────────────────────────────────

describe('readPastedClassPack (LL12)', () => {
  async function link() {
    const { cls, opdrachten } = setupTeacherDevice();
    const encoded = await encodeClassPackToUrl(cls, opdrachten);
    return { url: encoded.url, d: encoded.url.split('d=')[1], code: cls.code };
  }

  it('leest een volledige link, alleen het d-stuk en het pakketbestand', async () => {
    const { url, d, code } = await link();
    expect(readPastedClassPack(url)?.klas.code).toBe(code);
    expect(readPastedClassPack(`d=${d}`)?.klas.code).toBe(code);
    expect(readPastedClassPack(d)?.klas.code).toBe(code);
    const { pack } = await encodeClassPackToUrl(getClassByCode(code)!, []);
    expect(readPastedClassPack(classPackToJson(pack))?.klas.code).toBe(code);
  });

  it('leest een link met %-codering, spaties in plaats van "+" en een afgebroken regel', async () => {
    const { url, d, code } = await link();
    expect(d).toMatch(/[+$-]/); // de proef is pas zinvol als er zulke tekens in zitten
    const procent = url.replace(/\+/g, '%2B').replace(/\$/g, '%24');
    expect(readPastedClassPack(procent)?.klas.code).toBe(code);
    expect(readPastedClassPack(encodeURIComponent(d))?.klas.code).toBe(code);
    expect(readPastedClassPack(url.replace(/\+/g, ' '))?.klas.code).toBe(code);
    const half = Math.floor(url.length / 2);
    expect(readPastedClassPack(`  ${url.slice(0, half)}\n${url.slice(half)}  `)?.klas.code).toBe(code);
  });

  it('rommel blijft rommel', () => {
    expect(readPastedClassPack('')).toBeNull();
    expect(readPastedClassPack('hallo juf')).toBeNull();
    expect(readPastedClassPack('https://example.org/#/klas/open?d=kapot%')).toBeNull();
    expect(readPastedClassPack('{"kind":"cursus"}')).toBeNull();
  });
});

// ── De studierichting van de klas reist mee (docs/STUDIERICHTINGEN.md § 22.6.1) ─

describe('klas.doelgroep in het klaspakket', () => {
  const HEX64 = 'ab'.repeat(32);
  const NW: Doelgroep = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so', onderdeel: 247 };

  /** De klas van de leerkracht, met richting, en het pakket zoals het de deur uitgaat. */
  async function metRichting() {
    const { cls, opdrachten } = setupTeacherDevice();
    expect(zetKlasRichting(cls.id, NW)).toBe('ok');
    const klas = getClass(cls.id)!;
    const encoded = await encodeClassPackToUrl(klas, opdrachten);
    return { klas, opdrachten, encoded };
  }

  /** Een pakket als tekst, met een klas die we zelf samenstellen (voor geknutselde pakketten). */
  function pakketTekst(klas: Record<string, unknown>): string {
    return JSON.stringify({ v: 1, kind: 'klas', klas: { id: 'k1', name: '4NWA', code: 'ABC123', students: [], ...klas }, opdrachten: [] });
  }

  it('houdt de doelgroep heen en terug via de link', async () => {
    const { encoded } = await metRichting();
    const decoded = decodeClassPack(encoded.url.split('d=')[1])!;
    expect(decoded.klas.doelgroep).toEqual(NW);
    expect(readPastedClassPack(encoded.url)?.klas.doelgroep).toEqual(NW);
  });

  it('houdt de doelgroep heen en terug via het pakketbestand', async () => {
    const { encoded } = await metRichting();
    const bestand = classPackToJson(encoded.pack);
    expect(JSON.parse(bestand).klas.doelgroep).toEqual(NW);
    expect(importClassPackJson(bestand)?.klas.doelgroep).toEqual(NW);
    expect(readPastedClassPack(bestand)?.klas.doelgroep).toEqual(NW);
  });

  it('voegt naast de doelgroep geen enkel ander veld toe aan het pakket', async () => {
    // Hetzelfde toestel, dezelfde klas: één keer zonder en één keer met een richting.
    const { cls, opdrachten } = setupTeacherDevice();
    const zonder = await encodeClassPackToUrl(getClass(cls.id)!, opdrachten);
    zetKlasRichting(cls.id, NW);
    const met = await encodeClassPackToUrl(getClass(cls.id)!, opdrachten);

    const zonderGelezen = decodeClassPack(zonder.url.split('d=')[1])!;
    const metGelezen = decodeClassPack(met.url.split('d=')[1])!;
    expect(Object.keys(metGelezen).sort()).toEqual(Object.keys(zonderGelezen).sort());
    expect(Object.keys(metGelezen.klas).sort()).toEqual([...Object.keys(zonderGelezen.klas), 'doelgroep'].sort());
    expect(Object.keys(metGelezen.klas.doelgroep!).sort()).toEqual(['graad', 'groep', 'jaar', 'onderdeel', 'soort', 'titel']);
    // In het bestand ook: het pakket zelf (voor de klas) verschilt alleen in de doelgroep en de tijd van bewaren.
    const { doelgroep: _dg, updatedAt: _t1, ...metRest } = JSON.parse(classPackToJson(met.pack)).klas;
    const { updatedAt: _t2, ...zonderRest } = JSON.parse(classPackToJson(zonder.pack)).klas;
    expect(metRest).toEqual(zonderRest);
    // En de opdrachten en versie zijn dezelfde.
    expect(metGelezen.v).toBe(1);
    expect(metGelezen.opdrachten).toEqual(zonderGelezen.opdrachten);
  });

  it('een pakket zonder het veld blijft geldig en krijgt er geen', async () => {
    const { cls, opdrachten } = setupTeacherDevice();
    const encoded = await encodeClassPackToUrl(cls, opdrachten);
    const decoded = decodeClassPack(encoded.url.split('d=')[1])!;
    expect(decoded).not.toBeNull();
    expect('doelgroep' in decoded.klas).toBe(false);
    expect(importClassPackJson(pakketTekst({}))?.klas.name).toBe('4NWA');
    expect('doelgroep' in importClassPackJson(pakketTekst({}))!.klas).toBe(false);
  });

  it('een geknutseld pakket met een slecht groepnummer laat het veld weg, maar blijft geldig', () => {
    for (const groep of ['G-12', 'g-0193', '0193', 'G-0193; DROP', '', 12, null]) {
      const klas = importClassPackJson(pakketTekst({ doelgroep: { groep, titel: 'x' } }))?.klas;
      expect(klas, String(groep)).toBeDefined();
      expect('doelgroep' in klas!, String(groep)).toBe(false);
    }
    expect('doelgroep' in importClassPackJson(pakketTekst({ doelgroep: 'G-0193' }))!.klas).toBe(false);
  });

  it('een geknutseld pakket met __proto__ of constructor in de doelgroep doet niets', () => {
    const tekst = '{"v":1,"kind":"klas","klas":{"id":"k1","name":"K","code":"ABC123","students":[],'
      + '"doelgroep":{"groep":"G-0193","titel":"NW","__proto__":{"vak":"Hack","kader":"' + HEX64 + '"},"constructor":{"prototype":{"x":1}}}},"opdrachten":[]}';
    const klas = importClassPackJson(tekst)!.klas;
    expect(klas.doelgroep).toEqual({ groep: 'G-0193', titel: 'NW', soort: 'so' });
    expect(({} as { vak?: string }).vak).toBeUndefined();
    // Ook een `__proto__` op het niveau van de klas verandert niets aan de klas of aan Object.
    const klasProto = importClassPackJson('{"v":1,"kind":"klas","klas":{"id":"k1","name":"K","code":"ABC123","students":[],"__proto__":{"doelgroep":{"groep":"G-0193","titel":"NW"}}},"opdrachten":[]}')!.klas;
    expect('doelgroep' in klasProto).toBe(false);
    expect(({} as { doelgroep?: unknown }).doelgroep).toBeUndefined();
  });

  it('een geknutseld pakket kan geen vak of kadervelden op de klas zetten', () => {
    const klas = importClassPackJson(pakketTekst({
      doelgroep: { ...NW, vak: 'Biologie', kader: HEX64, kaderVolledig: HEX64, volgtKader: true, setAfdrukken: { ODS_1: '0123456789abcdef' } },
    }))!.klas;
    expect(klas.doelgroep).toEqual(NW);
    expect(Object.keys(klas.doelgroep!).sort()).toEqual(['graad', 'groep', 'jaar', 'onderdeel', 'soort', 'titel']);
  });

  it('bij de leerling bewaard (readPacks): het veld blijft, ook via findStudentClass', async () => {
    const { klas, encoded } = await metRichting();
    freshDevice();
    adoptClassPack(decodeClassPack(encoded.url.split('d=')[1])!);
    expect(getClassPacks()[0].klas.doelgroep).toEqual(NW);
    expect(findStudentClass(klas.code)?.cls.doelgroep).toEqual(NW);
    // In de opslag staat alleen de doelgroep erbij, geen ander nieuw veld.
    const bewaard = JSON.parse(localStorage.getItem('wf.classpacks.v1') ?? '[]')[0].klas;
    expect(Object.keys(bewaard.doelgroep).sort()).toEqual(['graad', 'groep', 'jaar', 'onderdeel', 'soort', 'titel']);
    expect(Object.keys(bewaard).sort()).toEqual(['code', 'createdAt', 'doelgroep', 'id', 'name', 'schoolYear', 'students', 'updatedAt']);
  });

  it('bij de leerling bewaard: een slechte of te rijke doelgroep in de opslag wordt bij het lezen gesaneerd', () => {
    const rij = (doelgroep: unknown) => ({
      klas: { id: 'k1', name: '4NWA', code: 'ABC123', students: [], createdAt: 1, updatedAt: 2, doelgroep }, opdrachten: [], adoptedAt: 3,
    });
    localStorage.setItem('wf.classpacks.v1', JSON.stringify([rij({ ...NW, vak: 'Biologie', kader: HEX64, volgtKader: true })]));
    expect(getClassPacks()[0].klas.doelgroep).toEqual(NW);
    localStorage.setItem('wf.classpacks.v1', JSON.stringify([rij({ groep: 'kapot', titel: 'x' })]));
    expect(getClassPacks()).toHaveLength(1);
    expect(getClassPacks()[0].klas.doelgroep).toBeUndefined();
  });

  it('geen persoonsgegevens: de doelgroep in het pakket noemt geen leerling', async () => {
    const { encoded } = await metRichting();
    const bestand = classPackToJson(encoded.pack);
    const doelgroep = JSON.stringify(JSON.parse(bestand).klas.doelgroep);
    expect(doelgroep).not.toContain('Emma');
    expect(doelgroep).not.toContain('Noah');
    expect(doelgroep).not.toContain('st1');
  });
});
