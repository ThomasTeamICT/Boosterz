// Rooktest herstelpakket P6: de cursuseditor van de leerkracht.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4308 --strictPort &
//   SMOKE_BASE=http://localhost:4308 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/cursuseditor.mjs
//
// Elk geval krijgt een vers browserprofiel, met de cursus vooraf in localStorage gezet. Twee
// tabbladen zijn twee pagina's in dezelfde browsercontext (zelfde opslag, echte storage-events).
// Faalt hard (exit 1) bij een mislukte controle, een paginafout of een consolefout.
//
//  CU2    twee tabbladen: geen stil overschrijven; herladen zonder eigen wijzigingen, anders
//         pauzeren en kiezen (laden, eigen versie, kopie); elders verwijderd komt niet stil terug;
//         weggaan met een open conflict bewaart het werk in een kopie
//  CU7    volle opslag: "Niet bewaard" en een melding in de editor (geen alert), opnieuw proberen
//  CU3    blok met inhoud verwijderen vraagt bevestiging; pdf loskoppelen in twee stappen; het
//         bestand verdwijnt pas na het bewaren en niet zolang een ander blok het gebruikt
//  CU15e  een sectie met doelcodes maar zonder blokken vraagt bevestiging
//  CU15c  "Als leerling" opent #/cursus/lees/CODE?voorbeeld=1 en bewaart eerst
//  CU14 / A11Y19  één main en één h1, ook bij "niet gevonden", zonder sectie en met een melding
//  P7     een leeg blok zegt in de editor dat leerlingen het niet zien
//  390 px zonder horizontaal scrollen, ook met de conflictmelding
//
// Herstelpakket P2 (debugronde oktober 2026, rechter: cursuseditor):
//  E2     "Terug" of een link terwijl bewaren niet lukt: een vraag (Blijven, Downloaden, Toch
//         weggaan); bewaren lukt weer: geen vraag; Toch weggaan geeft geen tweede foutmelding
//  E3     de melding bij "elders verwijderd" zegt wat niet terugkomt
//  E6     een blok met alleen een bijschrift, titel, bron of notitie vraagt eerst; een lege
//         scheidingslijn en een echt leeg blok niet
//  E8     na een knop in een melding staat de focus op de titel; Escape annuleert de pdf-vraag
//  B4     een afbeelding uit een ander tabblad verschijnt vanzelf, zonder herladen

import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
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

const tekst = (id, markdown) => ({ id, type: 'text', markdown });
function cursus(secties, over = {}) {
  return {
    id: 'c1', title: 'Testcursus', author: 'Juf Test', coverEmoji: '📘', code: 'EDT123',
    chapters: [{ id: 'ch1', title: 'Hoofdstuk 1', sections: secties }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    createdAt: 1, updatedAt: 1000,
    ...over,
  };
}
const standaard = () => cursus([{ id: 's1', title: 'Sectie 1', blocks: [tekst('b1', 'Hallo')] }]);

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const geopend = [];

/** Vers profiel; `courses` wordt één keer in localStorage gezet vóór de app laadt. */
async function profiel({ courses = [], width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript((c) => {
    try {
      if (localStorage.getItem('__herstel_gezaaid')) return;
      if (c.length) localStorage.setItem('wf.courses.v1', JSON.stringify(c));
      localStorage.setItem('__herstel_gezaaid', '1');
    } catch { /* about:blank heeft geen opslag */ }
  }, courses);
  ctx.setDefaultTimeout(8000);
  geopend.push(ctx);
  return ctx;
}

/** Een tabblad in de context, met fouten en dialogen bijgehouden. */
async function tab(ctx, hash) {
  const p = await ctx.newPage();
  p.dialogen = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Volle opslag: de app logt de mislukte bewaring zelf (bewust, zie storage.ts).
    if (/ERR_CERT_AUTHORITY_INVALID|ERR_FAILED|Failed to load resource|Opslaan mislukt/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  p.on('dialog', async (d) => { p.dialogen.push(`${d.type()}: ${d.message()}`); await d.dismiss(); });
  if (hash) await naar(p, hash);
  return p;
}
const naar = async (p, hash) => { await p.goto(BASE + hash, { waitUntil: 'networkidle' }); await sleep(400); };
const opgeslagen = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('wf.courses.v1') || '[]'));
const cursusIn = async (p, id = 'c1') => (await opgeslagen(p)).find((c) => c.id === id);
const structuur = (p) => p.evaluate(() => ({ main: document.querySelectorAll('main').length, h1: document.querySelectorAll('h1').length }));
const overloop = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const status = (p) => p.locator('.course-save-state').innerText();
const melding = (p) => p.locator('.course-editor-alert');

/** Een geval dat onverwacht stukloopt (time-out, ontbrekend element) telt als gefaalde controle. */
async function geval(fn) {
  try { await fn(); } catch (e) { check('onverwachte fout in het geval', false, String(e.message).split('\n')[0]); }
}

/**
 * Twee tabbladen op dezelfde cursus, en een conflict: B bewaart (800 ms na zijn wijziging) terwijl
 * A nog een niet-bewaarde wijziging heeft (A wijzigt kort na B, dus A's eigen pauze loopt nog).
 */
async function maakConflict(a, b, { vanA = 'VAN-A', vanB = 'VAN-B' } = {}) {
  await b.getByLabel('Titel van hoofdstuk 1').fill(vanB);
  await sleep(100);
  await a.getByLabel('Titel van de sectie').fill(vanA);
  await sleep(1800);
}

// ── CU14 / A11Y19 ───────────────────────────────────────────────────────────

console.log('CU14 / A11Y19. Eén main en één h1 in elke toestand');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/bestaatniet');
  const s = await structuur(p);
  check('"niet gevonden": één main en één h1', s.main === 1 && s.h1 === 1, JSON.stringify(s));
  check('"niet gevonden": de h1 zegt het', (await p.locator('h1').innerText()).includes('Cursus niet gevonden'));
  await naar(p, '#/cursus/bewerk/c1');
  const s2 = await structuur(p);
  check('de editor: één main en één h1', s2.main === 1 && s2.h1 === 1, JSON.stringify(s2));
  await ctx.close();
});
await geval(async () => {
  const ctx = await profiel({ courses: [cursus([], { chapters: [{ id: 'ch1', title: 'Leeg hoofdstuk', sections: [] }] })] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  check('zonder sectie: de lege toestand staat er', await p.getByText('Geen sectie geselecteerd').isVisible());
  const s = await structuur(p);
  check('zonder sectie: één main en één h1', s.main === 1 && s.h1 === 1, JSON.stringify(s));
  await ctx.close();
});

// ── CU2: twee tabbladen ─────────────────────────────────────────────────────

console.log('CU2. Twee tabbladen met dezelfde cursus');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  check('openen schrijft niets (updatedAt blijft)', (await cursusIn(a)).updatedAt === 1000);
  await a.getByLabel('Titel van de sectie').fill('SECTIE-VAN-A');
  await sleep(1500);
  check('B zonder eigen wijzigingen toont de versie van A', (await b.getByLabel('Titel van de sectie').inputValue()) === 'SECTIE-VAN-A');
  check('B zegt dat er bijgewerkt werd', (await status(b)).includes('Bijgewerkt uit een ander tabblad'));
  await b.getByLabel('Titel van hoofdstuk 1').fill('HOOFDSTUK-VAN-B');
  await sleep(1500);
  const c = await cursusIn(a);
  check('B bouwde verder op A: beide wijzigingen bewaard',
    c.chapters[0].title === 'HOOFDSTUK-VAN-B' && c.chapters[0].sections[0].title === 'SECTIE-VAN-A', JSON.stringify(c.chapters[0].title));
  check('A toont nu ook de wijziging van B', (await a.getByLabel('Titel van hoofdstuk 1').inputValue()) === 'HOOFDSTUK-VAN-B');
  check('geen melding over een conflict', (await melding(a).count()) === 0 && (await melding(b).count()) === 0);
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  await maakConflict(a, b);
  let c = await cursusIn(a);
  check('conflict: het werk van B blijft staan', c.chapters[0].title === 'VAN-B');
  check('conflict: A schreef niet over B heen', c.chapters[0].sections[0].title === 'Sectie 1');
  check('conflict: A toont een melding', (await melding(a).innerText()).includes('Gewijzigd in een ander tabblad'));
  check('conflict: de melding is een alert', (await a.getByRole('alert').filter({ hasText: 'Gewijzigd in een ander tabblad' }).count()) === 1);
  check('conflict: "Bewaren gepauzeerd" naast de titel', (await status(a)).includes('Bewaren gepauzeerd'));
  check('conflict: het werk van A staat nog op het scherm', (await a.getByLabel('Titel van de sectie').inputValue()) === 'VAN-A');
  const s = await structuur(a);
  check('conflict: nog altijd één main en één h1', s.main === 1 && s.h1 === 1, JSON.stringify(s));
  await a.getByLabel('Titel van de sectie').fill('VAN-A, nog meer');
  await sleep(1500);
  c = await cursusIn(a);
  check('verder typen tijdens het conflict schrijft niets', c.chapters[0].sections[0].title === 'Sectie 1');

  // Kopie: beide versies blijven bestaan.
  await a.getByRole('button', { name: 'Mijn versie als kopie bewaren' }).click();
  await sleep(800);
  const alle = await opgeslagen(a);
  const kopie = alle.find((x) => x.id !== 'c1');
  check('kopie: er staan nu twee cursussen', alle.length === 2);
  check('kopie: met het werk van A en een herkenbare titel',
    kopie?.chapters[0].sections[0].title === 'VAN-A, nog meer' && kopie?.title === 'Testcursus (mijn versie)', kopie?.title);
  check('kopie: een eigen code', kopie && kopie.code !== 'EDT123');
  const orig = alle.find((x) => x.id === 'c1');
  check('kopie: het origineel bleef de versie van B', orig.chapters[0].title === 'VAN-B' && orig.chapters[0].sections[0].title === 'Sectie 1');
  check('kopie: A bewerkt nu de kopie', a.url().includes(`#/cursus/bewerk/${kopie?.id}`) &&
    (await a.getByLabel('Titel van de cursus').inputValue()) === 'Testcursus (mijn versie)');
  check('kopie: B blijft ongemoeid', (await b.getByLabel('Titel van hoofdstuk 1').inputValue()) === 'VAN-B' && (await melding(b).count()) === 0);
  check('geen alert-vensters', a.dialogen.length === 0 && b.dialogen.length === 0, a.dialogen.join(' | '));
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  await maakConflict(a, b);
  await a.getByRole('button', { name: 'Laad die versie' }).click();
  await sleep(300);
  check('"Laad die versie": A toont de versie van B',
    (await a.getByLabel('Titel van hoofdstuk 1').inputValue()) === 'VAN-B' && (await a.getByLabel('Titel van de sectie').inputValue()) === 'Sectie 1');
  check('"Laad die versie": de melding is weg', (await melding(a).count()) === 0);

  await maakConflict(a, b, { vanA: 'VAN-A2', vanB: 'VAN-B2' });
  check('tweede conflict', (await melding(a).count()) === 1);
  await a.getByRole('button', { name: 'Mijn versie bewaren' }).click();
  await sleep(1000);
  const c = await cursusIn(a);
  check('"Mijn versie bewaren": de versie van A staat in de opslag',
    c.chapters[0].sections[0].title === 'VAN-A2' && c.chapters[0].title === 'VAN-B');
  check('"Mijn versie bewaren": B (zonder eigen wijzigingen) volgt',
    (await b.getByLabel('Titel van de sectie').inputValue()) === 'VAN-A2' && (await b.getByLabel('Titel van hoofdstuk 1').inputValue()) === 'VAN-B');
  check('"Mijn versie bewaren": A toont "Bewaard"', (await status(a)).includes('Bewaard'));
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursussen');
  await b.evaluate(() => localStorage.setItem('wf.courses.v1', '[]')); // elders verwijderd
  await sleep(500);
  check('verwijderd: A toont een melding', (await melding(a).innerText()).includes('Verwijderd in een ander tabblad'));
  await a.getByLabel('Titel van de sectie').fill('Nog bezig');
  await sleep(1500);
  check('verwijderd: de cursus komt niet stil terug', (await opgeslagen(a)).length === 0);
  await a.getByRole('button', { name: 'Toch bewaren' }).click();
  await sleep(500);
  const c = await cursusIn(a);
  check('"Toch bewaren": terug, met dezelfde code en het werk van A', c?.code === 'EDT123' && c?.chapters[0].sections[0].title === 'Nog bezig');
  check('"Toch bewaren": de melding is weg', (await melding(a).count()) === 0);
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  await maakConflict(a, b, { vanA: 'WEG-MAAR-BEWAARD' });
  await a.getByRole('button', { name: 'Terug naar mijn cursussen' }).click();
  await sleep(800);
  const alle = await opgeslagen(a);
  const kopie = alle.find((x) => x.id !== 'c1');
  check('weggaan met een open conflict: het werk staat in een kopie', kopie?.chapters[0].sections[0].title === 'WEG-MAAR-BEWAARD');
  check('weggaan met een open conflict: het origineel bleef van B', (await cursusIn(a)).chapters[0].title === 'VAN-B');
  check('weggaan met een open conflict: een melding zegt waar het werk staat',
    (await a.getByText(/Je niet-bewaarde wijzigingen staan in een kopie/).count()) === 1);
  await ctx.close();
});

// ── CU7: volle opslag ───────────────────────────────────────────────────────

console.log('CU7. Volle opslag: eerlijk "Niet bewaard"');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const vulsleutels = await p.evaluate(() => {
    const keys = [];
    let size = 1 << 20;
    let i = 0;
    while (size >= 1) {
      try { localStorage.setItem(`__vul_${i}`, 'x'.repeat(size)); keys.push(`__vul_${i}`); i++; } catch { size = Math.floor(size / 2); }
    }
    return keys;
  });
  check('de opslag is vol', vulsleutels.length > 0);
  await p.getByLabel('Titel van de cursus').fill('Een veel langere titel die niet meer in de opslag past');
  await sleep(1500);
  check('nooit "Bewaard" na een mislukte bewaring', !/^\s*Bewaard/.test(await status(p)) && (await status(p)).includes('Niet bewaard'), await status(p));
  check('een melding in de editor (role=alert) met "Niet bewaard"',
    (await p.getByRole('alert').filter({ hasText: 'Niet bewaard:' }).count()) === 1);
  check('geen alert-venster', p.dialogen.length === 0, p.dialogen.join(' | '));
  check('de opslag houdt de oude titel', (await cursusIn(p)).title === 'Testcursus');
  check('het werk staat nog op het scherm',
    (await p.getByLabel('Titel van de cursus').inputValue()) === 'Een veel langere titel die niet meer in de opslag past');
  await p.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), vulsleutels);
  await p.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await sleep(500);
  check('opnieuw proberen na plaats maken: bewaard', (await cursusIn(p)).title === 'Een veel langere titel die niet meer in de opslag past');
  check('opnieuw proberen: "Bewaard" en de melding is weg', (await status(p)).includes('Bewaard') && (await melding(p).count()) === 0);
  await ctx.close();
});

// ── CU3: blokken en pdf's verwijderen ───────────────────────────────────────

console.log('CU3. Verwijderen met bevestiging; pdf-bestanden pas na het bewaren weg');
await geval(async () => {
  const ctx = await profiel({ courses: [cursus([{ id: 's1', title: 'Sectie 1', blocks: [tekst('b1', 'Inhoud'), tekst('b2', '')] }])] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  check('leeg blok: de editor zegt dat leerlingen het niet zien',
    (await p.getByText('Nog leeg: leerlingen zien dit blok pas als je het invult.').count()) === 1);
  await p.getByRole('button', { name: 'Blok 2 verwijderen' }).click();
  await sleep(200);
  check('een leeg blok gaat meteen weg, zonder vraag', (await p.getByRole('dialog').count()) === 0 && (await p.locator('.editor-item').count()) === 1);
  await p.getByRole('button', { name: 'Blok 1 verwijderen' }).click();
  check('een blok met inhoud: eerst bevestigen', await p.getByRole('dialog', { name: 'Blok verwijderen?' }).isVisible());
  const s = await structuur(p);
  check('met de vraag open: één main en één h1', s.main === 1 && s.h1 === 1, JSON.stringify(s));
  await p.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).click();
  check('annuleren: het blok blijft', (await p.locator('.editor-item').count()) === 1);
  await p.getByRole('button', { name: 'Blok 1 verwijderen' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Verwijderen' }).click();
  await sleep(1200);
  check('bevestigd: het blok is weg, ook in de opslag', (await p.locator('.editor-item').count()) === 0 && (await cursusIn(p)).chapters[0].sections[0].blocks.length === 0);
  await ctx.close();
});

await geval(async () => {
  const pdfBlok = { id: 'p1', type: 'pdf', pdfId: 'pdfA', name: 'les.pdf' };
  const ctx = await profiel({ courses: [cursus([{ id: 's1', title: 'Sectie 1', blocks: [pdfBlok] }])] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const idbKeys = () => p.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('wf-files', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
    r.onsuccess = () => {
      const q = r.result.transaction('pdfs').objectStore('pdfs').getAllKeys();
      q.onsuccess = () => { resolve(q.result.map(String)); r.result.close(); };
    };
  }));
  await p.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('wf-files', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
    r.onsuccess = () => {
      const blob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      const t = r.result.transaction('pdfs', 'readwrite');
      t.objectStore('pdfs').put({ id: 'pdfA', name: 'les.pdf', blob, size: blob.size, createdAt: Date.now() });
      t.oncomplete = () => { r.result.close(); resolve(); };
    };
  }));
  await naar(p, '#/cursus/bewerk/c1');
  check('het pdf-bestand staat in de opslag', (await idbKeys()).includes('pdfA'));

  // Twee stappen, en annuleren zet de focus terug.
  const eerste = p.locator('.editor-item').nth(0);
  await eerste.getByRole('button', { name: 'Verwijderen', exact: true }).click();
  check('stap 1: een vraag met de gevolgen', await eerste.getByRole('group', { name: 'Pdf-bestand verwijderen' }).isVisible());
  check('stap 1: de focus staat op "Annuleren"', await p.evaluate(() => document.activeElement?.textContent === 'Annuleren'));
  await eerste.getByRole('button', { name: 'Annuleren' }).click();
  check('annuleren: het bestand hangt er nog aan', (await eerste.getByText('les.pdf').count()) >= 1);
  check('annuleren: de focus staat terug op "Verwijderen"', await p.evaluate(() => document.activeElement?.textContent === 'Verwijderen'));

  // Dupliceren en meteen het origineel loskoppelen (binnen de bewaarpauze).
  await p.getByRole('button', { name: 'Blok 1 dupliceren' }).click();
  await eerste.getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await eerste.getByRole('button', { name: 'Ja, verwijderen' }).click();
  await sleep(1500);
  check('het duplicaat gebruikt het bestand nog: niet gewist', (await idbKeys()).includes('pdfA'));
  const tweede = p.locator('.editor-item').nth(1);
  await tweede.getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await tweede.getByRole('button', { name: 'Ja, verwijderen' }).click();
  await sleep(1500);
  check('niets gebruikt het bestand nog: na het bewaren gewist', !(await idbKeys()).includes('pdfA'));
  const blokken = (await cursusIn(p)).chapters[0].sections[0].blocks;
  check('beide blokken bleven staan, zonder bestand', blokken.length === 2 && blokken.every((b) => !b.pdfId));
  await ctx.close();
});

// ── CU15e: secties met doelen ───────────────────────────────────────────────

console.log('CU15e. Een sectie met doelcodes maar zonder blokken');
await geval(async () => {
  const ctx = await profiel({
    courses: [cursus([
      { id: 's1', title: 'Sectie 1', blocks: [tekst('b1', 'Hallo')] },
      { id: 's2', title: 'Leeg', blocks: [] },
      { id: 's3', title: 'Met doelcode', blocks: [], goalCodes: ['NW 4.1'] },
    ])],
  });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  await p.getByRole('button', { name: 'Sectie “Leeg” verwijderen' }).click();
  await sleep(200);
  check('een echt lege sectie gaat meteen weg', (await p.getByRole('dialog').count()) === 0 &&
    (await p.getByRole('button', { name: 'Sectie “Leeg” verwijderen' }).count()) === 0);
  await p.getByRole('button', { name: 'Sectie “Met doelcode” verwijderen' }).click();
  check('een sectie met een doelcode: eerst bevestigen', await p.getByRole('dialog', { name: 'Sectie verwijderen?' }).isVisible());
  check('de vraag noemt de leerdoelen', (await p.getByRole('dialog').innerText()).includes('blokken of leerdoelen'));
  await p.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).click();
  await sleep(1200);
  check('annuleren: de sectie blijft, met haar doelcode', (await cursusIn(p)).chapters[0].sections.some((s) => s.id === 's3' && s.goalCodes?.[0] === 'NW 4.1'));
  await ctx.close();
});

// ── CU15c: "Als leerling" ───────────────────────────────────────────────────

console.log('CU15c. "Als leerling" opent de voorbeeldmodus en bewaart eerst');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const link = p.getByRole('link', { name: 'Als leerling' });
  check('de link wijst naar de voorbeeldmodus', (await link.getAttribute('href')) === '#/cursus/lees/EDT123?voorbeeld=1');
  await p.getByLabel('Titel van de sectie').fill('Net gewijzigd');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
  check('meteen bewaard vóór het nieuwe tabblad leest', (await cursusIn(p)).chapters[0].sections[0].title === 'Net gewijzigd');
  await popup.waitForLoadState('networkidle');
  await sleep(600);
  check('het nieuwe tabblad toont de voorbeeldmodus', popup.url().includes('#/cursus/lees/EDT123?voorbeeld=1'), popup.url());
  check('het voorbeeld toont de net gewijzigde sectie', (await popup.getByText('Net gewijzigd').count()) >= 1);
  check('in het voorbeeld wordt geen voortgang bewaard', await popup.evaluate(() => {
    const raw = localStorage.getItem('wf.courseprogress.v1');
    return !raw || JSON.parse(raw).length === 0;
  }));
  await ctx.close();
});

// ── Typen ───────────────────────────────────────────────────────────────────

console.log('Typen. Midden in een veld typen houdt de cursor op zijn plaats');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const titel = p.getByLabel('Titel van de cursus');
  await titel.click();
  await p.keyboard.press('End');
  for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowLeft');
  await p.keyboard.type('XY', { delay: 40 });
  check('titel: de letters staan waar de cursor stond', (await titel.inputValue()) === 'TestXYcursus', await titel.inputValue());
  const tekstveld = p.getByLabel('Tekst van het blok');
  await tekstveld.click();
  await p.keyboard.press('Home');
  await p.keyboard.type('Oh ', { delay: 40 });
  check('tekstblok: idem', (await tekstveld.inputValue()) === 'Oh Hallo', await tekstveld.inputValue());
  await sleep(1200);
  const c = await cursusIn(p);
  check('en alles is bewaard', c.title === 'TestXYcursus' && c.chapters[0].sections[0].blocks[0].markdown === 'Oh Hallo');
  await ctx.close();
});

// ── 390 px ──────────────────────────────────────────────────────────────────

console.log('390 px. Zonder horizontaal scrollen, ook met een melding');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()], width: 390, height: 844 });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  check('de editor past op 390 px', (await overloop(a)) <= 0, `${await overloop(a)} px`);
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  await maakConflict(a, b);
  check('met de conflictmelding', (await melding(a).count()) === 1);
  check('de conflictmelding past op 390 px', (await overloop(a)) <= 0, `${await overloop(a)} px`);
  const knoppen = await melding(a).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  check('de knoppen van de melding vallen binnen het scherm', knoppen.length === 3 && knoppen.every((r) => r <= 390), JSON.stringify(knoppen));
  await ctx.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Herstelpakket P2
// ═══════════════════════════════════════════════════════════════════════════

/** De opslag helemaal vol schrijven; geeft de sleutels terug om later plaats te maken. */
const vulOpslag = (p) => p.evaluate(() => {
  const keys = [];
  let size = 1 << 20;
  let i = 0;
  while (size >= 1) {
    try { localStorage.setItem(`__vul_${i}`, 'x'.repeat(size)); keys.push(`__vul_${i}`); i++; } catch { size = Math.floor(size / 2); }
  }
  return keys;
});
const maakVrij = (p, keys) => p.evaluate((ks) => ks.forEach((k) => localStorage.removeItem(k)), keys);
const actief = (p) => p.evaluate(() => {
  const el = document.activeElement;
  return el ? { tag: el.tagName, label: el.getAttribute('aria-label'), tekst: (el.textContent || '').trim().slice(0, 40) } : null;
});
/** Staat de focus op het titelveld van de cursus (en dus niet op <body>)? */
const opTitel = async (p) => { const a = await actief(p); return a?.tag === 'INPUT' && a.label === 'Titel van de cursus'; };

/** Een kleine, geldige png (24 × 24, kleurverloop), zonder extra pakketten. */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function maakPng(w = 24, h = 24) {
  const rij = w * 3 + 1;
  const raw = Buffer.alloc(rij * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * rij + 1 + x * 3;
    raw[o] = (x * 10) & 255; raw[o + 1] = (y * 10) & 255; raw[o + 2] = 128;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── E2: weggaan terwijl er niets bewaard raakt ──────────────────────────────

console.log('E2. Weggaan terwijl "Niet bewaard" staat: eerst vragen');
const NIEUWE_TITEL = 'Een veel langere titel die niet meer in de opslag past';
const terugKnop = (p) => p.getByRole('button', { name: 'Terug naar mijn cursussen' });
const blokkeerVraag = (p) => p.getByRole('dialog', { name: 'Je wijzigingen zijn niet bewaard' });
const hash = (p) => p.evaluate(() => location.hash);

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const keys = await vulOpslag(p);
  check('de opslag is vol', keys.length > 0);
  await p.getByLabel('Titel van de cursus').fill(NIEUWE_TITEL);
  await sleep(1300);
  check('eerst: "Niet bewaard" in de balk', (await status(p)).includes('Niet bewaard'), await status(p));

  // Een link binnen de app (niet alleen "Terug") wordt ook tegengehouden.
  await p.getByRole('link', { name: 'Voortgang' }).click();
  await blokkeerVraag(p).waitFor();
  check('een link naar een andere pagina: dezelfde vraag', await blokkeerVraag(p).isVisible());
  check('de link ging niet door', (await hash(p)).startsWith('#/cursus/bewerk/c1'), await hash(p));
  await blokkeerVraag(p).getByRole('button', { name: 'Blijven' }).click();
  await sleep(200);

  await terugKnop(p).click();
  await blokkeerVraag(p).waitFor();
  const vraag = blokkeerVraag(p);
  check('"Terug": een vraag in plaats van stil weggaan', await vraag.isVisible());
  check('de vraag zegt waarom en wat er verloren gaat',
    /opslag is vol/.test(await vraag.innerText()) && /gaan je laatste wijzigingen/.test(await vraag.innerText()), await vraag.innerText());
  check('de vraag heeft Blijven, Downloaden en Toch weggaan',
    (await vraag.getByRole('button', { name: 'Blijven' }).count()) === 1 &&
    (await vraag.getByRole('button', { name: /Downloaden als bestand/ }).count()) === 1 &&
    (await vraag.getByRole('button', { name: 'Toch weggaan' }).count()) === 1);
  const s = await structuur(p);
  check('met de vraag open: één main en één h1', s.main === 1 && s.h1 === 1, JSON.stringify(s));
  check('de focus staat in de vraag, op "Blijven"', (await actief(p))?.tekst === 'Blijven', JSON.stringify(await actief(p)));

  // Blijven (knop en Escape): niets gaat verloren.
  await vraag.getByRole('button', { name: 'Blijven' }).click();
  await sleep(200);
  check('"Blijven": de vraag is weg en we staan nog in de editor',
    (await blokkeerVraag(p).count()) === 0 && (await hash(p)).startsWith('#/cursus/bewerk/c1'));
  check('"Blijven": de titel staat nog op het scherm', (await p.getByLabel('Titel van de cursus').inputValue()) === NIEUWE_TITEL);
  check('"Blijven": de opslag houdt de oude titel', (await cursusIn(p)).title === 'Testcursus');
  await terugKnop(p).click();
  await blokkeerVraag(p).waitFor();
  await p.keyboard.press('Escape');
  await sleep(200);
  check('Escape telt als "Blijven"', (await blokkeerVraag(p).count()) === 0 && (await hash(p)).startsWith('#/cursus/bewerk/c1'));

  // Downloaden: de cursus als bestand, de vraag blijft staan.
  await terugKnop(p).click();
  await blokkeerVraag(p).waitFor();
  const [dl] = await Promise.all([
    p.waitForEvent('download'),
    blokkeerVraag(p).getByRole('button', { name: /Downloaden als bestand/ }).click(),
  ]);
  const bestand = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  check('"Downloaden": een .json-bestand', /\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('"Downloaden": met de cursus zoals ze op het scherm staat',
    bestand.kind === 'cursus' && bestand.course?.title === NIEUWE_TITEL, JSON.stringify(bestand.course?.title));
  check('"Downloaden": de vraag blijft staan, de leerkracht kiest zelf', await blokkeerVraag(p).isVisible());

  // Toch weggaan: weg, zonder tweede foutmelding.
  await blokkeerVraag(p).getByRole('button', { name: 'Toch weggaan' }).click();
  await p.waitForFunction(() => location.hash === '#/cursussen');
  await sleep(500);
  check('"Toch weggaan": we staan op Mijn cursussen', (await hash(p)) === '#/cursussen');
  check('"Toch weggaan": geen tweede melding dat het niet bewaard is',
    (await p.getByText(/Je laatste wijzigingen aan de cursus zijn niet bewaard/).count()) === 0);
  check('geen alert-venster', p.dialogen.length === 0, p.dialogen.join(' | '));
  await maakVrij(p, keys);
  check('de oude titel staat nog in de opslag', (await cursusIn(p)).title === 'Testcursus');
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const keys = await vulOpslag(p);
  await p.getByLabel('Titel van de cursus').fill(NIEUWE_TITEL);
  await sleep(1300);
  await terugKnop(p).click();
  await blokkeerVraag(p).waitFor();
  await blokkeerVraag(p).getByRole('button', { name: 'Blijven' }).click();
  await maakVrij(p, keys);
  await terugKnop(p).click();
  await p.waitForFunction(() => location.hash === '#/cursussen');
  await sleep(300);
  check('na plaats maken: "Terug" bewaart en gaat weg, zonder vraag',
    (await hash(p)) === '#/cursussen' && (await blokkeerVraag(p).count()) === 0);
  check('na plaats maken: de nieuwe titel is bewaard', (await cursusIn(p)).title === NIEUWE_TITEL);
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  await p.getByLabel('Titel van de cursus').fill('Snel weg');
  await terugKnop(p).click(); // binnen de bewaarpauze
  await p.waitForFunction(() => location.hash === '#/cursussen');
  await sleep(300);
  check('gewoon werken: Terug binnen de pauze vraagt niets en bewaart',
    (await blokkeerVraag(p).count()) === 0 && (await cursusIn(p)).title === 'Snel weg');
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()], width: 390, height: 844 });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  await vulOpslag(p);
  await p.getByLabel('Titel van de cursus').fill(NIEUWE_TITEL);
  await sleep(1300);
  await terugKnop(p).click();
  await blokkeerVraag(p).waitFor();
  check('de vraag past op 390 px', (await overloop(p)) <= 0, `${await overloop(p)} px`);
  const rechts = await blokkeerVraag(p).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  check('alle knoppen van de vraag vallen binnen het scherm', rechts.length >= 3 && rechts.every((r) => r <= 390), JSON.stringify(rechts));
  await ctx.close();
});

// ── E3: wat komt niet terug na "Toch bewaren"? ──────────────────────────────

console.log('E3. De melding bij "elders verwijderd" is eerlijk');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursussen');
  await b.evaluate(() => localStorage.setItem('wf.courses.v1', '[]'));
  await sleep(500);
  const tekst = await melding(a).innerText();
  check('verwijderd: de melding staat er', tekst.includes('Verwijderd in een ander tabblad'));
  check('verwijderd: pdf-bestanden komen niet terug', /pdf/i.test(tekst) && /komt niet terug/.test(tekst), tekst);
  check('verwijderd: de voortgang van leerlingen en hun notities komen niet terug', /voortgang van je leerlingen/.test(tekst) && /notities/.test(tekst), tekst);
  check('verwijderd: afbeeldingen die alleen in de cursus zaten kunnen ontbreken', /Afbeeldingen die alleen in deze cursus/.test(tekst), tekst);
  const rechts = await melding(a).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  check('verwijderd: de knoppen blijven binnen het scherm', rechts.every((r) => r <= 1280), JSON.stringify(rechts));

  // E8: na "Toch bewaren" (met het toetsenbord) is de knop weg, en de focus niet.
  await a.getByRole('button', { name: 'Toch bewaren' }).focus();
  await a.keyboard.press('Enter');
  await sleep(500);
  check('"Toch bewaren": de cursus staat terug', (await cursusIn(a))?.code === 'EDT123');
  check('"Toch bewaren": de focus staat op het titelveld, niet op <body>', await opTitel(a), JSON.stringify(await actief(a)));
  await ctx.close();
});
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()], width: 390, height: 844 });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursussen');
  await b.evaluate(() => localStorage.setItem('wf.courses.v1', '[]'));
  await sleep(500);
  check('verwijderd, 390 px: geen horizontaal scrollen', (await overloop(a)) <= 0, `${await overloop(a)} px`);
  await ctx.close();
});

// ── E6: wat vraagt bevestiging bij verwijderen? ─────────────────────────────

console.log('E6. Een blok met alleen een bijschrift, titel, bron of notitie vraagt eerst');
await geval(async () => {
  const blokken = [
    { id: 'k1', type: 'divider' },
    { id: 'k2', type: 'image', url: '' },
    { id: 'k3', type: 'image', url: '', caption: 'Figuur 3: de waterkringloop' },
    { id: 'k4', type: 'video', url: '', caption: 'Bekijk dit eerst' },
    { id: 'k5', type: 'audio', url: '', caption: 'Luisteroefening' },
    { id: 'k6', type: 'pdf', height: 560, caption: 'Werkblad 2' },
    { id: 'k7', type: 'embed', url: '', height: 420, title: 'Simulatie' },
    { id: 'k8', type: 'quote', text: '', source: 'Einstein' },
    { id: 'k9', type: 'checklist', title: 'Voor je begint', items: [{ id: 'x', text: '' }] },
    { id: 'k10', type: 'widget', widgetId: '', note: 'Maak dit na de les' },
  ];
  const ctx = await profiel({ courses: [cursus([{ id: 's1', title: 'Sectie 1', blocks: blokken }])] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  check('alle tien de blokken staan in de editor', (await p.locator('.editor-item').count()) === 10);
  const namen = ['', '', 'afbeelding met bijschrift', 'video met bijschrift', 'audio met bijschrift', 'pdf met bijschrift',
    'embed met titel', 'citaat met bron', 'checklist met titel', 'widget met notitie'];
  for (let n = 3; n <= 10; n++) {
    await p.getByRole('button', { name: `Blok ${n} verwijderen` }).click();
    await sleep(150);
    check(`${namen[n - 1]}: eerst bevestigen`, await p.getByRole('dialog', { name: 'Blok verwijderen?' }).isVisible());
    await p.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).click();
    await sleep(100);
  }
  check('na annuleren staan ze er nog allemaal', (await p.locator('.editor-item').count()) === 10);

  // Een scheidingslijn en een echt leeg blok: zonder vraag.
  await p.getByRole('button', { name: 'Blok 1 verwijderen' }).click();
  await sleep(150);
  check('een scheidingslijn gaat meteen weg, zonder vraag',
    (await p.getByRole('dialog').count()) === 0 && (await p.locator('.editor-item').count()) === 9);
  await p.getByRole('button', { name: 'Blok 1 verwijderen' }).click(); // het lege beeld (k2)
  await sleep(150);
  check('een leeg beeldblok gaat meteen weg, zonder vraag',
    (await p.getByRole('dialog').count()) === 0 && (await p.locator('.editor-item').count()) === 8);

  // Eén bevestigd: weg, ook in de opslag.
  await p.getByRole('button', { name: 'Blok 1 verwijderen' }).click(); // k3, met bijschrift
  await p.getByRole('dialog').getByRole('button', { name: 'Verwijderen' }).click();
  await sleep(1300);
  const rest = (await cursusIn(p)).chapters[0].sections[0].blocks.map((b) => b.id);
  check('na bevestigen is het blok weg en blijven de andere staan', rest.join(',') === 'k4,k5,k6,k7,k8,k9,k10', rest.join(','));
  await ctx.close();
});

// ── E8: focus en Escape ─────────────────────────────────────────────────────

console.log('E8. Na een knop in een melding blijft de focus op een zinvolle plek');
await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  await maakConflict(a, b);
  await a.getByRole('button', { name: 'Laad die versie' }).focus();
  await a.keyboard.press('Enter');
  await sleep(400);
  check('"Laad die versie": de melding is weg', (await melding(a).count()) === 0);
  check('"Laad die versie": de focus staat op het titelveld, niet op <body>', await opTitel(a), JSON.stringify(await actief(a)));

  await maakConflict(a, b, { vanA: 'VAN-A2', vanB: 'VAN-B2' });
  await a.getByRole('button', { name: 'Mijn versie bewaren' }).focus();
  await a.keyboard.press('Enter');
  await sleep(600);
  check('"Mijn versie bewaren": bewaard', (await cursusIn(a)).chapters[0].sections[0].title === 'VAN-A2');
  check('"Mijn versie bewaren": de focus staat op het titelveld', await opTitel(a), JSON.stringify(await actief(a)));

  await maakConflict(a, b, { vanA: 'VAN-A3', vanB: 'VAN-B3' });
  await a.getByRole('button', { name: 'Mijn versie als kopie bewaren' }).focus();
  await a.keyboard.press('Enter');
  await sleep(800);
  check('"Mijn versie als kopie bewaren": we bewerken nu de kopie', a.url().includes('#/cursus/bewerk/') && !a.url().includes('/bewerk/c1'));
  check('"Mijn versie als kopie bewaren": de focus staat op het titelveld', await opTitel(a), JSON.stringify(await actief(a)));
  await ctx.close();
});

await geval(async () => {
  const ctx = await profiel({ courses: [standaard()] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const keys = await vulOpslag(p);
  await p.getByLabel('Titel van de cursus').fill(NIEUWE_TITEL);
  await sleep(1300);
  await p.getByRole('button', { name: 'Opnieuw proberen' }).focus();
  await p.keyboard.press('Enter');
  await sleep(300);
  check('"Opnieuw proberen" zonder plaats: de knop blijft, en de focus erop',
    (await actief(p))?.tekst.includes('Opnieuw proberen') === true, JSON.stringify(await actief(p)));
  await maakVrij(p, keys);
  await p.keyboard.press('Enter');
  await sleep(500);
  check('"Opnieuw proberen" met plaats: bewaard', (await cursusIn(p)).title === NIEUWE_TITEL && (await melding(p).count()) === 0);
  check('"Opnieuw proberen" met plaats: de focus staat op het titelveld', await opTitel(p), JSON.stringify(await actief(p)));
  await ctx.close();
});

await geval(async () => {
  const pdfBlok = { id: 'p1', type: 'pdf', pdfId: 'pdfA', name: 'les.pdf' };
  const ctx = await profiel({ courses: [cursus([{ id: 's1', title: 'Sectie 1', blocks: [pdfBlok] }])] });
  const p = await tab(ctx, '#/cursus/bewerk/c1');
  const blok = p.locator('.editor-item').nth(0);
  await blok.getByRole('button', { name: 'Verwijderen', exact: true }).click();
  check('de pdf-vraag staat open, met de focus op "Annuleren"',
    (await blok.getByRole('group', { name: 'Pdf-bestand verwijderen' }).isVisible()) && (await actief(p))?.tekst === 'Annuleren');
  await p.keyboard.press('Escape');
  await sleep(200);
  check('Escape annuleert de pdf-vraag', (await blok.getByRole('group', { name: 'Pdf-bestand verwijderen' }).count()) === 0);
  check('Escape: de focus staat terug op "Verwijderen"', (await actief(p))?.tekst === 'Verwijderen', JSON.stringify(await actief(p)));
  check('Escape: het bestand hangt er nog aan en er ging geen ander venster open',
    (await blok.getByText('les.pdf').count()) >= 1 && (await p.getByRole('dialog').count()) === 0);
  await sleep(1200);
  check('Escape: er is niets gewijzigd of bewaard', (await cursusIn(p)).updatedAt === 1000 && (await cursusIn(p)).chapters[0].sections[0].blocks[0].pdfId === 'pdfA');
  await ctx.close();
});

// ── B4: een afbeelding uit een ander tabblad verschijnt vanzelf ─────────────

console.log('B4. Een nieuwe afbeelding uit een ander tabblad is zonder herladen te zien');
await geval(async () => {
  const ctx = await profiel({
    courses: [cursus([{ id: 's1', title: 'Sectie 1', blocks: [{ id: 'i1', type: 'image', url: '', size: 'normal' }] }])],
  });
  const a = await tab(ctx, '#/cursus/bewerk/c1');
  const b = await tab(ctx, '#/cursus/bewerk/c1');
  const beeld = (p) => p.evaluate(() => {
    const img = document.querySelector('.editor-item img');
    return img ? { src: (img.getAttribute('src') || '').slice(0, 5), ok: img.complete && img.naturalWidth > 0 } : null;
  });
  await a.locator('.editor-item input[type=file]').first().setInputFiles({ name: 'les.png', mimeType: 'image/png', buffer: maakPng() });
  await sleep(2000);
  const inA = await beeld(a);
  check('A toont de nieuwe afbeelding', inA?.src === 'blob:' && inA.ok, JSON.stringify(inA));
  const stempel = (await cursusIn(a)).updatedAt;
  check('A bewaarde de afbeelding (een verwijzing in de opslag)', JSON.stringify(await cursusIn(a)).includes('wfmedia:'));
  check('B zegt dat er bijgewerkt werd', (await status(b)).includes('Bijgewerkt uit een ander tabblad'), await status(b));
  let inB = await beeld(b);
  for (let i = 0; i < 20 && !(inB?.src === 'blob:' && inB.ok); i++) { await sleep(150); inB = await beeld(b); }
  check('B toont de afbeelding zonder herladen (blob-URL die laadt)', inB?.src === 'blob:' && inB.ok, JSON.stringify(inB));
  await sleep(1500);
  const na = await cursusIn(b);
  check('B schreef niets (zelfde versie, nog altijd verwijzing)', na.updatedAt === stempel && JSON.stringify(na).includes('wfmedia:'));
  check('B toont geen melding en geen "Niet bewaard"', (await melding(b).count()) === 0 && !(await status(b)).includes('Niet bewaard'));
  check('B kan verder bouwen: een wijziging in B wordt gewoon bewaard', await (async () => {
    await b.getByLabel('Titel van de sectie').fill('Verder in B');
    await sleep(1500);
    return (await cursusIn(a)).chapters[0].sections[0].title === 'Verder in B' && (await melding(b).count()) === 0;
  })());
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
console.log(failures === 0 ? 'ALLE CURSUSEDITOR-CHECKS GESLAAGD ✓' : `${failures} CHECKS GEFAALD ✗`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
