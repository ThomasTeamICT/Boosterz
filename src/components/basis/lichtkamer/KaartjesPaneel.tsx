// Het paneel van 'Drie kaartjes met een gaatje': de gaatjes verzetten met knoppen (de lamp staat in de balk onder de
// kijkdoos). Dun: elke knop is een actie van kaartjesReducer.

import type { Dispatch } from 'react';
import { KAARTJES_RIJEN, gaatTekst, kaartjesTerugkoppeling, type KaartjesLesActie, type KaartjesLesToestand } from '../../../lib/basis/lichtkamer/les';
import { MoveDownIcon, MoveUpIcon } from '../../icons';
import { Terugkoppeling } from './LesOnderdelen';

export function KaartjesPaneel({ t, dispatch }: { t: KaartjesLesToestand; dispatch: Dispatch<KaartjesLesActie> }) {
  const fb = kaartjesTerugkoppeling(t);
  return (
    <div className="b-lk-paneel">
      <div className="b-lk-tabel">
        <table>
          <caption className="sr-only">De gaatjes van de drie kaartjes</caption>
          <thead>
            <tr>
              <th scope="col">Kaartje</th>
              <th scope="col">Gaatje</th>
              <th scope="col">
                <span className="sr-only">Verzetten</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {KAARTJES_RIJEN.map((r) => (
              <tr key={r.i}>
                <th scope="row">{r.naam}</th>
                <td>{gaatTekst(t, r.i)}</td>
                <td>
                  <div className="b-lk-rij">
                    <button type="button" className="b-knop b-lk-pijl" aria-label={`Gaatje ${r.naam} hoger`} onClick={() => dispatch({ type: 'gat', i: r.i, d: 1 })}>
                      <MoveUpIcon size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="b-knop b-lk-pijl" aria-label={`Gaatje ${r.naam} lager`} onClick={() => dispatch({ type: 'gat', i: r.i, d: -1 })}>
                      <MoveDownIcon size={18} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fb ? <Terugkoppeling soort={fb.soort} titel={fb.titel} uitleg={fb.uitleg} /> : <Terugkoppeling soort={null} />}
    </div>
  );
}
