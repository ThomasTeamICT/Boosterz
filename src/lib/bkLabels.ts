// De labels en de zin over een beroepskwalificatie die de leerplanpagina en de inleespagina nodig hebben (docs/STUDIERICHTINGEN.md
// § 23.7.5). Ze staan hier apart, **zonder imports**: ControleLabel en LeerplanInlezenPage halen er waarden uit, en wie ze uit
// `bkWeergave.ts` haalt, trekt de dekking, het leerplan en de studierichtingen mee in het bestand van die pagina's (bijna 55 kB
// extra op de pagina Leerplannen, voor een scherm waar geen enkele beroepskwalificatie op staat). Daarom: geen `import` in dit
// bestand. `bkWeergave.ts` voert de namen opnieuw uit, zodat al het andere zijn zinnen nog op één plaats vindt.

export const BK_LABEL_OFFICIEEL = 'Officiële beroepskwalificatie';
export const BK_LABEL_KOPIE = 'Kopie van een officiële beroepskwalificatie';

/** De zin op de inleespagina bij een BK-leerplan. */
export function bkInleesTekst(titel: string): string {
  return `${typeof titel === 'string' ? titel.trim() : ''} komt rechtstreeks uit een officiële beroepskwalificatie. Er valt niets in te lezen: de competenties staan letterlijk zoals in de officiële bron.`;
}
