// Haalt de bestanden van de gekozen sets op voor het scherm "Stel je eigen doelenlijst samen": per set laden, klaar of
// fout, met "Opnieuw proberen" per set. `laadSet` bewaart wat al opgehaald is, dus een set die in stap 1 al geladen was
// of die je weghaalt en weer kiest, komt meteen terug.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MinimumdoelenSetBestand } from '../../../lib/minimumdoelen';
import { FOUT_NIET_GELADEN, laadSet } from '../../../lib/minimumdoelenBron';

export type SetStand = { status: 'laden' } | { status: 'klaar'; bestand: MinimumdoelenSetBestand } | { status: 'fout'; fout: string };
const LADEN: SetStand = { status: 'laden' };

interface Uitkomst {
  /** Bij welke poging deze uitkomst hoort: een nieuwe poging maakt een oudere uitkomst ongeldig. */
  poging: number;
  stand: SetStand;
}

export function useSetBestanden(ids: readonly string[]): {
  /** De stand van één set; een set die niet gevraagd is of nog niet antwoordde, staat op "laden". */
  stand: (id: string) => SetStand;
  /** De geladen bestanden van de gevraagde sets. */
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>;
  /** Probeert één set opnieuw (na een fout). */
  opnieuw: (id: string) => void;
} {
  const [uitkomsten, setUitkomsten] = useState<ReadonlyMap<string, Uitkomst>>(() => new Map());
  const [pogingen, setPogingen] = useState<ReadonlyMap<string, number>>(() => new Map());
  // De aanroeper geeft bij elke render een nieuwe lijst: de inhoud als tekst is de sleutel.
  const sleutel = ids.join('|');

  useEffect(() => {
    let weg = false;
    const lijst = sleutel === '' ? [] : sleutel.split('|');
    for (const id of lijst) {
      const poging = pogingen.get(id) ?? 0;
      const zet = (stand: SetStand) => {
        if (!weg) setUitkomsten((m) => new Map(m).set(id, { poging, stand }));
      };
      laadSet(id).then(
        (bestand) => zet({ status: 'klaar', bestand }),
        (e: unknown) => zet({ status: 'fout', fout: e instanceof Error ? e.message : FOUT_NIET_GELADEN }),
      );
    }
    return () => { weg = true; };
  }, [sleutel, pogingen]);

  const stand = useCallback((id: string): SetStand => {
    const u = uitkomsten.get(id);
    return u && u.poging === (pogingen.get(id) ?? 0) ? u.stand : LADEN;
  }, [uitkomsten, pogingen]);

  const bestanden = useMemo(() => {
    const uit = new Map<string, MinimumdoelenSetBestand>();
    for (const id of sleutel === '' ? [] : sleutel.split('|')) {
      const u = uitkomsten.get(id);
      if (u && u.poging === (pogingen.get(id) ?? 0) && u.stand.status === 'klaar') uit.set(id, u.stand.bestand);
    }
    return uit;
  }, [sleutel, uitkomsten, pogingen]);

  const opnieuw = useCallback((id: string) => {
    setPogingen((m) => new Map(m).set(id, (m.get(id) ?? 0) + 1));
  }, []);

  return { stand, bestanden, opnieuw };
}
