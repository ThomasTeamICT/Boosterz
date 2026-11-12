import { describe, expect, it } from 'vitest';
import { basisRoute } from './basisRoutes';
import { schilVan } from './schil';

describe('schilVan', () => {
  it('het kind en het bord krijgen een kale schil, al de rest de schil van de leerkracht', () => {
    expect(schilVan(basisRoute('oefen/lichtkamer/einde-4de', ''))).toBe('kind');
    expect(schilVan(basisRoute('bord/lichtkamer/einde-4de', ''))).toBe('bord');
    for (const [splat, zoek] of [['pakket/lichtkamer/einde-4de', ''], ['', ''], ['go', ''], ['doel/ODS_3408/92767', ''], ['xyz', ''], ['oefen/lichtkamer/einde-6de', '']] as const) {
      expect(schilVan(basisRoute(splat, zoek)), splat).toBe('basis');
    }
  });
});
