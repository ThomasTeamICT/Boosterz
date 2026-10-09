// ── Dekking: welk leerplandoel komt waar aan bod? ───────────────────────────
//
// Pure functies (geen opslag, geen DOM): een cursus + een leerplan + de
// ingebedde widgets in, per doel een rij met de secties en oefeningen die
// eraan werken eruit. De editor tekent daar een matrix mee, en de cursuskaart
// toont er een percentage van.
//
// Een doel telt als GEDEKT zodra minstens één gewone (niet-optionele) sectie
// of een oefening in zo'n sectie de code draagt. Komt het alleen in
// keuzesecties voor, dan is het 'verdieping': niet elke leerling ziet het.
// Een oefening die aan een ánder leerplan hangt (widget.curriculumId), dekt
// niets: dezelfde code is daar een ander doel.

import type { Course, CourseBlock, CourseChapter, CourseSection } from './courseTypes';
import { allSections } from './courseTypes';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import type { Widget } from './types';
import { normalizeGoalCode } from './curriculum';
import { widgetGoalCodes } from './goals';

export type CoverageStatus = 'covered' | 'optional' | 'missing';

export interface CoverageSectionRef {
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
  optional: boolean;
}

export interface CoverageWidgetRef {
  widgetId: string;
  title: string;
  /** Sectie waarin de oefening ingebed staat (leeg als ze nergens staat). */
  sectionId?: string;
  sectionTitle?: string;
  optional: boolean;
  /** Leerplan van de oefening; alleen ingevuld in `otherCurriculumWidgets`. */
  curriculumId?: string;
}

export interface CoverageRow {
  goal: CurriculumGoal;
  code: string;
  sections: CoverageSectionRef[];
  widgets: CoverageWidgetRef[];
  status: CoverageStatus;
}

export interface CoverageResult {
  rows: CoverageRow[];
  /** Rijen met status 'missing' of 'optional' — wat er nog te doen is. */
  uncovered: CoverageRow[];
  /** Aantal doelen met status 'covered'. */
  covered: number;
  total: number;
  /** 0–100; 0 als het leerplan geen doelen heeft. */
  percent: number;
  /** Codes die in de cursus staan maar niet in dit leerplan voorkomen. */
  unknownCodes: string[];
  /**
   * Secties zonder enige code van dit leerplan (vrije doelen en codes van een
   * oefening uit een ander leerplan tellen hier niet mee).
   */
  sectionsWithoutCode: CoverageSectionRef[];
  /**
   * Ingebedde oefeningen met doelcodes die aan een ánder leerplan hangen dan
   * dat van de cursus. Hun codes tellen niet mee, ook niet als dezelfde code
   * in dit leerplan staat (zie docs/LEERPLANNEN.md § 2).
   */
  otherCurriculumWidgets: CoverageWidgetRef[];
  /** Kant-en-klare samenvatting, bv. "Dekkend: 14 van 18 doelen". */
  summary: string;
}

function sectionRef(chapter: CourseChapter, section: CourseSection): CoverageSectionRef {
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionId: section.id,
    sectionTitle: section.title,
    optional: section.optional === true,
  };
}

/**
 * Dekking berekenen. `widgets` mag gerust álle widgets van het toestel zijn:
 * alleen de exemplaren die in deze cursus ingebed staan tellen mee.
 */
export function computeCoverage(
  course: Course,
  curriculum: Curriculum | undefined,
  widgets: Widget[] = []
): CoverageResult {
  const goals = curriculum?.goals ?? [];
  const rows: CoverageRow[] = goals.map((goal) => ({
    goal,
    code: normalizeGoalCode(goal.code),
    sections: [],
    widgets: [],
    status: 'missing' as CoverageStatus,
  }));
  const byCode = new Map<string, CoverageRow>();
  for (const row of rows) if (!byCode.has(row.code)) byCode.set(row.code, row);

  const widgetById = new Map(widgets.map((w) => [w.id, w]));
  const unknown = new Set<string>();
  const sectionsWithoutCode: CoverageSectionRef[] = [];
  const otherCurriculumWidgets: CoverageWidgetRef[] = [];
  // Het leerplan waartegen we rekenen: het meegegeven leerplan, anders dat van de cursus.
  const targetId = curriculum?.id || course.curriculumId || undefined;

  for (const { chapter, section } of allSections(course)) {
    const ref = sectionRef(chapter, section);
    let hasAnyCode = false;

    const seen = new Set<string>();
    for (const raw of section.goalCodes ?? []) {
      const code = normalizeGoalCode(raw ?? '');
      if (!code || seen.has(code)) continue;
      seen.add(code);
      hasAnyCode = true;
      const row = byCode.get(code);
      if (!row) { unknown.add(code); continue; }
      row.sections.push(ref);
    }

    // Ingebedde oefeningen: hun vragen dragen de codes (zie lib/goals.ts).
    for (const block of section.blocks) {
      if (block.type !== 'widget' || !block.widgetId) continue;
      const widget = widgetById.get(block.widgetId);
      if (!widget) continue;
      const codes = widgetGoalCodes(widget);
      // Een code betekent pas iets binnen zijn leerplan: hangt de oefening aan
      // een ander leerplan, dan dekt "1.1" daar niet "1.1" van dit leerplan.
      if (targetId && widget.curriculumId && widget.curriculumId !== targetId) {
        if (codes.length > 0 && !otherCurriculumWidgets.some((w) => w.widgetId === widget.id && w.sectionId === section.id)) {
          otherCurriculumWidgets.push({
            widgetId: widget.id,
            title: widget.title,
            sectionId: section.id,
            sectionTitle: section.title,
            optional: ref.optional,
            curriculumId: widget.curriculumId,
          });
        }
        continue;
      }
      for (const code of codes) {
        hasAnyCode = true;
        const row = byCode.get(code);
        if (!row) { unknown.add(code); continue; }
        if (row.widgets.some((w) => w.widgetId === widget.id && w.sectionId === section.id)) continue;
        row.widgets.push({
          widgetId: widget.id,
          title: widget.title,
          sectionId: section.id,
          sectionTitle: section.title,
          optional: ref.optional,
        });
      }
    }

    if (!hasAnyCode) sectionsWithoutCode.push(ref);
  }

  for (const row of rows) {
    const inCore = row.sections.some((s) => !s.optional) || row.widgets.some((w) => !w.optional);
    row.status = inCore ? 'covered' : row.sections.length || row.widgets.length ? 'optional' : 'missing';
  }

  const covered = rows.filter((r) => r.status === 'covered').length;
  const total = rows.length;
  const percent = total > 0 ? Math.round((covered / total) * 100) : 0;
  return {
    rows,
    uncovered: rows.filter((r) => r.status !== 'covered'),
    covered,
    total,
    percent,
    unknownCodes: [...unknown],
    sectionsWithoutCode,
    otherCurriculumWidgets,
    summary: total === 0
      ? 'Dit leerplan bevat nog geen doelen.'
      : covered === total
        ? `Dekkend: alle ${total} doelen komen aan bod.`
        : `Dekkend: ${covered} van ${total} doelen.`,
  };
}

// ── Gepland: een doel dat alleen op lege secties staat (docs/STUDIERICHTINGEN.md § 13.1) ──
//
// `computeCoverage` blijft wat het is: een code op een gewone sectie telt daar als gedekt, ook als de sectie nog leeg
// is. De dekking op de minimumdoelen (dekkingMinimumdoelen.ts) en de hint in de weergave "Leerplan" maken met de twee
// functies hieronder het onderscheid tussen "uitgewerkt" en "gepland" (een vers geraamte heeft alleen doelen-callouts).

/**
 * Heeft de sectie inhoud? Ja zodra er minstens één blok is dat geen doelen-callout (een callout met kind 'goal') is.
 * Een ingebedde oefening is ook een blok. Kapotte invoer (geen lijst, lege plaatsen) telt als leeg.
 */
export function sectieHeeftInhoud(section: CourseSection): boolean {
  const blocks: unknown = section?.blocks;
  if (!Array.isArray(blocks)) return false;
  return (blocks as (CourseBlock | null | undefined)[]).some(
    (b) => !!b && typeof b === 'object' && !(b.type === 'callout' && b.kind === 'goal'),
  );
}

/**
 * De rijen met status 'covered' die alleen gepland zijn: elke gewone (niet-optionele) sectie die de code draagt is
 * leeg (`sectieHeeftInhoud`), en geen oefening in een gewone sectie draagt de code. Zo'n doel komt wel in een gewone
 * sectie voor, maar is nog niet uitgewerkt. Inhoud of een oefening in een keuzesectie maakt een doel niet gedekt (zoals
 * in `computeCoverage`).
 *
 * `result` moet uit `computeCoverage` met dezelfde `course` komen. De oefeningen die meetellen staan al in de rijen
 * (`row.widgets`, alleen de ingebedde en die van hetzelfde leerplan): `widgets` is daarom niet nodig en wordt niet
 * gebruikt; de parameter staat er voor de vaste signatuur.
 */
export function geplandeRijen(result: CoverageResult, course: Course, _widgets?: readonly Widget[]): CoverageRow[] {
  // Codes (genormaliseerd zoals in computeCoverage) die op minstens één gewone sectie met inhoud staan.
  const metInhoud = new Set<string>();
  for (const { section } of allSections(course)) {
    if (section.optional === true || !sectieHeeftInhoud(section)) continue;
    for (const raw of section.goalCodes ?? []) {
      if (typeof raw !== 'string') continue;
      const code = normalizeGoalCode(raw);
      if (code) metInhoud.add(code);
    }
  }
  return result.rows.filter(
    (row) => row.status === 'covered' && !metInhoud.has(row.code) && !row.widgets.some((w) => !w.optional),
  );
}

/** Alleen het percentage (voor kaartjes en lijsten). */
export function coveragePercent(course: Course, curriculum: Curriculum | undefined, widgets: Widget[] = []): number {
  return computeCoverage(course, curriculum, widgets).percent;
}

/** Niet-gedekte doelen compact voor een AI-prompt: "CODE — doeltekst". */
export function uncoveredGoalLines(result: CoverageResult, max = 40): string[] {
  return result.uncovered.slice(0, max).map((r) => `${r.goal.code} — ${r.goal.text}`);
}
