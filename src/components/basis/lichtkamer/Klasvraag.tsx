// De klasvraag op het bord, als dialoog onderaan de kijkdoos: de klas toont met vingers wat ze kiest, de leerkracht tikt
// dat aan en toont de uitkomst. role="dialog" met aria-modal, een focusval, Escape sluit (de ouder zet de focus terug op
// de knop 'Klasvraag'). Dun: de toestand en de teksten komen uit klasvraag.ts.

import { useEffect, useRef, type Dispatch } from 'react';
import { AssignIcon } from '../../icons';
import type { Klasvraag as KlasvraagGegevens, KlasvraagActie, KlasvraagToestand } from '../../../lib/basis/lichtkamer/les';
import { Markering } from './LesOnderdelen';

/** De knop die de klasvraag opent; de ouder houdt de ref bij om de focus terug te zetten. */
export function KlasvraagKnop({ open, onClick, knopRef }: { open: boolean; onClick: () => void; knopRef: React.RefObject<HTMLButtonElement> }) {
  return (
    <button ref={knopRef} type="button" className="b-knop b-lk-groot" aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
      <AssignIcon size={20} aria-hidden="true" />
      Klasvraag
    </button>
  );
}

export function KlasvraagDialoog({
  vraag,
  toestand,
  dispatch,
  sluit,
  volgende,
  toonUitkomst,
}: {
  vraag: KlasvraagGegevens;
  toestand: KlasvraagToestand;
  dispatch: Dispatch<KlasvraagActie>;
  /** Sluit en zet de focus terug op 'Klasvraag'. */
  sluit: () => void;
  /** 'Volgende ronde': de ouder zet de oefening door en de dialoog gaat opnieuw open voor de volgende ronde. */
  volgende: () => void;
  /** 'Toon de uitkomst': de ouder toont de uitkomst in de kijkdoos. */
  toonUitkomst: () => void;
}) {
  const wortel = useRef<HTMLDivElement>(null);
  const eersteKeuze = useRef<HTMLButtonElement>(null);
  const toonKnop = useRef<HTMLButtonElement>(null);
  const volgendeKnop = useRef<HTMLButtonElement>(null);
  const sluitKnop = useRef<HTMLButtonElement>(null);
  const getoond = toestand.getoond;

  // Bij het openen (en bij elke nieuwe ronde: de ouder geeft de dialoog dan een nieuwe key) naar de eerste keuze, zonder het
  // beeld te verschuiven.
  useEffect(() => {
    eersteKeuze.current?.focus({ preventScroll: true });
  }, []);
  // Na de uitkomst verdwijnt 'Toon de uitkomst': de focus naar 'Volgende ronde' of 'Sluiten'.
  useEffect(() => {
    if (getoond) (volgendeKnop.current ?? sluitKnop.current)?.focus();
  }, [getoond]);

  const sleutel = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      sluit();
      return;
    }
    if (e.key !== 'Tab') return;
    // De focusval: Tab loopt rond over de knoppen van de dialoog.
    const knoppen = Array.from(wortel.current?.querySelectorAll<HTMLButtonElement>('button') ?? []).filter((b) => !b.disabled && b.offsetParent !== null);
    if (knoppen.length === 0) return;
    const eerste = knoppen[0] as HTMLButtonElement;
    const laatste = knoppen[knoppen.length - 1] as HTMLButtonElement;
    const nu = document.activeElement;
    if (e.shiftKey && (nu === eerste || !wortel.current?.contains(nu))) {
      e.preventDefault();
      laatste.focus();
    } else if (!e.shiftKey && (nu === laatste || !wortel.current?.contains(nu))) {
      e.preventDefault();
      eerste.focus();
    }
  };

  return (
    <div ref={wortel} className="b-lk-vraag" role="dialog" aria-modal="true" aria-labelledby="lk-vraag-titel" onKeyDown={sleutel}>
      <p className="b-lk-vraag-kop">Klasvraag</p>
      <h2 id="lk-vraag-titel">{vraag.tekst}</h2>
      <p>{vraag.uitleg}</p>
      <ul className="b-lk-keuzes">
        {vraag.opties.map((o, i) => {
          const gekozen = toestand.gekozen === i;
          const juist = getoond && i === vraag.juist;
          return (
            <li key={o}>
              <button
                ref={i === 0 ? eersteKeuze : undefined}
                type="button"
                className={`b-lk-keuze${juist ? ' b-lk-juist' : ''}`}
                aria-pressed={gekozen}
                disabled={getoond}
                onClick={() => dispatch({ type: 'kies', i })}
              >
                <span>{vraag.keuzes[i]}</span>
                {juist ? <Markering juist zonderIcoon /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="b-lk-vraag-acties">
        {getoond ? null : (
          <button ref={toonKnop} type="button" className="b-lk-knop b-lk-groot" onClick={toonUitkomst}>
            Toon de uitkomst
          </button>
        )}
        {getoond && vraag.metVolgende ? (
          <button ref={volgendeKnop} type="button" className="b-lk-knop b-lk-groot b-lk-knop-hoofd" onClick={volgende}>
            Volgende ronde
          </button>
        ) : null}
        <button ref={sluitKnop} type="button" className="b-lk-knop b-lk-groot" onClick={sluit}>
          Sluiten
        </button>
      </div>
    </div>
  );
}
