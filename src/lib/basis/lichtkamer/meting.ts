// Het lezen van een meting uit een tekstveld. Kinderen typen '12,5' of '12.5': allebei zijn 12,5.
// Het prototype gebruikte type="number"; Chromium maakt daar van '12,5' de waarde '125'. Hier nooit.

/**
 * Leest een meting in centimeters. Toegelaten: cijfers met hoogstens één komma of punt, met spaties
 * ervoor of erna en eventueel 'cm' erachter ('12', '12,5', '12.5', ' 12,5 cm ', ',5', '12,').
 * Alles anders geeft null: leeg, letters, twee scheidingstekens, een min, een exponent, een spatie
 * midden in het getal.
 */
export function leesMeting(tekst: unknown): number | null {
  if (typeof tekst === 'number') return Number.isFinite(tekst) && tekst >= 0 ? tekst : null;
  if (typeof tekst !== 'string') return null;
  const t = tekst.trim().replace(/\s*cm$/i, '').trim();
  const m = /^(\d*)[.,]?(\d*)$/.exec(t);
  if (!m) return null;
  const hele = m[1] ?? '';
  const deel = m[2] ?? '';
  if (!hele && !deel) return null;
  // de scheiding mag hoogstens één keer voorkomen: de regex laat dat al niet anders toe
  const getal = Number(`${hele || '0'}.${deel || '0'}`);
  return Number.isFinite(getal) ? getal : null;
}
