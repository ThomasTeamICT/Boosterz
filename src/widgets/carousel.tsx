import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { CarouselConfig, CarouselSlide } from '../lib/types';
import { uid } from '../lib/utils';
import { EmptyState, Field, ImagePicker } from '../components/ui';
import { CheckIcon } from '../components/icons';
import { EditorProps, ItemHeader, moveItem, PlayerProps } from './shared';

// ── Editor ──────────────────────────────────────────────────────────────────

export function CarouselEditor({ config, onChange }: EditorProps<CarouselConfig>) {
  const slides = config.slides ?? [];

  const update = (i: number, s: CarouselSlide) => {
    const next = slides.slice();
    next[i] = s;
    onChange({ ...config, slides: next });
  };

  const addSlide = () =>
    onChange({ ...config, slides: [...slides, { id: uid(), imageUrl: '', caption: '' }] });

  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling bladert door de foto's met knoppen, stippen, pijltjestoetsen of door te vegen.
        Het bijschrift verschijnt onderaan over de foto.
      </p>
      {slides.length === 0 && (
        <EmptyState icon={<ImageIcon size={40} aria-hidden />} title="Nog geen dia's">
          <p>Voeg je eerste foto toe om de carrousel te vullen.</p>
        </EmptyState>
      )}
      {slides.map((s, i) => (
        <div className="editor-item" key={s.id}>
          <ItemHeader
            index={i}
            label={s.caption || 'Nieuwe dia'}
            canUp={i > 0}
            canDown={i < slides.length - 1}
            onMoveUp={() => onChange({ ...config, slides: moveItem(slides, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, slides: moveItem(slides, i, i + 1) })}
            onDelete={() => onChange({ ...config, slides: slides.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const next = slides.slice();
              next.splice(i + 1, 0, { ...s, id: uid() });
              onChange({ ...config, slides: next });
            }}
          />
          <div className="editor-item-body">
            <ImagePicker
              value={s.imageUrl || undefined}
              onChange={(imageUrl) => update(i, { ...s, imageUrl: imageUrl ?? '' })}
              label="Foto"
            />
            {!s.imageUrl && (
              <p className="hint" style={{ marginTop: -6 }}>
                Zonder foto wordt deze dia niet getoond aan de leerling.
              </p>
            )}
            <Field label="Bijschrift">
              <input
                className="input input-sm"
                value={s.caption}
                placeholder="bv. De Grote Markt van Brussel"
                onChange={(e) => update(i, { ...s, caption: e.target.value })}
              />
            </Field>
            <Field label="Beschrijving (optioneel)" hint="Extra uitleg onder het bijschrift.">
              <textarea
                className="textarea"
                rows={2}
                value={s.description ?? ''}
                onChange={(e) => update(i, { ...s, description: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addSlide}>+ Dia toevoegen</button>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function CarouselPlayer({ widget, timeUp, onComplete }: PlayerProps<CarouselConfig>) {
  const slides = useMemo(
    () => (widget.config.slides ?? []).filter((s) => s.imageUrl),
    [widget.id]
  );
  const total = slides.length;

  const [idx, setIdx] = useState(0);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const firedRef = useRef(false);
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const slide = slides[idx] as CarouselSlide | undefined;
  const allViewed = total > 0 && viewed.size >= total;

  // Huidige dia als bekeken markeren.
  useEffect(() => {
    const s = slides[idx];
    if (!s) return;
    setViewed((v) => (v.has(s.id) ? v : new Set(v).add(s.id)));
  }, [idx, slides]);

  const finish = (count: number) => {
    if (firedRef.current) return;
    firedRef.current = true;
    onComplete({ answers: { bekeken: count }, itemScores: null, earned: 0, max: 0 });
  };

  // Alles bekeken → precies één keer registreren.
  useEffect(() => {
    if (allViewed) finish(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allViewed]);

  // Tijd om → huidige voortgang meteen registreren.
  useEffect(() => {
    if (timeUp) finish(viewed.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const goTo = (i: number) => {
    if (total === 0) return;
    setIdx(Math.max(0, Math.min(total - 1, i)));
  };

  // Pijltjestoetsen (Home/End als bonus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(total - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total]);

  if (!slide) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Nog geen dia's met een foto ingesteld. Vraag je leerkracht om de carrousel aan te vullen.
      </p>
    );
  }

  // Veeg-gebaren (pointer events): horizontaal vegen bladert, verticaal scrollen blijft werken.
  const onPointerDown = (e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) goTo(idx + 1);
    else goTo(idx - 1);
  };

  const navBtnStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    ...(side === 'left' ? { left: 10 } : { right: 10 }),
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: '50%',
    fontSize: '1.5rem',
    lineHeight: 1,
    background: 'rgba(255,255,255,0.92)',
    color: '#17203a',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    border: 'none',
  });

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <section role="group" aria-roledescription="carrousel" aria-label={widget.title || 'Fotocarrousel'}>
        <div
          style={{
            position: 'relative',
            borderRadius: 'var(--radius-l)',
            overflow: 'hidden',
            background: '#10131f',
            boxShadow: 'var(--shadow-2)',
            touchAction: 'pan-y',
            userSelect: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipeRef.current = null; }}
        >
          <figure role="group" aria-roledescription="dia" aria-label={`Dia ${idx + 1} van ${total}`} style={{ margin: 0 }}>
            <img
              src={slide.imageUrl}
              alt={slide.caption || `Foto ${idx + 1}`}
              draggable={false}
              style={{ display: 'block', width: '100%', maxHeight: '62vh', minHeight: 220, objectFit: 'contain' }}
            />
            <figcaption
              aria-live="polite"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '38px 64px 14px',
                background: 'linear-gradient(transparent, rgba(8,10,20,0.82))',
                color: '#fff',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <span className="sr-only">Dia {idx + 1} van {total}. </span>
              {slide.caption && (
                <strong style={{ display: 'block', fontSize: '1.05rem', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                  {slide.caption}
                </strong>
              )}
              {slide.description && (
                <span style={{ display: 'block', fontSize: '0.88rem', opacity: 0.92 }}>
                  {slide.description}
                </span>
              )}
            </figcaption>
          </figure>
          <button
            className="btn btn-icon"
            aria-label="Vorige dia"
            disabled={idx === 0}
            onClick={() => goTo(idx - 1)}
            style={navBtnStyle('left')}
          >
            ‹
          </button>
          <button
            className="btn btn-icon"
            aria-label="Volgende dia"
            disabled={idx === total - 1}
            onClick={() => goTo(idx + 1)}
            style={navBtnStyle('right')}
          >
            ›
          </button>
        </div>

        <div
          role="group"
          aria-label="Kies een dia"
          style={{ display: 'flex', gap: 0, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}
        >
          {slides.map((s, i) => {
            const active = i === idx;
            const seen = viewed.has(s.id);
            // De knop is het tikvlak (minstens 44 × 44 px); de zichtbare stip erin blijft klein.
            return (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={`Ga naar dia ${i + 1}${s.caption ? `: ${s.caption}` : ''}${seen ? ' (bekeken)' : ''}`}
                aria-current={active ? 'true' : undefined}
                title={s.caption || `Dia ${i + 1}`}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'block',
                    width: active ? 30 : 14,
                    height: 14,
                    borderRadius: 999,
                    border: seen || active ? '2px solid transparent' : '2px solid var(--line-strong)',
                    background: active
                      ? 'var(--player-accent, var(--brand))'
                      : seen
                        ? 'color-mix(in srgb, var(--player-accent, var(--brand)) 45%, var(--bg-sunken))'
                        : 'transparent',
                    transition: 'width 0.15s ease, background 0.15s ease',
                  }}
                />
              </button>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, margin: '10px 0 0' }}>
          Dia {idx + 1} van {total} · {viewed.size} van {total} bekeken
        </p>
        {allViewed ? (
          <p role="status" style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, margin: '6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <CheckIcon size={16} aria-hidden /> Je hebt alle dia's bekeken — goed bezig!
          </p>
        ) : (
          <p className="hint" style={{ textAlign: 'center', margin: '6px 0 0' }}>
            Tip: blader met de pijltjestoetsen of veeg over de foto.
          </p>
        )}
      </section>
    </div>
  );
}
