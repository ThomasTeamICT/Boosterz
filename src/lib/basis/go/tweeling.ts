// De tweeling van een gewone minimumdoelenset in het buitengewoon basisonderwijs. Het leerplan van het GO! verwijst
// altijd naar de gewone sets (ODS_3395 tot ODS_3428); wie buitengewoon koos, wil bij een klik op een minimumdoel op de
// doelpagina van het buitengewone doel met hetzelfde nummer komen (daar 'na te streven' in plaats van 'te bereiken').

import type { MinimumdoelenIndexSet } from '../../minimumdoelen';
import { basisSet, tweelingSets } from '../moment';

/**
 * Van het id van elke nieuwe gewone basisset naar het id van zijn tweeling in het buitengewoon. Alleen als er precies één
 * tweeling is; anders staat de set er niet in en blijft de link naar de gewone set gaan.
 */
export function bubaoSetVan(alle: readonly MinimumdoelenIndexSet[]): ReadonlyMap<string, string> {
  const uit = new Map<string, string>();
  for (const kop of alle) {
    const info = basisSet(kop);
    if (!info || info.soort !== 'bao' || info.generatie !== 'nieuw') continue;
    const tweeling = tweelingSets(info, alle);
    if (tweeling.length === 1) uit.set(kop.id, tweeling[0].id);
  }
  return uit;
}
