// Het laden van de gegevens voor de schermen van het basisdeel: de index van alle sets en de bestanden van de sets die
// een scherm nodig heeft. Geen eigen cache: laadIndex en laadSet houden hun gedeelde beloften zelf bij (hoogstens 40
// sets), zodat de schil en de schermen dezelfde gegevens delen zonder dubbel op te halen.

import { useMemo } from 'react';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import { laadIndex } from '../../lib/minimumdoelenBron';
import type { MinimumdoelenIndex } from '../../lib/minimumdoelen';
import { useLaadstand, type Laadstand } from '../../lib/useLaadstand';

/** De index van alle sets (met de naamsvermelding), met "Opnieuw proberen" na een fout. */
export function useBasisIndex(): { stand: Laadstand<MinimumdoelenIndex>; opnieuw: () => void } {
  return useLaadstand('basis-index', laadIndex);
}

/** De laatste ophaaldatum van alle sets in de index ('' als er geen is). ISO-datums sorteren als tekst. */
export function laatstOpgehaald(index: MinimumdoelenIndex): string {
  return index.sets.reduce((m, s) => (s.opgehaald > m ? s.opgehaald : m), '');
}

/**
 * De index en de bestanden van de gevraagde sets. `ids` mag bij elke render een nieuwe lijst zijn; de inhoud telt.
 * Zonder ids wordt alleen de index geladen.
 */
export function useBasisSets(ids: readonly string[] = []) {
  const index = useBasisIndex();
  const sets = useSetBestanden(ids);
  const opgehaald = useMemo(() => (index.stand.status === 'klaar' ? laatstOpgehaald(index.stand.waarde) : ''), [index.stand]);
  return { index: index.stand, opnieuwIndex: index.opnieuw, opgehaald, ...sets };
}
