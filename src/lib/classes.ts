// ── Klassen, opdrachten en leerlingidentiteit ───────────────────────────────
//
// Het klassysteem is de lijm tussen leerkracht en leerling zónder server:
//  • een klas is een lijst leerlingen met een korte klascode;
//  • opdrachten koppelen een cursus of widget aan die klas;
//  • de leerling kiest zijn naam één keer uit de klaslijst en krijgt daarmee
//    een vaste identiteit (studentId) die op élke inzending en voortgang
//    meegaat — geen los ingetikte namen meer;
//  • statusberekening (niet gestart / bezig / ingediend) gebeurt hier, zodat
//    het klasoverzicht, de leerlinghub en de tests dezelfde cijfers tonen.
//
// Opslag is gewone JSON (geen media in klassen of opdrachten), met dezelfde
// meldweg bij mislukt schrijven als de rest van de app (reportWriteFailure).

import type { Assignment, ClassGroup, ClassStudent } from './classTypes';
import type { Submission, Widget } from './types';
import type { Course, CourseProgress } from './courseTypes';
import { progressPercent, referencedWidgetIds } from './courseTypes';
import {
  getLiveEntries, getSubmissions, getWidget, getWidgetByCode, getWidgets, notifyChange, reportWriteFailure,
  type LiveEntry,
} from './storage';
import { getCourse, getCourseByCode, getCourseProgressAll, getCourses } from './courses';
import { aggregateGoalScores, awaitsGrading, scoresPerGoal, type GoalScore } from './goals';
import { makeCode, uid } from './utils';

const CLASSES_KEY = 'wf.classes.v1';
const ASSIGNMENTS_KEY = 'wf.assignments.v1';
/** Eén keer een voorbeeldklas plaatsen; verwijderen blijft dan ook verwijderd. */
const SEEDED_KEY = 'wf.classes.seeded.v1';

// ── Opslaglaag ──────────────────────────────────────────────────────────────

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  let ok = true;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    ok = false;
    reportWriteFailure(key, e);
  }
  notifyChange();
  return ok;
}

// ── Sanering ────────────────────────────────────────────────────────────────

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function sanitizeStudent(raw: unknown): ClassStudent | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const name = str(s.name).trim();
  if (!name) return null;
  const number = typeof s.number === 'number' && Number.isFinite(s.number) ? Math.round(s.number) : undefined;
  return { id: str(s.id) || uid(), name: name.slice(0, 80), ...(number !== undefined ? { number } : {}) };
}

export function sanitizeClass(raw: unknown): ClassGroup | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const name = str(c.name).trim();
  if (!name) return null;
  const students = Array.isArray(c.students)
    ? c.students.map(sanitizeStudent).filter((x): x is ClassStudent => x !== null)
    : [];
  return {
    id: str(c.id) || uid(),
    name: name.slice(0, 80),
    code: (str(c.code) || makeCode()).toUpperCase(),
    schoolYear: str(c.schoolYear).trim() || undefined,
    students,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
  };
}

export function sanitizeAssignment(raw: unknown): Assignment | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const classId = str(a.classId);
  const targetId = str(a.targetId);
  const kind = a.kind === 'course' ? 'course' : a.kind === 'widget' ? 'widget' : null;
  if (!classId || !targetId || !kind) return null;
  return {
    id: str(a.id) || uid(),
    classId,
    kind,
    targetId,
    dueAt: typeof a.dueAt === 'number' ? a.dueAt : null,
    note: str(a.note).trim() ? str(a.note).trim().slice(0, 400) : undefined,
    createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
  };
}

// ── Klassen ─────────────────────────────────────────────────────────────────

export function getClasses(): ClassGroup[] {
  const raw = readJson<unknown[]>(CLASSES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeClass).filter((c): c is ClassGroup => c !== null);
}

export function getClass(id: string): ClassGroup | undefined {
  return getClasses().find((c) => c.id === id);
}

export function getClassByCode(code: string): ClassGroup | undefined {
  const c = code.trim().toUpperCase();
  return getClasses().find((k) => k.code.toUpperCase() === c);
}

export function saveClass(cls: ClassGroup): boolean {
  const all = getClasses();
  const i = all.findIndex((c) => c.id === cls.id);
  const updated: ClassGroup = { ...cls, updatedAt: Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  return writeJson(CLASSES_KEY, all);
}

/** Verwijdert de klas én haar opdrachten (inzendingen blijven staan). */
export function deleteClass(id: string) {
  writeJson(CLASSES_KEY, getClasses().filter((c) => c.id !== id));
  writeJson(ASSIGNMENTS_KEY, getAssignments().filter((a) => a.classId !== id));
}

/**
 * Klascode die niet botst met een bestaande widget-, cursus- of klascode:
 * de leerling typt alle drie in hetzelfde veld (zie JoinPage).
 */
export function makeClassCode(): string {
  for (let i = 0; i < 50; i++) {
    const code = makeCode();
    if (getWidgetByCode(code)) continue;
    if (getCourseByCode(code)) continue;
    if (getClassByCode(code)) continue;
    return code;
  }
  return makeCode();
}

export function createClass(init: { name: string; schoolYear?: string; students?: ClassStudent[] }): ClassGroup {
  return {
    id: uid(),
    name: init.name.trim() || 'Nieuwe klas',
    code: makeClassCode(),
    schoolYear: init.schoolYear?.trim() || undefined,
    students: init.students ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Klaslijst uit geplakte tekst ────────────────────────────────────────────

/** Naam normaliseren voor vergelijking (hoofdletterongevoelig, spaties samen). */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl');
}

function toNumber(part: string): number | null {
  const t = part.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Leest een geplakte klaslijst tolerant in. Eén leerling per regel, in de
 * vormen die leerkrachten echt plakken:
 *   "Emma Peeters" · "12 Emma Peeters" · "12. Emma" · "Emma;12" · "12;Emma"
 *   "- Emma" · "Emma Peeters, 12" · tabs uit Excel · lege regels ertussen.
 * Een regel zonder herkenbaar nummer wordt gewoon volledig de naam (zo blijft
 * "Peeters, Emma" één naam). Dubbele namen worden overgeslagen; welke dat
 * waren, vertelt `duplicateNames`.
 */
export function parseStudentList(text: string): ClassStudent[] {
  const out: ClassStudent[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseStudentLine(rawLine);
    if (!parsed) continue;
    const { name, number } = parsed;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: uid(), name: name.slice(0, 80), ...(number !== null ? { number } : {}) });
  }
  return out;
}

/**
 * Welke namen laat `parseStudentList` als dubbel vallen? Elke naam één keer,
 * zoals hij op de eerste overgeslagen regel staat, in de volgorde van de
 * lijst. Leeg als er geen dubbels zijn. Zo kan het scherm zeggen dat "Lucas
 * Janssens" twee keer in de geplakte lijst staat in plaats van hem stil weg
 * te laten.
 */
export function duplicateNames(text: string): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseStudentLine(rawLine);
    if (!parsed) continue;
    const key = normalizeName(parsed.name);
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    if (reported.has(key)) continue;
    reported.add(key);
    out.push(parsed.name.slice(0, 80));
  }
  return out;
}

/** Eén regel van een geplakte klaslijst: naam en (optioneel) klasnummer. */
function parseStudentLine(rawLine: string): { name: string; number: number | null } | null {
  // opsommingstekens en omringende leestekens weg
  const line = rawLine.replace(/^\s*[-–—•*]\s*/, '').trim();
  if (!line) return null;
  let name = '';
  let number: number | null = null;

  const parts = line.split(/[;\t]|,(?=\s*\d{1,3}\s*$)|(?<=^\s*\d{1,3}\s*),/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const first = toNumber(parts[0]);
    const last = toNumber(parts[parts.length - 1]);
    if (first !== null) {
      number = first;
      name = parts.slice(1).join(' ');
    } else if (last !== null) {
      number = last;
      name = parts.slice(0, -1).join(' ');
    } else {
      name = parts.join(' ');
    }
  } else {
    // één stuk: "12 Emma", "12. Emma", "Emma 12" of gewoon "Emma"
    const leading = /^(\d{1,3})\s*[.)\-:]?\s+(.+)$/.exec(line);
    const trailing = /^(.+?)\s+(\d{1,3})$/.exec(line);
    if (leading) {
      number = toNumber(leading[1]);
      name = leading[2];
    } else if (trailing) {
      number = toNumber(trailing[2]);
      name = trailing[1];
    } else {
      name = line;
    }
  }

  name = name.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return { name, number };
}

/**
 * Geplakte lijst toepassen op een bestaande klas: leerlingen die er al staan
 * houden hun id (en dus hun inzendingen), nieuwe komen erbij, weggelaten
 * namen verdwijnen. Zo kan een leerkracht de lijst gerust opnieuw plakken.
 */
export function applyStudentList(existing: ClassStudent[], text: string): ClassStudent[] {
  const byName = new Map(existing.map((s) => [normalizeName(s.name), s]));
  return parseStudentList(text).map((fresh) => {
    const old = byName.get(normalizeName(fresh.name));
    return old ? { ...old, name: fresh.name, ...(fresh.number !== undefined ? { number: fresh.number } : {}) } : fresh;
  });
}

/** Klaslijst als plakbare tekst (voor het bewerkveld). */
export function studentsToText(students: ClassStudent[]): string {
  return students.map((s) => (s.number !== undefined ? `${s.number} ${s.name}` : s.name)).join('\n');
}

/** Op klasnummer, dan alfabetisch — leerlingen zonder nummer achteraan. */
export function sortedStudents(students: ClassStudent[]): ClassStudent[] {
  return students.slice().sort((a, b) => {
    if (a.number !== undefined && b.number !== undefined && a.number !== b.number) return a.number - b.number;
    if (a.number !== undefined && b.number === undefined) return -1;
    if (a.number === undefined && b.number !== undefined) return 1;
    return a.name.localeCompare(b.name, 'nl');
  });
}

export function addStudent(classId: string, name: string, number?: number): boolean {
  const cls = getClass(classId);
  if (!cls || !name.trim()) return false;
  const student: ClassStudent = {
    id: uid(),
    name: name.trim().slice(0, 80),
    ...(number !== undefined && Number.isFinite(number) ? { number } : {}),
  };
  return saveClass({ ...cls, students: [...cls.students, student] });
}

export function renameStudent(classId: string, studentId: string, name: string, number?: number | null): boolean {
  const cls = getClass(classId);
  if (!cls || !name.trim()) return false;
  const students = cls.students.map((s) =>
    s.id === studentId
      ? {
          ...s,
          name: name.trim().slice(0, 80),
          ...(number === null ? { number: undefined } : number !== undefined ? { number } : {}),
        }
      : s
  );
  return saveClass({ ...cls, students });
}

export function removeStudent(classId: string, studentId: string): boolean {
  const cls = getClass(classId);
  if (!cls) return false;
  return saveClass({ ...cls, students: cls.students.filter((s) => s.id !== studentId) });
}

// ── Opdrachten ──────────────────────────────────────────────────────────────

export function getAssignments(): Assignment[] {
  const raw = readJson<unknown[]>(ASSIGNMENTS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeAssignment).filter((a): a is Assignment => a !== null);
}

/** Opdrachten van één klas, nieuwste eerst. */
export function assignmentsForClass(classId: string): Assignment[] {
  return getAssignments()
    .filter((a) => a.classId === classId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function saveAssignment(a: Assignment): boolean {
  const all = getAssignments();
  const i = all.findIndex((x) => x.id === a.id);
  if (i >= 0) all[i] = a;
  else all.unshift(a);
  return writeJson(ASSIGNMENTS_KEY, all);
}

export function createAssignment(init: {
  classId: string;
  kind: Assignment['kind'];
  targetId: string;
  dueAt?: number | null;
  note?: string;
}): Assignment {
  return {
    id: uid(),
    classId: init.classId,
    kind: init.kind,
    targetId: init.targetId,
    dueAt: init.dueAt ?? null,
    note: init.note?.trim() || undefined,
    createdAt: Date.now(),
  };
}

/**
 * Toewijzen zonder dubbels: bestaat er in deze klas al een opdracht met
 * dezelfde soort en hetzelfde doel (cursus/widget), dan wordt die bijgewerkt
 * (deadline, instructie) in plaats van dat er een tweede bijkomt. `dueAt: null`
 * wist de deadline expliciet. Gebruikt door ShareModal en ClassDashboardPage.
 */
export function upsertAssignment(init: {
  classId: string;
  kind: Assignment['kind'];
  targetId: string;
  dueAt?: number | null;
  note?: string;
}): { assignment: Assignment; created: boolean } {
  const bestaande = assignmentsForClass(init.classId).find(
    (a) => a.kind === init.kind && a.targetId === init.targetId
  );
  if (!bestaande) {
    const assignment = createAssignment(init);
    saveAssignment(assignment);
    return { assignment, created: true };
  }
  const assignment: Assignment = {
    ...bestaande,
    dueAt: init.dueAt ?? null,
    note: init.note?.trim() || undefined,
  };
  saveAssignment(assignment);
  return { assignment, created: false };
}

export function deleteAssignment(id: string): boolean {
  return writeJson(ASSIGNMENTS_KEY, getAssignments().filter((a) => a.id !== id));
}

// ── Wie ben ik? / doorgegeven codes ────────────────────────────────────────
// Verhuisd naar lib/studentContext.ts (piepklein, zonder afhankelijkheden,
// zodat de speler in de hoofdbundel niet deze hele module meetrekt).
// Hier her-geëxporteerd voor bestaande aanroepers.
export {
  clearStudentContext, getStudentContext, handedOverKeys, isHandedOver, markHandedOver,
  setStudentContext, unmarkHandedOver,
} from './studentContext';

// ── Status van een opdracht per leerling ────────────────────────────────────

export type AssignmentState = 'niet gestart' | 'bezig' | 'ingediend';

export interface AssignmentStatus {
  state: AssignmentState;
  /** Aantal inzendingen van deze leerling (cursusopdracht: altijd 0). */
  attempts: number;
  /** Beste score in procent, of null zonder meetbare punten. */
  scorePct: number | null;
  earned: number | null;
  max: number | null;
  /** Leesvoortgang in procent bij een cursusopdracht, anders null. */
  progressPct: number | null;
  /** Laatste activiteit (indienen of lezen). */
  lastAt: number | null;
  /** Er wacht nog iets op verbetering door de leerkracht (in eender welke poging). */
  needsGrading: boolean;
  /**
   * De getoonde score (de beste poging) wacht zelf nog op nakijken: toon ze als
   * voorlopig. Alleen gezet bij een widgetopdracht met een score.
   */
  provisional?: boolean;
  /** Titel van de widget/cursus, of null als die niet op dit toestel staat. */
  title: string | null;
}

export interface ClassDataContext {
  submissions: Submission[];
  progress: CourseProgress[];
  widgets: Map<string, Widget>;
  courses: Map<string, Course>;
  live: LiveEntry[];
}

/** Lege context (voor tests en foutpaden). */
export function emptyClassContext(): ClassDataContext {
  return { submissions: [], progress: [], widgets: new Map(), courses: new Map(), live: [] };
}

/**
 * Alles wat het klasoverzicht nodig heeft, in één keer uit de opslag gelezen:
 * anders leest een matrix van 25 leerlingen × 8 opdrachten 200 keer dezelfde
 * lijst. Geef de opdrachten mee waarvoor je status wil berekenen.
 */
export function loadClassContext(assignments: Assignment[]): ClassDataContext {
  const ctx = emptyClassContext();
  ctx.submissions = getSubmissions();
  for (const a of assignments) {
    if (a.kind === 'widget') {
      if (!ctx.widgets.has(a.targetId)) {
        const w = getWidget(a.targetId);
        if (w) ctx.widgets.set(a.targetId, w);
        ctx.live.push(...getLiveEntries(a.targetId));
      }
      continue;
    }
    if (ctx.courses.has(a.targetId)) continue;
    const course = getCourse(a.targetId);
    if (course) {
      ctx.courses.set(a.targetId, course);
      // Oefeningen ín de cursus horen bij de doelenscore van de leerling.
      for (const wid of referencedWidgetIds(course)) {
        if (ctx.widgets.has(wid)) continue;
        const w = getWidget(wid);
        if (w) ctx.widgets.set(wid, w);
      }
    }
    ctx.progress.push(...getCourseProgressAll(a.targetId));
  }
  return ctx;
}

/**
 * Hoort deze inzending/voortgang bij deze leerling? Op id wanneer die er is
 * (de betrouwbare weg), anders op naam — hoofdletter- en spatieongevoelig,
 * zodat werk van vóór de klaslijst niet verloren gaat.
 */
export function matchesStudent(
  entry: { studentId?: string; studentName: string },
  student: ClassStudent
): boolean {
  if (entry.studentId) return entry.studentId === student.id;
  return normalizeName(entry.studentName) === normalizeName(student.name);
}

/** Inzendingen van één leerling voor één widget (nieuwste eerst). */
export function submissionsFor(
  widgetId: string,
  student: ClassStudent,
  ctx: ClassDataContext
): Submission[] {
  const widget = ctx.widgets.get(widgetId);
  return ctx.submissions
    .filter((s) => (s.widgetId === widgetId || (!!widget && !!s.widgetCode && s.widgetCode === widget.code)) && matchesStudent(s, student))
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

export function statusForAssignment(
  assignment: Assignment,
  student: ClassStudent,
  ctx: ClassDataContext = emptyClassContext()
): AssignmentStatus {
  const base: AssignmentStatus = {
    state: 'niet gestart',
    attempts: 0,
    scorePct: null,
    earned: null,
    max: null,
    progressPct: null,
    lastAt: null,
    needsGrading: false,
    title: null,
  };

  if (assignment.kind === 'course') {
    const course = ctx.courses.get(assignment.targetId);
    base.title = course?.title ?? null;
    const p = ctx.progress.find(
      (x) => x.courseId === assignment.targetId && matchesStudent(x, student)
    );
    if (!p) return base;
    base.lastAt = p.lastSeenAt;
    const done = Object.values(p.sections).filter((s) => s.completedAt).length;
    base.progressPct = course ? progressPercent(course, p) : null;
    const complete = base.progressPct !== null ? base.progressPct >= 100 : false;
    base.state = complete ? 'ingediend' : done > 0 || Object.keys(p.sections).length > 0 ? 'bezig' : 'niet gestart';
    return base;
  }

  const widget = ctx.widgets.get(assignment.targetId);
  base.title = widget?.title ?? null;
  const subs = submissionsFor(assignment.targetId, student, ctx);
  if (subs.length === 0) {
    // Nog niets ingediend, maar wel bezig op dit toestel? (live-registratie)
    const busy = ctx.live.some(
      (e) => e.widgetId === assignment.targetId && normalizeName(e.studentName) === normalizeName(student.name)
    );
    if (busy) {
      base.state = 'bezig';
      base.lastAt = Math.max(
        ...ctx.live
          .filter((e) => e.widgetId === assignment.targetId && normalizeName(e.studentName) === normalizeName(student.name))
          .map((e) => e.startedAt)
      );
    }
    return base;
  }

  base.state = 'ingediend';
  base.attempts = subs.length;
  base.lastAt = subs[0].submittedAt;
  base.needsGrading = subs.some((s) => s.totalMax > 0 && awaitsGrading(s));
  const best = bestAttempt(subs);
  if (best) {
    base.earned = best.totalEarned;
    base.max = best.totalMax;
    base.scorePct = Math.round((best.totalEarned / best.totalMax) * 100);
    base.provisional = awaitsGrading(best);
  }
  return base;
}

/**
 * De poging die telt: het hoogste totaalpercentage, bij gelijkstand de
 * nieuwste. `subs` moet nieuwste eerst staan (zoals `submissionsFor` levert).
 * Pogingen zonder meetbare punten (totalMax 0) tellen niet; zijn er alleen
 * zulke, dan is er geen beste poging. De matrix (`statusForAssignment`) en de
 * doelscores (`goalScoresForStudent`) gebruiken allebei deze keuze.
 */
export function bestAttempt(subs: Submission[]): Submission | undefined {
  const scored = subs.filter((s) => s.totalMax > 0);
  if (scored.length === 0) return undefined;
  return scored.reduce((a, b) =>
    b.totalEarned / b.totalMax > a.totalEarned / a.totalMax ? b : a
  );
}

/** Korte samenvatting voor een cel in de matrix ("78% · 2 pogingen"). */
export function statusSummary(status: AssignmentStatus): string {
  if (status.state === 'niet gestart') return 'niet gestart';
  if (status.progressPct !== null) return `${status.progressPct}% gelezen`;
  const parts: string[] = [];
  if (status.scorePct !== null) parts.push(`${status.scorePct}%`);
  if (status.attempts > 1) parts.push(`${status.attempts} pogingen`);
  if (parts.length === 0) parts.push(status.state);
  return parts.join(' · ');
}

// ── Score per leerplandoel, per leerling ────────────────────────────────────

/**
 * Score per leerplandoel voor deze leerling, over de opgedragen widgets én de
 * oefeningen die in een opgedragen cursus zitten. Per widget telt één poging:
 * de beste (`bestAttempt`: hoogste totaalpercentage, bij gelijkstand de
 * nieuwste), dezelfde die de matrix toont. Heeft geen enkele poging meetbare
 * punten, dan telt de nieuwste. Een herkansing trekt de doelscore dus niet
 * meer omlaag.
 *
 * Sleutel van de Map: `goalScoreKey` (leerplan + code). Vragen die nog op
 * nakijken wachten, staan in `GoalScore.pending` en tellen (nog) niet mee.
 */
export function goalScoresForStudent(
  assignments: Assignment[],
  student: ClassStudent,
  ctx: ClassDataContext
): Map<string, GoalScore> {
  const widgetIds = new Set<string>();
  for (const a of assignments) {
    if (a.kind === 'widget') {
      widgetIds.add(a.targetId);
      continue;
    }
    const course = ctx.courses.get(a.targetId);
    if (course) for (const wid of referencedWidgetIds(course)) widgetIds.add(wid);
  }
  const lists: GoalScore[][] = [];
  for (const wid of widgetIds) {
    const widget = ctx.widgets.get(wid);
    if (!widget) continue;
    const subs = submissionsFor(wid, student, ctx);
    const pick = bestAttempt(subs) ?? subs[0];
    if (pick) lists.push(scoresPerGoal(pick, widget));
  }
  return aggregateGoalScores(lists);
}

// ── Deadlines ───────────────────────────────────────────────────────────────

export interface DueBadge {
  label: string;
  /** Voor de badge-klasse: neutraal, dringend of te laat. */
  tone: 'brand' | 'warn' | 'err';
  overdue: boolean;
}

/** Deadline in mensentaal: "vandaag", "over 2 dagen", "te laat". */
export function dueBadge(dueAt: number | null | undefined, now = Date.now()): DueBadge | null {
  if (!dueAt) return null;
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(dueAt) - startOf(now)) / 86400000);
  if (dueAt < now) return { label: 'te laat', tone: 'err', overdue: true };
  if (days <= 0) return { label: 'vandaag', tone: 'warn', overdue: false };
  if (days === 1) return { label: 'morgen', tone: 'warn', overdue: false };
  if (days <= 7) return { label: `over ${days} dagen`, tone: 'brand', overdue: false };
  return {
    label: new Date(dueAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }),
    tone: 'brand',
    overdue: false,
  };
}

// ── Voorbeeldklas ───────────────────────────────────────────────────────────

const EXAMPLE_NAMES = ['Emma Peeters', 'Noah Claes', 'Olivia Maes', 'Lucas Janssens', 'Mila De Smet', 'Arthur Willems'];

/**
 * Plaatst één keer een voorbeeldklas met opdrachten voor de democursus en een
 * voorbeeldwidget, zodat het klasoverzicht meteen iets toont. Idempotent: de
 * vlag blijft staan, dus een verwijderde voorbeeldklas komt niet terug.
 * Wordt aangeroepen vanuit lib/seed.ts.
 */
export function seedExampleClass() {
  let seeded = false;
  try {
    seeded = localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    return; // zonder opslag heeft zaaien geen zin
  }
  if (seeded) return;
  if (getClasses().some((c) => c.name === 'Voorbeeldklas 1A')) return;

  const cls = createClass({
    name: 'Voorbeeldklas 1A',
    schoolYear: schoolYearLabel(),
    students: EXAMPLE_NAMES.map((name, i) => ({ id: uid(), name, number: i + 1 })),
  });
  if (!saveClass(cls)) return;

  // Democursus en een voorbeeldwidget koppelen — allebei optioneel: wie ze
  // verwijderde, krijgt gewoon een klas zonder die opdracht.
  const demo = getCourses().find((c) => c.title.startsWith('Voorbeeldcursus')) ?? getCourses()[0];
  if (demo) {
    saveAssignment(
      createAssignment({
        classId: cls.id,
        kind: 'course',
        targetId: demo.id,
        dueAt: Date.now() + 7 * 86400000,
        note: 'Lees de cursus en vink elke sectie af als je ze gelezen hebt.',
      })
    );
  }
  const quiz = getSeedWidget();
  if (quiz) {
    saveAssignment(
      createAssignment({
        classId: cls.id,
        kind: 'widget',
        targetId: quiz.id,
        dueAt: Date.now() + 3 * 86400000,
        note: 'Maak de quiz. Je mag ze een tweede keer proberen.',
      })
    );
  }
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // genegeerd: hoogstens wordt de voorbeeldklas later nog eens aangeboden
  }
}

function schoolYearLabel(now = new Date()): string {
  // Een Vlaams schooljaar loopt van september tot juni.
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

function getSeedWidget(): Widget | undefined {
  const widgets = getWidgets();
  return (
    widgets.find((w) => w.type === 'quiz' && w.title.startsWith('Voorbeeld')) ??
    widgets.find((w) => w.type === 'quiz')
  );
}
