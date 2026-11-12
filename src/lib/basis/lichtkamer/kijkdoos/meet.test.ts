// De meetstand van de kijkdoos (zuiver).
import { describe, expect, it } from 'vitest';
import { MEET_VENSTER, Meter, meetGevraagd, meetTekst, percentiel } from './meet';

describe('meetstand', () => {
  it('?meet voor of na het hekje', () => {
    expect(meetGevraagd('https://x.github.io/Boosterz/#/basis/oefen/lichtkamer/einde-4de?meet')).toBe(true);
    expect(meetGevraagd('https://x.github.io/Boosterz/#/basis/oefen/lichtkamer/einde-4de?scherm=onderzoek-schaduw&meet=1')).toBe(true);
    expect(meetGevraagd('https://x.github.io/Boosterz/?meet#/basis')).toBe(true);
    expect(meetGevraagd('http://localhost:5001/?meet=')).toBe(true);
  });

  it('zonder meet, met meet=0 of met een ander woord: nee', () => {
    for (const h of [
      'https://x.github.io/Boosterz/#/basis/oefen/lichtkamer/einde-4de',
      'https://x.github.io/Boosterz/#/basis/oefen/lichtkamer/einde-4de?meet=0',
      'https://x.github.io/Boosterz/#/basis/meetlat',
      'https://x.github.io/Boosterz/#/basis/zoek?q=meet',
      'https://x.github.io/Boosterz/#/basis?meeting=1',
      '',
      null,
      undefined,
    ])
      expect(meetGevraagd(h as string), String(h)).toBe(false);
  });

  it('percentiel volgens de dichtstbijzijnde rang', () => {
    expect(percentiel([], 95)).toBeNaN();
    expect(percentiel([10], 95)).toBe(10);
    const honderd = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentiel(honderd, 50)).toBe(50);
    expect(percentiel(honderd, 95)).toBe(95);
    expect(percentiel(honderd, 100)).toBe(100);
    expect(percentiel(honderd, 0)).toBe(1);
    expect(percentiel([NaN, 5, Infinity], 50)).toBe(5);
  });

  it('de meter telt alleen aansluitende beelden mee in de tijd per beeld', () => {
    const m = new Meter();
    m.eersteBeeld(1234);
    m.eersteBeeld(9999); // het eerste blijft
    m.beeld(NaN, 3); // los beeld (op vraag)
    for (let i = 0; i < 19; i++) m.beeld(16, 2);
    m.beeld(80, 9);
    const v = m.verslag('midden', 'Testkaart');
    expect(v.eersteBeeldMs).toBe(1234);
    expect(v.beelden).toBe(21);
    expect(v.p50).toBe(16);
    expect(v.p95).toBe(16);
    expect(v.tekenP95).toBe(3);
    m.wis();
    expect(m.verslag('midden', '').p95).toBeNaN();
    expect(m.verslag('midden', '').beelden).toBe(21);
  });

  it('de meter onthoudt hoogstens het venster', () => {
    const m = new Meter();
    for (let i = 0; i < MEET_VENSTER + 50; i++) m.beeld(i < 50 ? 1000 : 10, 1);
    expect(m.verslag('laag', '').p95).toBe(10);
  });

  it('meetTekst in gewone taal, ook zonder metingen', () => {
    const regels = meetTekst(new Meter().verslag('laag', ''));
    expect(regels).toEqual([
      'Stand: laag',
      'Tekent met: onbekend',
      'Eerste beeld na: –',
      'Beelden: 0',
      'Tijd per beeld: p50 –, p95 –',
      'Tekenen zelf: p95 –',
    ]);
    const m = new Meter();
    m.eersteBeeld(812.4);
    m.beeld(16.6, 4.2);
    expect(meetTekst(m.verslag('hoog', 'Apple GPU'))).toContain('Tijd per beeld: p50 17 ms, p95 17 ms');
    expect(meetTekst(m.verslag('hoog', 'Apple GPU'))).toContain('Eerste beeld na: 812 ms');
  });
});
