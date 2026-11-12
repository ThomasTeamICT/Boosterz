// Lichtkamer, schaduwtheater (einde 4de leerjaar): de meetkunde van lamp, voorwerp en scherm.
//
// Zuivere code: geen three.js, geen DOM, geen klok. De kijkdoos (LK-5) en de panelen (LK-6) rekenen
// hiermee; de getallen komen uit het prototype (tools/prototypes/lichtkamer/lichtkamer.html) en
// worden door schaduw.test.ts en de andere tests nagerekend (waarden van het prototype vastgezet).
//
// Eenheden: 1 = 10 cm. Het scherm staat op z = 0, het voorwerp op z = 1, de vloer op y = 0, de lamp kijkt
// langs -z. De lens (waar het licht vertrekt) zit LENS_AFSTAND voor de positie die de lamp opgeeft: zo
// staat het in het prototype, en zo blijven de getallen gelijk.

export type Voorwerp = 'boom' | 'huis' | 'kind';
export const VOORWERPEN: readonly Voorwerp[] = ['boom', 'huis', 'kind'];

/** Plaats van het voorwerp (z) en van het scherm. */
export const VOORWERP_Z = 1.0;
export const SCHERM_Z = 0;
/** De lens zit zoveel (10 cm) vóór de positie van de lamp. */
export const LENS_AFSTAND = 0.23;
/** Hoogte van de lamp in het schaduwtheater (5 cm). */
export const LAMP_HOOGTE = 0.5;

/** De punten van de silhouet die een schaduw bepalen (top en twee hoeken), [x, y] in 10 cm. */
export const SIL_TOP: Readonly<Record<Voorwerp, ReadonlyArray<readonly [number, number]>>> = {
  boom: [[0, 1.0], [-0.32, 0.3], [0.32, 0.3]],
  huis: [[0, 1.0], [-0.3, 0.55], [0.3, 0.55]],
  kind: [[0, 0.98], [-0.17, 0.81], [0.17, 0.81]],
};

export const NAAM_VOORWERP: Readonly<Record<Voorwerp, string>> = { boom: 'boompje', huis: 'huisje', kind: 'kartonnen kind' };

export type Punt = { x: number; y: number };
export type Lamp = { x: number; y: number; z: number };

/** Waar de lichtstraal van de lamp door (px, py) op het scherm (of een vlak op z = pz) terechtkomt. */
export function schaduwPunt(lamp: Lamp, px: number, py: number, pz: number): Punt {
  const f = lamp.z / (lamp.z - pz);
  return { x: lamp.x + (px - lamp.x) * f, y: lamp.y + (py - lamp.y) * f };
}

/** De lens van de lamp, uit de positie die de lamp opgeeft (x, hoogte, z met de handgreep erbij). */
export function lensVan(lamp: Lamp): Lamp {
  return { x: lamp.x, y: lamp.y, z: lamp.z - LENS_AFSTAND };
}

/** De afstand tussen de lens en het voorwerp, in hele centimeters (zoals het prototype hem noemt). */
export function afstandCm(lamp: Lamp): number {
  return Math.round((lamp.z - LENS_AFSTAND - VOORWERP_Z) * 10);
}

/** Positie van de lamp (met handgreep) voor een afstand lens-voorwerp in centimeters. */
export function lampZVoorAfstand(cm: number): number {
  return VOORWERP_Z + cm / 10 + LENS_AFSTAND;
}

/** De hoogte van de schaduw van de top van het voorwerp, in centimeters. */
export function schaduwHoogteCm(lamp: Lamp, voorwerp: Voorwerp): number {
  return schaduwPunt(lensVan(lamp), 0, SIL_TOP[voorwerp][0][1], VOORWERP_Z).y * 10;
}

/** Hoogte van de schaduw bij een lens op `cm` centimeter van het voorwerp (de lamp op `lampHoogte`, recht ervoor). */
export function schaduwHoogteBijAfstandCm(cm: number, voorwerp: Voorwerp, lampHoogte: number = LAMP_HOOGTE): number {
  return schaduwPunt({ x: 0, y: lampHoogte, z: VOORWERP_Z + cm / 10 }, 0, SIL_TOP[voorwerp][0][1], VOORWERP_Z).y * 10;
}

export type SchaduwKant = 'links' | 'rechts' | 'recht';

/** Aan welke kant van het voorwerp de lamp staat. */
export function kantVanLamp(lamp: Lamp): SchaduwKant {
  return lamp.x < -0.15 ? 'links' : lamp.x > 0.15 ? 'rechts' : 'recht';
}

/** Een zin voor wie het beeld niet ziet (voor de schermlezer): waar staat de lamp, waar valt de schaduw. */
export function beschrijfSchaduw(lamp: Lamp, voorwerp: Voorwerp, verbergSchaduw = false): string {
  const kant = kantVanLamp(lamp);
  const kantTekst = kant === 'links' ? 'links van' : kant === 'rechts' ? 'rechts van' : 'recht voor';
  const af = afstandCm(lamp);
  const schaduwKant = kant === 'links' ? 'rechts' : kant === 'rechts' ? 'links' : 'recht achter het voorwerp';
  const sh = verbergSchaduw
    ? 'De schaduw is verborgen.'
    : `De schaduw valt ${schaduwKant} op het scherm en is ongeveer ${Math.round(schaduwHoogteCm(lamp, voorwerp))} centimeter hoog.`;
  return `De zaklamp staat ${kantTekst} het ${NAAM_VOORWERP[voorwerp]}, op ${af} centimeter ervan. ${sh}`;
}
