// Het paneel van het onderzoek: hypothese, drie metingen (tekst, komma of punt), conclusie en nakijken. Dun: elke tik of
// elk getypt teken is een actie van onderzoekReducer; het nakijken doet kijkOnderzoekNa.

import type { Dispatch } from 'react';
import { CONCLUSIES, HYPOTHESEN, STANDAARD_AFSTANDEN } from '../../../lib/basis/lichtkamer';
import {
  CONCLUSIE_TEKST,
  HYPOTHESE_TEKST,
  MAX_METING_TEKENS,
  onderzoekOpzet,
  staatOp,
  type OnderzoekLesActie,
  type OnderzoekLesToestand,
} from '../../../lib/basis/lichtkamer/les';
import { NAAM_VOORWERP } from '../../../lib/basis/lichtkamer';
import { Terugkoppeling } from './LesOnderdelen';

/** Veld-id's per paneel: ze moeten uniek zijn op de pagina, ook met twee panelen. */
const veldId = (cm: number) => `lk-meting-${cm}`;

export function OnderzoekPaneel({ t, dispatch }: { t: OnderzoekLesToestand; dispatch: Dispatch<OnderzoekLesActie> }) {
  const opzet = onderzoekOpzet(t.voorwerp);
  const naam = NAAM_VOORWERP[t.voorwerp];
  const afstanden = [...STANDAARD_AFSTANDEN];
  const u = t.uitkomst;
  return (
    <div className="b-lk-paneel">
      <div className="b-lk-kaart">
        <h3>Het onderzoek (klaargezet)</h3>
        <p>
          <strong>Onderzoeksvraag: </strong>
          {opzet.vraag}
        </p>
        <p>
          <strong>Je verandert: </strong>
          {opzet.verandert}
        </p>
        <p>
          <strong>Je houdt gelijk: </strong>
          {opzet.gelijk}
        </p>
      </div>

      <h3 id="lk-hyp-kop">1. Wat denk ik dat er gebeurt? (mijn hypothese)</h3>
      <div className="b-lk-opts" role="group" aria-labelledby="lk-hyp-kop">
        {HYPOTHESEN.map((h) => (
          <button key={h} type="button" className="b-lk-opt" aria-pressed={t.hypothese === h} onClick={() => dispatch({ type: 'hypothese', hypothese: h })}>
            {HYPOTHESE_TEKST[h]}
          </button>
        ))}
      </div>

      <h3 id="lk-meet-kop">2. Mijn metingen</h3>
      <p className="b-lk-uitleg">Zet de lamp op die afstand, lees de top van de schaduw af op de meetlat en typ het getal. Een komma of een punt mag.</p>
      <div className="b-lk-velden" role="group" aria-labelledby="lk-meet-kop">
        {afstanden.map((cm) => (
          <div key={cm} className="b-lk-veld">
            <label htmlFor={veldId(cm)}>
              Hoogte van de schaduw bij {cm} cm van het {naam}
            </label>
            <div className="b-lk-rij">
              <input
                id={veldId(cm)}
                className="b-lk-invoer"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                maxLength={MAX_METING_TEKENS}
                value={t.metingen[cm] ?? ''}
                onChange={(e) => dispatch({ type: 'meting', cm, tekst: e.target.value })}
              />
              <span className="b-lk-eenheid">cm</span>
              <button type="button" className="b-knop" aria-pressed={staatOp(t, cm)} onClick={() => dispatch({ type: 'afstand', cm })}>
                Zet de lamp op {cm} cm
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 id="lk-con-kop">3. Wat heb ik ontdekt? (mijn conclusie)</h3>
      <div className="b-lk-opts" role="group" aria-labelledby="lk-con-kop">
        {CONCLUSIES.map((c) => (
          <button key={c} type="button" className="b-lk-opt" aria-pressed={t.conclusie === c} onClick={() => dispatch({ type: 'conclusie', conclusie: c })}>
            {CONCLUSIE_TEKST[c]}
          </button>
        ))}
      </div>

      <div className="b-lk-acties">
        <button type="button" className="b-knop b-lk-hoofd b-lk-groot" onClick={() => dispatch({ type: 'nakijken' })}>
          Mijn onderzoek nakijken
        </button>
      </div>
      {u ? <Terugkoppeling soort={u.soort} titel={u.titel} uitleg={u.uitleg} /> : <Terugkoppeling soort={null} />}
    </div>
  );
}
