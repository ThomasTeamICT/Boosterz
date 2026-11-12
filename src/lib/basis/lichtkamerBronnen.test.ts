// De bronnen van de spiekkaart (LK-8): met de echte bestanden uit public/ vult vulSpiekkaart alles, en zonder bestand
// meldt ze wat er mist. GEGEVENSRUN=1 slaat het deel met de bestanden over (zoals lesmateriaal.test.ts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenSetBestand } from '../minimumdoelen';
import type { GoBijMinimumdoelBestand } from './go/types';
import { SPIEKKAART, vulSpiekkaart } from './lichtkamer/lesmateriaal';
import { foutpatroonTekst, maakLesmateriaalBronnen, vulSpiekkaartTolerant } from './lichtkamerBronnen';
import { PAKKETTEN } from './pakketten';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';
const leesJson = <T>(...pad: string[]): T => JSON.parse(readFileSync(join(REPO, ...pad), 'utf8')) as T;

describe('foutpatroonTekst', () => {
  it('geeft de tekst uit het manifest, en niets voor een onbekend id', () => {
    expect(foutpatroonTekst('schaduw-kant-lamp')).toBe('schaduw aan de kant van de lamp');
    expect(foutpatroonTekst('bestaat-niet')).toBeUndefined();
  });
});

describe('zonder bestanden', () => {
  it('geven de bronnen niets en meldt vulSpiekkaart wat er mist, zonder halve spiekkaart', () => {
    const { kaart, fouten } = vulSpiekkaart(SPIEKKAART, maakLesmateriaalBronnen(undefined, undefined));
    expect(kaart).toBeNull();
    // drie doelen en zeven GO!-doelen: elk een eigen melding; de foutpatronen komen uit het manifest en zijn er dus wel
    expect(fouten.filter((f) => f.startsWith('Minimumdoel'))).toHaveLength(3);
    expect(fouten.filter((f) => f.startsWith('Het GO!'))).toHaveLength(SPIEKKAART.doelen.reduce((n, d) => n + d.go.length, 0));
    expect(fouten.some((f) => f.startsWith('Foutpatroon'))).toBe(false);
  });
});

describe('vulSpiekkaartTolerant', () => {
  it('zonder bestanden blijft de kaart staan, met lege doelteksten, de foutpatronen uit het manifest en een lijst van wat mist', () => {
    const { kaart, volledig, fouten } = vulSpiekkaartTolerant(maakLesmateriaalBronnen(undefined, undefined));
    expect(volledig).toBe(false);
    expect(fouten.length).toBeGreaterThan(0);
    expect(kaart.doelen.map((d) => [d.id, d.code, d.tekst, d.goDoelen.length])).toEqual([['92767', '', '', 0], ['92775', '', '', 0], ['92777', '', '', 0]]);
    expect(kaart.fouten.every((f) => f.tekst !== '')).toBe(true);
    expect(kaart.fasen).toBe(SPIEKKAART.fasen);
  });
});

describe.skipIf(GEGEVENSRUN)('met de bestanden van de app', () => {
  const set = GEGEVENSRUN ? undefined : leesJson<MinimumdoelenSetBestand>('public', 'leerplannen', 'minimumdoelen', 'ODS_3408.json');
  const bij = GEGEVENSRUN ? undefined : leesJson<GoBijMinimumdoelBestand>('public', 'basis', 'go', 'bij-minimumdoel', '3.json');

  it('de doelen van het register staan in de set en vulSpiekkaart vindt alles', () => {
    const { kaart, fouten } = vulSpiekkaart(SPIEKKAART, maakLesmateriaalBronnen(set, bij));
    expect(fouten).toEqual([]);
    expect(kaart?.doelen.map((d) => d.id)).toEqual(PAKKETTEN.lichtkamer.doelen.map((d) => d.id));
    expect(kaart?.doelen.map((d) => d.tekst)).toEqual([
      'De leerlingen kennen licht: rechtlijnige beweging.',
      'De leerlingen kunnen een voorafgaand opgezet eerlijk onderzoek uitvoeren.',
      'De leerlingen kunnen systematisch waarnemingen noteren en conclusies trekken.',
    ]);
  });

  it('de tolerante kaart is volledig als alles er is, en houdt de doelen als alleen het GO! ontbreekt', () => {
    const goed = vulSpiekkaartTolerant(maakLesmateriaalBronnen(set, bij));
    expect(goed.volledig).toBe(true);
    expect(goed.fouten).toEqual([]);
    const zonderGo = vulSpiekkaartTolerant(maakLesmateriaalBronnen(set, undefined));
    expect(zonderGo.volledig).toBe(false);
    expect(zonderGo.kaart.doelen.map((d) => d.code)).toEqual(['3.5.4', '3.6.3', '3.6.4']);
    expect(zonderGo.kaart.doelen.every((d) => d.goDoelen.length === 0)).toBe(true);
  });

  it('met alleen de set ontbreekt het GO!, met alleen het GO! ontbreken de doelen', () => {
    expect(vulSpiekkaart(SPIEKKAART, maakLesmateriaalBronnen(set, undefined)).fouten.every((f) => f.startsWith('Het GO!'))).toBe(true);
    expect(vulSpiekkaart(SPIEKKAART, maakLesmateriaalBronnen(undefined, bij)).fouten.every((f) => f.startsWith('Minimumdoel'))).toBe(true);
  });

  it('een set met een ander id geeft niets', () => {
    expect(maakLesmateriaalBronnen(set, bij).minimumdoel('ODS_3469', '92767')).toBeUndefined();
  });
});
