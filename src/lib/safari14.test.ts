// Bewaking voor Safari en iPadOS 14 (14.1 is de ondergrens, zie vite.config.ts en CLAUDE.md). Wat zo'n toestel niet kent,
// valt in css stil weg: een ongeldige waarde laat de héle declaratie vallen, en een selectorlijst met één onbekende
// selector valt in haar geheel weg. Elke test hieronder zoekt zo'n val, met bestand en regel, en wijst het herstel aan.
// Gemeten met Safari 14.1 nagebootst in Chromium (tests/safari14.mjs).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STIJLEN = path.join(SRC, 'styles');

function bronbestanden(dir: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(dir)) {
    const pad = path.join(dir, naam);
    if (statSync(pad).isDirectory()) uit.push(...bronbestanden(pad));
    else if (/\.(ts|tsx)$/.test(naam) && !/\.test\./.test(naam) && !naam.endsWith('.d.ts')) uit.push(pad);
  }
  return uit;
}
const cssBestanden = readdirSync(STIJLEN).filter((f) => f.endsWith('.css')).sort();
const lees = (pad: string) => readFileSync(pad, 'utf8');
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** De tekst binnen elk at-blok dat met `begin` start (bv. "@supports not (aspect-ratio"), met haakjes uitgebalanceerd. */
function atBlokken(css: string, begin: string): string[] {
  const uit: string[] = [];
  let van = 0;
  for (;;) {
    const start = css.indexOf(begin, van);
    if (start < 0) return uit;
    const open = css.indexOf('{', start);
    let diepte = 1;
    let i = open + 1;
    while (i < css.length && diepte > 0) {
      if (css[i] === '{') diepte++;
      else if (css[i] === '}') diepte--;
      i++;
    }
    uit.push(css.slice(open + 1, i - 1));
    van = i;
  }
}

interface Regel { selector: string; declaraties: { eigenschap: string; waarde: string }[]; regelnr: number }
/** Alle gewone regels (ook die in @media of @supports), met hun declaraties. */
function regels(css: string): Regel[] {
  const kaal = zonderCommentaar(css);
  const uit: Regel[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(kaal))) {
    const selector = m[1].trim();
    if (selector.startsWith('@') || /^[\d.%\s,]+$|^(from|to)$/.test(selector)) {
      // keyframes-stappen en at-regels zonder eigen declaraties tellen als regel met dezelfde declaraties
    }
    const declaraties = m[2].split(';').flatMap((d) => {
      const i = d.indexOf(':');
      return i < 0 ? [] : [{ eigenschap: d.slice(0, i).trim().toLowerCase(), waarde: d.slice(i + 1).trim() }];
    });
    uit.push({ selector, declaraties, regelnr: kaal.slice(0, m.index + m[1].length - m[1].trimStart().length).split('\n').length });
  }
  return uit;
}

describe('aspect-ratio (Safari en iPadOS vóór 15)', () => {
  // Alleen waar een eigen verhouding bestaat (canvas en img met width en height) of waar enkel de vorm verloren gaat.
  const CSS_UITZONDERING = new Set(['.flashcard', '.bingo-cell', '.spotdifference-ring']);
  const TSX_UITZONDERING = new Set(['whiteboard.tsx', 'splitwhiteboard.tsx', 'quiz.tsx', 'CodeQr.tsx']);

  it('elke css-regel met aspect-ratio heeft een terugval of is een bewuste uitzondering', () => {
    const slecht: string[] = [];
    for (const f of cssBestanden) {
      const css = lees(path.join(STIJLEN, f));
      const terugval = atBlokken(zonderCommentaar(css), '@supports not (aspect-ratio').join('\n');
      for (const r of regels(css)) {
        if (!r.declaraties.some((d) => d.eigenschap === 'aspect-ratio' && d.waarde !== 'auto')) continue;
        const lijst = r.selector.split(',').map((s) => s.trim());
        if (lijst.every((s) => terugval.includes(s) || CSS_UITZONDERING.has(s))) continue;
        slecht.push(`${f}:${r.regelnr}: ${r.selector}`);
      }
    }
    expect(slecht, `Zet een terugval in global.css onder "@supports not (aspect-ratio: 1)":\n${slecht.join('\n')}`).toEqual([]);
  });

  it('elke inline aspectRatio hoort bij een terugvalklasse, CSS.supports of een canvas of img', () => {
    const slecht: string[] = [];
    for (const bestand of bronbestanden(SRC)) {
      const naam = path.basename(bestand);
      const tekst = lees(bestand);
      if (TSX_UITZONDERING.has(naam) || tekst.includes("CSS.supports('aspect-ratio'")) continue;
      tekst.split('\n').forEach((regel, i) => {
        if (!/aspectRatio|aspect-ratio/.test(regel) || /^\s*(\/\/|\*|\/\*)/.test(regel)) return;
        if (/className="vid-(169|43)"/.test(regel)) return;
        if (/aspect-ratio:\s*1 \/ 1/.test(regel) && naam === 'spotdifference.tsx') return;
        if (/geen aspectRatio/.test(regel)) return;
        // de terugvalklasse mag een paar regels hoger staan, op hetzelfde element
        if (tekst.split('\n').slice(Math.max(0, i - 15), i).some((v) => /className="vid-(169|43)"/.test(v))) return;
        slecht.push(`${path.relative(path.dirname(SRC), bestand)}:${i + 1}: ${regel.trim()}`);
      });
    }
    expect(slecht, `Geef het vak className="vid-169" (of "vid-43"), of gebruik CSS.supports zoals jigsaw.tsx:\n${slecht.join('\n')}`).toEqual([]);
  });

  it('de terugvalblokken bestaan', () => {
    const g = zonderCommentaar(lees(path.join(STIJLEN, 'global.css')));
    const blok = atBlokken(g, '@supports not (aspect-ratio').join('\n');
    for (const s of ['.memory-card', '.vid-169', '.vid-43', '.course-block .video-frame']) expect(blok).toContain(s);
  });
});

describe('color-mix() (Safari vóór 16.2)', () => {
  // Bewust cosmetisch: het element blijft bruikbaar en leesbaar zonder deze declaratie.
  const COSMETISCH = new Set([
    'global.css|.input:focus, .select:focus, .textarea:focus', // de rand wordt wel brand; alleen de gloed valt weg
    'global.css|.brand-mark', // schaduw van het logo
    'global.css|.answer-option.selected', // de rand in de accentkleur blijft
    'global.css|.chip.placed', // de rand in de accentkleur blijft
    'global.css|.gap-input:focus-visible', // :focus houdt de onderrand in de accentkleur
    'global.css|.cross-cell input:focus', // de achtergrond valt weg; de focus blijft zichtbaar via de outline in het @supports-blok
    'global.css|.cross-cell input:focus-visible',
    'global.css|.flashcard .face.back', // houdt de achtergrond van .face
    'global.css|0%, 100%', // de puls van de pijlmarkering (animatie)
    'global.css|.player-shell', // het kleurverloop in de hoek; zonder blijft de pagina-achtergrond (body) var(--bg)
    'cursus.css|.course-editor-alert', // rand van een melding voor de leerkracht; de -soft-achtergrond toont de status
    'cursus.css|.course-editor-alert-problem', // idem
    'cursus.css|.pdf-remove-confirm', // rand van een bevestigingsvak; de knoppen erin blijven
    'inlezen.css|.il-probleem', // rand; de -soft-achtergrond en de tekst blijven
    'materiaal.css|.mat-ai-card', // rand van een kaart met eigen achtergrond
    'doelenlijst.css|.dl-ref-x:hover', // hoverkleur
    'samenstellen.css|.sam-chip-weg:hover', // hoverkleur
  ]);
  const EIGENSCHAPPEN = /^(background|background-color|background-image|border|border-color|border-(top|right|bottom|left)(-color)?|outline|outline-color|box-shadow)$/;

  it('elke achtergrond, rand, omlijning of schaduw met color-mix heeft een terugval of een vermelding als cosmetisch', () => {
    // Zonder var() weigert Safari 14 de declaratie bij het inlezen, en wint de gewone declaratie ervoor. Met var()
    // aanvaardt het ze, en wordt ze bij het berekenen 'unset' (invalid at computed-value time): dan wint ze toch de
    // cascade en is de eigenschap leeg. Daar helpt alleen een regel in @supports not (color: color-mix(...)).
    const slecht: string[] = [];
    for (const f of cssBestanden) {
      const css = lees(path.join(STIJLEN, f));
      // Selector én eigenschap (familie: background-color telt als background) van elke terugvalregel.
      const familie = (e: string) => e.split('-')[0];
      const terugval = new Set(
        regels(atBlokken(zonderCommentaar(css), '@supports not (color: color-mix').join('\n')).flatMap((t) =>
          t.selector.split(',').flatMap((s) => t.declaraties.map((d) => `${s.trim()}|${familie(d.eigenschap)}`)),
        ),
      );
      for (const r of regels(css)) {
        r.declaraties.forEach((d, i) => {
          if (!EIGENSCHAPPEN.test(d.eigenschap) || !d.waarde.includes('color-mix(')) return;
          const metVar = d.waarde.includes('var(');
          if (!metVar && r.declaraties.slice(0, i).some((v) => v.eigenschap === d.eigenschap && !v.waarde.includes('color-mix('))) return;
          const lijst = r.selector.split(',').map((s) => s.trim());
          if (lijst.every((s) => terugval.has(`${s}|${familie(d.eigenschap)}`) || COSMETISCH.has(`${f}|${s}`) || COSMETISCH.has(`${f}|${r.selector}`))) return;
          slecht.push(`${f}:${r.regelnr}: ${r.selector} { ${d.eigenschap}: ${d.waarde.slice(0, 60)}… }`);
        });
      }
    }
    expect(slecht, `Zet een regel voor dezelfde selector en eigenschap in global.css onder "@supports not (color: color-mix(in srgb, red, blue))", of zet de selector met reden in COSMETISCH:\n${slecht.join('\n')}`).toEqual([]);
  });

  it('de terugvalregels voor leesbaarheid bestaan', () => {
    const blok = atBlokken(zonderCommentaar(lees(path.join(STIJLEN, 'global.css'))), '@supports not (color: color-mix').join('\n');
    for (const s of ['.memory-face.front', '.player-topbar', '.topbar']) expect(blok).toContain(s);
  });

  it('de mindmap kiest de vulling van zijn knopen in code, niet met een inline color-mix zonder keuze', () => {
    const tekst = lees(path.join(SRC, 'widgets/mindmap.tsx'));
    expect(tekst).toMatch(/kanColorMix\s*\?\s*`color-mix\(/);
    expect(tekst).toContain("'var(--bg-raised)'");
    expect(lees(path.join(SRC, 'lib/color.ts'))).toContain("CSS.supports('color', 'color-mix(in srgb, red, blue)')");
    expect(zonderCommentaar(lees(path.join(STIJLEN, 'global.css')))).toMatch(/\.mm-knoop\s*\{\s*fill:\s*var\(--bg-raised\)/);
  });

  it('elke inline color-mix met var() in een achtergrond of rand kiest in code, of staat als cosmetisch in de lijst', () => {
    // Cosmetisch: de tint of de rand valt weg, het element blijft leesbaar en herkenbaar. Tekstkleur (color) valt terug
    // op de geërfde kleur en staat hier niet in.
    const COSMETISCH_TSX = new Set([
      'Layout.tsx', // rand onder de opslagbalk; de -soft-achtergrond toont de status
      'BlockRenderer.tsx', // rand van een callout en van het gelukt-vak; de -soft-achtergrond blijft
      'CourseViewerPage.tsx', // doorschijnende zijbalk van de leerkracht; de pagina-achtergrond blijft
      'randomimages.tsx', // randkleur van een knop
      'activeplot.tsx', // lichte tint achter een getal
      'spotdifference.tsx', // tint in een markeercirkel; de rand en kleur blijven
      'interactTypes.tsx', // tint in een markeercirkel; de rand blijft
      'jigsaw.tsx', // dimlaag achter een kaart met eigen achtergrond
      'color.ts', // de detectie zelf
    ]);
    const slecht: string[] = [];
    for (const bestand of bronbestanden(SRC)) {
      const naam = path.basename(bestand);
      const tekst = lees(bestand);
      if (COSMETISCH_TSX.has(naam) || tekst.includes('kanColorMix')) continue;
      tekst.split('\n').forEach((regel, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(regel) || !/color-mix\([^)]*var\(/.test(regel)) return;
        if (/\bcolor:[^,}]*$/.test(regel.slice(0, regel.indexOf('color-mix(')))) return; // tekstkleur: valt terug op de geërfde
        slecht.push(`${path.relative(path.dirname(SRC), bestand)}:${i + 1}: ${regel.trim().slice(0, 90)}`);
      });
    }
    expect(slecht, `Kies in code met kanColorMix (src/lib/color.ts), of zet het bestand met reden in COSMETISCH_TSX:\n${slecht.join('\n')}`).toEqual([]);
  });
});

describe('selectors die Safari 14 niet kent (:focus-visible en :has())', () => {
  it('geen selectorlijst waarin :focus-visible of :has( samen staat met andere selectors', () => {
    const slecht: string[] = [];
    for (const f of cssBestanden) {
      for (const r of regels(lees(path.join(STIJLEN, f)))) {
        const lijst = r.selector.split(/,(?![^(]*\))/).map((s) => s.trim());
        if (lijst.length > 1 && lijst.some((s) => /:focus-visible|:has\(/.test(s))) slecht.push(`${f}:${r.regelnr}: ${r.selector}`);
      }
    }
    expect(slecht, `Splits de lijst: een onbekende selector laat in Safari 14 de hele regel vallen:\n${slecht.join('\n')}`).toEqual([]);
  });

  it(':has() staat alleen nog op leerkrachtschermen en alleen voor een markering die ook zonder werkt', () => {
    // Bewust cosmetisch: het gewone vinkje of bolletje toont de keuze nog; alleen de gekleurde kaart of de cursor valt weg.
    // Een nieuwe :has() hoort hier niet bij: zet een klasse in React, zoals data-ganaar in LesplanPagina.
    const TOEGESTAAN = new Set([
      'cursusbrug.css', 'dekking.css', 'doelenlijst.css', 'gaten.css', 'inlezen.css', 'kiezer.css',
      'richtingcursus.css', 'richtingen.css', 'samenstellen.css',
    ]);
    const slecht = cssBestanden.filter((f) => !TOEGESTAAN.has(f) && zonderCommentaar(lees(path.join(STIJLEN, f))).includes(':has('));
    expect(slecht, `:has() kent Safari pas vanaf 15.4: ${slecht.join(', ')}`).toEqual([]);
  });
});

describe('overflow-wrap: anywhere (Safari vóór 15.4)', () => {
  // Leeg: elk bestand heeft de terugval. Zet hier alleen tijdelijk een bestand dat in een andere werkmap herschikt wordt.
  const NOG_TE_DOEN = new Set<string>();

  it('elke css-regel met overflow-wrap: anywhere heeft er eerst overflow-wrap: break-word voor', () => {
    const slecht: string[] = [];
    for (const f of cssBestanden) {
      if (NOG_TE_DOEN.has(f)) continue;
      for (const r of regels(lees(path.join(STIJLEN, f)))) {
        r.declaraties.forEach((d, i) => {
          if (d.eigenschap !== 'overflow-wrap' || d.waarde !== 'anywhere') return;
          if (!r.declaraties.slice(0, i).some((v) => v.eigenschap === 'overflow-wrap' && v.waarde === 'break-word')) slecht.push(`${f}:${r.regelnr}: ${r.selector}`);
        });
      }
    }
    expect(slecht, `Zet "overflow-wrap: break-word;" vlak vóór "overflow-wrap: anywhere;":\n${slecht.join('\n')}`).toEqual([]);
  });

  it("elke inline overflowWrap: 'anywhere' heeft wordBreak: 'break-word' ernaast", () => {
    const slecht: string[] = [];
    for (const bestand of bronbestanden(SRC)) {
      lees(bestand).split('\n').forEach((regel, i) => {
        if (/overflowWrap:\s*'anywhere'/.test(regel) && !/wordBreak:\s*'break-word'/.test(regel)) slecht.push(`${path.relative(path.dirname(SRC), bestand)}:${i + 1}`);
      });
    }
    expect(slecht, `Zet wordBreak: 'break-word' naast overflowWrap: 'anywhere':\n${slecht.join('\n')}`).toEqual([]);
  });
});
