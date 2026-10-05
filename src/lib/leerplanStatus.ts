// Nakijkstatus van een leerplan zoals de leerkracht ze ziet. De interne status blijft
// `gecontroleerd` (docs/LEERPLANNEN.md § 14); in de app heet dat "nagekeken", nooit "gecontroleerd".

import type { ControleStatus, Curriculum } from './curriculumTypes';
import { controleStatus, doelenVingerafdruk } from './curriculum';
import { formatDateShort } from './utils';

export const STATUS_LABEL: Record<ControleStatus, string> = {
  gecontroleerd: 'Nagekeken',
  gewijzigd: 'Gewijzigd na nakijken',
  'niet-gecontroleerd': 'Niet nagekeken',
};

/**
 * De status zoals de leerkracht ze moet zien. Een leerplan dat als nagekeken is opgeslagen maar
 * waarvan de doelen niet meer bij de vingerafdruk van het nakijken passen (bv. een bestand dat
 * buiten Boosterz is aangepast), geldt als "gewijzigd": zo blijft een slot nooit een leugen.
 * Zonder vingerafdruk valt er niets te vergelijken en geldt de opgeslagen status.
 */
export function effectieveStatus(cur: Curriculum): ControleStatus {
  const status = controleStatus(cur);
  const vingerafdruk = cur.controle?.doelenSha256;
  if (status === 'gecontroleerd' && vingerafdruk !== undefined && vingerafdruk !== doelenVingerafdruk(cur.goals)) return 'gewijzigd';
  return status;
}

/** "Nagekeken door Boosterz (officiële bron) op 05 okt. 2026"; velden die ontbreken vallen weg. */
export function nagekekenTekst(cur: Curriculum): string {
  const { door, op } = cur.controle ?? {};
  return ['Nagekeken', door ? `door ${door}` : '', op ? `op ${formatDateShort(op)}` : ''].filter(Boolean).join(' ');
}

/** Komt dit leerplan uit de officiële minimumdoelen (laag 1)? */
export function isOfficieel(cur: Curriculum): boolean {
  return cur.herkomst?.methode === 'officieel';
}
