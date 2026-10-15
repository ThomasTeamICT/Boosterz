import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { TipTile, TipTilesConfig } from '../lib/types';
import { uid } from '../lib/utils';
import { EmptyState, Field, ImagePicker, Modal } from '../components/ui';
import { CheckIcon, PreviewIcon, TipIcon } from '../components/icons';
import { EditorProps, GameStatus, ItemHeader, moveItem, PlayerProps } from './shared';

const DEFAULT_TILE_COLOR = '#4f46e5';

// ── Editor ──────────────────────────────────────────────────────────────────

export function TipTilesEditor({ config, onChange }: EditorProps<TipTilesConfig>) {
  const tiles = config.tiles ?? [];

  const update = (i: number, t: TipTile) => {
    const next = tiles.slice();
    next[i] = t;
    onChange({ ...config, tiles: next });
  };

  const addTile = () =>
    onChange({ ...config, tiles: [...tiles, { id: uid(), title: '', text: '' }] });

  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De leerling ziet een raster van tegels en klikt elke tegel open om de tip te lezen.
        Zodra alle tegels bekeken zijn, is de opdracht klaar.
      </p>
      {tiles.length === 0 && (
        <EmptyState icon={<TipIcon size={40} aria-hidden />} title="Nog geen tegels">
          <p>Voeg je eerste tip-tegel toe, bv. een studietip of een stappenplan.</p>
        </EmptyState>
      )}
      {tiles.map((t, i) => (
        <div className="editor-item" key={t.id}>
          <ItemHeader
            index={i}
            label={t.title || 'Nieuwe tip'}
            canUp={i > 0}
            canDown={i < tiles.length - 1}
            onMoveUp={() => onChange({ ...config, tiles: moveItem(tiles, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, tiles: moveItem(tiles, i, i + 1) })}
            onDelete={() => onChange({ ...config, tiles: tiles.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const next = tiles.slice();
              next.splice(i + 1, 0, { ...t, id: uid() });
              onChange({ ...config, tiles: next });
            }}
          />
          <div className="editor-item-body">
            <Field label="Titel">
              <input
                className="input input-sm"
                value={t.title}
                placeholder="bv. Plan je week op zondag"
                onChange={(e) => update(i, { ...t, title: e.target.value })}
              />
            </Field>
            <Field label="Tekst" hint="Dit leest de leerling wanneer de tegel opengeklikt wordt.">
              <textarea
                className="textarea"
                rows={3}
                value={t.text}
                placeholder="Schrijf hier de volledige tip of uitleg…"
                onChange={(e) => update(i, { ...t, text: e.target.value })}
              />
            </Field>
            <ImagePicker
              value={t.imageUrl}
              onChange={(imageUrl) => update(i, { ...t, imageUrl })}
              label="Afbeelding (optioneel)"
            />
            <Field label="Tegelkleur (optioneel)" hint="De kleur verschijnt als accentrand op de tegel.">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={t.color ?? DEFAULT_TILE_COLOR}
                  aria-label={`Tegelkleur voor tip ${i + 1}`}
                  onChange={(e) => update(i, { ...t, color: e.target.value })}
                />
                {t.color ? (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => update(i, { ...t, color: undefined })}
                  >
                    Standaardkleur gebruiken
                  </button>
                ) : (
                  <span className="hint">Nu: standaardkleur van de oefening.</span>
                )}
              </div>
            </Field>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addTile}>+ Tegel toevoegen</button>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function TipTilesPlayer({ widget, timeUp, onComplete }: PlayerProps<TipTilesConfig>) {
  const tiles = useMemo(
    () => (widget.config.tiles ?? []).filter((t) => t.title.trim() || t.text.trim()),
    [widget.id]
  );
  const total = tiles.length;

  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const firedRef = useRef(false);

  const allViewed = total > 0 && viewed.size >= total;

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

  if (total === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Nog geen tip-tegels ingesteld. Vraag je leerkracht om tegels toe te voegen.
      </p>
    );
  }

  const openTile = (t: TipTile) => {
    setOpenId(t.id);
    setViewed((v) => (v.has(t.id) ? v : new Set(v).add(t.id)));
  };

  const open = openId ? tiles.find((t) => t.id === openId) ?? null : null;
  const nextUnread = open ? tiles.find((t) => t.id !== open.id && !viewed.has(t.id)) ?? null : null;

  const tileTitle = (t: TipTile, i: number) => t.title.trim() || `Tip ${i + 1}`;

  return (
    <div>
      <GameStatus>
        <span className="badge badge-brand"><PreviewIcon size={14} className="icon-inline" aria-hidden /> {viewed.size} van {total} bekeken</span>
        {allViewed && <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" aria-hidden /> Alle tips gelezen — goed bezig!</span>}
      </GameStatus>
      <div className="progressbar" style={{ maxWidth: 420, margin: '0 auto 20px' }} aria-hidden>
        <div style={{ width: `${Math.round((viewed.size / total) * 100)}%` }} />
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginBottom: 16, fontSize: '0.9rem' }}>
        Klik elke tegel open om de tip te lezen.
      </p>

      <div
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        }}
      >
        {tiles.map((t, i) => {
          const seen = viewed.has(t.id);
          const accent = t.color || 'var(--player-accent, var(--brand))';
          return (
            <button
              key={t.id}
              className="card"
              onClick={() => openTile(t)}
              aria-haspopup="dialog"
              aria-label={`${tileTitle(t, i)}${seen ? ' (bekeken)' : ' (nog niet bekeken)'} — tip openen`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                padding: 0,
                overflow: 'hidden',
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                borderTop: `5px solid ${accent}`,
                opacity: seen ? 0.92 : 1,
              }}
            >
              {t.imageUrl && (
                <img
                  src={t.imageUrl}
                  alt=""
                  style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
                />
              )}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px 14px', flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ flex: 1, lineHeight: 1.3 }}>{tileTitle(t, i)}</strong>
                  {seen && <span className="badge badge-ok" aria-hidden><CheckIcon size={14} className="icon-inline" /> Bekeken</span>}
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-faint)', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {seen ? 'Opnieuw lezen' : 'Lees de tip'} <ArrowRight size={14} aria-hidden />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <Modal
          title={tileTitle(open, tiles.indexOf(open))}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpenId(null)}>Sluiten</button>
              {nextUnread && (
                <button
                  className="btn btn-primary"
                  onClick={() => openTile(nextUnread)}
                  aria-label={`Volgende tip openen: ${tileTitle(nextUnread, tiles.indexOf(nextUnread))}`}
                >
                  Volgende tip <ArrowRight size={16} aria-hidden />
                </button>
              )}
            </>
          }
        >
          {open.imageUrl && (
            <img
              src={open.imageUrl}
              alt=""
              style={{
                width: '100%',
                maxHeight: 280,
                objectFit: 'contain',
                borderRadius: 'var(--radius-m)',
                marginBottom: 12,
                display: 'block',
                background: 'var(--bg-sunken)',
              }}
            />
          )}
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {open.text.trim() || 'Deze tegel heeft (nog) geen tekst.'}
          </p>
        </Modal>
      )}
    </div>
  );
}
