// Het aanbodmodel: de vormcontrole, de controle tegenover het lesplan (fouten, dekking, na te kijken) en de bordles
// tegenover haar onderdeel. Getest op het echte lesplan LP0065 (public/basis/go/lesplannen/).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BordlesConfig } from '../../types';
import type { GoLesplanBestand } from './types';
import {
  controleerBordlesTegenOnderdeel,
  dekkingZin,
  enLijst,
  hoortBijZin,
  isGeldigAanbodBestand,
  isGeldigeOnderdeelId,
  isWidgetType,
  lichtAanbodBordles,
  lichtGoAanbod,
  steuntDelen,
  valideerAanbod,
  type GoAanbodBestand,
  type GoAanbodOnderdeel,
} from './aanbod';

const LP0065 = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../public/basis/go/lesplannen/LP0065.json', import.meta.url)), 'utf8'),
) as GoLesplanBestand;

function onderdeel(extra: Partial<GoAanbodOnderdeel> = {}): GoAanbodOnderdeel {
  return {
    id: 'dier-of-plant',
    soort: 'uitleg',
    titel: 'Dier of plant? En wat eet het?',
    steunt: { stappen: [2, 3, 5] },
    doelen: ['WT.001', 'WT.008', 'WT.028'],
    widget: { type: 'bordles', bestand: 'dier-of-plant.json' },
    ...extra,
  };
}

function aanbod(onderdelen: GoAanbodOnderdeel[] = [onderdeel()], extra: Partial<GoAanbodBestand['lesplan']> = {}): GoAanbodBestand {
  return { app: 'boosterz', kind: 'go-aanbod', v: 1, lesplan: { code: 'LP0065', sha256: LP0065.sha256, ...extra }, onderdelen };
}

function bordles(doelenPerStap: (string[] | undefined)[]): BordlesConfig {
  return {
    fases: [
      {
        id: 'f1',
        soort: 'kijk',
        stappen: doelenPerStap.map((doelen, i) => ({ id: `s${i}`, uitleg: 'Kijk.', teken: [], ...(doelen ? { doelen } : {}) })),
      },
    ],
  };
}

describe('valideerAanbod', () => {
  it('het voorbeeld van LP0065 klopt: geen fouten, alles gedekt, niet na te kijken', () => {
    expect(valideerAanbod(aanbod(), LP0065)).toEqual({ fouten: [], nietGedekt: [], naTeKijken: false });
  });

  it('een andere lesplancode is een fout', () => {
    const u = valideerAanbod(aanbod([onderdeel()], { code: 'LP0074' }), LP0065);
    expect(u.fouten).toEqual(['het aanbod hoort bij lesplan LP0074, niet bij LP0065']);
  });

  it('een stap die niet bestaat is een fout (stap 7; en elke stap maar één keer)', () => {
    const u = valideerAanbod(aanbod([onderdeel({ steunt: { stappen: [2, 7 as 6, 2] } })]), LP0065);
    expect(u.fouten).toContain('onderdeel "dier-of-plant": stap 7 bestaat niet in lesplan LP0065');
    expect(u.fouten).toContain('onderdeel "dier-of-plant": een stap staat er twee keer');
  });

  it('een stap die alleen in een ander lesplan bestaat: LP0065 zonder stap 6 geeft een fout', () => {
    const zonder6: GoLesplanBestand = { ...LP0065, afgeleid: { ...LP0065.afgeleid, stappen: LP0065.afgeleid.stappen.filter((s) => s.nr !== 6) } };
    expect(valideerAanbod(aanbod([onderdeel({ steunt: { stappen: [6] } })]), zonder6).fouten).toEqual([
      'onderdeel "dier-of-plant": stap 6 bestaat niet in lesplan LP0065',
    ]);
  });

  it('een titel van Trainen moet letterlijk kloppen: hoofdletters, leestekens en spaties tellen', () => {
    const goed = valideerAanbod(aanbod([onderdeel({ steunt: { trainen: ['Wie heeft honger?', 'De dierenzoektocht'] } })]), LP0065);
    expect(goed.fouten).toEqual([]);
    for (const fout of ['wie heeft honger?', 'Wie heeft honger', 'Wie heeft honger? ', 'Wie  heeft honger?', 'Onbestaand spel']) {
      const u = valideerAanbod(aanbod([onderdeel({ steunt: { trainen: [fout] } })]), LP0065);
      expect(u.fouten).toEqual([`onderdeel "dier-of-plant": de activiteit ${JSON.stringify(fout)} staat niet letterlijk in Trainen van lesplan LP0065`]);
    }
  });

  it('een doel dat niet in deel 2 staat is een fout, en dekt niets', () => {
    const u = valideerAanbod(aanbod([onderdeel({ doelen: ['WT.001', 'WT.086'] })]), LP0065);
    expect(u.fouten).toEqual(['onderdeel "dier-of-plant": doel WT.086 staat niet in deel 2 van lesplan LP0065']);
    expect(u.nietGedekt).toEqual(['WT.008', 'WT.028']);
  });

  it('een dubbel doel binnen een onderdeel is een fout', () => {
    expect(valideerAanbod(aanbod([onderdeel({ doelen: ['WT.001', 'WT.008', 'WT.028', 'WT.001'] })]), LP0065).fouten).toEqual([
      'onderdeel "dier-of-plant": doel WT.001 staat er twee keer',
    ]);
  });

  it('nietGedekt: in de volgorde van het lesplan, nooit stil weggelaten; dekking telt over alle onderdelen', () => {
    expect(valideerAanbod(aanbod([onderdeel({ doelen: ['WT.008'] })]), LP0065).nietGedekt).toEqual(['WT.001', 'WT.028']);
    const twee = aanbod([
      onderdeel({ doelen: ['WT.028'] }),
      onderdeel({ id: 'wie-heeft-honger', soort: 'oefening', doelen: ['WT.008', 'WT.001'], steunt: { trainen: ['Wie heeft honger?'] }, widget: { type: 'memory', bestand: 'wie-heeft-honger.json' } }),
    ]);
    expect(valideerAanbod(twee, LP0065)).toEqual({ fouten: [], nietGedekt: [], naTeKijken: false });
    expect(valideerAanbod(aanbod([]), LP0065).nietGedekt).toEqual(['WT.001', 'WT.008', 'WT.028']);
  });

  it('een materiaal zonder doelen mag, maar dekt niets', () => {
    const u = valideerAanbod(aanbod([onderdeel({ id: 'kaarten', soort: 'materiaal', doelen: [], steunt: { stappen: [3, 4], vastlegging: true }, widget: undefined })]), LP0065);
    expect(u.fouten).toEqual([]);
    expect(u.nietGedekt).toEqual(['WT.001', 'WT.008', 'WT.028']);
  });

  it('een dubbele id is een fout', () => {
    expect(valideerAanbod(aanbod([onderdeel(), onderdeel()]), LP0065).fouten).toEqual(['onderdeel "dier-of-plant": dubbele id']);
  });

  it('een ongeldige id is een fout (ze staat in het adres)', () => {
    for (const id of ['Dier', 'dier_plant', '', 'a/b', '../x', 'dier-', '-dier', 'é']) {
      expect(valideerAanbod(aanbod([onderdeel({ id })]), LP0065).fouten[0]).toBe(
        `onderdeel ${JSON.stringify(id)}: ongeldige id (alleen kleine letters, cijfers en streepjes)`,
      );
    }
  });

  it('een widgetbestand met een ongeldige naam is een fout: geen map, geen .., alleen .json en kleine letters', () => {
    for (const bestand of ['../LP0074.json', 'beelden/x.json', 'Dier.json', 'dier.JSON', 'dier', 'dier.json.js', '/dier.json', '.json', 'dier of plant.json']) {
      const u = valideerAanbod(aanbod([onderdeel({ widget: { type: 'bordles', bestand } })]), LP0065);
      expect(u.fouten).toEqual([
        `onderdeel "dier-of-plant": ongeldige bestandsnaam ${JSON.stringify(bestand)} (kleine letters, cijfers en streepjes, met .json, zonder map)`,
      ]);
    }
  });

  it('een onbekende soort oefening is een fout', () => {
    const u = valideerAanbod(aanbod([onderdeel({ soort: 'oefening', widget: { type: 'bestaatniet' as 'quiz', bestand: 'x.json' } })]), LP0065);
    expect(u.fouten).toEqual(['onderdeel "dier-of-plant": onbekende soort oefening "bestaatniet"']);
  });

  it('uitleg hoort bij een bordles en een bordles bij uitleg', () => {
    expect(valideerAanbod(aanbod([onderdeel({ widget: undefined })]), LP0065).fouten).toEqual([
      "onderdeel \"dier-of-plant\": een uitleg op het bord heeft een bordles nodig (widget.type 'bordles')",
    ]);
    expect(valideerAanbod(aanbod([onderdeel({ soort: 'digibord' })]), LP0065).fouten).toEqual([
      "onderdeel \"dier-of-plant\": een bordles hoort bij de soort 'uitleg'",
    ]);
  });

  it('een onderdeel dat nergens op steunt is een fout', () => {
    expect(valideerAanbod(aanbod([onderdeel({ steunt: {} })]), LP0065).fouten).toEqual([
      'onderdeel "dier-of-plant": steunt op geen stap, geen activiteit van Trainen en niet op de vastlegging',
    ]);
  });

  it('naTeKijken: alleen als de sha256 van het lesplan verschilt', () => {
    expect(valideerAanbod(aanbod([onderdeel()], { sha256: '0'.repeat(64) }), LP0065)).toEqual({ fouten: [], nietGedekt: [], naTeKijken: true });
    const veranderd: GoLesplanBestand = { ...LP0065, sha256: 'f'.repeat(64) };
    expect(valideerAanbod(aanbod(), veranderd).naTeKijken).toBe(true);
  });
});

describe('controleerBordlesTegenOnderdeel', () => {
  it('klopt als de stappen samen precies de doelen van het onderdeel behandelen', () => {
    expect(controleerBordlesTegenOnderdeel(onderdeel(), bordles([['WT.001', 'WT.028'], undefined, ['WT.008', 'WT.001']]))).toEqual([]);
  });

  it('een doel van het onderdeel dat geen stap behandelt', () => {
    expect(controleerBordlesTegenOnderdeel(onderdeel(), bordles([['WT.001'], ['WT.028']]))).toEqual([
      'doel WT.008 van onderdeel "dier-of-plant" komt in geen enkele stap van de bordles voor',
    ]);
  });

  it('een doel in de bordles dat het onderdeel niet noemt', () => {
    expect(controleerBordlesTegenOnderdeel(onderdeel({ doelen: ['WT.001'] }), bordles([['WT.001', 'WT.057']]))).toEqual([
      'de bordles behandelt doel WT.057, maar onderdeel "dier-of-plant" noemt het niet',
    ]);
  });

  it('een bordles zonder doelen dekt niets', () => {
    expect(controleerBordlesTegenOnderdeel(onderdeel({ doelen: ['WT.001'] }), bordles([undefined]))).toHaveLength(1);
  });

  it('telt ook de instapvraag mee', () => {
    const cfg = { ...bordles([['WT.001']]), instapvraag: { id: 'i', uitleg: 'Vraag.', teken: [], doelen: ['WT.008'] } };
    expect(controleerBordlesTegenOnderdeel(onderdeel({ doelen: ['WT.001', 'WT.008'] }), cfg)).toEqual([]);
  });
});

describe('lichtGoAanbod en lichtAanbodBordles', () => {
  it('laat een goed bestand door', () => {
    expect(lichtGoAanbod(aanbod())).toEqual([]);
    expect(lichtGoAanbod(JSON.parse(JSON.stringify(aanbod())))).toEqual([]);
  });

  it('weigert wat een scherm zou laten vastlopen', () => {
    expect(lichtGoAanbod(null)).toEqual(['geen object']);
    expect(lichtGoAanbod([])).toEqual(['geen object']);
    expect(lichtGoAanbod({ ...aanbod(), v: 2 })).toEqual(['onbekende versie (2)']);
    expect(lichtGoAanbod({ ...aanbod(), kind: 'go-lesplan' })).toEqual(['kind is niet go-aanbod']);
    expect(lichtGoAanbod({ ...aanbod(), lesplan: { code: 'LP0065', sha256: 'abc' } })).toHaveLength(1);
    expect(lichtGoAanbod({ ...aanbod(), onderdelen: {} })).toEqual(['onderdelen is geen lijst']);
    expect(lichtGoAanbod(aanbod([{ ...onderdeel(), soort: 'film' as 'uitleg' }]))).toEqual(['onderdelen[0].soort is onbekend (film)']);
    expect(lichtGoAanbod(aanbod([{ ...onderdeel(), titel: ' ' }]))).toEqual(['onderdelen[0].titel ontbreekt']);
    expect(lichtGoAanbod(aanbod([{ ...onderdeel(), steunt: { stappen: ['2'] } } as unknown as GoAanbodOnderdeel]))).toHaveLength(1);
    expect(lichtGoAanbod(aanbod([{ ...onderdeel(), steunt: { trainen: 'Wie heeft honger?' } } as unknown as GoAanbodOnderdeel]))).toHaveLength(1);
    expect(lichtGoAanbod(aanbod([{ ...onderdeel(), doelen: 'WT.001' } as unknown as GoAanbodOnderdeel]))).toHaveLength(1);
    expect(lichtGoAanbod(aanbod([{ ...onderdeel(), widget: { type: 'bordles' } } as unknown as GoAanbodOnderdeel]))).toHaveLength(1);
    expect(lichtGoAanbod(aanbod([null as unknown as GoAanbodOnderdeel]))).toEqual(['onderdelen[0] is geen object']);
  });

  it('een bordles-bestand: soort, titel en fases', () => {
    expect(lichtAanbodBordles({ soort: 'bordles', titel: 'X', config: { fases: [] } })).toEqual([]);
    expect(lichtAanbodBordles({ soort: 'quiz', titel: 'X', config: { fases: [] } })).toHaveLength(1);
    expect(lichtAanbodBordles({ soort: 'bordles', titel: 'X', config: {} })).toHaveLength(1);
    expect(lichtAanbodBordles({ soort: 'bordles', config: { fases: [] } })).toHaveLength(1);
    expect(lichtAanbodBordles('x')).toEqual(['geen object']);
  });
});

describe('namen', () => {
  it('ids en bestandsnamen', () => {
    expect(isGeldigeOnderdeelId('dier-of-plant')).toBe(true);
    expect(isGeldigeOnderdeelId('a'.repeat(81))).toBe(false);
    expect(isGeldigAanbodBestand('dier-of-plant.json')).toBe(true);
    expect(isGeldigAanbodBestand(`${'a'.repeat(80)}.json`)).toBe(true);
    expect(isGeldigAanbodBestand(`${'a'.repeat(81)}.json`)).toBe(false);
    expect(isGeldigAanbodBestand(undefined)).toBe(false);
  });

  it('soorten oefeningen', () => {
    expect(isWidgetType('bordles')).toBe(true);
    expect(isWidgetType('memory')).toBe(true);
    expect(isWidgetType('Bordles')).toBe(false);
  });
});

describe('zinnen', () => {
  it('enLijst', () => {
    expect(enLijst([])).toBe('');
    expect(enLijst(['2'])).toBe('2');
    expect(enLijst(['2', '3'])).toBe('2 en 3');
    expect(enLijst(['2', '3', '5'])).toBe('2, 3 en 5');
  });

  it('hoortBijZin', () => {
    expect(hoortBijZin(onderdeel(), 'LP0065')).toBe('Dit hoort bij stap 2, 3 en 5 van lesplan LP0065.');
    expect(hoortBijZin(onderdeel({ steunt: { stappen: [4], trainen: ['Dierenmand en plantenmand'] } }), 'LP0065')).toBe(
      'Dit hoort bij stap 4 en de activiteit ‘Dierenmand en plantenmand’ uit Trainen van lesplan LP0065.',
    );
    expect(steuntDelen(onderdeel({ steunt: { trainen: ['A', 'B'], vastlegging: true } }))).toEqual(['de activiteiten ‘A’ en ‘B’ uit Trainen', 'de vastlegging']);
    expect(hoortBijZin(onderdeel({ steunt: {} }), 'LP0065')).toBe('Dit hoort bij lesplan LP0065.');
  });

  it('dekkingZin', () => {
    expect(dekkingZin([], 3)).toBe('Alle 3 leerplandoelen van dit lesplan komen aan bod.');
    expect(dekkingZin([], 1)).toBe('Het leerplandoel van dit lesplan komt aan bod.');
    expect(dekkingZin(['WT.008', 'WT.028'], 3)).toBe('Nog niet gedekt: WT.008, WT.028.');
  });
});
