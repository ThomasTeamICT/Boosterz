// De bewijsontvanger voor het kindscherm: het geheugen van dit tabblad, gespiegeld naar de sessionStorage van het tabblad
// zodat herladen tijdens de les niets kost. Nooit de localStorage. De toegang staat in een try/catch (een privévenster of
// geblokkeerde opslag mag de les niet breken) en de stand blijft dan alleen in het geheugen.
//
// De zuivere kant (samenvoegen, de tekst schrijven en lezen) staat in src/lib/basis/lichtkamer/les/bewijsOntvanger.ts.

import { useState } from 'react';
import { LEGE_STAND, leesStand, maakGeheugenOntvanger, serialiseerStand, type BewijsOntvanger, type BewijsStand } from '../../../lib/basis/lichtkamer/les';

/** De ene sleutel waaronder het kindscherm zijn bewijs spiegelt. */
export const SESSIE_SLEUTEL = 'wf.basis.lichtkamer.les.v1';

export function leesSessie(): BewijsStand {
  try {
    return leesStand(window.sessionStorage.getItem(SESSIE_SLEUTEL));
  } catch {
    return LEGE_STAND;
  }
}

export function schrijfSessie(stand: BewijsStand): void {
  try {
    window.sessionStorage.setItem(SESSIE_SLEUTEL, serialiseerStand(stand));
  } catch {
    // Geen opslag of vol: de stand blijft in het geheugen.
  }
}

/** Eén geheugenontvanger per bezoek aan het kindscherm; hij begint met wat het tabblad al bewaarde. */
export function useKindBewijs(): BewijsOntvanger {
  const [ontvanger] = useState<BewijsOntvanger>(() => maakGeheugenOntvanger({ begin: leesSessie(), opWijziging: schrijfSessie }));
  return ontvanger;
}
