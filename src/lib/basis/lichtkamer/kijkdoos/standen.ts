// De drie standen van de kijkdoos en de automatische keuze (docs/basisonderwijs/LICHTKAMER-APP.md, 'De kijkdoos').
//
// Zuiver: geen three.js, geen DOM. De kijkdoos (kijkdoos3d.ts) vraagt hier welke instellingen bij een stand horen en of
// ze naar 'laag' moet. Wat het bezoek met de ICT-coördinator vastlegt (LK-11), verandert alleen de standaard, niet de
// standen zelf.

export type Stand = 'hoog' | 'midden' | 'laag';
/** 'auto': op het bord 'hoog', anders 'midden', en 'laag' als het toestel zonder grafische kaart tekent of traag is. */
export type StandKeuze = Stand | 'auto';
export const STANDEN: readonly Stand[] = ['hoog', 'midden', 'laag'];

export type StandInstellingen = {
  /** Bovengrens voor devicePixelRatio. */
  maxPixelRatio: number;
  /** Gloed (nabewerking met bloom): alleen op het bord. */
  gloed: boolean;
  /** Antialias is een eigenschap van de WebGL-context: wisselen vraagt een nieuwe renderer. */
  antialias: boolean;
  /** Zijde van de schaduwkaart van de zaklamp, in pixels. */
  schaduwKaart: number;
  /** 'zacht' = PCFSoftShadowMap (zoals het prototype), 'pcf' = PCFShadowMap. */
  schaduwSoort: 'zacht' | 'pcf';
  /** Stofjes in de lichtbundel bewegen (alleen op het bord, nooit bij prikkelarm of 'minder beweging'). */
  stofjesBewegen: boolean;
};

const INSTELLINGEN: Readonly<Record<Stand, StandInstellingen>> = {
  // Het bord: gloed en pixelratio 2.
  hoog: { maxPixelRatio: 2, gloed: true, antialias: true, schaduwKaart: 2048, schaduwSoort: 'zacht', stofjesBewegen: true },
  // Zoals het prototype op een Chromebook (lk-wereld.js r. 153: pixelratio 1,25 buiten 'hoog').
  midden: { maxPixelRatio: 1.25, gloed: false, antialias: true, schaduwKaart: 2048, schaduwSoort: 'zacht', stofjesBewegen: false },
  // Licht voor trage Chromebooks.
  laag: { maxPixelRatio: 1, gloed: false, antialias: false, schaduwKaart: 1024, schaduwSoort: 'pcf', stofjesBewegen: false },
};

export function instellingenVoor(stand: Stand): StandInstellingen {
  return INSTELLINGEN[stand];
}

export function isStand(x: unknown): x is Stand {
  return x === 'hoog' || x === 'midden' || x === 'laag';
}

/** De stand waarmee de kijkdoos begint. */
export function beginStand(keuze: StandKeuze, bord: boolean): Stand {
  if (keuze !== 'auto') return keuze;
  return bord ? 'hoog' : 'midden';
}

/**
 * Tekent dit toestel zonder grafische kaart? De naam komt uit WEBGL_debug_renderer_info (UNMASKED_RENDERER_WEBGL);
 * die is niet altijd beschikbaar, en dan weten we het niet (false). SwiftShader is de softwarerenderer van Chrome
 * (ook op een Chromebook zonder werkende GPU), llvmpipe en softpipe die van Mesa, en 'Microsoft Basic Render' die van
 * Windows.
 */
export function isSoftwareRenderer(naam: string | null | undefined): boolean {
  if (typeof naam !== 'string') return false;
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(naam);
}

/** Hoeveel beelden de kijkdoos na het eerste beeld tekent om te meten of het toestel traag is. */
export const PROEFBEELDEN = 5;
/**
 * Zo lang (ms) mag een beeld gemiddeld (de mediaan) duren voor de kijkdoos 'laag' kiest. Dezelfde grens als de go of
 * no-go van het bezoek: een p95 van hoogstens 50 ms.
 */
export const TRAAG_MS = 50;

export function mediaan(waarden: readonly number[]): number {
  const geldig = waarden.filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  if (geldig.length === 0) return NaN;
  const m = Math.floor(geldig.length / 2);
  return geldig.length % 2 ? (geldig[m] as number) : ((geldig[m - 1] as number) + (geldig[m] as number)) / 2;
}

/**
 * Moet de kijkdoos na de proefbeelden naar 'laag'? Alleen bij de keuze 'auto', alleen omlaag (nooit terug omhoog, zodat
 * ze niet heen en weer springt), en alleen met genoeg metingen. `tijden` zijn de tijden tussen opeenvolgende beelden.
 */
export function moetNaarLaag(keuze: StandKeuze, huidig: Stand, tijden: readonly number[]): boolean {
  if (keuze !== 'auto' || huidig === 'laag') return false;
  if (tijden.filter((t) => Number.isFinite(t)).length < PROEFBEELDEN - 1) return false;
  return mediaan(tijden) > TRAAG_MS;
}

/** De stand waarmee de kijkdoos meteen begint, met wat ze van de renderer weet. */
export function standVoorRenderer(keuze: StandKeuze, bord: boolean, rendererNaam: string | null | undefined): Stand {
  const s = beginStand(keuze, bord);
  return keuze === 'auto' && isSoftwareRenderer(rendererNaam) ? 'laag' : s;
}
