// De html van een doel (doelzin, uitbreiding, woordenschat) als een kleine, vaste structuur die veilig te tonen is.
//
// De officiële gegevens bevatten html met twaalf soorten tags (p, ul, li, br, strong, em, a, img, math, mfrac, mi, mn).
// Dit bestand leest ze met een kleine tagscanner, zonder DOM, en geeft blokken en inlines terug. Een component zet
// die om in React-elementen; er komt dus nergens ruwe html op het scherm. De tekst blijft letterlijk: er wordt niets
// ingekort, [F], [I] en [I/F] blijven staan, en een tag die we niet kennen verliest alleen zijn tag (de tekst erin blijft).
//
// Wat het doet:
// - ontcijfert entiteiten en haalt onzichtbare tekens (U+200B, U+00AD) weg;
// - '< bv. ... >' wordt een voorbeeld, en een andere '< ... >' met letters in een toelichting; '=, ≠, <, >' blijft tekst;
// - een breuk in MathML ('1' boven '10') wordt een breuk;
// - een adres wordt alleen een link als het via webUrl een https-adres is;
// - een afbeelding wordt alleen haar alt-tekst: het adres van de afbeelding verdwijnt.
//
// Zuiver: geen React, geen opslag en nergens de klok.

import { webUrl } from '../veiligeUrl';

export type Inline =
  | { t: 'tekst'; s: string }
  | { t: 'sterk' | 'nadruk'; kids: Inline[] }
  | { t: 'breuk'; teller: string; noemer: string }
  | { t: 'wiskunde'; s: string }
  | { t: 'link'; s: string; href?: string }
  | { t: 'beeld'; alt: string }
  | { t: 'voorbeeld' | 'toelichting'; kids: Inline[] }
  | { t: 'kennis'; s: 'F' | 'I' | 'I/F' }
  | { t: 'regel' };

export type Blok = { t: 'alinea'; kids: Inline[] } | { t: 'lijst'; geordend: boolean; items: Blok[][] };

// ─── Tekst ontcijferen ──────────────────────────────────────────────────────

const ENTITEITEN: Readonly<Record<string, string>> = {
  nbsp: '\u00a0',
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  euro: '€',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  deg: '°',
  shy: '\u00ad',
};

const ONZICHTBAAR = new RegExp('\\u200B|\\u200C|\\u200D|\\u2060|\\uFEFF|\\u00AD', 'g');

function codepunt(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}

function ontcijfer(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return codepunt(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITEITEN[e.toLowerCase()] ?? m;
    })
    .replace(ONZICHTBAAR, '');
}

// ─── Tagscanner ─────────────────────────────────────────────────────────────

interface Teken {
  tag?: string;
  sluit?: boolean;
  attrs?: Record<string, string>;
  tekst?: string;
}

function scan(html: string): Teken[] {
  const uit: Teken[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  const bron = html.replace(/<!--[\s\S]*?-->/g, '');
  while ((m = re.exec(bron))) {
    if (m[4] !== undefined || m[5] !== undefined) {
      uit.push({ tekst: m[4] ?? m[5] });
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = ontcijfer(a[2] ?? a[3] ?? '');
    uit.push({ tag: m[2].toLowerCase(), sluit: m[1] === '/', attrs });
  }
  return uit;
}

const BLOK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li']);
const isBlokTag = (t: Teken): boolean => t.tag !== undefined && BLOK_TAGS.has(t.tag);

/** Splitst gewone tekst in tekst en de labels [F], [I] en [I/F]. */
function kennisDelen(s: string): Inline[] {
  const uit: Inline[] = [];
  const re = /\[(I\/F|F|I)\]/g;
  let laatste = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > laatste) uit.push({ t: 'tekst', s: s.slice(laatste, m.index) });
    uit.push({ t: 'kennis', s: m[1] as 'F' | 'I' | 'I/F' });
    laatste = re.lastIndex;
  }
  if (laatste < s.length) uit.push({ t: 'tekst', s: s.slice(laatste) });
  return uit;
}

// ─── Voorbeelden en toelichtingen ───────────────────────────────────────────

const platTekst = (kids: readonly Inline[]): string => kids.map((k) => (k.t === 'tekst' ? k.s : k.t === 'breuk' ? '1' : '')).join('');

/**
 * '< bv. ... >' (voorbeeld) en '< ... >' (toelichting), ook als er een breuk of een regeleinde in staat. De inhoud moet
 * letters bevatten: '=, ≠, <, >' blijft gewone tekst. Een '<' zonder sluitende '>' in dezelfde alinea blijft tekst.
 */
function markeer(invoer: readonly Inline[]): Inline[] {
  const werk: Inline[] = [...invoer];
  const uit: Inline[] = [];
  let i = 0;
  while (i < werk.length) {
    const k = werk[i];
    if (k.t !== 'tekst') {
      uit.push(k);
      i++;
      continue;
    }
    const open = k.s.search(/<(?=\s|bv\b)/i);
    if (open < 0) {
      uit.push(k);
      i++;
      continue;
    }
    // zoek de eerste '>' na de '<', in dezelfde of een latere tekst
    let j = i;
    let sluit = -1;
    for (; j < werk.length; j++) {
      const kj = werk[j];
      if (kj.t !== 'tekst') continue;
      const p = kj.s.indexOf('>', j === i ? open + 1 : 0);
      if (p >= 0) {
        sluit = p;
        break;
      }
    }
    let binnen: Inline[] = [];
    if (sluit >= 0) {
      const eerste = werk[i] as { t: 'tekst'; s: string };
      const laatste = werk[j] as { t: 'tekst'; s: string };
      binnen =
        j === i
          ? [{ t: 'tekst', s: eerste.s.slice(open + 1, sluit) }]
          : [{ t: 'tekst', s: eerste.s.slice(open + 1) }, ...werk.slice(i + 1, j), { t: 'tekst', s: laatste.s.slice(0, sluit) }];
    }
    if (sluit < 0 || !/[a-zà-ÿ]{2,}/i.test(platTekst(binnen))) {
      // geen voorbeeld: de '<' blijft tekst en we zoeken verder achter die teken
      uit.push({ t: 'tekst', s: k.s.slice(0, open + 1) });
      werk[i] = { t: 'tekst', s: k.s.slice(open + 1) };
      continue;
    }
    if (open > 0) uit.push({ t: 'tekst', s: k.s.slice(0, open) });
    let isVoorbeeld = false;
    const kop = binnen[0] as { t: 'tekst'; s: string };
    const bv = /^\s*bv\.?\s*/i.exec(kop.s);
    if (bv) {
      isVoorbeeld = true;
      binnen[0] = { t: 'tekst', s: kop.s.slice(bv[0].length) };
    }
    uit.push({ t: isVoorbeeld ? 'voorbeeld' : 'toelichting', kids: schoonRand(binnen) });
    const laatste = werk[j] as { t: 'tekst'; s: string };
    const rest = laatste.s.slice(sluit + 1);
    werk.splice(i, j - i + 1, ...(rest !== '' ? [{ t: 'tekst' as const, s: rest }] : []));
  }
  return uit;
}

/** Voegt naastliggende tekst samen, maakt witruimte tot één spatie en haalt lege tekst en randregels weg. */
function schoonRand(kids: readonly Inline[]): Inline[] {
  const samen: Inline[] = [];
  for (const k of kids) {
    const vorige = samen[samen.length - 1];
    if (k.t === 'tekst' && vorige?.t === 'tekst') samen[samen.length - 1] = { t: 'tekst', s: vorige.s + k.s };
    else samen.push(k);
  }
  const uit: Inline[] = samen
    .map((k): Inline => (k.t === 'tekst' ? { t: 'tekst', s: k.s.replace(/\s+/g, ' ') } : k))
    .filter((k) => !(k.t === 'tekst' && k.s === ''));
  const eerste = uit[0];
  if (eerste?.t === 'tekst') uit[0] = { t: 'tekst', s: eerste.s.replace(/^ /, '') };
  const laatste = uit[uit.length - 1];
  if (laatste?.t === 'tekst') uit[uit.length - 1] = { t: 'tekst', s: laatste.s.replace(/ $/, '') };
  while (uit[0]?.t === 'regel' || (uit[0]?.t === 'tekst' && uit[0].s === '')) uit.shift();
  while (uit[uit.length - 1]?.t === 'regel' || (uit[uit.length - 1]?.t === 'tekst' && (uit[uit.length - 1] as { s: string }).s === '')) uit.pop();
  return uit;
}

// ─── De blokken ─────────────────────────────────────────────────────────────

/** De blokken van een stuk doelhtml. Gooit nooit een fout; wat niet te lezen is, wordt tekst. */
export function doeltekstBlokken(html: string): Blok[] {
  const ts = scan(typeof html === 'string' ? html : '');
  let i = 0;

  /** Inline-inhoud tot een teken waar `stop` voor geldt. Blokken (lijsten) onderbreken zichzelf nooit: dat doet `stop`. */
  function inlines(stop: (t: Teken) => boolean): Inline[] {
    const uit: Inline[] = [];
    let buf = '';
    const spoel = () => {
      if (buf !== '') {
        uit.push(...kennisDelen(ontcijfer(buf)));
        buf = '';
      }
    };
    while (i < ts.length && !stop(ts[i])) {
      const t = ts[i];
      if (t.tekst !== undefined) {
        buf += t.tekst;
        i++;
        continue;
      }
      if (t.tag === 'br' && !t.sluit) {
        spoel();
        uit.push({ t: 'regel' });
        i++;
        continue;
      }
      if ((t.tag === 'strong' || t.tag === 'b' || t.tag === 'em' || t.tag === 'i') && !t.sluit) {
        spoel();
        const tag = t.tag;
        i++;
        const kids = inlines((x) => (x.tag === tag && !!x.sluit) || isBlokTag(x));
        if (ts[i]?.tag === tag && ts[i].sluit) i++;
        uit.push({ t: tag === 'strong' || tag === 'b' ? 'sterk' : 'nadruk', kids });
        continue;
      }
      if (t.tag === 'a' && !t.sluit) {
        spoel();
        const adres = webUrl(t.attrs?.href);
        i++;
        let s = '';
        while (i < ts.length && !(ts[i].tag === 'a' && ts[i].sluit) && !isBlokTag(ts[i])) {
          if (ts[i].tekst !== undefined) s += ts[i].tekst;
          i++;
        }
        if (ts[i]?.tag === 'a' && ts[i].sluit) i++;
        const tekst = ontcijfer(s).replace(/\s+/g, ' ').trim();
        const href = adres !== null && /^https:\/\//i.test(adres) ? adres : undefined;
        uit.push({ t: 'link', s: tekst !== '' ? tekst : (href ?? ''), ...(href ? { href } : {}) });
        continue;
      }
      if (t.tag === 'img' && !t.sluit) {
        spoel();
        uit.push({ t: 'beeld', alt: (t.attrs?.alt ?? '').replace(/\s+/g, ' ').trim() });
        i++;
        continue;
      }
      if (t.tag === 'math' && !t.sluit) {
        spoel();
        uit.push(wiskunde());
        continue;
      }
      // een onbekende tag, of een sluitende tag zonder opener: de tag verdwijnt, de tekst erin blijft
      i++;
    }
    spoel();
    return uit;
  }

  /** Leest van <math> tot </math>. Precies één breuk (twee delen) en verder niets wordt een breuk, de rest platte tekst. */
  function wiskunde(): Inline {
    i++;
    const breuken: string[][] = [];
    let diepte = 0;
    let huidig: string[] = [];
    let los = '';
    while (i < ts.length && !(ts[i].tag === 'math' && ts[i].sluit)) {
      const x = ts[i];
      if (x.tag === 'mfrac') {
        if (!x.sluit) {
          diepte++;
          huidig = [];
        } else {
          diepte = Math.max(0, diepte - 1);
          breuken.push(huidig);
        }
      } else if (x.tekst !== undefined) {
        const s = ontcijfer(x.tekst).replace(/\s+/g, ' ').trim();
        if (diepte > 0) {
          if (s !== '') huidig.push(s);
        } else los += ontcijfer(x.tekst);
      }
      i++;
    }
    if (ts[i]?.tag === 'math') i++;
    if (breuken.length === 1 && breuken[0].length === 2 && los.trim() === '') {
      return { t: 'breuk', teller: breuken[0][0], noemer: breuken[0][1] };
    }
    const delen = [...breuken.map((d) => d.join('/')), los.replace(/\s+/g, ' ').trim()].filter((d) => d !== '');
    return { t: 'wiskunde', s: delen.join(' ') };
  }

  function alinea(uit: Blok[], kids: Inline[]) {
    const gemarkeerd = markeer(schoonRand(kids));
    const schoon = schoonRand(gemarkeerd);
    if (schoon.length > 0) uit.push({ t: 'alinea', kids: schoon });
  }

  function blokken(stop: (t: Teken) => boolean): Blok[] {
    const uit: Blok[] = [];
    while (i < ts.length && !stop(ts[i])) {
      const t = ts[i];
      if ((t.tag === 'ul' || t.tag === 'ol') && !t.sluit) {
        const tag = t.tag;
        i++;
        const items: Blok[][] = [];
        while (i < ts.length && !(ts[i].tag === tag && ts[i].sluit)) {
          const x = ts[i];
          if (x.tag === 'li' && !x.sluit) {
            i++;
            items.push(blokken((y) => y.tag === 'li' && !!y.sluit));
            if (ts[i]?.tag === 'li') i++;
          } else if (x.tekst !== undefined && x.tekst.trim() !== '') {
            // losse tekst tussen de items: die verdwijnt niet, maar wordt een item van zichzelf
            const rij: Blok[] = [];
            alinea(rij, inlines((y) => y.tag === 'li' || y.tag === 'ul' || y.tag === 'ol'));
            if (rij.length > 0) items.push(rij);
          } else {
            i++;
          }
        }
        if (ts[i]?.tag === tag) i++;
        uit.push({ t: 'lijst', geordend: tag === 'ol', items });
        continue;
      }
      if ((t.tag === 'p' || t.tag === 'div') && !t.sluit) {
        i++;
        const kids = inlines((x) => isBlokTag(x));
        if (ts[i] && (ts[i].tag === 'p' || ts[i].tag === 'div') && ts[i].sluit) i++;
        alinea(uit, kids);
        continue;
      }
      if (t.sluit && isBlokTag(t)) {
        i++;
        continue;
      }
      const voor = i;
      alinea(uit, inlines((x) => isBlokTag(x) || stop(x)));
      if (i === voor) i++;
    }
    return uit;
  }

  return blokken(() => false);
}

// ─── Platte tekst ───────────────────────────────────────────────────────────

/** Platte tekst voor zoeken: een breuk als 1/10, een afbeelding als alt-tekst, een voorbeeld als '(bv. ...)'. */
export function blokkenAlsTekst(b: readonly Blok[]): string {
  const inl = (k: Inline): string => {
    switch (k.t) {
      case 'tekst':
        return k.s;
      case 'sterk':
      case 'nadruk':
        return k.kids.map(inl).join('');
      case 'breuk':
        return `${k.teller}/${k.noemer}`;
      case 'wiskunde':
        return k.s;
      case 'link':
        return k.s;
      case 'beeld':
        return k.alt;
      case 'voorbeeld':
        return `(bv. ${k.kids.map(inl).join('').trim()})`;
      case 'toelichting':
        return `(${k.kids.map(inl).join('').trim()})`;
      case 'kennis':
        return `[${k.s}]`;
      case 'regel':
        return '\n';
    }
  };
  const blok = (x: Blok): string =>
    x.t === 'alinea' ? x.kids.map(inl).join('').trim() : x.items.map((it) => `• ${it.map(blok).join(' ')}`).join('\n');
  return b.map(blok).join('\n');
}
