import React, { useEffect, useRef, useState } from 'react';
import type { ChecklistConfig } from '../lib/types';
import { Field } from '../components/ui';
import { CheckIcon } from '../components/icons';
import { uid } from '../lib/utils';
import { EditorProps, PlayerProps, ResultHero } from './shared';

export function ChecklistEditor({ config, onChange }: EditorProps<ChecklistConfig>) {
  return (
    <div>
      <Field label="Titel boven de lijst">
        <input className="input" value={config.title} placeholder="bv. Stappenplan werkstuk"
          onChange={(e) => onChange({ ...config, title: e.target.value })} />
      </Field>
      <Field label="Stappen" hint="Eén stap per regel, in de juiste volgorde.">
        <textarea
          className="textarea" rows={8}
          value={config.items.map((i) => i.text).join('\n')}
          onChange={(e) => onChange({ ...config, items: e.target.value.split('\n').map((text) => ({ id: uid(), text })) })}
        />
      </Field>
    </div>
  );
}

export function ChecklistPlayer({ widget, timeUp, onComplete }: PlayerProps<ChecklistConfig>) {
  const items = widget.config.items.filter((i) => i.text.trim());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const submittedRef = useRef(false);

  // Tijd om: indienen wat al afgevinkt is, eenmalig.
  useEffect(() => {
    if (!timeUp || submittedRef.current || items.length === 0) return;
    submittedRef.current = true;
    setDone(true);
    setTimedOut(true);
    onComplete({
      answers: { afgevinkt: items.filter((i) => checked.has(i.id)).map((i) => i.text) },
      itemScores: null,
      earned: checked.size,
      max: items.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (items.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen stappen ingesteld.</p>;

  if (done) {
    return (
      <ResultHero
        earned={checked.size} max={items.length} showScore={false}
        title={timedOut ? 'De tijd is om!' : 'Checklist ingediend!'}
        subtitle={`${checked.size} van de ${items.length} stappen afgevinkt.`}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {widget.config.title && <h2 style={{ textAlign: 'center' }}>{widget.config.title}</h2>}
      <div className="progressbar" style={{ margin: '14px 0 20px' }}>
        <div style={{ width: `${(checked.size / items.length) * 100}%` }} />
      </div>
      <div className="card card-pad">
        {items.map((item, i) => {
          const isChecked = checked.has(item.id);
          return (
            <label key={item.id} className="checkbox-row" style={{ fontSize: '1.05rem', textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.65 : 1 }}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(item.id); else next.delete(item.id);
                  setChecked(next);
                }}
              />
              <span><strong style={{ marginRight: 8, color: 'var(--text-faint)' }}>{i + 1}.</strong>{item.text}</span>
            </label>
          );
        })}
      </div>
      <div className="player-nav">
        <span style={{ fontWeight: 600, color: 'var(--text-soft)' }}>{checked.size} / {items.length} klaar</span>
        <button
          className="btn btn-primary"
          onClick={() => {
            submittedRef.current = true;
            setDone(true);
            onComplete({
              answers: { afgevinkt: items.filter((i) => checked.has(i.id)).map((i) => i.text) },
              itemScores: null,
              earned: checked.size,
              max: items.length,
            });
          }}
        >
<CheckIcon size={18} aria-hidden /> Indienen
        </button>
      </div>
    </div>
  );
}
