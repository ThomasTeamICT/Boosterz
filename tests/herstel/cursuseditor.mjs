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
