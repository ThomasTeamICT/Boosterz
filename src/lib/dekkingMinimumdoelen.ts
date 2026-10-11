// Dekking op de minimumdoelen (L6, docs/STUDIERICHTINGEN.md § 13 en docs/LEERPLANNEN.md § 3 en § 9).
//
// De dekking rekent op twee lagen. Per cursus draait `computeCoverage` ongewijzigd met het leerplan van de cursus zelf
// (laag 2 en 3: welke leerplandoelen komen in de secties en oefeningen aan bod). Via de verwijzingen van die
// leerplandoelen (`refs`: set + vast nummer) komt dat bij de officiële minimumdoelen (laag 1). Zo telt een cursus mee
// welk leerplan ze ook volgt: een samengestelde lijst, een officiële set of een ingelezen leerplan van een net.
//
// Regels (§ 13.2):
// - Een cursus telt niet mee zonder leerplan ('geen-leerplan'), als haar leerplan niet op dit toestel staat
//   ('leerplan-ontbreekt'), of als geen enkel doel van dat leerplan naar een minimumdoel verwijst ('geen-verwijzingen').
// - Status per leerplandoel: gedekt (een gewone sectie met inhoud of een oefening in een gewone sectie), gepland (alleen
//   op gewone secties die nog leeg zijn, zie `geplandeRijen`), verdieping (alleen in keuzesecties). Een doel dat de
//   cursus niet behandelt, draagt niets bij.
// - Een verwijzing telt alleen strikt op set + vast nummer (open vraag O6). Wat niet in het kader staat, telt in
//   `buitenKader`; `zelfdeNummerAndereSet` toont hoeveel het zou schelen als hetzelfde nummer in een andere set ook telde
//   (de exacte regel staat bij die teller in `dekkingMinimumdoelen`).
// - Over cursussen heen wint de beste status: gedekt > gepland > verdieping > open.
// - Het totaal en het percentage gaan alleen over de verplichte doelen: niet optioneel en niet uit een uitbreidingsset.
//   Het percentage is gedekt / totaal, gewoon afgerond, behalve dat het nooit 100 is zolang een verplicht doel niet
//   gedekt is (dan 99), en 0 als er geen verplichte doelen zijn.
//
// Puur: geen opslag, geen DOM, geen netwerk. Lineair in het kader plus de verwijzingen (en de cursussen zelf).

import type { Course } from './courseTypes';
import { computeCoverage, geplandeRijen } from './coverage';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { doelgroepVoorLeerplan, sanitizeDoelgroep, type Doelgroep } from './doelgroep';
import { htmlNaarTekst, type Minimumdoel, type MinimumdoelenSetBestand } from './minimumdoelen';
import { isOptioneel, themaVanDoel } from './minimumdoelenLeerplan';
import { isUitbreidingsSet, type RichtingKader } from './richtingKader';
import type { Widget } from './types';

// ── Types (§ 13.1) ──────────────────────────────────────────────────────────

/** Eén officieel minimumdoel van het kader waartegen de dekking rekent. */
export interface KaderDoel {
  set: string;
  /** Korte naam van de set (anders de volledige naam), voor de weergave. */
  setNaam: string;
  /** Vast nummer van het doel in de API (`@id`): met `set` de sleutel. */
  id: string;
  /** Code zoals in de set, bv. "09.01" (alleen weergave: niet uniek binnen een set). */
  code: string;
  /** Gewone tekst, nooit HTML. */
  tekst: string;
  rubriek?: string;
  /** Een optioneel minimumdoel (`extra.optioneel` in de bron). */
  optioneel: boolean;
  /** Onwaar voor een uitbreidingsset ("mag, moet niet"). */
  verplichteSet: boolean;
}

export type MdStatus = 'gedekt' | 'gepland' | 'verdieping' | 'open';

/** Langs welke cursus en welk leerplandoel een minimumdoel aan bod komt. */
export interface MdVia {
  courseId: string;
  courseTitle: string;
  /** De doelcode in het leerplan van de cursus (genormaliseerd zoals in `computeCoverage`). */
  code: string;
  status: Exclude<MdStatus, 'open'>;
}

export interface MdRij {
  doel: KaderDoel;
  status: MdStatus;
  /** Beste status eerst; bij gelijke status in de volgorde van de cursussen en van hun leerplan. */
  via: MdVia[];
}

export type NietMeeReden = 'geen-leerplan' | 'leerplan-ontbreekt' | 'geen-verwijzingen';

/** Een cursus met haar leerplan. `leerplan` leeg = het leerplan staat niet op dit toestel. */
export interface CursusBijdrage {
  course: Course;
  leerplan?: Curriculum;
}

export interface CursusInDekking {
  courseId: string;
  titel: string;
  telt: boolean;
  reden?: NietMeeReden;
  /** Aantal verschillende doelen van het kader waaraan de cursus werkt (gedekt, gepland of verdieping). */
  draagtBij: number;
  /**
   * Aantal verschillende minimumdoelen (set + vast nummer) waaraan de cursus werkt, maar die niet in het kader staan:
   * een andere richting, een andere versie of een ander soort onderwijs van een set.
   */
  buitenKader: number;
}

export interface MdDekking {
  /** Eén rij per doel van het kader, in de volgorde van het kader. */
  rijen: MdRij[];
  /** Per set, in de volgorde van het kader; telt alle doelen van de set (ook de optionele). */
  perSet: { set: string; setNaam: string; totaal: number; gedekt: number; gepland: number; verdieping: number }[];
  /** Verplichte doelen (niet optioneel, niet uit een uitbreidingsset). */
  totaal: number;
  gedekt: number;
  gepland: number;
  verdieping: number;
  open: number;
  /**
   * `Math.round(gedekt / totaal * 100)`, met twee uitzonderingen: 0 als `totaal` 0 is, en 99 in plaats van 100 zolang een
   * verplicht doel niet gedekt is (gepland, verdieping of open).
   */
  percent: number;
  /** Optionele doelen en doelen uit een uitbreidingsset: buiten het totaal en het percentage. */
  optioneel: { totaal: number; gedekt: number };
  cursussen: CursusInDekking[];
  /**
   * Aantal verplichte doelen van het kader (niet optioneel, niet uit een uitbreidingsset) die nu niet gedekt zijn, terwijl
   * een cursus die meetelt een verwijzing behandelt naar hetzelfde vaste nummer in een set buiten het kader (een andere
   * versie, of de kopie voor het buitengewoon onderwijs). Elk doel telt één keer. Voor het scherm: "<n> doelen zouden ook
   * gedekt zijn als verwijzingen naar een andere versie of soort van dezelfde set meetellen."
   */
  zelfdeNummerAndereSet: number;
  samenvatting: string;
}

// ── Het kader als lijst doelen ──────────────────────────────────────────────

/** Sleutel van een minimumdoel: set + vast nummer (een nulteken kan in geen van beide staan). */
function sleutelVan(set: string, id: string): string {
  return `${set}\u0000${id}`;
}

function setNaamVan(set: { naam?: unknown; korteNaam?: unknown; id: string }): string {
  const kort = typeof set.korteNaam === 'string' ? set.korteNaam.trim() : '';
  const lang = typeof set.naam === 'string' ? set.naam.trim() : '';
  return kort || lang || set.id;
}

/** Het vaste nummer van een doel uit een setbestand, of '' (zoals in `naarSetKeuzes`: alleen een tekst telt). */
function idVanDoel(doel: Minimumdoel | null | undefined): string {
  return doel && typeof doel === 'object' && typeof doel.id === 'string' ? doel.id.trim() : '';
}

function kaderDoelVan(set: string, setNaam: string, id: string, doel: Minimumdoel, verplichteSet: boolean): KaderDoel {
  const code = typeof doel.code === 'string' ? doel.code.trim() : doel.code == null ? '' : String(doel.code);
  const tekst = typeof doel.tekst === 'string' ? htmlNaarTekst(doel.tekst) : '';
  const rubriek = themaVanDoel(doel);
  return {
    set, setNaam, id, code, tekst,
    ...(rubriek ? { rubriek } : {}),
    optioneel: isOptioneel(doel),
    verplichteSet,
  };
}

/**
 * De doelen van één set, in de volgorde van het bestand. `alleen` beperkt tot die vaste nummers (een deelset); zonder
 * `alleen` alle doelen. Een doel zonder vast nummer kan niemand strikt aanwijzen en valt weg; een dubbel nummer telt één
 * keer (`gezien` over het hele kader).
 */
function doelenVanSet(
  bestand: MinimumdoelenSetBestand, setId: string, setNaam: string, verplichteSet: boolean,
  alleen: ReadonlySet<string> | undefined, gezien: Set<string>, uit: KaderDoel[],
): void {
  const doelen: unknown = bestand.doelen;
  if (!Array.isArray(doelen)) return;
  for (const doel of doelen as (Minimumdoel | null | undefined)[]) {
    const id = idVanDoel(doel);
    if (id === '' || (alleen && !alleen.has(id))) continue;
    const sleutel = sleutelVan(setId, id);
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(kaderDoelVan(setId, setNaam, id, doel as Minimumdoel, verplichteSet));
  }
}

/** Het bestand van een set, alleen als het echt van die set is. */
function bestandVoor(set: string, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): MinimumdoelenSetBestand | undefined {
  const b = bestanden.get(set);
  return b && b.set && b.set.id === set ? b : undefined;
}

/**
 * De doelen van het kader van een richting, in de volgorde van het kader (oplopend setnummer, de doelen in setvolgorde).
 * Volgens § 7: van een volledige set de huidige inhoud van het bestand; van een deelset de nummers uit de koppeling die
 * nog in het bestand staan. Uitbreidingssets doen mee, met `verplichteSet` onwaar. Een set zonder geladen bestand valt
 * weg (zoals bij `naarSetKeuzes`): de oproeper laadt de bestanden van alle sets van het kader.
 */
export function kaderDoelen(kader: RichtingKader, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): KaderDoel[] {
  const uit: KaderDoel[] = [];
  const gezien = new Set<string>();
  for (const k of kader.sets) {
    const setId = k.set.id;
    const bestand = bestandVoor(setId, bestanden);
    if (!bestand) continue;
    const alleen = k.volledig ? undefined : new Set(k.ids.map((id) => (typeof id === 'string' ? id.trim() : '')));
    doelenVanSet(bestand, setId, setNaamVan(k.set), k.verplicht, alleen, gezien, uit);
  }
  return uit;
}

/**
 * De doelen van gewone sets als kader, voor een cursus zonder richting (de sets van haar leerplan,
 * `leerplan.minimumdoelenSets`). Alle doelen van elke set, in de gegeven volgorde; een set die twee keer genoemd wordt,
 * telt één keer. Een uitbreidingsset is niet verplicht. Een set zonder geladen bestand valt weg.
 */
export function setsAlsKader(sets: readonly string[], bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): KaderDoel[] {
  const uit: KaderDoel[] = [];
  const gezien = new Set<string>();
  const gehad = new Set<string>();
  for (const ruw of sets) {
    const setId = typeof ruw === 'string' ? ruw.trim() : '';
    if (setId === '' || gehad.has(setId)) continue;
    gehad.add(setId);
    const bestand = bestandVoor(setId, bestanden);
    if (!bestand) continue;
    const naam = typeof bestand.set.naam === 'string' ? bestand.set.naam : '';
    doelenVanSet(bestand, setId, setNaamVan(bestand.set), !isUitbreidingsSet(naam), undefined, gezien, uit);
  }
  return uit;
}

// ── De dekking ──────────────────────────────────────────────────────────────

const RANG: Readonly<Record<MdStatus, number>> = { open: 0, verdieping: 1, gepland: 2, gedekt: 3 };

/** De bruikbare verwijzingen van een leerplandoel: set en vast nummer niet leeg (tolerant voor oude of kapotte opslag). */
function verwijzingenVan(refs: unknown): { set: string; id: string }[] {
  if (!Array.isArray(refs)) return [];
  const uit: { set: string; id: string }[] = [];
  for (const r of refs as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const ruw = r as { set?: unknown; id?: unknown };
    const set = typeof ruw.set === 'string' ? ruw.set.trim() : '';
    const id = typeof ruw.id === 'string' ? ruw.id.trim()
      : typeof ruw.id === 'number' && Number.isFinite(ruw.id) ? String(ruw.id) : '';
    if (set !== '' && id !== '') uit.push({ set, id });
  }
  return uit;
}

/** Welke verwijzingen van een leerplandoel tellen: de functie van de aanroeper, of standaard de `refs` naar minimumdoelen. */
type VerwijzingenVan = (goal: CurriculumGoal) => readonly { set: string; id: string }[];

/** De opties van `dekkingMinimumdoelen`. */
export interface DekkingOpties {
  /**
   * Welke verwijzingen van een leerplandoel meetellen, als set + vast nummer. Standaard de `refs` naar minimumdoelen:
   * zonder deze optie rekent alles zoals altijd. Voor de competenties van beroepskwalificaties (`dekkingBk.ts`) is het
   * set de BK-versie en het vaste nummer de competentiecode. Wat de functie teruggeeft, wordt net zo gesaneerd als `refs`
   * (getrimd, zonder lege delen).
   */
  verwijzingen?: VerwijzingenVan;
}

/** De functie die de verwijzingen van een doel geeft: die van de aanroeper (gesaneerd), anders `refs`. */
function verwijzingenFunctie(opties: DekkingOpties | undefined): (goal: CurriculumGoal) => { set: string; id: string }[] {
  const eigen = opties?.verwijzingen;
  if (typeof eigen === 'function') return (goal) => verwijzingenVan(eigen(goal));
  return (goal) => verwijzingenVan(goal.refs);
}

function heeftVerwijzingen(leerplan: Curriculum, verwijzingen: (goal: CurriculumGoal) => unknown[]): boolean {
  const goals: unknown = leerplan.goals;
  return Array.isArray(goals) && goals.some((g) => !!g && typeof g === 'object' && verwijzingen(g as CurriculumGoal).length > 0);
}

/** Waarom een cursus niet meetelt, of `undefined` als ze meetelt. Altijd met het leerplan van de cursus zelf. */
function redenNietMee(b: CursusBijdrage, verwijzingen: (goal: CurriculumGoal) => unknown[]): NietMeeReden | undefined {
  const cid = typeof b.course.curriculumId === 'string' ? b.course.curriculumId : '';
  if (cid === '') return 'geen-leerplan';
  if (!b.leerplan || b.leerplan.id !== cid) return 'leerplan-ontbreekt';
  if (!heeftVerwijzingen(b.leerplan, verwijzingen)) return 'geen-verwijzingen';
  return undefined;
}

/**
 * Afgerond (`Math.round`), maar nooit 100 zolang er een verplicht doel niet gedekt is: 199 van 200 is 99 %, geen 100 %.
 * Zonder verplichte doelen 0.
 */
export function percentVan(gedekt: number, totaal: number): number {
  if (totaal <= 0) return 0;
  const p = Math.round((gedekt / totaal) * 100);
  return gedekt < totaal && p >= 100 ? 99 : p;
}

function samenvattingVan(d: { kader: number; cursussen: number; totaal: number; gedekt: number; gepland: number; verdieping: number; open: number; percent: number }): string {
  if (d.kader === 0) return 'Er zijn geen minimumdoelen om te dekken.';
  if (d.totaal === 0) return 'Er zijn geen verplichte minimumdoelen om te dekken.';
  if (d.cursussen === 0) return `Nog geen cursus voor deze richting: de dekking is 0 van de ${d.totaal} doelen.`;
  const eerste = `Je cursussen dekken ${d.gedekt} van de ${d.totaal} minimumdoelen (${d.percent} %).`;
  if (d.gedekt === d.totaal) return eerste;
  const gepland = d.gepland === 1 ? '1 doel staat al gepland' : `${d.gepland} doelen staan al gepland`;
  const verdieping = d.verdieping === 1 ? '1 komt alleen in verdieping aan bod' : `${d.verdieping} komen alleen in verdieping aan bod`;
  return `${eerste} ${gepland} op een sectie die nog leeg is, ${verdieping}, ${d.open} nog niet.`;
}

/**
 * De dekking van een kader (`kaderDoelen` of `setsAlsKader`) door één of meer cursussen, elk met haar eigen leerplan.
 * `widgets` mag alle widgets van het toestel zijn: alleen de oefeningen die in een cursus ingebed staan tellen (zoals in
 * `computeCoverage`).
 *
 * Alleen leerplandoelen die de cursus behandelt (gedekt, gepland of verdieping) tellen: voor de rijen, voor `draagtBij`,
 * voor `buitenKader` en voor `zelfdeNummerAndereSet`.
 *
 * `opties.verwijzingen` zegt welke verwijzingen van een leerplandoel meetellen (standaard `refs`, dus de minimumdoelen):
 * zo rekent de dekking op de competenties van beroepskwalificaties met dezelfde regels (`dekkingBk.ts`, § 23.6.9).
 * Zonder opties is het resultaat precies dat van vroeger.
 */
export function dekkingMinimumdoelen(
  kader: readonly KaderDoel[],
  bijdragen: readonly CursusBijdrage[],
  widgets: readonly Widget[],
  opties?: DekkingOpties,
): MdDekking {
  const verwijzingen = verwijzingenFunctie(opties);
  // Sleutel → plaats in het kader; vast nummer → plaatsen (voor zelfdeNummerAndereSet). Een dubbele sleutel telt één keer.
  const plaats = new Map<string, number>();
  const perNummer = new Map<string, number[]>();
  const doelen: KaderDoel[] = [];
  for (const doel of kader) {
    const sleutel = sleutelVan(doel.set, doel.id);
    if (plaats.has(sleutel)) continue;
    plaats.set(sleutel, doelen.length);
    const lijst = perNummer.get(doel.id);
    if (lijst) lijst.push(doelen.length);
    else perNummer.set(doel.id, [doelen.length]);
    doelen.push(doel);
  }

  const status: MdStatus[] = doelen.map(() => 'open');
  const via: MdVia[][] = doelen.map(() => []);
  /**
   * Regel voor `zelfdeNummerAndereSet` (O6, de ruimere regel die de teller toont). Een doel van het kader krijgt deze vlag
   * als een cursus die meetelt een leerplandoel behandelt (gedekt, gepland of verdieping: elke status telt, eenvoudig
   * gehouden) met een verwijzing die NIET in het kader staat, maar wel hetzelfde vaste nummer heeft als dit doel (dus een
   * andere set: een andere versie, of de kopie voor het buitengewoon onderwijs). Een verwijzing die in het kader staat,
   * telt alleen voor haar eigen doel. Geteld worden daarna alleen de verplichte doelen (niet optioneel, niet uit een
   * uitbreidingsset) met de vlag die nu niet gedekt zijn; elk doel één keer, hoeveel verwijzingen of cursussen er ook zijn.
   */
  const zelfdeNummer: boolean[] = doelen.map(() => false);
  const alleWidgets: Widget[] = [...widgets];
  const cursussen: CursusInDekking[] = [];

  for (const bijdrage of bijdragen) {
    const course = bijdrage.course;
    const reden = redenNietMee(bijdrage, verwijzingen);
    if (reden) {
      cursussen.push({ courseId: course.id, titel: course.title, telt: false, reden, draagtBij: 0, buitenKader: 0 });
      continue;
    }
    const leerplan = bijdrage.leerplan as Curriculum;
    const result = computeCoverage(course, leerplan, alleWidgets);
    const gepland = new Set(geplandeRijen(result, course, alleWidgets));
    const bijgedragen = new Set<number>();
    const buiten = new Set<string>();
    for (const row of result.rows) {
      if (row.status === 'missing') continue;
      const s: MdVia['status'] = row.status === 'optional' ? 'verdieping' : gepland.has(row) ? 'gepland' : 'gedekt';
      for (const ref of verwijzingen(row.goal)) {
        const sleutel = sleutelVan(ref.set, ref.id);
        const i = plaats.get(sleutel);
        if (i !== undefined) {
          via[i].push({ courseId: course.id, courseTitle: course.title, code: row.code, status: s });
          if (RANG[s] > RANG[status[i]]) status[i] = s;
          bijgedragen.add(i);
          continue;
        }
        buiten.add(sleutel);
        for (const j of perNummer.get(ref.id) ?? []) if (doelen[j].set !== ref.set) zelfdeNummer[j] = true;
      }
    }
    cursussen.push({ courseId: course.id, titel: course.title, telt: true, draagtBij: bijgedragen.size, buitenKader: buiten.size });
  }

  const rijen: MdRij[] = doelen.map((doel, i) => ({
    doel,
    status: status[i],
    // Stabiel: bij gelijke status blijft de volgorde van de cursussen en van hun leerplan.
    via: via[i].length > 1 ? [...via[i]].sort((a, b) => RANG[b.status] - RANG[a.status]) : via[i],
  }));

  const perSetMap = new Map<string, MdDekking['perSet'][number]>();
  const tel = { totaal: 0, gedekt: 0, gepland: 0, verdieping: 0, open: 0 };
  const optioneel = { totaal: 0, gedekt: 0 };
  let zelfdeNummerAndereSet = 0;
  rijen.forEach((rij, i) => {
    const { doel } = rij;
    let ps = perSetMap.get(doel.set);
    if (!ps) {
      ps = { set: doel.set, setNaam: doel.setNaam, totaal: 0, gedekt: 0, gepland: 0, verdieping: 0 };
      perSetMap.set(doel.set, ps);
    }
    ps.totaal++;
    if (rij.status !== 'open') ps[rij.status]++;
    if (doel.optioneel || !doel.verplichteSet) {
      optioneel.totaal++;
      if (rij.status === 'gedekt') optioneel.gedekt++;
    } else {
      tel.totaal++;
      tel[rij.status]++;
      if (zelfdeNummer[i] && rij.status !== 'gedekt') zelfdeNummerAndereSet++;
    }
  });

  const percent = percentVan(tel.gedekt, tel.totaal);
  return {
    rijen,
    perSet: [...perSetMap.values()],
    ...tel,
    percent,
    optioneel,
    cursussen,
    zelfdeNummerAndereSet,
    samenvatting: samenvattingVan({ kader: doelen.length, cursussen: bijdragen.length, ...tel, percent }),
  };
}

// ── Welke cursussen horen bij een richting ──────────────────────────────────

function geldigJaar(jaar: number | undefined): number | undefined {
  return typeof jaar === 'number' && Number.isInteger(jaar) && jaar >= 1 && jaar <= 7 ? jaar : undefined;
}

/**
 * De cursussen van een richting, elk met haar leerplan (als het op dit toestel staat), in de volgorde van `courses`.
 *
 * - De doelgroep is die van de cursus (gesaneerd), anders die van haar leerplan (gesaneerd en zonder jaar: een leerplan
 *   geldt voor de hele graad). Zonder doelgroep hoort een cursus nergens bij.
 * - `hoort` beslist of een doelgroep bij de richting hoort; het scherm vergelijkt de `kaderGroepSleutel`, zodat in de
 *   1ste graad het 1ste en het 2de leerjaar van een stroom samen tellen.
 * - `jaar`: alleen cursussen met dat jaar of zonder jaar. Een jaar dat geen geheel getal van 1 tot 7 is, filtert niet.
 */
export function cursussenVoorRichting(
  courses: readonly Course[],
  curricula: readonly Curriculum[],
  hoort: (d: Doelgroep) => boolean,
  jaar?: number,
): CursusBijdrage[] {
  const leerplanVan = new Map<string, Curriculum>();
  for (const c of curricula) if (c && typeof c.id === 'string' && !leerplanVan.has(c.id)) leerplanVan.set(c.id, c);
  const filterJaar = geldigJaar(jaar);
  const uit: CursusBijdrage[] = [];
  for (const course of courses) {
    if (!course) continue;
    const cid = typeof course.curriculumId === 'string' ? course.curriculumId : '';
    const leerplan = cid !== '' ? leerplanVan.get(cid) : undefined;
    const doelgroep = sanitizeDoelgroep(course.doelgroep) ?? doelgroepVoorLeerplan(leerplan?.doelgroep);
    if (!doelgroep || !hoort(doelgroep)) continue;
    if (filterJaar !== undefined && doelgroep.jaar !== undefined && doelgroep.jaar !== filterJaar) continue;
    uit.push(leerplan ? { course, leerplan } : { course });
  }
  return uit;
}
