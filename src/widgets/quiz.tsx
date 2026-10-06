import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight, ArrowRight, ArrowUpDown, BookOpen, ChevronDown, ChevronRight, CircleDot,
  ClipboardPaste, Compass, Database, Dices, Dumbbell, Eraser, Globe, Hash, HelpCircle,
  type LucideIcon, Mic, NotebookPen, Palette, Pencil, PenLine, Puzzle, Save, Scale,
  SlidersHorizontal, Square, SquareCheck, Volume2,
} from 'lucide-react';
import type {
  GapQuestion, LongAnswerValue, MatchQuestion, MCQuestion, MultiQuestion, NumberQuestion,
  OrderQuestion, Question, QuestionType, QuizConfig, ShortQuestion, SliderQuestion,
  TFQuestion, LongQuestion,
} from '../lib/types';
import { extractGaps, gradeQuestion, gradeQuiz, matchChoiceCorrect, splitGapText } from '../lib/grading';
import { normalizeAnswer, shuffled, shuffledNotIdentity, uid } from '../lib/utils';
import { Field, ImagePicker, Modal, useToast } from '../components/ui';
import {
  BackIcon, CheckIcon, CloseIcon, DeleteIcon, GoalIcon, InfoIcon, LinkIcon, MoveDownIcon,
  MoveUpIcon, RetryIcon, TipIcon, WarningIcon,
} from '../components/icons';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';
import { clearProgress, loadProgress, saveProgress } from '../lib/autosave';
import { getWidgets } from '../lib/storage';
import { allGoalOptions, findGoalByCode } from '../lib/curriculum';
import { loadA11y } from '../components/A11yMenu';
import type { Widget } from '../lib/types';
import { EXTRA_QTYPES, extraQType } from './qtypes';

// ── Voorlezen (tekst-naar-spraak) met meeleesmarkering ──────────────────────

/**
 * Leest de vraag voor; tijdens het voorlezen van de vraagstam wordt het
 * uitgesproken woord gemarkeerd (boundary-events), zodat oog en oor koppelen.
 */
function speakQuestion(q: Question, onWord?: (range: [number, number] | null) => void) {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const rate = loadA11y().rate;
  const rest: string[] = [];
  if (q.type === 'gap') rest.push(q.text.replace(/\[([^\]]+)\]/g, ' … '));
  if (q.type === 'mc' || q.type === 'multi') {
    q.options.forEach((o, i) => rest.push(`Optie ${String.fromCharCode(65 + i)}: ${o}`));
  }
  const extraTts = extraQType(q.type)?.tts;
  if (extraTts) rest.push(...extraTts(q));
  if (q.type === 'tf') rest.push('Juist, of onjuist?');
  if (q.type === 'order') rest.push(...q.items);

  const main = q.prompt ?? '';
  if (main.trim()) {
    const u = new SpeechSynthesisUtterance(main);
    u.lang = 'nl-BE';
    u.rate = rate;
    if (onWord) {
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        const start = e.charIndex ?? 0;
        let end = main.length;
        for (let i = start; i < main.length; i++) {
          if (/\s/.test(main[i])) { end = i; break; }
        }
        if (end > start) onWord([start, end]);
      };
      u.onend = () => onWord(null);
      u.onerror = () => onWord(null);
    }
    speechSynthesis.speak(u);
  }
  for (const part of rest.filter((t) => t.trim())) {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = 'nl-BE';
    u.rate = rate;
    speechSynthesis.speak(u);
  }
}

// ── Vraagstam met meeleesmarkering en klikbaar glossarium ───────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface GlossaryEntry { term: string; uitleg: string }

function PromptText({
  text, spoken, glossary,
}: { text: string; spoken: [number, number] | null; glossary?: GlossaryEntry[] }) {
  const [openTerm, setOpenTerm] = useState<GlossaryEntry | null>(null);
  if (!text) return null;

  let content: React.ReactNode = text;
  if (spoken) {
    // tijdens het voorlezen: gemarkeerd meelezen
    content = (
      <>
        {text.slice(0, spoken[0])}
        <mark style={{
          background: 'color-mix(in srgb, var(--player-accent, var(--brand)) 28%, transparent)',
          color: 'inherit', borderRadius: 4, padding: '0 2px',
        }}>
          {text.slice(spoken[0], spoken[1])}
        </mark>
        {text.slice(spoken[1])}
      </>
    );
  } else {
    const valid = (glossary ?? []).filter((g) => g.term.trim() && g.uitleg.trim());
    if (valid.length > 0) {
      const pattern = valid
        .map((g) => g.term.trim())
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex)
        .join('|');
      // woordgrenzen (unicode-veilig): "arm" mag niet midden in "warm" matchen
      let parts: string[];
      try {
        parts = text.split(new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'giu'));
      } catch {
        parts = [text]; // oude browser zonder lookbehind → geen glossarium-markering
      }
      content = parts.map((part, i) => {
        const hit = valid.find((g) => g.term.trim().toLowerCase() === part.toLowerCase());
        if (!hit) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpenTerm(openTerm === hit ? null : hit)}
            aria-label={`Uitleg bij "${hit.term}"`}
            style={{
              font: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'inherit',
              textDecoration: 'underline dotted 2px',
              textDecorationColor: 'var(--player-accent, var(--brand))',
              textUnderlineOffset: 3,
            }}
          >
            {part}
          </button>
        );
      });
    }
  }

  return (
    <div className="question-prompt">
      {content}
      {openTerm && (
        <span
          role="note"
          style={{
            display: 'block', fontSize: '0.85rem', fontWeight: 500,
            background: 'var(--brand-soft)', borderRadius: 8, padding: '6px 10px', marginTop: 8,
          }}
        >
          <InfoIcon size={16} className="icon-inline" aria-hidden /> <strong>{openTerm.term}:</strong> {openTerm.uitleg}
          <button
            className="btn btn-quiet btn-sm"
            style={{ minHeight: 22, padding: '0 6px', marginLeft: 6 }}
            onClick={() => setOpenTerm(null)}
            aria-label="Uitleg sluiten"
          >
            <CloseIcon size={14} aria-hidden />
          </button>
        </span>
      )}
    </div>
  );
}

/** Effectieve hintladder van een vraag (nieuw hints-veld met terugval op hint). */
export function questionHints(q: Question): string[] {
  const ladder = (q.hints ?? []).map((h) => h.trim()).filter(Boolean);
  if (ladder.length > 0) return ladder;
  return q.hint?.trim() ? [q.hint.trim()] : [];
}

/**
 * Hintladder zoals de editor ze toont: de ruwe lijst, met lege en half
 * getypte hints erbij. questionHints() snoeit en filtert (voor de speler);
 * de editor daarop laten werken maakte een nieuwe, lege hint onzichtbaar en
 * at elke spatie op die je aan het eind typte.
 */
export function editorHints(q: Question): string[] {
  if (Array.isArray(q.hints) && q.hints.length > 0) return q.hints;
  return q.hint ? [q.hint] : [];
}

/** Zinnen met hun tekstposities, voor zin-per-zin voorlezen. */
function splitSentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /[^.!?…\n]+[.!?…]*\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmedLen = raw.trimEnd().length;
    if (trimmedLen > 0) out.push({ start: m.index, end: m.index + trimmedLen });
  }
  return out;
}

// ── Accenttekens voor taalvakken ────────────────────────────────────────────

const ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'ü', 'ñ'];

function AccentBar({ onInsert }: { onInsert: (ch: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }} role="toolbar" aria-label="Speciale tekens invoegen">
      {ACCENTS.map((ch) => (
        <button
          key={ch}
          type="button"
          className="btn btn-quiet btn-sm"
          style={{ minWidth: 44, minHeight: 44, padding: '2px 6px', fontSize: '1.05rem' }}
          onClick={() => onInsert(ch)}
          aria-label={`Teken ${ch} invoegen`}
          tabIndex={-1}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

// ── Vraagtype-metadata ──────────────────────────────────────────────────────

export const QUESTION_TYPES: { type: QuestionType; name: string; icon: LucideIcon; desc: string }[] = [
  { type: 'mc', name: 'Meerkeuze', icon: CircleDot, desc: 'Eén juist antwoord' },
  { type: 'multi', name: 'Meerdere antwoorden', icon: SquareCheck, desc: 'Meerdere juiste antwoorden' },
  { type: 'tf', name: 'Juist of onjuist', icon: Scale, desc: 'Stelling beoordelen' },
  { type: 'short', name: 'Kort antwoord', icon: PenLine, desc: 'Woord of korte zin typen' },
  { type: 'long', name: 'Open vraag', icon: NotebookPen, desc: 'Lang antwoord, manueel beoordeeld' },
  { type: 'gap', name: 'Invuloefening', icon: Puzzle, desc: 'Gaten in een tekst invullen' },
  { type: 'match', name: 'Koppelen', icon: LinkIcon, desc: 'Paren bij elkaar zoeken' },
  { type: 'order', name: 'Rangschikken', icon: ArrowUpDown, desc: 'Items in juiste volgorde slepen' },
  { type: 'number', name: 'Getal', icon: Hash, desc: 'Numeriek antwoord met tolerantie' },
  { type: 'slider', name: 'Schuiver', icon: SlidersHorizontal, desc: 'Waarde op een schaal kiezen' },
  { type: 'info', name: 'Infoblok', icon: InfoIcon, desc: 'Tekst of afbeelding zonder vraag' },
  // uitgebreide types uit src/widgets/qtypes/
  ...Object.values(EXTRA_QTYPES).map((t) => ({ type: t.type, name: t.name, icon: t.icon, desc: t.desc })),
];

export function makeQuestion(type: QuestionType): Question {
  const base = { id: uid(), prompt: '', points: 1, explanation: '' };
  const extra = extraQType(type);
  if (extra) return { explanation: '', ...extra.make(base) };
  switch (type) {
    case 'mc': return { ...base, type, options: ['', ''], correctIndex: 0 };
    case 'multi': return { ...base, type, options: ['', '', ''], correctIndices: [] };
    case 'tf': return { ...base, type, answer: true };
    case 'short': return { ...base, type, accepted: [''], caseSensitive: false };
    case 'long': return { ...base, type, modelAnswer: '' };
    case 'gap': return { ...base, type, text: '' };
    case 'match': return { ...base, type, pairs: [{ left: '', right: '' }, { left: '', right: '' }] };
    case 'order': return { ...base, type, items: ['', '', ''] };
    case 'number': return { ...base, type, answer: 0, tolerance: 0 };
    case 'slider': return { ...base, type, min: 0, max: 100, step: 1, answer: 50, tolerance: 0 };
    case 'info': return { ...base, type, points: 0 };
    default: throw new Error('Onbekend vraagtype: ' + type);
  }
}

export function questionLabel(q: Question): string {
  const meta = QUESTION_TYPES.find((t) => t.type === q.type)!;
  const text = q.type === 'gap' ? (q as GapQuestion).text : q.prompt;
  return `${meta.name}${text ? ' — ' + text.slice(0, 60) : ''}`;
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

/**
 * Getal uit een editorveld lezen: komma of punt als decimaalteken, spaties
 * rond het getal mogen. Null als er (nog) geen eindig getal staat ("", "-",
 * ","). Gebruikt door NumberField.
 */
export function parseNumberInput(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

type NumberFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number;
  onChange: (n: number) => void;
  /** Kleinere waarden worden opgetrokken tot dit minimum (bv. 0 voor een tolerantie). */
  min?: number;
  max?: number;
  /** Extra voorwaarde; een getal dat ze niet haalt, wordt niet bewaard (bv. stap > 0). */
  allow?: (n: number) => boolean;
};

/**
 * Getalveld voor de editor met eigen teksttoestand. Een gewoon
 * `type="number"`-veld met `parseFloat(v) || 0` maakte van "-5" een 5 (het
 * minteken alleen werd 0 en daarna kwam de 5) en van "2,5" soms 25. Hier
 * blijft wat je typt staan, en wordt alleen een eindig getal bewaard; bij
 * het verlaten van het veld toont het weer de bewaarde waarde. Mogen
 * negatieve getallen (geen minimum, of een minimum onder 0), dan krijgt het
 * veld het gewone toetsenbord: het decimale toetsenbord van iPad en iPhone
 * heeft geen minteken. Exporteerbaar voor andere editors (bv. rekenen).
 */
export function NumberField({ value, onChange, min, max, allow, onBlur, ...rest }: NumberFieldProps) {
  const show = (n: number) => (Number.isFinite(n) ? String(n) : '');
  const [text, setText] = useState(() => show(value));
  const committed = useRef(value);

  // waarde van buitenaf gewijzigd (andere vraag, ongedaan maken): tekst volgen
  useEffect(() => {
    if (!Object.is(value, committed.current)) {
      committed.current = value;
      setText(show(value));
    }
  }, [value]);

  const resolve = (raw: string): number | null => {
    const n = parseNumberInput(raw);
    if (n === null || (allow && !allow(n))) return null;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  // ongeldig: geen getal, geweigerd, of buiten de grenzen (dan wordt de grens bewaard)
  const typed = parseNumberInput(text);
  const invalid = typed === null || !Object.is(resolve(text), typed);
  const allowsNegative = min === undefined || min < 0;

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowsNegative ? 'text' : 'decimal'}
      autoComplete="off"
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const v = resolve(raw);
        if (v !== null && !Object.is(v, committed.current)) {
          committed.current = v;
          onChange(v);
        }
      }}
      onBlur={(e) => {
        // onvolledige, geweigerde of afgetopte invoer ("-", "", stap 0, tolerantie -1):
        // terug naar wat echt bewaard is; "2,50" blijft gewoon staan
        const shown = parseNumberInput(text);
        if (shown === null || !Object.is(shown, committed.current)) setText(show(committed.current));
        onBlur?.(e);
      }}
    />
  );
}

/** Sleutel van een meerkeuzevraag zonder juist antwoord (bv. na het verwijderen ervan). */
export const NO_CORRECT_INDEX = -1;

/**
 * Optie `i` verwijderen en de sleutel laten meeschuiven, zodat die naar
 * dezelfde tekst blijft wijzen. Verwijder je het juiste antwoord zelf, dan is
 * er geen juist antwoord meer (-1 bij één juist, weg uit de lijst bij
 * meerdere): nooit stil een andere optie juist maken. De linter meldt dan
 * "Geen juist antwoord aangeduid".
 */
export function removeOptionAt(
  options: readonly string[], correct: number | readonly number[], i: number,
): { options: string[]; correct: number | number[] } {
  const next = options.filter((_, j) => j !== i);
  if (typeof correct === 'number') {
    const c = correct === i ? NO_CORRECT_INDEX : correct > i ? correct - 1 : correct;
    return { options: next, correct: c };
  }
  const cs = [...new Set(correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)))].sort((a, b) => a - b);
  return { options: next, correct: cs };
}

function OptionListEditor({
  options, correct, correctMode, onChange,
}: {
  options: string[];
  correct: number | number[];
  correctMode: 'single' | 'multi';
  /**
   * Opties en sleutel altijd samen doorgeven: twee losse onChange-aanroepen
   * op dezelfde (verouderde) vraag overschrijven elkaar, en dan verwijderde
   * "Optie verwijderen" niets en verschoof de sleutel stil.
   */
  onChange: (options: string[], correct: number | number[]) => void;
}) {
  const correctList = correctMode === 'single' ? [] : (Array.isArray(correct) ? correct : []);
  const noneCorrect = correctMode === 'single'
    ? !(typeof correct === 'number' && correct >= 0 && correct < options.length)
    : correctList.length === 0;
  return (
    <div>
      {options.map((opt, i) => {
        const isCorrect = correctMode === 'single' ? correct === i : correctList.includes(i);
        return (
          <div className="option-row" key={i}>
            <input
              type={correctMode === 'single' ? 'radio' : 'checkbox'}
              checked={isCorrect}
              aria-label={`Antwoord ${i + 1} is juist`}
              title="Markeer als juist antwoord"
              style={{ width: 18, height: 18, accentColor: 'var(--ok)' }}
              onChange={(e) => {
                if (correctMode === 'single') onChange(options, i);
                else {
                  const cur = new Set(correctList);
                  if (e.target.checked) cur.add(i); else cur.delete(i);
                  onChange(options, [...cur].sort((a, b) => a - b));
                }
              }}
            />
            <input
              className="input input-sm"
              value={opt}
              placeholder={`Antwoordoptie ${i + 1}`}
              aria-label={`Antwoordoptie ${i + 1}`}
              onChange={(e) => {
                const next = options.slice();
                next[i] = e.target.value;
                onChange(next, correct);
              }}
            />
            <button
              className="btn btn-quiet btn-icon btn-sm"
              aria-label={`Optie ${i + 1} verwijderen`}
              title="Optie verwijderen"
              disabled={options.length <= 2}
              onClick={() => {
                const key = correctMode === 'single'
                  ? (typeof correct === 'number' ? correct : NO_CORRECT_INDEX) // oude data zonder sleutel
                  : correctList;
                const r = removeOptionAt(options, key, i);
                onChange(r.options, r.correct);
              }}
            ><CloseIcon size={16} aria-hidden /></button>
          </div>
        );
      })}
      <button className="btn btn-sm btn-ghost" onClick={() => onChange([...options, ''], correct)}>+ Optie toevoegen</button>
      <p className="hint" style={{ marginTop: 6 }}>
        {correctMode === 'single' ? 'Vink het juiste antwoord aan.' : 'Vink alle juiste antwoorden aan.'}
      </p>
      {noneCorrect && (
        <p className="hint" role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
          <WarningIcon size={16} className="icon-inline" aria-hidden /> Nog geen juist antwoord aangeduid.
        </p>
      )}
    </div>
  );
}

function QuestionBodyEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  switch (q.type) {
    case 'mc':
      return (
        <OptionListEditor
          options={q.options}
          correct={q.correctIndex}
          correctMode="single"
          onChange={(options, correct) => onChange({ ...q, options, correctIndex: correct as number })}
        />
      );
    case 'multi':
      return (
        <OptionListEditor
          options={q.options}
          correct={q.correctIndices ?? []}
          correctMode="multi"
          onChange={(options, correct) => onChange({ ...q, options, correctIndices: correct as number[] })}
        />
      );
    case 'tf':
      return (
        <Field label="Juiste antwoord">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${q.answer ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...q, answer: true })}>Juist</button>
            <button className={`btn btn-sm ${!q.answer ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...q, answer: false })}>Onjuist</button>
          </div>
        </Field>
      );
    case 'short':
      return (
        <>
          <Field label="Juiste antwoorden" hint="Elk aanvaard antwoord op een eigen regel.">
            <textarea
              className="textarea"
              rows={2}
              value={q.accepted.join('\n')}
              onChange={(e) => onChange({ ...q, accepted: e.target.value.split('\n') })}
            />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={q.caseSensitive} onChange={(e) => onChange({ ...q, caseSensitive: e.target.checked })} />
            <span>Hoofdlettergevoelig</span>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={q.accentSensitive ?? false}
              onChange={(e) => onChange({ ...q, accentSensitive: e.target.checked || undefined })} />
            <span>Accenten tellen mee <span className="hint">(standaard is "cafe" ook goed voor "café")</span></span>
          </label>
        </>
      );
    case 'long':
      return (
        <>
          <Field label="Modelantwoord (alleen zichtbaar voor jou)" hint="Open vragen beoordeel je achteraf zelf bij de resultaten.">
            <textarea className="textarea" rows={3} value={q.modelAnswer ?? ''} onChange={(e) => onChange({ ...q, modelAnswer: e.target.value })} />
          </Field>
          <Field
            label="Beoordelingsrubric (optioneel)"
            hint="Criteria met punten. De leerling ziet ze vóór het antwoorden (succescriteria), jij scoort er per criterium mee bij het verbeteren."
          >
            <div>
              {(q.rubric ?? []).map((r, ri) => (
                <div className="option-row" key={ri}>
                  <input className="input input-sm" placeholder={`Criterium ${ri + 1}, bv. "Gebruikt minstens 2 argumenten"`} value={r.criterion}
                    onChange={(e) => {
                      const rubric = (q.rubric ?? []).slice();
                      rubric[ri] = { ...r, criterion: e.target.value };
                      onChange({ ...q, rubric });
                    }} />
                  <NumberField className="input input-sm" min={0} style={{ maxWidth: 80 }} value={r.points}
                    aria-label="Punten voor dit criterium"
                    onChange={(points) => {
                      const rubric = (q.rubric ?? []).slice();
                      rubric[ri] = { ...r, points };
                      onChange({ ...q, rubric });
                    }} />
                  <button className="btn btn-quiet btn-icon btn-sm" aria-label="Criterium verwijderen"
                    onClick={() => onChange({ ...q, rubric: (q.rubric ?? []).filter((_, j) => j !== ri) })}><CloseIcon size={16} aria-hidden /></button>
                </div>
              ))}
              <button className="btn btn-sm btn-ghost"
                onClick={() => onChange({ ...q, rubric: [...(q.rubric ?? []), { criterion: '', points: 1 }] })}>
                + Criterium toevoegen
              </button>
              {(q.rubric?.length ?? 0) > 0 && (
                <p className="hint" style={{ marginTop: 6 }}>
                  Som van de criteria: {(q.rubric ?? []).reduce((a, r) => a + r.points, 0)} punten
                  {(q.rubric ?? []).reduce((a, r) => a + r.points, 0) !== q.points && ` — pas eventueel de punten van de vraag (${q.points}) aan.`}
                </p>
              )}
            </div>
          </Field>
        </>
      );
    case 'gap':
      return (
        <Field
          label="Tekst met gaten"
          hint="Zet de in te vullen woorden tussen [vierkante haken]. Alternatieven scheid je met |, bv.: De hoofdstad van België is [Brussel|Bruxelles]."
        >
          <textarea className="textarea" rows={3} value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
          {q.text && (
            <p className="hint">Gaten gevonden: {extractGaps(q.text).length}</p>
          )}
        </Field>
      );
    case 'match':
      return (
        <div>
          {q.pairs.map((p, i) => (
            <div className="option-row" key={i}>
              <input className="input input-sm" placeholder="Links" value={p.left}
                onChange={(e) => { const pairs = q.pairs.slice(); pairs[i] = { ...p, left: e.target.value }; onChange({ ...q, pairs }); }} />
              <ArrowLeftRight size={16} aria-hidden />
              <input className="input input-sm" placeholder="Rechts (hoort bij links)" value={p.right}
                onChange={(e) => { const pairs = q.pairs.slice(); pairs[i] = { ...p, right: e.target.value }; onChange({ ...q, pairs }); }} />
              <button className="btn btn-quiet btn-icon btn-sm" aria-label="Paar verwijderen" disabled={q.pairs.length <= 2}
                onClick={() => onChange({ ...q, pairs: q.pairs.filter((_, j) => j !== i) })}><CloseIcon size={16} aria-hidden /></button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...q, pairs: [...q.pairs, { left: '', right: '' }] })}>+ Paar toevoegen</button>
        </div>
      );
    case 'order':
      return (
        <div>
          <p className="hint" style={{ marginBottom: 8 }}>Zet de items hier in de <strong>juiste</strong> volgorde. De leerling krijgt ze geschud te zien.</p>
          {q.items.map((it, i) => (
            <div className="option-row" key={i}>
              <span className="badge">{i + 1}</span>
              <input className="input input-sm" value={it} placeholder={`Item ${i + 1}`}
                onChange={(e) => { const items = q.items.slice(); items[i] = e.target.value; onChange({ ...q, items }); }} />
              <button className="btn btn-quiet btn-icon btn-sm" aria-label="Item verwijderen" disabled={q.items.length <= 2}
                onClick={() => onChange({ ...q, items: q.items.filter((_, j) => j !== i) })}><CloseIcon size={16} aria-hidden /></button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...q, items: [...q.items, ''] })}>+ Item toevoegen</button>
        </div>
      );
    case 'number':
      return (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Juiste antwoord" hint="Negatief of met komma mag, bv. -5 of 2,5.">
            <NumberField className="input input-sm" value={q.answer} style={{ maxWidth: 160 }}
              onChange={(answer) => onChange({ ...q, answer })} />
          </Field>
          <Field label="Tolerantie (±)" hint="0 = exact">
            <NumberField className="input input-sm" value={q.tolerance ?? 0} min={0} style={{ maxWidth: 160 }}
              onChange={(tolerance) => onChange({ ...q, tolerance })} />
          </Field>
        </div>
      );
    case 'slider':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
          <Field label="Minimum"><NumberField className="input input-sm" value={q.min} onChange={(min) => onChange({ ...q, min })} /></Field>
          <Field label="Maximum"><NumberField className="input input-sm" value={q.max} onChange={(max) => onChange({ ...q, max })} /></Field>
          <Field label="Stap"><NumberField className="input input-sm" value={q.step} min={0} allow={(n) => n > 0} onChange={(step) => onChange({ ...q, step })} /></Field>
          <Field label="Juiste waarde"><NumberField className="input input-sm" value={q.answer} onChange={(answer) => onChange({ ...q, answer })} /></Field>
          <Field label="Tolerantie (±)"><NumberField className="input input-sm" value={q.tolerance ?? 0} min={0} onChange={(tolerance) => onChange({ ...q, tolerance })} /></Field>
        </div>
      );
    case 'info':
      return <p className="hint">Een infoblok toont alleen de tekst/afbeelding hierboven. Handig voor instructies of een leestekst.</p>;
    default: {
      const extra = extraQType(q.type);
      if (extra) { const E = extra.Editor; return <E q={q} onChange={onChange} />; }
      return null;
    }
  }
}

/**
 * Bulk-import: "? vraag" / "* juiste optie" / "- foute optie" / "= juist kort
 * antwoord". De opties blijven in de getypte volgorde: wie altijd "* juist"
 * bovenaan zette, kreeg anders elke vraag met het juiste antwoord op A.
 */
export function parseBulkQuestions(text: string): Question[] {
  const out: Question[] = [];
  let current: { prompt: string; options: { text: string; correct: boolean }[]; short: string[] } | null = null;
  const flush = () => {
    if (!current || !current.prompt.trim()) { current = null; return; }
    const base = { id: uid(), prompt: current.prompt.trim(), points: 1, explanation: '' };
    const options = current.options.map((o) => o.text);
    const correct = current.options.flatMap((o, i) => (o.correct ? [i] : []));
    if (current.short.length > 0) {
      out.push({ ...base, type: 'short', accepted: current.short, caseSensitive: false });
    } else if (correct.length === 1) {
      out.push({ ...base, type: 'mc', options, correctIndex: correct[0] });
    } else if (correct.length > 1) {
      out.push({ ...base, type: 'multi', options, correctIndices: correct });
    } else {
      out.push({ ...base, type: 'long', modelAnswer: '' });
    }
    current = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('? ')) { flush(); current = { prompt: line.slice(2), options: [], short: [] }; }
    else if (line.startsWith('* ') && current) current.options.push({ text: line.slice(2).trim(), correct: true });
    else if (line.startsWith('- ') && current) current.options.push({ text: line.slice(2).trim(), correct: false });
    else if (line.startsWith('= ') && current) current.short.push(line.slice(2).trim());
    else if (line && current && current.options.length === 0 && current.short.length === 0) {
      current.prompt += '\n' + line; // meerregelige vraag
    }
  }
  flush();
  return out;
}

const QUIZ_FAMILY_TYPES = new Set(['quiz', 'worksheet', 'exitticket']);

function QuestionBankModal({ onImport, onClose }: { onImport: (qs: Question[]) => void; onClose: () => void }) {
  const sources = getWidgets().filter((w) => QUIZ_FAMILY_TYPES.has(w.type) && (w.config as QuizConfig).questions?.length > 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openWidget, setOpenWidget] = useState<string | null>(sources[0]?.id ?? null);

  const allQuestions = new Map<string, { q: Question; widget: Widget }>();
  for (const w of sources) {
    for (const q of (w.config as QuizConfig).questions) allQuestions.set(`${w.id}:${q.id}`, { q, widget: w });
  }

  return (
    <Modal
      title="Vragen importeren uit je andere widgets"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button
            className="btn btn-primary"
            disabled={selected.size === 0}
            onClick={() => {
              const imported = [...selected]
                .map((key) => allQuestions.get(key))
                .filter((x): x is { q: Question; widget: Widget } => !!x)
                .map(({ q }) => {
                  const copy = JSON.parse(JSON.stringify(q)) as Question;
                  copy.id = uid();
                  return copy;
                });
              onImport(imported);
              onClose();
            }}
          >
            {selected.size} {selected.size === 1 ? 'vraag' : 'vragen'} importeren
          </button>
        </>
      }
    >
      {sources.length === 0 ? (
        <p style={{ color: 'var(--text-soft)' }}>Je hebt nog geen andere quizzen, werkbladen of exit-tickets met vragen.</p>
      ) : (
        sources.map((w) => {
          const qs = (w.config as QuizConfig).questions;
          const isOpen = openWidget === w.id;
          return (
            <div key={w.id} style={{ marginBottom: 8 }}>
              <button
                className="btn btn-quiet"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                aria-expanded={isOpen}
                onClick={() => setOpenWidget(isOpen ? null : w.id)}
              >
                {isOpen ? <ChevronDown size={16} className="icon-inline" aria-hidden /> : <ChevronRight size={16} className="icon-inline" aria-hidden />} <strong>{w.title}</strong>
                <span className="hint" style={{ marginLeft: 'auto' }}>{qs.length} vragen</span>
              </button>
              {isOpen && (
                <div style={{ paddingLeft: 14 }}>
                  {qs.map((q) => {
                    const key = `${w.id}:${q.id}`;
                    return (
                      <label className="checkbox-row" key={key} style={{ fontSize: '0.9rem' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(key); else next.delete(key);
                            setSelected(next);
                          }}
                        />
                        <span>{questionLabel(q)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </Modal>
  );
}

function BulkImportModal({ onImport, onClose }: { onImport: (qs: Question[]) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseBulkQuestions(text), [text]);
  return (
    <Modal
      title="Vragen plakken (bulk-import)"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={parsed.length === 0}
            onClick={() => { onImport(parsed); onClose(); }}>
            {parsed.length} {parsed.length === 1 ? 'vraag' : 'vragen'} toevoegen
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 8 }}>
        Plak vragen als tekst — handig vanuit Word of een AI-hulpmiddel. Formaat:
        {' '}<code>?</code> vraag · <code>*</code> juiste optie · <code>-</code> foute optie · <code>=</code> juist kort antwoord.
        Zonder opties wordt het een open vraag. De opties blijven in de volgorde waarin je ze typt.
      </p>
      <textarea
        className="textarea" rows={10}
        placeholder={'? Wat is de hoofdstad van Frankrijk?\n- Lyon\n* Parijs\n- Marseille\n\n? 12 x 12 =\n= 144'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ fontFamily: 'monospace' }}
      />
      <p className="hint" style={{ marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }} aria-live="polite">
        {parsed.length > 0
          ? <><CheckIcon size={16} className="icon-inline" aria-hidden /> {parsed.length} {parsed.length === 1 ? 'vraag' : 'vragen'} herkend: {parsed.map((q) => QUESTION_TYPES.find((t) => t.type === q.type)?.name).join(', ')}</>
          : 'Nog geen vragen herkend.'}
      </p>
    </Modal>
  );
}

/** "De leerlingen kunnen …" afkappen voor een keuzelijst. */
function shortGoalText(text: string, max = 70): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Leerplandoel per vraag: een code uit je leerplannen (lib/curriculum.ts).
 * Leeg mag altijd — het vrije doelveld ernaast blijft even goed werken. Staat
 * er een bekende code, dan tonen we de doeltekst eronder, zodat je ziet dát
 * het de juiste is; een onbekende code krijgt een zichtbare melding (niet
 * alleen een kleur).
 */
function GoalCodeField({ value, hasOptions, onChange }: {
  value: string;
  hasOptions: boolean;
  onChange: (code: string) => void;
}) {
  const hit = value.trim() ? findGoalByCode(value) : undefined;
  return (
    <Field
      label="Leerplandoel (optioneel)"
      hint={hasOptions
        ? 'Kies een code uit je leerplan; de score per doel loopt hierlangs.'
        : 'Nog geen leerplan op dit toestel — je mag een code vrij intypen.'}
    >
      <div>
        <input
          className="input input-sm"
          list="wf-goalcodes"
          value={value}
          placeholder='bv. "NW 2.3"'
          aria-label="Leerplandoel: code uit je leerplan"
          style={{ minWidth: 220 }}
          onChange={(e) => onChange(e.target.value)}
        />
        {value.trim() !== '' && (
          <span className="hint" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 3 }}>
            {hit
              ? <><CheckIcon size={16} className="icon-inline" aria-hidden /> {shortGoalText(hit.goal.text, 90)}</>
              : <><WarningIcon size={16} className="icon-inline" aria-hidden /> Deze code staat in geen enkel leerplan op dit toestel.</>}
          </span>
        )}
      </div>
    </Field>
  );
}

export function QuizEditor({ config, onChange }: EditorProps<QuizConfig>) {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState<'bank' | 'bulk' | null>(null);
  const toast = useToast();
  const qs = config.questions;
  // Alle doelen uit alle leerplannen op dit toestel; leeg als er nog geen is.
  const goalOptions = useMemo(() => allGoalOptions(), []);

  const update = (i: number, q: Question) => {
    const questions = qs.slice();
    questions[i] = q;
    onChange({ ...config, questions });
  };

  return (
    <div>
      <div className="field">
        <label>Weergave voor de leerling</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${config.layout === 'single' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, layout: 'single' })}>
            Eén vraag per scherm
          </button>
          <button className={`btn btn-sm ${config.layout === 'scroll' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, layout: 'scroll' })}>
            Alles onder elkaar
          </button>
        </div>
      </div>
      {/* gedeelde suggestielijst voor leerdoelen */}
      <datalist id="wf-goals">
        {[...new Set(config.questions.map((q) => q.goal).filter((g): g is string => !!g && g.trim() !== ''))].map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {/* gedeelde suggestielijst voor leerplandoelen (codes uit je leerplannen) */}
      <datalist id="wf-goalcodes">
        {goalOptions.map((o) => (
          <option key={`${o.curriculumId}:${o.goal.code}`} value={o.goal.code} label={shortGoalText(o.goal.text)} />
        ))}
      </datalist>
      <label className="checkbox-row" style={{ marginBottom: 4 }}>
        <input type="checkbox" checked={config.askConfidence ?? false} onChange={(e) => onChange({ ...config, askConfidence: e.target.checked })} />
        <span>Vraag per vraag hoe zeker de leerling is <span className="hint">(traint zelfinschatting; telt nooit mee voor punten)</span></span>
      </label>
      {config.layout === 'single' && (
        <label className="checkbox-row" style={{ marginBottom: 4 }}>
          <input type="checkbox" checked={config.stepCheck ?? false} onChange={(e) => onChange({ ...config, stepCheck: e.target.checked })} />
          <span>Getrapte feedback: controleren per vraag <span className="hint">(bij een fout eerst een hint en een tweede kans, dan pas de oplossing)</span></span>
        </label>
      )}
      {config.questions.some((q) => q.level) && (
        <label className="checkbox-row" style={{ marginBottom: 4 }}>
          <input type="checkbox" checked={config.useRoutes ?? false} onChange={(e) => onChange({ ...config, useRoutes: e.target.checked })} />
          <span>Niveauroutes: leerling kiest een route <span className="hint">(route 1 = basis · route 2 = + kern · route 3 = + uitbreiding; vragen zonder niveau zitten in elke route)</span></span>
        </label>
      )}
      <details style={{ margin: '10px 0 14px' }} open={(config.glossary?.length ?? 0) > 0}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={18} aria-hidden /> Glossarium — schooltaalwoorden met uitleg ({(config.glossary ?? []).filter((g) => g.term.trim()).length})
        </summary>
        <div style={{ paddingTop: 8 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Deze woorden worden in de vragen klikbaar (gestippeld onderstreept); de leerling opent de uitleg zelf.
            Taalsteun als vangnet, standaard dicht.
          </p>
          {(config.glossary ?? []).map((g, gi) => (
            <div className="option-row" key={gi}>
              <input className="input input-sm" style={{ maxWidth: 180 }} placeholder="woord" value={g.term}
                onChange={(e) => {
                  const glossary = (config.glossary ?? []).slice();
                  glossary[gi] = { ...g, term: e.target.value };
                  onChange({ ...config, glossary });
                }} />
              <input className="input input-sm" placeholder="korte uitleg, synoniem of vertaling" value={g.uitleg}
                onChange={(e) => {
                  const glossary = (config.glossary ?? []).slice();
                  glossary[gi] = { ...g, uitleg: e.target.value };
                  onChange({ ...config, glossary });
                }} />
              <button className="btn btn-quiet btn-icon btn-sm" aria-label="Woord verwijderen"
                onClick={() => onChange({ ...config, glossary: (config.glossary ?? []).filter((_, j) => j !== gi) })}><CloseIcon size={16} aria-hidden /></button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost"
            onClick={() => onChange({ ...config, glossary: [...(config.glossary ?? []), { term: '', uitleg: '' }] })}>
            + Woord toevoegen
          </button>
        </div>
      </details>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Vragenpool</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="hint">Trek per leerling</span>
          <input
            className="input input-sm" type="number" min={0} max={config.questions.length} style={{ maxWidth: 80 }}
            value={config.drawCount ?? 0}
            aria-label="Aantal vragen per leerling (0 = alle vragen)"
            onChange={(e) => onChange({ ...config, drawCount: Math.max(0, Math.min(config.questions.length, parseInt(e.target.value) || 0)) })}
          />
          <span className="hint">willekeurige vragen (0 = alle {config.questions.length} vragen; iedereen een andere variant vermindert afkijken)</span>
        </div>
      </div>

      {qs.map((q, i) => (
        <div className="editor-item" key={q.id}>
          <ItemHeader
            index={i}
            label={questionLabel(q)}
            canUp={i > 0}
            canDown={i < qs.length - 1}
            onMoveUp={() => onChange({ ...config, questions: moveItem(qs, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, questions: moveItem(qs, i, i + 1) })}
            onDelete={() => onChange({ ...config, questions: qs.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const copy = JSON.parse(JSON.stringify(q)) as Question;
              copy.id = uid();
              const questions = qs.slice();
              questions.splice(i + 1, 0, copy);
              onChange({ ...config, questions });
            }}
          />
          <div className="editor-item-body">
            <Field label={q.type === 'info' ? 'Tekst' : 'Vraag'}>
              <textarea
                className="textarea" rows={2}
                value={q.prompt}
                placeholder={q.type === 'info' ? 'Informatieve tekst…' : 'Typ hier je vraag…'}
                onChange={(e) => update(i, { ...q, prompt: e.target.value })}
              />
            </Field>
            <QuestionBodyEditor q={q} onChange={(nq) => update(i, nq)} />
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                Extra: afbeelding, punten & feedback
              </summary>
              <div style={{ paddingTop: 10 }}>
                <ImagePicker value={q.imageUrl} onChange={(imageUrl) => update(i, { ...q, imageUrl })} />
                {q.imageUrl && (
                  <Field
                    label="Beschrijving voor wie de afbeelding niet ziet"
                    hint="Wordt voorgelezen door een schermlezer. Laat leeg als de afbeelding alleen versiering is."
                  >
                    <input className="input input-sm" value={q.imageAlt ?? ''} placeholder='bv. "Kaart van België met de tien provincies"'
                      onChange={(e) => update(i, { ...q, imageAlt: e.target.value || undefined })} />
                  </Field>
                )}
                {q.type !== 'info' && (
                  <Field label="Punten">
                    <NumberField className="input input-sm" min={0} value={q.points} style={{ maxWidth: 110 }}
                      onChange={(points) => update(i, { ...q, points })} />
                  </Field>
                )}
                <Field label="Uitleg bij feedback" hint="Wordt getoond nadat de leerling heeft ingediend (als feedback aanstaat).">
                  <textarea className="textarea" rows={2} value={q.explanation ?? ''} onChange={(e) => update(i, { ...q, explanation: e.target.value })} />
                </Field>
                {q.type !== 'info' && (
                  <Field
                    label="Hintladder (optioneel, max. 3 oplopende hints)"
                    hint="Trede 1: strategie (“herlees de vraag”), trede 2: inhoudelijke aanwijzing, trede 3: bijna-voorbeeld. De leerling opent ze zelf, één voor één; het gebruik zie je bij de resultaten."
                  >
                    <div>
                      {editorHints(q).map((h, hi) => (
                        <div className="option-row" key={hi}>
                          <span className="badge">{hi + 1}</span>
                          <input className="input input-sm" value={h} aria-label={`Hint ${hi + 1}`}
                            onChange={(e) => {
                              const hints = editorHints(q).slice();
                              hints[hi] = e.target.value;
                              update(i, { ...q, hints, hint: undefined });
                            }} />
                          <button className="btn btn-quiet btn-icon btn-sm" aria-label={`Hint ${hi + 1} verwijderen`}
                            onClick={() => {
                              const hints = editorHints(q).filter((_, j) => j !== hi);
                              update(i, { ...q, hints, hint: undefined });
                            }}><CloseIcon size={16} aria-hidden /></button>
                        </div>
                      ))}
                      {editorHints(q).length < 3 && (
                        <button className="btn btn-sm btn-ghost"
                          onClick={() => update(i, { ...q, hints: [...editorHints(q), ''], hint: undefined })}>
                          + Hint toevoegen
                        </button>
                      )}
                    </div>
                  </Field>
                )}
                <Field label="In andere woorden / steuntaal (optioneel)" hint="Vertaling of eenvoudiger formulering; de leerling opent dit zelf via het knopje ernaast — standaard verborgen.">
                  <input className="input input-sm" value={q.support ?? ''} placeholder='bv. vertaling of "Wat moet je hier eigenlijk doen?"'
                    onChange={(e) => update(i, { ...q, support: e.target.value })} />
                </Field>
                {q.type === 'long' && (
                  <div>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={q.allowDraw ?? false} onChange={(e) => update(i, { ...q, allowDraw: e.target.checked })} />
                      <span>Leerling mag ook <strong>tekenen</strong> als antwoord</span>
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={q.allowAudio ?? false} onChange={(e) => update(i, { ...q, allowAudio: e.target.checked })} />
                      <span>Leerling mag ook <strong>inspreken</strong> (audio-antwoord, max. 60 s)</span>
                    </label>
                  </div>
                )}
                {q.type !== 'info' && (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <Field label="Leerdoel (optioneel)" hint="Vragen met hetzelfde doel worden samen gerapporteerd.">
                      <input className="input input-sm" list="wf-goals" value={q.goal ?? ''} placeholder='bv. "Werkwoordspelling"'
                        style={{ minWidth: 220 }}
                        onChange={(e) => update(i, { ...q, goal: e.target.value })} />
                    </Field>
                    <GoalCodeField
                      value={q.goalCode ?? ''}
                      hasOptions={goalOptions.length > 0}
                      onChange={(goalCode) => update(i, { ...q, goalCode: goalCode || undefined })}
                    />
                    <Field label="Niveau (voor routes)" hint="Zonder niveau telt de vraag mee in elke route.">
                      <div style={{ display: 'flex', gap: 6 }}>
                        {([undefined, 'basis', 'kern', 'uitbreiding'] as const).map((lv) => (
                          <button
                            key={lv ?? 'geen'}
                            className={`btn btn-sm ${(q.level ?? undefined) === lv ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => update(i, { ...q, level: lv })}
                          >
                            {lv ?? '—'}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      ))}

      {qs.length === 0 && (
        <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: '18px 0' }}>
          Nog geen vragen. Voeg je eerste vraag toe.
        </p>
      )}

      <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
          + Vraag toevoegen
        </button>
        <button className="btn btn-ghost" onClick={() => setImportOpen('bank')}>
          <Database size={18} aria-hidden /> Uit vraagbank
        </button>
        <button className="btn btn-ghost" onClick={() => setImportOpen('bulk')}>
          <ClipboardPaste size={18} aria-hidden /> Tekst plakken
        </button>
        {addOpen && (
          <div
            className="card"
            style={{
              position: 'absolute', zIndex: 30, marginTop: 8, padding: 8, width: 320,
              display: 'grid', gap: 2, boxShadow: 'var(--shadow-2)',
            }}
            role="menu"
          >
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.type}
                role="menuitem"
                className="btn btn-quiet"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => {
                  onChange({ ...config, questions: [...qs, makeQuestion(t.type)] });
                  setAddOpen(false);
                }}
              >
                <t.icon size={18} aria-hidden />
                <span style={{ textAlign: 'left' }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{t.name}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: 400 }}>{t.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {importOpen === 'bank' && (
        <QuestionBankModal
          onClose={() => setImportOpen(null)}
          onImport={(imported) => {
            onChange({ ...config, questions: [...qs, ...imported] });
            toast(`${imported.length} ${imported.length === 1 ? 'vraag' : 'vragen'} geïmporteerd`, 'ok');
          }}
        />
      )}
      {importOpen === 'bulk' && (
        <BulkImportModal
          onClose={() => setImportOpen(null)}
          onImport={(imported) => {
            onChange({ ...config, questions: [...qs, ...imported] });
            toast(`${imported.length} ${imported.length === 1 ? 'vraag' : 'vragen'} toegevoegd`, 'ok');
          }}
        />
      )}
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

type Answers = Record<string, unknown>;

/**
 * Juist en fout in de nabespreking ook in tekst en vorm, niet alleen in kleur
 * (WCAG 1.4.1): op het goede antwoord een vinkje met "goed antwoord", op een
 * fout gekozen optie een kruisje met "jouw keuze".
 */
function ReviewTag({ correct, chosen, ownLine }: {
  correct: boolean; chosen: boolean;
  /** Op een eigen regel (smalle knoppen zoals juist/onjuist), anders rechts. */
  ownLine?: boolean;
}) {
  if (!correct && !chosen) return null;
  const iconStyle = { flex: 'none' } as const;
  return (
    <span
      className="review-tag"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: '0.8rem', fontWeight: 650,
        ...(ownLine
          ? { flexBasis: '100%', justifyContent: 'center', textAlign: 'center' }
          : { marginLeft: 'auto', textAlign: 'right' }),
      }}
    >
      {correct
        ? <><CheckIcon size={16} style={iconStyle} aria-hidden /> goed antwoord</>
        : <><CloseIcon size={16} style={iconStyle} aria-hidden /> jouw keuze</>}
    </span>
  );
}

function MCAnswer({ q, value, onChange, review }: { q: MCQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  return (
    <div role="radiogroup" aria-label="Antwoordopties">
      {q.options.map((opt, i) => {
        const sel = value === i;
        let cls = 'answer-option';
        if (review) {
          if (i === q.correctIndex) cls += ' correct';
          else if (sel) cls += ' incorrect';
        } else if (sel) cls += ' selected';
        return (
          <button key={i} type="button" role="radio" aria-checked={sel} className={cls} disabled={review} onClick={() => onChange(i)}>
            <span className="marker" aria-hidden>{String.fromCharCode(65 + i)}</span>
            <span>{opt}</span>
            {review && <ReviewTag correct={i === q.correctIndex} chosen={sel} />}
          </button>
        );
      })}
    </div>
  );
}

function MultiAnswer({ q, value, onChange, review }: { q: MultiQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const sel = Array.isArray(value) ? (value as number[]) : [];
  return (
    <div role="group" aria-label="Antwoordopties (meerdere mogelijk)">
      {q.options.map((opt, i) => {
        const isSel = sel.includes(i);
        const isCor = q.correctIndices.includes(i);
        let cls = 'answer-option';
        if (review) {
          if (isCor) cls += ' correct';
          else if (isSel) cls += ' incorrect';
        } else if (isSel) cls += ' selected';
        return (
          <button
            key={i} type="button" aria-pressed={isSel} className={cls} disabled={review}
            onClick={() => {
              const next = new Set(sel);
              if (next.has(i)) next.delete(i); else next.add(i);
              onChange([...next].sort((a, b) => a - b));
            }}
          >
            <span className="marker" aria-hidden style={{ borderRadius: 7 }}>{isSel && <CheckIcon size={14} />}</span>
            <span>{opt}</span>
            {review && <ReviewTag correct={isCor} chosen={isSel} />}
          </button>
        );
      })}
      <p className="hint">Meerdere antwoorden mogelijk.</p>
    </div>
  );
}

function TFAnswer({ q, value, onChange, review }: { q: TFQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {[true, false].map((v) => {
        const sel = value === v;
        let cls = 'answer-option';
        if (review) {
          if (v === q.answer) cls += ' correct';
          else if (sel) cls += ' incorrect';
        } else if (sel) cls += ' selected';
        return (
          <button key={String(v)} type="button" className={cls} style={{ justifyContent: 'center', flexWrap: review ? 'wrap' : undefined }} disabled={review} onClick={() => onChange(v)} aria-pressed={sel}>
            {v ? <><CheckIcon size={18} aria-hidden /> Juist</> : <><CloseIcon size={18} aria-hidden /> Onjuist</>}
            {review && <ReviewTag correct={v === q.answer} chosen={sel} ownLine />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Juist/fout tonen bij de verbetering? Niet bij een vraag op 0 punten (bv.
 * een zelfinschattingsschuiver): daar levert niets punten op, dus zou elk
 * antwoord als "fout" kleuren.
 */
function verdict(q: Question, value: unknown, review: boolean): { show: boolean; ok: boolean } {
  if (!review) return { show: false, ok: false };
  const s = gradeQuestion(q, value);
  return { show: s.max > 0, ok: s.max > 0 && s.earned > 0 };
}

function ShortAnswer({ q, value, onChange, review }: { q: ShortQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const { show, ok } = verdict(q, value, review);
  return (
    <div>
      <input
        className="input"
        style={show ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : undefined}
        value={typeof value === 'string' ? value : ''}
        placeholder="Typ je antwoord…"
        disabled={review}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Je antwoord"
      />
      {!review && <AccentBar onInsert={(ch) => onChange((typeof value === 'string' ? value : '') + ch)} />}
      {show && !ok && (
        <p style={{ marginTop: 8, color: 'var(--ok)', fontWeight: 600 }}>Juist antwoord: {(q.accepted ?? []).filter(Boolean).join(' / ')}</p>
      )}
    </div>
  );
}

/** Klein tekenvlak voor teken-antwoorden bij open vragen. */
function MiniDrawPad({ value, onChange, disabled }: { value?: string; onChange: (dataUrl: string | undefined) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const lastRef = useRef<[number, number] | null>(null);
  const [eraser, setEraser] = useState(false);
  const W = 700, H = 400;

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, W, H);
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button type="button" className={`btn btn-sm ${!eraser ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEraser(false)} aria-pressed={!eraser}><Pencil size={16} aria-hidden /> Pen</button>
        <button type="button" className={`btn btn-sm ${eraser ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEraser(true)} aria-pressed={eraser}><Eraser size={16} aria-hidden /> Gom</button>
        <button type="button" className="btn btn-sm btn-quiet" disabled={disabled}
          onClick={() => {
            const ctx = canvasRef.current!.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, W, H);
            // leeg canvas is geen antwoord: tekening uit het antwoord verwijderen
            onChange(undefined);
          }}>
          <DeleteIcon size={16} aria-hidden /> Wissen
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        width={W} height={H}
        style={{ width: '100%', aspectRatio: `${W} / ${H}`, opacity: disabled ? 0.7 : 1 }}
        aria-label="Tekenvlak voor je antwoord"
        onPointerDown={(e) => {
          if (disabled || drawingRef.current) return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawingRef.current = true;
          pointerRef.current = e.pointerId;
          lastRef.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || e.pointerId !== pointerRef.current || !lastRef.current) return;
          const ctx = canvasRef.current!.getContext('2d')!;
          const [x, y] = pos(e);
          const [lx, ly] = lastRef.current;
          ctx.strokeStyle = eraser ? '#fff' : '#17203a';
          ctx.lineWidth = eraser ? 22 : 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(x, y);
          ctx.stroke();
          lastRef.current = [x, y];
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== pointerRef.current) return;
          drawingRef.current = false;
          pointerRef.current = null;
          lastRef.current = null;
          onChange(canvasRef.current!.toDataURL('image/jpeg', 0.8));
        }}
      />
    </div>
  );
}

/** Audio-antwoord opnemen (max. 60 s), lokaal als data-URL bewaard. */
function AudioRecorder({ value, onChange }: { value?: string; onChange: (dataUrl: string | undefined) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const busyRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    if (seconds >= 60) { recRef.current?.stop(); return; }
    const t = setTimeout(() => setSeconds((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [recording, seconds]);

  useEffect(() => () => {
    unmountedRef.current = true;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    // dubbelklik of klik tijdens de permissieprompt mag geen tweede stream starten
    if (busyRef.current || recording) return;
    busyRef.current = true;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current || recRef.current?.state === 'recording') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onChange(String(reader.result));
        reader.readAsDataURL(blob);
        setRecording(false);
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setError('Geen toegang tot de microfoon. Sta microfoongebruik toe in je browser, of typ je antwoord.');
    } finally {
      busyRef.current = false;
    }
  };

  if (value) {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <audio controls src={value} style={{ maxWidth: '100%' }} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(undefined)}><RetryIcon size={16} aria-hidden /> Opnieuw opnemen</button>
      </div>
    );
  }

  return (
    <div>
      {recording ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="badge badge-err" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            opname {seconds}s / 60s
          </span>
          <button type="button" className="btn btn-primary" onClick={() => recRef.current?.stop()}><Square size={16} aria-hidden /> Stop</button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={start}><Mic size={18} aria-hidden /> Start opname</button>
      )}
      {error && <p role="alert" style={{ color: 'var(--err)', fontWeight: 600, marginTop: 6 }}>{error}</p>}
    </div>
  );
}

function LongAnswer({ q, value, onChange, review }: { q: LongQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const rubric = (q.rubric ?? []).filter((r) => r.criterion.trim());
  const multi = !!(q.allowDraw || q.allowAudio);
  const val: LongAnswerValue = typeof value === 'string' ? { tekst: value } : ((value as LongAnswerValue) ?? {});
  const [mode, setMode] = useState<'typen' | 'tekenen' | 'audio'>('typen');
  // laat late async-callbacks (audio-opname) niet een verouderde waarde terugzetten
  const valRef = useRef(val);
  valRef.current = val;

  const setVal = (patch: Partial<LongAnswerValue>) => {
    const next = { ...valRef.current, ...patch };
    // zonder extra modaliteiten blijft het antwoord een gewone string
    onChange(multi ? next : (next.tekst ?? ''));
  };

  return (
    <div>
      {rubric.length > 0 && (
        <div className="callout" style={{ marginBottom: 10 }}>
          <GoalIcon aria-hidden />
          <div>
            <strong>Hier let je leerkracht op:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {rubric.map((r, i) => <li key={i}>{r.criterion} <span className="hint">({r.points} {r.points === 1 ? 'punt' : 'punten'})</span></li>)}
            </ul>
          </div>
        </div>
      )}
      {multi && !review && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }} aria-label="Antwoordvorm kiezen">
          <button type="button" aria-pressed={mode === 'typen'} className={`btn btn-sm ${mode === 'typen' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('typen')}>
            <Pencil size={16} aria-hidden /> Typen{val.tekst?.trim() ? <CheckIcon size={14} className="icon-inline" aria-hidden /> : ''}
          </button>
          {q.allowDraw && (
            <button type="button" aria-pressed={mode === 'tekenen'} className={`btn btn-sm ${mode === 'tekenen' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('tekenen')}>
              <Palette size={16} aria-hidden /> Tekenen{val.tekening ? <CheckIcon size={14} className="icon-inline" aria-hidden /> : ''}
            </button>
          )}
          {q.allowAudio && (
            <button type="button" aria-pressed={mode === 'audio'} className={`btn btn-sm ${mode === 'audio' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('audio')}>
              <Mic size={16} aria-hidden /> Inspreken{val.audio ? <CheckIcon size={14} className="icon-inline" aria-hidden /> : ''}
            </button>
          )}
        </div>
      )}
      {review ? (
        <div>
          {val.tekst?.trim() && <p style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-sunken)', borderRadius: 8, padding: '8px 12px' }}>{val.tekst}</p>}
          {val.tekening && <img src={val.tekening} alt="Jouw tekening als antwoord" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />}
          {val.audio && <audio controls src={val.audio} style={{ maxWidth: '100%', marginTop: 6 }} />}
          {!val.tekst?.trim() && !val.tekening && !val.audio && <p className="hint">(geen antwoord)</p>}
          <p className="hint" style={{ marginTop: 6 }}>Deze open vraag wordt door je leerkracht beoordeeld.</p>
        </div>
      ) : (
        <>
          {(!multi || mode === 'typen') && (
            <>
              <textarea
                className="textarea" rows={5}
                value={val.tekst ?? ''}
                placeholder="Typ je antwoord…"
                onChange={(e) => setVal({ tekst: e.target.value })}
                aria-label="Je antwoord"
                spellCheck
              />
              {!multi && <AccentBar onInsert={(ch) => setVal({ tekst: (val.tekst ?? '') + ch })} />}
            </>
          )}
          {multi && mode === 'tekenen' && <MiniDrawPad value={val.tekening} onChange={(tekening) => setVal({ tekening })} />}
          {multi && mode === 'audio' && <AudioRecorder value={val.audio} onChange={(audio) => setVal({ audio })} />}
        </>
      )}
    </div>
  );
}

function GapAnswer({ q, value, onChange, review }: { q: GapQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const parts = useMemo(() => splitGapText(q.text), [q.text]);
  const answers = Array.isArray(value) ? (value as string[]) : [];
  return (
    <p style={{ fontSize: '1.08rem', lineHeight: 2.2 }}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.value}</span>;
        const gi = p.gapIndex!;
        const given = answers[gi] ?? '';
        let cls = 'gap-input';
        if (review) {
          // zelfde normalisatie als de beoordeling, anders kleurt een juist antwoord rood
          const options = p.value.split('|');
          const ok = options.some((o) => normalizeAnswer(o) === normalizeAnswer(given));
          cls += ok ? ' correct' : ' incorrect';
        }
        return (
          <span key={i} style={{ whiteSpace: 'nowrap' }}>
            <input
              className={cls}
              value={given}
              size={Math.max(6, p.value.split('|')[0].length)}
              disabled={review}
              aria-label={`Invulveld ${gi + 1}`}
              onChange={(e) => {
                const next = answers.slice();
                next[gi] = e.target.value;
                onChange(next);
              }}
            />
            {review && (
              <small style={{ color: 'var(--ok)', fontWeight: 700 }}> ({p.value.split('|')[0]})</small>
            )}
          </span>
        );
      })}
    </p>
  );
}

function MatchAnswer({ q, value, onChange, review }: { q: MatchQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  // rechteropties in vaste, geschudde volgorde tonen, nooit in de volgorde
  // van links (dan is de oplossing gewoon 1-2-3 kiezen); zelfde tekst = zelfde plaats
  const rightOrder = useMemo(
    () => shuffledNotIdentity(q.pairs.map((_, i) => i), (a, b) => normalizeAnswer(q.pairs[a]?.right ?? '') === normalizeAnswer(q.pairs[b]?.right ?? '')),
    [q.id],
  );
  const chosen = Array.isArray(value) ? (value as (number | null)[]) : q.pairs.map(() => null);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {q.pairs.map((p, li) => {
        const val = chosen[li];
        // zelfde regel als de beoordeling: dezelfde rechtertekst telt als juist
        const ok = review && matchChoiceCorrect(q.pairs, li, val);
        return (
          <div key={li} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 650, flex: '1 1 160px' }}>{p.left}</span>
            <ArrowRight size={16} aria-hidden />
            <select
              className="select"
              style={{ flex: '1 1 190px', maxWidth: 280, ...(review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : {}) }}
              value={val === null || val === undefined ? '' : String(val)}
              disabled={review}
              aria-label={`Koppel "${p.left}" aan`}
              onChange={(e) => {
                const next = chosen.slice();
                while (next.length < q.pairs.length) next.push(null);
                next[li] = e.target.value === '' ? null : Number(e.target.value);
                onChange(next);
              }}
            >
              <option value="">— kies —</option>
              {rightOrder.map((ri) => (
                <option key={ri} value={ri}>{q.pairs[ri].right}</option>
              ))}
            </select>
            {review && !ok && <small style={{ color: 'var(--ok)', fontWeight: 700 }}><CheckIcon size={14} className="icon-inline" aria-hidden /> {p.right}</small>}
          </div>
        );
      })}
    </div>
  );
}

function OrderAnswer({ q, value, onChange, review }: { q: OrderQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  // value = array van originele indexen in getoonde volgorde; de beginvolgorde
  // mag er nooit al juist uitzien (zelfde tekst telt als zelfde plaats)
  const initial = useMemo(
    () => shuffledNotIdentity(q.items.map((_, i) => i), (a, b) => normalizeAnswer(q.items[a] ?? '') === normalizeAnswer(q.items[b] ?? '')),
    [q.id],
  );
  const order = Array.isArray(value) && (value as number[]).length === q.items.length ? (value as number[]) : initial;

  useEffect(() => {
    if (!Array.isArray(value) || (value as number[]).length !== q.items.length) onChange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <div>
      {order.map((origIdx, pos) => {
        const ok = review && origIdx === pos;
        return (
          <div
            key={origIdx}
            className="order-item"
            style={review ? { borderColor: ok ? 'var(--ok)' : 'var(--err)', background: ok ? 'var(--ok-soft)' : 'var(--err-soft)' } : undefined}
          >
            <span className="badge badge-brand">{pos + 1}</span>
            <span style={{ flex: 1 }}>{q.items[origIdx]}</span>
            {review ? (
              !ok && <small style={{ color: 'var(--text-soft)' }}>hoort op plaats {origIdx + 1}</small>
            ) : (
              <span className="updown">
                <button className="btn btn-quiet btn-icon btn-sm" aria-label="Omhoog" disabled={pos === 0} onClick={() => move(pos, pos - 1)}><MoveUpIcon size={16} aria-hidden /></button>
                <button className="btn btn-quiet btn-icon btn-sm" aria-label="Omlaag" disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)}><MoveDownIcon size={16} aria-hidden /></button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumberAnswer({ q, value, onChange, review }: { q: NumberQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const { show, ok } = verdict(q, value, review);
  return (
    <div>
      <input
        className="input" type="number" step="any" style={{ maxWidth: 220, ...(show ? { borderColor: ok ? 'var(--ok)' : 'var(--err)' } : {}) }}
        value={value === undefined || value === null ? '' : String(value)}
        disabled={review}
        aria-label="Numeriek antwoord"
        onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
      />
      {show && !ok && <p style={{ marginTop: 8, color: 'var(--ok)', fontWeight: 600 }}>Juist antwoord: {q.answer}{q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}</p>}
    </div>
  );
}

function SliderAnswer({ q, value, onChange, review }: { q: SliderQuestion; value: unknown; onChange: (v: unknown) => void; review: boolean }) {
  const v = typeof value === 'number' ? value : (q.min + q.max) / 2;
  const { show, ok } = verdict(q, value, review);
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-soft)' }}>{q.min}</span>
        <input
          type="range" min={q.min} max={q.max} step={q.step || 1} value={v} disabled={review}
          style={{ flex: 1 }}
          aria-label="Waarde kiezen"
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span style={{ color: 'var(--text-soft)' }}>{q.max}</span>
        <output style={{ fontWeight: 800, minWidth: 52, textAlign: 'center', fontSize: '1.15rem', color: 'color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))' }}>
          {typeof value === 'number' ? value : '—'}
        </output>
      </div>
      {show && <p style={{ marginTop: 8, color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>
        {ok ? <><CheckIcon size={16} className="icon-inline" aria-hidden /> Juist</> : `Juiste waarde: ${q.answer}${q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}`}
      </p>}
    </div>
  );
}

const CONF_OPTIONS = [
  { key: 'zeker', label: 'Zeker', icon: GoalIcon },
  { key: 'twijfel', label: 'Twijfel', icon: HelpCircle },
  { key: 'gok', label: 'Gok', icon: Dices },
] as const;
export type Confidence = (typeof CONF_OPTIONS)[number]['key'];

export function QuestionView({
  q, index, total, value, onChange, review,
  confidence, onConfidence, onHintUsed, glossary,
}: {
  q: Question; index: number; total: number;
  value: unknown; onChange: (v: unknown) => void; review: boolean;
  /** Zekerheidsgraad tonen/registreren (kalibratie). */
  confidence?: Confidence | null;
  onConfidence?: (c: Confidence) => void;
  /** Meldt hoeveel hints (diepste trede) de leerling opende. */
  onHintUsed?: (level: number) => void;
  /** Klikbare schooltaalwoorden met uitleg. */
  glossary?: GlossaryEntry[];
}) {
  const score = review && q.type !== 'info' ? gradeQuestion(q, value) : null;
  const hints = questionHints(q);
  const [hintLevel, setHintLevel] = useState(0);
  const [spoken, setSpoken] = useState<[number, number] | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const sentences = useMemo(() => splitSentences(q.prompt ?? ''), [q.prompt]);
  const sentIdxRef = useRef(0);

  // zin-per-zin voorlezen: elke klik leest de volgende zin, met markering
  const speakNextSentence = () => {
    if (typeof speechSynthesis === 'undefined' || sentences.length === 0 || !q.prompt) return;
    const i = sentIdxRef.current % sentences.length;
    sentIdxRef.current = i + 1;
    const { start, end } = sentences[i];
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(q.prompt.slice(start, end));
    u.lang = 'nl-BE';
    u.rate = loadA11y().rate;
    setSpoken([start, end]);
    u.onend = () => setSpoken(null);
    u.onerror = () => setSpoken(null);
    speechSynthesis.speak(u);
  };
  useEffect(() => () => {
    // voorlezen stoppen wanneer de vraag verdwijnt (onvoorwaardelijk: de
    // closure zou anders een verouderde 'spoken' zien die altijd null is)
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }, []);
  return (
    <div className="card question-card">
      <div className="question-num">
        {q.type === 'info' ? 'Info' : `Vraag ${index + 1} van ${total}`}
        {q.type !== 'info' && <span className="badge">{q.points} {q.points === 1 ? 'punt' : 'punten'}</span>}
        <button
          type="button"
          className="btn btn-quiet btn-icon btn-sm"
          style={{ minHeight: 44, minWidth: 44, padding: 2 }}
          onClick={() => speakQuestion(q, setSpoken)}
          aria-label="Vraag voorlezen (met meeleesmarkering)"
          title="Vraag voorlezen"
        >
          <Volume2 size={18} aria-hidden />
        </button>
        {sentences.length >= 2 && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            style={{ minHeight: 44, padding: '2px 10px', fontSize: '0.75rem' }}
            onClick={speakNextSentence}
            aria-label="Zin per zin voorlezen (volgende zin)"
            title="Zin per zin voorlezen"
          >
            <Volume2 size={16} className="icon-inline" aria-hidden /> 1-2-3
          </button>
        )}
        {q.support && !review && (
          <button
            type="button"
            className="btn btn-quiet btn-icon btn-sm"
            style={{ minHeight: 44, minWidth: 44, padding: 2 }}
            onClick={() => setSupportOpen((v) => !v)}
            aria-pressed={supportOpen}
            aria-label="Vraag in andere woorden tonen"
            title="In andere woorden"
          >
            <Globe size={18} aria-hidden />
          </button>
        )}
        {score && score.mode !== 'pending' && score.max > 0 && (
          <span className={`badge ${score.earned >= score.max ? 'badge-ok' : score.earned > 0 ? 'badge-warn' : 'badge-err'}`}>
            {score.earned}/{score.max}
          </span>
        )}
        {score?.mode === 'pending' && <span className="badge badge-warn">wordt beoordeeld</span>}
      </div>
      {q.prompt && <PromptText text={q.prompt} spoken={spoken} glossary={glossary} />}
      {supportOpen && q.support && (
        <div className="callout" style={{ marginTop: -6, marginBottom: 12 }} role="note">
          <Globe aria-hidden />
          <div>{q.support}</div>
        </div>
      )}
      {q.imageUrl && <img className="question-image" src={q.imageUrl} alt={q.imageAlt?.trim() ?? ''} />}
      {q.type === 'mc' && <MCAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'multi' && <MultiAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'tf' && <TFAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'short' && <ShortAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'long' && <LongAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'gap' && <GapAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'match' && <MatchAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'order' && <OrderAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'number' && <NumberAnswer q={q} value={value} onChange={onChange} review={review} />}
      {q.type === 'slider' && <SliderAnswer q={q} value={value} onChange={onChange} review={review} />}
      {(() => {
        const extra = extraQType(q.type);
        if (!extra) return null;
        const A = extra.Answer;
        return <A q={q} value={value} onChange={onChange} review={review} />;
      })()}
      {!review && hints.length > 0 && q.type !== 'info' && (
        <div style={{ marginTop: 12 }}>
          {hints.slice(0, hintLevel).map((h, i) => (
            <div key={i} className="callout warn" style={{ marginBottom: 8 }}>
              <TipIcon aria-hidden />
              <div><strong>Hint {hints.length > 1 ? `${i + 1}/${hints.length}` : ''}:</strong> {h}</div>
            </div>
          ))}
          {hintLevel < hints.length && (
            <button
              type="button" className="btn btn-sm btn-quiet"
              onClick={() => {
                const next = hintLevel + 1;
                setHintLevel(next);
                onHintUsed?.(next);
              }}
            >
              <TipIcon size={16} aria-hidden /> {hintLevel === 0 ? 'Ik wil een hint' : `Nog een hint (${hintLevel + 1}/${hints.length})`}
            </button>
          )}
        </div>
      )}
      {!review && onConfidence && q.type !== 'info' && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Hoe zeker ben je van je antwoord?">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}>Hoe zeker ben je?</span>
          {CONF_OPTIONS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip ${confidence === c.key ? 'placed' : ''}`}
              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
              aria-pressed={confidence === c.key}
              onClick={() => onConfidence(c.key)}
            >
              <c.icon size={16} aria-hidden /> {c.label}
            </button>
          ))}
        </div>
      )}
      {review && q.explanation && (
        <div className="callout" style={{ marginTop: 14, marginBottom: 0 }}>
          <TipIcon aria-hidden />
          <div><strong>Uitleg:</strong> {q.explanation}</div>
        </div>
      )}
    </div>
  );
}

function answered(q: Question, v: unknown): boolean {
  if (q.type === 'info') return true;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return q.type === 'order' ? true : v.some((x) => x !== null && x !== undefined && x !== '');
  if (typeof v === 'object') {
    // Uitgebreide types bewaren records ({gat: keuze}, {itemId: catId}, {name,size,…}):
    // elke niet-lege sleutel telt als "eraan begonnen".
    if (extraQType(q.type)) return Object.keys(v).length > 0;
    const lv = v as LongAnswerValue;
    return !!(lv.tekst?.trim() || lv.tekening || lv.audio);
  }
  return true;
}

export function QuizPlayer({ widget, studentName, preview, timeUp, onComplete }: PlayerProps<QuizConfig>) {
  const config = widget.config;
  const baseQuestions = useMemo(() => {
    let qs = config.questions;
    // vragenpool: per leerling een willekeurige deelverzameling (infoblokken blijven staan)
    const draw = config.drawCount ?? 0;
    const gradableAll = qs.filter((q) => q.type !== 'info');
    if (draw > 0 && draw < gradableAll.length) {
      const chosen = new Set(shuffled(gradableAll).slice(0, draw).map((q) => q.id));
      qs = qs.filter((q) => q.type === 'info' || chosen.has(q.id));
    }
    return widget.settings.shuffle ? shuffled(qs) : qs;
  }, [widget.id]);
  // opslaan & hervatten: eerder werk van deze leerling op dit toestel terugzetten
  const restored = useMemo(
    () => (preview ? null : loadProgress(widget.id, studentName)),
    [widget.id, studentName]
  );
  // bewaarde vraagvolgorde herstellen zodat schudden/vragenpool stabiel hervat
  const restoredQuestions = useMemo(() => {
    if (!restored?.order) return null;
    const byId = new Map(config.questions.map((q) => [q.id, q]));
    const qs = restored.order.map((id) => byId.get(id)).filter((q): q is Question => !!q);
    // alleen bruikbaar als de opgeslagen volgorde nog volledig bij de widget past
    return qs.length > 0 && qs.length === restored.order.length ? qs : null;
  }, [restored, widget.id]);
  const [questions, setQuestions] = useState<Question[]>(restoredQuestions ?? baseQuestions);
  const [practice, setPractice] = useState(false);
  const [confs, setConfs] = useState<Record<string, Confidence>>({});
  /** Diepste geopende hinttrede per vraag. */
  const hintsRef = useRef<Map<string, number>>(new Map());
  const routeRef = useRef<number | null>(null);
  // getrapte controle per vraag: 'retry' = fout, tweede kans loopt; 'locked' = afgehandeld
  const [stepState, setStepState] = useState<Record<string, 'retry' | 'locked'>>(restored?.step ?? {});
  const [answers, setAnswers] = useState<Answers>(restored?.answers ?? {});
  const [idx, setIdx] = useState(() =>
    restored ? Math.min(Math.max(0, restored.idx), Math.max(0, (restoredQuestions ?? baseQuestions).length - 1)) : 0
  );
  // routekeuze alleen bij een verse start (bij hervatten ligt de set al vast)
  const needRoute = !!config.useRoutes && !restoredQuestions && baseQuestions.some((q) => q.level);
  const [phase, setPhase] = useState<'route' | 'answering' | 'done'>(needRoute ? 'route' : 'answering');
  const [showRestored, setShowRestored] = useState(!!restored && Object.keys(restored.answers).length > 0);
  /** Telt op bij "Opnieuw beginnen": nieuwe sleutels, dus verse vraagweergaven. */
  const [round, setRound] = useState(0);
  /**
   * Eén vraag per scherm: na "Volgende" of "Vorige" de focus naar de nieuwe
   * vraag, anders blijft ze op de knop staan terwijl de vraag stil verandert
   * (een schermlezer merkt dan niets). Niet bij de eerste weergave; via de
   * vorige index, zodat het dubbel uitvoeren van effecten in de
   * ontwikkelmodus de focus niet steelt.
   */
  const vraagRef = useRef<HTMLDivElement>(null);
  const prevIdxRef = useRef(idx);
  useEffect(() => {
    if (prevIdxRef.current === idx) return;
    prevIdxRef.current = idx;
    vraagRef.current?.focus();
  }, [idx]);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!preview && !practice && phase === 'answering') {
      saveProgress(widget.id, studentName, answers, idx, questions.map((q) => q.id), stepState);
    }
  }, [answers, idx, phase, practice, stepState]);

  const gradable: Question[] = questions.filter((q) => q.type !== 'info');
  const answeredCount = gradable.filter((q) => answered(q, answers[q.id])).length;

  const submit = () => {
    if (phase === 'done') return;
    if (!practice) {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const res = gradeQuiz({ ...config, questions }, answers);
      const meta: Record<string, unknown> = {};
      if (Object.keys(confs).length > 0) meta['_zekerheid'] = confs;
      if (hintsRef.current.size > 0) {
        // "vraagid" = 1 hint, "vraagid:2" = twee treden, enz.
        meta['_hints'] = [...hintsRef.current.entries()].map(([id, lv]) => (lv > 1 ? `${id}:${lv}` : id));
      }
      if (routeRef.current !== null) meta['_route'] = routeRef.current;
      onComplete({
        answers: { ...answers, ...meta },
        itemScores: res.itemScores, earned: res.earned, max: res.max, hasPending: res.hasPending,
      });
      if (!preview) clearProgress(widget.id, studentName);
    }
    setPhase('done');
    window.scrollTo({ top: 0 });
  };

  /** Nieuwe ronde met alleen de fout beantwoorde vragen (oefenmodus, wordt niet ingediend). */
  const practiceMistakes = () => {
    const wrong = questions.filter((q) => {
      if (q.type === 'info' || q.type === 'long') return false;
      const s = gradeQuestion(q, answers[q.id]);
      return s.earned < s.max;
    });
    if (wrong.length === 0) return;
    setQuestions(wrong);
    setAnswers({});
    setConfs({});
    setStepState({});
    setIdx(0);
    setPractice(true);
    setShowRestored(false);
    setPhase('answering');
    window.scrollTo({ top: 0 });
  };

  /**
   * "Opnieuw beginnen" na teruggezette antwoorden: alles wat bij die poging
   * hoorde, gaat weg, ook vergrendelde vragen van de getrapte controle,
   * zekerheden en geopende hints. Met niveauroutes kies je opnieuw een route.
   * De ronde-teller hertekent de vragen, zodat ook hun eigen toestand
   * (geopende hints, schudvolgorde) opnieuw begint.
   */
  const restart = () => {
    setAnswers({});
    setStepState({});
    setConfs({});
    hintsRef.current.clear();
    routeRef.current = null;
    setIdx(0);
    setShowRestored(false);
    setQuestions(baseQuestions);
    setRound((r) => r + 1);
    if (config.useRoutes && baseQuestions.some((q) => q.level)) setPhase('route');
    if (!preview) clearProgress(widget.id, studentName);
  };

  useEffect(() => {
    if (timeUp && phase !== 'done') submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (questions.length === 0 && phase !== 'route') {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Deze oefening bevat nog geen vragen.</p>;
  }

  const review = phase === 'done' && widget.settings.showFeedback;

  // ── routekeuze (niveaulagen, neutraal benoemd) ──
  if (phase === 'route') {
    const forRoute = (r: 1 | 2 | 3) => {
      const allow = r === 1 ? ['basis'] : r === 2 ? ['basis', 'kern'] : ['basis', 'kern', 'uitbreiding'];
      return baseQuestions.filter((q) => !q.level || allow.includes(q.level));
    };
    const pick = (r: 1 | 2 | 3) => {
      routeRef.current = r;
      setQuestions(forRoute(r));
      setIdx(0);
      setPhase('answering');
    };
    const meta: { r: 1 | 2 | 3; color: string; label: string; desc: string }[] = [
      { r: 1, color: 'var(--ok)', label: 'Route 1', desc: 'De kernvragen — een stevige basis.' },
      { r: 2, color: 'var(--brand)', label: 'Route 2', desc: 'Basis plus verdiepende vragen.' },
      { r: 3, color: 'var(--accent)', label: 'Route 3', desc: 'Alles, inclusief uitdagende vragen.' },
    ];
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
        <h2>Kies je route</h2>
        <p style={{ color: 'var(--text-soft)' }}>
          Elke route werkt aan dezelfde leerstof. Kies wat nu bij je past — je mag altijd een andere route proberen.
        </p>
        {meta.map(({ r, color, label, desc }) => {
          const n = forRoute(r).filter((q) => q.type !== 'info').length;
          return (
            <button key={r} className="answer-option" onClick={() => pick(r)} style={{ textAlign: 'left' }}>
              <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', background: color, flex: 'none' }} />
              <span style={{ flex: 1 }}>
                <strong>{label}</strong> · {n} vragen
                <span style={{ display: 'block', fontSize: '0.86rem', color: 'var(--text-soft)' }}>{desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (phase === 'done') {
    const res = gradeQuiz({ ...config, questions }, answers);
    const wrongCount = questions.filter((q) => {
      if (q.type === 'info' || q.type === 'long') return false;
      const s = gradeQuestion(q, answers[q.id]);
      return s.earned < s.max;
    }).length;

    // kalibratiekwadranten: zekerheid × juistheid
    const quadrants = config.askConfidence
      ? (['zeker', 'twijfel', 'gok'] as Confidence[]).flatMap((c) => {
          const qsWithConf = gradable.filter((q) => (confs[q.id] ?? null) === c);
          return [
            { conf: c, ok: true, items: qsWithConf.filter((q) => { const s = gradeQuestion(q, answers[q.id]); return s.max > 0 && s.earned >= s.max; }) },
            { conf: c, ok: false, items: qsWithConf.filter((q) => { const s = gradeQuestion(q, answers[q.id]); return s.mode !== 'pending' && s.earned < s.max; }) },
          ];
        })
      : [];
    const misconcepties = quadrants.find((x) => x.conf === 'zeker' && !x.ok)?.items ?? [];
    const verborgenKennis = quadrants.filter((x) => (x.conf === 'twijfel' || x.conf === 'gok') && x.ok).flatMap((x) => x.items);

    return (
      <div>
        {practice && (
          <div className="callout" role="status">
            <Dumbbell aria-hidden />
            <div><strong>Oefenronde</strong> — dit resultaat wordt niet ingediend; je echte inzending is al bij je leerkracht.</div>
          </div>
        )}
        <ResultHero earned={res.earned} max={res.max} showScore={widget.settings.showScore} hasPending={res.hasPending}>
          {review && wrongCount > 0 && (
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={practiceMistakes}>
              <Dumbbell size={18} aria-hidden /> Oefen je {wrongCount} {wrongCount === 1 ? 'fout' : 'fouten'} opnieuw
            </button>
          )}
        </ResultHero>
        {review && (() => {
          // score per leerdoel: diagnostischer dan één totaalcijfer
          const goalList = [...new Set(questions.filter((q) => q.type !== 'info' && q.goal?.trim()).map((q) => q.goal!.trim()))];
          if (goalList.length === 0) return null;
          return (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><GoalIcon size={20} aria-hidden /> Per leerdoel</h3>
              {goalList.map((goal) => {
                const qs = questions.filter((q) => q.type !== 'info' && q.goal?.trim() === goal);
                let earned = 0, max = 0, pending = false;
                for (const q of qs) {
                  const s = res.itemScores[q.id] ?? gradeQuestion(q, answers[q.id]);
                  if (s.mode === 'pending') pending = true;
                  earned += s.earned; max += s.max;
                }
                const p = max > 0 ? Math.round((earned / max) * 100) : 0;
                return (
                  <div key={goal} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 4 }}>
                      <span>{goal}</span>
                      <span style={{ color: p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)' }}>
                        {pending ? 'deels nog te beoordelen · ' : ''}{Math.round(earned * 100) / 100}/{max}
                      </span>
                    </div>
                    <div className="progressbar">
                      <div style={{ width: `${p}%`, background: p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)' }} />
                    </div>
                  </div>
                );
              })}
              <p className="hint" style={{ margin: 0 }}>Zo zie je wat je al beheerst en wat je best nog eens herhaalt.</p>
            </div>
          );
        })()}
        {config.askConfidence && review && (misconcepties.length > 0 || verborgenKennis.length > 0) && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Compass size={20} aria-hidden /> Jouw zelfinschatting</h3>
            {misconcepties.length > 0 && (
              <p style={{ marginBottom: 6 }}>
                <span className="badge badge-err">let op</span>{' '}
                Je was <strong>zeker</strong> maar antwoordde toch fout bij {misconcepties.length === 1 ? 'vraag' : 'vragen'}{' '}
                <strong>{misconcepties.map((q) => gradable.indexOf(q) + 1).join(', ')}</strong> — kijk die uitleg extra goed na.
              </p>
            )}
            {verborgenKennis.length > 0 && (
              <p style={{ marginBottom: 0 }}>
                <span className="badge badge-ok">goed nieuws</span>{' '}
                Bij {verborgenKennis.length === 1 ? 'vraag' : 'vragen'}{' '}
                <strong>{verborgenKennis.map((q) => gradable.indexOf(q) + 1).join(', ')}</strong> twijfelde of gokte je,
                maar je antwoord was juist — je kan meer dan je denkt!
              </p>
            )}
          </div>
        )}
        {review && (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ textAlign: 'center' }}>Overzicht van je antwoorden</h2>
            {questions.map((q) => (
              <QuestionView key={q.id} q={q} index={gradable.indexOf(q)} total={gradable.length} value={answers[q.id]} onChange={() => {}} review glossary={config.glossary} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const restoredBanner = showRestored ? (
    <div className="callout" role="status" style={{ alignItems: 'center' }}>
      <Save aria-hidden />
      <div style={{ flex: 1 }}>Je eerdere antwoorden op dit toestel zijn teruggezet — je kan gewoon verdergaan.</div>
      <button
        className="btn btn-sm btn-ghost"
        onClick={restart}
      >
        <RetryIcon size={16} aria-hidden /> Opnieuw beginnen
      </button>
    </div>
  ) : null;

  if (config.layout === 'scroll') {
    return (
      <div>
        {restoredBanner}
        {questions.map((q) => (
          <QuestionView
            key={`${round}:${q.id}`} q={q}
            index={gradable.indexOf(q)} total={gradable.length}
            value={answers[q.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            review={false}
            confidence={confs[q.id] ?? null}
            onConfidence={config.askConfidence ? (c) => setConfs((m) => ({ ...m, [q.id]: c })) : undefined}
            onHintUsed={(lv) => hintsRef.current.set(q.id, Math.max(lv, hintsRef.current.get(q.id) ?? 0))}
            glossary={config.glossary}
          />
        ))}
        <div className="player-nav">
          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            {answeredCount} van {gradable.length} beantwoord
          </span>
          <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Indienen</button>
        </div>
      </div>
    );
  }

  // één vraag per scherm
  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  const stepMode = !!config.stepCheck;
  const qStep = stepState[q.id];
  const isLocked = qStep === 'locked';
  const needsCheck = stepMode && q.type !== 'info' && !isLocked;

  const checkCurrent = () => {
    const s = gradeQuestion(q, answers[q.id]);
    const fullyCorrect = s.mode !== 'pending' && s.max > 0 && s.earned >= s.max;
    if (fullyCorrect || s.mode === 'pending' || s.max === 0 || qStep === 'retry') {
      // juist, open vraag, of tweede poging voorbij → vergrendelen (oplossing wordt zichtbaar)
      setStepState((m) => ({ ...m, [q.id]: 'locked' }));
    } else {
      // eerste fout: hint tonen en één herkansing geven
      if (questionHints(q).length > 0) {
        hintsRef.current.set(q.id, Math.max(1, hintsRef.current.get(q.id) ?? 0));
      }
      setStepState((m) => ({ ...m, [q.id]: 'retry' }));
    }
  };

  return (
    <div>
      {restoredBanner}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="progressbar" style={{ flex: 1 }} role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={questions.length} aria-label="Voortgang">
          <div style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>
        <span style={{ fontWeight: 700, color: 'var(--text-soft)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {idx + 1} / {questions.length}
        </span>
      </div>
      <div ref={vraagRef} tabIndex={-1} className="quiz-vraag-focus" style={{ outline: 'none' }}>
        <QuestionView
          key={`${round}:${q.id}-${isLocked ? 'r' : 'a'}`}
          q={q} index={gradable.indexOf(q)} total={gradable.length}
          value={answers[q.id]}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          review={stepMode && isLocked && q.type !== 'info'}
          confidence={confs[q.id] ?? null}
          onConfidence={config.askConfidence ? (c) => setConfs((m) => ({ ...m, [q.id]: c })) : undefined}
          onHintUsed={(lv) => hintsRef.current.set(q.id, Math.max(lv, hintsRef.current.get(q.id) ?? 0))}
          glossary={config.glossary}
        />
      </div>
      {stepMode && qStep === 'retry' && (
        <div className="callout warn" role="alert">
          <RetryIcon aria-hidden />
          <div>
            <strong>Nog niet helemaal juist.</strong> Kijk nog eens goed en probeer één keer opnieuw.
            {questionHints(q).length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}><TipIcon size={16} className="icon-inline" aria-hidden /> <strong>Hint:</strong> {questionHints(q)[0]}</div>
            )}
          </div>
        </div>
      )}
      <div className="player-nav">
        <button className="btn btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          <BackIcon size={18} aria-hidden /> Vorige
        </button>
        {needsCheck ? (
          <button className="btn btn-primary" onClick={checkCurrent} disabled={!answered(q, answers[q.id])}>
            <CheckIcon size={18} aria-hidden /> {qStep === 'retry' ? 'Opnieuw controleren' : 'Controleren'}
          </button>
        ) : isLast ? (
          <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Indienen</button>
        ) : (
          <button className="btn btn-primary" onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}>
            Volgende <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
