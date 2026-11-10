// ── Oefeningen afleiden uit ingelezen cursusmateriaal (zonder AI) ───────────
//
// Bestaand cursusmateriaal draagt al oefenstof in zich: een begrippenlijst
// (term + uitleg), vetgedrukte kernbegrippen in de lopende tekst en de
// kadertjes "Oefening:"/"Opdracht:". Daar maken we, deterministisch en dus
// controleerbaar, echte widgets van:
//
// - per sectie een invuloefening (gap) uit de zinnen met een vet begrip;
// - per hoofdstuk, bij de begrippenlijst: een begrippenquiz (meerkeuze: welke
//   term hoort bij deze omschrijving?) en een koppelspel term ↔ uitleg;
// - per hoofdstuk een werkblad met alle opdrachten uit de kadertjes als open
//   vragen (door de leerkracht nagekeken), in een eigen sectie "Oefeningen".
//
// De rijkere vragen (inzicht, toepassing) blijven voor de AI-stap; dit is de
// bodem die elke import meteen krijgt.

import type { Course, CourseBlock, CourseChapter, CourseSection } from './courseTypes';
import type { GapQuestion, LongQuestion, MCQuestion, MatchQuestion, PairsConfig, Question, QuizConfig, Widget, WorksheetConfig } from './types';
import { makeCode, uid } from './utils';
import { defaultSettings } from '../widgets/registry';

export interface DeriveOptions {
  /** Leerplan dat op de widgets komt (goalCode-lookup). */
  curriculumId?: string;
  /** Nu-tijd, voor tests. */
  now?: number;
}

export interface DeriveResult {
  course: Course;
  widgets: Widget[];
  /** Wat er afgeleid is, voor de melding aan de leerkracht. */
  counts: { gap: number; quiz: number; pairs: number; worksheet: number };
}

const OPEN_LABEL_RE = /^(oefening|opdracht|opgave|taak|doe-opdracht)/i;

/** Sectie "Kernbegrippen" e.d. (zelfde lijst als de importeur). */
const TERMS_TITLE_RE = /^(kern|sleutel)?begrippen(lijst|kader)?$|^woordenlijst$/i;

function short(chapterTitle: string): string {
  return chapterTitle.replace(/^Hoofdstuk \d+[ab]?:\s*/i, '').trim() || chapterTitle;
}

function widgetOf<T>(type: Widget['type'], title: string, config: T, opts: DeriveOptions): Widget<T> {
  const now = opts.now ?? Date.now();
  return {
    id: uid(), type, title, folderId: null, config,
    settings: defaultSettings(), code: makeCode(),
    createdAt: now, updatedAt: now,
    ...(opts.curriculumId ? { curriculumId: opts.curriculumId } : {}),
  };
}

function widgetBlock(widgetId: string, note: string): CourseBlock {
  return { id: uid(), type: 'widget', widgetId, note };
}

/** Deterministisch "willekeurig" (zaad op tekst), zodat een herbouw dezelfde afleiders geeft. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Invuloefening uit vette begrippen ───────────────────────────────────────

/**
 * Een regel in zinnen knippen: na ".", "!" of "?" en witruimte, vóór een hoofdletter, aanhalingsteken of
 * haakje. Het leesteken blijft bij de zin ervoor. Zonder lookbehind (Safari en iPadOS vóór 16.4 laden
 * dat niet): `split` met het leesteken als groep, en dat leesteken daarna terug aan zijn zin vast.
 */
export function splitSentences(line: string): string[] {
  const parts = line.split(/([.!?])\s+(?=[A-ZÀ-Þ"“(])/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) out.push(parts[i] + (parts[i + 1] ?? ''));
  return out;
}

/**
 * Zinnen met precies één vet begrip (2–30 tekens, geen cijfers) worden een
 * gat: "De zon verwarmt het **water**." → "De zon verwarmt het [water]."
 * Hoogstens `max` gaten per sectie, geen twee gaten met hetzelfde antwoord.
 */
export function gapSentences(markdown: string, max = 6): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  // Per regel (alinea of lijstitem) in zinnen knippen: een lijstitem is nooit
  // het vervolg van de zin ervoor.
  const units = markdown.split(/\n+/).map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    .flatMap(splitSentences);
  for (const raw of units) {
    const sentence = raw.trim();
    if (sentence.length < 40 || sentence.length > 200) continue;
    const bolds = [...sentence.matchAll(/\*\*([^*]{2,30}?)\*\*/g)].map((m) => m[1].trim());
    if (bolds.length !== 1) continue;
    const term = bolds[0];
    // Een begrip is één of twee woorden; een vetgedrukte zinsnede ("altijd met
    // een plant") is nadruk, geen invulantwoord.
    if (/\d|[[\]{}|(),;]/.test(term) || term.length > 22 || term.split(/\s+/).length > 2 || used.has(term.toLowerCase())) continue;
    if (/^\d+[.)]\s/.test(sentence)) continue; // genummerde stap: hoort bij een reeks
    if (sentence.startsWith('**')) continue; // "**Term** uitleg" is een definitie, geen zin
    const plain = sentence.replace(/\*\*([^*]+?)\*\*/, '[$1]').replace(/[*_]/g, '');
    if (/:$/.test(plain)) continue; // aanloop naar een lijst, geen zin
    used.add(term.toLowerCase());
    out.push(plain);
    if (out.length >= max) break;
  }
  return out;
}

function gapWidget(section: CourseSection, chapter: CourseChapter, opts: DeriveOptions): Widget | null {
  const md = section.blocks.filter((b): b is Extract<CourseBlock, { type: 'text' }> => b.type === 'text').map((b) => b.markdown).join('\n\n');
  const sentences = gapSentences(md);
  if (sentences.length < 2) return null;
  const goalCode = section.goalCodes?.[0];
  const questions: GapQuestion[] = sentences.map((text) => ({
    id: uid(), type: 'gap', prompt: 'Vul het ontbrekende begrip in.', points: 1, text,
    ...(goalCode ? { goalCode } : {}),
  }));
  const config: WorksheetConfig = { questions, layout: 'scroll' };
  return widgetOf('worksheet', `Invuloefening — ${section.title}`, config, opts);
}

// ── Begrippenquiz en koppelspel uit een termenblok ──────────────────────────

type TermItem = { term: string; uitleg: string };

function termsOf(chapter: CourseChapter): TermItem[] {
  const items: TermItem[] = [];
  for (const sec of chapter.sections) {
    for (const b of sec.blocks) {
      if (b.type === 'terms') for (const it of b.items) if (it.term.trim() && it.uitleg.trim()) items.push({ term: it.term.trim(), uitleg: it.uitleg.trim() });
    }
  }
  // Zelfde term twee keer (bv. in twee begrippenlijsten): de eerste telt.
  const seen = new Set<string>();
  return items.filter((it) => { const k = it.term.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return (cut.lastIndexOf(' ') > n * 0.6 ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '…';
}

/** De term zelf (en zijn stam) uit de omschrijving maskeren, anders verklapt de vraag het antwoord. */
export function maskTerm(uitleg: string, term: string): string {
  const stem = term.replace(/\s*\(.*\)\s*$/, '').trim();
  const words = stem.split(/\s+/).filter((w) => w.length >= 4);
  let out = uitleg;
  for (const w of [stem, ...words]) {
    const root = w.length > 6 ? w.slice(0, -2) : w; // "massadichtheid" → ook "massadichtheden"
    const re = new RegExp(`\\b${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-zà-ÿ]*`, 'gi');
    out = out.replace(re, '…');
  }
  return out.replace(/(…\s*){2,}/g, '… ');
}

/** Meerkeuze: welke term hoort bij deze omschrijving? Drie afleiders uit dezelfde lijst. */
export function termsQuiz(terms: TermItem[], seed: string, goalCode?: string): MCQuestion[] {
  if (terms.length < 4) return [];
  const rnd = seeded(seed);
  const questions: MCQuestion[] = [];
  for (const it of shuffle(terms, rnd).slice(0, 10)) {
    const others = shuffle(terms.filter((o) => o.term !== it.term), rnd).slice(0, 3).map((o) => o.term);
    const options = shuffle([it.term, ...others], rnd);
    questions.push({
      id: uid(), type: 'mc', prompt: `Welk begrip hoort bij deze omschrijving?\n\n*${clip(maskTerm(it.uitleg, it.term), 220)}*`,
      points: 1, options, correctIndex: options.indexOf(it.term),
      explanation: `${it.term}: ${clip(it.uitleg, 160)}`,
      ...(goalCode ? { goalCode } : {}),
    });
  }
  return questions;
}

function termsQuizWidget(chapter: CourseChapter, terms: TermItem[], goalCode: string | undefined, opts: DeriveOptions): Widget | null {
  const questions = termsQuiz(terms, chapter.title, goalCode);
  if (questions.length < 4) return null;
  const match: MatchQuestion | null = terms.length >= 4 ? {
    id: uid(), type: 'match', prompt: 'Koppel elk begrip aan de juiste omschrijving.', points: 2,
    pairs: shuffle(terms, seeded(chapter.title + '|match')).slice(0, 6).map((t) => ({ left: t.term, right: clip(t.uitleg, 90) })),
    ...(goalCode ? { goalCode } : {}),
  } : null;
  const config: QuizConfig = { questions: [...questions, ...(match ? [match] : [])] as Question[], layout: 'single', stepCheck: true };
  return widgetOf('quiz', `Begrippenquiz — ${short(chapter.title)}`, config, opts);
}

function pairsWidget(chapter: CourseChapter, terms: TermItem[], opts: DeriveOptions): Widget | null {
  if (terms.length < 4) return null;
  const chosen = shuffle(terms, seeded(chapter.title + '|pairs')).slice(0, 8);
  const config: PairsConfig = { pairs: chosen.map((t) => ({ id: uid(), left: t.term, right: clip(t.uitleg, 70) })) };
  return widgetOf('pairs', `Koppelspel — ${short(chapter.title)}`, config, opts);
}

// ── Werkblad uit de opdrachtkadertjes ───────────────────────────────────────

function worksheetWidget(chapter: CourseChapter, opts: DeriveOptions): Widget | null {
  const questions: Question[] = [];
  for (const sec of chapter.sections) {
    let headed = false;
    for (const b of sec.blocks) {
      if (b.type !== 'callout' || b.kind !== 'goal' || !OPEN_LABEL_RE.test(b.title ?? '') || !b.text.trim()) continue;
      if (!headed) {
        questions.push({ id: uid(), type: 'info', prompt: `**${sec.title}**`, points: 0 });
        headed = true;
      }
      const goalCode = sec.goalCodes?.[0];
      const q: LongQuestion = {
        id: uid(), type: 'long', prompt: b.text.trim(), points: 2, allowDraw: true,
        ...(goalCode ? { goalCode } : {}),
      };
      questions.push(q);
    }
  }
  if (questions.filter((q) => q.type === 'long').length < 2) return null;
  const config: WorksheetConfig = { questions, layout: 'scroll' };
  return widgetOf('worksheet', `Opdrachten — ${short(chapter.title)}`, config, opts);
}

// ── Alles samen ─────────────────────────────────────────────────────────────

/**
 * Leidt oefeningen af en zet ze als widgetblokken in de cursus. Geeft de
 * (nieuwe) cursus en de widgets terug; de aanroeper bewaart beide.
 */
export function deriveExercises(course: Course, opts: DeriveOptions = {}): DeriveResult {
  const widgets: Widget[] = [];
  const counts = { gap: 0, quiz: 0, pairs: 0, worksheet: 0 };
  const chapters: CourseChapter[] = course.chapters.map((chapter) => {
    const sections: CourseSection[] = chapter.sections.map((sec) => {
      if (TERMS_TITLE_RE.test(sec.title.trim())) return sec;
      const w = gapWidget(sec, chapter, opts);
      if (!w) return sec;
      widgets.push(w);
      counts.gap++;
      return { ...sec, blocks: [...sec.blocks, widgetBlock(w.id, 'Check jezelf: vul de kernbegrippen van deze sectie in.')] };
    });

    const terms = termsOf(chapter);
    const termsSection = sections.find((s) => TERMS_TITLE_RE.test(s.title.trim()));
    const goalCode = termsSection?.goalCodes?.[0] ?? sections[0]?.goalCodes?.[0];
    const extra: CourseBlock[] = [];
    const quiz = termsQuizWidget(chapter, terms, goalCode, opts);
    if (quiz) { widgets.push(quiz); counts.quiz++; extra.push(widgetBlock(quiz.id, 'Begrippenquiz: welk begrip hoort bij welke omschrijving? Met een tweede kans na een hint.')); }
    const pairs = pairsWidget(chapter, terms, opts);
    if (pairs) { widgets.push(pairs); counts.pairs++; extra.push(widgetBlock(pairs.id, 'Koppelspel: zoek bij elk begrip de juiste omschrijving.')); }
    const ws = worksheetWidget(chapter, opts);
    if (ws) { widgets.push(ws); counts.worksheet++; extra.push(widgetBlock(ws.id, 'Werkblad met alle opdrachten uit dit hoofdstuk. Je leerkracht kijkt je antwoorden na.')); }

    if (extra.length === 0) return { ...chapter, sections };
    const oefeningen: CourseSection = {
      id: uid(), title: 'Oefeningen', goalCodes: termsSection?.goalCodes ?? [],
      blocks: [
        { id: uid(), type: 'callout', kind: 'goal', title: 'Zo oefen je dit hoofdstuk', text: 'Eerst de begrippen (quiz en koppelspel), dan de opdrachten op het werkblad. De invuloefeningen staan onderaan elke sectie.' },
        ...extra,
      ],
    };
    return { ...chapter, sections: [...sections, oefeningen] };
  });
  return { course: { ...course, chapters }, widgets, counts };
}

/** Korte melding voor de leerkracht. */
export function describeDerived(c: DeriveResult['counts']): string {
  const parts: string[] = [];
  if (c.quiz) parts.push(`${c.quiz} begrippenquiz${c.quiz === 1 ? '' : 'zen'}`);
  if (c.pairs) parts.push(`${c.pairs} koppelspel${c.pairs === 1 ? '' : 'len'}`);
  if (c.gap) parts.push(`${c.gap} invuloefening${c.gap === 1 ? '' : 'en'}`);
  if (c.worksheet) parts.push(`${c.worksheet} werkblad${c.worksheet === 1 ? '' : 'en'} met opdrachten`);
  return parts.length ? `oefeningen afgeleid: ${parts.join(', ')}` : 'geen oefeningen af te leiden';
}
