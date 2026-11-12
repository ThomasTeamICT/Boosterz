// 'Waar valt de schaduw?': de lesmachine van de drie rondes. Zuiver: een toestand, acties en een reducer, zonder DOM,
// klok of opslag. Het paneel vertaalt tikken en toetsen naar deze acties en toont de toestand.

import { RONDES, beoordeelRonde, maakRonde, plaatsVan, rondesBewijs, LETTERS, type Ronde, type RondeUitkomst } from '../rondes';
import type { Voorwerp } from '../schaduw';
import type { SceneToestand } from '../kijkdoos/toestand';
import type { BewijsMelding } from './bewijsOntvanger';

export const AANTAL_RONDES = RONDES.length;

export type VoorspelToestand = {
  voorwerp: Voorwerp;
  /** 0 tot en met AANTAL_RONDES - 1. */
  ronde: number;
  /** De eerste keuze (0 tot 2: A, B of C) per ronde; null zolang er niet gekozen is. */
  keuzes: readonly (number | null)[];
  /** De uitkomst van de huidige ronde (schaduw en lichtstralen) staat in beeld. */
  getoond: boolean;
};

export type VoorspelActie =
  | { type: 'kies'; letter: number }
  /** De uitkomst tonen zonder keuze (de klasvraag en de spatie op het bord). */
  | { type: 'toon' }
  | { type: 'volgende' }
  | { type: 'opnieuw' };

export function beginVoorspel(voorwerp: Voorwerp = 'boom'): VoorspelToestand {
  return { voorwerp, ronde: 0, keuzes: RONDES.map(() => null), getoond: false };
}

export function voorspelReducer(t: VoorspelToestand, a: VoorspelActie): VoorspelToestand {
  switch (a.type) {
    case 'kies': {
      // Eén keuze per ronde: het eerste tikken telt, een tweede (of dubbel tikken) doet niets.
      if (t.getoond || t.keuzes[t.ronde] !== null) return t;
      if (!Number.isInteger(a.letter) || a.letter < 0 || a.letter >= LETTERS.length) return t;
      const keuzes = t.keuzes.slice();
      keuzes[t.ronde] = a.letter;
      return { ...t, keuzes, getoond: true };
    }
    case 'toon':
      return t.getoond ? t : { ...t, getoond: true };
    case 'volgende':
      return kanVolgende(t) ? { ...t, ronde: t.ronde + 1, getoond: false } : t;
    case 'opnieuw':
      return beginVoorspel(t.voorwerp);
  }
}

export function huidigeRonde(t: VoorspelToestand): Ronde {
  return maakRonde(t.ronde, t.voorwerp);
}

/** Naar de volgende ronde kan pas als de uitkomst van deze ronde getoond is. */
export function kanVolgende(t: VoorspelToestand): boolean {
  return t.getoond && t.ronde < AANTAL_RONDES - 1;
}

/** De laatste ronde is getoond: de oefening is af. */
export function isAf(t: VoorspelToestand): boolean {
  return t.getoond && t.ronde === AANTAL_RONDES - 1;
}

/** Het nakijken van de keuze van de huidige ronde; null als er (nog) niet gekozen is. */
export function uitkomstVan(t: VoorspelToestand): RondeUitkomst | null {
  const keuze = t.keuzes[t.ronde];
  return keuze === null || keuze === undefined ? null : beoordeelRonde(huidigeRonde(t), keuze);
}

/** Waar de letters staan, voor wie het beeld niet ziet ('links', 'rechts', 'in het midden'). */
export function letterPlaats(t: VoorspelToestand, i: number): string {
  return plaatsVan(huidigeRonde(t), i);
}

/** De letter die juist was, als de uitkomst getoond is. */
export function juisteLetter(t: VoorspelToestand): number {
  return huidigeRonde(t).juistIdx;
}

/** Het bewijs '4-voorspel': pas na drie gekozen rondes (minstens twee juist telt als juist). */
export function voorspelBewijs(t: VoorspelToestand): BewijsMelding | null {
  if (t.keuzes.some((k) => k === null)) return null;
  const uitkomsten = t.keuzes.map((k, r) => beoordeelRonde(maakRonde(r, t.voorwerp), k as number));
  const b = rondesBewijs(uitkomsten);
  return { id: '4-voorspel', juist: b.juist, fout: b.fout };
}

export function voorspelScene(t: VoorspelToestand): SceneToestand {
  return { scene: 'voorspel', ronde: t.ronde, getoond: t.getoond };
}
