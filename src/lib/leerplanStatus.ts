// Nakijkstatus van een leerplan zoals de leerkracht ze ziet. De interne status blijft
// `gecontroleerd` (docs/LEERPLANNEN.md § 14); in de app heet dat "nagekeken", nooit "gecontroleerd".

import type { ControleStatus, Curriculum } from './curriculumTypes';
import { bewaakControle, controleStatus } from './curriculum';
import { formatDateShort } from './utils';

export const STATUS_LABEL: Record<ControleStatus, string> = {
  gecontroleerd: 'Nagekeken',
  gewijzigd: 'Gewijzigd na nakijken',
  'niet-gecontroleerd': 'Niet nagekeken',
};

/**
 * De status zoals de leerkracht ze moet zien, met dezelfde regel als bij bewaren en importeren
 * (`bewaakControle`): een leerplan dat als nagekeken is opgeslagen maar waarvan de doelen niet meer
 * bij de vingerafdruk van het nakijken passen (bv. een bestand dat buiten Boosterz is aangepast), of
 * dat helemaal geen vingerafdruk heeft, geldt als "gewijzigd". Zo blijft een slot nooit een leugen.
 */
export function effectieveStatus(cur: Curriculum): ControleStatus {
  return controleStatus(bewaakControle(cur));
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

/**
 * Bij het exporteren van een leerplan dat niet uit de officiële minimumdoelen komt: het leerplan van een net is
 * auteursrechtelijk beschermd en voor eigen gebruik ingelezen. Een officieel leerplan is vrij te delen.
 */
export const DEEL_HINT = 'Deel een leerplan van je net alleen met collega’s van je school.';
