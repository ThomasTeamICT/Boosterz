// Officiële minimumdoelen in de app: lui ophalen uit public/leerplannen/minimumdoelen/ (laag 1,
// zie docs/LEERPLANNEN.md § 5 en § 14).
//
// De bestanden zijn te groot voor localStorage en voor de hoofdbundel (15 MB samen). De app haalt
// de index één keer op en een set pas wanneer iemand ze opent. De service worker bewaart ze daarna
// voor offline gebruik ("andere eigen bestanden: netwerk eerst, cache als terugval").

import {
  valideerSetBestand,
  type MinimumdoelenIndex,
  type MinimumdoelenIndexSet,
  type MinimumdoelenSetBestand,
} from './minimumdoelen';
import { bevatFrase, competentieFrases } from './vakZoektabel';

/** De map met de bestanden, naast de app (vite base './'; de hash-route verandert het pad niet). */
export const MINIMUMDOELEN_MAP = `${import.meta.env.BASE_URL}leerplannen/minimumdoelen/`;

/** Alleen dit patroon komt in een bestandsnaam: zo wordt er nooit een willekeurig pad opgehaald. */
const SET_ID = /^ODS_\d{1,9}$/;
/** Zoveel sets blijven in het geheugen; de oudste gaat eruit. */
export const MAX_SETS_IN_CACHE = 40;

export const FOUT_NIET_GELADEN =
  'De officiële minimumdoelen konden niet geladen worden. Kijk je internetverbinding na en probeer opnieuw.';
const FOUT_INDEX_VORM = 'De lijst met officiële minimumdoelen heeft een onverwachte vorm. Probeer het later opnieuw.';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isGeldigSetId(id: string): boolean {
  return SET_ID.test(id);
}

async function haalJson(url: string): Promise<{ status: number; json?: unknown }> {
  const res = await fetch(url);
  if (!res.ok) return { status: res.status };
  return { status: res.status, json: await res.json() };
}

function isIndexSet(v: unknown): v is MinimumdoelenIndexSet {
  return isObject(v) && typeof v.id === 'string' && SET_ID.test(v.id) && typeof v.naam === 'string' && v.naam.trim() !== '';
}

// ── Index ───────────────────────────────────────────────────────────────────

let indexBelofte: Promise<MinimumdoelenIndex> | null = null;

async function haalIndexOp(): Promise<MinimumdoelenIndex> {
  let json: unknown;
  try {
    const res = await haalJson(`${MINIMUMDOELEN_MAP}index.json`);
    if (res.json === undefined) throw new Error(`status ${res.status}`);
    json = res.json;
  } catch {
    throw new Error(FOUT_NIET_GELADEN);
  }
  if (!isObject(json) || json.app !== 'boosterz' || json.kind !== 'minimumdoelen-index' || !Array.isArray(json.sets)) {
    throw new Error(FOUT_INDEX_VORM);
  }
  // Een set zonder bruikbaar id of naam kan niemand openen: laat ze weg in plaats van de pagina te breken.
  return { ...(json as unknown as MinimumdoelenIndex), sets: json.sets.filter(isIndexSet) };
}

/**
 * De index van alle sets, één keer opgehaald (gedeelde belofte). Bij een fout wordt de cache gewist,
 * zodat een nieuwe poging echt opnieuw ophaalt.
 */
export function laadIndex(): Promise<MinimumdoelenIndex> {
  if (!indexBelofte) {
    const belofte = haalIndexOp();
    indexBelofte = belofte;
    belofte.catch(() => {
      if (indexBelofte === belofte) indexBelofte = null;
    });
  }
  return indexBelofte;
}

// ── Sets ────────────────────────────────────────────────────────────────────

const setCache = new Map<string, Promise<MinimumdoelenSetBestand>>();

async function haalSetOp(id: string): Promise<MinimumdoelenSetBestand> {
  let res: { status: number; json?: unknown };
  try {
    res = await haalJson(`${MINIMUMDOELEN_MAP}${id}.json`);
  } catch {
    throw new Error(FOUT_NIET_GELADEN);
  }
  if (res.json === undefined) {
    if (res.status === 404) throw new Error(`De set ${id} bestaat niet (meer). Kies een set uit de lijst.`);
    throw new Error(FOUT_NIET_GELADEN);
  }
  const fouten = valideerSetBestand(res.json);
  const bestand = res.json as MinimumdoelenSetBestand;
  if (fouten.length === 0 && bestand.set.id !== id) fouten.push(`Het bestand hoort bij een andere set (${String(bestand.set.id)}).`);
  if (fouten.length > 0) {
    throw new Error(`De set ${id} kon niet gelezen worden: het bestand is beschadigd. Probeer het later opnieuw. (${fouten[0]})`);
  }
  return bestand;
}

/**
 * Eén set met al zijn doelen. Het id moet er uitzien als `ODS_<cijfers>`; alles anders is meteen een
 * fout (zonder iets op te halen). Een gelezen set blijft in het geheugen (maximaal 40; de oudste gaat
 * eruit). Een mislukte poging blijft niet in de cache staan.
 */
export function laadSet(id: string): Promise<MinimumdoelenSetBestand> {
  if (!SET_ID.test(id)) {
    return Promise.reject(new Error(`Ongeldig set-id (${JSON.stringify(id).slice(0, 40)}). Kies een set uit de lijst.`));
  }
  const bewaard = setCache.get(id);
  if (bewaard) return bewaard;
  const belofte = haalSetOp(id);
  setCache.set(id, belofte);
  while (setCache.size > MAX_SETS_IN_CACHE) {
    const oudste = setCache.keys().next().value as string;
    setCache.delete(oudste);
  }
  belofte.catch(() => {
    if (setCache.get(id) === belofte) setCache.delete(id);
  });
  return belofte;
}

/** Alleen voor tests: leegt de caches. */
export function wisMinimumdoelenCache(): void {
  indexBelofte = null;
  setCache.clear();
}

// ── Soort onderwijs ─────────────────────────────────────────────────────────

export type SoortOnderwijs = 'so' | 'buso' | 'vwo' | 'ander';

export const SOORT_LABEL: Record<SoortOnderwijs, string> = {
  so: 'Secundair onderwijs',
  buso: 'Buitengewoon secundair onderwijs',
  vwo: 'Volwassenenonderwijs',
  ander: 'Ander onderwijs',
};

/** Soort onderwijs, afgeleid uit het begin van de naam van de set. */
export function soortVanSet(naam: string): SoortOnderwijs {
  const n = naam.trim().toLowerCase();
  if (n.startsWith('buitengewoon')) return 'buso';
  if (n.includes('volwassenenonderwijs')) return 'vwo';
  if (n.startsWith('secundair onderwijs')) return 'so';
  return 'ander';
}

// ── Geldigheid ──────────────────────────────────────────────────────────────

export type GeldigheidCode = 'G' | 'N' | 'O';

/**
 * 'G' (geldig), 'N' (niet meer geldig) of 'O' (onbekend), uit het veld `geldigheid` van een set of
 * een indexregel. `undefined` als dat veld ontbreekt (oudere bestanden hebben het nog niet).
 */
export function geldigheidVan(set: { geldigheid?: string }): GeldigheidCode | undefined {
  if (typeof set.geldigheid !== 'string' || set.geldigheid.trim() === '') return undefined;
  const g = set.geldigheid.trim().toLowerCase();
  if (g === 'geldig') return 'G';
  if (g === 'niet meer geldig') return 'N';
  return 'O';
}

function jaarVan(datum: string | undefined): string | undefined {
  return typeof datum === 'string' && /^\d{4}/.test(datum) ? datum.slice(0, 4) : undefined;
}

/** "Geldig sinds 2024", "Niet meer geldig (2019–2025)", "Geldigheid onbekend"; niets zonder gegevens. */
export function geldigheidTekst(set: { geldigheid?: string; geldigVan?: string; geldigTot?: string }): string | undefined {
  const g = geldigheidVan(set);
  const van = jaarVan(set.geldigVan);
  const tot = jaarVan(set.geldigTot);
  if (g === 'G') return van ? `Geldig sinds ${van}` : 'Geldig';
  if (g === 'N') {
    if (van && tot) return `Niet meer geldig (${van === tot ? van : `${van}–${tot}`})`;
    if (tot) return `Niet meer geldig (tot ${tot})`;
    if (van) return `Niet meer geldig (was geldig sinds ${van})`;
    return 'Niet meer geldig';
  }
  if (g === 'O') return 'Geldigheid onbekend';
  return undefined;
}

/** Heeft minstens één set in de index een geldigheid? Zo niet, dan valt er niet op te filteren. */
export function indexHeeftGeldigheid(sets: readonly { geldigheid?: string }[]): boolean {
  return sets.some((s) => geldigheidVan(s) !== undefined);
}

// ── Weergave ────────────────────────────────────────────────────────────────

/** Een link uit een bestand, alleen als ze met http(s) begint; anders `undefined` (nooit `javascript:` e.d.). */
export function veiligeLink(url: string | undefined): string | undefined {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : undefined;
}

/** "2026-10-05T12:20:49Z" wordt "5 oktober 2026"; een datum die niet te lezen is, blijft zoals ze is. */
export function datumLeesbaar(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Wat een set onderscheidt van andere sets met dezelfde korte naam, uit de volledige naam: de
 * onderwijsvorm of finaliteit ("aso", "kso, tso Dubbele finaliteit Opleidingsvorm 4"), de soort
 * ("Pool", "Domein") en de soort doelen ("Specifieke eindtermen"). Graad en stroom staan al apart.
 * De gewone soorten "Vak" en "Eindtermen" blijven weg: die zijn bijna overal hetzelfde.
 */
export function contextVanSet(naam: string): string {
  const delen = naam.split(/\s+-\s+/).map((d) => d.trim()).filter(Boolean);
  if (delen.length === 0) return '';
  const structuur = delen[0]
    .replace(/^buitengewoon\s+/i, '')
    .replace(/^secundair\s+(volwassenen)?onderwijs\s*/i, '')
    .replace(/\b\d+(ste|de|e)\s+graad\b/gi, '')
    .replace(/\b[AB]-stroom\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const soort = delen.length >= 4 ? delen[1] : '';
  const doelen = delen.length >= 2 ? delen[delen.length - 1] : '';
  const standaard = (t: string) => /^(vak|eindtermen)$/i.test(t);
  return [structuur, soort, doelen].filter((t) => t !== '' && !standaard(t)).join(' · ');
}

// ── Zoeken en filteren ──────────────────────────────────────────────────────

export interface SetFilter {
  /** Zoektekst: naam, korte naam of id, zonder accenten en hoofdletterongevoelig. */
  zoek: string;
  geldigheid: GeldigheidCode | 'alle';
  /** Leeg = alle graden. */
  graad: string;
  soort: SoortOnderwijs | 'alle';
}

export function zonderAccenten(tekst: string): string {
  return tekst.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/**
 * De sets die aan alle filters voldoen, in de volgorde van de index. Alle zoekwoorden moeten passen. Een
 * zoekwoord dat een vak is ("aardrijkskunde"), vindt ook de set van de sleutelcompetentie die erbij hoort
 * ("Ruimtelijk bewustzijn"): dat is een hulp bij het zoeken, geen officiële koppeling (zie vakZoektabel.ts).
 */
export function filterSets(sets: readonly MinimumdoelenIndexSet[], filter: SetFilter): MinimumdoelenIndexSet[] {
  const termen = zonderAccenten(filter.zoek).split(/\s+/).filter(Boolean);
  const alternatieven = termen.map((t) => competentieFrases(t));
  return sets.filter((s) => {
    if (filter.geldigheid !== 'alle' && geldigheidVan(s) !== filter.geldigheid) return false;
    if (filter.graad !== '' && s.graad !== filter.graad) return false;
    if (filter.soort !== 'alle' && soortVanSet(s.naam) !== filter.soort) return false;
    if (termen.length === 0) return true;
    const hooi = zonderAccenten(`${s.naam} ${s.korteNaam ?? ''} ${s.id}`);
    return termen.every((t, i) => hooi.includes(t) || alternatieven[i].some((f) => bevatFrase(hooi, f)));
  });
}

/** De graden die in de index voorkomen, in natuurlijke volgorde ("1ste graad" vóór "2de graad"). */
export function graadOpties(sets: readonly MinimumdoelenIndexSet[]): string[] {
  const graden = new Set<string>();
  for (const s of sets) if (typeof s.graad === 'string' && s.graad.trim() !== '') graden.add(s.graad);
  return [...graden].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
}
