import React, { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight, Calendar, Clock, ClipboardCheck, ClipboardList, FileText, Globe, Inbox, Puzzle, School, Search,
} from 'lucide-react';
import type { Assignment, ClassGroup, ClassStudent } from '../lib/classTypes';
import type { Course } from '../lib/courseTypes';
import type { Curriculum } from '../lib/curriculumTypes';
import type { Widget } from '../lib/types';
import {
  applyStudentList, assignmentsForClass, deleteAssignment, dueBadge, duplicateNames, getClass,
  goalScoresForStudent, loadClassContext, saveClass, sortedStudents, statusForAssignment,
  submissionsFor, upsertAssignment, zetKlasRichting, type AssignmentStatus, type ClassDataContext,
} from '../lib/classes';
import { classPackFileName, classPackToJson, encodeClassPackToUrl, QR_MAX_CHARS } from '../lib/classPack';
import { getCourses } from '../lib/courses';
import { getWidgets, onStorageChange } from '../lib/storage';
import { getCurricula, goalLabel } from '../lib/curriculum';
import { awaitsGrading, goalScoreKey } from '../lib/goals';
import { getTypeDef } from '../widgets/registry';
import { downloadFile, formatDate, formatDateShort, uid } from '../lib/utils';
import { doelgroepTekst, doelgroepVoorKlas, type Doelgroep } from '../lib/doelgroep';
import { cursussenVoorToewijzen } from '../lib/doelgroepGebruik';
import {
  ANDERE_CURSUSSEN, CURSUSSEN_BOVENAAN_HINT, CURSUSSEN_LADEN, FOUT_CURSUSSEN_LADEN, KIES_RICHTING_KNOP, KIEZER_LADEN_MISLUKT,
  KIEZER_TITEL, KLAS_RICHTING_KOP, KLAS_RICHTING_UITLEG, cursussenVoorLabel, foutVoorUitslag, richtingGekozenTekst, richtingWeggehaaldTekst,
} from '../lib/klasRichtingWeergave';
import { CodeQr } from '../components/CodeQr';
import type { KlasRichtingProps } from '../components/klas/KlasRichting';
import type { RichtingKiezerModalProps } from '../components/richting/RichtingKiezerModal';
import { ConfirmModal, CopyButton, EmptyState, Field, Modal, useToast } from '../components/ui';
import {
  AddIcon, AssignIcon, BackIcon, CheckIcon, CourseIcon, DeleteIcon, EditIcon, ExportIcon,
  GoalIcon, LinkIcon, PrivacyIcon, RichtingIcon, StudentIcon, WarningIcon,
} from '../components/icons';
import {
  duplicateStudentIds, duplicateStudentNames, duplicatesInClassMessage, goalScoreView,
  klasCsv, nameTaken, nameTakenMessage, pastedDuplicatesMessage, statusSummaryProvisional, toDateInputValue,
} from './klasWeergave';
import '../styles/klasrichting.css';
import '../styles/opvolgen.css';

/** Leerlinglink van een klas (de hub waar de leerling zijn opdrachten ziet). */
function studentHubUrl(code: string): string {
  const base = typeof location !== 'undefined' ? location.origin + location.pathname : '';
  return `${base}#/leerling/${code}`;
}

/** Cursus (lezen) of oefening (maken)? Zelfde icoon overal in het klasdashboard. */
function AssignmentKindIcon({ kind }: { kind: Assignment['kind'] }) {
  return kind === 'course' ? <CourseIcon size={16} /> : <Puzzle size={16} />;
}

/** Statusbadge van een opdracht bij één leerling (matrix + per-leerlingpaneel). */
function StateBadge({ status }: { status: AssignmentStatus }) {
  if (status.state === 'ingediend') {
    return <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" /> ingediend</span>;
  }
  if (status.state === 'bezig') return <span className="badge badge-warn">◐ bezig</span>;
  return <span className="badge">niet gestart</span>;
}

/**
 * /klas/:id — het klasoverzicht van de leerkracht: wie werkte al aan wat, hoe
 * ver staat iedereen, en waar zit het werk per leerplandoel?
 */
export function ClassDashboardPage() {
  const { id } = useParams();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  // tick is telkens een bewuste herlees-trigger (opslag gewijzigd), geen echte
  // afhankelijkheid — vandaar de uitzonderingen hieronder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cls = useMemo(() => (id ? getClass(id) : undefined), [id, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => (cls ? assignmentsForClass(cls.id) : []), [cls, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => loadClassContext(assignments), [assignments, tick]);
  const students = useMemo(() => (cls ? sortedStudents(cls.students) : []), [cls]);
  const dubbeleNamen = useMemo(() => duplicateStudentNames(students), [students]);

  // De cursussen voor de studierichting van de klas (sectie Studierichting): alleen lezen als de klas een richting heeft.
  const heeftRichting = cls?.doelgroep !== undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const courses = useMemo<Course[]>(() => (heeftRichting ? getCourses() : []), [heeftRichting, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const curricula = useMemo(() => (heeftRichting ? getCurricula() : []), [heeftRichting, tick]);
  const inKlas = useMemo(() => new Set(assignments.filter((a) => a.kind === 'course').map((a) => a.targetId)), [assignments]);

  const statuses = useMemo(() => {
    const map = new Map<string, AssignmentStatus>();
    for (const s of students) {
      for (const a of assignments) map.set(`${s.id}|${a.id}`, statusForAssignment(a, s, ctx));
    }
    return map;
  }, [students, assignments, ctx]);

  const [shareOpen, setShareOpen] = useState(false);
  // `voorgekozen`: de cursus die "Toewijzen" in de sectie Studierichting al koos (anders opent het venster leeg).
  const [newAssignment, setNewAssignment] = useState<{ voorgekozen?: string } | null>(null);
  // Na een toewijzing vanuit de sectie Studierichting verdwijnt de knop "Toewijzen": dan krijgt de titel van de cursus de focus.
  const [focusCursus, setFocusCursus] = useState<{ id: string } | null>(null);
  // Een andere klas (de route verandert, de pagina niet): geen oude focusvraag meenemen.
  useEffect(() => setFocusCursus(null), [id]);
  const [editList, setEditList] = useState(false);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState<Assignment | null>(null);

  const titleOf = (a: Assignment): string => {
    const t = a.kind === 'course' ? ctx.courses.get(a.targetId)?.title : ctx.widgets.get(a.targetId)?.title;
    return t ?? (a.kind === 'course' ? 'Cursus (niet op dit toestel)' : 'Widget (niet op dit toestel)');
  };

  /** Inzendingen die nog op verbetering wachten, per widget. */
  const teVerbeteren = useMemo(() => {
    const out: { widget: Widget; count: number }[] = [];
    for (const a of assignments) {
      if (a.kind !== 'widget') continue;
      const widget = ctx.widgets.get(a.targetId);
      if (!widget) continue;
      const count = students.reduce(
        (sum, s) => sum + submissionsFor(widget.id, s, ctx).filter((x) => x.totalMax > 0 && awaitsGrading(x)).length,
        0
      );
      if (count > 0) out.push({ widget, count });
    }
    return out;
  }, [assignments, ctx, students]);

  if (!cls) {
    return (
      <div className="page page-narrow" style={{ paddingTop: 60 }}>
        <EmptyState icon={<AssignIcon size={40} />} title="Klas niet gevonden" level={1}>
          <p>Deze klas staat niet (meer) op dit toestel.</p>
          <Link to="/klassen" className="btn btn-primary"><BackIcon size={16} /> Naar mijn klassen</Link>
        </EmptyState>
      </div>
    );
  }

  const exportCsv = () => {
    const csv = klasCsv(students, assignments, titleOf, (s, a) => statuses.get(`${s.id}|${a.id}`));
    downloadFile(`klas - ${cls.name}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV gedownload', 'ok');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><AssignIcon size={24} /> {cls.name}</h1>
          <p className="sub">
            {cls.schoolYear ? `${cls.schoolYear} · ` : ''}
            {cls.students.length} leerling{cls.students.length === 1 ? '' : 'en'} · klascode{' '}
            <strong style={{ fontFamily: 'monospace', letterSpacing: '0.12em' }}>{cls.code}</strong>
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => setEditList(true)}><EditIcon size={18} /> Klaslijst</button>
          <button className="btn btn-ghost" onClick={exportCsv} disabled={students.length === 0}><ExportIcon size={18} /> CSV</button>
          <Link to="/inleverpunt" className="btn btn-ghost"><Inbox size={18} /> Inleverpunt</Link>
          <button className="btn btn-primary" onClick={() => setShareOpen(true)}><LinkIcon size={18} /> Klaslink & pakket</button>
        </div>
      </div>

      {dubbeleNamen.length > 0 && (
        <div className="callout warn" role="status">
          <span aria-hidden><WarningIcon size={18} /></span>
          <div>
            {duplicatesInClassMessage(dubbeleNamen)}{' '}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditList(true)}>
              <EditIcon size={16} /> Klaslijst aanpassen
            </button>
          </div>
        </div>
      )}

      {/* ── Opdrachten ───────────────────────────────────────────────────── */}
      <section className="card card-pad" style={{ marginBottom: 20 }} aria-label="Opdrachten">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={20} /> Opdrachten
          </h2>
          <button className="btn btn-sm btn-primary" onClick={() => setNewAssignment({})}><AddIcon size={16} /> Opdracht toevoegen</button>
        </div>
        {assignments.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Nog geen opdrachten. Voeg een cursus of oefening toe — je leerlingen zien ze meteen in hun klaslink.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
            {assignments.map((a) => {
              const due = dueBadge(a.dueAt);
              const klaar = students.filter((s) => statuses.get(`${s.id}|${a.id}`)?.state === 'ingediend').length;
              return (
                <li
                  key={a.id}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 8 }}
                >
                  <span aria-hidden><AssignmentKindIcon kind={a.kind} /></span>
                  <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <strong>{titleOf(a)}</strong>
                    {a.note && <span className="hint" style={{ display: 'block' }}>{a.note}</span>}
                  </span>
                  {due && (
                    <span className={`badge badge-${due.tone}`}>
                      {due.overdue ? <Clock size={14} className="icon-inline" /> : <Calendar size={14} className="icon-inline" />} {due.label}
                      <span className="sr-only"> (deadline {formatDateShort(a.dueAt!)})</span>
                    </span>
                  )}
                  <span className="hint" style={{ whiteSpace: 'nowrap' }}>
                    {klaar}/{students.length} klaar
                  </span>
                  {a.kind === 'widget' && ctx.widgets.has(a.targetId) && (
                    <Link to={`/resultaten/${a.targetId}?klas=${cls.id}`} className="btn btn-sm btn-ghost">Resultaten <ArrowRight size={14} /></Link>
                  )}
                  {a.kind === 'course' && ctx.courses.has(a.targetId) && (
                    <Link to={`/cursus/volg/${a.targetId}`} className="btn btn-sm btn-ghost">Volgen <ArrowRight size={14} /></Link>
                  )}
                  <button
                    className="btn btn-sm btn-quiet btn-icon"
                    aria-label={`Opdracht "${titleOf(a)}" verwijderen`}
                    onClick={() => setDeleteAssignmentTarget(a)}
                  >
                    <DeleteIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Studierichting ───────────────────────────────────────────────── */}
      {/* `key`: een andere klas (de route verandert, de pagina niet) begint met een schone sectie, zonder de melding van de vorige. */}
      <StudierichtingSectie
        key={cls.id}
        cls={cls}
        courses={courses}
        curricula={curricula}
        inKlas={inKlas}
        focusCursus={focusCursus}
        onToewijzen={(course) => setNewAssignment({ voorgekozen: course.id })}
        onBewaard={() => { setFocusCursus(null); setTick((t) => t + 1); }}
      />

      {/* ── Nog te verbeteren ────────────────────────────────────────────── */}
      {teVerbeteren.length > 0 && (
        <div className="callout warn" style={{ marginBottom: 20 }}>
          <span aria-hidden><ClipboardCheck size={18} /></span>
          <div>
            <strong>Nog na te kijken:</strong>{' '}
            {teVerbeteren.map((t, i) => (
              <React.Fragment key={t.widget.id}>
                {i > 0 && ' · '}
                <Link to={`/resultaten/${t.widget.id}?klas=${cls.id}`}>
                  {t.widget.title} ({t.count})
                </Link>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ── Matrix ───────────────────────────────────────────────────────── */}
      {students.length === 0 ? (
        <EmptyState icon={<StudentIcon size={40} />} title="Nog geen leerlingen in deze klas">
          <p>Plak je klaslijst — daarna krijgt elk stuk werk automatisch de juiste naam.</p>
          <button className="btn btn-primary" onClick={() => setEditList(true)}><EditIcon size={16} /> Klaslijst invullen</button>
        </EmptyState>
      ) : assignments.length > 0 ? (
        <div
          className="card"
          style={{ overflowX: 'auto', marginBottom: 20 }}
          tabIndex={0}
          role="region"
          aria-label="Status per leerling en per opdracht"
        >
          <table className="data" style={{ minWidth: 520, borderCollapse: 'collapse', width: '100%' }}>
            <caption className="sr-only">Status per leerling en per opdracht</caption>
            <thead>
              <tr>
                <th scope="col" style={{ position: 'sticky', left: 0, background: 'var(--bg-raised)', zIndex: 1, textAlign: 'left', padding: '8px 12px' }}>
                  Leerling
                </th>
                {assignments.map((a) => (
                  <th key={a.id} scope="col" style={{ padding: '8px 10px', fontSize: '0.82rem', maxWidth: 160 }}>
                    <AssignmentKindIcon kind={a.kind} /> {titleOf(a)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)', cursor: 'default' }}>
                  <th
                    scope="row"
                    style={{ position: 'sticky', left: 0, background: 'var(--bg-raised)', textAlign: 'left', fontWeight: 600, padding: '7px 12px', whiteSpace: 'nowrap' }}
                  >
                    {s.number !== undefined && <span className="hint" style={{ marginRight: 6 }}>{s.number}</span>}
                    {s.name}
                  </th>
                  {assignments.map((a) => {
                    const st = statuses.get(`${s.id}|${a.id}`) ?? statusForAssignment(a, s, ctx);
                    return (
                      <td key={a.id} style={{ textAlign: 'center', padding: '6px 8px' }}>
                        <StateBadge status={st} />
                        {st.state !== 'niet gestart' && (
                          <span className="hint" style={{ display: 'block' }}>{statusSummaryProvisional(st)}</span>
                        )}
                        {st.needsGrading && (
                          <span className="hint" style={{ display: 'block' }}>
                            <ClipboardCheck size={12} className="icon-inline" /> na te kijken
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── Per leerling ─────────────────────────────────────────────────── */}
      {students.length > 0 && (
        <section aria-label="Per leerling" style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ fontSize: '1.05rem', margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={18} /> Per leerling
          </h2>
          {students.map((s) => (
            <StudentPanel key={s.id} student={s} assignments={assignments} ctx={ctx} titleOf={titleOf} />
          ))}
        </section>
      )}

      <p className="hint" style={{ marginTop: 24 }}>
        <Search size={14} className="icon-inline" /> Eerlijk over de werking: werk dat op een ánder toestel gemaakt is, komt pas binnen via het
        <Link to="/inleverpunt"> inleverpunt</Link> (geplakte of gescande codes). Wat hier staat, is dus
        wat dit toestel weet.
      </p>

      {shareOpen && <ClassShareModal cls={cls} assignments={assignments} onClose={() => setShareOpen(false)} />}
      {newAssignment && (
        <NewAssignmentModal
          cls={cls}
          existing={assignments}
          voorgekozen={newAssignment.voorgekozen}
          onClose={() => setNewAssignment(null)}
          onSaved={(created, kind, targetId) => {
            toast(created ? 'Opdracht toegevoegd' : 'Opdracht bijgewerkt', 'ok');
            setTick((t) => t + 1);
            // De knop "Toewijzen" waar de leerkracht vandaan kwam, is nu een badge: de focus gaat naar de titel van de cursus.
            if (kind === 'course' && newAssignment.voorgekozen === targetId) setFocusCursus({ id: targetId });
          }}
        />
      )}
      {editList && (
        <EditStudentsModal
          cls={cls}
          onClose={() => setEditList(false)}
          onSave={(students) => {
            saveClass({ ...cls, students });
            toast('Klaslijst bijgewerkt', 'ok');
            setTick((t) => t + 1);
          }}
        />
      )}
      {deleteAssignmentTarget && (
        <ConfirmModal
          title="Opdracht verwijderen?"
          message={`"${titleOf(deleteAssignmentTarget)}" verdwijnt uit deze klas. De cursus of oefening zelf blijft bestaan, net als alle inzendingen.`}
          onConfirm={() => {
            deleteAssignment(deleteAssignmentTarget.id);
            toast('Opdracht verwijderd', 'ok');
            setTick((t) => t + 1);
          }}
          onClose={() => setDeleteAssignmentTarget(null)}
        />
      )}
    </div>
  );
}

// ── Studierichting van de klas ──────────────────────────────────────────────

/**
 * De studierichting (en het jaar) van de klas (docs/STUDIERICHTINGEN.md § 22.6). Met een richting staan hier de cursussen van
 * die richting en, op vraag, wat ze dekken (`KlasRichting`). Het venster om een richting te kiezen wordt pas geladen als je
 * erom vraagt, zodat het klasoverzicht klein blijft; lukt het laden niet (offline), dan blijft de klas gewoon werken.
 * Bewaren gebeurt alleen met `zetKlasRichting`: die leest de klas opnieuw en wijzigt alleen dit veld, en elke mislukking
 * krijgt hier een melding.
 */
function StudierichtingSectie({
  cls, courses, curricula, inKlas, focusCursus, onToewijzen, onBewaard,
}: {
  cls: ClassGroup;
  courses: Course[];
  curricula: Curriculum[];
  inKlas: ReadonlySet<string>;
  focusCursus: { id: string } | null;
  onToewijzen: (course: Course) => void;
  /** De klas is veranderd in de opslag: het klasoverzicht leest ze opnieuw. */
  onBewaard: () => void;
}) {
  const toast = useToast();
  const kopId = useId();
  const dg = cls.doelgroep;
  const [Kiezer, setKiezer] = useState<ComponentType<RichtingKiezerModalProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [laadt, setLaadt] = useState(false);
  const [fout, setFout] = useState('');
  const kiesRef = useRef<HTMLButtonElement>(null);

  // De cursussen van de richting (en de dekking erachter) staan in een eigen chunk, zodat het klasoverzicht klein blijft: ze
  // worden pas geladen als de klas een richting heeft. Lukt dat niet (offline), dan zegt de sectie het en werkt de klas verder.
  const [KlasRichting, setKlasRichting] = useState<ComponentType<KlasRichtingProps> | null>(null);
  const [cursussenMislukt, setCursussenMislukt] = useState(false);
  useEffect(() => {
    if (!dg || KlasRichting) return;
    import('../components/klas/KlasRichting').then((m) => setKlasRichting(() => m.KlasRichting), () => setCursussenMislukt(true));
  }, [dg, KlasRichting]);

  const openKiezer = () => {
    if (laadt) return;
    // Een nieuwe poging: de melding van de vorige mislukking hoort er niet meer bij.
    setFout('');
    if (Kiezer) { setOpen(true); return; }
    setLaadt(true);
    import('../components/richting/RichtingKiezerModal').then(
      (m) => { setKiezer(() => m.RichtingKiezerModal); setLaadt(false); setOpen(true); },
      () => { setLaadt(false); toast(KIEZER_LADEN_MISLUKT, 'err'); },
    );
  };

  /** Bewaart de richting (of wist ze). Een mislukking sluit het venster en zegt wat er mis is: er is dan niets veranderd. */
  const bewaar = (d: Doelgroep | undefined) => {
    const uitslag = zetKlasRichting(cls.id, d);
    if (uitslag !== 'ok') {
      setFout(foutVoorUitslag(uitslag));
      return;
    }
    setFout('');
    const nieuw = d === undefined ? undefined : doelgroepVoorKlas(d);
    toast(nieuw ? richtingGekozenTekst(cls.name, nieuw) : richtingWeggehaaldTekst(cls.name), 'ok');
    onBewaard();
    // De knop waar de focus stond, is nu een andere ("Kies een studierichting" wordt "Wijzig" en omgekeerd): de focus volgt.
    setTimeout(() => kiesRef.current?.focus(), 0);
  };

  return (
    <section className="card card-pad kr-sectie" aria-labelledby={kopId}>
      <h2 id={kopId} className="kr-kop"><RichtingIcon size={20} /> {KLAS_RICHTING_KOP}</h2>

      {fout && (
        <div className="callout err kr-melding" role="alert">
          <span aria-hidden><WarningIcon size={18} /></span>
          <div>{fout}</div>
        </div>
      )}

      {dg ? <p className="kr-waarde"><strong>{doelgroepTekst(dg)}</strong></p> : <p className="kr-uitleg">{KLAS_RICHTING_UITLEG}</p>}
      <div className="kr-instelling-knoppen">
        {/* Eén knop voor "Kies een studierichting" en "Wijzig": ze behoudt de focus als de richting wisselt. */}
        <button ref={kiesRef} type="button" className={`btn btn-sm ${dg ? 'btn-ghost' : 'btn-primary'}`} onClick={openKiezer} aria-busy={laadt || undefined}>
          {dg ? <>Wijzig<span className="sr-only"> de studierichting</span></> : KIES_RICHTING_KNOP}
        </button>
        {dg && <button type="button" className="btn btn-sm btn-quiet" onClick={() => bewaar(undefined)}>Geen richting</button>}
      </div>
      {dg && (KlasRichting
        ? <KlasRichting doelgroep={dg} courses={courses} curricula={curricula} inKlas={inKlas} onToewijzen={onToewijzen} focusCursus={focusCursus} />
        : <p className="kr-bezig" role={cursussenMislukt ? 'alert' : 'status'}>{cursussenMislukt ? FOUT_CURSUSSEN_LADEN : CURSUSSEN_LADEN}</p>)}

      {open && Kiezer && (
        <Kiezer
          titel={KIEZER_TITEL}
          huidig={dg}
          onKies={(d) => { setOpen(false); bewaar(d); }}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

// ── Paneel per leerling: status + score per leerplandoel ────────────────────

function StudentPanel({
  student, assignments, ctx, titleOf,
}: {
  student: ClassStudent;
  assignments: Assignment[];
  ctx: ClassDataContext;
  titleOf: (a: Assignment) => string;
}) {
  const [open, setOpen] = useState(false);
  const goals = useMemo(
    () => (open ? [...goalScoresForStudent(assignments, student, ctx).values()] : []),
    [open, assignments, student, ctx]
  );

  return (
    <details
      className="card"
      style={{ padding: '10px 14px' }}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        {student.number !== undefined && <span className="hint" style={{ marginRight: 6 }}>{student.number}</span>}
        {student.name}
      </summary>
      <div style={{ paddingTop: 10 }}>
        {assignments.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Deze klas heeft nog geen opdrachten.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {assignments.map((a) => {
              const st = statusForAssignment(a, student, ctx);
              return (
                <li key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span aria-hidden><AssignmentKindIcon kind={a.kind} /></span>
                  <span style={{ flex: '1 1 160px' }}>{titleOf(a)}</span>
                  <StateBadge status={st} />
                  <span className="hint">{statusSummaryProvisional(st)}</span>
                  {st.lastAt && <span className="hint">{formatDate(st.lastAt)}</span>}
                </li>
              );
            })}
          </ul>
        )}

        <h3 style={{ fontSize: '0.95rem', margin: '14px 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <GoalIcon size={16} /> Score per leerplandoel
        </h3>
        {goals.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Nog geen scores met een leerplandoel. Koppel doelcodes aan je vragen — dan telt Boosterz
            ze hier per doel op.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {goals.map((g) => {
              const label = goalLabel(g.code, g.curriculumId);
              const view = goalScoreView(g);
              // Een voorlopige score krijgt geen drempelkleur: wat nog wacht, kan ze nog veranderen.
              const kleur = view.provisional || view.pct === null
                ? 'var(--text-soft)'
                : view.pct >= 70 ? 'var(--ok)' : view.pct >= 45 ? 'var(--warn)' : 'var(--err)';
              return (
                <div key={goalScoreKey(g)} className="klas-doelrij">
                  <span style={{ fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>
                    {goalLabel(g.code, g.curriculumId, 60)}
                  </span>
                  <div className="scorebar" role="img" aria-label={`${label}: ${view.aria}`}>
                    <div className="bar"><div style={{ width: `${view.pct ?? 0}%`, background: kleur }} /></div>
                  </div>
                  <span className="hint klas-doelscore">{view.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

// ── Delen: klaslink, QR en klaspakket ───────────────────────────────────────

function ClassShareModal({
  cls, assignments, onClose,
}: { cls: ClassGroup; assignments: Assignment[]; onClose: () => void }) {
  const toast = useToast();
  const hubUrl = studentHubUrl(cls.code);
  const [pack, setPack] = useState<{ url: string; unresolved: number; length: number } | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    encodeClassPackToUrl(cls, assignments)
      .then((res) => { if (alive) setPack({ url: res.url, unresolved: res.unresolved, length: res.length }); })
      .catch(() => { if (alive) setPack(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [cls, assignments]);

  const downloadPack = async () => {
    try {
      const res = await encodeClassPackToUrl(cls, assignments);
      downloadFile(classPackFileName(cls), classPackToJson(res.pack));
      toast('Klaspakket gedownload', 'ok');
    } catch {
      toast('Het klaspakket kon niet gemaakt worden', 'err');
    }
  };

  return (
    <Modal title={`“${cls.name}” delen met je leerlingen`} onClose={onClose} wide>
      <div className="callout">
        <span aria-hidden><School size={18} /></span>
        <div>
          <strong>In de klas (zelfde toestel of browser):</strong> je leerlingen surfen naar de app,
          klikken op <em>Ik ben leerling</em> en typen de klascode. Daarna kiezen ze hun naam uit de lijst.
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '10px 0 16px' }}>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '0.3em', fontFamily: 'monospace' }}>
          {cls.code}
        </div>
        <CopyButton text={cls.code} label="Code kopiëren" />
        <CopyButton text={hubUrl} label="Klaslink kopiëren" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
        <CodeQr value={hubUrl} label="de klaslink" size={170} copyLabel="Klaslink kopiëren" hint="Laat je leerlingen deze QR scannen: ze komen meteen bij hun opdrachten. Werkt alleen op toestellen waar de opdrachten al staan — anders het klaspakket hieronder." />
      </div>

      <hr className="divider" />

      <div className="callout">
        <span aria-hidden><Globe size={18} /></span>
        <div>
          <strong>Klaspakket (elk toestel, ook thuis):</strong> de klaslijst, de opdrachten én hun
          inhoud (cursussen met hun oefeningen) zitten in de link zelf. De leerling opent ze één
          keer; daarna werkt alles op zijn eigen toestel en stuurt hij zijn codes terug.
        </div>
      </div>
      {busy && !pack ? (
        <p className="hint" role="status" aria-busy>Pakket wordt klaargemaakt (afbeeldingen worden ingevoegd)…</p>
      ) : !pack ? (
        <div className="callout err" role="alert">
          <span aria-hidden><WarningIcon size={18} /></span>
          <div>Het pakket kon niet gemaakt worden. Probeer het opnieuw, of deel de cursussen apart.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 6px' }}>
            <input
              className="input input-sm"
              readOnly
              value={pack.url}
              aria-label="Klaspakketlink"
              onFocus={(e) => e.target.select()}
            />
            <CopyButton text={pack.url} label="Kopiëren" />
          </div>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            Linklengte: {pack.length.toLocaleString('nl-BE')} tekens.
          </p>
          {pack.unresolved > 0 && (
            <div className="callout warn" style={{ marginBottom: 8 }}>
              <span aria-hidden><WarningIcon size={18} /></span>
              <div>
                {pack.unresolved === 1 ? 'Eén afbeelding of bijlage' : `${pack.unresolved} afbeeldingen of bijlagen`} staan
                niet (meer) op dit toestel en reizen dus niet mee.
              </div>
            </div>
          )}
          {pack.length > QR_MAX_CHARS ? (
            <div className="callout">
              <span aria-hidden><FileText size={18} /></span>
              <div>
                Dit pakket is te groot voor een QR-code ({pack.length.toLocaleString('nl-BE')} tekens).
                Deel de link via je gewone kanaal (Smartschool, mail), of geef het bestand mee.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <CodeQr value={pack.url} label="het klaspakket" size={180} copyLabel="Pakketlink kopiëren" />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => { void downloadPack(); }}>
              <ExportIcon size={16} /> Klaspakket downloaden (.json)
            </button>
            <span className="hint">
              Handig bij een lange link: zet het bestand op de schoolserver of een USB-stick. De
              leerling opent het bij <em>Klaspakket openen</em>.
            </span>
          </div>
        </>
      )}

      <hr className="divider" />
      <p className="hint" style={{ marginBottom: 0 }}>
        <PrivacyIcon size={14} className="icon-inline" /> In het pakket zitten de namen van je leerlingen. Deel het alleen met je eigen klas.
      </p>
    </Modal>
  );
}

// ── Opdracht toevoegen ──────────────────────────────────────────────────────

function NewAssignmentModal({
  cls, existing, voorgekozen, onClose, onSaved,
}: {
  cls: ClassGroup;
  existing: Assignment[];
  /** De cursus die al gekozen staat ("Toewijzen" in de sectie Studierichting). Anders staat er niets vooraf gekozen. */
  voorgekozen?: string;
  onClose: () => void;
  onSaved: (created: boolean, kind: 'course' | 'widget', targetId: string) => void;
}) {
  const courses = useMemo<Course[]>(() => getCourses(), []);
  // Heeft de klas een studierichting, dan staan de cursussen voor die richting bovenaan (twee groepen in de keuzelijst).
  const groepen = useMemo(() => {
    if (!cls.doelgroep) return null;
    const { passend, andere } = cursussenVoorToewijzen(courses, getCurricula(), cls.doelgroep);
    return passend.length > 0 ? { label: cursussenVoorLabel(cls.doelgroep), passend, andere } : null;
  }, [courses, cls.doelgroep]);
  const widgets = useMemo<Widget[]>(
    () => getWidgets().filter((w) => getTypeDef(w.type).hasSubmissions),
    []
  );
  const [kind, setKind] = useState<'course' | 'widget'>(courses.length > 0 ? 'course' : 'widget');
  const [targetId, setTargetId] = useState(() => (voorgekozen && courses.some((c) => c.id === voorgekozen) ? voorgekozen : ''));
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  // Zijn deadline en instructie overgenomen van een bestaande opdracht? Dan
  // horen ze bij die opdracht en mogen ze weg bij een andere keuze. Wat de
  // leerkracht zelf intikte, blijft staan.
  const overgenomen = useRef(false);

  const alReeds = (id: string) => existing.some((a) => a.kind === kind && a.targetId === id);
  const cursusOptie = (c: Course) => (
    <option key={c.id} value={c.id}>
      {c.coverEmoji} {c.title}{alReeds(c.id) ? ' (staat er al, wordt bijgewerkt)' : ''}
    </option>
  );

  // Bij een wissel van cursus of oefening de deadline en instructie van de
  // bestaande opdracht tonen: "bijwerken" overschrijft ze, en leeg laten zou
  // ze zonder waarschuwing wissen (zoals bij ShareModal).
  useEffect(() => {
    if (!targetId) return;
    const a = existing.find((x) => x.kind === kind && x.targetId === targetId);
    if (a) {
      setDue(a.dueAt ? toDateInputValue(a.dueAt) : '');
      setNote(a.note ?? '');
      overgenomen.current = true;
    } else if (overgenomen.current) {
      setDue('');
      setNote('');
      overgenomen.current = false;
    }
    // `existing` is bewust geen afhankelijkheid: alleen een wissel van keuze telt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, targetId]);

  const submit = () => {
    if (!targetId) return;
    // Deadline = einde van de gekozen dag; zo is "vandaag" ook echt vandaag nog.
    const dueAt = due ? new Date(`${due}T23:59:59`).getTime() : null;
    const { created } = upsertAssignment({
      classId: cls.id,
      kind,
      targetId,
      dueAt: Number.isFinite(dueAt) ? dueAt : null,
      note,
    });
    onSaved(created, kind, targetId);
    onClose();
  };

  return (
    <Modal
      title="Opdracht toevoegen"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!targetId} onClick={submit}>Toevoegen</button>
        </>
      }
    >
      <Field label="Wat geef je op?">
        <select
          className="select"
          value={kind}
          onChange={(e) => { setKind(e.target.value as 'course' | 'widget'); setTargetId(''); }}
        >
          <option value="course">Een cursus (lezen)</option>
          <option value="widget">Een oefening (maken)</option>
        </select>
      </Field>

      {kind === 'course' ? (
        courses.length === 0 ? (
          <p className="hint">Je hebt nog geen cursussen. Maak er eerst een bij <strong>Cursussen</strong>.</p>
        ) : (
          <Field label="Cursus" hint={groepen ? CURSUSSEN_BOVENAAN_HINT : undefined}>
            <select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— kies een cursus —</option>
              {groepen ? (
                <>
                  <optgroup label={groepen.label}>{groepen.passend.map(cursusOptie)}</optgroup>
                  {groepen.andere.length > 0 && <optgroup label={ANDERE_CURSUSSEN}>{groepen.andere.map(cursusOptie)}</optgroup>}
                </>
              ) : courses.map(cursusOptie)}
            </select>
          </Field>
        )
      ) : widgets.length === 0 ? (
        <p className="hint">Je hebt nog geen oefeningen met resultaten. Maak er eerst een bij <strong>Mijn widgets</strong>.</p>
      ) : (
        <Field label="Oefening">
          <select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— kies een oefening —</option>
            {widgets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} ({getTypeDef(w.type).name}){alReeds(w.id) ? ' (staat er al, wordt bijgewerkt)' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Deadline (optioneel)" hint="De leerling ziet “vandaag”, “over 2 dagen” of “te laat”. Boosterz sluit de opdracht niet af — jij beslist.">
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field label="Instructie (optioneel)" hint="Eén zin volstaat: wat verwacht je van de leerling?">
        <textarea
          className="textarea"
          rows={2}
          value={note}
          placeholder="bv. Maak deze oefening vóór vrijdag; je mag twee pogingen doen."
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

// ── Klaslijst bewerken ──────────────────────────────────────────────────────

/**
 * Twee wegen, bewust in deze volgorde:
 *  1. per leerling bijwerken (naam, nummer, verwijderen, toevoegen) — de id
 *     blijft dan behouden, en dus ook al het werk dat eraan hangt;
 *  2. de hele lijst vervangen door geplakte tekst — handig bij het begin van
 *     het schooljaar. Namen die al bestaan, houden ook daar hun id.
 * Alles gebeurt op een kladversie: annuleren verandert niets.
 */
function EditStudentsModal({
  cls, onClose, onSave,
}: { cls: ClassGroup; onClose: () => void; onSave: (students: ClassStudent[]) => void }) {
  const [draft, setDraft] = useState<ClassStudent[]>(() => sortedStudents(cls.students));
  const [nieuw, setNieuw] = useState('');
  const [nieuwFout, setNieuwFout] = useState('');
  const [plak, setPlak] = useState('');
  const [vervangStatus, setVervangStatus] = useState('');
  const nieuwRef = useRef<HTMLInputElement>(null);
  const basisId = useId();
  const nieuwFoutId = `${basisId}-nieuw-fout`;

  const wijzig = (id: string, patch: Partial<ClassStudent>) =>
    setDraft((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const voegToe = () => {
    const naam = nieuw.trim();
    if (!naam) return;
    // Dezelfde naam twee keer geeft twee leerlingen die Boosterz op naam niet uit elkaar houdt.
    if (nameTaken(draft, naam)) {
      setNieuwFout(nameTakenMessage(naam));
      nieuwRef.current?.focus();
      return;
    }
    setDraft((cur) => [...cur, { id: uid(), name: naam.slice(0, 80) }]);
    setNieuw('');
    setNieuwFout('');
    nieuwRef.current?.focus();
  };

  const vervang = () => {
    if (!plak.trim()) return;
    const dubbel = pastedDuplicatesMessage(duplicateNames(plak));
    const lijst = applyStudentList(draft, plak);
    setDraft(lijst);
    setPlak('');
    setVervangStatus(`Lijst vervangen: ${lijst.length} leerling${lijst.length === 1 ? '' : 'en'}.${dubbel ? ` ${dubbel}.` : ''}`);
  };

  const verdwijnen = cls.students.filter((s) => !draft.some((d) => d.id === s.id));
  // Een lege naam laat `getClasses` bij het lezen stil vallen: dan bewaren we niet.
  const legeRijen = draft.filter((s) => !s.name.trim()).length;
  const dubbeleNamen = duplicateStudentNames(draft);
  const dubbelIds = duplicateStudentIds(draft);

  return (
    <Modal
      title="Klaslijst bewerken"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={legeRijen > 0} onClick={() => { onSave(draft); onClose(); }}>Bewaren</button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Een leerling die je hier hernoemt, houdt al zijn werk. Verwijder je iemand, dan verdwijnt
        alleen de naam uit de lijst — zijn inzendingen blijven bij de resultaten staan.
      </p>

      <div role="status">
        {legeRijen > 0 && (
          <div className="callout err">
            <span aria-hidden><WarningIcon size={18} /></span>
            <div>Geef elke leerling een naam, of verwijder de lege {legeRijen === 1 ? 'rij' : 'rijen'}.</div>
          </div>
        )}
        {dubbeleNamen.length > 0 && (
          <div className="callout warn">
            <span aria-hidden><WarningIcon size={18} /></span>
            <div>{duplicatesInClassMessage(dubbeleNamen)}</div>
          </div>
        )}
      </div>

      <ul className="klas-lijst" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {draft.map((s, i) => {
          const leeg = !s.name.trim();
          const dubbel = dubbelIds.has(s.id);
          const meldingId = `${basisId}-rij-${s.id}`;
          return (
            <li key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input input-sm"
                type="number"
                min={1}
                max={999}
                style={{ width: 74 }}
                value={s.number ?? ''}
                aria-label={`Klasnummer van ${s.name || `leerling ${i + 1}`}`}
                onChange={(e) =>
                  wijzig(s.id, { number: e.target.value === '' ? undefined : Math.max(1, Math.min(999, Number(e.target.value))) })
                }
              />
              <input
                className="input input-sm klas-invoer"
                style={{ flex: '1 1 180px' }}
                value={s.name}
                aria-label={`Naam van leerling ${i + 1}`}
                aria-invalid={leeg || dubbel ? true : undefined}
                aria-describedby={leeg || dubbel ? meldingId : undefined}
                onChange={(e) => wijzig(s.id, { name: e.target.value })}
              />
              {(leeg || dubbel) && (
                <span id={meldingId} className="hint klas-rijmelding">
                  <WarningIcon size={14} className="icon-inline" /> {leeg ? 'geen naam' : 'dubbele naam'}
                </span>
              )}
              <button
                className="btn btn-sm btn-quiet btn-icon"
                aria-label={`${s.name || 'Leerling'} uit de lijst verwijderen`}
                onClick={() => setDraft((cur) => cur.filter((x) => x.id !== s.id))}
              >
                <DeleteIcon size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {draft.length === 0 && <p className="hint">Nog geen leerlingen in deze klas.</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ flex: '1 1 220px' }}>
          <Field label="Leerling toevoegen">
            <input
              ref={nieuwRef}
              className="input klas-invoer"
              value={nieuw}
              placeholder="Voornaam en naam"
              aria-invalid={nieuwFout ? true : undefined}
              aria-describedby={nieuwFout ? nieuwFoutId : undefined}
              onChange={(e) => { setNieuw(e.target.value); setNieuwFout(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); voegToe(); } }}
            />
          </Field>
        </div>
        <button className="btn btn-ghost" style={{ marginBottom: 14 }} disabled={!nieuw.trim()} onClick={voegToe}>
          <AddIcon size={16} /> Toevoegen
        </button>
      </div>
      {nieuwFout && (
        <div id={nieuwFoutId} className="callout err" role="alert">
          <span aria-hidden><WarningIcon size={18} /></span>
          <div>{nieuwFout}</div>
        </div>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          <ClipboardList size={16} className="icon-inline" /> Hele lijst vervangen door geplakte tekst
        </summary>
        <p className="hint" style={{ marginTop: 8 }}>
          Eén leerling per regel, een klasnummer mag erbij (“12 Emma Peeters”, “Emma Peeters;12”).
          Namen die al in de lijst staan, houden hun werk; wie je weglaat, verdwijnt uit de lijst.
        </p>
        <textarea
          className="textarea"
          rows={7}
          value={plak}
          aria-label="Klaslijst plakken"
          placeholder={'1 Emma Peeters\n2 Noah Claes'}
          onChange={(e) => { setPlak(e.target.value); setVervangStatus(''); }}
          style={{ width: '100%' }}
        />
        <p className="hint" role="status" style={{ margin: '6px 0 0' }}>
          {plak.trim() ? pastedDuplicatesMessage(duplicateNames(plak)) : vervangStatus}
        </p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} disabled={!plak.trim()} onClick={vervang}>
          Lijst vervangen
        </button>
      </details>

      <p className="hint" role="status" style={{ marginTop: 10, marginBottom: 0 }}>
        {draft.length} leerling{draft.length === 1 ? '' : 'en'} in de lijst
        {verdwijnen.length > 0 && ` · ${verdwijnen.length} verdwijnt er (${verdwijnen.map((s) => s.name).join(', ')})`}
      </p>
    </Modal>
  );
}
