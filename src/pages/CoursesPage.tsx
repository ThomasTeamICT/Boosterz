import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileBraces, FlaskConical, Hash, LoaderCircle } from 'lucide-react';
import type { Course } from '../lib/courseTypes';
import type { Curriculum } from '../lib/curriculumTypes';
import type { Widget } from '../lib/types';
import {
  adoptSharedCourse, conflictKey, createCourse, deleteCourse, ensureDemoCourse,
  exportCourseJson, findSharedConflicts, getCourse, getCourseProgressAll, getCourses,
  importCourseJson, pdfReferenceCount, restoreCoursePdfs, saveCourse,
  type CoursePdf, type SharedChoice, type SharedConflict,
} from '../lib/courses';
import { getCurricula } from '../lib/curriculum';
import { computeCoverage } from '../lib/coverage';
import { doelgroepTekst, doelgroepVoorCursus, sanitizeDoelgroep, type Doelgroep } from '../lib/doelgroep';
import { takeHandoff } from '../lib/handoff';
import { EXAMPLE_COURSE_ID } from '../lib/library';
import { onStorageChange, getPrefs, getWidgets } from '../lib/storage';
import { downloadFile, formatDateShort, makeCode, uid } from '../lib/utils';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { MenuButton, type MenuItem } from '../components/Menu';
import {
  AddIcon, CourseIcon, DeleteIcon, DuplicateIcon, EditIcon, ExportIcon, GoalIcon, ImportIcon, MoreIcon, PrintIcon,
  ResultsIcon, RetryIcon, RichtingIcon, ShareIcon, StudentIcon,
} from '../components/icons';
import { CourseShareModal } from '../components/course/CourseShareModal';
import { CourseAIModal } from '../components/course/CourseAIModal';
import { useNewParam } from '../lib/useNewParam';
import '../styles/materiaal.css';
import '../styles/richtingcursus.css';

/** Alles wat de AI-cursusbouwer vooringevuld kan krijgen. */
interface AIStart {
  focus: 'source' | 'curriculum';
  source?: string;
  title?: string;
  curriculumId?: string;
  goalCodes?: string[];
  originNote?: string;
  /** Studierichting (en jaar) uit de overdracht van "Voor een studierichting": komt op de cursus die de AI maakt. */
  doelgroep?: Doelgroep;
}

function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function CoursesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // Meteen uit de opslag lezen: zo flitst de lege toestand niet eerst op.
  const [courses, setCourses] = useState<Course[]>(getCourses);
  const [curricula, setCurricula] = useState<Curriculum[]>(getCurricula);
  const [widgets, setWidgets] = useState<Widget[]>(getWidgets);
  const [newOpen, setNewOpen] = useState(false);
  useNewParam(() => setNewOpen(true));
  const [aiStart, setAiStart] = useState<AIStart | null>(null);
  const [shareTarget, setShareTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [reloadExampleAsk, setReloadExampleAsk] = useState(false);
  const [importConflict, setImportConflict] = useState<{ bundle: ImportBundle; conflicten: SharedConflict[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exampleBusy, setExampleBusy] = useState(false);
  // Tijdens het installeren van de voorbeeldcursus schrijft de opslag honderden
  // keren; dan niet telkens alles opnieuw inlezen, maar één keer op het einde.
  const holdReload = useRef(false);

  const reload = () => {
    if (holdReload.current) return;
    setCourses(getCourses());
    setCurricula(getCurricula());
    setWidgets(getWidgets());
  };
  useEffect(() => {
    reload();
    // Voorbeeldinhoud lui laden (zoals in App.tsx): het voorbeeldleerplan moet
    // er eerst staan, want de democursus hangt zich eraan vast.
    void import('../lib/seed')
      .then((m) => m.ensureExampleCurriculum())
      .catch(() => { /* zonder voorbeeldleerplan werkt alles gewoon verder */ })
      .then(() => { ensureDemoCourse(); reload(); });
    return onStorageChange(reload);
  }, []);

  // Binnenkomen vanaf de importpagina: /cursussen?ai=nieuw met het
  // bronmateriaal in sessionStorage (lib/handoff.ts). Eén keer ophalen, de
  // query daarna wissen zodat een herlaadbeurt niets opnieuw opent.
  const handoffDone = useRef(false);
  useEffect(() => {
    if (handoffDone.current || searchParams.get('ai') !== 'nieuw') return;
    handoffDone.current = true;
    const h = takeHandoff();
    setAiStart({
      focus: h?.source?.trim() ? 'source' : 'curriculum',
      source: h?.source,
      title: h?.title,
      curriculumId: h?.curriculumId,
      goalCodes: h?.goalCodes,
      // Zonder `kader`, `kaderVolledig` en `volgtKader`: die horen bij een leerplan, niet bij een cursus.
      doelgroep: doelgroepVoorCursus(h?.doelgroep),
      originNote: h?.origin ? `Bron uit ${h.origin}` : h?.source ? 'Bron uit de importpagina' : undefined,
    });
    if (h?.origin) toast(`Bron uit ${h.origin} overgenomen`, 'ok');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('ai');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  /** Leerplantitel + dekkingspercentage per cursus (alleen met curriculumId). */
  const coverageByCourse = useMemo(() => {
    const map = new Map<string, { title: string; percent: number; covered: number; total: number }>();
    for (const course of courses) {
      if (!course.curriculumId) continue;
      const cur = curricula.find((c) => c.id === course.curriculumId);
      if (!cur) continue;
      const res = computeCoverage(course, cur, widgets);
      map.set(course.id, { title: cur.title, percent: res.percent, covered: res.covered, total: res.total });
    }
    return map;
  }, [courses, curricula, widgets]);

  const readersByCourse = useMemo(
    () => new Map(courses.map((c) => [c.id, getCourseProgressAll(c.id).length])),
    [courses]
  );

  const exampleInstalled = courses.some((c) => c.id === EXAMPLE_COURSE_ID);

  const duplicate = (course: Course) => {
    const copy: Course = JSON.parse(JSON.stringify(course));
    copy.id = uid();
    copy.code = makeCode();
    copy.title = `${course.title} (kopie)`;
    copy.createdAt = Date.now();
    saveCourse(copy);
    toast('Cursus gedupliceerd', 'ok');
  };

  // Voorbeeldcursus (bestaand materiaal van een leerkracht, 14 hoofdstukken):
  // lui opgehaald uit public/voorbeelden, zie lib/examples.ts. Knop en
  // ?voorbeeld=1 gebruiken dezelfde installatie.
  const busyRef = useRef(false);
  const loadExample = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setExampleBusy(true);
    holdReload.current = true;
    try {
      const m = await import('../lib/examples');
      const res = await m.installExampleCourse();
      toast(res.message, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Voorbeeldcursus laden mislukt', 'err');
    } finally {
      holdReload.current = false;
      busyRef.current = false;
      setExampleBusy(false);
      reload();
    }
  };

  // /cursussen?voorbeeld=1 (bv. vanaf de startpagina): één keer installeren
  // en de parameter wegnemen, zodat terugkeren of herladen niets herhaalt.
  // Staat de cursus er al, dan overschrijven we ze niet via een link: eigen
  // aanpassingen blijven. Opnieuw laden kan bewust via het menu van de cursus.
  const exampleParamDone = useRef(false);
  useEffect(() => {
    // De vlag vangt de dubbele uitvoering van StrictMode op; zodra de
    // parameter weg is, mag een volgende link (ook op deze pagina) weer werken.
    if (searchParams.get('voorbeeld') !== '1') { exampleParamDone.current = false; return; }
    if (exampleParamDone.current) return;
    exampleParamDone.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('voorbeeld');
      return next;
    }, { replace: true });
    if (getCourse(EXAMPLE_COURSE_ID)) {
      toast('De voorbeeldcursus staat al in je cursussen', 'info');
      requestAnimationFrame(() => {
        document.getElementById(`cursus-${EXAMPLE_COURSE_ID}`)?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    void loadExample();
    // loadExample is stabiel genoeg: enkel de URL is de trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, toast]);

  /**
   * Cursusbestand overnemen (na de vraag, als die nodig was): de cursus en haar
   * widgets, daarna de pdf's (CU4). De pdf's komen pas na de keuze en alleen
   * voor wat bewaard werd: bij "Mijn versie houden" blijven er anders pdf's
   * zonder verwijzing in IndexedDB staan. Eerlijk melden wat er gebeurde, ook
   * als de opslag vol was.
   */
  const finishImport = async (bundle: ImportBundle, keuze?: { choice: SharedChoice; conflicten: SharedConflict[] }) => {
    try {
      const hadCourse = Boolean(getCourse(bundle.course.id));
      const res = adoptSharedCourse(
        bundle.course,
        bundle.widgets,
        keuze ? { conflicts: { choice: keuze.choice, keys: keuze.conflicten.map(conflictKey) } } : {}
      );
      const pdf = await restoreCoursePdfs(bundle.pdfs.filter((p) => pdfReferenceCount(p.id) > 0));
      const titel = bundle.course.title;
      let melding: string;
      if (keuze?.choice === 'kopie') melding = `"${titel}" geïmporteerd: wat al bestond, staat ernaast als kopie`;
      else if (keuze?.choice === 'houden') melding = `"${titel}" geïmporteerd: je eigen versie bleef staan`;
      else if (keuze?.choice === 'bijwerken') melding = `"${titel}" vervangen door de versie uit het bestand`;
      else if (!hadCourse) melding = `Cursus "${titel}" geïmporteerd${bundle.widgets.length ? ` (met ${n(bundle.widgets.length, 'widget', 'widgets')})` : ''}`;
      else if (res.updated > 0 || res.added > 0) melding = `Cursus "${titel}" bijgewerkt`;
      else melding = `Cursus "${titel}" stond al zo op dit toestel`;
      if (pdf.restored > 0) melding += ` · ${n(pdf.restored, 'pdf', "pdf's")} teruggezet`;
      if (!res.ok || pdf.failed > 0) {
        toast(`${melding}. Let op: niet alles kon bewaard worden, de opslag van dit toestel is vol.`, 'err');
      } else {
        toast(melding, 'ok');
      }
    } catch {
      toast('Importeren mislukt', 'err');
    }
  };

  const importFile = async (f: File) => {
    try {
      const res = importCourseJson(await f.text());
      if (!res) {
        toast('Dit is geen geldig cursusbestand', 'err');
        return;
      }
      // Staat er al een andere versie van deze cursus of van een van haar
      // widgets als eigen werk? Dan nooit stil overschrijven en ook geen
      // stille no-op: vraag het (V3). Ook oudere versies, want een bestand
      // terugzetten (back-up) is een bewuste keuze.
      const conflicten = await findSharedConflicts([res.course], res.widgets, { includeOlder: true });
      if (conflicten.length > 0) {
        setImportConflict({ bundle: res, conflicten });
        return;
      }
      await finishImport(res);
    } catch {
      toast('Importeren mislukt', 'err');
    }
  };

  const courseMenu = (course: Course): MenuItem[] => {
    const items: MenuItem[] = [
      { label: 'Volgen', hint: 'Voortgang van je leerlingen', Icon: ResultsIcon, to: `/cursus/volg/${course.id}` },
      { label: 'Delen', hint: 'Link, code of insluiten in je leerplatform', Icon: ShareIcon, onSelect: () => setShareTarget(course) },
      { label: 'Dupliceren', Icon: DuplicateIcon, onSelect: () => duplicate(course) },
      {
        label: 'Afdrukken', hint: 'Opent in een nieuw tabblad', Icon: PrintIcon,
        onSelect: () => { window.open(`#/cursus/print/${course.id}`, '_blank', 'noopener'); },
      },
      {
        label: 'Exporteren', hint: 'Als bestand (.json), met de oefeningen', Icon: ExportIcon,
        onSelect: () => {
          exportCourseJson(course)
            .then((json) => downloadFile(`${course.title || 'cursus'}.json`, json))
            .catch(() => toast('Exporteren mislukt. Probeer opnieuw; lukt het niet, dan is de cursus misschien te groot voor dit toestel.', 'err'));
        },
      },
    ];
    if (course.id === EXAMPLE_COURSE_ID) {
      items.push({ label: 'Voorbeeld opnieuw laden', hint: 'Terug naar de originele versie', Icon: RetryIcon, onSelect: () => setReloadExampleAsk(true) });
    }
    items.push({ label: 'Verwijderen', Icon: DeleteIcon, danger: true, separator: true, onSelect: () => setDeleteTarget(course) });
    return items;
  };

  const exampleButton = (className: string) => (
    <button
      type="button"
      className={className}
      onClick={() => { void loadExample(); }}
      disabled={exampleBusy}
      aria-busy={exampleBusy}
      title="Een echte cursus natuurwetenschappen (14 hoofdstukken, uit pdf's ingelezen) als voorbeeld in je bibliotheek zetten"
    >
      {exampleBusy ? <LoaderCircle size={18} className="mat-spin" /> : <FlaskConical size={18} />}
      {exampleBusy ? 'Voorbeeldcursus wordt geladen…' : 'Voorbeeldcursus laden'}
    </button>
  );

  return (
    <div className="page mat-page">
      <div className="page-head">
        <div>
          <h1>Cursussen</h1>
          <p className="sub">Digitale cursussen die je per hoofdstuk deelt en opvolgt, met oefeningen erin.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/importeren" className="btn btn-ghost" title="Vertrek van een document, pdf of presentatie die je al hebt">
            <ImportIcon size={18} /> Uit bestaand materiaal
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setAiStart({ focus: 'curriculum' })}
            title="Kies je leerplandoelen; de AI bouwt een cursus die ze allemaal dekt"
          >
            <GoalIcon size={18} /> Blanco vanuit leerplan
          </button>
          <Link to="/cursussen/richtingen" className="btn btn-ghost" title="Kies een richting en een jaar: de cursus hangt meteen aan de juiste doelen">
            <RichtingIcon size={18} /> Voor een studierichting
          </Link>
          <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()} title="Een cursusbestand (.json) terugzetten">
            <FileBraces size={18} /> JSON openen
          </button>
          {!exampleInstalled && courses.length > 0 && exampleButton('btn btn-quiet')}
          <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
            <AddIcon size={18} /> Zelf bouwen
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState icon={<CourseIcon size={40} />} title="Nog geen cursussen">
          <p>
            Er zijn vier manieren om te starten. Kies er een: je kan achteraf altijd alles zelf
            aanpassen, en de AI blijft een voorzet die jij nakijkt.
          </p>
          <div className="mat-starts">
            <div className="card card-pad">
              <strong><ImportIcon size={18} /> Uit bestaand materiaal</strong>
              <p className="hint">Je hebt al een cursustekst, een pdf of een presentatie? Lees ze in en laat er een digitale cursus van maken.</p>
              <Link to="/importeren" className="btn btn-sm btn-ghost">Materiaal inlezen</Link>
            </div>
            <div className="card card-pad">
              <strong><GoalIcon size={18} /> Blanco vanuit leerplan</strong>
              <p className="hint">Kies je leerplandoelen; de AI bouwt een dekkende cursus met de doelcodes al op de secties.</p>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAiStart({ focus: 'curriculum' })}>Doelen kiezen</button>
            </div>
            <div className="card card-pad">
              <strong><AddIcon size={18} /> Zelf bouwen</strong>
              <p className="hint">Begin met een leeg hoofdstuk en bouw sectie per sectie, met of zonder AI-hulp onderweg.</p>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setNewOpen(true)}>Lege cursus</button>
            </div>
            <div className="card card-pad">
              <strong><RichtingIcon size={18} /> Voor een studierichting</strong>
              <p className="hint">Kies je richting en je jaar. De cursus krijgt meteen de officiële minimumdoelen, ook zonder AI.</p>
              <Link to="/cursussen/richtingen" className="btn btn-sm btn-ghost">Richting kiezen</Link>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            Eerst eens zien hoe een ingelezen cursus eruitziet? Laad de <strong>voorbeeldcursus natuurwetenschappen</strong>:
            14 hoofdstukken uit de pdf's van een leerkracht, met afbeeldingen, doelcodes en oefeningen.
          </p>
          {exampleButton('btn btn-sm btn-ghost')}
        </EmptyState>
      ) : (
        <ul className="mat-grid">
          {courses.map((course) => {
            const sections = course.chapters.reduce((a, c) => a + c.sections.length, 0);
            const readers = readersByCourse.get(course.id) ?? 0;
            const cov = coverageByCourse.get(course.id);
            const dg = sanitizeDoelgroep(course.doelgroep);
            const richting = dg ? doelgroepTekst(dg) : '';
            // Een cursus uit de richtingenhulp heet vaak al zo: dan hoort de regel niet nog eens onder de titel.
            const toonRichting = richting !== '' && richting !== course.title.trim();
            return (
              <li key={course.id}>
                <article className="card mat-card" id={`cursus-${course.id}`}>
                  <div className="mat-card-head">
                    <span className="mat-card-icon" aria-hidden="true"><CourseIcon size={20} /></span>
                    <div className="mat-card-titles">
                      <h2 className="mat-card-title">{course.title}</h2>
                      {course.subtitle && course.subtitle !== richting && <p className="mat-card-sub">{course.subtitle}</p>}
                      {toonRichting && (
                        <p className="rc-doelgroep">
                          <RichtingIcon size={14} />
                          <span><span className="sr-only">Studierichting: </span>{richting}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <ul className="mat-facts">
                    <li>
                      <CourseIcon size={16} />
                      <span>{n(course.chapters.length, 'hoofdstuk', 'hoofdstukken')} · {n(sections, 'sectie', 'secties')}</span>
                    </li>
                    <li>
                      <Hash size={16} />
                      <span>Code <span className="mat-code">{course.code}</span> · bijgewerkt {formatDateShort(course.updatedAt)}</span>
                    </li>
                    {cov && (
                      <li>
                        <GoalIcon size={16} />
                        <span>
                          {cov.title}
                          <span className="mat-cover">
                            <span className="badge badge-brand" title={`${cov.covered} van ${cov.total} leerplandoelen komen aan bod in een gewone sectie`}>
                              Dekking {cov.percent}% ({cov.covered}/{cov.total})
                            </span>
                          </span>
                        </span>
                      </li>
                    )}
                    <li>
                      <StudentIcon size={16} />
                      <span>{n(readers, 'lezer', 'lezers')}</span>
                    </li>
                  </ul>
                  <div className="mat-card-actions">
                    <Link to={`/cursus/bewerk/${course.id}`} className="btn btn-sm btn-primary">
                      <EditIcon size={16} /> Bewerken
                      <span className="sr-only">: {course.title}</span>
                    </Link>
                    <MenuButton
                      items={courseMenu(course)}
                      Icon={MoreIcon}
                      ariaLabel={`Acties voor ${course.title}`}
                      className="btn btn-quiet btn-icon"
                    />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {newOpen && (
        <NewCourseModal
          onClose={() => setNewOpen(false)}
          onCreate={(title) => {
            const c = createCourse(title, getPrefs().teacherName);
            saveCourse(c);
            navigate(`/cursus/bewerk/${c.id}`);
          }}
        />
      )}
      {aiStart && (
        <CourseAIModal
          mode="new"
          focus={aiStart.focus}
          initialSource={aiStart.source}
          initialTitle={aiStart.title}
          initialSubject={aiStart.doelgroep?.vak}
          initialAudience={aiStart.doelgroep ? doelgroepTekst(aiStart.doelgroep, { zonderVak: true }) : undefined}
          initialCurriculumId={aiStart.curriculumId}
          initialGoalCodes={aiStart.goalCodes}
          originNote={aiStart.originNote}
          onClose={() => setAiStart(null)}
          onResult={(course) => {
            // De AI zet nooit een studierichting: die komt uit de overdracht van "Voor een studierichting".
            saveCourse(aiStart.doelgroep ? { ...course, doelgroep: aiStart.doelgroep } : course);
            navigate(`/cursus/bewerk/${course.id}`);
          }}
        />
      )}
      {importConflict && (
        <ImportConflictModal
          conflicten={importConflict.conflicten}
          onKies={(choice) => {
            const { bundle, conflicten } = importConflict;
            setImportConflict(null);
            void finishImport(bundle, { choice, conflicten });
          }}
          onClose={() => setImportConflict(null)}
        />
      )}
      {reloadExampleAsk && (
        <ConfirmModal
          title="Voorbeeldcursus opnieuw laden?"
          message="De voorbeeldcursus wordt vervangen door de originele versie. Wat je in de cursus zelf aanpaste, gaat verloren. De oefeningen en de leesvoortgang van je leerlingen blijven staan."
          confirmLabel="Opnieuw laden"
          onConfirm={() => { void loadExample(); }}
          onClose={() => setReloadExampleAsk(false)}
        />
      )}
      {shareTarget && <CourseShareModal course={shareTarget} onClose={() => setShareTarget(null)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Cursus verwijderen?"
          message={`"${deleteTarget.title}" en de bijhorende leesvoortgang van leerlingen worden definitief verwijderd. De oefeningen uit de cursus blijven bestaan bij Widgets.`}
          onConfirm={() => { deleteCourse(deleteTarget.id); toast('Cursus verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

type ImportBundle = { course: Course; widgets: Widget[]; pdfs: CoursePdf[] };

/**
 * Het bestand bevat een andere versie van een cursus of widget die hier al als
 * eigen werk staat. Drie keuzes, nooit stil overschrijven (V3). Sluiten
 * (Escape of Annuleren) importeert niets.
 */
function ImportConflictModal({
  conflicten, onKies, onClose,
}: {
  conflicten: SharedConflict[];
  onKies: (choice: SharedChoice) => void;
  onClose: () => void;
}) {
  const keuzes: { choice: SharedChoice; label: string; uitleg: string; primary?: boolean }[] = [
    {
      choice: 'bijwerken',
      label: 'Vervangen door de versie uit het bestand',
      uitleg: 'Je huidige versie gaat verloren (exporteer ze eerst als je twijfelt).',
      primary: true,
    },
    { choice: 'houden', label: 'Mijn versie houden', uitleg: 'Wat hier staat, blijft; de rest van het bestand komt erbij.' },
    { choice: 'kopie', label: 'Als kopie bewaren', uitleg: 'De versie uit het bestand komt ernaast, met “(kopie)” in de titel.' },
  ];
  return (
    <Modal
      title="Er staat al een versie op dit toestel"
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>}
    >
      <p>Het bestand bevat een andere versie van:</p>
      <ul>
        {conflicten.map((c) => (
          <li key={conflictKey(c)}>
            {c.kind === 'course' ? 'Cursus' : 'Widget'} <strong>“{c.title}”</strong>
            {c.localTitle !== c.title && <> (hier: “{c.localTitle}”)</>}
            {c.older && <> — de versie in het bestand is <strong>ouder</strong> dan die op dit toestel</>}
          </li>
        ))}
      </ul>
      <div style={{ display: 'grid', gap: 12 }}>
        {keuzes.map((k) => (
          <div key={k.choice}>
            <button
              type="button"
              className={`btn ${k.primary ? 'btn-primary' : 'btn-ghost'}`}
              style={{ width: '100%' }}
              aria-describedby={`import-keuze-${k.choice}`}
              onClick={() => onKies(k.choice)}
            >
              {k.label}
            </button>
            <p id={`import-keuze-${k.choice}`} className="hint" style={{ margin: '4px 0 0' }}>{k.uitleg}</p>
          </div>
        ))}
      </div>
      <p className="hint">Leesvoortgang van leerlingen blijft altijd staan.</p>
    </Modal>
  );
}

function NewCourseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const submit = () => { if (title.trim()) onCreate(title.trim()); };
  return (
    <Modal
      title="Nieuwe cursus"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={submit}>Aanmaken</button>
        </>
      }
    >
      <Field label="Titel van de cursus">
        <input
          className="input" value={title} autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="bv. De waterkringloop"
        />
      </Field>
    </Modal>
  );
}
