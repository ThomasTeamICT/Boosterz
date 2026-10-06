import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, MousePointerClick } from 'lucide-react';
import type { SpotDifference, SpotDifferenceConfig } from '../lib/types';
import { clamp, uid } from '../lib/utils';
import { ImagePicker } from '../components/ui';
import { CheckIcon, CloseIcon, SearchIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';

// ── Stijl (keyframe-animaties kunnen niet inline) ───────────────────────────
// Eén keer meegerenderd in editor en speler; klassen geprefixt met het widget-id.

const SD_CSS = `
.spotdifference-ring {
  position: absolute; transform: translate(-50%, -50%);
  aspect-ratio: 1 / 1; min-width: 26px; border-radius: 50%; box-sizing: border-box;
  display: grid; place-items: center; font-weight: 800; font-size: 0.85rem;
  pointer-events: none;
}
.spotdifference-found {
  border: 3px solid var(--ok);
  background: color-mix(in srgb, var(--ok) 22%, transparent);
  color: var(--ok);
  animation: spotdifference-pop 0.25s ease;
}
.spotdifference-missed {
  border: 3px dashed var(--warn);
  background: color-mix(in srgb, var(--warn) 20%, transparent);
  color: var(--warn);
}
.spotdifference-edit {
  border: 3px solid var(--player-accent, var(--brand));
  background: color-mix(in srgb, var(--player-accent, var(--brand)) 18%, transparent);
  color: color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text));
}
.spotdifference-missflash {
  position: absolute; transform: translate(-50%, -50%);
  width: 38px; height: 38px; border-radius: 50%;
  border: 3px solid var(--err);
  background: color-mix(in srgb, var(--err) 25%, transparent);
  color: var(--err); display: grid; place-items: center; font-weight: 800;
  pointer-events: none;
  animation: spotdifference-fade 0.65s ease forwards;
}
.spotdifference-shake { animation: spotdifference-shake 0.4s ease; }
/* Toetsenbordbediening: de stage van afbeelding B is een focusbaar vlak met een kruisje dat alleen bij toetsenbordfocus zichtbaar is. */
.spotdifference-stage:focus-visible { border-radius: var(--radius-m); outline-offset: 3px; }
.spotdifference-cursor {
  position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px;
  pointer-events: none; display: none;
}
.spotdifference-stage:focus-visible .spotdifference-cursor { display: block; }
@keyframes spotdifference-pop { from { opacity: 0; } }
@keyframes spotdifference-fade { to { opacity: 0; } }
@keyframes spotdifference-shake {
  0%, 100% { translate: 0 0; }
  20% { translate: -7px 0; }
  40% { translate: 7px 0; }
  60% { translate: -5px 0; }
  80% { translate: 5px 0; }
}
`;

const pairGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 14,
  alignItems: 'start',
};

const stageStyle: React.CSSProperties = { display: 'block' };
const imgStyle: React.CSSProperties = { width: '100%', display: 'block' };

// ── Editor ──────────────────────────────────────────────────────────────────

export function SpotDifferenceEditor({ config, onChange }: EditorProps<SpotDifferenceConfig>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState(false);
  const diffs = config.differences;
  const bothImages = Boolean(config.imageA && config.imageB);

  const update = (i: number, d: SpotDifference) => {
    const next = diffs.slice();
    next[i] = d;
    onChange({ ...config, differences: next });
  };

  return (
    <div>
      <style>{SD_CSS}</style>
      <p className="hint" style={{ marginBottom: 12 }}>
        Kies twee bijna identieke afbeeldingen. Markeer daarna op afbeelding B waar de verschillen
        zitten; de leerling moet binnen de cirkel klikken om een verschil te vinden.
        Tip: gebruik twee even grote afbeeldingen, anders verschuiven de markeringen.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <ImagePicker value={config.imageA || undefined} onChange={(url) => onChange({ ...config, imageA: url ?? '' })} label="Afbeelding A (origineel)" />
        <ImagePicker value={config.imageB || undefined} onChange={(url) => onChange({ ...config, imageB: url ?? '' })} label="Afbeelding B (met verschillen)" />
      </div>
      {!bothImages ? (
        <p className="hint">Kies eerst beide afbeeldingen om verschilpunten te kunnen markeren.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${placing ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPlacing((v) => !v)}
              aria-pressed={placing}
            >
              {placing ? <><MousePointerClick size={16} aria-hidden /> Klik op afbeelding B waar een verschil zit (klaar? klik hier)</> : '+ Verschil markeren'}
            </button>
            <span className="badge badge-brand">{diffs.length} {diffs.length === 1 ? 'verschil' : 'verschillen'}</span>
          </div>
          <div style={pairGrid}>
            <div>
              <p className="hint" style={{ margin: '0 0 4px' }}>Afbeelding A</p>
              <div className="hotspot-stage" style={stageStyle}>
                <img src={config.imageA} alt="Afbeelding A (origineel)" style={imgStyle} />
              </div>
            </div>
            <div>
              <p className="hint" style={{ margin: '0 0 4px' }}>Afbeelding B — hier markeer je</p>
              <div
                ref={stageRef}
                className="hotspot-stage"
                style={{ ...stageStyle, cursor: placing ? 'crosshair' : 'default' }}
                onClick={(e) => {
                  if (!placing || !stageRef.current) return;
                  const rect = stageRef.current.getBoundingClientRect();
                  const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
                  const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
                  onChange({ ...config, differences: [...diffs, { id: uid(), x, y, radius: 5, label: '' }] });
                }}
              >
                <img src={config.imageB} alt="Afbeelding B (met verschillen)" style={imgStyle} />
                {diffs.map((d, i) => (
                  <div
                    key={d.id}
                    className="spotdifference-ring spotdifference-edit"
                    style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.radius * 2}%` }}
                    title={d.label?.trim() || `Verschil ${i + 1}`}
                    aria-hidden
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {diffs.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              Nog geen verschilpunten. Klik op “+ Verschil markeren” en klik daarna op afbeelding B.
            </p>
          )}
          {diffs.map((d, i) => (
            <div className="option-row" key={d.id} style={{ marginTop: 8 }}>
              <span className="badge badge-brand">{i + 1}</span>
              <input
                className="input input-sm"
                value={d.label ?? ''}
                placeholder="Label (optioneel, bv. 'de kerktoren')"
                aria-label={`Label van verschil ${i + 1}`}
                onChange={(e) => update(i, { ...d, label: e.target.value })}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>
                Straal
                <input
                  className="input input-sm"
                  type="number"
                  min={1}
                  max={30}
                  step={0.5}
                  style={{ width: 76 }}
                  value={d.radius}
                  aria-label={`Klikstraal van verschil ${i + 1} in procent van de breedte`}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    update(i, { ...d, radius: Number.isFinite(n) ? clamp(n, 1, 30) : 5 });
                  }}
                />
                %
              </label>
              <button
                className="btn btn-quiet btn-icon btn-sm"
                aria-label={`Verschil ${i + 1} verwijderen`}
                onClick={() => onChange({ ...config, differences: diffs.filter((_, j) => j !== i) })}
              >
                <CloseIcon size={16} aria-hidden />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

type EndReason = 'won' | 'gaveup' | 'time';

export function SpotDifferencePlayer({ widget, timeUp, onComplete }: PlayerProps<SpotDifferenceConfig>) {
  const config = widget.config;
  const diffs = useMemo(
    () => (config.differences ?? []).filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y) && d.radius > 0),
    [widget.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [misses, setMisses] = useState(0);
  const [missFlash, setMissFlash] = useState<{ x: number; y: number; key: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'err' | 'info'; n: number } | null>(null);
  // Positie van het toetsenbordkruisje, in procent van de afbeelding (start in het midden).
  const [kbPos, setKbPos] = useState({ x: 50, y: 50 });
  const [end, setEnd] = useState<EndReason | null>(null);
  const submittedRef = useRef(false);
  const missTimer = useRef<number | undefined>(undefined);

  const finish = (reason: EndReason, foundSet: Set<string>, missCount: number) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setEnd(reason);
    onComplete({
      answers: { fouten: missCount, gevonden: foundSet.size, totaal: diffs.length, opgegeven: reason !== 'won' },
      itemScores: null,
      earned: foundSet.size,
      max: diffs.length,
    });
  };

  useEffect(() => {
    if (timeUp && !submittedRef.current && diffs.length > 0) finish('time', found, misses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  useEffect(() => () => window.clearTimeout(missTimer.current), []);

  if (!config.imageA || !config.imageB || diffs.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Deze oefening heeft nog geen twee afbeeldingen met gemarkeerde verschillen.
      </p>
    );
  }

  const rings = (reveal: boolean) =>
    diffs.map((d, i) => {
      const isFound = found.has(d.id);
      if (!isFound && !reveal) return null;
      return (
        <div
          key={d.id}
          className={`spotdifference-ring ${isFound ? 'spotdifference-found' : 'spotdifference-missed'}`}
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.radius * 2}%` }}
          title={d.label?.trim() || `Verschil ${i + 1}`}
          aria-hidden
        >
          {isFound ? <CheckIcon size={14} /> : '!'}
        </div>
      );
    });

  if (end) {
    const missed = diffs.filter((d) => !found.has(d.id));
    const detail = `Je vond ${found.size} van de ${diffs.length} verschillen, met ${misses} ${misses === 1 ? 'foute klik' : 'foute klikken'}.`;
    return (
      <div>
        <style>{SD_CSS}</style>
        <ResultHero
          earned={found.size}
          max={diffs.length}
          showScore={widget.settings.showScore}
          title={end === 'won' ? 'Alle verschillen gevonden!' : end === 'time' ? 'De tijd is om' : 'Ingediend — goed geprobeerd!'}
          subtitle={detail}
        >
          {widget.settings.showScore && <p style={{ color: 'var(--text-soft)', margin: '6px 0 0' }}>{detail}</p>}
        </ResultHero>
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <h3>{missed.length > 0 ? 'Hier zaten de verschillen' : 'Dit waren de verschillen'}</h3>
          <div style={pairGrid}>
            <div className="hotspot-stage" style={stageStyle}>
              <img src={config.imageA} alt="Afbeelding A met alle verschillen aangeduid" style={imgStyle} />
              {rings(true)}
            </div>
            <div className="hotspot-stage" style={stageStyle}>
              <img src={config.imageB} alt="Afbeelding B met alle verschillen aangeduid" style={imgStyle} />
              {rings(true)}
            </div>
          </div>
          {missed.length > 0 && (
            <p style={{ margin: '12px 0 0' }}>
              <strong>Nog niet gevonden ({missed.length}):</strong>{' '}
              {missed.map((d) => d.label?.trim() || `verschil ${diffs.indexOf(d) + 1}`).join(', ')}{' '}
              <span aria-hidden>— de oranje gestreepte cirkels.</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  // Het wisselende teken (n) zorgt dat dezelfde melding twee keer na elkaar opnieuw wordt voorgelezen.
  const say = (text: string, kind: 'ok' | 'err' | 'info') => setMessage((m) => ({ text, kind, n: (m?.n ?? 0) + 1 }));

  // Eén controle voor muis, aanraking en toetsenbord: de plek wordt opgegeven in procent van de afbeelding.
  const checkAt = (xPct: number, yPct: number) => {
    if (submittedRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const within = (d: SpotDifference) => {
      const dx = ((xPct - d.x) / 100) * rect.width;
      const dy = ((yPct - d.y) / 100) * rect.height;
      return Math.hypot(dx, dy) <= (d.radius / 100) * rect.width;
    };
    const hitNew = diffs.find((d) => !found.has(d.id) && within(d));
    if (hitNew) {
      const next = new Set(found).add(hitNew.id);
      setFound(next);
      say(
        hitNew.label?.trim() ? `Juist! Je vond: ${hitNew.label}. (${next.size} van ${diffs.length})` : `Juist! Verschil ${next.size} van ${diffs.length} gevonden.`,
        'ok',
      );
      if (next.size === diffs.length) finish('won', next, misses);
      return;
    }
    if (diffs.some((d) => found.has(d.id) && within(d))) {
      say('Dit verschil had je al gevonden.', 'info');
      return;
    }
    setMisses((m) => m + 1);
    say('Daar zit geen verschil. Kijk nog eens goed!', 'err');
    window.clearTimeout(missTimer.current);
    setMissFlash({ x: xPct, y: yPct, key: Date.now() });
    missTimer.current = window.setTimeout(() => setMissFlash(null), 650);
  };

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setKbPos({ x: clamp(x, 0, 100), y: clamp(y, 0, 100) });
    checkAt(x, y);
  };

  // Pijltjes verschuiven het kruisje met 5 % (met Shift 1 %); Enter of spatie controleert op die plek.
  const onStageKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? 1 : 5;
    let { x, y } = kbPos;
    switch (e.key) {
      case 'ArrowLeft': x -= step; break;
      case 'ArrowRight': x += step; break;
      case 'ArrowUp': y -= step; break;
      case 'ArrowDown': y += step; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        checkAt(kbPos.x, kbPos.y);
        return;
      default:
        return;
    }
    e.preventDefault();
    setKbPos({ x: clamp(x, 0, 100), y: clamp(y, 0, 100) });
  };

  const remaining = diffs.length - found.size;
  const caption: React.CSSProperties = {
    margin: '0 0 4px', fontWeight: 650, fontSize: '0.88rem', textAlign: 'center', color: 'var(--text-soft)',
  };

  return (
    <div>
      <style>{SD_CSS}</style>
      <GameStatus>
        <span className="badge badge-ok"><SearchIcon size={14} className="icon-inline" aria-hidden /> {found.size} / {diffs.length} gevonden</span>
        <span className="badge badge-err"><CloseIcon size={14} className="icon-inline" aria-hidden /> {misses} fout</span>
      </GameStatus>
      <p
        role="status"
        aria-live="assertive"
        style={{
          textAlign: 'center', minHeight: 26, fontWeight: 650, margin: '0 0 10px',
          color: message ? (message.kind === 'ok' ? 'var(--ok)' : message.kind === 'err' ? 'var(--err)' : 'var(--text-soft)') : 'var(--text-soft)',
        }}
      >
        {message
          ? `${message.text}${message.n % 2 === 1 ? '\u00A0' : ''}`
          : 'Vergelijk de twee afbeeldingen en klik op afbeelding B waar je een verschil ziet, of ga met de pijltjestoetsen naar de plek en druk op Enter.'}
      </p>
      <div style={pairGrid}>
        <div>
          <p style={caption}>Afbeelding A</p>
          <div
            className="hotspot-stage"
            style={stageStyle}
            onClick={() => say('Klik op afbeelding B om een verschil aan te duiden.', 'info')}
          >
            <img src={config.imageA} alt="Afbeelding A — het origineel" style={imgStyle} />
            {rings(false)}
          </div>
        </div>
        <div>
          <p style={{ ...caption, color: 'color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))' }}>Afbeelding B — klik op de verschillen</p>
          <div
            ref={stageRef}
            className={`hotspot-stage spotdifference-stage ${missFlash ? 'spotdifference-shake' : ''}`}
            style={{ ...stageStyle, cursor: 'crosshair' }}
            role="application"
            tabIndex={0}
            aria-label="Afbeelding B. Verplaats het kruisje met de pijltjestoetsen, met Shift in kleine stappen. Druk op Enter om te controleren of daar een verschil zit."
            onClick={onStageClick}
            onKeyDown={onStageKeyDown}
          >
            <img src={config.imageB} alt="Afbeelding B — klik waar je een verschil ziet" style={imgStyle} />
            {rings(false)}
            <svg
              className="spotdifference-cursor"
              data-testid="sd-cursor"
              viewBox="0 0 34 34"
              style={{ left: `${kbPos.x}%`, top: `${kbPos.y}%` }}
              aria-hidden
              focusable="false"
            >
              <path d="M17 2v30M2 17h30" stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none" />
              <path d="M17 2v30M2 17h30" stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
            {missFlash && (
              <div
                key={missFlash.key}
                className="spotdifference-missflash"
                style={{ left: `${missFlash.x}%`, top: `${missFlash.y}%` }}
                aria-hidden
              >
                <CloseIcon size={16} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="player-nav">
        <span />
        <button
          className="btn btn-ghost"
          onClick={() => finish('gaveup', found, misses)}
          aria-label={remaining === 1
            ? 'Ik geef op — toon het resterende verschil en dien in'
            : `Ik geef op — toon de ${remaining} resterende verschillen en dien in`}
        >
<Flag size={16} aria-hidden /> Ik geef op ({remaining} nog te vinden)
        </button>
      </div>
    </div>
  );
}
