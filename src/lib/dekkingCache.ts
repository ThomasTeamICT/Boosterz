// Samenvatting van de dekking per richting, alleen in het geheugen (docs/STUDIERICHTINGEN.md § 22.5.2, punt 3).
//
// "Mijn richtingen" rekent de dekking per zichtbare rij, één richting tegelijk. Het detail van een richting rekent met
// "Alle jaren van de graad" hetzelfde en vult deze cache, zodat wie terugkeert naar de lijst het getal meteen ziet.
//
// - Sleutel: `kaderGroepSleutel(info, soort)`. In de 1ste graad rekenen 1A en 2A zo één keer.
// - Alleen getallen (`DekkingKortGetallen`), nooit een object uit de berekening, en nooit in localStorage: geen oud getal
//   na een herlading en geen risico bij een volle opslag.
// - Bij elke wijziging in de opslag van de app (`onStorageChange`: een cursus, een leerplan, een klas, een oefening, ook uit
//   een ander tabblad) vervalt alles. Het eerste gebruik meldt zich aan; er is geen afmelding nodig, want de cache leeft
//   zolang de pagina leeft.
//
// Een berekening die begon vóór een wijziging, mag haar uitkomst niet meer bewaren: wie rekent, onthoudt eerst
// `dekkingGeneratie()` en geeft die mee aan `bewaarDekkingKort`.

import type { DekkingKortGetallen } from './richtingOverzicht';
import { onStorageChange } from './storage';

/** Hoeveel richtingen hoogstens bewaard blijven (er zijn er een paar honderd in de matrix); de oudste valt weg. */
const MAX_INGANGEN = 400;

const cache = new Map<string, Readonly<DekkingKortGetallen>>();
let generatie = 0;
let aangemeld = false;

function meld(): void {
  if (aangemeld) return;
  aangemeld = true;
  onStorageChange(() => {
    generatie += 1;
    cache.clear();
  });
}

/** Het getal dat bij elke wijziging in de opslag omhoog gaat: voor wie rekent en pas later bewaart. */
export function dekkingGeneratie(): number {
  meld();
  return generatie;
}

/** De bewaarde getallen van deze sleutel, of `undefined` (nooit berekend, of vervallen door een wijziging). */
export function leesDekkingKort(sleutel: string): Readonly<DekkingKortGetallen> | undefined {
  meld();
  return cache.get(sleutel);
}

function getal(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Bewaart de getallen van een berekening (een kopie met alleen de vijf velden). Met `uitGeneratie` (de waarde van
 * `dekkingGeneratie()` bij het begin van de berekening) wordt een uitkomst genegeerd als er intussen iets in de opslag
 * veranderde. Geen getal in plaats van een getal: niets bewaard.
 */
export function bewaarDekkingKort(sleutel: string, d: DekkingKortGetallen, uitGeneratie?: number): void {
  meld();
  if (uitGeneratie !== undefined && uitGeneratie !== generatie) return;
  if (!getal(d.totaal) || !getal(d.gedekt) || !getal(d.gepland) || !getal(d.percent)) return;
  if (!cache.has(sleutel) && cache.size >= MAX_INGANGEN) {
    const oudste = cache.keys().next();
    if (!oudste.done) cache.delete(oudste.value);
  }
  cache.set(sleutel, Object.freeze({
    totaal: d.totaal, gedekt: d.gedekt, gepland: d.gepland, percent: d.percent, eersteGraad: d.eersteGraad === true,
  }));
}
