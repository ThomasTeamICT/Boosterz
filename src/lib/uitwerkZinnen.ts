// De eerlijke dekkingszin: uitgewerkt, gepland of nog niet (docs/NIEUWE-CURSUS.md § 2.2, punt 1).
//
// `computeCoverage` telt een doel als gedekt zodra een gewone sectie zijn code draagt, ook als die sectie nog leeg is (een vers
// geraamte heeft alleen een callout met de doelen). Daardoor zei de weergave "Leerplan" "Dekkend: alle 6 doelen komen aan bod"
// en het cursuskaartje "Dekking 100% (6/6)" bij een cursus waarin nog niets geschreven staat. De rekenregel blijft zoals ze
// is; deze zinnen splitsen het gedekte deel in "uitgewerkt" en "gepland" met `geplandeRijen` (coverage.ts).
//
// Puur: geen React, geen opslag. Het bestand is licht, want de cursuseditor en de cursuslijst laden het allebei.

/** Wat de zinnen nodig hebben: `total` en `covered` uit `computeCoverage`, en het aantal rijen van `geplandeRijen`. */
export interface UitwerkTelling {
  /** Alle doelen van het leerplan. */
  totaal: number;
  /** Doelen op een gewone sectie met inhoud, of met een ingebedde oefening. */
  uitgewerkt: number;
  /** Doelen die alleen op nog lege secties staan. */
  gepland: number;
  /** Doelen die in geen enkele gewone sectie staan (ook doelen die alleen in een keuzesectie staan). */
  open: number;
}

/** Een aantal als geheel getal van 0 of meer: een ongeldig of negatief aantal wordt 0, zodat er nooit "-1 doelen" staat. */
function geheel(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * De drie aantallen uit het resultaat van `computeCoverage` (`total`, `covered`) en het aantal geplande doelen
 * (`geplandeRijen(result, course).length`). Het geplande deel ligt altijd binnen het gedekte deel: een kapotte invoer geeft
 * dus nooit meer uitgewerkte, geplande of open doelen dan er doelen zijn.
 */
export function uitwerkTelling(result: { total: number; covered: number }, gepland: number): UitwerkTelling {
  const totaal = geheel(result.total);
  const gedekt = Math.min(geheel(result.covered), totaal);
  const g = Math.min(geheel(gepland), gedekt);
  return { totaal, uitgewerkt: gedekt - g, gepland: g, open: totaal - gedekt };
}

/**
 * Het percentage uitgewerkt, als geheel getal. Het is nooit 100 zolang er een doel niet uitgewerkt is (een afronding van
 * 99,6 telt als 99): "100 %" moet betekenen dat er niets meer te doen is. Zonder doelen is het 0.
 */
export function uitwerkPercent(t: Pick<UitwerkTelling, 'totaal' | 'uitgewerkt'>): number {
  const totaal = geheel(t.totaal);
  const uitgewerkt = Math.min(geheel(t.uitgewerkt), totaal);
  if (totaal === 0) return 0;
  const p = Math.round((uitgewerkt / totaal) * 100);
  return uitgewerkt < totaal && p >= 100 ? 99 : p;
}

/**
 * De zin in de weergave "Leerplan" van de Doelendekking (vet, en voorgelezen als hij verandert):
 * - alles uitgewerkt: "Alle 6 doelen zijn uitgewerkt." (bij één doel "Het enige doel is uitgewerkt.");
 * - anders: "2 van de 6 doelen zijn uitgewerkt. 3 staan gepland (de sectie is nog leeg), 1 nog niet." (bij één "1 van de 6
 *   doelen is uitgewerkt", "1 staat gepland"). Wat 0 is, valt weg: "4 van de 6 doelen zijn uitgewerkt. 2 nog niet.";
 * - één doel in het leerplan: "Het enige doel staat gepland (de sectie is nog leeg)." of "Het enige doel is nog niet uitgewerkt.";
 * - geen doelen: "Dit leerplan bevat nog geen doelen."
 */
export function uitwerkZin(t: UitwerkTelling): string {
  const { totaal, uitgewerkt, gepland, open } = t;
  if (totaal <= 0) return 'Dit leerplan bevat nog geen doelen.';
  if (totaal === 1) {
    if (uitgewerkt === 1) return 'Het enige doel is uitgewerkt.';
    return gepland === 1
      ? 'Het enige doel staat gepland (de sectie is nog leeg).'
      : 'Het enige doel is nog niet uitgewerkt.';
  }
  if (uitgewerkt >= totaal) return `Alle ${totaal} doelen zijn uitgewerkt.`;
  const eerste = uitgewerkt === 1
    ? `1 van de ${totaal} doelen is uitgewerkt.`
    : `${uitgewerkt} van de ${totaal} doelen zijn uitgewerkt.`;
  const rest: string[] = [];
  if (gepland > 0) rest.push(gepland === 1 ? '1 staat gepland (de sectie is nog leeg)' : `${gepland} staan gepland (de sectie is nog leeg)`);
  if (open > 0) rest.push(`${open} nog niet`);
  return rest.length === 0 ? eerste : `${eerste} ${rest.join(', ')}.`;
}

/**
 * De korte tekst op het cursuskaartje: "42 % uitgewerkt" en, als er doelen gepland staan, "42 % uitgewerkt · 3 gepland".
 * Zonder doelen in het leerplan: "Nog geen doelen in het leerplan".
 */
export function uitwerkKaartje(t: UitwerkTelling): string {
  if (t.totaal <= 0) return 'Nog geen doelen in het leerplan';
  const basis = `${uitwerkPercent(t)} % uitgewerkt`;
  return t.gepland > 0 ? `${basis} · ${t.gepland} gepland` : basis;
}

// ── De tabel van de weergave "Leerplan": status per doel en de regel eronder ──

/** De status van een rij in de tabel: `computeCoverage` kent geen 'planned'; dat komt uit `geplandeRijen` (§ 14.5). */
export type RijStatus = 'covered' | 'planned' | 'optional' | 'missing';

/**
 * De status die de tabel toont: een gedekt doel dat alleen op nog lege secties staat (zijn id zit in `gepland`, de
 * doel-id's van `geplandeRijen`) is 'planned', niet 'covered'. De andere statussen blijven zoals `computeCoverage` ze gaf.
 */
export function rijStatus(row: { status: 'covered' | 'optional' | 'missing'; goal: { id: string } }, gepland: ReadonlySet<string>): RijStatus {
  return row.status === 'covered' && gepland.has(row.goal.id) ? 'planned' : row.status;
}

/**
 * De regel onder de tabel als geen doel meer ontbreekt of alleen in verdieping staat. Alleen als ook alles uitgewerkt is,
 * staat er "Alle doelen van dit leerplan komen aan bod in een gewone sectie."; staan er nog doelen gepland, dan
 * "Alle doelen staan op een gewone sectie; 2 daarvan staan nog gepland (de sectie is nog leeg)." (bij één "1 daarvan staat nog gepland").
 */
export function alleDoelenRegel(gepland: number): string {
  const n = geheel(gepland);
  if (n === 0) return 'Alle doelen van dit leerplan komen aan bod in een gewone sectie.';
  const deel = n === 1 ? '1 daarvan staat nog gepland' : `${n} daarvan staan nog gepland`;
  return `Alle doelen staan op een gewone sectie; ${deel} (de sectie is nog leeg).`;
}
