// Welke minimumdoelen horen bij een studierichting, een jaar en een soort onderwijs? (docs/STUDIERICHTINGEN.md § 9)
//
// Puur en zonder netwerk: de lader (studierichtingenBron.ts) haalt de bestanden op, deze module rekent. De app maakt
// hier nooit zelf een koppeling tussen een richting en een doel: alles komt uit het koppelingsbestand van de richting
// (officieel, uit de Onderwijsdoelen-API) en uit `minimumdoelen/index.json`. Wat we weglaten, blijft zichtbaar in het
// kader (`nietVoorDitJaar`, `verborgenOud`, `verborgenAndereSoort`, `onbekend`).
//
// De regels R1 tot R7 staan in § 9.1 en bij `bouwKader`.

import { MAX_DOELEN, MAX_SETS } from './curriculum';
import { sanitizeDoelgroep, graadTekst, jaarTekst, type Doelgroep } from './doelgroep';
import type { SetKeuze } from './doelenSamenstellen';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { oudeVersieIds, soortVanSet, zoekTermen, zonderAccenten, type SoortOnderwijs } from './minimumdoelenBron';
import { sha256Hex } from './sha256';
import {
  isAfgebouwd,
  jaarVan,
  soortVanGroep,
  stroomVanEersteGraad,
  vergelijkGroepnummer,
  vergelijkNatuurlijk,
  type GroepSoort,
  type MatrixBestand,
  type RichtingDoelenBestand,
  type RichtingDoelenIndexRegel,
  type RichtingDoelenSet,
  type StudierichtingGroep,
  type Structuuronderdeel,
} from './studierichtingen';

// ── Types ───────────────────────────────────────────────────────────────────

export type SoortKeuze = 'so' | 'buso';

/** Wat de leerkracht koos: een richting (groepnummer), eventueel een jaar, het soort onderwijs en een onderdeel (variant). */
export interface RichtingKeuze {
  groep: string;
  jaar?: number;
  soort: SoortKeuze;
  onderdeel?: number;
}

/** Een richting met wat we eruit afleiden. */
export interface RichtingInfo {
  groep: StudierichtingGroep;
  /** Alle onderdelen van de groep, oplopend op nummer (ook de afgebouwde). */
  onderdelen: Structuuronderdeel[];
  soort: GroepSoort;
  graad?: 1 | 2 | 3;
  /** Jaren (1 tot 7) van de geldige onderdelen die geen aanloop zijn. Een afgebouwde richting houdt de jaren die ze had. */
  jaren: number[];
  /** Alleen in de 1ste graad: de stroom uit de titel. */
  stroom?: 'A' | 'B';
  /** Onderwijsvormen in kleine letters ("aso", "tso"), gesorteerd. */
  vormen: string[];
  /** Studiedomeinen leesbaar geschreven ("Domeinoverschrijdend", "STEM"), gesorteerd. */
  domeinen: string[];
  duaal: boolean;
  /** Een geldig onderdeel heeft `ov4`: de richting kan ook in het buitengewoon onderwijs (opleidingsvorm 4). */
  kanBuso: boolean;
  afgebouwd: boolean;
  /** JJJJ-MM-DD: de laatste einddatum, als de richting afgebouwd is. */
  afgebouwdSinds?: string;
  /** Richtingen (andere groepen) die volgens de matrix op deze volgen. */
  opvolgers: StudierichtingGroep[];
  /** Dezelfde naam in een andere graad (bv. Humane wetenschappen in de 2de en de 3de graad). */
  zelfdeNaam: StudierichtingGroep[];
  nietMeerInBron?: string;
}

export interface RichtingFilter {
  graad?: 1 | 2 | 3;
  /** Code van de finaliteit: 'DO', 'DU' of 'A'. */
  finaliteit?: string;
  zoek: string;
  /** Ook zevende jaren, aanloopjaren en buitengewoon onderwijs. */
  ookMeer: boolean;
  /** Ook de afgebouwde richtingen (en wat niet meer in de bron staat). */
  afgebouwd: boolean;
}

/** Waar het kader vandaan komt: de officiële koppeling, de regel voor de 1ste graad, of (nog) niets. */
export type KaderHerkomst = 'api' | 'graad-en-stroom' | 'geen' | 'nog-niet-opgehaald';

export interface KaderSet {
  set: MinimumdoelenIndexSet;
  /** De vaste nummers uit de koppeling (natuurlijk gesorteerd). */
  ids: readonly string[];
  /** Alle doelen van de set (`ids.length === setAantal`). */
  volledig: boolean;
  /** Niet verplicht zijn de uitbreidingsdoelen (1ste graad). */
  verplicht: boolean;
  /** De koppeling is gemaakt met deze versie van de set (`setSha` = het begin van `sha256` in de index). */
  versieGelijk: boolean;
}

export interface RichtingKader {
  /** De keuze zoals ze voor dit kader geldt (het soort onderwijs is dan al nagekeken: zie `bouwKader`). */
  keuze: RichtingKeuze;
  herkomst: KaderHerkomst;
  opgehaald?: string;
  nietMeerInBron?: string;
  sets: KaderSet[];
  /** Alle doelen van `sets`, ook de niet verplichte. */
  aantalDoelen: number;
  aantalVerplicht: number;
  nietVoorDitJaar: KaderSet[];
  /** Sets van de koppeling die een oude versie zijn (en dus niet meer gelden). */
  verborgenOud: number;
  /** Sets van de koppeling voor het andere soort onderwijs (gewoon tegenover buitengewoon, of volwassenenonderwijs). */
  verborgenAndereSoort: number;
  /** Sets uit de koppeling die niet (meer) in `minimumdoelen/index.json` staan. */
  onbekend: string[];
  /** Meer sets of doelen dan één lijst bewaren kan (`MAX_SETS`, `MAX_DOELEN`). */
  teGroot: boolean;
}

// ── Kleine hulpmiddelen ─────────────────────────────────────────────────────

const LEERJAAR_3 = '3de leerjaar';

/** De finaliteit voor een leerkracht, bij de code uit de matrix. */
export const FINALITEIT_LABEL: Record<string, string> = {
  DO: 'Doorstroomfinaliteit',
  DU: 'Dubbele finaliteit',
  A: 'Arbeidsmarktfinaliteit',
};

function opNummer(a: Structuuronderdeel, b: Structuuronderdeel): number {
  return a.nummer - b.nummer;
}

function sorteerUniek<T>(lijst: readonly T[], vergelijk: (a: T, b: T) => number): T[] {
  return [...new Set(lijst)].sort(vergelijk);
}

/** Rekent uit de naam van de set of ze een uitbreidingsset is: het laatste deel na " - " is "Uitbreidingsdoelen". */
export function isUitbreidingsSet(naam: string): boolean {
  const delen = naam.split(/\s+-\s+/).map((d) => d.trim());
  return delen.length >= 2 && delen[delen.length - 1].toLowerCase() === 'uitbreidingsdoelen';
}

// ── Richtingen uit de matrix ────────────────────────────────────────────────

interface MatrixOpzoek {
  groepen: Map<string, StudierichtingGroep>;
  onderdelenVanGroep: Map<string, Structuuronderdeel[]>;
  groepVanOnderdeel: Map<number, string>;
  /** Groepen per titel (zonder accenten en hoofdletters). */
  perTitel: Map<string, StudierichtingGroep[]>;
}

const OPZOEK = new WeakMap<MatrixBestand, MatrixOpzoek>();

function titelSleutel(titel: string): string {
  return zonderAccenten(titel).replace(/\s+/g, ' ').trim();
}

function opzoekVan(matrix: MatrixBestand): MatrixOpzoek {
  const bewaard = OPZOEK.get(matrix);
  if (bewaard) return bewaard;
  const groepen = new Map<string, StudierichtingGroep>();
  const perTitel = new Map<string, StudierichtingGroep[]>();
  for (const g of matrix.groepen) {
    groepen.set(g.nummer, g);
    const sleutel = titelSleutel(g.titel);
    const lijst = perTitel.get(sleutel);
    if (lijst) lijst.push(g);
    else perTitel.set(sleutel, [g]);
  }
  const onderdelenVanGroep = new Map<string, Structuuronderdeel[]>();
  const groepVanOnderdeel = new Map<number, string>();
  for (const o of matrix.onderdelen) {
    groepVanOnderdeel.set(o.nummer, o.groep);
    const lijst = onderdelenVanGroep.get(o.groep);
    if (lijst) lijst.push(o);
    else onderdelenVanGroep.set(o.groep, [o]);
  }
  for (const lijst of onderdelenVanGroep.values()) lijst.sort(opNummer);
  const opzoek = { groepen, onderdelenVanGroep, groepVanOnderdeel, perTitel };
  OPZOEK.set(matrix, opzoek);
  return opzoek;
}

/** Een richting is afgebouwd als al haar onderdelen een einddatum vóór vandaag hebben (en ze er minstens één heeft). */
function isGroepAfgebouwd(onderdelen: readonly Structuuronderdeel[], vandaag: string): boolean {
  return onderdelen.length > 0 && onderdelen.every((o) => isAfgebouwd(o, vandaag));
}

/** "DOMEINOVERSCHRIJDEND" wordt "Domeinoverschrijdend"; een afkorting zoals "STEM" blijft staan. Gemengde schrijfwijze blijft ook. */
function leesbaarDomein(tekst: string): string {
  const t = tekst.trim().replace(/\s+/g, ' ');
  if (t === '' || t !== t.toUpperCase()) return t;
  if (/^[A-Z]{2,4}$/.test(t)) return t;
  const klein = t.toLowerCase();
  return klein.charAt(0).toUpperCase() + klein.slice(1);
}

function bouwInfo(opzoek: MatrixOpzoek, g: StudierichtingGroep, vandaag: string): RichtingInfo {
  const onderdelen = opzoek.onderdelenVanGroep.get(g.nummer) ?? [];
  const geldig = onderdelen.filter((o) => !isAfgebouwd(o, vandaag));
  const afgebouwd = isGroepAfgebouwd(onderdelen, vandaag);
  // Een afgebouwde richting heeft geen geldige onderdelen meer: dan beschrijven de onderdelen die ze had haar.
  const basis = geldig.length > 0 ? geldig : onderdelen;
  const soort = soortVanGroep(g, onderdelen);
  const graad = g.graad === '1' ? 1 : g.graad === '2' ? 2 : g.graad === '3' ? 3 : undefined;
  const stroom = graad === 1 ? stroomVanEersteGraad(g.titel) : undefined;

  const jaren: number[] = [];
  for (const o of basis) {
    if (o.aanloop === true) continue;
    for (const lj of o.leerjaren) {
      if (geldig.length > 0 && isAfgebouwd(lj, vandaag)) continue;
      const jaar = jaarVan(g.graad, lj.code);
      if (jaar !== undefined) jaren.push(jaar);
    }
  }

  const afgebouwdSinds = afgebouwd
    ? onderdelen.map((o) => o.einddatum ?? '').sort().pop() || undefined
    : undefined;

  const opvolgerNummers = new Set<string>();
  for (const o of onderdelen) {
    for (const volgende of o.volgende ?? []) {
      const nr = opzoek.groepVanOnderdeel.get(volgende);
      if (nr !== undefined && nr !== g.nummer) opvolgerNummers.add(nr);
    }
  }
  const opvolgers = [...opvolgerNummers]
    .sort(vergelijkGroepnummer)
    .map((nr) => opzoek.groepen.get(nr))
    .filter((x): x is StudierichtingGroep => x !== undefined);

  const zelfdeNaam = g.graad === undefined
    ? []
    : (opzoek.perTitel.get(titelSleutel(g.titel)) ?? [])
      .filter((andere) => {
        if (andere.nummer === g.nummer || andere.graad === undefined || andere.graad === g.graad) return false;
        const hunOnderdelen = opzoek.onderdelenVanGroep.get(andere.nummer) ?? [];
        const hunSoort = soortVanGroep(andere, hunOnderdelen);
        return hunSoort !== 'buso' && hunSoort !== 'aanloop' && !isGroepAfgebouwd(hunOnderdelen, vandaag);
      })
      .sort((a, b) => vergelijkGroepnummer(a.nummer, b.nummer));

  return {
    groep: g,
    onderdelen,
    soort,
    ...(graad !== undefined ? { graad } : {}),
    jaren: sorteerUniek(jaren, (a, b) => a - b),
    ...(stroom ? { stroom } : {}),
    vormen: sorteerUniek(basis.flatMap((o) => (o.onderwijsvorm ? [o.onderwijsvorm.trim().toLowerCase()] : [])).filter(Boolean), vergelijkNatuurlijk),
    domeinen: sorteerUniek(
      basis.flatMap((o) => (o.studiedomein?.omschrijving ? [leesbaarDomein(o.studiedomein.omschrijving)] : [])).filter(Boolean),
      (a, b) => a.localeCompare(b, 'nl'),
    ),
    duaal: basis.some((o) => o.duaal === true),
    kanBuso: geldig.some((o) => o.ov4 === true),
    afgebouwd,
    ...(afgebouwdSinds ? { afgebouwdSinds } : {}),
    opvolgers,
    zelfdeNaam,
    ...(g.nietMeerInBron ? { nietMeerInBron: g.nietMeerInBron } : {}),
  };
}

/**
 * De richting met dit groepnummer, met wat we eruit afleiden (jaren, stroom, vormen, domeinen, opvolgers, …). `vandaag`
 * is JJJJ-MM-DD en bepaalt wat afgebouwd is. `undefined` als de groep niet in de matrix staat.
 *
 * Een afgebouwde richting (alle onderdelen met een einddatum vóór vandaag) houdt de jaren, vormen en domeinen die ze
 * had, zodat het scherm ze nog kan beschrijven; haar `kanBuso` is dan wel onwaar.
 */
export function richtingInfo(matrix: MatrixBestand, groep: string, vandaag: string): RichtingInfo | undefined {
  const opzoek = opzoekVan(matrix);
  const g = opzoek.groepen.get(groep);
  return g ? bouwInfo(opzoek, g, vandaag) : undefined;
}

/**
 * De richtingen die aan het filter voldoen, op titel en daarna op groepnummer.
 *
 * Standaard: de gewone richtingen (soort `gewoon` en `ander`), niet afgebouwd en nog in de bron. Met `ookMeer` ook
 * zevende jaren, aanloopjaren en buitengewoon onderwijs; met `afgebouwd` ook wat afgebouwd is of niet meer in de bron
 * staat. Zoeken gebeurt zonder accenten en hoofdletters in de titel, de titels van de onderdelen en de studiedomeinen;
 * elk woord moet ergens passen.
 */
export function filterRichtingen(matrix: MatrixBestand, filter: RichtingFilter, vandaag: string): RichtingInfo[] {
  const opzoek = opzoekVan(matrix);
  const termen = zoekTermen(filter.zoek);
  const uit: { info: RichtingInfo; sleutel: string }[] = [];
  for (const g of matrix.groepen) {
    const info = bouwInfo(opzoek, g, vandaag);
    if (!filter.ookMeer && info.soort !== 'gewoon' && info.soort !== 'ander') continue;
    if (!filter.afgebouwd && (info.afgebouwd || info.nietMeerInBron !== undefined)) continue;
    if (filter.graad !== undefined && info.graad !== filter.graad) continue;
    if (filter.finaliteit !== undefined && filter.finaliteit !== '' && g.finaliteit !== filter.finaliteit) continue;
    if (termen.length > 0) {
      const hooi = zonderAccenten([g.titel, ...info.onderdelen.map((o) => o.titel), ...info.domeinen].join(' '));
      if (!termen.every((t) => hooi.includes(t))) continue;
    }
    uit.push({ info, sleutel: titelSleutel(g.titel) });
  }
  uit.sort((a, b) => (a.sleutel < b.sleutel ? -1 : a.sleutel > b.sleutel ? 1 : vergelijkGroepnummer(a.info.groep.nummer, b.info.groep.nummer)));
  return uit.map((u) => u.info);
}

// ── Weergave ────────────────────────────────────────────────────────────────

/** "3de jaar", "3de en 4de jaar", "5de, 6de en 7de jaar". Leeg zonder jaren. */
function jarenTekst(jaren: readonly number[]): string {
  const delen = jaren.map((j) => jaarTekst(j).replace(/ jaar$/, '')).filter(Boolean);
  if (delen.length === 0) return '';
  const som = delen.length === 1 ? delen[0] : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
  return `${som} jaar`;
}

/**
 * De kenmerken van een richting in één regel, voor onder de titel: "2de graad · Doorstroomfinaliteit · aso ·
 * Domeinoverschrijdend · 3de en 4de jaar". Wat niet bekend is, blijft weg; in de 1ste graad staan de jaren niet (de titel
 * noemt het leerjaar al). Een onbekende finaliteitscode staat er zoals ze is. Een richting van het buitengewoon
 * onderwijs heeft geen graad: dan staat er "Buitengewoon onderwijs".
 */
export function kenmerkenVan(info: RichtingInfo): string {
  const finaliteit = info.groep.finaliteit;
  return [
    info.graad !== undefined ? graadTekst(info.graad) : info.soort === 'buso' ? 'Buitengewoon onderwijs' : '',
    finaliteit ? (FINALITEIT_LABEL[finaliteit] ?? finaliteit) : '',
    info.vormen.join(', '),
    info.domeinen.join(', '),
    info.graad === 1 ? '' : jarenTekst(info.jaren),
  ].filter(Boolean).join(' · ');
}

/**
 * Het soort onderwijs dat echt geldt: een richting van het buitengewoon onderwijs is altijd `buso`; een gewone richting
 * alleen als een geldig onderdeel `ov4` heeft; anders `so`.
 */
function effectiefSoort(info: RichtingInfo, gevraagd: SoortKeuze): SoortKeuze {
  if (info.soort === 'buso') return 'buso';
  return gevraagd === 'buso' && info.kanBuso ? 'buso' : 'so';
}

/**
 * De doelgroep voor een cursus of leerplan bij deze keuze (gesaneerd). De titel is die van het gekozen onderdeel, of
 * anders van de groep. Een onderdeel dat niet bij de richting hoort, valt weg. Het kader en `volgtKader` zet de
 * oproeper zelf.
 */
export function doelgroepVan(info: RichtingInfo, keuze: RichtingKeuze, extra?: { vak?: string }): Doelgroep {
  const onderdeel = keuze.onderdeel !== undefined ? info.onderdelen.find((o) => o.nummer === keuze.onderdeel) : undefined;
  const ruw: Doelgroep = {
    groep: info.groep.nummer,
    titel: onderdeel?.titel ?? info.groep.titel,
    soort: effectiefSoort(info, keuze.soort),
    ...(info.graad !== undefined ? { graad: info.graad } : {}),
    ...(keuze.jaar !== undefined ? { jaar: keuze.jaar } : {}),
    ...(onderdeel ? { onderdeel: onderdeel.nummer } : {}),
    ...(extra?.vak ? { vak: extra.vak } : {}),
  };
  return sanitizeDoelgroep(ruw) ?? ruw;
}

/**
 * Sleutel van het kader: twee keuzes met dezelfde sleutel hebben hetzelfde kader. In de 1ste graad delen het 1ste en
 * 2de leerjaar van een stroom hun kader ("1|A|so"); anders is het de groep ("G-0193|so").
 */
export function kaderGroepSleutel(info: RichtingInfo, soort: SoortKeuze): string {
  return info.graad === 1 && info.stroom ? `1|${info.stroom}|${soort}` : `${info.groep.nummer}|${soort}`;
}

// ── Het kader ───────────────────────────────────────────────────────────────

/**
 * Past een set bij het jaar van de richting (R4)? Het officiële veld `leerjaar` van een set is alleen "3de leerjaar":
 * - een richting van de 3de graad die geen zevende jaar is (5de en 6de jaar): sets van het "3de leerjaar" niet;
 * - een zevende jaar: zijn er sets van het "3de leerjaar" (`heeftLj3`), dan alleen die, anders alle sets;
 * - al de rest (1ste en 2de graad, buitengewoon onderwijs): alle sets.
 * Te bevestigen bij de eerste echte run (§ 17).
 */
export function setPastBijJaar(set: { leerjaar?: string }, info: RichtingInfo, heeftLj3: boolean): boolean {
  const isLj3 = set.leerjaar === LEERJAAR_3;
  if (info.soort === 'zevende') return heeftLj3 ? isLj3 : true;
  if (info.graad === 3) return !isLj3;
  return true;
}

const PER_ID = new WeakMap<readonly MinimumdoelenIndexSet[], Map<string, MinimumdoelenIndexSet>>();

function indexPerId(index: readonly MinimumdoelenIndexSet[]): Map<string, MinimumdoelenIndexSet> {
  const bewaard = PER_ID.get(index);
  if (bewaard) return bewaard;
  const uit = new Map<string, MinimumdoelenIndexSet>();
  for (const s of index) uit.set(s.id, s);
  PER_ID.set(index, uit);
  return uit;
}

function setNummer(a: KaderSet, b: KaderSet): number {
  return vergelijkNatuurlijk(a.set.id, b.set.id);
}

function somIds(sets: readonly KaderSet[]): number {
  return sets.reduce((n, s) => n + s.ids.length, 0);
}

/**
 * Het kader van een keuze: de sets en doelen die bij de richting horen, uit het koppelingsbestand (`bestand`, de
 * index-regel `regel` van de groep) en de index met minimumdoelen. De regels (§ 9.1), in deze volgorde:
 *
 * - R1: alleen sets uit de index; de rest staat in `onbekend`.
 * - R2: het soort onderwijs. Een set is buitengewoon als `onderwijssoort` "Buitengewoon" is, anders beslist de naam
 *   (`soortVanSet`). De keuze is `so`, tenzij de richting buitengewoon onderwijs is of een geldig onderdeel `ov4` heeft
 *   en `buso` gekozen werd (`kader.keuze.soort` is het soort dat echt gebruikt werd). Andere sets: `verborgenAndereSoort`.
 * - R3: oude versies (`oudeVersieIds`) vallen weg: `verborgenOud`.
 * - R4: het jaar (`setPastBijJaar`): wat niet past staat in `nietVoorDitJaar`.
 * - R5: `volledig` (`ids.length === setAantal`) en `versieGelijk` (`setSha` = begin van de `sha256` in de index).
 * - R6: een uitbreidingsset is niet `verplicht` en telt niet mee in `aantalVerplicht`.
 * - R7: oplopend setnummer. De doelen blijven in de volgorde van de koppeling; de volgorde in de lijst volgt de set.
 *
 * Telt een set voor meer dan één regel, dan beslist de eerste regel in bovenstaande volgorde (zo telt een oude set van het
 * andere soort onderwijs alleen bij `verborgenAndereSoort`).
 *
 * Herkomst: `api` of `graad-en-stroom` uit het bestand; `geen` als de API voor de richting geen doelen geeft (een
 * laatst bekend bestand wordt dan nog gebruikt, met `nietMeerInBron`); `nog-niet-opgehaald` zonder index-regel, voor
 * een groep die nog niet opgehaald is, of als het bestand van een gekoppelde groep ontbreekt.
 * `teGroot`: meer dan `MAX_SETS` sets of `MAX_DOELEN` doelen.
 */
export function bouwKader(
  bestand: RichtingDoelenBestand | null,
  regel: RichtingDoelenIndexRegel | undefined,
  index: readonly MinimumdoelenIndexSet[],
  keuze: RichtingKeuze,
  info: RichtingInfo,
): RichtingKader {
  const soort = effectiefSoort(info, keuze.soort);
  const eigenBestand = bestand !== null && bestand.groep === info.groep.nummer ? bestand : null;

  let herkomst: KaderHerkomst;
  let bron: RichtingDoelenBestand | null = null;
  if (regel === undefined || regel.status === 'nog-niet-opgehaald') {
    herkomst = 'nog-niet-opgehaald';
  } else if (regel.status === 'geen') {
    herkomst = 'geen';
    bron = eigenBestand;
  } else if (eigenBestand === null) {
    herkomst = 'nog-niet-opgehaald';
  } else {
    herkomst = eigenBestand.methode;
    bron = eigenBestand;
  }

  const perId = indexPerId(index);
  const oud = oudeVersieIds(index);
  const onbekend: string[] = [];
  let verborgenAndereSoort = 0;
  let verborgenOud = 0;
  const kandidaten: KaderSet[] = [];
  for (const s of bron?.sets ?? []) {
    const ind = perId.get(s.set);
    if (ind === undefined) {
      onbekend.push(s.set);
      continue;
    }
    if (soortVanKoppelSet(s, ind) !== soort) {
      verborgenAndereSoort++;
      continue;
    }
    if (oud.has(ind.id)) {
      verborgenOud++;
      continue;
    }
    kandidaten.push({
      set: ind,
      ids: s.ids,
      volledig: s.ids.length === s.setAantal,
      verplicht: !isUitbreidingsSet(ind.naam),
      versieGelijk: s.setSha === ind.sha256.slice(0, 16),
    });
  }

  const heeftLj3 = kandidaten.some((k) => k.set.leerjaar === LEERJAAR_3);
  const sets: KaderSet[] = [];
  const nietVoorDitJaar: KaderSet[] = [];
  for (const k of kandidaten) (setPastBijJaar(k.set, info, heeftLj3) ? sets : nietVoorDitJaar).push(k);
  sets.sort(setNummer);
  nietVoorDitJaar.sort(setNummer);

  const aantalDoelen = somIds(sets);
  const opgehaald = bron?.opgehaald ?? regel?.opgehaald;
  const nietMeerInBron = bron?.nietMeerInBron ?? regel?.nietMeerInBron;
  return {
    keuze: { ...keuze, soort },
    herkomst,
    ...(opgehaald ? { opgehaald } : {}),
    ...(nietMeerInBron ? { nietMeerInBron } : {}),
    sets,
    aantalDoelen,
    aantalVerplicht: somIds(sets.filter((k) => k.verplicht)),
    nietVoorDitJaar,
    verborgenOud,
    verborgenAndereSoort,
    onbekend: sorteerUniek(onbekend, vergelijkNatuurlijk),
    teGroot: sets.length > MAX_SETS || aantalDoelen > MAX_DOELEN,
  };
}

/** R2: het officiële veld `onderwijssoort` ("Buitengewoon"), met de naam van de set als terugval. */
function soortVanKoppelSet(koppel: RichtingDoelenSet, ind: MinimumdoelenIndexSet): SoortOnderwijs {
  return koppel.onderwijssoort === 'Buitengewoon' ? 'buso' : soortVanSet(ind.naam);
}

// ── Van kader naar keuze ────────────────────────────────────────────────────

/**
 * Wat uit het kader gekozen wordt, per set: `'alle'` voor een volledige set (de huidige inhoud, ook als de versie
 * sindsdien veranderde), anders de nummers uit de koppeling. In de volgorde van het kader.
 *
 * Standaard alle verplichte sets. `sets` beperkt tot die sets. Uitbreidingssets komen er alleen in met
 * `ookUitbreiding`, ook als ze in `sets` staan.
 */
export function selectieVanKader(
  kader: RichtingKader,
  opties: { sets?: readonly string[]; ookUitbreiding?: boolean } = {},
): Map<string, 'alle' | readonly string[]> {
  const alleen = opties.sets ? new Set(opties.sets) : undefined;
  const uit = new Map<string, 'alle' | readonly string[]>();
  for (const k of kader.sets) {
    if (alleen && !alleen.has(k.set.id)) continue;
    if (!k.verplicht && !opties.ookUitbreiding) continue;
    uit.set(k.set.id, k.volledig ? 'alle' : k.ids);
  }
  return uit;
}

/**
 * Zet een selectie om naar de `SetKeuze[]` van `leerplanUitSelectie`, met de geladen setbestanden.
 *
 * Een volledige set blijft `'alle'`. Een deelset wordt ALTIJD een lijst vaste nummers, nooit `'alle'`, ook als de
 * lijst toevallig alle doelen van het bestand noemt (§ 9.5): zo kan een beperkte lijst nooit stil een hele set worden.
 * De nummers staan in de volgorde van de set. Nummers die niet (meer) in het bestand staan, komen in `ontbrekend`
 * (per set) en niet in de keuze; blijft er niets over, dan is er voor die set geen keuze. Een set zonder geladen
 * bestand valt weg.
 */
export function naarSetKeuzes(
  selectie: ReadonlyMap<string, 'alle' | readonly string[]>,
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>,
): { keuzes: SetKeuze[]; ontbrekend: { set: string; ids: string[] }[] } {
  const keuzes: SetKeuze[] = [];
  const ontbrekend: { set: string; ids: string[] }[] = [];
  for (const [set, gekozen] of selectie) {
    const bestand = bestanden.get(set);
    if (!bestand) continue;
    if (gekozen === 'alle') {
      keuzes.push({ bestand, doelen: 'alle' });
      continue;
    }
    const gevraagd = sorteerUniek(gekozen.map((id) => id.trim()).filter((id) => id !== ''), vergelijkNatuurlijk);
    const aanwezig = new Set<string>();
    const inVolgorde: string[] = [];
    const gevraagdSet = new Set(gevraagd);
    for (const doel of bestand.doelen) {
      const id = typeof doel?.id === 'string' ? doel.id.trim() : '';
      if (id !== '' && gevraagdSet.has(id) && !aanwezig.has(id)) {
        aanwezig.add(id);
        inVolgorde.push(id);
      }
    }
    const weg = gevraagd.filter((id) => !aanwezig.has(id));
    if (weg.length > 0) ontbrekend.push({ set, ids: weg });
    if (inVolgorde.length > 0) keuzes.push({ bestand, doelen: inVolgorde });
  }
  return { keuzes, ontbrekend };
}

/**
 * Vingerafdruk van het kader: sha256 (64 hex-tekens) van de gesorteerde regels "set|nummer", een volledige set als
 * "set|*". Beperkt tot `sets` (de ids van sets); zonder `sets` telt het hele kader, ook de uitbreidingssets. Hangt niet
 * af van de volgorde. Wie een leerplan met een kader vergelijkt, geeft de sets van het leerplan mee
 * (`leerplan.minimumdoelenSets`).
 */
export function kaderVingerafdruk(kader: RichtingKader, sets?: readonly string[]): string {
  const alleen = sets ? new Set(sets) : undefined;
  const regels: string[] = [];
  for (const k of kader.sets) {
    if (alleen && !alleen.has(k.set.id)) continue;
    if (k.volledig) regels.push(`${k.set.id}|*`);
    else for (const id of k.ids) regels.push(`${k.set.id}|${id}`);
  }
  regels.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Hex(regels.join('\n'));
}
