import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse } from '../lib/courses';
import { formatDateShort } from '../lib/utils';
import { BlockRenderer } from '../components/course/BlockRenderer';
import { leerlingBlokken } from '../components/course/emptyBlock';
import { EmptyState } from '../components/ui';
import { BackIcon, GoalIcon, PrintIcon } from '../components/icons';

/** Printbare weergave van een volledige cursus (statisch, zonder spelers). */
export function CoursePrintPage() {
  const { id } = useParams();
  const course = id ? getCourse(id) : undefined;

  if (!course) {
    return (
      <main id="main" className="page page-narrow" style={{ paddingTop: 60 }}>
        <EmptyState icon={<PrintIcon size={40} aria-hidden />} title="Cursus niet gevonden" level={1}>
          <Link to="/cursussen" className="btn btn-primary"><BackIcon size={18} aria-hidden /> Naar de cursussen</Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main id="main" style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 60px' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-chapter { break-before: page; }
          body { background: #fff; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Link to={`/cursus/bewerk/${course.id}`} className="btn btn-sm btn-ghost"><BackIcon size={16} aria-hidden /> Terug naar de editor</Link>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => window.print()}><PrintIcon size={18} aria-hidden /> Afdrukken / als PDF bewaren</button>
      </div>

      {/* titelpagina */}
      <header style={{ textAlign: 'center', margin: '30px 0 40px' }}>
        <div style={{ fontSize: '4rem' }} aria-hidden>{course.coverEmoji}</div>
        <h1 style={{ margin: '10px 0 4px' }}>{course.title}</h1>
        {course.subtitle && <p style={{ color: 'var(--text-soft)', margin: 0, fontSize: '1.05rem' }}>{course.subtitle}</p>}
        <p className="hint" style={{ marginTop: 10 }}>
          {course.author && <>{course.author} · </>}versie {formatDateShort(course.updatedAt)}
        </p>
      </header>

      {/* inhoudstafel */}
      <nav aria-label="Inhoudstafel" style={{ marginBottom: 34 }}>
        <h2 style={{ fontSize: '1.15rem' }}>Inhoud</h2>
        <ol style={{ paddingLeft: 22, margin: 0 }}>
          {course.chapters.map((ch) => (
            <li key={ch.id} style={{ marginBottom: 4 }}>
              <strong>{ch.emoji} {ch.title}</strong>
              <ul style={{ paddingLeft: 18, margin: '2px 0 0', color: 'var(--text-soft)' }}>
                {ch.sections.map((se) => (
                  <li key={se.id}>{se.title}{se.optional && <em> (verdieping)</em>}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </nav>

      {/* inhoud */}
      {course.chapters.map((ch, ci) => (
        <section key={ch.id} className={ci > 0 ? 'print-chapter' : undefined} style={{ marginBottom: 40 }}>
          <h2 style={{ borderBottom: '2px solid var(--line-strong)', paddingBottom: 6 }}>
            {ch.emoji} {ci + 1}. {ch.title}
          </h2>
          {ch.sections.map((se) => (
            <article key={se.id} style={{ marginBottom: 26 }}>
              <h3>
                {se.title}
                {se.optional && <span className="hint" style={{ fontWeight: 400 }}> (verdieping)</span>}
              </h3>
              {se.goals && se.goals.length > 0 && (
                <div className="callout" style={{ marginBottom: 12 }}>
                  <GoalIcon aria-hidden />
                  <div>
                    <strong>Wat leer je hier?</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {se.goals.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </div>
                </div>
              )}
              {/* Lege blokken (geen afbeelding gekozen, geen oefening) horen niet op papier. */}
              {leerlingBlokken(se.blocks).map((block) => (
                <BlockRenderer key={block.id} block={block} interactive={false} />
              ))}
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
