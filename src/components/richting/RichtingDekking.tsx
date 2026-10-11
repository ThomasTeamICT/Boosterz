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
import { BK_DEKKING_TITEL, BK_LADEN, BK_MD_REDEN_BK_CURSUS, BK_MD_TITEL } from '../../lib/bkWeergave';
import { jaarTekst } from '../../lib/doelgroep';
import { openVerplichteDoelen } from '../../lib/gatenDichten';
import { FOUT_LADEN_GATEN, GEEN_OPEN_TEKST, planKnopTekst } from '../../lib/gatenWeergave';
import type { RichtingInfo, RichtingKeuze } from '../../lib/richtingKader';
import '../../styles/dekking.css';
import '../../styles/gaten.css';

// De berekening staat in useRichtingDekking.ts; de types gaan van daar ook naar de andere secties.
import type { DekkingGegevens, DekkingStand, TelMee } from './useRichtingDekking';
import { bksVan, useLuiDeel } from './useRichtingBk';
import type { BkDekkingInvoer } from './bk/BkDekking';
export type { CursusUitkomst, DekkingGegevens, DekkingStand, TelMee } from './useRichtingDekking';

// Het venster om gaten te dichten (en wat het zwaar maakt: gatenCursus) wordt pas geladen als de leerkracht op de knop klikt.
// We laden het eerst los in (`laadVenster`): lukt dat niet (de verbinding viel weg), dan blijft de pagina zoals ze is, met een
// melding bij de knop, in plaats van dat de pagina met een fout vervangen wordt.
const laadVenster = () => import('./GatenVenster');
const GatenVenster = lazy(() => laadVenster().then((m) => ({ default: m.GatenVenster })));

// Het tweede blok, de competenties van de beroepskwalificaties (§ 23.7.4), zit in het luie chunk `bk` en wordt pas geladen als de
// richting beroepskwalificaties heeft. Lukt het laden niet, dan blijft de rest van de sectie staan, met een melding.
const laadBkDekking = () => import('./bk/BkDekking');
const FOUT_BK_DEKKING_DEEL = 'De competenties van de beroepskwalificaties konden niet getoond worden. Controleer je verbinding en herlaad de pagina.';

/**
 * De plaats van het tweede blok zolang het luie deel er nog niet is (`fout` onwaar) of niet geladen kon worden (`fout`). De kop
 * staat er in beide gevallen al: het blok "Minimumdoelen" en de lijst "Cursussen voor deze richting" zeggen bij een cursus met
 * competenties "zie ‘Competenties van de beroepskwalificaties’", en die verwijzing moet ergens heen wijzen. Dezelfde kop en
 * hetzelfde omhulsel als in `BkDekking`, dat ze overneemt zodra het geladen is.
 */
export function BkDekkingPlaats({ fout }: { fout: boolean }) {
  const kopId = useId();
  return (
    <div className="dk-bk" aria-labelledby={kopId} role="group">
      <h3 id={kopId} className="dk-blokkop">{BK_DEKKING_TITEL}</h3>
      {fout ? (
        <div className="callout err dk-melding" role="alert">
          <WarningIcon size={18} aria-hidden="true" />
          <p>{FOUT_BK_DEKKING_DEEL}</p>
        </div>
      ) : (
        <LaadBericht tekst={BK_LADEN} />
      )}
    </div>
  );
}

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

function DekkingInhoud({ info, gegevens, metBk, laadt, fout, onPlan, knopRef }: {
  info: RichtingInfo;
  gegevens: DekkingGegevens;
  /** De richting toont ook het blok met de competenties van de beroepskwalificaties: dan krijgt een BK-cursus daar haar uitleg. */
  metBk: boolean;
  laadt: boolean;
  fout: boolean;
  onPlan: (gegevens: DekkingGegevens) => void;
  knopRef: RefObject<HTMLButtonElement>;
}) {
  const [toon, setToon] = useState<Toon>('alle');
  const { dekking, cursussen, namen, telJaar } = gegevens;
  const extra = [optioneelZin(dekking.optioneel), zelfdeNummerZin(dekking.zelfdeNummerAndereSet)].filter(Boolean);
  const nietMee = [...cursussen.values()].filter((c) => !c.telt);
  // Onder de kop "Minimumdoelen" is dit een tussenkop van een blok, dus een niveau lager (§ 23.7.7).
  const Kop = metBk ? 'h4' : 'h3';
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
          <Kop>Cursussen die niet meetellen</Kop>
          <ul className="dk-cursuslijst">
            {nietMee.map((c) => (
              <li key={c.courseId} className="dk-cursus">
                <Link className="dk-cursus-titel" to={`/cursus/bewerk/${encodeURIComponent(c.courseId)}`}>{c.titel}</Link>
                {/* Een cursus met competenties telt hier niet mee omdat ze een ander leerplan volgt: alleen de uitleg verandert. */}
                <span className="dk-cursus-reden">{metBk && c.volgtBk === true && c.reden === 'geen-verwijzingen' ? BK_MD_REDEN_BK_CURSUS : cursusRegel(c).hoofd}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function RichtingDekking({ info, keuze, stand, telMee, onTelMee, bk }: {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  stand: DekkingStand;
  telMee: TelMee;
  onTelMee: (t: TelMee) => void;
  /** Voor het tweede blok, de competenties van de beroepskwalificaties (§ 23.7.4, S3): het BK-kader en wat `BkDekking` nodig heeft. */
  bk?: BkDekkingInvoer;
}) {
  // Het tweede blok staat er als het BK-kader klaar is en minstens één beroepskwalificatie heeft. Zonder is de sectie zoals ze was.
  const bkKader = bk?.stand.status === 'klaar' && bksVan(bk.stand).length > 0 ? bk.stand.waarde : undefined;
  const bkDeel = useLuiDeel(laadBkDekking, bkKader !== undefined);
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
      {/* "Tel mee" geldt voor beide blokken: bovenaan, zodra een van de twee getoond wordt. */}
      {(bkKader !== undefined || stand.status !== 'geen') && <TelMeeKeuze info={info} keuze={keuze} telMee={telMee} onTelMee={onTelMee} />}
      {bkKader !== undefined && <h3 className="dk-blokkop">{BK_MD_TITEL}</h3>}
      {stand.status === 'geen' ? (
        <p>{geenDekkingTekst(stand.herkomst)}</p>
      ) : (
        <>
          {stand.status === 'laden' && <LaadBericht tekst={LADEN_SETS_DEKKING} />}
          {stand.status === 'fout' && <FoutBericht fout={FOUT_SETS_DEKKING} onOpnieuw={stand.opnieuw} />}
          {stand.status === 'klaar' && (
            <DekkingInhoud info={info} gegevens={stand.waarde} metBk={bkKader !== undefined} laadt={laadt} fout={laadFout} onPlan={plan} knopRef={knopRef} />
          )}
        </>
      )}
      {bk && bkKader !== undefined && (bkDeel === undefined || bkDeel === 'fout' ? (
        <BkDekkingPlaats fout={bkDeel === 'fout'} />
      ) : (
        <bkDeel.BkDekking
          info={info} keuze={keuze} bk={bkKader} courses={bk.courses} curricula={bk.curricula} matrix={bk.matrix} vandaag={bk.vandaag}
          telMee={telMee}
        />
      ))}
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
