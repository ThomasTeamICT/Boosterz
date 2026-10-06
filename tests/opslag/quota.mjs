// Rooktest voor een volle of weigerende IndexedDB: draait tegen een preview-build.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/opslag/quota.mjs
//
// Wat hier bewaakt wordt (debugronde oktober 2026, OP1 en OP5):
//  1. Migratie bij een volle opslag: een oude widget met een foto als data-URL
//     in localStorage. IndexedDB heeft geen plaats (quota via CDP verlaagd).
//     De migratie bij het opstarten mag de data-URL dan NIET vervangen door
//     een wfmedia:-verwijzing; de foto blijft zichtbaar, ook na herladen.
//  2. Upload bij een volle opslag: een afbeelding kiezen in de editor. De
//     widget moet een data-URL krijgen (terugval), geen verwijzing naar een
//     blob die nooit bewaard werd; de foto blijft zichtbaar na herladen.
//  3. IndexedDB die nooit antwoordt (Safari, privévenster): na de
//     tijdslimiet valt de upload terug op een data-URL in plaats van stil te
//     blijven hangen.
//
// Elk deel krijgt een vers browserprofiel. Faalt hard (exit 1) bij een
// mislukte check of bij console-/paginafouten.

import { chromium } from 'playwright-core';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
let failures = 0;

function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Een png vol ruis: comprimeert slecht, dus gegarandeerd groter dan de quota ──
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function noisePng(w, h) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rowLen = w * 3 + 1; const raw = randomBytes(rowLen * h);
  for (let y = 0; y < h; y++) raw[y * rowLen] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };

async function newPage(label, initScript) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Testomgeving: TLS-proxy die deze Chromium niet kent (Google Fonts). Geen fout van de app.
    if (/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
    errors.push(`${label} console: ${m.text()}`);
  });
  page.on('dialog', async (d) => { console.log(`  (melding: ${d.message()})`); await d.dismiss(); });
  return { ctx, page };
}

async function setQuota(ctx, page, bytes) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(BASE).origin, quotaSize: bytes });
}

/** Widget in localStorage zetten, zoals de app hem zelf zou bewaren. */
async function putWidget(page, widget) {
  await page.evaluate((w) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').filter((x) => x.id !== w.id);
    ws.unshift({ ...w, createdAt: Date.now(), updatedAt: Date.now() });
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  }, widget);
}

async function imageUrlOf(page, id) {
  return page.evaluate((id) => {
    const w = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').find((x) => x.id === id);
    return w ? String(w.config.imageUrl ?? '') : null;
  }, id);
}

/** Sleutels in de bestandsdatabase (leeg als IndexedDB niet antwoordt). */
async function idbKeys(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const t = setTimeout(() => resolve([]), 2000);
    try {
      const r = indexedDB.open('wf-files', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
      r.onsuccess = () => {
        const db = r.result;
        const q = db.transaction('pdfs').objectStore('pdfs').getAllKeys();
        q.onsuccess = () => { clearTimeout(t); resolve(q.result.map(String)); db.close(); };
        q.onerror = () => { clearTimeout(t); resolve([]); db.close(); };
      };
      r.onerror = () => { clearTimeout(t); resolve([]); };
    } catch { clearTimeout(t); resolve([]); }
  }));
}

/** Nooit een verwijzing zonder blob: elke wfmedia:-id moet in IndexedDB staan. */
function refHasBlob(url, keys) {
  if (!url.startsWith('wfmedia:')) return true;
  return keys.includes(url.slice('wfmedia:'.length));
}

async function playerImage(page) {
  return page.evaluate(() => {
    const img = document.querySelector('.player-shell img');
    return { src: img?.getAttribute('src') ?? '', natural: img?.naturalWidth ?? 0 };
  });
}

/** Wacht tot de speler een geladen afbeelding toont (of geeft het na `ms` op). */
async function waitPlayerImage(page, ms = 6000) {
  const end = Date.now() + ms;
  let img = await playerImage(page);
  while (img.natural === 0 && Date.now() < end) { await sleep(250); img = await playerImage(page); }
  return img;
}

async function waitImageUrl(page, id, ms) {
  const end = Date.now() + ms;
  let url = await imageUrlOf(page, id);
  while (!url && Date.now() < end) { await sleep(250); url = await imageUrlOf(page, id); }
  return url ?? '';
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

// ── 1. Migratie bij een volle opslag ────────────────────────────────────────
console.log('1. Migratie van een oude data-URL bij een volle IndexedDB');
{
  const { ctx, page } = await newPage('migratie');
  await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' }); await sleep(800);
  await setQuota(ctx, page, 100 * 1024);
  const dataUrl = 'data:image/png;base64,' + noisePng(300, 300).toString('base64');
  await putWidget(page, { id: 'quota-oud', type: 'imageviewer', title: 'Oude widget met foto', folderId: null, config: { imageUrl: dataUrl, description: 'test' }, settings: SETTINGS, code: 'QOUD11' });
  check('voor het herladen staat de foto als data-URL in de opslag', (await imageUrlOf(page, 'quota-oud')) === dataUrl);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(5000); // opstartonderhoud: migrateDataUrls probeert te verhuizen
  const after = await imageUrlOf(page, 'quota-oud');
  const keys = await idbKeys(page);
  check('na de mislukte migratie staat de data-URL er nog, ongewijzigd', after === dataUrl);
  check('geen verwijzing naar een blob die niet bewaard is', refHasBlob(after ?? '', keys));
  await page.goto(BASE + '/#/speel/QOUD11', { waitUntil: 'networkidle' });
  check('leerlingweergave toont de foto', (await waitPlayerImage(page)).natural > 0);
  await page.reload({ waitUntil: 'networkidle' });
  const img = await waitPlayerImage(page);
  check(`na herladen nog altijd zichtbaar (${img.src.slice(0, 22)}…)`, img.natural > 0);
  await sleep(3000); // nog een migratiebeurt na het herladen
  check('ook na een tweede opstart blijft de data-URL staan', (await imageUrlOf(page, 'quota-oud')) === dataUrl);
  await ctx.close();
}

// ── 2. Upload bij een volle opslag ──────────────────────────────────────────
console.log('2. Afbeelding uploaden bij een volle IndexedDB');
{
  const { ctx, page } = await newPage('upload');
  await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' }); await sleep(800);
  await setQuota(ctx, page, 100 * 1024);
  await putWidget(page, { id: 'quota-upload', type: 'imageviewer', title: 'Upload bij volle opslag', folderId: null, config: { imageUrl: '', description: 'test' }, settings: SETTINGS, code: 'QUPL11' });
  await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' }); await sleep(500);
  await page.goto(BASE + '/#/bewerk/quota-upload', { waitUntil: 'networkidle' }); await sleep(800);
  await page.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: 'ruis.png', mimeType: 'image/png', buffer: noisePng(500, 500) });
  const url = await waitImageUrl(page, 'quota-upload', 10000);
  const keys = await idbKeys(page);
  check(`de widget kreeg een data-URL als terugval (${url.slice(0, 22)}…)`, url.startsWith('data:image/'));
  check('geen verwijzing naar een blob die niet bewaard is', refHasBlob(url, keys));
  await page.goto(BASE + '/#/speel/QUPL11', { waitUntil: 'networkidle' });
  check('leerlingweergave toont de foto', (await waitPlayerImage(page)).natural > 0);
  await page.reload({ waitUntil: 'networkidle' });
  check('na herladen nog altijd zichtbaar', (await waitPlayerImage(page)).natural > 0);
  await sleep(3000);
  const later = (await imageUrlOf(page, 'quota-upload')) ?? '';
  check('na een opstartbeurt geen verweesde verwijzing', later.startsWith('data:image/') || refHasBlob(later, await idbKeys(page)));
  await ctx.close();
}

// ── 3. IndexedDB die nooit antwoordt ────────────────────────────────────────
console.log('3. Afbeelding uploaden als IndexedDB nooit antwoordt');
{
  // indexedDB.open geeft een verzoek terug dat nooit success of error meldt.
  const hang = () => { indexedDB.open = function () { return new EventTarget(); }; };
  const { ctx, page } = await newPage('hangt', hang);
  await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' }); await sleep(1500);
  await putWidget(page, { id: 'idb-hangt', type: 'imageviewer', title: 'IndexedDB hangt', folderId: null, config: { imageUrl: '', description: 'test' }, settings: SETTINGS, code: 'QHNG11' });
  await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' }); await sleep(500);
  await page.goto(BASE + '/#/bewerk/idb-hangt', { waitUntil: 'networkidle' }); await sleep(800);
  await page.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: noisePng(200, 200) });
  // tijdslimiet van IndexedDB (5 s) + marge
  const url = await waitImageUrl(page, 'idb-hangt', 12000);
  check(`na de tijdslimiet kreeg de widget een data-URL (${url.slice(0, 22)}…)`, url.startsWith('data:image/'));
  check('de editor toont de gekozen foto', (await page.locator('.field img').count()) >= 1);
  await page.goto(BASE + '/#/speel/QHNG11', { waitUntil: 'networkidle' });
  check('leerlingweergave toont de foto', (await waitPlayerImage(page)).natural > 0);
  await page.reload({ waitUntil: 'networkidle' });
  check('na herladen nog altijd zichtbaar', (await waitPlayerImage(page)).natural > 0);
  await ctx.close();
}

// ── Slot ────────────────────────────────────────────────────────────────────
console.log('\n──────────');
if (errors.length) {
  console.log('Console-/paginafouten:');
  for (const e of [...new Set(errors)]) console.log('  •', e.slice(0, 300));
  failures += errors.length;
} else {
  console.log('Geen console- of paginafouten. ✓');
}
console.log(failures === 0 ? 'ALLE CHECKS GESLAAGD ✓' : `${failures} CHECKS GEFAALD ✗`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
