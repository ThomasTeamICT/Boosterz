// De keuze van de competenties in het venster "Nieuwe cursus" (docs/STUDIERICHTINGEN.md § 23.7.3): per beroepskwalificatie
// een fieldset met "Alle <n> competenties" en "Kies zelf de competenties". Dit bestand zit in een lui chunk.
//
// GERAAMTE (I2): S2 bouwt de keuze uit en mag deze props aanvullen (het venster is ook van S2). Tot dan toont ze niets.

import type { BkBestand } from '../../../lib/beroepskwalificaties';
import type { RichtingBk } from '../../../lib/richtingBk';

export interface BkKeuzeProps {
  /** Het BK-kader van de richting (met minstens één BK). */
  bk: RichtingBk;
  /** De geladen bestanden, per BK-versie. Een BK zonder bestand is niet te kiezen. */
  bestanden: ReadonlyMap<string, BkBestand>;
  /** Per BK-versie de gekozen competentiecodes, altijd als lijst (nooit "alle"). Een BK zonder keuze staat er niet in. */
  keuze: ReadonlyMap<string, readonly string[]>;
  onKeuze: (keuze: Map<string, string[]>) => void;
}

export function BkKeuze(_props: BkKeuzeProps) {
  return null;
}
