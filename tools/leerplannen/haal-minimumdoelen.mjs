#!/usr/bin/env node
// Haalt de minimumdoelen van de Vlaamse overheid op via de Onderwijsdoelen-API, normaliseert ze en
// schrijft per set een vast JSON-bestand (laag 1, zie docs/LEERPLANNEN.md § 5). Node 22.18 of
// nieuwer, geen npm-afhankelijkheden: de normalisatie komt uit src/lib/minimumdoelen.ts, dat Node
// rechtstreeks inleest (type stripping).
//
//   ONDERWIJSDOELEN_API_KEY=… node tools/leerplannen/haal-minimumdoelen.mjs [opties]
//   node tools/leerplannen/haal-minimumdoelen.mjs --bron antwoord.json [opties]
//
// Opties
//   --bron <bestand>    offline: een array van records, een array van API-pagina's of één API-pagina
//   --uit <map>         doelmap (standaard public/leerplannen/minimumdoelen)
//   --rapport <bestand> rapport (standaard tools/leerplannen/rapport/laatste-ophaling.json)
//   --filter <regex>    welke sets (standaard secundair|\bSO\b|SO_; hoofdletterongevoelig; . = alles)
//                       Een set waarvan al een bestand bestaat, wordt altijd mee bijgewerkt.
//
// Omgeving (alleen zonder --bron)
//   ONDERWIJSDOELEN_API_KEY   verplicht; de sleutel komt nooit in een log, een bestand of het rapport
//   ONDERWIJSDOELEN_API_BASE  andere basis-URL (standaard de officiële API)
//   ONDERWIJSDOELEN_WACHT_FACTOR  vermenigvuldigt alle wachttijden (0 = niet wachten; voor tests)
//
// Uitgangscodes: 0 in orde, 1 fout, 2 geen set herkend door de filter, 3 de gegevens zijn niet
// betrouwbaar genoeg om te schrijven (problemen in een gekozen set, of geen totalItems om de
// volledigheid mee te controleren). Bij 1, 2 en 3 is er niets geschreven behalve het rapport.
//
// Een doel herkennen we aan zijn vaste nummer in de API (`@id`), en alleen zonder dat nummer aan
// zijn code: binnen één set kan dezelfde code bij verschillende doelen horen (de nummering begint
// opnieuw per rubriek of pakket). Zulke codes staan ter info in rapport.dubbeleCodes.
//
// Problemen per soort (rapport.problemen): conflict (zelfde doel, andere tekst), variant (zelfde doel
// en tekst, andere metagegevens), overgeslagen (geen code of omschrijving, of een code die een
// JSON-getal is) en meerwaardig (set, structuur of sleutelcompetentie met meer dan één waarde).
// Een probleem in een gekozen set stopt de ophaling; in andere sets staat het alleen in het rapport.
// Een set waarvan het bestand al bestaat en niets verandert, wordt niet aangeraakt.
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
try {
  M = await import('../../src/lib/minimumdoelen.ts');
} catch {
  console.error('Fout: src/lib/minimumdoelen.ts kon niet geladen worden. Dit script heeft Node 22.18 of nieuwer nodig (type stripping).');
  process.exit(1);
}

const STANDAARD_FILTER = 'secundair|\\bSO\\b|SO_';
const RIJEN_PER_PAGINA = 500;
const MAX_PAGINAS = 200;
const PAUZE_MS = 200;
const HERHAAL_WACHT_MS = [2000, 4000, 8000, 16000];
const VERZOEK_TIMEOUT_MS = 60000;
const INSPRINGING = '  ';
const MAX_VOORBEELDEN = 50;
const MAX_CONFLICTEN_IN_RAPPORT = 1000;
const MAX_PROBLEMEN_IN_LOG = 60;
const PROBLEMEN_PER_SET_IN_LOG = 3;
const SOORTEN = ['conflict', 'variant', 'overgeslagen', 'meerwaardig'];

const wachtFactor = (() => {
  const n = Number(process.env.ONDERWIJSDOELEN_WACHT_FACTOR);
  return process.env.ONDERWIJSDOELEN_WACHT_FACTOR && Number.isFinite(n) && n >= 0 ? n : 1;
})();
const wacht = (ms) => new Promise((resolve) => setTimeout(resolve, ms * wachtFactor));

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const vergelijkTekst = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const vergelijk = (a, b) => M.vergelijkCodes(a, b) || vergelijkTekst(a, b);

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

// ── Opties ──────────────────────────────────────────────────────────────────

function leesOpties(argv) {
  const opties = {};
  const namen = { '--bron': 'bron', '--uit': 'uit', '--rapport': 'rapport', '--filter': 'filter' };
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
    const naam = namen[arg];
    if (!naam) throw new Fout(`Onbekende optie: ${arg}. Gebruik --help voor de opties.`);
    if (waarde === undefined) {
      waarde = argv[++i];
      if (waarde === undefined) throw new Fout(`Bij ${arg} hoort een waarde.`);
    }
    opties[naam] = waarde;
  }
  return opties;
}

const HULP = `Gebruik: node tools/leerplannen/haal-minimumdoelen.mjs [--bron <bestand.json>] [--uit <map>] [--rapport <bestand>] [--filter <regex>]

Zonder --bron is de omgevingsvariabele ONDERWIJSDOELEN_API_KEY verplicht.
Standaardfilter: ${STANDAARD_FILTER} (hoofdletterongevoelig; "." kiest alle sets).
Uitgangscodes: 0 in orde, 1 fout, 2 geen set herkend, 3 gegevens niet betrouwbaar genoeg om te schrijven.`;

// ── Bron: bestand of API ────────────────────────────────────────────────────

function vormFout(json) {
  const sleutels = Array.isArray(json) ? ['(een lijst)'] : isObject(json) ? Object.keys(json).sort() : [`(${typeof json})`];
  // Enkel namen van sleutels, nooit inhoud: een foutantwoord kan van alles bevatten.
  return new Fout(`Het antwoord heeft een onverwachte vorm. Bovenste sleutels: ${sleutels.slice(0, 20).join(', ') || '(geen)'}.`);
}

const isPagina = (x) => isObject(x) && ('gegevens' in x || 'member' in x);

function paginaLeden(pagina) {
  if (!isObject(pagina)) throw vormFout(pagina);
  const gegevens = pagina.gegevens;
  if (isObject(gegevens) && Array.isArray(gegevens.member)) return gegevens.member;
  if (Array.isArray(gegevens)) return gegevens;
  if (Array.isArray(pagina.member)) return pagina.member;
  throw vormFout(pagina);
}

function paginaTotaal(pagina) {
  const bron = isObject(pagina.gegevens) ? pagina.gegevens : pagina;
  const n = typeof bron.totalItems === 'string' && bron.totalItems.trim() !== '' ? Number(bron.totalItems) : bron.totalItems;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Enkel de namen van de sleutels van een pagina en van haar `gegevens`, voor het rapport. */
function sleutelsVan(pagina) {
  const namen = (o) => Object.keys(o).sort().slice(0, 50);
  return {
    pagina: isObject(pagina) ? namen(pagina) : [],
    gegevens: isObject(pagina) && isObject(pagina.gegevens) ? namen(pagina.gegevens) : null,
  };
}

function leesBronBestand(pad) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(pad, 'utf8'));
  } catch (e) {
    throw new Fout(`Het bronbestand ${pad} kon niet gelezen worden als JSON (${e.code ?? e.name}).`);
  }
  let paginas;
  if (Array.isArray(json)) {
    if (json.length > 0 && json.every(isPagina)) paginas = json;
    else if (json.some(isPagina)) throw new Fout('Het bronbestand mengt API-pagina\'s en losse records.');
    else return { records: json, paginas: 1, totalItems: undefined, heeftPaginas: false, paginaSleutels: null };
  } else if (isPagina(json)) {
    paginas = [json];
  } else {
    throw vormFout(json);
  }
  const records = [];
  let totalItems;
  for (const pagina of paginas) {
    records.push(...paginaLeden(pagina));
    totalItems ??= paginaTotaal(pagina);
  }
  return { records, paginas: paginas.length, totalItems, heeftPaginas: true, paginaSleutels: sleutelsVan(paginas[0]) };
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

async function haalPagina(basis, nummer, sleutel) {
  const url = `${basis}/onderwijsdoel?paginanr=${nummer}&rijen_per_pagina=${RIJEN_PER_PAGINA}`;
  let laatste = 'onbekende fout';
  for (let poging = 0; poging <= HERHAAL_WACHT_MS.length; poging++) {
    if (poging > 0) {
      log(`Pagina ${nummer}: opnieuw proberen (${poging}/${HERHAAL_WACHT_MS.length}) na ${laatste}.`);
      await wacht(HERHAAL_WACHT_MS[poging - 1]);
    }
    let tekst;
    try {
      // redirect: 'manual': een doorverwijzing naar een andere host zou de sleutel meesturen.
      const antwoord = await fetch(url, {
        headers: { 'x-api-key': sleutel, accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(VERZOEK_TIMEOUT_MS),
      });
      if (antwoord.status >= 300 && antwoord.status < 400) {
        const naar = herkomstVan(antwoord.headers.get('location'), url);
        await sluit(antwoord);
        throw new Fout(`De API stuurt door (HTTP ${antwoord.status} naar ${naar}). Het script volgt geen doorverwijzingen, want de sleutel zou meegaan.`);
      }
      if (antwoord.status === 401 || antwoord.status === 403) {
        await sluit(antwoord);
        throw new Fout(`De API weigert de sleutel (HTTP ${antwoord.status}).`);
      }
      if (antwoord.status === 429 || antwoord.status >= 500) {
        laatste = `HTTP ${antwoord.status}`;
        await sluit(antwoord);
        continue;
      }
      if (!antwoord.ok) {
        await sluit(antwoord);
        throw new Fout(`De API antwoordde met HTTP ${antwoord.status} op pagina ${nummer}.`);
      }
      tekst = await antwoord.text();
    } catch (e) {
      if (e instanceof Fout) throw e;
      // Netwerkfout of time-out: enkel de soort melden, nooit de hele fout (kan kopteksten bevatten).
      laatste = `netwerkfout (${e?.cause?.code ?? e?.name ?? 'onbekend'})`;
      continue;
    }
    try {
      return JSON.parse(tekst);
    } catch {
      throw new Fout(`Pagina ${nummer}: het antwoord is geen geldige JSON.`);
    }
  }
  throw new Fout(`Pagina ${nummer} lukte niet na ${HERHAAL_WACHT_MS.length} nieuwe pogingen (${laatste}).`);
}

/** `voortgang` wordt onderweg bijgewerkt, zodat het rapport ook bij een fout halverwege vol zit. */
async function haalApi(voortgang) {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  if (!sleutel) {
    throw new Fout('De omgevingsvariabele ONDERWIJSDOELEN_API_KEY ontbreekt. Zet de sleutel in de omgeving (lokaal) of als GitHub-geheim (Actions), of gebruik --bron met een opgeslagen antwoord.');
  }
  const basis = (process.env.ONDERWIJSDOELEN_API_BASE || M.API_BASIS).replace(/\/+$/, '');
  let vorigeEerste;
  let klaar = false;
  for (let nummer = 1; nummer <= MAX_PAGINAS && !klaar; nummer++) {
    if (nummer > 1) await wacht(PAUZE_MS);
    const pagina = await haalPagina(basis, nummer, sleutel);
    voortgang.paginas++;
    voortgang.paginaSleutels ??= sleutelsVan(pagina);
    const leden = paginaLeden(pagina);
    voortgang.totalItems = paginaTotaal(pagina) ?? voortgang.totalItems;
    log(`Pagina ${nummer}: ${leden.length} records${voortgang.totalItems !== undefined ? ` (totaal volgens API: ${voortgang.totalItems})` : ''}.`);
    if (leden.length === 0) {
      klaar = true;
      break;
    }
    const eerste = M.canoniek(leden[0]);
    if (eerste === vorigeEerste) {
      throw new Fout(`De API geeft op pagina ${nummer} dezelfde records als op de vorige pagina. Het pagineren werkt niet zoals verwacht.`);
    }
    vorigeEerste = eerste;
    for (const lid of leden) voortgang.records.push(lid);
    if (voortgang.totalItems !== undefined && voortgang.records.length >= voortgang.totalItems) klaar = true;
  }
  if (!klaar) {
    throw new Fout(`Het maximum van ${MAX_PAGINAS} pagina's is bereikt zonder het einde te vinden. De ophaling is onvolledig.`);
  }
  return { ...voortgang, heeftPaginas: true };
}

// ── Groeperen en problemen verzamelen ───────────────────────────────────────

const SET_INFO_VELDEN = ['apiId', 'korteNaam', 'versie'];

/** Platte velden van een doel: de bovenste velden en `extra.<veld>`. */
function vlakVan(doel) {
  const vlak = new Map();
  for (const [veld, waarde] of Object.entries(doel)) {
    if (veld === 'extra' && isObject(waarde)) {
      for (const [x, w] of Object.entries(waarde)) vlak.set(`extra.${x}`, M.canoniek(w));
    } else {
      vlak.set(veld, M.canoniek(waarde));
    }
  }
  return vlak;
}

/** De velden waarin de varianten van één code van elkaar verschillen, alfabetisch. */
function verschilVan(varianten) {
  const vlakken = varianten.map(vlakVan);
  const velden = new Set(vlakken.flatMap((v) => [...v.keys()]));
  return [...velden].filter((veld) => new Set(vlakken.map((v) => v.get(veld) ?? '(geen)')).size > 1).sort(vergelijkTekst);
}

/** Eén logregel per conflict of variant: welke ids, welke velden verschillen en hoe (ingekort). */
function beschrijfProbleem(soort, p, set) {
  const kort = (t, n = 70) => {
    const vlak = String(t).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return vlak.length > n ? `${vlak.slice(0, n - 1)}…` : vlak;
  };
  const ids = p.varianten.map((d) => d.id ?? '?').join(', ');
  const waarden = p.verschil.slice(0, 4).map((veld) => {
    const per = p.varianten.map((d) => {
      const w = veld.startsWith('extra.') ? d.extra?.[veld.slice(6)] : d[veld];
      return w === undefined ? '(geen)' : kort(typeof w === 'string' ? w : JSON.stringify(w), veld === 'tekst' ? 70 : 50);
    });
    return `${veld}: ${per.map((w) => `"${w}"`).join(' | ')}`;
  });
  const naam = set ? ` (${kort(set.setInfo.korteNaam ?? set.naam, 50)})` : '';
  return `${p.set}${naam} code ${p.code}, ${soort}, ids ${ids}; verschilt in ${p.verschil.join(', ') || '(niets)'}. ${waarden.join('; ')}`;
}

function tel(map, waarde) {
  map.set(waarde, (map.get(waarde) ?? 0) + 1);
}

/** Waarden van een telling, de meest voorkomende eerst (bij gelijkstand alfabetisch). */
function opFrequentie(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || vergelijk(a[0], b[0])).map(([waarde]) => waarde);
}

function nieuweSet(sleutel) {
  return {
    sleutel,
    namen: new Map(),
    info: { apiId: new Map(), korteNaam: new Map(), versie: new Map() },
    doelen: new Map(), // doelsleutel (id, anders code) -> Map(canoniek doel -> doel)
    problemen: { conflict: [], variant: [], overgeslagen: [], meerwaardig: [] },
  };
}

/**
 * Deelt de records in per set. Elk record dat niet zonder verlies in het resultaat past, wordt als
 * probleem aan zijn set toegekend; volledig identieke genormaliseerde records worden samengevoegd.
 */
function groepeer(records, rapport) {
  const sets = new Map();
  for (const record of records) {
    const v = M.setVan(record);
    let set = sets.get(v.setSleutel);
    if (!set) {
      set = nieuweSet(v.setSleutel);
      sets.set(v.setSleutel, set);
    }
    tel(set.namen, v.setNaam);
    for (const veld of SET_INFO_VELDEN) if (v.setInfo[veld] !== undefined) tel(set.info[veld], v.setInfo[veld]);

    const n = M.normaliseerRecord(record);
    const velden = M.meerwaardigeVelden(record);
    if (velden.length > 0) {
      set.problemen.meerwaardig.push({ set: set.sleutel, ...(n ? { code: n.doel.code } : {}), velden });
    }
    if (!n) {
      rapport.overgeslagen++;
      set.problemen.overgeslagen.push({
        set: set.sleutel,
        reden: M.redenOnbruikbaar(record) ?? 'onbekend',
        velden: isObject(record) ? Object.keys(record).sort().slice(0, 50) : [],
      });
      continue;
    }
    const doelSleutel = M.doelSleutel(n.doel);
    let varianten = set.doelen.get(doelSleutel);
    if (!varianten) {
      varianten = new Map();
      set.doelen.set(doelSleutel, varianten);
    }
    const sleutel = M.canoniek(n.doel);
    if (varianten.has(sleutel)) rapport.dubbel++;
    else varianten.set(sleutel, n.doel);
  }

  for (const set of sets.values()) {
    const namen = opFrequentie(set.namen);
    set.naam = namen[0];
    set.andereNamen = namen.slice(1);
    // apiId, korteNaam en versie: de meest voorkomende waarde; afwijkende waarden worden gemeld.
    set.setInfo = {};
    set.andereInfo = {};
    for (const veld of SET_INFO_VELDEN) {
      const waarden = opFrequentie(set.info[veld]);
      if (waarden.length > 0) set.setInfo[veld] = waarden[0];
      if (waarden.length > 1) set.andereInfo[veld] = waarden.slice(1);
    }
    for (const varianten of set.doelen.values()) {
      if (varianten.size < 2) continue;
      const lijst = [...varianten.entries()].sort((a, b) => vergelijkTekst(a[0], b[0])).map(([, doel]) => doel);
      const soort = new Set(lijst.map((d) => d.tekst)).size > 1 ? 'conflict' : 'variant';
      const { code, id } = lijst[0];
      set.problemen[soort].push({ set: set.sleutel, code, ...(id !== undefined ? { id } : {}), verschil: verschilVan(lijst), varianten: lijst });
    }
    set.aantalProblemen = SOORTEN.reduce((som, soort) => som + set.problemen[soort].length, 0);
  }
  return sets;
}

/** Per soort het totaal en maximaal 50 voorbeelden, in een vaste volgorde (onafhankelijk van de invoer). */
function verzamelProblemen(sets) {
  const problemen = {};
  let conflicten = [];
  for (const soort of SOORTEN) {
    const alle = [...sets.values()].flatMap((s) => s.problemen[soort]);
    const gesorteerd = alle
      .map((p) => ({ p, s: M.canoniek(p) }))
      .sort((a, b) => vergelijk(a.p.set, b.p.set) || vergelijk(a.p.code ?? '', b.p.code ?? '') || vergelijk(a.p.id ?? '', b.p.id ?? '') || vergelijkTekst(a.s, b.s))
      .map((x) => x.p);
    problemen[soort] = { aantal: alle.length, voorbeelden: gesorteerd.slice(0, MAX_VOORBEELDEN) };
    if (soort === 'conflict') conflicten = gesorteerd.map((p) => ({ set: p.set, code: p.code, ...(p.id !== undefined ? { id: p.id } : {}) }));
  }
  return { problemen, conflicten: conflicten.slice(0, MAX_CONFLICTEN_IN_RAPPORT) };
}

function doelenVan(set) {
  return [...set.doelen.values()].map((varianten) => [...varianten.values()][0]);
}

const opCodeEnId = (a, b) => vergelijk(a.code, b.code) || vergelijk(a.id ?? '', b.id ?? '');

/**
 * Codes die binnen een set bij meer dan één doel horen (elk met een eigen id), bv. omdat de nummering
 * per rubriek of pakket opnieuw begint. Geen probleem, wel goed om te weten: een code alleen wijst
 * dan niet één doel aan.
 */
function dubbeleCodesVan(sets) {
  const lijst = [];
  for (const set of [...sets].sort((a, b) => vergelijk(a.sleutel, b.sleutel))) {
    const perCode = new Map();
    for (const doel of doelenVan(set)) {
      if (!perCode.has(doel.code)) perCode.set(doel.code, []);
      perCode.get(doel.code).push(doel);
    }
    for (const [code, doelen] of [...perCode.entries()].sort((a, b) => vergelijk(a[0], b[0]))) {
      if (doelen.length > 1) lijst.push({ set: set.sleutel, code, ids: doelen.sort(opCodeEnId).map((d) => d.id ?? '?') });
    }
  }
  return { aantal: lijst.length, sets: new Set(lijst.map((d) => d.set)).size, voorbeelden: lijst.slice(0, MAX_VOORBEELDEN) };
}

function structuurWaarden(set) {
  const waarden = new Set();
  for (const doel of doelenVan(set)) {
    for (const veld of ['graad', 'stroom', 'leerjaar']) if (doel[veld] !== undefined) waarden.add(doel[veld]);
  }
  return [...waarden];
}

// ── Bestanden bouwen en schrijven ───────────────────────────────────────────

function maakDoel(doel, setNiveau) {
  const uit = {};
  if (doel.id !== undefined) uit.id = doel.id;
  Object.assign(uit, { code: doel.code, tekst: doel.tekst });
  if (doel.type !== undefined) uit.type = doel.type;
  if (doel.sleutelcompetentie !== undefined) uit.sleutelcompetentie = doel.sleutelcompetentie;
  for (const veld of ['graad', 'stroom', 'leerjaar']) {
    if (doel[veld] !== undefined && doel[veld] !== setNiveau[veld]) uit[veld] = doel[veld];
  }
  if (doel.extra !== undefined) uit.extra = doel.extra;
  return uit;
}

function bouwSetBestand(set, opgehaald) {
  const ruw = doelenVan(set).sort(opCodeEnId);
  const setNiveau = {};
  for (const veld of ['graad', 'stroom', 'leerjaar']) {
    const waarden = new Set(ruw.map((d) => d[veld]));
    const enige = [...waarden][0];
    if (waarden.size === 1 && enige !== undefined) setNiveau[veld] = enige;
  }
  const doelen = ruw.map((d) => maakDoel(d, setNiveau));

  const competenties = new Map();
  for (const d of ruw) if (d.sleutelcompetentie) competenties.set(M.canoniek(d.sleutelcompetentie), d.sleutelcompetentie);
  const sleutelcompetenties = [...competenties.values()].sort(
    (a, b) => vergelijk(a.nr ?? '', b.nr ?? '') || vergelijk(a.naam ?? '', b.naam ?? ''),
  );

  const sha256 = crypto.createHash('sha256').update(M.canoniek(doelen), 'utf8').digest('hex');
  const kop = {
    app: 'boosterz',
    kind: 'minimumdoelen',
    v: 1,
    set: {
      id: set.sleutel,
      naam: set.naam,
      ...set.setInfo,
      ...M.geldigheidVanDoelen(ruw),
      ...setNiveau,
      sleutelcompetenties,
      bron: M.BRON_BASIS,
      api: M.API_BASIS,
      naamsvermelding: M.NAAMSVERMELDING,
      licentie: M.LICENTIE,
      opgehaald,
      aantal: doelen.length,
      sha256,
    },
  };
  // Kop met 2 spaties inspringing, daarna één compact doel per regel: een verschil in git blijft leesbaar.
  const kopTekst = JSON.stringify(kop, null, 2).replace(/\n}$/, '');
  const regels = doelen.map((d) => JSON.stringify(d));
  const doelenTekst = regels.length === 0
    ? `${INSPRINGING}"doelen": []`
    : `${INSPRINGING}"doelen": [\n${regels.join(',\n')}\n${INSPRINGING}]`;
  return { tekst: `${kopTekst},\n${doelenTekst}\n}\n`, kopSet: kop.set, aantal: doelen.length };
}

/** Koppen van alle setbestanden in de map (andere json-bestanden, zoals index en rapport, tellen niet mee). */
function leesSetKoppen(map) {
  if (!fs.existsSync(map)) return [];
  const koppen = [];
  for (const bestand of fs.readdirSync(map).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(map, bestand), 'utf8'));
      if (isObject(json) && json.kind === 'minimumdoelen' && isObject(json.set) && typeof json.set.id === 'string') {
        koppen.push({ bestand, set: json.set });
      }
    } catch {
      // geen leesbaar setbestand: negeren
    }
  }
  return koppen;
}

function bouwIndex(koppen) {
  const sets = koppen
    .map(({ bestand, set }) => {
      const ingang = { id: set.id, naam: set.naam };
      for (const veld of ['korteNaam', 'versie', 'geldigheid', 'geldigVan', 'geldigTot', 'graad', 'stroom', 'leerjaar']) {
        if (set[veld] !== undefined) ingang[veld] = set[veld];
      }
      Object.assign(ingang, { aantal: set.aantal, sha256: set.sha256, opgehaald: set.opgehaald, bestand });
      return ingang;
    })
    .sort((a, b) => vergelijk(a.id, b.id));
  return {
    app: 'boosterz',
    kind: 'minimumdoelen-index',
    v: 1,
    naamsvermelding: M.NAAMSVERMELDING,
    licentie: M.LICENTIE,
    sets,
  };
}

function leesTekst(pad) {
  try {
    return fs.readFileSync(pad, 'utf8');
  } catch {
    return undefined;
  }
}

function leesOpgehaald(tekst) {
  try {
    const json = JSON.parse(tekst);
    return isObject(json) && isObject(json.set) && typeof json.set.opgehaald === 'string' ? json.set.opgehaald : undefined;
  } catch {
    return undefined;
  }
}

function schrijfRapport(pad, rapport) {
  fs.mkdirSync(path.dirname(pad), { recursive: true });
  fs.writeFileSync(pad, schoon(JSON.stringify(rapport, null, 2)) + '\n', 'utf8');
}

function bevatSleutel(tekst) {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  return Boolean(sleutel) && sleutel.length >= 4 && schoon(tekst) !== tekst;
}

function lijst(sleutels, aantallen) {
  return sleutels.map((s) => (aantallen?.has(s) ? `${s} (${aantallen.get(s)} doelen)` : s)).join(', ');
}

// ── Hoofdprogramma ──────────────────────────────────────────────────────────

let rapport;
let rapportPad;

function vulRapportMet(bron) {
  rapport.paginas = bron.paginas;
  rapport.records = bron.records.length;
  rapport.totalItems = bron.totalItems ?? null;
  rapport.paginaSleutels = bron.paginaSleutels ?? null;
  rapport.veldInventaris = M.veldInventaris(bron.records);
  rapport.typeInventaris = M.typeInventaris(bron.records);
}

async function main() {
  const opties = leesOpties(process.argv.slice(2));
  if (opties.help) {
    console.log(HULP);
    return 0;
  }
  const uit = path.resolve(opties.uit ?? path.join(root, 'public', 'leerplannen', 'minimumdoelen'));
  rapportPad = path.resolve(opties.rapport ?? path.join(root, 'tools', 'leerplannen', 'rapport', 'laatste-ophaling.json'));
  let filter;
  try {
    filter = new RegExp(opties.filter || STANDAARD_FILTER, 'i');
  } catch (e) {
    throw new Fout(`De filter is geen geldige reguliere expressie: ${e.message}`);
  }

  const tijdstip = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const viaApi = !opties.bron;
  rapport = {
    tijdstip,
    bron: viaApi ? 'api' : 'bestand',
    paginas: 0,
    records: 0,
    totalItems: null,
    paginaSleutels: null,
    overgeslagen: 0,
    dubbel: 0,
    problemen: Object.fromEntries(SOORTEN.map((soort) => [soort, { aantal: 0, voorbeelden: [] }])),
    conflicten: [],
    veldInventaris: {},
    typeInventaris: {},
    alleSets: [],
    nieuw: [],
    gewijzigd: [],
    ongewijzigd: [],
    verdwenen: [],
  };

  let bron;
  if (viaApi) {
    const voortgang = { records: [], paginas: 0, totalItems: undefined, paginaSleutels: null };
    try {
      bron = await haalApi(voortgang);
    } catch (e) {
      vulRapportMet(voortgang); // wat al binnen was, helpt bij het zoeken naar de oorzaak
      throw e;
    }
  } else {
    bron = leesBronBestand(path.resolve(opties.bron));
  }
  vulRapportMet(bron);
  if (bron.records.length === 0) throw new Fout('De bron bevat geen enkel record.');

  // Groeperen en kiezen. Een set met al een bestand wordt altijd mee bijgewerkt, ook als de filter hem mist.
  const sets = groepeer(bron.records, rapport);
  const bestaand = leesSetKoppen(uit);
  const bestaandeIds = new Set(bestaand.map((k) => k.set.id));
  const gekozen = new Map();
  const waarschuwingen = [];
  for (const set of [...sets.values()].sort((a, b) => vergelijk(a.sleutel, b.sleutel))) {
    const doorzoekbaar = [set.naam, set.setInfo.korteNaam ?? '', set.sleutel, ...structuurWaarden(set)].join(' | ');
    const isGekozen = filter.test(doorzoekbaar) || bestaandeIds.has(set.sleutel);
    rapport.alleSets.push({
      id: set.sleutel,
      naam: set.naam,
      ...(set.setInfo.korteNaam !== undefined ? { korteNaam: set.setInfo.korteNaam } : {}),
      aantal: set.doelen.size,
      gekozen: isGekozen,
      problemen: set.aantalProblemen,
    });
    if (isGekozen) gekozen.set(set.sleutel, set);
    if (set.andereNamen.length > 0) {
      waarschuwingen.push(`Set ${set.sleutel} komt met meerdere namen voor (${[set.naam, ...set.andereNamen].join(' / ')}); de eerste is gebruikt.`);
    }
    for (const [veld, andere] of Object.entries(set.andereInfo)) {
      waarschuwingen.push(`Set ${set.sleutel} heeft meerdere waarden voor ${veld} (${[set.setInfo[veld], ...andere].join(' / ')}); de eerste is gebruikt.`);
    }
  }
  if (waarschuwingen.length > 0) rapport.waarschuwingen = waarschuwingen;
  const verzameld = verzamelProblemen(sets);
  rapport.problemen = verzameld.problemen;
  rapport.conflicten = verzameld.conflicten;
  rapport.dubbeleCodes = dubbeleCodesVan(gekozen.values());

  // Volledigheid: zonder totalItems valt niet vast te stellen of er pagina's ontbreken.
  const aantalUniek = new Set(bron.records.map((r) => M.canoniek(r))).size;
  if (bron.heeftPaginas && bron.totalItems === undefined) {
    throw new Fout('De bron geeft geen geldig totalItems; zonder dat valt niet vast te stellen of de ophaling volledig is. Er is niets geschreven (zie paginaSleutels en veldInventaris in het rapport).', 3);
  }
  if (viaApi && aantalUniek < bron.records.length) {
    throw new Fout(`De API gaf ${bron.records.length - aantalUniek} letterlijk dubbele records: de paginering verschuift mogelijk tijdens het ophalen. Er is niets geschreven.`);
  }
  if (bron.totalItems !== undefined && (bron.records.length !== bron.totalItems || aantalUniek !== bron.totalItems)) {
    throw new Fout(`Aantal klopt niet: ${bron.records.length} ontvangen, ${aantalUniek} uniek, totalItems = ${bron.totalItems}. Er is niets geschreven.`);
  }
  if (rapport.overgeslagen === bron.records.length) {
    throw new Fout('Geen enkel record had een herkenbare code en omschrijving; zie veldInventaris in het rapport.');
  }

  if (gekozen.size === 0) {
    schrijfRapport(rapportPad, rapport);
    meld('Geen set herkend; pas --filter aan (zie rapport).');
    log(`${sets.size} sets in de bron: ${rapport.alleSets.map((s) => s.naam).slice(0, 30).join('; ')}${sets.size > 30 ? '; …' : ''}`);
    log(`Rapport: ${rapportPad}`);
    return 2;
  }

  // Een probleem in een gekozen set mag nooit stil verdwijnen: dan schrijven we niets.
  const metProbleem = [...gekozen.values()].filter((s) => s.aantalProblemen > 0);
  if (metProbleem.length > 0) {
    const soorten = SOORTEN.map((soort) => {
      const n = metProbleem.reduce((som, s) => som + s.problemen[soort].length, 0);
      return n > 0 ? `${soort} ${n}` : undefined;
    }).filter(Boolean);
    // Ook in het logboek, dat altijd leesbaar is (het rapport is een artifact dat je eerst moet downloaden).
    // Per set de eerste paar, zodat elke set met een probleem zichtbaar is.
    log('Problemen in gekozen sets (per set de eerste conflicten en varianten):');
    let gelogd = 0;
    for (const set of [...metProbleem].sort((a, b) => vergelijk(a.sleutel, b.sleutel))) {
      const regels = ['conflict', 'variant'].flatMap((soort) =>
        [...set.problemen[soort]].sort((a, b) => vergelijk(a.code, b.code)).map((p) => beschrijfProbleem(soort, p, set)),
      );
      const ruimte = Math.max(0, Math.min(PROBLEMEN_PER_SET_IN_LOG, MAX_PROBLEMEN_IN_LOG - gelogd));
      for (const regel of regels.slice(0, ruimte)) log(`- ${regel}`);
      gelogd += Math.min(regels.length, ruimte);
      if (regels.length > ruimte) log(`  … en nog ${regels.length - ruimte} in ${set.sleutel}.`);
    }
    throw new Fout(`Problemen in gekozen sets (${soorten.join(', ')}; sets: ${metProbleem.map((s) => s.sleutel).join(', ')}). Er is niets geschreven; zie problemen in het rapport.`, 3);
  }

  // Alles eerst opbouwen, dan pas schrijven.
  rapport.verdwenen = bestaand.map((k) => k.set.id).filter((id) => !sets.has(id)).sort(vergelijk);
  const aantallen = new Map();
  const teSchrijven = [];
  for (const set of gekozen.values()) {
    const pad = path.join(uit, `${set.sleutel}.json`);
    aantallen.set(set.sleutel, set.doelen.size);
    const bestond = fs.existsSync(pad);
    if (bestond) {
      // Ongewijzigd = de tekst, opnieuw gebouwd met de tijd van het bestaande bestand, is byte-gelijk.
      const oud = leesTekst(pad);
      const oudeTijd = oud === undefined ? undefined : leesOpgehaald(oud);
      if (oudeTijd !== undefined && bouwSetBestand(set, oudeTijd).tekst === oud) {
        rapport.ongewijzigd.push(set.sleutel);
        continue;
      }
    }
    teSchrijven.push({ set, pad, bestond, gebouwd: bouwSetBestand(set, tijdstip) });
  }

  const koppen = new Map(bestaand.map((k) => [k.bestand, k]));
  for (const { set, gebouwd } of teSchrijven) koppen.set(`${set.sleutel}.json`, { bestand: `${set.sleutel}.json`, set: gebouwd.kopSet });
  const indexPad = path.join(uit, 'index.json');
  const indexTekst = JSON.stringify(bouwIndex([...koppen.values()]), null, 2) + '\n';
  const indexVerandert = leesTekst(indexPad) !== indexTekst;

  // De sleutel mag niet in de gegevens zitten. Vervangen zou de doeltekst wijzigen: dan liever niets schrijven.
  for (const tekst of [...teSchrijven.map((t) => t.gebouwd.tekst), indexTekst]) {
    if (bevatSleutel(tekst)) throw new Fout('De opgehaalde gegevens bevatten de API-sleutel. Er is niets geschreven.');
  }

  fs.mkdirSync(uit, { recursive: true });
  for (const { set, pad, bestond, gebouwd } of teSchrijven) {
    fs.writeFileSync(pad, gebouwd.tekst, 'utf8');
    (bestond ? rapport.gewijzigd : rapport.nieuw).push(set.sleutel);
  }
  if (indexVerandert) fs.writeFileSync(indexPad, indexTekst, 'utf8');

  schrijfRapport(rapportPad, rapport);

  const p = rapport.problemen;
  log(`Minimumdoelen: ${rapport.records} records uit ${rapport.bron === 'api' ? 'de API' : 'een bestand'} (${rapport.paginas} ${rapport.paginas === 1 ? 'pagina' : 'pagina\'s'}).`);
  log(`Volledig identieke records samengevoegd: ${rapport.dubbel}. Problemen in niet-gekozen sets: conflict ${p.conflict.aantal}, variant ${p.variant.aantal}, overgeslagen ${p.overgeslagen.aantal}, meerwaardig ${p.meerwaardig.aantal}.`);
  log(`Sets in de bron: ${sets.size}, gekozen: ${gekozen.size}.`);
  const dc = rapport.dubbeleCodes;
  if (dc.aantal > 0) log(`Codes die binnen een set bij meer dan één doel horen (elk met een eigen id, bv. per rubriek): ${dc.aantal} in ${dc.sets} ${dc.sets === 1 ? 'set' : 'sets'}; zie dubbeleCodes in het rapport.`);
  log(`Nieuw: ${rapport.nieuw.length ? lijst(rapport.nieuw, aantallen) : 'geen'}.`);
  log(`Gewijzigd: ${rapport.gewijzigd.length ? lijst(rapport.gewijzigd, aantallen) : 'geen'}.`);
  log(`Ongewijzigd: ${rapport.ongewijzigd.length ? lijst(rapport.ongewijzigd, aantallen) : 'geen'}.`);
  if (rapport.verdwenen.length) log(`Verdwenen uit de bron (bestand blijft staan): ${rapport.verdwenen.join(', ')}.`);
  for (const w of waarschuwingen) log(`Let op: ${w}`);
  log(`Index: ${indexVerandert ? 'bijgewerkt' : 'ongewijzigd'}. Rapport: ${rapportPad}`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  const bericht = veilig(e instanceof Fout ? e.message : `Onverwachte fout: ${e?.message ?? e}`);
  meld(`Fout: ${bericht}`);
  if (rapport && rapportPad) {
    try {
      schrijfRapport(rapportPad, { ...rapport, fout: bericht });
    } catch {
      // het rapport is een hulpmiddel: een schrijffout mag de echte foutmelding niet overschaduwen
    }
  }
  process.exitCode = e instanceof Fout ? e.code : 1;
}
