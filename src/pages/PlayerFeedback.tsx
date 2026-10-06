import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { saveSubmission } from '../lib/storage';
import { pct } from '../lib/utils';
import type { Question, Submission, Widget } from '../lib/types';
import type { PersoonlijkDoel } from './PlayerPage';

// Lui geladen vanuit PlayerPage: dit stuk verschijnt pas ná het indienen, dus
// hoort niet in de hoofdbundel (het kritieke leerlingpad tot en met "spelen").

const FOUT_LABELS = [
  { key: 'slordig', label: 'Slordigheidsfout' },
  { key: 'gelezen', label: 'Vraag verkeerd gelezen' },
  { key: 'kennis', label: 'Stof nog niet gekend' },
  { key: 'aanpak', label: 'Aanpak niet gekend' },
] as const;

/**
 * Foutenanalyse door de leerling zelf ("exam wrapper"): fouten labelen en één
 * voornemen noteren. Wordt bij de inzending bewaard zodat de leerkracht het ziet.
 */
export function FoutenAnalysePanel({
  widget, submission, onSaved,
}: { widget: Widget; submission: Submission; onSaved: (s: Submission) => void }) {
  const questions = (widget.config as { questions?: Question[] }).questions;
  // Zonder memo wordt deze lijst bij elke toetsaanslag in het invulveld hieronder
  // opnieuw doorlopen.
  const wrong = useMemo(
    () => (questions ?? []).filter((q) => {
      if (q.type === 'info') return false;
      const s = submission.itemScores?.[q.id];
      return !!s && s.mode !== 'pending' && s.earned < s.max;
    }),
    [questions, submission.itemScores]
  );
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [nextTime, setNextTime] = useState('');
  const [saved, setSaved] = useState(!!(submission.answers as Record<string, unknown>)['_foutenanalyse']);
  // Opslag vol: de analyse zit wel in de resultaatcode, maar niet op dit toestel.
  const [nietOpToestel, setNietOpToestel] = useState(false);

  if (!questions || wrong.length === 0 || saved) {
    return saved && wrong.length > 0 ? (
      <div className={nietOpToestel ? 'callout warn' : 'callout'} role="status" style={{ marginTop: 18 }}>
        <div>
          {nietOpToestel
            ? 'Je foutenanalyse zit in je resultaatcode, maar kon niet op dit toestel bewaard worden: de opslag is vol.'
            : 'Je foutenanalyse is bewaard — sterk dat je naar je eigen fouten keek!'}
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <h3>Kijk even terug op je fouten</h3>
      <p style={{ color: 'var(--text-soft)', fontSize: '0.92rem' }}>
        Wat voor soort fout was het? Dit telt niet mee voor punten — het helpt jou (en je leerkracht) om te zien wat je volgende stap is.
      </p>
      {wrong.map((q) => (
        <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
            {/* geen vraagnummer: bij schudden/vragenpool wijkt de confignummering af van wat de leerling zag */}
            {q.prompt ? q.prompt.slice(0, 110) : '(invuloefening)'}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Soort fout">
            {FOUT_LABELS.map((f) => (
              <button
                key={f.key}
                className={`chip ${labels[q.id] === f.key ? 'placed' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.83rem' }}
                aria-pressed={labels[q.id] === f.key}
                onClick={() => setLabels((m) => ({ ...m, [q.id]: f.key }))}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="fa-next">Wat doe je de volgende keer anders? (één zin)</label>
        <input
          id="fa-next" className="input" value={nextTime}
          placeholder='bv. "Ik lees elke vraag twee keer voor ik antwoord."'
          onChange={(e) => setNextTime(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary"
        disabled={Object.keys(labels).length === 0 && !nextTime.trim()}
        onClick={() => {
          const updated: Submission = {
            ...submission,
            answers: {
              ...submission.answers,
              _foutenanalyse: { labels, volgendeKeer: nextTime.trim() },
            },
          };
          setNietOpToestel(!saveSubmission(updated));
          onSaved(updated);
          setSaved(true);
        }}
      >
        <Check size={16} aria-hidden /> Bewaren
      </button>
    </div>
  );
}

/**
 * Kaart die na afloop het persoonlijke doel naast het resultaat legt, met één
 * korte reflectievraag. Volgt het patroon van FoutenAnalysePanel: de reflectie
 * wordt bij de inzending bewaard (answers._doelreflectie) via saveSubmission.
 */
export function DoelKaart({
  submission, onSaved, showScore,
}: { submission: Submission; onSaved: (s: Submission) => void; showScore: boolean }) {
  const answers = submission.answers as Record<string, unknown>;
  const doel = answers['_doel'] as PersoonlijkDoel | undefined;
  const [reflectie, setReflectie] = useState('');
  const [saved, setSaved] = useState(!!answers['_doelreflectie']);
  const [nietOpToestel, setNietOpToestel] = useState(false);

  if (!doel || (!doel.proces && doel.streef === undefined && !doel.vrij)) return null;

  // respecteer de instelling "score verbergen": dan geen percentages tonen
  const procent = showScore && submission.totalMax > 0 ? pct(submission.totalEarned, submission.totalMax) : null;
  const behaald = doel.streef !== undefined && procent !== null ? procent >= doel.streef : null;

  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <h3>Jouw doel</h3>
      {doel.streef !== undefined && (
        procent !== null ? (
          <p style={{ margin: '6px 0' }}>
            Je doel: <strong>{doel.streef}%</strong> — behaald: <strong>{procent}%</strong>{' '}
            {behaald
              ? <span className="badge badge-ok"><Check size={13} aria-hidden /> behaald</span>
              : <span className="badge badge-warn">nog niet — elke poging telt</span>}
          </p>
        ) : (
          <p style={{ margin: '6px 0' }}>
            Je streefdoel was <strong>{doel.streef}%</strong>, maar deze opdracht krijgt (nog) geen score.
            Kijk daarom vooral terug op je aanpak.
          </p>
        )
      )}
      {(doel.proces || doel.vrij) && (
        <p style={{ margin: '6px 0' }}>
          Je nam je voor: <em>“{[doel.proces, doel.vrij].filter(Boolean).join('” en “')}”</em>
          {' '}— gelukt? Wat hielp?
        </p>
      )}
      {saved ? (
        <div className={nietOpToestel ? 'callout warn' : 'callout'} role="status" style={{ marginTop: 8 }}>
          <div>
            {nietOpToestel
              ? 'Je reflectie zit in je resultaatcode, maar kon niet op dit toestel bewaard worden: de opslag is vol.'
              : 'Je reflectie is bewaard bij je resultaat — knap dat je terugkeek op je doel!'}
          </div>
        </div>
      ) : (
        <>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="doel-reflectie">Korte reflectie (één zin is genoeg)</label>
            <input
              id="doel-reflectie"
              className="input"
              value={reflectie}
              placeholder='bv. "Rustig lezen hielp; volgende keer mik ik op 80%."'
              onChange={(e) => setReflectie(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!reflectie.trim()}
            onClick={() => {
              const updated: Submission = {
                ...submission,
                answers: { ...submission.answers, _doelreflectie: reflectie.trim() },
              };
              setNietOpToestel(!saveSubmission(updated));
              onSaved(updated);
              setSaved(true);
            }}
          >
            <Check size={16} aria-hidden /> Bewaren
          </button>
        </>
      )}
      <p style={{ margin: '12px 0 0' }}>
        <Link to="/voortgang">Bekijk je voortgang op dit toestel</Link>
      </p>
    </div>
  );
}
