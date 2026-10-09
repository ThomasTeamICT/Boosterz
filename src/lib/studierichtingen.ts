// Studierichtingen: de matrix (API Structuuronderdelen) en de koppeling richting → minimumdoelen.
// Zie docs/STUDIERICHTINGEN.md § 3 (bestanden) en § 4 (deze module).
//
// Pure module, bewust zonder imports en alleen "erasable" TypeScript (geen enums, namespaces,
// parameter properties of decorators): Node importeert dit bestand rechtstreeks via type stripping
// vanuit tools/leerplannen/haal-studierichtingen.mjs. De datatest en de app gebruiken het ook.
//
// De vorm van de API is pas met een uittreksel bevestigd (werkwijze regel 11). De normalisatie is
// daarom tolerant: een veld mag tekst zijn of een object {code, omschrijving}, en een lijst met één
// element telt als dat element. Wat er met de velden van een groep en een onderdeel gebeurt:
// - Een bekend veld komt in zijn getypte veld (§ 3.2). Komt het als object, dan nemen we daaruit wat
//   § 3.2 vraagt: één tekst (bv. `graad.code`, de omschrijving van `onderwijsniveau`) of {code,
//   omschrijving} (`studiedomein`, `opleidingsvorm`). De andere delen van zo'n object (bv. de
//   omschrijving van de graad) vallen bewust weg.
// - Van een verwijzing naar een ander onderdeel (voorbereidend, vervolg, vorige, volgende) blijft alleen
//   het nummer; de rest van de verwijzing (bv. titel en api_url) valt bewust weg.
// - `api_url` van een groep en van een onderdeel valt weg: die volgt uit het nummer.
// - Een veld met null of lege tekst valt weg, een bekend veld ook als het een lege lijst of een leeg
//   object is. Tekst in een getypt veld en tekst als waarde van een veld in `extra` worden getrimd.
//   Een datum wordt JJJJ-MM-DD (een tijd erna valt weg). De getypte lijsten worden gesorteerd en
//   ontdubbeld (elementen die precies hetzelfde getypte element geven, worden één).
// - Een onbekend veld komt in `extra`. De sleutels van elk object in `extra` worden gesorteerd, ook
//   genest: zo hangt de uitvoer niet af van de volgorde in de API. Verder blijft wat dieper in `extra`
//   staat letterlijk, en lijsten in `extra` houden hun volgorde.
// - Bij leerjaren, structuuronderdeel_details (→ erkenningen), hoofdstructuren, onderwijsstelsels en
//   instellingstypes blijft elk veld van een element dat niet in het getypte element komt (bv. de
//   omschrijving van een hoofdstructuur, of de omschrijving van de status van een erkenning) bewaard in
//   `extra`, onder de naam van de lijst: `extra.hoofdstructuren[i]` is de rest van het element dat
//   `hoofdstructuren[i]` werd, of {} als er niets overbleef (`extra.structuuronderdeel_details[i]`
//   hoort bij `erkenningen[i]`). Die lijst staat er alleen als er van minstens één element iets
//   overbleef. Geven twee elementen hetzelfde getypte element met een andere rest, dan telt de lijst
//   als onleesbaar (zie hieronder): zo gaat geen van beide resten verloren.
// - Een waarde die we niet kunnen lezen, komt in `extra` (bij een lijst de hele lijst; het getypte veld
//   ontbreekt dan, of is leeg). Is ze nodig om de richting juist in te delen (titel, graad,
//   opleidingsvorm, type 7de leerjaar, begin- en einddatum, duaal, aanloop, ov4_mogelijk, leerjaren,
//   hoofdstructuren, verwijzingen), dan komt er ook een probleem bij. Een groep of onderdeel zonder
//   bruikbaar nummer, en de tweede keer dat een onderdeel in dezelfde groep staat, vallen weg, met een
//   probleem.

export const STRUCTUUR_API = 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2';
export const STRUCTUUR_BRON = 'https://onderwijs-api-portaal.vlaanderen.be/';
export const STRUCTUUR_NAAMSVERMELDING = 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen)';
export const KOPPEL_PARAMETER = 'structuuronderdeel_groep_nummer';
export const GROEP_NUMMER = /^G-\d{4,6}$/;

export type Graad = '1' | '2' | '3';
export type GroepSoort = 'gewoon' | 'zevende' | 'aanloop' | 'buso' | 'ander';
export type KoppelMethode = 'api' | 'graad-en-stroom';
export type KoppelStatus = 'gekoppeld' | 'geen' | 'nog-niet-opgehaald';

export interface Code {
  code?: string;
  omschrijving?: string;
}

/** Eén studierichting zoals ze in de matrix staat (per graad): een structuuronderdeelgroep. */
export interface StudierichtingGroep {
  /** `structuuronderdeel_groep_nummer`, op `GROEP_NUMMER`. */
  nummer: string;
  titel: string;
  /** `graad.code`. Ontbreekt bij BuSO. */
  graad?: Graad;
  /** `finaliteit.code` (DO, DU, A), als tekst. Een onbekende code blijft zoals ze is. */
  finaliteit?: string;
  onderwijsniveau?: string;
  soortLeerjaar?: string;
  /** Alleen BuSO. */
  opleidingsvorm?: Code;
  /** `type_7de_leerjaar.code`. */
  type7?: string;
  /** De nummers van de onderdelen, oplopend. */
  onderdelen: number[];
  /** JJJJ-MM-DD: sinds wanneer de groep niet meer in de API staat (het script zet dit). */
  nietMeerInBron?: string;
  /** Alle andere bovenste velden van de groep, zonder `api_url` (die volgt uit het nummer). */
  extra?: Record<string, unknown>;
}

/** Eén structuuronderdeel: een variant van de richting (een studiedomein, duaal, aanloop, …). */
export interface Structuuronderdeel {
  nummer: number;
  /** Het nummer van de groep. */
  groep: string;
  titel: string;
  onderwijsvorm?: string;
  studiedomein?: Code;
  /** Uit `stem_classificatie`. */
  stem?: string;
  discipline?: string;
  coefficient?: number;
  niche?: true;
  duaal?: true;
  aanloop?: true;
  /** Uit het officiële veld `ov4_mogelijk`. */
  ov4?: true;
  begindatum?: string;
  einddatum?: string;
  leerjaren: { code: string; omschrijving?: string; begindatum?: string; einddatum?: string }[];
  /** Codes, bv. 311 (gewoon voltijds secundair) en 321 (BuSO). */
  hoofdstructuren: string[];
  onderwijsstelsels?: string[];
  instellingstypes?: string[];
  /** Uit `structuuronderdeel_details`. */
  erkenningen?: { nummer: string; versie?: string; status?: string; begindatum?: string; einddatum?: string }[];
  /** Uit `historiek_structuuronderdelen`: alleen nummers. */
  vorige?: number[];
  volgende?: number[];
  voorbereidend?: number[];
  vervolg?: number[];
  /** `studierichting_nummer_oud` of `afdeling_nummer_oud`. */
  oudNummer?: string;
  faseBuso?: string;
  laatsteWijziging?: string;
  nietMeerInBron?: string;
  /**
   * De overige velden, zonder `api_url` (die volgt uit het nummer), en per lijst (leerjaren,
   * structuuronderdeel_details, …) de rest van de elementen: zie de kop van dit bestand.
   */
  extra?: Record<string, unknown>;
}

/** `public/leerplannen/structuur/studierichtingen.json` (§ 3.2). */
export interface MatrixBestand {
  app: 'boosterz';
  kind: 'studierichtingen';
  v: 1;
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  opgehaald: string;
  aantalGroepen: number;
  aantalOnderdelen: number;
  /** sha256 van `canoniek({groepen, onderdelen})`. */
  sha256: string;
  groepen: StudierichtingGroep[];
  onderdelen: Structuuronderdeel[];
}

export interface RichtingDoelenSet {
  /** `ODS_<onderwijsdoelenset_id>`. */
  set: string;
  /** Letterlijk `onderwijsdoelenset.onderwijsstructuur.onderwijssoort`, alleen als het niet leeg is. */
  onderwijssoort?: string;
  /** De eerste 16 hex-tekens van de sha256 van de set in `minimumdoelen/index.json`: het versiemerk. */
  setSha: string;
  /** Het aantal doelen van de set in de index op het moment van koppelen. */
  setAantal: number;
  /** De vaste nummers (`@id`), natuurlijk gesorteerd en uniek. */
  ids: string[];
}

/** `public/leerplannen/structuur/richtingdoelen/G-xxxx.json` (§ 3.4). */
export interface RichtingDoelenBestand {
  app: 'boosterz';
  kind: 'richtingdoelen';
  v: 1;
  groep: string;
  titel: string;
  graad?: Graad;
  methode: KoppelMethode;
  filter: string;
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  opgehaald: string;
  /** Het totaal van alle ids. */
  aantal: number;
  /** sha256 van `canoniek(sets)`. */
  sha256: string;
  nietMeerInBron?: string;
  sets: RichtingDoelenSet[];
}

export interface RichtingDoelenIndexRegel {
  groep: string;
  status: KoppelStatus;
  methode?: KoppelMethode;
  aantal?: number;
  sets?: number;
  sha256?: string;
  opgehaald?: string;
  bestand?: string;
  nietMeerInBron?: string;
}

/** `public/leerplannen/structuur/richtingdoelen/index.json` (§ 3.3). */
export interface RichtingDoelenIndex {
  app: 'boosterz';
  kind: 'richtingdoelen-index';
  v: 1;
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  /** Gelijk aan `sha256` van het matrixbestand waartegen gekoppeld werd. */
  matrixSha256: string;
  groepen: RichtingDoelenIndexRegel[];
}

export interface KruisVerschil {
  groep: string;
  set: string;
  /** Nummers die de API aan de groep koppelt, maar die het ordeningskader niet aan de groep geeft. */
  alleenApi: string[];
  /** Nummers die het ordeningskader aan de groep geeft, maar die de API niet koppelt. */
  alleenOrdeningskader: string[];
}

// ── Kleine hulpfuncties ─────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Alleen een eigen veld: nooit iets van het prototype (bv. `constructor`). */
function eigen(o: Record<string, unknown>, sleutel: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, sleutel) ? o[sleutel] : undefined;
}

/** Zet een veld, ook als het `__proto__` heet: zo kan een veld nooit een prototype instellen. */
function zet(o: Record<string, unknown>, sleutel: string, waarde: unknown): void {
  Object.defineProperty(o, sleutel, { value: waarde, enumerable: true, writable: true, configurable: true });
}

/**
 * Diepe kopie van JSON-achtige waarden, met `zet` voor elke sleutel. De sleutels van elk object komen
 * gesorteerd (tekenvolgorde, los van de taal van het toestel), zodat de uitvoer niet afhangt van de
 * volgorde in de API. Lijsten houden hun volgorde.
 */
function kloon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(kloon);
  if (isObject(v)) {
    const uit: Record<string, unknown> = {};
    for (const sleutel of Object.keys(v).sort()) zet(uit, sleutel, kloon(v[sleutel]));
    return uit;
  }
  return v;
}

/** Een korte, veilige weergave van een waarde in een melding. */
function toon(v: unknown): string {
  let t: string;
  try {
    t = v === undefined ? 'niets' : JSON.stringify(v) ?? String(v);
  } catch {
    t = String(v);
  }
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/** Leeg: null, ontbrekend, lege tekst, een lege lijst of een object met alleen lege velden. */
function isLeeg(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every(isLeeg);
  if (isObject(v)) return Object.keys(v).every((k) => isLeeg(v[k]));
  return false;
}

/**
 * Een veld dat één waarde hoort te hebben. Een lijst met één element telt als dat element; een lijst
 * met meer niet-lege elementen is "meerwaardig": wie er één waarde uit neemt, verliest de rest.
 */
function enkel(v: unknown): { waarde: unknown; meerwaardig: boolean } {
  if (v === undefined || v === null) return { waarde: undefined, meerwaardig: false };
  if (Array.isArray(v)) {
    const gevuld = v.filter((x) => !isLeeg(x));
    if (gevuld.length === 0) return { waarde: undefined, meerwaardig: false };
    if (gevuld.length > 1) return { waarde: undefined, meerwaardig: true };
    return enkel(gevuld[0]);
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
const VOORKEUR_OMSCHRIJVING = ['omschrijving', 'naam', 'code', 'label', 'waarde'];

/**
 * Tekst uit een string, een getal of een object, met een voorkeursvolgorde voor de sleutels. Zegt ook
 * welke sleutel van het object de tekst gaf (bij een string of getal: geen).
 */
function tekstEnSleutel(v: unknown, voorkeur: readonly string[]): { tekst?: string; sleutel?: string } {
  const t = eenvoudigeTekst(v);
  if (t !== undefined) return { tekst: t };
  if (!isObject(v)) return {};
  for (const sleutel of voorkeur) {
    const s = eenvoudigeTekst(enkel(eigen(v, sleutel)).waarde);
    if (s !== undefined) return { tekst: s, sleutel };
  }
  return {};
}

/** Tekst uit een string, een getal of een object, met een voorkeursvolgorde voor de sleutels. */
function tekstMet(v: unknown, voorkeur: readonly string[]): string | undefined {
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
const SET_SHA = /^[0-9a-f]{16}$/;
const SET_ID = /^ODS_\d+$/;

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

// ── Sorteren ────────────────────────────────────────────────────────────────

/** Vergelijkt twee rijen cijfers als getallen, zonder grens op de lengte ("0009" = "9" < "10"). */
function vergelijkCijfers(a: string, b: string): number {
  const x = a.replace(/^0+/, '');
  const y = b.replace(/^0+/, '');
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Natuurlijke volgorde, zoals `vergelijkCodes` in minimumdoelen.ts ("1.2" vóór "1.10", "9" vóór
 * "10"), maar onafhankelijk van de taalinstellingen van het toestel: cijfers als getallen, de rest
 * teken voor teken. Bij een gelijke stand ("01" en "1") beslist de gewone tekenvolgorde, zodat twee
 * verschillende teksten nooit als gelijk tellen. Zo sorteert het script in GitHub Actions precies
 * zoals de test en de app.
 */
export function vergelijkNatuurlijk(a: string, b: string): number {
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

/**
 * Volgorde van groepnummers: numeriek, G-0009 < G-0010 < G-01000. Voor geldige nummers is dat
 * precies de natuurlijke volgorde (zelfde voorvoegsel "G-", daarna het getal).
 */
export function vergelijkGroepnummer(a: string, b: string): number {
  return vergelijkNatuurlijk(a, b);
}

function vergelijkOptioneel(a: string | undefined, b: string | undefined): number {
  return vergelijkNatuurlijk(a ?? '', b ?? '');
}

type Leerjaar = Structuuronderdeel['leerjaren'][number];
type Erkenning = NonNullable<Structuuronderdeel['erkenningen']>[number];

function vergelijkLeerjaar(a: Leerjaar, b: Leerjaar): number {
  return (
    vergelijkNatuurlijk(a.code, b.code) ||
    vergelijkOptioneel(a.begindatum, b.begindatum) ||
    vergelijkOptioneel(a.einddatum, b.einddatum) ||
    vergelijkOptioneel(a.omschrijving, b.omschrijving)
  );
}

function vergelijkErkenning(a: Erkenning, b: Erkenning): number {
  return (
    vergelijkNatuurlijk(a.nummer, b.nummer) ||
    vergelijkOptioneel(a.versie, b.versie) ||
    vergelijkOptioneel(a.begindatum, b.begindatum) ||
    vergelijkOptioneel(a.einddatum, b.einddatum) ||
    vergelijkOptioneel(a.status, b.status)
  );
}

/** Sorteert en haalt dubbels weg (dubbel = vergelijking 0, dus letterlijk gelijk). */
function sorteerUniek<T>(lijst: readonly T[], vergelijk: (a: T, b: T) => number): T[] {
  const gesorteerd = [...lijst].sort(vergelijk);
  return gesorteerd.filter((x, i) => i === 0 || vergelijk(gesorteerd[i - 1], x) !== 0);
}

const opGetal = (a: number, b: number) => a - b;

// ── Normaliseren van één groep uit de API ───────────────────────────────────

/**
 * Leest de velden van één record (groep of onderdeel). Houdt bij welke velden gelezen zijn: de rest
 * gaat naar `extra`. Een waarde die we niet kunnen lezen, gaat letterlijk naar `extra`; is ze nodig
 * (`ernstig`), dan komt er ook een probleem bij.
 */
interface Lezer {
  plaats: string;
  bron: Record<string, unknown>;
  gelezen: Set<string>;
  extra: Record<string, unknown>;
  problemen: string[];
}

function maakLezer(bron: Record<string, unknown>, plaats: string, problemen: string[]): Lezer {
  return { plaats, bron, gelezen: new Set(), extra: {}, problemen };
}

function lees(l: Lezer, sleutel: string): unknown {
  l.gelezen.add(sleutel);
  return eigen(l.bron, sleutel);
}

/** Zet een waarde in `extra` zoals minimumdoelen.ts dat doet: tekst getrimd, null en leeg vallen weg. */
function zetExtra(extra: Record<string, unknown>, sleutel: string, waarde: unknown): void {
  if (waarde === null || waarde === undefined) return;
  if (typeof waarde === 'string') {
    const t = waarde.trim();
    if (t !== '') zet(extra, sleutel, t);
    return;
  }
  if (typeof waarde === 'number' && !Number.isFinite(waarde)) return;
  zet(extra, sleutel, kloon(waarde));
}

function onbruikbaar(l: Lezer, sleutel: string, ernstig: boolean, reden: string): undefined {
  zetExtra(l.extra, sleutel, eigen(l.bron, sleutel));
  if (ernstig) l.problemen.push(`${l.plaats}: ${reden}`);
  return undefined;
}

/** Eén waarde (een lijst met één element telt als dat element). `undefined` als het veld leeg is. */
function leesEnkel(l: Lezer, sleutel: string, ernstig: boolean): { waarde?: unknown; fout: boolean } {
  const v = lees(l, sleutel);
  if (isLeeg(v)) return { fout: false };
  const e = enkel(v);
  if (e.meerwaardig) {
    onbruikbaar(l, sleutel, ernstig, `het veld "${sleutel}" heeft meer dan één waarde (${toon(v)}).`);
    return { fout: true };
  }
  return { waarde: e.waarde, fout: false };
}

function leesTekst(l: Lezer, sleutel: string, voorkeur: readonly string[], ernstig: boolean): string | undefined {
  const { waarde, fout } = leesEnkel(l, sleutel, ernstig);
  if (fout || waarde === undefined) return undefined;
  const t = tekstMet(waarde, voorkeur);
  if (t === undefined) return onbruikbaar(l, sleutel, ernstig, `het veld "${sleutel}" heeft een onbekende vorm (${toon(waarde)}).`);
  return t;
}

/** {code, omschrijving}: tekst wordt de omschrijving, een getal de code. */
function leesCode(l: Lezer, sleutel: string, ernstig: boolean): Code | undefined {
  const { waarde, fout } = leesEnkel(l, sleutel, ernstig);
  if (fout || waarde === undefined) return undefined;
  if (typeof waarde === 'string') return { omschrijving: waarde.trim() };
  if (typeof waarde === 'number' && Number.isFinite(waarde)) return { code: String(waarde) };
  if (isObject(waarde)) {
    const code = eenvoudigeTekst(enkel(eigen(waarde, 'code')).waarde);
    const omschrijving = tekstMet(eigen(waarde, 'omschrijving'), VOORKEUR_OMSCHRIJVING) ?? eenvoudigeTekst(eigen(waarde, 'naam'));
    if (code !== undefined || omschrijving !== undefined) {
      const uit: Code = {};
      if (code !== undefined) uit.code = code;
      if (omschrijving !== undefined) uit.omschrijving = omschrijving;
      return uit;
    }
  }
  return onbruikbaar(l, sleutel, ernstig, `het veld "${sleutel}" heeft een onbekende vorm (${toon(waarde)}).`);
}

/** Alleen `true` telt; `false`, leeg of ontbrekend geeft `false`. Ook "true"/"false" en 1/0. */
function leesVlag(l: Lezer, sleutel: string, ernstig: boolean): boolean {
  const { waarde, fout } = leesEnkel(l, sleutel, ernstig);
  if (fout || waarde === undefined) return false;
  if (waarde === true || waarde === 1) return true;
  if (waarde === false || waarde === 0) return false;
  if (typeof waarde === 'string') {
    const t = waarde.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  onbruikbaar(l, sleutel, ernstig, `het veld "${sleutel}" is geen ja/nee-waarde (${toon(waarde)}).`);
  return false;
}

function leesDatum(l: Lezer, sleutel: string, ernstig: boolean): string | undefined {
  const { waarde, fout } = leesEnkel(l, sleutel, ernstig);
  if (fout || waarde === undefined) return undefined;
  const d = datumUit(waarde);
  if (d === undefined) return onbruikbaar(l, sleutel, ernstig, `het veld "${sleutel}" is geen geldige datum (${toon(waarde)}).`);
  return d;
}

function leesGetal(l: Lezer, sleutel: string, ernstig: boolean): number | undefined {
  const { waarde, fout } = leesEnkel(l, sleutel, ernstig);
  if (fout || waarde === undefined) return undefined;
  if (typeof waarde === 'number' && Number.isFinite(waarde)) return waarde;
  if (typeof waarde === 'string' && /^-?\d+(\.\d+)?$/.test(waarde.trim())) return Number(waarde.trim());
  return onbruikbaar(l, sleutel, ernstig, `het veld "${sleutel}" is geen getal (${toon(waarde)}).`);
}

/**
 * Een lijst: elk element via `element`, dat `undefined` geeft als het element onbruikbaar is. Eén
 * onbruikbaar element maakt het hele veld onbruikbaar (geen halve lijst). Een enkele waarde telt
 * als een lijst met één element; lege elementen vallen weg.
 */
function leesLijst<T>(l: Lezer, sleutel: string, ernstig: boolean, element: (x: unknown) => T | undefined, wat: string): T[] | undefined {
  const v = lees(l, sleutel);
  if (isLeeg(v)) return undefined;
  const items = (Array.isArray(v) ? v : [v]).filter((x) => !isLeeg(x));
  const uit: T[] = [];
  for (const item of items) {
    const x = element(item);
    if (x === undefined) return onbruikbaar(l, sleutel, ernstig, `in het veld "${sleutel}" staat ${wat} dat we niet kunnen lezen (${toon(item)}).`);
    uit.push(x);
  }
  return uit;
}

/** Een nummer van een structuuronderdeel: een getal, tekst met cijfers, of een object met dat nummer. */
function nummerElement(x: unknown): number | undefined {
  if (isObject(x)) {
    const n = eigen(x, 'structuuronderdeel_nummer');
    return positiefGeheel(enkel(n !== undefined ? n : eigen(x, 'nummer')).waarde);
  }
  return positiefGeheel(x);
}

// ── Elementen van een lijst, met hun rest ───────────────────────────────────
//
// Een element van leerjaren, structuuronderdeel_details, hoofdstructuren, onderwijsstelsels of
// instellingstypes kan meer velden hebben dan het getypte element. Wat overblijft, is de `rest` van
// het element; `leesLijstMetRest` zet die in `extra` (zie de kop van dit bestand).

/** Een gelezen element: het getypte element en de rest (gesorteerd), of geen rest als er niets overbleef. */
interface Gelezen<T> {
  waarde: T;
  rest?: Record<string, unknown>;
}

/** Een lezer voor één element (een object): een element meldt zelf geen problemen. */
function elementLezer(x: Record<string, unknown>): Lezer {
  return maakLezer(x, '', []);
}

/**
 * Tekst uit één veld van een element. Een leeg veld is gelezen (er gaat niets verloren). Een leesbaar
 * veld (tekst, een getal, of een lijst met één zo'n waarde) is gelezen. Anders blijft het ongelezen en
 * komt het letterlijk in de rest.
 */
function elementTekst(e: Lezer, sleutel: string): string | undefined {
  const ruw = eigen(e.bron, sleutel);
  if (isLeeg(ruw)) {
    e.gelezen.add(sleutel);
    return undefined;
  }
  const t = eenvoudigeTekst(enkel(ruw).waarde);
  if (t !== undefined) e.gelezen.add(sleutel);
  return t;
}

/** Zoals `elementTekst`, maar met meer namen voor hetzelfde veld: de eerste niet-lege beslist, de andere blijven in de rest. */
function elementTekstUit(e: Lezer, sleutels: readonly string[]): string | undefined {
  for (const sleutel of sleutels) {
    if (isLeeg(eigen(e.bron, sleutel))) {
      e.gelezen.add(sleutel);
      continue;
    }
    return elementTekst(e, sleutel);
  }
  return undefined;
}

/** Een datum in een element. Leeg: in orde. Niet te lezen (ook meer dan één datum): `false`, het element is onbruikbaar. */
function elementDatum(e: Lezer, veld: 'begindatum' | 'einddatum', uit: { begindatum?: string; einddatum?: string }): boolean {
  const ruw = lees(e, veld);
  if (isLeeg(ruw)) return true;
  const d = datumUit(enkel(ruw).waarde);
  if (d === undefined) return false;
  uit[veld] = d;
  return true;
}

/** Een code uit een lijst: tekst, een getal of een object met `code`. Een object zonder code telt niet. */
function codeElement(x: unknown): Gelezen<string> | undefined {
  const t = eenvoudigeTekst(x);
  if (t !== undefined) return { waarde: t };
  if (!isObject(x)) return undefined;
  const e = elementLezer(x);
  const code = elementTekst(e, 'code');
  return code === undefined ? undefined : { waarde: code, rest: restNaarExtra(e, []) };
}

function leerjaarElement(x: unknown): Gelezen<Leerjaar> | undefined {
  if (!isObject(x)) {
    const code = eenvoudigeTekst(x);
    return code === undefined ? undefined : { waarde: { code } };
  }
  const e = elementLezer(x);
  const code = elementTekst(e, 'code');
  if (code === undefined) return undefined;
  const uit: Leerjaar = { code };
  const omschrijving = elementTekst(e, 'omschrijving');
  if (omschrijving !== undefined) uit.omschrijving = omschrijving;
  if (!elementDatum(e, 'begindatum', uit) || !elementDatum(e, 'einddatum', uit)) return undefined;
  return { waarde: uit, rest: restNaarExtra(e, []) };
}

/**
 * De status van een erkenning: tekst, of de code (anders de omschrijving, …) van een object. Van een
 * object blijft de rest (bv. de omschrijving "Erkend") in de rest van het element, onder "status".
 * Niet te lezen: het veld blijft ongelezen en komt letterlijk in de rest.
 */
function elementStatus(e: Lezer): string | undefined {
  const ruw = eigen(e.bron, 'status');
  if (isLeeg(ruw)) {
    e.gelezen.add('status');
    return undefined;
  }
  const waarde = enkel(ruw).waarde;
  const { tekst, sleutel } = tekstEnSleutel(waarde, VOORKEUR_CODE);
  if (tekst === undefined) return undefined;
  e.gelezen.add('status');
  if (sleutel !== undefined && isObject(waarde)) {
    const sub = elementLezer(waarde);
    sub.gelezen.add(sleutel);
    const rest = restNaarExtra(sub, []);
    if (rest !== undefined) zet(e.extra, 'status', rest);
  }
  return tekst;
}

function erkenningElement(x: unknown): Gelezen<Erkenning> | undefined {
  if (!isObject(x)) return undefined;
  const e = elementLezer(x);
  const nummer = elementTekstUit(e, ['structuuronderdeel_detail_nummer', 'nummer']);
  if (nummer === undefined) return undefined;
  const uit: Erkenning = { nummer };
  const versie = elementTekstUit(e, ['structuuronderdeel_detail_versie', 'versie']);
  if (versie !== undefined) uit.versie = versie;
  const status = elementStatus(e);
  if (status !== undefined) uit.status = status;
  if (!elementDatum(e, 'begindatum', uit) || !elementDatum(e, 'einddatum', uit)) return undefined;
  return { waarde: uit, rest: restNaarExtra(e, []) };
}

function isLeegObject(o: Record<string, unknown>): boolean {
  return Object.keys(o).length === 0;
}

/**
 * Een lijst waarvan de elementen meer velden kunnen hebben dan het getypte element. Zoals `leesLijst`
 * (één onbruikbaar element maakt het hele veld onbruikbaar), maar gesorteerd en ontdubbeld met
 * `vergelijk`. Bleef er van minstens één element iets over, dan komt in `extra` onder `sleutel` een
 * lijst even lang als de getypte lijst: op plaats i de rest van het element dat element i werd, of {}.
 * Twee elementen met hetzelfde getypte element worden één. Hebben ze elk een andere rest, dan is het
 * veld onbruikbaar: zo gaat geen van beide resten verloren. De uitkomst hangt niet af van de volgorde
 * in de invoer.
 */
function leesLijstMetRest<T>(
  l: Lezer,
  sleutel: string,
  ernstig: boolean,
  element: (x: unknown) => Gelezen<T> | undefined,
  wat: string,
  vergelijk: (a: T, b: T) => number,
): T[] | undefined {
  const v = lees(l, sleutel);
  if (isLeeg(v)) return undefined;
  const items = (Array.isArray(v) ? v : [v]).filter((x) => !isLeeg(x));
  const gelezen: Gelezen<T>[] = [];
  for (const item of items) {
    const x = element(item);
    if (x === undefined) return onbruikbaar(l, sleutel, ernstig, `in het veld "${sleutel}" staat ${wat} dat we niet kunnen lezen (${toon(item)}).`);
    gelezen.push(x);
  }
  gelezen.sort((a, b) => vergelijk(a.waarde, b.waarde));
  const waarden: T[] = [];
  const resten: Record<string, unknown>[] = [];
  for (const g of gelezen) {
    const rest = g.rest ?? {};
    const i = waarden.length - 1;
    if (i >= 0 && vergelijk(waarden[i], g.waarde) === 0) {
      // Een dubbel. De resten zijn gesorteerd, dus JSON is een eerlijke vergelijking.
      if (isLeegObject(rest) || JSON.stringify(rest) === JSON.stringify(resten[i])) continue;
      if (isLeegObject(resten[i])) {
        resten[i] = rest;
        continue;
      }
      return onbruikbaar(l, sleutel, ernstig, `in het veld "${sleutel}" staat ${wat} meer dan één keer, met andere gegevens (${toon(g.waarde)}).`);
    }
    waarden.push(g.waarde);
    resten.push(rest);
  }
  if (resten.some((r) => !isLeegObject(r))) zet(l.extra, sleutel, resten);
  return waarden;
}

const GRAAD_TEKST: Record<string, Graad> = {
  '1': '1', '2': '2', '3': '3',
  '1ste graad': '1', '2de graad': '2', '3de graad': '3',
  'eerste graad': '1', 'tweede graad': '2', 'derde graad': '3',
};

function leesGraad(l: Lezer, sleutel: string): Graad | undefined {
  const t = leesTekst(l, sleutel, VOORKEUR_CODE, true);
  if (t === undefined) return undefined;
  const graad = eigen(GRAAD_TEKST, t.toLowerCase().replace(/\s+/g, ' ')) as Graad | undefined;
  if (graad === undefined) return onbruikbaar(l, sleutel, true, `onbekende graad (${toon(t)}).`);
  return graad;
}

/** Zet de nog niet gelezen velden in `extra` (behalve `weg`) en geeft `extra` als het niet leeg is. */
function restNaarExtra(l: Lezer, weg: readonly string[]): Record<string, unknown> | undefined {
  for (const sleutel of Object.keys(l.bron)) {
    if (l.gelezen.has(sleutel) || weg.includes(sleutel)) continue;
    zetExtra(l.extra, sleutel, l.bron[sleutel]);
  }
  const sleutels = Object.keys(l.extra).sort();
  if (sleutels.length === 0) return undefined;
  const uit: Record<string, unknown> = {};
  for (const sleutel of sleutels) zet(uit, sleutel, l.extra[sleutel]);
  return uit;
}

function nummerLijst(l: Lezer, sleutel: string): number[] | undefined {
  const lijst = leesLijst(l, sleutel, true, nummerElement, 'een nummer');
  return lijst === undefined || lijst.length === 0 ? undefined : sorteerUniek(lijst, opGetal);
}

function codeLijst(l: Lezer, sleutel: string, ernstig: boolean): string[] | undefined {
  return leesLijstMetRest(l, sleutel, ernstig, codeElement, 'een code', vergelijkNatuurlijk);
}

/** `historiek_structuuronderdelen`: elke sleutel die met "vorige" of "volgende" begint. */
function leesHistoriek(l: Lezer): { vorige?: number[]; volgende?: number[] } {
  const sleutel = 'historiek_structuuronderdelen';
  const { waarde, fout } = leesEnkel(l, sleutel, true);
  if (fout || waarde === undefined) return {};
  if (!isObject(waarde)) return onbruikbaar(l, sleutel, true, `het veld "${sleutel}" heeft een onbekende vorm (${toon(waarde)}).`) ?? {};
  const sub = maakLezer(waarde, l.plaats, l.problemen);
  const vorige: number[] = [];
  const volgende: number[] = [];
  for (const k of Object.keys(waarde)) {
    const doel = k.startsWith('vorige') ? vorige : k.startsWith('volgende') ? volgende : undefined;
    if (doel === undefined) continue;
    const lijst = leesLijst(sub, k, true, nummerElement, 'een nummer');
    if (lijst !== undefined) doel.push(...lijst);
  }
  const rest = restNaarExtra(sub, []);
  if (rest !== undefined) zet(l.extra, sleutel, rest);
  const uit: { vorige?: number[]; volgende?: number[] } = {};
  if (vorige.length > 0) uit.vorige = sorteerUniek(vorige, opGetal);
  if (volgende.length > 0) uit.volgende = sorteerUniek(volgende, opGetal);
  return uit;
}

function normaliseerOnderdeel(raw: unknown, groep: string, plaatsNr: number, problemen: string[]): Structuuronderdeel | undefined {
  if (!isObject(raw)) {
    problemen.push(`Groep ${groep}: onderdeel ${plaatsNr} is geen object (${toon(raw)}).`);
    return undefined;
  }
  const nummerRuw = enkel(eigen(raw, 'structuuronderdeel_nummer'));
  const nummer = positiefGeheel(nummerRuw.waarde);
  if (nummer === undefined) {
    const titel = eenvoudigeTekst(enkel(eigen(raw, 'titel')).waarde);
    const wie = `Groep ${groep}: onderdeel ${plaatsNr}${titel ? ` (${toon(titel)})` : ''}`;
    if (isLeeg(eigen(raw, 'structuuronderdeel_nummer'))) problemen.push(`${wie} heeft geen nummer.`);
    else problemen.push(`${wie}: het nummer ${toon(eigen(raw, 'structuuronderdeel_nummer'))} is geen geheel getal groter dan 0.`);
    return undefined;
  }
  const l = maakLezer(raw, `Groep ${groep}, onderdeel ${nummer}`, problemen);
  lees(l, 'structuuronderdeel_nummer');

  const titel = leesTekst(l, 'titel', VOORKEUR_OMSCHRIJVING, true);
  if (titel === undefined && isLeeg(eigen(raw, 'titel'))) problemen.push(`${l.plaats}: de titel ontbreekt.`);
  const o: Structuuronderdeel = { nummer, groep, titel: titel ?? '', leerjaren: [], hoofdstructuren: [] };

  const onderwijsvorm = leesTekst(l, 'onderwijsvorm', VOORKEUR_CODE, false);
  if (onderwijsvorm !== undefined) o.onderwijsvorm = onderwijsvorm;
  const studiedomein = leesCode(l, 'studiedomein', false);
  if (studiedomein !== undefined) o.studiedomein = studiedomein;
  const stem = leesTekst(l, 'stem_classificatie', VOORKEUR_CODE, false);
  if (stem !== undefined) o.stem = stem;
  const discipline = leesTekst(l, 'discipline', VOORKEUR_OMSCHRIJVING, false);
  if (discipline !== undefined) o.discipline = discipline;
  const coefficient = leesGetal(l, 'coefficient', false);
  if (coefficient !== undefined) o.coefficient = coefficient;
  if (leesVlag(l, 'niche', false)) o.niche = true;
  if (leesVlag(l, 'duaal', true)) o.duaal = true;
  if (leesVlag(l, 'aanloop', true)) o.aanloop = true;
  if (leesVlag(l, 'ov4_mogelijk', true)) o.ov4 = true;
  const begindatum = leesDatum(l, 'begindatum', true);
  if (begindatum !== undefined) o.begindatum = begindatum;
  const einddatum = leesDatum(l, 'einddatum', true);
  if (einddatum !== undefined) o.einddatum = einddatum;

  const leerjaren = leesLijstMetRest(l, 'leerjaren', true, leerjaarElement, 'een leerjaar', vergelijkLeerjaar);
  if (leerjaren !== undefined) o.leerjaren = leerjaren;
  o.hoofdstructuren = codeLijst(l, 'hoofdstructuren', true) ?? [];
  const stelsels = codeLijst(l, 'onderwijsstelsels', false);
  if (stelsels !== undefined) o.onderwijsstelsels = stelsels;
  const types = codeLijst(l, 'instellingstypes', false);
  if (types !== undefined) o.instellingstypes = types;
  const erkenningen = leesLijstMetRest(l, 'structuuronderdeel_details', false, erkenningElement, 'een erkenning', vergelijkErkenning);
  if (erkenningen !== undefined && erkenningen.length > 0) o.erkenningen = erkenningen;

  const historiek = leesHistoriek(l);
  if (historiek.vorige) o.vorige = historiek.vorige;
  if (historiek.volgende) o.volgende = historiek.volgende;
  const voorbereidend = nummerLijst(l, 'voorbereidende_structuuronderdelen');
  if (voorbereidend) o.voorbereidend = voorbereidend;
  const vervolg = nummerLijst(l, 'vervolg_structuuronderdelen');
  if (vervolg) o.vervolg = vervolg;

  const oudRichting = leesTekst(l, 'studierichting_nummer_oud', VOORKEUR_CODE, false);
  const oudAfdeling = leesTekst(l, 'afdeling_nummer_oud', VOORKEUR_CODE, false);
  const oudNummer = oudRichting ?? oudAfdeling;
  if (oudNummer !== undefined) o.oudNummer = oudNummer;
  // Twee verschillende oude nummers: het tweede blijft in `extra` staan.
  if (oudRichting !== undefined && oudAfdeling !== undefined && oudAfdeling !== oudRichting) {
    zetExtra(l.extra, 'afdeling_nummer_oud', eigen(raw, 'afdeling_nummer_oud'));
  }
  const fase = leesTekst(l, 'fase_buso', VOORKEUR_CODE, false);
  if (fase !== undefined) o.faseBuso = fase;
  const laatsteWijziging = leesDatum(l, 'datum_laatste_wijziging', false);
  if (laatsteWijziging !== undefined) o.laatsteWijziging = laatsteWijziging;

  // `api_url` valt weg: die volgt uit het nummer.
  const extra = restNaarExtra(l, ['api_url']);
  if (extra !== undefined) o.extra = extra;
  return o;
}

/**
 * Zet één groep uit de API om (§ 3.2). Tolerant: tekst of object {code, omschrijving}, een lijst met
 * één element telt als dat element, ontbrekende velden mogen, onbekende velden en de rest van de
 * elementen van leerjaren, hoofdstructuren, … gaan naar `extra` (wat er precies bewaard blijft, staat
 * in de kop van dit bestand), `api_url` van de groep en van een onderdeel valt weg. In `problemen`
 * komt wat de gegevens onbetrouwbaar maakt: een groep zonder geldig nummer of zonder onderdelen, een
 * onderdeel zonder nummer of met een nummer dat geen geheel getal is ("505" wordt 505, "abc" is een
 * probleem), een dubbel onderdeel, een titel, graad, datum, ja/nee-waarde, verwijzing, leerjaar of
 * hoofdstructuur die we niet kunnen lezen, en een leerjaar of hoofdstructuur die twee keer voorkomt
 * met andere gegevens.
 */
export function normaliseerGroep(raw: unknown): { groep?: StudierichtingGroep; onderdelen: Structuuronderdeel[]; problemen: string[] } {
  const problemen: string[] = [];
  if (!isObject(raw)) {
    problemen.push(`Een groep is geen object (${toon(raw)}).`);
    return { onderdelen: [], problemen };
  }
  const nummerRuw = enkel(eigen(raw, KOPPEL_PARAMETER));
  const nummer = typeof nummerRuw.waarde === 'string' ? nummerRuw.waarde.trim() : undefined;
  if (nummer === undefined || !GROEP_NUMMER.test(nummer)) {
    const titel = eenvoudigeTekst(enkel(eigen(raw, 'titel')).waarde);
    problemen.push(`Een groep${titel ? ` (${toon(titel)})` : ''} heeft geen geldig nummer (${toon(eigen(raw, KOPPEL_PARAMETER))}).`);
    return { onderdelen: [], problemen };
  }
  const l = maakLezer(raw, `Groep ${nummer}`, problemen);
  lees(l, KOPPEL_PARAMETER);

  const titel = leesTekst(l, 'titel', VOORKEUR_OMSCHRIJVING, true);
  if (titel === undefined && isLeeg(eigen(raw, 'titel'))) problemen.push(`${l.plaats}: de titel ontbreekt.`);
  const groep: StudierichtingGroep = { nummer, titel: titel ?? '', onderdelen: [] };
  const graad = leesGraad(l, 'graad');
  if (graad !== undefined) groep.graad = graad;
  const finaliteit = leesTekst(l, 'finaliteit', VOORKEUR_CODE, false);
  if (finaliteit !== undefined) groep.finaliteit = finaliteit;
  const niveau = leesTekst(l, 'onderwijsniveau', VOORKEUR_OMSCHRIJVING, false);
  if (niveau !== undefined) groep.onderwijsniveau = niveau;
  const soortLeerjaar = leesTekst(l, 'soort_leerjaar', VOORKEUR_OMSCHRIJVING, false);
  if (soortLeerjaar !== undefined) groep.soortLeerjaar = soortLeerjaar;
  const opleidingsvorm = leesCode(l, 'opleidingsvorm', true);
  if (opleidingsvorm !== undefined) groep.opleidingsvorm = opleidingsvorm;
  const type7 = leesTekst(l, 'type_7de_leerjaar', VOORKEUR_CODE, true);
  if (type7 !== undefined) groep.type7 = type7;

  const lijstRuw = lees(l, 'structuuronderdelen');
  const onderdelen: Structuuronderdeel[] = [];
  if (isLeeg(lijstRuw)) {
    problemen.push(`${l.plaats}: de groep heeft geen onderdelen.`);
  } else {
    const items = (Array.isArray(lijstRuw) ? lijstRuw : [lijstRuw]).filter((x) => !isLeeg(x));
    const gezien = new Set<number>();
    items.forEach((item, i) => {
      const o = normaliseerOnderdeel(item, nummer, i + 1, problemen);
      if (o === undefined) return;
      if (gezien.has(o.nummer)) {
        problemen.push(`${l.plaats}: onderdeel ${o.nummer} staat er meer dan één keer in.`);
        return;
      }
      gezien.add(o.nummer);
      onderdelen.push(o);
    });
  }
  onderdelen.sort((a, b) => a.nummer - b.nummer);
  groep.onderdelen = onderdelen.map((o) => o.nummer);
  // `api_url` valt weg: die volgt uit het nummer.
  const extra = restNaarExtra(l, ['api_url']);
  if (extra !== undefined) groep.extra = extra;
  return { groep, onderdelen, problemen };
}

// ── Pagina's van de API ─────────────────────────────────────────────────────

const MAX_ZOEKDIEPTE = 6;

/**
 * De lijst met groepen op een pagina van de API: de ENIGE lijst met objecten die een
 * `structuuronderdeel_groep_nummer` hebben, op welke sleutel ook (nu `structuuronderdeel_groepen`).
 * Een gevonden lijst wordt niet verder doorzocht. Geen of meer dan één zulke lijst: een fout, want dan
 * weten we niet zeker welke lijst de groepen bevat. Het pad komt in het rapport.
 */
export function lijstVanPagina(pagina: unknown): { lijst: unknown[]; pad: string } | { fout: string } {
  const gevonden: { lijst: unknown[]; pad: string }[] = [];
  const zoek = (v: unknown, pad: string, diepte: number): void => {
    if (diepte > MAX_ZOEKDIEPTE) return;
    if (Array.isArray(v)) {
      if (v.some((x) => isObject(x) && Object.prototype.hasOwnProperty.call(x, KOPPEL_PARAMETER))) {
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
  if (gevonden.length === 0) return { fout: 'Op de pagina staat geen lijst met groepen (objecten met structuuronderdeel_groep_nummer).' };
  if (gevonden.length > 1) {
    return { fout: `Op de pagina staan ${gevonden.length} lijsten met groepen (${gevonden.map((g) => g.pad).join(', ')}); welke de juiste is, is niet zeker.` };
  }
  return gevonden[0];
}

/**
 * De volgende pagina: `links.next.href` (of `links.next` als tekst), met spaties als %20. Geen
 * volgende pagina als `meta.last` true is. De oproeper controleert de origin en lussen.
 */
export function volgendeLink(pagina: unknown): string | undefined {
  if (!isObject(pagina)) return undefined;
  const meta = eigen(pagina, 'meta');
  if (isObject(meta) && eigen(meta, 'last') === true) return undefined;
  const links = eigen(pagina, 'links');
  let next: unknown;
  if (isObject(links)) next = eigen(links, 'next');
  else if (Array.isArray(links)) next = links.find((x) => isObject(x) && eigen(x, 'rel') === 'next');
  const href = isObject(next) ? eigen(next, 'href') : next;
  if (typeof href !== 'string') return undefined;
  const t = href.trim();
  return t === '' ? undefined : t.replace(/ /g, '%20');
}

/** `meta.total_elements` als getal (ook als het als tekst komt), of `undefined`. */
export function totaalVanPagina(pagina: unknown): number | undefined {
  if (!isObject(pagina)) return undefined;
  const meta = eigen(pagina, 'meta');
  if (!isObject(meta)) return undefined;
  const v = eigen(meta, 'total_elements');
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : undefined;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isSafeInteger(n) ? n : undefined;
  }
  return undefined;
}

/**
 * `onderwijsdoelenset.onderwijsstructuur.onderwijssoort` van een doel uit de Onderwijsdoelen-API
 * (bv. "Buitengewoon"), letterlijk maar getrimd. Leeg of afwezig: `undefined`.
 */
export function onderwijssoortVanRecord(record: unknown): string | undefined {
  if (!isObject(record)) return undefined;
  const set = enkel(eigen(record, 'onderwijsdoelenset')).waarde;
  if (!isObject(set)) return undefined;
  const structuur = enkel(eigen(set, 'onderwijsstructuur')).waarde;
  if (!isObject(structuur)) return undefined;
  return tekstMet(enkel(eigen(structuur, 'onderwijssoort')).waarde, VOORKEUR_OMSCHRIJVING);
}

// ── Gedeelde regels ─────────────────────────────────────────────────────────

/**
 * De stroom van een groep van de 1ste graad, uit de titel: "Eerste leerjaar A", "Tweede leerjaar B:
 * …". Andere titels: `undefined`. De datatest (M7) laat een titelwijziging zichtbaar falen.
 */
export function stroomVanEersteGraad(titel: string): 'A' | 'B' | undefined {
  const m = /^(eerste|tweede)\s+leerjaar\s+([ab])\b/i.exec(titel.trim());
  return m ? (m[2].toUpperCase() as 'A' | 'B') : undefined;
}

/**
 * De soort van een groep, in deze volgorde: een opleidingsvorm → buso; een type 7de leerjaar →
 * zevende; alle onderdelen aanloop → aanloop; een graad en een onderdeel met hoofdstructuur 311 →
 * gewoon (ook de 1ste graad en groepen met alleen duale onderdelen); anders → ander. Alleen de
 * onderdelen van deze groep tellen mee.
 *
 * Waarom ook "een graad": OKAN (G-0561) en Basisverpleegkunde (G-0562) hebben in de echte gegevens
 * wel hoofdstructuur 311 maar geen graad. Het ontwerp rekent ze bij "ander"; met 311 alleen zouden ze
 * "gewoon" worden.
 */
export function soortVanGroep(g: StudierichtingGroep, onderdelen: readonly Structuuronderdeel[]): GroepSoort {
  if (g.opleidingsvorm !== undefined && (g.opleidingsvorm.code !== undefined || g.opleidingsvorm.omschrijving !== undefined)) return 'buso';
  if (g.type7 !== undefined && g.type7.trim() !== '') return 'zevende';
  const eigenOnderdelen = onderdelen.filter((o) => o.groep === g.nummer);
  if (eigenOnderdelen.length > 0 && eigenOnderdelen.every((o) => o.aanloop === true)) return 'aanloop';
  if (g.graad !== undefined && eigenOnderdelen.some((o) => o.hoofdstructuren.includes('311'))) return 'gewoon';
  return 'ander';
}

/**
 * Het jaar in het secundair (1 tot 7) uit de graad en de code van het leerjaar: (graad - 1) * 2 +
 * code; in de 3de graad geeft code 3 het 7de jaar. Al de rest (geen graad, BuSO, een code buiten de
 * graad): `undefined`.
 */
export function jaarVan(graad: string | undefined, leerjaarCode: string): number | undefined {
  if (graad !== '1' && graad !== '2' && graad !== '3') return undefined;
  const t = leerjaarCode.trim();
  if (!/^\d+$/.test(t)) return undefined;
  const code = Number(t);
  const g = Number(graad);
  if (code === 1 || code === 2) return (g - 1) * 2 + code;
  if (code === 3 && g === 3) return 7;
  return undefined;
}

/**
 * Afgebouwd: de einddatum ligt vóór vandaag (op de einddatum zelf geldt het nog). Zonder geldige
 * einddatum: niet afgebouwd. `vandaag` is JJJJ-MM-DD (of een ISO-tijdstip); iets anders is een fout
 * van de oproeper.
 */
export function isAfgebouwd(o: { einddatum?: string }, vandaag: string): boolean {
  const dag = typeof vandaag === 'string' ? vandaag.slice(0, 10) : '';
  if (!isDatum(dag)) throw new TypeError(`isAfgebouwd: "vandaag" is geen datum (${toon(vandaag)}).`);
  const einde = datumUit(o.einddatum);
  return einde !== undefined && einde < dag;
}

/**
 * De groepnummers die het ordeningskader aan een doel geeft, uit
 * `extra.titels[*].ordeningskader.studierichtingen[*].structuuronderdeel_groep_nummer` (in de
 * setbestanden is `titels` een object met sleutels "1", "2", …; een lijst mag ook). Alleen geldige
 * nummers (`GROEP_NUMMER`), uniek en gesorteerd. Een richting zonder nummer (dat komt voor) telt niet.
 */
export function groepnummersVanDoel(doel: { extra?: Record<string, unknown> }): string[] {
  const extra = doel.extra;
  if (!isObject(extra)) return [];
  const titels = eigen(extra, 'titels');
  const rubrieken = Array.isArray(titels) ? titels : isObject(titels) ? Object.keys(titels).map((k) => titels[k]) : [];
  const uit = new Set<string>();
  for (const rubriek of rubrieken) {
    if (!isObject(rubriek)) continue;
    const kaderRuw = eigen(rubriek, 'ordeningskader');
    const kaders = Array.isArray(kaderRuw) ? kaderRuw : [kaderRuw];
    for (const kader of kaders) {
      if (!isObject(kader)) continue;
      const richtingenRuw = eigen(kader, 'studierichtingen');
      const richtingen = Array.isArray(richtingenRuw) ? richtingenRuw : [richtingenRuw];
      for (const richting of richtingen) {
        if (!isObject(richting)) continue;
        const nr = eigen(richting, KOPPEL_PARAMETER);
        if (typeof nr !== 'string') continue;
        const t = nr.trim();
        if (GROEP_NUMMER.test(t)) uit.add(t);
      }
    }
  }
  return [...uit].sort(vergelijkGroepnummer);
}

/**
 * Vergelijkt de koppeling uit de API met het ordeningskader in de setbestanden, op het niveau van de
 * nummers. Alleen sets waarin het ordeningskader minstens één doel aan een richting geeft, tellen mee
 * (de basisvorming draagt geen richtingtag). Per groep uit `koppeling` en per zulke set: de nummers
 * die alleen de API of alleen het ordeningskader aan de groep geeft. Een set die niet in `setDoelen`
 * staat, kan niet vergeleken worden (dat vangt poort D3). Gesorteerd op groep en set.
 */
export function kruiscontrole(
  koppeling: ReadonlyMap<string, readonly RichtingDoelenSet[]>,
  setDoelen: ReadonlyMap<string, readonly { id?: string; extra?: Record<string, unknown> }[]>,
): KruisVerschil[] {
  // Per set: groep → nummers volgens het ordeningskader.
  const kader = new Map<string, Map<string, Set<string>>>();
  for (const [set, doelen] of setDoelen) {
    let perGroep: Map<string, Set<string>> | undefined;
    for (const doel of doelen) {
      if (typeof doel.id !== 'string' || doel.id === '') continue;
      for (const groep of groepnummersVanDoel(doel)) {
        if (perGroep === undefined) perGroep = new Map();
        let ids = perGroep.get(groep);
        if (ids === undefined) perGroep.set(groep, (ids = new Set()));
        ids.add(doel.id);
      }
    }
    if (perGroep !== undefined) kader.set(set, perGroep);
  }

  const uit: KruisVerschil[] = [];
  for (const [groep, sets] of koppeling) {
    const api = new Map<string, Set<string>>();
    for (const s of sets) {
      let ids = api.get(s.set);
      if (ids === undefined) api.set(s.set, (ids = new Set()));
      for (const id of s.ids) ids.add(id);
    }
    for (const [set, perGroep] of kader) {
      const volgensKader = perGroep.get(groep) ?? new Set<string>();
      const volgensApi = api.get(set) ?? new Set<string>();
      if (volgensKader.size === 0 && volgensApi.size === 0) continue;
      const alleenApi = [...volgensApi].filter((id) => !volgensKader.has(id)).sort(vergelijkNatuurlijk);
      const alleenOrdeningskader = [...volgensKader].filter((id) => !volgensApi.has(id)).sort(vergelijkNatuurlijk);
      if (alleenApi.length > 0 || alleenOrdeningskader.length > 0) uit.push({ groep, set, alleenApi, alleenOrdeningskader });
    }
  }
  return uit.sort((a, b) => vergelijkGroepnummer(a.groep, b.groep) || vergelijkNatuurlijk(a.set, b.set));
}

// ── Validatie van de bestanden ──────────────────────────────────────────────
//
// De validators controleren de vorm die het script schrijft (§ 3) en geven fouten in het Nederlands
// (leeg = in orde). De sha256-controle zit niet in deze module (geen crypto): wie het bestand leest,
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

function onbekendeVelden(o: Record<string, unknown>, toegestaan: readonly string[]): string[] {
  return Object.keys(o).filter((k) => !toegestaan.includes(k));
}

function controleerVelden(f: Fouten, o: Record<string, unknown>, toegestaan: readonly string[], plaats: string): void {
  const onbekend = onbekendeVelden(o, toegestaan);
  if (onbekend.length > 0) f.voeg('velden', `${plaats}: onbekende velden ${onbekend.map((k) => `"${k}"`).join(', ')}.`);
}

/** Controleert een optioneel tekstveld: ontbreekt, of nette tekst. */
function optioneleTekst(f: Fouten, o: Record<string, unknown>, veld: string, plaats: string): void {
  if (Object.prototype.hasOwnProperty.call(o, veld) && !isNetteTekst(o[veld])) {
    f.voeg('waarden', `${plaats}: "${veld}" is geen tekst (of leeg).`);
  }
}

function optioneleDatum(f: Fouten, o: Record<string, unknown>, veld: string, plaats: string): void {
  if (Object.prototype.hasOwnProperty.call(o, veld) && !isDatum(o[veld])) {
    f.voeg('datums', `${plaats}: "${veld}" is geen geldige datum (JJJJ-MM-DD).`);
  }
}

/**
 * Begin- en einddatum: geldige datums. Een einddatum vóór de begindatum is GEEN fout: in de echte
 * gegevens (verkenning van 9 oktober 2026) staan 8 onderdelen van 7de jaren die geannuleerd werden
 * vóór ze startten (begin 2025-09-01, einde 2025-07-14, erkenning NIET_ERKEND). Ze tellen als afgebouwd.
 */
function controleerPeriode(f: Fouten, o: Record<string, unknown>, plaats: string): void {
  optioneleDatum(f, o, 'begindatum', plaats);
  optioneleDatum(f, o, 'einddatum', plaats);
}

function controleerCode(f: Fouten, o: Record<string, unknown>, veld: string, plaats: string): void {
  if (!Object.prototype.hasOwnProperty.call(o, veld)) return;
  const c = o[veld];
  if (!isObject(c)) {
    f.voeg('waarden', `${plaats}: "${veld}" is geen object {code, omschrijving}.`);
    return;
  }
  controleerVelden(f, c, ['code', 'omschrijving'], `${plaats}, ${veld}`);
  optioneleTekst(f, c, 'code', `${plaats}, ${veld}`);
  optioneleTekst(f, c, 'omschrijving', `${plaats}, ${veld}`);
  if (c.code === undefined && c.omschrijving === undefined) f.voeg('waarden', `${plaats}: "${veld}" is leeg.`);
}

function controleerExtra(f: Fouten, o: Record<string, unknown>, plaats: string, verboden: readonly string[]): void {
  if (!Object.prototype.hasOwnProperty.call(o, 'extra')) return;
  const extra = o.extra;
  if (!isObject(extra) || Object.keys(extra).length === 0) {
    f.voeg('waarden', `${plaats}: "extra" is geen (niet-leeg) object.`);
    return;
  }
  for (const k of verboden) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) f.voeg('waarden', `${plaats}: "extra" bevat "${k}".`);
  }
}

/** Een lijst die strikt oplopend is volgens `vergelijk` (dus ook zonder dubbels). */
function controleerVolgorde<T>(f: Fouten, lijst: readonly T[], vergelijk: (a: T, b: T) => number, plaats: string, wat: string): void {
  for (let i = 1; i < lijst.length; i++) {
    const v = vergelijk(lijst[i - 1], lijst[i]);
    if (v === 0) f.voeg('volgorde', `${plaats}: ${wat} ${toon(lijst[i])} staat er meer dan één keer in.`);
    else if (v > 0) f.voeg('volgorde', `${plaats}: ${wat} ${toon(lijst[i])} staat na ${toon(lijst[i - 1])}, dat is de verkeerde volgorde.`);
  }
}

/**
 * Een lijst van nummers of codes. `verplicht`: het veld moet er staan (mag leeg zijn); anders mag het
 * ontbreken, maar niet leeg zijn (lege velden vallen weg).
 */
function controleerLijst(
  f: Fouten,
  o: Record<string, unknown>,
  veld: string,
  plaats: string,
  soort: 'nummers' | 'codes',
  verplicht: boolean,
): void {
  if (!Object.prototype.hasOwnProperty.call(o, veld)) {
    if (verplicht) f.voeg('waarden', `${plaats}: "${veld}" ontbreekt.`);
    return;
  }
  const lijst = o[veld];
  if (!Array.isArray(lijst)) {
    f.voeg('waarden', `${plaats}: "${veld}" is geen lijst.`);
    return;
  }
  if (!verplicht && lijst.length === 0) f.voeg('waarden', `${plaats}: "${veld}" is een lege lijst (die hoort weg te vallen).`);
  if (soort === 'nummers') {
    if (!lijst.every(isPositief)) {
      f.voeg('waarden', `${plaats}: "${veld}" bevat iets anders dan gehele getallen groter dan 0.`);
      return;
    }
    controleerVolgorde(f, lijst as number[], opGetal, plaats, `in "${veld}" het nummer`);
  } else {
    if (!lijst.every(isNetteTekst)) {
      f.voeg('waarden', `${plaats}: "${veld}" bevat iets anders dan (niet-lege) tekst.`);
      return;
    }
    controleerVolgorde(f, lijst as string[], vergelijkNatuurlijk, plaats, `in "${veld}" de code`);
  }
}

function controleerKop(f: Fouten, json: Record<string, unknown>, kind: string): void {
  if (json.app !== 'boosterz') f.voeg('kop', 'Kop: "app" moet "boosterz" zijn.');
  if (json.kind !== kind) f.voeg('kop', `Kop: "kind" moet "${kind}" zijn.`);
  if (json.v !== 1) f.voeg('kop', 'Kop: "v" moet 1 zijn.');
  for (const veld of ['bron', 'api', 'naamsvermelding', 'licentie']) {
    if (!isNetteTekst(json[veld])) f.voeg('kop', `Kop: "${veld}" ontbreekt of is leeg.`);
  }
}

const MATRIX_VELDEN = ['app', 'kind', 'v', 'bron', 'api', 'naamsvermelding', 'licentie', 'opgehaald', 'aantalGroepen', 'aantalOnderdelen', 'sha256', 'groepen', 'onderdelen'];
const GROEP_VELDEN = ['nummer', 'titel', 'graad', 'finaliteit', 'onderwijsniveau', 'soortLeerjaar', 'opleidingsvorm', 'type7', 'onderdelen', 'nietMeerInBron', 'extra'];
const ONDERDEEL_VELDEN = [
  'nummer', 'groep', 'titel', 'onderwijsvorm', 'studiedomein', 'stem', 'discipline', 'coefficient', 'niche', 'duaal', 'aanloop', 'ov4',
  'begindatum', 'einddatum', 'leerjaren', 'hoofdstructuren', 'onderwijsstelsels', 'instellingstypes', 'erkenningen', 'vorige', 'volgende',
  'voorbereidend', 'vervolg', 'oudNummer', 'faseBuso', 'laatsteWijziging', 'nietMeerInBron', 'extra',
];

function controleerGroepRecord(f: Fouten, g: unknown, i: number): string | undefined {
  if (!isObject(g)) {
    f.voeg('groep', `Groep ${i + 1}: is geen object.`);
    return undefined;
  }
  const nummer = typeof g.nummer === 'string' && GROEP_NUMMER.test(g.nummer) ? g.nummer : undefined;
  const plaats = `Groep ${nummer ?? i + 1}`;
  if (nummer === undefined) f.voeg('groep', `${plaats}: het nummer ${toon(g.nummer)} past niet op ${GROEP_NUMMER.source}.`);
  controleerVelden(f, g, GROEP_VELDEN, plaats);
  if (!isNetteTekst(g.titel)) f.voeg('waarden', `${plaats}: de titel ontbreekt of is leeg.`);
  if (g.graad !== undefined && g.graad !== '1' && g.graad !== '2' && g.graad !== '3') f.voeg('waarden', `${plaats}: de graad ${toon(g.graad)} is niet "1", "2" of "3".`);
  for (const veld of ['finaliteit', 'onderwijsniveau', 'soortLeerjaar', 'type7']) optioneleTekst(f, g, veld, plaats);
  controleerCode(f, g, 'opleidingsvorm', plaats);
  controleerLijst(f, g, 'onderdelen', plaats, 'nummers', true);
  if (Array.isArray(g.onderdelen) && g.onderdelen.length === 0) f.voeg('waarden', `${plaats}: de groep heeft geen onderdelen.`);
  optioneleDatum(f, g, 'nietMeerInBron', plaats);
  controleerExtra(f, g, plaats, ['api_url']);
  return nummer;
}

/** De getypte lijsten van een onderdeel en de sleutel in `extra` met de rest van hun elementen. */
const LIJST_EN_REST: readonly (readonly [string, string])[] = [
  ['leerjaren', 'leerjaren'],
  ['hoofdstructuren', 'hoofdstructuren'],
  ['onderwijsstelsels', 'onderwijsstelsels'],
  ['instellingstypes', 'instellingstypes'],
  ['erkenningen', 'structuuronderdeel_details'],
];

/**
 * Staat de getypte lijst er (niet leeg) en staat de rest van haar elementen in `extra`, dan is die rest
 * een lijst met evenveel objecten (één per element). Een lijst die niet te lezen was, staat letterlijk
 * in `extra`, maar dan ontbreekt de getypte lijst of is ze leeg.
 */
function controleerLijstRest(f: Fouten, o: Record<string, unknown>, plaats: string): void {
  const extra = o.extra;
  if (!isObject(extra)) return;
  for (const [veld, sleutel] of LIJST_EN_REST) {
    const lijst = o[veld];
    if (!Array.isArray(lijst) || lijst.length === 0 || !heeft(extra, sleutel)) continue;
    const rest = extra[sleutel];
    if (!Array.isArray(rest) || rest.length !== lijst.length || !rest.every(isObject)) {
      f.voeg('waarden', `${plaats}: "extra.${sleutel}" is geen lijst van ${lijst.length} objecten, één per element van "${veld}".`);
    }
  }
}

function controleerOnderdeelRecord(f: Fouten, o: unknown, i: number): { nummer?: number; groep?: string } {
  if (!isObject(o)) {
    f.voeg('onderdeel', `Onderdeel ${i + 1}: is geen object.`);
    return {};
  }
  const nummer = isPositief(o.nummer) ? o.nummer : undefined;
  const plaats = `Onderdeel ${nummer ?? `op plaats ${i + 1}`}`;
  if (nummer === undefined) f.voeg('onderdeel', `${plaats}: het nummer ${toon(o.nummer)} is geen geheel getal groter dan 0.`);
  const groep = typeof o.groep === 'string' && GROEP_NUMMER.test(o.groep) ? o.groep : undefined;
  if (groep === undefined) f.voeg('onderdeel', `${plaats}: de groep ${toon(o.groep)} past niet op ${GROEP_NUMMER.source}.`);
  controleerVelden(f, o, ONDERDEEL_VELDEN, plaats);
  if (!isNetteTekst(o.titel)) f.voeg('waarden', `${plaats}: de titel ontbreekt of is leeg.`);
  for (const veld of ['onderwijsvorm', 'stem', 'discipline', 'oudNummer', 'faseBuso']) optioneleTekst(f, o, veld, plaats);
  controleerCode(f, o, 'studiedomein', plaats);
  if (o.coefficient !== undefined && !(typeof o.coefficient === 'number' && Number.isFinite(o.coefficient))) {
    f.voeg('waarden', `${plaats}: "coefficient" is geen getal.`);
  }
  for (const veld of ['niche', 'duaal', 'aanloop', 'ov4']) {
    if (Object.prototype.hasOwnProperty.call(o, veld) && o[veld] !== true) f.voeg('waarden', `${plaats}: "${veld}" staat er alleen als het true is.`);
  }
  controleerPeriode(f, o, plaats);
  optioneleDatum(f, o, 'laatsteWijziging', plaats);
  optioneleDatum(f, o, 'nietMeerInBron', plaats);

  if (!Array.isArray(o.leerjaren)) {
    f.voeg('waarden', `${plaats}: "leerjaren" ontbreekt of is geen lijst.`);
  } else {
    const goed: Leerjaar[] = [];
    o.leerjaren.forEach((lj, j) => {
      const waar = `${plaats}, leerjaar ${j + 1}`;
      if (!isObject(lj)) {
        f.voeg('waarden', `${waar}: is geen object.`);
        return;
      }
      controleerVelden(f, lj, ['code', 'omschrijving', 'begindatum', 'einddatum'], waar);
      if (!isNetteTekst(lj.code)) f.voeg('waarden', `${waar}: de code ontbreekt.`);
      optioneleTekst(f, lj, 'omschrijving', waar);
      controleerPeriode(f, lj, waar);
      if (isNetteTekst(lj.code)) goed.push(lj as Leerjaar);
    });
    if (goed.length === o.leerjaren.length) controleerVolgorde(f, goed, vergelijkLeerjaar, plaats, 'het leerjaar');
  }
  controleerLijst(f, o, 'hoofdstructuren', plaats, 'codes', true);
  controleerLijst(f, o, 'onderwijsstelsels', plaats, 'codes', false);
  controleerLijst(f, o, 'instellingstypes', plaats, 'codes', false);
  if (Object.prototype.hasOwnProperty.call(o, 'erkenningen')) {
    if (!Array.isArray(o.erkenningen) || o.erkenningen.length === 0) {
      f.voeg('waarden', `${plaats}: "erkenningen" is geen (niet-lege) lijst.`);
    } else {
      const goed: Erkenning[] = [];
      o.erkenningen.forEach((e, j) => {
        const waar = `${plaats}, erkenning ${j + 1}`;
        if (!isObject(e)) {
          f.voeg('waarden', `${waar}: is geen object.`);
          return;
        }
        controleerVelden(f, e, ['nummer', 'versie', 'status', 'begindatum', 'einddatum'], waar);
        if (!isNetteTekst(e.nummer)) f.voeg('waarden', `${waar}: het nummer ontbreekt.`);
        optioneleTekst(f, e, 'versie', waar);
        optioneleTekst(f, e, 'status', waar);
        controleerPeriode(f, e, waar);
        if (isNetteTekst(e.nummer)) goed.push(e as Erkenning);
      });
      if (goed.length === o.erkenningen.length) controleerVolgorde(f, goed, vergelijkErkenning, plaats, 'de erkenning');
    }
  }
  for (const veld of ['vorige', 'volgende', 'voorbereidend', 'vervolg']) controleerLijst(f, o, veld, plaats, 'nummers', false);
  controleerExtra(f, o, plaats, ['api_url']);
  controleerLijstRest(f, o, plaats);
  return { nummer, groep };
}

/**
 * Controleert het matrixbestand (§ 3.2): de kop, de vorm van elke groep en elk onderdeel (geen
 * onbekende velden: wat de API extra geeft, staat in `extra`; `api_url` mag nergens staan, ook niet in
 * `extra`; de rest van de elementen van een lijst is één object per element), de volgorde (groepen
 * met `vergelijkGroepnummer`, onderdelen oplopend, lijsten gesorteerd en uniek), geldige datums (een
 * einddatum vóór de begindatum mag: zie `controleerPeriode`), en de samenhang: elke groep heeft
 * onderdelen, elk onderdeel hoort bij een bestaande groep, en `groep.onderdelen` noemt precies de
 * onderdelen van die groep.
 */
export function valideerMatrixBestand(json: unknown): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const f = verzamelaar();
  controleerKop(f, json, 'studierichtingen');
  controleerVelden(f, json, MATRIX_VELDEN, 'Kop');
  if (!isTijdstip(json.opgehaald)) f.voeg('kop', 'Kop: "opgehaald" is geen tijdstip (JJJJ-MM-DDTUU:MM:SSZ).');
  if (typeof json.sha256 !== 'string' || !SHA256.test(json.sha256)) f.voeg('kop', 'Kop: "sha256" is geen sha256 (64 hex-tekens).');
  const groepen = json.groepen;
  const onderdelen = json.onderdelen;
  if (!Array.isArray(groepen) || !Array.isArray(onderdelen)) {
    if (!Array.isArray(groepen)) f.voeg('kop', '"groepen" ontbreekt of is geen lijst.');
    if (!Array.isArray(onderdelen)) f.voeg('kop', '"onderdelen" ontbreekt of is geen lijst.');
    return f.lijst();
  }
  if (groepen.length === 0) f.voeg('kop', 'Er staan geen groepen in het bestand.');
  if (json.aantalGroepen !== groepen.length) f.voeg('kop', `Kop zegt ${toon(json.aantalGroepen)} groepen, maar het bestand bevat er ${groepen.length}.`);
  if (json.aantalOnderdelen !== onderdelen.length) f.voeg('kop', `Kop zegt ${toon(json.aantalOnderdelen)} onderdelen, maar het bestand bevat er ${onderdelen.length}.`);

  const groepNummers: string[] = [];
  const onderdelenVanGroep = new Map<string, number[]>();
  groepen.forEach((g, i) => {
    const nummer = controleerGroepRecord(f, g, i);
    if (nummer === undefined) return;
    groepNummers.push(nummer);
    const lijst = isObject(g) && Array.isArray(g.onderdelen) ? g.onderdelen.filter(isPositief) : [];
    onderdelenVanGroep.set(nummer, lijst);
  });
  if (groepNummers.length === groepen.length) controleerVolgorde(f, groepNummers, vergelijkGroepnummer, 'Groepen', 'de groep');

  const onderdeelNummers: number[] = [];
  const groepVanOnderdeel = new Map<number, string>();
  onderdelen.forEach((o, i) => {
    const { nummer, groep } = controleerOnderdeelRecord(f, o, i);
    if (nummer === undefined) return;
    onderdeelNummers.push(nummer);
    if (groep !== undefined && !groepVanOnderdeel.has(nummer)) groepVanOnderdeel.set(nummer, groep);
  });
  if (onderdeelNummers.length === onderdelen.length) controleerVolgorde(f, onderdeelNummers, opGetal, 'Onderdelen', 'het onderdeel');

  // M3: de samenhang tussen groepen en onderdelen.
  const verwacht = new Map<string, number[]>();
  for (const [nummer, groep] of groepVanOnderdeel) {
    if (!onderdelenVanGroep.has(groep)) {
      f.voeg('samenhang', `Onderdeel ${nummer}: de groep ${groep} staat niet in de lijst met groepen.`);
      continue;
    }
    let lijst = verwacht.get(groep);
    if (lijst === undefined) verwacht.set(groep, (lijst = []));
    lijst.push(nummer);
  }
  for (const [groep, genoemd] of onderdelenVanGroep) {
    const echt = (verwacht.get(groep) ?? []).sort(opGetal);
    const genoemdUniek = sorteerUniek(genoemd, opGetal);
    const teVeel = genoemdUniek.filter((n) => !echt.includes(n));
    const teWeinig = echt.filter((n) => !genoemdUniek.includes(n));
    if (teVeel.length > 0) f.voeg('samenhang', `Groep ${groep}: noemt onderdeel ${teVeel.join(', ')}, maar dat hoort niet bij deze groep (of bestaat niet).`);
    if (teWeinig.length > 0) f.voeg('samenhang', `Groep ${groep}: onderdeel ${teWeinig.join(', ')} hoort bij deze groep, maar staat niet in "onderdelen".`);
  }
  return f.lijst();
}

const INDEX_VELDEN = ['app', 'kind', 'v', 'bron', 'api', 'naamsvermelding', 'licentie', 'matrixSha256', 'groepen'];
const REGEL_VELDEN = ['groep', 'status', 'methode', 'aantal', 'sets', 'sha256', 'opgehaald', 'bestand', 'nietMeerInBron'];
const KOPPEL_STATUSSEN: readonly string[] = ['gekoppeld', 'geen', 'nog-niet-opgehaald'];
const KOPPEL_METHODES: readonly string[] = ['api', 'graad-en-stroom'];

function heeft(o: Record<string, unknown>, veld: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, veld);
}

function controleerRegel(f: Fouten, r: unknown, i: number): string | undefined {
  if (!isObject(r)) {
    f.voeg('regel', `Regel ${i + 1}: is geen object.`);
    return undefined;
  }
  const groep = typeof r.groep === 'string' && GROEP_NUMMER.test(r.groep) ? r.groep : undefined;
  const plaats = `Regel ${groep ?? i + 1}`;
  if (groep === undefined) f.voeg('regel', `${plaats}: de groep ${toon(r.groep)} past niet op ${GROEP_NUMMER.source}.`);
  controleerVelden(f, r, REGEL_VELDEN, plaats);
  const status = typeof r.status === 'string' && KOPPEL_STATUSSEN.includes(r.status) ? r.status : undefined;
  if (status === undefined) f.voeg('regel', `${plaats}: de status ${toon(r.status)} is niet "gekoppeld", "geen" of "nog-niet-opgehaald".`);
  if (heeft(r, 'opgehaald') && !isTijdstip(r.opgehaald)) f.voeg('waarden', `${plaats}: "opgehaald" is geen tijdstip.`);
  if (heeft(r, 'bestand') && (groep === undefined || r.bestand !== `${groep}.json`)) f.voeg('waarden', `${plaats}: "bestand" moet "${groep ?? 'G-…'}.json" zijn.`);
  optioneleDatum(f, r, 'nietMeerInBron', plaats);

  const koppelVelden = ['methode', 'aantal', 'sets', 'sha256'];
  if (status === 'gekoppeld') {
    if (typeof r.methode !== 'string' || !KOPPEL_METHODES.includes(r.methode)) f.voeg('waarden', `${plaats}: de methode ${toon(r.methode)} is niet "api" of "graad-en-stroom".`);
    if (!isNatuurlijk(r.aantal)) f.voeg('waarden', `${plaats}: "aantal" is geen geheel getal ≥ 0.`);
    if (!isNatuurlijk(r.sets)) f.voeg('waarden', `${plaats}: "sets" is geen geheel getal ≥ 0.`);
    if (isNatuurlijk(r.aantal) && isNatuurlijk(r.sets) && (r.sets > r.aantal || (r.sets === 0) !== (r.aantal === 0))) {
      f.voeg('waarden', `${plaats}: ${r.sets} sets met samen ${r.aantal} doelen kan niet.`);
    }
    if (typeof r.sha256 !== 'string' || !SHA256.test(r.sha256)) f.voeg('waarden', `${plaats}: "sha256" is geen sha256.`);
    if (!heeft(r, 'opgehaald')) f.voeg('waarden', `${plaats}: "opgehaald" ontbreekt.`);
    if (!heeft(r, 'bestand')) f.voeg('waarden', `${plaats}: "bestand" ontbreekt bij een gekoppelde groep.`);
  } else if (status !== undefined) {
    const teVeel = koppelVelden.filter((v) => heeft(r, v));
    if (teVeel.length > 0) f.voeg('waarden', `${plaats}: ${teVeel.map((v) => `"${v}"`).join(', ')} hoort alleen bij een gekoppelde groep.`);
    if (status === 'geen') {
      if (!heeft(r, 'opgehaald')) f.voeg('waarden', `${plaats}: "opgehaald" ontbreekt.`);
      if (heeft(r, 'bestand') && !heeft(r, 'nietMeerInBron')) f.voeg('waarden', `${plaats}: een laatst bekend bestand hoort "nietMeerInBron" te hebben.`);
    } else {
      for (const v of ['bestand', 'opgehaald']) {
        if (heeft(r, v)) f.voeg('waarden', `${plaats}: "${v}" hoort niet bij een groep die nog niet opgehaald is.`);
      }
    }
  }
  return groep;
}

/**
 * Controleert de index van de koppeling (§ 3.3): de kop met `matrixSha256`, één regel per groep,
 * gesorteerd met `vergelijkGroepnummer` en uniek, en per status de velden die erbij horen.
 * Of er één regel per groep van de matrix is, en of de bestanden kloppen, controleert de datatest.
 */
export function valideerRichtingDoelenIndex(json: unknown): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const f = verzamelaar();
  controleerKop(f, json, 'richtingdoelen-index');
  controleerVelden(f, json, INDEX_VELDEN, 'Kop');
  if (typeof json.matrixSha256 !== 'string' || !SHA256.test(json.matrixSha256)) f.voeg('kop', 'Kop: "matrixSha256" is geen sha256 (64 hex-tekens).');
  const groepen = json.groepen;
  if (!Array.isArray(groepen)) {
    f.voeg('kop', '"groepen" ontbreekt of is geen lijst.');
    return f.lijst();
  }
  if (groepen.length === 0) f.voeg('kop', 'Er staan geen groepen in de index.');
  const nummers: string[] = [];
  groepen.forEach((r, i) => {
    const groep = controleerRegel(f, r, i);
    if (groep !== undefined) nummers.push(groep);
  });
  if (nummers.length === groepen.length) controleerVolgorde(f, nummers, vergelijkGroepnummer, 'Index', 'de groep');
  return f.lijst();
}

const BESTAND_VELDEN = [
  'app', 'kind', 'v', 'groep', 'titel', 'graad', 'methode', 'filter', 'bron', 'api', 'naamsvermelding', 'licentie', 'opgehaald', 'aantal',
  'sha256', 'nietMeerInBron', 'sets',
];
const SET_VELDEN = ['set', 'onderwijssoort', 'setSha', 'setAantal', 'ids'];

/**
 * Controleert een bestand met de doelen van één richting (§ 3.4): de kop (met de juiste filter voor de
 * methode; `graad-en-stroom` alleen in de 1ste graad), en per set de vorm, het versiemerk, de ids
 * (natuurlijk gesorteerd en uniek binnen de set, en niet meer dan `setAantal`), de volgorde van de sets
 * (elke set één keer) en `aantal` = de som van de ids. Hetzelfde nummer mag in meer sets staan: in de
 * echte minimumdoelen delen een andere versie van een set en de BuSO-kopie hun vaste nummers (bv.
 * 73740 in ODS_2118 en ODS_2334), en een bestand bevat alle sets, ook BuSO en oude versies. Met
 * `groep`: het bestand hoort bij die groep.
 */
export function valideerRichtingDoelenBestand(json: unknown, groep?: string): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const f = verzamelaar();
  controleerKop(f, json, 'richtingdoelen');
  controleerVelden(f, json, BESTAND_VELDEN, 'Kop');
  const eigenGroep = typeof json.groep === 'string' && GROEP_NUMMER.test(json.groep) ? json.groep : undefined;
  if (eigenGroep === undefined) f.voeg('kop', `Kop: de groep ${toon(json.groep)} past niet op ${GROEP_NUMMER.source}.`);
  if (groep !== undefined && json.groep !== groep) f.voeg('kop', `Kop: het bestand hoort bij ${toon(json.groep)}, niet bij ${toon(groep)}.`);
  if (!isNetteTekst(json.titel)) f.voeg('kop', 'Kop: "titel" ontbreekt of is leeg.');
  if (json.graad !== undefined && json.graad !== '1' && json.graad !== '2' && json.graad !== '3') f.voeg('kop', `Kop: de graad ${toon(json.graad)} is niet "1", "2" of "3".`);
  if (json.methode === 'api') {
    if (eigenGroep !== undefined && json.filter !== `${KOPPEL_PARAMETER}=${eigenGroep}`) f.voeg('kop', `Kop: de filter moet "${KOPPEL_PARAMETER}=${eigenGroep}" zijn.`);
  } else if (json.methode === 'graad-en-stroom') {
    if (json.graad !== '1') f.voeg('kop', 'Kop: de methode "graad-en-stroom" kan alleen in de 1ste graad.');
    if (typeof json.filter !== 'string' || !/^graad=1ste graad; stroom=[AB]-stroom\b/.test(json.filter)) f.voeg('kop', 'Kop: de filter van "graad-en-stroom" moet met "graad=1ste graad; stroom=A-stroom" of "…B-stroom" beginnen.');
  } else {
    f.voeg('kop', `Kop: de methode ${toon(json.methode)} is niet "api" of "graad-en-stroom".`);
  }
  if (!isTijdstip(json.opgehaald)) f.voeg('kop', 'Kop: "opgehaald" is geen tijdstip (JJJJ-MM-DDTUU:MM:SSZ).');
  if (typeof json.sha256 !== 'string' || !SHA256.test(json.sha256)) f.voeg('kop', 'Kop: "sha256" is geen sha256 (64 hex-tekens).');
  optioneleDatum(f, json, 'nietMeerInBron', 'Kop');
  const sets = json.sets;
  if (!Array.isArray(sets)) {
    f.voeg('kop', '"sets" ontbreekt of is geen lijst.');
    return f.lijst();
  }

  let som = 0;
  const setNamen: string[] = [];
  sets.forEach((s, i) => {
    if (!isObject(s)) {
      f.voeg('set', `Set ${i + 1}: is geen object.`);
      return;
    }
    const naam = typeof s.set === 'string' && SET_ID.test(s.set) ? s.set : undefined;
    const plaats = `Set ${naam ?? i + 1}`;
    if (naam === undefined) f.voeg('set', `${plaats}: de set ${toon(s.set)} past niet op ODS_<getal>.`);
    else setNamen.push(naam);
    controleerVelden(f, s, SET_VELDEN, plaats);
    optioneleTekst(f, s, 'onderwijssoort', plaats);
    if (typeof s.setSha !== 'string' || !SET_SHA.test(s.setSha)) f.voeg('set', `${plaats}: het versiemerk "setSha" is niet 16 hex-tekens.`);
    if (!isPositief(s.setAantal)) f.voeg('set', `${plaats}: "setAantal" is geen geheel getal groter dan 0.`);
    const ids = s.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      f.voeg('set', `${plaats}: "ids" ontbreekt of is leeg.`);
      return;
    }
    if (!ids.every(isNetteTekst)) {
      f.voeg('set', `${plaats}: "ids" bevat iets anders dan (niet-lege) tekst.`);
      return;
    }
    som += ids.length;
    controleerVolgorde(f, ids, vergelijkNatuurlijk, plaats, 'het nummer');
    if (isPositief(s.setAantal) && ids.length > s.setAantal) f.voeg('set', `${plaats}: ${ids.length} nummers, maar de set telt er maar ${s.setAantal}.`);
  });
  if (setNamen.length === sets.length) controleerVolgorde(f, setNamen, vergelijkNatuurlijk, 'Sets', 'de set');
  if (json.aantal !== som) f.voeg('kop', `Kop zegt ${toon(json.aantal)} doelen, maar de sets bevatten er samen ${som}.`);
  return f.lijst();
}
