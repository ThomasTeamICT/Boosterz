// De kaart bij een matrix die nog niet in Boosterz staat (docs/STUDIERICHTINGEN.md § 22.5.4, "Matrix nog niet in Boosterz"):
// een rij zwijgt, want de lijst met richtingen toont dan zelf de melding `NogGeenData`; de klas heeft die melding niet en moet
// het dus zelf zeggen. De test rendert de kaart op de server (zonder DOM) met een nagebootste laadstand van de gegevens.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FOUT_NOG_NIET_OPGEHAALD, FOUT_STUDIERICHTINGEN } from '../../lib/studierichtingenBron';

const mock = vi.hoisted(() => ({
  stand: { status: 'laden' } as { status: 'laden' } | { status: 'fout'; fout: string },
}));

vi.mock('./useRichtingGegevens', () => ({
  useRichtingGegevens: () => ({ stand: mock.stand, opnieuw: () => {} }),
  useRichtingKader: () => ({ stand: { status: 'laden' }, opnieuw: () => {} }),
}));

import { DekkingKort } from './DekkingKort';

function toon(plaats: 'rij' | 'klas'): string {
  return renderToStaticMarkup(createElement(DekkingKort, { groep: 'G-0193', soort: 'so', plaats, titel: 'Natuurwetenschappen' }));
}

describe('DekkingKort: de matrix staat nog niet in Boosterz', () => {
  it('in de klas staat de melding, zonder knop, en ze wordt voorgelezen', () => {
    mock.stand = { status: 'fout', fout: FOUT_NOG_NIET_OPGEHAALD };
    const html = toon('klas');
    expect(html).toContain('De doelen van deze richting zijn nog niet opgehaald.');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('<button');
  });

  it('in een rij staat niets: de lijstpagina zegt het al', () => {
    mock.stand = { status: 'fout', fout: FOUT_NOG_NIET_OPGEHAALD };
    expect(toon('rij')).toBe('');
  });

  it('een andere fout blijft een fout met "Opnieuw proberen", in de klas en in een rij', () => {
    mock.stand = { status: 'fout', fout: FOUT_STUDIERICHTINGEN };
    for (const plaats of ['klas', 'rij'] as const) {
      const html = toon(plaats);
      expect(html).toContain('De dekking kon niet berekend worden.');
      expect(html).toContain('Opnieuw proberen');
      expect(html).toContain('(Natuurwetenschappen)');
      expect(html).not.toContain('nog niet opgehaald');
    }
  });

  it('tijdens het laden staat er "De dekking wordt berekend…"', () => {
    mock.stand = { status: 'laden' };
    for (const plaats of ['klas', 'rij'] as const) expect(toon(plaats)).toContain('De dekking wordt berekend…');
  });
});
