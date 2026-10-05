import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndex, MinimumdoelenIndexSet } from './minimumdoelen';
import { filterSets, zonderAccenten } from './minimumdoelenBron';
import { VAK_ZOEKTABEL, bevatFrase, competentieFrases } from './vakZoektabel';

function set(id: string, korteNaam: string, naam = `Secundair onderwijs 1ste graad A-stroom - Competenties - ${korteNaam} - Eindtermen`): MinimumdoelenIndexSet {
  return { id, naam, korteNaam, aantal: 3, sha256: 'x', opgehaald: '2026-10-05T10:00:00Z', bestand: `${id}.json`, graad: '1ste graad', stroom: 'A-stroom' };
}

const ALLE = { geldigheid: 'alle', graad: '', soort: 'alle' } as const;

describe('competentieFrases', () => {
  it('geeft de sleutelcompetentie bij een vak, zonder letterlijke overeenkomst met hoofdletters of accenten te eisen', () => {
    expect(competentieFrases('aardrijkskunde')).toEqual(['ruimtelijk bewustzijn']);
    expect(competentieFrases('Aardrijkskunde')).toEqual(['ruimtelijk bewustzijn']);
    expect(competentieFrases('geschiedenis')).toEqual(['historisch bewustzijn']);
    expect(competentieFrases('fysica')).toContain('exacte wetenschappen');
    expect(competentieFrases('Frans')).toEqual(['andere talen']);
  });

  it('een woord dat niet helemaal overeenkomt, of niet in de tabel staat, geeft niets', () => {
    expect(competentieFrases('aardrijks')).toEqual([]);
    expect(competentieFrases('nederlands')).toEqual([]);
    expect(competentieFrases('')).toEqual([]);
  });
});

describe('bevatFrase', () => {
  it('past op woordgrenzen: "stem" staat niet in "systeem"', () => {
    expect(bevatFrase('wiskunde natuurwetenschappen technologie stem', 'stem')).toBe(true);
    expect(bevatFrase('ecosystemen en systematisch', 'stem')).toBe(false);
    expect(bevatFrase('competenties met betrekking tot ruimtelijk bewustzijn', 'ruimtelijk bewustzijn')).toBe(true);
  });

  it('een "*" laat het einde vrij', () => {
    expect(bevatFrase('lichamelijke en geestelijke gezondheid', 'lichamelijk*')).toBe(true);
    expect(bevatFrase('lichamelijke en geestelijke gezondheid', 'lichamelijk')).toBe(false);
    expect(bevatFrase('digitale competentie en mediawijsheid', 'digitale competentie*')).toBe(true);
  });
});

describe('filterSets met de zoektabel (hulp bij het zoeken, geen koppeling)', () => {
  const sets = [
    set('ODS_1', 'Aardrijkskunde', 'Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen'),
    set('ODS_2', 'Ruimtelijk bewustzijn', 'Secundair onderwijs 1ste graad A-stroom -  Competenties met betrekking tot ruimtelijk bewustzijn - Eindtermen'),
    set('ODS_3', 'Historisch bewustzijn'),
    set('ODS_4', 'Wiskunde – natuurwetenschappen – technologie – STEM', 'Secundair onderwijs 1ste graad A-stroom -  Competenties inzake wiskunde, exacte wetenschappen en technologie - Eindtermen'),
    set('ODS_5', 'Ecosystemen'),
  ];

  it('"aardrijkskunde" vindt ook "Ruimtelijk bewustzijn", maar niet "Historisch bewustzijn"', () => {
    const ids = filterSets(sets, { ...ALLE, zoek: 'aardrijkskunde' }).map((s) => s.id);
    expect(ids).toEqual(['ODS_1', 'ODS_2']);
  });

  it('alle zoekwoorden moeten nog steeds passen', () => {
    expect(filterSets(sets, { ...ALLE, zoek: 'aardrijkskunde competenties' }).map((s) => s.id)).toEqual(['ODS_2']);
    expect(filterSets(sets, { ...ALLE, zoek: 'aardrijkskunde historisch' })).toEqual([]);
  });

  it('een half ingetikt vak breidt niet uit; zoeken op de competentie zelf werkt zoals altijd', () => {
    expect(filterSets(sets, { ...ALLE, zoek: 'aardrijks' }).map((s) => s.id)).toEqual(['ODS_1']);
    expect(filterSets(sets, { ...ALLE, zoek: 'ruimtelijk' }).map((s) => s.id)).toEqual(['ODS_2']);
  });

  it('"fysica" vindt de STEM-set, maar niet een set waar "stem" midden in een woord staat', () => {
    expect(filterSets(sets, { ...ALLE, zoek: 'fysica' }).map((s) => s.id)).toEqual(['ODS_4']);
  });
});

// ── De tabel zelf, tegen de meegeleverde sets ───────────────────────────────

const INDEX = join(process.cwd(), 'public', 'leerplannen', 'minimumdoelen', 'index.json');

describe.runIf(existsSync(INDEX))('de tabel tegen de meegeleverde sets', () => {
  const sets = (JSON.parse(readFileSync(INDEX, 'utf8')) as MinimumdoelenIndex).sets;

  for (const regel of VAK_ZOEKTABEL) {
    it(`elke frase van ${regel.vakken[0]} (en de andere vakken in die regel) vindt minstens één set`, () => {
      for (const frase of regel.zoek) {
        const gevonden = sets.filter((s) => bevatFrase(zonderAccenten(`${s.naam} ${s.korteNaam ?? ''}`), frase));
        expect(gevonden.length, frase).toBeGreaterThan(0);
      }
    });
  }

  it('"aardrijkskunde" vindt ODS_3287 "Ruimtelijk bewustzijn" (1ste graad A-stroom)', () => {
    const ids = filterSets(sets, { ...ALLE, zoek: 'aardrijkskunde' }).map((s) => s.id);
    expect(ids).toContain('ODS_3287');
    expect(ids).toContain('ODS_2118');
  });

  it('de tabel wijst alleen woorden aan zonder accenten en in kleine letters', () => {
    for (const regel of VAK_ZOEKTABEL) {
      for (const woord of [...regel.vakken, ...regel.zoek]) expect(woord, woord).toBe(zonderAccenten(woord));
    }
  });
});
