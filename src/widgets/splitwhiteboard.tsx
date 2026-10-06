import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Eraser, FileText, Image as ImageIcon,
  type LucideIcon, Pin, Undo2, Video,
} from 'lucide-react';
import type { SourcePane, SplitWhiteboardConfig } from '../lib/types';
import { webUrl } from '../lib/veiligeUrl';
import { Field, ImagePicker } from '../components/ui';
import { CheckIcon, DeleteIcon, InfoIcon, WarningIcon } from '../components/icons';
import { EditorProps, PlayerProps, ResultHero } from './shared';

// ── Hulpjes (zelfde patronen als het gesplitste werkblad) ───────────────────

const SOURCE_KINDS: { kind: SourcePane['kind']; icon: LucideIcon; label: string }[] = [
  { kind: 'text', icon: FileText, label: 'Tekst' },
  { kind: 'image', icon: ImageIcon, label: 'Afbeelding' },
  { kind: 'video', icon: Video, label: 'Video' },
];

function sourceKindLabel(kind: SourcePane['kind']): string {
  return kind === 'text' ? 'Leestekst' : kind === 'image' ? 'Afbeelding' : 'Video';
}

/** YouTube-id uit een URL of los id halen. Geeft null als er niets herkend wordt. */
function extractYouTubeId(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Is het bronpaneel bruikbaar ingevuld? */
function sourceIsFilled(source: SourcePane | undefined): source is SourcePane {
  if (!source) return false;
  if (source.kind === 'text') return !!source.text?.trim();
  if (source.kind === 'image') return !!source.imageUrl;
  return !!source.videoUrl?.trim();
}

/** Volgt of het venster smaller is dan maxWidth px (voor de gestapelde layout). */
function useIsNarrow(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return narrow;
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

export function SplitWhiteboardEditor({ config, onChange }: EditorProps<SplitWhiteboardConfig>) {
  const source: SourcePane = config.source ?? { kind: 'text' };
  const setSource = (s: SourcePane) => onChange({ ...config, source: s });
  const videoId = source.kind === 'video' ? extractYouTubeId(source.videoUrl ?? '') : null;

  return (
    <div>
      <Field label="Opdracht voor de leerling">
        <textarea
          className="textarea"
          rows={2}
          value={config.prompt ?? ''}
          placeholder="bv. Teken de doorsnede van een vulkaan en benoem de onderdelen uit de tekst."
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
        />
      </Field>

      {/* ── Bronpaneel ── */}
      <div className="editor-item">
        <div className="editor-item-head">
          <Pin size={16} aria-hidden />
          <strong style={{ fontSize: '0.9rem' }}>Bronpaneel</strong>
        </div>
        <div className="editor-item-body">
          <Field label="Soort bron">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SOURCE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  className={`btn btn-sm ${source.kind === k.kind ? 'btn-primary' : 'btn-ghost'}`}
                  aria-pressed={source.kind === k.kind}
                  onClick={() => setSource({ ...source, kind: k.kind })}
                >
                  <k.icon size={16} aria-hidden /> {k.label}
                </button>
              ))}
            </div>
            <span className="hint">
              De leerling ziet de bron links naast het tekenvlak. Op een smal scherm staat de bron bovenaan en is ze inklapbaar.
            </span>
          </Field>

          <Field label="Titel van de bron (optioneel)">
            <input
              className="input input-sm"
              value={source.title ?? ''}
              placeholder="bv. Hoe zit een vulkaan in elkaar?"
              onChange={(e) => setSource({ ...source, title: e.target.value })}
            />
          </Field>

          {source.kind === 'text' && (
            <Field label="Brontekst" hint="Mag meerdere alinea's bevatten; witregels blijven behouden.">
              <textarea
                className="textarea"
                rows={8}
                value={source.text ?? ''}
                placeholder="Plak of typ hier de leestekst…"
                onChange={(e) => setSource({ ...source, text: e.target.value })}
              />
            </Field>
          )}

          {source.kind === 'image' && (
            <ImagePicker
              value={source.imageUrl}
              onChange={(imageUrl) => setSource({ ...source, imageUrl })}
              label="Bronafbeelding"
            />
          )}

          {source.kind === 'video' && (
            <Field label="Video-URL (YouTube)" hint="Plak een YouTube-link, bv. https://www.youtube.com/watch?v=… of https://youtu.be/…">
              <input
                className="input"
                type="url"
                value={source.videoUrl ?? ''}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => setSource({ ...source, videoUrl: e.target.value })}
              />
              {!!source.videoUrl?.trim() && (
                <span
                  className="hint"
                  role="status"
                  style={{ color: videoId ? 'var(--ok)' : 'var(--warn)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {videoId
                    ? <><CheckIcon size={16} aria-hidden /> Video herkend — wordt privacyvriendelijk ingesloten.</>
                    : <><WarningIcon size={16} aria-hidden /> Geen YouTube-video herkend in deze link.</>}
                </span>
              )}
            </Field>
          )}
        </div>
      </div>

      <p className="hint">
        De tekening van de leerling komt als afbeelding bij de resultaten terecht, zodat jij ze kan beoordelen.
      </p>
    </div>
  );
}

// ── SPELER: bronpaneel ──────────────────────────────────────────────────────

function SourceContent({ source }: { source: SourcePane }) {
  if (source.kind === 'image' && source.imageUrl) {
    return (
      <img
        src={source.imageUrl}
        alt={source.title?.trim() || 'Bronafbeelding'}
        style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }}
      />
    );
  }
  if (source.kind === 'video' && source.videoUrl) {
    const id = extractYouTubeId(source.videoUrl);
    if (!id) {
      // Alleen een http(s)-adres als link: een javascript:-URL uit gedeelde
      // inhoud zou anders in de app uitgevoerd worden (zie lib/veiligeUrl.ts).
      const link = webUrl(source.videoUrl);
      return (
        <div className="callout warn" style={{ marginBottom: 0 }}>
          <Video aria-hidden />
          <div>
            Deze video kan niet ingesloten worden.
            {link && <>{' '}<a href={link} target="_blank" rel="noopener noreferrer">Open de video in een nieuw tabblad.</a></>}
          </div>
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={source.title?.trim() || 'Bronvideo'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{source.text}</div>;
}

function SourcePanel({
  source, narrow, open, onToggle,
}: {
  source: SourcePane;
  narrow: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  const title = source.title?.trim() || sourceKindLabel(source.kind);
  const showContent = !narrow || open;
  return (
    <section
      className="card"
      aria-label={`Bron: ${title}`}
      style={{ borderTop: '4px solid var(--player-accent, var(--brand))', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
        <span className="badge badge-brand">Bron</span>
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </strong>
        {narrow && (
          <button
            className="btn btn-quiet btn-sm"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={onToggle}
          >
            {open ? <><ChevronUp size={16} className="icon-inline" aria-hidden /> Inklappen</> : <><ChevronDown size={16} className="icon-inline" aria-hidden /> Tonen</>}
          </button>
        )}
      </div>
      {showContent && (
        <div id={contentId} style={{ padding: '0 18px 18px' }}>
          <SourceContent source={source} />
        </div>
      )}
    </section>
  );
}

// ── SPELER: tekencanvas (zelfde gedrag als het gewone whiteboard) ───────────

const COLORS: { value: string; name: string }[] = [
  { value: '#111827', name: 'Zwart' },
  { value: '#dc2626', name: 'Rood' },
  { value: '#2563eb', name: 'Blauw' },
  { value: '#16a34a', name: 'Groen' },
  { value: '#d97706', name: 'Oranje' },
  { value: '#9333ea', name: 'Paars' },
  { value: '#ffffff', name: 'Wit' },
];
const SIZES = [3, 6, 12, 22];
const W = 900;
const H = 560;

/** Visueel verborgen, maar leesbaar voor schermlezers. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};

export function SplitWhiteboardPlayer({ widget, timeUp, onComplete }: PlayerProps<SplitWhiteboardConfig>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);
  const [done, setDone] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(true);
  const drawingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const lastRef = useRef<[number, number] | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const submittedRef = useRef(false);
  const narrow = useIsNarrow(800);

  const prompt = (widget.config.prompt ?? '').trim();
  const source = widget.config.source ?? { kind: 'text' as const };
  const hasSource = sourceIsFilled(source);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  }, [widget.id, done]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
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
      <ResultHero
        earned={0} max={0} showScore={false} title="Tekening ingediend!"
        subtitle="Je leerkracht bekijkt en beoordeelt je werk." hasPending
      />
    );
  }

  const activeColorName = COLORS.find((c) => c.value === color)?.name ?? color;

  const drawingPane = (
    <div>
      <div className="whiteboard-tools" role="toolbar" aria-label="Tekengereedschap">
        {COLORS.map((c) => (
          <button
            key={c.value}
            className={`wb-swatch ${color === c.value && !eraser ? 'active' : ''}`}
            style={{ background: c.value, boxShadow: c.value === '#ffffff' ? 'inset 0 0 0 1px var(--line-strong)' : undefined }}
            aria-label={`Kleur ${c.name}`}
            aria-pressed={color === c.value && !eraser}
            onClick={() => { setColor(c.value); setEraser(false); }}
          />
        ))}
        <span style={{ width: 1, height: 26, background: 'var(--line-strong)' }} aria-hidden />
        {SIZES.map((s) => (
          <button
            key={s}
            className="btn btn-quiet btn-icon"
            aria-label={`Dikte ${s}`}
            aria-pressed={size === s}
            style={{ outline: size === s ? '2px solid var(--player-accent, var(--brand))' : 'none' }}
            onClick={() => setSize(s)}
          >
            <span style={{ width: Math.min(s + 4, 22), height: Math.min(s + 4, 22), borderRadius: '50%', background: 'var(--text)' }} />
          </button>
        ))}
        <span style={{ width: 1, height: 26, background: 'var(--line-strong)' }} aria-hidden />
        <button className={`btn btn-sm ${eraser ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEraser((v) => !v)} aria-pressed={eraser}><Eraser size={16} aria-hidden /> Gom</button>
        <button className="btn btn-sm btn-ghost" onClick={undo} aria-label="Laatste streek ongedaan maken"><Undo2 size={16} aria-hidden /> Ongedaan</button>
        <button
          className="btn btn-sm btn-ghost"
          aria-label="Hele tekenvlak wissen"
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
      <span aria-live="polite" style={VISUALLY_HIDDEN}>
        {eraser ? 'Gom actief' : `Kleur ${activeColorName}, dikte ${size} actief`}
      </span>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        width={W}
        height={H}
        style={{ width: '100%', aspectRatio: `${W} / ${H}` }}
        aria-label="Tekenvlak"
        onPointerDown={(e) => {
          // één actieve pointer: een tweede vinger mag geen streep tussen beide trekken
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
      <div className="player-nav">
        <span />
        <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Tekening indienen</button>
      </div>
    </div>
  );

  // ── Bron links (sticky) of bovenaan (inklapbaar), tekenvlak ernaast/eronder ──
  return (
    <div>
      {prompt && <h2 style={{ textAlign: 'center' }}>{prompt}</h2>}
      {!hasSource && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <InfoIcon aria-hidden />
          <div>Er is nog geen bron ingesteld; je kunt gewoon tekenen en indienen.</div>
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasSource && !narrow ? 'minmax(260px, 2fr) minmax(0, 3fr)' : 'minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {hasSource && (
          <div
            style={
              narrow
                ? undefined
                : { position: 'sticky', top: 74, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }
            }
          >
            <SourcePanel
              source={source}
              narrow={narrow}
              open={sourceOpen}
              onToggle={() => setSourceOpen((v) => !v)}
            />
          </div>
        )}
        {drawingPane}
      </div>
    </div>
  );
}
