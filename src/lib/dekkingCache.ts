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
//
// Fase 3b (§ 24.4) zet er een tweede Map naast voor de korte regel over de competenties van de beroepskwalificaties
// (`BkKort`, `leesBkKort` en `bewaarBkKort`): dezelfde sleutel, dezelfde generatie, dezelfde grens en dezelfde leegmaak.
// De twee Maps raken elkaar nooit (I3): een BK-ingang verandert of verdringt geen MD-ingang, en omgekeerd.

import type { BkKort, DekkingKortGetallen } from './richtingOverzicht';
import { onStorageChange } from './storage';

/** Hoeveel richtingen hoogstens bewaard blijven (er zijn er een paar honderd in de matrix); de oudste valt weg. */
const MAX_INGANGEN = 400;

const cache = new Map<string, Readonly<DekkingKortGetallen>>();
const bkCache = new Map<string, Readonly<BkKort>>();
let generatie = 0;
let aangemeld = false;

function meld(): void {
  if (aangemeld) return;
  aangemeld = true;
  onStorageChange(() => {
    generatie += 1;
    cache.clear();
    bkCache.clear();
  });
}

/** Zet een ingang in een Map met hoogstens `MAX_INGANGEN`: een nieuwe sleutel verdringt de oudste, een bestaande niet. */
function zet<T>(map: Map<string, T>, sleutel: string, waarde: T): void {
  if (!map.has(sleutel) && map.size >= MAX_INGANGEN) {
    const oudste = map.keys().next();
    if (!oudste.done) map.delete(oudste.value);
  }
  map.set(sleutel, waarde);
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
  zet(cache, sleutel, Object.freeze({
    totaal: d.totaal, gedekt: d.gedekt, gepland: d.gepland, percent: d.percent, eersteGraad: d.eersteGraad === true,
  }));
}

// ── De competenties van de beroepskwalificaties (§ 24.4) ────────────────────

/** De bewaarde korte regel over de competenties van deze sleutel, of `undefined` (nooit berekend, of vervallen). */
export function leesBkKort(sleutel: string): Readonly<BkKort> | undefined {
  meld();
  return bkCache.get(sleutel);
}

/** Een kopie met alleen de bekende velden, of `undefined` als een getal geen getal is of de soort onbekend is. */
function schoonBkKort(k: BkKort): BkKort | undefined {
  if (!k || typeof k !== 'object' || !getal(k.bks)) return undefined;
  const titel = typeof k.titel === 'string' && k.titel.trim() !== '' ? { titel: k.titel } : {};
  if (k.soort === 'zonder-cursus') return { soort: 'zonder-cursus', bks: k.bks, ...titel };
  if (k.soort !== 'getallen') return undefined;
  if (!getal(k.totaal) || !getal(k.gedekt) || !getal(k.gepland) || !getal(k.zonderBestand)) return undefined;
  if (k.percent !== undefined && !getal(k.percent)) return undefined;
  return {
    soort: 'getallen', bks: k.bks, ...titel, totaal: k.totaal, gedekt: k.gedekt, gepland: k.gepland,
    ...(k.percent !== undefined ? { percent: k.percent } : {}), zonderBestand: k.zonderBestand,
  };
}

/**
 * Bewaart de korte regel van een berekening (een kopie met alleen de bekende velden). `sleutel` is
 * `kaderGroepSleutel(info, soort)`, zoals bij `bewaarDekkingKort`. Met `uitGeneratie` (de waarde van `dekkingGeneratie()`
 * bij het begin van de berekening) wordt een uitkomst genegeerd als er intussen iets in de opslag veranderde. Geen getal
 * in plaats van een getal, of een onbekende soort: niets bewaard.
 */
export function bewaarBkKort(sleutel: string, k: BkKort, uitGeneratie?: number): void {
  meld();
  if (uitGeneratie !== undefined && uitGeneratie !== generatie) return;
  const schoon = schoonBkKort(k);
  if (schoon) zet(bkCache, sleutel, Object.freeze(schoon));
}
