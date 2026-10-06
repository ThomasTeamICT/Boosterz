import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen, ChartColumn, Ellipsis, FileUp, GraduationCap, HardDriveDownload, House, Inbox, KeyRound,
  Library, LifeBuoy, ListTree, Menu as MenuIcon, Moon, Plus, Shapes, ShieldCheck, Sparkles, Sun, SunMoon,
  TriangleAlert, Users, X, type LucideIcon,
} from 'lucide-react';
import { cycleTheme, type ThemeMode } from '../lib/theme';
import { BRAND, BrandMark } from './Brand';
import { MenuButton, type MenuItem } from './Menu';
import { getPrefs, getSubmissions, onStorageChange } from '../lib/storage';
import {
  clearBackupHint, formatPct, onStorageNotice, pendingBackupHint, readStorageHealth,
  type StorageNotice,
} from '../lib/storageHealth';

const THEME_ICON: Record<ThemeMode, LucideIcon> = { auto: SunMoon, light: Sun, dark: Moon };
const THEME_LABEL: Record<ThemeMode, string> = { auto: 'automatisch', light: 'licht', dark: 'donker' };

// ── Opslagbalk ──────────────────────────────────────────────────────────────
// Twee dingen mogen niet ongemerkt voorbijgaan: (1) een bewaaractie die
// mislukte (dan is er data weg) en (2) een opslag die kritiek vol raakt (dan
// gáát er straks data weg). De balk hangt bewust in de leerkrachtschil: de
// leerlingweergave (/speel, /meedoen, /cursus/lees…) laadt deze Layout niet,
// dus een leerling krijgt hem nooit midden in een oefening te zien.

/** Bij welke vulling de balk werd weggeklikt — zodat hij niet blijft terugkomen. */
const BAR_DISMISS_KEY = 'wf.storage.barhidden.v1';
/** Pas opnieuw tonen als het merkbaar erger werd dan bij het wegklikken. */
const REAPPEAR_DELTA = 3;

function readDismissedPct(): number | null {
  try {
    const raw = localStorage.getItem(BAR_DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function rememberDismissedPct(pct: number) {
  try {
    localStorage.setItem(BAR_DISMISS_KEY, String(Math.round(pct)));
  } catch {
    // genegeerd: dan komt de balk bij een volgende meting gewoon terug
  }
}

function StorageBar() {
  // Een back-uphint die bij een vorig bezoek gezet werd, staat hier klaar.
  const [notice, setNotice] = useState<StorageNotice | null>(pendingBackupHint);
  const [criticalPct, setCriticalPct] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  // Meldingen uit de opslaglaag (mislukt bewaren, geweigerde bescherming). Een
  // ernstige melding (data weg) blijft staan tot ze weggeklikt wordt: een latere
  // tip mag ze niet overschrijven.
  useEffect(() => onStorageNotice((n) => setNotice((cur) => (cur?.severe && !n.severe ? cur : n))), []);

  // Vulling meten: bij het openen en — ontdubbeld — na wijzigingen. Autosave
  // schrijft in bursts, dus we wachten telkens tot het even stil is.
  useEffect(() => {
    let alive = true;
    const measure = () => {
      void readStorageHealth()
        .then((health) => {
          if (!alive) return;
          const dismissed = readDismissedPct();
          const relevant =
            health.level === 'critical' &&
            (dismissed === null || health.worstPct >= dismissed + REAPPEAR_DELTA);
          setCriticalPct(relevant ? health.worstPct : null);
        })
        .catch(() => { /* genegeerd: zonder meting tonen we gewoon niets */ });
    };
    measure();
    const off = onStorageChange(() => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(measure, 3000);
    });
    return () => {
      alive = false;
      off();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  // Volgorde: verlies gaat vóór dreigend verlies, dat gaat vóór een tip.
  const severe = notice?.severe ? notice : null;
  const show = severe ?? (criticalPct !== null ? 'quota' : null) ?? notice;
  if (!show) return null;

  const isSevere = show !== 'quota' && show.severe;
  const text =
    show === 'quota'
      ? `De opslag van dit toestel is voor ${formatPct(criticalPct ?? 0)} vol. Bewaren kan binnenkort mislukken — exporteer je materiaal en ruim oude inzendingen op.`
      : show.message;
  // Het icoon is versiering; de betekenis moet uit het woord ervoor blijken.
  const label = isSevere ? 'Niet bewaard:' : show === 'quota' ? 'Opslag bijna vol:' : 'Back-uptip:';
  const BarIcon = isSevere ? TriangleAlert : HardDriveDownload;

  const dismiss = () => {
    if (show === 'quota') {
      rememberDismissedPct(criticalPct ?? 0);
      setCriticalPct(null);
      return;
    }
    if (show.kind === 'persist-denied') clearBackupHint();
    setNotice(null);
  };

  return (
    <div
      className={`storage-bar${isSevere ? ' storage-bar-severe' : ''}`}
      role={isSevere ? 'alert' : 'status'}
    >
      <BarIcon size={20} className="storage-bar-icon" />
      <p>
        <strong>{label}</strong> {text}
      </p>
      <Link to="/privacy" className="btn btn-sm btn-ghost">Opslag bekijken</Link>
      <button
        className="btn btn-sm btn-quiet btn-icon"
        onClick={dismiss}
        aria-label="Deze melding sluiten"
        title="Sluiten"
      >
        <X size={18} />
      </button>
    </div>
  );
}

// Eigen opmaak voor de balk (staat niet in global.css, dat blijft ongemoeid).
const BAR_CSS = `
.storage-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 22px; font-size: 0.92rem;
  background: var(--warn-soft); color: var(--text);
  border-bottom: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
}
.storage-bar-severe {
  background: var(--err-soft);
  border-bottom-color: color-mix(in srgb, var(--err) 45%, transparent);
}
.storage-bar p { margin: 0; flex: 1; min-width: 220px; }
.storage-bar-icon { flex: none; color: var(--warn-text); }
.storage-bar-severe .storage-bar-icon { color: var(--err-text); }
@media print { .storage-bar { display: none !important; } }
@media (max-width: 640px) { .storage-bar { padding: 8px 12px; } }
`;

// ── Navigatie ───────────────────────────────────────────────────────────────
// Vijf vaste plekken, in de volgorde van het werk: maken, delen, opvolgen.
// Leerplannen horen bij het materiaal, het inleverpunt bij de klassen.

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Welke paden deze plek actief maken. */
  match: (path: string) => boolean;
}

const MATERIAL_PATHS = ['/widgets', '/cursussen', '/leerplannen', '/nieuw', '/importeren'];

const NAV: NavItem[] = [
  { to: '/', label: 'Start', Icon: House, match: (p) => p === '/' },
  { to: '/widgets', label: 'Materiaal', Icon: Library, match: (p) => MATERIAL_PATHS.some((m) => p.startsWith(m)) },
  { to: '/klassen', label: 'Klassen', Icon: Users, match: (p) => p.startsWith('/klassen') || p.startsWith('/klas/') || p.startsWith('/inleverpunt') },
  { to: '/resultaten', label: 'Resultaten', Icon: ChartColumn, match: (p) => p.startsWith('/resultaten') || p.startsWith('/cursus/volg') },
  { to: '/ai-studio', label: 'AI-studio', Icon: Sparkles, match: (p) => p.startsWith('/ai-') },
];

const NEW_ITEMS: MenuItem[] = [
  { label: 'Widget', hint: 'Oefening, spel of hulpmiddel · 38 soorten', Icon: Shapes, to: '/nieuw' },
  { label: 'Met AI, uit je leerstof', hint: 'Plak tekst of kies een pdf', Icon: Sparkles, to: '/ai-studio' },
  { label: 'Cursus', hint: 'Hoofdstukken met uitleg en oefeningen', Icon: BookOpen, to: '/cursussen?nieuw=1' },
  { label: 'Klas', hint: 'Klaslijst en één link voor je leerlingen', Icon: Users, to: '/klassen?nieuw=1' },
  { label: 'Leerplan', hint: 'Doelen waar je materiaal aan hangt', Icon: ListTree, to: '/leerplannen?nieuw=1' },
  { label: 'Pdf of Word omzetten', hint: 'Wordt een cursus die je kan bijwerken', Icon: FileUp, to: '/importeren', separator: true },
];

/** Aantal inzendingen met open vragen die de leerkracht nog moet beoordelen. */
function useToGrade(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(getSubmissions().filter((s) => s.status === 'submitted').length);
    count();
    return onStorageChange(count);
  }, []);
  return n;
}

function NavBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="nav-badge" aria-hidden="true">{n > 99 ? '99+' : n}</span>
  );
}

function navLabel(item: NavItem, toGrade: number) {
  return item.to === '/resultaten' && toGrade > 0
    ? `${item.label}, ${toGrade} ${toGrade === 1 ? 'inzending' : 'inzendingen'} na te kijken`
    : undefined;
}

/** De lade op smalle schermen: dezelfde plekken, plus wat op desktop onder "Meer" zit. */
function NavDrawer({
  path, toGrade, more, onClose,
}: { path: string; toGrade: number; more: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = Array.from(ref.current.querySelectorAll<HTMLElement>('a, button'));
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu" ref={ref}>
        <div className="drawer-head">
          <span className="topbar-logo" aria-hidden="true">
            <BrandMark size={28} />
            <span className="wordmark">Booster<b>z</b></span>
          </span>
          <button type="button" className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Menu sluiten">
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Hoofdnavigatie" className="drawer-nav">
          {NAV.map((item) => {
            const active = item.match(path);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`drawer-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={navLabel(item, toGrade)}
                onClick={onClose}
              >
                <item.Icon size={20} />
                <span>{item.label}</span>
                {item.to === '/resultaten' && <NavBadge n={toGrade} />}
              </Link>
            );
          })}
          <Link
            to="/inleverpunt"
            className={`drawer-link${path.startsWith('/inleverpunt') ? ' active' : ''}`}
            aria-current={path.startsWith('/inleverpunt') ? 'page' : undefined}
            onClick={onClose}
          >
            <Inbox size={20} />
            <span>Inleverpunt</span>
          </Link>
        </nav>
        <div className="drawer-sep" />
        <div className="drawer-more">
          {more.map((item, i) =>
            item.to ? (
              <Link key={i} to={item.to} className="drawer-link drawer-link-soft" onClick={onClose}>
                {item.Icon && <item.Icon size={19} />}
                <span>{item.label}</span>
              </Link>
            ) : (
              <button key={i} type="button" className="drawer-link drawer-link-soft" onClick={item.onSelect}>
                {item.Icon && <item.Icon size={19} />}
                <span>{item.label}</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** Tabbladen van het materiaal: widgets, cursussen en leerplannen horen samen. */
function MaterialTabs() {
  const tabs: { to: string; label: string; Icon: LucideIcon }[] = [
    { to: '/widgets', label: 'Widgets', Icon: Shapes },
    { to: '/cursussen', label: 'Cursussen', Icon: BookOpen },
    { to: '/leerplannen', label: 'Leerplannen', Icon: ListTree },
  ];
  return (
    <nav className="subnav" aria-label="Materiaal">
      <div className="subnav-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `subnav-link${isActive ? ' active' : ''}`}>
            <t.Icon size={17} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Layout() {
  const [theme, setTheme] = useState<ThemeMode>(getPrefs().theme);
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  const toGrade = useToGrade();
  const ThemeIcon = THEME_ICON[theme];

  // Lade sluiten bij elke navigatie (ook via terugknop van de browser).
  useEffect(() => { setDrawer(false); }, [pathname]);
  // Stabiele functie: de lade zet zijn focus-effect niet opnieuw op bij elke render.
  const closeDrawer = useCallback(() => setDrawer(false), []);

  // Voorbeeldinhoud is puur leerkrachtmateriaal: ze hoort thuis in deze schil,
  // niet in App.tsx. Een leerling die met een code of klaslink binnenkomt
  // (/speel, /meedoen, /leerling/…) laadt deze Layout nooit en krijgt de
  // voorbeeldwidgets en -klas dus ook nooit ongevraagd op zijn toestel. Lui
  // geladen en één keer per bezoek aan de leerkrachtschil.
  useEffect(() => {
    void import('../lib/seed').then((m) => m.seedIfEmpty());
  }, []);

  const more: MenuItem[] = useMemo(() => [
    { label: 'Ik ben leerling', hint: 'Een code of klaslink openen', Icon: GraduationCap, to: '/meedoen' },
    { label: 'Hulp', hint: 'Aan de slag en veelgestelde vragen', Icon: LifeBuoy, to: '/hulp' },
    { label: 'AI-instellingen', hint: 'Je eigen sleutel en model', Icon: KeyRound, to: '/ai-instellingen' },
    { label: 'Privacy en opslag', hint: 'Back-up, export en opruimen', Icon: ShieldCheck, to: '/privacy' },
    {
      label: `Thema: ${THEME_LABEL[theme]}`, Icon: ThemeIcon, keepOpen: true, separator: true,
      onSelect: () => setTheme(cycleTheme()),
    },
  ], [theme, ThemeIcon]);

  const showMaterialTabs = ['/widgets', '/cursussen', '/leerplannen'].includes(pathname);

  return (
    <div className="appshell">
      <style>{BAR_CSS}</style>
      {/* In een hash-router is "#main" een route, geen anker: zelf de focus verplaatsen. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          const m = document.getElementById('main');
          m?.focus();
          m?.scrollIntoView();
        }}
      >
        Naar de inhoud
      </a>
      <header className="topbar">
        <Link to="/" className="topbar-logo" aria-label={`${BRAND}, startpagina`}>
          <BrandMark size={32} />
          <span className="wordmark">Booster<b>z</b></span>
        </Link>
        <nav aria-label="Hoofdnavigatie" className="topnav">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
                aria-label={navLabel(item, toGrade)}
              >
                <item.Icon size={18} />
                <span>{item.label}</span>
                {item.to === '/resultaten' && <NavBadge n={toGrade} />}
              </Link>
            );
          })}
        </nav>
        <div className="topbar-spacer" />
        <Link
          to="/inleverpunt"
          className={`btn btn-quiet btn-icon topbar-wide${pathname.startsWith('/inleverpunt') ? ' is-active' : ''}`}
          aria-label="Inleverpunt: codes van leerlingen binnenhalen"
          title="Inleverpunt: codes van leerlingen binnenhalen"
        >
          <Inbox size={20} />
        </Link>
        <MenuButton
          items={NEW_ITEMS}
          label="Nieuw"
          Icon={Plus}
          className="btn btn-primary topbar-new"
          labelClassName="topbar-new-label"
          ariaLabel="Nieuw maken"
        />
        <span className="topbar-wide">
          <MenuButton items={more} Icon={Ellipsis} ariaLabel="Meer" className="btn btn-quiet btn-icon" />
        </span>
        <button
          type="button"
          className="btn btn-quiet btn-icon topbar-narrow"
          aria-label="Menu openen"
          aria-expanded={drawer}
          onClick={() => setDrawer(true)}
        >
          <MenuIcon size={22} />
        </button>
      </header>
      {drawer && <NavDrawer path={pathname} toGrade={toGrade} more={more} onClose={closeDrawer} />}
      <StorageBar />
      <main id="main" tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', outline: 'none' }}>
        {showMaterialTabs && <MaterialTabs />}
        <Outlet />
      </main>
    </div>
  );
}
