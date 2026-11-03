// De leerlijn van één onderwerp als echte tabel: de rijen zijn de subthema's, de kolommen de drie eindmomenten (einde
// kleuter, einde 4de en einde 6de leerjaar). In elke cel staan de doelen als DoelRij: de code, de letterlijke doelzin en
// de rest van de officiële tekst in een details naast de link (H2). Er zijn geen pijlen: de codes lopen niet door en de
// bron zegt niet welk doel uit welk ander volgt.
//
// - De kolom van het leerjaar van de leerkracht heeft een zachte lampkleur en '(je leerjaar)' in de kop.
// - Een lege cel zegt waarom: 'Op dit moment niet apart vermeld' (het vak heeft op dat moment wel doelen) of 'Geen
//   doelen voor dit moment' (het vak heeft op dat moment geen set).
// - Op 760 px of smaller wordt elke rij een kaart: het moment van het leerjaar staat open, de andere momenten zijn een
//   details met hun aantal. Daarvoor kijkt de tabel met matchMedia naar de breedte (de css doet de rest).

import { useSyncExternalStore } from 'react';
import { EINDMOMENTEN, type LeerlijnOnderwerp } from '../../lib/basis/doelBasis';
import type { Eindmoment } from '../../lib/basis/kalender';
import { DoelRij, MOMENT_KORT } from './DoelRij';

export const SMAL = '(max-width: 760px)';

function abonneer(melding: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(SMAL);
  mql.addEventListener?.('change', melding);
  return () => mql.removeEventListener?.('change', melding);
}
const isSmal = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SMAL).matches;

/** Is het scherm 760 px of smaller? Zonder matchMedia (server, test) is het antwoord nee. */
export function useSmalScherm(): boolean {
  return useSyncExternalStore(abonneer, isSmal, () => false);
}

export const LEGE_CEL_MET_SET = 'Op dit moment niet apart vermeld';
export const LEGE_CEL_ZONDER_SET = 'Geen doelen voor dit moment';

export interface LeerlijnTabelProps {
  onderwerp: LeerlijnOnderwerp;
  /** Het eindmoment waar het leerjaar van de leerkracht naartoe werkt: die kolom krijgt '(je leerjaar)'. */
  eigen?: Eindmoment;
  /** De momenten waarop het vak een nieuwe set heeft; een lege cel op een ander moment zegt 'Geen doelen voor dit moment'. */
  momenten: ReadonlySet<Eindmoment>;
  /** Forceer de kaartweergave (voor tests); standaard volgt ze de breedte van het scherm. */
  smal?: boolean;
}

const doelen = (n: number): string => `${n} ${n === 1 ? 'doel' : 'doelen'}`;

function Cel({ rij, m, eigen, momenten, smal }: {
  rij: LeerlijnOnderwerp['rijen'][number];
  m: Eindmoment;
  eigen?: Eindmoment;
  momenten: ReadonlySet<Eindmoment>;
  smal: boolean;
}) {
  const lijst = rij.cellen[m];
  const isEigen = m === eigen;
  const klasse = isEigen ? 'b-cel b-cel-eigen' : 'b-cel';
  const naam = isEigen ? `${MOMENT_KORT[m]} (je leerjaar)` : MOMENT_KORT[m];
  const inhoud =
    lijst.length > 0 ? (
      <ul className="b-doelrijen">
        {lijst.map((d) => (
          <li key={`${d.setId}-${d.id}`}>
            <DoelRij doel={d} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="b-cel-leeg">{momenten.has(m) ? LEGE_CEL_MET_SET : LEGE_CEL_ZONDER_SET}</p>
    );
  if (!smal) return <td className={klasse}>{inhoud}</td>;
  // Kaartweergave: elk moment een eigen blok met zijn naam erboven. Een lege cel zegt het in één regel.
  return (
    <td className={klasse}>
      {lijst.length > 0 ? (
        <details className="b-cel-details" open={isEigen || undefined}>
          <summary>
            {naam} <span className="b-cel-aantal">({doelen(lijst.length)})</span>
          </summary>
          {inhoud}
        </details>
      ) : (
        <p className="b-cel-leeg">
          <strong>{naam}:</strong> {momenten.has(m) ? LEGE_CEL_MET_SET : LEGE_CEL_ZONDER_SET}
        </p>
      )}
    </td>
  );
}

export function LeerlijnTabel({ onderwerp, eigen, momenten, smal }: LeerlijnTabelProps) {
  const opBreedte = useSmalScherm();
  const kaarten = smal ?? opBreedte;
  return (
    <div className="b-tabelrand">
      <table className={kaarten ? 'b-tabel b-tabel-kaarten' : 'b-tabel'}>
        <caption className="sr-only">
          Onderwerp {onderwerp.nr} {onderwerp.naam}: de doelen per subthema op de drie eindmomenten
        </caption>
        <thead>
          <tr>
            <th scope="col" className="b-tabel-rubriek">
              Subthema
            </th>
            {EINDMOMENTEN.map((m) => (
              <th key={m} scope="col" className={m === eigen ? 'b-kolom-eigen' : undefined}>
                {MOMENT_KORT[m]}
                {m === eigen && <span className="b-kolom-noot"> (je leerjaar)</span>}
                <span className="b-kolom-aantal"> · {doelen(onderwerp.aantal[m])}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {onderwerp.rijen.map((rij, i) => (
            <tr key={rij.subthema ?? `zonder-${i}`}>
              <th scope="row" className="b-tabel-rubriek">
                {rij.subthema ?? 'Zonder subthema'}
              </th>
              {EINDMOMENTEN.map((m) => (
                <Cel key={m} rij={rij} m={m} eigen={eigen} momenten={momenten} smal={kaarten} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
