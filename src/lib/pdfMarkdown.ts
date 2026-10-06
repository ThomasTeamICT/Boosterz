// ── Pdf → markdown met structuur (koppen, vet, lijsten, alinea's) ───────────
//
// Wat een leerkracht als "mijn cursus" aanlevert, is vaak een reeks pdf's uit
// Word of Google Docs: één lettergrootte voor de lopende tekst, grotere voor
// de titels, vette run-in-labels ("Voorbeeld:", "Oefening:") en opsommingen
// met bolletjes. pdf.js geeft ons losse tekstitems met positie, lettergrootte
// en lettertype; hier maken we daar markdown van waar de opbouw in zit, zodat
// markdownToCourse er hoofdstukken, secties, koppen en callouts van maakt.
//
// De kern (pdfLinesToMarkdown) is een pure functie op al gegroepeerde regels,
// zodat ze in vitest zonder browser of pdf.js te testen valt.

export interface PdfSpan {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
}

export interface PdfLine {
  page: number;
  /** y-coördinaat (pdf-ruimte, oplopend naar boven) van de basislijn. */
  y: number;
  /** x-coördinaat van het eerste item. */
  x: number;
  spans: PdfSpan[];
  /**
   * Begint met een opsommingsteken. Pdf's uit Word, Docs of een browser tekenen
   * het bolletje vaak niet als letter maar als klein gevuld cirkeltje (een
   * vectorpad) links van de regel; die tekenen we op via bulletMarksFromOps en
   * koppelen we hier aan de regel. Een bolletje dat wél een letter is (•, -, –)
   * vangt pdfLinesToMarkdown zelf op.
   */
  bullet?: boolean;
}

export interface PdfMarkdownOptions {
  /** Boven deze verhouding t.o.v. de broodtekst is een regel een kop. */
  headingRatio?: number;
  /** Hoogstens zoveel kopniveaus (#, ##, ###). */
  maxHeadingLevels?: number;
}

const BULLET_RE = /^\s*[•●○◦▪■\-–—]\s+/;
const NUMBERED_RE = /^\s*(\d{1,2}[.)]|[a-z][.)]|[A-Z][.)]|[ivx]+[.)])\s+/;

function lineText(line: PdfLine): string {
  return line.spans.map((s) => s.text).join('').replace(/\s+/g, ' ').trim();
}

function lineSize(line: PdfLine): number {
  let best = 0;
  let bestLen = 0;
  const counts = new Map<number, number>();
  for (const s of line.spans) {
    const t = s.text.trim();
    if (!t) continue;
    const k = Math.round(s.size * 2) / 2;
    counts.set(k, (counts.get(k) ?? 0) + t.length);
  }
  for (const [k, n] of counts) if (n > bestLen) { best = k; bestLen = n; }
  return best;
}

/** Na zo'n woord hoort een streepje aan het regeleinde bij een opsomming: "voor- en nadelen". */
const HYPHEN_CONJUNCTIONS = new Set(['en', 'of', 'tot', 'noch']);

/**
 * Twee regels aan elkaar, alleen op de regelgrens. Eindigt de vorige regel op
 * een letter met een streepje en begint de volgende met een kleine letter, dan
 * is het een afgebroken woord ("zee-" + "water" → "zeewater"). Volgt er een
 * voegwoord ("voor-" + "en nadelen") of een hoofdletter ("Noord-" + "Amerika"),
 * dan hoort het streepje bij de tekst en komt er gewoon een spatie.
 */
function glueLines(prev: string, next: string): string {
  if (/\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(next)) {
    const first = /^\p{L}+/u.exec(next)?.[0] ?? '';
    if (!HYPHEN_CONJUNCTIONS.has(first)) return prev.slice(0, -1) + next;
  }
  return `${prev} ${next}`;
}

/**
 * Regels van één alinea aan elkaar. Vette of cursieve tekst die over een
 * regeleinde doorloopt ("**7**" + "**meter**") wordt weer één markering.
 */
function joinPara(lines: string[]): string {
  let joined = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    joined = joined ? glueLines(joined, line) : line;
  }
  return joined
    .replace(/\s+/g, ' ')
    .replace(/\*\* \*\*/g, ' ')
    .replace(/(^|[^*])\* \*(?!\*)/g, '$1 ')
    .trim();
}

/** Vette en cursieve spans als markdown; aangrenzende gelijke spans samengevoegd. */
function spansToMarkdown(spans: PdfSpan[]): string {
  const merged: PdfSpan[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && last.bold === s.bold && last.italic === s.italic) last.text += s.text;
    else merged.push({ ...s });
  }
  return merged
    .map((s) => {
      const raw = s.text.replace(/\s+/g, ' ');
      const lead = raw.match(/^\s*/)?.[0] ?? '';
      const trail = raw.match(/\s*$/)?.[0] ?? '';
      const core = raw.trim();
      if (!core) return raw;
      let out = core;
      if (s.bold) out = `**${out}**`;
      if (s.italic) out = `*${out}*`;
      return lead + out + trail;
    })
    .join('')
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/\*\* (\*\*)/g, ' ')
    .replace(/\*\* ([.,;:!?)])/g, '**$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Broodtekstgrootte: de grootte met de meeste tekens.
 * Koppen: de groottes die duidelijk groter zijn, van groot naar klein
 * gerangschikt → #, ##, ### (extra niveaus vallen op het laagste).
 */
export function classifySizes(lines: PdfLine[], opts: PdfMarkdownOptions = {}): { body: number; headings: number[] } {
  const ratio = opts.headingRatio ?? 1.15;
  const maxLevels = opts.maxHeadingLevels ?? 3;
  const chars = new Map<number, number>();
  for (const l of lines) {
    const t = lineText(l);
    if (!t) continue;
    const k = lineSize(l);
    chars.set(k, (chars.get(k) ?? 0) + t.length);
  }
  let body = 0;
  let bodyChars = -1;
  for (const [k, n] of chars) if (n > bodyChars) { body = k; bodyChars = n; }
  const headings = [...chars.keys()]
    .filter((k) => k >= body * ratio)
    .sort((a, b) => b - a);
  // Meer niveaus dan we kwijt kunnen: de kleinste vallen samen op ###.
  return { body, headings: headings.slice(0, maxLevels).concat(headings.slice(maxLevels).map(() => headings[maxLevels - 1] ?? 0)).slice(0, headings.length) };
}

function headingLevel(size: number, headings: number[]): number {
  const idx = headings.indexOf(size);
  if (idx < 0) return 0;
  return Math.min(idx + 1, 3);
}

function isNoiseLine(text: string): boolean {
  // paginanummers, losse cijfers, lege bolletjes
  return /^[\d\s./-]{1,7}$/.test(text) || /^[•●○◦▪■]$/.test(text);
}

/**
 * Regels → markdown. Verwacht regels in leesvolgorde (per pagina van boven
 * naar beneden). Alinea's worden herkend aan een grotere verticale sprong dan
 * de gewone regelafstand; koppen aan hun lettergrootte; opsommingen aan het
 * bolletje; vette run-ins blijven vet zodat markdownToCourse er een callout
 * van kan maken ("**Voorbeeld:** …").
 */
export function pdfLinesToMarkdown(lines: PdfLine[], opts: PdfMarkdownOptions = {}): string {
  const { headings } = classifySizes(lines, opts);
  const out: string[] = [];
  let para: string[] = [];
  let pendingHeading: { level: number; text: string } | null = null;
  let prev: PdfLine | null = null;
  let prevText = '';
  let inList = false;

  // Gewone regelafstand: mediaan van de verticale sprongen binnen een pagina.
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page !== lines[i - 1].page) continue;
    const g = Math.abs(lines[i - 1].y - lines[i].y);
    if (g > 0.5) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14;

  const flushPara = () => {
    if (para.length) {
      out.push(joinPara(para));
      out.push('');
      para = [];
    }
    inList = false;
  };
  const flushHeading = () => {
    if (pendingHeading) {
      out.push(`${'#'.repeat(pendingHeading.level)} ${pendingHeading.text.trim()}`);
      out.push('');
      pendingHeading = null;
    }
  };

  for (const line of lines) {
    const text = lineText(line);
    if (!text || isNoiseLine(text)) continue;
    const size = lineSize(line);
    const level = headingLevel(size, headings);

    if (level > 0) {
      flushPara();
      // Titels over meerdere regels: zelfde niveau, meteen eronder → samenvoegen.
      if (pendingHeading && pendingHeading.level === level && prev && prev.page === line.page && Math.abs(prev.y - line.y) < Math.max(lineGap * 2.2, size * 1.6)) {
        pendingHeading.text += ' ' + text;
      } else {
        flushHeading();
        pendingHeading = { level, text };
      }
      prev = line;
      prevText = text;
      continue;
    }
    flushHeading();

    const md = spansToMarkdown(line.spans);
    const bullet = Boolean(line.bullet) || BULLET_RE.test(text);
    const numbered = NUMBERED_RE.test(text) && text.length < 220;
    const samePage = prev && prev.page === line.page;
    const gap = samePage && prev ? Math.abs(prev.y - line.y) : Infinity;
    const bigGap = gap > lineGap * 1.55;
    const startsBoldLabel = /^\*\*[^*]{2,40}:\*\*/.test(md) || /^\*\*[^*]{2,40}:\s/.test(md)
      // "**Term** Uitleg…" na een afgesloten zin: een nieuwe definitie (begrippenlijst)
      || (/^\*\*[^*]{2,40}\*\* [A-Z\u00C0-\u00DE]/.test(md) && /[.!?]$/.test(prevText));
    const prevEndsSentence = /[.!?:]$/.test(prevText);
    // Een vervolgregel van een lijstitem springt niet terug naar links.
    const outdented = Boolean(samePage && prev && line.x < prev.x - lineSize(line) * 0.6);

    if (bullet || numbered) {
      // een nieuw lijstitem sluit de vorige alinea of het vorige item af
      if (!inList) flushPara();
      else if (para.length) { out.push(joinPara(para)); para = []; }
      inList = true;
      const item = bullet ? md.replace(BULLET_RE, '') : md;
      para.push(bullet ? `- ${item}` : `- ${item}`);
    } else if (inList && !bigGap && !startsBoldLabel && !prevEndsSentence && !outdented) {
      // vervolgregel van een lijstitem
      para.push(md);
    } else {
      if (inList) flushPara();
      if (bigGap || startsBoldLabel || !samePage && prevEndsSentence) {
        if (para.length) flushPara();
      }
      para.push(md);
    }
    prev = line;
    prevText = text;
  }
  flushPara();
  flushHeading();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── pdf.js → regels ─────────────────────────────────────────────────────────

interface TextItemLike {
  str: string;
  transform: number[];
  fontName: string;
  hasEOL?: boolean;
}

interface FontLike { name?: string }

function fontFlags(name: string | undefined): { bold: boolean; italic: boolean } {
  const n = (name ?? '').toLowerCase();
  return {
    bold: /bold|black|heavy|semibold|demibold/.test(n),
    italic: /italic|oblique/.test(n),
  };
}

/** Een klein gevuld vectorpad (bolletje van een opsomming), in pdf-ruimte. */
export interface BulletMark {
  /** Middelpunt. */
  x: number;
  y: number;
}

interface OpsLike {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke?: number;
  closeEoFillStroke?: number;
}

type Matrix = [number, number, number, number, number, number];

function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** cur ∘ m: eerst m toepassen, dan cur (zoals `cm` in een pdf). */
function compose(cur: Matrix, m: Matrix): Matrix {
  return [
    cur[0] * m[0] + cur[2] * m[1],
    cur[1] * m[0] + cur[3] * m[1],
    cur[0] * m[2] + cur[2] * m[3],
    cur[1] * m[2] + cur[3] * m[3],
    cur[0] * m[4] + cur[2] * m[5] + cur[4],
    cur[1] * m[4] + cur[3] * m[5] + cur[5],
  ];
}

/** Groter dan dit (in pt) is geen bolletje meer maar een figuur of kader. */
const BULLET_MAX_PT = 9;

/**
 * Opsommingsbolletjes uit de operatorlijst van een pagina halen: kleine
 * gevulde paden (≤ 9 pt, ongeveer vierkant). We volgen de transformatiematrix
 * (save/restore/transform) zodat de positie in dezelfde ruimte belandt als de
 * tekstitems van getTextContent.
 */
export function bulletMarksFromOps(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: OpsLike): BulletMark[] {
  const fillOps = new Set([ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEoFillStroke].filter((v): v is number => typeof v === 'number'));
  const marks: BulletMark[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === ops.save) {
      stack.push(ctm);
      if (stack.length > 64) stack.shift();
    } else if (fn === ops.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === ops.transform) {
      const m = args as ArrayLike<number> | null;
      if (m && m.length >= 6) ctm = compose(ctm, [m[0], m[1], m[2], m[3], m[4], m[5]]);
    } else if (fn === ops.constructPath) {
      const a = args as unknown[] | null;
      if (!a || !fillOps.has(a[0] as number)) continue;
      const minMax = a[2] as ArrayLike<number> | undefined;
      if (!minMax || minMax.length < 4 || !Number.isFinite(minMax[0])) continue;
      const corners = [
        applyMatrix(ctm, minMax[0], minMax[1]),
        applyMatrix(ctm, minMax[2], minMax[1]),
        applyMatrix(ctm, minMax[0], minMax[3]),
        applyMatrix(ctm, minMax[2], minMax[3]),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (w < 1 || h < 1 || w > BULLET_MAX_PT || h > BULLET_MAX_PT) continue;
      if (w / h > 2 || h / w > 2) continue;
      marks.push({ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 });
    }
  }
  return marks;
}

/**
 * Items van één pagina groeperen tot regels (zelfde basislijn, ±2 pt),
 * gesorteerd van boven naar beneden en van links naar rechts. Een regel met
 * een bolletje (uit `marks`) vlak links ervan wordt een lijstitem.
 */
export function itemsToLines(
  page: number,
  items: TextItemLike[],
  fontNameOf: (fontName: string) => string | undefined,
  marks: BulletMark[] = []
): PdfLine[] {
  const rows: { y: number; items: { x: number; span: PdfSpan }[] }[] = [];
  for (const it of items) {
    // pdf.js geeft soms een leeg item (str === '') aan het begin van een
    // tekstobject; dat draagt geen tekst en geen structuur.
    if (it.str === '') continue;
    if (!it.str.trim() && !rows.length) continue;
    const size = Math.hypot(it.transform[0], it.transform[1]) || Math.abs(it.transform[3]) || 12;
    const x = it.transform[4];
    const y = it.transform[5];
    const flags = fontFlags(fontNameOf(it.fontName));
    const span: PdfSpan = { text: it.str, size, bold: flags.bold, italic: flags.italic };
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, size * 0.35));
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, span });
  }
  rows.sort((a, b) => b.y - a.y); // pdf-y loopt omhoog: hoogste eerst
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    // Items zonder spatie ertussen die visueel los staan: een spatie invoegen.
    const spans: PdfSpan[] = [];
    let lastEnd = -Infinity;
    for (const { x, span } of r.items) {
      const needsSpace = spans.length > 0 && x - lastEnd > span.size * 0.25 && !/\s$/.test(spans[spans.length - 1].text) && !/^\s/.test(span.text);
      spans.push(needsSpace ? { ...span, text: ' ' + span.text } : span);
      lastEnd = x + span.text.length * span.size * 0.5; // ruwe breedte; alleen voor spatiëring
    }
    const x = r.items[0]?.x ?? 0;
    const size = Math.max(...r.items.map((i) => i.span.size), 1);
    const bullet = marks.some((m) => m.x < x && x - m.x <= size * 4 && m.y >= r.y - size * 0.3 && m.y <= r.y + size * 1.1);
    return { page, y: r.y, x, spans, ...(bullet ? { bullet: true } : {}) };
  }).filter((l) => l.spans.length > 0);
}

/** Meer dan dit plakken we niet door: de importpagina waarschuwt. */
export const MAX_MARKDOWN_CHARS = 200000;

/**
 * Pdf → markdown met structuur. Geeft ook het aantal afbeeldingen terug dat
 * in de pdf zit (die reizen niet mee; de leerkracht voegt ze toe in de editor).
 */
export async function extractPdfMarkdown(src: Blob): Promise<{ markdown: string; pages: number; images: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const data = await src.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const pages = doc.numPages;
    const lines: PdfLine[] = [];
    let images = 0;
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      // Lettertypes laden zodat we vet/cursief kunnen herkennen; tegelijk
      // tellen we de afbeeldingen (paintImageXObject).
      let fontNames = new Map<string, string>();
      try {
        const ops = await page.getOperatorList();
        for (const fn of ops.fnArray) if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) images++;
        const marks = bulletMarksFromOps(ops.fnArray, ops.argsArray, pdfjs.OPS);
        const content = await page.getTextContent();
        const names = new Set((content.items as TextItemLike[]).map((it) => it.fontName).filter(Boolean));
        for (const name of names) {
          try {
            const font = page.commonObjs.get(name) as FontLike | undefined;
            if (font?.name) fontNames.set(name, font.name);
          } catch {
            // lettertype (nog) niet geladen: dan zonder vet/cursief
          }
        }
        lines.push(...itemsToLines(n, content.items as TextItemLike[], (f) => fontNames.get(f), marks));
      } catch {
        fontNames = new Map();
        const content = await page.getTextContent();
        lines.push(...itemsToLines(n, content.items as TextItemLike[], () => undefined));
      }
    }
    let markdown = pdfLinesToMarkdown(lines);
    if (markdown.length > MAX_MARKDOWN_CHARS) markdown = markdown.slice(0, MAX_MARKDOWN_CHARS) + '\n\n[… ingekort …]\n';
    return { markdown, pages, images };
  } finally {
    try { await task.destroy(); } catch { /* al opgeruimd */ }
  }
}
