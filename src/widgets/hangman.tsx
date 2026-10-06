import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Heart } from 'lucide-react';
import type { HangmanConfig } from '../lib/types';
import { shuffled } from '../lib/utils';
import { Field } from '../components/ui';
import { CheckIcon, CloseIcon, RetryIcon, TipIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ── Tekst ⇄ lijst ───────────────────────────────────────────────────────────

/** Woord en hint scheiden op de laatste dubbelepunt die door een spatie gevolgd wordt. */
const HINT_SPLIT = /^(.*):\s+(.*)$/;

/** Eén woord (of zin) per regel, met optioneel `: hint` achteraan. */
export function parseHangmanLines(text: string): HangmanConfig['words'] {
  return text.split('\n').map((line) => {
    const m = HINT_SPLIT.exec(line);
    return m ? { word: m[1].trim(), hint: m[2].trim() } : { word: line.trim(), hint: '' };
  });
}

/** Omgekeerde van `parseHangmanLines`: de tekst voor een bestaande lijst. */
export function formatHangmanLines(words: HangmanConfig['words']): string {
  return words
    .map((w) => {
      if (w.hint) return `${w.word}: ${w.hint}`;
      // Een woord met zelf een dubbelepunt + spatie krijgt een lege hint achteraan,
      // zodat het opnieuw inlezen hetzelfde woord teruggeeft.
      return HINT_SPLIT.test(w.word) ? `${w.word}: ` : w.word;
    })
    .join('\n');
}

const wordsKey = (words: HangmanConfig['words']) => JSON.stringify(words.map((w) => [w.word, w.hint]));

// ── Letters ─────────────────────────────────────────────────────────────────

/**
 * De letter (A–Z) die de leerling moet raden voor dit teken: accenten vallen weg
 * (É en Ë tellen als E). Zonder basisletter in A–Z (cijfer, leesteken, ß, Æ, …)
 * is het resultaat `null`: zo'n teken staat meteen in het woord.
 */
export function hangmanLetter(ch: string): string | null {
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /^[A-Z]$/.test(base) ? base : null;
}

/** De letters die geraden moeten worden om dit woord op te lossen. */
export function hangmanLetters(word: string): Set<string> {
  const out = new Set<string>();
  for (const ch of Array.from(word.normalize('NFC'))) {
    const l = hangmanLetter(ch);
    if (l) out.add(l);
  }
  return out;
}

/** Wat er op het scherm staat: geraden letters (met hun accent), `_` voor de rest. */
export function hangmanCells(word: string, guessed: ReadonlySet<string>, reveal = false): string[] {
  return Array.from(word.normalize('NFC')).map((ch) => {
    const l = hangmanLetter(ch);
    if (l === null) return ch;
    return reveal || guessed.has(l) ? ch.toUpperCase() : '_';
  });
}

export function hangmanSolved(word: string, guessed: ReadonlySet<string>): boolean {
  for (const l of hangmanLetters(word)) if (!guessed.has(l)) return false;
  return true;
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function HangmanEditor({ config, onChange }: EditorProps<HangmanConfig>) {
  // De ruwe tekst blijft in het tekstveld staan zoals de leerkracht ze typt; alleen de
  // geparste lijst gaat naar de config. Verandert de config van buiten (bv. AI of
  // ongedaan maken), dan wordt het veld opnieuw opgebouwd.
  const [text, setText] = useState(() => formatHangmanLines(config.words));
  const [seen, setSeen] = useState(() => wordsKey(config.words));
  const incoming = wordsKey(config.words);
  if (incoming !== seen) {
    setSeen(incoming);
    setText(formatHangmanLines(config.words));
  }
  return (
    <div>
      <Field
        label="Woorden en hints"
        hint="Eén woord per regel. Voeg optioneel een hint toe na een dubbelepunt en een spatie, bv.: fotosynthese: proces in groene planten. Staat er zelf een dubbelepunt in je woord of zin, zet dan altijd een hint achteraan."
      >
        <textarea
          className="textarea" rows={8}
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            const words = parseHangmanLines(value);
            setText(value);
            setSeen(wordsKey(words));
            onChange({ ...config, words });
          }}
        />
      </Field>
      <Field label="Maximaal aantal fouten">
        <input className="input input-sm" type="number" min={3} max={12} style={{ maxWidth: 110 }}
          value={config.maxErrors}
          onChange={(e) => onChange({ ...config, maxErrors: Math.max(3, Math.min(12, parseInt(e.target.value) || 8)) })} />
      </Field>
    </div>
  );
}

/** Eenvoudige, vriendelijke visual: hartjes die één voor één doven. */
function BalloonMeter({ left, total }: { left: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }} role="img" aria-label={`Nog ${left} van ${total} kansen`}>
      {Array.from({ length: total }, (_, i) => (
        <Heart
          key={i}
          size={26}
          aria-hidden
          style={{ opacity: i < left ? 1 : 0.15, transition: 'opacity 0.3s', color: 'var(--err)' }}
          fill={i < left ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

export function HangmanPlayer({ widget, timeUp, onComplete }: PlayerProps<HangmanConfig>) {
  const words = useMemo(() => {
    const valid = widget.config.words
      .map((w) => ({ ...w, word: w.word.trim().normalize('NFC') }))
      // zonder één letter van A tot Z valt er niets te raden
      .filter((w) => w.word.length >= 2 && hangmanLetters(w.word).size > 0);
    return widget.settings.shuffle ? shuffled(valid) : valid;
  }, [widget.id]);

  const [round, setRound] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState(0);
  const [solved, setSolved] = useState(0);
  const [roundOver, setRoundOver] = useState<'won' | 'lost' | null>(null);
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);

  const finish = (finalSolved: number) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setDone(true);
    onComplete({
      answers: { geraden: finalSolved, totaal: words.length },
      itemScores: null,
      earned: finalSolved,
      max: words.length,
    });
  };

  // Tijd om: de deelscore indienen en het resultaatscherm tonen.
  useEffect(() => {
    if (timeUp && !done && words.length > 0) finish(solved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (words.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen woorden ingesteld.</p>;

  const entry = words[round];
  const letters = hangmanLetters(entry.word);
  const maxErrors = widget.config.maxErrors;

  const cells = hangmanCells(entry.word, guessed, roundOver !== null);
  const long = cells.length > 12;

  const guess = (letter: string) => {
    if (roundOver || guessed.has(letter)) return;
    const next = new Set(guessed).add(letter);
    setGuessed(next);
    if (!letters.has(letter)) {
      const e = errors + 1;
      setErrors(e);
      if (e >= maxErrors) setRoundOver('lost');
    } else if (hangmanSolved(entry.word, next)) {
      setSolved((s) => s + 1);
      setRoundOver('won');
    }
  };

  const nextRound = () => {
    if (round + 1 >= words.length) {
      finish(solved);
    } else {
      setRound((r) => r + 1);
      setGuessed(new Set());
      setErrors(0);
      setRoundOver(null);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={solved} max={words.length}
        showScore={widget.settings.showScore}
        title={solved === words.length ? 'Alle woorden geraden! 🏆' : 'Spel afgelopen!'}
        subtitle={`Je raadde ${solved} van de ${words.length} woorden.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          submittedRef.current = false;
          setRound(0); setGuessed(new Set()); setErrors(0); setSolved(0); setRoundOver(null); setDone(false);
        }}><RetryIcon size={16} aria-hidden /> Opnieuw spelen</button>
      </ResultHero>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <GameStatus>
        <span>Woord {round + 1} / {words.length}</span>
        <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> {solved} geraden</span>
      </GameStatus>
      <BalloonMeter left={maxErrors - errors} total={maxErrors} />
      {entry.hint && (
        <p style={{ marginTop: 14, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><TipIcon size={16} aria-hidden /> Hint: <strong>{entry.hint}</strong></p>
      )}
      <p
        aria-hidden="true"
        style={{
          fontSize: long ? 'clamp(1.25rem, 5vw, 2rem)' : 'clamp(1.6rem, 6vw, 2.6rem)',
          fontWeight: 800, letterSpacing: long ? '0.2em' : '0.35em', margin: '22px 0',
          fontFamily: 'monospace',
          // lange woorden breken af in plaats van uit beeld te lopen
          overflowWrap: 'anywhere',
        }}
      >
        {cells.join('')}
      </p>
      {/* wat het zichtbare woord hierboven toont, in woorden: een live regio, zodat een geraden letter wordt voorgelezen */}
      <span className="sr-only" role="status">Woord: {cells.map((c) => (c === '_' ? 'leeg' : c)).join(' ')}</span>
      {roundOver ? (
        <div>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: roundOver === 'won' ? 'var(--ok)' : 'var(--err)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {roundOver === 'won'
              ? <><CheckIcon aria-hidden /> Geraden!</>
              : <><CloseIcon aria-hidden /> Helaas! Het woord was “{cells.join('')}”.</>}
          </p>
          <button className="btn btn-primary btn-lg" onClick={nextRound}>
            {round + 1 >= words.length ? <>Bekijk resultaat <ArrowRight size={18} aria-hidden /></> : <>Volgend woord <ArrowRight size={18} aria-hidden /></>}
          </button>
        </div>
      ) : (
        <div className="big-letter-grid" role="group" aria-label="Letters om te raden">
          {ALPHABET.map((l) => {
            const used = guessed.has(l);
            const hit = used && letters.has(l);
            return (
              <button
                key={l}
                className={`letter-key ${used ? (hit ? 'hit' : 'miss') : ''}`}
                // aria-disabled in plaats van disabled: de focus blijft op de knop staan, zodat wie met
                // het toetsenbord speelt niet na elke letter opnieuw van boven moet tabben (`guess`
                // negeert gebruikte letters). De stijl van een gebruikte toets staat daarom inline.
                style={used
                  ? { minWidth: 44, minHeight: 44, cursor: 'default', transform: 'none', borderColor: hit ? 'var(--ok)' : 'var(--err)' }
                  : { minWidth: 44, minHeight: 44 }}
                aria-disabled={used}
                onClick={() => guess(l)}
                aria-label={`Letter ${l}${used ? (hit ? ', juist' : ', fout') : ''}`}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
