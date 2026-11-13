// De hooks voor het aanbod in Boosterz bij een lesplan (src/lib/basis/go/aanbodBron.ts). Zoals useGo.ts: een Laadstand
// met 'opnieuw' na een fout. Een eigen bestand, zodat de schermen die geen aanbod tonen er niets van meeladen.

import { laadAanbodBordles, laadGoAanbod } from '../../lib/basis/go/aanbodBron';
import type { GoAanbodBestand, GoAanbodBordles } from '../../lib/basis/go/aanbod';
import { useLaadstand } from '../../lib/useLaadstand';
import type { MetOpnieuw } from './useGo';

/** Het aanbod bij een lesplan; klaar met null als er (nog) geen is. */
export function useGoAanbod(code: string): MetOpnieuw<GoAanbodBestand | null> {
  return useLaadstand(`go-aanbod-${code}`, () => laadGoAanbod(code));
}

/** Een bordles uit het aanbod van een lesplan. */
export function useAanbodBordles(code: string, bestand: string): MetOpnieuw<GoAanbodBordles> {
  return useLaadstand(`go-aanbod-${code}/${bestand}`, () => laadAanbodBordles(code, bestand));
}
