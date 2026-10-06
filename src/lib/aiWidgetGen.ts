// ── AI-widgetgeneratie: promptopbouw + defensieve validatie ─────────────────
//
// De AI krijgt een compact JSON-schema per widgettype en moet een envelop
// teruggeven: { "widgets": [ { "type", "title", "config" } ] }.
// Alles wat terugkomt wordt hier defensief gesaneerd: verkeerde types
// worden overgeslagen, ontbrekende velden aangevuld, indices geklemd.
// De leerkracht ziet daarna ALTIJD eerst een voorbeeld en beslist zelf
// wat bewaard wordt — de AI maakt een voorzet, geen eindproduct.

import type {
  Question, QuestionType, Widget, WidgetTypeId, QuizConfig,
} from './types';
import { uid } from './utils';
import { normalizeGoalCode } from './curriculum';
import type { BatchItemStatus } from './aiBatch';
import { createWidget, getTypeDef } from '../widgets/registry';

// ── Welke types kan de AI zinvol genereren? ─────────────────────────────────

export const AI_GEN_TYPES: WidgetTypeId[] = [
  'quiz', 'worksheet', 'exitticket', 'splitworksheet', 'flashcards',
  'crossword', 'wordsearch', 'memory', 'hangman', 'pairs', 'timeline',
  'scramble', 'dictation', 'poll', 'checklist', 'webquest', 'mindmap',
  'planner', 'bingo', 'spinner',
];

export function isGenType(t: string): t is WidgetTypeId {
  return (AI_GEN_TYPES as string[]).includes(t);
}

/** Langste woord (in letters) dat het kruiswoordraadsel en de woordzoeker aankunnen. */
export const MAX_PUZZLE_WORD = 15;

// ── Schema-uitleg per type (gaat mee in de prompt) ──────────────────────────

const QUESTION_DOC_BASE = `Een "vraag" is een JSON-object met "type" en "prompt" plus:
- "mc": {"options":["…"],"correctIndex":0} — 3 à 4 opties, plausibele afleiders
- "multi": {"options":["…"],"correctIndices":[0,2]}
- "tf": {"answer":true}
- "short": {"accepted":["antwoord","synoniem"]} — kort tekstantwoord
- "long": {"modelAnswer":"…","rubric":[{"criterion":"…","points":2}]} — open vraag
- "gap": {"text":"Zin met [antwoord] tussen vierkante haken, meerdere gaten mag."}
- "match": {"pairs":[{"left":"…","right":"…"}]} — 3 à 6 paren
- "order": {"items":["eerste","tweede","derde"]} — in de JUISTE volgorde
- "number": {"answer":12.5,"tolerance":0}
- "info": alleen "prompt" — leerstof-/instructieblok tussen de vragen
- "dropdown": {"type":"dropdown","prompt":"Kies telkens het juiste antwoord.","text":"De hoofdstad van Frankrijk is {Parijs|Lyon|Marseille}.","points":1} — keuzelijstje(s) tussen {accolades}, opties gescheiden met |, de EERSTE optie in elk {…} is de juiste (wordt voor de leerling geschud); meerdere {…} in één tekst mag
- "marktext": {"type":"marktext","prompt":"Markeer alle werkwoorden.","text":"De zon [schijnt] en de vogels [fluiten].","points":1} — de juist te markeren woorden staan tussen [vierkante haken]
- "sort": {"type":"sort","prompt":"Sorteer de dieren in de juiste groep.","categories":[{"name":"Zoogdier"},{"name":"Vogel"}],"items":[{"text":"walvis","category":"Zoogdier"},{"text":"merel","category":"Vogel"}]} — 2 à 4 categorieën, 4 à 10 items; "category" is exact de naam van één categorie
- "table": {"type":"table","prompt":"Vul de tabel aan.","columns":["Land","Hoofdstad"],"rows":[{"cells":["België",""],"answers":[null,"Brussel"]},{"cells":["Frankrijk",""],"answers":[null,"Parijs"]}]} — lege cel ("") = invulveld; het juiste antwoord staat op dezelfde positie in "answers", elders null
- "likert": {"type":"likert","prompt":"Hoe kijk je terug op deze les?","statements":["Ik begrijp de leerstof.","Ik kan dit aan iemand anders uitleggen."],"options":["Helemaal oneens","Oneens","Neutraal","Eens","Helemaal eens"]} — ALLEEN voor reflectie of exit-tickets; er is geen juist/fout
Genereer NOOIT vragen van het type "rating", "upload" of "imagepoint": die vereisen een mening, een ingeleverd bestand of een afbeelding en kunnen niet zinvol door jou ingevuld worden.
Elke vraag mag ook hebben: "points" (getal, standaard 1), "explanation" (uitleg bij feedback),
"hints" (oplopende hulpstapjes: eerst strategie, dan aanwijzing, max 3),
"goal" (kort leerdoel in eigen woorden), "level" ("basis"|"kern"|"uitbreiding"), "support" (eenvoudiger geformuleerde versie van de vraag)`;

/**
 * De "goalCode"-regel gaat alleen mee als er een lijst leerplandoelen is om uit
 * te kiezen. Zonder lijst vragen we er niet naar: de AI geeft dan de plaatshouder
 * "…" of een verzonnen code terug. De tekst is bewust ongewijzigd, want de
 * cursusprompts (aiCourse.ts) gebruiken ze via quizSchemaText().
 */
const GOAL_CODE_DOC = `,
"goalCode" (UITSLUITEND een code die letterlijk in de meegegeven lijst leerplandoelen staat; is er geen lijst of past geen enkel doel, laat het veld dan weg — verzin nooit een code).`;

function questionDoc(withGoalCode: boolean): string {
  return QUESTION_DOC_BASE + (withGoalCode ? GOAL_CODE_DOC : '.');
}

const SCHEMA_DOCS: Partial<Record<WidgetTypeId, string>> = {
  worksheet: `"worksheet" (werkblad, alles onder elkaar) — config: {"questions":[vraag,…],"layout":"scroll","glossary":[…]} — wissel vragen af met "info"-blokken leerstof.`,
  exitticket: `"exitticket" (korte check aan het einde van de les, 2 à 4 vragen) — config: {"questions":[vraag,…],"layout":"single"}`,
  splitworksheet: `"splitworksheet" (bron + vragen naast elkaar) — config: {"source":{"kind":"text","title":"…","text":"de bron- of leestekst"},"questions":[vraag,…]}`,
  flashcards: `"flashcards" — config: {"cards":[{"front":"begrip of vraag","back":"uitleg of antwoord"}]}`,
  crossword: `"crossword" — config: {"entries":[{"word":"WOORD","clue":"omschrijving"}]} — woorden zonder spaties, hoogstens ${MAX_PUZZLE_WORD} letters, 6 à 12 stuks`,
  wordsearch: `"wordsearch" — config: {"words":["WOORD",…],"size":12} — 8 à 14 woorden zonder spaties, hoogstens ${MAX_PUZZLE_WORD} letters`,
  memory: `"memory" — config: {"pairs":[{"a":"begrip","b":"bijpassend"}]} — 6 à 10 paren`,
  hangman: `"hangman" (galgje) — config: {"words":[{"word":"woord","hint":"omschrijving"}]}`,
  pairs: `"pairs" (koppelen) — config: {"pairs":[{"left":"…","right":"…"}]} — 4 à 8 paren`,
  timeline: `"timeline" — config: {"events":[{"date":"1815","title":"…","description":"…"}],"mode":"exercise"} — chronologisch`,
  scramble: `"scramble" (husselwoorden/-zinnen) — config: {"mode":"word","items":[{"text":"woord of zin","hint":"…"}]}`,
  dictation: `"dictation" (dictee, wordt voorgelezen) — config: {"sentences":[{"text":"Voluit geschreven zin.","hint":"…"}]}`,
  poll: `"poll" (peiling, geen juist/fout) — config: {"question":"…","options":["…"],"allowMultiple":false}`,
  checklist: `"checklist" — config: {"title":"…","items":[{"text":"stap of criterium"}]}`,
  webquest: `"webquest" (stappenplan met bronnen) — config: {"steps":[{"title":"…","content":"opdrachttekst","links":[{"label":"…","url":"https://…"}]}]} — alleen échte, algemeen bekende URL's (bv. Wikipedia); verzin geen adressen`,
  mindmap: `"mindmap" — config: {"root":"centraal begrip","outline":"tak 1\\n  subtak\\ntak 2","studentEditable":true} — 2 spaties per niveau`,
  planner: `"planner" (taakplanner) — config: {"title":"…","sections":[{"title":"fase","tasks":[{"text":"taak"}]}]}`,
  bingo: `"bingo" — config: {"items":["begrip",…],"size":4} — minstens size² items`,
  spinner: `"spinner" (rad) — config: {"items":["naam of opdracht",…]}`,
};

/**
 * Schema-uitleg van de quiz (voor hergebruik in bv. de cursusgeneratie).
 * `goalCode: false` laat de uitleg over doelcodes weg; gebruik dat overal waar
 * er geen leerplan is om uit te kiezen. Standaard blijft ze staan.
 */
export function quizSchemaText(opts: { goalCode?: boolean } = {}): string {
  return `"quiz" — config: {"questions":[vraag,…],"layout":"single","glossary":[{"term":"…","uitleg":"…"}]}
${questionDoc(opts.goalCode !== false)}`;
}

/** Soorten waarvan het schema naar "vraag" verwijst (uitleg in questionDoc). */
const QUESTION_TYPES_USING_DOC: ReadonlySet<WidgetTypeId> = new Set<WidgetTypeId>(['worksheet', 'exitticket', 'splitworksheet']);

function schemaDoc(type: WidgetTypeId, withGoalCode: boolean): string | undefined {
  return type === 'quiz' ? quizSchemaText({ goalCode: withGoalCode }) : SCHEMA_DOCS[type];
}

// ── Promptopbouw ────────────────────────────────────────────────────────────

export interface WidgetGenRequest {
  /** Bronmateriaal (geplakte tekst, hoofdstuk, artikel …). Mag leeg zijn. */
  source: string;
  /** Wens van de leerkracht, bv. "10 vragen over de waterkringloop, 2e graad". */
  wish: string;
  /** Gewenste widgettypes. */
  types: WidgetTypeId[];
  /** Richtaantal items/vragen per widget (0 = laat de AI kiezen). */
  itemCount?: number;
  /** Doelgroep/niveau, bv. "5e leerjaar" of "3 ASO". */
  audience?: string;
  /** Leerdoelen om vragen aan te koppelen (vrije tekst). */
  goals?: string;
  /**
   * Leerplandoelen met hun code (lib/curriculum.ts). De AI mag "goalCode"
   * alleen met een code uit déze lijst invullen; zo blijft de koppeling tussen
   * vraag, resultaat en leerplan betrouwbaar.
   */
  goalCodes?: { code: string; text: string }[];
  /** Ook differentiatie meenemen (hints, steuntaal, niveaus)? */
  differentiate?: boolean;
}

export function buildWidgetGenPrompt(req: WidgetGenRequest): { system: string; prompt: string } {
  const withGoalCode = Boolean(req.goalCodes && req.goalCodes.length > 0);
  const genTypes = req.types.filter(isGenType);
  const docList = genTypes.map((t) => schemaDoc(t, withGoalCode)).filter((d): d is string => Boolean(d));
  // Werkblad, exit-ticket en gesplitst werkblad gebruiken "vraag" uit het
  // quizschema: zonder quiz in de keuze moet die uitleg er apart bij.
  if (!genTypes.includes('quiz') && genTypes.some((t) => QUESTION_TYPES_USING_DOC.has(t))) {
    docList.push(questionDoc(withGoalCode));
  }
  const docs = docList.join('\n\n');
  const system = `Je bent een ervaren Vlaamse leerkracht en toetsontwikkelaar die lesmateriaal maakt voor Boosterz.
Kwaliteitsregels:
- Schrijf in helder Nederlands (Vlaanderen), afgestemd op de doelgroep.
- Meerkeuze: afleiders zijn plausibele misvattingen, nooit flauwekul; geen "alle bovenstaande"; de juiste optie is niet systematisch de langste.
- Geef bij elke vraag een korte "explanation" (waarom is dit juist — feedback is leermoment).
- Varieer vraagtypes waar zinvol; toets begrip, niet alleen herkenning.
- Baseer je UITSLUITEND op het bronmateriaal als dat gegeven is; verzin er geen feiten bij.
- Antwoord met ALLEEN geldige JSON (geen uitleg, geen markdown): {"widgets":[{"type":"…","title":"…","config":{…}}]}`;

  const parts: string[] = [];
  parts.push(`Maak de volgende widget(s): ${req.types.join(', ')}.`);
  if (req.wish.trim()) parts.push(`Wens van de leerkracht: ${req.wish.trim()}`);
  if (req.audience?.trim()) parts.push(`Doelgroep: ${req.audience.trim()}`);
  if (req.itemCount && req.itemCount > 0) parts.push(`Richtaantal vragen/items per widget: ${req.itemCount}.`);
  if (req.goals?.trim()) parts.push(`Koppel vragen waar mogelijk aan deze leerdoelen (vul het veld "goal" in):\n${req.goals.trim()}`);
  if (req.goalCodes && req.goalCodes.length > 0) {
    parts.push(
      `Leerplandoelen: koppel elke vraag aan HOOGSTENS één doel hieronder via het veld "goalCode".\n` +
        `Gebruik de code exact zoals ze hier staat; past geen enkel doel, laat "goalCode" dan weg. Verzin nooit een code.\n` +
        req.goalCodes.map((g) => `- ${g.code}: ${g.text}`).join('\n')
    );
  }
  if (req.differentiate) {
    parts.push(`Differentiatie: geef bij elke vraag "hints" (max 3 oplopende hulpstapjes: strategie → aanwijzing → bijna-antwoord), een "support"-versie in eenvoudiger taal, en tag vragen met "level" (basis/kern/uitbreiding).`);
  }
  parts.push(`\nSchema's van de gevraagde widgettypes:\n${docs}`);
  if (req.source.trim()) {
    parts.push(`\n=== BRONMATERIAAL ===\n${req.source.trim()}\n=== EINDE BRONMATERIAAL ===`);
  }
  return { system, prompt: parts.join('\n\n') };
}

// ── Sanering van vragen ─────────────────────────────────────────────────────

// rating/upload/imagepoint staan hier bewust NIET in: die vereisen een mening,
// een ingeleverd bestand of een afbeelding en kan de AI niet zinvol genereren.
const QUESTION_TYPES: QuestionType[] = [
  'mc', 'multi', 'tf', 'short', 'long', 'gap', 'match', 'order', 'number', 'slider', 'info',
  'dropdown', 'marktext', 'sort', 'table', 'likert',
];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
}

/** Filtert opties en onthoudt welke oorspronkelijke index waar terechtkwam. */
function mapOptions(raw: unknown): { options: string[]; map: Map<number, number> } {
  const options: string[] = [];
  const map = new Map<number, number>();
  if (Array.isArray(raw)) {
    raw.forEach((x, i) => {
      if (typeof x === 'string' && x.trim() !== '') {
        map.set(i, options.length);
        options.push(x.trim());
      }
    });
  }
  return { options, map };
}

/**
 * Welke optie is juist? Modellen noemen dat veld niet altijd "correctIndex"
 * (Gemini schreef in tests ook "correctAnswer"), en geven soms de tekst van de
 * optie in plaats van het nummer. Beide vangen we op; een waarde die naar geen
 * enkele (overgebleven) optie wijst, geeft undefined en keurt de vraag af.
 */
function resolveOptionIndex(raw: unknown, rawOptions: unknown, map: Map<number, number>, options: string[]): number | undefined {
  if (typeof raw === 'number' || (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw))) {
    return map.get(Math.round(num(raw, NaN)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const want = raw.trim().toLowerCase();
    const i = options.findIndex((o) => o.toLowerCase() === want);
    if (i >= 0) return i;
    // "B" of "b)" als letter van de optie
    const letter = /^([a-h])\)?$/i.exec(raw.trim());
    if (letter && Array.isArray(rawOptions)) return map.get(letter[1].toLowerCase().charCodeAt(0) - 97);
  }
  return undefined;
}

/** Eerste gedefinieerde waarde van een reeks mogelijke veldnamen. */
function firstDefined(q: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (q[k] !== undefined && q[k] !== null) return q[k];
  return undefined;
}

/**
 * Een getal uit wat een model als antwoord schrijft: 2, "2", "2,5", "2 m/s",
 * "−3 °C". Alles wat geen eenduidig getal is (tekst, twee getallen, leeg),
 * geeft undefined. Nooit stil 0: een getalvraag met sleutel 0 keurt het juiste
 * antwoord van een leerling af.
 */
export function resolveNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const m = /^\s*([-−–]?)\s*(\d+(?:[.,]\d+)?)\s*([^\d]*)$/.exec(raw);
  if (!m) return undefined;
  // Na het getal mag enkel een eenheid staan (m/s, °C, %, km/h, g/cm³ …).
  if (m[3] && !/^[\p{L}/%°²³µ·.\s]*$/u.test(m[3])) return undefined;
  const n = Number(`${m[1] ? '-' : ''}${m[2].replace(',', '.')}`);
  return Number.isFinite(n) ? n : undefined;
}

/** Juist/onjuist uit de gangbare vormen; undefined als het niet eenduidig is. */
function resolveBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (['true', 'juist', 'waar', 'ja', 'correct'].includes(t)) return true;
    if (['false', 'onjuist', 'fout', 'onwaar', 'nee', 'incorrect'].includes(t)) return false;
  }
  if (raw === 1) return true;
  if (raw === 0) return false;
  return undefined;
}

/** Opties die de sanering strenger maken dan de AI zelf is. */
export interface SanitizeOptions {
  /**
   * Toegelaten leerplandoelcodes. Staat er een lijst, dan wordt elke andere
   * (verzonnen of verkeerd overgeschreven) code weggelaten — liever geen
   * koppeling dan een koppeling naar een doel dat niet bestaat. Zonder lijst
   * blijft een echte code staan zoals ze binnenkwam, genormaliseerd; een
   * plaatshouder zonder letter of cijfer ("…") valt altijd weg.
   */
  allowedGoalCodes?: string[];
}

/** Doelcode overnemen, maar alleen als ze binnen de toegelaten lijst valt. */
function pickGoalCode(raw: unknown, opts?: SanitizeOptions): string | undefined {
  const value = str(raw).trim();
  // Een echte code bevat minstens één letter of cijfer. "…", "-" of "?" is de
  // plaatshouder uit het antwoordsjabloon, geen code: ook zonder lijst weg ermee.
  if (!value || !/[\p{L}\d]/u.test(value)) return undefined;
  const code = normalizeGoalCode(value);
  const allowed = opts?.allowedGoalCodes;
  if (allowed && allowed.length > 0) {
    const ok = allowed.some((c) => normalizeGoalCode(c) === code);
    if (!ok) return undefined;
  }
  return code;
}

/** Zet één AI-vraag om naar een geldige Question, of null als het niet lukt. */
export function sanitizeQuestion(raw: unknown, opts?: SanitizeOptions): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const type = str(q.type) as QuestionType;
  if (!QUESTION_TYPES.includes(type)) return null;
  const prompt = str(q.prompt).trim();
  // Bij tekstdragende types zit de inhoud in "text"; de prompt krijgt dan een standaardje.
  if (!prompt && type !== 'gap' && type !== 'dropdown' && type !== 'marktext') return null;

  const base = {
    id: uid(),
    prompt,
    points: Math.max(0, Math.round(num(q.points, type === 'info' ? 0 : 1))),
    explanation: str(q.explanation) || undefined,
    hint: str(q.hint) || undefined,
    hints: strArr(q.hints).slice(0, 3),
    goal: str(q.goal).trim() || undefined,
    goalCode: pickGoalCode(q.goalCode ?? q.goalcode ?? q.leerplandoel, opts),
    level: (['basis', 'kern', 'uitbreiding'] as const).find((l) => l === q.level),
    support: str(q.support) || undefined,
  };
  if (base.hints && base.hints.length === 0) base.hints = undefined as unknown as string[];

  switch (type) {
    case 'mc': {
      // Opties filteren MET indextoewijzing: als een lege optie wegvalt,
      // moet de juiste index mee verschuiven — en een index die naar een
      // weggevallen of onbestaande optie wijst, keurt de hele vraag af
      // (stilzwijgend een afleider juist rekenen is erger dan overslaan).
      const { options, map } = mapOptions(q.options);
      if (options.length < 2) return null;
      const ci = resolveOptionIndex(
        firstDefined(q, ['correctIndex', 'correctAnswer', 'correctOption', 'answerIndex', 'correct', 'answer']),
        q.options, map, options
      );
      if (ci === undefined) return null;
      return { ...base, type, options, correctIndex: ci };
    }
    case 'multi': {
      const { options, map } = mapOptions(q.options);
      if (options.length < 2) return null;
      const rawIdx = firstDefined(q, ['correctIndices', 'correctAnswers', 'correctOptions', 'answers', 'correct']);
      const idx = Array.isArray(rawIdx)
        ? rawIdx
            .map((i) => resolveOptionIndex(i, q.options, map, options))
            .filter((i): i is number => i !== undefined)
        : [];
      if (idx.length === 0) return null;
      return { ...base, type, options, correctIndices: [...new Set(idx)].sort((a, b) => a - b) };
    }
    case 'tf': {
      // Nooit stilzwijgend "onjuist" invullen: een ware stelling die als
      // onjuist nagekeken wordt, is erger dan een vraag die wegvalt.
      const answer = resolveBoolean(firstDefined(q, ['answer', 'correct', 'correctAnswer', 'isTrue', 'value']));
      if (answer === undefined) return null;
      return { ...base, type, answer };
    }
    case 'short': {
      const accepted = strArr(q.accepted ?? q.answers ?? q.answer);
      if (accepted.length === 0) return null;
      return { ...base, type, accepted, caseSensitive: false };
    }
    case 'long':
      return {
        ...base, type,
        modelAnswer: str(q.modelAnswer) || undefined,
        rubric: Array.isArray(q.rubric)
          ? q.rubric
              .map((r) => {
                const rr = r as Record<string, unknown>;
                const criterion = str(rr?.criterion).trim();
                return criterion ? { criterion, points: Math.max(1, Math.round(num(rr?.points, 1))) } : null;
              })
              .filter((x): x is { criterion: string; points: number } => x !== null)
          : undefined,
      };
    case 'gap': {
      const text = str(q.text ?? q.prompt);
      if (!/\[[^\]]+\]/.test(text)) return null;
      return { ...base, prompt: prompt || 'Vul in.', type, text };
    }
    case 'match': {
      const pairs = Array.isArray(q.pairs)
        ? q.pairs
            .map((p) => {
              const pp = p as Record<string, unknown>;
              const left = str(pp?.left).trim();
              const right = str(pp?.right).trim();
              return left && right ? { left, right } : null;
            })
            .filter((x): x is { left: string; right: string } => x !== null)
        : [];
      if (pairs.length < 2) return null;
      return { ...base, type, pairs };
    }
    case 'order': {
      const items = strArr(q.items);
      if (items.length < 2) return null;
      return { ...base, type, items };
    }
    case 'number': {
      // Zonder eenduidige sleutel valt de vraag weg: beter een vraag minder
      // dan een vraag die het juiste antwoord fout rekent.
      const answer = resolveNumber(firstDefined(q, ['answer', 'correctAnswer', 'correct', 'value', 'solution']));
      if (answer === undefined) return null;
      return { ...base, type, answer, tolerance: Math.abs(resolveNumber(q.tolerance) ?? 0) };
    }
    case 'slider': {
      const min = resolveNumber(q.min) ?? 0;
      const max = Math.max(min + 1, resolveNumber(q.max) ?? 10);
      const answer = resolveNumber(firstDefined(q, ['answer', 'correctAnswer', 'correct', 'value']));
      if (answer === undefined || answer < min || answer > max) return null;
      return {
        ...base, type, min, max,
        step: Math.max(0.001, resolveNumber(q.step) ?? 1),
        answer,
        tolerance: Math.abs(resolveNumber(q.tolerance) ?? 0),
      };
    }
    case 'info':
      return { ...base, type, points: 0 };
    case 'dropdown': {
      const text = str(q.text ?? q.prompt);
      // Minstens één {…}-groep met minstens 2 opties, anders valt er niets te kiezen.
      if (!/\{[^{}|]+(\|[^{}|]+)+\}/.test(text)) return null;
      // shuffle altijd aan: de AI zet de juiste optie vooraan, dus zonder
      // schudden zou het antwoord altijd bovenaan het lijstje staan.
      return { ...base, prompt: prompt || 'Kies telkens het juiste antwoord.', type, text, shuffle: true };
    }
    case 'marktext': {
      const text = str(q.text);
      if (!/\[[^\]]+\]/.test(text)) return null;
      return { ...base, prompt: prompt || 'Markeer de juiste woorden.', type, text, penalizeWrong: q.penalizeWrong === true };
    }
    case 'sort': {
      // Categorienamen → id's; items verwijzen per naam (case-ongevoelig).
      const byName = new Map<string, { id: string; name: string }>();
      for (const cRaw of Array.isArray(q.categories) ? q.categories : []) {
        const name = (typeof cRaw === 'string' ? cRaw : str((cRaw as Record<string, unknown>)?.name)).trim();
        if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { id: uid(), name });
      }
      const categories = [...byName.values()];
      if (categories.length < 2) return null;
      const items = (Array.isArray(q.items) ? q.items : [])
        .map((iRaw) => {
          const ii = iRaw as Record<string, unknown>;
          const text = str(ii?.text).trim();
          const cat = byName.get(str(ii?.category ?? ii?.categoryId).trim().toLowerCase());
          // Item met onbekende categorie stilzwijgend juist rekenen kan niet → weglaten.
          return text && cat ? { id: uid(), text, categoryId: cat.id } : null;
        })
        .filter((x): x is { id: string; text: string; categoryId: string } => x !== null);
      if (items.length < 2) return null;
      return { ...base, type, categories, items };
    }
    case 'table': {
      const columns = strArr(q.columns);
      if (columns.length < 2) return null;
      const rows = (Array.isArray(q.rows) ? q.rows : [])
        .map((rRaw) => {
          const rr = rRaw as Record<string, unknown>;
          const cellsRaw = Array.isArray(rr?.cells) ? rr.cells : [];
          const answersRaw = Array.isArray(rr?.answers) ? rr.answers : [];
          // Lengtes gelijktrekken aan de kolommen; alleen lege cellen (invulvelden)
          // houden hun antwoord, elders wordt het antwoord genegeerd.
          // Cellen zijn even numeriek-tolerant als antwoorden: "12" en 12 zijn allebei geldig.
          const cells = columns.map((_, i) => {
            const cl = cellsRaw[i];
            return (typeof cl === 'string' ? cl : typeof cl === 'number' ? String(cl) : '').trim();
          });
          const answers = columns.map((_, i): string | null => {
            const a = answersRaw[i];
            const s = (typeof a === 'string' ? a : typeof a === 'number' ? String(a) : '').trim();
            return cells[i] === '' && s ? s : null;
          });
          const empty = cells.every((cl) => cl === '') && answers.every((a) => a === null);
          return empty ? null : { id: uid(), cells, answers };
        })
        .filter((x): x is { id: string; cells: string[]; answers: (string | null)[] } => x !== null);
      // Zonder minstens één invulveld met antwoord valt er niets te oefenen.
      if (rows.length === 0 || !rows.some((r) => r.answers.some((a) => a !== null))) return null;
      return { ...base, type, columns, rows, caseSensitive: false };
    }
    case 'likert': {
      const statements = (Array.isArray(q.statements) ? q.statements : [])
        .map((sRaw) => (typeof sRaw === 'string' ? sRaw : str((sRaw as Record<string, unknown>)?.text)).trim())
        .filter((t) => t !== '')
        .map((text) => ({ id: uid(), text }));
      if (statements.length === 0) return null;
      // 2 à 7 schaalpunten is geldig (bv. "Oneens/Eens"); pas onder 2 valt er niets te kiezen.
      let options = strArr(q.options).slice(0, 7);
      if (options.length < 2) options = ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'];
      // Reflectie zonder juist/fout → nooit punten.
      return { ...base, type, points: 0, statements, options };
    }
    default:
      return null;
  }
}

export function sanitizeQuestions(raw: unknown, opts?: SanitizeOptions): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => sanitizeQuestion(r, opts)).filter((q): q is Question => q !== null);
}

// ── Dubbele vragen herkennen ────────────────────────────────────────────────

/** Alle tekst in een waarde (diep), zonder de willekeurige id's van gesaneerde vragen. */
function textParts(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'number') out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => textParts(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) if (k !== 'id' && k !== 'categoryId') textParts(x, out);
  }
  return out;
}

function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Sleutel waarmee twee vragen als "dezelfde vraag" gelden: de opdracht, de
 * tekst met gaten of keuzes, en de inhoud van koppel-, volgorde-, sorteer-,
 * tabel- en stellingvragen. De opdracht alleen is te weinig: bij invul-,
 * keuzelijst- en markeervragen vult de sanering een vaste standaardopdracht in
 * ("Vul in."), en sorteer-, tabel- en stellingvragen hebben een algemene
 * opdracht. Op de opdracht alleen vielen zo geldige vragen weg als "dubbel".
 * Bij meerkeuze en dergelijke tellen de opties bewust niet mee: dezelfde vraag
 * met andere afleiders blijft een dubbele vraag.
 */
export function questionDedupeKey(q: Question): string {
  const r = q as unknown as Record<string, unknown>;
  const inhoud = textParts([r.pairs, r.items, r.categories, r.columns, r.rows, r.statements]);
  return [normText(q.prompt ?? ''), normText(str(r.text)), normText(inhoud.join('\u241f'))].join('|');
}

/**
 * Haalt uit `candidates` de vragen die al in `existing` staan of die er twee keer
 * in zitten. `dropped` is het aantal weggelaten vragen, zodat de leerkracht het
 * te horen krijgt in plaats van dat er stil vragen verdwijnen.
 */
export function dropDuplicateQuestions(
  existing: Question[],
  candidates: Question[]
): { fresh: Question[]; dropped: number } {
  const seen = new Set(existing.map(questionDedupeKey));
  const fresh: Question[] = [];
  let dropped = 0;
  for (const q of candidates) {
    const key = questionDedupeKey(q);
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    fresh.push(q);
  }
  return { fresh, dropped };
}

function sanitizeGlossary(raw: unknown): { term: string; uitleg: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((g) => {
      const gg = g as Record<string, unknown>;
      const term = str(gg?.term).trim();
      const uitleg = str(gg?.uitleg ?? gg?.explanation).trim();
      return term && uitleg ? { term, uitleg } : null;
    })
    .filter((x): x is { term: string; uitleg: string } => x !== null);
  return items.length ? items : undefined;
}

// ── Sanering per widgettype ─────────────────────────────────────────────────

/**
 * Woorden voor puzzels: geen spaties en geen diakritische tekens (de spelers
 * hebben een A-Z-klavier: "café" zou onwinbaar zijn). Nooit inkorten: een
 * afgekapt woord ("bevolkingsdicht") kan de leerling niet juist invullen.
 * Wat langer is dan MAX_PUZZLE_WORD valt bij de aanroeper weg, zie fitsPuzzle.
 */
export function puzzleWord(w: string): string {
  return w
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '');
}

/** Past het woord in het rooster? Te lange woorden laten we weg, we kappen niets af. */
function fitsPuzzle(word: string): boolean {
  return word.length <= MAX_PUZZLE_WORD;
}

function tooLongNote(words: string[], note: (msg: string) => void) {
  if (words.length === 0) return;
  const lijst = words.slice(0, 5).join(', ') + (words.length > 5 ? ` en ${words.length - 5} andere` : '');
  note(
    `${words.length === 1 ? 'Dit woord is' : 'Deze woorden zijn'} langer dan ${MAX_PUZZLE_WORD} letters en ` +
      `${words.length === 1 ? 'is' : 'zijn'} weggelaten (het rooster is er niet voor gemaakt): ${lijst}.`
  );
}

type ConfigSanitizer = (
  cfg: Record<string, unknown>,
  opts: SanitizeOptions,
  /** Meldt iets aan de leerkracht zonder de widget af te keuren. */
  note: (msg: string) => void
) => Record<string, unknown> | null;

const CONFIG_SANITIZERS: Partial<Record<WidgetTypeId, ConfigSanitizer>> = {
  quiz: (c, o) => quizFamily(c, 'single', o),
  worksheet: (c, o) => quizFamily(c, 'scroll', o),
  exitticket: (c, o) => quizFamily(c, 'single', o),
  splitworksheet: (c, o) => {
    const questions = sanitizeQuestions(c.questions, o);
    const s = (c.source && typeof c.source === 'object' ? c.source : {}) as Record<string, unknown>;
    const text = str(s.text ?? c.text);
    if (questions.length === 0 || !text.trim()) return null;
    return {
      source: { kind: 'text', title: str(s.title) || 'Bron', text },
      questions,
    };
  },
  flashcards: (c) => {
    const cards = (Array.isArray(c.cards) ? c.cards : [])
      .map((k) => {
        const kk = k as Record<string, unknown>;
        const front = str(kk?.front).trim();
        const back = str(kk?.back).trim();
        return front && back ? { id: uid(), front, back } : null;
      })
      .filter((x): x is { id: string; front: string; back: string } => x !== null);
    return cards.length ? { cards, autoFlipSec: 0 } : null;
  },
  crossword: (c, _o, note) => {
    const tooLong: string[] = [];
    const entries = (Array.isArray(c.entries) ? c.entries : [])
      .map((e) => {
        const ee = e as Record<string, unknown>;
        const word = puzzleWord(str(ee?.word));
        const clue = str(ee?.clue).trim();
        if (word.length >= 2 && clue && !fitsPuzzle(word)) {
          tooLong.push(word);
          return null;
        }
        return word.length >= 2 && clue ? { id: uid(), word, clue } : null;
      })
      .filter((x): x is { id: string; word: string; clue: string } => x !== null);
    tooLongNote(tooLong, note);
    return entries.length >= 2 ? { entries } : null;
  },
  wordsearch: (c, _o, note) => {
    const all = strArr(c.words).map(puzzleWord).filter((w) => w.length >= 3);
    tooLongNote(all.filter((w) => !fitsPuzzle(w)), note);
    const words = all.filter(fitsPuzzle);
    if (words.length < 3) return null;
    const longest = Math.max(...words.map((w) => w.length));
    return {
      words,
      size: Math.min(18, Math.max(8, Math.max(longest, Math.round(num(c.size, 12))))),
      allowDiagonal: c.allowDiagonal !== false,
      allowReverse: c.allowReverse === true,
    };
  },
  memory: (c) => {
    const pairs = (Array.isArray(c.pairs) ? c.pairs : [])
      .map((p) => {
        const pp = p as Record<string, unknown>;
        const a = str(pp?.a ?? pp?.left).trim();
        const b = str(pp?.b ?? pp?.right).trim();
        return a && b ? { id: uid(), a, b } : null;
      })
      .filter((x): x is { id: string; a: string; b: string } => x !== null);
    return pairs.length >= 2 ? { pairs: pairs.slice(0, 12) } : null;
  },
  hangman: (c) => {
    const words = (Array.isArray(c.words) ? c.words : [])
      .map((w) => {
        const ww = w as Record<string, unknown>;
        // Diakritische tekens strippen: het galgje-klavier kent alleen A-Z,
        // dus "café" of "ideeën" zou een onwinbare ronde opleveren.
        const word = str(typeof w === 'string' ? w : ww?.word)
          .trim()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '');
        return word ? { word, hint: str(ww?.hint).trim() } : null;
      })
      .filter((x): x is { word: string; hint: string } => x !== null);
    return words.length ? { words, maxErrors: 8 } : null;
  },
  pairs: (c) => {
    const pairs = (Array.isArray(c.pairs) ? c.pairs : [])
      .map((p) => {
        const pp = p as Record<string, unknown>;
        const left = str(pp?.left ?? pp?.a).trim();
        const right = str(pp?.right ?? pp?.b).trim();
        return left && right ? { id: uid(), left, right } : null;
      })
      .filter((x): x is { id: string; left: string; right: string } => x !== null);
    return pairs.length >= 2 ? { pairs } : null;
  },
  timeline: (c) => {
    const events = (Array.isArray(c.events) ? c.events : [])
      .map((e): { id: string; date: string; title: string; description?: string } | null => {
        const ee = e as Record<string, unknown>;
        const title = str(ee?.title).trim();
        const date = str(ee?.date).trim();
        return title && date ? { id: uid(), date, title, description: str(ee?.description) || undefined } : null;
      })
      .filter((x) => x !== null);
    return events.length >= 2 ? { events, mode: c.mode === 'view' ? 'view' : 'exercise' } : null;
  },
  scramble: (c) => {
    const items = (Array.isArray(c.items) ? c.items : [])
      .map((it): { id: string; text: string; hint?: string } | null => {
        const ii = it as Record<string, unknown>;
        const text = str(typeof it === 'string' ? it : ii?.text).trim();
        return text ? { id: uid(), text, hint: str(ii?.hint).trim() || undefined } : null;
      })
      .filter((x) => x !== null);
    if (!items.length) return null;
    const mode = c.mode === 'sentence' || items.some((i) => i.text.includes(' ')) ? 'sentence' : 'word';
    return { mode, items };
  },
  dictation: (c) => {
    const sentences = (Array.isArray(c.sentences) ? c.sentences : [])
      .map((sRaw): { id: string; text: string; hint?: string } | null => {
        const ss = sRaw as Record<string, unknown>;
        const text = str(typeof sRaw === 'string' ? sRaw : ss?.text).trim();
        return text ? { id: uid(), text, hint: str(ss?.hint).trim() || undefined } : null;
      })
      .filter((x) => x !== null);
    return sentences.length ? { sentences, lang: 'nl-BE', rate: 0.95 } : null;
  },
  poll: (c) => {
    const question = str(c.question).trim();
    const options = strArr(c.options);
    if (!question || options.length < 2) return null;
    return { question, options, allowMultiple: c.allowMultiple === true, showResults: true };
  },
  checklist: (c) => {
    const items = strArr(
      Array.isArray(c.items) ? c.items.map((i) => (typeof i === 'string' ? i : str((i as Record<string, unknown>)?.text))) : []
    ).map((text) => ({ id: uid(), text }));
    return items.length ? { items, title: str(c.title) || 'Checklist' } : null;
  },
  webquest: (c) => {
    const steps = (Array.isArray(c.steps) ? c.steps : [])
      .map((sRaw) => {
        const ss = sRaw as Record<string, unknown>;
        const title = str(ss?.title).trim();
        const content = str(ss?.content).trim();
        if (!title || !content) return null;
        const links = (Array.isArray(ss?.links) ? (ss.links as unknown[]) : [])
          .map((l) => {
            const ll = l as Record<string, unknown>;
            const label = str(ll?.label).trim();
            const url = str(ll?.url).trim();
            return label && /^https?:\/\//i.test(url) ? { label, url } : null;
          })
          .filter((x): x is { label: string; url: string } => x !== null);
        return { id: uid(), title, content, links };
      })
      .filter((x): x is { id: string; title: string; content: string; links: { label: string; url: string }[] } => x !== null);
    return steps.length ? { steps } : null;
  },
  mindmap: (c) => {
    const root = str(c.root).trim();
    const outline = str(c.outline);
    return root && outline.trim() ? { root, outline, studentEditable: c.studentEditable !== false } : null;
  },
  planner: (c) => {
    const sections = (Array.isArray(c.sections) ? c.sections : [])
      .map((sRaw) => {
        const ss = sRaw as Record<string, unknown>;
        const title = str(ss?.title).trim();
        const tasks = strArr(
          Array.isArray(ss?.tasks)
            ? (ss.tasks as unknown[]).map((t) => (typeof t === 'string' ? t : str((t as Record<string, unknown>)?.text)))
            : []
        ).map((text) => ({ id: uid(), text }));
        return title && tasks.length ? { id: uid(), title, tasks } : null;
      })
      .filter((x): x is { id: string; title: string; tasks: { id: string; text: string }[] } => x !== null);
    return sections.length ? { title: str(c.title) || 'Planner', sections } : null;
  },
  bingo: (c) => {
    const items = strArr(c.items);
    const size = ([3, 4, 5] as const).find((n) => n === Math.round(num(c.size, 4))) ?? 4;
    return items.length >= size * size ? { items, size, freeCenter: false } : items.length >= 9 ? { items, size: 3, freeCenter: false } : null;
  },
  spinner: (c) => {
    const items = strArr(c.items);
    return items.length >= 2 ? { items, removeAfterSpin: false } : null;
  },
};

function quizFamily(
  c: Record<string, unknown>,
  layout: 'single' | 'scroll',
  opts?: SanitizeOptions
): Record<string, unknown> | null {
  const questions = sanitizeQuestions(c.questions, opts);
  if (questions.length === 0) return null;
  const cfg: QuizConfig = {
    questions,
    layout: c.layout === 'scroll' || c.layout === 'single' ? (c.layout as 'single' | 'scroll') : layout,
    glossary: sanitizeGlossary(c.glossary),
  };
  if (questions.some((q) => q.level)) cfg.useRoutes = false; // leerkracht zet dit bewust zelf aan
  return cfg as unknown as Record<string, unknown>;
}

// ── Envelop → widgets ───────────────────────────────────────────────────────

export interface GeneratedResult {
  widgets: Widget[];
  warnings: string[];
}

/**
 * Wat de AI-studio bij één gevraagde soort in de voorvertoning toont als er iets
 * te herstellen valt: de tekst voor de kaart met "Opnieuw proberen", of null als
 * er niets aan de hand is. Naast een mislukte soort geldt dat ook voor een
 * geannuleerde, een die opnieuw geprobeerd wordt, en een soort waarvan de
 * sanering alles weggooide (status "klaar" met nul widgets).
 */
export function typeRetryNote(status: BatchItemStatus | undefined, widgetCount: number, error?: string): string | null {
  switch (status) {
    case 'mislukt': return error || 'Deze soort kon niet gemaakt worden.';
    case 'geannuleerd': return 'Geannuleerd.';
    case 'bezig': return 'Wordt opnieuw geprobeerd…';
    case 'klaar': return widgetCount === 0 ? 'Niets bruikbaars opgeleverd.' : null;
    default: return null;
  }
}

/**
 * Zet de JSON-envelop van de AI om naar échte, opslaanbare widgets.
 * Ongeldige onderdelen worden overgeslagen met een leesbare waarschuwing.
 */
export function sanitizeGeneratedWidgets(raw: unknown, opts: SanitizeOptions = {}): GeneratedResult {
  const warnings: string[] = [];
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).widgets)
      ? ((raw as Record<string, unknown>).widgets as unknown[])
      : null;
  if (!list) {
    return { widgets: [], warnings: ['De AI gaf geen widgetlijst terug in het verwachte formaat.'] };
  }
  const widgets: Widget[] = [];
  for (const item of list) {
    const w = item as Record<string, unknown> | null;
    if (!w || typeof w !== 'object') continue;
    const type = str(w.type);
    if (!isGenType(type)) {
      warnings.push(`Widgettype "${type || '?'}" wordt niet ondersteund en is overgeslagen.`);
      continue;
    }
    const rawCfg = (w.config && typeof w.config === 'object' ? w.config : {}) as Record<string, unknown>;
    const sanitizer = CONFIG_SANITIZERS[type];
    const cfg = sanitizer ? sanitizer(rawCfg, opts, (msg) => warnings.push(msg)) : null;
    if (!cfg) {
      // De soortnaam staat tussen aanhalingstekens: zo is er geen lidwoord nodig
      // (het is "de quiz" maar "het werkblad" en "het galgje").
      warnings.push(`De inhoud van “${getTypeDef(type).name}” was onvolledig en is overgeslagen.`);
      continue;
    }
    const widget = createWidget(type, str(w.title).trim() || getTypeDef(type).name);
    widget.config = { ...(getTypeDef(type).defaultConfig() as Record<string, unknown>), ...cfg };
    widgets.push(widget);
  }
  if (widgets.length === 0 && warnings.length === 0) {
    warnings.push('De AI leverde geen bruikbare widgets op. Probeer het opnieuw met een duidelijkere opdracht.');
  }
  return { widgets, warnings };
}
