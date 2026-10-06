import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fontRefsInCss } from './lettertypes';

const bundle = [
  'index.html', 'assets/index-abc.js', 'assets/index-abc.css',
  'assets/outfit-latin-AAA111.woff2', 'assets/atkinson-hyperlegible-400-latin-BBB222.woff2',
  'assets/logo-CCC333.png',
];

describe('fontRefsInCss', () => {
  it('vindt relatieve adressen (Vite met base "./"), met en zonder aanhalingstekens', () => {
    const css = '@font-face{src:url(./outfit-latin-AAA111.woff2) format("woff2")}'
      + "@font-face{src:url('./atkinson-hyperlegible-400-latin-BBB222.woff2')}";
    expect(fontRefsInCss(css, 'assets/index-abc.css', bundle)).toEqual({
      found: ['assets/atkinson-hyperlegible-400-latin-BBB222.woff2', 'assets/outfit-latin-AAA111.woff2'],
      missing: [],
    });
  });

  it('lost ook een pad vanaf de root en een adres met ?query of #fragment op', () => {
    const css = '@font-face{src:url("/assets/outfit-latin-AAA111.woff2?v=1#x")}';
    expect(fontRefsInCss(css, 'assets/index-abc.css', bundle).found).toEqual(['assets/outfit-latin-AAA111.woff2']);
  });

  it('negeert afbeeldingen, data:-lettertypes en externe adressen', () => {
    const css = '.a{background:url(./logo-CCC333.png)}'
      + '@font-face{src:url(data:font/woff2;base64,AAAA)}'
      + '@font-face{src:url(https://fonts.gstatic.com/s/outfit/v15/x.woff2)}';
    expect(fontRefsInCss(css, 'assets/index-abc.css', bundle)).toEqual({ found: [], missing: [] });
  });

  it('meldt een lettertype dat niet in de build zit (bv. een verkeerde base)', () => {
    const css = '@font-face{src:url(/Boosterz/assets/outfit-latin-AAA111.woff2)}';
    expect(fontRefsInCss(css, 'assets/index-abc.css', bundle)).toEqual({
      found: [], missing: ['/Boosterz/assets/outfit-latin-AAA111.woff2'],
    });
  });

  it('geeft elk bestand één keer, ook als meerdere gewichten hetzelfde bestand gebruiken', () => {
    const css = ['600', '700', '800'].map((w) => `@font-face{font-weight:${w};src:url(./outfit-latin-AAA111.woff2)}`).join('');
    expect(fontRefsInCss(css, 'assets/index-abc.css', bundle).found).toEqual(['assets/outfit-latin-AAA111.woff2']);
  });
});

describe('global.css', () => {
  const css = readFileSync(fileURLToPath(new URL('../styles/global.css', import.meta.url)), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const val = (face: string, prop: string) => new RegExp(`${prop}:\\s*([^;]+);`).exec(face)?.[1].trim();

  it('verwijst alleen naar eigen bestanden, nooit naar Google Fonts', () => {
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) expect(val(f, 'src')).toMatch(/^url\('\.\.\/assets\/fonts\/[\w-]+\.woff2'\) format\('woff2'\)$/);
  });

  it('heeft precies de stijlen die de app vroeger bij Google laadde, elk in latin en latin-ext, met swap', () => {
    const stijlen = faces.map((f) => `${val(f, 'font-family')} ${val(f, 'font-style')} ${val(f, 'font-weight')}`);
    const verwacht = [
      "'Atkinson Hyperlegible' normal 400", "'Atkinson Hyperlegible' normal 700", "'Atkinson Hyperlegible' italic 400",
      "'Outfit' normal 600", "'Outfit' normal 700", "'Outfit' normal 800",
    ];
    expect([...new Set(stijlen)].sort()).toEqual([...verwacht].sort());
    for (const s of verwacht) expect(stijlen.filter((x) => x === s)).toHaveLength(2);
    for (const f of faces) {
      expect(val(f, 'font-display')).toBe('swap');
      expect(val(f, 'unicode-range')).toMatch(/^U\+0(000|100)-/);
    }
  });

  it('elk bestand bestaat en is echt woff2, met een OFL-licentie erbij', () => {
    const dir = new URL('../assets/fonts/', import.meta.url);
    for (const f of faces) {
      const name = /fonts\/([\w-]+\.woff2)/.exec(val(f, 'src') ?? '')![1];
      const buf = readFileSync(fileURLToPath(new URL(name, dir)));
      expect(buf.subarray(0, 4).toString('latin1')).toBe('wOF2');
    }
    for (const lic of ['OFL-AtkinsonHyperlegible.txt', 'OFL-Outfit.txt']) {
      expect(readFileSync(fileURLToPath(new URL(lic, dir)), 'utf8')).toMatch(/SIL Open Font License, Version 1\.1/);
    }
  });
});
