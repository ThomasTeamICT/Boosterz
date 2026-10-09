#!/usr/bin/env node
// Haalt de matrix van de studierichtingen op (API Structuuronderdelen) en per richting de officiële
// koppeling met de minimumdoelen (Onderwijsdoelen-API, filter structuuronderdeel_groep_nummer). Het
// controleert alles hard tegen de minimumdoelen in de repository en schrijft git-vriendelijke bestanden,
// of niets. Zie docs/STUDIERICHTINGEN.md § 3 (bestanden), § 5 (dit script) en § 7 (versiemerk).
// Node 22.18 of nieuwer, geen npm-afhankelijkheden: de normalisatie komt uit
// src/lib/studierichtingen.ts en src/lib/minimumdoelen.ts, die Node rechtstreeks inleest.
//
//   ONDERWIJSDOELEN_API_KEY=… node tools/leerplannen/haal-studierichtingen.mjs [opties]
//
// Opties
//   --alleen alles|matrix|koppeling   standaard alles; "koppeling" leest het bestaande matrixbestand
//   --groepen G-0117,G-0327           proefrun: alleen deze groepen koppelen (hoogstens 50); de andere
//                                     groepen houden hun regel in de index of krijgen "nog-niet-opgehaald"
//   --bron-matrix <bestand>           offline: één API-pagina, een lijst pagina's of een lijst groepen
//   --bron-koppeling <bestand>        offline: {"totaal": 24019, "groepen": {"G-0117": <pagina | pagina's | {"status": 404}>}}
//   --uit <map>                       standaard public/leerplannen/structuur
//   --minimumdoelen <map>             standaard public/leerplannen/minimumdoelen (alleen lezen)
//   --rapport <bestand>               standaard tools/leerplannen/rapport/laatste-studierichtingen.json
//   --vandaag JJJJ-MM-DD              voor tests (standaard vandaag, UTC): de datum van "nietMeerInBron"
//   --nu <tijdstip>                   voor tests: het tijdstip "opgehaald" (alleen als niets via de API gaat)
//
// Omgeving
//   ONDERWIJSDOELEN_API_KEY        verplicht als iets via de API gaat; komt nooit in een log, bestand of rapport
//   ONDERWIJSDOELEN_API_BASE       standaard https://onderwijs.api.vlaanderen.be/onderwijsdoelen
//   STRUCTUURONDERDELEN_API_BASE   standaard de officiële API Structuuronderdelen; moet dezelfde origin
//                                  hebben als ONDERWIJSDOELEN_API_BASE (de sleutel gaat alleen daarheen)
//   ONDERWIJSDOELEN_WACHT_FACTOR   vermenigvuldigt alle wachttijden (0 = niet wachten; voor tests)
//
// Uitgangscodes: 0 in orde (ook "niets veranderd"), 1 fout of onvolledig, 2 geen groepen, 3 de gegevens
// zijn niet betrouwbaar genoeg om te schrijven (de harde poorten L1 en D1 tot D8 van § 5.3). Bij 1, 2 en
// 3 is er niets geschreven behalve het rapport.
//
// Een bestand dat opnieuw gebouwd wordt met zijn oude "opgehaald" en dan byte voor byte gelijk is, wordt
// niet aangeraakt. Niets wordt gewist: een groep of onderdeel dat uit de API verdwijnt, blijft staan met
// "nietMeerInBron", en een koppeling die wegvalt, blijft staan als laatst bekende koppeling.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

class Fout extends Error {
  constructor(bericht, code = 1) {
    super(bericht);
    this.code = code;
  }
}

let M;
let S;
try {
  M = await import('../../src/lib/minimumdoelen.ts');
  S = await import('../../src/lib/studierichtingen.ts');
} catch {
  console.error('Fout: src/lib/minimumdoelen.ts of src/lib/studierichtingen.ts kon niet geladen worden. Dit script heeft Node 22.18 of nieuwer nodig (type stripping).');
  process.exit(1);
}

const RIJEN_PER_PAGINA = 500;
const MAX_MATRIX_PAGINAS = 100;
const MAX_GROEPEN_PROEF = 50;
/** Meer doelen dan dit voor één richting: de filter wordt genegeerd (D2). */
const MAX_DOELEN_PER_GROEP = 5000;
const MAX_KOPPEL_PAGINAS = Math.ceil(MAX_DOELEN_PER_GROEP / RIJEN_PER_PAGINA) + 1;
const PAUZE_MS = 250;
const HERHAAL_WACHT_MS = [2000, 4000, 8000, 16000];
const VERZOEK_TIMEOUT_MS = 60000;
/** Massaverlies (D6): zoveel mag het aantal groepen of onderdelen in de API hoogstens dalen. */
const MAX_DALING = 0.1;
/** D6: zoveel gekoppelde groepen mogen hoogstens naar "geen" vallen: max(5, 10 %). */
const MAX_NAAR_GEEN_VAST = 5;
/** D6: bij een volledige run moet minstens dit deel van de gewone groepen (2de en 3de graad) gekoppeld zijn. */
const MIN_GEKOPPELD_DEEL = 0.5;
const INSPRINGING = '  ';
const MAX_VOORBEELDEN = 50;
const MAX_PROBLEMEN_PER_GROEP = 10;
const SET_ID = /^ODS_\d+$/;
const MATRIX_BESTAND = 'studierichtingen.json';
const KOPPEL_MAP = 'richtingdoelen';
const INDEX_BESTAND = 'index.json';
const GROEP_BESTAND = /^G-\d{4,6}\.json$/;
const GRAAD_VAN_SET = { '1ste graad': '1', '2de graad': '2', '3de graad': '3' };
const ACHTER_MELDING = 'De minimumdoelen in de repository lopen achter op de API. Start de workflow met ‘alles’.';
const FILTER_MELDING = 'de filter lijkt niet meer te werken';

const wachtFactor = (() => {
  const n = Number(process.env.ONDERWIJSDOELEN_WACHT_FACTOR);
  return process.env.ONDERWIJSDOELEN_WACHT_FACTOR && Number.isFinite(n) && n >= 0 ? n : 1;
})();
const wacht = (ms) => new Promise((resolve) => setTimeout(resolve, ms * wachtFactor));

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const heeft = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const vergelijkTekst = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (tekst) => crypto.createHash('sha256').update(tekst, 'utf8').digest('hex');
const shaVan = (waarde) => sha256(M.canoniek(waarde));

/** Haalt de API-sleutel (ook in JSON-geëscapete vorm) uit een tekst die naar buiten gaat. */
function schoon(tekst) {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  let t = String(tekst);
  if (sleutel && sleutel.length >= 4) {
    for (const vorm of new Set([sleutel, JSON.stringify(sleutel).slice(1, -1)])) t = t.split(vorm).join('***');
  }
  return t;
}

/** Stuurtekens en regeleinden in externe tekst maken geen valse logregels of workflow-opdrachten. */
const STUURTEKENS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
const veilig = (tekst) => schoon(tekst).replace(STUURTEKENS, ' ');
const log = (...delen) => console.log(veilig(delen.join(' ')));
const meld = (...delen) => console.error(veilig(delen.join(' ')));
const kort = (t, n = 300) => {
  const v = veilig(t);
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};

// ── Opties ──────────────────────────────────────────────────────────────────

const OPTIE_NAMEN = {
  '--alleen': 'alleen',
  '--groepen': 'groepen',
  '--bron-matrix': 'bronMatrix',
  '--bron-koppeling': 'bronKoppeling',
  '--uit': 'uit',
  '--minimumdoelen': 'minimumdoelen',
  '--rapport': 'rapport',
  '--vandaag': 'vandaag',
  '--nu': 'nu',
};

function leesOpties(argv) {
  const opties = {};
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let waarde;
    const gelijk = arg.startsWith('--') ? arg.indexOf('=') : -1;
    if (gelijk > 0) {
      waarde = arg.slice(gelijk + 1);
      arg = arg.slice(0, gelijk);
    }
    if (arg === '--help' || arg === '-h') {
      opties.help = true;
      continue;
    }
    const naam = OPTIE_NAMEN[arg];
    if (!naam) throw new Fout(`Onbekende optie: ${arg}. Gebruik --help voor de opties.`);
    if (waarde === undefined) {
      waarde = argv[++i];
      if (waarde === undefined) throw new Fout(`Bij ${arg} hoort een waarde.`);
    }
    if (heeft(opties, naam)) throw new Fout(`De optie ${arg} staat er meer dan één keer.`);
    opties[naam] = waarde;
  }
  return opties;
}

const HULP = `Gebruik: node tools/leerplannen/haal-studierichtingen.mjs [--alleen alles|matrix|koppeling] [--groepen G-0117,G-0327]
  [--bron-matrix <bestand>] [--bron-koppeling <bestand>] [--uit <map>] [--minimumdoelen <map>] [--rapport <bestand>]
  [--vandaag JJJJ-MM-DD] [--nu <tijdstip>]

Als iets via de API gaat, is de omgevingsvariabele ONDERWIJSDOELEN_API_KEY verplicht.
Uitgangscodes: 0 in orde, 1 fout of onvolledig, 2 geen groepen, 3 gegevens niet betrouwbaar genoeg om te schrijven.`;

function isDag(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isTijdstip(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().replace(/\.\d{3}Z$/, 'Z') === v;
}

function controleerOpties(opties) {
  const stand = opties.alleen ?? 'alles';
  if (!['alles', 'matrix', 'koppeling'].includes(stand)) throw new Fout(`--alleen moet "alles", "matrix" of "koppeling" zijn, niet "${stand}".`);
  let groepen;
  if (opties.groepen !== undefined) {
    if (stand === 'matrix') throw new Fout('--groepen past niet bij --alleen matrix: dan wordt er niets gekoppeld.');
    groepen = opties.groepen.split(',').map((g) => g.trim());
    const fout = groepen.filter((g) => !S.GROEP_NUMMER.test(g));
    if (groepen.length === 0 || fout.length > 0) throw new Fout(`--groepen is ongeldig: elk groepnummer heeft de vorm G-0117 (fout: ${fout.map((g) => `"${g}"`).join(', ') || '(leeg)'}).`);
    if (groepen.length > MAX_GROEPEN_PROEF) throw new Fout(`--groepen is ongeldig: hoogstens ${MAX_GROEPEN_PROEF} groepen per proefrun, niet ${groepen.length}.`);
    if (new Set(groepen).size !== groepen.length) throw new Fout('--groepen is ongeldig: een groep staat er meer dan één keer in.');
    groepen.sort(S.vergelijkGroepnummer);
  }
  if (opties.bronMatrix !== undefined && stand === 'koppeling') throw new Fout('--bron-matrix past niet bij --alleen koppeling: die leest het bestaande matrixbestand.');
  if (opties.bronKoppeling !== undefined && stand === 'matrix') throw new Fout('--bron-koppeling past niet bij --alleen matrix.');
  const vandaag = opties.vandaag ?? new Date().toISOString().slice(0, 10);
  if (!isDag(vandaag)) throw new Fout(`--vandaag moet een datum JJJJ-MM-DD zijn, niet "${vandaag}".`);
  const matrixViaApi = stand !== 'koppeling' && opties.bronMatrix === undefined;
  const koppelingViaApi = stand !== 'matrix' && opties.bronKoppeling === undefined;
  const viaApi = matrixViaApi || koppelingViaApi;
  if (opties.nu !== undefined) {
    if (viaApi) throw new Fout('--nu kan alleen als niets via de API gaat (met --bron-matrix en --bron-koppeling).');
    if (!isTijdstip(opties.nu)) throw new Fout(`--nu moet een tijdstip JJJJ-MM-DDTUU:MM:SSZ zijn, niet "${opties.nu}".`);
  }
  return {
    stand,
    groepen,
    bronMatrix: opties.bronMatrix === undefined ? undefined : path.resolve(opties.bronMatrix),
    bronKoppeling: opties.bronKoppeling === undefined ? undefined : path.resolve(opties.bronKoppeling),
    uit: path.resolve(opties.uit ?? path.join(root, 'public', 'leerplannen', 'structuur')),
    minimumdoelen: path.resolve(opties.minimumdoelen ?? path.join(root, 'public', 'leerplannen', 'minimumdoelen')),
    rapport: path.resolve(opties.rapport ?? path.join(root, 'tools', 'leerplannen', 'rapport', 'laatste-studierichtingen.json')),
    vandaag,
    nu: opties.nu ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    matrixViaApi,
    koppelingViaApi,
    viaApi,
  };
}

// ── API ─────────────────────────────────────────────────────────────────────

/** Sleutel, basisadressen en tellers. De sleutel gaat alleen naar `origin`. */
const api = { sleutel: undefined, origin: undefined, doelenBasis: undefined, structuurBasis: undefined };
const teller = { verzoeken: 0, matrix: 0, koppeling: 0 };

function basisVan(waarde, naam) {
  let url;
  try {
    url = new URL(waarde);
  } catch {
    throw new Fout(`${naam} is geen geldig adres.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Fout(`${naam} moet met https:// beginnen.`);
  return url.toString().replace(/\/+$/, '');
}

function zetApi(cfg) {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  if (!sleutel) {
    throw new Fout('De omgevingsvariabele ONDERWIJSDOELEN_API_KEY ontbreekt. Zet de sleutel in de omgeving (lokaal) of als GitHub-geheim (Actions), of gebruik --bron-matrix en --bron-koppeling met opgeslagen antwoorden.');
  }
  api.sleutel = sleutel;
  api.doelenBasis = basisVan(process.env.ONDERWIJSDOELEN_API_BASE || M.API_BASIS, 'ONDERWIJSDOELEN_API_BASE');
  api.origin = new URL(api.doelenBasis).origin;
  api.structuurBasis = basisVan(process.env.STRUCTUURONDERDELEN_API_BASE || S.STRUCTUUR_API, 'STRUCTUURONDERDELEN_API_BASE');
  if (cfg.matrixViaApi && new URL(api.structuurBasis).origin !== api.origin) {
    throw new Fout('STRUCTUURONDERDELEN_API_BASE moet dezelfde origin hebben als ONDERWIJSDOELEN_API_BASE: de sleutel gaat alleen naar die origin.');
  }
}

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
 * Eén GET met de sleutel, alleen naar de origin van ONDERWIJSDOELEN_API_BASE. Nieuwe pogingen bij 429,
 * 5xx of een netwerkfout; een doorverwijzing wordt nooit gevolgd. Met `mag404` geeft een 404 de
 * (ingekorte) body terug in plaats van een fout.
 */
async function haalJson(adres, wat, soort, { mag404 = false } = {}) {
  let doel;
  try {
    doel = new URL(adres);
  } catch {
    throw new Fout(`${wat}: het adres is ongeldig.`);
  }
  if (doel.origin !== api.origin) {
    throw new Fout(`${wat}: het adres staat op een andere origin (${doel.origin}). Het script stuurt de sleutel daar niet heen.`);
  }
  let laatste = 'onbekende fout';
  for (let poging = 0; poging <= HERHAAL_WACHT_MS.length; poging++) {
    if (poging > 0) {
      log(`${wat}: opnieuw proberen (${poging}/${HERHAAL_WACHT_MS.length}) na ${laatste}.`);
      await wacht(HERHAAL_WACHT_MS[poging - 1]);
    }
    teller.verzoeken++;
    teller[soort]++;
    let tekst;
    try {
      // redirect: 'manual': een doorverwijzing naar een andere host zou de sleutel meesturen.
      const antwoord = await fetch(doel, {
        headers: { 'x-api-key': api.sleutel, accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(VERZOEK_TIMEOUT_MS),
      });
      if (antwoord.status >= 300 && antwoord.status < 400) {
        const naar = herkomstVan(antwoord.headers.get('location'), doel);
        await sluit(antwoord);
        throw new Fout(`${wat}: de API stuurt door (HTTP ${antwoord.status} naar ${naar}). Het script volgt geen doorverwijzingen, want de sleutel zou meegaan.`);
      }
      if (antwoord.status === 401 || antwoord.status === 403) {
        await sluit(antwoord);
        throw new Fout(`${wat}: de API weigert de sleutel (HTTP ${antwoord.status}).`);
      }
      if (antwoord.status === 404 && mag404) {
        let body = '';
        try {
          body = await antwoord.text();
        } catch {
          // de body is alleen een voorbeeld voor het rapport
        }
        return { status: 404, tekst: body };
      }
      if (antwoord.status === 429 || antwoord.status >= 500) {
        laatste = `HTTP ${antwoord.status}`;
        await sluit(antwoord);
        continue;
      }
      if (!antwoord.ok) {
        await sluit(antwoord);
        throw new Fout(`${wat}: de API antwoordde met HTTP ${antwoord.status}.`);
      }
      tekst = await antwoord.text();
    } catch (e) {
      if (e instanceof Fout) throw e;
      // Netwerkfout of time-out: enkel de soort melden, nooit de hele fout (kan kopteksten bevatten).
      laatste = `netwerkfout (${e?.cause?.code ?? e?.name ?? 'onbekend'})`;
      continue;
    }
    try {
      return { status: 200, json: JSON.parse(tekst) };
    } catch {
      throw new Fout(`${wat}: het antwoord is geen geldige JSON.`);
    }
  }
  throw new Fout(`${wat} lukte niet na ${HERHAAL_WACHT_MS.length} nieuwe pogingen (${laatste}).`);
}

function leesJsonBestand(pad, wat) {
  let tekst;
  try {
    tekst = fs.readFileSync(pad, 'utf8');
  } catch (e) {
    throw new Fout(`${wat} (${pad}) kon niet gelezen worden (${e.code ?? e.name}).`);
  }
  try {
    return JSON.parse(tekst);
  } catch {
    throw new Fout(`${wat} (${pad}) is geen geldige JSON.`);
  }
}

// ── Pagina's van de Onderwijsdoelen-API (Hydra) ─────────────────────────────

function paginaLeden(pagina) {
  if (!isObject(pagina)) return undefined;
  const gegevens = pagina.gegevens;
  if (isObject(gegevens) && Array.isArray(gegevens.member)) return gegevens.member;
  if (Array.isArray(gegevens)) return gegevens;
  if (Array.isArray(pagina.member)) return pagina.member;
  return undefined;
}

function paginaTotaal(pagina) {
  if (!isObject(pagina)) return undefined;
  const bron = isObject(pagina.gegevens) ? pagina.gegevens : pagina;
  const n = typeof bron.totalItems === 'string' && bron.totalItems.trim() !== '' ? Number(bron.totalItems) : bron.totalItems;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Alleen de namen van de bovenste sleutels, nooit inhoud: een foutantwoord kan van alles bevatten. */
function sleutelsVan(json) {
  if (Array.isArray(json)) return '(een lijst)';
  if (!isObject(json)) return `(${typeof json})`;
  return Object.keys(json).sort().slice(0, 20).join(', ') || '(geen)';
}

// ── Matrix ──────────────────────────────────────────────────────────────────

function nieuweMatrixStaat() {
  return { paginas: 0, pad: undefined, totaal: undefined, groepen: [], eersten: new Set(), leeg: false };
}

/** Eén pagina van de matrix: de lijst (L1), het totaal (L1) en de paginering. Geeft het aantal groepen. */
function verwerkMatrixPagina(staat, pagina, nr, losseGroepen) {
  staat.paginas++;
  const gevonden = S.lijstVanPagina(pagina);
  if ('fout' in gevonden) {
    if (nr === 1 && S.totaalVanPagina(pagina) === 0) {
      staat.totaal = 0;
      staat.leeg = true;
      return 0;
    }
    throw new Fout(`L1: matrix, pagina ${nr}: ${gevonden.fout} Bovenste sleutels: ${sleutelsVan(pagina)}.`, 3);
  }
  if (staat.pad === undefined) staat.pad = gevonden.pad;
  else if (gevonden.pad !== staat.pad) throw new Fout(`L1: matrix, pagina ${nr}: de groepen staan onder "${gevonden.pad}", op pagina 1 onder "${staat.pad}".`, 3);
  if (!losseGroepen) {
    const totaal = S.totaalVanPagina(pagina);
    if (totaal === undefined) {
      throw new Fout(`L1: matrix, pagina ${nr}: meta.total_elements ontbreekt. Zonder dat valt niet vast te stellen of de matrix volledig is.`, 3);
    }
    if (staat.totaal === undefined) staat.totaal = totaal;
    else if (totaal !== staat.totaal) throw new Fout(`Matrix, pagina ${nr}: het totaal veranderde tijdens het ophalen (${staat.totaal}, nu ${totaal}).`);
  }
  const eerste = M.canoniek(gevonden.lijst[0]);
  if (staat.eersten.has(eerste)) {
    throw new Fout(`Matrix, pagina ${nr}: dezelfde eerste groep als op een vorige pagina. Het pagineren werkt niet zoals verwacht.`);
  }
  staat.eersten.add(eerste);
  staat.groepen.push(...gevonden.lijst);
  return gevonden.lijst.length;
}

async function haalMatrixApi(staat) {
  let adres = new URL(`${api.structuurBasis}/structuuronderdeelgroep`).toString();
  const structuurOrigin = new URL(api.structuurBasis).origin;
  const gezien = new Set();
  for (let nr = 1; ; nr++) {
    if (nr > MAX_MATRIX_PAGINAS) throw new Fout(`Matrix: na ${MAX_MATRIX_PAGINAS} pagina's nog geen einde. De ophaling is onvolledig.`);
    if (gezien.has(adres)) throw new Fout(`Matrix, pagina ${nr}: die pagina is al opgehaald (een lus in de paginering).`);
    gezien.add(adres);
    if (nr > 1) await wacht(PAUZE_MS);
    const { json } = await haalJson(adres, `Matrix, pagina ${nr}`, 'matrix');
    const n = verwerkMatrixPagina(staat, json, nr, false);
    log(`Matrix, pagina ${nr}: ${n} groepen (totaal volgens de API: ${staat.totaal ?? '?'}).`);
    if (staat.leeg) return;
    if (staat.totaal !== undefined && staat.groepen.length >= staat.totaal) return;
    const volgende = S.volgendeLink(json);
    if (volgende === undefined) return;
    let doel;
    try {
      doel = new URL(volgende, adres);
    } catch {
      throw new Fout(`Matrix, pagina ${nr}: de link naar de volgende pagina is geen geldig adres.`);
    }
    if (doel.origin !== structuurOrigin) {
      throw new Fout(`Matrix, pagina ${nr}: de volgende pagina staat op een andere origin (${doel.origin}). Het script volgt die link niet, want de sleutel zou meegaan.`);
    }
    adres = doel.toString();
  }
}

function leesMatrixBron(pad, staat) {
  const json = leesJsonBestand(pad, 'Het bronbestand van de matrix');
  if (Array.isArray(json) && json.some((x) => isObject(x) && heeft(x, S.KOPPEL_PARAMETER))) {
    verwerkMatrixPagina(staat, json, 1, true); // een lijst groepen: geen totaal om mee te vergelijken
    return;
  }
  if (!Array.isArray(json) && !isObject(json)) throw new Fout(`Het bronbestand van de matrix heeft een onverwachte vorm (${sleutelsVan(json)}).`);
  const paginas = Array.isArray(json) ? json : [json];
  paginas.forEach((pagina, i) => {
    if (!staat.leeg) verwerkMatrixPagina(staat, pagina, i + 1, false);
  });
}

/** Telt per pad (groep.<veld>, onderdeel.<veld>, onderdeel.historiek_structuuronderdelen.<veld>) de JSON-types. */
function veldInventaris(ruweGroepen) {
  const telling = new Map();
  const tel = (pad, waarde) => {
    const type = waarde === null ? 'null' : Array.isArray(waarde) ? 'array' : typeof waarde;
    let types = telling.get(pad);
    if (!types) telling.set(pad, (types = new Map()));
    types.set(type, (types.get(type) ?? 0) + 1);
  };
  for (const g of ruweGroepen) {
    if (!isObject(g)) continue;
    for (const k of Object.keys(g)) tel(`groep.${k}`, g[k]);
    const lijst = Array.isArray(g.structuuronderdelen) ? g.structuuronderdelen : [g.structuuronderdelen];
    for (const o of lijst) {
      if (!isObject(o)) continue;
      for (const k of Object.keys(o)) tel(`onderdeel.${k}`, o[k]);
      if (isObject(o.historiek_structuuronderdelen)) {
        for (const k of Object.keys(o.historiek_structuuronderdelen)) tel(`onderdeel.historiek_structuuronderdelen.${k}`, o.historiek_structuuronderdelen[k]);
      }
    }
  }
  return Object.fromEntries(
    [...telling.entries()].sort((a, b) => vergelijkTekst(a[0], b[0])).map(([pad, types]) => [pad, Object.fromEntries([...types.entries()].sort((a, b) => vergelijkTekst(a[0], b[0])))]),
  );
}

/** Normaliseert de groepen en zoekt dubbels (D1). Elk probleem van de normalisatie maakt de matrix onbetrouwbaar. */
function normaliseerMatrix(ruweGroepen) {
  const problemen = [];
  const groepen = new Map();
  const onderdelen = new Map();
  for (const raw of ruweGroepen) {
    const n = S.normaliseerGroep(raw);
    for (const p of n.problemen) problemen.push(`D1: ${p}`);
    if (n.groep === undefined) continue;
    if (groepen.has(n.groep.nummer)) {
      problemen.push(`D1: groep ${n.groep.nummer} staat er meer dan één keer in.`);
      continue;
    }
    groepen.set(n.groep.nummer, n.groep);
    for (const o of n.onderdelen) {
      const al = onderdelen.get(o.nummer);
      if (al !== undefined) {
        problemen.push(`D1: onderdeel ${o.nummer} staat in groep ${al.groep} en in groep ${o.groep}.`);
        continue;
      }
      onderdelen.set(o.nummer, o);
    }
  }
  return { groepen, onderdelen, problemen };
}

// De velden van een record in een vaste volgorde (zoals in src/lib/studierichtingen.ts), zodat een
// bestand niet afhangt van hoe een record ontstond (nieuw uit de API of gelezen uit het oude bestand).
const GROEP_VOLGORDE = ['nummer', 'titel', 'graad', 'finaliteit', 'onderwijsniveau', 'soortLeerjaar', 'opleidingsvorm', 'type7', 'onderdelen', 'nietMeerInBron', 'extra'];
const ONDERDEEL_VOLGORDE = [
  'nummer', 'groep', 'titel', 'onderwijsvorm', 'studiedomein', 'stem', 'discipline', 'coefficient', 'niche', 'duaal', 'aanloop', 'ov4',
  'begindatum', 'einddatum', 'leerjaren', 'hoofdstructuren', 'onderwijsstelsels', 'instellingstypes', 'erkenningen', 'vorige', 'volgende',
  'voorbereidend', 'vervolg', 'oudNummer', 'faseBuso', 'laatsteWijziging', 'nietMeerInBron', 'extra',
];
const REGEL_VOLGORDE = ['groep', 'status', 'methode', 'aantal', 'sets', 'sha256', 'opgehaald', 'nietMeerInBron', 'bestand'];
const SET_VOLGORDE = ['set', 'onderwijssoort', 'setSha', 'setAantal', 'ids'];

function orden(record, volgorde) {
  const uit = {};
  for (const k of volgorde) if (heeft(record, k) && record[k] !== undefined) uit[k] = record[k];
  for (const k of Object.keys(record).filter((k) => !volgorde.includes(k)).sort()) {
    if (record[k] !== undefined) Object.defineProperty(uit, k, { value: record[k], enumerable: true, writable: true, configurable: true });
  }
  return uit;
}

/**
 * Voegt de nieuwe matrix samen met het bestaande bestand (§ 5.2 stap 2): wat niet meer in de API staat,
 * blijft staan met `nietMeerInBron` (de datum van de eerste keer). Wat terugkomt, verliest dat veld.
 * Een verdwenen groep waarvan elk onderdeel nu in een andere groep staat, kan zo niet bewaard worden: D1.
 */
function voegMatrixSamen(nieuw, oud, vandaag) {
  const problemen = [];
  const verslag = { nieuw: [], gewijzigd: [], nietMeerInBron: [], terugInBron: [], onderdelenNietMeerInBron: [], afgebouwdSindsVorige: [] };
  const groepen = new Map();
  const onderdelen = new Map(nieuw.onderdelen);
  for (const [nr, g] of nieuw.groepen) groepen.set(nr, { ...g });
  const oudeGroepen = new Map((oud?.groepen ?? []).map((g) => [g.nummer, g]));
  for (const g of oud?.groepen ?? []) {
    if (groepen.has(g.nummer)) {
      if (g.nietMeerInBron !== undefined) verslag.terugInBron.push(g.nummer);
      continue;
    }
    groepen.set(g.nummer, { ...g, nietMeerInBron: g.nietMeerInBron ?? vandaag });
    if (g.nietMeerInBron === undefined) verslag.nietMeerInBron.push(g.nummer);
  }
  for (const o of oud?.onderdelen ?? []) {
    if (onderdelen.has(o.nummer)) continue;
    onderdelen.set(o.nummer, { ...o, nietMeerInBron: o.nietMeerInBron ?? vandaag });
    if (o.nietMeerInBron === undefined) verslag.onderdelenNietMeerInBron.push(o.nummer);
  }
  const perGroep = new Map();
  for (const o of onderdelen.values()) {
    if (!groepen.has(o.groep)) {
      problemen.push(`D1: onderdeel ${o.nummer} hoort bij groep ${o.groep}, die nergens staat.`);
      continue;
    }
    let lijst = perGroep.get(o.groep);
    if (!lijst) perGroep.set(o.groep, (lijst = []));
    lijst.push(o.nummer);
  }
  for (const [nr, g] of groepen) {
    const lijst = (perGroep.get(nr) ?? []).sort((a, b) => a - b);
    if (lijst.length === 0) {
      problemen.push(`D1: groep ${nr} staat niet meer in de bron en al haar onderdelen staan nu in een andere groep (${(g.onderdelen ?? []).join(', ')}). Kijk dat na voor je verder gaat.`);
    }
    g.onderdelen = lijst;
  }
  const groepLijst = [...groepen.values()].sort((a, b) => S.vergelijkGroepnummer(a.nummer, b.nummer)).map((g) => orden(g, GROEP_VOLGORDE));
  const onderdeelLijst = [...onderdelen.values()].sort((a, b) => a.nummer - b.nummer).map((o) => orden(o, ONDERDEEL_VOLGORDE));

  // Wat veranderde tegenover het vorige bestand (alleen voor het rapport).
  if (oud) {
    const oudeOnderdelen = new Map(oud.onderdelen.map((o) => [o.nummer, o]));
    const nieuweOnderdelen = new Map(onderdeelLijst.map((o) => [o.nummer, o]));
    const oudeDag = String(oud.opgehaald).slice(0, 10);
    for (const g of groepLijst) {
      if (!nieuw.groepen.has(g.nummer)) continue;
      const oudG = oudeGroepen.get(g.nummer);
      if (!oudG) {
        verslag.nieuw.push(g.nummer);
        continue;
      }
      const handtekening = (groep, bron) => M.canoniek({ groep, onderdelen: groep.onderdelen.map((n) => bron.get(n) ?? null) });
      if (handtekening(oudG, oudeOnderdelen) !== handtekening(g, nieuweOnderdelen)) verslag.gewijzigd.push(g.nummer);
      const nu = g.onderdelen.map((n) => nieuweOnderdelen.get(n)).filter((o) => o && o.nietMeerInBron === undefined);
      const toen = oudG.onderdelen.map((n) => oudeOnderdelen.get(n)).filter((o) => o && o.nietMeerInBron === undefined);
      const afgebouwd = (lijst, dag) => lijst.length > 0 && lijst.every((o) => S.isAfgebouwd(o, dag));
      if (afgebouwd(nu, vandaag) && !(isDag(oudeDag) && afgebouwd(toen, oudeDag))) verslag.afgebouwdSindsVorige.push(g.nummer);
    }
  } else {
    verslag.nieuw.push(...groepLijst.map((g) => g.nummer));
  }
  return { groepen: groepLijst, onderdelen: onderdeelLijst, problemen, verslag };
}

function lijstTekst(naam, items) {
  const regels = items.map((x) => JSON.stringify(x));
  return regels.length === 0 ? `${INSPRINGING}"${naam}": []` : `${INSPRINGING}"${naam}": [\n${regels.join(',\n')}\n${INSPRINGING}]`;
}

/** Kop met 2 spaties inspringing, daarna één compact record per regel: een verschil in git blijft leesbaar. */
function metKop(kop, lijsten) {
  const kopTekst = JSON.stringify(kop, null, 2).replace(/\n}$/, '');
  return `${kopTekst},\n${lijsten.map(([naam, items]) => lijstTekst(naam, items)).join(',\n')}\n}\n`;
}

function bouwMatrixTekst(groepen, onderdelen, opgehaald) {
  const kop = {
    app: 'boosterz',
    kind: 'studierichtingen',
    v: 1,
    bron: S.STRUCTUUR_BRON,
    api: `${S.STRUCTUUR_API}/structuuronderdeelgroep`,
    naamsvermelding: S.STRUCTUUR_NAAMSVERMELDING,
    licentie: M.LICENTIE,
    opgehaald,
    aantalGroepen: groepen.length,
    aantalOnderdelen: onderdelen.length,
    sha256: shaVan({ groepen, onderdelen }),
  };
  return { tekst: metKop(kop, [['groepen', groepen], ['onderdelen', onderdelen]]), sha256: kop.sha256 };
}

/**
 * Zachte controles op de matrix (§ 5.4): verwijzingen (vorige, volgende, voorbereidend, vervolg) naar
 * onderdelen die niet in de matrix staan, en per veld hoe vaak het in `extra` terechtkwam (onbekende
 * velden, en de rest van de elementen van een lijst). Alleen voor het rapport.
 */
function zachteMatrixControles(matrix) {
  const nummers = new Set(matrix.onderdelen.map((o) => o.nummer));
  const onbekend = [];
  for (const o of matrix.onderdelen) {
    for (const veld of ['vorige', 'volgende', 'voorbereidend', 'vervolg']) {
      for (const n of o[veld] ?? []) if (!nummers.has(n)) onbekend.push({ onderdeel: o.nummer, veld, nummer: n });
    }
  }
  const telling = new Map();
  const tel = (pad) => telling.set(pad, (telling.get(pad) ?? 0) + 1);
  for (const g of matrix.groepen) for (const k of Object.keys(g.extra ?? {})) tel(`groep.${k}`);
  for (const o of matrix.onderdelen) for (const k of Object.keys(o.extra ?? {})) tel(`onderdeel.${k}`);
  return {
    onbekendeVerwijzingen: { aantal: onbekend.length, voorbeelden: onbekend.slice(0, MAX_VOORBEELDEN) },
    veldenInExtra: Object.fromEntries([...telling.entries()].sort((a, b) => vergelijkTekst(a[0], b[0]))),
  };
}

/** De soort van een groep, uit de onderdelen die nu in de bron staan (bij een verdwenen groep: alle). */
function soortenVan(matrix) {
  const perGroep = new Map();
  for (const o of matrix.onderdelen) {
    let lijst = perGroep.get(o.groep);
    if (!lijst) perGroep.set(o.groep, (lijst = []));
    lijst.push(o);
  }
  const uit = new Map();
  for (const g of matrix.groepen) {
    const alle = perGroep.get(g.nummer) ?? [];
    const nu = alle.filter((o) => o.nietMeerInBron === undefined);
    uit.set(g.nummer, S.soortVanGroep(g, nu.length > 0 ? nu : alle));
  }
  return uit;
}

// ── Bestaande bestanden ─────────────────────────────────────────────────────

function leesTekst(pad) {
  try {
    return fs.readFileSync(pad, 'utf8');
  } catch {
    return undefined;
  }
}

function parse(tekst) {
  try {
    return JSON.parse(tekst);
  } catch {
    return undefined;
  }
}

/**
 * Leest wat er al staat en eist dat het klopt: een geldig matrixbestand met de juiste sha256, een
 * geldige index met één regel per groep van de matrix en dezelfde matrixSha256, en per regel het bestand
 * dat erbij hoort (I1 tot I5). Op een kapotte toestand schrijft het script niet verder.
 */
function leesBestaand(uit) {
  const fouten = [];
  const matrixPad = path.join(uit, MATRIX_BESTAND);
  const koppelMap = path.join(uit, KOPPEL_MAP);
  const indexPad = path.join(koppelMap, INDEX_BESTAND);
  const uitkomst = { matrix: null, matrixTekst: undefined, index: null, indexTekst: undefined, bestanden: new Map() };

  if (fs.existsSync(matrixPad)) {
    const tekst = leesTekst(matrixPad);
    const json = tekst === undefined ? undefined : parse(tekst);
    const f = json === undefined ? ['geen leesbare JSON.'] : S.valideerMatrixBestand(json);
    if (f.length > 0) fouten.push(`${MATRIX_BESTAND}: ${f.slice(0, 3).join(' ')}`);
    else if (shaVan({ groepen: json.groepen, onderdelen: json.onderdelen }) !== json.sha256) fouten.push(`${MATRIX_BESTAND}: de sha256 klopt niet.`);
    else Object.assign(uitkomst, { matrix: json, matrixTekst: tekst });
  }
  if (fs.existsSync(indexPad)) {
    const tekst = leesTekst(indexPad);
    const json = tekst === undefined ? undefined : parse(tekst);
    const f = json === undefined ? ['geen leesbare JSON.'] : S.valideerRichtingDoelenIndex(json);
    if (f.length > 0) fouten.push(`${KOPPEL_MAP}/${INDEX_BESTAND}: ${f.slice(0, 3).join(' ')}`);
    else Object.assign(uitkomst, { index: json, indexTekst: tekst });
  }
  if (fs.existsSync(koppelMap)) {
    for (const naam of fs.readdirSync(koppelMap).sort()) {
      if (naam === INDEX_BESTAND || !naam.endsWith('.json')) continue;
      if (!GROEP_BESTAND.test(naam)) {
        fouten.push(`${KOPPEL_MAP}/${naam}: een onbekend bestand.`);
        continue;
      }
      const groep = naam.slice(0, -'.json'.length);
      const tekst = leesTekst(path.join(koppelMap, naam));
      const json = tekst === undefined ? undefined : parse(tekst);
      const f = json === undefined ? ['geen leesbare JSON.'] : S.valideerRichtingDoelenBestand(json, groep);
      if (f.length > 0) fouten.push(`${KOPPEL_MAP}/${naam}: ${f.slice(0, 3).join(' ')}`);
      else if (shaVan(json.sets) !== json.sha256) fouten.push(`${KOPPEL_MAP}/${naam}: de sha256 klopt niet.`);
      else uitkomst.bestanden.set(groep, { tekst, json });
    }
  }
  if (fouten.length === 0) {
    const { matrix, index, bestanden } = uitkomst;
    if (index && !matrix) fouten.push(`De index van de koppeling staat er, maar ${MATRIX_BESTAND} niet.`);
    if (!index && bestanden.size > 0) fouten.push(`In ${KOPPEL_MAP}/ staan bestanden zonder index.`);
    if (index && matrix) {
      if (index.matrixSha256 !== matrix.sha256) fouten.push(`De index is gekoppeld tegen een andere matrix (matrixSha256 klopt niet).`);
      const inMatrix = new Set(matrix.groepen.map((g) => g.nummer));
      const inIndex = new Set(index.groepen.map((r) => r.groep));
      const zonderRegel = [...inMatrix].filter((g) => !inIndex.has(g));
      const zonderGroep = [...inIndex].filter((g) => !inMatrix.has(g));
      if (zonderRegel.length > 0) fouten.push(`Geen regel in de index voor ${zonderRegel.slice(0, 5).join(', ')}.`);
      if (zonderGroep.length > 0) fouten.push(`De index noemt groepen die niet in de matrix staan: ${zonderGroep.slice(0, 5).join(', ')}.`);
      const genoemd = new Set(index.groepen.filter((r) => r.bestand !== undefined).map((r) => r.groep));
      for (const groep of bestanden.keys()) {
        if (!genoemd.has(groep)) fouten.push(`${KOPPEL_MAP}/${groep}.json staat er, maar de index noemt het niet.`);
      }
      for (const r of index.groepen) {
        const b = bestanden.get(r.groep);
        if (r.bestand === undefined) continue;
        if (!b) {
          fouten.push(`De index noemt ${KOPPEL_MAP}/${r.bestand}, maar dat bestand ontbreekt.`);
          continue;
        }
        if (r.status === 'gekoppeld') {
          const kop = b.json;
          if (kop.aantal !== r.aantal || kop.sets.length !== r.sets || kop.sha256 !== r.sha256 || kop.opgehaald !== r.opgehaald || kop.methode !== r.methode) {
            fouten.push(`${KOPPEL_MAP}/${r.bestand}: de kop klopt niet met de regel in de index.`);
          }
        } else if (b.json.nietMeerInBron === undefined) {
          fouten.push(`${KOPPEL_MAP}/${r.bestand}: een laatst bekende koppeling zonder "nietMeerInBron".`);
        }
      }
    }
  }
  if (fouten.length > 0) {
    throw new Fout(`De bestaande bestanden in ${uit} kloppen niet: ${fouten.slice(0, 5).join(' ')}${fouten.length > 5 ? ` (en nog ${fouten.length - 5})` : ''} Herstel ze eerst; er is niets geschreven.`);
  }
  return uitkomst;
}

// ── Minimumdoelen in de repository ──────────────────────────────────────────

/** Leest minimumdoelen/index.json en alle setbestanden die het noemt (alleen lezen). */
function leesMinimumdoelen(map) {
  const indexPad = path.join(map, 'index.json');
  const index = leesJsonBestand(indexPad, 'De index van de minimumdoelen');
  if (!isObject(index) || index.kind !== 'minimumdoelen-index' || !Array.isArray(index.sets)) {
    throw new Fout(`${indexPad} is geen index van de minimumdoelen.`);
  }
  const sets = new Map();
  for (const s of index.sets) {
    if (!isObject(s) || typeof s.id !== 'string' || typeof s.bestand !== 'string' || typeof s.sha256 !== 'string' || !Number.isInteger(s.aantal)) {
      throw new Fout(`${indexPad}: een set heeft geen id, bestand, sha256 of aantal.`);
    }
    if (path.basename(s.bestand) !== s.bestand) throw new Fout(`${indexPad}: het bestand van ${s.id} is geen gewone bestandsnaam.`);
    const bestand = leesJsonBestand(path.join(map, s.bestand), `Het setbestand van ${s.id}`);
    if (!isObject(bestand) || !Array.isArray(bestand.doelen)) throw new Fout(`Het setbestand van ${s.id} heeft geen doelen.`);
    const ids = [];
    let zonderId = 0;
    for (const d of bestand.doelen) {
      if (isObject(d) && typeof d.id === 'string' && d.id !== '') ids.push(d.id);
      else zonderId++;
    }
    sets.set(s.id, { ingang: s, doelen: bestand.doelen, ids: new Set(ids), lijst: ids, zonderId });
  }
  return { index, sets };
}

/** Zoals soortVanSet in src/lib/minimumdoelenBron.ts (die module laadt niet in Node): uit de naam. */
function soortVanSetNaam(naam) {
  const n = String(naam).trim().toLowerCase();
  if (n.startsWith('buitengewoon')) return 'buso';
  if (n.includes('volwassenenonderwijs')) return 'vwo';
  if (n.startsWith('secundair onderwijs')) return 'so';
  return 'ander';
}

/**
 * D8: de groepnummers die het ordeningskader in een geldige set (geldigheid "Geldig") aan een doel
 * geeft. Verfijning: een getagd groepnummer telt alleen mee als die groep in de matrix staat en nu een
 * gewone, niet afgebouwde groep van de 2de of 3de graad is (zie redenNietMeetellen). Zo werkt de poort ook
 * op een matrix met maar een paar groepen (de fixtures) en op een groep die de bron afbouwde; in de echte,
 * volledige matrix zijn dat alle 133 getagde groepen. Wat niet meetelt, komt met de reden in de
 * waarschuwingen; ontbreekt een getagde groep in een matrix van minstens D8_MIN_GROEPEN groepen, dan is
 * dat een stop (exit 3).
 */
function ordeningskaderGroepen(md) {
  const getagd = new Set();
  for (const { ingang, doelen } of md.sets.values()) {
    if (ingang.geldigheid !== 'Geldig') continue;
    for (const d of doelen) if (isObject(d)) for (const g of S.groepnummersVanDoel(d)) getagd.add(g);
  }
  return [...getagd].sort(S.vergelijkGroepnummer);
}

/** D8: vanaf zoveel groepen geldt de matrix als volledig (de echte telt er ±545, de fixtures 9). */
const D8_MIN_GROEPEN = 100;

/**
 * Waarom een getagde groep niet meetelt voor D8, of undefined als ze meetelt. `nietInMatrix` maakt het
 * verschil tussen een groep die de matrix helemaal niet kent en een die er wel in staat maar niet past.
 */
function redenNietMeetellen(nr, { groepInfo, nieuweGroepen, soorten, onderdelenPerGroep, vandaag }) {
  const g = groepInfo.get(nr);
  if (g === undefined) return { reden: 'staat niet in de matrix', nietInMatrix: true };
  if (!nieuweGroepen.has(nr)) return { reden: `staat niet meer in de bron${g.nietMeerInBron ? ` (sinds ${g.nietMeerInBron})` : ''}` };
  const soort = soorten.get(nr);
  if (soort !== 'gewoon') return { reden: `is geen gewone groep (soort ${soort})` };
  if (g.graad !== '2' && g.graad !== '3') return { reden: `hoort niet bij de 2de of 3de graad (graad ${g.graad ?? 'onbekend'})` };
  const nu = (onderdelenPerGroep.get(nr) ?? []).filter((o) => o.nietMeerInBron === undefined);
  if (nu.length > 0 && nu.every((o) => S.isAfgebouwd(o, vandaag))) return { reden: `is afgebouwd (elk onderdeel voorbij zijn einddatum op ${vandaag})` };
  return undefined;
}

// ── Koppeling ───────────────────────────────────────────────────────────────

function koppelAdres(groep, pagina) {
  return `${api.doelenBasis}/onderwijsdoel?paginanr=${pagina}&rijen_per_pagina=${RIJEN_PER_PAGINA}&${S.KOPPEL_PARAMETER}=${encodeURIComponent(groep)}`;
}

/** T: het totaal zonder filter (D2). */
async function haalTotaalApi() {
  const { json } = await haalJson(`${api.doelenBasis}/onderwijsdoel?paginanr=1&rijen_per_pagina=1`, 'Totaal zonder filter', 'koppeling');
  return paginaTotaal(json);
}

/**
 * Controleert de pagina's van één groep terwijl ze binnenkomen: totalItems (L1), de filter (D2, meteen
 * na de eerste pagina, zodat een genegeerde filter geen 24 000 records kost), de leden (L1) en de
 * paginering. `volgende(nr)` haalt pagina nr; undefined = geen pagina meer.
 */
async function leesGroepPaginas(groep, eerste, volgende, T) {
  const totaal = paginaTotaal(eerste);
  if (totaal === undefined) throw new Fout(`L1: ${groep}: gegevens.totalItems ontbreekt. Zonder dat valt niet vast te stellen of de koppeling volledig is. Bovenste sleutels: ${sleutelsVan(eerste)}.`, 3);
  if (totaal >= T || totaal > MAX_DOELEN_PER_GROEP) {
    throw new Fout(`D2: ${groep} geeft ${totaal} doelen (totaal zonder filter: ${T}, grens ${MAX_DOELEN_PER_GROEP}). De filter op ${S.KOPPEL_PARAMETER} wordt genegeerd: ${FILTER_MELDING}.`, 3);
  }
  const records = [];
  const eersten = new Set();
  let pagina = eerste;
  for (let nr = 1; ; nr++) {
    const leden = paginaLeden(pagina);
    if (leden === undefined) throw new Fout(`L1: ${groep}, pagina ${nr}: geen lijst met doelen (gegevens.member). Bovenste sleutels: ${sleutelsVan(pagina)}.`, 3);
    const t = paginaTotaal(pagina);
    if (t !== totaal) throw new Fout(`${groep}, pagina ${nr}: totalItems veranderde tijdens het ophalen (${totaal}, nu ${t ?? 'niets'}).`);
    if (leden.length === 0 && records.length < totaal) throw new Fout(`Koppeling onvolledig: ${groep}, pagina ${nr} is leeg na ${records.length} van de ${totaal} doelen.`);
    if (leden.length > 0) {
      const sleutel = M.canoniek(leden[0]);
      if (eersten.has(sleutel)) throw new Fout(`Koppeling onvolledig: ${groep}, pagina ${nr} begint met hetzelfde doel als een vorige pagina. Het pagineren werkt niet zoals verwacht.`);
      eersten.add(sleutel);
    }
    records.push(...leden);
    if (records.length >= totaal) break;
    if (nr >= MAX_KOPPEL_PAGINAS) throw new Fout(`Koppeling onvolledig: ${groep}: na ${nr} pagina's nog maar ${records.length} van de ${totaal} doelen.`);
    pagina = await volgende(nr + 1);
    if (pagina === undefined) throw new Fout(`Koppeling onvolledig: ${groep}: ${records.length} doelen ontvangen, totalItems zegt ${totaal}.`);
  }
  if (records.length !== totaal) throw new Fout(`Koppeling onvolledig: ${groep}: ${records.length} doelen ontvangen, totalItems zegt ${totaal}.`);
  return { records, totaal };
}

/**
 * Eén groep via de API, in ronde 1 of 2. Een 404 op pagina 1 geeft { status: 404 } terug: na de eerste
 * ronde vraagt het script zo'n groep nog één keer (de tweede ronde, zie main). Pas een tweede 404 betekent
 * "geen doelen". Zo wacht het script niet per groep met een 404: dat zijn er ±290.
 */
async function haalGroepApi(groep, T, ronde) {
  const eerste = await haalJson(koppelAdres(groep, 1), `${groep}, pagina 1${ronde === 2 ? ' (tweede ronde)' : ''}`, 'koppeling', { mag404: true });
  if (eerste.status === 404) return { status: 404, voorbeeld: eerste.tekst };
  const volgende = async (nr) => {
    await wacht(PAUZE_MS);
    const r = await haalJson(koppelAdres(groep, nr), `${groep}, pagina ${nr}`, 'koppeling');
    return r.json;
  };
  const { records, totaal } = await leesGroepPaginas(groep, eerste.json, volgende, T);
  return { status: 200, records, totaal, pogingen404: ronde === 2 ? 1 : 0 };
}

/** Eén groep uit --bron-koppeling: een pagina, een lijst pagina's of {"status": 404}. */
async function haalGroepBron(bron, groep, T) {
  if (!heeft(bron.groepen, groep)) throw new Fout(`Het bronbestand van de koppeling heeft geen antwoord voor ${groep}.`);
  const waarde = bron.groepen[groep];
  if (isObject(waarde) && heeft(waarde, 'status') && !heeft(waarde, 'gegevens')) {
    if (waarde.status === 404) return { status: 404, voorbeeld: JSON.stringify(waarde) };
    throw new Fout(`${groep}: de bron antwoordt met HTTP ${kort(waarde.status, 20)}.`);
  }
  const paginas = Array.isArray(waarde) ? waarde : [waarde];
  if (paginas.length === 0) throw new Fout(`${groep}: de bron bevat geen pagina.`);
  const { records, totaal } = await leesGroepPaginas(groep, paginas[0], async (nr) => paginas[nr - 1], T);
  return { status: 200, records, totaal, pogingen404: 0 };
}

function leesKoppelingBron(pad) {
  const json = leesJsonBestand(pad, 'Het bronbestand van de koppeling');
  if (!isObject(json) || !isObject(json.groepen)) throw new Fout(`Het bronbestand van de koppeling heeft niet de vorm {"totaal": …, "groepen": {…}} (sleutels: ${sleutelsVan(json)}).`);
  return json;
}

/**
 * Van de records van één groep naar sets met vaste nummers (§ 3.4): de set via M.setVan, het nummer via
 * M.normaliseerRecord (D7), de soort onderwijs via S.onderwijssoortVanRecord (D5), daarna de controle
 * tegen de minimumdoelen (D3) en de graad (D4). Letterlijk gelijke records worden één (samengevoegd).
 */
function verwerkGroep(groep, graad, records, md) {
  const problemen = [];
  const voeg = (p) => {
    if (problemen.length < MAX_PROBLEMEN_PER_GROEP) problemen.push(p);
    else if (problemen.length === MAX_PROBLEMEN_PER_GROEP) problemen.push(`${groep}: … en nog meer problemen.`);
  };
  const perSet = new Map();
  const gezien = new Set();
  let samengevoegd = 0;
  let zelfdeNummer = 0;
  let achter = false;
  for (const record of records) {
    const sleutel = M.canoniek(record);
    if (gezien.has(sleutel)) {
      samengevoegd++;
      continue;
    }
    gezien.add(sleutel);
    const set = M.setVan(record).setSleutel;
    const id = M.normaliseerRecord(record)?.doel.id;
    if (!SET_ID.test(set)) {
      voeg(`D7: ${groep}: een doel zonder set (ODS_<getal>)${id !== undefined ? ` (nummer ${id})` : ''}.`);
      continue;
    }
    if (id === undefined) {
      voeg(`D7: ${groep}, ${set}: een doel zonder vast nummer (@id), of zonder code of omschrijving.`);
      continue;
    }
    let s = perSet.get(set);
    if (!s) perSet.set(set, (s = { ids: new Set(), soorten: new Set() }));
    if (s.ids.has(id)) zelfdeNummer++;
    else s.ids.add(id);
    s.soorten.add(S.onderwijssoortVanRecord(record) ?? '');
  }
  const sets = [];
  for (const set of [...perSet.keys()].sort(S.vergelijkNatuurlijk)) {
    const { ids, soorten } = perSet.get(set);
    if (soorten.size > 1) {
      voeg(`D5: ${groep}, ${set}: meer dan één soort onderwijs (${[...soorten].map((x) => `"${x || '(leeg)'}"`).sort().join(', ')}).`);
      continue;
    }
    const bekend = md.sets.get(set);
    if (!bekend) {
      achter = true;
      voeg(`D3: ${groep}: de set ${set} staat niet in minimumdoelen/index.json.`);
      continue;
    }
    const onbekend = [...ids].filter((id) => !bekend.ids.has(id)).sort(S.vergelijkNatuurlijk);
    if (onbekend.length > 0) {
      achter = true;
      voeg(`D3: ${groep}, ${set}: ${onbekend.length} nummer(s) staan niet in het setbestand (${onbekend.slice(0, 5).join(', ')}${onbekend.length > 5 ? ', …' : ''}).`);
      continue;
    }
    const setGraad = GRAAD_VAN_SET[bekend.ingang.graad];
    if (graad !== undefined && setGraad !== undefined && setGraad !== graad) {
      voeg(`D4: ${groep} (graad ${graad}) krijgt ${set} (${bekend.ingang.graad}).`);
      continue;
    }
    const soort = [...soorten][0];
    const regel = { set, ...(soort ? { onderwijssoort: soort } : {}), setSha: bekend.ingang.sha256.slice(0, 16), setAantal: bekend.ingang.aantal, ids: [...ids].sort(S.vergelijkNatuurlijk) };
    sets.push(orden(regel, SET_VOLGORDE));
  }
  return { sets, problemen, achter, samengevoegd, zelfdeNummer };
}

/** De 1ste graad koppelt de bron niet per richting (§ 3.4): alle sets van de graad en de stroom, volledig. */
function graadEnStroom(groep, stroom, md) {
  const problemen = [];
  const sets = [];
  for (const { ingang, lijst, zonderId } of md.sets.values()) {
    if (ingang.graad !== '1ste graad' || ingang.stroom !== `${stroom}-stroom`) continue;
    if (zonderId > 0 || new Set(lijst).size !== lijst.length || lijst.length !== ingang.aantal) {
      problemen.push(`${groep}: de set ${ingang.id} kan niet volledig gekoppeld worden (doelen zonder of met een dubbel vast nummer, of een ander aantal dan in de index).`);
      continue;
    }
    if (lijst.length === 0) continue;
    sets.push(orden({ set: ingang.id, setSha: ingang.sha256.slice(0, 16), setAantal: ingang.aantal, ids: [...lijst].sort(S.vergelijkNatuurlijk) }, SET_VOLGORDE));
  }
  sets.sort((a, b) => S.vergelijkNatuurlijk(a.set, b.set));
  return { sets, problemen };
}

const FILTER_EERSTE_GRAAD = (stroom) => `graad=1ste graad; stroom=${stroom}-stroom (regel van Boosterz: de bron koppelt de 1ste graad niet per richting)`;

function bouwRichtingTekst(b) {
  const sets = b.sets.map((s) => orden(s, SET_VOLGORDE));
  const kop = {
    app: 'boosterz',
    kind: 'richtingdoelen',
    v: 1,
    groep: b.groep,
    titel: b.titel,
    ...(b.graad !== undefined ? { graad: b.graad } : {}),
    methode: b.methode,
    filter: b.filter,
    bron: M.BRON_BASIS,
    api: `${M.API_BASIS}/onderwijsdoel`,
    naamsvermelding: M.NAAMSVERMELDING,
    licentie: M.LICENTIE,
    opgehaald: b.opgehaald,
    aantal: sets.reduce((som, s) => som + s.ids.length, 0),
    sha256: shaVan(sets),
    ...(b.nietMeerInBron !== undefined ? { nietMeerInBron: b.nietMeerInBron } : {}),
  };
  return { tekst: metKop(kop, [['sets', sets]]), kop };
}

function bouwIndexTekst(regels, matrixSha256) {
  const kop = {
    app: 'boosterz',
    kind: 'richtingdoelen-index',
    v: 1,
    bron: M.BRON_BASIS,
    api: `${M.API_BASIS}/onderwijsdoel?${S.KOPPEL_PARAMETER}=`,
    naamsvermelding: M.NAAMSVERMELDING,
    licentie: M.LICENTIE,
    matrixSha256,
  };
  return metKop(kop, [['groepen', regels.map((r) => orden(r, REGEL_VOLGORDE))]]);
}

// ── Rapport ─────────────────────────────────────────────────────────────────

let rapport;
let rapportPad;
let begin;

function soortTelling() {
  return { gewoon: 0, zevende: 0, aanloop: 0, buso: 0, ander: 0 };
}

function nieuwRapport(cfg) {
  return {
    tijdstip: cfg.nu,
    bron: cfg.viaApi ? 'api' : 'bestand',
    stand: cfg.stand,
    ...(cfg.groepen ? { proefrunGroepen: cfg.groepen } : {}),
    verzoeken: 0,
    duurSeconden: 0,
    geschreven: { bestanden: 0, bytes: 0 },
    omvang: null,
    matrix: {
      verzoeken: 0, paginas: 0, lijstPad: null, totaalVolgensApi: null, groepen: 0, onderdelen: 0, perSoort: soortTelling(),
      nieuw: [], gewijzigd: [], nietMeerInBron: [], onderdelenNietMeerInBron: [], terugInBron: [], afgebouwdSindsVorige: [], veldInventaris: {}, bestand: null,
    },
    koppeling: {
      verzoeken: 0, duurSeconden: 0, totaalZonderFilter: null, gekoppeld: 0, geen: 0, graadEnStroom: 0, nogNietOpgehaald: 0, geenPerSoort: soortTelling(),
      // eersteGraadPerStroom: de groepen met methode graad-en-stroom in de index, per stroom (voor de PR-tekst).
      eersteGraadPerStroom: { A: 0, B: 0 },
      // tweedeRonde: de groepen met een 404 op pagina 1 die na de eerste ronde nog één keer gevraagd werden.
      tweedeRonde: { groepen: 0, verzoeken: 0 },
      nieuw: [], gewijzigd: [], ongewijzigd: [], nuZonderDoelen: [], eersteGraadNuGekoppeld: [], samengevoegdeDubbels: 0, zelfdeNummerAndereRecord: 0,
      onderwijssoortVerschillen: [], ordeningskader: { getagd: 0, groepen: 0, zonderKoppeling: [], nietMeegeteld: [] },
      kruiscontrole: { setsBekeken: 0, verschillen: 0, verschillenGeldigSo: 0, voorbeelden: [] }, voorbeeld404: null, index: null,
    },
    problemen: [],
    waarschuwingen: [],
    fout: null,
  };
}

function werkTellersBij() {
  if (!rapport) return;
  rapport.verzoeken = teller.verzoeken;
  rapport.matrix.verzoeken = teller.matrix;
  rapport.koppeling.verzoeken = teller.koppeling;
  rapport.duurSeconden = Math.round((Date.now() - begin) / 100) / 10;
}

/** De omvang van wat er na de run in de uitvoermap staat (§ 3.2 en § 3.4 schatten 0,6 tot 4 MB). */
function omvangVan(uit) {
  const grootte = (pad) => (fs.existsSync(pad) ? fs.statSync(pad).size : 0);
  const koppelMap = path.join(uit, KOPPEL_MAP);
  const bestanden = fs.existsSync(koppelMap) ? fs.readdirSync(koppelMap).filter((f) => GROEP_BESTAND.test(f)) : [];
  return {
    matrixBytes: grootte(path.join(uit, MATRIX_BESTAND)),
    indexBytes: grootte(path.join(koppelMap, INDEX_BESTAND)),
    koppelingBestanden: bestanden.length,
    koppelingBytes: bestanden.reduce((som, f) => som + grootte(path.join(koppelMap, f)), 0),
  };
}

function schrijfRapport(pad, inhoud) {
  fs.mkdirSync(path.dirname(pad), { recursive: true });
  fs.writeFileSync(pad, schoon(JSON.stringify(inhoud, null, 2)) + '\n', 'utf8');
}

function bevatSleutel(tekst) {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  return Boolean(sleutel) && sleutel.length >= 4 && schoon(tekst) !== tekst;
}

/** Stopt met exit 3 als er problemen zijn; de eerste paar staan in de melding, alle in het rapport. */
function stopBijProblemen(problemen, inleiding, extra = '') {
  if (problemen.length === 0) return;
  rapport.problemen.push(...problemen);
  const eerste = problemen.slice(0, 3).join(' ');
  throw new Fout(`${inleiding}: ${eerste}${problemen.length > 3 ? ` (en nog ${problemen.length - 3}; zie problemen in het rapport)` : ''}${extra ? ` ${extra}` : ''} Er is niets geschreven.`, 3);
}

// ── Hoofdprogramma ──────────────────────────────────────────────────────────

async function main() {
  begin = Date.now();
  const opties = leesOpties(process.argv.slice(2));
  if (opties.help) {
    console.log(HULP);
    return 0;
  }
  // Het rapport komt er ook als de opties niet kloppen (zoals bij haal-minimumdoelen).
  rapportPad = path.resolve(opties.rapport ?? path.join(root, 'tools', 'leerplannen', 'rapport', 'laatste-studierichtingen.json'));
  const cfg = controleerOpties(opties);
  rapport = nieuwRapport(cfg);
  if (cfg.viaApi) zetApi(cfg);

  const bestaand = leesBestaand(cfg.uit);
  const teSchrijven = []; // { pad, tekst }

  // 1-2. Matrix: ophalen of lezen, normaliseren, samenvoegen.
  let matrix; // { groepen, onderdelen, sha256, tekst, veranderd }
  let nieuweGroepen; // de groepnummers die nu in de bron staan
  if (cfg.stand === 'koppeling') {
    if (!bestaand.matrix) throw new Fout(`--alleen koppeling heeft het matrixbestand nodig, maar ${path.join(cfg.uit, MATRIX_BESTAND)} ontbreekt. Start eerst met "alles" of "matrix".`);
    matrix = { groepen: bestaand.matrix.groepen, onderdelen: bestaand.matrix.onderdelen, sha256: bestaand.matrix.sha256, veranderd: false };
    nieuweGroepen = new Set(matrix.groepen.filter((g) => g.nietMeerInBron === undefined).map((g) => g.nummer));
    rapport.matrix.bestand = 'niet opgehaald (--alleen koppeling)';
  } else {
    const staat = nieuweMatrixStaat();
    try {
      if (cfg.matrixViaApi) await haalMatrixApi(staat);
      else leesMatrixBron(cfg.bronMatrix, staat);
    } finally {
      Object.assign(rapport.matrix, { paginas: staat.paginas, lijstPad: staat.pad ?? null, totaalVolgensApi: staat.totaal ?? null, groepen: staat.groepen.length });
      rapport.matrix.veldInventaris = veldInventaris(staat.groepen);
    }
    if (staat.groepen.length === 0) throw new Fout('Geen enkele groep ontvangen. Er is niets geschreven.', 2);
    if (staat.totaal !== undefined && staat.groepen.length !== staat.totaal) {
      throw new Fout(`Matrix onvolledig: ${staat.groepen.length} groepen ontvangen, maar meta.total_elements zegt ${staat.totaal}. Er is niets geschreven.`);
    }
    const nieuw = normaliseerMatrix(staat.groepen);
    rapport.matrix.onderdelen = nieuw.onderdelen.size;
    stopBijProblemen(nieuw.problemen, 'De matrix is niet betrouwbaar');

    // D6, massaverlies in de matrix.
    const oud = bestaand.matrix;
    if (oud) {
      const oudG = oud.groepen.filter((g) => g.nietMeerInBron === undefined).length;
      const oudO = oud.onderdelen.filter((o) => o.nietMeerInBron === undefined).length;
      const verlies = [];
      if (oudG > 0 && nieuw.groepen.size < oudG * (1 - MAX_DALING)) verlies.push(`D6: het aantal groepen daalt van ${oudG} naar ${nieuw.groepen.size} (meer dan ${MAX_DALING * 100} %).`);
      if (oudO > 0 && nieuw.onderdelen.size < oudO * (1 - MAX_DALING)) verlies.push(`D6: het aantal onderdelen daalt van ${oudO} naar ${nieuw.onderdelen.size} (meer dan ${MAX_DALING * 100} %).`);
      stopBijProblemen(verlies, 'Massaverlies in de matrix');
    }
    const samen = voegMatrixSamen(nieuw, oud, cfg.vandaag);
    stopBijProblemen(samen.problemen, 'De matrix is niet betrouwbaar');
    Object.assign(rapport.matrix, samen.verslag);
    for (const nr of samen.verslag.nietMeerInBron) rapport.waarschuwingen.push(`Groep ${nr} staat niet meer in de bron; ze blijft staan met nietMeerInBron.`);

    const gebouwd = bouwMatrixTekst(samen.groepen, samen.onderdelen, cfg.nu);
    let tekst = gebouwd.tekst;
    let veranderd = true;
    if (bestaand.matrixTekst !== undefined) {
      const metOudeTijd = bouwMatrixTekst(samen.groepen, samen.onderdelen, bestaand.matrix.opgehaald);
      if (metOudeTijd.tekst === bestaand.matrixTekst) {
        tekst = metOudeTijd.tekst;
        veranderd = false;
      }
    }
    const fouten = S.valideerMatrixBestand(JSON.parse(tekst));
    stopBijProblemen(fouten.map((f) => `Interne controle van de matrix: ${f}`), 'Het gebouwde matrixbestand klopt niet');
    matrix = { groepen: samen.groepen, onderdelen: samen.onderdelen, sha256: gebouwd.sha256, veranderd };
    if (veranderd) teSchrijven.push({ pad: path.join(cfg.uit, MATRIX_BESTAND), tekst });
    rapport.matrix.bestand = bestaand.matrixTekst === undefined ? 'nieuw' : veranderd ? 'gewijzigd' : 'ongewijzigd';
    nieuweGroepen = new Set(nieuw.groepen.keys());
  }
  const soorten = soortenVan(matrix);
  const groepInfo = new Map(matrix.groepen.map((g) => [g.nummer, g]));
  for (const [nr, soort] of soorten) if (nieuweGroepen.has(nr)) rapport.matrix.perSoort[soort]++;
  rapport.matrix.groepen = matrix.groepen.length;
  rapport.matrix.onderdelen = matrix.onderdelen.length;
  Object.assign(rapport.matrix, zachteMatrixControles(matrix));

  // 3-4. Koppeling per groep.
  const oudeRegels = new Map((bestaand.index?.groepen ?? []).map((r) => [r.groep, r]));
  const resultaten = new Map(); // groep -> { methode, sets } | { geen: true }
  const volledig = cfg.stand !== 'matrix' && !cfg.groepen;
  let md;
  if (cfg.stand !== 'matrix') {
    const koppelBegin = Date.now();
    md = leesMinimumdoelen(cfg.minimumdoelen);
    let teKoppelen;
    if (cfg.groepen) {
      const fout = cfg.groepen.filter((g) => !nieuweGroepen.has(g));
      if (fout.length > 0) throw new Fout(`--groepen is ongeldig: ${fout.join(', ')} staat niet (meer) in de matrix.`);
      teKoppelen = cfg.groepen;
    } else {
      teKoppelen = [...nieuweGroepen].sort(S.vergelijkGroepnummer);
    }
    const bron = cfg.koppelingViaApi ? undefined : leesKoppelingBron(cfg.bronKoppeling);
    if (bron && typeof bron.nagebootst === 'string') rapport.waarschuwingen.push(`De bron van de koppeling zegt: ${kort(bron.nagebootst, 300)}`);
    const T = cfg.koppelingViaApi ? await haalTotaalApi() : paginaTotaal({ totalItems: bron.totaal });
    rapport.koppeling.totaalZonderFilter = T ?? null;
    if (T === undefined) throw new Fout('L1: het totaal zonder filter (totalItems) ontbreekt. Zonder dat valt niet na te gaan of de filter werkt (D2).', 3);
    log(`Koppeling: ${teKoppelen.length} groepen; totaal zonder filter: ${T} doelen.`);

    /** Verwerkt het (laatste) antwoord voor één groep: 200 → api, 404 → graad-en-stroom of "geen". */
    const verwerkAntwoord = (groep, gekregen) => {
      const g = groepInfo.get(groep);
      const soort = soorten.get(groep);
      let antwoord = gekregen;
      if (antwoord.status === 200 && antwoord.totaal === 0) {
        // Een leeg antwoord betekent hetzelfde als een 404: de bron koppelt geen doelen aan deze groep.
        rapport.waarschuwingen.push(`${groep}: HTTP 200 met 0 doelen; behandeld als "geen doelen".`);
        antwoord = { status: 404, voorbeeld: '(HTTP 200 met totalItems 0)' };
      }
      if (antwoord.status === 404) {
        rapport.koppeling.voorbeeld404 ??= kort(antwoord.voorbeeld, 300);
        if (g.graad === '1' && soort === 'gewoon') {
          const stroom = S.stroomVanEersteGraad(g.titel);
          if (stroom === undefined) stopBijProblemen([`${groep}: de stroom van de 1ste graad valt niet af te leiden uit de titel "${kort(g.titel, 80)}".`], 'De 1ste graad kan niet gekoppeld worden');
          const r = graadEnStroom(groep, stroom, md);
          stopBijProblemen(r.problemen, 'De 1ste graad kan niet gekoppeld worden', 'De minimumdoelen in de repository zijn niet volledig.');
          resultaten.set(groep, { methode: 'graad-en-stroom', sets: r.sets, filter: FILTER_EERSTE_GRAAD(stroom), stroom });
          log(`${groep}: geen koppeling in de bron (404); 1ste graad, ${stroom}-stroom: ${r.sets.length} sets volgens de regel.`);
        } else {
          resultaten.set(groep, { geen: true });
          rapport.koppeling.geenPerSoort[soort]++;
          log(`${groep}: geen doelen in de bron (twee keer 404).`);
        }
        return;
      }
      const v = verwerkGroep(groep, g.graad, antwoord.records, md);
      rapport.koppeling.samengevoegdeDubbels += v.samengevoegd;
      rapport.koppeling.zelfdeNummerAndereRecord += v.zelfdeNummer;
      if (v.samengevoegd > 0) rapport.waarschuwingen.push(`${groep}: ${v.samengevoegd} letterlijk gelijke doelen samengevoegd.`);
      if (v.zelfdeNummer > 0) rapport.waarschuwingen.push(`${groep}: ${v.zelfdeNummer} doelen met hetzelfde vaste nummer in dezelfde set maar met andere gegevens; het nummer telt één keer.`);
      stopBijProblemen(v.problemen, `De koppeling van ${groep} is niet betrouwbaar`, v.achter ? ACHTER_MELDING : '');
      const aantal = v.sets.reduce((som, s) => som + s.ids.length, 0);
      if (aantal + v.samengevoegd + v.zelfdeNummer !== antwoord.totaal) {
        throw new Fout(`Koppeling onvolledig: ${groep}: ${aantal} doelen, ${v.samengevoegd} samengevoegd en ${v.zelfdeNummer} met een dubbel nummer, maar totalItems zegt ${antwoord.totaal}.`);
      }
      resultaten.set(groep, { methode: 'api', sets: v.sets, filter: `${S.KOPPEL_PARAMETER}=${groep}` });
      if (g.graad === '1') {
        rapport.koppeling.eersteGraadNuGekoppeld.push(groep);
        rapport.waarschuwingen.push(`${groep} (1ste graad) heeft nu wél een koppeling in de bron: methode api in plaats van de regel per stroom. Kijk dat na.`);
      }
      if (antwoord.pogingen404 > 0) rapport.waarschuwingen.push(`${groep}: eerst 404, bij de nieuwe poging wel doelen.`);
      log(`${groep}: ${aantal} doelen in ${v.sets.length} sets.`);
    };

    // Eerste ronde: elke groep één keer. Een 404 op pagina 1 (via de API) wacht op de tweede ronde; in een
    // bronbestand is {"status": 404} meteen het eindantwoord.
    const tweedeRonde = [];
    for (const groep of teKoppelen) {
      if (cfg.koppelingViaApi && teller.koppeling > 0) await wacht(PAUZE_MS);
      const antwoord = cfg.koppelingViaApi ? await haalGroepApi(groep, T, 1) : await haalGroepBron(bron, groep, T);
      if (cfg.koppelingViaApi && antwoord.status === 404) {
        tweedeRonde.push(groep);
        log(`${groep}: 404 op pagina 1; nog één poging in de tweede ronde.`);
        continue;
      }
      verwerkAntwoord(groep, antwoord);
    }
    // Tweede ronde: de groepen met een 404 nog één keer, met de gewone pauze tussen de verzoeken. Pas een
    // tweede 404 betekent "geen doelen".
    if (tweedeRonde.length > 0) {
      const voor = teller.koppeling;
      log(`Tweede ronde: ${tweedeRonde.length} ${tweedeRonde.length === 1 ? 'groep' : 'groepen'} met een 404 op pagina 1 nog één keer opvragen.`);
      try {
        for (const groep of tweedeRonde) {
          await wacht(PAUZE_MS);
          verwerkAntwoord(groep, await haalGroepApi(groep, T, 2));
        }
      } finally {
        // Ook bij een stop in de tweede ronde staat de telling in het rapport.
        rapport.koppeling.tweedeRonde = { groepen: tweedeRonde.length, verzoeken: teller.koppeling - voor };
      }
    }
    rapport.koppeling.eersteGraadNuGekoppeld.sort(S.vergelijkGroepnummer);

    // D6: gekoppelde groepen die naar "geen" vallen; bij een volledige run de helft van de gewone groepen.
    const voorheenGekoppeld = [...oudeRegels.values()].filter((r) => r.status === 'gekoppeld');
    const naarGeen = voorheenGekoppeld.filter((r) => resultaten.get(r.groep)?.geen).map((r) => r.groep);
    rapport.koppeling.nuZonderDoelen = naarGeen;
    const verlies = [];
    if (naarGeen.length > Math.max(MAX_NAAR_GEEN_VAST, voorheenGekoppeld.length * MAX_DALING)) {
      verlies.push(`D6: ${naarGeen.length} van de ${voorheenGekoppeld.length} gekoppelde groepen hebben nu geen doelen meer (${naarGeen.slice(0, 10).join(', ')}${naarGeen.length > 10 ? ', …' : ''}).`);
    }
    if (volledig) {
      const gewoon = [...nieuweGroepen].filter((nr) => soorten.get(nr) === 'gewoon' && (groepInfo.get(nr).graad === '2' || groepInfo.get(nr).graad === '3'));
      const gekoppeld = gewoon.filter((nr) => resultaten.get(nr)?.methode === 'api');
      if (gewoon.length > 0 && gekoppeld.length < gewoon.length * MIN_GEKOPPELD_DEEL) {
        verlies.push(`D6: maar ${gekoppeld.length} van de ${gewoon.length} gewone groepen van de 2de en 3de graad zijn gekoppeld (minder dan ${MIN_GEKOPPELD_DEEL * 100} %).`);
      }
    }
    stopBijProblemen(verlies, 'Massaverlies in de koppeling');

    // D8: elke getagde groep uit het ordeningskader die meetelt (zie redenNietMeetellen) moet gekoppeld
    // zijn. Wat niet meetelt, verdwijnt niet stil: het staat met de reden in de waarschuwingen.
    const getagd = ordeningskaderGroepen(md);
    rapport.koppeling.ordeningskader.getagd = getagd.length;
    if (volledig) {
      const onderdelenPerGroep = new Map();
      for (const o of matrix.onderdelen) {
        let lijst = onderdelenPerGroep.get(o.groep);
        if (!lijst) onderdelenPerGroep.set(o.groep, (lijst = []));
        lijst.push(o);
      }
      const context = { groepInfo, nieuweGroepen, soorten, onderdelenPerGroep, vandaag: cfg.vandaag };
      const tellen = [];
      const nietMeegeteld = [];
      for (const nr of getagd) {
        const r = redenNietMeetellen(nr, context);
        if (r === undefined) tellen.push(nr);
        else nietMeegeteld.push({ groep: nr, reden: r.reden, ...(r.nietInMatrix ? { nietInMatrix: true } : {}) });
      }
      const zonder = tellen.filter((nr) => resultaten.get(nr)?.methode !== 'api');
      Object.assign(rapport.koppeling.ordeningskader, { groepen: tellen.length, zonderKoppeling: zonder, nietMeegeteld });
      for (const { groep, reden } of nietMeegeteld) {
        rapport.waarschuwingen.push(`D8: ${groep} staat in het ordeningskader van een geldige set, maar telt niet mee: ${reden}.`);
      }
      stopBijProblemen(zonder.map((nr) => `D8: ${nr} staat in het ordeningskader van een geldige set, maar heeft geen koppeling.`), `Ordeningskader zonder koppeling: ${FILTER_MELDING}`);
      // In een volledige matrix hoort elke getagde groep te staan: anders is de matrix onvolledig, of
      // noemen de minimumdoelen een groep die de API Structuuronderdelen niet (meer) kent.
      if (matrix.groepen.length >= D8_MIN_GROEPEN) {
        const nietInMatrix = nietMeegeteld.filter((x) => x.nietInMatrix).map((x) => x.groep);
        stopBijProblemen(
          nietInMatrix.map((nr) => `D8: ${nr} staat in het ordeningskader van een geldige set, maar niet in de matrix (${matrix.groepen.length} groepen).`),
          'Ordeningskader niet in de matrix',
          'De matrix is onvolledig, of de minimumdoelen in de repository noemen een groep die de API Structuuronderdelen niet kent.',
        );
      }
    }

    // Zachte controles: kruiscontrole op nummers, onderwijssoort tegenover de naam.
    const koppeling = new Map([...resultaten].filter(([, r]) => r.methode === 'api').map(([nr, r]) => [nr, r.sets]));
    const setDoelen = new Map();
    for (const [id, s] of md.sets) if (s.doelen.some((d) => isObject(d) && S.groepnummersVanDoel(d).length > 0)) setDoelen.set(id, s.doelen);
    const kruis = S.kruiscontrole(koppeling, setDoelen);
    const geldigSo = (set) => {
      const ingang = md.sets.get(set)?.ingang;
      return ingang?.geldigheid === 'Geldig' && soortVanSetNaam(ingang.naam) === 'so';
    };
    rapport.koppeling.kruiscontrole = {
      setsBekeken: setDoelen.size,
      verschillen: kruis.length,
      verschillenGeldigSo: kruis.filter((k) => geldigSo(k.set)).length,
      voorbeelden: kruis.slice(0, MAX_VOORBEELDEN),
    };
    for (const [nr, r] of koppeling) {
      for (const s of r) {
        const naam = md.sets.get(s.set)?.ingang.naam ?? '';
        const busoVolgensVeld = s.onderwijssoort === 'Buitengewoon';
        if (busoVolgensVeld !== (soortVanSetNaam(naam) === 'buso')) {
          rapport.koppeling.onderwijssoortVerschillen.push({ groep: nr, set: s.set, onderwijssoort: s.onderwijssoort ?? null, soortVolgensNaam: soortVanSetNaam(naam) });
        }
      }
    }
    rapport.koppeling.onderwijssoortVerschillen = rapport.koppeling.onderwijssoortVerschillen.slice(0, MAX_VOORBEELDEN);
    rapport.koppeling.duurSeconden = Math.round((Date.now() - koppelBegin) / 100) / 10;
  }

  // 5. Bestanden van de koppeling en de index bouwen. Ongewijzigd = opnieuw gebouwd met het oude
  //    "opgehaald" en byte voor byte gelijk: dan wordt het bestand niet aangeraakt.
  const koppelMap = path.join(cfg.uit, KOPPEL_MAP);
  const regels = [];
  for (const g of matrix.groepen) {
    const nr = g.nummer;
    const r = resultaten.get(nr);
    const oudeRegel = oudeRegels.get(nr);
    const oudBestand = bestaand.bestanden.get(nr);
    if (r === undefined) {
      regels.push(oudeRegel ?? { groep: nr, status: 'nog-niet-opgehaald' });
      continue;
    }
    if (r.geen) {
      const regel = { groep: nr, status: 'geen' };
      if (oudBestand) {
        const oud = oudBestand.json;
        const nmib = oud.nietMeerInBron ?? cfg.vandaag;
        const { tekst } = bouwRichtingTekst({ groep: oud.groep, titel: oud.titel, graad: oud.graad, methode: oud.methode, filter: oud.filter, opgehaald: oud.opgehaald, sets: oud.sets, nietMeerInBron: nmib });
        if (tekst !== oudBestand.tekst) teSchrijven.push({ pad: path.join(koppelMap, `${nr}.json`), tekst, groep: nr, soort: 'gewijzigd' });
        Object.assign(regel, { nietMeerInBron: nmib, bestand: `${nr}.json` });
      }
      const zelfde = oudeRegel?.status === 'geen' && oudeRegel.nietMeerInBron === regel.nietMeerInBron && oudeRegel.bestand === regel.bestand;
      regel.opgehaald = zelfde && oudeRegel.opgehaald ? oudeRegel.opgehaald : cfg.nu;
      regels.push(regel);
      continue;
    }
    const basis = { groep: nr, titel: g.titel, graad: g.graad, methode: r.methode, filter: r.filter, sets: r.sets };
    let gebouwd = bouwRichtingTekst({ ...basis, opgehaald: cfg.nu });
    let veranderd = true;
    if (oudBestand) {
      const metOudeTijd = bouwRichtingTekst({ ...basis, opgehaald: oudBestand.json.opgehaald });
      if (metOudeTijd.tekst === oudBestand.tekst) {
        gebouwd = metOudeTijd;
        veranderd = false;
      }
    }
    const fouten = S.valideerRichtingDoelenBestand(JSON.parse(gebouwd.tekst), nr);
    stopBijProblemen(fouten.map((f) => `Interne controle van ${nr}.json: ${f}`), 'Een gebouwd koppelingsbestand klopt niet');
    if (veranderd) teSchrijven.push({ pad: path.join(koppelMap, `${nr}.json`), tekst: gebouwd.tekst, groep: nr, soort: oudBestand ? 'gewijzigd' : 'nieuw' });
    else rapport.koppeling.ongewijzigd.push(nr);
    const k = gebouwd.kop;
    regels.push({ groep: nr, status: 'gekoppeld', methode: r.methode, aantal: k.aantal, sets: r.sets.length, sha256: k.sha256, opgehaald: k.opgehaald, bestand: `${nr}.json` });
  }
  for (const t of teSchrijven) if (t.groep) rapport.koppeling[t.soort].push(t.groep);
  const indexTekst = bouwIndexTekst(regels, matrix.sha256);
  const indexFouten = S.valideerRichtingDoelenIndex(JSON.parse(indexTekst));
  stopBijProblemen(indexFouten.map((f) => `Interne controle van de index: ${f}`), 'De gebouwde index klopt niet');
  const indexVerandert = indexTekst !== bestaand.indexTekst;
  if (indexVerandert) teSchrijven.push({ pad: path.join(koppelMap, INDEX_BESTAND), tekst: indexTekst });
  rapport.koppeling.index = bestaand.indexTekst === undefined ? 'nieuw' : indexVerandert ? 'gewijzigd' : 'ongewijzigd';
  for (const r of regels) {
    if (r.status === 'gekoppeld' && r.methode === 'api') rapport.koppeling.gekoppeld++;
    else if (r.status === 'gekoppeld') {
      rapport.koppeling.graadEnStroom++;
      // De stroom van deze run, of (een regel uit een vorige run) die uit de filter van het bestaande bestand.
      const stroom = resultaten.get(r.groep)?.stroom ?? /; stroom=([AB])-stroom /.exec(bestaand.bestanden.get(r.groep)?.json.filter ?? '')?.[1];
      if (stroom === 'A' || stroom === 'B') rapport.koppeling.eersteGraadPerStroom[stroom]++;
      else rapport.waarschuwingen.push(`${r.groep}: methode graad-en-stroom, maar de stroom is niet bekend; niet meegeteld in eersteGraadPerStroom.`);
    } else if (r.status === 'geen') rapport.koppeling.geen++;
    else rapport.koppeling.nogNietOpgehaald++;
  }

  // 6. De sleutel mag niet in de gegevens zitten. Vervangen zou de gegevens wijzigen: dan liever niets schrijven.
  for (const { tekst } of teSchrijven) {
    if (bevatSleutel(tekst)) throw new Fout('De opgehaalde gegevens bevatten de API-sleutel. Er is niets geschreven.');
  }

  // 7. Schrijven: eerst de koppelingsbestanden, dan de matrix, de index als laatste.
  const volgorde = (t) => (t.groep ? 0 : t.pad.endsWith(MATRIX_BESTAND) ? 1 : 2);
  for (const t of [...teSchrijven].sort((a, b) => volgorde(a) - volgorde(b) || vergelijkTekst(a.pad, b.pad))) {
    fs.mkdirSync(path.dirname(t.pad), { recursive: true });
    fs.writeFileSync(t.pad, t.tekst, 'utf8');
  }
  rapport.geschreven = { bestanden: teSchrijven.length, bytes: teSchrijven.reduce((som, t) => som + Buffer.byteLength(t.tekst, 'utf8'), 0) };
  rapport.omvang = omvangVan(cfg.uit);
  werkTellersBij();
  schrijfRapport(rapportPad, rapport);

  const k = rapport.koppeling;
  log(`Matrix: ${rapport.matrix.groepen} groepen, ${rapport.matrix.onderdelen} onderdelen (${rapport.matrix.bestand}).`);
  if (cfg.stand !== 'matrix') {
    log(`Koppeling: gekoppeld ${k.gekoppeld}, 1ste graad per stroom ${k.graadEnStroom} (A ${k.eersteGraadPerStroom.A}, B ${k.eersteGraadPerStroom.B}), geen ${k.geen}, nog niet opgehaald ${k.nogNietOpgehaald}.`);
    if (k.tweedeRonde.groepen > 0) log(`Tweede ronde: ${k.tweedeRonde.groepen} groepen met een 404 op pagina 1, ${k.tweedeRonde.verzoeken} verzoeken.`);
    log(`Nieuw: ${k.nieuw.join(', ') || 'geen'}. Gewijzigd: ${k.gewijzigd.join(', ') || 'geen'}. Ongewijzigd: ${k.ongewijzigd.length}.`);
    log(`Kruiscontrole met het ordeningskader: ${k.kruiscontrole.verschillen} verschillen (${k.kruiscontrole.verschillenGeldigSo} in geldige sets van het gewoon secundair).`);
  }
  for (const w of rapport.waarschuwingen) log(`Let op: ${w}`);
  const o = rapport.omvang;
  log(`Omvang: matrix ${o.matrixBytes} bytes, ${o.koppelingBestanden} koppelingsbestanden samen ${o.koppelingBytes} bytes.`);
  log(`Verzoeken: ${rapport.verzoeken}, duur: ${rapport.duurSeconden} s. Geschreven: ${teSchrijven.length} ${teSchrijven.length === 1 ? 'bestand' : 'bestanden'}. Rapport: ${rapportPad}`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  const bericht = veilig(e instanceof Fout ? e.message : `Onverwachte fout: ${e?.message ?? e}`);
  meld(`Fout: ${bericht}`);
  if (rapportPad) {
    try {
      werkTellersBij();
      schrijfRapport(rapportPad, { ...(rapport ?? {}), fout: bericht });
    } catch {
      // het rapport is een hulpmiddel: een schrijffout mag de echte foutmelding niet overschaduwen
    }
  }
  process.exitCode = e instanceof Fout ? e.code : 1;
}
