// Bewaking (LK-5): three komt nergens statisch binnen. Alleen `import type` (verdwijnt bij het bouwen) en import() in
// de 3D-motor van de kijkdoos. Zo kan three nooit in vendor, het BasisDeel-chunk of op het leerlingpad belanden; de
// buildcontrole checkThreeChunks (src/lib/swBuild.ts) kijkt hetzelfde na in de echte bundel.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HIER, '../../..');

function bestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const vol = path.join(map, naam);
    if (statSync(vol).isDirectory()) uit.push(...bestanden(vol));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(naam)) uit.push(vol);
  }
  return uit;
}

/** De tekst zonder commentaar, zodat een woord in een uitleg niet telt. */
function zonderCommentaar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

const THREE = /^three(?:\/|$)/;

type Vondst = { soort: 'statisch' | 'type' | 'dynamisch'; bron: string };

/** Alle verwijzingen naar three in een bronbestand, met hun soort. */
function verwijzingenNaarThree(code: string): Vondst[] {
  const t = zonderCommentaar(code);
  const uit: Vondst[] = [];
  // import ... from '...' en export ... from '...' (ook over meerdere regels)
  for (const m of t.matchAll(/\b(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const bron = m[4] as string;
    if (!THREE.test(bron)) continue;
    // `import { type A, type B } from 'three'` verdwijnt ook volledig bij het bouwen
    const alleenTypes = !!m[2] || /^\{\s*(?:type\s+\w+(?:\s+as\s+\w+)?\s*,?\s*)+\}$/.test((m[3] as string).trim());
    uit.push({ soort: alleenTypes ? 'type' : 'statisch', bron });
  }
  // import '...' (alleen voor het neveneffect)
  for (const m of t.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) if (THREE.test(m[1] as string)) uit.push({ soort: 'statisch', bron: m[1] as string });
  // import('...'), ook typeof import('...') in een type
  for (const m of t.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (THREE.test(m[1] as string)) uit.push({ soort: 'dynamisch', bron: m[1] as string });
  // require('three')
  for (const m of t.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (THREE.test(m[1] as string)) uit.push({ soort: 'statisch', bron: m[1] as string });
  return uit;
}

describe('three komt nergens statisch binnen', () => {
  const alle = bestanden(SRC).filter((f) => !/\.test\.[tj]sx?$/.test(f));

  it('er zijn bronbestanden, en de kijkdoos is erbij', () => {
    expect(alle.length).toBeGreaterThan(100);
    expect(alle.some((f) => f.endsWith(path.join('components', 'basis', 'kijkdoos', 'kijkdoos3d.ts')))).toBe(true);
  });

  it('geen enkel bestand in src/ importeert three statisch', () => {
    const fout: string[] = [];
    for (const f of alle) {
      for (const v of verwijzingenNaarThree(readFileSync(f, 'utf8'))) if (v.soort === 'statisch') fout.push(`${path.relative(SRC, f)}: ${v.bron}`);
    }
    expect(fout).toEqual([]);
  });

  it('import() van three staat alleen in de 3D-motor van de kijkdoos', () => {
    const plekken = new Set<string>();
    for (const f of alle) {
      for (const v of verwijzingenNaarThree(readFileSync(f, 'utf8'))) if (v.soort === 'dynamisch') plekken.add(path.relative(SRC, f));
    }
    expect([...plekken]).toEqual([path.join('components', 'basis', 'kijkdoos', 'kijkdoos3d.ts')]);
  });

  it('de gevel van de kijkdoos (index.ts) noemt three niet, zelfs niet als type', () => {
    const gevel = readFileSync(path.join(HIER, 'index.ts'), 'utf8');
    expect(verwijzingenNaarThree(gevel)).toEqual([]);
  });

  it('de lezer herkent elke vorm', () => {
    expect(verwijzingenNaarThree("import * as THREE from 'three';")).toEqual([{ soort: 'statisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("import { Mesh } from 'three';")).toEqual([{ soort: 'statisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("import {\n  Mesh,\n  Group,\n} from 'three';")).toEqual([{ soort: 'statisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("import 'three';")).toEqual([{ soort: 'statisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("export { Mesh } from 'three';")).toEqual([{ soort: 'statisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("import { X } from 'three/examples/jsm/x.js';")).toEqual([{ soort: 'statisch', bron: 'three/examples/jsm/x.js' }]);
    expect(verwijzingenNaarThree("const T = require('three');")).toEqual([{ soort: 'statisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("import type * as THREE from 'three';")).toEqual([{ soort: 'type', bron: 'three' }]);
    expect(verwijzingenNaarThree("import { type Mesh, type Group as G } from 'three';")).toEqual([{ soort: 'type', bron: 'three' }]);
    expect(verwijzingenNaarThree("const T = await import('three');")).toEqual([{ soort: 'dynamisch', bron: 'three' }]);
    expect(verwijzingenNaarThree("// import * as THREE from 'three';\n/* import 'three' */")).toEqual([]);
    expect(verwijzingenNaarThree("import { x } from './three';")).toEqual([]);
    expect(verwijzingenNaarThree("import { x } from 'threejs-helper';")).toEqual([]);
  });
});
