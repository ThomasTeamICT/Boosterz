// Bewaakt de vormgeving "Lamplicht" van het deel basisonderwijs (src/styles/basis.css): het contrast van de tokens, een
// donker blok met dezelfde sleutels als het lichte, de gescopete selectors en wat verboden is. De tokens worden over de
// globale gelegd zoals de cascade het doet; de lijst paren volgt src/lib/color.test.ts en breidt ze uit.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToHex } from '../color';

const lees = (pad: string) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const GLOBAAL = lees('../../styles/global.css');
const BASIS = lees('../../styles/basis.css');
const LICHTKAMER = lees('../../styles/basis-lichtkamer.css');

/** De tokens (`--naam: waarde`) van het blok dat met `selector {` begint. */
function tokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `blok ${selector} niet gevonden`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('}', start));
  const uit: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) uit[m[1]] = m[2].trim();
  return uit;
}

const BASIS_LICHT_SEL = ":root[data-deel='basis']";
const BASIS_DONKER_SEL = ":root[data-deel='basis'][data-theme='dark']";

const GLOBAAL_LICHT = tokens(GLOBAAL, ':root');
const GLOBAAL_DONKER = tokens(GLOBAAL, "[data-theme='dark']");
const BASIS_LICHT = tokens(BASIS, BASIS_LICHT_SEL);
const BASIS_DONKER = tokens(BASIS, BASIS_DONKER_SEL);
// De kijkdoos heeft eigen tokens ('stage') in basis-lichtkamer.css, met nieuwe namen: ze botsen niet met die van basis.css.
const LK_LICHT = tokens(LICHTKAMER, BASIS_LICHT_SEL);
const LK_DONKER = tokens(LICHTKAMER, BASIS_DONKER_SEL);

// Wat de browser toont: de globale tokens met het basisblok erover (en de tokens van de Lichtkamer erbij).
const LICHT = { ...GLOBAAL_LICHT, ...BASIS_LICHT, ...LK_LICHT };
const DONKER = { ...GLOBAAL_LICHT, ...GLOBAAL_DONKER, ...BASIS_LICHT, ...BASIS_DONKER, ...LK_DONKER };
const THEMAS = { licht: LICHT, donker: DONKER };

/** De paren van color.test.ts, aangevuld met de lampgele vlakken en elke tekst op elk vlak. */
const PAREN: [fg: string, bg: string, min: number][] = [
  ['text', 'bg', 7],
  ['text-soft', 'bg', 4.5],
  ['text-soft', 'bg-raised', 4.5],
  ['text-faint', 'bg', 4.5],
  ['text-faint', 'bg-raised', 4.5],
  ['text-faint', 'bg-sunken', 4.5],
  ['brand', 'bg-raised', 4.5],
  ['brand', 'brand-soft', 4.5],
  ['text-soft', 'brand-soft', 4.5],
  ['ok', 'bg-raised', 4.5],
  ['warn', 'bg-raised', 4.5],
  ['err', 'bg-raised', 4.5],
  ['ok', 'bg', 4.5],
  ['warn', 'bg', 4.5],
  ['err', 'bg', 4.5],
  ['ok-text', 'ok-soft', 4.5],
  ['warn-text', 'warn-soft', 4.5],
  ['err-text', 'err-soft', 4.5],
  // Nieuw voor dit deel
  ['text', 'bg-raised', 7],
  ['text', 'bg-sunken', 7],
  ['text-soft', 'bg-sunken', 4.5],
  ['brand', 'bg', 4.5],
  ['brand', 'bg-sunken', 4.5],
  ['text', 'lamp-soft', 7],
  ['brand', 'lamp-soft', 4.5],
  ['text-soft', 'lamp-soft', 4.5],
  ['accent', 'bg-raised', 4.5],
  ['line-strong', 'bg-raised', 3],
  ['line-strong', 'bg', 3],
  ['on-lamp', 'lamp', 4.5],
  // De gekozen pil: var(--text) als vlak, var(--bg-raised) als tekst.
  ['bg-raised', 'text', 7],
];

/** De tinten van de tien vakken (vaste tabel, zie INGANG.md). */
const VAK_TINTEN: Record<string, number> = { NL: 25, WI: 255, WT: 150, AK: 195, GE: 65, MV: 330, LO: 110, ICT: 285, ATT: 0, FR: 225 };

describe('kleurtokens van het basisdeel', () => {
  it.each(Object.entries(THEMAS))('elk paar haalt zijn minimum (%s)', (naam, tk) => {
    for (const [fg, bg, min] of PAREN) {
      expect(tk[fg], `${naam}: token ${fg}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tk[bg], `${naam}: token ${bg}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrastRatio(tk[fg], tk[bg]), `${naam}: ${fg} op ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it.each(Object.entries(THEMAS))('witte tekst op gevulde vlakken haalt 4,5 : 1 (%s)', (naam, tk) => {
    for (const k of ['brand-fill', 'brand-fill-strong', 'accent-fill', 'ok-strong', 'err-strong']) {
      expect(contrastRatio(tk[k], '#ffffff'), `${naam}: ${k}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(Object.entries(THEMAS))('de tien vaktegels: icoon 4,5 : 1 en tekst 7 : 1 op de tegel (%s)', (naam, tk) => {
    for (const [vak, tint] of Object.entries(VAK_TINTEN)) {
      const tegel = oklchToHex(Number(tk['tile-l']), Number(tk['tile-c']), tint);
      const icoon = oklchToHex(Number(tk['icon-l']), Number(tk['icon-c']), tint);
      expect(contrastRatio(tegel, icoon), `${naam}: icoon ${vak}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tegel, tk.text), `${naam}: tekst ${vak}`).toBeGreaterThanOrEqual(7);
    }
  });

  it('de verboden combinaties zijn echt verboden: lamp als tekst en wit op brand in donker halen het niet', () => {
    // Dit legt vast waarom de regels bestaan; haalt een combinatie het ooit wel, dan mag de regel herzien worden.
    expect(contrastRatio(LICHT.lamp, LICHT['bg-raised'])).toBeLessThan(3);
    expect(contrastRatio(DONKER.brand, '#ffffff')).toBeLessThan(4.5);
  });
});

describe('blokken van basis.css', () => {
  it('het donkere blok heeft dezelfde sleutels als het lichte', () => {
    expect(Object.keys(BASIS_DONKER).sort()).toEqual(Object.keys(BASIS_LICHT).sort());
    expect(Object.keys(BASIS_LICHT).length).toBe(38);
  });

  it('lettertype en afrondingen staan in beide blokken, en alle kleuren zijn hexwaarden', () => {
    for (const blok of [BASIS_LICHT, BASIS_DONKER]) {
      expect(blok['font-display']).toMatch(/^'Fredoka', 'Outfit'/);
      expect([blok['radius-s'], blok['radius-m'], blok['radius-l']]).toEqual(['10px', '16px', '24px']);
    }
    const getal = new Set(['tile-l', 'tile-c', 'icon-l', 'icon-c']);
    for (const [k, v] of Object.entries(BASIS_LICHT)) {
      if (k === 'font-display' || k.startsWith('radius') || getal.has(k)) continue;
      expect(v, k).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('het lichte blok staat buiten @media screen, het donkere erin', () => {
    const donker = BASIS.indexOf(`${BASIS_DONKER_SEL} {`);
    const media = BASIS.lastIndexOf('@media screen {', donker);
    expect(media).toBeGreaterThanOrEqual(0);
    expect(BASIS.slice(media, donker)).not.toMatch(/\}\s*\n\}/);
    expect(BASIS.indexOf(`${BASIS_LICHT_SEL} {`)).toBeLessThan(media);
    expect(BASIS.indexOf(`${BASIS_LICHT_SEL} {`)).toBeGreaterThanOrEqual(0);
  });
});

/** De selectors van alle gewone regels (zonder @font-face en zonder de wikkel van een @media). */
function selectors(css: string): string[] {
  const zonder = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@font-face\s*\{[^}]*\}/g, '')
    .replace(/@supports[^{]*\{/g, '{')
    .replace(/@media[^{]*\{/g, '{');
  const uit: string[] = [];
  for (const m of zonder.matchAll(/([^{}]+)\{/g)) {
    const lijst = m[1].trim();
    if (lijst === '') continue;
    // Komma's binnen :is(...) of :not(...) horen bij één selector.
    let diepte = 0;
    let huidig = '';
    for (const ch of lijst) {
      if (ch === '(') diepte++;
      if (ch === ')') diepte--;
      if (ch === ',' && diepte === 0) {
        uit.push(huidig.trim());
        huidig = '';
      } else huidig += ch;
    }
    uit.push(huidig.trim());
  }
  return uit;
}

describe('selectors van basis.css', () => {
  it('elke selector begint met :root[data-deel=\'basis\'] of met .b-', () => {
    const lijst = selectors(BASIS);
    expect(lijst.length).toBeGreaterThan(20);
    for (const s of lijst) expect(s, s).toMatch(/^(:root\[data-deel='basis'\]|\.b-)/);
  });

  it('de lettertype-regel staat alleen hier en verwijst naar een eigen bestand', () => {
    expect(GLOBAAL).not.toMatch(/Fredoka/);
    const faces = [...BASIS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatch(/font-family:\s*'Fredoka'/);
    expect(faces[0]).toMatch(/font-weight:\s*300 700/);
    expect(faces[0]).toMatch(/font-display:\s*swap/);
    expect(faces[0]).toMatch(/src:\s*url\('\.\.\/assets\/fonts\/fredoka-latin\.woff2'\) format\('woff2'\)/);
  });

  it('het lettertype is een echt woff2-bestand en de licentie is de OFL', () => {
    const woff = readFileSync(new URL('../../assets/fonts/fredoka-latin.woff2', import.meta.url));
    expect(woff.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(lees('../../assets/fonts/OFL-Fredoka.txt')).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
    expect(lees('../../assets/fonts/LEESMIJ.md')).toMatch(/fredoka-latin\.woff2/);
  });
});

describe('verboden in basis.css', () => {
  const zonderCommentaar = BASIS.replace(/\/\*[\s\S]*?\*\//g, '');

  it('geen Google Fonts of andere externe adressen', () => {
    expect(zonderCommentaar).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|https?:\/\//);
  });

  it('nooit --lamp als tekstkleur', () => {
    expect(zonderCommentaar).not.toMatch(/(^|[;{\s])color:\s*var\(--lamp\)/);
  });

  it('nooit witte tekst op --brand', () => {
    // Een regel die achtergrond --brand en een witte tekst samen zet, is fout: gebruik --brand-fill.
    for (const m of zonderCommentaar.matchAll(/\{([^{}]*)\}/g)) {
      const regel = m[1];
      if (/background(-color)?:\s*var\(--brand\)\s*[;}]?/.test(regel)) {
        expect(regel, regel).not.toMatch(/(^|[;\s])color:\s*(#fff(fff)?|white)\b/i);
      }
    }
  });

  it('geen verloop en geen emoji', () => {
    expect(zonderCommentaar).not.toMatch(/gradient\(/);
    expect(zonderCommentaar).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

// ── Alle css van het basisdeel: de schermen naast basis.css ─────────────────

const STIJLEN = new URL('../../styles/', import.meta.url);
/**
 * basis-doelen.css, basis-lesplan.css …: elk scherm van het basisdeel heeft een eigen bestand met de tokens van basis.css.
 * basis-moment.css is de uitzondering: het staat op de pagina Officiële minimumdoelen, buiten het basisdeel, met de
 * globale tokens en eigen .md-klassen.
 */
const BUITEN_HET_BASISDEEL = new Set(['basis-moment.css']);
const SCHERMBESTANDEN = readdirSync(STIJLEN)
  .filter((f) => /^basis-.+\.css$/.test(f) && !BUITEN_HET_BASISDEEL.has(f))
  .sort();
const ZONDER_COMMENTAAR = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('css van de schermen van het basisdeel (basis-*.css)', () => {
  it('bevat minstens het scherm van het lesplan', () => {
    expect(SCHERMBESTANDEN).toContain('basis-lesplan.css');
  });

  describe.each(SCHERMBESTANDEN)('%s', (bestand) => {
    const css = lees(`../../styles/${bestand}`);
    const kaal = ZONDER_COMMENTAAR(css);

    it('gebruikt geen :has(): dat kent Safari pas vanaf 15.4, en het basisdeel richt zich op Safari 14 (vite.config.ts)', () => {
      expect(kaal).not.toContain(':has(');
    });

    it("elke selector begint met :root[data-deel='basis'] of met .b-", () => {
      const lijst = selectors(css);
      expect(lijst.length).toBeGreaterThan(0);
      for (const s of lijst) expect(s, s).toMatch(/^(:root\[data-deel='basis'\]|\.b-)/);
    });

    it('gebruikt alleen tokens die in het lichte en het donkere blok bestaan', () => {
      const gebruikt = new Set([...kaal.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]));
      // --player-accent en dergelijke horen niet bij dit deel; alleen wat deze css zelf met var() gebruikt telt.
      for (const naam of gebruikt) {
        expect(LICHT[naam], `licht: --${naam}`).toBeDefined();
        expect(DONKER[naam], `donker: --${naam}`).toBeDefined();
      }
    });

    it('geen externe adressen, geen verloop, geen emoji, nooit --lamp als tekstkleur', () => {
      expect(kaal).not.toMatch(/https?:\/\//);
      expect(kaal).not.toMatch(/gradient\(/);
      expect(kaal).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(kaal).not.toMatch(/(^|[;{\s])color:\s*var\(--lamp\)/);
    });

    it('nooit --lamp als focusring of rand van een focus: lamp op wit haalt geen 3 : 1', () => {
      expect(kaal).not.toMatch(/outline(-color)?\s*:[^;}]*var\(--lamp\)/);
    });

    it('nooit witte tekst op --brand', () => {
      for (const m of kaal.matchAll(/\{([^{}]*)\}/g)) {
        if (/background(-color)?:\s*var\(--brand\)\s*[;}]?/.test(m[1])) expect(m[1]).not.toMatch(/(^|[;\s])color:\s*(#fff(fff)?|white)\b/i);
      }
    });
  });

  it('elke regel met een tekstkleur en een achtergrond uit de tokens haalt 4,5 : 1, licht en donker', () => {
    // Alleen regels die beide in één blok zetten en allebei met var(--token): wat de cascade elders mengt, valt erbuiten.
    let gecontroleerd = 0;
    for (const bestand of SCHERMBESTANDEN) {
      const kaal = ZONDER_COMMENTAAR(lees(`../../styles/${bestand}`));
      for (const m of kaal.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const tekst = /(?:^|[;\s])color:\s*var\(--([\w-]+)\)/.exec(m[2]);
        const vlak = /(?:^|[;\s])background(?:-color)?:\s*var\(--([\w-]+)\)/.exec(m[2]);
        if (!tekst || !vlak) continue;
        gecontroleerd++;
        for (const [naam, tk] of Object.entries(THEMAS)) {
          expect(contrastRatio(tk[tekst[1]], tk[vlak[1]]), `${bestand} ${m[1].trim()} (${naam}): ${tekst[1]} op ${vlak[1]}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    expect(gecontroleerd).toBeGreaterThan(5);
  });

  it('de kleurparen van de lesplanpagina', () => {
    // basis-lesplan.css: tekst, zachte tekst en merk op het kaartvlak; tekst op de zachte vlakken (chip, label, beeldzin).
    const paren: [string, string, number][] = [
      ['text', 'bg-raised', 7],
      ['text-soft', 'bg-raised', 4.5],
      ['text-soft', 'bg-sunken', 4.5],
      ['text', 'bg-sunken', 7],
      ['text', 'brand-soft', 7],
      ['text', 'lamp-soft', 7],
      ['brand', 'bg-raised', 4.5],
    ];
    for (const [naam, tk] of Object.entries(THEMAS)) {
      for (const [fg, bg, min] of paren) expect(contrastRatio(tk[fg], tk[bg]), `${naam}: ${fg} op ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('de lesplanpagina heeft een smalle weergave, een printstijl en tikdoelen van 44 pixels', () => {
    const css = ZONDER_COMMENTAAR(lees('../../styles/basis-lesplan.css'));
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).toMatch(/@media print/);
    for (const kl of ['.b-lp-ganaar a', '.b-lp-naarplek', '.b-lp-bron a', '.b-lp-beeld-uitleg summary']) {
      const m = new RegExp(`${kl.replace(/[.]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
      expect(m?.[1], kl).toMatch(/min-height:\s*44px/);
    }
  });
});

// ── Lichtkamer: kijkdoos, bordregel en vormen van het bewijs (LK-4) ─────────

describe('Lichtkamer: tokens en contrast', () => {
  const LK_SLEUTELS = ['stage', 'stage-paneel', 'stage-rand', 'on-stage', 'on-stage-soft', 'focus-stage', 'stage-licht', 'stage-schaduw', 'stage-schaduw-vlak'];

  it('licht en donker hebben dezelfde negen sleutels, allemaal hexwaarden', () => {
    expect(Object.keys(LK_LICHT).sort()).toEqual([...LK_SLEUTELS].sort());
    expect(Object.keys(LK_DONKER).sort()).toEqual([...LK_SLEUTELS].sort());
    for (const blok of [LK_LICHT, LK_DONKER]) for (const v of Object.values(blok)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('het donkere blok van de kijkdoos staat in @media screen, na het lichte', () => {
    const donker = LICHTKAMER.indexOf(`${BASIS_DONKER_SEL} {`);
    const media = LICHTKAMER.lastIndexOf('@media screen {', donker);
    expect(media).toBeGreaterThan(LICHTKAMER.indexOf(`${BASIS_LICHT_SEL} {`));
  });

  /** Tekst 4,5 : 1 (7 : 1 voor gewone tekst op de kijkdoos), vormen en focusring 3 : 1. */
  const LK_PAREN: [fg: string, bg: string, min: number][] = [
    ['on-stage', 'stage', 7],
    ['on-stage', 'stage-paneel', 7],
    ['on-stage-soft', 'stage', 4.5],
    ['on-stage-soft', 'stage-paneel', 4.5],
    ['stage-licht', 'stage', 4.5],
    ['stage-licht', 'stage-paneel', 4.5],
    ['stage-schaduw', 'stage', 4.5],
    ['stage-schaduw', 'stage-paneel', 4.5],
    // Lichte knop op het donkere paneel: tekst in de kleur van de kijkdoos.
    ['stage', 'on-stage', 7],
    ['on-stage-soft', 'stage-paneel', 4.5],
    // Vormen en ringen (3 : 1 voor niet-tekst)
    ['focus-stage', 'stage', 3],
    ['focus-stage', 'stage-paneel', 3],
    ['stage-schaduw-vlak', 'stage', 3],
    ['stage-schaduw-vlak', 'stage-paneel', 3],
    ['lamp', 'stage-paneel', 3],
    // De vier standen van het bewijs: tekst en vorm op hun eigen vlak.
    ['ok-text', 'ok-soft', 4.5],
    ['warn-text', 'warn-soft', 4.5],
    ['err-text', 'err-soft', 4.5],
    ['text-soft', 'bg-sunken', 4.5],
    // Gekozen knop: donkere inkt op lampgeel.
    ['on-lamp', 'lamp', 4.5],
  ];

  it.each(Object.entries(THEMAS))('elk paar van de kijkdoos en het bewijs haalt zijn minimum (%s)', (naam, tk) => {
    for (const [fg, bg, min] of LK_PAREN) {
      expect(contrastRatio(tk[fg], tk[bg]), `${naam}: ${fg} op ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it.each(Object.entries(THEMAS))('het juiste antwoord: witte tekst op het groene vlak haalt 4,5 : 1 (%s)', (naam, tk) => {
    expect(contrastRatio(tk['ok-strong'], '#ffffff'), naam).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tk['ok-strong'], tk['on-stage']), `${naam}: rand op vlak`).toBeGreaterThanOrEqual(3);
  });
});

describe('Lichtkamer: css van de kijkdoos', () => {
  const kaal = ZONDER_COMMENTAAR(LICHTKAMER);
  const blokken = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const regel = (selector: string) => {
    const r = blokken(kaal).find((b) => b.selector === selector);
    expect(r, selector).toBeDefined();
    return r!.body;
  };

  it("na 'Toon de uitkomst' blijft de keuze van de klas zichtbaar (aria-pressed op een uitgeschakelde keuze)", () => {
    expect(regel(".b-lk-keuze:disabled[aria-pressed='true']:not(.b-lk-juist)")).toMatch(/background:\s*var\(--lamp\)/);
  });

  it('geen color-mix en geen vaste kleuren buiten de tokens, behalve wit op het groene vlak', () => {
    expect(kaal).not.toContain('color-mix(');
    const zonderTokenblokken = kaal.replace(/:root\[data-deel='basis'\](\[data-theme='dark'\])? \{[^}]*\}/g, '');
    const vast = [...zonderTokenblokken.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
    expect(vast).toEqual(['#ffffff']);
  });

  it('de kijkdoos heeft een terugval voor aspect-ratio, met dezelfde selectors', () => {
    const start = kaal.indexOf('@supports not (aspect-ratio: 1) {');
    expect(start).toBeGreaterThanOrEqual(0);
    const terugval = kaal.slice(start);
    for (const s of ['.b-lk-kijk', ":root[data-deel='basis'][data-bord] .b-lk-kijk"]) expect(terugval).toContain(s);
    expect(terugval).toMatch(/padding-top:\s*62\.5%/);
    expect(terugval).toMatch(/padding-top:\s*56\.25%/);
  });

  it(':focus-visible staat alleen na :not(, nooit in een selectorlijst, en elke ring heeft eerst een :focus-regel', () => {
    for (const { selector } of blokken(kaal)) {
      if (!selector.includes(':focus-visible')) continue;
      expect(selector, selector).toMatch(/:focus:not\(:focus-visible\)$/);
    }
    expect(regel('.b-lk-kijk canvas:focus')).toMatch(/outline:\s*4px solid var\(--focus-stage\)/);
    for (const s of ['.b-lk-knop:focus', '.b-lk-keuze:focus']) expect(regel(s)).toMatch(/outline:\s*3px solid var\(--focus-stage\)/);
  });

  it('de bordregel in basis.css vergroot de letters, ook de lopende tekst, en heft de breedtegrens op', () => {
    const basis = ZONDER_COMMENTAAR(BASIS);
    expect(basis).toMatch(/:root\[data-deel='basis'\]\[data-bord\] \{\s*font-size:\s*135%/);
    expect(basis).toMatch(/:root\[data-deel='basis'\]\[data-bord\] body \{\s*font-size:\s*1rem/);
    expect(basis).toMatch(/\[data-bord\] \.b-main,[\s\S]*?\{\s*max-width:\s*none/);
  });

  it('elke bordregel van de kijkdoos steunt op data-bord', () => {
    const bord = blokken(kaal).filter((b) => b.selector.includes('[data-bord]'));
    expect(bord.length).toBeGreaterThanOrEqual(6);
  });

  it('tikdoelen van de kijkdoos zijn minstens 44 pixels, op het bord 56 pixels', () => {
    for (const s of ['.b-lk-knop']) expect(regel(s)).toMatch(/min-height:\s*44px/);
    expect(regel('.b-lk-keuze')).toMatch(/min-height:\s*64px/);
    expect(regel(":root[data-deel='basis'][data-bord] .b-lk-knop")).toMatch(/min-height:\s*56px/);
  });

  describe('vormen per stand van het bewijs', () => {
    const STANDEN = ['toont', 'wankel', 'niet', 'leeg'] as const;
    /** Wat de vorm bepaalt: afronding, draaiing, vulling, rand, schaduw en maat van het ::before-teken. */
    const vorm = (stand: string) => {
      const basis = regel('.b-lk-st::before');
      const eigen = blokken(kaal).find((b) => b.selector === `.b-lk-st-${stand}::before`)?.body ?? '';
      const lijst = (b: string) => b.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean);
      const map = new Map<string, string>();
      for (const d of [...lijst(basis), ...lijst(eigen)]) map.set(d.slice(0, d.indexOf(':')), d);
      return ['border-radius', 'transform', 'background', 'border', 'box-shadow', 'width'].map((k) => map.get(k) ?? '-').join('|');
    };

    it('elke stand heeft een eigen klasse met tekst- en vlakkleur uit de tokens', () => {
      for (const s of STANDEN) {
        const body = regel(`.b-lk-st-${s}`);
        expect(body, s).toMatch(/color:\s*var\(--[\w-]+\)/);
        expect(body, s).toMatch(/background:\s*var\(--[\w-]+\)/);
      }
    });

    it('de vier vormen verschillen van elkaar, ook zonder kleur', () => {
      const vormen = STANDEN.map(vorm);
      expect(new Set(vormen).size).toBe(4);
      // toont: cirkel; wankel: vierkant met halfvolle vulling; niet: gedraaid vierkant; leeg: holle cirkel
      expect(vorm('toont')).toContain('border-radius: 50%');
      expect(vorm('wankel')).toMatch(/inset 0 -6px 0 currentColor/);
      expect(vorm('niet')).toContain('rotate(45deg)');
      expect(vorm('leeg')).toMatch(/background: transparent/);
    });

    it('de gestippelde rand van "nog geen bewijs" onderscheidt het label zonder kleur', () => {
      expect(regel('.b-lk-st-leeg')).toMatch(/border-style:\s*dashed/);
      for (const s of ['toont', 'wankel', 'niet']) expect(regel(`.b-lk-st-${s}`)).not.toMatch(/border-style/);
    });

    it('hoog contrast (forced-colors) houdt de vormen met systeemkleuren', () => {
      const start = kaal.indexOf('@media (forced-colors: active)');
      expect(start).toBeGreaterThanOrEqual(0);
      const blok = kaal.slice(start, kaal.indexOf('/* ── Op het bord'));
      expect(blok).toContain('forced-color-adjust: none');
      expect(blok).toMatch(/\.b-lk-st::before \{\s*background:\s*CanvasText/);
    });
  });
});
