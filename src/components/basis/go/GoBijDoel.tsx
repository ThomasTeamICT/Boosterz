// Het deel 'Leerplan van het GO!' op de pagina van een minimumdoel (docs/basisonderwijs/GO-LEERPLAN.md, "4. Bij het doel"):
// de leerplandoelen van het GO! die het leerplan aan dit minimumdoel koppelt, per vakdiscipline, met bij elk doel zijn
// lesplannen. De koppeling komt uit het leerplan van het GO!; de tekst van het minimumdoel zelf staat hierboven op de
// pagina en komt uit de officiële gegevens.
//
// Dit bestand wordt lui geladen (DoelScherm): wie de gegevens van het GO! niet nodig heeft, laadt ze niet. Is er niets,
// dan staat er niets: geen lege kop (H5). Meer dan 6 doelen in een groep: de rest staat in een details-blok. Een link naar
// een leerplandoelpagina staat er alleen als het leerplan van dat vak bestaat. Ook bij het buitengewoon basisonderwijs
// (zelfde nummer, dus dezelfde doelen) en bij een voorstel (gemarkeerd 'voorstel, nog niet bevestigd door het GO!'). Bij
// een voorstel van vorm B (types.ts) staat het leerplandoel twee keer: als voorstel bij het voorgestelde doel (WI.706 bij
// 2.4.3, 'in het leerplan staat 4.2.3') en officieel, met zijn twijfel, bij het doel uit de bron, met de vermelding van
// het voorstel (WI.706 bij 4.2.3).

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AFDRUK_ATTRIBUUT } from '../../../lib/basis/afdruk';
import { basisPad } from '../../../lib/basis/basisRoutes';
import type { DoelBasis } from '../../../lib/basis/doelBasis';
import { groepeerBijDoelen, leerplandoelenBijMinimumdoel, vakVanDoelcode, type BijDoelGroep, type GoIndexLesplan } from '../../../lib/basis/go/goModel';
import { isGeldigMinimumdoelVak } from '../../../lib/basis/go/goBron';
import { leeftijdenLabel, leeftijdLabel } from '../../../lib/basis/go/leeftijden';
import {
  GO_NAAMSVERMELDING,
  GO_VAKKEN,
  KENNISVERWERKING_ZIN,
  GO_VOORSTEL_LABEL,
  type GoBijDoel,
  type GoIndex,
  type GoMinimumdoelRef,
} from '../../../lib/basis/go/types';
import { INVOERINGSKALENDER } from '../../../lib/basis/kalender';
import { FoutBericht } from '../../curriculum/LaadStatus';
import { useGoBijMinimumdoel, useGoIndex } from '../useGo';
import { VoorstelAnderVakZin, twijfelZin, type DoelPadFn } from './KoppelingLijst';
import { useDoelPad } from './useDoelPad';
import { GoTekstWeergave } from './MiaBlok';
import '../../../styles/basis-go.css';

export const GO_BIJ_DOEL_KOP = 'Leerplan van het GO!';
/** Zo veel doelen van een vakdiscipline staan direct zichtbaar; de rest zit in 'Toon de andere leerplandoelen'. */
export const EERST_GETOOND = 6;

type MinimumDoel = Pick<DoelBasis, 'setId' | 'id' | 'code' | 'vak'>;
/** Zonder keuze voor het buitengewoon onderwijs: de gewone set (zie useDoelPad). */
const GEWOON_DOELPAD: DoelPadFn = (r) => basisPad({ s: 'doel', setId: r.set, doelId: r.id });

const doelenWoord = (n: number) => `${n} ${n === 1 ? 'leerplandoel' : 'leerplandoelen'}`;
/** 'MIA “Aftrekken:”' of 'voorbeeld “…”': het onderdeel van een leerplandoel dat naar dit minimumdoel verwijst. */
const onderdeelNaam = (v: { soort: string; tekst: string }) => `${v.soort === 'mia-titel' || v.soort === 'mia' ? 'MIA' : 'voorbeeld'} “${v.tekst.trim()}”`;

function Lesplannen({ codes, index, kop }: { codes: readonly string[]; index?: GoIndex; kop?: string }) {
  if (codes.length === 0) return null;
  const perCode = new Map<string, GoIndexLesplan>((index?.lesplannen ?? []).map((l) => [l.code, l]));
  return (
    <p className="b-go-koppeling">
      <span className="b-go-koppeling-kop">{kop ?? (codes.length === 1 ? 'Lesplan: ' : `Lesplannen (${codes.length}): `)}</span>
      {codes.map((c, n) => {
        const l = perCode.get(c);
        return (
          <span key={c}>
            <Link to={basisPad({ s: 'lesplan', code: c })} className="b-go-lesplanlink">
              {l ? `${c} ${l.titel}` : c}
              <span className="sr-only"> (lesplan)</span>
            </Link>
            {l && <span className="b-go-leeftijden"> ({leeftijdLabel(l.leeftijd)})</span>}
            {n < codes.length - 1 && ','}
          </span>
        );
      })}
    </p>
  );
}

function Doel({ d, minimum, index, doelPad }: { d: GoBijDoel; minimum: MinimumDoel; index?: GoIndex; doelPad: DoelPadFn }) {
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
      <p className="b-go-leeftijden">({leeftijdenLabel(d.leeftijden)})</p>
      {d.status === 'voorstel' && (
        <p className="b-go-voorstel">
          In het leerplan staat “{d.bronCode}”. Waarschijnlijk is {minimum.code} bedoeld.
        </p>
      )}
      {d.status === 'officieel' && d.voorstel && (
        <p className="b-go-voorstel">
          <VoorstelAnderVakZin bronCode={minimum.code} code={d.voorstel.code} naar={doelPad(d.voorstel)} />{' '}
          <span className="badge badge-warn">{GO_VOORSTEL_LABEL}</span>
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

/** De groepen waarvan 'Toon de andere' open stond, bewaard in de geschiedenis (alleen in dit item, nooit in de opslag). */
interface MeerState {
  goMeer?: string[];
}

function Groep({ groep, minimum, index, doelPad }: { groep: BijDoelGroep; minimum: MinimumDoel; index?: GoIndex; doelPad: DoelPadFn }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Na 'Terug' staat het blok weer open waar je het liet: de stand zit in het item van de geschiedenis (SB-SB-8).
  const meer = (location.state as MeerState | null)?.goMeer ?? [];
  const open = meer.includes(groep.vak);
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
          <Doel key={d.code} d={d} minimum={minimum} index={index} doelPad={doelPad} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details
          className="b-go-meer"
          open={open}
          onToggle={(e) => {
            // Een details die de afdruk opent (src/lib/basis/afdruk.ts) is geen keuze van de leerkracht.
            if (e.currentTarget.hasAttribute(AFDRUK_ATTRIBUUT)) return;
            const nu = e.currentTarget.open;
            // React zet open bij de eerste render en de browser meldt dat zelf als toggle: dan is er niets te bewaren.
            if (nu === open) return;
            navigate(
              { pathname: location.pathname, search: location.search },
              { replace: true, state: { ...(location.state as object | null), goMeer: nu ? [...meer, groep.vak] : meer.filter((v) => v !== groep.vak) } },
            );
          }}
        >
          <summary>{rest.length === 1 ? 'Toon het andere leerplandoel' : `Toon de ${rest.length} andere leerplandoelen`}</summary>
          <ul className="b-go-doelen">
            {rest.map((d) => (
              <Doel key={d.code} d={d} minimum={minimum} index={index} doelPad={doelPad} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Het deel voor de leerplandoelen bij dit minimumdoel, zonder zelf iets te laden. Zonder leerplandoelen: null.
 * `doelen` zijn alle leerplandoelen bij dit minimumdoel (uit bij-minimumdoel/<vak>.json). `doelPad` geeft het adres van
 * een ander minimumdoel (het voorstel van vorm B); standaard de gewone set.
 */
export function GoBijDoelInhoud({ doelen, doel, index, doelPad = GEWOON_DOELPAD }: { doelen: readonly GoBijDoel[]; doel: MinimumDoel; index?: GoIndex; doelPad?: DoelPadFn }) {
  const groepen = groepeerBijDoelen(doelen);
  if (groepen.length === 0) return null;
  const aantal = groepen.reduce((som, g) => som + g.doelen.length, 0);
  // Lesplannen bij dit minimumdoel staan altijd bovenaan, ook als hun doel achter 'Toon de andere' zit.
  const lesplanCodes = (() => {
    const bij = new Set(doelen.flatMap((d) => d.lesplannen));
    const volgorde = (index?.lesplannen ?? []).map((l) => l.code).filter((c) => bij.has(c));
    return [...volgorde, ...[...bij].filter((c) => !volgorde.includes(c)).sort()];
  })();
  return (
    <section className="b-doeldeel b-go-bijdoel" aria-labelledby="b-go-bij-kop">
      <h2 id="b-go-bij-kop">{GO_BIJ_DOEL_KOP}</h2>
      <p className="b-noot">
        Het leerplan van het GO! koppelt deze leerplandoelen aan dit minimumdoel ({doelenWoord(aantal)} in {groepen.length}{' '}
        {groepen.length === 1 ? 'vak' : 'vakken'}). De tekst staat er letterlijk, zoals het GO! hem schrijft.{' '}
        {KENNISVERWERKING_ZIN}
      </p>
      <Lesplannen codes={lesplanCodes} index={index} kop={`Lesplannen bij dit minimumdoel (${lesplanCodes.length}): `} />
      {groepen.map((g) => (
        <Groep key={g.vak} groep={g} minimum={doel} index={index} doelPad={doelPad} />
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
  const doelPad = useDoelPad();
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
  return <GoBijDoelInhoud doelen={doelen} doel={doel} index={index.status === 'klaar' ? index.waarde : undefined} doelPad={doelPad} />;
}

/** Het lui geladen deel op de doelpagina: laadt de omgekeerde index van het vak van dit minimumdoel. */
export default function GoBijDoelDeel({ doel }: { doel: MinimumDoel }) {
  // Een vak buiten 1 tot 10 heeft geen bestand: dan is er niets te laden.
  if (!isGeldigMinimumdoelVak(doel.vak)) return null;
  return <Geladen doel={doel} />;
}
