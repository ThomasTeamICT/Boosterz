import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, SearchCheck, TriangleAlert } from 'lucide-react';
import type { WordsearchConfig } from '../lib/types';
import { normalizeAnswer } from '../lib/utils';
import { CheckRow, Field } from '../components/ui';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';
import '../styles/leerling.css';

// ── Generator ───────────────────────────────────────────────────────────────

interface PlacedWord { word: string; cells: [number, number][] }
interface WSGrid {
  size: number; letters: string[][]; placed: PlacedWord[]; skipped: string[];
  /** Woorden die weggelaten zijn omdat hetzelfde woord al in de lijst staat (genormaliseerd). */
  duplicates: string[];
}

function cleanWord(w: string): string {
  return normalizeAnswer(w).toUpperCase().replace(/[^A-Z]/g, '');
}

export function generateWordsearch(config: WordsearchConfig, seed?: number): WSGrid {
  // eenvoudige seeded RNG zodat leerling en controle hetzelfde rooster zien binnen één sessie
  let s = seed ?? 12345;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  // Elk woord één keer: "huis" en "Huis" zijn hetzelfde woord, anders kan de leerling
  // het tweede nooit apart vinden en blijft de score hangen.
  const words: string[] = [];
  const duplicates: string[] = [];
  const seenWords = new Set<string>();
  for (const raw of config.words) {
    const w = cleanWord(raw);
    if (w.length < 2) continue;
    if (seenWords.has(w)) { duplicates.push(raw.trim()); continue; }
    seenWords.add(w);
    words.push(w);
  }
  const size = Math.max(config.size, Math.max(0, ...words.map((w) => w.length)));
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  const dirs: [number, number][] = [[1, 0], [0, 1]];
  if (config.allowDiagonal) dirs.push([1, 1], [1, -1]);

  const placed: PlacedWord[] = [];
  const skipped: string[] = [];

  for (const word of words.slice().sort((a, b) => b.length - a.length)) {
    let done = false;
    for (let attempt = 0; attempt < 200 && !done; attempt++) {
      const [dx, dy] = dirs[Math.floor(rnd() * dirs.length)];
      const reversed = config.allowReverse && rnd() < 0.4;
      const w = reversed ? word.split('').reverse().join('') : word;
      const maxX = dx === 0 ? size - 1 : size - w.length;
      const minY = dy === -1 ? w.length - 1 : 0;
      const maxY = dy === 1 ? size - w.length : size - 1;
      if (maxX < 0 || maxY < minY) break;
      const x0 = Math.floor(rnd() * (maxX + 1));
      const y0 = minY + Math.floor(rnd() * (maxY - minY + 1));
      let ok = true;
      for (let i = 0; i < w.length; i++) {
        const cell = grid[y0 + dy * i][x0 + dx * i];
        if (cell !== null && cell !== w[i]) { ok = false; break; }
      }
      if (!ok) continue;
      const cells: [number, number][] = [];
      for (let i = 0; i < w.length; i++) {
        grid[y0 + dy * i][x0 + dx * i] = w[i];
        cells.push([x0 + dx * i, y0 + dy * i]);
      }
      placed.push({ word, cells });
      done = true;
    }
    if (!done) skipped.push(word);
  }

  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letters = grid.map((row) => row.map((c) => c ?? ABC[Math.floor(rnd() * 26)]));
  return { size, letters, placed, skipped, duplicates };
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

export function WordsearchEditor({ config, onChange }: EditorProps<WordsearchConfig>) {
  const gen = useMemo(() => generateWordsearch(config), [config]);
  return (
    <div>
      <Field label="Woorden" hint="Eén woord per regel. Spaties en leestekens worden weggelaten in het rooster.">
        <textarea
          className="textarea" rows={8}
          value={config.words.join('\n')}
          onChange={(e) => onChange({ ...config, words: e.target.value.split('\n') })}
        />
      </Field>
      <Field label="Roostergrootte">
        <input
          className="input input-sm" type="number" min={6} max={20} style={{ maxWidth: 110 }}
          value={config.size}
          onChange={(e) => onChange({ ...config, size: Math.max(6, Math.min(20, parseInt(e.target.value) || 12)) })}
        />
      </Field>
      <CheckRow checked={config.allowDiagonal} onChange={(v) => onChange({ ...config, allowDiagonal: v })} label="Diagonale woorden toestaan" />
      <CheckRow checked={config.allowReverse} onChange={(v) => onChange({ ...config, allowReverse: v })} label="Omgekeerde woorden toestaan" />
      {gen.skipped.length > 0 && (
        <div className="callout warn" style={{ marginTop: 10 }}>
          <TriangleAlert size={18} aria-hidden />
          <div>Passen niet in het rooster: <strong>{gen.skipped.join(', ')}</strong>. Maak het rooster groter.</div>
        </div>
      )}
      {gen.duplicates.length > 0 && (
        <div className="callout warn" style={{ marginTop: 10 }}>
          <TriangleAlert size={18} aria-hidden />
          <div>Dubbele woorden staan maar één keer in het rooster: <strong>{gen.duplicates.join(', ')}</strong>.</div>
        </div>
      )}
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

function lineBetween(a: [number, number], b: [number, number]): [number, number][] | null {
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const lenX = Math.abs(b[0] - a[0]);
  const lenY = Math.abs(b[1] - a[1]);
  if (dx !== 0 && dy !== 0 && lenX !== lenY) return null; // geen rechte lijn
  const len = Math.max(lenX, lenY);
  const cells: [number, number][] = [];
  for (let i = 0; i <= len; i++) cells.push([a[0] + dx * i, a[1] + dy * i]);
  return cells;
}

export function WordsearchPlayer({ widget, timeUp, onComplete }: PlayerProps<WordsearchConfig>) {
  const seed = useMemo(() => Math.floor(Math.random() * 1e9), [widget.id]);
  const gen = useMemo(() => generateWordsearch(widget.config, seed), [widget.id, seed]);

  const [found, setFound] = useState<Map<string, [number, number][]>>(new Map());
  const [start, setStart] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);
  const startedAt = useMemo(() => Date.now(), []);

  const finish = (complete: boolean, foundNow: Map<string, [number, number][]>) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setDone(true);
    onComplete({
      answers: { gevonden: [...foundNow.keys()], seconden: Math.round((Date.now() - startedAt) / 1000) },
      itemScores: null,
      earned: foundNow.size,
      max: gen.placed.length,
    });
  };

  useEffect(() => {
    if (timeUp && !done) finish(false, found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (gen.placed.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen woorden ingesteld.</p>;

  const selection = start && hover ? lineBetween(start, hover) : start ? [start] : null;
  const selSet = new Set((selection ?? []).map(([x, y]) => `${x},${y}`));
  const foundSet = new Set([...found.values()].flat().map(([x, y]) => `${x},${y}`));

  const commit = (line: [number, number][] | null) => {
    if (!line || line.length < 2) return;
    const text = line.map(([x, y]) => gen.letters[y][x]).join('');
    const reversedText = text.split('').reverse().join('');
    const hit = gen.placed.find((p) => !found.has(p.word) && (p.word === text || p.word === reversedText));
    if (hit) {
      const next = new Map(found);
      next.set(hit.word, line);
      setFound(next);
      if (next.size === gen.placed.length) finish(true, next);
    }
  };

  const cellFromPoint = (clientX: number, clientY: number): [number, number] | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const td = el?.closest('[data-ws]') as HTMLElement | null;
    if (!td) return null;
    const [x, y] = td.dataset.ws!.split(',').map(Number);
    return [x, y];
  };

  if (done) {
    return (
      <ResultHero
        earned={found.size} max={gen.placed.length}
        showScore={widget.settings.showScore}
        title={found.size === gen.placed.length ? 'Alle woorden gevonden! 🔍' : 'Klaar!'}
        subtitle={`Je vond ${found.size} van de ${gen.placed.length} woorden.`}
      >
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => {
          submittedRef.current = false;
          setFound(new Map()); setDone(false); setStart(null); setHover(null);
        }}><RotateCcw size={16} aria-hidden /> Opnieuw</button>
      </ResultHero>
    );
  }

  return (
    <div>
      <GameStatus>
        <span className="badge badge-ok"><SearchCheck size={14} aria-hidden /> {found.size} / {gen.placed.length} gevonden</span>
      </GameStatus>
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <table
          className="ws-grid"
          aria-label="Woordzoeker"
          style={{ ['--ws-size' as any]: gen.size }}
          onPointerDown={(e) => {
            const c = cellFromPoint(e.clientX, e.clientY);
            if (!c) return;
            e.preventDefault();
            setStart(c); setHover(c); setDragging(true);
          }}
          onPointerMove={(e) => {
            if (!dragging) return;
            const c = cellFromPoint(e.clientX, e.clientY);
            if (c) setHover(c);
          }}
          onPointerUp={() => {
            if (dragging && start && hover) commit(lineBetween(start, hover));
            setDragging(false); setStart(null); setHover(null);
          }}
        >
          <tbody>
            {gen.letters.map((row, y) => (
              <tr key={y}>
                {row.map((letter, x) => {
                  const k = `${x},${y}`;
                  const cls = `ws-cell ${foundSet.has(k) ? 'found' : ''} ${selSet.has(k) ? 'sel' : ''}`;
                  return (
                    <td key={x} className={cls} data-ws={k} aria-label={`${letter}, rij ${y + 1}, kolom ${x + 1}`}>
                      {letter}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.88rem' }}>
        Sleep over de letters om een woord te selecteren.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        {gen.placed.map((p) => (
          <span
            key={p.word}
            className={`badge ${found.has(p.word) ? 'badge-ok' : ''}`}
            style={found.has(p.word) ? { textDecoration: 'line-through' } : undefined}
          >
            {p.word}
          </span>
        ))}
      </div>
      <div className="player-nav">
        <span />
        <button className="btn btn-primary" onClick={() => finish(false, found)}><Check size={16} aria-hidden /> Stoppen en indienen</button>
      </div>
    </div>
  );
}
