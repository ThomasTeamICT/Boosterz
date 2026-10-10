// Beroepskwalificaties in de app: lui ophalen uit public/leerplannen/kwalificaties/ (docs/STUDIERICHTINGEN.md § 23.6.9).
//
// Naar het model van studierichtingenBron.ts: de koppeling en de index worden één keer opgehaald (gedeelde belofte,
// gewist bij een fout), het bestand van een BK-versie pas als een richting het nodig heeft (cache van 20). Elk bestand
// gaat door zijn `valideer…`-functie van beroepskwalificaties.ts. De gegevens blijven in het geheugen: nooit in
// localStorage. Zonder netwerk of zonder bestand blijft de rest van de app werken.
//
// Een bestand dat er niet is (404, of een dev- of previewserver die met de startpagina antwoordt), is `null`: nog niet
// opgehaald, of niet gekoppeld. Een netwerkfout of een andere status geeft `FOUT_BK`; een bestand dat niet door zijn
// validator komt, `FOUT_BK_BESCHADIGD`. Beide berichten komen op het scherm: daarom staat er nooit een detail van de
// validator in (dat kan een competentiecode bevatten). Wie het detail nodig heeft, vindt het in `fouten` op de fout.

import {
  BK_VERSIE,
  valideerBkBestand,
  valideerBkIndex,
  valideerKoppelingBestand,
  type BkBestand,
  type BkIndex,
  type KoppelingBestand,
} from './beroepskwalificaties';

/** De map met de bestanden, naast de app (vite base './'; de hash-route verandert het pad niet). */
export const KWALIFICATIES_MAP = `${import.meta.env.BASE_URL}leerplannen/kwalificaties/`;

/** Zoveel BK-versies blijven in het geheugen; de oudste gaat eruit. */
export const MAX_BK_IN_CACHE = 20;

export const FOUT_BK = 'De beroepskwalificaties konden niet geladen worden. Controleer je verbinding en probeer opnieuw.';
export const FOUT_BK_BESCHADIGD =
  'De gegevens van de beroepskwalificaties zijn beschadigd en konden niet gelezen worden. Probeer het later opnieuw.';
export const FOUT_BK_ONGELDIG = 'Deze beroepskwalificatie bestaat niet. Kies een beroepskwalificatie bij de studierichting.';

/** Een fout van de lader. `fouten`: wat de validator vond (alleen bij `FOUT_BK_BESCHADIGD`; nooit op het scherm). */
export type BkLaadFout = Error & { fouten?: string[] };

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

/** Haalt een bestand op. Een netwerkfout of een andere status dan 200 of 404: `FOUT_BK`. */
async function haal(url: string): Promise<Antwoord> {
  try {
    return await haalJson(url);
  } catch {
    throw new Error(FOUT_BK);
  }
}

function beschadigd(fouten: readonly string[]): BkLaadFout {
  const fout: BkLaadFout = new Error(FOUT_BK_BESCHADIGD);
  fout.fouten = [...fouten];
  return fout;
}

/** Een gedeelde belofte die zichzelf wist bij een fout, zodat een nieuwe poging echt opnieuw ophaalt. */
function gedeeld<T>(haalOp: () => Promise<T>): { laad: () => Promise<T>; wis: () => void } {
  let belofte: Promise<T> | null = null;
  return {
    laad() {
      if (!belofte) {
        const nieuw = haalOp();
        belofte = nieuw;
        nieuw.catch(() => {
          if (belofte === nieuw) belofte = null;
        });
      }
      return belofte;
    },
    wis() {
      belofte = null;
    },
  };
}

// ── De koppeling onderdeel → beroepskwalificaties ───────────────────────────

const koppeling = gedeeld(async (): Promise<KoppelingBestand | null> => {
  const res = await haal(`${KWALIFICATIES_MAP}koppeling.json`);
  if (res.ontbreekt) return null;
  const fouten = valideerKoppelingBestand(res.json);
  if (fouten.length > 0) throw beschadigd(fouten);
  return res.json as KoppelingBestand;
});

/**
 * De koppeling van elk onderdeel met zijn erkenningen en beroepskwalificaties, één keer opgehaald (gedeelde belofte).
 * Bestaat het bestand niet (404 of de startpagina als terugval), dan is het resultaat `null` (nog niet opgehaald); een
 * andere fout gooit (`FOUT_BK` of `FOUT_BK_BESCHADIGD`) en wist de belofte.
 */
export function laadBkKoppeling(): Promise<KoppelingBestand | null> {
  return koppeling.laad();
}

// ── De index van de BK-versies ──────────────────────────────────────────────

const index = gedeeld(async (): Promise<BkIndex | null> => {
  const res = await haal(`${KWALIFICATIES_MAP}index.json`);
  if (res.ontbreekt) return null;
  const fouten = valideerBkIndex(res.json);
  if (fouten.length > 0) throw beschadigd(fouten);
  return res.json as BkIndex;
});

/** De index van alle BK-versies (titel, aantal, versiemerk, bestand), één keer opgehaald; zoals `laadBkKoppeling`. */
export function laadBkIndex(): Promise<BkIndex | null> {
  return index.laad();
}

// ── Eén BK-versie ───────────────────────────────────────────────────────────

const bkCache = new Map<string, Promise<BkBestand | null>>();

async function haalBkOp(versie: string): Promise<BkBestand | null> {
  const res = await haal(`${KWALIFICATIES_MAP}bk/${versie}.json`);
  if (res.ontbreekt) return null;
  // De validator eist ook dat het bestand bij de gevraagde versie hoort (`bk`).
  const fouten = valideerBkBestand(res.json, versie);
  if (fouten.length > 0) throw beschadigd(fouten);
  return res.json as BkBestand;
}

/**
 * De competenties van één BK-versie, of `null` als het bestand niet bestaat (404 of de startpagina als terugval). De
 * versie moet op `BK_VERSIE` passen ("BK-0390-2"); alles anders is meteen een fout (`FOUT_BK_ONGELDIG`), zonder iets op te
 * halen: zo komt er nooit een willekeurig pad in een verzoek. Het bestand moet bij die versie horen. Een gelezen bestand
 * blijft in het geheugen (hoogstens 20; de oudste gaat eruit). Een mislukte poging blijft niet in de cache staan.
 */
export function laadBk(versie: string): Promise<BkBestand | null> {
  if (typeof versie !== 'string' || !BK_VERSIE.test(versie)) return Promise.reject(new Error(FOUT_BK_ONGELDIG));
  const bewaard = bkCache.get(versie);
  if (bewaard) return bewaard;
  const belofte = haalBkOp(versie);
  bkCache.set(versie, belofte);
  while (bkCache.size > MAX_BK_IN_CACHE) {
    const oudste = bkCache.keys().next().value as string;
    bkCache.delete(oudste);
  }
  belofte.catch(() => {
    if (bkCache.get(versie) === belofte) bkCache.delete(versie);
  });
  return belofte;
}

/** Leegt de caches: voor tests, en om na een fout helemaal opnieuw te beginnen. */
export function wisBkCache(): void {
  koppeling.wis();
  index.wis();
  bkCache.clear();
}
