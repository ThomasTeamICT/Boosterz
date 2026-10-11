// De sectie "Beroepskwalificaties" op de richtingpagina en de kopregel onder de titel (docs/STUDIERICHTINGEN.md § 23.7.1
// en § 23.7.2). Dit bestand zit in een lui chunk: het richtingenscherm laadt het pas als de richting beroepskwalificaties
// kan hebben (`kanBkHebben`).
//
// GERAAMTE (I2): S1 bouwt de sectie en de kopregel uit. De props liggen vast; tot dan tonen beide niets.

import type { Course } from '../../../lib/courseTypes';
import type { RichtingBk } from '../../../lib/richtingBk';
import type { RichtingContext } from '../RichtingDoelen';

export interface BkSectieProps {
  /**
   * De richting, haar keuze, het kader op minimumdoelen en de leerplannen van dit toestel. `context.bk` is altijd gezet en
   * nooit 'niet-van-toepassing': laden, fout of klaar (met het BK-kader van `useRichtingBk`).
   */
  context: RichtingContext;
  /** De cursussen van dit toestel (voor "Maak een cursus met deze competenties" en de meldingen over bestaande leerplannen). */
  courses: readonly Course[];
  /** JJJJ-MM-DD. */
  vandaag: string;
  /** Na een laadfout: het BK-kader opnieuw laden ("Opnieuw proberen"). */
  opnieuw: () => void;
}

/** De sectie "Beroepskwalificaties", na "De officiële minimumdoelen" en vóór "Leerplannen". */
export function BkSectie(_props: BkSectieProps) {
  return null;
}

export interface BkKopRegelProps {
  /** Het BK-kader, alleen gemonteerd als het klaar is en minstens één BK heeft. */
  bk: RichtingBk;
}

/** "Beroepskwalificaties: Onthaalmedewerker en Recreatief medewerker." met de knop "Naar de beroepskwalificaties". */
export function BkKopRegel(_props: BkKopRegelProps) {
  return null;
}
