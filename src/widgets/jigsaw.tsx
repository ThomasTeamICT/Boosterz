import React, { useEffect, useRef, useState } from 'react';
import { AlarmClock, EyeOff, Puzzle } from 'lucide-react';
import type { JigsawConfig } from '../lib/types';
import { clamp, shuffled } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { PreviewIcon, RetryIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps } from './shared';

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/** Safari en iPadOS 14 kennen aspect-ratio niet (pas vanaf 15): daar houdt het bord zijn verhouding via padding-top. */
const metVerhouding = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('aspect-ratio', '1');

const DIM_OPTIONS = [2, 3, 4, 5, 6] as const;

function clampDim(n: number): number {
  return clamp(Math.round(Number.isFinite(n) ? n : 3), 2, 6);
}

/**
 * Geschud bord: board[positie] = stukje dat er nu ligt.
 * Gegarandeerd nooit al opgelost bij de start.
 */
function scrambledBoard(total: number): number[] {
  const base = Array.from({ length: total }, (_, i) => i);
  for (let poging = 0; poging < 25; poging++) {
    const b = shuffled(base);
    if (b.some((tile, pos) => tile !== pos)) return b;
  }
  // Uiterst onwaarschijnlijke terugvaloptie: alles één plek doorschuiven.
  return base.map((_, i) => (i + 1) % total);
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

export function JigsawEditor({ config, onChange }: EditorProps<JigsawConfig>) {
  const cols = clampDim(config.cols);
  const rows = clampDim(config.rows);

  const dimField = (label: string, value: number, set: (n: number) => void) => (
    <Field label={label}>
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
        {DIM_OPTIONS.map((n) => (
          <button
            key={n}
            className={`btn btn-sm ${value === n ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={value === n}
            aria-label={`${n} ${label.toLowerCase()}`}
            onClick={() => set(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </Field>
  );

  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De afbeelding wordt in stukjes verdeeld en geschud. De leerling wisselt telkens twee
        stukjes van plaats tot de afbeelding weer klopt.
      </p>
      <ImagePicker
        value={config.imageUrl || undefined}
        onChange={(url) => onChange({ ...config, imageUrl: url ?? '' })}
        label="Puzzelafbeelding"
      />
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        {dimField('Kolommen', cols, (n) => onChange({ ...config, cols: n }))}
        {dimField('Rijen', rows, (n) => onChange({ ...config, rows: n }))}
      </div>
      <p className="hint" style={{ marginTop: -4, marginBottom: 14 }}>
        {cols} × {rows} = <strong>{cols * rows} stukjes</strong>
        {cols * rows >= 25 ? ' — best pittig!' : ''}
      </p>
      {config.imageUrl ? (
        <Field label="Voorbeeld met snijlijnen">
          <div
            style={{
              position: 'relative', alignSelf: 'flex-start', maxWidth: '100%',
              borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)',
            }}
          >
            <img
              src={config.imageUrl}
              alt="Voorbeeld van de gekozen puzzelafbeelding"
              style={{ display: 'block', maxWidth: '100%', maxHeight: 280 }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,0.85) 0 2px, transparent 2px), ' +
                  'linear-gradient(to bottom, rgba(255,255,255,0.85) 0 2px, transparent 2px)',
                backgroundSize: `${100 / cols}% ${100 / rows}%`,
              }}
            />
          </div>
        </Field>
      ) : (
        <p className="hint">Kies eerst een afbeelding (bv. een foto, kaart of schema). Afbeeldingen met veel details puzzelen het fijnst.</p>
      )}
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

export function JigsawPlayer({ widget, timeUp, onComplete }: PlayerProps<JigsawConfig>) {
  const imageUrl = widget.config.imageUrl ?? '';
  const cols = clampDim(widget.config.cols);
  const rows = clampDim(widget.config.rows);
  const total = cols * rows;

  const [board, setBoard] = useState<number[]>(() => scrambledBoard(total));
  const [moves, setMoves] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);
  const submittedRef = useRef(false);

  // Opnieuw opzetten wanneer de configuratie wijzigt (bv. live in het voorbeeld).
  const cfgKey = `${widget.id}|${cols}x${rows}|${imageUrl.length}|${imageUrl.slice(-24)}`;
  const [boardKey, setBoardKey] = useState(cfgKey);
  if (boardKey !== cfgKey) {
    setBoardKey(cfgKey);
    setBoard(scrambledBoard(total));
    setMoves(0);
    setSelected(null);
    setDone(false);
    setDragFrom(null);
    setDragOver(null);
  }

  // Beeldverhouding van de afbeelding bepalen (geen canvas nodig).
  useEffect(() => {
    if (!imageUrl) return;
    let alive = true;
    setRatio(null);
    setImgError(false);
    const img = new Image();
    img.onload = () => { if (alive) setRatio(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1); };
    img.onerror = () => { if (alive) setImgError(true); };
    img.src = imageUrl;
    return () => { alive = false; };
  }, [imageUrl]);

  const finish = (finalMoves: number) => {
    setDone(true);
    setSelected(null);
    setDragFrom(null);
    setDragOver(null);
    if (!submittedRef.current) {
      submittedRef.current = true;
      onComplete({
        answers: { zetten: finalMoves, opgelost: true },
        itemScores: null,
        earned: 1,
        max: 1,
      });
    }
  };

  const swap = (a: number, b: number) => {
    if (done || expired) return;
    if (a === b || a < 0 || b < 0 || a >= board.length || b >= board.length) {
      setSelected(null);
      return;
    }
    const next = board.slice();
    [next[a], next[b]] = [next[b], next[a]];
    const nextMoves = moves + 1;
    setBoard(next);
    setMoves(nextMoves);
    setSelected(null);
    if (next.every((tile, pos) => tile === pos)) finish(nextMoves);
  };

  // Tijd om → huidige stand meteen indienen.
  useEffect(() => {
    if (timeUp && !submittedRef.current) {
      submittedRef.current = true;
      setExpired(true);
      setSelected(null);
      setDragFrom(null);
      setDragOver(null);
      onComplete({
        answers: {
          zetten: moves,
          opgelost: false,
          stukjesJuist: board.filter((tile, pos) => tile === pos).length,
        },
        itemScores: null,
        earned: 0,
        max: 1,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (!imageUrl) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Deze puzzel heeft nog geen afbeelding. Vraag je leerkracht om er één te kiezen.
      </p>
    );
  }
  if (imgError) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        De puzzelafbeelding kon niet geladen worden. Herlaad de pagina of verwittig je leerkracht.
      </p>
    );
  }

  const locked = done || expired;

  const tileStyle = (tile: number): React.CSSProperties => {
    const r = Math.floor(tile / cols);
    const c = tile % cols;
    return {
      backgroundImage: `url("${imageUrl}")`,
      backgroundSize: `${cols * 100}% ${rows * 100}%`,
      backgroundPosition: `${cols > 1 ? (c / (cols - 1)) * 100 : 50}% ${rows > 1 ? (r / (rows - 1)) * 100 : 50}%`,
    };
  };

  return (
    <div>
      <GameStatus>
        <span className="badge badge-brand"><Puzzle size={14} className="icon-inline" aria-hidden /> {moves} {moves === 1 ? 'zet' : 'zetten'}</span>
        <span className="badge">{cols} × {rows} — {total} stukjes</span>
      </GameStatus>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginBottom: 10, fontSize: '0.9rem' }}>
        Klik twee stukjes na elkaar aan om ze te wisselen, of versleep een stukje naar een andere plek.
      </p>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <button
          className="btn btn-sm btn-ghost"
          aria-pressed={showExample}
          onClick={() => setShowExample((v) => !v)}
        >
          {showExample ? <><EyeOff size={16} aria-hidden /> Voorbeeld verbergen</> : <><PreviewIcon size={16} aria-hidden /> Voorbeeld tonen</>}
        </button>
      </div>
      {showExample && (
        <img
          src={imageUrl}
          alt="Voorbeeld van de volledige afbeelding"
          style={{
            display: 'block', margin: '0 auto 14px', maxWidth: 'min(100%, 240px)', maxHeight: 160,
            borderRadius: 8, border: '1px solid var(--line)', objectFit: 'contain',
          }}
        />
      )}
      {ratio === null ? (
        <p style={{ textAlign: 'center', color: 'var(--text-soft)' }} role="status">Afbeelding laden…</p>
      ) : (
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
          <div style={metVerhouding ? undefined : { position: 'relative', height: 0, paddingTop: `${100 / ratio}%` }}>
          <div
            role="group"
            aria-label={`Puzzelbord met ${total} stukjes`}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: 3,
              ...(metVerhouding ? { aspectRatio: String(ratio) } : { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }),
              background: 'var(--bg-sunken)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 3,
              boxShadow: 'var(--shadow-2)',
            }}
          >
            {board.map((tile, pos) => {
              const isSel = selected === pos;
              const isOver = dragOver === pos && dragFrom !== null && dragFrom !== pos;
              const posLabel = `rij ${Math.floor(pos / cols) + 1}, kolom ${(pos % cols) + 1}`;
              return (
                <button
                  key={pos}
                  type="button"
                  draggable={!locked}
                  disabled={locked}
                  aria-pressed={isSel}
                  aria-label={`Puzzelstukje op ${posLabel}${isSel ? ' — geselecteerd, kies een tweede stukje om te wisselen' : ''}`}
                  onClick={() => {
                    if (locked) return;
                    if (selected === null) setSelected(pos);
                    else swap(selected, pos);
                  }}
                  onDragStart={(e) => {
                    if (locked) { e.preventDefault(); return; }
                    setSelected(null);
                    setDragFrom(pos);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(pos));
                  }}
                  onDragOver={(e) => {
                    if (locked || dragFrom === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOver !== pos) setDragOver(pos);
                  }}
                  onDragLeave={() => { if (dragOver === pos) setDragOver(null); }}
                  onDrop={(e) => {
                    if (locked) return;
                    e.preventDefault();
                    const raw = e.dataTransfer.getData('text/plain');
                    const from = raw !== '' ? Number.parseInt(raw, 10) : (dragFrom ?? -1);
                    setDragFrom(null);
                    setDragOver(null);
                    if (Number.isInteger(from) && from >= 0) swap(from, pos);
                  }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  style={{
                    ...tileStyle(tile),
                    border: 'none', padding: 0, font: 'inherit',
                    width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'block',
                    borderRadius: 5,
                    cursor: locked ? 'default' : 'grab',
                    // Groen randje pas ná voltooiing — tijdens het spelen verklappen we niets.
                    boxShadow: done
                      ? 'inset 0 0 0 2px var(--ok)'
                      : isSel || isOver
                        ? 'inset 0 0 0 3px var(--player-accent, var(--brand))'
                        : 'inset 0 0 0 1px rgba(0, 0, 0, 0.15)',
                    transform: isSel ? 'scale(0.9)' : isOver ? 'scale(1.05)' : 'none',
                    opacity: dragFrom === pos ? 0.45 : 1,
                    transition: 'transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease',
                  }}
                />
              );
            })}
          </div>
          </div>
          {locked && (
            <div
              role="status"
              aria-live="assertive"
              style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                background: 'color-mix(in srgb, var(--bg) 45%, transparent)', borderRadius: 12,
              }}
            >
              <div className="card" style={{ padding: '20px 28px', textAlign: 'center', boxShadow: 'var(--shadow-3)', maxWidth: '90%' }}>
                {done ? (
                  <>
                    <Puzzle size={38} aria-hidden />
                    <h2 style={{ margin: '4px 0 6px' }}>Puzzel klaar!</h2>
                    <p style={{ margin: 0, color: 'var(--text-soft)' }}>
                      Je legde de puzzel in <strong>{moves}</strong> {moves === 1 ? 'zet' : 'zetten'}. Knap gedaan!
                    </p>
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: 14 }}
                      onClick={() => {
                        setBoard(scrambledBoard(total));
                        setMoves(0);
                        setSelected(null);
                        setDone(false);
                        setDragFrom(null);
                        setDragOver(null);
                      }}
                    >
                      <RetryIcon size={16} aria-hidden /> Nog eens leggen
                    </button>
                  </>
                ) : (
                  <>
                    <AlarmClock size={38} aria-hidden />
                    <h2 style={{ margin: '4px 0 6px' }}>De tijd is om</h2>
                    <p style={{ margin: 0, color: 'var(--text-soft)' }}>
                      Je stand is ingediend na {moves} {moves === 1 ? 'zet' : 'zetten'}.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
