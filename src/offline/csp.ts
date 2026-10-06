// ── Content-Security-Policy voor index.html (tweede verdedigingslinie) ──────
//
// De eerste linie is de controle van links en bestanden (lib/veiligeUrl.ts en
// de sanering bij binnenkomst). Glipt daar ooit toch iets door, dan houdt deze
// CSP een ingespoten script of een javascript:-URL alsnog tegen.
//
// GitHub Pages kan geen headers zetten, dus komt de CSP als <meta> in de
// gebouwde index.html: de plugin `contentSecurityPolicy` in vite.config.ts,
// alleen bij de build (de dev-server gebruikt een inline React-refresh-script).
// Een <meta>-CSP geldt pas vanaf de plek waar ze staat; daarom komt ze direct
// na <meta charset>, vóór elk script en elke link.
//
// Bewust smal (uitspraak V1 van de debugronde, oktober 2026):
//   script-src 'self' 'sha256-…' https://www.youtube.com
//       de eigen bundels, elk inline script van index.html via zijn hash (het
//       vangnet bij een mislukte start) en de YouTube-iframe-API van de
//       videoquiz. Nooit 'unsafe-inline': dat laat javascript:-URL's en
//       ingespoten scripts weer toe.
//   object-src 'none'   geen <object>/<embed>-plug-ins
//   base-uri 'self'     een ingespoten <base> kan de bundels niet omleiden
// Geen default-src, connect-src, img-src, frame-src of style-src: die breken
// eigen AI-adressen, afbeeldingen via een link en ingesloten kaders. Let op:
// worker-src valt terug op script-src, dus workers (pdf.js, de service worker)
// moeten van de eigen origin komen. Dat doen ze.
//
// Pure functies zonder Node-API's: de hashfunctie komt van de aanroeper
// (vite.config.ts: node:crypto), zodat dit bestand nooit per ongeluk Node in
// de browserbundel trekt.

/** Externe scriptbronnen die mogen. Alleen hosts die de app zelf laadt. */
export const CSP_SCRIPT_HOSTS: readonly string[] = ['https://www.youtube.com'];

/** Richtlijnen die nooit in de CSP mogen (zie de kop van dit bestand). */
const VERBODEN = [
  "'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'strict-dynamic'",
  'default-src', 'connect-src', 'img-src', 'frame-src', 'style-src', 'child-src',
];

/** sha256 van een tekst (UTF-8), base64-gecodeerd. */
export type Sha256Base64 = (text: string) => string;

export interface HtmlScript {
  /** Ruwe attributen van de openingstag. */
  attrs: string;
  /** Ruwe inhoud tussen <script …> en </script>. */
  text: string;
  /** Waarde van src, of null voor een inline script. */
  src: string | null;
  /** Positie van '<script' in de html. */
  start: number;
  /** Positie net na de sluitende </script>. */
  end: number;
}

/** Waarde van één attribuut uit een ruwe attributenlijst; null als het ontbreekt. */
export function attrValue(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? '';
}

/**
 * Alle <script>-elementen buiten html-commentaar, met hun ruwe inhoud. Een
 * script in commentaar draait niet en telt dus niet mee; zonder die regel zou
 * een uitgecommentarieerd `<script>` de grenzen van het volgende verschuiven.
 */
export function scriptsIn(html: string): HtmlScript[] {
  const out: HtmlScript[] = [];
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (!/^<script(?=[\s>/])/i.test(html.slice(lt, lt + 8))) {
      i = lt + 1;
      continue;
    }
    // Einde van de openingstag; een '>' tussen aanhalingstekens telt niet.
    let j = lt + 7;
    let quote = '';
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
    }
    if (j >= html.length) throw new Error('csp: een <script>-tag in index.html is niet afgesloten');
    const close = lower.indexOf('</script', j + 1);
    if (close < 0) throw new Error('csp: een <script> in index.html heeft geen </script>');
    const attrs = html.slice(lt + 7, j);
    const endTag = html.indexOf('>', close);
    i = endTag < 0 ? html.length : endTag + 1;
    out.push({ attrs, text: html.slice(j + 1, close), src: attrValue(attrs, 'src'), start: lt, end: i });
  }
  return out;
}

/**
 * De browser hasht de tekst zoals de html-parser ze ziet: CRLF en losse CR
 * zijn dan al LF geworden (voorbewerking van de invoerstroom). Zonder deze
 * stap zou een index.html met Windows-regeleinden een verkeerde hash geven,
 * en blokkeerde de browser het vangnet stil.
 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** CSP-bronnen ('sha256-…') voor elk inline script, zonder dubbels, in volgorde. */
export function inlineScriptHashes(html: string, sha256: Sha256Base64): string[] {
  const hashes = scriptsIn(html)
    .filter((s) => s.src === null)
    .map((s) => `'sha256-${sha256(normalizeNewlines(s.text))}'`);
  return [...new Set(hashes)];
}

/** Het beleid zelf, voor de gegeven hashes. */
export function cspPolicy(hashes: readonly string[]): string {
  return [
    ['script-src', "'self'", ...hashes, ...CSP_SCRIPT_HOSTS].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

/** De html zonder commentaar en zonder de inhoud van scripts: alleen de tags. */
function tagsOnly(html: string): string {
  let out = '';
  let i = 0;
  for (const s of scriptsIn(html)) {
    out += html.slice(i, s.start).replace(/<!--[\s\S]*?-->/g, '');
    out += `<script${s.attrs}></script>`;
    i = s.end;
  }
  return out + html.slice(i).replace(/<!--[\s\S]*?-->/g, '');
}

const CSP_META_RE = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;

/**
 * Wat in index.html onder deze CSP stil zou breken. Een fout hier laat de
 * build falen, in plaats van dat de app in productie half werkt:
 *  - inline gebeurtenisattributen (onload=, onclick= …) en javascript:-URL's:
 *    die vragen 'unsafe-inline' of 'unsafe-hashes', en dat willen we nooit;
 *  - scripts van een andere origin dan de toegelaten hosts.
 */
export function problemsForCsp(html: string): string[] {
  const problems: string[] = [];
  const tags = tagsOnly(html);
  const handler = /<[a-z][^>]*?\s(on[a-z-]+)\s*=/gi;
  for (const m of tags.matchAll(handler)) {
    problems.push(`inline gebeurtenisattribuut ${m[1]}= in index.html (de CSP blokkeert het; gebruik een script)`);
  }
  if (/=\s*["']?\s*javascript:/i.test(tags)) {
    problems.push('javascript:-URL in index.html (de CSP blokkeert die)');
  }
  for (const s of scriptsIn(html)) {
    if (s.src === null) continue;
    const src = s.src.trim();
    const absoluut = /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//');
    if (absoluut && !CSP_SCRIPT_HOSTS.some((h) => src.startsWith(`${h}/`))) {
      problems.push(`extern script ${src} in index.html staat niet in CSP_SCRIPT_HOSTS (src/offline/csp.ts)`);
    }
  }
  return problems;
}

/**
 * Zet de CSP-meta direct na <meta charset>. Faalt luid als index.html iets
 * bevat wat de CSP zou breken, als er al een CSP staat, of als er vóór
 * <meta charset> al een script staat.
 */
export function injectCsp(html: string, sha256: Sha256Base64): string {
  const problems = problemsForCsp(html);
  if (problems.length > 0) throw new Error(`csp: ${problems.join('; ')}`);
  if ((html.match(CSP_META_RE) ?? []).length > 0) throw new Error('csp: index.html bevat al een Content-Security-Policy');
  const charset = /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i.exec(html);
  if (!charset) throw new Error('csp: <meta charset> ontbreekt in index.html');
  const at = charset.index + charset[0].length;
  const first = scriptsIn(html)[0];
  if (first && first.start < at) throw new Error('csp: er staat een script vóór <meta charset>');
  const meta = `\n    <meta http-equiv="Content-Security-Policy" content="${cspPolicy(inlineScriptHashes(html, sha256))}" />`;
  return html.slice(0, at) + meta + html.slice(at);
}

/**
 * Controle op de uiteindelijke index.html van de build. Leeg = in orde. Zo
 * valt het op als een latere stap een inline script toevoegt of wijzigt: de
 * hash zou dan niet meer kloppen en de browser zou het script stil weigeren.
 */
export function verifyCsp(html: string, sha256: Sha256Base64): string[] {
  const errors = problemsForCsp(html);
  const metas = [...html.matchAll(CSP_META_RE)];
  if (metas.length !== 1) return [...errors, `index.html moet precies één CSP-meta hebben (gevonden: ${metas.length})`];
  const meta = metas[0];
  const content = attrValue(meta[0].replace(/^<meta\b/i, '').replace(/\/?>$/, ''), 'content') ?? '';
  const expected = cspPolicy(inlineScriptHashes(html, sha256));
  if (content !== expected) errors.push(`CSP klopt niet met de inline scripts:\n    staat er: ${content}\n    verwacht: ${expected}`);
  for (const bad of VERBODEN) {
    if (content.includes(bad)) errors.push(`CSP bevat ${bad}, wat nooit mag`);
  }
  const firstScript = scriptsIn(html)[0];
  if (firstScript && firstScript.start < (meta.index ?? 0)) errors.push('de CSP-meta staat na een script');
  const firstLink = /<link\b/i.exec(html);
  if (firstLink && firstLink.index < (meta.index ?? 0)) errors.push('de CSP-meta staat na een <link>');
  return errors;
}
