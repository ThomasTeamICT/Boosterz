import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus } from 'lucide-react';
import type { ImageViewerConfig } from '../lib/types';
import { clamp } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { AddIcon, RetryIcon, SearchIcon } from '../components/icons';
import { EditorProps, PlayerProps } from './shared';

// ── Editor ──────────────────────────────────────────────────────────────────

export function ImageViewerEditor({ config, onChange }: EditorProps<ImageViewerConfig>) {
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling kan vrij in- en uitzoomen (tot 8×) en over de afbeelding schuiven. Ideaal voor
        kaarten, kunstwerken, schema&rsquo;s of foto&rsquo;s met veel detail.
      </p>
      <ImagePicker
        value={config.imageUrl || undefined}
        onChange={(url) => onChange({ ...config, imageUrl: url ?? '' })}
        label="Afbeelding"
      />
      {config.imageUrl ? (
        <img
          src={config.imageUrl}
          alt="Voorbeeld van de gekozen afbeelding"
          style={{
            maxWidth: '100%', maxHeight: 260, borderRadius: 12,
            border: '1px solid var(--line)', display: 'block', marginBottom: 14,
          }}
        />
      ) : (
        <p className="hint" style={{ marginBottom: 14 }}>
          Kies een afbeelding met voldoende detail — de leerling kan er tot 8× op inzoomen.
        </p>
      )}
      <Field label="Beschrijving (optioneel)" hint="Wordt onder de viewer getoond, bv. een kijkopdracht of extra uitleg.">
        <textarea
          className="textarea"
          rows={3}
          value={config.description ?? ''}
          placeholder="bv. Zoom in op de linkerbovenhoek en zoek de handtekening van de kunstenaar."
          onChange={(e) => onChange({ ...config, description: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

interface ViewState { scale: number; tx: number; ty: number }

const START_VIEW: ViewState = { scale: 1, tx: 0, ty: 0 };

/** Houd de zoom binnen 1..8 en zorg dat de afbeelding het venster blijft vullen. */
function clampView(scale: number, tx: number, ty: number, w: number, h: number): ViewState {
  const s = clamp(scale, MIN_ZOOM, MAX_ZOOM);
  return {
    scale: s,
    tx: clamp(tx, w - w * s, 0),
    ty: clamp(ty, h - h * s, 0),
  };
}

/** Zoom naar `targetScale` en houd het punt (px, py) van het venster op zijn plaats. */
function zoomAt(v: ViewState, targetScale: number, px: number, py: number, w: number, h: number): ViewState {
  const s = clamp(targetScale, MIN_ZOOM, MAX_ZOOM);
  const k = s / v.scale;
  return clampView(s, px - (px - v.tx) * k, py - (py - v.ty) * k, w, h);
}

export function ImageViewerPlayer({ widget, timeUp, onComplete }: PlayerProps<ImageViewerConfig>) {
  const { imageUrl, description } = widget.config;
  if (!imageUrl) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Nog geen afbeelding ingesteld voor deze viewer.
      </p>
    );
  }
  return (
    <ViewerStage
      title={widget.title}
      imageUrl={imageUrl}
      description={description}
      timeUp={timeUp}
      onComplete={onComplete}
    />
  );
}

function ViewerStage({
  title, imageUrl, description, timeUp, onComplete,
}: {
  title: string;
  imageUrl: string;
  description?: string;
  timeUp?: boolean;
  onComplete: PlayerProps['onComplete'];
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>(START_VIEW);
  const [dragging, setDragging] = useState(false);
  /** Actieve aanrakingen/muisknoppen (voor slepen en knijpzoom). */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const doneRef = useRef(false);

  /** Eén keer registreren dat de leerling de afbeelding bekeken heeft. */
  const markDone = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ answers: { bekeken: true }, itemScores: null, earned: 0, max: 0 });
  }, [onComplete]);

  useEffect(() => {
    if (timeUp) markDone();
  }, [timeUp, markDone]);

  // Muiswiel-zoom rond de cursor. Native listener met passive:false,
  // want React registreert wheel-events passief (preventDefault werkt daar niet).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const factor = Math.exp(-delta * 0.002);
      setView((v) => zoomAt(v, v.scale * factor, px, py, rect.width, rect.height));
      markDone();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [markDone]);

  // Bij vensterwijziging de positie opnieuw begrenzen.
  useEffect(() => {
    const onResize = () => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setView((v) => clampView(v.scale, v.tx, v.ty, r.width, r.height));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const zoomBy = (factor: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setView((v) => zoomAt(v, v.scale * factor, r.width / 2, r.height / 2, r.width, r.height));
    markDone();
  };

  const reset = () => {
    setView(START_VIEW);
    markDone();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el) return;
    // alleen de primaire muisknop; rechtsklik laat anders de pan-status hangen
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* niet ondersteund → geen probleem */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    const prev = pointers.current.get(e.pointerId);
    if (!el || !prev) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) setDragging(false);
      return;
    }
    const rect = el.getBoundingClientRect();
    const cur = { x: e.clientX, y: e.clientY };

    if (pointers.current.size >= 2) {
      // Knijpzoom met twee vingers: zoom rond het (vorige) middelpunt, schuif mee met het middelpunt.
      const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
      const other = others[0]?.[1];
      if (other) {
        const dPrev = Math.hypot(prev.x - other.x, prev.y - other.y);
        const dNew = Math.hypot(cur.x - other.x, cur.y - other.y);
        const prevMidX = (prev.x + other.x) / 2 - rect.left;
        const prevMidY = (prev.y + other.y) / 2 - rect.top;
        const newMidX = (cur.x + other.x) / 2 - rect.left;
        const newMidY = (cur.y + other.y) / 2 - rect.top;
        if (dPrev > 0) {
          setView((v) => {
            const z = zoomAt(v, v.scale * (dNew / dPrev), prevMidX, prevMidY, rect.width, rect.height);
            return clampView(z.scale, z.tx + (newMidX - prevMidX), z.ty + (newMidY - prevMidY), rect.width, rect.height);
          });
          markDone();
        }
      }
    } else {
      // Slepen om te pannen.
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (dx !== 0 || dy !== 0) {
        setView((v) => clampView(v.scale, v.tx + dx, v.ty + dy, rect.width, rect.height));
        markDone();
      }
    }
    pointers.current.set(e.pointerId, cur);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
    try { stageRef.current?.releasePointerCapture(e.pointerId); } catch { /* al losgelaten */ }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => (
      v.scale >= MAX_ZOOM - 0.001
        ? START_VIEW
        : zoomAt(v, v.scale * 2, px, py, rect.width, rect.height)
    ));
    markDone();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const step = 48;
    let handled = true;
    switch (e.key) {
      case '+':
      case '=':
        setView((v) => zoomAt(v, v.scale * 1.4, cx, cy, rect.width, rect.height));
        break;
      case '-':
      case '_':
        setView((v) => zoomAt(v, v.scale / 1.4, cx, cy, rect.width, rect.height));
        break;
      case '0':
        setView(START_VIEW);
        break;
      case 'ArrowLeft':
        setView((v) => clampView(v.scale, v.tx + step, v.ty, rect.width, rect.height));
        break;
      case 'ArrowRight':
        setView((v) => clampView(v.scale, v.tx - step, v.ty, rect.width, rect.height));
        break;
      case 'ArrowUp':
        setView((v) => clampView(v.scale, v.tx, v.ty + step, rect.width, rect.height));
        break;
      case 'ArrowDown':
        setView((v) => clampView(v.scale, v.tx, v.ty - step, rect.width, rect.height));
        break;
      default:
        handled = false;
        break;
    }
    if (handled) {
      e.preventDefault();
      markDone();
    }
  };

  const atStart = view.scale <= MIN_ZOOM + 0.001 && view.tx === 0 && view.ty === 0;
  const ctrlStyle: React.CSSProperties = {
    background: 'var(--bg-raised)',
    border: '1px solid var(--line)',
    boxShadow: 'var(--shadow-2)',
    fontWeight: 800,
    fontSize: '1.15rem',
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ position: 'relative' }}>
        <div
          ref={stageRef}
          role="application"
          aria-label={`Afbeeldingsviewer: ${title}. Zoom met plus en min, verschuif met de pijltjestoetsen, herstel met nul.`}
          tabIndex={0}
          className="vid-43"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            overflow: 'hidden',
            borderRadius: 'var(--radius-m)',
            border: '1px solid var(--line)',
            background: 'var(--bg-sunken)',
            boxShadow: 'var(--shadow-2)',
            touchAction: 'none',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            <img
              src={imageUrl}
              alt={title}
              draggable={false}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                display: 'block', pointerEvents: 'none', userSelect: 'none',
              }}
            />
          </div>
        </div>

        {/* Zoomknoppen (buiten het sleepvlak zodat ze niet meepannen) */}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2 }}>
          <button
            className="btn btn-icon" style={ctrlStyle}
            onClick={() => zoomBy(1.5)}
            disabled={view.scale >= MAX_ZOOM - 0.001}
            aria-label="Inzoomen" title="Inzoomen (+)"
          ><AddIcon size={18} aria-hidden /></button>
          <button
            className="btn btn-icon" style={ctrlStyle}
            onClick={() => zoomBy(1 / 1.5)}
            disabled={view.scale <= MIN_ZOOM + 0.001}
            aria-label="Uitzoomen" title="Uitzoomen (−)"
          ><Minus size={18} aria-hidden /></button>
          <button
            className="btn btn-icon" style={ctrlStyle}
            onClick={reset}
            disabled={atStart}
            aria-label="Zoom herstellen" title="Zoom herstellen (0)"
          ><RetryIcon size={18} aria-hidden /></button>
        </div>

        <span
          className="badge"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', left: 10, bottom: 10, zIndex: 2,
            background: 'var(--bg-raised)', boxShadow: 'var(--shadow-1)',
            border: '1px solid var(--line)',
            color: 'color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))',
          }}
        >
          <SearchIcon size={14} className="icon-inline" aria-hidden /> Zoom: {Math.round(view.scale * 100)}%
        </span>
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.88rem', margin: '10px 0 0' }}>
        Sleep om te schuiven · scroll of knijp om te zoomen · dubbelklik om in te zoomen.
        <br />
        Toetsenbord: <kbd>+</kbd> / <kbd>−</kbd> zoomen, pijltjes schuiven, <kbd>0</kbd> herstellen.
      </p>

      {description && description.trim() !== '' && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-soft)' }}>{description}</p>
        </div>
      )}
    </div>
  );
}
