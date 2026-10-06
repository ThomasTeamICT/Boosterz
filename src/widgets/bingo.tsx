import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import type { BingoConfig } from '../lib/types';
import { shuffled } from '../lib/utils';
import { CheckRow, Field } from '../components/ui';
import { WarningIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

export function BingoEditor({ config, onChange }: EditorProps<BingoConfig>) {
  const needed = config.size * config.size - (config.freeCenter && config.size % 2 === 1 ? 1 : 0);
  const valid = config.items.filter((i) => i.trim()).length;
  return (
    <div>
      <Field label="Begrippen" hint={`Eén begrip per regel. Elke leerling krijgt een eigen, willekeurige kaart. Je hebt er minstens ${needed} nodig.`}>
        <textarea
          className="textarea" rows={10}
          value={config.items.join('\n')}
          onChange={(e) => onChange({ ...config, items: e.target.value.split('\n') })}
        />
      </Field>
      <Field label="Kaartgrootte">
        <div style={{ display: 'flex', gap: 8 }}>
          {([3, 4, 5] as const).map((s) => (
            <button key={s} className={`btn btn-sm ${config.size === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, size: s })}>
              {s} × {s}
            </button>
          ))}
        </div>
      </Field>
      {config.size % 2 === 1 && (
        <CheckRow checked={config.freeCenter} onChange={(v) => onChange({ ...config, freeCenter: v })} label="Gratis vakje in het midden" />
      )}
      {valid < needed && (
        <div className="callout warn">
          <WarningIcon aria-hidden />
          <div>Je hebt {valid} begrippen; voeg er nog {needed - valid} toe voor een volledige kaart.</div>
        </div>
      )}
    </div>
  );
}

function hasBingo(marked: boolean[], size: number): boolean {
  for (let r = 0; r < size; r++) {
    if (Array.from({ length: size }, (_, c) => marked[r * size + c]).every(Boolean)) return true;
    if (Array.from({ length: size }, (_, c) => marked[c * size + r]).every(Boolean)) return true;
  }
  if (Array.from({ length: size }, (_, i) => marked[i * size + i]).every(Boolean)) return true;
  if (Array.from({ length: size }, (_, i) => marked[i * size + (size - 1 - i)]).every(Boolean)) return true;
  return false;
}

export function BingoPlayer({ widget, timeUp, onComplete }: PlayerProps<BingoConfig>) {
  const { size, freeCenter } = widget.config;
  const centerIdx = size % 2 === 1 && freeCenter ? Math.floor((size * size) / 2) : -1;

  const cells = useMemo(() => {
    const items = shuffled(widget.config.items.filter((i) => i.trim()));
    const out: string[] = [];
    let it = 0;
    for (let i = 0; i < size * size; i++) {
      if (i === centerIdx) out.push('GRATIS');
      else out.push(items[it++] ?? '—');
    }
    return out;
  }, [widget.id]);

  const [marked, setMarked] = useState<boolean[]>(() =>
    Array.from({ length: size * size }, (_, i) => i === centerIdx)
  );
  const [won, setWon] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const submittedRef = useRef(false);

  // Tijd om: indienen wat er is aangekruist (nog geen bingo = 0 van 1), eenmalig.
  useEffect(() => {
    if (!timeUp || submittedRef.current) return;
    submittedRef.current = true;
    setTimedOut(true);
    onComplete({
      answers: { aangekruist: cells.filter((_, j) => marked[j]) },
      itemScores: null,
      earned: 0,
      max: 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const toggle = (i: number) => {
    if (i === centerIdx || won || timedOut || submittedRef.current) return;
    const next = marked.slice();
    next[i] = !next[i];
    setMarked(next);
    if (hasBingo(next, size)) {
      submittedRef.current = true;
      setWon(true);
      onComplete({
        answers: { aangekruist: cells.filter((_, j) => next[j]) },
        itemScores: null,
        earned: 1,
        max: 1,
      });
    }
  };

  if (timedOut) {
    const aangekruist = marked.filter((m, j) => m && j !== centerIdx).length;
    return (
      <ResultHero
        earned={0} max={1} showScore={false}
        title="De tijd is om!"
        subtitle={`Je had ${aangekruist} ${aangekruist === 1 ? 'vakje' : 'vakjes'} aangekruist en nog geen bingo.`}
      />
    );
  }

  return (
    <div>
      <GameStatus>
        <span>Kruis een vakje aan wanneer het begrip aan bod komt.</span>
      </GameStatus>
      {won && (
        <p style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 800, color: 'var(--ok)' }} role="alert">
          🎉 BINGO! 🎉
        </p>
      )}
      <div className="bingo-grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => (
          <button
            key={i}
            className={`bingo-cell ${marked[i] ? 'marked' : ''} ${i === centerIdx ? 'free' : ''}`}
            aria-pressed={marked[i]}
            onClick={() => toggle(i)}
          >
            {i === centerIdx ? <><Star size={16} className="icon-inline" aria-hidden /> {c}</> : c}
          </button>
        ))}
      </div>
    </div>
  );
}
