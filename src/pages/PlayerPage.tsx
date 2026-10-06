import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
// Timer is al onderdeel van de hoofdbundel (widgets/registry.tsx, tegel van
// de widgetsoort "Klastimer"): hergebruiken hier kost geen extra kB.
import { Timer } from 'lucide-react';
import { bumpAttemptCount, getAttemptCount, getWidgetByCode, markStarted, saveSubmission } from '../lib/storage';
import { hasUnresolvedMedia, onMediaChange } from '../lib/mediaStore';
import { getTypeDef } from '../widgets/registry';
import type { Submission, Widget } from '../lib/types';
import type { PlayerResult } from '../widgets/shared';
import { uid } from '../lib/utils';
import { readableAccent } from '../lib/color';
import { hasProgress } from '../lib/autosave';
import { encodeSubmission } from '../lib/share';
import { clearStudentContext, getStudentContext } from '../lib/studentContext';
// QR-weergave (qrcode-bibliotheek), foutenanalyse en de doelkaart pas laden
// wanneer een leerling echt heeft ingediend: houdt de hoofdbundel, het
// kritieke leerlingpad tot en met "spelen", licht.
const CodeQr = React.lazy(() => import('../components/CodeQr').then((m) => ({ default: m.CodeQr })));
const FoutenAnalysePanel = React.lazy(() => import('./PlayerFeedback').then((m) => ({ default: m.FoutenAnalysePanel })));
const DoelKaart = React.lazy(() => import('./PlayerFeedback').then((m) => ({ default: m.DoelKaart })));
import { A11yMenu, loadA11y } from '../components/A11yMenu';
import { TypeTile } from '../components/TypeTile';
import '../styles/leerling.css';

/**
 * Eén vorm van de leerlingnaam voor alles wat per leerling op dit toestel
 * bewaard wordt: deadline, pogingen en hervatten. Anders geeft "emma " na
 * herladen een verse tijdslimiet terwijl het werk van "Emma" wel terugkomt.
 */
function studentKeyOf(name: string): string {
  return name.trim().toLowerCase() || 'anoniem';
}

/** Sleutel waaronder de deadline van één leerling bewaard wordt. */
function deadlineKey(widgetId: string, name: string): string {
  return `wf.deadline.${widgetId}.${studentKeyOf(name)}`;
}

const isExpired = (w: Widget) => !!w.settings.expiresAt && Date.now() > new Date(w.settings.expiresAt).getTime();

/**
 * Ingeleverde bestanden staan als verwijzing ({ name, size, fileId }) in de
 * antwoorden; het bestand zelf blijft in IndexedDB en reist niet mee in de
 * resultaatcode. Geeft de namen, zodat de leerling dat te zien krijgt.
 */
function filesNotInCode(v: unknown, out: string[] = [], depth = 0): string[] {
  if (!v || typeof v !== 'object' || depth > 4) return out;
  const o = v as Record<string, unknown>;
  if (typeof o.name === 'string' && typeof o.size === 'number' && typeof o.fileId === 'string' && o.fileId && typeof o.dataUrl !== 'string') {
    out.push(o.name);
  } else {
    for (const x of Object.values(o)) filesNotInCode(x, out, depth + 1);
  }
  return out;
}

export function PlayerPage() {
  const { code } = useParams();
  // Eén keer lezen — een oefening mag niet onder de handen van een leerling
  // veranderen. Uitzondering: staat er nog een media-verwijzing in die pas
  // later oplost (blob nog onderweg uit IndexedDB, of net in een ander tabblad
  // toegevoegd), dan lezen we opnieuw zodra de medialaag klaar is.
  const [mediaTick, setMediaTick] = useState(0);
  // mediaTick is een bewuste herlees-trigger, geen echte afhankelijkheid
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const widget = useMemo(() => (code ? getWidgetByCode(code) : undefined), [code, mediaTick]);
  useEffect(() => {
    if (!widget || !hasUnresolvedMedia(widget)) return;
    return onMediaChange(() => setMediaTick((t) => t + 1));
  }, [widget]);

  if (!widget) {
    return (
      <div className="player-shell" style={{ minHeight: '100vh' }}>
        <main id="main" className="player-main" style={{ textAlign: 'center', paddingTop: 80 }}>
          <h1>Oefening niet gevonden</h1>
          <p style={{ color: 'var(--text-soft)' }}>
            Er bestaat geen oefening met code <strong style={{ fontFamily: 'monospace' }}>{code}</strong> op dit toestel.<br />
            Controleer de code, of vraag je leerkracht om de <em>draagbare link</em> als je op een ander toestel werkt.
          </p>
          <Link to="/meedoen" className="btn btn-primary">Code opnieuw invoeren</Link>
        </main>
      </div>
    );
  }

  // key zorgt dat de volledige leerlingflow herstart bij een andere code
  return <WidgetRunner key={widget.id} widget={widget} recordSubmission />;
}

/**
 * Volledige leerlingflow rond een widget:
 * naam → instructies → spelen (met evt. tijdslimiet/toetsmodus) → indienen.
 */
export function WidgetRunner({ widget, recordSubmission }: { widget: Widget; recordSubmission: boolean }) {
  const def = getTypeDef(widget.type);
  const savesWork = recordSubmission && def.hasSubmissions;
  const needsName = savesWork && widget.settings.requireName;

  // Werkt deze leerling onder een klasidentiteit (klaslink/klaspakket)? Dan
  // staat zijn naam vast: die komt uit de klaslijst, niet uit een tekstveld.
  // Zo hangt élke inzending aan hetzelfde studentId — ook thuis, ook morgen.
  const [studentCtx, setStudentCtx] = useState(() => getStudentContext());
  const [name, setName] = useState(() => getStudentContext()?.studentName ?? '');
  // De gate is ook nodig zonder naamplicht: start() initialiseert timer,
  // pogingenteller, live-registratie en toetsmodus — die mogen niet worden
  // overgeslagen wanneer alleen requireName uit staat.
  const needsGate =
    needsName ||
    !!widget.settings.instructions ||
    widget.settings.timeLimitMin > 0 ||
    widget.settings.maxAttempts > 0 ||
    !!widget.settings.examMode ||
    savesWork;
  const [phase, setPhase] = useState<'gate' | 'playing'>(needsGate ? 'gate' : 'playing');
  // Persoonlijk doel (optioneel, gekozen op het startscherm)
  const [doelProces, setDoelProces] = useState('');
  const [doelStreef, setDoelStreef] = useState(0);
  const [doelVrij, setDoelVrij] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  // Absolute eindtijd: elke tik rekent opnieuw vanaf de klok, zodat een
  // tabblad of toestel dat sliep de tijdslimiet niet stillegt.
  const endRef = useRef<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [completedSub, setCompletedSub] = useState<Submission | null>(null);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const focusLossRef = useRef(0);
  const [focusWarn, setFocusWarn] = useState(0);
  const [a11y, setA11y] = useState(loadA11y);
  const mainRef = useRef<HTMLElement>(null);

  // De deadline sluit alleen het starten af ("Na dit tijdstip kunnen
  // leerlingen niet meer starten"). Daarom state, geen berekening per render:
  // wie al bezig is of net indiende, verliest zijn scherm niet wanneer de
  // deadline intussen verstrijkt. Alleen start() kan dit nog omzetten.
  const [expired, setExpired] = useState(() => isExpired(widget));

  /** Na "Starten" verdwijnt de knop: de focus naar main, tenzij de oefening die al nam. */
  const focusMain = () => requestAnimationFrame(() => {
    const m = mainRef.current;
    if (m && !m.contains(document.activeElement)) m.focus();
  });

  const start = () => {
    if (needsName && !name.trim()) return;
    if (isExpired(widget)) { setExpired(true); focusMain(); return; }
    const studentKey = studentKeyOf(name);
    const resuming = hasProgress(widget.id, studentKey);
    // Een poging telt pas bij het indienen (zie onComplete): herladen of het
    // tabblad per ongeluk sluiten kost dan geen kans.
    if (savesWork && widget.settings.maxAttempts > 0 && getAttemptCount(widget.id, studentKey) >= widget.settings.maxAttempts) {
      setBlocked(true);
      focusMain();
      return;
    }
    if (savesWork) markStarted(widget.id, name.trim() || 'Anoniem');
    if (widget.settings.examMode) {
      document.documentElement.requestFullscreen?.().catch(() => { /* volledig scherm is best-effort */ });
    }
    startRef.current = Date.now();
    if (widget.settings.timeLimitMin > 0) {
      // deadline overleeft herladen: hervatten geeft geen verse tijd, en
      // nooit meer tijd dan een verse start
      const key = deadlineKey(widget.id, name);
      let end = Date.now() + widget.settings.timeLimitMin * 60000;
      if (resuming) {
        let saved = NaN;
        try { saved = parseInt(localStorage.getItem(key) ?? '', 10); } catch { /* best effort */ }
        if (!Number.isNaN(saved)) end = Math.min(saved, end);
      }
      try { localStorage.setItem(key, String(end)); } catch { /* best effort */ }
      endRef.current = end;
      setTimeLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    }
    setPhase('playing');
    focusMain();
  };

  // aftellen vanaf de eindtijd (stopt zodra de tijd om is of de leerling indiende)
  useEffect(() => {
    const end = endRef.current;
    if (phase !== 'playing' || end === null || timeUp || completedSub) return;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) setTimeUp(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    // terug uit de achtergrond of slaapstand: meteen herrekenen
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [phase, timeUp, completedSub]);

  // toetsmodus: registreren wanneer de leerling het venster verlaat
  useEffect(() => {
    if (!widget.settings.examMode || phase !== 'playing') return;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !doneRef.current) {
        focusLossRef.current += 1;
        setFocusWarn(focusLossRef.current);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase, widget.settings.examMode]);

  // Stabiele identiteit: anders krijgt de gememoiseerde speler hieronder bij elke
  // timertik een nieuwe prop en hertekent de hele oefening zich.
  const onComplete = useCallback((result: PlayerResult) => {
    if (doneRef.current || !recordSubmission || !def.hasSubmissions) return;
    // lege widget die door timeUp "afrondt" zonder enige inhoud: niets registreren
    if (result.max === 0 && Object.keys(result.answers).length === 0) return;
    doneRef.current = true;
    // de poging telt bij het indienen, één keer per inzending
    if (widget.settings.maxAttempts > 0) bumpAttemptCount(widget.id, studentKeyOf(name));
    try { localStorage.removeItem(deadlineKey(widget.id, name)); } catch { /* best effort */ }
    if (widget.settings.examMode && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { /* negeren */ });
    }
    // Persoonlijk doel (indien gekozen) bij de antwoorden bewaren
    const doel: PersoonlijkDoel = {
      ...(doelProces ? { proces: doelProces } : {}),
      ...(doelStreef > 0 ? { streef: doelStreef } : {}),
      ...(doelVrij.trim() ? { vrij: doelVrij.trim() } : {}),
    };
    const heeftDoel = Object.keys(doel).length > 0;
    const sub: Submission = {
      id: uid(),
      widgetId: widget.id,
      widgetCode: widget.code,
      studentName: name.trim() || 'Anoniem',
      startedAt: startRef.current,
      submittedAt: Date.now(),
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      answers: heeftDoel ? { ...result.answers, _doel: doel } : result.answers,
      itemScores: result.itemScores,
      totalEarned: result.earned,
      totalMax: result.max,
      status: result.hasPending ? 'submitted' : 'graded',
      ...(widget.settings.examMode ? { focusLosses: focusLossRef.current } : {}),
      // Klasidentiteit meegeven: daarmee telt het klasoverzicht op leerling
      // (niet op ingetikte naam), ook wanneer de code later binnenkomt.
      ...(studentCtx ? { classId: studentCtx.classId } : {}),
      ...(studentCtx?.studentId ? { studentId: studentCtx.studentId } : {}),
    };
    saveSubmission(sub);
    setCompletedSub(sub);
  }, [recordSubmission, def, widget, name, doelProces, doelStreef, doelVrij, studentCtx]);

  // De widgetmodule zelf is het duurste stuk van de pagina. Zolang de leerling
  // dezelfde opdracht speelt verandert er niets aan haar props, dus houden we
  // het element vast: een timertik, een toetsmodus-waarschuwing of een a11y-
  // instelling hertekent dan de balk eromheen, niet de hele oefening.
  const studentName = name.trim() || 'Anoniem';
  const playerNode = useMemo(
    () => <def.Player widget={widget} studentName={studentName} timeUp={timeUp} onComplete={onComplete} />,
    [def, widget, studentName, timeUp, onComplete]
  );

  // encodeSubmission comprimeert (lz-string) de volledige inzending, met de
  // media ingelijnd — async, dus als state.
  const [resultCode, setResultCode] = useState('');
  // Vroeger enkel op vraag (offerResultCode) of met een klasidentiteit: wie
  // thuis met een losse code werkte, kreeg dan nooit een code om aan zijn
  // leerkracht te geven (audit, hoge prioriteit). Een leerling die op het
  // toestel van de leerkracht zelf speelt (bv. een klasdemo) heeft de code
  // strikt genomen niet nodig — zijn inzending staat al lokaal bij de
  // leerkracht — maar ziet hem nu ook: één onschuldig extra scherm, tegenover
  // een leerling die zijn werk anders nooit kan laten toekomen. Veilige
  // standaard: altijd tonen zodra de widget inzendingen oplevert.
  const showResultCode = def.hasSubmissions;
  useEffect(() => {
    let alive = true;
    if (!showResultCode || !completedSub) {
      setResultCode('');
      return;
    }
    void encodeSubmission(completedSub)
      .then((code) => { if (alive) setResultCode(code); })
      .catch(() => { if (alive) setResultCode(''); });
    return () => { alive = false; };
  }, [showResultCode, completedSub]);

  const lostFiles = completedSub ? filesNotInCode(completedSub.answers) : [];

  const mm = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const ss = timeLeft !== null ? timeLeft % 60 : 0;

  return (
    <div
      className={`player-shell ${a11y.calm ? 'calm' : ''} ${a11y.spacing ? 'spaced' : ''}`}
      style={{
        minHeight: '100vh',
        fontSize: a11y.scale !== 1 ? `${a11y.scale}em` : undefined,
        // Een te lichte accentkleur wordt donkerder, zodat tekst en knoppen leesbaar blijven (W15d).
        ['--player-accent' as any]: readableAccent(widget.settings.accentColor),
      }}
    >
      <header className="player-topbar">
        <div className="player-topbar-row1">
          {phase === 'playing' && timeLeft !== null && (
            <span
              className={`player-chip ${timeLeft <= 60 ? 'chip-err' : timeLeft <= 180 ? 'chip-warn' : 'chip-brand'}`}
              style={{ fontVariantNumeric: 'tabular-nums' }}
              role="timer"
              aria-label={`Nog ${mm} minuten ${ss} seconden`}
            >
              <Timer size={14} aria-hidden />
              {mm}:{ss.toString().padStart(2, '0')}
            </span>
          )}
          {widget.settings.examMode && phase === 'playing' && (
            <span className="player-chip chip-warn" title="Toetsmodus actief: het verlaten van het venster wordt geregistreerd">
              Toetsmodus
            </span>
          )}
          {name && <span className="player-chip">{name}</span>}
          <span className="sp" />
          {studentCtx && (
            <Link to={`/leerling/${studentCtx.classCode}`} className="btn btn-sm btn-ghost">
              Mijn klas
            </Link>
          )}
          <A11yMenu value={a11y} onChange={setA11y} />
        </div>
        <div className="player-topbar-row2">
          <TypeTile type={def} size="sm" />
          <h1 className="title">{widget.title}</h1>
        </div>
      </header>

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={`player-main ${def.wide ? 'player-main-wide' : ''}`}
        style={{ outline: 'none' }}
      >
        {expired ? (
          <div className="card result-hero">
            <h2>Deze opdracht is afgesloten</h2>
            <p style={{ color: 'var(--text-soft)' }}>
              De deadline is verstreken. Neem contact op met je leerkracht.
            </p>
          </div>
        ) : blocked ? (
          <div className="card result-hero">
            <h2>Maximaal aantal pogingen bereikt</h2>
            <p style={{ color: 'var(--text-soft)' }}>
              Je hebt deze opdracht al {widget.settings.maxAttempts}× gemaakt. Vraag je leerkracht om een extra kans.
            </p>
          </div>
        ) : phase === 'gate' ? (
          <div className="card card-pad" style={{ maxWidth: 480, margin: '40px auto 0', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><TypeTile type={def} size="xl" /></div>
            <h2 style={{ fontSize: '1.5rem' }}>{widget.title}</h2>
            <p style={{ color: 'var(--text-soft)' }}>{def.name}</p>
            {widget.settings.instructions && (
              <div className="callout" style={{ textAlign: 'left' }}>
                <div>{widget.settings.instructions}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              {widget.settings.timeLimitMin > 0 && (
                <span className="badge badge-warn"><Timer size={14} aria-hidden /> {widget.settings.timeLimitMin} minuten</span>
              )}
              {widget.settings.examMode && (
                <span className="badge badge-warn" title="Volledig scherm; het verlaten van het venster wordt geregistreerd">
                  Toetsmodus
                </span>
              )}
            </div>
            {/* Met een klasidentiteit landt het werk onder die leerling, ook
                zonder naamplicht: dan altijd tonen als wie je werkt, met "Wissel". */}
            {savesWork && studentCtx ? (
              <div className="field" style={{ textAlign: 'left' }}>
                <label htmlFor="student-name">Jouw naam</label>
                <input
                  id="student-name"
                  className="input"
                  value={name}
                  readOnly
                  aria-readonly="true"
                  aria-describedby="student-name-hint"
                />
                <span className="hint" id="student-name-hint">
                  Je werkt als <strong>{studentCtx.studentName}</strong> uit {studentCtx.className}.
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-quiet leerling-tap-target"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => { clearStudentContext(); setStudentCtx(null); setName(''); }}
                >
                  Niet jij? Wissel.
                </button>
              </div>
            ) : needsName && (
              <div className="field" style={{ textAlign: 'left' }}>
                <label htmlFor="student-name">Jouw naam</label>
                <input
                  id="student-name"
                  className="input"
                  value={name}
                  placeholder="Voornaam (of klasnummer)"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') start(); }}
                  autoFocus
                />
                <span className="hint">Een voornaam of klasnummer is genoeg.</span>
              </div>
            )}
            {savesWork && (
              <details className="card" style={{ textAlign: 'left', padding: '10px 14px', margin: '4px 0 14px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Kies je doel (optioneel)</summary>
                <p style={{ color: 'var(--text-soft)', fontSize: '0.88rem', margin: '10px 0 8px' }}>
                  Een doel kiezen helpt je gerichter te werken. Het telt niet mee voor punten;
                  na afloop kijk je er zelf even op terug.
                </p>
                <div
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
                  role="group"
                  aria-label="Kies een procesdoel"
                >
                  {PROCES_DOELEN.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`chip proces-doel-chip ${doelProces === d ? 'placed' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '0.83rem' }}
                      aria-pressed={doelProces === d}
                      onClick={() => setDoelProces((cur) => (cur === d ? '' : d))}
                    >
                      {doelProces === d ? '✓ ' : ''}{d}
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="doel-streef">Streefscore</label>
                  <select
                    id="doel-streef"
                    className="select"
                    value={doelStreef}
                    onChange={(e) => setDoelStreef(Number(e.target.value))}
                  >
                    <option value={0}>Geen streefscore</option>
                    <option value={50}>Minstens 50%</option>
                    <option value={70}>Minstens 70%</option>
                    <option value={90}>Minstens 90%</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="doel-vrij">Eigen doel (in je eigen woorden)</label>
                  <input
                    id="doel-vrij"
                    className="input"
                    value={doelVrij}
                    placeholder='bv. "Ik controleer mijn antwoord voor ik verderga."'
                    onChange={(e) => setDoelVrij(e.target.value)}
                  />
                </div>
              </details>
            )}
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={needsName && !name.trim()} onClick={start}>
              Starten
            </button>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Je antwoorden blijven op dit toestel en zijn alleen voor je leerkracht. Er wordt niets op internet bewaard.
            </p>
          </div>
        ) : (
          <>
            {timeUp && !completedSub && (
              <div className="callout err" role="alert">
                <div><strong>De tijd is om!</strong>{savesWork && ' Je antwoorden worden automatisch ingediend.'}</div>
              </div>
            )}
            {widget.settings.examMode && focusWarn > 0 && !doneRef.current && (
              <div className="callout warn" role="alert">
                <div>Je verliet het toetsvenster ({focusWarn}×). Dit wordt bij je inzending vermeld.</div>
              </div>
            )}
            {/* de widgetmodule wordt lazy geladen (zie registry): even een laadmelding tonen */}
            <React.Suspense fallback={<div className="hint" role="status" style={{ textAlign: 'center', padding: '40px 0' }}>Oefening laden…</div>}>
              {playerNode}
            </React.Suspense>
            <React.Suspense fallback={null}>
              {completedSub && widget.settings.showFeedback && (
                <FoutenAnalysePanel
                  widget={widget}
                  submission={completedSub}
                  onSaved={(updated) => setCompletedSub(updated)}
                />
              )}
              {completedSub && (
                <DoelKaart
                  submission={completedSub}
                  showScore={widget.settings.showScore}
                  onSaved={(updated) => setCompletedSub(updated)}
                />
              )}
            </React.Suspense>
            {showResultCode && completedSub && (
              <div className="card card-pad" style={{ marginTop: 18 }}>
                <h3>Stuur je resultaat naar je leerkracht</h3>
                {/* resultaatcode bevat ook de foutenanalyse als die vóór het kopiëren is ingevuld */}
                <p style={{ color: 'var(--text-soft)', fontSize: '0.92rem' }}>
                  Toon deze code of QR aan je leerkracht, of kopieer hem.
                </p>
                {lostFiles.length > 0 && (
                  <div className="callout warn" role="note">
                    <div>{lostFiles.length === 1
                      ? `Je bestand ‘${lostFiles[0]}’ zit niet in deze code; bezorg het apart aan je leerkracht.`
                      : `Je bestanden ${lostFiles.map((n) => `‘${n}’`).join(', ')} zitten niet in deze code; bezorg ze apart aan je leerkracht.`}</div>
                  </div>
                )}
                {resultCode ? (
                  <>
                    <React.Suspense fallback={<span className="hint" role="status">QR-code maken…</span>}>
                      <CodeQr value={resultCode} label="jouw resultaat" size={180} copyLabel="Code kopiëren" />
                    </React.Suspense>
                    <input
                      className="input input-sm result-code-text" readOnly value={resultCode}
                      aria-label="Resultaatcode" onFocus={(e) => e.target.select()}
                      style={{ width: '100%', marginTop: 12 }}
                    />
                  </>
                ) : (
                  <p className="hint" role="status" aria-busy>Je code wordt klaargemaakt…</p>
                )}
                {studentCtx && (
                  <p style={{ margin: '12px 0 0' }}>
                    <Link to={`/leerling/${studentCtx.classCode}`}>Terug naar mijn klas</Link>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Persoonlijk doel ─────────────────────────────────────────────────────────
// FoutenAnalysePanel en DoelKaart (de weergave na het indienen) zijn verhuisd
// naar PlayerFeedback.tsx, lui geladen — zie de imports bovenaan dit bestand.

/** Vorm van answers._doel; ook gebruikt door PlayerFeedback.tsx (DoelKaart). */
export interface PersoonlijkDoel {
  proces?: string;
  streef?: number;
  vrij?: string;
}

const PROCES_DOELEN = [
  'Ik lees elke vraag twee keer',
  'Ik probeer het eerst zonder hint',
  'Ik werk rustig, zonder haast',
];
