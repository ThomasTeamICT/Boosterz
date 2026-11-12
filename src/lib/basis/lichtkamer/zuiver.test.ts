// Bewaking: de lichtlogica blijft zuiver. Geen three.js, geen DOM, geen opslag, geen klok, geen toeval.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MAP = path.dirname(fileURLToPath(import.meta.url));
const BRONNEN = readdirSync(MAP).filter((n) => /\.ts$/.test(n) && !/\.test\./.test(n));

/** De tekst zonder commentaar, zodat een woord in een uitleg niet telt. */
function zonderCommentaar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('lichtkamer: zuivere code', () => {
  it('er zijn bronbestanden om te controleren', () => {
    expect(BRONNEN).toEqual(expect.arrayContaining(['schaduw.ts', 'rondes.ts', 'kaartjes.ts', 'meting.ts', 'onderzoek.ts', 'checks.ts', 'index.ts']));
  });

  for (const naam of BRONNEN) {
    describe(naam, () => {
      const tekst = zonderCommentaar(readFileSync(path.join(MAP, naam), 'utf8'));
      it('importeert alleen uit de eigen map', () => {
        const imports = [...tekst.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
        for (const i of imports) expect(i.startsWith('./'), `${naam} importeert ${i}`).toBe(true);
        expect(imports.some((i) => /three/i.test(i))).toBe(false);
      });
      it('raakt het DOM, de opslag, de klok en het toeval niet aan', () => {
        for (const verboden of [/\bdocument\b/, /\bwindow\b/, /\bnavigator\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bDate\b/, /\bMath\.random\b/, /\bperformance\b/, /\bTHREE\b/, /\brequestAnimationFrame\b/]) {
          expect(verboden.test(tekst), `${naam}: ${verboden}`).toBe(false);
        }
      });
    });
  }
});
