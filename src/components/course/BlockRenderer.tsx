import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock, Download, FileText, Globe, Hand, Headphones, ImageOff, Info, Lightbulb, ListChecks,
  MessageSquare, Paperclip, PenLine, Puzzle, RotateCcw, Square, SquareCheck, Target, TriangleAlert,
  Video, type LucideIcon,
} from 'lucide-react';
import type {
  AccordionBlock, AttachmentBlock, AudioBlock, CalloutBlock, ChecklistBlock,
  ColumnsBlock, CourseBlock, EmbedBlock, HeadingBlock, ImageBlock, PdfBlock,
  QuoteBlock, TableBlock, TermsBlock, VideoBlock, WidgetBlock,
} from '../../lib/courseTypes';
import { renderMarkdown } from '../../lib/markdown';
import { bumpAttemptCount, getAttemptCount, getSubmissions, getWidget, saveSubmission } from '../../lib/storage';
import { getStudentContext } from '../../lib/studentContext';
import { getTypeDef, type WidgetTypeDef } from '../../widgets/registry';
import type { PlayerResult } from '../../widgets/shared';
import type { Submission, Widget } from '../../lib/types';
import { readableAccent } from '../../lib/color';
import { pct, uid } from '../../lib/utils';
import { deletePdf, getPdf, savePdf } from '../../lib/pdfStore';
import { isMediaRef, resolveMediaRef } from '../../lib/mediaStore';
import { isBestandUrl } from '../../lib/veiligeUrl';
import { TypeTile } from '../TypeTile';
import { CheckIcon } from '../icons';
import '../../styles/leerling.css';

// De pdf-viewer (en via hem pdf.js) hoort niet bij het leesnetwerk van een
// cursus zonder pdf-blok: lui laden i.p.v. statisch meesturen.
const PdfViewer = React.lazy(() =>
  import('../pdf/PdfViewer').then((m) => ({ default: m.PdfViewer }))
);

// ── Gedeelde weergave van cursusblokken ─────────────────────────────────────
//
// Eén component die elk bloktype rendert, gebruikt door de leerling-viewer,
// de printweergave en previews in de editor. Met interactive=false wordt
// alles statisch (geen iframes, geen afspeelbare widgets).

export interface BlockRendererProps {
  block: CourseBlock;
  /** false = statische weergave (bv. print): geen iframes of spelers. */
  interactive?: boolean;
  studentName?: string;
  /** Afgevinkte checklist-item-ids van dít blok. */
  checkedIds?: string[];
  onToggleCheck?: (itemId: string) => void;
  /** Accentkleur van de cursus (voor kaders en checkboxen). */
  accent?: string;
  /**
   * Voorbeeld voor de leerkracht ("Als leerling"): de oefeningen draaien in
   * voorbeeldmodus en er wordt niets bewaard (geen inzendingen, geen pogingen).
   */
  preview?: boolean;
}

export function BlockRenderer(props: BlockRendererProps): JSX.Element {
  const { block } = props;
  const interactive = props.interactive !== false;
  return (
    <div className="course-block">
      {renderBlock(block, interactive, props)}
    </div>
  );
}

function renderBlock(block: CourseBlock, interactive: boolean, props: BlockRendererProps): JSX.Element {
  switch (block.type) {
    case 'heading': return <Heading block={block} />;
    case 'text': return <Markdown md={block.markdown} />;
    case 'image': return <ImageView block={block} />;
    case 'video': return <VideoView block={block} interactive={interactive} />;
    case 'audio': return <AudioView block={block} interactive={interactive} />;
    case 'pdf': return <PdfBlockView block={block} interactive={interactive} />;
    case 'embed': return <EmbedView block={block} interactive={interactive} />;
    case 'callout': return <CalloutView block={block} />;
    case 'quote': return <QuoteView block={block} />;
    case 'divider': return <hr style={{ border: 'none', borderTop: '1px solid var(--line-strong)', margin: '10px 0' }} />;
    case 'attachment': return <AttachmentView block={block} interactive={interactive} />;
    case 'accordion': return <AccordionView block={block} interactive={interactive} />;
    case 'columns': return <ColumnsView block={block} />;
    case 'table': return <TableView block={block} />;
    case 'terms': return <TermsView block={block} />;
    case 'checklist': return <ChecklistView block={block} interactive={interactive} props={props} />;
    // key op het oefening-id: een ander gekozen oefening begint met een schone lei
    // (deadline, pogingen en inzending van de vorige horen er niet meer bij).
    case 'widget': return <WidgetBlockView key={block.widgetId} block={block} interactive={interactive} studentName={props.studentName} accent={props.accent} preview={props.preview} />;
  }
}

// ── Eenvoudige blokken ──────────────────────────────────────────────────────

function Heading({ block }: { block: HeadingBlock }) {
  return block.level === 3
    ? <h3 style={{ margin: '10px 0 2px' }}>{block.text}</h3>
    : <h2 style={{ margin: '14px 0 4px' }}>{block.text}</h2>;
}

function Markdown({ md }: { md: string }) {
  // renderMarkdown parst de volledige tekst; zonder memo gebeurt dat bij élke
  // render van de cursuspagina opnieuw — dus ook bij elke toetsaanslag in het
  // zoekveld of in een notitie.
  const html = useMemo(() => renderMarkdown(md), [md]);
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

const IMAGE_WIDTHS: Record<string, string> = { small: '380px', normal: '680px', wide: '100%' };

function ImageView({ block }: { block: ImageBlock }) {
  if (!block.url) {
    return (
      <p className="hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ImageOff size={16} aria-hidden /> (geen afbeelding gekozen)
      </p>
    );
  }
  return (
    <figure style={{ maxWidth: IMAGE_WIDTHS[block.size ?? 'normal'], margin: '0 auto' }}>
      <img
        src={block.url}
        alt={block.caption ?? ''}
        loading="lazy"
        style={{ maxWidth: '100%', display: 'block', borderRadius: 'var(--radius-m)', border: '1px solid var(--line)' }}
      />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/** Zet een YouTube/Vimeo-URL om naar een privacy-nette embed-URL. */
export function videoEmbedUrl(url: string): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/i);
  // dnt=1: Vimeo volgt de kijker dan niet (zoals in de videospeler-widget).
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`;
  return null;
}

function VideoView({ block, interactive }: { block: VideoBlock; interactive: boolean }) {
  const src = videoEmbedUrl(block.url);
  if (!src) {
    return (
      <div className="callout warn" style={{ marginBottom: 0 }}>
        <TriangleAlert size={18} aria-hidden />
        <div>Deze video-URL wordt niet herkend. Alleen YouTube- en Vimeo-links werken.</div>
      </div>
    );
  }
  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Video size={22} aria-hidden style={{ color: 'var(--text-soft)' }} />
        <div>
          <strong>Video{block.caption ? `: ${block.caption}` : ''}</strong>
          <div className="hint" style={{ wordBreak: 'break-all' }}>{block.url}</div>
        </div>
      </div>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      <div className="video-frame">
        <iframe
          src={src}
          title={block.caption || 'Ingesloten video'}
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

function AudioView({ block, interactive }: { block: AudioBlock; interactive: boolean }) {
  if (!block.url) {
    return (
      <p className="hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Headphones size={16} aria-hidden /> (geen audiofragment gekozen)
      </p>
    );
  }
  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Headphones size={22} aria-hidden style={{ color: 'var(--text-soft)' }} />
        <strong>Audiofragment{block.caption ? `: ${block.caption}` : ''}</strong>
      </div>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={block.url} style={{ width: '100%' }} aria-label={block.caption || 'Audiofragment'} />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

// ── Pdf-blok: geüploade pdf (IndexedDB) of externe URL, inline leesbaar ─────

type PdfState =
  | { kind: 'laden' }
  | { kind: 'blob'; blob: Blob; name: string }
  | { kind: 'weg' };

function PdfBlockView({ block, interactive }: { block: PdfBlock; interactive: boolean }) {
  const [state, setState] = useState<PdfState>({ kind: 'laden' });
  useEffect(() => {
    if (!block.pdfId) return;
    let alive = true;
    setState({ kind: 'laden' });
    getPdf(block.pdfId).then((rec) => {
      if (!alive) return;
      setState(rec ? { kind: 'blob', blob: rec.blob, name: rec.name } : { kind: 'weg' });
    });
    return () => { alive = false; };
  }, [block.pdfId]);

  if (!block.pdfId && !block.url) {
    return (
      <p className="hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText size={16} aria-hidden /> (geen pdf gekozen)
      </p>
    );
  }

  const displayName = block.name || (state.kind === 'blob' ? state.name : '') || 'Pdf-document';

  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <FileText size={22} aria-hidden style={{ color: 'var(--text-soft)' }} />
        <div style={{ minWidth: 0 }}>
          <strong>Pdf: {displayName}</strong>
          {block.caption && <div className="hint">{block.caption}</div>}
          {block.url && <div className="hint" style={{ wordBreak: 'break-all' }}>{block.url}</div>}
        </div>
      </div>
    );
  }

  // Bron bepalen: de geüploade blob eerst; anders de URL.
  let src: Blob | string | null = null;
  if (block.pdfId) {
    if (state.kind === 'laden') {
      return (
        <div className="hint" role="status" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={16} aria-hidden /> Pdf laden…
        </div>
      );
    }
    if (state.kind === 'blob') src = state.blob;
    else if (block.url) src = block.url; // upload ontbreekt, maar er is een URL-reserve
  } else if (block.url) {
    src = block.url;
  }

  if (!src) {
    return <MissingPdfCard block={block} onRestored={(blob, name) => setState({ kind: 'blob', blob, name })} />;
  }

  return (
    <figure style={{ margin: 0 }}>
      <React.Suspense fallback={(
        <div className="hint" role="status" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={16} aria-hidden /> Pdf-lezer laden…
        </div>
      )}>
        <PdfViewer src={src} title={block.name || block.caption || 'Pdf-document'} height={block.height ?? 560} />
      </React.Suspense>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/**
 * De pdf werd op een ander toestel geüpload en staat hier niet: nette kaart
 * met een bestandskiezer die het bestand onder HETZELFDE pdfId terugzet
 * (savePdf overschrijft op id), zodat het blok daarna gewoon rendert.
 */
function MissingPdfCard({ block, onRestored }: { block: PdfBlock; onRestored: (blob: Blob, name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !block.pdfId) return;
    setBusy(true);
    setErr(null);
    // pickAndStorePdf valideert (type/grootte) en bewaart onder een vers id …
    const { pickAndStorePdf } = await import('../pdf/PdfViewer');
    const res = await pickAndStorePdf(f);
    if ('error' in res) {
      setBusy(false);
      setErr(res.error);
      return;
    }
    // … daarna onder het pdfId van het blok zetten, zodat ook kopieën van dit
    // blok (gedeeld id) meteen weer werken; het verse id ruimen we op.
    try {
      await savePdf(block.pdfId, res.name, f);
    } catch {
      setBusy(false);
      setErr('Bewaren mislukt — is de opslag van dit toestel vol?');
      return;
    }
    void deletePdf(res.pdfId);
    setBusy(false);
    onRestored(f, res.name);
  };

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <FileText size={24} aria-hidden style={{ color: 'var(--text-soft)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong>{block.name || 'Pdf-document'}</strong>
          <div className="hint">
            Deze pdf staat niet op dit toestel. Vraag het bestand aan je leerkracht en kies het
            hieronder — daarna kan je hem gewoon lezen.
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Bezig…' : (<><FileText size={16} aria-hidden /> Pdf-bestand kiezen…</>)}
        </button>
      </div>
      {err && (
        <p className="hint" style={{ color: 'var(--err)', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <TriangleAlert size={15} aria-hidden /> {err}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={onFile}
        aria-label={`Pdf-bestand kiezen voor ${block.name || 'dit blok'}`}
      />
      {block.caption && <p style={{ margin: '8px 0 0', fontSize: '0.92rem', color: 'var(--text-soft)' }}>{block.caption}</p>}
    </div>
  );
}

function EmbedView({ block, interactive }: { block: EmbedBlock; interactive: boolean }) {
  const ok = /^https:\/\//i.test((block.url ?? '').trim());
  if (!ok) {
    return (
      <div className="callout warn" style={{ marginBottom: 0 }}>
        <TriangleAlert size={18} aria-hidden />
        <div>Dit kader kan niet getoond worden: alleen veilige <code>https://</code>-adressen zijn toegelaten.</div>
      </div>
    );
  }
  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Globe size={22} aria-hidden style={{ color: 'var(--text-soft)' }} />
        <div>
          <strong>{block.title || 'Extern kader'}</strong>
          <div className="hint" style={{ wordBreak: 'break-all' }}>{block.url}</div>
        </div>
      </div>
    );
  }
  return (
    <iframe
      src={block.url.trim()}
      title={block.title || 'Ingesloten inhoud'}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      loading="lazy"
      style={{
        width: '100%', height: block.height, border: '1px solid var(--line)',
        borderRadius: 'var(--radius-m)', background: 'var(--bg-raised)',
      }}
    />
  );
}

const CALLOUT_STYLE: Record<CalloutBlock['kind'], { Icon: LucideIcon; bg: string; border: string; label: string }> = {
  info: { Icon: Info, bg: 'var(--brand-soft)', border: 'var(--brand)', label: 'Info' },
  tip: { Icon: Lightbulb, bg: 'var(--ok-soft)', border: 'var(--ok)', label: 'Tip' },
  warn: { Icon: TriangleAlert, bg: 'var(--warn-soft)', border: 'var(--warn)', label: 'Let op' },
  goal: { Icon: Target, bg: 'var(--brand-soft)', border: 'var(--brand)', label: 'Leerdoel' },
};

function CalloutView({ block }: { block: CalloutBlock }) {
  const st = CALLOUT_STYLE[block.kind] ?? CALLOUT_STYLE.info;
  const html = useMemo(() => renderMarkdown(block.text), [block.text]);
  return (
    <div
      role="note"
      style={{
        display: 'flex', gap: 11, padding: '13px 16px', borderRadius: 'var(--radius-m)',
        background: st.bg, border: `1px solid color-mix(in srgb, ${st.border} 35%, transparent)`,
      }}
    >
      <st.Icon size={19} aria-hidden style={{ flex: 'none', marginTop: 2, color: st.border }} />
      <div style={{ minWidth: 0 }}>
        <strong>{block.title || st.label}</strong>
        <div className="md-body" style={{ fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

function QuoteView({ block }: { block: QuoteBlock }) {
  return (
    <blockquote
      style={{
        margin: 0, padding: '12px 18px', borderLeft: '4px solid var(--brand)',
        background: 'var(--bg-sunken)', borderRadius: '0 var(--radius-s) var(--radius-s) 0',
        fontStyle: 'italic', fontSize: '1.05rem',
      }}
    >
      <p style={{ margin: 0 }}>“{block.text}”</p>
      {block.source && (
        <footer style={{ marginTop: 6, fontStyle: 'normal', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          — {block.source}
        </footer>
      )}
    </blockquote>
  );
}

/**
 * Downloadlink van een bijlage: alleen een bestand dat de app zelf meegeeft
 * (data:, blob:, of een eigen mediaverwijzing die naar zo'n URL wijst). Een
 * javascript:-URL uit gedeelde inhoud zou bij een klik in de app draaien;
 * dan tonen we de kaart zonder link.
 */
function bijlageLink(dataUrl: string | undefined): string | null {
  if (!dataUrl) return null;
  const url = isMediaRef(dataUrl) ? resolveMediaRef(dataUrl) : dataUrl;
  return isBestandUrl(url) ? url : null;
}

function AttachmentView({ block, interactive }: { block: AttachmentBlock; interactive: boolean }) {
  const href = interactive ? bijlageLink(block.dataUrl) : null;
  const inner = (
    <>
      <Paperclip size={20} aria-hidden style={{ flex: 'none', color: 'var(--text-soft)' }} />
      <span style={{ fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.name || 'bestand'}</span>
      {href && (
        <span className="badge badge-brand" style={{ marginLeft: 'auto', flex: 'none' }}>
          <Download size={13} aria-hidden /> downloaden
        </span>
      )}
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px',
    textDecoration: 'none', color: 'var(--text)',
  };
  if (!href) {
    return <div className="card" style={style}>{inner}</div>;
  }
  return (
    <a className="card" href={href} download={block.name || 'bestand'} style={style} aria-label={`Bestand downloaden: ${block.name || 'bestand'}`}>
      {inner}
    </a>
  );
}

function AccordionView({ block, interactive }: { block: AccordionBlock; interactive: boolean }) {
  const items = useMemo(
    () => block.items.map((it) => ({ id: it.id, title: it.title, html: renderMarkdown(it.text) })),
    [block.items]
  );
  return (
    <div>
      {items.map((it) => (
        <details key={it.id} open={!interactive || undefined}>
          <summary>{it.title}</summary>
          <div className="md-body" style={{ fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: it.html }} />
        </details>
      ))}
    </div>
  );
}

function ColumnsView({ block }: { block: ColumnsBlock }) {
  const left = useMemo(() => renderMarkdown(block.left), [block.left]);
  const right = useMemo(() => renderMarkdown(block.right), [block.right]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18 }}>
      <div className="md-body" dangerouslySetInnerHTML={{ __html: left }} />
      <div className="md-body" dangerouslySetInnerHTML={{ __html: right }} />
    </div>
  );
}

function TableView({ block }: { block: TableBlock }) {
  const [head, ...rest] = block.rows;
  const body = block.header ? rest : block.rows;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        {block.header && head && (
          <thead>
            <tr>{head.map((cell, i) => <th key={i} scope="col">{cell}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TermsView({ block }: { block: TermsBlock }) {
  return (
    <dl style={{ display: 'grid', gap: 10, margin: 0 }}>
      {block.items.map((it) => (
        <div key={it.id} className="card" style={{ padding: '10px 14px' }}>
          <dt style={{ fontWeight: 750 }}>{it.term}</dt>
          <dd style={{ margin: '2px 0 0', color: 'var(--text-soft)' }}>{it.uitleg}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChecklistView({ block, interactive, props }: { block: ChecklistBlock; interactive: boolean; props: BlockRendererProps }) {
  const checked = props.checkedIds ?? [];
  const done = block.items.filter((it) => checked.includes(it.id)).length;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <ListChecks size={18} aria-hidden style={{ color: 'var(--text-soft)' }} />
        <strong>{block.title || 'Checklist'}</strong>
        <span
          className={`badge ${done === block.items.length && block.items.length > 0 ? 'badge-ok' : 'badge-brand'}`}
          aria-label={`${done} van ${block.items.length} afgevinkt`}
        >
          {done}/{block.items.length}
        </span>
      </div>
      {interactive ? (
        block.items.map((it) => (
          <label key={it.id} className="checkbox-row">
            <input
              type="checkbox"
              checked={checked.includes(it.id)}
              onChange={() => props.onToggleCheck?.(it.id)}
              style={props.accent ? { accentColor: readableAccent(props.accent) } : undefined}
            />
            <span style={checked.includes(it.id) ? { color: 'var(--text-soft)' } : undefined}>{it.text}</span>
          </label>
        ))
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {block.items.map((it) => (
            <li key={it.id} style={{ margin: '5px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              {checked.includes(it.id)
                ? <SquareCheck size={16} aria-hidden style={{ color: 'var(--ok)' }} />
                : <Square size={16} aria-hidden style={{ color: 'var(--text-faint)' }} />}
              {it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Ingebedde widget (het kroonjuweel) ──────────────────────────────────────

const isExpired = (w: Widget | undefined) =>
  !!w?.settings.expiresAt && Date.now() > new Date(w.settings.expiresAt).getTime();

function WidgetBlockView({
  block, interactive, studentName, accent, preview = false,
}: { block: WidgetBlock; interactive: boolean; studentName?: string; accent?: string; preview?: boolean }) {
  // Memo: anders wordt de hele widgetstore herparset bij elke toetsaanslag elders op de pagina.
  const widget = useMemo(() => (block.widgetId ? getWidget(block.widgetId) : undefined), [block.widgetId]);
  let def: WidgetTypeDef | undefined;
  try {
    def = widget ? getTypeDef(widget.type) : undefined;
  } catch {
    def = undefined;
  }

  const name = (studentName ?? '').trim() || 'Anoniem';
  const [attempt, setAttempt] = useState(0);
  const [sub, setSub] = useState<Submission | null>(null);
  const doneRef = useRef(false);
  const startRef = useRef(Date.now());
  const bumpedRef = useRef(false);

  // Dezelfde grenzen als de gewone speler: deadline en maximum aantal pogingen.
  // De deadline houdt alleen het starten tegen. Daarom state, geen berekening
  // per render (de cursuslezer hertekent bij elke toetsaanslag): wie al bezig is
  // of net indiende, verliest zijn scherm niet wanneer de deadline intussen
  // verstrijkt. Alleen een nieuwe poging (retry) kan dit nog omzetten.
  const [expired, setExpired] = useState(() => isExpired(widget));
  const maxAttempts = widget?.settings.maxAttempts ?? 0;
  // 'sub' en 'attempt' zitten erin zodat de teller ververst na indienen
  // (onComplete bumpt en zet sub) en na "opnieuw proberen"
  const usedAttempts = useMemo(
    () => (widget && !preview ? getAttemptCount(widget.id, name) : 0),
    [widget?.id, name, attempt, sub, preview] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const attemptsLeft = maxAttempts > 0 ? Math.max(0, maxAttempts - usedAttempts) : Infinity;

  // Was er (op dit toestel) al eerder een inzending van deze leerling?
  const alreadySubmitted = useMemo(() => {
    if (!widget || preview) return false;
    return getSubmissions(widget.id).some(
      (s) => s.studentName.trim().toLowerCase() === name.toLowerCase()
    );
    // 'attempt' zit erin zodat de badge na "opnieuw proberen" mee ververst
  }, [widget?.id, name, attempt, sub, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stabiele identiteit (net als in PlayerPage): zonder useCallback krijgt de
  // gememoiseerde speler hieronder bij elke render een nieuwe prop.
  // Klasidentiteit (naam gekozen uit de klaslijst) hoort ook op inzendingen
  // die ín een cursus gebeuren, anders matcht het klasoverzicht alleen op naam.
  const studentCtx = useMemo(() => (preview ? null : getStudentContext()), [preview]);
  const onComplete = useCallback((result: PlayerResult) => {
    // exact hetzelfde patroon als PlayerPage: guard tegen dubbel opslaan en
    // tegen lege "afrondingen" zonder inhoud
    if (doneRef.current || !widget || !def?.hasSubmissions) return;
    if (result.max === 0 && Object.keys(result.answers).length === 0) return;
    doneRef.current = true;
    // poging meetellen, zodat maxAttempts ook via de cursus geldt
    // (niet in het voorbeeld voor de leerkracht: daar wordt niets bewaard)
    if (!preview && !bumpedRef.current) {
      bumpedRef.current = true;
      bumpAttemptCount(widget.id, name);
    }
    const s: Submission = {
      id: uid(),
      widgetId: widget.id,
      widgetCode: widget.code,
      studentName: name,
      startedAt: startRef.current,
      submittedAt: Date.now(),
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      answers: result.answers,
      itemScores: result.itemScores,
      totalEarned: result.earned,
      totalMax: result.max,
      status: result.hasPending ? 'submitted' : 'graded',
      ...(studentCtx ? { classId: studentCtx.classId } : {}),
      ...(studentCtx?.studentId ? { studentId: studentCtx.studentId } : {}),
    };
    if (!preview) saveSubmission(s);
    setSub(s);
  }, [widget, def, name, studentCtx, preview]);

  // De ingebedde oefening is verreweg het duurste onderdeel van een cursusblok.
  // De cursuslezer hertekent bij elke toetsaanslag in het zoekveld of in een
  // notitie; door het element vast te houden blijft de oefening dan onaangeroerd.
  const Speler = def?.Player;
  const playerNode = useMemo(
    () => (Speler && widget
      ? <Speler key={attempt} widget={widget} studentName={name} preview={preview} onComplete={onComplete} />
      : null),
    [Speler, widget, name, attempt, onComplete, preview]
  );

  if (!widget || !def) {
    return (
      <div className="callout warn" style={{ marginBottom: 0 }}>
        <Puzzle size={18} aria-hidden />
        <div>
          <strong>Oefening niet gevonden.</strong><br />
          De oefening hoort bij dit toestel/deze link te reizen — vraag je leerkracht om een nieuwe link.
        </div>
      </div>
    );
  }

  if (!interactive) {
    return (
      <div className="card" style={{ padding: '14px 18px', borderLeft: `4px solid ${accent ?? def.color}` }}>
        <strong>Oefening: {widget.title}</strong>
        <div className="hint">{def.name} — wordt digitaal gemaakt in de cursus.</div>
        {block.note && <p style={{ margin: '6px 0 0', fontSize: '0.92rem' }}>{block.note}</p>}
      </div>
    );
  }

  const retry = () => {
    if (expired || attemptsLeft <= 0) return;
    // De deadline kan verstreken zijn terwijl de leerling het resultaat las:
    // een nieuwe poging kan dan niet meer, het resultaat blijft staan.
    if (isExpired(widget)) {
      setExpired(true);
      return;
    }
    doneRef.current = false;
    bumpedRef.current = false;
    startRef.current = Date.now();
    setSub(null);
    setAttempt((a) => a + 1);
  };

  const hasPending = sub?.itemScores
    ? Object.values(sub.itemScores).some((s) => s.mode === 'pending')
    : false;
  const showScore = widget.settings.showScore && !!sub && sub.totalMax > 0;

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${accent ?? def.color}`,
        // Een te lichte accentkleur wordt donkerder, zodat tekst en knoppen leesbaar blijven (W15d).
        ['--player-accent' as string]: readableAccent(widget.settings.accentColor),
      } as React.CSSProperties}
    >
      <div
        style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'var(--bg-sunken)',
          borderRadius: 'var(--radius-m) var(--radius-m) 0 0',
        }}
      >
        <TypeTile type={def} size="md" />
        <div style={{ flex: 1, minWidth: 160 }}>
          <strong>Oefening: {widget.title}</strong>
          <div className="hint" style={{ marginTop: 0 }}>{def.name} — {def.tagline}</div>
        </div>
        {alreadySubmitted && !sub && (
          <span className="badge badge-ok" title="Er staat al een inzending met jouw naam op dit toestel">
            <CheckIcon size={13} aria-hidden /> eerder ingediend
          </span>
        )}
      </div>
      {block.note && (
        <p style={{ margin: 0, padding: '10px 18px 0', color: 'var(--text-soft)', fontSize: '0.92rem', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <MessageSquare size={15} aria-hidden style={{ flex: 'none', marginTop: 2 }} /> {block.note}
        </p>
      )}
      <div style={{ padding: '16px 18px' }}>
        {expired && !sub ? (
          <div className="callout warn" style={{ marginBottom: 0 }}>
            <Clock size={18} aria-hidden />
            <div>Deze oefening is afgesloten — de deadline is verstreken.</div>
          </div>
        ) : !sub && attemptsLeft <= 0 ? (
          <div className="callout" style={{ marginBottom: 0 }}>
            <Hand size={18} aria-hidden />
            <div>
              Je gebruikte al je {maxAttempts} poging{maxAttempts === 1 ? '' : 'en'} voor deze oefening.
              {alreadySubmitted && ' Je eerdere inzending is bewaard.'}
            </div>
          </div>
        ) : (
          // Suspense: de spelers uit de registry worden lui geladen (React.lazy)
          <React.Suspense fallback={<div className="hint" role="status">Oefening laden…</div>}>
            {playerNode}
          </React.Suspense>
        )}
        {sub && (
          <div
            role="status"
            style={{
              marginTop: 14, padding: '12px 16px', borderRadius: 'var(--radius-m)',
              background: 'var(--ok-soft)', border: '1px solid color-mix(in srgb, var(--ok) 35%, transparent)',
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>
                <CheckIcon size={15} aria-hidden />{' '}
                {preview ? 'Klaar — in dit voorbeeld wordt niets bewaard.' : 'Ingediend — goed gedaan!'}
              </strong>
              {showScore && (
                <div style={{ fontSize: '0.92rem' }}>
                  Score: {sub.totalEarned}/{sub.totalMax} ({pct(sub.totalEarned, sub.totalMax)}%)
                </div>
              )}
              {hasPending && (
                <div style={{ fontSize: '0.88rem', color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <PenLine size={14} aria-hidden /> Open vragen worden nog nagekeken. Je score kan dus nog stijgen.
                </div>
              )}
            </div>
            {!expired && attemptsLeft > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={retry}>
                <RotateCcw size={14} aria-hidden /> Opnieuw proberen{maxAttempts > 0 && ` (nog ${attemptsLeft})`}
              </button>
            )}
            {expired && (
              <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
                <Clock size={14} aria-hidden /> De deadline is verstreken: opnieuw proberen kan niet meer.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
