// Het blok 'Van het GO!' op de pagina van een leerjaar (docs/basisonderwijs/GO-LEERPLAN.md, "5. Per leerjaar"): hoeveel
// leerplandoelen het GO! voor de leeftijd van dit leerjaar heeft, en, alleen als die er zijn, hoeveel lesplannen. Het blok
// laadt alleen index.json; zonder leerplandoelen voor deze leeftijd staat er niets (geen lege kop, H5).
//
// Het GO! deelt in per leeftijd, niet per leerjaar: de leeftijd staat eerst, het leerjaar volgt als 'meestal …' met de
// badge 'waarschijnlijk'. Dit bestand wordt lui geladen door LeerjaarScherm, zodat de gegevens van het GO! niet in de
// bundel van de leerjaarpagina zitten.

import { Link } from 'react-router-dom';
import { basisPad } from '../../../lib/basis/basisRoutes';
import { lessenlijnen } from '../../../lib/basis/go/goModel';
import { GO_LEESBRIL_ZEKERHEID, leeftijdLabel, leeftijdVanLeerjaar, meestalTekst } from '../../../lib/basis/go/leeftijden';
import { GO_VAKKEN, type GoIndex } from '../../../lib/basis/go/types';
import type { LeerjaarBasis } from '../../../lib/basis/kalender';
import { ZekerheidBadge } from '../ZekerheidBadge';
import { useGoIndex } from '../useGo';
import '../../../styles/basis-go.css';

export const VAN_HET_GO_KOP = 'Van het GO!';

const TALEN = new Set(['Nederlands', 'Frans', 'ICT']);
/** De vaknaam midden in een zin: 'Wetenschap en techniek' wordt 'wetenschap en techniek', 'Nederlands' blijft. */
const kleineLetter = (t: string) => (TALEN.has(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

/** Het blok voor een geladen index, zonder zelf iets te laden. Zonder leerplandoelen voor de leeftijd van dit leerjaar: null. */
export function VanHetGoBlok({ leerjaar, index }: { leerjaar: LeerjaarBasis; index: GoIndex }) {
  const leeftijd = leeftijdVanLeerjaar(leerjaar);
  const perVak = index.leerplan.map((l) => ({ vak: l.vak, aantal: l.perLeeftijd[leeftijd] ?? 0 })).filter((v) => v.aantal > 0);
  const doelen = perVak.reduce((som, v) => som + v.aantal, 0);
  if (doelen === 0) return null;
  // De lesplannen van deze leeftijd, met de vakdisciplines waar ze bij horen (in de volgorde van de vakken).
  const lesplannen = lessenlijnen(index, { leeftijd }).flatMap((l) => l.lesplannen);
  const lesplanVakken = [...new Set(lessenlijnen(index, { leeftijd }).map((l) => l.vak))];
  return (
    <section aria-labelledby="b-vango-kop" className="b-blok b-vango">
      <h2 id="b-vango-kop">{VAN_HET_GO_KOP}</h2>
      <p>
        Leerplandoelen voor {leeftijdLabel(leeftijd)}: {doelen} in {perVak.length} {perVak.length === 1 ? 'vakdiscipline' : 'vakdisciplines'}.{' '}
        <Link to={basisPad({ s: 'go' })} className="b-lees-meer">
          Bekijk het leerplan van het GO!
        </Link>
      </p>
      <ul className="b-go-chips b-vango-vakken" aria-label={`Leerplandoelen voor ${leeftijdLabel(leeftijd)} per vakdiscipline`}>
        {perVak.map((v) => (
          <li key={v.vak}>
            <Link to={basisPad({ s: 'leerplandoelen', vak: v.vak, leerjaar })} className="b-go-chip">
              {GO_VAKKEN[v.vak].naam} ({v.aantal})
            </Link>
          </li>
        ))}
      </ul>
      {lesplannen.length > 0 && (
        <p>
          Lesplannen voor {leeftijdLabel(leeftijd)}: {lesplannen.length} ({lesplanVakken.map((v) => kleineLetter(GO_VAKKEN[v].naam)).join(', ')}).{' '}
          <Link to={basisPad({ s: 'lesplannen', leerjaar })} className="b-lees-meer">
            Bekijk de lesplannen
          </Link>
        </p>
      )}
      <p className="b-noot">
        Het GO! deelt zijn leerplan in per leeftijd. {leeftijdLabel(leeftijd)} is {meestalTekst(leeftijd)} <ZekerheidBadge zekerheid={GO_LEESBRIL_ZEKERHEID} />
      </p>
    </section>
  );
}

/** Het lui geladen blok: laadt de index van het GO! en zegt niets zolang die laadt, ontbreekt of niets te melden heeft. */
export default function VanHetGo({ leerjaar }: { leerjaar: LeerjaarBasis }) {
  const index = useGoIndex().stand;
  if (index.status !== 'klaar') return null;
  return <VanHetGoBlok leerjaar={leerjaar} index={index.waarde} />;
}
