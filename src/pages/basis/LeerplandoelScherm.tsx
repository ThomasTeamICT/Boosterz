// #/basis/leerplandoel/WT.086: één leerplandoel van het GO!, met wat eronder hoort (docs/basisonderwijs/GO-LEERPLAN.md,
// "2. Leerplandoelpagina"): het rubriekpad, de tekst, de leeftijden, de inhoud (MIA, begrippen, voorbeelden, voetnoten),
// de koppeling aan de minimumdoelen met hun tekst uit de officiële gegevens, de vlaggen en schakels, de lesplannen met
// dit doel (met de ik-doelen per diploma) en de bron.
//
// Alle tekst van het GO! is letterlijk. De tekst van een minimumdoel komt uit de API (KoppelingLijst), nooit uit de Excel.
// Dit scherm laadt lui (BasisDeel). Een deel zonder inhoud rendert niets, ook zijn kop niet. Laadt de index niet, dan staat
// het deel 'Lesplannen met dit doel' er wel, met de melding en 'Opnieuw proberen': stil weglaten zou zeggen dat er geen
// lesplan bij het doel hoort.

import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GoBronvermelding } from '../../components/basis/go/GoBronvermelding';
import { IkZinnen } from '../../components/basis/go/IkZinnen';
import { KoppelingLijst, koppelingenVan, useMinimumdoelTeksten, type DoelPadFn, type MinimumdoelTeksten } from '../../components/basis/go/KoppelingLijst';
import { useDoelPad } from '../../components/basis/go/useDoelPad';
import { GoTekstWeergave, MiaBlok } from '../../components/basis/go/MiaBlok';
import { foutVan, useGoIndex, useGoLeerplan, type GoLaadFout } from '../../components/basis/useGo';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { ZekerheidBadge } from '../../components/basis/ZekerheidBadge';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { laadGoLesplan } from '../../lib/basis/go/goBron';
import { ikDoelenVanDoel, lesplannenMetDoel, maakDoelLink, rubriekPadVanDoel, vakVanDoelcode, type IkDoelenVanLesplan } from '../../lib/basis/go/goModel';
import {
  GO_LEESBRIL,
  GO_LEESBRIL_UITLEG,
  GO_LEESBRIL_ZEKERHEID,
  leerjaarVanLeeftijd,
  leerjaarVoorDoel,
  leeftijdLabel,
  meestalTekst,
} from '../../lib/basis/go/leeftijden';
import { GO_VAKKEN, type GoIndex, type GoLeerplandoel, type GoLeerplanBestand, type GoLesplanBestand, type GoVak, type GoVerwijzingen } from '../../lib/basis/go/types';
import { gewoon } from '../../lib/basis/go/vorm';
import type { LeerjaarBasis } from '../../lib/basis/kalender';
import { useLaadstand, type Laadstand } from '../../lib/useLaadstand';
import '../../styles/basis-go.css';

/** Wat de pagina weet over de lesplannen met dit doel: de bestanden zelf, voor de ik-doelen. */
export type LesplannenBijDoel =
  | { status: 'laden' }
  | { status: 'fout'; fout: string; opnieuw: () => void }
  | { status: 'klaar'; lesplannen: readonly GoLesplanBestand[] };

// ── Onderdelen ──────────────────────────────────────────────────────────────

/** `bewaard`: het leerjaar dat de leerkracht koos; de kruimel blijft daar als het bij de leeftijden van het doel past. */
function Kruimel({ vak, leerplan, doel, bewaard }: { vak: GoVak; leerplan: GoLeerplanBestand; doel: GoLeerplandoel; bewaard?: LeerjaarBasis }) {
  const leerjaar = leerjaarVoorDoel(doel.leeftijden, bewaard);
  const pad = rubriekPadVanDoel(leerplan, doel);
  return (
    <nav className="b-kruimel" aria-label="Kruimelpad">
      <ol>
        <li>
          <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
        </li>
        <li>
          <Link to={basisPad({ s: 'leerplandoelen', vak, leerjaar })}>{GO_VAKKEN[vak].naam}</Link>
        </li>
        {pad.map((r) => (
          <li key={r.id}>
            <Link to={basisPad({ s: 'leerplandoelen', vak, alle: true, rubriek: r.id })} className="b-go-kruimel-rubriek">
              <GoTekstWeergave tekst={r} />
            </Link>
          </li>
        ))}
        <li>
          <span aria-current="page">{doel.code}</span>
        </li>
      </ol>
    </nav>
  );
}

function Leeftijden({ doel, vak }: { doel: GoLeerplandoel; vak: GoVak }) {
  return (
    <section className="b-go-leeftijdblok" aria-label="Voor welke leeftijd">
      <p className="b-go-leeftijdregel">
        <span className="b-go-leeftijdkop">Leeftijd: </span>
        {doel.leeftijden.map((l) => (
          <Link key={l} to={basisPad({ s: 'leerplandoelen', vak, leerjaar: leerjaarVanLeeftijd(l) })} className="b-go-pil">
            {leeftijdLabel(l)}
            <span className="sr-only"> (alle doelen van dit vak voor deze leeftijd)</span>
          </Link>
        ))}
      </p>
      <details className="b-go-uitleg">
        <summary>Welk leerjaar is dat meestal?</summary>
        <ul>
          {GO_LEESBRIL.filter((r) => doel.leeftijden.includes(r.leeftijd)).map((r) => (
            <li key={r.leeftijd}>
              {leeftijdLabel(r.leeftijd)}: {meestalTekst(r.leeftijd)}
            </li>
          ))}
        </ul>
        <p className="b-noot">
          <ZekerheidBadge zekerheid={GO_LEESBRIL_ZEKERHEID} /> {GO_LEESBRIL_UITLEG}
        </p>
      </details>
    </section>
  );
}

function Verwijzingen({ titel, v, id, doelLink }: { titel: string; v: GoVerwijzingen; id: string; doelLink?: (code: string) => string | undefined }) {
  if (v.codes.length === 0 && v.kapot.length === 0) return null;
  return (
    <div className="b-go-verwijzing">
      <h3 id={id}>{titel}</h3>
      <ul className="b-go-chips" aria-labelledby={id}>
        {v.codes.map((c) => {
          const naar = doelLink?.(c);
          return (
            <li key={c}>
              {naar ? (
                <Link to={naar} className="b-go-chip">
                  {c}
                  <span className="sr-only"> (leerplandoel)</span>
                </Link>
              ) : (
                <span className="b-go-chip b-go-chip-plat">{c}</span>
              )}
            </li>
          );
        })}
        {v.kapot.map((c) => (
          <li key={`kapot-${c}`}>
            <span className="b-go-chip b-go-chip-plat">
              “{c}”<span className="sr-only"> (in het leerplan staat dit zo, het is geen geldige code)</span>
            </span>
          </li>
        ))}
      </ul>
      {v.kapot.length > 0 && <p className="b-noot">Wat tussen aanhalingstekens staat, staat zo in het leerplan en is geen geldige code van een leerplandoel.</p>}
    </div>
  );
}

function VlaggenEnSchakels({ doel, doelLink }: { doel: GoLeerplandoel; doelLink?: (code: string) => string | undefined }) {
  const vlaggen = doel.vlaggen.codes.length + doel.vlaggen.kapot.length;
  const schakels = doel.schakels.codes.length + doel.schakels.kapot.length;
  if (vlaggen + schakels === 0) return null;
  return (
    <section className="b-go-deel" aria-labelledby="b-go-vs-kop">
      <h2 id="b-go-vs-kop">Vlaggen en schakels</h2>
      <p className="b-noot">Hier verwijst het leerplan naar andere leerplandoelen. In de lesplannen staan vlaggen en schakels onder ‘Horizontale samenhang’.</p>
      <Verwijzingen titel="Vlaggen" v={doel.vlaggen} id="b-go-vlaggen-kop" doelLink={doelLink} />
      <Verwijzingen titel="Schakels" v={doel.schakels} id="b-go-schakels-kop" doelLink={doelLink} />
    </section>
  );
}

/**
 * De tekst van dit doel zoals het lesplan hem schrijft, als dat anders is dan in het leerplan: letterlijk, met de reden.
 * Witruimte telt niet als verschil (WT.039 eindigt in de Excel op een spatie, in LP0074 niet).
 */
export function tekstInLesplan(lesplan: GoLesplanBestand, doel: GoLeerplandoel): string | undefined {
  const d = lesplan.afgeleid.leerplandoelen.find((x) => x.code === doel.code);
  return d && gewoon(d.tekst) !== gewoon(doel.tekst) ? d.tekst : undefined;
}

function IkDoelen({ rijen }: { rijen: readonly IkDoelenVanLesplan[] }) {
  if (rijen.length === 0) return null;
  return (
    <ul className="b-go-ik">
      {rijen.map((r) => (
        <li key={`${r.diploma}-${r.diplomaLeeftijd}`}>
          Diploma <strong>{r.diploma}</strong> <span className="b-go-leeftijden">({leeftijdLabel(r.diplomaLeeftijd)})</span>:
          <IkZinnen zinnen={r.zinnen} className="b-go-ikzinnen" />
        </li>
      ))}
    </ul>
  );
}

/** `indexFout`: de index laadde niet, dus welke lesplannen bij het doel horen, weten we niet; dat staat er dan. */
function Lesplannen({ doel, index, lesplannen, indexFout }: { doel: GoLeerplandoel; index?: GoIndex; lesplannen: LesplannenBijDoel; indexFout?: GoLaadFout }) {
  if (indexFout) {
    return (
      <section className="b-go-deel" aria-labelledby="b-go-lp-kop">
        <h2 id="b-go-lp-kop">Lesplannen met dit doel</h2>
        <FoutBericht fout={indexFout.fout} onOpnieuw={indexFout.opnieuw} naam="lesplannen met dit doel" />
      </section>
    );
  }
  const lijst = index ? lesplannenMetDoel(index, doel.code) : [];
  if (lijst.length === 0) return null;
  const bestanden = lesplannen.status === 'klaar' ? lesplannen.lesplannen : [];
  return (
    <section className="b-go-deel" aria-labelledby="b-go-lp-kop">
      <h2 id="b-go-lp-kop">Lesplannen met dit doel</h2>
      {lesplannen.status === 'laden' && <LaadBericht tekst="De ik-doelen worden geladen" melden={false} />}
      {lesplannen.status === 'fout' && <FoutBericht fout={lesplannen.fout} onOpnieuw={lesplannen.opnieuw} />}
      <ul className="b-go-lesplannen">
        {lijst.map((l) => {
          const bestand = bestanden.find((b) => b.code === l.code);
          const anders = bestand ? tekstInLesplan(bestand, doel) : undefined;
          return (
            <li key={l.code}>
              <p>
                <Link to={basisPad({ s: 'lesplan', code: l.code })} className="b-go-lesplanlink">
                  Lesplan {l.code} {l.titel}
                </Link>{' '}
                <span className="b-go-leeftijden">({leeftijdLabel(l.leeftijd)})</span>
              </p>
              {anders !== undefined && (
                <p className="b-noot">
                  In lesplan {l.code} staat: “{anders}”
                </p>
              )}
              {bestand && <IkDoelen rijen={ikDoelenVanDoel([bestand], doel.code)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── De pagina ───────────────────────────────────────────────────────────────

export interface LeerplandoelInhoudProps {
  doel: GoLeerplandoel;
  leerplan: GoLeerplanBestand;
  index?: GoIndex;
  minimumdoelen: MinimumdoelTeksten;
  lesplannen: LesplannenBijDoel;
  /** De index laadde niet: het deel 'Lesplannen met dit doel' zegt dat, met 'Opnieuw proberen'. */
  indexFout?: GoLaadFout;
  /** Het bewaarde leerjaar van de leerkracht, voor de kruimel en de voetlink. */
  bewaard?: LeerjaarBasis;
  /** Het adres van een minimumdoel (useDoelPad); standaard de gewone set. */
  doelPad?: DoelPadFn;
}

/** De pagina voor een geladen leerplandoel, zonder zelf iets te laden. */
export function LeerplandoelInhoud({ doel, leerplan, index, minimumdoelen, lesplannen, indexFout, bewaard, doelPad }: LeerplandoelInhoudProps): ReactNode {
  const vak = leerplan.vak;
  const doelLink = useMemo(() => maakDoelLink(index), [index]);
  const heeftInhoud = doel.inhoud.length > 0;
  return (
    <div className="b-doelpagina b-go-pagina">
      <Kruimel vak={vak} leerplan={leerplan} doel={doel} bewaard={bewaard} />
      <div className="b-doelkaart-groot">
        <h1>Leerplandoel {doel.code}</h1>
        <p className="b-onderregel">{GO_VAKKEN[vak].naam} · leerplan van het GO!</p>
        <p className="b-doeltekst-groot b-go-tekst">
          <GoTekstWeergave tekst={doel} />
        </p>
        <p className="b-badges">
          <span className="b-go-leeftijdkop">Kennisverwerking: </span>
          <span className="badge badge-brand">{doel.kennisverwerking}</span>
        </p>
        <Leeftijden doel={doel} vak={vak} />
      </div>

      {heeftInhoud && (
        <section className="b-go-deel" aria-labelledby="b-go-inhoud-kop">
          <h2 id="b-go-inhoud-kop">Inhoud</h2>
          <MiaBlok inhoud={doel.inhoud} />
        </section>
      )}

      <KoppelingLijst doel={doel} teksten={minimumdoelen} doelPad={doelPad} />
      <VlaggenEnSchakels doel={doel} doelLink={doelLink} />
      <Lesplannen doel={doel} index={index} lesplannen={lesplannen} indexFout={indexFout} />

      <GoBronvermelding soort="leerplan" vak={vak} ingelezen={leerplan.bron.ingelezen} />
      <p className="b-go-voet">
        <Link to={basisPad({ s: 'leerplandoelen', vak, leerjaar: leerjaarVoorDoel(doel.leeftijden, bewaard) })}>Alle leerplandoelen van {GO_VAKKEN[vak].doelenset}</Link>
        <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
      </p>
    </div>
  );
}

function NietGevonden({ code, vak }: { code: string; vak?: GoVak }) {
  return (
    <section className="b-plaats">
      <h1>Dit leerplandoel vonden we niet</h1>
      <p>Leerplandoel {code} staat niet in het leerplan van het GO!. Misschien klopt de code niet.</p>
      <ul className="b-plaats-links">
        {vak && (
          <li>
            <Link to={basisPad({ s: 'leerplandoelen', vak, alle: true })}>Alle leerplandoelen van {GO_VAKKEN[vak].doelenset}</Link>
          </li>
        )}
        <li>
          <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
        </li>
      </ul>
    </section>
  );
}

/** Laadt de lesplannen met dit doel (klein: een handvol bestanden), voor de ik-doelen. */
function useLesplannenBijDoel(codes: readonly string[]): LesplannenBijDoel {
  const { stand, opnieuw }: { stand: Laadstand<GoLesplanBestand[]>; opnieuw: () => void } = useLaadstand(`go-lesplannen-bij-doel-${codes.join(',')}`, () =>
    Promise.all(codes.map((c) => laadGoLesplan(c))),
  );
  if (stand.status === 'klaar') return { status: 'klaar', lesplannen: stand.waarde };
  if (stand.status === 'fout') return { status: 'fout', fout: stand.fout, opnieuw };
  return { status: 'laden' };
}

function LeerplandoelPagina({ code, vak }: { code: string; vak: GoVak }) {
  const leerplan = useGoLeerplan(vak);
  const indexHook = useGoIndex();
  const index = indexHook.stand;
  const indexWaarde = index.status === 'klaar' ? index.waarde : undefined;
  const indexFout = foutVan(indexHook);
  const doel = leerplan.stand.status === 'klaar' ? leerplan.stand.waarde.doelen.find((d) => d.code === code) : undefined;
  const refs = useMemo(() => (doel ? koppelingenVan(doel).flatMap((k) => k.refs) : []), [doel]);
  const minimumdoelen = useMinimumdoelTeksten(refs);
  const doelPad = useDoelPad();
  const { keuze } = useBasisKeuze();
  const lesplanCodes = useMemo(() => (indexWaarde ? lesplannenMetDoel(indexWaarde, code).map((l) => l.code) : []), [indexWaarde, code]);
  const lesplannen = useLesplannenBijDoel(lesplanCodes);

  if (leerplan.stand.status === 'laden') {
    return (
      <div className="b-doelpagina">
        <h1>Leerplandoel {code}</h1>
        <LaadBericht tekst="Het leerplandoel wordt geladen" />
      </div>
    );
  }
  if (leerplan.stand.status === 'fout') {
    return (
      <div className="b-doelpagina">
        <h1>Leerplandoel {code}</h1>
        <FoutBericht fout={leerplan.stand.fout} onOpnieuw={leerplan.opnieuw} />
      </div>
    );
  }
  if (!doel) return <NietGevonden code={code} vak={vak} />;
  return (
    <LeerplandoelInhoud
      doel={doel}
      leerplan={leerplan.stand.waarde}
      index={indexWaarde}
      minimumdoelen={minimumdoelen}
      lesplannen={lesplannen}
      indexFout={indexFout}
      bewaard={keuze?.leerjaar}
      doelPad={doelPad}
    />
  );
}

export function LeerplandoelScherm({ code }: { code: string }) {
  const vak = vakVanDoelcode(code);
  if (!vak) return <NietGevonden code={code} />;
  return <LeerplandoelPagina code={code} vak={vak} />;
}
