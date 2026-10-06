// Opslaan & hervatten: antwoorden van een leerling tussentijds bewaren zodat
// een herlaad/stroomonderbreking geen werk kost.
//
// Tekeningen en audio-opnames zitten als data-URL in de antwoorden en zouden
// hier elke seconde opnieuw als megabytes base64 weggeschreven worden. Daarom
// lopen ook deze sleutels door de medialaag (lib/mediaStore): de migratie
// verhuist ze naar IndexedDB en de replacer schrijft daarna de verwijzing.
//
// Ingeleverde bestanden (upload-vraag) staan als Blob in IndexedDB; het
// antwoord bevat alleen { name, size, fileId }. Verloopt een tussentijdse
// opslag, dan gaan die bestanden mee weg (zie expireProgress). Tekeningen en
// opnames ruimt de opstartopruiming van de medialaag al op.

import { AUTOSAVE_PREFIX, parseWithMedia, stringifyWithMedia } from './mediaStore';

interface AutosaveData {
  answers: Record<string, unknown>;
  idx: number;
  savedAt: number;
  /** Vraag-ids in de getoonde volgorde, zodat schudden/vragenpool stabiel hervat. */
  order?: string[];
  /** Status van getrapte controle per vraag, zodat gecheckte vragen vergrendeld blijven. */
  step?: Record<string, 'retry' | 'locked'>;
}

/** Na zoveel tijd zonder bewaren vervalt tussentijds werk. */
export const AUTOSAVE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const key = (widgetId: string, studentName: string) =>
  `${AUTOSAVE_PREFIX}${widgetId}.${studentName.trim().toLowerCase()}`;

export function saveProgress(
  widgetId: string,
  studentName: string,
  answers: Record<string, unknown>,
  idx: number,
  order?: string[],
  step?: Record<string, 'retry' | 'locked'>
) {
  try {
    localStorage.setItem(key(widgetId, studentName), stringifyWithMedia({ answers, idx, order, step, savedAt: Date.now() } satisfies AutosaveData));
  } catch {
    // opslag vol — stil negeren, autosave is best-effort
  }
}

export function loadProgress(widgetId: string, studentName: string): AutosaveData | null {
  try {
    const k = key(widgetId, studentName);
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const data = parseWithMedia<AutosaveData>(raw);
    // ouder dan 7 dagen → weggooien, met de ingeleverde bestanden erbij
    if (Date.now() - data.savedAt > AUTOSAVE_MAX_AGE_MS) {
      expireProgress(k, raw);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function hasProgress(widgetId: string, studentName: string): boolean {
  return loadProgress(widgetId, studentName) !== null;
}

/**
 * Tussentijds werk wissen (na indienen of "Opnieuw beginnen"). Ruimt bewust
 * GEEN bestanden op: na het indienen verwijst de inzending naar hetzelfde
 * fileId, en dat bestand moet blijven.
 */
export function clearProgress(widgetId: string, studentName: string) {
  try {
    localStorage.removeItem(key(widgetId, studentName));
  } catch {
    // negeren
  }
}

/** De laatst gestarte opruiming na het verlopen (voor tests). */
export let expiredFilesCleanup: Promise<void> = Promise.resolve();

/**
 * Verlopen tussentijds werk weg, met de ingeleverde bestanden die alleen
 * daarin voorkwamen (OP13, debugronde oktober 2026). Een bestand waar nog
 * iets anders naar verwijst, blijft: de leerling kan na het uploaden toch
 * ingediend hebben, en dan hoort het bij die inzending. Het opruimen zelf
 * wordt pas geladen als er een bestand in zit: deze module staat op het
 * kritieke leerlingpad (PlayerPage).
 */
function expireProgress(k: string, raw: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    return; // kon niet wissen: dan ook de bestanden laten staan
  }
  if (!raw.includes('"fileId"')) return;
  expiredFilesCleanup = import('./leerlingWissen')
    .then((m) => m.cleanupExpiredAutosaveFiles(raw))
    .catch(() => { /* best-effort: de opslag blijft bruikbaar */ });
}
