import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ScrambleConfig } from '../lib/types';
import { normalizeAnswer, shuffled, uid } from '../lib/utils';
import { Field } from '../components/ui';
import { CheckIcon, RetryIcon, TipIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

// ── Tekst ⇄ lijst ───────────────────────────────────────────────────────────

type ScrambleItems = ScrambleConfig['items'];

/** Tekst en hint scheiden op de laatste dubbelepunt die door een spatie gevolgd wordt. */
const HINT_SPLIT = /^(.*):\s+(.*)$/;

/** Eén woord (of zin) per regel, met optioneel `: hint` achteraan. */
export function parseScrambleLines(text: string, makeId: () => string = uid): ScrambleItems {
  return text.split('\n').map((line) => {
    const m = HINT_SPLIT.exec(line);
    return m
      ? { id: makeId(), text: m[1].trim(), hint: m[2].trim() }
      : { id: makeId(), text: line.trim(), hint: '' };
  });
}

/** Omgekeerde van `parseScrambleLines`: de tekst voor een bestaande lijst. */
export function formatScrambleLines(items: ScrambleItems): string {
  return items
    .map((w) => {
      if (w.hint) return `${w.text}: ${w.hint}`;
      // Een zin met zelf een dubbelepunt + spatie krijgt een lege hint achteraan,
      // zodat het opnieuw inlezen dezelfde zin teruggeeft.
      return HINT_SPLIT.test(w.text) ? `${w.text}: ` : w.text;
    })
    .join('\n');
}

// De id's doen niet mee: die zijn bij elke keer inlezen nieuw.
const itemsKey = (items: ScrambleItems) => JSON.stringify(items.map((w) => [w.text, w.hint ?? '']));

// ── Editor ──────────────────────────────────────────────────────────────────

export function ScrambleEditor({ config, onChange }: EditorProps<ScrambleConfig>) {
  // De ruwe tekst blijft in het tekstveld staan zoals de leerkracht ze typt; alleen de
  // geparste lijst gaat naar de config. Verandert de config van buiten (bv. AI of
  // ongedaan maken), dan wordt het veld opnieuw opgebouwd.
  const [text, setText] = useState(() => formatScrambleLines(config.items));
  const [seen, setSeen] = useState(() => itemsKey(config.items));
  const incoming = itemsKey(config.items);
  if (incoming !== seen) {
    setSeen(incoming);
    setText(formatScrambleLines(config.items));
  }
  const word = config.mode === 'word';
  return (
    <div>
      <Field label="Soort oefening">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${config.mode === 'word' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, mode: 'word' })}>
            Letters husselen (woord)
          </button>
          <button className={`btn btn-sm ${config.mode === 'sentence' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, mode: 'sentence' })}>
            Woorden husselen (zin)
          </button>
        </div>
      </Field>
      <Field
        label={word ? 'Woorden' : 'Zinnen'}
        hint={`Eén ${word ? 'woord' : 'zin'} per regel. Optionele hint na een dubbelepunt en een spatie, bv.: ${word ? 'appel: een stuk fruit' : 'De zon schijnt vandaag.: weerbericht'}. Staat er zelf een dubbelepunt in je ${word ? 'woord' : 'zin'}, zet dan altijd een hint achteraan.`}
      >
        <textarea
          className="textarea" rows={8}
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            const items = parseScrambleLines(value);
            setText(value);
            setSeen(itemsKey(items));
            onChange({ ...config, items });
          }}
        />
      </Field>
    </div>
  );
}

/** De stukjes die de leerling te zien krijgt: letters of woorden, in een andere volgorde dan het origineel. */
export function scrambleParts(text: string, mode: 'word' | 'sentence'): string[] {
  const clean = text.trim();
  const parts = mode === 'word' ? clean.split('') : clean.split(/\s+/);
  if (parts.length < 2) return parts;
  let out = shuffled(parts);
  // zorg dat de husselversie niet toevallig gelijk is aan het origineel
  let guard = 0;
  while (out.join('\u0000') === parts.join('\u0000') && guard++ < 10) out = shuffled(parts);
  return out;
}

export function ScramblePlayer({ widget, timeUp, onComplete }: PlayerProps<ScrambleConfig>) {
  const items = useMemo(() => {
    const valid = widget.config.items.filter((i) => i.text.trim().length >= 2);
    return widget.settings.shuffle ? shuffled(valid) : valid;
  }, [widget.id]);
  const mode = widget.config.mode;

  const [round, setRound] = useState(0);
  const [pool, setPool] = useState<string[]>(() => (items[0] ? scrambleParts(items[0].text, mode) : []));
  const [picked, setPicked] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'ok' | 'nok' | null>(null);
  const [solved, setSolved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);

  const finish = (newSolved: number, newSkipped: number) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSolved(newSolved);
    setSkipped(newSkipped);
    setDone(true);
    onComplete({
      answers: { opgelost: newSolved, overgeslagen: newSkipped },
      itemScores: null,
      earned: newSolved,
      max: items.length,
    });
  };

  // Tijd om: de deelscore indienen en het resultaatscherm tonen. Een goed antwoord dat
  // nog op zijn bevestiging wacht, telt mee.
  useEffect(() => {
    if (timeUp && !done && items.length > 0) finish(solved + (feedback === 'ok' ? 1 : 0), skipped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (items.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen items ingesteld.</p>;

  const item = items[round];
  const sep = mode === 'word' ? '' : ' ';
  const attempt = picked.map((i) => pool[i]).join(sep);
  const isComplete = picked.length === pool.length;

  const goNext = (didSolve: boolean) => {
    if (submittedRef.current) return;
    const newSolved = solved + (didSolve ? 1 : 0);
    const newSkipped = skipped + (didSolve ? 0 : 1);
    if (round + 1 >= items.length) {
      finish(newSolved, newSkipped);
    } else {
      setSolved(newSolved);
      setSkipped(newSkipped);
      const next = round + 1;
      setRound(next);
      setPool(scrambleParts(items[next].text, mode));
      setPicked([]);
      setFeedback(null);
    }
  };

  const check = () => {
    if (normalizeAnswer(attempt) === normalizeAnswer(item.text)) {
      setFeedback('ok');
      setTimeout(() => goNext(true), 900);
    } else {
      setFeedback('nok');
      setTimeout(() => setFeedback(null), 900);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={solved} max={items.length}
        showScore={widget.settings.showScore}
        title={solved === items.length ? 'Alles opgelost!' : 'Klaar!'}
        subtitle={`Je loste ${solved} van de ${items.length} puzzels op.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          submittedRef.current = false;
          setRound(0); setPool(scrambleParts(items[0].text, mode)); setPicked([]);
          setSolved(0); setSkipped(0); setDone(false); setFeedback(null);
        }}><RetryIcon size={16} aria-hidden /> Opnieuw</button>
      </ResultHero>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <GameStatus>
        <span>Puzzel {round + 1} / {items.length}</span>
        <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> {solved}</span>
      </GameStatus>
      {item.hint && <p style={{ color: 'var(--text-soft)' }}><TipIcon size={16} className="icon-inline" aria-hidden /> Hint: <strong>{item.hint}</strong></p>}

      <div
        className="card"
        style={{
          minHeight: 74, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexWrap: 'wrap', gap: mode === 'word' ? 4 : 8, padding: 16, margin: '14px 0',
          fontSize: mode === 'word' ? '1.6rem' : '1.15rem', fontWeight: 700,
          borderColor: feedback === 'ok' ? 'var(--ok)' : feedback === 'nok' ? 'var(--err)' : undefined,
          background: feedback === 'ok' ? 'var(--ok-soft)' : feedback === 'nok' ? 'var(--err-soft)' : undefined,
        }}
        aria-live="polite"
      >
        {picked.length === 0 ? (
          <span style={{ color: 'var(--text-faint)', fontSize: '0.95rem', fontWeight: 500 }}>
            Klik de {mode === 'word' ? 'letters' : 'woorden'} hieronder in de juiste volgorde aan…
          </span>
        ) : (
          picked.map((pi, pos) => (
            <button
              key={pos}
              className="chip placed"
              style={{ fontSize: 'inherit', minWidth: 44, minHeight: 44 }}
              aria-label={`${pool[pi]} terugleggen`}
              onClick={() => setPicked((p) => p.filter((_, j) => j !== pos))}
            >
              {pool[pi]}
            </button>
          ))
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
        {pool.map((part, i) => (
          <button
            key={i}
            className={`chip ${picked.includes(i) ? 'used' : ''}`}
            style={{ fontSize: mode === 'word' ? '1.3rem' : '1rem', minWidth: 44, minHeight: 44 }}
            disabled={picked.includes(i)}
            onClick={() => setPicked((p) => [...p, i])}
          >
            {part}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        <button className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => setPicked([])} disabled={picked.length === 0}>Wissen</button>
        <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={check} disabled={!isComplete}><CheckIcon size={16} aria-hidden /> Controleren</button>
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => goNext(false)}>Overslaan <ArrowRight size={16} aria-hidden /></button>
      </div>
    </div>
  );
}
