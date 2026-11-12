// Wat de gevel van de kijkdoos (index.ts) en de 3D-motor (kijkdoos3d.ts) elkaar doorgeven. Alleen types: geen three.

import type { Voorwerp } from '..';
import type { MeetVerslag } from './meet';
import type { Stand, StandKeuze } from './standen';
import type { SceneToestand, Zicht } from './toestand';

export type MotorTerug = {
  /** Het kind veranderde iets in de kijkdoos zelf (de lamp gesleept, een pijltje). */
  wijziging(t: SceneToestand): void;
  /** Een zin voor wie het beeld niet ziet. */
  beschrijving(tekst: string): void;
  /** De WebGL-context viel weg. */
  contextVerloren(): void;
  /** De proefbeelden waren te traag: de gevel start opnieuw in 'laag'. */
  traag(): void;
};

export type MotorOpties = {
  stand: Stand;
  keuze: StandKeuze;
  rendererNaam: string;
  toestand: SceneToestand;
  voorwerp: Voorwerp;
  stralen: boolean;
  prikkelarm: boolean;
  minderBeweging: boolean;
  meet: boolean;
  /** performance.now() bij het openen: de meetstand toont de tijd tot het eerste beeld. */
  startTijd: number;
  terug: MotorTerug;
};

export type Motor = {
  toon(t: SceneToestand): void;
  zetVoorwerp(v: Voorwerp): void;
  zetStralen(aan: boolean): void;
  zetPrikkelarm(aan: boolean): void;
  zetZicht(z: Zicht): void;
  /** Zet de focus op het canvas (na een herstart, als de focus in de kijkdoos stond). */
  focus(): void;
  /** Een beeld van de kijkdoos als png (data-url), om te vergelijken; null als het niet lukt. */
  foto(): string | null;
  meting(): MeetVerslag;
  /** Geeft alles vrij: renderer, context, texturen, schaduwkaarten, lussen, observers en luisteraars. */
  vernietig(): void;
};

export type MaakMotor = (houder: HTMLElement, opties: MotorOpties) => Motor;
