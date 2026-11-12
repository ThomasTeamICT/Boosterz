// De klasvraag op het bord: de klas toont met vingers wat ze kiest, de leerkracht tikt dat aan en toont de uitkomst.
// Zuiver: de toestand van de dialoog en de teksten. De timer (sluiten na 4,5 s) en de focus zijn van de component.

import { lichtKomtDoor, type KaartjesStand } from '../kaartjes';
import { maakRonde } from '../rondes';
import type { LesOefening } from '../lesmateriaal';
import type { Voorwerp } from '../schaduw';
import { KLASVRAAG_TEKST } from './teksten';

export type KlasvraagToestand = {
  open: boolean;
  /** Het aantal keuzes van de vraag die openstaat. */
  aantal: number;
  /** Wat de klas het meest koos (index), of null. */
  gekozen: number | null;
  /** De uitkomst is getoond: de keuzes staan vast. */
  getoond: boolean;
};

export type KlasvraagActie =
  | { type: 'open'; aantal: number }
  | { type: 'kies'; i: number }
  | { type: 'toon' }
  /** 'Volgende ronde': de dialoog blijft open voor de volgende ronde. */
  | { type: 'volgende' }
  /** Naar een nieuwe ronde, ook als de uitkomst nog niet getoond was (het paneel ging door terwijl de dialoog openstond). */
  | { type: 'reset' }
  | { type: 'sluit' };

export const KLASVRAAG_GESLOTEN: KlasvraagToestand = { open: false, aantal: 0, gekozen: null, getoond: false };

/** Na 'Toon de uitkomst' sluit de dialoog vanzelf na zoveel milliseconden, behalve in de prikkelarme stand. */
export const SLUIT_NA_MS = 4500;
export function sluitNaMs(prikkelarm: boolean): number | null {
  return prikkelarm ? null : SLUIT_NA_MS;
}

export function klasvraagReducer(t: KlasvraagToestand, a: KlasvraagActie): KlasvraagToestand {
  switch (a.type) {
    case 'open':
      if (!Number.isInteger(a.aantal) || a.aantal < 2) return t;
      return t.open ? t : { open: true, aantal: a.aantal, gekozen: null, getoond: false };
    case 'kies':
      // Aantikken wat de klas koos kan tot de uitkomst getoond is; opnieuw tikken verandert de keuze.
      if (!t.open || t.getoond || !Number.isInteger(a.i) || a.i < 0 || a.i >= t.aantal) return t;
      return t.gekozen === a.i ? t : { ...t, gekozen: a.i };
    case 'toon':
      return t.open && !t.getoond ? { ...t, getoond: true } : t;
    case 'volgende':
      return t.open && t.getoond ? { open: true, aantal: t.aantal, gekozen: null, getoond: false } : t;
    case 'reset':
      return t.open && (t.getoond || t.gekozen !== null) ? { open: true, aantal: t.aantal, gekozen: null, getoond: false } : t;
    case 'sluit':
      return t.open ? KLASVRAAG_GESLOTEN : t;
  }
}

/**
 * Wat de klasvraag mee moet doen als het paneel van 'Waar valt de schaduw?' een actie krijgt, zolang de klasvraag openstaat:
 * een keuze of de uitkomst in het paneel toont de uitkomst ook in de dialoog, een volgende ronde (of opnieuw beginnen) zet
 * de dialoog terug naar een nieuwe, nog niet getoonde ronde. Zo lopen paneel en dialoog nooit uit elkaar.
 */
export function klasvraagActiesBij(actie: { type: string }, open: boolean): KlasvraagActie[] {
  if (!open) return [];
  switch (actie.type) {
    case 'kies':
    case 'toon':
      return [{ type: 'toon' }];
    case 'volgende':
    case 'opnieuw':
      return [{ type: 'reset' }];
    default:
      return [];
  }
}

export type Klasvraag = {
  tekst: string;
  opties: readonly string[];
  /** Wat op de knop staat: de letter, of het nummer met het woord erbij. */
  keuzes: readonly string[];
  /** De zin onder de vraag: 'Iedereen kiest eerst: A, B of C. Tik dan aan wat de klas het meest koos.' */
  uitleg: string;
  juist: number;
  /** Er is een volgende ronde na deze (alleen 'Waar valt de schaduw?'). */
  metVolgende: boolean;
};

const opsomming = (l: readonly string[]): string => (l.length > 1 ? `${l.slice(0, -1).join(', ')} of ${l[l.length - 1]}` : (l[0] ?? ''));

/** De klasvraag bij een oefening, of null als die oefening er geen heeft (het onderzoek). */
export function klasvraagVoor(
  oefening: LesOefening,
  context: { voorwerp: Voorwerp; ronde: number; aantalRondes: number; kaartjes: KaartjesStand },
): Klasvraag | null {
  if (oefening === 'onderzoek-schaduw') return null;
  const basis = KLASVRAAG_TEKST[oefening];
  const kort = basis.opties.every((o) => o.length <= 8);
  const keuzes = basis.opties.map((o, i) => (o.length === 1 ? o : kort ? `${i + 1} (${o.toLowerCase()})` : String(i + 1)));
  const juist = oefening === 'waar-valt-de-schaduw' ? maakRonde(context.ronde, context.voorwerp).juistIdx : lichtKomtDoor(context.kaartjes) ? 0 : 1;
  return {
    tekst: basis.tekst,
    opties: basis.opties,
    keuzes,
    uitleg: `Iedereen kiest eerst: ${opsomming(keuzes)}. Tik dan aan wat de klas het meest koos.`,
    juist,
    metVolgende: oefening === 'waar-valt-de-schaduw' && context.ronde < context.aantalRondes - 1,
  };
}
