// De bijna kale schil van het bordscherm van een pakket (#/basis/bord/…), LK-8: precies één main met de h1, en onderaan een
// onopvallende link terug naar de lespagina. Geen kop, geen navigatie, geen namen in beeld en niets bewaard. De schil zet
// html[data-bord] (grotere letters en tikdoelen, zie basis.css en basis-lichtkamer.css) en haalt het weg bij het verlaten.
// Bij het openen gaat de focus naar main (zonder scrollen), zodat een presenter of het toetsenbord meteen werkt.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function BordSchil({ titel, terug, children }: { titel: string; terug: string; children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.bord = '';
    return () => {
      delete html.dataset.bord;
    };
  }, []);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, []);
  return (
    <div className="b-schil b-bord">
      <main id="main" ref={main} tabIndex={-1} className="b-main">
        <h1 className="b-bord-titel">{titel}</h1>
        {children}
      </main>
      <footer className="b-bord-voet">
        <Link to={terug}>Terug naar de lespagina</Link>
      </footer>
    </div>
  );
}
