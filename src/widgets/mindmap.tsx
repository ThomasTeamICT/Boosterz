import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Crosshair, Leaf, Undo2 } from 'lucide-react';
import type { MindmapConfig } from '../lib/types';
import { clamp } from '../lib/utils';
import { CheckRow, Field } from '../components/ui';
import { CheckIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

// ── Outline parsen ──────────────────────────────────────────────────────────
// Elke regel is een knoop; 2 spaties inspringing per niveau, maximaal 3 niveaus.

interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

function parseOutline(outline: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = []; // stack[d-1] = laatst geziene knoop op niveau d
  for (const raw of (outline ?? '').split('\n')) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim()) continue;
    const indent = line.match(/^ */)![0].length;
    const wanted = Math.floor(indent / 2) + 1;
    // Niveausprongen en te diepe knopen netjes opvangen (max. 3 niveaus).
    const depth = Math.max(1, Math.min(wanted, 3, stack.length + 1));
    const node: OutlineNode = { text: line.trim(), children: [] };
    if (depth === 1) roots.push(node);
    else stack[depth - 2].children.push(node);
    stack.length = depth - 1;
    stack.push(node);
  }
  return roots;
}

function leafCount(n: OutlineNode): number {
  return n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + leafCount(c), 0);
}

function countNodes(list: OutlineNode[]): number {
  return list.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}

// ── Deterministische radiale layout ─────────────────────────────────────────
// Niveau 1 op straal 150, niveau 2 op 280, niveau 3 op 390. Hoofdtakken krijgen
// een hoekspan naar rato van hun aantal bladeren; subtakken waaieren rond hun
// ouder. Geen physics: dezelfde outline geeft altijd dezelfde tekening.

const RADII = [0, 150, 280, 390];
const ACCENT = 'var(--player-accent, var(--brand))';
const BRANCH_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f'];

interface PlacedNode {
  key: string;
  text: string;
  depth: number; // 0 = centraal begrip
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface PlacedEdge {
  key: string;
  d: string;
  color: string;
  width: number;
}

interface MapLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  vb: { x: number; y: number; w: number; h: number };
}

function truncLabel(s: string): string {
  return s.length > 42 ? s.slice(0, 41).trimEnd() + '…' : s;
}

function polarPt(angle: number, r: number): [number, number] {
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

const rnd = (n: number) => Math.round(n * 10) / 10;

function layoutMindmap(rootText: string, branches: OutlineNode[]): MapLayout {
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];

  const rootLabel = truncLabel(rootText.trim() || 'Mindmap');
  nodes.push({
    key: 'root', text: rootLabel, depth: 0, x: 0, y: 0,
    w: rootLabel.length * 9 + 40, h: 46, color: ACCENT,
  });

  const place = (
    node: OutlineNode, depth: number, angle: number, span: number,
    color: string, key: string, parent: { x: number; y: number; r: number },
  ): void => {
    const label = truncLabel(node.text);
    const r = RADII[Math.min(depth, 3)];
    const [x, y] = polarPt(angle, r);
    const w = label.length * 7.5 + 24;
    const h = depth === 1 ? 34 : depth === 2 ? 30 : 28;

    // Zachte bocht: controlepunt op de straal van de ouder, in de richting van
    // het kind. Vanuit het centrum krijgt de bocht een lichte draai mee.
    const [qx, qy] = parent.r === 0 ? polarPt(angle + 0.1, r * 0.45) : polarPt(angle, parent.r);
    edges.push({
      key: `e-${key}`,
      d: `M ${rnd(parent.x)} ${rnd(parent.y)} Q ${rnd(qx)} ${rnd(qy)} ${rnd(x)} ${rnd(y)}`,
      color,
      width: depth === 1 ? 3 : depth === 2 ? 2.2 : 1.6,
    });
    nodes.push({ key, text: label, depth, x: rnd(x), y: rnd(y), w, h, color });

    if (node.children.length > 0) {
      const maxFan = depth === 1 ? Math.PI * 0.85 : Math.PI * 0.5;
      const minChild = depth === 1 ? 0.34 : 0.26;
      const tot = node.children.reduce((s, c) => s + leafCount(c), 0);
      const usable = Math.min(Math.max(span, node.children.length * minChild), maxFan);
      let start = angle - usable / 2;
      node.children.forEach((c, j) => {
        const s = usable * (leafCount(c) / tot);
        place(c, Math.min(depth + 1, 3), start + s / 2, s, color, `${key}-${j}`, { x, y, r });
        start += s;
      });
    }
  };

  const totalLeaves = branches.reduce((s, b) => s + leafCount(b), 0);
  let a = -Math.PI / 2; // eerste hoofdtak bovenaan
  branches.forEach((b, i) => {
    const span = totalLeaves > 0 ? Math.PI * 2 * (leafCount(b) / totalLeaves) : 0;
    place(b, 1, a + span / 2, span, BRANCH_COLORS[i % BRANCH_COLORS.length], `t${i}`, { x: 0, y: 0, r: 0 });
    a += span;
  });

  const pad = 30;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  return {
    nodes,
    edges,
    vb: { x: rnd(minX - pad), y: rnd(minY - pad), w: rnd(maxX - minX + pad * 2), h: rnd(maxY - minY + pad * 2) },
  };
}

// ── SVG-weergave met eenvoudig pannen ───────────────────────────────────────

function OutlineList({ items }: { items: OutlineNode[] }) {
  if (items.length === 0) return null;
  return (
    <ul>
      {items.map((n, i) => (
        <li key={i}>
          {n.text}
          <OutlineList items={n.children} />
        </li>
      ))}
    </ul>
  );
}

function MindmapCanvas({ root, outline, maxHeight = 480 }: { root: string; outline: string; maxHeight?: number }) {
  const branches = useMemo(() => parseOutline(outline), [outline]);
  const lay = useMemo(() => layoutMindmap(root, branches), [root, branches]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; bx: number; by: number } | null>(null);

  useEffect(() => {
    const measure = () => setWrapW(wrapRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const viewH = Math.min(lay.vb.h, maxHeight);
  const canPan = wrapW > 0 && (lay.vb.w > wrapW + 1 || lay.vb.h > viewH + 1);

  const clampPan = (x: number, y: number) => {
    const mx = Math.max(0, (lay.vb.w - wrapW) / 2 + 50);
    const my = Math.max(0, (lay.vb.h - viewH) / 2 + 50);
    return { x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  };
  const shown = canPan ? clampPan(pan.x, pan.y) : { x: 0, y: 0 };

  const branchCount = branches.length;
  const nodeCount = countNodes(branches);
  const svgLabel = `Mindmap over “${root.trim() || 'Mindmap'}” met ${branchCount} ${branchCount === 1 ? 'hoofdtak' : 'hoofdtakken'} en ${nodeCount} ${nodeCount === 1 ? 'knoop' : 'knopen'}`;

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          overflow: 'hidden', height: viewH, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: canPan ? 'grab' : 'default',
          touchAction: canPan ? 'none' : 'auto',
          userSelect: 'none', borderRadius: 'var(--radius-s)',
        }}
        tabIndex={canPan ? 0 : undefined}
        aria-label={canPan ? 'Mindmap, groter dan het venster. Versleep met de muis of verschuif met de pijltjestoetsen.' : undefined}
        onPointerDown={(e) => {
          if (!canPan) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { sx: e.clientX, sy: e.clientY, bx: shown.x, by: shown.y };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          setPan(clampPan(d.bx + (e.clientX - d.sx), d.by + (e.clientY - d.sy)));
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
          if (!canPan) return;
          const step = 48;
          if (e.key === 'ArrowLeft') { setPan((p) => clampPan(p.x + step, p.y)); e.preventDefault(); }
          else if (e.key === 'ArrowRight') { setPan((p) => clampPan(p.x - step, p.y)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setPan((p) => clampPan(p.x, p.y + step)); e.preventDefault(); }
          else if (e.key === 'ArrowDown') { setPan((p) => clampPan(p.x, p.y - step)); e.preventDefault(); }
        }}
      >
        <svg
          width={lay.vb.w}
          height={lay.vb.h}
          viewBox={`${lay.vb.x} ${lay.vb.y} ${lay.vb.w} ${lay.vb.h}`}
          role="img"
          aria-label={svgLabel}
          focusable="false"
          style={{ flex: 'none', display: 'block', fontFamily: 'inherit', transform: `translate(${shown.x}px, ${shown.y}px)` }}
        >
          <g fill="none" strokeLinecap="round" aria-hidden>
            {lay.edges.map((e) => (
              <path key={e.key} d={e.d} stroke={e.color} strokeWidth={e.width} strokeOpacity={0.8} />
            ))}
          </g>
          {lay.nodes.map((n) => (
            <g key={n.key} aria-hidden>
              <rect
                x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h}
                rx={n.depth === 0 ? 14 : 10}
                style={{
                  fill: n.depth === 0 ? ACCENT : `color-mix(in srgb, ${n.color} 12%, var(--bg-raised))`,
                  stroke: n.depth === 0 ? 'none' : n.color,
                  strokeWidth: n.depth === 1 ? 1.8 : 1.4,
                }}
              />
              <text
                x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                fontSize={n.depth === 0 ? 16 : n.depth === 1 ? 13 : 12.5}
                fontWeight={n.depth === 0 ? 800 : n.depth === 1 ? 700 : 550}
                fill={n.depth === 0 ? '#fff' : 'var(--text)'}
              >
                {n.text}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {canPan && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="hint">De mindmap is groter dan het venster — versleep hem om alles te zien.</span>
          {(shown.x !== 0 || shown.y !== 0) && (
            <button className="btn btn-sm btn-quiet" onClick={() => setPan({ x: 0, y: 0 })} aria-label="Mindmap opnieuw centreren">
<Crosshair size={16} aria-hidden /> Centreer
            </button>
          )}
        </div>
      )}
      {/* Tekstalternatief voor schermlezers */}
      <div className="sr-only">
        <p>Centraal begrip: {root.trim() || 'Mindmap'}</p>
        <OutlineList items={branches} />
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

const MONO = "ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace";

export function MindmapEditor({ config, onChange }: EditorProps<MindmapConfig>) {
  const root = typeof config.root === 'string' ? config.root : '';
  const outline = typeof config.outline === 'string' ? config.outline : '';
  const branches = useMemo(() => parseOutline(outline), [outline]);
  const nodeCount = countNodes(branches);
  const hasContent = root.trim() !== '' || branches.length > 0;

  return (
    <div>
      <Field label="Centraal begrip">
        <input
          className="input" value={root} placeholder="bv. Gezonde voeding"
          onChange={(e) => onChange({ ...config, root: e.target.value })}
        />
      </Field>
      <Field
        label="Takken (outline)"
        hint="Elke regel wordt een knoop. Spring in met 2 spaties per niveau (maximaal 3 niveaus)."
      >
        <textarea
          className="textarea" rows={10} value={outline} spellCheck={false}
          style={{ fontFamily: MONO, fontSize: '0.9rem', lineHeight: 1.6 }}
          placeholder={'Groenten en fruit\n  Vitaminen\n  Vezels\nDranken\n  Water\n  Beperk frisdrank'}
          onChange={(e) => onChange({ ...config, outline: e.target.value })}
          aria-label="Outline van de mindmap"
        />
      </Field>
      <CheckRow
        checked={!!config.studentEditable}
        onChange={(studentEditable) => onChange({ ...config, studentEditable })}
        label="Leerlingen mogen de mindmap bewerken en indienen"
      />
      <p className="hint" style={{ margin: '2px 0 14px' }}>
        {config.studentEditable
          ? 'De leerling past de outline aan en dient de mindmap in. Jij beoordeelt het resultaat (max. 10 punten).'
          : 'De leerling bekijkt de mindmap alleen; er valt niets in te dienen.'}
      </p>

      <h3 style={{ margin: '0 0 8px' }}>Live voorbeeld</h3>
      <div className="card" style={{ padding: 10 }}>
        {hasContent ? (
          <>
            <MindmapCanvas root={root} outline={outline} maxHeight={340} />
            <p className="hint" style={{ textAlign: 'center', margin: '6px 0 0' }}>
              {branches.length} {branches.length === 1 ? 'hoofdtak' : 'hoofdtakken'} · {nodeCount} {nodeCount === 1 ? 'knoop' : 'knopen'}
            </p>
          </>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--text-soft)', padding: '26px 10px', margin: 0 }}>
            Typ een centraal begrip en enkele takken om het voorbeeld te zien.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function MindmapPlayer({ widget, timeUp, onComplete }: PlayerProps<MindmapConfig>) {
  const cfg = widget.config;
  const root = typeof cfg?.root === 'string' ? cfg.root : '';
  const outline = typeof cfg?.outline === 'string' ? cfg.outline : '';
  const isEmpty = root.trim() === '' && parseOutline(outline).length === 0;

  if (isEmpty) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Deze mindmap is nog leeg. De leerkracht voegt een centraal begrip en takken toe in de editor.
      </p>
    );
  }

  if (cfg?.studentEditable) {
    return <MindmapExercise root={root} outline={outline} timeUp={timeUp} onComplete={onComplete} />;
  }
  return <MindmapView root={root} outline={outline} timeUp={timeUp} onComplete={onComplete} />;
}

function MindmapView({ root, outline, timeUp, onComplete }: {
  root: string;
  outline: string;
  timeUp?: boolean;
  onComplete: PlayerProps['onComplete'];
}) {
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);
  const branches = useMemo(() => parseOutline(outline), [outline]);
  const nodeCount = countNodes(branches);

  const finish = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setDone(true);
    onComplete({ answers: { bekeken: true }, itemScores: null, earned: 0, max: 0 });
  };

  useEffect(() => {
    if (timeUp) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  return (
    <div>
      <GameStatus>
        <span className="badge badge-brand"><Leaf size={14} className="icon-inline" aria-hidden /> {branches.length} {branches.length === 1 ? 'hoofdtak' : 'hoofdtakken'}</span>
        <span className="badge">{nodeCount} {nodeCount === 1 ? 'knoop' : 'knopen'}</span>
      </GameStatus>
      <div className="card" style={{ padding: 10 }}>
        <MindmapCanvas root={root} outline={outline} />
      </div>
      {!done ? (
        <div className="player-nav">
          <span />
          <button className="btn btn-primary" onClick={finish}><CheckIcon size={16} aria-hidden /> Ik heb de mindmap bekeken</button>
        </div>
      ) : (
        <p role="status" style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <CheckIcon size={16} aria-hidden /> Klaar: je hebt de mindmap bekeken.
        </p>
      )}
    </div>
  );
}

function MindmapExercise({ root, outline, timeUp, onComplete }: {
  root: string;
  outline: string;
  timeUp?: boolean;
  onComplete: PlayerProps['onComplete'];
}) {
  const [draft, setDraft] = useState(outline);
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);
  const outlineId = useId();
  const branches = useMemo(() => parseOutline(draft), [draft]);
  const nodeCount = countNodes(branches);

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setDone(true);
    onComplete({
      answers: { outline: draft },
      itemScores: { mindmap: { earned: 0, max: 10, mode: 'pending' } },
      earned: 0,
      max: 10,
      hasPending: true,
    });
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (timeUp) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (done) {
    return (
      <div>
        <ResultHero
          earned={0} max={0} showScore={false} hasPending
          title="Mindmap ingediend!"
          subtitle="Je leerkracht bekijkt en beoordeelt je mindmap."
        />
        <div className="card" style={{ padding: 10, marginTop: 16 }}>
          <MindmapCanvas root={root} outline={draft} maxHeight={420} />
        </div>
      </div>
    );
  }

  return (
    <div className="player-main-wide" style={{ margin: '0 auto' }}>
      <GameStatus>
        <span>Vul de mindmap aan — de tekening verandert meteen mee.</span>
        <span className="badge badge-brand"><Leaf size={14} className="icon-inline" aria-hidden /> {branches.length} {branches.length === 1 ? 'hoofdtak' : 'hoofdtakken'}</span>
        <span className="badge">{nodeCount} {nodeCount === 1 ? 'knoop' : 'knopen'}</span>
      </GameStatus>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        <div className="card" style={{ padding: 10, flex: '1 1 400px', minWidth: 0 }}>
          <MindmapCanvas root={root} outline={draft} maxHeight={440} />
        </div>
        <div className="card card-pad" style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <label htmlFor={outlineId} style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-soft)', marginBottom: 5 }}>
            Jouw outline
          </label>
          <textarea
            id={outlineId}
            className="textarea"
            value={draft}
            spellCheck={false}
            style={{ flex: 1, minHeight: 240, fontFamily: MONO, fontSize: '0.9rem', lineHeight: 1.6 }}
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className="hint" style={{ marginTop: 6 }}>
            Elke regel is een knoop; spring in met 2 spaties per niveau (max. 3 niveaus).
          </span>
          <button
            className="btn btn-sm btn-quiet"
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
            onClick={() => setDraft(outline)}
          >
<Undo2 size={16} aria-hidden /> Beginversie terugzetten
          </button>
        </div>
      </div>
      <div className="player-nav">
        <span />
        <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Mindmap indienen</button>
      </div>
    </div>
  );
}
