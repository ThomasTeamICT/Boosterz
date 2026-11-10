// Waar de navigatie naartoe wijst: de bewaarde keuze en het leerjaar in het adres tellen mee op de schermen van het GO!.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { navEind, navSoort } from './basisNav';
import type { MinimumdoelenIndexSet } from '../minimumdoelen';

const sets = (JSON.parse(readFileSync('public/leerplannen/minimumdoelen/index.json', 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;

describe('navSoort en navEind', () => {
  it('volgen de bewaarde keuze op een scherm van het GO!', () => {
    expect(navSoort({ s: 'go' }, { soort: 'bubao', leerjaar: 'K1' })).toBe('bubao');
    expect(navEind({ s: 'go' }, { soort: 'bubao', leerjaar: 'K1' })).toBe('K3');
    expect(navEind({ s: 'lesplan', code: 'LP0065' }, { soort: 'bao', leerjaar: 'L6' })).toBe('L6');
  });
  it('geven het leerjaar in het adres voorrang op de keuze', () => {
    expect(navEind({ s: 'leerplandoelen', vak: 'WT', leerjaar: 'K1' }, { soort: 'bao', leerjaar: 'L6' })).toBe('K3');
    expect(navEind({ s: 'leerplandoelen', vak: 'WT', leerjaar: 'K1' })).toBe('K3');
    expect(navEind({ s: 'leerlijnen', soort: 'bao', leerjaar: 'L5' })).toBe('L6');
  });
  it('nemen bij een doel de soort en het moment van zijn set, ook zonder keuze', () => {
    const s = { s: 'doel', setId: 'ODS_3460', doelId: '92590' } as const;
    expect(navSoort(s, undefined, sets)).toBe('bubao');
    expect(navEind(s, undefined, sets)).toBe('K3');
    expect(navSoort(s, { soort: 'bao', leerjaar: 'L3' }, sets)).toBe('bubao');
  });
  it('blijven gewoon en einde 4de leerjaar zonder keuze', () => {
    expect(navSoort({ s: 'go' })).toBe('bao');
    expect(navEind({ s: 'go' })).toBe('L4');
    expect(navSoort({ s: 'doel', setId: 'ODS_0', doelId: '1' }, undefined, sets)).toBe('bao');
  });
  it('houden een eigen soort en eindmoment van het scherm', () => {
    expect(navSoort({ s: 'leerlijnen', soort: 'bubao' }, { soort: 'bao', leerjaar: 'L1' })).toBe('bubao');
    expect(navEind({ s: 'moment', soort: 'bao', eind: 'L6' }, { soort: 'bao', leerjaar: 'K1' })).toBe('L6');
  });
});
