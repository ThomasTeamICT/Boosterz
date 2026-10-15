import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndex, MinimumdoelenIndexSet } from './minimumdoelen';
import { filterSets, zonderAccenten } from './minimumdoelenBron';
import { VAK_ZOEKTABEL, bevatFrase, competentieFrases, vakAlsZoekwoord } from './vakZoektabel';

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

  it('"lichamelijke opvoeding", "LO" en "L.O." horen bij de sets over lichamelijke gezondheid', () => {
    expect(competentieFrases('lichamelijke')).toEqual(['lichamelijk*']);
    expect(competentieFrases('Lichamelijke  Opvoeding')).toEqual(['lichamelijk*']);
    expect(competentieFrases('LO')).toEqual(['lichamelijk*']);
    expect(competentieFrases('L.O.')).toEqual(['lichamelijk*']);
    expect(competentieFrases('opvoeding')).toEqual([]);
  });

  it('een woord dat niet helemaal overeenkomt, of niet in de tabel staat, geeft niets', () => {
    expect(competentieFrases('aardrijks')).toEqual([]);
    expect(competentieFrases('nederlands')).toEqual([]);
    expect(competentieFrases('')).toEqual([]);
  });
});

describe('vakAlsZoekwoord', () => {
  it('een meerwoordige vaknaam of een afkorting wordt het hoofdwoord van het vak', () => {
    expect(vakAlsZoekwoord('lichamelijke opvoeding')).toBe('lichamelijke');
    expect(vakAlsZoekwoord('  Lichamelijke   OPVOEDING ')).toBe('lichamelijke');
    expect(vakAlsZoekwoord('LO')).toBe('lichamelijke');
    expect(vakAlsZoekwoord('L.O.')).toBe('lichamelijke');
  });

  it('de rest van de zoektekst blijft staan', () => {
    expect(vakAlsZoekwoord('lo 3de graad')).toBe('lichamelijke 3de graad');
    expect(vakAlsZoekwoord('3de graad lichamelijke opvoeding bso')).toBe('3de graad lichamelijke bso');
  });

  it('wat geen vaknaam is, komt ongewijzigd terug', () => {
    for (const tekst of ['', '   ', 'lichamelijke', 'lichamelijke gezondheid', 'opvoeding', 'artistieke opvoeding', 'aardrijkskunde', 'geloof', 'solo', 'ODS_3287']) {
      expect(vakAlsZoekwoord(tekst), tekst).toBe(tekst);
    }
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

describe('lichamelijke opvoeding en LO (filterSets met vakAlsZoekwoord)', () => {
  const sets = [
    set('ODS_OUD', 'Lichamelijke Opvoeding', 'Buitengewoon Secundair onderwijs Opleidingsvorm 3 - Domein - Lichamelijke Opvoeding - Ontwikkelingsdoelen'),
    set('ODS_NU', 'Lichamelijke en geestelijke gezondheid', 'Secundair onderwijs 3de graad bso Finaliteit arbeidsmarkt -  Competenties op het vlak van lichamelijk, geestelijk en emotioneel bewustzijn/gezondheid - Eindtermen'),
    set('ODS_TECH', 'Wiskunde – natuurwetenschappen – technologie – STEM', 'Secundair onderwijs 1ste graad A-stroom -  Competenties inzake wiskunde, exacte wetenschappen en technologie - Eindtermen'),
    set('ODS_KUNST', 'Artistieke Opvoeding', 'Secundair onderwijs 1ste graad A-stroom - Vak - Artistieke Opvoeding - Eindtermen'),
  ];
  const ids = (zoek: string) => filterSets(sets, { ...ALLE, zoek }).map((s) => s.id);

  it('zonder omzetting vindt "lichamelijke opvoeding" alleen de oude set: "opvoeding" staat niet in de set van nu', () => {
    expect(ids('lichamelijke opvoeding')).toEqual(['ODS_OUD']);
  });

  it('met omzetting vindt "lichamelijke opvoeding" ook de set van nu, en niet de rest', () => {
    expect(ids(vakAlsZoekwoord('lichamelijke opvoeding'))).toEqual(['ODS_OUD', 'ODS_NU']);
  });

  it('"LO" en "L.O." vinden die sets, en geen set waar "lo" midden in een woord staat (technologie)', () => {
    expect(ids('lo')).toContain('ODS_TECH');
    expect(ids(vakAlsZoekwoord('LO'))).toEqual(['ODS_OUD', 'ODS_NU']);
    expect(ids(vakAlsZoekwoord('L.O.'))).toEqual(['ODS_OUD', 'ODS_NU']);
  });

  it('"opvoeding" alleen blijft zoeken op het woord zelf', () => {
    expect(ids(vakAlsZoekwoord('opvoeding'))).toEqual(['ODS_OUD', 'ODS_KUNST']);
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

  it('elk vak, elke meerwoordige naam en elke afkorting in de tabel vindt via vakAlsZoekwoord minstens één set', () => {
    for (const regel of VAK_ZOEKTABEL) {
      for (const vak of regel.vakken) {
        const gevonden = filterSets(sets, { ...ALLE, zoek: vakAlsZoekwoord(vak) });
        expect(gevonden.length, vak).toBeGreaterThan(0);
      }
    }
  });

  it('"lichamelijke opvoeding", "LO" en "L.O." vinden de sets die nu gelden: "Lichamelijke en geestelijke gezondheid"', () => {
    for (const zoek of ['lichamelijke opvoeding', 'LO', 'L.O.', 'lo 3de graad']) {
      const actueel = filterSets(sets, { zoek: vakAlsZoekwoord(zoek), geldigheid: 'actueel', graad: '', soort: 'alle' });
      const nu = actueel.filter((s) => s.korteNaam === 'Lichamelijke en geestelijke gezondheid');
      expect(nu.length, zoek).toBeGreaterThan(0);
      // Geen enkele set die nu geldt komt mee omdat "lo" in een ander woord staat.
      expect(actueel.every((s) => /lichamelijk/i.test(`${s.naam} ${s.korteNaam ?? ''}`)), zoek).toBe(true);
    }
  });

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
