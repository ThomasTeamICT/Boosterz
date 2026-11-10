// Het laden van de gegevens van het GO! in de app: de index, de leerplandoelen per vak, de lesplannen en de
// omgekeerde index per vak van het minimumdoel (public/basis/go/, zie docs/basisonderwijs/GO-LEERPLAN.md, "Opslag").
//
// Elk bestand heeft een strikt patroon voor zijn naam, krijgt bij het laden de lichte controle (lichteControle.ts: het
// soort, de versie en de velden die de schermen lezen) en blijft daarna in een kleine cache. Streng valideren
// (valideer.ts) gebeurt bij de import en in de uitrolpoort, niet in de app: dat kost op een trage Chromebook merkbaar
// tijd en zou een tabblad dat openstond tijdens een uitrol met een nieuw optioneel veld laten weigeren. De cache houdt
// alle twaalf leerplannen (samen ±5 MB) en gooit, als de grens toch telt, het minst recent gebruikte bestand eruit.
// De service worker bewaart de bestanden voor offline gebruik, al vanaf het eerste bezoek ('andere eigen bestanden:
// netwerk eerst, cache als terugval'); PRECACHE_PUBLIC blijft gelijk.
//
// Een foutmelding staat op het scherm: in gewone woorden, zonder het detail van de controle (dat gaat naar de console).
//
// De tekst van een minimumdoel komt hier nooit voor: die haalt een scherm via laadSet uit de officiële gegevens.

import { lichtGoBijMinimumdoel, lichtGoIndex, lichtGoLeerplan, lichtGoLesplan } from './lichteControle';
import { GO_VAK_CODES, GO_VAKKEN, isGoVak } from './types';
import type { GoBijMinimumdoelBestand, GoIndex, GoLeerplanBestand, GoLesplanBestand, GoVak } from './types';

/** De map met de bestanden, naast de app (vite base './'; de hash-route verandert het pad niet). */
export const GO_MAP = `${import.meta.env.BASE_URL}basis/go/`;

export const FOUT_GO_NIET_GELADEN =
  'De gegevens van het GO! konden niet geladen worden. Kijk je internetverbinding na en probeer opnieuw.';

/**
 * Het einde van de melding als een bestand niet bestaat (404). De laadstand bewaart alleen de tekst van een fout, dus
 * een scherm herkent 'niet gevonden' met isGoNietGevonden, nooit met een eigen stukje tekst.
 */
export const GO_NIET_GEVONDEN = 'bestaat niet (meer).';

/** Is deze melding die van een bestand dat niet bestaat ('Het lesplan LP9999 bestaat niet (meer).')? */
export function isGoNietGevonden(fout: string): boolean {
  return typeof fout === 'string' && fout.endsWith(GO_NIET_GEVONDEN);
}

/** Het bestand bestaat niet (meer): een schermtekst als 'Dit lesplan vonden we niet' hoort daarbij, geen foutbericht. */
export class GoNietGevondenFout extends Error {
  constructor(boodschap: string) {
    super(boodschap);
    this.name = 'GoNietGevondenFout';
  }
}

/** 'LP0065' of 'LP0014a': de enige vorm van een lesplancode in een bestandsnaam. */
const LESPLAN_CODE = /^LP\d{4}[a-z]?$/;

/** Hoeveel bestanden van elke soort in het geheugen blijven; daarboven gaat het minst recent gebruikte eruit. */
export const MAX_LEERPLANNEN_IN_CACHE = 12;
export const MAX_LESPLANNEN_IN_CACHE = 8;
export const MAX_BIJ_MINIMUMDOEL_IN_CACHE = 10;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Is dit een lesplancode zoals ze in een bestandsnaam staat (hoofdletters LP, daarna 4 cijfers en eventueel één kleine letter)? */
export function isGeldigeLesplancode(code: string): boolean {
  return typeof code === 'string' && LESPLAN_CODE.test(code);
}

/** Is dit het nummer van een vak van het minimumdoel (1 tot 10)? */
export function isGeldigMinimumdoelVak(vak: number): boolean {
  return Number.isInteger(vak) && vak >= 1 && vak <= 10;
}

async function haalJson(bestand: string, wat: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${GO_MAP}${bestand}`);
  } catch {
    throw new Error(FOUT_GO_NIET_GELADEN);
  }
  if (res.status === 404) throw new GoNietGevondenFout(`${wat} ${GO_NIET_GEVONDEN}`);
  if (!res.ok) throw new Error(FOUT_GO_NIET_GELADEN);
  try {
    return await res.json();
  } catch {
    throw new Error(FOUT_GO_NIET_GELADEN);
  }
}

/**
 * Het bestand komt niet door de lichte controle. Meestal is het een tabblad dat openstond tijdens een uitrol (oude code,
 * nieuwe gegevens): dan helpt de pagina opnieuw laden. Het detail gaat naar de console, niet naar het scherm.
 */
function beschadigd(wat: string, fouten: string[]): Error {
  console.warn(`Boosterz: ${wat}`, fouten.slice(0, 5));
  return new Error(`${wat} kon niet gelezen worden. Laad de pagina opnieuw; lukt het dan nog niet, probeer het later nog eens.`);
}

/**
 * Een kleine cache van beloften, met een grens; een mislukte poging blijft er niet in staan. Een treffer schuift
 * achteraan, dus boven de grens gaat het minst recent gebruikte bestand eruit. Geëxporteerd voor de test.
 */
export class BelofteCache<T> {
  private readonly map = new Map<string, Promise<T>>();
  constructor(private readonly max: number) {}

  haal(sleutel: string, maak: () => Promise<T>): Promise<T> {
    const bewaard = this.map.get(sleutel);
    if (bewaard) {
      this.map.delete(sleutel);
      this.map.set(sleutel, bewaard);
      return bewaard;
    }
    const belofte = maak();
    this.map.set(sleutel, belofte);
    while (this.map.size > this.max) {
      const minstRecent = this.map.keys().next().value as string;
      this.map.delete(minstRecent);
    }
    belofte.catch(() => {
      if (this.map.get(sleutel) === belofte) this.map.delete(sleutel);
    });
    return belofte;
  }

  get grootte(): number {
    return this.map.size;
  }

  wis(): void {
    this.map.clear();
  }
}

// ── Index ───────────────────────────────────────────────────────────────────
let indexBelofte: Promise<GoIndex> | null = null;

async function haalIndexOp(): Promise<GoIndex> {
  const wat = 'Het overzicht van het GO!';
  const json = await haalJson('index.json', wat);
  const fouten = lichtGoIndex(json);
  if (fouten.length > 0) throw beschadigd(wat, fouten);
  return json as GoIndex;
}

/**
 * De index van het GO!: lesplannen, leerplan per vak en de omgekeerde index. Eén keer opgehaald (gedeelde belofte); bij
 * een fout wordt de cache gewist, zodat een nieuwe poging echt opnieuw ophaalt.
 */
export function laadGoIndex(): Promise<GoIndex> {
  if (!indexBelofte) {
    const belofte = haalIndexOp();
    indexBelofte = belofte;
    belofte.catch(() => {
      if (indexBelofte === belofte) indexBelofte = null;
    });
  }
  return indexBelofte;
}

// ── Leerplan van één vak ────────────────────────────────────────────────────
const leerplanCache = new BelofteCache<GoLeerplanBestand>(MAX_LEERPLANNEN_IN_CACHE);

async function haalLeerplanOp(vak: GoVak): Promise<GoLeerplanBestand> {
  const wat = `Het leerplan ${GO_VAKKEN[vak].doelenset} van het GO!`;
  const json = await haalJson(`leerplan/${vak}.json`, wat);
  const fouten = lichtGoLeerplan(json);
  if (fouten.length === 0 && (json as GoLeerplanBestand).vak !== vak) fouten.push(`het bestand hoort bij een ander vak (${String((json as GoLeerplanBestand).vak)})`);
  if (fouten.length > 0) throw beschadigd(wat, fouten);
  return json as GoLeerplanBestand;
}

/** Alle leerplandoelen van één vakdiscipline ('WT'). Een ander voorvoegsel is meteen een fout, zonder iets op te halen. */
export function laadGoLeerplan(vak: GoVak): Promise<GoLeerplanBestand> {
  if (!isGoVak(vak)) {
    return Promise.reject(new Error(`Ongeldig vak (${JSON.stringify(vak).slice(0, 40)}). Kies een vak uit de lijst: ${GO_VAK_CODES.join(', ')}.`));
  }
  return leerplanCache.haal(vak, () => haalLeerplanOp(vak));
}

// ── Lesplan ─────────────────────────────────────────────────────────────────
const lesplanCache = new BelofteCache<GoLesplanBestand>(MAX_LESPLANNEN_IN_CACHE);

async function haalLesplanOp(code: string): Promise<GoLesplanBestand> {
  const wat = `Het lesplan ${code}`;
  const json = await haalJson(`lesplannen/${code}.json`, wat);
  const fouten = lichtGoLesplan(json);
  if (fouten.length === 0 && (json as GoLesplanBestand).code !== code) fouten.push(`het bestand hoort bij een ander lesplan (${String((json as GoLesplanBestand).code)})`);
  if (fouten.length > 0) throw beschadigd(wat, fouten);
  return json as GoLesplanBestand;
}

/** Eén lesplan, bv. 'LP0065'. Alleen de canonieke vorm is toegelaten: een ander pad wordt nooit opgehaald. */
export function laadGoLesplan(code: string): Promise<GoLesplanBestand> {
  if (!isGeldigeLesplancode(code)) {
    return Promise.reject(new Error(`Ongeldige lesplancode (${JSON.stringify(code).slice(0, 40)}). Een lesplancode ziet er zo uit: LP0065.`));
  }
  return lesplanCache.haal(code, () => haalLesplanOp(code));
}

// ── Omgekeerd: per minimumdoel ──────────────────────────────────────────────
const bijCache = new BelofteCache<GoBijMinimumdoelBestand>(MAX_BIJ_MINIMUMDOEL_IN_CACHE);

async function haalBijOp(vak: number): Promise<GoBijMinimumdoelBestand> {
  const wat = 'Het leerplan van het GO! bij dit minimumdoel';
  const json = await haalJson(`bij-minimumdoel/${vak}.json`, wat);
  const fouten = lichtGoBijMinimumdoel(json);
  if (fouten.length === 0 && isObject(json) && json.vak !== vak) fouten.push(`het bestand hoort bij een ander vak (${String(json.vak)})`);
  if (fouten.length > 0) throw beschadigd(wat, fouten);
  return json as GoBijMinimumdoelBestand;
}

/** De leerplandoelen van het GO! bij de minimumdoelen van één vak (1 tot 10), met het vaste nummer als sleutel. */
export function laadGoBijMinimumdoel(vak: number): Promise<GoBijMinimumdoelBestand> {
  if (!isGeldigMinimumdoelVak(vak)) {
    return Promise.reject(new Error(`Ongeldig vak van het minimumdoel (${String(vak).slice(0, 40)}). Kies een vak van 1 tot 10.`));
  }
  return bijCache.haal(String(vak), () => haalBijOp(vak));
}

/** Alleen voor tests: leegt alle caches. */
export function wisGoCache(): void {
  indexBelofte = null;
  leerplanCache.wis();
  lesplanCache.wis();
  bijCache.wis();
}

/** Alleen voor tests: hoeveel bestanden van elke soort in het geheugen staan. */
export function goCacheGrootte(): { leerplannen: number; lesplannen: number; bijMinimumdoel: number } {
  return { leerplannen: leerplanCache.grootte, lesplannen: lesplanCache.grootte, bijMinimumdoel: bijCache.grootte };
}
