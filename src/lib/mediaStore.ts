// ── Media (afbeeldingen, audio, bijlagen) buiten localStorage ───────────────
//
// Het probleem: localStorage biedt ±5 MB voor de héle app, en één foto als
// data-URL is al gauw een halve megabyte. Tot nu toe stond elke afbeelding
// base64 in de widget-JSON, dus een handvol widgets met foto's en de opslag
// zat vol — met stille bewaarfouten als gevolg.
//
// De oplossing, in drie lagen die de rest van de app niet hoeft te kennen:
//
//  1. OPSLAG   — de bytes gaan als Blob naar IndexedDB (honderden MB ruimte,
//                zelfde database als de pdf's, zie lib/idb.ts). In de JSON
//                die naar localStorage gaat, staat alleen nog een verwijzing
//                "wfmedia:m_…" (±40 tekens in plaats van honderdduizenden).
//  2. GEHEUGEN — bij het lezen (JSON.parse-reviver, zie lib/storage.ts)
//                wordt elke verwijzing vervangen door een blob:-URL naar de
//                blob in het geheugen. Elke <img src>, <audio src>, canvas of
//                downloadlink werkt daar gewoon mee; geen enkele widget hoeft
//                aangepast. Bij het schrijven (JSON.stringify-replacer) gaat
//                de blob:-URL weer terug naar de verwijzing.
//  3. DELEN    — een draagbare link of exportbestand moet op een ánder toestel
//                werken, dus daar worden de verwijzingen weer data-URL's
//                (inlineMedia). Ingevoerde data-URL's (import, link, AI,
//                resultaatcode) worden na het bewaren automatisch verhuisd
//                (migrateDataUrls) — dat is meteen ook de eenmalige migratie
//                van bestaande opslag.
//
// Id's zijn inhoudsgebaseerd (sha-256 van de bytes): dezelfde foto twee keer
// invoegen kost één blob, en dupliceren of importeren maakt nooit dubbels.
// Wezen (blobs waar niets meer naar verwijst) ruimt pruneOrphanMedia op, met
// een leeftijdsgrens zodat een net gekozen maar nog niet bewaarde afbeelding
// nooit onder je handen verdwijnt, en niet zolang een ander tabblad van de app
// media toont (zie holdTabLock).
//
// VEILIGHEID. Een blob:-URL hoort bij de origin van de app: is het type html
// of svg, dan voert "afbeelding/link openen in nieuw tabblad" het script erin
// uit, met toegang tot de API-sleutel. Media komt ook van anderen (links,
// klaspakketten, resultaatcodes), dus:
//  - urlFor maakt alleen een blob:-URL met een passief type (lib/veiligeUrl:
//    png/jpeg/gif/webp/avif/bmp, audio, video, pdf, platte tekst); al de rest
//    wordt application/octet-stream (downloaden in plaats van tonen). Ook
//    storeMedia en dataUrlToBlob bewaren alleen zulke types.
//  - svg kan als octet-stream niet meer in een <img>. Svg wordt daarom nooit
//    een blob: nieuwe svg's blijven een data:-URL (niet verhuisd, niet als
//    blob bewaard), en al bewaarde svg-records krijgen bij het inladen een
//    data:-URL in plaats van een blob:-URL (eigen, ondoorzichtige origin).

import { deleteFilesDb, filesTx, prefixRange, type FileRecord } from './idb';
import { isSvgType, passieveBlob, SVG_TYPE, veiligBlobType } from './veiligeUrl';

export const MEDIA_REF_PREFIX = 'wfmedia:';
const ID_PREFIX = 'm_';
/** Kleinere data-URL's (iconen, handtekeningen) blijven gewoon inline. */
export const MIN_EXTERNALIZE_CHARS = 2048;
/** Wezen jonger dan dit blijven staan: misschien is de widget nog niet bewaard. */
export const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000;

/** Vaste sleutels in localStorage waarin media kunnen voorkomen. */
export const MEDIA_KEYS = ['wf.widgets.v1', 'wf.courses.v1', 'wf.submissions.v1', 'wf.customtemplates.v1'] as const;
/** Tussentijds bewaarde antwoorden van leerlingen (tekeningen, audio-opnames). */
export const AUTOSAVE_PREFIX = 'wf.autosave.';
/** Na zoveel ms geven we het wachten op IndexedDB op en renderen we toch. */
const PRELOAD_TIMEOUT_MS = 4000;

// ── Achterkant (IndexedDB), injecteerbaar voor tests ───────────────────────

export interface MediaBackend {
  getAll(): Promise<FileRecord[]>;
  get(id: string): Promise<FileRecord | undefined>;
  put(rec: FileRecord): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

const idbBackend: MediaBackend = {
  getAll: () => filesTx<FileRecord[]>('readonly', (s) => s.getAll(prefixRange(ID_PREFIX)) as IDBRequest<FileRecord[]>),
  get: (id) => filesTx<FileRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<FileRecord | undefined>),
  put: (rec) => filesTx('readwrite', (s) => s.put(rec)).then(() => undefined),
  delete: (id) => filesTx('readwrite', (s) => s.delete(id)).then(() => undefined),
  clear: () => deleteFilesDb(),
};

interface MediaEnv {
  backend: MediaBackend;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  storage: () => Storage | null;
  preloadTimeoutMs: number;
}

const env: MediaEnv = {
  backend: idbBackend,
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  storage: () => (typeof localStorage === 'undefined' ? null : localStorage),
  preloadTimeoutMs: PRELOAD_TIMEOUT_MS,
};

/** Alleen voor tests: achterkant en URL-fabriek vervangen, cache leegmaken. */
export function configureMediaStore(overrides: Partial<MediaEnv>) {
  Object.assign(env, overrides);
  resetMediaCache();
}

// ── Cache in het geheugen ───────────────────────────────────────────────────

interface Entry {
  id: string;
  /** blob:-URL, pas gemaakt bij het eerste gebruik (zie urlFor); bij svg
   *  meteen een data:-URL (zie registerStored). */
  url: string | null;
  blob: Blob;
  name: string;
  size: number;
  createdAt: number;
}

const byId = new Map<string, Entry>();
/** blob:-URL → id. Blijft ook na het opruimen van een blob bestaan, zodat
 *  een editor die de URL nog vasthoudt bij het bewaren een verwijzing
 *  wegschrijft en nooit een dode blob:-string. */
const byUrl = new Map<string, string>();
/** Data-URL's die deze sessie al verhuisd zijn, zodat een editor die de oude
 *  data-URL nog in het geheugen heeft bij het bewaren meteen de verwijzing
 *  wegschrijft (anders ping-pongt elke autosave met de migratie). */
const byDataUrl = new Map<string, string>();
const missing = new Set<string>();
const pendingLoads = new Map<string, Promise<void>>();

let ready = false;
let available = true;
let preloadPromise: Promise<void> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Verwittigt (o.a. de opslaglaag) dat er media bijgeladen of verhuisd is. */
export function onMediaChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

function resetMediaCache() {
  for (const e of byId.values()) if (e.url) safeRevoke(e.url);
  byId.clear();
  byUrl.clear();
  byDataUrl.clear();
  missing.clear();
  pendingLoads.clear();
  ready = false;
  available = true;
  preloadPromise = null;
  tabLock = null;
}

// ── Andere tabbladen (Web Locks) ────────────────────────────────────────────
//
// Een tabblad kan media op het scherm hebben waar localStorage (nog) niet naar
// verwijst: een editor met gepauzeerd bewaren (conflict met een ander
// tabblad) of mislukt bewaren (opslag vol), of een widget of cursus die net
// in een ander tabblad verwijderd werd. Wist een ander tabblad die blob als
// wees, dan bewaart "Mijn versie bewaren" daarna een verwijzing naar niets.
// Daarom houdt elk tabblad dat media inleest (resolveMediaRef) of bewaart
// (storeMedia) een gedeeld Web Lock vast (de browser geeft het vrij als het
// tabblad sluit), en wist de
// opruimronde niets zolang een ánder tabblad er een heeft. Elk tabblad heeft
// een eigen slotnaam: zo telt het zichzelf nooit mee, ook niet als zijn eigen
// aanvraag nog loopt of mislukte. Wezen blijven dan staan tot de app ergens
// alleen opstart. Zonder Web Locks (oude browser, http op het lan): het oude
// gedrag, alleen de leeftijdsgrens.

const TAB_LOCK_PREFIX = 'wf-media-tabblad:';
/** Naam van het slot van dít tabblad, zodra het media toont of bewaart. */
let tabLock: string | null = null;

const webLocks = (): LockManager | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator.locks as LockManager | undefined);

/** Eén keer per tabblad: het slot nemen en houden tot het tabblad sluit. */
function holdTabLock() {
  const locks = webLocks();
  if (tabLock || !locks) return;
  const name = (tabLock = TAB_LOCK_PREFIX + randomPart());
  // mislukt: bij een volgende aanroep opnieuw proberen
  const failed = () => {
    if (tabLock === name) tabLock = null;
  };
  try {
    void locks.request(name, { mode: 'shared' }, () => new Promise<void>(() => {})).catch(failed);
  } catch {
    failed();
  }
}

/** Houdt een ander tabblad van de app (mogelijk) media vast? */
async function mediaOpenElders(): Promise<boolean> {
  const locks = webLocks();
  if (!locks) return false;
  try {
    const { held = [], pending = [] } = await locks.query();
    return [...held, ...pending].some((l) => l.name !== tabLock && String(l.name).startsWith(TAB_LOCK_PREFIX));
  } catch {
    return true; // bij twijfel niets weggooien
  }
}

function safeRevoke(url: string) {
  // (een svg-data-URL vrijgeven is een no-op: revokeObjectURL negeert al wat geen blob: is)
  try {
    env.revokeObjectUrl(url);
  } catch {
    // genegeerd
  }
}

function register(rec: FileRecord, dataUrl?: string): Entry {
  const existing = byId.get(rec.id);
  if (existing) return existing;
  // Geen object-URL hier: bij het opstarten komen álle records langs en de
  // meeste worden op deze pagina nooit getoond.
  const entry: Entry = { id: rec.id, url: dataUrl ?? null, blob: rec.blob, name: rec.name, size: rec.size, createdAt: rec.createdAt };
  // Bewaren schrijft de data-URL weer als verwijzing weg (zie replaceMedia).
  if (dataUrl) byDataUrl.set(dataUrl, rec.id);
  byId.set(rec.id, entry);
  missing.delete(rec.id);
  return entry;
}

/** Svg als data:-URL met het kale svg-type (zonder parameters). */
function svgDataUrl(blob: Blob): Promise<string> {
  return blobToDataUrl(blob.type === SVG_TYPE ? blob : blob.slice(0, blob.size, SVG_TYPE));
}

/**
 * Record uit de achterkant in het geheugen brengen. Een svg krijgt meteen
 * zijn data:-URL (async: de bytes moeten gelezen worden), zodat urlFor er
 * nooit een blob:-URL voor maakt. Andere records registreren synchroon,
 * nog binnen deze aanroep.
 */
async function registerStored(rec: FileRecord): Promise<Entry> {
  const known = byId.get(rec.id);
  if (known) return known;
  if (!isSvgType(rec.blob.type)) return register(rec);
  let dataUrl: string | undefined;
  try {
    dataUrl = await svgDataUrl(rec.blob);
  } catch {
    dataUrl = undefined; // dan maakt urlFor een octet-stream-blob: veilig, alleen niet zichtbaar
  }
  return register(rec, dataUrl);
}

/** De URL voor een record: nooit een blob:-URL met een actief type (zie kop). */
function urlFor(entry: Entry): string {
  if (!entry.url) {
    entry.url = env.createObjectUrl(passieveBlob(entry.blob));
    byUrl.set(entry.url, entry.id);
  }
  return entry.url;
}

function unregister(id: string) {
  const e = byId.get(id);
  if (!e) return;
  byId.delete(id);
  if (e.url) {
    safeRevoke(e.url); // byUrl bewust laten staan (zie boven)
    // Een svg-data-URL blijft zelf bruikbaar: niet meer als verwijzing naar
    // een weggegooid record laten bewaren.
    if (!e.url.startsWith('blob:')) byDataUrl.delete(e.url);
  }
}

// ── Basisbewerkingen ────────────────────────────────────────────────────────

export function isMediaRef(s: unknown): s is string {
  return typeof s === 'string' && s.startsWith(MEDIA_REF_PREFIX);
}

/** Data-, blob- of media-verwijzing: iets wat als bron van <img>/<audio> kan dienen. */
export function isMediaUrl(s: unknown): s is string {
  return typeof s === 'string' && (s.startsWith('data:') || s.startsWith('blob:') || s.startsWith(MEDIA_REF_PREFIX));
}

/** Enkel wat een browser écht kan tonen: data- of blob-URL (geen open verwijzing). */
export function isRenderableMedia(s: unknown): s is string {
  return typeof s === 'string' && (s.startsWith('data:') || s.startsWith('blob:'));
}

export function mediaAvailable(): boolean {
  return available;
}

/**
 * Alle media-blobs in het geheugen brengen (één getAll; de bytes zelf blijven
 * lui op schijf). Wordt vóór de eerste render afgewacht (main.tsx), met een
 * tijdslimiet: is IndexedDB traag, dan verschijnen de afbeeldingen zodra ze
 * er zijn via het wijzigingsevent.
 */
export function preloadMedia(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = new Promise<void>((resolve) => {
    // IndexedDB kan in zeldzame gevallen nooit antwoorden (Safari, privé-
    // vensters). Dan mag niet de hele medialaag — en de migratie die erop
    // wacht — voor de rest van de sessie stilvallen: na de tijdslimiet gaan
    // we verder en lost resolveMediaRef elke verwijzing apart op.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      ready = true;
      emit();
      resolve();
    };
    const timer = setTimeout(finish, env.preloadTimeoutMs);
    env.backend
      .getAll()
      .then(async (recs) => {
        let added = false;
        const pending: Promise<Entry>[] = [];
        for (const rec of recs) {
          if (rec && rec.blob && !byId.has(rec.id)) {
            pending.push(registerStored(rec)); // svg: data-URL maken, al de rest meteen
            added = true;
          }
        }
        await Promise.all(pending);
        if (settled && added) emit(); // laat binnengekomen: alsnog verversen
      })
      .catch(() => {
        available = false;
      })
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
  });
  return preloadPromise;
}

async function contentId(blob: Blob): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
      const bytes = new Uint8Array(digest).subarray(0, 16);
      let hex = '';
      for (const b of bytes) hex += b.toString(16).padStart(2, '0');
      return ID_PREFIX + hex;
    }
  } catch {
    // onveilige context (http op het lan) of oude browser: willekeurig id
  }
  return ID_PREFIX + randomPart();
}

function randomPart(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/**
 * Blob bewaren; geeft de blob:-URL terug die in de config mag staan. Dezelfde
 * inhoud levert hetzelfde id (en dezelfde URL) op. Gooit als IndexedDB niet
 * beschikbaar is — de aanroeper valt dan terug op een data-URL.
 * Svg wordt niet bewaard maar komt terug als data:-URL, en een niet-passief
 * type wordt application/octet-stream (zie de kop van dit bestand).
 */
export async function storeMedia(input: Blob, name = ''): Promise<string> {
  holdTabLock(); // vóór het bewaren: een ander tabblad wist deze blob dan niet als wees
  if (isSvgType(input.type)) return svgDataUrl(input);
  if (!available) throw new Error('Mediaopslag niet beschikbaar');
  const blob = passieveBlob(input);
  const id = await contentId(blob);
  const known = byId.get(id);
  if (known) {
    // Dezelfde inhoud opnieuw gekozen: telt als nieuw voor de opruimronde, ook
    // als het oude record een wees was (anders kan ze gewist worden vóór ze bewaard is).
    known.createdAt = Math.max(known.createdAt, Date.now());
    return urlFor(known);
  }
  const rec: FileRecord = { id, name, blob, size: blob.size, createdAt: Date.now() };
  try {
    await env.backend.put(rec);
  } catch (e) {
    available = false;
    throw e;
  }
  return urlFor(register(rec));
}

/** Grootte in bytes van een blob:-URL uit deze opslag (null als onbekend). */
export function mediaSizeForUrl(url: string): number | null {
  const id = byUrl.get(url);
  const entry = id ? byId.get(id) : undefined;
  return entry ? entry.size : null;
}

/** Bestaat deze verwijzing (al) in het geheugen? */
export function hasMedia(id: string): boolean {
  return byId.has(id);
}

/**
 * Verwijzing → blob:-URL (synchroon). Onbekend? Dan blijft de verwijzing
 * staan en halen we ze op de achtergrond op (bv. net in een ander tabblad
 * toegevoegd); daarna volgt een wijzigingsevent zodat de UI opnieuw leest.
 * Nooit een placeholder teruggeven: wat hier uitkomt kan bij een volgende
 * autosave weer bewaard worden, en dan zou de echte verwijzing verloren gaan.
 */
export function resolveMediaRef(ref: string): string {
  // Dit tabblad heeft nu media in het geheugen (en schrijft de verwijzing bij
  // het bewaren terug), ook als de blob nog geladen moet worden: niet laten
  // wissen door een ander tabblad (zie holdTabLock).
  holdTabLock();
  const id = ref.slice(MEDIA_REF_PREFIX.length);
  const entry = byId.get(id);
  if (entry) return urlFor(entry);
  if (ready && available && !missing.has(id) && !pendingLoads.has(id)) {
    const p = env.backend
      .get(id)
      .then(async (rec) => {
        if (rec && rec.blob) {
          await registerStored(rec);
          emit();
        } else {
          missing.add(id);
        }
      })
      .catch(() => { /* bij een volgende lezing proberen we opnieuw */ })
      .finally(() => pendingLoads.delete(id));
    pendingLoads.set(id, p);
  }
  return ref;
}

/** blob:-URL (of al verhuisde data-URL) → verwijzing, als we ze kennen. */
export function mediaRefForUrl(url: string): string | null {
  const id = byUrl.get(url) ?? byDataUrl.get(url);
  return id ? MEDIA_REF_PREFIX + id : null;
}

/** JSON.parse-reviver: verwijzingen worden blob:-URL's. */
export function reviveMedia(_key: string, value: unknown): unknown {
  return isMediaRef(value) ? resolveMediaRef(value) : value;
}

/** JSON.stringify-replacer: blob:-URL's (en verhuisde of svg-data-URL's) worden verwijzingen. */
export function replaceMedia(_key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.startsWith('blob:')) return byUrl.has(value) ? MEDIA_REF_PREFIX + byUrl.get(value) : value;
  // Geen minimumlengte: ook een kleine svg uit een bewaard record moet weer
  // als verwijzing weggeschreven worden.
  if (value.startsWith('data:')) {
    const id = byDataUrl.get(value);
    if (id) return MEDIA_REF_PREFIX + id;
  }
  return value;
}

/** Parse met media-reviver; slaat de reviver over als er niets te vervangen valt. */
export function parseWithMedia<T>(raw: string): T {
  return raw.includes(MEDIA_REF_PREFIX) ? (JSON.parse(raw, reviveMedia) as T) : (JSON.parse(raw) as T);
}

export function stringifyWithMedia(value: unknown, space?: number): string {
  return JSON.stringify(value, replaceMedia, space);
}

// ── Data-URL's ⇄ blobs ──────────────────────────────────────────────────────

const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?((?:;[a-z0-9.+=-]+)*);base64,([A-Za-z0-9+/=]*)$/i;

/** Data-URL naar blob. Het type is passief, svg, of anders application/octet-stream. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const type = m[1] ?? '';
    return new Blob([bytes], { type: isSvgType(type) ? SVG_TYPE : veiligBlobType(type) });
  } catch {
    return null;
  }
}

/** Blob → base64-data-URL. Zonder FileReader, zodat het ook in tests (node) werkt. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000; // String.fromCharCode heeft een grens op het aantal argumenten
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

async function blobForRef(ref: string): Promise<Blob | null> {
  const id = ref.slice(MEDIA_REF_PREFIX.length);
  const entry = byId.get(id);
  if (entry) return entry.blob;
  if (!available) return null;
  try {
    const rec = await env.backend.get(id);
    if (rec && rec.blob) return (await registerStored(rec)).blob;
  } catch {
    // niets te doen
  }
  return null;
}

/**
 * Diepe kopie waarin alle media (blob:-URL's en verwijzingen) weer data-URL's
 * zijn — voor draagbare links, exportbestanden en resultaatcodes, die op een
 * ander toestel moeten werken. Onbekende media blijven ongewijzigd staan.
 */
export async function inlineMedia<T>(value: T): Promise<T> {
  const cache = new Map<string, string>();
  const toDataUrl = async (key: string, blob: Blob | null): Promise<string> => {
    if (!blob) return key;
    const hit = cache.get(key);
    if (hit) return hit;
    const url = await blobToDataUrl(blob);
    cache.set(key, url);
    return url;
  };
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string') {
      if (v.startsWith('blob:')) {
        const id = byUrl.get(v);
        return id ? toDataUrl(v, await blobForRef(MEDIA_REF_PREFIX + id)) : v;
      }
      if (isMediaRef(v)) return toDataUrl(v, await blobForRef(v));
      return v;
    }
    if (Array.isArray(v)) {
      const out = new Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = await walk(v[i]);
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (val === undefined) continue;
        out[k] = await walk(val);
      }
      return out;
    }
    return v;
  };
  return (await walk(value)) as T;
}

/**
 * Verwijzingen in ruwe JSON die nog niet in het geheugen zitten alvast
 * ophalen — bv. bij het storage-event uit een ander tabblad, zodat de blob
 * er al is tegen dat de gebruiker hier op de widget klikt.
 */
export function prefetchMediaRefs(raw: string) {
  if (!available || !raw.includes(MEDIA_REF_PREFIX)) return;
  for (const id of collectMediaRefs(raw)) {
    if (byId.has(id)) continue;
    missing.delete(id); // het andere tabblad heeft ze net bewaard: opnieuw proberen
    resolveMediaRef(MEDIA_REF_PREFIX + id);
  }
}

/**
 * Aantal media in een (al ingelijnde) waarde die níét mee konden: open
 * verwijzingen of blob:-URL's zonder blob. Deelvensters waarschuwen dan dat
 * de link onvolledig is.
 */
export function countUnresolvedMedia(value: unknown): number {
  try {
    const m = JSON.stringify(value).match(/"(?:wfmedia:|blob:)/g);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Staan er in dit (al gelezen) object nog verwijzingen die niet opgelost
 * raakten (blob nog niet geladen, of niet op dit toestel)? Een weergave kan
 * dan op onMediaChange wachten en opnieuw lezen.
 */
export function hasUnresolvedMedia(value: unknown): boolean {
  try {
    return JSON.stringify(value).includes(MEDIA_REF_PREFIX);
  } catch {
    return false;
  }
}

/** Alle media-id's die in een ruwe JSON-string voorkomen. */
export function collectMediaRefs(raw: string): Set<string> {
  const out = new Set<string>();
  const re = /wfmedia:(m_[A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.add(m[1]);
  return out;
}

// ── Migratie: data-URL's in localStorage verhuizen ──────────────────────────

// Een JSON-string die precies één base64-data-URL is: beginnend met de
// aanhalingstekens, dus nooit een stuk uit een langere tekst. Base64 bevat
// geen " of \, dus de waarde eindigt gegarandeerd bij het sluitende teken.
const DATA_URL_IN_JSON_RE = /"data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9.+=-]+)*;base64,[A-Za-z0-9+/=]+"/gi;

/**
 * Alle (unieke) grote base64-data-URL's in een ruwe JSON-string. Svg doet
 * niet mee: die blijft een data:-URL (zie de kop van dit bestand).
 */
export function findLargeDataUrls(raw: string, minChars = MIN_EXTERNALIZE_CHARS): string[] {
  if (!raw.includes(';base64,')) return [];
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  DATA_URL_IN_JSON_RE.lastIndex = 0;
  while ((m = DATA_URL_IN_JSON_RE.exec(raw))) {
    if (m[0].length - 2 < minChars) continue;
    const url = m[0].slice(1, -1);
    if (isSvgType(url.slice(5, url.indexOf(';')))) continue;
    found.add(url);
  }
  return [...found];
}

let migrating: Promise<number> | null = null;

/** Alle sleutels die media kunnen bevatten: de vaste, plus de autosave-sleutels. */
export function mediaKeysInStorage(): string[] {
  const out: string[] = [...MEDIA_KEYS];
  const store = env.storage();
  if (!store) return out;
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(AUTOSAVE_PREFIX)) out.push(k);
    }
  } catch {
    // dan alleen de vaste sleutels
  }
  return out;
}

/**
 * Verhuist grote data-URL's uit de opgegeven localStorage-sleutels naar
 * IndexedDB. Loopt in twee stappen per sleutel: eerst alle blobs bewaren
 * (async), dan de sleutel opnieuw lezen en de exacte strings vervangen —
 * zo kan een tussentijdse autosave nooit overschreven worden. Geeft het
 * aantal verhuisde bestanden terug; loopt nooit twee keer tegelijk.
 */
export function migrateDataUrls(keys?: readonly string[]): Promise<number> {
  if (migrating) return migrating;
  migrating = (async () => {
    let moved = 0;
    const store = env.storage();
    if (!store || !available) return 0;
    await preloadMedia();
    if (!available) return 0;
    for (const key of keys ?? mediaKeysInStorage()) {
      let raw: string | null;
      try {
        raw = store.getItem(key);
      } catch {
        continue;
      }
      if (!raw) continue;
      const urls = findLargeDataUrls(raw);
      if (urls.length === 0) continue;
      const refs = new Map<string, string>();
      for (const url of urls) {
        const blob = dataUrlToBlob(url);
        if (!blob) continue;
        try {
          const blobUrl = await storeMedia(blob);
          const id = byUrl.get(blobUrl);
          if (!id) continue;
          byDataUrl.set(url, id);
          refs.set(url, MEDIA_REF_PREFIX + id);
        } catch {
          return moved; // opslag weggevallen: stoppen, wat er stond blijft geldig
        }
      }
      if (refs.size === 0) continue;
      try {
        let fresh = store.getItem(key);
        if (!fresh) continue;
        let changed = false;
        for (const [url, ref] of refs) {
          const needle = `"${url}"`;
          if (!fresh.includes(needle)) continue;
          fresh = fresh.split(needle).join(`"${ref}"`);
          changed = true;
          moved++;
        }
        if (changed) store.setItem(key, fresh);
      } catch {
        // schrijven mislukt (kan haast niet: het wordt kleiner) — volgende sleutel
      }
    }
    if (moved > 0) emit();
    return moved;
  })().finally(() => {
    migrating = null;
  });
  return migrating;
}

// ── Opruimen ────────────────────────────────────────────────────────────────

/** Verwijzingen die nog ergens in localStorage (alle wf.*-sleutels) voorkomen. */
function referencedIds(): Set<string> | null {
  const store = env.storage();
  if (!store) return null;
  const ids = new Set<string>();
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.startsWith('wf.')) continue;
      const raw = store.getItem(key);
      if (!raw || !raw.includes(MEDIA_REF_PREFIX)) continue;
      for (const id of collectMediaRefs(raw)) ids.add(id);
    }
  } catch {
    return null;
  }
  return ids;
}

/**
 * Blobs zonder verwijzing weg. `only` beperkt het tot bepaalde id's (na het
 * verwijderen van één widget); anders wordt de hele mediaopslag nagekeken.
 * Jonge blobs blijven staan (zie ORPHAN_MIN_AGE_MS), en zolang een ander
 * tabblad van de app media toont, blijft alles staan (zie holdTabLock): een
 * latere opstart ruimt ze op. Expliciet wissen (`minAgeMs: 0`, bv. de
 * leerlinggegevens op de privacypagina) wacht op niets.
 */
export async function pruneOrphanMedia(opts: { only?: Iterable<string>; minAgeMs?: number } = {}): Promise<number> {
  if (!available) return 0;
  await preloadMedia();
  const inUse = referencedIds();
  if (!inUse) return 0; // bij twijfel niets weggooien
  const minAge = opts.minAgeMs ?? ORPHAN_MIN_AGE_MS;
  const now = Date.now();
  const candidates = opts.only ? [...opts.only] : [...byId.keys()];
  let removed = 0;
  for (const id of candidates) {
    if (inUse.has(id)) continue;
    const entry = byId.get(id);
    // Niet in het geheugen? Dan kennen we de leeftijd niet: laten staan, de
    // volgende opstartbeurt kijkt opnieuw.
    if (!entry || now - entry.createdAt < minAge) continue;
    // Per blob opnieuw gevraagd: intussen kan er een tabblad bijgekomen zijn.
    if (minAge > 0 && (await mediaOpenElders())) break;
    try {
      await env.backend.delete(id);
      unregister(id);
      removed++;
    } catch {
      // volgende keer opnieuw
    }
  }
  return removed;
}

/** Cijfers voor de privacypagina. */
export function mediaStats(): { count: number; bytes: number } {
  let bytes = 0;
  for (const e of byId.values()) bytes += e.size;
  return { count: byId.size, bytes };
}

/** Alles weg (privacypagina "alles wissen"): hele bestandsdatabase incl. pdf's. */
export async function clearAllFiles(): Promise<void> {
  for (const e of byId.values()) if (e.url) safeRevoke(e.url);
  byId.clear();
  byUrl.clear();
  byDataUrl.clear();
  missing.clear();
  try {
    await env.backend.clear();
  } catch {
    // genegeerd
  }
  emit();
}
