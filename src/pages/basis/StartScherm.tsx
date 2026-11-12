// #/basis: de ingang. Met een bewaard leerjaar stuurt ze door naar dat leerjaar; zonder vraagt ze 'Welk leerjaar geef je?'
// (gewoon of buitengewoon en negen leerjaren), met een zoekveld, de drie eindmomenten en de leerlijnen per vak.
// #/basis/kies: dezelfde kiezer onder de kop 'Kies je leerjaar', met 'Vergeet mijn leerjaar'.
// Alleen de index wordt geladen, voor de aantallen op de momenttegels; zonder aantallen werken de tegels ook.

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LeerjaarKiezer, SnelZoeken } from '../../components/basis/LeerjaarKiezer';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { useBasisSets } from '../../components/basis/useBasisSets';
import { EINDMOMENTEN, vakkenOpMoment } from '../../lib/basis/doelBasis';
import { basisPad } from '../../lib/basis/basisRoutes';
import { PAKKETTEN } from '../../lib/basis/pakketten';
import { PakketTegel } from '../../components/basis/PakketTegel';
import type { Eindmoment, SoortBasis } from '../../lib/basis/kalender';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import '../../styles/basis-leerjaar.css';

const MOMENT_KORT: Readonly<Record<Eindmoment, string>> = { K3: 'Einde kleuter', L4: 'Einde 4de leerjaar', L6: 'Einde 6de leerjaar' };

/** Het aantal doelen van alle nieuwe sets op een eindmoment, uit de index. */
function aantalOpMoment(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis, eind: Eindmoment): number {
  return vakkenOpMoment(alle, soort, eind).reduce((som, v) => som + v.aantal, 0);
}

/** De drie momenttegels en de tegel voor de leerlijnen. `alle` ontbreekt zolang de index laadt: dan staat er geen aantal. */
function Tegels({ soort, alle }: { soort: SoortBasis; alle?: readonly MinimumdoelenIndexSet[] }) {
  return (
    <section aria-labelledby="b-momenten-kop" className="b-blok">
      <h2 id="b-momenten-kop">Of kijk naar alle doelen van een eindmoment</h2>
      <ul className="b-tegels">
        {EINDMOMENTEN.map((eind) => {
          const n = alle ? aantalOpMoment(alle, soort, eind) : undefined;
          return (
            <li key={eind}>
              <Link to={basisPad({ s: 'moment', soort, eind })} className="b-tegel">
                <span className="b-tegel-naam">{MOMENT_KORT[eind]}</span>
                {n !== undefined && n > 0 && <span className="b-tegel-sub">{n} doelen</span>}
              </Link>
            </li>
          );
        })}
        <li>
          <Link to={basisPad({ s: 'leerlijnen', soort })} className="b-tegel">
            <span className="b-tegel-naam">Leerlijnen per vak</span>
            <span className="b-tegel-sub">de drie eindmomenten naast elkaar</span>
          </Link>
        </li>
        <li>
          <PakketTegel pakket={PAKKETTEN.lichtkamer} />
        </li>
        <li>
          <Link to={basisPad({ s: 'go' })} className="b-tegel">
            <span className="b-tegel-naam">Leerplan en lesplannen van het GO!</span>
            <span className="b-tegel-sub">leerplandoelen en lesplannen, koppeling met de minimumdoelen</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** De startpagina zonder doorsturen en zonder laden: de kop, de kiezer, het zoekveld en de tegels. */
export function StartInhoud({ alle }: { alle?: readonly MinimumdoelenIndexSet[] }) {
  const { keuze } = useBasisKeuze();
  const [soort, setSoort] = useState<SoortBasis>(keuze?.soort ?? 'bao');
  return (
    <div className="b-start">
      <h1>Welk leerjaar geef je?</h1>
      <p className="b-lead">Kies één keer je leerjaar. Dan zie je meteen wat dit schooljaar voor jou geldt. Dat onthouden we op dit toestel.</p>
      <LeerjaarKiezer soort={soort} onSoort={setSoort} vervang />
      <SnelZoeken soort={soort} />
      <Tegels soort={soort} alle={alle} />
    </div>
  );
}

export function StartScherm() {
  const { keuze } = useBasisKeuze();
  const { index } = useBasisSets();
  if (keuze) {
    // De h1 staat er ook nu: een scherm heeft altijd één kop.
    return (
      <div className="b-start">
        <h1>Je leerjaar wordt geopend</h1>
        <Navigate to={basisPad({ s: 'leerjaar', soort: keuze.soort, leerjaar: keuze.leerjaar })} replace />
      </div>
    );
  }
  return <StartInhoud alle={index.status === 'klaar' ? index.waarde.sets : undefined} />;
}

export function KiesScherm() {
  const { keuze, wis } = useBasisKeuze();
  const navigate = useNavigate();
  const [soort, setSoort] = useState<SoortBasis>(keuze?.soort ?? 'bao');
  return (
    <div className="b-start">
      <h1>Kies je leerjaar</h1>
      <p className="b-lead">Gewoon of buitengewoon onderwijs, en het leerjaar dat je geeft. Die keuze onthouden we op dit toestel.</p>
      <LeerjaarKiezer soort={soort} onSoort={setSoort} />
      {keuze && (
        <p>
          <button
            type="button"
            className="b-knop"
            onClick={() => {
              wis();
              navigate(basisPad({ s: 'start' }));
            }}
          >
            Vergeet mijn leerjaar
          </button>
        </p>
      )}
    </div>
  );
}
