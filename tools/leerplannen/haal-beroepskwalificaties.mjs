#!/usr/bin/env node
// Haalt per structuuronderdeel (studierichting) de erkenningen met hun beroepskwalificaties op (API
// Structuuronderdelen, detail per onderdeel) en per gekoppelde BK-versie de competenties (API
// Beroepskwalificaties). Het controleert alles hard en schrijft git-vriendelijke bestanden, of niets
// (behalve het rapport). Zie docs/STUDIERICHTINGEN.md § 23.5 (import), § 23.5.2 (bestanden), § 23.5.4
// (dit script), § 23.5.5 (harde poorten) en § 23.5.10 (rapport). Node 22.18 of nieuwer, zonder
// npm-afhankelijkheden: de normalisatie komt uit src/lib/beroepskwalificaties.ts, studierichtingen.ts en
// minimumdoelen.ts (Node leest ze rechtstreeks in), de API-hulp uit tools/leerplannen/onderwijsApi.mjs.
//
//   ONDERWIJSDOELEN_API_KEY=… node tools/leerplannen/haal-beroepskwalificaties.mjs [opties]
//
// Opties
//   --onderdelen 504,1            proefrun: alleen deze onderdelen (hoogstens 50, elk een geheel getal dat in
//                                 de matrix staat); de andere records blijven, of krijgen "nog-niet-opgehaald"
//   --zonder-lijst                de BK-lijst niet ophalen (laatstErkend en lijstTotaal blijven)
//   --bron-lijst <bestand>        offline: één pagina of een lijst pagina's van de BK-lijst
//   --bron-onderdelen <bestand>   offline: {"504": <detail> | {"status": 404}, …} (een 404 is daar meteen het eindantwoord)
//   --bron-bks <bestand>          offline: {"BK-0390-2": <detail> | {"status": 404}, …}
//   --structuur <map>             standaard public/leerplannen/structuur (alleen lezen: studierichtingen.json)
//   --uit <map>                   standaard public/leerplannen/kwalificaties
//   --rapport <bestand>           standaard tools/leerplannen/rapport/laatste-beroepskwalificaties.json; niet in
//                                 de map van --uit of --structuur. Het script schrijft het eerst voorlopig: lukt
//                                 dat niet, dan stopt het meteen (1), vóór het iets ophaalt of schrijft
//   --vandaag JJJJ-MM-DD          standaard vandaag (UTC): welke erkenningen gelden, en de datum van
//                                 "nietMeerInBron" en "nietMeerGekoppeld"
//   --nu <JJJJ-MM-DDTUU:MM:SSZ>   het tijdstip "opgehaald"; alleen als niets via de API gaat (met --bron-*)
//
// Omgeving
//   ONDERWIJSDOELEN_API_KEY         verplicht als iets via de API gaat; komt nooit in een log, bestand of rapport
//   ONDERWIJSDOELEN_API_BASE        bepaalt de enige origin waar de sleutel heen mag (standaard de officiële API)
//   STRUCTUURONDERDELEN_API_BASE    standaard de officiële API Structuuronderdelen; zelfde origin, anders 1
//   BEROEPSKWALIFICATIES_API_BASE   standaard de officiële API Beroepskwalificaties; zelfde origin, anders 1
//   ONDERWIJSDOELEN_WACHT_FACTOR    vermenigvuldigt alle wachttijden (0 = niet wachten; voor tests)
//
// Uitgangscodes: 0 in orde (ook "niets veranderd"), 1 fout of onvolledig (P1), 2 niets te vragen of niets
// ontvangen (P2), 3 de gegevens zijn niet betrouwbaar genoeg om te schrijven (P3 tot P7). Bij 1, 2 en 3 is
// er niets geschreven behalve het rapport. De BK-lijst is een zachte bron (F3-B6): een HTTP-fout op de lijst
// (na de nieuwe pogingen), een andere status of geen JSON maakt ze onvolledig (een waarschuwing, exit 0);
// 401 of 403, een doorverwijzing, een andere origin of pad en een lus in de paginering blijven fout 1.
//
// Een bestand (of een record van de koppeling) dat opnieuw gebouwd wordt met zijn oude "opgehaald" en dan
// byte voor byte gelijk is, wordt niet aangeraakt. Is de nieuwe inhoud gelijk aan de oude zonder op de
// volgorde van lijsten te letten (T6), dan blijft de oude. Niets wordt gewist: een BK-bestand en een record
// blijven altijd staan, met "nietMeerGekoppeld" of "nietMeerInBron".
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Fout, adres, bevatSleutel, kort, maakOnderwijsApi, schoon, veilig } from './onderwijsApi.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');

let M;
let S;
let B;
try {
  M = await import('../../src/lib/minimumdoelen.ts');
  S = await import('../../src/lib/studierichtingen.ts');
  B = await import('../../src/lib/beroepskwalificaties.ts');
} catch {
  console.error('Fout: src/lib/minimumdoelen.ts, studierichtingen.ts of beroepskwalificaties.ts kon niet geladen worden. Dit script heeft Node 22.18 of nieuwer nodig (type stripping).');
  process.exit(1);
}

const MAX_PROEF = 50;
const MAX_LIJST_PAGINAS = 100;
const MAX_ONDERDEEL_NUMMER = 999999;
/** P6 (a) en (b): zoveel mag het aantal hoogstens dalen tegenover het bestaande bestand. */
const MAX_DALING = 0.1;
/** P5: bij een volledige run moet minstens dit deel van de gewone onderdelen van de 3de graad A een BK nu hebben. */
const P5_MIN_DEEL = 0.5;
/** P6 (c): hoogstens max(5, 5 %) van de gevraagde onderdelen mag twee keer 404 geven. */
const P6_ONDERDELEN = { vast: 5, deel: 0.05 };
/** P6 (d): hoogstens max(3, 5 %) van de gevraagde BK-versies mag twee keer 404 geven. */
const P6_BKS = { vast: 3, deel: 0.05 };
/** P7: hoogstens max(3, 2 %) van de gevraagde BK-versies mag onbruikbaar zijn. */
const P7_BKS = { vast: 3, deel: 0.02 };
const MAX_VOORBEELDEN = 50;
const MAX_MELDINGEN = 500;
const INSPRINGING = '  ';
const MATRIX_BESTAND = 'studierichtingen.json';
const KOPPELING_BESTAND = 'koppeling.json';
const INDEX_BESTAND = 'index.json';
const BK_MAP = 'bk';
const BK_BESTANDSNAAM = /^BK-\d{3,6}-\d{1,4}\.json$/;
const ONDERDEEL_SLEUTEL = /^[1-9]\d{0,5}$/;
const NAGEBOOTST = 'nagebootst';

/** Wat de eerste echte run moet bevestigen (§ 23.3): zo staat het in elk rapport. */
const TE_BEVESTIGEN = [
  'T1: geeft versie_nr_lang letterlijk de BK-versie (bv. BK-0390-2)?',
  'T2: heeft het detail per erkenning een status en datums (anders uit de matrix, zie onderdelen.uitMatrix)?',
  'T3: is de BK of DBK in een studiebekrachtiging tekst of een object (zie bekrachtigingen.vormOnbekend)?',
  'T4: HTML in teksten, nr altijd aanwezig en uniek, de soorten kennis en vaardigheden (zie bks.competenties)?',
  'T5: paginering en paginagrootte van de BK-lijst (zie lijst)?',
  'T6: is de volgorde van kennis en vaardigheden stabiel over twee runs?',
  'T7: blijft competentie_code gelijk over versies (zie bks.versieOverlap)?',
  'T8: welke soorten en finaliteiten hebben beroepskwalificaties (zie onderdelen.perSoortGraadFinaliteit)?',
  'T9: wat betekent een 404 op een detail (zie tweedeRonde, nietGevonden en voorbeeld404)?',
  'T10: velden van context, autonomie, verantwoordelijkheid en domeinen (zie bks.veldInventaris)?',
];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const heeft = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const vergelijkTekst = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (tekst) => crypto.createHash('sha256').update(tekst, 'utf8').digest('hex');
const shaVan = (waarde) => sha256(M.canoniek(waarde));
const log = (...delen) => console.log(veilig(delen.join(' ')));
const meld = (...delen) => console.error(veilig(delen.join(' ')));
const grens = (aantal, { vast, deel }) => Math.max(vast, aantal * deel);

// ── Opties ──────────────────────────────────────────────────────────────────

const OPTIE_NAMEN = {
  '--onderdelen': 'onderdelen',
  '--bron-lijst': 'bronLijst',
  '--bron-onderdelen': 'bronOnderdelen',
  '--bron-bks': 'bronBks',
  '--structuur': 'structuur',
  '--uit': 'uit',
  '--rapport': 'rapport',
  '--vandaag': 'vandaag',
  '--nu': 'nu',
};
const VLAGGEN = { '--zonder-lijst': 'zonderLijst' };

function leesOpties(argv) {
  const opties = {};
  for (let i = 0; i < argv.length; i++) {
    let arg = String(argv[i]);
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
    if (heeft(VLAGGEN, arg)) {
      if (waarde !== undefined) throw new Fout(`Bij ${arg} hoort geen waarde.`);
      if (heeft(opties, VLAGGEN[arg])) throw new Fout(`De optie ${arg} staat er meer dan één keer.`);
      opties[VLAGGEN[arg]] = true;
      continue;
    }
    if (!heeft(OPTIE_NAMEN, arg)) throw new Fout(`Onbekende optie: ${kort(arg, 60)}. Gebruik --help voor de opties.`);
    const naam = OPTIE_NAMEN[arg];
    if (waarde === undefined) {
      waarde = argv[++i];
      if (waarde === undefined) throw new Fout(`Bij ${arg} hoort een waarde.`);
    }
    // Een lege waarde wordt nooit "de huidige map" (path.resolve('')): daar zou het script schrijven.
    if (String(waarde).trim() === '') throw new Fout(`Bij ${arg} hoort een waarde; ze is leeg.`);
    if (heeft(opties, naam)) throw new Fout(`De optie ${arg} staat er meer dan één keer.`);
    opties[naam] = String(waarde);
  }
  return opties;
}

const HULP = `Gebruik: node tools/leerplannen/haal-beroepskwalificaties.mjs [--onderdelen 504,1] [--zonder-lijst]
  [--bron-lijst <bestand>] [--bron-onderdelen <bestand>] [--bron-bks <bestand>]
  [--structuur <map>] [--uit <map>] [--rapport <bestand>] [--vandaag JJJJ-MM-DD] [--nu <tijdstip>]

Als iets via de API gaat, is de omgevingsvariabele ONDERWIJSDOELEN_API_KEY verplicht.
Uitgangscodes: 0 in orde, 1 fout of onvolledig, 2 niets te vragen of niets ontvangen, 3 gegevens niet betrouwbaar genoeg om te schrijven.`;

const STANDAARD_RAPPORT = path.join(root, 'tools', 'leerplannen', 'rapport', 'laatste-beroepskwalificaties.json');
const STANDAARD_UIT = path.join(root, 'public', 'leerplannen', 'kwalificaties');
const STANDAARD_STRUCTUUR = path.join(root, 'public', 'leerplannen', 'structuur');

/** De (laatste) waarde van een optie, ook als de andere opties niet kloppen; `undefined` als ze er niet staat. */
function laatsteWaarde(argv, optie) {
  let waarde;
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (arg === optie && argv[i + 1] !== undefined) waarde = String(argv[i + 1]);
    else if (arg.startsWith(`${optie}=`)) waarde = arg.slice(optie.length + 1);
  }
  return waarde;
}

/** Ligt `pad` in `map` (of is het `map` zelf)? */
function binnen(pad, map) {
  const rel = path.relative(map, pad);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Het pad van het rapport: de (laatste) waarde van --rapport, ook als de andere opties niet kloppen. Het mag
 * niet leeg zijn (dat zou de huidige map worden), niet in de uitvoermap of de structuurmap liggen en geen
 * bronbestand zijn: het rapport zou daar gegevens overschrijven. Anders Fout(1), en er komt geen rapport.
 */
function rapportPadUit(argv) {
  const ruw = laatsteWaarde(argv, '--rapport');
  if (ruw !== undefined && ruw.trim() === '') throw new Fout('Bij --rapport hoort een bestand; de waarde is leeg. Er is niets geschreven.');
  const pad = path.resolve(ruw ?? STANDAARD_RAPPORT);
  for (const [optie, standaardMap] of [['--uit', STANDAARD_UIT], ['--structuur', STANDAARD_STRUCTUUR]]) {
    const waarde = laatsteWaarde(argv, optie);
    const map = path.resolve(waarde === undefined || waarde.trim() === '' ? standaardMap : waarde);
    if (binnen(pad, map)) throw new Fout(`--rapport (${pad}) mag niet in de map van ${optie} (${map}) liggen. Er is niets geschreven.`);
  }
  for (const optie of ['--bron-lijst', '--bron-onderdelen', '--bron-bks']) {
    const waarde = laatsteWaarde(argv, optie);
    if (waarde !== undefined && waarde.trim() !== '' && path.resolve(waarde) === pad) throw new Fout(`--rapport mag niet hetzelfde bestand zijn als ${optie}. Er is niets geschreven.`);
  }
  return pad;
}

/**
 * Schrijft meteen een voorlopig rapport. Lukt dat niet (het pad is een map, de map erboven kan niet gemaakt
 * worden …), dan stopt de run (Fout 1) vóór er iets anders geschreven is, en niet pas na het ophalen. Een
 * run die onderbroken wordt, laat zo ook geen oud rapport achter dat op een geslaagde run lijkt.
 */
function schrijfVoorlopigRapport(pad) {
  try {
    schrijfRapport(pad, { tijdstip: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), fout: 'De run is nog bezig, of werd onderbroken vóór het einde.' });
  } catch (e) {
    throw new Fout(`Het rapport ${pad} kan niet geschreven worden (${kort(e?.code ?? 'onbekende fout', 40)}). Er is niets geschreven.`);
  }
}

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
  let onderdelen;
  if (opties.onderdelen !== undefined) {
    const delen = opties.onderdelen.split(',').map((d) => d.trim());
    const fout = delen.filter((d) => !ONDERDEEL_SLEUTEL.test(d));
    if (delen.length === 0 || fout.length > 0) {
      throw new Fout(`--onderdelen is ongeldig: elk onderdeel is een geheel getal van 1 tot ${MAX_ONDERDEEL_NUMMER} (fout: ${fout.map((d) => `"${kort(d, 20)}"`).join(', ') || '(leeg)'}).`);
    }
    if (delen.length > MAX_PROEF) throw new Fout(`--onderdelen is ongeldig: hoogstens ${MAX_PROEF} onderdelen per proefrun, niet ${delen.length}.`);
    onderdelen = delen.map(Number);
    if (new Set(onderdelen).size !== onderdelen.length) throw new Fout('--onderdelen is ongeldig: een onderdeel staat er meer dan één keer in.');
    onderdelen.sort((a, b) => a - b);
  }
  const zonderLijst = opties.zonderLijst === true;
  if (zonderLijst && opties.bronLijst !== undefined) throw new Fout('--zonder-lijst past niet bij --bron-lijst.');
  const vandaag = opties.vandaag ?? new Date().toISOString().slice(0, 10);
  if (!isDag(vandaag)) throw new Fout(`--vandaag moet een datum JJJJ-MM-DD zijn, niet "${kort(vandaag, 40)}".`);
  const lijstViaApi = !zonderLijst && opties.bronLijst === undefined;
  const onderdelenViaApi = opties.bronOnderdelen === undefined;
  const bksViaApi = opties.bronBks === undefined;
  const viaApi = lijstViaApi || onderdelenViaApi || bksViaApi;
  if (opties.nu !== undefined) {
    if (viaApi) throw new Fout('--nu kan alleen als niets via de API gaat (met --bron-onderdelen, --bron-bks en --bron-lijst of --zonder-lijst).');
    if (!isTijdstip(opties.nu)) throw new Fout(`--nu moet een tijdstip JJJJ-MM-DDTUU:MM:SSZ zijn, niet "${kort(opties.nu, 40)}".`);
  }
  const pad = (waarde) => (waarde === undefined ? undefined : path.resolve(waarde));
  return {
    onderdelen,
    zonderLijst,
    bronLijst: pad(opties.bronLijst),
    bronOnderdelen: pad(opties.bronOnderdelen),
    bronBks: pad(opties.bronBks),
    structuur: path.resolve(opties.structuur ?? STANDAARD_STRUCTUUR),
    uit: path.resolve(opties.uit ?? STANDAARD_UIT),
    vandaag,
    nu: opties.nu ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    lijstViaApi,
    onderdelenViaApi,
    bksViaApi,
    viaApi,
  };
}

// ── Bestanden lezen ─────────────────────────────────────────────────────────

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

function leesJsonBestand(pad, wat) {
  const tekst = leesTekst(pad);
  if (tekst === undefined) throw new Fout(`${wat} (${pad}) kon niet gelezen worden.`);
  const json = parse(tekst);
  if (json === undefined) throw new Fout(`${wat} (${pad}) is geen geldige JSON.`);
  return json;
}

/** Alleen de namen van de bovenste sleutels, nooit inhoud: een antwoord kan van alles bevatten. */
function sleutelsVan(json) {
  if (Array.isArray(json)) return '(een lijst)';
  if (!isObject(json)) return `(${typeof json})`;
  return Object.keys(json).sort().slice(0, 20).join(', ') || '(geen)';
}

/** De matrix (alleen lezen): moet bestaan, `valideerMatrixBestand` moet [] geven en de sha256 moet kloppen (P1). */
function leesMatrix(map) {
  const pad = path.join(map, MATRIX_BESTAND);
  if (!fs.existsSync(pad)) throw new Fout(`Geen bruikbare matrix: ${pad} ontbreekt. Haal eerst de studierichtingen op.`);
  const json = parse(leesTekst(pad) ?? '');
  if (json === undefined) throw new Fout(`Geen bruikbare matrix: ${pad} is geen geldige JSON.`);
  const fouten = S.valideerMatrixBestand(json);
  if (fouten.length > 0) throw new Fout(`Geen bruikbare matrix (${pad}): ${fouten.slice(0, 3).join(' ')}`);
  if (shaVan({ groepen: json.groepen, onderdelen: json.onderdelen }) !== json.sha256) throw new Fout(`Geen bruikbare matrix (${pad}): de sha256 klopt niet.`);
  return json;
}

/** De soort van elke groep (`soortVanGroep`), uit de onderdelen die nu in de bron staan (anders alle). */
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

// ── Vaste volgorde en tekst van de bestanden ────────────────────────────────

const RECORD_VOLGORDE = ['onderdeel', 'groep', 'status', 'opgehaald', 'nietMeerInBron', 'erkenningen'];
const ERKENNING_VOLGORDE = ['adv', 'versie', 'status', 'begindatum', 'einddatum', 'bks', 'geenLijst', 'bekrachtigingen', 'extra'];
const KOPPELING_BK_VOLGORDE = ['bk', 'titel', 'extra'];
const BEKRACHTIGING_VOLGORDE = ['naam', 'onderwijskwalificatie', 'bk', 'dbk', 'extra'];
const COMPETENTIE_VOLGORDE = ['id', 'nr', 'type', 'tekst', 'kennis', 'vaardigheden', 'referenties', 'extra'];
const TEKST_VOLGORDE = ['type', 'tekst'];
const REGEL_VOLGORDE = [
  'bk', 'nummer', 'versie', 'titel', 'vks', 'status', 'aantal', 'sha256', 'opgehaald', 'bestand', 'laatstErkend', 'nietMeerGekoppeld', 'nietMeerInBron',
  'nietGevonden', 'onbruikbaar',
];

/** De velden in een vaste volgorde, zodat een bestand niet afhangt van hoe een record ontstond. Onbekende velden achteraan, gesorteerd. */
function orden(record, volgorde) {
  const uit = {};
  for (const k of volgorde) if (heeft(record, k) && record[k] !== undefined) uit[k] = record[k];
  for (const k of Object.keys(record).filter((x) => !volgorde.includes(x)).sort()) {
    if (record[k] !== undefined) Object.defineProperty(uit, k, { value: record[k], enumerable: true, writable: true, configurable: true });
  }
  return uit;
}

const ordenBk = (k) => orden(k, KOPPELING_BK_VOLGORDE);
const ordenBekrachtiging = (b) => orden(b, BEKRACHTIGING_VOLGORDE);
function ordenErkenning(e) {
  const uit = orden(e, ERKENNING_VOLGORDE);
  if (Array.isArray(uit.bks)) uit.bks = uit.bks.map(ordenBk);
  if (Array.isArray(uit.bekrachtigingen)) uit.bekrachtigingen = uit.bekrachtigingen.map(ordenBekrachtiging);
  return uit;
}
function ordenRecord(r) {
  const uit = orden(r, RECORD_VOLGORDE);
  if (Array.isArray(uit.erkenningen)) uit.erkenningen = uit.erkenningen.map(ordenErkenning);
  return uit;
}
function ordenCompetentie(c) {
  const uit = orden(c, COMPETENTIE_VOLGORDE);
  if (Array.isArray(uit.kennis)) uit.kennis = uit.kennis.map((t) => orden(t, TEKST_VOLGORDE));
  if (Array.isArray(uit.vaardigheden)) uit.vaardigheden = uit.vaardigheden.map((t) => orden(t, TEKST_VOLGORDE));
  return uit;
}
const ordenRegel = (r) => orden(r, REGEL_VOLGORDE);

function lijstTekst(naam, items) {
  const regels = items.map((x) => JSON.stringify(x));
  return regels.length === 0 ? `${INSPRINGING}"${naam}": []` : `${INSPRINGING}"${naam}": [\n${regels.join(',\n')}\n${INSPRINGING}]`;
}

/**
 * Kop met 2 spaties inspringing, daarna per deel een lijst met één compact record per regel, of één
 * compacte waarde op één regel: een verschil in git blijft leesbaar.
 */
function metKop(kop, delen) {
  const kopTekst = JSON.stringify(kop, null, 2).replace(/\n}$/, '');
  const rest = delen.map(([naam, waarde, soort]) => (soort === 'lijst' ? lijstTekst(naam, waarde) : `${INSPRINGING}${JSON.stringify(naam)}: ${JSON.stringify(waarde)}`));
  return `${kopTekst},\n${rest.join(',\n')}\n}\n`;
}

/** De inhoud van een BK-versie (wat in de sha256 telt, zonder `bk`). */
function inhoudVan(b) {
  const uit = { titel: b.titel };
  for (const k of ['status', 'vks', 'definitie']) if (b[k] !== undefined) uit[k] = b[k];
  uit.competenties = b.competenties;
  if (b.extra !== undefined) uit.extra = b.extra;
  return uit;
}

const bkSha = (bk, inhoud) => shaVan({ bk, ...inhoud });

function bouwBkBestand(bk, inhoud, opgehaald, nietMeerInBron) {
  const delen = B.splitsBk(bk);
  const competenties = inhoud.competenties.map(ordenCompetentie);
  const kop = { app: 'boosterz', kind: B.BK_KIND, v: 1, bk, nummer: delen.nummer, versie: delen.versie, titel: inhoud.titel };
  if (inhoud.status !== undefined) kop.status = inhoud.status;
  if (inhoud.vks !== undefined) kop.vks = inhoud.vks;
  if (inhoud.definitie !== undefined) kop.definitie = inhoud.definitie;
  Object.assign(kop, { bron: B.BK_BRON, api: B.bkApiVan(bk), naamsvermelding: B.BK_NAAMSVERMELDING, licentie: B.LICENTIE, opgehaald });
  if (nietMeerInBron !== undefined) kop.nietMeerInBron = nietMeerInBron;
  kop.aantal = competenties.length;
  kop.sha256 = bkSha(bk, { ...inhoud, competenties });
  const delenTekst = [['competenties', competenties, 'lijst']];
  if (inhoud.extra !== undefined) delenTekst.push(['extra', inhoud.extra, 'compact']);
  const tekst = metKop(kop, delenTekst);
  return { tekst, json: JSON.parse(tekst) };
}

function bouwIndexTekst(regels, opgehaald, lijstTotaal) {
  const bks = regels.map(ordenRegel);
  const kop = { app: 'boosterz', kind: B.BK_INDEX_KIND, v: 1, bron: B.BK_BRON, api: B.BK_INDEX_API, naamsvermelding: B.BK_NAAMSVERMELDING, licentie: B.LICENTIE, opgehaald };
  if (lijstTotaal !== undefined) kop.lijstTotaal = lijstTotaal;
  kop.sha256 = shaVan(bks);
  return metKop(kop, [['bks', bks, 'lijst']]);
}

function bouwKoppelingTekst(records, opgehaald, matrixSha256) {
  const onderdelen = records.map(ordenRecord);
  const kop = {
    app: 'boosterz', kind: B.KOPPELING_KIND, v: 1, bron: B.BK_BRON, api: B.KOPPELING_API, naamsvermelding: B.KOPPELING_NAAMSVERMELDING, licentie: B.LICENTIE,
    opgehaald, matrixSha256, aantalOnderdelen: onderdelen.length, sha256: shaVan(onderdelen),
  };
  return metKop(kop, [['onderdelen', onderdelen, 'lijst']]);
}

/** Bouwt met het oude "opgehaald"; is dat byte voor byte het oude bestand, dan blijft het. Anders met `nu`. */
function bouwOfHoud(bouw, oudeTekst, oudOpgehaald, nu) {
  if (oudeTekst !== undefined && oudOpgehaald !== undefined) {
    const t = bouw(oudOpgehaald);
    if (t === oudeTekst) return { tekst: t, veranderd: false };
  }
  return { tekst: bouw(nu), veranderd: true };
}

// ── Bestaande bestanden ─────────────────────────────────────────────────────

/**
 * Leest wat er al staat en eist dat het klopt: een geldige koppeling en index met de juiste sha256, elk
 * BK-bestand geldig en met de juiste sha256, de index en de bestanden in overeenstemming, en elk
 * onderdeel van de koppeling in de matrix. Op een kapotte toestand schrijft het script niets (P1).
 */
function leesBestaand(uit, matrix) {
  const fouten = [];
  const kPad = path.join(uit, KOPPELING_BESTAND);
  const iPad = path.join(uit, INDEX_BESTAND);
  const bkMap = path.join(uit, BK_MAP);
  const uitkomst = { koppeling: null, koppelingTekst: undefined, index: null, indexTekst: undefined, bestanden: new Map() };

  if (fs.existsSync(kPad)) {
    const tekst = leesTekst(kPad);
    const json = tekst === undefined ? undefined : parse(tekst);
    const f = json === undefined ? ['geen leesbare JSON.'] : B.valideerKoppelingBestand(json);
    if (f.length > 0) fouten.push(`${KOPPELING_BESTAND}: ${f.slice(0, 3).join(' ')}`);
    else if (shaVan(json.onderdelen) !== json.sha256) fouten.push(`${KOPPELING_BESTAND}: de sha256 klopt niet.`);
    else Object.assign(uitkomst, { koppeling: json, koppelingTekst: tekst });
  }
  if (fs.existsSync(iPad)) {
    const tekst = leesTekst(iPad);
    const json = tekst === undefined ? undefined : parse(tekst);
    const f = json === undefined ? ['geen leesbare JSON.'] : B.valideerBkIndex(json);
    if (f.length > 0) fouten.push(`${INDEX_BESTAND}: ${f.slice(0, 3).join(' ')}`);
    else if (shaVan(json.bks) !== json.sha256) fouten.push(`${INDEX_BESTAND}: de sha256 klopt niet.`);
    else Object.assign(uitkomst, { index: json, indexTekst: tekst });
  }
  if (fs.existsSync(bkMap)) {
    for (const naam of fs.readdirSync(bkMap).sort()) {
      if (!naam.endsWith('.json')) continue;
      if (!BK_BESTANDSNAAM.test(naam)) {
        fouten.push(`${BK_MAP}/${naam}: een onbekend bestand.`);
        continue;
      }
      const bk = naam.slice(0, -'.json'.length);
      const tekst = leesTekst(path.join(bkMap, naam));
      const json = tekst === undefined ? undefined : parse(tekst);
      const f = json === undefined ? ['geen leesbare JSON.'] : B.valideerBkBestand(json, bk);
      if (f.length > 0) fouten.push(`${BK_MAP}/${naam}: ${f.slice(0, 3).join(' ')}`);
      else if (bkSha(bk, inhoudVan(json)) !== json.sha256) fouten.push(`${BK_MAP}/${naam}: de sha256 klopt niet.`);
      else uitkomst.bestanden.set(bk, { tekst, json });
    }
  }
  if (fouten.length === 0) {
    const { koppeling, index, bestanden } = uitkomst;
    if (koppeling && !index) fouten.push(`${KOPPELING_BESTAND} staat er, maar ${INDEX_BESTAND} niet.`);
    if (index && !koppeling) fouten.push(`${INDEX_BESTAND} staat er, maar ${KOPPELING_BESTAND} niet.`);
    if (!index && bestanden.size > 0) fouten.push(`In ${BK_MAP}/ staan bestanden zonder index.`);
    if (koppeling) {
      const inMatrix = new Set(matrix.onderdelen.map((o) => o.nummer));
      const vreemd = koppeling.onderdelen.map((r) => r.onderdeel).filter((n) => !inMatrix.has(n));
      if (vreemd.length > 0) fouten.push(`De koppeling noemt onderdelen die niet in de matrix staan: ${vreemd.slice(0, 5).join(', ')}.`);
    }
    if (index) {
      const genoemd = new Set(index.bks.filter((r) => r.bestand !== undefined).map((r) => r.bk));
      for (const bk of bestanden.keys()) if (!genoemd.has(bk)) fouten.push(`${BK_MAP}/${bk}.json staat er, maar de index noemt het niet.`);
      for (const r of index.bks) {
        if (r.bestand === undefined) continue;
        const b = bestanden.get(r.bk);
        if (!b) {
          fouten.push(`De index noemt ${r.bestand}, maar dat bestand ontbreekt.`);
          continue;
        }
        const k = b.json;
        if (k.sha256 !== r.sha256 || k.aantal !== r.aantal || k.titel !== r.titel || k.opgehaald !== r.opgehaald || k.vks !== r.vks || k.status !== r.status || k.nietMeerInBron !== r.nietMeerInBron) {
          fouten.push(`${r.bestand}: de kop klopt niet met de regel in de index.`);
        }
      }
    }
  }
  if (fouten.length > 0) {
    throw new Fout(`De bestaande bestanden in ${uit} kloppen niet: ${fouten.slice(0, 5).join(' ')}${fouten.length > 5 ? ` (en nog ${fouten.length - 5})` : ''} Herstel ze eerst; er is niets geschreven.`);
  }
  return uitkomst;
}

// ── Opgeslagen antwoorden (--bron-*) ────────────────────────────────────────

/**
 * Een bronbestand {sleutel: antwoord}: elke sleutel moet `sleutelTest` halen, behalve "nagebootst" (een
 * tekst die zegt dat de antwoorden nagebootst zijn; die komt als waarschuwing in het rapport).
 */
function leesBronMap(pad, wat, sleutelTest, naarSleutel) {
  const json = leesJsonBestand(pad, wat);
  if (!isObject(json)) throw new Fout(`${wat} heeft niet de vorm {"<sleutel>": <antwoord>, …} (${sleutelsVan(json)}).`);
  const antwoorden = new Map();
  let nagebootst;
  for (const sleutel of Object.keys(json)) {
    if (sleutel === NAGEBOOTST && typeof json[sleutel] === 'string') {
      nagebootst = json[sleutel];
      continue;
    }
    if (!sleutelTest(sleutel)) throw new Fout(`${wat} bevat een onbekende sleutel "${kort(sleutel, 40)}".`);
    antwoorden.set(naarSleutel(sleutel), json[sleutel]);
  }
  return { antwoorden, nagebootst };
}

/** Een antwoord uit een bronbestand: {"status": 404} (zonder het veld `kenmerk`) of een gewoon antwoord (200). */
function antwoordUitBron(waarde, kenmerk, wat) {
  if (isObject(waarde) && heeft(waarde, 'status') && !heeft(waarde, kenmerk)) {
    if (waarde.status === 404) return { status: 404, tekst: kort(JSON.stringify(waarde), 500) };
    throw new Fout(`${wat}: de bron antwoordt met HTTP ${kort(JSON.stringify(waarde.status), 20)}; alleen 200 of 404 kan.`);
  }
  return { status: 200, json: waarde };
}

// ── Rapport ─────────────────────────────────────────────────────────────────

let rapport;
let rapportPad;
let begin;
let api;

function nieuwRapport(cfg) {
  const allesViaApi = (cfg.lijstViaApi || cfg.zonderLijst) && cfg.onderdelenViaApi && cfg.bksViaApi;
  const bron = !cfg.viaApi ? 'bestand' : allesViaApi ? 'api' : 'gemengd';
  return {
    tijdstip: cfg.nu,
    bron,
    proef: cfg.onderdelen ?? null,
    zonderLijst: cfg.zonderLijst,
    vandaag: cfg.vandaag,
    verzoeken: 0,
    duurSeconden: 0,
    teBevestigen: TE_BEVESTIGEN,
    lijst: { verzoeken: 0, overgeslagen: cfg.zonderLijst, paginas: 0, pad: null, totaal: null, ontvangen: 0, volledig: false, nietInLijst: [], nieuwereVersie: [], veldInventaris: {} },
    onderdelen: {
      verzoeken: 0, gevraagd: 0, opgehaald: 0, nietGevonden: 0, nietGevondenOnderdelen: [], tweedeRonde: { onderdelen: 0, verzoeken: 0 }, perSoortGraadFinaliteit: {},
      erkenningenNu: { 0: 0, 1: 0, meer: 0 }, toekomst: 0, toekomstAndereLijst: [], geenLijst: 0, uitMatrix: 0, aanvullingenUitMatrix: [], verschilMetMatrix: 0,
      erkenningVerschilMetMatrix: [], advVerschilMetMatrix: [], groepVerschilMetMatrix: [],
      onverwachtMetBk: [], derdeGraadA: { onderdelen: 0, metBk: 0 }, nieuw: [], nietMeerGekoppeld: [], andereVersie: [], veldInventaris: {},
    },
    bks: {
      verzoeken: 0, gevraagd: 0, nieuw: [], inhoudVeranderd: [], ongewijzigd: 0, nietMeerInBron: [], nietGevonden: [], onbruikbaar: [], nietMeerGekoppeld: [],
      tweedeRonde: { versies: 0, verzoeken: 0 }, versieOverlap: [],
      competenties: { totaal: 0, zonderNr: 0, dubbelNr: 0, metHtml: 0, kennisTypes: {}, vaardigheidTypes: {}, langsteTekst: 0 }, veldInventaris: {},
    },
    bekrachtigingen: { totaal: 0, onderwijskwalificatie: 0, dbk: 0, vormOnbekend: 0, voorbeeld: null },
    bestanden: { koppeling: null, index: null },
    geschreven: { bestanden: 0, bytes: 0 },
    omvang: { bestanden: 0, bytes: 0 },
    voorbeeld404: null,
    problemen: [],
    waarschuwingen: [],
    fout: null,
  };
}

let teveelMeldingen = 0;
function waarschuw(tekst) {
  if (rapport.waarschuwingen.length < MAX_MELDINGEN) rapport.waarschuwingen.push(kort(tekst, 600));
  else teveelMeldingen++;
}

function werkTellersBij() {
  if (!rapport) return;
  const perSoort = api?.teller.perSoort ?? {};
  rapport.verzoeken = api?.teller.verzoeken ?? 0;
  rapport.lijst.verzoeken = perSoort.lijst ?? 0;
  rapport.onderdelen.verzoeken = perSoort.onderdeel ?? 0;
  rapport.bks.verzoeken = perSoort.bk ?? 0;
  rapport.duurSeconden = Math.round((Date.now() - begin) / 100) / 10;
  if (teveelMeldingen > 0 && !rapport.waarschuwingen.at(-1)?.startsWith('…')) rapport.waarschuwingen.push(`… en nog ${teveelMeldingen} waarschuwingen.`);
}

function schrijfRapport(pad, inhoud) {
  fs.mkdirSync(path.dirname(pad), { recursive: true });
  fs.writeFileSync(pad, schoon(JSON.stringify(inhoud, null, 2)) + '\n', 'utf8');
}

/** Stopt met exit 3 (of `code`) als er problemen zijn; de eerste paar staan in de melding, alle (begrensd) in het rapport. */
function stopBijProblemen(problemen, inleiding, code = 3) {
  if (problemen.length === 0) return;
  rapport.problemen.push(...problemen.slice(0, MAX_MELDINGEN).map((p) => kort(p, 600)));
  if (problemen.length > MAX_MELDINGEN) rapport.problemen.push(`… en nog ${problemen.length - MAX_MELDINGEN} problemen.`);
  const eerste = problemen.slice(0, 3).join(' ');
  throw new Fout(`${inleiding}: ${eerste}${problemen.length > 3 ? ` (en nog ${problemen.length - 3}; zie problemen in het rapport)` : ''} Er is niets geschreven.`, code);
}

/**
 * T2 in de waarschuwingen: elke aanvulling uit de matrix en elk verschil met de matrix staat met onderdeel,
 * ADV-nummer en veld in het rapport (onderdelen.aanvullingenUitMatrix en erkenningVerschilMetMatrix, de
 * eerste 50); de waarschuwing geeft het aantal en de eerste vijf. Eén waarschuwing per soort, zodat een
 * detail dat nooit datums geeft (dan zijn het er honderden) de andere waarschuwingen niet verdringt.
 */
function meldMatrixAanvullingen() {
  const ro = rapport.onderdelen;
  const eerste = (lijst, tekst, totaal) => `${lijst.slice(0, 5).map(tekst).join('; ')}${totaal > 5 ? `; en nog ${totaal - 5}` : ''}`;
  if (ro.uitMatrix > 0) {
    const tekst = (a) => `onderdeel ${a.onderdeel}, ${a.adv}: ${a.velden.join(', ')}`;
    waarschuw(`T2: bij ${ro.uitMatrix} ${ro.uitMatrix === 1 ? 'erkenning komt' : 'erkenningen komen'} een veld uit de matrix, omdat het detail het niet noemt (${eerste(ro.aanvullingenUitMatrix, tekst, ro.uitMatrix)}). Zie onderdelen.aanvullingenUitMatrix.`);
  }
  if (ro.verschilMetMatrix > 0) {
    const tekst = (v) => `onderdeel ${v.onderdeel}, ${v.adv}: ${v.veld} in het detail ${v.detail ?? (v.veld === 'einddatum' ? 'open' : 'leeg')}, in de matrix ${v.matrix ?? (v.veld === 'einddatum' ? 'open' : 'leeg')}`;
    waarschuw(`Het detail en de matrix verschillen ${ro.verschilMetMatrix} keer in de status of de datums van een erkenning; het detail telt (${eerste(ro.erkenningVerschilMetMatrix, tekst, ro.verschilMetMatrix)}). Zie onderdelen.erkenningVerschilMetMatrix.`);
  }
}

/** Telt de paden van een antwoord in een inventaris (pad → aantal antwoorden). */
function telVelden(inventaris, velden) {
  for (const v of velden) inventaris.set(v, (inventaris.get(v) ?? 0) + 1);
}
const inventarisObject = (inventaris) => Object.fromEntries([...inventaris.entries()].sort((a, b) => vergelijkTekst(a[0], b[0])));

/**
 * De omvang van wat er na de run in de uitvoermap staat: wat er nu staat, met de bestanden van `teSchrijven`
 * erbij of in de plaats. Zo kan het rapport geschreven worden vóór de gegevens.
 */
function omvangNa(uit, teSchrijven) {
  const paden = [path.join(uit, KOPPELING_BESTAND), path.join(uit, INDEX_BESTAND)];
  const bkMap = path.join(uit, BK_MAP);
  if (fs.existsSync(bkMap)) for (const f of fs.readdirSync(bkMap)) if (BK_BESTANDSNAAM.test(f)) paden.push(path.join(bkMap, f));
  const grootte = new Map(paden.filter((p) => fs.existsSync(p)).map((p) => [p, fs.statSync(p).size]));
  for (const t of teSchrijven) grootte.set(t.pad, Buffer.byteLength(t.tekst, 'utf8'));
  return { bestanden: grootte.size, bytes: [...grootte.values()].reduce((som, n) => som + n, 0) };
}

// ── Hulp bij de koppeling ───────────────────────────────────────────────────

/** De BK-versies van de erkenningen die vandaag gelden (`nu`) en die later beginnen (`toekomst`). */
function bksOp(erkenningen, vandaag) {
  const { nu, toekomst } = B.erkenningenOp(erkenningen ?? [], vandaag);
  const versies = (lijst) => [...new Set(lijst.flatMap((e) => (e.bks ?? []).map((k) => k.bk)))].sort(B.vergelijkBkVersie);
  return { nu: versies(nu), toekomst: versies(toekomst), erkenningenNu: nu, erkenningenToekomst: toekomst };
}

/** Telt over alle records: onderdelen met minstens één BK nu, en unieke BK-versies nu (P6 a en b). */
function telKoppeling(records, vandaag) {
  let onderdelen = 0;
  const versies = new Set();
  for (const r of records) {
    if (!Array.isArray(r.erkenningen)) continue;
    const { nu } = bksOp(r.erkenningen, vandaag);
    if (nu.length > 0) onderdelen++;
    for (const bk of nu) versies.add(bk);
  }
  return { onderdelen, versies: versies.size };
}

const ERKENNING_LEVENSLOOP = ['status', 'begindatum', 'einddatum'];
const zelfdeWaarde = (veld, a, b) => (veld === 'status' && typeof a === 'string' && typeof b === 'string' ? a.toUpperCase() === b.toUpperCase() : a === b);

/**
 * T2: status en datums komen uit het detail, de actuelere bron (de matrix in de repo kan een maand oud zijn).
 * Alleen wat het detail voor een erkenning niet meldt, komt uit de matrix (zelfde ADV-nummer):
 * - de status, als het detail geen status geeft;
 * - de begindatum, als het detail geen begindatum geeft;
 * - de einddatum alleen als het detail voor die erkenning helemaal geen datum geeft. Geeft het detail een
 *   begindatum zonder einddatum, dan is de erkenning daar open, en een einddatum uit de matrix mag ze niet
 *   sluiten. Geeft het detail geen enkele datum, dan zegt het niets over het einde: dan wel uit de matrix
 *   (anders telt een afgelopen erkenning als een erkenning van nu).
 * Geeft de erkenningen opnieuw gesorteerd terug, met per aangevulde erkenning de velden, en de velden
 * waarin het detail en de matrix verschillen (zacht, voor het rapport; het detail telt).
 */
function vulAanUitMatrix(erkenningen, matrixOnderdeel) {
  const perAdv = new Map((matrixOnderdeel.erkenningen ?? []).map((e) => [e.nummer, e]));
  const aanvullingen = [];
  const verschillen = [];
  const uit = erkenningen.map((e) => {
    const m = perAdv.get(e.adv);
    if (!m) return e;
    const mag = { status: e.status === undefined, begindatum: e.begindatum === undefined, einddatum: e.begindatum === undefined && e.einddatum === undefined };
    const n = { ...e };
    const velden = [];
    for (const veld of ERKENNING_LEVENSLOOP) {
      if (mag[veld] && m[veld] !== undefined) {
        n[veld] = m[veld];
        velden.push(veld);
      } else if (!zelfdeWaarde(veld, n[veld], m[veld])) {
        verschillen.push({ adv: e.adv, veld, detail: n[veld] ?? null, matrix: m[veld] ?? null });
      }
    }
    if (velden.length === 0) return e;
    aanvullingen.push({ adv: e.adv, velden });
    return n;
  });
  return { erkenningen: uit.sort(B.vergelijkErkenning), aanvullingen, verschillen };
}

// ── Hoofdprogramma ──────────────────────────────────────────────────────────

async function main() {
  begin = Date.now();
  const argv = process.argv.slice(2);
  // Het rapport komt er ook als de opties niet kloppen (behalve bij --help). Eerst een voorlopig rapport: kan
  // het niet geschreven worden, dan stopt de run hier, vóór er iets anders geschreven is.
  if (!argv.includes('--help') && !argv.includes('-h')) {
    const pad = rapportPadUit(argv);
    schrijfVoorlopigRapport(pad);
    rapportPad = pad;
  }
  const opties = leesOpties(argv);
  if (opties.help) {
    console.log(HULP);
    return 0;
  }
  const cfg = controleerOpties(opties);
  rapport = nieuwRapport(cfg);
  if (cfg.viaApi) {
    api = maakOnderwijsApi({
      basissen: [
        ['ONDERWIJSDOELEN_API_BASE', M.API_BASIS],
        ['STRUCTUURONDERDELEN_API_BASE', S.STRUCTUUR_API],
        ['BEROEPSKWALIFICATIES_API_BASE', B.BK_API],
      ],
      log: (t) => console.log(t),
      waarschuw: (t) => {
        meld(t);
        waarschuw(t);
      },
    });
  }

  // 1. Matrix lezen (alleen lezen) en de bestaande bestanden.
  const matrix = leesMatrix(cfg.structuur);
  const onderdeelInfo = new Map(matrix.onderdelen.map((o) => [o.nummer, o]));
  const groepInfo = new Map(matrix.groepen.map((g) => [g.nummer, g]));
  const soorten = soortenVan(matrix);
  const geldig = (o) => o.nietMeerInBron === undefined && !S.isAfgebouwd(o, cfg.vandaag);
  let teVragen;
  if (cfg.onderdelen) {
    const fout = cfg.onderdelen.filter((n) => !onderdeelInfo.has(n));
    if (fout.length > 0) throw new Fout(`--onderdelen is ongeldig: ${fout.join(', ')} staat niet in de matrix.`);
    teVragen = cfg.onderdelen;
  } else {
    teVragen = matrix.onderdelen.filter(geldig).map((o) => o.nummer).sort((a, b) => a - b);
  }
  for (const nr of teVragen) {
    if (!Number.isSafeInteger(nr) || nr < 1 || nr > MAX_ONDERDEEL_NUMMER) throw new Fout(`Onderdeel ${kort(nr, 20)} is geen geheel getal van 1 tot ${MAX_ONDERDEEL_NUMMER}.`);
  }
  rapport.onderdelen.gevraagd = teVragen.length;
  if (teVragen.length === 0) throw new Fout('Er is geen enkel onderdeel te vragen (elk onderdeel van de matrix is afgebouwd of staat niet meer in de bron). Er is niets geschreven.', 2);
  const bestaand = leesBestaand(cfg.uit, matrix);
  const oudeRecords = new Map((bestaand.koppeling?.onderdelen ?? []).map((r) => [r.onderdeel, r]));
  log(`Matrix: ${matrix.onderdelen.length} onderdelen; te vragen: ${teVragen.length}${cfg.onderdelen ? ' (proefrun)' : ''}.`);

  // 2. De BK-lijst (zacht, F3-B6): alleen een volledige lijst wordt gebruikt.
  const lijst = { gebruikt: false, laatstErkend: new Map(), totaal: undefined };
  if (!cfg.zonderLijst) await haalLijst(cfg, lijst);
  else log('BK-lijst: niet opgehaald (--zonder-lijst); laatstErkend en lijstTotaal blijven zoals ze waren.');

  // 3. Detail per onderdeel, oplopend; een 404 krijgt (via de API) één nieuwe poging na alle andere.
  const resultaten = new Map(); // nr -> { status: 'opgehaald', erkenningen } | { status: 'niet-gevonden' }
  const bronOnderdelen = cfg.onderdelenViaApi ? undefined : leesBronMap(cfg.bronOnderdelen, 'Het bronbestand van de onderdelen', (s) => ONDERDEEL_SLEUTEL.test(s), Number);
  if (bronOnderdelen?.nagebootst) waarschuw(`De bron van de onderdelen zegt: ${bronOnderdelen.nagebootst}`);
  const onderdeelVelden = new Map();
  const p4 = [];
  let vormOnbekend = 0;
  const vormVoorbeelden = [];

  const haalOnderdeel = async (nr, ronde) => {
    if (bronOnderdelen) {
      if (!bronOnderdelen.antwoorden.has(nr)) throw new Fout(`Het bronbestand van de onderdelen heeft geen antwoord voor onderdeel ${nr}.`);
      return antwoordUitBron(bronOnderdelen.antwoorden.get(nr), 'structuuronderdeel_nummer', `Onderdeel ${nr}`);
    }
    return api.haalJson(adres(api.basis.STRUCTUURONDERDELEN_API_BASE, 'structuuronderdeel', nr), `Onderdeel ${nr}${ronde === 2 ? ' (tweede ronde)' : ''}`, 'onderdeel', { mag404: true });
  };

  const verwerkOnderdeel = (nr, json) => {
    const n = B.normaliseerOnderdeelDetail(json, nr);
    telVelden(onderdeelVelden, n.velden);
    if (n.nummer !== nr) {
      stopBijProblemen(n.problemen.map((p) => `P3: ${p}`), 'Het detail negeert het nummer');
      stopBijProblemen([`P3: Onderdeel ${nr}: het detail noemt een ander nummer of geen.`], 'Het detail negeert het nummer');
    }
    for (const p of n.problemen) p4.push(`P4: ${p}`);
    for (const w of n.waarschuwingen) {
      waarschuw(w);
      if (/studiebekrachtiging/.test(w) && /onbekende vorm|niet te lezen|zonder naam/.test(w) && vormVoorbeelden.length === 0) vormVoorbeelden.push(w);
    }
    vormOnbekend += n.vormOnbekend;
    const o = onderdeelInfo.get(nr);
    if (n.groep !== undefined && n.groep !== o.groep) {
      rapport.onderdelen.groepVerschilMetMatrix.push({ onderdeel: nr, detail: n.groep, matrix: o.groep });
      waarschuw(`Onderdeel ${nr}: het detail noemt groep ${n.groep}, de matrix ${o.groep}.`);
    }
    const advDetail = n.erkenningen.map((e) => e.adv).sort();
    const advMatrix = (o.erkenningen ?? []).map((e) => e.nummer).sort();
    const alleenDetail = advDetail.filter((a) => !advMatrix.includes(a));
    const alleenMatrix = advMatrix.filter((a) => !advDetail.includes(a));
    if (alleenDetail.length > 0 || alleenMatrix.length > 0) rapport.onderdelen.advVerschilMetMatrix.push({ onderdeel: nr, alleenInDetail: alleenDetail, alleenInMatrix: alleenMatrix });
    const aangevuld = vulAanUitMatrix(n.erkenningen, o);
    const ro = rapport.onderdelen;
    ro.uitMatrix += aangevuld.aanvullingen.length;
    for (const a of aangevuld.aanvullingen) if (ro.aanvullingenUitMatrix.length < MAX_VOORBEELDEN) ro.aanvullingenUitMatrix.push({ onderdeel: nr, ...a });
    ro.verschilMetMatrix += aangevuld.verschillen.length;
    for (const v of aangevuld.verschillen) if (ro.erkenningVerschilMetMatrix.length < MAX_VOORBEELDEN) ro.erkenningVerschilMetMatrix.push({ onderdeel: nr, ...v });
    resultaten.set(nr, { status: 'opgehaald', erkenningen: aangevuld.erkenningen });
  };

  const tweedeRonde = [];
  for (const [i, nr] of teVragen.entries()) {
    if (i > 0 && i % 100 === 0) log(`Onderdelen: ${i} van de ${teVragen.length} gevraagd.`);
    const a = await haalOnderdeel(nr, 1);
    if (a.status === 404) {
      rapport.voorbeeld404 ??= kort(a.tekst, 300);
      if (bronOnderdelen) {
        resultaten.set(nr, { status: 'niet-gevonden' });
        log(`Onderdeel ${nr}: niet gevonden (404).`);
      } else {
        tweedeRonde.push(nr);
        log(`Onderdeel ${nr}: 404; nog één poging in de tweede ronde.`);
      }
      continue;
    }
    verwerkOnderdeel(nr, a.json);
  }
  if (tweedeRonde.length > 0) {
    const voor = api.teller.perSoort.onderdeel ?? 0;
    log(`Tweede ronde: ${tweedeRonde.length} ${tweedeRonde.length === 1 ? 'onderdeel' : 'onderdelen'} met een 404 nog één keer opvragen.`);
    try {
      for (const nr of tweedeRonde) {
        const a = await haalOnderdeel(nr, 2);
        if (a.status === 404) {
          resultaten.set(nr, { status: 'niet-gevonden' });
          log(`Onderdeel ${nr}: twee keer 404, niet gevonden.`);
          continue;
        }
        waarschuw(`Onderdeel ${nr}: eerst 404, bij de nieuwe poging wel een detail.`);
        verwerkOnderdeel(nr, a.json);
      }
    } finally {
      rapport.onderdelen.tweedeRonde = { onderdelen: tweedeRonde.length, verzoeken: (api.teller.perSoort.onderdeel ?? 0) - voor };
    }
  }
  rapport.onderdelen.veldInventaris = inventarisObject(onderdeelVelden);
  meldMatrixAanvullingen();
  stopBijProblemen(p4, 'De koppeling is niet betrouwbaar');

  const opgehaaldNu = [...resultaten].filter(([, r]) => r.status === 'opgehaald').map(([nr]) => nr);
  const nietGevonden = [...resultaten].filter(([, r]) => r.status === 'niet-gevonden').map(([nr]) => nr);
  rapport.onderdelen.opgehaald = opgehaaldNu.length;
  rapport.onderdelen.nietGevonden = nietGevonden.length;
  rapport.onderdelen.nietGevondenOnderdelen = nietGevonden;
  if (opgehaaldNu.length === 0) throw new Fout(`Geen enkel detail ontvangen (${nietGevonden.length} van de ${teVragen.length} onderdelen gaven 404). Er is niets geschreven.`, 2);
  if (nietGevonden.length > grens(teVragen.length, P6_ONDERDELEN)) {
    stopBijProblemen([`P6 (c): ${nietGevonden.length} van de ${teVragen.length} gevraagde onderdelen gaven twee keer 404 (${nietGevonden.slice(0, 10).join(', ')}${nietGevonden.length > 10 ? ', …' : ''}).`], 'Massaverlies');
  }

  // Zachte controles per opgehaald onderdeel (§ 23.5.6) en P5.
  const ro = rapport.onderdelen;
  const bekr = rapport.bekrachtigingen;
  const derdeGraadA = [];
  for (const nr of opgehaaldNu) {
    const o = onderdeelInfo.get(nr);
    const g = groepInfo.get(o.groep);
    const soort = soorten.get(o.groep);
    const { erkenningen } = resultaten.get(nr);
    const b = bksOp(erkenningen, cfg.vandaag);
    const sleutel = `${soort}|${g.graad ?? '-'}|${g.finaliteit ?? '-'}`;
    ro.perSoortGraadFinaliteit[sleutel] ??= { metBk: 0, zonderBk: 0 };
    ro.perSoortGraadFinaliteit[sleutel][b.nu.length > 0 ? 'metBk' : 'zonderBk']++;
    const aantalNu = b.erkenningenNu.length;
    ro.erkenningenNu[aantalNu === 0 ? 0 : aantalNu === 1 ? 1 : 'meer']++;
    if (b.erkenningenToekomst.length > 0) {
      ro.toekomst++;
      for (const e of b.erkenningenToekomst) {
        const lijstT = e.bks.map((k) => k.bk).join(',');
        if (lijstT !== b.nu.join(',') && ro.toekomstAndereLijst.length < MAX_VOORBEELDEN) ro.toekomstAndereLijst.push({ onderdeel: nr, adv: e.adv, begindatum: e.begindatum ?? null, bks: e.bks.map((k) => k.bk) });
      }
    }
    ro.geenLijst += erkenningen.filter((e) => e.geenLijst === true).length;
    if (b.nu.length > 0 && (g.finaliteit === 'DO' || g.graad === '1')) {
      ro.onverwachtMetBk.push(nr);
      waarschuw(`Info: onderdeel ${nr} (${g.graad === '1' ? '1ste graad' : 'doorstroomfinaliteit'}) heeft toch een beroepskwalificatie (${b.nu.join(', ')}).`);
    }
    for (const e of b.erkenningenNu) {
      for (const s of e.bekrachtigingen ?? []) {
        bekr.totaal++;
        if (s.onderwijskwalificatie === true) bekr.onderwijskwalificatie++;
        if (s.dbk !== undefined) bekr.dbk++;
      }
    }
    if (soort === 'gewoon' && g.graad === '3' && g.finaliteit === 'A' && o.aanloop !== true && geldig(o)) derdeGraadA.push({ nr, metBk: b.nu.length > 0 });
  }
  ro.perSoortGraadFinaliteit = Object.fromEntries(Object.entries(ro.perSoortGraadFinaliteit).sort((a, b) => vergelijkTekst(a[0], b[0])));
  bekr.vormOnbekend = vormOnbekend;
  bekr.voorbeeld = vormVoorbeelden[0] ?? null;
  ro.advVerschilMetMatrix = ro.advVerschilMetMatrix.slice(0, MAX_VOORBEELDEN);
  ro.derdeGraadA = { onderdelen: derdeGraadA.length, metBk: derdeGraadA.filter((x) => x.metBk).length };
  if (!cfg.onderdelen && derdeGraadA.length > 0 && ro.derdeGraadA.metBk < derdeGraadA.length * P5_MIN_DEEL) {
    stopBijProblemen(
      [`P5: maar ${ro.derdeGraadA.metBk} van de ${derdeGraadA.length} gewone onderdelen van de 3de graad met finaliteit A (geen aanloop) hebben een beroepskwalificatie in een erkenning van nu (minder dan ${P5_MIN_DEEL * 100} %).`],
      'De koppeling lijkt niet meer te werken',
    );
  }

  // 4. BK-versies verzamelen: van de erkenningen die nu gelden of later beginnen, van de records van deze run.
  const teVragenBks = [...new Set(opgehaaldNu.flatMap((nr) => {
    const b = bksOp(resultaten.get(nr).erkenningen, cfg.vandaag);
    return [...b.nu, ...b.toekomst];
  }))].sort(B.vergelijkBkVersie);
  for (const bk of teVragenBks) if (!B.BK_VERSIE.test(bk)) throw new Fout(`De BK-versie ${kort(bk, 40)} past niet op BK-0000-0.`);
  rapport.bks.gevraagd = teVragenBks.length;
  log(`Onderdelen: ${opgehaaldNu.length} opgehaald, ${nietGevonden.length} niet gevonden; ${teVragenBks.length} BK-versies te vragen.`);

  // 5. Detail per BK-versie.
  const bronBks = cfg.bksViaApi ? undefined : leesBronMap(cfg.bronBks, 'Het bronbestand van de beroepskwalificaties', (s) => B.BK_VERSIE.test(s), (s) => s);
  if (bronBks?.nagebootst) waarschuw(`De bron van de beroepskwalificaties zegt: ${bronBks.nagebootst}`);
  const bkUitkomsten = new Map(); // bk -> { soort: 'ok', inhoud } | { soort: 'onbruikbaar' } | { soort: 'weg' }
  const bkVelden = new Map();
  const haalBk = async (bk, ronde) => {
    if (bronBks) {
      if (!bronBks.antwoorden.has(bk)) throw new Fout(`Het bronbestand van de beroepskwalificaties heeft geen antwoord voor ${bk}.`);
      return antwoordUitBron(bronBks.antwoorden.get(bk), 'beroepskwalificatie', bk);
    }
    return api.haalJson(adres(api.basis.BEROEPSKWALIFICATIES_API_BASE, 'beroepskwalificatie', bk), `${bk}${ronde === 2 ? ' (tweede ronde)' : ''}`, 'bk', { mag404: true });
  };
  const verwerkBk = (bk, json) => {
    const n = B.normaliseerBkDetail(json, bk);
    telVelden(bkVelden, n.velden);
    if (n.bk !== bk) {
      stopBijProblemen((n.problemen.length > 0 ? n.problemen : [`${bk}: het detail gaat over een andere versie.`]).map((p) => `P3: ${p}`), 'Het detail negeert de versie');
    }
    for (const w of n.waarschuwingen) waarschuw(w);
    if (n.inhoud === undefined) {
      bkUitkomsten.set(bk, { soort: 'onbruikbaar' });
      for (const p of n.problemen.slice(0, 5)) waarschuw(`Onbruikbaar: ${p}`);
      log(`${bk}: onbruikbaar (${n.problemen.length} ${n.problemen.length === 1 ? 'probleem' : 'problemen'}).`);
      return;
    }
    bkUitkomsten.set(bk, { soort: 'ok', inhoud: n.inhoud });
    log(`${bk}: ${n.inhoud.competenties.length} competenties.`);
  };
  const tweedeRondeBks = [];
  for (const bk of teVragenBks) {
    const a = await haalBk(bk, 1);
    if (a.status === 404) {
      rapport.voorbeeld404 ??= kort(a.tekst, 300);
      if (bronBks) {
        bkUitkomsten.set(bk, { soort: 'weg' });
        log(`${bk}: niet gevonden (404).`);
      } else {
        tweedeRondeBks.push(bk);
        log(`${bk}: 404; nog één poging in de tweede ronde.`);
      }
      continue;
    }
    verwerkBk(bk, a.json);
  }
  if (tweedeRondeBks.length > 0) {
    const voor = api.teller.perSoort.bk ?? 0;
    log(`Tweede ronde: ${tweedeRondeBks.length} BK-${tweedeRondeBks.length === 1 ? 'versie' : 'versies'} met een 404 nog één keer opvragen.`);
    try {
      for (const bk of tweedeRondeBks) {
        const a = await haalBk(bk, 2);
        if (a.status === 404) {
          bkUitkomsten.set(bk, { soort: 'weg' });
          log(`${bk}: twee keer 404, niet gevonden.`);
          continue;
        }
        waarschuw(`${bk}: eerst 404, bij de nieuwe poging wel een detail.`);
        verwerkBk(bk, a.json);
      }
    } finally {
      rapport.bks.tweedeRonde = { versies: tweedeRondeBks.length, verzoeken: (api.teller.perSoort.bk ?? 0) - voor };
    }
  }
  rapport.bks.veldInventaris = inventarisObject(bkVelden);
  const weg = teVragenBks.filter((bk) => bkUitkomsten.get(bk)?.soort === 'weg');
  const onbruikbaar = teVragenBks.filter((bk) => bkUitkomsten.get(bk)?.soort === 'onbruikbaar');
  rapport.bks.onbruikbaar = onbruikbaar;
  if (weg.length > grens(teVragenBks.length, P6_BKS)) {
    stopBijProblemen([`P6 (d): ${weg.length} van de ${teVragenBks.length} gevraagde BK-versies gaven twee keer 404 (${weg.slice(0, 10).join(', ')}${weg.length > 10 ? ', …' : ''}).`], 'Massaverlies');
  }
  if (onbruikbaar.length > grens(teVragenBks.length, P7_BKS)) {
    stopBijProblemen([`P7: ${onbruikbaar.length} van de ${teVragenBks.length} gevraagde BK-versies zijn onbruikbaar (${onbruikbaar.slice(0, 10).join(', ')}${onbruikbaar.length > 10 ? ', …' : ''}).`], 'Te veel onbruikbare beroepskwalificaties');
  }
  telCompetenties(bkUitkomsten);

  // 6. Samenvoegen met het bestaande (niets wissen) en de koppeling bouwen.
  const records = [];
  for (const o of [...matrix.onderdelen].sort((a, b) => a.nummer - b.nummer)) {
    const nr = o.nummer;
    const oud = oudeRecords.get(nr);
    const r = resultaten.get(nr);
    if (r === undefined) {
      records.push(ordenRecord(oud ? { ...oud, groep: o.groep } : { onderdeel: nr, groep: o.groep, status: 'nog-niet-opgehaald' }));
      continue;
    }
    if (r.status === 'niet-gevonden') {
      const rec = { onderdeel: nr, groep: o.groep, status: 'niet-gevonden' };
      if (Array.isArray(oud?.erkenningen)) Object.assign(rec, { opgehaald: oud.opgehaald, erkenningen: oud.erkenningen });
      rec.nietMeerInBron = oud?.nietMeerInBron ?? cfg.vandaag;
      records.push(ordenRecord(rec));
      continue;
    }
    // T6: gelijk zonder op de volgorde te letten → de oude erkenningen (en hun volgorde) blijven.
    const erkenningen = Array.isArray(oud?.erkenningen) && B.gelijkZonderVolgorde(oud.erkenningen, r.erkenningen) ? oud.erkenningen : r.erkenningen;
    const kandidaat = (opgehaald) => ordenRecord({ onderdeel: nr, groep: o.groep, status: 'opgehaald', opgehaald, erkenningen });
    const metOud = oud?.opgehaald !== undefined ? kandidaat(oud.opgehaald) : undefined;
    records.push(metOud !== undefined && JSON.stringify(metOud) === JSON.stringify(ordenRecord(oud)) ? metOud : kandidaat(cfg.nu));
    // Wat veranderde voor dit onderdeel (alleen voor het rapport).
    vergelijkBks(nr, oud, erkenningen, cfg.vandaag);
  }
  for (const nr of nietGevonden) {
    const oud = oudeRecords.get(nr);
    if (oud?.status !== 'niet-gevonden') waarschuw(`Onderdeel ${nr}: niet gevonden (404); ${Array.isArray(oud?.erkenningen) ? 'de laatst bekende koppeling blijft staan' : 'het record blijft staan'} met nietMeerInBron.`);
  }

  // P6 (a) en (b): massaverlies tegenover het bestaande bestand.
  if (bestaand.koppeling) {
    const voor = telKoppeling(bestaand.koppeling.onderdelen, cfg.vandaag);
    const na = telKoppeling(records, cfg.vandaag);
    const verlies = [];
    if (voor.onderdelen > 0 && na.onderdelen < voor.onderdelen * (1 - MAX_DALING)) {
      verlies.push(`P6 (a): het aantal onderdelen met een beroepskwalificatie in een erkenning van nu daalt van ${voor.onderdelen} naar ${na.onderdelen} (meer dan ${MAX_DALING * 100} %).`);
    }
    if (voor.versies > 0 && na.versies < voor.versies * (1 - MAX_DALING)) {
      verlies.push(`P6 (b): het aantal unieke gekoppelde BK-versies daalt van ${voor.versies} naar ${na.versies} (meer dan ${MAX_DALING * 100} %).`);
    }
    stopBijProblemen(verlies, 'Massaverlies');
  }

  // 7. Bouwen: eerst de BK-bestanden, dan de index, dan de koppeling.
  const teSchrijven = []; // { pad, tekst, soort }
  const oudeRegels = new Map((bestaand.index?.bks ?? []).map((r) => [r.bk, r]));
  const genoemd = new Set(records.flatMap((r) => (r.erkenningen ?? []).flatMap((e) => (e.bks ?? []).map((k) => k.bk))));
  const alleBks = [...new Set([...oudeRegels.keys(), ...bkUitkomsten.keys()])].sort(B.vergelijkBkVersie);
  const regels = [];
  const rb = rapport.bks;
  for (const bk of alleBks) {
    const u = bkUitkomsten.get(bk);
    const oudR = oudeRegels.get(bk);
    const oudB = bestaand.bestanden.get(bk);
    let bestand; // { json } van het bestand dat er na de run staat
    let vlag; // 'nietGevonden' | 'onbruikbaar' voor een regel zonder bestand
    if (u?.soort === 'ok') {
      const oudeInhoud = oudB ? inhoudVan(oudB.json) : undefined;
      const inhoud = oudeInhoud && B.gelijkZonderVolgorde(oudeInhoud, u.inhoud) ? oudeInhoud : u.inhoud;
      const gebouwd = bouwOfHoud((t) => bouwBkBestand(bk, inhoud, t, undefined).tekst, oudB?.tekst, oudB?.json.opgehaald, cfg.nu);
      bestand = { json: JSON.parse(gebouwd.tekst) };
      controleerGebouwd(B.valideerBkBestand(bestand.json, bk), `${BK_MAP}/${bk}.json`);
      if (gebouwd.veranderd) teSchrijven.push({ pad: path.join(cfg.uit, BK_MAP, `${bk}.json`), tekst: gebouwd.tekst, soort: 'bk' });
      if (!oudB) rb.nieuw.push(bk);
      else if (oudB.json.sha256 !== bestand.json.sha256) rb.inhoudVeranderd.push(bk);
      else rb.ongewijzigd++;
    } else if (u?.soort === 'weg') {
      if (oudB) {
        const nmib = oudB.json.nietMeerInBron ?? cfg.vandaag;
        const tekst = bouwBkBestand(bk, inhoudVan(oudB.json), oudB.json.opgehaald, nmib).tekst;
        bestand = { json: JSON.parse(tekst) };
        controleerGebouwd(B.valideerBkBestand(bestand.json, bk), `${BK_MAP}/${bk}.json`);
        if (tekst !== oudB.tekst) teSchrijven.push({ pad: path.join(cfg.uit, BK_MAP, `${bk}.json`), tekst, soort: 'bk' });
        rb.nietMeerInBron.push(bk);
        if (oudB.json.nietMeerInBron === undefined) waarschuw(`${bk}: twee keer 404; het laatst bekende bestand blijft staan met nietMeerInBron.`);
      } else {
        vlag = 'nietGevonden';
        rb.nietGevonden.push(bk);
      }
    } else if (u?.soort === 'onbruikbaar') {
      if (oudB) {
        bestand = { json: oudB.json };
        waarschuw(`${bk}: onbruikbaar; het laatst bekende bestand blijft ongewijzigd.`);
      } else vlag = 'onbruikbaar';
    } else if (oudB) {
      bestand = { json: oudB.json };
    } else {
      vlag = oudR?.nietGevonden === true ? 'nietGevonden' : 'onbruikbaar';
    }

    const delen = B.splitsBk(bk);
    const regel = { bk, nummer: delen.nummer, versie: delen.versie };
    if (bestand) {
      const k = bestand.json;
      Object.assign(regel, { titel: k.titel, vks: k.vks, status: k.status, aantal: k.aantal, sha256: k.sha256, opgehaald: k.opgehaald, bestand: B.bkBestandVan(bk), nietMeerInBron: k.nietMeerInBron });
    } else {
      regel[vlag] = true;
    }
    // laatstErkend: uit een volledige lijst; anders blijft de oude waarde.
    const laatstErkend = lijst.gebruikt ? lijst.laatstErkend.get(delen.nummer) : oudR?.laatstErkend;
    if (laatstErkend !== undefined) regel.laatstErkend = laatstErkend;
    if (!genoemd.has(bk)) {
      regel.nietMeerGekoppeld = oudR?.nietMeerGekoppeld ?? cfg.vandaag;
      if (oudR?.nietMeerGekoppeld === undefined) rb.nietMeerGekoppeld.push(bk);
    }
    if (!bestand) {
      // Een regel zonder bestand: "opgehaald" blijft als de versie niet gevraagd werd, of als de regel verder gelijk bleef.
      const metOud = oudR ? ordenRegel({ ...regel, opgehaald: oudR.opgehaald }) : undefined;
      regel.opgehaald = oudR && (u === undefined || JSON.stringify(metOud) === JSON.stringify(ordenRegel(oudR))) ? oudR.opgehaald : cfg.nu;
    }
    regels.push(ordenRegel(regel));
  }
  // Zachte controles op de lijst: nieuwere erkende versie, en gekoppelde versies die niet in de lijst staan.
  if (lijst.gebruikt) {
    for (const r of regels) {
      if (r.nietMeerGekoppeld !== undefined) continue;
      if (r.laatstErkend === undefined) rapport.lijst.nietInLijst.push(r.bk);
      else if (B.vergelijkBkVersie(r.laatstErkend, r.bk) > 0) rapport.lijst.nieuwereVersie.push({ bk: r.bk, laatstErkend: r.laatstErkend });
    }
  }
  const lijstTotaal = lijst.gebruikt ? lijst.totaal : bestaand.index?.lijstTotaal;
  const index = bouwOfHoud((t) => bouwIndexTekst(regels, t, lijstTotaal), bestaand.indexTekst, bestaand.index?.opgehaald, cfg.nu);
  controleerGebouwd(B.valideerBkIndex(JSON.parse(index.tekst)), INDEX_BESTAND);
  if (index.veranderd) teSchrijven.push({ pad: path.join(cfg.uit, INDEX_BESTAND), tekst: index.tekst, soort: 'index' });
  rapport.bestanden.index = bestaand.indexTekst === undefined ? 'nieuw' : index.veranderd ? 'gewijzigd' : 'ongewijzigd';

  const koppeling = bouwOfHoud((t) => bouwKoppelingTekst(records, t, matrix.sha256), bestaand.koppelingTekst, bestaand.koppeling?.opgehaald, cfg.nu);
  controleerGebouwd(B.valideerKoppelingBestand(JSON.parse(koppeling.tekst)), KOPPELING_BESTAND);
  if (koppeling.veranderd) teSchrijven.push({ pad: path.join(cfg.uit, KOPPELING_BESTAND), tekst: koppeling.tekst, soort: 'koppeling' });
  rapport.bestanden.koppeling = bestaand.koppelingTekst === undefined ? 'nieuw' : koppeling.veranderd ? 'gewijzigd' : 'ongewijzigd';
  // KP5: elke BK van een erkenning van nu of later staat in de index (interne controle).
  const inIndex = new Set(regels.map((r) => r.bk));
  const ontbreekt = [...new Set(records.flatMap((r) => {
    const b = bksOp(r.erkenningen, cfg.vandaag);
    return [...b.nu, ...b.toekomst];
  }))].filter((bk) => !inIndex.has(bk));
  stopBijProblemen(ontbreekt.map((bk) => `Interne controle: ${bk} hoort bij een erkenning van nu of later, maar staat niet in de index.`), 'De gebouwde index is onvolledig');

  // 8. De sleutel mag nergens in de gegevens zitten. Vervangen zou de gegevens wijzigen: dan liever niets schrijven.
  for (const { tekst } of teSchrijven) {
    if (bevatSleutel(tekst)) throw new Fout('De opgehaalde gegevens bevatten de API-sleutel. Er is niets geschreven.');
  }

  // 9. Eerst het rapport: lukt dat niet, dan is er nog niets geschreven (exit 1). Daarna de gegevens: eerst
  // bk/, dan de index, de koppeling als laatste.
  rapport.geschreven = { bestanden: teSchrijven.length, bytes: teSchrijven.reduce((som, t) => som + Buffer.byteLength(t.tekst, 'utf8'), 0) };
  rapport.omvang = omvangNa(cfg.uit, teSchrijven);
  werkTellersBij();
  schrijfRapport(rapportPad, rapport);
  const volgorde = { bk: 0, index: 1, koppeling: 2 };
  for (const t of [...teSchrijven].sort((a, b) => volgorde[a.soort] - volgorde[b.soort] || vergelijkTekst(a.pad, b.pad))) {
    fs.mkdirSync(path.dirname(t.pad), { recursive: true });
    fs.writeFileSync(t.pad, t.tekst, 'utf8');
  }

  log(`Koppeling: ${records.length} onderdelen (${rapport.bestanden.koppeling}); opgehaald ${opgehaaldNu.length}, niet gevonden ${nietGevonden.length}.`);
  log(`Index: ${regels.length} BK-versies (${rapport.bestanden.index}); nieuw ${rb.nieuw.length}, inhoud veranderd ${rb.inhoudVeranderd.length}${rb.inhoudVeranderd.length > 0 ? ` (${rb.inhoudVeranderd.join(', ')})` : ''}, niet meer in de bron ${rb.nietMeerInBron.length}, niet gevonden ${rb.nietGevonden.length}, onbruikbaar ${rb.onbruikbaar.length}.`);
  if (rapport.waarschuwingen.length > 0) log(`Waarschuwingen: ${rapport.waarschuwingen.length} (zie het rapport).`);
  log(`Verzoeken: ${rapport.verzoeken}, duur: ${rapport.duurSeconden} s. Geschreven: ${teSchrijven.length} ${teSchrijven.length === 1 ? 'bestand' : 'bestanden'}. Rapport: ${rapportPad}`);
  return 0;
}

/** Een gebouwd bestand dat zijn eigen validator niet haalt: exit 3 (interne controle). */
function controleerGebouwd(fouten, naam) {
  stopBijProblemen(fouten.map((f) => `Interne controle van ${naam}: ${f}`), `Het gebouwde bestand ${naam} klopt niet`);
}

/** Wat veranderde voor één opgehaald onderdeel tegenover het vorige record (BK's van nu). */
function vergelijkBks(nr, oud, erkenningen, vandaag) {
  const ro = rapport.onderdelen;
  const toen = Array.isArray(oud?.erkenningen) ? bksOp(oud.erkenningen, vandaag).nu : [];
  const nu = bksOp(erkenningen, vandaag).nu;
  const nummer = (bk) => B.splitsBk(bk).nummer;
  const toenNummers = new Set(toen.map(nummer));
  const nuNummers = new Set(nu.map(nummer));
  for (const bk of nu) {
    if (toen.includes(bk)) continue;
    if (toenNummers.has(nummer(bk))) ro.andereVersie.push({ onderdeel: nr, van: toen.filter((x) => nummer(x) === nummer(bk)).join(', '), naar: bk });
    else ro.nieuw.push({ onderdeel: nr, bk });
  }
  for (const bk of toen) if (!nu.includes(bk) && !nuNummers.has(nummer(bk))) ro.nietMeerGekoppeld.push({ onderdeel: nr, bk });
}

/** De zachte controles op de competenties (§ 23.5.6) en `versieOverlap` (T7). */
function telCompetenties(bkUitkomsten) {
  const c = rapport.bks.competenties;
  const kennis = new Map();
  const vaardig = new Map();
  const perNummer = new Map();
  for (const [bk, u] of bkUitkomsten) {
    if (u.soort !== 'ok') continue;
    const lijstC = u.inhoud.competenties;
    const nrs = lijstC.map((x) => x.nr).filter((n) => n !== undefined);
    for (const comp of lijstC) {
      c.totaal++;
      if (comp.nr === undefined) c.zonderNr++;
      else if (nrs.filter((n) => n === comp.nr).length > 1) c.dubbelNr++;
      const teksten = [comp.tekst, ...comp.kennis.map((t) => t.tekst), ...comp.vaardigheden.map((t) => t.tekst)];
      if (teksten.some((t) => B.bevatHtml(t))) c.metHtml++;
      for (const t of teksten) c.langsteTekst = Math.max(c.langsteTekst, t.length);
      for (const t of comp.kennis) kennis.set(t.type ?? '(geen)', (kennis.get(t.type ?? '(geen)') ?? 0) + 1);
      for (const t of comp.vaardigheden) vaardig.set(t.type ?? '(geen)', (vaardig.get(t.type ?? '(geen)') ?? 0) + 1);
    }
    const { nummer } = B.splitsBk(bk);
    let lijstV = perNummer.get(nummer);
    if (!lijstV) perNummer.set(nummer, (lijstV = []));
    lijstV.push({ bk, competenties: lijstC });
  }
  c.kennisTypes = inventarisObject(kennis);
  c.vaardigheidTypes = inventarisObject(vaardig);
  for (const [nummer, versies] of [...perNummer].sort((a, b) => vergelijkTekst(a[0], b[0]))) {
    if (versies.length < 2) continue;
    versies.sort((a, b) => B.vergelijkBkVersie(a.bk, b.bk));
    for (let i = 1; i < versies.length; i++) {
      const a = new Map(versies[i - 1].competenties.map((x) => [x.id, x.tekst]));
      const b = new Map(versies[i].competenties.map((x) => [x.id, x.tekst]));
      const gedeeld = [...a.keys()].filter((id) => b.has(id));
      rapport.bks.versieOverlap.push({
        nummer, van: versies[i - 1].bk, naar: versies[i].bk, codes: [a.size, b.size], gedeeld: gedeeld.length,
        aandeel: Math.round((gedeeld.length / Math.max(a.size, b.size, 1)) * 100) / 100,
        tekstenGelijk: gedeeld.length === 0 ? null : gedeeld.every((id) => a.get(id) === b.get(id)),
      });
    }
  }
}

/**
 * Fouten van `haalJson` op een pagina van de BK-lijst die de lijst alleen onvolledig maken (F3-B6): een
 * HTTP-fout of time-out die na de nieuwe pogingen blijft, een andere HTTP-status (ook 404), geen JSON of een
 * te groot antwoord. Al de rest blijft fout 1: 401 en 403 (de sleutel), een doorverwijzing, een adres op een
 * andere origin, en elke melding die hier niet staat (bij twijfel hard, zoals vóór deze regel).
 */
const ZACHTE_LIJSTFOUT = /^BK-lijst, pagina \d+(?: lukte niet na \d+ nieuwe pogingen \(|: de API antwoordde met HTTP \d+\.$|: het antwoord is geen geldige JSON\.$|: het antwoord is te groot[ .])/;

/**
 * De BK-lijst (stap 2): via de API pagina per pagina met `volgendeLink` (alleen dezelfde origin en
 * hetzelfde pad, hoogstens 100 pagina's; een adres dat al gevraagd werd, is een lus: fout 1), of uit
 * --bron-lijst. Een vorm die niet klopt, een aantal dat niet `meta.total_elements` is, of een HTTP-fout op
 * een pagina (ZACHTE_LIJSTFOUT) maakt de lijst onvolledig: een waarschuwing, en de lijst dient dan niet
 * (F3-B6): laatstErkend en lijstTotaal blijven zoals ze waren.
 */
async function haalLijst(cfg, lijst) {
  const staat = { paginas: 0, pad: undefined, totaal: undefined, items: [], eersten: new Set(), problemen: [], velden: new Map() };
  const verwerk = (pagina, nr) => {
    staat.paginas++;
    telVelden(staat.velden, B.veldenVan(pagina));
    const gevonden = B.lijstVanBkPagina(pagina);
    if ('fout' in gevonden) {
      staat.problemen.push(`pagina ${nr}: ${gevonden.fout} Bovenste sleutels: ${sleutelsVan(pagina)}.`);
      return false;
    }
    if (staat.pad === undefined) staat.pad = gevonden.pad;
    else if (gevonden.pad !== staat.pad) {
      staat.problemen.push(`pagina ${nr}: de lijst staat onder "${gevonden.pad}", op pagina 1 onder "${staat.pad}".`);
      return false;
    }
    const totaal = S.totaalVanPagina(pagina);
    if (totaal === undefined) staat.problemen.push(`pagina ${nr}: meta.total_elements ontbreekt.`);
    else if (staat.totaal === undefined) staat.totaal = totaal;
    else if (totaal !== staat.totaal) staat.problemen.push(`pagina ${nr}: het totaal veranderde tijdens het ophalen (${staat.totaal}, nu ${totaal}).`);
    if (gevonden.lijst.length > 0) {
      const eerste = M.canoniek(gevonden.lijst[0]);
      if (staat.eersten.has(eerste)) {
        staat.problemen.push(`pagina ${nr}: dezelfde eerste beroepskwalificatie als op een vorige pagina; het pagineren werkt niet zoals verwacht.`);
        return false;
      }
      staat.eersten.add(eerste);
    }
    staat.items.push(...gevonden.lijst);
    return true;
  };

  try {
    if (!cfg.lijstViaApi) {
      const json = leesJsonBestand(cfg.bronLijst, 'Het bronbestand van de BK-lijst');
      const paginas = Array.isArray(json) && !json.some((x) => isObject(x) && heeft(x, 'beroepskwalificatie_nr')) ? json : [json];
      for (let i = 0; i < paginas.length; i++) if (!verwerk(paginas[i], i + 1)) break;
    } else {
      let doel = new URL(adres(api.basis.BEROEPSKWALIFICATIES_API_BASE, 'beroepskwalificatie'));
      const lijstPad = doel.pathname;
      const gezien = new Set();
      for (let nr = 1; ; nr++) {
        if (nr > MAX_LIJST_PAGINAS) {
          staat.problemen.push(`na ${MAX_LIJST_PAGINAS} pagina's nog geen einde.`);
          break;
        }
        const sleutel = doel.toString();
        if (gezien.has(sleutel)) throw new Fout(`BK-lijst, pagina ${nr}: die pagina is al opgehaald (een lus in de paginering).`);
        gezien.add(sleutel);
        let json;
        try {
          ({ json } = await api.haalJson(sleutel, `BK-lijst, pagina ${nr}`, 'lijst'));
        } catch (e) {
          if (!(e instanceof Fout) || !ZACHTE_LIJSTFOUT.test(e.message)) throw e;
          staat.problemen.push(`pagina ${nr}: ${e.message}`);
          log(`${e.message} De BK-lijst is dus onvolledig.`);
          break;
        }
        const doorgaan = verwerk(json, nr);
        log(`BK-lijst, pagina ${nr}: ${staat.items.length} beroepskwalificaties tot nu (totaal volgens de API: ${staat.totaal ?? '?'}).`);
        if (!doorgaan) break;
        if (staat.totaal !== undefined && staat.items.length >= staat.totaal) break;
        const volgende = S.volgendeLink(json);
        if (volgende === undefined) break;
        let url;
        try {
          url = new URL(volgende, doel);
        } catch {
          throw new Fout(`BK-lijst, pagina ${nr}: de link naar de volgende pagina is geen geldig adres.`);
        }
        if (url.origin !== api.origin) {
          throw new Fout(`BK-lijst, pagina ${nr}: de volgende pagina staat op een andere origin (${kort(url.origin, 80)}). Het script volgt die link niet, want de sleutel zou meegaan.`);
        }
        if (url.pathname !== lijstPad || url.username !== '' || url.password !== '') {
          throw new Fout(`BK-lijst, pagina ${nr}: de volgende pagina staat op een ander pad (${kort(url.pathname, 120)}). Het script volgt alleen de pagina's van de lijst zelf.`);
        }
        url.hash = '';
        doel = url;
      }
    }
  } finally {
    rapport.lijst.paginas = staat.paginas;
    rapport.lijst.pad = staat.pad ?? null;
    rapport.lijst.totaal = staat.totaal ?? null;
    rapport.lijst.ontvangen = staat.items.length;
    rapport.lijst.veldInventaris = inventarisObject(staat.velden);
  }

  // De elementen: per beroepskwalificatie_nr de laatst erkende versie. Een probleem is hier een waarschuwing.
  let metProbleem = 0;
  for (const item of staat.items) {
    const n = B.normaliseerBkLijstItem(item);
    if (n.problemen.length > 0) {
      metProbleem++;
      for (const p of n.problemen) waarschuw(`BK-lijst: ${p}`);
    }
    if (n.nummer === undefined || n.laatstErkend === undefined) continue;
    const al = lijst.laatstErkend.get(n.nummer);
    if (al !== undefined && al !== n.laatstErkend) {
      waarschuw(`BK-lijst: ${n.nummer} staat er meer dan één keer, met een andere laatst erkende versie (${al} en ${n.laatstErkend}); de hoogste telt.`);
      if (B.vergelijkBkVersie(n.laatstErkend, al) < 0) continue;
    }
    lijst.laatstErkend.set(n.nummer, n.laatstErkend);
  }
  const volledig = staat.problemen.length === 0 && staat.totaal !== undefined && staat.items.length === staat.totaal;
  rapport.lijst.volledig = volledig;
  if (!volledig) {
    const reden = staat.problemen.length > 0 ? staat.problemen.slice(0, 3).join(' ') : `${staat.items.length} ontvangen, meta.total_elements zegt ${staat.totaal ?? 'niets'}.`;
    waarschuw(`De BK-lijst is onvolledig (${reden}); ze wordt niet gebruikt: laatstErkend en lijstTotaal blijven zoals ze waren.`);
    lijst.laatstErkend.clear();
    log('BK-lijst: onvolledig, niet gebruikt (zie de waarschuwingen in het rapport).');
    return;
  }
  lijst.gebruikt = true;
  lijst.totaal = staat.totaal;
  log(`BK-lijst: ${staat.items.length} beroepskwalificaties in ${staat.paginas} ${staat.paginas === 1 ? 'pagina' : "pagina's"}${metProbleem > 0 ? ` (${metProbleem} met een probleem)` : ''}.`);
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
