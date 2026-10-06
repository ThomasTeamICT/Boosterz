import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import { formatDate, pct } from '../lib/utils';
import { EmptyState } from '../components/ui';
import { gradeQuestion } from '../lib/grading';
import { getCurriculum, goalLabel } from '../lib/curriculum';
import { filterSubmissionsByClass } from '../lib/resultsFilter';
import { useResultsClassFilter } from '../lib/useResultsClassFilter';
import type { Question, QuizConfig, Submission, Widget } from '../lib/types';
import { TypeTile } from '../components/TypeTile';
import { ClassFilterNotice } from '../components/results/ClassFilterNotice';
import {
  awaitingCount, bestAttemptPerStudent, goalRefOf, groupSubmissionsByWidget, studentKeyOf, type GoalRef,
} from '../components/results/resultsHelpers';
import { CheckIcon, GoalIcon, ResultsIcon } from '../components/icons';
import { ClipboardCheck } from 'lucide-react';
import '../styles/opvolgen.css';

// widgets met een QuizConfig-achtige 'questions'-lijst (zelfde set als ResultsPage)
const QUIZ_FAMILY = new Set<string>(['quiz', 'worksheet', 'exitticket', 'splitworksheet']);

export function ResultsOverviewPage() {
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);
  const { classes, filter, setFilter } = useResultsClassFilter();

  // De inzendingen één keer lezen en per widget groeperen: per widget opnieuw
  // lezen betekent de hele lijst telkens opnieuw ontleden.
  const subsByWidget = groupSubmissionsByWidget(getSubmissions());
  const widgets = getWidgets().filter((w) => getTypeDef(w.type).hasSubmissions);
  let hidden = 0;
  const withSubs: { widget: Widget; subs: Submission[]; last: number }[] = [];
  for (const widget of widgets) {
    const raw = subsByWidget.get(widget.id) ?? [];
    // met de klassen erbij: dezelfde inzendingen als het klasdashboard
    const subs = filterSubmissionsByClass(raw, filter, classes);
    hidden += raw.length - subs.length;
    if (subs.length === 0) continue;
    withSubs.push({ widget, subs, last: subs.reduce((m, s) => Math.max(m, s.submittedAt), 0) });
  }
  withSubs.sort((a, b) => b.last - a.last);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Resultaten</h1>
          <p className="sub">Alle inzendingen van je leerlingen, per widget.</p>
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

      {withSubs.length === 0 ? (
        hidden > 0 ? (
          <EmptyState icon={<ResultsIcon size={40} />} title="Geen inzendingen voor dit klasfilter">
            <p>
              Er {hidden === 1 ? 'staat' : 'staan'} {hidden} {hidden === 1 ? 'inzending' : 'inzendingen'} op dit toestel,
              maar {hidden === 1 ? 'die hoort' : 'die horen'} bij een andere klas.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setFilter('all')}>Toon alle klassen</button>
          </EmptyState>
        ) : (
          <EmptyState icon={<ResultsIcon size={40} />} title="Nog geen inzendingen">
            <p>Deel een widget met je klas via de code of link — de resultaten verschijnen hier automatisch.</p>
            <Link to="/widgets" className="btn btn-primary">Naar mijn widgets</Link>
          </EmptyState>
        )
      ) : (
        <>
          <ClassFilterNotice hidden={hidden} onShowAll={() => setFilter('all')} />
          <CrossWidgetGoals items={withSubs} />
          <div className="table-wrap" role="region" tabIndex={0} aria-label="Resultaten per widget">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Widget</th>
                  <th scope="col">Inzendingen</th>
                  <th scope="col">Gemiddelde score</th>
                  <th scope="col">Na te kijken</th>
                  <th scope="col">Laatste inzending</th>
                </tr>
              </thead>
              <tbody>
                {withSubs.map(({ widget, subs, last }) => {
                  const def = getTypeDef(widget.type);
                  const scored = subs.filter((s) => s.totalMax > 0);
                  const avg = scored.length > 0
                    ? Math.round(scored.reduce((sum, s) => sum + pct(s.totalEarned, s.totalMax), 0) / scored.length)
                    : null;
                  const pending = awaitingCount(subs);
                  return (
                    <tr
                      key={widget.id}
                      // De muis mag de hele rij gebruiken; het toetsenbord gebruikt de link in de eerste cel.
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a, button')) return;
                        location.hash = `#/resultaten/${widget.id}`;
                      }}
                    >
                      <th scope="row">
                        <Link
                          to={`/resultaten/${widget.id}`}
                          className="row-open"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                          <TypeTile type={def} size="xs" /> {widget.title}
                        </Link>
                        <div className="hint">{def.name} · code {widget.code}</div>
                      </th>
                      <td>{subs.length}</td>
                      <td>
                        {avg === null ? <span className="hint">—</span> : (
                          <div className="scorebar">
                            <div className="bar"><div style={{ width: `${avg}%`, background: avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }} /></div>
                            <strong>{avg}%</strong>
                            {pending > 0 && <span className="hint">(voorlopig)</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        {pending > 0
                          ? <span className="badge badge-warn"><ClipboardCheck size={14} className="icon-inline" /> {pending}</span>
                          : <span className="badge badge-ok"><CheckIcon size={14} className="icon-inline" /> klaar</span>}
                      </td>
                      <td className="hint">{formatDate(last)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Leerdoelen over widgets heen ────────────────────────────────────────────

interface GoalAgg {
  /** Wat de leerkracht leest: de doeltekst bij een leerplancode, anders de vrije tag. */
  label: string;
  /** De leerplancode, of null bij een vrije doel-tag. */
  code: string | null;
  /** Leerplan van de widgets die dit doel dragen (enkel bij een leerplancode). */
  curriculumId?: string;
  earned: number;
  max: number;
  /** Aantal vragen met dit doel dat nog nagekeken moet worden: de score is voorlopig. */
  pending: number;
  /** Widgets die (met beoordeelde antwoorden) aan dit doel bijdragen. */
  widgetIds: Set<string>;
  /** Inzendingen die (met beoordeelde antwoorden) aan dit doel bijdragen. */
  subIds: Set<string>;
}

interface StudentRow {
  /** Meest recente schrijfwijze van de naam. */
  name: string;
  /** Tijdstip van de recentste inzending (om de schrijfwijze te kiezen). */
  last: number;
  perGoal: Map<string, { earned: number; max: number }>;
}

/**
 * Aggregatie van leerdoelen over alle quiz-achtige widgets heen: totale
 * beheersing per doel + uitklapbare heatmap leerlingen × doelen.
 *
 * Een vraag telt mee onder haar leerplandoel (goalCode) als die er is, anders
 * onder haar vrije doel-tag (goal). Dezelfde code in twee verschillende
 * widgets van hetzelfde leerplan is één rij — daar is de code net voor bedoeld.
 * Dezelfde code in twee verschillende leerplannen blijft twee rijen.
 *
 * Per leerling telt per widget de beste poging (zoals de matrix op het
 * klasdashboard): oefenen straft niet af. Wat nog nagekeken moet worden telt
 * niet als 0 mee; de score heet dan voorlopig.
 */
function CrossWidgetGoals({ items }: { items: { widget: Widget; subs: Submission[] }[] }) {
  const goals = new Map<string, GoalAgg>();
  const students = new Map<string, StudentRow>();

  for (const { widget, subs } of items) {
    if (!QUIZ_FAMILY.has(widget.type)) continue;
    const questions = (widget.config as Partial<QuizConfig>).questions ?? [];
    const tagged = questions
      .filter((q): q is Question => !!q && q.type !== 'info')
      .map((q) => ({ q, ref: goalRefOf(q, widget.curriculumId) }))
      .filter((t): t is { q: Question; ref: GoalRef } => t.ref !== null);
    if (tagged.length === 0) continue;

    for (const s of bestAttemptPerStudent(subs)) {
      for (const { q, ref } of tagged) {
        // vragenpool-conventie (zoals ResultsPage): de vraag zit alleen in de
        // inzending als itemScores null is óf de vraag-id als sleutel heeft
        if (s.itemScores && !(q.id in s.itemScores)) continue;

        let agg = goals.get(ref.key);
        if (!agg) {
          // Het etiket wordt bepaald door de eerste widget die dit doel draagt:
          // die kent het leerplan waaruit de code komt.
          agg = {
            label: ref.code ? goalLabel(ref.code, ref.curriculumId) : (ref.tag ?? ''),
            code: ref.code,
            ...(ref.curriculumId ? { curriculumId: ref.curriculumId } : {}),
            earned: 0, max: 0, pending: 0, widgetIds: new Set(), subIds: new Set(),
          };
          goals.set(ref.key, agg);
        }

        const sc = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
        if (sc.mode === 'pending') { agg.pending += 1; continue; } // nog niet beoordeeld → telt niet mee
        agg.earned += sc.earned;
        agg.max += sc.max;
        agg.widgetIds.add(widget.id);
        agg.subIds.add(s.id);

        const key = studentKeyOf(s);
        const rawName = typeof s.studentName === 'string' && s.studentName.trim() ? s.studentName.trim() : 'Anoniem';
        let st = students.get(key);
        if (!st) {
          st = { name: rawName, last: s.submittedAt, perGoal: new Map() };
          students.set(key, st);
        }
        if (s.submittedAt >= st.last) {
          st.last = s.submittedAt;
          st.name = rawName;
        }
        const pg = st.perGoal.get(ref.key) ?? { earned: 0, max: 0 };
        pg.earned += sc.earned;
        pg.max += sc.max;
        st.perGoal.set(ref.key, pg);
      }
    }
  }

  // alleen tonen als er minstens één doel-tag met inzendingen bestaat
  if (goals.size === 0) return null;

  // Dezelfde code uit twee leerplannen: de leerkracht moet ze kunnen onderscheiden.
  const codeCount = new Map<string, number>();
  for (const g of goals.values()) if (g.code) codeCount.set(g.code, (codeCount.get(g.code) ?? 0) + 1);
  const curriculumName = (g: GoalAgg) =>
    (g.curriculumId ? getCurriculum(g.curriculumId)?.title : undefined) ?? 'zonder leerplan';
  const clashes = (g: GoalAgg) => !!g.code && (codeCount.get(g.code) ?? 0) > 1;
  const fullLabel = (g: GoalAgg) => (clashes(g) ? `${g.label} (${curriculumName(g)})` : g.label);
  const columnHead = (g: GoalAgg) => (clashes(g) ? `${g.code} (${curriculumName(g)})` : g.code ?? g.label);

  const goalNames = [...goals.keys()].sort((a, b) =>
    fullLabel(goals.get(a)!).localeCompare(fullLabel(goals.get(b)!), 'nl')
  );
  const studentRows = [...students.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'nl'));

  const cellColor = (p: number | null) =>
    p === null ? 'var(--bg-sunken)' : p >= 70 ? 'var(--ok-soft)' : p >= 45 ? 'var(--warn-soft)' : 'var(--err-soft)';
  const cellText = (p: number | null) =>
    p === null ? 'var(--text-faint)' : p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';
  const barColor = (p: number | null) =>
    p === null ? 'var(--text-faint)' : p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';

  return (
    <details className="card card-pad" open style={{ marginBottom: 18 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem' }}>
        <GoalIcon size={18} className="icon-inline" /> Leerdoelen over widgets heen
      </summary>
      <p className="hint" style={{ margin: '8px 0 14px' }}>
        Dit zijn <strong>indicaties</strong>, samengeteld over alle widgets waarvan vragen dit leerdoel dragen.
        Vragen met een <strong>leerplandoelcode</strong> tellen over widgets heen samen, binnen hetzelfde leerplan;
        vragen met alleen een vrije doel-tag blijven op hun eigen naam staan.
        Per leerling telt per widget de beste poging.
        Nog niet beoordeelde antwoorden tellen niet mee: zo'n score is voorlopig.
        Gebruik ze als startpunt voor een gesprek, niet als eindoordeel.
      </p>

      {goalNames.map((goal) => {
        const agg = goals.get(goal)!;
        const p = agg.max > 0 ? pct(agg.earned, agg.max) : null;
        const label = fullLabel(agg);
        return (
          <div key={goal} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontWeight: 600, marginBottom: 3 }}>
              <span>
                {agg.code && <span className="badge badge-brand" style={{ marginRight: 6 }}>leerplan</span>}
                {label}
              </span>
              <span style={{ color: cellText(p) }}>
                {p === null ? '— nog na te kijken' : `${p}%${agg.pending > 0 ? ' (voorlopig)' : ''}`}
              </span>
            </div>
            <div
              className="progressbar"
              role="img"
              aria-label={p === null
                ? `Leerdoel ${label}: nog geen beoordeelde antwoorden`
                : `Leerdoel ${label}: ${p} procent beheersing${agg.pending > 0 ? ', voorlopig' : ''}`}
            >
              <div style={{ width: `${p ?? 0}%`, background: barColor(p) }} />
            </div>
            <div className="hint" style={{ marginTop: 3 }}>
              gebaseerd op {agg.widgetIds.size} {agg.widgetIds.size === 1 ? 'widget' : 'widgets'} · {agg.subIds.size} {agg.subIds.size === 1 ? 'inzending' : 'inzendingen'}
              {agg.pending > 0 && ` · ${agg.pending} ${agg.pending === 1 ? 'antwoord moet' : 'antwoorden moeten'} nog nagekeken worden`}
            </div>
          </div>
        );
      })}

      {studentRows.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-soft)' }}>
            Heatmap per leerling (voor klassenraad of remediëring)
          </summary>
          <div className="table-wrap" role="region" tabIndex={0} aria-label="Heatmap per leerling en leerdoel" style={{ marginTop: 8 }}>
            <table className="data" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th scope="col">Leerling</th>
                  {goalNames.map((g) => {
                    const agg = goals.get(g)!;
                    return <th key={g} scope="col" title={fullLabel(agg)}>{columnHead(agg)}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {studentRows.map(([key, st]) => (
                  <tr key={key} style={{ cursor: 'default' }}>
                    <th scope="row"><strong>{st.name}</strong></th>
                    {goalNames.map((g) => {
                      const pg = st.perGoal.get(g);
                      const p = pg && pg.max > 0 ? pct(pg.earned, pg.max) : null;
                      return (
                        <td key={g} style={{ background: cellColor(p), color: cellText(p), fontWeight: 700, textAlign: 'center' }}>
                          {p === null ? '—' : `${p}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </details>
  );
}
