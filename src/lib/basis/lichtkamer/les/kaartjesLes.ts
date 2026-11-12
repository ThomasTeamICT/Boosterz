// 'Drie kaartjes met een gaatje': de lesmachine. Zuiver. De gaatjes en de lamp verzetten, en de gevonden oplossingen
// bijhouden tot 'Ook schuin lukt het!'. De lichtlogica zelf staat in ../kaartjes.

import {
  LAMP_HOOGTES,
  beginStand,
  gaatNaam,
  isSchuin,
  kaartjesFeedback,
  lichtKomtDoor,
  oplossingSleutel,
  zetGat,
  zetLamp,
  type KaartjesFeedback,
  type KaartjesStand,
} from '../kaartjes';
import type { SceneToestand } from '../kijkdoos/toestand';
import type { BewijsMelding } from './bewijsOntvanger';

export type KaartjesLesToestand = {
  stand: KaartjesStand;
  /** De sleutels van de oplossingen die het kind vond, in de volgorde van vinden, zonder dubbele. */
  oplossingen: readonly string[];
};

export type KaartjesLesActie =
  /** Gaatje `i` (0 = bij het scherm, 2 = bij de lamp) hoger (d = 1) of lager (d = -1). */
  | { type: 'gat'; i: number; d: number }
  | { type: 'lamp'; d: number }
  /** De kijkdoos meldt een stand (het kind sleepte de lamp of drukte een pijltje op de kijkdoos). */
  | { type: 'zet'; stand: KaartjesStand }
  | { type: 'opnieuw' };

/** De rijen van het paneel, van de lamp naar het scherm: index in `stand.gaten` en de naam van het kaartje. */
export const KAARTJES_RIJEN: readonly { i: 0 | 1 | 2; naam: string }[] = [
  { i: 2, naam: '1 (bij de lamp)' },
  { i: 1, naam: '2' },
  { i: 0, naam: '3 (bij het scherm)' },
];

function metOplossing(stand: KaartjesStand, oplossingen: readonly string[]): readonly string[] {
  if (!lichtKomtDoor(stand)) return oplossingen;
  const s = oplossingSleutel(stand);
  return oplossingen.includes(s) ? oplossingen : [...oplossingen, s];
}

export function beginKaartjesLes(): KaartjesLesToestand {
  const stand = beginStand();
  return { stand, oplossingen: metOplossing(stand, []) };
}

const zelfdeStand = (a: KaartjesStand, b: KaartjesStand): boolean => a.lamp === b.lamp && a.gaten.every((g, i) => g === b.gaten[i]);

function isGeldigeStand(s: unknown): s is KaartjesStand {
  if (typeof s !== 'object' || s === null) return false;
  const { lamp, gaten } = s as KaartjesStand;
  return (
    Number.isInteger(lamp) &&
    lamp >= 0 &&
    lamp < LAMP_HOOGTES.length &&
    Array.isArray(gaten) &&
    gaten.length === 3 &&
    gaten.every((g) => Number.isInteger(g) && g >= 0 && g <= 2)
  );
}

function metStand(t: KaartjesLesToestand, stand: KaartjesStand): KaartjesLesToestand {
  if (zelfdeStand(t.stand, stand)) return t;
  return { stand, oplossingen: metOplossing(stand, t.oplossingen) };
}

export function kaartjesReducer(t: KaartjesLesToestand, a: KaartjesLesActie): KaartjesLesToestand {
  switch (a.type) {
    case 'gat':
      if (!Number.isInteger(a.i) || a.i < 0 || a.i > 2 || !Number.isFinite(a.d)) return t;
      return metStand(t, zetGat(t.stand, a.i, a.d));
    case 'lamp':
      if (!Number.isFinite(a.d)) return t;
      return metStand(t, zetLamp(t.stand, a.d));
    case 'zet':
      return isGeldigeStand(a.stand) ? metStand(t, { lamp: a.stand.lamp, gaten: [a.stand.gaten[0], a.stand.gaten[1], a.stand.gaten[2]] }) : t;
    case 'opnieuw':
      return beginKaartjesLes();
  }
}

export function lichtDoor(t: KaartjesLesToestand): boolean {
  return lichtKomtDoor(t.stand);
}

/** De terugkoppeling bij de huidige stand (null als er nog niets te zeggen valt). */
export function kaartjesTerugkoppeling(t: KaartjesLesToestand): KaartjesFeedback {
  return kaartjesFeedback(t.stand, new Set(t.oplossingen));
}

/** Het kind vond een schuine oplossing: dan telt het bewijs '4-kaartjes'. */
export function schuinGevonden(t: KaartjesLesToestand): boolean {
  return t.oplossingen.some(isSchuin);
}

export function kaartjesBewijs(t: KaartjesLesToestand): BewijsMelding | null {
  return schuinGevonden(t) ? { id: '4-kaartjes', juist: true, fout: null } : null;
}

/** De stand van gaatje `i` in woorden voor in het paneel: 'laag', 'midden' of 'hoog'. */
export function gaatTekst(t: KaartjesLesToestand, i: number): string {
  return gaatNaam(t.stand, i);
}

export function kaartjesScene(t: KaartjesLesToestand): SceneToestand {
  return { scene: 'kaartjes', stand: t.stand };
}
