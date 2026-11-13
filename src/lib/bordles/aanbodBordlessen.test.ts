// Elke bordles in het aanbod bij de lesplannen (public/basis/aanbod/<lesplan>/*.json met "soort": "bordles")
// moet de controle van het lesformaat doorstaan. Zie docs/UITLEGVORMEN.md § 5.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BordlesConfig } from '../types';
import { valideerBordles } from './formaat';

const MAP = path.resolve(__dirname, '../../../public/basis/aanbod');

function bordlesBestanden(): string[] {
  if (!existsSync(MAP)) return [];
  const uit: string[] = [];
  for (const lesplan of readdirSync(MAP)) {
    const p = path.join(MAP, lesplan);
    if (!statSync(p).isDirectory()) continue;
    for (const f of readdirSync(p)) {
      if (!f.endsWith('.json')) continue;
      const inhoud = JSON.parse(readFileSync(path.join(p, f), 'utf8')) as { soort?: string };
      if (inhoud.soort === 'bordles') uit.push(path.join(p, f));
    }
  }
  return uit;
}

describe('bordlessen in het aanbod', () => {
  const bestanden = bordlesBestanden();
  it.each(bestanden.map((b) => [path.relative(MAP, b), b]))('%s doorstaat de controle', (_naam, bestand) => {
    const { config } = JSON.parse(readFileSync(bestand, 'utf8')) as { config: BordlesConfig };
    expect(valideerBordles(config).map((f) => `${f.pad}: ${f.melding}`)).toEqual([]);
  });
  it('heeft een bestand of meer, of nog geen aanbod', () => {
    expect(Array.isArray(bestanden)).toBe(true);
  });
});
