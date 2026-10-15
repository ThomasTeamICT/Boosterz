// De titel van een oefening zoals een leerling ze ziet. Voorbeeldmateriaal heet voor de leerkracht "Voorbeeld: quiz over
// België" of "Sjabloon: …" (zie startData.ts): dat voorvoegsel helpt de leerkracht om voorbeelden te herkennen, maar
// een leerling hoort het niet te zien.

const VOORVOEGSEL = /^\s*(?:Voorbeeld|Sjabloon)\s*:\s*/i;

/** De titel zonder "Voorbeeld:" of "Sjabloon:" vooraan. Blijft er niets over, dan blijft de titel zoals ze is. */
export function titelVoorLeerling(titel: string): string {
  if (typeof titel !== 'string') return '';
  const kort = titel.replace(VOORVOEGSEL, '').trim();
  return kort === '' ? titel : kort;
}
