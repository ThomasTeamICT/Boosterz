#!/usr/bin/env node
// Eenmalige verkenning van de API's en open bronnen van Onderwijs en Vorming (oktober 2026).
//
// Vraag van de eigenaar: kunnen we de geldende matrix van alle studierichtingen van het secundair
// onderwijs als data ophalen, en wat zit er verder in de API's van Onderwijs? Zie docs/LEERPLANNEN.md.
//
// Drie standen, in drie aparte stappen van de workflow .github/workflows/verken-onderwijs-api.yml:
//   --met-sleutel  proefoproepen naar onderwijs.api.vlaanderen.be met de sleutel uit de omgeving
//                  (ONDERWIJSDOELEN_API_KEY). Alleen ingebouwde Node-modules, geen pakketten.
//   --publiek      publieke bronnen zonder sleutel: het API-portaal, de technische ontwerpen (pdf),
//                  de export "aanbod-so", omzendbrief SO 37, en de scripts van officiële webapps
//                  (om te zien welke officiële API-adressen ze gebruiken). Mag pdfjs-dist gebruiken.
//   --verslag      voegt beide delen samen tot één verslag (markdown op stdout en in de samenvatting).
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
const schoon = (t, n = 200) =>
  String(t ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

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
      if (!lijst && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
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
    r.fout = schoon(e && e.message ? e.message : e, 200);
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
  return uit;
}

// ── Stand 1: met sleutel ────────────────────────────────────────────────────

const PROEVEN_MET_SLEUTEL = [
  // De doelen-API die we al gebruiken: volledige veldinventaris van twee doelen, en andere adressen.
  ['doelen: twee doelen', '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=2'],
  ['doelen: basis', '/onderwijsdoelen'],
  ['doelen: basis /', '/onderwijsdoelen/'],
  ['doelen: sets', '/onderwijsdoelen/onderwijsdoelenset'],
  ['doelen: sets (meervoud)', '/onderwijsdoelen/onderwijsdoelensets'],
  ['doelen: onderwijsstructuur', '/onderwijsdoelen/onderwijsstructuur'],
  ['doelen: studierichting', '/onderwijsdoelen/studierichting'],
  ['doelen: studierichtingen', '/onderwijsdoelen/studierichtingen'],
  ['doelen: structuuronderdeel', '/onderwijsdoelen/structuuronderdeel'],
  ['doelen: structuuronderdelen', '/onderwijsdoelen/structuuronderdelen'],
  ['doelen: openapi.json', '/onderwijsdoelen/openapi.json'],
  ['doelen: swagger.json', '/onderwijsdoelen/swagger.json'],
  ['doelen: filter studierichting', '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=2&studierichting=Humane%20wetenschappen'],
  ['doelen: filter structuuronderdeel', '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=2&structuuronderdeel=Humane%20wetenschappen'],
  ['doelen: filter onderwijsstructuur', '/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=2&onderwijsstructuur=SO_3DE_GRAAD'],
  // Onderwijsaanbod secundair onderwijs (catalogusfiche 7889e3d0): theoretisch en ingericht aanbod.
  ['aanbod SO: basis', '/instellingsgegevens/onderwijsaanbod_so/v2'],
  ['aanbod SO: basis /', '/instellingsgegevens/onderwijsaanbod_so/v2/'],
  ['aanbod SO: administratieve_groepen', '/instellingsgegevens/onderwijsaanbod_so/v2/administratieve_groepen'],
  ['aanbod SO: administratievegroepen', '/instellingsgegevens/onderwijsaanbod_so/v2/administratievegroepen'],
  ['aanbod SO: administratieve-groepen', '/instellingsgegevens/onderwijsaanbod_so/v2/administratieve-groepen'],
  ['aanbod SO: administratieve_groep', '/instellingsgegevens/onderwijsaanbod_so/v2/administratieve_groep'],
  ['aanbod SO: theoretisch', '/instellingsgegevens/onderwijsaanbod_so/v2/theoretisch'],
  ['aanbod SO: ingericht', '/instellingsgegevens/onderwijsaanbod_so/v2/ingericht'],
  ['aanbod SO: hoofdstructuren', '/instellingsgegevens/onderwijsaanbod_so/v2/hoofdstructuren'],
  ['aanbod SO: schooljaren', '/instellingsgegevens/onderwijsaanbod_so/v2/schooljaren'],
  ['aanbod SO: structuuronderdelen', '/instellingsgegevens/onderwijsaanbod_so/v2/structuuronderdelen'],
  ['aanbod SO: openapi.json', '/instellingsgegevens/onderwijsaanbod_so/v2/openapi.json'],
  ['aanbod SO: v1', '/instellingsgegevens/onderwijsaanbod_so/v1'],
  ['aanbod SO: v3', '/instellingsgegevens/onderwijsaanbod_so/v3'],
  // Instellingen (scholen en vestigingen).
  ['instellingen: basis', '/instellingsgegevens/instelling/v2'],
  ['instellingen: basis /', '/instellingsgegevens/instelling/v2/'],
  // Structuuronderdelen-API (genoemd door de app Opleidingsinhouden; adres onbekend).
  ['structuuronderdelen: /structuuronderdelen', '/structuuronderdelen'],
  ['structuuronderdelen: /structuuronderdelen/v1', '/structuuronderdelen/v1'],
  ['structuuronderdelen: /structuuronderdeel', '/structuuronderdeel'],
  ['structuuronderdelen: /structuuronderdeel/v1', '/structuuronderdeel/v1'],
  ['structuuronderdelen: kwalificaties/…', '/kwalificaties/structuuronderdelen'],
  ['structuuronderdelen: kwalificatiesencurriculum/…', '/kwalificatiesencurriculum/structuuronderdelen'],
  ['structuuronderdelen: curriculum/…', '/curriculum/structuuronderdelen'],
  ['structuuronderdelen: onderwijsdoelen/structuur', '/onderwijsdoelen/structuur'],
  ['opleidingstrajecten: /opleidingstrajecten', '/opleidingstrajecten'],
  ['opleidingsinhouden: /opleidingsinhouden', '/opleidingsinhouden'],
  ['onderwijskwalificaties', '/onderwijskwalificaties'],
  ['beroepskwalificaties', '/beroepskwalificaties'],
  ['kwalificaties', '/kwalificaties'],
];

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
  // Filters op de doelen-API: verandert het totaal ten opzichte van zonder filter?
  const zonder = resultaten.find((x) => x.naam === 'doelen: twee doelen');
  const filters = resultaten
    .filter((x) => x.naam.startsWith('doelen: filter'))
    .map((x) => ({ naam: x.naam, status: x.status, totaal: x.totaal ? x.totaal.waarde : null, zonderFilter: zonder && zonder.totaal ? zonder.totaal.waarde : null }));
  return { tijd: new Date().toISOString(), resultaten, filters };
}

// ── Stand 2: publiek, zonder sleutel ────────────────────────────────────────

const PAGINAS = [
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
        }
        await wacht(150);
      }
      p.apiUrls = [...new Set(sp.urls)].slice(0, 150);
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
  } else if (stand === '--verslag') {
    const tekst = verslag();
    fs.writeFileSync(path.join(UIT, 'verslag.md'), tekst);
    console.log(tekst);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, tekst.slice(0, 900000) + '\n');
  } else {
    console.error('Gebruik: verken-onderwijs-api.mjs --met-sleutel | --publiek | --verslag');
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

export { beschrijf, lijstEnTotaal, velden, inkort, sporen, pdfTekst, apiLinks };
