// Gaten dichten vanuit de dekking: welke doelen, en bij welke cursus ze passen (docs/STUDIERICHTINGEN.md § 22.4.1,
// § 22.4.2 en § 22.4.6).
//
// Een "gat" is een verplicht minimumdoel dat in de dekking op het scherm nog op `open` staat: geen enkele cursus werkt
// eraan. Dit bestand zegt welke doelen dat zijn, groepeert ze per set en zoekt bij de keuze van de leerkracht de doelcodes
// en de cursussen waar ze in passen. Het maken van het leerplan en de cursus, en het bewaren, staan in `gatenCursus.ts`.
//
// Regels die overal gelden:
// - Een doel is altijd set + vast nummer (open vraag O6), nooit de code alleen.
// - Een selectie uit de dekking is per set altijd een lijst vaste nummers, nooit 'alle' (F2-B6, § 9.5). Anders kan een
//   volledige set waarvan maar enkele doelen open staan, stil een hele set worden.
// - Gepland, verdieping, optioneel en uitbreiding horen er niet bij (F2-B5): gepland staat al op een sectie, verdieping
//   komt al aan bod en optioneel telt niet mee in het percentage.
//
// Puur en licht: geen opslag, geen DOM, geen netwerk; de zware modules komen alleen als type binnen, want dit bestand
// zit in het chunk van de dekking in de cursuseditor.

import type { Course } from './courseTypes';
import { normalizeGoalCode } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import type { CursusBijdrage, KaderDoel, MdDekking, MdRij } from './dekkingMinimumdoelen';

// ── Kleine hulpmiddelen ─────────────────────────────────────────────────────

/** Sleutel van een minimumdoel: set + vast nummer (een nulteken kan in geen van beide staan). */
function sleutelVan(set: string, id: string): string {
  return `${set}\u0000${id}`;
}

function tekstOfLeeg(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Een doelcode met minstens één letter of cijfer: een andere kan niet aan een sectie hangen (zie `sanitizeCourse`). */
function heeftInhoud(code: string): boolean {
  return /[\p{L}\p{N}]/u.test(code);
}

/** De rijen van de dekking, tolerant voor kapotte invoer (geen lijst, lege plaatsen). */
function rijenVan(dekking: Pick<MdDekking, 'rijen'> | null | undefined): MdRij[] {
  const rijen: unknown = dekking?.rijen;
  return Array.isArray(rijen) ? (rijen as (MdRij | null | undefined)[]).filter((r): r is MdRij => !!r && typeof r === 'object' && !!r.doel) : [];
}

// ── Welke doelen ────────────────────────────────────────────────────────────

/**
 * De verplichte doelen die nog nergens aan bod komen, uit de dekking zoals ze op het scherm staat (§ 22.4.1): rijen met
 * status `open`, `verplichteSet` waar en `optioneel` onwaar. Elk doel (set + vast nummer) één keer, in de volgorde van de
 * rijen en dus van het kader. Gepland, verdieping, optioneel en uitbreiding blijven erbuiten.
 */
export function openVerplichteDoelen(dekking: Pick<MdDekking, 'rijen'>): KaderDoel[] {
  const uit: KaderDoel[] = [];
  const gezien = new Set<string>();
  for (const rij of rijenVan(dekking)) {
    const doel = rij.doel;
    if (rij.status !== 'open' || !doel.verplichteSet || doel.optioneel) continue;
    const sleutel = sleutelVan(doel.set, doel.id);
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(doel);
  }
  return uit;
}

/** De open verplichte doelen van één set. */
export interface OpenSet {
  set: string;
  /** Korte naam van de set voor de weergave (zoals in `KaderDoel.setNaam`). */
  setNaam: string;
  doelen: KaderDoel[];
}

/** De open doelen per set, in de volgorde waarin elke set voor het eerst voorkomt (dus die van het kader). */
export function openPerSet(doelen: readonly KaderDoel[]): OpenSet[] {
  const perSet = new Map<string, OpenSet>();
  const gezien = new Set<string>();
  for (const doel of Array.isArray(doelen) ? doelen : []) {
    if (!doel) continue;
    const sleutel = sleutelVan(doel.set, doel.id);
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    let set = perSet.get(doel.set);
    if (!set) {
      set = { set: doel.set, setNaam: doel.setNaam, doelen: [] };
      perSet.set(doel.set, set);
    }
    set.doelen.push(doel);
  }
  return [...perSet.values()];
}

/**
 * Hoeveel optionele doelen en doelen uit een uitbreidingsset nog nergens aan bod komen (status `open`), elk doel één keer.
 * Ze zitten niet in het gat dat gedicht wordt; het venster zegt het wel, in een hint.
 */
export function openNietVerplicht(dekking: Pick<MdDekking, 'rijen'>): number {
  const gezien = new Set<string>();
  for (const rij of rijenVan(dekking)) {
    const doel = rij.doel;
    if (rij.status !== 'open' || (doel.verplichteSet && !doel.optioneel)) continue;
    gezien.add(sleutelVan(doel.set, doel.id));
  }
  return gezien.size;
}

/**
 * De selectie voor `leerplanVoorGaten`: per gekozen set de vaste nummers van haar open doelen, in de volgorde van de set.
 * ALTIJD een lijst, ook als alle doelen van een volledige set open staan (F2-B6): dit pad gaat nooit langs `'alle'`,
 * `zetDoelen`, `bouwSetKeuzes` of een beperkte `kiesbaar`. Een set die niet gekozen is, of zonder open doelen, staat er niet in.
 */
export function selectieVanOpen(open: readonly OpenSet[], sets: ReadonlySet<string>): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  for (const s of Array.isArray(open) ? open : []) {
    if (!s || !sets.has(s.set)) continue;
    const ids = uit.get(s.set) ?? [];
    for (const doel of Array.isArray(s.doelen) ? s.doelen : []) {
      const id = tekstOfLeeg(doel?.id);
      if (id !== '' && !ids.includes(id)) ids.push(id);
    }
    if (ids.length > 0) uit.set(s.set, ids);
  }
  return uit;
}

// ── Welke codes in een leerplan ─────────────────────────────────────────────

/** De bruikbare verwijzingen van een leerplandoel: set en vast nummer niet leeg (tolerant voor oude of kapotte opslag). */
function verwijzingenVan(refs: unknown): { set: string; id: string }[] {
  if (!Array.isArray(refs)) return [];
  const uit: { set: string; id: string }[] = [];
  for (const r of refs as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const ruw = r as { set?: unknown; id?: unknown };
    const set = tekstOfLeeg(ruw.set);
    const id = typeof ruw.id === 'number' && Number.isFinite(ruw.id) ? String(ruw.id) : tekstOfLeeg(ruw.id);
    if (set !== '' && id !== '') uit.push({ set, id });
  }
  return uit;
}

/**
 * Welke van deze minimumdoelen in het leerplan staan, en onder welke doelcode (§ 22.4.2, § 22.4.3).
 *
 * - Een doel staat in het leerplan als een leerplandoel ernaar verwijst (`refs`), strikt op set + vast nummer: hetzelfde
 *   nummer in een andere set of een andere versie van de set telt niet. Dat werkt ook voor een ingelezen leerplan van een
 *   net, waar één leerplandoel naar meer minimumdoelen kan verwijzen.
 * - De code is die van het eerste leerplandoel met een bruikbare code (minstens één letter of cijfer) dat naar het doel
 *   verwijst, genormaliseerd (`normalizeGoalCode`). `codes` heeft elke code één keer, in de volgorde van het leerplan.
 * - `inLeerplan` en `nietInLeerplan` houden de volgorde van `doelen`; een doel dat er twee keer in staat, telt één keer.
 *
 * Het leerplan wordt nooit aangepast: wat er niet in staat, komt niet op de cursus (F2-B8, § 22.4.4).
 */
export function codesVoorDoelen<T extends { set: string; id: string }>(
  leerplan: Curriculum,
  doelen: readonly T[],
): { codes: string[]; inLeerplan: T[]; nietInLeerplan: T[] } {
  const goals = Array.isArray(leerplan?.goals) ? leerplan.goals : [];
  /** Per minimumdoel de plaats in het leerplan van het eerste leerplandoel met een bruikbare code dat ernaar verwijst. */
  const eerste = new Map<string, number>();
  const codeVan: string[] = goals.map((goal) => normalizeGoalCode(typeof goal?.code === 'string' ? goal.code : ''));
  goals.forEach((goal, plaats) => {
    if (!heeftInhoud(codeVan[plaats])) return;
    for (const ref of verwijzingenVan(goal?.refs)) {
      const sleutel = sleutelVan(ref.set, ref.id);
      if (!eerste.has(sleutel)) eerste.set(sleutel, plaats);
    }
  });

  const inLeerplan: T[] = [];
  const nietInLeerplan: T[] = [];
  const plaatsen = new Set<number>();
  const gezien = new Set<string>();
  for (const doel of Array.isArray(doelen) ? doelen : []) {
    const sleutel = sleutelVan(tekstOfLeeg(doel?.set), tekstOfLeeg(doel?.id));
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const plaats = eerste.get(sleutel);
    if (plaats === undefined) {
      nietInLeerplan.push(doel);
    } else {
      inLeerplan.push(doel);
      plaatsen.add(plaats);
    }
  }
  const codes: string[] = [];
  for (const plaats of [...plaatsen].sort((a, b) => a - b)) {
    if (!codes.includes(codeVan[plaats])) codes.push(codeVan[plaats]);
  }
  return { codes, inLeerplan, nietInLeerplan };
}

// ── Welke cursussen ─────────────────────────────────────────────────────────

/** Een cursus met haar leerplan, en hoeveel van de gekozen doelen daarin staan. */
export interface Doelcursus {
  course: Course;
  leerplan: Curriculum;
  /** Aantal gekozen doelen (set + vast nummer) dat in het leerplan van de cursus staat. */
  passend: number;
}

/**
 * De cursussen waar (een deel van) de gekozen doelen in passen (§ 22.4.3): cursussen met een leerplan op dit toestel
 * (`bijdragen` van de dekking op het scherm) waarvan het leerplan minstens één gekozen doel bevat. De meeste passende
 * doelen eerst, daarna op titel (nl) en id. `zonderPassend` telt de cursussen met een leerplan waarin geen enkel gekozen
 * doel staat: ze staan niet als keuze in de lijst, het venster telt ze wel. Een cursus zonder leerplan (of waarvan het
 * leerplan niet het leerplan van de cursus is) valt weg en telt nergens mee. Elke cursus één keer.
 */
export function cursussenVoorGaten(
  doelen: readonly { set: string; id: string }[],
  bijdragen: readonly CursusBijdrage[],
): { kandidaten: Doelcursus[]; zonderPassend: number } {
  const kandidaten: Doelcursus[] = [];
  let zonderPassend = 0;
  const gezien = new Set<string>();
  for (const b of Array.isArray(bijdragen) ? bijdragen : []) {
    const course = b?.course;
    const leerplan = b?.leerplan;
    if (!course || !leerplan || typeof course.id !== 'string' || gezien.has(course.id)) continue;
    const cid = typeof course.curriculumId === 'string' ? course.curriculumId : '';
    if (cid === '' || leerplan.id !== cid) continue;
    gezien.add(course.id);
    const passend = codesVoorDoelen(leerplan, doelen).inLeerplan.length;
    if (passend > 0) kandidaten.push({ course, leerplan, passend });
    else zonderPassend++;
  }
  kandidaten.sort((a, b) =>
    b.passend - a.passend
    || (a.course.title ?? '').localeCompare(b.course.title ?? '', 'nl')
    || (a.course.id < b.course.id ? -1 : a.course.id > b.course.id ? 1 : 0));
  return { kandidaten, zonderPassend };
}
