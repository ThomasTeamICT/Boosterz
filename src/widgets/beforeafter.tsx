import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { BeforeAfterConfig } from '../lib/types';
import { clamp } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { CheckIcon, RetryIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps } from './shared';

// ── Gedeelde vergelijkingsweergave (editor-voorbeeld + speler) ──────────────

const cornerLabel: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  padding: '3px 11px',
  borderRadius: 999,
  background: 'rgba(10, 14, 28, 0.68)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.82rem',
  letterSpacing: '0.02em',
  pointerEvents: 'none',
  transition: 'opacity 0.2s ease',
  maxWidth: '45%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function CompareStage({
  imageBefore, imageAfter, labelBefore, labelAfter, onFirstInteraction,
}: {
  imageBefore: string;
  imageAfter: string;
  labelBefore: string;
  labelAfter: string;
  /** Eén keer aangeroepen bij de allereerste interactie (slepen, toets of reset). */
  onFirstInteraction?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const interactedRef = useRef(false);
  const [pos, setPos] = useState(50);

  const markInteracted = () => {
    if (interactedRef.current) return;
    interactedRef.current = true;
    onFirstInteraction?.();
  };

  const updateFromClientX = (clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setPos(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // alleen de primaire knop; rechtsklik zou de sleepstatus laten hangen
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    markInteracted();
    updateFromClientX(e.clientX);
    // Focus op de greep zodat de leerling meteen kan verfijnen met de pijltjestoetsen.
    handleRef.current?.focus({ preventScroll: true });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { draggingRef.current = false; return; }
    updateFromClientX(e.clientX);
  };

  const stopDrag = () => { draggingRef.current = false; };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown': next = pos - 2; break;
      case 'ArrowRight':
      case 'ArrowUp': next = pos + 2; break;
      case 'PageDown': next = pos - 10; break;
      case 'PageUp': next = pos + 10; break;
      case 'Home': next = 0; break;
      case 'End': next = 100; break;
      default: return;
    }
    e.preventDefault();
    markInteracted();
    setPos(clamp(next, 0, 100));
  };

  const rounded = Math.round(pos);

  return (
    <div>
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-m)',
          boxShadow: 'var(--shadow-2)',
          touchAction: 'none',
          cursor: 'ew-resize',
          userSelect: 'none',
          background: 'var(--bg-sunken)',
        }}
      >
        {/* Onderste laag: de na-afbeelding (bepaalt de hoogte van het podium). */}
        <img
          src={imageAfter}
          alt={`${labelAfter} — zichtbaar rechts van de schuiflijn`}
          draggable={false}
          style={{ display: 'block', width: '100%' }}
        />
        {/* Bovenste laag: de voor-afbeelding, links van de lijn onthuld via clip-path. */}
        <img
          src={imageBefore}
          alt={`${labelBefore} — zichtbaar links van de schuiflijn`}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            clipPath: `inset(0 ${100 - pos}% 0 0)`,
          }}
        />
        {/* Hoeklabels (vervagen wanneer hun kant bijna dicht is). */}
        <span style={{ ...cornerLabel, left: 10, opacity: pos < 8 ? 0 : 1 }}>{labelBefore}</span>
        <span style={{ ...cornerLabel, right: 10, opacity: pos > 92 ? 0 : 1 }}>{labelAfter}</span>
        {/* Scheidingslijn. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pos}%`,
            width: 3,
            transform: 'translateX(-50%)',
            background: '#fff',
            boxShadow: '0 0 6px rgba(0, 0, 0, 0.45)',
            pointerEvents: 'none',
          }}
        />
        {/* Sleepgreep, ook met het toetsenbord te bedienen. */}
        <div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={`Vergelijkingsschuif — links ${labelBefore}, rechts ${labelAfter}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
          aria-valuetext={`${rounded}% ${labelBefore}, ${100 - rounded}% ${labelAfter}`}
          onKeyDown={onKeyDown}
          style={{
            position: 'absolute',
            top: '50%',
            left: `${pos}%`,
            transform: 'translate(-50%, -50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--player-accent, var(--brand))',
            color: '#fff',
            border: '3px solid #fff',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: '1.05rem',
            cursor: 'ew-resize',
          }}
        >
          <ArrowLeftRight size={18} aria-hidden />
        </div>
      </div>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexWrap: 'wrap', marginTop: 10,
        }}
      >
        <span
          style={{
            fontVariantNumeric: 'tabular-nums', fontWeight: 650,
            fontSize: '0.9rem', color: 'var(--text-soft)',
          }}
        >
          {labelBefore}: {rounded}% · {labelAfter}: {100 - rounded}%
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { markInteracted(); setPos(50); }}
          aria-label="Zet de schuiflijn terug in het midden"
        >
<RetryIcon size={16} aria-hidden /> Terug naar het midden
        </button>
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function BeforeAfterEditor({ config, onChange }: EditorProps<BeforeAfterConfig>) {
  const bothImages = Boolean(config.imageBefore && config.imageAfter);
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling sleept een verticale lijn over twee afbeeldingen die exact op elkaar liggen:
        links verschijnt de “voor”, rechts de “na”. Ideaal voor voor/na-situaties zoals een
        landschap door de seizoenen, een restauratie of een historische vergelijking.
        Tip: gebruik twee even grote afbeeldingen, anders verschuift het beeld.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <ImagePicker
          value={config.imageBefore || undefined}
          onChange={(url) => onChange({ ...config, imageBefore: url ?? '' })}
          label="Voor-afbeelding (linkerkant)"
        />
        <ImagePicker
          value={config.imageAfter || undefined}
          onChange={(url) => onChange({ ...config, imageAfter: url ?? '' })}
          label="Na-afbeelding (rechterkant)"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field label="Label linksboven (‘voor’)">
          <input
            className="input input-sm"
            value={config.labelBefore ?? ''}
            placeholder="bv. Voor"
            aria-label="Label linksboven, voor de linkerkant"
            onChange={(e) => onChange({ ...config, labelBefore: e.target.value })}
          />
        </Field>
        <Field label="Label rechtsboven (‘na’)">
          <input
            className="input input-sm"
            value={config.labelAfter ?? ''}
            placeholder="bv. Na"
            aria-label="Label rechtsboven, voor de rechterkant"
            onChange={(e) => onChange({ ...config, labelAfter: e.target.value })}
          />
        </Field>
      </div>
      {bothImages ? (
        <>
          <p className="hint" style={{ margin: '4px 0 8px' }}>
            Voorbeeld — sleep de lijn of gebruik de pijltjestoetsen om te testen:
          </p>
          <CompareStage
            imageBefore={config.imageBefore}
            imageAfter={config.imageAfter}
            labelBefore={(config.labelBefore ?? '').trim() || 'Voor'}
            labelAfter={(config.labelAfter ?? '').trim() || 'Na'}
          />
        </>
      ) : (
        <p className="hint">Kies beide afbeeldingen om hier het voorbeeld te zien.</p>
      )}
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function BeforeAfterPlayer({ widget, timeUp, onComplete }: PlayerProps<BeforeAfterConfig>) {
  const config = widget.config;
  const labelBefore = (config.labelBefore ?? '').trim() || 'Voor';
  const labelAfter = (config.labelAfter ?? '').trim() || 'Na';

  const submittedRef = useRef(false);
  // Alleen echt verkend als de leerling de lijn bewoog; bij "tijd om" is er niets verkend.
  const [verkend, setVerkend] = useState(false);

  const complete = (heeftVerkend: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setVerkend(heeftVerkend);
    onComplete({ answers: { verkend: heeftVerkend }, itemScores: null, earned: 0, max: 0 });
  };

  useEffect(() => {
    // Geen echte indien-stap: bij een tijdslimiet registreren we het bezoek meteen.
    if (timeUp) complete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (!config.imageBefore || !config.imageAfter) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Deze oefening heeft nog geen voor- en na-afbeelding. Vraag je leerkracht om ze toe te voegen.
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <GameStatus>
        {verkend ? (
          <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> Je hebt beide afbeeldingen verkend.</span>
        ) : (
          <span>Sleep de lijn (of gebruik de pijltjestoetsen) om voor en na te vergelijken.</span>
        )}
      </GameStatus>
      <CompareStage
        imageBefore={config.imageBefore}
        imageAfter={config.imageAfter}
        labelBefore={labelBefore}
        labelAfter={labelAfter}
        onFirstInteraction={() => complete(true)}
      />
    </div>
  );
}
