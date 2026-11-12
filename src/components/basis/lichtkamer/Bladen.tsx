// Het meetblad (voor de kinderen, plan B) en het observatieblad (voor de leerkracht, na de les) van proefles 1 van de
// Lichtkamer, uit lesmateriaal.ts. Beide zijn bladen om af te drukken: invulvakjes en schrijflijnen zijn gewone css-vormen,
// geen invoervelden. Er staat nergens een naam: het observatieblad vraagt er zelfs om er geen te schrijven.

import { type Meetblad, type Observatieblad, type ObservatieVeld, type Spiekkaart } from '../../../lib/basis/lichtkamer/lesmateriaal';
import { foutpatroonTekst } from '../../../lib/basis/lichtkamerBronnen';

/** Een vakje om aan te kruisen, met de tekst ernaast. Het vakje is versiering: de tekst zegt wat het is. */
function Keuze({ tekst }: { tekst: string }) {
  return (
    <li className="b-bl-keuze">
      <span className="b-bl-vakje" aria-hidden="true" />
      {tekst}
    </li>
  );
}

function Lijnen({ aantal }: { aantal: number }) {
  return (
    <div className="b-bl-lijnen" aria-hidden="true">
      {Array.from({ length: aantal }, (_, i) => (
        <span key={i} className="b-bl-lijn" />
      ))}
    </div>
  );
}

export function MeetbladBlad({ blad }: { blad: Meetblad }) {
  return (
    <article className="b-lkp-blad b-bl" aria-labelledby="b-ml-titel">
      <h3 id="b-ml-titel">{blad.titel}</h3>
      <p className="b-bl-noot b-lkp-scherm">{blad.noot}</p>
      <p>
        <strong>Onderzoeksvraag:</strong> {blad.onderzoeksvraag}
      </p>
      <p>
        <strong>Je verandert:</strong> {blad.jeVerandert} <strong>Je houdt gelijk:</strong> {blad.jeHoudtGelijk}
      </p>
      <h4>Wat denk je? (hypothese)</h4>
      <ul className="b-bl-keuzes">
        {blad.hypothesen.map((h) => (
          <Keuze key={h} tekst={h} />
        ))}
      </ul>
      <h4>Stappen</h4>
      <ol className="b-bl-stappen">
        {blad.stappen.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <h4>Mijn metingen</h4>
      <table className="b-bl-tabel">
        <thead>
          <tr>
            <th scope="col">{blad.kolomAfstand}</th>
            <th scope="col">{blad.kolomHoogte}</th>
          </tr>
        </thead>
        <tbody>
          {blad.afstanden.map((cm) => (
            <tr key={cm}>
              <th scope="row">{cm} cm</th>
              <td className="b-bl-invul" />
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Mijn conclusie</h4>
      <ul className="b-bl-keuzes">
        {blad.conclusies.map((c) => (
          <Keuze key={c} tekst={c} />
        ))}
      </ul>
    </article>
  );
}

function Veld({ v, kaart }: { v: ObservatieVeld; kaart: Spiekkaart }) {
  switch (v.soort) {
    case 'regels':
      return (
        <div className="b-bl-veld">
          <p>{v.vraag}</p>
          <Lijnen aantal={v.regels} />
        </div>
      );
    case 'getal':
      return (
        <p className="b-bl-veld b-bl-getal">
          {v.vraag.endsWith('?') ? v.vraag : `${v.vraag}:`} <span className="b-bl-streep" aria-hidden="true" />
        </p>
      );
    case 'keuze':
      return (
        <div className="b-bl-veld">
          <p>{v.vraag}</p>
          <ul className="b-bl-keuzes b-bl-rij">
            {v.opties.map((o) => (
              <Keuze key={o} tekst={o} />
            ))}
            {v.anders && (
              <li className="b-bl-keuze">
                <span className="b-bl-vakje" aria-hidden="true" />
                anders: <span className="b-bl-streep" aria-hidden="true" />
              </li>
            )}
          </ul>
        </div>
      );
    case 'tijden':
      return (
        <div className="b-bl-veld">
          <p>{v.vraag}</p>
          <table className="b-bl-tabel">
            <thead>
              <tr>
                <th scope="col">Fase</th>
                <th scope="col">Gepland (min)</th>
                <th scope="col">Echt (min)</th>
                <th scope="col">Opmerking</th>
              </tr>
            </thead>
            <tbody>
              {kaart.fasen.map((f) => (
                <tr key={f.van}>
                  <th scope="row">{f.titel}</th>
                  <td>{f.tot - f.van}</td>
                  <td className="b-bl-invul" />
                  <td className="b-bl-invul" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'turven':
      return (
        <div className="b-bl-veld">
          <p>{v.vraag}</p>
          <table className="b-bl-tabel">
            <thead>
              <tr>
                <th scope="col">Wat je ziet</th>
                <th scope="col">Streepjes</th>
              </tr>
            </thead>
            <tbody>
              {v.foutpatronen.map((id) => (
                <tr key={id}>
                  <th scope="row">{foutpatroonTekst(id) ?? id}</th>
                  <td className="b-bl-invul" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function ObservatiebladBlad({ blad, kaart }: { blad: Observatieblad; kaart: Spiekkaart }) {
  return (
    <article className="b-lkp-blad b-bl" aria-labelledby="b-ob-titel">
      <h3 id="b-ob-titel">{blad.titel}</h3>
      <p>{blad.ondertitel}</p>
      <p className="b-bl-geennamen">
        <strong>{blad.geenNamen}</strong>
      </p>
      {blad.blokken.map((b) => (
        <section key={b.titel} className="b-bl-blok" aria-label={b.titel}>
          <h4>{b.titel}</h4>
          {b.velden.map((v) => (
            <Veld key={`${v.soort}-${v.vraag}`} v={v} kaart={kaart} />
          ))}
        </section>
      ))}
    </article>
  );
}

