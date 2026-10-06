import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from '../components/Brand';
import { Link } from 'react-router-dom';
import { PenLine, Sprout, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import type { Submission } from '../lib/types';
import { EmptyState, useToast } from '../components/ui';
import { downloadFile, formatDate, pct } from '../lib/utils';
import { describeProgressImport, exportProgress, importProgress } from '../lib/progressTransfer';
import { getStudentContext } from '../lib/studentContext';
import { ExportIcon, ImportIcon, SearchIcon, StudentIcon } from '../components/icons';
import '../styles/leerling.css';

/**
 * "Mijn voortgang" voor de leerling op dit toestel.
 *
 * Didactische keuze: we vergelijken uitsluitend met de eigen eerdere pogingen
 * van de leerling — nooit met klasgemiddelden of andere leerlingen. Groei ten
 * opzichte van jezelf motiveert; ranglijstjes doen dat zelden.
 */

interface WidgetGroep {
  widgetId: string;
  widgetCode: string;
  /** null wanneer de widget niet (meer) op dit toestel staat (bv. gespeeld via draagbare link). */
  titel: string | null;
  /** Pogingen van deze leerling, oudste eerst. */
  pogingen: Submission[];
  /** submittedAt van de nieuwste poging (voor sortering). */
  laatste: number;
}

function scoreKleur(p: number): string {
  return p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';
}

export function ProgressPage() {
  // Live meebewegen wanneer er (in een ander tabblad) een inzending bijkomt.
  const [tick, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  const subs = useMemo(
    () => getSubmissions().slice().sort((a, b) => b.submittedAt - a.submittedAt),
    [tick]
  );
  const widgetTitels = useMemo(() => {
    const map = new Map<string, string>();
    getWidgets().forEach((w) => map.set(w.id, w.title));
    return map;
  }, [tick]);

  // Alle namen die op dit toestel iets indienden, meest recente eerst.
  const namen = useMemo(() => {
    const gezien = new Set<string>();
    const out: string[] = [];
    for (const s of subs) {
      const key = s.studentName.trim().toLowerCase();
      if (!gezien.has(key)) {
        gezien.add(key);
        out.push(s.studentName);
      }
    }
    return out;
  }, [subs]);

  // Werkt deze leerling onder een klasidentiteit? Dan beginnen we bij zijn
  // eigen naam en tonen we bovenaan de weg terug naar zijn klas.
  // tick is een bewuste herlees-trigger, geen echte afhankelijkheid
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const studentCtx = useMemo(() => getStudentContext(), [tick]);
  const [gekozen, setGekozen] = useState<string | null>(() => getStudentContext()?.studentName ?? null);
  // Wie is er aan het kijken? Nooit stilzwijgend de resultaten van iemand anders
  // tonen (en exporteren): met een gekozen of klasnaam is dat die naam, ook als
  // er nog niets van die naam is (dan volgt de lege staat). Zonder naam alleen als
  // er precies één naam op dit toestel is; anders kiest de leerling eerst zelf.
  // De canonieke schrijfwijze geven we terug: anders toont de select niets wanneer
  // dezelfde naam later met andere hoofdletters opnieuw indient.
  const actieveNaam = gekozen
    ? (namen.find((n) => n.toLowerCase() === gekozen.toLowerCase()) ?? gekozen)
    : (namen.length === 1 ? namen[0] : '');
  const opties = namen.includes(actieveNaam) || !actieveNaam ? namen : [actieveNaam, ...namen];

  // ── Voortgang meenemen naar een ander toestel ─────────────────────────────
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const exporteerVoortgang = () => {
    if (!actieveNaam) return;
    const safe =
      actieveNaam.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').toLowerCase() ||
      'leerling';
    void exportProgress(actieveNaam).then((json) => downloadFile(`voortgang-${safe}.json`, json));
    toast(`Voortgang van ${actieveNaam} gedownload`, 'ok');
  };

  const importeerBestand = async (f: File) => {
    let tekst: string;
    try {
      tekst = await f.text();
    } catch {
      toast('Het bestand kon niet gelezen worden', 'err');
      return;
    }
    const res = importProgress(tekst);
    if (!res) {
      toast('Dit is geen geldig voortgangsbestand van Boosterz', 'err');
      return;
    }
    // Eerlijk melden: ook wat door een volle opslag niet bewaard werd (G8) en
    // wat veel te groot was (S2), niet enkel "alles stond hier al".
    const melding = describeProgressImport(res);
    toast(melding.text, melding.kind);
    // meteen naar de geïmporteerde naam springen
    if (res.naam) setGekozen(res.naam);
  };

  const groepen = useMemo<WidgetGroep[]>(() => {
    // zonder naam niets tonen: een inzending zonder naam hoort niet bij "niemand"
    const mijn = actieveNaam
      ? subs.filter((s) => s.studentName.trim().toLowerCase() === actieveNaam.trim().toLowerCase())
      : [];
    const map = new Map<string, WidgetGroep>();
    for (const s of mijn) {
      let g = map.get(s.widgetId);
      if (!g) {
        g = {
          widgetId: s.widgetId,
          widgetCode: s.widgetCode,
          titel: widgetTitels.get(s.widgetId) ?? null,
          pogingen: [],
          laatste: 0,
        };
        map.set(s.widgetId, g);
      }
      g.pogingen.push(s);
      g.laatste = Math.max(g.laatste, s.submittedAt);
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.pogingen.sort((a, b) => a.submittedAt - b.submittedAt));
    arr.sort((a, b) => b.laatste - a.laatste);
    return arr;
  }, [subs, actieveNaam, widgetTitels]);

  return (
    <div className="player-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="player-topbar">
        <Link to="/meedoen" className="topbar-logo" style={{ fontSize: '1.05rem' }}>
          <BrandMark size={28} />
          <span className="wordmark">Booster<b>z</b></span>
        </Link>
        <span className="title">Mijn voortgang</span>
        <Link to="/meedoen" className="btn btn-sm btn-ghost"><StudentIcon size={15} aria-hidden /> Meedoen</Link>
      </header>

      <main id="main" className="player-main">
        <h1 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: 9 }}>
          <TrendingUp size={24} aria-hidden /> Mijn voortgang
        </h1>

        {studentCtx && (
          <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Mijn klas">
            <h2 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Users size={18} aria-hidden /> Mijn klas
            </h2>
            <p style={{ color: 'var(--text-soft)', margin: '6px 0 10px' }}>
              Je werkt als <strong>{studentCtx.studentName}</strong> in {studentCtx.className}. Daar
              staan je opdrachten én de codes die je nog moet doorgeven.
            </p>
            <Link to={`/leerling/${studentCtx.classCode}`} className="btn btn-primary">
              Naar mijn klas
            </Link>
          </section>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Voortgangsbestand kiezen"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importeerBestand(f);
            e.target.value = '';
          }}
        />

        {subs.length === 0 ? (
          <EmptyState icon={<Sprout size={40} />} title="Nog geen voortgang op dit toestel">
            <p>
              Zodra je hier een opdracht maakt, zie je op deze pagina al je pogingen en hoe je groeit.
              Je voortgang wordt <strong>per toestel</strong> bewaard: werkte je eerder op een ander
              toestel, dan staat je voortgang daar. Heb je daar een voortgangsbestand geëxporteerd?
              Importeer het hier.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/meedoen" className="btn btn-primary"><StudentIcon size={16} aria-hidden /> Meedoen met een opdracht</Link>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                <ImportIcon size={16} aria-hidden /> Voortgang importeren
              </button>
            </div>
          </EmptyState>
        ) : (
          <>
            <p style={{ color: 'var(--text-soft)' }}>
              Je vergelijkt hier alleen met je <strong>eigen eerdere pogingen</strong> — niet met
              anderen. Groeien doe je ten opzichte van jezelf.
            </p>

            <div className="field" style={{ maxWidth: 340 }}>
              <label htmlFor="voortgang-naam">Wie ben jij?</label>
              <select
                id="voortgang-naam"
                className="select"
                value={actieveNaam}
                onChange={(e) => setGekozen(e.target.value || null)}
              >
                {!actieveNaam && <option value="">Kies je naam</option>}
                {opties.map((n) => (
                  <option key={n.toLowerCase()} value={n}>{n}</option>
                ))}
              </select>
              <span className="hint">Alle namen die op dit toestel een opdracht maakten.</span>
            </div>

            <div className="field" style={{ maxWidth: 520 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={exporteerVoortgang}
                  disabled={!actieveNaam}
                  aria-label={actieveNaam ? `Voortgang van ${actieveNaam} exporteren als bestand` : 'Voortgang exporteren als bestand (kies eerst je naam)'}
                >
                  <ExportIcon size={15} aria-hidden /> Voortgang exporteren
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Voortgangsbestand importeren"
                >
                  <ImportIcon size={15} aria-hidden /> Voortgang importeren
                </button>
              </div>
              <span className="hint">
                Zo neem je je voortgang mee naar een ander toestel (bv. van de klas-pc naar thuis):
                exporteer hier, importeer daar. Het bestand bevat jouw antwoorden — deel het niet
                met anderen.
              </span>
            </div>

            {!actieveNaam ? (
              <EmptyState icon={<StudentIcon size={40} />} title="Kies eerst je naam">
                <p>Kies hierboven je naam om je pogingen te zien.</p>
              </EmptyState>
            ) : groepen.length === 0 ? (
              <EmptyState icon={<SearchIcon size={40} />} title="Geen inzendingen voor deze naam">
                <p>Kies hierboven een andere naam.</p>
              </EmptyState>
            ) : (
              groepen.map((g) => <WidgetGroepKaart key={g.widgetId} groep={g} />)
            )}
          </>
        )}
      </main>
    </div>
  );
}

function WidgetGroepKaart({ groep }: { groep: WidgetGroep }) {
  const naam = groep.titel ?? `opdracht met code ${groep.widgetCode}`;

  // Groei: nieuwste scorebare poging t.o.v. de éérste scorebare poging.
  const metScore = groep.pogingen.filter((p) => p.totalMax > 0);
  let groei: number | null = null;
  if (metScore.length >= 2) {
    const eerste = pct(metScore[0].totalEarned, metScore[0].totalMax);
    const laatste = pct(metScore[metScore.length - 1].totalEarned, metScore[metScore.length - 1].totalMax);
    groei = laatste - eerste;
  }

  return (
    <section className="card card-pad" style={{ marginTop: 16 }} aria-label={`Voortgang voor ${naam}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', flex: 1, minWidth: 180 }}>
          {groep.titel ?? (
            <>
              Opdracht met code{' '}
              <span style={{ fontFamily: 'monospace' }}>{groep.widgetCode}</span>
            </>
          )}
        </h2>
        {groei !== null && (
          <span
            className={`badge ${groei > 0 ? 'badge-ok' : groei < 0 ? 'badge-warn' : 'badge-brand'}`}
            role="status"
          >
            {groei > 0
              ? <><TrendingUp size={13} aria-hidden /> +{groei}% t.o.v. je eerste poging</>
              : groei < 0
                ? <><TrendingDown size={13} aria-hidden /> {groei}% t.o.v. je eerste poging</>
                : 'gelijk aan je eerste poging'}
          </span>
        )}
      </div>
      {!groep.titel && (
        <p className="hint" style={{ color: 'var(--text-soft)', fontSize: '0.82rem', margin: '0 0 6px' }}>
          Deze oefening staat niet (meer) op dit toestel — je speelde ze wellicht via een draagbare link.
        </p>
      )}

      <div role="list" aria-label={`Pogingen voor ${naam}`}>
        {groep.pogingen.map((p, i) => {
          const procent = p.totalMax > 0 ? pct(p.totalEarned, p.totalMax) : null;
          return (
            <div
              key={p.id}
              role="listitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '9px 0',
                borderBottom: i < groep.pogingen.length - 1 ? '1px solid var(--line)' : 'none',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.88rem', minWidth: 74 }}>Poging {i + 1}</span>
              <span style={{ color: 'var(--text-soft)', fontSize: '0.85rem', minWidth: 128 }}>
                {formatDate(p.submittedAt)}
              </span>
              {procent === null ? (
                <span style={{ color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                  — geen score bij deze opdracht
                </span>
              ) : (
                <div
                  className="scorebar"
                  style={{ flex: 1 }}
                  role="img"
                  aria-label={`Score: ${procent} procent (${p.totalEarned} van ${p.totalMax} punten)`}
                >
                  <div className="bar">
                    <div style={{ width: `${procent}%`, background: scoreKleur(procent) }} />
                  </div>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{procent}%</strong>
                </div>
              )}
              {p.status === 'submitted' && p.totalMax > 0 && (
                <span className="badge badge-warn" title="Je leerkracht moet nog een deel verbeteren; je score kan nog veranderen">
                  <PenLine size={12} aria-hidden /> nog niet volledig verbeterd
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
