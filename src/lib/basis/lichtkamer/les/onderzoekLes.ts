// 'Onderzoek: lamp dichterbij, schaduw groter?': de lesmachine. Zuiver. De hypothese kiezen, de lamp op 30, 15 en 10 cm
// zetten, drie metingen als tekst typen, een conclusie kiezen en nakijken. Het nakijken zelf (kijkOnderzoekNa) en het
// lezen van de tekst (leesMeting) staan in ../onderzoek en ../meting.

import { CONCLUSIES, HYPOTHESEN, STANDAARD_AFSTANDEN, kijkOnderzoekNa, type Conclusie, type Hypothese, type OnderzoekUitkomst } from '../onderzoek';
import type { Voorwerp } from '../schaduw';
import { ONDERZOEK_MAX_CM, ONDERZOEK_MIN_CM, volgendeAfstand, type SceneToestand } from '../kijkdoos/toestand';
import type { BewijsGeheugen, BewijsMelding } from './bewijsOntvanger';

/** Langer dan dit hoeft een getypte meting niet te zijn. */
export const MAX_METING_TEKENS = 12;

export type OnderzoekLesToestand = {
  voorwerp: Voorwerp;
  /** Waar de lamp nu staat (afstand lens-voorwerp in cm). */
  afstandCm: number;
  hypothese: Hypothese | null;
  /** De metingen zoals het kind ze typte, per afstand. */
  metingen: Readonly<Record<number, string>>;
  conclusie: Conclusie | null;
  /** Het laatste nakijken; verdwijnt als het kind daarna iets verandert. */
  uitkomst: OnderzoekUitkomst | null;
  /** Wat het nakijken aan bewijs opleverde; het laatste telt per bewijs-id (een oefening). */
  bewijzen: Readonly<Record<string, BewijsGeheugen>>;
};

export type OnderzoekLesActie =
  | { type: 'afstand'; cm: number }
  | { type: 'stap'; richting: 'dichter' | 'verder' }
  | { type: 'hypothese'; hypothese: Hypothese }
  | { type: 'meting'; cm: number; tekst: string }
  | { type: 'conclusie'; conclusie: Conclusie }
  | { type: 'nakijken' }
  | { type: 'opnieuw' };

export function beginOnderzoekLes(voorwerp: Voorwerp = 'boom'): OnderzoekLesToestand {
  return {
    voorwerp,
    afstandCm: ONDERZOEK_MAX_CM,
    hypothese: null,
    metingen: Object.fromEntries(STANDAARD_AFSTANDEN.map((cm) => [cm, ''])),
    conclusie: null,
    uitkomst: null,
    bewijzen: {},
  };
}

const klem = (v: number) => Math.max(ONDERZOEK_MIN_CM, Math.min(ONDERZOEK_MAX_CM, v));

export function onderzoekReducer(t: OnderzoekLesToestand, a: OnderzoekLesActie): OnderzoekLesToestand {
  switch (a.type) {
    case 'afstand': {
      if (typeof a.cm !== 'number' || !Number.isFinite(a.cm)) return t;
      const cm = klem(a.cm);
      return cm === t.afstandCm ? t : { ...t, afstandCm: cm };
    }
    case 'stap': {
      const cm = volgendeAfstand(t.afstandCm, a.richting === 'dichter' ? 'dichter' : 'verder');
      return cm === t.afstandCm ? t : { ...t, afstandCm: cm };
    }
    case 'hypothese':
      if (!HYPOTHESEN.includes(a.hypothese)) return t;
      return { ...t, hypothese: a.hypothese, uitkomst: null };
    case 'meting': {
      if (!STANDAARD_AFSTANDEN.includes(a.cm) || typeof a.tekst !== 'string') return t;
      const tekst = a.tekst.slice(0, MAX_METING_TEKENS);
      if (t.metingen[a.cm] === tekst) return t;
      return { ...t, metingen: { ...t.metingen, [a.cm]: tekst }, uitkomst: null };
    }
    case 'conclusie':
      if (!CONCLUSIES.includes(a.conclusie)) return t;
      return { ...t, conclusie: a.conclusie, uitkomst: null };
    case 'nakijken': {
      const uitkomst = kijkOnderzoekNa({ voorwerp: t.voorwerp, metingen: t.metingen, hypothese: t.hypothese, conclusie: t.conclusie });
      const bewijzen: Record<string, BewijsGeheugen> = { ...t.bewijzen };
      for (const b of uitkomst.bewijzen) bewijzen[b.id] = { juist: b.juist, fout: b.fout };
      return { ...t, uitkomst, bewijzen };
    }
    case 'opnieuw':
      return beginOnderzoekLes(t.voorwerp);
  }
}

/** Staat de lamp op (of vlak bij) de meetafstand `cm`? */
export function staatOp(t: OnderzoekLesToestand, cm: number): boolean {
  return Math.abs(t.afstandCm - cm) < 0.05;
}

export function onderzoekBewijzen(t: OnderzoekLesToestand): BewijsMelding[] {
  return Object.keys(t.bewijzen).map((id) => ({ id, juist: (t.bewijzen[id] as BewijsGeheugen).juist, fout: (t.bewijzen[id] as BewijsGeheugen).fout }));
}

export function onderzoekScene(t: OnderzoekLesToestand): SceneToestand {
  return { scene: 'onderzoek', afstandCm: t.afstandCm };
}
