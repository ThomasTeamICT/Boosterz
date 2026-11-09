// Het deel 'Leerplan van het GO!' op de pagina van een minimumdoel (docs/basisonderwijs/GO-LEERPLAN.md, "4. Bij het doel"):
// de leerplandoelen van het GO! die het leerplan aan dit minimumdoel koppelt, per vakdiscipline, met bij elk doel zijn
// lesplannen. De koppeling komt uit het leerplan van het GO!; de tekst van het minimumdoel zelf staat hierboven op de
// pagina en komt uit de officiële gegevens.
//
// Dit bestand wordt lui geladen (DoelScherm): wie de gegevens van het GO! niet nodig heeft, laadt ze niet. Is er niets,
// dan staat er niets: geen lege kop (H5). Meer dan 6 doelen in een groep: de rest staat in een details-blok. Een link naar
// een leerplandoelpagina staat er alleen als het leerplan van dat vak bestaat. Ook bij het buitengewoon basisonderwijs
// (zelfde nummer, dus dezelfde doelen) en bij een voorstel (gemarkeerd 'voorstel, nog niet bevestigd door het GO!').

import { Link } from 'react-router-dom';
import { basisPad } from '../../../lib/basis/basisRoutes';
import type { DoelBasis } from '../../../lib/basis/doelBasis';
import { groepeerBijDoelen, leerplandoelenBijMinimumdoel, vakVanDoelcode, type BijDoelGroep, type GoIndexLesplan } from '../../../lib/basis/go/goModel';
import { isGeldigMinimumdoelVak } from '../../../lib/basis/go/goBron';
import { leeftijdenLabel, leeftijdLabel } from '../../../lib/basis/go/leeftijden';
import {
  GO_NAAMSVERMELDING,
  GO_VAKKEN,
  GO_VOORSTEL_LABEL,
  type GoBijDoel,
  type GoIndex,
  type GoMinimumdoelRef,
} from '../../../lib/basis/go/types';
import { INVOERINGSKALENDER } from '../../../lib/basis/kalender';
import { FoutBericht } from '../../curriculum/LaadStatus';
import { useGoBijMinimumdoel, useGoIndex } from '../useGo';
import { momentKort, twijfelZin } from './KoppelingLijst';
import { GoTekstWeergave } from './MiaBlok';
import '../../../styles/basis-go.css';

export const GO_BIJ_DOEL_KOP = 'Leerplan van het GO!';
/** Zo veel doelen van een vakdiscipline staan direct zichtbaar; de rest zit in 'Toon alle'. */
export const EERST_GETOOND = 6;

type MinimumDoel = Pick<DoelBasis, 'setId' | 'id' | 'code' | 'vak'>;

const doelenWoord = (n: number) => `${n} ${n === 1 ? 'leerplandoel' : 'leerplandoelen'}`;
/** 'MIA “Aftrekken:”' of 'voorbeeld “…”': het onderdeel van een leerplandoel dat naar dit minimumdoel verwijst. */
const onderdeelNaam = (v: { soort: string; tekst: string }) => `${v.soort === 'mia-titel' || v.soort === 'mia' ? 'MIA' : 'voorbeeld'} “${v.tekst.trim()}”`;

function Lesplannen({ codes, index }: { codes: readonly string[]; index?: GoIndex }) {
  if (codes.length === 0) return null;
  const perCode = new Map<string, GoIndexLesplan>((index?.lesplannen ?? []).map((l) => [l.code, l]));
  return (
    <p className="b-go-koppeling">
      <span className="b-go-koppeling-kop">{codes.length === 1 ? 'Lesplan: ' : `Lesplannen (${codes.length}): `}</span>
      {codes.map((c, n) => {
        const l = perCode.get(c);
        return (
          <span key={c}>
            {n > 0 && ', '}
            <Link to={basisPad({ s: 'lesplan', code: c })} className="b-go-lesplanlink">
              {l ? `${c} ${l.titel}` : c}
              <span className="sr-only"> (lesplan)</span>
            </Link>
            {l && <span className="b-go-leeftijden"> ({leeftijdLabel(l.leeftijd)})</span>}
          </span>
        );
      })}
    </p>
  );
}

function Doel({ d, minimum, index }: { d: GoBijDoel; minimum: MinimumDoel; index?: GoIndex }) {
  const vak = vakVanDoelcode(d.code);
  // Een link naar de leerplandoelpagina alleen als het leerplan van het vak er is (zolang de index laadt of ontbreekt, wel).
  const heeftLeerplan = vak !== undefined && (index === undefined || index.leerplan.some((l) => l.vak === vak));
  const ref: GoMinimumdoelRef = { set: minimum.setId, id: minimum.id, code: minimum.code, moment: d.moment, status: d.status };
  const naamVak = INVOERINGSKALENDER.vakken.find((v) => v.nr === minimum.vak)?.naam;
  const twijfels = d.twijfel ?? [];
  return (
    <li className="b-go-doel" id={`b-go-bij-${d.code}`}>
      <p className="b-go-doelkop">
        {heeftLeerplan ? (
          <Link to={basisPad({ s: 'leerplandoel', code: d.code })} className="b-go-doelcode">
            {d.code}
            <span className="sr-only"> (open dit leerplandoel)</span>
          </Link>
        ) : (
          <span className="b-go-doelcode">{d.code}</span>
        )}
        <span className="b-go-kv">
          <span className="sr-only">Kennisverwerking: </span>
          {d.kennisverwerking}
        </span>
        {d.status === 'voorstel' && <span className="badge badge-warn">{GO_VOORSTEL_LABEL}</span>}
      </p>
      <p className="b-go-tekst b-go-doeltekst">
        <GoTekstWeergave tekst={d} />
      </p>
      <p className="b-go-leeftijden">
        ({leeftijdenLabel(d.leeftijden)}) · gekoppeld aan {momentKort(d.moment).toLowerCase()}
      </p>
      {d.status === 'voorstel' && (
        <p className="b-go-voorstel">
          In het leerplan staat “{d.bronCode}”. Waarschijnlijk is {minimum.code} bedoeld.
        </p>
      )}
      {d.via && d.via.length > 0 && (
        <p className="b-go-via">
          Het leerplan koppelt een onderdeel van dit doel ({d.via.map(onderdeelNaam).join(', ')}) aan dit minimumdoel.
        </p>
      )}
      {twijfels.length > 0 && (
        <details className="b-go-uitleg">
          <summary>Hoe zeker is dit?</summary>
          <ul>
            {twijfels.map((t) => (
              <li key={t}>{twijfelZin(t, ref, d, naamVak)}</li>
            ))}
          </ul>
        </details>
      )}
      <Lesplannen codes={d.lesplannen} index={index} />
    </li>
  );
}

function Groep({ groep, minimum, index }: { groep: BijDoelGroep; minimum: MinimumDoel; index?: GoIndex }) {
  const eerst = groep.doelen.slice(0, EERST_GETOOND);
  const rest = groep.doelen.slice(EERST_GETOOND);
  const kopId = `b-go-bij-${groep.vak}`;
  return (
    <div className="b-go-groep" role="group" aria-labelledby={kopId}>
      <h3 id={kopId}>
        {GO_VAKKEN[groep.vak].naam} <span className="b-go-leeftijden">({doelenWoord(groep.doelen.length)})</span>
      </h3>
      <ul className="b-go-doelen">
        {eerst.map((d) => (
          <Doel key={d.code} d={d} minimum={minimum} index={index} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="b-go-meer">
          <summary>Toon alle {groep.doelen.length}</summary>
          <ul className="b-go-doelen">
            {rest.map((d) => (
              <Doel key={d.code} d={d} minimum={minimum} index={index} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Het deel voor de leerplandoelen bij dit minimumdoel, zonder zelf iets te laden. Zonder leerplandoelen: null.
 * `doelen` zijn alle leerplandoelen bij dit minimumdoel (uit bij-minimumdoel/<vak>.json).
 */
export function GoBijDoelInhoud({ doelen, doel, index }: { doelen: readonly GoBijDoel[]; doel: MinimumDoel; index?: GoIndex }) {
  const groepen = groepeerBijDoelen(doelen);
  if (groepen.length === 0) return null;
  const aantal = groepen.reduce((som, g) => som + g.doelen.length, 0);
  return (
    <section className="b-doeldeel b-go-bijdoel" aria-labelledby="b-go-bij-kop">
      <h2 id="b-go-bij-kop">{GO_BIJ_DOEL_KOP}</h2>
      <p className="b-noot">
        Het leerplan van het GO! koppelt deze leerplandoelen aan dit minimumdoel ({doelenWoord(aantal)} in {groepen.length}{' '}
        {groepen.length === 1 ? 'vakdiscipline' : 'vakdisciplines'}). De tekst staat er letterlijk, zoals het GO! ze schrijft.
      </p>
      {groepen.map((g) => (
        <Groep key={g.vak} groep={g} minimum={doel} index={index} />
      ))}
      <p>
        <Link to={basisPad({ s: 'go' })} className="b-lees-meer">
          Leerplan en lesplannen van het GO!
        </Link>
      </p>
      <p className="b-noot">
        Bron: {GO_NAAMSVERMELDING}, het nieuwe GO! leerplan basisonderwijs. Letterlijk overgenomen met toestemming.
      </p>
    </section>
  );
}

function Geladen({ doel }: { doel: MinimumDoel }) {
  const bij = useGoBijMinimumdoel(doel.vak);
  const index = useGoIndex().stand;
  // Zolang er niets te zeggen valt, staat er niets: ook geen kop met een laadregel.
  if (bij.stand.status === 'laden' || index.status === 'laden') return null;
  if (bij.stand.status === 'fout') {
    return (
      <section className="b-doeldeel b-go-bijdoel" aria-labelledby="b-go-bij-kop">
        <h2 id="b-go-bij-kop">{GO_BIJ_DOEL_KOP}</h2>
        <FoutBericht fout={bij.stand.fout} onOpnieuw={bij.opnieuw} />
      </section>
    );
  }
  const doelen = leerplandoelenBijMinimumdoel(bij.stand.waarde, doel.id);
  return <GoBijDoelInhoud doelen={doelen} doel={doel} index={index.status === 'klaar' ? index.waarde : undefined} />;
}

/** Het lui geladen deel op de doelpagina: laadt de omgekeerde index van het vak van dit minimumdoel. */
export default function GoBijDoelDeel({ doel }: { doel: MinimumDoel }) {
  // Een vak buiten 1 tot 10 heeft geen bestand: dan is er niets te laden.
  if (!isGeldigMinimumdoelVak(doel.vak)) return null;
  return <Geladen doel={doel} />;
}
