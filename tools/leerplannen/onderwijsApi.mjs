// API-hulp voor de ophaalscripts van de Onderwijs-API's: één GET met de sleutel, alleen naar de
// officiële API (of een lokale testserver), zonder doorverwijzingen te volgen, met nieuwe pogingen en
// een pauze tussen twee verzoeken; en het wissen van de sleutel uit alles wat naar buiten gaat.
// Zie docs/STUDIERICHTINGEN.md § 23.5.4 en § 23.5.8 (pakket K1). Node 22.18 of nieuwer, zonder
// afhankelijkheden. Alleen tools/leerplannen/haal-beroepskwalificaties.mjs gebruikt dit bestand;
// haal-minimumdoelen.mjs en haal-studierichtingen.mjs hebben hun eigen kopie en blijven ongewijzigd.
//
// Gebruik (in het ophaalscript):
//
//   import { Fout, maakOnderwijsApi, veilig, kort, bevatSleutel } from './onderwijsApi.mjs';
//   const api = maakOnderwijsApi({ basissen: [
//     ['ONDERWIJSDOELEN_API_BASE', M.API_BASIS],          // de eerste bepaalt de enige origin
//     ['STRUCTUURONDERDELEN_API_BASE', S.STRUCTUUR_API],  // zelfde origin, anders Fout(1)
//     ['BEROEPSKWALIFICATIES_API_BASE', B.BK_API],
//   ] });
//   const r = await api.haalJson(api.adres(api.basis.STRUCTUURONDERDELEN_API_BASE, 'structuuronderdeel', 504),
//     'Onderdeel 504', 'onderdeel', { mag404: true });
//   // r = { status: 200, json } of (met mag404) { status: 404, tekst: <ingekort, zonder sleutel> }
//
// Veiligheid (§ 23.5.8):
// - Alleen GET. De sleutel gaat alleen in de kop x-api-key, alleen naar de origin van de eerste basis.
//   Een basis is https://onderwijs.api.vlaanderen.be (met een pad) of een lokale testserver
//   (http://localhost, http://127.0.0.1 of http://[::1]); elk ander adres is Fout(1).
// - redirect: 'manual': elke 3xx is Fout(1), zonder tweede verzoek (de sleutel zou meegaan).
// - 401 en 403: Fout(1), zonder nieuwe poging. Een andere 4xx (behalve 404 met mag404 en 429): Fout(1).
// - 429, 5xx, een netwerkfout of een time-out (60 s): 4 nieuwe pogingen, na 2, 4, 8 en 16 s.
// - Tussen twee verzoeken minstens 250 ms. Alle wachttijden × ONDERWIJSDOELEN_WACHT_FACTOR (0 in tests).
// - De sleutel wordt getrimd gebruikt (fetch doet dat in de kop ook). Uit alle uitvoer verdwijnt ze zoals
//   ze in de omgeving staat, getrimd, en bij een geheim met meer regels per regel; elk in ruwe, JSON- en
//   URL-vorm (zoals tools/verkenning/verken-onderwijs-api.mjs). Een foutmelding noemt nooit de sleutel en
//   nooit de hele netwerkfout (die kan kopteksten bevatten).
// - Een geheim met witruimte aan de rand geeft één waarschuwing zonder de waarde. Een geheim met spaties,
//   stuurtekens of nieuwe regels in het midden, of tekens buiten ASCII, is Fout(1): fetch zou de kop
//   toch weigeren.

export const ECHTE_ORIGIN = 'https://onderwijs.api.vlaanderen.be';
export const PAUZE_MS = 250;
export const HERHAAL_WACHT_MS = Object.freeze([2000, 4000, 8000, 16000]);
export const VERZOEK_TIMEOUT_MS = 60000;
/** Een antwoord groter dan dit is geen gewoon antwoord van deze API's: Fout(1). */
export const MAX_ANTWOORD_BYTES = 32 * 1024 * 1024;
/** Zoveel tekens van de body van een 404 komen terug (voor het rapport), zonder sleutel. */
export const MAX_404_TEKST = 500;
export const VERBORGEN = '<verborgen>';
const SLEUTEL_NAAM = 'ONDERWIJSDOELEN_API_KEY';
const MIN_SLEUTEL = 8;
const LOKALE_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Een fout met een uitgangscode (1 = fout of onvolledig, zoals de ophaalscripts). De melding is al veilig. */
export class Fout extends Error {
  constructor(bericht, code = 1) {
    super(bericht);
    this.name = 'Fout';
    this.code = code;
  }
}

/** ONDERWIJSDOELEN_WACHT_FACTOR: een getal ≥ 0 (0 = niet wachten, voor tests); anders 1. */
export function wachtFactorUit(env = process.env) {
  const ruw = env.ONDERWIJSDOELEN_WACHT_FACTOR;
  const n = Number(ruw);
  return ruw && ruw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : 1;
}

const slaap = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── De sleutel uit de uitvoer houden ────────────────────────────────────────

/**
 * Alle vormen waarin de sleutel in een tekst kan opduiken, langste eerst: zoals ze in de omgeving staat,
 * getrimd, en bij een geheim met meer regels elke regel apart (ruw en getrimd). Elk in ruwe, JSON- en
 * URL-vorm. Delen korter dan 4 tekens tellen niet (die zouden gewone tekst wissen).
 */
export function sleutelVormen(ruw) {
  const tekst = typeof ruw === 'string' ? ruw : '';
  const delen = new Set([tekst, tekst.trim()]);
  for (const regel of tekst.split(/\r\n|[\r\n\u2028\u2029]/)) {
    delen.add(regel);
    delen.add(regel.trim());
  }
  const vormen = new Set();
  for (const deel of delen) {
    if (deel.length < 4) continue;
    vormen.add(deel);
    vormen.add(JSON.stringify(deel).slice(1, -1));
    try {
      vormen.add(encodeURIComponent(deel));
    } catch {
      // een losse surrogaat: geen URL-vorm mogelijk
    }
  }
  return [...vormen].sort((a, b) => b.length - a.length);
}

/** Stuurtekens en regeleinden in externe tekst maken geen valse logregels. */
const STUURTEKENS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
/** Een regel die met "::" begint, is in GitHub Actions een workflow-opdracht. */
const WORKFLOW_OPDRACHT = /^(\s*):(?=:)/;

/**
 * De hulpfuncties voor één ruwe sleutelwaarde:
 * - `schoon(t)`: de sleutel (elke vorm) wordt `<verborgen>`; voor bestanden en het rapport;
 * - `veilig(t)`: `schoon` en geen stuurtekens of regeleinden, en geen workflow-opdracht; voor logregels;
 * - `kort(t, n)`: `veilig`, hoogstens n tekens;
 * - `bevatSleutel(t)`: staat de sleutel (in een van haar vormen) in de tekst?
 */
export function maakSchoonmaak(ruw) {
  const vormen = sleutelVormen(ruw);
  const schoon = (t) => {
    let s = String(t);
    for (const vorm of vormen) s = s.split(vorm).join(VERBORGEN);
    return s;
  };
  const veilig = (t) => schoon(t).replace(STUURTEKENS, ' ').replace(WORKFLOW_OPDRACHT, '$1: ');
  const kort = (t, n = 300) => {
    const v = veilig(t);
    return v.length > n ? `${v.slice(0, Math.max(0, n - 1))}…` : v;
  };
  const bevatSleutel = (t) => {
    const s = String(t);
    return vormen.some((vorm) => s.includes(vorm));
  };
  return { schoon, veilig, kort, bevatSleutel };
}

// Standaard: de sleutel uit process.env, telkens opnieuw gelezen (met een cache op de ruwe waarde).
let standaardCache = { ruw: undefined, hulp: undefined };
function standaard() {
  const ruw = process.env[SLEUTEL_NAAM] ?? '';
  if (standaardCache.ruw !== ruw || standaardCache.hulp === undefined) standaardCache = { ruw, hulp: maakSchoonmaak(ruw) };
  return standaardCache.hulp;
}
/** `schoon` met de sleutel uit process.env. */
export const schoon = (t) => standaard().schoon(t);
/** `veilig` met de sleutel uit process.env. */
export const veilig = (t) => standaard().veilig(t);
/** `kort` met de sleutel uit process.env. */
export const kort = (t, n = 300) => standaard().kort(t, n);
/** `bevatSleutel` met de sleutel uit process.env. */
export const bevatSleutel = (t) => standaard().bevatSleutel(t);

/**
 * De sleutel uit de omgeving, getrimd (dat stuurt fetch ook). Ontbreekt ze: Fout(1). Witruimte of een
 * nieuwe regel aan de rand: één waarschuwing, zonder de waarde. Spaties, stuurtekens of nieuwe regels in
 * het midden, tekens buiten ASCII, of korter dan 8 tekens: Fout(1), zonder de waarde.
 */
export function leesSleutel(env = process.env, waarschuw = (t) => console.error(t)) {
  const ruw = typeof env[SLEUTEL_NAAM] === 'string' ? env[SLEUTEL_NAAM] : '';
  const sleutel = ruw.trim();
  if (sleutel === '') {
    throw new Fout(`De omgevingsvariabele ${SLEUTEL_NAAM} ontbreekt. Zet de sleutel in de omgeving (lokaal) of als GitHub-geheim (Actions), of gebruik de opties --bron-… met opgeslagen antwoorden.`);
  }
  if (/[^\x21-\x7e]/.test(sleutel)) {
    throw new Fout(`Het geheim ${SLEUTEL_NAAM} bevat spaties, stuurtekens, meer dan één regel of tekens buiten ASCII. Controleer het geheim in GitHub; de waarde wordt niet getoond.`);
  }
  if (sleutel.length < MIN_SLEUTEL) {
    throw new Fout(`Het geheim ${SLEUTEL_NAAM} is te kort om een sleutel te zijn. Controleer het geheim in GitHub; de waarde wordt niet getoond.`);
  }
  if (sleutel !== ruw) {
    waarschuw(`Waarschuwing: het geheim ${SLEUTEL_NAAM} heeft witruimte of een nieuwe regel aan het begin of einde (weggehaald). Controleer het geheim in GitHub; de waarde wordt niet getoond.`);
  }
  return sleutel;
}

// ── Adressen ────────────────────────────────────────────────────────────────

/**
 * Een basisadres: https://onderwijs.api.vlaanderen.be (met of zonder pad), of een lokale testserver over
 * http (localhost, 127.0.0.1 of [::1], elke poort). Zonder gebruikersnaam, wachtwoord, ? of #. Geeft het
 * adres zonder / op het einde; anders Fout(1).
 */
export function controleerBasis(waarde, naam) {
  let url;
  try {
    url = new URL(String(waarde));
  } catch {
    throw new Fout(`${naam} is geen geldig adres.`);
  }
  if (url.username !== '' || url.password !== '') throw new Fout(`${naam} mag geen gebruikersnaam of wachtwoord bevatten.`);
  if (url.search !== '' || url.hash !== '' || String(waarde).includes('?') || String(waarde).includes('#')) throw new Fout(`${naam} mag geen ? of # bevatten.`);
  const echt = url.protocol === 'https:' && url.origin === ECHTE_ORIGIN;
  const lokaal = url.protocol === 'http:' && LOKALE_HOSTS.includes(url.hostname);
  if (!echt && !lokaal) {
    throw new Fout(`${naam} moet met ${ECHTE_ORIGIN} beginnen (of een lokale testserver zijn, zoals http://127.0.0.1:<poort>). De sleutel gaat nergens anders heen.`);
  }
  return url.href.replace(/\/+$/, '');
}

/**
 * De basisadressen uit de omgeving: `lijst` is [[naam, standaard], …]; een lege of ontbrekende variabele
 * geeft de standaard. De eerste bepaalt de enige origin waar de sleutel heen mag; elke andere basis moet
 * dezelfde origin hebben, anders Fout(1).
 */
export function leesBasissen(lijst, env = process.env) {
  if (!Array.isArray(lijst) || lijst.length === 0) throw new Fout('Er is geen basisadres voor de API opgegeven.');
  const basis = {};
  let origin;
  for (const [naam, standaardWaarde] of lijst) {
    const ruw = typeof env[naam] === 'string' && env[naam].trim() !== '' ? env[naam].trim() : standaardWaarde;
    const b = controleerBasis(ruw, naam);
    const o = new URL(b).origin;
    if (origin === undefined) origin = o;
    else if (o !== origin) throw new Fout(`${naam} moet dezelfde origin hebben als ${lijst[0][0]}: de sleutel gaat alleen daarheen.`);
    basis[naam] = b;
  }
  return { origin, basis };
}

/** Een adres uit een basis en delen; elk deel met encodeURIComponent ("BK-0390-2", 504). */
export function adres(basis, ...delen) {
  return [String(basis).replace(/\/+$/, ''), ...delen.map((d) => encodeURIComponent(String(d)))].join('/');
}

// ── Verzoeken ───────────────────────────────────────────────────────────────

async function sluit(antwoord) {
  try {
    await antwoord.body?.cancel();
  } catch {
    // de body is toch niet nodig
  }
}

function herkomstVan(location, basis) {
  try {
    return location ? new URL(location, basis).origin : '(onbekend)';
  } catch {
    return '(onbekend)';
  }
}

/**
 * Maakt de API-hulp: leest de sleutel (`leesSleutel`) en de basisadressen (`leesBasissen`) uit `env`.
 * Opties: `basissen` (verplicht, zie leesBasissen), `env` (standaard process.env), `log` (krijgt elke
 * logregel, al veilig gemaakt; standaard console.log), `waarschuw` (voor de sleutel), en voor tests
 * `pauzeMs`, `timeoutMs` en `herhaalWachtMs`.
 * Geeft { origin, basis, teller, haalJson, wacht, adres, schoon, veilig, kort, bevatSleutel }.
 */
export function maakOnderwijsApi(opties = {}) {
  const env = opties.env ?? process.env;
  const sleutel = leesSleutel(env, opties.waarschuw);
  const hulp = maakSchoonmaak(env[SLEUTEL_NAAM]);
  const { origin, basis } = leesBasissen(opties.basissen, env);
  const factor = wachtFactorUit(env);
  const pauzeMs = opties.pauzeMs ?? PAUZE_MS;
  const timeoutMs = opties.timeoutMs ?? VERZOEK_TIMEOUT_MS;
  const herhaal = opties.herhaalWachtMs ?? HERHAAL_WACHT_MS;
  const schrijf = opties.log ?? ((t) => console.log(t));
  const log = (t) => schrijf(hulp.veilig(t));
  const wacht = (ms) => slaap(ms * factor);
  /** Verzoeken in totaal en per soort (een object zonder prototype). */
  const teller = { verzoeken: 0, perSoort: Object.create(null) };
  let laatsteEinde = Number.NEGATIVE_INFINITY;

  /** Wacht tot er sinds het einde van het vorige verzoek minstens `pauzeMs` × factor voorbij is. */
  async function pauze() {
    const nog = laatsteEinde + pauzeMs * factor - Date.now();
    if (nog > 0) await slaap(nog);
  }

  /**
   * Eén GET met de sleutel. Geeft { status: 200, json } of, met `mag404`, { status: 404, tekst }.
   * Elke andere uitkomst is een Fout(1) met een veilige melding.
   */
  async function haalJson(doelAdres, wat, soort = 'overig', { mag404 = false } = {}) {
    const naam = hulp.kort(wat, 120);
    let doel;
    try {
      doel = new URL(String(doelAdres));
    } catch {
      throw new Fout(`${naam}: het adres is ongeldig.`);
    }
    if (doel.username !== '' || doel.password !== '') throw new Fout(`${naam}: het adres bevat een gebruikersnaam of wachtwoord.`);
    if (doel.origin !== origin) {
      throw new Fout(`${naam}: het adres staat op een andere origin (${hulp.kort(doel.origin, 80)}). De sleutel gaat daar niet heen.`);
    }
    const soortNaam = String(soort);
    let laatste = 'onbekende fout';
    for (let poging = 0; poging <= herhaal.length; poging++) {
      if (poging > 0) {
        log(`${naam}: opnieuw proberen (${poging}/${herhaal.length}) na ${laatste}.`);
        await wacht(herhaal[poging - 1]);
      }
      await pauze();
      teller.verzoeken++;
      teller.perSoort[soortNaam] = (teller.perSoort[soortNaam] ?? 0) + 1;
      let tekst;
      try {
        const antwoord = await fetch(doel, {
          method: 'GET',
          headers: { 'x-api-key': sleutel, accept: 'application/json' },
          // Nooit een doorverwijzing volgen: de sleutel zou meegaan naar een ander adres.
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        const status = antwoord.status;
        if (antwoord.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
          const naar = herkomstVan(antwoord.headers.get('location'), doel);
          await sluit(antwoord);
          throw new Fout(`${naam}: de API stuurt door (HTTP ${status} naar ${hulp.kort(naar, 80)}). Het script volgt geen doorverwijzingen, want de sleutel zou meegaan.`);
        }
        if (status === 401 || status === 403) {
          await sluit(antwoord);
          throw new Fout(`${naam}: de API weigert de sleutel (HTTP ${status}).`);
        }
        if (status === 404 && mag404) {
          let body = '';
          try {
            body = await antwoord.text();
          } catch {
            // de body is alleen een voorbeeld voor het rapport
          }
          return { status: 404, tekst: hulp.kort(body, MAX_404_TEKST) };
        }
        if (status === 429 || status >= 500) {
          laatste = `HTTP ${status}`;
          await sluit(antwoord);
          continue;
        }
        if (!antwoord.ok) {
          await sluit(antwoord);
          throw new Fout(`${naam}: de API antwoordde met HTTP ${status}.`);
        }
        const lengte = Number(antwoord.headers.get('content-length'));
        if (Number.isFinite(lengte) && lengte > MAX_ANTWOORD_BYTES) {
          await sluit(antwoord);
          throw new Fout(`${naam}: het antwoord is te groot (${lengte} bytes).`);
        }
        tekst = await antwoord.text();
        if (tekst.length > MAX_ANTWOORD_BYTES) throw new Fout(`${naam}: het antwoord is te groot.`);
      } catch (e) {
        if (e instanceof Fout) throw e;
        // Netwerkfout of time-out: alleen de soort melden, nooit de hele fout (kan kopteksten bevatten).
        laatste = `netwerkfout (${hulp.kort(e?.cause?.code ?? e?.name ?? 'onbekend', 40)})`;
        continue;
      } finally {
        laatsteEinde = Date.now();
      }
      try {
        return { status: 200, json: JSON.parse(tekst) };
      } catch {
        throw new Fout(`${naam}: het antwoord is geen geldige JSON.`);
      }
    }
    throw new Fout(`${naam} lukte niet na ${herhaal.length} nieuwe pogingen (${laatste}).`);
  }

  return { origin, basis, teller, haalJson, wacht, adres, ...hulp };
}
