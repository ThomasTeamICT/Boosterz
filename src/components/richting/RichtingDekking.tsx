// De sectie "Wat je cursussen samen dekken" van een richting (docs/STUDIERICHTINGEN.md § 13.4 en § 14.3): welke officiële
// minimumdoelen dekken al je cursussen voor deze richting samen, welke staan alleen gepland, en welke cursussen tellen niet mee.
//
// De berekening zelf staat in lib/dekkingMinimumdoelen.ts en wordt per richting één keer gedaan in useRichtingDekking.ts. Dat
// haalt de setbestanden op en kiest de cursussen die meetellen. Het resultaat gaat naar deze sectie én naar
// de lijst "Cursussen voor deze richting" (RichtingCursussen), zodat de twee nooit van elkaar afwijken.

import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { DekkingPerSet, ToonKeuze } from '../course/MinimumdoelenDekking';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { PlannedIcon, RetryIcon, WarningIcon } from '../icons';
import {
  EERSTE_GRAAD_ZIN,
  FOUT_SETS_DEKKING,
  KIES_JAAR_HINT,
  LADEN_SETS_DEKKING,
  cursusRegel,
  geenDekkingTekst,
  optioneelZin,
  samenvattingRichting,
  zelfdeNummerZin,
  type Toon,
} from '../../lib/dekkingWeergave';
import { jaarTekst } from '../../lib/doelgroep';
import { openVerplichteDoelen } from '../../lib/gatenDichten';
import { FOUT_LADEN_GATEN, GEEN_OPEN_TEKST, planKnopTekst } from '../../lib/gatenWeergave';
import type { RichtingInfo, RichtingKeuze } from '../../lib/richtingKader';
import '../../styles/dekking.css';
import '../../styles/gaten.css';

// De berekening staat in useRichtingDekking.ts; de types gaan van daar ook naar de andere secties.
import type { DekkingGegevens, DekkingStand, TelMee } from './useRichtingDekking';
import type { BkDekkingInvoer } from './bk/BkDekking';
export type { CursusUitkomst, DekkingGegevens, DekkingStand, TelMee } from './useRichtingDekking';

// Het venster om gaten te dichten (en wat het zwaar maakt: gatenCursus) wordt pas geladen als de leerkracht op de knop klikt.
// We laden het eerst los in (`laadVenster`): lukt dat niet (de verbinding viel weg), dan blijft de pagina zoals ze is, met een
// melding bij de knop, in plaats van dat de pagina met een fout vervangen wordt.
const laadVenster = () => import('./GatenVenster');
const GatenVenster = lazy(() => laadVenster().then((m) => ({ default: m.GatenVenster })));

// ── De sectie ───────────────────────────────────────────────────────────────

function TelMeeKeuze({ info, keuze, telMee, onTelMee }: {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  telMee: TelMee;
  onTelMee: (t: TelMee) => void;
}) {
  const naam = useId();
  // Een richting zonder graad (buitengewoon onderwijs) heeft geen jaren om uit te kiezen.
  if (info.graad === undefined) return null;
  return (
    <fieldset className="dk-fieldset">
      <legend>Tel mee</legend>
      <div className="dk-radios">
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={telMee === 'alle' || keuze.jaar === undefined} onChange={() => onTelMee('alle')} />
          <span>Alle jaren van de graad</span>
        </label>
        {keuze.jaar !== undefined && (
          <label className="dk-keuze">
            <input type="radio" name={naam} checked={telMee === 'jaar'} onChange={() => onTelMee('jaar')} />
            <span>Alleen het {jaarTekst(keuze.jaar)}</span>
          </label>
        )}
      </div>
      {keuze.jaar === undefined && info.jaren.length > 1 && <p className="dk-uitleg dk-uitleg-blok">{KIES_JAAR_HINT}</p>}
    </fieldset>
  );
}

/**
 * Onder de samenvatting (§ 22.4.7): de knop om de verplichte doelen die nog nergens aan bod komen te plannen, of de zin dat
 * er geen meer zijn. De knop opent het venster met de dekking zoals ze nu op het scherm staat.
 */
function PlanBlok({ gegevens, laadt, fout, onPlan, knopRef }: {
  gegevens: DekkingGegevens;
  laadt: boolean;
  fout: boolean;
  onPlan: (gegevens: DekkingGegevens) => void;
  knopRef: RefObject<HTMLButtonElement>;
}) {
  const aantal = useMemo(() => openVerplichteDoelen(gegevens.dekking).length, [gegevens.dekking]);
  if (aantal === 0) return <p className="gt-geen">{GEEN_OPEN_TEKST}</p>;
  return (
    <div className="gt-plan">
      <button
        ref={knopRef} type="button" className="btn btn-primary gt-plan-knop" aria-busy={laadt || undefined}
        onClick={() => onPlan(gegevens)}
      >
        <PlannedIcon size={18} aria-hidden="true" /> {planKnopTekst(aantal)}
      </button>
      {fout && (
        <div className="callout err gt-melding" role="alert">
          <WarningIcon size={18} aria-hidden="true" />
          <div className="gt-melding-tekst">
            <p>{FOUT_LADEN_GATEN}</p>
            {/* Een mislukte dynamische import onthoudt de browser: een tweede klik doet geen nieuw verzoek, herladen wel. */}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.location.reload()}>
              <RetryIcon size={16} aria-hidden="true" /> Herlaad de pagina
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DekkingInhoud({ info, gegevens, laadt, fout, onPlan, knopRef }: {
  info: RichtingInfo;
  gegevens: DekkingGegevens;
  laadt: boolean;
  fout: boolean;
  onPlan: (gegevens: DekkingGegevens) => void;
  knopRef: RefObject<HTMLButtonElement>;
}) {
  const [toon, setToon] = useState<Toon>('alle');
  const { dekking, cursussen, namen, telJaar } = gegevens;
  const extra = [optioneelZin(dekking.optioneel), zelfdeNummerZin(dekking.zelfdeNummerAndereSet)].filter(Boolean);
  const nietMee = [...cursussen.values()].filter((c) => !c.telt);
  return (
    <>
      {info.graad === 1 && telJaar === undefined && <p className="dk-uitleg dk-uitleg-blok">{EERSTE_GRAAD_ZIN}</p>}
      <div aria-live="polite">
        <p className="dk-samenvatting"><strong>{samenvattingRichting(dekking, telJaar)}</strong></p>
        {extra.map((zin) => <p key={zin} className="dk-uitleg dk-extra">{zin}</p>)}
      </div>
      <PlanBlok gegevens={gegevens} laadt={laadt} fout={fout} onPlan={onPlan} knopRef={knopRef} />
      <ToonKeuze toon={toon} onToon={setToon} />
      <DekkingPerSet dekking={dekking} toon={toon} namen={namen} />
      {nietMee.length > 0 && (
        <div className="dk-cursussen">
          <h3>Cursussen die niet meetellen</h3>
          <ul className="dk-cursuslijst">
            {nietMee.map((c) => (
              <li key={c.courseId} className="dk-cursus">
                <Link className="dk-cursus-titel" to={`/cursus/bewerk/${encodeURIComponent(c.courseId)}`}>{c.titel}</Link>
                <span className="dk-cursus-reden">{cursusRegel(c).hoofd}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function RichtingDekking({ info, keuze, stand, telMee, onTelMee }: {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  stand: DekkingStand;
  telMee: TelMee;
  onTelMee: (t: TelMee) => void;
  /** Voor het tweede blok, de competenties van de beroepskwalificaties (§ 23.7.4, S3): het BK-kader en wat `BkDekking` nodig heeft. */
  bk?: BkDekkingInvoer;
}) {
  /** De dekking zoals ze stond toen de leerkracht op de knop klikte: het venster werkt met die momentopname. */
  const [venster, setVenster] = useState<DekkingGegevens | null>(null);
  const [laadt, setLaadt] = useState(false);
  const [laadFout, setLaadFout] = useState(false);
  /** Telt op als het venster klaar is met het plannen in een bestaande cursus: dan gaat de focus naar de kop van de sectie. */
  const [focusKop, setFocusKop] = useState(0);
  const knopRef = useRef<HTMLButtonElement>(null);
  const laadBezig = useRef(false);

  // Het venster sluit en de knop kan verdwijnen (er is niets meer te plannen): de focus gaat naar de kop van de sectie. Dit
  // effect draait na het opruimen van het venster, dat de focus anders terugzet op de knop.
  useEffect(() => {
    if (focusKop > 0) document.getElementById('ri-dekking-kop')?.focus();
  }, [focusKop]);

  const plan = (gegevens: DekkingGegevens) => {
    // Beveiligd tegen dubbel klikken: tijdens het laden telt een tweede klik niet.
    if (laadBezig.current) return;
    laadBezig.current = true;
    setLaadFout(false);
    setLaadt(true);
    laadVenster().then(
      () => {
        laadBezig.current = false;
        setLaadt(false);
        setVenster(gegevens);
      },
      () => {
        laadBezig.current = false;
        setLaadt(false);
        setLaadFout(true);
      },
    );
  };

  return (
    <section className="ri-sectie dk" aria-labelledby="ri-dekking-kop">
      <h2 id="ri-dekking-kop" tabIndex={-1}>Wat je cursussen samen dekken</h2>
      {stand.status === 'geen' ? (
        <p>{geenDekkingTekst(stand.herkomst)}</p>
      ) : (
        <>
          <TelMeeKeuze info={info} keuze={keuze} telMee={telMee} onTelMee={onTelMee} />
          {stand.status === 'laden' && <LaadBericht tekst={LADEN_SETS_DEKKING} />}
          {stand.status === 'fout' && <FoutBericht fout={FOUT_SETS_DEKKING} onOpnieuw={stand.opnieuw} />}
          {stand.status === 'klaar' && (
            <DekkingInhoud info={info} gegevens={stand.waarde} laadt={laadt} fout={laadFout} onPlan={plan} knopRef={knopRef} />
          )}
        </>
      )}
      {venster && (
        <Suspense fallback={null}>
          <GatenVenster
            info={info} keuze={keuze} gegevens={venster}
            onClose={() => setVenster(null)}
            onGepland={() => { setVenster(null); setFocusKop((n) => n + 1); }}
          />
        </Suspense>
      )}
    </section>
  );
}
