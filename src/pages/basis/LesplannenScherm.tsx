// #/basis/lesplannen?leerjaar=K1&vak=wt: de lesplannen van het GO! per leeftijdsgroep (docs/basisonderwijs/GO-LEERPLAN.md,
// "Adressen" en "5. Per leerjaar"), per vakdiscipline › lessenlijn › lessenreeks. De kiezer voor de leeftijd is dezelfde als
// bij de leerplandoelen; de groep van het bewaarde leerjaar staat standaard aan, 'Alle leeftijden' zet dat uit zonder iets te
// bewaren. Alleen de index wordt geladen. Een kop staat er alleen als er iets onder staat.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LeeftijdKiezer } from '../../components/basis/go/LeeftijdKiezer';
import { useGoIndex } from '../../components/basis/useGo';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { aantalLesplannenPerLeeftijd, lessenlijnen, lesplannenFilter } from '../../lib/basis/go/goModel';
import { leerjaarVanLeeftijd, leeftijdLabel, leeftijdVanLeerjaar } from '../../lib/basis/go/leeftijden';
import { GO_NAAMSVERMELDING, GO_STUDIO_URL, GO_VAKKEN, GO_VAK_CODES, type GoIndex, type GoLeeftijd, type GoVak } from '../../lib/basis/go/types';
import type { LeerjaarBasis } from '../../lib/basis/kalender';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import { webUrl } from '../../lib/veiligeUrl';
import '../../styles/basis-go.css';

const KOP = 'Lesplannen van het GO!';

const lesplannenWoord = (n: number) => `${n} ${n === 1 ? 'lesplan' : 'lesplannen'}`;

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

export interface LesplannenInhoudProps {
  index: GoIndex;
  leeftijd?: GoLeeftijd;
  vak?: GoVak;
  onLeeftijd: (l: GoLeeftijd | undefined) => void;
  /** Het adres met dezelfde leeftijd en een ander vak (of alle vakken). */
  vakPad: (vak: GoVak | undefined) => string;
}

/** De pagina voor een geladen index, zonder zelf iets te laden. */
export function LesplannenInhoud({ index, leeftijd, vak, onLeeftijd, vakPad }: LesplannenInhoudProps) {
  const lijnen = lessenlijnen(index, { leeftijd, vak });
  const aantal = lesplannenFilter(index, { leeftijd, vak }).length;
  const totaal = index.lesplannen.length;
  const perLeeftijd = aantalLesplannenPerLeeftijd(index);
  // De vakken met lesplannen in deze leeftijd: alleen daar zijn de keuzes zinvol.
  const vakken = GO_VAK_CODES.filter((v) => lesplannenFilter(index, { leeftijd, vak: v }).length > 0);
  const aantallen = Object.fromEntries(perLeeftijd.map((p) => [p.leeftijd, p.aantal])) as Partial<Record<GoLeeftijd, number>>;
  const perVak = GO_VAK_CODES.filter((v) => lijnen.some((l) => l.vak === v));
  return (
    <div className="b-doelpagina b-go-pagina b-go-lesplanlijst">
      <nav className="b-kruimel" aria-label="Kruimelpad">
        <ol>
          <li>
            <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
          </li>
          <li>
            <span aria-current="page">Lesplannen</span>
          </li>
        </ol>
      </nav>
      <h1>{KOP}</h1>
      <p className="b-lead">
        {lesplannenWoord(totaal)} van het GO!, per leeftijd, vakdiscipline, lessenlijn en lessenreeks. Elk lesplan zegt welke leerplandoelen het haalt.
      </p>
      <Bron index={index} />

      <LeeftijdKiezer waarde={leeftijd} onKies={onLeeftijd} aantallen={aantallen} />

      {vakken.length > 1 && (
        <nav className="b-go-onderwerpen" aria-label="Vakdiscipline">
          <ul>
            <li>
              <Link to={vakPad(undefined)} className="b-go-pil" aria-current={vak === undefined ? 'true' : undefined}>
                Alle vakdisciplines
              </Link>
            </li>
            {vakken.map((v) => (
              <li key={v}>
                <Link to={vakPad(v)} className="b-go-pil" aria-current={vak === v ? 'true' : undefined}>
                  {GO_VAKKEN[v].naam}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <p className="b-go-aantal" role="status">
        {aantal === 0
          ? `Er zijn nog geen lesplannen${leeftijd ? ` voor ${leeftijdLabel(leeftijd)}` : ''}${vak ? ` in ${GO_VAKKEN[vak].naam.toLowerCase()}` : ''}.`
          : `${lesplannenWoord(aantal)} van de ${totaal}${leeftijd ? ` voor ${leeftijdLabel(leeftijd)}` : ''}${vak ? `, ${GO_VAKKEN[vak].naam.toLowerCase()}` : ''}.`}
      </p>
      {aantal === 0 && perLeeftijd.length > 0 && (
        <p className="b-noot">
          Er zijn lesplannen voor {perLeeftijd.map((p) => leeftijdLabel(p.leeftijd)).join(', ')}. Kies een andere leeftijd om ze te zien.
        </p>
      )}

      {perVak.map((v) => (
        <section key={v} className="b-go-deel" aria-labelledby={`b-lp-vak-${v}`}>
          <h2 id={`b-lp-vak-${v}`}>{GO_VAKKEN[v].naam}</h2>
          {lijnen
            .filter((l) => l.vak === v)
            .map((lijn) => (
              <div key={lijn.slug} className="b-go-groep">
                <h3>
                  <Link to={basisPad({ s: 'lessenlijn', vak: lijn.vak, lijn: lijn.slug, leerjaar: leeftijd ? leerjaarVanLeeftijd(leeftijd) : undefined })} className="b-go-lesplanlink">
                    {lijn.naam}
                    <span className="sr-only"> (open deze lessenlijn)</span>
                  </Link>{' '}
                  <span className="b-go-leeftijden">({lesplannenWoord(lijn.lesplannen.length)})</span>
                </h3>
                {lijn.reeksen.map((r) => (
                  <div key={r.naam}>
                    <h4 className="b-go-reeks">{r.naam}</h4>
                    <ul className="b-go-lesplannen">
                      {r.lesplannen.map((l) => (
                        <li key={l.code}>
                          <Link to={basisPad({ s: 'lesplan', code: l.code })} className="b-go-lesplanlink">
                            Lesplan {l.code} {l.titel}
                          </Link>{' '}
                          <span className="b-go-leeftijden">({leeftijdLabel(l.leeftijd)})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}

export function LesplannenScherm({ leerjaar, vak }: { leerjaar?: LeerjaarBasis; vak?: GoVak }) {
  const index = useGoIndex();
  const navigate = useNavigate();
  const { keuze } = useBasisKeuze();
  const [alle, setAlle] = useState(false);

  // Het adres wint; zonder leerjaar in het adres staat de groep van het bewaarde leerjaar aan, tenzij je 'Alle leeftijden' koos.
  const effectief: LeerjaarBasis | undefined = leerjaar ?? (alle ? undefined : keuze?.leerjaar);
  const leeftijd = effectief ? leeftijdVanLeerjaar(effectief) : undefined;

  const kiesLeeftijd = (l: GoLeeftijd | undefined) => {
    setAlle(l === undefined);
    navigate(basisPad({ s: 'lesplannen', leerjaar: l ? leerjaarVanLeeftijd(l) : undefined, vak }), { replace: true });
  };
  const vakPad = (v: GoVak | undefined) => basisPad({ s: 'lesplannen', leerjaar: effectief, vak: v });

  if (index.stand.status === 'laden') {
    return (
      <div className="b-doelpagina">
        <h1>{KOP}</h1>
        <LaadBericht tekst="De lesplannen worden geladen" />
      </div>
    );
  }
  if (index.stand.status === 'fout') {
    return (
      <div className="b-doelpagina">
        <h1>{KOP}</h1>
        <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />
      </div>
    );
  }
  return <LesplannenInhoud index={index.stand.waarde} leeftijd={leeftijd} vak={vak} onLeeftijd={kiesLeeftijd} vakPad={vakPad} />;
}
