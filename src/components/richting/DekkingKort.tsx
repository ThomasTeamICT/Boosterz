// De dekking van een richting in één regel, voor het overzicht "Mijn richtingen" en voor de klas (docs/STUDIERICHTINGEN.md
// § 22.5). De props liggen vast (pakket B2 maakt de echte versie; B3 gebruikt ze in de klas). Deze component wordt lui
// geladen: de berekening vraagt de setbestanden van het kader.

import type { SoortKeuze } from '../../lib/richtingKader';

export interface DekkingKortProps {
  groep: string;
  soort: SoortKeuze;
  /** 'rij' wacht op zichtbaarheid en op zijn beurt; 'klas' rekent meteen (in een open details). */
  plaats: 'rij' | 'klas';
  /** Voor de sr-only bij "Opnieuw proberen". */
  titel: string;
}

/** Tijdelijk (I-A): toont alleen dat de dekking berekend wordt. */
export function DekkingKort(_props: DekkingKortProps) {
  return <p className="hint">De dekking wordt berekend…</p>;
}

export default DekkingKort;
