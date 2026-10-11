// De gedeelde meldingen bij het laden (LaadStatus.tsx): zonder de nieuwe velden blijft alles zoals het was.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FoutBericht, LaadBericht } from './LaadStatus';

describe('LaadBericht', () => {
  it('is standaard een statusregio', () => {
    expect(renderToStaticMarkup(createElement(LaadBericht, { tekst: 'Bezig…' }))).toContain('role="status"');
  });

  it('met melden=false is het alleen een zichtbare regel, zonder rol', () => {
    const html = renderToStaticMarkup(createElement(LaadBericht, { tekst: 'Bezig…', melden: false }));
    expect(html).not.toContain('role=');
    expect(html).toContain('<span>Bezig…</span>');
  });
});

describe('FoutBericht', () => {
  const toon = (naam?: string) =>
    renderToStaticMarkup(createElement(FoutBericht, { fout: 'Mislukt.', onOpnieuw: () => {}, ...(naam !== undefined ? { naam } : {}) }));

  it('zonder naam staat er alleen "Opnieuw proberen" op de knop (zoals bij de andere schermen)', () => {
    const html = toon();
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/Opnieuw proberen<\/button>/);
    expect(html).not.toContain('sr-only');
  });

  it('met een naam staat die voor een schermlezer achter "Opnieuw proberen"', () => {
    expect(toon('Onthaalmedewerker')).toMatch(/Opnieuw proberen<span class="sr-only"> \(Onthaalmedewerker\)<\/span><\/button>/);
  });

  it('een lege of witte naam geeft geen lege haakjes', () => {
    for (const naam of ['', '   ']) expect(toon(naam)).not.toContain('sr-only');
  });
});
