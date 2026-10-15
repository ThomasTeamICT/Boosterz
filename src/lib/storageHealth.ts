// ── Opslaggezondheid: hoeveel ruimte is er nog, en overleeft ze de vakantie? ─
//
// Alle gebruikersdata van Boosterz staat op het toestel zelf: widgets,
// cursussen, inzendingen en voortgang in localStorage, pdf's en ingeleverde
// bestanden in IndexedDB. Er is geen server, dus geen back-up. Twee dingen
// kunnen die data stilletjes doen verdwijnen:
//
//  1. **Automatisch wissen.** Safari (iOS én macOS) verwijdert met Intelligent
//     Tracking Prevention de volledige opslag van een site na ±7 dagen zonder
//     bezoek. Op een schooltablet betekent één vakantieweek: cursus weg,
//     leerlingwerk weg. Chrome kan bij weinig schijfruimte hetzelfde doen
//     ("eviction"). De enige echte tegenmaatregel in de browser is
//     `navigator.storage.persist()`: opslag die als *persistent* gemarkeerd is,
//     wordt niet automatisch opgeruimd. Die vraag lukt alleen ná echte
//     gebruikersinteractie — vandaar `askPersistenceOnce()` hieronder.
//
//  2. **Quota.** Afbeeldingen worden als data-URL in localStorage bewaard, en
//     localStorage heeft een eigen, kleine limiet (in de praktijk ±5 MB voor de
//     hele origin — los van het veel ruimere quotum dat `estimate()` rapporteert
//     voor IndexedDB en co). Een leerkracht met een echte beeldbibliotheek loopt
//     daar gegarandeerd tegenaan. Daarom meten we beide budgetten apart en
//     waarschuwen we vóórdat een bewaaractie mislukt.
//
// Alles hier is defensief: elke browser-API kan ontbreken of gooien. Geen enkele
// functie mag ooit crashen — zonder deze cijfers moet de app gewoon verder doen.

// ── Types ───────────────────────────────────────────────────────────────────

export interface StorageEstimateInfo {
  usedBytes: number;
  quotaBytes: number;
  /** Percentage van het quotum, op 0,1 nauwkeurig. */
  pct: number;
}

export type WarningLevel = 'ok' | 'warn' | 'critical';

export type PersistenceResult = 'granted' | 'denied' | 'unsupported';

export interface StorageHealth {
  /** Volledige origin (vooral IndexedDB: pdf's en ingeleverde bestanden). */
  estimate: StorageEstimateInfo | null;
  /** Bytes in de wf.*-sleutels van localStorage. */
  lsBytes: number;
  /** Vulling van localStorage t.o.v. het geschatte budget, in procent. */
  lsPct: number;
  /** Het hoogste (dus meest kritieke) van beide percentages. */
  worstPct: number;
  level: WarningLevel;
  /** Is de opslag beveiligd tegen automatisch wissen? */
  persisted: boolean;
}

// ── Drempels ────────────────────────────────────────────────────────────────

/**
 * Praktijkbudget voor localStorage. De standaard schrijft geen limiet voor,
 * maar alle grote browsers hanteren ±5 MB per origin (Chrome/Safari 5 MB,
 * Firefox 10 MB). We rekenen met de laagste: liever te vroeg waarschuwen dan
 * een leerkracht laten vastlopen op een iPad.
 */
export const LOCALSTORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

/**
 * Drempels voor `storageWarningLevel`.
 *
 * - **70 % (warn)** — één widget met een paar foto's is al snel enkele honderden
 *   kB. Vanaf hier is er nog ruimte voor een handvol bewaaracties: genoeg om
 *   rustig te exporteren en op te ruimen. Lager waarschuwen zou ruis zijn.
 * - **85 % (critical)** — vanaf hier kan de eerstvolgende afbeelding de opslag
 *   doen vollopen. Dit is het laatste moment waarop een waarschuwing nog nut
 *   heeft; ze verdient dan ook een plek buiten de privacypagina.
 */
export const WARN_PCT = 70;
export const CRITICAL_PCT = 85;

/** Vlag zodat we de vraag naar persistente opslag hoogstens één keer stellen. */
const ASK_FLAG_KEY = 'wf.storage.persistasked.v1';

// ── Kleine, veilige hulpjes ─────────────────────────────────────────────────

function storageManager(): StorageManager | null {
  try {
    if (typeof navigator === 'undefined') return null;
    const sm = (navigator as Navigator).storage as StorageManager | undefined;
    return sm ?? null;
  } catch {
    return null;
  }
}

function safeGetFlag(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetFlag(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // genegeerd: een vlag niet kunnen bewaren mag nooit iets breken
  }
}

// ── Meten ───────────────────────────────────────────────────────────────────

/**
 * Verbruik en quotum van de hele origin via `navigator.storage.estimate()`.
 * Geeft `null` wanneer de browser de API niet kent (oudere Safari) of geen
 * bruikbaar quotum teruggeeft. Let op: dit quotum is meestal enorm (een deel
 * van de vrije schijf) en zegt weinig over de véél krappere localStorage —
 * daarvoor is `localStoragePct()`.
 */
export async function estimateStorage(): Promise<StorageEstimateInfo | null> {
  try {
    const sm = storageManager();
    if (!sm || typeof sm.estimate !== 'function') return null;
    const est = await sm.estimate();
    const usedBytes = typeof est.usage === 'number' && est.usage >= 0 ? est.usage : 0;
    const quotaBytes = typeof est.quota === 'number' && est.quota > 0 ? est.quota : 0;
    if (!quotaBytes) return null;
    return { usedBytes, quotaBytes, pct: round1((usedBytes / quotaBytes) * 100) };
  } catch {
    return null;
  }
}

/**
 * Som van de eigen sleutels (wf.*) in localStorage, in bytes. Tekens tellen
 * dubbel: browsers bewaren strings als UTF-16. Zo hebben we ook een cijfer
 * wanneer `estimate()` ontbreekt — en het is meteen het cijfer dat er voor
 * afbeeldingen in widgets het meest toe doet.
 */
export function localStorageBytes(): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('wf.')) continue;
      const value = localStorage.getItem(key);
      total += (key.length + (value ? value.length : 0)) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}

export interface StorageSlice {
  label: string;
  bytes: number;
}

/**
 * Grove verdeling van de wf.*-sleutels over herkenbare posten, zodat "ruim op"
 * ook zegt wát er opruimen waard is. Groot en klein staan door elkaar in
 * localStorage; deze indeling volgt de rubrieken van de privacypagina.
 */
export function storageBreakdown(): StorageSlice[] {
  const buckets = new Map<string, number>();
  const add = (label: string, bytes: number) => buckets.set(label, (buckets.get(label) ?? 0) + bytes);
  try {
    if (typeof localStorage === 'undefined') return [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('wf.')) continue;
      const value = localStorage.getItem(key);
      const bytes = (key.length + (value ? value.length : 0)) * 2;
      if (key === 'wf.widgets.v1') add('Oefeningen', bytes);
      else if (key === 'wf.courses.v1') add('Cursussen', bytes);
      else if (key === 'wf.submissions.v1') add('Inzendingen', bytes);
      else if (key === 'wf.courseprogress.v1' || key === 'wf.attempts.v1' || key === 'wf.live.v1') add('Voortgang en pogingen', bytes);
      else if (key === 'wf.classes.v1' || key === 'wf.assignments.v1' || key === 'wf.classpacks.v1' || key === 'wf.student.v1') add('Klassen en opdrachten', bytes);
      else if (key === 'wf.curricula.v1') add('Leerplannen', bytes);
      else if (key.startsWith('wf.autosave.') || key.startsWith('wf.coursenotes.')
        || key.startsWith('wf.coursename.') || key.startsWith('wf.deadline.')) add('Tussentijds werk en notities', bytes);
      else add('Overige (instellingen, AI-logboek…)', bytes);
    }
  } catch {
    return [];
  }
  return [...buckets.entries()]
    .map(([label, bytes]) => ({ label, bytes }))
    .filter((s) => s.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
}

/** Vulling van localStorage t.o.v. het praktijkbudget, in procent (max 100). */
export function localStoragePct(bytes = localStorageBytes()): number {
  return round1(Math.min(100, (bytes / LOCALSTORAGE_BUDGET_BYTES) * 100));
}

/** `'ok'` < 70 % ≤ `'warn'` < 85 % ≤ `'critical'` — zie de drempels hierboven. */
export function storageWarningLevel(pct: number): WarningLevel {
  if (!Number.isFinite(pct)) return 'ok';
  if (pct >= CRITICAL_PCT) return 'critical';
  if (pct >= WARN_PCT) return 'warn';
  return 'ok';
}

/** Eén meting met alles erin, voor de privacypagina en de waarschuwingsbalk. */
export async function readStorageHealth(): Promise<StorageHealth> {
  const [estimate, persisted] = await Promise.all([estimateStorage(), isPersisted()]);
  const lsBytes = localStorageBytes();
  const lsPct = localStoragePct(lsBytes);
  const worstPct = Math.max(lsPct, estimate ? estimate.pct : 0);
  return { estimate, lsBytes, lsPct, worstPct, level: storageWarningLevel(worstPct), persisted };
}

// ── Beveiligen tegen automatisch wissen ─────────────────────────────────────

/** Staat de opslag van deze site al als persistent gemarkeerd? */
export async function isPersisted(): Promise<boolean> {
  try {
    const sm = storageManager();
    if (!sm || typeof sm.persisted !== 'function') return false;
    return (await sm.persisted()) === true;
  } catch {
    return false;
  }
}

/**
 * Vraagt persistente opslag aan. Dit is de échte mitigatie tegen het
 * automatisch wissen door Safari/ITP en tegen eviction bij weinig schijfruimte.
 *
 * Browsers beslissen zelf: Chrome kijkt naar "engagement" (bezoekfrequentie,
 * bladwijzer, app geïnstalleerd), Firefox toont een toestemmingsvraag, Safari
 * kent de API niet altijd. Daarom mag `'denied'` nooit als een fout aanvoelen —
 * het is gewoon een browser die nee zegt.
 */
export async function requestPersistence(): Promise<PersistenceResult> {
  try {
    const sm = storageManager();
    if (!sm || typeof sm.persist !== 'function') return 'unsupported';
    if (await isPersisted()) return 'granted';
    return (await sm.persist()) === true ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

// Eigen "is er al geklikt?"-vlag: `navigator.userActivation` bestaat niet in
// oudere browsers, en juist daar mogen we de vraag niet stil bij het opstarten
// stellen (de voorbeeldwidgets worden bij het allereerste bezoek automatisch
// bewaard — dat is géén gebruikersinteractie).
let sawUserGesture = false;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  try {
    const mark = () => { sawUserGesture = true; };
    window.addEventListener('pointerdown', mark, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', mark, { once: true, capture: true, passive: true });
  } catch {
    // genegeerd: zonder deze vlag valt alles terug op navigator.userActivation
  }
}

function hasUserActivation(): boolean {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    if (ua && typeof ua.hasBeenActive === 'boolean' && ua.hasBeenActive) return true;
  } catch {
    // genegeerd: we vallen terug op onze eigen vlag
  }
  return sawUserGesture;
}

/** Is de vraag al eens gesteld? (En zo ja, met welke uitkomst?) */
export function persistenceAskState(): PersistenceResult | null {
  const raw = safeGetFlag(ASK_FLAG_KEY);
  return raw === 'granted' || raw === 'denied' || raw === 'unsupported' ? raw : null;
}

/**
 * Vraagt hoogstens één keer per toestel persistente opslag aan, en alleen
 * wanneer er al echte interactie was. Geeft `'skipped'` wanneer er niets
 * gebeurd is (al eens gevraagd, of nog geen klik/toetsaanslag) — dan blijft de
 * vraag gewoon open staan voor een volgende bewaaractie.
 */
export async function askPersistenceOnce(): Promise<PersistenceResult | 'skipped'> {
  if (persistenceAskState()) return 'skipped';
  if (!hasUserActivation()) return 'skipped';
  const result = await requestPersistence();
  // Nogmaals controleren: twee bewaaracties vlak na elkaar mogen niet twee
  // keer vragen (de await hierboven laat ruimte voor een tweede oproep).
  if (persistenceAskState()) return 'skipped';
  safeSetFlag(ASK_FLAG_KEY, result);
  return result;
}

/** Onthoudt de uitkomst van een handmatige aanvraag (knop op de privacypagina). */
export function rememberPersistenceResult(result: PersistenceResult) {
  safeSetFlag(ASK_FLAG_KEY, result);
  if (result === 'granted') clearBackupHint();
}

// ── Meldingen naar de UI ────────────────────────────────────────────────────

/**
 * Piepklein event-busje. De opslaglaag (storage.ts) draait buiten React, maar
 * een mislukte schrijfactie mag niet in de console blijven hangen: de schil
 * (Layout) luistert hierop en toont de melding. Is er niemand die luistert —
 * bijvoorbeeld in de leerlingweergave, die de leerkrachtschil niet laadt — dan
 * valt storage.ts terug op een `alert()`, zodat falen nooit stil is.
 */
export interface StorageNotice {
  kind: 'quota' | 'write-failed' | 'persist-denied';
  /** Nederlandse tekst, klaar om te tonen. */
  message: string;
  /** true = data ging verloren; toon als fout, niet als tip. */
  severe: boolean;
  at: number;
}

type NoticeListener = (notice: StorageNotice) => void;
const noticeListeners = new Set<NoticeListener>();

/** Abonneren op opslagmeldingen. Geeft een opzegfunctie terug. */
export function onStorageNotice(fn: NoticeListener): () => void {
  noticeListeners.add(fn);
  return () => { noticeListeners.delete(fn); };
}

/** Aantal luisteraars — zodat storage.ts weet of een fallback nodig is. */
export function hasStorageNoticeListeners(): boolean {
  return noticeListeners.size > 0;
}

/**
 * Back-uphint na een geweigerde (of niet-ondersteunde) bescherming. Die hint
 * mag niet verloren gaan doordat de app meteen doorspringt naar de editor —
 * die route valt buiten de leerkrachtschil. Daarom parkeren we hem in een vlag
 * tot de gebruiker hem wegklikt: één keer tonen, en dan nooit meer zeuren.
 */
export const BACKUP_HINT_MESSAGE =
  'Deze browser beschermt de opslag niet tegen automatisch wissen. Exporteer je oefeningen en cursussen af en toe als bestand — dat is je enige back-up.';

const BACKUP_HINT_KEY = 'wf.storage.backuphint.v1';

export function markBackupHint() {
  safeSetFlag(BACKUP_HINT_KEY, '1');
}

export function clearBackupHint() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(BACKUP_HINT_KEY);
  } catch {
    // genegeerd: dan verschijnt de hint hoogstens nog één keer
  }
}

/** De openstaande back-uphint, of null wanneer er geen is. */
export function pendingBackupHint(): StorageNotice | null {
  if (safeGetFlag(BACKUP_HINT_KEY) !== '1') return null;
  return { kind: 'persist-denied', message: BACKUP_HINT_MESSAGE, severe: false, at: Date.now() };
}

export function emitStorageNotice(notice: StorageNotice) {
  noticeListeners.forEach((fn) => {
    try {
      fn(notice);
    } catch {
      // genegeerd: één kapotte luisteraar mag de rest niet blokkeren
    }
  });
}

// ── Weergave ────────────────────────────────────────────────────────────────

/** Bytes leesbaar maken in het Nederlands (1,4 MB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 kB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${nl(Math.round(kb))} kB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${nl(round1(mb))} MB`;
  return `${nl(round1(mb / 1024))} GB`;
}

/** Percentage leesbaar maken (0,4 % of 87 %). */
export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '0 %';
  return `${nl(pct < 10 ? round1(pct) : Math.round(pct))} %`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function nl(n: number): string {
  try {
    return n.toLocaleString('nl-BE');
  } catch {
    return String(n);
  }
}
