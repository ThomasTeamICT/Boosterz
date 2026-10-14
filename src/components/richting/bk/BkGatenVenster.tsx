// Het venster "Plan de competenties die nog nergens aan bod komen" op de richtingpagina (docs/STUDIERICHTINGEN.md § 24.6.3):
// in een nieuwe cursus (met een nagekeken leerplan met precies de gekozen competenties) of in een cursus die je al hebt (er
// komen alleen secties bij; een leerplan wordt nooit aangepast). Dit bestand zit in een lui chunk: BkDekking laadt het pas
// bij de klik op de knop.
//
// GERAAMTE (3b-I1): 3b-S2 bouwt dit uit. De props liggen vast; tot dan toont het niets.

import type { BkBestand } from '../../../lib/beroepskwalificaties';
import type { CursusBijdrage, MdDekking } from '../../../lib/dekkingMinimumdoelen';
import type { RichtingBk } from '../../../lib/richtingBk';
import type { RichtingInfo, RichtingKeuze } from '../../../lib/richtingKader';

export interface BkGatenVensterProps {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  /** De dekking zoals ze op het scherm stond toen de leerkracht op de knop klikte: het venster werkt met die momentopname. */
  gegevens: {
    kader: RichtingBk;
    dekking: MdDekking;
    bijdragen: readonly CursusBijdrage[];
    bestanden: ReadonlyMap<string, BkBestand>;
    /** De namen van de beroepskwalificaties voor het scherm (twee met dezelfde titel onderscheiden). */
    namen: ReadonlyMap<string, string>;
    /** Het jaar waartoe de telling beperkt is (bij "Alleen het <jaar>"). */
    telJaar?: number;
  };
  onClose(): void;
  /** Na het bewaren: de dekking rekent opnieuw. */
  onGepland(): void;
}

export function BkGatenVenster(_props: BkGatenVensterProps) {
  return null;
}
