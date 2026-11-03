// De iconen en tinten van de tien vakken van het basisonderwijs. Bewust niet in src/components/icons.ts: dat bestand
// wordt op het leerlingpad geïmporteerd (A11yMenu), en deze iconen horen alleen bij het lui geladen basisdeel.

import {
  BookOpen,
  Calculator,
  Earth,
  FlaskConical,
  HeartHandshake,
  Landmark,
  Languages,
  Monitor,
  Palette,
  PersonStanding,
  type LucideIcon,
} from 'lucide-react';

/** Het icoon per vaknummer (1 tot 10, zoals vakSlug in basisRoutes.ts). */
export const VAK_ICONEN: Readonly<Record<number, LucideIcon>> = {
  1: BookOpen, // Nederlands
  2: Calculator, // Wiskunde
  3: FlaskConical, // Wetenschap en techniek
  4: Earth, // Aardrijkskunde
  5: Landmark, // Geschiedenis
  6: Palette, // Muzische vorming
  7: PersonStanding, // Lichamelijke opvoeding
  8: Monitor, // ICT
  9: HeartHandshake, // Attitudes
  10: Languages, // Frans
};

/**
 * De tint (graden, voor --h van .b-vaktegel) per vaknummer. Vast, met de formule van de oefentegels: de contrasten
 * worden bewaakt in src/lib/basis/basisKleuren.test.ts.
 */
export const VAK_TINTEN: Readonly<Record<number, number>> = {
  1: 25, // Nederlands
  2: 255, // Wiskunde
  3: 150, // Wetenschap en techniek
  4: 195, // Aardrijkskunde
  5: 65, // Geschiedenis
  6: 330, // Muzische vorming
  7: 110, // Lichamelijke opvoeding
  8: 285, // ICT
  9: 0, // Attitudes
  10: 225, // Frans
};

/** Het icoon van een vak; een onbekend nummer krijgt het boek. */
export function vakIcoon(nr: number): LucideIcon {
  return VAK_ICONEN[nr] ?? BookOpen;
}

/** De tint van een vak; een onbekend nummer krijgt 285. */
export function vakTint(nr: number): number {
  return VAK_TINTEN[nr] ?? 285;
}
