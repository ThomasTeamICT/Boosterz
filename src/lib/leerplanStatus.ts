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

/** Is dit leerplan een hele officiële set minimumdoelen (laag 1, "Gebruik als leerplan")? */
export function isOfficieel(cur: Curriculum): boolean {
  return cur.herkomst?.methode === 'officieel';
}

/** Is dit een eigen doelenlijst, samengesteld uit letterlijke doelen van één of meer officiële sets (doelenSamenstellen.ts)? */
export function isSamengesteld(cur: Curriculum): boolean {
  return cur.herkomst?.methode === 'samengesteld';
}

/**
 * Is dit een leerplan met de competenties van één of meer beroepskwalificaties, letterlijk uit de officiële bron
 * (bkLeerplan.ts, docs/STUDIERICHTINGEN.md § 23.6)? Ook een eigen kopie ervan houdt die methode.
 */
export function isBkLeerplan(cur: Curriculum): boolean {
  return cur.herkomst?.methode === 'beroepskwalificatie';
}

/**
 * Komen alle doelen letterlijk uit een officiële bron: een hele set minimumdoelen (`isOfficieel`), een samengestelde
 * lijst (`isSamengesteld`) of de competenties van beroepskwalificaties (`isBkLeerplan`)? Zo'n leerplan heeft de officiële
 * bron zelf als bron, en geen leerplan van een net.
 */
export function uitOfficieleBron(cur: Curriculum): boolean {
  return isOfficieel(cur) || isSamengesteld(cur) || isBkLeerplan(cur);
}

/**
 * Bij het exporteren van een leerplan dat niet uit de officiële minimumdoelen komt: het leerplan van een net is
 * auteursrechtelijk beschermd en voor eigen gebruik ingelezen. Een officieel leerplan is vrij te delen.
 */
export const DEEL_HINT = 'Deel een leerplan van je net alleen met collega’s van je school.';
