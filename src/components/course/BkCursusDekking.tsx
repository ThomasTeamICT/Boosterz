// De dekking op competenties in de cursuseditor (docs/STUDIERICHTINGEN.md § 24.6.1): bij "Doelendekking" met de keuze
// "Beroepskwalificatie" het percentage per beroepskwalificatie, per competentie gedekt, gepland of open, en "Plan ze in deze
// cursus". Het kader is de BK-versies van het eigen leerplan (F3b-B6), nooit de koppeling van een richting. Dit bestand zit in
// een lui chunk: GoalCoverage laadt het pas bij de klik.
//
// GERAAMTE (3b-I1): 3b-S1 bouwt dit uit. De props liggen vast; tot dan toont het niets.

import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import type { Widget } from '../../lib/types';

export interface BkCursusDekkingProps {
  /** De cursus zoals ze in de editor staat. */
  course: Course;
  /** Het leerplan van de cursus: een BK-leerplan (`isBkLeerplan`). */
  curriculum: Curriculum;
  /** De oefeningen van dit toestel (wat een sectie behandelt). */
  widgets: Widget[];
  /** Secties toevoegen ("Zet ze in deze cursus"): alleen via de editor, die bewaart. Zonder: alleen kijken. */
  onEdit?: (next: (c: Course) => Course) => void;
}

export function BkCursusDekking(_props: BkCursusDekkingProps) {
  return null;
}
