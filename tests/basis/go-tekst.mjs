// Schrijft de zichtbare tekst van elk lesplan van het GO! naar bestanden, voor de nakijkers die ze naast het origineel leggen.
// Per lesplan één map met 'kop.txt' (kop, onderregel, bronvermelding, 'In het kort') en één bestand per deel van het
// lesplan ('deel-1.txt', ...), zoals een leerling of leerkracht ze op het scherm leest (innerText, 1360 px breed).
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/basis/go-tekst.mjs
//
// Uitvoer: GO_TEKST_MAP (standaard de map go-scherm-tekst/ in de tijdelijke map van het systeem). Een andere poort geef je mee met
// SMOKE_BASE=http://localhost:<poort>. Het script vergelijkt niets zelf: het geeft de tekst door en faalt alleen als een
// lesplan niet laadt of een console- of paginafout optreedt.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GO_LESPLANNEN } from './go.mjs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const UIT = process.env.GO_TEKST_MAP || join(tmpdir(), 'go-scherm-tekst');
const errors = [];

const start = Date.now();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
let bestanden = 0;
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await p.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'));
  for (const code of GO_LESPLANNEN) {
    await p.goto(`${BASE}/#/basis/lesplan/${code}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('.b-lesplan .b-lp-tabel', { timeout: 20000 });
    const t = await p.evaluate(() => {
      const t = (e) => (e ? e.innerText.trim() : '');
      const kop = [t(document.querySelector('.b-lesplan h1')), t(document.querySelector('.b-lesplan .b-onderregel')), t(document.querySelector('.b-lesplan .b-lp-bron')), t(document.querySelector('.b-lp-kort'))];
      const meta = t(document.querySelector('.b-lp-meta'));
      const delen = [...document.querySelectorAll('.b-lp-deel')].map((d) => t(d));
      return { kop, meta, delen };
    });
    const map = join(UIT, code);
    mkdirSync(map, { recursive: true });
    writeFileSync(join(map, 'kop.txt'), `${t.kop.filter(Boolean).join('\n\n')}\n\n${t.meta}\n`);
    t.delen.forEach((d, n) => writeFileSync(join(map, `deel-${n + 1}.txt`), `${d}\n`));
    bestanden += 1 + t.delen.length;
    console.log(`  ${code}: kop + ${t.delen.length} delen`);
  }
} finally {
  await browser.close();
}
console.log(`\n${bestanden} bestanden geschreven naar ${UIT} (${((Date.now() - start) / 1000).toFixed(1)} s)`);
if (errors.length) {
  console.log(`\n${errors.length} console-/paginafout(en):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
