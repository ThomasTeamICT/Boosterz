// Beroepskwalificaties op de richtingpagina (docs/STUDIERICHTINGEN.md § 23.7): of een richting er kan hebben, en een dunne
// hook die het BK-kader van de richting laadt. Dit bestand is licht en staat in het chunk van de richtingenpagina: de lader
// en de logica (beroepskwalificatiesBron.ts, richtingBk.ts) komen pas met een dynamische import binnen, en alleen voor een
// richting die er kan hebben. Een richting met doorstroomfinaliteit of van de 1ste graad vraagt zo nooit iets op in
// public/leerplannen/kwalificaties/ (een 404 daar zou een consolefout geven, § 23.15 R11).
//
// `kanBkHebben` woont sinds fase 3b in lib/richtingOverzicht.ts (F3b-B10): dat zit in het gedeelde chunk van de lijstpagina
// en de klas, zodat die er niet het chunk van de richtingenpagina voor nodig hebben. Hier wordt ze verder uitgevoerd.

import { useEffect, useState } from 'react';
import type { RichtingBk } from '../../lib/richtingBk';
import type { RichtingInfo, RichtingKeuze } from '../../lib/richtingKader';
import { kanBkHebben } from '../../lib/richtingOverzicht';
import { useLaadstand, type Laadstand } from '../../lib/useLaadstand';

export { kanBkHebben };

/** Het BK-kader van een richting: niet van toepassing (geen verzoek), of laden, fout of klaar. */
export type BkStand = { status: 'niet-van-toepassing' } | Laadstand<RichtingBk>;

const NIET_VAN_TOEPASSING = { status: 'niet-van-toepassing' } as const;

/**
 * Het BK-kader van de richting voor de gekozen variant (`keuze.onderdeel`; het jaar en het soort onderwijs veranderen er
 * niets aan). De koppeling en de index worden één keer opgehaald en gedeeld; een andere variant rekent alleen opnieuw.
 * `opnieuw` probeert het nog eens na een fout (de lader wist een mislukte belofte zelf).
 */
export function useRichtingBk(info: RichtingInfo, keuze: RichtingKeuze, vandaag: string): { stand: BkStand; opnieuw: () => void } {
  const vanToepassing = kanBkHebben(info);
  const sleutel = vanToepassing ? `bk|${info.groep.nummer}|${keuze.onderdeel ?? ''}|${vandaag}` : 'bk|niet-van-toepassing';
  // `useLaadstand` onthoudt de nieuwste functie, dus ze hoeft niet gememoriseerd te worden.
  const { stand, opnieuw } = useLaadstand<RichtingBk | null>(sleutel, async () => {
    if (!vanToepassing) return null;
    const [bron, logica] = await Promise.all([import('../../lib/beroepskwalificatiesBron'), import('../../lib/richtingBk')]);
    const [koppeling, index] = await Promise.all([bron.laadBkKoppeling(), bron.laadBkIndex()]);
    return logica.bkKader(koppeling, index, info, keuze, vandaag);
  });
  if (!vanToepassing) return { stand: NIET_VAN_TOEPASSING, opnieuw };
  if (stand.status === 'klaar') return { stand: stand.waarde ? { status: 'klaar', waarde: stand.waarde } : NIET_VAN_TOEPASSING, opnieuw };
  return { stand, opnieuw };
}

/** De BK's van een stand, of een lege lijst als die er (nog) niet zijn. */
export function bksVan(stand: BkStand | undefined): RichtingBk['bks'] {
  return stand?.status === 'klaar' ? stand.waarde.bks : [];
}

/**
 * Een lui deel van het scherm (een chunk met BK-schermdelen), pas geladen als het nodig is. Lukt het laden niet (de
 * verbinding viel weg), dan geeft de hook `'fout'` en blijft de pagina staan, in plaats van dat een foutgrens haar
 * vervangt; er volgt geen nieuwe poging tot de component opnieuw gemonteerd wordt. Geef een vaste functie op moduleniveau.
 */
export function useLuiDeel<T>(laad: () => Promise<T>, nodig: boolean): T | 'fout' | undefined {
  const [deel, setDeel] = useState<T | 'fout' | undefined>(undefined);
  useEffect(() => {
    if (!nodig || deel !== undefined) return;
    let weg = false;
    laad().then((m) => { if (!weg) setDeel(() => m); }, () => { if (!weg) setDeel('fout'); });
    return () => { weg = true; };
  }, [nodig, deel, laad]);
  return nodig ? deel : undefined;
}
