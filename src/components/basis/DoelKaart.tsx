// Eén doel als kaart (een li) op de pagina van een vak: de code, de volledige tekst (doelzin, uitbreiding en
// woordenschat, allemaal open), het soort doel als het vak er meer dan één heeft en een link 'Open doel 3.5.4' van
// 44 px. Niets wordt ingekort. VolledigeDoeltekst wordt ook door de doelpagina gebruikt.

import { Link } from 'react-router-dom';
import { doelPad } from '../../lib/basis/basisRoutes';
import type { DoelBasis } from '../../lib/basis/doelBasis';
import { SOORT_DOELEN_LABEL } from '../../lib/basis/momentTeksten';
import { DoeltekstWeergave } from './DoeltekstWeergave';

/** De hele tekst van een doel, in de volgorde van de bron: doelzin, uitbreiding, richtinggevende woordenschat. */
export function VolledigeDoeltekst({ doel, className }: { doel: DoelBasis; className?: string }) {
  return (
    <>
      <DoeltekstWeergave html={doel.doelzinHtml} className={className} />
      {doel.uitbreidingHtml && <DoeltekstWeergave html={doel.uitbreidingHtml} className={className ? `${className} b-uitbreiding` : 'b-uitbreiding'} />}
      {doel.woordenschatHtml && (
        <div className="b-woordenschat">
          <p className="b-woordenschat-kop">Richtinggevende woordenschat</p>
          <DoeltekstWeergave html={doel.woordenschatHtml} />
        </div>
      )}
    </>
  );
}

export function DoelKaart({ doel, toonSoort = false }: { doel: DoelBasis; toonSoort?: boolean }) {
  return (
    <li className="b-doelkaart" id={`b-doel-${doel.id}`}>
      <p className="b-doelkaart-code">
        <span className="b-doelrij-code">{doel.code}</span>
        {toonSoort && doel.soortDoel && <span className="badge badge-brand">{SOORT_DOELEN_LABEL[doel.soortDoel]}</span>}
      </p>
      <VolledigeDoeltekst doel={doel} />
      <p className="b-doelkaart-open">
        <Link to={doelPad({ set: doel.setId, id: doel.id })} className="b-lees-meer">
          Open doel {doel.code}
        </Link>
      </p>
    </li>
  );
}
