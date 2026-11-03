// De bewaarde keuze (gewoon of buitengewoon en het leerjaar) als hook. Ze volgt het storage-event van andere tabbladen
// en een eigen gebeurtenis voor wijzigingen in dit tabblad, zodat de kop en de kiezer altijd hetzelfde tonen.
// De opslag zelf zit in src/lib/basis/basisKeuze.ts; hier staat alleen het volgen.

import { useCallback, useSyncExternalStore } from 'react';
import { KEUZE_SLEUTEL, bewaarKeuze, leesKeuze, wisKeuze, type BasisKeuze } from '../../lib/basis/basisKeuze';

const EVENT = 'wf-basis-keuze';

let laatste: BasisKeuze | undefined;

/** Dezelfde inhoud geeft hetzelfde object terug: useSyncExternalStore vergelijkt met ===. */
function snapshot(): BasisKeuze | undefined {
  const nu = leesKeuze();
  if (nu === undefined) laatste = undefined;
  else if (laatste === undefined || laatste.soort !== nu.soort || laatste.leerjaar !== nu.leerjaar) laatste = nu;
  return laatste;
}

function abonneer(melding: () => void): () => void {
  const bijStorage = (e: StorageEvent) => {
    // key === null: de hele opslag werd gewist ('Alles wissen').
    if (e.key === null || e.key === KEUZE_SLEUTEL) melding();
  };
  window.addEventListener('storage', bijStorage);
  window.addEventListener(EVENT, melding);
  return () => {
    window.removeEventListener('storage', bijStorage);
    window.removeEventListener(EVENT, melding);
  };
}

const opServer = (): BasisKeuze | undefined => undefined;

export function useBasisKeuze(): { keuze: BasisKeuze | undefined; bewaar: (k: BasisKeuze) => boolean; wis: () => void } {
  const keuze = useSyncExternalStore(abonneer, snapshot, opServer);
  const bewaar = useCallback((k: BasisKeuze) => {
    const gelukt = bewaarKeuze(k);
    window.dispatchEvent(new Event(EVENT));
    return gelukt;
  }, []);
  const wis = useCallback(() => {
    wisKeuze();
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { keuze, bewaar, wis };
}
