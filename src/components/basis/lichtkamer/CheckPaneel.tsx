// De check: drie prentvragen, het eerste antwoord telt. Daarna mag het kind de check nog eens proberen (een oefenronde);
// het bewijs verandert dan niet meer. Dun: elke keuze is een actie van checkReducer.

import { useEffect, useRef, type Dispatch } from 'react';
import {
  AANTAL_VRAGEN,
  eersteAntwoordBij,
  huidigeVraag,
  isKlaar,
  uitkomstBij,
  type CheckLesActie,
  type CheckLesToestand,
} from '../../../lib/basis/lichtkamer/les';
import { CheckPrent } from './CheckPrent';
import { Markering, Terugkoppeling } from './LesOnderdelen';

export function CheckPaneel({
  t,
  dispatch,
  naarWatIkKan,
}: {
  t: CheckLesToestand;
  dispatch: Dispatch<CheckLesActie>;
  /** Na de laatste vraag (of vanuit het eindscherm) naar 'Wat ik al kan'. */
  naarWatIkKan: () => void;
}) {
  const vraag = huidigeVraag(t);
  const kop = useRef<HTMLHeadingElement>(null);
  const volgende = useRef<HTMLButtonElement>(null);
  const eerderVraag = useRef(-1);
  const antwoord = t.antwoorden[t.vraag] ?? null;

  // Een nieuwe vraag: de focus naar de vraag. Een antwoord: de focus naar 'Volgende vraag'.
  useEffect(() => {
    if (t.vraag !== eerderVraag.current && eerderVraag.current !== -1) kop.current?.focus();
    eerderVraag.current = t.vraag;
  }, [t.vraag]);
  useEffect(() => {
    if (antwoord !== null) volgende.current?.focus();
  }, [antwoord]);

  if (!vraag || isKlaar(t)) {
    return (
      <div className="b-lk-paneel">
        <Terugkoppeling soort="ok" titel="Klaar met de check." uitleg="Kijk bij Wat ik al kan wat al lukt. Je eerste antwoord telt altijd." />
        <div className="b-lk-acties">
          <button type="button" className="b-knop b-lk-hoofd b-lk-groot" onClick={naarWatIkKan}>
            Wat ik al kan
          </button>
          <button type="button" className="b-knop b-lk-groot" onClick={() => dispatch({ type: 'opnieuw' })}>
            Probeer de check nog eens
          </button>
        </div>
      </div>
    );
  }

  const u = uitkomstBij(t, t.vraag);
  const eerst = eersteAntwoordBij(t, t.vraag);
  const laatste = t.vraag === AANTAL_VRAGEN - 1;
  return (
    <div className="b-lk-paneel">
      <p className="b-lk-ronde">
        Vraag {t.vraag + 1} van {AANTAL_VRAGEN}
        {t.oefenronde ? ' (oefenen: je eerste antwoord telt)' : ''}
      </p>
      <h3 className="b-lk-vraagkop" id="lk-check-vraag" tabIndex={-1} ref={kop}>
        {vraag.vraag}
      </h3>
      {vraag.uitleg ? <p className="b-lk-uitleg">{vraag.uitleg}</p> : null}
      <div className="b-lk-opts b-lk-opts-prent" role="group" aria-labelledby="lk-check-vraag">
        {vraag.opties.map((o, i) => {
          const gekozen = antwoord === i;
          const juist = !!o.juist;
          return (
            <button
              key={`${t.vraag}-${i}`}
              type="button"
              className={`b-lk-opt b-lk-opt-prent${antwoord !== null && juist ? ' b-lk-juist' : ''}${gekozen && !juist ? ' b-lk-fout' : ''}`}
              disabled={antwoord !== null}
              onClick={() => dispatch({ type: 'kies', keuze: i })}
            >
              <CheckPrent vraagId={vraag.id} i={i} />
              <span className="b-lk-opt-tekst" aria-hidden={o.label ? true : undefined}>
                {o.t}
              </span>
              {o.label ? <span className="sr-only">{o.label}</span> : null}
              {antwoord !== null && (gekozen || juist) ? <Markering juist={juist} /> : null}
            </button>
          );
        })}
      </div>
      {u ? (
        <Terugkoppeling
          soort={u.soort}
          titel={u.titel}
          uitleg={u.uitleg}
          extra={eerst ? <p>{eerst.titel}</p> : null}
        />
      ) : (
        <Terugkoppeling soort={null} />
      )}
      {antwoord !== null ? (
        <div className="b-lk-acties">
          <button
            ref={volgende}
            type="button"
            className="b-knop b-lk-hoofd b-lk-groot"
            onClick={() => {
              dispatch({ type: 'volgende' });
              if (laatste) naarWatIkKan();
            }}
          >
            {laatste ? 'Klaar' : 'Volgende vraag'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
