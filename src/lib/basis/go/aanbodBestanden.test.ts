// Uitrolpoort voor het aanbod: elk manifest in public/basis/aanbod/*.json klopt tegenover zijn lesplan uit
// public/basis/go/lesplannen/ (geen fouten), en elke bordles uit een manifest bestaat, is een geldige bordles en behandelt
// precies de doelen van haar onderdeel. Wat niet gedekt is, mag: de lesplanpagina toont het als 'Nog niet gedekt'.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { valideerBordles } from '../../bordles/formaat';
import type { GoLesplanBestand } from './types';
import {
  controleerBordlesTegenOnderdeel,
  isGeldigAanbodBestand,
  lichtAanbodBordles,
  lichtGoAanbod,
  valideerAanbod,
  type GoAanbodBestand,
  type GoAanbodBordles,
} from './aanbod';

const PUBLIC = fileURLToPath(new URL('../../../../public/basis/', import.meta.url));
const AANBOD = join(PUBLIC, 'aanbod');
const LESPLANNEN = join(PUBLIC, 'go', 'lesplannen');

const lees = (pad: string): unknown => JSON.parse(readFileSync(pad, 'utf8'));

const manifesten = existsSync(AANBOD)
  ? readdirSync(AANBOD, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => d.name)
      .sort()
  : [];

describe('public/basis/aanbod', () => {
  it('er is minstens één manifest (LP0065)', () => {
    expect(manifesten).toContain('LP0065.json');
  });

  describe.each(manifesten)('%s', (naam) => {
    const code = naam.slice(0, -'.json'.length);
    const json = lees(join(AANBOD, naam));

    it('heeft de juiste vorm en hoort bij het lesplan met dezelfde naam', () => {
      expect(lichtGoAanbod(json)).toEqual([]);
      expect((json as GoAanbodBestand).lesplan.code).toBe(code);
    });

    it('klopt tegenover het lesplan: geen fouten en niet na te kijken', () => {
      const lesplanPad = join(LESPLANNEN, naam);
      expect(existsSync(lesplanPad), `lesplan ontbreekt: ${lesplanPad}`).toBe(true);
      const uitkomst = valideerAanbod(json as GoAanbodBestand, lees(lesplanPad) as GoLesplanBestand);
      expect(uitkomst.fouten).toEqual([]);
      expect(uitkomst.naTeKijken, 'de sha256 van het lesplan veranderde: kijk het aanbod na en zet de nieuwe sha256').toBe(false);
    });

    const bordlessen = (json as GoAanbodBestand).onderdelen.filter((o) => o.widget?.type === 'bordles');
    it.each(bordlessen.map((o) => [o.id, o] as const))('bordles van onderdeel %s', (_id, onderdeel) => {
      const bestand = onderdeel.widget!.bestand;
      expect(isGeldigAanbodBestand(bestand)).toBe(true);
      const pad = join(AANBOD, code, bestand);
      if (!existsSync(pad)) throw new Error(`bestand ontbreekt: public/basis/aanbod/${code}/${bestand}`);
      const les = lees(pad);
      expect(lichtAanbodBordles(les)).toEqual([]);
      const config = (les as GoAanbodBordles).config;
      expect(valideerBordles(config)).toEqual([]);
      expect(controleerBordlesTegenOnderdeel(onderdeel, config)).toEqual([]);
    });
  });
});
