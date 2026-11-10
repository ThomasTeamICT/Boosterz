// Het overzicht #/basis/go met een bewaard leerjaar: de tegels tonen het aantal voor de leeftijd van dat leerjaar, en een
// vak zonder doelen voor die leeftijd zegt dat. De bewaarde keuze wordt nagebootst, want de server-render kent geen opslag.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GoIndex } from '../../lib/basis/go/types';
import type { BasisKeuze } from '../../lib/basis/basisKeuze';

const keuze: { huidig: BasisKeuze | undefined } = { huidig: undefined };
vi.mock('../../components/basis/useBasisKeuze', () => ({
  useBasisKeuze: () => ({ keuze: keuze.huidig, bewaar: () => true, wis: () => undefined }),
}));

const INDEX = JSON.parse(readFileSync(new URL('../../../public/basis/go/index.json', import.meta.url), 'utf8')) as GoIndex;
const tekst = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function overzicht(): Promise<string> {
  const { GoInhoud } = await import('./GoScherm');
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(GoInhoud, { index: INDEX })));
}

describe('GoInhoud met een bewaard leerjaar', () => {
  it('zonder bewaard leerjaar staat het totaal op de tegel', async () => {
    keuze.huidig = undefined;
    const t = tekst(await overzicht());
    expect(t).toContain('112 leerplandoelen · 6 zonder minimumdoel');
    expect(t).not.toContain('in totaal');
  });

  it('met L3 toont de tegel van Frans dat er voor 8-9 jaar geen doelen zijn, en die van Nederlands het aantal voor 8-9 jaar', async () => {
    keuze.huidig = { soort: 'bao', leerjaar: 'L3' };
    const t = tekst(await overzicht());
    expect(t).toContain('Frans geen leerplandoelen voor 8-9 jaar · 112 in totaal');
    expect(t).toContain('Nederlands 263 leerplandoelen voor 8-9 jaar');
  });
});
