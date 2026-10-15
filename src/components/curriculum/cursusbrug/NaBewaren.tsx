// Het paneel na een geslaagde "Bewaar de lijst" in de samenstelwizard (docs/LEERPLANNEN.md § 16.4): "Wat nu?". Het staat in
// plaats van de stappen, met de focus op de kop, en brengt de leerkracht van de bewaarde doelenlijst naar een cursus. Met een
// richting in de link (`richtingPad`) staat er ook een weg terug naar de studierichting. De toast van vroeger is weg: het
// paneel zegt zelf dat de lijst bewaard is.

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Curriculum } from '../../../lib/curriculumTypes';
import {
  leerplanPad, LINK_NAAR_LEERPLANNEN, LINK_TERUG_NAAR_RICHTING, NA_BEWAREN_KOP, naBewarenZin,
} from '../../../lib/cursusBrugTeksten';
import { CursusBrugKnoppen } from './CursusBrugKnoppen';
import '../../../styles/cursusbrug.css';

export function NaBewaren({ leerplan, nagekeken, richtingPad }: {
  /** De lijst zoals ze bewaard is. */
  leerplan: Curriculum;
  /** De lijst is nagekeken door de officiële bron. */
  nagekeken: boolean;
  /** Het pad terug naar de studierichting; alleen met een richting in de link. */
  richtingPad?: string;
}) {
  const kopRef = useRef<HTMLHeadingElement>(null);
  // De knop "Bewaar de lijst" is verdwenen: de focus gaat naar de kop, zodat een schermlezer voorleest wat er gebeurd is.
  useEffect(() => { kopRef.current?.focus(); }, []);

  return (
    <section className="card card-pad cb-paneel" aria-labelledby="cb-kop">
      <h2 id="cb-kop" className="cb-kop" tabIndex={-1} ref={kopRef}>{NA_BEWAREN_KOP}</h2>
      <p className="cb-zin">{naBewarenZin(leerplan.title, leerplan.goals.length, nagekeken)}</p>
      <CursusBrugKnoppen leerplan={leerplan} />
      <p className="cb-links">
        <Link to={leerplanPad(leerplan.id)}>{LINK_NAAR_LEERPLANNEN}</Link>
        {richtingPad && <Link to={richtingPad}>{LINK_TERUG_NAAR_RICHTING}</Link>}
      </p>
    </section>
  );
}
