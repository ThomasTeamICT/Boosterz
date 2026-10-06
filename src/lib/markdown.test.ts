import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './htmlToMarkdown';
import { renderMarkdown } from './markdown';

describe('renderMarkdown — links', () => {
  it('escapet de & in een url maar één keer', () => {
    expect(renderMarkdown('[x](https://a.be/?a=1&b=2)')).toBe(
      '<p><a href="https://a.be/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a></p>'
    );
  });

  it('laat de href na het decoderen door de browser de originele url zijn', () => {
    const html = renderMarkdown('[film](https://www.youtube.com/watch?v=abc&list=PL1&t=30s)');
    const href = /href="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(href).not.toContain('&amp;amp;');
    expect(href.replace(/&amp;/g, '&')).toBe('https://www.youtube.com/watch?v=abc&list=PL1&t=30s');
  });

  it('maakt van een interne #/-link een link zonder nieuw tabblad', () => {
    expect(renderMarkdown('[terug](#/cursussen)')).toBe('<p><a href="#/cursussen">terug</a></p>');
  });

  it('maakt alleen van http(s):// en #/ een link', () => {
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'ftp://a.be/x', '//evil.be/x', 'mailto:a@b.be', '/relatief']) {
      const html = renderMarkdown(`[klik](${url})`);
      expect(html, url).not.toContain('<a');
      expect(html, url).not.toContain('href');
      expect(html, url).toContain('klik');
    }
    expect(renderMarkdown('[x](HTTPS://a.be/)')).toContain('<a href="HTTPS://a.be/"');
  });

  it('laat een url het href-attribuut niet doorbreken', () => {
    const html = renderMarkdown('[x](https://a.be/"onmouseover="alert(1))');
    const tag = /<a [^>]*>/.exec(html)?.[0] ?? '';
    // precies de verwachte attributen en geen rauwe aanhalingstekens in de waarde
    expect(tag).toMatch(/^<a href="[^"]*" target="_blank" rel="noopener noreferrer">$/);
    expect(tag).toContain('&quot;onmouseover=&quot;');
  });

  it('ontsmet html in de linktekst', () => {
    const html = renderMarkdown('[<img src=x onerror=alert(1)>](https://a.be)');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('houdt opmaaktekens in een url uit de opmaak', () => {
    const html = renderMarkdown('[x](https://a.be/?q=*a*&r=~~b~~)');
    expect(html).not.toContain('<em>');
    expect(html).not.toContain('<del>');
    expect(html).toContain('href="https://a.be/?q=%2Aa%2A&amp;r=%7E%7Eb%7E%7E"');
  });

  it('laat vet en cursief in de linktekst werken', () => {
    expect(renderMarkdown('[**vet** en *schuin*](#/x)')).toBe('<p><a href="#/x"><strong>vet</strong> en <em>schuin</em></a></p>');
  });
});

describe('renderMarkdown — cursief, vet en doorhalen', () => {
  it('zet *tekst* om naar cursief', () => {
    expect(renderMarkdown('De *Quercus robur* is een eik.')).toBe('<p>De <em>Quercus robur</em> is een eik.</p>');
  });

  it('laat sterretjes tussen spaties letterlijk staan', () => {
    const html = renderMarkdown('5 * 3 = 15 en 2 * 4 = 8');
    expect(html).toBe('<p>5 * 3 = 15 en 2 * 4 = 8</p>');
    expect(html).not.toContain('<em>');
  });

  it('leest **vet** als vet en niet als cursief', () => {
    expect(renderMarkdown('Dit is **vet** en dit ook **vet**.')).toBe('<p>Dit is <strong>vet</strong> en dit ook <strong>vet</strong>.</p>');
  });

  it('combineert vet en cursief', () => {
    expect(renderMarkdown('***beide***')).toBe('<p><strong><em>beide</em></strong></p>');
    expect(renderMarkdown('**vet en *schuin* erin**')).toBe('<p><strong>vet en <em>schuin</em> erin</strong></p>');
  });

  it('verdraagt cursief in vet en vet in cursief, op elke plaats', () => {
    expect(renderMarkdown('**de *Quercus* robur**')).toBe('<p><strong>de <em>Quercus</em> robur</strong></p>');
    expect(renderMarkdown('**de *Quercus***')).toBe('<p><strong>de <em>Quercus</em></strong></p>');
    expect(renderMarkdown('***Quercus* robur**')).toBe('<p><strong><em>Quercus</em> robur</strong></p>');
    expect(renderMarkdown('*de **grote** eik*')).toBe('<p><em>de <strong>grote</strong> eik</em></p>');
    expect(renderMarkdown('*de **grote***')).toBe('<p><em>de <strong>grote</strong></em></p>');
  });

  it('laat dubbele sterretjes tussen spaties letterlijk staan', () => {
    expect(renderMarkdown('2 ** 3 ** 2')).toBe('<p>2 ** 3 ** 2</p>');
  });

  it('zet een enkel teken tussen sterretjes om', () => {
    expect(renderMarkdown('*x*')).toBe('<p><em>x</em></p>');
  });

  it('zet ~~tekst~~ om naar doorgehaald', () => {
    expect(renderMarkdown('Dit is ~~fout~~ juist.')).toBe('<p>Dit is <del>fout</del> juist.</p>');
  });

  it('laat een losse tilde staan', () => {
    expect(renderMarkdown('ongeveer ~5 m en ~6 m')).toBe('<p>ongeveer ~5 m en ~6 m</p>');
  });

  it('ontsmet html in gewone tekst', () => {
    expect(renderMarkdown('<script>alert(1)</script> *ok*')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; <em>ok</em></p>');
  });
});

describe('renderMarkdown — codeblokken', () => {
  it('toont de inhoud van een ```-blok ge-escaped in <pre><code>', () => {
    const html = renderMarkdown('```\nif (a < b) {\n  x = "1" & 2\n}\n```');
    expect(html).toBe('<pre><code>if (a &lt; b) {\n  x = &quot;1&quot; &amp; 2\n}</code></pre>');
    expect(html).not.toContain('```');
  });

  it('leest markdown in een codeblok niet als markdown', () => {
    const html = renderMarkdown('```\n## geen kop\n- geen lijst\n**geen vet** *geen cursief*\n```');
    expect(html).toBe('<pre><code>## geen kop\n- geen lijst\n**geen vet** *geen cursief*</code></pre>');
  });

  it('kan geen html uit een codeblok laten ontsnappen', () => {
    const html = renderMarkdown('```\n</code></pre><script>alert(1)</script>\n```');
    expect(html).not.toContain('<script');
    expect(html).toBe('<pre><code>&lt;/code&gt;&lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>');
  });

  it('houdt een taalnaam achter het hek buiten de inhoud', () => {
    expect(renderMarkdown('```js\nlet a = 1;\n```')).toBe('<pre><code>let a = 1;</code></pre>');
  });

  it('bewaart witregels en inspringing in het blok', () => {
    expect(renderMarkdown('```\na\n\n    b\n```')).toBe('<pre><code>a\n\n    b</code></pre>');
  });

  it('breekt een alinea af bij het hek en gaat daarna gewoon door', () => {
    expect(renderMarkdown('Voor\n```\ncode\n```\nNa')).toBe('<p>Voor</p>\n<pre><code>code</code></pre>\n<p>Na</p>');
  });

  it('laat een blok zonder sluitend hek doorlopen tot het einde', () => {
    expect(renderMarkdown('```\nrest\n## nog code')).toBe('<pre><code>rest\n## nog code</code></pre>');
  });

  it('slokt de rest niet op als ``` midden in een regel staat', () => {
    const html = renderMarkdown('Typ ```x``` of niets.\n\nTweede alinea.');
    expect(html).not.toContain('<pre>');
    expect(html).toMatch(/^<p>Typ .*of niets\.<\/p>\n<p>Tweede alinea\.<\/p>$/);
  });
});

describe('renderMarkdown — blokken blijven werken', () => {
  it('maakt koppen, lijsten en citaten', () => {
    expect(renderMarkdown('## Kop\n\n- a\n- b\n\n1. een\n2. twee\n\n> citaat')).toBe(
      '<h3>Kop</h3>\n<ul><li>a</li><li>b</li></ul>\n<ol><li>een</li><li>twee</li></ol>\n<blockquote>citaat</blockquote>'
    );
  });
});

describe('van html via markdown naar de weergave', () => {
  it('toont cursief, doorgehaald en vermenigvuldigen zoals bedoeld', () => {
    const md = htmlToMarkdown('<p>Water is <em>erg</em> belangrijk en <del>fout</del>, en 5 * 3 = 15 en 2 * 4 = 8, ook <strong>vet</strong>.</p>');
    expect(renderMarkdown(md)).toBe(
      '<p>Water is <em>erg</em> belangrijk en <del>fout</del>, en 5 * 3 = 15 en 2 * 4 = 8, ook <strong>vet</strong>.</p>'
    );
  });

  it('toont genest cursief en vet uit Word zoals bedoeld', () => {
    const md = htmlToMarkdown('<p><strong>De <em>Quercus</em></strong> en <em>een <strong>grote</strong></em> eik.</p>');
    expect(md).toBe('**De *Quercus*** en *een **grote*** eik.');
    expect(renderMarkdown(md)).toBe('<p><strong>De <em>Quercus</em></strong> en <em>een <strong>grote</strong></em> eik.</p>');
  });

  it('toont een <pre> als codeblok zonder losse backticks', () => {
    const html = renderMarkdown(htmlToMarkdown('<p>Voor</p><pre>a = 1\n  b = 2</pre><p>Na</p>'));
    expect(html).toBe('<p>Voor</p>\n<pre><code>a = 1\n  b = 2</code></pre>\n<p>Na</p>');
    expect(html).not.toContain('`');
  });

  it('houdt een link met & uit Word werkend', () => {
    const md = htmlToMarkdown('<p><a href="https://e.be/?a=1&amp;b=2">link</a></p>');
    expect(md).toBe('[link](https://e.be/?a=1&b=2)');
    expect(renderMarkdown(md)).toContain('href="https://e.be/?a=1&amp;b=2"');
  });

  it('toont hoog en laag als gewone tekens', () => {
    expect(renderMarkdown(htmlToMarkdown('<p>H<sub>2</sub>O en m<sup>2</sup></p>'))).toBe('<p>H₂O en m²</p>');
  });
});
