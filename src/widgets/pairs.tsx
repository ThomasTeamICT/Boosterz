import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { PairsConfig } from '../lib/types';
import { normalizeAnswer, shuffled, shuffledNotIdentity, uid } from '../lib/utils';
import { matchChoiceCorrect } from '../lib/grading';
import { CheckIcon, CloseIcon, RetryIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

export function PairsEditor({ config, onChange }: EditorProps<PairsConfig>) {
  const pairs = config.pairs;
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling ziet twee kolommen en klikt telkens één item links en één item rechts aan om een paar te vormen.
      </p>
      {pairs.map((p, i) => (
        <div className="option-row" key={p.id}>
          <input className="input input-sm" placeholder="Links (bv. le chien)" value={p.left}
            onChange={(e) => { const next = pairs.slice(); next[i] = { ...p, left: e.target.value }; onChange({ ...config, pairs: next }); }} />
          <ArrowLeftRight size={16} aria-hidden />
          <input className="input input-sm" placeholder="Rechts (bv. de hond)" value={p.right}
            onChange={(e) => { const next = pairs.slice(); next[i] = { ...p, right: e.target.value }; onChange({ ...config, pairs: next }); }} />
          <button className="btn btn-quiet btn-icon btn-sm" aria-label="Paar verwijderen" disabled={pairs.length <= 2}
            onClick={() => onChange({ ...config, pairs: pairs.filter((_, j) => j !== i) })}><CloseIcon size={16} aria-hidden /></button>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => onChange({ ...config, pairs: [...pairs, { id: uid(), left: '', right: '' }] })}>
        + Paar toevoegen
      </button>
    </div>
  );
}

export function PairsPlayer({ widget, timeUp, onComplete }: PlayerProps<PairsConfig>) {
  const pairs = useMemo(() => widget.config.pairs.filter((p) => p.left && p.right), [widget.id]);
  const leftOrder = useMemo(() => (widget.settings.shuffle ? shuffled(pairs) : pairs), [widget.id]);
  // De rechterkolom staat nooit meteen goed naast de linkerkolom (tenzij alle rechtertekens gelijk zijn).
  const rightOrder = useMemo(
    () => shuffledNotIdentity(leftOrder, (a, b) => normalizeAnswer(a.right) === normalizeAnswer(b.right)),
    [widget.id],
  );

  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [selRight, setSelRight] = useState<string | null>(null);
  // Aparte sets: bij twee keer dezelfde rechtertekst kan een leerling de ene of de andere kaart kiezen.
  const [matchedLeft, setMatchedLeft] = useState<Set<string>>(new Set());
  const [matchedRight, setMatchedRight] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const submittedRef = useRef(false);

  // Tijd om: de deelscore indienen, eenmalig.
  useEffect(() => {
    if (!timeUp || submittedRef.current || pairs.length === 0) return;
    submittedRef.current = true;
    setDone(true);
    setTimedOut(true);
    onComplete({
      answers: { fouten: mistakes, paren: pairs.length, gekoppeld: matchedLeft.size },
      itemScores: null,
      earned: matchedLeft.size,
      max: pairs.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (pairs.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen paren ingesteld.</p>;

  const tryMatch = (leftId: string | null, rightId: string | null) => {
    if (!leftId || !rightId || submittedRef.current) return;
    // Juist: dezelfde kaart, of een kaart met dezelfde (genormaliseerde) rechtertekst.
    const idx = (id: string) => pairs.findIndex((p) => p.id === id);
    if (matchChoiceCorrect(pairs, idx(leftId), idx(rightId))) {
      const nextLeft = new Set(matchedLeft).add(leftId);
      setMatchedLeft(nextLeft);
      setMatchedRight((m) => new Set(m).add(rightId));
      setSelLeft(null); setSelRight(null);
      if (nextLeft.size === pairs.length) {
        submittedRef.current = true;
        setDone(true);
        onComplete({
          answers: { fouten: mistakes, paren: pairs.length },
          itemScores: null,
          earned: pairs.length,
          max: pairs.length,
        });
      }
    } else {
      setMistakes((m) => m + 1);
      setShake(rightId);
      setTimeout(() => { setShake(null); setSelLeft(null); setSelRight(null); }, 600);
    }
  };

  if (done) {
    return (
      <ResultHero
        earned={matchedLeft.size} max={pairs.length} showScore={false}
        title={timedOut ? 'De tijd is om!' : 'Alles gekoppeld!'}
        subtitle={timedOut
          ? `Je koppelde ${matchedLeft.size} van de ${pairs.length} paren, met ${mistakes} ${mistakes === 1 ? 'fout' : 'fouten'}.`
          : `Je vond alle ${pairs.length} paren met ${mistakes} ${mistakes === 1 ? 'fout' : 'fouten'}.`}
      >
        {!timedOut && (
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
            submittedRef.current = false;
            setMatchedLeft(new Set()); setMatchedRight(new Set()); setMistakes(0); setDone(false); setSelLeft(null); setSelRight(null);
          }}><RetryIcon size={16} aria-hidden /> Opnieuw spelen</button>
        )}
      </ResultHero>
    );
  }

  const col = (items: typeof pairs, side: 'left' | 'right') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0 }}>
      {items.map((p) => {
        const isMatched = (side === 'left' ? matchedLeft : matchedRight).has(p.id);
        const isSel = side === 'left' ? selLeft === p.id : selRight === p.id;
        const isShake = side === 'right' && shake === p.id;
        return (
          <button
            key={p.id}
            className={`answer-option ${isSel ? 'selected' : ''} ${isMatched ? 'correct' : ''} ${isShake ? 'incorrect' : ''}`}
            style={{ marginBottom: 0, justifyContent: 'center', textAlign: 'center', opacity: isMatched ? 0.55 : 1 }}
            disabled={isMatched}
            aria-pressed={isSel}
            onClick={() => {
              if (side === 'left') { setSelLeft(p.id); tryMatch(p.id, selRight); }
              else { setSelRight(p.id); tryMatch(selLeft, p.id); }
            }}
          >
            {side === 'left' ? p.left : p.right}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <GameStatus>
        <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> {matchedLeft.size} / {pairs.length}</span>
        <span className="badge badge-err"><CloseIcon size={14} className="icon-inline" aria-hidden /> {mistakes} fouten</span>
      </GameStatus>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginBottom: 14, fontSize: '0.9rem' }}>
        Klik een item links en het bijhorende item rechts aan.
      </p>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        {col(leftOrder, 'left')}
        {col(rightOrder, 'right')}
      </div>
    </div>
  );
}
