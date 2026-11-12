// 'Waar valt de schaduw?': drie rondes met de letters A, B en C op het scherm. Zuivere code.

import { LENS_AFSTAND, SIL_TOP, VOORWERP_Z, beschrijfSchaduw, schaduwPunt, type Lamp, type Voorwerp } from './schaduw';

export const LETTERS = ['A', 'B', 'C'] as const;
export type Letter = (typeof LETTERS)[number];

/** De vaste lampstanden van de drie rondes (x en z met de handgreep erbij, zoals in het prototype). */
export const RONDES: ReadonlyArray<{ x: number; z: number }> = [
  { x: -1.2, z: 2.4 },
  { x: 1.0, z: 1.8 },
  { x: 0.5, z: 3.4 },
];

/** Per ronde de volgorde van [juist, aan de kant van de lamp, recht achter het voorwerp] over A, B en C. */
const VOLGORDE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [1, 0, 2],
  [2, 1, 0],
];

export type Ronde = {
  /** 0, 1 of 2. */
  ronde: number;
  lamp: Lamp;
  /** x-plaats van A, B en C op het scherm. */
  pos: [number, number, number];
  /** Hoogte waarop de letters hangen. */
  letterY: number;
  /** Index (0 tot 2) van de juiste letter. */
  juistIdx: number;
  /** Waar de schaduw echt valt (x op het scherm). */
  schaduwX: number;
};

/** De ronde zoals het prototype hem opzet: lamp, letters en de juiste letter. */
export function maakRonde(ronde: number, voorwerp: Voorwerp, lampHoogte = 0.5): Ronde {
  const r = RONDES[ronde];
  const volg = VOLGORDE[ronde];
  if (!r || !volg) throw new RangeError(`Ronde ${ronde} bestaat niet (0 tot ${RONDES.length - 1}).`);
  const lamp: Lamp = { x: r.x, y: lampHoogte, z: r.z };
  const top = SIL_TOP[voorwerp][0];
  const s = schaduwPunt({ x: lamp.x, y: lamp.y, z: lamp.z - LENS_AFSTAND }, 0, top[1] * 0.6, VOORWERP_Z);
  // juist, aan de kant van de lamp, recht achter het voorwerp
  const xs: [number, number, number] = [s.x, -s.x * 0.9, 0];
  if (Math.abs(s.x) < 0.35) {
    xs[1] = s.x + (lamp.x > 0 ? 1.0 : -1.0);
    xs[2] = s.x - (lamp.x > 0 ? 1.0 : -1.0);
  }
  const pos = volg.map((i) => xs[i] as number) as [number, number, number];
  return { ronde, lamp, pos, letterY: s.y + 0.1, juistIdx: volg.indexOf(0), schaduwX: s.x };
}

/** Waar een letter staat, in woorden. */
export function plaatsVan(r: Ronde, i: number): 'links' | 'rechts' | 'in het midden' {
  const x = r.pos[i] as number;
  return x < -0.35 ? 'links' : x > 0.35 ? 'rechts' : 'in het midden';
}

/** 'Op het scherm staan drie letters: A links, B in het midden, C rechts.' */
export function beschrijfLetters(r: Ronde): string {
  return `Op het scherm staan drie letters: ${LETTERS.map((L, i) => `${L} ${plaatsVan(r, i)}`).join(', ')}.`;
}

/** De zin die bij het openen van een ronde wordt voorgelezen: de lamp, en waar de letters staan. */
export function beschrijfRonde(r: Ronde, voorwerp: Voorwerp): string {
  return `${beschrijfSchaduw(r.lamp, voorwerp, true)} ${beschrijfLetters(r)}`;
}

export type RondeFout = 'schaduw aan de kant van de lamp' | 'andere fout';

export type RondeUitkomst = {
  juist: boolean;
  /** Een letter aan dezelfde kant als de lamp gekozen: het bekende denkfoutpatroon. */
  kantFout: boolean;
  fout: RondeFout | null;
  soort: 'ok' | 'warn';
  titel: string;
  uitleg: string;
};

export function beoordeelRonde(r: Ronde, keuze: number): RondeUitkomst {
  if (!Number.isInteger(keuze) || keuze < 0 || keuze >= LETTERS.length) throw new RangeError(`Keuze ${keuze} is geen letter (0 tot 2).`);
  const juist = keuze === r.juistIdx;
  const kantFout = !juist && Math.sign(r.pos[keuze] as number) === Math.sign(r.lamp.x);
  const uitleg = juist
    ? 'Het licht gaat rechtdoor langs het voorwerp. Achter het voorwerp komt geen licht: daar is de schaduw.'
    : kantFout
      ? 'De schaduw valt niet aan de kant van de lamp, maar aan de andere kant. Volg de rechte lijn van de lamp langs het voorwerp.'
      : 'Volg de rechte lijn van de lamp langs de top van het voorwerp tot op het scherm.';
  return {
    juist,
    kantFout,
    fout: juist ? null : kantFout ? 'schaduw aan de kant van de lamp' : 'andere fout',
    soort: juist ? 'ok' : 'warn',
    titel: juist ? 'Juist voorspeld.' : 'Kijk naar de lichtstralen.',
    uitleg,
  };
}

export type RondesBewijs = { juist: boolean; score: string; fout: RondeFout | null };

/** Het bewijs na drie rondes: minstens twee juist telt als juist; de eerste fout wordt onthouden. */
export function rondesBewijs(uitkomsten: ReadonlyArray<Pick<RondeUitkomst, 'juist' | 'fout'>>): RondesBewijs {
  const juist = uitkomsten.filter((u) => u.juist).length;
  const eersteFout = uitkomsten.find((u) => u.fout)?.fout ?? null;
  return { juist: juist >= 2, score: `${juist}/${RONDES.length}`, fout: eersteFout };
}
