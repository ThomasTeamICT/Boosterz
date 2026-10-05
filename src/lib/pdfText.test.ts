import { describe, expect, it } from 'vitest';
import { regelsUitTekstItems, type PdfTekstItem } from './pdfText';

/** Nagemaakt tekststuk zoals pdf.js het geeft: lettergrootte `g`, basislijn op (x, y). */
function stuk(str: string, x: number, y: number, opties: { g?: number; width?: number; hasEOL?: boolean } = {}): PdfTekstItem {
  const g = opties.g ?? 10;
  return { str, transform: [g, 0, 0, g, x, y], width: opties.width, hasEOL: opties.hasEOL };
}

describe('regelsUitTekstItems', () => {
  it('zet regels van boven naar onder en stukken van links naar rechts, ook in een andere volgorde', () => {
    const items = [
      stuk('tweede', 60, 688),
      stuk('regel', 100, 688),
      stuk('Eerste', 50, 700),
      stuk('regel', 90, 700),
    ];
    expect(regelsUitTekstItems(items)).toEqual(['Eerste regel', 'tweede regel']);
  });

  it('houdt kleine verschillen in de basislijn op één regel (bv. een voetnootcijfer)', () => {
    const items = [
      stuk('De leerlingen', 50, 700),
      stuk('situeren', 120, 700.4),
      stuk('1', 160, 703.3, { g: 6 }), // superscript
      stuk('plaatsen.', 170, 699.6),
      stuk('Volgende', 50, 688),
    ];
    expect(regelsUitTekstItems(items)).toEqual(['De leerlingen situeren 1 plaatsen.', 'Volgende']);
  });

  it('houdt regels met de gewone regelafstand apart, ook bij een strakke interlinie', () => {
    const items = [stuk('a', 50, 700), stuk('b', 50, 690), stuk('c', 50, 680)];
    expect(regelsUitTekstItems(items)).toEqual(['a', 'b', 'c']);
    // Een grote kop vlak boven gewone tekst: verschillende regels.
    expect(regelsUitTekstItems([stuk('Kop', 50, 700, { g: 24 }), stuk('tekst', 50, 690)])).toEqual(['Kop', 'tekst']);
  });

  it('zet twee kolommen op dezelfde hoogte op één regel, links eerst', () => {
    const items = [
      stuk('LPD 4 De leerlingen', 320, 700),
      stuk('LPD 1 De leerlingen', 50, 700),
      stuk('vergelijken.', 320, 688),
      stuk('situeren.', 50, 688),
    ];
    expect(regelsUitTekstItems(items)).toEqual(['LPD 1 De leerlingen LPD 4 De leerlingen', 'situeren. vergelijken.']);
  });

  it('plakt stukken zonder tussenruimte aan elkaar en zet anders een spatie', () => {
    const items = [
      stuk('verw', 50, 700, { width: 20 }),
      stuk('ering', 70, 700, { width: 22 }), // sluit precies aan: één woord
      stuk('van', 95, 700, { width: 15 }), // 3 eenheden tussenruimte: nieuw woord
      stuk('gesteenten', 112.5, 700, { width: 40 }), // 2,5 eenheden: nieuw woord
      stuk('.', 152.6, 700, { width: 2 }), // 0,1: hoort erbij
    ];
    expect(regelsUitTekstItems(items)).toEqual(['verwering van gesteenten.']);
  });

  it('zet een spatie als de breedte onbekend is, maar nooit een dubbele', () => {
    const items = [stuk('De ', 50, 700), stuk('leerlingen', 70, 700), stuk(' situeren', 130, 700), stuk('x', 200, 700)];
    expect(regelsUitTekstItems(items)).toEqual(['De leerlingen situeren x']);
  });

  it('een stuk met hasEOL eindigt een woord; lege stukken met hasEOL geven geen lege regel', () => {
    const items = [
      stuk('eind', 50, 700, { width: 20, hasEOL: true }),
      stuk('begin', 70, 700, { width: 20 }),
      { str: '', transform: [0, 0, 0, 0, 0, 0], hasEOL: true },
      stuk('volgende', 50, 688, { hasEOL: true }),
      { str: '', transform: [10, 0, 0, 10, 90, 688], hasEOL: true },
    ];
    expect(regelsUitTekstItems(items)).toEqual(['eind begin', 'volgende']);
  });

  it('vouwt witruimte samen en laat lege regels en kapotte stukken weg', () => {
    const items: PdfTekstItem[] = [
      stuk('  De   leerlingen\u00a0 ', 50, 700),
      stuk('   ', 50, 690),
      { str: 'zonder plaats', transform: [10, 0, 0, 10] },
      { str: 'NaN', transform: [10, 0, 0, 10, Number.NaN, 5] },
      stuk('rest', 50, 680),
    ];
    expect(regelsUitTekstItems(items)).toEqual(['De leerlingen', 'rest']);
    expect(regelsUitTekstItems([])).toEqual([]);
  });

  it('gebruikt de standaardtolerantie als de lettergrootte onbekend is', () => {
    const items: PdfTekstItem[] = [
      { str: 'a', transform: [0, 0, 0, 0, 50, 700] },
      { str: 'b', transform: [0, 0, 0, 0, 60, 698.5] },
      { str: 'c', transform: [0, 0, 0, 0, 50, 695] },
    ];
    expect(regelsUitTekstItems(items)).toEqual(['a b', 'c']);
  });

  it('leest de lettergrootte ook uit transform[0] als transform[3] nul is', () => {
    const items: PdfTekstItem[] = [
      { str: 'a', transform: [12, 0, 0, 0, 50, 700] },
      { str: 'b', transform: [12, 0, 0, 0, 60, 696] },
      { str: 'c', transform: [12, 0, 0, 0, 50, 686] },
    ];
    expect(regelsUitTekstItems(items)).toEqual(['a b', 'c']);
  });
});
