// ── Score per leerplandoel: de lijm tussen widgets, cursussen en klassen ────
//
// Vragen dragen een goalCode (leerplan) en/of een vrije goal-tag. Een inzending
// heeft itemScores per vraag-id. Hier tellen we die op per doelcode, zodat
// resultaten, cursusdekking en het klasoverzicht dezelfde cijfers tonen.

import type { Submission, Widget } from './types';
import type { Course } from './courseTypes';
import { allSections } from './courseTypes';
import { normalizeGoalCode } from './curriculum';

export interface GoalScore {
  code: string;
  /**
   * Leerplan van de widget waar de vragen uit komen. Dezelfde code in twee
   * leerplannen ("LPD 9" van twee vakken) is een ánder doel: die scores blijven
   * apart. Ontbreekt bij widgets zonder leerplan; die tellen onderling samen op
   * code, zoals vroeger. Geef het mee aan `goalLabel(code, curriculumId)`.
   */
  curriculumId?: string;
  earned: number;
  max: number;
  /** Aantal vragen dat meetelde (nagekeken of automatisch beoordeeld). */
  items: number;
  /**
   * Vragen met deze code die nog nagekeken moeten worden (open vraag, upload).
   * Ze tellen níet mee in earned/max/items: de score is dan voorlopig. Met
   * `max === 0` wacht er voor dit doel alleen nog werk (goalPct geeft null).
   * Ontbreekt als er niets meer wacht.
   */
  pending?: number;
}

/**
 * Unieke sleutel van een doelscore: leerplan + code. Gebruik hem als React-key
 * en om in de Map van `aggregateGoalScores` op te zoeken.
 */
export function goalScoreKey(g: { code: string; curriculumId?: string }): string {
  return `${g.curriculumId || ''}|${g.code}`;
}

interface QuestionLike { id: string; goalCode?: string; goal?: string }

/** Vragen uit een widgetconfig, als die er zijn (quiz, gesplitst werkblad, …). */
export function questionsOf(widget: Widget): QuestionLike[] {
  const cfg = widget.config as { questions?: unknown };
  if (!cfg || !Array.isArray(cfg.questions)) return [];
  return (cfg.questions as unknown[]).filter(
    (q): q is QuestionLike => !!q && typeof q === 'object' && typeof (q as QuestionLike).id === 'string'
  );
}

/** Alle doelcodes waar een widget aan werkt (genormaliseerd, uniek). */
export function widgetGoalCodes(widget: Widget): string[] {
  const out = new Set<string>();
  for (const q of questionsOf(widget)) if (q.goalCode?.trim()) out.add(normalizeGoalCode(q.goalCode));
  return [...out];
}

/** Alle doelcodes waar een cursus aan werkt (secties + ingebedde widgets die je meegeeft). */
export function courseGoalCodes(course: Course, widgets: Widget[] = []): string[] {
  const out = new Set<string>();
  for (const { section } of allSections(course)) {
    for (const c of section.goalCodes ?? []) if (c.trim()) out.add(normalizeGoalCode(c));
  }
  for (const w of widgets) for (const c of widgetGoalCodes(w)) out.add(c);
  return [...out];
}

function emptyGoalScore(code: string, curriculumId: string | undefined): GoalScore {
  return { code, ...(curriculumId ? { curriculumId } : {}), earned: 0, max: 0, items: 0 };
}

/**
 * Score per doelcode voor één inzending. Vragen zonder code tellen niet mee.
 * De scores dragen het leerplan van de widget (`curriculumId`). Vragen die nog
 * op nakijken wachten (`mode: 'pending'`) tellen niet als 0 maar komen in
 * `pending`, net zoals de resultatenpagina's ze weglaten.
 */
export function scoresPerGoal(submission: Submission, widget: Widget): GoalScore[] {
  if (!submission.itemScores) return [];
  const curriculumId = widget.curriculumId || undefined;
  const map = new Map<string, GoalScore>();
  for (const q of questionsOf(widget)) {
    if (!q.goalCode?.trim()) continue;
    const s = submission.itemScores[q.id];
    if (!s || s.max <= 0) continue;
    const code = normalizeGoalCode(q.goalCode);
    const key = goalScoreKey({ code, curriculumId });
    const cur = map.get(key) ?? emptyGoalScore(code, curriculumId);
    if (s.mode === 'pending') {
      cur.pending = (cur.pending ?? 0) + 1;
    } else {
      cur.earned += s.earned;
      cur.max += s.max;
      cur.items += 1;
    }
    map.set(key, cur);
  }
  return [...map.values()];
}

/**
 * Meerdere lijsten samenvoegen (bv. alle inzendingen van één leerling).
 * Sleutel van de Map: `goalScoreKey(g)`, dus leerplan + code.
 */
export function aggregateGoalScores(lists: GoalScore[][]): Map<string, GoalScore> {
  const map = new Map<string, GoalScore>();
  for (const list of lists) {
    for (const g of list) {
      const curriculumId = g.curriculumId || undefined;
      const key = goalScoreKey({ code: g.code, curriculumId });
      const cur = map.get(key) ?? emptyGoalScore(g.code, curriculumId);
      cur.earned += g.earned;
      cur.max += g.max;
      cur.items += g.items;
      if (g.pending) cur.pending = (cur.pending ?? 0) + g.pending;
      map.set(key, cur);
    }
  }
  return map;
}

/**
 * Wacht deze inzending nog op nakijken? Dan is haar score voorlopig: een open
 * vraag of upload die nog niet nagekeken is, staat als 0 in `totalEarned`.
 * Zelfde regel als de teller "Nakijken" (status 'submitted'), met als vangnet
 * een vraag die nog op 'pending' staat terwijl de status iets anders zegt.
 */
export function awaitsGrading(submission: Pick<Submission, 'status' | 'itemScores'>): boolean {
  if (submission.status === 'submitted') return true;
  const scores: unknown = submission.itemScores;
  if (!scores || typeof scores !== 'object') return false;
  return Object.values(scores as Record<string, unknown>).some(
    (s) => !!s && typeof s === 'object' && (s as { mode?: unknown }).mode === 'pending'
  );
}

/** Percentage (0–100) of null zonder meetbare punten. */
export function goalPct(g: GoalScore | undefined): number | null {
  if (!g || g.max <= 0) return null;
  return Math.round((g.earned / g.max) * 100);
}
