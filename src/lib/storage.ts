import type { Folder, Submission, Widget } from './types';
import {
  askPersistenceOnce, emitStorageNotice, hasStorageNoticeListeners, markBackupHint, pendingBackupHint,
} from './storageHealth';
import { collectMediaRefs, onMediaChange, parseWithMedia, prefetchMediaRefs, pruneOrphanMedia, stringifyWithMedia } from './mediaStore';

// ── Eenvoudige localStorage-laag met change-events ──────────────────────────

const KEYS = {
  widgets: 'wf.widgets.v1',
  folders: 'wf.folders.v1',
  submissions: 'wf.submissions.v1',
  prefs: 'wf.prefs.v1',
  attempts: 'wf.attempts.v1', // pogingen per widget per leerlingnaam
  live: 'wf.live.v1', // wie is er (op dit toestel) aan het werk
} as const;

type Listener = () => void;
const listeners = new Set<Listener>();

export function onStorageChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

/** Voor andere opslagmodules (bv. cursussen) om dezelfde luisteraars te verwittigen. */
export function notifyChange() {
  emit();
}

// Ook wijzigingen uit ándere tabbladen doorgeven (bv. leerling dient in op
// hetzelfde toestel) zodat dashboards en resultaten live verversen.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('wf.')) return;
    // Nieuwe afbeeldingen uit het andere tabblad alvast ophalen (zie mediaStore).
    if (e.newValue) prefetchMediaRefs(e.newValue);
    emit();
  });
}
// Media die op de achtergrond bijgeladen of verhuisd is (zie lib/mediaStore):
// dan leest de UI opnieuw en krijgt ze blob:-URL's in plaats van verwijzingen.
onMediaChange(emit);

// Lezen en schrijven lopen door de medialaag: afbeeldingen, audio en bijlagen
// staan als "wfmedia:…"-verwijzing in localStorage en als blob:-URL in het
// geheugen (zie lib/mediaStore.ts). Voor de rest van de app is dat onzichtbaar.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseWithMedia<T>(raw) : fallback;
  } catch {
    return fallback;
  }
}
// ── Mislukt opslaan mag nooit stil zijn ─────────────────────────────────────
// Bij een volle opslag verdwijnt de wijziging zonder dat de gebruiker iets
// merkt: het scherm toont nog de nieuwe tekst, de opslag de oude. Daarom
// melden we elke mislukte schrijfactie via het busje in storageHealth (de
// leerkrachtschil toont ze als balk). Luistert er niemand — de leerling-
// weergave laadt die schil niet — dan valt het terug op een alert().

const QUOTA_MESSAGE =
  'De opslag van dit toestel is vol. Exporteer je materiaal en ruim oude inzendingen op — je laatste wijziging is niet bewaard.';
const WRITE_FAIL_MESSAGE =
  'Bewaren op dit toestel is mislukt — je laatste wijziging is niet bewaard. Staat de browser misschien in privémodus of blokkeert ze opslag?';

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: unknown; code?: unknown };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Firefox
    err.code === 22 || // oudere WebKit/Blink
    err.code === 1014 // oudere Firefox
  );
}

// Autosave probeert het gerust elke seconde opnieuw: hoogstens één melding
// per 8 seconden, anders krijgt de gebruiker een lawine (of erger: alerts).
let lastFailureReport = 0;

/**
 * Meldt een mislukte schrijfactie via het meldingenbusje (of als laatste
 * redmiddel een alert). Ook gebruikt door lib/courses.ts, dat een eigen
 * write() heeft maar dezelfde meldweg hoort te volgen.
 */
export function reportWriteFailure(key: string, e: unknown) {
  console.error(`Opslaan mislukt (${key})`, e);
  const now = Date.now();
  if (now - lastFailureReport < 8000) return;
  lastFailureReport = now;
  const message = isQuotaError(e) ? QUOTA_MESSAGE : WRITE_FAIL_MESSAGE;
  if (hasStorageNoticeListeners()) {
    emitStorageNotice({ kind: isQuotaError(e) ? 'quota' : 'write-failed', message, severe: true, at: now });
    return;
  }
  try {
    alert(message);
  } catch {
    // genegeerd: zelfs zonder alert staat de fout in de console
  }
}

/** Schrijft weg; geeft false terug wanneer er niets bewaard is. */
function write(key: string, value: unknown): boolean {
  let ok = true;
  try {
    localStorage.setItem(key, stringifyWithMedia(value));
  } catch (e) {
    ok = false;
    reportWriteFailure(key, e);
  }
  // Ook na een mislukking verwittigen: de UI leest dan opnieuw uit de opslag
  // en toont eerlijk wat er écht bewaard staat.
  emit();
  return ok;
}

// ── Widgets ─────────────────────────────────────────────────────────────────

export function getWidgets(): Widget[] {
  return read<Widget[]>(KEYS.widgets, []);
}
export function getWidget(id: string): Widget | undefined {
  return getWidgets().find((w) => w.id === id);
}
export function getWidgetByCode(code: string): Widget | undefined {
  const c = code.trim().toUpperCase();
  return getWidgets().find((w) => w.code.toUpperCase() === c);
}
/**
 * Bewaart een widget; geeft false terug als er niets bewaard is (volle opslag).
 * `keepUpdatedAt`: de versie (updatedAt) van de bron behouden in plaats van
 * "nu" te stempelen. Alleen voor gedeelde inhoud die overgenomen wordt (zie
 * adoptSharedContent in lib/courses.ts): daar is updatedAt het versienummer van de
 * bron, en een latere, nieuwere versie moet daar nog tegen te vergelijken zijn.
 */
export function saveWidget(widget: Widget, opts: { keepUpdatedAt?: boolean } = {}): boolean {
  const all = getWidgets();
  const i = all.findIndex((w) => w.id === widget.id);
  const keep = opts.keepUpdatedAt && typeof widget.updatedAt === 'number' && Number.isFinite(widget.updatedAt);
  const updated = { ...widget, updatedAt: keep ? widget.updatedAt : Date.now() };
  if (i >= 0) all[i] = updated;
  else all.unshift(updated);
  const ok = write(KEYS.widgets, all);
  if (ok) protectStorageOnce();
  return ok;
}

/**
 * Waarom hier? `navigator.storage.persist()` lukt alleen na echte interactie,
 * dus stil bij het opstarten vragen heeft geen zin. Een geslaagde widget-
 * bewaaractie is het eerste moment waarop (a) er iets op dit toestel staat dat
 * verloren kán gaan en (b) de gebruiker aantoonbaar aan het werk is. Álle
 * leerkrachtwegen komen hier voorbij (nieuwe widget, editor-autosave, AI-studio,
 * dupliceren, en het overnemen van een gedeelde link), dus één plek volstaat.
 *
 * `askPersistenceOnce` bewaakt zelf dat het hoogstens één keer gebeurt en dat
 * er al geklikt of getypt is — de voorbeeldwidgets die bij het allereerste
 * bezoek automatisch bewaard worden, tellen dus niet mee. Zegt de browser nee,
 * dan zeuren we niet: één keer de eerlijke back-uphint, en klaar. Wie enkel
 * cursussen maakt, kan het altijd zelf aanvragen op de privacypagina.
 */
function protectStorageOnce() {
  void askPersistenceOnce()
    .then((result) => {
      if (result !== 'denied' && result !== 'unsupported') return;
      // De hint blijft in een vlag staan tot ze getoond én weggeklikt is: vlak
      // na het bewaren springt de app vaak naar de editor, buiten de schil.
      markBackupHint();
      const hint = pendingBackupHint();
      if (hint) emitStorageNotice(hint);
    })
    .catch(() => { /* genegeerd: opslag beschermen is best-effort */ });
}

export function deleteWidget(id: string) {
  // Vóór het verwijderen: heeft deze widget een geüploade pdf als bron
  // (bv. splitwidgets: config.source.pdfId)? Dan die straks mee opruimen.
  const widget = getWidget(id);
  const src = widget ? (widget.config as unknown as { source?: unknown }).source : undefined;
  const pdfId =
    src && typeof src === 'object' && typeof (src as Record<string, unknown>).pdfId === 'string'
      ? ((src as Record<string, unknown>).pdfId as string)
      : null;
  const mediaIds = widget ? collectMediaRefs(stringifyWithMedia(widget)) : new Set<string>();
  const subs = getSubmissions();
  const fileIds = new Set<string>();
  for (const sub of subs) {
    if (sub.widgetId !== id) continue;
    const raw = stringifyWithMedia(sub);
    for (const m of collectMediaRefs(raw)) mediaIds.add(m);
    for (const f of collectFileIds(raw)) fileIds.add(f);
  }
  write(KEYS.widgets, getWidgets().filter((w) => w.id !== id));
  write(KEYS.submissions, subs.filter((s) => s.widgetId !== id));
  if (pdfId) cleanupOrphanPdf(pdfId);
  cleanupOrphanMedia(mediaIds);
  cleanupStudentFiles(fileIds);
}

/** Ingeleverde bestanden ({name,size,fileId}) in ruwe inzendings-JSON. */
export function collectFileIds(raw: string): Set<string> {
  const out = new Set<string>();
  const re = /"fileId":"([A-Za-z0-9_-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.add(m[1]);
  return out;
}

/**
 * Ingeleverde bestanden van verwijderde inzendingen uit IndexedDB halen.
 * Een fileId hoort bij precies één inzending (de upload gebeurt bij het
 * antwoorden), dus hier is geen verwijzingstelling nodig.
 */
export function cleanupStudentFiles(ids: Iterable<string>) {
  const list = [...ids];
  if (list.length === 0) return;
  void import('./pdfStore')
    .then(({ deleteStudentFile }) => Promise.all(list.map((id) => deleteStudentFile(id))))
    .catch(() => { /* best-effort */ });
}

/**
 * Afbeeldingen/audio/bijlagen van iets wat net verwijderd is uit IndexedDB
 * opruimen — alleen wat nergens anders meer voorkomt (dupliceren en sjablonen
 * delen dezelfde verwijzing) en alleen wat niet gloednieuw is.
 */
export function cleanupOrphanMedia(ids: Iterable<string>) {
  const list = [...ids];
  if (list.length === 0) return;
  void pruneOrphanMedia({ only: list }).catch(() => { /* best-effort */ });
}

/**
 * Geüploade pdf van een verwijderde widget uit IndexedDB opruimen — maar
 * alleen als niets er nog naar verwijst (dupliceren deelt bewust hetzelfde
 * pdfId). De scan is bewust simpel en conservatief: komt het pdfId nog ergens
 * voor in de ruwe JSON van de widgets- of cursussenopslag, dan blijft de blob
 * staan. De cursussen lezen we hier rechtstreeks uit localStorage
 * ('wf.courses.v1'): courses.ts importeert deze module al, dus andersom
 * importeren zou een kringimport geven.
 */
function cleanupOrphanPdf(pdfId: string) {
  try {
    const widgetsRaw = localStorage.getItem(KEYS.widgets) ?? '';
    const coursesRaw = localStorage.getItem('wf.courses.v1') ?? '';
    if (widgetsRaw.includes(pdfId) || coursesRaw.includes(pdfId)) return;
  } catch {
    return; // bij twijfel laten staan: een wees is onschuldiger dan een kapotte verwijzing
  }
  // Fire-and-forget; de dynamische import houdt de basisbundel licht en
  // opruimen mag het verwijderen van de widget nooit blokkeren.
  void import('./pdfStore')
    .then(({ deletePdf }) => deletePdf(pdfId))
    .catch(() => { /* genegeerd: opruimen is best-effort */ });
}

// ── Mappen ──────────────────────────────────────────────────────────────────

export function getFolders(): Folder[] {
  return read<Folder[]>(KEYS.folders, []);
}
/** Bewaart een map; false = niet bewaard (volle opslag). */
export function saveFolder(folder: Folder): boolean {
  const all = getFolders();
  const i = all.findIndex((f) => f.id === folder.id);
  if (i >= 0) all[i] = folder;
  else all.push(folder);
  return write(KEYS.folders, all);
}
export function deleteFolder(id: string) {
  write(KEYS.folders, getFolders().filter((f) => f.id !== id));
  // widgets uit de map terug naar hoofdmap
  const widgets = getWidgets().map((w) => (w.folderId === id ? { ...w, folderId: null } : w));
  write(KEYS.widgets, widgets);
}

// ── Inzendingen ─────────────────────────────────────────────────────────────

export function getSubmissions(widgetId?: string): Submission[] {
  const all = read<Submission[]>(KEYS.submissions, []);
  return widgetId ? all.filter((s) => s.widgetId === widgetId) : all;
}
/** Bewaart een inzending; false = niet bewaard (de melding loopt via write()). */
export function saveSubmission(sub: Submission): boolean {
  const all = read<Submission[]>(KEYS.submissions, []);
  const i = all.findIndex((s) => s.id === sub.id);
  if (i >= 0) all[i] = sub;
  else all.unshift(sub);
  return write(KEYS.submissions, all);
}
export function deleteSubmission(id: string) {
  const all = getSubmissions();
  const gone = all.find((s) => s.id === id);
  write(KEYS.submissions, all.filter((s) => s.id !== id));
  if (gone) {
    const raw = stringifyWithMedia(gone);
    cleanupOrphanMedia(collectMediaRefs(raw));
    cleanupStudentFiles(collectFileIds(raw));
  }
}

// ── Pogingen (per browser) ──────────────────────────────────────────────────

export function getAttemptCount(widgetId: string, studentName: string): number {
  const map = read<Record<string, number>>(KEYS.attempts, {});
  return map[`${widgetId}::${studentName.trim().toLowerCase()}`] ?? 0;
}
export function bumpAttemptCount(widgetId: string, studentName: string) {
  const map = read<Record<string, number>>(KEYS.attempts, {});
  const key = `${widgetId}::${studentName.trim().toLowerCase()}`;
  map[key] = (map[key] ?? 0) + 1;
  write(KEYS.attempts, map);
}

// ── Live activiteit (zelfde toestel/browser) ────────────────────────────────

export interface LiveEntry {
  widgetId: string;
  studentName: string;
  startedAt: number;
}

export function markStarted(widgetId: string, studentName: string) {
  const all = read<LiveEntry[]>(KEYS.live, []);
  const name = studentName.trim() || 'Anoniem';
  const filtered = all.filter((e) => !(e.widgetId === widgetId && e.studentName === name));
  filtered.push({ widgetId, studentName: name, startedAt: Date.now() });
  // oude entries (ouder dan 12u) opruimen
  write(KEYS.live, filtered.filter((e) => Date.now() - e.startedAt < 12 * 3600 * 1000));
}

export function getLiveEntries(widgetId: string): LiveEntry[] {
  return read<LiveEntry[]>(KEYS.live, []).filter((e) => e.widgetId === widgetId);
}

// ── Voorkeuren ──────────────────────────────────────────────────────────────

export interface Prefs {
  theme: 'light' | 'dark' | 'auto';
  teacherName: string;
  seeded: boolean;
}
export function getPrefs(): Prefs {
  return read<Prefs>(KEYS.prefs, { theme: 'auto', teacherName: '', seeded: false });
}
export function savePrefs(p: Prefs) {
  write(KEYS.prefs, p);
}
