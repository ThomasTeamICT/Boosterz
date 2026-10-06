import React, { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Brain, ClipboardCheck, Compass, Dices, Download, EyeOff, Glasses, HelpCircle, Highlighter,
  Inbox as InboxIcon, Palette, Paperclip, Shield, Users,
} from 'lucide-react';
import { deleteSubmission, getLiveEntries, getSubmissions, getWidget, onStorageChange, saveSubmission } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { LongAnswerValue, LongQuestion, Question, QuizConfig, SplitWorksheetConfig, Submission, UploadQuestion, Widget } from '../lib/types';
import type { PdfHighlight } from '../components/pdf/PdfViewer';
import { csvCell, downloadFile, formatDate, formatDuration, normalizeAnswer, pct } from '../lib/utils';
import { ConfirmModal, EmptyState, Modal, ScoreRing, useToast } from '../components/ui';
import { gradeQuestion } from '../lib/grading';
import { goalLabel } from '../lib/curriculum';
import { awaitsGrading } from '../lib/goals';
import { processCodes } from '../lib/inbox';
import { sanitizeMetaAnswers } from '../lib/progressTransfer';
import { isRenderableMedia } from '../lib/mediaStore';
import { passieveBlob } from '../lib/veiligeUrl';
import { askAI, hasAIKey } from '../lib/ai';
import { markTokens as playerMarkTokens, matchMarkers, ZoneCircle } from '../widgets/qtypes/interactTypes';
import { getStudentFile } from '../lib/pdfStore';
import { TypeTile } from '../components/TypeTile';
import { filterSubmissionsByClass } from '../lib/resultsFilter';
import { useResultsClassFilter } from '../lib/useResultsClassFilter';
import { ClassFilterNotice } from '../components/results/ClassFilterNotice';
import { awaitingCount, CSV_BOM, CSV_MIME, goalRefOf, type GoalRef } from '../components/results/resultsHelpers';
import { importOutcome, type ImportOutcome } from '../components/results/importOutcome';
import {
  AddIcon, AIIcon, BackIcon, CheckIcon, CloseIcon, CourseIcon, DeleteIcon, EditIcon,
  ExportIcon, GoalIcon, ImportIcon, SearchIcon, TipIcon, WarningIcon,
} from '../components/icons';
import '../styles/opvolgen.css';

// widgets met een QuizConfig-achtige 'questions'-lijst → volledige beoordelings-UI
const QUIZ_FAMILY = new Set(['quiz', 'worksheet', 'exitticket', 'splitworksheet']);

/** Eigen foutenanalyse van de leerling: label + icoon per categorie. */
const FOUT_LABELS: Record<string, { Icon: LucideIcon; text: string }> = {
  slordig: { Icon: EyeOff, text: 'slordig' },
  gelezen: { Icon: Glasses, text: 'verkeerd gelezen' },
  kennis: { Icon: CourseIcon, text: 'stof niet gekend' },
  aanpak: { Icon: Compass, text: 'aanpak niet gekend' },
};

/**
 * Eigen tekstwaarde uit een object met vraag-id's als sleutel. Een id als
 * "constructor" of "toString" geeft zo niets in plaats van iets uit Object.prototype.
 */
function eigenTekst(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object' || !Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

/** Juist- of foutmarkering i.p.v. een ✓/✗-teken (analyses, rubrics, antwoordoverzichten). */
function OkMark() {
  return <CheckIcon size={14} className="icon-inline" style={{ color: 'var(--ok)' }} />;
}
function ErrMark() {
  return <CloseIcon size={14} className="icon-inline" style={{ color: 'var(--err)' }} />;
}

interface TabDef { key: TabKey; label: string; Icon: LucideIcon }

/**
 * Volledig ARIA-tabspatroon (niet enkel role="tab"): aria-selected,
 * aria-controls, een tabpanel met aria-labelledby, pijltjestoetsen en enkel
 * de actieve tab in de tabvolgorde (roving tabindex).
 */
function ResultsTabs({ tabs, active, onChange }: { tabs: TabDef[]; active: TabKey; onChange: (key: TabKey) => void }) {
  const btnRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const focusAndSelect = (key: TabKey) => {
    onChange(key);
    btnRefs.current[key]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusAndSelect(tabs[(index + 1) % tabs.length].key); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAndSelect(tabs[(index - 1 + tabs.length) % tabs.length].key); }
    else if (e.key === 'Home') { e.preventDefault(); focusAndSelect(tabs[0].key); }
    else if (e.key === 'End') { e.preventDefault(); focusAndSelect(tabs[tabs.length - 1].key); }
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Resultatenweergave">
      {tabs.map((t, i) => {
        const selected = active === t.key;
        return (
          <button
            key={t.key}
            ref={(el) => { btnRefs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <t.Icon size={16} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

type TabKey = 'students' | 'questions' | 'grade';

export function ResultsPage() {
  const { id } = useParams();
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);
  const { classes, filter, setFilter } = useResultsClassFilter();

  const widget = id ? getWidget(id) : undefined;
  const isQuiz = widget ? QUIZ_FAMILY.has(widget.type) : false;
  const rawSubs = widget ? getSubmissions(widget.id) : [];
  // met de klassen erbij: dezelfde inzendingen als het klasdashboard
  const subs = filterSubmissionsByClass(rawSubs, filter, classes).sort((a, b) => b.submittedAt - a.submittedAt);
  const hiddenByFilter = rawSubs.length - subs.length;
  const openQuestionsExist = isQuiz && widget
    ? (widget.config as QuizConfig).questions.some((q) => q.type === 'long' || q.type === 'upload')
    : false;
  const pendingCount = awaitingCount(subs);

  const [detail, setDetail] = useState<Submission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  // Is er iets na te kijken? Dan opent de detailpagina meteen op de nakijktab.
  const [tab, setTab] = useState<TabKey>(() => (openQuestionsExist && pendingCount > 0 ? 'grade' : 'students'));
  const [importOpen, setImportOpen] = useState(false);
  const toast = useToast();

  React.useEffect(() => {
    setTab(openQuestionsExist && pendingCount > 0 ? 'grade' : 'students');
    // Enkel bij het wisselen van widget opnieuw bepalen welke tab eerst moet —
    // een latere, bewuste tabkeuze van de leerkracht blijft daarna staan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!widget) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h1>Widget niet gevonden</h1>
        <Link to="/resultaten" className="btn btn-primary"><BackIcon size={16} /> Alle resultaten</Link>
      </div>
    );
  }

  const def = getTypeDef(widget.type);
  // live (zelfde toestel/browser): gestart maar nog niets ingediend sinds de start
  const busy = getLiveEntries(widget.id).filter(
    (e) => !subs.some((s) => s.studentName === e.studentName && s.submittedAt >= e.startedAt)
  );
  const scored = subs.filter((s) => s.totalMax > 0);
  const avg = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + pct(s.totalEarned, s.totalMax), 0) / scored.length) : null;
  // Wat nog nagekeken moet worden staat als 0 in de score: het gemiddelde is dan voorlopig.
  const provisional = avg !== null && pendingCount > 0;

  const exportCsv = (anonymous = false) => {
    const rows: string[][] = [];
    const nameOf = (s: Submission, i: number) => (anonymous ? `Leerling ${i + 1}` : s.studentName);
    if (isQuiz) {
      const qs = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
      rows.push(['Leerling', 'Ingediend', 'Duur', 'Score', 'Max', 'Procent', ...qs.map((q, i) => `V${i + 1}: ${q.prompt.slice(0, 40)}`)]);
      subs.forEach((s, i) => {
        rows.push([
          nameOf(s, i), formatDate(s.submittedAt), formatDuration(s.durationSec),
          String(s.totalEarned), String(s.totalMax), s.totalMax > 0 ? `${pct(s.totalEarned, s.totalMax)}%` : '',
          ...qs.map((q) => formatAnswer(q, s.answers[q.id])),
        ]);
      });
    } else {
      rows.push(['Leerling', 'Ingediend', 'Duur', 'Score', 'Max', 'Details']);
      subs.forEach((s, i) => {
        rows.push([
          nameOf(s, i), formatDate(s.submittedAt), formatDuration(s.durationSec),
          String(s.totalEarned), String(s.totalMax),
          JSON.stringify(s.answers).slice(0, 300),
        ]);
      });
    }
    const csv = rows.map((r) => r.map(csvCell).join(';')).join('\n');
    downloadFile(`resultaten-${widget.code}${anonymous ? '-anoniem' : ''}.csv`, CSV_BOM + csv, CSV_MIME);
    toast(anonymous ? 'Anonieme CSV geëxporteerd' : 'CSV geëxporteerd — dit bestand bevat namen van leerlingen, bewaar het zorgvuldig', 'ok');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/resultaten" className="hint" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <BackIcon size={14} /> Alle resultaten
          </Link>
          <h1 style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12 }}><TypeTile type={def} size="md" /> {widget.title}</h1>
          <p className="sub">{def.name} · code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong></p>
        </div>
        <div className="page-head-actions">
          <Link to={`/bewerk/${widget.id}`} className="btn btn-ghost"><EditIcon size={18} /> Bewerken</Link>
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}><ImportIcon size={18} /> Resultaatcode plakken</button>
          <button className="btn btn-ghost" onClick={() => exportCsv(false)} disabled={subs.length === 0}><ExportIcon size={18} /> CSV exporteren</button>
          <button className="btn btn-quiet" onClick={() => exportCsv(true)} disabled={subs.length === 0} title="Voor teamoverleg: zonder leerlingnamen">CSV zonder namen</button>
        </div>
      </div>

      {classes.length > 0 && (
        <div className="field class-filter">
          <label htmlFor="resultaten-klasfilter">Klas</label>
          <select
            id="resultaten-klasfilter"
            className="select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Alle klassen</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="none">Zonder klas</option>
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 22 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>{subs.length}</div>
          <div className="hint">inzendingen</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: avg === null ? 'var(--text-faint)' : avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }}>
            {avg === null ? '—' : `${avg}%`}
          </div>
          <div className="hint">gemiddelde score{provisional ? ' (voorlopig)' : ''}</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: pendingCount > 0 ? 'var(--warn)' : 'var(--ok)' }}>
            {pendingCount}
          </div>
          <div className="hint">nog na te kijken</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>
            {subs.length > 0 ? formatDuration(Math.round(subs.reduce((a, s) => a + s.durationSec, 0) / subs.length)) : '—'}
          </div>
          <div className="hint">gemiddelde duur</div>
        </div>
      </div>

      {busy.length > 0 && (
        <div className="callout" role="status" aria-live="polite" style={{ alignItems: 'center' }}>
          <span aria-hidden className="live-dot" />
          <div>
            <strong>Nu bezig op dit toestel:</strong>{' '}
            {busy.map((e) => e.studentName).join(', ')}
            <span className="hint"> — dit overzicht ververst vanzelf zodra ze indienen.</span>
          </div>
        </div>
      )}

      {isQuiz && subs.length > 0 && (
        <ResultsTabs
          tabs={[
            { key: 'students', label: 'Per leerling', Icon: Users },
            { key: 'questions', label: 'Per vraag', Icon: HelpCircle },
            ...((widget.config as QuizConfig).questions.some((q) => q.type === 'long' || q.type === 'upload')
              ? [{ key: 'grade' as TabKey, label: pendingCount > 0 ? `Nakijken (${pendingCount})` : 'Nakijken', Icon: ClipboardCheck }]
              : []),
          ]}
          active={tab}
          onChange={setTab}
        />
      )}

      <ClassFilterNotice hidden={hiddenByFilter} onShowAll={() => setFilter('all')} />

      {subs.length === 0 ? (
        rawSubs.length > 0 ? (
          <EmptyState icon={<InboxIcon size={40} />} title="Geen inzendingen voor dit klasfilter">
            <p>Er staat wel werk van andere klassen of van leerlingen zonder klas op dit toestel.</p>
          </EmptyState>
        ) : (
          <EmptyState icon={<InboxIcon size={40} />} title="Nog geen inzendingen voor deze widget">
            <p>Deel de code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong> met je klas om resultaten te verzamelen.</p>
          </EmptyState>
        )
      ) : (
        <div
          role={isQuiz && subs.length > 0 ? 'tabpanel' : undefined}
          id={isQuiz && subs.length > 0 ? `panel-${tab}` : undefined}
          aria-labelledby={isQuiz && subs.length > 0 ? `tab-${tab}` : undefined}
        >
          {tab === 'questions' && isQuiz ? (
            <QuestionStats widget={widget} subs={subs} />
          ) : tab === 'grade' && isQuiz ? (
            <GradingCockpit widget={widget} subs={subs} />
          ) : (
            <div className="table-wrap" role="region" tabIndex={0} aria-label="Inzendingen per leerling">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Leerling</th>
                    <th scope="col">Ingediend</th>
                    <th scope="col">Duur</th>
                    <th scope="col">Score</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Acties</span></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => {
                    const p = s.totalMax > 0 ? pct(s.totalEarned, s.totalMax) : null;
                    const waiting = awaitsGrading(s);
                    return (
                      // De muis mag de hele rij gebruiken; het toetsenbord gebruikt de knop in de eerste cel.
                      <tr key={s.id} onClick={() => setDetail(s)}>
                        <th scope="row">
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm row-open"
                            aria-label={`Inzending van ${s.studentName} bekijken`}
                            onClick={() => setDetail(s)}
                          >
                            {s.studentName}
                          </button>
                        </th>
                        <td className="hint">{formatDate(s.submittedAt)}</td>
                        <td className="hint">{formatDuration(s.durationSec)}</td>
                        <td>
                          {p === null ? <span className="hint">—</span> : (
                            <div className="scorebar">
                              <div className="bar"><div style={{ width: `${p}%`, background: p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)' }} /></div>
                              <strong>{s.totalEarned}/{s.totalMax}</strong>
                              {waiting && <span className="hint">(voorlopig)</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          {waiting
                            ? <span className="badge badge-warn"><ClipboardCheck size={14} className="icon-inline" /> na te kijken</span>
                            : <span className="badge badge-ok"><OkMark /> verbeterd</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-quiet btn-icon btn-sm" aria-label={`Inzending van ${s.studentName} verwijderen`}
                            onClick={() => setDeleteTarget(s)} style={{ color: 'var(--err)' }}><DeleteIcon size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {importOpen && (
        <ResultCodeImportModal
          widget={widget}
          onClose={() => setImportOpen(false)}
          onDone={(message) => toast(message, 'ok')}
        />
      )}
      {detail && <SubmissionModal widget={widget} submission={detail} onClose={() => setDetail(null)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Inzending verwijderen?"
          message={`De inzending van ${deleteTarget.studentName} wordt definitief verwijderd.`}
          onConfirm={() => { deleteSubmission(deleteTarget.id); toast('Inzending verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function formatAnswer(q: Question, answer: unknown): string {
  if (answer === undefined || answer === null) return '—';
  switch (q.type) {
    case 'mc': return typeof answer === 'number' ? q.options[answer] ?? '—' : '—';
    case 'multi': return Array.isArray(answer) ? (answer as number[]).map((i) => q.options[i]).join(', ') : '—';
    case 'tf': return answer === true ? 'Juist' : answer === false ? 'Onjuist' : '—';
    case 'match': return Array.isArray(answer) ? q.pairs.map((p, i) => `${p.left}→${typeof (answer as any[])[i] === 'number' ? q.pairs[(answer as any[])[i] as number]?.right ?? '?' : '?'}`).join('; ') : '—';
    case 'long': {
      if (typeof answer === 'string') return answer;
      const lv = answer as LongAnswerValue | null;
      const parts = [lv?.tekst, lv?.tekening ? '[tekening]' : '', lv?.audio ? '[audio]' : ''].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    case 'order': return Array.isArray(answer) ? (answer as number[]).map((i) => q.items[i]).join(' → ') : '—';
    case 'gap': return Array.isArray(answer) ? (answer as string[]).join(' / ') : '—';
    // ── uitgebreide vraagtypes ──
    case 'dropdown': {
      const r = asRecord(answer);
      if (!r) return '—';
      const gaps = splitBraces(q.text ?? '').filter((p) => p.type === 'gap');
      return gaps.map((_, i) => String(r[String(i)] ?? '—')).join(' / ') || '—';
    }
    case 'rating': return typeof answer === 'number' ? `${answer}/${q.scale}` : '—';
    case 'likert': {
      const r = asRecord(answer);
      if (!r) return '—';
      return (q.statements ?? [])
        .map((st) => `${st.text}: ${typeof r[st.id] === 'number' ? (q.options ?? [])[r[st.id] as number] ?? '?' : '—'}`)
        .join('; ') || '—';
    }
    case 'upload': {
      const f = uploadAnswer(answer);
      return f ? `${f.name}${f.size !== null ? ` (${formatBytes(f.size)})` : ''}` : '—';
    }
    case 'marktext': {
      if (!Array.isArray(answer)) return '—';
      const tokens = markTokens(q.text ?? '');
      const words = (answer as unknown[])
        .filter((i): i is number => typeof i === 'number')
        .map((i) => tokens[i]?.word ?? '?');
      return words.length > 0 ? words.join(', ') : '(niets gemarkeerd)';
    }
    case 'sort': {
      const r = asRecord(answer);
      if (!r) return '—';
      const catName = (id: unknown) => (q.categories ?? []).find((c) => c.id === id)?.name ?? '?';
      return (q.items ?? [])
        .map((it) => `${it.text} → ${it.id in r ? catName(r[it.id]) : '—'}`)
        .join('; ') || '—';
    }
    case 'imagepoint': {
      if (!Array.isArray(answer)) return '—';
      const n = (answer as unknown[]).length;
      return `${n} ${n === 1 ? 'klik' : 'klikken'}`;
    }
    case 'table': {
      const r = asRecord(answer);
      if (!r) return '—';
      const parts: string[] = [];
      for (const row of q.rows ?? []) {
        const rowAns = asRecord(r[row.id]);
        (row.cells ?? []).forEach((_cell, ci) => {
          // invulcel = er is een verwacht antwoord ingesteld; een lege vaste cel telt niet mee
          if (row.answers?.[ci] === null || row.answers?.[ci] === undefined) return;
          parts.push(String(rowAns?.[String(ci)] ?? '—'));
        });
      }
      return parts.join(' / ') || '—';
    }
    default: return String(answer);
  }
}

// ── Hulpjes + detailweergave voor de uitgebreide vraagtypes ─────────────────

/** Nieuwe vraagtypes met een eigen rijke weergave in het inzendingsdetail. */
const RICH_TYPES = new Set<Question['type']>(['dropdown', 'rating', 'likert', 'upload', 'marktext', 'sort', 'imagepoint', 'table']);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Upload-antwoord veilig uitlezen ({name,size,fileId} of legacy {name,size,dataUrl}). */
function uploadAnswer(v: unknown): { name: string; size: number | null; dataUrl: string | null; fileId: string | null } | null {
  const r = asRecord(v);
  if (!r || typeof r.name !== 'string') return null;
  return {
    name: r.name,
    size: typeof r.size === 'number' ? r.size : null,
    // data-URL (legacy) of blob:-URL (na de mediamigratie, zie lib/mediaStore)
    dataUrl: isRenderableMedia(r.dataUrl) ? r.dataUrl : null,
    fileId: typeof r.fileId === 'string' && r.fileId !== '' ? r.fileId : null,
  };
}

/**
 * Downloadregel voor een ingeleverd bestand (detailmodal + nakijkcockpit).
 * Legacy-antwoorden linken direct naar de dataUrl; nieuwe antwoorden halen de
 * blob async uit IndexedDB (object-URL, opgeruimd bij unmount). Staat de blob
 * niet op dit toestel (bv. inzending via resultaatcode), dan zeggen we dat.
 */
function UploadAnswerLine({ ans }: { ans: unknown }) {
  const f = uploadAnswer(ans);
  const fileId = f && !f.dataUrl ? f.fileId : null;
  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  React.useEffect(() => {
    setObjUrl(null);
    setMissing(false);
    if (!fileId) return;
    let cancelled = false;
    let url: string | null = null;
    getStudentFile(fileId).then((rec) => {
      if (cancelled) return;
      if (!rec) { setMissing(true); return; }
      // Leerlingbestand: nooit als html/svg in de origin van de app openen.
      url = URL.createObjectURL(passieveBlob(rec.blob));
      setObjUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);

  if (!f) return <em className="hint">(geen bestand ingeleverd)</em>;
  const href = f.dataUrl ?? objUrl;
  const notFound = missing || (!f.dataUrl && !f.fileId);
  return (
    <p style={{ margin: 0 }}>
      <Paperclip size={15} className="icon-inline" /> <strong>{f.name}</strong>
      {f.size !== null && <span className="hint"> ({formatBytes(f.size)})</span>}
      {href
        ? <> · <a href={href} download={f.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={14} /> Bestand downloaden</a></>
        : notFound
          ? <span className="hint"> — het bestand staat op het toestel van de leerling (kwam deze inzending via een resultaatcode?)</span>
          : <span className="hint"> · bestand laden…</span>}
    </p>
  );
}

/** Dropdown-tekst splitsen: "De {Brussel|Gent} …" → tekst- en gat-segmenten (eerste optie = juist). */
function splitBraces(text: string): ({ type: 'text'; value: string } | { type: 'gap'; options: string[] })[] {
  const out: ({ type: 'text'; value: string } | { type: 'gap'; options: string[] })[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'gap', options: m[1].split('|').map((s) => s.trim()).filter(Boolean) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/** Markeertekst opdelen in woord-tokens; woorden tussen [haken] zijn de doelwoorden. */
// Zelfde tokenizer als de speler (qtypes) — identieke woordindexen gegarandeerd.
function markTokens(text: string): { word: string; correct: boolean }[] {
  return playerMarkTokens(text).map((t) => ({ word: t.text, correct: t.correct }));
}

const CHIP_BASE: React.CSSProperties = {
  display: 'inline-block', padding: '1px 9px', borderRadius: 999,
  fontWeight: 600, fontSize: '0.85rem', margin: '2px 6px 2px 0',
};
const OK_CHIP: React.CSSProperties = { ...CHIP_BASE, background: 'var(--ok-soft)', color: 'var(--ok)' };
const ERR_CHIP: React.CSSProperties = { ...CHIP_BASE, background: 'var(--err-soft)', color: 'var(--err)' };

/** Nette weergave van de antwoordvormen van de uitgebreide vraagtypes (detailmodal + cockpit). */
function ExtraAnswerView({ q, ans }: { q: Question; ans: unknown }) {
  switch (q.type) {
    case 'dropdown': {
      const r = asRecord(ans);
      const gaps = splitBraces(q.text ?? '').filter((p): p is { type: 'gap'; options: string[] } => p.type === 'gap');
      if (gaps.length === 0) return <em className="hint">—</em>;
      return (
        <div>
          {gaps.map((g, i) => {
            const raw = r?.[String(i)];
            const chosen = typeof raw === 'string' ? raw : null;
            const correct = g.options[0] ?? '';
            const ok = chosen !== null && chosen === correct;
            return (
              <p key={i} style={{ margin: '2px 0' }}>
                <span className="hint">gat {i + 1}:</span>{' '}
                <span style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>
                  {ok ? <OkMark /> : <ErrMark />} {chosen ?? '(geen keuze)'}
                </span>
                {!ok && <span className="hint"> · juist: {correct}</span>}
              </p>
            );
          })}
        </div>
      );
    }
    case 'rating': {
      const scale = Math.max(1, Math.min(10, Math.round(q.scale) || 5));
      const n = typeof ans === 'number' ? Math.max(0, Math.min(scale, Math.round(ans))) : null;
      if (n === null) return <em className="hint">(geen beoordeling)</em>;
      return (
        <p style={{ margin: 0 }}>
          <span style={{ color: 'var(--warn)', letterSpacing: 2 }}>{'★'.repeat(n)}{'☆'.repeat(scale - n)}</span>{' '}
          <strong>{n}/{scale}</strong>
        </p>
      );
    }
    case 'likert': {
      const r = asRecord(ans);
      const sts = q.statements ?? [];
      if (sts.length === 0) return <em className="hint">—</em>;
      return (
        <div>
          {sts.map((st, i) => {
            const raw = r?.[st.id];
            const oi = typeof raw === 'number' ? raw : null;
            return (
              <p key={st.id ?? i} style={{ margin: '2px 0' }}>
                {st.text}:{' '}
                {oi === null
                  ? <span className="hint">—</span>
                  : <strong>{(q.options ?? [])[oi] ?? `optie ${oi + 1}`}</strong>}
              </p>
            );
          })}
        </div>
      );
    }
    case 'upload':
      return <UploadAnswerLine ans={ans} />;
    case 'marktext': {
      const tokens = markTokens(q.text ?? '');
      const marked = Array.isArray(ans) ? (ans as unknown[]).filter((n): n is number => typeof n === 'number') : [];
      const missed = tokens.filter((t, i) => t.correct && !marked.includes(i));
      return (
        <div>
          {marked.length === 0
            ? <em className="hint">(niets gemarkeerd)</em>
            : marked.map((mi, k) => {
                const t = tokens[mi];
                const ok = !!t?.correct;
                return <span key={k} style={ok ? OK_CHIP : ERR_CHIP}>{ok ? <OkMark /> : <ErrMark />} {t?.word ?? '?'}</span>;
              })}
          {missed.length > 0 && (
            <p className="hint" style={{ margin: '4px 0 0' }}>gemist: {missed.map((t) => t.word).join(', ')}</p>
          )}
        </div>
      );
    }
    case 'sort': {
      const r = asRecord(ans);
      const cats = q.categories ?? [];
      const nameOf = (cid: unknown) => cats.find((c) => c.id === cid)?.name ?? '?';
      const items = q.items ?? [];
      if (items.length === 0) return <em className="hint">—</em>;
      return (
        <div>
          {items.map((it, i) => {
            const chosen = r?.[it.id];
            const ok = chosen === it.categoryId;
            return (
              <p key={it.id ?? i} style={{ margin: '2px 0' }}>
                {it.text}:{' '}
                <span style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>
                  {ok ? <OkMark /> : <ErrMark />} {typeof chosen === 'string' ? nameOf(chosen) : '(niet geplaatst)'}
                </span>
                {!ok && <span className="hint"> · juist: {nameOf(it.categoryId)}</span>}
              </p>
            );
          })}
        </div>
      );
    }
    case 'imagepoint': {
      const clicks = Array.isArray(ans)
        ? (ans as unknown[]).filter((p): p is { x: number; y: number } =>
            p !== null && typeof p === 'object' &&
            typeof (p as { x?: unknown }).x === 'number' && typeof (p as { y?: unknown }).y === 'number')
        : [];
      const targets = q.targets ?? [];
      // zelfde greedy zone-matching als de grader: één klik claimt hoogstens één zone
      const { claimed, markerHit } = matchMarkers(targets, clicks);
      const hits = claimed.size;
      return (
        <div>
          <p style={{ margin: '0 0 4px' }}>
            <span style={{ fontWeight: 600, color: targets.length > 0 && hits === targets.length ? 'var(--ok)' : 'var(--text-soft)' }}>
              {hits} van {targets.length} zones geraakt
            </span>
            <span className="hint"> · {clicks.length} {clicks.length === 1 ? 'klik' : 'klikken'}</span>
          </p>
          {q.image && (
            <span style={{ position: 'relative', display: 'inline-block', maxWidth: 280 }}>
              <img src={q.image} alt="" style={{ display: 'block', maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
              {targets.map((t, i) => (
                <ZoneCircle key={t.id ?? i} x={t.x} y={t.y} r={t.r} color="var(--ok)" dashed />
              ))}
              {clicks.map((c, i) => {
                const ok = markerHit[i] !== null;
                return (
                  <span key={i} style={{
                    position: 'absolute', left: `${c.x}%`, top: `${c.y}%`,
                    width: 11, height: 11, transform: 'translate(-50%, -50%)',
                    background: ok ? 'var(--ok)' : 'var(--err)',
                    border: '2px solid #fff', borderRadius: '50%',
                  }} />
                );
              })}
            </span>
          )}
        </div>
      );
    }
    case 'table': {
      const r = asRecord(ans);
      const cols = q.columns ?? [];
      const rows = q.rows ?? [];
      const cellStyle: React.CSSProperties = { border: '1px solid var(--line)', padding: '3px 8px', fontSize: '0.88rem' };
      const isOk = (accepted: string, given: string) => {
        if (normalizeAnswer(given) === '') return false;
        return accepted.split('|').some((a) => normalizeAnswer(a, q.caseSensitive) === normalizeAnswer(given, q.caseSensitive));
      };
      return (
        <div className="table-wrap" role="region" tabIndex={0} aria-label="Ingevulde tabel">
          <table style={{ borderCollapse: 'collapse' }}>
            {cols.length > 0 && (
              <thead>
                <tr>{cols.map((c, i) => <th key={i} scope="col" style={{ ...cellStyle, background: 'var(--bg-sunken)', textAlign: 'left' }}>{c}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, ri) => {
                const rowAns = asRecord(r?.[row.id]);
                return (
                  <tr key={row.id ?? ri}>
                    {(row.cells ?? []).map((cell, ci) => {
                      const accepted = row.answers?.[ci];
                      // vaste cel (ook een lege): geen verwacht antwoord ingesteld
                      if (accepted === null || accepted === undefined) return <td key={ci} style={cellStyle}>{cell}</td>;
                      const given = typeof rowAns?.[String(ci)] === 'string' ? (rowAns[String(ci)] as string) : '';
                      const ok = isOk(accepted, given);
                      return (
                        <td key={ci} style={{ ...cellStyle, color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>
                          {ok ? <OkMark /> : <ErrMark />} {given || '—'}
                          {!ok && accepted && <span className="hint" style={{ fontWeight: 400 }}> ({accepted.split('|')[0]})</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return <span>{formatAnswer(q, ans)}</span>;
  }
}

/** Detail + manuele beoordeling van één inzending. */
function SubmissionModal({ widget, submission, onClose }: { widget: Widget; submission: Submission; onClose: () => void }) {
  const toast = useToast();
  const isQuiz = QUIZ_FAMILY.has(widget.type);
  const [scores, setScores] = useState(submission.itemScores ?? {});
  const [feedback, setFeedback] = useState(submission.teacherFeedback ?? '');

  const questions = isQuiz ? (widget.config as QuizConfig).questions : [];
  const totalMax = submission.totalMax;
  const totalEarned = Object.values(scores).length > 0
    ? Math.round(Object.values(scores).reduce((a, s) => a + s.earned, 0) * 100) / 100
    : submission.totalEarned;

  const save = () => {
    const hasPending = Object.values(scores).some((s) => s.mode === 'pending');
    // actuele versie als basis nemen: de leerling kan ná het openen van deze
    // modal nog een foutenanalyse of doelreflectie bewaard hebben (zelfde toestel)
    const current = getSubmissions().find((x) => x.id === submission.id) ?? submission;
    saveSubmission({
      ...current,
      itemScores: Object.keys(scores).length > 0 ? scores : current.itemScores,
      totalEarned,
      status: hasPending ? 'submitted' : 'graded',
      teacherFeedback: feedback,
    });
    toast('Beoordeling bewaard', 'ok');
    onClose();
  };

  const drawing = (submission.answers as any)?.tekening;
  // De meta-antwoorden (_doelreflectie, _hints, …) hebben een vaste vorm, maar
  // kwamen soms uit een code of bestand: eerst saneren, dan tonen (S4). Zo
  // crasht het detail niet op een object als reflectie of getallen als hints,
  // ook niet bij inzendingen die al bewaard waren.
  const meta = useMemo(() => sanitizeMetaAnswers(submission.answers), [submission.answers]);

  return (
    <Modal title={`Inzending van ${submission.studentName}`} onClose={onClose} wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
          <button className="btn btn-primary" onClick={save}>Beoordeling bewaren</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {totalMax > 0 && <ScoreRing percent={pct(totalEarned, totalMax)} />}
        <div>
          <p style={{ margin: 0 }}><strong>Score:</strong> {totalEarned} / {totalMax || '—'}</p>
          <p style={{ margin: 0 }} className="hint">Ingediend: {formatDate(submission.submittedAt)} · duur {formatDuration(submission.durationSec)}</p>
          {submission.focusLosses !== undefined && (
            <p style={{ margin: '4px 0 0' }}>
              {submission.focusLosses > 0
                ? <span className="badge badge-warn"><EyeOff size={14} className="icon-inline" /> verliet het toetsvenster {submission.focusLosses}×</span>
                : <span className="badge badge-ok"><Shield size={14} className="icon-inline" /> bleef in het toetsvenster</span>}
            </p>
          )}
        </div>
      </div>

      {(() => {
        const fa = meta['_foutenanalyse'] as { volgendeKeer?: string } | undefined;
        const doel = meta['_doel'] as { proces?: string; streef?: number; vrij?: string } | undefined;
        const doelReflectie = meta['_doelreflectie'] as string | undefined;
        if (!fa?.volgendeKeer && !doel && !doelReflectie) return null;
        return (
          <div className="callout" style={{ marginBottom: 12 }}>
            <span aria-hidden><Brain size={18} /></span>
            <div>
              {doel && (
                <p style={{ margin: '0 0 4px' }}>
                  <strong>Doel van de leerling:</strong>{' '}
                  {[doel.proces, doel.streef ? `streefscore ${doel.streef}%` : '', doel.vrij].filter(Boolean).join(' · ')}
                </p>
              )}
              {doelReflectie && <p style={{ margin: '0 0 4px' }}><strong>Reflectie op het doel:</strong> “{doelReflectie}”</p>}
              {fa?.volgendeKeer && <p style={{ margin: 0 }}><strong>Voornemen na foutenanalyse:</strong> “{fa.volgendeKeer}”</p>}
            </div>
          </div>
        );
      })()}
      {isRenderableMedia(drawing) && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Palette size={20} /> Tekening</h3>
          <img src={drawing} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
        </div>
      )}

      {(() => {
        // markeringen in een pdf-bron (gesplitst werkblad met markeerstiften)
        const hls = meta['_sourceHighlights'];
        if (!Array.isArray(hls) || hls.length === 0) return null;
        const palette = (widget.config as Partial<SplitWorksheetConfig>)?.source?.highlightPalette ?? [];
        const labelFor = (color: string) => palette.find((p) => p.color === color)?.label?.trim();
        return (
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Highlighter size={20} /> Markeringen in de bron</h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(hls as PdfHighlight[]).map((h) => (
                <li key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <span
                    aria-hidden
                    style={{ width: 14, height: 14, borderRadius: 4, background: h.color, border: '1px solid var(--line)', flex: 'none', marginTop: 3 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {labelFor(h.color) && <strong>{labelFor(h.color)}: </strong>}
                    <span style={{ fontStyle: 'italic' }}>“{h.text || '(geen tekst)'}”</span>
                    <span className="hint"> — p. {h.page}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {isQuiz ? (
        <div>
          {questions
            .filter((q) => q.type !== 'info')
            // vragenpool: toon alleen vragen die deze leerling effectief kreeg
            .filter((q) => !submission.itemScores || q.id in submission.itemScores)
            .map((q, i) => {
            const ans = submission.answers[q.id];
            const score = scores[q.id] ?? gradeQuestion(q, ans);
            // manueel te beoordelen types: open vragen én ingeleverde bestanden
            const isOpen = q.type === 'long' || q.type === 'upload';
            const conf = eigenTekst(meta['_zekerheid'], q.id);
            // "_hints"-vorm: "vraagid" (1 hint) of "vraagid:2" (twee treden)
            const hintEntry = Array.isArray(meta['_hints'])
              ? (meta['_hints'] as unknown[]).find((h): h is string => typeof h === 'string' && (h === q.id || h.startsWith(q.id + ':')))
              : undefined;
            const hintLevel = hintEntry ? (hintEntry.includes(':') ? parseInt(hintEntry.split(':')[1], 10) || 1 : 1) : 0;
            const foutLabel = eigenTekst((meta['_foutenanalyse'] as { labels?: unknown } | undefined)?.labels, q.id);
            return (
              <div key={q.id} className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>V{i + 1}.</strong>
                  <span style={{ flex: 1 }}>
                    {q.prompt || (q.type === 'gap' || q.type === 'dropdown' ? 'Invuloefening' : q.type === 'marktext' ? 'Markeertekst' : '')}
                  </span>
                  {hintLevel > 0 && (
                    <span className="badge" title="Aantal geopende hints (hintladder)">
                      <TipIcon size={14} className="icon-inline" /> {hintLevel === 1 ? 'hint' : `${hintLevel} hints`}
                    </span>
                  )}
                  {foutLabel && Object.prototype.hasOwnProperty.call(FOUT_LABELS, foutLabel) && (
                    <span className="badge" title="Eigen foutenanalyse van de leerling">
                      {(() => { const { Icon, text } = FOUT_LABELS[foutLabel]; return <><Icon size={14} className="icon-inline" /> {text}</>; })()}
                    </span>
                  )}
                  {conf && (
                    <span
                      className={`badge ${conf === 'zeker' && score.earned < score.max && score.mode !== 'pending' ? 'badge-err' : ''}`}
                      title={conf === 'zeker' && score.earned < score.max ? 'Zeker maar fout: mogelijke misvatting' : 'Zelfinschatting van de leerling'}
                    >
                      {conf === 'zeker'
                        ? <><GoalIcon size={14} className="icon-inline" /> was zeker</>
                        : conf === 'twijfel'
                          ? <><HelpCircle size={14} className="icon-inline" /> twijfelde</>
                          : <><Dices size={14} className="icon-inline" /> gokte</>}
                    </span>
                  )}
                  <span className={`badge ${score.mode === 'pending' ? 'badge-warn' : score.earned >= score.max ? 'badge-ok' : score.earned > 0 ? 'badge-warn' : 'badge-err'}`}>
                    {score.mode === 'pending' ? 'na te kijken' : `${score.earned}/${score.max}`}
                  </span>
                </div>
                {RICH_TYPES.has(q.type) ? (
                  <div style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                    <ExtraAnswerView q={q} ans={ans} />
                  </div>
                ) : (
                  <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                    <strong>Antwoord:</strong> {formatAnswer(q, ans)}
                  </p>
                )}
                {q.type === 'long' && typeof ans === 'object' && ans !== null && (
                  <div style={{ marginTop: 6 }}>
                    {(ans as LongAnswerValue).tekening && (
                      <img src={(ans as LongAnswerValue).tekening} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: 320, width: '100%', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} />
                    )}
                    {(ans as LongAnswerValue).audio && (
                      <audio controls src={(ans as LongAnswerValue).audio} style={{ display: 'block', maxWidth: '100%', marginTop: 6 }} />
                    )}
                  </div>
                )}
                {q.type === 'long' && q.modelAnswer && (
                  <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: '0.88rem' }}>
                    <strong>Modelantwoord:</strong> {q.modelAnswer}
                  </p>
                )}
                {isOpen && (q.type === 'long' && (q.rubric ?? []).filter((r) => r.criterion.trim()).length > 0 ? (
                  <RubricGrader
                    rubric={(q.rubric ?? []).filter((r) => r.criterion.trim())}
                    maxPoints={q.points}
                    onScore={(earned, breakdown) => {
                      setScores((sc) => ({
                        ...sc,
                        [q.id]: { earned, max: q.points, mode: 'manual', comment: breakdown },
                      }));
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      Punten:
                      <input
                        className="input input-sm" type="number" min={0} max={q.points} step={0.5}
                        style={{ width: 80, marginLeft: 6 }}
                        value={score.mode === 'pending' ? '' : score.earned}
                        placeholder="?"
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Math.max(0, Math.min(q.points, parseFloat(e.target.value) || 0));
                          setScores((sc) => ({
                            ...sc,
                            [q.id]: v === null
                              ? { earned: 0, max: q.points, mode: 'pending' }
                              : { earned: v, max: q.points, mode: 'manual' },
                          }));
                        }}
                      />
                    </label>
                    <span className="hint">van {q.points}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        Object.keys(submission.answers).length > 0 && !drawing && (
          <div className="card card-pad">
            <h3>Details</h3>
            {Object.entries(submission.answers).map(([k, v]) => (
              <p key={k} style={{ margin: '4px 0' }}>
                <strong>{k}:</strong> {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </p>
            ))}
          </div>
        )
      )}

      {!isQuiz && Object.keys(scores).length > 0 && (
        // generieke manuele beoordeling voor widgets zonder vragenlijst (tekening, mindmap, …)
        <div style={{ marginTop: 8 }}>
          {Object.entries(scores)
            .filter(([, sc]) => sc.mode === 'pending' || sc.mode === 'manual')
            .map(([key, sc]) => (
              <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontWeight: 600 }}>
                  Punten voor {key === 'tekening' ? 'de tekening' : key === 'mindmap' ? 'de mindmap' : `“${key}”`}:
                  <input
                    className="input input-sm" type="number" min={0} max={sc.max} step={0.5}
                    style={{ width: 80, marginLeft: 6 }}
                    value={sc.mode === 'pending' ? '' : sc.earned}
                    placeholder="?"
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Math.max(0, Math.min(sc.max, parseFloat(e.target.value) || 0));
                      setScores((prev) => ({
                        ...prev,
                        [key]: v === null
                          ? { earned: 0, max: sc.max, mode: 'pending' }
                          : { earned: v, max: sc.max, mode: 'manual' },
                      }));
                    }}
                  />
                </label>
                <span className="hint">van {sc.max}</span>
              </div>
            ))}
        </div>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label htmlFor="teacher-feedback" style={{ flex: 1 }}>Feedback voor de leerling (optioneel)</label>
          {isQuiz && hasAIKey() && (
            <AIFeedbackSuggest
              widget={widget}
              questions={questions}
              submission={submission}
              scores={scores}
              onSuggest={(text) => setFeedback((cur) => (cur.trim() ? `${cur.trimEnd()}\n${text}` : text))}
            />
          )}
        </div>
        <textarea
          id="teacher-feedback" className="textarea" rows={3} value={feedback}
          placeholder="Tip: benoem wat al lukt, wat nog niet, en wat de volgende stap is — gericht op de taak."
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/**
 * Stelt met AI een taakgerichte feedbacktekst voor op basis van de antwoorden.
 * Bewust zonder leerlingnaam in de prompt; de leerkracht past het voorstel aan.
 */
function AIFeedbackSuggest({
  widget, questions, submission, scores, onSuggest,
}: {
  widget: Widget;
  questions: Question[];
  submission: Submission;
  scores: Record<string, { earned: number; max: number; mode: string }>;
  onSuggest: (text: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const suggest = async () => {
    setBusy(true);
    try {
      const rows = questions
        .filter((q) => q.type !== 'info')
        .map((q, i) => {
          const sc = scores[q.id];
          const answer = formatAnswer(q, (submission.answers as Record<string, unknown>)[q.id]).slice(0, 300);
          const expected =
            q.type === 'mc' ? q.options[q.correctIndex]
            : q.type === 'short' ? q.accepted[0]
            : q.type === 'long' ? q.modelAnswer ?? ''
            : '';
          return `${i + 1}. ${q.prompt.slice(0, 180)}${q.goal ? ` [doel: ${q.goal}]` : ''}\n   antwoord van de leerling: ${answer}${expected ? `\n   verwacht: ${String(expected).slice(0, 180)}` : ''}${sc ? `\n   score: ${sc.earned}/${sc.max}` : ''}`;
        })
        .join('\n');
      const text = await askAI({
        system:
          'Je helpt een Vlaamse leerkracht feedback schrijven. Schrijf taakgerichte feedback: wat lukt al, wat nog niet, en één concrete volgende stap. Spreek de leerling aan met "je". Vriendelijk en eerlijk, nooit een oordeel over de persoon, geen cijfers herhalen. 2 à 4 zinnen, gewone tekst zonder opmaak.',
        prompt: `Oefening: "${widget.title}". Antwoorden van de leerling:\n\n${rows}\n\nSchrijf nu de feedbacktekst.`,
        task: 'feedbacksuggestie',
        maxTokens: 400,
      });
      onSuggest(text.trim());
      toast('Voorstel klaar — pas gerust aan', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn btn-sm btn-ghost" onClick={suggest} disabled={busy}
      title="AI stelt een taakgerichte feedbacktekst voor; jij past aan en beslist">
      <AIIcon size={16} className={busy ? 'ai-pulse' : undefined} /> Stel feedback voor
    </button>
  );
}

/**
 * Resultaatcodes van leerlingen (thuiswerk via draagbare link) inlezen, met
 * dezelfde verwerking als het Inleverpunt (`processCodes`): elke code krijgt
 * een eerlijke uitkomst, en wat niet bij deze widget hoort of niet lukt,
 * verdwijnt niet stil. Werk voor een andere widget wordt bewaard (het is werk
 * van een leerling), en de melding zegt dat.
 */
function ResultCodeImportModal({
  widget, onClose, onDone,
}: { widget: Widget; onClose: () => void; onDone: (message: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const doImport = () => {
    const before = getSubmissions(widget.id).length;
    const report = processCodes(text);
    if (report.rows.length === 0) {
      setError('Geen codes gevonden. Een resultaatcode begint met WF1. — controleer of de volledige code geplakt is.');
      return;
    }
    const result = importOutcome(report, getSubmissions(widget.id).length - before);
    // Alles in één keer gelukt, en allemaal voor deze widget: kort melden en sluiten.
    if (result.clean) {
      onDone(`${result.saved} ${result.saved === 1 ? 'resultaat' : 'resultaten'} geïmporteerd`);
      onClose();
      return;
    }
    setOutcome(result);
  };

  return (
    <Modal
      title="Resultaatcodes plakken"
      onClose={onClose}
      footer={
        outcome ? (
          <button className="btn btn-primary" onClick={onClose}>Sluiten</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
            <button className="btn btn-primary" disabled={!text.trim()} onClick={doImport}>Importeren</button>
          </>
        )
      }
    >
      <p className="hint" style={{ marginBottom: 8 }}>
        Leerlingen die thuis via de draagbare link werkten, krijgen na het indienen een <strong>resultaatcode</strong>.
        Plak hier één of meerdere codes (gescheiden door een spatie of nieuwe regel) om ze aan deze resultaten toe te voegen.
      </p>
      <label htmlFor="resultaatcodes" className="sr-only">Resultaatcodes</label>
      <textarea
        id="resultaatcodes"
        className="textarea" rows={6}
        placeholder="WF1.…"
        value={text}
        readOnly={!!outcome}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
      />
      {error && <p role="alert" style={{ color: 'var(--err)', fontWeight: 600 }}>{error}</p>}
      {outcome && (
        <div className="callout warn" role="status" style={{ marginTop: 12, display: 'block' }}>
          <p style={{ margin: '0 0 6px' }}><strong>{outcome.summary}</strong></p>
          {outcome.elsewhere > 0 && (
            <p style={{ margin: '0 0 6px' }}>
              {outcome.elsewhere} {outcome.elsewhere === 1 ? 'resultaat hoort' : 'resultaten horen'} niet bij deze widget en
              {outcome.elsewhere === 1 ? ' is' : ' zijn'} bij de eigen widget of cursus bewaard.
            </p>
          )}
          {outcome.problems.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {outcome.problems.map((r) => (
                <li key={r.index}>
                  Code {r.index}{r.studentName ? ` (${r.studentName})` : ''}: {r.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Rubric-beoordeling: per criterium punten geven; totaal en verantwoording worden samengesteld. */
function RubricGrader({
  rubric, maxPoints, onScore,
}: {
  rubric: { criterion: string; points: number }[];
  maxPoints: number;
  onScore: (earned: number, breakdown: string) => void;
}) {
  const [vals, setVals] = useState<(number | null)[]>(rubric.map(() => null));

  const apply = (next: (number | null)[]) => {
    setVals(next);
    if (next.every((v) => v !== null)) {
      const raw = next.reduce((a: number, v) => a + (v ?? 0), 0);
      const earned = Math.min(maxPoints, Math.round(raw * 100) / 100);
      const breakdown = rubric.map((r, i) => `${r.criterion}: ${next[i]}/${r.points}`).join(' · ');
      onScore(earned, breakdown);
    }
  };

  const sum = vals.reduce((a: number, v) => a + (v ?? 0), 0);

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '0.88rem' }}>Beoordeel per criterium:</p>
      {rubric.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: '0.9rem' }}>{r.criterion}</span>
          <input
            className="input input-sm" type="number" min={0} max={r.points} step={0.5}
            style={{ width: 70 }}
            value={vals[i] === null ? '' : vals[i]!}
            placeholder="?"
            aria-label={`Punten voor: ${r.criterion}`}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Math.max(0, Math.min(r.points, parseFloat(e.target.value) || 0));
              const next = vals.slice();
              next[i] = v;
              apply(next);
            }}
          />
          <span className="hint">/ {r.points}</span>
        </div>
      ))}
      <p className="hint" aria-live="polite">
        {vals.every((v) => v !== null)
          ? <><OkMark /> Totaal: {Math.min(maxPoints, sum)} van {maxPoints}</>
          : 'Vul alle criteria in om de score toe te kennen.'}
      </p>
    </div>
  );
}

/** Verdeling over de antwoordopties: welke afleider koos de klas het vaakst? */
function DistractorBars({ q, subs }: { q: Question; subs: Submission[] }) {
  if (q.type !== 'mc' && q.type !== 'multi' && q.type !== 'tf') return null;
  const relevant = subs.filter((s) => !s.itemScores || q.id in s.itemScores);
  if (relevant.length === 0) return null;

  const rows: { label: string; correct: boolean; count: number }[] =
    q.type === 'tf'
      ? [true, false].map((v) => ({
          label: v ? 'Juist' : 'Onjuist',
          correct: q.answer === v,
          count: relevant.filter((s) => s.answers[q.id] === v).length,
        }))
      : q.options.map((opt, i) => ({
          label: opt || `Optie ${i + 1}`,
          correct: q.type === 'mc' ? q.correctIndex === i : q.correctIndices.includes(i),
          count: relevant.filter((s) => {
            const a = s.answers[q.id];
            return q.type === 'mc' ? a === i : Array.isArray(a) && (a as number[]).includes(i);
          }).length,
        }));

  const maxWrong = Math.max(0, ...rows.filter((r) => !r.correct).map((r) => r.count));
  const total = Math.max(1, relevant.length);

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}>
        Antwoordverdeling (distractor-analyse)
      </summary>
      <div style={{ paddingTop: 8 }}>
        {rows.map((r, i) => {
          const p = Math.round((r.count / total) * 100);
          const isTopDistractor = !r.correct && r.count > 0 && r.count === maxWrong && r.count >= Math.ceil(total / 4);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.86rem' }}>
              <span style={{ width: 18 }} aria-hidden>{r.correct ? <OkMark /> : ''}</span>
              <span style={{ flex: '0 0 40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <div className="bar" style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
                <div style={{ width: `${p}%`, height: '100%', background: r.correct ? 'var(--ok)' : 'var(--err)', opacity: r.correct ? 1 : 0.75 }} />
              </div>
              <span style={{ width: 70, textAlign: 'right', color: 'var(--text-soft)' }}>{r.count} ({p}%)</span>
              {isTopDistractor && (
                <span className="badge badge-warn" title="Deze afleider werd opvallend vaak gekozen — mogelijke misvatting">
                  <WarningIcon size={14} className="icon-inline" /> populair
                </span>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/**
 * Aggregatie per leerdoel + heatmap leerlingen × doelen.
 *
 * Een vraag hangt bij voorkeur aan een leerplandoel (goalCode): dat is de code
 * die overal in de app dezelfde betekenis heeft. Staat er geen code, dan valt
 * de vraag terug op de vrije doel-tag (goal), zodat oudere widgets blijven
 * rapporteren zoals voorheen. Beide soorten staan naast elkaar in dezelfde
 * tabel; bij een code tonen we de doeltekst uit het leerplan van de widget.
 */
interface GoalRow extends GoalRef {
  /** Wat de leerkracht leest. */
  label: string;
}

function goalRowsOf(questions: Question[], curriculumId?: string): GoalRow[] {
  const rows: GoalRow[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    const ref = goalRefOf(q, curriculumId);
    if (!ref || seen.has(ref.key)) continue;
    seen.add(ref.key);
    rows.push({ ...ref, label: ref.code ? goalLabel(ref.code, curriculumId) : (ref.tag ?? '') });
  }
  return rows;
}

function GoalStats({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  const questions = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
  const goals = goalRowsOf(questions, widget.curriculumId);
  if (goals.length === 0 || subs.length === 0) return null;

  // Score van één inzending voor één doel. Wat nog nagekeken moet worden telt
  // niet als 0 mee: de score is dan voorlopig (`pending`).
  const scoreFor = (s: Submission, key: string): { p: number | null; pending: boolean } => {
    let earned = 0, max = 0, pending = false;
    for (const q of questions) {
      if (goalRefOf(q, widget.curriculumId)?.key !== key) continue;
      if (s.itemScores && !(q.id in s.itemScores)) continue;
      const sc = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
      if (sc.mode === 'pending') { pending = true; continue; }
      earned += sc.earned; max += sc.max;
    }
    return { p: max > 0 ? Math.round((earned / max) * 100) : null, pending };
  };

  const cellColor = (p: number | null) =>
    p === null ? 'var(--bg-sunken)' : p >= 70 ? 'var(--ok-soft)' : p >= 45 ? 'var(--warn-soft)' : 'var(--err-soft)';
  const cellText = (p: number | null) =>
    p === null ? 'var(--text-faint)' : p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.08rem' }}><GoalIcon size={20} /> Beheersing per leerdoel</h2>
      {goals.map((g) => {
        const scores = subs.map((s) => scoreFor(s, g.key));
        const ps = scores.map((x) => x.p).filter((p): p is number => p !== null);
        const avg = ps.length > 0 ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
        const provisional = scores.some((x) => x.pending);
        return (
          <div key={g.key} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontWeight: 600, marginBottom: 3 }}>
              <span>
                {g.code && <span className="badge badge-brand" style={{ marginRight: 6 }}>leerplan</span>}
                {g.label}
              </span>
              <span style={{ color: avg === null ? 'var(--text-faint)' : cellText(avg) }}>
                {avg === null ? (provisional ? '— nog na te kijken' : '—') : `${avg}% gem.${provisional ? ' (voorlopig)' : ''}`}
              </span>
            </div>
            <div className="progressbar">
              <div style={{ width: `${avg ?? 0}%`, background: avg === null ? 'var(--text-faint)' : avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }} />
            </div>
          </div>
        );
      })}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-soft)' }}>
          Heatmap per leerling (voor klassenraad of remediëring)
        </summary>
        <div className="table-wrap" role="region" tabIndex={0} aria-label="Heatmap per leerling en leerdoel" style={{ marginTop: 8 }}>
          <table className="data" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th scope="col">Leerling</th>
                {goals.map((g) => <th key={g.key} scope="col" title={g.label}>{g.code ?? g.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ cursor: 'default' }}>
                  <th scope="row"><strong>{s.studentName}</strong></th>
                  {goals.map((g) => {
                    const { p, pending } = scoreFor(s, g.key);
                    return (
                      <td key={g.key} style={{ background: cellColor(p), color: cellText(p), fontWeight: 700, textAlign: 'center' }}>
                        {p === null ? (pending ? 'na te kijken' : '—') : `${p}%`}
                        {p !== null && pending && <span style={{ fontWeight: 500 }}> (voorlopig)</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Statistieken per vraag: hoeveel % juist. */
function QuestionStats({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  const questions = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
  const stats = useMemo(() => questions.map((q) => {
    let full = 0, partial = 0, zero = 0, pending = 0, got = 0;
    for (const s of subs) {
      // vragenpool: leerlingen die deze vraag niet kregen, tellen niet mee
      if (s.itemScores && !(q.id in s.itemScores)) continue;
      got++;
      const score = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
      if (score.mode === 'pending') pending++;
      else if (score.earned >= score.max && score.max > 0) full++;
      else if (score.earned > 0) partial++;
      else zero++;
    }
    return { q, full, partial, zero, pending, got };
  }), [widget.id, subs]);

  return (
    <div>
      <GoalStats widget={widget} subs={subs} />
      {stats.map(({ q, full, partial, zero, pending, got }, i) => {
        const total = Math.max(1, got);
        const okPct = Math.round((full / total) * 100);
        return (
          <div key={q.id} className="card" style={{ padding: '13px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>V{i + 1}.</strong>
              <span style={{ flex: 1 }}>{q.prompt || '(invuloefening)'}</span>
              <span className={`badge ${okPct >= 70 ? 'badge-ok' : okPct >= 40 ? 'badge-warn' : 'badge-err'}`}>{okPct}% helemaal juist</span>
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', marginTop: 10, background: 'var(--bg-sunken)' }}
              role="img" aria-label={`${full} juist, ${partial} deels, ${zero} fout, ${pending} nog na te kijken`}>
              <div style={{ width: `${(full / total) * 100}%`, background: 'var(--ok)' }} />
              <div style={{ width: `${(partial / total) * 100}%`, background: 'var(--warn)' }} />
              <div style={{ width: `${(zero / total) * 100}%`, background: 'var(--err)' }} />
              <div style={{ width: `${(pending / total) * 100}%`, background: 'var(--text-faint)' }} />
            </div>
            <div className="hint" style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <OkMark /> {full} juist · ◐ {partial} deels · <ErrMark /> {zero} fout
              {pending > 0 && <>· <ClipboardCheck size={14} className="icon-inline" /> {pending} na te kijken</>}
              {got < subs.length ? ` · (${got} van ${subs.length} leerlingen kreeg deze vraag)` : ''}
            </div>
            <DistractorBars q={q} subs={subs} />
            {(() => {
              // voorzichtige item-analyse: alleen signalen, alleen bij voldoende inzendingen
              const MIN_N = 8;
              if (got < MIN_N) return null;
              const relevant = subs.filter((s) => (!s.itemScores || q.id in s.itemScores) && s.totalMax > 0);
              if (relevant.length < MIN_N) return null;
              const correct = (s: Submission) => {
                const sc = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
                return sc.mode !== 'pending' && sc.max > 0 && sc.earned >= sc.max;
              };
              const sorted = relevant.slice().sort((a, b) => (b.totalEarned / b.totalMax) - (a.totalEarned / a.totalMax));
              const half = Math.floor(sorted.length / 2);
              const top = sorted.slice(0, half);
              const bottom = sorted.slice(sorted.length - half);
              const pTop = top.filter(correct).length / Math.max(1, top.length);
              const pBottom = bottom.filter(correct).length / Math.max(1, bottom.length);
              const p = full / got;
              let signal: string | null = null;
              if (pTop <= pBottom && p > 0.05 && p < 0.95) {
                signal = 'Sterk scorende leerlingen doen het hier niet beter dan de rest — bekijk deze vraag eens (dubbelzinnig? verkeerde sleutel?).';
              } else if (p < 0.2) {
                signal = 'Erg moeilijk voor deze groep — was de instructie of vraagstelling helder?';
              } else if (p > 0.92) {
                signal = 'Vrijwel iedereen juist — prima als opwarmer; als toetsvraag onderscheidt hij weinig.';
              }
              if (!signal) return null;
              return (
                <p className="hint" style={{ marginTop: 6 }}>
                  <SearchIcon size={14} className="icon-inline" /> <em>Signaal (n={got}):</em> {signal}
                </p>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

// ── Nakijkcockpit: per vraag verbeteren met feedbackbank ────────────────────

const FEEDBACKBANK_KEY = 'wf.feedbackbank.v1';

function getFeedbackbank(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACKBANK_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveFeedbackbank(list: string[]) {
  try { localStorage.setItem(FEEDBACKBANK_KEY, JSON.stringify(list.slice(0, 40))); } catch { /* best effort */ }
}

function GradingCockpit({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  // manueel na te kijken: open vragen én inleveropdrachten (upload → 'pending')
  const openQuestions = (widget.config as QuizConfig).questions
    .filter((q): q is LongQuestion | UploadQuestion => q.type === 'long' || q.type === 'upload');
  const [qid, setQid] = useState(openQuestions[0]?.id ?? '');
  const [bank, setBank] = useState<string[]>(getFeedbackbank);
  const toast = useToast();
  const q = openQuestions.find((x) => x.id === qid);

  if (!q) return <EmptyState icon={<CheckIcon size={40} />} title="Geen open vragen of inleveropdrachten om na te kijken" />;

  const rows = subs.filter((s) => !s.itemScores || q.id in s.itemScores);
  const rubric = q.type === 'long' ? (q.rubric ?? []).filter((r) => r.criterion.trim()) : [];

  return (
    <div>
      <div className="callout">
        <span aria-hidden><TipIcon size={18} /></span>
        <div>Per <strong>vraag</strong> verbeteren houdt je beoordelingskader constant: sneller én consistenter dan per leerling.</div>
      </div>
      <div className="field" style={{ maxWidth: 520 }}>
        <label htmlFor="nakijk-vraag">Na te kijken vraag</label>
        <select id="nakijk-vraag" className="select" value={qid} onChange={(e) => setQid(e.target.value)}>
          {openQuestions.map((oq, i) => (
            <option key={oq.id} value={oq.id}>
              {i + 1}. {oq.type === 'upload' ? '(bijlage) ' : ''}{oq.prompt.slice(0, 80)}
            </option>
          ))}
        </select>
        {q.type === 'long' && q.modelAnswer && (
          <span className="hint"><CourseIcon size={14} className="icon-inline" /> Modelantwoord: {q.modelAnswer}</span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<InboxIcon size={40} />} title="Nog geen inzendingen met deze vraag" />
      ) : (
        rows.map((s) => (
          <CockpitRow
            key={s.id}
            submission={s}
            question={q}
            rubric={rubric}
            bank={bank}
            onBankAdd={(text) => {
              const next = [text, ...bank.filter((b) => b !== text)];
              setBank(next);
              saveFeedbackbank(next);
              toast('Toegevoegd aan je feedbackbank', 'ok');
            }}
            onSaved={() => toast('Beoordeling bewaard', 'ok')}
          />
        ))
      )}
    </div>
  );
}

function CockpitRow({
  submission, question, rubric, bank, onBankAdd, onSaved,
}: {
  submission: Submission;
  question: LongQuestion | UploadQuestion;
  rubric: { criterion: string; points: number }[];
  bank: string[];
  onBankAdd: (text: string) => void;
  onSaved: () => void;
}) {
  const existing = submission.itemScores?.[question.id];
  const [points, setPoints] = useState<number | null>(existing && existing.mode !== 'pending' ? existing.earned : null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const answer = submission.answers[question.id];

  const save = () => {
    if (points === null) return;
    // actuele versie als basis: geen tussentijdse leerling-updates overschrijven
    const current = getSubmissions().find((x) => x.id === submission.id) ?? submission;
    const itemScores = { ...(current.itemScores ?? {}) };
    itemScores[question.id] = { earned: points, max: question.points, mode: 'manual', comment: comment.trim() || undefined };
    const totalEarned = Math.round(Object.values(itemScores).reduce((a, sc) => a + sc.earned, 0) * 100) / 100;
    const hasPending = Object.values(itemScores).some((sc) => sc.mode === 'pending');
    saveSubmission({ ...current, itemScores, totalEarned, status: hasPending ? 'submitted' : 'graded' });
    onSaved();
  };

  const graded = existing && existing.mode !== 'pending';

  return (
    <div className="card" style={{ padding: '13px 16px', marginBottom: 10, borderLeft: graded ? '4px solid var(--ok)' : '4px solid var(--warn)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <strong style={{ overflowWrap: 'anywhere' }}>{submission.studentName}</strong>
        {graded ? <span className="badge badge-ok"><OkMark /> {existing.earned}/{question.points}</span> : <span className="badge badge-warn">na te kijken</span>}
      </div>
      <div style={{ background: 'var(--bg-sunken)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
        {(() => {
          if (question.type === 'upload') {
            // inleveropdracht: bestandsnaam + grootte + downloadlink
            return <ExtraAnswerView q={question} ans={answer} />;
          }
          const lv: LongAnswerValue = typeof answer === 'string' ? { tekst: answer } : ((answer as LongAnswerValue) ?? {});
          if (!lv.tekst?.trim() && !lv.tekening && !lv.audio) {
            return <em style={{ color: 'var(--text-faint)' }}>(geen antwoord)</em>;
          }
          return (
            <>
              {lv.tekst?.trim() && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{lv.tekst}</p>}
              {lv.tekening && <img src={lv.tekening} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: 320, width: '100%', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', marginTop: lv.tekst ? 8 : 0 }} />}
              {lv.audio && <audio controls src={lv.audio} style={{ display: 'block', maxWidth: '100%', marginTop: 6 }} />}
            </>
          );
        })()}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
          Punten:
          <input
            className="input input-sm" type="number" min={0} max={question.points} step={0.5}
            style={{ width: 76, marginLeft: 6 }}
            value={points ?? ''}
            placeholder="?"
            onChange={(e) => setPoints(e.target.value === '' ? null : Math.max(0, Math.min(question.points, parseFloat(e.target.value) || 0)))}
          />
          <span className="hint"> / {question.points}</span>
        </label>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ position: 'relative' }}>
            <textarea
              className="textarea" rows={2}
              placeholder="Feedback: wat lukt al, wat nog niet, volgende stap…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {hasAIKey() && (() => {
              if (question.type === 'upload') return null; // bestandsinhoud gaat niet naar de AI
              const lv: LongAnswerValue = typeof answer === 'string' ? { tekst: answer } : ((answer as LongAnswerValue) ?? {});
              if (!lv.tekst?.trim()) return null;
              return (
                <CockpitAISuggest
                  question={question}
                  rubric={rubric}
                  studentText={lv.tekst}
                  onSuggest={(t) => setComment((c) => (c.trim() ? `${c.trimEnd()} ${t}` : t))}
                />
              );
            })()}
          </div>
          {rubric.length > 0 && (
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Rubric: {rubric.map((r) => `${r.criterion} (${r.points})`).join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {bank.slice(0, 8).map((b, i) => (
              <button key={i} className="chip" style={{ padding: '2px 10px', fontSize: '0.8rem' }}
                title="Invoegen in de feedback"
                onClick={() => setComment((c) => (c ? c + ' ' + b : b))}>
                {b.length > 42 ? b.slice(0, 40) + '…' : b}
              </button>
            ))}
            {comment.trim() && !bank.includes(comment.trim()) && (
              <button className="btn btn-sm btn-quiet" onClick={() => onBankAdd(comment.trim())}>
                <AddIcon size={14} /> Bewaar in feedbackbank
              </button>
            )}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={points === null} onClick={save}>
          <CheckIcon size={16} /> Bewaren
        </button>
      </div>
    </div>
  );
}

/** AI-voorstel voor taakgerichte feedback op één open antwoord (nakijkcockpit). */
function CockpitAISuggest({
  question, rubric, studentText, onSuggest,
}: {
  question: Question;
  rubric: { criterion: string; points: number }[];
  studentText: string;
  onSuggest: (text: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const suggest = async () => {
    setBusy(true);
    try {
      const model = question.type === 'long' ? question.modelAnswer : undefined;
      const text = await askAI({
        system:
          'Je helpt een Vlaamse leerkracht feedback schrijven op één open antwoord. Taakgericht: wat zit al goed, wat ontbreekt of klopt niet, en één concrete tip. Spreek de leerling aan met "je". 1 à 3 zinnen, gewone tekst zonder opmaak, geen punten of cijfers noemen.',
        prompt: `Vraag: ${question.prompt.slice(0, 300)}\n${model ? `Modelantwoord (alleen voor jou): ${model.slice(0, 300)}\n` : ''}${rubric.length ? `Criteria: ${rubric.map((r) => r.criterion).join(' · ')}\n` : ''}\nAntwoord van de leerling:\n${studentText.slice(0, 900)}\n\nSchrijf nu de feedbacktekst.`,
        task: 'feedbacksuggestie',
        maxTokens: 250,
      });
      onSuggest(text.trim());
      toast('Voorstel ingevoegd — pas gerust aan', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="btn btn-sm btn-quiet"
      style={{ position: 'absolute', right: 6, bottom: 6 }}
      onClick={suggest}
      disabled={busy}
      title="AI stelt feedback voor op dit antwoord; jij past aan en beslist"
      aria-label="AI-feedbackvoorstel voor dit antwoord"
    >
      <AIIcon size={16} className={busy ? 'ai-pulse' : undefined} />
    </button>
  );
}
