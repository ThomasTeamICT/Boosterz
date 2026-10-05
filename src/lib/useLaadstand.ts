import { useEffect, useRef, useState } from 'react';
import { FOUT_NIET_GELADEN } from './minimumdoelenBron';

/** Een ophaalactie die bezig is, mislukte of klaar is. */
export type Laadstand<T> = { status: 'laden' } | { status: 'klaar'; waarde: T } | { status: 'fout'; fout: string };
const LADEN = { status: 'laden' } as const;

/**
 * Haalt iets op en onthoudt de uitkomst per sleutel; een andere sleutel begint meteen weer bij "laden".
 * `opnieuw` probeert dezelfde sleutel nog eens (na een fout). De foutmelding is die van de belofte, of de
 * standaardmelding van de minimumdoelen als er geen tekst bij zat.
 */
export function useLaadstand<T>(sleutel: string, laad: () => Promise<T>): { stand: Laadstand<T>; opnieuw: () => void } {
  const [poging, setPoging] = useState(0);
  const volledig = `${sleutel}#${poging}`;
  const [uitkomst, setUitkomst] = useState<{ sleutel: string; stand: Laadstand<T> } | null>(null);
  const laadRef = useRef(laad);
  laadRef.current = laad;
  useEffect(() => {
    let weg = false;
    laadRef.current().then(
      (waarde) => { if (!weg) setUitkomst({ sleutel: volledig, stand: { status: 'klaar', waarde } }); },
      (e: unknown) => { if (!weg) setUitkomst({ sleutel: volledig, stand: { status: 'fout', fout: e instanceof Error ? e.message : FOUT_NIET_GELADEN } }); },
    );
    return () => { weg = true; };
  }, [volledig]);
  const stand: Laadstand<T> = uitkomst && uitkomst.sleutel === volledig ? uitkomst.stand : LADEN;
  return { stand, opnieuw: () => setPoging((p) => p + 1) };
}
