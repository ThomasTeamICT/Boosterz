// De links 'Leerplan van het GO!: wetenschap en techniek' onderaan de pagina van een vak of een leerlijn. Zuiver en zonder
// laden: de koppeling van vak naar GO!-vak is een vaste tabel (GO_VAKKEN_BIJ_VAK), zodat dit in de lichte bundel van de
// doelen past.

import { Link } from 'react-router-dom';
import { basisPad } from '../../../lib/basis/basisRoutes';
import { GO_VAKKEN, GO_VAKKEN_BIJ_VAK } from '../../../lib/basis/go/types';
import type { LeerjaarBasis } from '../../../lib/basis/kalender';

const TALEN = new Set(['Nederlands', 'Frans', 'ICT']);
const kleineLetter = (t: string) => (TALEN.has(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

export function GoVakLinks({ vak, leerjaar }: { vak: number; leerjaar?: LeerjaarBasis }) {
  return (
    <>
      {(GO_VAKKEN_BIJ_VAK[vak] ?? []).map((g) => (
        <Link key={g} to={basisPad({ s: 'leerplandoelen', vak: g, leerjaar })} className="b-lees-meer">
          Leerplan van het GO!: {kleineLetter(GO_VAKKEN[g].naam)}
        </Link>
      ))}
    </>
  );
}
