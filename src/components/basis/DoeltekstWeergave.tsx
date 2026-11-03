// Toont de tekst van een officieel doel (doelzin, uitbreiding, woordenschat) volledig en letterlijk.
//
// De html van de bron wordt eerst door doeltekstBlokken gehaald (src/lib/basis/doeltekst.ts) tot een vaste structuur;
// deze component zet die om in React-elementen. Er komt dus nooit ruwe html op het scherm. Niets wordt ingekort:
// lijsten blijven lijsten (ook genest), een breuk blijft een breuk, en de labels [F], [I] en [I/F] blijven letterlijk
// in de tekst staan, zonder uitleg, want hun betekenis is nog niet nagelezen.

import { Fragment, useMemo, type ReactNode } from 'react';
import { doeltekstBlokken, type Blok, type Inline } from '../../lib/basis/doeltekst';

function Inlines({ kids }: { kids: readonly Inline[] }) {
  return (
    <>
      {kids.map((k, i) => (
        <InlineDeel key={i} k={k} />
      ))}
    </>
  );
}

function InlineDeel({ k }: { k: Inline }): ReactNode {
  switch (k.t) {
    case 'tekst':
      return k.s;
    case 'sterk':
      return (
        <strong>
          <Inlines kids={k.kids} />
        </strong>
      );
    case 'nadruk':
      return (
        <em>
          <Inlines kids={k.kids} />
        </em>
      );
    case 'breuk':
      return (
        <span className="b-breuk" role="math" aria-label={`${k.teller} op ${k.noemer}`}>
          <span className="b-breuk-teller" aria-hidden="true">
            {k.teller}
          </span>
          <span className="b-breuk-streep" aria-hidden="true">
            /
          </span>
          <span className="b-breuk-noemer" aria-hidden="true">
            {k.noemer}
          </span>
        </span>
      );
    case 'wiskunde':
      return <span className="b-wiskunde">{k.s}</span>;
    case 'link':
      return k.href ? (
        <a href={k.href} target="_blank" rel="noopener noreferrer">
          {k.s}
          <span className="sr-only"> (opent in een nieuw tabblad)</span>
        </a>
      ) : (
        <Fragment>{k.s}</Fragment>
      );
    case 'beeld':
      return <span className="b-beeld">{k.alt !== '' ? `Afbeelding in de bron: ${k.alt}` : 'Afbeelding in de bron'}</span>;
    case 'voorbeeld':
    case 'toelichting':
      return (
        <span className={k.t === 'voorbeeld' ? 'b-voorbeeld' : 'b-toelichting'}>
          <span className="b-voorbeeld-kop">{k.t === 'voorbeeld' ? 'Voorbeeld: ' : 'Toelichting: '}</span>
          <Inlines kids={k.kids} />
        </span>
      );
    case 'kennis':
      return <span className="b-kennis">{`[${k.s}]`}</span>;
    case 'regel':
      return <br />;
  }
}

function Blokken({ blokken }: { blokken: readonly Blok[] }) {
  return (
    <>
      {blokken.map((b, i) => {
        if (b.t === 'alinea') {
          return (
            <p key={i} className="b-doeltekst-alinea">
              <Inlines kids={b.kids} />
            </p>
          );
        }
        const Lijst = b.geordend ? 'ol' : 'ul';
        return (
          <Lijst key={i} className="b-doeltekst-lijst">
            {b.items.map((item, j) => (
              <li key={j}>
                <Blokken blokken={item} />
              </li>
            ))}
          </Lijst>
        );
      })}
    </>
  );
}

/**
 * De volledige tekst van een doel. Geef de html van de bron (`html`) of al gelezen blokken (`blokken`).
 * De letter is 1,35rem op de doelpagina; dat regelt de css van het scherm via `className`.
 */
export function DoeltekstWeergave({
  html,
  blokken,
  className,
}: {
  html?: string;
  blokken?: readonly Blok[];
  className?: string;
}) {
  const gelezen = useMemo(() => blokken ?? doeltekstBlokken(html ?? ''), [blokken, html]);
  return (
    <div className={className ? `b-doeltekst ${className}` : 'b-doeltekst'}>
      <Blokken blokken={gelezen} />
    </div>
  );
}
