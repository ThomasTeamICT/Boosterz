// De zes pictogrammen van de lesplannen van het GO! als Lucide-icoon (docs/basisonderwijs/GO-LEERPLAN.md, "Beelden").
// Bewust niet in src/components/icons.ts en niet in EAGER_ICON_NAMES: dit hoort bij het lui geladen basisdeel, niet bij
// het leerlingpad. De icoon heeft nooit een alt-tekst; er staat altijd een zichtbaar woord bij (zie GoTekst).

import { Award, Flag, Glasses, Lightbulb, Link2, Puzzle, type LucideIcon } from 'lucide-react';
import type { GoIcoon, Regel } from '../../../lib/basis/go/types';

export const GO_ICOON: Readonly<Record<GoIcoon, LucideIcon>> = {
  vlag: Flag,
  schakel: Link2,
  diploma: Award,
  deelconcept: Puzzle,
  'go-concept': Lightbulb,
  denklens: Glasses,
};

/** Het woord dat bij het icoon hoort: zo staat het zichtbaar naast het icoon als de tekst het niet zelf al heeft. */
export const GO_ICOON_WOORD: Readonly<Record<GoIcoon, string>> = {
  vlag: 'vlag',
  schakel: 'schakel',
  diploma: 'diploma',
  deelconcept: 'deelconcept',
  'go-concept': 'GO! concept',
  denklens: 'denklens',
};

/** Waarmee de tekst na het icoon begint als ze het woord zelf al zegt ('Diploma', 'Deelconcepten', 'Denklenzen'). */
const GO_ICOON_STAM: Readonly<Record<GoIcoon, string>> = {
  vlag: 'vlag',
  schakel: 'schakel',
  diploma: 'diploma',
  deelconcept: 'deelconcept',
  'go-concept': 'go! concept',
  denklens: 'denklen',
};

/** De eerste tekst na het icoon op plaats `n`, zonder witruimte; undefined als er geen komt vóór een regeleinde of icoon. */
export function tekstNaIcoon(regel: Regel, n: number): string | undefined {
  for (let i = n + 1; i < regel.length; i++) {
    const s = regel[i];
    if (!('t' in s)) return undefined;
    if (s.t.trim() !== '') return s.t.trimStart();
  }
  return undefined;
}

/** Een kop als 'Diploma' of 'Deelconcepten' begint met het woord zelf: dan hoort er niet nog een woord bij. */
export function beginMetWoord(icoon: GoIcoon, volgendeTekst: string | undefined): boolean {
  if (volgendeTekst === undefined) return false;
  return volgendeTekst.trimStart().toLowerCase().startsWith(GO_ICOON_STAM[icoon]);
}
