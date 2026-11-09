// De leeftijdsgroep kiezen bij het leerplan van het GO!: negen pillen met aria-pressed, en 'Alle leeftijden'. Het GO! deelt
// zijn leerplan in per leeftijd, niet per leerjaar; daarom staat overal eerst de leeftijd. Welk leerjaar dat meestal is,
// staat daarna, met de badge 'waarschijnlijk' en onder 'Hoe zeker is dit?' de uitleg (docs/basisonderwijs/GO-LEERPLAN.md,
// "Leeftijden").

import { GO_LEEFTIJDEN, GO_LEESBRIL_UITLEG, GO_LEESBRIL_ZEKERHEID, leeftijdLabel, meestalTekst } from '../../../lib/basis/go/leeftijden';
import type { GoLeeftijd } from '../../../lib/basis/go/types';
import { ZekerheidBadge } from '../ZekerheidBadge';

/** De uitleg bij de leesbril: altijd dezelfde, onder 'Hoe zeker is dit?'. */
export function LeeftijdUitleg() {
  return (
    <details className="b-go-uitleg">
      <summary>Hoe zeker is dit?</summary>
      <p>{GO_LEESBRIL_UITLEG}</p>
    </details>
  );
}

export interface LeeftijdKiezerProps {
  /** De gekozen groep; undefined is 'Alle leeftijden'. */
  waarde: GoLeeftijd | undefined;
  onKies: (leeftijd: GoLeeftijd | undefined) => void;
  /** Hoeveel er in elke groep zijn, tussen haakjes achter de pil. */
  aantallen?: Readonly<Partial<Record<GoLeeftijd, number>>>;
}

export function LeeftijdKiezer({ waarde, onKies, aantallen }: LeeftijdKiezerProps) {
  return (
    <div className="b-go-kiezer">
      <div className="b-pillen" role="group" aria-label="Leeftijd volgens het GO!">
        <button type="button" className="b-pil-knop" aria-pressed={waarde === undefined} onClick={() => onKies(undefined)}>
          Alle leeftijden
        </button>
        {GO_LEEFTIJDEN.map((l) => {
          const aantal = aantallen?.[l];
          return (
            <button key={l} type="button" className="b-pil-knop" aria-pressed={waarde === l} onClick={() => onKies(l)}>
              {leeftijdLabel(l)}
              {aantal !== undefined && <span className="b-go-pil-aantal"> ({aantal})</span>}
            </button>
          );
        })}
      </div>
      {waarde && (
        <p className="b-noot b-go-meestal">
          {leeftijdLabel(waarde)}: {meestalTekst(waarde)} <ZekerheidBadge zekerheid={GO_LEESBRIL_ZEKERHEID} />
        </p>
      )}
      <LeeftijdUitleg />
    </div>
  );
}
