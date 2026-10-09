// Dunne hooks voor de richtingschermen: ze laten `useLaadstand` de gegevens ophalen die `studierichtingenBron.ts` levert
// en bouwen er het kader mee. Alle logica zit in src/lib (en is daar getest).

import { bouwKader, type RichtingInfo, type RichtingKader, type RichtingKeuze } from '../../lib/richtingKader';
import {
  laadKaderGegevens,
  laadRichtingGegevens,
  type RichtingGegevens,
} from '../../lib/studierichtingenBron';
import type { RichtingDoelenBestand } from '../../lib/studierichtingen';
import { useLaadstand, type Laadstand } from '../../lib/useLaadstand';

/** Een belofte die nooit klaar komt: zolang er nog geen richting of keuze is, blijft de stand "laden". */
const NOOIT = new Promise<never>(() => {});

/** De matrix, de index van de koppeling en de index met minimumdoelen, één keer geladen. `koppeling` is `null` als ze nog niet is opgehaald. */
export function useRichtingGegevens(): { stand: Laadstand<RichtingGegevens>; opnieuw: () => void } {
  return useLaadstand('richting-gegevens', laadRichtingGegevens);
}

/**
 * Het kader van een richting en een keuze (jaar, soort onderwijs). Zolang `info` of `keuze` ontbreekt, blijft de stand
 * "laden". Een andere richting, een ander jaar of een ander soort begint meteen weer bij "laden".
 */
export function useRichtingKader(
  info: RichtingInfo | undefined,
  keuze: RichtingKeuze | undefined,
): { stand: Laadstand<{ bestand: RichtingDoelenBestand | null; kader: RichtingKader }>; opnieuw: () => void } {
  const sleutel = info && keuze ? `kader|${keuze.groep}|${keuze.jaar ?? ''}|${keuze.soort}|${keuze.onderdeel ?? ''}` : 'kader|leeg';
  // `useLaadstand` onthoudt de nieuwste functie, dus ze hoeft niet gememoriseerd te worden.
  return useLaadstand(sleutel, async () => {
    if (!info || !keuze) return NOOIT;
    const { regel, bestand, index } = await laadKaderGegevens(info.groep.nummer);
    return { bestand, kader: bouwKader(bestand, regel, index.sets, keuze, info) };
  });
}
