// De onderwerpen (rubrieken) van een vak op een moment als rij knoppen met het aantal doelen. Een tik scrollt naar de
// kop van dat onderwerp en zet de focus erop, zodat toetsenbord en schermlezer meekomen. De kop (h2) staat in het
// scherm zelf; dat geeft hem het id van onderwerpKopId en tabIndex -1.

import type { Onderwerp } from '../../lib/basis/doelBasis';

/** Het id van de kop van een onderwerp: '3.5' wordt 'b-onderwerp-3-5'. */
export function onderwerpKopId(nr: string): string {
  return `b-onderwerp-${nr.replace(/\./g, '-')}`;
}

/** Scrolt naar de kop van een onderwerp en zet de focus erop. Geeft terug of de kop bestond. */
export function ga(nr: string): boolean {
  const kop = document.getElementById(onderwerpKopId(nr));
  if (!kop) return false;
  kop.scrollIntoView({ block: 'start' });
  kop.focus({ preventScroll: true });
  return true;
}

export function RubriekenLijst({ onderwerpen }: { onderwerpen: readonly Onderwerp[] }) {
  if (onderwerpen.length === 0) return null;
  return (
    <nav className="b-rubrieken" aria-label="Onderwerpen van dit vak">
      <ul>
        {onderwerpen.map((o) => (
          <li key={o.nr}>
            <button type="button" className="b-rubriek-knop" onClick={() => ga(o.nr)}>
              <span className="b-rubriek-nr">{o.nr}</span> {o.naam}
              <span className="b-rubriek-aantal"> ({o.aantal})</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
