// De namen van de sets van een dekking voor op het scherm (docs/STUDIERICHTINGEN.md § 14.9 en § 22.7). Puur en klein, zodat de
// dekkingsberekening (useRichtingDekking) ze kan gebruiken zonder het scherm MinimumdoelenDekking mee te laden.

import type { MdDekking } from './dekkingMinimumdoelen';
import { uniekeSetNamen } from './dekkingWeergave';
import type { MinimumdoelenSetBestand } from './minimumdoelen';
import { contextVanSet } from './minimumdoelenBron';

/** De namen van de sets voor het scherm: dubbele korte namen krijgen de context erachter ("Pool · Domein"). */
export function setNamenVan(dekking: Pick<MdDekking, 'perSet'>, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): Map<string, string> {
  return uniekeSetNamen(dekking.perSet, (set) => {
    const naam = bestanden.get(set)?.set.naam;
    return typeof naam === 'string' ? contextVanSet(naam) : '';
  });
}
