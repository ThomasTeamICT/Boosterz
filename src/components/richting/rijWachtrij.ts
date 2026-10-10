// De wachtrij van "Mijn richtingen" (docs/STUDIERICHTINGEN.md § 22.5.2, punt 2): de dekking van een richting vraagt de
// setbestanden van haar kader (±23 stuks). Rekenen twee richtingen tegelijk, dan wisselen ze de 40 plaatsen van de cache van
// `laadSet` voortdurend af en vraagt het netwerk veel meer dan één bezoek aan het detail. Daarom rekent er maar één rij
// tegelijk; de anderen wachten op hun beurt, in de volgorde waarin ze erom vroegen.
//
// - `maakWachtrij` is de pure kern (geen React, geen klok): ze is zonder DOM te testen.
// - `useBeurt` is de dunne hook erbovenop, met één wachtrij voor de hele pagina.
//
// Wie klaar is (gelukt of mislukt) of verdwijnt (de rij verlaat het scherm, de pagina sluit), geeft zijn beurt terug: een
// mislukte rij houdt de rest dus nooit op.

import { useCallback, useEffect, useRef, useState } from 'react';

/** Krijgt `true` zodra de rij aan de beurt is. */
export type BeurtMelder = (aanDeBeurt: boolean) => void;

/** Wat een rij in handen krijgt zodra ze zich aanmeldt. */
export interface Deelname {
  /**
   * Klaar met de beurt, of niet meer nodig: de rij verlaat de wachtrij. Had ze de beurt, dan krijgt de volgende hem meteen;
   * wachtte ze nog, dan valt ze weg zonder dat iemand iets merkt. Vaker aanroepen kan geen kwaad.
   */
  klaar(): void;
}

export interface Wachtrij {
  /**
   * Meldt een rij aan achteraan de wachtrij. Is niemand aan de beurt, dan is de rij het meteen: `melder(true)` komt dan nog
   * voor `meld` terugkeert. De melder krijgt nooit `false`: wie klaar is, weet dat zelf.
   */
  meld(melder: BeurtMelder): Deelname;
  /** Hoeveel rijen wachten er (zonder die aan de beurt is)? Voor tests. */
  wachtend(): number;
  /** Is er iemand aan de beurt? Voor tests. */
  bezig(): boolean;
}

interface Plaats {
  melder: BeurtMelder;
}

/** Een wachtrij waarin één rij tegelijk aan de beurt is, in de volgorde van aanmelden. */
export function maakWachtrij(): Wachtrij {
  const wachtenden: Plaats[] = [];
  let aanDeBeurt: Plaats | null = null;

  const geefDoor = (): void => {
    if (aanDeBeurt !== null) return;
    const volgende = wachtenden.shift();
    if (!volgende) return;
    aanDeBeurt = volgende;
    // Een melder die zelf een fout gooit (een rij die al weg is), mag de rij erachter niet blokkeren.
    try {
      volgende.melder(true);
    } catch {
      if (aanDeBeurt === volgende) aanDeBeurt = null;
      geefDoor();
    }
  };

  return {
    meld(melder) {
      const plaats: Plaats = { melder };
      wachtenden.push(plaats);
      geefDoor();
      return {
        klaar() {
          if (aanDeBeurt === plaats) {
            aanDeBeurt = null;
            geefDoor();
            return;
          }
          const i = wachtenden.indexOf(plaats);
          if (i >= 0) wachtenden.splice(i, 1);
        },
      };
    },
    wachtend: () => wachtenden.length,
    bezig: () => aanDeBeurt !== null,
  };
}

/** De wachtrij van de pagina: alle rijen van "Mijn richtingen" delen ze. */
const paginaWachtrij = maakWachtrij();

/**
 * Een rij die wil rekenen (`wil`), vraagt de beurt aan en krijgt hem als ze de eerste in de rij is. `klaar()` geeft de beurt
 * terug (roep het ook aan na een fout). Houdt `wil` op, of verdwijnt de rij, dan gaat de beurt vanzelf terug. Een rij die
 * later opnieuw wil (`wil` weer waar), sluit achteraan aan.
 */
export function useBeurt(wil: boolean): { aanDeBeurt: boolean; klaar: () => void } {
  const [aan, setAan] = useState(false);
  const deelname = useRef<Deelname | null>(null);

  useEffect(() => {
    if (!wil) return;
    const d = paginaWachtrij.meld(() => setAan(true));
    deelname.current = d;
    return () => {
      d.klaar();
      if (deelname.current === d) deelname.current = null;
      setAan(false);
    };
  }, [wil]);

  const klaar = useCallback(() => {
    deelname.current?.klaar();
    deelname.current = null;
    setAan(false);
  }, []);

  return { aanDeBeurt: wil && aan, klaar };
}
