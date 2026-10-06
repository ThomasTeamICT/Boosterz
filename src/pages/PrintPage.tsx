import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Paperclip, Star } from 'lucide-react';
import { getWidget } from '../lib/storage';
import type { GapQuestion, Question, QuizConfig } from '../lib/types';
import { extractGaps, gapPreview, quizMaxScore } from '../lib/grading';
import { CheckRow } from '../components/ui';
import { BackIcon, CheckIcon, PrintIcon } from '../components/icons';
import { markTokens as playerMarkTokens, ZoneCircle } from '../widgets/qtypes/interactTypes';
import { matchKeyLetters, orderKeyPlaces, printOrdered, printPermutation } from '../lib/printOrder';

/** Afdrukbare versie van quiz/werkblad/exit-ticket, met of zonder correctiesleutel. */
export function PrintPage() {
  const { id } = useParams();
  const widget = id ? getWidget(id) : undefined;
  const [withKey, setWithKey] = useState(false);

  if (!widget || !['quiz', 'worksheet', 'exitticket'].includes(widget.type)) {
    return (
      <main className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h1>Niet afdrukbaar</h1>
        <p style={{ color: 'var(--text-soft)' }}>Deze widget bestaat niet of heeft geen afdrukbare versie.</p>
        <Link to="/widgets" className="btn btn-primary"><BackIcon size={18} aria-hidden /> Naar mijn widgets</Link>
      </main>
    );
  }

  const config = widget.config as QuizConfig;
  const questions = config.questions;
  let printNum = 0;

  return (
    // Het papier is altijd zwart op wit; de bedieningsbalk volgt het thema van de app.
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <header className="topbar" style={{ position: 'static', flexWrap: 'wrap', color: 'var(--text)', background: 'var(--bg-raised)' }}>
        <Link to={`/bewerk/${widget.id}`} className="btn btn-sm btn-quiet"><BackIcon size={16} aria-hidden /> Terug naar de editor</Link>
        <div className="topbar-spacer" />
        <CheckRow checked={withKey} onChange={setWithKey} label="Correctiesleutel tonen" />
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}><PrintIcon size={16} aria-hidden /> Afdrukken / PDF</button>
      </header>

      <main style={{ color: '#111', maxWidth: 780, margin: '0 auto', padding: '28px 24px 60px', fontSize: '15px', lineHeight: 1.6 }}>
        <header style={{ borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
            {widget.title}
            {withKey && <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}> — CORRECTIESLEUTEL</span>}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 26px', marginTop: 10, fontSize: '0.95rem' }}>
            <span>Naam: ________________________________</span>
            <span>Klas: __________</span>
            <span>Datum: ____ / ____ / ______</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>/ {quizMaxScore(config)}</span>
          </div>
          {widget.settings.instructions && (
            <p style={{ margin: '10px 0 0', fontStyle: 'italic' }}>{widget.settings.instructions}</p>
          )}
        </header>

        {questions.map((q) => {
          if (q.type === 'info') {
            return (
              <div key={q.id} style={{ margin: '14px 0', padding: '10px 14px', background: '#f3f4f6', borderRadius: 8, breakInside: 'avoid' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{q.prompt}</p>
                {q.imageUrl && <img src={q.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 240, marginTop: 8 }} />}
              </div>
            );
          }
          printNum++;
          return (
            <div key={q.id} style={{ margin: '18px 0', breakInside: 'avoid' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 650 }}>
                {printNum}. {q.prompt}
                <span style={{ float: 'right', fontWeight: 400, fontSize: '0.85rem' }}>… / {q.points}</span>
              </p>
              {q.imageUrl && <img src={q.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 240, marginBottom: 8 }} />}
              <PrintAnswerArea q={q} withKey={withKey} />
            </div>
          );
        })}

        <footer style={{ marginTop: 34, borderTop: '1px solid #d1d5db', paddingTop: 8, fontSize: '0.8rem', color: '#6b7280' }}>
          Gemaakt met Boosterz · code {widget.code}
        </footer>
      </main>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#b91c1c', fontWeight: 700 }}>{children}</span>;
}

function PrintAnswerArea({ q, withKey }: { q: Question; withKey: boolean }) {
  const lineStyle: React.CSSProperties = { borderBottom: '1px solid #9ca3af', height: 26 };
  switch (q.type) {
    case 'mc':
    case 'multi':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {q.options.map((o, i) => {
            const correct = q.type === 'mc' ? i === q.correctIndex : q.correctIndices.includes(i);
            return (
              <li key={i} style={{ margin: '4px 0' }}>
                <span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #111', borderRadius: q.type === 'mc' ? '50%' : 3, marginRight: 9, verticalAlign: '-2px', background: withKey && correct ? '#111' : 'transparent' }} />
                {String.fromCharCode(65 + i)}. {o} {withKey && correct && <Key><CheckIcon size={14} className="icon-inline" aria-hidden /></Key>}
              </li>
            );
          })}
        </ul>
      );
    case 'tf': {
      const box = <span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #111', borderRadius: 3, marginRight: 6, verticalAlign: '-2px' }} />;
      return (
        <p style={{ margin: '4px 0' }}>
          {box} Juist {withKey && q.answer && <Key><CheckIcon size={14} className="icon-inline" aria-hidden /></Key>} &nbsp;&nbsp; {box} Onjuist {withKey && !q.answer && <Key><CheckIcon size={14} className="icon-inline" aria-hidden /></Key>}
        </p>
      );
    }
    case 'short':
    case 'number':
      return withKey
        ? <p style={{ margin: '4px 0' }}><Key>{q.type === 'short' ? q.accepted.filter(Boolean).join(' / ') : `${q.answer}${q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}`}</Key></p>
        : <div style={lineStyle} />;
    case 'long':
      return withKey && q.modelAnswer
        ? <p style={{ margin: '4px 0' }}><Key>Modelantwoord: {q.modelAnswer}</Key></p>
        : <div>{[0, 1, 2, 3].map((i) => <div key={i} style={lineStyle} />)}</div>;
    case 'gap': {
      const gq = q as GapQuestion;
      if (withKey) {
        return (
          <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
            {gq.text.split(/\[([^\]]+)\]/g).map((part, i) =>
              i % 2 === 1 ? <Key key={i}> {part.split('|')[0]} </Key> : <span key={i}>{part}</span>
            )}
          </p>
        );
      }
      return <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{gapPreview(gq)}</p>;
    }
    case 'match': {
      // De speler schudt de rechterkolom; op papier moet ze ook gehusseld staan.
      // De sleutel volgt uit dezelfde (vaste) volgorde.
      const perm = printPermutation(q.pairs.length, q.id);
      const letters = matchKeyLetters(perm);
      return (
        <div style={{ display: 'flex', gap: 40 }}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {q.pairs.map((p, i) => <li key={i}>{p.left} <ArrowRight size={14} className="icon-inline" aria-hidden /> ____ {withKey && <Key>({letters[i]})</Key>}</li>)}
          </ol>
          <ol style={{ margin: 0, paddingLeft: 20, listStyleType: 'lower-alpha' }}>
            {perm.map((designIndex) => <li key={designIndex}>{q.pairs[designIndex].right}</li>)}
          </ol>
        </div>
      );
    }
    case 'order': {
      // De items staan in ontwerpvolgorde = juiste volgorde: op papier gehusseld, sleutel = juiste plaats.
      const perm = printPermutation(q.items.length, q.id);
      const places = orderKeyPlaces(perm);
      return (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {perm.map((designIndex, i) => (
            <li key={designIndex} style={{ margin: '3px 0' }}>
              ____ {q.items[designIndex]} {withKey && <Key>(plaats {places[i]})</Key>}
            </li>
          ))}
        </ol>
      );
    }
    case 'slider':
      return withKey
        ? <p style={{ margin: '4px 0' }}><Key>{q.answer}{q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}</Key> (schaal {q.min}–{q.max})</p>
        : <p style={{ margin: '4px 0' }}>Antwoord (tussen {q.min} en {q.max}): __________</p>;

    // ── uitgebreide vraagtypes ──────────────────────────────────────────────
    case 'dropdown': {
      const parts = splitBraces(q.text ?? '');
      if (parts.length === 0) return <div style={lineStyle} />;
      return (
        <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
          {parts.map((part, i) => {
            if (part.type === 'text') return <span key={i}>{part.value}</span>;
            const correct = part.options[0] ?? '';
            // vaste, alfabetische volgorde: verklapt niet dat de eerste optie juist is
            const opts = part.options.slice().sort((a, b) => a.localeCompare(b, 'nl'));
            return (
              <span key={i}>
                {'________ '}
                <span style={{ fontSize: '0.88em', color: '#374151' }}>
                  ({opts.map((o, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && ' / '}
                      {String.fromCharCode(97 + j)}.{' '}
                      {withKey && o === correct
                        ? <span style={{ color: '#b91c1c', fontWeight: 700, textDecoration: 'underline' }}>{o}</span>
                        : o}
                    </React.Fragment>
                  ))})
                </span>
              </span>
            );
          })}
        </p>
      );
    }
    case 'marktext': {
      const tokens = markTokens(q.text ?? '');
      if (tokens.length === 0) return <div style={lineStyle} />;
      return (
        <div>
          <p style={{ margin: '4px 0', fontStyle: 'italic', fontSize: '0.88rem', color: '#374151' }}>
            Markeer of onderstreep de juiste woorden in de tekst.
          </p>
          <p style={{ margin: '4px 0', lineHeight: 2 }}>
            {tokens.map((t, i) => (
              <React.Fragment key={i}>
                {withKey && t.correct
                  ? <Key><span style={{ textDecoration: 'underline' }}>{t.word}</span></Key>
                  : t.word}
                {' '}
              </React.Fragment>
            ))}
          </p>
        </div>
      );
    }
    case 'sort': {
      const cats = q.categories ?? [];
      const items = q.items ?? [];
      const lines = Math.max(2, Math.ceil(items.length / Math.max(1, cats.length)) + 1);
      return (
        <div>
          {items.length > 0 && (
            <p style={{ margin: '4px 0' }}>
              {printOrdered(items, q.id).map((it, i) => (
                <span key={it.id ?? i} style={{ display: 'inline-block', border: '1px solid #9ca3af', borderRadius: 6, padding: '1px 8px', margin: '2px 6px 2px 0' }}>
                  {it.text}
                </span>
              ))}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {cats.map((c, ci) => (
              <div key={c.id ?? ci} style={{ flex: '1 1 150px', border: '1.5px solid #111', borderRadius: 8, padding: '6px 10px' }}>
                <strong style={{ display: 'block', borderBottom: '1px solid #d1d5db', paddingBottom: 3, marginBottom: 5 }}>{c.name}</strong>
                {withKey
                  ? items.filter((it) => it.categoryId === c.id).map((it, ii) => <div key={ii}><Key>{it.text}</Key></div>)
                  : Array.from({ length: lines }, (_, li) => <div key={li} style={lineStyle} />)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'table': {
      const cols = q.columns ?? [];
      const rows = q.rows ?? [];
      const cellBase: React.CSSProperties = { border: '1px solid #9ca3af', padding: '4px 8px', verticalAlign: 'top' };
      return (
        <table style={{ borderCollapse: 'collapse', width: '100%', margin: '4px 0' }}>
          {cols.length > 0 && (
            <thead>
              <tr>{cols.map((c, i) => <th key={i} style={{ ...cellBase, background: '#f3f4f6', textAlign: 'left' }}>{c}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.id ?? ri}>
                {(r.cells ?? []).map((cell, ci) => {
                  // invulveld = er is een verwacht antwoord in r.answers[ci]; een lege vaste cel blijft gewoon leeg
                  const accepted = r.answers?.[ci];
                  if (accepted === null || accepted === undefined) return <td key={ci} style={cellBase}>{cell}</td>;
                  return (
                    <td key={ci} style={{ ...cellBase, border: '1.5px dashed #9ca3af', minWidth: 70 }}>
                      {withKey ? <Key>{accepted.split('|')[0]}</Key> : ' '}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'likert': {
      const opts = q.options ?? [];
      const sts = q.statements ?? [];
      const cellBase: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #e5e7eb' };
      return (
        <div>
          <table style={{ borderCollapse: 'collapse', width: '100%', margin: '4px 0' }}>
            <thead>
              <tr>
                <th style={{ ...cellBase, textAlign: 'left' }} aria-hidden />
                {opts.map((o, i) => (
                  <th key={i} style={{ ...cellBase, fontSize: '0.78rem', fontWeight: 600, textAlign: 'center' }}>{o}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sts.map((st, si) => (
                <tr key={st.id ?? si}>
                  <td style={cellBase}>{st.text}</td>
                  {opts.map((_, oi) => (
                    <td key={oi} style={{ ...cellBase, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', width: 13, height: 13, border: '1.5px solid #111', borderRadius: '50%' }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {withKey && <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#6b7280' }}>Meningsvraag — geen correctiesleutel.</p>}
        </div>
      );
    }
    case 'rating': {
      const scale = Math.max(1, Math.min(10, Math.round(q.scale) || 5));
      return (
        <p style={{ margin: '4px 0' }}>
          {q.labelLow && <span style={{ fontSize: '0.85rem', marginRight: 8 }}>{q.labelLow}</span>}
          <span style={{ display: 'inline-flex', gap: 4, verticalAlign: 'middle' }} aria-hidden>
            {Array.from({ length: scale }, (_, i) => <Star key={i} size={20} />)}
          </span>
          {q.labelHigh && <span style={{ fontSize: '0.85rem', marginLeft: 8 }}>{q.labelHigh}</span>}
          {withKey && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}> (meningsvraag — geen sleutel)</span>}
        </p>
      );
    }
    case 'upload':
      return (
        <p style={{ margin: '4px 0', fontStyle: 'italic' }}>
          <Paperclip size={14} className="icon-inline" aria-hidden /> In te leveren: {q.accept?.trim() ? `bestand (${q.accept.trim()})` : 'bestand'}
          {q.maxMb ? `, max. ${q.maxMb} MB` : ''} — digitaal via de oefening, niet op papier.
        </p>
      );
    case 'imagepoint': {
      const targets = q.targets ?? [];
      return (
        <div>
          <p style={{ margin: '4px 0', fontStyle: 'italic', fontSize: '0.88rem', color: '#374151' }}>
            Duid {targets.length === 1 ? 'de juiste plek' : targets.length > 1 ? `de ${targets.length} juiste plekken` : 'de juiste plekken'} aan
            met een kruisje op de afbeelding{q.maxClicks ? ` (max. ${q.maxClicks} ${q.maxClicks === 1 ? 'kruisje' : 'kruisjes'})` : ''}.
          </p>
          {q.image ? (
            <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
              <img src={q.image} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 320 }} />
              {withKey && targets.map((t, i) => (
                // zelfde meetkunde als de grader (matchMarkers): height r*2%, geen aspectRatio
                <ZoneCircle key={t.id ?? i} x={t.x} y={t.y} r={t.r} color="#b91c1c">
                  {i + 1}
                </ZoneCircle>
              ))}
            </span>
          ) : (
            <p style={{ margin: '4px 0', color: '#6b7280' }}>(geen afbeelding ingesteld)</p>
          )}
          {withKey && targets.some((t) => t.label) && (
            <p style={{ margin: '4px 0' }}>
              {targets.map((t, i) => (t.label ? <Key key={t.id ?? i}>{i + 1}. {t.label}&ensp;</Key> : null))}
            </p>
          )}
        </div>
      );
    }
    default:
      return <div style={lineStyle} />;
  }
}

// ── Hulpjes voor de uitgebreide vraagtypes ──────────────────────────────────

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
