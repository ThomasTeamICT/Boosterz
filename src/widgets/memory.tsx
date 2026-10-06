import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MemoryConfig, MemoryPair } from '../lib/types';
import { shuffled, uid } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { CheckIcon, GoalIcon, RetryIcon } from '../components/icons';
import { EditorProps, GameStatus, ItemHeader, PlayerProps, ResultHero } from './shared';

export function MemoryEditor({ config, onChange }: EditorProps<MemoryConfig>) {
  const pairs = config.pairs;
  const update = (i: number, p: MemoryPair) => {
    const next = pairs.slice();
    next[i] = p;
    onChange({ ...config, pairs: next });
  };
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Elke rij vormt een paar: de leerling moet kaart A bij kaart B vinden. Gebruik tekst, een afbeelding of allebei.
      </p>
      {pairs.map((p, i) => (
        <div className="editor-item" key={p.id}>
          <ItemHeader
            index={i} label={`${p.a || '…'} — ${p.b || '…'}`}
            canUp={false} canDown={false}
            onMoveUp={() => {}} onMoveDown={() => {}}
            onDelete={() => onChange({ ...config, pairs: pairs.filter((_, j) => j !== i) })}
          />
          <div className="editor-item-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <Field label="Kaart A"><input className="input input-sm" value={p.a} onChange={(e) => update(i, { ...p, a: e.target.value })} /></Field>
              <ImagePicker value={p.aImage} onChange={(aImage) => update(i, { ...p, aImage })} label="Afbeelding A" />
            </div>
            <div>
              <Field label="Kaart B"><input className="input input-sm" value={p.b} onChange={(e) => update(i, { ...p, b: e.target.value })} /></Field>
              <ImagePicker value={p.bImage} onChange={(bImage) => update(i, { ...p, bImage })} label="Afbeelding B" />
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => onChange({ ...config, pairs: [...pairs, { id: uid(), a: '', b: '' }] })}>
        + Paar toevoegen
      </button>
    </div>
  );
}

interface Card { key: string; pairId: string; text: string; image?: string }

export function MemoryPlayer({ widget, timeUp, onComplete }: PlayerProps<MemoryConfig>) {
  const cards: Card[] = useMemo(() => {
    const valid = widget.config.pairs.filter((p) => (p.a || p.aImage) && (p.b || p.bImage));
    return shuffled(
      valid.flatMap((p) => [
        { key: p.id + ':a', pairId: p.id, text: p.a, image: p.aImage },
        { key: p.id + ':b', pairId: p.id, text: p.b, image: p.bImage },
      ])
    );
  }, [widget.id]);

  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [tries, setTries] = useState(0);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const submittedRef = useRef(false);
  const totalPairs = cards.length / 2;

  useEffect(() => {
    if (!done && !submittedRef.current && totalPairs > 0 && matched.size === totalPairs) {
      submittedRef.current = true;
      setDone(true);
      onComplete({
        answers: { pogingen: tries, paren: totalPairs },
        itemScores: null,
        earned: totalPairs,
        max: totalPairs,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, done]);

  // Tijd om: de deelscore indienen, eenmalig.
  useEffect(() => {
    if (!timeUp || submittedRef.current || totalPairs === 0) return;
    submittedRef.current = true;
    setDone(true);
    setTimedOut(true);
    setOpen([]);
    onComplete({
      answers: { pogingen: tries, paren: totalPairs, gevonden: matched.size },
      itemScores: null,
      earned: matched.size,
      max: totalPairs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (cards.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen paren in dit spel.</p>;

  const flip = (card: Card) => {
    if (locked || done || matched.has(card.pairId) || open.includes(card.key)) return;
    const nextOpen = [...open, card.key];
    setOpen(nextOpen);
    if (nextOpen.length === 2) {
      setTries((t) => t + 1);
      const [a, b] = nextOpen.map((k) => cards.find((c) => c.key === k)!);
      if (a.pairId === b.pairId) {
        setMatched((m) => new Set(m).add(a.pairId));
        setOpen([]);
      } else {
        setLocked(true);
        setTimeout(() => { setOpen([]); setLocked(false); }, 900);
      }
    }
  };

  const cols = cards.length <= 8 ? 4 : cards.length <= 12 ? 4 : cards.length <= 20 ? 5 : 6;

  if (done) {
    return (
      <ResultHero
        earned={matched.size} max={totalPairs} showScore={false}
        title={timedOut ? 'De tijd is om!' : 'Alle paren gevonden! 🧠'}
        subtitle={timedOut
          ? `Je vond ${matched.size} van de ${totalPairs} paren in ${tries} pogingen.`
          : `Je had ${tries} pogingen nodig voor ${totalPairs} paren.`}
      >
        {!timedOut && (
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
            submittedRef.current = false;
            setMatched(new Set()); setOpen([]); setTries(0); setDone(false);
          }}><RetryIcon size={16} aria-hidden /> Opnieuw spelen</button>
        )}
      </ResultHero>
    );
  }

  return (
    <div>
      <GameStatus>
        <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> {matched.size} / {totalPairs} paren</span>
        <span className="badge"><GoalIcon size={14} className="icon-inline" aria-hidden /> {tries} pogingen</span>
      </GameStatus>
      <div className="memory-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols * 130 }}>
        {cards.map((c) => {
          const isFlipped = open.includes(c.key) || matched.has(c.pairId);
          return (
            <button
              key={c.key}
              className={`memory-card ${isFlipped ? 'flipped' : ''} ${matched.has(c.pairId) ? 'matched' : ''}`}
              onClick={() => flip(c)}
              aria-label={isFlipped ? c.text || 'afbeelding' : 'Gesloten kaart'}
            >
              <span className="memory-card-inner">
                <span className="memory-face front" aria-hidden>?</span>
                <span className="memory-face back">
                  {c.image ? <img src={c.image} alt="" /> : c.text}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
