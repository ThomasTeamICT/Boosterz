// Cursushulp voor een studierichting, zonder AI (docs/STUDIERICHTINGEN.md § 11 en § 12).
//
// Vanuit het doelenkader van een richting (richtingKader.ts) maken we hier:
// - het nagekeken leerplan van de richting, of van een deel ervan (`leerplanVoorRichting`), en we hergebruiken een
//   leerplan dat al op dit toestel staat (`vindLeerplanMetSelectie`) zodat er geen dubbels in de opslag komen;
// - een voorstel van sets bij een vak (`vakVoorstel`), met STEM-sets apart en nooit vooraf aangevinkt (ook de STEM-sets
//   van de 2de en 3de graad, die niet de sleutelcompetentie zelf zijn maar "STEM" heten);
// - een cursus met een geraamte: een hoofdstuk per set, een sectie per rubriek en de doelcodes al op de secties
//   (`cursusVoorRichting`);
// - de vergelijking met het kader na een maandelijkse update (`vergelijkMetKader`) en de hulpjes voor de schermen.
//
// Een deel van een set blijft een deel (§ 9.5): `naarSetKeuzes` geeft voor een deelset altijd de vaste nummers van de
// koppeling, nooit 'alle', en hier gaat nergens iets naar 'alle' terug. Zo blijft een deelset van 4 van 13 doelen
// tot in het leerplan 4 doelen.
//
// Puur en zonder netwerk: bewaren (`saveCurriculum`, `saveCourse`) doet de aanroeper. Geen React, geen DOM.

import { createCourse } from './courses';
import type { Course, CourseChapter, CourseSection } from './courseTypes';
import { allSections } from './courseTypes';
import { normalizeGoalCode, normalizeGoalCodes, shortGoalText } from './curriculum';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { doelgroepTekst, doelgroepVoorCursus, doelgroepVoorLeerplan, graadTekst, sanitizeDoelgroep, type Doelgroep } from './doelgroep';
import { leerplanUitSelectie, selectieVanLeerplan, telSelectie, type Samengesteld, type SetKeuze } from './doelenSamenstellen';
import { effectieveStatus } from './leerplanStatus';
import type { MinimumdoelenSetBestand } from './minimumdoelen';
import { isStemSet, zonderAccenten } from './minimumdoelenBron';
import {
  doelgroepVan,
  kaderAfdrukken,
  naarSetKeuzes,
  selectieVanKader,
  veranderdSindsLeerplan,
  type RichtingInfo,
  type RichtingKader,
} from './richtingKader';
import { kiesbareDoelen, setNaam } from './samenstelKeuze';
import { setNoemtVak } from './setKeuze';
import { uid } from './utils';

// ── Grenzen en kleine hulpmiddelen ──────────────────────────────────────────

/** Titels (van een leerplan, hoofdstuk of sectie) zijn hoogstens zo lang. */
const MAX_TITEL = 120;
/** Hoeveel tekens van een doel in de doelen-callout van een sectie komen. */
const MAX_REGEL_TEKST = 90;
/** Boven dit aantal doelen komt er één sectie per hoofdstuk, in plaats van een sectie per rubriek. */
const MAX_DOELEN_PER_RUBRIEK = 400;
const SCHEIDER_THEMA = ' › ';
const SCHEIDER_TITEL = ' · ';
const TERUGVAL = 'Doelen';
const TITEL_CALLOUT = 'Doelen in deze sectie';

/** Tekst inkorten tot hoogstens `max` tekens (met "…" als er iets wegviel), zonder een tekenpaar doormidden te knippen. */
function inkort(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, Math.max(0, max - 1));
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return `${uit.trimEnd()}…`;
}

/**
 * Delen van een titel samenvoegen met " · ", hoogstens `max` tekens. Past het niet, dan wordt telkens het langste deel
 * ingekort: zo blijven de graad en het begin van de andere delen leesbaar.
 */
function samenTitel(delen: readonly string[], max = MAX_TITEL): string {
  const lijst = delen.map((d) => d.trim()).filter((d) => d !== '');
  const lengte = () => lijst.join(SCHEIDER_TITEL).length;
  for (let ronde = 0; ronde < 50 && lengte() > max; ronde++) {
    let langste = 0;
    lijst.forEach((d, i) => {
      if (d.length > lijst[langste].length) langste = i;
    });
    const nieuw = inkort(lijst[langste], Math.max(1, lijst[langste].length - (lengte() - max)));
    if (nieuw.length >= lijst[langste].length) break;
    lijst[langste] = nieuw;
  }
  return inkort(lijst.join(SCHEIDER_TITEL), max);
}

/** Minstens één letter of cijfer: zo kan `sanitizeCourse` de code nooit laten vallen. */
function heeftInhoud(v: string): boolean {
  return /[\p{L}\p{N}]/u.test(v);
}

function sleutel(set: string, id: string): string {
  return `${set}\u0000${id}`;
}

// ── Het leerplan van een richting ───────────────────────────────────────────

/**
 * Het nagekeken leerplan van een richting, of van een deel ervan: de kadersets (standaard alle verplichte; `sets`
 * beperkt tot die sets, `ookUitbreiding` neemt ook de uitbreidingssets mee), als samengestelde lijst. Het is
 * `leerplanUitSelectie` op `naarSetKeuzes(selectieVanKader(…))`:
 *
 * - Een volledige set geeft de huidige inhoud van het bestand. Een deelset geeft precies de nummers van de koppeling
 *   die nog in het bestand staan, nooit de hele set (§ 9.5). Wat niet meer bestaat, staat in `ontbrekend` en in een
 *   waarschuwing achteraan (§ 7).
 * - Een uitbreidingsset komt er ook in als ze uitdrukkelijk gevraagd is: ze staat in `sets`, of het leerplan dat je
 *   bijwerkt (`bestaand`) had ze al. Zo gooit bijwerken een gekozen uitbreidingsset nooit weg. Zonder dat komt ze er
 *   alleen met `ookUitbreiding`; en `sets` blijft een beperking: een uitbreidingsset die niet in `sets` staat, komt er niet in.
 * - Een gevraagde set zonder bruikbaar setbestand in `bestanden` (niet geladen) valt niet stil weg: ze staat in
 *   `ontbrekendeSets`, de eerste waarschuwing zegt in gewone taal welke set niet geladen kon worden, en het leerplan is
 *   niet bevestigd (en zonder nakijkstatus), zodat het scherm niets bewaart. Een deelset waarvan de nummers niet meer in
 *   een wel geladen bestand staan, staat in `ontbrekend` en niet hier: de rest van het leerplan blijft.
 * - `doelgroep` komt op het leerplan zonder jaar (een leerplan geldt voor de hele graad), met `volgtKader` en de
 *   vingerafdrukken van het kader (`kaderAfdrukken`: `kader` en `kaderVolledig`) over de sets die echt in het leerplan
 *   zitten. Zo vergelijkt `vergelijkMetKader` later met precies dezelfde sets.
 * - `bestaand` werkt een eerder gemaakt samengesteld leerplan bij (zelfde id, codes blijven); is dat geen samengesteld
 *   leerplan, dan gooit `leerplanUitSelectie` een `Error`.
 * - Is `bevestigd` onwaar (een gevraagde set niet geladen, meer dan 50 sets, geen doelen, een doel valt weg bij het
 *   saneren), dan bewaart de aanroeper niets en toont hij de eerste waarschuwing.
 */
export function leerplanVoorRichting(
  kader: RichtingKader,
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>,
  doelgroep: Doelgroep,
  opties: {
    sets?: readonly string[];
    ookUitbreiding?: boolean;
    bestaand?: Curriculum;
    titel?: string;
    vak?: string;
    oudeVersies?: ReadonlySet<string>;
  } = {},
): Samengesteld & { ontbrekend: { set: string; ids: string[] }[]; ontbrekendeSets: string[] } {
  // Uitbreidingssets die uitdrukkelijk gevraagd zijn: in `sets`, of al in het leerplan dat we bijwerken.
  const uitbreiding = new Set(kader.sets.filter((k) => !k.verplicht).map((k) => k.set.id));
  const gevraagdeUitbreiding = new Set([...(opties.sets ?? []), ...(opties.bestaand?.minimumdoelenSets ?? [])].filter((id) => uitbreiding.has(id)));
  const selectie = selectieVanKader(kader, { sets: opties.sets, ookUitbreiding: opties.ookUitbreiding === true || gevraagdeUitbreiding.size > 0 });
  if (opties.ookUitbreiding !== true) {
    for (const id of uitbreiding) if (!gevraagdeUitbreiding.has(id)) selectie.delete(id);
  }
  const { keuzes, ontbrekend } = naarSetKeuzes(selectie, bestanden);
  // De sets die echt in het leerplan komen (met minstens één bruikbaar doel): daarover gaat de vingerafdruk.
  const insluiten = keuzes.filter((k) => telSelectie([k]) > 0).map((k) => k.bestand.set.id);
  const samengesteld = leerplanUitSelectie(keuzes, {
    titel: opties.titel ?? '',
    vak: opties.vak,
    bestaand: opties.bestaand,
    oudeVersies: opties.oudeVersies,
    doelgroep: { ...doelgroep, jaar: undefined, ...kaderAfdrukken(kader, insluiten), volgtKader: true },
  });
  const weg = ontbrekend.reduce((som, o) => som + o.ids.length, 0);
  if (weg > 0) {
    samengesteld.waarschuwingen.push(
      `${weg} ${weg === 1 ? 'doel' : 'doelen'} uit de koppeling ${weg === 1 ? 'staat' : 'staan'} niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.`,
    );
  }

  // Een gevraagde set zonder bruikbaar bestand levert geen keuze op en zou stil wegvallen. Een set met een bestand
  // waarvan de koppeling niets meer vindt, staat al in `ontbrekend` (en in de waarschuwing hierboven).
  const metDoelen = new Set(insluiten);
  const metMelding = new Set(ontbrekend.map((o) => o.set));
  const zonderBestand = kader.sets.filter((k) => selectie.has(k.set.id) && !metDoelen.has(k.set.id) && !metMelding.has(k.set.id));
  const ontbrekendeSets = zonderBestand.map((k) => k.set.id);
  if (zonderBestand.length === 0) return { ...samengesteld, ontbrekend, ontbrekendeSets };

  // Niet bevestigd betekent ook niet nagekeken: een leerplan zonder een gevraagde set is niet wat de leerkracht koos.
  const zonderStatus: Curriculum = { ...samengesteld.leerplan };
  delete zonderStatus.controle;
  return {
    ...samengesteld,
    leerplan: zonderStatus,
    bevestigd: false,
    waarschuwingen: [
      ...zonderBestand.map((k) => `De set "${setNaam(k.set)}" kon niet geladen worden. Probeer opnieuw.`),
      ...samengesteld.waarschuwingen,
    ],
    ontbrekend,
    ontbrekendeSets,
  };
}

/**
 * Een titel voor het leerplan van een richting (hoogstens 120 tekens):
 * - alle sets: "Natuurwetenschappen · 2de graad";
 * - met een vak, of één set: "Biologie · Natuurwetenschappen · 2de graad";
 * - een deel van de sets: "Nederlands en 3 andere · Natuurwetenschappen · 2de graad";
 * - in de 1ste graad (het kader hoort bij de stroom, niet bij één leerjaar): "A-stroom · 1ste graad";
 * - buitengewoon onderwijs krijgt "buitengewoon (OV4)" erachter, zodat het niet op het gewone leerplan lijkt.
 *
 * `sets` zijn de gekozen sets (standaard alle verplichte sets van het kader). Wat niet in het kader staat, telt niet.
 */
export function titelVoorRichtingLeerplan(
  info: RichtingInfo,
  kader: RichtingKader,
  sets?: readonly string[],
  vak?: string,
): string {
  const gevraagd = sets ? new Set(sets) : undefined;
  const gekozen = kader.sets.filter((k) => (gevraagd ? gevraagd.has(k.set.id) : k.verplicht));
  const alle = kader.sets.filter((k) => k.verplicht).every((k) => gekozen.some((g) => g.set.id === k.set.id));

  const vakTekst = (vak ?? '').trim();
  let naam = '';
  if (vakTekst !== '') naam = vakTekst;
  else if (gekozen.length === 1) naam = setNaam(gekozen[0].set);
  else if (gekozen.length > 1 && !alle) naam = `${setNaam(gekozen[0].set)} en ${gekozen.length - 1} andere`;

  // Zoals `doelgroepTekst`, maar zonder jaar en in losse delen, zodat een lange titel de graad nooit wegdrukt.
  const d = doelgroepVan(info, kader.keuze);
  const buso = d.soort === 'buso' ? (d.graad !== undefined ? 'buitengewoon (OV4)' : 'buitengewoon') : '';
  // In de 1ste graad hoort het kader bij de stroom, niet bij één leerjaar: de titel noemt de stroom.
  const richting = d.graad === 1
    ? [info.stroom ? `${info.stroom}-stroom` : d.titel, graadTekst(1), buso]
    : [d.titel, d.graad !== undefined ? graadTekst(d.graad) : '', buso];
  return samenTitel([naam, ...richting]);
}

/**
 * De selectie van een lijst keuzes zoals `leerplanUitSelectie` ze zou nemen: per set de vaste nummers van de doelen
 * die erin komen (met vast nummer en tekst), in de volgorde van de set. 'alle' wordt de lijst van alle bruikbare
 * doelen van het bestand; nummers die niet in het bestand staan, vallen weg; een set zonder doelen telt niet. Een set
 * die twee keer gekozen is, telt één keer. Bedoeld om te vergelijken met `selectieVanLeerplan`
 * (`vindLeerplanMetSelectie`).
 */
export function selectieVanKeuzes(keuzes: readonly SetKeuze[]): Map<string, string[]> {
  const perSet = new Map<string, { bestand: MinimumdoelenSetBestand; alle: boolean; ids: Set<string> }>();
  for (const keuze of Array.isArray(keuzes) ? keuzes : []) {
    const id = keuze?.bestand?.set?.id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    let k = perSet.get(id);
    if (!k) {
      k = { bestand: keuze.bestand, alle: false, ids: new Set() };
      perSet.set(id, k);
    }
    if (keuze.doelen === 'alle') k.alle = true;
    else if (Array.isArray(keuze.doelen)) {
      for (const d of keuze.doelen as readonly unknown[]) {
        if (typeof d === 'string' && d.trim() !== '') k.ids.add(d.trim());
      }
    }
  }
  const uit = new Map<string, string[]>();
  for (const [set, k] of perSet) {
    const ids = kiesbareDoelen(k.bestand).filter((d) => k.alle || k.ids.has(d.id)).map((d) => d.id);
    if (ids.length > 0) uit.set(set, ids);
  }
  return uit;
}

function sleutelsVanSelectie(selectie: ReadonlyMap<string, readonly string[]>): Set<string> {
  const uit = new Set<string>();
  for (const [set, ids] of selectie) {
    if (set === '') continue;
    for (const id of Array.isArray(ids) ? ids : []) {
      const t = typeof id === 'string' ? id.trim() : '';
      if (t !== '') uit.add(sleutel(set, t));
    }
  }
  return uit;
}

/**
 * Het leerplan op dit toestel met precies deze selectie (set + vaste nummers, zonder op de volgorde te letten): een
 * samengesteld leerplan dat geen eigen kopie is (`kind` niet 'eigen'). Zo komt er geen tweede, gelijke lijst in de
 * opslag. De eerste die past, dus de nieuwste. Zonder doelen in de selectie is er nooit een leerplan dat past.
 *
 * Een leerplan dat past maar niet (meer) nagekeken is (`effectieveStatus` niet 'gecontroleerd'), wordt overgeslagen:
 * wie hergebruikt, krijgt altijd een nagekeken leerplan. Met een `doelgroep` worden ook leerplannen overgeslagen die bij
 * een andere richting (`groep`) horen: twee richtingen kunnen dezelfde sets hebben (bv. in de 1ste graad), maar elk
 * houdt zijn eigen leerplan. Heeft het leerplan of de gevraagde doelgroep geen (geldige) doelgroep, dan telt dit niet.
 */
export function vindLeerplanMetSelectie(
  curricula: readonly Curriculum[],
  selectie: ReadonlyMap<string, readonly string[]>,
  doelgroep?: Doelgroep,
): Curriculum | undefined {
  const gewenst = sleutelsVanSelectie(selectie);
  if (gewenst.size === 0) return undefined;
  const groep = sanitizeDoelgroep(doelgroep)?.groep;
  for (const c of Array.isArray(curricula) ? curricula : []) {
    if (c?.herkomst?.methode !== 'samengesteld' || c.kind === 'eigen') continue;
    const groepVanLeerplan = sanitizeDoelgroep(c.doelgroep)?.groep;
    if (groep !== undefined && groepVanLeerplan !== undefined && groepVanLeerplan !== groep) continue;
    const heeft = sleutelsVanSelectie(selectieVanLeerplan(c));
    // De nakijkstatus rekent over alle doelen: pas bekijken als de selectie klopt.
    if (heeft.size === gewenst.size && [...gewenst].every((s) => heeft.has(s)) && effectieveStatus(c) === 'gecontroleerd') return c;
  }
  return undefined;
}

// ── Na een maandelijkse update ──────────────────────────────────────────────

/** Per set de vaste nummers waarnaar de doelen van het leerplan verwijzen. */
function refsPerSet(leerplan: Curriculum): Map<string, Set<string>> {
  const uit = new Map<string, Set<string>>();
  for (const goal of Array.isArray(leerplan.goals) ? leerplan.goals : []) {
    for (const ref of Array.isArray(goal?.refs) ? goal.refs : []) {
      const set = typeof ref?.set === 'string' ? ref.set.trim() : '';
      const id = typeof ref?.id === 'string' ? ref.id.trim() : '';
      if (set === '' || id === '') continue;
      const ids = uit.get(set) ?? new Set<string>();
      ids.add(id);
      uit.set(set, ids);
    }
  }
  return uit;
}

/**
 * Wat er sinds het maken van het leerplan veranderde in het kader van de richting (§ 11.2). Vergelijk met het kader van
 * hetzelfde jaar en soort onderwijs als bij het maken.
 *
 * Wat vergeleken wordt, volgt `veranderdSindsLeerplan` (richtingKader.ts), dezelfde regel als `beginUitBewaarde`:
 * - niets: de bewaarde vingerafdrukken (`doelgroep.kader` en `doelgroep.kaderVolledig`) zijn gelijk aan die van het
 *   kader over `leerplan.minimumdoelenSets`. Ook een leerplan van vóór `kaderVolledig` (bewaard tot oktober 2026) met
 *   een gelijke `doelgroep.kader`, een eigen kopie (`kind` 'eigen': die volgt de officiële koppeling niet meer), een
 *   kader dat nog niet opgehaald is (`herkomst` 'nog-niet-opgehaald') en een kader zonder sets omdat de bron er geen
 *   geeft (`herkomst` 'geen') geven niets;
 * - alleen de volledige sets van het leerplan: `doelgroep.kader` is gelijk en `doelgroep.kaderVolledig` niet, dus de
 *   deelsets zijn zeker niet veranderd (ook doelen die de leerkracht er zelf bij koos en sets buiten het kader tellen
 *   dan niet);
 * - anders (`doelgroep.kader` is anders of ontbreekt) wordt alles vergeleken.
 *
 * - `vervallen`: verwijzingen van het leerplan die niet meer in het kader staan: de hele set staat er niet meer in
 *   (bv. een set die een oude versie werd), of het nummer staat niet meer in de koppeling. Bij een volledige set
 *   waarvan de versie sindsdien veranderde (`versieGelijk` onwaar) telt dat niet: de app neemt daarvan de huidige inhoud.
 * - `nieuw`: alleen bij `volgtKader`, en alleen voor sets die in het leerplan zitten: nummers uit de koppeling die nog
 *   niet in het leerplan staan. Bij een volledige set alleen als de versie gelijk is (anders kennen we de nummers niet):
 *   een volledige set die groeide (ook als er tegelijk evenveel nummers wegvielen), of een deelset die volledig werd.
 * - `setsNietMeerInKader`: de sets van het leerplan die niet meer in het kader staan, in de volgorde van het leerplan.
 *   Hun opvolger zoekt het scherm met `opvolgersVan` (een oude set staat niet in het kader).
 *
 * Zonder `volgtKader` (per doel gekozen) is `nieuw` altijd 0: er komt niets automatisch bij ("Kies de doelen opnieuw"
 * in plaats van "Werk het leerplan bij").
 */
export function vergelijkMetKader(
  leerplan: Curriculum,
  kader: RichtingKader,
): { nieuw: number; vervallen: number; setsNietMeerInKader: string[] } {
  const geen = { nieuw: 0, vervallen: 0, setsNietMeerInKader: [] as string[] };
  const bekijk = veranderdSindsLeerplan(leerplan, kader);
  if (bekijk === 'niets') return geen;
  /** Wordt deze set vergeleken? Als alleen een volledige set veranderde, alleen de volledige sets. */
  const telt = (set: string) => bekijk === 'alles' || bekijk.has(set);
  const dg = doelgroepVoorLeerplan(leerplan.doelgroep);
  const setsVanLeerplan = Array.isArray(leerplan.minimumdoelenSets) ? leerplan.minimumdoelenSets : [];

  const refs = refsPerSet(leerplan);
  const kaderSets = new Map(kader.sets.map((k) => [k.set.id, k]));

  let vervallen = 0;
  for (const [set, ids] of refs) {
    if (!telt(set)) continue;
    const k = kaderSets.get(set);
    if (k === undefined) {
      vervallen += ids.size;
      continue;
    }
    // Van een volledige set met een andere versie kennen we de nummers van de koppeling niet meer exact.
    if (k.volledig && !k.versieGelijk) continue;
    const inKader = new Set(k.ids);
    for (const id of ids) if (!inKader.has(id)) vervallen++;
  }

  let nieuw = 0;
  if (dg?.volgtKader === true) {
    for (const k of kader.sets) {
      if (!telt(k.set.id)) continue;
      const hebben = refs.get(k.set.id);
      if (hebben === undefined && !setsVanLeerplan.includes(k.set.id)) continue;
      // Van een volledige set kennen we de nummers alleen bij een gelijke versie.
      if (k.volledig && !k.versieGelijk) continue;
      for (const id of k.ids) if (!hebben?.has(id)) nieuw++;
    }
  }

  const alleSets = [...setsVanLeerplan, ...[...refs.keys()].filter((s) => !setsVanLeerplan.includes(s))];
  const setsNietMeerInKader = [...new Set(alleSets)].filter((s) => telt(s) && !kaderSets.has(s));
  return { nieuw, vervallen, setsNietMeerInKader };
}

// ── Vak en titel voor de cursus ─────────────────────────────────────────────

export type Startvorm = 'geraamte' | 'leeg';

export interface VakVoorstel {
  /** Verplichte sets van het kader waarvan de naam het vak noemt (of die er volgens de zoektabel bij horen), in de volgorde van het kader. */
  sets: string[];
  /** STEM-sets die bij het vak horen: ze bundelen meer vakken en worden nooit vooraf aangevinkt. */
  stemSets: string[];
}

/**
 * Is dit een STEM-set? De sleutelcompetentie "wiskunde, exacte wetenschappen en technologie" (`isStemSet`), of een set
 * waarvan de korte naam of naam het woord "STEM" als los woord heeft (zonder accenten, hoofdletters maken niet uit): de
 * officiële "STEM - Cesuurdoelen" van de 2de graad en "STEM - Specifieke eindtermen" van de 3de graad, die `isStemSet`
 * niet herkent. "Stemvorming" of "systeem" is dus geen STEM-set.
 */
function isStemVoorstel(set: { naam: string; korteNaam?: string }): boolean {
  if (isStemSet(set)) return true;
  return zonderAccenten(`${set.korteNaam ?? ''} ${set.naam}`).split(/[^\p{L}\d]+/u).includes('stem');
}

/**
 * De sets van het kader die bij een vak passen (`setNoemtVak`). Dat is een hulp bij het kiezen, geen officiële
 * koppeling. STEM-sets (`isStemVoorstel`: ze bundelen wiskunde, natuurwetenschappen en techniek, en de bron zegt niet welk
 * doel bij welk vak hoort) staan apart in `stemSets` en zitten nooit in `sets`: het scherm vinkt ze niet vooraf aan.
 * Uitbreidingssets komen in geen van beide: die kies je zelf. Zonder vak is beide lijsten leeg.
 */
export function vakVoorstel(kader: RichtingKader, vak: string): VakVoorstel {
  const sets: string[] = [];
  const stemSets: string[] = [];
  const v = typeof vak === 'string' ? vak.trim() : '';
  if (v === '') return { sets, stemSets };
  for (const k of kader.sets) {
    if (!k.verplicht || !setNoemtVak(k.set, v)) continue;
    (isStemVoorstel(k.set) ? stemSets : sets).push(k.set.id);
  }
  return { sets, stemSets };
}

/** De titel die we voorstellen voor een cursus bij deze doelgroep: "Biologie · Natuurwetenschappen · 4de jaar" (hoogstens 120 tekens). */
export function voorstelCursusTitel(d: Doelgroep): string {
  return inkort(doelgroepTekst(d), MAX_TITEL);
}

// ── Leerplannen op dit toestel ──────────────────────────────────────────────

/**
 * De leerplannen op dit toestel die bij een richting horen: die met dezelfde `doelgroep.groep`, of waarvan de
 * verwijzingen het kader raken. `kaderSleutels` zijn de doelen van het kader als "set|nummer" (set + vast nummer,
 * nooit de code alleen). `raakt` is het aantal verschillende doelen van het kader waarnaar het leerplan verwijst. Het
 * meeste overlap eerst; bij gelijke overlap eerst de leerplannen die expliciet bij de richting horen, dan op titel.
 */
export function leerplannenBijRichting(
  curricula: readonly Curriculum[],
  kaderSleutels: ReadonlySet<string>,
  groep: string,
): { curriculum: Curriculum; raakt: number; viaDoelgroep: boolean }[] {
  const uit: { curriculum: Curriculum; raakt: number; viaDoelgroep: boolean }[] = [];
  for (const curriculum of Array.isArray(curricula) ? curricula : []) {
    if (!curriculum || typeof curriculum !== 'object') continue;
    const geraakt = new Set<string>();
    for (const [set, ids] of refsPerSet(curriculum)) {
      for (const id of ids) if (kaderSleutels.has(`${set}|${id}`)) geraakt.add(`${set}|${id}`);
    }
    const viaDoelgroep = sanitizeDoelgroep(curriculum.doelgroep)?.groep === groep;
    if (geraakt.size > 0 || viaDoelgroep) uit.push({ curriculum, raakt: geraakt.size, viaDoelgroep });
  }
  uit.sort((a, b) =>
    b.raakt - a.raakt
    || Number(b.viaDoelgroep) - Number(a.viaDoelgroep)
    || (a.curriculum.title ?? '').localeCompare(b.curriculum.title ?? '', 'nl')
    || (a.curriculum.id < b.curriculum.id ? -1 : a.curriculum.id > b.curriculum.id ? 1 : 0));
  return uit;
}

// ── Het geraamte van de cursus ──────────────────────────────────────────────

/** Het thema van een doel in een hoofdstuk (het deel vóór " › ", bij een samengestelde lijst de setnaam) en een rubriek. */
function splitsThema(thema: string | undefined): { hoofdstuk: string; rubriek: string } {
  // Een thema dat op " ›" eindigt (een lege rubriek) is gewoon het deel ervoor.
  const t = (thema ?? '').trim().replace(/\s*›$/, '');
  if (t === '') return { hoofdstuk: TERUGVAL, rubriek: TERUGVAL };
  const i = t.indexOf(SCHEIDER_THEMA);
  if (i < 0) return { hoofdstuk: t, rubriek: TERUGVAL };
  return { hoofdstuk: t.slice(0, i).trim() || TERUGVAL, rubriek: t.slice(i + SCHEIDER_THEMA.length).trim() || TERUGVAL };
}

interface GeraamteSectie {
  titel: string;
  codes: string[];
  regels: string[];
}

/**
 * De hoofdstukken van een cursus met de doelen van een leerplan al op de secties (§ 12.2):
 * - een hoofdstuk per eerste deel van `goal.theme` (vóór " › "; bij een samengestelde lijst is dat de setnaam, bij een
 *   leerplan van een net het eigen thema), "Doelen" zonder thema, in de volgorde van het eerste voorkomen;
 * - daarin een sectie per rest van het thema (de rubriek), of "Doelen";
 * - `goalCodes` zijn de codes van de doelen van de sectie, en één blok `callout` (kind 'goal', "Doelen in deze sectie")
 *   somt ze op, per regel "<code> — <korte tekst>";
 * - elke code staat in precies één sectie, en geen enkele sectie is optioneel;
 * - bij meer dan 400 doelen is er één sectie per hoofdstuk;
 * - titels zijn hoogstens 120 tekens.
 *
 * `codes` beperkt tot die doelcodes (de volgorde is die van het leerplan). Een doel zonder bruikbare code kan niet aan
 * een sectie gekoppeld worden en wordt overgeslagen. Zonder doelen is het resultaat leeg.
 * Een sectie met alleen zo'n callout telt in de dekking als ‘gepland’, niet als gedekt.
 */
export function geraamteHoofdstukken(leerplan: Curriculum, codes?: readonly string[]): CourseChapter[] {
  const gewenst = codes ? new Set(normalizeGoalCodes(codes)) : undefined;
  const gezien = new Set<string>();
  const doelen: { code: string; goal: CurriculumGoal }[] = [];
  for (const goal of Array.isArray(leerplan?.goals) ? leerplan.goals : []) {
    const code = normalizeGoalCode(typeof goal?.code === 'string' ? goal.code : '');
    if (!heeftInhoud(code) || gezien.has(code) || (gewenst && !gewenst.has(code))) continue;
    gezien.add(code);
    doelen.push({ code, goal });
  }
  if (doelen.length === 0) return [];

  const eenSectiePerHoofdstuk = doelen.length > MAX_DOELEN_PER_RUBRIEK;
  const hoofdstukken = new Map<string, Map<string, GeraamteSectie>>();
  for (const { code, goal } of doelen) {
    const { hoofdstuk, rubriek } = splitsThema(goal.theme);
    const secties = hoofdstukken.get(hoofdstuk) ?? new Map<string, GeraamteSectie>();
    hoofdstukken.set(hoofdstuk, secties);
    const rubriekSleutel = eenSectiePerHoofdstuk ? TERUGVAL : rubriek;
    const sectie = secties.get(rubriekSleutel) ?? { titel: rubriekSleutel, codes: [], regels: [] };
    secties.set(rubriekSleutel, sectie);
    sectie.codes.push(code);
    sectie.regels.push(`${code} — ${shortGoalText(typeof goal.text === 'string' ? goal.text : '', MAX_REGEL_TEKST)}`);
  }

  return [...hoofdstukken].map(([hoofdstuk, secties]): CourseChapter => ({
    id: uid(),
    title: inkort(hoofdstuk, MAX_TITEL),
    sections: [...secties.values()].map((s): CourseSection => ({
      id: uid(),
      title: inkort(s.titel, MAX_TITEL),
      blocks: [{ id: uid(), type: 'callout', kind: 'goal', title: TITEL_CALLOUT, text: s.regels.join('\n') }],
      goalCodes: s.codes,
    })),
  }));
}

/**
 * Een nieuwe cursus voor een richting, zonder AI: vertrekt van `createCourse(titel, auteur)` en zet de koppeling aan
 * het leerplan (`curriculumId`), de ondertitel (`doelgroepTekst`) en de doelgroep, zonder `kader`, `kaderVolledig` en
 * `volgtKader` (`doelgroepVoorCursus`: die horen bij een leerplan, niet bij een cursus). Met `geraamte` komen de
 * hoofdstukken van `geraamteHoofdstukken` (beperkt tot `codes`); met `leeg`, of als het leerplan geen bruikbare doelen
 * heeft, blijft het ene lege hoofdstuk van `createCourse`. Bewaren doet de aanroeper.
 */
export function cursusVoorRichting(o: {
  titel: string;
  auteur: string;
  doelgroep: Doelgroep;
  leerplan: Curriculum;
  codes?: readonly string[];
  start: Startvorm;
}): Course {
  const cursus = createCourse(o.titel, o.auteur);
  if (o.start === 'geraamte') {
    const hoofdstukken = geraamteHoofdstukken(o.leerplan, o.codes);
    if (hoofdstukken.length > 0) cursus.chapters = hoofdstukken;
  }
  cursus.curriculumId = o.leerplan.id;
  const dg = doelgroepVoorCursus(o.doelgroep);
  if (dg) {
    cursus.subtitle = doelgroepTekst(dg);
    cursus.doelgroep = dg;
  }
  return cursus;
}

/**
 * Hoeveel doelcodes van de cursus (verschillende codes op de secties, genormaliseerd) in het leerplan staan.
 * `totaal - passend` codes wijzen dus naar niets in dat leerplan.
 */
export function passendeCodes(course: Course, leerplan: Curriculum): { passend: number; totaal: number } {
  const vanCursus = new Set<string>();
  for (const { section } of allSections(course)) {
    for (const code of normalizeGoalCodes(section.goalCodes)) vanCursus.add(code);
  }
  const vanLeerplan = new Set((Array.isArray(leerplan?.goals) ? leerplan.goals : []).map((g) => normalizeGoalCode(typeof g?.code === 'string' ? g.code : '')));
  let passend = 0;
  for (const code of vanCursus) if (vanLeerplan.has(code)) passend++;
  return { passend, totaal: vanCursus.size };
}
