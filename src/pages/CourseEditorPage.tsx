// ── Cursuseditor: hoofdstukken → secties → blokken ──────────────────────────
//
// Eigen paginashell (geen Layout), zoals de widgeteditor. Links de structuur,
// rechts de geselecteerde sectie met haar blokken. Alles wordt automatisch
// bewaard met een korte pauze; bij weggaan wordt de laatste stand bewaard.
//
// Het bewaren zelf zit in components/course/editorSync.ts (te testen zonder
// React): nooit iets overschrijven wat een ander tabblad intussen bewaarde,
// eerlijk "Niet bewaard" bij een volle opslag, en pdf-bestanden pas opruimen
// na een geslaagde bewaring.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Blocks, ExternalLink } from 'lucide-react';
import type { Course, CourseBlock, CourseBlockType, CourseChapter, CourseSection } from '../lib/courseTypes';
import { allSections } from '../lib/courseTypes';
import type { Curriculum } from '../lib/curriculumTypes';
import {
  exportCourseJson, getCourse, makeBlock, onCoursesChangedElsewhere, pdfReferenceCount, saveCourse, saveCourseGuarded,
} from '../lib/courses';
import { hasUnresolvedMedia, onMediaChange } from '../lib/mediaStore';
import { deletePdf } from '../lib/pdfStore';
import { onStorageNotice } from '../lib/storageHealth';
import { getCurricula, getCurriculum } from '../lib/curriculum';
import { doelgroepTekst, sanitizeDoelgroep } from '../lib/doelgroep';
import { getWidgets } from '../lib/storage';
import { downloadFile, makeCode, uid } from '../lib/utils';
import { CheckRow, ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { BLOCK_META, BlockEditor, PALETTE_ORDER, blockIcon, duplicateBlock } from '../components/course/blockEditors';
import { isEmptyBlock, nietsTeVerliezen } from '../components/course/emptyBlock';
import {
  coursePreviewHash, createCourseDraft, pdfIdsInBlocks, sectionHasContent,
  type DraftSnapshot, type DraftStore, type EditorConflict,
} from '../components/course/editorSync';
import { CourseAIModal } from '../components/course/CourseAIModal';
import { GoalCodeInput } from '../components/curriculum/GoalCodeInput';
import { GoalCoverage } from '../components/course/GoalCoverage';
import type { RichtingKiezerModalProps } from '../components/richting/RichtingKiezerModal';
import type { OptimizePreset } from '../lib/aiCourse';
import {
  AddIcon, AIIcon, BackIcon, CheckIcon, CourseIcon, DeleteIcon, DownloadIcon, DuplicateIcon, GoalIcon, InfoIcon,
  MoveDownIcon, MoveUpIcon, PreviewIcon, PrintIcon, ResultsIcon, RetryIcon, SettingsIcon, WarningIcon,
} from '../components/icons';
import '../styles/cursus.css';
import '../styles/richtingcursus.css';

/** De echte opslag achter de bewaarmotor. */
const COURSE_STORE: DraftStore = {
  read: (id) => getCourse(id),
  saveGuarded: (course, expected, opts) => saveCourseGuarded(course, expected, opts),
  saveNew: (course) => saveCourse(course),
  pdfRefsSaved: (pdfId) => pdfReferenceCount(pdfId),
  deletePdf: (pdfId) => { void deletePdf(pdfId); },
  newId: uid,
  newCode: makeCode,
  now: () => Date.now(),
};

const SAVE_FAILED_TEXT = 'Bewaren op dit toestel is mislukt. Staat de opslag vol, of blokkeert de browser ze?';

// ── Immutabele hulpjes ──────────────────────────────────────────────────────

function moveItem<T>(arr: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  const [x] = copy.splice(i, 1);
  copy.splice(j, 0, x);
  return copy;
}

function patchChapter(course: Course, chapterId: string, fn: (ch: CourseChapter) => CourseChapter): Course {
  return { ...course, chapters: course.chapters.map((ch) => (ch.id === chapterId ? fn(ch) : ch)) };
}

function patchSection(course: Course, sectionId: string, fn: (s: CourseSection) => CourseSection): Course {
  return {
    ...course,
    chapters: course.chapters.map((ch) => ({
      ...ch,
      sections: ch.sections.map((se) => (se.id === sectionId ? fn(se) : se)),
    })),
  };
}

type PendingDelete =
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'section'; chapterId: string; sectionId: string }
  | { kind: 'block'; sectionId: string; blockId: string };

function findBlock(course: Course, sectionId: string, blockId: string): CourseBlock | undefined {
  return allSections(course).find((x) => x.section.id === sectionId)?.section.blocks.find((b) => b.id === blockId);
}

/** Titel en uitleg van de bevestiging: wat gaat er precies verloren? */
function deleteQuestion(p: PendingDelete, course: Course): { title: string; message: string } {
  if (p.kind === 'chapter') {
    return {
      title: 'Hoofdstuk verwijderen?',
      message: 'Dit hoofdstuk bevat nog secties. Alles erin wordt definitief verwijderd (widgets zelf blijven bestaan).',
    };
  }
  if (p.kind === 'section') {
    return {
      title: 'Sectie verwijderen?',
      message: 'Deze sectie bevat nog blokken of leerdoelen. Ze wordt definitief verwijderd (widgets zelf blijven bestaan).',
    };
  }
  const block = findBlock(course, p.sectionId, p.blockId);
  const name = block ? BLOCK_META[block.type].name : 'blok';
  let extra = '';
  if (block?.type === 'widget') extra = ' De widget zelf blijft bestaan.';
  if (block?.type === 'pdf' && block.pdfId) {
    extra = ' Gebruikt geen ander blok het pdf-bestand nog, dan verdwijnt ook dat van dit toestel.';
  }
  return { title: 'Blok verwijderen?', message: `Het blok “${name}” heeft inhoud. Het wordt definitief verwijderd.${extra}` };
}

type AIModalState =
  | { mode: 'rework' }
  | { mode: 'optimize'; preset?: OptimizePreset }
  | { mode: 'section'; sectionId: string }
  | { mode: 'exercises'; sectionId: string }
  | null;

// ── De pagina ───────────────────────────────────────────────────────────────

export function CourseEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const initial = useMemo(() => (id ? getCourse(id) : undefined), [id]);
  // De bewaarmotor is de enige bron van de cursus op het scherm. Wijzigen gaat
  // via draft.edit (altijd op de laatste stand); bewaren na 800 ms pauze.
  const [draft] = useState(() => createCourseDraft(COURSE_STORE, initial));
  const snap = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const course = snap.course;
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>(
    () => initial?.chapters[0]?.sections[0]?.id
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [aiModal, setAiModal] = useState<AIModalState>(null);
  const [paletteAt, setPaletteAt] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  /** Laatste ernstige opslagmelding (de editor valt buiten Layout en toont ze zelf). */
  const [notice, setNotice] = useState<{ message: string; at: number } | null>(null);

  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Na weggaan: zeggen wat er met niet-bewaarde wijzigingen gebeurde.
  const reportLeave = (out: { copy: Course | null; failed: boolean }) => {
    if (out.copy) toastRef.current(`Je niet-bewaarde wijzigingen staan in een kopie: “${out.copy.title}”.`, 'info');
    else if (out.failed) toastRef.current('Je laatste wijzigingen aan de cursus zijn niet bewaard: de opslag van dit toestel is vol of geblokkeerd.', 'err');
  };
  const reportLeaveRef = useRef(reportLeave);
  useEffect(() => { reportLeaveRef.current = reportLeave; });

  // Zelfde route, andere cursus (terug/vooruit tussen twee editors, of de
  // kopie na een conflict): de pagina blijft gemonteerd. Eerst de vorige
  // cursus afronden, dan de nieuwe tonen; openen schrijft niets.
  useEffect(() => {
    if (draft.current()?.id === initial?.id) return;
    reportLeaveRef.current(draft.leave());
    draft.open(initial);
    setSelectedSectionId(initial?.chapters[0]?.sections[0]?.id);
  }, [draft, initial]);

  // Een ander tabblad bewaarde de cursussen (CU2): zonder eigen wijzigingen
  // gewoon de nieuwe versie tonen, anders pauzeren en de leerkracht laten kiezen.
  useEffect(() => onCoursesChangedElsewhere(() => { draft.external(); }), [draft]);

  // Weggaan: wie binnen de pauze wegklikt, verliest anders de laatste
  // wijzigingen. Ook bij F5/tabblad sluiten (pagehide), want dan draait de
  // React-cleanup niet. Bij een open conflict komt het werk in een kopie.
  // (Dit effect staat vóór de meldingen hieronder: bij het afbreken luistert
  // de editor dan nog, zodat een mislukte laatste bewaring geen alert geeft.)
  useEffect(() => {
    const onHide = () => { draft.leave(); };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      reportLeaveRef.current(draft.leave());
      draft.dispose();
    };
  }, [draft]);

  // Mislukt bewaren (CU7): de editor staat buiten Layout, dus de balk van de
  // schil is er niet. Zolang hier iemand luistert, valt de opslag ook niet
  // terug op een alert(); de melding komt als balk in de editor.
  useEffect(() => onStorageNotice((n) => { if (n.severe) setNotice({ message: n.message, at: n.at }); }), []);

  // De AI-hulp vervangt straks de hele cursus: zolang ze openstaat, nooit
  // stil herladen uit een ander tabblad.
  useEffect(() => { draft.setBusy(aiModal !== null); }, [draft, aiModal]);

  // Niet-bewaarde wijzigingen die nergens heen kunnen: de browser vraagt eerst
  // of je echt wil weggaan (tabblad sluiten, herladen).
  const guardLeave = snap.dirty && (snap.saveFailed || snap.conflict !== null);
  useEffect(() => {
    if (!guardLeave) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guardLeave]);

  // Weggaan binnen de app (Terug, een link, de vorige-knop van de browser)
  // terwijl bewaren niet lukt (E2): eerst nog eens proberen te bewaren, en
  // lukt het niet, dan vragen. Met een open conflict komt het werk in een
  // kopie (afspraak 5), dus dan vraagt de editor niets.
  const shouldBlock = useCallback(() => {
    const s = draft.getSnapshot();
    if (!s.dirty || s.conflict) return false;
    return draft.save() === 'mislukt';
  }, [draft]);
  const blocker = useBlocker(shouldBlock);

  // Media uit een ander tabblad die er bij het overnemen nog niet was (nieuwe
  // afbeelding) komt even later binnen: dan opnieuw lezen, anders blijft ze
  // kapot tot herladen (B4). Gebeurt niets als er iets onbewaard is.
  useEffect(() => onMediaChange(() => {
    const c = draft.current();
    if (c && hasUnresolvedMedia(c)) draft.refresh();
  }), [draft]);

  /** Na een knop in een melding verdwijnt die knop: de focus mag niet op <body> belanden (E8). */
  const titleRef = useRef<HTMLInputElement>(null);
  const focusTitle = () => { titleRef.current?.focus(); };

  // Leerplan van de cursus (voor de doelcodes en de dekking). De widgets halen
  // we pas op als het dekkingspaneel echt opengaat — dat scheelt werk bij elke
  // toetsaanslag in de editor.
  const curriculum: Curriculum | undefined = useMemo(
    () => (course?.curriculumId ? getCurriculum(course.curriculumId) : undefined),
    [course?.curriculumId]
  );
  const widgets = useMemo(() => (goalsOpen ? getWidgets() : []), [goalsOpen]);

  if (!course) {
    return (
      <main id="main" className="page page-narrow" style={{ paddingTop: 60 }}>
        <EmptyState level={1} icon={<CourseIcon size={40} />} title="Cursus niet gevonden">
          <p style={{ color: 'var(--text-soft)' }}>Deze cursus bestaat niet (meer) in deze browser.</p>
          <Link to="/cursussen" className="btn btn-primary"><BackIcon size={16} /> Naar mijn cursussen</Link>
        </EmptyState>
      </main>
    );
  }

  const sections = allSections(course);
  const selected = sections.find((x) => x.section.id === selectedSectionId) ?? sections[0];
  const edit = draft.edit;

  /** Onmiddellijk bewaren vóór een voorbeeld of afdruk in een nieuw tabblad. */
  const saveBeforeOpen = () => {
    const out = draft.save();
    if (out === 'mislukt' || out === 'conflict') {
      toast('Let op: je laatste wijzigingen zijn nog niet bewaard. Het nieuwe tabblad toont de bewaarde versie.', 'err');
    }
  };

  const retrySave = () => {
    const out = draft.save();
    if (out === 'mislukt') {
      toast('Nog altijd niet bewaard. Maak eerst plaats vrij op dit toestel.', 'err');
      return; // de knop blijft staan, dus de focus ook
    }
    if (out === 'bewaard') toast('Bewaard', 'ok');
    focusTitle();
  };

  // Keuzes bij een conflict met een ander tabblad.
  const loadTheirs = () => {
    if (draft.loadTheirs()) toast('Je ziet nu de versie uit het andere tabblad.', 'info');
    focusTitle();
  };
  const keepMine = () => {
    if (draft.keepMine() === 'bewaard') {
      toast('Jouw versie is bewaard.', 'ok');
      focusTitle();
    } else toast('Bewaren is mislukt. Je versie staat nog op het scherm.', 'err');
  };
  const saveCopy = () => {
    const copy = draft.saveCopy();
    if (!copy) {
      toast('De kopie kon niet bewaard worden. Je versie staat nog op het scherm.', 'err');
      return;
    }
    toast(`Je versie staat apart als “${copy.title}”. Het origineel bleef zoals in het andere tabblad.`, 'ok');
    focusTitle();
    navigate(`/cursus/bewerk/${copy.id}`);
  };

  /** De cursus als bestand bewaren, zoals de export op "Mijn cursussen" (E2: een uitweg als bewaren niet lukt). */
  const downloadCourse = async () => {
    const cur = draft.current();
    if (!cur) return;
    try {
      downloadFile(`${cur.title.trim() || 'cursus'}.json`, await exportCourseJson(cur));
      toast('De cursus is gedownload als bestand. Terugzetten kan op “Mijn cursussen” met “JSON openen”.', 'ok');
    } catch {
      toast('Downloaden is mislukt. Probeer opnieuw; lukt het niet, dan is de cursus misschien te groot voor dit toestel.', 'err');
    }
  };
  /** Bewust weggaan zonder bewaren: eerst loslaten, zodat het afbreken niet nog eens een foutmelding geeft. */
  const leaveAnyway = () => {
    draft.discard();
    blocker.proceed?.();
  };
  const discardAndLeave = () => {
    draft.discard();
    navigate('/cursussen');
  };

  const mutateSection = (sectionId: string, fn: (s: CourseSection) => CourseSection) =>
    edit((c) => patchSection(c, sectionId, fn));

  const doDelete = (p: PendingDelete) => {
    const cur = draft.current();
    if (!cur) return;
    if (p.kind === 'chapter') {
      // Pdf-bestanden in wat verdwijnt: opruimen na het bewaren, als niets anders ze nog gebruikt.
      const ch = cur.chapters.find((x) => x.id === p.chapterId);
      ch?.sections.forEach((s) => pdfIdsInBlocks(s.blocks).forEach((pid) => draft.releasePdf(pid)));
      edit((c) => ({ ...c, chapters: c.chapters.filter((x) => x.id !== p.chapterId) }));
      return;
    }
    if (p.kind === 'block') {
      const block = findBlock(cur, p.sectionId, p.blockId);
      if (block?.type === 'pdf') draft.releasePdf(block.pdfId);
      mutateSection(p.sectionId, (s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== p.blockId) }));
      return;
    }
    // Sectie: buur selecteren als de geselecteerde verdwijnt.
    const ch = cur.chapters.find((x) => x.id === p.chapterId);
    const se = ch?.sections.find((s) => s.id === p.sectionId);
    if (se) pdfIdsInBlocks(se.blocks).forEach((pid) => draft.releasePdf(pid));
    if (ch && selected?.section.id === p.sectionId) {
      const i = ch.sections.findIndex((s) => s.id === p.sectionId);
      const neighbour = ch.sections[i + 1]?.id ?? ch.sections[i - 1]?.id;
      setSelectedSectionId(neighbour);
    }
    edit((c) => patchChapter(c, p.chapterId, (chap) => ({ ...chap, sections: chap.sections.filter((s) => s.id !== p.sectionId) })));
  };

  /** Direct verwijderen als er niets in zit; anders eerst bevestigen (CU3, CU15e, E6). */
  const askDelete = (p: PendingDelete) => {
    const cur = draft.current();
    if (!cur) return;
    if (p.kind === 'chapter') {
      const ch = cur.chapters.find((x) => x.id === p.chapterId);
      if (!ch) return;
      if (ch.sections.length === 0) { doDelete(p); return; }
    } else if (p.kind === 'section') {
      const se = cur.chapters.find((x) => x.id === p.chapterId)?.sections.find((s) => s.id === p.sectionId);
      if (!se) return;
      if (!sectionHasContent(se)) { doDelete(p); return; }
    } else {
      const block = findBlock(cur, p.sectionId, p.blockId);
      if (!block) return;
      if (nietsTeVerliezen(block)) { doDelete(p); return; }
    }
    setPendingDelete(p);
  };

  const insertBlockAt = (type: CourseBlockType) => {
    if (paletteAt === null || !selected) return;
    const at = paletteAt;
    mutateSection(selected.section.id, (s) => ({
      ...s,
      blocks: [...s.blocks.slice(0, at), makeBlock(type), ...s.blocks.slice(at)],
    }));
    setPaletteAt(null);
  };

  return (
    <div className="appshell">
      <header className="topbar" style={{ flexWrap: 'wrap', rowGap: 6 }}>
        <h1 className="sr-only">Cursus bewerken: {course.title.trim() || 'naamloze cursus'}</h1>
        <button className="btn btn-quiet btn-sm" onClick={() => navigate('/cursussen')} aria-label="Terug naar mijn cursussen">
          <BackIcon size={16} /> Terug
        </button>
        <span
          className="type-icon"
          style={{ background: course.settings.accentColor, width: 34, height: 34, fontSize: '1.05rem', borderRadius: 9 }}
          aria-hidden
        >
          {course.coverEmoji}
        </span>
        <input
          ref={titleRef}
          className="input input-sm"
          style={{ maxWidth: 320, fontWeight: 700, fontSize: '1.02rem' }}
          value={course.title}
          aria-label="Titel van de cursus"
          onChange={(e) => { const title = e.target.value; edit((c) => ({ ...c, title })); }}
        />
        <SaveIndicator snap={snap} />
        <div className="topbar-spacer" />
        <span className="badge" title="Cursuscode" style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}>{course.code}</span>
        <a
          className="btn btn-sm btn-ghost"
          href={coursePreviewHash(course.code)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={saveBeforeOpen}
          title="Bekijk de cursus zoals je leerlingen hem zien. In dit voorbeeld wordt niets bewaard."
        >
          <PreviewIcon size={16} /> Als leerling
        </a>
        <a
          className="btn btn-sm btn-ghost"
          href={`#/cursus/print/${course.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={saveBeforeOpen}
          title="Afdrukken of als PDF bewaren"
        >
          <PrintIcon size={16} /> Afdrukken
        </a>
        <button className="btn btn-sm btn-ai" onClick={() => setAiModal({ mode: 'rework' })} title="Laat AI de hele cursus herwerken of uitbreiden">
          <AIIcon size={16} /> Herwerk met AI
        </button>
        <button
          className="btn btn-sm btn-ai"
          onClick={() => setAiModal({ mode: 'optimize' })}
          title="Taal vereenvoudigen, differentiëren, controlevragen toevoegen of de hiaten t.o.v. het leerplan vullen"
        >
          <AIIcon size={16} /> Optimaliseer
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setGoalsOpen(true)}
          title="Welke leerplandoelen zijn gedekt, en welke secties dragen nog geen doel?"
        >
          <GoalIcon size={16} /> Doelendekking
        </button>
        <Link to={`/cursus/volg/${course.id}`} className="btn btn-sm btn-ghost" title="Voortgang van je leerlingen">
          <ResultsIcon size={16} /> Voortgang
        </Link>
        <button className="btn btn-sm btn-ghost" onClick={() => setSettingsOpen(true)} title="Cursusinstellingen">
          <SettingsIcon size={16} /> Instellingen
        </button>
      </header>

      <main id="main" className="course-editor-main">
        {snap.conflict ? (
          <ConflictBanner
            conflict={snap.conflict}
            dirty={snap.dirty}
            onLoadTheirs={loadTheirs}
            onKeepMine={keepMine}
            onSaveCopy={saveCopy}
            onDiscard={discardAndLeave}
          />
        ) : (snap.saveFailed || (notice !== null && notice.at > snap.savedAt)) && (
          <SaveProblemBanner
            message={notice !== null && notice.at > snap.savedAt ? notice.message : SAVE_FAILED_TEXT}
            failed={snap.saveFailed}
            onRetry={retrySave}
            onDismiss={() => { setNotice(null); focusTitle(); }}
          />
        )}

        <StructurePane
          course={course}
          selectedId={selected?.section.id}
          onSelect={setSelectedSectionId}
          onChange={edit}
          onAskDelete={askDelete}
        />

        {selected ? (
          <SectionPane
            key={selected.section.id}
            chapter={selected.chapter}
            section={selected.section}
            curriculumId={course.curriculumId}
            onPatch={(fn) => mutateSection(selected.section.id, fn)}
            onOpenAI={() => setAiModal({ mode: 'section', sectionId: selected.section.id })}
            onOpenExercises={() => setAiModal({ mode: 'exercises', sectionId: selected.section.id })}
            onOpenPalette={setPaletteAt}
            onAskDeleteBlock={(blockId) => askDelete({ kind: 'block', sectionId: selected.section.id, blockId })}
            onPdfReleased={draft.releasePdf}
          />
        ) : (
          <EmptyState icon={<Blocks size={40} />} title="Geen sectie geselecteerd">
            <p style={{ color: 'var(--text-soft)' }}>Voeg links een hoofdstuk en een sectie toe om te beginnen.</p>
          </EmptyState>
        )}
      </main>

      {paletteAt !== null && <BlockPalette onPick={insertBlockAt} onClose={() => setPaletteAt(null)} />}

      {settingsOpen && (
        <CourseSettingsModal course={course} onChange={edit} onClose={() => setSettingsOpen(false)} />
      )}

      {goalsOpen && (
        <Modal title="Doelendekking" onClose={() => setGoalsOpen(false)} wide>
          <GoalCoverage
            course={course}
            curriculum={curriculum}
            widgets={widgets}
            onFillGaps={() => { setGoalsOpen(false); setAiModal({ mode: 'optimize', preset: 'hiaten' }); }}
            onOpenSettings={() => { setGoalsOpen(false); setSettingsOpen(true); }}
          />
        </Modal>
      )}

      {blocker.state === 'blocked' && (
        <Modal
          title="Je wijzigingen zijn niet bewaard"
          onClose={() => blocker.reset()}
          footer={
            <>
              <button type="button" className="btn btn-primary" onClick={() => blocker.reset()}>Blijven</button>
              <button type="button" className="btn btn-ghost" onClick={() => void downloadCourse()}>
                <DownloadIcon size={18} aria-hidden /> Downloaden als bestand
              </button>
              <button type="button" className="btn btn-danger" onClick={leaveAnyway}>Toch weggaan</button>
            </>
          }
        >
          <p>
            Bewaren op dit toestel lukt niet: de opslag is vol of geblokkeerd. Als je nu weggaat, gaan je laatste
            wijzigingen aan de cursus verloren. Download de cursus eerst als bestand als je ze wil houden.
          </p>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          {...deleteQuestion(pendingDelete, course)}
          onConfirm={() => doDelete(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {aiModal && (
        <CourseAIModal
          mode={aiModal.mode}
          course={course}
          sectionId={aiModal.mode === 'section' || aiModal.mode === 'exercises' ? aiModal.sectionId : undefined}
          initialPreset={aiModal.mode === 'optimize' ? aiModal.preset : undefined}
          onClose={() => setAiModal(null)}
          onResult={(result: Course) => {
            edit(result);
            setAiModal(null);
            toast('Cursus bijgewerkt — kijk alles even na', 'ok');
          }}
        />
      )}
    </div>
  );
}

// ── Bewaarstatus en meldingen ───────────────────────────────────────────────

/** Naast de titel: wat er met je wijzigingen gebeurt. "Bewaard" alleen na een geslaagde bewaring. */
function SaveIndicator({ snap }: { snap: DraftSnapshot }) {
  let content: React.ReactNode = '';
  let problem = false;
  if (snap.conflict) {
    content = <><WarningIcon size={14} aria-hidden /> Bewaren gepauzeerd</>;
    problem = true;
  } else if (snap.status === 'saving') {
    content = 'Bewaren…';
  } else if (snap.saveFailed) {
    content = <><WarningIcon size={14} aria-hidden /> Niet bewaard</>;
    problem = true;
  } else if (snap.status === 'saved') {
    content = <><CheckIcon size={14} aria-hidden /> Bewaard</>;
  } else if (snap.status === 'reloaded') {
    content = 'Bijgewerkt uit een ander tabblad';
  }
  return (
    <span className={`hint course-save-state${problem ? ' course-save-state-problem' : ''}`} aria-live="polite">
      {content}
    </span>
  );
}

/** Een ander tabblad bewaarde of verwijderde deze cursus (CU2): niets overschrijven, de leerkracht kiest. */
function ConflictBanner({
  conflict, dirty, onLoadTheirs, onKeepMine, onSaveCopy, onDiscard,
}: {
  conflict: EditorConflict;
  dirty: boolean;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
  onSaveCopy: () => void;
  onDiscard: () => void;
}) {
  if (conflict.kind === 'verwijderd') {
    return (
      <div className="course-editor-alert course-editor-alert-problem" role="alert">
        <WarningIcon size={20} aria-hidden className="course-editor-alert-icon" />
        <div className="course-editor-alert-body">
          <p>
            <strong>Verwijderd in een ander tabblad.</strong> Deze cursus staat niet meer bij je cursussen.
            Automatisch bewaren staat hier stil{dirty ? ': je wijzigingen in dit tabblad zijn nog niet bewaard' : ''}.
          </p>
          <div className="course-editor-alert-actions">
            <button className="btn btn-sm btn-primary" onClick={onKeepMine}>Toch bewaren</button>
            <button className="btn btn-sm btn-ghost" onClick={onDiscard}>
              {dirty ? 'Wijzigingen weggooien' : 'Naar mijn cursussen'}
            </button>
          </div>
          <p className="hint course-editor-alert-hint">
            Kies je “Toch bewaren”, dan staat de cursus er weer. Wat bij het verwijderen meeging, komt niet terug:
            geüploade pdf’s, de voortgang van je leerlingen en hun notities. Afbeeldingen die alleen in deze cursus
            zaten, kunnen ook ontbreken.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="course-editor-alert" role="alert">
      <WarningIcon size={20} aria-hidden className="course-editor-alert-icon" />
      <div className="course-editor-alert-body">
        <p>
          <strong>Gewijzigd in een ander tabblad.</strong> Deze cursus werd intussen ook in een ander tabblad
          bewaard. Automatisch bewaren staat hier stil tot je kiest, zodat er niets overschreven wordt.
        </p>
        <div className="course-editor-alert-actions">
          <button className="btn btn-sm btn-primary" onClick={onLoadTheirs}>Laad die versie</button>
          {dirty && <button className="btn btn-sm btn-ghost" onClick={onSaveCopy}>Mijn versie als kopie bewaren</button>}
          {dirty && <button className="btn btn-sm btn-ghost" onClick={onKeepMine}>Mijn versie bewaren</button>}
        </div>
        {dirty && (
          <p className="hint course-editor-alert-hint">
            “Laad die versie” laat je wijzigingen in dit tabblad vallen. “Mijn versie bewaren” overschrijft wat
            het andere tabblad bewaarde. Met een kopie blijven beide versies bestaan.
          </p>
        )}
      </div>
    </div>
  );
}

/** Bewaren mislukte (CU7): eerlijk zeggen, het werk blijft op het scherm. */
function SaveProblemBanner({
  message, failed, onRetry, onDismiss,
}: {
  message: string;
  /** De laatste bewaring van de cursus mislukte (dan: opnieuw proberen, niet wegklikken). */
  failed: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="course-editor-alert course-editor-alert-problem" role="alert">
      <WarningIcon size={20} aria-hidden className="course-editor-alert-icon" />
      <div className="course-editor-alert-body">
        <p>
          <strong>Niet bewaard:</strong> {message}
          {failed && ' Je wijzigingen staan nog op het scherm.'}
        </p>
        <div className="course-editor-alert-actions">
          {failed ? (
            <button className="btn btn-sm btn-ghost" onClick={onRetry}><RetryIcon size={16} aria-hidden /> Opnieuw proberen</button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={onDismiss}>Melding sluiten</button>
          )}
          <Link to="/privacy" target="_blank" rel="noopener" className="btn btn-sm btn-ghost">Opslag bekijken</Link>
        </div>
      </div>
    </div>
  );
}

// ── Linkerkolom: structuur ──────────────────────────────────────────────────

function StructurePane({
  course, selectedId, onSelect, onChange, onAskDelete,
}: {
  course: Course;
  selectedId?: string;
  onSelect: (sectionId: string) => void;
  onChange: (course: Course) => void;
  onAskDelete: (p: PendingDelete) => void;
}) {
  const addChapter = () => {
    const section: CourseSection = { id: uid(), title: 'Nieuwe sectie', blocks: [] };
    const chapter: CourseChapter = {
      id: uid(), title: `Hoofdstuk ${course.chapters.length + 1}`, emoji: '📖', sections: [section],
    };
    onChange({ ...course, chapters: [...course.chapters, chapter] });
    onSelect(section.id);
  };

  const addSection = (chapterId: string) => {
    const section: CourseSection = { id: uid(), title: 'Nieuwe sectie', blocks: [] };
    onChange(patchChapter(course, chapterId, (ch) => ({ ...ch, sections: [...ch.sections, section] })));
    onSelect(section.id);
  };

  return (
    <nav aria-label="Cursusstructuur" className="course-structure">
      {course.chapters.map((ch, ci) => (
        <div key={ch.id} className="card" style={{ padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input input-sm"
              style={{ width: 42, textAlign: 'center', padding: '5px 2px', flexShrink: 0 }}
              value={ch.emoji ?? ''}
              maxLength={4}
              aria-label={`Emoji van hoofdstuk ${ci + 1}`}
              placeholder="📖"
              onChange={(e) => onChange(patchChapter(course, ch.id, (c) => ({ ...c, emoji: e.target.value || undefined })))}
            />
            <input
              className="input input-sm"
              style={{ flex: 1, fontWeight: 700, minWidth: 0 }}
              value={ch.title}
              aria-label={`Titel van hoofdstuk ${ci + 1}`}
              onChange={(e) => onChange(patchChapter(course, ch.id, (c) => ({ ...c, title: e.target.value })))}
            />
          </div>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', margin: '4px 0 6px' }}>
            <button className="btn btn-quiet btn-sm btn-icon" disabled={ci === 0} aria-label={`Hoofdstuk ${ci + 1} omhoog`}
              onClick={() => onChange({ ...course, chapters: moveItem(course.chapters, ci, -1) })}><MoveUpIcon size={16} /></button>
            <button className="btn btn-quiet btn-sm btn-icon" disabled={ci === course.chapters.length - 1} aria-label={`Hoofdstuk ${ci + 1} omlaag`}
              onClick={() => onChange({ ...course, chapters: moveItem(course.chapters, ci, 1) })}><MoveDownIcon size={16} /></button>
            <button
              className="btn btn-quiet btn-sm btn-icon"
              disabled={course.chapters.length <= 1}
              aria-label={`Hoofdstuk ${ci + 1} verwijderen`}
              title={course.chapters.length <= 1 ? 'Een cursus heeft minstens één hoofdstuk' : 'Hoofdstuk verwijderen'}
              onClick={() => onAskDelete({ kind: 'chapter', chapterId: ch.id })}
            >
              <DeleteIcon size={16} />
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-quiet btn-sm" onClick={() => addSection(ch.id)}><AddIcon size={16} /> Sectie</button>
          </div>

          {ch.sections.map((se, si) => {
            const sel = se.id === selectedId;
            const sectionTitle = se.title.trim() || 'Naamloze sectie';
            return (
              <div key={se.id} style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                <button
                  onClick={() => onSelect(se.id)}
                  aria-current={sel ? 'true' : undefined}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    textAlign: 'left', font: 'inherit', fontSize: '0.9rem',
                    background: sel ? 'var(--brand-soft)' : 'transparent',
                    color: sel ? 'var(--brand)' : 'var(--text)',
                    fontWeight: sel ? 700 : 500,
                  }}
                >
                  <span className="course-section-title" style={{ flex: 1, minWidth: 0 }} title={sectionTitle}>
                    {sectionTitle}
                  </span>
                  {((se.goals?.length ?? 0) + (se.goalCodes?.length ?? 0)) > 0 && (
                    <span
                      title={se.goalCodes?.length ? `Leerplandoelen: ${se.goalCodes.join(', ')}` : 'Heeft leerdoelen'}
                      aria-label="heeft leerdoelen"
                      style={{ display: 'inline-flex', flex: 'none' }}
                    >
                      <GoalIcon size={14} />
                    </span>
                  )}
                  {se.optional && (
                    <span className="badge" style={{ fontSize: '0.64rem', padding: '1px 6px' }} title="Verdiepings-/keuzesectie">
                      keuze
                    </span>
                  )}
                </button>
                <button className="btn btn-quiet btn-sm btn-icon" disabled={si === 0} aria-label={`Sectie “${sectionTitle}” omhoog`}
                  onClick={() => onChange(patchChapter(course, ch.id, (c) => ({ ...c, sections: moveItem(c.sections, si, -1) })))}><MoveUpIcon size={16} /></button>
                <button className="btn btn-quiet btn-sm btn-icon" disabled={si === ch.sections.length - 1} aria-label={`Sectie “${sectionTitle}” omlaag`}
                  onClick={() => onChange(patchChapter(course, ch.id, (c) => ({ ...c, sections: moveItem(c.sections, si, 1) })))}><MoveDownIcon size={16} /></button>
                <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Sectie “${sectionTitle}” verwijderen`}
                  onClick={() => onAskDelete({ kind: 'section', chapterId: ch.id, sectionId: se.id })}><DeleteIcon size={16} /></button>
              </div>
            );
          })}
          {ch.sections.length === 0 && (
            <p className="hint" style={{ margin: '4px 2px' }}>Nog geen secties.</p>
          )}
        </div>
      ))}
      <button className="btn btn-ghost" style={{ width: '100%' }} onClick={addChapter}><AddIcon size={16} /> Hoofdstuk</button>
    </nav>
  );
}

// ── Rechterkolom: de geselecteerde sectie ───────────────────────────────────

function SectionPane({
  chapter, section, curriculumId, onPatch, onOpenAI, onOpenExercises, onOpenPalette, onAskDeleteBlock, onPdfReleased,
}: {
  chapter: CourseChapter;
  section: CourseSection;
  /** Leerplan van de cursus: bepaalt de suggesties bij de doelcodes. */
  curriculumId?: string;
  onPatch: (fn: (s: CourseSection) => CourseSection) => void;
  onOpenAI: () => void;
  onOpenExercises: () => void;
  onOpenPalette: (index: number) => void;
  /** Blok verwijderen: met bevestiging als er inhoud in zit (CU3). */
  onAskDeleteBlock: (blockId: string) => void;
  /** Een blok gebruikt een geüpload pdf-bestand niet meer (opruimen na het bewaren). */
  onPdfReleased: (pdfId: string) => void;
}) {
  const goals = section.goals ?? [];
  const setGoals = (g: string[]) => onPatch((s) => ({ ...s, goals: g.length ? g : undefined }));
  // Altijd op de laatste stand van de sectie werken (niet op de props van deze render).
  const patchBlocks = (fn: (blocks: CourseSection['blocks']) => CourseSection['blocks']) =>
    onPatch((s) => ({ ...s, blocks: fn(s.blocks) }));

  return (
    <div style={{ minWidth: 0 }}>
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <p className="hint" style={{ margin: '0 0 6px' }}>
          {chapter.emoji ? `${chapter.emoji} ` : ''}Hoofdstuk: {chapter.title}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 220, fontWeight: 700 }}
            value={section.title}
            aria-label="Titel van de sectie"
            placeholder="Titel van de sectie"
            onChange={(e) => onPatch((s) => ({ ...s, title: e.target.value }))}
          />
          <button className="btn btn-sm btn-ai" onClick={onOpenAI} title="Laat AI deze sectie vullen met inhoud">
            <AIIcon size={16} /> Vul deze sectie met AI
          </button>
          <button className="btn btn-sm btn-ai" onClick={onOpenExercises} title="Laat AI oefeningen maken bij de inhoud en de doelen van deze sectie">
            <AIIcon size={16} /> Stel oefeningen voor
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <CheckRow
            checked={section.optional === true}
            onChange={(v) => onPatch((s) => ({ ...s, optional: v || undefined }))}
            label="Verdiepings-/keuzesectie (telt niet mee voor 'afgewerkt')"
          />
        </div>
        <GoalCodeInput
          value={section.goalCodes ?? []}
          curriculumId={curriculumId}
          onChange={(codes) => onPatch((s) => ({ ...s, goalCodes: codes.length ? codes : undefined }))}
        />
        <Field
          label="Leerdoelen in eigen woorden (optioneel)"
          hint="Wat kan de leerling na deze sectie? Zichtbaar als feed-up en in de voortgangsweergave."
        >
          <div>
            {goals.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input
                  className="input input-sm"
                  style={{ flex: 1, minWidth: 0 }}
                  value={g}
                  placeholder="bv. Ik kan uitleggen wat verdamping is."
                  aria-label={`Leerdoel ${i + 1}`}
                  onChange={(e) => setGoals(goals.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Leerdoel ${i + 1} verwijderen`}
                  onClick={() => setGoals(goals.filter((_, j) => j !== i))}><DeleteIcon size={16} /></button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setGoals([...goals, ''])}><AddIcon size={16} /> Leerdoel</button>
          </div>
        </Field>
      </div>

      {section.blocks.length === 0 && (
        <div className="empty-state" style={{ padding: '26px 16px' }}>
          <div className="big" aria-hidden><Blocks size={40} /></div>
          <h3>Nog geen inhoud</h3>
          <p style={{ color: 'var(--text-soft)' }}>Voeg je eerste blok toe — tekst, video, een oefenwidget, …</p>
        </div>
      )}

      {section.blocks.map((block, i) => (
        <React.Fragment key={block.id}>
          {i > 0 && (
            <div style={{ textAlign: 'center', margin: '-6px 0 6px' }}>
              <button
                className="btn btn-quiet btn-sm btn-icon"
                aria-label={`Blok invoegen vóór blok ${i + 1}`}
                title="Blok hier invoegen"
                onClick={() => onOpenPalette(i)}
              >
                <AddIcon size={16} />
              </button>
            </div>
          )}
          <BlockCard
            block={block}
            index={i}
            count={section.blocks.length}
            onChange={(nb) => patchBlocks((bs) => bs.map((x) => (x.id === block.id ? nb : x)))}
            onMove={(d) => patchBlocks((bs) => {
              const at = bs.findIndex((x) => x.id === block.id);
              return at < 0 ? bs : moveItem(bs, at, d);
            })}
            onDuplicate={() => patchBlocks((bs) => {
              const at = bs.findIndex((x) => x.id === block.id);
              const copy = duplicateBlock(block);
              return at < 0 ? bs : [...bs.slice(0, at + 1), copy, ...bs.slice(at + 1)];
            })}
            onDelete={() => onAskDeleteBlock(block.id)}
            onPdfReleased={onPdfReleased}
          />
        </React.Fragment>
      ))}

      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => onOpenPalette(section.blocks.length)}>
        <AddIcon size={16} /> Blok toevoegen
      </button>
    </div>
  );
}

// ── Eén blok-kaart met knoppen + formulier ──────────────────────────────────

function BlockCard({
  block, index, count, onChange, onMove, onDuplicate, onDelete, onPdfReleased,
}: {
  block: CourseSection['blocks'][number];
  index: number;
  count: number;
  onChange: (b: CourseSection['blocks'][number]) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPdfReleased: (pdfId: string) => void;
}) {
  const meta = BLOCK_META[block.type];
  const Icon = blockIcon(block);
  return (
    <div className="editor-item">
      <div className="editor-item-head">
        <span aria-hidden style={{ display: 'flex' }}><Icon size={18} /></span>
        <strong style={{ fontSize: '0.9rem' }}>{meta.name}</strong>
        <span style={{ flex: 1 }} />
        <button className="btn btn-quiet btn-sm btn-icon" disabled={index === 0} aria-label={`Blok ${index + 1} omhoog`}
          onClick={() => onMove(-1)}><MoveUpIcon size={16} /></button>
        <button className="btn btn-quiet btn-sm btn-icon" disabled={index === count - 1} aria-label={`Blok ${index + 1} omlaag`}
          onClick={() => onMove(1)}><MoveDownIcon size={16} /></button>
        <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Blok ${index + 1} dupliceren`} title="Dupliceren"
          onClick={onDuplicate}><DuplicateIcon size={16} /></button>
        <button className="btn btn-quiet btn-sm btn-icon" aria-label={`Blok ${index + 1} verwijderen`} title="Verwijderen"
          onClick={onDelete}><DeleteIcon size={16} /></button>
      </div>
      <div className="editor-item-body">
        {isEmptyBlock(block) && (
          <p className="hint course-block-empty">
            <InfoIcon size={14} aria-hidden /> Nog leeg: leerlingen zien dit blok pas als je het invult.
          </p>
        )}
        <BlockEditor block={block} onChange={onChange} onPdfReleased={onPdfReleased} />
      </div>
    </div>
  );
}

// ── Blokkenpalet ────────────────────────────────────────────────────────────

function BlockPalette({ onPick, onClose }: { onPick: (type: CourseBlockType) => void; onClose: () => void }) {
  return (
    <Modal title="Blok toevoegen" onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        {PALETTE_ORDER.map((type) => {
          const meta = BLOCK_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              className="card block-palette-item"
              style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
              onClick={() => onPick(type)}
            >
              <div className="block-palette-icon" aria-hidden><Icon size={24} /></div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{meta.name}</div>
              <div className="hint" style={{ lineHeight: 1.35 }}>{meta.blurb}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Cursusinstellingen ──────────────────────────────────────────────────────

function CourseSettingsModal({
  course, onChange, onClose,
}: {
  course: Course;
  onChange: (c: Course) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<Course>) => onChange({ ...course, ...patch });
  const setSettings = (patch: Partial<Course['settings']>) =>
    onChange({ ...course, settings: { ...course.settings, ...patch } });
  // Terwijl het venster om een richting te kiezen open staat, sluit Escape alleen dat venster, niet ook dit.
  const [kiezerOpen, setKiezerOpen] = useState(false);

  return (
    <Modal
      title="Cursusinstellingen"
      onClose={() => { if (!kiezerOpen) onClose(); }}
      footer={<button className="btn btn-primary" onClick={onClose}>Klaar</button>}
    >
      <Field label="Ondertitel (optioneel)">
        <input
          className="input"
          value={course.subtitle ?? ''}
          placeholder="bv. Aardrijkskunde — tweede graad"
          onChange={(e) => set({ subtitle: e.target.value || undefined })}
        />
      </Field>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Omslag-emoji" hint="1–2 tekens">
          <input
            className="input input-sm"
            style={{ width: 70, textAlign: 'center', fontSize: '1.2rem' }}
            value={course.coverEmoji}
            maxLength={4}
            aria-label="Omslag-emoji"
            onChange={(e) => set({ coverEmoji: e.target.value })}
          />
        </Field>
        <Field label="Accentkleur">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={course.settings.accentColor}
              aria-label="Accentkleur van de cursus"
              onChange={(e) => setSettings({ accentColor: e.target.value })}
            />
            <span className="hint">{course.settings.accentColor}</span>
          </div>
        </Field>
      </div>
      <Field label="Auteur" hint="Zichtbaar op de omslag voor je leerlingen.">
        <input
          className="input"
          value={course.author}
          placeholder="bv. Mevr. Peeters"
          onChange={(e) => set({ author: e.target.value })}
        />
      </Field>
      <CurriculumSetting course={course} onChange={set} />
      <RichtingSetting course={course} onChange={set} onKiezerOpen={setKiezerOpen} />
      <CheckRow
        checked={course.settings.requireName}
        onChange={(v) => setSettings({ requireName: v })}
        label="Leerling moet eerst een naam invullen (nodig om voortgang te volgen)"
      />
      <CheckRow
        checked={course.settings.showProgressToStudent}
        onChange={(v) => setSettings({ showProgressToStudent: v })}
        label="Voortgangsbalk zichtbaar voor de leerling"
      />
    </Modal>
  );
}

// ── Studierichting van de cursus ────────────────────────────────────────────

/**
 * De studierichting (en het jaar) van de cursus: zo telt ze mee in de dekking per studierichting. Het venster om een
 * richting te kiezen wordt pas geladen als je erom vraagt, zodat de cursuseditor klein blijft; lukt het laden niet
 * (offline), dan blijft de editor gewoon werken.
 */
function RichtingSetting({
  course, onChange, onKiezerOpen,
}: {
  course: Course;
  onChange: (patch: Partial<Course>) => void;
  onKiezerOpen: (open: boolean) => void;
}) {
  const toast = useToast();
  const [Kiezer, setKiezer] = useState<ComponentType<RichtingKiezerModalProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [laadt, setLaadt] = useState(false);
  const kiesRef = useRef<HTMLButtonElement>(null);
  const dg = sanitizeDoelgroep(course.doelgroep);

  const zet = (waarde: boolean) => {
    setOpen(waarde);
    onKiezerOpen(waarde);
  };
  const openKiezer = () => {
    if (laadt) return;
    if (Kiezer) { zet(true); return; }
    setLaadt(true);
    import('../components/richting/RichtingKiezerModal').then(
      (m) => { setKiezer(() => m.RichtingKiezerModal); setLaadt(false); zet(true); },
      () => { setLaadt(false); toast('De lijst met studierichtingen kon niet geladen worden. Controleer je verbinding en herlaad de pagina.', 'err'); },
    );
  };

  return (
    <>
      <Field label="Studierichting" hint="Zo telt de cursus mee in de dekking per studierichting.">
        <div className="rc-instelling" role="group" aria-label="Studierichting van deze cursus">
          <p className="rc-waarde">{dg ? doelgroepTekst(dg) : 'Nog geen studierichting gekozen.'}</p>
          <div className="rc-instelling-knoppen">
            <button ref={kiesRef} type="button" className="btn btn-sm btn-ghost" onClick={openKiezer} aria-busy={laadt || undefined}>
              {dg ? 'Wijzig' : 'Kies een richting'}{dg && <span className="sr-only"> de studierichting</span>}
            </button>
            {dg && (
              <button
                type="button" className="btn btn-sm btn-quiet"
                // De knop verdwijnt: de focus gaat naar "Kies een richting", anders is ze kwijt.
                onClick={() => { onChange({ doelgroep: undefined }); setTimeout(() => kiesRef.current?.focus(), 0); }}
              >
                Geen richting
              </button>
            )}
          </div>
        </div>
      </Field>
      {open && Kiezer && (
        <Kiezer
          titel="Studierichting van deze cursus"
          huidig={dg}
          onKies={(d) => { onChange({ doelgroep: d }); zet(false); }}
          onClose={() => zet(false)}
        />
      )}
    </>
  );
}

// ── Leerplan van de cursus ──────────────────────────────────────────────────

function CurriculumSetting({ course, onChange }: { course: Course; onChange: (patch: Partial<Course>) => void }) {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  useEffect(() => setCurricula(getCurricula()), []);
  const current = curricula.find((c) => c.id === course.curriculumId);

  return (
    <Field
      label="Leerplan"
      hint="Bepaalt welke doelcodes je per sectie kan kiezen en waartegen de doelendekking rekent."
    >
      <div>
        <select
          className="select"
          value={course.curriculumId ?? ''}
          aria-label="Leerplan van deze cursus"
          onChange={(e) => onChange({ curriculumId: e.target.value || undefined })}
        >
          <option value="">— geen leerplan —</option>
          {curricula.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}{c.example ? ' (voorbeeld)' : ''}
            </option>
          ))}
          {course.curriculumId && !current && (
            <option value={course.curriculumId}>Leerplan niet gevonden op dit toestel</option>
          )}
        </select>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          {current
            ? `${current.goals.length} doel(en) beschikbaar.`
            : 'Nog geen leerplan gekozen — zonder leerplan werk je met vrije doelen in eigen woorden.'}
          {' '}
          <Link to="/leerplannen" target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Leerplannen beheren <ExternalLink size={14} />
          </Link>
        </p>
      </div>
    </Field>
  );
}
