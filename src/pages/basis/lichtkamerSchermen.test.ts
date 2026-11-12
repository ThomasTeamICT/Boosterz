// De drie schermen van de Lichtkamer (LK-8) als statische opmaak: renderToStaticMarkup, zonder jsdom. Effecten draaien niet,
// dus er laden geen gegevens en de kijkdoos opent niet; wat hier telt is wat er staat: koppen, knoppen, links, de kindlink,
// de schillen, en dat er geen naam, geen opslag en geen ontwikkelhaakjes in zitten.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BordSchil } from '../../components/basis/BordSchil';
import { KindSchil } from '../../components/basis/KindSchil';
import { basisPad } from '../../lib/basis/basisRoutes';
import { BasisDeel } from './BasisDeel';
import { LichtkamerBordScherm } from './LichtkamerBordScherm';
import { LichtkamerKindScherm } from './LichtkamerKindScherm';
import { LichtkamerPakketScherm } from './LichtkamerPakketScherm';

const tel = (html: string, patroon: RegExp) => (html.match(patroon) ?? []).length;
const tekstVan = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function inRouter(el: ReturnType<typeof createElement>, pad = '/'): string {
  const spion = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return renderToStaticMarkup(createElement(StaticRouter, { location: pad }, el));
  } finally {
    spion.mockRestore();
  }
}

function deel(pad: string): string {
  const spion = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return renderToStaticMarkup(
      createElement(StaticRouter, { location: pad }, createElement(Routes, null, createElement(Route, { path: '/basis/*', element: createElement(BasisDeel) }))),
    );
  } finally {
    spion.mockRestore();
  }
}

const pakket = (leerjaar?: 'L3' | 'L4') => inRouter(createElement(LichtkamerPakketScherm, { pakket: 'lichtkamer', leerjaar }));

describe('de lespagina', () => {
  const html = pakket();
  const koppen = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

  it('heeft één h1 met de naam van het pakket en geen eigen main (de schil levert die)', () => {
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('<h1>Lichtkamer: schaduwtheater</h1>');
    expect(tel(html, /<main[\s>]/g)).toBe(0);
  });

  it('heeft de delen van de voorbereiding in volgorde', () => {
    expect(koppen).toEqual(['Doel', 'Stand per leerjaar', 'Uitproberen', 'Op het bord', 'Voor de kinderen', 'Lesverloop met de spiekkaart', 'Meetblad', 'Observatieblad']);
  });

  it('toont de drie doelen met een link naar hun doelpagina, en de zinnen uit het lesmateriaal', () => {
    for (const id of ['92767', '92775', '92777']) expect(html).toContain(`href="/basis/doel/ODS_3408/${id}"`);
    expect(html).toContain('Ik weet dat licht in een rechte lijn gaat.');
    expect(html).toContain('Zo zie je dat het lukt:');
    expect(html).toContain('Het kind voert het klaargezette onderzoek uit en verandert alleen de afstand.');
  });

  it('zonder geladen set zegt ze dat de doelen laden en staat de rest van de pagina er al', () => {
    expect(html).toContain('De doelen worden geladen');
    expect(html).toContain('Als het misloopt bij een kind');
    expect(html).toContain('Plan B');
  });

  it('de stand per leerjaar: twee links, de gekozen heeft aria-current, bij L3 staat de noot', () => {
    const links = (h: string) =>
      [...h.matchAll(/<a ([^>]*href="\/basis\/pakket\/lichtkamer\/einde-4de\?leerjaar=L\d"[^>]*)>([^<]*)<\/a>/g)].map((m) => [/href="([^"]*)"/.exec(m[1])?.[1], m[1].includes('aria-current="true"'), m[2]]);
    expect(links(html)).toEqual([
      ['/basis/pakket/lichtkamer/einde-4de?leerjaar=L4', true, '4de leerjaar'],
      ['/basis/pakket/lichtkamer/einde-4de?leerjaar=L3', false, '3de leerjaar'],
    ]);
    const l3 = pakket('L3');
    expect(links(l3).map((l) => l[1])).toEqual([false, true]);
    expect(tekstVan(l3)).toContain('Werk je met een 3de leerjaar? Dan werk je naar deze doelen toe. Ze moeten bereikt zijn op het einde van het 4de leerjaar.');
    expect(tekstVan(html)).not.toContain('Werk je met een 3de leerjaar?');
  });

  it('Uitproberen laadt de oefeningen niet vóór de klik, en zegt dat er niets bewaard wordt', () => {
    expect(html).toContain('Er wordt niets bewaard.');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('b-lk-les');
  });

  it('heeft de uitleg voor het geval dat de 3D niet werkt, voor de leerkracht', () => {
    expect(tekstVan(html)).toContain('Werkt de 3D niet op een toestel? Dan staat WebGL uit of blokkeert het schoolnetwerk een bestand. Vraag het de ICT-coördinator.');
  });

  it('drie knoppen Afdrukken, een per blad; de spiekkaart is pas af te drukken als de doelen geladen zijn', () => {
    const knoppen = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attr: m[1], tekst: tekstVan(m[2]) }));
    expect(knoppen.map((k) => k.tekst).filter((t) => /afdrukken/i.test(t))).toEqual(['Afdrukken (de spiekkaart)', 'Meetblad afdrukken', 'Observatieblad afdrukken']);
    expect(knoppen.find((k) => k.tekst.startsWith('Afdrukken'))?.attr).toContain('disabled');
  });

  it('de bordlink en de presentertoetsen', () => {
    expect(html).toContain('href="/basis/bord/lichtkamer/einde-4de"');
    expect(tekstVan(html)).toContain('Geen namen in beeld, er wordt niets bewaard.');
    for (const toets of ['PageDown', 'PageUp', 'spatie']) expect(html).toContain(`<kbd>${toets}</kbd>`);
  });

  it('de kindlink staat in een veld met label, naast Link kopiëren en een melding met role=status; zonder namen of klascode', () => {
    const invoer = /<input id="lkp-kindlink"[^>]*value="([^"]*)"/.exec(html)?.[1];
    expect(invoer).toBe(`#${basisPad({ s: 'oefen', pakket: 'lichtkamer', eind: 'L4' })}`);
    expect(invoer).not.toMatch(/[?&](n|naam|klas|code)=/i);
    expect(html).toContain('<label for="lkp-kindlink"');
    expect(html).toContain('Link kopiëren');
    expect(html).toMatch(/<span role="status" class="b-lkp-gekopieerd"><\/span>/);
    expect(html).toContain('De QR-code wordt gemaakt.');
    expect(tekstVan(html)).toContain('De link bevat geen namen en geen klascode.');
  });

  it('bevat geen emoji, geen "widget" en niet de ontwikkelhaakjes', () => {
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(tekstVan(html).toLowerCase()).not.toContain('widget');
  });
});

describe('het kindscherm', () => {
  const html = inRouter(createElement(LichtkamerKindScherm, { pakket: 'lichtkamer' }));

  it('heeft één main en één h1 met de naam van het pakket', () => {
    expect(tel(html, /<main[\s>]/g)).toBe(1);
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('<h1>Lichtkamer: schaduwtheater</h1>');
    expect(html).toContain('id="main"');
  });

  it('toont het merk (geen link) en het menu met leesinstellingen, en geen navigatie van de leerkracht', () => {
    expect(html).toContain('Leesinstellingen');
    expect(html).toContain('<span>Boosterz</span>');
    expect(html).not.toContain('Naar Boosterz');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('aria-label="Basisonderwijs"');
    expect(html).not.toContain('href="/basis"');
    expect(html).not.toContain('Thema:');
  });

  it('toont de drie tegels van de keuze en geen naamveld', () => {
    for (const t of ['Drie kaartjes', 'Onderzoek', 'Waar valt de schaduw?']) expect(html).toContain(t);
    expect(html).not.toMatch(/<input[^>]*type="text"/);
    expect(tekstVan(html)).not.toMatch(/naam/i);
  });

  it('?scherm opent meteen die oefening', () => {
    const o = inRouter(createElement(LichtkamerKindScherm, { pakket: 'lichtkamer', scherm: 'onderzoek-schaduw' }));
    expect(o).not.toBe(html);
    expect(tel(o, /<h1[\s>]/g)).toBe(1);
    expect(tel(o, /<main[\s>]/g)).toBe(1);
  });
});

describe('het bordscherm', () => {
  const html = inRouter(createElement(LichtkamerBordScherm, { pakket: 'lichtkamer' }));

  it('heeft één main en één h1, en een onopvallende link terug naar de lespagina', () => {
    expect(tel(html, /<main[\s>]/g)).toBe(1);
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('<h1 class="b-bord-titel">Lichtkamer: schaduwtheater</h1>');
    expect(html).toMatch(/<a href="\/basis\/pakket\/lichtkamer\/einde-4de">Terug naar de lespagina<\/a>/);
  });

  it('heeft geen kop, geen navigatie en geen naamveld', () => {
    // De les heeft zijn eigen nav tussen de oefeningen; die van het basisdeel ontbreekt.
    expect(html).not.toContain('aria-label="Basisonderwijs"');
    expect(html).not.toContain('<header');
    expect(html).not.toContain('Naar Boosterz');
    expect(html).not.toMatch(/<input[^>]*type="text"/);
  });

  it('opent op de eerste oefening, met de klasvraag en de presentertoetsen van de les', () => {
    expect(html).toContain('Waar valt de schaduw?');
  });

  it('de schilen zijn los te gebruiken', () => {
    const k = inRouter(createElement(KindSchil, { titel: 'X', children: createElement('p', null, 'inhoud') }));
    expect(tel(k, /<main[\s>]/g)).toBe(1);
    const b = inRouter(createElement(BordSchil, { titel: 'Y', terug: '/basis', children: createElement('p', null, 'inhoud') }));
    expect(tel(b, /<h1[\s>]/g)).toBe(1);
    expect(b).toContain('href="/basis"');
  });
});

describe('BasisDeel kiest de schil', () => {
  it('de lespagina staat in de schil van de leerkracht, met de navigatie en één main en één h1', () => {
    const html = deel('/basis/pakket/lichtkamer/einde-4de');
    expect(tel(html, /<main[\s>]/g)).toBe(1);
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('aria-label="Basisonderwijs"');
    expect(html).toContain('Naar Boosterz');
    expect(html).toContain('Naar de inhoud');
    // De lespagina hoort bij geen enkel deel van de navigatie.
    expect(html).not.toMatch(/aria-current="page"/);
  });

  it.each(['/basis/oefen/lichtkamer/einde-4de', '/basis/bord/lichtkamer/einde-4de', '/basis/oefen/lichtkamer/einde-4de?meet&scherm=check'])(
    '%s heeft, ook tijdens het laden, één main, één h1 en geen schil van de leerkracht',
    (pad) => {
      const html = deel(pad);
      expect(tel(html, /<main[\s>]/g)).toBe(1);
      expect(tel(html, /<h1[\s>]/g)).toBe(1);
      expect(html).toContain('<h1>Lichtkamer: schaduwtheater</h1>');
      expect(html).not.toContain('aria-label="Basisonderwijs"');
      expect(html).not.toContain('Naar Boosterz');
      expect(html).not.toContain('<nav');
    },
  );

  it('een onbekend pakket of moment geeft de onbekende pagina in de gewone schil', () => {
    for (const pad of ['/basis/pakket/rekenen/einde-4de', '/basis/oefen/lichtkamer/einde-6de', '/basis/bord/lichtkamer']) {
      const html = deel(pad);
      expect(html, pad).toContain('Deze pagina bestaat niet in het deel basisonderwijs');
      expect(tel(html, /<main[\s>]/g)).toBe(1);
    }
  });
});

describe('grenzen van de bestanden', () => {
  const lees = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const BESTANDEN = [
    './LichtkamerPakketScherm.tsx',
    './LichtkamerKindScherm.tsx',
    './LichtkamerBordScherm.tsx',
    '../../components/basis/KindSchil.tsx',
    '../../components/basis/BordSchil.tsx',
    '../../components/basis/lichtkamer/Spiekkaart.tsx',
    '../../components/basis/lichtkamer/Bladen.tsx',
  ];

  it.each(BESTANDEN)('%s gebruikt geen localStorage, geen window.__lkKijkdoos en geen ontwikkelhaakjes', (rel) => {
    const bron = lees(rel);
    expect(bron).not.toMatch(/localStorage|__lkKijkdoos|indexedDB/);
  });

  it('de lespagina importeert three en de kijkdoos niet statisch: die laden pas na Uitproberen', () => {
    const bron = lees('./LichtkamerPakketScherm.tsx');
    expect(bron).not.toMatch(/from 'three|from '..\/..\/components\/basis\/kijkdoos/);
    expect(bron).toMatch(/lazy\(\(\) => import\('..\/..\/components\/basis\/lichtkamer\/LichtkamerLes'\)/);
    expect(bron).toMatch(/lazy\(\(\) => import\('..\/..\/components\/CodeQr'\)/);
  });
});
