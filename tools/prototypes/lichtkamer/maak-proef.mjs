#!/usr/bin/env node
// Maakt de 3D-proefpagina van de Lichtkamer (LK-3 in docs/basisonderwijs/LICHTKAMER-APP.md):
//
//   public/proef/lichtkamer-proef.html          de pagina (noindex)
//   public/proef/lichtkamer/lk-*.js             de eigen modules van het prototype en de meetstand
//   public/proef/lichtkamer/three/...           three r128 en de gebruikte voorbeeldscripts, lokaal
//
//   node tools/prototypes/lichtkamer/maak-proef.mjs [--uit <map>]
//
// De bron is het goedgekeurde prototype in deze map. De pagina haalt niets van
// buiten (geen CDN, geen Google Fonts): three.js komt uit `vendor/three-r128/`,
// een vastgelegde kopie van het npm-pakket three@0.128.0 met een controlesom per
// bestand (`SHA256SUMS`). Het script faalt hard (exit 1, melding in het
// Nederlands) en schrijft dan niets, tenzij alle controles slagen. Het is
// deterministisch: twee keer draaien geeft dezelfde bytes.
//
// Naast elkaar met de toestelproef (tools/prototypes/toestelproef/): dezelfde
// map public/proef/, dezelfde uitrol (Vite kopieert public/ naar dist/), geen
// aparte CSP (die staat alleen als <meta> in index.html) en geen
// voorcache van de service worker. Zie README.md.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '../../..');
const VENDOR = path.join(HIER, 'vendor', 'three-r128');
export const STANDAARD_UIT = path.join(REPO, 'public', 'proef');
export const PAGINA = 'lichtkamer-proef.html';
export const MAP = 'lichtkamer';

/** De eigen scripts van het prototype en de meetstand, in laadvolgorde na three. */
const EIGEN_SCRIPTS = ['lk-wereld.js', 'lk-kleuter.js', 'lk-labo.js'];
const MEET_SCRIPT = 'lk-meet.js';

/** De voorbeeldklas van het prototype is verzonnen. Elke andere lijst is een fout. */
const VOORBEELDKLAS = "['Amira','Bram','Chloë','Daan','Elif','Finn','Hanne','Ilias']";

/**
 * Webadressen die in de vastgelegde three-bestanden staan als commentaar of als
 * naamruimte (geen aanvraag). De bestanden zelf zijn vastgelegd met een
 * controlesom; elk ander adres in de uitvoer is een fout.
 */
const TOEGELATEN_ADRESSEN_IN_THREE = new Set([
  'http://en.wikipedia.org/wiki/Luminosity',
  'http://en.wikipedia.org/wiki/gamma_correction',
  'http://www.terathon.com/code/oblique.html',
  'http://www.terathon.com/lengyel/Lengyel-Oblique.pdf',
  'http://www.w3.org/1999/xhtml',
  'https://docs.unrealengine.com/latest/INT/Engine/Rendering/PostProcessEffects/Bloom/',
  'https://github.com/google/model-viewer/blob/master/packages/model-viewer/src/three-components/EnvironmentScene.ts',
  'https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600',
  'https://github.com/mrdoob/three.js/pull/21358',
  '//context.stencilFunc(', // uitgecommentarieerde code in three.min.js
]);

export class ControleFout extends Error {}

function eis(voorwaarde, melding) {
  if (!voorwaarde) throw new ControleFout(melding);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function tel(tekst, deel) {
  return tekst.split(deel).length - 1;
}

/** Vervangt `van` door `naar`, en eist dat `van` precies één keer voorkomt. */
function vervangEenmaal(tekst, van, naar, wat) {
  eis(tel(tekst, van) === 1, `${wat}: verwachtte precies één keer ${JSON.stringify(van.slice(0, 80))} in het prototype, vond ${tel(tekst, van)}. Pas maak-proef.mjs aan.`);
  return tekst.replace(van, () => naar);
}

// ── de vastgelegde kopie van three.js ───────────────────────────────────────

/** Leest SHA256SUMS en eist dat elk bestand erin klopt en dat er geen bestand extra staat. */
function leesVendor() {
  const sums = readFileSync(path.join(VENDOR, 'SHA256SUMS'), 'utf8').trim().split('\n');
  const bestanden = new Map();
  for (const regel of sums) {
    const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(regel);
    eis(m, `SHA256SUMS: onleesbare regel ${JSON.stringify(regel)}.`);
    const [, hash, rel] = m;
    eis(!rel.includes('..') && !path.isAbsolute(rel), `SHA256SUMS: onveilig pad ${rel}.`);
    const inhoud = readFileSync(path.join(VENDOR, rel));
    eis(sha256(inhoud) === hash, `De vastgelegde kopie van three.js is veranderd: ${rel} heeft een andere controlesom dan in SHA256SUMS.`);
    bestanden.set(rel, inhoud);
  }
  const opSchijf = [];
  (function loop(map, voorvoegsel) {
    for (const e of readdirSync(map, { withFileTypes: true })) {
      if (e.isDirectory()) loop(path.join(map, e.name), `${voorvoegsel}${e.name}/`);
      else opSchijf.push(`${voorvoegsel}${e.name}`);
    }
  })(VENDOR, '');
  const extra = opSchijf.filter((f) => f !== 'SHA256SUMS' && f !== 'HERKOMST.md' && !bestanden.has(f));
  eis(extra.length === 0, `In vendor/three-r128 staan bestanden zonder controlesom: ${extra.join(', ')}.`);
  eis(bestanden.has('LICENSE'), 'De licentie van three.js (LICENSE) ontbreekt in vendor/three-r128.');
  return bestanden;
}

// ── de pagina ───────────────────────────────────────────────────────────────

const CDN_SCRIPT = /<script src="https:\/\/(?:cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js|cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/(examples\/js\/[A-Za-z0-9_/]+\.js))"><\/script>/g;

function maakPagina(bron, vendor) {
  let t = bron.replace(/\r\n/g, '\n');

  // Kop van het fragment: titel, viewport-merk en de lettertypes van Google.
  t = vervangEenmaal(t, '<title>Lichtkamer</title>\n', '', 'titel');
  t = vervangEenmaal(t, '<meta name="claude:viewport-fit-sides" content="cover">\n', '', 'viewport-merk');
  t = vervangEenmaal(t, '<link rel="preconnect" href="https://fonts.googleapis.com">\n', '', 'preconnect');
  t = vervangEenmaal(t, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n', '', 'preconnect gstatic');
  t = vervangEenmaal(t, '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fredoka:wght@500;600&display=swap">\n', '', 'Google Fonts');

  // three.js en de voorbeeldscripts: van de CDN naar de lokale kopie.
  const gebruikt = [];
  t = t.replace(CDN_SCRIPT, (_, voorbeeld) => {
    const rel = voorbeeld ?? 'build/three.min.js';
    eis(vendor.has(rel), `Het prototype laadt ${rel}, maar dat staat niet in vendor/three-r128 (SHA256SUMS). Leg het vast met zijn controlesom.`);
    gebruikt.push(rel);
    return `<script src="${MAP}/three/${rel}"></script>`;
  });
  eis(gebruikt.length > 0 && gebruikt[0] === 'build/three.min.js', 'three.min.js is niet het eerste script van het prototype.');
  eis(!/<script src="https?:/.test(t), 'Het prototype laadt nog een script van een extern adres.');
  const overbodig = [...vendor.keys()].filter((f) => f !== 'LICENSE' && !gebruikt.includes(f));
  eis(overbodig.length === 0, `vendor/three-r128 bevat bestanden die het prototype niet gebruikt: ${overbodig.join(', ')}. Haal ze weg of pas SHA256SUMS aan.`);

  // De eigen modules, en de meetstand vóór het script van de pagina zelf.
  for (const f of EIGEN_SCRIPTS) t = vervangEenmaal(t, `<script src="${f}"></script>\n`, `<script src="${MAP}/${f}"></script>\n`, f);
  t = vervangEenmaal(t, `<script src="${MAP}/lk-labo.js"></script>\n`, `<script src="${MAP}/lk-labo.js"></script>\n<script src="${MAP}/${MEET_SCRIPT}"></script>\n`, 'meetstand');

  // De voorbeeldklas is verzonnen; de opslag krijgt een eigen sleutel.
  eis(t.includes(`const VOORBEELDKLAS = ${VOORBEELDKLAS};`), 'De voorbeeldklas in het prototype is niet de verzonnen lijst waarvoor dit script instaat. Controleer dat er geen echte namen bijgekomen zijn.');
  eis(tel(t, "'lichtkamer.v1'") === 2, `Verwachtte 2 keer de opslagsleutel 'lichtkamer.v1', vond ${tel(t, "'lichtkamer.v1'")}.`);
  t = t.split("'lichtkamer.v1'").join("'lichtkamer-proef.v1'");

  // Eén extra regel onderaan, zodat een leerkracht of coördinator weet waar ze is.
  t = vervangEenmaal(
    t,
    '</footer>',
    '  <p>Dit is de proefpagina voor de toestelproef: ze meet of de 3D-kijkdoos vlot loopt op dit toestel. Voeg <code>?meet</code> toe aan het adres voor de meetstand. De pagina haalt niets van buiten en wordt niet geïndexeerd.</p>\n</footer>',
    'voettekst',
  );

  // Hoofd en lijf: alles vóór </style> is hoofd, de rest is lijf.
  eis(tel(t, '</style>') === 1, 'Het prototype heeft niet precies één </style>.');
  const [stijl, lijf] = t.split('</style>\n');
  eis(typeof lijf === 'string' && stijl.startsWith('<style>'), 'Het prototype begint niet met <style>.');
  return [
    '<!doctype html>',
    '<html lang="nl-BE">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="robots" content="noindex">',
    '<title>Lichtkamer 3D-proef</title>',
    '<link rel="icon" href="data:,">',
    '<style>[hidden]{display:none!important}</style>',
    `${stijl}</style>`,
    '</head>',
    '<body>',
    lijf.replace(/\n+$/, ''),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ── controle van de uitvoer ─────────────────────────────────────────────────

/** Elk webadres in de uitvoer is een fout, behalve de bekende in de vastgelegde three-bestanden. */
export function zoekExterneAdressen(bestanden) {
  const gevonden = [];
  for (const [naam, inhoud] of bestanden) {
    const tekst = inhoud.toString('utf8');
    const inThree = naam.startsWith(`${MAP}/three/`);
    for (const m of tekst.matchAll(/(?:https?:)?\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) {
      const adres = m[0];
      if (inThree && TOEGELATEN_ADRESSEN_IN_THREE.has(adres)) continue;
      gevonden.push(`${naam}: ${adres}`);
    }
  }
  return gevonden;
}

function controleer(bestanden) {
  const html = bestanden.get(PAGINA).toString('utf8');
  const externe = zoekExterneAdressen(bestanden);
  eis(externe.length === 0, `De uitvoer bevat een extern webadres (er mag niets van buiten komen):\n  ${externe.join('\n  ')}`);
  eis(html.startsWith('<!doctype html>'), 'De pagina begint niet met <!doctype html>.');
  eis(/<html lang="nl-BE">/.test(html), 'lang="nl-BE" ontbreekt.');
  eis(/<meta name="robots" content="noindex">/.test(html), 'noindex ontbreekt.');
  eis(/<meta charset="utf-8">/.test(html), 'De charset ontbreekt.');
  eis(/<meta name="viewport" content="[^"]*width=device-width/.test(html), 'De viewport ontbreekt.');
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  eis(links.every((l) => l === '<link rel="icon" href="data:,">'), 'De pagina bevat een <link> naar iets anders dan het lege icoontje: geen lettertypes of stijlbladen van buiten.');
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  eis(css.length > 0 && !/@import|(?:^|[^A-Za-z])url\(/i.test(css), 'De css haalt iets op via @import of url().');
  eis(!/fonts\.(?:googleapis|gstatic)|googleapis|cdnjs|jsdelivr|unpkg/i.test(html), 'De pagina noemt een CDN of Google Fonts.');
  eis(!/<(?:img|iframe|object|embed|video|audio|source|form)\b[^>]*\s(?:src|action|data)\s*=/i.test(html), 'De pagina laadt iets via src, action of data.');
  eis(!/\b(?:sendBeacon|importScripts)\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(html), 'De pagina gebruikt een netwerkaanroep.');
  eis((html.match(/<main\b/g) || []).length === 1, 'Er moet precies één <main> zijn.');
  eis((html.match(/<h1\b/g) || []).length === 1, 'Er moet precies één <h1> zijn.');
  const srcs = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
  eis(srcs.length > 0, 'De pagina laadt geen scripts.');
  for (const s of srcs) {
    eis(s.startsWith(`${MAP}/`) && !s.includes('..') && !s.includes(':'), `Een script wijst niet naar de lokale map ${MAP}/: ${s}`);
    eis(bestanden.has(s), `Het script ${s} staat niet in de uitvoer.`);
  }
  eis(srcs[0] === `${MAP}/three/build/three.min.js`, 'three.min.js moet het eerste script zijn.');
  eis(srcs.indexOf(`${MAP}/${MEET_SCRIPT}`) > srcs.indexOf(`${MAP}/lk-labo.js`) && srcs.includes(`${MAP}/${MEET_SCRIPT}`), 'De meetstand moet na de modules van het prototype laden.');
  // De klas is verzonnen: geen enkele andere naam dan de bekende acht.
  eis(html.includes(`const VOORBEELDKLAS = ${VOORBEELDKLAS};`), 'De voorbeeldklas ontbreekt of is veranderd.');
}

/** Bouwt de hele uitvoer in het geheugen: Map van relatief pad (met /) naar Buffer. */
export function bouw() {
  const vendor = leesVendor();
  const bron = readFileSync(path.join(HIER, 'lichtkamer.html'), 'utf8');
  const bestanden = new Map();
  bestanden.set(PAGINA, Buffer.from(maakPagina(bron, vendor), 'utf8'));
  for (const f of [...EIGEN_SCRIPTS, MEET_SCRIPT]) {
    const p = path.join(HIER, f);
    eis(existsSync(p), `${f} ontbreekt in tools/prototypes/lichtkamer.`);
    bestanden.set(`${MAP}/${f}`, readFileSync(p));
  }
  for (const [rel, inhoud] of [...vendor].sort(([a], [b]) => (a < b ? -1 : 1))) bestanden.set(`${MAP}/three/${rel}`, inhoud);
  controleer(bestanden);
  return bestanden;
}

/** Schrijft de uitvoer; de map `lichtkamer/` is van dit script en wordt eerst leeggemaakt. */
export function schrijf(uitMap, bestanden) {
  rmSync(path.join(uitMap, MAP), { recursive: true, force: true });
  for (const [rel, inhoud] of bestanden) {
    const doel = path.join(uitMap, ...rel.split('/'));
    mkdirSync(path.dirname(doel), { recursive: true });
    writeFileSync(doel, inhoud);
  }
}

function main() {
  const i = process.argv.indexOf('--uit');
  const uit = i >= 0 ? path.resolve(process.argv[i + 1] ?? '') : STANDAARD_UIT;
  if (i >= 0 && !process.argv[i + 1]) {
    console.error('Geef na --uit een map mee.');
    process.exit(1);
  }
  try {
    const bestanden = bouw();
    schrijf(uit, bestanden);
    const totaal = [...bestanden.values()].reduce((s, b) => s + b.length, 0);
    const pagina = bestanden.get(PAGINA).length;
    console.log(`Geschreven in ${uit}: ${PAGINA} (${pagina} bytes) en ${bestanden.size - 1} bestanden in ${MAP}/ (samen ${totaal} bytes).`);
  } catch (e) {
    if (e instanceof ControleFout) {
      console.error(`Mislukt, er is niets geschreven:\n${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
