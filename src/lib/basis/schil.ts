// Welke schil een scherm van het deel basisonderwijs krijgt (LK-8): de gewone schil met de navigatie van de leerkracht,
// of de kale schil van het kind of van het bord. BasisDeel kiest ermee; de kale schermen laden hun schil lui mee.
// Zuiver: alleen het scherm erin, het geeft iets terug.

import type { BasisScherm } from './basisRoutes';

export type SchilSoort = 'basis' | 'kind' | 'bord';

export function schilVan(s: BasisScherm): SchilSoort {
  switch (s.s) {
    case 'oefen':
      return 'kind';
    case 'bord':
      return 'bord';
    default:
      return 'basis';
  }
}
