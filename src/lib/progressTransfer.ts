import type { ItemScore, Submission } from './types';
import { getSubmissions, saveSubmission } from './storage';
import { uid } from './utils';
import { inlineMedia } from './mediaStore';

/**
 * Voortgang meenemen naar een ander toestel (klas-pc ↔ thuis).
 *
 * De inzendingen leven per toestel in localStorage; met een klein JSON-bestand
 * kan een leerling zijn eigen pogingen exporteren en elders weer importeren.
 * Er is bewust géén server: het bestand is van de leerling zelf.
 */

const KIND = 'voortgang';

interface ProgressFile {
  app: 'boosterz';
  kind: typeof KIND;
  v: 1;
  naam: string;
  /** ISO-datum van export. */
  datum: string;
  submissions: Submission[];
}

/**
 * Alle inzendingen van deze naam (hoofdletterongevoelig) als downloadbaar JSON.
 * Async: tekeningen en ingeleverde afbeeldingen staan in IndexedDB en gaan als
 * data-URL mee (lib/mediaStore), anders zijn ze op het andere toestel weg.
 */
export async function exportProgress(studentName: string): Promise<string> {
  const naam = studentName.trim();
  const key = naam.toLowerCase();
  const submissions = getSubmissions().filter(
    (s) => s.studentName.trim().toLowerCase() === key
  );
  const file: ProgressFile = {
    app: 'boosterz',
    kind: KIND,
    v: 1,
    naam,
    datum: new Date().toISOString(),
    submissions: await inlineMedia(submissions),
  };
  return JSON.stringify(file, null, 2);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitizeItemScore(v: unknown): ItemScore | null {
  if (!isPlainObject(v)) return null;
  if (!finite(v.earned) || !finite(v.max)) return null;
  if (v.mode !== 'auto' && v.mode !== 'manual' && v.mode !== 'pending') return null;
  return {
    earned: v.earned,
    max: v.max,
    mode: v.mode,
    ...(typeof v.comment === 'string' ? { comment: v.comment } : {}),
  };
}

/**
 * Inzending uit een resultaatcode of voortgangsbestand defensief saneren
 * (KL2): een geknutselde of beschadigde inzending mag nooit de verwerking of
 * een resultatenscherm laten crashen, en er komt niets ongetypt in de opslag.
 * Verplicht: widgetId en studentName (niet leeg), antwoorden als gewoon
 * object en een eindig indienmoment; al de rest krijgt een getypte
 * standaardwaarde. Ongeldige scores per vraag vallen weg. Geeft null terug als
 * de inzending onbruikbaar is.
 *
 * Staat hier (en niet in lib/share.ts) omdat share.ts op het kritieke
 * leerlingpad zit; dit bestand wordt pas geladen bij het inleverpunt of de
 * voortgangsimport. decodeSubmission (share.ts) doet een compacte
 * crashbewaking; het inleverpunt haalt elke code daarna nog hierdoor.
 */
export function sanitizeSubmission(raw: unknown): Submission | null {
  if (!isPlainObject(raw)) return null;
  const widgetId = typeof raw.widgetId === 'string' ? raw.widgetId.trim() : '';
  const studentName = typeof raw.studentName === 'string' ? raw.studentName.trim().slice(0, 80) : '';
  if (!widgetId || !studentName) return null;
  if (!isPlainObject(raw.answers)) return null;
  if (!finite(raw.submittedAt)) return null;

  let itemScores: Record<string, ItemScore> | null = null;
  if (isPlainObject(raw.itemScores)) {
    const out: Record<string, ItemScore> = {};
    let n = 0;
    for (const [key, val] of Object.entries(raw.itemScores)) {
      // "__proto__" als sleutel zou bij toewijzen het prototype wijzigen.
      if (key === '__proto__') continue;
      const score = sanitizeItemScore(val);
      if (!score) continue;
      out[key] = score;
      n++;
    }
    itemScores = n > 0 ? out : null;
  }

  const sub: Submission = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : uid(),
    widgetId,
    widgetCode: typeof raw.widgetCode === 'string' ? raw.widgetCode : '',
    studentName,
    startedAt: finite(raw.startedAt) ? raw.startedAt : raw.submittedAt,
    submittedAt: raw.submittedAt,
    durationSec: finite(raw.durationSec) && raw.durationSec >= 0 ? raw.durationSec : 0,
    answers: raw.answers,
    itemScores,
    totalEarned: finite(raw.totalEarned) ? raw.totalEarned : 0,
    totalMax: finite(raw.totalMax) && raw.totalMax >= 0 ? raw.totalMax : 0,
    status: raw.status === 'graded' ? 'graded' : 'submitted',
  };
  if (typeof raw.teacherFeedback === 'string') sub.teacherFeedback = raw.teacherFeedback;
  if (finite(raw.focusLosses) && raw.focusLosses >= 0) sub.focusLosses = raw.focusLosses;
  if (typeof raw.classId === 'string' && raw.classId) sub.classId = raw.classId;
  if (typeof raw.studentId === 'string' && raw.studentId) sub.studentId = raw.studentId;
  return sub;
}

/**
 * Sleutel om dubbele pogingen te herkennen (zelfde widget, naam en
 * indienmoment). Ook gebruikt door lib/inbox.ts: het inleverpunt ontdubbelt
 * geplakte en gescande resultaatcodes op exact dezelfde manier.
 */
export function submissionDupKey(widgetId: unknown, studentName: unknown, submittedAt: unknown): string {
  return `${String(widgetId)}::${String(studentName).trim().toLowerCase()}::${String(submittedAt)}`;
}


/**
 * Leest een voortgangsbestand defensief in en bewaart alleen de pogingen die
 * hier nog niet staan (dubbele worden herkend op widget + naam + indienmoment,
 * zowel tegenover de bestaande opslag als binnen het bestand zelf).
 * Geeft null terug wanneer het geen geldig voortgangsbestand is.
 */
export function importProgress(json: string): { naam: string; imported: number } | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || data.kind !== KIND) return null;
    if (!Array.isArray(data.submissions)) return null;

    const bestaand = getSubmissions();
    const bestaandeIds = new Set(bestaand.map((s) => s.id));
    const gezien = new Set(bestaand.map((s) => submissionDupKey(s.widgetId, s.studentName, s.submittedAt)));

    let imported = 0;
    let eersteNaam = '';
    for (const raw of data.submissions as unknown[]) {
      const s = raw as Record<string, unknown> | null;
      if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
      // Zelfde sanering als resultaatcodes (lib/share.ts): widgetId,
      // studentName en answers moeten kloppen, de rest krijgt getypte
      // standaardwaarden. Een ouder bestand zonder indienmoment blijft
      // inleesbaar (zoals vroeger: dan telt "nu").
      const sub = sanitizeSubmission({
        ...s,
        submittedAt: typeof s.submittedAt === 'number' && Number.isFinite(s.submittedAt) ? s.submittedAt : Date.now(),
      });
      if (!sub) continue;

      const key = submissionDupKey(sub.widgetId, sub.studentName, s.submittedAt);
      if (gezien.has(key)) continue;
      gezien.add(key);

      // origineel id behouden, tenzij dat hier al bestaat (dan een nieuw id)
      if (bestaandeIds.has(sub.id)) sub.id = uid();
      if (saveSubmission(sub) === false) continue;
      bestaandeIds.add(sub.id);
      imported++;
      if (!eersteNaam) eersteNaam = sub.studentName.trim();
    }

    const naam =
      typeof data.naam === 'string' && data.naam.trim() ? data.naam.trim() : eersteNaam;
    return { naam, imported };
  } catch {
    return null;
  }
}
