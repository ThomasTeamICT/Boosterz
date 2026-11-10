// #/basis/lessenlijn/wt/biologie-van-organismen?leerjaar=K1: één lessenlijn van het GO! (docs/basisonderwijs/GO-LEERPLAN.md,
// "6. Per lessenlijn"). Een tabel zoals de leerlijn: de rijen zijn de lessenreeksen, de kolommen de leeftijdsgroepen met
// lesplannen, de cellen de lesplannen. Een lessenlijn komt alleen uit de lesplannen, niet uit de Excel, en het GO! legt de
// volgorde van de lessen niet vast: de volgorde volgt de lesplancodes. Een onbekende lessenlijn zegt dat, met een link naar
// alle lesplannen. Alleen de index wordt geladen.
//
// Op 760 px of smaller wordt elke rij een kaart (de css doet dat; role=table, row en cell houden het een tabel voor een
// schermlezer). Het leerjaar in het adres, of anders het bewaarde leerjaar, kleurt zijn kolom.

import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useGoIndex } from '../../components/basis/useGo';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { lessenlijnTabel, vindLessenlijn, type Lessenlijn } from '../../lib/basis/go/goModel';
import { leeftijdLabel, leeftijdVanLeerjaar } from '../../lib/basis/go/leeftijden';
import { GO_NAAMSVERMELDING, GO_STUDIO_URL, GO_VAKKEN, type GoIndex, type GoLeeftijd, type GoVak } from '../../lib/basis/go/types';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import { webUrl } from '../../lib/veiligeUrl';
import '../../styles/basis-go.css';

export const VOLGORDE_ZIN = 'De volgorde volgt de lesplancodes; het GO! legt de volgorde van de lessen niet vast in deze gegevens.';

const lesplannenWoord = (n: number) => `${n} ${n === 1 ? 'lesplan' : 'lesplannen'}`;

function Kruimel({ vak, laatste }: { vak: GoVak; laatste: string }) {
  return (
    <nav className="b-kruimel" aria-label="Kruimelpad">
      <ol>
        <li>
          <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
        </li>
        <li>
          <Link to={basisPad({ s: 'lesplannen', vak })}>Lesplannen: {GO_VAKKEN[vak].naam}</Link>
        </li>
        <li>
          <span aria-current="page">{laatste}</span>
        </li>
      </ol>
    </nav>
  );
}

/** De melding voor een lessenlijn die niet bestaat: een kop, een zin en een link naar alle lesplannen. */
export function LessenlijnNietGevonden() {
  return (
    <section className="b-plaats">
      <h1>Deze lessenlijn vonden we niet</h1>
      <p>Misschien is de lessenlijn van naam veranderd of staat het adres niet goed.</p>
      <ul className="b-plaats-links">
        <li>
          <Link to={basisPad({ s: 'lesplannen', alle: true })}>Alle lesplannen van het GO!</Link>
        </li>
        <li>
          <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
        </li>
      </ul>
    </section>
  );
}

function Bron({ index }: { index: GoIndex }) {
  const studio = webUrl(GO_STUDIO_URL);
  return (
    <p className="b-lp-bron">
      {`Bron: ${GO_NAAMSVERMELDING}, lesplannen uit `}
      {studio ? (
        <a href={studio} target="_blank" rel="noopener noreferrer">
          GO! studio<span className="sr-only"> (opent in een nieuw tabblad)</span>
        </a>
      ) : (
        'GO! studio'
      )}
      {'. Letterlijk overgenomen met toestemming.'}
      {index.ingelezen ? ` Ingelezen op ${datumLeesbaar(index.ingelezen)}.` : ''}
    </p>
  );
}

/** De pagina van een bestaande lessenlijn, zonder laden. `eigen` is de leeftijdsgroep van het leerjaar van de leerkracht. */
export function LessenlijnInhoud({ index, lijn, eigen }: { index: GoIndex; lijn: Lessenlijn; eigen?: GoLeeftijd }) {
  const tabel = lessenlijnTabel(lijn);
  const aantal = lijn.lesplannen.length;
  return (
    <div className="b-doelpagina b-go-pagina b-go-lessenlijn">
      <Kruimel vak={lijn.vak} laatste={lijn.naam} />
      <h1>Lessenlijn {lijn.naam}</h1>
      <p className="b-lead">
        {GO_VAKKEN[lijn.vak].naam}: {lesplannenWoord(aantal)} in {lijn.reeksen.length} {lijn.reeksen.length === 1 ? 'lessenreeks' : 'lessenreeksen'}.
      </p>
      <Bron index={index} />
      <p className="b-noot">{VOLGORDE_ZIN}</p>

      <div className="b-go-tabelomhulsel">
        <table className="b-go-lijntabel" aria-label={`Lessenreeksen van ${lijn.naam} per leeftijd`} role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                Lessenreeks
              </th>
              {tabel.kolommen.map((k) => (
                <th key={k} scope="col" role="columnheader" className={k === eigen ? 'b-go-eigen' : undefined}>
                  {leeftijdLabel(k)}
                  {k === eigen && <span className="b-go-leeftijden"> (je leerjaar)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {tabel.rijen.map((r) => (
              <tr key={r.reeks} role="row">
                <th scope="row" role="rowheader" className="b-go-reeksnaam">
                  {r.reeks}
                </th>
                {r.cellen.map((cel, n) => {
                  const k = tabel.kolommen[n];
                  return (
                    <td key={k} role="cell" className={k === eigen ? 'b-go-eigen' : undefined}>
                      <span className="b-go-label" aria-hidden="true">
                        {leeftijdLabel(k)}
                      </span>
                      {cel.length > 0 ? (
                        <ul className="b-go-lesplannen">
                          {cel.map((l) => (
                            <li key={l.code}>
                              <Link to={basisPad({ s: 'lesplan', code: l.code })} className="b-go-lesplanlink">
                                Lesplan {l.code} {l.titel}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Fragment>
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">Geen lesplan voor {leeftijdLabel(k)}</span>
                        </Fragment>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="b-go-voet">
        <Link to={basisPad({ s: 'lesplannen', alle: true, vak: lijn.vak })}>Alle lesplannen van {GO_VAKKEN[lijn.vak].doelenset}</Link>
      </p>
    </div>
  );
}

export function LessenlijnScherm({ vak, lijn }: { vak: GoVak; lijn: string }) {
  const index = useGoIndex();
  const { keuze } = useBasisKeuze();
  if (index.stand.status === 'laden') {
    return (
      <div className="b-doelpagina">
        <h1>Lessenlijn</h1>
        <LaadBericht tekst="De lessenlijn wordt geladen" />
      </div>
    );
  }
  if (index.stand.status === 'fout') {
    return (
      <div className="b-doelpagina">
        <h1>Lessenlijn</h1>
        <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />
      </div>
    );
  }
  const gevonden = vindLessenlijn(index.stand.waarde, vak, lijn);
  if (!gevonden) return <LessenlijnNietGevonden />;
  // Het leerjaar in het adres is hier een leeftijdsfilter van een andere lijst, niet het leerjaar van de leerkracht.
  const eigenLeerjaar = keuze?.leerjaar;
  return <LessenlijnInhoud index={index.stand.waarde} lijn={gevonden} eigen={eigenLeerjaar ? leeftijdVanLeerjaar(eigenLeerjaar) : undefined} />;
}
