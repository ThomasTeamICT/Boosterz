// De iconen en tinten van de tien vakken van het basisonderwijs. Bewust niet in src/components/icons.ts: dat bestand
// wordt op het leerlingpad geïmporteerd (A11yMenu), en deze iconen horen alleen bij het lui geladen basisdeel.

import {
  BookOpen,
  Brain,
  Calculator,
  Earth,
  FlaskConical,
  Handshake,
  HeartHandshake,
  Landmark,
  Languages,
  Monitor,
  Palette,
  PersonStanding,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { GoVak } from '../../lib/basis/go/types';

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

// ── De twaalf vakdisciplines van het GO! ─────────────────────────────────────
// Het GO! kent Burgerschap (BU), Leren leren (LL) en Sociale vaardigheden (SV) apart; in de minimumdoelen vallen ze onder
// 'Attitudes' (9). De tabellen hierboven blijven dus tien vakken groot; deze hebben er twaalf.

/** Het icoon per vak van het GO!. BU, LL en SV hebben een eigen icoon; de rest is het icoon van het vak van het minimumdoel. */
export const GO_VAK_ICONEN: Readonly<Record<GoVak, LucideIcon>> = {
  AA: VAK_ICONEN[4],
  BU: Users,
  FR: VAK_ICONEN[10],
  GE: VAK_ICONEN[5],
  IT: VAK_ICONEN[8],
  LL: Brain,
  LO: VAK_ICONEN[7],
  MV: VAK_ICONEN[6],
  NL: VAK_ICONEN[1],
  SV: Handshake,
  WI: VAK_ICONEN[2],
  WT: VAK_ICONEN[3],
};

/**
 * De tint per vak van het GO!, met dezelfde formule voor het vlak en het icoon als VAK_TINTEN. De negen vakken met een
 * vak van het minimumdoel houden hun tint; BU, LL en SV kregen een tint die ertussen valt. Het contrast staat in
 * src/pages/basis/goSchermen.test.ts.
 */
export const GO_VAK_TINTEN: Readonly<Record<GoVak, number>> = {
  AA: VAK_TINTEN[4],
  BU: 90,
  FR: VAK_TINTEN[10],
  GE: VAK_TINTEN[5],
  IT: VAK_TINTEN[8],
  LL: 305,
  LO: VAK_TINTEN[7],
  MV: VAK_TINTEN[6],
  NL: VAK_TINTEN[1],
  SV: 350,
  WI: VAK_TINTEN[2],
  WT: VAK_TINTEN[3],
};

export function goVakIcoon(vak: GoVak): LucideIcon {
  return GO_VAK_ICONEN[vak];
}

export function goVakTint(vak: GoVak): number {
  return GO_VAK_TINTEN[vak];
}
