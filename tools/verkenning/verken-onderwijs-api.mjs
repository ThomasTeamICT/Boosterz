#!/usr/bin/env node
// Eenmalige verkenning van de API's en open bronnen van Onderwijs en Vorming (oktober 2026).
//
// Vraag van de eigenaar: kunnen we de geldende matrix van alle studierichtingen van het secundair
// onderwijs als data ophalen, en wat zit er verder in de API's van Onderwijs? Zie docs/LEERPLANNEN.md.
//
// Zes standen, elk in een aparte stap van de workflow .github/workflows/verken-onderwijs-api.yml:
//   --met-sleutel  proefoproepen naar onderwijs.api.vlaanderen.be met de sleutel uit de omgeving
//                  (ONDERWIJSDOELEN_API_KEY). Alleen ingebouwde Node-modules, geen pakketten.
//   --publiek      publieke bronnen zonder sleutel: het API-portaal, de technische ontwerpen (pdf),
//                  de export "aanbod-so", omzendbrief SO 37, en de scripts van officiële webapps
//                  (om te zien welke officiële API-adressen ze gebruiken). Mag pdfjs-dist gebruiken.
//   --verslag      voegt beide delen samen tot één verslag (markdown op stdout en in de samenvatting).
//   --matrix       (ronde 3, met sleutel) alleen de matrix: één regel per studierichting uit
//                  /structuuronderdeelgroep, de filters van de doelen-API en de aantallen van het aanbod.
//   --koppeling    (ronde 4, met sleutel) per studierichting welke doelensets de filter
//                  studierichting=<naam> geeft, en of dat volledige sets zijn.
//   --parameters   (ronde 3, zonder sleutel) de parameternamen uit de API-clients van de webapps.
//
// Veiligheid:
//   - de sleutel gaat alleen in de kop x-api-key naar de host onderwijs.api.vlaanderen.be, nooit
//     naar een andere host, en doorverwijzingen worden niet gevolgd (redirect: 'manual');
//   - geen kopregels in het verslag; van elk antwoord alleen status, soort, veldnamen, aantallen en
//     hoogstens twee ingekorte voorbeelden;
//   - alle tekst uit een antwoord wordt ontdaan van stuurtekens en afgekapt.

import fs from 'node:fs';
import path from 'node:path';

const UIT = path.resolve(process.env.VERKENNING_UIT || 'tools/verkenning/rapport');
const API_HOST = 'onderwijs.api.vlaanderen.be';
const API = `https://${API_HOST}`;
const WACHT_MS = 400;
const TIMEOUT_MS = 30000;
const MAX_TEKST = 8 * 1024 * 1024;

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

// Sleutels die een webapp zelf in haar scripts meegeeft (bv. api_key: '\u2026' in env.js) komen nooit in
// het logboek, ook niet als de overheid ze publiek meelevert. Ronde 2 zette er twee in het logboek;
// sindsdien gaat alle tekst hierlangs. Ook lange reeksen van letters \u00e9n cijfers (sleutelvorm) gaan weg.
const verberg = (t) =>
  t
    .replace(/((?:api[_-]?key|apikey|client[_-]?token|token|secret|password|wachtwoord)["']?\s*[:=]\s*["'`])[^"'`]*/gi, '$1<verborgen>')
    .replace(/(?<![A-Za-z0-9])(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{24,}(?![A-Za-z0-9])/g, '<verborgen>');
const schoon = (t, n = 200) =>
  verberg(String(t ?? '')).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// ── Vorm van een JSON-antwoord ──────────────────────────────────────────────

/** Alle paden met hun soorten, bv. "gegevens.member[].code": "string". Arrays als "[]". */
function velden(waarde, prefix = '', uit = new Map(), diepte = 0) {
  if (diepte > 8 || uit.size > 400) return uit;
  const soort = Array.isArray(waarde) ? 'array' : waarde === null ? 'null' : typeof waarde;
  if (prefix) uit.set(prefix, new Set([...(uit.get(prefix) || []), soort]));
  if (Array.isArray(waarde)) {
    for (const x of waarde.slice(0, 50)) velden(x, `${prefix}[]`, uit, diepte + 1);
  } else if (waarde && typeof waarde === 'object') {
    for (const [k, v] of Object.entries(waarde)) velden(v, prefix ? `${prefix}.${k}` : k, uit, diepte + 1);
  }
  return uit;
}

/** Ingekorte kopie: strings op 200 tekens, arrays op 2 elementen, diepte 6. */
function inkort(waarde, diepte = 0) {
  if (diepte > 6) return '…';
  if (typeof waarde === 'string') return schoon(waarde, 200);
  if (Array.isArray(waarde)) {
    const kort = waarde.slice(0, 2).map((x) => inkort(x, diepte + 1));
    if (waarde.length > 2) kort.push(`… (${waarde.length} in totaal)`);
    return kort;
  }
  if (waarde && typeof waarde === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(waarde)) o[schoon(k, 80)] = inkort(v, diepte + 1);
    return o;
  }
  return waarde;
}

/** De eerste lijst van objecten in het antwoord (bv. gegevens.member) en een totaal als dat er staat. */
function lijstEnTotaal(waarde) {
  let lijst = null;
  let lijstPad = null;
  let totaal = null;
  const zoek = (v, pad, diepte) => {
    if (diepte > 5 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      const objecten = v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x));
      const beter = !lijst || /member|items|resultat|gegevens|data/i.test(pad) && !/member|items|resultat|gegevens|data/i.test(lijstPad) || (!/@context/.test(pad) && /@context/.test(lijstPad));
      if (objecten && beter && !/@context|mapping/.test(pad)) {
        lijst = v;
        lijstPad = pad || '(wortel)';
      }
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (totaal === null && /^(totalItems|total|totaal|aantal|count|totalCount|total_count)$/i.test(k) && typeof x === 'number') {
        totaal = { pad: pad ? `${pad}.${k}` : k, waarde: x };
      }
      zoek(x, pad ? `${pad}.${k}` : k, diepte + 1);
    }
  };
  zoek(waarde, '', 0);
  return { lijst, lijstPad, totaal };
}

/** Alle URL's op de API-host die in een antwoord staan (links in HAL, href, next, …). */
function apiLinks(waarde, uit = new Set()) {
  if (typeof waarde === 'string') {
    for (const m of waarde.matchAll(/https?:\/\/onderwijs\.api\.vlaanderen\.be\/[^\s"'<>]*/g)) uit.add(m[0]);
  } else if (Array.isArray(waarde)) {
    for (const x of waarde.slice(0, 200)) apiLinks(x, uit);
  } else if (waarde && typeof waarde === 'object') {
    for (const v of Object.values(waarde)) apiLinks(v, uit);
  }
  return uit;
}

async function leesTekst(antwoord) {
  const buf = Buffer.from(await antwoord.arrayBuffer());
  return buf.subarray(0, MAX_TEKST).toString('utf8');
}

/** Eén verzoek; de sleutel alleen voor de API-host. Geeft een beschrijving zonder kopregels. */
async function verzoek(url, { sleutel = null, accept = 'application/json, text/plain;q=0.9, */*;q=0.5', ruw = false } = {}) {
  const u = new URL(url);
  const headers = { accept, 'user-agent': 'Boosterz-verkenning (onderwijsplatform; contact via GitHub ThomasTeamICT/Boosterz)' };
  if (sleutel) {
    if (u.host !== API_HOST || u.protocol !== 'https:') throw new Error(`sleutel geweigerd voor ${u.host}`);
    headers['x-api-key'] = sleutel;
  }
  const r = { url: `${u.origin}${u.pathname}${u.search}`, status: null, soort: null, grootte: null };
  try {
    const antwoord = await fetch(u, { headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    r.status = antwoord.status;
    r.soort = schoon(antwoord.headers.get('content-type') || '', 80);
    if (antwoord.status >= 300 && antwoord.status < 400) {
      const naar = antwoord.headers.get('location');
      try {
        const n = new URL(naar, u);
        r.doorverwijzing = `${n.origin}${n.pathname}`;
      } catch {
        r.doorverwijzing = '(onleesbaar)';
      }
      await antwoord.body?.cancel();
      return r;
    }
    if (ruw) {
      r.buffer = Buffer.from(await antwoord.arrayBuffer());
      r.grootte = r.buffer.length;
      return r;
    }
    const tekst = await leesTekst(antwoord);
    r.grootte = tekst.length;
    r.tekst = tekst;
    return r;
  } catch (e) {
    const oorzaak = e && e.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : '';
    r.fout = schoon((e && e.message ? e.message : e) + oorzaak, 200);
    return r;
  }
}

/** Beschrijving van een JSON- of tekstantwoord, zonder de volledige inhoud. */
function beschrijf(r) {
  const uit = { url: r.url, status: r.status, soort: r.soort, grootte: r.grootte };
  if (r.fout) uit.fout = r.fout;
  if (r.doorverwijzing) uit.doorverwijzing = r.doorverwijzing;
  if (r.tekst == null) return uit;
  let json = null;
  try {
    json = JSON.parse(r.tekst);
  } catch {
    /* geen JSON */
  }
  if (json === null) {
    uit.begin = schoon(r.tekst, 400);
    return uit;
  }
  const { lijst, lijstPad, totaal } = lijstEnTotaal(json);
  uit.wortel = Array.isArray(json) ? `array(${json.length})` : json && typeof json === 'object' ? Object.keys(json).slice(0, 30) : typeof json;
  if (lijst) uit.lijst = { pad: lijstPad, lengte: lijst.length };
  if (totaal) uit.totaal = totaal;
  uit.velden = Object.fromEntries([...velden(json)].slice(0, 250).map(([k, s]) => [k, [...s].join('|')]));
  uit.voorbeelden = lijst ? lijst.slice(0, 2).map((x) => inkort(x)) : [inkort(json)];
  uit.links = [...apiLinks(json)].slice(0, 30);
  // Hydra-sjabloon met de toegelaten parameters (de doelen-API geeft dat mee).
  const sjabloon = json && typeof json === 'object' && json.parameters && typeof json.parameters === 'object' ? json.parameters : null;
  if (sjabloon) {
    uit.parameters = {
      template: schoon(sjabloon.template, 400),
      mapping: Array.isArray(sjabloon.mapping) ? sjabloon.mapping.map((m) => ({ variable: schoon(m.variable, 80), property: schoon(m.property, 120), required: m.required })) : null,
    };
  }
  return uit;
}

// ── Stand 1: met sleutel ────────────────────────────────────────────────────

// Ronde 2 (na de eerste run van 9 oktober 2026): de adressen uit de scripts van de app
// Opleidingsinhouden (kwalificaties-en-curriculum/…), de filters van de doelen-API, en nog enkele
// kandidaten voor het onderwijsaanbod SO. Ronde 1 vond: doelen-API filtert op "studierichting";
// alle geraden adressen voor aanbod, instellingen en structuuronderdelen gaven 404.
const KC = '/kwalificaties-en-curriculum';
const PROEVEN_MET_SLEUTEL = [
  ['doelen: twee doelen (met parameters)', '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=2'],
  ['doelen: filter studierichting', '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=2&studierichting=Humane%20wetenschappen'],
  ['structuuronderdelen: basis', `${KC}/structuuronderdelen/v2`],
  ['structuuronderdelen: structuuronderdeel', `${KC}/structuuronderdelen/v2/structuuronderdeel`],
  ['structuuronderdelen: structuuronderdeelgroep', `${KC}/structuuronderdelen/v2/structuuronderdeelgroep`],
  ['structuuronderdelen: structuuronderdeel_detail', `${KC}/structuuronderdelen/v2/structuuronderdeel_detail`],
  ['beroepskwalificaties: beroepskwalificatie', `${KC}/beroepskwalificaties/v2/beroepskwalificatie`],
  ['trajecten: opleidingstraject', `${KC}/trajecten/v1/opleidingstraject`],
  ['app-opleidingsinhouden: basis', '/app-opleidingsinhouden/v1'],
  ['aanbod SO: met streepje', '/instellingsgegevens/onderwijsaanbod-so/v2'],
  ['aanbod SO: administratievegroep', '/instellingsgegevens/onderwijsaanbod_so/v2/administratievegroep'],
  ['aanbod SO: aanbod', '/instellingsgegevens/onderwijsaanbod_so/v2/aanbod'],
  ['aanbod SO: onderwijsaanbod', '/instellingsgegevens/onderwijsaanbod_so/v2/onderwijsaanbod'],
  ['aanbod SO: theoretisch_aanbod', '/instellingsgegevens/onderwijsaanbod_so/v2/theoretisch_aanbod'],
  ['aanbod SO: ingericht_aanbod', '/instellingsgegevens/onderwijsaanbod_so/v2/ingericht_aanbod'],
  ['instellingen: instelling', '/instellingsgegevens/instelling/v2/instelling'],
  ['instellingen: instellingen', '/instellingsgegevens/instelling/v2/instellingen'],
];

// Lijsten die we volledig doorbladeren en regel per regel in het logboek zetten (publieke gegevens).
const DOORBLADEREN = [
  ['structuuronderdeel', `${KC}/structuuronderdelen/v2/structuuronderdeel`],
  ['structuuronderdeelgroep', `${KC}/structuuronderdelen/v2/structuuronderdeelgroep`],
  ['opleidingstraject', `${KC}/trajecten/v1/opleidingstraject`],
  ['beroepskwalificatie', `${KC}/beroepskwalificaties/v2/beroepskwalificatie`],
];

/** Volgt "next"-links (of verhoogt paginanr) en verzamelt alle elementen van een lijst. */
async function doorblader(naam, startUrl, sleutel, maxPaginas = 80) {
  const items = [];
  let url = startUrl;
  let paginas = 0;
  let totaal = null;
  let eerste = null;
  const gehad = new Set();
  while (url && paginas < maxPaginas && !gehad.has(url)) {
    gehad.add(url);
    const r = await verzoek(url, { sleutel });
    paginas++;
    if (r.status !== 200 || !r.tekst) {
      if (!eerste) eerste = { status: r.status, fout: r.fout, begin: r.tekst ? schoon(r.tekst, 300) : null };
      break;
    }
    let json;
    try {
      json = JSON.parse(r.tekst);
    } catch {
      eerste = eerste || { status: r.status, begin: schoon(r.tekst, 300) };
      break;
    }
    if (!eerste) eerste = { status: 200, beschrijving: beschrijf(r) };
    const { lijst, totaal: t } = lijstEnTotaal(json);
    if (t && totaal === null) totaal = t.waarde;
    if (!lijst || lijst.length === 0) break;
    items.push(...lijst);
    // volgende pagina: een veld "next" met een URL, anders paginanr ophogen als dat in de URL staat
    let volgende = null;
    const zoekNext = (v, d) => {
      if (volgende || d > 4 || !v || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) {
        if (/^(next|volgende)$/i.test(k) && typeof x === 'string' && x.startsWith('http')) volgende = x;
        else if (/^(next|volgende)$/i.test(k) && x && typeof x.href === 'string') volgende = x.href;
        else zoekNext(x, d + 1);
      }
    };
    zoekNext(json, 0);
    if (volgende) {
      try {
        const v = new URL(volgende.replace(/ /g, '%20'));
        url = v.host === API_HOST ? v.toString() : null;
      } catch {
        url = null;
      }
    } else if (totaal !== null && items.length < totaal) {
      const u = new URL(url);
      const sleutelNaam = ['paginanr', 'page', 'pagina'].find((k) => u.searchParams.has(k));
      if (sleutelNaam) {
        u.searchParams.set(sleutelNaam, String(Number(u.searchParams.get(sleutelNaam)) + 1));
        url = u.toString();
      } else {
        url = null;
      }
    } else {
      url = null;
    }
    await wacht(WACHT_MS);
  }
  return { naam, startUrl, paginas, totaal, aantal: items.length, eerste, items };
}

/** Eén regel per element: alleen eenvoudige velden en kleine objecten, ingekort. */
function regelVan(item) {
  const plat = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) plat[k] = typeof v === 'string' ? schoon(v, 140) : v;
    else if (Array.isArray(v)) plat[k] = v.length <= 6 && v.every((x) => x === null || typeof x !== 'object') ? v.map((x) => (typeof x === 'string' ? schoon(x, 60) : x)) : `[${v.length}]`;
    else if (typeof v === 'object') {
      const klein = {};
      for (const [k2, v2] of Object.entries(v).slice(0, 8)) if (v2 === null || typeof v2 !== 'object') klein[k2] = typeof v2 === 'string' ? schoon(v2, 80) : v2;
      plat[k] = klein;
    }
  }
  return JSON.stringify(plat);
}

async function metSleutel() {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  if (!sleutel) throw new Error('ONDERWIJSDOELEN_API_KEY ontbreekt in de omgeving');
  const resultaten = [];
  const gezien = new Set();
  const wachtrij = PROEVEN_MET_SLEUTEL.map(([naam, pad]) => ({ naam, url: API + pad }));
  let extra = 0;
  while (wachtrij.length > 0) {
    const { naam, url } = wachtrij.shift();
    const sleutelUrl = new URL(url);
    const id = `${sleutelUrl.pathname}${sleutelUrl.search}`;
    if (gezien.has(id)) continue;
    gezien.add(id);
    const r = await verzoek(url, { sleutel });
    const b = { naam, ...beschrijf(r) };
    resultaten.push(b);
    console.log(`${String(b.status ?? '---').padEnd(4)} ${naam} — ${b.url}${b.lijst ? ` (lijst ${b.lijst.pad}: ${b.lijst.lengte})` : ''}${b.totaal ? ` (totaal ${b.totaal.waarde})` : ''}`);
    if (b.parameters) console.log(`PARAMETERS|${naam}|${JSON.stringify(b.parameters)}`);
    if (b.status && b.status !== 200 && b.status !== 404 && b.begin) console.log(`ANTWOORD|${naam}|${b.begin}`);
    // Links in een antwoord volgen (hoogstens 5 per antwoord en 30 in totaal), alleen op de API-host.
    if (b.status === 200 && Array.isArray(b.links)) {
      let hier = 0;
      for (const l of b.links) {
        if (extra >= 30 || hier >= 5) break;
        try {
          const lu = new URL(l);
          if (lu.host !== API_HOST) continue;
          if (gezien.has(`${lu.pathname}${lu.search}`)) continue;
          wachtrij.push({ naam: `link uit "${naam}"`, url: `${lu.origin}${lu.pathname}${lu.search}` });
          extra++;
          hier++;
        } catch {
          /* geen geldige URL */
        }
      }
    }
    await wacht(WACHT_MS);
  }
  // Volledige lijsten doorbladeren (structuuronderdelen = de studierichtingen) en uitschrijven.
  const lijsten = [];
  for (const [naam, pad] of DOORBLADEREN) {
    const l = await doorblader(naam, API + pad, sleutel);
    console.log(`LIJST|${naam}|status ${l.eerste ? l.eerste.status : '?'}|${l.aantal} elementen in ${l.paginas} pagina's|totaal ${l.totaal}`);
    for (const it of l.items.slice(0, 4000)) console.log(`ITEM|${naam}|${regelVan(it)}`);
    // Details van de eerste drie elementen, als er een detailadres is.
    l.details = [];
    if (naam === 'structuuronderdeel' && l.items.length > 0) {
      for (const it of l.items.slice(0, 3)) {
        const sleutelVeld = Object.keys(it).find((k) => /(^|_)(id|nr|nummer|versie_nr_lang|code)$/i.test(k) && (typeof it[k] === 'string' || typeof it[k] === 'number'));
        if (!sleutelVeld) break;
        for (const detail of [`${KC}/structuuronderdelen/v2/structuuronderdeel_detail/${encodeURIComponent(it[sleutelVeld])}`, `${KC}/structuuronderdelen/v2/structuuronderdeel/${encodeURIComponent(it[sleutelVeld])}`]) {
          const r = await verzoek(API + detail, { sleutel });
          const b = { naam: `detail via ${sleutelVeld}`, ...beschrijf(r) };
          l.details.push(b);
          console.log(`${String(b.status ?? '---').padEnd(4)} detail ${detail}`);
          if (b.status === 200) {
            try {
              console.log(`DETAIL|${detail}|${JSON.stringify(inkort(JSON.parse(r.tekst))).slice(0, 12000)}`);
            } catch {
              /* geen JSON */
            }
          }
          await wacht(WACHT_MS);
        }
      }
    }
    delete l.items;
    lijsten.push(l);
  }

  // Filters op de doelen-API: verandert het totaal ten opzichte van zonder filter?
  const zonder = resultaten.find((x) => x.naam.startsWith('doelen: twee doelen'));
  const filters = resultaten
    .filter((x) => x.naam.startsWith('doelen: filter'))
    .map((x) => ({ naam: x.naam, status: x.status, totaal: x.totaal ? x.totaal.waarde : null, zonderFilter: zonder && zonder.totaal ? zonder.totaal.waarde : null }));
  return { tijd: new Date().toISOString(), resultaten, filters, lijsten };
}

// ── Stand 4: de matrix (ronde 3) ────────────────────────────────────────────

// Ronde 2 vond de matrix: /structuuronderdeelgroep geeft per groep (graad, finaliteit, soort leerjaar)
// de structuuronderdelen (studierichtingen) met onderwijsvorm, studiedomein, STEM, duaal, begin- en
// einddatum en status. Het logboek van GitHub geeft maar de laatste 5000 regels terug; deze stand
// zet daarom alleen de matrix (één regel per studierichting), de filters van de doelen-API en de
// aantallen van het aanbod in het logboek.
const FILTERNAMEN = [
  'studierichting', 'onderwijsstructuur', 'onderwijsdoelenset', 'onderwijsniveau', 'onderwijssoort', 'graad',
  'stroom', 'finaliteit', 'opleidingsvorm', 'leerjaar', 'vlaamse_sleutelcompetentie', 'sleutelcompetentie',
  'onderwijsdoel_type', 'structuuronderdeel', 'domein', 'leergebied', 'vak',
];

const code = (o) => (o && typeof o === 'object' ? schoon(o.code ?? '', 40) || null : null);
const oms = (o) => (o && typeof o === 'object' ? schoon(o.omschrijving ?? '', 120) || null : null);
const codes = (a) => (Array.isArray(a) ? a.map((x) => code(x)).filter(Boolean) : []);

/** Eén studierichting (structuuronderdeel) met de kenmerken van haar groep, plat en ingekort. */
function richtingRegel(g, so) {
  const datum = (d) => (typeof d === 'string' ? schoon(d, 10) : null);
  return {
    groep: schoon(g.structuuronderdeel_groep_nummer, 20),
    groepTitel: schoon(g.titel, 140),
    niveau: code(g.onderwijsniveau),
    graad: code(g.graad),
    finaliteit: code(g.finaliteit),
    soortLeerjaar: oms(g.soort_leerjaar),
    opleidingsvorm: oms(g.opleidingsvorm),
    type7: code(g.type_7de_leerjaar),
    nr: so.structuuronderdeel_nummer ?? null,
    titel: schoon(so.titel, 160),
    vorm: code(so.onderwijsvorm),
    domein: oms(so.studiedomein),
    stem: so.stem_classificatie ? schoon(so.stem_classificatie, 20) : null,
    niche: so.niche ?? null,
    duaal: so.duaal ?? null,
    aanloop: so.aanloop ?? null,
    discipline: so.discipline ? schoon(so.discipline, 80) : null,
    van: datum(so.begindatum),
    tot: datum(so.einddatum),
    oud: schoon(so.studierichting_nummer_oud ?? so.afdeling_nummer_oud ?? '', 20) || null,
    fase: code(so.fase_buso),
    leerjaren: Array.isArray(so.leerjaren) ? so.leerjaren.map((l) => `${code(l)}${l.einddatum ? `<${datum(l.einddatum)}` : ''}`) : [],
    stelsels: codes(so.onderwijsstelsels),
    hoofdstructuren: codes(so.hoofdstructuren),
    instellingstypes: codes(so.instellingstypes),
    details: Array.isArray(so.structuuronderdeel_details)
      ? so.structuuronderdeel_details.map((d) => `${schoon(d.structuuronderdeel_detail_nummer, 20)}:${code(d.status)}:${datum(d.begindatum)}..${datum(d.einddatum) ?? ''}`)
      : [],
    voorbereidend: Array.isArray(so.voorbereidende_structuuronderdelen) ? so.voorbereidende_structuuronderdelen.map((x) => x.structuuronderdeel_nummer) : [],
    vervolg: Array.isArray(so.vervolg_structuuronderdelen) ? so.vervolg_structuuronderdelen.map((x) => x.structuuronderdeel_nummer) : [],
    vorige: (so.historiek_structuuronderdelen?.vorige_structuuronderdelen || []).map((x) => x.structuuronderdeel_nummer),
    volgende: (so.historiek_structuuronderdelen?.volgende_structuuronderdelen || []).map((x) => x.structuuronderdeel_nummer),
  };
}

async function matrix() {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  if (!sleutel) throw new Error('ONDERWIJSDOELEN_API_KEY ontbreekt in de omgeving');
  const uit = { tijd: new Date().toISOString(), filters: [], aanbod: null, groepen: 0, richtingen: 0 };

  // 1. Filters van de doelen-API (onderwijsdoelen.be roept /filters/{naam} op).
  for (const naam of ['', ...FILTERNAMEN]) {
    const r = await verzoek(`${API}/onderwijsdoelen/filters${naam ? `/${naam}` : ''}`, { sleutel });
    const b = beschrijf(r);
    uit.filters.push({ naam: naam || '(basis)', status: r.status, lijst: b.lijst || null });
    console.log(`FILTER|${naam || '(basis)'}|${r.status ?? r.fout}|${b.lijst ? `${b.lijst.pad} ${b.lijst.lengte}` : ''}|${r.status === 200 ? JSON.stringify(b.voorbeelden).slice(0, 600) : schoon(r.tekst || '', 160)}`);
    if (r.status === 200 && r.tekst) {
      try {
        const { lijst } = lijstEnTotaal(JSON.parse(r.tekst));
        const waarden = lijst || (Array.isArray(JSON.parse(r.tekst)) ? JSON.parse(r.tekst) : []);
        for (const w of waarden.slice(0, naam === 'studierichting' ? 1500 : 200)) console.log(`FILTERWAARDE|${naam || '(basis)'}|${schoon(typeof w === 'object' ? JSON.stringify(w) : w, 300)}`);
      } catch {
        /* geen JSON */
      }
    }
    await wacht(WACHT_MS);
  }

  // 2. Aanbod SO: hoeveel administratieve groepen, en kan de lijst per schooljaar?
  for (const pad of ['/instellingsgegevens/onderwijsaanbod_so/v2/administratievegroep', '/instellingsgegevens/onderwijsaanbod_so/v2/administratievegroep?schooljaar=2026']) {
    const r = await verzoek(API + pad, { sleutel });
    let meta = null;
    try {
      meta = JSON.parse(r.tekst).meta ?? null;
    } catch {
      /* geen JSON */
    }
    console.log(`AANBOD|${pad}|${r.status ?? r.fout}|${JSON.stringify(meta)}`);
    uit.aanbod = uit.aanbod || [];
    uit.aanbod.push({ pad, status: r.status, meta });
    await wacht(WACHT_MS);
  }

  // 3. De matrix: alle groepen, één regel per studierichting.
  const d = await doorblader('structuuronderdeelgroep', `${API}${KC}/structuuronderdelen/v2/structuuronderdeelgroep`, sleutel, 80);
  uit.groepen = d.aantal;
  console.log(`MATRIX|groepen ${d.aantal}|pagina's ${d.paginas}|eerste status ${d.eerste ? d.eerste.status : null}`);
  for (const g of d.items) {
    const lijst = Array.isArray(g.structuuronderdelen) ? g.structuuronderdelen : [];
    if (lijst.length === 0) console.log(`LEGEGROEP|${schoon(g.structuuronderdeel_groep_nummer, 20)}|${schoon(g.titel, 140)}`);
    for (const so of lijst) {
      console.log(`RICHTING|${JSON.stringify(richtingRegel(g, so))}`);
      uit.richtingen++;
    }
  }
  console.log(`MATRIX|richtingen ${uit.richtingen}`);
  return uit;
}

// ── Stand 6: koppeling studierichting → doelen (ronde 4) ───────────────────

// Vraag: welke doelen(sets) geeft de doelen-API bij de filter studierichting=<naam>, en zijn dat
// volledige sets of delen ervan? Eerst alle doelen (om de grootte van elke set te kennen), dan per
// studierichting uit de matrix alle pagina's met die filter. Eén regel per studierichting.
const RIJEN = 500;

async function alleDoelenVan(sleutel, extra = '') {
  const leden = [];
  let totaal = null;
  for (let nr = 1; nr <= 200; nr++) {
    const r = await verzoek(`${API}/onderwijsdoelen/onderwijsdoel?paginanr=${nr}&rijen_per_pagina=${RIJEN}${extra}`, { sleutel });
    if (r.status !== 200 || !r.tekst) return { leden, totaal, status: r.status ?? r.fout };
    let json;
    try {
      json = JSON.parse(r.tekst);
    } catch {
      return { leden, totaal, status: 'geen JSON' };
    }
    const g = json && json.gegevens ? json.gegevens : {};
    if (totaal === null && g.totalItems != null) totaal = Number(g.totalItems);
    const lijst = Array.isArray(g.member) ? g.member : [];
    leden.push(...lijst);
    if (lijst.length === 0 || (totaal !== null && leden.length >= totaal)) break;
    await wacht(250);
  }
  return { leden, totaal, status: 200 };
}

async function koppeling() {
  const sleutel = process.env.ONDERWIJSDOELEN_API_KEY;
  if (!sleutel) throw new Error('ONDERWIJSDOELEN_API_KEY ontbreekt in de omgeving');
  const uit = { tijd: new Date().toISOString(), sets: {}, richtingen: [], proeven: [] };

  // 1. Alle doelen: grootte en kenmerken van elke set.
  const alles = await alleDoelenVan(sleutel);
  const setInfo = new Map();
  for (const d of alles.leden) {
    const s = d.onderwijsdoelenset || {};
    const id = s.onderwijsdoelenset_id;
    if (id == null) continue;
    if (!setInfo.has(id)) {
      const o = s.onderwijsstructuur || {};
      setInfo.set(id, { id, naam: schoon(s.onderwijsdoelenset, 140), kort: schoon(s.korte_naam, 80), graad: schoon(o.graad, 40), stroom: schoon(o.stroom, 60), vorm: schoon(o.opleidingsvorm, 60), soort: schoon(o.onderwijssoort, 60), aantal: 0 });
    }
    setInfo.get(id).aantal++;
  }
  console.log(`ALLES|${alles.leden.length} doelen|totaal ${alles.totaal}|${setInfo.size} sets|status ${alles.status}`);

  // 2. Andere filters proberen (alleen pagina 1, één rij: het totaal zegt of de filter werkt).
  const PROEVEN = ['graad=3', 'graad=3de%20graad', 'leerjaar=1', 'finaliteit=Doorstroomfinaliteit', 'finaliteit=DO', 'onderwijsniveau=Secundair%20onderwijs',
    'structuuronderdeel_nummer=505', 'structuuronderdeelnummer=505', 'studierichting_nummer=505', 'administratievegroep=6246', 'onderwijsdoelenset=SO_3DE_GRAAD_V2_1',
    'onderwijsdoelenset_id=3287', 'sleutelcompetentie=1', 'onderwijsdoel_type=Eindterm', 'zoekterm=water', 'studierichting=humane%20wetenschappen', 'studierichting=Humane'];
  for (const q of PROEVEN) {
    const r = await verzoek(`${API}/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=1&${q}`, { sleutel });
    let t = null;
    try {
      t = JSON.parse(r.tekst).gegevens.totalItems;
    } catch {
      /* geen totaal */
    }
    console.log(`FILTERPROEF|${q}|${r.status ?? r.fout}|${t}`);
    uit.proeven.push({ q, status: r.status, totaal: t });
    await wacht(250);
  }

  // 3. De studierichtingen uit de matrix (vandaag geldig, gewoon secundair), unieke namen.
  const d = await doorblader('structuuronderdeelgroep', `${API}${KC}/structuuronderdelen/v2/structuuronderdeelgroep`, sleutel, 80);
  const vandaag = new Date().toISOString().slice(0, 10);
  const namen = new Map();
  for (const g of d.items) {
    for (const so of g.structuuronderdelen || []) {
      const geldig = (!so.begindatum || so.begindatum <= vandaag) && (!so.einddatum || so.einddatum >= vandaag);
      const gewoon = Array.isArray(so.hoofdstructuren) && so.hoofdstructuren.some((h) => h && h.code === '311');
      if (!geldig || !gewoon || so.aanloop) continue;
      const soort = so.duaal ? 'duaal' : g.type_7de_leerjaar ? '7de' : 'gewoon';
      const naam = String(so.titel || '').trim();
      if (!naam) continue;
      if (!namen.has(naam)) namen.set(naam, { naam, soort, graad: g.graad ? g.graad.code : null, finaliteit: g.finaliteit ? g.finaliteit.code : null, nummers: [] });
      namen.get(naam).nummers.push(so.structuuronderdeel_nummer);
    }
  }
  console.log(`NAMEN|${namen.size}|uit ${d.aantal} groepen`);

  // 4. Per naam: gewone richtingen volledig doorbladeren; duaal en 7de leerjaar alleen het totaal.
  for (const r of namen.values()) {
    const filter = `&studierichting=${encodeURIComponent(r.naam)}`;
    let regel;
    if (r.soort === 'gewoon') {
      const res = await alleDoelenVan(sleutel, filter);
      const perSet = new Map();
      for (const doel of res.leden) {
        const id = doel.onderwijsdoelenset && doel.onderwijsdoelenset.onderwijsdoelenset_id;
        perSet.set(id, (perSet.get(id) || 0) + 1);
      }
      regel = { ...r, status: res.status, totaal: res.totaal, ontvangen: res.leden.length, sets: [...perSet].map(([id, n]) => [id, n, setInfo.has(id) ? setInfo.get(id).aantal : null]) };
      for (const [id] of perSet) if (setInfo.has(id)) setInfo.get(id).gebruikt = true;
    } else {
      const res = await verzoek(`${API}/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=1${filter}`, { sleutel });
      let t = null;
      try {
        t = JSON.parse(res.tekst).gegevens.totalItems;
      } catch {
        /* geen totaal */
      }
      regel = { ...r, status: res.status ?? res.fout, totaal: t };
    }
    regel.naam = schoon(regel.naam, 160);
    uit.richtingen.push(regel);
    console.log(`KOPPELING|${JSON.stringify(regel)}`);
    await wacht(250);
  }

  // 5. De sets die bij minstens één richting horen, met hun kenmerken.
  for (const s of setInfo.values()) if (s.gebruikt) console.log(`SET|${JSON.stringify(s)}`);
  uit.sets = Object.fromEntries([...setInfo].map(([id, s]) => [id, s]));
  return uit;
}

/** Parameternamen uit de gegenereerde API-clients van de officiële webapps (zonder sleutel). */
async function parameters() {
  const bronnen = PAGINAS.filter(([naam]) => /Opleidingsinhouden|Onderwijsdoelen\.be: start/.test(naam));
  const uit = [];
  for (const [naam, url] of bronnen) {
    const r = await verzoek(url, { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' });
    if (!r.tekst) {
      console.log(`PARAM|${naam}|geen pagina (${r.status ?? r.fout})`);
      continue;
    }
    const scripts = linksUitHtml(r.tekst, url).filter((l) => /\.m?js(\?|$)/i.test(l) && new URL(l).host === new URL(url).host).slice(0, 15);
    const gezien = new Set();
    for (const s of scripts) {
      const js = await verzoek(s, { accept: '*/*' });
      if (!js.tekst) continue;
      // methodes van de client: "onderwijsdoelGet(r,n,o,…){" en daarbinnen addToHttpParams(…, "naam")
      const methodes = [...js.tekst.matchAll(/([A-Za-z_$][\w$]*(?:Get|Post))\(([^)]{0,600})\)\{/g)].map((m) => ({ naam: m[1], index: m.index }));
      for (const m of js.tekst.matchAll(/addToHttpParams\(\s*[\w$]+\s*,\s*[\w$]+\s*,\s*["']([\w.-]+)["']/g)) {
        const methode = methodes.filter((x) => x.index < m.index).pop();
        const sleutelRegel = `${methode ? methode.naam : '?'}|${m[1]}`;
        if (gezien.has(sleutelRegel)) continue;
        gezien.add(sleutelRegel);
        uit.push({ bron: naam, methode: methode ? methode.naam : null, parameter: m[1] });
        console.log(`PARAM|${naam}|${schoon(sleutelRegel, 160)}`);
      }
      // Ronde 4: de regex hierboven vond niets. Toon de code rond "studierichting" en het begin van
      // onderwijsdoelGet, zodat de namen van de queryparameters zichtbaar worden (sleutels verborgen).
      let n = 0;
      for (const m of js.tekst.matchAll(/studierichting|onderwijsdoelGet\(/g)) {
        if (n++ >= 12) break;
        console.log(`CODE|${naam}|${schoon(js.tekst.slice(Math.max(0, m.index - 300), m.index + 900), 1200)}`);
      }
      await wacht(150);
    }
  }
  return uit;
}

// ── Stand 2: publiek, zonder sleutel ────────────────────────────────────────

const PAGINAS = [
  ['API-portaal (zonder slash)', 'https://onderwijs-api-portaal.vlaanderen.be'],
  ['API-portaal', 'https://onderwijs-api-portaal.vlaanderen.be/'],
  ['API-portaal: documentatie instellingsgegevens', 'https://onderwijs-api-portaal.vlaanderen.be/documentatie/instellingsgegevens'],
  ['API-portaal: documentatie kwalificaties en curriculum', 'https://onderwijs-api-portaal.vlaanderen.be/documentatie/kwalificaties-curriculum'],
  ['Oud portaal: onderwijsaanbod SO', 'https://onderwijs-vlaanderen-portaalov.apigee.io/docs/onderwijsaanbod-so/1/overview'],
  ['App Opleidingsinhouden', 'https://www.opleidingsinhouden-app.onderwijs-apps.vlaanderen.be/'],
  ['Onderwijsdoelen.be: 3de graad', 'https://onderwijsdoelen.be/doelen/SO_3DE_GRAAD_V2_1'],
  ['Onderwijsdoelen.be: start', 'https://onderwijsdoelen.be/'],
  ['Onderwijsaanbod in Vlaanderen', 'https://data-onderwijs.vlaanderen.be/onderwijsaanbod/'],
];

const PDFS = [
  ['Technisch ontwerp onderwijsaanbod SO v2.3 (feb. 2024)', 'https://onderwijs-vlaanderen-portaalov.apigee.io/files/20240216_Onderwijsaanbod_SO_v2_3.pdf'],
  ['Infosessie leerlingenadministratie (juli 2024)', 'https://data-onderwijs.vlaanderen.be/documenten/bestanden/20240709_infosessie_04_leerlingenadministratie.pdf'],
];

const TREFWOORDEN = /structuuronderde|opleidingstraject|studierichting|onderwijsaanbod|administratieve?_?groep|administratievegroep|onderwijsdoel|api\.vlaanderen|\/api\/|kwalificatie/i;

function linksUitHtml(html, basis) {
  const uit = new Set();
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      uit.add(new URL(m[1], basis).toString());
    } catch {
      /* ongeldig */
    }
  }
  return [...uit];
}

/** Stukjes tekst rond trefwoorden en alle absolute URL's met "api" erin. */
function sporen(tekst) {
  const urls = new Set();
  for (const m of tekst.matchAll(/https?:\/\/[A-Za-z0-9.-]+(?:\/[^\s"'`<>\\)]*)?/g)) {
    if (/api|onderwijs/i.test(m[0])) urls.add(schoon(m[0], 200));
  }
  const fragmenten = new Set();
  for (const m of tekst.matchAll(/["'`]([^"'`\n]{0,160})["'`]/g)) {
    if (TREFWOORDEN.test(m[1]) && /\//.test(m[1])) fragmenten.add(schoon(m[1], 160));
    if (fragmenten.size > 120) break;
  }
  return { urls: [...urls].slice(0, 120), fragmenten: [...fragmenten].slice(0, 120) };
}

async function pdfTekst(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true }).promise;
  const regels = [];
  for (let i = 1; i <= Math.min(doc.numPages, 120); i++) {
    const pagina = await doc.getPage(i);
    const inhoud = await pagina.getTextContent();
    let regel = '';
    let laatsteY = null;
    for (const item of inhoud.items) {
      const y = item.transform ? Math.round(item.transform[5]) : null;
      if (laatsteY !== null && y !== laatsteY && regel.trim()) {
        regels.push(regel.trim());
        regel = '';
      }
      regel += item.str + (item.hasEOL ? '\n' : ' ');
      laatsteY = y;
    }
    if (regel.trim()) regels.push(regel.trim());
    regels.push(`── einde pagina ${i} ──`);
  }
  return { paginas: doc.numPages, regels };
}

async function publiek() {
  const uit = { tijd: new Date().toISOString(), paginas: [], pdfs: [], exports: [], omzendbrief: null, w3id: [] };

  // Webpagina's en hun scripts: welke officiële API-adressen gebruiken ze?
  for (const [naam, url] of PAGINAS) {
    const r = await verzoek(url, { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' });
    const p = { naam, url, status: r.status, soort: r.soort, grootte: r.grootte, fout: r.fout, doorverwijzing: r.doorverwijzing };
    if (r.tekst) {
      const titel = /<title[^>]*>([^<]*)<\/title>/i.exec(r.tekst);
      p.titel = titel ? schoon(titel[1], 160) : null;
      const links = linksUitHtml(r.tekst, url);
      p.links = links.filter((l) => TREFWOORDEN.test(l) || /documentatie|\/api|\.pdf|\.xlsx?|\.csv|download/i.test(l)).slice(0, 80).map((l) => schoon(l, 200));
      const sp = sporen(r.tekst);
      const scripts = links.filter((l) => /\.m?js(\?|$)/i.test(l) && new URL(l).host === new URL(url).host).slice(0, 15);
      p.scripts = scripts.length;
      for (const s of scripts) {
        const js = await verzoek(s, { accept: '*/*' });
        if (js.tekst) {
          const x = sporen(js.tekst);
          x.urls.forEach((u) => sp.urls.push(u));
          x.fragmenten.forEach((f) => sp.fragmenten.push(f));
          sp.code = sp.code || [];
          for (const mm of js.tekst.matchAll(/(?:basePath\}?\/|encodeParam\(\{name:|queryParameters|\/structuuronderdeel|\/opleidingstraject|\/beroepskwalificatie|\/onderwijsdoel)/g)) {
            if (sp.code.length > 200) break;
            sp.code.push(schoon(js.tekst.slice(Math.max(0, mm.index - 160), mm.index + 260), 420));
          }
        }
        await wacht(150);
      }
      p.apiUrls = [...new Set(sp.urls)].slice(0, 150);
      // Bredere stukken code rond de aanroepen (paden en parameternamen van de gegenereerde API-client).
      p.code = [...new Set(sp.code || [])].slice(0, 120);
      p.fragmenten = [...new Set(sp.fragmenten)].slice(0, 150);
    }
    uit.paginas.push(p);
    console.log(`${String(p.status ?? '---').padEnd(4)} ${naam} (${p.scripts ?? 0} scripts, ${p.apiUrls ? p.apiUrls.length : 0} api-URL's)`);
    await wacht(WACHT_MS);
  }

  // Technische ontwerpen en infosessies (pdf): tekst eruit, regels over adressen en velden bewaren.
  for (const [naam, url] of PDFS) {
    const r = await verzoek(url, { accept: 'application/pdf,*/*;q=0.5', ruw: true });
    const p = { naam, url, status: r.status, soort: r.soort, grootte: r.grootte, fout: r.fout, doorverwijzing: r.doorverwijzing };
    if (r.status === 200 && r.buffer && r.buffer.subarray(0, 5).toString() === '%PDF-') {
      try {
        const { paginas, regels } = await pdfTekst(r.buffer);
        p.paginas = paginas;
        p.regels = regels.map((x) => schoon(x, 300));
        p.adressen = p.regels.filter((x) => /\/[a-z_]+\/|GET |POST |https?:\/\/|parameter|query|endpoint|resource|veld|attribu/i.test(x)).slice(0, 400);
      } catch (e) {
        p.fout = schoon(`pdf onleesbaar: ${e && e.message ? e.message : e}`, 200);
      }
    }
    delete p.buffer;
    uit.pdfs.push(p);
    console.log(`${String(p.status ?? '---').padEnd(4)} ${naam} (${p.paginas ?? 0} pagina's)`);
    await wacht(WACHT_MS);
  }

  // Publieke exports van het onderwijsaanbod (puntkomma-gescheiden).
  for (const naam of ['aanbod-so', 'aanbod-bao', 'aanbod-vwo-module']) {
    const url = `https://data-onderwijs.vlaanderen.be/onderwijsaanbod/API/${naam}`;
    const r = await verzoek(url, { accept: 'text/plain,text/csv,*/*;q=0.5' });
    const e = { naam, url, status: r.status, soort: r.soort, grootte: r.grootte, fout: r.fout, doorverwijzing: r.doorverwijzing };
    if (r.tekst) {
      const regels = r.tekst.split(/\r?\n/).filter((x) => x.trim());
      e.regels = regels.length;
      e.kop = schoon(regels[0], 400);
      e.voorbeelden = regels.slice(1, 6).map((x) => schoon(x, 300));
      e.laatste = regels.slice(-2).map((x) => schoon(x, 300));
      const kolommen = regels[0] ? regels[0].split(';').map((x) => x.replace(/"/g, '').trim()) : [];
      const iSchooljaar = kolommen.indexOf('schooljaar');
      if (iSchooljaar >= 0) {
        const tel = {};
        for (const rij of regels.slice(1)) {
          const v = (rij.split(';')[iSchooljaar] || '').replace(/"/g, '').trim();
          tel[v] = (tel[v] || 0) + 1;
        }
        e.perSchooljaar = tel;
      }
    }
    uit.exports.push(e);
    console.log(`${String(e.status ?? '---').padEnd(4)} export ${naam} (${e.regels ?? 0} regels)`);
    await wacht(WACHT_MS);
  }

  // Omzendbrief SO 37: lijst van administratieve groepen met codes van vijf cijfers.
  {
    const url = 'https://data-onderwijs.vlaanderen.be/edulex/document.aspx?docid=9428';
    const r = await verzoek(url, { accept: 'text/html,*/*;q=0.8' });
    const o = { url, status: r.status, soort: r.soort, grootte: r.grootte, fout: r.fout, doorverwijzing: r.doorverwijzing };
    if (r.tekst) {
      const tekst = r.tekst.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
      const regels = tekst.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      const codes = new Map();
      for (let i = 0; i < regels.length; i++) {
        if (/^\d{5}$/.test(regels[i]) && regels[i + 1] && !/^\d/.test(regels[i + 1])) {
          if (!codes.has(regels[i])) codes.set(regels[i], schoon(regels[i + 1], 120));
        }
      }
      o.codes = codes.size;
      o.voorbeelden = [...codes].slice(0, 12).map(([c, n]) => `${c} ${n}`);
      const titel = /<title[^>]*>([^<]*)<\/title>/i.exec(r.tekst);
      o.titel = titel ? schoon(titel[1], 200) : null;
      o.schooljaren = [...new Set((tekst.match(/20\d\d-20\d\d/g) || []))].slice(0, 20);
    }
    uit.omzendbrief = o;
    console.log(`${String(o.status ?? '---').padEnd(4)} omzendbrief SO 37 (${o.codes ?? 0} codes)`);
    await wacht(WACHT_MS);
  }

  // Linked data: thesaurus onderwijsstructuur.
  for (const accept of ['text/turtle', 'application/ld+json', 'text/html']) {
    const url = 'https://w3id.org/onderwijs-vlaanderen/id/structuur/';
    const r = await verzoek(url, { accept });
    uit.w3id.push({ accept, url, status: r.status, soort: r.soort, grootte: r.grootte, fout: r.fout, doorverwijzing: r.doorverwijzing, begin: r.tekst ? schoon(r.tekst, 600) : null });
    console.log(`${String(r.status ?? '---').padEnd(4)} w3id structuur (${accept})${r.doorverwijzing ? ` → ${r.doorverwijzing}` : ''}`);
    await wacht(WACHT_MS);
  }
  return uit;
}

// ── Stand 3: verslag ────────────────────────────────────────────────────────

const kode = (t) => '`' + schoon(t, 200).replace(/`/g, "'") + '`';

function verslag() {
  const lees = (f) => {
    const p = path.join(UIT, f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const m = lees('met-sleutel.json');
  const p = lees('publiek.json');
  const r = ['# Verkenning API\'s en open bronnen van Onderwijs en Vorming', ''];

  r.push('## 1. Met sleutel (onderwijs.api.vlaanderen.be)', '');
  if (!m) r.push('Geen resultaten (stap niet gelukt).', '');
  else {
    r.push('| status | proef | adres | lijst | totaal |', '|---|---|---|---|---|');
    for (const x of m.resultaten) {
      r.push(`| ${x.status ?? x.fout ?? '—'} | ${schoon(x.naam, 60)} | ${kode(x.url.replace(API, ''))} | ${x.lijst ? `${kode(x.lijst.pad)} ${x.lijst.lengte}` : ''} | ${x.totaal ? x.totaal.waarde : ''} |`);
    }
    r.push('', '### Filters op de doelen-API', '');
    for (const f of m.filters) r.push(`- ${f.naam}: status ${f.status}, totaal ${f.totaal} (zonder filter: ${f.zonderFilter})`);
    r.push('', '### Antwoorden met status 200: velden en voorbeelden', '');
    for (const x of m.resultaten.filter((y) => y.status === 200)) {
      r.push(`#### ${schoon(x.naam, 80)} — ${kode(x.url.replace(API, ''))}`, '');
      if (x.begin) r.push('Geen JSON. Begin: ' + kode(x.begin), '');
      if (x.velden) {
        r.push('Velden:', '', '```', ...Object.entries(x.velden).map(([k, s]) => `${k}: ${s}`), '```', '');
        r.push('Voorbeelden:', '', '```json', JSON.stringify(x.voorbeelden, null, 1).slice(0, 6000), '```', '');
      }
      if (x.links && x.links.length) r.push('Links in het antwoord: ' + x.links.map(kode).join(', '), '');
      if (x.parameters) r.push('Parameters (hydra): ' + kode(x.parameters.template), '', ...(x.parameters.mapping || []).map((mp) => `- ${kode(mp.variable)} → ${kode(mp.property)}${mp.required ? ' (verplicht: ' + mp.required + ')' : ''}`), '');
    }
    if (m.lijsten) {
      r.push('### Doorgebladerde lijsten', '');
      for (const l of m.lijsten) r.push(`- **${l.naam}**: ${l.aantal} elementen in ${l.paginas} pagina's (totaal volgens de API: ${l.totaal}); eerste antwoord: ${l.eerste ? l.eerste.status : '?'}${l.eerste && l.eerste.begin ? ' — ' + kode(l.eerste.begin) : ''}`);
      r.push('', 'De elementen staan regel per regel in het logboek (regels die beginnen met `ITEM|`).', '');
    }
    const anders = m.resultaten.filter((y) => y.status !== 200 && y.status !== 404);
    if (anders.length) {
      r.push('### Andere statussen (geen 200, geen 404)', '');
      for (const x of anders) r.push(`- ${x.status ?? x.fout}: ${kode(x.url.replace(API, ''))}${x.begin ? ' — ' + kode(x.begin) : ''}${x.doorverwijzing ? ' → ' + kode(x.doorverwijzing) : ''}`);
      r.push('');
    }
  }

  r.push('## 2. Publiek, zonder sleutel', '');
  if (!p) r.push('Geen resultaten (stap niet gelukt).', '');
  else {
    for (const x of p.paginas) {
      r.push(`### ${schoon(x.naam, 80)} — status ${x.status ?? x.fout}`, '');
      if (x.titel) r.push('Titel: ' + kode(x.titel), '');
      if (x.doorverwijzing) r.push('Doorverwijzing naar ' + kode(x.doorverwijzing), '');
      if (x.links && x.links.length) r.push('Relevante links:', '', ...x.links.slice(0, 40).map((l) => '- ' + kode(l)), '');
      if (x.apiUrls && x.apiUrls.length) r.push(`API-adressen in de pagina en ${x.scripts} scripts:`, '', ...x.apiUrls.slice(0, 60).map((l) => '- ' + kode(l)), '');
      if (x.fragmenten && x.fragmenten.length) r.push('Fragmenten met trefwoorden:', '', ...x.fragmenten.slice(0, 60).map((l) => '- ' + kode(l)), '');
      if (x.code && x.code.length) r.push('Code rond API-aanroepen:', '', '```', ...x.code.slice(0, 120), '```', '');
    }
    for (const x of p.pdfs) {
      r.push(`### ${schoon(x.naam, 80)} — status ${x.status ?? x.fout}`, '');
      if (x.fout) r.push('Fout: ' + kode(x.fout), '');
      if (x.paginas) r.push(`${x.paginas} pagina's. Regels over adressen, parameters en velden:`, '', '```', ...(x.adressen || []).slice(0, 250), '```', '');
    }
    r.push('### Publieke exports (data-onderwijs.vlaanderen.be/onderwijsaanbod/API/…)', '');
    for (const e of p.exports) {
      r.push(`- **${e.naam}**: status ${e.status ?? e.fout}, ${e.regels ?? 0} regels`);
      if (e.kop) r.push(`  - kop: ${kode(e.kop)}`);
      for (const v of e.voorbeelden || []) r.push(`  - ${kode(v)}`);
      if (e.perSchooljaar) r.push(`  - per schooljaar: ${kode(JSON.stringify(e.perSchooljaar))}`);
    }
    r.push('');
    const o = p.omzendbrief;
    if (o) {
      r.push(`### Omzendbrief SO 37 — status ${o.status ?? o.fout}`, '');
      if (o.titel) r.push('Titel: ' + kode(o.titel));
      r.push(`Codes van vijf cijfers gevonden: ${o.codes ?? 0}. Schooljaren in de tekst: ${(o.schooljaren || []).join(', ')}`, '');
      for (const v of o.voorbeelden || []) r.push('- ' + kode(v));
      r.push('');
    }
    r.push('### Thesaurus onderwijsstructuur (w3id)', '');
    for (const w of p.w3id) r.push(`- ${w.accept}: status ${w.status ?? w.fout}${w.doorverwijzing ? ' → ' + kode(w.doorverwijzing) : ''}${w.begin ? ' — ' + kode(w.begin) : ''}`);
    r.push('');
  }
  return r.join('\n');
}

// ── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const stand = process.argv[2];
  fs.mkdirSync(UIT, { recursive: true });
  if (stand === '--met-sleutel') {
    const d = await metSleutel();
    fs.writeFileSync(path.join(UIT, 'met-sleutel.json'), JSON.stringify(d, null, 1));
  } else if (stand === '--publiek') {
    const d = await publiek();
    fs.writeFileSync(path.join(UIT, 'publiek.json'), JSON.stringify(d, null, 1));
  } else if (stand === '--matrix') {
    const d = await matrix();
    fs.writeFileSync(path.join(UIT, 'matrix.json'), JSON.stringify(d, null, 1));
  } else if (stand === '--koppeling') {
    const d = await koppeling();
    fs.writeFileSync(path.join(UIT, 'koppeling.json'), JSON.stringify(d, null, 1));
  } else if (stand === '--parameters') {
    const d = await parameters();
    fs.writeFileSync(path.join(UIT, 'parameters.json'), JSON.stringify(d, null, 1));
  } else if (stand === '--verslag') {
    const tekst = verslag();
    fs.writeFileSync(path.join(UIT, 'verslag.md'), tekst);
    console.log(tekst);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, tekst.slice(0, 900000) + '\n');
  } else {
    console.error('Gebruik: verken-onderwijs-api.mjs --met-sleutel | --publiek | --verslag | --matrix | --koppeling | --parameters');
    process.exit(2);
  }
}

// Alleen starten als het script zelf uitgevoerd wordt (zo kan een test de hulpfuncties laden).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((e) => {
    console.error('Verkenning mislukt:', schoon(e && e.message ? e.message : e, 300));
    process.exit(1);
  });
}

export { beschrijf, lijstEnTotaal, velden, inkort, sporen, pdfTekst, apiLinks, schoon, richtingRegel };
