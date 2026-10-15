import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Inbox, LifeBuoy, PenLine, School, Shapes } from 'lucide-react';
import type { Assignment, ClassGroup } from '../lib/classTypes';
import { getPrefs, getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import { getCourses } from '../lib/courses';
import {
  assignmentsForClass, dueBadge, getAssignments, getClasses, loadClassContext, statusForAssignment,
} from '../lib/classes';
import {
  buildRecentItems, computeWeekCounts, greeting, isReturningTeacher, pickNextAssignment, relativeDay,
  type RecentItem,
} from '../lib/startData';
import { CATEGORIES, getTypeDef, WIDGET_TYPES } from '../widgets/registry';
import { TypeTile } from '../components/TypeTile';
import { AIIcon, AssignIcon, CourseIcon, ResultsIcon, ShareIcon, StudentIcon } from '../components/icons';
import '../styles/start.css';
import { CategoryIcon } from '../components/CategoryIcon';

function plural(n: number, singular: string, meervoud: string): string {
  return n === 1 ? singular : meervoud;
}

/** Datum in mensentaal, met hoofdletter: "Donderdag 24 september". */
function longDate(now: Date): string {
  const s = now.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Dashboard voor een terugkerende leerkracht ──────────────────────────────

interface ClassSummary {
  cls: ClassGroup;
  nextAssignment: Assignment | null;
  targetTitle: string | null;
  submitted: number;
  due: ReturnType<typeof dueBadge>;
}

function useClassSummaries(classes: ClassGroup[]): ClassSummary[] {
  // classes is een vers array bij elke opslagwijziging (zie StartPage), dus dat
  // volstaat als afhankelijkheid — assignmentsForClass/loadClassContext lezen
  // toch rechtstreeks uit de opslag.
  return useMemo(
    () =>
      classes.map((cls): ClassSummary => {
        const list = assignmentsForClass(cls.id);
        const next = pickNextAssignment(list);
        if (!next) return { cls, nextAssignment: null, targetTitle: null, submitted: 0, due: null };
        const ctx = loadClassContext([next]);
        const targetTitle =
          next.kind === 'widget' ? ctx.widgets.get(next.targetId)?.title ?? null : ctx.courses.get(next.targetId)?.title ?? null;
        const submitted = cls.students.filter((s) => statusForAssignment(next, s, ctx).state === 'ingediend').length;
        return { cls, nextAssignment: next, targetTitle, submitted, due: dueBadge(next.dueAt) };
      }),
    [classes]
  );
}

function RecentRow({ item }: { item: RecentItem }) {
  if (item.kind === 'widget') {
    const def = getTypeDef(item.type);
    return (
      <Link to={`/bewerk/${item.id}`} className="start-row">
        <TypeTile type={def} size="md" />
        <span className="txt">
          <b>{item.title}</b>
          <small>{def.name} · {def.tagline}</small>
        </span>
        <span className="meta">{relativeDay(item.updatedAt)}</span>
      </Link>
    );
  }
  return (
    <Link to={`/cursus/bewerk/${item.id}`} className="start-row">
      <span className="start-course-icon" aria-hidden="true"><CourseIcon size={18} /></span>
      <span className="txt">
        <b>{item.title}</b>
        <small>Cursus · {item.chapterCount} {plural(item.chapterCount, 'hoofdstuk', 'hoofdstukken')}</small>
      </span>
      <span className="meta">{relativeDay(item.updatedAt)}</span>
    </Link>
  );
}

function ClassRow({ summary }: { summary: ClassSummary }) {
  const { cls, nextAssignment, targetTitle, submitted, due } = summary;
  return (
    <Link to={`/klas/${cls.id}`} className="start-row start-class-row">
      <span className="start-course-icon" aria-hidden="true"><School size={18} /></span>
      <span className="txt">
        <b>{cls.name}</b>
        <small>
          {cls.students.length} {plural(cls.students.length, 'leerling', 'leerlingen')}
          {nextAssignment && targetTitle ? ` · ${targetTitle} · ${submitted}/${cls.students.length} ingediend` : ''}
          {!nextAssignment ? ' · geen opdracht met deadline' : ''}
        </small>
      </span>
      {due && <span className={`badge badge-${due.tone}`}>{due.label}</span>}
    </Link>
  );
}

function Dashboard({
  teacherName, widgets, courses, classes, submissions, assignments,
}: {
  teacherName: string;
  widgets: ReturnType<typeof getWidgets>;
  courses: ReturnType<typeof getCourses>;
  classes: ClassGroup[];
  submissions: ReturnType<typeof getSubmissions>;
  assignments: Assignment[];
}) {
  const now = new Date();
  const recentItems = useMemo(
    () =>
      buildRecentItems(
        widgets.map((w) => ({ id: w.id, title: w.title, type: w.type, updatedAt: w.updatedAt })),
        courses.map((c) => ({ id: c.id, title: c.title, chapterCount: c.chapters.length, updatedAt: c.updatedAt })),
        5
      ),
    [widgets, courses]
  );
  const counts = useMemo(() => computeWeekCounts(submissions, assignments), [submissions, assignments]);
  // De eerstvolgende deadline (over alle klassen): als er deze week een
  // deadline is, is dit 'm — de teller en de link wijzen dus naar dezelfde klas.
  const nextDeadline = useMemo(() => pickNextAssignment(assignments), [assignments]);
  const classSummaries = useClassSummaries(classes);

  return (
    <div className="page">
      <div className="start-head">
        <div>
          <h1>{greeting(now.getHours())}{teacherName ? `, ${teacherName}` : ''}</h1>
          <p className="sub">
            {longDate(now)} · {classes.length} {plural(classes.length, 'klas', 'klassen')} ·{' '}
            {widgets.length} {plural(widgets.length, 'oefening', 'oefeningen')} ·{' '}
            {courses.length} {plural(courses.length, 'cursus', 'cursussen')}
          </p>
        </div>
        <Link to="/hulp" className="start-help-link"><LifeBuoy size={16} aria-hidden="true" /> Hoe werkt Boosterz?</Link>
      </div>

      <div className="start-stats">
        <Link to="/resultaten" className={`start-stat${counts.toGrade > 0 ? ' has-value' : ''}`}>
          <span className="icon" aria-hidden="true"><PenLine size={18} /></span>
          <span><b>{counts.toGrade}</b><span className="label">open vragen na te kijken</span></span>
        </Link>
        <Link to={nextDeadline ? `/klas/${nextDeadline.classId}` : '/klassen'} className={`start-stat${counts.deadlinesThisWeek > 0 ? ' has-value' : ''}`}>
          <span className="icon" aria-hidden="true"><CalendarClock size={18} /></span>
          <span><b>{counts.deadlinesThisWeek}</b><span className="label">deadlines deze week</span></span>
        </Link>
        <Link to="/resultaten" className={`start-stat${counts.submittedThisWeek > 0 ? ' has-value' : ''}`}>
          <span className="icon" aria-hidden="true"><Inbox size={18} /></span>
          <span><b>{counts.submittedThisWeek}</b><span className="label">inzendingen deze week</span></span>
        </Link>
      </div>

      <div className="start-cols">
        <section className="start-panel" aria-label="Verder werken">
          <h2><Shapes size={18} aria-hidden="true" /> Verder werken</h2>
          {recentItems.length === 0 ? (
            <p className="start-empty-hint">Nog niets bewerkt. Maak je eerste oefening of cursus bij "Snel maken".</p>
          ) : (
            <div className="start-list">
              {recentItems.map((item) => <RecentRow key={`${item.kind}-${item.id}`} item={item} />)}
            </div>
          )}
        </section>

        <section className="start-panel" aria-label="Klassen">
          <h2><AssignIcon size={18} aria-hidden="true" /> Klassen</h2>
          {classSummaries.length === 0 ? (
            <p className="start-empty-hint">
              Nog geen klas. Maak er een aan om opdrachten te geven en resultaten te verzamelen — {' '}
              <Link to="/klassen?nieuw=1">nieuwe klas</Link>.
            </p>
          ) : (
            <div className="start-list">
              {classSummaries.map((s) => <ClassRow key={s.cls.id} summary={s} />)}
            </div>
          )}
        </section>
      </div>

      <section aria-label="Snel maken">
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 10px' }}>Snel maken</h2>
        <div className="start-quick">
          <Link to="/nieuw" className="start-quick-tile">
            <span className="icon" aria-hidden="true"><Shapes size={18} /></span>
            <span><b>Oefening</b><small>Quiz, spel of hulpmiddel · 38 soorten</small></span>
          </Link>
          <Link to="/cursussen?nieuw=1" className="start-quick-tile">
            <span className="icon" aria-hidden="true"><CourseIcon size={18} /></span>
            <span><b>Cursus</b><small>Hoofdstukken met uitleg en oefeningen</small></span>
          </Link>
          <Link to="/ai-studio" className="start-quick-tile">
            <span className="icon" aria-hidden="true"><AIIcon size={18} /></span>
            <span><b>Met AI</b><small>Uit je eigen leerstof</small></span>
          </Link>
        </div>
      </section>
    </div>
  );
}

// ── Eerste bezoek: uitleg ────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    Icon: Shapes, title: 'Materiaal maken',
    text: 'Oefeningen en spelletjes (38 soorten), cursussen (hoofdstukken met uitleg en oefeningen erin) en leerplannen (doelen waar je materiaal aan hangt).',
  },
  {
    Icon: ShareIcon, title: 'Delen',
    text: 'Je geeft je leerlingen een link: die werkt op hun eigen toestel. De code van 6 tekens werkt alleen op dit toestel. Ze hebben geen account nodig.',
  },
  {
    Icon: ResultsIcon, title: 'Opvolgen',
    text: 'Resultaten per leerling en per doel, open vragen nakijken, en het inleverpunt voor codes van thuis.',
  },
  {
    Icon: AIIcon, title: 'AI, optioneel',
    text: 'Met je eigen sleutel laat je AI een voorzet maken. Boosterz werkt ook prima zonder.',
  },
];

function FirstVisit() {
  return (
    <div className="page">
      <div className="start-intro">
        <h1>Maak oefeningen en cursussen, deel ze met je klas en volg op wat je leerlingen kunnen.</h1>
        <p className="lede">Alles hieronder werkt zonder account, rechtstreeks in je browser.</p>
      </div>

      <section className="start-section" aria-labelledby="start-how-title">
        <h2 id="start-how-title">Hoe het in elkaar zit</h2>
        <div className="start-steps">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.title} className="start-step">
              <span className="icon" aria-hidden="true"><s.Icon size={20} /></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="start-ctas">
        <Link to="/ai-studio" className="btn btn-ai btn-lg"><AIIcon size={18} aria-hidden="true" /> Maak iets met AI</Link>
        <Link to="/nieuw" className="btn btn-primary btn-lg">Zelf een oefening maken</Link>
        <Link to="/cursussen?voorbeeld=1" className="btn btn-ghost btn-lg"><CourseIcon size={18} aria-hidden="true" /> Bekijk de voorbeeldcursus</Link>
      </div>

      <div className="start-student-box">
        <StudentIcon size={22} aria-hidden="true" />
        <p>Ben je leerling en heb je een code van je leerkracht gekregen?</p>
        <Link to="/meedoen" className="btn btn-sm btn-ghost">Ik ben leerling en heb een code</Link>
      </div>

      <section className="start-section" aria-labelledby="start-types-title">
        <h2 id="start-types-title">{WIDGET_TYPES.length} soorten oefeningen en spelletjes</h2>
        {CATEGORIES.map((cat) => (
          <div key={cat.id} className="start-cat">
            <h3><CategoryIcon id={cat.id} size={17} /> {cat.name}</h3>
            <div className="start-type-row">
              {WIDGET_TYPES.filter((t) => t.category === cat.id).map((t) => (
                <Link key={t.id} to={`/nieuw?type=${t.id}`} className="start-type-chip">
                  <TypeTile type={t} size="sm" /> {t.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
        <p style={{ textAlign: 'center', marginTop: 6 }}>
          <Link to="/nieuw" className="btn btn-sm btn-ghost">Alle 38 soorten</Link>
        </p>
      </section>

      <p className="start-privacy">
        Alles blijft in je browser, zonder account. <Link to="/privacy">Lees hoe we met gegevens omgaan</Link>.
      </p>
      <p style={{ textAlign: 'center', marginTop: 18 }}>
        <Link to="/hulp" className="start-help-link" style={{ justifyContent: 'center' }}>
          <LifeBuoy size={16} aria-hidden="true" /> Hoe werkt Boosterz?
        </Link>
      </p>
    </div>
  );
}

// ── Startpagina (/): dashboard of eerste bezoek ─────────────────────────────

export function StartPage() {
  const [tick, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  // tick is een bewuste herlees-trigger (opslag gewijzigd), geen echte
  // afhankelijkheid — zoals elders in de app (bv. ClassesPage, ClassDashboardPage).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const widgets = useMemo(() => getWidgets(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const courses = useMemo(() => getCourses(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const classes = useMemo(() => getClasses(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const submissions = useMemo(() => getSubmissions(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => getAssignments(), [tick]);

  const returning = useMemo(
    () => isReturningTeacher({ widgets, courses, classes }),
    [widgets, courses, classes]
  );

  if (!returning) return <FirstVisit />;

  return (
    <Dashboard
      teacherName={getPrefs().teacherName}
      widgets={widgets}
      courses={courses}
      classes={classes}
      submissions={submissions}
      assignments={assignments}
    />
  );
}
