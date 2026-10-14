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

/**
 * In de leerplaneditor, bij een BK-leerplan dat niet (meer) als nagekeken telt: een eigen kopie, of een leerplan waarvan de
 * doelen veranderden. Zo'n leerplan kan niet nagekeken worden met "Nakijken en bevestigen" (dat is voor leerplannen die je
 * inleest); een nagekeken leerplan met competenties maak je bij de studierichting.
 */
export const BK_EDITOR_NIET_NAGEKEKEN =
  'Dit leerplan volgt de competenties van een beroepskwalificatie, maar telt niet als nagekeken. Maak het leerplan opnieuw bij ‘Beroepskwalificaties’ bij de studierichting: het wordt dan meteen nagekeken bewaard.';

/** Achter "Dit leerplan telt daarom niet meer als nagekeken." als de doelen van een BK-leerplan veranderden. */
export const BK_EDITOR_GEWIJZIGD =
  ' Wil je weer de officiële competenties? Maak het leerplan opnieuw bij ‘Beroepskwalificaties’ bij de studierichting, of maak er bewust een eigen leerplan van.';

/** De knop naar de studierichting van het leerplan. */
export const BK_EDITOR_NAAR_RICHTING = 'Studierichting openen';
