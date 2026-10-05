// Graad en stroom van een leerplan: de keuzes in de inleeswizard en het lezen van een vrij niveau
// ("1e graad A-stroom"). Apart en klein, zodat de leerplannenpagina ze kan gebruiken zonder de hele
// leesmachine van de wizard mee te laden.

/** Zoals de graad in de index van de officiële minimumdoelen heet. */
export const GRAAD_OPTIES = ['1ste graad', '2de graad', '3de graad'] as const;
export const STROOM_OPTIES = ['A-stroom', 'B-stroom'] as const;

/** "1ste graad A-stroom"; leeg als er geen graad en geen stroom is. */
export function niveauTekst(graad: string, stroom: string): string {
  return [graad, stroom].map((t) => t.trim()).filter(Boolean).join(' ');
}

/**
 * Graad en stroom uit een vrij niveau als "1e graad A-stroom" of "1ste graad, A stroom". Wat niet te
 * lezen is ("3e leerjaar"), blijft leeg.
 */
export function leesNiveau(level: string): { graad: string; stroom: string } {
  const graad = /(\d)\s*(?:ste|de|e)?\s*graad/i.exec(level)?.[1];
  const stroom = /(?<![\p{L}\d])([AB])[\s-]*stroom/iu.exec(level)?.[1];
  return {
    graad: graad === '1' ? '1ste graad' : graad === '2' ? '2de graad' : graad === '3' ? '3de graad' : '',
    stroom: stroom ? `${stroom.toUpperCase()}-stroom` : '',
  };
}
