// Het register van de pakketten van het deel basisonderwijs (nu één: de Lichtkamer, schaduwtheater).
//
// Een pakket is een les met drie schermen: de lespagina voor de leerkracht (#/basis/pakket/…), het bord (#/basis/bord/…)
// en het kind (#/basis/oefen/…). Het register legt per pakket vast voor welk moment het geldt, in welke leerjaren het
// loopt en welke minimumdoelen het dekt. De doelen staan hier met hun set en hun vaste nummer, niet met hun tekst: de
// tekst komt letterlijk uit de officiële set. pakketten.test.ts bewaakt dat dit register en het manifest van het
// bewijsmodel (src/lib/basis/bewijs/lichtkamerManifest.ts) dezelfde doelen noemen.
//
// Zuiver en klein: dit bestand zit in de padlezer (basisRoutes.ts) en dus in het chunk van BasisDeel. Het importeert alleen
// types. Geen React, geen opslag, nergens de klok.

import type { Eindmoment, LeerjaarBasis, SoortBasis } from './kalender';

export type PakketNaam = 'lichtkamer';

/** Het adresdeel van een moment, zoals in #/basis/pakket/lichtkamer/einde-4de. */
export type PakketMoment = 'einde-4de';

/** De oefeningen waarmee het kind- of het bordscherm kan openen (?scherm=…), naast de keuze, de check en 'Wat ik al kan'. */
export type PakketBeginScherm = 'keuze' | 'waar-valt-de-schaduw' | 'drie-kaartjes' | 'onderzoek-schaduw' | 'check' | 'kan';

export const PAKKET_BEGINSCHERMEN: readonly PakketBeginScherm[] = ['keuze', 'waar-valt-de-schaduw', 'drie-kaartjes', 'onderzoek-schaduw', 'check', 'kan'];

export interface PakketDoel {
  /** De set waaruit de tekst komt. */
  set: string;
  /** Het vaste nummer van het doel in de API, als tekst. */
  id: string;
}

export interface Pakket {
  naam: PakketNaam;
  /** De naam van het pakket, als kop en als tegel. */
  titel: string;
  moment: PakketMoment;
  eind: Eindmoment;
  /** De leerjaren waarvoor de lespagina een stand heeft; het laatste is het leerjaar van het eindmoment. */
  leerjaren: readonly LeerjaarBasis[];
  doelen: readonly PakketDoel[];
}

export const PAKKETTEN: Readonly<Record<PakketNaam, Pakket>> = {
  lichtkamer: {
    naam: 'lichtkamer',
    titel: 'Lichtkamer: schaduwtheater',
    moment: 'einde-4de',
    eind: 'L4',
    leerjaren: ['L3', 'L4'],
    doelen: [
      { set: 'ODS_3408', id: '92767' },
      { set: 'ODS_3408', id: '92775' },
      { set: 'ODS_3408', id: '92777' },
    ],
  },
};

/** Het pakket bij een naam uit een adres; undefined als het niet bestaat. Zoekt nooit op een gewoon object. */
export function pakketVan(naam: string | undefined): Pakket | undefined {
  return naam === undefined ? undefined : Object.values(PAKKETTEN).find((p) => p.naam === naam);
}

/** Het pakket bij een naam en een moment uit een adres; undefined als een van beide niet klopt. */
export function pakketBijMoment(naam: string | undefined, moment: string | undefined): Pakket | undefined {
  const p = pakketVan(naam);
  return p && p.moment === moment ? p : undefined;
}

/** Een leerjaar dat bij dit pakket hoort, hoofdletters maken niet uit ('l3' wordt 'L3'); anders undefined. */
export function pakketLeerjaar(p: Pakket, tekst: string | null | undefined): LeerjaarBasis | undefined {
  if (typeof tekst !== 'string') return undefined;
  const hoofd = tekst.trim().toUpperCase();
  return p.leerjaren.find((l) => l === hoofd);
}

/** Een beginscherm uit ?scherm=…; undefined als het er niet bij hoort. */
export function pakketBeginScherm(tekst: string | null | undefined): PakketBeginScherm | undefined {
  return PAKKET_BEGINSCHERMEN.find((s) => s === tekst);
}

/**
 * Het volledige adres van een pad van het deel, bv. voor de kindlink: de plaats waar de app staat (zonder zoekopdracht en
 * zonder hash), een '#' en het pad uit basisPad. Zo werkt de link ook in een Smartschool-bericht of in een QR-code.
 */
export function volledigAdres(pad: string, plaats: { origin: string; pathname: string }): string {
  return `${plaats.origin}${plaats.pathname}#${pad}`;
}

/**
 * De pakketten die een leerkracht van dit leerjaar kan geven. Voorlopig alleen in het gewoon onderwijs ('bao'): het
 * buitengewoon onderwijs komt later, na overleg met de eigenaar.
 */
export function pakkettenVoorLeerjaar(soort: SoortBasis, leerjaar: LeerjaarBasis): Pakket[] {
  return soort === 'bao' ? Object.values(PAKKETTEN).filter((p) => p.leerjaren.includes(leerjaar)) : [];
}
