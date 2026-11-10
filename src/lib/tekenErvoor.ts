// ── Het teken vóór een treffer, zonder lookbehind ───────────────────────────
//
// Safari en iPadOS vóór 16.4 kennen geen lookbehind in reguliere expressies. Een chunk met zo'n
// expressie geeft daar bij het laden een SyntaxError, en dan opent het hele scherm niet. Oudere iPads
// (die niet verder kunnen dan iPadOS 15) zijn gewoon in de klas. Daarom staat er in src/ geen
// lookbehind (bewaakt door geenLookbehind.test.ts). Waar een treffer niet vlak na een bepaald teken
// mag beginnen en de plaats of de volgende treffer ertoe doet, kijkt deze functie dat teken apart na.
// Bij een gewone `test()` volstaat een niet-vangende groep vooraan: `(?:^|[^…])`.

/**
 * De volgende treffer van `re` (vlag g, niet y) vanaf `re.lastIndex`, waarvoor het teken vlak vóór de
 * treffer niet op `verbodenErvoor` past. Precies wat `re` met een negatieve lookbehind vooraan zou
 * geven: dezelfde treffer, dezelfde groepen en daarna dezelfde `lastIndex` (0 als er niets meer is).
 *
 * `verbodenErvoor` is een tekenklasse gevolgd door `$`, zonder de vlaggen g en y, met dezelfde vlaggen
 * i en u als `re` (bv. `/[\p{L}\p{N}]$/iu`). Ze wordt getoetst op de laatste twee code-eenheden vóór de
 * treffer: met de vlag u telt een teken buiten het basisvlak (twee code-eenheden) zo als één teken,
 * net als in de lookbehind.
 */
export function volgendeTreffer(re: RegExp, tekst: string, verbodenErvoor: RegExp): RegExpExecArray | null {
  let m: RegExpExecArray | null;
  while ((m = re.exec(tekst)) !== null) {
    if (!verbodenErvoor.test(tekst.slice(Math.max(0, m.index - 2), m.index))) return m;
    // Zoals de expressie zelf: verder zoeken vanaf het volgende teken (met de vlag u: het volgende codepunt).
    re.lastIndex = m.index + (re.unicode && (tekst.codePointAt(m.index) ?? 0) > 0xffff ? 2 : 1);
  }
  return null;
}
