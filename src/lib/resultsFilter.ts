// ── Klasfilter voor de resultatenpagina's ───────────────────────────────────
//
// Zonder klassen liepen parallelklassen door elkaar in /resultaten, ook als
// een leerling via een klaslink binnenkwam (Submission.classId). Dit bestand
// bevat de pure filterlogica, apart van de React-hook (useResultsClassFilter)
// die de keuze uit de URL en sessionStorage haalt — zo blijft dit stuk zonder
// DOM te testen.

import type { Submission } from './types';
import type { ClassGroup } from './classTypes';
import { matchesStudent } from './classes';

/**
 * 'all' = alle inzendingen, 'none' = inzendingen zonder klas (losse code, of
 * van vóór er klassen bestonden), anders het id van precies één klas.
 */
export type ResultsClassFilter = 'all' | 'none' | string;

export const RESULTS_CLASS_FILTER_KEY = 'wf.resultatenKlasfilter.v1';

/**
 * Filtert inzendingen op klas.
 *
 * Geef `classes` mee (de klassen van dit toestel) om dezelfde inzendingen te
 * tonen als het klasdashboard:
 *  • een klas = inzendingen met haar `classId`, plus inzendingen zónder
 *    `classId` die op naam (of studentId) bij een leerling van die klas horen
 *    (`matchesStudent`, zoals het dashboard koppelt);
 *  • 'none' = inzendingen zonder `classId` én inzendingen met een `classId`
 *    die hier niet (meer) bestaat: een verwijderde klas of een klas van een
 *    ander toestel. Zo verdwijnt er niets stil uit beeld.
 * Een inzending zonder `classId` kan dus zowel onder een klas als onder 'none'
 * staan. Zonder `classes` geldt de oude, strikte regel: enkel op `classId`.
 */
export function filterSubmissionsByClass(
  subs: Submission[],
  filter: ResultsClassFilter,
  classes?: ReadonlyArray<Pick<ClassGroup, 'id' | 'students'>>
): Submission[] {
  if (filter === 'all') return subs;
  if (filter === 'none') {
    if (!classes) return subs.filter((s) => !s.classId);
    const known = new Set(classes.map((c) => c.id));
    return subs.filter((s) => !s.classId || !known.has(s.classId));
  }
  const cls = classes?.find((c) => c.id === filter);
  if (!cls) return subs.filter((s) => s.classId === filter);
  return subs.filter((s) => s.classId === filter || (!s.classId && belongsToClass(s, cls)));
}

/** Hoort een inzending zonder klas op naam of studentId bij een leerling van deze klas? */
function belongsToClass(s: Submission, cls: Pick<ClassGroup, 'students'>): boolean {
  // Een beschadigde inzending (naam geen tekst) mag de pagina niet laten vallen.
  if (!s.studentId && typeof s.studentName !== 'string') return false;
  return cls.students.some((st) => matchesStudent(s, st));
}

/**
 * Is deze keuze nog zinvol? Voorkomt dat een verwijderde klas (oude
 * sessiewaarde of een verouderde `?klas=`-link) alles laat verdwijnen.
 */
export function isValidClassFilter(filter: string, classIds: string[]): boolean {
  return filter === 'all' || filter === 'none' || classIds.includes(filter);
}

export function readStoredClassFilter(): string | null {
  try {
    return sessionStorage.getItem(RESULTS_CLASS_FILTER_KEY);
  } catch {
    return null;
  }
}

export function writeStoredClassFilter(value: ResultsClassFilter): void {
  try {
    sessionStorage.setItem(RESULTS_CLASS_FILTER_KEY, value);
  } catch {
    // best effort: hoogstens onthoudt de sessie de keuze niet
  }
}
