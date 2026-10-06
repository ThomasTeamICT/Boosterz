// Vaste, maar niet-verklappende volgorde voor de afdruk van een toets.
//
// De speler schudt koppel-, orden- en sorteervragen, en de grader neemt de
// ontwerpvolgorde als juist. Op papier moet de volgorde dus óók gehusseld zijn,
// anders staat het antwoord er gewoon. Omdat de afdruk bij elke render opnieuw
// opgebouwd wordt (en de leerkracht met en zonder sleutel afdrukt), moet de
// schudvolgorde per vraag vastliggen: zaad = het id van de vraag.

/** FNV-1a (32 bit) met een laatste menging, zodat gelijkaardige id's verschillend uitvallen. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Kleine zaadbare generator (mulberry32): getal in [0, 1). */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministische permutatie van `n` plaatsen. `perm[k]` is de index (in de
 * ontwerpvolgorde) van het item dat op afgedrukte plaats `k` staat.
 * Bij twee of meer items is het resultaat nooit de identiteit: valt de
 * schudbeurt toevallig samen met de ontwerpvolgorde, dan schuift alles één
 * plaats op. Bij 0 of 1 items valt er niets te schudden.
 */
export function printPermutation(n: number, seed: string): number[] {
  const perm = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  if (perm.length < 2) return perm;
  const rand = seededRandom(hashSeed(seed));
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  if (perm.every((v, k) => v === k)) return [...perm.slice(1), perm[0]];
  return perm;
}

/** De items in afgedrukte volgorde (zelfde permutatie als `printPermutation(items.length, seed)`). */
export function printOrdered<T>(items: readonly T[], seed: string): T[] {
  return printPermutation(items.length, seed).map((i) => items[i]);
}

/** Omgekeerde permutatie: `inverse[i]` is de afgedrukte plaats van het item met ontwerpindex `i`. */
export function inversePermutation(perm: readonly number[]): number[] {
  const inverse: number[] = new Array(perm.length);
  perm.forEach((designIndex, printed) => { inverse[designIndex] = printed; });
  return inverse;
}

/** Letter bij een plaats, zoals `list-style-type: lower-alpha`: a, b, … z, aa, ab, … */
export function placeLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

/**
 * Sleutel van een koppelvraag: voor elk linkeritem (ontwerpindex) de letter van
 * het juiste rechteritem in de afgedrukte rechterkolom.
 */
export function matchKeyLetters(perm: readonly number[]): string[] {
  return inversePermutation(perm).map(placeLetter);
}

/**
 * Sleutel van een ordenvraag: voor elk afgedrukt item (in afgedrukte volgorde)
 * de juiste plaats, geteld vanaf 1.
 */
export function orderKeyPlaces(perm: readonly number[]): number[] {
  return perm.map((designIndex) => designIndex + 1);
}
