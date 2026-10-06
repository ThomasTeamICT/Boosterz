import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Clock, Mail, PartyPopper, Puzzle } from 'lucide-react';
import type { Course, CourseProgress } from '../lib/courseTypes';
import { allSections, progressPercent } from '../lib/courseTypes';
import {
  decodeCourseProgress, deleteStudentProgress, getCourse, getCourseProgressAll, importProgressCode,
} from '../lib/courses';
import { getSubmissions, getWidget, onStorageChange } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import { type ChapterExerciseGroup, filterChapterGroups, groupWidgetIdsByChapter } from '../lib/courseTrack';
import { downloadFile, formatDate, formatDuration, pct } from '../lib/utils';
import { ConfirmModal, EmptyState, Modal, useToast } from '../components/ui';
import { TypeTile } from '../components/TypeTile';
import { awaitingCount, courseProgressCsv, CSV_MIME, groupSubmissionsByWidget } from '../components/results/resultsHelpers';
import {
  AssignIcon, CheckIcon, DeleteIcon, DownloadIcon, EditIcon, InfoIcon, ResultsIcon, SearchIcon,
} from '../components/icons';
import type { Submission } from '../lib/types';
import '../styles/cursus.css';
import '../styles/opvolgen.css';

export function CourseTrackPage() {
  const { id } = useParams();
  const [tick, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  const course = useMemo(() => (id ? getCourse(id) : undefined), [id, tick]);
  const progress = useMemo(
    () => (course ? [...getCourseProgressAll(course.id)].sort((a, b) => a.studentName.localeCompare(b.studentName, 'nl')) : []),
    [course, tick]
  );
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CourseProgress | null>(null);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const toast = useToast();

  // Oefeningen per hoofdstuk, in cursusvolgorde, gefilterd op het zoekveld.
  const chapterGroups = useMemo(() => (course ? groupWidgetIdsByChapter(course) : []), [course]);
  const filteredGroups = useMemo(
    () => filterChapterGroups(chapterGroups, exerciseQuery, (wid) => getWidget(wid)?.title),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterGroups, exerciseQuery, tick]
  );
  // Alle inzendingen één keer lezen en per widget groeperen: elk hoofdstuk en
  // elke oefening opnieuw laten lezen, ontleedt de hele lijst telkens opnieuw.
  const subsByWidget = useMemo(
    () => groupSubmissionsByWidget(getSubmissions()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  if (!course) {
    return (
      <div className="page page-narrow" style={{ paddingTop: 60 }}>
        <EmptyState level={1} icon={<ResultsIcon size={40} />} title="Cursus niet gevonden">
          <Link to="/cursussen" className="btn btn-primary">Naar de cursussen</Link>
        </EmptyState>
      </div>
    );
  }

  const sections = allSections(course);
  const avg = progress.length
    ? Math.round(progress.reduce((a, p) => a + progressPercent(course, p), 0) / progress.length)
    : 0;
  const complete = progress.filter((p) => progressPercent(course, p) === 100).length;
  const totalSeconds = progress.reduce(
    (a, p) => a + Object.values(p.sections).reduce((x, s) => x + (s.secondsSpent || 0), 0),
    0
  );

  // Met BOM en tekenset (zodat Excel de letters goed leest) en veilige cellen (csvCell).
  const exportCsv = () => {
    downloadFile(`voortgang - ${course.title}.csv`, courseProgressCsv(course, progress), CSV_MIME);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ResultsIcon size={24} /> {course.title}</h1>
          <p className="sub">Leesvoortgang per leerling en per sectie — transparant: de leerling ziet zelf exact hetzelfde.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={exportCsv} disabled={progress.length === 0}><DownloadIcon size={16} /> CSV</button>
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}><Mail size={16} /> Voortgangscodes invoeren</button>
          <Link to={`/cursus/bewerk/${course.id}`} className="btn btn-primary"><EditIcon size={16} /> Bewerken</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 20 }}>
        {[
          { icon: AssignIcon, label: 'lezers', value: String(progress.length) },
          { icon: ResultsIcon, label: 'gemiddelde voortgang', value: `${avg}%` },
          { icon: PartyPopper, label: 'volledig afgewerkt', value: String(complete) },
          { icon: Clock, label: 'totale leestijd', value: formatDuration(totalSeconds) },
        ].map((s) => (
          <div key={s.label} className="card card-pad" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--brand)' }} aria-hidden><s.icon size={26} /></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{s.value}</div>
            <div className="hint">{s.label}</div>
          </div>
        ))}
      </div>

      {progress.length === 0 ? (
        <EmptyState icon={<Clock size={40} />} title="Nog geen lezers">
          <p>
            Zodra leerlingen op dit toestel (of via de klascode in deze browser) lezen, verschijnt hun
            voortgang hier. Lezen ze thuis via de draagbare link? Laat hen dan hun
            <strong> voortgangscode</strong> doorsturen en voer die hierboven in.
          </p>
        </EmptyState>
      ) : (
        <>
          <div
            className="card" style={{ overflowX: 'auto', marginBottom: 20, position: 'relative' }}
            role="region" tabIndex={0} aria-label="Leesvoortgang per leerling en sectie"
          >
            <table className="data" style={{ minWidth: 640, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col" rowSpan={2} style={{ position: 'sticky', left: 0, background: 'var(--bg-raised)', zIndex: 1, textAlign: 'left', padding: '8px 12px' }}>
                    Leerling
                  </th>
                  {/* Een hoofdstuk zonder secties krijgt geen kolomkop: colSpan 0 geldt als 1 en schuift alle koppen op. */}
                  {course.chapters.filter((ch) => ch.sections.length > 0).map((ch) => (
                    <th key={ch.id} scope="colgroup" colSpan={ch.sections.length} style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)', fontSize: '0.82rem' }}>
                      {ch.emoji} {ch.title}
                    </th>
                  ))}
                  <th scope="col" rowSpan={2} style={{ padding: '6px 10px' }}>%</th>
                  <th scope="col" rowSpan={2} style={{ padding: '6px 10px' }}>Laatst gezien</th>
                  <th scope="col" rowSpan={2}><span className="sr-only">Acties</span></th>
                </tr>
                <tr>
                  {sections.map(({ section }) => (
                    <th
                      key={section.id}
                      scope="col"
                      title={`${section.title}${section.optional ? ' (keuzesectie)' : ''}`}
                      style={{ padding: '4px 6px', fontSize: '0.75rem', fontWeight: 500, color: section.optional ? 'var(--text-faint)' : 'var(--text-soft)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {section.title}{section.optional ? ' ◇' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.studentName} style={{ borderTop: '1px solid var(--line)', cursor: 'default' }}>
                    <th scope="row" style={{ position: 'sticky', left: 0, background: 'var(--bg-raised)', fontWeight: 600, padding: '7px 12px', whiteSpace: 'nowrap', textAlign: 'left' }}>
                      {p.studentName}
                    </th>
                    {sections.map(({ section }) => {
                      const sp = p.sections[section.id];
                      const state = sp?.completedAt ? 'done' : sp ? 'open' : 'none';
                      return (
                        <td key={section.id} style={{ textAlign: 'center', padding: '6px 4px' }}
                          title={
                            state === 'done'
                              ? `Gelezen op ${formatDate(sp!.completedAt!)} · leestijd ${formatDuration(sp!.secondsSpent)}`
                              : state === 'open'
                                ? `Geopend · leestijd ${formatDuration(sp!.secondsSpent)}`
                                : 'Nog niet geopend'
                          }
                        >
                          <span aria-hidden>
                            {state === 'done' ? <CheckIcon size={14} className="icon-inline" style={{ color: 'var(--ok)' }} /> : state === 'open' ? '◐' : '·'}
                          </span>
                          <span className="sr-only">{state === 'done' ? 'gelezen' : state === 'open' ? 'geopend' : 'nog niet geopend'}</span>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 700, padding: '6px 10px' }}>{progressPercent(course, p)}%</td>
                    <td style={{ whiteSpace: 'nowrap', padding: '6px 10px' }} className="hint">{formatDate(p.lastSeenAt)}</td>
                    <td style={{ padding: '4px 6px' }}>
                      <button
                        className="btn btn-sm btn-quiet btn-icon"
                        aria-label={`Voortgang van ${p.studentName} verwijderen`}
                        title="Voortgang verwijderen"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <DeleteIcon size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.08rem' }}>Waar zit de klas? (per sectie)</h2>
            <p className="hint" style={{ marginTop: -6 }}>
              Leestijd is context, geen oordeel — snel lezen kan grondig zijn, traag lezen zorgvuldig.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {sections.map(({ chapter, section }) => {
                const done = progress.filter((p) => p.sections[section.id]?.completedAt).length;
                const opened = progress.filter((p) => p.sections[section.id]).length;
                const pctDone = progress.length ? Math.round((done / progress.length) * 100) : 0;
                const times = progress.map((p) => p.sections[section.id]?.secondsSpent ?? 0).filter((t) => t > 0);
                const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
                return (
                  <div key={section.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 300px) minmax(40px, 1fr) auto', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${chapter.title} › ${section.title}`}>
                      {section.title}{section.optional && <span className="hint"> ◇ keuze</span>}
                    </span>
                    <div style={{ background: 'var(--bg-sunken)', borderRadius: 99, height: 14, overflow: 'hidden' }}
                      role="img" aria-label={`${done} van ${progress.length} leerlingen lazen "${section.title}"`}>
                      <div style={{ width: `${pctDone}%`, height: '100%', background: 'var(--ok)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <span className="hint" style={{ textAlign: 'right' }}>
                      {done}<CheckIcon size={12} className="icon-inline" /> / {opened}◐{avgTime > 0 && ` (gem. ${formatDuration(avgTime)})`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {chapterGroups.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Puzzle size={20} /> Oefeningen per hoofdstuk
            </h2>
            <div className="course-search" style={{ marginLeft: 'auto', maxWidth: 240 }}>
              <SearchIcon size={16} aria-hidden />
              <input
                className="input input-sm"
                value={exerciseQuery}
                onChange={(e) => setExerciseQuery(e.target.value)}
                placeholder="Zoek op titel…"
                aria-label="Zoek een oefening op titel"
              />
            </div>
          </div>
          {filteredGroups.length === 0 ? (
            <p className="hint">Geen oefening gevonden voor “{exerciseQuery}”.</p>
          ) : (
            filteredGroups.map((group) => <ChapterExerciseDetails key={group.chapter.id} group={group} subsByWidget={subsByWidget} />)
          )}
        </div>
      )}

      <p className="hint" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <InfoIcon size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <span>
          Eerlijk over de werking: voortgang wordt per toestel/browser bijgehouden. Leerlingen die
          thuis via de draagbare link lezen, sturen hun <strong>voortgangscode</strong> door (die vinden
          ze in de cursus zelf). Er is geen verborgen tracking — de leerling ziet exact wat jij ziet.
        </span>
      </p>

      {importOpen && (
        <ProgressImportModal
          course={course}
          onClose={() => setImportOpen(false)}
          onDone={(report) => toast(report, report.includes('ingevoerd') ? 'ok' : 'err')}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Voortgang verwijderen?"
          message={`De leesvoortgang van ${deleteTarget.studentName} voor deze cursus wordt definitief verwijderd.`}
          onConfirm={() => deleteStudentProgress(course.id, deleteTarget.studentName)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Eén hoofdstuk met zijn oefeningen, inklapbaar ────────────────────────────

function ChapterExerciseDetails({
  group, subsByWidget,
}: { group: ChapterExerciseGroup; subsByWidget: Map<string, Submission[]> }) {
  const rows = group.widgetIds
    .map((wid) => getWidget(wid))
    .filter((w): w is NonNullable<ReturnType<typeof getWidget>> => Boolean(w))
    .map((w) => {
      const subs = subsByWidget.get(w.id) ?? [];
      const scored = subs.filter((s) => s.totalMax > 0);
      const avgScore = scored.length
        ? Math.round(scored.reduce((a, s) => a + pct(s.totalEarned, s.totalMax), 0) / scored.length)
        : null;
      // wat nog nagekeken moet worden staat als 0 in de score: het gemiddelde is dan voorlopig
      return { widget: w, subs, avgScore, provisional: awaitingCount(subs) > 0 };
    });
  const totalSubs = rows.reduce((a, r) => a + r.subs.length, 0);
  const scoredRows = rows.filter((r): r is typeof r & { avgScore: number } => r.avgScore !== null);
  const avgAll = scoredRows.length
    ? Math.round(scoredRows.reduce((a, r) => a + r.avgScore, 0) / scoredRows.length)
    : null;

  return (
    <details className="chapter-track" open={totalSubs > 0}>
      <summary>
        <ChevronRight size={16} className="chevron" aria-hidden />
        <span>{group.chapter.emoji ? `${group.chapter.emoji} ` : ''}{group.chapter.title}</span>
        <span className="chapter-track-summary">
          {rows.length} oefening{rows.length === 1 ? '' : 'en'} · {totalSubs} inzending{totalSubs === 1 ? '' : 'en'}
          {avgAll !== null && ` · gem. ${avgAll}%${rows.some((r) => r.provisional) ? ' (voorlopig)' : ''}`}
        </span>
      </summary>
      <div className="chapter-track-body" style={{ display: 'grid', gap: 8 }}>
        {rows.map(({ widget, subs, avgScore, provisional }) => {
          const def = getTypeDef(widget.type);
          return (
            <div key={widget.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <TypeTile type={def} size="sm" />
              <strong style={{ flex: '1 1 200px' }}>{widget.title}</strong>
              <span className="hint">
                {subs.length} inzending{subs.length === 1 ? '' : 'en'}{avgScore !== null && ` · gem. ${avgScore}%${provisional ? ' (voorlopig)' : ''}`}
              </span>
              {def.hasSubmissions && (
                <Link to={`/resultaten/${widget.id}`} className="btn btn-sm btn-ghost">
                  <ResultsIcon size={14} /> Resultaten
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ProgressImportModal({
  course, onClose, onDone,
}: { course: Course; onClose: () => void; onDone: (report: string) => void }) {
  const [text, setText] = useState('');

  const doImport = () => {
    const codes = text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    let ok = 0;
    let invalid = 0;
    let other = 0;
    for (const code of codes) {
      const p = decodeCourseProgress(code);
      if (!p) { invalid++; continue; }
      if (p.courseId !== course.id && p.courseCode !== course.code) { other++; continue; }
      importProgressCode(p);
      ok++;
    }
    const parts = [`${ok} ingevoerd`];
    if (invalid) parts.push(`${invalid} ongeldig`);
    if (other) parts.push(`${other} hoorde bij een andere cursus`);
    onDone(parts.join(', '));
    onClose();
  };

  return (
    <Modal
      title="Voortgangscodes invoeren"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={doImport}>Invoeren</button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Leerlingen die thuis lazen, vinden hun voortgangscode (begint met <code>WFC1.</code>) in de
        cursus. Plak hier één of meerdere codes — gescheiden door spaties of nieuwe regels.
      </p>
      <textarea
        className="textarea" rows={6} value={text} autoFocus
        onChange={(e) => setText(e.target.value)}
        placeholder="WFC1.…"
        aria-label="Voortgangscodes"
      />
    </Modal>
  );
}
