#!/usr/bin/env node
// Rooktest voor de 3D-proefpagina van de Lichtkamer (LK-3). Playwright, Chromium met
// software-WebGL (SwiftShader): de getallen zeggen niets over een echt toestel, maar de
// pagina, de meetstand en de drie standen moeten werken.
//
//   node tools/prototypes/lichtkamer/maak-proef.mjs
//   npm run build        (of: de bestanden staan al in public/proef/ en vite preview toont dist/)
//   node node_modules/vite/bin/vite.js preview --port 5002 --strictPort &
//   PROEF_BASE=http://localhost:5002/Boosterz LK_PROEF_BASE=... node tools/prototypes/lichtkamer/rooktest-proef.mjs
//
// Het adres: LK_PROEF_BASE, anders PROEF_BASE, anders http://localhost:4183.
// Chromium: PW_CHROMIUM of /opt/pw-browsers/chromium. Exit 0 bij succes; exit 1 met een lijst.
//
// Gecontroleerd:
//  - zonder ?meet: geen fouten in de console, geen enkele aanvraag buiten de eigen herkomst,
//    geen meetstand, noindex, één main en één h1, geen horizontaal scrollen op 390 px;
//  - met ?meet in alle drie de standen: eerste beeld gemeten, p95 gemeten en leesbaar in de tekst,
//    GO of NO-GO volgens de drempels, de stand 'licht' zet pixelverhouding 1 en de eenvoudige schaduwrand;
//  - de uitslag overleeft het herladen tussen de standen (sessionStorage);
//  - de meetstand past op 390 px breed.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(REPO, 'package.json'));
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('playwright-core');
}
const { chromium } = playwright;

const BASE = (process.env.LK_PROEF_BASE || process.env.PROEF_BASE || 'http://localhost:4183').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const PAGINA = `${BASE}/proef/lichtkamer-proef.html`;
const CHROMIUM = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const fouten = [];
function check(naam, voorwaarde, detail = '') {
  if (voorwaarde) {
    console.log(`  ok    ${naam}`);
  } else {
    console.log(`  FOUT  ${naam}${detail ? ` (${detail})` : ''}`);
    fouten.push(detail ? `${naam}: ${detail}` : naam);
  }
}

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** Een pagina met bewaking: console, pagina-fouten en aanvragen buiten de eigen herkomst. */
async function open(context, url, bestaande) {
  const p = bestaande || (await context.newPage());
  const log = { console: [], extern: [], mislukt: [] };
  p.on('pageerror', (e) => log.console.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text();
      if (/GPU stall|ReadPixels|swiftshader|GL Driver Message/i.test(t)) return; // software-WebGL: bekende melding
      log.console.push(`${m.type()}: ${t.slice(0, 300)}`);
    }
  });
  p.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (new URL(u).origin !== ORIGIN) log.extern.push(u);
  });
  p.on('response', (r) => { if (r.status() >= 400) log.mislukt.push(`${r.status()} ${r.url()}`); });
  await p.goto(url, { waitUntil: 'load' });
  return { p, log };
}

async function wachtOpEerste(p) {
  await p.waitForFunction(() => window.__lkMeet && window.__lkMeet.eerste() && window.__lkMeet.eerste().ms, null, { timeout: 60_000 });
}

async function leesUitslag(p) {
  return p.evaluate(() => window.__lkMeet.uitslag());
}

try {
  // ── 1. de gewone pagina, zonder ?meet ─────────────────────────────────────
  console.log('Pagina zonder ?meet');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { p, log } = await open(context, PAGINA);
    await p.waitForTimeout(3000);
    check('de kijkdoos staat er (WebGL-canvas met afmeting)', await p.evaluate(() => { const c = document.querySelector('#cv'); return !!c && c.width > 100 && c.height > 100 && !!window.LK && !!window.LK.W && !!window.LK.W.r; }));
    check('de scène heeft inhoud', await p.evaluate(() => window.LK.W.root.children.length > 0));
    check('geen meetstand zonder ?meet', (await p.locator('#meetstand').count()) === 0);
    check('noindex', (await p.locator('meta[name="robots"]').getAttribute('content')) === 'noindex');
    check('één main en één h1', (await p.locator('main').count()) === 1 && (await p.locator('h1').count()) === 1);
    check('geen link-elementen behalve het lege icoontje (geen lettertypes van buiten)', await p.evaluate(() => [...document.querySelectorAll('link')].every((l) => l.rel === 'icon' && l.getAttribute('href') === 'data:,')));
    check('alle scripts zijn lokaal', await p.evaluate(() => [...document.scripts].filter((s) => s.src).every((s) => new URL(s.src).origin === location.origin)));
    check('geen aanvraag buiten de eigen herkomst', log.extern.length === 0, log.extern.join(', '));
    check('geen mislukte aanvraag (404 of erger)', log.mislukt.length === 0, log.mislukt.join(', '));
    check('geen fouten of waarschuwingen in de console', log.console.length === 0, log.console.join(' | '));
    check('geen opslag onder de sleutel van het prototype (lichtkamer.v1)', await p.evaluate(() => localStorage.getItem('lichtkamer.v1') === null));
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(800);
    check('390 px: niet horizontaal scrollen', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), await p.evaluate(() => `${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}`));
    await context.close();
  }

  // ── 2. de meetstand, in drie standen, met herladen ertussen ──────────────
  console.log('Meetstand, drie standen');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Eén tabblad dat herlaadt, zoals op een toestel: de uitslag blijft in sessionStorage staan.
    let p = null;
    let log = null;
    for (const stand of ['bord', 'licht', 'gewoon']) {
      const url = `${PAGINA}?meet&stand=${stand}&duur=2500${stand === 'gewoon' ? '&auto' : ''}`;
      if (p === null) ({ p, log } = await open(context, url));
      else await p.goto(url, { waitUntil: 'load' });
      await wachtOpEerste(p);
      const eerste = await p.evaluate(() => window.__lkMeet.eerste());
      check(`${stand}: eerste beeld gemeten`, eerste.stand === stand && eerste.ms > 0 && eerste.ms < 60_000, JSON.stringify(eerste));
      check(`${stand}: de meetstand staat op het scherm`, (await p.locator('#meetstand').count()) === 1 && (await p.locator('#meet-uitslag').isVisible()));
      if (stand === 'bord') check('bord: de digibordstand is actief', await p.evaluate(() => document.body.classList.contains('bord')));
      if (stand === 'licht') check('licht: pixelverhouding 1 en eenvoudige schaduwrand', await p.evaluate(() => window.LK.W.r.getPixelRatio() === 1 && window.LK.W.r.shadowMap.type === THREE.PCFShadowMap));
      if (stand === 'gewoon') {
        // ?auto meet alle drie de standen na elkaar
        await p.waitForFunction(() => { const u = window.__lkMeet.uitslag(); return ['bord', 'gewoon', 'licht'].every((n) => u[n] && (u[n].p95 !== undefined || u[n].fout)); }, null, { timeout: 120_000 });
        const u = await leesUitslag(p);
        for (const n of ['bord', 'gewoon', 'licht']) {
          check(`${n}: p95 gemeten`, typeof u[n].p95 === 'number' && u[n].p95 > 0 && !u[n].fout, JSON.stringify(u[n]));
          check(`${n}: genoeg beelden voor een p95`, u[n].frames >= 8, `${u[n].frames} beelden`);
          console.log(`        ${n}: eerste beeld ${u[n].eersteMs} ms, p95 ${u[n].p95} ms, gemiddeld ${u[n].gemiddeld} ms (${u[n].fps}/s), traagste ${u[n].max} ms, tekenen p95 ${u[n].renderP95} ms, canvas ${u[n].breed}x${u[n].hoog}`);
        }
        check('na de laatste meting staat de stand op licht (pixelverhouding 1)', await p.evaluate(() => window.LK.W.r.getPixelRatio() === 1));
        const tekst = await p.locator('#meet-uitslag').innerText();
        for (const n of ['Digibord', 'Gewoon', 'Licht']) {
          const regel = tekst.split('\n').find((r) => r.startsWith(`${n}:`)) || '';
          check(`de tekst heeft een regel voor ${n} met p95 en oordeel`, /p95 [\d.]+ ms/.test(regel) && /(?:-> GO|-> NO-GO)/.test(regel), regel);
        }
        check('de tekst noemt de drempels', /p95 hoogstens 50 ms, eerste beeld binnen 5 s/.test(tekst));
        console.log(tekst.split('\n').map((r) => `        | ${r.slice(0, 200)}`).join('\n'));
      }
      check(`${stand}: geen aanvraag buiten de eigen herkomst`, log.extern.length === 0, log.extern.join(', '));
      check(`${stand}: geen fouten of waarschuwingen in de console`, log.console.length === 0, log.console.join(' | '));
    }
    await context.close();
  }

  // ── 3. de meetstand op 390 px ─────────────────────────────────────────────
  console.log('Meetstand op 390 px');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const { p } = await open(context, `${PAGINA}?meet`);
    await wachtOpEerste(p);
    const m = await p.evaluate(() => { const r = document.querySelector('#meetstand').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    check('het paneel valt binnen het scherm', m.l >= 0 && m.r <= m.w && m.b <= m.h, JSON.stringify(m));
    check('niet horizontaal scrollen', m.sw <= m.cw, JSON.stringify(m));
    const kleinste = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#meetstand button, #meetstand a')].map((e) => e.getBoundingClientRect().height)));
    check('knoppen van minstens 44 px hoog', kleinste >= 44, `${kleinste}`);
    await context.close();
  }
} finally {
  await browser.close();
}

if (fouten.length) {
  console.log(`\n${fouten.length} fout(en):\n- ${fouten.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAlles in orde.');
