import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, CircleHelp, FileBraces, FolderInput, FolderMinus, FolderPen, FolderPlus,
  ListFilter, Package, RefreshCw, Shapes, Star, type LucideIcon,
} from 'lucide-react';
import {
  deleteFolder, deleteWidget, getFolders, getPrefs, getSubmissions, getWidgets, onStorageChange, saveFolder, saveWidget,
} from '../lib/storage';
import { getCourses } from '../lib/courses';
import { exportFolderPack, exportWidgetJsonWithMedia, importFolderPack, importWidgetJson } from '../lib/share';
import type { FolderPack } from '../lib/share';
import { downloadFile, formatDateShort, makeCode, uid } from '../lib/utils';
import { getTypeDef, WIDGET_TYPES } from '../widgets/registry';
import { CheckRow, ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import type { Course } from '../lib/courseTypes';
import type { Folder, Widget, WidgetCategory, WidgetTypeId } from '../lib/types';
import { ShareModal } from '../components/ShareModal';
import { TypeTile } from '../components/TypeTile';
import { MenuButton, type MenuItem } from '../components/Menu';
import {
  AddIcon, AIIcon, BackIcon, CourseIcon, DeleteIcon, DuplicateIcon, EditIcon, ExportIcon, FolderIcon, ImportIcon,
  MoreIcon, ResultsIcon, SearchIcon, ShareIcon, WarningIcon,
} from '../components/icons';
import {
  buildLibraryIndex, buildLibraryView, CATEGORY_CHIPS, deleteWarning, EXAMPLE_FOLDER_ID, libraryCounts, parseScope,
  sameScope, scopeSearch, typeDefOf, type CardSection, type GroupRow, type LibraryIndex, type LibraryScope,
} from '../lib/library';
import '../styles/materiaal.css';

const FOLDER_COLORS: { color: string; name: string }[] = [
  { color: '#4f46e5', name: 'Indigo' },
  { color: '#0ea5e9', name: 'Hemelsblauw' },
  { color: '#16a34a', name: 'Groen' },
  { color: '#d97706', name: 'Oker' },
  { color: '#dc2626', name: 'Rood' },
  { color: '#9333ea', name: 'Paars' },
];

/** Soorten die je in elkaar kan omzetten: dezelfde vragen, andere weergave. */
const CONVERTIBLE: WidgetTypeId[] = ['quiz', 'worksheet', 'exitticket'];

/**
 * Plafond op het aantal kaarten dat in één keer opgebouwd wordt. Zonder dit
 * plafond groeit de DOM bij een grote bibliotheek in één klap met honderden
 * kaarten (elk met een SVG-icoon), wat de eerste toetsaanslag in het
 * zoekveld traag maakt. Een knop "Toon alle" ontgrendelt de rest.
 */
const CARD_PAGE_SIZE = 60;

/** Hoe lang we wachten na de laatste toetsaanslag voor we filteren en de URL bijwerken. */
const SEARCH_DEBOUNCE_MS = 150;

interface LibraryData {
  widgets: Widget[];
  folders: Folder[];
  courses: Course[];
  subCounts: Map<string, number>;
}

function loadData(): LibraryData {
  // Aantal inzendingen per widget in één keer tellen i.p.v. per kaart te filteren.
  const subCounts = new Map<string, number>();
  for (const s of getSubmissions()) subCounts.set(s.widgetId, (subCounts.get(s.widgetId) ?? 0) + 1);
  return { widgets: getWidgets(), folders: getFolders(), courses: getCourses(), subCounts };
}

function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function scopeName(scope: LibraryScope, index: LibraryIndex): string {
  switch (scope.kind) {
    case 'all': return 'Alle widgets';
    case 'examples': return 'Voorbeelden';
    case 'courses': return 'In cursussen';
    case 'folders': return 'Mijn mappen';
    case 'nofolder': return 'Zonder map';
    case 'course': return index.groups.find((g) => g.courseId === scope.id)?.title ?? 'Cursus';
    case 'folder': return index.folders.find((f) => f.id === scope.id)?.name ?? 'Map';
  }
}

function parseCategory(v: string | null): WidgetCategory | null {
  return CATEGORY_CHIPS.some((c) => c.id === v) ? (v as WidgetCategory) : null;
}

export function TeacherDashboard() {
  // Eén keer geladen bij het openen (useState-initializer); daarna alleen
  // nog bij een echte opslagwijziging, niet nog eens meteen bij het openen.
  const [data, setData] = useState<LibraryData>(loadData);
  useEffect(() => onStorageChange(() => setData(loadData())), []);

  const index = useMemo(() => buildLibraryIndex(data.widgets, data.courses, data.folders), [data]);
  const counts = useMemo(() => libraryCounts(index), [index]);

  // Filter, zoekterm en soort staan in de URL: terugkeren uit de editor
  // brengt je terug waar je was.
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params, index);
  const scopeKey = scopeSearch(scope);
  const urlQuery = params.get('q') ?? '';
  const category = parseCategory(params.get('soort'));

  const setParam = (key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  // Het zoekveld typt lokaal en meteen zichtbaar; de echte filtering (en de
  // URL) volgt pas na een korte stilte, zodat je niet bij elke toetsaanslag
  // honderden kaarten opnieuw opbouwt. Een zoekterm die al in de URL staat
  // bij het laden (bv. terug uit de editor) staat meteen goed.
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery);

  // Externe wijziging van de URL (terugknop, "Filters wissen", een link met
  // ?q= erin): het zoekveld en de filtering volgen mee.
  useEffect(() => {
    setSearchInput(urlQuery);
    setQuery(urlQuery);
  }, [urlQuery]);

  // Debounce: pas na SEARCH_DEBOUNCE_MS stilte filteren we echt en schrijven
  // we naar de URL (met replace, zodat elke letter geen historiekstap wordt).
  useEffect(() => {
    if (searchInput === query) return undefined;
    const timer = window.setTimeout(() => {
      setQuery(searchInput);
      setParam('q', searchInput || null);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const view = useMemo(
    () => buildLibraryView(index, parseScope(new URLSearchParams(scopeKey), index), { query, category }),
    [index, scopeKey, query, category]
  );
  // Zoekt iemand binnen een map of cursus zonder treffers, dan tonen we of er elders wél iets is.
  const elsewhere = useMemo(
    () => (query.trim() && scope.kind !== 'all' ? buildLibraryView(index, { kind: 'all' }, { query, category }).matched : 0),
    [index, scope.kind, query, category]
  );

  // Cursusweergave (per hoofdstuk): hoofdstukken inklapbaar, enkel het
  // eerste standaard open. Elders (alle widgets, een map, zoeken): een plat
  // plafond van CARD_PAGE_SIZE kaarten met een knop "Toon alle". Zoeken
  // binnen een cursus toont sowieso een platte lijst (view.flat), dus dat
  // valt terug op het plafond.
  const isChapterView = scope.kind === 'course' && !view.flat;

  const [openChapters, setOpenChapters] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!isChapterView) return;
    setOpenChapters(new Set(view.sections[0] ? [view.sections[0].key] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, isChapterView]);
  const toggleChapter = (key: string, open: boolean) => {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (open) next.add(key); else next.delete(key);
      return next;
    });
  };

  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [scopeKey, query, category]);
  const totalCards = useMemo(() => view.sections.reduce((sum, s) => sum + s.widgets.length, 0), [view]);
  const visibleSections = useMemo(() => {
    if (isChapterView || showAll) return view.sections;
    let remaining = CARD_PAGE_SIZE;
    const out: CardSection[] = [];
    for (const s of view.sections) {
      if (remaining <= 0) break;
      if (s.widgets.length <= remaining) {
        out.push(s);
        remaining -= s.widgets.length;
      } else {
        out.push({ ...s, widgets: s.widgets.slice(0, remaining) });
        remaining = 0;
      }
    }
    return out;
  }, [view, showAll, isChapterView]);

  /** Link naar een filter; zoekterm en soort blijven staan. */
  const hrefFor = (s: LibraryScope): string => {
    const next = new URLSearchParams(scopeSearch(s));
    if (query) next.set('q', query);
    if (category) next.set('soort', category);
    const qs = next.toString();
    return `/widgets${qs ? `?${qs}` : ''}`;
  };

  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => { setFiltersOpen(false); }, [scopeKey]);

  const [folderModal, setFolderModal] = useState<Folder | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Widget | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [shareTarget, setShareTarget] = useState<Widget | null>(null);
  const [convertTarget, setConvertTarget] = useState<Widget | null>(null);
  const [moveTarget, setMoveTarget] = useState<Widget | null>(null);
  const [packImport, setPackImport] = useState<FolderPack | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const duplicate = (w: Widget) => {
    const copy: Widget = {
      ...JSON.parse(JSON.stringify(w)),
      id: uid(),
      code: makeCode(),
      title: `${w.title} (kopie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (saveWidget(copy)) toast('Widget gedupliceerd', 'ok');
    else toast('Niet gedupliceerd: de opslag van dit toestel is vol.', 'err');
  };

  const exportOne = async (w: Widget) => {
    try {
      // Met media als data-URL, zodat het bestand op een ander toestel werkt.
      const json = await exportWidgetJsonWithMedia(w);
      downloadFile(`${w.title.replace(/[^\w\dà-ÿ -]/gi, '').trim() || 'widget'}.widget.json`, json);
    } catch {
      toast('Exporteren mislukt', 'err');
    }
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    // Eerst kijken of het een vakgroeppakket is (hele map met widgets).
    const pack = importFolderPack(text);
    if (pack) {
      if (pack.widgets.length === 0) {
        toast('Dit pakket bevat geen bruikbare widgets', 'err');
        return;
      }
      setPackImport(pack);
      return;
    }
    const w = importWidgetJson(text);
    if (!w) {
      toast('Dit bestand is geen geldige widget', 'err');
      return;
    }
    // Zelfde weg als de importpagina: onbekend type weigeren, velden naar de
    // juiste soort brengen, en alleen "geïmporteerd" melden als het echt
    // bewaard is (niet bij een volle opslag). Lui geladen: importers.ts is groot.
    const { ImportError, saveImportedWidget } = await import('../lib/importers');
    try {
      const saved = saveImportedWidget(w as Widget);
      toast(`“${saved.title}” geïmporteerd`, 'ok');
    } catch (e) {
      toast(e instanceof ImportError ? e.message : 'Importeren mislukt', 'err');
    }
  };

  const exportFolder = async (folder: Folder) => {
    const inFolder = data.widgets.filter((w) => w.folderId === folder.id);
    if (inFolder.length === 0) {
      toast('Deze map bevat geen widgets om te delen', 'err');
      return;
    }
    // async: afbeeldingen uit IndexedDB gaan als data-URL mee in het pakket
    const json = await exportFolderPack(folder.name, inFolder, getPrefs().teacherName);
    const safeName = folder.name.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-') || 'map';
    downloadFile(`${safeName}.widgetpak.json`, json);
    toast(`Map “${folder.name}” gedownload als pakket (${n(inFolder.length, 'widget', 'widgets')})`, 'ok');
  };

  const widgetMenu = (w: Widget): MenuItem[] => {
    const def = typeDefOf(w.type);
    const subs = data.subCounts.get(w.id) ?? 0;
    const items: MenuItem[] = [
      { label: 'Delen', hint: 'Code, link of QR voor je leerlingen', Icon: ShareIcon, onSelect: () => setShareTarget(w) },
      {
        label: 'Resultaten', Icon: ResultsIcon, to: `/resultaten/${w.id}`,
        hint: def && !def.hasSubmissions ? 'Deze soort levert geen inzendingen op' : n(subs, 'inzending', 'inzendingen'),
      },
      { label: 'Dupliceren', Icon: DuplicateIcon, onSelect: () => duplicate(w) },
    ];
    if (CONVERTIBLE.includes(w.type)) {
      items.push({ label: 'Omzetten naar ander type', hint: 'Quiz, werkblad of exit-ticket', Icon: RefreshCw, onSelect: () => setConvertTarget(w) });
    }
    items.push(
      { label: 'Naar map', Icon: FolderInput, onSelect: () => setMoveTarget(w) },
      { label: 'Exporteren', hint: 'Als bestand (.json)', Icon: ExportIcon, onSelect: () => { void exportOne(w); } },
      { label: 'Verwijderen', Icon: DeleteIcon, danger: true, separator: true, onSelect: () => setDeleteTarget(w) },
    );
    return items;
  };

  const importItems: MenuItem[] = [
    { label: 'JSON-bestand', hint: 'Een widget of een vakgroeppakket', Icon: FileBraces, onSelect: () => fileRef.current?.click() },
    { label: 'Uit pdf, Word of tekst', hint: 'Bestaand materiaal omzetten', Icon: ImportIcon, to: '/importeren' },
    { label: 'Met AI', hint: 'Widgets uit je leerstof', Icon: AIIcon, to: '/ai-studio' },
  ];

  const activeFolder = scope.kind === 'folder' ? index.folders.find((f) => f.id === scope.id) ?? null : null;
  const activeCourse = scope.kind === 'course' ? index.groups.find((g) => g.courseId === scope.id) ?? null : null;
  const currentName = scopeName(scope, index);
  const currentCount = (() => {
    switch (scope.kind) {
      case 'all': return counts.all;
      case 'examples': return counts.examples;
      case 'courses': return counts.inCourses;
      case 'folders': return counts.inFolders;
      case 'nofolder': return counts.noFolder;
      case 'course': return counts.perCourse.get(scope.id) ?? 0;
      case 'folder': return counts.perFolder.get(scope.id) ?? 0;
    }
  })();

  const hasCards = view.sections.some((s) => s.widgets.length > 0);
  const isEmpty = !hasCards && view.rows.length === 0;
  const filtering = Boolean(query.trim() || category);

  // In een cursus spreken we van oefeningen, elders van widgets.
  const count = (x: number) => (scope.kind === 'course' ? n(x, 'oefening', 'oefeningen') : n(x, 'widget', 'widgets'));
  const resultText = query.trim()
    ? view.matched === 0
      ? `Niets gevonden voor “${query.trim()}”`
      : `${count(view.matched)} gevonden voor “${query.trim()}”`
    : category
      ? `${count(view.matched)} in ${CATEGORY_CHIPS.find((c) => c.id === category)?.label.toLowerCase()}`
      : count(view.matched);

  return (
    <div className="page mat-page">
      <div className="page-head">
        <div>
          <h1>Widgets</h1>
          <p className="sub">{n(data.widgets.length, 'widget', 'widgets')} · alles lokaal bewaard in deze browser</p>
        </div>
        <div className="page-head-actions">
          <MenuButton label="Importeren" Icon={ImportIcon} items={importItems} className="btn btn-ghost" />
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          <Link to="/nieuw" className="btn btn-primary"><AddIcon size={18} /> Nieuwe widget</Link>
        </div>
      </div>

      <div className="lib">
        <aside className="lib-side">
          <button
            type="button"
            className="btn btn-ghost lib-side-toggle"
            aria-expanded={filtersOpen}
            aria-controls="lib-nav"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <ListFilter size={18} />
            <span className="lib-toggle-text">Toon: {currentName}</span>
            <span className="lib-count">{currentCount}</span>
            <ChevronDown size={18} className="lib-toggle-chevron" />
          </button>
          <nav id="lib-nav" className={`lib-nav${filtersOpen ? ' is-open' : ''}`} aria-label="Widgets filteren">
            <ul>
              <NavItem to={hrefFor({ kind: 'all' })} current={sameScope(scope, { kind: 'all' })} Icon={Shapes} label="Alle widgets" count={counts.all} />
              {counts.examples > 0 && (
                <NavItem to={hrefFor({ kind: 'examples' })} current={scope.kind === 'examples'} Icon={Star} label="Voorbeelden" count={counts.examples} />
              )}
              {index.groups.length > 0 && (
                <NavItem to={hrefFor({ kind: 'courses' })} current={scope.kind === 'courses'} Icon={CourseIcon} label="In cursussen" count={counts.inCourses}>
                  {index.groups.map((g) => (
                    <NavItem
                      key={g.courseId} sub
                      to={hrefFor({ kind: 'course', id: g.courseId })}
                      current={scope.kind === 'course' && scope.id === g.courseId}
                      label={g.title} count={g.widgetIds.length}
                    />
                  ))}
                </NavItem>
              )}
              <NavItem to={hrefFor({ kind: 'folders' })} current={scope.kind === 'folders'} Icon={FolderIcon} label="Mijn mappen" count={counts.inFolders}>
                {index.folders.map((f) => (
                  <NavItem
                    key={f.id} sub
                    to={hrefFor({ kind: 'folder', id: f.id })}
                    current={scope.kind === 'folder' && scope.id === f.id}
                    label={f.name} count={counts.perFolder.get(f.id) ?? 0}
                    Icon={FolderIcon} iconColor={f.color}
                  />
                ))}
                {index.folders.length > 0 && (
                  <NavItem sub to={hrefFor({ kind: 'nofolder' })} current={scope.kind === 'nofolder'} Icon={FolderMinus} label="Zonder map" count={counts.noFolder} />
                )}
              </NavItem>
            </ul>
            <button type="button" className="btn btn-quiet btn-sm lib-newfolder" onClick={() => setFolderModal('new')}>
              <FolderPlus size={16} /> Nieuwe map
            </button>
          </nav>
        </aside>

        <div className="lib-main">
          <div className="lib-tools">
            <div className="lib-search">
              <SearchIcon size={18} />
              <label htmlFor="lib-zoek" className="sr-only">Zoek widgets op titel, soort of code</label>
              <input
                ref={searchRef}
                id="lib-zoek"
                className="input" type="search" placeholder="Zoek op titel, soort of code"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="lib-chips" role="group" aria-label="Soort">
              <button type="button" className="lib-chip" aria-pressed={category === null} onClick={() => setParam('soort', null)}>
                Alle soorten
              </button>
              {CATEGORY_CHIPS.map((c) => (
                <button
                  key={c.id} type="button" className="lib-chip"
                  aria-pressed={category === c.id}
                  onClick={() => setParam('soort', category === c.id ? null : c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lib-head">
            <div className="lib-head-text">
              {activeCourse && (
                <Link to={hrefFor({ kind: 'courses' })} className="btn btn-quiet btn-sm lib-back"><BackIcon size={16} /> In cursussen</Link>
              )}
              {activeFolder && (
                <Link to={hrefFor({ kind: 'folders' })} className="btn btn-quiet btn-sm lib-back"><BackIcon size={16} /> Mijn mappen</Link>
              )}
              <h2>
                {activeFolder && <FolderIcon size={20} style={{ color: activeFolder.color }} />}
                {activeCourse && <CourseIcon size={20} />}
                {currentName}
              </h2>
              <p className="lib-head-note" aria-live="polite">{resultText}</p>
            </div>
            <div className="lib-head-actions">
              {activeCourse && (
                <Link to={`/cursus/bewerk/${activeCourse.courseId}`} className="btn btn-ghost btn-sm">
                  <EditIcon size={16} /> Cursus bewerken
                </Link>
              )}
              {activeFolder && (
                <MenuButton
                  label="Map" Icon={FolderIcon} className="btn btn-ghost btn-sm"
                  ariaLabel={`Acties voor map ${activeFolder.name}`}
                  items={[
                    { label: 'Map bewerken', hint: 'Naam en kleur', Icon: FolderPen, onSelect: () => setFolderModal(activeFolder) },
                    { label: 'Delen als pakket', hint: 'Eén bestand voor je vakgroep', Icon: Package, onSelect: () => { void exportFolder(activeFolder); } },
                    { label: 'Map verwijderen', hint: 'De widgets blijven bestaan', Icon: DeleteIcon, danger: true, separator: true, onSelect: () => setDeleteFolderTarget(activeFolder) },
                  ]}
                />
              )}
              {scope.kind === 'folders' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFolderModal('new')}>
                  <FolderPlus size={16} /> Nieuwe map
                </button>
              )}
            </div>
          </div>

          {view.rows.length > 0 && (
            <ul className="lib-rows">
              {view.rows.map((r) => (
                <li key={`${r.kind}:${r.id}`}>
                  <GroupRowLink row={r} to={hrefFor(rowScope(r))} />
                </li>
              ))}
            </ul>
          )}

          {isChapterView ? (
            view.sections.map((s) => s.widgets.length > 0 && (
              <details
                key={s.key}
                className="lib-chapter"
                open={openChapters.has(s.key)}
                onToggle={(e) => toggleChapter(s.key, (e.target as HTMLDetailsElement).open)}
              >
                <summary className="lib-chapter-summary">
                  <span>{s.title}</span>
                  <span className="lib-count">{n(s.widgets.length, 'oefening', 'oefeningen')}</span>
                  <ChevronDown size={18} className="lib-chapter-chevron" />
                </summary>
                {/* Kaarten van een dichtgeklapt hoofdstuk bouwen we niet op: dat
                    zou de winst van het inklappen meteen weer tenietdoen. */}
                {openChapters.has(s.key) && (
                  <ul className="lib-grid lib-chapter-grid">
                    {s.widgets.map((w) => (
                      <li key={w.id}>
                        <WidgetCard widget={w} subCount={data.subCounts.get(w.id) ?? 0} items={widgetMenu(w)} level={4} />
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ))
          ) : (
            <>
              {visibleSections.map((s) => s.widgets.length > 0 && (
                <section key={s.key} aria-label={s.title}>
                  {s.title && <h3 className="lib-section-title">{s.title}</h3>}
                  <ul className="lib-grid">
                    {s.widgets.map((w) => (
                      <li key={w.id}>
                        <WidgetCard
                          widget={w}
                          subCount={data.subCounts.get(w.id) ?? 0}
                          items={widgetMenu(w)}
                          level={s.title ? 4 : 3}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {totalCards > CARD_PAGE_SIZE && (
                // Dezelfde knop blijft staan (enkel de tekst wisselt), zodat de
                // toetsenbordfocus niet verdwijnt na het tonen van alle kaarten.
                <div className="lib-more">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? `Toon minder (eerste ${CARD_PAGE_SIZE})` : `Toon alle (${totalCards})`}
                  </button>
                </div>
              )}
            </>
          )}

          {isEmpty && (
            data.widgets.length === 0 ? (
              <EmptyState icon={<Shapes size={40} />} title="Nog geen widgets">
                <p>Maak je eerste widget en deel hem met je klas.</p>
                <Link to="/nieuw" className="btn btn-primary"><AddIcon size={18} /> Nieuwe widget</Link>
              </EmptyState>
            ) : filtering ? (
              <EmptyState icon={<SearchIcon size={40} />} title="Geen widgets gevonden">
                <p>Probeer een andere zoekterm of een andere soort.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => {
                    setParams((prev) => { const next = new URLSearchParams(prev); next.delete('q'); next.delete('soort'); return next; }, { replace: true });
                    searchRef.current?.focus();
                  }}>
                    Filters wissen
                  </button>
                  {elsewhere > 0 && (
                    <Link to={hrefFor({ kind: 'all' })} className="btn btn-ghost">
                      Zoek in alle widgets ({elsewhere})
                    </Link>
                  )}
                </div>
              </EmptyState>
            ) : scope.kind === 'folder' ? (
              <EmptyState icon={<FolderIcon size={40} />} title="Deze map is leeg">
                <p>Zet een widget in deze map via het menu van de widget: “Naar map”.</p>
              </EmptyState>
            ) : (
              <EmptyState icon={<Shapes size={40} />} title="Nog niets hier">
                <p>Kies links een andere selectie, of maak een nieuwe widget.</p>
              </EmptyState>
            )
          )}
        </div>
      </div>

      {folderModal && (
        <FolderModal
          folder={folderModal === 'new' ? null : folderModal}
          onClose={() => setFolderModal(null)}
          onSaved={(f, isNew) => { if (isNew) navigate(`/widgets?map=${encodeURIComponent(f.id)}`); }}
        />
      )}
      {deleteTarget && (
        <DeleteWidgetModal
          widget={deleteTarget}
          subCount={data.subCounts.get(deleteTarget.id) ?? 0}
          warning={deleteWarning(index.usage.get(deleteTarget.id))}
          onConfirm={() => { deleteWidget(deleteTarget.id); toast('Widget verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {deleteFolderTarget && (
        <ConfirmModal
          title="Map verwijderen?"
          message={`De map “${deleteFolderTarget.name}” wordt verwijderd. De widgets erin blijven bestaan en staan daarna bij “Zonder map”.`}
          onConfirm={() => {
            deleteFolder(deleteFolderTarget.id);
            navigate('/widgets?toon=mappen', { replace: true });
            toast('Map verwijderd', 'ok');
          }}
          onClose={() => setDeleteFolderTarget(null)}
        />
      )}
      {convertTarget && (
        <ConvertModal
          widget={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConvert={(target) => {
            saveWidget({ ...convertTarget, type: target });
            toast(`Omgezet naar ${getTypeDef(target).name.toLowerCase()}`, 'ok');
            setConvertTarget(null);
          }}
        />
      )}
      {moveTarget && (
        <MoveModal
          widget={moveTarget}
          folders={index.folders}
          onClose={() => setMoveTarget(null)}
        />
      )}
      {shareTarget && <ShareModal widget={shareTarget} onClose={() => setShareTarget(null)} />}
      {packImport && (
        <PackImportModal
          pack={packImport}
          onClose={() => setPackImport(null)}
          onImported={(folderId) => { if (folderId) navigate(`/widgets?map=${encodeURIComponent(folderId)}`); }}
        />
      )}
    </div>
  );
}

function rowScope(r: GroupRow): LibraryScope {
  if (r.kind === 'course') return { kind: 'course', id: r.id };
  if (r.kind === 'folder') return { kind: 'folder', id: r.id };
  return { kind: 'nofolder' };
}

// ── Zijkolom ────────────────────────────────────────────────────────────────

function NavItem({
  to, current, Icon, label, count, sub, iconColor, children,
}: {
  to: string;
  current: boolean;
  Icon?: LucideIcon;
  label: string;
  count: number;
  sub?: boolean;
  iconColor?: string;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <Link to={to} className={`lib-nav-link${sub ? ' lib-nav-sub' : ''}`} aria-current={current ? 'page' : undefined}>
        {Icon && <Icon size={sub ? 16 : 18} style={iconColor ? { color: iconColor } : undefined} />}
        <span className="lib-nav-label">{label}</span>
        <span className="lib-count"><span className="sr-only">(</span>{count}<span className="sr-only">)</span></span>
      </Link>
      {React.Children.count(children) > 0 && <ul>{children}</ul>}
    </li>
  );
}

// ── Regel naar een cursus of map ────────────────────────────────────────────

function GroupRowLink({ row, to }: { row: GroupRow; to: string }) {
  const Icon = row.kind === 'course' ? CourseIcon : row.kind === 'folder' ? FolderIcon : FolderMinus;
  const count = row.kind === 'course' ? n(row.count, 'oefening', 'oefeningen') : n(row.count, 'widget', 'widgets');
  return (
    <Link to={to} className="lib-row">
      <span className="lib-row-icon"><Icon size={20} style={row.color ? { color: row.color } : undefined} /></span>
      <span className="lib-row-text">
        <span className="lib-row-title">{row.title}</span>
        <span className="lib-row-count">{count}</span>
      </span>
      {row.types.length > 0 && (
        <span className="lib-row-stack" aria-hidden="true">
          {row.types.map((t) => <TypeTile key={t} type={t} size="xs" />)}
        </span>
      )}
      <ChevronRight size={18} className="lib-chevron" />
    </Link>
  );
}

// ── Widgetkaart ─────────────────────────────────────────────────────────────

function WidgetCard({ widget: w, subCount, items, level }: { widget: Widget; subCount: number; items: MenuItem[]; level: 3 | 4 }) {
  const def = typeDefOf(w.type);
  const Heading = level === 4 ? 'h4' : 'h3';
  return (
    <article className="card widget-card lib-card">
      {def ? <TypeTile type={def} size="sm" className="lib-card-tile" /> : <span className="lib-card-tile lib-card-tile-unknown" aria-hidden="true" />}
      <span className="lib-card-kind">{def?.name ?? 'Onbekende soort'}</span>
      <Heading className="lib-card-title">
        <Link to={`/bewerk/${w.id}`} className="lib-card-link">
          {w.title}
          <span className="sr-only"> ({def?.name.toLowerCase() ?? 'onbekende soort'})</span>
        </Link>
      </Heading>
      <div className="lib-card-foot">
        <span className="lib-code"><span className="sr-only">Code </span>{w.code}</span>
        {subCount > 0 && (
          <span className="lib-subs"><ResultsIcon size={14} /> {n(subCount, 'inzending', 'inzendingen')}</span>
        )}
        <span className="lib-date"><span className="sr-only">Bewerkt op </span>{formatDateShort(w.updatedAt)}</span>
      </div>
      <div className="lib-card-menu">
        <MenuButton
          items={items}
          Icon={MoreIcon}
          ariaLabel={`Acties voor ${w.title}`}
          className="btn btn-quiet btn-icon"
        />
      </div>
    </article>
  );
}

// ── Verwijderen, met waarschuwing als een cursus de widget gebruikt ─────────

function DeleteWidgetModal({ widget, subCount, warning, onConfirm, onClose }: {
  widget: Widget;
  subCount: number;
  warning: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Widget verwijderen?"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-danger" onClick={() => { onConfirm(); onClose(); }}>Verwijderen</button>
        </>
      }
    >
      <p>
        “{widget.title}” {subCount > 0 ? `en ${n(subCount, 'inzending', 'inzendingen')} ` : 'en alle bijbehorende resultaten '}
        worden definitief verwijderd.
      </p>
      {warning && (
        <div className="callout warn lib-warning" role="note">
          <WarningIcon size={20} />
          <p>{warning}</p>
        </div>
      )}
    </Modal>
  );
}

// ── Omzetten naar een ander type ────────────────────────────────────────────

function ConvertModal({ widget, onClose, onConvert }: {
  widget: Widget;
  onClose: () => void;
  onConvert: (target: WidgetTypeId) => void;
}) {
  const targets = CONVERTIBLE.filter((t) => t !== widget.type);
  return (
    <Modal title="Omzetten naar ander type" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>
        “{widget.title}” houdt dezelfde vragen; alleen de weergave voor je leerlingen verandert.
      </p>
      <div className="lib-choices">
        {targets.map((t) => {
          const def = getTypeDef(t);
          return (
            <button key={t} type="button" className="lib-choice" onClick={() => onConvert(t)}>
              <TypeTile type={def} size="md" />
              <span>
                <strong>{def.name}</strong>
                <small>{def.tagline}</small>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Naar een map verplaatsen ────────────────────────────────────────────────

const NEW_FOLDER = '__nieuw__';

function MoveModal({ widget, folders, onClose }: { widget: Widget; folders: Folder[]; onClose: () => void }) {
  const toast = useToast();
  const current = widget.folderId && folders.some((f) => f.id === widget.folderId) ? widget.folderId : '';
  const [choice, setChoice] = useState<string>(current);
  const [newName, setNewName] = useState('');
  const groupName = useId();

  const save = () => {
    let folderId: string | null = choice || null;
    let folderName = folders.find((f) => f.id === choice)?.name;
    if (choice === NEW_FOLDER) {
      const name = newName.trim();
      if (!name) return;
      folderId = uid();
      folderName = name;
      saveFolder({ id: folderId, name, color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length].color, createdAt: Date.now() });
    }
    if (!saveWidget({ ...widget, folderId })) {
      toast('Niet verplaatst: de opslag van dit toestel is vol.', 'err');
      return;
    }
    toast(folderId ? `Verplaatst naar “${folderName}”` : 'Uit de map gehaald', 'ok');
    onClose();
  };

  return (
    <Modal
      title="Naar map"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={choice === NEW_FOLDER && !newName.trim()} onClick={save}>Verplaatsen</button>
        </>
      }
    >
      <fieldset className="lib-fieldset">
        <legend>Waar zet je “{widget.title}”?</legend>
        <label className="lib-radio">
          <input type="radio" name={groupName} checked={choice === ''} onChange={() => setChoice('')} />
          <FolderMinus size={18} /> Zonder map
        </label>
        {folders.map((f) => (
          <label key={f.id} className="lib-radio">
            <input type="radio" name={groupName} checked={choice === f.id} onChange={() => setChoice(f.id)} />
            <FolderIcon size={18} style={{ color: f.color }} /> {f.name}
            {f.id === EXAMPLE_FOLDER_ID && <span className="badge">voorbeeld</span>}
          </label>
        ))}
        <label className="lib-radio">
          <input type="radio" name={groupName} checked={choice === NEW_FOLDER} onChange={() => setChoice(NEW_FOLDER)} />
          <FolderPlus size={18} /> Nieuwe map…
        </label>
      </fieldset>
      {choice === NEW_FOLDER && (
        <Field label="Naam van de nieuwe map">
          <input
            className="input" value={newName} autoFocus placeholder="bv. 3de graad Frans"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
        </Field>
      )}
    </Modal>
  );
}

// ── Vakgroeppakket importeren ────────────────────────────────────────────────

function PackImportModal({ pack, onClose, onImported }: {
  pack: FolderPack;
  onClose: () => void;
  onImported: (folderId: string | null) => void;
}) {
  const toast = useToast();

  // Dubbelendetectie: zelfde titel + type bestaat al in de eigen collectie.
  const rows = useMemo(() => {
    const existing = new Set(getWidgets().map((w) => `${w.type}::${w.title.trim().toLowerCase()}`));
    return pack.widgets.map((widget, index) => ({
      index,
      widget,
      def: WIDGET_TYPES.find((t) => t.id === widget.type),
      duplicate: existing.has(`${widget.type}::${widget.title.trim().toLowerCase()}`),
    }));
  }, [pack]);

  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(rows.filter((r) => r.def && !r.duplicate).map((r) => r.index))
  );
  const [inNewFolder, setInNewFolder] = useState(true);

  const toggle = (index: number, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const chosen = rows.filter((r) => r.def && checked.has(r.index));

  const doImport = async () => {
    if (chosen.length === 0) return;
    // Zelfde weg als de importpagina: eerlijk tellen wat bewaard is (OP2).
    const { describePackImport, saveImportedPack } = await import('../lib/importers');
    const res = saveImportedPack({ ...pack, widgets: chosen.map((r) => r.widget) }, { inNewFolder });
    const msg = describePackImport(res);
    toast(msg.text, res.failed.length > 0 || msg.tone === 'err' ? 'err' : msg.tone === 'ok' ? 'ok' : 'info');
    if (res.widgets.length > 0) onImported(res.folderId);
    onClose();
  };

  const parsedDate = pack.meta.datum ? new Date(pack.meta.datum) : null;
  const dateTxt = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString('nl-BE', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <Modal
      title="Vakgroeppakket importeren"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={chosen.length === 0} onClick={doImport}>
            {chosen.length === 0 ? 'Importeren' : `${chosen.length} widget${chosen.length === 1 ? '' : 's'} importeren`}
          </button>
        </>
      }
    >
      <div className="callout" style={{ marginBottom: 14 }}>
        <Package size={20} style={{ flex: 'none', marginTop: 2 }} />
        <div>
          <strong>{pack.meta.naam}</strong>
          <div className="hint" style={{ marginTop: 4 }}>
            {pack.meta.auteur ? `Gedeeld door ${pack.meta.auteur}` : 'Auteur onbekend'}
            {dateTxt ? ` · ${dateTxt}` : ''} · {pack.widgets.length} widget{pack.widgets.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <Field label="Welke widgets wil je importeren?" hint="Widgets met dezelfde titel en hetzelfde type als een bestaande widget staan standaard uitgevinkt.">
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button className="btn btn-sm btn-quiet"
            onClick={() => setChecked(new Set(rows.filter((r) => r.def).map((r) => r.index)))}>
            Alles aanvinken
          </button>
          <button className="btn btn-sm btn-quiet" onClick={() => setChecked(new Set())}>
            Alles uitvinken
          </button>
        </div>
        <div style={{ display: 'grid', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
          {rows.map((r) => (
            <label key={r.index} className="checkbox-row">
              <input
                type="checkbox"
                checked={checked.has(r.index)}
                disabled={!r.def}
                onChange={(e) => toggle(r.index, e.target.checked)}
              />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                {r.def ? <TypeTile type={r.def} size="xs" /> : <CircleHelp size={18} aria-hidden="true" />}
                <span>{r.widget.title}</span>
                <span className="hint">({r.def ? r.def.name : 'onbekend type'})</span>
                {r.duplicate && <span className="badge badge-warn">bestaat al</span>}
                {!r.def && <span className="badge badge-err">kan niet geïmporteerd worden</span>}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <CheckRow
        checked={inNewFolder}
        onChange={setInNewFolder}
        label={`Importeren in nieuwe map “${pack.meta.naam}”`}
      />
      {!inNewFolder && <p className="hint" style={{ marginTop: 4 }}>De widgets komen dan bij “Zonder map” terecht.</p>}
    </Modal>
  );
}

// ── Map aanmaken of bewerken ────────────────────────────────────────────────

function FolderModal({ folder, onClose, onSaved }: {
  folder: Folder | null;
  onClose: () => void;
  onSaved?: (folder: Folder, isNew: boolean) => void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0].color);
  const toast = useToast();
  const save = () => {
    if (!name.trim()) return;
    const saved: Folder = { id: folder?.id ?? uid(), name: name.trim(), color, createdAt: folder?.createdAt ?? Date.now() };
    saveFolder(saved);
    toast(folder ? 'Map bijgewerkt' : 'Map aangemaakt', 'ok');
    onClose();
    onSaved?.(saved, !folder);
  };
  return (
    <Modal
      title={folder ? 'Map bewerken' : 'Nieuwe map'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Bewaren</button>
        </>
      }
    >
      <Field label="Naam van de map">
        <input
          className="input" value={name} placeholder="bv. 3de graad Frans"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
      </Field>
      <fieldset className="lib-fieldset">
        <legend>Kleur</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FOLDER_COLORS.map((c) => (
            <button key={c.color} type="button" className="wb-swatch" style={{ background: c.color, borderColor: color === c.color ? 'var(--text)' : 'transparent' }}
              aria-label={c.name} aria-pressed={color === c.color} onClick={() => setColor(c.color)} />
          ))}
        </div>
      </fieldset>
    </Modal>
  );
}
