import { beforeEach, describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { processCodes, splitCodes, summarizeReport, type InboxDeps } from './inbox';
import { encodeCourseProgress, getStudentProgress, mergeProgressRecords } from './courses';
import type { ClassGroup } from './classTypes';
import type { Course, CourseProgress } from './courseTypes';
import type { Submission, Widget } from './types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const klas: ClassGroup = {
  id: 'k1', name: '1A', code: 'KLAS01', students: [
    { id: 'st1', name: 'Emma Peeters', number: 1 },
    { id: 'st2', name: 'Noah Claes', number: 2 },
  ],
  createdAt: 0, updatedAt: 0,
};

const quiz: Widget = {
  id: 'w1', type: 'quiz', title: 'Quiz over België', folderId: null, code: 'WQUIZ1',
  config: { questions: [] }, settings: {} as Widget['settings'], createdAt: 0, updatedAt: 0,
};

const cursus: Course = {
  id: 'c1', title: 'De waterkringloop', author: '', coverEmoji: '💧', code: 'CWATER',
  chapters: [{
    id: 'ch1', title: 'H1',
    sections: [
      { id: 's1', title: 'S1', blocks: [] },
      { id: 's2', title: 'S2', blocks: [] },
    ],
  }],
  settings: { accentColor: '#000', requireName: true, showProgressToStudent: true },
  createdAt: 0, updatedAt: 0,
};

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub1', widgetId: 'w1', widgetCode: 'WQUIZ1', studentName: 'Emma Peeters',
    startedAt: 1000, submittedAt: 2000, durationSec: 30, answers: { q1: true },
    itemScores: null, totalEarned: 7, totalMax: 10, status: 'graded',
    ...over,
  };
}

/** Zelfde vorm als lib/share.ts: WF1. + lz-string. */
function resultCode(sub: Submission): string {
  return 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(sub));
}

function progress(over: Partial<CourseProgress> = {}): CourseProgress {
  return {
    courseId: 'c1', courseCode: 'CWATER', studentName: 'Noah Claes',
    sections: { s1: { openedAt: 1, completedAt: 2, secondsSpent: 60 } },
    lastSeenAt: 5000, startedAt: 1000,
    ...over,
  };
}

/**
 * Deps met alles in het geheugen; `savedSubs`/`savedProgress` leggen elke
 * bewaaractie vast. De voortgangsopslag voegt samen zoals de echte
 * (importProgressCode): `progressStore` is wat er daarna "op het toestel" staat.
 */
function makeDeps(over: Partial<InboxDeps> = {}) {
  const savedSubs: Submission[] = [];
  const savedProgress: CourseProgress[] = [];
  const progressStore = new Map<string, CourseProgress>();
  const sleutel = (courseId: string, naam: string) => `${courseId}::${naam.trim().toLowerCase()}`;
  const bestaand: Submission[] = (over.submissions ?? []) as Submission[];
  const deps: InboxDeps = {
    classes: [klas],
    submissions: bestaand,
    findWidget: (sub) => (sub.widgetId === quiz.id || sub.widgetCode === quiz.code ? quiz : undefined),
    findCourse: (p) => (p.courseId === cursus.id || p.courseCode === cursus.code ? cursus : undefined),
    findProgress: (courseId, studentName) => progressStore.get(sleutel(courseId, studentName)),
    saveSubmission: (s) => { savedSubs.push(s); },
    saveProgress: (p) => {
      savedProgress.push(p);
      const k = sleutel(p.courseId, p.studentName);
      const cur = progressStore.get(k);
      progressStore.set(k, cur ? mergeProgressRecords(cur, p) : p);
    },
    newId: () => 'nieuw-id',
    ...over,
  };
  return { deps, savedSubs, savedProgress, progressStore };
}

// ── Codes uit tekst halen ───────────────────────────────────────────────────

describe('splitCodes', () => {
  it('vist codes uit een geplakt bericht met begeleidende tekst', () => {
    const codes = splitCodes('Dag juf! Hier is mijn code: "WF1.AAA", en die van de cursus (WFC1.BBB).\nWF1.CCC');
    expect(codes).toEqual(['WF1.AAA', 'WFC1.BBB', 'WF1.CCC']);
  });

  it('negeert alles wat geen code is', () => {
    expect(splitCodes('geen enkele code hier')).toEqual([]);
    expect(splitCodes('')).toEqual([]);
  });
});

// ── Verwerking ──────────────────────────────────────────────────────────────

describe('processCodes — resultaatcodes', () => {
  it('bewaart een nieuwe inzending en beschrijft ze met klas en score', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(resultCode(submission({ classId: 'k1', studentId: 'st1', studentName: 'emma' })), deps);
    expect(report.nieuw).toBe(1);
    expect(savedSubs).toHaveLength(1);
    const row = report.rows[0];
    expect(row.outcome).toBe('nieuw');
    expect(row.kind).toBe('widget');
    expect(row.saved).toBe(true);
    // naam uit de klaslijst, niet wat de leerling typte
    expect(row.studentName).toBe('Emma Peeters');
    expect(row.className).toBe('1A');
    expect(row.title).toBe('Quiz over België');
    expect(row.detail).toBe('7/10 · 70%');
  });

  it('ontdubbelt binnen dezelfde plakbeurt', () => {
    const code = resultCode(submission());
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(`${code}\n${code}`, deps);
    expect(report.nieuw).toBe(1);
    expect(report.dubbel).toBe(1);
    expect(savedSubs).toHaveLength(1);
    expect(report.rows[1].message).toMatch(/stond hier al/i);
  });

  it('zegt bij een te grote code de echte reden, niet "beschadigd" (S2)', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(resultCode(submission({ answers: { x: 'a'.repeat(2_000_000) } })), deps);
    expect(report.rows[0].outcome).toBe('ongeldig');
    expect(report.rows[0].message).toMatch(/veel meer antwoorden of tekst/);
    expect(report.rows[0].message).not.toMatch(/beschadigd/);
    expect(savedSubs).toHaveLength(0);
  });

  it('herkent werk dat hier al staat (zelfde widget, naam en indienmoment)', () => {
    const { deps, savedSubs } = makeDeps({ submissions: [submission({ id: 'ander-id' })] });
    const report = processCodes(resultCode(submission()), deps);
    expect(report.dubbel).toBe(1);
    expect(report.nieuw).toBe(0);
    expect(savedSubs).toHaveLength(0);
  });

  it('geeft een nieuw id wanneer dat id hier al bestaat (nooit iets overschrijven)', () => {
    const { deps, savedSubs } = makeDeps({ submissions: [submission({ submittedAt: 999 })] });
    const report = processCodes(resultCode(submission({ submittedAt: 3000 })), deps);
    expect(report.nieuw).toBe(1);
    expect(savedSubs[0].id).toBe('nieuw-id');
  });

  it('zet de inzending op het widget-id van dit toestel (ander id na een deellink)', () => {
    const { deps, savedSubs } = makeDeps();
    processCodes(resultCode(submission({ widgetId: 'id-van-thuis', widgetCode: 'WQUIZ1' })), deps);
    expect(savedSubs[0].widgetId).toBe('w1');
  });

  it('bewaart werk voor een onbekende widget, maar zegt het erbij', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes(resultCode(submission({ widgetId: 'onbekend', widgetCode: 'XXXXXX' })), deps);
    expect(report.onbekend).toBe(1);
    expect(report.rows[0].saved).toBe(true);
    expect(report.rows[0].title).toBeNull();
    expect(report.rows[0].message).toMatch(/staat niet op dit toestel/i);
    expect(savedSubs).toHaveLength(1);
  });

  it('meldt een beschadigde of onvolledige code', () => {
    const { deps, savedSubs } = makeDeps();
    const report = processCodes('WF1.dit-is-afgekapt', deps);
    expect(report.ongeldig).toBe(1);
    expect(report.rows[0].message).toMatch(/onvolledig of beschadigd/i);
    expect(savedSubs).toHaveLength(0);
  });
});

describe('processCodes — voortgangscodes', () => {
  it('bewaart leesvoortgang, met percentage en klas', () => {
    const { deps, savedProgress } = makeDeps();
    const report = processCodes(encodeCourseProgress(progress({ studentId: 'st2', classId: 'k1' })), deps);
    expect(report.nieuw).toBe(1);
    expect(savedProgress).toHaveLength(1);
    const row = report.rows[0];
    expect(row.kind).toBe('course');
    expect(row.studentName).toBe('Noah Claes');
    expect(row.className).toBe('1A');
    expect(row.title).toBe('De waterkringloop');
    expect(row.detail).toBe('50% gelezen (1/2 secties)');
    // classId en studentId overleven de voortgangscode
    expect(savedProgress[0].classId).toBe('k1');
    expect(savedProgress[0].studentId).toBe('st2');
  });

  it('werkt niets bij als dezelfde voortgang al binnen is', () => {
    const { deps, savedProgress } = makeDeps();
    const code = encodeCourseProgress(progress());
    const eerste = processCodes(code, deps);
    expect(eerste.nieuw).toBe(1);
    const tweede = processCodes(code, deps);
    expect(tweede.dubbel).toBe(1);
    expect(savedProgress).toHaveLength(1);
  });

  it('neemt nieuwere voortgang van dezelfde leerling wél over', () => {
    const { deps, savedProgress } = makeDeps();
    processCodes(encodeCourseProgress(progress()), deps);
    const later = progress({
      lastSeenAt: 9000,
      sections: {
        s1: { openedAt: 1, completedAt: 2, secondsSpent: 60 },
        s2: { openedAt: 3, completedAt: 4, secondsSpent: 60 },
      },
    });
    const report = processCodes(encodeCourseProgress(later), deps);
    expect(report.nieuw).toBe(1);
    expect(savedProgress).toHaveLength(2);
    expect(report.rows[0].detail).toBe('100% gelezen (2/2 secties)');
  });

  it('bewaart voortgang van een cursus die hier niet staat', () => {
    const { deps, savedProgress } = makeDeps();
    const report = processCodes(encodeCourseProgress(progress({ courseId: 'weg', courseCode: 'ZZZZZZ' })), deps);
    expect(report.onbekend).toBe(1);
    expect(savedProgress).toHaveLength(1);
  });
});

describe('samenvatting', () => {
  it('vat een gemengde beurt kort samen', () => {
    const { deps } = makeDeps();
    const code = resultCode(submission());
    const report = processCodes(`${code} ${code} WF1.kapot`, deps);
    expect(summarizeReport(report)).toBe('1 nieuw, 1 al aanwezig, 1 ongeldig');
    expect(summarizeReport({ rows: [], nieuw: 0, dubbel: 0, onbekend: 0, ongeldig: 0 })).toBe('Geen codes gevonden.');
  });
});

// ── KL1: voortgangscodes van twee toestellen samenvoegen ────────────────────

describe('processCodes — voortgang van twee toestellen (KL1)', () => {
  const sectie = (n: number) => ({ openedAt: n, completedAt: n + 1, secondsSpent: 30 });
  /** Op school s1–s3 gelezen, later gezien dan thuis. */
  const school = () => progress({
    studentName: 'Emma Peeters', lastSeenAt: 9000,
    sections: { s1: sectie(1), s2: sectie(2), s3: sectie(3) },
  });
  /** Thuis s4–s5 gelezen, vroeger dan op school. */
  const thuis = () => progress({
    studentName: 'emma peeters', lastSeenAt: 7000,
    sections: { s4: sectie(4), s5: sectie(5) },
  });
  const secties = (p: CourseProgress | undefined) => Object.keys(p?.sections ?? {}).sort();

  for (const [naam, volgorde] of [
    ['school dan thuis', [school, thuis]],
    ['thuis dan school', [thuis, school]],
  ] as const) {
    it(`${naam}, in één beurt: beide nieuw, s1–s5 samen`, () => {
      const { deps, progressStore } = makeDeps();
      const report = processCodes(volgorde.map((f) => encodeCourseProgress(f())).join('\n'), deps);
      expect(report.rows.map((r) => r.outcome)).toEqual(['nieuw', 'nieuw']);
      const opgeslagen = [...progressStore.values()];
      expect(opgeslagen).toHaveLength(1);
      expect(secties(opgeslagen[0])).toEqual(['s1', 's2', 's3', 's4', 's5']);
      // "Laatst gezien" is het maximum uit de codes, niet het moment van inlezen.
      expect(opgeslagen[0].lastSeenAt).toBe(9000);
    });

    it(`${naam}, in twee beurten: beide nieuw, s1–s5 samen`, () => {
      const { deps, progressStore } = makeDeps();
      const eerste = processCodes(encodeCourseProgress(volgorde[0]()), deps);
      const tweede = processCodes(encodeCourseProgress(volgorde[1]()), deps);
      expect([eerste.rows[0].outcome, tweede.rows[0].outcome]).toEqual(['nieuw', 'nieuw']);
      const opgeslagen = [...progressStore.values()][0];
      expect(secties(opgeslagen)).toEqual(['s1', 's2', 's3', 's4', 's5']);
      expect(opgeslagen.lastSeenAt).toBe(9000);
    });
  }

  it('dezelfde code twee keer (ook binnen één beurt) is dubbel en bewaart niets extra', () => {
    const { deps, savedProgress } = makeDeps();
    const code = encodeCourseProgress(school());
    const report = processCodes(`${code}\n${code}`, deps);
    expect(report.rows.map((r) => r.outcome)).toEqual(['nieuw', 'dubbel']);
    expect(savedProgress).toHaveLength(1);
    expect(processCodes(code, deps).rows[0].outcome).toBe('dubbel');
    expect(savedProgress).toHaveLength(1);
  });

  it('een oudere code die toch een nieuw vinkje meebrengt, is niet dubbel', () => {
    const { deps, progressStore } = makeDeps();
    processCodes(encodeCourseProgress(school()), deps);
    const metVinkje = progress({
      studentName: 'Emma Peeters', lastSeenAt: 100,
      sections: { s1: { ...sectie(1), checks: { b1: ['item-a'] } } },
    });
    const report = processCodes(encodeCourseProgress(metVinkje), deps);
    expect(report.rows[0].outcome).toBe('nieuw');
    const opgeslagen = [...progressStore.values()][0];
    expect(opgeslagen.sections.s1.checks).toEqual({ b1: ['item-a'] });
    expect(opgeslagen.lastSeenAt).toBe(9000);
  });

  it('de detailregel toont de samengevoegde voortgang', () => {
    const { deps } = makeDeps();
    const report = processCodes(
      [encodeCourseProgress(progress({ sections: { s1: sectie(1) } })),
        encodeCourseProgress(progress({ lastSeenAt: 1, sections: { s2: sectie(2) } }))].join(' '),
      deps,
    );
    expect(report.rows[1].detail).toBe('100% gelezen (2/2 secties)');
  });
});

describe('processCodes — voortgang met de echte opslag (KL1)', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, String(v)); },
      removeItem: (k: string) => { data.delete(k); },
      clear: () => data.clear(),
    } as Storage;
  });

  it('thuis dan school in twee beurten: niets verloren, laatst gezien uit de codes', () => {
    const thuisCode = encodeCourseProgress(progress({ lastSeenAt: 7000, sections: { s4: { openedAt: 4, completedAt: 5, secondsSpent: 1 } } }));
    const schoolCode = encodeCourseProgress(progress({ lastSeenAt: 9000, sections: { s1: { openedAt: 1, completedAt: 2, secondsSpent: 1 } } }));
    expect(processCodes(thuisCode).rows[0].outcome).toBe('onbekend'); // cursus staat niet op dit toestel
    expect(processCodes(schoolCode).rows[0].outcome).toBe('onbekend');
    const p = getStudentProgress('c1', 'Noah Claes')!;
    expect(Object.keys(p.sections).sort()).toEqual(['s1', 's4']);
    expect(p.lastSeenAt).toBe(9000);
    // Nog eens dezelfde code: niets nieuws.
    expect(processCodes(thuisCode).rows[0].outcome).toBe('dubbel');
  });

  it('oude opgeslagen voortgang (zonder klas of leerling-id) blijft bruikbaar en wordt aangevuld', () => {
    localStorage.setItem('wf.courseprogress.v1', JSON.stringify([
      { courseId: 'c1', courseCode: 'CWATER', studentName: 'Noah Claes', sections: { s1: { openedAt: 1, secondsSpent: 5 } }, lastSeenAt: 500, startedAt: 1 },
    ]));
    const report = processCodes(encodeCourseProgress(progress({ classId: 'k1', studentId: 'st2', lastSeenAt: 400, sections: { s1: { openedAt: 1, secondsSpent: 5 } } })));
    expect(report.rows[0].outcome).toBe('onbekend');
    const p = getStudentProgress('c1', 'noah claes')!;
    expect(p.studentId).toBe('st2');
    expect(p.lastSeenAt).toBe(500);
  });
});

// ── KL2: geknutselde of kapotte codes ──────────────────────────────────────

describe('processCodes — geknutselde codes (KL2)', () => {
  const ruweCode = (o: unknown) => 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(o));

  it('een naam die geen tekst is, wordt ongeldig en houdt de rest niet tegen', () => {
    const { deps, savedSubs } = makeDeps();
    const kapot = ruweCode({ ...submission(), studentName: 12345 });
    const goed = resultCode(submission({ submittedAt: 3000 }));
    const report = processCodes(`${kapot}\n${goed}`, deps);
    expect(report.rows.map((r) => r.outcome)).toEqual(['ongeldig', 'nieuw']);
    expect(savedSubs).toHaveLength(1);
  });

  it('rommel in scores en totalen wordt nooit zo bewaard', () => {
    const { deps, savedSubs } = makeDeps();
    processCodes(ruweCode({ ...submission(), itemScores: 'nee', totalMax: 'x', totalEarned: null, status: 'hack' }), deps);
    expect(savedSubs).toHaveLength(1);
    expect(savedSubs[0].itemScores).toBeNull();
    expect(savedSubs[0].totalMax).toBe(0);
    expect(savedSubs[0].totalEarned).toBe(0);
    expect(savedSubs[0].status).toBe('submitted');
  });

  it('een onverwachte fout bij één code geeft "ongeldig" en de beurt loopt door', () => {
    let eerste = true;
    const { deps, savedSubs } = makeDeps({
      findWidget: (sub) => {
        if (eerste) { eerste = false; throw new Error('kapot'); }
        return sub.widgetId === quiz.id ? quiz : undefined;
      },
    });
    const report = processCodes(`${resultCode(submission())}\n${resultCode(submission({ submittedAt: 3000 }))}`, deps);
    expect(report.rows.map((r) => r.outcome)).toEqual(['ongeldig', 'nieuw']);
    expect(report.rows[0].message).toMatch(/kon niet verwerkt worden/);
    expect(savedSubs).toHaveLength(1);
  });

  it('niet bewaard (volle opslag) wordt eerlijk gemeld, niet als bewaard', () => {
    const { deps } = makeDeps({ saveSubmission: () => false });
    const report = processCodes(resultCode(submission()), deps);
    expect(report.rows[0].saved).toBe(false);
    expect(report.rows[0].outcome).toBe('ongeldig');
    expect(report.rows[0].message).toMatch(/Niet bewaard/);
  });
});

// ── LL13: reflectie na de eerste code ───────────────────────────────────────

describe('processCodes — reflectie die later binnenkomt (LL13)', () => {
  it('vult alleen de reflectie aan, de uitkomst blijft "dubbel"', () => {
    const bewaard = submission({ id: 'hier', teacherFeedback: 'Goed gedaan', totalEarned: 9 });
    const { deps, savedSubs } = makeDeps({ submissions: [bewaard] });
    const metReflectie = submission({
      answers: { q1: true, _foutenanalyse: { labels: { q1: 'slordig' }, volgendeKeer: 'Rustig lezen' }, _doelreflectie: 'Gehaald' },
    });
    const report = processCodes(resultCode(metReflectie), deps);
    expect(report.rows[0].outcome).toBe('dubbel');
    expect(report.rows[0].message).toBe('Stond hier al — de reflectie van de leerling is toegevoegd.');
    expect(savedSubs).toHaveLength(1);
    const nieuw = savedSubs[0];
    expect(nieuw.id).toBe('hier');
    expect(nieuw.teacherFeedback).toBe('Goed gedaan');
    expect(nieuw.totalEarned).toBe(9);
    expect(nieuw.answers._foutenanalyse).toEqual({ labels: { q1: 'slordig' }, volgendeKeer: 'Rustig lezen' });
    expect(nieuw.answers._doelreflectie).toBe('Gehaald');
  });

  it('overschrijft een reflectie die er al staat nooit', () => {
    const bewaard = submission({ id: 'hier', answers: { q1: true, _doelreflectie: 'Eerste versie' } });
    const { deps, savedSubs } = makeDeps({ submissions: [bewaard] });
    const report = processCodes(resultCode(submission({ answers: { q1: true, _doelreflectie: 'Andere' } })), deps);
    expect(report.rows[0].outcome).toBe('dubbel');
    expect(report.rows[0].message).toBe('Stond hier al — niets toegevoegd.');
    expect(savedSubs).toHaveLength(0);
  });

  it('werkt ook binnen dezelfde beurt', () => {
    const { deps, savedSubs } = makeDeps();
    const zonder = resultCode(submission());
    const met = resultCode(submission({ answers: { q1: true, _doelreflectie: 'Gehaald' } }));
    const report = processCodes(`${zonder}\n${met}`, deps);
    expect(report.rows.map((r) => r.outcome)).toEqual(['nieuw', 'dubbel']);
    expect(savedSubs).toHaveLength(2);
    expect(savedSubs[1].id).toBe(savedSubs[0].id);
    expect(savedSubs[1].answers._doelreflectie).toBe('Gehaald');
  });
});

// ── Nieuw 1: eerst zonder widget, daarna met ────────────────────────────────

describe('processCodes — eerst ingelezen zonder widget, daarna mét (nieuw 1)', () => {
  it('telt niet als tweede poging en koppelt het eerdere werk aan de widget', () => {
    const vanThuis = submission({ widgetId: 'id-van-thuis', widgetCode: 'WQUIZ1' });
    // Eerste keer: de widget staat hier nog niet.
    const zonderWidget = makeDeps({ findWidget: () => undefined });
    const eerste = processCodes(resultCode(vanThuis), zonderWidget.deps);
    expect(eerste.rows[0].outcome).toBe('onbekend');
    const opgeslagen = zonderWidget.savedSubs[0];
    expect(opgeslagen.widgetId).toBe('id-van-thuis');

    // Daarna staat de widget er (via de code gevonden, met een ander id).
    const metWidget = makeDeps({ submissions: [opgeslagen] });
    const tweede = processCodes(resultCode(vanThuis), metWidget.deps);
    expect(tweede.rows[0].outcome).toBe('dubbel');
    expect(tweede.rows[0].message).toMatch(/gekoppeld aan deze widget/);
    expect(metWidget.savedSubs).toHaveLength(1);
    expect(metWidget.savedSubs[0].id).toBe(opgeslagen.id);
    expect(metWidget.savedSubs[0].widgetId).toBe('w1');
  });

  it('herkent ook de omgekeerde volgorde binnen één beurt', () => {
    const { deps, savedSubs } = makeDeps();
    const code = resultCode(submission({ widgetId: 'id-van-thuis', widgetCode: 'WQUIZ1' }));
    const report = processCodes(`${code}\n${code}`, deps);
    expect(report.rows.map((r) => r.outcome)).toEqual(['nieuw', 'dubbel']);
    expect(savedSubs).toHaveLength(1);
  });
});
