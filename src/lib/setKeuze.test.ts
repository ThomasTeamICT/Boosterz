import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndex, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { gemengdeStromen, geldigheidJaren, geldigheidTekstVanBestand, geldigheidVanBestand, geldigheidVoorLijst, kandidaatSets, setNoemtVak } from './setKeuze';

function set(id: string, korteNaam: string, naam: string, extra: Partial<MinimumdoelenIndexSet> = {}): MinimumdoelenIndexSet {
  return { id, naam, korteNaam, aantal: 3, sha256: 'x', opgehaald: '2026-10-05T10:00:00Z', bestand: `${id}.json`, graad: '1ste graad', stroom: 'A-stroom', ...extra };
}

const VAK_AAR = set('ODS_2118', 'Aardrijkskunde', 'Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen');
const RUIMTE_OUD = set('ODS_2447', 'Ruimtelijk bewustzijn', 'Secundair onderwijs 1ste graad A-stroom -  Competenties met betrekking tot ruimtelijk bewustzijn - Eindtermen');
const RUIMTE_NU = set('ODS_3287', 'Ruimtelijk bewustzijn', 'Secundair onderwijs 1ste graad A-stroom -  Competenties met betrekking tot ruimtelijk bewustzijn - Eindtermen');
const WISKUNDE = set('ODS_2126', 'Wiskunde', 'Secundair onderwijs 1ste graad A-stroom - Vak - Wiskunde - Eindtermen');
const BEWEGEN = set('ODS_2438', 'Lichamelijke en geestelijke gezondheid', 'Secundair onderwijs 1ste graad A-stroom -  Competenties op het vlak van lichamelijk, geestelijk en emotioneel bewustzijn/gezondheid - Eindtermen');
const OPTIES = { graad: '1ste graad', stroom: 'A-stroom', onderwijs: 'so', vak: 'Aardrijkskunde', eigen: [] } as const;

describe('kandidaatSets: het vak eerst, ook de sleutelcompetentie die erbij hoort', () => {
  it('zet bij "aardrijkskunde" ook "Ruimtelijk bewustzijn" vooraan, vóór sets die het vak niet noemen', () => {
    const index = [WISKUNDE, BEWEGEN, RUIMTE_OUD, VAK_AAR, RUIMTE_NU];
    const ids = kandidaatSets(index, OPTIES).map((s) => s.id);
    expect(ids.slice(0, 3).sort()).toEqual(['ODS_2118', 'ODS_2447', 'ODS_3287']);
    expect(ids.slice(3).sort()).toEqual(['ODS_2126', 'ODS_2438']);
  });

  it('zonder vak (of met een vak uit een andere regel) blijft de volgorde van de voorstellen', () => {
    const index = [WISKUNDE, BEWEGEN, RUIMTE_OUD, VAK_AAR, RUIMTE_NU];
    const zonder = kandidaatSets(index, { ...OPTIES, vak: '' }).map((s) => s.id);
    // Gesorteerd op korte naam: Aardrijkskunde, Lichamelijke…, Ruimtelijk…, Ruimtelijk…, Wiskunde.
    expect(zonder).toEqual(['ODS_2118', 'ODS_2438', 'ODS_2447', 'ODS_3287', 'ODS_2126']);
    const lichamelijk = kandidaatSets(index, { ...OPTIES, vak: 'Lichamelijke opvoeding' }).map((s) => s.id);
    expect(lichamelijk[0]).toBe('ODS_2438');
  });

  it('sets die het leerplan al heeft staan altijd vooraan, zonder dubbele', () => {
    const index = [WISKUNDE, RUIMTE_OUD, VAK_AAR, RUIMTE_NU];
    const ids = kandidaatSets(index, { ...OPTIES, eigen: ['ODS_2126', 'ODS_9999'] }).map((s) => s.id);
    expect(ids[0]).toBe('ODS_2126');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('met een index die de geldigheid kent (pull request #3) blijven alleen de geldige sets over', () => {
    const index = [
      { ...VAK_AAR, geldigheid: 'Niet meer geldig', geldigVan: '1997-09-01', geldigTot: '2020-08-31' },
      { ...RUIMTE_OUD, geldigheid: 'Niet meer geldig', geldigVan: '2019-09-01', geldigTot: '2025-08-31' },
      { ...RUIMTE_NU, geldigheid: 'Geldig', geldigVan: '2024-09-01' },
      { ...WISKUNDE, geldigheid: 'Geldig', geldigVan: '2019-09-01' },
    ];
    expect(kandidaatSets(index, OPTIES).map((s) => s.id)).toEqual(['ODS_3287', 'ODS_2126']);
  });
});

describe('setNoemtVak', () => {
  it('de naam of de korte naam noemt het vak, zonder accenten en hoofdletters', () => {
    expect(setNoemtVak(VAK_AAR, 'Aardrijkskunde')).toBe(true);
    expect(setNoemtVak(VAK_AAR, 'AARDRIJKSKUNDE')).toBe(true);
    expect(setNoemtVak(WISKUNDE, 'Wiskunde')).toBe(true);
    expect(setNoemtVak(WISKUNDE, 'Aardrijkskunde')).toBe(false);
    expect(setNoemtVak({ naam: 'Secundair onderwijs 2de graad -  Économie - Cesuurdoelen' }, 'economie')).toBe(true);
  });

  it('een vak als "aardrijkskunde" hoort volgens de zoektabel ook bij "Ruimtelijk bewustzijn" (een hulp, geen koppeling)', () => {
    expect(setNoemtVak(RUIMTE_NU, 'Aardrijkskunde')).toBe(true);
    expect(setNoemtVak(RUIMTE_NU, 'Wiskunde')).toBe(false);
  });

  it('een vakwoord van minstens vijf letters vindt ook het begin van een woord in de naam; een korter woord alleen het hele woord', () => {
    const nw = set('ODS_1', 'Natuurwetenschappen', 'Secundair onderwijs 2de graad -  Natuurwetenschappen - Cesuurdoelen');
    expect(setNoemtVak(nw, 'Natuur')).toBe(true);
    expect(setNoemtVak(nw, 'natu')).toBe(false);
    expect(setNoemtVak(nw, 'natuurwetenschappen')).toBe(true);
    expect(setNoemtVak({ naam: 'Secundair onderwijs 2de graad -  Taal en cultuur - Cesuurdoelen' }, 'taal')).toBe(true);
    expect(setNoemtVak({ naam: 'Secundair onderwijs 2de graad -  Taalbeschouwing - Cesuurdoelen' }, 'taal')).toBe(false);
  });

  it('zonder vak (of met alleen korte woorden) noemt geen enkele set het vak', () => {
    expect(setNoemtVak(VAK_AAR, '')).toBe(false);
    expect(setNoemtVak(VAK_AAR, '  ')).toBe(false);
    expect(setNoemtVak(VAK_AAR, 'en')).toBe(false);
  });

  it('geeft dezelfde uitkomst als de volgorde in kandidaatSets', () => {
    const index = [WISKUNDE, BEWEGEN, RUIMTE_OUD, VAK_AAR, RUIMTE_NU];
    const ids = kandidaatSets(index, OPTIES).map((s) => s.id);
    const noemen = ids.filter((id) => setNoemtVak(index.find((s) => s.id === id)!, OPTIES.vak));
    expect(ids.slice(0, noemen.length).sort()).toEqual([...noemen].sort());
  });
});

describe('kandidaatSets met richtingSets (het kader van een studierichting)', () => {
  const index = [WISKUNDE, BEWEGEN, RUIMTE_OUD, VAK_AAR, RUIMTE_NU];

  it('de lijst blijft beperkt tot de kadersets, ook als andere sets bij graad en stroom passen', () => {
    const ids = kandidaatSets(index, { ...OPTIES, richtingSets: ['ODS_2126', 'ODS_2118'] }).map((s) => s.id);
    expect(ids.sort()).toEqual(['ODS_2118', 'ODS_2126']);
  });

  it('het vak staat eerst, daarna de rest van het kader (op naam)', () => {
    const ids = kandidaatSets(index, { ...OPTIES, richtingSets: ['ODS_2126', 'ODS_2438', 'ODS_2118', 'ODS_3287'] }).map((s) => s.id);
    expect(ids.slice(0, 2).sort()).toEqual(['ODS_2118', 'ODS_3287']);
    expect(ids.slice(2)).toEqual(['ODS_2438', 'ODS_2126']);
  });

  it('graad, stroom en soort onderwijs van de opties sluiten geen kaderset uit: het kader heeft al beslist', () => {
    const ids = kandidaatSets(index, { graad: '3de graad', stroom: 'B-stroom', onderwijs: 'buso', vak: '', eigen: [], richtingSets: ['ODS_2126'] }).map((s) => s.id);
    expect(ids).toEqual(['ODS_2126']);
  });

  it('een kaderset die de index niet kent, verschijnt niet', () => {
    expect(kandidaatSets(index, { ...OPTIES, richtingSets: ['ODS_9999'] })).toEqual([]);
  });

  it('een leeg kader laat niets over, behalve de sets die het leerplan al had (die blijven vooraan)', () => {
    expect(kandidaatSets(index, { ...OPTIES, richtingSets: [] })).toEqual([]);
    const ids = kandidaatSets(index, { ...OPTIES, richtingSets: [], eigen: ['ODS_2126'] }).map((s) => s.id);
    expect(ids).toEqual(['ODS_2126']);
  });

  it('sets die het leerplan al had staan vooraan, zonder dubbele, ook buiten het kader', () => {
    const ids = kandidaatSets(index, { ...OPTIES, richtingSets: ['ODS_2118', 'ODS_3287'], eigen: ['ODS_2126', 'ODS_2118'] }).map((s) => s.id);
    expect(ids).toEqual(['ODS_2126', 'ODS_2118', 'ODS_3287']);
  });

  it('zonder de optie verandert er niets', () => {
    const zonder = kandidaatSets(index, OPTIES).map((s) => s.id);
    expect(kandidaatSets(index, { ...OPTIES, richtingSets: undefined }).map((s) => s.id)).toEqual(zonder);
  });
});

describe.runIf(existsSync(join(process.cwd(), 'public', 'leerplannen', 'minimumdoelen', 'index.json')))('kandidaatSets met de meegeleverde index', () => {
  const index = (JSON.parse(readFileSync(join(process.cwd(), 'public', 'leerplannen', 'minimumdoelen', 'index.json'), 'utf8')) as MinimumdoelenIndex).sets;

  it('aardrijkskunde, 1ste graad A-stroom: de vakset en "Ruimtelijk bewustzijn" staan in de eerste vijf', () => {
    const ids = kandidaatSets(index, OPTIES).map((s) => s.id);
    expect(ids.indexOf('ODS_3287')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('ODS_3287')).toBeLessThan(5);
    expect(ids.indexOf('ODS_2118')).toBeLessThan(5);
  });
});

describe('geldigheid voor in een lijst', () => {
  const bestand = (kop: Partial<MinimumdoelenSetBestand['set']>, doelen: MinimumdoelenSetBestand['doelen'] = []): MinimumdoelenSetBestand => ({
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: { id: 'ODS_1', naam: 'Set', sleutelcompetenties: [], bron: '', api: '', naamsvermelding: '', licentie: '', opgehaald: '', aantal: doelen.length, sha256: 'x', ...kop },
    doelen,
  });
  const doelMet = (type: string, van: string, tot?: string) => ({
    id: '1', code: '1', tekst: 'x', extra: { geldigheid: { type, geldig_van_dt: van, ...(tot ? { geldig_tot_dt: tot } : {}) } },
  });

  it('uit de index, als die ze kent', () => {
    const g = geldigheidVoorLijst(set('ODS_1', 'A', 'Set', { geldigheid: 'Niet meer geldig', geldigVan: '1997-09-01', geldigTot: '2020-08-31' }));
    expect(g).toEqual({ code: 'N', tekst: 'Niet meer geldig (1997–2020)' });
  });

  it('anders uit het geladen bestand: de kop, of de doelen zelf (oudere bestanden)', () => {
    const zonderGegevens = set('ODS_1', 'A', 'Set');
    expect(geldigheidVoorLijst(zonderGegevens, bestand({ geldigheid: 'Geldig', geldigVan: '2024-09-01' }))).toEqual({ code: 'G', tekst: 'Geldig sinds 2024' });
    const oud = bestand({}, [doelMet('Niet meer geldig', '1997-09-01', '2020-08-31')]);
    expect(geldigheidVoorLijst(zonderGegevens, oud)).toEqual({ code: 'N', tekst: 'Niet meer geldig (1997–2020)' });
    expect(geldigheidVanBestand(oud)).toBe('N');
    expect(geldigheidTekstVanBestand(oud)).toBe('Niet meer geldig (1997–2020)');
  });

  it('zonder index en zonder bestand: onbekend', () => {
    expect(geldigheidVoorLijst(set('ODS_1', 'A', 'Set'))).toEqual({});
  });

  it('geldigheidJaren: de jaren in een zin, of niets', () => {
    expect(geldigheidJaren({ geldigVan: '1997-09-01', geldigTot: '2020-08-31' })).toBe('1997–2020');
    expect(geldigheidJaren({ geldigVan: '2019-09-01', geldigTot: '2019-12-31' })).toBe('2019');
    expect(geldigheidJaren({ geldigTot: '2020-08-31' })).toBe('tot 2020');
    expect(geldigheidJaren({ geldigVan: '1997-09-01' })).toBe('ze golden sinds 1997');
    expect(geldigheidJaren({})).toBeUndefined();
    expect(geldigheidJaren({ geldigVan: 'ooit' })).toBeUndefined();
  });
});

describe('gemengdeStromen', () => {
  it('alleen als zowel de A- als de B-stroom voorkomt', () => {
    expect(gemengdeStromen([{ stroom: 'A-stroom' }, { stroom: 'B-stroom' }])).toBe(true);
    expect(gemengdeStromen([{ stroom: 'A-stroom' }, { stroom: 'A-stroom' }])).toBe(false);
    expect(gemengdeStromen([{ stroom: 'B-stroom' }, {}])).toBe(false);
    expect(gemengdeStromen([{ stroom: 'a stroom' }, { stroom: 'B-Stroom' }])).toBe(true);
    expect(gemengdeStromen([])).toBe(false);
    expect(gemengdeStromen([{ stroom: 'Basisgeletterdheid' }, { stroom: 'A-stroom' }])).toBe(false);
  });
});
