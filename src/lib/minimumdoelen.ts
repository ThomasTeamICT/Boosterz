// Minimumdoelen van de Vlaamse overheid: normaliseren en controleren (laag 1, zie
// docs/LEERPLANNEN.md § 5).
//
// Pure module, bewust zonder imports en alleen "erasable" TypeScript (geen enums,
// namespaces, parameter properties of decorators): Node 22 importeert dit bestand
// rechtstreeks via type stripping vanuit tools/leerplannen/haal-minimumdoelen.mjs.
//
// De vorm van de Onderwijsdoelen-API is nog niet met een echt antwoord bevestigd.
// Alles hier is daarom tolerant: velden kunnen ontbreken, een string of een object
// ({ naam }, { code }, { omschrijving }) zijn, en onbekende velden gaan niet stil
// verloren (ze komen in `extra` of in de veldinventaris van het rapport).

export interface Sleutelcompetentie {
  nr?: string;
  naam?: string;
}

export interface Minimumdoel {
  /** Vast nummer van het doel in de API (`@id`), als tekst. */
  id?: string;
  code: string;
  /** Letterlijk uit de bron; enkel begin- en eindwitruimte zijn weggehaald. */
  tekst: string;
  type?: string;
  sleutelcompetentie?: Sleutelcompetentie;
  graad?: string;
  stroom?: string;
  leerjaar?: string;
  /**
   * Alle andere velden van het API-record, ongewijzigd (tekst getrimd): kennisvelden, rubrieken
   * (`titels`), geldigheid, `optioneel`, enzovoort. Zo gaat niets verloren.
   */
  extra?: Record<string, unknown>;
}

export interface MinimumdoelenSetKop {
  id: string;
  naam: string;
  /** `onderwijsdoelenset_id` van de API. */
  apiId?: string;
  korteNaam?: string;
  versie?: string;
  /** Zie `geldigheidVanDoelen`. */
  geldigheid?: string;
  geldigVan?: string;
  geldigTot?: string;
  graad?: string;
  stroom?: string;
  leerjaar?: string;
  sleutelcompetenties: Sleutelcompetentie[];
  bron: string;
  api: string;
  naamsvermelding: string;
  licentie: string;
  opgehaald: string;
  aantal: number;
  /** SHA-256 (hex) van `canoniek(doelen)`. */
  sha256: string;
}

export interface MinimumdoelenSetBestand {
  app: 'boosterz';
  kind: 'minimumdoelen';
  v: 1;
  set: MinimumdoelenSetKop;
  doelen: Minimumdoel[];
}

export interface MinimumdoelenIndexSet {
  id: string;
  naam: string;
  korteNaam?: string;
  versie?: string;
  geldigheid?: string;
  geldigVan?: string;
  geldigTot?: string;
  graad?: string;
  stroom?: string;
  leerjaar?: string;
  aantal: number;
  sha256: string;
  opgehaald: string;
  /** Bestandsnaam in dezelfde map, bv. `SO_1STE_GRAAD_V2_1.json`. */
  bestand: string;
}

export interface MinimumdoelenIndex {
  app: 'boosterz';
  kind: 'minimumdoelen-index';
  v: 1;
  naamsvermelding: string;
  licentie: string;
  sets: MinimumdoelenIndexSet[];
}

export interface Structuur {
  graad?: string;
  stroom?: string;
  leerjaar?: string;
}

export interface SetInfo {
  /** `onderwijsdoelenset_id` van de API, als tekst. */
  apiId?: string;
  korteNaam?: string;
  versie?: string;
}

export interface SetVanRecord {
  setSleutel: string;
  setNaam: string;
  structuur: Structuur;
  setInfo: SetInfo;
}

export interface GenormaliseerdRecord extends SetVanRecord {
  doel: Minimumdoel;
}

export const API_BASIS = 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen';
/** Het patroon van een link naar één set op de site is nog niet gekend: we verwijzen naar de site. */
export const BRON_BASIS = 'https://www.onderwijsdoelen.be/';
export const NAAMSVERMELDING = 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)';
export const LICENTIE = 'nog te bevestigen';

const TEKST_SLEUTELS = ['naam', 'omschrijving', 'code', 'label', 'waarde'];
const MAX_DIEPTE = 4;
const SET_SLEUTEL_MAX = 80;
/** Bovenste velden van een record die we zelf verwerken; de rest gaat naar `extra`. */
const GEKENDE_VELDEN = ['code', 'omschrijving', 'onderwijsdoel_type', 'onderwijsdoelenset', 'id'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function tekstUit(v: unknown, sleutels: readonly string[], diepte: number): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : undefined;
  if (isObject(v) && diepte < MAX_DIEPTE) {
    for (const sleutel of sleutels) {
      const t = tekstUit(v[sleutel], sleutels, diepte + 1);
      if (t !== undefined) return t;
    }
  }
  return undefined;
}

/**
 * Leest een tekstwaarde uit een string, een getal of een object. Een string wordt getrimd (leeg
 * wordt `undefined`); een object geeft de eerste niet-lege van `naam`, `omschrijving`, `code`,
 * `label` en `waarde`.
 */
export function tekstVan(v: unknown): string | undefined {
  return tekstUit(v, TEKST_SLEUTELS, 0);
}

/** Zoals `tekstVan`, maar met een eigen voorkeursvolgorde voor objecten (bv. `code` eerst). */
function tekstVanMet(v: unknown, voorkeur: string): string | undefined {
  const sleutels = [voorkeur, ...TEKST_SLEUTELS.filter((s) => s !== voorkeur)];
  return tekstUit(v, sleutels, 0);
}

/**
 * Maakt van een naam een bestandsveilige sleutel in hoofdletters, bv. `SECUNDAIR_ONDERWIJS`.
 * Accenten vallen weg (É wordt E), zodat de sleutel altijd uit A-Z, 0-9 en _ bestaat.
 */
function slug(naam: string): string {
  return naam
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, SET_SLEUTEL_MAX)
    .replace(/_+$/, '');
}

/**
 * Waaraan we een doel binnen een set herkennen: zijn vaste nummer in de API (`id`), en alleen
 * zonder dat nummer zijn code. Een code is niet altijd uniek: in de echte gegevens begint de
 * nummering opnieuw per rubriek of pakket (bv. Muzikale en Plastische opvoeding hebben elk een doel 1).
 */
export function doelSleutel(doel: { code: string; id?: string }): string {
  return doel.id !== undefined ? `id:${doel.id}` : `code:${doel.code}`;
}

/** `onderwijsdoelenset_id` als tekst, als het een geheel getal (of een tekst met enkel cijfers) is. */
function apiIdVan(setObject: unknown): string | undefined {
  if (!isObject(setObject)) return undefined;
  const id = setObject.onderwijsdoelenset_id;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) return String(id);
  if (typeof id === 'string' && /^\d{1,15}$/.test(id.trim())) return id.trim();
  return undefined;
}

/**
 * Sleutel van een set. Heeft de set een `onderwijsdoelenset_id` (de API geeft dat als getal), dan
 * `ODS_<id>`: uniek en stabiel, ook als de naam verandert. Anders het `id`, `code` of `sleutel` van
 * het set-object als dat al een nette sleutel is (in hoofdletters), en anders een slug van de naam.
 * Zonder naam: `ONBEKEND`. Een slug van een lange naam wordt afgekapt en is dus niet altijd uniek;
 * het ophaalscript meldt dat als een set met meerdere namen.
 */
export function setSleutelVan(setObject: unknown, naam: string | undefined): string {
  const apiId = apiIdVan(setObject);
  if (apiId !== undefined) return `ODS_${apiId}`;
  if (isObject(setObject)) {
    for (const veld of ['id', 'code', 'sleutel']) {
      const waarde = setObject[veld];
      if (typeof waarde !== 'string') continue;
      const s = waarde.trim();
      if (/^[A-Za-z0-9_]+$/.test(s) && s.length <= SET_SLEUTEL_MAX) return s.toUpperCase();
    }
  }
  const s = naam === undefined ? '' : slug(naam);
  return s === '' ? 'ONBEKEND' : s;
}

/**
 * Leest een veld dat één waarde hoort te hebben (object of tekst). Een lijst met één element telt
 * als dat element; een lijst met meer elementen, of een waarde die geen object of tekst is (bv. een
 * boolean), is "meerwaardig": er gaat dan informatie verloren als we er één waarde uit nemen.
 */
function enkel(v: unknown): { waarde: unknown; meerwaardig: boolean } {
  if (v === undefined || v === null) return { waarde: undefined, meerwaardig: false };
  if (Array.isArray(v)) {
    if (v.length === 0) return { waarde: undefined, meerwaardig: false };
    const eerste = enkel(v[0]);
    return { waarde: eerste.waarde, meerwaardig: v.length > 1 || eerste.meerwaardig };
  }
  if (typeof v === 'string' || typeof v === 'number' || isObject(v)) return { waarde: v, meerwaardig: false };
  return { waarde: undefined, meerwaardig: true };
}

const STRUCTUUR_VELDEN = ['graad', 'stroom', 'leerjaar'] as const;

function sleutelcompetentieVan(v: unknown): Sleutelcompetentie | undefined {
  const bron = enkel(v).waarde;
  if (bron === undefined) return undefined;
  let nr: string | undefined;
  let naam: string | undefined;
  if (isObject(bron)) {
    nr = tekstVanMet(bron.nr, 'nr');
    naam = tekstVan(bron.naam) ?? tekstVan(bron.korte_naam);
  } else {
    naam = tekstVan(bron);
  }
  if (nr === undefined && naam === undefined) return undefined;
  const sc: Sleutelcompetentie = {};
  if (nr !== undefined) sc.nr = nr;
  if (naam !== undefined) sc.naam = naam;
  return sc;
}

/** Het set-object van een record en wat daar in zit; werkt ook voor onbruikbare records. */
function leesSet(record: unknown): {
  setObject: unknown;
  setNaam: string | undefined;
  structuurRaw: unknown;
  competentieRaw: unknown;
} {
  const setRaw = isObject(record) ? enkel(record.onderwijsdoelenset).waarde : undefined;
  if (!isObject(setRaw)) {
    return { setObject: undefined, setNaam: tekstVan(setRaw), structuurRaw: undefined, competentieRaw: undefined };
  }
  return {
    setObject: setRaw,
    setNaam: tekstVan(setRaw.onderwijsdoelenset) ?? tekstVan(setRaw.naam),
    structuurRaw: enkel(setRaw.onderwijsstructuur).waarde,
    competentieRaw: setRaw.vlaamse_sleutelcompetentie,
  };
}

/**
 * Tot welke set een record hoort: sleutel, naam en structuur (graad, stroom, leerjaar). Werkt ook
 * voor records die niet bruikbaar zijn als doel (geen code, geen object), zodat elk probleem aan een
 * set kan worden toegekend. Een record zonder set hoort bij `ONBEKEND`.
 */
export function setVan(record: unknown): SetVanRecord {
  const { setObject, setNaam, structuurRaw } = leesSet(record);
  const structuur: Structuur = {};
  if (isObject(structuurRaw)) {
    for (const veld of STRUCTUUR_VELDEN) {
      const waarde = tekstVan(enkel(structuurRaw[veld]).waarde);
      if (waarde !== undefined) structuur[veld] = waarde;
    }
  }
  const setInfo: SetInfo = {};
  const apiId = apiIdVan(setObject);
  if (apiId !== undefined) setInfo.apiId = apiId;
  if (isObject(setObject)) {
    const korteNaam = tekstVan(setObject.korte_naam);
    if (korteNaam !== undefined) setInfo.korteNaam = korteNaam;
    const versie = tekstVan(setObject.versie);
    if (versie !== undefined) setInfo.versie = versie;
  }
  return {
    setSleutel: setSleutelVan(setObject, setNaam),
    setNaam: setNaam ?? 'Onbekende set',
    structuur,
    setInfo,
  };
}

/**
 * Velden van het record waar meer in zit dan één object of tekst: `onderwijsdoelenset`,
 * `onderwijsstructuur` (en haar `graad`, `stroom` en `leerjaar`) of `vlaamse_sleutelcompetentie`
 * aanwezig maar geen object of tekst, of een lijst met meer dan één element. Wie er één waarde uit
 * haalt, verliest de rest; het ophaalscript meldt dat als probleem.
 */
export function meerwaardigeVelden(record: unknown): string[] {
  if (!isObject(record)) return [];
  const velden: string[] = [];
  const set = enkel(record.onderwijsdoelenset);
  if (set.meerwaardig) velden.push('onderwijsdoelenset');
  if (isObject(set.waarde)) {
    const structuur = enkel(set.waarde.onderwijsstructuur);
    if (structuur.meerwaardig) velden.push('onderwijsdoelenset.onderwijsstructuur');
    if (isObject(structuur.waarde)) {
      for (const veld of STRUCTUUR_VELDEN) {
        if (enkel(structuur.waarde[veld]).meerwaardig) velden.push(`onderwijsdoelenset.onderwijsstructuur.${veld}`);
      }
    }
    if (enkel(set.waarde.vlaamse_sleutelcompetentie).meerwaardig) velden.push('onderwijsdoelenset.vlaamse_sleutelcompetentie');
  }
  return velden;
}

/**
 * Waarom een record geen doel oplevert, of `undefined` als het bruikbaar is. Een `code` die een
 * JSON-getal is, telt als onbruikbaar: "1.10" zou als 1.1 binnenkomen en de nul verliezen.
 */
export function redenOnbruikbaar(record: unknown): string | undefined {
  if (!isObject(record)) return 'het record is geen object';
  if (typeof record.code === 'number') return 'de code is een JSON-getal (een code hoort tekst te zijn)';
  const heeftCode = tekstVanMet(record.code, 'code') !== undefined;
  const heeftTekst = tekstVanMet(record.omschrijving, 'omschrijving') !== undefined;
  if (!heeftCode && !heeftTekst) return 'code en omschrijving ontbreken';
  if (!heeftCode) return 'de code ontbreekt';
  if (!heeftTekst) return 'de omschrijving ontbreekt';
  return undefined;
}

/**
 * Zet één record van de API om naar een minimumdoel met de set waartoe het hoort. Geeft `null`
 * als het record onbruikbaar is (zie `redenOnbruikbaar`). De tekst blijft letterlijk.
 */
export function normaliseerRecord(record: unknown): GenormaliseerdRecord | null {
  if (!isObject(record) || redenOnbruikbaar(record) !== undefined) return null;
  const code = tekstVanMet(record.code, 'code');
  const tekst = tekstVanMet(record.omschrijving, 'omschrijving');
  if (code === undefined || tekst === undefined) return null;

  const { competentieRaw } = leesSet(record);
  const set = setVan(record);
  const { structuur } = set;

  const doel: Minimumdoel = { code, tekst };
  const id = record['@id'];
  if (typeof id === 'number' && Number.isFinite(id)) doel.id = String(id);
  else if (typeof id === 'string' && id.trim() !== '') doel.id = id.trim();
  const type = tekstVan(record.onderwijsdoel_type);
  if (type !== undefined) doel.type = type;
  const sleutelcompetentie = sleutelcompetentieVan(competentieRaw);
  if (sleutelcompetentie !== undefined) doel.sleutelcompetentie = sleutelcompetentie;
  if (structuur.graad !== undefined) doel.graad = structuur.graad;
  if (structuur.stroom !== undefined) doel.stroom = structuur.stroom;
  if (structuur.leerjaar !== undefined) doel.leerjaar = structuur.leerjaar;

  // Alle andere velden gaan mee, van elk type: tekst getrimd (lege tekst valt weg), getallen,
  // booleans, objecten en lijsten ongewijzigd. Alleen `null` valt weg: dat draagt geen gegeven.
  const extra: Record<string, unknown> = {};
  for (const veld of Object.keys(record).sort()) {
    if (GEKENDE_VELDEN.includes(veld) || veld.startsWith('@') || veld.startsWith('_')) continue;
    let waarde: unknown = record[veld];
    if (waarde === null || waarde === undefined) continue;
    if (typeof waarde === 'string') {
      waarde = waarde.trim();
      if (waarde === '') continue;
    } else if (typeof waarde === 'number' && !Number.isFinite(waarde)) continue;
    // defineProperty: een veld met de naam `__proto__` mag geen prototype instellen
    Object.defineProperty(extra, veld, { value: waarde, enumerable: true, writable: true, configurable: true });
  }
  if (Object.keys(extra).length > 0) doel.extra = extra;

  return { ...set, doel };
}

/** Sorteervolgorde van doelcodes: natuurlijk, zodat "1.2" vóór "1.10" en "9.2" vóór "10.1" komt. */
export function vergelijkCodes(a: string, b: string): number {
  return a.localeCompare(b, 'nl', { numeric: true });
}

function serialiseer(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(serialiseer).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const delen: string[] = [];
  for (const sleutel of Object.keys(obj).sort()) {
    const waarde = obj[sleutel];
    if (waarde === undefined || typeof waarde === 'function' || typeof waarde === 'symbol') continue;
    delen.push(JSON.stringify(sleutel) + ':' + serialiseer(waarde));
  }
  return '{' + delen.join(',') + '}';
}

export interface SetGeldigheid {
  /** "Geldig", "Niet meer geldig" of "Onbekend" (zoals de API het zegt). */
  geldigheid?: string;
  /** Vroegste `geldig_van_dt` van de doelen (JJJJ-MM-DD). */
  geldigVan?: string;
  /** Laatste `geldig_tot_dt`, alleen als élk doel een einddatum heeft (JJJJ-MM-DD). */
  geldigTot?: string;
}

function datumUit(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined;
}

/**
 * Geldigheid van een set, afgeleid uit `extra.geldigheid` van zijn doelen: het type dat het
 * vaakst voorkomt (bij gelijkstand alfabetisch), de vroegste begindatum en de laatste
 * einddatum. Zonder gegevens een leeg object.
 */
export function geldigheidVanDoelen(doelen: readonly Minimumdoel[]): SetGeldigheid {
  const types = new Map<string, number>();
  let van: string | undefined;
  let tot: string | undefined;
  let allemaalTot = doelen.length > 0;
  for (const doel of doelen) {
    const g = doel.extra?.geldigheid;
    const o = isObject(g) ? g : {};
    const type = typeof o.type === 'string' ? o.type.trim() : '';
    if (type) types.set(type, (types.get(type) ?? 0) + 1);
    const v = datumUit(o.geldig_van_dt);
    if (v !== undefined && (van === undefined || v < van)) van = v;
    const t = datumUit(o.geldig_tot_dt);
    if (t === undefined) allemaalTot = false;
    else if (tot === undefined || t > tot) tot = t;
  }
  const uit: SetGeldigheid = {};
  const meest = [...types.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
  if (meest) uit.geldigheid = meest[0];
  if (van !== undefined) uit.geldigVan = van;
  if (allemaalTot && tot !== undefined) uit.geldigTot = tot;
  return uit;
}

const ENTITEITEN: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", shy: '',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', sbquo: '\u201a', bdquo: '\u201e',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', bull: '\u2022', middot: '\u00b7', deg: '\u00b0',
  euro: '\u20ac', times: '\u00d7', divide: '\u00f7', laquo: '\u00ab', raquo: '\u00bb',
  eacute: '\u00e9', egrave: '\u00e8', ecirc: '\u00ea', euml: '\u00eb', aacute: '\u00e1', agrave: '\u00e0',
  acirc: '\u00e2', auml: '\u00e4', iuml: '\u00ef', icirc: '\u00ee', ouml: '\u00f6', ocirc: '\u00f4',
  uuml: '\u00fc', ucirc: '\u00fb', ccedil: '\u00e7', Eacute: '\u00c9', Euml: '\u00cb',
  minus: '\u2212', le: '\u2264', ge: '\u2265', ne: '\u2260', plusmn: '\u00b1', sup2: '\u00b2', sup3: '\u00b3',
};

/**
 * De HTML-elementen die `htmlNaarTekst` als tag herkent. Al de rest tussen "<" en ">" is tekst: in
 * wiskunde staat "<" en ">" letterlijk in een doel ("(#, <, $, >, =, /)", "0<x<1 en y>2").
 */
const HTML_ELEMENTEN = new Set([
  'a', 'abbr', 'b', 'big', 'blockquote', 'body', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del',
  'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'html', 'i', 'img', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'script', 'small', 'span', 'strike', 'strong', 'style', 'sub', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'tt', 'u', 'ul', 'var', 'wbr',
]);

/**
 * Een tag: "<naam>", "</naam>", "<naam/>" of met attributen in de vorm naam=waarde, of commentaar.
 * Attributen zonder waarde ("<td nowrap>") tellen bewust niet: zo wordt "a<b en c>d" nooit een tag.
 * De datatest in minimumdoelen.test.ts kijkt na dat er in de echte gegevens geen tag overblijft.
 */
const HTML_TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))*\s*\/?>/g;

/** Elementen waarvan de sluittag een regel afsluit. */
const BLOK_EINDE = new Set(['p', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'blockquote', 'pre', 'dl', 'dt', 'dd']);
/** Doorgehaalde tekst. */
const DOORHALING = new Set(['s', 'strike', 'del']);
/** Combinerende lange doorhaling (U+0336), na elk teken van doorgehaalde tekst. */
const DOORHAAL_TEKEN = '\u0336';

function paren(gewoon: string, klein: string): [string, string][] {
  const a = [...gewoon];
  const b = [...klein];
  return a.map((t, i) => [t, b[i]]);
}

/** Tekens met een vorm in Unicode-superscript (cijfers, + − = ( ), letters behalve q, enkele hoofdletters). */
const SUPERSCRIPT = new Map<string, string>([
  ...paren('0123456789+-\u2212=()ni', '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b\u207b\u207c\u207d\u207e\u207f\u2071'),
  ...paren('abcdefghjklmoprstuvwxyz', '\u1d43\u1d47\u1d9c\u1d48\u1d49\u1da0\u1d4d\u02b0\u02b2\u1d4f\u02e1\u1d50\u1d52\u1d56\u02b3\u02e2\u1d57\u1d58\u1d5b\u02b7\u02e3\u02b8\u1dbb'),
  ...paren('ABDEGHIJKLMNOPRTUVW', '\u1d2c\u1d2e\u1d30\u1d31\u1d33\u1d34\u1d35\u1d36\u1d37\u1d38\u1d39\u1d3a\u1d3c\u1d3e\u1d3f\u1d40\u1d41\u2c7d\u1d42'),
]);
/** Tekens met een vorm in Unicode-subscript. */
const SUBSCRIPT = new Map<string, string>([
  ...paren('0123456789+-\u2212=()', '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089\u208a\u208b\u208b\u208c\u208d\u208e'),
  ...paren('aeoxhklmnpstijruv', '\u2090\u2091\u2092\u2093\u2095\u2096\u2097\u2098\u2099\u209a\u209b\u209c\u1d62\u2c7c\u1d63\u1d64\u1d65'),
]);

function decodeerEntiteiten(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (geheel, naam: string) => {
    if (naam[0] === '#') {
      const n = naam[1] === 'x' || naam[1] === 'X' ? parseInt(naam.slice(2), 16) : parseInt(naam.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : geheel;
    }
    return Object.prototype.hasOwnProperty.call(ENTITEITEN, naam) ? ENTITEITEN[naam] : geheel;
  });
}

/** Na elk teken dat geen witruimte is een doorhaling: "e" → "e̶". */
function doorhalen(t: string): string {
  let uit = '';
  for (const teken of t) uit += /\s/.test(teken) ? teken : teken + DOORHAAL_TEKEN;
  return uit;
}

/**
 * Inhoud van `<sup>` of `<sub>`: in Unicode als elk teken een vorm heeft ("n" → "ⁿ", "2n+1" → "²ⁿ⁺¹"),
 * anders gemarkeerd als "^(…)" of "_(…)". Witruimte vooraan en achteraan blijft erbuiten; een
 * combinerend teken (zoals een doorhaling) blijft bij zijn teken.
 */
function kleinSchrift(inhoud: string, soort: 'sup' | 'sub'): string {
  const voor = /^\s*/.exec(inhoud)?.[0] ?? '';
  const kern = inhoud.slice(voor.length).trimEnd();
  const na = inhoud.slice(voor.length + kern.length);
  if (kern === '') return inhoud;
  const tabel = soort === 'sup' ? SUPERSCRIPT : SUBSCRIPT;
  let uit = '';
  for (const teken of kern) {
    const klein = /\p{M}/u.test(teken) ? teken : tabel.get(teken);
    if (klein === undefined) return `${voor}${soort === 'sup' ? '^' : '_'}(${kern})${na}`;
    uit += klein;
  }
  return voor + uit + na;
}

/**
 * Zet de HTML van een doeltekst uit de API om naar gewone tekst, zonder iets van de tekst te verliezen
 * of ongemerkt toe te voegen:
 * - alinea's, regeleinden en tabelrijen worden nieuwe regels, lijstitems beginnen met "• ", tabelcellen
 *   worden door een spatie gescheiden ("klank klank", niet "klankklank");
 * - alleen echte tags vallen weg (`HTML_TAG`); "<" en ">" in de tekst blijven staan;
 * - `<sup>` en `<sub>` worden Unicode-superscript of -subscript ("x<sup>n</sup>" → "xⁿ"), en waar
 *   dat niet kan "^(…)" of "_(…)";
 * - doorgehaalde tekst (`<s>`, `<strike>`, `<del>`) blijft staan, met een doorhaling per teken
 *   ("elektrisch<s>e</s> veld" → "elektrische̶ veld"). Hoe de doorhaling bedoeld is (een fout in de
 *   bron, of tekst die echt doorgehaald hoort), moet nog op onderwijsdoelen.be bevestigd worden; zo
 *   verdwijnt er in elk geval niets en komt er niets ongemerkt bij;
 * - entiteiten worden tekens.
 * Bedoeld om te tonen en te vergelijken; de bestanden van laag 1 houden de HTML letterlijk. Nooit
 * als HTML in een pagina zetten: het resultaat is tekst.
 */
export function htmlNaarTekst(html: string): string {
  const bron = html.replace(/\r\n?/g, '\n');
  // Elke `<sup>` of `<sub>` opent een eigen buffer, die bij het sluiten omgezet wordt.
  const stapel: { soort: 'tekst' | 'sup' | 'sub'; tekst: string }[] = [{ soort: 'tekst', tekst: '' }];
  let doorgehaald = 0;
  const schrijf = (t: string) => {
    stapel[stapel.length - 1].tekst += t;
  };
  const tekstDeel = (t: string) => {
    const gewoon = decodeerEntiteiten(t);
    schrijf(doorgehaald > 0 ? doorhalen(gewoon) : gewoon);
  };
  const sluitKlein = () => {
    const laag = stapel.pop() as { soort: 'sup' | 'sub'; tekst: string };
    schrijf(kleinSchrift(laag.tekst, laag.soort));
  };
  let plaats = 0;
  const tags = new RegExp(HTML_TAG.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = tags.exec(bron)) !== null) {
    const naam = m[2]?.toLowerCase();
    if (naam !== undefined && !HTML_ELEMENTEN.has(naam)) continue; // geen echte tag: blijft tekst
    tekstDeel(bron.slice(plaats, m.index));
    plaats = m.index + m[0].length;
    if (naam === undefined) continue; // commentaar
    const sluit = m[1] === '/';
    if (naam === 'br') schrijf('\n');
    else if (naam === 'li' && !sluit) schrijf('\n\u2022 ');
    else if (sluit && BLOK_EINDE.has(naam)) schrijf('\n');
    else if (sluit && (naam === 'td' || naam === 'th')) schrijf(' ');
    else if (naam === 'sup' || naam === 'sub') {
      if (!sluit) stapel.push({ soort: naam, tekst: '' });
      else if (stapel[stapel.length - 1].soort === naam) sluitKlein();
    } else if (DOORHALING.has(naam)) {
      doorgehaald = Math.max(0, doorgehaald + (sluit ? -1 : 1));
    }
  }
  tekstDeel(bron.slice(plaats));
  while (stapel.length > 1) sluitKlein(); // niet gesloten: toch omgezet
  return stapel[0].tekst
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * JSON met gesorteerde objectsleutels op elk niveau (arrays blijven in volgorde): dezelfde
 * inhoud geeft altijd dezelfde string, ook als de sleutelvolgorde verschilt.
 */
export function canoniek(waarde: unknown): string {
  return serialiseer(waarde);
}

/** Bezoekt elk bovenste veld en elk pad `onderwijsdoelenset.<x>` en `onderwijsdoelenset.<x>.<y>`. */
function elkPad(records: unknown[], bezoek: (pad: string, waarde: unknown) => void): void {
  for (const record of records) {
    if (!isObject(record)) continue;
    for (const veld of Object.keys(record)) bezoek(veld, record[veld]);
    const set = record.onderwijsdoelenset;
    if (!isObject(set)) continue;
    for (const x of Object.keys(set)) {
      bezoek(`onderwijsdoelenset.${x}`, set[x]);
      const diep = set[x];
      if (!isObject(diep)) continue;
      for (const y of Object.keys(diep)) bezoek(`onderwijsdoelenset.${x}.${y}`, diep[y]);
    }
  }
}

const opNaam = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Telt elk bovenste veld van de records en elk pad `onderwijsdoelenset.<x>` en
 * `onderwijsdoelenset.<x>.<y>`. Het rapport toont zo meteen welke velden de API echt levert en
 * welke we niet verwerken.
 */
export function veldInventaris(records: unknown[]): Record<string, number> {
  const telling = new Map<string, number>();
  elkPad(records, (pad) => telling.set(pad, (telling.get(pad) ?? 0) + 1));
  return Object.fromEntries([...telling.entries()].sort(opNaam));
}

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Per pad van `veldInventaris` het aantal per JSON-type (`string`, `number`, `boolean`, `null`,
 * `object`, `array`). Zo zie je dat een veld soms een tekst is en soms een object of een lijst.
 */
export function typeInventaris(records: unknown[]): Record<string, Record<string, number>> {
  const telling = new Map<string, Map<string, number>>();
  elkPad(records, (pad, waarde) => {
    let types = telling.get(pad);
    if (!types) telling.set(pad, (types = new Map()));
    const type = jsonType(waarde);
    types.set(type, (types.get(type) ?? 0) + 1);
  });
  return Object.fromEntries(
    [...telling.entries()].sort(opNaam).map(([pad, types]) => [pad, Object.fromEntries([...types.entries()].sort(opNaam))]),
  );
}

const MAX_FOUTEN_PER_SOORT = 10;

/** Beperkt een lange lijst gelijksoortige fouten, zodat een kapot bestand geen duizend regels geeft. */
function beperk(fouten: string[]): string[] {
  if (fouten.length <= MAX_FOUTEN_PER_SOORT) return fouten;
  const rest = fouten.length - MAX_FOUTEN_PER_SOORT;
  return [...fouten.slice(0, MAX_FOUTEN_PER_SOORT), `… en nog ${rest} van dezelfde soort`];
}

function isTekst(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Controleert een setbestand op de vorm die het ophaalscript schrijft en geeft een lijst fouten in
 * het Nederlands (leeg = in orde). De sha256-controle zit niet in deze module (geen crypto): de
 * test rekent `canoniek(doelen)` na.
 */
export function valideerSetBestand(json: unknown): string[] {
  if (!isObject(json)) return ['Het bestand bevat geen object.'];
  const fouten: string[] = [];

  if (json.app !== 'boosterz') fouten.push('Kop: "app" moet "boosterz" zijn.');
  if (json.kind !== 'minimumdoelen') fouten.push('Kop: "kind" moet "minimumdoelen" zijn.');
  if (json.v !== 1) fouten.push('Kop: "v" moet 1 zijn.');

  const set = json.set;
  let aantal: unknown;
  if (!isObject(set)) {
    fouten.push('Kop: "set" ontbreekt.');
  } else {
    if (!isTekst(set.id)) fouten.push('Kop: "set.id" ontbreekt.');
    aantal = set.aantal;
    if (typeof aantal !== 'number' || !Number.isInteger(aantal)) fouten.push('Kop: "set.aantal" ontbreekt of is geen geheel getal.');
    if (!isTekst(set.sha256)) fouten.push('Kop: "set.sha256" ontbreekt.');
  }

  const doelen = json.doelen;
  if (!Array.isArray(doelen)) {
    fouten.push('"doelen" ontbreekt of is geen lijst.');
    return fouten;
  }
  if (typeof aantal === 'number' && aantal !== doelen.length) {
    fouten.push(`Kop zegt ${aantal} doelen, maar het bestand bevat er ${doelen.length}.`);
  }

  const codeFouten: string[] = [];
  const dubbel: string[] = [];
  const tekstFouten: string[] = [];
  const volgordeFouten: string[] = [];
  const gezien = new Set<string>();
  let vorige: { code: string; id?: string } | undefined;
  doelen.forEach((doel, i) => {
    const plaats = `doel ${i + 1}`;
    if (!isObject(doel)) {
      codeFouten.push(`${plaats}: is geen object.`);
      return;
    }
    const code = doel.code;
    const id = doel.id;
    if (id !== undefined && !isTekst(id)) codeFouten.push(`${plaats}: de id is leeg of geen tekst.`);
    if (!isTekst(code)) {
      codeFouten.push(`${plaats}: de code ontbreekt of is leeg.`);
    } else {
      const heeftId = isTekst(id);
      // Een doel is uniek door zijn id; zonder id door zijn code. Dezelfde code mag bij meer doelen horen.
      const sleutel = doelSleutel({ code, ...(heeftId ? { id } : {}) });
      if (gezien.has(sleutel)) {
        dubbel.push(heeftId ? `${plaats}: de id "${id}" komt meer dan één keer voor.` : `${plaats}: de code "${code}" komt meer dan één keer voor (zonder id).`);
      }
      gezien.add(sleutel);
      if (vorige !== undefined) {
        const opCode = vergelijkCodes(vorige.code, code);
        if (opCode > 0) {
          volgordeFouten.push(`${plaats}: "${code}" staat na "${vorige.code}", dat is de verkeerde volgorde.`);
        } else if (opCode === 0 && vorige.code === code && vergelijkCodes(vorige.id ?? '', heeftId ? id : '') > 0) {
          volgordeFouten.push(`${plaats}: id "${heeftId ? id : ''}" staat na id "${vorige.id ?? ''}" bij dezelfde code "${code}", dat is de verkeerde volgorde.`);
        }
      }
      vorige = heeftId ? { code, id } : { code };
    }
    if (!isTekst(doel.tekst)) {
      tekstFouten.push(`${plaats}${isTekst(code) ? ` (${code})` : ''}: de tekst ontbreekt of is leeg.`);
    }
  });
  fouten.push(...beperk(codeFouten), ...beperk(dubbel), ...beperk(tekstFouten), ...beperk(volgordeFouten));
  return fouten;
}
