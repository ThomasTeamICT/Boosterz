import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Piano, VolumeX } from 'lucide-react';
import type { PianoConfig } from '../lib/types';
import { CheckRow, Field } from '../components/ui';
import { kanColorMix } from '../lib/color';
import { EditorProps, GameStatus, PlayerProps } from './shared';

// ── Muzikale basis ──────────────────────────────────────────────────────────

/** Nootnamen per halve toon binnen één octaaf (kruisjes voor de zwarte toetsen). */
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

/** Halve tonen (t.o.v. C) van de witte toetsen binnen één octaaf. */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const;

/** Zwarte toetsen: halve toon + na welke witte toets (index binnen het octaaf) ze staan. */
const BLACK_KEYS: { offset: number; afterWhite: number }[] = [
  { offset: 1, afterWhite: 0 },
  { offset: 3, afterWhite: 1 },
  { offset: 6, afterWhite: 3 },
  { offset: 8, afterWhite: 4 },
  { offset: 10, afterWhite: 5 },
];

/** C4 = MIDI 60 (middencé). */
const BASE_MIDI = 60;

/** Computertoetsenbord → halve toon t.o.v. C4. a-s-d-f-g-h-j-k = wit, w-e-t-y-u = zwart. */
const KEY_TO_OFFSET: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

/** Omgekeerde map: halve toon → letter die we op de toets tonen. */
const OFFSET_TO_KEY: Record<number, string> = {};
for (const [k, off] of Object.entries(KEY_TO_OFFSET)) OFFSET_TO_KEY[off] = k.toUpperCase();

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteLabel(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1; // MIDI 60 → C4
  return `${name}${octave}`;
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function PianoEditor({ config, onChange }: EditorProps<PianoConfig>) {
  const octaves = config.octaves === 2 ? 2 : 1;
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling krijgt een speelbaar pianoklavier: klikken of tikken op de toetsen, of spelen met het
        computertoetsenbord (a-s-d-f-g-h-j-k voor de witte toetsen, w-e-t-y-u voor de zwarte).
      </p>
      <Field label="Aantal octaven">
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${octaves === 1 ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={octaves === 1}
            onClick={() => onChange({ ...config, octaves: 1 })}
          >
            <Piano size={16} aria-hidden /> 1 octaaf
          </button>
          <button
            className={`btn btn-sm ${octaves === 2 ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={octaves === 2}
            onClick={() => onChange({ ...config, octaves: 2 })}
          >
            <Piano size={16} aria-hidden /> 2 octaven
          </button>
        </div>
        <span className="hint">
          {octaves === 1
            ? 'Eén octaaf vanaf het middencé (C4 t/m B4) — overzichtelijk voor jonge leerlingen.'
            : 'Twee octaven (C4 t/m B5) — meer speelruimte voor melodieën.'}
        </span>
      </Field>
      <CheckRow
        checked={config.showNoteNames}
        onChange={(v) => onChange({ ...config, showNoteNames: v })}
        label="Nootnamen tonen op de toetsen (C, D, E … en C♯, D♯ …)"
      />
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function PianoPlayer({ widget }: PlayerProps<PianoConfig>) {
  const config = widget.config;

  // Eén gedeelde AudioContext, pas aangemaakt bij de eerste interactie.
  const audioRef = useRef<AudioContext | null>(null);
  const [active, setActive] = useState<Set<number>>(() => new Set());
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const octaves: 1 | 2 = config?.octaves === 2 ? 2 : 1;
  const showNames = Boolean(config?.showNoteNames);
  const semitoneCount = octaves * 12;

  const whiteKeys = useMemo(() => {
    const keys: { midi: number; offset: number }[] = [];
    for (let oct = 0; oct < octaves; oct++) {
      for (const w of WHITE_OFFSETS) {
        const offset = oct * 12 + w;
        keys.push({ midi: BASE_MIDI + offset, offset });
      }
    }
    return keys;
  }, [octaves]);

  const blackKeys = useMemo(() => {
    const keys: { midi: number; offset: number; whiteBoundary: number }[] = [];
    for (let oct = 0; oct < octaves; oct++) {
      for (const b of BLACK_KEYS) {
        const offset = oct * 12 + b.offset;
        keys.push({ midi: BASE_MIDI + offset, offset, whiteBoundary: oct * 7 + b.afterWhite + 1 });
      }
    }
    return keys;
  }, [octaves]);

  const whiteCount = whiteKeys.length;

  const playTone = useCallback((midi: number) => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(midi);
      const gain = ctx.createGain();
      // Snelle attack, exponentiële release van ± 0,4 s.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.32, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.015 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
      setAudioBlocked(false);
    } catch {
      // Audio niet beschikbaar — de toets licht dan enkel visueel op.
      setAudioBlocked(true);
    }
  }, []);

  const press = useCallback((midi: number) => {
    playTone(midi);
    setLastNote(noteLabel(midi));
    setActive((prev) => {
      if (prev.has(midi)) return prev;
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
  }, [playTone]);

  const release = useCallback((midi: number) => {
    setActive((prev) => {
      if (!prev.has(midi)) return prev;
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, []);

  // Computertoetsenbord: a-s-d-f-g-h-j-k (wit) en w-e-t-y-u (zwart).
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const offset = KEY_TO_OFFSET[e.key.toLowerCase()];
      if (offset === undefined || offset >= semitoneCount) return;
      e.preventDefault();
      press(BASE_MIDI + offset);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const offset = KEY_TO_OFFSET[e.key.toLowerCase()];
      if (offset === undefined || offset >= semitoneCount) return;
      release(BASE_MIDI + offset);
    };
    const onBlur = () => setActive(new Set());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [press, release, semitoneCount]);

  // AudioContext netjes sluiten bij unmount.
  useEffect(() => () => {
    audioRef.current?.close().catch(() => { /* al gesloten */ });
    audioRef.current = null;
  }, []);

  if (!config) {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Deze piano is nog niet ingesteld.</p>;
  }

  const accent = 'var(--player-accent, var(--brand))';
  const kbdStyle: React.CSSProperties = {
    fontSize: '0.62rem',
    fontWeight: 800,
    lineHeight: 1.5,
    padding: '0 5px',
    borderRadius: 5,
    border: '1px solid currentColor',
    opacity: 0.75,
  };

  return (
    <div style={{ maxWidth: octaves === 2 ? 780 : 460, margin: '0 auto' }}>
      <GameStatus>
        <Piano aria-hidden />
        <span>{lastNote ? `Laatste noot: ${lastNote}` : 'Speel maar — elke toets maakt een toon.'}</span>
      </GameStatus>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.88rem', marginBottom: 14 }}>
        Klik of tik op de toetsen, of speel met de letters op je toetsenbord
        (a&nbsp;s&nbsp;d&nbsp;f&nbsp;g&nbsp;h&nbsp;j&nbsp;k voor wit, w&nbsp;e&nbsp;t&nbsp;y&nbsp;u voor zwart).
      </p>
      {audioBlocked && (
        <div className="callout warn" role="alert">
          <VolumeX aria-hidden />
          <span>Geluid kon niet gestart worden op dit toestel. Controleer je volume of probeer een andere browser.</span>
        </div>
      )}
      <div
        role="group"
        aria-label={`Pianoklavier van ${octaves === 2 ? 'twee octaven' : 'één octaaf'}`}
        style={{
          position: 'relative',
          display: 'flex',
          gap: 3,
          height: 'clamp(160px, 36vw, 230px)',
          padding: '8px 8px 10px',
          borderRadius: 'var(--radius-m)',
          background: kanColorMix ? `linear-gradient(color-mix(in srgb, ${accent} 55%, #1b1e2e), #14172a)` : 'linear-gradient(#2f3552, #14172a)',
          boxShadow: 'var(--shadow-2)',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {whiteKeys.map(({ midi, offset }) => {
          const pressed = active.has(midi);
          const letter = OFFSET_TO_KEY[offset];
          return (
            <button
              key={midi}
              aria-label={`Pianotoets ${noteLabel(midi)}`}
              aria-pressed={pressed}
              onPointerDown={(e) => { e.preventDefault(); press(midi); }}
              onPointerUp={() => release(midi)}
              onPointerLeave={() => release(midi)}
              onPointerCancel={() => release(midi)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press(midi); }
              }}
              onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') release(midi); }}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 4,
                padding: '0 2px 8px',
                font: 'inherit',
                cursor: 'pointer',
                border: '1px solid #9aa1bd',
                borderRadius: '0 0 7px 7px',
                background: pressed
                  ? (kanColorMix ? `color-mix(in srgb, ${accent} 38%, #ffffff)` : '#dfe3f5')
                  : 'linear-gradient(#ffffff, #f0f1f8)',
                color: pressed ? '#111527' : '#4a5270',
                boxShadow: pressed ? 'inset 0 3px 6px rgba(15, 23, 42, 0.3)' : 'inset 0 -5px 0 rgba(15, 23, 42, 0.08)',
                transition: 'background 0.06s, box-shadow 0.06s',
                touchAction: 'none',
              }}
            >
              {letter && <span aria-hidden style={kbdStyle}>{letter}</span>}
              {showNames && (
                <span aria-hidden style={{ fontWeight: 750, fontSize: 'clamp(0.7rem, 1.8vw, 0.95rem)' }}>
                  {NOTE_NAMES[offset % 12]}
                </span>
              )}
            </button>
          );
        })}
        {blackKeys.map(({ midi, offset, whiteBoundary }) => {
          const pressed = active.has(midi);
          const letter = OFFSET_TO_KEY[offset];
          return (
            <button
              key={midi}
              aria-label={`Pianotoets ${noteLabel(midi)}`}
              aria-pressed={pressed}
              onPointerDown={(e) => { e.preventDefault(); press(midi); }}
              onPointerUp={() => release(midi)}
              onPointerLeave={() => release(midi)}
              onPointerCancel={() => release(midi)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press(midi); }
              }}
              onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') release(midi); }}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: 8,
                left: `calc(8px + (100% - 16px) * ${whiteBoundary / whiteCount})`,
                transform: 'translateX(-50%)',
                width: `calc((100% - 16px) * ${0.62 / whiteCount})`,
                height: '60%',
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 4,
                padding: '0 1px 7px',
                font: 'inherit',
                cursor: 'pointer',
                border: '1px solid #05060d',
                borderRadius: '0 0 6px 6px',
                background: pressed
                  ? (kanColorMix ? `color-mix(in srgb, ${accent} 55%, #101322)` : '#4a5270')
                  : 'linear-gradient(#2b3048, #14172a)',
                color: '#eef0fa',
                boxShadow: pressed ? 'inset 0 3px 6px rgba(0, 0, 0, 0.65)' : '0 4px 6px rgba(0, 0, 0, 0.4)',
                transition: 'background 0.06s, box-shadow 0.06s',
                touchAction: 'none',
              }}
            >
              {letter && <span aria-hidden style={kbdStyle}>{letter}</span>}
              {showNames && (
                <span aria-hidden style={{ fontWeight: 750, fontSize: 'clamp(0.58rem, 1.5vw, 0.78rem)' }}>
                  {NOTE_NAMES[offset % 12]}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.82rem', marginTop: 12 }}>
        Vrij oefenen — hier hoef je niets in te dienen. Veel speelplezier! 🎶
      </p>
    </div>
  );
}
