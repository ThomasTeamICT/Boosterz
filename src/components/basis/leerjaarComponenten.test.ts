// De onderdelen van de keuze van het leerjaar en de vakkaarten (renderToStaticMarkup in een StaticRouter) en de css van
// basis-leerjaar.css. Zonder bewaarde keuze: op de server is er geen opslag.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { INVOERINGSKALENDER } from '../../lib/basis/kalender';
import { KiesScherm } from '../../pages/basis/StartScherm';
import { LeerjaarBalk, LeerjaarKiezer, SnelZoeken } from './LeerjaarKiezer';
import { VakKaart, aantalTekst } from './VakKaart';
import { ZekerheidBadge } from './ZekerheidBadge';

function render(el: ReturnType<typeof createElement>, location = '/'): string {
  const spion = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return renderToStaticMarkup(createElement(StaticRouter, { location }, el));
  } finally {
    spion.mockRestore();
  }
}
const tel = (html: string, patroon: RegExp) => (html.match(patroon) ?? []).length;
const vak = (nr: number) => INVOERINGSKALENDER.vakken.find((v) => v.nr === nr)!;

describe('ZekerheidBadge', () => {
  it('toont niets bij zeker', () => {
    expect(render(createElement(ZekerheidBadge, { zekerheid: 'zeker' }))).toBe('');
  });
  it('toont de zekerheid als tekst bij waarschijnlijk en onzeker', () => {
    expect(render(createElement(ZekerheidBadge, { zekerheid: 'waarschijnlijk' }))).toBe('<span class="badge badge-warn">waarschijnlijk</span>');
    expect(render(createElement(ZekerheidBadge, { zekerheid: 'onzeker' }))).toBe('<span class="badge badge-warn">nog onzeker</span>');
  });
});

describe('VakKaart', () => {
  const basis = { soort: 'bao', eind: 'L4', vak: vak(3), aantal: 44, perSoort: [{ soort: 'populatie', aantal: 44 }] } as const;

  it('is een link naar de vakpagina met het leerjaar, met tegel, naam en aantal', () => {
    const html = render(createElement(VakKaart, { ...basis, leerjaar: 'L3' }));
    expect(html).toContain('href="/basis/vak/gewoon/einde-4de/wetenschap-en-techniek?leerjaar=L3"');
    expect(html).toContain('class="b-vaktegel"');
    expect(html).toContain('--h:150');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Wetenschap en techniek');
    expect(html).toContain('44 doelen · te bereiken (populatie)');
    expect(html).not.toContain('b-vakkaart-lamp');
    expect(html).not.toContain('badge');
  });

  it('heeft de lampstreep, de zekerheid en bij mag al vanaf wanneer het verplicht wordt', () => {
    const html = render(createElement(VakKaart, { ...basis, lampstreep: true, zekerheid: 'waarschijnlijk', verplichtVanaf: 2027 }));
    expect(html).toContain('b-vakkaart b-vakkaart-lamp');
    expect(html).toContain('waarschijnlijk');
    expect(html).toContain('verplicht vanaf 2027-2028');
  });

  it('aantalTekst: enkelvoud, één soort en twee soorten', () => {
    expect(aantalTekst(1, [{ soort: 'nastreven', aantal: 1 }])).toBe('1 doel · na te streven');
    expect(aantalTekst(42, [{ soort: 'populatie', aantal: 7 }, { soort: 'nastreven', aantal: 35 }])).toBe('42 doelen: 7 te bereiken (populatie) · 35 na te streven');
    expect(aantalTekst(5, [])).toBe('5 doelen');
  });
});

describe('LeerjaarKiezer', () => {
  const html = render(createElement(LeerjaarKiezer, { soort: 'bao', onSoort: () => {} }));

  it('heeft 2 knoppen met aria-pressed en 9 leerjaarknoppen in drie fieldsets met een legend', () => {
    expect(tel(html, /aria-pressed="/g)).toBe(2);
    expect(html).toContain('aria-pressed="true"');
    expect(tel(html, /class="b-leerjaarknop"/g)).toBe(9);
    expect(tel(html, /<fieldset/g)).toBe(3);
    expect(tel(html, /<legend>/g)).toBe(3);
    expect(html).toContain('Kleuterklassen · werken naar het einde van de kleuterklas');
    expect(html).toContain('1ste tot 4de leerjaar · werken naar het einde van het 4de leerjaar');
    expect(html).toContain('5de en 6de leerjaar · werken naar het einde van het 6de leerjaar');
  });

  it('heeft een zichtbare tekst op elke knop', () => {
    for (const t of ['1ste kleuterklas', '2de kleuterklas', '3de kleuterklas', '1ste leerjaar', '4de leerjaar', '6de leerjaar']) expect(html).toContain(t);
  });

  it('zonder bewaarde keuze is geen enkel leerjaar gemarkeerd', () => {
    expect(html).not.toContain('aria-current');
  });
});

describe('LeerjaarBalk', () => {
  it('toont het leerjaar, ander leerjaar en onthouden als het niet het bewaarde leerjaar is', () => {
    const html = render(createElement(LeerjaarBalk, { soort: 'bao', leerjaar: 'L3' }));
    expect(html).toContain('Leerjaar');
    expect(html).toContain('3de leerjaar');
    expect(html).toContain('gewoon onderwijs');
    expect(html).toContain('Onthoud als mijn leerjaar');
    expect(html).toContain('href="/basis/kies"');
    expect(html).toContain('Ander leerjaar');
  });

  it('laat de soort wisselen met twee links naar dezelfde pagina van de andere soort', () => {
    const html = render(createElement(LeerjaarBalk, { soort: 'bubao', leerjaar: 'K2' }));
    expect(html).toContain('href="/basis/leerjaar/gewoon/K2"');
    expect(html).toMatch(/<a class="b-pil-knop" aria-current="true" href="\/basis\/leerjaar\/buitengewoon\/K2">/);
    expect(html).toContain('2de kleuterklas');
  });
});

describe('SnelZoeken', () => {
  it('is een form role=search met een label en een knop', () => {
    const html = render(createElement(SnelZoeken, { soort: 'bao' }));
    expect(html).toContain('role="search"');
    expect(html).toMatch(/<label[^>]*for="b-snelzoek"/);
    expect(html).toContain('id="b-snelzoek"');
    expect(html).toContain('Zoek in alle doelen');
    expect(html).toContain('>Zoek</button>');
  });
  it('zegt waar gezocht wordt als er een leerjaar is', () => {
    expect(render(createElement(SnelZoeken, { soort: 'bao', leerjaar: 'K1' }))).toContain('Zoek in de doelen van het einde van de kleuterklas');
    expect(render(createElement(SnelZoeken, { soort: 'bao', leerjaar: 'L5' }))).toContain('Zoek in de doelen van het einde van het 6de leerjaar');
  });
});

describe('KiesScherm', () => {
  it('heeft één h1 en zonder bewaarde keuze geen Vergeet-knop', () => {
    const html = render(createElement(KiesScherm), '/basis/kies');
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('<h1>Kies je leerjaar</h1>');
    expect(html).not.toContain('Vergeet mijn leerjaar');
  });
});

describe('basis-leerjaar.css', () => {
  const css = readFileSync(fileURLToPath(new URL('../../styles/basis-leerjaar.css', import.meta.url)), 'utf8');
  const zonderCommentaar = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('elke selector begint met .b- of :root[data-deel=\'basis\']', () => {
    const zonder = zonderCommentaar.replace(/@media[^{]*\{/g, '{');
    const lijst: string[] = [];
    for (const m of zonder.matchAll(/([^{}]+)\{/g)) for (const s of m[1].split(',')) if (s.trim() !== '') lijst.push(s.trim());
    expect(lijst.length).toBeGreaterThan(30);
    for (const s of lijst) expect(s, s).toMatch(/^(:root\[data-deel='basis'\]|\.b-)/);
  });

  it('geen verloop, geen emoji, geen externe adressen, nooit --lamp als tekstkleur en geen witte tekst op --brand', () => {
    expect(zonderCommentaar).not.toMatch(/gradient\(/);
    expect(zonderCommentaar).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(zonderCommentaar).not.toMatch(/https?:\/\//);
    expect(zonderCommentaar).not.toMatch(/(^|[;{\s])color:\s*var\(--lamp\)/);
    for (const m of zonderCommentaar.matchAll(/\{([^{}]*)\}/g)) {
      if (/background(-color)?:\s*var\(--brand\)\s*[;}]?/.test(m[1])) expect(m[1]).not.toMatch(/(^|[;\s])color:\s*(#fff(fff)?|white)\b/i);
    }
  });

  it('gebruikt alleen tokens voor kleuren (geen hexcodes)', () => {
    expect(zonderCommentaar).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
