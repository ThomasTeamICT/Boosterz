import { lazy, Suspense, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Course, CourseChapter, CourseSection } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import type { Widget } from '../../lib/types';
import { computeCoverage, geplandeRijen, type CoverageRow } from '../../lib/coverage';
import { getCurriculum } from '../../lib/curriculum';
import { FOUT_LADEN_DEKKING, geplandeRegel, leerplanHeeftVerwijzingen } from '../../lib/dekkingWeergave';
import { EmptyState } from '../ui';
import {
  AIIcon, CheckIcon, CloseIcon, GoalIcon, PlannedIcon, RetryIcon, SettingsIcon, TipIcon, WarningIcon,
} from '../icons';
import { Puzzle } from 'lucide-react';
import '../../styles/dekking.css';

// De weergave "Minimumdoelen" is zwaar (matrix, kader en setbestanden) en staat in een eigen chunk, zodat de cursuseditor klein
// blijft. We laden hem eerst los in (`laadDekking`): lukt dat niet (offline), dan blijft de weergave "Leerplan" staan met een melding,
// in plaats van dat de editor met een fout vervangen wordt. Een tweede klik helpt dan niet: de browser onthoudt de mislukte
// dynamische import en doet geen nieuw verzoek. Daarom nodigt de melding uit om de pagina te herladen (de editor bewaart
// automatisch en vraagt bevestiging bij niet-bewaarde wijzigingen).
const laadDekking = () => import('./MinimumdoelenDekking');
const MinimumdoelenDekking = lazy(() => laadDekking().then((m) => ({ default: m.MinimumdoelenDekking })));

// ── Doelendekking ───────────────────────────────────────────────────────────
//
// Paneelinhoud (wordt door de editor in een brede Modal gezet) die in één
// oogopslag toont welke leerplandoelen waar gedekt zijn en welke secties
// nog geen doel dragen. Puur presentatie — er wordt niets opgeslagen.

interface GoalRow {
  /** Sleutel voor deduplicatie (getrimd + kleine letters). */
  key: string;
  /** Eerst geziene schrijfwijze — zo tonen we het doel. */
  label: string;
  /** Per hoofdstuk-id: de titels van de secties die dit doel dragen. */
  perChapter: Map<string, string[]>;
  /** Komt het doel in minstens één niet-optionele sectie voor? */
  inCore: boolean;
}

interface MissingGroup {
  chapter: CourseChapter;
  sections: CourseSection[];
}

function shortTitle(title: string, max = 14): string {
  const t = title.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function GoalCoverage({
  course, curriculum, widgets = [], onFillGaps, onOpenSettings,
}: {
  course: Course;
  /** Leerplan van de cursus; aanwezig = matrix op leerplandoelen. */
  curriculum?: Curriculum;
  /** Widgets van dit toestel — de ingebedde exemplaren tellen mee. */
  widgets?: Widget[];
  /** "Vul de hiaten": opent de optimalisatie met de niet-gedekte doelen. */
  onFillGaps?: () => void;
  /** Opent de cursusinstellingen — voor "Koppel een leerplan" zonder leerplan. */
  onOpenSettings?: () => void;
}): JSX.Element {
  if (curriculum) {
    return (
      <CurriculumCoverage course={course} curriculum={curriculum} widgets={widgets} onFillGaps={onFillGaps} />
    );
  }
  return <FreeTextCoverage course={course} onOpenSettings={onOpenSettings} />;
}

// ── Matrix op leerplandoelen (cursus met curriculumId) ──────────────────────

const STATUS_META: Record<CoverageRow['status'], { icon: typeof CheckIcon; label: string; badge: string }> = {
  covered: { icon: CheckIcon, label: 'gedekt', badge: 'badge badge-ok' },
  optional: { icon: WarningIcon, label: 'alleen in verdieping', badge: 'badge badge-warn' },
  missing: { icon: CloseIcon, label: 'niet gedekt', badge: 'badge badge-err' },
};

function CurriculumCoverage({
  course, curriculum, widgets, onFillGaps,
}: {
  course: Course;
  curriculum: Curriculum;
  widgets: Widget[];
  onFillGaps?: () => void;
}): JSX.Element {
  const result = useMemo(() => computeCoverage(course, curriculum, widgets), [course, curriculum, widgets]);
  // Doelen die alleen op nog lege secties staan: gepland, nog niet uitgewerkt (§ 14.5).
  const aantalGepland = useMemo(() => geplandeRijen(result, course, widgets).length, [result, course, widgets]);
  const metVerwijzingen = useMemo(() => leerplanHeeftVerwijzingen(curriculum), [curriculum]);
  const [weergave, setWeergave] = useState<'leerplan' | 'minimumdoelen'>('leerplan');
  const [laadt, setLaadt] = useState(false);
  const [laadFout, setLaadFout] = useState(false);

  const kies = (volgende: 'leerplan' | 'minimumdoelen') => {
    setLaadFout(false);
    if (volgende === 'leerplan') {
      setWeergave('leerplan');
      return;
    }
    if (laadt) return;
    setLaadt(true);
    laadDekking().then(
      () => { setLaadt(false); setWeergave('minimumdoelen'); },
      () => { setLaadt(false); setLaadFout(true); },
    );
  };

  const sticky: CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'var(--bg-raised)',
    zIndex: 1,
    textAlign: 'left',
    padding: '7px 12px',
  };

  if (result.total === 0) {
    return (
      <EmptyState icon={<GoalIcon size={40} />} title="Dit leerplan bevat nog geen doelen">
        <p>Vul het leerplan aan, dan verschijnt hier de dekking van je cursus.</p>
        <Link to="/leerplannen" className="btn btn-primary"><GoalIcon size={16} /> Naar Leerplannen</Link>
      </EmptyState>
    );
  }

  // De schakelaar staat er alleen als het leerplan doelen met verwijzingen naar minimumdoelen heeft: zonder is er niets om te meten.
  const schakelaar = metVerwijzingen && (
    <>
      <div className="dk-schakelaar" role="group" aria-label="Weergave van de dekking">
        <button
          type="button" className={`btn btn-sm ${weergave === 'leerplan' ? 'btn-primary' : 'btn-ghost'}`}
          aria-pressed={weergave === 'leerplan'} onClick={() => kies('leerplan')}
        >
          {weergave === 'leerplan' && <CheckIcon size={16} aria-hidden />} Leerplan
        </button>
        <button
          type="button" className={`btn btn-sm ${weergave === 'minimumdoelen' ? 'btn-primary' : 'btn-ghost'}`}
          aria-pressed={weergave === 'minimumdoelen'} aria-busy={laadt || undefined} onClick={() => kies('minimumdoelen')}
        >
          {weergave === 'minimumdoelen' && <CheckIcon size={16} aria-hidden />} Minimumdoelen
        </button>
      </div>
      {laadt && <p className="dk-schakel-bezig" role="status">De dekking op de minimumdoelen wordt geladen…</p>}
      {laadFout && (
        <div className="callout err dk-melding" role="alert">
          <WarningIcon size={16} aria-hidden />
          <div className="dk-melding-tekst">
            <p>{FOUT_LADEN_DEKKING}</p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.location.reload()}>
              <RetryIcon size={16} aria-hidden /> Herlaad de pagina
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (metVerwijzingen && weergave === 'minimumdoelen') {
    return (
      <div>
        {schakelaar}
        <Suspense fallback={<p className="dk-laden" role="status">De dekking op de minimumdoelen wordt geladen…</p>}>
          <MinimumdoelenDekking course={course} curriculum={curriculum} widgets={widgets} />
        </Suspense>
      </div>
    );
  }

  return (
    <div>
      {schakelaar}
      <p style={{ marginTop: 0 }} aria-live="polite">
        <strong>{result.summary}</strong>{' '}
        <span className="hint">
          Leerplan: {curriculum.title}
          {curriculum.example ? ' (voorbeeld)' : ''}
        </span>
      </p>

      {aantalGepland > 0 && (
        <p className="hint" style={{ margin: '-6px 0 12px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <PlannedIcon size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
          <span>{geplandeRegel(aantalGepland)}</span>
        </p>
      )}

      {result.uncovered.length > 0 && onFillGaps && (
        <p style={{ margin: '0 0 12px' }}>
          <button className="btn btn-sm btn-ai" onClick={onFillGaps}><AIIcon size={16} /> Vul de hiaten</button>{' '}
          <span className="hint">De AI maakt nieuwe secties voor de doelen die nog niet aan bod komen.</span>
        </p>
      )}

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }} role="region" tabIndex={0} aria-label="Dekking per leerplandoel en hoofdstuk">
        <table className="data" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...sticky, minWidth: 240 }}>Leerplandoel</th>
              {course.chapters.map((ch) => (
                <th
                  key={ch.id}
                  scope="col"
                  title={ch.title}
                  style={{ padding: '7px 8px', fontSize: '0.82rem', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' }}
                >
                  {ch.emoji ? `${ch.emoji} ` : ''}{shortTitle(ch.title)}
                </th>
              ))}
              <th scope="col" style={{ padding: '7px 8px', fontSize: '0.82rem', borderBottom: '1px solid var(--line)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <tr key={row.goal.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <th scope="row" style={{ ...sticky, fontWeight: 600, fontSize: '0.86rem' }}>
                    <span style={{ fontFamily: 'monospace' }}>{row.goal.code}</span>{' '}
                    <span style={{ fontWeight: 500 }}>{row.goal.text}</span>
                    {row.goal.level === 'uitbreiding' && <span className="badge" style={{ marginLeft: 6 }}>uitbreiding</span>}
                  </th>
                  {course.chapters.map((ch) => {
                    const secs = row.sections.filter((s) => s.chapterId === ch.id);
                    const wids = row.widgets.filter((w) => ch.sections.some((se) => se.id === w.sectionId));
                    const titles = [
                      ...secs.map((s) => (s.optional ? `${s.sectionTitle} ◇` : s.sectionTitle)),
                      ...wids.map((w) => `Oefening: ${w.title}`),
                    ];
                    return (
                      <td
                        key={ch.id}
                        style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}
                        title={titles.length > 0 ? titles.join(' · ') : undefined}
                        aria-label={
                          titles.length > 0
                            ? `${titles.length} plaats(en) met dit doel in “${ch.title}”: ${titles.join(', ')}`
                            : `Dit doel komt niet voor in “${ch.title}”`
                        }
                      >
                        {secs.length > 0 ? secs.length : ''}
                        {wids.length > 0 && <Puzzle size={12} aria-hidden style={{ verticalAlign: 'middle', marginLeft: 2 }} />}
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <span className={meta.badge}><meta.icon size={13} /> {meta.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.uncovered.length > 0 ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nog niet gedekt ({result.uncovered.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.uncovered.map((row) => (
              <li key={row.goal.id} style={{ fontSize: '0.9rem', marginBottom: 3 }}>
                <strong style={{ fontFamily: 'monospace' }}>{row.goal.code}</strong> {row.goal.text}
                {row.status === 'optional' && <span className="hint"> — staat enkel in een keuzesectie ◇</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckIcon size={16} aria-hidden /> Alle doelen van dit leerplan komen aan bod in een gewone sectie.</p>
      )}

      {result.sectionsWithoutCode.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Secties zonder doelcode ({result.sectionsWithoutCode.length})</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Koppel een code bij de sectie-instellingen: die voedt de dekking, de heatmaps én het
            klasoverzicht per leerling.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.sectionsWithoutCode.map((s) => (
              <li key={s.sectionId} style={{ fontSize: '0.9rem' }}>
                {s.chapterTitle} › {s.sectionTitle}{s.optional && <span className="hint"> ◇ keuzesectie</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.unknownCodes.length > 0 && (
        <p className="callout warn" role="status">
          <WarningIcon size={16} aria-hidden /> Deze codes staan wel in de cursus, maar niet in dit leerplan:{' '}
          <strong>{result.unknownCodes.join(', ')}</strong>. Pas ze aan of voeg ze toe aan je{' '}
          <Link to="/leerplannen">leerplan</Link>.
        </p>
      )}

      {result.otherCurriculumWidgets.length > 0 && (
        <div className="callout warn" role="status">
          <WarningIcon size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <strong>Deze oefeningen horen bij een ander leerplan en tellen niet mee voor de dekking.</strong>{' '}
            Dezelfde code betekent in een ander leerplan een ander doel.
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {result.otherCurriculumWidgets.map((w) => (
                <li key={`${w.widgetId}:${w.sectionId ?? ''}`}>
                  {w.title}
                  <span className="hint">
                    {' '}— in {w.sectionTitle ?? 'een sectie'}, leerplan {(w.curriculumId && getCurriculum(w.curriculumId)?.title) || 'dat hier niet meer staat'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <p className="hint" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <TipIcon size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <span>
          Cijfer = aantal secties met dit doel in dat hoofdstuk; <Puzzle size={13} className="icon-inline" aria-hidden /> = een
          ingebedde oefening toetst het. Keuzesecties zijn gemarkeerd met ◇ en tellen niet als dekkend.
        </span>
      </p>
    </div>
  );
}

// ── Terugval: vrije-tekstdoelen (cursus zonder leerplan) ────────────────────

/** Actie om alsnog een leerplan te koppelen — steeds zichtbaar zonder leerplan. */
function LinkCurriculumCta({ onOpenSettings }: { onOpenSettings?: () => void }): JSX.Element | null {
  if (!onOpenSettings) return null;
  return (
    <div className="callout" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <GoalIcon size={18} aria-hidden style={{ flex: 'none' }} />
      <span style={{ flex: '1 1 220px' }}>
        Deze cursus heeft nog geen leerplan gekoppeld. Koppel er een om doelcodes te kunnen kiezen
        en de dekking automatisch te laten berekenen.
      </span>
      <button type="button" className="btn btn-sm btn-primary" style={{ flex: 'none' }} onClick={onOpenSettings}>
        <SettingsIcon size={16} /> Koppel een leerplan
      </button>
    </div>
  );
}

function FreeTextCoverage({ course, onOpenSettings }: { course: Course; onOpenSettings?: () => void }): JSX.Element {
  const { rows, sectionsWithGoal, totalSections, missing } = useMemo(() => {
    const byKey = new Map<string, GoalRow>();
    let withGoal = 0;
    let total = 0;
    const missingGroups: MissingGroup[] = [];

    for (const chapter of course.chapters) {
      const without: CourseSection[] = [];
      for (const section of chapter.sections) {
        total++;
        // Trimmen + per sectie hoofdletterongevoelig dedupliceren, zodat een
        // dubbel ingevoerd doel de telling niet opblaast.
        const seen = new Set<string>();
        const goals: string[] = [];
        for (const raw of section.goals ?? []) {
          const goal = raw.trim();
          const key = goal.toLowerCase();
          if (!goal || seen.has(key)) continue;
          seen.add(key);
          goals.push(goal);
        }
        if (goals.length === 0) {
          without.push(section);
          continue;
        }
        withGoal++;
        for (const goal of goals) {
          const key = goal.toLowerCase();
          let row = byKey.get(key);
          if (!row) {
            row = { key, label: goal, perChapter: new Map(), inCore: false };
            byKey.set(key, row);
          }
          const titles = row.perChapter.get(chapter.id) ?? [];
          titles.push(section.optional ? `${section.title} ◇` : section.title);
          row.perChapter.set(chapter.id, titles);
          if (!section.optional) row.inCore = true;
        }
      }
      if (without.length > 0) missingGroups.push({ chapter, sections: without });
    }
    return {
      rows: [...byKey.values()],
      sectionsWithGoal: withGoal,
      totalSections: total,
      missing: missingGroups,
    };
  }, [course]);

  // ── Lege staat: nog geen enkel doel in de cursus ──────────────────────────
  if (rows.length === 0) {
    return (
      <div>
        <LinkCurriculumCta onOpenSettings={onOpenSettings} />
        <EmptyState icon={<GoalIcon size={40} />} title="Nog geen leerplandoelen gekoppeld">
          <p>
            Koppel doelen aan je secties om hier de dekking te zien: welke doelen komen waar aan
            bod, en welke secties dragen er nog geen. Gekoppelde doelen voeden ook de heatmaps en
            de feed-up voor leerlingen.
          </p>
          <p className="hint">
            Tip: de AI-cursusbouwer koppelt doelen automatisch aan de secties die hij maakt.
            Zelf doen kan ook — vul ze per sectie in via de linkerkolom van de editor.
          </p>
        </EmptyState>
      </div>
    );
  }

  const sticky: CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'var(--bg-raised)',
    zIndex: 1,
    textAlign: 'left',
    padding: '7px 12px',
  };

  return (
    <div>
      <LinkCurriculumCta onOpenSettings={onOpenSettings} />
      {/* 2. Samenvatting */}
      <p style={{ marginTop: 0 }}>
        <strong>{rows.length} {rows.length === 1 ? 'doel' : 'doelen'}</strong>
        {' · '}
        <strong>{sectionsWithGoal} van {totalSections}</strong> secties dragen een doel
        <span className="hint"> (keuzesecties tellen mee en zijn gemarkeerd met ◇)</span>
      </p>

      {/* 3. De matrix: doelen × hoofdstukken */}
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }} role="region" tabIndex={0} aria-label="Dekking per doel en hoofdstuk">
        <table className="data" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...sticky, minWidth: 220 }}>Doel</th>
              {course.chapters.map((ch) => (
                <th
                  key={ch.id}
                  scope="col"
                  title={ch.title}
                  style={{ padding: '7px 8px', fontSize: '0.82rem', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' }}
                >
                  {ch.emoji ? `${ch.emoji} ` : ''}{shortTitle(ch.title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={{ borderTop: '1px solid var(--line)' }}>
                <th scope="row" style={{ ...sticky, fontWeight: 600, fontSize: '0.88rem' }}>
                  {row.label}
                  {!row.inCore && (
                    <span
                      className="badge badge-warn"
                      style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
                      title="Dit doel komt enkel voor in keuzesecties (verdieping) — geen enkele verplichte sectie dekt het."
                    >
                      <WarningIcon size={13} /> alleen in verdieping
                    </span>
                  )}
                </th>
                {course.chapters.map((ch) => {
                  const titles = row.perChapter.get(ch.id) ?? [];
                  return (
                    <td
                      key={ch.id}
                      style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}
                      title={titles.length > 0 ? titles.join(' · ') : undefined}
                      aria-label={
                        titles.length > 0
                          ? `${titles.length} ${titles.length === 1 ? 'sectie draagt' : 'secties dragen'} dit doel in “${ch.title}”: ${titles.join(', ')}`
                          : `Geen secties met dit doel in “${ch.title}”`
                      }
                    >
                      {titles.length > 0 ? titles.length : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Secties zonder doel */}
      {missing.length === 0 ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckIcon size={16} aria-hidden /> Elke sectie draagt minstens één doel — de dekking is rond.
        </p>
      ) : (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Secties zonder doel</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Doelen koppelen loont: ze voeden de heatmaps én de feed-up (“wat leer je hier?”) voor
            je leerlingen.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {missing.map(({ chapter, sections }) => (
              <div key={chapter.id}>
                <strong style={{ fontSize: '0.92rem' }}>
                  {chapter.emoji ? `${chapter.emoji} ` : ''}{chapter.title}
                </strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 22 }}>
                  {sections.map((s) => (
                    <li key={s.id} style={{ fontSize: '0.9rem' }}>
                      {s.title}
                      {s.optional && <span className="hint"> ◇ keuzesectie</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Hint onderaan */}
      <p className="hint" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <TipIcon size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <span>Doelen formuleer je best in leerlingtaal; dezelfde formulering in meerdere secties = dezelfde rij.</span>
      </p>
    </div>
  );
}
