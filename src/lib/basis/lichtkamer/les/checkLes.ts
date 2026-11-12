// De check van het einde van het 4de leerjaar (drie prentvragen): de lesmachine. Zuiver.
//
// Het eerste antwoord per vraag telt voor het bewijs. Daarna mag het kind de check nog eens proberen (een oefenronde):
// die antwoorden krijgen terugkoppeling, maar het bewijs verandert niet meer.

import { CHECKS_4, juisteIndex, kijkCheckNa, type CheckUitkomst, type CheckVraag } from '../checks';
import type { BewijsMelding, BewijsStand } from './bewijsOntvanger';

export const AANTAL_VRAGEN = CHECKS_4.length;

export type CheckLesToestand = {
  /** Het eerste antwoord (index van de keuze) per vraag, voor altijd; dit is het bewijs. */
  eerste: readonly (number | null)[];
  /** De vraag die nu aan de beurt is; AANTAL_VRAGEN betekent: klaar met deze ronde. */
  vraag: number;
  /** De antwoorden van deze ronde (in een oefenronde kunnen ze van de eerste verschillen). */
  antwoorden: readonly (number | null)[];
  oefenronde: boolean;
};

export type CheckLesActie = { type: 'kies'; keuze: number } | { type: 'volgende' } | { type: 'opnieuw' };

const leeg = (): (number | null)[] => CHECKS_4.map(() => null);

export function beginCheckLes(): CheckLesToestand {
  return { eerste: leeg(), vraag: 0, antwoorden: leeg(), oefenronde: false };
}

/**
 * Begin na het herladen: staan alle drie de checkvragen al in de bewijsstand, dan telt het eerste antwoord al, en
 * begint de check als oefenronde. De stand kent alleen juist of fout (met het foutpatroon), dus de keuze wordt daaruit
 * teruggezocht: de juiste optie, of de optie met dat foutpatroon.
 */
export function beginCheckLesUitStand(stand: BewijsStand): CheckLesToestand {
  if (!CHECKS_4.every((v) => stand[v.id])) return beginCheckLes();
  const eerste = CHECKS_4.map((v) => {
    const g = stand[v.id] as { juist: boolean; fout: string | null };
    if (g.juist) return juisteIndex(v);
    const i = v.opties.findIndex((o) => !o.juist && o.fout === g.fout);
    return i >= 0 ? i : v.opties.findIndex((o) => !o.juist);
  });
  return { eerste, vraag: 0, antwoorden: leeg(), oefenronde: true };
}

export function checkReducer(t: CheckLesToestand, a: CheckLesActie): CheckLesToestand {
  switch (a.type) {
    case 'kies': {
      const v = CHECKS_4[t.vraag];
      // Klaar, al beantwoord (ook dubbel tikken) of geen bestaande keuze: niets.
      if (!v || t.antwoorden[t.vraag] !== null) return t;
      if (!Number.isInteger(a.keuze) || a.keuze < 0 || a.keuze >= v.opties.length) return t;
      const antwoorden = t.antwoorden.slice();
      antwoorden[t.vraag] = a.keuze;
      const eerste = t.eerste[t.vraag] === null ? t.eerste.map((e, i) => (i === t.vraag ? a.keuze : e)) : t.eerste;
      return { ...t, antwoorden, eerste };
    }
    case 'volgende':
      return t.vraag < AANTAL_VRAGEN && t.antwoorden[t.vraag] !== null ? { ...t, vraag: t.vraag + 1 } : t;
    case 'opnieuw':
      // Alleen na de laatste vraag; het eerste antwoord blijft staan.
      return t.vraag >= AANTAL_VRAGEN ? { ...t, vraag: 0, antwoorden: leeg(), oefenronde: true } : t;
  }
}

export function huidigeVraag(t: CheckLesToestand): CheckVraag | null {
  return CHECKS_4[t.vraag] ?? null;
}

export function isKlaar(t: CheckLesToestand): boolean {
  return t.vraag >= AANTAL_VRAGEN;
}

/** Het nakijken van het antwoord van deze ronde bij vraag `i` (null als ze nog niet beantwoord is). */
export function uitkomstBij(t: CheckLesToestand, i: number): CheckUitkomst | null {
  const v = CHECKS_4[i];
  const keuze = t.antwoorden[i];
  return v && keuze !== null && keuze !== undefined ? kijkCheckNa(v, keuze, false) : null;
}

/**
 * In een oefenronde: wat het eerste antwoord van deze vraag was, met de zin 'Je eerste antwoord telt: …'.
 * Null in de eerste ronde of als er geen eerder antwoord is.
 */
export function eersteAntwoordBij(t: CheckLesToestand, i: number): CheckUitkomst | null {
  const v = CHECKS_4[i];
  const keuze = t.eerste[i];
  return t.oefenronde && v && keuze !== null && keuze !== undefined ? kijkCheckNa(v, keuze, true) : null;
}

/** De bewijzen van de check: per beantwoorde vraag het eerste antwoord, ook als het kind daarna opnieuw probeert. */
export function checkBewijzen(t: CheckLesToestand): BewijsMelding[] {
  const uit: BewijsMelding[] = [];
  CHECKS_4.forEach((v, i) => {
    const keuze = t.eerste[i];
    if (keuze === null || keuze === undefined) return;
    const b = kijkCheckNa(v, keuze).bewijs;
    uit.push({ id: v.id, juist: b.juist, fout: b.fout });
  });
  return uit;
}
