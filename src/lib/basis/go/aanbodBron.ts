// Het laden van het aanbod in Boosterz bij een lesplan (public/basis/aanbod/, zie aanbod.ts).
//
// - laadGoAanbod('LP0065'): het manifest, of null als er bij dat lesplan (nog) geen aanbod is (404). Geen aanbod is geen
//   fout: de lesplanpagina toont dan gewoon geen sectie.
// - laadAanbodBordles('LP0065', 'dier-of-plant.json'): een bordles uit het aanbod.
//
// Elk bestand krijgt de lichte vormcontrole (lichtGoAanbod, lichtAanbodBordles) en blijft in een kleine cache. Alleen
// geldige namen worden opgehaald: een lesplancode zoals in goBron.ts en een slug met '.json' (isGeldigAanbodBestand).
// De service worker behandelt deze bestanden zoals de andere eigen bestanden: netwerk eerst, cache als terugval (de build
// zet alle bestanden uit public/ in KNOWN). Een 404 komt nooit in de cache (cacheable eist status 200).
//
// Geen verbinding (fetch faalt) geeft FOUT_AANBOD_GEEN_VERBINDING: dan weten we niet of er aanbod is. De lesplanpagina
// zegt dat rustig, zonder een kopje boven niets.

import { BelofteCache, GoNietGevondenFout, isGeldigeLesplancode } from './goBron';
import { isGeldigAanbodBestand, lichtAanbodBordles, lichtGoAanbod, type GoAanbodBestand, type GoAanbodBordles } from './aanbod';

export const AANBOD_MAP = `${import.meta.env.BASE_URL}basis/aanbod/`;

export const FOUT_AANBOD_GEEN_VERBINDING = 'Het aanbod in Boosterz kon niet geladen worden: er is geen verbinding.';
export const FOUT_AANBOD_NIET_GELADEN = 'Het aanbod in Boosterz kon niet geladen worden. Probeer het later nog eens.';
/** De melding als een bordles uit het manifest nog niet bestaat (404). */
export const FOUT_BORDLES_ONTBREEKT = 'Deze bordles is nog niet klaar: het bestand ontbreekt nog.';

async function haal(pad: string, bijNietGevonden: () => Error): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${AANBOD_MAP}${pad}`);
  } catch {
    throw new Error(FOUT_AANBOD_GEEN_VERBINDING);
  }
  if (res.status === 404) throw bijNietGevonden();
  if (!res.ok) throw new Error(FOUT_AANBOD_NIET_GELADEN);
  try {
    return await res.json();
  } catch {
    throw new Error(FOUT_AANBOD_NIET_GELADEN);
  }
}

function beschadigd(wat: string, fouten: string[]): Error {
  console.warn(`Boosterz: ${wat}`, fouten.slice(0, 5));
  return new Error(`${wat} kon niet gelezen worden. Laad de pagina opnieuw; lukt het dan nog niet, probeer het later nog eens.`);
}

const aanbodCache = new BelofteCache<GoAanbodBestand | null>(8);
const bordlesCache = new BelofteCache<GoAanbodBordles>(8);

async function haalAanbodOp(code: string): Promise<GoAanbodBestand | null> {
  const wat = `Het aanbod in Boosterz bij lesplan ${code}`;
  let json: unknown;
  try {
    json = await haal(`${code}.json`, () => new GoNietGevondenFout(wat));
  } catch (e) {
    if (e instanceof GoNietGevondenFout) return null;
    throw e;
  }
  const fouten = lichtGoAanbod(json);
  if (fouten.length === 0 && (json as GoAanbodBestand).lesplan.code !== code) fouten.push(`het bestand hoort bij een ander lesplan (${(json as GoAanbodBestand).lesplan.code})`);
  if (fouten.length > 0) throw beschadigd(wat, fouten);
  return json as GoAanbodBestand;
}

/** Het aanbod bij een lesplan, of null als er geen is. Een ongeldige code haalt niets op. */
export function laadGoAanbod(code: string): Promise<GoAanbodBestand | null> {
  if (!isGeldigeLesplancode(code)) {
    return Promise.reject(new Error(`Ongeldige lesplancode (${JSON.stringify(code).slice(0, 40)}). Een lesplancode ziet er zo uit: LP0065.`));
  }
  return aanbodCache.haal(code, () => haalAanbodOp(code));
}

async function haalBordlesOp(code: string, bestand: string): Promise<GoAanbodBordles> {
  const wat = 'Deze bordles';
  const json = await haal(`${code}/${bestand}`, () => new GoNietGevondenFout(FOUT_BORDLES_ONTBREEKT));
  const fouten = lichtAanbodBordles(json);
  if (fouten.length > 0) throw beschadigd(wat, fouten);
  return json as GoAanbodBordles;
}

/** Een bordles uit het aanbod van een lesplan. Een ongeldige code of bestandsnaam haalt niets op. */
export function laadAanbodBordles(code: string, bestand: string): Promise<GoAanbodBordles> {
  if (!isGeldigeLesplancode(code) || !isGeldigAanbodBestand(bestand)) {
    return Promise.reject(new Error('Deze bordles heeft een ongeldige naam.'));
  }
  return bordlesCache.haal(`${code}/${bestand}`, () => haalBordlesOp(code, bestand));
}

/** Alleen voor tests. */
export function wisAanbodCache(): void {
  aanbodCache.wis();
  bordlesCache.wis();
}
