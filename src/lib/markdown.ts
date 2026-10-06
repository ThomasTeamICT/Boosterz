// ── Veilige mini-markdown voor cursusblokken ────────────────────────────────
//
// Bewust klein gehouden: alle HTML wordt eerst ontsmet (ge-escaped) en pas
// daarna worden een handvol markdown-patronen omgezet. Zo kan er nooit
// script of opmaak uit bronmateriaal in de pagina belanden.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('#/')) return u; // interne app-link
  return null;
}

/**
 * Inline-opmaak binnen één regel: **vet**, *cursief*, ~~doorgehaald~~, `code`,
 * [tekst](url).
 *
 * Volgorde telt: links eerst (zodat een `*` of `~~` in een url de opmaak niet
 * meer in het href-attribuut kan trekken), dan code, dan vet vóór cursief
 * (anders zou `**vet**` als twee lege sterretjes met `*vet*` ertussen lezen).
 */
function inline(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    // `url` (en dus `safe`) komt uit de tekst die hierboven al door
    // escapeHtml(md) ging: `&` is al `&amp;`, `"` al `&quot;`, `<` al `&lt;`.
    // Niet nogmaals escapen: dat geeft `&amp;amp;` en dus kapotte
    // query-parameters. Zonder rauwe `"` kan de waarde het attribuut ook niet
    // doorbreken.
    const safe = safeUrl(url);
    if (!safe) return label;
    const href = safe.replace(/\*/g, '%2A').replace(/`/g, '%60').replace(/~~/g, '%7E%7E');
    const external = safe.startsWith('http');
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Vet mag een *cursief* stuk bevatten (htmlToMarkdown maakt "**de *Quercus***"
  // van <strong>de <em>Quercus</em></strong>); de cursiefstap hieronder zet dat
  // binnenste stuk dan om. De opening moet tegen tekst aan staan: "5 ** 3" blijft.
  s = s.replace(/\*\*(?=\S)((?:[^*]|\*[^*\s](?:[^*]*[^*\s])?\*)+?)\*\*/g, '<strong>$1</strong>');
  // Cursief alleen als de sterretjes tegen tekst aan staan: "5 * 3 = 15 en 2 * 4"
  // blijft letterlijk. Bewust zonder lookbehind (Safari < 16.4 kan dat niet laden).
  s = s.replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s;
}

/** Hek van een codeblok: ``` met hooguit een taalnaam erachter (```js). */
const FENCE_RE = /^\s*```[\w-]*\s*$/;

/**
 * Zet een markdown-tekst om naar veilige HTML.
 * Ondersteunt alinea's, - en 1. lijsten, ### koppen, > citaten en ```-codeblokken.
 */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // codeblok: de inhoud wordt alleen ge-escaped, niet als markdown gelezen.
    // Zonder sluitend hek loopt het blok door tot het einde van de tekst.
    if (FENCE_RE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // sluitend hek
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    // koppen
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(4, h[1].length + 1); // ## → h3, ### → h4
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    // ongeordende lijst
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    // geordende lijst
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    // citaat
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(inline(lines[i].replace(/^\s*>\s?/, '')));
        i++;
      }
      out.push(`<blockquote>${quoted.join('<br/>')}</blockquote>`);
      continue;
    }
    // alinea (opeenvolgende niet-lege regels samenvoegen met <br/>)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !FENCE_RE.test(lines[i]) && !/^(#{2,4})\s|^\s*[-*]\s+|^\s*\d+[.)]\s+|^\s*>\s?/.test(lines[i])) {
      para.push(inline(lines[i]));
      i++;
    }
    out.push(`<p>${para.join('<br/>')}</p>`);
  }
  return out.join('\n');
}
