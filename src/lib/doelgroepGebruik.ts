// Wat bij wat past: de doelgroep van een cursus, en welke cursussen en klassen bij elkaar horen
// (docs/STUDIERICHTINGEN.md § 22.5.1 en § 22.6.2).
//
// Puur en licht: alleen `doelgroep.ts` en types, want ook de schermen van de klas en van de richtingen gebruiken dit.
// Een klas of cursus zonder (geldige) doelgroep hoort nergens bij: ze komt altijd bij "andere" terecht.

import type { ClassGroup } from './classTypes';
import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { doelgroepVoorLeerplan, sanitizeDoelgroep, type Doelgroep } from './doelgroep';

/**
 * De doelgroep van een cursus: die van de cursus zelf, anders die van haar leerplan (§ 10.2). Altijd gesaneerd.
 * (Verhuisd uit `RichtingDoelen.tsx`, met precies hetzelfde gedrag.)
 */
export function doelgroepVanCursus(
  course: Pick<Course, 'doelgroep' | 'curriculumId'>,
  curricula: readonly Pick<Curriculum, 'id' | 'doelgroep'>[],
): Doelgroep | undefined {
  const eigen = sanitizeDoelgroep(course.doelgroep);
  if (eigen) return eigen;
  const leerplan = course.curriculumId ? curricula.find((c) => c.id === course.curriculumId) : undefined;
  return leerplan ? doelgroepVoorLeerplan(leerplan.doelgroep) : undefined;
}

/**
 * Past een cursus bij een klas? Dezelfde richting (groepnummer en soort onderwijs), en het jaar ontbreekt bij één van de
 * twee of is gelijk. Het 1ste leerjaar A (G-0307) en het 2de leerjaar A (G-0311) zijn twee richtingen: die passen dus
 * niet bij elkaar (V9). Vak en onderdeel tellen niet mee. Een ongeldige doelgroep past nergens.
 */
export function pastBijKlas(klas: Doelgroep, cursus: Doelgroep): boolean {
  const k = sanitizeDoelgroep(klas);
  const c = sanitizeDoelgroep(cursus);
  if (!k || !c) return false;
  if (k.groep !== c.groep || k.soort !== c.soort) return false;
  return k.jaar === undefined || c.jaar === undefined || k.jaar === c.jaar;
}

/**
 * Welke cursussen passen bij de klas ("Opdracht toevoegen")? `passend` heeft de cursussen voor de richting van de klas:
 * eerst die met hetzelfde jaar, dan de rest (een cursus of klas zonder jaar geldt voor de hele graad), binnen elk in de
 * volgorde van `courses`. `andere` zijn alle andere cursussen, ook die zonder doelgroep, ook in de volgorde van `courses`.
 * Zonder (geldige) doelgroep van de klas is alles `andere`.
 */
export function cursussenVoorToewijzen(
  courses: readonly Course[],
  curricula: readonly Curriculum[],
  klas?: Doelgroep,
): { passend: Course[]; andere: Course[] } {
  const k = klas ? sanitizeDoelgroep(klas) : undefined;
  const zelfdeJaar: Course[] = [];
  const restPassend: Course[] = [];
  const andere: Course[] = [];
  for (const course of courses) {
    const d = k ? doelgroepVanCursus(course, curricula) : undefined;
    if (!k || !d || !pastBijKlas(k, d)) andere.push(course);
    else if (k.jaar !== undefined && d.jaar === k.jaar) zelfdeJaar.push(course);
    else restPassend.push(course);
  }
  return { passend: [...zelfdeJaar, ...restPassend], andere };
}

/**
 * Welke klassen passen bij een cursus (de optgroups bij "Toewijzen vanuit een cursus")? `passend` zijn de klassen met de
 * richting van de cursus (zie `pastBijKlas`), `andere` alle andere klassen, ook die zonder richting; beide in de volgorde
 * van `classes`. Zonder (geldige) doelgroep van de cursus is alles `andere`.
 */
export function klassenVoorToewijzen(
  classes: readonly ClassGroup[],
  cursus?: Doelgroep,
): { passend: ClassGroup[]; andere: ClassGroup[] } {
  const c = cursus ? sanitizeDoelgroep(cursus) : undefined;
  const passend: ClassGroup[] = [];
  const andere: ClassGroup[] = [];
  for (const klas of classes) {
    const d = c ? sanitizeDoelgroep(klas.doelgroep) : undefined;
    if (c && d && pastBijKlas(d, c)) passend.push(klas);
    else andere.push(klas);
  }
  return { passend, andere };
}

/**
 * De klassen van één richting (groepnummer en soort onderwijs, dus 1A en 2A apart), eerst op jaar (oplopend; een klas
 * voor de hele graad komt na de klassen met een jaar), dan op naam. Verder een stabiele volgorde: gelijke klassen
 * houden de volgorde van `classes`.
 */
export function klassenVanRichting(classes: readonly ClassGroup[], groep: string, soort: 'so' | 'buso'): ClassGroup[] {
  const uit: { klas: ClassGroup; jaar: number | undefined; index: number }[] = [];
  classes.forEach((klas, index) => {
    const d = sanitizeDoelgroep(klas.doelgroep);
    if (d && d.groep === groep && d.soort === soort) uit.push({ klas, jaar: d.jaar, index });
  });
  uit.sort((a, b) => {
    if (a.jaar !== b.jaar) {
      if (a.jaar === undefined) return 1;
      if (b.jaar === undefined) return -1;
      return a.jaar - b.jaar;
    }
    const naam = a.klas.name.localeCompare(b.klas.name, 'nl', { numeric: true, sensitivity: 'base' });
    return naam !== 0 ? naam : a.index - b.index;
  });
  return uit.map((u) => u.klas);
}
