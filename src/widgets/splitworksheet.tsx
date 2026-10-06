import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, FileText, FileType, FolderOpen,
  Image as ImageIcon, type LucideIcon, Pin, Video, Wrench,
} from 'lucide-react';
import type { Question, QuestionType, SourcePane, SplitWorksheetConfig } from '../lib/types';
import { gradeQuiz } from '../lib/grading';
import { shuffled, uid } from '../lib/utils';
import { webUrl } from '../lib/veiligeUrl';
import { CheckRow, Field, ImagePicker } from '../components/ui';
import { CheckIcon, CloseIcon, InfoIcon, WarningIcon } from '../components/icons';
import { DEFAULT_PALETTE, PdfViewer, pickAndStorePdf } from '../components/pdf/PdfViewer';
import type { HighlightColor, PdfHighlight } from '../components/pdf/PdfViewer';
import { deletePdf, formatBytes, getPdf, savePdf } from '../lib/pdfStore';
import { pdfReferenceCount } from '../lib/courses';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';
import { makeQuestion, QUESTION_TYPES, questionLabel, QuestionView, removeOptionAt } from './quiz';

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/** Vraagtypes die deze compacte editor zelf kan bewerken. */
const EDITABLE_TYPES: ReadonlySet<QuestionType> = new Set(['mc', 'tf', 'short', 'long']);

const SOURCE_KINDS: { kind: SourcePane['kind']; icon: LucideIcon; label: string }[] = [
  { kind: 'text', icon: FileText, label: 'Tekst' },
  { kind: 'image', icon: ImageIcon, label: 'Afbeelding' },
  { kind: 'video', icon: Video, label: 'Video' },
  { kind: 'pdf', icon: FileType, label: 'Pdf' },
];

function sourceKindLabel(kind: SourcePane['kind']): string {
  return kind === 'text' ? 'Leestekst'
    : kind === 'image' ? 'Afbeelding'
    : kind === 'video' ? 'Video'
    : 'Pdf-document';
}

/** YouTube-id uit een URL of los id halen. Geeft null als er niets herkend wordt. */
function extractYouTubeId(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Is het bronpaneel bruikbaar ingevuld? */
function sourceIsFilled(source: SourcePane | undefined): source is SourcePane {
  if (!source) return false;
  if (source.kind === 'text') return !!source.text?.trim();
  if (source.kind === 'image') return !!source.imageUrl;
  if (source.kind === 'pdf') return !!(source.pdfId || source.pdfUrl?.trim());
  return !!source.videoUrl?.trim();
}

/** Markeerlegende: rijtje kleurstaal + label. Toont niets zonder ingevulde labels. */
function HighlightLegend({ palette }: { palette: { color: string; label: string }[] | undefined }) {
  const entries = (palette ?? []).filter((p) => p.label.trim());
  if (entries.length === 0) return null;
  return (
    <div
      aria-label="Markeerlegende"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}
    >
      {entries.map((p) => (
        <span key={p.color} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 13, height: 13, borderRadius: 4, background: p.color, border: '1px solid var(--line)', flex: 'none' }} />
          {p.label}
        </span>
      ))}
    </div>
  );
}

/** Heeft de leerling deze vraag beantwoord? (zelfde logica als de quiz) */
function isAnswered(q: Question, v: unknown): boolean {
  if (q.type === 'info') return true;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return q.type === 'order' ? true : v.some((x) => x !== null && x !== undefined && x !== '');
  return true;
}

/** Volgt of het venster smaller is dan maxWidth px (voor de gestapelde layout). */
function useIsNarrow(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return narrow;
}

// ── EDITOR ──────────────────────────────────────────────────────────────────

function CompactQuestionEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  switch (q.type) {
    case 'mc':
      return (
        <div>
          {q.options.map((opt, i) => (
            <div className="option-row" key={i}>
              <input
                type="radio"
                checked={q.correctIndex === i}
                aria-label={`Antwoordoptie ${i + 1} is juist`}
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
          <p className="hint" style={{ marginTop: 6 }}>Vink het juiste antwoord aan.</p>
        </div>
      );
    case 'tf':
      return (
        <Field label="Juiste antwoord">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${q.answer ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...q, answer: true })}>Juist</button>
            <button className={`btn btn-sm ${!q.answer ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange({ ...q, answer: false })}>Onjuist</button>
          </div>
        </Field>
      );
    case 'short':
      return (
        <>
          <Field label="Juiste antwoorden" hint="Elk aanvaard antwoord op een eigen regel.">
            <textarea
              className="textarea"
              rows={2}
              value={q.accepted.join('\n')}
              onChange={(e) => onChange({ ...q, accepted: e.target.value.split('\n') })}
            />
          </Field>
          <CheckRow
            checked={q.caseSensitive}
            onChange={(caseSensitive) => onChange({ ...q, caseSensitive })}
            label="Hoofdlettergevoelig"
          />
        </>
      );
    case 'long':
      return (
        <Field label="Modelantwoord (alleen zichtbaar voor jou)" hint="Open vragen beoordeel je achteraf zelf bij de resultaten.">
          <textarea className="textarea" rows={3} value={q.modelAnswer ?? ''} onChange={(e) => onChange({ ...q, modelAnswer: e.target.value })} />
        </Field>
      );
    default: {
      const meta = QUESTION_TYPES.find((t) => t.type === q.type);
      return (
        <div className="callout warn" style={{ marginBottom: 0 }}>
          <Wrench aria-hidden />
          <div>
            Het vraagtype <strong>{meta?.name ?? q.type}</strong> kun je in het gesplitste werkblad niet bewerken.
            Voor de leerling werkt de vraag wél gewoon; bewerken doe je via een quiz-widget.
          </div>
        </div>
      );
    }
  }
}

/** Editorvelden voor een pdf-bron: upload of URL, markeerlegende en voorvertoning. */
function PdfSourceEditor({ source, setSource }: { source: SourcePane; setSource: (s: SourcePane) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // Blob van de geüploade pdf op dit toestel (voor grootte + voorvertoning).
  const [stored, setStored] = useState<{ blob: Blob; name: string } | 'loading' | 'missing' | null>(
    source.pdfId ? 'loading' : null
  );

  useEffect(() => {
    let alive = true;
    if (!source.pdfId) { setStored(null); return; }
    setStored('loading');
    getPdf(source.pdfId).then((rec) => {
      if (alive) setStored(rec ? { blob: rec.blob, name: rec.name } : 'missing');
    });
    return () => { alive = false; };
  }, [source.pdfId]);

  const pick = async (file: File) => {
    setBusy(true);
    setUploadError('');
    const res = await pickAndStorePdf(file);
    setBusy(false);
    if ('error' in res) { setUploadError(res.error); return; }
    const oldId = source.pdfId;
    // De oude upload alleen wissen als deze bron de laatste verwijzing is:
    // dupliceren (widget, blok, cursus) deelt bewust hetzelfde pdfId.
    if (oldId && oldId !== res.pdfId && pdfReferenceCount(oldId) <= 1) void deletePdf(oldId);
    setSource({ ...source, pdfId: res.pdfId, pdfName: res.name });
  };

  const removeUpload = () => {
    // Zelfde regel als bij "Vervangen": anders alleen de verwijzing loskoppelen.
    if (source.pdfId && pdfReferenceCount(source.pdfId) <= 1) void deletePdf(source.pdfId);
    setSource({ ...source, pdfId: undefined, pdfName: undefined });
  };

  const hasStored = typeof stored === 'object' && stored !== null;
  const palette = source.highlightPalette;
  // Voorvertoning: geüploade pdf gaat voor; anders de URL.
  const previewSrc: Blob | string | null = hasStored ? stored.blob : source.pdfUrl?.trim() || null;

  return (
    <>
      <Field label="Pdf-bestand (upload)">
        {source.pdfId ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              <FileType size={16} className="icon-inline" aria-hidden /> <strong>{source.pdfName ?? (hasStored ? stored.name : 'pdf')}</strong>
              {hasStored && <span className="hint"> · {formatBytes(stored.blob.size)}</span>}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>Vervangen</button>
            <button className="btn btn-sm btn-ghost" onClick={removeUpload}>Verwijderen</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              <FileType size={16} aria-hidden /> Pdf kiezen… {busy && '(bezig)'}
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          hidden
          aria-label="Pdf-bestand kiezen"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = '';
          }}
        />
        {uploadError && <span role="alert" className="hint" style={{ color: 'var(--err)', fontWeight: 600 }}>{uploadError}</span>}
        {source.pdfId && stored === 'missing' && (
          <span className="hint" role="status" style={{ color: 'var(--warn)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <WarningIcon size={16} aria-hidden /> Dit bestand staat niet (meer) op dit toestel. Kies het opnieuw via “Vervangen”.
          </span>
        )}
        <span className="hint">
          Een geüploade pdf staat alleen op dit toestel. Deel je dit werkblad via een link met thuiswerkers?
          Gebruik dan een pdf-URL, of geef het bestand apart mee — de leerling kan het dan zelf kiezen bij het openen.
        </span>
      </Field>

      <Field label="Of: pdf-URL" hint="Een URL werkt op elk toestel — handig bij delen via een link.">
        <input
          className="input"
          type="url"
          value={source.pdfUrl ?? ''}
          placeholder="https://…/bestand.pdf"
          onChange={(e) => setSource({ ...source, pdfUrl: e.target.value })}
        />
      </Field>

      <CheckRow
        checked={!!palette?.length}
        onChange={(on) =>
          setSource({ ...source, highlightPalette: on ? DEFAULT_PALETTE.map((p) => ({ ...p })) : undefined })
        }
        label="Leerlingen kunnen markeren in de pdf"
      />
      {!!palette?.length && (
        <div style={{ margin: '6px 0 12px', paddingLeft: 4 }}>
          <p className="hint" style={{ margin: '0 0 6px' }}>
            Geef elke kleur een betekenis, zoals bij een markeeropdracht op papier (bv. “geel = hoofdtitel”).
          </p>
          {palette.map((p, i) => (
            <div key={p.color} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, maxWidth: 420 }}>
              <span
                aria-hidden
                style={{ width: 22, height: 22, borderRadius: 6, background: p.color, border: '1px solid var(--line)', flex: 'none' }}
              />
              <input
                className="input input-sm"
                value={p.label}
                placeholder="Betekenis van deze kleur…"
                aria-label={`Betekenis van markeerkleur ${i + 1}`}
                onChange={(e) => {
                  const next = palette.map((x, j) => (j === i ? { ...x, label: e.target.value } : x));
                  setSource({ ...source, highlightPalette: next });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {previewSrc !== null && (
        <Field label="Voorvertoning">
          <PdfViewer src={previewSrc} title={source.title?.trim() || source.pdfName || 'Pdf-document'} height={380} />
        </Field>
      )}
    </>
  );
}

export function SplitWorksheetEditor({ config, onChange }: EditorProps<SplitWorksheetConfig>) {
  const source: SourcePane = config.source ?? { kind: 'text' };
  const questions: Question[] = config.questions ?? [];
  const [addOpen, setAddOpen] = useState(false);

  const setSource = (s: SourcePane) => onChange({ ...config, source: s });
  const update = (i: number, q: Question) => {
    const next = questions.slice();
    next[i] = q;
    onChange({ ...config, questions: next });
  };

  const videoId = source.kind === 'video' ? extractYouTubeId(source.videoUrl ?? '') : null;

  return (
    <div>
      {/* ── Bronpaneel ── */}
      <div className="editor-item">
        <div className="editor-item-head">
          <Pin size={16} aria-hidden />
          <strong style={{ fontSize: '0.9rem' }}>Bronpaneel</strong>
        </div>
        <div className="editor-item-body">
          <Field label="Soort bron">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SOURCE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  className={`btn btn-sm ${source.kind === k.kind ? 'btn-primary' : 'btn-ghost'}`}
                  aria-pressed={source.kind === k.kind}
                  onClick={() => setSource({ ...source, kind: k.kind })}
                >
                  <k.icon size={16} aria-hidden /> {k.label}
                </button>
              ))}
            </div>
            <span className="hint">
              De leerling ziet de bron links naast de vragen. Op een smal scherm staat de bron bovenaan en is ze inklapbaar.
            </span>
          </Field>

          <Field label="Titel van de bron (optioneel)">
            <input
              className="input input-sm"
              value={source.title ?? ''}
              placeholder="bv. Fragment uit een dagboek"
              onChange={(e) => setSource({ ...source, title: e.target.value })}
            />
          </Field>

          {source.kind === 'text' && (
            <Field label="Brontekst" hint="Mag meerdere alinea's bevatten; witregels blijven behouden.">
              <textarea
                className="textarea"
                rows={8}
                value={source.text ?? ''}
                placeholder="Plak of typ hier de leestekst…"
                onChange={(e) => setSource({ ...source, text: e.target.value })}
              />
            </Field>
          )}

          {source.kind === 'image' && (
            <ImagePicker
              value={source.imageUrl}
              onChange={(imageUrl) => setSource({ ...source, imageUrl })}
              label="Bronafbeelding"
            />
          )}

          {source.kind === 'video' && (
            <Field label="Video-URL (YouTube)" hint="Plak een YouTube-link, bv. https://www.youtube.com/watch?v=… of https://youtu.be/…">
              <input
                className="input"
                type="url"
                value={source.videoUrl ?? ''}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => setSource({ ...source, videoUrl: e.target.value })}
              />
              {!!source.videoUrl?.trim() && (
                <span
                  className="hint"
                  role="status"
                  style={{ color: videoId ? 'var(--ok)' : 'var(--warn)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {videoId
                    ? <><CheckIcon size={16} aria-hidden /> Video herkend — wordt privacyvriendelijk ingesloten.</>
                    : <><WarningIcon size={16} aria-hidden /> Geen YouTube-video herkend in deze link.</>}
                </span>
              )}
            </Field>
          )}

          {source.kind === 'pdf' && <PdfSourceEditor source={source} setSource={setSource} />}
        </div>
      </div>

      {/* ── Vragen ── */}
      <h3 style={{ margin: '18px 0 10px' }}>Vragen bij de bron</h3>
      {questions.map((q, i) => (
        <div className="editor-item" key={q.id}>
          <ItemHeader
            index={i}
            label={questionLabel(q)}
            canUp={i > 0}
            canDown={i < questions.length - 1}
            onMoveUp={() => onChange({ ...config, questions: moveItem(questions, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, questions: moveItem(questions, i, i + 1) })}
            onDelete={() => onChange({ ...config, questions: questions.filter((_, j) => j !== i) })}
            onDuplicate={() => {
              const copy = JSON.parse(JSON.stringify(q)) as Question;
              copy.id = uid();
              const next = questions.slice();
              next.splice(i + 1, 0, copy);
              onChange({ ...config, questions: next });
            }}
          />
          <div className="editor-item-body">
            <Field label="Vraag">
              <textarea
                className="textarea"
                rows={2}
                value={q.prompt}
                placeholder="Typ hier je vraag over de bron…"
                onChange={(e) => update(i, { ...q, prompt: e.target.value })}
              />
            </Field>
            <CompactQuestionEditor q={q} onChange={(nq) => update(i, nq)} />
            {EDITABLE_TYPES.has(q.type) && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                  Extra: afbeelding, punten & feedback
                </summary>
                <div style={{ paddingTop: 10 }}>
                  <ImagePicker value={q.imageUrl} onChange={(imageUrl) => update(i, { ...q, imageUrl })} />
                  <Field label="Punten">
                    <input
                      className="input input-sm" type="number" min={0} step="0.5" value={q.points} style={{ maxWidth: 110 }}
                      onChange={(e) => update(i, { ...q, points: Math.max(0, parseFloat(e.target.value) || 0) })}
                    />
                  </Field>
                  <Field label="Uitleg bij feedback" hint="Wordt getoond nadat de leerling heeft ingediend (als feedback aanstaat).">
                    <textarea className="textarea" rows={2} value={q.explanation ?? ''} onChange={(e) => update(i, { ...q, explanation: e.target.value })} />
                  </Field>
                </div>
              </details>
            )}
          </div>
        </div>
      ))}

      {questions.length === 0 && (
        <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: '14px 0' }}>
          Nog geen vragen. Voeg je eerste vraag over de bron toe.
        </p>
      )}

      <div style={{ position: 'relative' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen} aria-haspopup="menu">
          + Vraag toevoegen
        </button>
        {addOpen && (
          <div
            className="card"
            style={{
              position: 'absolute', zIndex: 30, marginTop: 8, padding: 8, width: 320,
              display: 'grid', gap: 2, boxShadow: 'var(--shadow-2)',
            }}
            role="menu"
          >
            {QUESTION_TYPES.filter((t) => EDITABLE_TYPES.has(t.type)).map((t) => (
              <button
                key={t.type}
                role="menuitem"
                className="btn btn-quiet"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => {
                  onChange({ ...config, questions: [...questions, makeQuestion(t.type)] });
                  setAddOpen(false);
                }}
              >
                <t.icon size={18} aria-hidden />
                <span style={{ textAlign: 'left' }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{t.name}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: 400 }}>{t.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Meer vraagtypes nodig (invullen, koppelen, rangschikken…)? Maak daarvoor een gewone quiz of een werkblad.
      </p>
    </div>
  );
}

// ── SPELER ──────────────────────────────────────────────────────────────────

/** Markeer-doorgave van de speler naar het pdf-bronpaneel. */
interface PdfPaneProps {
  palette?: HighlightColor[];
  highlights?: PdfHighlight[];
  onHighlightsChange?: (h: PdfHighlight[]) => void;
}

/**
 * Pdf-bron in de speler: haalt de upload uit IndexedDB (of gebruikt de URL),
 * toont de markeerlegende en vangt een ontbrekende upload netjes op.
 */
function PdfSourcePane({ source, palette, highlights, onHighlightsChange }: PdfPaneProps & { source: SourcePane }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(source.pdfId ? 'loading' : 'ready');
  const [pickError, setPickError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    if (!source.pdfId) { setBlob(null); setState('ready'); return; }
    setState('loading');
    getPdf(source.pdfId).then((rec) => {
      if (!alive) return;
      if (rec) { setBlob(rec.blob); setState('ready'); } else { setBlob(null); setState('missing'); }
    });
    return () => { alive = false; };
  }, [source.pdfId]);

  const url = source.pdfUrl?.trim() || null;
  const title = source.title?.trim() || source.pdfName || 'Pdf-document';

  /** Leerling kiest het bestand dat de leerkracht apart meegaf → koppeling herstellen. */
  const restore = async (file: File) => {
    if (!source.pdfId) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPickError('Kies een pdf-bestand.');
      return;
    }
    setPickError('');
    try {
      // zelfde pdfId → savePdf overschrijft en de koppeling is hersteld
      await savePdf(source.pdfId, file.name, file);
    } catch {
      /* opslag vol? Dan werken we gewoon verder met het bestand in het geheugen. */
    }
    setBlob(file);
    setState('ready');
  };

  // Geüploade pdf gaat voor; ontbreekt hij, dan is de URL de terugval.
  const src: Blob | string | null = blob ?? (state === 'loading' ? null : url);

  return (
    <div>
      <HighlightLegend palette={palette} />
      {state === 'loading' && (
        <p className="hint" role="status" aria-live="polite">Pdf laden…</p>
      )}
      {state === 'missing' && (
        <div className="callout warn" style={{ marginBottom: src ? 10 : 0 }}>
          <FileType aria-hidden />
          <div>
            <p style={{ margin: 0 }}>
              <strong>Deze pdf staat niet op dit toestel.</strong>{' '}
              {url
                ? 'We tonen hieronder de online versie. Kreeg je het bestand ook van je leerkracht? Kies het dan hier.'
                : 'Kreeg je het bestand van je leerkracht (bv. via e-mail of een USB-stick)? Kies het hier om verder te werken.'}
            </p>
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
              <FolderOpen size={16} aria-hidden /> Kies het pdf-bestand dat je van je leerkracht kreeg
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              aria-label="Pdf-bestand van je leerkracht kiezen"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = '';
              }}
            />
            {pickError && <p role="alert" style={{ margin: '6px 0 0', color: 'var(--err)', fontWeight: 600 }}>{pickError}</p>}
          </div>
        </div>
      )}
      {src !== null && (
        <PdfViewer
          src={src}
          title={title}
          palette={palette}
          highlights={highlights}
          onHighlightsChange={onHighlightsChange}
          height={520}
        />
      )}
    </div>
  );
}

function SourceContent({ source, pdf }: { source: SourcePane; pdf?: PdfPaneProps }) {
  if (source.kind === 'pdf') {
    return <PdfSourcePane source={source} {...pdf} />;
  }
  if (source.kind === 'image' && source.imageUrl) {
    return (
      <img
        src={source.imageUrl}
        alt={source.title?.trim() || 'Bronafbeelding'}
        style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }}
      />
    );
  }
  if (source.kind === 'video' && source.videoUrl) {
    const id = extractYouTubeId(source.videoUrl);
    if (!id) {
      // Alleen een http(s)-adres als link: een javascript:-URL uit gedeelde
      // inhoud zou anders in de app uitgevoerd worden (zie lib/veiligeUrl.ts).
      const link = webUrl(source.videoUrl);
      return (
        <div className="callout warn" style={{ marginBottom: 0 }}>
          <Video aria-hidden />
          <div>
            Deze video kan niet ingesloten worden.
            {link && <>{' '}<a href={link} target="_blank" rel="noopener noreferrer">Open de video in een nieuw tabblad.</a></>}
          </div>
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={source.title?.trim() || 'Bronvideo'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{source.text}</div>;
}

function SourcePanel({
  source, narrow, open, onToggle, pdf,
}: {
  source: SourcePane;
  narrow: boolean;
  open: boolean;
  onToggle: () => void;
  pdf?: PdfPaneProps;
}) {
  const contentId = useId();
  const title = source.title?.trim() || sourceKindLabel(source.kind);
  const showContent = !narrow || open;
  return (
    <section
      className="card"
      aria-label={`Bron: ${title}`}
      style={{ borderTop: '4px solid var(--player-accent, var(--brand))', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
        <span className="badge badge-brand">Bron</span>
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </strong>
        {narrow && (
          <button
            className="btn btn-quiet btn-sm"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={onToggle}
          >
            {open ? <><ChevronUp size={16} className="icon-inline" aria-hidden /> Inklappen</> : <><ChevronDown size={16} className="icon-inline" aria-hidden /> Tonen</>}
          </button>
        )}
      </div>
      {showContent && (
        <div id={contentId} style={{ padding: '0 18px 18px' }}>
          <SourceContent source={source} pdf={pdf} />
        </div>
      )}
    </section>
  );
}

/** Sleutel voor tussentijds bewaarde markeringen (zelfde stijl als lib/autosave). */
const highlightKey = (widgetId: string, studentName: string) =>
  `wf.markeringen.${widgetId}.${studentName.trim().toLowerCase()}`;

export function SplitWorksheetPlayer({ widget, studentName, preview, timeUp, onComplete }: PlayerProps<SplitWorksheetConfig>) {
  const questions = useMemo<Question[]>(() => {
    const all = widget.config.questions ?? [];
    return widget.settings.shuffle ? shuffled(all) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id]);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ReturnType<typeof gradeQuiz> | null>(null);
  const [sourceOpen, setSourceOpen] = useState(true);
  const submittedRef = useRef(false);
  const narrow = useIsNarrow(800);

  const source = widget.config.source ?? { kind: 'text' as const };
  const hasSource = sourceIsFilled(source);
  const canMark = source.kind === 'pdf' && !!source.highlightPalette?.length;

  // Markeringen in de pdf-bron: tussentijds bewaard (zoals autosave), leeg bij indienen.
  const [sourceHighlights, setSourceHighlights] = useState<PdfHighlight[]>(() => {
    if (preview || !canMark) return [];
    try {
      const raw = localStorage.getItem(highlightKey(widget.id, studentName));
      if (!raw) return [];
      const data = JSON.parse(raw) as { highlights?: PdfHighlight[]; savedAt?: number };
      if (!data.savedAt || Date.now() - data.savedAt > 7 * 24 * 3600 * 1000) return [];
      return Array.isArray(data.highlights) ? data.highlights : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (preview || !canMark || submittedRef.current) return;
    try {
      localStorage.setItem(
        highlightKey(widget.id, studentName),
        JSON.stringify({ highlights: sourceHighlights, savedAt: Date.now() })
      );
    } catch {
      /* opslag vol — autosave is best-effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceHighlights]);

  const gradable: Question[] = questions.filter((q) => q.type !== 'info');
  const answeredCount = gradable.filter((q) => isAnswered(q, answers[q.id])).length;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const res = gradeQuiz({ questions, layout: 'scroll' }, answers);
    setResult(res);
    // markeringen gaan als meta-veld mee in de inzending (zoals _zekerheid/_hints)
    const answersOut = canMark && sourceHighlights.length > 0
      ? { ...answers, _sourceHighlights: sourceHighlights }
      : answers;
    onComplete({ answers: answersOut, itemScores: res.itemScores, earned: res.earned, max: res.max, hasPending: res.hasPending });
    if (!preview) {
      try { localStorage.removeItem(highlightKey(widget.id, studentName)); } catch { /* negeren */ }
    }
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (timeUp && !submittedRef.current && questions.length > 0) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (questions.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
        Dit werkblad bevat nog geen vragen. Vraag je leerkracht om vragen toe te voegen.
      </p>
    );
  }

  // ── Klaar: resultaat + eventueel feedbackoverzicht ──
  if (result) {
    const review = widget.settings.showFeedback;
    return (
      <div>
        <ResultHero
          earned={result.earned}
          max={result.max}
          showScore={widget.settings.showScore}
          hasPending={result.hasPending}
        />
        {review && (
          <div style={{ marginTop: 22 }}>
            {hasSource && (
              <details className="card card-pad" style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Pin size={16} aria-hidden /> Bron opnieuw bekijken
                </summary>
                <div style={{ marginTop: 12 }}>
                  {/* alleen-lezen: eigen markeringen blijven zichtbaar, markeren kan niet meer */}
                  <SourceContent
                    source={source}
                    pdf={{ palette: canMark ? source.highlightPalette : undefined, highlights: sourceHighlights }}
                  />
                </div>
              </details>
            )}
            <h2 style={{ textAlign: 'center' }}>Overzicht van je antwoorden</h2>
            {questions.map((q) => (
              <QuestionView
                key={q.id}
                q={q}
                index={gradable.indexOf(q)}
                total={gradable.length}
                value={answers[q.id]}
                onChange={() => {}}
                review
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Bezig: bron links (sticky) of bovenaan (inklapbaar), vragen ernaast/eronder ──
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: hasSource && !narrow ? 'minmax(280px, 5fr) minmax(0, 7fr)' : 'minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {hasSource && (
        <div
          style={
            narrow
              ? undefined
              : { position: 'sticky', top: 74, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }
          }
        >
          <SourcePanel
            source={source}
            narrow={narrow}
            open={sourceOpen}
            onToggle={() => setSourceOpen((v) => !v)}
            pdf={{
              palette: canMark ? source.highlightPalette : undefined,
              highlights: sourceHighlights,
              onHighlightsChange: canMark ? setSourceHighlights : undefined,
            }}
          />
        </div>
      )}
      <div>
        {!hasSource && (
          <div className="callout" style={{ marginBottom: 16 }}>
            <InfoIcon aria-hidden />
            <div>Er is nog geen bron ingesteld; je kunt de vragen gewoon beantwoorden.</div>
          </div>
        )}
        {questions.map((q) => (
          <QuestionView
            key={q.id}
            q={q}
            index={gradable.indexOf(q)}
            total={gradable.length}
            value={answers[q.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            review={false}
          />
        ))}
        <div className="player-nav">
          <span role="status" aria-live="polite" style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
            {answeredCount} van {gradable.length} beantwoord
          </span>
          <button className="btn btn-primary btn-lg" onClick={submit}><CheckIcon size={18} aria-hidden /> Indienen</button>
        </div>
      </div>
    </div>
  );
}
