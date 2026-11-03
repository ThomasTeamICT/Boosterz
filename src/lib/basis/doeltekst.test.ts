// De doeltekst van het basisonderwijs: de html van de bron als blokken, en de component die ze veilig toont.
//
// De voorbeeld-html hieronder is letterlijk overgenomen uit de officiële setbestanden (doel 93177, 92739, 92787, 92830,
// 92713, 93407, 92492 en 93285), als tekst in dit bestand: de test leest dus geen gegevensbestand en draait overal.
// De controles op alle 998 doelen staan in basisIngang.echt.test.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DoeltekstWeergave } from '../../components/basis/DoeltekstWeergave';
import { blokkenAlsTekst, doeltekstBlokken, type Blok, type Inline } from './doeltekst';

// ─── Hulp ───────────────────────────────────────────────────────────────────

/** Alle inlines van een boom blokken, plat. */
function alleInlines(blokken: readonly Blok[]): Inline[] {
  const uit: Inline[] = [];
  const inl = (k: Inline) => {
    uit.push(k);
    if ('kids' in k) k.kids.forEach(inl);
  };
  const blok = (b: Blok) => (b.t === 'alinea' ? b.kids.forEach(inl) : b.items.forEach((it) => it.forEach(blok)));
  blokken.forEach(blok);
  return uit;
}

function diepte(blokken: readonly Blok[]): number {
  let max = 0;
  const loop = (bs: readonly Blok[], n: number) => {
    for (const b of bs) {
      if (b.t !== 'lijst') continue;
      max = Math.max(max, n + 1);
      b.items.forEach((it) => loop(it, n + 1));
    }
  };
  loop(blokken, 0);
  return max;
}

const ZWSP = '\u200b';

// ─── De voorbeelden uit de bron ─────────────────────────────────────────────

const D93177 =
  '<p>De leerlingen kennen decimale getallen als uitbreiding van het plaatswaardesysteem via de breuken <math><mfrac><mi>1</mi><mn>10</mn></mfrac></math> en <math><mfrac><mi>1</mi><mn>100</mn></mfrac></math> [I].</p>';

const D92739 =
  '<p>De leerlingen kennen de classificatie van organismen:</p>' +
  '<ul><li>de fauna:<ul><li>de gewervelden:<ul><li>de zoogdieren;</li><li>de vogels;</li><li>de amfibieën;</li><li>de vissen.</li></ul></li><li>de ongewervelden:<ul><li>de insecten;</li><li>de spinachtigen.</li></ul></li></ul></li><li>de flora;</li><li>de schimmels.</li></ul><p>&nbsp;</p>';

const D92787 =
  '<p>De leerlingen kennen de classificatie van organismen.</p>' +
  '<ul><li>de fauna:<ul><li>de gewervelden:<ul><li>de zoogdieren;</li><li>de vogels;</li><li>de reptielen;</li><li>de amfibieën;</li><li>de vissen.</li></ul></li><li>de ongewervelden:<ul><li>de geleedpotigen:<ul><li>de insecten;</li><li>de spinachtigen.</li></ul></li><li>andere ongewervelden.</li></ul></li></ul></li><li>de flora;<ul><li>de zaadplanten;</li><li>de sporenplanten.</li></ul></li><li>de schimmels;</li><li>de bacteriën.</li></ul>';

const D92830 =
  '<p>De leerlingen kennen de volgende begrippen:</p>' +
  '<ul><li>het gewicht, de druk, de weerstand;<br />&lt; bv. verschil in weerstand bij beweging in lucht of water &gt;</li><li>de energieomzetting;</li><li>reflecteren, absorberen, doorlaten;</li><li>de stroomkring, de geleider, de isolator, de spanning, de stroomsterkte</li></ul>' +
  '<img src="https://assets.vlaanderen.be/image/upload/v1748855466/repositories-prd/Symbool_energiebron_rjl3de.png" alt="De energiebron"/>' +
  '<img src="https://assets.vlaanderen.be/image/upload/v1748855467/repositories-prd/Symbool_lamp_ofcas0.png" alt="De lamp"/>' +
  '<img src="https://assets.vlaanderen.be/image/upload/v1748855468/repositories-prd/Symbool_schakelaar_jq1us6.png" alt="De schakelaar"/>';

const D92713 =
  '<p>De leerlingen kennen de woorden en structuren vermeld in de woordenlijst Frans (<a href="https://assets.vlaanderen.be/raw/upload/v1750840926/repositories-prd/Woordenlijst_Frans_minimumdoelen_lager_onderwijs_j87jec.docx" target="_blank">Word</a>, <a href="https://assets.vlaanderen.be/image/upload/v1757496427/repositories-prd/Woordenlijst_Frans_minimumdoelen_extvci.pdf" target="_blank">Pdf</a>).&nbsp;</p>';

const D93407 =
  '<p>De leerlingen kennen de volgende begrippen en wiskundige notaties [F]:</p>' +
  '<ul><li>E, T, H, D, TD;</li><li>=, ≠, &lt;, &gt;, ≤, ≥ (tussen getallen);</li><li>het cijfer (de symbolen 0 tot en met 9), het getal (één- of meercijferig);</li></ul>';

const D92492 = `<p>De kleuters kennen de naam van:&nbsp;${ZWSP}${ZWSP}${ZWSP}</p><ul><li>België;&nbsp;</li><li>een plaatselijke rivier;&nbsp;</li><li>de rivier de Nijl.&nbsp;</li></ul>`;

const D93285 =
  '<p>De leerlingen kunnen vraagstukken oplossen over:</p>' +
  `<ul><li>verhoudingen met behulp van een verhoudingstabel waarbij:<ul><li>vaste verhoudingen worden vastgesteld;<br />&lt; bv. verhouding blauwe en rode kralen in kralenkettingen &gt;</li><li>recht evenredige grootheden een rol spelen.<br />${ZWSP}${ZWSP}&lt; bv. aantal-prijs, massa-prijs, een recept van 2 personen omzetten naar 6 personen &gt;</li></ul></li></ul>`;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('doeltekstBlokken: de voorbeelden uit de bron', () => {
  it('93177: twee breuken (1/10 en 1/100) en het label [I], zonder MathML', () => {
    const blokken = doeltekstBlokken(D93177);
    const breuken = alleInlines(blokken).filter((k) => k.t === 'breuk');
    expect(breuken).toEqual([
      { t: 'breuk', teller: '1', noemer: '10' },
      { t: 'breuk', teller: '1', noemer: '100' },
    ]);
    expect(alleInlines(blokken).filter((k) => k.t === 'kennis')).toEqual([{ t: 'kennis', s: 'I' }]);
    const tekst = blokkenAlsTekst(blokken);
    expect(tekst).toContain('1/10');
    expect(tekst).toContain('1/100');
    expect(tekst).not.toContain('<');
    expect(tekst).toContain('via de breuken 1/10 en 1/100 [I].');
  });

  it('92739 en 92787: lijsten tot diepte 3 en 4, en de lege alinea (&nbsp;) valt weg', () => {
    const a = doeltekstBlokken(D92739);
    const b = doeltekstBlokken(D92787);
    expect(diepte(a)).toBe(3);
    expect(diepte(b)).toBe(4);
    expect(a).toHaveLength(2); // een alinea en een lijst
    const tekst = blokkenAlsTekst(a);
    for (const woord of ['de zoogdieren', 'de spinachtigen', 'de schimmels.']) expect(tekst).toContain(woord);
  });

  it('92830: drie afbeeldingen worden hun alt-tekst en het adres verdwijnt', () => {
    const blokken = doeltekstBlokken(D92830);
    expect(alleInlines(blokken).filter((k) => k.t === 'beeld')).toEqual([
      { t: 'beeld', alt: 'De energiebron' },
      { t: 'beeld', alt: 'De lamp' },
      { t: 'beeld', alt: 'De schakelaar' },
    ]);
    const json = JSON.stringify(blokken);
    expect(json).not.toContain('https');
    expect(json).not.toContain('src');
    expect(json).not.toContain('vlaanderen.be');
  });

  it('92713: een https-link blijft een link met zijn adres', () => {
    const links = alleInlines(doeltekstBlokken(D92713)).filter((k) => k.t === 'link');
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ t: 'link', s: 'Word' });
    expect((links[0] as { href?: string }).href).toMatch(/^https:\/\/assets\.vlaanderen\.be\/raw\/upload\/.+\.docx$/);
    expect(links[1]).toMatchObject({ t: 'link', s: 'Pdf' });
    expect((links[1] as { href?: string }).href).toMatch(/\.pdf$/);
  });

  it('een gevaarlijk of onveilig adres wordt tekst zonder adres', () => {
    for (const href of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,x', 'http://voorbeeld.be/', '//voorbeeld.be/', 'vbscript:x']) {
      const links = alleInlines(doeltekstBlokken(`<p>zie <a href="${href}">hier</a></p>`)).filter((k) => k.t === 'link');
      expect(links, href).toEqual([{ t: 'link', s: 'hier' }]);
    }
    expect(alleInlines(doeltekstBlokken('<p><a>zonder adres</a></p>')).filter((k) => k.t === 'link')).toEqual([{ t: 'link', s: 'zonder adres' }]);
  });

  it('92492: onzichtbare tekens (U+200B) en vaste spaties verdwijnen uit de tekst', () => {
    const blokken = doeltekstBlokken(D92492);
    const tekst = blokkenAlsTekst(blokken);
    expect(tekst).not.toContain(ZWSP);
    expect(tekst).not.toContain('\u00a0');
    expect(tekst.split('\n')).toEqual(['De kleuters kennen de naam van:', '• België;', '• een plaatselijke rivier;', '• de rivier de Nijl.']);
    expect(JSON.stringify(blokken)).not.toContain(ZWSP);
    expect(doeltekstBlokken('<p>zacht&shy;afbreken&#8203;</p>')).toEqual([{ t: 'alinea', kids: [{ t: 'tekst', s: 'zachtafbreken' }] }]);
  });

  it('93285: "< bv. ... >" wordt een voorbeeld, ook na een regeleinde en met onzichtbare tekens', () => {
    const blokken = doeltekstBlokken(D93285);
    const voorbeelden = alleInlines(blokken).filter((k) => k.t === 'voorbeeld') as { t: 'voorbeeld'; kids: Inline[] }[];
    expect(voorbeelden).toHaveLength(2);
    expect(voorbeelden[0].kids).toEqual([{ t: 'tekst', s: 'verhouding blauwe en rode kralen in kralenkettingen' }]);
    expect(voorbeelden[1].kids).toEqual([{ t: 'tekst', s: 'aantal-prijs, massa-prijs, een recept van 2 personen omzetten naar 6 personen' }]);
    expect(blokkenAlsTekst(blokken)).not.toMatch(/[<>]/);
  });

  it('92830: een voorbeeld in een lijstitem staat achter de regel waar het bij hoort', () => {
    const lijst = doeltekstBlokken(D92830)[1];
    expect(lijst.t).toBe('lijst');
    const eerste = (lijst as { items: Blok[][] }).items[0][0];
    expect(eerste.t).toBe('alinea');
    const kids = (eerste as { kids: Inline[] }).kids;
    expect(kids.map((k) => k.t)).toEqual(['tekst', 'regel', 'voorbeeld']);
  });

  it('een voorbeeld met meerdere regels bewaart ze (de regeleinden blijven)', () => {
    const html = '<ul><li>denkstappen toe te passen;<br />&lt; bv.<br />* eerste stap;<br />* tweede stap. &gt;</li></ul>';
    const v = alleInlines(doeltekstBlokken(html)).find((k) => k.t === 'voorbeeld') as { kids: Inline[] };
    expect(v.kids.map((k) => k.t)).toEqual(['tekst', 'regel', 'tekst']);
    expect(blokkenAlsTekst(doeltekstBlokken(html))).toContain('* eerste stap;\n* tweede stap.');
  });

  it('een "< ... >" zonder "bv." is een toelichting', () => {
    const blokken = doeltekstBlokken('<p>De leerlingen kennen het getal &lt; ook negatief &gt; en meer.</p>');
    const kinderen = (blokken[0] as { kids: Inline[] }).kids;
    expect(kinderen.map((k) => k.t)).toEqual(['tekst', 'toelichting', 'tekst']);
    expect(kinderen[1]).toEqual({ t: 'toelichting', kids: [{ t: 'tekst', s: 'ook negatief' }] });
  });

  it('93407: "<" en ">" tussen symbolen blijven gewone tekst', () => {
    const blokken = doeltekstBlokken(D93407);
    expect(alleInlines(blokken).some((k) => k.t === 'voorbeeld' || k.t === 'toelichting')).toBe(false);
    expect(blokkenAlsTekst(blokken)).toContain('=, ≠, <, >, ≤, ≥ (tussen getallen);');
    expect(alleInlines(blokken).filter((k) => k.t === 'kennis')).toEqual([{ t: 'kennis', s: 'F' }]);
  });
});

describe('doeltekstBlokken: kleine gevallen', () => {
  it('[F], [I] en [I/F] blijven letterlijk als label in de tekst', () => {
    const kids = (doeltekstBlokken('<p>a [F] b [I/F] c [I]</p>')[0] as { kids: Inline[] }).kids;
    expect(kids.filter((k) => k.t === 'kennis').map((k) => (k as { s: string }).s)).toEqual(['F', 'I/F', 'I']);
    expect(blokkenAlsTekst(doeltekstBlokken('<p>a [F] b [I/F] c [I]</p>'))).toBe('a [F] b [I/F] c [I]');
  });

  it('een onbekende tag verliest zijn tag, de tekst erin blijft; er blijft geen markup over', () => {
    const blokken = doeltekstBlokken('<p>voor <foo bar="1">midden</foo> <script>alert(1)</script> na</p>');
    const tekst = blokkenAlsTekst(blokken);
    expect(tekst).toBe('voor midden alert(1) na');
    expect(JSON.stringify(blokken)).not.toContain('<');
  });

  it('witruimte tussen twee opgemaakte stukken blijft staan', () => {
    const blokken = doeltekstBlokken('<p><strong>kern</strong> <em>punt</em>\n  en meer</p>');
    expect(blokkenAlsTekst(blokken)).toBe('kern punt en meer');
  });

  it('een geordende lijst blijft geordend en tekst zonder p wordt een alinea', () => {
    const blokken = doeltekstBlokken('los begin<ol><li>een</li><li>twee</li></ol>');
    expect(blokken[0]).toEqual({ t: 'alinea', kids: [{ t: 'tekst', s: 'los begin' }] });
    expect(blokken[1]).toMatchObject({ t: 'lijst', geordend: true });
    expect((blokken[1] as { items: Blok[][] }).items).toHaveLength(2);
  });

  it('een breuk met meer dan teller en noemer wordt platte wiskunde', () => {
    const k = alleInlines(doeltekstBlokken('<p><math><mn>1</mn><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac></math></p>'));
    expect(k.find((x) => x.t === 'breuk')).toBeUndefined();
    expect(k.find((x) => x.t === 'wiskunde')).toMatchObject({ s: '1/2 1+' });
  });

  it('gooit nooit een fout, ook niet bij rommel', () => {
    for (const html of ['', '<', '<<<>>>', '<p', '</p></ul></li>', '<ul><li>open', '<math><mfrac>', '<a href="x">', '&#x110000;&#xD800;&bogus;', '<!-- opmerking --><p>x</p>']) {
      expect(() => blokkenAlsTekst(doeltekstBlokken(html)), html).not.toThrow();
    }
    expect(doeltekstBlokken('')).toEqual([]);
    expect(doeltekstBlokken(undefined as unknown as string)).toEqual([]);
    expect(blokkenAlsTekst(doeltekstBlokken('<!-- opmerking --><p>x</p>'))).toBe('x');
    expect(blokkenAlsTekst(doeltekstBlokken('&bogus; &amp; &lt;b&gt;'))).toBe('&bogus; & <b>');
  });

  it('een gewone tekst zonder tags blijft letterlijk', () => {
    expect(blokkenAlsTekst(doeltekstBlokken('De leerlingen kennen licht: rechtlijnige beweging.'))).toBe(
      'De leerlingen kennen licht: rechtlijnige beweging.',
    );
  });
});

// ─── De component ───────────────────────────────────────────────────────────

describe('DoeltekstWeergave', () => {
  const toon = (html: string) => renderToStaticMarkup(createElement(DoeltekstWeergave, { html }));

  it('toont de breuken van 93177 zonder MathML, met leesbare namen', () => {
    const uit = toon(D93177);
    expect(uit).not.toContain('<math');
    expect(uit).not.toContain('mfrac');
    expect(uit.match(/class="b-breuk"/g)).toHaveLength(2);
    expect(uit).toContain('aria-label="1 op 10"');
    expect(uit).toContain('aria-label="1 op 100"');
    expect(uit).toContain('[I]');
  });

  it('toont genest ul, de volledige lijst van 92787 en geen lege alinea', () => {
    const uit = toon(D92787);
    expect(uit.match(/<ul/g)).toHaveLength(6);
    expect(uit).toContain('de bacteriën.');
    expect(uit).not.toContain('<p class="b-doeltekst-alinea"></p>');
    expect(toon(D92739)).not.toContain('&nbsp;');
  });

  it('zet [F] en [I] letterlijk in de tekst, zonder abbr', () => {
    const uit = toon(D93407);
    expect(uit).toContain('[F]');
    expect(uit).not.toContain('<abbr');
    expect(uit).toContain('=, ≠, &lt;, &gt;, ≤, ≥ (tussen getallen);');
  });

  it('opent een link in een nieuw tabblad met noopener en meldt dat voor schermlezers', () => {
    const uit = toon(D92713);
    expect(uit.match(/target="_blank"/g)).toHaveLength(2);
    expect(uit.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(uit).toContain('class="sr-only"');
    expect(uit).toContain('opent in een nieuw tabblad');
  });

  it('toont een afbeelding als tekst en nooit als beeld', () => {
    const uit = toon(D92830);
    expect(uit).not.toContain('<img');
    expect(uit).not.toContain('https://');
    expect(uit).toContain('Afbeelding in de bron: De energiebron');
    expect(uit).toContain('Afbeelding in de bron: De schakelaar');
  });

  it('laat voorbeelden herkenbaar als voorbeeld zien', () => {
    const uit = toon(D93285);
    expect(uit.match(/class="b-voorbeeld"/g)).toHaveLength(2);
    expect(uit).toContain('Voorbeeld: ');
    expect(uit).not.toContain('&lt; bv');
  });

  it('maakt van onveilige html nooit actieve html', () => {
    const uit = toon('<p><a href="javascript:alert(1)">klik</a><img src="x" onerror="alert(1)" alt="a"/><script>alert(2)</script></p>');
    expect(uit).not.toContain('javascript:');
    expect(uit).not.toContain('<script');
    expect(uit).not.toContain('onerror');
    expect(uit).not.toContain('<img');
  });

  it('neemt al gelezen blokken over en een extra klasse', () => {
    const uit = renderToStaticMarkup(createElement(DoeltekstWeergave, { blokken: doeltekstBlokken('<p>x</p>'), className: 'groot' }));
    expect(uit).toBe('<div class="b-doeltekst groot"><p class="b-doeltekst-alinea">x</p></div>');
  });
});

// ─── Wachters op de bronnen ─────────────────────────────────────────────────

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function bestanden(map: string, eindes: readonly string[]): string[] {
  let namen: string[];
  try {
    namen = readdirSync(map);
  } catch {
    return []; // de map bestaat (nog) niet
  }
  const uit: string[] = [];
  for (const naam of namen) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, eindes));
    else if (eindes.some((e) => naam.endsWith(e)) && !naam.endsWith('.test.ts')) uit.push(pad);
  }
  return uit;
}

const SCHERMBESTANDEN = [...bestanden(join(SRC, 'components/basis'), ['.ts', '.tsx']), ...bestanden(join(SRC, 'pages/basis'), ['.ts', '.tsx'])];

describe('geen ruwe html en geen ingekorte doeltekst in het deel basisonderwijs', () => {
  it('de component bestaat en wordt meegeteld', () => {
    expect(SCHERMBESTANDEN.map((p) => relative(SRC, p))).toContain('components/basis/DoeltekstWeergave.tsx');
  });

  it('geen enkel scherm of onderdeel gebruikt dangerouslySetInnerHTML of innerHTML', () => {
    const fout = SCHERMBESTANDEN.filter((p) => /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML/.test(readFileSync(p, 'utf8')));
    expect(fout.map((p) => relative(SRC, p))).toEqual([]);
  });

  it('geen enkel onderdeel kort een doeltekst in', () => {
    // Een regel die een doeltekst (doelzin, uitbreiding, woordenschat, de blokken of hun platte tekst) bewerkt tot een
    // stuk ervan, of er een beletselteken achter zet, kort in. De doeltekst gaat altijd volledig naar DoeltekstWeergave.
    const doelwoord = /doelzin|uitbreiding|woordenschat|doeltekst|blokkenAlsTekst|\btekst\b/i;
    const inkorter = /\.(slice|substring|substr)\(|truncate|ellips|line-clamp|[…]\s*['"`]|\.\.\.['"`]/i;
    const fouten: string[] = [];
    for (const pad of SCHERMBESTANDEN) {
      readFileSync(pad, 'utf8')
        .split('\n')
        .forEach((regel, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(regel)) return;
          if (doelwoord.test(regel) && inkorter.test(regel)) fouten.push(`${relative(SRC, pad)}:${i + 1}: ${regel.trim()}`);
        });
    }
    expect(fouten).toEqual([]);
  });

  it('de css van het deel kort niets in (geen line-clamp, geen ellipsis, geen vaste hoogte met verborgen rest)', () => {
    const css = bestanden(join(SRC, 'styles'), ['.css']).filter((p) => /[\\/]basis[^\\/]*\.css$/.test(p));
    const fouten: string[] = [];
    for (const pad of css) {
      const tekst = readFileSync(pad, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/line-clamp|text-overflow\s*:\s*ellipsis/.test(tekst)) fouten.push(relative(SRC, pad));
    }
    expect(fouten).toEqual([]);
  });

  it('DoeltekstWeergave leest de doeltekst nergens af', () => {
    const bron = readFileSync(join(SRC, 'components/basis/DoeltekstWeergave.tsx'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(bron).not.toMatch(/\.(slice|substring|substr)\(/);
  });
});
