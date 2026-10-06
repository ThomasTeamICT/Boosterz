import React, { useMemo, useRef, useState } from 'react';
import type { ArithmeticConfig, ArithmeticOp, ItemScore } from '../lib/types';
import { Field } from '../components/ui';
import { NumberField } from '../components/NumberField';
import { CheckIcon, CloseIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

const OP_META: Record<ArithmeticOp, { label: string; symbol: string }> = {
  add: { label: 'Optellen', symbol: '+' },
  sub: { label: 'Aftrekken', symbol: '−' },
  mul: { label: 'Vermenigvuldigen', symbol: '×' },
  div: { label: 'Delen', symbol: ':' },
};

export function ArithmeticEditor({ config, onChange }: EditorProps<ArithmeticConfig>) {
  const toggleOp = (op: ArithmeticOp) => {
    const has = config.ops.includes(op);
    const next = has ? config.ops.filter((o) => o !== op) : [...config.ops, op];
    if (next.length === 0) return;
    onChange({ ...config, ops: next });
  };
  const toggleTable = (t: number) => {
    const has = config.tables.includes(t);
    onChange({ ...config, tables: has ? config.tables.filter((x) => x !== t) : [...config.tables, t].sort((a, b) => a - b) });
  };
  return (
    <div>
      <Field label="Bewerkingen">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(OP_META) as ArithmeticOp[]).map((op) => (
            <button key={op} className={`btn btn-sm ${config.ops.includes(op) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleOp(op)} aria-pressed={config.ops.includes(op)}>
              {OP_META[op].symbol} {OP_META[op].label}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        {/* NumberField: negatieve getallen en 0 kunnen gewoon getypt worden (geen terugval op 0 of 10) */}
        <Field label="Kleinste getal">
          <NumberField className="input input-sm" value={config.min} allow={Number.isInteger}
            onChange={(min) => onChange({ ...config, min })} />
        </Field>
        <Field label="Grootste getal">
          <NumberField className="input input-sm" value={config.max} allow={Number.isInteger}
            onChange={(max) => onChange({ ...config, max })} />
        </Field>
        <Field label="Aantal oefeningen">
          <NumberField className="input input-sm" min={1} max={50} value={config.count} allow={Number.isInteger}
            onChange={(count) => onChange({ ...config, count })} />
        </Field>
      </div>
      {config.ops.includes('mul') && (
        <Field label="Maaltafels (optioneel)" hint="Selecteer tafels om vermenigvuldigingen te beperken tot die tafels.">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => (
              <button key={t} className={`btn btn-sm ${config.tables.includes(t) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleTable(t)} aria-pressed={config.tables.includes(t)}>
                {t}
              </button>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

interface Sum { a: number; b: number; op: ArithmeticOp; answer: number }

/** De som als tekst; een negatief tweede getal krijgt haakjes ("2 − (-3)"). */
const sumText = (s: Sum) => `${s.a} ${OP_META[s.op].symbol} ${s.b < 0 ? `(${s.b})` : s.b}`;

function makeSums(config: ArithmeticConfig): Sum[] {
  const rint = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  const sums: Sum[] = [];
  const min = Math.min(config.min, config.max);
  const max = Math.max(config.min, config.max);
  for (let i = 0; i < config.count; i++) {
    const op = config.ops[rint(0, config.ops.length - 1)];
    let a = rint(min, max);
    let b = rint(min, max);
    if (op === 'sub' && b > a) [a, b] = [b, a];
    if (op === 'mul' && config.tables.length > 0) {
      b = config.tables[rint(0, config.tables.length - 1)];
      a = rint(1, 10);
    }
    if (op === 'div') {
      // deelbare sommen maken: quotiënt × deler
      b = Math.max(1, rint(Math.max(1, min), Math.min(10, Math.max(2, max))));
      const q = rint(1, Math.max(2, Math.min(10, max)));
      a = b * q;
    }
    const answer = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a / b;
    sums.push({ a, b, op, answer });
  }
  return sums;
}

export function ArithmeticPlayer({ widget, timeUp, onComplete }: PlayerProps<ArithmeticConfig>) {
  const sums = useMemo(() => makeSums(widget.config), [widget.id]);
  const [idx, setIdx] = useState(0);
  const [given, setGiven] = useState<(number | null)[]>([]);
  const [current, setCurrent] = useState('');
  const [feedback, setFeedback] = useState<'ok' | 'nok' | null>(null);
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = (answers: (number | null)[]) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const itemScores: Record<string, ItemScore> = {};
    let earned = 0;
    sums.forEach((s, i) => {
      const ok = answers[i] === s.answer;
      itemScores[`sum${i}`] = { earned: ok ? 1 : 0, max: 1, mode: 'auto' };
      if (ok) earned++;
    });
    onComplete({
      answers: Object.fromEntries(sums.map((s, i) => [`sum${i}`, `${sumText(s)} = ${answers[i] ?? '—'}`])),
      itemScores,
      earned,
      max: sums.length,
    });
    // het resultaatscherm leest `given`: ook bij "tijd om" moet daar het laatste antwoord in staan
    setGiven(answers);
    setDone(true);
  };

  React.useEffect(() => {
    if (timeUp && !done) finish([...given, current === '' ? null : parseFloat(current.replace(',', '.'))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (sums.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Geen oefeningen geconfigureerd.</p>;

  const submit = () => {
    const val = current === '' ? null : parseFloat(current.replace(',', '.'));
    const ok = val === sums[idx].answer;
    setFeedback(ok ? 'ok' : 'nok');
    // het veld is tijdens de feedback readOnly (niet disabled), dus de focus blijft; ook na
    // een klik op OK (die knop wordt uitgeschakeld) brengen we ze terug naar het veld
    inputRef.current?.focus();
    setTimeout(() => {
      if (submittedRef.current) return; // tijd om: de oefening is al ingediend
      const answers = [...given, val];
      setGiven(answers);
      setCurrent('');
      setFeedback(null);
      if (idx + 1 >= sums.length) finish(answers);
      else { setIdx((i) => i + 1); inputRef.current?.focus(); }
    }, ok ? 500 : 1100);
  };

  if (done) {
    const correct = sums.filter((s, i) => given[i] === s.answer).length;
    return (
      <div>
        <ResultHero earned={correct} max={sums.length} showScore={widget.settings.showScore} />
        {widget.settings.showFeedback && (
          <div className="card card-pad" style={{ marginTop: 16, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
            <h3>Verbetering</h3>
            {sums.map((s, i) => {
              const ok = given[i] === s.answer;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontWeight: 600 }}>{sumText(s)} = {given[i] ?? '—'}</span>
                  <span style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {ok ? <CheckIcon size={16} aria-hidden /> : <><CloseIcon size={16} aria-hidden /> ({s.answer})</>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const s = sums[idx];
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
      <GameStatus>
        <span>Oefening {idx + 1} / {sums.length}</span>
        <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> {given.filter((g, i) => g === sums[i].answer).length}</span>
      </GameStatus>
      <div
        className="card card-pad"
        style={{
          fontSize: 'clamp(2rem, 8vw, 3.2rem)', fontWeight: 800, padding: '34px 20px',
          fontVariantNumeric: 'tabular-nums',
          borderColor: feedback === 'ok' ? 'var(--ok)' : feedback === 'nok' ? 'var(--err)' : undefined,
          background: feedback === 'ok' ? 'var(--ok-soft)' : feedback === 'nok' ? 'var(--err-soft)' : undefined,
        }}
        aria-live="polite"
      >
        {sumText(s)} = {feedback === 'nok' ? <span style={{ color: 'var(--err)' }}>{current || '?'}</span> : current || '?'}
        {feedback === 'nok' && <div style={{ fontSize: '1.1rem', color: 'var(--err)', fontWeight: 700 }}>Juiste antwoord: {s.answer}</div>}
        {feedback === 'ok' && <div style={{ fontSize: '1.3rem', color: 'var(--ok)' }} aria-label="juist"><CheckIcon aria-hidden /></div>}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (current !== '' && !feedback) submit(); }}
        style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'center' }}
      >
        <input
          ref={inputRef}
          className="input"
          type="number"
          inputMode="decimal"
          step="any"
          style={{ maxWidth: 180, fontSize: '1.4rem', textAlign: 'center', fontWeight: 700 }}
          value={current}
          readOnly={!!feedback}
          onChange={(e) => setCurrent(e.target.value)}
          aria-label="Jouw antwoord"
          autoFocus
        />
        <button className="btn btn-primary btn-lg" type="submit" disabled={current === '' || !!feedback}>OK</button>
      </form>
    </div>
  );
}
