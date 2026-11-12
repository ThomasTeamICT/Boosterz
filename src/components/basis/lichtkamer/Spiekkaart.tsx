// De spiekkaart van proefles 1 van de Lichtkamer (LK-7, lesmateriaal.ts) als blad: op het scherm van de leerkracht en op
// papier. Eén blad A4 recto-verso (hoogstens twee bladzijden): het scherm eist dat met de printstijl in
// basis-lichtkamer-schermen.css. De teksten komen uit het lesmateriaal; de teksten van de doelen staan er letterlijk in
// (vulSpiekkaart). Een tekst die niet geladen is, staat er leeg en krijgt een korte melding.

import { Fragment } from 'react';
import {
  OEFENING_TITEL,
  leeftijdBereik,
  type Antwoord,
  type Fase,
  type GevuldeSpiekkaart,
  type Plek,
} from '../../../lib/basis/lichtkamer/lesmateriaal';
import { bronvermeldingLeerplan } from '../../../lib/basis/go/types';

const PLEK_NAAM: Readonly<Record<Plek, string>> = { klas: 'in de klas', bord: 'op het bord', chromebook: 'op de Chromebook' };

function FaseRij({ f }: { f: Fase }) {
  return (
    <li className="b-sk-fase">
      <p className="b-sk-fasekop">
        <strong>
          {f.van}-{f.tot} min
        </strong>{' '}
        {f.titel} <span className="b-sk-plek">({PLEK_NAAM[f.plek]})</span>
        {f.oefeningen.length > 0 && <span className="b-sk-oef">: {f.oefeningen.map((o) => OEFENING_TITEL[o]).join(', ')}</span>}
      </p>
      <ul>
        {f.doe.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      {f.zeg && (
        <p className="b-sk-zeg">
          <strong>Zeg:</strong> {f.zeg}
        </p>
      )}
    </li>
  );
}

function AntwoordRij({ a }: { a: Antwoord }) {
  return (
    <div className="b-sk-antwoord">
      <dt>{a.waar === 'check' ? 'Check' : OEFENING_TITEL[a.waar]}</dt>
      <dd>
        {a.regels.map((r) => (
          <span key={r} className="b-sk-regel">
            {r}
          </span>
        ))}
      </dd>
    </div>
  );
}

export function Spiekkaart({ kaart }: { kaart: GevuldeSpiekkaart }) {
  const goDoelen = kaart.doelen.flatMap((d) => d.goDoelen);
  return (
    <article className="b-lkp-blad b-sk" aria-labelledby="b-sk-titel">
      <header className="b-sk-kop">
        <h3 id="b-sk-titel">{kaart.titel}</h3>
        <p>{kaart.ondertitel}</p>
      </header>

      <section aria-labelledby="b-sk-doelen">
        <h4 id="b-sk-doelen">Doelen</h4>
        <p className="b-sk-noot">{kaart.noot}</p>
        <ol className="b-sk-doelen">
          {kaart.doelen.map((d) => (
            <li key={d.id}>
              <strong>
                {d.id}
                {d.code && ` (${d.code})`}
              </strong>{' '}
              {d.tekst || <em>De tekst van dit doel is niet geladen.</em>}
              <span className="b-sk-kind"> Kind: {d.kind}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="b-sk-materiaal">
        <h4 id="b-sk-materiaal">Materiaal</h4>
        <p>{kaart.materiaal}</p>
      </section>

      <section aria-labelledby="b-sk-verloop">
        <h4 id="b-sk-verloop">Lesverloop</h4>
        <ol className="b-sk-fasen">
          {kaart.fasen.map((f) => (
            <FaseRij key={f.van} f={f} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="b-sk-antwoorden">
        <h4 id="b-sk-antwoorden">Antwoorden</h4>
        <dl className="b-sk-antwoorden">
          {kaart.antwoorden.map((a) => (
            <AntwoordRij key={a.waar} a={a} />
          ))}
        </dl>
      </section>

      <section className="b-sk-achterkant" aria-labelledby="b-sk-fouten">
        <h4 id="b-sk-fouten">Als het misloopt bij een kind</h4>
        <table className="b-sk-tabel">
          <thead>
            <tr>
              <th scope="col">Wat je ziet</th>
              <th scope="col">Zeg</th>
              <th scope="col">Doe</th>
            </tr>
          </thead>
          <tbody>
            {kaart.fouten.map((f) => (
              <tr key={f.foutpatroon}>
                <td data-label="Wat je ziet">
                  {f.tekst}
                  {f.zieJe && <span className="b-sk-scherm"> Het scherm zegt: {f.zieJe}</span>}
                </td>
                <td data-label="Zeg">{f.zeg}</td>
                <td data-label="Doe">{f.doe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="b-sk-planb">
        <h4 id="b-sk-planb">Plan B</h4>
        <table className="b-sk-tabel">
          <thead>
            <tr>
              <th scope="col">Storing</th>
              <th scope="col">Wat je doet</th>
            </tr>
          </thead>
          <tbody>
            {kaart.planB.map((p) => (
              <tr key={p.storing}>
                <td data-label="Storing">{p.storing}</td>
                <td data-label="Wat je doet">{p.doe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="b-sk-go" aria-labelledby="b-sk-go">
        <h4 id="b-sk-go">Leerplandoelen van het GO!, ter info</h4>
        <p>{kaart.goTerInfo.zin}</p>
        {goDoelen.length > 0 ? (
          <Fragment>
            <ul>
              {kaart.doelen.flatMap((d) =>
                d.goDoelen.map((g) => (
                  <li key={`${d.id}-${g.code}`}>
                    <strong>{g.code}</strong> ({leeftijdBereik(g.leeftijden)} jaar) {g.tekst}
                  </li>
                )),
              )}
            </ul>
            <p className="b-sk-bron">{bronvermeldingLeerplan(kaart.goTerInfo.goVak)}</p>
          </Fragment>
        ) : (
          <p>
            <em>De leerplandoelen van het GO! zijn niet geladen.</em>
          </p>
        )}
      </section>
    </article>
  );
}
