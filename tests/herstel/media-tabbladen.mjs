// Rooktest herstelpakket P1 (debugronde oktober 2026): afbeeldingen in IndexedDB
// niet wissen zolang een ander tabblad van de app ze nog toont.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4311 --strictPort &
//   SMOKE_BASE=http://localhost:4311 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/media-tabbladen.mjs
//
// De opruimronde bij het opstarten wist blobs waar localStorage niet naar verwijst en die
// ouder zijn dan 10 minuten. Een editor met gepauzeerd of mislukt bewaren heeft zo'n
// afbeelding wel op het scherm. "Ouder dan 10 minuten" bootsen we na door createdAt van het
// IndexedDB-record terug te zetten. Twee tabbladen zijn twee pagina's in dezelfde
// browsercontext (zelfde opslag, dezelfde Web Locks).
//
//  E1  cursuseditor en widget-editor: afbeelding gekozen tijdens een conflict (of bij een
//      volle opslag), een nieuw tabblad start op, daarna "Mijn versie bewaren" of "Opnieuw
//      proberen": na herladen is de afbeelding er nog
//  B1  widget verwijderd in een ander tabblad, "Opnieuw bewaren" in de editor: afbeelding blijft
//  E3  cursus verwijderd in een ander tabblad, "Toch bewaren" in de editor: afbeelding blijft
//  Eén tabblad: een oude wees wordt nog altijd opgeruimd (bij opstart en bij verwijderen),
//      en wat bleef staan zolang een ander tabblad open was, verdwijnt bij een opstart alleen
//  Privacypagina: leerlinggegevens wissen wist de tekeningen, ook met een ander tabblad open
//
// Faalt hard (exit 1) bij een mislukte controle, een paginafout of een consolefout.

import { chromium } from 'playwright-core';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;
const errors = [];

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Inhoud ──────────────────────────────────────────────────────────────────

// Een png van 2×2 pixels (rood, groen, blauw, wit).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAAMIM/////w8AH+4F+7C4l8kAAAAASUVORK5CYII=';
const PNG = { name: 'plaat.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') };

const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };
const plaat = (imageUrl = '', over = {}) => ({
  id: 'wi', type: 'imageviewer', title: 'Plaat', folderId: null, code: 'PLAAT1', createdAt: 1, updatedAt: Date.now() - 60_000,
  settings: SETTINGS, config: { imageUrl, description: 'Een plaat.' }, ...over,
});
const cursus = (url = '') => ({
  id: 'c1', title: 'Testcursus', author: 'Juf Test', coverEmoji: '📘', code: 'EDT123',
  chapters: [{ id: 'ch1', title: 'Hoofdstuk 1', sections: [{ id: 's1', title: 'Sectie 1', blocks: [{ id: 'i1', type: 'image', url, size: 'normal' }] }] }],
  settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true }, createdAt: 1, updatedAt: 1000,
});

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const geopend = [];

/**
 * Vers profiel. `opslag` gaat één keer in localStorage vóór de app laadt; `blobs` (id → leeftijd
 * in ms) worden als png-record in IndexedDB gezet, ook vóór de app laadt.
 */
async function profiel({ opslag = {}, blobs = {}, width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript((o) => {
    try {
      if (localStorage.getItem('__herstel_gezaaid')) return;
      localStorage.setItem('wf.prefs.v1', JSON.stringify({ onboarded: true }));
      localStorage.setItem('wf.democursus.v1', '1');
      for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v);
      localStorage.setItem('__herstel_gezaaid', '1');
    } catch { /* about:blank heeft geen opslag */ }
  }, opslag);
  ctx.setDefaultTimeout(8000);
  geopend.push(ctx);
  if (Object.keys(blobs).length) {
    // IndexedDB vullen op een pagina buiten de app (zelfde origin), zodat de eerste opstart ze al ziet.
    const p = await waarnemer(ctx);
    await zaai(p, blobs);
    await p.close();
  }
  return ctx;
}

/** Een pagina van dezelfde origin, maar zonder de app: om IndexedDB en de sloten van buitenaf te bekijken. */
async function waarnemer(ctx) {
  const p = await ctx.newPage();
  await p.route(BASE + 'leeg.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>leeg</title>' }));
  await p.goto(BASE + 'leeg.html');
  return p;
}

/** Png-records in IndexedDB zetten: id → leeftijd in ms. */
const zaai = (p, blobs) => p.evaluate(async ({ png, blobs }) => {
  const bin = atob(png);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  await new Promise((res, rej) => {
    const r = indexedDB.open('wf-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pdfs', { keyPath: 'id' });
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction('pdfs', 'readwrite');
      for (const [id, leeftijd] of Object.entries(blobs)) {
        const blob = new Blob([bytes], { type: 'image/png' });
        tx.objectStore('pdfs').put({ id, name: id + '.png', blob, size: blob.size, createdAt: Date.now() - leeftijd });
      }
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
}, { png: PNG_B64, blobs });

/** Een tabblad in de context, met fouten en dialogen bijgehouden. */
async function tab(ctx, hash) {
  const p = await ctx.newPage();
  bewaak(p);
  if (hash) await naar(p, hash);
  return p;
}
function bewaak(p) {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Volle opslag: de app logt de mislukte bewaring zelf (bewust, zie storage.ts).
    if (/ERR_CERT_AUTHORITY_INVALID|ERR_FAILED|Failed to load resource|Opslaan mislukt/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  p.on('dialog', async (d) => { if (d.type() === 'beforeunload') await d.accept(); else await d.dismiss(); });
}
const naar = async (p, hash) => { await p.goto(BASE + hash, { waitUntil: 'networkidle' }); await sleep(400); };

/** Een geval dat onverwacht stukloopt (time-out, ontbrekend element) telt als gefaalde controle. */
async function geval(fn) {
  try { await fn(); } catch (e) { check('onverwachte fout in het geval', false, String(e.message).split('\n')[0]); }
}

/** De id's van alle mediarecords in IndexedDB. */
const media = (p) => p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('wf-files', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('pdfs', { keyPath: 'id' });
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('pdfs').objectStore('pdfs').getAllKeys();
    q.onsuccess = () => { db.close(); res(q.result.map(String).filter((k) => k.startsWith('m_')).sort()); };
    q.onerror = () => { db.close(); res([]); };
  };
  r.onerror = () => res([]);
}));

/** Alle mediarecords een uur ouder maken ("na 10 minuten"). */
const terugdateren = (p) => p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('wf-files', 1);
  r.onsuccess = () => {
    const db = r.result;
    const t = db.transaction('pdfs', 'readwrite');
    const s = t.objectStore('pdfs');
    const q = s.getAll();
    q.onsuccess = () => { for (const rec of q.result) if (String(rec.id).startsWith('m_')) { rec.createdAt = Date.now() - 3600e3; s.put(rec); } };
    t.oncomplete = () => { db.close(); res(); };
  };
}));

/** Aantal tabbladen dat het mediaslot vasthoudt (zoals een ander tabblad het ziet). */
const slothouders = (p) => p.evaluate(async () => {
  const s = await navigator.locks.query();
  return [...(s.held || []), ...(s.pending || [])].filter((l) => String(l.name).startsWith('wf-media-tabblad:')).length;
});

/** Wacht tot de lijst mediarecords aan `ok` voldoet (de opruimronde loopt na het opstarten). */
async function wachtOpMedia(p, ok, ms = 8000) {
  const t0 = Date.now();
  let ids = await media(p);
  while (!ok(ids) && Date.now() - t0 < ms) { await sleep(200); ids = await media(p); }
  return ids;
}

/** Een nieuw tabblad start op en krijgt de tijd voor zijn opruimronde (requestIdleCallback). */
async function nieuwTabblad(ctx, hash = '#/widgets') {
  const p = await tab(ctx, hash);
  await sleep(3500);
  return p;
}

/** Toont de afbeelding (selector) echt iets na herladen? */
const afbeelding = (p, sel) => p.evaluate((sel) => {
  const img = document.querySelector(sel);
  return img ? { src: (img.getAttribute('src') || '').slice(0, 24), ok: img.complete && img.naturalWidth > 0 } : null;
}, sel);
async function wachtOpAfbeelding(p, sel, ms = 5000) {
  const t0 = Date.now();
  let a = await afbeelding(p, sel);
  while (!(a && a.ok) && Date.now() - t0 < ms) { await sleep(200); a = await afbeelding(p, sel); }
  return a;
}

const widgetIn = (p, id = 'wi') => p.evaluate((id) => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').find((w) => w.id === id), id);
const cursusIn = (p, id = 'c1') => p.evaluate((id) => JSON.parse(localStorage.getItem('wf.courses.v1') || '[]').find((c) => c.id === id), id);
const refIn = (x) => (JSON.stringify(x ?? null).match(/wfmedia:(m_[A-Za-z0-9_-]+)/) || [])[1] ?? null;

const CURSUS_IMG = '.editor-item img';
const WIDGET_IMG = '#panel-content img';

// ── Het slot zelf ───────────────────────────────────────────────────────────

console.log('Het slot. Een tabblad met media houdt het vast; sluiten geeft het vrij');
await geval(async () => {
  const ctx = await profiel({ opslag: { 'wf.widgets.v1': JSON.stringify([plaat('wfmedia:m_plaat')]) }, blobs: { m_plaat: 3600e3 } });
  const w = await waarnemer(ctx);
  check('vooraf: geen houder', (await slothouders(w)) === 0, String(await slothouders(w)));
  const a = await tab(ctx, '#/bewerk/wi');
  check('A toont de afbeelding', (await wachtOpAfbeelding(a, WIDGET_IMG))?.ok === true);
  check('A houdt het slot vast (één houder)', (await slothouders(w)) === 1, String(await slothouders(w)));
  const b = await tab(ctx, '#/widgets');
  await sleep(500);
  check('B (lijst met dezelfde widget) houdt het ook: twee houders, elk met een eigen naam', (await slothouders(w)) === 2, String(await slothouders(w)));
  await a.close();
  await b.close();
  await sleep(300);
  check('A en B gesloten: geen houder meer', (await slothouders(w)) === 0, String(await slothouders(w)));
  await ctx.close();
});

// ── E1: cursuseditor ────────────────────────────────────────────────────────

console.log('E1. Cursuseditor: afbeelding gekozen tijdens een conflict, nieuw tabblad, "Mijn versie bewaren"');
await geval(async () => {
  const ctx = await profiel({ opslag: { 'wf.courses.v1': JSON.stringify([cursus()]) } });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  await b.getByLabel('Titel van hoofdstuk 1').fill('VAN-B');
  await sleep(100);
  await a.getByLabel('Titel van de sectie').fill('VAN-A');
  await sleep(1800);
  check('A heeft een conflict', (await a.locator('.course-editor-alert').count()) === 1);
  await a.locator('.editor-item input[type=file]').first().setInputFiles(PNG);
  check('A toont de nieuwe afbeelding', (await wachtOpAfbeelding(a, CURSUS_IMG))?.ok === true);
  const ids = await media(a);
  check('de afbeelding staat in IndexedDB', ids.length === 1, JSON.stringify(ids));
  check('maar nog niet in localStorage', refIn(await cursusIn(a)) === null);
  await terugdateren(a);
  const c = await nieuwTabblad(ctx, '#/cursussen');
  check('na de opstart van een nieuw tabblad staat de afbeelding er nog', JSON.stringify(await media(c)) === JSON.stringify(ids), JSON.stringify(await media(c)));
  await a.getByRole('button', { name: 'Mijn versie bewaren' }).click();
  await sleep(800);
  check('"Mijn versie bewaren" bewaart de verwijzing', refIn(await cursusIn(a)) === ids[0], refIn(await cursusIn(a)));
  await c.close();
  await b.close();
  await a.reload({ waitUntil: 'networkidle' });
  const img = await wachtOpAfbeelding(a, CURSUS_IMG);
  check('na herladen toont de editor de afbeelding', img?.ok === true, JSON.stringify(img));
  await ctx.close();
});

console.log('E1. Cursuseditor: afbeelding gekozen bij een volle opslag, "Opslag bekijken", "Opnieuw proberen"');
await geval(async () => {
  const ctx = await profiel({ opslag: { 'wf.courses.v1': JSON.stringify([cursus()]) } });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const vulsleutels = await a.evaluate(() => {
    const keys = [];
    let size = 1 << 20;
    let i = 0;
    while (size >= 1) {
      try { localStorage.setItem(`__vul_${i}`, 'x'.repeat(size)); keys.push(`__vul_${i}`); i++; } catch { size = Math.floor(size / 2); }
    }
    return keys;
  });
  await a.locator('.editor-item input[type=file]').first().setInputFiles(PNG);
  await sleep(1500);
  check('de opslag is vol: "Niet bewaard"', (await a.locator('.course-save-state').innerText()).includes('Niet bewaard'));
  check('A toont de nieuwe afbeelding', (await wachtOpAfbeelding(a, CURSUS_IMG))?.ok === true);
  const ids = await media(a);
  check('de afbeelding staat in IndexedDB', ids.length === 1, JSON.stringify(ids));
  await terugdateren(a);
  const [c] = await Promise.all([ctx.waitForEvent('page'), a.getByRole('link', { name: 'Opslag bekijken' }).click()]);
  bewaak(c);
  await c.waitForLoadState('networkidle');
  await sleep(3500);
  check('"Opslag bekijken" opende een nieuw tabblad', c.url().includes('#/privacy'), c.url());
  check('na de opstart van dat tabblad staat de afbeelding er nog', JSON.stringify(await media(c)) === JSON.stringify(ids), JSON.stringify(await media(c)));
  await a.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), vulsleutels);
  await a.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await sleep(800);
  check('"Opnieuw proberen" bewaart de verwijzing', refIn(await cursusIn(a)) === ids[0], refIn(await cursusIn(a)));
  await c.close();
  await a.reload({ waitUntil: 'networkidle' });
  const img = await wachtOpAfbeelding(a, CURSUS_IMG);
  check('na herladen toont de editor de afbeelding', img?.ok === true, JSON.stringify(img));
  await ctx.close();
});

// ── E1: widget-editor ───────────────────────────────────────────────────────

console.log('E1. Widget-editor: afbeelding gekozen tijdens een conflict, nieuw tabblad, "Mijn versie bewaren"');
await geval(async () => {
  const ctx = await profiel({ opslag: { 'wf.widgets.v1': JSON.stringify([plaat()]) } });
  const a = await tab(ctx, '#/bewerk/wi');
  const b = await tab(ctx, '#/bewerk/wi');
  await a.getByLabel('Titel van de widget').fill('Titel A');
  await sleep(150);
  await b.getByLabel('Titel van de widget').fill('Titel B');
  await sleep(1500);
  check('B heeft een conflict', (await b.getByRole('button', { name: 'Mijn versie bewaren' }).count()) === 1);
  await b.locator('#panel-content input[type=file]').first().setInputFiles(PNG);
  check('B toont de nieuwe afbeelding', (await wachtOpAfbeelding(b, WIDGET_IMG))?.ok === true);
  const ids = await media(b);
  check('de afbeelding staat in IndexedDB', ids.length === 1, JSON.stringify(ids));
  check('maar nog niet in localStorage', refIn(await widgetIn(b)) === null);
  await terugdateren(b);
  const c = await nieuwTabblad(ctx, '#/widgets');
  check('na de opstart van een nieuw tabblad staat de afbeelding er nog', JSON.stringify(await media(c)) === JSON.stringify(ids), JSON.stringify(await media(c)));
  await b.getByRole('button', { name: 'Mijn versie bewaren' }).click();
  await sleep(800);
  check('"Mijn versie bewaren" bewaart de verwijzing', refIn(await widgetIn(b)) === ids[0], refIn(await widgetIn(b)));
  await c.close();
  await a.close();
  await b.reload({ waitUntil: 'networkidle' });
  const img = await wachtOpAfbeelding(b, WIDGET_IMG);
  check('na herladen toont de editor de afbeelding', img?.ok === true, JSON.stringify(img));
  await ctx.close();
});

// ── B1: widget elders verwijderd ────────────────────────────────────────────

console.log('B1. Widget verwijderd in een ander tabblad, "Opnieuw bewaren" in de editor');
await geval(async () => {
  const ctx = await profiel({ opslag: { 'wf.widgets.v1': JSON.stringify([plaat('wfmedia:m_test1')]) }, blobs: { m_test1: 3600e3 } });
  const b = await tab(ctx, '#/bewerk/wi');
  check('B toont de afbeelding', (await wachtOpAfbeelding(b, WIDGET_IMG))?.ok === true);
  const a = await tab(ctx, '#/widgets');
  await a.locator('button[aria-label*="Plaat"]').first().click();
  await a.getByRole('menuitem', { name: /Verwijderen/ }).click();
  await sleep(300);
  await a.getByRole('button', { name: /^Verwijderen$/ }).last().click();
  await sleep(1500);
  check('de widget is weg uit de opslag', (await widgetIn(a)) === undefined);
  check('de afbeelding blijft in IndexedDB zolang de editor ze toont', (await media(a)).includes('m_test1'), JSON.stringify(await media(a)));
  await b.getByRole('button', { name: 'Opnieuw bewaren' }).click();
  await sleep(800);
  check('"Opnieuw bewaren" zet de widget met de verwijzing terug', refIn(await widgetIn(b)) === 'm_test1', refIn(await widgetIn(b)));
  await a.close();
  await b.reload({ waitUntil: 'networkidle' });
  const img = await wachtOpAfbeelding(b, WIDGET_IMG);
  check('na herladen toont de editor de afbeelding', img?.ok === true, JSON.stringify(img));
  await ctx.close();
});

// ── E3: cursus elders verwijderd ────────────────────────────────────────────

console.log('E3. Cursus verwijderd in een ander tabblad, "Toch bewaren" in de editor');
await geval(async () => {
  const ctx = await profiel({ opslag: { 'wf.courses.v1': JSON.stringify([cursus()]) } });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  await a.locator('.editor-item input[type=file]').first().setInputFiles(PNG);
  await sleep(1800);
  const ids = await media(a);
  check('de afbeelding is bewaard', ids.length === 1 && refIn(await cursusIn(a)) === ids[0], JSON.stringify(ids));
  await terugdateren(a);
  const b = await tab(ctx, '#/cursussen');
  await b.getByRole('button', { name: /Acties voor Testcursus/ }).click();
  await b.getByRole('menuitem', { name: /Verwijderen/ }).click();
  await sleep(300);
  await b.getByRole('dialog').getByRole('button', { name: 'Verwijderen' }).click();
  await sleep(1500);
  check('de cursus is weg uit de opslag', (await cursusIn(b)) === undefined);
  check('de afbeelding blijft in IndexedDB zolang de editor ze toont', JSON.stringify(await media(b)) === JSON.stringify(ids), JSON.stringify(await media(b)));
  await a.getByRole('button', { name: 'Toch bewaren' }).click();
  await sleep(800);
  check('"Toch bewaren" zet de cursus met de verwijzing terug', refIn(await cursusIn(a)) === ids[0], refIn(await cursusIn(a)));
  await b.close();
  await a.reload({ waitUntil: 'networkidle' });
  const img = await wachtOpAfbeelding(a, CURSUS_IMG);
  check('na herladen toont de editor de afbeelding', img?.ok === true, JSON.stringify(img));
  await ctx.close();
});

// ── Eén tabblad: opruimen werkt nog ─────────────────────────────────────────

console.log('Eén tabblad. Een oude wees wordt nog altijd opgeruimd');
await geval(async () => {
  const ctx = await profiel({
    opslag: { 'wf.widgets.v1': JSON.stringify([plaat('wfmedia:m_plaat')]) },
    blobs: { m_plaat: 3600e3, m_wees: 3600e3, m_jong: 60e3 },
  });
  const t0 = Date.now();
  const a = await tab(ctx, '#/widgets');
  const ids = await wachtOpMedia(a, (x) => !x.includes('m_wees'));
  const duur = Date.now() - t0;
  // (de andere gevallen wachten 3,5 s op de opruimronde van een nieuw tabblad: dat moet ruim zijn)
  check(`bij de opstart: de oude wees is weg (${duur} ms na het openen)`, !ids.includes('m_wees') && duur < 2500, JSON.stringify(ids));
  check('bij de opstart: wat gebruikt wordt en wat jong is, blijft', ids.includes('m_plaat') && ids.includes('m_jong'), JSON.stringify(ids));
  // verwijderen in het enige tabblad ruimt de afbeelding van de widget meteen op
  await a.locator('button[aria-label*="Plaat"]').first().click();
  await a.getByRole('menuitem', { name: /Verwijderen/ }).click();
  await sleep(300);
  await a.getByRole('button', { name: /^Verwijderen$/ }).last().click();
  const na = await wachtOpMedia(a, (x) => !x.includes('m_plaat'), 4000);
  check('widget verwijderd: zijn oude afbeelding is weg', !na.includes('m_plaat'), JSON.stringify(na));
  await ctx.close();
});

console.log('Geen blijvend lek. Wat bleef staan voor een ander tabblad, verdwijnt bij een opstart alleen');
await geval(async () => {
  const ctx = await profiel({
    opslag: { 'wf.widgets.v1': JSON.stringify([plaat('wfmedia:m_plaat')]) },
    blobs: { m_plaat: 3600e3 },
  });
  const a = await tab(ctx, '#/bewerk/wi');
  check('A toont de afbeelding', (await wachtOpAfbeelding(a, WIDGET_IMG))?.ok === true);
  await sleep(1500); // de opruimronde van A zelf is voorbij
  await zaai(a, { m_wees: 3600e3 }); // bv. de afbeelding van een widget die net verwijderd werd
  const c = await nieuwTabblad(ctx, '#/widgets');
  check('met A open: de wees blijft staan bij de opstart van een nieuw tabblad', (await media(c)).includes('m_wees'), JSON.stringify(await media(c)));
  await a.close();
  await c.close();
  const d = await tab(ctx, '#/widgets');
  const ids = await wachtOpMedia(d, (x) => !x.includes('m_wees'));
  check('alleen opgestart: de wees is weg', !ids.includes('m_wees'), JSON.stringify(ids));
  check('de gebruikte afbeelding blijft', ids.includes('m_plaat'), JSON.stringify(ids));
  await ctx.close();
});

// ── Privacypagina: expliciet wissen wacht op niemand ────────────────────────

console.log('Privacypagina. Leerlinggegevens wissen wist de tekeningen, ook met een ander tabblad open');
await geval(async () => {
  const inzending = {
    id: 'sub1', widgetId: 'wi', widgetCode: 'PLAAT1', studentName: 'Emma', startedAt: 1, submittedAt: 2, durationSec: 1,
    answers: { q1: 'wfmedia:m_tekening' }, itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted',
  };
  const ctx = await profiel({
    opslag: { 'wf.widgets.v1': JSON.stringify([plaat('wfmedia:m_plaat')]), 'wf.submissions.v1': JSON.stringify([inzending]) },
    blobs: { m_plaat: 3600e3, m_tekening: 60e3 },
  });
  const a = await tab(ctx, '#/bewerk/wi');
  check('A toont de afbeelding', (await wachtOpAfbeelding(a, WIDGET_IMG))?.ok === true);
  const w = await waarnemer(ctx);
  check('A houdt het slot vast', (await slothouders(w)) === 1, String(await slothouders(w)));
  await w.close();
  const b = await tab(ctx, '#/privacy');
  await b.getByRole('button', { name: /Alle inzendingen/ }).click();
  await b.getByRole('dialog').getByRole('button', { name: 'Verwijderen' }).click();
  const ids = await wachtOpMedia(b, (x) => !x.includes('m_tekening'), 4000);
  check('de tekening is gewist', !ids.includes('m_tekening'), JSON.stringify(ids));
  check('de afbeelding van de widget blijft', ids.includes('m_plaat'), JSON.stringify(ids));
  await ctx.close();
});

// ── Slot ────────────────────────────────────────────────────────────────────
for (const ctx of geopend) await ctx.close().catch(() => {});
console.log('\n──────────');
if (errors.length) {
  console.log('Console-/paginafouten:');
  for (const e of [...new Set(errors)]) console.log('  •', e.slice(0, 300));
  failures += errors.length;
} else {
  console.log('Geen console- of paginafouten. ✓');
}
console.log(failures === 0 ? 'ALLE MEDIA-TABBLADEN-CHECKS GESLAAGD ✓' : `${failures} CHECKS GEFAALD ✗`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
