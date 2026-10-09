// ── AI-cursusbouwer: prompts + sanering ─────────────────────────────────────
//
// Drie taken: (1) een nieuwe cursus opbouwen vanuit bronmateriaal (cursustekst,
// pdf) en/of leerplandoelen, (2) een bestaande cursus herwerken, (3) één sectie
// vullen.
// De AI mag ALLEEN tekstuele blokken maken — nooit media-URL's verzinnen.
// Bij herwerken reizen mediablokken mee als {"type":"keep","id":…} zodat ze
// ongewijzigd op hun (nieuwe) plek terugkomen.

import type { Widget } from './types';
import type { Course, CourseBlock, CourseChapter, CourseSection } from './courseTypes';
import type { CurriculumGoal } from './curriculumTypes';
import { normalizeGoalCode, normalizeGoalCodes } from './curriculum';
import { sanitizeCourse } from './courses';
import { quizSchemaText, sanitizeGeneratedWidgets } from './aiWidgetGen';
import { makeCode, uid } from './utils';

// ── Gedeelde schema-teksten ─────────────────────────────────────────────────

const BLOCK_SCHEMA = `Een "blok" is een JSON-object met "type" en velden. TOEGELATEN types (en géén andere — dus nooit image/video/audio/embed/attachment/widget; media voegt de leerkracht zelf toe):
- {"type":"heading","text":"…","level":2} (2 = tussenkop, 3 = kleiner)
- {"type":"text","markdown":"lopende tekst; opmaak: **vet**, *cursief*, - lijstjes, ## kopjes"}
- {"type":"callout","kind":"info"|"tip"|"warn"|"goal","title":"…","text":"…"}
- {"type":"quote","text":"…","source":"…"}
- {"type":"divider"}
- {"type":"accordion","items":[{"title":"…","text":"…"}]} — uitklapbare onderdelen (bv. "controleer jezelf")
- {"type":"columns","left":"markdown","right":"markdown"}
- {"type":"table","header":true,"rows":[["kop A","kop B"],["cel","cel"]]}
- {"type":"terms","items":[{"term":"…","uitleg":"…"}]} — begrippenlijst
- {"type":"checklist","title":"…","items":["afvinkbaar item",…]} — de leerling vinkt af`;

const COURSE_SYSTEM = `Je bent een ervaren Vlaamse leerkracht en leermiddelenauteur die digitale cursussen bouwt voor Boosterz.
Didactische eisen:
- Elke sectie begint met een callout van kind "goal" die in leerlingtaal zegt wat je er leert.
- Wissel leerstof (text/table/terms) af met verwerking (checklist, accordion met controlevragen).
- Sluit elk hoofdstuk af met een korte samenvattingssectie.
- Vul per sectie "goals" in: de leerplandoelen (of deeldoelen) waaraan de sectie werkt, kort geformuleerd.
- Markeer verdiepings- of keuzeleerstof met "optional": true.
- Helder Nederlands (Vlaanderen), afgestemd op de doelgroep; leg schooltaalwoorden uit in een terms-blok.
- Verzin geen feiten waar je niet zeker van bent; blijf bij algemeen aanvaarde leerstof.
Antwoord met ALLEEN geldige JSON, zonder uitleg of markdown-hekken.`;

// ── Prompts ─────────────────────────────────────────────────────────────────

/** Meer bron dan dit gaat niet mee: houdt de prompt binnen het contextvenster. */
export const MAX_SOURCE_CHARS = 60000;

/** Doelenlijst voor in een prompt: "WIS 2.3 — De leerlingen … (Getallenleer, uitbreiding)". */
export function goalListText(goals: CurriculumGoal[]): string {
  return goals
    .map((g) => {
      const extra = [g.theme?.trim(), g.level === 'uitbreiding' ? 'uitbreiding' : ''].filter(Boolean).join(' · ');
      return `- ${normalizeGoalCode(g.code)} — ${g.text.trim()}${extra ? ` (${extra})` : ''}`;
    })
    .join('\n');
}

/** Het regeltje dat in élke leerplanprompt terugkomt. */
function goalCodeRules(goals: CurriculumGoal[]): string {
  const codes = goals.map((g) => normalizeGoalCode(g.code));
  return `Elke sectie krijgt een veld "goalCodes": een lijst met de codes van de leerplandoelen waaraan die sectie werkt.
- Gebruik UITSLUITEND codes uit de lijst hierboven, exact zoals ze er staan (${codes.slice(0, 6).join(', ')}${codes.length > 6 ? ', …' : ''}).
- Samen moeten de secties ALLE ${codes.length} doelen dekken: geen enkel doel mag overblijven. Een doel mag in meerdere secties terugkomen.
- Zet een doel nooit alleen in een sectie met "optional": true — verdieping ziet niet elke leerling.
- Vul daarnaast ook "goals" in: dezelfde doelen in leerlingtaal ("Ik kan …").`;
}

export interface NewCourseRequest {
  /** Leerplandoelen (vrije tekst). Verplicht als er geen bronmateriaal is. */
  goals: string;
  /** Gekozen leerplandoelen mét code — het skelet van een "blanco vanuit leerplan". */
  curriculumGoals?: CurriculumGoal[];
  /** Voorgestelde titel (bv. uit de importpagina). */
  title?: string;
  /** Eigen cursustekst of pdf-tekst: de AI blijft er inhoudelijk strikt bij. */
  sourceText?: string;
  audience?: string;
  subject?: string;
  extraWishes?: string;
  /** 0 = AI kiest. */
  chapterCount?: number;
  /** Per hoofdstuk ook een oefenquiz (als aparte widgets). */
  withQuizzes?: boolean;
}

export function buildNewCoursePrompt(req: NewCourseRequest): { system: string; prompt: string } {
  const parts: string[] = [];
  parts.push('Bouw een volledige digitale cursus.');
  if (req.title?.trim()) parts.push(`Voorgestelde titel (mag je verfijnen): ${req.title.trim()}`);
  if (req.subject?.trim()) parts.push(`Vak/onderwerp: ${req.subject.trim()}`);
  if (req.audience?.trim()) parts.push(`Doelgroep: ${req.audience.trim()}`);
  if (req.chapterCount && req.chapterCount > 0) parts.push(`Richtaantal hoofdstukken: ${req.chapterCount}.`);
  if (req.extraWishes?.trim()) parts.push(`Extra wensen van de leerkracht: ${req.extraWishes.trim()}`);
  const source = (req.sourceText ?? '').trim();
  const goals = req.goals.trim();
  const curGoals = req.curriculumGoals ?? [];
  if (curGoals.length) {
    parts.push(
      `\nDeze LEERPLANDOELEN (met hun officiële code) vormen het skelet van de cursus:\n${goalListText(curGoals)}\n\n${goalCodeRules(curGoals)}`
    );
  }
  if (goals) {
    parts.push(`\nDeze LEERPLANDOELEN vormen het skelet van de cursus — dek ze allemaal en verwijs ernaar in de "goals" van de secties:\n${goals}`);
  }
  if (source) {
    parts.push(
      `\nBRONMATERIAAL van de leerkracht. Bouw de cursus hieruit op: volg de opbouw van het materiaal voor de hoofdstukken en secties, herschrijf in leerlingtaal, laat niets essentieels weg en voeg géén leerstof toe die er niet in staat.`
      + (goals ? '' : ' Leid per sectie zelf de "goals" af: korte doelzinnen in leerlingtaal ("Ik kan …").')
      + `\n<<<BRON\n${source.slice(0, MAX_SOURCE_CHARS)}\nBRON>>>`
    );
  }
  parts.push(`\n${BLOCK_SCHEMA}`);

  if (curGoals.length) {
    parts.push('Sluit ELK hoofdstuk af met een korte samenvattingssectie ("Samenvatting van dit hoofdstuk") die de kern in enkele zinnen of een lijstje herhaalt.');
  }

  // "goalCodes" alleen vragen als er codes zijn om uit te kiezen: zonder
  // leerplan gaf de AI anders de plaatshouder "…" terug als code.
  const goalCodesField = curGoals.length ? '"goalCodes":["…"],' : '';
  let envelope = `Geef terug: {"course":{"title":"…","subtitle":"…","coverEmoji":"één emoji","chapters":[{"title":"…","emoji":"…","sections":[{"title":"…","goals":["…"],${goalCodesField}"optional":false,"blocks":[blok,…]}]}]}}`;
  if (req.withQuizzes) {
    envelope = envelope.slice(0, -1) + `,"widgets":[{"type":"quiz","title":"…","config":{…}}]}
Maak per hoofdstuk één oefenquiz van 4 à 6 vragen over dat hoofdstuk, in dezelfde volgorde als de hoofdstukken.
${quizSchemaText({ goalCode: curGoals.length > 0 })}`;
    if (curGoals.length) {
      envelope += `\nGeef elke vraag ook een "goalCode": de code van het leerplandoel dat ze toetst, uit dezelfde lijst.`;
    }
  }
  parts.push(`\n${envelope}`);
  return { system: COURSE_SYSTEM, prompt: parts.join('\n\n') };
}

/** Blokken die de leerkracht zelf toevoegt: de AI mag ze alleen terugzetten (keep), nooit zelf maken. */
const MEDIA_BLOCK_TYPES = new Set(['image', 'video', 'audio', 'pdf', 'embed', 'attachment', 'widget']);

/**
 * De enige bloktypes die de AI zelf mag maken (zie BLOCK_SCHEMA). Bewust een
 * toelatingslijst: een nieuw mediatype in courseTypes glipt zo niet ongemerkt
 * door de sanering van een AI-antwoord.
 */
const AI_TEXT_BLOCK_TYPES = new Set([
  'heading', 'text', 'callout', 'quote', 'divider', 'accordion', 'columns', 'table', 'terms', 'checklist',
]);

const AI_MEDIA_DROPPED = 'Een mediablok van de AI is weggelaten.';

/**
 * Houdt alleen de tekstuele blokken uit een AI-antwoord over. Een mediablok
 * (afbeelding, embed, bijlage, oefening …) dat de AI zelf maakte, valt weg met
 * een waarschuwing: de AI zou er een URL, data-URL of widget-id voor moeten
 * verzinnen. Andere onbekende types laat sanitizeCourse sowieso al vallen.
 */
function keepAITextBlocks(blocks: unknown[], warnings: string[]): unknown[] {
  return blocks.filter((b) => {
    if (!b || typeof b !== 'object') return false;
    const type = (b as Record<string, unknown>).type;
    if (typeof type === 'string' && AI_TEXT_BLOCK_TYPES.has(type)) return true;
    if (typeof type === 'string' && MEDIA_BLOCK_TYPES.has(type)) warnings.push(AI_MEDIA_DROPPED);
    return false;
  });
}

/**
 * Eén blok compact voor in een herwerk-prompt: mediablokken worden een
 * "keep"-verwijzing. Tekst gaat VOLLEDIG mee: de prompt vraagt het volledige
 * hoofdstuk terug, dus wat hier afgeknipt wordt, is na "Toepassen" weg.
 */
function compactBlock(b: CourseBlock): Record<string, unknown> {
  if (MEDIA_BLOCK_TYPES.has(b.type)) return { type: 'keep', id: b.id, was: b.type };
  switch (b.type) {
    case 'heading': return { type: 'heading', text: b.text, level: b.level };
    case 'text': return { type: 'text', markdown: b.markdown };
    case 'callout': return { type: 'callout', kind: b.kind, title: b.title, text: b.text };
    case 'quote': return { type: 'quote', text: b.text, source: b.source };
    case 'divider': return { type: 'divider' };
    case 'accordion': return { type: 'accordion', items: b.items.map((i) => ({ title: i.title, text: i.text })) };
    case 'columns': return { type: 'columns', left: b.left, right: b.right };
    case 'table': return { type: 'table', header: b.header, rows: b.rows };
    case 'terms': return { type: 'terms', items: b.items.map((i) => ({ term: i.term, uitleg: i.uitleg })) };
    case 'checklist': return { type: 'checklist', title: b.title, items: b.items.map((i) => i.text) };
    default: return { type: 'keep', id: (b as CourseBlock).id };
  }
}

/** Eén hoofdstuk compact voor in een herwerk-prompt (zonder data-URLs). */
function compactChapter(chapter: CourseChapter): Record<string, unknown> {
  return {
    title: chapter.title,
    emoji: chapter.emoji,
    sections: chapter.sections.map((se) => ({
      id: se.id,
      title: se.title,
      goals: se.goals,
      goalCodes: se.goalCodes,
      optional: se.optional || undefined,
      blocks: se.blocks.map(compactBlock),
    })),
  };
}

/** Compacte JSON-weergave van een cursus voor herwerk-prompts (zonder data-URLs). */
function compactCourse(course: Course): string {
  return JSON.stringify({
    title: course.title,
    subtitle: course.subtitle,
    chapters: course.chapters.map(compactChapter),
  });
}

/**
 * Lengte (in tekens) van de cursus zoals ze in een herwerk-prompt gaat. De AI
 * moet ongeveer evenveel tekst terugschrijven, dus dit bepaalt of herwerken in
 * één antwoord past (zie CourseAIModal).
 */
export function compactCourseLength(course: Course): number {
  return compactCourse(course).length;
}

export function buildReworkPrompt({
  course, wishes, extraRules, goalContext,
}: {
  course: Course;
  wishes: string;
  /** Extra opdrachtregels (bv. de gekozen optimalisaties). */
  extraRules?: string;
  /** Leerplancontext: de doelenlijst waaraan de cursus gekoppeld is. */
  goalContext?: string;
}): { system: string; prompt: string } {
  const prompt = `Herwerk de onderstaande bestaande cursus.

Wat de leerkracht anders wil: ${wishes.trim() || 'verbeter de structuur en de didactische kwaliteit.'}
${extraRules?.trim() ? `
${extraRules.trim()}
` : ''}
BELANGRIJKE regels:
- Behoud het "id" van secties waarvan de inhoud in essentie dezelfde blijft (zo blijft de leesvoortgang van leerlingen geldig). Nieuwe of sterk veranderde secties krijgen géén id.
- Blokken van het type {"type":"keep","id":"…"} zijn mediablokken (afbeeldingen, video's, oefeningen) die je NIET mag wijzigen of weglaten: zet exact datzelfde keep-blok op de best passende plek terug.
- Behoud de "goalCodes" die al op een sectie staan; voeg er enkel codes uit de leerplanlijst aan toe.
- Geef de VOLLEDIGE herwerkte cursus terug, niet alleen de wijzigingen.
${goalContext?.trim() ? `
${goalContext.trim()}
` : ''}
${BLOCK_SCHEMA}

Geef terug: {"course":{"title":"…","subtitle":"…","coverEmoji":"…","chapters":[{"title":"…","emoji":"…","sections":[{"id":"(alleen bij behouden secties)","title":"…","goals":["…"],"goalCodes":["…"],"optional":false,"blocks":[blok,…]}]}]}}

=== HUIDIGE CURSUS (compact) ===
${compactCourse(course)}`;
  return { system: COURSE_SYSTEM, prompt };
}

// ── Optimaliseren: presets die je combineert met eigen wensen ───────────────

export type OptimizePreset = 'taal' | 'differentiatie' | 'controlevragen' | 'hiaten';

export const OPTIMIZE_PRESETS: { id: OptimizePreset; label: string; hint: string }[] = [
  {
    id: 'taal',
    label: 'Vereenvoudig de taal',
    hint: 'Leerlingtaal, korte zinnen, schooltaalwoorden uitgelegd in een begrippenlijst.',
  },
  {
    id: 'differentiatie',
    label: 'Differentieer',
    hint: 'Per sectie een basisdeel; verdieping komt als aparte keuzesectie erachter.',
  },
  {
    id: 'controlevragen',
    label: 'Voeg controlevragen toe',
    hint: 'Per sectie een accordion “Check jezelf” en een afvinklijst.',
  },
  {
    id: 'hiaten',
    label: 'Vul de hiaten t.o.v. het leerplan',
    hint: 'Nieuwe secties voor de doelen die nog nergens aan bod komen; bestaande secties blijven ongemoeid.',
  },
];

const PRESET_RULES: Record<OptimizePreset, string> = {
  taal: '- TAAL: herschrijf alle lopende tekst in leerlingtaal: korte zinnen (max ±15 woorden), actieve vorm, één idee per zin. Elk schooltaal- of vakwoord dat je gebruikt, staat uitgelegd in een "terms"-blok in diezelfde sectie. Laat geen leerstof weg.',
  differentiatie: '- DIFFERENTIATIE: geef elke sectie een duidelijk basisdeel dat iedereen aankan. Wat verdieping is, zet je in een APARTE sectie met "optional": true, met een titel die begint met "Verdieping —", meteen na de basissectie. Herhaal in de verdiepingssectie dezelfde "goalCodes" als de basissectie.',
  controlevragen: '- CONTROLEVRAGEN: sluit elke sectie af met (1) een accordion-blok met de titel "Check jezelf" waarin elk item een vraag is en de tekst het antwoord, en (2) een checklist-blok "Ik kan nu…" met de doelen van die sectie in leerlingtaal.',
  hiaten: '- HIATEN: laat bestaande secties en hun inhoud ONGEMOEID (zelfde id, zelfde blokken, zelfde goalCodes) en voeg enkel NIEUWE secties toe voor de niet-gedekte doelen hieronder. Zet elke nieuwe sectie in het best passende hoofdstuk (of maak één nieuw hoofdstuk achteraan), geef ze géén id, en vul hun "goalCodes" met exact de codes van de doelen die ze dekken.',
};

export interface OptimizeRequest {
  course: Course;
  presets: OptimizePreset[];
  /** Vrije wensen van de leerkracht (mag leeg zijn als er presets zijn). */
  wishes: string;
  /** Doelen die nog niet gedekt zijn (nodig voor de preset 'hiaten'). */
  uncovered?: CurriculumGoal[];
  /** Alle doelen van het gekoppelde leerplan, als context. */
  curriculumGoals?: CurriculumGoal[];
}

export function buildOptimizePrompt(req: OptimizeRequest): { system: string; prompt: string } {
  const rules = req.presets.map((p) => PRESET_RULES[p]).filter(Boolean);
  const wants = req.presets
    .map((p) => OPTIMIZE_PRESETS.find((x) => x.id === p)?.label.toLowerCase())
    .filter(Boolean)
    .join(', ');
  const wishes = [wants ? `optimaliseer de cursus: ${wants}` : '', req.wishes.trim()]
    .filter(Boolean)
    .join('. ');
  const parts: string[] = [];
  if (rules.length) parts.push(`Voer deze optimalisaties uit:\n${rules.join('\n')}`);
  const uncovered = req.uncovered ?? [];
  if (req.presets.includes('hiaten')) {
    parts.push(
      uncovered.length
        ? `Deze leerplandoelen komen nog NIET aan bod in een gewone (niet-optionele) sectie — maak er nieuwe secties voor:\n${goalListText(uncovered)}`
        : 'Alle leerplandoelen zijn al gedekt: voeg dan géén secties toe en meld dat door de cursus ongewijzigd terug te geven.'
    );
  }
  const all = req.curriculumGoals ?? [];
  const goalContext = all.length
    ? `LEERPLAN waaraan deze cursus gekoppeld is — gebruik in "goalCodes" uitsluitend codes uit deze lijst:\n${goalListText(all)}`
    : '';
  return buildReworkPrompt({
    course: req.course,
    wishes: wishes || 'verbeter de didactische kwaliteit',
    extraRules: parts.join('\n\n'),
    goalContext,
  });
}

// ── Optimaliseren, per hoofdstuk ────────────────────────────────────────────
//
// "Vereenvoudig de taal" en "Voeg controlevragen toe" op de HELE cursus in
// één aanroep leverde bij een cursus van een paar hoofdstukken al een
// afgekapt (onvolledig) AI-antwoord op. Deze presets werken sectie voor
// sectie op wat er al staat, dus hoeven geen coursebreed overzicht: één
// aanroep per hoofdstuk (elders met hoogstens 2 tegelijk gestart) houdt elk
// antwoord klein genoeg.
//
// De preset "hiaten" blijft bewust ÉÉN aanroep voor de hele cursus (zie
// buildOptimizePrompt hierboven): ze moet per doel kiezen in welk bestaand
// hoofdstuk een nieuwe sectie het best past en mag hetzelfde doel niet in
// meerdere hoofdstukken tegelijk dekken — dat vraagt net het overzicht over
// alle hoofdstukken dat per-hoofdstuk-aanroepen niet hebben.

export interface OptimizeChapterRequest {
  /** Volledige cursus, voor context (titel) — enkel `chapter` wordt herwerkt. */
  course: Course;
  chapter: CourseChapter;
  /** 1-gebaseerd, voor "hoofdstuk X van Y" in de prompt. */
  chapterIndex: number;
  chapterCount: number;
  /** Presets zonder 'hiaten' — die blijft coursebreed (zie buildOptimizePrompt). */
  presets: Exclude<OptimizePreset, 'hiaten'>[];
  wishes: string;
  /** Alle doelen van het gekoppelde leerplan, als context voor "goalCodes". */
  curriculumGoals?: CurriculumGoal[];
}

export function buildOptimizeChapterPrompt(req: OptimizeChapterRequest): { system: string; prompt: string } {
  const rules = req.presets.map((p) => PRESET_RULES[p]).filter(Boolean);
  const wants = req.presets
    .map((p) => OPTIMIZE_PRESETS.find((x) => x.id === p)?.label.toLowerCase())
    .filter(Boolean)
    .join(', ');
  const wishes = [wants ? `optimaliseer dit hoofdstuk: ${wants}` : '', req.wishes.trim()].filter(Boolean).join('. ');
  const goalContext = req.curriculumGoals?.length
    ? `\nLEERPLAN waaraan deze cursus gekoppeld is — gebruik in "goalCodes" uitsluitend codes uit deze lijst:\n${goalListText(req.curriculumGoals)}\n`
    : '';
  const prompt = `Herwerk ALLEEN hoofdstuk ${req.chapterIndex} van ${req.chapterCount} ("${req.chapter.title}") van de cursus "${req.course.title}". De andere hoofdstukken zie je niet en verander je niet.

Wat de leerkracht anders wil: ${wishes || 'verbeter de structuur en de didactische kwaliteit van dit hoofdstuk.'}
${rules.length ? `\n${rules.join('\n')}\n` : ''}
BELANGRIJKE regels:
- Behoud het "id" van secties waarvan de inhoud in essentie dezelfde blijft (zo blijft de leesvoortgang van leerlingen geldig). Nieuwe of sterk veranderde secties krijgen géén id.
- Blokken van het type {"type":"keep","id":"…"} zijn mediablokken (afbeeldingen, video's, oefeningen) die je NIET mag wijzigen of weglaten: zet exact datzelfde keep-blok op de best passende plek terug.
- Behoud de "goalCodes" die al op een sectie staan; voeg er enkel codes uit de leerplanlijst aan toe.
- Geef het VOLLEDIGE herwerkte hoofdstuk terug, niet alleen de wijzigingen.
${goalContext}
${BLOCK_SCHEMA}

Geef terug: {"chapter":{"title":"…","emoji":"…","sections":[{"id":"(alleen bij behouden secties)","title":"…","goals":["…"],"goalCodes":["…"],"optional":false,"blocks":[blok,…]}]}}

=== HOOFDSTUK (compact) ===
${JSON.stringify(compactChapter(req.chapter))}`;
  return { system: COURSE_SYSTEM, prompt };
}

export interface AIChapterResult {
  /** null als de AI geen bruikbare structuur teruggaf voor dit hoofdstuk. */
  chapter: CourseChapter | null;
  warnings: string[];
}

/**
 * {"chapter": {…}} van de AI → een geldig CourseChapter, met hetzelfde id als
 * het origineel (posities/leesvoortgang blijven zo geldig) en keep-blokken
 * teruggezet uit `opts.base`.
 */
export function sanitizeAIChapter(
  json: unknown,
  opts: { base: Course; chapterId: string; allowedGoalCodes?: string[] }
): AIChapterResult {
  const warnings: string[] = [];
  const envelope = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rawChapter = (envelope.chapter ?? json) as Record<string, unknown>;
  const wrapped = resolveKeepBlocks(
    { chapters: [rawChapter] }, opts.base, warnings, new Set([opts.chapterId])
  ) as Record<string, unknown>;
  const course = sanitizeCourse({ title: 'x', chapters: wrapped.chapters });
  const chapter = course?.chapters[0] ?? null;
  if (!chapter) {
    return { chapter: null, warnings: [...warnings, 'De AI gaf geen bruikbare structuur terug voor dit hoofdstuk. Probeer het opnieuw.'] };
  }
  chapter.id = opts.chapterId; // hoofdstuk blijft op zijn plaats, ook als de AI geen (geldig) id teruggaf
  filterSectionGoalCodes(chapter.sections, opts.allowedGoalCodes, warnings);
  return { chapter, warnings };
}

// ── Oefeningen voorstellen bij één sectie ───────────────────────────────────

/** De tekstuele inhoud van een sectie, voor in een prompt. */
export function sectionPlainText(section: CourseSection, maxChars = 6000): string {
  const out: string[] = [];
  for (const b of section.blocks) {
    switch (b.type) {
      case 'heading': out.push(`## ${b.text}`); break;
      case 'text': out.push(b.markdown); break;
      case 'callout': out.push(`${b.title ? `${b.title}: ` : ''}${b.text}`); break;
      case 'quote': out.push(`"${b.text}"${b.source ? ` — ${b.source}` : ''}`); break;
      case 'columns': out.push(`${b.left}\n${b.right}`); break;
      case 'table': out.push(b.rows.map((r) => r.join(' | ')).join('\n')); break;
      case 'terms': out.push(b.items.map((i) => `${i.term}: ${i.uitleg}`).join('\n')); break;
      case 'accordion': out.push(b.items.map((i) => `${i.title}: ${i.text}`).join('\n')); break;
      case 'checklist': out.push(b.items.map((i) => `- ${i.text}`).join('\n')); break;
      default: break;
    }
  }
  return out.join('\n\n').slice(0, maxChars);
}

export interface SectionExercisesRequest {
  course: Course;
  section: CourseSection;
  chapterTitle?: string;
  /** Leerplandoelen van deze sectie (met code). */
  goals?: CurriculumGoal[];
  /** Aantal oefeningen (1–3). */
  count?: number;
  wishes?: string;
}

export function buildSectionExercisesPrompt(req: SectionExercisesRequest): { system: string; prompt: string } {
  const count = Math.min(3, Math.max(1, req.count ?? 1));
  const goals = req.goals ?? [];
  const content = sectionPlainText(req.section);
  const system = `Je bent een ervaren Vlaamse leerkracht en toetsontwikkelaar die oefeningen maakt voor Boosterz.
Kwaliteitsregels:
- Toets ALLEEN wat in de sectie staat; verzin er geen leerstof bij.
- Meerkeuze: afleiders zijn plausibele misvattingen, nooit flauwekul.
- Geef bij elke vraag een korte "explanation" (feedback is een leermoment).
- Helder Nederlands (Vlaanderen), afgestemd op de doelgroep.
- Antwoord met ALLEEN geldige JSON: {"widgets":[{"type":"quiz","title":"…","config":{…}}]}`;
  const parts: string[] = [];
  parts.push(
    `Maak ${count} oefening(en) bij één sectie van de cursus "${req.course.title}"`
    + `${req.chapterTitle ? ` (hoofdstuk "${req.chapterTitle}")` : ''}, sectie "${req.section.title}".`
  );
  parts.push(`De EERSTE oefening is altijd een "quiz" van 4 à 6 vragen.${count > 1 ? ' De overige mogen ook van het type "flashcards", "pairs" of "checklist" zijn als dat didactisch beter past.' : ''}`);
  if (goals.length) {
    parts.push(
      `Leerplandoelen van deze sectie:\n${goalListText(goals)}\n`
      + `Geef elke vraag een "goalCode" met exact één code uit deze lijst.`
    );
  }
  if (req.wishes?.trim()) parts.push(`Extra wensen van de leerkracht: ${req.wishes.trim()}`);
  parts.push(
    content.trim()
      ? `=== INHOUD VAN DE SECTIE ===\n${content}\n=== EINDE ===`
      : 'De sectie bevat nog geen tekst: baseer je op de titel en de leerdoelen hierboven.'
  );
  parts.push(quizSchemaText({ goalCode: goals.length > 0 }));
  parts.push(`Geef terug: {"widgets":[{"type":"quiz","title":"…","config":{"questions":[vraag,…],"layout":"single"}}]}`);
  return { system, prompt: parts.join('\n\n') };
}

/** AI-antwoord met oefeningen → bruikbare widgets (hergebruikt de widgetsanering). */
export function sanitizeSectionExercises(
  json: unknown,
  opts: { curriculumId?: string; allowedGoalCodes?: string[] } = {}
): { widgets: Widget[]; warnings: string[] } {
  // De vragen dragen goalCodes: alleen codes uit de sectie tellen mee.
  const res = sanitizeGeneratedWidgets(json, { allowedGoalCodes: normalizeGoalCodes(opts.allowedGoalCodes) });
  const widgets = res.widgets.map((w) => (opts.curriculumId ? { ...w, curriculumId: opts.curriculumId } : w));
  return { widgets, warnings: res.warnings };
}

export function buildSectionPrompt({
  course, section, wishes, source,
}: { course: Course; section: CourseSection; wishes: string; source?: string }): { system: string; prompt: string } {
  const chapter = course.chapters.find((ch) => ch.sections.some((s) => s.id === section.id));
  // De ACTUELE tekst van de sectie meesturen (niet enkel de bloktypes): zonder
  // dit herhaalde "Vul deze sectie met AI" al eens dezelfde uitleg opnieuw,
  // omdat de AI niet kon zien wat er al stond.
  const existingText = sectionPlainText(section);
  const existing = section.blocks.length
    ? `\nDe sectie bevat al ${section.blocks.length} blok(ken). VUL AAN op wat er al staat — herhaal NIET dezelfde uitleg of begrippen.\n=== BESTAANDE INHOUD VAN DE SECTIE ===\n${existingText || '(geen platte tekst — bv. enkel een afbeelding of oefening; behandel de sectie als leeg)'}\n=== EINDE BESTAANDE INHOUD ===`
    : '';
  const prompt = `Vul één sectie van een digitale cursus.

Cursus: "${course.title}"${chapter ? ` · Hoofdstuk: "${chapter.title}"` : ''} · Sectie: "${section.title}"
${section.goals?.length ? `Leerdoelen van deze sectie: ${section.goals.join(' · ')}` : ''}
Wat er in moet komen: ${wishes.trim() || section.title}${existing}
${source?.trim() ? `\nBaseer je UITSLUITEND op dit bronmateriaal:\n=== BRON ===\n${source.trim()}\n=== EINDE BRON ===` : ''}

${BLOCK_SCHEMA}

Geef terug: {"blocks":[blok,…]} — begin met een "goal"-callout, wissel leerstof en verwerking af.`;
  return { system: COURSE_SYSTEM, prompt };
}

// ── Sanering ────────────────────────────────────────────────────────────────

export interface AICourseResult {
  course: Course;
  /**
   * Eén positie per gevraagde quiz, uitgelijnd op de hoofdstukken: een
   * ongeldige quiz wordt null (mét waarschuwing) zodat de overige quizzes
   * niet naar het verkeerde hoofdstuk verschuiven.
   */
  quizzes: (Widget | null)[];
  warnings: string[];
}

/**
 * Vervangt keep-blokken door de originele blokken uit de basiscursus.
 * `scopeChapterIds` beperkt zowel de bron als de "kwam niet terug"-controle
 * tot die hoofdstukken — nodig bij per-hoofdstuk herwerken, want dan bevat
 * `raw` maar één hoofdstuk en zouden de mediablokken van ALLE ANDERE
 * hoofdstukken anders onterecht als "weggevallen" gemeld worden.
 */
function resolveKeepBlocks(
  raw: unknown, base: Course | undefined, warnings: string[], scopeChapterIds?: Set<string>
): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const byId = new Map<string, CourseBlock>();
  if (base) {
    for (const chapter of base.chapters) {
      if (scopeChapterIds && !scopeChapterIds.has(chapter.id)) continue;
      for (const section of chapter.sections) {
        for (const b of section.blocks) byId.set(b.id, b);
      }
    }
  }
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.chapters)) return raw;
  for (const ch of c.chapters as Record<string, unknown>[]) {
    if (!ch || !Array.isArray(ch.sections)) continue;
    for (const se of ch.sections as Record<string, unknown>[]) {
      if (!se || !Array.isArray(se.blocks)) continue;
      se.blocks = (se.blocks as Record<string, unknown>[])
        .map((b) => {
          if (b && b.type === 'keep') {
            const orig = typeof b.id === 'string' ? byId.get(b.id) : undefined;
            if (orig) return JSON.parse(JSON.stringify(orig));
            warnings.push('Een mediablok kon niet teruggeplaatst worden en is weggevallen.');
            return null;
          }
          // Geen keep: dan moet het een tekstueel blok zijn. Een mediablok dat
          // de AI zelf maakte (verzonnen URL, data-URL of widget-id) valt weg.
          return keepAITextBlocks([b], warnings).length ? b : null;
        })
        .filter((b) => b !== null);
    }
  }
  // niet-teruggeplaatste mediablokken signaleren (de AI liet ze vallen)
  if (base) {
    const returned = new Set<string>();
    for (const ch of c.chapters as Record<string, unknown>[]) {
      for (const se of ((ch?.sections ?? []) as Record<string, unknown>[])) {
        for (const b of ((se?.blocks ?? []) as Record<string, unknown>[])) {
          if (b && typeof b.id === 'string') returned.add(b.id);
        }
      }
    }
    for (const [id, b] of byId) {
      if (MEDIA_BLOCK_TYPES.has(b.type) && !returned.has(id)) {
        warnings.push(`Een ${b.type}-blok uit de originele cursus kwam niet terug in de herwerking.`);
      }
    }
  }
  return raw;
}

/**
 * Vergelijksleutel voor doelcodes: naast de gewone normalisatie (hoofdletters,
 * spaties samenvoegen) ook zonder ENIGE spatie. Een model schrijft een code
 * wel eens zonder de spatie tussen vak en nummer ("NW7.1" i.p.v. "NW 7.1");
 * zonder deze extra tolerantie werd zo'n — verder correcte — code linea recta
 * afgekeurd, met een cursus zonder één enkele doelcode tot gevolg terwijl de
 * AI ze wel degelijk aanleverde.
 */
function goalCodeMatchKey(code: string): string {
  return normalizeGoalCode(code).replace(/\s+/g, '');
}

/**
 * Een echte doelcode bevat minstens één letter of cijfer. Wat de AI uit het
 * antwoordsjabloon overnam ("…", "-", "?"), is een plaatshouder, geen code.
 */
function isRealGoalCode(code: string): boolean {
  return /[\p{L}\d]/u.test(code);
}

/**
 * Filtert de doelcodes van een reeks secties tot de toegelaten lijst.
 * Plaatshouders vallen altijd weg, ook zonder lijst (cursus zonder leerplan).
 */
function filterSectionGoalCodes(sections: CourseSection[], allowedGoalCodes: string[] | undefined, warnings: string[]) {
  for (const section of sections) {
    if (!section.goalCodes?.length) continue;
    const real = section.goalCodes.filter(isRealGoalCode);
    section.goalCodes = real.length ? real : undefined;
  }
  if (!allowedGoalCodes?.length) return;
  const allowed = new Set(normalizeGoalCodes(allowedGoalCodes).map(goalCodeMatchKey));
  let dropped = 0;
  for (const section of sections) {
    if (!section.goalCodes?.length) continue;
    const kept = section.goalCodes.filter((c) => allowed.has(goalCodeMatchKey(c)));
    dropped += section.goalCodes.length - kept.length;
    section.goalCodes = kept.length ? kept : undefined;
  }
  if (dropped > 0) {
    warnings.push(`${dropped} doelcode(s) van de AI stonden niet in je leerplan en zijn weggelaten.`);
  }
}

/**
 * De goalCodes die uit sanitizeCourse komen zijn al genormaliseerd en
 * ontdubbeld; hier kijken we nog of de AI binnen de gevraagde lijst bleef en
 * hangen we het leerplan aan de cursus.
 */
function applyGoalCodes(course: Course, opts: SanitizeAICourseOptions, warnings: string[]) {
  const curriculumId = opts.curriculumId ?? opts.base?.curriculumId;
  if (curriculumId) course.curriculumId = curriculumId;
  filterSectionGoalCodes(course.chapters.flatMap((ch) => ch.sections), opts.allowedGoalCodes, warnings);
}

export interface SanitizeAICourseOptions {
  /** Bestaande cursus bij herwerken/optimaliseren. */
  base?: Course;
  /** Leerplan waaraan de cursus hangt; komt op course.curriculumId terecht. */
  curriculumId?: string;
  /**
   * Codes die de AI mocht gebruiken. Alles daarbuiten wordt weggelaten (de AI
   * verzint al eens een code) — zonder lijst blijven alle codes staan.
   */
  allowedGoalCodes?: string[];
}

export function sanitizeAICourse(json: unknown, opts: SanitizeAICourseOptions = {}): AICourseResult {
  const warnings: string[] = [];
  const envelope = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rawCourse = (envelope.course ?? envelope.c ?? json) as Record<string, unknown>;

  const resolved = resolveKeepBlocks(rawCourse, opts.base, warnings) as Record<string, unknown>;
  const base = opts.base;
  const full = {
    ...resolved,
    id: base?.id ?? uid(),
    code: base?.code ?? makeCode(),
    author: base?.author ?? '',
    coverEmoji: (typeof resolved?.coverEmoji === 'string' && resolved.coverEmoji) || base?.coverEmoji || '📘',
    settings: base?.settings ?? { accentColor: '#4f46e5', requireName: true, showProgressToStudent: true },
    createdAt: base?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    // De studierichting komt altijd van de bestaande cursus, nooit van de AI: na `...resolved`, zodat een
    // "doelgroep" in het AI-antwoord overschreven wordt. "Herwerk met AI" en "Vul de hiaten" houden ze zo.
    doelgroep: base?.doelgroep,
    // Ook het leerplan kiest nooit de AI: alleen de leerkracht (opts) of de bestaande cursus. Anders kon een
    // leerplan-id uit het AI-antwoord via dat leerplan de studierichting van de cursus bepalen.
    curriculumId: opts.curriculumId ?? base?.curriculumId,
  };
  const course = sanitizeCourse(full);
  if (course) {
    applyGoalCodes(course, opts, warnings);
  }
  if (!course) {
    return {
      course: base ?? (sanitizeCourse({ title: 'Cursus', chapters: [{ title: 'Hoofdstuk 1', sections: [{ title: 'Inleiding', blocks: [] }] }] }) as Course),
      quizzes: [],
      warnings: [...warnings, 'De AI gaf geen bruikbare cursusstructuur terug. Probeer het opnieuw.'],
    };
  }

  let quizzes: (Widget | null)[] = [];
  if (Array.isArray(envelope.widgets) && envelope.widgets.length) {
    quizzes = (envelope.widgets as unknown[]).map((w, i) => {
      const gen = sanitizeGeneratedWidgets({ widgets: [w] }, { allowedGoalCodes: normalizeGoalCodes(opts.allowedGoalCodes) });
      warnings.push(...gen.warnings.map((msg) => `Quiz ${i + 1}: ${msg}`));
      return gen.widgets.find((x) => x.type === 'quiz') ?? null;
    });
  }
  return { course, quizzes, warnings };
}

/**
 * {"blocks":[…]} van de AI → geldige CourseBlocks (via een wegwerpcursus).
 * Alleen tekstuele blokken: een mediablok van de AI valt weg en komt (als je
 * een lijst meegeeft) in `warnings`.
 */
export function sanitizeAIBlocks(json: unknown, warnings: string[] = []): CourseBlock[] {
  const envelope = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const raw: unknown[] = Array.isArray(envelope.blocks) ? envelope.blocks : Array.isArray(json) ? json : [];
  const blocks = keepAITextBlocks(raw, warnings);
  const course = sanitizeCourse({
    title: 'x',
    chapters: [{ title: 'x', sections: [{ title: 'x', blocks }] }],
  });
  return course?.chapters[0]?.sections[0]?.blocks ?? [];
}

// ── Ontbrekend onderwerp signaleren ─────────────────────────────────────────
//
// De AI verzint geen leerstof die niet in de brontekst staat — maar als de
// brontekst een deel van de titel/opdracht niet behandelt, ontbreekt dat deel
// stilzwijgend, en dat merkt niemand zonder na te lezen. Een zachte,
// woordgebaseerde controle (geen AI-oordeel, dus gratis en deterministisch):
// komt elk "belangrijk" woord uit de titel/opdracht ergens in de gegenereerde
// tekst terug?

/**
 * Vlaamse/Nederlandse woorden van 6+ letters die op zich niets over het
 * ONDERWERP zeggen en dus nooit als kernwoord tellen, ook al zijn ze lang
 * genoeg (bv. "worden", "waarbij"). Bewust kort gehouden: een gemist
 * stopwoord kost hoogstens een woord in `keywords` dat toevallig ook in de
 * tekst voorkomt — geen gemiste waarschuwing.
 */
const TOPIC_STOPWORDS = new Set([
  'worden', 'wordt', 'werden', 'hebben', 'gehad', 'kunnen', 'konden', 'moeten',
  'moesten', 'zullen', 'zouden', 'andere', 'anders', 'elkaar', 'waarbij',
  'waarvan', 'waarmee', 'waarop', 'waarin', 'hierbij', 'hiervan', 'hiermee',
  'daarbij', 'daarvan', 'daarmee', 'binnen', 'buiten', 'tussen', 'tijdens',
  'volgens', 'ondanks', 'zowel', 'inclusief', 'exclusief', 'ongeveer',
  'diverse', 'enkele', 'sommige', 'allerlei', 'telkens', 'meestal', 'echter',
  'daarom', 'dankzij', 'zonder', 'wanneer', 'zodat',
]);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Kernwoorden uit een titel of vrije opdrachttekst: woorden van minstens 6
 * letters, zonder stopwoorden, zonder hoofdletters en zonder accenten (zodat
 * "Écologie" en "ecologie" hetzelfde woord zijn). Ontdubbeld, volgorde uit de
 * tekst behouden.
 */
export function extractTopicKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of stripAccents(text.toLowerCase()).split(/[^\p{L}]+/u)) {
    if (raw.length < 6 || TOPIC_STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export interface MissingTopicCheck {
  /** Kernwoorden uit de titel/opdracht die getoetst werden. */
  keywords: string[];
  /** Kernwoorden die nergens in de gegenereerde cursus terug te vinden zijn. */
  missing: string[];
}

/**
 * Zachte controle na het genereren: komt elk kernwoord uit de titel/opdracht
 * ergens in de cursus terug? Geen hard oordeel — een cursus mag een begrip
 * best anders formuleren — maar een kernwoord dat NERGENS terugkomt (zoals
 * "massadichtheid" in een cursus "Massa, volume en massadichtheid" waarvan de
 * brontekst dat deel niet bevatte) is een sterk signaal dat de leerkracht
 * even moet nakijken of er een onderdeel ontbreekt.
 */
export function checkMissingTopics(titleOrWish: string, course: Course): MissingTopicCheck {
  const keywords = extractTopicKeywords(titleOrWish);
  if (keywords.length === 0) return { keywords, missing: [] };
  // Enkel de HOOFDSTUKKEN doorzoeken, niet course.title zelf: de titel
  // herhaalt meestal gewoon de opdracht van de leerkracht (vaak letterlijk),
  // waardoor elk kernwoord daar altijd "gevonden" zou worden — ook als de
  // INHOUD het onderwerp mist. Precies dat scenario (titel "Massa, volume en
  // massadichtheid" zonder massadichtheid in de tekst) moet deze controle
  // juist opvangen.
  const haystack = stripAccents(JSON.stringify(course.chapters).toLowerCase());
  const missing = keywords.filter((k) => !haystack.includes(k));
  return { keywords, missing };
}
