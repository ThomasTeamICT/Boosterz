// ── "Alle inzendingen & leerlinggegevens wissen" (privacypagina) ────────────
//
// Wat weg moet, staat op twee plaatsen:
//  - localStorage: inzendingen, pogingen, tussentijds werk, notities,
//    deadlines, markeringen, voortgang, wie er op dit toestel ingelogd was en
//    de klaslijsten die via een klaspakket binnenkwamen;
//  - IndexedDB: de ingeleverde bestanden (fileId) en de tekeningen en
//    opnames (wfmedia:) waar die sleutels naar verwijzen. Ook die van werk dat
//    nog niet ingediend is en dus alleen in het tussentijdse werk staat (V6,
//    debugronde oktober 2026).
// Klaslijsten van de leerkracht, de feedbackbank, widgets, cursussen en
// leerplannen blijven staan; de bevestigingsvraag zegt dat ook.

import { collectMediaRefs, pruneOrphanMedia } from './mediaStore';
import { cleanupStudentFiles, collectFileIds, notifyChange } from './storage';

/**
 * De fileId's waar geen enkele bewaarde Boosterz-sleutel (wf.*) nog naar
 * verwijst. Kan de opslag niet gelezen worden, dan geen enkele: bij twijfel
 * niets weggooien. Ruim gezocht (het kale id, niet alleen `"fileId":"…"`):
 * een onterechte treffer laat hooguit een bestand staan.
 */
export function unreferencedFileIds(ids: Iterable<string>): Set<string> {
  const left = new Set(ids);
  if (left.size === 0) return left;
  try {
    for (let i = 0; i < localStorage.length && left.size > 0; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('wf.')) continue;
      const v = localStorage.getItem(k);
      if (!v) continue;
      for (const id of [...left]) if (v.includes(id)) left.delete(id);
    }
  } catch {
    return new Set();
  }
  return left;
}

/**
 * Verlopen tussentijds werk (lib/autosave.ts, OP13): de ingeleverde bestanden
 * die alleen daarin stonden, uit IndexedDB. De sleutel zelf is al weg.
 */
export function cleanupExpiredAutosaveFiles(raw: string): void {
  cleanupStudentFiles(unreferencedFileIds(collectFileIds(raw)));
}

/** Vaste sleutels met leerlinggegevens. */
export const LEERLING_SLEUTELS: readonly string[] = [
  'wf.submissions.v1', 'wf.attempts.v1', 'wf.live.v1', 'wf.courseprogress.v1',
  // op een gedeeld leerlingtoestel: wie er ingelogd was, wat er ingediend is,
  // en klaslijsten die via een klaspakket binnenkwamen (namen van leerlingen)
  'wf.student.v1', 'wf.handed.v1', 'wf.classpacks.v1',
];

/** Sleutels per oefening, cursus of leerling. */
export const LEERLING_PREFIXEN: readonly string[] = [
  'wf.autosave.', // tussentijds werk (met verwijzingen naar ingeleverde bestanden)
  'wf.coursename.', 'wf.coursenotes.', // naam en notities bij een cursus
  'wf.deadline.', // einddeadline per leerling
  'wf.markeringen.', // markeringen in een gesplitst werkblad, per leerling
  'wf.leitner.', // voortgang bij flitskaarten
];

const isLeerlingSleutel = (k: string) =>
  LEERLING_SLEUTELS.includes(k) || LEERLING_PREFIXEN.some((p) => k.startsWith(p));

/** Een waarde zonder inhoud ("[]", "{}") telt niet als bewaarde gegevens. */
const leeg = (v: string | null) => v === null || /^\s*(?:\[\s*\]|\{\s*\}|null)?\s*$/.test(v);

/** De sleutels met leerlinggegevens die nu iets bevatten. */
export function studentDataKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isLeerlingSleutel(k) && !leeg(localStorage.getItem(k))) out.push(k);
    }
  } catch {
    return [];
  }
  return out.sort();
}

/** Is er iets om te wissen? (Ook zonder inzendingen: notities, voortgang, tussentijds werk …) */
export function hasStudentData(): boolean {
  return studentDataKeys().length > 0;
}

export interface WipeResult {
  /** Gewiste sleutels. */
  keys: string[];
  /** Ingeleverde bestanden die uit IndexedDB gaan. */
  fileIds: string[];
  /** Tekeningen/opnames die als wees opgeruimd mogen worden. */
  mediaIds: string[];
  /** Klaar met het opruimen van de media (best-effort). */
  media: Promise<number>;
}

/**
 * Wist alle leerlinggegevens op dit toestel. Eerst worden de verwijzingen
 * verzameld (ook uit het tussentijdse werk), dan gaan de sleutels weg, en pas
 * daarna de bestanden: alleen wat nergens anders meer voorkomt.
 */
export function wipeStudentData(): WipeResult {
  const keys: string[] = [];
  const fileIds = new Set<string>();
  const mediaIds = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isLeerlingSleutel(k)) keys.push(k);
    }
  } catch {
    // opslag onleesbaar: dan is er ook niets te wissen
  }
  for (const k of keys) {
    let raw = '';
    try {
      raw = localStorage.getItem(k) ?? '';
    } catch {
      raw = '';
    }
    collectFileIds(raw).forEach((id) => fileIds.add(id));
    collectMediaRefs(raw).forEach((id) => mediaIds.add(id));
  }
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      // volgende sleutel
    }
  }
  const files = [...unreferencedFileIds(fileIds)].sort();
  cleanupStudentFiles(files);
  // een expliciete wisactie kent geen leeftijdsgrens; pruneOrphanMedia kijkt
  // zelf nog na of een tekening ergens anders gebruikt wordt (bv. in een widget)
  const media = mediaIds.size > 0
    ? pruneOrphanMedia({ only: mediaIds, minAgeMs: 0 }).catch(() => 0)
    : Promise.resolve(0);
  notifyChange();
  return { keys: keys.sort(), fileIds: files, mediaIds: [...mediaIds].sort(), media };
}
