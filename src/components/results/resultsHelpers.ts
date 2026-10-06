// ── Pure hulpfuncties voor de resultatenschermen van de leerkracht ──────────
//
// Geen React, geen opslag: zo zijn ze zonder DOM te testen. Gebruikt door
// ResultsPage, ResultsOverviewPage en CourseTrackPage. De rekenregels zelf
// (beste poging, voorlopig, doelscores per leerplan) staan in lib/classes.ts
// en lib/goals.ts; dit bestand gebruikt ze alleen.

import type { Submission } from '../../lib/types';
import type { Course, CourseProgress } from '../../lib/courseTypes';
import { allSections, progressPercent } from '../../lib/courseTypes';
import { bestAttempt } from '../../lib/classes';
import { awaitsGrading, goalScoreKey } from '../../lib/goals';
import { normalizeGoalCode } from '../../lib/curriculum';
import { csvCell, formatDate } from '../../lib/utils';

/**
 * Byte order mark vooraan een CSV: zonder deze drie bytes leest Excel een
 * utf-8-bestand als Windows-1252 en worden "é" en "ë" gebroken tekens.
 */
export const CSV_BOM = '﻿';

/** Mime-type voor een CSV-download; met de tekenset erbij, samen met de BOM. */
export const CSV_MIME = 'text/csv;charset=utf-8';

/**
 * Alle inzendingen één keer groeperen per widget. Wie per widget opnieuw
 * `getSubmissions(id)` aanroept, leest en ontleedt de hele lijst telkens
 * opnieuw (80 widgets met 2 MB aan inzendingen: 1,3 s per weergave). De
 * volgorde binnen een groep blijft die van de invoer.
 */
export function groupSubmissionsByWidget(subs: readonly Submission[]): Map<string, Submission[]> {
  const map = new Map<string, Submission[]>();
  for (const s of subs) {
    const list = map.get(s.widgetId);
    if (list) list.push(s);
    else map.set(s.widgetId, [s]);
  }
  return map;
}

/** Sleutel om één leerling te herkennen op naam: getrimd en zonder hoofdletters. */
export function studentKeyOf(s: Pick<Submission, 'studentName'>): string {
  const name = typeof s.studentName === 'string' ? s.studentName.trim() : '';
  return (name || 'Anoniem').toLowerCase();
}

/**
 * Per leerling één inzending van deze lijst (meestal van één widget): de beste
 * poging, dezelfde keuze als de matrix op het klasdashboard (`bestAttempt`).
 * Heeft geen enkele poging meetbare punten, dan telt de nieuwste. Zo trekt een
 * herkansing een doelscore niet omlaag.
 */
export function bestAttemptPerStudent(subs: readonly Submission[]): Submission[] {
  const perStudent = new Map<string, Submission[]>();
  for (const s of subs) {
    const key = studentKeyOf(s);
    const list = perStudent.get(key);
    if (list) list.push(s);
    else perStudent.set(key, [s]);
  }
  const out: Submission[] = [];
  for (const list of perStudent.values()) {
    const newestFirst = [...list].sort((a, b) => b.submittedAt - a.submittedAt);
    const pick = bestAttempt(newestFirst) ?? newestFirst[0];
    if (pick) out.push(pick);
  }
  return out;
}

/** Aantal inzendingen dat nog nagekeken moet worden (open vraag, upload). */
export function awaitingCount(subs: readonly Submission[]): number {
  return subs.filter((s) => awaitsGrading(s)).length;
}

/** Aan welk doel telt een vraag mee, en onder welke naam staat het in de lijst? */
export interface GoalRef {
  /**
   * Unieke sleutel. Een leerplancode draagt het leerplan van de widget
   * ("LPD 9" van twee vakken is een ander doel); een vrije doel-tag staat
   * apart onder `vrij:`.
   */
  key: string;
  /** De genormaliseerde leerplancode, of null bij een vrije doel-tag. */
  code: string | null;
  /** Leerplan van de widget, enkel bij een code en als de widget er een heeft. */
  curriculumId?: string;
  /** De vrije doel-tag, of null bij een leerplancode. */
  tag: string | null;
}

/**
 * Aan welk doel telt deze vraag mee? De leerplancode gaat vóór de vrije tag.
 * Geef het `curriculumId` van de widget mee: de sleutel gebruikt dezelfde
 * `goalScoreKey` (leerplan + code) als de doelscores in lib/goals.ts.
 */
export function goalRefOf(
  q: { goalCode?: string; goal?: string },
  curriculumId?: string
): GoalRef | null {
  if (q.goalCode?.trim()) {
    const code = normalizeGoalCode(q.goalCode);
    const cur = curriculumId || undefined;
    return { key: `code:${goalScoreKey({ code, curriculumId: cur })}`, code, ...(cur ? { curriculumId: cur } : {}), tag: null };
  }
  if (q.goal?.trim()) {
    const tag = q.goal.trim();
    return { key: `vrij:${tag}`, code: null, tag };
  }
  return null;
}

/**
 * De CSV van de leesvoortgang van een cursus: BOM vooraan, `;` als
 * scheidingsteken, elke cel via `csvCell` (een leerlingnaam die met `=` begint,
 * wordt nooit een formule). Eén rij per leerling, één kolom per sectie.
 */
export function courseProgressCsv(course: Course, progress: readonly CourseProgress[]): string {
  const sections = allSections(course);
  const head = [
    'naam', 'voortgang %', 'laatst gezien',
    ...sections.map(({ chapter, section }) => `${chapter.title} › ${section.title}${section.optional ? ' (keuze)' : ''}`),
  ];
  const lines = [head.map(csvCell).join(';')];
  for (const p of progress) {
    lines.push(
      [
        p.studentName,
        progressPercent(course, p),
        formatDate(p.lastSeenAt),
        ...sections.map(({ section }) => {
          const sp = p.sections[section.id];
          // geen "-": csvCell zou er een apostrof voor zetten, die Excel letterlijk toont
          return sp?.completedAt ? 'gelezen' : sp ? 'geopend' : 'niet geopend';
        }),
      ].map(csvCell).join(';')
    );
  }
  return CSV_BOM + lines.join('\n');
}
