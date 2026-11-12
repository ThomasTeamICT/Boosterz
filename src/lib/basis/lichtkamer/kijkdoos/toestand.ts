// Wat de kijkdoos toont: de oefening en haar stand. Zuiver: geen three.js, geen DOM.
//
// De panelen (LK-6) houden de toestand van een oefening bij met de lichtlogica (src/lib/basis/lichtkamer/) en zeggen de
// kijkdoos wat ze moet tonen. Wat het kind in de kijkdoos zelf doet (de lamp slepen, een pijltje), meldt de kijkdoos
// terug met dezelfde vorm.

import {
  LAMP_HOOGTES,
  NAAM_VOORWERP,
  RONDES,
  STANDAARD_AFSTANDEN,
  type KaartjesStand,
  type Voorwerp,
} from '..';

export type SceneNaam = 'voorspel' | 'kaartjes' | 'onderzoek';
export const SCENES: readonly SceneNaam[] = ['voorspel', 'kaartjes', 'onderzoek'];

export type SceneToestand =
  /** 'Waar valt de schaduw?': ronde 0 tot 2; `getoond` toont de schaduw en de lichtstralen. */
  | { scene: 'voorspel'; ronde: number; getoond: boolean }
  /** 'Drie kaartjes met een gaatje'. */
  | { scene: 'kaartjes'; stand: KaartjesStand }
  /** 'Onderzoek': de afstand tussen lens en voorwerp in cm (10 tot 30; slepen geeft ook tussenwaarden). */
  | { scene: 'onderzoek'; afstandCm: number };

export type Zicht = 'voor' | 'schuin' | 'opzij' | 'boven';
export const ZICHTEN: readonly Zicht[] = ['voor', 'schuin', 'opzij', 'boven'];

/** Het bereik van de lamp in het onderzoek, in cm tussen lens en voorwerp. */
export const ONDERZOEK_MIN_CM = Math.min(...STANDAARD_AFSTANDEN);
export const ONDERZOEK_MAX_CM = Math.max(...STANDAARD_AFSTANDEN);

const klem = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const geheel = (v: unknown, a: number, b: number, standaard: number) =>
  typeof v === 'number' && Number.isFinite(v) ? klem(Math.round(v), a, b) : standaard;

/** Een geldige toestand, wat er ook binnenkomt: rondes, gaatjes en afstanden binnen hun bereik. */
export function normaliseer(t: SceneToestand): SceneToestand {
  switch (t.scene) {
    case 'voorspel':
      return { scene: 'voorspel', ronde: geheel(t.ronde, 0, RONDES.length - 1, 0), getoond: t.getoond === true };
    case 'kaartjes': {
      const g = Array.isArray(t.stand?.gaten) ? t.stand.gaten : [0, 2, 1];
      return {
        scene: 'kaartjes',
        stand: {
          lamp: geheel(t.stand?.lamp, 0, LAMP_HOOGTES.length - 1, 2),
          gaten: [geheel(g[0], 0, 2, 0), geheel(g[1], 0, 2, 2), geheel(g[2], 0, 2, 1)],
        },
      };
    }
    case 'onderzoek': {
      const cm = typeof t.afstandCm === 'number' && Number.isFinite(t.afstandCm) ? t.afstandCm : ONDERZOEK_MAX_CM;
      return { scene: 'onderzoek', afstandCm: klem(cm, ONDERZOEK_MIN_CM, ONDERZOEK_MAX_CM) };
    }
  }
}

export function zelfdeToestand(a: SceneToestand, b: SceneToestand): boolean {
  if (a.scene !== b.scene) return false;
  if (a.scene === 'voorspel' && b.scene === 'voorspel') return a.ronde === b.ronde && a.getoond === b.getoond;
  if (a.scene === 'kaartjes' && b.scene === 'kaartjes')
    return a.stand.lamp === b.stand.lamp && a.stand.gaten.every((g, i) => g === b.stand.gaten[i]);
  if (a.scene === 'onderzoek' && b.scene === 'onderzoek') return Math.abs(a.afstandCm - b.afstandCm) < 1e-9;
  return false;
}

/** De afstand na een pijltje in het onderzoek: naar de vorige of volgende meetafstand (30, 15, 10 cm). */
export function volgendeAfstand(nu: number, richting: 'dichter' | 'verder', afstanden: readonly number[] = STANDAARD_AFSTANDEN): number {
  const lijst = [...afstanden].sort((a, b) => a - b);
  const r = Math.round(nu);
  let i = lijst.indexOf(r);
  // Staat de lamp tussen twee meetafstanden (na het slepen), dan gaat een pijltje naar de dichtstbijzijnde in die richting.
  if (i < 0) {
    if (richting === 'dichter') {
      const kleiner = lijst.filter((a) => a < nu);
      return kleiner.length ? (kleiner[kleiner.length - 1] as number) : (lijst[0] as number);
    }
    const groter = lijst.filter((a) => a > nu);
    return groter.length ? (groter[0] as number) : (lijst[lijst.length - 1] as number);
  }
  i = richting === 'dichter' ? Math.max(0, i - 1) : Math.min(lijst.length - 1, i + 1);
  return lijst[i] as number;
}

/** De toegankelijke naam van de kijkdoos per oefening (zoals canvasLabel in het prototype, met 30, 15 en 10 cm). */
export function kijkdoosLabel(t: SceneToestand, voorwerp: Voorwerp): string {
  const naam = NAAM_VOORWERP[voorwerp];
  switch (t.scene) {
    case 'voorspel':
      return `Lichtkamer. Een zaklamp schijnt op het ${naam} voor een scherm met de letters A, B en C. De zaklamp staat vast.`;
    case 'kaartjes':
      return 'Lichtkamer, van opzij. Een zaklamp, drie kaartjes met een gaatje en een scherm. Pijltje omhoog en omlaag zetten de zaklamp hoger of lager. De gaatjes verzet je met de knoppen bij de oefening.';
    case 'onderzoek': {
      const a = [...STANDAARD_AFSTANDEN].sort((x, y) => x - y);
      const lijst = `${a.slice(0, -1).join(', ')} of ${a[a.length - 1]}`;
      return `Lichtkamer. Een zaklamp, het ${naam}, een scherm en een meetlat. Pijltje omhoog en omlaag zetten de zaklamp op ${lijst} centimeter.`;
    }
  }
}
