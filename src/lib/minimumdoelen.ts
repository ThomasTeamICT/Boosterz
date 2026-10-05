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
  let vorige: string | undefined;
  doelen.forEach((doel, i) => {
    const plaats = `doel ${i + 1}`;
    if (!isObject(doel)) {
      codeFouten.push(`${plaats}: is geen object.`);
      return;
    }
    const code = doel.code;
    if (!isTekst(code)) {
      codeFouten.push(`${plaats}: de code ontbreekt of is leeg.`);
    } else {
      if (gezien.has(code)) dubbel.push(`${plaats}: de code "${code}" komt meer dan één keer voor.`);
      gezien.add(code);
      if (vorige !== undefined && vergelijkCodes(vorige, code) > 0) {
        volgordeFouten.push(`${plaats}: "${code}" staat na "${vorige}", dat is de verkeerde volgorde.`);
      }
      vorige = code;
    }
    if (!isTekst(doel.tekst)) {
      tekstFouten.push(`${plaats}${isTekst(code) ? ` (${code})` : ''}: de tekst ontbreekt of is leeg.`);
    }
  });
  fouten.push(...beperk(codeFouten), ...beperk(dubbel), ...beperk(tekstFouten), ...beperk(volgordeFouten));
  return fouten;
}
