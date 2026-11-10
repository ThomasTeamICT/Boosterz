// Bewaking: geen lookbehind in de broncode. Safari en iPadOS vóór 16.4 kennen geen lookbehind in reguliere
// expressies; een chunk met zo'n expressie geeft daar bij het laden een SyntaxError, en dan opent het hele
// scherm niet (oudere iPads die niet verder kunnen dan iPadOS 15 zijn gewoon in de klas). Hoe het zonder
// kan: zie tekenErvoor.ts. Tests mogen lookbehind wel gebruiken (ze lopen in Node, niet in de browser).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOOKBEHIND = /\(\?<[=!]/;

/** Alle bronbestanden onder src/ die in de browser terechtkomen: .ts, .tsx, .js en .mjs, zonder tests. */
function bronbestanden(dir: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(dir)) {
    const pad = path.join(dir, naam);
    if (statSync(pad).isDirectory()) uit.push(...bronbestanden(pad));
    else if (/\.(ts|tsx|js|mjs)$/.test(naam) && !/\.test\./.test(naam) && !naam.endsWith('.d.ts')) uit.push(pad);
  }
  return uit;
}

/** "bestand:regel: tekst" voor elke regel met een lookbehind. */
function plaatsenMetLookbehind(bestand: string, tekst: string): string[] {
  return tekst.split('\n').flatMap((regel, i) => (LOOKBEHIND.test(regel) ? [`${bestand}:${i + 1}: ${regel.trim()}`] : []));
}

describe('geen lookbehind in src/ (Safari en iPadOS vóór 16.4)', () => {
  it('vindt een lookbehind, met bestand en regel', () => {
    const positief = 'const a = 1;\n  const re = /(?<![a-z])x/u;\n';
    expect(plaatsenMetLookbehind('voorbeeld.ts', positief)).toEqual(['voorbeeld.ts:2: const re = /(?<![a-z])x/u;']);
    expect(plaatsenMetLookbehind('voorbeeld.ts', "new RegExp('(?<=\\\\.)b')")).toHaveLength(1);
    // een benoemde groep is geen lookbehind
    expect(plaatsenMetLookbehind('voorbeeld.ts', 'const re = /(?<jaar>\\d{4})/;')).toEqual([]);
  });

  it('geen enkel bronbestand bevat een lookbehind', () => {
    const bestanden = bronbestanden(SRC);
    expect(bestanden.length).toBeGreaterThan(200);
    const gevonden = bestanden.flatMap((f) => plaatsenMetLookbehind(path.relative(path.dirname(SRC), f), readFileSync(f, 'utf8')));
    expect(
      gevonden,
      `Lookbehind gevonden; Safari en iPadOS vóór 16.4 laden die chunk niet. Herschrijf zonder lookbehind (zie src/lib/tekenErvoor.ts):\n${gevonden.join('\n')}`,
    ).toEqual([]);
  });
});
