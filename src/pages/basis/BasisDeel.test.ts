// De schil en de voorlopige schermen van het deel basisonderwijs (renderToStaticMarkup in een StaticRouter).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { VAK_ICONEN, VAK_TINTEN, vakIcoon, vakTint } from '../../components/basis/vakIconen';
import { vakSlug } from '../../lib/basis/basisRoutes';
import { BasisDeel } from './BasisDeel';

function pagina(pad: string): string {
  // useLayoutEffect geeft op de server een waarschuwing die hier niet ter zake doet.
  const spion = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return renderToStaticMarkup(
      createElement(StaticRouter, { location: pad }, createElement(Routes, null, createElement(Route, { path: '/basis/*', element: createElement(BasisDeel) }))),
    );
  } finally {
    spion.mockRestore();
  }
}

const tel = (html: string, patroon: RegExp) => (html.match(patroon) ?? []).length;

const PADEN = [
  '/basis',
  '/basis/kies',
  '/basis/leerjaar/gewoon/L3',
  '/basis/moment/gewoon/einde-4de',
  '/basis/vak/gewoon/einde-4de/wetenschap-en-techniek',
  '/basis/leerlijn/gewoon',
  '/basis/leerlijn/buitengewoon/ict',
  '/basis/doel/ODS_3408/92767',
  '/basis/zoek?q=schaduw',
  '/basis/zoek?q=WT.086',
  '/basis/go',
  '/basis/lesplannen?leerjaar=K1',
  '/basis/lessenlijn/wt/biologie-van-organismen',
  '/basis/xyz',
];

describe('BasisDeel en BasisSchil', () => {
  it.each(PADEN)('%s heeft precies één main, één h1 en de skiplink', (pad) => {
    const html = pagina(pad);
    expect(tel(html, /<main[\s>]/g)).toBe(1);
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('id="main"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toMatch(/<a class="skip-link" href="#main">Naar de inhoud<\/a>/);
  });

  it('de merklink heeft een spatie tussen "Boosterz" en "basisonderwijs", zodat de zichtbare tekst in de naam zit', () => {
    const html = pagina('/basis/go');
    expect(html).toMatch(/<span>Boosterz<\/span> <span class="b-pil">basisonderwijs<\/span>/);
  });

  it('heeft de navigatie, de themaknop en "Naar Boosterz"', () => {
    const html = pagina('/basis/leerjaar/gewoon/L3');
    expect(html).toContain('aria-label="Basisonderwijs"');
    for (const tekst of ['Mijn leerjaar', 'Doelen', 'Leerlijnen', 'Zoeken', 'GO!', 'Thema: ', 'Naar Boosterz']) expect(html).toContain(tekst);
    expect(html).toContain('href="/"');
    // De voet verwijst naar de pagina Privacy en opslag.
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('Privacy en opslag');
  });

  it('zet aria-current op het deel van de navigatie waar je bent', () => {
    const huidig = (pad: string) => [...pagina(pad).matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(huidig('/basis/leerjaar/gewoon/L3')).toEqual(['Mijn leerjaar']);
    expect(huidig('/basis/doel/ODS_3408/92767')).toEqual(['Doelen']);
    expect(huidig('/basis/vak/gewoon/einde-4de/ict')).toEqual(['Doelen']);
    expect(huidig('/basis/leerlijn/gewoon/ict')).toEqual(['Leerlijnen']);
    expect(huidig('/basis/zoek')).toEqual(['Zoeken']);
    for (const pad of ['/basis/go', '/basis/lesplannen', '/basis/lesplan/LP0065', '/basis/lessenlijn/wt/x', '/basis/leerplandoelen/wt', '/basis/leerplandoel/WT.086']) {
      expect(huidig(pad), pad).toEqual(['GO!']);
    }
    expect(huidig('/basis/xyz')).toEqual([]);
  });

  it('het item "GO!" is het vijfde van de navigatie en linkt naar het overzicht', () => {
    const nav = pagina('/basis/leerjaar/gewoon/L3').match(/<nav class="b-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect([...nav.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1])).toEqual(['Mijn leerjaar', 'Doelen', 'Leerlijnen', 'Zoeken', 'GO!']);
    expect(nav).toContain('href="/basis/go"');
  });

  it('op de schermen van het GO! staat de naamsvermelding van het GO! ook in de voet, elders niet', () => {
    const voet = (pad: string) => pagina(pad).match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(voet('/basis/go')).toContain('Leerplandoelen en lesplannen: GO! onderwijs van de Vlaamse Gemeenschap. Letterlijk overgenomen met toestemming.');
    expect(voet('/basis/lesplan/LP0065')).toContain('GO! onderwijs van de Vlaamse Gemeenschap');
    expect(voet('/basis/leerjaar/gewoon/L3')).not.toContain('GO! onderwijs van de Vlaamse Gemeenschap');
  });

  it('houdt de soort vast in de navigatie', () => {
    const html = pagina('/basis/leerlijn/buitengewoon/ict');
    expect(html).toContain('href="/basis/moment/buitengewoon/einde-4de"');
    expect(html).toContain('href="/basis/leerlijn/buitengewoon"');
  });

  it('de titels van de voorlopige schermen komen uit de route', () => {
    expect(pagina('/basis/leerjaar/gewoon/L3')).toContain('<h1>Wat geldt voor je 3de leerjaar?</h1>');
    expect(pagina('/basis/leerjaar/gewoon/K2')).toContain('<h1>Wat geldt voor je 2de kleuterklas?</h1>');
    expect(pagina('/basis/kies')).toContain('<h1>Kies je leerjaar</h1>');
  });

  it('de onbekende pagina heeft een eigen melding met links, en nooit de meedoenpagina', () => {
    const html = pagina('/basis/xyz');
    expect(html).toContain('Deze pagina bestaat niet in het deel basisonderwijs');
    expect(html).toContain('href="/basis"');
    expect(html).toMatch(/href="\/basis\/zoek[^"]*"[^>]*>Zoeken<\/a><\/li>/);
    expect(html).not.toMatch(/meedoen/i);
  });

  it('de voet zonder geladen index toont de vaste bronvermelding', () => {
    expect(pagina('/basis')).toContain('Bron: Onderwijsdoelen, Vlaamse overheid');
  });
});

describe('vakIconen', () => {
  it('heeft voor elk van de tien vakken een eigen icoon en een eigen tint', () => {
    for (let nr = 1; nr <= 10; nr++) {
      expect(vakSlug(nr), `vak ${nr}`).toBeDefined();
      expect(VAK_ICONEN[nr], `icoon ${nr}`).toBeDefined();
      expect(VAK_TINTEN[nr], `tint ${nr}`).toBeDefined();
    }
    expect(new Set(Object.values(VAK_ICONEN)).size).toBe(10);
    expect(new Set(Object.values(VAK_TINTEN)).size).toBe(10);
    expect(Object.values(VAK_TINTEN)).toEqual([25, 255, 150, 195, 65, 330, 110, 285, 0, 225]);
  });

  it('geeft voor een onbekend nummer een vervanger', () => {
    expect(vakIcoon(99)).toBe(VAK_ICONEN[1]);
    expect(vakTint(99)).toBe(285);
  });
});

describe('grenzen van het bestand', () => {
  const lees = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('BasisDeel gebruikt geen <Routes> of <Route> (dat kost +1,5 kB op het leerlingpad) en importeert basis.css', () => {
    const bron = lees('./BasisDeel.tsx').replace(/\/\/.*$/gm, '');
    expect(bron).not.toMatch(/<Routes|<Route[\s>]|useRoutes|createBrowserRouter|useNavigate/);
    expect(bron).toContain("import '../../styles/basis.css'");
  });

  it('alleen BasisDeel importeert basis.css, zodat het lettertype nooit in de hoofdbundel komt', () => {
    expect(lees('../../App.tsx')).not.toContain('basis.css');
    expect(lees('../../components/Layout.tsx')).not.toContain('basis.css');
  });
});
