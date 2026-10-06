// ── Kleine, zuivere hulpen voor het klasdashboard en de klassenlijst ────────
//
// Alles wat zonder scherm te testen valt: dubbele namen, de tekst van een
// voorlopige score, het csv-bestand van de klas en de datumwaarde voor een
// <input type="date">. De schermen (ClassDashboardPage, ClassesPage) halen
// hier hun tekst en hun rijen vandaan.

import type { Assignment, ClassStudent } from '../lib/classTypes';
import { normalizeName, statusSummary, type AssignmentStatus } from '../lib/classes';
import { goalPct, type GoalScore } from '../lib/goals';
import { csvCell } from '../lib/utils';

// ── Dubbele namen ───────────────────────────────────────────────────────────

/**
 * Namen die meer dan één keer in een klaslijst staan: elke naam één keer, zoals
 * hij bij de eerste leerling geschreven staat, in de volgorde van de lijst.
 * Hoofdletters en dubbele spaties tellen niet (zoals `parseStudentList`).
 * Lege namen tellen niet mee: die krijgen hun eigen melding.
 */
export function duplicateStudentNames(students: Pick<ClassStudent, 'name'>[]): string[] {
  const count = new Map<string, number>();
  const first = new Map<string, string>();
  for (const s of students) {
    const key = normalizeName(s.name);
    if (!key) continue;
    count.set(key, (count.get(key) ?? 0) + 1);
    if (!first.has(key)) first.set(key, s.name.trim().replace(/\s+/g, ' '));
  }
  return [...count].filter(([, n]) => n > 1).map(([key]) => first.get(key) ?? key);
}

/** Id's van de leerlingen met een naam die in de klas dubbel voorkomt. */
export function duplicateStudentIds(students: Pick<ClassStudent, 'id' | 'name'>[]): Set<string> {
  const dubbel = new Set(duplicateStudentNames(students).map(normalizeName));
  return new Set(students.filter((s) => dubbel.has(normalizeName(s.name))).map((s) => s.id));
}

/** Heeft een andere leerling in de lijst al deze naam? (naast `exceptId`) */
export function nameTaken(students: Pick<ClassStudent, 'id' | 'name'>[], name: string, exceptId?: string): boolean {
  const key = normalizeName(name);
  if (!key) return false;
  return students.some((s) => s.id !== exceptId && normalizeName(s.name) === key);
}

/** Bij een geplakte lijst: welke namen genegeerd worden omdat ze dubbel staan. */
export function pastedDuplicatesMessage(names: string[]): string {
  if (names.length === 0) return '';
  return `${names.length} dubbele ${names.length === 1 ? 'naam' : 'namen'} overgeslagen: ${names.join(', ')}`;
}

/** Bij een bestaande klas: dezelfde naam bij twee leerlingen, en wat daar mis van kan gaan. */
export function duplicatesInClassMessage(names: string[]): string {
  if (names.length === 0) return '';
  const wie = names.length === 1
    ? `“${names[0]}” staat meer dan eens in de klas.`
    : `Deze namen staan meer dan eens in de klas: ${names.join(', ')}.`;
  return `${wie} Werk dat Boosterz op naam koppelt, kan bij de verkeerde leerling terechtkomen. Geef elke leerling een eigen naam, bijvoorbeeld met een letter erachter.`;
}

/** Een naam toevoegen die al in de klas staat: geweigerd, met uitleg. */
export function nameTakenMessage(name: string): string {
  return `“${name.trim()}” staat al in de klas. Geef de nieuwe leerling een eigen naam, bijvoorbeeld met een letter of een tweede voornaam erachter.`;
}

// ── Voorlopige scores ───────────────────────────────────────────────────────

/**
 * `statusSummary`, maar een score die zelf nog op nakijken wacht staat als
 * "voorlopig": "20% (voorlopig) · 2 pogingen".
 */
export function statusSummaryProvisional(status: AssignmentStatus): string {
  if (
    status.state === 'niet gestart' || status.progressPct !== null ||
    !status.provisional || status.scorePct === null
  ) {
    return statusSummary(status);
  }
  const parts = [`${status.scorePct}% (voorlopig)`];
  if (status.attempts > 1) parts.push(`${status.attempts} pogingen`);
  return parts.join(' · ');
}

export interface GoalScoreView {
  /** Percentage voor de balk, of null als er nog niets meetelt. */
  pct: number | null;
  /** Nog niet alles is nagekeken: de score is niet definitief. */
  provisional: boolean;
  /** Tekst rechts van de balk. */
  text: string;
  /** Tekst voor schermlezers bij de balk (zonder de naam van het doel). */
  aria: string;
}

/**
 * Hoe een doelscore getoond wordt. Vragen die nog nagekeken moeten worden
 * (`GoalScore.pending`) tellen niet mee: de score heet dan "voorlopig", en als
 * er nog niets meetelt staat er "nog na te kijken" in plaats van 0 procent.
 */
export function goalScoreView(g: GoalScore): GoalScoreView {
  const pct = goalPct(g);
  const pending = g.pending ?? 0;
  const vragen = `${pending} ${pending === 1 ? 'vraag' : 'vragen'}`;
  if (pct === null) {
    return pending > 0
      ? { pct: null, provisional: true, text: `nog na te kijken (${vragen})`, aria: `nog na te kijken (${vragen})` }
      : { pct: null, provisional: false, text: 'geen punten', aria: 'geen punten' };
  }
  if (pending > 0) {
    return {
      pct,
      provisional: true,
      text: `${g.earned}/${g.max} · ${pct}% (voorlopig)`,
      aria: `${pct} procent, voorlopig (${g.earned} van ${g.max} punten, nog ${vragen} na te kijken)`,
    };
  }
  return { pct, provisional: false, text: `${g.earned}/${g.max} · ${pct}%`, aria: `${pct} procent (${g.earned} van ${g.max} punten)` };
}

// ── Csv van de klas ─────────────────────────────────────────────────────────

/** Excel (nl-BE) leest een csv zonder dit teken niet als UTF-8. */
export const CSV_BOM = '﻿';

/** Getal voor een csv met `;`: komma als decimaalteken, hoogstens twee decimalen. */
function csvNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Statuscel: de toestand, met "voorlopig" of "nog na te kijken" erbij als dat geldt. */
function csvState(st: AssignmentStatus): string {
  if (st.provisional) return `${st.state} (voorlopig)`;
  if (st.needsGrading) return `${st.state} (nog na te kijken)`;
  return st.state;
}

/**
 * Het csv-bestand van het klasoverzicht, met BOM vooraan. Per opdracht vier
 * kolommen: status, punten, maximum en percentage. Punten en maximum staan
 * apart en als getal: "7/10" leest Excel als een datum. Een cursus heeft geen
 * punten; haar percentage is de leesvoortgang.
 */
export function klasCsv(
  students: ClassStudent[],
  assignments: Assignment[],
  titleOf: (a: Assignment) => string,
  statusOf: (s: ClassStudent, a: Assignment) => AssignmentStatus | undefined,
): string {
  const head = [
    'nummer',
    'naam',
    ...assignments.flatMap((a) => {
      const t = titleOf(a);
      return [`${t} — status`, `${t} — punten`, `${t} — maximum`, `${t} — % (score of gelezen)`];
    }),
  ];
  const lines = [head.map(csvCell).join(';')];
  for (const s of students) {
    const cells: (string | number)[] = [s.number ?? '', s.name];
    for (const a of assignments) {
      const st = statusOf(s, a);
      if (!st || st.state === 'niet gestart') {
        cells.push('niet gestart', '', '', '');
        continue;
      }
      const punten = st.progressPct === null && st.earned !== null && st.max !== null;
      const pct = st.progressPct !== null ? st.progressPct : st.scorePct;
      cells.push(
        csvState(st),
        punten ? csvNumber(st.earned as number) : '',
        punten ? csvNumber(st.max as number) : '',
        pct !== null ? csvNumber(pct) : '',
      );
    }
    lines.push(cells.map(csvCell).join(';'));
  }
  return CSV_BOM + lines.join('\n');
}

// ── Datum voor een <input type="date"> ──────────────────────────────────────

/** Timestamp naar lokale JJJJ-MM-DD voor <input type="date"> — geen UTC-afkapping. */
export function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
