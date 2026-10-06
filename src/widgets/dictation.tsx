import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import type { DictationConfig } from '../lib/types';
import { normalizeAnswer, uid } from '../lib/utils';
import { Field } from '../components/ui';
import { CheckIcon, CloseIcon } from '../components/icons';
import { EditorProps, GameStatus, PlayerProps, ResultHero } from './shared';
import type { ItemScore } from '../lib/types';

/**
 * Dicteezin vergelijken: leestekens tellen niet mee. Standaard ook geen
 * hoofdletters of accenten; `strict` (vinkje "Streng" in de editor) laat
 * hoofdletters en accenten wél meetellen. Staat hier en niet in lib/utils,
 * zodat het niet in de hoofdbundel van het leerlingpad belandt.
 */
export function dictationMatches(given: string, target: string, strict = false): boolean {
  const clean = (t: string) => normalizeAnswer(t, strict, strict).replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ').trim();
  return clean(given) === clean(target);
}

export function DictationEditor({ config, onChange }: EditorProps<DictationConfig>) {
  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        De zinnen worden voorgelezen met de spraakstem van de browser. De leerling typt wat hij/zij hoort.
      </p>
      <Field label="Zinnen of woorden" hint="Eén per regel.">
        <textarea
          className="textarea" rows={8}
          value={config.sentences.map((s) => s.text).join('\n')}
          onChange={(e) => onChange({ ...config, sentences: e.target.value.split('\n').map((text) => ({ id: uid(), text })) })}
        />
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Taal van de stem">
          <select className="select" value={config.lang} onChange={(e) => onChange({ ...config, lang: e.target.value })} style={{ minWidth: 170 }}>
            <option value="nl-BE">Nederlands (België)</option>
            <option value="nl-NL">Nederlands (Nederland)</option>
            <option value="fr-FR">Frans</option>
            <option value="en-GB">Engels (VK)</option>
            <option value="en-US">Engels (VS)</option>
            <option value="de-DE">Duits</option>
            <option value="es-ES">Spaans</option>
          </select>
        </Field>
        <Field label="Spreeksnelheid">
          <select className="select" value={String(config.rate)} onChange={(e) => onChange({ ...config, rate: parseFloat(e.target.value) })}>
            <option value="0.6">Traag</option>
            <option value="0.85">Normaal-traag</option>
            <option value="1">Normaal</option>
          </select>
        </Field>
      </div>
      <label className="checkbox-row" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={config.strict ?? false}
          onChange={(e) => onChange({ ...config, strict: e.target.checked || undefined })} />
        <span>
          Streng: hoofdletters en accenten tellen mee{' '}
          <span className="hint">(standaard is "brussel" ook goed voor "Brussel" en "een" voor "één"; leestekens tellen nooit mee)</span>
        </span>
      </label>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => {
          const text = config.sentences[0]?.text || 'Dit is een test van de spraakstem.';
          const u = new SpeechSynthesisUtterance(text);
          u.lang = config.lang; u.rate = config.rate;
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
        }}
      >
<Volume2 size={16} aria-hidden /> Stem testen
      </button>
    </div>
  );
}

export function DictationPlayer({ widget, timeUp, onComplete }: PlayerProps<DictationConfig>) {
  const sentences = useMemo(() => widget.config.sentences.filter((s) => s.text.trim()), [widget.id]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [playCount, setPlayCount] = useState(0);
  const [done, setDone] = useState(false);
  const supported = typeof speechSynthesis !== 'undefined';
  const submittedRef = useRef(false);
  const strict = widget.config.strict ?? false;
  const isCorrect = (given: string | undefined, target: string) => dictationMatches(given ?? '', target, strict);

  /**
   * Afronden en indienen: bij de laatste zin, of wanneer de tijd om is. Zinnen
   * zonder antwoord tellen als fout; de zin die je aan het typen was, telt mee.
   */
  const finish = (answers: string[]) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (supported) speechSynthesis.cancel();
    const itemScores: Record<string, ItemScore> = {};
    let earned = 0;
    sentences.forEach((s, i) => {
      const ok = isCorrect(answers[i], s.text);
      itemScores[s.id] = { earned: ok ? 1 : 0, max: 1, mode: 'auto' };
      if (ok) earned++;
    });
    onComplete({
      answers: Object.fromEntries(sentences.map((s, i) => [s.id, answers[i] ?? ''])),
      itemScores,
      earned,
      max: sentences.length,
    });
    setTyped(answers);
    setDone(true);
  };

  // tijdslimiet verstreken: met de deelscore afronden, daarna het resultaatscherm
  // (zonder spraakweergave kon de leerling niets doen: dan niets indienen)
  useEffect(() => {
    if (timeUp && !done && supported && sentences.length > 0) finish([...typed, current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (!supported) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Je browser ondersteunt geen spraakweergave. Probeer een andere browser.</p>;
  if (sentences.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen zinnen ingesteld.</p>;

  const speak = () => {
    const u = new SpeechSynthesisUtterance(sentences[idx].text);
    u.lang = widget.config.lang;
    u.rate = widget.config.rate;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setPlayCount((c) => c + 1);
  };

  const next = () => {
    if (done) return;
    const answers = [...typed, current];
    setTyped(answers);
    setCurrent('');
    setPlayCount(0);
    if (idx + 1 >= sentences.length) finish(answers);
    else setIdx((i) => i + 1);
  };

  if (done) {
    const correct = sentences.filter((s, i) => isCorrect(typed[i], s.text)).length;
    return (
      <div>
        <ResultHero earned={correct} max={sentences.length} showScore={widget.settings.showScore} />
        {widget.settings.showFeedback && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h3>Verbetering</h3>
            {sentences.map((s, i) => {
              const ok = isCorrect(typed[i], s.text);
              return (
                <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontWeight: 600, color: ok ? 'var(--ok)' : 'var(--err)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {ok ? <CheckIcon size={16} aria-hidden /> : <CloseIcon size={16} aria-hidden />} Jij schreef: {typed[i] || '—'}
                  </div>
                  {!ok && <div style={{ color: 'var(--ok)' }}>Juist: {s.text}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      <GameStatus>
        <span>Zin {idx + 1} / {sentences.length}</span>
      </GameStatus>
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <button className="btn btn-primary btn-lg" onClick={speak}>
          <Volume2 size={18} aria-hidden /> {playCount === 0 ? 'Beluister de zin' : 'Nog eens beluisteren'}
        </button>
        {playCount > 0 && <p className="hint" style={{ marginTop: 10 }}>{playCount}× beluisterd</p>}
      </div>
      <textarea
        className="textarea"
        rows={3}
        placeholder="Typ hier wat je hoort…"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        aria-label="Jouw dictee-antwoord"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="player-nav">
        <span />
        <button className="btn btn-primary" onClick={next} disabled={!current.trim()}>
          {idx + 1 >= sentences.length ? <><CheckIcon size={18} aria-hidden /> Indienen</> : <>Volgende <ArrowRight size={18} aria-hidden /></>}
        </button>
      </div>
    </div>
  );
}
