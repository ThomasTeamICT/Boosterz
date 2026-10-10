// De sectie "Wat je cursussen samen dekken" van een richting (docs/STUDIERICHTINGEN.md § 13.4 en § 14.3): welke officiële
// minimumdoelen dekken al je cursussen voor deze richting samen, welke staan alleen gepland, en welke cursussen tellen niet mee.
//
// De berekening zelf staat in lib/dekkingMinimumdoelen.ts en wordt per richting één keer gedaan in useRichtingDekking.ts. Dat
// haalt de setbestanden op en kiest de cursussen die meetellen. Het resultaat gaat naar deze sectie én naar
// de lijst "Cursussen voor deze richting" (RichtingCursussen), zodat de twee nooit van elkaar afwijken.

import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { DekkingPerSet, ToonKeuze } from '../course/MinimumdoelenDekking';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
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
import type { RichtingInfo, RichtingKeuze } from '../../lib/richtingKader';
import '../../styles/dekking.css';

// De berekening staat in useRichtingDekking.ts; de types gaan van daar ook naar de andere secties.
import type { DekkingGegevens, DekkingStand, TelMee } from './useRichtingDekking';
export type { CursusUitkomst, DekkingGegevens, DekkingStand, TelMee } from './useRichtingDekking';

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

function DekkingInhoud({ info, gegevens }: { info: RichtingInfo; gegevens: DekkingGegevens }) {
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
}) {
  return (
    <section className="ri-sectie dk" aria-labelledby="ri-dekking-kop">
      <h2 id="ri-dekking-kop">Wat je cursussen samen dekken</h2>
      {stand.status === 'geen' ? (
        <p>{geenDekkingTekst(stand.herkomst)}</p>
      ) : (
        <>
          <TelMeeKeuze info={info} keuze={keuze} telMee={telMee} onTelMee={onTelMee} />
          {stand.status === 'laden' && <LaadBericht tekst={LADEN_SETS_DEKKING} />}
          {stand.status === 'fout' && <FoutBericht fout={FOUT_SETS_DEKKING} onOpnieuw={stand.opnieuw} />}
          {stand.status === 'klaar' && <DekkingInhoud info={info} gegevens={stand.waarde} />}
        </>
      )}
    </section>
  );
}
