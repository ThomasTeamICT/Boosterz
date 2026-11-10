// De hooks voor de gegevens van het GO!: de index, het leerplan van een vak, een lesplan en de omgekeerde index bij
// een vak van het minimumdoel. Elk geeft een Laadstand ('laden', 'klaar' of 'fout') en 'opnieuw' na een fout.
// Geen eigen cache: goBron.ts houdt de gedeelde beloften zelf bij, zodat schermen dezelfde gegevens delen.
// Een nieuwe sleutel (ander vak, ander lesplan) begint meteen weer bij 'laden'.

import {
  laadGoBijMinimumdoel,
  laadGoIndex,
  laadGoLeerplan,
  laadGoLesplan,
} from '../../lib/basis/go/goBron';
import type { GoBijMinimumdoelBestand, GoIndex, GoLeerplanBestand, GoLesplanBestand, GoVak } from '../../lib/basis/go/types';
import { useLaadstand, type Laadstand } from '../../lib/useLaadstand';

export type MetOpnieuw<T> = { stand: Laadstand<T>; opnieuw: () => void };

/** Een laadfout met 'Opnieuw proberen', zoals een scherm ze doorgeeft aan een deel dat zonder die gegevens onvolledig is. */
export interface GoLaadFout {
  fout: string;
  opnieuw: () => void;
}

/** De fout van een laadstand, met 'opnieuw'; undefined zolang er geen fout is. */
export function foutVan<T>(h: MetOpnieuw<T>): GoLaadFout | undefined {
  return h.stand.status === 'fout' ? { fout: h.stand.fout, opnieuw: h.opnieuw } : undefined;
}

/** De index van het GO!: lesplannen, leerplan per vak en de omgekeerde index. */
export function useGoIndex(): MetOpnieuw<GoIndex> {
  return useLaadstand('go-index', laadGoIndex);
}

/** Alle leerplandoelen van één vakdiscipline. */
export function useGoLeerplan(vak: GoVak): MetOpnieuw<GoLeerplanBestand> {
  return useLaadstand(`go-leerplan-${vak}`, () => laadGoLeerplan(vak));
}

/** Eén lesplan, bv. 'LP0065'. */
export function useGoLesplan(code: string): MetOpnieuw<GoLesplanBestand> {
  return useLaadstand(`go-lesplan-${code}`, () => laadGoLesplan(code));
}

/** De leerplandoelen van het GO! bij de minimumdoelen van één vak (1 tot 10). */
export function useGoBijMinimumdoel(vak: number): MetOpnieuw<GoBijMinimumdoelBestand> {
  return useLaadstand(`go-bij-${vak}`, () => laadGoBijMinimumdoel(vak));
}
