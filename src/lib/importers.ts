// ── Bestaand materiaal binnenhalen ──────────────────────────────────────────
//
// Eén ingang voor alles wat een leerkracht al heeft liggen: een Word-document,
// een pdf, een stuk markdown of tekst, een opgeslagen webpagina, of een eerder
// geëxporteerd Boosterz-bestand (widget, vakgroeppakket of cursus).
//
// `extractFromFile` geeft altijd hetzelfde soort antwoord terug: wát het is
// (kind), waar het vandaan komt en — bij tekst — de leesbare tekst. Wat er
// daarna mee gebeurt, kiest de leerkracht op de importpagina: AI-cursus,
// AI-oefeningen, of een cursus zonder AI via `markdownToCourse`.
//
// Alles gebeurt op het toestel zelf. Pas als de leerkracht uitdrukkelijk voor
// een AI-stap kiest, vertrekt er tekst naar de gekozen AI-aanbieder.

import type { Widget } from './types';
import { referencedPdfIds, referencedWidgetIds } from './courseTypes';
import type { Course, CourseBlock, CourseChapter, CourseSection } from './courseTypes';
import type { FolderPack } from './share';
import {
  adoptSharedCourse, conflictKey, createCourse, findSharedConflicts, getCourse, importCourseJson, makeBlock,
  restoreCoursePdfs, saveCourse,
  type CoursePdf, type SharedChoice, type SharedConflict,
} from './courses';
import { importFolderPack, importWidgetJson } from './share';
import { extractPdfMarkdown } from './pdfMarkdown';
import { htmlToMarkdown } from './htmlToMarkdown';
import { deleteFolder, deleteWidget, getWidget, getWidgets, saveFolder, saveWidget } from './storage';
import { stringifyWithMedia } from './mediaStore';
import { makeCode, uid } from './utils';
import { WIDGET_TYPES, defaultSettings } from '../widgets/registry';

/** Boven dit aantal tekens waarschuwen we: de AI werkt beter met één hoofdstuk per keer. */
export const MAX_COMFORT_CHARS = 60000;

/** Grens per bestand; daarboven loopt het geheugen van een schoollaptop vol. */
export const MAX_FILE_MB = 25;

/** Wat de bestandskiezer mag aanbieden (accept-attribuut). */
export const IMPORT_ACCEPT = '.docx,.pdf,.md,.markdown,.txt,.csv,.html,.htm,.json';

/** Een cursusbestand zoals importCourseJson het teruggeeft (met de meegereisde pdf's). */
export interface CourseBundle {
  course: Course;
  widgets: Widget[];
  pdfs: CoursePdf[];
}

/** Nette, Nederlandstalige fout die rechtstreeks aan de leerkracht getoond mag worden. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export type ExtractKind = 'text' | 'widget' | 'pack' | 'course';

export interface ExtractedSource {
  /** Wat er in het bestand zat. */
  kind: ExtractKind;
  /** Bestandsnaam of "plakbord" — waar het vandaan komt. */
  origin: string;
  /** Korte omschrijving van het formaat, bv. "Word-document (.docx)". */
  sourceLabel: string;
  /** Voorgestelde titel (uit het bestand of de bestandsnaam). */
  title: string;
  /** De geëxtraheerde tekst; leeg bij widget-, pakket- en cursusbestanden. */
  text: string;
  /** Aantal pagina's (alleen bij pdf). */
  pages?: number;
  widget?: Widget;
  pack?: FolderPack;
  course?: CourseBundle;
  /** Zaken om de leerkracht op te wijzen (gescande pdf, erg lange tekst …). */
  warnings: string[];
}

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/** "hoofdstuk-3.docx" → "hoofdstuk 3" */
export function baseName(fileName: string): string {
  const stripped = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stripped || fileName || 'Bronmateriaal';
}

function extensionOf(fileName: string): string {
  const m = /\.([a-z0-9]+)\s*$/i.exec(fileName.trim());
  return m ? m[1].toLowerCase() : '';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Tekstcodering (OP10, B7) ────────────────────────────────────────────────
// `File.text()` leest altijd als UTF-8. Excel op Windows bewaart een "CSV" en
// Kladblok vaak een .txt in ANSI (windows-1252): dan werd "café" stil
// "caf�". Ook "Unicode-tekst" (UTF-16, met of zonder BOM) komt voor.
// Volgorde: een BOM beslist; dan UTF-16 zonder BOM (veel NUL-bytes op
// even of oneven plaatsen); dan UTF-8 als dat helemaal klopt, of zo goed
// als helemaal (een verdwaald teken of een afgekapt einde mag niet het hele
// bestand laten kantelen); anders windows-1252.

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
  /** Alleen bij UTF-8 met enkele onleesbare bytes: het aantal vervangtekens (�) in de tekst. */
  invalid?: number;
}

/** UTF-16 zonder BOM: tekst met accenten of gewone letters heeft om de andere byte een NUL. */
function sniffUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 4) return null;
  let evenNul = 0;
  let oddNul = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) evenNul++;
    if (bytes[i + 1] === 0) oddNul++;
  }
  const pairs = n / 2;
  if (oddNul >= pairs * 0.3 && evenNul <= pairs * 0.05) return 'utf-16le';
  if (evenNul >= pairs * 0.3 && oddNul <= pairs * 0.05) return 'utf-16be';
  return null;
}

/** Bytes → tekst, met de codering die gebruikt werd. Gooit nooit. */
export function decodeTextBytes(input: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
  }
  const utf16 = sniffUtf16(bytes);
  if (utf16) return { text: new TextDecoder(utf16).decode(bytes), encoding: utf16 };
  try {
    // fatal: bij één ongeldige reeks een fout in plaats van vervangtekens
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    // Niet helemaal geldig. Zijn er veel geldige reeksen (é als twee bytes) en
    // weinig ongeldige, dan is het UTF-8 met een verdwaald of afgekapt teken:
    // één vervangteken is dan beter dan het hele bestand als ANSI te lezen.
    const lenient = new TextDecoder('utf-8').decode(bytes);
    let valid = 0;
    let invalid = 0;
    for (const ch of lenient) {
      const cp = ch.codePointAt(0) as number;
      if (cp === 0xfffd) invalid++;
      else if (cp > 0x7f) valid++;
    }
    if (valid > 0 && valid >= invalid && (invalid <= 3 || invalid * 100 < valid + invalid)) {
      return { text: lenient, encoding: 'utf-8', invalid };
    }
    try {
      return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
    } catch {
      // Een browser zonder windows-1252 (bestaat in de praktijk niet meer):
      // dan toch liever tekst met vervangtekens dan niets.
      return { text: lenient, encoding: 'utf-8', invalid };
    }
  }
}

/** Leest een tekstbestand met de juiste codering (zie decodeTextBytes). */
export async function readTextFile(file: Blob): Promise<DecodedText> {
  if (typeof file.arrayBuffer !== 'function') return { text: await file.text(), encoding: 'utf-8' };
  return decodeTextBytes(await file.arrayBuffer());
}

const ANSI_WARNING =
  'Dit bestand was niet als UTF-8 bewaard en is gelezen als Windows-tekst (ANSI). Kijk letters met ' +
  'accenten en speciale tekens even na.';

const INVALID_WARNING =
  'Enkele tekens in dit bestand konden niet gelezen worden en zijn vervangen door �. Kijk de tekst even na.';

/** Tekstbron uit een bestand, met een waarschuwing als het geen zuivere UTF-8 was. */
function withEncodingNote(src: ExtractedSource, decoded: DecodedText): ExtractedSource {
  if (!src.text) return src;
  if (decoded.encoding === 'windows-1252') src.warnings.push(ANSI_WARNING);
  else if (decoded.invalid) src.warnings.push(INVALID_WARNING);
  return src;
}

/** Tekstbron opbouwen, inclusief de waarschuwingen die erbij horen. */
function textSource(text: string, title: string, origin: string, sourceLabel: string): ExtractedSource {
  const clean = (text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const warnings: string[] = [];
  if (!clean) {
    warnings.push('Er kwam geen tekst uit dit bestand.');
  } else if (clean.length > MAX_COMFORT_CHARS) {
    warnings.push(
      `Erg lang (${clean.length.toLocaleString('nl-BE')} tekens). Knip het in stukken van ongeveer één ` +
        'hoofdstuk: de AI werkt dan nauwkeuriger, en je verbruikt minder.'
    );
  }
  return { kind: 'text', origin, sourceLabel, title, text: clean, warnings };
}

// ── .docx (mammoth, lui geladen) ────────────────────────────────────────────

/**
 * Leest een .docx en geeft markdown terug (koppen, lijsten, tabellen,
 * vet/cursief). mammoth zit in een eigen brok die pas hier geladen wordt —
 * zie lib/mammothDocx.ts.
 */
export async function docxToMarkdown(file: Blob): Promise<string> {
  let docxToHtml: (f: Blob) => Promise<string>;
  try {
    ({ docxToHtml } = await import('./mammothDocx'));
  } catch {
    throw new ImportError(
      'De .docx-lezer kon niet geladen worden. Ben je offline? Herlaad de pagina en probeer opnieuw.'
    );
  }
  let html = '';
  try {
    html = await docxToHtml(file);
  } catch {
    throw new ImportError(
      'Dit .docx-bestand kon niet gelezen worden. Is het beschadigd, of is het eigenlijk een ander formaat ' +
        '(bv. een hernoemde .doc of .odt)?'
    );
  }
  return htmlToMarkdown(html);
}

// ── JSON: widget, vakgroeppakket of cursus ──────────────────────────────────

function knownType(type: string): boolean {
  return WIDGET_TYPES.some((t) => t.id === type);
}

function fromJson(raw: string, origin: string, fallbackTitle: string): ExtractedSource {
  try {
    JSON.parse(raw);
  } catch {
    throw new ImportError(`“${origin}” is geen geldig JSON-bestand.`);
  }

  // Volgorde is belangrijk: een pakket en een cursus zijn óók objecten met
  // widgets erin, dus de meest specifieke herkenning gaat voor.
  const pack = importFolderPack(raw);
  if (pack) {
    if (pack.widgets.length === 0) {
      throw new ImportError(`Het pakket “${origin}” bevat geen bruikbare widgets.`);
    }
    return {
      kind: 'pack',
      origin,
      sourceLabel: `vakgroeppakket · ${plural(pack.widgets.length, 'widget', 'widgets')}`,
      title: pack.meta.naam || fallbackTitle,
      text: '',
      pack,
      warnings: [],
    };
  }

  const bundle = importCourseJson(raw);
  if (bundle) {
    const sections = bundle.course.chapters.reduce((n, ch) => n + ch.sections.length, 0);
    return {
      kind: 'course',
      origin,
      sourceLabel:
        `cursus · ${plural(bundle.course.chapters.length, 'hoofdstuk', 'hoofdstukken')}, ` +
        `${plural(sections, 'sectie', 'secties')}` +
        (bundle.widgets.length ? ` · ${plural(bundle.widgets.length, 'widget', 'widgets')}` : ''),
      title: bundle.course.title || fallbackTitle,
      text: '',
      course: bundle,
      warnings: [],
    };
  }

  const widget = importWidgetJson(raw);
  if (widget) {
    if (!knownType(widget.type)) {
      throw new ImportError(`Onbekend widgettype “${widget.type}” — dit bestand kan niet geïmporteerd worden.`);
    }
    return {
      kind: 'widget',
      origin,
      sourceLabel: 'widgetbestand',
      title: widget.title || fallbackTitle,
      text: '',
      widget,
      warnings: [],
    };
  }

  throw new ImportError(
    `“${origin}” is geen widget-, pakket- of cursusbestand van Boosterz. Exporteer het opnieuw vanuit Boosterz.`
  );
}

// ── De hoofdingang ──────────────────────────────────────────────────────────

/**
 * Leest één bestand uit en zegt wat erin zat. Gooit een `ImportError` met een
 * uitlegbare boodschap als het bestand niet bruikbaar is.
 */
export async function extractFromFile(file: File): Promise<ExtractedSource> {
  const origin = file.name || 'bestand';
  const fallbackTitle = baseName(origin);
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new ImportError(
      `“${origin}” is groter dan ${MAX_FILE_MB} MB. Knip het document in stukken of bewaar het lichter.`
    );
  }
  const ext = extensionOf(origin);
  const mime = (file.type || '').toLowerCase();

  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return textSource(await docxToMarkdown(file), fallbackTitle, origin, 'Word-document (.docx)');
  }
  if (ext === 'doc') {
    throw new ImportError(
      'Het oude .doc-formaat kan niet gelezen worden. Open het in Word en bewaar het opnieuw als .docx.'
    );
  }
  if (ext === 'odt' || ext === 'pages' || ext === 'rtf') {
    throw new ImportError(
      `Bestanden van het type .${ext} worden niet ondersteund. Bewaar het document als .docx, .pdf of platte tekst.`
    );
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    let result: { markdown: string; pages: number; images: number };
    try {
      result = await extractPdfMarkdown(file);
    } catch {
      throw new ImportError(
        `“${origin}” kon niet gelezen worden. Is de pdf beschadigd of met een wachtwoord beveiligd?`
      );
    }
    const src = textSource(
      result.markdown,
      fallbackTitle,
      origin,
      `pdf · ${plural(result.pages, 'pagina', 'pagina’s')}`
    );
    src.pages = result.pages;
    if (result.images > 0) {
      src.warnings.push(
        `${plural(result.images, 'afbeelding', 'afbeeldingen')} in de pdf reizen niet mee in de tekst. Voeg ze na het omzetten toe in de cursuseditor (afbeeldingsblok).`
      );
    }
    if (!result.markdown.trim()) {
      src.warnings = [
        'Geen leesbare tekst gevonden. Dit is wellicht een gescande pdf: foto’s van pagina’s bevatten ' +
          'geen tekstlaag. Gebruik het originele bestand, of typ/plak de tekst hieronder zelf.',
      ];
    }
    return src;
  }
  if (ext === 'json' || mime === 'application/json') {
    return fromJson((await readTextFile(file)).text, origin, fallbackTitle);
  }
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') {
    const decoded = await readTextFile(file);
    return withEncodingNote(textSource(htmlToMarkdown(decoded.text), fallbackTitle, origin, 'webpagina (.html)'), decoded);
  }
  if (ext === 'md' || ext === 'markdown') {
    const decoded = await readTextFile(file);
    return withEncodingNote(textSource(decoded.text, fallbackTitle, origin, 'markdown (.md)'), decoded);
  }
  if (ext === 'txt' || ext === 'csv' || mime.startsWith('text/')) {
    const decoded = await readTextFile(file);
    return withEncodingNote(textSource(decoded.text, fallbackTitle, origin, 'tekstbestand'), decoded);
  }
  throw new ImportError(
    `Van “${origin}” kan geen tekst gelezen worden. Werkt wel: .docx, .pdf, .md, .txt, .html en ` +
      '.json (widget, pakket of cursus uit Boosterz).'
  );
}

/**
 * Geplakte tekst als bron. Ziet het er als JSON van Boosterz uit, dan wordt het
 * ook zo behandeld; anders blijft het gewoon tekst.
 */
export function fromPastedText(text: string, title = 'Geplakte tekst'): ExtractedSource {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new ImportError('Plak eerst wat tekst in het vak.');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return fromJson(trimmed, 'plakbord', title);
    } catch {
      // Geen Boosterz-bestand: dan is het gewoon tekst die toevallig met { begint.
    }
  }
  return textSource(text, title, 'plakbord', 'geplakte tekst');
}

// ── Markdown → cursus (deterministisch, zonder AI) ──────────────────────────

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.indexOf('|', 1) > 0;
}

function isDividerLine(line: string): boolean {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isHeadingLine(line: string): boolean {
  return /^\s*#{1,6}\s+/.test(line);
}

/** Eén tabelrij opsplitsen; `\|` binnen een cel telt niet als scheiding. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s+/g, '')));
}

function tableBlockFrom(lines: string[]): CourseBlock | null {
  let rows = lines.map(splitTableRow);
  let header = false;
  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    header = true;
    rows = [rows[0], ...rows.slice(2)];
  }
  rows = rows.filter((r) => r.some((c) => c !== ''));
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const block = makeBlock('table');
  if (block.type === 'table') {
    block.header = header;
    block.rows = rows.map((r) => {
      const cells = r.slice(0, width);
      while (cells.length < width) cells.push('');
      return cells;
    });
  }
  return block;
}

/**
 * Zet markdown om naar een cursus, volledig voorspelbaar en zonder AI:
 *   `#` → hoofdstuk · `##` → sectie · `###` → tussenkop in de sectie
 *   alinea's en lijsten → tekstblokken (de markdown blijft behouden)
 *   markdown-tabellen → tabelblokken · `---` → scheidingslijn
 * Zonder koppen komt alles in één hoofdstuk met één sectie. Lege secties (en
 * lege hoofdstukken) vallen weg. De titel komt uit de eerste `#`, anders uit
 * de meegegeven naam (doorgaans de bestandsnaam).
 */
export interface MarkdownToCourseOptions {
  /**
   * Welk kopniveau een sectie wordt. Standaard 2 (`##`). Kies 3 als het
   * materiaal genummerde tussentitels heeft (1.1, 1.2 …) onder bredere
   * `##`-titels: dan worden die genummerde titels de secties en komt de
   * bredere titel als tussenkop bovenaan de eerste sectie eronder.
   */
  sectionLevel?: 2 | 3;
}

// ── Run-in-labels → callouts ────────────────────────────────────────────────
// Cursusmateriaal uit Word of pdf begint alinea's vaak met een vet label:
// "Voorbeeld: …", "Oefening: …", "Weetje: …". Dat zijn in de cursusviewer
// precies de callouts; "Uitleg:" is gewoon de lopende tekst.

// Het label mag een toevoeging hebben ("Oefening (invuloefening)", "Voorbeeld 2"):
// we kijken naar het eerste woord en houden het volledige label als titel.
const CALLOUT_LABELS: { re: RegExp; kind: 'info' | 'tip' | 'warn' | 'goal' | 'text'; title: string }[] = [
  { re: /^voorbeeld/i, kind: 'info', title: '' },
  { re: /^(oefening|opdracht|opgave|doe-opdracht|taak)/i, kind: 'goal', title: '' },
  { re: /^(weetje|wist je|extra)/i, kind: 'tip', title: '' },
  { re: /^(let op|opgelet|waarschuwing|veiligheid|pas op)/i, kind: 'warn', title: '' },
  { re: /^(besluit|samenvatting|onthoud|conclusie|kern|definitie)/i, kind: 'info', title: '' },
  { re: /^(uitleg|theoretische uitleg|theorie|toelichting)/i, kind: 'text', title: '' },
];

const RUNIN_RE = /^\*\*\s*([^*:：]{2,32})\s*[:：]\s*(\*\*)?\s*/;

/** Vette markering weghalen die door het label doormidden gesneden is. */
function balanceBold(text: string): string {
  const count = (text.match(/\*\*/g) ?? []).length;
  return count % 2 === 1 ? text.replace('**', '') : text;
}

/**
 * Herkent een alinea die met een vet label begint. Geeft null terug als het
 * geen bekend label is; anders het blok dat het moet worden.
 */
export function runInToBlock(paragraph: string): CourseBlock | null {
  const m = RUNIN_RE.exec(paragraph);
  if (!m) return null;
  const label = m[1].trim();
  const rule = CALLOUT_LABELS.find((r) => r.re.test(label));
  if (!rule) return null;
  const rest = balanceBold(paragraph.slice(m[0].length)).trim();
  if (rule.kind === 'text') {
    const block = makeBlock('text');
    if (block.type === 'text') block.markdown = rest || paragraph;
    return block;
  }
  const block = makeBlock('callout');
  if (block.type === 'callout') {
    block.kind = rule.kind;
    block.title = label.charAt(0).toUpperCase() + label.slice(1);
    block.text = rest;
  }
  return block;
}

// ── Begrippenlijsten → termenblok ───────────────────────────────────────────
// Een sectie "Kernbegrippen" of "Begrippenlijst" bestaat uit alinea's
// "**Term** uitleg" of "**Term**" met de uitleg in de alinea erna. In de
// cursusviewer is dat een termenblok (en later, met één klik, flitskaarten).

const TERMS_TITLE_RE = /^(kern|sleutel)?begrippen(lijst|kader)?$|^woordenlijst$|^begrippen en definities$|^verklarende woordenlijst$/i;
const TERM_LINE_RE = /^\*\*\s*([^*]{1,60}?)\s*[:：]?\s*\*\*\s*[:：]?\s*([\s\S]*)$/;

/** "**Term** uitleg" → [term, uitleg]; "**Term**" alleen → [term, '']; anders null. */
function termPair(block: CourseBlock, titled: boolean): [string, string] | null {
  if (block.type !== 'text' || /^\s*[-*]\s/m.test(block.markdown)) return null;
  const m = TERM_LINE_RE.exec(block.markdown.trim());
  if (!m) return null;
  const term = m[1].trim();
  if (!term || /[.!?]$/.test(term)) return null;
  const uitleg = m[2].replace(/\s+/g, ' ').trim();
  // Buiten een begrippensectie: een vet kopje boven een lange alinea is een
  // tussenkop, geen definitie.
  if (!titled && (term.length > 40 || uitleg.length > 320 || uitleg.split(/(?<=[.!?])\s/).length > 3)) return null;
  return [term, uitleg];
}

function termsBlock(items: { id: string; term: string; uitleg: string }[]): CourseBlock {
  const terms = makeBlock('terms');
  if (terms.type === 'terms') terms.items = items;
  return terms;
}

/**
 * Begrippen → termenblok.
 * - In een sectie "Kernbegrippen"/"Begrippenlijst" worden álle term/uitleg-
 *   paren één termenblok (ook "**Term**" met de uitleg in de alinea erna);
 *   een vet kopje zonder uitleg ("**Thema 1**") blijft gewoon staan.
 * - In elke andere sectie wordt een reeks van minstens drie opeenvolgende
 *   "**Term** uitleg"-alinea's een termenblok op die plek (een begrippenlijst
 *   zonder eigen titel, bv. onderaan de mindmap-pagina).
 */
export function termsFromSection(section: CourseSection): CourseSection {
  const titled = TERMS_TITLE_RE.test(section.title.trim());
  type Item = { id: string; term: string; uitleg: string };
  // Een lopende reeks: de gevonden paren, de oorspronkelijke blokken (om terug
  // te zetten als het er te weinig zijn) en, in een begrippensectie, wat er
  // tussen de termen stond en achteraf achter het termenblok komt.
  type Run = { at: number; items: Item[]; original: CourseBlock[]; others: CourseBlock[] };
  const out: CourseBlock[] = [];
  const st: { run: Run | null; pending: { term: string; block: CourseBlock } | null } = { run: null, pending: null };
  const dropPending = () => { if (st.pending) { out.push(st.pending.block); st.pending = null; } };
  const closeRun = () => {
    dropPending();
    const run = st.run;
    if (!run) return;
    if (run.items.length >= 3) out.splice(run.at, 0, termsBlock(run.items), ...run.others);
    else out.splice(run.at, 0, ...run.original);
    st.run = null;
  };
  const addItem = (term: string, uitleg: string, blocks: CourseBlock[]) => {
    if (!st.run) st.run = { at: out.length, items: [], original: [], others: [] };
    st.run.items.push({ id: uid(), term, uitleg });
    st.run.original.push(...blocks);
    st.pending = null;
  };
  for (const block of section.blocks) {
    const pair = termPair(block, titled);
    if (pair) {
      const [term, uitleg] = pair;
      if (uitleg) { dropPending(); addItem(term, uitleg, [block]); }
      else if (titled) { dropPending(); st.pending = { term, block }; }
      else { closeRun(); out.push(block); }
      continue;
    }
    if (titled && st.pending && block.type === 'text' && !block.markdown.trim().startsWith('**')) {
      addItem(st.pending.term, block.markdown.replace(/\s+/g, ' ').trim(), [st.pending.block, block]);
      continue;
    }
    if (titled && st.run) {
      dropPending();
      st.run.original.push(block);
      st.run.others.push(block);
      continue;
    }
    closeRun();
    out.push(block);
  }
  closeRun();
  return { ...section, blocks: out };
}

export function markdownToCourse(markdown: string, fallbackTitle = 'Nieuwe cursus', opts: MarkdownToCourseOptions = {}): Course {
  const sectionLevel = opts.sectionLevel ?? 2;
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const chapters: CourseChapter[] = [];
  let docTitle = '';
  let chapter: CourseChapter | null = null;
  let section: CourseSection | null = null;
  /**
   * Bij sectionLevel 3 start een `##`-titel voorlopig een sectie met die naam.
   * Volgt er meteen een `###` (nog geen inhoud), dan wordt dát de sectietitel
   * en schuift de `##` op naar een tussenkop bovenaan. Zonder `###` (een
   * hoofdstuk zonder genummerde tussentitels) blijft de `##` gewoon de sectie.
   */
  let groupTitle: string | null = null;
  let sectionFromGroup = false;

  function startChapter(title: string): void {
    chapter = { id: uid(), title: title.trim() || 'Hoofdstuk', emoji: '📖', sections: [] };
    chapters.push(chapter);
    section = null;
  }
  function headingBlock(text: string, level: 2 | 3): CourseBlock {
    const block = makeBlock('heading');
    if (block.type === 'heading') {
      block.text = text;
      block.level = level;
    }
    return block;
  }
  function startSection(title: string): void {
    if (!chapter) startChapter(docTitle || fallbackTitle);
    section = { id: uid(), title: title.trim() || 'Sectie', blocks: [] };
    (chapter as CourseChapter).sections.push(section);
    sectionFromGroup = false;
    emptyCallout = null;
  }
  let emptyCallout: (CourseBlock & { type: 'callout' }) | null = null;
  function addBlock(block: CourseBlock): void {
    if (!section) startSection('Inleiding');
    (section as CourseSection).blocks.push(block);
    emptyCallout = null;
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim().replace(/\s*#+\s*$/, '').trim();
      if (level === 1) {
        if (!docTitle) docTitle = text;
        groupTitle = null;
        startChapter(text);
      } else if (level === 2) {
        startSection(text);
        if (sectionLevel === 3) {
          groupTitle = text;
          sectionFromGroup = true;
        }
      } else if (level === 3 && sectionLevel === 3) {
        const cur = section as CourseSection | null;
        if (cur && sectionFromGroup && cur.blocks.length === 0 && groupTitle) {
          // de ##-titel was maar een groepstitel: de genummerde titel wordt de sectie
          cur.title = text.trim() || cur.title;
          cur.blocks.push(headingBlock(groupTitle, 2));
          sectionFromGroup = false;
        } else {
          startSection(text);
        }
      } else if (text) {
        addBlock(headingBlock(text, 3));
      }
      i++;
      continue;
    }

    if (isTableLine(line)) {
      const raw: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        raw.push(lines[i]);
        i++;
      }
      const block = tableBlockFrom(raw);
      if (block) addBlock(block);
      continue;
    }

    if (isDividerLine(line)) {
      addBlock(makeBlock('divider'));
      i++;
      continue;
    }

    // Alinea of lijst: alles tot een witregel of een nieuw structuuronderdeel.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim() || isHeadingLine(l) || isTableLine(l) || isDividerLine(l)) break;
      para.push(l.replace(/\s+$/, ''));
      i++;
    }
    if (para.length > 0) {
      const joined = para.join('\n');
      const runIn = runInToBlock(joined);
      if (runIn) {
        addBlock(runIn);
        // Een label dat alleen op zijn regel staat ("**Voorbeeld:**") hoort bij
        // de alinea die erop volgt.
        emptyCallout = runIn.type === 'callout' && !runIn.text.trim() ? runIn : null;
      } else if (emptyCallout) {
        emptyCallout.text = joined;
        emptyCallout = null;
      } else {
        const block = makeBlock('text');
        if (block.type === 'text') block.markdown = joined;
        addBlock(block);
      }
    }
  }

  // Lege secties en hoofdstukken dragen niets bij en zouden in de viewer als
  // lege pagina's opduiken.
  for (const ch of chapters) ch.sections = ch.sections.filter((s) => s.blocks.length > 0).map(termsFromSection);
  const kept = chapters.filter((ch) => ch.sections.length > 0);

  const course = createCourse(docTitle || fallbackTitle);
  if (kept.length > 0) course.chapters = kept;
  return course;
}

// ── Meteen opslaan (json-bestanden) ─────────────────────────────────────────
//
// Eerlijk melden (OP2, OP11): elke "bewaard" of "geïmporteerd" volgt uit wat
// saveWidget/saveCourse écht teruggaven. Een volle opslag halverwege een
// pakket geeft "7 van 8 bewaard", nooit "8 geïmporteerd"; een cursusbestand
// vervangt nooit stil eigen werk (zie de regels bij adoptSharedContent).

/** Wat de leerkracht kan doen als de opslag vol is. */
export const STORAGE_FULL_HINT =
  'Maak ruimte (exporteer en verwijder oud materiaal of oude inzendingen) en probeer opnieuw.';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Een lijst uit een bestand opschonen (OP14): geen null of undefined, en
 * alleen elementen van de soort die de widget verwacht. De soort komt uit de
 * standaardwaarde; is die leeg, dan uit de lijst zelf: staat er één object in,
 * dan is het een lijst van objecten (vragen, kaarten …); anders tekst, of
 * getallen als alles een getal is.
 */
function cleanList(input: unknown[], fallback: unknown[]): unknown[] {
  const items = input.filter((x) => x !== null && x !== undefined);
  const sample = fallback.find((x) => x !== null && x !== undefined);
  const objects = sample !== undefined ? isPlainObject(sample) : items.some(isPlainObject);
  if (objects) return items.filter(isPlainObject);
  const prims = items.filter(
    (x): x is string | number | boolean =>
      typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)) || typeof x === 'boolean'
  );
  const numbers =
    sample !== undefined ? typeof sample === 'number' : prims.length > 0 && prims.every((x) => typeof x === 'number');
  if (numbers) return prims.map(Number).filter(Number.isFinite);
  return prims.map(String);
}

/**
 * Config of instellingen uit een bestand in de vorm brengen die de widget
 * verwacht (OP14), sleutel per sleutel volgens de standaardwaarden:
 *  - een lijst verwacht maar iets anders gekregen → de standaardlijst; een
 *    lijst wordt opgeschoond (cleanList);
 *  - een object verwacht → alleen een echt object;
 *  - tekst, getal, ja/nee → alleen dezelfde soort (een getal mag tekst worden
 *    en omgekeerd), anders de standaardwaarde.
 * Sleutels zonder standaardwaarde blijven zoals ze zijn. Dieper kijken we
 * bewust niet: een vraag `{}` blijft een lege vraag.
 */
export function normalizeToDefaults(defaults: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const src = isPlainObject(input) ? input : {};
  const out: Record<string, unknown> = { ...defaults, ...src };
  for (const key of Object.keys(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const def = defaults[key];
    const v = src[key];
    if (def === null || def === undefined) continue;
    if (Array.isArray(def)) {
      if (!Array.isArray(v)) {
        out[key] = def;
      } else {
        const cleaned = cleanList(v, def);
        // Alles weggefilterd uit een niet-lege lijst: dan de standaard (bv. twee lege opties).
        out[key] = cleaned.length === 0 && v.length > 0 ? def : cleaned;
      }
    } else if (isPlainObject(def)) {
      if (!isPlainObject(v)) out[key] = def;
    } else if (typeof def === 'string') {
      if (typeof v !== 'string') out[key] = typeof v === 'number' && Number.isFinite(v) ? String(v) : def;
    } else if (typeof def === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
        out[key] = Number.isFinite(n) ? n : def;
      }
    } else if (typeof def === 'boolean') {
      if (typeof v !== 'boolean') out[key] = def;
    }
  }
  return out;
}

/**
 * Kopie met een nieuwe id en deelcode, in de vorm die editor en speler
 * verwachten. null = onbekend widgettype.
 */
export function prepareImportedWidget(widget: Widget, folderId: string | null): Widget | null {
  const def = WIDGET_TYPES.find((t) => t.id === widget.type);
  if (!def) return null;
  const raw = JSON.parse(JSON.stringify(widget)) as Widget;
  const now = Date.now();
  return {
    ...raw,
    id: uid(),
    code: makeCode(),
    folderId,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Geïmporteerde widget',
    // Ontbrekende of kapotte velden aanvullen, anders crasht de editor of de speler.
    config: normalizeToDefaults(def.defaultConfig() as Record<string, unknown>, raw.config) as unknown as Widget['config'],
    settings: normalizeToDefaults(
      defaultSettings() as unknown as Record<string, unknown>,
      raw.settings
    ) as unknown as Widget['settings'],
    createdAt: now,
    updatedAt: now,
  };
}

type AdoptOutcome = { ok: true; widget: Widget } | { ok: false; reason: 'type' | 'opslag' };

/** Eén widget overnemen: onbekend type en "niet bewaard" (opslag vol) zijn twee verschillende dingen. */
function adopt(widget: Widget, folderId: string | null): AdoptOutcome {
  const copy = prepareImportedWidget(widget, folderId);
  if (!copy) return { ok: false, reason: 'type' };
  return saveWidget(copy) ? { ok: true, widget: copy } : { ok: false, reason: 'opslag' };
}

/** Eén geïmporteerde widget bewaren met een nieuwe id en deelcode. Gooit een ImportError als dat niet lukt. */
export function saveImportedWidget(widget: Widget): Widget {
  const res = adopt(widget, null);
  if (res.ok) return res.widget;
  if (res.reason === 'type') throw new ImportError(`Onbekend widgettype “${widget.type}” — niet geïmporteerd.`);
  throw new ImportError(`De opslag van dit toestel is vol — de widget is niet bewaard. ${STORAGE_FULL_HINT}`);
}

export interface PackImportResult {
  /** Wat bewaard is. */
  widgets: Widget[];
  /** Wat niet bewaard kon worden (opslag vol): de onderdelen uit het pakket, om opnieuw te proberen. */
  failed: Widget[];
  /** Overgeslagen wegens een onbekend widgettype. */
  skipped: number;
  folderId: string | null;
  folderName: string;
  /** false = er werd een nieuwe map gevraagd, maar die kon niet bewaard worden: de widgets staan in de hoofdmap. */
  folderSaved: boolean;
}

/**
 * Widgets uit een vakgroeppakket bewaren, standaard in een nieuwe map.
 * `intoFolder`: in een bestaande map (opnieuw proberen na een volle opslag).
 * Viel het pakket de vorige keer in de hoofdmap omdat de map niet bewaard
 * kon worden (`id: null`), geef dan `folderSaved: false` mee: de melding
 * blijft het dan zeggen.
 * Lukt er niets in een gloednieuwe map, dan blijft er geen lege map achter.
 */
export function saveImportedPack(
  pack: FolderPack,
  opts: { inNewFolder?: boolean; intoFolder?: { id: string | null; name: string; folderSaved?: boolean } } = {}
): PackImportResult {
  let folderName = pack.meta.naam || 'Pakket';
  let folderId: string | null = null;
  let folderSaved = true;
  let newFolder = false;
  if (opts.intoFolder) {
    folderId = opts.intoFolder.id;
    folderName = opts.intoFolder.name;
    folderSaved = opts.intoFolder.folderSaved ?? true;
  } else if (opts.inNewFolder ?? true) {
    const id = uid();
    if (saveFolder({ id, name: folderName, color: '#4f46e5', createdAt: Date.now() })) {
      folderId = id;
      newFolder = true;
    } else {
      folderSaved = false;
    }
  }
  const widgets: Widget[] = [];
  const failed: Widget[] = [];
  let skipped = 0;
  for (const w of pack.widgets) {
    const res = adopt(w, folderId);
    if (res.ok) widgets.push(res.widget);
    else if (res.reason === 'type') skipped++;
    else failed.push(w);
  }
  if (newFolder && folderId && widgets.length === 0) {
    deleteFolder(folderId);
    folderId = null;
  }
  return { widgets, failed, skipped, folderId, folderName, folderSaved };
}

export type ImportTone = 'ok' | 'warn' | 'err';

/**
 * Eerlijke melding na een pakketimport: wat wel en wat niet bewaard is.
 * `alreadySaved`: bij een nieuwe poging, wat de vorige keer al bewaard was.
 */
export function describePackImport(res: PackImportResult, alreadySaved = 0): { text: string; tone: ImportTone } {
  const saved = alreadySaved + res.widgets.length;
  const failed = res.failed.length;
  const total = saved + failed;
  const where = res.folderId
    ? ` in de map “${res.folderName}”`
    : res.folderSaved
      ? ''
      : ` in je hoofdmap (de map “${res.folderName}” kon niet aangemaakt worden)`;
  const skipped =
    res.skipped > 0 ? ` ${plural(res.skipped, 'onderdeel', 'onderdelen')} overgeslagen: onbekend widgettype.` : '';
  if (total === 0) return { text: `Er is geen enkele widget geïmporteerd.${skipped}`, tone: 'err' };
  if (saved === 0) {
    return {
      text: `Geen enkele widget bewaard: de opslag van dit toestel is vol. ${STORAGE_FULL_HINT}${skipped}`,
      tone: 'err',
    };
  }
  if (failed > 0) {
    return {
      text:
        `${saved} van ${total} widgets bewaard${where}; ${failed} niet, want de opslag van dit toestel is vol. ` +
        `${STORAGE_FULL_HINT}${skipped}`,
      tone: 'warn',
    };
  }
  return {
    text: `${plural(saved, 'widget', 'widgets')} geïmporteerd${where}.${skipped}`,
    tone: res.folderSaved ? 'ok' : 'warn',
  };
}

// ── Cursusbestand ───────────────────────────────────────────────────────────

export type CourseImportOutcome =
  | 'nieuw' // stond hier nog niet
  | 'bijgewerkt' // ongewijzigde kopie van een vorige versie, stil bijgewerkt
  | 'vervangen' // eigen versie vervangen, op uitdrukkelijke keuze
  | 'gehouden' // eigen versie gehouden, op uitdrukkelijke keuze
  | 'kopie' // als kopie ernaast bewaard
  | 'ongewijzigd' // stond al zo op dit toestel
  | 'mislukt'; // niet bewaard (opslag vol)

export interface CourseImportResult {
  outcome: CourseImportOutcome;
  /** Id van de cursus op dit toestel (anders na "als kopie bewaren"); null als ze er niet staat. */
  courseId: string | null;
  /** Titel uit het bestand. */
  title: string;
  /** Titel op dit toestel (bv. met "(kopie)"). */
  localTitle: string;
  /** false = niet alles kon bewaard worden (opslag vol). */
  ok: boolean;
  /** Aantal meegereisde widgets in het bestand. */
  widgets: number;
  /** Ruwe tellingen van de adoptie, over cursus en widgets samen (zie AdoptResult). De melding gebruikt ze niet. */
  added: number;
  updated: number;
  copied: number;
  pdfs: { restored: number; failed: number };
  // Wat er echt veranderde, afgeleid uit de opslag vóór en na (B2): de melding
  // zegt wat er staat, niet wat de tellingen hierboven suggereren.
  /** De inhoud van de cursus (hoofdstukken, titel …) of haar versie is anders dan vooraf. */
  courseChanged: boolean;
  /** Hoe de versie van de cursus veranderde (alleen als courseChanged). */
  courseChange: 'geen' | 'nieuwer' | 'gelijk' | 'ouder';
  /** Hoofdstukken die er bij een bestaande cursus bijkwamen. */
  chaptersAdded: number;
  /** Widgets die hier ontbraken en nu bewaard staan. */
  widgetsAdded: number;
  /** Widgets die als kopie ernaast staan. */
  widgetsCopied: number;
  /** Titels van widgets die vervangen zijn door de versie uit het bestand. */
  replaced: string[];
  /** Widgets die in een mislukte poging bewaard werden en weer weggehaald zijn (B3). */
  widgetsRemoved: number;
}

/** Dezelfde gegevens met gesorteerde sleutels, zodat de volgorde in een bestand niet uitmaakt. */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  }
  return v;
}

/**
 * Vergelijkbare vorm van een cursus of widget: gesorteerde sleutels, en media
 * als verwijzing zoals ze bewaard staan (een blob:-URL lokaal en dezelfde
 * afbeelding als data-URL in een bestand tellen dan als gelijk).
 */
function fingerprint(v: unknown): string {
  return stringifyWithMedia(sortKeys(v));
}

/** Zelfde inhoud, zonder tijdstempels? */
function sameWithoutStamps(a: Course, b: Course): boolean {
  return fingerprint({ ...a, createdAt: 0, updatedAt: 0 }) === fingerprint({ ...b, createdAt: 0, updatedAt: 0 });
}

/** Pdf's waar een cursus op dit toestel naar verwijst: pdf-blokken en de widgets die ze toont. */
function localPdfIds(course: Course): Set<string> {
  const ids = new Set(referencedPdfIds(course));
  for (const wid of referencedWidgetIds(course)) {
    const src = (getWidget(wid)?.config as unknown as { source?: unknown } | undefined)?.source;
    const pid = isPlainObject(src) ? src.pdfId : undefined;
    if (typeof pid === 'string' && pid) ids.add(pid);
  }
  return ids;
}

/**
 * Wat de leerkracht eerst moet beslissen: staat er al een andere versie van
 * deze cursus of van een meegereisde widget als eigen werk? Ook oudere
 * versies: een bestand terugzetten (back-up) is een bewuste keuze, en dan mag
 * er niet stil niets gebeuren. Zelfde regels als op de cursuspagina.
 */
export function findCourseImportConflicts(bundle: CourseBundle): Promise<SharedConflict[]> {
  return findSharedConflicts([bundle.course], bundle.widgets, { includeOlder: true });
}

/**
 * Een cursusbestand overnemen (met de widgets en pdf's die erin meereisden),
 * na de keuze van de leerkracht als er conflicten waren. Zegt eerlijk wat er
 * gebeurde; zie describeCourseImport.
 *
 * De uitkomst volgt uit wat er echt veranderde (cursus én widgets, vergeleken
 * vóór en na), niet uit een gewijzigde `updatedAt` alleen: een bestand met
 * dezelfde versie kan een gedeeltelijke kopie aanvullen, en een vervangen
 * widget laat de cursus soms ongemoeid (B2, H1-N1).
 *
 * Lukt de cursus niet te bewaren (opslag vol), dan worden de widgets die in
 * deze poging nieuw bewaard werden (nieuw of als kopie) weer weggehaald: een
 * nieuwe poging begint zo schoon en maakt geen tweede "(kopie)" (B3). Widgets
 * die vervangen werden, blijven vervangen; de melding noemt ze.
 */
export async function saveImportedCourse(
  bundle: CourseBundle,
  keuze?: { choice: SharedChoice; conflicts: SharedConflict[] }
): Promise<CourseImportResult> {
  const id = bundle.course.id;
  const before = getCourse(id);
  const courseBefore = before ? fingerprint(before) : null;
  const bundleIds = new Set(bundle.widgets.map((w) => w.id));
  const widgetsBefore = new Map(
    getWidgets().filter((w) => bundleIds.has(w.id)).map((w) => [w.id, fingerprint(w)] as const)
  );
  const res = adoptSharedCourse(
    bundle.course,
    bundle.widgets,
    keuze ? { conflicts: { choice: keuze.choice, keys: keuze.conflicts.map(conflictKey) } } : {}
  );
  const localId = res.courseIds.get(id) ?? id;
  const after = getCourse(localId);

  // Wat veranderde er aan de widgets?
  const widgetsNow = new Map(getWidgets().map((w) => [w.id, w] as const));
  const fresh: string[] = []; // nieuw in deze poging (nieuw of kopie): terug te draaien
  const replaced: string[] = [];
  let widgetsAdded = 0;
  let widgetsCopied = 0;
  for (const wid of bundleIds) {
    const lid = res.widgetIds.get(wid) ?? wid;
    const now = widgetsNow.get(lid);
    if (!now) continue;
    if (!widgetsBefore.has(lid)) {
      fresh.push(lid);
      if (lid === wid) widgetsAdded++;
      else widgetsCopied++;
    } else if (fingerprint(now) !== widgetsBefore.get(lid)) {
      replaced.push(now.title);
    }
  }

  // Wat veranderde er aan de cursus, en lukte het bewaren ervan?
  const courseChanged = Boolean(before && after && localId === id && fingerprint(after) !== courseBefore);
  const courseWritten = Boolean(after) && (!before || localId !== id || courseChanged);
  const choice = keuze?.choice;
  const inList = Boolean(keuze?.conflicts.some((c) => c.kind === 'course' && c.id === id));
  // Moest de cursus overschreven worden? Een keuze geldt alleen voor wat in de
  // vraag stond; de rest (een zuivere kopie, een ander bestand) volgt de gewone regels.
  const meantToWrite = inList ? choice === 'bijwerken' : Boolean(before && !sameWithoutStamps(before, bundle.course));
  // Elk onderdeel (cursus en elke widget) telt in precies één van de tellingen
  // van de adoptie, of mislukte. Mislukte widgets die hier ontbreken zijn
  // zichtbaar; blijft er daarna nog een mislukking over, dan kan dat de cursus zijn.
  const failures = bundleIds.size + 1 - (res.added + res.updated + res.copied + res.kept);
  const widgetsMissing = [...bundleIds].filter((wid) => !widgetsNow.has(res.widgetIds.get(wid) ?? wid)).length;
  const courseFailed = !after || (!courseWritten && failures > widgetsMissing && meantToWrite);

  let widgetsRemoved = 0;
  if (courseFailed) {
    for (const lid of fresh) {
      deleteWidget(lid);
      widgetsRemoved++;
    }
    widgetsAdded = 0;
    widgetsCopied = 0;
  }

  let outcome: CourseImportOutcome;
  if (courseFailed) outcome = 'mislukt';
  else if (localId !== id) outcome = 'kopie';
  else if (!before) outcome = 'nieuw';
  else if (courseChanged) outcome = choice === 'bijwerken' ? 'vervangen' : 'bijgewerkt';
  else if (choice === 'houden') outcome = 'gehouden';
  else if (replaced.length + widgetsAdded + widgetsCopied > 0) outcome = 'bijgewerkt';
  else outcome = 'ongewijzigd';

  let courseChange: CourseImportResult['courseChange'] = 'geen';
  let chaptersAdded = 0;
  if (courseChanged && before && after) {
    courseChange = after.updatedAt > before.updatedAt ? 'nieuwer' : after.updatedAt === before.updatedAt ? 'gelijk' : 'ouder';
    const had = new Set(before.chapters.map((ch) => ch.id));
    chaptersAdded = after.chapters.filter((ch) => !had.has(ch.id)).length;
  }

  // Pdf's pas ná de keuze terugzetten, en alleen die waar wat hier nu staat
  // naar verwijst (G3): niet bewaard of bewust niet overgenomen laat geen
  // wees-pdf achter in IndexedDB. Een pdf die hier al staat, blijft ongemoeid.
  const needed = after && !courseFailed ? localPdfIds(after) : new Set<string>();
  const toRestore = (bundle.pdfs ?? []).filter((p) => needed.has(p.id));
  const pdfs = toRestore.length > 0 ? await restoreCoursePdfs(toRestore) : { restored: 0, failed: 0 };
  return {
    outcome,
    courseId: after ? localId : null,
    title: bundle.course.title,
    localTitle: after?.title ?? bundle.course.title,
    ok: res.ok && !courseFailed,
    widgets: bundle.widgets.length,
    added: res.added,
    updated: res.updated,
    copied: res.copied,
    pdfs,
    courseChanged,
    courseChange,
    chaptersAdded,
    widgetsAdded,
    widgetsCopied,
    replaced,
    widgetsRemoved,
  };
}

/** "1 widget (“Quiz”) is" / "3 widgets zijn": het onderwerp van een zin over vervangen widgets. */
function replacedSubject(r: CourseImportResult): string {
  const n = r.replaced.length;
  return n === 1 ? `1 widget (“${r.replaced[0]}”) is` : `${n} widgets zijn`;
}

/** Wat er met de widgets gebeurde, in stukjes voor één zin ("1 widget … is vervangen …"). Leeg: niets. */
function widgetChanges(r: CourseImportResult): string[] {
  const parts: string[] = [];
  if (r.replaced.length > 0) parts.push(`${replacedSubject(r)} vervangen door de versie uit het bestand`);
  // Bij "nieuw" zegt de zin zelf al "met N widgets".
  if (r.widgetsAdded > 0 && r.outcome !== 'nieuw') {
    parts.push(`${plural(r.widgetsAdded, 'widget kwam', 'widgets kwamen')} erbij`);
  }
  if (r.widgetsCopied > 0) parts.push(`${plural(r.widgetsCopied, 'widget staat', 'widgets staan')} ernaast als kopie`);
  return parts;
}

/** Eerlijke melding na een cursusimport, met het label voor de kaart. */
export function describeCourseImport(r: CourseImportResult): { text: string; tone: ImportTone; badge: string } {
  const t = `“${r.title}”`;
  let text: string;
  let badge = 'geïmporteerd';
  const widgetParts = widgetChanges(r);
  // De cursus bleef zoals ze was; de zin gaat dan over de widgets.
  let widgetsAlone = false;
  switch (r.outcome) {
    case 'mislukt': {
      let msg = `De cursus ${t} is niet bewaard: de opslag van dit toestel is vol.`;
      if (r.courseId) msg += ' Je bestaande versie van de cursus bleef zoals ze was.';
      if (r.replaced.length > 0) {
        msg += ` ${replacedSubject(r)} wel al vervangen door de versie uit het bestand.`;
      }
      if (r.widgetsRemoved > 0) {
        msg += ` Wat tijdens deze poging al bewaard was (${plural(r.widgetsRemoved, 'widget', 'widgets')}), is weer weggehaald.`;
      }
      return { text: `${msg} ${STORAGE_FULL_HINT}`, tone: 'err', badge: 'niet bewaard' };
    }
    case 'nieuw':
      text = `Cursus ${t} staat nu bij je cursussen${r.widgets ? ` (met ${plural(r.widgets, 'widget', 'widgets')})` : ''}.`;
      break;
    case 'bijgewerkt':
      badge = 'bijgewerkt';
      if (!r.courseChanged) {
        widgetsAlone = true;
        text = `De cursus ${t} bleef gelijk; ${widgetParts.join(' en ')}.`;
      } else if (r.courseChange === 'nieuwer') {
        text = `Cursus ${t} is bijgewerkt naar de nieuwere versie uit het bestand.`;
      } else {
        // Zelfde versie, meer inhoud: een gedeeltelijke kopie die aangevuld werd (H1-N1).
        text = r.chaptersAdded > 0
          ? `Cursus ${t} is aangevuld met ${plural(r.chaptersAdded, 'hoofdstuk', 'hoofdstukken')} uit het bestand.`
          : `Cursus ${t} is bijgewerkt met de inhoud uit het bestand.`;
      }
      break;
    case 'vervangen':
      text = `Je cursus ${t} is vervangen door de versie uit het bestand.`;
      break;
    case 'kopie':
      text = `Er stond al een versie van ${t}; de import staat ernaast als kopie: “${r.localTitle}”.`;
      break;
    case 'gehouden':
      badge = r.replaced.length > 0 ? 'cursus gehouden' : 'niets vervangen';
      text = `Je eigen versie “${r.localTitle}” bleef staan; de versie uit het bestand is niet overgenomen.`;
      break;
    default:
      badge = 'niets veranderd';
      text = `Cursus ${t} stond al zo op dit toestel; er is niets veranderd.`;
  }
  if (!widgetsAlone && widgetParts.length > 0) text += ` Ook ${widgetParts.join(' en ')}.`;
  if (r.pdfs.restored > 0) text += ` ${plural(r.pdfs.restored, 'pdf', 'pdf’s')} teruggezet.`;
  if (!r.ok || r.pdfs.failed > 0) {
    const pdfNote = r.pdfs.failed > 0 ? ` (${plural(r.pdfs.failed, 'pdf', 'pdf’s')} niet teruggezet)` : '';
    return {
      text: `${text} Let op: niet alles kon bewaard worden${pdfNote}, want de opslag van dit toestel is vol. ${STORAGE_FULL_HINT}`,
      tone: 'warn',
      badge: 'deels bewaard',
    };
  }
  return { text, tone: 'ok', badge };
}

// ── Cursus uit tekst bewaren (zonder AI) ────────────────────────────────────

function withoutWidgetBlocks(course: Course, ids: Set<string>): Course {
  return {
    ...course,
    chapters: course.chapters.map((ch) => ({
      ...ch,
      sections: ch.sections.map((se) => ({
        ...se,
        blocks: se.blocks.filter((b) => !(b.type === 'widget' && ids.has(b.widgetId))),
      })),
    })),
  };
}

/**
 * Cursus en afgeleide oefeningen bewaren. Eerst de oefeningen; wat niet
 * bewaard kon worden, verdwijnt uit de cursus (anders een blok dat nergens
 * naar wijst). Lukt de cursus zelf niet, dan worden de net bewaarde
 * oefeningen weer verwijderd: geen losse oefeningen zonder hun cursus.
 */
export function saveCourseWithWidgets(
  course: Course,
  widgets: Widget[]
): { saved: boolean; course: Course; widgetsSaved: number; widgetsFailed: number } {
  const savedIds: string[] = [];
  const failedIds = new Set<string>();
  for (const w of widgets) {
    if (saveWidget(w)) savedIds.push(w.id);
    else failedIds.add(w.id);
  }
  const final = failedIds.size > 0 ? withoutWidgetBlocks(course, failedIds) : course;
  if (!saveCourse(final)) {
    for (const id of savedIds) deleteWidget(id);
    return { saved: false, course: final, widgetsSaved: 0, widgetsFailed: widgets.length };
  }
  return { saved: true, course: final, widgetsSaved: savedIds.length, widgetsFailed: failedIds.size };
}

// ── Meerdere bronnen → één cursus ───────────────────────────────────────────

/**
 * Elke bron wordt een hoofdstuk: begint de tekst zelf al met een `#`-titel
 * (zoals een pdf "Hoofdstuk 3: Materie"), dan is dát de hoofdstuktitel;
 * anders wordt de bronnaam het hoofdstuk. De cursustitel geef je apart op.
 */
export function mergeSourcesToCourse(
  sources: { title: string; text: string }[],
  courseTitle: string,
  opts: MarkdownToCourseOptions = {}
): Course {
  const parts = sources
    .map((src) => {
      const text = (src.text ?? '').replace(/\r\n?/g, '\n').trim();
      if (!text) return '';
      const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
      const startsWithChapter = /^\s*#\s+\S/.test(firstLine);
      return startsWithChapter ? text : `# ${src.title.trim() || 'Hoofdstuk'}\n\n${text}`;
    })
    .filter(Boolean);
  const course = markdownToCourse(parts.join('\n\n'), courseTitle, opts);
  course.title = courseTitle.trim() || course.title;
  return course;
}
