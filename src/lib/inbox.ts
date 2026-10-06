// ── Inleverpunt: resultaat- en voortgangscodes verwerken ────────────────────
//
// Leerlingen die op hun eigen toestel werkten, dragen hun werk terug met een
// code: WF1.… voor een inzending, WFC1.… voor leesvoortgang. De leerkracht
// plakt er tientallen tegelijk (of scant ze met de camera, zie
// components/QrScanner). Deze module is de pure logica daarachter: splitsen,
// decoderen, ontdubbelen, koppelen aan een klaslijst en per code eerlijk
// rapporteren wat ermee gebeurde.
//
// Alles loopt via een `InboxDeps`-object, zodat de verwerking testbaar is
// zonder browseropslag. `defaultInboxDeps()` hangt het aan de echte opslag.

import LZString from 'lz-string';
import type { ClassGroup } from './classTypes';
import type { Course, CourseProgress } from './courseTypes';
import type { Submission, Widget } from './types';
import { decodeSubmission } from './share';
import {
  decodeCourseProgress, getCourse, getCourseByCode, getStudentProgress, importProgressCode, mergeProgressRecords,
} from './courses';
import { getSubmissions, getWidget, getWidgetByCode, saveSubmission } from './storage';
import { getClasses, normalizeName } from './classes';
import { sanitizeSubmission, submissionDupKey } from './progressTransfer';
import { uid } from './utils';

export type InboxOutcome = 'nieuw' | 'dubbel' | 'onbekend' | 'ongeldig';

export interface InboxRow {
  /** Volgnummer binnen deze plak-/scanbeurt (1-based). */
  index: number;
  outcome: InboxOutcome;
  kind: 'widget' | 'course' | null;
  /** Is het werk bewaard? (ook bij een onbekende widget bewaren we het) */
  saved: boolean;
  studentName: string;
  /** Klas waarin deze leerling herkend werd, of null. */
  className: string | null;
  /** Titel van de widget/cursus, of null als die niet op dit toestel staat. */
  title: string | null;
  /** "14/20 · 70%" of "60% gelezen". */
  detail: string;
  /** Uitleg bij dubbel/onbekend/ongeldig. */
  message: string;
  /** Begin van de code, om een regel te herkennen. */
  code: string;
  at: number | null;
}

export interface InboxReport {
  rows: InboxRow[];
  nieuw: number;
  dubbel: number;
  onbekend: number;
  ongeldig: number;
}

export interface InboxDeps {
  /** Alle klassen, om studentId/classId aan een naam te koppelen. */
  classes: ClassGroup[];
  /** Bestaande inzendingen (voor ontdubbeling). */
  submissions: Submission[];
  findWidget(sub: Submission): Widget | undefined;
  findCourse(p: CourseProgress): Course | undefined;
  /** Bestaande leesvoortgang van deze leerling voor deze cursus. */
  findProgress(courseId: string, studentName: string): CourseProgress | undefined;
  /** Bewaren; `false` betekent: niet bewaard (bv. volle opslag). */
  saveSubmission(sub: Submission): boolean | void;
  /** Voortgang samenvoegen met wat er staat en bewaren; `false` = niet bewaard. */
  saveProgress(p: CourseProgress): boolean | void;
  /** Nieuw id voor een inzending waarvan het id hier al bestaat. */
  newId(): string;
}

/** Deps die op de echte opslag van dit toestel werken. */
export function defaultInboxDeps(): InboxDeps {
  return {
    classes: getClasses(),
    submissions: getSubmissions(),
    findWidget: (sub) => getWidget(sub.widgetId) ?? (sub.widgetCode ? getWidgetByCode(sub.widgetCode) : undefined),
    findCourse: (p) => getCourse(p.courseId) ?? (p.courseCode ? getCourseByCode(p.courseCode) : undefined),
    findProgress: (courseId, studentName) => getStudentProgress(courseId, studentName),
    saveSubmission,
    saveProgress: importProgressCode,
    newId: uid,
  };
}

/**
 * Voortgangscode lezen én de klas-/leerlingidentiteit terughalen.
 * `decodeCourseProgress` (lib/courses.ts) saneert de voortgang streng en laat
 * daarbij classId/studentId vallen; net die twee maken het verschil tussen
 * "een zekere Emma" en "Emma uit 1A". We lezen ze daarom apart terug uit
 * dezelfde code — defensief, want een geknutselde code mag niets breken.
 */
export function decodeProgressCode(code: string): CourseProgress | null {
  const p = decodeCourseProgress(code);
  if (!p) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(code.trim().slice(5));
    const raw: unknown = json ? JSON.parse(json) : null;
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (typeof r.classId === 'string' && r.classId) p.classId = r.classId;
      if (typeof r.studentId === 'string' && r.studentId) p.studentId = r.studentId;
    }
  } catch {
    // genegeerd: de gesaneerde voortgang zelf is al bruikbaar
  }
  return p;
}

/**
 * Codes uit een geplakte tekst halen. Alles wat op witruimte gescheiden staat
 * telt mee; omringende leestekens en aanhalingstekens (uit een chatbericht of
 * mail) gaan eraf. Alleen echte codes blijven over — begeleidende tekst
 * ("Hier is mijn code:") verdwijnt dus niet stilletjes als "ongeldig".
 */
export function splitCodes(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^["'“”„«»(<[{]+/, '').replace(/["'“”„«»)>\]}.,;:]+$/, '').trim();
    if (!token) continue;
    const at = token.search(/WFC?1\./);
    if (at < 0) continue;
    out.push(token.slice(at));
  }
  return out;
}

/** Aantal afgewerkte secties in een voortgangsrecord. */
function completedSections(p: CourseProgress): number {
  return Object.values(p.sections).filter((s) => s.completedAt).length;
}

function progressDetail(p: CourseProgress, course: Course | undefined): string {
  const done = completedSections(p);
  const total = course
    ? course.chapters.reduce((a, ch) => a + ch.sections.filter((s) => !s.optional).length, 0)
    : 0;
  if (total > 0) return `${Math.round((done / total) * 100)}% gelezen (${done}/${total} secties)`;
  return `${done} ${done === 1 ? 'sectie' : 'secties'} gelezen`;
}

/** Leerling en klas opzoeken op id (of op naam) voor een nette regel. */
function describeStudent(
  entry: { classId?: string; studentId?: string; studentName: string },
  classes: ClassGroup[]
): { studentName: string; className: string | null } {
  const cls =
    (entry.classId ? classes.find((c) => c.id === entry.classId) : undefined) ??
    (entry.studentId ? classes.find((c) => c.students.some((s) => s.id === entry.studentId)) : undefined);
  if (!cls) return { studentName: entry.studentName.trim() || 'Anoniem', className: null };
  const student =
    (entry.studentId ? cls.students.find((s) => s.id === entry.studentId) : undefined) ??
    cls.students.find((s) => normalizeName(s.name) === normalizeName(entry.studentName));
  return {
    studentName: student?.name ?? entry.studentName.trim() ?? 'Anoniem',
    className: cls.name,
  };
}

/** Eigen sleutel (geen erfenis uit Object.prototype bij een id als "constructor"). */
function eigen<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/**
 * Voegt deze voortgangscode iets toe aan wat er al staat? Een nieuwe geopende
 * of afgewerkte sectie, een nieuw vinkje, meer leestijd, een later "laatst
 * gezien" of de klas/leerling die nog ontbrak. Zo niet, dan is ze "dubbel".
 */
function progressAdds(existing: CourseProgress, incoming: CourseProgress): boolean {
  if (incoming.lastSeenAt > existing.lastSeenAt) return true;
  if ((incoming.classId && !existing.classId) || (incoming.studentId && !existing.studentId)) return true;
  for (const [sid, sp] of Object.entries(incoming.sections)) {
    const cur = eigen(existing.sections, sid);
    if (!cur) return true;
    if (sp.completedAt && !cur.completedAt) return true;
    if (sp.secondsSpent > cur.secondsSpent) return true;
    for (const [bid, items] of Object.entries(sp.checks ?? {})) {
      const have = new Set(eigen(cur.checks, bid) ?? []);
      if (items.some((item) => !have.has(item))) return true;
    }
  }
  return false;
}

/** Wat een leerling na het indienen nog toevoegt aan zijn inzending (zie PlayerFeedback). */
const REFLECTIE_SLEUTELS = ['_foutenanalyse', '_doelreflectie'] as const;

function leeg(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** Gelijke JSON, ongeacht de volgorde van de sleutels. */
function zelfdeJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => [k, norm(o[k])]);
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

const NIET_BEWAARD =
  'Niet bewaard: de opslag van dit toestel is vol of geblokkeerd. Maak ruimte en verwerk deze code opnieuw.';

interface Beurt {
  deps: InboxDeps;
  /** Ontdubbelsleutel → de bewaarde inzending (al aanwezig of uit deze beurt). */
  seenSubs: Map<string, Submission>;
  existingIds: Set<string>;
  /** Samengevoegde voortgang per cursus + naam, binnen deze beurt. */
  batchProgress: Map<string, CourseProgress>;
}

/**
 * Een code die al binnen is, kan toch nog iets bijbrengen:
 *  - de reflectie of foutenanalyse die de leerling pas na de eerste code
 *    invulde (LL13). Alleen wat ontbreekt, wordt aangevuld; scores en
 *    feedback van de leerkracht blijven altijd staan;
 *  - de koppeling aan de widget: eerst ingelezen toen de widget hier nog niet
 *    stond (bewaard onder het id van de bron), nu wel (nieuw 1).
 */
function aanvullingBijDubbel(
  earlier: Submission,
  sub: Submission,
  widget: Widget | undefined,
  deps: InboxDeps
): { sub: Submission; message: string } | null {
  let next: Submission | null = null;
  const wat: string[] = [];
  if (
    widget &&
    earlier.widgetId !== widget.id &&
    earlier.widgetId === sub.widgetId &&
    deps.findWidget(earlier)?.id === widget.id
  ) {
    next = { ...earlier, widgetId: widget.id };
    wat.push('nu gekoppeld aan deze widget');
  }
  const extra: Record<string, unknown> = {};
  for (const k of REFLECTIE_SLEUTELS) {
    const nieuw = eigen(sub.answers, k);
    if (!leeg(nieuw) && leeg(eigen(earlier.answers, k))) extra[k] = nieuw;
  }
  if (Object.keys(extra).length) {
    const basis = next ?? earlier;
    next = { ...basis, answers: { ...basis.answers, ...extra } };
    wat.push('de reflectie van de leerling is toegevoegd');
  }
  return next ? { sub: next, message: `Stond hier al — ${wat.join(' en ')}.` } : null;
}

function verwerkResultaat(sub: Submission, row: InboxRow, beurt: Beurt) {
  const { deps, seenSubs, existingIds } = beurt;
  row.kind = 'widget';
  const widget = deps.findWidget(sub);
  const who = describeStudent(sub, deps.classes);
  row.studentName = who.studentName;
  row.className = who.className;
  row.title = widget?.title ?? null;
  row.at = sub.submittedAt;
  row.detail =
    sub.totalMax > 0
      ? `${sub.totalEarned}/${sub.totalMax} · ${Math.round((sub.totalEarned / sub.totalMax) * 100)}%`
      : 'geen score bij deze opdracht';

  // Het id van de widget op dít toestel wint (de leerling kan de widget via
  // een draagbare link met een ander id gekregen hebben). Ontdubbelen op
  // beide id's: dezelfde code kan eerst binnengekomen zijn toen de widget hier
  // nog niet stond (bewaard onder het id van de bron), en nu opnieuw.
  const localId = widget?.id ?? sub.widgetId;
  const keys = [...new Set([
    submissionDupKey(localId, sub.studentName, sub.submittedAt),
    submissionDupKey(sub.widgetId, sub.studentName, sub.submittedAt),
  ])];
  const earlier = keys.map((k) => seenSubs.get(k)).find((x): x is Submission => Boolean(x));
  if (earlier) {
    row.outcome = 'dubbel';
    row.message = 'Stond hier al — niets toegevoegd.';
    const aanvulling = aanvullingBijDubbel(earlier, sub, widget, deps);
    if (aanvulling) {
      if (deps.saveSubmission(aanvulling.sub) === false) {
        row.message = 'Stond hier al. De aanvulling kon niet bewaard worden: de opslag van dit toestel is vol.';
      } else {
        for (const k of keys) seenSubs.set(k, aanvulling.sub);
        seenSubs.set(submissionDupKey(aanvulling.sub.widgetId, aanvulling.sub.studentName, aanvulling.sub.submittedAt), aanvulling.sub);
        row.saved = true;
        row.message = aanvulling.message;
      }
    }
    return;
  }

  const stored: Submission = {
    ...sub,
    id: existingIds.has(sub.id) ? deps.newId() : sub.id,
    widgetId: localId,
  };
  if (deps.saveSubmission(stored) === false) {
    row.outcome = 'ongeldig';
    row.message = NIET_BEWAARD;
    return;
  }
  existingIds.add(stored.id);
  for (const k of keys) seenSubs.set(k, stored);
  row.saved = true;
  if (!widget) {
    row.outcome = 'onbekend';
    row.message = 'Bewaard, maar deze widget staat niet op dit toestel — importeer ze om het resultaat te zien.';
  } else {
    row.outcome = 'nieuw';
  }
}

function verwerkVoortgang(prog: CourseProgress, row: InboxRow, beurt: Beurt) {
  const { deps, batchProgress } = beurt;
  row.kind = 'course';
  const course = deps.findCourse(prog);
  const who = describeStudent(prog, deps.classes);
  row.studentName = who.studentName;
  row.className = who.className;
  row.title = course?.title ?? null;
  row.at = prog.lastSeenAt;

  // Zelfde sleutel als de opslag (getStudentProgress): cursus + naam zonder
  // hoofdletters. Binnen de beurt telt de al samengevoegde versie, zodat de
  // volgorde van de codes (school, thuis) niets uitmaakt (KL1).
  const key = `${prog.courseId}::${prog.studentName.trim().toLowerCase()}`;
  const existing = batchProgress.get(key) ?? deps.findProgress(prog.courseId, prog.studentName);
  const merged = existing ? mergeProgressRecords(existing, prog) : prog;
  const adds = !existing || progressAdds(existing, prog);
  row.detail = progressDetail(merged, course);

  // Bewaren zodra er iets verandert (ook een kleinigheid als een vroegere
  // starttijd): samenvoegen verliest niets, wegschrijven gebeurt in de opslag.
  if (!existing || !zelfdeJson(merged, existing)) {
    if (deps.saveProgress(prog) === false) {
      if (adds) {
        row.outcome = 'ongeldig';
        row.message = NIET_BEWAARD;
        return;
      }
    } else {
      batchProgress.set(key, merged);
      if (adds) row.saved = true;
    }
  }
  if (!adds) {
    row.outcome = 'dubbel';
    row.message = 'Deze voortgang stond hier al — niets bijgewerkt.';
    return;
  }
  if (!course) {
    row.outcome = 'onbekend';
    row.message = 'Bewaard, maar deze cursus staat niet op dit toestel — neem ze over om de voortgang te zien.';
  } else {
    row.outcome = 'nieuw';
  }
}

/**
 * Verwerkt alle codes uit een geplakte tekst. Elke code levert één regel op;
 * dubbels worden herkend tegenover de bestaande opslag én binnen dezelfde
 * beurt (zelfde widget, naam en indienmoment — zie lib/progressTransfer).
 * Werk voor een widget of cursus die hier niet staat, wordt wél bewaard: het
 * is werk van een leerling, dat gooien we nooit weg. Voortgangscodes van
 * dezelfde leerling worden samengevoegd, in welke volgorde ze ook komen.
 * Eén kapotte code houdt de rest nooit tegen: ze wordt "ongeldig".
 */
export function processCodes(text: string, deps: InboxDeps = defaultInboxDeps()): InboxReport {
  const report: InboxReport = { rows: [], nieuw: 0, dubbel: 0, onbekend: 0, ongeldig: 0 };
  const beurt: Beurt = {
    deps,
    seenSubs: new Map(),
    existingIds: new Set(deps.submissions.map((s) => s.id)),
    batchProgress: new Map(),
  };
  for (const s of deps.submissions) {
    const key = submissionDupKey(s.widgetId, s.studentName, s.submittedAt);
    if (!beurt.seenSubs.has(key)) beurt.seenSubs.set(key, s);
  }

  let index = 0;
  for (const code of splitCodes(text)) {
    index++;
    const short = code.length > 26 ? code.slice(0, 26) + '…' : code;
    const row: InboxRow = {
      index,
      outcome: 'ongeldig',
      kind: null,
      saved: false,
      studentName: '',
      className: null,
      title: null,
      detail: '',
      message: '',
      code: short,
      at: null,
    };

    try {
      // Compacte bewaking bij het decoderen, daarna de volledige sanering (KL2).
      const sub = code.startsWith('WF1.') ? sanitizeSubmission(decodeSubmission(code)) : null;
      const prog = !sub && code.startsWith('WFC1.') ? decodeProgressCode(code) : null;
      if (sub) verwerkResultaat(sub, row, beurt);
      else if (prog) verwerkVoortgang(prog, row, beurt);
      else {
        row.outcome = 'ongeldig';
        row.message = code.startsWith('WF1.') || code.startsWith('WFC1.')
          ? 'Deze code is onvolledig of beschadigd (afgebroken bij het kopiëren?).'
          : 'Dit lijkt geen resultaat- of voortgangscode.';
      }
    } catch {
      // Een geknutselde of onverwachte code mag de rest van de beurt nooit
      // tegenhouden (KL2). Was ze al bewaard, dan blijft de uitkomst staan.
      if (!row.saved) {
        row.outcome = 'ongeldig';
        row.message = 'Deze code kon niet verwerkt worden — ze is beschadigd of ongeldig.';
      }
    }
    report[row.outcome]++;
    report.rows.push(row);
  }

  return report;
}

/** Korte samenvatting voor een toast of aria-live-melding. */
export function summarizeReport(report: InboxReport): string {
  if (report.rows.length === 0) return 'Geen codes gevonden.';
  const parts = [`${report.nieuw} nieuw`];
  if (report.dubbel) parts.push(`${report.dubbel} al aanwezig`);
  if (report.onbekend) parts.push(`${report.onbekend} zonder widget of cursus hier`);
  if (report.ongeldig) parts.push(`${report.ongeldig} ongeldig`);
  return parts.join(', ');
}

/** Alleen voor de scanner: hoort deze tekst er überhaupt uit te zien als code? */
export function looksLikeCode(text: string): boolean {
  return /WFC?1\./.test(text);
}
