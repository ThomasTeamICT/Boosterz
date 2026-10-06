// ── Klaspakket: één link (of één bestand) met alles erin ────────────────────
//
// De leerkracht deelt zijn klas in één keer: de klaslijst, de opdrachten én
// de inhoud van die opdrachten (cursussen met hun ingebedde widgets, losse
// widgets). De leerling opent de link op eender welk toestel, kiest zijn naam
// uit de lijst en kan meteen werken — zonder server, zonder account.
//
// Vorm van de payload (bewust Nederlandstalig, net als de andere deelvormen):
//   { v: 1, kind: 'klas', klas: {...}, opdrachten: [{ ...opdracht, course?, widgets?, widget? }] }
//
// De klas van een leerling komt NIET in de leerkrachtlijst terecht: die staat
// apart onder 'wf.classpacks.v1'. Zo blijft "Mijn klassen" van de leerkracht
// schoon, ook wanneer hij zelf eens een pakket opent om te testen.

import LZString from 'lz-string';
import type { Assignment, ClassGroup } from './classTypes';
import type { Course } from './courseTypes';
import { referencedWidgetIds } from './courseTypes';
import type { Widget } from './types';
import { assignmentsForClass, getClassByCode, sanitizeAssignment, sanitizeClass } from './classes';
import {
  adoptSharedContent, findSharedConflicts, getCourse, sanitizeCourse,
  type AdoptOptions, type SharedConflict,
} from './courses';
import { getWidget, notifyChange, reportWriteFailure } from './storage';
import { countUnresolvedMedia, inlineMedia } from './mediaStore';
import { sanitizeSharedWidget } from './share';

const PACKS_KEY = 'wf.classpacks.v1';

/** Boven deze linklengte heeft een QR-code geen zin meer (scanners haken af). */
export { QR_MAX_CHARS } from './qrLimits';

export interface PackAssignment extends Assignment {
  /** Cursus bij een cursusopdracht. */
  course?: Course;
  /** De widgets die in die cursus ingebed zitten. */
  widgets?: Widget[];
  /** Widget bij een widgetopdracht. */
  widget?: Widget;
}

export interface ClassPack {
  v: 1;
  kind: 'klas';
  klas: ClassGroup;
  opdrachten: PackAssignment[];
}

// ── Maken ───────────────────────────────────────────────────────────────────

/**
 * Bouwt het pakket op uit wat er op dít toestel staat. Ontbrekende cursussen
 * of widgets worden stil overgeslagen: de opdracht reist dan mee zonder
 * inhoud, en de leerling ziet netjes "staat niet op dit toestel".
 * Async: media staan in IndexedDB en moeten als data-URL mee (lib/mediaStore).
 */
export async function buildClassPack(cls: ClassGroup, assignments: Assignment[]): Promise<ClassPack> {
  const opdrachten: PackAssignment[] = assignments.map((a) => {
    if (a.kind === 'course') {
      const course = getCourse(a.targetId);
      if (!course) return { ...a };
      const widgets = referencedWidgetIds(course)
        .map((id) => getWidget(id))
        .filter((w): w is Widget => Boolean(w));
      return { ...a, course, widgets };
    }
    const widget = getWidget(a.targetId);
    return widget ? { ...a, widget } : { ...a };
  });
  return inlineMedia<ClassPack>({ v: 1, kind: 'klas', klas: cls, opdrachten });
}

export interface EncodedClassPack {
  url: string;
  /** Media die niet mee konden (blob niet op dit toestel). */
  unresolved: number;
  /** Lengte van de link — bepaalt of een QR-code nog kan. */
  length: number;
  pack: ClassPack;
}

export async function encodeClassPackToUrl(cls: ClassGroup, assignments: Assignment[]): Promise<EncodedClassPack> {
  const pack = await buildClassPack(cls, assignments);
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(pack));
  const base = typeof location !== 'undefined' ? location.origin + location.pathname : '';
  const url = `${base}#/klas/open?d=${compressed}`;
  return { url, unresolved: countUnresolvedMedia(pack), length: url.length, pack };
}

/** Downloadbaar bestand met hetzelfde pakket (voor trage of te lange links). */
export function classPackToJson(pack: ClassPack): string {
  return JSON.stringify({ app: 'boosterz', ...pack }, null, 2);
}

export function classPackFileName(cls: ClassGroup): string {
  const safe = cls.name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').toLowerCase() || 'klas';
  return `${safe}.klaspakket.json`;
}

// ── Lezen ───────────────────────────────────────────────────────────────────

function sanitizePack(raw: unknown): ClassPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.kind !== 'klas') return null;
  const klas = sanitizeClass(p.klas);
  if (!klas) return null;
  const opdrachten: PackAssignment[] = [];
  if (Array.isArray(p.opdrachten)) {
    for (const rawA of p.opdrachten as unknown[]) {
      // classId van de opdracht altijd op de klas uit hetzelfde pakket zetten:
      // een geknutseld pakket mag geen opdrachten aan een andere klas hangen.
      const base = sanitizeAssignment({ ...(rawA as object), classId: klas.id });
      if (!base) continue;
      const extra = rawA as Record<string, unknown>;
      const item: PackAssignment = { ...base };
      if (base.kind === 'course') {
        const course = extra.course ? sanitizeCourse(extra.course) : null;
        if (course) {
          item.course = course;
          item.widgets = Array.isArray(extra.widgets)
            ? (extra.widgets as unknown[]).map(sanitizeSharedWidget).filter((w): w is Widget => w !== null)
            : [];
          // De opdracht wijst naar de cursus zoals ze in het pakket zit.
          item.targetId = course.id;
        }
      } else {
        const widget = extra.widget ? sanitizeSharedWidget(extra.widget) : null;
        if (widget) {
          item.widget = widget;
          item.targetId = widget.id;
        }
      }
      opdrachten.push(item);
    }
  }
  return { v: 1, kind: 'klas', klas, opdrachten };
}

export function decodeClassPack(d: string): ClassPack | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(d);
    if (!json) return null;
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || (payload as Record<string, unknown>).v !== 1) return null;
    return sanitizePack(payload);
  } catch {
    return null;
  }
}

export function importClassPackJson(json: string): ClassPack | null {
  try {
    return sanitizePack(JSON.parse(json));
  } catch {
    return null;
  }
}

function veiligDecoderen(v: string): string | null {
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}

/**
 * Geplakte klaslink lezen, hoe hij ook binnenkomt (LL12): een volledige link,
 * alleen het stuk na "d=", met %-codering (bv. %2B voor "+") of met spaties
 * waar een "+" stond (sommige mailprogramma's), of het pakketbestand zelf
 * (JSON). Regeleinden van een afgebroken link vallen weg.
 */
export function readPastedClassPack(value: string): ClassPack | null {
  const text = value.trim();
  if (!text) return null;
  if (text.startsWith('{')) return importClassPackJson(text);
  const flat = text.replace(/[\r\n\t]+/g, '');
  const kandidaten: string[] = [];
  const vraag = flat.indexOf('?');
  if (vraag >= 0) {
    // Zoals de router het leest: URLSearchParams decodeert %-tekens; een
    // spatie (of "+", die het als spatie leest) zet LZString zelf weer om.
    const d = new URLSearchParams(flat.slice(vraag + 1)).get('d');
    if (d) kandidaten.push(d);
  }
  const los = /(?:^|[?&])d=([^&]+)/.exec(flat);
  if (los) kandidaten.push(los[1]);
  kandidaten.push(flat);
  for (const k of [...kandidaten]) {
    const decoded = k.includes('%') ? veiligDecoderen(k) : null;
    if (decoded) kandidaten.push(decoded);
  }
  for (const k of kandidaten) {
    const pack = decodeClassPack(k);
    if (pack) return pack;
  }
  return null;
}

// ── Overnemen op het leerlingtoestel ────────────────────────────────────────

export interface AdoptReport {
  courses: number;
  widgets: number;
  assignments: number;
  /** false = niet alles kon bewaard worden (opslag vol): eerlijk melden. */
  ok: boolean;
  /** Bijgewerkt naar een nieuwere versie van dezelfde bron. */
  updated: number;
  /** Bewaard naast de eigen versie, als kopie. */
  copied: number;
}

/** Alle cursussen en widgets die in het pakket meereizen. */
function packContent(pack: ClassPack): { courses: Course[]; widgets: Widget[] } {
  const courses: Course[] = [];
  const widgets: Widget[] = [];
  for (const a of pack.opdrachten) {
    if (a.course) {
      courses.push(a.course);
      widgets.push(...(a.widgets ?? []));
    } else if (a.widget) {
      widgets.push(a.widget);
    }
  }
  return { courses, widgets };
}

/**
 * Wat moet de gebruiker beslissen vóór het overnemen (V3)? Cursussen en
 * widgets die hier als eigen werk staan en in een andere, nieuwere versie in
 * het pakket zitten. Een zuivere kopie van een vorig pakket wordt zonder vraag
 * bijgewerkt, een oudere versie zet niets terug (zie lib/courses.ts).
 */
export function classPackConflicts(pack: ClassPack): Promise<SharedConflict[]> {
  const { courses, widgets } = packContent(pack);
  return findSharedConflicts(courses, widgets);
}

/**
 * Bewaart de inhoud van het pakket lokaal, volgens de regels van
 * adoptSharedContent (lib/courses.ts): nieuw wordt bewaard, een nieuwere
 * versie van dezelfde bron werkt een ongewijzigde kopie bij, een oudere
 * versie zet niets terug, en eigen werk wordt nooit stil overschreven —
 * daarvoor beslist de gebruiker vooraf (`opts.conflicts`, zie
 * classPackConflicts). Bewaart de gebruiker iets als kopie, dan wijzen de
 * opdrachten naar die kopie. De klas zelf komt in de leerlingopslag
 * ('wf.classpacks.v1'), niet in de klassenlijst van de leerkracht.
 * Wat uit een pakket komt, is gedeelde inhoud (`gedeeld`, S1): een latere,
 * nieuwere versie via link of pakket mag een ongewijzigde kopie stil bijwerken.
 */
export function adoptClassPack(pack: ClassPack, opts: AdoptOptions = {}): AdoptReport {
  const { courses, widgets } = packContent(pack);
  const res = adoptSharedContent(courses, widgets, { ...opts, gedeeld: true });
  const report: AdoptReport = {
    courses: courses.length,
    widgets: new Set(widgets.map((w) => w.id)).size,
    assignments: pack.opdrachten.length,
    ok: res.ok,
    updated: res.updated,
    copied: res.copied,
  };
  // Opdrachten laten wijzen naar wat er op dit toestel staat (een kopie
  // heeft een eigen id).
  const opdrachten = pack.opdrachten.map((a) => {
    const map = a.kind === 'course' ? res.courseIds : res.widgetIds;
    const target = map.get(a.targetId);
    return target && target !== a.targetId ? { ...a, targetId: target } : a;
  });
  if (!saveClassPack({ ...pack, opdrachten })) report.ok = false;
  return report;
}

// ── Opslag van overgenomen klassen (leerlingzijde) ──────────────────────────

/** Wat er van een pakket lokaal bijblijft: de klas en de kale opdrachten. */
export interface StoredClassPack {
  klas: ClassGroup;
  opdrachten: Assignment[];
  adoptedAt: number;
}

function readPacks(): StoredClassPack[] {
  try {
    const raw = localStorage.getItem(PACKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: StoredClassPack[] = [];
    for (const item of parsed as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const klas = sanitizeClass(rec.klas);
      if (!klas) continue;
      const opdrachten = Array.isArray(rec.opdrachten)
        ? (rec.opdrachten as unknown[])
            .map((a) => sanitizeAssignment({ ...(a as object), classId: klas.id }))
            .filter((a): a is Assignment => a !== null)
        : [];
      out.push({
        klas,
        opdrachten,
        adoptedAt: typeof rec.adoptedAt === 'number' ? rec.adoptedAt : Date.now(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function writePacks(list: StoredClassPack[]): boolean {
  let ok = true;
  try {
    localStorage.setItem(PACKS_KEY, JSON.stringify(list));
  } catch (e) {
    ok = false;
    reportWriteFailure(PACKS_KEY, e);
  }
  notifyChange();
  return ok;
}

/** Klas + opdrachten uit een pakket bewaren (vervangt een eerdere versie). */
export function saveClassPack(pack: ClassPack): boolean {
  const kale: Assignment[] = pack.opdrachten.map(({ course: _c, widgets: _w, widget: _wg, ...rest }) => rest);
  const others = readPacks().filter((p) => p.klas.id !== pack.klas.id && p.klas.code !== pack.klas.code);
  return writePacks([{ klas: pack.klas, opdrachten: kale, adoptedAt: Date.now() }, ...others]);
}

export function getClassPacks(): StoredClassPack[] {
  return readPacks();
}

export function getClassPackByCode(code: string): StoredClassPack | undefined {
  const c = code.trim().toUpperCase();
  return readPacks().find((p) => p.klas.code.toUpperCase() === c);
}

export function deleteClassPack(classId: string) {
  writePacks(readPacks().filter((p) => p.klas.id !== classId));
}

// ── Wat de leerlinghub nodig heeft ──────────────────────────────────────────

export interface StudentClassView {
  cls: ClassGroup;
  assignments: Assignment[];
  /** true = via een klaspakket binnengekomen, false = klas van dit (leerkracht)toestel. */
  fromPack: boolean;
}

/**
 * De klas achter een klascode, waar ze ook vandaan komt: van de leerkracht op
 * dit toestel, of uit een overgenomen klaspakket.
 */
export function findStudentClass(code: string): StudentClassView | null {
  const own = getClassByCode(code);
  if (own) return { cls: own, assignments: assignmentsForClass(own.id), fromPack: false };
  const pack = getClassPackByCode(code);
  if (pack) {
    return {
      cls: pack.klas,
      assignments: pack.opdrachten.slice().sort((a, b) => b.createdAt - a.createdAt),
      fromPack: true,
    };
  }
  return null;
}
