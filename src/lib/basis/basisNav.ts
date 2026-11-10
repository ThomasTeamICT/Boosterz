// Waar de navigatie van het deel basisonderwijs naartoe wijst (Doelen, Leerlijnen, Zoeken), uit het scherm, de bewaarde
// keuze en de sets van de index. Zuiver: geen React en geen opslag. Staat los van BasisSchil.tsx omdat een .tsx met
// meer dan één export een react-refresh-waarschuwing geeft.
//
// Volgorde: wat het scherm zelf weet (soort, eindmoment, leerjaar, of de set van een doel) wint, daarna de bewaarde
// keuze van de leerkracht, en pas dan het gewone onderwijs en het einde van het 4de leerjaar (INGANG.md, H8).

import { WERKT_NAAR, type Eindmoment, type SoortBasis } from './kalender';
import type { BasisKeuze } from './basisKeuze';
import type { BasisScherm } from './basisRoutes';
import { basisSet } from './moment';
import type { MinimumdoelenIndexSet } from '../minimumdoelen';

type Sets = readonly MinimumdoelenIndexSet[] | undefined;

function setVan(s: BasisScherm, sets: Sets) {
  if (s.s !== 'doel' || !sets) return undefined;
  const set = sets.find((x) => x.id === s.setId);
  return set ? basisSet(set) : undefined;
}

/** De soort voor de navigatie: die van het scherm of van de set van het doel, anders de bewaarde keuze, anders gewoon. */
export function navSoort(s: BasisScherm, keuze?: BasisKeuze, sets?: Sets): SoortBasis {
  if ('soort' in s) return s.soort;
  return setVan(s, sets)?.soort ?? keuze?.soort ?? 'bao';
}

/** Het eindmoment voor 'Doelen': dat van het scherm, het leerjaar van het scherm, de bewaarde keuze, anders L4. */
export function navEind(s: BasisScherm, keuze?: BasisKeuze, sets?: Sets): Eindmoment {
  if (s.s === 'moment' || s.s === 'vak') return s.eind;
  if (s.s === 'leerjaar') return WERKT_NAAR[s.leerjaar];
  const vanSet = setVan(s, sets)?.eindmoment;
  if (vanSet) return vanSet;
  if ('leerjaar' in s && s.leerjaar) return WERKT_NAAR[s.leerjaar];
  if (keuze) return WERKT_NAAR[keuze.leerjaar];
  return 'L4';
}
