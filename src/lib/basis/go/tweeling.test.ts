import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../../minimumdoelen';
import { basisSet, tweelingSets } from '../moment';
import { bubaoSetVan } from './tweeling';

const INDEX = (JSON.parse(readFileSync(new URL('../../../../public/leerplannen/minimumdoelen/index.json', import.meta.url), 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;

describe('bubaoSetVan: de tweeling van een gewone set in het buitengewoon', () => {
  const kaart = bubaoSetVan(INDEX);

  // Geen vaste aantallen of paren hier: die staan in src/lib/basis/go.echt.test.ts, zodat een nieuwe set bij de
  // maandelijkse ophaling (GEGEVENSRUN=1) deze test niet laat falen.
  it('bevat precies de nieuwe gewone sets met één tweeling, telkens met die tweeling', () => {
    expect(kaart.size).toBeGreaterThan(0);
    for (const kop of INDEX) {
      const info = basisSet(kop);
      const tweeling = info && info.soort === 'bao' && info.generatie === 'nieuw' ? tweelingSets(info, INDEX) : [];
      if (tweeling.length === 1) expect(kaart.get(kop.id), kop.id).toBe(tweeling[0].id);
      else expect(kaart.has(kop.id), kop.id).toBe(false);
    }
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
