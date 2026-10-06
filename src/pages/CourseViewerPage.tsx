import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Circle, CircleCheck, CircleDot, Inbox, Menu as MenuIcon, RefreshCw, StickyNote, Target, User, X,
} from 'lucide-react';
import type { Course, CourseProgress, CourseSection } from '../lib/courseTypes';
import { allSections, progressPercent } from '../lib/courseTypes';
import type { DecodedCourse, SharedLinkQuestion } from '../lib/courses';
import {
  adoptSharedCourse, adoptSharedLinkUpdate, decodeCourseFromParam, encodeCourseProgress,
  getCourse, getCourseByCode, getStudentProgress, mergeProgressRecords,
  saveStudentProgress, sharedLinkQuestion, startProgress, touchSection,
} from '../lib/courses';
import { readableAccent } from '../lib/color';
import { hasUnresolvedMedia, onMediaChange } from '../lib/mediaStore';
import { clearStudentContext, getStudentContext } from '../lib/studentContext';
import { downloadFile, formatDate } from '../lib/utils';
import { BlockRenderer } from '../components/course/BlockRenderer';
import { leerlingBlokken } from '../components/course/emptyBlock';
import { CodeQr } from '../components/CodeQr';
import { EmptyState } from '../components/ui';
import { A11yMenu, loadA11y } from '../components/A11yMenu';
import {
  CheckIcon, CourseIcon, DownloadIcon, PrivacyIcon, QrIcon, SearchIcon, WarningIcon,
} from '../components/icons';
import '../styles/leerling.css';
import '../styles/cursus.css';

// ── /cursus/open?d=… — gedeelde link openen ─────────────────────────────────

/** Zoveel oefeningen noemt de vraag bij naam; de rest als telling. */
const MAX_GENOEMD = 5;

/** De lokale code na het overnemen: een cursus die bleef staan, kan een andere code hebben. */
function leesRoute(courseId: string, linkCode: string): string {
  return '/cursus/lees/' + (getCourse(courseId)?.code ?? linkCode);
}

export function CourseOpenPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [invalid, setInvalid] = useState(false);
  // Opslag vol en de cursus staat hier (nog) niet: eerlijk zeggen in plaats
  // van naar een lezer te sturen die "niet gevonden" toont.
  const [vol, setVol] = useState(false);
  // Staat de cursus of een oefening uit de link hier al als eigen werk, in
  // een andere versie? Dan eerst vragen, en de vraag noemt alles wat
  // "bijwerken" zou vervangen (S3). Een ongewijzigde kopie uit een eerdere
  // link of een klaspakket wordt stil bijgewerkt (LL3); een bestand of het
  // voorbeeld telt als eigen werk (S1). Iedereen met de link kan er één
  // namaken: eigen werk stil overschrijven is dus uit den boze.
  const [pending, setPending] = useState<{ decoded: DecodedCourse; question: SharedLinkQuestion; localTitle: string } | null>(null);

  useEffect(() => {
    const d = params.get('d');
    const decoded = d ? decodeCourseFromParam(d) : null;
    if (!decoded) {
      setInvalid(true);
      return;
    }
    let alive = true;
    const existing = getCourse(decoded.course.id);
    // Vergelijken is async: lokale media staan als blob:-URL, die in de link
    // als data-URL (lib/mediaStore). Bij een gedeeltelijke link tellen alleen
    // de meegestuurde hoofdstukken. De meereizende oefeningen tellen ook mee.
    const vraag: Promise<SharedLinkQuestion | null> = existing
      ? sharedLinkQuestion(
          decoded.course,
          decoded.partial ? decoded.course.chapters.map((ch) => ch.id) : undefined,
          decoded.widgets,
        )
      : Promise.resolve(null);
    // Kon er niet vergeleken worden: vragen over de cursus. "Bijwerken"
    // vervangt dan alleen de cursus; eigen oefeningen blijven staan.
    void vraag.catch((): SharedLinkQuestion => ({ course: true, widgets: [] })).then((question) => {
      if (!alive) return;
      if (existing && question) {
        setPending({ decoded, question, localTitle: existing.title });
        return;
      }
      // Ook bij identieke inhoud adopteren: zo reizen ontbrekende widgets mee
      // (bv. een lokaal verwijderde oefening wordt hersteld).
      const res = adoptSharedCourse(decoded.course, decoded.widgets, { partial: decoded.partial, gedeeld: true });
      if (!res.ok && !getCourse(decoded.course.id)) {
        setVol(true);
        return;
      }
      navigate(leesRoute(decoded.course.id, decoded.course.code), { replace: true });
    });
    return () => { alive = false; };
  }, [params, navigate]);

  const accept = () => {
    if (!pending) return;
    const res = adoptSharedLinkUpdate(pending.decoded, pending.question);
    if (!res.ok && !getCourse(pending.decoded.course.id)) {
      setPending(null);
      setVol(true);
      return;
    }
    navigate(leesRoute(pending.decoded.course.id, pending.decoded.course.code), { replace: true });
  };
  const keepLocal = () => {
    if (!pending) return;
    navigate(leesRoute(pending.decoded.course.id, pending.decoded.course.code), { replace: true });
  };

  return (
    <div className="player-shell" style={{ minHeight: '100vh' }}>
      <main id="main" className="player-main" style={{ maxWidth: 560 }}>
        {invalid ? (
          // Voor een leerling is de startpagina van de leerkrachtschil geen bestemming:
          // die zaait voorbeeldmateriaal. De start voor leerlingen is "Code invoeren".
          <EmptyState icon={<WarningIcon size={40} />} title="Deze cursuslink werkt niet" level={1}>
            <p>
              De link is onvolledig of beschadigd (misschien is hij afgebroken bij het kopiëren).
              Vraag je leerkracht om een nieuwe deellink.
            </p>
            <Link to="/meedoen" className="btn btn-primary">Code invoeren</Link>
          </EmptyState>
        ) : vol ? (
          <EmptyState icon={<WarningIcon size={40} />} title="Deze cursus kon niet bewaard worden" level={1}>
            <p>
              De opslag van dit toestel is vol, dus de cursus kan hier niet geopend worden. Maak ruimte
              (bijvoorbeeld een oude cursus verwijderen) en open de link opnieuw, of vraag je leerkracht om hulp.
            </p>
            <Link to="/meedoen" className="btn btn-primary">Code invoeren</Link>
          </EmptyState>
        ) : pending ? (
          <LinkVraag
            decoded={pending.decoded}
            question={pending.question}
            localTitle={pending.localTitle}
            onAccept={accept}
            onKeep={keepLocal}
          />
        ) : (
          <>
            <h1 className="sr-only">Cursus wordt geopend</h1>
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--brand)' }} aria-hidden><CourseIcon size={42} /></div>
              <p style={{ color: 'var(--text-soft)' }}>Cursus wordt geopend…</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * De vraag vóór een link iets vervangt. Eerlijk: ze noemt de cursus als die
 * zelf verandert, en elke oefening die "bijwerken" zou vervangen (S3).
 * Leerlingscherm: "oefening", nooit "widget".
 */
function LinkVraag({ decoded, question, localTitle, onAccept, onKeep }: {
  decoded: DecodedCourse;
  question: SharedLinkQuestion;
  /** Titel van de cursus op dit toestel. */
  localTitle: string;
  onAccept: () => void;
  onKeep: () => void;
}) {
  const n = question.widgets.length;
  const genoemd = question.widgets.slice(0, MAX_GENOEMD);
  const rest = n - genoemd.length;
  const titel = question.course ? 'Cursus bijwerken?' : n === 1 ? 'Oefening bijwerken?' : 'Oefeningen bijwerken?';
  let overOefeningen = '';
  if (n > 0 && question.course) {
    overOefeningen = n === 1 ? ' Ook deze oefening staat hier al, in een andere versie:' : ' Ook deze oefeningen staan hier al, in een andere versie:';
  } else if (n > 0) {
    overOefeningen = n === 1 ? ' De link bevat een andere versie van deze oefening:' : ' De link bevat een andere versie van deze oefeningen:';
  }
  return (
    <div className="card card-pad" style={{ maxWidth: 480, margin: '60px auto 0', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--brand)' }} aria-hidden><RefreshCw size={42} /></div>
      <h1 style={{ fontSize: '1.3rem' }}>{titel}</h1>
      <p style={{ color: 'var(--text-soft)' }}>
        {question.course ? (
          <>
            Deze link bevat {decoded.partial ? 'een deel van' : 'een andere versie van'} de cursus{' '}
            <strong>“{localTitle}”</strong>
            {decoded.course.title !== localTitle && <> (in de link: “{decoded.course.title}”)</>}, die al op dit toestel staat.
          </>
        ) : (
          <>De cursus <strong>“{localTitle}”</strong> staat al op dit toestel.</>
        )}
        {overOefeningen}
      </p>
      {n > 0 && (
        <ul
          aria-label="Oefeningen die zouden veranderen"
          style={{ textAlign: 'left', margin: '0 0 14px', paddingLeft: 22, overflowWrap: 'anywhere' }}
        >
          {genoemd.map((c) => (
            <li key={c.id}>
              <strong>“{c.localTitle}”</strong>
              {c.title !== c.localTitle && <> (in de link: “{c.title}”)</>}
            </li>
          ))}
          {rest > 0 && <li>en nog {rest} {rest === 1 ? 'andere oefening' : 'andere oefeningen'}</li>}
        </ul>
      )}
      <p style={{ color: 'var(--text-soft)' }}>
        Kies je bijwerken, dan komt de versie uit de link in de plaats.
        Je leesvoortgang blijft in beide gevallen bewaard.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <button className="btn btn-primary" onClick={onAccept}><CheckIcon size={16} aria-hidden /> Bijwerken en openen</button>
        <button className="btn btn-ghost" onClick={onKeep}>Huidige versie behouden en openen</button>
      </div>
    </div>
  );
}

// ── /cursus/lees/:code — leerling-viewer ────────────────────────────────────

export function CourseViewerPage() {
  const { code } = useParams();
  // "Als leerling" vanuit de editor: #/cursus/lees/CODE?voorbeeld=1. De lezer
  // bewaart dan niets (geen voortgang, notities of naam) en de oefeningen
  // draaien in voorbeeldmodus.
  const [params] = useSearchParams();
  const preview = params.get('voorbeeld') === '1';
  // Eén keer lezen (zie PlayerPage): alleen opnieuw wanneer er nog een
  // media-verwijzing openstaat die pas later oplost.
  const [mediaTick, setMediaTick] = useState(0);
  // mediaTick is een bewuste herlees-trigger, geen echte afhankelijkheid
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const course = useMemo(() => (code ? getCourseByCode(code) : undefined), [code, mediaTick]);
  useEffect(() => {
    if (!course || !hasUnresolvedMedia(course)) return;
    return onMediaChange(() => setMediaTick((t) => t + 1));
  }, [course]);

  if (!course) return <CourseNotFound code={code} />;
  // key: bij een andere cursuscode volledig opnieuw beginnen
  return <CourseReader key={`${course.id}:${preview ? 'voorbeeld' : 'les'}`} course={course} preview={preview} />;
}

function CourseNotFound({ code }: { code?: string }) {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  const open = () => {
    if (draft.trim()) navigate('/cursus/lees/' + draft.trim().toUpperCase());
  };
  return (
    <div className="player-shell" style={{ minHeight: '100vh' }}>
      <main id="main" className="player-main" style={{ maxWidth: 560 }}>
        <EmptyState icon={<SearchIcon size={40} />} title="Cursus niet gevonden" level={1}>
          <p>
            Er staat geen cursus met code{' '}
            <strong style={{ fontFamily: 'monospace' }}>{code}</strong> op dit toestel.<br />
            Controleer de code, of vraag je leerkracht om de <em>deellink</em> — daarmee reist de
            cursus (met oefeningen) automatisch mee.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <input
              className="input"
              style={{ maxWidth: 180, textTransform: 'uppercase', fontFamily: 'monospace' }}
              value={draft}
              placeholder="bv. K7P2QD"
              aria-label="Cursuscode"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
            />
            <button className="btn btn-primary" disabled={!draft.trim()} onClick={open}>Openen</button>
          </div>
        </EmptyState>
      </main>
    </div>
  );
}

// ── De eigenlijke lezer ─────────────────────────────────────────────────────

const NAME_KEY_PREFIX = 'wf.coursename.';

// ── Leerlingnotities (privé, alleen op dit toestel; NIET in de voortgangscode)

const NOTES_KEY_PREFIX = 'wf.coursenotes.';

/** Opslagvorm: leerlingnaam (kleine letters) → sectie-id → notitietekst. */
type CourseNotesStore = Record<string, Record<string, string>>;

function readCourseNotes(courseId: string): CourseNotesStore {
  try {
    const raw = localStorage.getItem(NOTES_KEY_PREFIX + courseId);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CourseNotesStore;
    }
  } catch { /* beschadigde of onbeschikbare opslag → leeg beginnen */ }
  return {};
}

// Een sectie-id of leerlingnaam kan "__proto__" of "constructor" heten (een beschadigd
// of geknutseld bestand, of een leerling die dat typt). Op een gewoon object geeft
// `obj[naam]` dan het prototype terug (en crasht `.trim()`), en `obj[naam] = x` doet
// niets. Alleen eigen eigenschappen tellen mee.
const heeftEigen = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** Notitietekst van een sectie ('' als er geen eigen notitie is). */
function noteOf(notes: Record<string, string>, sid: string): string {
  if (!heeftEigen(notes, sid)) return '';
  const txt = notes[sid];
  return typeof txt === 'string' ? txt : '';
}

/** Eigen waarde van een opzoektabel op id (nooit iets uit het prototype). */
function eigenOf<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj && heeftEigen(obj, key) ? obj[key] : undefined;
}

/** Zet een eigen eigenschap, ook met de naam "__proto__". */
function zetEigen<T>(obj: Record<string, T>, key: string, value: T) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function writeCourseNotes(courseId: string, store: CourseNotesStore) {
  try {
    localStorage.setItem(NOTES_KEY_PREFIX + courseId, JSON.stringify(store));
  } catch (e) {
    console.error('Notities bewaren mislukt (localStorage vol?)', e);
  }
}

/** Alle doorzoekbare tekst van een sectie (titel + blokinhoud), in kleine letters. */
function sectionText(section: CourseSection): string {
  const parts: string[] = [section.title];
  for (const b of section.blocks) {
    switch (b.type) {
      case 'heading': parts.push(b.text); break;
      case 'text': parts.push(b.markdown); break;
      case 'callout': parts.push(b.title ?? '', b.text); break;
      case 'quote': parts.push(b.text); break;
      case 'accordion': for (const it of b.items) parts.push(it.title, it.text); break;
      case 'columns': parts.push(b.left, b.right); break;
      case 'table': for (const row of b.rows) parts.push(...row); break;
      case 'terms': for (const it of b.items) parts.push(it.term, it.uitleg); break;
      case 'checklist': for (const it of b.items) parts.push(it.text); break;
      default: break; // media/divider/widget: geen doorzoekbare tekst
    }
  }
  return parts.join('\n').toLocaleLowerCase('nl');
}

function useIsNarrow(px = 920): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${px}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [px]);
  return narrow;
}

function CourseReader({ course, preview }: { course: Course; preview: boolean }) {
  const flat = useMemo(() => allSections(course), [course]);
  const nameKey = NAME_KEY_PREFIX + course.id;

  // Leest deze leerling onder een klasidentiteit (klaslink/klaspakket)? Dan
  // hoeft hij zijn naam niet te typen én draagt zijn voortgang classId en
  // studentId mee — ook in de voortgangscode die hij later doorgeeft.
  // In het voorbeeld voor de leerkracht ("Als leerling") telt een eventuele klasidentiteit niet mee.
  const [studentCtx, setStudentCtx] = useState(() => (preview ? null : getStudentContext()));
  const [name, setName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [a11y, setA11y] = useState(loadA11y);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const progressRef = useRef<CourseProgress | null>(null);
  const sectionIdRef = useRef<string | null>(null);
  sectionIdRef.current = sectionId;
  const lastSaveRef = useRef(Date.now());
  const narrow = useIsNarrow();
  // ☰-knop van de mobiele lade: de focus keert hierheen terug bij het sluiten.
  const navToggleRef = useRef<HTMLButtonElement | null>(null);

  // ── Mijn notities: per leerlingnaam, per sectie ──────────────────────────
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteSaved, setNoteSaved] = useState(false);
  const notesRef = useRef<Record<string, string>>({});
  const notesKeyRef = useRef(''); // leerlingnaam in kleine letters
  const noteDirtyRef = useRef<Set<string>>(new Set()); // sectie-id's die dít tabblad wijzigde
  const noteTimerRef = useRef<number | null>(null);
  const savedHintTimerRef = useRef<number | null>(null);

  /** Schrijft openstaande notitiewijzigingen meteen naar localStorage. */
  const flushNotes = () => {
    if (noteTimerRef.current !== null) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    const dirty = noteDirtyRef.current;
    if (dirty.size === 0) return;
    noteDirtyRef.current = new Set();
    // Voorbeeld voor de leerkracht: notities blijven op het scherm, niet in de opslag.
    if (preview) return;
    const key = notesKeyRef.current;
    if (!key) return;
    // Vers lezen en alléén de secties toepassen die dít tabblad wijzigde,
    // zodat een tweede tabblad/iframe elkaars notities niet overschrijft.
    const store = readCourseNotes(course.id);
    const existing = heeftEigen(store, key) ? store[key] : undefined;
    const mine: Record<string, string> =
      existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
    for (const sid of dirty) {
      const txt = noteOf(notesRef.current, sid);
      if (txt.trim() !== '') zetEigen(mine, sid, txt);
      else delete mine[sid];
    }
    if (Object.keys(mine).length > 0) zetEigen(store, key, mine);
    else delete store[key];
    writeCourseNotes(course.id, store);
  };
  const flushNotesRef = useRef(flushNotes);
  flushNotesRef.current = flushNotes;

  // Notities (her)laden zodra de naam bekend is; andere naam = andere notities.
  useEffect(() => {
    flushNotesRef.current(); // eerst openstaande notities van de vorige naam bewaren
    const key = name.trim().toLocaleLowerCase('nl');
    notesKeyRef.current = key;
    const all = preview ? {} : readCourseNotes(course.id);
    const stored = key && heeftEigen(all, key) ? all[key] : undefined;
    const clean: Record<string, string> = {};
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [sid, txt] of Object.entries(stored)) {
        if (typeof txt === 'string' && txt !== '') zetEigen(clean, sid, txt);
      }
    }
    notesRef.current = clean;
    setNotes(clean);
  }, [name, course.id, preview]);

  // "✓ bewaard"-hintje netjes opruimen bij unmount.
  useEffect(() => () => {
    if (savedHintTimerRef.current !== null) window.clearTimeout(savedHintTimerRef.current);
  }, []);

  const changeNote = (sid: string, text: string) => {
    const next = { ...notesRef.current };
    zetEigen(next, sid, text);
    notesRef.current = next;
    setNotes(next);
    noteDirtyRef.current.add(sid);
    // Debounce: pas 600 ms na de laatste toetsaanslag bewaren.
    if (noteTimerRef.current !== null) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => {
      noteTimerRef.current = null;
      flushNotesRef.current();
      if (preview) return; // niets bewaard, dus ook geen "bewaard"
      setNoteSaved(true);
      if (savedHintTimerRef.current !== null) window.clearTimeout(savedHintTimerRef.current);
      savedHintTimerRef.current = window.setTimeout(() => setNoteSaved(false), 1500);
    }, 600);
  };

  const exportNotes = () => {
    flushNotesRef.current();
    const lines: string[] = [
      `Mijn notities — ${course.title}`,
      `Leerling: ${name} · ${formatDate(Date.now())}`,
      '',
    ];
    for (const { chapter, section } of flat) {
      const txt = noteOf(notesRef.current, section.id).trim();
      if (!txt) continue;
      lines.push(`${chapter.title} › ${section.title}`);
      lines.push(txt);
      lines.push('');
    }
    downloadFile(`mijn-notities-${course.code}.txt`, lines.join('\n'), 'text/plain');
  };

  // ── Zoeken in de inhoudstafel ─────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('nl');
  const sectionTexts = useMemo(() => {
    const m = new Map<string, string>();
    for (const { section } of flat) m.set(section.id, sectionText(section));
    return m;
  }, [flat]);
  // null = niet aan het filteren (minder dan 2 tekens)
  const matchIds = useMemo(() => {
    if (q.length < 2) return null;
    const found = new Set<string>();
    for (const { section } of flat) {
      if ((sectionTexts.get(section.id) ?? '').includes(q)) found.add(section.id);
    }
    return found;
  }, [q, flat, sectionTexts]);

  /**
   * Bewaart de voortgang zonder verlies: eerst samenvoegen met wat er
   * intussen in de opslag staat (tweede tabblad, geïmporteerde
   * voortgangscode), en het samengevoegde record wordt de nieuwe waarheid.
   */
  const persist = () => {
    const p = progressRef.current;
    if (!p) return;
    // Voorbeeld voor de leerkracht: de stand leeft alleen in dit scherm.
    if (preview) return;
    const stored = getStudentProgress(p.courseId, p.studentName);
    const merged = stored ? mergeProgressRecords(stored, p) : p;
    // Klasidentiteit van dít tabblad behouden: mergeProgressRecords vertrekt
    // van het bewaarde record, dat nog van vóór de klaslink kan zijn.
    if (p.classId) merged.classId = p.classId;
    if (p.studentId) merged.studentId = p.studentId;
    // de bedoeling van dít tabblad wint voor "waar was ik?" …
    merged.lastSectionId = p.lastSectionId ?? merged.lastSectionId;
    // … en voor de checklist van de sectie die hier open staat (anders zou
    // een uitgevinkt item via de unie meteen weer aangevinkt raken)
    const sid = sectionIdRef.current;
    const mijnSectie = sid ? eigenOf(p.sections, sid) : undefined;
    const bewaardeSectie = sid ? eigenOf(merged.sections, sid) : undefined;
    if (sid && mijnSectie && bewaardeSectie) {
      zetEigen(merged.sections, sid, { ...bewaardeSectie, checks: mijnSectie.checks });
    }
    progressRef.current = merged;
    saveStudentProgress(merged);
    lastSaveRef.current = Date.now();
  };

  const begin = (studentName: string) => {
    const n = studentName.trim() || 'Anoniem';
    if (!preview) {
      try { localStorage.setItem(nameKey, n); } catch { /* best effort */ }
    }
    // Voorbeeld: altijd een verse stand, nooit die van een echte leerling met dezelfde naam.
    const p: CourseProgress = preview
      ? { courseId: course.id, courseCode: course.code, studentName: n, sections: {}, lastSeenAt: Date.now(), startedAt: Date.now() }
      : startProgress(course, n);
    if (studentCtx) {
      p.classId = studentCtx.classId;
      if (studentCtx.studentId) p.studentId = studentCtx.studentId;
    }
    progressRef.current = p;
    // Verder lezen waar je was — anders bij de eerste sectie beginnen
    const startId =
      p.lastSectionId && flat.some((x) => x.section.id === p.lastSectionId)
        ? p.lastSectionId
        : flat[0]?.section.id ?? null;
    if (startId) {
      touchSection(p, startId);
      p.lastSectionId = startId;
    }
    persist();
    setName(n);
    setSectionId(startId);
  };

  // Automatisch starten: naam al bekend van vorige keer, of geen naam vereist
  useEffect(() => {
    if (progressRef.current) return;
    if (preview) { begin('Voorbeeld'); return; }
    let stored: string | null = null;
    try { stored = localStorage.getItem(nameKey); } catch { /* geen opslag */ }
    if (studentCtx) begin(studentCtx.studentName);
    else if (stored && stored.trim()) begin(stored);
    else if (!course.settings.requireName) begin('Anoniem');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kijktijd bijhouden: elke 5 s optellen zolang het tabblad zichtbaar is,
  // throttled bewaren (elke 15 s en bij sectiewissel/unmount/pagehide).
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (!sectionId) return;
    const iv = setInterval(() => {
      const p = progressRef.current;
      const sid = sectionIdRef.current;
      if (!p || !sid || document.visibilityState !== 'visible') return;
      touchSection(p, sid).secondsSpent += 5;
      if (Date.now() - lastSaveRef.current >= 15000) persistRef.current();
    }, 5000);
    return () => {
      clearInterval(iv);
      persistRef.current();
      // Sectiewissel/unmount: ook openstaande notities meteen wegschrijven.
      flushNotesRef.current();
    };
  }, [sectionId]);

  // Ook bij sluiten/verversen van het tabblad de laatste stand bewaren.
  useEffect(() => {
    const flush = () => {
      persistRef.current();
      flushNotesRef.current();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Mobiele lade open? Escape sluit ze, en de focus keert terug naar de ☰-knop.
  useEffect(() => {
    if (!(narrow && navOpen)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        navToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrow, navOpen]);

  /** Sluit de mobiele inhoudstafel-lade en zet de focus terug op de ☰-knop. */
  const closeNav = () => {
    setNavOpen(false);
    navToggleRef.current?.focus();
  };

  const goTo = (id: string) => {
    const p = progressRef.current;
    if (!p) return;
    touchSection(p, id);
    p.lastSectionId = id;
    persist();
    setSectionId(id);
    if (navOpen) closeNav(); // lade dicht op mobiel, mét focusherstel
    window.scrollTo({ top: 0 });
  };

  const toggleCheck = (blockId: string, itemId: string) => {
    const p = progressRef.current;
    if (!p || !sectionId) return;
    const sp = touchSection(p, sectionId);
    const checks = { ...(sp.checks ?? {}) };
    const cur = eigenOf(checks, blockId) ?? [];
    zetEigen(checks, blockId, cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId]);
    sp.checks = checks;
    persist();
    bump();
  };

  const markRead = () => {
    const p = progressRef.current;
    if (!p || !sectionId) return;
    touchSection(p, sectionId).completedAt = Date.now();
    persist();
    bump();
  };

  /** "Niet jij?" — eerst bewaren wat er staat, dan terug naar de naampoort. */
  const switchStudent = () => {
    persist();
    flushNotesRef.current();
    clearStudentContext();
    setStudentCtx(null);
    try { localStorage.removeItem(nameKey); } catch { /* geen opslag: niets te wissen */ }
    progressRef.current = null;
    setName('');
    setDraftName('');
    setSectionId(null);
  };

  const progress = progressRef.current;
  const accent = course.settings.accentColor;
  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    fontSize: a11y.scale !== 1 ? `${a11y.scale}em` : undefined,
    // Een te lichte accentkleur wordt donkerder, zodat tekst en knoppen leesbaar blijven (W15d).
    ['--player-accent' as string]: readableAccent(accent),
  } as React.CSSProperties;
  const shellClass = `player-shell ${a11y.calm ? 'calm' : ''} ${a11y.spacing ? 'spaced' : ''}`;

  // ── Naampoort ─────────────────────────────────────────────────────────────
  if (!progress || !name) {
    return (
      <div className={shellClass} style={shellStyle}>
        <main id="main" className="player-main" style={{ maxWidth: 520 }}>
          <div className="card card-pad" style={{ maxWidth: 480, margin: '40px auto 0', textAlign: 'center' }}>
            <div style={{ fontSize: '3.4rem' }} aria-hidden>{course.coverEmoji}</div>
            <h1 style={{ fontSize: '1.6rem', margin: '6px 0 2px' }}>{course.title}</h1>
            {course.subtitle && <p style={{ color: 'var(--text-soft)', margin: '0 0 4px' }}>{course.subtitle}</p>}
            {course.author && <p className="hint" style={{ margin: '0 0 14px' }}>door {course.author}</p>}
            <div className="field" style={{ textAlign: 'left' }}>
              <label htmlFor="course-student-name">Jouw naam</label>
              <input
                id="course-student-name"
                className="input"
                value={draftName}
                placeholder="Voornaam (volstaat)"
                autoFocus
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && draftName.trim()) begin(draftName); }}
              />
              <span className="hint">Zo kan je later verderlezen waar je gebleven was.</span>
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={!draftName.trim()}
              onClick={() => begin(draftName)}
            >
              <CourseIcon size={16} aria-hidden /> Start met lezen
            </button>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <PrivacyIcon size={13} aria-hidden /> Je voortgang blijft op dit toestel en is alleen voor jou en je leerkracht.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const cur = flat.find((x) => x.section.id === sectionId);
  const idx = flat.findIndex((x) => x.section.id === sectionId);
  const prev = idx > 0 ? flat[idx - 1] : undefined;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : undefined;
  const isLast = idx === flat.length - 1;
  const zichtbareBlokken = cur ? leerlingBlokken(cur.section.blocks) : [];
  const pctDone = progressPercent(course, progress);
  const progressCode = encodeCourseProgress(progress);
  const noteCount = flat.filter(({ section }) => noteOf(notes, section.id).trim() !== '').length;

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, height: '100%' }}>
      <div>
        <strong style={{ display: 'block', lineHeight: 1.35 }}>
          <span aria-hidden>{course.coverEmoji}</span> {course.title}
        </strong>
        {course.settings.showProgressToStudent && (
          <>
            <div
              className="progressbar"
              role="progressbar"
              aria-valuenow={pctDone}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Jouw voortgang in deze cursus"
              style={{ marginTop: 10 }}
            >
              <div style={{ width: `${pctDone}%` }} />
            </div>
            <span className="hint">{pctDone}% afgewerkt</span>
          </>
        )}
      </div>

      <div style={{ flex: 'none' }}>
        <input
          type="search"
          className="input input-sm"
          aria-label="Zoeken in de cursus"
          placeholder="Zoek in de cursus…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%' }}
        />
        <p className="hint" aria-live="polite" style={{ margin: matchIds ? '4px 0 0' : 0 }}>
          {matchIds
            ? matchIds.size === 0
              ? 'Niets gevonden.'
              : `${matchIds.size} ${matchIds.size === 1 ? 'resultaat' : 'resultaten'}`
            : ''}
        </p>
      </div>

      <nav aria-label="Inhoudstafel" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {course.chapters.map((ch) => {
          const visibleSections = matchIds
            ? ch.sections.filter((s) => matchIds.has(s.id))
            : ch.sections;
          if (matchIds && visibleSections.length === 0) return null;
          return (
          <div key={ch.id} style={{ marginBottom: 14 }}>
            <p
              style={{
                margin: '0 0 4px', fontWeight: 800, fontSize: '0.8rem',
                letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-soft)',
              }}
            >
              {ch.emoji && <span aria-hidden>{ch.emoji} </span>}{ch.title}
            </p>
            {visibleSections.map((s) => {
              const sp = eigenOf(progress.sections, s.id);
              const status = sp?.completedAt ? 'afgewerkt' : sp ? 'geopend' : 'nog niet gelezen';
              const StatusIcon = sp?.completedAt ? CircleCheck : sp ? CircleDot : Circle;
              const active = s.id === sectionId;
              const hasNote = noteOf(notes, s.id).trim() !== '';
              return (
                <button
                  key={s.id}
                  className="reader-toc-btn"
                  onClick={() => goTo(s.id)}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${s.title} — ${status}${hasNote ? ' — heeft notitie' : ''}`}
                  style={{
                    background: active ? 'var(--brand-soft)' : 'transparent',
                    color: active ? 'var(--brand)' : 'var(--text)',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <StatusIcon size={15} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {s.title}
                    {hasNote && (
                      <StickyNote size={13} aria-label="heeft notitie" role="img" style={{ marginLeft: 5, verticalAlign: '-2px' }} />
                    )}
                    {s.optional && (
                      <span style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}> · keuze</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          );
        })}
      </nav>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <A11yMenu value={a11y} onChange={setA11y} />
      </div>
      {studentCtx && (
        <div className="card" style={{ padding: '10px 14px', flex: 'none' }}>
          <p className="hint" style={{ margin: 0 }}>
            Je leest als <strong>{studentCtx.studentName}</strong> uit {studentCtx.className}.
          </p>
          <button className="btn btn-sm btn-quiet" style={{ marginTop: 4 }} onClick={switchStudent}>
            Niet jij? Wissel.
          </button>
        </div>
      )}
      {!preview && (
        <div className="card" style={{ padding: '12px 14px', flex: 'none' }}>
          <strong style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <QrIcon size={16} aria-hidden /> Voortgangscode
          </strong>
          <p className="hint" style={{ margin: '4px 0 8px' }}>
            Werk je op je eigen toestel? Toon deze code aan je leerkracht (scannen) of kopieer ze.
          </p>
          <CodeQr value={progressCode} label="jouw leesvoortgang" size={140} copyLabel="Code kopiëren" />
        </div>
      )}
      {noteCount > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ flex: 'none' }} onClick={exportNotes}>
          <DownloadIcon size={15} aria-hidden /> Mijn notities exporteren
        </button>
      )}
    </div>
  );

  return (
    <div className={shellClass} style={shellStyle}>
      <header className="player-topbar">
        <div className="player-topbar-row1">
          {narrow && (
            <button
              ref={navToggleRef}
              className="btn btn-quiet btn-icon"
              aria-label={navOpen ? 'Inhoudstafel verbergen' : 'Inhoudstafel tonen'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <MenuIcon size={20} aria-hidden />
            </button>
          )}
          {course.settings.showProgressToStudent && (
            <span className="player-chip chip-brand" aria-label={`Voortgang: ${pctDone} procent`}>{pctDone}%</span>
          )}
          {preview
            ? <span className="player-chip chip-warn">Voorbeeld: niets bewaard</span>
            : <span className="player-chip"><User size={12} aria-hidden /> {name}</span>}
          <span className="sp" />
          {studentCtx && (
            <Link to={`/leerling/${studentCtx.classCode}`} className="btn btn-sm btn-ghost">
              Mijn klas
            </Link>
          )}
        </div>
        <div className="player-topbar-row2">
          <span aria-hidden style={{ fontSize: '1.3rem' }}>{course.coverEmoji}</span>
          <span className="title">{course.title}</span>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch', minHeight: 0 }}>
        {/* Inhoudstafel: vast paneel op breed scherm, uitklapbaar op mobiel */}
        {narrow ? (
          navOpen && (
            <>
              <div
                onClick={closeNav}
                aria-hidden
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
              />
              <aside
                aria-label="Inhoudstafel en instellingen"
                style={{
                  position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(320px, 85vw)',
                  zIndex: 51, overflowY: 'auto', background: 'var(--bg-raised)',
                  borderRight: '1px solid var(--line)', boxShadow: 'var(--shadow-3)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                  <button className="btn btn-quiet btn-icon" aria-label="Inhoudstafel sluiten" onClick={closeNav}><X size={18} aria-hidden /></button>
                </div>
                {sidebar}
              </aside>
            </>
          )
        ) : (
          <aside
            aria-label="Inhoudstafel en instellingen"
            style={{
              width: 300, flex: 'none', borderRight: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--bg-raised) 65%, transparent)',
              position: 'sticky', top: 53, alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 53px)', overflowY: 'auto',
            }}
          >
            {sidebar}
          </aside>
        )}

        <main id="main" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 90px', lineHeight: 1.7 }}>
            {!cur ? (
              <EmptyState icon={<Inbox size={40} />} title="Deze cursus heeft nog geen inhoud" level={1}>
                <p>Vraag je leerkracht om de cursus aan te vullen.</p>
              </EmptyState>
            ) : (
              <>
                <nav aria-label="Kruimelpad" style={{ color: 'var(--text-soft)', fontSize: '0.88rem', marginBottom: 4 }}>
                  {cur.chapter.emoji && <span aria-hidden>{cur.chapter.emoji} </span>}
                  {cur.chapter.title} <span aria-hidden>›</span> {cur.section.title}
                </nav>
                <h1 style={{ fontSize: '1.7rem', margin: '0 0 6px', lineHeight: 1.25 }}>
                  {cur.section.title}
                  {cur.section.optional && (
                    <span className="badge badge-brand" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                      verdieping (keuze)
                    </span>
                  )}
                </h1>

                {(cur.section.goals?.length ?? 0) > 0 && (
                  <div className="callout" role="note" style={{ marginTop: 14 }}>
                    <Target size={18} aria-hidden />
                    <div>
                      <strong>Wat leer je hier?</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
                        {cur.section.goals!.map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 18 }}>
                  {/* Blokken die de leerkracht nooit invulde, tonen een leerling niets (CU13). */}
                  {zichtbareBlokken.map((block) => (
                    <BlockRenderer
                      key={block.id}
                      block={block}
                      interactive
                      studentName={name}
                      accent={accent}
                      preview={preview}
                      checkedIds={eigenOf(eigenOf(progress.sections, cur.section.id)?.checks, block.id) ?? []}
                      onToggleCheck={(itemId) => toggleCheck(block.id, itemId)}
                    />
                  ))}
                  {zichtbareBlokken.length === 0 && (
                    <p className="hint">Deze sectie is nog leeg.</p>
                  )}
                </div>

                {/* Mijn notities: privé kladblok bij deze sectie */}
                <div className="card" style={{ marginTop: 26, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StickyNote size={16} aria-hidden /> Mijn notities
                    </strong>
                    <span
                      className="hint"
                      role="status"
                      style={{ color: 'var(--ok)', visibility: noteSaved ? 'visible' : 'hidden', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <CheckIcon size={13} aria-hidden /> bewaard
                    </span>
                  </div>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={noteOf(notes, cur.section.id)}
                    placeholder="Schrijf hier wat je wil onthouden van deze pagina…"
                    aria-label="Mijn notities bij deze sectie"
                    onChange={(e) => changeNote(cur.section.id, e.target.value)}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    {preview
                      ? 'Voorbeeld: notities worden hier niet bewaard.'
                      : 'Alleen voor jou — je notities blijven op dit toestel en zitten níét in je voortgangscode.'}
                  </p>
                </div>

                {/* Sectie afronden + navigatie */}
                <div style={{ textAlign: 'center', marginTop: 30 }}>
                  {eigenOf(progress.sections, cur.section.id)?.completedAt ? (
                    <span className="badge badge-ok" style={{ fontSize: '0.95rem', padding: '8px 16px' }}>
                      <CheckIcon size={15} aria-hidden /> Gelezen — je mag altijd nog eens nalezen
                    </span>
                  ) : (
                    <button className="btn btn-primary" onClick={markRead}><CheckIcon size={16} aria-hidden /> Markeer als gelezen</button>
                  )}
                </div>
                <div className="player-nav">
                  {prev ? (
                    <button
                      className="btn btn-ghost"
                      onClick={() => goTo(prev.section.id)}
                      style={{ maxWidth: '48%' }}
                    >
                      ← {prev.section.title}
                    </button>
                  ) : <span />}
                  {next ? (
                    <button
                      className="btn btn-ghost"
                      onClick={() => goTo(next.section.id)}
                      style={{ maxWidth: '48%' }}
                    >
                      {next.section.title} →
                    </button>
                  ) : <span />}
                </div>

                {isLast && (
                  <div className="card" style={{ marginTop: 30, padding: '30px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.8rem' }} aria-hidden>🎉</div>
                    <h2 style={{ margin: '6px 0' }}>Cursus afgewerkt?</h2>
                    <p style={{ color: 'var(--text-soft)', margin: '0 0 12px' }}>
                      Je hebt <strong>{pctDone}%</strong> van de cursus afgewerkt.
                      {pctDone < 100 && ' Kijk in de inhoudstafel welke secties nog open staan.'}
                    </p>
                    <div className="progressbar" aria-hidden style={{ maxWidth: 320, margin: '0 auto 16px' }}>
                      <div style={{ width: `${pctDone}%` }} />
                    </div>
                    {!preview && (
                      <>
                        <p className="hint" style={{ margin: '0 0 8px' }}>
                          Werk je op je eigen toestel? Bezorg je leerkracht je voortgangscode — laat
                          hem de QR scannen, of kopieer de code.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <CodeQr value={progressCode} label="jouw leesvoortgang" size={170} copyLabel="Voortgangscode kopiëren" />
                        </div>
                      </>
                    )}
                    {studentCtx && (
                      <p style={{ margin: '12px 0 0' }}>
                        <Link to={`/leerling/${studentCtx.classCode}`}>← Terug naar mijn klas</Link>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
