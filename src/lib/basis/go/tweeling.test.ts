import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../../minimumdoelen';
import { bubaoSetVan } from './tweeling';

const INDEX = (JSON.parse(readFileSync(new URL('../../../../public/leerplannen/minimumdoelen/index.json', import.meta.url), 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;

describe('bubaoSetVan: de tweeling van een gewone set in het buitengewoon', () => {
  const kaart = bubaoSetVan(INDEX);

  it('29 gewone sets hebben precies één tweeling', () => {
    expect(kaart.size).toBe(29);
  });

  it('legt ODS_3408 op ODS_3469 en ODS_3410 op ODS_3460', () => {
    expect(kaart.get('ODS_3408')).toBe('ODS_3469');
    expect(kaart.get('ODS_3410')).toBe('ODS_3460');
  });

  it('wijst nooit naar een set die niet bestaat, en nooit naar zichzelf', () => {
    const ids = new Set(INDEX.map((s) => s.id));
    for (const [gewoon, buso] of kaart) {
      expect(ids.has(buso), buso).toBe(true);
      expect(buso).not.toBe(gewoon);
    }
  });

  it('een lege index geeft een lege kaart', () => {
    expect(bubaoSetVan([]).size).toBe(0);
  });
});
