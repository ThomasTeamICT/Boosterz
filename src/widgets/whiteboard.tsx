import React, { useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import type { WhiteboardConfig } from '../lib/types';
import { Field, ImagePicker } from '../components/ui';
import { CheckIcon, DeleteIcon } from '../components/icons';
import { EditorProps, PlayerProps, ResultHero } from './shared';

export function WhiteboardEditor({ config, onChange }: EditorProps<WhiteboardConfig>) {
  return (
    <div>
      <Field label="Opdracht voor de leerling">
        <textarea className="textarea" rows={2} value={config.prompt} placeholder="bv. Teken de waterkringloop en benoem de onderdelen."
          onChange={(e) => onChange({ ...config, prompt: e.target.value })} />
      </Field>
      <ImagePicker
        value={config.backgroundImageUrl}
        onChange={(backgroundImageUrl) => onChange({ ...config, backgroundImageUrl })}
        label="Achtergrond om op te tekenen (optioneel)"
      />
      <p className="hint">De tekening van de leerling komt als afbeelding bij de resultaten terecht, zodat jij ze kan beoordelen.</p>
    </div>
  );
}

const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#ffffff'];
const SIZES = [3, 6, 12, 22];
// Toegankelijke namen: een schermlezer moet "rood" zeggen, geen kleurcode.
const COLOR_NAMES: Record<string, string> = {
  '#111827': 'zwart', '#dc2626': 'rood', '#2563eb': 'blauw', '#16a34a': 'groen',
  '#d97706': 'oranje', '#9333ea': 'paars', '#ffffff': 'wit',
};

export function WhiteboardPlayer({ widget, timeUp, onComplete }: PlayerProps<WhiteboardConfig>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);
  const [done, setDone] = useState(false);
  const drawingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const lastRef = useRef<[number, number] | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const submittedRef = useRef(false);

  const W = 900, H = 560;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    if (widget.config.backgroundImageUrl) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(W / img.width, H / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      };
      img.src = widget.config.backgroundImageUrl;
    }
  }, [widget.id]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * W,
      ((e.clientY - rect.top) / rect.height) * H,
    ];
  };

  const saveHistory = () => {
    const ctx = canvasRef.current!.getContext('2d')!;
    historyRef.current.push(ctx.getImageData(0, 0, W, H));
    if (historyRef.current.length > 25) historyRef.current.shift();
  };

  const undo = () => {
    const ctx = canvasRef.current!.getContext('2d')!;
    const prev = historyRef.current.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
  };

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const dataUrl = canvasRef.current!.toDataURL('image/jpeg', 0.8);
    onComplete({
      answers: { tekening: dataUrl },
      itemScores: { tekening: { earned: 0, max: 10, mode: 'pending' } },
      earned: 0,
      max: 10,
      hasPending: true,
    });
    setDone(true);
  };

  useEffect(() => {
    if (timeUp && !done) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (done) {
    return (
      <ResultHero earned={0} max={0} showScore={false} title="Tekening ingediend!"
        subtitle="Je leerkracht bekijkt en beoordeelt je werk." hasPending />
    );
  }

  return (
    <div className="player-main-wide" style={{ margin: '0 auto' }}>
      {widget.config.prompt && <h2 style={{ textAlign: 'center' }}>{widget.config.prompt}</h2>}
      <div className="whiteboard-tools" role="toolbar" aria-label="Tekengereedschap">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`wb-swatch ${color === c && !eraser ? 'active' : ''}`}
            style={{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px var(--line-strong)' : undefined }}
            aria-label={`Kleur ${COLOR_NAMES[c] ?? c}`}
            aria-pressed={color === c && !eraser}
            onClick={() => { setColor(c); setEraser(false); }}
          />
        ))}
        <span style={{ width: 1, height: 26, background: 'var(--line-strong)' }} aria-hidden />
        {SIZES.map((s) => (
          <button
            key={s}
            className="btn btn-quiet btn-icon"
            aria-label={`Dikte ${s}`}
            aria-pressed={size === s}
            // geen inline outline: die wint van de focusring (:focus-visible); de gekozen dikte tonen we met een schaduw
            style={{ boxShadow: size === s ? '0 0 0 2px var(--brand)' : undefined }}
            onClick={() => setSize(s)}
          >
            <span style={{ width: Math.min(s + 4, 22), height: Math.min(s + 4, 22), borderRadius: '50%', background: 'var(--text)' }} />
          </button>
        ))}
        <span style={{ width: 1, height: 26, background: 'var(--line-strong)' }} aria-hidden />
        <button className={`btn btn-sm ${eraser ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEraser((v) => !v)} aria-pressed={eraser}><Eraser size={16} aria-hidden /> Gom</button>
        <button className="btn btn-sm btn-ghost" onClick={undo}><Undo2 size={16} aria-hidden /> Ongedaan</button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            saveHistory();
            const ctx = canvasRef.current!.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, W, H);
          }}
        >
<DeleteIcon size={16} aria-hidden /> Alles wissen
        </button>
      </div>
      <div ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="whiteboard-canvas"
          width={W}
          height={H}
          style={{ width: '100%', aspectRatio: `${W} / ${H}` }}
          aria-label="Tekenvlak"
          onPointerDown={(e) => {
            // één actieve pointer: een tweede vinger mag de streek niet overnemen
            if (drawingRef.current) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            saveHistory();
            drawingRef.current = true;
            activePointerRef.current = e.pointerId;
            lastRef.current = pos(e);
          }}
          onPointerMove={(e) => {
            if (!drawingRef.current || !lastRef.current) return;
            if (e.pointerId !== activePointerRef.current) return;
            const ctx = canvasRef.current!.getContext('2d')!;
            const [x, y] = pos(e);
            const [lx, ly] = lastRef.current;
            ctx.strokeStyle = eraser ? '#ffffff' : color;
            ctx.lineWidth = eraser ? size * 3 : size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(x, y);
            ctx.stroke();
            lastRef.current = [x, y];
          }}
          onPointerUp={(e) => {
            if (e.pointerId !== activePointerRef.current) return;
            drawingRef.current = false; activePointerRef.current = null; lastRef.current = null;
          }}
          onPointerLeave={(e) => {
            if (e.pointerId !== activePointerRef.current) return;
            drawingRef.current = false; activePointerRef.current = null; lastRef.current = null;
          }}
        />
      </div>
      <div className="player-nav">
        <span />
        <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Tekening indienen</button>
      </div>
    </div>
  );
}
