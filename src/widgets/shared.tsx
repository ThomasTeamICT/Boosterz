import React, { useEffect, useRef } from 'react';
import { PenLine } from 'lucide-react';
import type { ItemScore, Widget } from '../lib/types';
import { ScoreRing } from '../components/ui';
import { pct } from '../lib/utils';
import { DeleteIcon, DuplicateIcon, MoveDownIcon, MoveUpIcon } from '../components/icons';

// ── Contract tussen PlayerPage en widget-spelers ────────────────────────────

export interface PlayerResult {
  answers: Record<string, unknown>;
  itemScores: Record<string, ItemScore> | null;
  earned: number;
  max: number;
  /** true als er open vragen zijn die de leerkracht nog moet beoordelen */
  hasPending?: boolean;
}

export interface PlayerProps<T = unknown> {
  widget: Widget<T>;
  studentName: string;
  /** Voorbeeldmodus in de editor: niets wordt opgeslagen. */
  preview?: boolean;
  /** Wordt true wanneer de tijdslimiet verstreken is → speler dient meteen in. */
  timeUp?: boolean;
  /** Eén keer aanroepen wanneer de leerling klaar is. */
  onComplete: (result: PlayerResult) => void;
}

export interface EditorProps<T = unknown> {
  config: T;
  onChange: (config: T) => void;
}

// ── Editor-hulpjes ──────────────────────────────────────────────────────────

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

export function ItemHeader({
  index, label, onMoveUp, onMoveDown, onDelete, onDuplicate, canUp, canDown,
}: {
  index: number;
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  return (
    <div className="editor-item-head">
      <span className="badge badge-brand">{index + 1}</span>
      <strong style={{ fontSize: '0.9rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </strong>
      <button className="btn btn-quiet btn-icon btn-sm" onClick={onMoveUp} disabled={!canUp} aria-label="Omhoog" title="Omhoog"><MoveUpIcon size={16} /></button>
      <button className="btn btn-quiet btn-icon btn-sm" onClick={onMoveDown} disabled={!canDown} aria-label="Omlaag" title="Omlaag"><MoveDownIcon size={16} /></button>
      {onDuplicate && (
        <button className="btn btn-quiet btn-icon btn-sm" onClick={onDuplicate} aria-label="Dupliceren" title="Dupliceren"><DuplicateIcon size={16} /></button>
      )}
      <button className="btn btn-quiet btn-icon btn-sm" onClick={onDelete} aria-label="Verwijderen" title="Verwijderen" style={{ color: 'var(--err)' }}><DeleteIcon size={16} /></button>
    </div>
  );
}

// ── Resultaatscherm na afloop ───────────────────────────────────────────────

export function ResultHero({
  earned, max, showScore, hasPending, title, subtitle, children,
}: {
  earned: number;
  max: number;
  showScore: boolean;
  hasPending?: boolean;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const p = pct(earned, max);
  // Na het indienen verdwijnt de knop waarop de leerling stond: de focus naar
  // de kop van het resultaat, anders belandt ze op body (en begint een
  // schermlezer of de Tab-toets weer bovenaan de pagina).
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headRef.current?.focus(); }, []);
  return (
    <div className="card result-hero">
      {showScore && max > 0 ? (
        <>
          <ScoreRing percent={p} />
          <h2 ref={headRef} tabIndex={-1}>{title ?? (p >= 70 ? 'Goed gedaan! 🎉' : p >= 45 ? 'Bijna! 💪' : 'Blijf oefenen! 📚')}</h2>
          <p style={{ color: 'var(--text-soft)' }}>
            Je behaalde <strong>{earned}</strong> van <strong>{max}</strong> punten.
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: '3rem' }} aria-hidden>🎉</div>
          <h2 ref={headRef} tabIndex={-1}>{title ?? 'Ingediend!'}</h2>
          {subtitle && <p style={{ color: 'var(--text-soft)' }}>{subtitle}</p>}
        </>
      )}
      {hasPending && (
        <div className="callout" role="status" style={{ marginTop: 14, textAlign: 'left' }}>
          <PenLine size={18} />
          <div>
            <strong>Open vragen worden nog nagekeken.</strong> Je score kan dus nog stijgen.
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

/** Kleine statuslijn boven een spel: "3 van 8 gevonden" enz. */
export function GameStatus({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', marginBottom: 18, fontWeight: 650, color: 'var(--text-soft)',
      }}
    >
      {children}
    </div>
  );
}
