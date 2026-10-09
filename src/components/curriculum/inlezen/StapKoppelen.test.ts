import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../../../lib/minimumdoelen';
import { lijstVoorTekst, zoekresultaatTeksten } from './StapKoppelen';

function set(patch: Partial<MinimumdoelenIndexSet>): MinimumdoelenIndexSet {
  return {
    id: 'ODS_1', naam: 'Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen', korteNaam: 'Biologie', graad: '2de graad', aantal: 10,
    sha256: 'x', opgehaald: '2026-10-01T00:00:00Z', bestand: 'ODS_1.json', ...patch,
  };
}

// De oude en de nieuwe versie van een set (zoals in de echte index): dezelfde naam, graad, stroom en context, enkel de geldigheid verschilt.
const OUD = set({ id: 'ODS_2966', geldigheid: 'Niet meer geldig', geldigVan: '2021-09-01', geldigTot: '2024-08-31' });
const NIEUW = set({ id: 'ODS_3132', geldigheid: 'Geldig', geldigVan: '2023-09-01' });

describe('zoekresultaatTeksten: de tekst bij een set in de zoekresultaten', () => {
  it('zonder richting: het nummer van de set staat erbij, zichtbaar en voor de schermlezer', () => {
    const t = zoekresultaatTeksten(NIEUW, false);
    expect(t.meta).toBe('2de graad · Cesuurdoelen · Geldig sinds 2023 · ODS_3132');
    expect(t.sr).toBe('Biologie (ODS_3132)');
  });

  it('met een richting: nergens een set-id', () => {
    for (const s of [OUD, NIEUW]) {
      const t = zoekresultaatTeksten(s, true);
      expect(t.meta).not.toMatch(/ODS_/);
      expect(t.sr).not.toMatch(/ODS_/);
    }
  });

  it('met een richting: de oude en de nieuwe versie klinken voor een schermlezer verschillend (de geldigheid)', () => {
    const oud = zoekresultaatTeksten(OUD, true).sr;
    const nieuw = zoekresultaatTeksten(NIEUW, true).sr;
    expect(oud).toBe('Biologie (2de graad · Cesuurdoelen · Niet meer geldig (2021–2024))');
    expect(nieuw).toBe('Biologie (2de graad · Cesuurdoelen · Geldig sinds 2023)');
    expect(oud).not.toBe(nieuw);
  });

  it('met een richting: de verborgen tekst is de zichtbare meta, zodat ziende en blinde gebruiker hetzelfde onderscheid krijgen', () => {
    const t = zoekresultaatTeksten(NIEUW, true);
    expect(t.sr).toBe(`Biologie (${t.meta})`);
  });

  it('met een richting en een set zonder kenmerken of geldigheid: enkel de naam, zonder lege haakjes', () => {
    const kaal = set({ graad: undefined, naam: 'Secundair onderwijs', korteNaam: 'Biologie' });
    expect(zoekresultaatTeksten(kaal, true)).toEqual({ meta: '', sr: 'Biologie' });
  });

  it('valt terug op de volledige naam als de korte naam ontbreekt', () => {
    expect(zoekresultaatTeksten(set({ korteNaam: undefined }), false).sr).toBe('Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen (ODS_1)');
  });
});

describe('lijstVoorTekst: waarvoor de sets in stap 3 gelden', () => {
  it('zonder richting: het soort onderwijs en het niveau uit stap 1, zoals altijd', () => {
    expect(lijstVoorTekst(undefined, 'so', '2de graad')).toBe('secundair onderwijs, 2de graad');
    expect(lijstVoorTekst(undefined, 'so', '')).toBe('secundair onderwijs');
  });

  it('met een richting: de richting, niet de graad of het soort uit stap 1 (die negeert de lijst)', () => {
    const tekst = lijstVoorTekst('Natuurwetenschappen (2de graad)', 'so', '3de graad');
    expect(tekst).toBe('Natuurwetenschappen (2de graad)');
    expect(tekst).not.toMatch(/3de graad|secundair/);
  });
});
