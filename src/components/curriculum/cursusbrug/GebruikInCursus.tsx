// Het blok "Gebruik in een cursus" op de pagina Leerplannen (docs/LEERPLANNEN.md § 16.5): in `LeerplanOpSlot` en in de editor van
// een leerplan met minstens één doel, in plaats van de tip "Koppel deze doelen daarna …". Niet bij een leerplan met de competenties
// van een beroepskwalificatie (dat houdt zijn link naar de studierichting): dat beslist de aanroeper met `toonGebruikInCursus`.

import { useId } from 'react';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { GEBRUIK_KOP, GEBRUIK_ZIN } from '../../../lib/cursusBrugTeksten';
import { isBkLeerplan } from '../../../lib/leerplanStatus';
import { CursusBrugKnoppen } from './CursusBrugKnoppen';
import '../../../styles/cursusbrug.css';

/** Het blok staat er bij een leerplan met minstens één doel dat niet de competenties van een beroepskwalificatie bevat. */
export function toonGebruikInCursus(leerplan: Curriculum): boolean {
  return leerplan.goals.length > 0 && !isBkLeerplan(leerplan);
}

export function GebruikInCursus({ leerplan }: { leerplan: Curriculum }) {
  const kopId = useId();
  return (
    <section className="cb-gebruik" aria-labelledby={kopId}>
      <h3 id={kopId} className="cb-gebruik-kop">{GEBRUIK_KOP}</h3>
      <p className="cb-gebruik-zin">{GEBRUIK_ZIN}</p>
      <CursusBrugKnoppen leerplan={leerplan} />
    </section>
  );
}
