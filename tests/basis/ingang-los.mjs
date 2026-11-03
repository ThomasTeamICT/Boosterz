// Voert alleen de rooktest van het deel basisonderwijs uit (tests/basis/ingang.mjs), zonder de lange tests/smoke.mjs.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/basis/ingang-los.mjs
//
// Een andere poort geef je mee met SMOKE_BASE=http://localhost:<poort>. Faalt (exit 1) bij een mislukte check of bij een
// console- of paginafout, en meldt de duur (doel: onder een minuut).

import { chromium } from 'playwright-core';
import { basisIngang } from './ingang.mjs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
let failures = 0;

function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ FAIL: ${name}`);
    failures++;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const start = Date.now();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
try {
  await basisIngang({ browser, BASE, check, errors, sleep });
} finally {
  await browser.close();
}
const duur = ((Date.now() - start) / 1000).toFixed(1);

if (errors.length) {
  console.log(`\n${errors.length} console-/paginafout(en):`);
  for (const e of errors) console.log(`  - ${e}`);
}
console.log(`\nDuur: ${duur} s`);
console.log(failures || errors.length ? `\n${failures} check(s) mislukt, ${errors.length} fout(en).` : '\nAlle checks van het basisdeel zijn groen.');
process.exit(failures || errors.length ? 1 : 0);
