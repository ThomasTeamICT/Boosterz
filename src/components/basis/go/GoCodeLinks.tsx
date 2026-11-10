// Onder het zoekveld: wat bij een code van het GO! in de zoekvraag hoort (WT.086, LP0065). Een code die bestaat is een link;
// een code die niet bestaat is platte tekst met de zin dat ze er niet staat. Dit bestand wordt lui geladen door ZoekScherm,
// zodat de gegevens van het GO! alleen komen bij een vraag met zo'n code.

import { Link } from 'react-router-dom';
import { basisPad } from '../../../lib/basis/basisRoutes';
import { goDoelBestaat, lesplanVanCode } from '../../../lib/basis/go/goModel';
import { leeftijdLabel } from '../../../lib/basis/go/leeftijden';
import { GO_VAKKEN, isGoVak, type GoIndex } from '../../../lib/basis/go/types';
import { useGoIndex } from '../useGo';
import { FoutBericht } from '../../curriculum/LaadStatus';
import '../../../styles/basis-go.css';

export type GoCode = { soort: 'leerplandoel' | 'lesplan'; code: string };

/** De lijst voor een geladen index, zonder zelf iets te laden. */
export function GoCodeLinksInhoud({ codes, index }: { codes: readonly GoCode[]; index: GoIndex }) {
  if (codes.length === 0) return null;
  return (
    <section className="b-blok b-zoek-go" aria-labelledby="b-zoek-go-kop">
      <h2 id="b-zoek-go-kop">Bij het GO!</h2>
      <ul className="b-go-lesplannen">
        {codes.map((g) => {
          if (g.soort === 'lesplan') {
            const lp = lesplanVanCode(index, g.code);
            return (
              <li key={g.code}>
                {lp ? (
                  <>
                    <Link to={basisPad({ s: 'lesplan', code: g.code })} className="b-go-lesplanlink">
                      Lesplan {lp.code} {lp.titel}
                    </Link>{' '}
                    <span className="b-go-leeftijden">({leeftijdLabel(lp.leeftijd)})</span>
                  </>
                ) : (
                  `${g.code} staat niet bij de lesplannen van het GO!`
                )}
              </li>
            );
          }
          const vak = g.code.slice(0, 2);
          return (
            <li key={g.code}>
              {goDoelBestaat(index, g.code) && isGoVak(vak) ? (
                <>
                  <Link to={basisPad({ s: 'leerplandoel', code: g.code })} className="b-go-lesplanlink">
                    Leerplandoel {g.code}
                  </Link>{' '}
                  <span className="b-go-leeftijden">({GO_VAKKEN[vak].naam})</span>
                </>
              ) : (
                `${g.code} staat niet in het leerplan van het GO!`
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function GoCodeLinks({ codes }: { codes: readonly GoCode[] }) {
  const { stand, opnieuw } = useGoIndex();
  if (stand.status === 'laden') return null;
  if (stand.status === 'fout') return <FoutBericht fout={stand.fout} naam="de codes van het GO!" onOpnieuw={opnieuw} />;
  return <GoCodeLinksInhoud codes={codes} index={stand.waarde} />;
}
