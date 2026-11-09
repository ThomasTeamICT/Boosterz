// De leeftijdsgroepen van het GO! en de leesbril naar de leerjaren van de app (docs/basisonderwijs/GO-LEERPLAN.md,
// "Leeftijden").
//
// Het GO! deelt zijn leerplan in per leeftijd, niet per leerjaar: negen groepen, van 2,5-4 tot 11-12 jaar. Zo staan ze
// in de kolommen van de doelensets, tussen haakjes in de lesplannen en in de diplomakoppen. De leesbril naar K1-L6 is
// een eigen lezing van Boosterz, met zekerheid 'waarschijnlijk': overal staat eerst de leeftijd van het GO!, pas
// daarna 'meestal …'. Een koppeling naar een minimumdoel wordt nooit uit een leeftijd afgeleid; de leeftijden dienen
// alleen om een officiële koppeling met twijfel te melden (momentPastBijLeeftijden).
import { LEERJAREN_BASIS, WERKT_NAAR, type Eindmoment, type LeerjaarBasis, type Zekerheid } from '../kalender';
import type { GoLeeftijd, GoMoment } from './types';

/** De negen groepen, in volgorde. */
export const GO_LEEFTIJDEN: readonly GoLeeftijd[] = ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12'];

export function isGoLeeftijd(v: unknown): v is GoLeeftijd {
  return typeof v === 'string' && (GO_LEEFTIJDEN as readonly string[]).includes(v);
}

/** '2,5-4 jaar'. */
export function leeftijdLabel(l: GoLeeftijd): string {
  return `${l} jaar`;
}

/** '2,5-4 jaar, 4-5 jaar': zo staan de leeftijden tussen haakjes achter een doel in een lesplan. */
export function leeftijdenLabel(ls: readonly GoLeeftijd[]): string {
  return ls.map(leeftijdLabel).join(', ');
}

/** Negatief als a voor b komt. */
export function vergelijkLeeftijden(a: GoLeeftijd, b: GoLeeftijd): number {
  return GO_LEEFTIJDEN.indexOf(a) - GO_LEEFTIJDEN.indexOf(b);
}

/** Geldige leeftijden, zonder dubbels en in de volgorde van GO_LEEFTIJDEN. Leeg mag. */
export function isLeeftijdenlijst(v: unknown): v is GoLeeftijd[] {
  if (!Array.isArray(v)) return false;
  let vorige = -1;
  for (const l of v) {
    if (!isGoLeeftijd(l)) return false;
    const i = GO_LEEFTIJDEN.indexOf(l);
    if (i <= vorige) return false;
    vorige = i;
  }
  return true;
}

// ── De leesbril ──────────────────────────────────────────────────────
export interface GoLeesbrilRegel {
  leeftijd: GoLeeftijd;
  /** Het leerjaar van de app. De app kent geen instapklas als leerjaar: 2,5-4 hoort bij K1. */
  leerjaar: LeerjaarBasis;
  /** De klas van de meeste kinderen van die leeftijd, zonder 'meestal'. */
  meestal: string;
}

/** De negen regels (één per groep, één per leerjaar). Eén test legt ze vast. */
export const GO_LEESBRIL: readonly GoLeesbrilRegel[] = [
  { leeftijd: '2,5-4', leerjaar: 'K1', meestal: 'instapklas en 1ste kleuterklas' },
  { leeftijd: '4-5', leerjaar: 'K2', meestal: '2de kleuterklas' },
  { leeftijd: '5-6', leerjaar: 'K3', meestal: '3de kleuterklas' },
  { leeftijd: '6-7', leerjaar: 'L1', meestal: '1ste leerjaar' },
  { leeftijd: '7-8', leerjaar: 'L2', meestal: '2de leerjaar' },
  { leeftijd: '8-9', leerjaar: 'L3', meestal: '3de leerjaar' },
  { leeftijd: '9-10', leerjaar: 'L4', meestal: '4de leerjaar' },
  { leeftijd: '10-11', leerjaar: 'L5', meestal: '5de leerjaar' },
  { leeftijd: '11-12', leerjaar: 'L6', meestal: '6de leerjaar' },
];

/** De zekerheid van de leesbril: altijd 'waarschijnlijk' (ZekerheidBadge). */
export const GO_LEESBRIL_ZEKERHEID: Zekerheid = 'waarschijnlijk';

/** Onder 'Hoe zeker is dit?'. */
export const GO_LEESBRIL_UITLEG =
  'Het GO! deelt zijn leerplan in per leeftijd. Welk leerjaar dat is, hangt af van het kind; dit is de leeftijd van de meeste kinderen in dat leerjaar.';

function regelVanLeeftijd(l: GoLeeftijd): GoLeesbrilRegel {
  const r = GO_LEESBRIL.find((x) => x.leeftijd === l);
  if (!r) throw new Error(`Geen leesbril voor de leeftijd ${String(l)}.`);
  return r;
}

/** Eén adres per groep: het gekozen leerjaar bepaalt de leeftijdsgroep (K1 → 2,5-4). */
export function leeftijdVanLeerjaar(lj: LeerjaarBasis): GoLeeftijd {
  const r = GO_LEESBRIL.find((x) => x.leerjaar === lj);
  if (!r) throw new Error(`Geen leeftijdsgroep voor het leerjaar ${String(lj)}.`);
  return r.leeftijd;
}

/** Omgekeerd: 2,5-4 hoort alleen bij K1. */
export function leerjaarVanLeeftijd(l: GoLeeftijd): LeerjaarBasis {
  return regelVanLeeftijd(l).leerjaar;
}

/** 'meestal instapklas en 1ste kleuterklas': altijd na de leeftijd van het GO!, met de badge 'waarschijnlijk'. */
export function meestalTekst(l: GoLeeftijd): string {
  return `meestal ${regelVanLeeftijd(l).meestal}`;
}

// ── Moment en leeftijden ─────────────────────────────────────────────
/** Het eindmoment van de app bij elke codekolom: KO → einde kleuter, L4 → einde 4de, L6 → einde 6de leerjaar. */
export const EINDMOMENT_VAN_GO_MOMENT: Readonly<Record<GoMoment, Eindmoment>> = { KO: 'K3', L4: 'L4', L6: 'L6' };

/** De leeftijdsgroepen waarvan het leerjaar naar het eindmoment van dit moment toewerkt (WERKT_NAAR in kalender.ts). */
export function leeftijdenVanMoment(m: GoMoment): GoLeeftijd[] {
  const eind = EINDMOMENT_VAN_GO_MOMENT[m];
  const leerjaren = new Set(LEERJAREN_BASIS.filter((lj) => WERKT_NAAR[lj] === eind));
  return GO_LEEFTIJDEN.filter((l) => leerjaren.has(leerjaarVanLeeftijd(l)));
}

/**
 * Past het moment van een koppeling bij de leeftijden van het doel? Ja als minstens één leeftijd naar dat eindmoment
 * toewerkt: KO bij 2,5-4, 4-5 of 5-6; L4 bij 6-7 tot 9-10; L6 bij 10-11 of 11-12 (rechtzetting 1 van de rechter: de
 * regel volgt WERKT_NAAR). Past het niet, dan blijft de koppeling officieel, met twijfel 'moment-buiten-leeftijden'.
 * Zonder leeftijden past niets.
 */
export function momentPastBijLeeftijden(m: GoMoment, leeftijden: readonly GoLeeftijd[]): boolean {
  const passend = leeftijdenVanMoment(m);
  return leeftijden.some((l) => passend.includes(l));
}
