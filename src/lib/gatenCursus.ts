// Gaten dichten: het leerplan en de cursus maken, en bewaren (docs/STUDIERICHTINGEN.md § 22.4.2 tot § 22.4.6).
//
// Twee wegen, allebei vanuit de keuze van de leerkracht in de dekking (`gatenDichten.ts`):
// (a) een nieuwe cursus: een nagekeken leerplan met precies de gekozen doelen (of een leerplan dat er al is met precies
//     die doelen), en daarop een geraamte met de doelcodes op lege secties (`leerplanVoorGaten`, `titelsVoorGaten`,
//     `bewaarNieuweGatenCursus`);
// (b) een bestaande cursus: de gekozen doelen als lege secties met doelcodes achteraan toevoegen (`voegGeplandeSectiesToe`,
//     `bewaarGatenOpCursus`). Het leerplan van die cursus wordt daarbij nooit aangepast (F2-B8, § 22.4.4).
//
// Een deelset blijft een deelset (F2-B6, § 9.5): de selectie is per set altijd een lijst vaste nummers, nooit 'alle', en
// gaat nooit door de samenstelwizard. Een deelset van 4 van 13 doelen geeft dus 4 doelen in het leerplan, en een volledige
// set waarvan 3 van de 16 doelen open staan, geeft er 3.
//
// Puur: geen React, geen DOM, geen netwerk, en geen opslag behalve de `GatenOpslag` die de aanroeper meegeeft. Dit bestand
// importeert dus niets uit `courses.ts` of `curriculum.ts` om te bewaren. Het is zwaar (richtingCursus, doelenSamenstellen)
// en wordt alleen lui geladen, bij de klik.

import type { GuardedSaveResult } from './courses';
import type { Course, CourseChapter } from './courseTypes';
import { allSections } from './courseTypes';
import { normalizeGoalCodes } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import { veiligeSetNaam } from './dekkingWeergave';
import { leerplanUitSelectie } from './doelenSamenstellen';
import type { MinimumdoelenSetBestand } from './minimumdoelen';
import {
  geraamteHoofdstukken,
  samenTitel,
  selectieVanKeuzes,
  titelVoorRichtingLeerplan,
  vindLeerplanMetSelectie,
  voorstelCursusTitel,
} from './richtingCursus';
import { doelgroepVan, naarSetKeuzes, type RichtingInfo, type RichtingKader, type RichtingKeuze } from './richtingKader';
import { doelgroepBijRichting } from './richtingLink';
import { zonderSetId } from './richtingVenster';
import { setNaam } from './samenstelKeuze';

// ── Het leerplan voor een nieuwe cursus (a) ─────────────────────────────────

export type GatenLeerplan =
  /** Een leerplan met precies deze doelen: `hergebruik` staat al op dit toestel, `nieuw` moet nog bewaard worden. */
  | { soort: 'hergebruik' | 'nieuw'; leerplan: Curriculum }
  /**
   * Het leerplan kon niet als nagekeken gemaakt worden: niets bewaren. `waarschuwing` is de eerste waarschuwing, in gewone
   * taal, zonder set-id (`zonderSetId`) en zonder punt aan het eind, zodat het scherm er "Er is niets bewaard." achter kan zetten.
   */
  | { soort: 'niet-nagekeken'; waarschuwing: string }
  /** De sets zijn sinds het openen van het venster veranderd (een nummer dat niet meer bestaat, of een set zonder bestand): niets bewaren. */
  | { soort: 'veranderd' };

/** De selectie netjes: getrimde sets en nummers, elk nummer één keer, in de gegeven volgorde; sets zonder nummers vallen weg. */
function schoneSelectie(selectie: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  for (const [setRuw, idsRuw] of selectie) {
    const set = typeof setRuw === 'string' ? setRuw.trim() : '';
    if (set === '') continue;
    const ids = uit.get(set) ?? [];
    for (const id of Array.isArray(idsRuw) ? idsRuw : []) {
      const t = typeof id === 'string' ? id.trim() : '';
      if (t !== '' && !ids.includes(t)) ids.push(t);
    }
    if (ids.length > 0) uit.set(set, ids);
  }
  return uit;
}

/** Dezelfde sets met dezelfde vaste nummers per set (de volgorde telt niet). */
function zelfdeSelectie(a: ReadonlyMap<string, readonly string[]>, b: ReadonlyMap<string, readonly string[]>): boolean {
  if (a.size !== b.size) return false;
  for (const [set, ids] of a) {
    const andere = b.get(set);
    if (!andere || andere.length !== ids.length || !ids.every((id) => andere.includes(id))) return false;
  }
  return true;
}

/**
 * De titel van het leerplan: "Aanvulling · Chemie · Natuurwetenschappen · 2de graad", hoogstens 120 tekens, zonder set-id.
 * De delen van de richtingtitel gaan los door `samenTitel`, zodat een te lange titel het langste deel inkort (meestal de
 * naam van de set) en de graad en "buitengewoon (OV4)" achteraan blijven staan: daaraan zie je dat het niet het gewone leerplan is.
 */
function leerplanTitel(info: RichtingInfo, kader: RichtingKader, setIds: readonly string[]): string {
  return samenTitel(['Aanvulling', ...zonderSetId(titelVoorRichtingLeerplan(info, kader, setIds)).split(' · ')]);
}

/**
 * Het leerplan voor een nieuwe cursus die de gekozen doelen dekt (§ 22.4.2, stappen 1 tot 4). `selectie` is per set de
 * lijst vaste nummers (`selectieVanOpen`), `bestanden` zijn de setbestanden van de dekking op het scherm en `curricula`
 * de opslag op het moment van de klik.
 *
 * - `veranderd`: een gekozen set staat niet in het kader of heeft geen bestand, of een gekozen nummer staat niet meer in
 *   het bestand (`ontbrekend`). Er wordt niets gemaakt.
 * - `hergebruik`: er staat al een nagekeken samengesteld leerplan met precies deze doelen (set + vast nummer), van
 *   dezelfde richting en geen eigen kopie (`vindLeerplanMetSelectie`). Twee keer hetzelfde gat plannen geeft zo hetzelfde
 *   leerplan, zonder dubbel in de opslag.
 * - `nieuw`: een samengesteld, nagekeken leerplan met precies die doelen, zonder `volgtKader` (anders zou "Werk het
 *   leerplan bij" de lijst vullen met de rest van het kader, die een andere cursus al dekt), zonder jaar (een leerplan
 *   geldt voor de hele graad) en met `kader`, `kaderVolledig` en `setAfdrukken` over precies de sets met een gekozen doel.
 * - `niet-nagekeken`: het leerplan werd niet bevestigd (bv. meer dan 50 sets, of een gekozen doel zonder tekst in de
 *   officiële set, dat niet in het leerplan kan komen). Het scherm toont de waarschuwing en bewaart niets.
 */
export function leerplanVoorGaten(o: {
  info: RichtingInfo;
  kader: RichtingKader;
  selectie: ReadonlyMap<string, readonly string[]>;
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>;
  curricula: readonly Curriculum[];
  oudeVersies?: ReadonlySet<string>;
}): GatenLeerplan {
  const gevraagd = schoneSelectie(o.selectie);
  const inKader = new Set(o.kader.sets.map((k) => k.set.id));
  for (const set of gevraagd.keys()) {
    const bestand = o.bestanden.get(set);
    if (!inKader.has(set) || !bestand || bestand.set?.id !== set) return { soort: 'veranderd' };
  }

  // Een deelset blijft een lijst vaste nummers (§ 9.5): `naarSetKeuzes` geeft nooit 'alle' voor een lijst.
  const { keuzes, ontbrekend } = naarSetKeuzes(gevraagd, o.bestanden);
  if (ontbrekend.length > 0) return { soort: 'veranderd' };

  const gekozen = selectieVanKeuzes(keuzes);
  const setIds = [...gekozen.keys()];
  const doelgroep = doelgroepBijRichting(o.info, o.kader, setIds);
  // Is wat het leerplan zou krijgen precies wat gekozen is? Een gekozen doel zonder tekst in de set kan er niet in.
  const precies = zelfdeSelectie(gekozen, gevraagd);
  if (precies) {
    const hergebruik = vindLeerplanMetSelectie(o.curricula, gekozen, doelgroep);
    if (hergebruik) return { soort: 'hergebruik', leerplan: hergebruik };
  }

  const r = leerplanUitSelectie(keuzes, {
    titel: leerplanTitel(o.info, o.kader, setIds),
    oudeVersies: o.oudeVersies,
    doelgroep,
  });
  if (!r.bevestigd || !precies) {
    const eerste = r.waarschuwingen[0] ?? 'Het leerplan klopt niet met de officiële bron.';
    return { soort: 'niet-nagekeken', waarschuwing: zonderSetId(eerste).replace(/[.\s]+$/, '') };
  }
  return { soort: 'nieuw', leerplan: r.leerplan };
}

/**
 * De voorgestelde titels (hoogstens 120 tekens, nooit een set-id):
 * - `leerplan`: "Aanvulling · " + de titel van het leerplan van de richting voor deze sets, bv.
 *   "Aanvulling · Chemie · Natuurwetenschappen · 2de graad" of "Aanvulling · Chemie en 2 andere · Natuurwetenschappen · 2de graad";
 * - `cursus`: bij één set de naam van de set ("Chemie · Natuurwetenschappen · 4de jaar"), bij meer sets "Aanvulling ·
 *   Natuurwetenschappen · 4de jaar". Het jaar komt van `keuze`. De doelgroep van de cursus zelf krijgt geen vak: dit is
 *   alleen een voorstel voor de titel.
 *
 * `setNamen` geeft per set de naam voor het scherm (`setNamenVan`); een set zonder naam daarin valt terug op de naam in het kader.
 */
export function titelsVoorGaten(
  info: RichtingInfo,
  kader: RichtingKader,
  keuze: RichtingKeuze,
  setIds: readonly string[],
  setNamen: ReadonlyMap<string, string>,
): { cursus: string; leerplan: string } {
  const sets = [...new Set(setIds)];
  let vak = 'Aanvulling';
  if (sets.length === 1) {
    const kaderSet = kader.sets.find((k) => k.set.id === sets[0]);
    const naam = veiligeSetNaam(setNamen.get(sets[0]) ?? (kaderSet ? setNaam(kaderSet.set) : ''));
    if (naam !== 'Een set') vak = naam;
  }
  return {
    cursus: voorstelCursusTitel({ ...doelgroepVan(info, keuze), vak }),
    leerplan: leerplanTitel(info, kader, sets),
  };
}

// ── Secties toevoegen aan een bestaande cursus (b) ──────────────────────────

/** Een hoofdstuktitel om te vergelijken: getrimd en zonder hoofdletters. */
function titelSleutel(titel: string): string {
  return titel.trim().toLocaleLowerCase('nl');
}

/**
 * Zet doelcodes als lege secties in een cursus (§ 22.4.6): elke sectie bevat alleen de doelen-callout en telt in de
 * dekking dus als ‘gepland’. Bewaren doet de aanroeper.
 *
 * - Een code die al op een sectie van de cursus staat (ook op een keuzesectie) komt in `alOpCursus` en wordt niet opnieuw
 *   gezet. Een code die niet in het leerplan staat (of zonder bruikbare code), komt nergens: de aanroeper kiest `codes`
 *   met `codesVoorDoelen`.
 * - De rest gaat door `geraamteHoofdstukken(leerplan, rest)`. Een nieuw hoofdstuk met dezelfde titel als een hoofdstuk
 *   van de cursus (getrimd, zonder hoofdletters) zet zijn secties achteraan in dat hoofdstuk; anders komt er achteraan
 *   in de cursus een nieuw hoofdstuk.
 * - Invariant: elk bestaand hoofdstuk, elke sectie en elk blok blijft diep gelijk en in dezelfde volgorde; de gegeven cursus
 *   wordt niet aangepast. De nieuwe hoofdstukken en secties hebben nieuwe ids. Er komen nooit keuzesecties bij.
 * - `toegevoegd` zijn de codes die echt op een nieuwe sectie kwamen, in de volgorde van de nieuwe secties. `hoofdstukken`
 *   is het aantal hoofdstukken waar secties bij kwamen (een nieuw hoofdstuk of een uitgebreid hoofdstuk).
 * - Is er niets toe te voegen, dan is `course` de gegeven cursus zelf.
 */
export function voegGeplandeSectiesToe(
  course: Course,
  leerplan: Curriculum,
  codes: readonly string[],
): { course: Course; toegevoegd: string[]; alOpCursus: string[]; hoofdstukken: number } {
  const gewenst = normalizeGoalCodes(codes);
  const opCursus = new Set<string>();
  for (const { section } of allSections(course)) for (const code of normalizeGoalCodes(section.goalCodes)) opCursus.add(code);
  const alOpCursus = gewenst.filter((code) => opCursus.has(code));
  const rest = gewenst.filter((code) => !opCursus.has(code));

  const nieuw = rest.length > 0 ? geraamteHoofdstukken(leerplan, rest) : [];
  if (nieuw.length === 0) return { course, toegevoegd: [], alOpCursus, hoofdstukken: 0 };

  const hoofdstukken: CourseChapter[] = [...course.chapters];
  const geraakt = new Set<number>();
  for (const hoofdstuk of nieuw) {
    const i = hoofdstukken.findIndex((h) => titelSleutel(h.title) === titelSleutel(hoofdstuk.title));
    if (i >= 0) {
      hoofdstukken[i] = { ...hoofdstukken[i], sections: [...hoofdstukken[i].sections, ...hoofdstuk.sections] };
      geraakt.add(i);
    } else {
      geraakt.add(hoofdstukken.length);
      hoofdstukken.push(hoofdstuk);
    }
  }
  const toegevoegd = nieuw.flatMap((h) => h.sections.flatMap((s) => s.goalCodes ?? []));
  return { course: { ...course, chapters: hoofdstukken }, toegevoegd, alOpCursus, hoofdstukken: geraakt.size };
}

// ── Bewaren ─────────────────────────────────────────────────────────────────

/**
 * De opslag zoals dit bestand ze nodig heeft. De aanroeper geeft `saveCurriculum`, `deleteCurriculum`, `saveCourse`,
 * `getCourse` en `saveCourseGuarded` mee (uit `curriculum.ts` en `courses.ts`); in een test een nagebootste opslag.
 */
export interface GatenOpslag {
  saveCurriculum(c: Curriculum): boolean;
  deleteCurriculum(id: string): void;
  saveCourse(c: Course): boolean;
  getCourse(id: string): Course | undefined;
  saveCourseGuarded(c: Course, verwacht: number): GuardedSaveResult;
}

/** Een schrijfactie die gooit, telt als mislukt. */
function lukt(actie: () => boolean): boolean {
  try {
    return actie() === true;
  } catch {
    return false;
  }
}

/**
 * Bewaart een nieuwe cursus met haar leerplan (§ 22.4.2, stap 6). Eerst het leerplan, en alleen als het nieuw is
 * (`nieuwLeerplan`; een hergebruikt leerplan staat er al). Lukt het leerplan niet, dan wordt de cursus niet geprobeerd. Lukt
 * de cursus niet, dan wordt een nieuw leerplan weer gewist, zodat er geen leerplan zonder cursus achterblijft; een
 * hergebruikt leerplan blijft altijd staan. Staat dezelfde cursus (zelfde id) er al, bv. door een eerdere aanroep die
 * wel lukte, of is dat niet na te gaan, dan blijft het leerplan ook staan: de cursus hangt eraan. Een opslag die gooit,
 * telt als mislukt. De opslaglaag meldt een volle opslag zelf: de aanroeper zegt alleen dat er niets bewaard is.
 */
export function bewaarNieuweGatenCursus(
  o: { leerplan: Curriculum; nieuwLeerplan: boolean; cursus: Course },
  opslag: GatenOpslag,
): { ok: true } | { ok: false; wat: 'leerplan' | 'cursus' } {
  if (o.nieuwLeerplan && !lukt(() => opslag.saveCurriculum(o.leerplan))) return { ok: false, wat: 'leerplan' };
  if (!lukt(() => opslag.saveCourse(o.cursus))) {
    if (o.nieuwLeerplan) {
      try {
        // Alleen wissen als de cursus er echt niet staat: anders zou een al bewaarde cursus haar leerplan verliezen.
        if (opslag.getCourse(o.cursus.id) === undefined) opslag.deleteCurriculum(o.leerplan.id);
      } catch {
        // Niets meer aan te doen: de aanroeper meldt dat er niets bewaard is.
      }
    }
    return { ok: false, wat: 'cursus' };
  }
  return { ok: true };
}

/**
 * Zet de gekozen doelcodes als lege secties in een bestaande cursus en bewaart (§ 22.4.3, stap 3). De cursus wordt
 * opnieuw gelezen (`getCourse`), nooit uit een kopie van toen het venster openging; ze moet nog aan hetzelfde leerplan
 * hangen; de secties komen in die verse versie (`voegGeplandeSectiesToe`) en het bewaren is bewaakt met
 * `saveCourseGuarded(nieuw, vers.updatedAt)`: een cursus die intussen elders veranderde, wordt nooit overschreven.
 * Het leerplan wordt niet aangepast.
 *
 * - `verwijderd`: de cursus bestaat niet meer (bij het lezen, of bij het bewaren).
 * - `ander-leerplan`: de cursus hangt intussen aan een ander leerplan dan `leerplan`.
 * - `niets-te-doen`: geen enkele code kon op een nieuwe sectie komen (al op de cursus, of niet in het leerplan).
 * - `gewijzigd`: de cursus veranderde tussen lezen en bewaren; er is niets geschreven.
 * - `mislukt`: schrijven mislukte (volle of geblokkeerde opslag); de opslaglaag meldt dat zelf.
 *
 * `course` in het resultaat is de bewaarde cursus, met de nieuwe versie (`updatedAt`); `toegevoegd` is het aantal doelcodes.
 */
export function bewaarGatenOpCursus(
  o: { courseId: string; leerplan: Curriculum; codes: readonly string[] },
  opslag: GatenOpslag,
):
  | { ok: true; course: Course; toegevoegd: number }
  | { ok: false; reden: 'gewijzigd' | 'verwijderd' | 'mislukt' | 'ander-leerplan' | 'niets-te-doen' } {
  const vers = opslag.getCourse(o.courseId);
  if (!vers) return { ok: false, reden: 'verwijderd' };
  if (vers.curriculumId !== o.leerplan.id) return { ok: false, reden: 'ander-leerplan' };
  const { course, toegevoegd } = voegGeplandeSectiesToe(vers, o.leerplan, o.codes);
  if (toegevoegd.length === 0) return { ok: false, reden: 'niets-te-doen' };
  const r = opslag.saveCourseGuarded(course, vers.updatedAt);
  if (!r.ok) return { ok: false, reden: r.reason };
  return { ok: true, course: { ...course, updatedAt: r.updatedAt }, toegevoegd: toegevoegd.length };
}
