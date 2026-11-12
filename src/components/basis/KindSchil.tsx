// De kale schil van het kindscherm van een pakket (#/basis/oefen/…), LK-8: het merk (geen link), het menu met de
// leesinstellingen (tekstgrootte, rust, letterafstand) zoals op de leerlingschermen, precies één main en één h1 met de naam
// van het pakket. Geen navigatie van de leerkracht en geen 'Naar Boosterz': een kind van 9 komt hier niet weg. Het menu
// bewaart zijn eigen voorkeuren zoals overal in de app; de schil zelf bewaart niets.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Lamp } from 'lucide-react';
import { A11yMenu, loadA11y } from '../A11yMenu';

export function KindSchil({ titel, children }: { titel: string; children: ReactNode }) {
  const [a11y, setA11y] = useState(loadA11y);
  const main = useRef<HTMLElement>(null);
  // Bij het openen naar main, zonder scrollen: het toetsenbord begint zo bij de inhoud.
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, []);
  return (
    <div
      className={`b-schil b-kind ${a11y.calm ? 'calm' : ''} ${a11y.spacing ? 'spaced' : ''}`}
      style={a11y.scale !== 1 ? { fontSize: `${a11y.scale}em` } : undefined}
    >
      {/* In een hash-router is "#main" een route, geen anker: zelf de focus verplaatsen (zoals in BasisSchil). */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
          main.current?.scrollIntoView?.();
        }}
      >
        Naar de inhoud
      </a>
      <header className="b-kop">
        <div className="b-kop-in">
          <span className="b-merk">
            <span className="b-lamptegel" aria-hidden="true"><Lamp size={22} /></span>
            <span>Boosterz</span>
          </span>
          <div className="b-kind-menu">
            <A11yMenu value={a11y} onChange={setA11y} />
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="b-main">
        <h1>{titel}</h1>
        {children}
      </main>
    </div>
  );
}
