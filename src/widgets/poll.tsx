import React, { useEffect, useRef, useState } from 'react';
import { Vote } from 'lucide-react';
import type { PollConfig } from '../lib/types';
import { getSubmissions } from '../lib/storage';
import { CheckRow, Field } from '../components/ui';
import { CheckIcon } from '../components/icons';
import { EditorProps, PlayerProps } from './shared';

export function PollEditor({ config, onChange }: EditorProps<PollConfig>) {
  return (
    <div>
      <Field label="Vraag of stelling">
        <textarea className="textarea" rows={2} value={config.question} placeholder="bv. Welk onderwerp wil je volgende week herhalen?"
          onChange={(e) => onChange({ ...config, question: e.target.value })} />
      </Field>
      <Field label="Opties" hint="Eén optie per regel.">
        <textarea className="textarea" rows={5} value={config.options.join('\n')}
          onChange={(e) => onChange({ ...config, options: e.target.value.split('\n') })} />
      </Field>
      <CheckRow checked={config.allowMultiple} onChange={(v) => onChange({ ...config, allowMultiple: v })} label="Meerdere antwoorden toestaan" />
      <CheckRow checked={config.showResults} onChange={(v) => onChange({ ...config, showResults: v })} label="Resultaten tonen aan de leerling na het stemmen" />
      {config.showResults && (
        <p className="hint" style={{ marginTop: 4 }}>
          De leerling ziet alleen de stemmen die op hetzelfde toestel zijn uitgebracht. Een peiling telt dus per toestel: stemmen van andere toestellen komen er niet bij.
        </p>
      )}
    </div>
  );
}

export function PollPlayer({ widget, preview, timeUp, onComplete }: PlayerProps<PollConfig>) {
  const options = widget.config.options.filter((o) => o.trim());
  const [selected, setSelected] = useState<number[]>([]);
  const [voted, setVoted] = useState(false);
  const submittedRef = useRef(false);

  // Tijd om: de gekozen opties indienen (zonder keuze wordt er geen stem geteld), eenmalig.
  useEffect(() => {
    if (!timeUp || submittedRef.current || options.length < 2) return;
    submittedRef.current = true;
    setVoted(true);
    onComplete({
      answers: { keuzes: selected.map((i) => options[i]) },
      itemScores: null,
      earned: 0,
      max: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (options.length < 2) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Voeg minstens 2 opties toe.</p>;

  const toggle = (i: number) => {
    if (voted) return;
    if (widget.config.allowMultiple) {
      setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
    } else {
      setSelected([i]);
    }
  };

  const vote = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setVoted(true);
    onComplete({
      answers: { keuzes: selected.map((i) => options[i]) },
      itemScores: null,
      earned: 0,
      max: 0,
    });
  };

  if (voted && widget.config.showResults && selected.length > 0) {
    // alle stemmen in deze browser optellen (incl. deze stem). Een peiling heeft geen server:
    // wat hier staat zijn dus alleen de stemmen op dit toestel.
    const subs = preview ? [] : getSubmissions(widget.id);
    const counts = options.map((o) =>
      subs.filter((s) => Array.isArray((s.answers as any).keuzes) && ((s.answers as any).keuzes as string[]).includes(o)).length
    );
    selected.forEach((i) => { if (preview) counts[i]++; });
    const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center' }}>{widget.config.question}</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Bedankt voor je stem! Dit zijn de stemmen op dit toestel:</p>
        {options.map((o, i) => {
          const p = Math.round((counts[i] / total) * 100);
          return (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 4 }}>
                <span>{o}{selected.includes(i) && <CheckIcon size={14} className="icon-inline" aria-hidden />}</span>
                <span style={{ color: 'var(--text-soft)' }}>{counts[i]} ({p}%)</span>
              </div>
              <div className="progressbar"><div style={{ width: `${p}%` }} /></div>
            </div>
          );
        })}
      </div>
    );
  }

  if (voted) {
    return (
      <div className="card result-hero">
        <Vote size={48} aria-hidden />
        <h2>{selected.length > 0 ? 'Je stem is geregistreerd!' : 'De tijd is om. Er is geen stem uitgebracht.'}</h2>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 20 }}>{widget.config.question}</h2>
      {options.map((o, i) => (
        <button
          key={i}
          className={`answer-option ${selected.includes(i) ? 'selected' : ''}`}
          aria-pressed={selected.includes(i)}
          onClick={() => toggle(i)}
        >
          <span className="marker" aria-hidden>{selected.includes(i) && <CheckIcon size={14} />}</span>
          {o}
        </button>
      ))}
      {widget.config.allowMultiple && <p className="hint">Meerdere antwoorden mogelijk.</p>}
      <div className="player-nav">
        <span />
        <button className="btn btn-primary btn-lg" disabled={selected.length === 0} onClick={vote}>
          <Vote size={18} aria-hidden /> Stem uitbrengen
        </button>
      </div>
    </div>
  );
}
