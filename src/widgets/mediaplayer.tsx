import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Globe, Video } from 'lucide-react';
import type { MediaPlayerConfig } from '../lib/types';
import { Field } from '../components/ui';
import { CheckIcon, TryIcon, WarningIcon } from '../components/icons';
import { EditorProps, PlayerProps } from './shared';

// ── Hulptypen & parsing ─────────────────────────────────────────────────────

type Provider = 'youtube' | 'vimeo';

interface ParsedVideo {
  id: string;
  /** Privéhash voor niet-publieke Vimeo-video's (wordt als ?h=… meegegeven). */
  hash?: string;
}

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_RE = /^\d{5,12}$/;

const PROVIDER_LABEL: Record<Provider, string> = { youtube: 'YouTube', vimeo: 'Vimeo' };

function toUrl(raw: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

/** Haalt de video-id uit een YouTube-URL of accepteert een losse video-id. */
function parseYouTube(input: string | undefined): ParsedVideo | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (YT_ID_RE.test(raw)) return { id: raw };
  const url = toUrl(raw);
  if (!url) return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return YT_ID_RE.test(id) ? { id } : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && YT_ID_RE.test(v)) return { id: v };
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return { id: m[1] };
  }
  return null;
}

/** Haalt de video-id (en eventuele privéhash) uit een Vimeo-URL of losse id. */
function parseVimeo(input: string | undefined): ParsedVideo | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (VIMEO_ID_RE.test(raw)) return { id: raw };
  const url = toUrl(raw);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const segs = url.pathname.split('/').filter(Boolean);
  const hashParam = url.searchParams.get('h') ?? undefined;
  if (host === 'player.vimeo.com') {
    // player.vimeo.com/video/<id>
    if (segs[0] === 'video' && segs[1] && VIMEO_ID_RE.test(segs[1])) {
      return { id: segs[1], hash: hashParam };
    }
    return null;
  }
  // vimeo.com/<id>, vimeo.com/<id>/<privéhash>, vimeo.com/channels/x/<id>,
  // vimeo.com/groups/x/videos/<id>, vimeo.com/manage/videos/<id>, …
  const idx = segs.findIndex((s) => VIMEO_ID_RE.test(s));
  if (idx === -1) return null;
  const next = segs[idx + 1];
  const hash =
    hashParam ??
    (next && !VIMEO_ID_RE.test(next) && /^[A-Za-z0-9]{6,16}$/.test(next) ? next : undefined);
  return { id: segs[idx], hash };
}

function parseVideo(provider: Provider, input: string | undefined): ParsedVideo | null {
  return provider === 'youtube' ? parseYouTube(input) : parseVimeo(input);
}

// ── Tijd-hulpjes (mm:ss) ────────────────────────────────────────────────────

/** 95 → "1:35"; 3725 → "1:02:05". */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Accepteert "1:35", "1:02:05" of "95" → seconden; null bij ongeldige invoer. */
function parseTimeText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  let m = t.match(/^(\d+):([0-5]?\d):([0-5]?\d)$/);
  if (m) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

// ── Embed-URL bouwen ────────────────────────────────────────────────────────

function buildEmbedUrl(
  provider: Provider,
  video: ParsedVideo,
  startSec?: number,
  endSec?: number
): string {
  const start = startSec !== undefined && startSec > 0 ? Math.floor(startSec) : undefined;
  const end =
    endSec !== undefined && endSec > (startSec ?? 0) ? Math.floor(endSec) : undefined;
  if (provider === 'youtube') {
    const q = new URLSearchParams({ rel: '0' });
    if (start !== undefined) q.set('start', String(start));
    if (end !== undefined) q.set('end', String(end));
    return `https://www.youtube-nocookie.com/embed/${video.id}?${q.toString()}`;
  }
  const q = new URLSearchParams({ dnt: '1' });
  if (video.hash) q.set('h', video.hash);
  const frag = start !== undefined ? `#t=${start}s` : '';
  return `https://player.vimeo.com/video/${video.id}?${q.toString()}${frag}`;
}

/** Beschrijft het ingestelde fragment, bv. "Fragment van 1:35 tot 3:20." */
function fragmentText(provider: Provider, startSec?: number, endSec?: number): string | null {
  const start = startSec !== undefined && startSec > 0 ? startSec : undefined;
  const end =
    provider === 'youtube' && endSec !== undefined && endSec > (startSec ?? 0)
      ? endSec
      : undefined;
  if (start !== undefined && end !== undefined) return `Fragment van ${fmtTime(start)} tot ${fmtTime(end)}.`;
  if (start !== undefined) return `De video start bij ${fmtTime(start)}.`;
  if (end !== undefined) return `De video speelt tot ${fmtTime(end)}.`;
  return null;
}

// ── Gedeeld videokader (responsief 16:9) ────────────────────────────────────

function VideoFrame({ src, title }: { src: string; title: string }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
        <iframe
          key={src}
          src={src}
          title={title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ── Tijdveld (optioneel, mm:ss of seconden) ─────────────────────────────────

function TimeField({
  label, hint, valueSec, onCommit,
}: {
  label: string;
  hint?: string;
  valueSec: number | undefined;
  onCommit: (sec: number | undefined) => void;
}) {
  const [text, setText] = useState(() => (valueSec === undefined ? '' : fmtTime(valueSec)));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(valueSec === undefined ? '' : fmtTime(valueSec));
    setInvalid(false);
  }, [valueSec]);

  const commit = () => {
    const t = text.trim();
    if (!t) {
      setInvalid(false);
      if (valueSec !== undefined) onCommit(undefined);
      else setText('');
      return;
    }
    const sec = parseTimeText(t);
    if (sec === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (sec === valueSec) setText(fmtTime(sec));
    else onCommit(sec);
  };

  return (
    <Field label={label} hint={invalid ? undefined : hint}>
      <input
        className="input input-sm"
        style={{
          maxWidth: 120,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          ...(invalid ? { borderColor: 'var(--err)' } : {}),
        }}
        value={text}
        inputMode="numeric"
        placeholder="mm:ss"
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      />
      {invalid && (
        <span className="hint" style={{ color: 'var(--err)' }} role="alert">
          Gebruik mm:ss of een aantal seconden (bv. 1:30 of 90).
        </span>
      )}
    </Field>
  );
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

export function MediaPlayerEditor({ config, onChange }: EditorProps<MediaPlayerConfig>) {
  const provider: Provider = config.provider === 'vimeo' ? 'vimeo' : 'youtube';
  const videoUrl = config.videoUrl ?? '';
  const parsed = parseVideo(provider, videoUrl);

  const otherProvider: Provider = provider === 'youtube' ? 'vimeo' : 'youtube';
  const parsesAsOther =
    !parsed && videoUrl.trim() !== '' && parseVideo(otherProvider, videoUrl) !== null;

  const startSec = config.startSec;
  const endSec = config.endSec;
  const endBeforeStart = startSec !== undefined && endSec !== undefined && endSec <= startSec;

  const embedSrc = parsed ? buildEmbedUrl(provider, parsed, startSec, endSec) : null;
  const frag = fragmentText(provider, startSec, endSec);

  return (
    <div>
      <Field label="Videoplatform">
        <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Videoplatform kiezen">
          <button
            className={`btn btn-sm ${provider === 'youtube' ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={provider === 'youtube'}
            onClick={() => onChange({ ...config, provider: 'youtube' })}
          >
            <TryIcon size={16} aria-hidden /> YouTube
          </button>
          <button
            className={`btn btn-sm ${provider === 'vimeo' ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={provider === 'vimeo'}
            onClick={() => onChange({ ...config, provider: 'vimeo' })}
          >
            <Video size={16} aria-hidden /> Vimeo
          </button>
        </div>
      </Field>

      <Field
        label={`${PROVIDER_LABEL[provider]}-video`}
        hint={
          provider === 'youtube'
            ? 'Plak de volledige link (watch, youtu.be, shorts of embed) of alleen de video-id.'
            : 'Plak de volledige Vimeo-link (ook player.vimeo.com of een privélink) of alleen de video-id.'
        }
      >
        <input
          className="input"
          value={videoUrl}
          placeholder={
            provider === 'youtube'
              ? 'https://www.youtube.com/watch?v=…'
              : 'https://vimeo.com/…'
          }
          onChange={(e) => onChange({ ...config, videoUrl: e.target.value })}
        />
      </Field>

      {videoUrl.trim() !== '' && !parsed && (
        <div className="callout warn" role="status">
          <WarningIcon aria-hidden />
          <div>
            Dit lijkt geen geldige {PROVIDER_LABEL[provider]}-link of video-id. Controleer de invoer.
            {parsesAsOther && (
              <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Het lijkt wél een geldige {PROVIDER_LABEL[otherProvider]}-link.</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => onChange({ ...config, provider: otherProvider })}
                >
                  Wissel naar {PROVIDER_LABEL[otherProvider]}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Field label="Titel boven de video (optioneel)">
        <input
          className="input"
          value={config.title ?? ''}
          placeholder="bv. Bekijk: hoe werkt een stuwdam?"
          onChange={(e) => onChange({ ...config, title: e.target.value })}
        />
      </Field>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <TimeField
          label="Starttijd (optioneel)"
          hint="Laat leeg om vanaf het begin af te spelen."
          valueSec={startSec}
          onCommit={(sec) => onChange({ ...config, startSec: sec })}
        />
        <TimeField
          label="Eindtijd (optioneel)"
          hint={
            provider === 'vimeo'
              ? 'Vimeo ondersteunt geen eindtijd; deze wordt genegeerd.'
              : 'Laat leeg om tot het einde af te spelen.'
          }
          valueSec={endSec}
          onCommit={(sec) => onChange({ ...config, endSec: sec })}
        />
      </div>

      {endBeforeStart && (
        <div className="callout warn" role="status">
          <WarningIcon aria-hidden />
          <div>De eindtijd moet ná de starttijd liggen. Zolang dat niet zo is, wordt de eindtijd genegeerd.</div>
        </div>
      )}

      <hr className="divider" />

      <h3 style={{ marginBottom: 8 }}>Voorbeeld</h3>
      {embedSrc ? (
        <>
          <div style={{ maxWidth: 480 }}>
            <VideoFrame
              src={embedSrc}
              title={`Voorbeeld: ${config.title?.trim() || 'gekozen video'}`}
            />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Zo ziet de leerling de video.{frag ? ` ${frag}` : ''} Voor het voorbeeld en de speler is internet nodig.
          </p>
        </>
      ) : (
        <p className="hint">Plak eerst een geldige video-link, dan verschijnt hier het voorbeeld.</p>
      )}
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

export function MediaPlayerPlayer({ widget, timeUp, onComplete }: PlayerProps<MediaPlayerConfig>) {
  const cfg = widget.config;
  const provider: Provider = cfg?.provider === 'vimeo' ? 'vimeo' : 'youtube';
  const parsed = useMemo(
    () => parseVideo(provider, cfg?.videoUrl),
    [provider, cfg?.videoUrl]
  );

  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  const complete = (bekeken: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    onComplete({
      answers: { bekeken },
      itemScores: null,
      earned: 0,
      max: 0,
    });
  };
  const completeRef = useRef(complete);
  completeRef.current = complete;

  // Tijdslimiet verstreken → meteen afronden.
  useEffect(() => {
    if (timeUp) completeRef.current(false);
  }, [timeUp]);

  if (!parsed) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Er is nog geen geldige video ingesteld. Vraag je leerkracht om de oefening na te kijken.
      </p>
    );
  }

  const src = buildEmbedUrl(provider, parsed, cfg.startSec, cfg.endSec);
  const title = cfg.title?.trim();
  const frag = fragmentText(provider, cfg.startSec, cfg.endSec);

  return (
    <div>
      {title && <h2 style={{ textAlign: 'center', marginBottom: 6 }}>{title}</h2>}
      {frag && (
        <p style={{ textAlign: 'center', color: 'color-mix(in srgb, var(--player-accent, var(--brand-fill)) 60%, var(--text))', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Clock size={16} aria-hidden /> {frag}
        </p>
      )}

      <VideoFrame src={src} title={title || `Video (${PROVIDER_LABEL[provider]})`} />

      <p className="hint" style={{ textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Globe size={14} className="icon-inline" aria-hidden /> Voor deze video heb je een internetverbinding nodig. Blijft het kader zwart of leeg?
        Controleer je verbinding en herlaad de pagina.
      </p>

      <div aria-live="polite">
        {done && (
          <p style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <CheckIcon size={16} aria-hidden /> Klaar met deze video.
          </p>
        )}
      </div>

      {!done && (
        <div className="player-nav">
          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            Klaar met kijken? Rond dan hieronder af.
          </span>
          <button className="btn btn-primary btn-lg" onClick={() => complete(true)}>
            <CheckIcon size={18} aria-hidden /> Ik heb de video bekeken
          </button>
        </div>
      )}
    </div>
  );
}
