// Het leerjaar dat een leerkracht in het deel basisonderwijs koos (gewoon of buitengewoon, K1 tot L6), per toestel
// onthouden onder één sleutel: wf.basis.keuze.v1 = {"v":1,"soort":"bao","leerjaar":"L3"}.
//
// Bewust niet in storage.ts of de voorkeuren: die horen bij het leerlingpad. Alles zit in try/catch (een geblokkeerde of
// volle opslag mag niets breken) en wat gelezen wordt, wordt gecontroleerd. De naam bevat geen 'klas': dat woord blijft
// vrij voor de echte klas met kinderen (bouwstap 4). Bewaard wordt alleen bij een uitdrukkelijke keuze, nooit uit een
// gedeelde link; zoekvragen, bezochte vakken of het schooljaar worden nooit bewaard.

import { LEERJAREN_BASIS, type LeerjaarBasis, type SoortBasis } from './kalender';

export const KEUZE_SLEUTEL = 'wf.basis.keuze.v1';

export interface BasisKeuze {
  soort: SoortBasis;
  leerjaar: LeerjaarBasis;
}

const SOORTEN: readonly SoortBasis[] = ['bao', 'bubao'];

/** De geldige keuze in een onbekende waarde (al of niet al uit JSON gelezen); extra velden vallen weg. */
export function saneerKeuze(x: unknown): BasisKeuze | undefined {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return undefined;
  const soort = SOORTEN.find((s) => s === o.soort);
  const leerjaar = LEERJAREN_BASIS.find((l) => l === o.leerjaar);
  return soort && leerjaar ? { soort, leerjaar } : undefined;
}

/** De bewaarde keuze; undefined als er geen is, ze kapot is of de opslag niet te bereiken is. */
export function leesKeuze(opslag?: Pick<Storage, 'getItem'>): BasisKeuze | undefined {
  try {
    const ruw = (opslag ?? localStorage).getItem(KEUZE_SLEUTEL);
    if (ruw === null || ruw === undefined) return undefined;
    return saneerKeuze(JSON.parse(ruw));
  } catch {
    return undefined;
  }
}

/** Bewaart de keuze exact als {"v":1,"soort":..,"leerjaar":..}. Geeft false als dat niet lukte (of de keuze ongeldig is). */
export function bewaarKeuze(k: BasisKeuze, opslag?: Pick<Storage, 'setItem'>): boolean {
  try {
    const gezuiverd = saneerKeuze({ v: 1, soort: k.soort, leerjaar: k.leerjaar });
    if (!gezuiverd) return false;
    (opslag ?? localStorage).setItem(KEUZE_SLEUTEL, JSON.stringify({ v: 1, soort: gezuiverd.soort, leerjaar: gezuiverd.leerjaar }));
    return true;
  } catch {
    return false;
  }
}

/** Vergeet de keuze. */
export function wisKeuze(opslag?: Pick<Storage, 'removeItem'>): void {
  try {
    (opslag ?? localStorage).removeItem(KEUZE_SLEUTEL);
  } catch {
    // niets te doen: zonder opslag is er ook niets te wissen
  }
}
