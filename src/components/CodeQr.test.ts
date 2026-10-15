// CodeQr: de eigen kopieerknop kan weg (`copy={false}`), voor een pagina die al een knop voor dezelfde link heeft.
// De test rendert op de server (zonder DOM): daar loopt `useEffect` niet, dus de QR zelf wordt niet gemaakt. De knoppen
// staan er wel, in de laadtoestand en in de uitleg bij een te lange tekst.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodeQr } from './CodeQr';

const toon = (props: Partial<Parameters<typeof CodeQr>[0]>) =>
  renderToStaticMarkup(createElement(CodeQr, { value: 'https://voorbeeld.be/#/klas/open?d=abc', label: 'de link', ...props }));

describe('CodeQr: de kopieerknop', () => {
  it('standaard staat de eigen kopieerknop er, met het label dat je meegeeft', () => {
    const html = toon({ copyLabel: 'Link kopiëren' });
    expect(html).toContain('Link kopiëren');
    expect(toon({})).toContain('Code kopiëren');
  });

  it('met copy={false} staat er geen kopieerknop, maar de hint blijft', () => {
    const html = toon({ copy: false, copyLabel: 'Link kopiëren', hint: 'Laat je leerlingen deze QR scannen.' });
    expect(html).not.toContain('Link kopiëren');
    expect(html).not.toContain('<button');
    expect(html).toContain('Laat je leerlingen deze QR scannen.');
  });

  it('bij een te lange tekst geldt hetzelfde: met copy={false} geen knop in de uitleg, standaard wel', () => {
    const lang = 'x'.repeat(50);
    expect(toon({ value: lang, maxChars: 10, copyLabel: 'Link kopiëren' })).toContain('Link kopiëren');
    const zonder = toon({ value: lang, maxChars: 10, copyLabel: 'Link kopiëren', copy: false });
    expect(zonder).toContain('Te groot voor een QR-code');
    expect(zonder).not.toContain('<button');
  });
});
