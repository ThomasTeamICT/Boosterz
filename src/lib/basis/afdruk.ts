// Afdrukken van een pagina in het basisdeel: wat achter een dichte uitklapper staat (details), moet op papier staan.
// Een doelpagina met 'Toon alle 22' en een twijfelzin onder 'Hoe zeker is dit?' verloor anders precies dat op papier.
// Bij 'beforeprint' gaat elke dichte details in de pagina open en krijgt ze data-afdruk; bij 'afterprint' sluit alleen wat
// wij openden. Wat de gebruiker al open had, blijft open; de stand van de pagina is na het afdrukken dezelfde. Schermen die
// de stand van een details onthouden (GoBijDoel, via de geschiedenis) laten een toggle met data-afdruk dus links liggen.

/** Het kleinste wat we van een details-element nodig hebben; zo test het zonder DOM. */
export interface DetailsLike {
  open: boolean;
  setAttribute(naam: string, waarde: string): void;
  removeAttribute(naam: string): void;
}
export interface WortelLike {
  querySelectorAll(kiezer: string): ArrayLike<DetailsLike>;
}

export const AFDRUK_ATTRIBUUT = 'data-afdruk';

/** Opent elke dichte details in de wortel en markeert ze; geeft terug hoeveel er openden. */
export function openVoorAfdruk(wortel: WortelLike): number {
  const dicht = Array.from(wortel.querySelectorAll('details:not([open])'));
  for (const d of dicht) {
    d.setAttribute(AFDRUK_ATTRIBUUT, '');
    d.open = true;
  }
  return dicht.length;
}

/** Sluit alleen de details die openVoorAfdruk opende en haalt de markering weg. */
export function sluitNaAfdruk(wortel: WortelLike): number {
  const geopend = Array.from(wortel.querySelectorAll(`details[${AFDRUK_ATTRIBUUT}]`));
  for (const d of geopend) {
    d.removeAttribute(AFDRUK_ATTRIBUUT);
    d.open = false;
  }
  return geopend.length;
}

/** Koppelt beide aan het venster; geeft de functie terug die ze loskoppelt. `wortel` wordt bij elke gebeurtenis opnieuw gevraagd. */
export function koppelAfdruk(venster: Pick<Window, 'addEventListener' | 'removeEventListener'>, wortel: () => WortelLike | null): () => void {
  const voor = () => {
    const w = wortel();
    if (w) openVoorAfdruk(w);
  };
  const na = () => {
    const w = wortel();
    if (w) sluitNaAfdruk(w);
  };
  venster.addEventListener('beforeprint', voor);
  venster.addEventListener('afterprint', na);
  return () => {
    venster.removeEventListener('beforeprint', voor);
    venster.removeEventListener('afterprint', na);
  };
}
