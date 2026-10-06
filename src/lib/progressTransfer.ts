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

// ── Grenzen (S2) ────────────────────────────────────────────────────────────

/**
 * Grenzen voor één inzending uit een code of voortgangsbestand. Een code van
 * enkele kB pakt uit tot megabytes: zonder grens vult één geknutselde code de
 * opslag van ±5 MB, waarna het bewaren van echt werk mislukt (S2). De grenzen
 * liggen ruim boven wat de app zelf maakt: een tekening is een jpeg van
 * enkele honderden kB, een opname van 60 s ruim 1 MB, een lang antwoord
 * enkele kB.
 *
 * Tekst telt apart van ingebedde afbeeldingen en opnames (data-URL's): die
 * verhuizen naar IndexedDB (lib/mediaStore) en vullen de kleine opslag niet
 * blijvend, gewone tekst blijft in localStorage staan en doet dat wel.
 * De grenzen gelden per inzending; ze beperken niet hoeveel inzendingen een
 * leerkracht in één keer inleest.
 */
export const SUBMISSION_LIMITS = {
  /** Tekst in de antwoorden (waarden en sleutels, zonder data-URL's), in tekens. */
  answersText: 1_000_000,
  /** Eén ingebedde afbeelding of opname (data-URL), in tekens. */
  mediaEach: 8_000_000,
  /** Alle ingebedde afbeeldingen en opnames samen, in tekens. */
  mediaTotal: 24_000_000,
  mediaCount: 100,
  /** Aantal waarden in de antwoorden (alle niveaus samen) en hun diepte. */
  answersNodes: 200_000,
  answersDepth: 12,
  /** Aantal vragen met een eigen antwoord of score. */
  items: 2_000,
  /** Lengte van een sleutel (vraag-id) in itemScores. */
  itemKey: 200,
  id: 100,
  widgetId: 200,
  widgetCode: 40,
  /** classId en studentId. */
  ref: 200,
  teacherFeedback: 20_000,
  /** Opmerking bij één vraag. */
  comment: 5_000,
  /** Feedback van de leerkracht en alle opmerkingen samen. */
  feedbackTotal: 200_000,
} as const;

const L = SUBMISSION_LIMITS;

const MEDIA_DATA_URL = /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9.+=-]+)*;base64,[A-Za-z0-9+/=]*$/i;

const TE_VEEL =
  'Niet bewaard: deze code bevat veel meer antwoorden of tekst dan een leerling normaal indient.';
const TE_GROOT_MEDIA =
  'Niet bewaard: een afbeelding of opname in deze code is veel groter dan de app zelf maakt.';
const TE_LANG_VELD =
  'Niet bewaard: een tekstveld in deze code (feedback, opmerking, code of id) is veel te lang.';

/** Telt de antwoorden na tegen de grenzen; geeft de reden terug of null. */
function antwoordenTeGroot(answers: unknown): string | null {
  if (!isPlainObject(answers)) return null;
  if (Object.keys(answers).length > L.items) return TE_VEEL;
  let tekst = 0;
  let media = 0;
  let stuks = 0;
  let knopen = 0;
  // Iteratief: een geknutselde, diep geneste code mag de stapel niet laten overlopen.
  const stapel: Array<[unknown, number]> = [[answers, 0]];
  while (stapel.length > 0) {
    const [v, diepte] = stapel.pop() as [unknown, number];
    knopen++;
    if (knopen > L.answersNodes) return TE_VEEL;
    if (typeof v === 'string') {
      if (v.startsWith('data:') && MEDIA_DATA_URL.test(v)) {
        stuks++;
        media += v.length;
        if (v.length > L.mediaEach || media > L.mediaTotal || stuks > L.mediaCount) return TE_GROOT_MEDIA;
      } else {
        tekst += v.length + 2;
      }
    } else if (Array.isArray(v)) {
      if (diepte >= L.answersDepth || knopen + v.length > L.answersNodes) return TE_VEEL;
      tekst += v.length + 2;
      for (const x of v) stapel.push([x, diepte + 1]);
    } else if (isPlainObject(v)) {
      const sleutels = Object.keys(v);
      if (diepte >= L.answersDepth || knopen + sleutels.length > L.answersNodes) return TE_VEEL;
      tekst += 2;
      for (const k of sleutels) {
        tekst += k.length + 4;
        stapel.push([v[k], diepte + 1]);
      }
    } else {
      tekst += 6; // getal, waar/onwaar of null
    }
    if (tekst > L.answersText) return TE_VEEL;
  }
  return null;
}

/**
 * Is deze (nog ongesaneerde) inzending veel groter dan de app zelf maakt?
 * Geeft dan de reden terug, in woorden voor de leerkracht; anders null.
 * sanitizeSubmission weigert zulke inzendingen (S2): er komt niets van in de
 * opslag. Voor een eerlijke melding bij het inleverpunt en de voortgangsimport.
 */
export function submissionTooLarge(raw: unknown): string | null {
  if (!isPlainObject(raw)) return null;
  const velden: Array<[unknown, number]> = [
    [raw.id, L.id], [raw.widgetId, L.widgetId], [raw.widgetCode, L.widgetCode],
    [raw.classId, L.ref], [raw.studentId, L.ref], [raw.teacherFeedback, L.teacherFeedback],
  ];
  for (const [waarde, max] of velden) {
    if (typeof waarde === 'string' && waarde.length > max) return TE_LANG_VELD;
  }
  let feedback = typeof raw.teacherFeedback === 'string' ? raw.teacherFeedback.length : 0;
  if (isPlainObject(raw.itemScores)) {
    const sleutels = Object.keys(raw.itemScores);
    if (sleutels.length > L.items) return TE_VEEL;
    for (const k of sleutels) {
      if (k.length > L.itemKey) return TE_LANG_VELD;
      const score = raw.itemScores[k];
      const comment = isPlainObject(score) ? score.comment : undefined;
      if (typeof comment === 'string') {
        if (comment.length > L.comment) return TE_LANG_VELD;
        feedback += comment.length;
      }
    }
  }
  if (feedback > L.feedbackTotal) return TE_LANG_VELD;
  return antwoordenTeGroot(raw.answers);
}

// ── Meta-antwoorden (S4) ────────────────────────────────────────────────────

/** Gewone tekstwaarden uit een object (geen "__proto__"), of null als er geen zijn. */
function stringRecord(v: unknown): Record<string, string> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [key, val] of Object.entries(v)) {
    if (key === '__proto__' || typeof val !== 'string') continue;
    out[key] = val;
    n++;
  }
  return n > 0 ? out : null;
}

/** Een css-kleur zoals de app ze maakt (#ffd54f, rgb(…), hsl(…) of een naam), geen url(). */
function isKleur(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && /^[#a-z0-9(),.%\s-]+$/i.test(v);
}

function sanitizeDoel(v: unknown): { proces?: string; streef?: number; vrij?: string } | null {
  if (!isPlainObject(v)) return null;
  const out: { proces?: string; streef?: number; vrij?: string } = {};
  if (typeof v.proces === 'string') out.proces = v.proces;
  if (finite(v.streef)) out.streef = v.streef;
  if (typeof v.vrij === 'string') out.vrij = v.vrij;
  return Object.keys(out).length > 0 ? out : null;
}

function sanitizeFoutenanalyse(v: unknown): { volgendeKeer?: string; labels?: Record<string, string> } | null {
  if (!isPlainObject(v)) return null;
  const out: { volgendeKeer?: string; labels?: Record<string, string> } = {};
  if (typeof v.volgendeKeer === 'string') out.volgendeKeer = v.volgendeKeer;
  if (isPlainObject(v.labels)) out.labels = stringRecord(v.labels) ?? {};
  return Object.keys(out).length > 0 ? out : null;
}

type Markering = { id: string; page: number; spans: number[]; color: string; text: string };

function sanitizeHighlights(v: unknown): Markering[] | null {
  if (!Array.isArray(v)) return null;
  const out: Markering[] = [];
  for (const h of v) {
    if (!isPlainObject(h)) continue;
    if (typeof h.id !== 'string' || !h.id || !finite(h.page) || !isKleur(h.color) || typeof h.text !== 'string') continue;
    const spans = Array.isArray(h.spans) ? h.spans.filter(finite) : [];
    out.push({ id: h.id, page: h.page, spans, color: h.color, text: h.text });
  }
  return out.length > 0 ? out : null;
}

/**
 * Saneert de meta-antwoorden die de spelers naast de antwoorden per vraag
 * meegeven (S4): ze hebben een vaste vorm en de resultatenpagina toont ze
 * rechtstreeks. Een veld met het verkeerde type valt weg, van een object
 * blijven alleen de bekende velden over. Zo kan een geknutselde code
 * (`_doelreflectie` als object, `_hints: [1, 2]`) het detail niet laten
 * crashen. De antwoorden per vraag en onbekende sleutels blijven zoals ze zijn.
 *
 * Meta-velden: `_doel`, `_doelreflectie`, `_foutenanalyse`, `_hints`,
 * `_zekerheid`, `_route` en `_sourceHighlights`.
 */
export function sanitizeMetaAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(answers)) return {};
  // Een spread maakt van een eigen "__proto__"-sleutel (uit JSON.parse) een gewone eigenschap.
  const out: Record<string, unknown> = { ...answers };
  const zet = (sleutel: string, waarde: unknown) => {
    if (waarde === null || waarde === undefined) delete out[sleutel];
    else out[sleutel] = waarde;
  };
  if ('_doel' in answers) zet('_doel', sanitizeDoel(answers._doel));
  if ('_doelreflectie' in answers && typeof answers._doelreflectie !== 'string') delete out._doelreflectie;
  if ('_foutenanalyse' in answers) zet('_foutenanalyse', sanitizeFoutenanalyse(answers._foutenanalyse));
  if ('_hints' in answers) {
    const hints = Array.isArray(answers._hints) ? answers._hints.filter((h): h is string => typeof h === 'string') : [];
    zet('_hints', hints.length > 0 ? hints : null);
  }
  if ('_zekerheid' in answers) zet('_zekerheid', stringRecord(answers._zekerheid));
  if ('_route' in answers && !finite(answers._route)) delete out._route;
  if ('_sourceHighlights' in answers) zet('_sourceHighlights', sanitizeHighlights(answers._sourceHighlights));
  return out;
}

/**
 * Inzending uit een resultaatcode of voortgangsbestand defensief saneren
 * (KL2): een geknutselde of beschadigde inzending mag nooit de verwerking of
 * een resultatenscherm laten crashen, en er komt niets ongetypt in de opslag.
 * Verplicht: widgetId en studentName (niet leeg), antwoorden als gewoon
 * object en een eindig indienmoment; al de rest krijgt een getypte
 * standaardwaarde. Ongeldige scores per vraag vallen weg, en de meta-antwoorden
 * (`_doelreflectie`, `_hints` …) krijgen hun vaste vorm (zie sanitizeMetaAnswers,
 * S4). Geeft null terug als de inzending onbruikbaar is, ook als ze veel groter
 * is dan de app zelf maakt (zie SUBMISSION_LIMITS, S2).
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
  if (submissionTooLarge(raw)) return null;

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
    answers: sanitizeMetaAnswers(raw.answers),
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


/** Wat het inlezen van een voortgangsbestand opleverde. */
export interface ProgressImportResult {
  naam: string;
  /** Bewaarde pogingen. */
  imported: number;
  /** Pogingen die bewaard hadden moeten worden maar niet lukten (volle opslag). */
  mislukt: number;
  /** Pogingen die niet bewaard zijn omdat ze veel groter zijn dan de app zelf maakt (S2). */
  teGroot: number;
}

/**
 * Leest een voortgangsbestand defensief in en bewaart alleen de pogingen die
 * hier nog niet staan (dubbele worden herkend op widget + naam + indienmoment,
 * zowel tegenover de bestaande opslag als binnen het bestand zelf).
 * Een poging die niet bewaard kon worden (volle opslag) telt als `mislukt`,
 * niet als "stond hier al". Geeft null terug wanneer het geen geldig
 * voortgangsbestand is.
 */
export function importProgress(json: string): ProgressImportResult | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || data.kind !== KIND) return null;
    if (!Array.isArray(data.submissions)) return null;

    const bestaand = getSubmissions();
    const bestaandeIds = new Set(bestaand.map((s) => s.id));
    const gezien = new Set(bestaand.map((s) => submissionDupKey(s.widgetId, s.studentName, s.submittedAt)));

    let imported = 0;
    let mislukt = 0;
    let teGroot = 0;
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
      if (!sub) {
        if (submissionTooLarge(s)) teGroot++;
        continue;
      }

      const key = submissionDupKey(sub.widgetId, sub.studentName, s.submittedAt);
      if (gezien.has(key)) continue;
      gezien.add(key);

      // origineel id behouden, tenzij dat hier al bestaat (dan een nieuw id)
      if (bestaandeIds.has(sub.id)) sub.id = uid();
      if (saveSubmission(sub) === false) {
        mislukt++;
        continue;
      }
      bestaandeIds.add(sub.id);
      imported++;
      if (!eersteNaam) eersteNaam = sub.studentName.trim();
    }

    const naam =
      typeof data.naam === 'string' && data.naam.trim() ? data.naam.trim() : eersteNaam;
    return { naam, imported, mislukt, teGroot };
  } catch {
    return null;
  }
}

/**
 * De melding voor de leerling na het inlezen van een voortgangsbestand: wat
 * bewaard is, wat niet lukte omdat de opslag vol is, en wat te groot was.
 * "Alles stond hier al" alleen als er echt niets mis ging.
 */
export function describeProgressImport(res: ProgressImportResult): { text: string; kind: 'ok' | 'info' | 'err' } {
  const delen: string[] = [];
  if (res.imported > 0) {
    delen.push(`${res.imported} poging${res.imported === 1 ? '' : 'en'}${res.naam ? ` van ${res.naam}` : ''} geïmporteerd`);
  }
  if (res.mislukt > 0) {
    delen.push(
      `${res.mislukt} ${res.mislukt === 1 ? 'poging' : 'pogingen'} niet bewaard: de opslag van dit toestel is vol`
    );
  }
  if (res.teGroot > 0) {
    delen.push(
      `${res.teGroot} ${res.teGroot === 1 ? 'poging' : 'pogingen'} overgeslagen omdat ze veel te groot zijn`
    );
  }
  if (delen.length === 0) return { text: 'Geen nieuwe pogingen gevonden — alles stond hier al', kind: 'info' };
  const problemen = res.mislukt > 0 || res.teGroot > 0;
  const hint = res.mislukt > 0 ? '. Maak ruimte vrij en lees het bestand opnieuw in: wat al bewaard is, blijft staan' : '';
  return { text: delen.join(', ') + hint, kind: problemen ? 'err' : 'ok' };
}

/**
 * De melding na het invoeren van voortgangscodes bij een cursus (volgpagina).
 * `mislukt` zijn codes die goed gelezen werden maar niet bewaard konden worden
 * (volle opslag): ze tellen niet als ingevoerd (G8).
 */
export function voortgangscodesMelding(
  t: { ok: number; invalid: number; other: number; mislukt: number }
): { text: string; kind: 'ok' | 'err' } {
  const delen = [`${t.ok} ingevoerd`];
  if (t.mislukt) delen.push(`${t.mislukt} niet bewaard: de opslag van dit toestel is vol`);
  if (t.invalid) delen.push(`${t.invalid} ongeldig`);
  if (t.other) delen.push(`${t.other} hoorde bij een andere cursus`);
  return { text: delen.join(', '), kind: t.ok > 0 && t.mislukt === 0 ? 'ok' : 'err' };
}
