import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Brain } from 'lucide-react';
import type { TimelineConfig, TimelineEvent } from '../lib/types';
import { normalizeAnswer, shuffledNotIdentity, uid } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { CheckIcon, MoveDownIcon, MoveUpIcon } from '../components/icons';
import { EditorProps, GameStatus, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';

export function TimelineEditor({ config, onChange }: EditorProps<TimelineConfig>) {
  const events = config.events;
  const update = (i: number, e: TimelineEvent) => {
    const next = events.slice();
    next[i] = e;
    onChange({ ...config, events: next });
  };
  return (
    <div>
      <Field label="Modus">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${config.mode === 'view' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, mode: 'view' })}>
            <BookOpen size={16} aria-hidden /> Bekijken (leren)
          </button>
          <button className={`btn btn-sm ${config.mode === 'exercise' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...config, mode: 'exercise' })}>
            <Brain size={16} aria-hidden /> Oefening (rangschikken)
          </button>
        </div>
        <span className="hint">
          {config.mode === 'view'
            ? 'De leerling bekijkt de tijdlijn in chronologische volgorde.'
            : 'De leerling sleept de gebeurtenissen in de juiste volgorde.'}
        </span>
      </Field>
      <p className="hint" style={{ marginBottom: 10 }}>Zet de gebeurtenissen hier in de juiste (chronologische) volgorde.</p>
      {events.map((ev, i) => (
        <div className="editor-item" key={ev.id}>
          <ItemHeader
            index={i} label={`${ev.date || '…'} — ${ev.title || 'Nieuwe gebeurtenis'}`}
            canUp={i > 0} canDown={i < events.length - 1}
            onMoveUp={() => onChange({ ...config, events: moveItem(events, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, events: moveItem(events, i, i + 1) })}
            onDelete={() => onChange({ ...config, events: events.filter((_, j) => j !== i) })}
          />
          <div className="editor-item-body">
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Datum / jaartal">
                <input className="input input-sm" style={{ maxWidth: 140 }} value={ev.date} placeholder="bv. 1830"
                  onChange={(e) => update(i, { ...ev, date: e.target.value })} />
              </Field>
              <div style={{ flex: 1 }}>
                <Field label="Titel">
                  <input className="input input-sm" value={ev.title} placeholder="bv. Belgische onafhankelijkheid"
                    onChange={(e) => update(i, { ...ev, title: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Beschrijving (optioneel)">
              <textarea className="textarea" rows={2} value={ev.description ?? ''}
                onChange={(e) => update(i, { ...ev, description: e.target.value })} />
            </Field>
            <ImagePicker value={ev.imageUrl} onChange={(imageUrl) => update(i, { ...ev, imageUrl })} />
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => onChange({ ...config, events: [...events, { id: uid(), date: '', title: '' }] })}>
        + Gebeurtenis toevoegen
      </button>
    </div>
  );
}

export function TimelinePlayer({ widget, timeUp, onComplete }: PlayerProps<TimelineConfig>) {
  const events = useMemo(() => widget.config.events.filter((e) => e.title.trim()), [widget.id]);

  if (events.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen gebeurtenissen ingesteld.</p>;

  if (widget.config.mode === 'view') return <TimelineView events={events} timeUp={timeUp} onComplete={onComplete} />;
  return <TimelineExercise widget={widget} events={events} timeUp={timeUp} onComplete={onComplete} />;
}

function TimelineView({ events, timeUp, onComplete }: { events: TimelineEvent[]; timeUp?: boolean; onComplete: PlayerProps['onComplete'] }) {
  const [completed, setCompleted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const submittedRef = useRef(false);

  // Tijd om: het bezoek registreren, maar niet doen alsof alles gelezen is.
  useEffect(() => {
    if (!timeUp || submittedRef.current) return;
    submittedRef.current = true;
    setCompleted(true);
    setTimedOut(true);
    onComplete({ answers: { bekeken: false }, itemScores: null, earned: 0, max: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  return (
    <div>
      <div className="timeline-rail">
        {events.map((ev) => (
          <div className="timeline-node" key={ev.id}>
            <div className="timeline-date">{ev.date}</div>
            <h3 style={{ margin: '2px 0 4px' }}>{ev.title}</h3>
            {ev.imageUrl && <img src={ev.imageUrl} alt="" style={{ maxWidth: 320, width: '100%', borderRadius: 10, margin: '6px 0' }} />}
            {ev.description && <p style={{ color: 'var(--text-soft)', margin: 0 }}>{ev.description}</p>}
          </div>
        ))}
      </div>
      {!completed && (
        <div className="player-nav">
          <span />
          <button className="btn btn-primary" onClick={() => {
            submittedRef.current = true;
            setCompleted(true);
            onComplete({ answers: { bekeken: true }, itemScores: null, earned: 0, max: 0 });
          }}>
<CheckIcon size={18} aria-hidden /> Ik heb alles gelezen
          </button>
        </div>
      )}
      {completed && !timedOut && <p style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckIcon size={16} aria-hidden /> Geregistreerd — goed bezig!</p>}
      {timedOut && <p role="status" style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 700 }}>De tijd is om. Je bezoek is geregistreerd.</p>}
    </div>
  );
}

function TimelineExercise({ widget, events, timeUp, onComplete }: { widget: PlayerProps<TimelineConfig>['widget']; events: TimelineEvent[]; timeUp?: boolean; onComplete: PlayerProps['onComplete'] }) {
  // De beginvolgorde is nooit meteen de juiste. Twee gebeurtenissen met dezelfde zichtbare tekst
  // zijn onderling niet te onderscheiden, dus die tellen als dezelfde plaats.
  const [order, setOrder] = useState<number[]>(() => {
    const zichtbaar = (i: number) => `${normalizeAnswer(events[i].title)}\u0000${normalizeAnswer(events[i].description ?? '')}`;
    return shuffledNotIdentity(events.map((_, i) => i), (a, b) => zichtbaar(a) === zichtbaar(b));
  });
  const [phase, setPhase] = useState<'playing' | 'done'>('playing');
  const [timedOut, setTimedOut] = useState(false);
  const submittedRef = useRef(false);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
  };

  const correctCount = order.filter((orig, pos) => orig === pos).length;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase('done');
    onComplete({
      answers: { volgorde: order.map((i) => events[i].title) },
      itemScores: null,
      earned: order.filter((orig, pos) => orig === pos).length,
      max: events.length,
    });
    window.scrollTo({ top: 0 });
  };

  // Tijd om: de huidige volgorde indienen, eenmalig.
  useEffect(() => {
    if (!timeUp || submittedRef.current) return;
    setTimedOut(true);
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (phase === 'done') {
    return (
      <div>
        <ResultHero earned={correctCount} max={events.length} showScore={widget.settings.showScore}
          title={timedOut ? 'De tijd is om!' : undefined}
          subtitle={`${correctCount} van de ${events.length} op de juiste plaats.`} />
        {widget.settings.showFeedback && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h3>De juiste volgorde</h3>
            <div className="timeline-rail">
              {events.map((ev) => (
                <div className="timeline-node" key={ev.id}>
                  <div className="timeline-date">{ev.date}</div>
                  <strong>{ev.title}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <GameStatus><span>Zet de gebeurtenissen in chronologische volgorde (vroegste bovenaan).</span></GameStatus>
      {order.map((orig, pos) => (
        <div className="order-item" key={events[orig].id}>
          <span className="badge badge-brand">{pos + 1}</span>
          <div style={{ flex: 1 }}>
            <strong>{events[orig].title}</strong>
            {events[orig].description && <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>{events[orig].description}</div>}
          </div>
          <span className="updown">
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Omhoog" disabled={pos === 0} onClick={() => move(pos, pos - 1)}><MoveUpIcon size={16} aria-hidden /></button>
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Omlaag" disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)}><MoveDownIcon size={16} aria-hidden /></button>
          </span>
        </div>
      ))}
      <div className="player-nav">
        <span />
        <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Indienen</button>
      </div>
    </div>
  );
}
