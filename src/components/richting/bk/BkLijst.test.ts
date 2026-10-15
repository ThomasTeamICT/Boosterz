// De zin boven de beroepskwalificaties bij "Nog niet gedekt" (docs/NIEUWE-CURSUS.md § 2.2, 19 tegenover 24): het getal in de zin
// telt alles wat niet echt gedekt is, de samenvatting erboven telt met "nog niet" alleen wat nergens aan bod komt. De zin legt
// daarom zelf uit hoe het getal is opgebouwd. De zinnen zelf staan in lib/bkWeergave.ts (daar getest); hier gaat het om het
// scherm: telt `PerBk` de rijen goed op, en verandert de zin met de keuze "Toon".

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bkSamenvatting } from '../../../lib/bkWeergave';
import type { MdDekking, MdRij, MdStatus } from '../../../lib/dekkingMinimumdoelen';
import { PerBk, nogNietGedektZin } from './BkLijst';

function rij(set: string, id: string, status: MdStatus): MdRij {
  return { doel: { set, id, code: `BK-${id}`, tekst: `Competentie ${id}` }, status, via: [] } as unknown as MdRij;
}

/** Twee beroepskwalificaties: A met 2 nergens, 1 gepland, 1 gedekt; B met 1 nergens en 1 alleen in verdieping. */
const REGELS: [string, string, MdStatus][] = [
  ['A', 'a1', 'open'], ['A', 'a2', 'open'], ['A', 'a3', 'gepland'], ['A', 'a4', 'gedekt'],
  ['B', 'b1', 'open'], ['B', 'b2', 'verdieping'],
];

function dekkingVan(regels: [string, string, MdStatus][]): MdDekking {
  const rijen = regels.map(([set, id, status]) => rij(set, id, status));
  const perSet = ['A', 'B'].map((set) => ({
    set, setNaam: `Beroepskwalificatie ${set}`, totaal: rijen.filter((r) => r.doel.set === set).length,
    gedekt: rijen.filter((r) => r.doel.set === set && r.status === 'gedekt').length, gepland: 0, verdieping: 0,
  }));
  const tel = (s: MdStatus) => rijen.filter((r) => r.status === s).length;
  return {
    rijen, perSet, totaal: rijen.length, gedekt: tel('gedekt'), gepland: tel('gepland'), verdieping: tel('verdieping'), open: tel('open'),
    percent: 0, optioneel: { totaal: 0, gedekt: 0 }, cursussen: [{ telt: true }], zelfdeNummerAndereSet: 0, samenvatting: '',
  } as unknown as MdDekking;
}

const namen = new Map<string, string>();
const tekstVan = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, '’').replace(/\s+/g, ' ').trim();

describe('nogNietGedektZin met een uitsplitsing', () => {
  it('zonder uitsplitsing blijft de zin van altijd staan', () => {
    expect(nogNietGedektZin(20, 2)).toBe('20 competenties in 2 beroepskwalificaties zijn nog niet gedekt. Open een beroepskwalificatie om ze te zien.');
  });

  it('met uitsplitsing zegt de zin waaruit het getal bestaat', () => {
    expect(nogNietGedektZin(24, 3, { open: 19, gepland: 3, verdieping: 2 })).toBe(
      '24 competenties in 3 beroepskwalificaties zijn nog niet gedekt: 19 komen nog nergens aan bod, 3 staan gepland (de sectie is nog leeg) en 2 komen alleen in verdieping aan bod. Open een beroepskwalificatie om ze te zien.',
    );
  });
});

describe('PerBk: de zin bij "Nog niet gedekt"', () => {
  const toon = (t: 'alle' | 'open') => tekstVan(renderToStaticMarkup(createElement(PerBk, { dekking: dekkingVan(REGELS), toon: t, namen })));

  it('"Nog niet gedekt": 5 competenties in 2 beroepskwalificaties, met de opbouw 3 nergens, 1 gepland, 1 alleen in verdieping', () => {
    expect(toon('open')).toContain(
      '5 competenties in 2 beroepskwalificaties zijn nog niet gedekt: 3 komen nog nergens aan bod, 1 staat gepland (de sectie is nog leeg) en 1 komt alleen in verdieping aan bod. Open een beroepskwalificatie om ze te zien.',
    );
  });

  it('de aantallen in de zin zijn dezelfde als die in de samenvatting erboven', () => {
    const d = dekkingVan(REGELS);
    const samenvatting = bkSamenvatting(d);
    expect(samenvatting).toContain('1 competentie staat al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 3 nog niet.');
    expect(toon('open')).toContain('3 komen nog nergens aan bod, 1 staat gepland (de sectie is nog leeg) en 1 komt alleen in verdieping aan bod');
  });

  it('"Alle competenties": geen zin, want er is niets om uit te leggen', () => {
    expect(toon('alle')).not.toMatch(/nog niet gedekt/);
  });

  it('alleen competenties die nergens aan bod komen: de gewone zin, zonder uitsplitsing', () => {
    const d = dekkingVan([['A', 'a1', 'open'], ['A', 'a2', 'open'], ['B', 'b1', 'open'], ['B', 'b2', 'gedekt']]);
    expect(tekstVan(renderToStaticMarkup(createElement(PerBk, { dekking: d, toon: 'open', namen })))).toContain(
      '3 competenties in 2 beroepskwalificaties zijn nog niet gedekt. Open een beroepskwalificatie om ze te zien.',
    );
  });
});
