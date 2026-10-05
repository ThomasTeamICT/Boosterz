// Stap 3 van de inleeswizard: welke sets minimumdoelen horen bij dit leerplan? Het laden en de keuze
// zitten in een hook die de pagina zelf vasthoudt, zodat een stap terug of vooruit niets opnieuw laadt
// en de keuze van de leerkracht blijft staan. De regels (welke sets, treffers, wat vooraf aangevinkt
// staat) zitten in lib/leerplanInlezen.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  kandidaatSets, kiesVooraf, LAAD_MAX, LAAD_PER_KEER, maakKandidaat, rangschik,
  type OnderwijsKeuze, type SetKandidaat,
} from '../../../lib/leerplanInlezen';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../../lib/minimumdoelen';
import { FOUT_NIET_GELADEN, laadIndex, laadSet } from '../../../lib/minimumdoelenBron';

/** Waar de sets van afhangen. De codes zijn die van de bron, niet van het werk in stap 4. */
export interface SetInvoer {
  graad: string;
  stroom: string;
  onderwijs: OnderwijsKeuze;
  vak: string;
  codes: readonly string[];
  /** Sets die het leerplan al heeft (bestaand leerplan): die staan vooraf aangevinkt. */
  eigen: readonly string[];
}

export interface SetStand {
  status: 'laden' | 'klaar' | 'fout';
  fout?: string;
  /** Tijdens het laden: hoeveel van de sets al binnen zijn. */
  voortgang?: { geladen: number; totaal: number };
  /** De hele index, om in te zoeken naar andere sets. */
  indexSets: MinimumdoelenIndexSet[];
  kandidaten: SetKandidaat[];
  /** Ids van de aangevinkte sets. */
  gekozen: string[];
  /** Passende sets die we niet vooraf geladen hebben (te veel); de leerkracht zoekt ze zelf. */
  nogOver: number;
  /** Een zoek-en-toevoeg-actie die mislukte. */
  toevoegFout?: string;
}

const BEGIN: SetStand = { status: 'laden', indexSets: [], kandidaten: [], gekozen: [], nogOver: 0 };

function bericht(e: unknown): string {
  return e instanceof Error ? e.message : FOUT_NIET_GELADEN;
}

export function useSetKandidaten(invoer: SetInvoer, actief: boolean) {
  const [stand, setStand] = useState<SetStand>(BEGIN);
  const [poging, setPoging] = useState(0);
  const sleutel = JSON.stringify(invoer);
  const geladenVoor = useRef<string | null>(null);
  const invoerRef = useRef(invoer);
  invoerRef.current = invoer;

  useEffect(() => {
    if (!actief) return;
    if (geladenVoor.current === `${sleutel}#${poging}`) return;
    let afgebroken = false;
    const nu = invoerRef.current;
    setStand({ ...BEGIN });
    (async () => {
      try {
        const index = await laadIndex();
        const alle = kandidaatSets(index.sets, nu);
        const teLaden = alle.slice(0, LAAD_MAX);
        const kandidaten: SetKandidaat[] = [];
        for (let i = 0; i < teLaden.length; i += LAAD_PER_KEER) {
          const groep = teLaden.slice(i, i + LAAD_PER_KEER);
          const uitkomsten = await Promise.allSettled(groep.map((s) => laadSet(s.id)));
          if (afgebroken) return;
          groep.forEach((s, j) => {
            const u = uitkomsten[j];
            kandidaten.push(maakKandidaat(s, u.status === 'fulfilled' ? u.value : undefined, nu.codes));
          });
          setStand((vorige) => ({ ...vorige, voortgang: { geladen: kandidaten.length, totaal: teLaden.length } }));
        }
        if (afgebroken) return;
        // Wat niet geladen kon worden, blijft achteraan staan zodat de leerkracht het ziet.
        const geladen = rangschik(kandidaten.filter((k) => !k.mislukt));
        const gerangschikt = [...geladen, ...kandidaten.filter((k) => k.mislukt)];
        const gekozen = nu.eigen.length > 0 ? [...nu.eigen] : kiesVooraf(geladen);
        geladenVoor.current = `${sleutel}#${poging}`;
        setStand({ status: 'klaar', indexSets: index.sets, kandidaten: gerangschikt, gekozen, nogOver: alle.length - teLaden.length });
      } catch (e) {
        if (!afgebroken) setStand({ ...BEGIN, status: 'fout', fout: bericht(e) });
      }
    })();
    return () => { afgebroken = true; };
  }, [actief, sleutel, poging]);

  const wissel = useCallback((id: string) => {
    setStand((vorige) => ({
      ...vorige,
      gekozen: vorige.gekozen.includes(id) ? vorige.gekozen.filter((x) => x !== id) : [...vorige.gekozen, id],
    }));
  }, []);

  /** Een set uit het zoekveld erbij: laden, aanvinken en op de lijst zetten. */
  const voegToe = useCallback(async (set: MinimumdoelenIndexSet) => {
    try {
      const bestand = await laadSet(set.id);
      setStand((vorige) => {
        const kandidaat = maakKandidaat(set, bestand, invoerRef.current.codes);
        const kandidaten = vorige.kandidaten.some((k) => k.set.id === set.id)
          ? vorige.kandidaten.map((k) => (k.set.id === set.id ? kandidaat : k))
          : [...rangschik([...vorige.kandidaten.filter((k) => !k.mislukt), kandidaat]), ...vorige.kandidaten.filter((k) => k.mislukt)];
        return { ...vorige, kandidaten, gekozen: vorige.gekozen.includes(set.id) ? vorige.gekozen : [...vorige.gekozen, set.id], toevoegFout: undefined };
      });
    } catch (e) {
      setStand((vorige) => ({ ...vorige, toevoegFout: bericht(e) }));
    }
  }, []);

  const opnieuw = useCallback(() => {
    geladenVoor.current = null;
    setPoging((p) => p + 1);
  }, []);

  /** De geladen bestanden van alle kandidaten, op set-id. */
  const bestanden = useMemo(() => {
    const m = new Map<string, MinimumdoelenSetBestand>();
    for (const k of stand.kandidaten) if (k.bestand) m.set(k.set.id, k.bestand);
    return m;
  }, [stand.kandidaten]);

  return { stand, bestanden, wissel, voegToe, opnieuw };
}
