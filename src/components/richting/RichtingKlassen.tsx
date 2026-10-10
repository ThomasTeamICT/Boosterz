// De sectie "Klassen van deze richting" op het detail van een richting (docs/STUDIERICHTINGEN.md § 22.6.3 en § 22.6.4).
// De props liggen vast; pakket B3 maakt de echte versie.

import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import type { RichtingInfo, SoortKeuze } from '../../lib/richtingKader';

export interface RichtingKlassenProps {
  info: RichtingInfo;
  soort: SoortKeuze;
  /** De cursussen en leerplannen van dit toestel, voor "2 van de 3 cursussen van deze richting staan in deze klas." */
  courses: readonly Course[];
  curricula: readonly Curriculum[];
}

/** Tijdelijk (I-A): geeft nog niets. */
export function RichtingKlassen(_props: RichtingKlassenProps) {
  return null;
}
