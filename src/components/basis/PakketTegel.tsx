// De tegel van een pakket (nu: 'Lichtkamer: schaduwtheater') en het blok 'Klaar om te geven' dat ze op de pagina van een
// leerjaar toont. Dezelfde tegel staat op de startpagina van het basisdeel. De css (b-tegels, b-tegel) staat in basis-leerjaar.css.

import { Link } from 'react-router-dom';
import { basisPad } from '../../lib/basis/basisRoutes';
import { pakkettenVoorLeerjaar, type Pakket } from '../../lib/basis/pakketten';
import type { LeerjaarBasis, SoortBasis } from '../../lib/basis/kalender';

export function PakketTegel({ pakket }: { pakket: Pakket }) {
  return (
    <Link to={basisPad({ s: 'pakket', pakket: pakket.naam, eind: pakket.eind })} className="b-tegel">
      <span className="b-tegel-naam">{pakket.titel}</span>
      <span className="b-tegel-sub">wetenschap en techniek, licht en schaduw, 3de en 4de leerjaar</span>
    </Link>
  );
}

/** Het blok 'Klaar om te geven'; niets (null) als er voor dit leerjaar geen pakket is. */
export function KlaarOmTeGeven({ soort, leerjaar }: { soort: SoortBasis; leerjaar: LeerjaarBasis }) {
  const pakketten = pakkettenVoorLeerjaar(soort, leerjaar);
  if (pakketten.length === 0) return null;
  return (
    <section aria-labelledby="b-klaar-kop" className="b-blok">
      <h2 id="b-klaar-kop">Klaar om te geven</h2>
      <p>Een les met bord, oefeningen voor de kinderen en een spiekkaart voor jou.</p>
      <ul className="b-tegels">
        {pakketten.map((p) => (
          <li key={p.naam}>
            <PakketTegel pakket={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
