// Het tweede blok van "Wat je cursussen samen dekken": de competenties van de beroepskwalificaties
// (docs/STUDIERICHTINGEN.md § 23.7.4). Dit bestand zit in een lui chunk.
//
// GERAAMTE (I2): S3 bouwt het blok uit en monteert het in RichtingDekking.tsx. De props liggen vast; tot dan toont het niets.

import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import type { RichtingBk } from '../../../lib/richtingBk';
import type { RichtingInfo, RichtingKeuze } from '../../../lib/richtingKader';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import type { BkStand } from '../useRichtingBk';
import type { TelMee } from '../useRichtingDekking';

export interface BkDekkingProps {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  /** Het BK-kader, klaar en met minstens één BK. */
  bk: RichtingBk;
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  matrix: MatrixBestand;
  /** JJJJ-MM-DD. */
  vandaag: string;
  /** "Tel mee" van de sectie: het geldt voor beide blokken. */
  telMee: TelMee;
}

/** Wat het richtingenscherm aan "Wat je cursussen samen dekken" meegeeft voor dit blok (de rest heeft de sectie al). */
export interface BkDekkingInvoer {
  /** Het BK-kader van `useRichtingBk`: het blok staat er alleen als het klaar is en minstens één BK heeft. */
  stand: BkStand;
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  matrix: MatrixBestand;
  vandaag: string;
}

export function BkDekking(_props: BkDekkingProps) {
  return null;
}
