import { describe, expect, it } from 'vitest';
import { paginaTitel, volgRoute } from './paginaTitel';

describe('paginaTitel', () => {
  it('geeft per route een label met de merknaam erachter', () => {
    const verwacht: [string, string][] = [
      ['/', 'Start'],
      ['/widgets', 'Oefeningen'],
      ['/nieuw', 'Nieuwe oefening'],
      ['/bewerk/abc123', 'Oefening bewerken'],
      ['/print/abc123', 'Afdrukken'],
      ['/cursussen', 'Cursussen'],
      ['/cursussen/richtingen', 'Studierichtingen'],
      ['/cursussen/richtingen/G-0193', 'Studierichtingen'],
      ['/cursus/lees/ABC123', 'Cursus'],
      ['/cursus/open', 'Cursus'],
      ['/cursus/bewerk/c1', 'Cursus bewerken'],
      ['/cursus/volg/c1', 'Cursus volgen'],
      ['/klassen', 'Klassen'],
      ['/klas/k1', 'Klas'],
      ['/inleverpunt', 'Inleverpunt'],
      ['/resultaten', 'Resultaten'],
      ['/resultaten/w1', 'Resultaten'],
      ['/leerplannen', 'Leerplannen'],
      ['/leerplannen/minimumdoelen/x', 'Leerplannen'],
      ['/speel/ABC123', 'Oefening'],
      ['/open', 'Oefening'],
      ['/meedoen', 'Meedoen'],
      ['/voortgang', 'Mijn voortgang'],
      ['/leerling/KLAS01', 'Mijn klas'],
      ['/klas/open', 'Mijn klas'],
      ['/hulp', 'Hulp'],
      ['/privacy', 'Privacy en opslag'],
    ];
    for (const [pad, label] of verwacht) expect(paginaTitel(pad), pad).toBe(`${label} · Boosterz`);
  });

  it('neemt het langste passende voorvoegsel, niet een gelijkaardig begin', () => {
    expect(paginaTitel('/klassen')).toBe('Klassen · Boosterz');
    expect(paginaTitel('/klas/open')).toBe('Mijn klas · Boosterz');
    expect(paginaTitel('/openbaar')).toBe('Meedoen · Boosterz');
  });

  it('toont het richtingenscherm als "Studierichtingen" en laat de gewone cursussen "Cursussen" heten', () => {
    expect(paginaTitel('/cursussen/richtingen')).toBe('Studierichtingen · Boosterz');
    expect(paginaTitel('/cursussen/richtingen/')).toBe('Studierichtingen · Boosterz');
    expect(paginaTitel('/cursussen/richtingen/G-0307')).toBe('Studierichtingen · Boosterz');
    expect(paginaTitel('/cursussen')).toBe('Cursussen · Boosterz');
    expect(paginaTitel('/cursussen/andere')).toBe('Cursussen · Boosterz');
    expect(paginaTitel('/cursussenlijst')).toBe('Meedoen · Boosterz');
  });

  it('negeert een slotslash en toont onbekende paden als de meedoenpagina', () => {
    expect(paginaTitel('/widgets/')).toBe('Oefeningen · Boosterz');
    expect(paginaTitel('')).toBe('Start · Boosterz');
    expect(paginaTitel('/main')).toBe('Meedoen · Boosterz');
  });

  it('gebruikt op geen enkele route het woord "widget" (ook niet in de leerkrachtschil)', () => {
    for (const pad of [
      '/', '/widgets', '/nieuw', '/bewerk/abc123', '/print/abc123', '/resultaten', '/resultaten/w1', '/ai-studio', '/importeren',
      '/cursussen', '/cursus/bewerk/c1', '/klassen', '/klas/k1', '/leerplannen', '/hulp', '/privacy',
      '/speel/ABC123', '/open', '/meedoen', '/voortgang', '/leerling/KLAS01', '/klas/open', '/cursus/lees/ABC123', '/cursus/open', '/main',
    ]) {
      expect(paginaTitel(pad), pad).not.toMatch(/widget/i);
    }
  });
});

describe('volgRoute', () => {
  it('zet de titel meteen en bij elke routewissel', () => {
    let pad = '/widgets';
    let luisteraar: () => void = () => {};
    const router = {
      get state() { return { location: { pathname: pad } }; },
      subscribe: (fn: () => void) => { luisteraar = fn; return () => {}; },
    };
    const titels: string[] = [];
    volgRoute(router, (t) => titels.push(t));
    expect(titels).toEqual(['Oefeningen · Boosterz']);
    pad = '/klassen';
    luisteraar();
    expect(titels).toEqual(['Oefeningen · Boosterz', 'Klassen · Boosterz']);
  });
});
