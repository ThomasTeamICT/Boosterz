#!/usr/bin/env node
// Maakt een NAGEBOOTSTE koppeling richting → minimumdoelen voor de tests: tests/fixtures/structuur/api/koppeling.json.
// Dit is GEEN officiële koppeling. De echte koppeling komt alleen uit de Onderwijsdoelen-API (filter
// structuuronderdeel_groep_nummer) via tools/leerplannen/haal-studierichtingen.mjs. Dit bestand bootst
// alleen de vorm van dat antwoord na, zodat het ophaalscript, de datatest en de schermen te testen zijn
// vóór de eerste echte run (werkwijze regel 11, docs/STUDIERICHTINGEN.md § 3.6).
//
//   node tools/leerplannen/maak-nagebootste-koppeling.mjs [--matrix <bestand>] [--minimumdoelen <map>] [--uit <bestand>]
//
// Standaard: --matrix tests/fixtures/structuur/api/matrix.json, --minimumdoelen public/leerplannen/minimumdoelen
// (alleen lezen), --uit tests/fixtures/structuur/api/koppeling.json.
//
// De vaste regel van de nabootsing, per groep uit de matrix:
// - 1ste graad, 7de jaar, BuSO en elke andere groep die niet "gewoon" is: {"status": 404}, zoals de API
//   (verkenning run 5: G-0307 en G-0311 geven 404; voor het 7de jaar en BuSO is het onbekend).
// - Een gewone groep van de 2de of 3de graad krijgt:
//   1. deelsets: in elke set (alle versies, gewoon en BuSO) de doelen die het ordeningskader aan de groep
//      geeft (extra.titels[*].ordeningskader.studierichtingen[*].structuuronderdeel_groep_nummer);
//   2. hele sets: de geldige sets van het gewoon secundair van dezelfde graad die de finaliteit van de groep
//      in de naam noemen ("Finaliteit doorstroom", "Dubbele finaliteit", "Finaliteit arbeidsmarkt") en
//      geen ordeningskader hebben; in de 3de graad ook de geldige eindtermen van het "3de leerjaar" (zo is
//      de regel R4 te testen; of de echte API die meegeeft, bevestigt de eerste echte run);
//   3. van elke hele set de geldige BuSO-kopie (dezelfde naam met "Buitengewoon" en "Opleidingsvorm 4");
//   4. één oude versie: van de eerste hele set (laagste nummer) met een oudere versie, de oudste daarvan.
// - De records hebben de vorm van de Onderwijsdoelen-API (Hydra: gegevens.member, gegevens.totalItems; per
//   doel @id, code, omschrijving, onderwijsdoel_type en onderwijsdoelenset met onderwijsstructuur), in
//   pagina's van 500. De omschrijving is ingekort: het ophaalscript gebruikt alleen set en nummer.
//
// Vingerafdruk. Het bestand krijgt "vingerafdrukMinimumdoelen": de sha256 van canoniek(…) van de sets in
// minimumdoelen/index.json, gesorteerd op id, met alleen de velden waarvan de fixtures afhangen
// (VINGERAFDRUK_VELDEN; de inhoud van een set zit in zijn sha256). De fixturetests in
// src/lib/studierichtingen.script.test.ts rekenen dezelfde vingerafdruk uit op de huidige index en slaan
// over als ze verschilt: na een maandelijkse update van de minimumdoelen blokkeren ze de update-PR dan niet.
// Maak de fixtures daarna opnieuw (dit script, dan haal-studierichtingen.mjs naar tests/fixtures/structuur/uit).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const S = await import('../../src/lib/studierichtingen.ts');
const M = await import('../../src/lib/minimumdoelen.ts');

const NAGEBOOTST = 'NAGEBOOTSTE koppeling voor tests, gemaakt door tools/leerplannen/maak-nagebootste-koppeling.mjs uit de setbestanden en hun ordeningskader. Dit is GEEN officiële koppeling van de Onderwijsdoelen-API.';
/** Het aantal doelen zonder filter, zoals de echte API het gaf op 9 oktober 2026 (verkenning run 5). */
const TOTAAL_ZONDER_FILTER = 24019;
const RIJEN_PER_PAGINA = 500;
const MAX_OMSCHRIJVING = 60;
const FINALITEIT_IN_NAAM = { DO: 'finaliteit doorstroom', DU: 'dubbele finaliteit', A: 'finaliteit arbeidsmarkt' };
const GRAAD_NAAM = { 2: '2de graad', 3: '3de graad' };
/** De velden van een set in de index waarvan de fixtures afhangen. Dezelfde lijst staat in de test. */
const VINGERAFDRUK_VELDEN = ['id', 'sha256', 'aantal', 'geldigheid', 'graad', 'stroom', 'leerjaar', 'naam', 'korteNaam', 'versie'];

/** sha256 van canoniek(de sets van de index, gesorteerd op id, met alleen VINGERAFDRUK_VELDEN). */
function vingerafdruk(index) {
  const sets = index.sets
    .map((s) => Object.fromEntries(VINGERAFDRUK_VELDEN.filter((v) => s[v] !== undefined).map((v) => [v, s[v]])))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return crypto.createHash('sha256').update(M.canoniek(sets), 'utf8').digest('hex');
}

function leesOpties(argv) {
  const namen = { '--matrix': 'matrix', '--minimumdoelen': 'minimumdoelen', '--uit': 'uit' };
  const opties = {};
  for (let i = 0; i < argv.length; i++) {
    const naam = namen[argv[i]];
    if (!naam || argv[i + 1] === undefined) {
      console.error(`Onbekende optie of ontbrekende waarde: ${argv[i]}. Opties: --matrix, --minimumdoelen, --uit.`);
      process.exit(1);
    }
    opties[naam] = argv[++i];
  }
  return {
    matrix: path.resolve(opties.matrix ?? path.join(root, 'tests', 'fixtures', 'structuur', 'api', 'matrix.json')),
    minimumdoelen: path.resolve(opties.minimumdoelen ?? path.join(root, 'public', 'leerplannen', 'minimumdoelen')),
    uit: path.resolve(opties.uit ?? path.join(root, 'tests', 'fixtures', 'structuur', 'api', 'koppeling.json')),
  };
}

const leesJson = (pad) => JSON.parse(fs.readFileSync(pad, 'utf8'));

/** Naam zonder "Buitengewoon", "Opleidingsvorm 4" en dubbele spaties, in kleine letters: zo vind je de BuSO-kopie. */
function kernNaam(naam) {
  return naam.toLowerCase().replace(/^buitengewoon\s+/, '').replace(/\s+opleidingsvorm 4\b/, '').replace(/\s+/g, ' ').trim();
}

const isBuso = (naam) => naam.trim().toLowerCase().startsWith('buitengewoon');
const isSo = (naam) => naam.trim().toLowerCase().startsWith('secundair onderwijs');

function groepenUitMatrix(pad) {
  const json = leesJson(pad);
  const paginas = Array.isArray(json) ? json : [json];
  const groepen = [];
  for (const pagina of paginas) {
    const gevonden = S.lijstVanPagina(pagina);
    if ('fout' in gevonden) throw new Error(`${pad}: ${gevonden.fout}`);
    for (const raw of gevonden.lijst) {
      const n = S.normaliseerGroep(raw);
      if (n.problemen.length > 0 || n.groep === undefined) throw new Error(`${pad}: ${n.problemen.join(' ')}`);
      groepen.push({ groep: n.groep, soort: S.soortVanGroep(n.groep, n.onderdelen) });
    }
  }
  return groepen.sort((a, b) => S.vergelijkGroepnummer(a.groep.nummer, b.groep.nummer));
}

function leesSets(map) {
  const index = leesJson(path.join(map, 'index.json'));
  const sets = [];
  for (const ingang of index.sets) {
    const bestand = leesJson(path.join(map, ingang.bestand));
    const tags = bestand.doelen.map((d) => S.groepnummersVanDoel(d));
    sets.push({ ingang, kop: bestand.set, doelen: bestand.doelen, tags, heeftTags: tags.some((t) => t.length > 0) });
  }
  return { sets: sets.sort((a, b) => S.vergelijkNatuurlijk(a.ingang.id, b.ingang.id)), vingerafdruk: vingerafdruk(index) };
}

/** Eén doel in de vorm van de Onderwijsdoelen-API (zie minimumdoelen.ts: setVan en normaliseerRecord). */
function record(doel, set) {
  const kop = set.kop;
  const naam = kop.naam;
  const apiId = /^\d+$/.test(kop.apiId ?? '') ? Number(kop.apiId) : Number(set.ingang.id.replace(/^ODS_/, ''));
  const structuur = { onderwijsniveau: 'Secundair onderwijs', onderwijssoort: isBuso(naam) ? 'Buitengewoon' : '' };
  for (const veld of ['graad', 'stroom', 'leerjaar']) {
    const waarde = doel[veld] ?? kop[veld];
    if (waarde !== undefined) structuur[veld] = waarde;
  }
  const odsSet = { onderwijsdoelenset_id: apiId, onderwijsdoelenset: naam };
  if (kop.korteNaam !== undefined) odsSet.korte_naam = kop.korteNaam;
  if (kop.versie !== undefined) odsSet.versie = kop.versie;
  odsSet.onderwijsstructuur = structuur;
  const tekst = String(doel.tekst);
  const uit = {
    '@id': /^\d{1,15}$/.test(doel.id) ? Number(doel.id) : doel.id,
    code: doel.code,
    omschrijving: tekst.length > MAX_OMSCHRIJVING ? `${tekst.slice(0, MAX_OMSCHRIJVING - 1)}…` : tekst,
  };
  if (doel.type !== undefined) uit.onderwijsdoel_type = doel.type;
  uit.onderwijsdoelenset = odsSet;
  return uit;
}

/** De sets en doelen die de nabootsing aan een gewone groep van de 2de of 3de graad geeft. */
function koppelingVan(groep, sets) {
  const graadNaam = GRAAD_NAAM[groep.graad];
  const finaliteit = FINALITEIT_IN_NAAM[groep.finaliteit];
  const gekozen = new Map(); // set-id -> { set, doelen }
  // 1. deelsets uit het ordeningskader
  for (const set of sets) {
    const doelen = set.doelen.filter((_, i) => set.tags[i].includes(groep.nummer));
    if (doelen.length > 0) gekozen.set(set.ingang.id, { set, doelen, soort: 'deel' });
  }
  // 2. hele sets volgens de vaste regel
  const heel = sets.filter((s) => {
    const naam = s.ingang.naam.toLowerCase();
    if (s.heeftTags || s.ingang.geldigheid !== 'Geldig' || s.ingang.graad !== graadNaam || !isSo(s.ingang.naam)) return false;
    if (/specifieke eindtermen\s*$|cesuurdoelen\s*$/.test(naam)) return false;
    if (s.ingang.leerjaar === '3de leerjaar') return groep.graad === '3' && /- eindtermen\s*$/.test(naam);
    return finaliteit !== undefined && naam.includes(finaliteit);
  });
  for (const set of heel) gekozen.set(set.ingang.id, { set, doelen: set.doelen, soort: 'heel' });
  // 3. de BuSO-kopie van elke hele set
  for (const set of heel) {
    const kopie = sets.find((s) => s.ingang.geldigheid === 'Geldig' && s.ingang.graad === graadNaam && isBuso(s.ingang.naam) && !s.heeftTags && kernNaam(s.ingang.naam) === kernNaam(set.ingang.naam));
    if (kopie) gekozen.set(kopie.ingang.id, { set: kopie, doelen: kopie.doelen, soort: 'buso-kopie' });
  }
  // 4. één oude versie
  for (const set of heel) {
    const oud = sets.find((s) => s.ingang.geldigheid !== 'Geldig' && s.ingang.graad === graadNaam && isSo(s.ingang.naam) && !s.heeftTags && kernNaam(s.ingang.naam) === kernNaam(set.ingang.naam));
    if (oud) {
      gekozen.set(oud.ingang.id, { set: oud, doelen: oud.doelen, soort: 'oude versie' });
      break;
    }
  }
  return [...gekozen.values()].sort((a, b) => S.vergelijkNatuurlijk(a.set.ingang.id, b.set.ingang.id));
}

function paginasVan(records) {
  const paginas = [];
  for (let i = 0; i < records.length; i += RIJEN_PER_PAGINA) paginas.push(records.slice(i, i + RIJEN_PER_PAGINA));
  return paginas;
}

/** JSON met één doel per regel, zodat een verschil in git leesbaar blijft. */
function schrijfTekst(groepen, afdruk) {
  const delen = [];
  for (const [nummer, waarde] of groepen) {
    if (waarde.status === 404) {
      delen.push(`    ${JSON.stringify(nummer)}: {"status": 404}`);
      continue;
    }
    const paginas = waarde.paginas.map((member) => {
      const regels = member.map((r) => JSON.stringify(r)).join(',\n');
      return `      {"gegevens": {"totalItems": ${waarde.totaal}, "member": [\n${regels}\n      ]}}`;
    });
    delen.push(`    ${JSON.stringify(nummer)}: [\n${paginas.join(',\n')}\n    ]`);
  }
  return `{\n  "nagebootst": ${JSON.stringify(NAGEBOOTST)},\n  "vingerafdrukMinimumdoelen": ${JSON.stringify(afdruk)},\n  "totaal": ${TOTAAL_ZONDER_FILTER},\n  "groepen": {\n${delen.join(',\n')}\n  }\n}\n`;
}

const opties = leesOpties(process.argv.slice(2));
const groepen = groepenUitMatrix(opties.matrix);
const { sets, vingerafdruk: afdruk } = leesSets(opties.minimumdoelen);
const uit = new Map();
console.log(`NAGEBOOTSTE koppeling (geen officiële koppeling) voor ${groepen.length} groepen:`);
for (const { groep, soort } of groepen) {
  if (soort !== 'gewoon' || (groep.graad !== '2' && groep.graad !== '3')) {
    uit.set(groep.nummer, { status: 404 });
    console.log(`- ${groep.nummer} ${groep.titel}: 404 (${groep.graad === '1' ? '1ste graad' : soort})`);
    continue;
  }
  const gekozen = koppelingVan(groep, sets);
  const records = gekozen.flatMap(({ set, doelen }) => doelen.map((d) => record(d, set)));
  uit.set(groep.nummer, { totaal: records.length, paginas: paginasVan(records) });
  const telling = {};
  for (const g of gekozen) telling[g.soort] = (telling[g.soort] ?? 0) + 1;
  console.log(`- ${groep.nummer} ${groep.titel}: ${records.length} doelen in ${gekozen.length} sets (${Object.entries(telling).map(([k, v]) => `${v} ${k}`).join(', ')})`);
}
const tekst = schrijfTekst(uit, afdruk);
JSON.parse(tekst); // de uitvoer is geldige JSON
fs.mkdirSync(path.dirname(opties.uit), { recursive: true });
fs.writeFileSync(opties.uit, tekst, 'utf8');
console.log(`Vingerafdruk van minimumdoelen/index.json (${sets.length} sets): ${afdruk}.`);
console.log(`Geschreven: ${opties.uit} (${tekst.length} tekens). Let op: NAGEBOOTST, geen officiële koppeling.`);
