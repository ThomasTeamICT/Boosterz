// Het paneel van 'Waar valt de schaduw?': drie rondes met de letters A, B en C. Dun: tikken worden acties van
// voorspelReducer, de toestand wordt getoond. De kijkdoos tekent de lamp, de letters en de schaduw.

import { useEffect, useRef, type Dispatch } from 'react';
import { LETTERS } from '../../../lib/basis/lichtkamer';
import {
  AANTAL_RONDES,
  isAf,
  juisteLetter,
  kanVolgende,
  letterPlaats,
  uitkomstVan,
  type VoorspelActie,
  type VoorspelToestand,
} from '../../../lib/basis/lichtkamer/les';
import { Markering, Terugkoppeling } from './LesOnderdelen';

export function VoorspelPaneel({ t, dispatch, bord }: { t: VoorspelToestand; dispatch: Dispatch<VoorspelActie>; bord: boolean }) {
  const uitkomst = uitkomstVan(t);
  const keuze = t.keuzes[t.ronde] ?? null;
  const juist = juisteLetter(t);
  const volgendeKnop = useRef<HTMLButtonElement>(null);
  const eersteLetter = useRef<HTMLButtonElement>(null);
  const rondeTekst = useRef<HTMLParagraphElement>(null);
  const eerderRonde = useRef(t.ronde);

  // Na een antwoord van het kind gaat de focus naar 'Volgende ronde' (of naar de rondetekst na de laatste ronde); op het
  // bord blijft de focus staan waar de leerkracht hem liet.
  useEffect(() => {
    if (bord || keuze === null) return;
    (volgendeKnop.current ?? rondeTekst.current)?.focus();
  }, [bord, keuze, t.ronde]);
  // Een nieuwe ronde: de focus naar de eerste letter.
  useEffect(() => {
    if (!bord && t.ronde !== eerderRonde.current) eersteLetter.current?.focus();
    eerderRonde.current = t.ronde;
  }, [bord, t.ronde]);

  return (
    <div className="b-lk-paneel">
      <p className="b-lk-ronde" ref={rondeTekst} tabIndex={-1}>
        Ronde {t.ronde + 1} van {AANTAL_RONDES}
      </p>
      <div className="b-lk-opts" role="group" aria-label="Waar valt de schaduw?">
        {LETTERS.map((L, i) => {
          const gekozen = keuze === i;
          const toon = t.getoond && (gekozen || i === juist);
          return (
            <button
              key={L}
              ref={i === 0 ? eersteLetter : undefined}
              type="button"
              className={`b-lk-opt${t.getoond && i === juist ? ' b-lk-juist' : ''}${gekozen && i !== juist ? ' b-lk-fout' : ''}`}
              disabled={t.getoond}
              onClick={() => dispatch({ type: 'kies', letter: i })}
            >
              <span className="b-lk-letter" aria-hidden="true">
                {L}
              </span>
              <span>
                Hier valt de schaduw<span className="sr-only"> (letter {L}, {letterPlaats(t, i)} op het scherm)</span>
              </span>
              {toon ? <Markering juist={i === juist} /> : null}
            </button>
          );
        })}
      </div>
      {bord ? (
        <div className="b-lk-acties">
          <button type="button" className="b-knop b-lk-groot" disabled={t.getoond} onClick={() => dispatch({ type: 'toon' })}>
            Toon de uitkomst
          </button>
        </div>
      ) : null}
      {kanVolgende(t) ? (
        <div className="b-lk-acties">
          <button ref={volgendeKnop} type="button" className="b-knop b-lk-hoofd b-lk-groot" onClick={() => dispatch({ type: 'volgende' })}>
            Volgende ronde
          </button>
        </div>
      ) : null}
      {isAf(t) ? <p className="b-lk-af">Je hebt alle drie de rondes gedaan.</p> : null}
      {uitkomst ? <Terugkoppeling soort={uitkomst.soort} titel={uitkomst.titel} uitleg={uitkomst.uitleg} /> : <Terugkoppeling soort={null} />}
    </div>
  );
}
