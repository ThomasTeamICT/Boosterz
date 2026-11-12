// Voorlezen: welke stem we kiezen. Zuiver: de stemmen komen binnen als gewone lijst, de component haalt ze bij speechSynthesis.

export type StemInfo = { lang: string };

/** De taal waarin voorgelezen wordt: Vlaams Nederlands. */
export const VOORLEES_TAAL = 'nl-BE';

const isBelgisch = (lang: string): boolean => /^nl[-_]BE$/i.test(lang);
const isNederlands = (lang: string): boolean => /^nl([-_]|$)/i.test(lang);

/** Eerst een stem nl-BE, dan een stem nl (nl-NL of nl), anders geen: dan beslist de browser met de taal. */
export function kiesStem<T extends StemInfo>(stemmen: readonly T[]): T | null {
  return stemmen.find((s) => isBelgisch(s.lang)) ?? stemmen.find((s) => isNederlands(s.lang)) ?? null;
}
