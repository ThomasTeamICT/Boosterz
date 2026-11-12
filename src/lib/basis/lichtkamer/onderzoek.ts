// 'Onderzoek: lamp dichterbij, schaduw groter?': het nakijken van de metingen en de conclusie. Zuivere code.
//
// De afstanden zijn een parameter. Standaard 30, 15 en 10 cm (beslissing in docs/basisonderwijs/
// LICHTKAMER-APP.md, 'Wat we uit het prototype herstellen'). Bij 30, 20 en 10 cm keurde het prototype
// geldige aflezingen af: de schaduw groeit er maar 0,83 cm tussen 30 en 20 cm, en de tolerantie van
// 0,75 cm laat dan twee aflezingen toe die gelijk zijn, terwijl het nakijken een strikt stijgende rij vraagt.
// Als de gekozen afstanden of de lamphoogte dat toch weer zouden doen, verkleint `tolerantieVoor` de
// tolerantie zodat het nooit meer kan.

import { leesMeting } from './meting';
import { LAMP_HOOGTE, SIL_TOP, schaduwHoogteBijAfstandCm, type Voorwerp } from './schaduw';

/** De afstanden tussen lens en voorwerp waarop het kind meet, in centimeters. */
export const STANDAARD_AFSTANDEN: readonly number[] = [30, 15, 10];
/** Een aflezing mag zoveel (cm) afwijken van de echte hoogte: haalbaar met streepjes van 0,5 cm. */
export const STANDAARD_TOLERANTIE_CM = 0.75;
/** De meetlat heeft streepjes van 0,5 cm. */
export const STREEP_CM = 0.5;

export type Hypothese = 'groter' | 'kleiner' | 'gelijk';
export type Conclusie = 'dichter-groter' | 'dichter-kleiner' | 'geen';
export const HYPOTHESEN: readonly Hypothese[] = ['groter', 'kleiner', 'gelijk'];
export const CONCLUSIES: readonly Conclusie[] = ['dichter-groter', 'dichter-kleiner', 'geen'];

export type OnderzoekOpties = {
  afstanden?: readonly number[];
  lampHoogte?: number;
  tolerantieCm?: number;
  /**
   * Gebruik de tolerantie precies zoals gevraagd, zonder ze te verkleinen (zoals het prototype). Dan kan een
   * geldige aflezing weer worden afgekeurd, en bereikt het nakijken de stap 'volgorde'. Alleen voor tests
   * en vergelijkingen; de app zet dit nooit aan.
   */
  tolerantieVast?: boolean;
};

function afstandenVan(o: OnderzoekOpties | undefined): readonly number[] {
  const a = o?.afstanden ?? STANDAARD_AFSTANDEN;
  if (a.length < 2) throw new RangeError('Een onderzoek heeft minstens twee afstanden nodig.');
  if (new Set(a).size !== a.length) throw new RangeError('De afstanden moeten verschillen.');
  if (a.some((cm) => !(cm > 0) || !Number.isFinite(cm))) throw new RangeError('Een afstand is een positief aantal centimeters.');
  return a;
}

/** De echte hoogte van de schaduw per afstand, in centimeters. */
export function echteHoogtes(voorwerp: Voorwerp, opties?: OnderzoekOpties): Record<number, number> {
  const lamp = opties?.lampHoogte ?? LAMP_HOOGTE;
  // Staat de lamp even hoog als de top of hoger, dan klopt de projectie niet meer (gelijke of negatieve hoogtes).
  if (!(lamp < SIL_TOP[voorwerp][0][1])) throw new RangeError('De lamp moet lager staan dan de top van het voorwerp.');
  const uit: Record<number, number> = {};
  for (const cm of afstandenVan(opties)) uit[cm] = schaduwHoogteBijAfstandCm(cm, voorwerp, lamp);
  return uit;
}

/**
 * De tolerantie die echt gebruikt wordt: de gevraagde, maar altijd kleiner dan de helft van het kleinste
 * verschil tussen twee echte hoogtes. Zo kunnen twee geldige aflezingen nooit gelijk of omgekeerd zijn.
 */
export function tolerantieVoor(voorwerp: Voorwerp, opties?: OnderzoekOpties): number {
  const gevraagd = opties?.tolerantieCm ?? STANDAARD_TOLERANTIE_CM;
  if (opties?.tolerantieVast) return gevraagd;
  const h = Object.values(echteHoogtes(voorwerp, opties)).sort((a, b) => a - b);
  let kleinste = Infinity;
  for (let i = 1; i < h.length; i++) kleinste = Math.min(kleinste, (h[i] as number) - (h[i - 1] as number));
  return Math.min(gevraagd, kleinste / 2 - 1e-9);
}

export type OnderzoekBewijs = { id: '4-meten' | '4-besluit'; juist: boolean; fout: string | null };

export type OnderzoekUitkomst = {
  stap: 'hypothese' | 'leeg' | 'fout' | 'volgorde' | 'conclusie' | 'besluit-fout' | 'klaar';
  soort: 'ok' | 'warn';
  titel: string;
  uitleg: string;
  /** Het onderzoek is af. */
  klaar: boolean;
  /** De afstanden (cm) waar de meting ontbreekt, of waar ze niet klopt. */
  afstanden: number[];
  bewijzen: OnderzoekBewijs[];
};

export type OnderzoekInvoer = {
  voorwerp: Voorwerp;
  /** De getypte metingen per afstand in centimeters, zoals het kind ze typte. */
  metingen: Readonly<Record<number, unknown>>;
  hypothese: Hypothese | null;
  conclusie: Conclusie | null;
};

function opsomming(cm: readonly number[]): string {
  return cm.join(' en ');
}

const NAKIJKEN_UITLEG = 'Zet de lamp op die afstand en lees de top van de schaduw af op de meetlat.';

export function kijkOnderzoekNa(invoer: OnderzoekInvoer, opties?: OnderzoekOpties): OnderzoekUitkomst {
  const afstanden = afstandenVan(opties);
  const echt = echteHoogtes(invoer.voorwerp, opties);
  const tol = tolerantieVoor(invoer.voorwerp, opties);
  const gelezen = new Map<number, number | null>(afstanden.map((cm) => [cm, leesMeting(invoer.metingen[cm])]));
  const m = (cm: number) => gelezen.get(cm) as number;
  const uit = (u: Partial<OnderzoekUitkomst> & Pick<OnderzoekUitkomst, 'stap' | 'soort' | 'titel' | 'uitleg'>): OnderzoekUitkomst => ({
    klaar: false,
    afstanden: [],
    bewijzen: [],
    ...u,
  });

  if (!invoer.hypothese) return uit({ stap: 'hypothese', soort: 'warn', titel: 'Kies eerst je hypothese.', uitleg: 'Wat denk jij, vóór je meet?' });

  const leeg = afstanden.filter((cm) => gelezen.get(cm) === null);
  if (leeg.length)
    return uit({ stap: 'leeg', soort: 'warn', titel: `Vul de meting bij ${opsomming(leeg)} cm nog in.`, uitleg: NAKIJKEN_UITLEG, afstanden: leeg });

  const fout = afstanden.filter((cm) => Math.abs(m(cm) - (echt[cm] as number)) > tol);
  if (fout.length)
    return uit({
      stap: 'fout',
      soort: 'warn',
      titel: `Kijk de meting bij ${opsomming(fout)} cm nog eens na.`,
      uitleg: NAKIJKEN_UITLEG,
      afstanden: fout,
      bewijzen: [{ id: '4-meten', juist: false, fout: 'leest de meetlat niet nauwkeurig af' }],
    });

  // de eigen metingen moeten bij elkaar passen: hoe dichter de lamp, hoe hoger de schaduw
  const dichtNaarVer = [...afstanden].sort((a, b) => a - b);
  const passen = dichtNaarVer.every((cm, i) => i === 0 || m(dichtNaarVer[i - 1] as number) > m(cm));
  if (!passen)
    return uit({
      stap: 'volgorde',
      soort: 'warn',
      titel: 'Kijk naar je eigen cijfers.',
      uitleg: `Vergelijk ${[...dichtNaarVer].reverse().join(', ')} cm: past de volgorde bij wat je op de meetlat ziet? Meet die nog eens.`,
      bewijzen: [{ id: '4-meten', juist: false, fout: 'metingen passen niet bij elkaar' }],
    });

  const metenJuist: OnderzoekBewijs = { id: '4-meten', juist: true, fout: null };
  if (!invoer.conclusie)
    return uit({ stap: 'conclusie', soort: 'warn', titel: 'Je metingen kloppen. Kies nu je conclusie.', uitleg: 'Wat zeggen je metingen?', bewijzen: [metenJuist] });

  const ok = invoer.conclusie === 'dichter-groter';
  const dichtst = dichtNaarVer[0] as number;
  return uit({
    stap: ok ? 'klaar' : 'besluit-fout',
    soort: ok ? 'ok' : 'warn',
    titel: ok ? 'Je onderzoek is af.' : 'Kijk naar je metingen.',
    uitleg: ok
      ? `Je metingen tonen het: bij ${dichtst} cm is de schaduw het grootst. ${invoer.hypothese === 'groter' ? 'Je hypothese klopte.' : 'Je hypothese klopte niet, en dat is ook een uitkomst.'}`
      : `Bij ${dichtst} cm meet je de grootste schaduw. Welke conclusie past daarbij?`,
    klaar: ok,
    bewijzen: [metenJuist, { id: '4-besluit', juist: ok, fout: ok ? null : 'conclusie past niet bij de metingen' }],
  });
}
