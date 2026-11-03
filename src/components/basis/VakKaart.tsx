// Een kaart voor één vak op een eindmoment: een link naar de doelen van dat vak, met de vaktegel, de naam, het aantal
// doelen en de soort, bij 'mag al' vanaf wanneer het verplicht wordt, en de zekerheid als die niet zeker is. Een
// lampstreep links markeert wat verplicht is.

import { Link } from 'react-router-dom';
import { basisPad } from '../../lib/basis/basisRoutes';
import { schooljaarTekst, type Eindmoment, type KalenderVak, type LeerjaarBasis, type Schooljaar, type SoortBasis, type Zekerheid } from '../../lib/basis/kalender';
import type { SoortDoelen } from '../../lib/basis/moment';
import { ZekerheidBadge } from './ZekerheidBadge';
import { vakIcoon, vakTint } from './vakIconen';

const SOORT_KORT: Readonly<Record<SoortDoelen, string>> = {
  populatie: 'te bereiken (populatie)',
  individueel: 'te bereiken (individueel)',
  nastreven: 'na te streven',
  ontwikkelingsdoelen: 'ontwikkelingsdoelen',
  eindtermen: 'eindtermen',
};

/** '44 doelen · te bereiken (populatie)' of, bij twee soorten, '42 doelen: 7 te bereiken (populatie) · 35 na te streven'. */
export function aantalTekst(aantal: number, perSoort: readonly { soort: SoortDoelen; aantal: number }[]): string {
  const doelen = `${aantal} ${aantal === 1 ? 'doel' : 'doelen'}`;
  if (perSoort.length === 0) return doelen;
  if (perSoort.length === 1) return `${doelen} · ${SOORT_KORT[perSoort[0].soort]}`;
  return `${doelen}: ${perSoort.map((p) => `${p.aantal} ${SOORT_KORT[p.soort]}`).join(' · ')}`;
}

export interface VakKaartProps {
  soort: SoortBasis;
  eind: Eindmoment;
  vak: KalenderVak;
  aantal: number;
  perSoort: readonly { soort: SoortDoelen; aantal: number }[];
  /** Het leerjaar waarvandaan je kwam; de vakpagina toont dan de status voor dat leerjaar. */
  leerjaar?: LeerjaarBasis;
  zekerheid?: Zekerheid;
  /** Alleen bij 'mag al': het eerste schooljaar waarin het vak verplicht wordt. */
  verplichtVanaf?: Schooljaar;
  lampstreep?: boolean;
}

export function VakKaart({ soort, eind, vak, aantal, perSoort, leerjaar, zekerheid, verplichtVanaf, lampstreep = false }: VakKaartProps) {
  const Icoon = vakIcoon(vak.nr);
  return (
    <Link
      to={basisPad({ s: 'vak', soort, eind, vak: vak.nr, leerjaar })}
      className={lampstreep ? 'b-vakkaart b-vakkaart-lamp' : 'b-vakkaart'}
    >
      <span className="b-vaktegel" style={{ ['--h' as string]: vakTint(vak.nr) }} aria-hidden="true">
        <Icoon size={24} />
      </span>
      <span className="b-vakkaart-tekst">
        <span className="b-vakkaart-naam">{vak.naam}</span>
        <span className="b-vakkaart-sub">{aantalTekst(aantal, perSoort)}</span>
        {verplichtVanaf !== undefined && <span className="b-vakkaart-sub">verplicht vanaf {schooljaarTekst(verplichtVanaf)}</span>}
        {zekerheid !== undefined && zekerheid !== 'zeker' && (
          <span className="b-vakkaart-badge">
            <ZekerheidBadge zekerheid={zekerheid} />
          </span>
        )}
      </span>
    </Link>
  );
}
