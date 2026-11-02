// Het momentmodel van het basisonderwijs (bouwstap 2b, zie docs/basisonderwijs/MOMENTMODEL.md).
//
// Per set van het (buitengewoon) basisonderwijs leidt dit bestand uit de index af: voor wie de doelen zijn
// (moment, eindmoment, vak), tot welke golf van de invoering ze horen, en wat er per leerjaar en schooljaar
// geldt. De jaartallen komen alleen uit de invoeringskalender (./kalender) en uit de einddata van de gegevens.
//
// Zuiver: geen React, geen fetch, geen localStorage en nergens de klok. Het schooljaar (en 'vandaag') is altijd
// een parameter. Het model bewaart niets: alles wordt telkens opnieuw uitgerekend uit de index. Het label
// 'Geldig' van de gegevens ligt vast op de ophaaldatum, dus het model rekent er nooit mee.

import type { MinimumdoelenIndexSet } from '../minimumdoelen';
import {
  datumLeesbaar,
  geldigheidTekst,
  geldigheidVan,
  isBasisSoort,
  momentVanSet,
  soortVanSet,
  zonderAccenten,
  type MomentBasis,
} from '../minimumdoelenBron';
import {
  INVOERINGSKALENDER,
  LEERJAREN_BASIS,
  WERKT_NAAR,
  celVoor,
  eindeOudVoor,
  laatsteVanaf,
  schooljaarVan,
  type Eindmoment,
  type Golf,
  type Invoeringskalender,
  type KalenderVak,
  type LeerjaarBasis,
  type Schooljaar,
  type SoortBasis,
  type Zekerheid,
} from './kalender';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SoortDoelen = 'populatie' | 'individueel' | 'nastreven' | 'ontwikkelingsdoelen' | 'eindtermen';

/** Wat het model van een set nodig heeft. MinimumdoelenIndexSet en MinimumdoelenSetKop passen er allebei op. */
export interface SetKopBasis {
  id: string;
  naam: string;
  korteNaam?: string;
  leerjaar?: string;
  geldigheid?: string;
  geldigVan?: string;
  geldigTot?: string;
  aantal?: number;
}

export interface BasisSet {
  id: string;
  soort: SoortBasis;
  moment: MomentBasis;
  /** nieuw = het laatste deel van de naam bevat 'minimumdoelen'. Nooit afgeleid uit de versie. */
  generatie: 'nieuw' | 'oud';
  soortDoelen?: SoortDoelen;
  /** Alleen bij een nieuwe set. */
  eindmoment?: Eindmoment;
  /** Nieuw: de leerjaren die naar het eindmoment toewerken. Oud: K1-K3 (kleuter) of L1-L6 (lager). */
  leerjaren: readonly LeerjaarBasis[];
  /** Alleen bij een nieuwe set. Draagt ook de zekerheid en de bronnen van de golf van dit vak. */
  vak?: KalenderVak;
  golf?: Golf;
  /** Waar de golf vandaan komt: het vak (nieuwe set), de eigen einddatum (oude set) of nergens. */
  golfUit: 'vak' | 'einddatum' | 'geen';
  /** Het schooljaar van geldigVan en van geldigTot. */
  geldigVanaf?: Schooljaar;
  geldigTotEnMet?: Schooljaar;
  /** De schijnsets zonder doelen ('Alle leergebieden', hoogstens één doel), zoals ODS_2958 en ODS_2959. */
  leeg: boolean;
}

/**
 * Wat er voor een leerjaar in een schooljaar met een set aan de hand is.
 * 'vervangen' betekent alleen: niet meer verplicht, want de nieuwe minimumdoelen gelden. Het zegt niet welke
 * nieuwe set de plaats inneemt: die koppeling staat niet in de bron.
 */
export type InvoeringStatus = 'verplicht' | 'mag' | 'nog-niet' | 'geldt' | 'vervangen' | 'vervallen';
export type InvoeringReden = 'geen-einddatum' | 'einddatum-buiten-kalender' | 'onbekend-vak';

export interface Invoering {
  leerjaar: LeerjaarBasis;
  status: InvoeringStatus;
  zekerheid: Zekerheid;
  verplichtVanaf?: Schooljaar;
  laatsteSchooljaar?: Schooljaar;
  reden?: InvoeringReden;
  opmerking?: string;
  bronnen: readonly string[];
}

export interface KalenderRegel {
  leerjaren: LeerjaarBasis[];
  soort: 'verplicht-vanaf' | 'laatste-schooljaar' | 'geen-einde' | 'onbekend';
  jaar?: Schooljaar;
  zekerheid: Zekerheid;
  reden?: InvoeringReden;
  opmerking?: string;
  bronnen: readonly string[];
}

export interface Geldend {
  set: MinimumdoelenIndexSet;
  info: BasisSet;
  invoering: Invoering;
}

export interface GeldendeSets {
  soort: SoortBasis;
  leerjaar: LeerjaarBasis;
  schooljaar: Schooljaar;
  verplicht: Geldend[];
  geldtNog: Geldend[];
  magAl: Geldend[];
  leeg: MinimumdoelenIndexSet[];
  zekerheid: Zekerheid;
}

export interface DoelInfoBasis {
  eindmoment?: Eindmoment;
  vak?: number;
  soortDoel?: SoortDoelen;
}

// ─── Zekerheid ──────────────────────────────────────────────────────────────

const ZEKERHEID_RANG: Readonly<Record<Zekerheid, number>> = { onzeker: 0, waarschijnlijk: 1, zeker: 2 };

/** De laagste zekerheid van een lijst; 'zeker' bij een lege lijst (er valt niets te betwijfelen). */
export function laagsteZekerheid(lijst: readonly Zekerheid[]): Zekerheid {
  let laagste: Zekerheid = 'zeker';
  for (const z of lijst) if (ZEKERHEID_RANG[z] < ZEKERHEID_RANG[laagste]) laagste = z;
  return laagste;
}

// ─── Soort doelen, vak ──────────────────────────────────────────────────────

const SOORT_DOELEN_TEKST: Readonly<Record<string, SoortDoelen>> = {
  'te bereiken minimumdoelen op populatieniveau': 'populatie',
  'te bereiken minimumdoelen op individueel niveau': 'individueel',
  'na te streven minimumdoelen op populatieniveau': 'nastreven',
  ontwikkelingsdoelen: 'ontwikkelingsdoelen',
  eindtermen: 'eindtermen',
};

/**
 * De soort doelen uit het type van een doel of uit het laatste deel van de naam van een set. Werkt na trim,
 * kleine letters en één spatie per reeks; al de rest geeft undefined.
 */
export function soortDoelVan(type: string | undefined): SoortDoelen | undefined {
  if (typeof type !== 'string') return undefined;
  const sleutel = type.trim().toLowerCase().replace(/\s+/g, ' ');
  return Object.prototype.hasOwnProperty.call(SOORT_DOELEN_TEKST, sleutel) ? SOORT_DOELEN_TEKST[sleutel] : undefined;
}

/**
 * Het vak van een nieuwe set, uit de korte naam. Alleen bedoeld voor nieuwe sets: de oude sets 'Nederlands'
 * (ODS_2110) en 'Wiskunde' (ODS_2113) passen ook, maar basisSet roept deze functie bij oude sets nooit aan.
 */
export function vakVanKorteNaam(korteNaam: string | undefined, k: Invoeringskalender = INVOERINGSKALENDER): KalenderVak | undefined {
  if (typeof korteNaam !== 'string') return undefined;
  const sleutel = zonderAccenten(korteNaam).replace(/\s+/g, ' ').trim();
  if (sleutel === '') return undefined;
  return k.vakken.find((v) => v.sleutel === sleutel);
}

// ─── De set ─────────────────────────────────────────────────────────────────

function isSoortBasis(soort: string): soort is SoortBasis {
  return soort === 'bao' || soort === 'bubao';
}

const LEERJAREN_PER_MOMENT: Readonly<Record<MomentBasis, readonly LeerjaarBasis[]>> = {
  kleuter: ['K1', 'K2', 'K3'],
  lager: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
};

function eindmomentVan(set: SetKopBasis, moment: MomentBasis): Eindmoment | undefined {
  if (moment === 'kleuter') return 'K3';
  const uitLeerjaar = typeof set.leerjaar === 'string' ? /^\s*([46])de\s+leerjaar\s*$/i.exec(set.leerjaar) : null;
  const uitNaam = uitLeerjaar ?? /\b([46])de\s+leerjaar\b/i.exec(set.naam);
  if (!uitNaam) return undefined;
  return uitNaam[1] === '4' ? 'L4' : 'L6';
}

/**
 * De golf van een oude set, uit zijn einddatum: de golf waarvoor het schooljaar van geldigTot gelijk is aan het
 * laatste 'vanaf' min één. Geen treffer, twee treffers of geen einddatum geeft undefined.
 */
export function golfVanOudeSet(
  soort: SoortBasis,
  moment: MomentBasis,
  geldigTot: string | undefined,
  k: Invoeringskalender = INVOERINGSKALENDER,
): Golf | undefined {
  const sj = schooljaarVan(geldigTot);
  if (sj === undefined) return undefined;
  const treffers = ([1, 2] as const).filter((g) => sj === laatsteVanaf(soort, g, moment, k) - 1);
  return treffers.length === 1 ? treffers[0] : undefined;
}

/**
 * Wat het model van een set afleidt. Geeft undefined tenzij de set bij het basisonderwijs of het buitengewoon
 * basisonderwijs hoort en de naam een moment geeft: het secundair, het volwassenenonderwijs en de lerarenopleiding
 * vallen dus altijd weg.
 */
export function basisSet(set: SetKopBasis, k: Invoeringskalender = INVOERINGSKALENDER): BasisSet | undefined {
  if (typeof set.naam !== 'string') return undefined;
  const soort = soortVanSet(set.naam);
  if (!isBasisSoort(soort) || !isSoortBasis(soort)) return undefined;
  const moment = momentVanSet(set.naam);
  if (moment === undefined) return undefined;

  const delen = set.naam.split(/\s+-\s+/).map((d) => d.trim()).filter(Boolean);
  const laatsteDeel = delen.length > 0 ? delen[delen.length - 1] : '';
  const soortDoelen = soortDoelVan(laatsteDeel);
  const generatie: BasisSet['generatie'] = /minimumdoelen/i.test(laatsteDeel) ? 'nieuw' : 'oud';

  let eindmoment: Eindmoment | undefined;
  let leerjaren: readonly LeerjaarBasis[];
  let vak: KalenderVak | undefined;
  let golf: Golf | undefined;
  let golfUit: BasisSet['golfUit'] = 'geen';
  if (generatie === 'nieuw') {
    eindmoment = eindmomentVan(set, moment);
    leerjaren = eindmoment ? LEERJAREN_BASIS.filter((lj) => WERKT_NAAR[lj] === eindmoment) : [];
    vak = vakVanKorteNaam(set.korteNaam, k);
    if (vak) {
      golf = vak.golf;
      golfUit = 'vak';
    }
  } else {
    leerjaren = LEERJAREN_PER_MOMENT[moment];
    golf = golfVanOudeSet(soort, moment, set.geldigTot, k);
    if (golf !== undefined) golfUit = 'einddatum';
  }

  const leeg = zonderAccenten(set.korteNaam ?? '').trim() === 'alle leergebieden' && (set.aantal ?? 0) <= 1;

  const info: BasisSet = {
    id: set.id,
    soort,
    moment,
    generatie,
    leerjaren,
    golfUit,
    leeg,
  };
  if (soortDoelen !== undefined) info.soortDoelen = soortDoelen;
  if (eindmoment !== undefined) info.eindmoment = eindmoment;
  if (vak !== undefined) info.vak = vak;
  if (golf !== undefined) info.golf = golf;
  const geldigVanaf = schooljaarVan(set.geldigVan);
  if (geldigVanaf !== undefined) info.geldigVanaf = geldigVanaf;
  const geldigTotEnMet = schooljaarVan(set.geldigTot);
  if (geldigTotEnMet !== undefined) info.geldigTotEnMet = geldigTotEnMet;
  return info;
}

// ─── Invoering ──────────────────────────────────────────────────────────────

/** Hoe zeker de golf van een nieuwe set is: dat van zijn vak. Een oude set kent zijn golf uit de eigen einddatum, dus zeker. */
function golfZekerheid(set: BasisSet): Zekerheid {
  if (set.generatie === 'oud') return 'zeker';
  return set.vak ? set.vak.zekerheid : 'onzeker';
}

/** Regel (6): een oude set met een einddatum die in geen enkele golf past. Zeker alleen als hij vóór de invoering eindigt. */
function zekerheidBuitenKalender(set: BasisSet, k: Invoeringskalender): { zekerheid: Zekerheid; reden?: InvoeringReden } {
  const tot = set.geldigTotEnMet;
  if (tot !== undefined && tot < k.vrijwilligVanaf) return { zekerheid: 'zeker' };
  return { zekerheid: 'onzeker', reden: 'einddatum-buiten-kalender' };
}

/**
 * Wat er voor één leerjaar van een set in een schooljaar aan de hand is. Geeft undefined als het leerjaar niet bij
 * de set hoort. De eerste regel die past, wint:
 * (1) vóór geldigVan: nog-niet. (2) een oude set na geldigTot: vervallen. (3) een nieuwe set met golf: verplicht of mag.
 * (4) een oude set zonder einddatum: geldt. (5) een oude set met golf: geldt of vervangen. (6) een oude set met een
 * einddatum die in geen golf past: geldt, onzeker. (7) een nieuwe set zonder vak: mag, onzeker, nooit verplicht.
 * De zekerheid van de nieuwe set is de laagste van die van de cel en die van de golf van het vak.
 */
export function invoering(
  set: BasisSet,
  leerjaar: LeerjaarBasis,
  schooljaar: Schooljaar,
  k: Invoeringskalender = INVOERINGSKALENDER,
): Invoering | undefined {
  if (!set.leerjaren.includes(leerjaar)) return undefined;
  const nieuw = set.generatie === 'nieuw';

  // (1)
  if (set.geldigVanaf !== undefined && schooljaar < set.geldigVanaf) {
    return { leerjaar, status: 'nog-niet', zekerheid: 'zeker', bronnen: ['api'] };
  }
  // (2)
  if (!nieuw && set.geldigTotEnMet !== undefined && schooljaar > set.geldigTotEnMet) {
    return { leerjaar, status: 'vervallen', zekerheid: 'zeker', bronnen: ['api'] };
  }

  const cel = set.golf !== undefined ? celVoor(set.soort, set.golf, leerjaar, k) : undefined;

  // (3)
  if (nieuw && set.golf !== undefined && cel) {
    const celZekerheid: Zekerheid = schooljaar >= laatsteVanaf(set.soort, set.golf, set.moment, k) ? 'zeker' : cel.zekerheid;
    const uitkomst: Invoering = {
      leerjaar,
      status: schooljaar >= cel.vanaf ? 'verplicht' : 'mag',
      zekerheid: laagsteZekerheid([celZekerheid, golfZekerheid(set)]),
      verplichtVanaf: cel.vanaf,
      bronnen: cel.bronnen,
    };
    if (cel.opmerking !== undefined) uitkomst.opmerking = cel.opmerking;
    return uitkomst;
  }

  if (!nieuw) {
    // (4)
    if (set.geldigTotEnMet === undefined) {
      return { leerjaar, status: 'geldt', zekerheid: 'zeker', reden: 'geen-einddatum', bronnen: ['api'] };
    }
    // (5)
    if (set.golf !== undefined && cel) {
      const celZekerheid: Zekerheid = schooljaar >= laatsteVanaf(set.soort, set.golf, set.moment, k) ? 'zeker' : cel.zekerheid;
      const uitkomst: Invoering = {
        leerjaar,
        status: schooljaar >= cel.vanaf ? 'vervangen' : 'geldt',
        zekerheid: celZekerheid,
        laatsteSchooljaar: Math.min(cel.vanaf - 1, set.geldigTotEnMet),
        bronnen: cel.bronnen,
      };
      if (cel.opmerking !== undefined) uitkomst.opmerking = cel.opmerking;
      return uitkomst;
    }
    // (6)
    const buiten = zekerheidBuitenKalender(set, k);
    const uitkomst: Invoering = {
      leerjaar,
      status: 'geldt',
      zekerheid: buiten.zekerheid,
      laatsteSchooljaar: set.geldigTotEnMet,
      bronnen: ['api'],
    };
    if (buiten.reden) uitkomst.reden = buiten.reden;
    return uitkomst;
  }

  // (7)
  return { leerjaar, status: 'mag', zekerheid: 'onzeker', reden: 'onbekend-vak', bronnen: [] };
}

/** Eén Invoering per leerjaar van de set, in de volgorde van LEERJAREN_BASIS. */
export function invoeringVanSet(set: BasisSet, schooljaar: Schooljaar, k: Invoeringskalender = INVOERINGSKALENDER): Invoering[] {
  const uit: Invoering[] = [];
  for (const lj of LEERJAREN_BASIS) {
    const i = invoering(set, lj, schooljaar, k);
    if (i) uit.push(i);
  }
  return uit;
}

// ─── De tijdloze kalender van een set ───────────────────────────────────────

function regelVoor(set: BasisSet, leerjaar: LeerjaarBasis, k: Invoeringskalender): Omit<KalenderRegel, 'leerjaren'> | undefined {
  const nieuw = set.generatie === 'nieuw';
  const cel = set.golf !== undefined ? celVoor(set.soort, set.golf, leerjaar, k) : undefined;

  if (nieuw) {
    if (set.golf !== undefined && cel) {
      // Zonder ophoging: de kalender is tijdloos. Wel de golf van het vak: staat die niet vast, dan staat de regel ook niet vast.
      const regel: Omit<KalenderRegel, 'leerjaren'> = {
        soort: 'verplicht-vanaf',
        jaar: cel.vanaf,
        zekerheid: laagsteZekerheid([cel.zekerheid, golfZekerheid(set)]),
        bronnen: cel.bronnen,
      };
      if (cel.opmerking !== undefined) regel.opmerking = cel.opmerking;
      return regel;
    }
    return { soort: 'onbekend', zekerheid: 'onzeker', reden: 'onbekend-vak', bronnen: [] };
  }

  if (set.geldigTotEnMet === undefined) {
    return { soort: 'geen-einde', zekerheid: 'zeker', reden: 'geen-einddatum', bronnen: ['api'] };
  }
  if (set.golf !== undefined && cel) {
    // De opmerking van de cel gaat over de nieuwe minimumdoelen en blijft bij de oude set weg; zo vallen
    // opeenvolgende leerjaren met dezelfde einddatum samen in één regel.
    return {
      soort: 'laatste-schooljaar',
      jaar: Math.min(cel.vanaf - 1, set.geldigTotEnMet),
      zekerheid: cel.zekerheid,
      bronnen: cel.bronnen,
    };
  }
  const buiten = zekerheidBuitenKalender(set, k);
  const regel: Omit<KalenderRegel, 'leerjaren'> = {
    soort: 'laatste-schooljaar',
    jaar: set.geldigTotEnMet,
    zekerheid: buiten.zekerheid,
    bronnen: ['api'],
  };
  if (buiten.reden) regel.reden = buiten.reden;
  return regel;
}

/**
 * De kalender van een set zonder schooljaar, zodat hij niet veroudert: per groep leerjaren 'verplicht vanaf'
 * of 'laatste schooljaar'. Opeenvolgende leerjaren met gelijke soort, jaar, zekerheid, reden en opmerking worden
 * één regel. De zekerheid is die van de cel (en bij een nieuwe set die van het vak), zonder ophoging.
 * Een lege set geeft [].
 */
export function kalenderVoorSet(set: BasisSet, k: Invoeringskalender = INVOERINGSKALENDER): KalenderRegel[] {
  if (set.leeg) return [];
  const regels: KalenderRegel[] = [];
  for (const lj of set.leerjaren) {
    const nieuweRegel = regelVoor(set, lj, k);
    if (!nieuweRegel) continue;
    const vorige = regels[regels.length - 1];
    if (
      vorige &&
      vorige.soort === nieuweRegel.soort &&
      vorige.jaar === nieuweRegel.jaar &&
      vorige.zekerheid === nieuweRegel.zekerheid &&
      vorige.reden === nieuweRegel.reden &&
      vorige.opmerking === nieuweRegel.opmerking
    ) {
      vorige.leerjaren.push(lj);
      vorige.bronnen = [...vorige.bronnen, ...nieuweRegel.bronnen.filter((b) => !vorige.bronnen.includes(b))];
    } else {
      regels.push({ leerjaren: [lj], ...nieuweRegel });
    }
  }
  return regels;
}

// ─── Welke sets gelden ──────────────────────────────────────────────────────

/**
 * Het antwoord op 'welke doelen gelden voor dit leerjaar in dit schooljaar', in de volgorde van de index:
 * verplicht, geldt nog (oude sets) en mag al (nieuwe sets die nog niet verplicht zijn). Vervangen, vervallen en
 * nog-niet vallen weg. Een lege set gaat alleen naar 'leeg'. De zekerheid is de laagste over de drie lijsten.
 */
export function setsDieGelden(
  alle: readonly MinimumdoelenIndexSet[],
  vraag: { soort: SoortBasis; leerjaar: LeerjaarBasis; schooljaar: Schooljaar },
  k: Invoeringskalender = INVOERINGSKALENDER,
): GeldendeSets {
  const uit: GeldendeSets = {
    soort: vraag.soort,
    leerjaar: vraag.leerjaar,
    schooljaar: vraag.schooljaar,
    verplicht: [],
    geldtNog: [],
    magAl: [],
    leeg: [],
    zekerheid: 'zeker',
  };
  for (const set of alle) {
    const info = basisSet(set, k);
    if (!info || info.soort !== vraag.soort) continue;
    const i = invoering(info, vraag.leerjaar, vraag.schooljaar, k);
    if (!i) continue;
    const lijst =
      i.status === 'verplicht' ? uit.verplicht : i.status === 'geldt' ? uit.geldtNog : i.status === 'mag' ? uit.magAl : undefined;
    if (!lijst) continue;
    if (info.leeg) {
      uit.leeg.push(set);
      continue;
    }
    lijst.push({ set, info, invoering: i });
  }
  uit.zekerheid = laagsteZekerheid([...uit.verplicht, ...uit.geldtNog, ...uit.magAl].map((g) => g.invoering.zekerheid));
  return uit;
}

/**
 * De nieuwe sets van de andere basissoort met hetzelfde vak en eindmoment, in de volgorde van de index. Een oude
 * set, of een set zonder vak of eindmoment, geeft []. De bestaande zijnTweeling (so en buso) blijft ongewijzigd.
 */
export function tweelingSets(
  set: BasisSet,
  alle: readonly MinimumdoelenIndexSet[],
  k: Invoeringskalender = INVOERINGSKALENDER,
): MinimumdoelenIndexSet[] {
  if (set.generatie !== 'nieuw' || !set.vak || !set.eindmoment) return [];
  const uit: MinimumdoelenIndexSet[] = [];
  for (const s of alle) {
    const info = basisSet(s, k);
    if (!info || info.generatie !== 'nieuw' || info.soort === set.soort) continue;
    if (info.vak?.nr === set.vak.nr && info.eindmoment === set.eindmoment) uit.push(s);
  }
  return uit;
}

// ─── Doelen ─────────────────────────────────────────────────────────────────

/**
 * Wat er bij één doel van een set hoort. Geen enkel doel heeft een eigen leerjaar: het eindmoment is dat van de
 * set. Het vak komt uit het eerste getal van de code (alleen bij een nieuwe set). De soort doel hoort bij het
 * paar (doel, set), nooit bij het id alleen: doel 92767 is populatie in ODS_3408 en nastreven in ODS_3469.
 */
export function doelInfo(doel: { code: string; type?: string }, set: BasisSet): DoelInfoBasis {
  const uit: DoelInfoBasis = {};
  if (set.eindmoment !== undefined) uit.eindmoment = set.eindmoment;
  if (set.generatie === 'nieuw' && typeof doel.code === 'string' && /^\d+\.\d+\.\d+$/.test(doel.code)) {
    const nr = Number(doel.code.split('.')[0]);
    if (nr >= 1 && nr <= 10) uit.vak = nr;
  }
  const soortDoel = soortDoelVan(doel.type) ?? set.soortDoelen;
  if (soortDoel !== undefined) uit.soortDoel = soortDoel;
  return uit;
}

// ─── Geldigheid in de lijst en de feiten ────────────────────────────────────

function datumDeel(tekst: string | undefined): string | undefined {
  return typeof tekst === 'string' && /^\d{4}-\d{2}-\d{2}/.test(tekst) ? tekst.slice(0, 10) : undefined;
}

/**
 * De geldigheid van een set van het basisonderwijs voor de lijst en de feiten. Een set met het label 'Geldig' en een
 * einddatum toont die einddatum: 'Geldig tot 31 augustus 2028' tot en met die dag, 'Gold tot 31 augustus 2028' erna.
 * 'vandaag' ('JJJJ-MM-DD') geeft de pagina mee, want dit bestand leest nergens de klok; zonder (leesbare) 'vandaag'
 * is niet te zeggen of de einddatum voorbij is en blijft het bij 'Geldig tot'. In alle andere gevallen, ook voor het
 * secundair, is de uitkomst precies geldigheidTekst(g).
 */
export function geldigheidTekstBasis(
  naam: string,
  g: { geldigheid?: string; geldigVan?: string; geldigTot?: string },
  vandaag?: string,
): string | undefined {
  if (!isBasisSoort(soortVanSet(naam)) || geldigheidVan(g) !== 'G') return geldigheidTekst(g);
  const tot = datumDeel(g.geldigTot);
  if (tot === undefined) return geldigheidTekst(g);
  const nu = datumDeel(vandaag);
  const voorbij = nu !== undefined && nu > tot;
  return `${voorbij ? 'Gold' : 'Geldig'} tot ${datumLeesbaar(g.geldigTot)}`;
}

// ─── Kalender tegen de gegevens ─────────────────────────────────────────────

/**
 * Legt de kalender naast de index. Geeft afwijkingen als leesbare Vlaamse zinnen; op de index van 1 november 2026 is
 * de lijst leeg. Een afwijking betekent niet dat de gegevens kapot zijn: meestal is de kalender (src/lib/basis/kalender.ts)
 * aan een nieuwe einddatum of een nieuw vak toe.
 */
export function kalenderTegenGegevens(alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER): string[] {
  const fouten: string[] = [];
  const einden = new Map<string, Set<string>>();
  for (const s of alle) {
    const soort = soortVanSet(s.naam);
    if (!isSoortBasis(soort)) continue;
    const info = basisSet(s, k);
    if (!info) {
      fouten.push(`De set ${s.id} (${s.naam}) hoort bij het basisonderwijs, maar het momentmodel kan er geen moment uit afleiden.`);
      continue;
    }
    if (info.generatie === 'nieuw') {
      if (!info.vak) {
        fouten.push(`De nieuwe set ${s.id} heeft een vak ('${s.korteNaam ?? ''}') dat niet in de kalender staat.`);
      }
      if (!info.eindmoment) fouten.push(`De nieuwe set ${s.id} (${s.naam}) heeft geen eindmoment: het leerjaar is niet te lezen.`);
      else if (info.leerjaren.length === 0) fouten.push(`De nieuwe set ${s.id} heeft geen leerjaren.`);
      continue;
    }
    const tot = datumDeel(s.geldigTot);
    if (tot !== undefined) {
      const sleutel = `${info.soort}|${info.moment}`;
      const lijst = einden.get(sleutel) ?? new Set<string>();
      lijst.add(tot);
      einden.set(sleutel, lijst);
    }
    if (info.geldigTotEnMet !== undefined && info.geldigTotEnMet >= k.vrijwilligVanaf && info.golfUit === 'geen') {
      fouten.push(
        `De oude set ${s.id} eindigt op ${datumLeesbaar(s.geldigTot)}, en die einddatum past in geen enkele golf van de kalender.`,
      );
    }
  }
  const soorten: readonly SoortBasis[] = ['bao', 'bubao'];
  const momenten: readonly MomentBasis[] = ['kleuter', 'lager'];
  for (const soort of soorten) {
    for (const golf of [1, 2] as const) {
      for (const moment of momenten) {
        const verwacht = eindeOudVoor(soort, golf, moment, k);
        if (!einden.get(`${soort}|${moment}`)?.has(verwacht)) {
          fouten.push(
            `De kalender verwacht voor ${soort === 'bao' ? 'het basisonderwijs' : 'het buitengewoon basisonderwijs'} (${moment}, golf ${golf}) oude sets die eindigen op ${datumLeesbaar(verwacht)}, maar geen enkele oude set eindigt zo.`,
          );
        }
      }
    }
  }
  return fouten;
}
