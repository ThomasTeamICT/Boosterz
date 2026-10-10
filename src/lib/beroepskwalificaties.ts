// Beroepskwalificaties per studierichting: de koppeling onderdeel → erkenning → BK-versie, en de
// competenties van elke BK-versie. Zie docs/STUDIERICHTINGEN.md § 23.5 (import), § 23.5.2 (bestanden)
// en § 23.5.3 (deze module).
//
// Pure module, bewust zonder imports en alleen "erasable" TypeScript (geen enums, namespaces,
// parameter properties of decorators): Node importeert dit bestand rechtstreeks via type stripping
// vanuit tools/leerplannen/haal-beroepskwalificaties.mjs. De datatest en de app gebruiken het ook.
//
// De vorm van de API kennen we alleen uit het uittreksel van de verkenning (ronde 6 en 7, zie
// tests/fixtures/kwalificaties/api/ruw/). De normalisatie is daarom tolerant (werkwijze regel 11): een
// veld mag tekst zijn of een object {code, omschrijving}, en een lijst met één element telt als dat
// element. Wat de eerste echte run moet bevestigen, staat in § 23.3 (T1 tot T10).
//
// Afspraken voor de bestanden (de validators bewaken ze):
// - Wat de API levert, wordt nooit een eigenschap van een object via gewone toekenning: een veld dat
//   `__proto__` heet, komt er met `zet` (defineProperty) in en kan zo geen prototype instellen. Een
//   competentiecode is altijd een Map-sleutel, nooit een objecteigenschap.
// - `api_url` en `curriculumdossier` vallen overal weg, ook diep in `extra`: het script volgt nooit een
//   adres uit een antwoord, en het curriculumdossier is een Word-document in base64.
// - In `extra`: sleutels recursief gesorteerd, tekst getrimd, null, lege tekst, lege lijsten en lege
//   objecten vallen weg. Een veld van `extra` dat in JSON meer dan MAX_EXTRA_VELD bytes weegt, of dieper
//   dan MAX_EXTRA_DIEPTE genest is, valt weg met een waarschuwing.
// - Volgorde: de sleutels hangen nooit af van de volgorde in de API, en de lijsten die we zelf ordenen
//   (erkenningen, bks, studiebekrachtigingen, competenties met nr, referenties) ook niet. Lijsten in
//   `extra`, competenties zonder nr, kennis en vaardigheden blijven in de volgorde van de bron: sorteren
//   kan daar niet, want sommige lijsten zijn geordend (bv. `domeinen[].pad`). Wie een nieuwe uitkomst met
//   een oude vergelijkt, gebruikt daarom `gelijkZonderVolgorde` (T6): zo geeft een andere volgorde in de
//   API geen "inhoud veranderd".
// - Diepte: elke recursie is begrensd, zodat absurd diep geneste invoer (JSON.parse maakt er ook van
//   100.000 niveaus) nooit een RangeError geeft, maar een probleem of een waarschuwing.
// - Uitzondering op "lege velden vallen weg": de verplichte lijsten staan er altijd, ook leeg: `bks` en
//   `bekrachtigingen` van een erkenning, `kennis` en `vaardigheden` van een competentie. Zo kloppen de
//   types in de app zonder terugval, en is "geen lijst" (`geenLijst: true`, `bks: []`) iets anders dan
//   een lege lijst (`bks: []`).
// - Sorteren gebeurt zonder de taalinstellingen van het toestel (cijfers als getallen, de rest teken
//   voor teken): zo geeft dezelfde validator in Node en in elke browser hetzelfde oordeel.

export const BK_API = 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2';
export const BK_BRON = 'https://onderwijs-api-portaal.vlaanderen.be/';
/** Werkkeuze tot TechLoket antwoordt (§ 23.10): geen naam van een agentschap. Eén constante; aanpassen = een nieuwe run. */
export const BK_NAAMSVERMELDING = 'Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties)';
export const BK_NUMMER = /^BK-\d{3,6}$/;
export const BK_VERSIE = /^BK-\d{3,6}-\d{1,4}$/;
export const DBK_NUMMER = /^BK-\d{3,6}-\d{1,4}-DBK-\d{1,4}$/;
/** Altijd als Map-sleutel gebruiken, nooit als objecteigenschap. */
export const COMPETENTIE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
export const MAX_EXTRA_VELD = 20_000;
export const MAX_BK_PER_LEERPLAN = 20;

/** Het nummer van een erkenning (`structuuronderdeel_detail_nummer`), bv. "ADV-0842". */
export const ADV_NUMMER = /^ADV-\d{1,6}$/;
export const KOPPELING_KIND = 'richtingkwalificaties';
export const BK_INDEX_KIND = 'beroepskwalificaties-index';
export const BK_KIND = 'beroepskwalificatie';
/** Het adres in de kop van de koppeling: het detail per structuuronderdeel. */
export const KOPPELING_API = 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeel/';
export const KOPPELING_NAAMSVERMELDING = 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen)';
export const BK_INDEX_API = `${BK_API}/beroepskwalificatie/`;
export const LICENTIE = 'nog te bevestigen';
/** Elk adres in een kop begint hiermee: zo komt een adres van een lokale testserver nooit in de bestanden. */
const OFFICIELE_API = 'https://onderwijs.api.vlaanderen.be/';
/** Gelijk aan GROEP_NUMMER in studierichtingen.ts (een test vergelijkt de bron): deze module heeft geen imports. */
const GROEP_NUMMER = /^G-\d{4,6}$/;

/** Het adres van het detail van één BK-versie, zoals het in de kop van haar bestand staat. */
export function bkApiVan(bk: string): string {
  return `${BK_API}/beroepskwalificatie/${bk}`;
}

/** Het pad van het bestand van één BK-versie, relatief tegenover de map `kwalificaties/`. */
export function bkBestandVan(bk: string): string {
  return `bk/${bk}.json`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type OnderdeelStatus = 'opgehaald' | 'niet-gevonden' | 'nog-niet-opgehaald';

/** Eén beroepskwalificatie van een erkenning. */
export interface KoppelingBk {
  /** BK-versie, bv. "BK-0390-2". */
  bk: string;
  /** Momentopname van de titel; de app gebruikt ze alleen als er geen BK-bestand is. */
  titel?: string;
  /** Wat het element verder meegaf (bv. `volledigheid`, gezien in ronde 7), zonder `api_url`. */
  extra?: Record<string, unknown>;
}

/** Eén studiebekrachtiging van een erkenning (diploma, bewijs, …). Een DBK alleen bij naam (F3-B14). */
export interface Bekrachtiging {
  /** `uitgebreide_naam` (anders `naam`). */
  naam: string;
  onderwijskwalificatie?: true;
  bk?: string;
  dbk?: string;
  extra?: Record<string, unknown>;
}

/** Eén erkenning van een structuuronderdeel (`structuuronderdeel_details[]`). */
export interface Erkenning {
  /** `structuuronderdeel_detail_nummer`, bv. "ADV-0842". */
  adv: string;
  /** `structuuronderdeel_detail_versie`, bv. "S-504-V1". */
  versie?: string;
  /** De code, bv. "ERKEND", "GEANNULEERD" of "NIET_ERKEND". */
  status?: string;
  begindatum?: string;
  einddatum?: string;
  /** Uniek en gesorteerd met `vergelijkBkVersie`. Staat er altijd, ook leeg. */
  bks: KoppelingBk[];
  /** Het detail had geen veld `beroepskwalificaties` (niet hetzelfde als een lege lijst). */
  geenLijst?: true;
  /** Staat er altijd, ook leeg. */
  bekrachtigingen: Bekrachtiging[];
  extra?: Record<string, unknown>;
}

/** Eén record van de koppeling: één onderdeel van de matrix. */
export interface OnderdeelKwalificaties {
  onderdeel: number;
  groep: string;
  status: OnderdeelStatus;
  opgehaald?: string;
  nietMeerInBron?: string;
  erkenningen?: Erkenning[];
}

export interface KoppelingBestand {
  app: 'boosterz';
  kind: 'richtingkwalificaties';
  v: 1;
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  opgehaald: string;
  matrixSha256: string;
  aantalOnderdelen: number;
  sha256: string;
  onderdelen: OnderdeelKwalificaties[];
}

export interface BkIndexRegel {
  bk: string;
  nummer: string;
  versie: number;
  titel?: string;
  vks?: number;
  status?: string;
  aantal?: number;
  sha256?: string;
  opgehaald: string;
  bestand?: string;
  laatstErkend?: string;
  nietMeerGekoppeld?: string;
  nietMeerInBron?: string;
  nietGevonden?: true;
  onbruikbaar?: true;
}

export interface BkIndex {
  app: 'boosterz';
  kind: 'beroepskwalificaties-index';
  v: 1;
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  opgehaald: string;
  lijstTotaal?: number;
  sha256: string;
  bks: BkIndexRegel[];
}

export interface BkTekst {
  type?: string;
  tekst: string;
}

export interface Competentie {
  /** `competentie_code`, bv. "bkc0039200": de sleutel. Nooit op het scherm. */
  id: string;
  nr?: number;
  type?: string;
  /** `waarde` letterlijk, getrimd. De app zet het om met `tekstVanCompetentie`. */
  tekst: string;
  /** In de volgorde van de bron (T6). Staat er altijd, ook leeg. */
  kennis: BkTekst[];
  /** In de volgorde van de bron (T6). Staat er altijd, ook leeg. */
  vaardigheden: BkTekst[];
  referenties?: string[];
  extra?: Record<string, unknown>;
}

export interface BkBestand {
  app: 'boosterz';
  kind: 'beroepskwalificatie';
  v: 1;
  bk: string;
  nummer: string;
  versie: number;
  titel: string;
  status?: string;
  vks?: number;
  definitie?: string;
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  opgehaald: string;
  nietMeerInBron?: string;
  aantal: number;
  sha256: string;
  competenties: Competentie[];
  extra?: Record<string, unknown>;
}

/** De inhoud van een BK-versie zoals `normaliseerBkDetail` ze geeft (de kop zet het script). */
export type BkInhoud = Pick<BkBestand, 'titel' | 'status' | 'vks' | 'definitie' | 'competenties' | 'extra'>;

export interface OnderdeelDetailUitkomst {
  /** Wat het antwoord ZELF zegt (`structuuronderdeel_nummer`). */
  nummer?: number;
  /** `structuuronderdeel_groep.structuuronderdeel_groep_nummer`, voor een zachte kruiscontrole. */
  groep?: string;
  /** Gesorteerd op begindatum en dan ADV-nummer. Leeg bij een probleem met het nummer. */
  erkenningen: Erkenning[];
  /** Alle paden in het antwoord (veldinventaris voor het rapport). */
  velden: string[];
  /** Naar de poorten: P3 als `nummer` ontbreekt of verschilt van het gevraagde, anders P4. */
  problemen: string[];
  /** Naar het rapport. */
  waarschuwingen: string[];
  /** Studiebekrachtigingen (of een verwijzing erin) in een onbekende vorm (T3). */
  vormOnbekend: number;
}

export interface BkDetailUitkomst {
  /**
   * De versie, alleen als het antwoord over de gevraagde versie gaat. Ontbreekt `bk`, dan negeert het
   * detail de vraag (poort P3). Staat `bk` er zonder `inhoud`, dan is de versie onbruikbaar (P7).
   */
  bk?: string;
  inhoud?: BkInhoud;
  velden: string[];
  problemen: string[];
  waarschuwingen: string[];
}

// ── Kleine hulpfuncties ─────────────────────────────────────────────────────

/**
 * Hoe diep we in een waarde uit de API kijken. Een veld van `extra` mag zo diep genest zijn (dieper valt
 * het weg); `isLeeg` en `enkel` kijken niet dieper. De echte antwoorden zijn hoogstens ±8 niveaus diep.
 */
const MAX_EXTRA_DIEPTE = 64;
/**
 * Grens voor `vast` en `vormZonderVolgorde`. Wat de normalisatie of de validators doorlaten, is hoogstens
 * MAX_EXTRA_DIEPTE plus een handvol niveaus diep (bestand → onderdeel → erkenning → … → extra); dieper is
 * nooit genormaliseerde invoer.
 */
const MAX_VAST_DIEPTE = 2 * MAX_EXTRA_DIEPTE;

/** Te diep genest: `schoon` en `vast` gooien dit, en wie ze aanroept, vangt het. */
class TeDiep extends Error {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function heeft(o: Record<string, unknown>, sleutel: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, sleutel);
}

/** Alleen een eigen veld: nooit iets van het prototype (bv. `constructor`). */
function eigen(o: Record<string, unknown>, sleutel: string): unknown {
  return heeft(o, sleutel) ? o[sleutel] : undefined;
}

/** Zet een veld, ook als het `__proto__` heet: zo kan een veld nooit een prototype instellen. */
function zet(o: Record<string, unknown>, sleutel: string, waarde: unknown): void {
  Object.defineProperty(o, sleutel, { value: waarde, enumerable: true, writable: true, configurable: true });
}

/** Een korte, veilige weergave van een waarde in een melding. Gooit nooit, ook niet bij diepe nesting. */
function toon(v: unknown): string {
  let t: string;
  try {
    t = v === undefined ? 'niets' : JSON.stringify(v) ?? String(v);
  } catch {
    // Te diep genest (RangeError) of iets wat geen JSON is: String(v) zou bij een diepe lijst ook gooien.
    t = Array.isArray(v) ? '[…]' : isObject(v) ? '{…}' : '(onleesbaar)';
  }
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/**
 * Leeg: null, ontbrekend, lege tekst, een lege lijst of een object met alleen lege velden. Dieper dan
 * MAX_EXTRA_DIEPTE kijken we niet: zo'n lijst of object telt als niet leeg (het valt verderop weg met een
 * waarschuwing, of wordt een probleem).
 */
function isLeeg(v: unknown, diepte = 0): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (!Array.isArray(v) && !isObject(v)) return false;
  if (diepte >= MAX_EXTRA_DIEPTE) return false;
  if (Array.isArray(v)) return v.every((x) => isLeeg(x, diepte + 1));
  return Object.keys(v).every((k) => isLeeg(v[k], diepte + 1));
}

/**
 * Een veld dat één waarde hoort te hebben. Een lijst met één niet-leeg element telt als dat element;
 * een lijst met meer niet-lege elementen is "meerwaardig". Dieper dan MAX_EXTRA_DIEPTE pakken we niet
 * uit: de waarde is dan een lijst, en die is voor elke lezer onleesbaar.
 */
function enkel(v: unknown, diepte = 0): { waarde: unknown; meerwaardig: boolean } {
  if (v === undefined || v === null) return { waarde: undefined, meerwaardig: false };
  if (Array.isArray(v)) {
    if (diepte >= MAX_EXTRA_DIEPTE) return { waarde: v, meerwaardig: false };
    const gevuld = v.filter((x) => !isLeeg(x));
    if (gevuld.length === 0) return { waarde: undefined, meerwaardig: false };
    if (gevuld.length > 1) return { waarde: undefined, meerwaardig: true };
    return enkel(gevuld[0], diepte + 1);
  }
  return { waarde: v, meerwaardig: false };
}

/** Tekst uit een string (getrimd) of een eindig getal; anders `undefined`. */
function eenvoudigeTekst(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

const VOORKEUR_CODE = ['code', 'omschrijving', 'naam', 'label', 'waarde'];

/**
 * Tekst uit een string, een getal, een lijst met één element of een object {code, omschrijving} (met
 * een voorkeursvolgorde voor de sleutels). Zegt ook welke sleutel van het object de tekst gaf.
 */
function tekstEnSleutel(v: unknown, voorkeur: readonly string[] = VOORKEUR_CODE): { tekst?: string; sleutel?: string } {
  const e = enkel(v);
  if (e.meerwaardig) return {};
  const t = eenvoudigeTekst(e.waarde);
  if (t !== undefined) return { tekst: t };
  if (!isObject(e.waarde)) return {};
  for (const sleutel of voorkeur) {
    const s = eenvoudigeTekst(enkel(eigen(e.waarde, sleutel)).waarde);
    if (s !== undefined) return { tekst: s, sleutel };
  }
  return {};
}

function tekstUit(v: unknown, voorkeur: readonly string[] = VOORKEUR_CODE): string | undefined {
  return tekstEnSleutel(v, voorkeur).tekst;
}

/** Een geheel getal groter dan 0, als getal of als tekst met alleen cijfers ("505" → 505). */
function positiefGeheel(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v > 0 ? v : undefined;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isSafeInteger(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIJDSTIP = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Een bestaande kalenderdag in de vorm JJJJ-MM-DD. */
function isDatum(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DATUM.exec(v);
  if (!m) return false;
  const [j, mnd, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const datum = new Date(Date.UTC(j, mnd - 1, d));
  return datum.getUTCFullYear() === j && datum.getUTCMonth() === mnd - 1 && datum.getUTCDate() === d;
}

/** Een tijdstip in UTC zoals het script het schrijft: JJJJ-MM-DDTUU:MM:SS(.mmm)Z. */
function isTijdstip(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = TIJDSTIP.exec(v);
  return m !== null && isDatum(m[1]);
}

/** Een datum uit de API: "2017-09-01" of "2017-09-01T00:00:00Z" wordt "2017-09-01". */
function datumUit(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(t)) return undefined;
  const d = t.slice(0, 10);
  return isDatum(d) ? d : undefined;
}

/** Het aantal bytes van een tekst in UTF-8. */
function utf8Lengte(t: string): number {
  return new TextEncoder().encode(t).length;
}

const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/;
const HTML_ENTITEIT = /&(?:#\d{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

/** Staat er een HTML-tag (`<p>`, `</b>`, `<br/>`) of een entiteit (`&nbsp;`, `&#233;`) in de tekst? */
export function bevatHtml(tekst: string): boolean {
  return HTML_TAG.test(tekst) || HTML_ENTITEIT.test(tekst);
}

// ── Sorteren ────────────────────────────────────────────────────────────────

/** Vergelijkt twee rijen cijfers als getallen, zonder grens op de lengte ("0009" = "9" < "10"). */
function vergelijkCijfers(a: string, b: string): number {
  const x = a.replace(/^0+/, '');
  const y = b.replace(/^0+/, '');
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Natuurlijke volgorde zoals `vergelijkNatuurlijk` in studierichtingen.ts: cijfers als getallen, de rest
 * teken voor teken, los van de taalinstellingen. Bij gelijke stand beslist de gewone tekenvolgorde,
 * zodat twee verschillende teksten nooit als gelijk tellen.
 */
function vergelijkNatuurlijk(a: string, b: string): number {
  const delenA = a.match(/\d+|\D+/g) ?? [];
  const delenB = b.match(/\d+|\D+/g) ?? [];
  const n = Math.min(delenA.length, delenB.length);
  for (let i = 0; i < n; i++) {
    const x = delenA[i];
    const y = delenB[i];
    const xCijfer = /^\d/.test(x);
    const yCijfer = /^\d/.test(y);
    if (xCijfer && yCijfer) {
      const v = vergelijkCijfers(x, y);
      if (v !== 0) return v;
    } else if (xCijfer !== yCijfer) {
      return xCijfer ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  if (delenA.length !== delenB.length) return delenA.length - delenB.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function vergelijkOptioneel(a: string | undefined, b: string | undefined): number {
  return vergelijkNatuurlijk(a ?? '', b ?? '');
}

/**
 * JSON met gesorteerde sleutels: een eerlijke vergelijking van twee genormaliseerde waarden. Gooit
 * `TeDiep` boven MAX_VAST_DIEPTE; genormaliseerde of gevalideerde gegevens komen daar nooit.
 */
function vast(v: unknown, diepte = 0): string {
  if (diepte > MAX_VAST_DIEPTE) throw new TeDiep();
  if (Array.isArray(v)) return `[${v.map((x) => vast(x, diepte + 1)).join(',')}]`;
  if (isObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${vast(v[k], diepte + 1)}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Zoals `vast`, maar de elementen van elke lijst ook gesorteerd (als vaste vorm): de volgorde telt niet. */
function vormZonderVolgorde(v: unknown, diepte: number): string {
  if (diepte > MAX_VAST_DIEPTE) throw new TeDiep();
  if (Array.isArray(v)) return `[${v.map((x) => vormZonderVolgorde(x, diepte + 1)).sort().join(',')}]`;
  if (isObject(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${vormZonderVolgorde(v[k], diepte + 1)}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * Zijn twee genormaliseerde waarden gelijk als je niet op de volgorde van lijsten let (T6, § 23.3)? Elke
 * sleutel en elke waarde telt; een lijst telt als een verzameling met herhaling ([a, a, b] ≠ [a, b, b]),
 * op elk niveau, ook in `extra`. Voor het script: is de nieuwe inhoud van een BK-versie (of een record
 * van de koppeling) zo gelijk aan de oude, dan blijft het oude bestand met zijn volgorde en zijn sha256,
 * zodat een andere volgorde in de API geen valse melding "inhoud veranderd" geeft. Een verandering in een
 * geordend pad (bv. `domeinen[].pad`) zie je zo niet; dat is de prijs, en `extra` staat in fase 3 niet op
 * het scherm. Te diep genest: `false` (dan is het "veranderd"). Gooit nooit.
 */
export function gelijkZonderVolgorde(a: unknown, b: unknown): boolean {
  try {
    return vormZonderVolgorde(a, 0) === vormZonderVolgorde(b, 0);
  } catch {
    return false;
  }
}

/**
 * Splitst een BK-versie: "BK-0390-2" → { nummer: "BK-0390", versie: 2 }. Alleen voor een tekst die op
 * `BK_VERSIE` past; anders `undefined`.
 */
export function splitsBk(bk: string): { nummer: string; versie: number } | undefined {
  if (typeof bk !== 'string' || !BK_VERSIE.test(bk)) return undefined;
  const streep = bk.lastIndexOf('-');
  return { nummer: bk.slice(0, streep), versie: Number(bk.slice(streep + 1)) };
}

/**
 * Volgorde van BK-versies: op nummer en dan op versie, beide als getal (BK-0390-2 < BK-0390-10 <
 * BK-0391-1). Bij een gelijke stand ("BK-0390-02" en "BK-0390-2") beslist de tekenvolgorde: 0 alleen
 * voor dezelfde tekst. Wat niet op `BK_VERSIE` past, komt achteraan, in tekenvolgorde.
 */
export function vergelijkBkVersie(a: string, b: string): number {
  const x = splitsBk(a);
  const y = splitsBk(b);
  if (x && y) {
    const v = vergelijkCijfers(x.nummer.slice(3), y.nummer.slice(3)) || x.versie - y.versie;
    if (v !== 0) return v < 0 ? -1 : 1;
  } else if (x || y) {
    return x ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── Erkenningen die gelden ──────────────────────────────────────────────────

/** Is de status van een erkenning ERKEND? Tekst of {code}, een lijst met één element, hoofdletterongevoelig. */
function isErkend(status: unknown): boolean {
  const t = tekstUit(status, ['code', 'omschrijving']);
  return t !== undefined && t.toUpperCase() === 'ERKEND';
}

/**
 * Geldt de erkenning op `vandaag` (JJJJ-MM-DD)? Status ERKEND (hoofdletterongevoelig, tekst of {code}),
 * begindatum leeg of ≤ vandaag, einddatum leeg of ≥ vandaag. Bij twijfel niet: een onleesbare datum, een
 * ongeldige `vandaag` of een ontbrekende status geeft `false`.
 */
export function geldtOp(e: Pick<Erkenning, 'status' | 'begindatum' | 'einddatum'>, vandaag: string): boolean {
  if (!isObject(e) || !isDatum(vandaag) || !isErkend(e.status)) return false;
  const begin = e.begindatum;
  const einde = e.einddatum;
  if (begin !== undefined && begin !== '') {
    const b = datumUit(begin);
    if (b === undefined || b > vandaag) return false;
  }
  if (einde !== undefined && einde !== '') {
    const d = datumUit(einde);
    if (d === undefined || d < vandaag) return false;
  }
  return true;
}

/**
 * De erkenningen die vandaag gelden (`nu`; ook twee die overlappen) en de erkende die later beginnen
 * (`toekomst`), elk in de volgorde van de invoer. Een toekomstige erkenning met een einddatum vóór haar
 * begindatum telt niet.
 */
export function erkenningenOp(e: readonly Erkenning[], vandaag: string): { nu: Erkenning[]; toekomst: Erkenning[] } {
  const nu: Erkenning[] = [];
  const toekomst: Erkenning[] = [];
  if (!Array.isArray(e) || !isDatum(vandaag)) return { nu, toekomst };
  const lijst: readonly unknown[] = e;
  for (const x of lijst) {
    if (!isObject(x)) continue;
    const erkenning = x as unknown as Erkenning;
    if (geldtOp(erkenning, vandaag)) {
      nu.push(erkenning);
      continue;
    }
    if (!isErkend(erkenning.status)) continue;
    const begin = datumUit(erkenning.begindatum);
    if (begin === undefined || begin <= vandaag) continue;
    if (erkenning.einddatum !== undefined && erkenning.einddatum !== '') {
      const einde = datumUit(erkenning.einddatum);
      if (einde === undefined || einde < begin) continue;
    }
    toekomst.push(erkenning);
  }
  return { nu, toekomst };
}

// ── Doelcodes ───────────────────────────────────────────────────────────────

const MAX_DOELCODE = 60;

/**
 * De doelcode van elke competentie: id → "BK-0390-2.03" (`${bk}.${n}`, n met minstens twee cijfers).
 * n is `nr` als ELKE competentie van het bestand een uniek geheel `nr` ≥ 1 heeft, anders de plaats
 * (vanaf 1) in het bestand. Een competentiecode komt nooit in een doelcode. Nooit langer dan 60 tekens.
 * Een ongeldige `bk` geeft een lege Map; een competentie zonder geldig id krijgt geen code (maar telt
 * wel mee voor de plaats), en een dubbel id houdt de code van zijn eerste plaats.
 */
export function doelcodesVanBestand(b: Pick<BkBestand, 'bk' | 'competenties'>): Map<string, string> {
  const codes = new Map<string, string>();
  if (!isObject(b) || typeof b.bk !== 'string' || !BK_VERSIE.test(b.bk) || !Array.isArray(b.competenties)) return codes;
  const lijst: readonly unknown[] = b.competenties;
  const nrs = lijst.map((c) => (isObject(c) && typeof c.nr === 'number' && Number.isSafeInteger(c.nr) && c.nr >= 1 ? c.nr : undefined));
  const code = (n: number) => `${b.bk}.${String(n).padStart(2, '0')}`;
  let metNr = nrs.every((n) => n !== undefined) && new Set(nrs).size === nrs.length;
  if (metNr && nrs.some((n) => code(n as number).length > MAX_DOELCODE)) metNr = false;
  lijst.forEach((c, i) => {
    if (!isObject(c) || typeof c.id !== 'string' || !COMPETENTIE_CODE.test(c.id) || codes.has(c.id)) return;
    codes.set(c.id, code(metNr ? (nrs[i] as number) : i + 1));
  });
  return codes;
}

// ── Veldinventaris en extra ─────────────────────────────────────────────────

const MAX_VELDEN = 500;
const MAX_VELD_DIEPTE = 8;

/**
 * Alle paden in een antwoord, gesorteerd: "structuuronderdeel_details[].beroepskwalificaties[].titel".
 * Een lijst wordt "[]". Begrensd (diepte 8, 500 paden), voor het rapport.
 */
export function veldenVan(raw: unknown): string[] {
  const paden = new Set<string>();
  const loop = (v: unknown, pad: string, diepte: number): void => {
    if (diepte > MAX_VELD_DIEPTE || paden.size >= MAX_VELDEN) return;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 50)) loop(x, `${pad}[]`, diepte + 1);
      return;
    }
    if (!isObject(v)) return;
    for (const sleutel of Object.keys(v)) {
      if (paden.size >= MAX_VELDEN) return;
      const p = pad === '' ? sleutel : `${pad}.${sleutel}`;
      paden.add(p);
      loop(v[sleutel], p, diepte + 1);
    }
  };
  loop(raw, '', 0);
  return [...paden].sort();
}

/** Sleutels die overal wegvallen, ook diep in `extra`. */
const NOOIT_BEWAREN: readonly string[] = ['api_url', 'curriculumdossier'];

/**
 * Een waarde voor `extra`: sleutels gesorteerd (recursief), tekst getrimd; null, lege tekst, lege lijsten
 * en lege objecten vallen weg; `api_url` en `curriculumdossier` ook. `undefined` als er niets overblijft.
 * Lijsten blijven in de volgorde van de bron (zie de kop van dit bestand). Gooit `TeDiep` als een waarde
 * op een diepte groter dan MAX_EXTRA_DIEPTE staat (de waarde zelf is diepte 0).
 */
function schoon(v: unknown, diepte = 0): unknown {
  if (diepte > MAX_EXTRA_DIEPTE) throw new TeDiep();
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    const uit = v.map((x) => schoon(x, diepte + 1)).filter((x) => x !== undefined);
    return uit.length === 0 ? undefined : uit;
  }
  if (isObject(v)) {
    const uit: Record<string, unknown> = {};
    for (const sleutel of Object.keys(v).sort()) {
      if (NOOIT_BEWAREN.includes(sleutel)) continue;
      const w = schoon(v[sleutel], diepte + 1);
      if (w !== undefined) zet(uit, sleutel, w);
    }
    return Object.keys(uit).length === 0 ? undefined : uit;
  }
  return undefined;
}

/**
 * Zet één veld in `extra` (geschoond). Weegt het in JSON meer dan MAX_EXTRA_VELD bytes, of is het te
 * diep genest, dan valt het weg met een waarschuwing: zo komt er nooit een base64-blob in de repo.
 */
function zetExtra(extra: Record<string, unknown>, sleutel: string, waarde: unknown, plaats: string, waarschuwingen: string[]): void {
  if (NOOIT_BEWAREN.includes(sleutel)) return;
  let w: unknown;
  try {
    w = schoon(waarde);
  } catch (e) {
    if (!(e instanceof TeDiep)) throw e;
    waarschuwingen.push(`${plaats}: het veld "${sleutel}" is te diep genest en valt weg.`);
    return;
  }
  if (w === undefined) return;
  const bytes = utf8Lengte(JSON.stringify(w));
  if (bytes > MAX_EXTRA_VELD) {
    waarschuwingen.push(`${plaats}: het veld "${sleutel}" weegt ${bytes} bytes (meer dan ${MAX_EXTRA_VELD}) en valt weg.`);
    return;
  }
  zet(extra, sleutel, w);
}

/**
 * Leest de velden van één object. Houdt bij welke velden gelezen zijn: de rest gaat naar `extra`
 * (behalve wat in `weg` staat).
 */
interface Lezer {
  bron: Record<string, unknown>;
  gelezen: Set<string>;
}

function lezer(bron: Record<string, unknown>): Lezer {
  return { bron, gelezen: new Set() };
}

function lees(l: Lezer, sleutel: string): unknown {
  l.gelezen.add(sleutel);
  return eigen(l.bron, sleutel);
}

function rest(l: Lezer, weg: readonly string[], plaats: string, waarschuwingen: string[]): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const sleutel of Object.keys(l.bron).sort()) {
    if (l.gelezen.has(sleutel) || weg.includes(sleutel)) continue;
    zetExtra(extra, sleutel, l.bron[sleutel], plaats, waarschuwingen);
  }
  return Object.keys(extra).length === 0 ? undefined : extra;
}

// ── Verwijzingen naar een BK-versie of een deelkwalificatie ─────────────────

type Verwijzing =
  | { soort: 'bk'; bk: string; rest: Record<string, unknown> }
  | { soort: 'dbk'; dbk: string; rest: Record<string, unknown> }
  | { soort: 'leeg' }
  | { soort: 'fout'; reden: string }
  | { soort: 'onbekend' };

/** Velden die een verwijzing naar een BK-versie dragen (ronde 6 en 7). */
const BK_VELDEN = ['versie_nr_lang', 'versie_nr_kort', 'beroepskwalificatie_nr'];
const DBK_VELDEN = ['deelkwalificatie_nr_lang', 'deelkwalificatie_nr_kort'];

/** Een geheel getal ≥ 1 als versienummer, ook uit tekst ("2"). */
function versieNummer(v: unknown): number | undefined {
  return positiefGeheel(enkel(v).waarde);
}

/** De rest van een object na de gelezen sleutels, zonder `api_url` (letterlijk; geschoond bij het bewaren). */
function restVan(o: Record<string, unknown>, gelezen: readonly string[]): Record<string, unknown> {
  const uit: Record<string, unknown> = {};
  for (const sleutel of Object.keys(o)) {
    if (gelezen.includes(sleutel) || NOOIT_BEWAREN.includes(sleutel)) continue;
    zet(uit, sleutel, o[sleutel]);
  }
  return uit;
}

/**
 * Leest een verwijzing (T1, T3): een tekst die op `BK_VERSIE` of `DBK_NUMMER` past, of een object met
 * `versie_nr_lang` (anders `beroepskwalificatie_nr` + "-" + `versie_nr_kort`), of met
 * `deelkwalificatie_nr_lang`, of anders (alleen met `zoek`) met precies één veld dat op `BK_VERSIE` of
 * `DBK_NUMMER` past. Een lijst met één element telt als dat element. `nummer` dient als
 * `beroepskwalificatie_nr` als het object er zelf geen heeft (bv. `laatst_erkende_versie` in de BK-lijst).
 * - `fout`: het object wil een BK-versie noemen, maar die past niet, of hoort niet bij haar nummer;
 * - `onbekend`: er staat geen herkenbare verwijzing in.
 */
function leesVerwijzing(v: unknown, nummer?: string, zoek = true): Verwijzing {
  if (isLeeg(v)) return { soort: 'leeg' };
  const e = enkel(v);
  if (e.meerwaardig) return { soort: 'fout', reden: `meer dan één verwijzing waar er één hoort (${toon(v)})` };
  const w = e.waarde;
  const tekst = eenvoudigeTekst(w);
  if (tekst !== undefined) {
    if (BK_VERSIE.test(tekst)) return { soort: 'bk', bk: tekst, rest: {} };
    if (DBK_NUMMER.test(tekst)) return { soort: 'dbk', dbk: tekst, rest: {} };
    return { soort: 'onbekend' };
  }
  if (!isObject(w)) return { soort: 'onbekend' };

  // Een deelkwalificatie (ronde 6: deelkwalificatie_nr_kort "DBK-01", deelkwalificatie_nr_lang "BK-0130-5-DBK-01").
  if (DBK_VELDEN.some((k) => !isLeeg(eigen(w, k)))) {
    const dbkLang = tekstUit(eigen(w, 'deelkwalificatie_nr_lang'));
    if (dbkLang === undefined || !DBK_NUMMER.test(dbkLang)) {
      return { soort: 'fout', reden: `de deelkwalificatie ${toon(dbkLang ?? eigen(w, 'deelkwalificatie_nr_kort'))} past niet op BK-0000-0-DBK-00` };
    }
    const dbkKort = tekstUit(eigen(w, 'deelkwalificatie_nr_kort'));
    const gelezen = ['deelkwalificatie_nr_lang'];
    if (dbkKort === undefined || dbkLang.endsWith(`-${dbkKort}`)) gelezen.push('deelkwalificatie_nr_kort');
    return { soort: 'dbk', dbk: dbkLang, rest: restVan(w, gelezen) };
  }

  if (BK_VELDEN.some((k) => !isLeeg(eigen(w, k)))) {
    const lang = tekstUit(eigen(w, 'versie_nr_lang'));
    const nrRuw = eigen(w, 'beroepskwalificatie_nr');
    const nr = isLeeg(nrRuw) ? nummer : tekstUit(nrRuw);
    if (!isLeeg(nrRuw) && nr === undefined) return { soort: 'fout', reden: `het nummer ${toon(nrRuw)} is niet te lezen` };
    const kortRuw = eigen(w, 'versie_nr_kort');
    const kort = isLeeg(kortRuw) ? undefined : versieNummer(kortRuw);
    if (!isLeeg(kortRuw) && kort === undefined) return { soort: 'fout', reden: `het versienummer ${toon(kortRuw)} is geen geheel getal` };
    if (nr !== undefined && !BK_NUMMER.test(nr)) return { soort: 'fout', reden: `het nummer ${toon(nr)} past niet op BK-0000` };
    let bk: string | undefined;
    if (lang !== undefined && BK_VERSIE.test(lang)) {
      bk = lang;
    } else if (nr !== undefined && kort !== undefined && BK_VERSIE.test(`${nr}-${kort}`)) {
      bk = `${nr}-${kort}`;
    } else {
      return { soort: 'fout', reden: `de versie ${toon(lang ?? (nr !== undefined ? `${nr}-${kort ?? '?'}` : kortRuw))} past niet op BK-0000-0` };
    }
    const delen = splitsBk(bk) as { nummer: string; versie: number };
    if (nr !== undefined && delen.nummer !== nr) return { soort: 'fout', reden: `de versie ${bk} begint niet met haar nummer ${nr}` };
    if (kort !== undefined && delen.versie !== kort) return { soort: 'fout', reden: `de versie ${bk} past niet bij het versienummer ${kort}` };
    return { soort: 'bk', bk, rest: restVan(w, BK_VELDEN) };
  }

  // Geen bekende velden: precies één veld (één niveau diep) dat op BK_VERSIE of DBK_NUMMER past (T3).
  if (!zoek) return { soort: 'onbekend' };
  const treffers: { sleutel: string; soort: 'bk' | 'dbk'; code: string }[] = [];
  for (const sleutel of Object.keys(w)) {
    const t = eenvoudigeTekst(w[sleutel]);
    if (t === undefined) continue;
    if (BK_VERSIE.test(t)) treffers.push({ sleutel, soort: 'bk', code: t });
    else if (DBK_NUMMER.test(t)) treffers.push({ sleutel, soort: 'dbk', code: t });
  }
  const codes = new Set(treffers.map((t) => t.code));
  if (treffers.length === 0 || codes.size > 1) return { soort: 'onbekend' };
  const eerste = treffers[0];
  const r = restVan(w, treffers.map((t) => t.sleutel));
  return eerste.soort === 'bk' ? { soort: 'bk', bk: eerste.code, rest: r } : { soort: 'dbk', dbk: eerste.code, rest: r };
}

/**
 * De BK-versie uit een verwijzing (T1): `versie_nr_lang` als het op `BK_VERSIE` past, anders
 * `beroepskwalificatie_nr` + "-" + `versie_nr_kort`. Ook een tekst, of een lijst met één element.
 * `undefined` als er geen versie in staat, als het een deelkwalificatie is, of als de delen elkaar
 * tegenspreken (een versie die niet met haar nummer begint, of een ander versienummer). Een object
 * zonder die velden geeft `undefined`, ook als een ander veld op een versie lijkt.
 * `nummer` dient als `beroepskwalificatie_nr` als het object er zelf geen heeft.
 */
export function bkVersieVan(v: unknown, nummer?: string): string | undefined {
  const r = leesVerwijzing(v, nummer, false);
  return r.soort === 'bk' ? r.bk : undefined;
}

// ── Pagina's van de BK-lijst ────────────────────────────────────────────────

const MAX_ZOEKDIEPTE = 6;
const LIJST_SLEUTEL = 'beroepskwalificatie_nr';

/**
 * De lijst met beroepskwalificaties op een pagina van de API: de ENIGE lijst met objecten die een
 * `beroepskwalificatie_nr` hebben, op welke sleutel ook (in ronde 6: `gegevens`). Een gevonden lijst
 * wordt niet verder doorzocht. Geen of meer dan één zulke lijst: een fout. Het pad komt in het rapport.
 */
export function lijstVanBkPagina(pagina: unknown): { lijst: unknown[]; pad: string } | { fout: string } {
  const gevonden: { lijst: unknown[]; pad: string }[] = [];
  const zoek = (v: unknown, pad: string, diepte: number): void => {
    if (diepte > MAX_ZOEKDIEPTE) return;
    if (Array.isArray(v)) {
      if (v.some((x) => isObject(x) && heeft(x, LIJST_SLEUTEL))) {
        gevonden.push({ lijst: v, pad: pad === '' ? '(hoofdniveau)' : pad });
        return;
      }
      v.forEach((x, i) => zoek(x, `${pad}[${i}]`, diepte + 1));
      return;
    }
    if (isObject(v)) {
      for (const sleutel of Object.keys(v).sort()) zoek(v[sleutel], pad === '' ? sleutel : `${pad}.${sleutel}`, diepte + 1);
    }
  };
  zoek(pagina, '', 0);
  if (gevonden.length === 0) return { fout: 'Op de pagina staat geen lijst met beroepskwalificaties (objecten met beroepskwalificatie_nr).' };
  if (gevonden.length > 1) {
    return { fout: `Op de pagina staan ${gevonden.length} lijsten met beroepskwalificaties (${gevonden.map((g) => g.pad).join(', ')}); welke de juiste is, is niet zeker.` };
  }
  return gevonden[0];
}

/**
 * Eén element van de BK-lijst: `beroepskwalificatie_nr` (op `BK_NUMMER`) en de laatst erkende versie
 * (`laatst_erkende_versie`, T1). Zonder laatst erkende versie: geen probleem (dan is er geen). Een
 * versie die niet bij het nummer hoort of niet te lezen is: een probleem. De lijst is een zachte bron
 * (F3-B6): het script maakt van een probleem hier een waarschuwing.
 */
export function normaliseerBkLijstItem(raw: unknown): { nummer?: string; laatstErkend?: string; problemen: string[] } {
  const problemen: string[] = [];
  const e = enkel(raw);
  const item = e.waarde;
  if (!isObject(item)) {
    problemen.push(`Een element van de BK-lijst is geen object (${toon(raw)}).`);
    return { problemen };
  }
  const ruwNr = eigen(item, LIJST_SLEUTEL);
  const nummer = tekstUit(ruwNr);
  if (nummer === undefined || !BK_NUMMER.test(nummer)) {
    problemen.push(`Een element van de BK-lijst heeft geen nummer dat op BK-0000 past (${toon(ruwNr)}).`);
    return { problemen };
  }
  const uit: { nummer?: string; laatstErkend?: string; problemen: string[] } = { nummer, problemen };
  const r = leesVerwijzing(eigen(item, 'laatst_erkende_versie'), nummer, false);
  if (r.soort === 'bk') {
    if (splitsBk(r.bk)?.nummer !== nummer) problemen.push(`${nummer}: de laatst erkende versie ${r.bk} hoort niet bij dit nummer.`);
    else uit.laatstErkend = r.bk;
  } else if (r.soort === 'fout') {
    problemen.push(`${nummer}: de laatst erkende versie is niet te lezen: ${r.reden}.`);
  } else if (r.soort !== 'leeg') {
    problemen.push(`${nummer}: de laatst erkende versie heeft een onbekende vorm (${toon(eigen(item, 'laatst_erkende_versie'))}).`);
  }
  return uit;
}

// ── Het detail van een structuuronderdeel ───────────────────────────────────

/**
 * Velden van een erkenning die we bewust niet bewaren: adressen (nooit gevolgd), en tekst of gegevens
 * die al in de matrix staan of niet bij de koppeling horen. Omschrijving en doorstroomprofiel zijn HTML
 * van enkele kB per onderdeel; `bijkomende_toelatingsvoorwaarden` (ronde 6, onderdeel 5: een lijst van
 * {omschrijving}) is net zo'n tekst over de richting, niet over haar beroepskwalificaties, en zou in de
 * koppeling komen die de app bij elke richtingpagina laadt; leerjaren staan in de matrix. De
 * veldinventaris in het rapport toont ze wel.
 */
const WEG_UIT_ERKENNING: readonly string[] = [
  'api_url', 'curriculumdossier', 'omschrijving', 'doorstroomprofiel', 'bijkomende_toelatingsvoorwaarden', 'leerjaren', 'led_onderwerp', 'isced',
];

interface Context {
  plaats: string;
  problemen: string[];
  waarschuwingen: string[];
  vormOnbekend: number;
}

/** Een element van de lijst `beroepskwalificaties` van een erkenning. */
function leesKoppelingBk(item: unknown, c: Context): KoppelingBk | undefined {
  const r = leesVerwijzing(item);
  if (r.soort === 'leeg') return undefined;
  if (r.soort === 'dbk') {
    c.waarschuwingen.push(`${c.plaats}: de deelkwalificatie ${r.dbk} staat in de lijst van beroepskwalificaties; ze wordt niet gekoppeld.`);
    return undefined;
  }
  if (r.soort === 'fout') {
    c.problemen.push(`${c.plaats}: een beroepskwalificatie is niet te lezen: ${r.reden}.`);
    return undefined;
  }
  if (r.soort === 'onbekend') {
    c.problemen.push(`${c.plaats}: een beroepskwalificatie past niet op BK-0000-0 en is geen deelkwalificatie (${toon(item)}).`);
    return undefined;
  }
  const uit: KoppelingBk = { bk: r.bk };
  const l = lezer(r.rest);
  const titelRuw = eigen(r.rest, 'titel');
  const titel = typeof titelRuw === 'string' || typeof titelRuw === 'number' ? eenvoudigeTekst(titelRuw) : undefined;
  if (titel !== undefined || isLeeg(titelRuw)) l.gelezen.add('titel');
  if (titel !== undefined) uit.titel = titel;
  const extra = rest(l, [], `${c.plaats}, ${r.bk}`, c.waarschuwingen);
  if (extra !== undefined) uit.extra = extra;
  return uit;
}

/** Een vlag: true, "true" of 1 → true; false, "false" of 0 → false; anders `undefined` (onleesbaar). */
function vlag(v: unknown): boolean | undefined {
  const w = enkel(v).waarde;
  if (w === true || w === 1) return true;
  if (w === false || w === 0) return false;
  if (typeof w === 'string') {
    const t = w.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return undefined;
}

/**
 * Een studiebekrachtiging (T3, F3-B14: alleen bij naam). Zonder naam of in een onbekende vorm: een
 * waarschuwing, en ze valt weg. Een BK- of DBK-verwijzing die niet te lezen is: een waarschuwing en
 * "vorm onbekend"; de studiebekrachtiging blijft bij naam, de ruwe verwijzing in `extra`. Nooit een probleem.
 */
function leesBekrachtiging(item: unknown, c: Context): Bekrachtiging | undefined {
  if (typeof item === 'string') {
    const naam = item.trim();
    return naam === '' ? undefined : { naam };
  }
  if (!isObject(item)) {
    c.vormOnbekend++;
    c.waarschuwingen.push(`${c.plaats}: een studiebekrachtiging heeft een onbekende vorm (${toon(item)}).`);
    return undefined;
  }
  const l = lezer(item);
  // De naam: `uitgebreide_naam`, anders `naam`. Een onleesbaar naamveld blijft in extra; `naam` ook als
  // het verschilt van de uitgebreide naam.
  const langRuw = eigen(item, 'uitgebreide_naam');
  const uitgebreid = tekstUit(langRuw, []);
  if (uitgebreid !== undefined || isLeeg(langRuw)) l.gelezen.add('uitgebreide_naam');
  const kortRuw = eigen(item, 'naam');
  const kort = tekstUit(kortRuw, []);
  if (isLeeg(kortRuw) || (kort !== undefined && (uitgebreid === undefined || kort === uitgebreid))) l.gelezen.add('naam');
  const naam = uitgebreid ?? kort;
  if (naam === undefined) {
    c.vormOnbekend++;
    c.waarschuwingen.push(`${c.plaats}: een studiebekrachtiging zonder naam valt weg (${toon(item)}).`);
    return undefined;
  }
  const b: Bekrachtiging = { naam };
  const plaats = `${c.plaats}, studiebekrachtiging ${toon(naam)}`;
  const extra: Record<string, unknown> = {};

  const ok = eigen(item, 'onderwijskwalificatie');
  const okVlag = vlag(ok);
  if (isLeeg(ok) || okVlag !== undefined) l.gelezen.add('onderwijskwalificatie');
  else c.waarschuwingen.push(`${plaats}: "onderwijskwalificatie" is geen ja/nee-waarde (${toon(ok)}).`);
  if (okVlag === true) b.onderwijskwalificatie = true;

  // Een studiebekrachtiging telt alleen bij naam (F3-B14): een BK-verwijzing die niet te lezen is of
  // zichzelf tegenspreekt, is hier "vorm onbekend" (T3) met een waarschuwing, geen probleem. De ruwe
  // waarde blijft in `extra` (zonder adressen) en de naam blijft. Poort P4 geldt voor de lijst
  // `beroepskwalificaties` van de erkenning: die maakt de koppeling.
  const bkRuw = eigen(item, 'beroepskwalificatie');
  const bk = leesVerwijzing(bkRuw);
  if (bk.soort === 'leeg') {
    l.gelezen.add('beroepskwalificatie');
  } else if (bk.soort === 'bk' || bk.soort === 'dbk') {
    l.gelezen.add('beroepskwalificatie');
    if (bk.soort === 'bk') b.bk = bk.bk;
    else b.dbk = bk.dbk;
    // De titel van een BK staat al in de koppeling en het BK-bestand; die van een DBK niet.
    const overschot = bk.soort === 'bk' ? restVan(bk.rest, ['titel']) : bk.rest;
    zetExtra(extra, 'beroepskwalificatie', overschot, plaats, c.waarschuwingen);
  } else {
    c.vormOnbekend++;
    const waarom = bk.soort === 'fout' ? `is niet te lezen: ${bk.reden}` : `heeft een onbekende vorm (${toon(bkRuw)})`;
    c.waarschuwingen.push(`${plaats}: de beroepskwalificatie ${waarom}; de studiebekrachtiging blijft bij naam.`);
  }

  const dbkRuw = eigen(item, 'deelkwalificatie');
  const dbk = leesVerwijzing(dbkRuw);
  if (dbk.soort === 'leeg') {
    l.gelezen.add('deelkwalificatie');
  } else if (dbk.soort === 'dbk' && (b.dbk === undefined || b.dbk === dbk.dbk)) {
    l.gelezen.add('deelkwalificatie');
    b.dbk = dbk.dbk;
    zetExtra(extra, 'deelkwalificatie', dbk.rest, plaats, c.waarschuwingen);
  } else {
    c.vormOnbekend++;
    c.waarschuwingen.push(`${plaats}: de deelkwalificatie heeft een onbekende vorm (${toon(dbkRuw)}).`);
  }

  const overig = rest(l, [], plaats, c.waarschuwingen);
  if (overig !== undefined) for (const k of Object.keys(overig)) zet(extra, k, overig[k]);
  if (Object.keys(extra).length > 0) {
    const gesorteerd: Record<string, unknown> = {};
    for (const k of Object.keys(extra).sort()) zet(gesorteerd, k, extra[k]);
    b.extra = gesorteerd;
  }
  return b;
}

/**
 * Volgorde van studiebekrachtigingen in een erkenning: naam, bk, dbk, onderwijskwalificatie, extra; los
 * van de taalinstellingen (zie de kop van dit bestand). Het script gebruikt ze na elke samenvoeging. Voor
 * genormaliseerde of gevalideerde gegevens: alleen een `extra` dieper dan MAX_VAST_DIEPTE doet ze gooien.
 */
export function vergelijkBekrachtiging(a: Bekrachtiging, b: Bekrachtiging): number {
  return (
    vergelijkNatuurlijk(a.naam, b.naam) ||
    (a.bk === b.bk ? 0 : a.bk === undefined ? -1 : b.bk === undefined ? 1 : vergelijkBkVersie(a.bk, b.bk)) ||
    vergelijkOptioneel(a.dbk, b.dbk) ||
    (a.onderwijskwalificatie === b.onderwijskwalificatie ? 0 : a.onderwijskwalificatie ? 1 : -1) ||
    vergelijkNatuurlijk(vast(a.extra ?? {}), vast(b.extra ?? {}))
  );
}

/** Een lijst uit de API: een lijst, of één object of tekst als lijst met één element; lege elementen vallen weg. */
function alsLijst(v: unknown): unknown[] {
  return (Array.isArray(v) ? v : [v]).filter((x) => !isLeeg(x));
}

/** Eén erkenning (`structuuronderdeel_details[i]`). Zonder bruikbaar ADV-nummer of met een onleesbare status of datum: een probleem. */
function leesErkenning(x: unknown, plaats: string, c: Omit<Context, 'plaats'>): Erkenning | undefined {
  if (!isObject(x)) {
    c.problemen.push(`${plaats}: een erkenning is geen object (${toon(x)}).`);
    return undefined;
  }
  const l = lezer(x);
  // Het ADV-nummer: `structuuronderdeel_detail_nummer`, anders `nummer` (zoals studierichtingen.ts).
  const advSleutel = isLeeg(eigen(x, 'structuuronderdeel_detail_nummer')) && !isLeeg(eigen(x, 'nummer')) ? 'nummer' : 'structuuronderdeel_detail_nummer';
  const advRuw = lees(l, advSleutel);
  const adv = tekstUit(advRuw);
  if (adv === undefined || !ADV_NUMMER.test(adv)) {
    c.problemen.push(`${plaats}: een erkenning heeft geen ADV-nummer dat op ADV-0000 past (${toon(advRuw)}).`);
    return undefined;
  }
  const waar = `${plaats}, ${adv}`;
  const ctx: Context = { plaats: waar, problemen: c.problemen, waarschuwingen: c.waarschuwingen, vormOnbekend: 0 };
  const e: Erkenning = { adv, bks: [], bekrachtigingen: [] };

  const versieSleutel = isLeeg(eigen(x, 'structuuronderdeel_detail_versie')) && !isLeeg(eigen(x, 'versie')) ? 'versie' : 'structuuronderdeel_detail_versie';
  const versieRuw = eigen(x, versieSleutel);
  const versie = tekstUit(versieRuw);
  // Een onleesbare versie blijft letterlijk in extra.
  if (versie !== undefined || isLeeg(versieRuw)) l.gelezen.add(versieSleutel);
  if (versie !== undefined) e.versie = versie;

  const statusRuw = lees(l, 'status');
  if (!isLeeg(statusRuw)) {
    const status = tekstUit(statusRuw, ['code', 'omschrijving']);
    if (status === undefined) c.problemen.push(`${waar}: de status is niet te lezen (${toon(statusRuw)}).`);
    else e.status = status;
  }
  for (const veld of ['begindatum', 'einddatum'] as const) {
    const ruw = lees(l, veld);
    if (isLeeg(ruw)) continue;
    const d = datumUit(enkel(ruw).waarde);
    if (d === undefined) c.problemen.push(`${waar}: de ${veld} is geen geldige datum (${toon(ruw)}).`);
    else e[veld] = d;
  }

  // De beroepskwalificaties: geen veld (of null) is iets anders dan een lege lijst.
  const bksRuw = lees(l, 'beroepskwalificaties');
  if (bksRuw === undefined || bksRuw === null) {
    e.geenLijst = true;
  } else if (Array.isArray(bksRuw) || isObject(bksRuw) || typeof bksRuw === 'string') {
    const perBk = new Map<string, KoppelingBk[]>();
    for (const item of alsLijst(bksRuw)) {
      const k = leesKoppelingBk(item, ctx);
      if (k === undefined) continue;
      const lijst = perBk.get(k.bk);
      if (lijst === undefined) perBk.set(k.bk, [k]);
      else lijst.push(k);
    }
    for (const [bk, lijst] of perBk) {
      // Dubbel: de kleinste titel en de kleinste rest winnen, zodat de volgorde in de API niets uitmaakt.
      const titels = [...new Set(lijst.map((k) => k.titel).filter((t): t is string => t !== undefined))].sort();
      const resten = [...new Set(lijst.map((k) => (k.extra === undefined ? '' : vast(k.extra))))].sort();
      if (titels.length > 1 || resten.length > 1) c.waarschuwingen.push(`${waar}: ${bk} staat er meer dan één keer, met andere gegevens.`);
      const gekozen: KoppelingBk = { bk };
      if (titels.length > 0) gekozen.titel = titels[0];
      const metExtra = lijst.find((k) => k.extra !== undefined && vast(k.extra) === resten.find((r) => r !== ''));
      if (metExtra?.extra !== undefined) gekozen.extra = metExtra.extra;
      e.bks.push(gekozen);
    }
    e.bks.sort((a, b) => vergelijkBkVersie(a.bk, b.bk));
  } else {
    c.problemen.push(`${waar}: de lijst van beroepskwalificaties heeft een onbekende vorm (${toon(bksRuw)}).`);
  }

  const sbRuw = eigen(x, 'studiebekrachtigingen');
  if (isLeeg(sbRuw) || Array.isArray(sbRuw) || isObject(sbRuw)) {
    l.gelezen.add('studiebekrachtigingen');
    const gezien = new Set<string>();
    for (const item of isLeeg(sbRuw) ? [] : alsLijst(sbRuw)) {
      const b = leesBekrachtiging(item, ctx);
      if (b === undefined) continue;
      const sleutel = vast(b);
      if (gezien.has(sleutel)) {
        c.waarschuwingen.push(`${waar}: de studiebekrachtiging ${toon(b.naam)} staat er twee keer in.`);
        continue;
      }
      gezien.add(sleutel);
      e.bekrachtigingen.push(b);
    }
    e.bekrachtigingen.sort(vergelijkBekrachtiging);
  } else {
    ctx.vormOnbekend++;
    c.waarschuwingen.push(`${waar}: de studiebekrachtigingen hebben een onbekende vorm (${toon(sbRuw)}).`);
  }

  const extra = rest(l, WEG_UIT_ERKENNING, waar, c.waarschuwingen);
  if (extra !== undefined) e.extra = extra;
  c.vormOnbekend += ctx.vormOnbekend;
  return e;
}

/**
 * Volgorde van erkenningen: begindatum (zonder begindatum eerst), dan ADV-nummer. Vult het script een
 * datum aan uit de matrix (T2), dan sorteert het opnieuw met deze functie.
 */
export function vergelijkErkenning(a: Erkenning, b: Erkenning): number {
  return vergelijkOptioneel(a.begindatum, b.begindatum) || vergelijkNatuurlijk(a.adv, b.adv);
}

/** De naam van een onverwachte fout, voor een melding (nooit de tekst: daar kan van alles in staan). */
function foutNaam(e: unknown): string {
  return e instanceof TeDiep ? 'te diep genest' : e instanceof Error ? e.name : 'onbekende fout';
}

/**
 * Het detail van één structuuronderdeel (`…/structuuronderdeel/{nummer}`): alle erkenningen met hun
 * beroepskwalificaties en studiebekrachtigingen. `nummer` is wat het antwoord ZELF zegt; ontbreekt het
 * of verschilt het van `gevraagd`, dan is dat een probleem (P3) en komen er geen erkenningen terug.
 * Problemen (naar de poorten): een element van de lijst `beroepskwalificaties` dat niet op `BK_VERSIE`
 * past en geen DBK is, of waarvan de versie niet met haar nummer begint (P4); een erkenning zonder
 * ADV-nummer, met een onleesbare status of datum, of twee keer met andere gegevens. Waarschuwingen (naar
 * het rapport): een studiebekrachtiging in een onbekende vorm (ook met een onleesbare BK-verwijzing: die
 * telt alleen bij naam, T3), een te lang of te diep veld in `extra`, een detail zonder erkenningen.
 * Gooit nooit: een onverwachte fout bij het lezen wordt een probleem, zonder erkenningen.
 */
export function normaliseerOnderdeelDetail(raw: unknown, gevraagd: number): OnderdeelDetailUitkomst {
  const uit: OnderdeelDetailUitkomst = { erkenningen: [], velden: [], problemen: [], waarschuwingen: [], vormOnbekend: 0 };
  try {
    leesOnderdeelDetail(raw, gevraagd, uit);
  } catch (e) {
    uit.erkenningen = [];
    uit.problemen.push(`Onderdeel ${toon(gevraagd)}: het antwoord is niet te lezen (${foutNaam(e)}).`);
  }
  return uit;
}

function leesOnderdeelDetail(raw: unknown, gevraagd: number, uit: OnderdeelDetailUitkomst): void {
  uit.velden = veldenVan(raw);
  const plaats = `Onderdeel ${typeof gevraagd === 'number' ? gevraagd : toon(gevraagd)}`;
  if (positiefGeheel(gevraagd) === undefined || typeof gevraagd !== 'number') {
    uit.problemen.push(`${plaats}: het gevraagde nummer is geen geheel getal groter dan 0.`);
    return;
  }
  const e = enkel(raw);
  const detail = e.waarde;
  if (!isObject(detail)) {
    uit.problemen.push(`${plaats}: het antwoord is geen object (${toon(raw)}).`);
    return;
  }
  const nummerRuw = eigen(detail, 'structuuronderdeel_nummer');
  const nummer = positiefGeheel(enkel(nummerRuw).waarde);
  if (nummer === undefined) {
    uit.problemen.push(`${plaats}: het detail noemt geen eigen nummer (${toon(nummerRuw)}).`);
    return;
  }
  uit.nummer = nummer;
  if (nummer !== gevraagd) {
    uit.problemen.push(`${plaats}: het detail gaat over onderdeel ${nummer}. De API negeert het gevraagde nummer.`);
    return;
  }
  const groepRuw = eigen(detail, 'structuuronderdeel_groep');
  const groep = tekstUit(groepRuw, ['structuuronderdeel_groep_nummer', 'nummer']);
  if (groep !== undefined && GROEP_NUMMER.test(groep)) uit.groep = groep;
  else if (!isLeeg(groepRuw)) uit.waarschuwingen.push(`${plaats}: de groep van het detail is niet te lezen (${toon(groepRuw)}).`);

  const details = eigen(detail, 'structuuronderdeel_details');
  if (isLeeg(details)) {
    uit.waarschuwingen.push(`${plaats}: het detail heeft geen erkenningen.`);
    return;
  }
  if (!Array.isArray(details) && !isObject(details)) {
    uit.problemen.push(`${plaats}: de erkenningen hebben een onbekende vorm (${toon(details)}).`);
    return;
  }
  const c = { problemen: uit.problemen, waarschuwingen: uit.waarschuwingen, vormOnbekend: 0 };
  const perAdv = new Map<string, Erkenning>();
  for (const item of alsLijst(details)) {
    const erkenning = leesErkenning(item, plaats, c);
    if (erkenning === undefined) continue;
    const vorige = perAdv.get(erkenning.adv);
    if (vorige === undefined) perAdv.set(erkenning.adv, erkenning);
    else if (vast(vorige) !== vast(erkenning)) uit.problemen.push(`${plaats}: de erkenning ${erkenning.adv} staat er meer dan één keer, met andere gegevens.`);
  }
  uit.vormOnbekend = c.vormOnbekend;
  uit.erkenningen = [...perAdv.values()].sort(vergelijkErkenning);
}

// ── Het detail van een BK-versie ────────────────────────────────────────────

/** Velden van een BK-versie die we bewust niet bewaren: adressen, en `nieuwste_versie` (wisselt bij elke nieuwe versie, zonder dat de inhoud verandert). */
const WEG_UIT_BK: readonly string[] = ['api_url', 'curriculumdossier', 'links', 'nieuwste_versie'];

/** Kennis of vaardigheden: een lijst van tekst of objecten {<soort>_type, waarde}. */
function leesTeksten(ruw: unknown, typeVeld: string, wat: string, plaats: string, problemen: string[], waarschuwingen: string[]): BkTekst[] {
  const uit: BkTekst[] = [];
  if (isLeeg(ruw)) return uit;
  for (const el of alsLijst(ruw)) {
    let tekst: string | undefined;
    let type: string | undefined;
    if (isObject(el)) {
      const l = lezer(el);
      const waardeRuw = isLeeg(eigen(el, 'waarde')) ? lees(l, 'tekst') : lees(l, 'waarde');
      l.gelezen.add('waarde');
      if (isLeeg(waardeRuw)) {
        waarschuwingen.push(`${plaats}: ${wat} zonder tekst valt weg (${toon(el)}).`);
        continue;
      }
      tekst = eenvoudigeTekst(enkel(waardeRuw).waarde);
      if (tekst === undefined) {
        problemen.push(`${plaats}: ${wat} zonder leesbare tekst (${toon(el)}).`);
        continue;
      }
      const typeSleutel = isLeeg(eigen(el, typeVeld)) && !isLeeg(eigen(el, 'type')) ? 'type' : typeVeld;
      const typeRuw = eigen(el, typeSleutel);
      type = tekstUit(typeRuw);
      if (type !== undefined || isLeeg(typeRuw)) l.gelezen.add(typeSleutel);
      const over = Object.keys(el).filter((k) => !l.gelezen.has(k) && !isLeeg(el[k]) && !NOOIT_BEWAREN.includes(k));
      if (over.length > 0) waarschuwingen.push(`${plaats}: ${wat} met onbekende velden (${over.map((k) => `"${k}"`).join(', ')}); die vallen weg.`);
    } else {
      tekst = eenvoudigeTekst(el);
      if (tekst === undefined) {
        problemen.push(`${plaats}: ${wat} in een onbekende vorm (${toon(el)}).`);
        continue;
      }
    }
    if (bevatHtml(tekst)) waarschuwingen.push(`${plaats}: HTML in ${wat} (${toon(tekst)}).`);
    const t: BkTekst = { tekst };
    if (type !== undefined) t.type = type;
    uit.push(t);
  }
  return uit;
}

/** Referenties: tekst of {referentie_nr}. Is één element anders, dan blijft de hele lijst in `extra`. */
function leesReferenties(ruw: unknown): string[] | undefined {
  if (isLeeg(ruw)) return [];
  const uit: string[] = [];
  for (const el of alsLijst(ruw)) {
    let t: string | undefined;
    if (isObject(el)) {
      const over = Object.keys(el).filter((k) => k !== 'referentie_nr' && !isLeeg(el[k]) && !NOOIT_BEWAREN.includes(k));
      if (over.length > 0) return undefined;
      t = eenvoudigeTekst(enkel(eigen(el, 'referentie_nr')).waarde);
    } else {
      t = eenvoudigeTekst(el);
    }
    if (t === undefined) return undefined;
    uit.push(t);
  }
  return [...new Set(uit)].sort(vergelijkNatuurlijk);
}

function leesCompetentie(x: unknown, i: number, plaats: string, problemen: string[], waarschuwingen: string[]): Competentie | undefined {
  const waar = `${plaats}, competentie ${i + 1}`;
  if (!isObject(x)) {
    problemen.push(`${waar}: is geen object (${toon(x)}).`);
    return undefined;
  }
  const l = lezer(x);
  const idRuw = lees(l, 'competentie_code');
  const id = tekstUit(idRuw, []);
  if (id === undefined || !COMPETENTIE_CODE.test(id)) {
    problemen.push(`${waar}: geen geldige competentiecode (${toon(idRuw)}).`);
    return undefined;
  }
  const tekstRuw = isLeeg(eigen(x, 'waarde')) ? lees(l, 'tekst') : lees(l, 'waarde');
  l.gelezen.add('waarde');
  const tekst = eenvoudigeTekst(enkel(tekstRuw).waarde);
  if (tekst === undefined) {
    problemen.push(`${waar}: de competentie heeft geen tekst.`);
    return undefined;
  }
  if (bevatHtml(tekst)) waarschuwingen.push(`${waar}: HTML in de tekst (${toon(tekst)}).`);
  const c: Competentie = { id, tekst, kennis: [], vaardigheden: [] };

  const nrRuw = lees(l, 'nr');
  if (isLeeg(nrRuw)) {
    waarschuwingen.push(`${waar}: de competentie heeft geen nr.`);
  } else {
    const nr = positiefGeheel(enkel(nrRuw).waarde);
    if (nr === undefined) waarschuwingen.push(`${waar}: het nr ${toon(nrRuw)} is geen geheel getal groter dan 0 en valt weg.`);
    else c.nr = nr;
  }
  const type = tekstUit(eigen(x, 'competentie_type'));
  if (type !== undefined || isLeeg(eigen(x, 'competentie_type'))) l.gelezen.add('competentie_type');
  if (type !== undefined) c.type = type;

  const aantalProblemen = problemen.length;
  c.kennis = leesTeksten(lees(l, 'kennis'), 'kennis_type', 'kennis', waar, problemen, waarschuwingen);
  c.vaardigheden = leesTeksten(lees(l, 'vaardigheden'), 'vaardigheid_type', 'een vaardigheid', waar, problemen, waarschuwingen);
  if (problemen.length > aantalProblemen) return undefined;

  const refRuw = eigen(x, 'referenties');
  const referenties = leesReferenties(refRuw);
  if (referenties === undefined) {
    waarschuwingen.push(`${waar}: de referenties hebben een onbekende vorm; ze blijven in "extra".`);
  } else {
    l.gelezen.add('referenties');
    if (referenties.length > 0) c.referenties = referenties;
  }
  const extra = rest(l, WEG_UIT_BK, waar, waarschuwingen);
  if (extra !== undefined) c.extra = extra;
  return c;
}

/**
 * Het detail van één BK-versie (`…/beroepskwalificatie/BK-0390-2`). Het antwoord moet een object
 * `beroepskwalificatie` hebben dat over de gevraagde versie gaat; anders ontbreekt `bk` (P3). Een
 * probleem in de inhoud (geen titel, geen competenties, een competentie zonder geldige code of tekst,
 * een dubbele code, kennis of een vaardigheid zonder tekst) maakt de versie onbruikbaar: `bk` staat er,
 * `inhoud` niet. Waarschuwingen: een ontbrekend of dubbel `nr`, HTML in een tekst, een `vks_niveau`
 * dat geen geheel getal van 1 tot 8 is, een te lang of te diep veld in `extra`. Gooit nooit: een
 * onverwachte fout bij het lezen wordt een probleem, zonder `inhoud` (na de controle van de versie is
 * de versie dan onbruikbaar, ervoor negeert het detail de vraag).
 */
export function normaliseerBkDetail(raw: unknown, gevraagd: string): BkDetailUitkomst {
  const uit: BkDetailUitkomst = { velden: [], problemen: [], waarschuwingen: [] };
  try {
    leesBkDetail(raw, gevraagd, uit);
  } catch (e) {
    delete uit.inhoud;
    const plaats = typeof gevraagd === 'string' && BK_VERSIE.test(gevraagd) ? gevraagd : toon(gevraagd);
    uit.problemen.push(`${plaats}: het antwoord is niet te lezen (${foutNaam(e)}).`);
  }
  return uit;
}

function leesBkDetail(raw: unknown, gevraagd: string, uit: BkDetailUitkomst): void {
  uit.velden = veldenVan(raw);
  if (typeof gevraagd !== 'string' || !BK_VERSIE.test(gevraagd)) {
    uit.problemen.push(`De gevraagde versie ${toon(gevraagd)} past niet op BK-0000-0.`);
    return;
  }
  const plaats = gevraagd;
  const bkRuw = isObject(raw) ? enkel(eigen(raw, 'beroepskwalificatie')) : { waarde: undefined, meerwaardig: false };
  const bkObj = bkRuw.waarde;
  if (!isObject(bkObj)) {
    uit.problemen.push(`${plaats}: het antwoord heeft geen object "beroepskwalificatie"${bkRuw.meerwaardig ? ' (meer dan één)' : ''}.`);
    return;
  }
  // Alleen de velden van T1 tellen voor de identiteit: geen versie uit een willekeurig ander veld.
  const versie = leesVerwijzing(bkObj, undefined, false);
  if (versie.soort !== 'bk') {
    uit.problemen.push(`${plaats}: het detail noemt geen bruikbare versie${versie.soort === 'fout' ? `: ${versie.reden}` : ''}.`);
    return;
  }
  if (versie.bk !== gevraagd) {
    uit.problemen.push(`${plaats}: het detail gaat over ${versie.bk}. De API negeert de gevraagde versie.`);
    return;
  }
  uit.bk = gevraagd;

  const l = lezer(bkObj);
  for (const veld of BK_VELDEN) l.gelezen.add(veld);
  const problemen: string[] = [];
  const titel = tekstUit(lees(l, 'titel'), []);
  if (titel === undefined) problemen.push(`${plaats}: de beroepskwalificatie heeft geen titel.`);

  // Status: de code (statuscode "ERKEND") gaat voor het label (status "erkend"); een afwijkend label blijft in extra.
  const code = tekstUit(eigen(bkObj, 'statuscode'));
  const label = tekstUit(eigen(bkObj, 'status'));
  const status = code ?? label;
  if (code !== undefined || isLeeg(eigen(bkObj, 'statuscode'))) l.gelezen.add('statuscode');
  if (label === undefined ? isLeeg(eigen(bkObj, 'status')) : code === undefined || label.toUpperCase() === code.toUpperCase()) l.gelezen.add('status');

  const vksRuw = eigen(bkObj, 'vks_niveau');
  const vks = positiefGeheel(enkel(vksRuw).waarde);
  if (vks !== undefined && vks <= 8) l.gelezen.add('vks_niveau');
  else if (!isLeeg(vksRuw)) uit.waarschuwingen.push(`${plaats}: het VKS-niveau ${toon(vksRuw)} is geen geheel getal van 1 tot 8; het blijft in "extra".`);
  else l.gelezen.add('vks_niveau');

  const definitieRuw = eigen(bkObj, 'definitie');
  const definitie = tekstUit(definitieRuw, []);
  if (definitie !== undefined || isLeeg(definitieRuw)) l.gelezen.add('definitie');
  if (definitie !== undefined && bevatHtml(definitie)) uit.waarschuwingen.push(`${plaats}: HTML in de definitie (${toon(definitie)}).`);

  const compRuw = lees(l, 'competenties');
  const competenties: Competentie[] = [];
  if (isLeeg(compRuw)) {
    problemen.push(`${plaats}: de beroepskwalificatie heeft geen competenties.`);
  } else if (!Array.isArray(compRuw) && !isObject(compRuw)) {
    problemen.push(`${plaats}: de competenties hebben een onbekende vorm (${toon(compRuw)}).`);
  } else {
    const gezien = new Set<string>();
    alsLijst(compRuw).forEach((x, i) => {
      const c = leesCompetentie(x, i, plaats, problemen, uit.waarschuwingen);
      if (c === undefined) return;
      if (gezien.has(c.id)) {
        problemen.push(`${plaats}: de competentiecode ${toon(c.id)} staat er meer dan één keer in.`);
        return;
      }
      gezien.add(c.id);
      competenties.push(c);
    });
  }
  const nrs = competenties.map((c) => c.nr).filter((n): n is number => n !== undefined);
  const dubbel = [...new Set(nrs.filter((n, i) => nrs.indexOf(n) !== i))];
  if (dubbel.length > 0) uit.waarschuwingen.push(`${plaats}: het nr ${dubbel.join(', ')} staat er meer dan één keer in; de doelcodes volgen de plaats.`);

  if (problemen.length > 0) {
    uit.problemen.push(...problemen);
    return;
  }
  // Met nr: op nr en dan op code; zonder nr: in de volgorde van de bron, achteraan.
  const metNr = competenties.filter((c) => c.nr !== undefined).sort((a, b) => (a.nr as number) - (b.nr as number) || vergelijkNatuurlijk(a.id, b.id));
  const zonderNr = competenties.filter((c) => c.nr === undefined);
  const inhoud: BkInhoud = { titel: titel as string, competenties: [...metNr, ...zonderNr] };
  if (status !== undefined) inhoud.status = status;
  if (vks !== undefined && vks <= 8) inhoud.vks = vks;
  if (definitie !== undefined) inhoud.definitie = definitie;
  const extra = rest(l, WEG_UIT_BK, plaats, uit.waarschuwingen);
  if (extra !== undefined) inhoud.extra = extra;
  uit.inhoud = inhoud;
}

// ── Validators ──────────────────────────────────────────────────────────────
//
// De validators controleren de vorm die het script schrijft (§ 23.5.2) en geven fouten in het
// Nederlands (leeg = in orde). De sha256-controle zit niet in deze module (geen crypto): de datatest
// rekent `canoniek(…)` na. Ze gooien nooit, ook niet op rare invoer.

const MAX_FOUTEN_PER_SOORT = 10;

/** Verzamelt fouten per soort en beperkt elke soort, zodat een kapot bestand geen duizend regels geeft. */
function verzamelaar(): { voeg: (soort: string, tekst: string) => void; lijst: () => string[] } {
  const perSoort = new Map<string, string[]>();
  return {
    voeg(soort, tekst) {
      let lijst = perSoort.get(soort);
      if (lijst === undefined) perSoort.set(soort, (lijst = []));
      lijst.push(tekst);
    },
    lijst() {
      const uit: string[] = [];
      for (const fouten of perSoort.values()) {
        uit.push(...fouten.slice(0, MAX_FOUTEN_PER_SOORT));
        if (fouten.length > MAX_FOUTEN_PER_SOORT) uit.push(`… en nog ${fouten.length - MAX_FOUTEN_PER_SOORT} van dezelfde soort`);
      }
      return uit;
    },
  };
}

type Fouten = ReturnType<typeof verzamelaar>;

/** Niet-lege tekst zonder witruimte vooraan of achteraan. */
function isNetteTekst(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.trim() === v;
}

function isNatuurlijk(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function isPositief(v: unknown): v is number {
  return isNatuurlijk(v) && v > 0;
}

function controleerVelden(f: Fouten, o: Record<string, unknown>, toegestaan: readonly string[], plaats: string): void {
  const onbekend = Object.keys(o).filter((k) => !toegestaan.includes(k));
  if (onbekend.length > 0) f.voeg('velden', `${plaats}: onbekende velden ${onbekend.map((k) => `"${k}"`).join(', ')}.`);
}

function optioneleTekst(f: Fouten, o: Record<string, unknown>, veld: string, plaats: string): void {
  if (heeft(o, veld) && !isNetteTekst(o[veld])) f.voeg('waarden', `${plaats}: "${veld}" is geen tekst (of leeg).`);
}

function optioneleDatum(f: Fouten, o: Record<string, unknown>, veld: string, plaats: string): void {
  if (heeft(o, veld) && !isDatum(o[veld])) f.voeg('datums', `${plaats}: "${veld}" is geen geldige datum (JJJJ-MM-DD).`);
}

function optioneleWaar(f: Fouten, o: Record<string, unknown>, veld: string, plaats: string): void {
  if (heeft(o, veld) && o[veld] !== true) f.voeg('waarden', `${plaats}: "${veld}" staat er alleen als het true is.`);
}

function controleerKop(f: Fouten, json: Record<string, unknown>, kind: string, velden: readonly string[]): void {
  if (json.app !== 'boosterz') f.voeg('kop', 'Kop: "app" moet "boosterz" zijn.');
  if (json.kind !== kind) f.voeg('kop', `Kop: "kind" moet "${kind}" zijn.`);
  if (json.v !== 1) f.voeg('kop', 'Kop: "v" moet 1 zijn.');
  for (const veld of ['bron', 'naamsvermelding', 'licentie']) {
    if (!isNetteTekst(json[veld])) f.voeg('kop', `Kop: "${veld}" ontbreekt of is leeg.`);
  }
  if (typeof json.api !== 'string' || !json.api.startsWith(OFFICIELE_API)) f.voeg('kop', `Kop: "api" moet met ${OFFICIELE_API} beginnen.`);
  if (!isTijdstip(json.opgehaald)) f.voeg('kop', 'Kop: "opgehaald" is geen tijdstip (JJJJ-MM-DDTUU:MM:SSZ).');
  if (typeof json.sha256 !== 'string' || !SHA256.test(json.sha256)) f.voeg('kop', 'Kop: "sha256" is geen sha256 (64 hex-tekens).');
  controleerVelden(f, json, velden, 'Kop');
}

/** Een waarde in `extra`: geen lege of null-waarden, geen `api_url` of `curriculumdossier`, niet te diep. */
function controleerExtraWaarde(v: unknown, diepte: number): string | undefined {
  if (diepte > MAX_EXTRA_DIEPTE) return 'is te diep genest';
  if (v === null || v === undefined) return 'bevat een lege waarde (null)';
  if (typeof v === 'string') return v.trim() === '' ? 'bevat lege tekst' : undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? undefined : 'bevat een ongeldig getal';
  if (typeof v === 'boolean') return undefined;
  if (Array.isArray(v)) {
    if (v.length === 0) return 'bevat een lege lijst';
    for (const x of v) {
      const fout = controleerExtraWaarde(x, diepte + 1);
      if (fout !== undefined) return fout;
    }
    return undefined;
  }
  if (isObject(v)) {
    const sleutels = Object.keys(v);
    if (sleutels.length === 0) return 'bevat een leeg object';
    for (const k of sleutels) {
      if (NOOIT_BEWAREN.includes(k)) return `bevat "${k}"`;
      const fout = controleerExtraWaarde(v[k], diepte + 1);
      if (fout !== undefined) return fout;
    }
    return undefined;
  }
  return 'bevat iets anders dan JSON';
}

/**
 * De fouten in `extra` van een object (leeg = in orde, ook zonder `extra`). Elk veld met dezelfde grenzen
 * als `zetExtra` bij het normaliseren: de waarde zelf is diepte 0 (zoals in `schoon`), en het veld weegt
 * in JSON hoogstens MAX_EXTRA_VELD bytes. Zo keurt de validator alles goed wat de normalisatie bewaart.
 */
function foutenInExtra(o: Record<string, unknown>, plaats: string): string[] {
  if (!heeft(o, 'extra')) return [];
  const extra = o.extra;
  if (!isObject(extra) || Object.keys(extra).length === 0) return [`${plaats}: "extra" is geen (niet-leeg) object.`];
  const fouten: string[] = [];
  for (const k of Object.keys(extra)) {
    if (NOOIT_BEWAREN.includes(k)) {
      fouten.push(`${plaats}: "extra" bevat "${k}".`);
      continue;
    }
    const fout = controleerExtraWaarde(extra[k], 0);
    if (fout !== undefined) {
      fouten.push(`${plaats}: "extra.${k}" ${fout}.`);
      continue;
    }
    const bytes = utf8Lengte(JSON.stringify(extra[k]));
    if (bytes > MAX_EXTRA_VELD) fouten.push(`${plaats}: "extra.${k}" weegt ${bytes} bytes (meer dan ${MAX_EXTRA_VELD}).`);
  }
  return fouten;
}

function controleerExtra(f: Fouten, o: Record<string, unknown>, plaats: string): void {
  for (const fout of foutenInExtra(o, plaats)) f.voeg('extra', fout);
}

/** Een lijst die strikt oplopend is volgens `vergelijk` (dus ook zonder dubbels). */
function controleerVolgorde<T>(f: Fouten, lijst: readonly T[], vergelijk: (a: T, b: T) => number, plaats: string, wat: string): void {
  for (let i = 1; i < lijst.length; i++) {
    const v = vergelijk(lijst[i - 1], lijst[i]);
    if (v === 0) f.voeg('volgorde', `${plaats}: ${wat} ${toon(lijst[i])} staat er meer dan één keer in.`);
    else if (v > 0) f.voeg('volgorde', `${plaats}: ${wat} ${toon(lijst[i])} staat na ${toon(lijst[i - 1])}, dat is de verkeerde volgorde.`);
  }
}

const KOPPELING_VELDEN = ['app', 'kind', 'v', 'bron', 'api', 'naamsvermelding', 'licentie', 'opgehaald', 'matrixSha256', 'aantalOnderdelen', 'sha256', 'onderdelen'];
const RECORD_VELDEN = ['onderdeel', 'groep', 'status', 'opgehaald', 'nietMeerInBron', 'erkenningen'];
const ERKENNING_VELDEN = ['adv', 'versie', 'status', 'begindatum', 'einddatum', 'bks', 'geenLijst', 'bekrachtigingen', 'extra'];
const KOPPELING_BK_VELDEN = ['bk', 'titel', 'extra'];
const BEKRACHTIGING_VELDEN = ['naam', 'onderwijskwalificatie', 'bk', 'dbk', 'extra'];
const ONDERDEEL_STATUSSEN: readonly string[] = ['opgehaald', 'niet-gevonden', 'nog-niet-opgehaald'];

function controleerErkenning(f: Fouten, e: unknown, plaats: string): Erkenning | undefined {
  if (!isObject(e)) {
    f.voeg('erkenning', `${plaats}: is geen object.`);
    return undefined;
  }
  const adv = typeof e.adv === 'string' && ADV_NUMMER.test(e.adv) ? e.adv : undefined;
  const waar = `${plaats} (${adv ?? toon(e.adv)})`;
  if (adv === undefined) f.voeg('erkenning', `${waar}: het ADV-nummer ${toon(e.adv)} past niet op ADV-0000.`);
  controleerVelden(f, e, ERKENNING_VELDEN, waar);
  optioneleTekst(f, e, 'versie', waar);
  optioneleTekst(f, e, 'status', waar);
  optioneleDatum(f, e, 'begindatum', waar);
  optioneleDatum(f, e, 'einddatum', waar);
  optioneleWaar(f, e, 'geenLijst', waar);
  controleerExtra(f, e, waar);

  if (!Array.isArray(e.bks)) {
    f.voeg('erkenning', `${waar}: "bks" ontbreekt of is geen lijst.`);
  } else {
    if (e.geenLijst === true && e.bks.length > 0) f.voeg('erkenning', `${waar}: "geenLijst" en toch beroepskwalificaties.`);
    const bks: string[] = [];
    e.bks.forEach((k, j) => {
      const w = `${waar}, beroepskwalificatie ${j + 1}`;
      if (!isObject(k)) {
        f.voeg('bk', `${w}: is geen object.`);
        return;
      }
      controleerVelden(f, k, KOPPELING_BK_VELDEN, w);
      if (typeof k.bk !== 'string' || !BK_VERSIE.test(k.bk)) f.voeg('bk', `${w}: ${toon(k.bk)} past niet op BK-0000-0.`);
      else bks.push(k.bk);
      optioneleTekst(f, k, 'titel', w);
      controleerExtra(f, k, w);
    });
    if (bks.length === e.bks.length) controleerVolgorde(f, bks, vergelijkBkVersie, waar, 'de beroepskwalificatie');
  }

  if (!Array.isArray(e.bekrachtigingen)) {
    f.voeg('erkenning', `${waar}: "bekrachtigingen" ontbreekt of is geen lijst.`);
  } else {
    const goed: Bekrachtiging[] = [];
    e.bekrachtigingen.forEach((b, j) => {
      const w = `${waar}, studiebekrachtiging ${j + 1}`;
      if (!isObject(b)) {
        f.voeg('bekrachtiging', `${w}: is geen object.`);
        return;
      }
      controleerVelden(f, b, BEKRACHTIGING_VELDEN, w);
      if (!isNetteTekst(b.naam)) f.voeg('bekrachtiging', `${w}: de naam ontbreekt of is leeg.`);
      optioneleWaar(f, b, 'onderwijskwalificatie', w);
      if (heeft(b, 'bk') && (typeof b.bk !== 'string' || !BK_VERSIE.test(b.bk))) f.voeg('bekrachtiging', `${w}: ${toon(b.bk)} past niet op BK-0000-0.`);
      if (heeft(b, 'dbk') && (typeof b.dbk !== 'string' || !DBK_NUMMER.test(b.dbk))) f.voeg('bekrachtiging', `${w}: ${toon(b.dbk)} past niet op BK-0000-0-DBK-00.`);
      controleerExtra(f, b, w);
      // Alleen een element met de juiste soorten en een geldige extra gaat in de volgordecontrole: die
      // gooit dan nooit (vergelijkBekrachtiging leest extra met vast, dat bij absurde diepte gooit).
      const soortenKloppen = (!heeft(b, 'bk') || typeof b.bk === 'string') && (!heeft(b, 'dbk') || typeof b.dbk === 'string');
      if (isNetteTekst(b.naam) && soortenKloppen && foutenInExtra(b, w).length === 0) goed.push(b as unknown as Bekrachtiging);
    });
    if (goed.length === e.bekrachtigingen.length) controleerVolgorde(f, goed, vergelijkBekrachtiging, waar, 'de studiebekrachtiging');
  }
  // Alleen met een geldig ADV-nummer en een begindatum als tekst (of zonder) gaat ze in de volgordecontrole.
  const begindatumKlopt = !heeft(e, 'begindatum') || typeof e.begindatum === 'string';
  return adv === undefined || !begindatumKlopt ? undefined : (e as unknown as Erkenning);
}

function controleerRecord(f: Fouten, r: unknown, i: number): number | undefined {
  if (!isObject(r)) {
    f.voeg('onderdeel', `Onderdeel op plaats ${i + 1}: is geen object.`);
    return undefined;
  }
  const nummer = isPositief(r.onderdeel) ? r.onderdeel : undefined;
  const plaats = `Onderdeel ${nummer ?? `op plaats ${i + 1}`}`;
  if (nummer === undefined) f.voeg('onderdeel', `${plaats}: het nummer ${toon(r.onderdeel)} is geen geheel getal groter dan 0.`);
  if (typeof r.groep !== 'string' || !GROEP_NUMMER.test(r.groep)) f.voeg('onderdeel', `${plaats}: de groep ${toon(r.groep)} past niet op G-0000.`);
  controleerVelden(f, r, RECORD_VELDEN, plaats);
  const status = typeof r.status === 'string' && ONDERDEEL_STATUSSEN.includes(r.status) ? r.status : undefined;
  if (status === undefined) f.voeg('onderdeel', `${plaats}: de status ${toon(r.status)} is niet "opgehaald", "niet-gevonden" of "nog-niet-opgehaald".`);
  if (heeft(r, 'opgehaald') && !isTijdstip(r.opgehaald)) f.voeg('waarden', `${plaats}: "opgehaald" is geen tijdstip.`);
  optioneleDatum(f, r, 'nietMeerInBron', plaats);
  if (status === 'opgehaald') {
    if (!heeft(r, 'opgehaald')) f.voeg('waarden', `${plaats}: "opgehaald" ontbreekt.`);
    if (!heeft(r, 'erkenningen')) f.voeg('waarden', `${plaats}: "erkenningen" ontbreekt bij een opgehaald onderdeel.`);
    if (heeft(r, 'nietMeerInBron')) f.voeg('waarden', `${plaats}: "nietMeerInBron" hoort niet bij een opgehaald onderdeel.`);
  } else if (status === 'niet-gevonden') {
    if (!heeft(r, 'nietMeerInBron')) f.voeg('waarden', `${plaats}: "nietMeerInBron" ontbreekt bij een onderdeel dat niet gevonden werd.`);
    if (heeft(r, 'erkenningen') && !heeft(r, 'opgehaald')) f.voeg('waarden', `${plaats}: laatst bekende erkenningen zonder "opgehaald".`);
  } else if (status === 'nog-niet-opgehaald') {
    for (const v of ['opgehaald', 'erkenningen', 'nietMeerInBron']) {
      if (heeft(r, v)) f.voeg('waarden', `${plaats}: "${v}" hoort niet bij een onderdeel dat nog niet opgehaald is.`);
    }
  }
  if (heeft(r, 'erkenningen')) {
    if (!Array.isArray(r.erkenningen)) {
      f.voeg('waarden', `${plaats}: "erkenningen" is geen lijst.`);
    } else {
      const goed: Erkenning[] = [];
      r.erkenningen.forEach((e, j) => {
        const g = controleerErkenning(f, e, `${plaats}, erkenning ${j + 1}`);
        if (g !== undefined) goed.push(g);
      });
      if (goed.length === r.erkenningen.length) {
        controleerVolgorde(f, goed, vergelijkErkenning, plaats, 'de erkenning');
        const advs = goed.map((e) => e.adv);
        const dubbel = advs.filter((a, j) => advs.indexOf(a) !== j);
        if (dubbel.length > 0) f.voeg('volgorde', `${plaats}: de erkenning ${[...new Set(dubbel)].join(', ')} staat er meer dan één keer in.`);
      }
    }
  }
  return nummer;
}

/**
 * Controleert de koppeling (§ 23.5.2): de kop (met `matrixSha256` en `aantalOnderdelen`), één record per
 * onderdeel, oplopend en uniek, per status de velden die erbij horen, en per erkenning het ADV-nummer,
 * de datums, de verplichte lijsten `bks` (op `BK_VERSIE`, uniek, met `vergelijkBkVersie`) en
 * `bekrachtigingen` (gesorteerd), en `extra`. Of de onderdelen en groepen in de matrix staan,
 * controleert de datatest.
 */
export function valideerKoppelingBestand(json: unknown): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const f = verzamelaar();
  controleerKop(f, json, KOPPELING_KIND, KOPPELING_VELDEN);
  if (typeof json.matrixSha256 !== 'string' || !SHA256.test(json.matrixSha256)) f.voeg('kop', 'Kop: "matrixSha256" is geen sha256 (64 hex-tekens).');
  const onderdelen = json.onderdelen;
  if (!Array.isArray(onderdelen)) {
    f.voeg('kop', '"onderdelen" ontbreekt of is geen lijst.');
    return f.lijst();
  }
  if (onderdelen.length === 0) f.voeg('kop', 'Er staan geen onderdelen in de koppeling.');
  if (json.aantalOnderdelen !== onderdelen.length) f.voeg('kop', `Kop zegt ${toon(json.aantalOnderdelen)} onderdelen, maar het bestand bevat er ${onderdelen.length}.`);
  const nummers: number[] = [];
  onderdelen.forEach((r, i) => {
    const n = controleerRecord(f, r, i);
    if (n !== undefined) nummers.push(n);
  });
  if (nummers.length === onderdelen.length) controleerVolgorde(f, nummers, (a, b) => a - b, 'Onderdelen', 'het onderdeel');
  return f.lijst();
}

const INDEX_VELDEN = ['app', 'kind', 'v', 'bron', 'api', 'naamsvermelding', 'licentie', 'opgehaald', 'lijstTotaal', 'sha256', 'bks'];
const INDEX_REGEL_VELDEN = [
  'bk', 'nummer', 'versie', 'titel', 'vks', 'status', 'aantal', 'sha256', 'opgehaald', 'bestand', 'laatstErkend', 'nietMeerGekoppeld', 'nietMeerInBron',
  'nietGevonden', 'onbruikbaar',
];

function isVks(v: unknown): v is number {
  return isPositief(v) && v <= 8;
}

function controleerIndexRegel(f: Fouten, r: unknown, i: number): string | undefined {
  if (!isObject(r)) {
    f.voeg('regel', `Regel ${i + 1}: is geen object.`);
    return undefined;
  }
  const delen = typeof r.bk === 'string' ? splitsBk(r.bk) : undefined;
  const bk = delen ? (r.bk as string) : undefined;
  const plaats = `Regel ${bk ?? i + 1}`;
  if (bk === undefined) f.voeg('regel', `${plaats}: ${toon(r.bk)} past niet op BK-0000-0.`);
  controleerVelden(f, r, INDEX_REGEL_VELDEN, plaats);
  if (delen && (r.nummer !== delen.nummer || r.versie !== delen.versie)) f.voeg('regel', `${plaats}: "nummer" en "versie" moeten ${delen.nummer} en ${delen.versie} zijn.`);
  if (!isTijdstip(r.opgehaald)) f.voeg('waarden', `${plaats}: "opgehaald" ontbreekt of is geen tijdstip.`);
  optioneleTekst(f, r, 'titel', plaats);
  optioneleTekst(f, r, 'status', plaats);
  if (heeft(r, 'vks') && !isVks(r.vks)) f.voeg('waarden', `${plaats}: "vks" is geen geheel getal van 1 tot 8.`);
  if (heeft(r, 'aantal') && !isPositief(r.aantal)) f.voeg('waarden', `${plaats}: "aantal" is geen geheel getal groter dan 0.`);
  if (heeft(r, 'sha256') && (typeof r.sha256 !== 'string' || !SHA256.test(r.sha256))) f.voeg('waarden', `${plaats}: "sha256" is geen sha256.`);
  optioneleDatum(f, r, 'nietMeerGekoppeld', plaats);
  optioneleDatum(f, r, 'nietMeerInBron', plaats);
  optioneleWaar(f, r, 'nietGevonden', plaats);
  optioneleWaar(f, r, 'onbruikbaar', plaats);
  if (heeft(r, 'laatstErkend')) {
    const l = typeof r.laatstErkend === 'string' ? splitsBk(r.laatstErkend) : undefined;
    if (l === undefined) f.voeg('waarden', `${plaats}: "laatstErkend" ${toon(r.laatstErkend)} past niet op BK-0000-0.`);
    else if (delen && l.nummer !== delen.nummer) f.voeg('waarden', `${plaats}: "laatstErkend" ${r.laatstErkend as string} hoort bij een ander nummer.`);
  }
  if (heeft(r, 'bestand')) {
    if (bk === undefined || r.bestand !== bkBestandVan(bk)) f.voeg('waarden', `${plaats}: "bestand" moet "${bk === undefined ? 'bk/BK-….json' : bkBestandVan(bk)}" zijn.`);
    for (const v of ['sha256', 'aantal', 'titel']) {
      if (!heeft(r, v)) f.voeg('waarden', `${plaats}: "${v}" ontbreekt bij een versie met een bestand.`);
    }
    for (const v of ['nietGevonden', 'onbruikbaar']) {
      if (heeft(r, v)) f.voeg('waarden', `${plaats}: "${v}" hoort niet bij een versie met een bestand.`);
    }
  } else {
    if ((r.nietGevonden === true) === (r.onbruikbaar === true)) f.voeg('waarden', `${plaats}: zonder bestand staat er precies één van "nietGevonden" en "onbruikbaar".`);
    for (const v of ['sha256', 'aantal', 'nietMeerInBron']) {
      if (heeft(r, v)) f.voeg('waarden', `${plaats}: "${v}" hoort alleen bij een versie met een bestand.`);
    }
  }
  return bk;
}

/**
 * Controleert de index van de BK-versies (§ 23.5.2): de kop, één regel per versie (gesorteerd met
 * `vergelijkBkVersie`, uniek), `nummer` en `versie` die bij `bk` horen, en per regel de velden: met
 * `bestand` ("bk/<bk>.json") ook `sha256`, `aantal` en `titel`; zonder bestand precies één van
 * `nietGevonden` en `onbruikbaar`. Of de bestanden bestaan en kloppen, controleert de datatest.
 */
export function valideerBkIndex(json: unknown): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const f = verzamelaar();
  controleerKop(f, json, BK_INDEX_KIND, INDEX_VELDEN);
  if (heeft(json, 'lijstTotaal') && !isNatuurlijk(json.lijstTotaal)) f.voeg('kop', 'Kop: "lijstTotaal" is geen geheel getal ≥ 0.');
  const bks = json.bks;
  if (!Array.isArray(bks)) {
    f.voeg('kop', '"bks" ontbreekt of is geen lijst.');
    return f.lijst();
  }
  const versies: string[] = [];
  bks.forEach((r, i) => {
    const bk = controleerIndexRegel(f, r, i);
    if (bk !== undefined) versies.push(bk);
  });
  if (versies.length === bks.length) controleerVolgorde(f, versies, vergelijkBkVersie, 'Index', 'de versie');
  return f.lijst();
}

const BK_BESTAND_VELDEN = [
  'app', 'kind', 'v', 'bk', 'nummer', 'versie', 'titel', 'status', 'vks', 'definitie', 'bron', 'api', 'naamsvermelding', 'licentie', 'opgehaald',
  'nietMeerInBron', 'aantal', 'sha256', 'competenties', 'extra',
];
const COMPETENTIE_VELDEN = ['id', 'nr', 'type', 'tekst', 'kennis', 'vaardigheden', 'referenties', 'extra'];

function controleerTeksten(f: Fouten, c: Record<string, unknown>, veld: string, plaats: string): void {
  const lijst = c[veld];
  if (!Array.isArray(lijst)) {
    f.voeg('competentie', `${plaats}: "${veld}" ontbreekt of is geen lijst.`);
    return;
  }
  lijst.forEach((t, k) => {
    const w = `${plaats}, ${veld} ${k + 1}`;
    if (!isObject(t)) {
      f.voeg('competentie', `${w}: is geen object.`);
      return;
    }
    controleerVelden(f, t, ['type', 'tekst'], w);
    if (!isNetteTekst(t.tekst)) f.voeg('competentie', `${w}: de tekst ontbreekt of is leeg.`);
    optioneleTekst(f, t, 'type', w);
  });
}

/**
 * Controleert het bestand van één BK-versie (§ 23.5.2): de kop (met `bk` = de gevraagde versie als
 * `bk` meegegeven is, en `nummer` en `versie` die erbij horen), `aantal` = het aantal competenties
 * (minstens één), en per competentie: een unieke code op `COMPETENTIE_CODE`, een tekst, de lijsten
 * `kennis` en `vaardigheden` (ook leeg), gesorteerde `referenties`; de competenties met `nr` eerst
 * (op nr en code), dan die zonder.
 */
export function valideerBkBestand(json: unknown, bk?: string): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const f = verzamelaar();
  controleerKop(f, json, BK_KIND, BK_BESTAND_VELDEN);
  const delen = typeof json.bk === 'string' ? splitsBk(json.bk) : undefined;
  if (delen === undefined) f.voeg('kop', `Kop: ${toon(json.bk)} past niet op BK-0000-0.`);
  else if (json.nummer !== delen.nummer || json.versie !== delen.versie) f.voeg('kop', `Kop: "nummer" en "versie" moeten ${delen.nummer} en ${delen.versie} zijn.`);
  if (bk !== undefined && json.bk !== bk) f.voeg('kop', `Kop: het bestand hoort bij ${toon(json.bk)}, niet bij ${toon(bk)}.`);
  if (!isNetteTekst(json.titel)) f.voeg('kop', 'Kop: "titel" ontbreekt of is leeg.');
  optioneleTekst(f, json, 'status', 'Kop');
  optioneleTekst(f, json, 'definitie', 'Kop');
  if (heeft(json, 'vks') && !isVks(json.vks)) f.voeg('kop', 'Kop: "vks" is geen geheel getal van 1 tot 8.');
  optioneleDatum(f, json, 'nietMeerInBron', 'Kop');
  controleerExtra(f, json, 'Kop');
  const competenties = json.competenties;
  if (!Array.isArray(competenties)) {
    f.voeg('kop', '"competenties" ontbreekt of is geen lijst.');
    return f.lijst();
  }
  if (competenties.length === 0) f.voeg('kop', 'Er staan geen competenties in het bestand.');
  if (json.aantal !== competenties.length) f.voeg('kop', `Kop zegt ${toon(json.aantal)} competenties, maar het bestand bevat er ${competenties.length}.`);

  const ids = new Set<string>();
  const volgorde: { nr?: number; id: string }[] = [];
  competenties.forEach((c, i) => {
    if (!isObject(c)) {
      f.voeg('competentie', `Competentie ${i + 1}: is geen object.`);
      return;
    }
    const id = typeof c.id === 'string' && COMPETENTIE_CODE.test(c.id) ? c.id : undefined;
    const plaats = `Competentie ${i + 1}`;
    if (id === undefined) f.voeg('competentie', `${plaats}: de code ${toon(c.id)} is geen geldige competentiecode.`);
    else if (ids.has(id)) f.voeg('competentie', `${plaats}: de code ${toon(id)} staat er meer dan één keer in.`);
    else ids.add(id);
    controleerVelden(f, c, COMPETENTIE_VELDEN, plaats);
    if (heeft(c, 'nr') && !isPositief(c.nr)) f.voeg('competentie', `${plaats}: "nr" is geen geheel getal groter dan 0.`);
    optioneleTekst(f, c, 'type', plaats);
    if (!isNetteTekst(c.tekst)) f.voeg('competentie', `${plaats}: de tekst ontbreekt of is leeg.`);
    controleerTeksten(f, c, 'kennis', plaats);
    controleerTeksten(f, c, 'vaardigheden', plaats);
    if (heeft(c, 'referenties')) {
      const refs = c.referenties;
      if (!Array.isArray(refs) || refs.length === 0 || !refs.every(isNetteTekst)) f.voeg('competentie', `${plaats}: "referenties" is geen (niet-lege) lijst van tekst.`);
      else controleerVolgorde(f, refs as string[], vergelijkNatuurlijk, plaats, 'de referentie');
    }
    controleerExtra(f, c, plaats);
    if (id !== undefined) volgorde.push(isPositief(c.nr) ? { nr: c.nr, id } : { id });
  });
  if (volgorde.length === competenties.length) {
    const eersteZonder = volgorde.findIndex((c) => c.nr === undefined);
    if (eersteZonder >= 0 && volgorde.slice(eersteZonder).some((c) => c.nr !== undefined)) {
      f.voeg('volgorde', 'Competenties: een competentie met nr staat na een competentie zonder nr.');
    }
    const metNr = volgorde.filter((c) => c.nr !== undefined);
    controleerVolgorde(f, metNr, (a, b) => (a.nr as number) - (b.nr as number) || vergelijkNatuurlijk(a.id, b.id), 'Competenties', 'de competentie');
  }
  return f.lijst();
}
