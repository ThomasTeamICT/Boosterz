// useMinimumdoelTeksten met de echte bestanden van de overheid in public/leerplannen/minimumdoelen/. De twee hooks die
// laden (de index en de setbestanden) zijn vervangen door hun uitkomst, zodat renderToStaticMarkup (zonder effecten) de rest
// van de hook echt uitvoert: welke sets gevraagd worden, hoe het doel in een set gevonden wordt, en wat het scherm daarmee
// toont. De beslissing van de eigenaar: de tekst van een minimumdoel komt altijd uit die bestanden, nooit uit de Excel.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MinimumdoelenIndex, MinimumdoelenSetBestand } from '../../../lib/minimumdoelen';
import { doelenVanSet } from '../../../lib/basis/doelBasis';
import { basisSet } from '../../../lib/basis/moment';
import type { GoLeerplanBestand, GoLeerplandoel } from '../../../lib/basis/go/types';
import { KoppelingLijst, koppelingenVan, useMinimumdoelTeksten } from './KoppelingLijst';

const MIN_MAP = new URL('../../../../public/leerplannen/minimumdoelen/', import.meta.url);
const leesMin = <T>(naam: string): T => JSON.parse(readFileSync(new URL(naam, MIN_MAP), 'utf8')) as T;
const INDEX = leesMin<MinimumdoelenIndex>('index.json');
const GO = JSON.parse(readFileSync(new URL('../../../../public/basis/go/leerplan/WT.json', import.meta.url), 'utf8')) as GoLeerplanBestand;
const doelVan = (code: string): GoLeerplandoel => {
  const d = GO.doelen.find((x) => x.code === code);
  if (!d) throw new Error(`${code} niet gevonden`);
  return d;
};

// Wat de hooks gevraagd werd, voor de controle dat een set die niet in de index staat niet opgehaald wordt.
const gevraagd: string[][] = [];
let indexVoorTest: MinimumdoelenIndex = INDEX;

vi.mock('../useBasisSets', () => ({
  useBasisIndex: () => ({ stand: { status: 'klaar', waarde: indexVoorTest }, opnieuw: () => undefined }),
}));
vi.mock('../../curriculum/samenstellen/useSetBestanden', () => ({
  useSetBestanden: (ids: readonly string[]) => {
    gevraagd.push([...ids]);
    const bestanden = new Map(ids.map((id) => [id, leesMin<MinimumdoelenSetBestand>(`${id}.json`)] as const));
    return { stand: (id: string) => (bestanden.has(id) ? { status: 'klaar', bestand: bestanden.get(id) } : { status: 'laden' }), bestanden, opnieuw: () => undefined };
  },
}));

function Scherm({ doel }: { doel: GoLeerplandoel }) {
  const refs = koppelingenVan(doel).flatMap((k) => k.refs);
  const teksten = useMinimumdoelTeksten(refs);
  return createElement(KoppelingLijst, { doel, teksten });
}
const toon = (doel: GoLeerplandoel) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Scherm, { doel })));
const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

describe('useMinimumdoelTeksten met de officiële bestanden', () => {
  it('WT.086: de officiële tekst van 3.1.3 en 3.1.4 staat er, en de zin dat het doel er niet meer staat niet', () => {
    const html = toon(doelVan('WT.086'));
    const kop = INDEX.sets.find((s) => s.id === 'ODS_3410');
    const info = kop ? basisSet(kop) : undefined;
    const officieel = new Map(info ? doelenVanSet(leesMin<MinimumdoelenSetBestand>('ODS_3410.json'), info).map((d) => [d.id, d] as const) : []);
    for (const id of ['92929', '93034']) {
      const zin = tekst(officieel.get(id)?.doelzinHtml ?? '');
      expect(zin.length, id).toBeGreaterThan(20);
      expect(tekst(html), id).toContain(zin);
    }
    expect(html.match(/b-go-minimumtekst/g) ?? []).toHaveLength(2);
    expect(tekst(html)).not.toContain('staat niet meer in de officiële gegevens');
  });

  it('vraagt alleen de sets die in de index staan, en toont voor de rest de rustige zin', () => {
    gevraagd.length = 0;
    indexVoorTest = { ...INDEX, sets: INDEX.sets.filter((s) => s.id !== 'ODS_3410') };
    try {
      const html = toon(doelVan('WT.086'));
      expect(gevraagd.flat()).not.toContain('ODS_3410');
      expect(tekst(html)).toContain('Dit minimumdoel staat niet meer in de officiële gegevens.');
    } finally {
      indexVoorTest = INDEX;
    }
  });
});
