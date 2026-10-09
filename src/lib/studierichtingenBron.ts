// Studierichtingen in de app: lui ophalen uit public/leerplannen/structuur/ (docs/STUDIERICHTINGEN.md § 9.4).
//
// Naar het model van minimumdoelenBron.ts: de matrix en de index van de koppeling worden één keer opgehaald (gedeelde
// belofte, gewist bij een fout), de doelen van een richting pas als iemand de richting opent (cache van 20). Elk
// bestand gaat door de `valideer…`-functie van studierichtingen.ts. De gegevens blijven in het geheugen: nooit in
// localStorage. Zonder netwerk of zonder bestand blijft de rest van de app werken.

import type { MinimumdoelenIndex } from './minimumdoelen';
import { laadIndex } from './minimumdoelenBron';
import {
  GROEP_NUMMER,
  valideerMatrixBestand,
  valideerRichtingDoelenBestand,
  valideerRichtingDoelenIndex,
  type MatrixBestand,
  type RichtingDoelenBestand,
  type RichtingDoelenIndex,
  type RichtingDoelenIndexRegel,
} from './studierichtingen';

/** De map met de bestanden, naast de app (vite base './'; de hash-route verandert het pad niet). */
export const STRUCTUUR_MAP = `${import.meta.env.BASE_URL}leerplannen/structuur/`;
export const RICHTINGDOELEN_MAP = `${STRUCTUUR_MAP}richtingdoelen/`;

/** Zoveel richtingen blijven in het geheugen; de oudste gaat eruit. */
export const MAX_RICHTINGEN_IN_CACHE = 20;

export const FOUT_NOG_NIET_OPGEHAALD =
  'De lijst van de studierichtingen staat nog niet in Boosterz. Ze wordt elke maand opgehaald bij de Vlaamse overheid.';
export const FOUT_STUDIERICHTINGEN = 'De studierichtingen konden niet geladen worden. Controleer je verbinding en probeer opnieuw.';
export const FOUT_BESCHADIGD = 'De gegevens van de studierichtingen zijn beschadigd en konden niet gelezen worden. Probeer het later opnieuw.';

/** Wat een verzoek opleverde: het bestand ontbreekt, of de json ervan. */
type Antwoord = { ontbreekt: true } | { ontbreekt: false; json: unknown };

async function haalJson(url: string): Promise<Antwoord> {
  const res = await fetch(url);
  if (res.status === 404) return { ontbreekt: true };
  if (!res.ok) throw new Error(`status ${res.status}`);
  // Een dev- of previewserver beantwoordt een bestand dat er niet is met 200 en de startpagina van de app (de terugval
  // van de hash-router). Dat is geen verbindingsprobleem: het bestand ontbreekt gewoon.
  if (/\btext\/html\b/i.test(res.headers?.get('content-type') ?? '')) return { ontbreekt: true };
  try {
    return { ontbreekt: false, json: await res.json() };
  } catch (fout) {
    // Een antwoord dat helemaal geen json is, hoort bij zo'n terugval en dus bij een bestand dat er niet is. Een andere
    // fout tijdens het lezen (de verbinding valt weg) blijft een fout.
    if ((fout as { name?: string } | null)?.name === 'SyntaxError') return { ontbreekt: true };
    throw fout;
  }
}

/**
 * Haalt een bestand op. Een bestand dat er niet is (404, of een 200 met html of zonder json): `{ ontbreekt: true }`. Een
 * netwerkfout of een andere status: `FOUT_STUDIERICHTINGEN`.
 */
async function haal(url: string): Promise<Antwoord> {
  try {
    return await haalJson(url);
  } catch {
    throw new Error(FOUT_STUDIERICHTINGEN);
  }
}

function beschadigd(fouten: readonly string[]): Error {
  return new Error(`${FOUT_BESCHADIGD} (${fouten[0]})`);
}

// ── De matrix ───────────────────────────────────────────────────────────────

let matrixBelofte: Promise<MatrixBestand> | null = null;

async function haalMatrixOp(): Promise<MatrixBestand> {
  const res = await haal(`${STRUCTUUR_MAP}studierichtingen.json`);
  if (res.ontbreekt) throw new Error(FOUT_NOG_NIET_OPGEHAALD);
  const fouten = valideerMatrixBestand(res.json);
  if (fouten.length > 0) throw beschadigd(fouten);
  return res.json as MatrixBestand;
}

/**
 * De matrix van de studierichtingen, één keer opgehaald (gedeelde belofte). Een bestand dat niet bestaat (ook als de
 * server met de startpagina antwoordt in plaats van met een 404) geeft `FOUT_NOG_NIET_OPGEHAALD`, elke andere fout `FOUT_STUDIERICHTINGEN` of `FOUT_BESCHADIGD`. Bij een fout wordt de belofte
 * gewist, zodat een nieuwe poging echt opnieuw ophaalt.
 */
export function laadMatrix(): Promise<MatrixBestand> {
  if (!matrixBelofte) {
    const belofte = haalMatrixOp();
    matrixBelofte = belofte;
    belofte.catch(() => {
      if (matrixBelofte === belofte) matrixBelofte = null;
    });
  }
  return matrixBelofte;
}

// ── De index van de koppeling ───────────────────────────────────────────────

let koppelingBelofte: Promise<RichtingDoelenIndex | null> | null = null;

async function haalKoppelingOp(): Promise<RichtingDoelenIndex | null> {
  const res = await haal(`${RICHTINGDOELEN_MAP}index.json`);
  if (res.ontbreekt) return null;
  const fouten = valideerRichtingDoelenIndex(res.json);
  if (fouten.length > 0) throw beschadigd(fouten);
  return res.json as RichtingDoelenIndex;
}

/**
 * De index van de koppeling richting → doelen, één keer opgehaald (gedeelde belofte). Bestaat het bestand niet (404 of de
 * startpagina als terugval), dan is het resultaat `null` (de koppeling is nog niet opgehaald); een andere fout gooit en wist de belofte.
 */
export function laadRichtingDoelenIndex(): Promise<RichtingDoelenIndex | null> {
  if (!koppelingBelofte) {
    const belofte = haalKoppelingOp();
    koppelingBelofte = belofte;
    belofte.catch(() => {
      if (koppelingBelofte === belofte) koppelingBelofte = null;
    });
  }
  return koppelingBelofte;
}

// ── De doelen van één richting ──────────────────────────────────────────────

const richtingCache = new Map<string, Promise<RichtingDoelenBestand | null>>();

async function haalRichtingOp(groep: string): Promise<RichtingDoelenBestand | null> {
  const res = await haal(`${RICHTINGDOELEN_MAP}${groep}.json`);
  if (res.ontbreekt) return null;
  const fouten = valideerRichtingDoelenBestand(res.json, groep);
  if (fouten.length > 0) throw beschadigd(fouten);
  return res.json as RichtingDoelenBestand;
}

/**
 * De doelen van één richting, of `null` als het bestand niet bestaat (404 of de startpagina als terugval; de richting is niet gekoppeld of nog niet
 * opgehaald). Het groepnummer moet op `G-<4 tot 6 cijfers>` passen; alles anders is meteen een fout, zonder iets op te
 * halen. Het bestand moet bij die groep horen. Een gelezen bestand blijft in het geheugen (maximaal 20; de oudste gaat
 * eruit). Een mislukte poging blijft niet in de cache staan.
 */
export function laadRichtingDoelen(groep: string): Promise<RichtingDoelenBestand | null> {
  if (typeof groep !== 'string' || !GROEP_NUMMER.test(groep)) {
    return Promise.reject(new Error(`Ongeldig groepnummer (${JSON.stringify(groep)?.slice(0, 40)}). Kies een studierichting uit de lijst.`));
  }
  const bewaard = richtingCache.get(groep);
  if (bewaard) return bewaard;
  const belofte = haalRichtingOp(groep);
  richtingCache.set(groep, belofte);
  while (richtingCache.size > MAX_RICHTINGEN_IN_CACHE) {
    const oudste = richtingCache.keys().next().value as string;
    richtingCache.delete(oudste);
  }
  belofte.catch(() => {
    if (richtingCache.get(groep) === belofte) richtingCache.delete(groep);
  });
  return belofte;
}

/** Leegt de caches: voor tests, en om na een fout helemaal opnieuw te beginnen. */
export function wisStudierichtingenCache(): void {
  matrixBelofte = null;
  koppelingBelofte = null;
  richtingCache.clear();
}

// ── Gegevens voor de schermen (onder de hooks) ──────────────────────────────

export interface RichtingGegevens {
  matrix: MatrixBestand;
  /** `null`: de koppeling is nog niet opgehaald. */
  koppeling: RichtingDoelenIndex | null;
  index: MinimumdoelenIndex;
}

/**
 * Wat de lijst en het detail van de richtingen nodig hebben: de matrix, de index van de koppeling en de index met
 * minimumdoelen. Mislukt er meer dan één, dan beslist de volgorde matrix, koppeling, minimumdoelen: zo blijft de
 * melding dezelfde, ook als de ene vroeger faalt dan de andere.
 */
export async function laadRichtingGegevens(): Promise<RichtingGegevens> {
  const [matrix, koppeling, index] = await Promise.allSettled([laadMatrix(), laadRichtingDoelenIndex(), laadIndex()]);
  if (matrix.status === 'rejected') throw matrix.reason;
  if (koppeling.status === 'rejected') throw koppeling.reason;
  if (index.status === 'rejected') throw index.reason;
  return { matrix: matrix.value, koppeling: koppeling.value, index: index.value };
}

export interface KaderGegevens {
  /** De regel van de groep in de index van de koppeling, als die er is. */
  regel: RichtingDoelenIndexRegel | undefined;
  /** Het bestand met de doelen van de groep; `null` als de koppeling er geen heeft (of de groep niet in de index staat). */
  bestand: RichtingDoelenBestand | null;
  index: MinimumdoelenIndex;
}

/**
 * Wat nodig is om het kader van één richting te bouwen. Het bestand van de groep wordt alleen opgehaald als de index
 * van de koppeling er een noemt (`regel.bestand`): voor een groep zonder koppeling gaat er geen verzoek weg.
 */
export async function laadKaderGegevens(groep: string): Promise<KaderGegevens> {
  const [koppeling, index] = await Promise.all([laadRichtingDoelenIndex(), laadIndex()]);
  const regel = koppeling?.groepen.find((r) => r.groep === groep);
  const bestand = regel?.bestand !== undefined ? await laadRichtingDoelen(groep) : null;
  return { regel, bestand, index };
}
