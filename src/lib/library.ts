// ── Bibliotheek: widgets vindbaar en gegroepeerd ────────────────────────────
//
// Pure functies achter de widgetpagina (/widgets) en de installatie van de
// voorbeeldcursus. Niets hier leest of schrijft opslag: de pagina geeft de
// widgets, cursussen en mappen mee, en krijgt een weergave terug.
//
// Een widget weet niet in welke cursus ze zit. Dat lezen we af uit de
// widgetblokken van de cursussen (courseTypes.ts: blok 'widget' met widgetId).
//
// De samenvouwregel voor "Alle widgets" (uitlegbaar in één zin):
//   Een oefening uit een cursus met minstens 3 oefeningen staat achter één
//   regel van die cursus, tenzij je ze ook in een eigen map zette.
// De voorbeeldmap telt niet als eigen map: die maakt Boosterz zelf aan.
// Zoeken toont altijd elke treffer apart, ook uit een samengevouwen cursus.

import type { Course } from './courseTypes';
import type { Folder, Widget, WidgetCategory, WidgetTypeId } from './types';
import { CATEGORIES, WIDGET_TYPES, type WidgetTypeDef } from '../widgets/registry';

// ── Voorbeeldmateriaal ──────────────────────────────────────────────────────

/** Vaste id van de voorbeeldcursus natuurwetenschappen (public/voorbeelden). */
export const EXAMPLE_COURSE_ID = 'nw-voorbeeld-1e-graad';
/** Vaste id van de map waarin de voorbeeldcursus haar oefeningen zet. */
export const EXAMPLE_FOLDER_ID = 'nw-voorbeeld-1e-graad-map';
export const EXAMPLE_FOLDER_NAME = 'Voorbeeld: natuurwetenschappen';

/**
 * Titels van de widgets die seedIfEmpty() (lib/seed.ts) bij het eerste bezoek
 * plaatst. Seedwidgets krijgen een willekeurige id, dus de titel is het enige
 * kenmerk. library.test.ts draait seedIfEmpty en bewaakt dat deze lijst
 * gelijk loopt met de seed.
 */
export const SEED_WIDGET_TITLES: readonly string[] = [
  'Voorbeeld: quiz over België',
  'Voorbeeld: Frans — les animaux',
  'Voorbeeld: kruiswoord natuur',
  'Voorbeeld: woordzoeker weer',
  'Voorbeeld: memory hoofdsteden',
  'Voorbeeld: maaltafels 6, 7 en 8',
  'Voorbeeld: wie is aan de beurt?',
  'Sjabloon: 3-2-1 exit-ticket',
  'Voorbeeld: tijdlijn wereldoorlogen',
  'Voorbeeld: begrijpend lezen — de honingbij',
  'Voorbeeld: grafiek — huisdieren in de klas',
  'Voorbeeld: mindmap — de waterkringloop',
  'Voorbeeld: alle nieuwe vraagtypes',
];
const SEED_TITLE_SET = new Set(SEED_WIDGET_TITLES);

/**
 * Voorbeeldmateriaal: een seedwidget (exacte titel), een oefening van de
 * voorbeeldcursus, of een widget in de voorbeeldmap. Een kopie ("… (kopie)")
 * of een hernoemde seedwidget telt als eigen werk.
 */
export function isExampleWidget(w: Widget, exampleCourseWidgetIds: ReadonlySet<string>): boolean {
  return SEED_TITLE_SET.has(w.title) || exampleCourseWidgetIds.has(w.id) || w.folderId === EXAMPLE_FOLDER_ID;
}

// ── Soorten ─────────────────────────────────────────────────────────────────

const DEF_BY_ID = new Map<string, WidgetTypeDef>(WIDGET_TYPES.map((d) => [d.id, d]));
const TYPE_ORDER = new Map<string, number>(WIDGET_TYPES.map((d, i) => [d.id, i]));

/** Soortdefinitie zonder te crashen op een onbekend type (oude of geknutselde data). */
export function typeDefOf(type: string): WidgetTypeDef | undefined {
  return DEF_BY_ID.get(type);
}

/** Korte naam van een categorie voor een filterchip: "Toetsen & opdrachten" → "Toetsen". */
export function shortCategoryName(name: string): string {
  return name.split(' & ')[0].trim();
}

export const CATEGORY_CHIPS: { id: WidgetCategory; label: string }[] = CATEGORIES.map((c) => ({
  id: c.id,
  label: shortCategoryName(c.name),
}));

/** Meervoud per soort, voor tellingen ("96 werkbladen"). */
const PLURAL: Record<WidgetTypeId, string> = {
  quiz: 'quizzen',
  worksheet: 'werkbladen',
  exitticket: 'exit-tickets',
  dictation: 'dictees',
  poll: 'peilingen',
  flashcards: 'sets flitskaarten',
  crossword: 'kruiswoordraadsels',
  wordsearch: 'woordzoekers',
  memory: 'memoryspellen',
  hangman: 'galgjes',
  pairs: 'koppelspellen',
  scramble: 'sets husselwoorden',
  bingo: "bingo's",
  timeline: 'tijdlijnen',
  hotspot: 'hotspot-afbeeldingen',
  whiteboard: 'whiteboards',
  arithmetic: 'rekenoefeningen',
  splitworksheet: 'gesplitste werkbladen',
  videoquiz: 'video-quizzen',
  splitwhiteboard: 'gesplitste whiteboards',
  jigsaw: 'legpuzzels',
  spotdifference: 'spellen Zoek de verschillen',
  carousel: 'fotocarrousels',
  imageviewer: 'afbeeldingsviewers',
  beforeafter: 'voor/na-vergelijkers',
  framesequence: 'framesequenties',
  tiptiles: 'sets tip-tegels',
  randomimages: 'sets willekeurige afbeeldingen',
  mediaplayer: 'videospelers',
  activeplot: 'actieve plots',
  chart: 'grafieken',
  webquest: 'webquests',
  mindmap: 'mindmaps',
  planner: 'planners',
  piano: "piano's",
  spinner: 'raderen van fortuin',
  timer: 'klastimers',
  checklist: 'checklists',
  bordles: 'bordlessen',
};

/** Enkelvoud waar de soortnaam zelf een meervoud of een zin is. */
const SINGULAR: Partial<Record<WidgetTypeId, string>> = {
  flashcards: 'set flitskaarten',
  scramble: 'set husselwoorden',
  tiptiles: 'set tip-tegels',
  randomimages: 'set willekeurige afbeeldingen',
  spotdifference: 'spel Zoek de verschillen',
};

/** "1 quiz", "57 quizzen", "14 sets flitskaarten". Vertrekt van getTypeDef(type).name. */
export function typeCountLabel(type: string, n: number): string {
  const def = typeDefOf(type);
  if (!def) return `${n} × ${type}`;
  if (n === 1) return `1 ${SINGULAR[def.id] ?? def.name.toLowerCase()}`;
  return `${n} ${PLURAL[def.id] ?? def.name.toLowerCase()}`;
}

/** Aantal widgets per soort, grootste eerst; bij gelijke stand in de volgorde van de registry. */
export function countByType(widgets: readonly Pick<Widget, 'type'>[]): { type: WidgetTypeId; count: number }[] {
  const m = new Map<WidgetTypeId, number>();
  for (const w of widgets) m.set(w.type, (m.get(w.type) ?? 0) + 1);
  return [...m.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || (TYPE_ORDER.get(a.type) ?? 999) - (TYPE_ORDER.get(b.type) ?? 999));
}

/** Nederlandse opsomming: "a", "a en b", "a, b en c". */
export function joinNl(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}`;
}

/** "96 werkbladen, 57 quizzen, 14 exit-tickets en meer": de grootste soorten, kort. */
export function typeSummary(widgets: readonly Pick<Widget, 'type'>[], max = 3): string {
  const counts = countByType(widgets);
  const labels = counts.slice(0, max).map((c) => typeCountLabel(c.type, c.count));
  if (counts.length > max) return `${labels.join(', ')} en meer`;
  return joinNl(labels);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** De melding na het laden van de voorbeeldcursus. */
export function exampleInstallMessage(opts: { chapters: number; widgets: readonly Pick<Widget, 'type'>[]; reinstalled: boolean }): string {
  const head = opts.reinstalled ? 'Voorbeeldcursus opnieuw geladen' : 'Voorbeeldcursus geladen';
  const parts = [plural(opts.chapters, 'hoofdstuk', 'hoofdstukken')];
  if (opts.widgets.length > 0) {
    parts.push(`${plural(opts.widgets.length, 'oefening', 'oefeningen')} (${typeSummary(opts.widgets)})`);
  }
  return `${head}: ${parts.join(', ')}`;
}

// ── Welke widgets zitten in welke cursus ────────────────────────────────────

/** "Hoofdstuk 3: Materie" blijft staan; een kale titel krijgt zijn nummer erbij. */
export function chapterLabel(title: string, index: number): string {
  const t = title.trim();
  if (/^hoofdstuk\b/i.test(t)) return t;
  return t ? `Hoofdstuk ${index + 1}: ${t}` : `Hoofdstuk ${index + 1}`;
}

export interface CourseUse {
  courseId: string;
  courseTitle: string;
  /** Hoofdstukken (label) waarin de widget voorkomt, in cursusvolgorde, zonder dubbels. */
  chapters: string[];
}

/** Per widget-id: de cursussen (en hoofdstukken) die haar gebruiken, in cursusvolgorde. */
export function courseUsage(courses: readonly Course[]): Map<string, CourseUse[]> {
  const out = new Map<string, CourseUse[]>();
  for (const course of courses) {
    course.chapters.forEach((ch, ci) => {
      const label = chapterLabel(ch.title, ci);
      for (const sec of ch.sections) {
        for (const b of sec.blocks) {
          if (b.type !== 'widget' || !b.widgetId) continue;
          const uses = out.get(b.widgetId) ?? [];
          let use = uses.find((u) => u.courseId === course.id);
          if (!use) {
            use = { courseId: course.id, courseTitle: course.title, chapters: [] };
            uses.push(use);
            out.set(b.widgetId, uses);
          }
          if (!use.chapters.includes(label)) use.chapters.push(label);
        }
      }
    });
  }
  return out;
}

/** Widget-ids van één cursus (voor het herkennen van de voorbeeldcursus). */
export function courseWidgetIds(course: Course | undefined): Set<string> {
  const ids = new Set<string>();
  if (!course) return ids;
  for (const ch of course.chapters) {
    for (const sec of ch.sections) {
      for (const b of sec.blocks) if (b.type === 'widget' && b.widgetId) ids.add(b.widgetId);
    }
  }
  return ids;
}

/**
 * Waarschuwing bij het verwijderen van een widget die in een cursus zit, of
 * null als geen enkele cursus ze gebruikt.
 */
export function deleteWarning(uses: readonly CourseUse[] | undefined): string | null {
  if (!uses || uses.length === 0) return null;
  const where = (u: CourseUse) => `“${u.courseTitle}”${u.chapters.length ? ` (${joinNl(u.chapters)})` : ''}`;
  if (uses.length === 1) {
    return `Deze oefening zit in ${where(uses[0])}. Verwijder je ze, dan toont die cursus een lege plek.`;
  }
  return `Deze oefening zit in ${uses.length} cursussen: ${joinNl(uses.map(where))}. Verwijder je ze, dan tonen die cursussen een lege plek.`;
}

// ── Zoeken ──────────────────────────────────────────────────────────────────

/** Kleine letters en zonder accenten: "België" vindt je ook met "belgie". */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Zoekt op titel, soort en code. Elk woord van de zoekterm moet ergens
 * voorkomen; een code vind je met de volledige code of de eerste 3 tekens.
 */
export function matchesQuery(w: Pick<Widget, 'title' | 'type' | 'code'>, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const title = normalizeText(w.title);
  const kind = normalizeText(typeDefOf(w.type)?.name ?? w.type);
  const code = normalizeText(w.code ?? '');
  return words.every((q) => title.includes(q) || kind.includes(q) || code === q || (q.length >= 3 && code.startsWith(q)));
}

export interface LibraryFilter {
  query: string;
  category: WidgetCategory | null;
}

export function matchesFilter(w: Widget, f: LibraryFilter): boolean {
  if (f.category && typeDefOf(w.type)?.category !== f.category) return false;
  return matchesQuery(w, f.query);
}

// ── Index en weergave ───────────────────────────────────────────────────────

/** Vanaf zoveel oefeningen vouwt een cursus samen tot één regel in "Alle widgets". */
export const MIN_GROUP_SIZE = 3;

export interface CourseGroup {
  courseId: string;
  title: string;
  /** Per hoofdstuk de widgets die er voor het eerst in deze cursus voorkomen. */
  chapters: { label: string; widgetIds: string[] }[];
  /** Alle bestaande widgets van de cursus, zonder dubbels, in cursusvolgorde. */
  widgetIds: string[];
}

export interface LibraryIndex {
  /** Alle widgets, laatst bewerkt eerst. */
  widgets: Widget[];
  byId: Map<string, Widget>;
  folders: Folder[];
  folderIds: Set<string>;
  /** Cursussen met minstens één bestaande widget, in opslagvolgorde. */
  groups: CourseGroup[];
  usage: Map<string, CourseUse[]>;
  /** Cursussen die in "Alle widgets" samenvouwen (≥ MIN_GROUP_SIZE oefeningen). */
  bundled: Set<string>;
  exampleIds: Set<string>;
}

export function buildLibraryIndex(widgets: readonly Widget[], courses: readonly Course[], folders: readonly Folder[]): LibraryIndex {
  const sorted = [...widgets].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const byId = new Map(sorted.map((w) => [w.id, w]));
  const allUsage = courseUsage(courses);
  // Alleen bestaande widgets: een blok naar een verwijderde widget telt nergens mee.
  const usage = new Map([...allUsage].filter(([id]) => byId.has(id)));

  const groups: CourseGroup[] = [];
  for (const course of courses) {
    const seen = new Set<string>();
    const chapters = course.chapters.map((ch, ci) => {
      const ids: string[] = [];
      for (const sec of ch.sections) {
        for (const b of sec.blocks) {
          if (b.type !== 'widget' || !b.widgetId || seen.has(b.widgetId) || !byId.has(b.widgetId)) continue;
          seen.add(b.widgetId);
          ids.push(b.widgetId);
        }
      }
      return { label: chapterLabel(ch.title, ci), widgetIds: ids };
    }).filter((ch) => ch.widgetIds.length > 0);
    const widgetIds = chapters.flatMap((ch) => ch.widgetIds);
    if (widgetIds.length > 0) groups.push({ courseId: course.id, title: course.title, chapters, widgetIds });
  }

  const exampleCourseIds = courseWidgetIds(courses.find((c) => c.id === EXAMPLE_COURSE_ID));
  return {
    widgets: sorted,
    byId,
    folders: [...folders],
    folderIds: new Set(folders.map((f) => f.id)),
    groups,
    usage,
    bundled: new Set(groups.filter((g) => g.widgetIds.length >= MIN_GROUP_SIZE).map((g) => g.courseId)),
    exampleIds: new Set(sorted.filter((w) => isExampleWidget(w, exampleCourseIds)).map((w) => w.id)),
  };
}

/** De map van een widget, of null als ze geen (bestaande) map heeft. */
export function folderOf(index: Pick<LibraryIndex, 'folderIds'>, w: Widget): string | null {
  return w.folderId && index.folderIds.has(w.folderId) ? w.folderId : null;
}

/**
 * Staat deze widget los in "Alle widgets"? Ja, tenzij ze in een samengevouwen
 * cursus zit en niet in een eigen map (de voorbeeldmap telt niet als eigen map).
 */
export function isLoose(index: LibraryIndex, w: Widget): boolean {
  const inBundled = (index.usage.get(w.id) ?? []).some((u) => index.bundled.has(u.courseId));
  if (!inBundled) return true;
  const folder = folderOf(index, w);
  return folder !== null && folder !== EXAMPLE_FOLDER_ID;
}

export type LibraryScope =
  | { kind: 'all' }
  | { kind: 'examples' }
  | { kind: 'courses' }
  | { kind: 'course'; id: string }
  | { kind: 'folders' }
  | { kind: 'folder'; id: string }
  | { kind: 'nofolder' };

/** Leest het filter uit de URL (?toon=…, ?cursus=…, ?map=…). Onbekend → alle widgets. */
export function parseScope(params: URLSearchParams, index: Pick<LibraryIndex, 'groups' | 'folderIds'>): LibraryScope {
  const cursus = params.get('cursus');
  if (cursus && index.groups.some((g) => g.courseId === cursus)) return { kind: 'course', id: cursus };
  const map = params.get('map');
  if (map && index.folderIds.has(map)) return { kind: 'folder', id: map };
  switch (params.get('toon')) {
    case 'voorbeelden': return { kind: 'examples' };
    case 'cursussen': return { kind: 'courses' };
    case 'mappen': return { kind: 'folders' };
    case 'zondermap': return { kind: 'nofolder' };
    default: return { kind: 'all' };
  }
}

/** Querystring voor een filter (zonder zoekterm of soort: die blijven los staan). */
export function scopeSearch(scope: LibraryScope): string {
  switch (scope.kind) {
    case 'all': return '';
    case 'examples': return '?toon=voorbeelden';
    case 'courses': return '?toon=cursussen';
    case 'folders': return '?toon=mappen';
    case 'nofolder': return '?toon=zondermap';
    case 'course': return `?cursus=${encodeURIComponent(scope.id)}`;
    case 'folder': return `?map=${encodeURIComponent(scope.id)}`;
  }
}

export function sameScope(a: LibraryScope, b: LibraryScope): boolean {
  return scopeSearch(a) === scopeSearch(b);
}

/** Alle widgets binnen een filter, zonder zoekterm of soort. */
export function scopeWidgets(index: LibraryIndex, scope: LibraryScope): Widget[] {
  switch (scope.kind) {
    case 'all': return index.widgets;
    case 'examples': return index.widgets.filter((w) => index.exampleIds.has(w.id));
    case 'courses': return index.widgets.filter((w) => index.usage.has(w.id));
    case 'course': {
      const g = index.groups.find((x) => x.courseId === scope.id);
      return g ? g.widgetIds.map((id) => index.byId.get(id)).filter((w): w is Widget => Boolean(w)) : [];
    }
    case 'folders': return index.widgets.filter((w) => folderOf(index, w) !== null);
    case 'folder': return index.widgets.filter((w) => folderOf(index, w) === scope.id);
    case 'nofolder': return index.widgets.filter((w) => folderOf(index, w) === null);
  }
}

export interface GroupRow {
  kind: 'course' | 'folder' | 'nofolder';
  id: string;
  title: string;
  count: number;
  /** Enkele soorten voor de tegeltjes: de drie grootste. */
  types: WidgetTypeId[];
  color?: string;
}

export interface CardSection {
  key: string;
  title?: string;
  widgets: Widget[];
}

export interface LibraryView {
  /** Regels die naar een cursus of map leiden. */
  rows: GroupRow[];
  /** Kaarten, eventueel per hoofdstuk. */
  sections: CardSection[];
  /** Aantal widgets binnen het filter dat bij zoekterm en soort past. */
  matched: number;
  /** true bij een zoekterm: alles plat, niets samengevouwen. */
  flat: boolean;
}

function topTypes(widgets: readonly Widget[]): WidgetTypeId[] {
  return countByType(widgets).slice(0, 3).map((c) => c.type);
}

export function buildLibraryView(index: LibraryIndex, scope: LibraryScope, filter: LibraryFilter): LibraryView {
  const inScope = scopeWidgets(index, scope).filter((w) => matchesFilter(w, filter));
  const matched = inScope.length;
  if (filter.query.trim()) {
    return { rows: [], sections: [{ key: 'zoeken', widgets: inScope }], matched, flat: true };
  }
  const hit = new Set(inScope.map((w) => w.id));
  const courseRow = (g: CourseGroup): GroupRow => {
    const ws = g.widgetIds.filter((id) => hit.has(id)).map((id) => index.byId.get(id) as Widget);
    return { kind: 'course', id: g.courseId, title: g.title, count: ws.length, types: topTypes(ws) };
  };

  switch (scope.kind) {
    case 'all':
    case 'examples': {
      const rows = index.groups.filter((g) => index.bundled.has(g.courseId)).map(courseRow).filter((r) => r.count > 0);
      return { rows, sections: [{ key: 'los', widgets: inScope.filter((w) => isLoose(index, w)) }], matched, flat: false };
    }
    case 'courses':
      return { rows: index.groups.map(courseRow).filter((r) => r.count > 0), sections: [], matched, flat: false };
    case 'course': {
      const g = index.groups.find((x) => x.courseId === scope.id);
      const sections = (g?.chapters ?? [])
        .map((ch) => ({
          key: ch.label,
          title: ch.label,
          widgets: ch.widgetIds.filter((id) => hit.has(id)).map((id) => index.byId.get(id) as Widget),
        }))
        .filter((s) => s.widgets.length > 0);
      return { rows: [], sections, matched, flat: false };
    }
    case 'folders': {
      const rows: GroupRow[] = index.folders.map((f) => {
        const ws = inScope.filter((w) => folderOf(index, w) === f.id);
        return { kind: 'folder', id: f.id, title: f.name, count: ws.length, types: topTypes(ws), color: f.color };
      });
      const loose = index.widgets.filter((w) => folderOf(index, w) === null && matchesFilter(w, filter));
      if (loose.length > 0) rows.push({ kind: 'nofolder', id: '', title: 'Zonder map', count: loose.length, types: topTypes(loose) });
      // Zonder soortfilter tonen we ook lege mappen: die wil je terugvinden.
      return { rows: filter.category ? rows.filter((r) => r.count > 0) : rows, sections: [], matched, flat: false };
    }
    case 'folder':
    case 'nofolder':
      return { rows: [], sections: [{ key: 'map', widgets: inScope }], matched, flat: false };
  }
}

/** Tellers voor de zijkolom: vast, los van zoekterm en soort. */
export interface LibraryCounts {
  all: number;
  examples: number;
  inCourses: number;
  perCourse: Map<string, number>;
  inFolders: number;
  perFolder: Map<string, number>;
  noFolder: number;
}

export function libraryCounts(index: LibraryIndex): LibraryCounts {
  const perFolder = new Map<string, number>(index.folders.map((f) => [f.id, 0]));
  let noFolder = 0;
  for (const w of index.widgets) {
    const f = folderOf(index, w);
    if (f) perFolder.set(f, (perFolder.get(f) ?? 0) + 1);
    else noFolder++;
  }
  return {
    all: index.widgets.length,
    examples: index.exampleIds.size,
    inCourses: index.usage.size,
    perCourse: new Map(index.groups.map((g) => [g.courseId, g.widgetIds.length])),
    inFolders: index.widgets.length - noFolder,
    perFolder,
    noFolder,
  };
}

// ── Voorbeeldmap bij het installeren ────────────────────────────────────────

/**
 * Welke widgets van de voorbeeldcursus in de voorbeeldmap horen:
 * - `incoming`: de bundel zoals ze bewaard mag worden. Widgets die nog niet
 *   lokaal staan, krijgen de voorbeeldmap meteen mee (wat in het bestand
 *   stond, is geen keuze van deze leerkracht).
 * - `updates`: widgets die al lokaal staan zonder geldige map; die krijgen
 *   de voorbeeldmap. Een widget in een bestaande map (ook een eigen map)
 *   blijft waar de leerkracht ze zette.
 */
export function planExampleFolder(
  bundle: readonly Widget[],
  local: readonly Widget[],
  existingFolderIds: ReadonlySet<string>,
  folderId: string = EXAMPLE_FOLDER_ID,
): { incoming: Widget[]; updates: Widget[] } {
  const localById = new Map(local.map((w) => [w.id, w]));
  const incoming = bundle.map((w) => (localById.has(w.id) ? w : { ...w, folderId }));
  const updates: Widget[] = [];
  const seen = new Set<string>();
  for (const w of bundle) {
    const mine = localById.get(w.id);
    if (!mine || seen.has(mine.id)) continue;
    seen.add(mine.id);
    if (mine.folderId && existingFolderIds.has(mine.folderId)) continue;
    updates.push({ ...mine, folderId });
  }
  return { incoming, updates };
}
