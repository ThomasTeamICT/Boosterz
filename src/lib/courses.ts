// ── Opslag, voortgang en delen van cursussen ────────────────────────────────

import LZString from 'lz-string';
import type { Widget, WidgetSettings } from './types';
import type {
  Course, CourseBlock, CourseBlockType, CourseChapter, CourseProgress,
  CourseSection, SectionProgress,
} from './courseTypes';
import { allSections, referencedPdfIds, referencedWidgetIds } from './courseTypes';
import { deletePdf, getPdf, importPdfFromDataUrl, pdfToDataUrl } from './pdfStore';
import { makeCode, uid } from './utils';
import { EXAMPLE_CURRICULUM_ID, getCurriculum, normalizeGoalCodes } from './curriculum';
import { cleanupOrphanMedia, getWidget, getWidgets, notifyChange, reportWriteFailure, saveWidget } from './storage';
import { collectMediaRefs, countUnresolvedMedia, inlineMedia, isMediaRef, parseWithMedia, stringifyWithMedia } from './mediaStore';
import { sharedVersion } from './share';
import { isBestandUrl, webUrl } from './veiligeUrl';
import { defaultSettings, getTypeDef, WIDGET_TYPES } from '../widgets/registry';

const COURSES_KEY = 'wf.courses.v1';
const PROGRESS_KEY = 'wf.courseprogress.v1';

// Zelfde medialaag als lib/storage.ts: verwijzingen in de opslag, blob:-URL's
// in het geheugen (zie lib/mediaStore.ts).
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseWithMedia<T>(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): boolean {
  let ok = true;
  try {
    localStorage.setItem(key, stringifyWithMedia(value));
  } catch (e) {
    ok = false;
    // Zelfde meldweg als de widgetopslag: een nette balk in de app in plaats
    // van een blokkerende alert, en hoogstens één melding per 8 seconden.
    reportWriteFailure(key, e);
  }
  notifyChange();
  return ok;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export function getCourses(): Course[] {
  return read<Course[]>(COURSES_KEY, []);
}
export function getCourse(id: string): Course | undefined {
  return getCourses().find((c) => c.id === id);
}
export function getCourseByCode(code: string): Course | undefined {
  const c = code.trim().toUpperCase();
  return getCourses().find((k) => k.code.toUpperCase() === c);
}
/**
 * Bewaart een cursus. Geeft false terug als er niets bewaard is (volle of
 * geblokkeerde opslag), zodat een editor geen "Bewaard" toont terwijl het
 * mislukte (CU7). `keepUpdatedAt`: de versie van de bron behouden — alleen
 * voor overgenomen gedeelde inhoud (zie adoptSharedContent).
 */
export function saveCourse(course: Course, opts: { keepUpdatedAt?: boolean } = {}): boolean {
  const all = getCourses();
  const i = all.findIndex((c) => c.id === course.id);
  const keep = opts.keepUpdatedAt && typeof course.updatedAt === 'number' && Number.isFinite(course.updatedAt);
  const updated = { ...course, updatedAt: keep ? course.updatedAt : Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  return write(COURSES_KEY, all);
}
export function deleteCourse(id: string) {
  const course = getCourse(id);
  write(COURSES_KEY, getCourses().filter((c) => c.id !== id));
  write(PROGRESS_KEY, readAllProgress().filter((p) => p.courseId !== id));
  // Privé leerlingnotities bij deze cursus mee opruimen (zie CourseViewerPage).
  try {
    localStorage.removeItem('wf.coursenotes.' + id);
  } catch {
    // genegeerd: notities opruimen mag verwijderen nooit blokkeren
  }
  if (course) {
    cleanupCoursePdfs(course);
    cleanupOrphanMedia(collectMediaRefs(stringifyWithMedia(course)));
  }
}

/**
 * Geüploade pdf's van een verwijderde cursus uit IndexedDB opruimen — maar
 * alléén als geen enkele andere cursus of widget hetzelfde pdfId gebruikt
 * (dupliceren kopieert de verwijzing, dus een id kan gedeeld zijn).
 */
function cleanupCoursePdfs(course: Course) {
  const candidates = referencedPdfIds(course);
  if (!candidates.length) return;
  const inUse = new Set<string>();
  // De verwijderde cursus is al weggeschreven, dus dit zijn de overblijvers.
  for (const c of getCourses()) {
    for (const pid of referencedPdfIds(c)) inUse.add(pid);
  }
  // Widgets kunnen ook een pdf als bron hebben (bv. splitwidgets: source.pdfId).
  for (const w of getWidgets()) {
    const src = (w.config as unknown as { source?: unknown }).source;
    if (src && typeof src === 'object') {
      const pid = (src as Record<string, unknown>).pdfId;
      if (typeof pid === 'string' && pid) inUse.add(pid);
    }
  }
  for (const pid of candidates) {
    // fire-and-forget: opruimen mag het verwijderen nooit blokkeren
    if (!inUse.has(pid)) void deletePdf(pid);
  }
}

/**
 * Aantal verwijzingen naar dit pdfId over álle cursussen én álle widgets met
 * een pdf-bron (config.source.pdfId). Elk blok telt apart mee: dupliceren
 * (van een blok, cursus of widget) kopieert bewust dezelfde verwijzing, dus
 * hetzelfde id kan op meerdere plaatsen voorkomen. Editors gebruiken dit bij
 * "Vervangen"/"Verwijderen": de blob mag pas uit IndexedDB weg als de eigen
 * verwijzing de laatste is (teller ≤ 1).
 */
export function pdfReferenceCount(pdfId: string): number {
  if (!pdfId) return 0;
  let count = 0;
  for (const course of getCourses()) {
    for (const { section } of allSections(course)) {
      for (const b of section.blocks) {
        if (b.type === 'pdf' && b.pdfId === pdfId) count++;
      }
    }
  }
  // Widgets kunnen ook een pdf als bron hebben (bv. splitwidgets: source.pdfId).
  for (const w of getWidgets()) {
    const src = (w.config as unknown as { source?: unknown }).source;
    if (src && typeof src === 'object' && (src as Record<string, unknown>).pdfId === pdfId) count++;
  }
  return count;
}

export function createCourse(title: string, author = ''): Course {
  const section: CourseSection = { id: uid(), title: 'Inleiding', blocks: [] };
  const chapter: CourseChapter = { id: uid(), title: 'Hoofdstuk 1', emoji: '📖', sections: [section] };
  return {
    id: uid(),
    title: title.trim() || 'Nieuwe cursus',
    author,
    coverEmoji: '📘',
    code: makeCode(),
    chapters: [chapter],
    settings: { accentColor: '#4f46e5', requireName: true, showProgressToStudent: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Standaardinhoud voor een nieuw blok van het gegeven type. */
export function makeBlock(type: CourseBlockType): CourseBlock {
  const id = uid();
  switch (type) {
    case 'heading': return { id, type, text: 'Nieuwe kop', level: 2 };
    case 'text': return { id, type, markdown: '' };
    case 'image': return { id, type, url: '', size: 'normal' };
    case 'video': return { id, type, url: '' };
    case 'audio': return { id, type, url: '' };
    case 'pdf': return { id, type, height: 560 };
    case 'embed': return { id, type, url: '', height: 420 };
    case 'callout': return { id, type, kind: 'info', text: '' };
    case 'quote': return { id, type, text: '' };
    case 'divider': return { id, type };
    case 'attachment': return { id, type, name: '', dataUrl: '' };
    case 'accordion': return { id, type, items: [{ id: uid(), title: 'Onderdeel', text: '' }] };
    case 'columns': return { id, type, left: '', right: '' };
    case 'table': return { id, type, header: true, rows: [['', ''], ['', '']] };
    case 'terms': return { id, type, items: [{ id: uid(), term: '', uitleg: '' }] };
    case 'checklist': return { id, type, items: [{ id: uid(), text: '' }] };
    case 'widget': return { id, type, widgetId: '' };
  }
}

// ── Voortgang ───────────────────────────────────────────────────────────────

function readAllProgress(): CourseProgress[] {
  return read<CourseProgress[]>(PROGRESS_KEY, []);
}

export function getCourseProgressAll(courseId: string): CourseProgress[] {
  return readAllProgress().filter((p) => p.courseId === courseId);
}

export function getStudentProgress(courseId: string, studentName: string): CourseProgress | undefined {
  const name = studentName.trim().toLowerCase();
  return readAllProgress().find(
    (p) => p.courseId === courseId && p.studentName.trim().toLowerCase() === name
  );
}

/**
 * Bewaart de voortgang van één leerling (vervangt de vorige record op cursus +
 * naam). Standaard wordt "laatst gezien" op nu gezet: dat is de lezer die
 * bewaart. Bij het inlezen van een voortgangscode (importProgressCode) blijft
 * de tijd uit de code staan (`keepLastSeenAt`), anders wordt "laatst gezien"
 * het moment van inlezen en lijkt elke latere code van een ander toestel ouder.
 * Geeft false terug als er niets bewaard is.
 */
export function saveStudentProgress(progress: CourseProgress, opts: { keepLastSeenAt?: boolean } = {}): boolean {
  const all = readAllProgress();
  const name = progress.studentName.trim().toLowerCase();
  const i = all.findIndex(
    (p) => p.courseId === progress.courseId && p.studentName.trim().toLowerCase() === name
  );
  // lastSeenAt óók op het doorgegeven object bijwerken: de viewer serialiseert
  // ditzelfde object naar de voortgangscode.
  if (!opts.keepLastSeenAt || !Number.isFinite(progress.lastSeenAt)) progress.lastSeenAt = Date.now();
  const updated = { ...progress };
  if (i >= 0) all[i] = updated;
  else all.push(updated);
  return write(PROGRESS_KEY, all);
}

/**
 * Eigen sleutel lezen uit een object dat op id geïndexeerd is (secties,
 * vinkjes). Zonder deze controle geeft een id als "constructor" of "toString"
 * een functie uit Object.prototype terug in plaats van "niets".
 */
function eigen<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/** Toewijzen op een id; "__proto__" zou anders het prototype vervangen. */
function zetEigen<T>(obj: Record<string, T>, key: string, value: T): void {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    obj[key] = value;
  }
}

/**
 * Voegt twee voortgangsrecords van dezelfde leerling samen zonder verlies:
 * unie van checks, vroegste openedAt, hoogste secondsSpent, completedAt blijft
 * staan zodra één van beide hem heeft. Gebruikt door de viewer (tegen verlies
 * bij twee tabbladen) en door de voortgangscode-import.
 */
export function mergeProgressRecords(a: CourseProgress, b: CourseProgress): CourseProgress {
  const newer = b.lastSeenAt >= a.lastSeenAt ? b : a;
  const merged: CourseProgress = {
    ...a,
    classId: newer.classId ?? a.classId ?? b.classId,
    studentId: newer.studentId ?? a.studentId ?? b.studentId,
    startedAt: Math.min(a.startedAt || Date.now(), b.startedAt || Date.now()),
    lastSeenAt: Math.max(a.lastSeenAt, b.lastSeenAt),
    lastSectionId: newer.lastSectionId ?? a.lastSectionId ?? b.lastSectionId,
    sections: {},
  };
  for (const [sid, sp] of Object.entries(a.sections)) zetEigen(merged.sections, sid, sp);
  for (const [sid, sp] of Object.entries(b.sections)) {
    const cur = eigen(merged.sections, sid);
    if (!cur) {
      zetEigen(merged.sections, sid, sp);
      continue;
    }
    const checks: Record<string, string[]> = {};
    for (const [blockId, items] of Object.entries(cur.checks ?? {})) zetEigen(checks, blockId, items);
    for (const [blockId, items] of Object.entries(sp.checks ?? {})) {
      zetEigen(checks, blockId, [...new Set([...(eigen(checks, blockId) ?? []), ...items])]);
    }
    zetEigen(merged.sections, sid, {
      openedAt: Math.min(cur.openedAt, sp.openedAt),
      completedAt: cur.completedAt ?? sp.completedAt,
      secondsSpent: Math.max(cur.secondsSpent, sp.secondsSpent),
      checks: Object.keys(checks).length ? checks : undefined,
    });
  }
  return merged;
}

export function deleteStudentProgress(courseId: string, studentName: string) {
  const name = studentName.trim().toLowerCase();
  write(
    PROGRESS_KEY,
    readAllProgress().filter(
      (p) => !(p.courseId === courseId && p.studentName.trim().toLowerCase() === name)
    )
  );
}

/** Bestaande voortgang ophalen of een nieuwe starten (nog niet bewaard). */
export function startProgress(course: Course, studentName: string): CourseProgress {
  return (
    getStudentProgress(course.id, studentName) ?? {
      courseId: course.id,
      courseCode: course.code,
      studentName: studentName.trim() || 'Anoniem',
      sections: {},
      lastSeenAt: Date.now(),
      startedAt: Date.now(),
    }
  );
}

export function touchSection(progress: CourseProgress, sectionId: string): SectionProgress {
  const existing = eigen(progress.sections, sectionId);
  if (existing) return existing;
  const fresh: SectionProgress = { openedAt: Date.now(), secondsSpent: 0 };
  zetEigen(progress.sections, sectionId, fresh);
  return fresh;
}

// ── Delen: draagbare link met meereizende widgets ───────────────────────────

interface CoursePayload {
  v: 1;
  kind: 'cursus';
  c: Course;
  /** Widgets waar de cursus naar verwijst, zodat de link zelfstandig werkt. */
  w: Widget[];
  /** true = de link bevat maar een deel van de hoofdstukken. */
  partial?: boolean;
}

/**
 * Maakt een draagbare cursuslink. Optioneel enkel bepaalde hoofdstukken
 * (deel van de cursus delen). Ingebedde widgets reizen mee in de link.
 */
/**
 * Draagbare cursuslink. Async: afbeeldingen, audio en bijlagen staan op dit
 * toestel in IndexedDB en moeten als data-URL in de link (zie lib/mediaStore).
 * `unresolved` telt media die niet mee konden (blob niet op dit toestel).
 */
export async function encodeCourseToUrl(course: Course, chapterIds?: string[]): Promise<{ url: string; unresolved: number }> {
  const partial = Boolean(chapterIds && chapterIds.length && chapterIds.length < course.chapters.length);
  const c: Course = {
    ...course,
    chapters: chapterIds && chapterIds.length
      ? course.chapters.filter((ch) => chapterIds.includes(ch.id))
      : course.chapters,
  };
  const w = referencedWidgetIds(c)
    .map((id) => getWidget(id))
    .filter((x): x is Widget => Boolean(x));
  const payload: CoursePayload = await inlineMedia({ v: 1, kind: 'cursus', c, w, ...(partial ? { partial: true } : {}) });
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const base = location.origin + location.pathname;
  return { url: `${base}#/cursus/open?d=${compressed}`, unresolved: countUnresolvedMedia(payload) };
}

const KNOWN_TYPES = new Set(WIDGET_TYPES.map((t) => t.id));

/** Meegereisde widget defensief saneren: onbekend type weigeren, ontbrekende velden aanvullen. */
function sanitizeSharedWidget(raw: unknown): Widget | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.type !== 'string' || !KNOWN_TYPES.has(w.type as Widget['type'])) return null;
  if (!w.config || typeof w.config !== 'object') return null;
  const type = w.type as Widget['type'];
  const base = getTypeDef(type).defaultConfig() as Record<string, unknown>;
  return {
    id: typeof w.id === 'string' && w.id ? w.id : uid(),
    type,
    title: typeof w.title === 'string' && w.title.trim() ? w.title : 'Oefening',
    folderId: typeof w.folderId === 'string' ? (w.folderId as string) : null,
    config: { ...base, ...(w.config as Record<string, unknown>) },
    settings: { ...defaultSettings(), ...(typeof w.settings === 'object' && w.settings ? (w.settings as Partial<WidgetSettings>) : {}) },
    code: typeof w.code === 'string' && w.code ? (w.code as string) : makeCode(),
    // Leerplan van de widget bewaren: zonder dit veld vallen de goalCodes van
    // de vragen terug op "onbekend leerplan" bij de dekking en het klasoverzicht.
    curriculumId: typeof w.curriculumId === 'string' && w.curriculumId ? (w.curriculumId as string) : undefined,
    createdAt: typeof w.createdAt === 'number' ? (w.createdAt as number) : Date.now(),
    // Versie van de bron (nooit in de toekomst), zie sharedVersion in lib/share.ts.
    updatedAt: sharedVersion(w.updatedAt),
  };
}

export interface DecodedCourse {
  course: Course;
  widgets: Widget[];
  partial: boolean;
}

export function decodeCourseFromParam(d: string): DecodedCourse | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(d);
    if (!json) return null;
    const payload = JSON.parse(json) as CoursePayload;
    if (!payload || payload.v !== 1 || payload.kind !== 'cursus') return null;
    const course = sanitizeCourse(payload.c);
    if (!course) return null;
    const widgets = Array.isArray(payload.w)
      ? payload.w.map(sanitizeSharedWidget).filter((x): x is Widget => x !== null)
      : [];
    return { course, widgets, partial: payload.partial === true };
  } catch {
    return null;
  }
}

// ── Gedeelde inhoud overnemen: versies, eigen werk en kopieën ───────────────
//
// Cursussen en widgets komen binnen via een deellink, een klaspakket of een
// bestand. Drie regels (debugronde oktober 2026, LL3/CU5 en V3):
//
//  1. Een nieuwere versie van iets dat hier ongewijzigd uit een eerdere link
//     of een eerder pakket staat ("zuivere kopie"), wordt stil bijgewerkt.
//     Zo krijgt een leerling de verbeterde oefening.
//  2. Een oudere of even oude versie overschrijft nooit wat hier staat: een
//     oude link die later nog eens geopend wordt, zet niets terug.
//  3. Eigen werk (zelf gemaakt, of na het overnemen nog aangepast) wordt nooit
//     stil overschreven. Is de binnenkomende versie nieuwer én anders, dan
//     beslist de gebruiker: bijwerken, eigen versie houden of als kopie
//     bewaren (findSharedConflicts + AdoptOptions.conflicts).
//
// "Versie" is updatedAt: de bron geeft die mee (begrensd op nu, zie
// sharedVersion) en bij het overnemen bewaren we ze ongewijzigd. Wat we zo
// overnamen, staat in een klein register (id → versie). Een lokale bewerking
// stempelt updatedAt opnieuw; komt de versie niet meer overeen met het
// register, dan is het eigen werk geworden. Oude data zonder register telt
// daardoor als eigen werk: bij twijfel vragen, nooit stil overschrijven.

const SHARED_KEY = 'wf.gedeeld.v1';

type SharedKind = 'course' | 'widget';

interface SharedRegistry {
  course: Map<string, number>;
  widget: Map<string, number>;
}

function readRegistry(): SharedRegistry {
  const reg: SharedRegistry = { course: new Map(), widget: new Map() };
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    if (!raw) return reg;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return reg;
    const d = data as Record<string, unknown>;
    const lees = (list: unknown, into: Map<string, number>) => {
      if (!Array.isArray(list)) return;
      for (const e of list) {
        if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number' && Number.isFinite(e[1])) {
          into.set(e[0], e[1]);
        }
      }
    };
    lees(d.c, reg.course);
    lees(d.w, reg.widget);
  } catch {
    // genegeerd: zonder register telt alles als eigen werk (er wordt dan gevraagd)
  }
  return reg;
}

function writeRegistry(reg: SharedRegistry) {
  // Alleen id's die nog bestaan: zo groeit het register niet eindeloos aan.
  const courseIds = new Set(getCourses().map((c) => c.id));
  const widgetIds = new Set(getWidgets().map((w) => w.id));
  const payload = {
    v: 1,
    c: [...reg.course].filter(([id]) => courseIds.has(id)),
    w: [...reg.widget].filter(([id]) => widgetIds.has(id)),
  };
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(payload));
  } catch {
    // genegeerd: zonder register wordt er later gevraagd in plaats van stil bijgewerkt
  }
}

/** Staat dit hier ongewijzigd zoals het uit een link of pakket overgenomen werd? */
function isPureCopy(reg: SharedRegistry, kind: SharedKind, local: { id: string; updatedAt: number }): boolean {
  return reg[kind].get(local.id) === local.updatedAt;
}

/**
 * Deterministische JSON (sleutels gesorteerd, undefined weg): twee versies met
 * dezelfde inhoud maar een andere sleutelvolgorde zijn gelijk (CU15a).
 */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort()
      .filter((k) => o[k] !== undefined && typeof o[k] !== 'function')
      .map((k) => JSON.stringify(k) + ':' + stableJson(o[k]))
      .join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

/** Vergelijkbare vorm: door dezelfde sanering, zonder tijdstempels en map. */
function comparable(kind: SharedKind, x: unknown): string {
  if (kind === 'course') {
    const c = sanitizeCourse(x);
    return c ? stableJson({ ...c, createdAt: 0, updatedAt: 0 }) : '';
  }
  const w = sanitizeSharedWidget(x);
  return w ? stableJson({ ...w, createdAt: 0, updatedAt: 0, folderId: null }) : '';
}

/**
 * Zelfde inhoud? Async: lokaal staan media als verwijzing of blob:-URL, in
 * gedeelde inhoud als data-URL; vergelijken kan pas als beide inline staan.
 * Bij een fout: "anders" (dan wordt er gevraagd, er gaat niets verloren).
 */
async function sameContent(kind: SharedKind, incoming: unknown, local: unknown): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([inlineMedia(incoming), inlineMedia(local)]);
    const ca = comparable(kind, a);
    return ca !== '' && ca === comparable(kind, b);
  } catch {
    return false;
  }
}

export type SharedChoice = 'bijwerken' | 'houden' | 'kopie';

/** Iets wat binnenkomt en hier al in een andere versie staat als eigen werk. */
export interface SharedConflict {
  kind: SharedKind;
  id: string;
  /** Titel van de binnenkomende versie. */
  title: string;
  /** Titel van de versie op dit toestel. */
  localTitle: string;
  /** true = de binnenkomende versie is ouder dan die op dit toestel. */
  older: boolean;
}

export function conflictKey(c: { kind: SharedKind; id: string }): string {
  return `${c.kind}:${c.id}`;
}

export interface AdoptOptions {
  /**
   * Uitdrukkelijk "bijwerken" (de gebruiker koos het al): de cursus wordt
   * altijd vervangen, widgets alleen door een nieuwere versie.
   */
  force?: boolean;
  /** De keuze van de gebruiker voor de conflicten uit findSharedConflicts. */
  conflicts?: { choice: SharedChoice; keys: string[] };
}

export interface AdoptResult {
  /** false = minstens één onderdeel kon niet bewaard worden (opslag vol). */
  ok: boolean;
  /** Id van de bron → id op dit toestel (anders bij "als kopie bewaren"). */
  courseIds: Map<string, string>;
  widgetIds: Map<string, string>;
  /** Tellingen over cursussen en widgets samen. */
  added: number;
  updated: number;
  kept: number;
  copied: number;
}

type AdoptAction = 'nieuw' | SharedChoice;

function decideAction(
  kind: SharedKind,
  incoming: { id: string; updatedAt: number },
  local: { id: string; updatedAt: number } | undefined,
  reg: SharedRegistry,
  opts: AdoptOptions
): AdoptAction {
  if (!local) return 'nieuw';
  if (opts.conflicts && opts.conflicts.keys.includes(conflictKey({ kind, id: incoming.id }))) {
    return opts.conflicts.choice;
  }
  const newer = incoming.updatedAt > local.updatedAt;
  if (newer && isPureCopy(reg, kind, local)) return 'bijwerken';
  if (opts.force && (kind === 'course' || newer)) return 'bijwerken';
  return 'houden';
}

/** Per id de nieuwste versie (dezelfde widget kan in meerdere cursussen zitten). */
function newestById<T extends { id: string; updatedAt: number }>(items: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const it of items) {
    const cur = out.get(it.id);
    if (!cur || it.updatedAt > cur.updatedAt) out.set(it.id, it);
  }
  return out;
}

/** Widgetblokken laten wijzen naar de id's op dit toestel (na een kopie). */
function remapWidgetBlocks(course: Course, widgetIds: Map<string, string>): Course {
  const needs = referencedWidgetIds(course).some((id) => (widgetIds.get(id) ?? id) !== id);
  if (!needs) return course;
  return {
    ...course,
    chapters: course.chapters.map((ch) => ({
      ...ch,
      sections: ch.sections.map((se) => ({
        ...se,
        blocks: se.blocks.map((b) =>
          b.type === 'widget' && widgetIds.has(b.widgetId) ? { ...b, widgetId: widgetIds.get(b.widgetId) as string } : b
        ),
      })),
    })),
  };
}

function kopieTitel(title: string): string {
  return `${title} (kopie)`;
}

/**
 * Neemt gedeelde cursussen en widgets over volgens de drie regels hierboven.
 * Gebruikt door het klaspakket (alle cursussen en widgets in één keer, zodat
 * kopieën overal juist verwijzen) en door adoptSharedCourse.
 */
export function adoptSharedContent(courses: Course[], widgets: Widget[], opts: AdoptOptions = {}): AdoptResult {
  const reg = readRegistry();
  const res: AdoptResult = {
    ok: true, courseIds: new Map(), widgetIds: new Map(), added: 0, updated: 0, kept: 0, copied: 0,
  };
  const localWidgets = new Map(getWidgets().map((w) => [w.id, w] as const));
  const localCourses = new Map(getCourses().map((c) => [c.id, c] as const));

  // 1. Beslissen (widgets eerst: een cursus die naar een gekopieerde widget
  //    wijst, moet dat weten).
  const incomingWidgets = newestById(widgets.map((w) => ({ ...w, updatedAt: sharedVersion(w.updatedAt) })));
  const widgetAction = new Map<string, AdoptAction>();
  for (const w of incomingWidgets.values()) {
    const action = decideAction('widget', w, localWidgets.get(w.id), reg, opts);
    widgetAction.set(w.id, action);
    res.widgetIds.set(w.id, action === 'kopie' ? uid() : w.id);
  }
  const incomingCourses = newestById(courses.map((c) => ({ ...c, updatedAt: sharedVersion(c.updatedAt) })));
  const courseAction = new Map<string, AdoptAction>();
  for (const c of incomingCourses.values()) {
    let action = decideAction('course', c, localCourses.get(c.id), reg, opts);
    // Kopie van een widget gekozen, maar de cursus zelf blijft staan? Dan zou
    // de lokale cursus naar de kopie moeten wijzen (eigen werk wijzigen) of
    // de kopie wees blijven. Daarom gaat de cursus van de bron mee als kopie.
    if (action === 'houden' && referencedWidgetIds(c).some((id) => widgetAction.get(id) === 'kopie')) {
      action = 'kopie';
    }
    courseAction.set(c.id, action);
    res.courseIds.set(c.id, action === 'kopie' ? uid() : c.id);
  }

  // 2. Widgets bewaren.
  for (const w of incomingWidgets.values()) {
    const action = widgetAction.get(w.id) as AdoptAction;
    const local = localWidgets.get(w.id);
    if (action === 'houden') {
      res.kept++;
      continue;
    }
    if (action === 'kopie') {
      const copy: Widget = {
        ...w,
        id: res.widgetIds.get(w.id) as string,
        code: makeCode(),
        title: kopieTitel(w.title),
        folderId: local?.folderId ?? w.folderId,
      };
      if (saveWidget(copy)) res.copied++;
      else res.ok = false;
      continue;
    }
    // nieuw of bijwerken: versie van de bron behouden, map van dit toestel.
    const toSave: Widget = local ? { ...w, folderId: local.folderId } : w;
    if (saveWidget(toSave, { keepUpdatedAt: true })) {
      reg.widget.set(w.id, w.updatedAt);
      if (action === 'nieuw') res.added++;
      else res.updated++;
    } else {
      res.ok = false;
    }
  }

  // 3. Cursussen bewaren.
  for (const c of incomingCourses.values()) {
    const action = courseAction.get(c.id) as AdoptAction;
    if (action === 'houden') {
      res.kept++;
      continue;
    }
    const remapped = remapWidgetBlocks(c, res.widgetIds);
    if (action === 'kopie') {
      const copy: Course = {
        ...remapped,
        id: res.courseIds.get(c.id) as string,
        code: makeCode(),
        title: kopieTitel(c.title),
      };
      if (saveCourse(copy)) res.copied++;
      else res.ok = false;
      continue;
    }
    if (saveCourse(remapped, { keepUpdatedAt: true })) {
      reg.course.set(c.id, c.updatedAt);
      if (action === 'nieuw') res.added++;
      else res.updated++;
    } else {
      res.ok = false;
    }
  }

  writeRegistry(reg);
  return res;
}

/**
 * Slaat een gedeelde cursus + meegereisde widgets lokaal op (link, bestand,
 * voorbeeldcursus). De regels staan bij adoptSharedContent. Een
 * gedeeltelijke link (enkele hoofdstukken) wordt per hoofdstuk samengevoegd
 * met de lokale versie, zodat eerder gedeelde hoofdstukken blijven bestaan;
 * zonder `force` alleen bij een zuivere kopie (eigen werk: eerst vragen).
 */
export function adoptSharedCourse(
  course: Course,
  widgets: Widget[],
  opts: AdoptOptions & { partial?: boolean } = {}
): AdoptResult {
  const existing = getCourse(course.id);
  if (!opts.partial || !existing) return adoptSharedContent([course], widgets, opts);

  const res = adoptSharedContent([], widgets, opts);
  const reg = readRegistry();
  const incomingCourse = remapWidgetBlocks({ ...course, updatedAt: sharedVersion(course.updatedAt) }, res.widgetIds);
  const pure = isPureCopy(reg, 'course', existing);
  const newer = incomingCourse.updatedAt > existing.updatedAt;
  const replace = Boolean(opts.force) || (pure && newer);
  const append = Boolean(opts.force) || pure;
  // Hoofdstukken uit de link vervangen hun lokale naamgenoot (op id) of
  // komen er achteraan bij; niet-gedeelde hoofdstukken blijven staan.
  const incoming = new Map(incomingCourse.chapters.map((ch) => [ch.id, ch] as const));
  let changed = false;
  const merged: CourseChapter[] = existing.chapters.map((ch) => {
    const inc = incoming.get(ch.id);
    if (inc && replace) {
      changed = true;
      return inc;
    }
    return ch;
  });
  if (append) {
    const have = new Set(existing.chapters.map((ch) => ch.id));
    for (const ch of incomingCourse.chapters) {
      if (!have.has(ch.id)) {
        merged.push(ch);
        changed = true;
      }
    }
  }
  res.courseIds.set(course.id, course.id);
  if (!changed) {
    res.kept++;
    return res;
  }
  const base = replace ? incomingCourse : existing;
  let ok: boolean;
  if (opts.force) {
    // Na een uitdrukkelijke keuze is het een mengvorm: eigen werk vanaf nu.
    ok = saveCourse({ ...base, chapters: merged });
    reg.course.delete(course.id);
  } else {
    const version = Math.max(existing.updatedAt, incomingCourse.updatedAt);
    ok = saveCourse({ ...base, chapters: merged, updatedAt: version }, { keepUpdatedAt: true });
    if (ok) reg.course.set(course.id, version);
  }
  if (ok) res.updated++;
  else res.ok = false;
  writeRegistry(reg);
  return res;
}

/** Zou het overnemen zonder vraag hier een andere, nieuwere versie laten liggen? */
async function isConflict(
  kind: SharedKind,
  incoming: { id: string; updatedAt: number },
  local: { id: string; updatedAt: number },
  reg: SharedRegistry,
  includeOlder: boolean
): Promise<boolean> {
  const newer = sharedVersion(incoming.updatedAt) > local.updatedAt;
  if (newer && isPureCopy(reg, kind, local)) return false; // wordt stil bijgewerkt
  if (!newer && !includeOlder) return false; // oudere versie: wat hier staat, blijft
  return !(await sameContent(kind, incoming, local));
}

/**
 * Wat zou de gebruiker moeten beslissen vóór het overnemen? Eigen werk (of
 * een aangepaste kopie) dat in een andere, nieuwere versie binnenkomt.
 * `includeOlder`: ook oudere versies voorleggen (een bestand terugzetten,
 * zoals een back-up, is een bewuste keuze van de leerkracht).
 */
export async function findSharedConflicts(
  courses: Course[],
  widgets: Widget[],
  opts: { includeOlder?: boolean } = {}
): Promise<SharedConflict[]> {
  const reg = readRegistry();
  const out: SharedConflict[] = [];
  const localCourses = new Map(getCourses().map((c) => [c.id, c] as const));
  for (const c of newestById(courses).values()) {
    const local = localCourses.get(c.id);
    if (local && (await isConflict('course', c, local, reg, Boolean(opts.includeOlder)))) {
      out.push({ kind: 'course', id: c.id, title: c.title, localTitle: local.title, older: sharedVersion(c.updatedAt) < local.updatedAt });
    }
  }
  const localWidgets = new Map(getWidgets().map((w) => [w.id, w] as const));
  for (const w of newestById(widgets).values()) {
    const local = localWidgets.get(w.id);
    if (local && (await isConflict('widget', w, local, reg, Boolean(opts.includeOlder)))) {
      out.push({ kind: 'widget', id: w.id, title: w.title, localTitle: local.title, older: sharedVersion(w.updatedAt) < local.updatedAt });
    }
  }
  return out;
}

/**
 * Moet er gevraagd worden vóór deze link overgenomen wordt? (De naam is
 * historisch; de vraag is: zou overnemen zonder `force` hier eigen werk laten
 * liggen dat in een andere, nieuwere versie binnenkomt?)
 *
 *  - Een zuivere kopie wordt stil bijgewerkt: geen vraag.
 *  - Een oudere link zet niets terug: geen vraag, de lokale versie blijft.
 *  - Eigen werk in een nieuwere, andere versie: wel een vraag.
 *
 * Vergelijken gebeurt na dezelfde sanering en met gesorteerde sleutels, zodat
 * een ongewijzigd eigen bestand niet als "anders" telt (CU15a). Met
 * `chapterIds` (gedeeltelijke link) tellen alleen die hoofdstukken; een
 * hoofdstuk dat lokaal ontbreekt, telt bij eigen werk als verschil.
 * `widgets`: ook de meereizende widgets nagaan.
 */
export async function sharedCourseDiffers(course: Course, chapterIds?: string[], widgets: Widget[] = []): Promise<boolean> {
  const existing = getCourse(course.id);
  const reg = readRegistry();
  if (existing) {
    if (chapterIds) {
      if (!isPureCopy(reg, 'course', existing)) {
        const newer = sharedVersion(course.updatedAt) > existing.updatedAt;
        let local: Course;
        try {
          local = sanitizeCourse(await inlineMedia(existing)) ?? existing;
        } catch {
          return true;
        }
        const inc = sanitizeCourse(course) ?? course;
        for (const ch of inc.chapters.filter((x) => chapterIds.includes(x.id))) {
          const mine = local.chapters.find((x) => x.id === ch.id);
          if (!mine) return true;
          if (newer && stableJson(mine) !== stableJson(ch)) return true;
        }
      }
    } else if (await isConflict('course', course, existing, reg, false)) {
      return true;
    }
  }
  const localWidgets = new Map(getWidgets().map((w) => [w.id, w] as const));
  for (const w of newestById(widgets).values()) {
    const local = localWidgets.get(w.id);
    if (local && (await isConflict('widget', w, local, reg, false))) return true;
  }
  return false;
}

export function courseReadUrl(code: string): string {
  const base = location.origin + location.pathname;
  return `${base}#/cursus/lees/${code}`;
}

// ── Voortgangscode (leerling → leerkracht, zonder server) ───────────────────

export function encodeCourseProgress(progress: CourseProgress): string {
  return 'WFC1.' + LZString.compressToEncodedURIComponent(JSON.stringify(progress));
}

export function decodeCourseProgress(code: string): CourseProgress | null {
  try {
    const raw = code.trim();
    if (!raw.startsWith('WFC1.')) return null;
    const json = LZString.decompressFromEncodedURIComponent(raw.slice(5));
    if (!json) return null;
    const p = JSON.parse(json) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    if (typeof p.courseId !== 'string' || !p.courseId) return null;
    if (typeof p.studentName !== 'string' || !p.studentName.trim()) return null;
    // Secties defensief opbouwen: een geknutselde code (sections: null,
    // arrays, rommelvelden) mag de volgpagina nooit kunnen breken.
    const sections: Record<string, SectionProgress> = {};
    if (p.sections && typeof p.sections === 'object' && !Array.isArray(p.sections)) {
      for (const [sid, raw2] of Object.entries(p.sections as Record<string, unknown>)) {
        if (!raw2 || typeof raw2 !== 'object' || Array.isArray(raw2)) continue;
        const sp = raw2 as Record<string, unknown>;
        const checks: Record<string, string[]> = {};
        if (sp.checks && typeof sp.checks === 'object' && !Array.isArray(sp.checks)) {
          for (const [bid, items] of Object.entries(sp.checks as Record<string, unknown>)) {
            if (Array.isArray(items)) {
              zetEigen(checks, bid, items.filter((x): x is string => typeof x === 'string'));
            }
          }
        }
        zetEigen(sections, sid, {
          openedAt: typeof sp.openedAt === 'number' ? sp.openedAt : Date.now(),
          completedAt: typeof sp.completedAt === 'number' ? sp.completedAt : undefined,
          secondsSpent: typeof sp.secondsSpent === 'number' && sp.secondsSpent >= 0 ? Math.min(sp.secondsSpent, 1e7) : 0,
          checks: Object.keys(checks).length ? checks : undefined,
        });
      }
    }
    return {
      courseId: p.courseId,
      courseCode: typeof p.courseCode === 'string' ? p.courseCode : '',
      studentName: p.studentName.trim().slice(0, 60),
      // Klas en leerling uit de klaslijst mee bewaren: het klasoverzicht
      // koppelt de voortgang daarmee aan de juiste leerling (lib/classes.ts).
      classId: typeof p.classId === 'string' && p.classId ? p.classId : undefined,
      studentId: typeof p.studentId === 'string' && p.studentId ? p.studentId : undefined,
      sections,
      lastSectionId: typeof p.lastSectionId === 'string' ? p.lastSectionId : undefined,
      // Nooit in de toekomst: anders blijft een geknutselde of scheve klok
      // voor altijd "laatst gezien" (samenvoegen neemt het maximum).
      lastSeenAt: typeof p.lastSeenAt === 'number' && Number.isFinite(p.lastSeenAt) ? Math.min(p.lastSeenAt, Date.now()) : Date.now(),
      startedAt: typeof p.startedAt === 'number' ? p.startedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Binnengekomen voortgangscode samenvoegen met wat er al lokaal staat (KL1).
 * Samenvoegen verliest niets (zie mergeProgressRecords) en "laatst gezien"
 * blijft het maximum uit de codes, niet het moment van inlezen: zo telt een
 * code van een tweede toestel nooit als "ouder" en gaat ze niet verloren.
 * Geeft false terug als er niets bewaard is.
 */
export function importProgressCode(p: CourseProgress): boolean {
  const existing = getStudentProgress(p.courseId, p.studentName);
  return saveStudentProgress(existing ? mergeProgressRecords(existing, p) : p, { keepLastSeenAt: true });
}

// ── JSON-export/-import & defensieve sanering ───────────────────────────────

/** Een geüploade pdf die in een cursusbestand meereist (base64). */
export interface CoursePdf {
  id: string;
  name: string;
  dataUrl: string;
}

const PDF_DATA_PREFIX = 'data:application/pdf;base64,';

/** pdfId van een widget met een pdf als bron (bv. gesplitst werkblad: config.source.pdfId). */
function widgetPdfId(w: Widget): string | null {
  const src = (w.config as unknown as { source?: unknown }).source;
  if (!src || typeof src !== 'object') return null;
  const pid = (src as Record<string, unknown>).pdfId;
  return typeof pid === 'string' && pid ? pid : null;
}

/** Alle pdf's waar de cursus en haar widgets naar verwijzen. */
function coursePdfIds(course: Course, widgets: Widget[]): Set<string> {
  const ids = new Set(referencedPdfIds(course));
  for (const w of widgets) {
    const pid = widgetPdfId(w);
    if (pid) ids.add(pid);
  }
  return ids;
}

/**
 * Cursusbestand mét ingebedde widgets; media gaan als data-URL mee (async).
 * Ook de geüploade pdf's reizen mee (CU4/OP12): de export is voor veel
 * leerkrachten hun enige back-up, en zonder pdf's is die onvolledig.
 */
export async function exportCourseJson(course: Course): Promise<string> {
  const widgets = referencedWidgetIds(course)
    .map((id) => getWidget(id))
    .filter((x): x is Widget => Boolean(x));
  const pdfs: CoursePdf[] = [];
  for (const id of coursePdfIds(course, widgets)) {
    try {
      const pdf = await pdfToDataUrl(id);
      if (!pdf) continue;
      // Altijd als pdf markeren: een blob zonder type geeft anders
      // "application/octet-stream" en dan weigert de import hem.
      const komma = pdf.dataUrl.indexOf(';base64,');
      if (komma < 0) continue;
      pdfs.push({ id, name: pdf.name || 'document.pdf', dataUrl: PDF_DATA_PREFIX + pdf.dataUrl.slice(komma + 8) });
    } catch {
      // Een pdf die niet te lezen is, houdt de rest van de export niet tegen.
    }
  }
  const payload = await inlineMedia({ app: 'boosterz', kind: 'cursus', v: 1, course, widgets });
  return JSON.stringify(pdfs.length ? { ...payload, pdfs } : payload, null, 2);
}

/** Pdf's uit een cursusbestand: alleen echte pdf-data, alleen waar de cursus naar verwijst. */
function sanitizeCoursePdfs(raw: unknown, allowed: Set<string>): CoursePdf[] {
  if (!Array.isArray(raw)) return [];
  const out: CoursePdf[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id : '';
    if (!/^[\w-]{1,100}$/.test(id) || !allowed.has(id) || seen.has(id)) continue;
    const dataUrl = typeof p.dataUrl === 'string' ? p.dataUrl : '';
    if (!dataUrl.startsWith(PDF_DATA_PREFIX)) continue;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(dataUrl.slice(PDF_DATA_PREFIX.length))) continue;
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 200) : 'document.pdf';
    seen.add(id);
    out.push({ id, name, dataUrl });
  }
  return out;
}

export function importCourseJson(json: string): { course: Course; widgets: Widget[]; pdfs: CoursePdf[] } | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    const course = sanitizeCourse(data.course ?? data.c ?? data);
    if (!course) return null;
    const widgets = Array.isArray(data.widgets ?? data.w)
      ? (data.widgets ?? data.w).map(sanitizeSharedWidget).filter((x: Widget | null): x is Widget => x !== null)
      : [];
    const pdfs = sanitizeCoursePdfs(data.pdfs, coursePdfIds(course, widgets));
    return { course, widgets, pdfs };
  } catch {
    return null;
  }
}

/**
 * Pdf's uit een cursusbestand terugzetten in IndexedDB. Een pdf die hier al
 * staat (zelfde id), blijft ongemoeid. `failed` telt wat niet lukte (bv.
 * volle opslag), zodat de pagina het eerlijk kan melden.
 */
export async function restoreCoursePdfs(pdfs: CoursePdf[]): Promise<{ restored: number; failed: number }> {
  let restored = 0;
  let failed = 0;
  for (const p of pdfs) {
    try {
      if (await getPdf(p.id)) continue;
      if (await importPdfFromDataUrl(p.id, p.name, p.dataUrl)) restored++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { restored, failed };
}

const BLOCK_TYPES: CourseBlockType[] = [
  'heading', 'text', 'image', 'video', 'audio', 'pdf', 'embed', 'callout', 'quote',
  'divider', 'attachment', 'accordion', 'columns', 'table', 'terms', 'checklist', 'widget',
];

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Minstens één letter of cijfer (dus niet leeg, niet alleen "…" of "-"). */
function heeftInhoud(v: string): boolean {
  return /[\p{L}\p{N}]/u.test(v);
}

/**
 * Id uit binnengekomen inhoud. Een naam uit Object.prototype ("__proto__",
 * "constructor", "toString" …) wordt een vers id: de leesweergave zoekt
 * notities en voortgang op met `obj[id]` en zou dan blijvend crashen of het
 * prototype aanpassen. Geen witte lijst van tekens: bestaande id's blijven.
 */
function veiligId(v: unknown): string {
  const id = s(v);
  if (!id || id === '__proto__' || id in Object.prototype) return uid();
  return id;
}

/**
 * Bijlage: alleen een bestand dat de app zelf meegeeft (data:, blob: of een
 * eigen mediaverwijzing). Al de rest (javascript:, http …) wordt leeg; de
 * kaart blijft staan, zonder link.
 */
function veiligeBijlage(v: unknown): string {
  const u = s(v);
  return isBestandUrl(u) || isMediaRef(u) ? u : '';
}

function sanitizeBlock(raw: unknown): CourseBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const type = s(b.type) as CourseBlockType;
  if (!BLOCK_TYPES.includes(type)) return null;
  const id = veiligId(b.id);
  switch (type) {
    case 'heading':
      return { id, type, text: s(b.text), level: b.level === 3 ? 3 : 2 };
    case 'text':
      return { id, type, markdown: s(b.markdown ?? b.text) };
    case 'image':
      return { id, type, url: s(b.url), caption: s(b.caption) || undefined, size: b.size === 'small' || b.size === 'wide' ? b.size : 'normal' };
    case 'video':
      return { id, type, url: s(b.url), caption: s(b.caption) || undefined };
    case 'audio':
      return { id, type, url: s(b.url), caption: s(b.caption) || undefined };
    case 'pdf': {
      const pdfId = s(b.pdfId) || undefined;
      // Alleen een http(s)-adres: een javascript:-URL zou via pdf.js en de
      // iframe-terugval in de app uitgevoerd worden (zie lib/veiligeUrl.ts).
      const url = webUrl(b.url) ?? undefined;
      // Zonder upload én zonder URL valt er niets te tonen — blok weglaten.
      if (!pdfId && !url) return null;
      return {
        id, type, pdfId, url,
        name: s(b.name) || undefined,
        caption: s(b.caption) || undefined,
        height: typeof b.height === 'number' && b.height > 80 ? Math.min(b.height, 1200) : undefined,
      };
    }
    case 'embed':
      return { id, type, url: s(b.url), height: typeof b.height === 'number' && b.height > 80 ? Math.min(b.height, 1200) : 420, title: s(b.title) || undefined };
    case 'callout':
      return { id, type, kind: b.kind === 'tip' || b.kind === 'warn' || b.kind === 'goal' ? b.kind : 'info', title: s(b.title) || undefined, text: s(b.text) };
    case 'quote':
      return { id, type, text: s(b.text), source: s(b.source) || undefined };
    case 'divider':
      return { id, type };
    case 'attachment':
      return { id, type, name: s(b.name) || 'bestand', dataUrl: veiligeBijlage(b.dataUrl) };
    case 'accordion': {
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              const ii = it as Record<string, unknown>;
              const title = s(ii?.title).trim();
              const text = s(ii?.text);
              // Half-ingevuld item behouden: alleen weggooien als béíde velden leeg zijn.
              if (!title && !text.trim()) return null;
              return { id: veiligId(ii?.id), title: title || '—', text };
            })
            .filter((x): x is { id: string; title: string; text: string } => x !== null)
        : [];
      return items.length ? { id, type, items } : null;
    }
    case 'columns':
      return { id, type, left: s(b.left), right: s(b.right) };
    case 'table': {
      const rows = Array.isArray(b.rows)
        ? b.rows
            .filter((r): r is unknown[] => Array.isArray(r))
            .map((r) => r.map((cell) => s(cell)))
        : [];
      const width = Math.max(...rows.map((r) => r.length), 0);
      if (!rows.length || !width) return null;
      return { id, type, header: b.header !== false, rows: rows.map((r) => [...r, ...Array(width - r.length).fill('')]) };
    }
    case 'terms': {
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              const ii = it as Record<string, unknown>;
              const term = s(ii?.term).trim();
              const uitleg = s(ii?.uitleg);
              // Half-ingevuld begrip behouden: alleen weggooien als béíde velden leeg zijn.
              if (!term && !uitleg.trim()) return null;
              return { id: veiligId(ii?.id), term: term || '—', uitleg };
            })
            .filter((x): x is { id: string; term: string; uitleg: string } => x !== null)
        : [];
      return items.length ? { id, type, items } : null;
    }
    case 'checklist': {
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              const text = typeof it === 'string' ? it : s((it as Record<string, unknown>)?.text);
              return text.trim() ? { id: veiligId((it as Record<string, unknown>)?.id), text: text.trim() } : null;
            })
            .filter((x): x is { id: string; text: string } => x !== null)
        : [];
      return items.length ? { id, type, title: s(b.title) || undefined, items } : null;
    }
    case 'widget':
      return { id, type, widgetId: s(b.widgetId), note: s(b.note) || undefined };
  }
}

export function sanitizeCourse(raw: unknown): Course | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.chapters)) return null;
  const chapters: CourseChapter[] = c.chapters
    .map((chRaw): CourseChapter | null => {
      const ch = chRaw as Record<string, unknown>;
      if (!ch || typeof ch !== 'object') return null;
      const sections: CourseSection[] = Array.isArray(ch.sections)
        ? ch.sections
            .map((seRaw): CourseSection | null => {
              const se = seRaw as Record<string, unknown>;
              if (!se || typeof se !== 'object') return null;
              const blocks = Array.isArray(se.blocks)
                ? se.blocks.map(sanitizeBlock).filter((x): x is CourseBlock => x !== null)
                : [];
              // Leerplancodes zijn de ruggengraat (zie lib/curriculum.ts):
              // normaliseren en ontdubbelen zodat "wis 2.3" en "WIS  2.3" één
              // doel blijven, hier én in de widgets en het klasoverzicht.
              // Een "code" of doel zonder één letter of cijfer (bv. "…" dat een
              // AI uit het voorbeeld overnam) is geen doel: weglaten (AI9).
              const goalCodes = normalizeGoalCodes(se.goalCodes).filter(heeftInhoud);
              return {
                id: veiligId(se.id),
                title: s(se.title).trim() || 'Sectie',
                blocks,
                goals: Array.isArray(se.goals) ? se.goals.filter((g): g is string => typeof g === 'string' && heeftInhoud(g)) : undefined,
                goalCodes: goalCodes.length ? goalCodes : undefined,
                optional: se.optional === true,
              };
            })
            .filter((x): x is CourseSection => x !== null)
        : [];
      return {
        id: veiligId(ch.id),
        title: s(ch.title).trim() || 'Hoofdstuk',
        emoji: s(ch.emoji) || undefined,
        sections,
      };
    })
    .filter((x): x is CourseChapter => x !== null);
  if (!chapters.length) return null;

  const st = (c.settings && typeof c.settings === 'object' ? c.settings : {}) as Record<string, unknown>;
  return {
    id: veiligId(c.id),
    title: s(c.title).trim() || 'Cursus',
    subtitle: s(c.subtitle) || undefined,
    author: s(c.author),
    coverEmoji: s(c.coverEmoji) || '📘',
    code: s(c.code) || makeCode(),
    chapters,
    curriculumId: s(c.curriculumId) || undefined,
    settings: {
      accentColor: s(st.accentColor) || '#4f46e5',
      requireName: st.requireName !== false,
      showProgressToStudent: st.showProgressToStudent !== false,
    },
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    // Versie van de bron, nooit in de toekomst (zie sharedVersion).
    updatedAt: sharedVersion(c.updatedAt),
  };
}

// ── Democursus (eerste kennismaking) ────────────────────────────────────────

/**
 * Vlag: de democursus is al eens aangemaakt (of er stonden al cursussen).
 * Eigen sleutel, zoals 'wf.classes.seeded.v1': wie de democursus verwijdert,
 * krijgt ze niet terug (CU11). Niet in de voorkeuren, want een scherm dat zijn
 * voorkeuren met een oudere kopie wegschrijft, zou de vlag wissen.
 */
const DEMO_COURSE_FLAG = 'wf.democursus.v1';

export function ensureDemoCourse() {
  try {
    if (localStorage.getItem(DEMO_COURSE_FLAG)) return;
  } catch {
    return; // zonder opslag ook geen democursus
  }
  const markeer = () => {
    try {
      localStorage.setItem(DEMO_COURSE_FLAG, '1');
    } catch {
      // genegeerd: hoogstens komt de democursus nog eens terug
    }
  };
  if (getCourses().length > 0) {
    markeer();
    return;
  }
  // Alleen een voorbeeldoefening insluiten, nooit eigen werk van de leerkracht
  // (vroeger: de eerste de beste quiz, ook een eigen).
  const demoWidget = getWidgets().find(
    (w) => w.title.startsWith('Voorbeeld:') && ['quiz', 'worksheet', 'exitticket', 'flashcards'].includes(w.type)
  );
  const course = createCourse('Voorbeeldcursus: de waterkringloop');
  course.subtitle = 'Zo ziet een digitale cursus voor je leerlingen eruit';
  course.coverEmoji = '💧';
  // Aan het voorbeeldleerplan hangen (als dat er staat), zodat de doelendekking
  // meteen iets toont. Zie lib/seed.ts → ensureExampleCurriculum().
  if (getCurriculum(EXAMPLE_CURRICULUM_ID)) course.curriculumId = EXAMPLE_CURRICULUM_ID;
  course.chapters = [
    {
      id: uid(), title: 'Verdamping en wolken', emoji: '☁️',
      sections: [
        {
          id: uid(), title: 'Wat gebeurt er met water in de zon?',
          goals: ['Ik kan uitleggen wat verdamping is'],
          goalCodes: ['NW 4.1', 'NW 2.2'],
          blocks: [
            { id: uid(), type: 'callout', kind: 'goal', title: 'Wat leer je hier?', text: 'Na deze pagina kan je uitleggen wat verdamping is en waar wolken vandaan komen.' },
            { id: uid(), type: 'text', markdown: 'De zon verwarmt het water in zeeën, rivieren en plassen. Een deel van dat water wordt **waterdamp**: onzichtbaar kleine druppeltjes die opstijgen in de lucht.\n\nDit proces heet **verdamping**. Hoe warmer het is, hoe sneller water verdampt.' },
            { id: uid(), type: 'terms', items: [
              { id: uid(), term: 'verdamping', uitleg: 'Water dat verandert in waterdamp (gas) door warmte.' },
              { id: uid(), term: 'condensatie', uitleg: 'Waterdamp die weer vloeibare druppels wordt, bv. in wolken.' },
            ] },
            { id: uid(), type: 'checklist', title: 'Check jezelf', items: [
              { id: uid(), text: 'Ik kan een voorbeeld van verdamping geven uit de keuken.' },
              { id: uid(), text: 'Ik weet waarom een wolk uit druppeltjes bestaat.' },
            ] },
          ],
        },
        {
          id: uid(), title: 'Oefen even',
          goalCodes: ['NW 2.1'],
          blocks: [
            { id: uid(), type: 'text', markdown: 'Test of je de begrippen al kent. Deze oefening staat *in* de cursus — je resultaat komt bij je leerkracht terecht.' },
            ...(demoWidget ? [{ id: uid(), type: 'widget', widgetId: demoWidget.id } as CourseBlock] : []),
          ],
        },
      ],
    },
    {
      id: uid(), title: 'Neerslag', emoji: '🌧️',
      sections: [
        {
          id: uid(), title: 'Van wolk tot regen',
          optional: true,
          goalCodes: ['NW 4.2', 'NW 4.4'],
          blocks: [
            { id: uid(), type: 'text', markdown: 'Dit is een **verdiepingssectie** — ze telt niet mee voor "cursus afgewerkt". Handig voor uitbreidingsleerstof.' },
            { id: uid(), type: 'quote', text: 'Regen is gewoon een wolk die het niet meer houdt.', source: 'Een weerman' },
          ],
        },
      ],
    },
  ];
  if (saveCourse(course)) markeer();
}

// ── Bewaren vanuit de cursuseditor: nooit iets overschrijven wat je niet zag ─
//
// Twee tabbladen met dezelfde cursus schreven vroeger stil over elkaar heen
// (CU2/OP4). De editor onthoudt daarom de versie (updatedAt) waarop hij verder
// bouwt, en bewaart alleen als de opgeslagen versie nog precies díe is.
// Bewust op gelijkheid en niet op "nieuwer": na een bewust "Vervangen" door
// een oudere back-up springt updatedAt terug, en ook dat is een wijziging die
// een ander tabblad niet mag wegvegen.

export type GuardedSaveResult =
  | { ok: true; updatedAt: number }
  /** In de opslag staat intussen een andere versie (`stored`): niets geschreven. */
  | { ok: false; reason: 'gewijzigd'; stored: Course }
  /** De cursus staat niet meer in de opslag (elders verwijderd): niets geschreven. */
  | { ok: false; reason: 'verwijderd' }
  /** Schrijven mislukte (volle of geblokkeerde opslag); gemeld via reportWriteFailure. */
  | { ok: false; reason: 'mislukt' };

/**
 * Bewaart `course` alleen als de opgeslagen versie nog `expectedUpdatedAt`
 * draagt (lezen, vergelijken en schrijven in één synchrone stap). Met
 * `force` wordt er toch geschreven, ook over een andere versie heen of als
 * de cursus elders verwijderd werd: alleen na een uitdrukkelijke keuze.
 * De nieuwe updatedAt verschilt altijd van de vorige, ook binnen dezelfde
 * milliseconde: anders zou een ander tabblad de wijziging niet opmerken.
 */
export function saveCourseGuarded(
  course: Course,
  expectedUpdatedAt: number,
  opts: { force?: boolean } = {}
): GuardedSaveResult {
  const all = getCourses();
  const i = all.findIndex((c) => c.id === course.id);
  if (!opts.force) {
    if (i < 0) return { ok: false, reason: 'verwijderd' };
    if (all[i].updatedAt !== expectedUpdatedAt) return { ok: false, reason: 'gewijzigd', stored: all[i] };
  }
  const previous = i >= 0 ? all[i].updatedAt : undefined;
  let updatedAt = Date.now();
  // Vlak na elkaar (zelfde milliseconde): toch een nieuwe, hogere versie, zodat
  // een versie nooit terugkomt die een ander tabblad nog als de zijne kent.
  if (typeof previous === 'number' && updatedAt <= previous && previous - updatedAt < 60_000) updatedAt = previous + 1;
  while (updatedAt === previous || updatedAt === expectedUpdatedAt) updatedAt++;
  const saved = { ...course, updatedAt };
  if (i >= 0) all[i] = saved;
  else all.unshift(saved);
  return write(COURSES_KEY, all) ? { ok: true, updatedAt } : { ok: false, reason: 'mislukt' };
}

/**
 * Luistert naar wijzigingen aan de cursussen vanuit een ánder tabblad (het
 * `storage`-event komt nooit in het tabblad dat zelf schreef). Ook bij
 * `localStorage.clear()` elders (key null). Geeft een opzegfunctie terug.
 */
export function onCoursesChangedElsewhere(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== null && e.key !== COURSES_KEY) return;
    try {
      if (e.storageArea && e.storageArea !== localStorage) return; // sessionStorage telt niet
    } catch {
      return; // opslag geblokkeerd: dan valt er ook niets te lezen
    }
    fn();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
