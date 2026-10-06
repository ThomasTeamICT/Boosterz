import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToMarkdown } from './htmlToMarkdown';

describe('decodeEntities', () => {
  it('zet benoemde, decimale en hexadecimale entiteiten om', () => {
    expect(decodeEntities('R&amp;D &eacute;&#233;n &#x2014; klaar')).toBe('R&D één — klaar');
  });
  it('laat onbekende entiteiten staan', () => {
    expect(decodeEntities('&onzin; &amp;')).toBe('&onzin; &');
  });
});

describe('htmlToMarkdown — koppen en alinea\'s', () => {
  it('zet h1–h3 om naar #, ## en ###', () => {
    expect(htmlToMarkdown('<h1>Water</h1><h2>Verdamping</h2><h3>Voorbeeld</h3>')).toBe(
      '# Water\n\n## Verdamping\n\n### Voorbeeld'
    );
  });
  it('kapt h4–h6 af op ###', () => {
    expect(htmlToMarkdown('<h4>Diep</h4><h6>Dieper</h6>')).toBe('### Diep\n\n### Dieper');
  });
  it('vouwt witruimte in alinea\'s samen en scheidt blokken met een witregel', () => {
    expect(htmlToMarkdown('<p>Een\n   zin.</p>\n<p>  Nog een.  </p>')).toBe('Een zin.\n\nNog een.');
  });
  it('maakt van <br> een harde regelovergang binnen de alinea', () => {
    expect(htmlToMarkdown('<p>Regel een<br>Regel twee</p>')).toBe('Regel een\nRegel twee');
  });
  it('negeert script, style en afbeeldingen', () => {
    const html = '<style>p{color:red}</style><p>Tekst</p><script>alert(1)</script><p><img src="data:image/png;base64,AAAA"> Bijschrift</p>';
    expect(htmlToMarkdown(html)).toBe('Tekst\n\nBijschrift');
  });
  it('houdt tekst uit onbekende tags over', () => {
    expect(htmlToMarkdown('<p>Een <mark>gemarkeerd</mark> woord.</p>')).toBe('Een gemarkeerd woord.');
  });
  it('geeft lege invoer een lege string terug', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('<p></p><div>   </div>')).toBe('');
  });
});

describe('htmlToMarkdown — inline-opmaak', () => {
  it('zet vet, cursief en doorhalen om, met de spaties buiten de markers', () => {
    expect(htmlToMarkdown('<p>Dit is <strong>heel </strong>belangrijk en <em>schuin</em>.</p>')).toBe(
      'Dit is **heel** belangrijk en *schuin*.'
    );
  });
  it('zet doorgehaald om naar ~~', () => {
    expect(htmlToMarkdown('<p>Dit is <del>fout</del> en <s>ook</s>.</p>')).toBe('Dit is ~~fout~~ en ~~ook~~.');
  });
  it('laat een sterretje in gewone tekst met rust', () => {
    expect(htmlToMarkdown('<p>5 * 3 = 15 en 2 * 4 = 8</p>')).toBe('5 * 3 = 15 en 2 * 4 = 8');
  });
  it('nest cursief en vet met sterretjes', () => {
    expect(htmlToMarkdown('<p><strong>De <em>Quercus</em></strong> en <em>de <strong>eik</strong></em></p>')).toBe(
      '**De *Quercus*** en *de **eik***'
    );
  });
  it('zet hoog en laag om naar Unicode-tekens', () => {
    expect(htmlToMarkdown('<p>H<sub>2</sub>O, m<sup>2</sup>, 10<sup>-3</sup></p>')).toBe('H₂O, m², 10⁻³');
    expect(htmlToMarkdown('<p>CO<sub>2</sub> en x<sup>n</sup> en 10<sup>&minus;12</sup> en (a+b)<sup>(n+1)</sup></p>')).toBe(
      'CO₂ en xⁿ en 10⁻¹² en (a+b)⁽ⁿ⁺¹⁾'
    );
    expect(htmlToMarkdown('<p>x<sub>(1+2)</sub> = 2<sup>10</sup></p>')).toBe('x₍₁₊₂₎ = 2¹⁰');
  });
  it('valt voor hoog terug op ^(…) en voor laag op gewone tekst', () => {
    expect(htmlToMarkdown('<p>x<sup>a+b</sup></p>')).toBe('x^(a+b)');
    expect(htmlToMarkdown('<p>a<sub>n+1</sub> en U<sub>aan</sub></p>')).toBe('an+1 en Uaan');
  });
  it('zet rangtelwoorden in hoog (alleen letters) om naar gewone tekst', () => {
    expect(htmlToMarkdown('<p>de 2<sup>de</sup> klas, de 1<sup>e</sup> graad en de 1<sup>ste</sup> graad</p>')).toBe(
      'de 2de klas, de 1e graad en de 1ste graad'
    );
    expect(htmlToMarkdown('<p>de XIX<sup>e</sup> eeuw</p>')).toBe('de XIXe eeuw');
  });
  it('houdt spaties rond hoog en laag en laat lege exemplaren weg', () => {
    expect(htmlToMarkdown('<p>m<sup>2 </sup>per<sup> </sup>s</p>')).toBe('m² per s');
  });
  it('zet links om en laat onveilige href\'s vallen', () => {
    expect(htmlToMarkdown('<p><a href="https://example.org">Bron</a></p>')).toBe('[Bron](https://example.org)');
    expect(htmlToMarkdown('<p><a href="javascript:alert(1)">Klik</a></p>')).toBe('Klik');
  });
});

describe('htmlToMarkdown — lijsten', () => {
  it('zet ongeordende en geordende lijsten om', () => {
    expect(htmlToMarkdown('<ul><li>een</li><li>twee</li></ul>')).toBe('- een\n- twee');
    expect(htmlToMarkdown('<ol><li>eerst</li><li>dan</li></ol>')).toBe('1. eerst\n2. dan');
  });
  it('laat geneste lijsten inspringen', () => {
    const html = '<ul><li>fruit<ul><li>appel</li><li>peer</li></ul></li><li>groenten</li></ul>';
    expect(htmlToMarkdown(html)).toBe('- fruit\n  - appel\n  - peer\n- groenten');
  });
  it('verdraagt niet-gesloten <li> (Word-html)', () => {
    expect(htmlToMarkdown('<ul><li>een<li>twee</ul>')).toBe('- een\n- twee');
  });
});

describe('htmlToMarkdown — tabellen', () => {
  it('maakt een markdown-tabel van rechthoekige rijen', () => {
    const html = '<table><tr><th>Land</th><th>Hoofdstad</th></tr><tr><td>België</td><td>Brussel</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe(
      '| Land | Hoofdstad |\n| --- | --- |\n| België | Brussel |'
    );
  });
  it('valt terug op platte rijen als de rijen niet even breed zijn', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe('a | b\nc');
  });
  it('ontsnapt pipes in cellen', () => {
    const html = '<table><tr><td>a|b</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></table>';
    expect(htmlToMarkdown(html)).toContain('a\\|b');
  });
  it('leest thead/tbody en niet-gesloten cellen', () => {
    const html = '<table><thead><tr><td>A<td>B</tr></thead><tbody><tr><td>1<td>2</tr></tbody></table>';
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });
});

describe('htmlToMarkdown — overige blokken', () => {
  it('zet citaten en scheidingslijnen om', () => {
    expect(htmlToMarkdown('<blockquote><p>Zo zij het.</p></blockquote><hr>')).toBe('> Zo zij het.\n\n---');
  });
  it('bewaart <pre> als codeblok', () => {
    expect(htmlToMarkdown('<pre>een\n  twee</pre>')).toBe('```\neen\n  twee\n```');
  });
  it('zet een hele Word-achtige pagina om', () => {
    const html = `<html><body>
      <h1>De waterkringloop</h1>
      <p>Water <strong>verdampt</strong> door de zon.</p>
      <h2>Fasen</h2>
      <ul><li>verdamping</li><li>condensatie</li></ul>
      <table><tr><td>fase</td><td>plaats</td></tr><tr><td>regen</td><td>wolk</td></tr></table>
    </body></html>`;
    expect(htmlToMarkdown(html)).toBe(
      [
        '# De waterkringloop',
        'Water **verdampt** door de zon.',
        '## Fasen',
        '- verdamping\n- condensatie',
        '| fase | plaats |\n| --- | --- |\n| regen | wolk |',
      ].join('\n\n')
    );
  });
});
