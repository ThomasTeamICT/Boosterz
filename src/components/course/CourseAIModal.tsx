import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { Widget } from '../../lib/types';
import type { Course, CourseBlock, CourseChapter } from '../../lib/courseTypes';
import { allSections } from '../../lib/courseTypes';
import type { CurriculumGoal } from '../../lib/curriculumTypes';
import { exportCourseJson } from '../../lib/courses';
import { getCurriculum, normalizeGoalCode } from '../../lib/curriculum';
import { computeCoverage } from '../../lib/coverage';
import {
  buildNewCoursePrompt, buildOptimizeChapterPrompt, buildOptimizePrompt, buildReworkPrompt,
  buildSectionExercisesPrompt, buildSectionPrompt, checkMissingTopics, compactCourseLength, MAX_SOURCE_CHARS,
  OPTIMIZE_PRESETS, sanitizeAIBlocks, sanitizeAIChapter, sanitizeAICourse, sanitizeSectionExercises,
  type OptimizePreset,
} from '../../lib/aiCourse';
import { AIError, askAI, effectiveMaxTokens, extractJson, getAISettings } from '../../lib/ai';
import { runBatch } from '../../lib/aiBatch';
import type { BatchItemStatus } from '../../lib/aiBatch';
import { AIErrorBox, AIGate, AIReviewNote, AIWorkingBox } from '../aiCommon';
import { CurriculumPicker, type CurriculumSelection } from '../curriculum/CurriculumPicker';
import { PdfImportButton } from '../PdfImportButton';
import { Field, Modal, useToast } from '../ui';
import { downloadFile, uid } from '../../lib/utils';
import { getWidgets, saveWidget } from '../../lib/storage';
import {
  AIIcon, BackIcon, CheckIcon, DownloadIcon, GoalIcon, ImportIcon, RetryIcon, WarningIcon,
} from '../icons';

/** Hoogstens dit veel hoofdstukken tegelijk optimaliseren (per hoofdstuk één aanroep). */
const CHAPTER_BATCH_CONCURRENCY = 2;

/** Tokenlimiet van één antwoord voor de hele cursus (herwerken en hiaten). */
const WHOLE_COURSE_MAX_TOKENS = 32000;

/**
 * Herwerken en hiaten vragen de VOLLEDIGE cursus terug in één antwoord. Is de
 * cursus (compact) langer dan wat in dat antwoord past (±3 tekens per token),
 * dan wordt het antwoord zeker afgekapt: liever meteen weigeren dan de
 * leerkracht een minuut te laten wachten op een mislukking.
 */
function tooBigForOneAnswer(course: Course): boolean {
  const outputTokens = Math.min(
    WHOLE_COURSE_MAX_TOKENS,
    effectiveMaxTokens(getAISettings().provider, WHOLE_COURSE_MAX_TOKENS)
  );
  return compactCourseLength(course) > 3 * outputTokens;
}

const TOO_BIG_MESSAGE = 'Te groot om in één keer te herwerken — kies Optimaliseren (per hoofdstuk).';

type Mode = 'new' | 'rework' | 'optimize' | 'section' | 'exercises';

const TITLES: Record<Mode, string> = {
  new: 'AI-cursusbouwer',
  rework: 'Cursus herwerken met AI',
  optimize: 'Cursus optimaliseren',
  section: 'Sectie vullen met AI',
  exercises: 'Oefeningen voorstellen',
};

interface PreviewState {
  course: Course;
  /** Uitgelijnd op de hoofdstukken; null = quiz voor dat hoofdstuk viel af. */
  quizzes: (Widget | null)[];
  blocks?: CourseBlock[];
  /** Voorgestelde oefeningen (modus 'exercises'). */
  exercises?: Widget[];
  warnings: string[];
}

export function CourseAIModal({
  mode, course, sectionId, onClose, onResult,
  initialSource, initialCurriculumId, initialGoalCodes, initialTitle,
  focus = 'source', initialPreset, originNote,
}: {
  mode: Mode;
  course?: Course;
  sectionId?: string;
  onClose: () => void;
  onResult: (course: Course) => void;
  /** Bronmateriaal dat al klaarstaat (bv. uit de importpagina). */
  initialSource?: string;
  /** Voorgekozen leerplan. */
  initialCurriculumId?: string;
  /** Voorgekozen leerplandoelen (codes). */
  initialGoalCodes?: string[];
  /** Voorgestelde cursustitel. */
  initialTitle?: string;
  /** Welk vertrekpunt bovenaan staat in modus 'new'. */
  focus?: 'source' | 'curriculum';
  /** Voorgeselecteerde optimalisatie (bv. 'hiaten' vanuit de doelendekking). */
  initialPreset?: OptimizePreset;
  /** Korte melding bovenaan, bv. "bron uit hoofdstuk-3.docx". */
  originNote?: string;
}) {
  const toast = useToast();
  // invoer (mode 'new')
  const [subject, setSubject] = useState('');
  const [audience, setAudience] = useState('');
  const [goals, setGoals] = useState('');
  const [chapterCount, setChapterCount] = useState(0);
  const [extraWishes, setExtraWishes] = useState('');
  const [withQuizzes, setWithQuizzes] = useState(true);
  const [sourceNew, setSourceNew] = useState(initialSource ?? '');
  const [title, setTitle] = useState(initialTitle ?? '');
  const [selection, setSelection] = useState<CurriculumSelection>(() => {
    const cur = initialCurriculumId ? getCurriculum(initialCurriculumId) : undefined;
    const codes = (initialGoalCodes ?? []).map(normalizeGoalCode).filter(Boolean);
    return {
      curriculumId: cur?.id,
      goalCodes: codes,
      goals: (cur?.goals ?? []).filter((g) => codes.includes(normalizeGoalCode(g.code))),
    };
  });
  // invoer (mode 'rework' / 'section' / 'optimize' / 'exercises')
  const [wishes, setWishes] = useState('');
  const [source, setSource] = useState('');
  const [preset, setPreset] = useState<OptimizePreset>(initialPreset ?? 'taal');
  const [exerciseCount, setExerciseCount] = useState(1);

  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // Optimaliseren gebeurt per hoofdstuk (behalve preset 'hiaten', zie generate()):
  // status en foutmelding per hoofdstuk, voor de voortgang en "opnieuw proberen".
  const [chapterStatus, setChapterStatus] = useState<Record<string, BatchItemStatus>>({});
  const [chapterErrors, setChapterErrors] = useState<Record<string, string>>({});
  const ctrlRef = useRef<AbortController | null>(null);

  // Sluiten (Escape, backdrop, ✕) tijdens het genereren moet de aanvraag
  // ook echt afbreken — anders loopt een 32k-token-stream onzichtbaar door.
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const section = useMemo(
    () => (course && sectionId ? allSections(course).map((x) => x.section).find((s) => s.id === sectionId) : undefined),
    [course, sectionId]
  );
  const chapterTitle = useMemo(
    () => (course && sectionId ? allSections(course).find((x) => x.section.id === sectionId)?.chapter.title : undefined),
    [course, sectionId]
  );

  // Leerplan + dekking van de bestaande cursus (voor 'optimize').
  const curriculum = useMemo(
    () => (course?.curriculumId ? getCurriculum(course.curriculumId) : undefined),
    [course?.curriculumId]
  );
  const coverage = useMemo(
    () => (course && curriculum ? computeCoverage(course, curriculum, getWidgets()) : undefined),
    [course, curriculum]
  );
  const uncoveredGoals: CurriculumGoal[] = coverage ? coverage.uncovered.map((r) => r.goal) : [];

  /** Doelen van de sectie zelf (modus 'exercises'). */
  const sectionGoals: CurriculumGoal[] = useMemo(() => {
    if (!section || !curriculum) return [];
    const codes = (section.goalCodes ?? []).map(normalizeGoalCode);
    return curriculum.goals.filter((g) => codes.includes(normalizeGoalCode(g.code)));
  }, [section, curriculum]);

  const canGenerate =
    mode === 'new' ? goals.trim().length > 0 || sourceNew.trim().length > 0 || selection.goals.length > 0
    : mode === 'rework' || mode === 'optimize' ? Boolean(course)
    : Boolean(course && section);

  /** Eén AI-aanroep voor precies één hoofdstuk — de bouwsteen voor het per-hoofdstuk optimaliseren. */
  const optimizeOneChapter = async (
    baseCourse: Course, chapterId: string, signal: AbortSignal
  ): Promise<{ chapter: CourseChapter; warnings: string[] }> => {
    const idx = baseCourse.chapters.findIndex((ch) => ch.id === chapterId);
    const chapter = baseCourse.chapters[idx];
    const p = buildOptimizeChapterPrompt({
      course: baseCourse, chapter, chapterIndex: idx + 1, chapterCount: baseCourse.chapters.length,
      presets: [preset as Exclude<OptimizePreset, 'hiaten'>], wishes, curriculumGoals: curriculum?.goals,
    });
    const full = await askAI({ ...p, task: 'cursus optimaliseren', maxTokens: 16000, signal });
    const res = sanitizeAIChapter(extractJson(full), {
      base: baseCourse, chapterId, allowedGoalCodes: curriculum?.goals.map((g) => g.code),
    });
    if (!res.chapter) throw new AIError(res.warnings.join(' ') || 'Geen bruikbaar hoofdstuk teruggekregen. Probeer het opnieuw.');
    return { chapter: res.chapter, warnings: res.warnings };
  };

  /** Optimaliseert elk hoofdstuk apart (hoogstens 2 tegelijk) en bouwt daaruit de voorvertoning op. */
  const runChapterOptimize = async (baseCourse: Course, signal: AbortSignal) => {
    const chapters = baseCourse.chapters;
    const initial: Record<string, BatchItemStatus> = {};
    chapters.forEach((ch) => { initial[ch.id] = 'wachten'; });
    setChapterStatus(initial);
    setChapterErrors({});
    const outcome = await runBatch<string, { chapter: CourseChapter; warnings: string[] }>({
      ids: chapters.map((ch) => ch.id),
      concurrency: CHAPTER_BATCH_CONCURRENCY,
      signal,
      run: (chapterId, sig) => optimizeOneChapter(baseCourse, chapterId, sig),
      onProgress: ({ id, status }) => setChapterStatus((s) => ({ ...s, [id]: status })),
    });
    // Volledig geannuleerd vóór er ook maar één hoofdstuk klaar was: terug naar
    // het formulier (zoals annuleren bij de andere modi), geen lege voorvertoning.
    if (outcome.canceled && outcome.results.length === 0) return;
    const byId = new Map(outcome.results.map((r) => [r.id, r.value]));
    const newErrors: Record<string, string> = {};
    for (const { id, error: e } of outcome.errors) {
      if (e.name !== 'AbortError') newErrors[id] = e.message;
    }
    setChapterErrors(newErrors);
    const mergedChapters = chapters.map((ch) => byId.get(ch.id)?.chapter ?? ch);
    const warnings = outcome.results.flatMap((r) => r.value.warnings);
    setPreview({ course: { ...baseCourse, chapters: mergedChapters }, quizzes: [], warnings });
  };

  /** Eén mislukt hoofdstuk opnieuw proberen — de andere hoofdstukken in de voorvertoning blijven staan. */
  const retryChapter = async (chapterId: string) => {
    if (!course) return;
    // De foutkaart blijft staan ("Wordt opnieuw geprobeerd…") tot de nieuwe
    // poging klaar is: zo telt het hoofdstuk intussen nog als mislukt.
    setChapterStatus((s) => ({ ...s, [chapterId]: 'bezig' }));
    try {
      const res = await optimizeOneChapter(course, chapterId, new AbortController().signal);
      setChapterStatus((s) => ({ ...s, [chapterId]: 'klaar' }));
      setChapterErrors((e) => {
        const next = { ...e };
        delete next[chapterId];
        return next;
      });
      setPreview((p) => (p ? {
        ...p,
        course: { ...p.course, chapters: p.course.chapters.map((ch) => (ch.id === chapterId ? res.chapter : ch)) },
        warnings: [...p.warnings, ...res.warnings],
      } : p));
    } catch (e) {
      setChapterStatus((s) => ({ ...s, [chapterId]: 'mislukt' }));
      setChapterErrors((er) => ({ ...er, [chapterId]: (e as Error).message }));
    }
  };

  const generate = async () => {
    setError('');
    setPreview(null);
    setStream('');
    setBusy(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      let acc = '';
      const onDelta = (t: string) => { acc += t; setStream(acc); };
      if (mode === 'new') {
        const p = buildNewCoursePrompt({
          goals, sourceText: sourceNew, audience, subject, extraWishes, chapterCount, withQuizzes,
          curriculumGoals: selection.goals, title,
        });
        const full = await askAI({ ...p, task: 'cursus bouwen', maxTokens: 32000, onDelta, signal: ctrl.signal });
        const res = sanitizeAICourse(extractJson(full), {
          curriculumId: selection.curriculumId,
          allowedGoalCodes: selection.goalCodes,
        });
        // Zachte controle: mist de gegenereerde cursus een kernwoord uit de titel
        // of de opdracht? (bv. "massadichtheid" in een cursus over "Massa, volume
        // en massadichtheid" waarvan de brontekst dat deel niet bevatte.)
        const topicCheck = checkMissingTopics(
          [title, subject, extraWishes].filter((s) => s.trim()).join(' '),
          res.course
        );
        const warnings = topicCheck.missing.length
          ? [
            ...res.warnings,
            `Kwam mogelijk niet aan bod in de gegenereerde cursus: ${topicCheck.missing.join(', ')}. Controleer of de brontekst (of de opdracht) dit onderdeel wel bevatte.`,
          ]
          : res.warnings;
        setPreview({ ...res, warnings });
      } else if (mode === 'optimize' && course && preset !== 'hiaten') {
        // Per hoofdstuk optimaliseren (zie runChapterOptimize): één aanroep per
        // hoofdstuk houdt elk antwoord klein genoeg, ook bij een lange cursus.
        await runChapterOptimize(course, ctrl.signal);
      } else if ((mode === 'rework' || mode === 'optimize') && course) {
        // 'rework', of 'optimize' met preset 'hiaten': de hiaten-preset kijkt
        // welk BESTAAND hoofdstuk het best bij elk onbedekt doel past en mag
        // hetzelfde doel niet in meerdere hoofdstukken tegelijk dekken — dat
        // vraagt precies het coursebrede overzicht dat per-hoofdstuk-aanroepen
        // niet hebben, dus blijft dit één aanroep voor de hele cursus.
        if (tooBigForOneAnswer(course)) {
          setError(mode === 'optimize'
            ? `${TOO_BIG_MESSAGE} De open doelen vul je dan per sectie aan met “Vul deze sectie met AI”.`
            : TOO_BIG_MESSAGE);
          return;
        }
        const p = mode === 'optimize'
          ? buildOptimizePrompt({
            course, presets: [preset], wishes,
            uncovered: uncoveredGoals,
            curriculumGoals: curriculum?.goals,
          })
          : buildReworkPrompt({ course, wishes });
        const full = await askAI({
          ...p,
          task: mode === 'optimize' ? 'cursus optimaliseren' : 'cursus herwerken',
          maxTokens: 32000, onDelta, signal: ctrl.signal,
        });
        const res = sanitizeAICourse(extractJson(full), {
          base: course,
          allowedGoalCodes: curriculum?.goals.map((g) => g.code),
        });
        setPreview({ ...res, warnings: res.warnings });
      } else if (mode === 'section' && course && section) {
        const p = buildSectionPrompt({ course, section, wishes, source });
        const full = await askAI({ ...p, task: 'sectie-inhoud', maxTokens: 8000, onDelta, signal: ctrl.signal });
        const blockWarnings: string[] = [];
        const blocks = sanitizeAIBlocks(extractJson(full), blockWarnings);
        if (blocks.length === 0) {
          setError('De AI leverde geen bruikbare blokken op. Probeer het opnieuw met een duidelijkere omschrijving.');
        } else {
          setPreview({ course, quizzes: [], blocks, warnings: blockWarnings });
        }
      } else if (mode === 'exercises' && course && section) {
        const p = buildSectionExercisesPrompt({
          course, section, chapterTitle, goals: sectionGoals, count: exerciseCount, wishes,
        });
        const full = await askAI({ ...p, task: 'oefeningen bij een sectie', maxTokens: 12000, onDelta, signal: ctrl.signal });
        const res = sanitizeSectionExercises(extractJson(full), {
          curriculumId: course.curriculumId,
          allowedGoalCodes: sectionGoals.map((g) => g.code),
        });
        if (res.widgets.length === 0) {
          setError(res.warnings[0] ?? 'De AI leverde geen bruikbare oefeningen op. Probeer het opnieuw.');
        } else {
          setPreview({ course, quizzes: [], exercises: res.widgets, warnings: res.warnings });
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  };

  // Per hoofdstuk optimaliseren: toepassen heeft pas zin als minstens één
  // hoofdstuk echt geoptimaliseerd is, en niet terwijl er nog een opnieuw loopt
  // (dat antwoord ging anders verloren).
  const perChapterPreview = mode === 'optimize' && preset !== 'hiaten' && preview !== null;
  const chapterTotal = preview?.course.chapters.length ?? 0;
  const failedChapterCount = perChapterPreview
    ? preview.course.chapters.filter((ch) => chapterErrors[ch.id] !== undefined).length
    : 0;
  const applyBlockedReason = !perChapterPreview ? ''
    : failedChapterCount === chapterTotal
      ? 'Geen enkel hoofdstuk kon geoptimaliseerd worden, dus er is nog niets om toe te passen. Probeer de hoofdstukken hierboven opnieuw.'
    : preview.course.chapters.some((ch) => chapterStatus[ch.id] === 'bezig')
      ? 'Even geduld: er wordt nog een hoofdstuk opnieuw geprobeerd.'
    : '';

  const apply = () => {
    if (!preview || applyBlockedReason) return;
    if (mode === 'section' && course && section && preview.blocks) {
      // Altijd achteraan toevoegen: de prompt vraagt de AI om AAN TE VULLEN op
      // wat er al staat. Vervangen gooide zo tekst en media van de leerkracht
      // weg die niet in het antwoord terugkwamen.
      const added = preview.blocks;
      const updated: Course = {
        ...course,
        chapters: course.chapters.map((ch) => ({
          ...ch,
          sections: ch.sections.map((se) => (se.id === section.id ? { ...se, blocks: [...se.blocks, ...added] } : se)),
        })),
      };
      onResult(updated);
      toast(`${added.length} blok(ken) achteraan de sectie toegevoegd`, 'ok');
      onClose();
      return;
    }
    if (mode === 'exercises' && course && section && preview.exercises) {
      // Widgets bewaren (ze leven verder als gewone oefeningen) en achteraan
      // de sectie inbedden, zodat resultaten meteen bij de cursus horen.
      const blocks: CourseBlock[] = [];
      for (const widget of preview.exercises) {
        saveWidget(course.curriculumId ? { ...widget, curriculumId: course.curriculumId } : widget);
        blocks.push({ id: uid(), type: 'widget', widgetId: widget.id, note: `Oefening bij "${section.title}"` });
      }
      const updated: Course = {
        ...course,
        chapters: course.chapters.map((ch) => ({
          ...ch,
          sections: ch.sections.map((se) => (se.id === section.id ? { ...se, blocks: [...se.blocks, ...blocks] } : se)),
        })),
      };
      onResult(updated);
      toast(`${preview.exercises.length} oefening(en) toegevoegd — kijk ze na`, 'ok');
      onClose();
      return;
    }
    // 'new' / 'rework' / 'optimize': eerst quizzes bewaren en per hoofdstuk
    // inbedden (positioneel: quiz i hoort bij hoofdstuk i; null = afgekeurd)
    const result: Course = JSON.parse(JSON.stringify(preview.course));
    preview.quizzes.forEach((quiz, i) => {
      if (!quiz) return;
      saveWidget(result.curriculumId ? { ...quiz, curriculumId: result.curriculumId } : quiz);
      const chapter = result.chapters[Math.min(i, result.chapters.length - 1)];
      const lastSection = chapter?.sections[chapter.sections.length - 1];
      if (lastSection) {
        lastSection.blocks.push({ id: uid(), type: 'widget', widgetId: quiz.id, note: 'Oefenquiz bij dit hoofdstuk' });
      }
    });
    onResult(result);
    toast(
      mode === 'new' ? 'Cursus aangemaakt — kijk alles na'
      : mode === 'optimize' && failedChapterCount > 0
        ? `Optimalisatie toegepast op ${chapterTotal - failedChapterCount} van ${chapterTotal} hoofdstukken — kijk alles na`
      : mode === 'optimize' ? 'Optimalisatie toegepast — kijk alles na'
      : 'Herwerking toegepast — kijk alles na',
      'ok'
    );
    onClose();
  };

  const secCount = (c: Course) => c.chapters.reduce((a, ch) => a + ch.sections.length, 0);

  /** Welke gekozen leerplandoelen komen (niet) terug in de voorvertoning? */
  const previewGoalCheck = useMemo(() => {
    if (!preview || selection.goals.length === 0) return null;
    const used = new Set<string>();
    for (const ch of preview.course.chapters) {
      for (const se of ch.sections) {
        if (se.optional) continue;
        for (const c of se.goalCodes ?? []) used.add(normalizeGoalCode(c));
      }
    }
    const missing = selection.goals.filter((g) => !used.has(normalizeGoalCode(g.code)));
    return { total: selection.goals.length, covered: selection.goals.length - missing.length, missing };
  }, [preview, selection.goals]);

  // ── Invoervelden van 'new', in de volgorde die bij het vertrekpunt past ────
  const sourceField = (
    <Field
      key="source"
      label="Bronmateriaal (aanbevolen)"
      hint="Plak je cursustekst, een hoofdstuk uit het handboek of lees een pdf in. De AI bouwt de hoofdstukken en secties op uit dít materiaal en verzint er niets bij."
    >
      <textarea className="textarea" rows={7} value={sourceNew} onChange={(e) => setSourceNew(e.target.value)}
        placeholder="Plak hier je eigen tekst — of kies hieronder een pdf." />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <PdfImportButton onText={(t) => {
          if (sourceNew.trim().length > 200 && !window.confirm('Het bronveld bevat al tekst. Vervangen door de tekst uit de pdf?')) return;
          setSourceNew(t);
        }} />
        <span className="hint">
          {sourceNew.length > 0
            ? `${sourceNew.length.toLocaleString('nl-BE')} tekens${sourceNew.length > MAX_SOURCE_CHARS ? ` — alleen de eerste ${MAX_SOURCE_CHARS.toLocaleString('nl-BE')} gaan mee; knip lange boeken per hoofdstuk` : ''}`
            : 'Werkt met tekst-pdf’s; een gescande pdf (foto’s) bevat geen leesbare tekst.'}
        </span>
      </div>
    </Field>
  );

  const curriculumField = (
    <div key="curriculum" className="card card-pad" style={{ marginBottom: 14 }}>
      <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><GoalIcon size={16} /> Blanco vanuit leerplan</strong>
      <p className="hint" style={{ margin: '2px 0 10px' }}>
        Kies je doelen: de AI bouwt een cursus die ze allemaal dekt en zet de doelcodes op elke
        sectie. Zo zie je achteraf meteen de dekking — en werkt het klasoverzicht per doel.
      </p>
      <CurriculumPicker
        curriculumId={selection.curriculumId}
        goalCodes={selection.goalCodes}
        onChange={setSelection}
        compact
      />
      {selection.goals.length > 0 && (
        <p className="hint" style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }} aria-live="polite">
          <CheckIcon size={14} aria-hidden /> {selection.goals.length} doel(en) gaan mee in de opdracht.
        </p>
      )}
    </div>
  );

  const freeGoalsField = (
    <Field
      key="freegoals"
      label={sourceNew.trim() || selection.goals.length ? 'Extra leerdoelen in vrije tekst (optioneel)' : 'Leerplandoelen (verplicht zonder bronmateriaal)'}
      hint="Voor doelen die (nog) niet in een leerplanlijst staan. Ze komen in de “goals” van de secties terecht, maar dragen geen code."
    >
      <textarea className="textarea" rows={selection.goals.length ? 3 : 7} value={goals} onChange={(e) => setGoals(e.target.value)}
        placeholder={'bv.\n• De leerlingen kunnen de fasen van de waterkringloop benoemen en uitleggen.\n• De leerlingen kunnen verdamping en condensatie onderzoeken met een eenvoudige proef.'} />
    </Field>
  );

  return (
    <Modal title={TITLES[mode]} onClose={onClose} wide>
      <AIGate>
        {originNote && !preview && (
          <p className="callout" style={{ marginTop: 0 }}><ImportIcon size={16} aria-hidden /> {originNote}</p>
        )}
        {!busy && !preview && (
          <div style={{ display: 'grid', gap: 4 }}>
            {mode === 'new' && (
              <>
                <div style={{ display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="Vak / onderwerp">
                    <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="bv. Natuurwetenschappen — de waterkringloop" />
                  </Field>
                  <Field label="Doelgroep">
                    <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="bv. 1e graad A-stroom" />
                  </Field>
                </div>
                {title.trim().length > 0 && (
                  <Field label="Voorgestelde titel">
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </Field>
                )}
                {focus === 'curriculum'
                  ? [curriculumField, sourceField, freeGoalsField]
                  : [sourceField, curriculumField, freeGoalsField]}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label="Aantal hoofdstukken" hint="0 = AI kiest">
                    <input className="input input-sm" type="number" min={0} max={12} style={{ maxWidth: 100 }}
                      value={chapterCount} onChange={(e) => setChapterCount(Math.max(0, parseInt(e.target.value) || 0))} />
                  </Field>
                  <Field label="Extra wensen (optioneel)">
                    <input className="input" value={extraWishes} onChange={(e) => setExtraWishes(e.target.value)}
                      placeholder="bv. veel voorbeelden uit het dagelijks leven" />
                  </Field>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={withQuizzes} onChange={(e) => setWithQuizzes(e.target.checked)} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CheckIcon size={14} aria-hidden /> Per hoofdstuk ook een oefenquiz maken (aparte widgets, automatisch ingebed in de cursus)
                  </span>
                </label>
              </>
            )}
            {mode === 'rework' && course && (
              <>
                <p className="hint" style={{ margin: 0 }}>
                  Huidige cursus: <strong>{course.title}</strong> — {course.chapters.length} hoofdstuk(ken), {secCount(course)} secties.
                  Mediablokken (afbeeldingen, video's, oefeningen) blijven behouden; leesvoortgang blijft geldig voor secties die in essentie dezelfde blijven.
                </p>
                <Field label="Wat moet er anders?">
                  <textarea className="textarea" rows={4} value={wishes} onChange={(e) => setWishes(e.target.value)}
                    placeholder="bv. verdeel in kleinere secties, voeg leerdoelen en controlevragen toe, eenvoudiger taal voor 1e graad" />
                </Field>
                <BackupButton course={course} />
              </>
            )}
            {mode === 'optimize' && course && (
              <>
                <p className="hint" style={{ margin: 0 }}>
                  <strong>{course.title}</strong> — {course.chapters.length} hoofdstuk(ken), {secCount(course)} secties.
                  {coverage ? ` ${coverage.summary}` : ' Koppel een leerplan in de cursusinstellingen om ook de hiaten te kunnen vullen.'}
                </p>
                <fieldset style={{ border: 'none', padding: 0, margin: '10px 0 0' }}>
                  <legend style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-soft)', padding: 0 }}>
                    Wat wil je optimaliseren?
                  </legend>
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    {OPTIMIZE_PRESETS.map((p) => {
                      const needsCurriculum = p.id === 'hiaten';
                      const disabled = needsCurriculum && !coverage;
                      return (
                        <label key={p.id} className="checkbox-row" style={{ alignItems: 'flex-start', opacity: disabled ? 0.55 : 1 }}>
                          <input
                            type="radio"
                            name="optimize-preset"
                            checked={preset === p.id}
                            disabled={disabled}
                            onChange={() => setPreset(p.id)}
                          />
                          <span>
                            <strong>{p.label}</strong>
                            <span className="hint" style={{ display: 'block' }}>
                              {p.hint}
                              {disabled && ' — kies eerst een leerplan bij de cursusinstellingen.'}
                              {needsCurriculum && coverage && uncoveredGoals.length > 0 && ` Nu nog ${uncoveredGoals.length} doel(en) open.`}
                              {needsCurriculum && coverage && uncoveredGoals.length === 0 && ' Alles is al gedekt.'}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <Field label="Extra wensen (optioneel)" hint="Wordt gecombineerd met je keuze hierboven.">
                  <input className="input" value={wishes} onChange={(e) => setWishes(e.target.value)}
                    placeholder="bv. meer voorbeelden uit de sportwereld" />
                </Field>
                {preset === 'hiaten' && uncoveredGoals.length > 0 && (
                  <details className="card card-pad" style={{ marginBottom: 10 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                      {uncoveredGoals.length} doel(en) die nog niet gedekt zijn
                    </summary>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.9rem' }}>
                      {uncoveredGoals.map((g) => (
                        <li key={g.id}><strong style={{ fontFamily: 'monospace' }}>{g.code}</strong> {g.text}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <BackupButton course={course} />
              </>
            )}
            {mode === 'section' && section && (
              <>
                <Field
                  label="Wat moet er in deze sectie komen?"
                  hint={section.blocks.length > 0
                    ? 'De AI vult aan op wat er al staat. De nieuwe blokken komen achteraan; de bestaande blokken blijven staan.'
                    : undefined}
                >
                  <textarea className="textarea" rows={3} value={wishes} onChange={(e) => setWishes(e.target.value)}
                    placeholder={`bv. uitleg over "${section.title}" met een begrippenlijst en een check-jezelf-lijstje`} />
                </Field>
                <Field label="Bronmateriaal (optioneel)" hint="Plak je eigen cursustekst; de AI blijft er dan strikt bij.">
                  <textarea className="textarea" rows={5} value={source} onChange={(e) => setSource(e.target.value)} />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                    <PdfImportButton onText={(t) => {
                      if (source.trim().length > 200 && !window.confirm('Het bronveld bevat al tekst. Vervangen door de tekst uit de pdf?')) return;
                      setSource(t);
                    }} />
                    <span className="hint">Werkt met tekst-pdf's; een gescande pdf (foto's) bevat geen leesbare tekst.</span>
                  </div>
                </Field>
              </>
            )}
            {mode === 'exercises' && section && (
              <>
                <p className="hint" style={{ margin: 0 }}>
                  Oefeningen bij de sectie <strong>{section.title}</strong>
                  {section.blocks.length === 0 && ' (deze sectie bevat nog geen inhoud — de AI vertrekt dan van de titel en de doelen)'}
                  . Ze worden bewaard bij “Mijn widgets” én achteraan deze sectie ingebed.
                </p>
                {sectionGoals.length > 0 ? (
                  <p className="hint" style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GoalIcon size={14} aria-hidden /> Doelen van deze sectie: {sectionGoals.map((g) => g.code).join(', ')} — de vragen krijgen die codes mee.
                  </p>
                ) : (
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    Deze sectie draagt nog geen leerplancodes. Voeg ze toe bij de sectie-instellingen, dan
                    koppelt de AI elke vraag aan een doel.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
                  <Field label="Aantal oefeningen" hint="1 tot 3; de eerste is altijd een quiz.">
                    <input
                      className="input input-sm" type="number" min={1} max={3} style={{ maxWidth: 90 }}
                      value={exerciseCount}
                      onChange={(e) => setExerciseCount(Math.min(3, Math.max(1, parseInt(e.target.value) || 1)))}
                    />
                  </Field>
                  <Field label="Extra wensen (optioneel)">
                    <input className="input" value={wishes} onChange={(e) => setWishes(e.target.value)}
                      placeholder="bv. ook een paar open vragen" />
                  </Field>
                </div>
              </>
            )}
            {/* Te groot: opnieuw proberen geeft hetzelfde resultaat, dus geen knop. */}
            {error && <AIErrorBox error={error} onRetry={error.startsWith(TOO_BIG_MESSAGE) ? undefined : generate} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
              <button className="btn btn-ai" disabled={!canGenerate} onClick={generate}><AIIcon size={16} /> Genereren</button>
            </div>
          </div>
        )}

        {busy && mode === 'optimize' && preset !== 'hiaten' && course ? (
          <ChapterOptimizeProgress
            chapters={course.chapters}
            status={chapterStatus}
            onCancel={() => ctrlRef.current?.abort()}
          />
        ) : busy && (
          <AIWorkingBox
            streamText={stream}
            label={
              mode === 'section' ? 'De AI schrijft de sectie…'
              : mode === 'exercises' ? 'De AI maakt oefeningen…'
              : 'De AI bouwt de cursus… (dit kan een minuut duren)'
            }
            onCancel={() => ctrlRef.current?.abort()}
          />
        )}

        {!busy && preview && (
          <div style={{ display: 'grid', gap: 12 }}>
            <AIReviewNote />
            {preview.warnings.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--warn)', fontSize: '0.88rem' }}>
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {mode === 'optimize' && preset !== 'hiaten' && Object.keys(chapterErrors).length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(chapterErrors).map(([chId, msg]) => {
                  const ch = preview.course.chapters.find((c) => c.id === chId);
                  const retrying = chapterStatus[chId] === 'bezig';
                  return (
                    <div key={chId} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', borderColor: 'var(--err)' }}>
                      <WarningIcon size={18} aria-hidden style={{ color: 'var(--err)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <strong>{ch?.emoji} {ch?.title ?? 'Hoofdstuk'}</strong>
                        <span className="hint" style={{ display: 'block' }}>
                          {retrying ? 'Wordt opnieuw geprobeerd…' : msg}
                        </span>
                      </div>
                      <button className="btn btn-sm" onClick={() => retryChapter(chId)} disabled={retrying}>
                        <RetryIcon size={16} aria-hidden /> Opnieuw proberen
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {mode === 'exercises' && preview.exercises ? (
              <div className="card" style={{ padding: 14 }}>
                <strong>{preview.exercises.length} oefening(en) voor “{section?.title}”</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.92rem' }}>
                  {preview.exercises.map((w) => {
                    const questions = (w.config as { questions?: unknown[] }).questions;
                    const items = (w.config as { cards?: unknown[]; pairs?: unknown[]; items?: unknown[] });
                    const count = questions?.length ?? items.cards?.length ?? items.pairs?.length ?? items.items?.length;
                    return (
                      <li key={w.id}>
                        <strong>{w.title}</strong>
                        <span className="hint"> · {w.type}{count ? ` · ${count} item(s)` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : mode === 'section' && preview.blocks ? (
              <>
                <div className="card" style={{ padding: 14 }}>
                  <strong>{preview.blocks.length} blok(ken) voor "{section?.title}"</strong>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.9rem', color: 'var(--text-soft)' }}>
                    {preview.blocks.map((b) => (
                      <li key={b.id}>
                        <code>{b.type}</code>
                        {' — '}
                        {(b.type === 'heading' && b.text) ||
                          (b.type === 'text' && b.markdown.slice(0, 90)) ||
                          (b.type === 'callout' && `${b.kind}: ${b.text.slice(0, 80)}`) ||
                          (b.type === 'checklist' && `${b.items.length} items`) ||
                          (b.type === 'terms' && `${b.items.length} begrippen`) ||
                          (b.type === 'accordion' && `${b.items.length} onderdelen`) ||
                          ''}
                      </li>
                    ))}
                  </ul>
                </div>
                {section && section.blocks.length > 0 && (
                  <p className="hint" style={{ margin: 0 }}>
                    Deze blokken komen achteraan de sectie. Wat er al staat, blijft staan; schrappen of
                    verschuiven doe je daarna zelf in de editor.
                  </p>
                )}
              </>
            ) : (
              <div className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '1.6rem' }} aria-hidden>{preview.course.coverEmoji}</span>
                  <div>
                    <strong>{preview.course.title}</strong>
                    {preview.course.subtitle && <div className="hint">{preview.course.subtitle}</div>}
                  </div>
                </div>
                {(mode === 'rework' || mode === 'optimize') && course && (
                  <p className="hint" style={{ margin: '0 0 8px' }}>
                    {course.chapters.length} → {preview.course.chapters.length} hoofdstukken · {secCount(course)} → {secCount(preview.course)} secties.
                    Controleer het resultaat; via je back-upbestand kan je altijd terug.
                  </p>
                )}
                {previewGoalCheck && (
                  <p style={{ margin: '0 0 8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }} aria-live="polite">
                    <GoalIcon size={14} aria-hidden />
                    <span>
                      {previewGoalCheck.covered} van {previewGoalCheck.total} gekozen doelen staan op een gewone sectie.
                      {previewGoalCheck.missing.length > 0 && (
                        <span className="hint"> Nog open: {previewGoalCheck.missing.map((g) => g.code).join(', ')}.</span>
                      )}
                    </span>
                  </p>
                )}
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {preview.course.chapters.map((ch) => (
                    <li key={ch.id} style={{ marginBottom: 6 }}>
                      <strong>{ch.emoji} {ch.title}</strong>
                      <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                        {ch.sections.map((se) => (
                          <li key={se.id}>
                            {se.title} · {se.blocks.length} blok(ken)
                            {se.optional && <em> (verdieping)</em>}
                            {se.goalCodes?.length ? (
                              <span> · <GoalIcon size={12} className="icon-inline" /> {se.goalCodes.join(', ')}</span>
                            ) : se.goals?.length ? (
                              <span> · <GoalIcon size={12} className="icon-inline" /> {se.goals.length} doel(en)</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                {preview.quizzes.some(Boolean) && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Puzzle size={14} aria-hidden />
                    <span>
                      {preview.quizzes.filter(Boolean).length} oefenquiz(zen):{' '}
                      {preview.quizzes
                        .filter((q): q is Widget => q !== null)
                        .map((q) => `"${q.title}" (${(q.config as { questions: unknown[] }).questions.length} vragen)`)
                        .join(' · ')}
                    </span>
                  </p>
                )}
              </div>
            )}
            {applyBlockedReason && (
              <p id="course-ai-apply-reason" className="hint" role="status" style={{ margin: 0, textAlign: 'right' }}>
                {applyBlockedReason}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}><BackIcon size={16} /> Aanpassen</button>
              <button className="btn btn-ghost" onClick={generate}><RetryIcon size={16} /> Opnieuw genereren</button>
              <button
                className="btn btn-primary"
                onClick={apply}
                disabled={Boolean(applyBlockedReason)}
                aria-describedby={applyBlockedReason ? 'course-ai-apply-reason' : undefined}
              >
                <CheckIcon size={16} />
                {mode === 'new' ? 'Cursus aanmaken'
                  : mode === 'rework' ? 'Herwerking toepassen'
                  : mode === 'optimize' ? 'Optimalisatie toepassen'
                  : mode === 'exercises' ? 'Oefeningen toevoegen'
                  : 'Toepassen'}
              </button>
            </div>
          </div>
        )}
      </AIGate>
    </Modal>
  );
}

/** Voortgang tijdens het per-hoofdstuk optimaliseren: "hoofdstuk X van Y" + status per hoofdstuk. */
function ChapterOptimizeProgress({
  chapters, status, onCancel,
}: {
  chapters: CourseChapter[];
  status: Record<string, BatchItemStatus>;
  onCancel: () => void;
}) {
  const done = chapters.filter((ch) => {
    const s = status[ch.id];
    return s === 'klaar' || s === 'mislukt' || s === 'geannuleerd';
  }).length;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="ai-pulse" aria-hidden><AIIcon size={18} /></span>
        <strong aria-live="polite">Hoofdstuk {Math.min(done + 1, chapters.length)} van {chapters.length}…</strong>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>Annuleren</button>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {chapters.map((ch) => {
          const st = status[ch.id] ?? 'wachten';
          return (
            <li key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{ch.emoji} {ch.title}</span>
              {st === 'klaar' && <CheckIcon size={16} aria-hidden style={{ color: 'var(--ok)' }} />}
              {st === 'mislukt' && <WarningIcon size={16} aria-hidden style={{ color: 'var(--err)' }} />}
              <span className="hint">{st}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Eerst back-up downloaden": herwerken en optimaliseren overschrijven veel. */
function BackupButton({ course }: { course: Course }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-sm btn-ghost"
      style={{ justifySelf: 'start' }}
      onClick={() => {
        exportCourseJson(course)
          .then((json) => downloadFile(`${course.title || 'cursus'} (backup).json`, json))
          .catch(() => toast('De back-up is mislukt. Probeer opnieuw, en ga pas verder als ze gelukt is.', 'err'));
      }}
    >
      <DownloadIcon size={16} /> Eerst back-up downloaden
    </button>
  );
}
