// 'Drie kaartjes met een gaatje': licht gaat rechtdoor, dus lamp, gaatjes en scherm liggen op één lijn.
// Zuivere code; de kijkdoos tekent, deze module zegt of het licht doorkomt.

/** Hoogtes van de gaatjes (laag, midden, hoog) en van de lamp (vijf standen), in 10 cm. */
export const GAAT_HOOGTES: readonly number[] = [0.35, 0.5, 0.65];
export const LAMP_HOOGTES: readonly number[] = [0.2, 0.35, 0.5, 0.65, 0.8];
/** De plaats (z) van de kaartjes, eerst het kaartje bij het scherm (3), dan 2, dan het kaartje bij de lamp (1). */
export const KAARTJE_Z: readonly number[] = [1.0, 1.8, 2.6];
/** De lens van de lamp staat op z = 3,4. */
export const KAARTJES_LAMP_Z = 3.4;

const GAAT_NAMEN = ['laag', 'in het midden', 'hoog'] as const;
const GAAT_KORT = ['laag', 'midden', 'hoog'] as const;
const LAMP_NAMEN = ['heel laag', 'laag', 'in het midden', 'hoog', 'heel hoog'] as const;

/**
 * De stand: `lamp` is de index in LAMP_HOOGTES; `gaten[i]` de index in GAAT_HOOGTES van het gaatje op
 * KAARTJE_Z[i]. gaten[0] hoort dus bij kaartje 3 (bij het scherm) en gaten[2] bij kaartje 1 (bij de lamp).
 */
export type KaartjesStand = { lamp: number; gaten: [number, number, number] };

export function beginStand(): KaartjesStand {
  return { lamp: 2, gaten: [0, 2, 1] };
}

const klem = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function zetGat(stand: KaartjesStand, i: number, d: number): KaartjesStand {
  if (!Number.isInteger(i) || i < 0 || i > 2) throw new RangeError(`Gaatje ${i} bestaat niet (0 tot 2).`);
  const gaten: [number, number, number] = [stand.gaten[0], stand.gaten[1], stand.gaten[2]];
  gaten[i] = klem(gaten[i] + d, 0, GAAT_HOOGTES.length - 1);
  return { lamp: stand.lamp, gaten };
}

export function zetLamp(stand: KaartjesStand, d: number): KaartjesStand {
  return { lamp: klem(stand.lamp + d, 0, LAMP_HOOGTES.length - 1), gaten: stand.gaten };
}

/** Hoogtes van de gaatjes in de volgorde van de lichtstraal: kaartje 1 (bij de lamp), 2, 3 (bij het scherm). */
function hoogtesVanLampNaarScherm(stand: KaartjesStand): [number, number, number] {
  return [GAAT_HOOGTES[stand.gaten[2]] as number, GAAT_HOOGTES[stand.gaten[1]] as number, GAAT_HOOGTES[stand.gaten[0]] as number];
}

/** Komt het licht door alle drie de gaatjes? Dan liggen lamp en gaatjes op één rechte lijn. */
export function lichtKomtDoor(stand: KaartjesStand): boolean {
  const ly = LAMP_HOOGTES[stand.lamp] as number;
  const ys = hoogtesVanLampNaarScherm(stand);
  const stap = ys[0] - ly;
  return Math.abs(ys[1] - ys[0] - stap) < 0.001 && Math.abs(ys[2] - ys[1] - stap) < 0.001;
}

export type Lichtweg = {
  door: boolean;
  /** Welk kaartje (1 bij de lamp, 3 bij het scherm) het licht tegenhoudt, of null. */
  geblokkeerdBij: 1 | 2 | 3 | null;
  /** Waar de straal eindigt: op een kaartje of op het scherm (z = 0). */
  eind: { y: number; z: number };
};

/** De lichtstraal door het gaatje van kaartje 1, en waar hij stopt (voor het tekenen van de lichtstralen). */
export function lichtweg(stand: KaartjesStand): Lichtweg {
  const ly = LAMP_HOOGTES[stand.lamp] as number;
  const ys = hoogtesVanLampNaarScherm(stand);
  const zs = [KAARTJE_Z[2] as number, KAARTJE_Z[1] as number, KAARTJE_Z[0] as number];
  const dir = (ys[0] - ly) / (zs[0] - KAARTJES_LAMP_Z); // helling dy/dz
  for (let i = 1; i < 3; i++) {
    const z = zs[i] as number;
    const y = ly + dir * (z - KAARTJES_LAMP_Z);
    if (Math.abs(y - (ys[i] as number)) > 0.04) return { door: false, geblokkeerdBij: (i + 1) as 2 | 3, eind: { y, z } };
  }
  return { door: lichtKomtDoor(stand), geblokkeerdBij: null, eind: { y: ly + dir * (0 - KAARTJES_LAMP_Z), z: 0 } };
}

/** Een tekst voor wie het beeld niet ziet. */
export function beschrijfKaartjes(stand: KaartjesStand): string {
  const g = stand.gaten;
  return `De zaklamp staat ${LAMP_NAMEN[stand.lamp]}. Gaatje 1 (bij de lamp) zit ${GAAT_NAMEN[g[2]]}, gaatje 2 ${GAAT_NAMEN[g[1]]}, gaatje 3 ${GAAT_NAMEN[g[0]]}. ${lichtKomtDoor(stand) ? 'Er valt een lichtvlek op het scherm.' : 'Er komt geen licht op het scherm.'}`;
}

/** De korte naam van de stand van een gaatje, voor in de tabel van het paneel. */
export function gaatNaam(stand: KaartjesStand, i: number): string {
  return GAAT_KORT[stand.gaten[i] as number] as string;
}

/** Eén oplossing als sleutel, zoals het prototype ze onthoudt: '<lamp>-<gaten>'. */
export function oplossingSleutel(stand: KaartjesStand): string {
  return `${stand.lamp}-${stand.gaten.join('')}`;
}

/** Een oplossing is 'schuin' als lamp en gaatjes niet allemaal even hoog zitten. */
export function isSchuin(sleutel: string): boolean {
  const m = /^(\d)-(\d)(\d)(\d)$/.exec(sleutel);
  if (!m) throw new RangeError(`Geen oplossing: ${sleutel}`);
  const ly = LAMP_HOOGTES[Number(m[1])] as number;
  return [m[2], m[3], m[4]].some((c) => GAAT_HOOGTES[Number(c)] !== ly);
}

/** Alle oplossingen: de standen waarbij het licht doorkomt. */
export function alleOplossingen(): KaartjesStand[] {
  const uit: KaartjesStand[] = [];
  for (let l = 0; l < LAMP_HOOGTES.length; l++)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        for (let c = 0; c < 3; c++) {
          const s: KaartjesStand = { lamp: l, gaten: [a, b, c] };
          if (lichtKomtDoor(s)) uit.push(s);
        }
  return uit;
}

export type KaartjesFeedback = {
  soort: 'ok' | 'info';
  titel: string;
  uitleg: string;
  /** Wanneer er al een schuine oplossing is gevonden: dan telt het bewijs '4-kaartjes'. */
  bewijsSchuin: boolean;
} | null;

/**
 * De terugkoppeling na een verandering. `oplossingen` zijn de sleutels van alle oplossingen die dit kind
 * al vond (met de huidige stand erbij als ze er een is). Null als er nog niets te zeggen valt.
 */
export function kaartjesFeedback(stand: KaartjesStand, oplossingen: ReadonlySet<string>): KaartjesFeedback {
  if (lichtKomtDoor(stand)) {
    const schuin = [...oplossingen].some(isSchuin);
    if (schuin)
      return {
        soort: 'ok',
        titel: 'Ook schuin lukt het!',
        uitleg: 'Het hoeft niet allemaal even hoog. Lamp, gaatjes en scherm moeten op één rechte lijn liggen. Licht gaat rechtdoor.',
        bewijsSchuin: true,
      };
    return {
      soort: 'ok',
      titel: 'Er komt licht op het scherm.',
      uitleg: 'Zet de zaklamp nu heel hoog of heel laag. Kan je het licht nog op het scherm krijgen?',
      bewijsSchuin: false,
    };
  }
  if (oplossingen.size)
    return { soort: 'info', titel: 'Het licht botst tegen een kaartje.', uitleg: 'Kijk van opzij. Waar komt de lichtvlek terecht?', bewijsSchuin: false };
  return null;
}
