// ── HTML → markdown: eigen, kleine converter ────────────────────────────────
//
// Waarom eigen code en geen DOMParser? Deze omzetting draait óók in de tests
// (node, zonder DOM) en moet voorspelbaar blijven: wat er binnenkomt is geen
// nette webpagina maar de html die mammoth uit een .docx perst, of een
// opgeslagen webpagina. We willen daar precies één ding uit: leesbare
// markdown die de cursusbouwer (lib/importers.ts) verder kan opdelen.
//
// Bewust beperkt gehouden:
//  - koppen h1–h3 → #/##/### (h4–h6 vallen samen met ###: dieper gaat het
//    cursusmodel niet)
//  - p, ul/ol (genest), blockquote, pre, hr
//  - strong/b → **, em/i → *, code → `, del/s → ~~, a[href] → [tekst](url)
//  - sup/sub → Unicode-hoog/laag (m², H₂O); lukt dat niet voor alle tekens,
//    dan ^(…) voor sup en gewone tekst voor sub
//  - table → markdown-tabel als alle rijen even breed zijn, anders platte rijen
//  - afbeeldingen vallen weg (ze zouden als base64 megabytes meeslepen)
//  - onbekende tags: alleen hun tekst blijft over

// ── Entiteiten ──────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  hellip: '…', mdash: '—', ndash: '–', minus: '−', bull: '•', middot: '·',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  deg: '°', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™',
  times: '×', divide: '÷', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾',
  sup2: '²', sup3: '³', alpha: 'α', beta: 'β', pi: 'π', micro: 'µ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
  auml: 'ä', ccedil: 'ç', iuml: 'ï', icirc: 'î', ouml: 'ö', ocirc: 'ô',
  uuml: 'ü', ucirc: 'û', ugrave: 'ù', ntilde: 'ñ',
};

/** Zet &amp;, &#233; en &#x2014; om naar gewone tekens; onbekende entiteiten blijven staan. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#[Xx]?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const num = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(num) || num <= 0 || num > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(num);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// ── Miniparser ──────────────────────────────────────────────────────────────

interface ElNode {
  tag: string;
  attrs: Record<string, string>;
  children: HNode[];
}
type HNode = string | ElNode;

function isEl(n: HNode): n is ElNode {
  return typeof n !== 'string';
}

/** Tags zonder sluitingstag. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/** Tags waarvan de inhoud nooit tekst voor de leerkracht is. */
const RAW = new Set(['script', 'style', 'head', 'template', 'noscript', 'svg']);

/** Blokelementen: breken een alinea af en krijgen hun eigen markdown-blok. */
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'col',
  'colgroup', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'html', 'legend', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

/**
 * Welke nog openstaande elementen een nieuwe tag stilzwijgend sluit. Word-html
 * en opgeslagen webpagina's laten `<li>`, `<td>` en `<p>` vaak open; zonder
 * deze regels zou alles daarna in elkaar schuiven.
 */
const AUTO_CLOSE: Record<string, string[]> = {
  li: ['p', 'li'],
  dt: ['p', 'dt', 'dd'],
  dd: ['p', 'dt', 'dd'],
  td: ['p', 'td', 'th'],
  th: ['p', 'td', 'th'],
  tr: ['p', 'td', 'th', 'tr'],
  thead: ['p', 'td', 'th', 'tr'],
  tbody: ['p', 'td', 'th', 'tr', 'thead'],
  tfoot: ['p', 'td', 'th', 'tr', 'tbody', 'thead'],
};

const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

function parseAttrs(rest: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(rest)) !== null) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

function parseHtml(html: string): ElNode {
  const root: ElNode = { tag: '#root', attrs: {}, children: [] };
  const stack: ElNode[] = [root];
  const top = () => stack[stack.length - 1];
  const pushText = (t: string) => {
    if (t) top().children.push(t);
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }

    const m = TAG_RE.exec(html.slice(lt));
    if (!m) {
      // losse "<" in gewone tekst
      pushText('<');
      i = lt + 1;
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const rest = m[3];
    i = lt + m[0].length;

    if (closing) {
      // dichtstbijzijnde open element met deze naam sluiten; een zwevende
      // sluitingstag (zonder opening) wordt genegeerd
      let at = -1;
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          at = k;
          break;
        }
      }
      if (at > 0) stack.length = at;
      continue;
    }

    if (RAW.has(tag)) {
      const close = new RegExp(`</\\s*${tag}\\s*>`, 'i');
      const found = close.exec(html.slice(i));
      i = found ? i + found.index + found[0].length : html.length;
      continue;
    }

    const closes = AUTO_CLOSE[tag] ?? (BLOCK.has(tag) ? ['p'] : []);
    while (stack.length > 1 && closes.includes(top().tag)) stack.pop();

    const node: ElNode = { tag, attrs: parseAttrs(rest), children: [] };
    top().children.push(node);
    if (!VOID.has(tag) && !rest.trimEnd().endsWith('/')) stack.push(node);
  }
  return root;
}

// ── Tekst opschonen ─────────────────────────────────────────────────────────

/** Spaties samenvouwen per regel; harde regeleinden (uit <br>) blijven staan. */
function tidy(s: string): string {
  return s
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Opmaaktekens rond de inhoud zetten, met de spaties netjes buiten de markers. */
function wrapMark(inner: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  if (!m || !m[2]) return inner;
  return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
}

function rawText(n: HNode): string {
  return isEl(n) ? n.children.map(rawText).join('') : decodeEntities(n);
}

// ── Hoog en laag ────────────────────────────────────────────────────────────

/** Cijfers en tekens waarvoor Unicode een hoge variant heeft (m², 10⁻³, xⁿ). */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ',
};

/** Cijfers en tekens waarvoor Unicode een lage variant heeft (H₂O, CO₂). */
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
};

/** Elk teken omzetten via de tabel; `null` zodra er één teken geen variant heeft. */
function mapChars(text: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of text) {
    const mapped = table[ch];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}

/**
 * <sup> en <sub>: markdown kent ze niet, en de lezer toonde anders "H2O" en
 * "m2". Waar het kan worden het Unicode-tekens; anders ^(…) voor hoog en de
 * gewone tekst voor laag. Spaties aan de rand blijven buiten de omzetting.
 */
function scriptOf(el: ElNode): string {
  const sup = el.tag === 'sup';
  const inner = inlineOf(el.children);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  if (!m || !m[2]) return inner;
  const plain = rawText(el).replace(/\s+/g, ' ').trim();
  const mapped = mapChars(plain, sup ? SUPERSCRIPT : SUBSCRIPT);
  // Alleen letters ("2<sup>de</sup> graad", "1<sup>e</sup>", "XIX<sup>e</sup>"): gewoon tekst, geen ^(…).
  const rangtelwoord = sup && /^\p{L}+$/u.test(plain);
  const core = mapped ?? (rangtelwoord ? m[2] : sup ? `^(${m[2]})` : m[2]);
  return `${m[1]}${core}${m[3]}`;
}

// ── Inline ──────────────────────────────────────────────────────────────────

function inlineOf(nodes: HNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (!isEl(n)) {
      out += decodeEntities(n).replace(/\s+/g, ' ');
      continue;
    }
    switch (n.tag) {
      case 'br':
        out += '\n';
        break;
      case 'img':
        break; // afbeeldingen reizen niet mee als tekst
      case 'strong':
      case 'b':
        out += wrapMark(inlineOf(n.children), '**');
        break;
      case 'em':
      case 'i':
      case 'cite':
      case 'var':
        // `*` en niet `_`: de lezer (lib/markdown.ts) kent alleen `*cursief*`.
        out += wrapMark(inlineOf(n.children), '*');
        break;
      case 'sup':
      case 'sub':
        out += scriptOf(n);
        break;
      case 'code':
      case 'kbd':
      case 'samp':
        out += wrapMark(inlineOf(n.children), '`');
        break;
      case 'del':
      case 's':
      case 'strike':
        out += wrapMark(inlineOf(n.children), '~~');
        break;
      case 'a': {
        const text = inlineOf(n.children);
        const href = (n.attrs.href ?? '').trim();
        out += href && /^(https?:|mailto:)/i.test(href) && text.trim()
          ? `[${text.trim()}](${href})`
          : text;
        break;
      }
      default:
        out += inlineOf(n.children);
    }
  }
  return out;
}

/** Inline-inhoud op één regel (voor koppen, lijstitems en tabelcellen). */
function oneLine(nodes: HNode[]): string {
  return tidy(inlineOf(nodes)).replace(/\n+/g, ' ');
}

// ── Blokken ─────────────────────────────────────────────────────────────────

const HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 3, h5: 3, h6: 3 };

function listLines(el: ElNode, ordered: boolean, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let nr = 1;
  for (const child of el.children) {
    if (!isEl(child)) continue;
    if (child.tag === 'ul' || child.tag === 'ol') {
      // lijst zonder eigen <li> ertussen: gewoon één niveau dieper
      lines.push(...listLines(child, child.tag === 'ol', depth + 1));
      continue;
    }
    if (child.tag !== 'li') continue;
    const own: HNode[] = [];
    const sub: string[] = [];
    for (const c of child.children) {
      if (isEl(c) && (c.tag === 'ul' || c.tag === 'ol')) sub.push(...listLines(c, c.tag === 'ol', depth + 1));
      else own.push(c);
    }
    const text = oneLine(own);
    if (text || sub.length) {
      lines.push(`${indent}${ordered ? `${nr}. ` : '- '}${text}`);
      nr++;
    }
    lines.push(...sub);
  }
  return lines;
}

function collectRows(el: ElNode, rows: ElNode[]): void {
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.tag === 'tr') rows.push(c);
    else if (c.tag === 'thead' || c.tag === 'tbody' || c.tag === 'tfoot' || c.tag === 'table') collectRows(c, rows);
  }
}

function tableOf(el: ElNode): string[] {
  const trs: ElNode[] = [];
  collectRows(el, trs);
  const rows = trs
    .map((tr) =>
      tr.children
        .filter(isEl)
        .filter((c) => c.tag === 'td' || c.tag === 'th')
        // pipes in de inhoud zouden de kolommen van een markdown-tabel breken
        .map((c) => oneLine(c.children).replace(/\|/g, '\\|'))
    )
    .filter((cells) => cells.length > 0);

  const out: string[] = [];
  const caption = el.children.find((c): c is ElNode => isEl(c) && c.tag === 'caption');
  if (caption) {
    const t = oneLine(caption.children);
    if (t) out.push(t);
  }
  if (rows.length === 0) return [...out, ...blocksOf(el.children)];

  const width = rows[0].length;
  // Een markdown-tabel vraagt rechthoekige rijen én een kopregel; de eerste
  // rij wordt de kop (ook zonder <th>, dat is de enige vorm die markdown kent).
  const rectangular = width >= 2 && rows.every((r) => r.length === width);
  if (!rectangular) {
    // Samengevoegde cellen of wisselende breedtes: platte rijen, geen tabel.
    out.push(rows.map((r) => r.join(' | ')).join('\n'));
    return out;
  }
  const lines = [
    `| ${rows[0].join(' | ')} |`,
    `| ${rows[0].map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`),
  ];
  out.push(lines.join('\n'));
  return out;
}

function blockOf(el: ElNode): string[] {
  const level = HEADING_LEVEL[el.tag];
  if (level) {
    const t = oneLine(el.children);
    return t ? [`${'#'.repeat(level)} ${t}`] : [];
  }
  switch (el.tag) {
    case 'hr':
      return ['---'];
    case 'ul':
    case 'ol': {
      const lines = listLines(el, el.tag === 'ol', 0);
      return lines.length ? [lines.join('\n')] : [];
    }
    case 'table':
      return tableOf(el);
    case 'pre': {
      const t = rawText(el).replace(/^\n+|\s+$/g, '');
      return t ? ['```\n' + t + '\n```'] : [];
    }
    case 'blockquote': {
      const inner = blocksOf(el.children);
      if (inner.length === 0) return [];
      return [inner.map((b) => b.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')).join('\n>\n')];
    }
    case 'dt': {
      const t = oneLine(el.children);
      return t ? [wrapMark(t, '**')] : [];
    }
    case 'p':
    case 'dd':
    case 'figcaption':
    case 'summary':
    case 'address':
    case 'caption':
    case 'legend': {
      const t = tidy(inlineOf(el.children));
      return t ? [t] : [];
    }
    default:
      // div, section, li/td buiten hun context, onbekende tags …
      return blocksOf(el.children);
  }
}

function blocksOf(nodes: HNode[]): string[] {
  const out: string[] = [];
  let buf: HNode[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    const t = tidy(inlineOf(buf));
    buf = [];
    if (t) out.push(t);
  };
  for (const n of nodes) {
    if (isEl(n) && BLOCK.has(n.tag)) {
      flush();
      out.push(...blockOf(n));
    } else {
      buf.push(n);
    }
  }
  flush();
  return out;
}

// ── Publieke API ────────────────────────────────────────────────────────────

/**
 * Zet html om naar markdown. Alles wat niet herkend wordt, komt als gewone
 * tekst terug — er gaat dus nooit inhoud verloren, hoogstens opmaak.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const root = parseHtml(html);
  return blocksOf(root.children)
    .map((b) => b.trimEnd())
    .filter((b) => b.trim() !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
