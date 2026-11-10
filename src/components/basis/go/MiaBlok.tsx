// De inhoud onder een leerplandoel van het GO!: de MIA-blokken (titel en items), de te hanteren begrippen met hun
// leeftijden, de voorbeelden en de voetnoten, letterlijk en in de volgorde van de bron (docs/basisonderwijs/GO-LEERPLAN.md,
// "2. Leerplandoelpagina").
//
// Wat 'MIA' betekent, zegt de bron niet; MiaBlok toont het woord daarom niet en legt het niet uit. Het staat wel letterlijk
// in de lesplannen en in de zin over een koppeling via een onderdeel (KoppelingLijst, GoBijDoel: 'MIA “Aftrekken:”'). Of een
// MIA-item aanklikbaar is (GoDoelInhoud.aanklikbaar) blijft bewaard maar staat niet op het scherm, zolang de betekenis niet gekend is.
// Voorbeelden bevatten soms verzonnen kindernamen uit de bron; die blijven letterlijk staan.

import { Fragment } from 'react';
import { leeftijdenLabel } from '../../../lib/basis/go/leeftijden';
import type { GoDoelInhoud, GoTekst } from '../../../lib/basis/go/types';
import { GoRegel } from './GoTekst';

/** Een letterlijke tekst uit een doelenset: met de opmaak van de bron (doorgehaald, superschrift …) als die er is. */
export function GoTekstWeergave({ tekst }: { tekst: GoTekst }) {
  return tekst.opmaak ? <GoRegel regel={tekst.opmaak} /> : <>{tekst.tekst}</>;
}

type Begrip = Extract<GoDoelInhoud, { soort: 'begrip' }>;

/** De inhoud in blokken van dezelfde soort, in bronvolgorde: een titel begint een nieuw blok, een item gaat naar het blok ervoor. */
export type InhoudGroep =
  | { soort: 'mia'; titel?: GoTekst; items: GoTekst[] }
  | { soort: 'begrippen'; items: Begrip[] }
  | { soort: 'voorbeelden'; titel?: GoTekst; items: GoTekst[] }
  | { soort: 'voetnoten'; items: GoTekst[] };

/**
 * Groepeert de inhoud van een leerplandoel. Aangrenzende rijen van dezelfde soort horen bij elkaar; een MIA-titel of
 * een titel van voorbeelden begint altijd een nieuw blok. Er gaat niets verloren en niets verandert van volgorde.
 */
export function groepeerInhoud(inhoud: readonly GoDoelInhoud[]): InhoudGroep[] {
  const uit: InhoudGroep[] = [];
  for (const i of inhoud) {
    const laatste = uit[uit.length - 1];
    switch (i.soort) {
      case 'mia-titel':
        uit.push({ soort: 'mia', titel: i, items: [] });
        break;
      case 'mia':
        if (laatste?.soort === 'mia') laatste.items.push(i);
        else uit.push({ soort: 'mia', items: [i] });
        break;
      case 'begrip':
        if (laatste?.soort === 'begrippen') laatste.items.push(i);
        else uit.push({ soort: 'begrippen', items: [i] });
        break;
      case 'voorbeelden-titel':
        uit.push({ soort: 'voorbeelden', titel: i, items: [] });
        break;
      case 'voorbeeld':
        if (laatste?.soort === 'voorbeelden') laatste.items.push(i);
        else uit.push({ soort: 'voorbeelden', items: [i] });
        break;
      case 'voetnoot':
        if (laatste?.soort === 'voetnoten') laatste.items.push(i);
        else uit.push({ soort: 'voetnoten', items: [i] });
        break;
    }
  }
  return uit;
}

function Items({ items }: { items: readonly GoTekst[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="b-go-items">
      {items.map((t, n) => (
        <li key={n} className="b-go-tekst">
          <GoTekstWeergave tekst={t} />
        </li>
      ))}
    </ul>
  );
}

/**
 * De inhoud van één leerplandoel. De kop 'Inhoud' (h2) staat in het scherm; de tussenkoppen hier zijn h3 en komen alleen
 * als er iets onder staat. Zonder inhoud rendert dit niets.
 */
export function MiaBlok({ inhoud }: { inhoud: readonly GoDoelInhoud[] }) {
  const groepen = groepeerInhoud(inhoud);
  if (groepen.length === 0) return null;
  return (
    <div className="b-go-inhoud">
      {groepen.map((g, n) => {
        const vorige = groepen[n - 1];
        switch (g.soort) {
          case 'mia':
            return (
              <div key={n} className="b-go-groep">
                {g.titel && (
                  <p className="b-go-titel b-go-tekst">
                    <GoTekstWeergave tekst={g.titel} />
                  </p>
                )}
                <Items items={g.items} />
              </div>
            );
          case 'begrippen':
            return (
              <div key={n} className="b-go-groep">
                <h3>Te hanteren begrippen</h3>
                <ul className="b-go-items b-go-begrippen">
                  {g.items.map((b, k) => (
                    <li key={k} className="b-go-tekst">
                      <GoTekstWeergave tekst={b} />
                      {b.leeftijden.length > 0 && (
                        <span className="b-go-leeftijden">
                          {' '}
                          ({leeftijdenLabel(b.leeftijden)})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          case 'voorbeelden':
            return (
              <div key={n} className="b-go-groep">
                {vorige?.soort !== 'voorbeelden' && <h3>Voorbeelden</h3>}
                {g.titel && (
                  <p className="b-go-titel b-go-tekst">
                    <GoTekstWeergave tekst={g.titel} />
                  </p>
                )}
                <Items items={g.items} />
              </div>
            );
          case 'voetnoten':
            return (
              <Fragment key={n}>
                {g.items.map((t, k) => (
                  <p key={k} className="b-go-voetnoot b-go-tekst">
                    <GoTekstWeergave tekst={t} />
                  </p>
                ))}
              </Fragment>
            );
        }
      })}
    </div>
  );
}
