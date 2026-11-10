// GoCodeLinks: een code van het GO! in de zoekvraag is een link als ze bestaat, en anders platte tekst; nergens staat 'Gevonden'.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import type { GoIndex } from '../../../lib/basis/go/types';
import { GoCodeLinksInhoud } from './GoCodeLinks';

const INDEX = {
  app: 'boosterz',
  kind: 'go-index',
  v: 1,
  naamsvermelding: 'GO!',
  ingelezen: '2026-11-09',
  leerplan: [{ vak: 'WT', naam: 'Wetenschap en techniek', bestand: 'leerplan/WT.json', aantal: 307 }],
  bijMinimumdoel: [],
  lesplannen: [{ code: 'LP0065', titel: 'Dieren classificeren', leeftijd: '2,5-4', vak: 'WT', lessenlijn: 'Biologie van organismen', lessenreeks: 'Fauna', doelen: [], bestand: 'lesplannen/LP0065.json', sha256: 'x' }],
} as unknown as GoIndex;

const toon = (codes: Parameters<typeof GoCodeLinksInhoud>[0]['codes']) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(GoCodeLinksInhoud, { codes, index: INDEX })));
const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('GoCodeLinks', () => {
  it('een lesplan en een leerplandoel die bestaan zijn links, met titel en leeftijd of vak', () => {
    const html = toon([
      { soort: 'lesplan', code: 'LP0065' },
      { soort: 'leerplandoel', code: 'WT.086' },
    ]);
    expect(html).toContain('<h2 id="b-zoek-go-kop">Bij het GO!</h2>');
    expect(html).toContain('href="/basis/lesplan/LP0065"');
    expect(html).toContain('href="/basis/leerplandoel/WT.086"');
    expect(tekst(html)).toContain('Lesplan LP0065 Dieren classificeren (2,5-4 jaar)');
    expect(tekst(html)).toContain('Leerplandoel WT.086 (Wetenschap en techniek)');
    expect(html).not.toContain('<h1');
  });

  it('een code die niet bestaat is platte tekst en nergens staat "Gevonden"', () => {
    const html = toon([
      { soort: 'leerplandoel', code: 'WT.999' },
      { soort: 'lesplan', code: 'LP9999' },
    ]);
    expect(html).not.toContain('<a ');
    expect(tekst(html)).toContain('WT.999 staat niet in het leerplan van het GO!');
    expect(tekst(html)).toContain('LP9999 staat niet bij de lesplannen van het GO!');
    expect(html).not.toContain('Gevonden');
  });

  it('zonder codes staat er niets, ook geen kop', () => {
    expect(toon([])).toBe('');
  });
});
