import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import type { ClassPack } from '../lib/classPack';
import {
  adoptClassPack, classPackConflicts, decodeClassPack, importClassPackJson, readPastedClassPack,
} from '../lib/classPack';
import { conflictKey, type SharedChoice, type SharedConflict } from '../lib/courses';
import { BrandMark } from '../components/Brand';
import { EmptyState } from '../components/ui';
import { CheckIcon, ImportIcon, WarningIcon } from '../components/icons';
import '../styles/leerling.css';

/** Waar de pagina staat: invoerloket, bezig, of een vraag vóór het overnemen. */
type Stap =
  | { soort: 'invoer' }
  | { soort: 'bezig' }
  | { soort: 'vraag'; pack: ClassPack; conflicten: SharedConflict[] };

const TIK: React.CSSProperties = { minHeight: 44 };

/**
 * /klas/open?d=… — het klaspakket binnenhalen op het toestel van de leerling.
 *
 * Alles uit het pakket wordt lokaal bewaard: de cursussen met hun oefeningen,
 * de losse widgets, en de klas zelf (in een aparte leerlingopslag, zodat de
 * klassenlijst van de leerkracht schoon blijft). Daarna gaat de leerling
 * meteen naar zijn eigen hub.
 *
 * Staat iets uit het pakket hier al als eigen werk, in een andere versie, dan
 * wordt het nooit stil overschreven: eerst een vraag (bijwerken, eigen versie
 * houden of als kopie bewaren). Een ongewijzigde kopie van een vorig pakket
 * wordt zonder vraag bijgewerkt; een ouder pakket zet niets terug.
 *
 * Zonder `d` is dit het loket voor een pakketbestand of een geplakte link —
 * handig wanneer de link te lang was om te scannen.
 */
export function ClassOpenPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const d = params.get('d');
  const [error, setError] = useState('');
  const [stap, setStap] = useState<Stap>(() => (d ? { soort: 'bezig' } : { soort: 'invoer' }));
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Alleen het laatst gestarte pakket telt (de vergelijking is async).
  const poging = useRef(0);
  const vergeetLopendePoging = () => { poging.current++; };

  const overnemen = (p: ClassPack, keuze?: { choice: SharedChoice; conflicten: SharedConflict[] }) => {
    let ok = true;
    try {
      const res = adoptClassPack(
        p,
        keuze ? { conflicts: { choice: keuze.choice, keys: keuze.conflicten.map(conflictKey) } } : {}
      );
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setStap({ soort: 'invoer' });
      setError('Niet alles uit het pakket kon bewaard worden op dit toestel. Is de opslag van je browser vol of geblokkeerd? Maak ruimte en open de link opnieuw.');
      return;
    }
    navigate(`/leerling/${p.klas.code}`, { replace: true });
  };

  const take = async (p: ClassPack) => {
    const mijn = ++poging.current;
    setError('');
    setStap({ soort: 'bezig' });
    let conflicten: SharedConflict[] = [];
    try {
      conflicten = await classPackConflicts(p);
    } catch {
      // Zonder vergelijking toch veilig: overnemen zonder keuze laat eigen
      // werk altijd staan.
      conflicten = [];
    }
    if (poging.current !== mijn) return;
    if (conflicten.length > 0) {
      setStap({ soort: 'vraag', pack: p, conflicten });
      return;
    }
    overnemen(p);
  };

  // Elke navigatie naar deze pagina begint opnieuw. Ook als React dezelfde
  // pagina hergebruikt: wie na een overname meteen terugkeert terwijl de hub
  // nog laadt (Suspense houdt de oude pagina dan verborgen bij), zag anders
  // eindeloos "Je klas wordt klaargezet…". Bewust het locatie-object en niet
  // location.key: bij een rechtstreekse hash-navigatie is de sleutel telkens
  // "default", het object is wel elke keer nieuw.
  useEffect(() => {
    setError('');
    if (!d) {
      setStap({ soort: 'invoer' });
      return vergeetLopendePoging;
    }
    const decoded = decodeClassPack(d);
    if (!decoded) {
      setStap({ soort: 'invoer' });
      setError('Deze klaslink werkt niet — hij is onvolledig of beschadigd (misschien afgebroken bij het kopiëren). Vraag je leerkracht om de link opnieuw.');
      return vergeetLopendePoging;
    }
    void take(decoded);
    return vergeetLopendePoging;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, location]);

  const openBestand = async (f: File) => {
    let text: string;
    try {
      text = await f.text();
    } catch {
      setError('Het bestand kon niet gelezen worden.');
      return;
    }
    const p = importClassPackJson(text);
    if (!p) {
      setError('Dit is geen klaspakket van Boosterz. Vraag je leerkracht het juiste bestand.');
      return;
    }
    void take(p);
  };

  const openGeplakt = () => {
    if (!paste.trim()) return;
    // Volledige link, alleen het d=-stuk, %-codering of spaties: zie readPastedClassPack.
    const decoded = readPastedClassPack(paste);
    if (!decoded) {
      setError('Dat is geen geldige klaslink of pakket. Plak de volledige link die je van je leerkracht kreeg.');
      return;
    }
    void take(decoded);
  };

  /**
   * Terug naar het loket: zonder ?d=, anders blijft de pagina op "klaargezet"
   * hangen (LL9). De navigatie zet de pagina zelf opnieuw klaar (zie hierboven).
   */
  const naarLoket = () => {
    vergeetLopendePoging();
    setError('');
    setStap({ soort: 'invoer' });
    navigate('/klas/open', { replace: true });
  };

  return (
    <div className="player-shell" style={{ minHeight: '100vh' }}>
      <header className="player-topbar">
        <Link to="/meedoen" className="topbar-logo" style={{ fontSize: '1.05rem' }}>
          <BrandMark size={28} />
          <span className="wordmark">Booster<b>z</b></span>
        </Link>
        <span className="title">Klaspakket openen</span>
      </header>

      <main id="main" className="player-main" style={{ maxWidth: 560 }}>
        {error ? (
          <>
            <h1 className="sr-only">Dit pakket kon niet geopend worden</h1>
            <EmptyState icon={<WarningIcon size={40} />} title="Dit pakket kon niet geopend worden">
              <p>{error}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/meedoen" className="btn btn-primary" style={TIK}>Met een code meedoen</Link>
                <button type="button" className="btn btn-ghost" style={TIK} onClick={naarLoket}>
                  Link of bestand zelf openen
                </button>
              </div>
            </EmptyState>
          </>
        ) : stap.soort === 'bezig' ? (
          <>
            <h1 className="sr-only">Je klas wordt klaargezet</h1>
            <div style={{ textAlign: 'center', paddingTop: 70 }}>
              <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--brand)' }} aria-hidden><Package size={42} /></div>
              <p role="status" style={{ color: 'var(--text-soft)' }}>Je klas wordt klaargezet…</p>
            </div>
          </>
        ) : stap.soort === 'vraag' ? (
          <VersieVraag
            conflicten={stap.conflicten}
            onKies={(choice) => overnemen(stap.pack, { choice, conflicten: stap.conflicten })}
          />
        ) : (
          <div className="card card-pad">
            <h1 style={{ fontSize: '1.35rem', marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={22} aria-hidden /> Klaspakket openen
            </h1>
            <p style={{ color: 'var(--text-soft)' }}>
              Kreeg je van je leerkracht een <strong>klaslink</strong> of een <strong>pakketbestand</strong>?
              Open het hier: je cursussen en oefeningen komen dan op dit toestel te staan, ook zonder
              internet achteraf.
            </p>

            <div className="field">
              <label htmlFor="klaslink">Klaslink plakken</label>
              <textarea
                id="klaslink"
                className="textarea"
                rows={3}
                value={paste}
                placeholder="https://…#/klas/open?d=…"
                onChange={(e) => { setPaste(e.target.value); setError(''); }}
                style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" style={TIK} disabled={!paste.trim()} onClick={openGeplakt}>
                <CheckIcon size={16} aria-hidden /> Openen
              </button>
              <button type="button" className="btn btn-ghost" style={TIK} onClick={() => fileRef.current?.click()}>
                <ImportIcon size={16} aria-hidden /> Pakketbestand kiezen…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label="Klaspakketbestand kiezen"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void openBestand(f);
                  e.target.value = '';
                }}
              />
            </div>

            <hr className="divider" />
            <p className="hint" style={{ marginBottom: 0 }}>
              Heb je alleen een korte klascode (6 tekens)? Ga dan naar{' '}
              <Link to="/meedoen">Meedoen</Link> en typ ze daar.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * De vraag vóór het overnemen: iets uit het pakket staat hier al, in een
 * andere versie. Leerlingscherm: "oefening", nooit "widget".
 */
function VersieVraag({
  conflicten, onKies,
}: {
  conflicten: SharedConflict[];
  onKies: (choice: SharedChoice) => void;
}) {
  const kopRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { kopRef.current?.focus(); }, []);
  const keuzes: { choice: SharedChoice; label: string; uitleg: string; primary?: boolean }[] = [
    {
      choice: 'bijwerken',
      label: 'Bijwerken naar de nieuwe versie',
      uitleg: 'De versie die nu op dit toestel staat, wordt vervangen.',
      primary: true,
    },
    {
      choice: 'houden',
      label: 'Mijn versie houden',
      uitleg: 'Wat hier staat, blijft zoals het is.',
    },
    {
      choice: 'kopie',
      label: 'Als kopie bewaren',
      uitleg: 'De nieuwe versie komt ernaast, met “(kopie)” in de titel.',
    },
  ];
  return (
    <div className="card card-pad" style={{ marginTop: 24 }}>
      <h1 ref={kopRef} tabIndex={-1} style={{ fontSize: '1.3rem', marginTop: 0 }}>
        Er staat al een versie op dit toestel
      </h1>
      <p style={{ color: 'var(--text-soft)' }}>
        Dit klaspakket bevat een nieuwere versie van{' '}
        {conflicten.length === 1 ? 'iets dat al op dit toestel staat' : 'enkele dingen die al op dit toestel staan'}.
        Welke versie wil je gebruiken?
      </p>
      <ul aria-label="Wat er al op dit toestel staat">
        {conflicten.map((c) => (
          <li key={conflictKey(c)}>
            {c.kind === 'course' ? 'Cursus' : 'Oefening'}: <strong>{c.title}</strong>
            {c.localTitle !== c.title && <> (hier: “{c.localTitle}”)</>}
          </li>
        ))}
      </ul>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {keuzes.map((k) => (
          <div key={k.choice}>
            <button
              type="button"
              className={`btn ${k.primary ? 'btn-primary' : 'btn-ghost'}`}
              style={{ ...TIK, width: '100%' }}
              aria-describedby={`versie-${k.choice}`}
              onClick={() => onKies(k.choice)}
            >
              {k.label}
            </button>
            <p id={`versie-${k.choice}`} className="hint" style={{ margin: '4px 0 0' }}>{k.uitleg}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
