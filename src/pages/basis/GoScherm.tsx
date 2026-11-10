// #/basis/go: 'Leerplan en lesplannen van het GO!', het overzicht (docs/basisonderwijs/GO-LEERPLAN.md, "Adressen"): twaalf
// vaktegels met de leerplandoelen van het GO! en de lesplannen per leeftijd. Drie lagen, elk met zijn eigen bron:
// het minimumdoel (de overheid) ← het leerplandoel (het GO!) ← het lesplan (het GO!).
//
// Alleen de index wordt geladen. Een kop of lijst staat er alleen als er iets onder staat: zonder lesplannen is er geen
// deel 'Lesplannen'. De bron staat onderaan, met de naamsvermelding van het GO!.

import { Link } from 'react-router-dom';
import { LeeftijdUitleg } from '../../components/basis/go/LeeftijdKiezer';
import { useGoIndex } from '../../components/basis/useGo';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { ZekerheidBadge } from '../../components/basis/ZekerheidBadge';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { goVakIcoon, goVakTint } from '../../components/basis/vakIconen';
import { basisPad } from '../../lib/basis/basisRoutes';
import { aantalLesplannenPerLeeftijd, lesplannenPerLeeftijd } from '../../lib/basis/go/goModel';
import { GO_LEESBRIL_ZEKERHEID, leeftijdLabel, leeftijdVanLeerjaar, meestalTekst } from '../../lib/basis/go/leeftijden';
import { GO_NAAMSVERMELDING, GO_STUDIO_URL, GO_VAKKEN, type GoIndex } from '../../lib/basis/go/types';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import { webUrl } from '../../lib/veiligeUrl';
import '../../styles/basis-go.css';

const KOP = 'Leerplan en lesplannen van het GO!';

const doelenWoord = (n: number) => `${n} ${n === 1 ? 'leerplandoel' : 'leerplandoelen'}`;

/** De bronvermelding van het overzicht: het leerplan en GO! studio, met een link naar GO! studio. */
function Bron({ index }: { index: GoIndex }) {
  const studio = webUrl(GO_STUDIO_URL);
  return (
    <p className="b-lp-bron">
      {`Bron: ${GO_NAAMSVERMELDING}, het nieuwe GO! leerplan basisonderwijs en de lesplannen uit `}
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

/** Het overzicht voor een geladen index, zonder zelf iets te laden. */
export function GoInhoud({ index }: { index: GoIndex }) {
  const { keuze } = useBasisKeuze();
  const groepen = aantalLesplannenPerLeeftijd(index);
  const eigenLeeftijd = keuze ? leeftijdVanLeerjaar(keuze.leerjaar) : undefined;
  const totaal = index.leerplan.reduce((som, l) => som + l.aantal, 0);
  return (
    <div className="b-doelpagina b-go-pagina b-go-overzicht">
      <h1>{KOP}</h1>
      <p className="b-lead">
        Het GO! heeft een eigen leerplan voor het basisonderwijs. De meeste leerplandoelen van het GO! horen bij een of meer minimumdoelen van de
        overheid, een aantal heeft er geen. De lesplannen van het GO! zeggen aan welke leerplandoelen ze werken. Hier lees je die drie lagen naast elkaar,
        letterlijk zoals de overheid en het GO! ze schrijven.
      </p>
      <ol className="b-go-lagen" aria-label="De drie lagen">
        <li>
          <strong>Minimumdoel</strong> <span className="b-noot">van de overheid</span>
        </li>
        <li>
          <strong>Leerplandoel</strong> <span className="b-noot">van het GO!, bijvoorbeeld WT.086</span>
        </li>
        <li>
          <strong>Lesplan</strong> <span className="b-noot">van het GO!, bijvoorbeeld LP0001</span>
        </li>
      </ol>
      <Bron index={index} />

      <section className="b-go-deel" aria-labelledby="b-go-vakken-kop">
        <h2 id="b-go-vakken-kop">Leerplandoelen per vak</h2>
        <p className="b-noot">
          {doelenWoord(totaal)} in {index.leerplan.length} vakken.
        </p>
        <ul className="b-kaarten">
          {index.leerplan.map((l) => {
            const Icoon = goVakIcoon(l.vak);
            return (
              <li key={l.vak}>
                <Link to={basisPad({ s: 'leerplandoelen', vak: l.vak })} className="b-vakkaart">
                  <span className="b-vaktegel" style={{ ['--h' as string]: goVakTint(l.vak) }} aria-hidden="true">
                    <Icoon size={24} />
                  </span>
                  <span className="b-vakkaart-tekst">
                    <span className="b-vakkaart-naam">{GO_VAKKEN[l.vak].naam}</span>
                    <span className="b-vakkaart-sub">
                      {eigenLeeftijd !== undefined
                        ? `${(l.perLeeftijd[eigenLeeftijd] ?? 0) > 0 ? doelenWoord(l.perLeeftijd[eigenLeeftijd] ?? 0) : 'geen leerplandoelen'} voor ${leeftijdLabel(eigenLeeftijd)} · ${l.aantal} in totaal`
                        : `${doelenWoord(l.aantal)}${l.zonderMinimumdoel > 0 ? ` · ${l.zonderMinimumdoel} zonder minimumdoel` : ''}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {keuze && (
          <p className="b-noot">
            Je leerjaar staat bewaard: in elk vak staat dan de leeftijd van dat leerjaar aan. Kies in het vak <em>Alle leeftijden</em> om alles te zien.
          </p>
        )}
      </section>

      {groepen.length > 0 && (
        <section className="b-go-deel" aria-labelledby="b-go-lesplannen-kop">
          <h2 id="b-go-lesplannen-kop">Lesplannen per leeftijd</h2>
          {groepen.map(({ leeftijd, aantal }) => (
            <div key={leeftijd} className="b-go-groep" role="group" aria-labelledby={`b-go-lp-${leeftijd}`}>
              <h3 id={`b-go-lp-${leeftijd}`}>
                {leeftijdLabel(leeftijd)} <span className="b-go-leeftijden">({aantal} {aantal === 1 ? 'lesplan' : 'lesplannen'})</span>
              </h3>
              <p className="b-noot">
                {meestalTekst(leeftijd)} <ZekerheidBadge zekerheid={GO_LEESBRIL_ZEKERHEID} />
              </p>
              <ul className="b-go-lesplannen">
                {lesplannenPerLeeftijd(index, leeftijd).map((l) => (
                  <li key={l.code}>
                    <Link to={basisPad({ s: 'lesplan', code: l.code })} className="b-go-lesplanlink">
                      Lesplan {l.code} {l.titel}
                    </Link>{' '}
                    <span className="b-go-leeftijden">({GO_VAKKEN[l.vak].naam})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <LeeftijdUitleg />
        </section>
      )}
    </div>
  );
}

export function GoScherm() {
  const index = useGoIndex();
  if (index.stand.status === 'laden') {
    return (
      <div className="b-doelpagina">
        <h1>{KOP}</h1>
        <LaadBericht tekst="Het leerplan van het GO! wordt geladen" />
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
  return <GoInhoud index={index.stand.waarde} />;
}
