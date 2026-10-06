import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleDot, Clock, type LucideIcon, Pause, PenLine, Scale,
} from 'lucide-react';
import type {
  MCQuestion, Question, ShortQuestion, TFQuestion, VideoCheckpoint, VideoQuizConfig,
} from '../lib/types';
import { gradeQuiz } from '../lib/grading';
import { uid } from '../lib/utils';
import { CheckRow, Field, ImagePicker } from '../components/ui';
import {
  CheckIcon, CloseIcon, DeleteIcon, InfoIcon, TryIcon, WarningIcon,
} from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';
import { QuestionView, makeQuestion, removeOptionAt } from './quiz';

// ── YouTube IFrame API-typen ────────────────────────────────────────────────

interface YTPlayerInstance {
  getCurrentTime(): number;
  getPlayerState(): number;
  pauseVideo(): void;
  playVideo(): void;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  /** Domein van de speler; youtube-nocookie.com = de privacymodus van YouTube. */
  host?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { target: YTPlayerInstance; data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: number; ENDED: number; PLAYING: number;
    PAUSED: number; BUFFERING: number; CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ── Hulpfuncties ────────────────────────────────────────────────────────────

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Privacymodus van YouTube: geen volgcookies tot de leerling afspeelt. De
 * iframe-API zelf (YT_SCRIPT_SRC) komt wel van www.youtube.com; die host staat
 * daarom in de CSP (src/offline/csp.ts).
 */
const YT_PLAYER_HOST = 'https://www.youtube-nocookie.com';
const ytEmbedUrl = (videoId: string) => `${YT_PLAYER_HOST}/embed/${videoId}`;

/** Haalt de video-id uit een YouTube-URL of accepteert een losse video-id. */
function parseYouTubeId(input: string | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (YT_ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? '';
    return YT_ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && YT_ID_RE.test(v)) return v;
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/** 95 → "1:35" */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Accepteert "1:35" of "95" → seconden; null bij ongeldige invoer. */
function parseTimeText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

function sortCheckpoints(list: VideoCheckpoint[]): VideoCheckpoint[] {
  return list.slice().sort((a, b) => a.timeSec - b.timeSec);
}

const VQ_TYPES: { type: 'mc' | 'tf' | 'short'; name: string; icon: LucideIcon }[] = [
  { type: 'mc', name: 'Meerkeuze', icon: CircleDot },
  { type: 'tf', name: 'Juist of onjuist', icon: Scale },
  { type: 'short', name: 'Kort antwoord', icon: PenLine },
];

function vqLabel(q: Question): string {
  const meta = VQ_TYPES.find((t) => t.type === q.type);
  const name = meta ? meta.name : 'Vraag';
  return q.prompt.trim() ? `${name} — ${q.prompt.slice(0, 48)}` : name;
}

// ── Tijd-invoer (min:sec of seconden) ───────────────────────────────────────

function TimeInput({
  valueSec, onCommit, ariaLabel,
}: { valueSec: number; onCommit: (sec: number) => void; ariaLabel: string }) {
  const [text, setText] = useState(() => fmtTime(valueSec));
  useEffect(() => { setText(fmtTime(valueSec)); }, [valueSec]);

  const commit = () => {
    const sec = parseTimeText(text);
    if (sec === null) setText(fmtTime(valueSec));
    else if (sec !== valueSec) onCommit(sec);
    else setText(fmtTime(valueSec));
  };

  return (
    <input
      className="input input-sm"
      style={{ width: 78, textAlign: 'center', fontVariantNumeric: 'tabular-nums', flex: 'none' }}
      value={text}
      inputMode="numeric"
      aria-label={ariaLabel}
      title="Tijdstip in de video (min:sec of seconden)"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

// ── Compacte vraagvelden per type ───────────────────────────────────────────

function McCompact({ q, onChange }: { q: MCQuestion; onChange: (q: Question) => void }) {
  return (
    <div>
      {q.options.map((opt, i) => (
        <div className="option-row" key={i}>
          <input
            type="radio"
            checked={q.correctIndex === i}
            aria-label={`Antwoordoptie ${i + 1} is het juiste antwoord`}
            title="Markeer als juist antwoord"
            style={{ width: 18, height: 18, accentColor: 'var(--ok)' }}
            onChange={() => onChange({ ...q, correctIndex: i })}
          />
          <input
            className="input input-sm"
            value={opt}
            placeholder={`Antwoordoptie ${i + 1}`}
            onChange={(e) => {
              const options = q.options.slice();
              options[i] = e.target.value;
              onChange({ ...q, options });
            }}
          />
          <button
            className="btn btn-quiet btn-icon btn-sm"
            aria-label="Optie verwijderen"
            disabled={q.options.length <= 2}
            onClick={() => {
              // Het juiste antwoord verwijderen maakt geen andere optie stil juist.
              const r = removeOptionAt(q.options, q.correctIndex, i);
              onChange({ ...q, options: r.options, correctIndex: r.correct as number });
            }}
          ><CloseIcon size={16} aria-hidden /></button>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...q, options: [...q.options, ''] })}>
        + Optie toevoegen
      </button>
      {q.correctIndex >= 0 && q.correctIndex < q.options.length ? (
        <p className="hint" style={{ marginTop: 6 }}>Vink het juiste antwoord aan.</p>
      ) : (
        <p className="hint" role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
          <WarningIcon size={16} className="icon-inline" aria-hidden /> Nog geen juist antwoord aangeduid. Vink het juiste antwoord aan.
        </p>
      )}
    </div>
  );
}

function TfCompact({ q, onChange }: { q: TFQuestion; onChange: (q: Question) => void }) {
  return (
    <Field label="Juiste antwoord">
      <div style={{ display: 'flex', gap: 8 }}>
        <button className={`btn btn-sm ${q.answer ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={q.answer}
          onClick={() => onChange({ ...q, answer: true })}>Juist</button>
        <button className={`btn btn-sm ${!q.answer ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={!q.answer}
          onClick={() => onChange({ ...q, answer: false })}>Onjuist</button>
      </div>
    </Field>
  );
}

function ShortCompact({ q, onChange }: { q: ShortQuestion; onChange: (q: Question) => void }) {
  return (
    <>
      <Field label="Juiste antwoorden" hint="Elk aanvaard antwoord op een eigen regel.">
        <textarea
          className="textarea" rows={2}
          value={q.accepted.join('\n')}
          onChange={(e) => onChange({ ...q, accepted: e.target.value.split('\n') })}
        />
      </Field>
      <CheckRow checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} label="Hoofdlettergevoelig" />
    </>
  );
}

function QuestionFields({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  if (q.type === 'mc') return <McCompact q={q} onChange={onChange} />;
  if (q.type === 'tf') return <TfCompact q={q} onChange={onChange} />;
  if (q.type === 'short') return <ShortCompact q={q} onChange={onChange} />;
  return <p className="hint">Dit vraagtype kun je hier niet bewerken. Kies hierboven meerkeuze, juist/onjuist of kort antwoord.</p>;
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

export function VideoQuizEditor({ config, onChange }: EditorProps<VideoQuizConfig>) {
  const cps = config.checkpoints ?? [];
  const videoUrl = config.videoUrl ?? '';
  const videoId = parseYouTubeId(videoUrl);

  const update = (i: number, cp: VideoCheckpoint) => {
    const checkpoints = cps.slice();
    checkpoints[i] = cp;
    onChange({ ...config, checkpoints });
  };
  const updateQuestion = (i: number, q: Question) => update(i, { ...cps[i], question: q });

  const commitTime = (i: number, sec: number) => {
    const checkpoints = cps.slice();
    checkpoints[i] = { ...checkpoints[i], timeSec: sec };
    onChange({ ...config, checkpoints: sortCheckpoints(checkpoints) });
  };

  const switchType = (i: number, t: 'mc' | 'tf' | 'short') => {
    const cp = cps[i];
    if (cp.question.type === t) return;
    const nq = makeQuestion(t);
    nq.id = cp.question.id;
    nq.prompt = cp.question.prompt;
    nq.points = cp.question.points;
    nq.explanation = cp.question.explanation;
    nq.imageUrl = cp.question.imageUrl;
    update(i, { ...cp, question: nq });
  };

  const addCheckpoint = () => {
    const lastT = cps.length ? Math.max(...cps.map((c) => c.timeSec)) : -20;
    const cp: VideoCheckpoint = { id: uid(), timeSec: lastT + 30, question: makeQuestion('mc') };
    onChange({ ...config, checkpoints: sortCheckpoints([...cps, cp]) });
  };

  return (
    <div>
      <Field label="YouTube-video" hint="Plak de volledige YouTube-link of alleen de video-id (bv. dQw4w9WgXcQ).">
        <input
          className="input"
          value={videoUrl}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => onChange({ ...config, videoUrl: e.target.value })}
        />
      </Field>

      {videoId ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', aspectRatio: '16 / 9', maxWidth: 480, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: '#000' }}>
            <iframe
              src={ytEmbedUrl(videoId)}
              title="Voorbeeld van de gekozen video"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      ) : videoUrl.trim() !== '' ? (
        <div className="callout warn" role="status">
          <WarningIcon aria-hidden />
          <div>Dit lijkt geen geldige YouTube-link of video-id. Controleer de invoer.</div>
        </div>
      ) : null}

      <hr className="divider" />

      <h3 style={{ marginBottom: 4 }}>Checkpoints ({cps.length})</h3>
      <p className="hint" style={{ marginBottom: 12 }}>
        Op elk tijdstip pauzeert de video en krijgt de leerling een vraag. De checkpoints worden automatisch op tijd gesorteerd.
      </p>

      {cps.length === 0 && (
        <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: '14px 0' }}>
          Nog geen checkpoints. Voeg je eerste vraag toe.
        </p>
      )}

      {cps.map((cp, i) => (
        <div className="editor-item" key={cp.id}>
          <div className="editor-item-head">
            <span className="badge badge-brand">{i + 1}</span>
            <span title="Tijdstip in de video" style={{ display: 'inline-flex' }}><Clock size={16} aria-hidden /></span>
            <TimeInput
              valueSec={cp.timeSec}
              onCommit={(sec) => commitTime(i, sec)}
              ariaLabel={`Tijdstip van checkpoint ${i + 1} (min:sec of seconden)`}
            />
            <strong style={{ fontSize: '0.9rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {vqLabel(cp.question)}
            </strong>
            <button
              className="btn btn-quiet btn-icon btn-sm"
              aria-label={`Checkpoint ${i + 1} verwijderen`}
              title="Verwijderen"
              style={{ color: 'var(--err)' }}
              onClick={() => onChange({ ...config, checkpoints: cps.filter((_, j) => j !== i) })}
            ><DeleteIcon size={16} aria-hidden /></button>
          </div>
          <div className="editor-item-body">
            <Field label="Vraagtype">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VQ_TYPES.map((t) => (
                  <button
                    key={t.type}
                    className={`btn btn-sm ${cp.question.type === t.type ? 'btn-primary' : 'btn-ghost'}`}
                    aria-pressed={cp.question.type === t.type}
                    onClick={() => switchType(i, t.type)}
                  >
                    <t.icon size={16} aria-hidden /> {t.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Vraag">
              <textarea
                className="textarea" rows={2}
                value={cp.question.prompt}
                placeholder="Typ hier je vraag…"
                onChange={(e) => updateQuestion(i, { ...cp.question, prompt: e.target.value })}
              />
            </Field>
            <QuestionFields q={cp.question} onChange={(q) => updateQuestion(i, q)} />
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                Extra: afbeelding, punten & uitleg
              </summary>
              <div style={{ paddingTop: 10 }}>
                <ImagePicker
                  value={cp.question.imageUrl}
                  onChange={(imageUrl) => updateQuestion(i, { ...cp.question, imageUrl })}
                  label="Afbeelding bij de vraag"
                />
                <Field label="Punten">
                  <input
                    className="input input-sm" type="number" min={0} step="0.5" style={{ maxWidth: 110 }}
                    value={cp.question.points}
                    onChange={(e) => updateQuestion(i, { ...cp.question, points: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Uitleg bij feedback" hint="Wordt getoond nadat de leerling heeft ingediend (als feedback aanstaat).">
                  <textarea
                    className="textarea" rows={2}
                    value={cp.question.explanation ?? ''}
                    onChange={(e) => updateQuestion(i, { ...cp.question, explanation: e.target.value })}
                  />
                </Field>
              </div>
            </details>
          </div>
        </div>
      ))}

      <button className="btn btn-primary" onClick={addCheckpoint}>+ Checkpoint toevoegen</button>
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

const YT_SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

export function VideoQuizPlayer({ widget, timeUp, onComplete }: PlayerProps<VideoQuizConfig>) {
  const videoId = useMemo(() => parseYouTubeId(widget.config.videoUrl), [widget.id]);
  const checkpoints = useMemo(
    () => sortCheckpoints((widget.config.checkpoints ?? []).filter((c) => c && c.question)),
    [widget.id]
  );

  const [apiState, setApiState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [phase, setPhase] = useState<'watching' | 'done'>('watching');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [activeCp, setActiveCp] = useState<VideoCheckpoint | null>(null);
  const [ended, setEnded] = useState(false);
  const [result, setResult] = useState<{ earned: number; max: number; hasPending: boolean } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const answersRef = useRef<Record<string, unknown>>({});
  const answeredRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<VideoCheckpoint | null>(null);
  const endedRef = useRef(false);
  const readyRef = useRef(false);
  const fallbackRef = useRef(false);
  const submittedRef = useRef(false);

  const setAnswer = (qid: string, v: unknown) => {
    answersRef.current = { ...answersRef.current, [qid]: v };
    setAnswers(answersRef.current);
  };

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const res = gradeQuiz({ questions: checkpoints.map((c) => c.question), layout: 'scroll' }, answersRef.current);
    setResult({ earned: res.earned, max: res.max, hasPending: res.hasPending });
    onComplete({
      answers: { ...answersRef.current },
      itemScores: res.itemScores,
      earned: res.earned,
      max: res.max,
      hasPending: res.hasPending,
    });
    activeRef.current = null;
    setActiveCp(null);
    setPhase('done');
    window.scrollTo({ top: 0 });
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Tijdslimiet verstreken → meteen indienen.
  useEffect(() => {
    if (timeUp && !submittedRef.current) submitRef.current();
  }, [timeUp]);

  // YouTube IFrame API laden en speler aanmaken (met 5s-fallback).
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) {
        fallbackRef.current = true;
        setApiState('fallback');
      }
    }, 5000);

    const toFallback = () => {
      if (cancelled || readyRef.current) return;
      fallbackRef.current = true;
      setApiState('fallback');
    };

    const init = () => {
      if (cancelled || fallbackRef.current || playerRef.current) return;
      const yt = window.YT;
      const wrap = wrapRef.current;
      if (!yt || !yt.Player || !wrap) return;
      const holder = document.createElement('div');
      wrap.appendChild(holder);
      playerRef.current = new yt.Player(holder, {
        host: YT_PLAYER_HOST,
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            if (fallbackRef.current) {
              try { playerRef.current?.destroy(); } catch { /* al opgeruimd */ }
              playerRef.current = null;
              return;
            }
            readyRef.current = true;
            window.clearTimeout(timeoutId);
            setApiState('ready');
          },
          onStateChange: (e) => {
            if (cancelled || submittedRef.current) return;
            const endedState = window.YT?.PlayerState.ENDED ?? 0;
            const playingState = window.YT?.PlayerState.PLAYING ?? 1;
            if (e.data === playingState && endedRef.current) {
              // leerling spoelde terug na het einde: einde-modus weer uitzetten
              endedRef.current = false;
              setEnded(false);
            }
            if (e.data === endedState) {
              endedRef.current = true;
              setEnded(true);
              const next = checkpoints.find((c) => !answeredRef.current.has(c.id));
              if (!next) {
                submitRef.current();
              } else if (!activeRef.current) {
                activeRef.current = next;
                setActiveCp(next);
              }
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      init();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); init(); };
      if (!document.querySelector(`script[src="${YT_SCRIPT_SRC}"]`)) {
        const script = document.createElement('script');
        script.src = YT_SCRIPT_SRC;
        script.async = true;
        script.onerror = toFallback;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      try { playerRef.current?.destroy(); } catch { /* iframe kan al verdwenen zijn */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Elke 500 ms de afspeelpositie controleren.
  useEffect(() => {
    if (apiState !== 'ready' || phase !== 'watching') return;
    const iv = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || submittedRef.current) return;
      const playingState = window.YT?.PlayerState.PLAYING ?? 1;
      if (activeRef.current) {
        // Zolang de vraag openstaat mag er niet verder gekeken worden.
        try { if (p.getPlayerState() === playingState) p.pauseVideo(); } catch { /* speler nog niet klaar */ }
        return;
      }
      let t = 0;
      try { t = p.getCurrentTime(); } catch { return; }
      const next = checkpoints.find((c) => !answeredRef.current.has(c.id) && t >= c.timeSec - 0.3);
      if (next) {
        try { p.pauseVideo(); } catch { /* genegeerd */ }
        activeRef.current = next;
        setActiveCp(next);
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [apiState, phase, checkpoints]);

  const handleContinue = () => {
    const cp = activeRef.current;
    if (!cp) return;
    const nextAnswered = new Set(answeredRef.current);
    nextAnswered.add(cp.id);
    answeredRef.current = nextAnswered;
    setAnsweredIds(nextAnswered);
    activeRef.current = null;
    setActiveCp(null);
    if (endedRef.current) {
      const next = checkpoints.find((c) => !nextAnswered.has(c.id));
      if (next) {
        activeRef.current = next;
        setActiveCp(next);
      } else {
        submitRef.current();
      }
    } else {
      try { playerRef.current?.playVideo(); } catch { /* genegeerd */ }
    }
  };

  // ── Weergaven ─────────────────────────────────────────────────────────────

  if (!videoId) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Er is nog geen geldige YouTube-video ingesteld voor deze video-quiz.
      </p>
    );
  }

  if (phase === 'done') {
    const res = result ?? { earned: 0, max: 0, hasPending: false };
    return (
      <div>
        <ResultHero earned={res.earned} max={res.max} showScore={widget.settings.showScore} hasPending={res.hasPending} />
        {widget.settings.showFeedback && checkpoints.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ textAlign: 'center' }}>Overzicht van je antwoorden</h2>
            {checkpoints.map((cp, i) => (
              <div key={cp.id}>
                <p style={{ margin: '16px 0 6px', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))' }}>
                  <Clock size={14} className="icon-inline" aria-hidden /> Vraag bij {fmtTime(cp.timeSec)}
                </p>
                <QuestionView
                  q={cp.question} index={i} total={checkpoints.length}
                  value={answers[cp.question.id]} onChange={() => {}} review
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (apiState === 'fallback') {
    const filledCount = checkpoints.filter((c) => {
      const v = answers[c.question.id];
      return v !== undefined && v !== null && v !== '';
    }).length;
    return (
      <div>
        <div className="callout warn" role="status">
          <WarningIcon aria-hidden />
          <div>
            De interactieve videospeler kon niet geladen worden. Je kunt de video hieronder gewoon bekijken,
            maar hij pauzeert <strong>niet automatisch</strong>. Beantwoord daarna zelf de vragen —
            bij elke vraag staat het tijdstip in de video.
          </div>
        </div>
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
            <iframe
              src={ytEmbedUrl(videoId)}
              title={`Video: ${widget.title}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
        {checkpoints.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
            Deze video-quiz bevat geen vragen. Bekijk de video en klik daarna op “Afronden”.
          </p>
        )}
        {checkpoints.map((cp, i) => (
          <div key={cp.id}>
            <p style={{ margin: '16px 0 6px', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))' }}>
              <Clock size={14} className="icon-inline" aria-hidden /> Vraag bij {fmtTime(cp.timeSec)}
            </p>
            <QuestionView
              q={cp.question} index={i} total={checkpoints.length}
              value={answers[cp.question.id]}
              onChange={(v) => setAnswer(cp.question.id, v)}
              review={false}
            />
          </div>
        ))}
        <div className="player-nav">
          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            {filledCount} van {checkpoints.length} beantwoord
          </span>
          <button className="btn btn-primary btn-lg" onClick={() => submitRef.current()}><CheckIcon size={18} aria-hidden /> Afronden</button>
        </div>
      </div>
    );
  }

  // Normale, interactieve weergave (loading of ready).
  const nextCp = checkpoints.find((c) => !answeredIds.has(c.id));
  const allAnswered = !nextCp;
  const finishesAfterThis =
    ended && activeCp !== null && checkpoints.every((c) => c.id === activeCp.id || answeredIds.has(c.id));

  return (
    <div>
      <GameStatus>
        <span className="badge badge-brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CheckIcon size={14} aria-hidden /> {answeredIds.size} / {checkpoints.length} vragen beantwoord</span>
        {activeCp ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Pause size={16} className="icon-inline" aria-hidden /> Video gepauzeerd — beantwoord de vraag hieronder</span>
        ) : apiState === 'loading' ? (
          <span>Videospeler laden…</span>
        ) : nextCp ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TryIcon size={16} className="icon-inline" aria-hidden /> Kijk verder — volgende vraag bij {fmtTime(nextCp.timeSec)}</span>
        ) : (
          <span>Alle vragen beantwoord — kijk de video uit of rond af</span>
        )}
      </GameStatus>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
        <div ref={wrapRef} style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }} />
      </div>

      {checkpoints.length === 0 && (
        <div className="callout">
          <InfoIcon aria-hidden />
          <div>Deze video-quiz bevat nog geen vragen. Bekijk de video en klik daarna op “Afronden”.</div>
        </div>
      )}

      {activeCp ? (
        <div>
          <QuestionView
            q={activeCp.question}
            index={checkpoints.indexOf(activeCp)}
            total={checkpoints.length}
            value={answers[activeCp.question.id]}
            onChange={(v) => setAnswer(activeCp.question.id, v)}
            review={false}
          />
          <div className="player-nav">
            <span />
            <button className="btn btn-primary btn-lg" onClick={handleContinue}>
              {finishesAfterThis ? <><CheckIcon size={18} aria-hidden /> Afronden</> : <>Verder kijken <TryIcon size={16} aria-hidden /></>}
            </button>
          </div>
        </div>
      ) : (
        <div className="player-nav">
          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            {allAnswered ? 'Klaar? Rond de video-quiz af.' : 'De video pauzeert vanzelf bij elke vraag.'}
          </span>
          <button
            className={`btn ${allAnswered ? 'btn-primary btn-lg' : 'btn-ghost'}`}
            onClick={() => submitRef.current()}
          >
            <CheckIcon size={18} aria-hidden /> Afronden
          </button>
        </div>
      )}
    </div>
  );
}
