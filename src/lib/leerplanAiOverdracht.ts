// De overgang van de inleeswizard naar het AI-venster van de leerplannenpagina.
//
// Vindt de wizard geen doelen, dan kan de leerkracht "Laat de AI het proberen" kiezen. De leerplannenpagina
// opent dan het AI-venster voor een nieuw leerplan, al ingevuld met de tekst en de keuzes uit stap 1, zodat
// niets opnieuw getypt of geplakt moet worden. Het gaat mee in de routerstate (nergens bewaard; bij een
// herlaad is het weg). Een lichte module, zodat de leerplannenpagina ze kan lezen zonder de wizard mee te laden.

import type { CurriculumNet } from './curriculumTypes';
import { CURRICULUM_NETS } from './curriculumTypes';
import { niveauTekst } from './leerplanNiveau';

/** Waar de AI-weg zit: de leerplannenpagina opent dan het AI-venster voor een nieuw leerplan. */
export const AI_NIEUW_ROUTE = '/leerplannen?ai=nieuw';

/** Wat het AI-venster vooraf invult. Alles is optioneel; wat ontbreekt, blijft leeg. */
export interface AiVoorinvulling {
  text: string;
  title: string;
  net: CurriculumNet;
  subject: string;
  level: string;
  source: string;
}

/** De sleutel in de routerstate. */
export const AI_VOORINVULLING_SLEUTEL = 'aiVoorinvulling';

interface KeuzeVoorAI {
  net: CurriculumNet | '';
  vak: string;
  graad: string;
  stroom: string;
  titel: string;
}

/** De voorinvulling uit stap 1 (de keuzes) en stap 2 (de tekst en de naam van de pdf, als er een is). */
export function maakAiVoorinvulling(keuze: KeuzeVoorAI, bron: { tekst: string; bronNaam?: string } | null): AiVoorinvulling {
  return {
    text: bron?.tekst ?? '',
    title: keuze.titel.trim(),
    net: keuze.net === '' ? 'eigen' : keuze.net,
    subject: keuze.vak.trim(),
    level: niveauTekst(keuze.graad, keuze.stroom),
    source: bron?.bronNaam?.trim() ?? '',
  };
}

function tekst(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Leest de voorinvulling uit de routerstate van een navigatie. Defensief: de state komt uit de geschiedenis van de
 * browser en kan alles zijn. Geeft `undefined` als er geen bruikbare voorinvulling in zit.
 */
export function leesAiVoorinvulling(state: unknown): AiVoorinvulling | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const ruw = (state as Record<string, unknown>)[AI_VOORINVULLING_SLEUTEL];
  if (!ruw || typeof ruw !== 'object') return undefined;
  const v = ruw as Record<string, unknown>;
  const net = CURRICULUM_NETS.find((n) => n.id === v.net)?.id ?? 'eigen';
  const uit: AiVoorinvulling = {
    text: tekst(v.text),
    title: tekst(v.title),
    net,
    subject: tekst(v.subject),
    level: tekst(v.level),
    source: tekst(v.source),
  };
  return uit.text.trim() === '' && uit.title === '' && uit.subject === '' ? undefined : uit;
}
