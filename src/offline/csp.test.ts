import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CSP_SCRIPT_HOSTS, attrValue, cspPolicy, injectCsp, inlineScriptHashes, normalizeNewlines,
  problemsForCsp, scriptsIn, verifyCsp,
} from './csp';

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('base64');
const indexHtml = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

const page = (head: string, body = '<div id="root"></div>') =>
  `<!doctype html>\n<html lang="nl">\n  <head>\n    <meta charset="UTF-8" />\n${head}\n  </head>\n  <body>${body}</body>\n</html>\n`;

/** De richtlijnen van een beleid als { naam: [bronnen] }. */
function directives(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

describe('hash zoals de browser hem berekent', () => {
  it('geeft dezelfde hash als Chrome voor een bekend voorbeeld', () => {
    // Chrome noemde deze hash in de console bij het lettertype-onload van de oude index.html.
    expect(inlineScriptHashes(page("<script>this.media='all'</script>"), sha256))
      .toEqual(["'sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc='"]);
  });

  it('hasht de ruwe inhoud, inclusief witruimte en niet-ASCII-tekens (UTF-8)', () => {
    const text = '\n  // vóór de start: één ü\n  var x = 1;\n';
    expect(inlineScriptHashes(page(`<script>${text}</script>`), sha256)).toEqual([`'sha256-${sha256(text)}'`]);
  });

  it('zet CRLF en losse CR om naar LF, zoals de html-parser', () => {
    expect(normalizeNewlines('a\r\nb\rc\n')).toBe('a\nb\nc\n');
    const lf = inlineScriptHashes(page('<script>\nvar a = 1;\nvar b = 2;\n</script>'), sha256);
    const crlf = inlineScriptHashes(page('<script>\r\nvar a = 1;\r\nvar b = 2;\r\n</script>'), sha256);
    expect(crlf).toEqual(lf);
  });

  it('slaat scripts met src over en geeft elke hash maar één keer', () => {
    const html = page('<script src="./assets/a.js"></script><script>x()</script><script type="module">x()</script>');
    expect(inlineScriptHashes(html, sha256)).toEqual([`'sha256-${sha256('x()')}'`]);
  });

  it('negeert scripts in commentaar, zonder de grenzen van het volgende te verschuiven', () => {
    const html = page('<!-- <script>oud()</script> en <script> zonder einde -->\n<script>nieuw()</script>');
    expect(scriptsIn(html).map((s) => s.text)).toEqual(['nieuw()']);
  });

  it('een > tussen aanhalingstekens sluit de tag niet af', () => {
    const [s] = scriptsIn(page('<script data-x="a>b">echt()</script>'));
    expect(s.text).toBe('echt()');
    expect(attrValue(s.attrs, 'data-x')).toBe('a>b');
  });

  it('faalt luid bij een onafgesloten script', () => {
    expect(() => scriptsIn('<head><script>x()')).toThrow(/geen <\/script>/);
  });
});

describe('het beleid', () => {
  it('heeft precies script-src, object-src en base-uri', () => {
    const d = directives(cspPolicy(["'sha256-abc='"]));
    expect(Object.keys(d).sort()).toEqual(['base-uri', 'object-src', 'script-src']);
    expect(d['script-src']).toEqual(["'self'", "'sha256-abc='", ...CSP_SCRIPT_HOSTS]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
  });

  it('laat de YouTube-iframe-API van de videoquiz toe', () => {
    expect(directives(cspPolicy([]))['script-src']).toContain('https://www.youtube.com');
  });

  it('bevat nooit unsafe-inline of de richtlijnen die eigen AI-adressen, afbeeldingen en kaders breken', () => {
    const policy = cspPolicy(["'sha256-abc='"]);
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", 'default-src', 'connect-src', 'img-src', 'frame-src', 'style-src']) {
      expect(policy).not.toContain(bad);
    }
  });
});

describe('injectCsp', () => {
  it('zet de meta direct na <meta charset>, vóór elk script en elke link', () => {
    const html = page('    <link rel="stylesheet" href="./assets/a.css" />\n    <script>vangnet()</script>\n    <script type="module" src="./assets/index.js"></script>');
    const out = injectCsp(html, sha256);
    const meta = out.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(out.indexOf('<meta charset'));
    expect(meta).toBeLessThan(out.indexOf('<link'));
    expect(meta).toBeLessThan(out.indexOf('<script'));
    expect(out).toContain(`'sha256-${sha256('vangnet()')}'`);
    expect(verifyCsp(out, sha256)).toEqual([]);
  });

  it('weigert een inline gebeurtenisattribuut (zou unsafe-hashes vragen)', () => {
    const html = page('<link rel="stylesheet" href="x.css" media="print" onload="this.media=\'all\'" />');
    expect(problemsForCsp(html)).toEqual([expect.stringContaining('onload=')]);
    expect(() => injectCsp(html, sha256)).toThrow(/onload=/);
  });

  it('weigert een javascript:-URL', () => {
    expect(() => injectCsp(page('', '<a href="javascript:void 0">x</a>'), sha256)).toThrow(/javascript:/);
  });

  it('weigert een extern script buiten de toegelaten hosts, en aanvaardt eigen en toegelaten bronnen', () => {
    expect(() => injectCsp(page('<script src="https://cdn.example/x.js"></script>'), sha256)).toThrow(/cdn\.example/);
    expect(() => injectCsp(page('<script src="//cdn.example/x.js"></script>'), sha256)).toThrow(/cdn\.example/);
    expect(problemsForCsp(page('<script src="./assets/x.js"></script><script src="https://www.youtube.com/iframe_api"></script>'))).toEqual([]);
  });

  it('weigert een tweede CSP en een index.html zonder <meta charset>', () => {
    const once = injectCsp(page('<script>a()</script>'), sha256);
    expect(() => injectCsp(once, sha256)).toThrow(/al een Content-Security-Policy/);
    expect(() => injectCsp('<html><head><script>a()</script></head></html>', sha256)).toThrow(/meta charset/);
  });

  it('weigert een script vóór <meta charset>', () => {
    expect(() => injectCsp('<html><head><script>a()</script><meta charset="UTF-8"></head></html>', sha256)).toThrow(/vóór <meta charset>/);
  });
});

describe('verifyCsp (controle op de uiteindelijke build)', () => {
  const goed = injectCsp(page('<script>vangnet()</script>\n<script type="module" src="./assets/index.js"></script>'), sha256);

  it('merkt een inline script dat na het injecteren gewijzigd werd', () => {
    const errs = verifyCsp(goed.replace('vangnet()', 'vangnet(1)'), sha256);
    expect(errs).toEqual([expect.stringContaining('klopt niet met de inline scripts')]);
  });

  it('merkt een inline script dat er later bij kwam', () => {
    expect(verifyCsp(goed.replace('</head>', '<script>extra()</script></head>'), sha256)).not.toEqual([]);
  });

  it('merkt een ontbrekende of dubbele CSP', () => {
    expect(verifyCsp(page('<script>a()</script>'), sha256)).toEqual([expect.stringContaining('precies één')]);
    const dubbel = goed.replace('</head>', '<meta http-equiv="content-security-policy" content="script-src *"></head>');
    expect(verifyCsp(dubbel, sha256)).toEqual([expect.stringContaining('precies één')]);
  });

  it('merkt unsafe-inline, ook als iemand het beleid met de hand aanpast', () => {
    const errs = verifyCsp(goed.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"), sha256);
    expect(errs.some((e) => e.includes("'unsafe-inline'"))).toBe(true);
  });
});

describe('de echte index.html', () => {
  it('heeft geen Google Fonts, preconnect of inline gebeurtenisattributen meer', () => {
    expect(indexHtml).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(indexHtml).not.toMatch(/rel="preconnect"/);
    expect(problemsForCsp(indexHtml)).toEqual([]);
  });

  it('krijgt een CSP met de hash van het vangnet-script, en die controle slaagt', () => {
    const inline = scriptsIn(indexHtml).filter((s) => s.src === null);
    expect(inline).toHaveLength(1);
    expect(inline[0].text).toContain('Boosterz kon niet laden');
    const out = injectCsp(indexHtml, sha256);
    expect(out).toContain(`'sha256-${sha256(normalizeNewlines(inline[0].text))}'`);
    expect(verifyCsp(out, sha256)).toEqual([]);
  });

  it('heeft zelf nog geen CSP: die komt er pas bij de build (niet in dev)', () => {
    expect(indexHtml).not.toMatch(/http-equiv\s*=\s*["']?content-security-policy/i);
  });
});
