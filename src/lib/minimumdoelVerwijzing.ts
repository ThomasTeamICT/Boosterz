// ── Verwijzingen naar minimumdoelen (laag 2, zie docs/LEERPLANNEN.md § 14) ──
//
// Een leerplandoel verwijst in de bron naar minimumdoelen met een aanduiding en
// een of meer codes: "(MD 09.01, 09.03)", "ET 9.1-9.3", "Minimumdoelen: 09.01".
// Deze module vindt die codes, stelt codes gelijk (09.01 = 9.1), lost ze op naar
// set + vast nummer (`@id`) en stelt sets voor bij een graad, stroom en zoekwoorden.
//
// Puur: geen opslag, geen netwerk. Een code alleen is nooit genoeg als sleutel;
// binnen een set kan dezelfde code meer dan eens voorkomen (de nummering begint
// opnieuw per rubriek). Daarom meldt `losVerwijzingenOp` zulke gevallen als
// "dubbelzinnig" in plaats van er stil één te kiezen.

import type { MinimumdoelRef } from './curriculumTypes';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { oudeVersieIds } from './minimumdoelenBron';

/**
 * Code van een minimumdoel om te vergelijken: alleen cijfers en punten, per deel zonder
 * voorloopnullen, lege delen weg. "09.01" → "9.1", "09.10" → "9.10", "BG 1.2" → "1.2".
 * Zonder cijfers: "" (zo'n code past nooit op een doel).
 */
export function normaliseerMdCode(code: string): string {
  return code
    .replace(/[^\d.]/g, '')
    .split('.')
    .filter((deel) => deel !== '')
    .map((deel) => deel.replace(/^0+(?=\d)/, ''))
    .join('.');
}

/** Eén blok "aanduiding + codes" in een tekst, met de plaats ervan (eind exclusief). */
export interface VerwijzingBlok {
  start: number;
  eind: number;
  /** Het blok letterlijk, bv. "MD 09.01, 09.03". */
  tekst: string;
  /** De codes in het blok, reeksen uitgeschreven ("09.01-09.03" → 09.01, 09.02, 09.03). */
  codes: string[];
  /**
   * Een reeks in het blok kon niet uitgeschreven worden (een ander voorvoegsel zoals "09.08-10.02",
   * meer dan 30 codes, of een einde vóór het begin): `codes` bevat dan alleen de uiteinden. De
   * controlepoort meldt dat, zodat de leerkracht de verwijzingen zelf koppelt.
   */
  onvolledig?: true;
  /** De reeksen die niet uitgeschreven konden worden, met hun uiteinden. */
  onvolledigeReeksen?: { van: string; tot: string }[];
}

const AANDUIDING_BRON = '(?:md|et|em|minimumdoelen|minimumdoel|eindtermen|eindterm)(?!\\p{L})\\s*[:.]?\\s*';
/** Aanduiding los in een tekst: niet midden in een woord ("het", "emmer"). */
const RE_AANDUIDING = new RegExp(`(?<![\\p{L}\\p{N}])${AANDUIDING_BRON}`, 'giu');
/** Aanduiding na een scheidingsteken, bv. de tweede "MD" in "MD 09.01, MD 09.03". */
const RE_AANDUIDING_HIER = new RegExp(AANDUIDING_BRON, 'iuy');
/**
 * Een code: 1 of 2 cijfers, dan 1 tot 3 delen met een punt. Niet gevolgd door nog een cijfer, een
 * letter of een deel: "5.1a" is geen code "5.1" (anders bleef er een losse "a" in de tekst staan).
 */
const RE_CODE = /\d{1,2}(?:\.\d{1,3}){1,3}(?![\p{L}\p{N}]|\.\d)/uy;
const RE_SCHEIDING = /\s*(?:,|;|\/|\ben\b)\s*/iy;
/** Reeks: "-", "–", "t.e.m." (ook "tem", "t. e. m."), "t/m" of "tot en met". */
const RE_REEKS = /\s*(?:[-–]|t\.?\s?e\.?\s?m\.?(?!\p{L})|t\s?\/\s?m\.?(?!\p{L})|tot\s+en\s+met(?!\p{L}))\s*/iuy;
/** Verkorte reeks zonder spaties: "09.01-03" (het einde neemt het voorvoegsel van het begin over). */
const RE_REEKS_KORT = /[-–](\d{1,3})(?![\p{L}\p{N}]|\.\d)/uy;
const MAX_REEKS = 30;

function opPlaats(re: RegExp, tekst: string, plaats: number): RegExpExecArray | null {
  re.lastIndex = plaats;
  return re.exec(tekst);
}

/**
 * Reeks uitschrijven, opgevuld naar het formaat van het begin. Alleen bij hetzelfde voorvoegsel, een
 * einde na het begin en ≤ 30 codes; anders alleen de uiteinden, met `volledig: false`.
 */
function schrijfReeksUit(begin: string, eindDelen: string[], eindLetterlijk: string | undefined): { codes: string[]; volledig: boolean } {
  const beginDelen = begin.split('.');
  const laatste = beginDelen.length - 1;
  const zelfdeVoorvoegsel =
    eindDelen.length === beginDelen.length &&
    beginDelen.slice(0, laatste).every((deel, i) => parseInt(deel, 10) === parseInt(eindDelen[i], 10));
  const voorvoegsel = beginDelen.slice(0, laatste).join('.') + (laatste > 0 ? '.' : '');
  const breedte = beginDelen[laatste].length;
  const opgevuld = (n: number) => voorvoegsel + String(n).padStart(breedte, '0');
  const a = parseInt(beginDelen[laatste], 10);
  const b = parseInt(eindDelen[eindDelen.length - 1], 10);
  const eind = eindLetterlijk ?? (zelfdeVoorvoegsel ? opgevuld(b) : undefined);
  if (zelfdeVoorvoegsel && b > a && b - a + 1 <= MAX_REEKS) {
    const uit = [begin];
    for (let n = a + 1; n < b; n++) uit.push(opgevuld(n));
    uit.push(eind ?? opgevuld(b));
    return { codes: uit, volledig: true };
  }
  // Geen bruikbare reeks: alleen de uiteinden.
  return { codes: eind === undefined ? [begin] : [begin, eind], volledig: false };
}

/**
 * Alle blokken "aanduiding + codes" in een tekst, in volgorde. Een blok begint bij de aanduiding
 * (MD, ET, EM, minimumdoel(en), eindterm(en); hoofdletterongevoelig, met optioneel ":" of ".")
 * en loopt over codes gescheiden door komma, puntkomma, "en", "/" of een reeks met "-", "–", "t.e.m.",
 * "t/m" of "tot en met". Een reeks die niet uitgeschreven kan worden, maakt het blok `onvolledig`.
 * Na een scheidingsteken mag de aanduiding herhaald worden ("MD 09.01, MD 09.03").
 */
export function zoekVerwijzingBlokken(tekst: string): VerwijzingBlok[] {
  const blokken: VerwijzingBlok[] = [];
  RE_AANDUIDING.lastIndex = 0;
  let treffer: RegExpExecArray | null;
  while ((treffer = RE_AANDUIDING.exec(tekst)) !== null) {
    const start = treffer.index;
    let plaats = start + treffer[0].length;
    const eerste = opPlaats(RE_CODE, tekst, plaats);
    if (!eerste) {
      // Geen code na de aanduiding: verder zoeken na de aanduiding zelf.
      RE_AANDUIDING.lastIndex = Math.max(start + 1, plaats);
      continue;
    }
    const codes: string[] = [eerste[0]];
    const onvolledig: { van: string; tot: string }[] = [];
    const reeksVan = (begin: string, eindDelen: string[], eindLetterlijk: string | undefined): string[] => {
      const r = schrijfReeksUit(begin, eindDelen, eindLetterlijk);
      if (!r.volledig) onvolledig.push({ van: begin, tot: r.codes[r.codes.length - 1] });
      return r.codes;
    };
    plaats += eerste[0].length;
    let eind = plaats;
    for (;;) {
      const kort = opPlaats(RE_REEKS_KORT, tekst, plaats);
      if (kort) {
        const begin = codes[codes.length - 1];
        const delen = begin.split('.');
        delen[delen.length - 1] = kort[1];
        codes.pop();
        codes.push(...reeksVan(begin, delen, undefined));
        plaats += kort[0].length;
        eind = plaats;
        continue;
      }
      const reeks = opPlaats(RE_REEKS, tekst, plaats);
      if (reeks) {
        const code = opPlaats(RE_CODE, tekst, plaats + reeks[0].length);
        if (code) {
          const begin = codes.pop() as string;
          codes.push(...reeksVan(begin, code[0].split('.'), code[0]));
          plaats += reeks[0].length + code[0].length;
          eind = plaats;
          continue;
        }
      }
      const scheiding = opPlaats(RE_SCHEIDING, tekst, plaats);
      if (scheiding) {
        let na = plaats + scheiding[0].length;
        const herhaald = opPlaats(RE_AANDUIDING_HIER, tekst, na);
        if (herhaald) na += herhaald[0].length;
        const code = opPlaats(RE_CODE, tekst, na);
        if (code) {
          codes.push(code[0]);
          plaats = na + code[0].length;
          eind = plaats;
          continue;
        }
      }
      break;
    }
    const blok: VerwijzingBlok = { start, eind, tekst: tekst.slice(start, eind), codes };
    if (onvolledig.length > 0) {
      blok.onvolledig = true;
      blok.onvolledigeReeksen = onvolledig;
    }
    blokken.push(blok);
    RE_AANDUIDING.lastIndex = eind;
  }
  return blokken;
}

/**
 * Codes van minimumdoelen in een stuk tekst, in volgorde, ontdubbeld (op `normaliseerMdCode`) en
 * letterlijk zoals in de tekst. Een reeks ("MD 09.01-09.03") wordt uitgeschreven als beide uiteinden
 * hetzelfde voorvoegsel hebben en de reeks hoogstens 30 codes telt; anders alleen de uiteinden (het
 * blok is dan `onvolledig`; wie dat moet weten, gebruikt `zoekVerwijzingBlokken`).
 * Codes zonder punt ("ET 12") herkent deze functie bewust niet: zo'n getal is te vaak iets anders.
 */
export function vindVerwijzingen(tekst: string): string[] {
  const uit: string[] = [];
  const gezien = new Set<string>();
  for (const blok of zoekVerwijzingBlokken(tekst)) {
    for (const code of blok.codes) {
      const sleutel = normaliseerMdCode(code);
      if (!sleutel || gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      uit.push(code);
    }
  }
  return uit;
}

export interface VerwijzingProbleem {
  code: string;
  soort: 'onbekend' | 'dubbelzinnig';
  kandidaten: MinimumdoelRef[];
}

export interface VerwijzingOplossing {
  refs: MinimumdoelRef[];
  problemen: VerwijzingProbleem[];
}

/**
 * Lost codes op naar verwijzingen (set + vast nummer). Een code past op een doel als de
 * genormaliseerde codes gelijk zijn. Precies één passend doel over alle meegegeven sets heen geeft
 * een verwijzing; geen enkel geeft "onbekend"; meer dan één geeft "dubbelzinnig" met alle kandidaten.
 *
 * - Doelen zonder `id` tellen niet mee: zonder vast nummer kan je er niet blijvend naar verwijzen.
 * - Hetzelfde doel (zelfde `id`) in twee meegegeven sets telt als twee kandidaten: elke set is een
 *   eigen officiële publicatie en de verwijzing hoort bij één set. Geef dus alleen de sets mee die
 *   bij het leerplan horen.
 * - De volgorde van `refs` volgt de codes; refs zijn ontdubbeld op set + id, problemen op de
 *   genormaliseerde code.
 */
export function losVerwijzingenOp(codes: readonly string[], sets: readonly MinimumdoelenSetBestand[]): VerwijzingOplossing {
  const opCode = new Map<string, MinimumdoelRef[]>();
  for (const bestand of sets) {
    const setId = bestand?.set?.id;
    if (typeof setId !== 'string' || !Array.isArray(bestand.doelen)) continue;
    for (const doel of bestand.doelen) {
      if (!doel || typeof doel.id !== 'string' || doel.id.trim() === '' || typeof doel.code !== 'string') continue;
      const sleutel = normaliseerMdCode(doel.code);
      if (!sleutel) continue;
      const lijst = opCode.get(sleutel) ?? [];
      if (!lijst.some((r) => r.set === setId && r.id === doel.id)) lijst.push({ set: setId, id: doel.id, code: doel.code });
      opCode.set(sleutel, lijst);
    }
  }

  const refs: MinimumdoelRef[] = [];
  const problemen: VerwijzingProbleem[] = [];
  const refGezien = new Set<string>();
  const probleemGezien = new Set<string>();
  for (const code of codes) {
    const sleutel = normaliseerMdCode(code);
    const kandidaten = sleutel ? opCode.get(sleutel) ?? [] : [];
    if (kandidaten.length === 1) {
      const ref = kandidaten[0];
      const k = `${ref.set}\u0000${ref.id}`;
      if (!refGezien.has(k)) {
        refGezien.add(k);
        refs.push({ ...ref });
      }
      continue;
    }
    const pk = sleutel || `\u0000${code}`;
    if (probleemGezien.has(pk)) continue;
    probleemGezien.add(pk);
    problemen.push({
      code,
      soort: kandidaten.length === 0 ? 'onbekend' : 'dubbelzinnig',
      kandidaten: kandidaten.map((r) => ({ ...r })),
    });
  }
  return { refs, problemen };
}

// ── Sets voorstellen ────────────────────────────────────────────────────────

function zonderAccenten(t: string): string {
  return t.normalize('NFD').replace(/\p{M}+/gu, '');
}

function eenvoudig(t: string): string {
  return zonderAccenten(t).toLowerCase().replace(/\s+/g, ' ').trim();
}

const GRAAD_WOORDEN: Record<string, string> = { eerste: '1', tweede: '2', derde: '3', een: '1', twee: '2', drie: '3' };

/** "1ste graad", "1e graad", "eerste graad", "graad 1" en "1" worden allemaal "1"; idem 2 en 3. */
function graadSleutel(graad: string): string {
  const t = eenvoudig(graad);
  const m =
    /(\d)\s*(?:ste|de|e)?\s*graad/.exec(t) ??
    /graad\s*(\d)/.exec(t) ??
    /(eerste|tweede|derde)\s*graad/.exec(t) ??
    /graad\s*(een|twee|drie)\b/.exec(t) ??
    /^(\d)$/.exec(t);
  if (!m) return t;
  return GRAAD_WOORDEN[m[1]] ?? m[1];
}

/** "A-stroom", "A stroom", "a" en "stroom A" worden allemaal "a"; idem B. */
function stroomSleutel(stroom: string): string {
  const t = eenvoudig(stroom);
  const m = /^([ab])(?:[\s-]*stroom)?$/.exec(t) ?? /^stroom[\s-]*([ab])$/.exec(t);
  return m ? m[1] : t;
}

export interface SetVoorstelOpties {
  graad?: string;
  stroom?: string;
  /** Zoekwoorden, gescheiden door spaties; elk woord moet voorkomen in naam, korte naam of id. */
  zoek?: string;
  /** Ook oude versies: sets die niet meer geldig zijn. */
  alleGeldigheden?: boolean;
}

/**
 * Sets uit de index die passen bij een leerplan. Standaard zonder de oude versies (`oudeVersieIds`):
 * "Niet meer geldig", en "Onbekend" naast een geldige set met dezelfde naam. Een set met "Onbekend"
 * zonder zo'n geldige naamgenoot blijft. Heeft geen enkele set in de index een geldigheid (oudere
 * index), dan wordt daar niet op gefilterd. Een set met een andere graad of stroom valt weg; een set zonder graad of stroom blijft
 * (zulke sets gelden vaak over graden heen) maar komt na de sets die exact passen. Daarna op korte
 * naam (of naam), natuurlijk gesorteerd. Puur: de index zelf verandert niet.
 */
export function stelSetsVoor(index: readonly MinimumdoelenIndexSet[], opties: SetVoorstelOpties = {}): MinimumdoelenIndexSet[] {
  const metGeldigheid = index.some((s) => typeof s.geldigheid === 'string' && s.geldigheid.trim() !== '');
  const oud = !opties.alleGeldigheden && metGeldigheid ? oudeVersieIds(index) : undefined;
  const graad = opties.graad?.trim() ? graadSleutel(opties.graad) : undefined;
  const stroom = opties.stroom?.trim() ? stroomSleutel(opties.stroom) : undefined;
  const woorden = eenvoudig(opties.zoek ?? '').split(' ').filter(Boolean);

  const passend: { set: MinimumdoelenIndexSet; score: number; naam: string }[] = [];
  for (const set of index) {
    if (oud?.has(set.id)) continue;
    let score = 0;
    if (graad !== undefined && set.graad) {
      if (graadSleutel(set.graad) !== graad) continue;
      score++;
    }
    if (stroom !== undefined && set.stroom) {
      if (stroomSleutel(set.stroom) !== stroom) continue;
      score++;
    }
    if (woorden.length > 0) {
      const hooi = eenvoudig([set.naam, set.korteNaam ?? '', set.id].join(' '));
      if (!woorden.every((w) => hooi.includes(w))) continue;
    }
    passend.push({ set, score, naam: set.korteNaam?.trim() || set.naam });
  }
  passend.sort(
    (a, b) =>
      b.score - a.score ||
      a.naam.localeCompare(b.naam, 'nl', { numeric: true, sensitivity: 'base' }) ||
      a.set.naam.localeCompare(b.set.naam, 'nl', { numeric: true }) ||
      a.set.id.localeCompare(b.set.id, 'nl', { numeric: true }),
  );
  return passend.map((p) => p.set);
}
