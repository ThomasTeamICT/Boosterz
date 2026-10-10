// Welke beroepskwalificaties horen bij een studierichting? (docs/STUDIERICHTINGEN.md § 23.6.9)
//
// Puur en zonder netwerk: de lader (beroepskwalificatiesBron.ts) haalt de koppeling en de index op, deze module rekent.
// De app maakt hier nooit zelf een koppeling: alles komt uit de koppeling onderdeel → erkenning → BK-versie (officieel,
// uit de API Structuuronderdelen) en uit de index van de BK-versies. Welke erkenning geldt, beslist `vandaag` (F3-B13):
// de wissel op 1 september gebeurt zo vanzelf.
//
// Nooit een competentiecode, ADV-nummer, onderdeelnummer of groepnummer in een tekst: deze module maakt geen teksten
// voor het scherm, op de terugvaltitel na.

import {
  erkenningenOp,
  splitsBk,
  vergelijkBkVersie,
  type BkIndex,
  type BkIndexRegel,
  type Erkenning,
  type KoppelingBestand,
  type OnderdeelKwalificaties,
} from './beroepskwalificaties';
import { geldigeOnderdelen, type RichtingInfo, type RichtingKeuze } from './richtingKader';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Waar de lijst vandaan komt: de officiële koppeling (`api`), de koppeling zegt dat er geen is (`geen`), of er is (nog)
 * niets geweten (`nog-niet-opgehaald`).
 */
export type BkHerkomst = 'api' | 'geen' | 'nog-niet-opgehaald';

/** Eén BK-versie die vandaag bij de richting hoort. */
export interface RichtingBkRegel {
  /** BK-versie, bv. "BK-0390-2". */
  bk: string;
  /** "BK-0390". */
  nummer: string;
  versie: number;
  /** Uit de index (de titel van het BK-bestand), anders de momentopname in de koppeling, anders een neutrale tekst. */
  titel: string;
  /** Niveau in de Vlaamse kwalificatiestructuur (1 tot 8), uit de index. */
  vks?: number;
  /** Aantal competenties, uit de index (alleen als er een bestand is). */
  aantal?: number;
  /** De onderdelen (varianten) waarvan een erkenning die vandaag geldt deze versie noemt, oplopend. */
  onderdelen: number[];
  /** Elk onderdeel waarover de koppeling iets weet, noemt deze versie: dan geen "alleen in: …" op het scherm. */
  alleOnderdelen: boolean;
  /**
   * JJJJ-MM-DD: de versie hoort na deze dag niet meer bij (een van) de onderdelen. Alleen als ze in elk onderdeel dat ze
   * noemt een einde heeft: de laatste einddatum van de erkenningen (nu en later) van dat onderdeel die haar noemen. Over
   * de onderdelen heen de vroegste. Noemt een erkenning zonder einddatum haar, dan is er geen einde.
   */
  totDatum?: string;
  /** Een nieuwere erkende versie van hetzelfde nummer (`laatstErkend` in de index); de richting verwijst nog naar deze. */
  nieuwereVersie?: string;
  /** JJJJ-MM-DD: de API geeft deze versie niet meer; het bestand is het laatst bekende. */
  nietMeerInBron?: string;
  /** Er is geen bestand met de competenties (niet in de index, niet gevonden of onbruikbaar). */
  zonderBestand?: true;
}

export type BekrachtigingSoort = 'onderwijskwalificatie' | 'beroepskwalificatie' | 'deelkwalificatie' | 'ander';

export interface RichtingBk {
  herkomst: BkHerkomst;
  /**
   * Alleen als het kader voor één gekozen onderdeel (variant) gemaakt is: dat onderdeel. Zo'n kader kan een BK missen die
   * in een andere variant bij de richting hoort; `vergelijkMetBk` zegt dan niets over "andere versie" of "niet meer bij
   * de richting".
   */
  onderdeel?: number;
  /** Het laatste tijdstip waarop een van de onderdelen opgehaald werd (anders dat van de koppeling). */
  opgehaald?: string;
  /** Op titel (nl), dan op versie (`vergelijkBkVersie`). */
  bks: RichtingBkRegel[];
  /** Wat leerlingen kunnen behalen (studiebekrachtigingen van de erkenningen die vandaag gelden), op naam. */
  bekrachtigingen: { naam: string; soort: BekrachtigingSoort }[];
  /**
   * Alleen als er vanaf een latere dag (de vroegste begindatum van een toekomstige erkenning) een andere lijst geldt, en
   * die lijst niet leeg is: de dag, en de titels die dan bij de richting horen (uniek, in de volgorde van `bks`).
   */
  toekomst?: { vanaf: string; titels: string[] };
}

/** Titel van een BK-versie zonder titel in de index en in de koppeling: nooit het BK-nummer als enige naam. */
export const BK_ZONDER_TITEL = 'Beroepskwalificatie zonder titel';

// ── Hulp ────────────────────────────────────────────────────────────────────

/**
 * Weet de koppeling iets over dit onderdeel? Opgehaald, of niet meer gevonden maar met een laatst bekend record. Een
 * onderdeel dat twee keer niet gevonden werd en nooit eerder opgehaald was, heeft geen erkenningen: daarover weten we
 * niets, dus ook niet dat er geen BK bij hoort.
 */
function isGeweten(r: OnderdeelKwalificaties | undefined): r is OnderdeelKwalificaties & { erkenningen: Erkenning[] } {
  return r !== undefined && Array.isArray(r.erkenningen) && (r.status === 'opgehaald' || r.status === 'niet-gevonden');
}

function nietLeeg(t: unknown): t is string {
  return typeof t === 'string' && t.trim() !== '';
}

/** De BK-versies die de erkenningen noemen (alleen geldige versies), zonder dubbels. */
function versiesVan(erkenningen: readonly Erkenning[]): Set<string> {
  const uit = new Set<string>();
  for (const e of erkenningen) {
    for (const b of Array.isArray(e.bks) ? e.bks : []) if (splitsBk(b?.bk) !== undefined) uit.add(b.bk);
  }
  return uit;
}

function soortVan(b: { onderwijskwalificatie?: true; bk?: string; dbk?: string }): BekrachtigingSoort {
  if (b.onderwijskwalificatie === true) return 'onderwijskwalificatie';
  if (nietLeeg(b.bk)) return 'beroepskwalificatie';
  if (nietLeeg(b.dbk)) return 'deelkwalificatie';
  return 'ander';
}

const SOORT_VOLGORDE: Record<BekrachtigingSoort, number> = { onderwijskwalificatie: 0, beroepskwalificatie: 1, deelkwalificatie: 2, ander: 3 };

function opTitel(a: { titel: string; bk: string }, b: { titel: string; bk: string }): number {
  return a.titel.localeCompare(b.titel, 'nl') || vergelijkBkVersie(a.bk, b.bk);
}

/**
 * Het einde van een BK-versie in één onderdeel: `undefined` als een erkenning (nu of later) die haar noemt geen
 * einddatum heeft, anders de laatste einddatum van die erkenningen.
 */
function eindeInOnderdeel(bk: string, relevant: readonly Erkenning[]): string | undefined {
  let laatste: string | undefined;
  for (const e of relevant) {
    if (!(Array.isArray(e.bks) && e.bks.some((b) => b?.bk === bk))) continue;
    if (!nietLeeg(e.einddatum)) return undefined;
    const d = e.einddatum.slice(0, 10);
    if (laatste === undefined || d > laatste) laatste = d;
  }
  return laatste;
}

// ── Het kader ───────────────────────────────────────────────────────────────

/**
 * De beroepskwalificaties van een richting bij een keuze, op `vandaag` (JJJJ-MM-DD).
 *
 * - Onderdelen: het gekozen onderdeel (`keuze.onderdeel`, als het bij de richting hoort), anders de geldige onderdelen
 *   (`geldigeOnderdelen`). Jaar en soort onderwijs (OV4) veranderen niets.
 * - Per onderdeel de erkenningen die vandaag gelden (`erkenningenOp(…).nu`), en daarvan de BK-versies: de unie op versie.
 *   Een record van een andere groep telt niet.
 * - Herkomst: `api` als er minstens één BK is (uit een onderdeel dat opgehaald is, of niet meer gevonden maar met een
 *   laatst bekend record); `geen` als er geen BK is en de koppeling over elk onderdeel iets weet (opgehaald, of niet
 *   meer gevonden met een laatst bekend record); `nog-niet-opgehaald` zonder koppeling, als geen enkel onderdeel iets
 *   oplevert, of als er geen BK is maar over een onderdeel niets geweten is: nog niet opgehaald, of twee keer niet
 *   gevonden zonder laatst bekend record (dan kunnen we niet zeggen dat er geen is).
 * - `onderdeel`: alleen als het kader voor één gekozen onderdeel gemaakt is.
 * - Per versie: titel, niveau en aantal uit de index; `zonderBestand` als de index er geen bestand voor heeft;
 *   `nieuwereVersie` als de laatst erkende versie van hetzelfde nummer hoger is; `nietMeerInBron` uit de index.
 * - `toekomst`: op de vroegste begindatum van een toekomstige erkenning wordt de lijst opnieuw berekend (zelfde
 *   onderdelen, zelfde regels); is ze anders en niet leeg, dan staat ze hier.
 *
 * Gooit een `TypeError` als `vandaag` geen JJJJ-MM-DD is (zoals `geldigeOnderdelen`).
 */
export function bkKader(
  koppeling: KoppelingBestand | null,
  index: BkIndex | null,
  info: RichtingInfo,
  keuze: RichtingKeuze,
  vandaag: string,
): RichtingBk {
  // Een ongeldige dag is een fout in de code (zoals bij `isAfgebouwd`): luid, ook als er een onderdeel gekozen is.
  if (typeof vandaag !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(vandaag)) {
    throw new TypeError(`bkKader: "vandaag" is geen datum (${JSON.stringify(vandaag)?.slice(0, 20)}).`);
  }
  const groep = info.groep.nummer;
  const gekozen = keuze?.onderdeel !== undefined ? info.onderdelen.find((o) => o.nummer === keuze.onderdeel) : undefined;
  const nummers = (gekozen ? [gekozen] : geldigeOnderdelen(info, vandaag)).map((o) => o.nummer);
  // Een kader voor één variant zegt dat altijd, ook als het leeg is.
  const variant = gekozen ? { onderdeel: gekozen.nummer } : {};
  const leeg: RichtingBk = { herkomst: 'nog-niet-opgehaald', ...variant, bks: [], bekrachtigingen: [] };
  if (!koppeling || !Array.isArray(koppeling.onderdelen) || nummers.length === 0) return leeg;

  const records = new Map<number, OnderdeelKwalificaties>();
  for (const r of koppeling.onderdelen) {
    if (r && r.groep === groep && !records.has(r.onderdeel)) records.set(r.onderdeel, r);
  }
  const geweten = nummers.filter((n) => isGeweten(records.get(n)));
  if (geweten.length === 0) return leeg;

  /** Per geweten onderdeel: de erkenningen die nu gelden, en die later beginnen. */
  const perOnderdeel = new Map<number, { nu: Erkenning[]; toekomst: Erkenning[]; alle: Erkenning[] }>();
  for (const n of geweten) {
    const alle = (records.get(n) as OnderdeelKwalificaties & { erkenningen: Erkenning[] }).erkenningen;
    perOnderdeel.set(n, { ...erkenningenOp(alle, vandaag), alle });
  }

  // De BK-versies van vandaag, met de onderdelen die ze noemen.
  const onderdelenVan = new Map<string, number[]>();
  const koppelTitel = new Map<string, string>();
  for (const n of geweten) {
    const { nu } = perOnderdeel.get(n) as { nu: Erkenning[] };
    for (const bk of versiesVan(nu)) {
      const lijst = onderdelenVan.get(bk) ?? [];
      lijst.push(n);
      onderdelenVan.set(bk, lijst);
    }
  }
  // De titels uit de koppeling: eerst die van de erkenningen van nu, dan die van de toekomstige (voor `toekomst`: een
  // versie die pas later bij de richting hoort, heeft anders geen titel als de index er geen kent).
  for (const welke of ['nu', 'toekomst'] as const) {
    for (const n of geweten) {
      for (const e of (perOnderdeel.get(n) as { nu: Erkenning[]; toekomst: Erkenning[] })[welke]) {
        for (const b of Array.isArray(e.bks) ? e.bks : []) {
          if (nietLeeg(b?.titel) && !koppelTitel.has(b.bk)) koppelTitel.set(b.bk, b.titel.trim());
        }
      }
    }
  }

  const indexRegels = new Map<string, BkIndexRegel>();
  for (const r of Array.isArray(index?.bks) ? (index as BkIndex).bks : []) if (r && !indexRegels.has(r.bk)) indexRegels.set(r.bk, r);
  const titelVan = (bk: string): string => {
    const r = indexRegels.get(bk);
    if (nietLeeg(r?.titel)) return r.titel.trim();
    return koppelTitel.get(bk) ?? BK_ZONDER_TITEL;
  };

  const bks: RichtingBkRegel[] = [];
  for (const [bk, onderdelen] of onderdelenVan) {
    const delen = splitsBk(bk) as { nummer: string; versie: number };
    const r = indexRegels.get(bk);
    const regel: RichtingBkRegel = {
      bk,
      nummer: delen.nummer,
      versie: delen.versie,
      titel: titelVan(bk),
      onderdelen: [...onderdelen].sort((a, b) => a - b),
      alleOnderdelen: onderdelen.length === geweten.length,
    };
    if (r?.vks !== undefined) regel.vks = r.vks;
    if (r?.aantal !== undefined) regel.aantal = r.aantal;
    const eindes = onderdelen.map((n) => {
      const { nu, toekomst } = perOnderdeel.get(n) as { nu: Erkenning[]; toekomst: Erkenning[] };
      return eindeInOnderdeel(bk, [...nu, ...toekomst]);
    });
    if (eindes.every((d) => d !== undefined)) regel.totDatum = (eindes as string[]).sort()[0];
    const laatst = r?.laatstErkend;
    const l = laatst !== undefined ? splitsBk(laatst) : undefined;
    if (l && l.nummer === delen.nummer && l.versie > delen.versie) regel.nieuwereVersie = laatst;
    if (nietLeeg(r?.nietMeerInBron)) regel.nietMeerInBron = r.nietMeerInBron;
    if (r === undefined || !nietLeeg(r.bestand)) regel.zonderBestand = true;
    bks.push(regel);
  }
  bks.sort(opTitel);

  // Wat leerlingen kunnen behalen: uniek op naam en soort.
  const bekrachtigingen: RichtingBk['bekrachtigingen'] = [];
  const gezien = new Set<string>();
  for (const n of geweten) {
    for (const e of (perOnderdeel.get(n) as { nu: Erkenning[] }).nu) {
      for (const b of Array.isArray(e.bekrachtigingen) ? e.bekrachtigingen : []) {
        if (!b || !nietLeeg(b.naam)) continue;
        const naam = b.naam.trim();
        const soort = soortVan(b);
        const sleutel = `${soort}\u0000${naam}`;
        if (gezien.has(sleutel)) continue;
        gezien.add(sleutel);
        bekrachtigingen.push({ naam, soort });
      }
    }
  }
  bekrachtigingen.sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || SOORT_VOLGORDE[a.soort] - SOORT_VOLGORDE[b.soort]);

  // Herkomst.
  let herkomst: BkHerkomst;
  if (bks.length > 0) herkomst = 'api';
  else if (nummers.every((n) => isGeweten(records.get(n)))) herkomst = 'geen';
  else herkomst = 'nog-niet-opgehaald';

  // Opgehaald: het laatste tijdstip van de onderdelen die iets opleveren.
  const tijden = geweten.map((n) => records.get(n)?.opgehaald).filter(nietLeeg).sort();
  const opgehaald = tijden.length > 0 ? tijden[tijden.length - 1] : nietLeeg(koppeling.opgehaald) ? koppeling.opgehaald : undefined;

  const uit: RichtingBk = { herkomst, ...variant, ...(opgehaald ? { opgehaald } : {}), bks, bekrachtigingen };
  const toekomst = toekomstVan(geweten, perOnderdeel, onderdelenVan, titelVan);
  if (toekomst) uit.toekomst = toekomst;
  return uit;
}

/**
 * De lijst op de vroegste begindatum van een toekomstige erkenning, als die anders is dan vandaag en niet leeg. Op die
 * dag gelden dezelfde regels (`erkenningenOp` met die dag), over dezelfde onderdelen.
 */
function toekomstVan(
  geweten: readonly number[],
  perOnderdeel: ReadonlyMap<number, { toekomst: Erkenning[]; alle: Erkenning[] }>,
  nuVersies: ReadonlyMap<string, number[]>,
  titelVan: (bk: string) => string,
): RichtingBk['toekomst'] {
  const begins: string[] = [];
  for (const n of geweten) {
    for (const e of (perOnderdeel.get(n) as { toekomst: Erkenning[] }).toekomst) {
      if (nietLeeg(e.begindatum)) begins.push(e.begindatum.slice(0, 10));
    }
  }
  if (begins.length === 0) return undefined;
  const vanaf = begins.sort()[0];
  const dan = new Set<string>();
  for (const n of geweten) {
    const { alle } = perOnderdeel.get(n) as { alle: Erkenning[] };
    for (const bk of versiesVan(erkenningenOp(alle, vanaf).nu)) dan.add(bk);
  }
  const zelfde = dan.size === nuVersies.size && [...dan].every((bk) => nuVersies.has(bk));
  if (zelfde || dan.size === 0) return undefined;
  const titels = [...dan].map((bk) => ({ bk, titel: titelVan(bk) })).sort(opTitel).map((x) => x.titel);
  return { vanaf, titels: [...new Set(titels)] };
}
