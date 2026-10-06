import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { CrosswordConfig, CrosswordEntry } from '../lib/types';
import { normalizeAnswer, uid } from '../lib/utils';
import {
  CheckIcon, CloseIcon, MoveDownIcon, TipIcon, WarningIcon,
} from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

// ── Generator ───────────────────────────────────────────────────────────────

export interface Placement {
  word: string;       // genormaliseerd, hoofdletters
  original: string;
  clue: string;
  x: number;
  y: number;
  dir: 'across' | 'down';
  number: number;
}

interface GenResult {
  placements: Placement[];
  width: number;
  height: number;
  skipped: string[];
  /** Woorden die weggelaten zijn omdat hetzelfde woord al in de lijst staat (genormaliseerd). */
  duplicates: string[];
}

function cleanWord(w: string): string {
  return normalizeAnswer(w).toUpperCase().replace(/[^A-Z]/g, '');
}

/** Greedy kruiswoordgenerator: langste woord eerst, daarna zoveel mogelijk kruisingen. */
export function generateCrossword(entries: CrosswordEntry[]): GenResult {
  // Elk woord één keer: "huis" en "Huis" zijn hetzelfde woord. Het eerste telt, met zijn omschrijving.
  const words: (CrosswordEntry & { clean: string })[] = [];
  const duplicates: string[] = [];
  const seenWords = new Set<string>();
  for (const e of entries) {
    const clean = cleanWord(e.word);
    if (clean.length < 2) continue;
    if (seenWords.has(clean)) { duplicates.push(e.word.trim()); continue; }
    seenWords.add(clean);
    words.push({ ...e, clean });
  }
  const sorted = words.slice().sort((a, b) => b.clean.length - a.clean.length);

  const grid = new Map<string, string>(); // "x,y" → letter
  const placed: Omit<Placement, 'number'>[] = [];
  const skipped: string[] = [];
  const key = (x: number, y: number) => `${x},${y}`;

  const canPlace = (w: string, x: number, y: number, dir: 'across' | 'down'): number => {
    const dx = dir === 'across' ? 1 : 0;
    const dy = dir === 'down' ? 1 : 0;
    // cel vóór en na het woord moet vrij zijn
    if (grid.has(key(x - dx, y - dy))) return -1;
    if (grid.has(key(x + dx * w.length, y + dy * w.length))) return -1;
    let crossings = 0;
    for (let i = 0; i < w.length; i++) {
      const cx = x + dx * i;
      const cy = y + dy * i;
      const existing = grid.get(key(cx, cy));
      if (existing !== undefined) {
        if (existing !== w[i]) return -1;
        crossings++;
      } else {
        // aangrenzende cellen loodrecht moeten vrij zijn
        if (dir === 'across') {
          if (grid.has(key(cx, cy - 1)) || grid.has(key(cx, cy + 1))) return -1;
        } else {
          if (grid.has(key(cx - 1, cy)) || grid.has(key(cx + 1, cy))) return -1;
        }
      }
    }
    return crossings;
  };

  const put = (e: { clean: string; word: string; clue: string }, x: number, y: number, dir: 'across' | 'down') => {
    const dx = dir === 'across' ? 1 : 0;
    const dy = dir === 'down' ? 1 : 0;
    for (let i = 0; i < e.clean.length; i++) grid.set(key(x + dx * i, y + dy * i), e.clean[i]);
    placed.push({ word: e.clean, original: e.word, clue: e.clue, x, y, dir });
  };

  const tryPlace = (e: { clean: string; word: string; clue: string }): boolean => {
    if (placed.length === 0) {
      put(e, 0, 0, 'across');
      return true;
    }
    let best: { x: number; y: number; dir: 'across' | 'down'; score: number } | null = null;
    for (const [k, letter] of grid) {
      for (let i = 0; i < e.clean.length; i++) {
        if (e.clean[i] !== letter) continue;
        const [gx, gy] = k.split(',').map(Number);
        for (const dir of ['across', 'down'] as const) {
          const x = dir === 'across' ? gx - i : gx;
          const y = dir === 'down' ? gy - i : gy;
          const score = canPlace(e.clean, x, y, dir);
          if (score > 0 && (!best || score > best.score)) best = { x, y, dir, score };
        }
      }
    }
    if (best) {
      put(e, best.x, best.y, best.dir);
      return true;
    }
    return false;
  };

  // meerdere rondes zodat eerder overgeslagen woorden later nog kunnen aanhaken
  let queue = sorted;
  for (let round = 0; round < 3 && queue.length > 0; round++) {
    const failed: typeof queue = [];
    for (const e of queue) {
      if (!tryPlace(e)) failed.push(e);
    }
    queue = failed;
  }
  skipped.push(...queue.map((e) => e.word));

  // normaliseren naar (0,0)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of grid.keys()) {
    const [x, y] = k.split(',').map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (placed.length === 0) return { placements: [], width: 0, height: 0, skipped, duplicates };

  const norm = placed.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
  // nummering: sorteer op positie
  norm.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const numByCell = new Map<string, number>();
  let n = 0;
  const placements: Placement[] = norm.map((p) => {
    const cellKey = key(p.x, p.y);
    let num = numByCell.get(cellKey);
    if (num === undefined) {
      num = ++n;
      numByCell.set(cellKey, num);
    }
    return { ...p, number: num };
  });

  return { placements, width: maxX - minX + 1, height: maxY - minY + 1, skipped, duplicates };
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

export function CrosswordEditor({ config, onChange }: EditorProps<CrosswordConfig>) {
  const entries = config.entries;
  const gen = useMemo(() => generateCrossword(entries), [entries]);
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Voeg woorden met een omschrijving toe. Het rooster wordt automatisch gegenereerd — spaties en leestekens worden genegeerd.
      </p>
      {entries.map((e, i) => (
        <div className="option-row" key={e.id}>
          <input className="input input-sm" style={{ maxWidth: 180 }} placeholder="Woord" value={e.word}
            onChange={(ev) => { const next = entries.slice(); next[i] = { ...e, word: ev.target.value }; onChange({ ...config, entries: next }); }} />
          <input className="input input-sm" placeholder="Omschrijving / vraag" value={e.clue}
            onChange={(ev) => { const next = entries.slice(); next[i] = { ...e, clue: ev.target.value }; onChange({ ...config, entries: next }); }} />
          <button className="btn btn-quiet btn-icon btn-sm" aria-label="Woord verwijderen"
            onClick={() => onChange({ ...config, entries: entries.filter((_, j) => j !== i) })}><CloseIcon size={16} aria-hidden /></button>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => onChange({ ...config, entries: [...entries, { id: uid(), word: '', clue: '' }] })}>
        + Woord toevoegen
      </button>
      {gen.skipped.length > 0 && (
        <div className="callout warn" style={{ marginTop: 14 }}>
          <WarningIcon aria-hidden />
          <div>Deze woorden passen niet in het rooster en worden overgeslagen: <strong>{gen.skipped.join(', ')}</strong>. Voeg woorden toe met gemeenschappelijke letters.</div>
        </div>
      )}
      {gen.duplicates.length > 0 && (
        <div className="callout warn" style={{ marginTop: 14 }}>
          <WarningIcon aria-hidden />
          <div>Dubbele woorden staan maar één keer in het rooster: <strong>{gen.duplicates.join(', ')}</strong>.</div>
        </div>
      )}
      {gen.placements.length > 0 && (
        <p className="hint" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckIcon size={14} aria-hidden /> Rooster: {gen.placements.length} woorden, {gen.width} × {gen.height} cellen.
        </p>
      )}
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

export function CrosswordPlayer({ widget, timeUp, onComplete }: PlayerProps<CrosswordConfig>) {
  const gen = useMemo(() => generateCrossword(widget.config.entries), [widget.id]);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [activeWord, setActiveWord] = useState<Placement | null>(null);
  const [phase, setPhase] = useState<'playing' | 'done'>('playing');
  const submittedRef = useRef(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const cellKey = (x: number, y: number) => `${x},${y}`;

  // cel → welke woorden erdoor lopen
  const cellWords = useMemo(() => {
    const map = new Map<string, Placement[]>();
    for (const p of gen.placements) {
      for (let i = 0; i < p.word.length; i++) {
        const k = cellKey(p.x + (p.dir === 'across' ? i : 0), p.y + (p.dir === 'down' ? i : 0));
        map.set(k, [...(map.get(k) ?? []), p]);
      }
    }
    return map;
  }, [gen]);

  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of gen.placements) {
      const k = cellKey(p.x, p.y);
      if (!map.has(k)) map.set(k, p.number);
    }
    return map;
  }, [gen]);

  const wordCorrect = (p: Placement) =>
    p.word.split('').every((ch, i) => {
      const k = cellKey(p.x + (p.dir === 'across' ? i : 0), p.y + (p.dir === 'down' ? i : 0));
      return (letters[k] ?? '').toUpperCase() === ch;
    });

  const solvedCount = gen.placements.filter(wordCorrect).length;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const solved = gen.placements.filter(wordCorrect).length;
    onComplete({
      answers: { letters, opgelost: solved },
      itemScores: null,
      earned: solved,
      max: gen.placements.length,
    });
    setPhase('done');
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (timeUp && phase === 'playing') submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (gen.placements.length === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen (geldige) woorden in dit kruiswoordraadsel.</p>;
  }

  const inActive = (x: number, y: number) => {
    if (!activeWord) return false;
    const p = activeWord;
    if (p.dir === 'across') return y === p.y && x >= p.x && x < p.x + p.word.length;
    return x === p.x && y >= p.y && y < p.y + p.word.length;
  };

  const focusCell = (x: number, y: number) => inputRefs.current.get(cellKey(x, y))?.focus();

  const moveNext = (x: number, y: number, dir: 'across' | 'down', delta: 1 | -1) => {
    const nx = dir === 'across' ? x + delta : x;
    const ny = dir === 'down' ? y + delta : y;
    if (cellWords.has(cellKey(nx, ny))) focusCell(nx, ny);
  };

  const review = phase === 'done' && widget.settings.showFeedback;

  const grid = (
    <table className="cross-grid" role="grid" aria-label="Kruiswoordraadsel">
      <tbody>
        {Array.from({ length: gen.height }, (_, y) => (
          <tr key={y}>
            {Array.from({ length: gen.width }, (_, x) => {
              const k = cellKey(x, y);
              const words = cellWords.get(k);
              if (!words) return <td key={x} className="cross-cell block" aria-hidden />;
              const num = numbers.get(k);
              const val = letters[k] ?? '';
              let cls = 'cross-cell';
              if (!review && inActive(x, y)) cls += ' active';
              if (review) {
                const expected = (() => {
                  const p = words[0];
                  const i = p.dir === 'across' ? x - p.x : y - p.y;
                  return p.word[i];
                })();
                cls += val.toUpperCase() === expected ? ' correct' : ' incorrect';
              }
              return (
                <td key={x} className={cls}>
                  {num !== undefined && <span className="num" aria-hidden>{num}</span>}
                  <input
                    ref={(el) => { if (el) inputRefs.current.set(k, el); }}
                    maxLength={1}
                    value={review ? (val || '·') : val}
                    disabled={phase === 'done'}
                    aria-label={`Rij ${y + 1}, kolom ${x + 1}`}
                    onFocus={() => {
                      setActiveWord((cur) => {
                        if (cur && words.includes(cur)) return cur;
                        return words[0];
                      });
                    }}
                    onClick={() => {
                      // opnieuw klikken wisselt tussen horizontaal/verticaal
                      if (activeWord && words.length > 1 && words.includes(activeWord)) {
                        setActiveWord(words.find((w) => w !== activeWord) ?? words[0]);
                      }
                    }}
                    onChange={(e) => {
                      const ch = e.target.value.slice(-1).toUpperCase().replace(/[^A-ZÀ-ÿ]/g, '');
                      setLetters((l) => ({ ...l, [k]: ch }));
                      if (ch && activeWord) moveNext(x, y, activeWord.dir, 1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !val && activeWord) moveNext(x, y, activeWord.dir, -1);
                      if (e.key === 'ArrowRight') { e.preventDefault(); moveNext(x, y, 'across', 1); }
                      if (e.key === 'ArrowLeft') { e.preventDefault(); moveNext(x, y, 'across', -1); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); moveNext(x, y, 'down', 1); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); moveNext(x, y, 'down', -1); }
                    }}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const clueList = (dir: 'across' | 'down', title: React.ReactNode) => {
    const list = gen.placements.filter((p) => p.dir === dir).sort((a, b) => a.number - b.number);
    if (list.length === 0) return null;
    return (
      <div style={{ flex: '1 1 240px' }}>
        <h3>{title}</h3>
        <ol style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
          {list.map((p) => {
            const solved = wordCorrect(p);
            return (
              <li key={`${p.dir}-${p.number}-${p.word}`}>
                <button
                  className="btn btn-quiet btn-sm"
                  style={{
                    justifyContent: 'flex-start', textAlign: 'left', width: '100%', fontWeight: 500,
                    textDecoration: solved ? 'line-through' : 'none',
                    color: solved ? 'var(--ok)' : undefined,
                    background: activeWord === p ? 'var(--brand-soft)' : undefined,
                  }}
                  onClick={() => { setActiveWord(p); focusCell(p.x, p.y); }}
                >
                  <strong style={{ marginRight: 6 }}>{p.number}.</strong> {p.clue || p.original} ({p.word.length})
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  };

  if (phase === 'done') {
    return (
      <div>
        <ResultHero
          earned={solvedCount} max={gen.placements.length}
          showScore={widget.settings.showScore}
          title={solvedCount === gen.placements.length ? 'Helemaal opgelost! 🏆' : 'Ingediend!'}
          subtitle={`${solvedCount} van de ${gen.placements.length} woorden juist.`}
        />
        {review && (
          <div style={{ marginTop: 20, overflowX: 'auto' }}>
            <h3 style={{ textAlign: 'center' }}>Jouw rooster</h3>
            {grid}
            <div className="callout" style={{ marginTop: 16 }}>
              <TipIcon aria-hidden />
              <div>
                <strong>Oplossingen:</strong>{' '}
                {gen.placements.map((p) => `${p.number}. ${p.word}`).join(' · ')}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <GameStatus>
        <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> {solvedCount} / {gen.placements.length} woorden</span>
      </GameStatus>
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>{grid}</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 18 }}>
        {clueList('across', <><ArrowRight size={18} className="icon-inline" aria-hidden /> Horizontaal</>)}
        {clueList('down', <><MoveDownIcon size={18} className="icon-inline" aria-hidden /> Verticaal</>)}
      </div>
      <div className="player-nav">
        <span />
        <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Indienen</button>
      </div>
    </div>
  );
}
