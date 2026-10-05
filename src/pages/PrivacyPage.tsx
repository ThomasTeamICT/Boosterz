import React, { useCallback, useEffect, useState } from 'react';
import { Brush, CalendarClock, Save } from 'lucide-react';
import { cleanupStudentFiles, collectFileIds, getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import { ConfirmModal, useToast } from '../components/ui';
import {
  CheckIcon, DeleteIcon, ExportIcon, PrintIcon, PrivacyIcon, WarningIcon,
} from '../components/icons';
import { clearAllFiles, collectMediaRefs, mediaStats, pruneOrphanMedia } from '../lib/mediaStore';
import {
  formatBytes, formatPct, LOCALSTORAGE_BUDGET_BYTES, readStorageHealth,
  rememberPersistenceResult, requestPersistence, storageBreakdown, type StorageHealth,
} from '../lib/storageHealth';

// Woorden bij het vulniveau — de kleur van de balk mag nooit de enige drager
// van de boodschap zijn.
const LEVEL_TEXT: Record<StorageHealth['level'], string> = {
  ok: 'Ruim plaats',
  warn: 'Begint vol te raken',
  critical: 'Kritiek vol',
};
const LEVEL_BADGE: Record<StorageHealth['level'], string> = {
  ok: 'badge-ok',
  warn: 'badge-warn',
  critical: 'badge-err',
};

/** Transparantiepagina: welke data staat waar, en hoe ruim je ze op (AVG). */
export function PrivacyPage() {
  const [, force] = useState(0);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [asking, setAsking] = useState(false);
  const [confirm, setConfirm] = useState<null | 'subs' | 'all'>(null);
  const toast = useToast();

  const refreshHealth = useCallback(() => {
    void readStorageHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    refreshHealth();
    return onStorageChange(() => {
      force((x) => x + 1);
      refreshHealth();
    });
  }, [refreshHealth]);

  const widgets = getWidgets();
  const subs = getSubmissions();
  const breakdown = storageBreakdown();
  const media = mediaStats();
  const names = new Set(subs.map((s) => s.studentName));

  const wipeSubmissions = () => {
    // Vóór het wissen noteren welke tekeningen, opnames en ingeleverde
    // bestanden erbij horen: die moeten mee weg, ook de allerjongste.
    let rawSubs = '';
    try {
      rawSubs = localStorage.getItem('wf.submissions.v1') ?? '';
    } catch {
      rawSubs = '';
    }
    const mediaIds = collectMediaRefs(rawSubs);
    const fileIds = collectFileIds(rawSubs);
    localStorage.removeItem('wf.submissions.v1');
    localStorage.removeItem('wf.attempts.v1');
    localStorage.removeItem('wf.live.v1');
    localStorage.removeItem('wf.courseprogress.v1');
    // Op een gedeeld leerlingtoestel: ook wie er ingelogd was en welke
    // klaslijsten via een klaspakket binnenkwamen (namen van leerlingen).
    ['wf.student.v1', 'wf.handed.v1', 'wf.classpacks.v1'].forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage)
      .filter((k) => k.startsWith('wf.autosave.') || k.startsWith('wf.coursename.')
        || k.startsWith('wf.coursenotes.') || k.startsWith('wf.deadline.'))
      .forEach((k) => localStorage.removeItem(k));
    // tekeningen/foto's van de gewiste inzendingen mogen ook weg (best-effort);
    // een expliciete wisactie kent geen leeftijdsgrens
    void pruneOrphanMedia({ only: mediaIds, minAgeMs: 0 }).catch(() => { /* genegeerd */ }).finally(refreshHealth);
    cleanupStudentFiles(fileIds);
    // storage-laag opnieuw laten emitten
    localStorage.setItem('wf.submissions.v1', '[]');
    refreshHealth();
    toast('Alle leerlinggegevens gewist', 'ok');
  };

  const protectStorage = async () => {
    setAsking(true);
    const result = await requestPersistence();
    rememberPersistenceResult(result);
    refreshHealth();
    setAsking(false);
    if (result === 'granted') {
      toast('Deze opslag wordt niet meer automatisch gewist', 'ok');
    } else if (result === 'denied') {
      toast('De browser houdt de bescherming voorlopig af — exporteer regelmatig', 'info');
    } else {
      toast('Deze browser kent deze bescherming niet — exporteer regelmatig', 'info');
    }
  };

  const wipeAll = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('wf.'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('wf.prefs.v1', JSON.stringify({ theme: 'auto', teacherName: '', seeded: true }));
    // Ook de bestandsdatabase (afbeeldingen, audio, bijlagen, pdf's, inzendingen).
    void clearAllFiles().finally(refreshHealth);
    refreshHealth();
    toast('Alles gewist', 'ok');
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PrivacyIcon aria-hidden /> Privacy &amp; gegevens</h1>
          <p className="sub">Transparant over wat deze app bewaart — en hoe je het opruimt.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => window.print()}><PrintIcon size={18} aria-hidden /> Afdrukken voor directie/ouders</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Waar staan de gegevens?</h3>
        <p>
          <strong>Alles staat uitsluitend in de browser van dit toestel</strong> (localStorage).
          Er is geen server, geen account en er wordt <strong>niets naar het internet verstuurd</strong>.
          Deellinks bevatten de oefening zelf (vragen en antwoorden), nooit leerlingresultaten —
          behalve wanneer een leerling bewust zijn <em>resultaatcode</em> of <em>voortgangscode</em> doorstuurt.
        </p>
        <h3>Wat wordt bewaard?</h3>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Widgets</strong> ({widgets.length}): jouw oefeningen.</li>
          <li><strong>Afbeeldingen, audio en bijlagen</strong> ({media.count}, {formatBytes(media.bytes)}): apart bewaard in de bestandsopslag van de browser (IndexedDB), samen met geüploade pdf's en ingeleverde bestanden.</li>
          <li><strong>Cursussen &amp; leesvoortgang</strong>: je cursusinhoud en, per leerling(naam), welke secties gelezen zijn en hoelang.</li>
          <li><strong>Klassen &amp; opdrachten</strong>: klaslijsten (namen en eventueel klasnummers van leerlingen), de opdrachten per klas en, op een leerlingtoestel, de gekozen naam uit de klaslijst. Een klaslijst zijn persoonsgegevens van minderjarigen: deel klaslinks en klaspakketten alleen met de klas zelf.</li>
          <li><strong>Leerplannen</strong>: doelenlijsten die je invoerde of inlas, en bij een nagekeken leerplan de naam die je bij het nakijken invulde (die gaat mee als je exporteert).</li>
          <li><strong>Inzendingen</strong> ({subs.length}, van {names.size} {names.size === 1 ? 'naam' : 'verschillende namen'}): naam, antwoorden, score, tijdstip en duur.</li>
          <li><strong>Tussentijds werk</strong>: automatisch opgeslagen antwoorden zodat leerlingen kunnen hervatten.</li>
          <li><strong>Notities &amp; deadlines</strong>: privénotities van leerlingen bij cursussen en de einddeadline per leerling bij oefeningen met tijdslimiet.</li>
          <li><strong>Voorkeuren</strong>: thema en weergave-instellingen.</li>
        </ul>
        <h3>En de AI-assistent?</h3>
        <p>
          De AI-functies zijn <strong>uit</strong> tot jij zelf een API-sleutel instelt. Gebruik je ze,
          dan vertrekt <strong>alleen wat jij intikt of plakt</strong> (bronmateriaal, leerplandoelen,
          vragen en — bij een feedbackvoorstel — het antwoord van een leerling <em>zonder naam</em>)
          rechtstreeks van je browser naar de door jou gekozen AI-aanbieder, onder diens voorwaarden.
          Stuur nooit namen of gevoelige leerlinggegevens mee. Je sleutel en het gebruikslogboek staan
          alleen op dit toestel — beheer ze bij de <a href="#/ai-instellingen">AI-instellingen</a>.
        </p>
        <h3>Tips voor dataminimalisatie</h3>
        <ul style={{ paddingLeft: 20 }}>
          <li>Een <strong>voornaam of klasnummer volstaat</strong> — vraag geen volledige namen als het niet hoeft.</li>
          <li>Wis inzendingen <strong>op het einde van het schooljaar</strong> of zodra je ze verwerkt hebt.</li>
          <li>CSV-exports met namen bevatten persoonsgegevens: bewaar ze volgens de afspraken van je school en mail ze niet onversleuteld door.</li>
          <li>Op een <strong>gedeeld klas­toestel</strong>: wis regelmatig de leerlinggegevens hieronder.</li>
        </ul>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Save size={20} aria-hidden /> Opslag op dit toestel</h3>
        {!health ? (
          <p style={{ color: 'var(--text-soft)' }}>Het opslaggebruik wordt gemeten…</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <strong>{formatBytes(health.lsBytes)}</strong>
              <span style={{ color: 'var(--text-soft)' }}>
                van ongeveer {formatBytes(LOCALSTORAGE_BUDGET_BYTES)} ({formatPct(health.lsPct)}) gebruikt
              </span>
              <span className={`badge ${LEVEL_BADGE[health.level]}`}>{LEVEL_TEXT[health.level]}</span>
            </div>
            <div className="progressbar" aria-hidden>
              <div
                style={{
                  width: `${Math.max(2, Math.min(100, health.lsPct))}%`,
                  background: health.level === 'critical' ? 'var(--err)' : health.level === 'warn' ? 'var(--warn)' : 'var(--ok)',
                }}
              />
            </div>
            <p className="hint" style={{ marginTop: 8, color: 'var(--text-soft)', fontSize: '0.88rem' }}>
              Widgets, cursussen en inzendingen staan als tekst in de browseropslag. Die is klein — ongeveer
              5 MB voor de hele app, hoeveel plaats je toestel verder ook heeft. Afbeeldingen, audio, bijlagen
              en pdf's staan daarom apart in de bestandsopslag (IndexedDB), waar doorgaans honderden MB
              ruimte is
              {media.count > 0 ? ` (nu ${media.count} ${media.count === 1 ? 'bestand' : 'bestanden'}, ${formatBytes(media.bytes)})` : ''}.{' '}
              {health.estimate
                ? `Alles samen: ${formatBytes(health.estimate.usedBytes)} van ${formatBytes(health.estimate.quotaBytes)} (${formatPct(health.estimate.pct)}).`
                : 'Deze browser geeft het totale quotum niet vrij, dus hierboven staat enkel wat de app in de browseropslag gebruikt.'}
            </p>

            {breakdown.length > 0 && (
              <ul style={{ paddingLeft: 20, margin: '10px 0 0' }}>
                {breakdown.map((slice) => (
                  <li key={slice.label}>
                    {slice.label}: <strong>{formatBytes(slice.bytes)}</strong>
                  </li>
                ))}
              </ul>
            )}

            <hr className="divider" />

            <h4 style={{ marginBottom: 6 }}>Beveiligd tegen automatisch wissen?</h4>
            <p style={{ margin: '0 0 10px' }}>
              <span className={`badge ${health.persisted ? 'badge-ok' : 'badge-warn'}`}>
                {health.persisted ? <><CheckIcon size={14} className="icon-inline" aria-hidden /> Ja — persistente opslag</> : <><WarningIcon size={14} className="icon-inline" aria-hidden /> Nee — niet beveiligd</>}
              </span>
            </p>
            {health.persisted ? (
              <p>
                De browser markeerde de opslag van deze site als <em>persistent</em>: ze wordt niet meer
                opgeruimd omdat je een tijdje niet langskwam of omdat het toestel plaats zoekt. Wissen kan
                nog altijd manueel (browsergegevens wissen, ander profiel, toestel resetten) — een export
                blijft dus nodig.
              </p>
            ) : (
              <>
                <p>
                  De browser mag de opslag van deze site nu automatisch opruimen. Je kan hem vragen dat niet
                  te doen; de browser beslist zelf (Chrome kijkt naar hoe vaak je de app gebruikt, Firefox
                  stelt een vraag, sommige browsers kennen dit niet).
                </p>
                <button className="btn btn-primary" onClick={() => { void protectStorage(); }} disabled={asking}>
                  {asking ? 'Bezig…' : <><PrivacyIcon size={16} aria-hidden /> Opslag beveiligen tegen automatisch wissen</>}
                </button>
              </>
            )}

            <div className="callout warn" style={{ marginTop: 16, marginBottom: 0 }}>
              <CalendarClock aria-hidden />
              <div>
                <strong>Let op — er is geen back-up.</strong> Safari op iPad en iPhone (en op de Mac) wist de
                volledige opslag van een website na ongeveer zeven dagen zonder bezoek: één vakantieweek
                volstaat om een cursus of het werk van leerlingen kwijt te spelen. Ook "browsergegevens
                wissen", een ander gebruikersprofiel of een toestel met weinig vrije ruimte doet dat.
                Exporteer daarom wat je niet wil verliezen: <a href="#/widgets">widgets en mappen</a> als
                pakketbestand, <a href="#/cursussen">cursussen</a> met <ExportIcon size={14} className="icon-inline" aria-hidden /> Exporteren, en resultaten als CSV.
                Zet die bestanden op de schoolschijf — dát is je back-up.
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card card-pad">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Brush size={20} aria-hidden /> Gegevens opruimen</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-danger" onClick={() => setConfirm('subs')} disabled={subs.length === 0}>
            Alle inzendingen &amp; leerlinggegevens wissen ({subs.length})
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm('all')}>
            Alles wissen (ook widgets)
          </button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Individuele inzendingen wis je bij de resultaten van elke widget (<DeleteIcon size={14} className="icon-inline" aria-hidden /> naast de rij).
        </p>
      </div>

      {confirm === 'subs' && (
        <ConfirmModal
          title="Alle leerlinggegevens wissen?"
          message={`${subs.length} inzendingen, pogingtellers, tussentijds opgeslagen werk, leerlingnotities en deadlines worden definitief verwijderd. Je widgets blijven bestaan.`}
          onConfirm={wipeSubmissions}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'all' && (
        <ConfirmModal
          title="Alles wissen?"
          message="Alle widgets, mappen, inzendingen en instellingen op dit toestel worden definitief verwijderd. Exporteer eerst wat je wil bewaren."
          onConfirm={wipeAll}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
