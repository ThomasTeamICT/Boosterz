// ── Data voor de startpagina (/) ────────────────────────────────────────────
//
// Pure functies, los van de opslag: StartPage.tsx haalt de ruwe lijsten op
// (widgets, cursussen, klassen, inzendingen, opdrachten) en geeft ze hier
// binnen. Zo is de kernvraag — "is dit een terugkerende leerkracht, en wat
// moet ze eerst zien?" — met gewone waardes te testen, zonder localStorage.

import { EXAMPLE_COURSE_ID, EXAMPLE_FOLDER_ID } from './examples';
import type { WidgetTypeId } from './types';

// ── Wat telt als voorbeeldmateriaal? ────────────────────────────────────────
// Zie lib/seed.ts (widgettitels), lib/examples.ts (EXAMPLE_COURSE_ID) en
// lib/classes.ts (seedExampleClass) voor waar dit materiaal vandaan komt.

const EXAMPLE_WIDGET_PREFIXES = ['Voorbeeld:', 'Sjabloon:'];
/** Naam van de klas die seedExampleClass() aanmaakt (lib/classes.ts). */
export const EXAMPLE_CLASS_NAME = 'Voorbeeldklas 1A';

export function isExampleWidgetTitle(title: string): boolean {
  return EXAMPLE_WIDGET_PREFIXES.some((p) => title.startsWith(p));
}

/**
 * Is deze widget voorbeeldmateriaal? Aan de titel ("Voorbeeld:", "Sjabloon:"), of
 * omdat ze in de voorbeeldmap staat: de oefeningen van de voorbeeldcursus
 * natuurwetenschappen dragen geen voorvoegsel maar wel die map (lib/examples.ts).
 */
export function isExampleWidgetEntry(w: { title: string; folderId?: string | null }): boolean {
  return isExampleWidgetTitle(w.title) || w.folderId === EXAMPLE_FOLDER_ID;
}

/** Democursus (ensureDemoCourse) heet "Voorbeeldcursus: …"; de ingelezen
 * voorbeeldcursus natuurwetenschappen heeft het vaste id EXAMPLE_COURSE_ID. */
export function isExampleCourse(course: { id: string; title: string }): boolean {
  return course.id === EXAMPLE_COURSE_ID || course.title.startsWith('Voorbeeldcursus');
}

export function isExampleClassName(name: string): boolean {
  return name === EXAMPLE_CLASS_NAME;
}

export interface OwnMaterialInput {
  widgets: { title: string; folderId?: string | null }[];
  courses: { id: string; title: string }[];
  classes: { name: string; students: unknown[] }[];
}

/**
 * Is er eigen materiaal? Minstens één widget of cursus die niet uit de
 * voorbeelden komt, of een (niet-voorbeeld)klas met leerlingen. Bepaalt of de
 * startpagina het dashboard toont of de uitleg voor een eerste bezoek.
 */
export function isReturningTeacher(input: OwnMaterialInput): boolean {
  const hasOwnWidget = input.widgets.some((w) => !isExampleWidgetEntry(w));
  if (hasOwnWidget) return true;
  const hasOwnCourse = input.courses.some((c) => !isExampleCourse(c));
  if (hasOwnCourse) return true;
  return input.classes.some((c) => !isExampleClassName(c.name) && c.students.length > 0);
}

// ── Groet volgens het uur ────────────────────────────────────────────────────

export function greeting(hour: number): string {
  if (hour < 12) return 'Goeiemorgen';
  if (hour < 18) return 'Goeiemiddag';
  return 'Goeienavond';
}

// ── Relatieve tijd voor "verder werken" ─────────────────────────────────────

const DAY_MS = 86_400_000;
const WEEKDAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "vandaag", "gisteren", een korte dagnaam (< 1 week) of een datum. */
export function relativeDay(ts: number, now: number = Date.now()): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (daysAgo <= 0) return 'vandaag';
  if (daysAgo === 1) return 'gisteren';
  if (daysAgo < 7) return WEEKDAYS_SHORT[new Date(ts).getDay()];
  return new Date(ts).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

// ── Verder werken: laatst bewerkte widgets en cursussen samen ───────────────

export interface RecentWidgetInput {
  id: string;
  title: string;
  type: WidgetTypeId;
  updatedAt: number;
}
export interface RecentCourseInput {
  id: string;
  title: string;
  chapterCount: number;
  updatedAt: number;
}
export type RecentItem =
  | ({ kind: 'widget' } & RecentWidgetInput)
  | ({ kind: 'course' } & RecentCourseInput);

/** De N laatst bewerkte widgets en cursussen samen, nieuwste eerst. */
export function buildRecentItems(
  widgets: RecentWidgetInput[],
  courses: RecentCourseInput[],
  limit = 5
): RecentItem[] {
  const items: RecentItem[] = [
    ...widgets.map((w): RecentItem => ({ kind: 'widget', ...w })),
    ...courses.map((c): RecentItem => ({ kind: 'course', ...c })),
  ];
  return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

// ── Tellers die aandacht vragen ──────────────────────────────────────────────

export interface WeekCounts {
  /** Inzendingen die wachten op nakijken (status 'submitted'). */
  toGrade: number;
  /** Opdrachten met een deadline binnen de komende 7 dagen. */
  deadlinesThisWeek: number;
  /** Inzendingen van de afgelopen 7 dagen. */
  submittedThisWeek: number;
}

export function computeWeekCounts(
  submissions: { status: string; submittedAt: number }[],
  assignments: { dueAt?: number | null }[],
  now: number = Date.now()
): WeekCounts {
  const weekAhead = now + 7 * DAY_MS;
  const weekAgo = now - 7 * DAY_MS;
  return {
    toGrade: submissions.filter((s) => s.status === 'submitted').length,
    deadlinesThisWeek: assignments.filter(
      (a) => typeof a.dueAt === 'number' && a.dueAt >= now && a.dueAt <= weekAhead
    ).length,
    submittedThisWeek: submissions.filter((s) => s.submittedAt >= weekAgo && s.submittedAt <= now).length,
  };
}

// ── Klassen: eerstvolgende opdracht met deadline ────────────────────────────

/** De opdracht met de dichtstbijzijnde toekomstige deadline, of null. */
export function pickNextAssignment<T extends { dueAt?: number | null }>(
  assignments: T[],
  now: number = Date.now()
): T | null {
  let best: T | null = null;
  for (const a of assignments) {
    if (typeof a.dueAt !== 'number' || a.dueAt < now) continue;
    if (!best || a.dueAt < (best.dueAt as number)) best = a;
  }
  return best;
}
