// Rooktest herstelpakket B (debugronde oktober 2026): eerlijk bewaren in de
// widget-editor, en eerlijk importeren.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/editor-import.mjs
//
//  OP2   Een pakket importeren bij een volle opslag: "3 van 5 bewaard", nooit
//        "5 geïmporteerd"; na opruimen bewaart "Opnieuw proberen" de rest.
//  OP3   Editor bij een volle opslag: "Niet bewaard" in plaats van "Bewaard",
//        één banner (geen alert-regen), de tekst blijft staan, weggaan vraagt
//        eerst, en na opruimen lukt "Opnieuw proberen".
//  OP4   Twee tabbladen: openen alleen schrijft niets; een versie uit een
//        ander tabblad wordt overgenomen of eerst voorgelegd, nooit stil
//        overschreven; een elders verwijderde widget komt niet terug.
//  OP10  Een ANSI-csv (Excel op Windows) geeft leesbare tekst, geen �.
//  OP11  Een cursusbestand over een eigen cursus: eerst een keuze; "als kopie"
//        laat het eigen werk staan; de pdf uit het bestand wordt teruggezet.
//  A11Y19, W15d, W5  Eén main en één h1 (ook bij fouten), leesbare
//        accentkleur in "Uitproberen", tijdslimiet alleen bij inzendingen.
//
// Per scenario een vers browserprofiel; verzoeken naar buiten worden
// afgebroken. Faalt hard (exit 1) bij een mislukte controle of paginafout.

import { chromium } from 'playwright-core';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Inhoud ──────────────────────────────────────────────────────────────────

const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };

function quiz({ id, title, accentColor = '#4f46e5', updatedAt = Date.now() - 60_000 }) {
  return {
    id, type: 'quiz', title, folderId: null, code: id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, 'X'),
    createdAt: 1, updatedAt, settings: { ...SETTINGS, accentColor },
    config: { questions: [{ id: 'q1', type: 'tf', prompt: 'Water kookt bij 100 °C.', points: 1, answer: true }] },
  };
}

function plaat({ id, title }) {
  return {
    id, type: 'imageviewer', title, folderId: null, code: 'PLAAT1', createdAt: 1, updatedAt: Date.now() - 60_000,
    settings: SETTINGS, config: { imageUrl: '', description: 'Een plaat.' },
  };
}

function cursus({ id, title, updatedAt, blocks }) {
  return {
    id, title, author: '', coverEmoji: '💧', code: 'CEIGEN', createdAt: 1, updatedAt,
    settings: { accentColor: '#0891b2', requireName: false, showProgressToStudent: true },
    chapters: [{ id: 'ch1', title: 'Verdamping', sections: [{ id: 's1', title: 'Wat is verdamping?', optional: false, blocks }] }],
  };
}

/** Tekst in windows-1252 (ANSI), zoals Excel op Windows een csv bewaart. */
function ansi(s) {
  const cp = { '€': 0x80, '’': 0x92, '–': 0x96 };
  return Buffer.from([...s].map((c) => cp[c] ?? c.charCodeAt(0)));
}

/** Contrast met wit, zoals in src/lib/color.ts. */
function contrastMetWit(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const lin = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (L + 0.05);
}

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

async function freshContext(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  return ctx;
}

/** Nieuwe pagina met eigen lijst van paginafouten en dialogen (alert, beforeunload). */
async function openPage(ctx, label) {
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message.slice(0, 200)}`));
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message().slice(0, 120) });
    if (d.type() === 'beforeunload') await d.accept();
    else await d.dismiss();
  });
  return { page, errors, dialogs };
}

const opslag = (page) => page.evaluate(() => ({
  widgets: JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]'),
  courses: JSON.parse(localStorage.getItem('wf.courses.v1') || '[]'),
  folders: JSON.parse(localStorage.getItem('wf.folders.v1') || '[]'),
}));

async function zetWidgets(page, widgets) {
  await page.evaluate((ws) => {
    const rest = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').filter((w) => !ws.some((x) => x.id === w.id));
    localStorage.setItem('wf.widgets.v1', JSON.stringify([...ws, ...rest]));
  }, widgets);
}

/** Titel van een widget in de opslag (undefined = er niet). */
const titelIn = (page, id) => page.evaluate((id) => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').find((w) => w.id === id)?.title, id);

/**
 * Vult localStorage tot ze vol is en maakt daarna (ongeveer) `vrij` tekens
 * vrij. De vulling heeft geen "wf."-sleutel: de app negeert ze.
 */
async function vulOpslag(page, vrij = 0) {
  return page.evaluate((vrij) => {
    const keys = [];
    let i = 0;
    // Hoogstens 100.000 tekens per stuk: vrijmaken schiet dan niet ver voorbij `vrij`.
    for (const size of [100_000, 10_000, 1_000, 100, 10]) {
      const blok = 'x'.repeat(size);
      try {
        for (;;) { const k = `test.vul.${i++}`; localStorage.setItem(k, blok); keys.push([k, size]); }
      } catch { /* vol voor deze maat */ }
    }
    let vrijgemaakt = 0;
    for (const [k, size] of [...keys].reverse()) {
      if (vrijgemaakt >= vrij) break;
      localStorage.removeItem(k);
      vrijgemaakt += size + k.length;
    }
    return { stukken: keys.length, vrijgemaakt };
  }, vrij);
}

async function leegOpslag(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('test.vul.')) localStorage.removeItem(k);
  });
}

const tel = (page) => page.evaluate(() => ({
  main: document.querySelectorAll('main').length,
  h1: document.querySelectorAll('h1').length,
}));
const geenOverloop = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const status = (page) => page.locator('.editor-topbar [aria-live="polite"]').innerText().catch(() => '');
const bronKaart = (page) => page.locator('.card').filter({ has: page.getByLabel('Titel van deze bron') });

/** Pdf lezen uit IndexedDB (zelfde database als lib/idb.ts). */
async function pdfIn(page, id) {
  return page.evaluate(async (id) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('wf-files', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const rec = await new Promise((res) => {
      const g = db.transaction('pdfs').objectStore('pdfs').get(id);
      g.onsuccess = () => res(g.result ? { name: g.result.name, size: g.result.size } : null);
      g.onerror = () => res(null);
    });
    db.close();
    return rec;
  }, id);
}

async function editorKlaar(page) {
  await page.getByLabel('Titel van de widget').waitFor({ timeout: 10000 });
  await sleep(300);
}

// ── OP2: pakket importeren bij een volle opslag ─────────────────────────────

console.log('OP2. Vakgroeppakket importeren terwijl de opslag volloopt');
{
  const ctx = await freshContext();
  const { page, errors, dialogs } = await openPage(ctx, 'OP2');
  await page.goto(BASE + '#/importeren');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await sleep(500);
  const vulling = await vulOpslag(page, 450_000); // ruimte voor ±2 widgets van 200.000 tekens
  const pakket = {
    app: 'boosterz', kind: 'pakket', v: 1,
    meta: { naam: 'Fotopakket', auteur: 'T', datum: '', aantal: 5 },
    widgets: [1, 2, 3, 4, 5].map((i) => ({
      id: `p${i}`, type: 'imageviewer', title: `Pakketwidget ${i}`, folderId: null, code: `PK${i}XYZ`, createdAt: 1, updatedAt: 1,
      settings: SETTINGS, config: { imageUrl: '', description: 'x'.repeat(200_000) },
    })),
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'fotopakket.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pakket)) });
  await page.getByRole('button', { name: /Nu importeren/ }).click({ timeout: 4000 }).catch(() => {});
  await sleep(600);
  const bewaard = (await opslag(page)).widgets.filter((w) => /^Pakketwidget/.test(w.title)).length;
  const kaart = (await bronKaart(page).innerText()).replace(/\s+/g, ' ');
  check('opslag was echt vol: niet alle vijf bewaard', bewaard > 0 && bewaard < 5, `bewaard ${bewaard}, vulling ${JSON.stringify(vulling)}`);
  check(`de kaart zegt eerlijk "${bewaard} van 5 widgets bewaard"`, kaart.includes(`${bewaard} van 5 widgets bewaard`), kaart.slice(0, 200));
  check('nergens "5 widgets geïmporteerd"', !/5 widgets geïmporteerd/.test(kaart));
  check('label "deels bewaard" en een knop "Opnieuw proberen"', /deels bewaard/.test(kaart) && /Opnieuw proberen \(\d\)/.test(kaart));

  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(200);
  check('390 px: geen horizontale scroll met de melding', await geenOverloop(page));
  await page.setViewportSize({ width: 1280, height: 900 });

  await leegOpslag(page);
  await page.getByRole('button', { name: /Opnieuw proberen/ }).click({ timeout: 4000 }).catch(() => {});
  await sleep(600);
  const na = (await opslag(page)).widgets.filter((w) => /^Pakketwidget/.test(w.title));
  const kaart2 = (await bronKaart(page).innerText()).replace(/\s+/g, ' ');
  check('na opruimen bewaart "Opnieuw proberen" de rest: 5 widgets', na.length === 5, `${na.length}`);
  check('alle vijf in dezelfde map, die er maar één keer is', new Set(na.map((w) => w.folderId)).size === 1 && Boolean(na[0]?.folderId)
    && (await opslag(page)).folders.filter((f) => f.name === 'Fotopakket').length === 1);
  check('melding nu: "5 widgets geïmporteerd in de map “Fotopakket”"', kaart2.includes('5 widgets geïmporteerd in de map “Fotopakket”'), kaart2.slice(0, 200));
  check('geen alert()', !dialogs.some((d) => d.type === 'alert'), JSON.stringify(dialogs));
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── OP3: editor bij een volle opslag ────────────────────────────────────────

console.log('OP3. Widget-editor bij een volle opslag');
{
  const ctx = await freshContext();
  const { page, errors, dialogs } = await openPage(ctx, 'OP3');
  await page.goto(BASE + '#/widgets');
  await sleep(500);
  await zetWidgets(page, [quiz({ id: 'w_vol', title: 'Toets water' })]);
  await page.goto(BASE + '#/bewerk/w_vol');
  await editorKlaar(page);
  await vulOpslag(page, 0);
  const titel = page.getByLabel('Titel van de widget');
  await titel.click();
  await titel.press('End');
  await titel.pressSequentially(' en nog veel meer tekst'.repeat(10), { delay: 0 });
  await sleep(1200);
  await titel.pressSequentially(' extra', { delay: 0 });
  await sleep(1200);
  const opScherm = await titel.inputValue({ timeout: 4000 }).catch(() => '');
  check('indicator zegt "Niet bewaard" (nooit "Bewaard")', /Niet bewaard/.test(await status(page)), await status(page));
  const banners = page.getByRole('alert').filter({ hasText: 'Niet bewaard.' });
  check('één duidelijke melding (banner met role=alert)', (await banners.count()) === 1, `${await banners.count()}`);
  check('geen alert()-regen', !dialogs.some((d) => d.type === 'alert'), JSON.stringify(dialogs));
  check('de getypte tekst staat nog op het scherm', opScherm.length > 200 && opScherm.endsWith(' extra'));
  check('in de opslag staat nog de oude titel (eerlijk: niet bewaard)', (await titelIn(page, 'w_vol')) === 'Toets water');
  check('ook in deze fouttoestand één main en één h1', JSON.stringify(await tel(page)) === '{"main":1,"h1":1}', JSON.stringify(await tel(page)));

  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(200);
  check('390 px: geen horizontale scroll met de banner', await geenOverloop(page));
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Terug', exact: true }).click({ timeout: 4000 }).catch(() => {});
  const vraag = page.getByRole('dialog', { name: 'Je wijzigingen zijn niet bewaard' });
  await vraag.waitFor({ timeout: 3000 }).catch(() => {});
  check('"Terug" vraagt eerst (geen stil verlies bij weggaan)', await vraag.isVisible());
  await vraag.getByRole('button', { name: 'Blijven' }).click().catch(() => {});
  await sleep(300);
  check('na "Blijven": nog in de editor, tekst ongewijzigd', page.url().includes('#/bewerk/w_vol') && (await titel.inputValue({ timeout: 4000 }).catch(() => '')) === opScherm);

  await leegOpslag(page);
  await page.getByRole('button', { name: 'Opnieuw proberen' }).click({ timeout: 4000 }).catch(() => {});
  await sleep(300);
  check('na opruimen + "Opnieuw proberen": alles in de opslag', (await titelIn(page, 'w_vol')) === opScherm);
  check('de indicator zegt nu "Bewaard"', /Bewaard/.test(await status(page)) && !/Niet bewaard/.test(await status(page)), await status(page));
  check('de banner is weg', (await page.getByRole('alert').filter({ hasText: 'Niet bewaard.' }).count()) === 0);

  // Opnieuw vol, opnieuw typen, en dan het tabblad sluiten: de browser vraagt eerst.
  await vulOpslag(page, 0);
  await titel.pressSequentially(' nog meer', { delay: 0, timeout: 4000 }).catch(() => {});
  await sleep(1200);
  await page.close({ runBeforeUnload: true });
  await sleep(800);
  check('tabblad sluiten met onbewaard werk: de browser vraagt eerst', dialogs.some((d) => d.type === 'beforeunload'), JSON.stringify(dialogs));
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── OP4: twee tabbladen ─────────────────────────────────────────────────────

console.log('OP4. Twee tabbladen met dezelfde widget');
{
  const ctx = await freshContext();
  const A = await openPage(ctx, 'A');
  const B = await openPage(ctx, 'B');
  await A.page.goto(BASE + '#/widgets');
  await sleep(500);
  await zetWidgets(A.page, [quiz({ id: 'w_twee', title: 'Origineel' }), quiz({ id: 'w_weg', title: 'Wordt verwijderd' })]);
  const versie0 = (await opslag(A.page)).widgets.find((w) => w.id === 'w_twee').updatedAt;
  await A.page.goto(BASE + '#/bewerk/w_twee');
  await editorKlaar(A.page);
  await sleep(1000);
  check('alleen openen schrijft niets', (await opslag(A.page)).widgets.find((w) => w.id === 'w_twee').updatedAt === versie0);

  await B.page.goto(BASE + '#/widgets');
  await sleep(500);
  const bewaarInB = (titel) => B.page.evaluate((titel) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
    const w = ws.find((x) => x.id === 'w_twee');
    w.title = titel;
    w.updatedAt = Date.now();
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  }, titel);

  // 1. B bewaart; A heeft niets gewijzigd → A toont de versie van B en zet niets terug.
  await bewaarInB('AANGEPAST IN TAB B');
  await sleep(800);
  check('A neemt de nieuwere versie van B over', (await A.page.getByLabel('Titel van de widget').inputValue({ timeout: 4000 }).catch(() => '')) === 'AANGEPAST IN TAB B');
  await A.page.close({ runBeforeUnload: true });
  await sleep(800);
  check('A sluiten zet de titel van B niet terug', (await titelIn(B.page, 'w_twee')) === 'AANGEPAST IN TAB B');

  // 2. A2 typt en B bewaart tegelijk → A2 legt het voor, overschrijft niet stil.
  const A2 = await openPage(ctx, 'A2');
  await A2.page.goto(BASE + '#/bewerk/w_twee');
  await editorKlaar(A2.page);
  const t2 = A2.page.getByLabel('Titel van de widget');
  await t2.click();
  await t2.press('End');
  await t2.pressSequentially(' (A2)', { delay: 0 });
  await bewaarInB('B TWEEDE KEER');
  await sleep(1200);
  const conflict = A2.page.getByRole('alert').filter({ hasText: 'intussen in een ander tabblad bewaard' });
  check('A2 toont de keuze (conflict), geen stille overschrijving', await conflict.isVisible().catch(() => false));
  check('de versie van B staat nog in de opslag', (await titelIn(B.page, 'w_twee')) === 'B TWEEDE KEER');
  check('A2 zegt "Niet bewaard"', /Niet bewaard/.test(await status(A2.page)), await status(A2.page));
  check('ook bij een conflict één main en één h1', JSON.stringify(await tel(A2.page)) === '{"main":1,"h1":1}');
  await A2.page.getByRole('button', { name: 'Mijn versie bewaren' }).click({ timeout: 4000 }).catch(() => {});
  await sleep(400);
  check('"Mijn versie bewaren" (uitdrukkelijk): de titel van A2 staat in de opslag', (await titelIn(B.page, 'w_twee')) === 'AANGEPAST IN TAB B (A2)');

  // 3. Nog een conflict, nu "Andere versie laden".
  await t2.pressSequentially(' X', { delay: 0 });
  await bewaarInB('B DERDE KEER');
  await sleep(1200);
  await A2.page.getByRole('button', { name: /Andere versie laden/ }).click().catch(() => {});
  await sleep(400);
  check('"Andere versie laden": A2 toont de versie van B', (await t2.inputValue({ timeout: 4000 }).catch(() => '')) === 'B DERDE KEER');
  await A2.page.close({ runBeforeUnload: true });
  await sleep(800);
  check('A2 sluiten laat de versie van B staan', (await titelIn(B.page, 'w_twee')) === 'B DERDE KEER');
  check('A2: geen vraag bij sluiten zonder onbewaard werk', !A2.dialogs.some((d) => d.type === 'beforeunload'), JSON.stringify(A2.dialogs));

  // 4. Verwijderd in B terwijl A3 de editor open heeft.
  const A3 = await openPage(ctx, 'A3');
  await A3.page.goto(BASE + '#/bewerk/w_weg');
  await editorKlaar(A3.page);
  await B.page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1')).filter((x) => x.id !== 'w_weg');
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  });
  await sleep(800);
  check('A3 meldt dat de widget elders verwijderd werd', await A3.page.getByRole('alert').filter({ hasText: 'in een ander tabblad verwijderd' }).isVisible().catch(() => false));
  const t3 = A3.page.getByLabel('Titel van de widget');
  await t3.click();
  await t3.pressSequentially(' toch', { delay: 0 });
  await sleep(1200);
  check('typen in A3 zet de verwijderde widget niet stil terug', (await titelIn(B.page, 'w_weg')) === undefined);
  await A3.page.close({ runBeforeUnload: true });
  await sleep(800);
  check('A3 sluiten met onbewaard werk: de browser vraagt eerst', A3.dialogs.some((d) => d.type === 'beforeunload'), JSON.stringify(A3.dialogs));
  check('na sluiten van A3: de widget is NIET terug', (await titelIn(B.page, 'w_weg')) === undefined);

  const fouten = [...A.errors, ...A2.errors, ...A3.errors, ...B.errors];
  check('geen alert()', ![A, A2, A3, B].some((t) => t.dialogs.some((d) => d.type === 'alert')));
  check('geen paginafout', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── OP10: ANSI-csv ──────────────────────────────────────────────────────────

console.log('OP10. Een csv uit Excel op Windows (ANSI)');
{
  const ctx = await freshContext();
  const { page, errors } = await openPage(ctx, 'OP10');
  await page.goto(BASE + '#/importeren');
  await page.getByRole('heading', { level: 1 }).waitFor();
  check('de bestandskiezer biedt .csv aan', /\.csv/.test(await page.locator('input[type=file]').getAttribute('accept')));
  await page.locator('input[type=file]').setInputFiles({
    name: 'woordenlijst.csv', mimeType: 'text/csv', buffer: ansi('naam;woord\nEmma;café\nNoah;€5 – ’t is één\n'),
  });
  await sleep(600);
  const tekst = await page.getByLabel(/Geëxtraheerde tekst/).inputValue().catch(() => '');
  check('accenten en € komen goed door', tekst.includes('café') && tekst.includes('€5 – ’t is één'), JSON.stringify(tekst));
  check('geen vervangtekens (�)', !tekst.includes('�'));
  check('waarschuwing: gelezen als Windows-tekst (ANSI)', /ANSI/.test(await bronKaart(page).innerText()));
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── OP11: cursusbestand over een eigen cursus ───────────────────────────────

console.log('OP11. Cursusbestand importeren over een eigen cursus (met pdf)');
{
  const ctx = await freshContext();
  const { page, errors } = await openPage(ctx, 'OP11');
  await page.goto(BASE + '#/importeren');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.evaluate((c) => {
    localStorage.setItem('wf.courses.v1', JSON.stringify([c]));
    localStorage.removeItem('wf.gedeeld.v1'); // geen register: dit is eigen werk
  }, cursus({ id: 'c_eigen', title: 'LOKAAL BIJGEWERKT', updatedAt: Date.now(), blocks: [{ id: 'b1', type: 'text', markdown: 'Uren werk.' }] }));
  const bestand = {
    app: 'boosterz', kind: 'cursus', v: 1, widgets: [],
    course: cursus({
      id: 'c_eigen', title: 'COLLEGA-VERSIE', updatedAt: Date.now() - 3_600_000,
      blocks: [{ id: 'b1', type: 'text', markdown: 'Oud.' }, { id: 'p1', type: 'pdf', pdfId: 'pdf_imp', name: 'werkblad.pdf' }],
    }),
    pdfs: [{ id: 'pdf_imp', name: 'werkblad.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }],
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bestand)) });
  await sleep(500);
  await page.getByRole('button', { name: /Nu importeren/ }).click({ timeout: 4000 }).catch(() => {});
  const vraag = page.getByRole('dialog', { name: 'Er staat al een versie op dit toestel' });
  await vraag.waitFor({ timeout: 3000 }).catch(() => {});
  check('eerst een keuze, geen stille vervanging', await vraag.isVisible());
  check('de vraag zegt dat het bestand ouder is', /ouder/.test(await vraag.innerText().catch(() => '')));
  check('met de vraag open: één main en één h1', JSON.stringify(await tel(page)) === '{"main":1,"h1":1}', JSON.stringify(await tel(page)));
  await page.keyboard.press('Escape');
  await sleep(300);
  const titels0 = (await opslag(page)).courses.map((c) => c.title);
  check('annuleren: er is niets veranderd', JSON.stringify(titels0) === '["LOKAAL BIJGEWERKT"]', JSON.stringify(titels0));
  check('annuleren: de pagina zegt dat', await page.getByText('Importeren geannuleerd: er is niets veranderd.').isVisible().catch(() => false));

  await page.getByRole('button', { name: /Nu importeren/ }).click({ timeout: 4000 }).catch(() => {});
  await vraag.waitFor({ timeout: 3000 }).catch(() => {});
  await vraag.getByRole('button', { name: 'Als kopie bewaren' }).click({ timeout: 4000 }).catch(() => {});
  await sleep(800);
  const cursussen = (await opslag(page)).courses;
  const titels = cursussen.map((c) => c.title).sort();
  check('"als kopie": het eigen werk blijft, de import staat ernaast',
    JSON.stringify(titels) === JSON.stringify(['COLLEGA-VERSIE (kopie)', 'LOKAAL BIJGEWERKT']), JSON.stringify(titels));
  check('het eigen werk is onaangeroerd', cursussen.find((c) => c.id === 'c_eigen')?.title === 'LOKAAL BIJGEWERKT');
  const kaart = (await bronKaart(page).innerText()).replace(/\s+/g, ' ');
  check('de kaart zegt eerlijk wat er gebeurde (kopie)', /ernaast als kopie/.test(kaart) && !/staat nu bij je cursussen/.test(kaart), kaart.slice(0, 220));
  const kopie = cursussen.find((c) => c.title === 'COLLEGA-VERSIE (kopie)');
  const href = await bronKaart(page).getByRole('link', { name: /Cursus openen/ }).getAttribute('href').catch(() => '');
  check('"Cursus openen" gaat naar de kopie', Boolean(kopie) && href.includes(kopie.id), href);
  check('de pdf uit het bestand is teruggezet', (await pdfIn(page, 'pdf_imp'))?.name === 'werkblad.pdf');

  // G3: een NIEUWER bestand over eigen werk, "Mijn versie houden": geen stille
  // no-op met "geïmporteerd", en geen wees-pdf in IndexedDB.
  const nieuwer = {
    app: 'boosterz', kind: 'cursus', v: 1, widgets: [],
    course: cursus({
      id: 'c_eigen', title: 'NIEUWERE COLLEGA-VERSIE', updatedAt: Date.now(),
      blocks: [{ id: 'b1', type: 'text', markdown: 'Nieuw.' }, { id: 'p2', type: 'pdf', pdfId: 'pdf_wees', name: 'wees.pdf' }],
    }),
    pdfs: [{ id: 'pdf_wees', name: 'wees.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }],
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'nieuwer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(nieuwer)) });
  await sleep(500);
  const kaartNieuw = bronKaart(page).filter({ hasText: 'nieuwer.json' });
  await kaartNieuw.getByRole('button', { name: /Nu importeren/ }).click({ timeout: 4000 }).catch(() => {});
  await vraag.waitFor({ timeout: 3000 }).catch(() => {});
  check('G3: nieuwer bestand over eigen werk: eerst een keuze', await vraag.isVisible());
  await vraag.getByRole('button', { name: 'Mijn versie houden' }).click({ timeout: 4000 }).catch(() => {});
  await sleep(600);
  const tekstNieuw = (await kaartNieuw.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('G3: "houden" laat het eigen werk staan', (await opslag(page)).courses.find((c) => c.id === 'c_eigen')?.title === 'LOKAAL BIJGEWERKT');
  check('G3: de kaart zegt eerlijk dat er niets vervangen is (geen "geïmporteerd")',
    /niets vervangen/.test(tekstNieuw) && /eigen versie “LOKAAL BIJGEWERKT” bleef staan/.test(tekstNieuw) && !/geïmporteerd/.test(tekstNieuw), tekstNieuw.slice(0, 260));
  check('G3: geen wees-pdf in IndexedDB', (await pdfIn(page, 'pdf_wees')) === null);
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── A11Y19, W15d en W5 in de editor ─────────────────────────────────────────

console.log('A11Y19, W15d, W5. Editor: landmarks, accentkleur en beperkingen');
{
  const ctx = await freshContext();
  const { page, errors } = await openPage(ctx, 'A11Y');
  await page.goto(BASE + '#/widgets');
  await sleep(500);
  await zetWidgets(page, [quiz({ id: 'w_licht', title: 'Lichte quiz', accentColor: '#fde047' }), plaat({ id: 'w_plaat', title: 'Plaat' })]);

  await page.goto(BASE + '#/bewerk/bestaat-niet');
  await page.getByRole('heading', { level: 1, name: 'Widget niet gevonden' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('"Widget niet gevonden": één main en één h1', JSON.stringify(await tel(page)) === '{"main":1,"h1":1}', JSON.stringify(await tel(page)));

  await page.goto(BASE + '#/bewerk/w_licht');
  await editorKlaar(page);
  check('editor: één main en één h1', JSON.stringify(await tel(page)) === '{"main":1,"h1":1}', JSON.stringify(await tel(page)));
  await page.getByRole('tab', { name: /Instellingen/ }).click({ timeout: 4000 }).catch(() => {});
  check('instellingen: hint bij een te lichte accentkleur', await page.getByText('Te licht voor witte tekst').isVisible().catch(() => false));
  check('quiz (met inzendingen): tijdslimiet zichtbaar', await page.getByLabel('Tijdslimiet (minuten)').isVisible().catch(() => false));
  await page.getByRole('button', { name: /Uitproberen/ }).click({ timeout: 4000 }).catch(() => {});
  await sleep(500);
  const accent = await page.evaluate(() => getComputedStyle(document.querySelector('main.player-shell')).getPropertyValue('--player-accent').trim());
  check('"Uitproberen" gebruikt een leesbare accentkleur (≥ 4,5 met wit)', accent.toLowerCase() !== '#fde047' && contrastMetWit(accent) >= 4.5, accent);
  check('"Uitproberen": één main en één h1', JSON.stringify(await tel(page)) === '{"main":1,"h1":1}', JSON.stringify(await tel(page)));

  await page.goto(BASE + '#/bewerk/w_plaat');
  await page.reload(); // vers openen (de editor blijft anders in "Uitproberen")
  await editorKlaar(page);
  await page.getByRole('tab', { name: /Instellingen/ }).click({ timeout: 4000 }).catch(() => {});
  await sleep(200);
  check('plaat (zonder inzendingen): geen tijdslimiet of pogingen', (await page.getByLabel('Tijdslimiet (minuten)').count()) === 0
    && (await page.getByLabel('Max. pogingen per leerling').count()) === 0);
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// BEGIN P3 — herstelpakket P3: kleinere punten in de widget-editor
// ════════════════════════════════════════════════════════════════════════════
// Eigen blok met eigen hulpfuncties, los van het importdeel hierboven.
//
//  B1   "Opnieuw bewaren" van een elders verwijderde widget: banner en melding
//       zeggen eerlijk dat de resultaten van de leerlingen niet terugkomen
//       (alleen bij soorten met inzendingen).
//  B4   Na het overnemen van een versie met een nieuwe afbeelding wordt de
//       afbeelding vanzelf zichtbaar (geen herladen nodig).
//  B5   Overnemen houdt de focus (en cursor) in het veld waar je typte, en
//       "Bijgewerkt uit een ander tabblad" blijft staan tot de volgende wijziging.
//  B6   Een open AI-assistent telt als onbewaard werk: een conflict, geen stil
//       overnemen; sluiten zonder toepassen laadt dan de nieuwe versie.
//  B8a  Een knop "Downloaden als bestand" in de conflictbanner.
//  B9   Na een bannerknop staat de focus op het titelveld; de tekst bij
//       weggaan noemt de echte reden (niet altijd "de opslag is vol").

console.log('P3. Widget-editor: kleinere punten (B1, B4, B5, B6, B8a, B9)');
{
  const wacht = async (voorwaarde, ms = 4000) => {
    const tot = Date.now() + ms;
    while (Date.now() < tot) {
      if (await voorwaarde().catch(() => false)) return true;
      await sleep(80);
    }
    return false;
  };
  /** Een ander tabblad bewaart een widget (nieuwe updatedAt, zoals saveWidget). */
  const bewaarElders = (page, id, patch) => page.evaluate(([id, patch]) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
    const w = ws.find((x) => x.id === id);
    Object.assign(w, patch);
    w.updatedAt = Math.max(Date.now(), (w.updatedAt || 0) + 1);
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  }, [id, patch]);
  const verwijderElders = (page, id) => page.evaluate((id) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1')).filter((x) => x.id !== id);
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  }, id);
  /** Waar staat de focus? (label = aria-label, voor het titelveld "Titel van de widget") */
  const focusOp = (page) => page.evaluate(() => {
    const a = document.activeElement;
    return {
      tag: a?.tagName ?? '', label: a?.getAttribute('aria-label') ?? '',
      inPaneel: Boolean(a && document.getElementById('panel-content')?.contains(a)),
    };
  });
  const opTitel = async (page) => {
    const f = await focusOp(page);
    return f.tag === 'INPUT' && f.label === 'Titel van de widget';
  };
  // de nieuwste melding (een oudere kan nog even zichtbaar zijn)
  const toastTekst = (page) => page.locator('.toast-stack .toast').last().innerText({ timeout: 1500 }).catch(() => '');
  const alertTekst = (page, deel) => page.getByRole('alert').filter({ hasText: deel }).innerText().catch(() => '').then((t) => t.replace(/\s+/g, ' '));
  /** Knop focussen en met Enter bedienen, zoals een toetsenbordgebruiker. */
  const enterOp = async (page, naam) => {
    const knop = page.getByRole('button', { name: naam });
    await knop.focus({ timeout: 4000 });
    await page.keyboard.press('Enter');
  };
  /** Twee tabbladen in één profiel: `editor` met de widget open, `elders` zonder. */
  async function tweeTabs(label, widgets, id) {
    const ctx = await freshContext();
    const editor = await openPage(ctx, `${label}-editor`);
    const elders = await openPage(ctx, `${label}-elders`);
    await editor.page.goto(BASE + '#/widgets');
    await sleep(500);
    await zetWidgets(editor.page, widgets);
    await elders.page.goto(BASE + '#/widgets');
    await editor.page.goto(BASE + `#/bewerk/${id}`);
    await editorKlaar(editor.page);
    return { ctx, editor, elders };
  }

  // ── B1 en B9 (verwijderd): Opnieuw bewaren ────────────────────────────────
  console.log(' B1/B9. Elders verwijderd, dan "Opnieuw bewaren"');
  {
    const { ctx, editor, elders } = await tweeTabs('B1', [quiz({ id: 'w_b1', title: 'Toets met resultaten' }), plaat({ id: 'w_b1plaat', title: 'Plaat zonder resultaten' })], 'w_b1');
    const { page } = editor;
    await verwijderElders(elders.page, 'w_b1');
    await wacht(() => page.getByRole('alert').filter({ hasText: 'in een ander tabblad verwijderd' }).isVisible());
    const banner = await alertTekst(page, 'in een ander tabblad verwijderd');
    check('B1: de banner zegt dat de resultaten van de leerlingen niet terugkomen', /De resultaten van je leerlingen komen niet terug\./.test(banner), banner);
    await enterOp(page, 'Opnieuw bewaren');
    await wacht(async () => (await titelIn(elders.page, 'w_b1')) !== undefined);
    check('B1: de widget staat weer in de opslag', (await titelIn(elders.page, 'w_b1')) === 'Toets met resultaten');
    const melding = await toastTekst(page);
    check('B1: de melding zegt "opnieuw bewaard" én dat de resultaten niet terugkomen',
      /De widget is opnieuw bewaard\./.test(melding) && /resultaten van je leerlingen komen niet terug/.test(melding), melding);
    check('B9: na "Opnieuw bewaren" staat de focus op het titelveld (niet op BODY)', await opTitel(page), JSON.stringify(await focusOp(page)));
    check('de banner is weg', (await page.getByRole('alert').count()) === 0);

    // Een soort zonder inzendingen (plaat) heeft geen resultaten om te verliezen.
    await page.goto(BASE + '#/bewerk/w_b1plaat');
    await editorKlaar(page);
    await verwijderElders(elders.page, 'w_b1plaat');
    await wacht(() => page.getByRole('alert').filter({ hasText: 'in een ander tabblad verwijderd' }).isVisible());
    const bannerPlaat = await alertTekst(page, 'in een ander tabblad verwijderd');
    check('B1: bij een soort zonder inzendingen geen zin over resultaten', bannerPlaat.length > 0 && !/resultaten/.test(bannerPlaat), bannerPlaat);
    await page.getByRole('button', { name: 'Opnieuw bewaren' }).click();
    check('B1: ook de melding zwijgt dan over resultaten', !/resultaten/.test(await toastTekst(page)) && /opnieuw bewaard/.test(await toastTekst(page)));

    await page.setViewportSize({ width: 390, height: 844 });
    await verwijderElders(elders.page, 'w_b1plaat');
    await wacht(() => page.getByRole('alert').filter({ hasText: 'in een ander tabblad verwijderd' }).isVisible());
    await sleep(200);
    check('390 px: geen horizontale scroll met de verwijderd-banner', await geenOverloop(page));
    const fouten = [...editor.errors, ...elders.errors];
    check('geen paginafout', fouten.length === 0, fouten.join(' | '));
    await ctx.close();
  }

  // ── B4: een nieuwe afbeelding na overnemen ────────────────────────────────
  console.log(' B4. Overnemen met een nieuwe afbeelding');
  {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const { ctx, editor, elders } = await tweeTabs('B4', [plaat({ id: 'w_b4', title: 'Plaat voor B4' })], 'w_b4');
    const { page } = editor;
    await sleep(500);
    const versie0 = (await opslag(elders.page)).widgets.find((w) => w.id === 'w_b4').updatedAt;
    // Het andere tabblad voegt een afbeelding toe: blob in IndexedDB + verwijzing in de widget.
    await elders.page.evaluate(async (png) => {
      const bin = atob(png); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
      await new Promise((res, rej) => {
        const r = indexedDB.open('wf-files', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
        r.onsuccess = () => {
          const tx = r.result.transaction('pdfs', 'readwrite');
          tx.objectStore('pdfs').put({ id: 'm_p3nieuw1', name: 'x.png', blob, size: blob.size, createdAt: Date.now() });
          tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
        };
      });
      const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
      const w = ws.find((x) => x.id === 'w_b4');
      w.config.imageUrl = 'wfmedia:m_p3nieuw1';
      w.updatedAt = Date.now() + 5;
      localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
    }, PNG);
    const geladen = await wacht(() => page.evaluate(() => {
      const img = document.querySelector('main img');
      return Boolean(img) && img.src.startsWith('blob:') && img.naturalWidth > 0;
    }), 3000);
    const src = await page.locator('main img').first().getAttribute('src').catch(() => 'geen img');
    check('B4: de nieuwe afbeelding wordt vanzelf zichtbaar (blob: met breedte > 0, zonder herladen)', geladen, String(src));
    check('B4: de editor zegt nog steeds "Bijgewerkt uit een ander tabblad"', /Bijgewerkt uit een ander tabblad/.test(await status(page)), await status(page));
    await sleep(1200);
    const versie1 = (await opslag(elders.page)).widgets.find((w) => w.id === 'w_b4').updatedAt;
    check('B4: opnieuw lezen schrijft niets terug (versie ongewijzigd)', versie1 > versie0 && versie1 === (await opslag(page)).widgets.find((w) => w.id === 'w_b4').updatedAt);
    check('B4: in de opslag staat nog de verwijzing, geen blob-URL',
      (await opslag(page)).widgets.find((w) => w.id === 'w_b4').config.imageUrl === 'wfmedia:m_p3nieuw1');
    const fouten = [...editor.errors, ...elders.errors];
    check('geen paginafout', fouten.length === 0, fouten.join(' | '));
    await ctx.close();
  }

  // ── B5: focus en toetsaanslagen bij overnemen ─────────────────────────────
  console.log(' B5. Overnemen houdt de focus en het bericht blijft staan');
  {
    const { ctx, editor, elders } = await tweeTabs('B5', [quiz({ id: 'w_b5', title: 'Toets B5' })], 'w_b5');
    const { page } = editor;
    const veld = page.locator('#panel-content textarea').first();
    await veld.click();
    await veld.press('Home');
    for (let i = 0; i < 3; i++) await veld.press('ArrowRight');
    const voor = await page.evaluate(() => ({ s: document.activeElement.selectionStart, v: document.activeElement.value }));
    await bewaarElders(elders.page, 'w_b5', { title: 'Titel uit ander tabblad' });
    await wacht(() => page.getByLabel('Titel van de widget').inputValue().then((v) => v === 'Titel uit ander tabblad'));
    check('B5: de versie van het andere tabblad staat op het scherm', (await page.getByLabel('Titel van de widget').inputValue()) === 'Titel uit ander tabblad');
    const na = await focusOp(page);
    check('B5: de focus staat nog in een tekstveld van de editor (niet op BODY)', na.tag === 'TEXTAREA' && na.inPaneel, JSON.stringify(na));
    const sel = await page.evaluate(() => ({ s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd, v: document.activeElement.value }));
    check('B5: dezelfde tekst en dezelfde cursorplaats', sel.v === voor.v && sel.s === voor.s && sel.e === voor.s, JSON.stringify({ voor, sel }));
    await sleep(2500);
    check('B5: "Bijgewerkt uit een ander tabblad" staat er ook na 2,5 s nog (was 1,2 s)',
      /Bijgewerkt uit een ander tabblad/.test(await status(page)), await status(page));
    await page.keyboard.type('XYZ');
    const opScherm = await page.evaluate(() => document.activeElement.value);
    check('B5: de toetsaanslagen komen in het veld terecht, op de cursorplaats', opScherm === voor.v.slice(0, 3) + 'XYZ' + voor.v.slice(3), opScherm);
    await wacht(async () => JSON.stringify((await opslag(page)).widgets.find((w) => w.id === 'w_b5')).includes('XYZ'));
    const w = (await opslag(page)).widgets.find((x) => x.id === 'w_b5');
    check('B5: "XYZ" staat in de opslag, de titel van het andere tabblad ook', JSON.stringify(w.config).includes('XYZ') && w.title === 'Titel uit ander tabblad');
    check('B5: na het typen is "Bijgewerkt" weg (nu "Bewaard")', await wacht(async () => /Bewaard/.test(await status(page)) && !/Bijgewerkt/.test(await status(page)), 2500), await status(page));

    // Focus in het titelveld (niet in het paneel): blijft daar.
    const titel = page.getByLabel('Titel van de widget');
    await sleep(1500);
    await titel.focus();
    await bewaarElders(elders.page, 'w_b5', { title: 'Tweede titel van elders' });
    await wacht(() => titel.inputValue().then((v) => v === 'Tweede titel van elders'));
    check('B5: focus in het titelveld blijft in het titelveld', await opTitel(page), JSON.stringify(await focusOp(page)));

    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(200);
    check('390 px: geen horizontale scroll met "Bijgewerkt uit een ander tabblad"', await geenOverloop(page));
    const fouten = [...editor.errors, ...elders.errors];
    check('geen paginafout', fouten.length === 0, fouten.join(' | '));
    await ctx.close();
  }

  // ── B6: AI-assistent open terwijl een ander tabblad bewaart ───────────────
  console.log(' B6. Open AI-assistent telt als onbewaard werk');
  {
    const { ctx, editor, elders } = await tweeTabs('B6', [quiz({ id: 'w_b6', title: 'Toets B6' })], 'w_b6');
    const { page } = editor;
    const titel = page.getByLabel('Titel van de widget');
    const dialoog = page.getByRole('dialog', { name: /AI-hulp/ });

    // Eerst een open assistent zonder dat iets verandert: niets te zien, niets geschreven.
    const versie0 = (await opslag(page)).widgets.find((w) => w.id === 'w_b6').updatedAt;
    await page.getByRole('button', { name: /AI-assistent/ }).click();
    await dialoog.waitFor({ timeout: 4000 });
    await sleep(700);
    await dialoog.getByRole('button', { name: 'Sluiten', exact: true }).click();
    await sleep(500);
    check('open en weer sluiten zonder verandering: geen banner, niets geschreven',
      (await page.getByRole('alert').count()) === 0 && (await opslag(page)).widgets.find((w) => w.id === 'w_b6').updatedAt === versie0);

    // Nu bewaart een ander tabblad terwijl de assistent openstaat.
    await page.getByRole('button', { name: /AI-assistent/ }).click();
    await dialoog.waitFor({ timeout: 4000 });
    await bewaarElders(elders.page, 'w_b6', { title: 'Titel uit ander tabblad' });
    const conflict = await wacht(() => page.getByRole('alert').filter({ hasText: 'intussen in een ander tabblad bewaard' }).isVisible(), 3000);
    check('B6: er komt een conflictbanner (geen stil overnemen)', conflict);
    check('B6: de editor zegt niet "Bijgewerkt"', !/Bijgewerkt/.test(await status(page)), await status(page));
    check('B6: de titel op het scherm is nog die van hier (niets stil vervangen)', (await titel.inputValue()) === 'Toets B6');
    check('B6: ook een melding boven het venster van de assistent', /Sluit de AI-assistent/.test(await toastTekst(page)), await toastTekst(page));
    const tekst = await alertTekst(page, 'intussen in een ander tabblad bewaard');
    check('B6: de banner noemt de assistent in plaats van "je wijzigingen"', /AI-assistent/.test(tekst) && !/Je wijzigingen hier/.test(tekst), tekst);
    check('B6: de versie van het andere tabblad staat nog in de opslag', (await titelIn(elders.page, 'w_b6')) === 'Titel uit ander tabblad');

    // Sluiten zonder toepassen: er valt niets te verliezen, dus de nieuwe versie laden.
    await dialoog.getByRole('button', { name: 'Sluiten', exact: true }).click();
    const geladen = await wacht(async () => (await titel.inputValue()) === 'Titel uit ander tabblad', 3000);
    check('B6: assistent sluiten zonder toepassen laadt de versie van het andere tabblad', geladen, await titel.inputValue());
    check('B6: dan geen conflictbanner meer, wel "Bijgewerkt uit een ander tabblad"',
      (await page.getByRole('alert').count()) === 0 && /Bijgewerkt uit een ander tabblad/.test(await status(page)), await status(page));
    await sleep(900);
    check('B6: er werd niets over de versie van het andere tabblad geschreven', (await titelIn(elders.page, 'w_b6')) === 'Titel uit ander tabblad');
    const fouten = [...editor.errors, ...elders.errors];
    check('geen paginafout', fouten.length === 0, fouten.join(' | '));
    await ctx.close();
  }

  // ── B8a en B9: conflictbanner (downloaden, focus) ─────────────────────────
  console.log(' B8a/B9. Conflictbanner: downloaden en focus na een keuze');
  {
    const { ctx, editor, elders } = await tweeTabs('B9', [quiz({ id: 'w_b9', title: 'Toets B9' })], 'w_b9');
    const { page } = editor;
    const titel = page.getByLabel('Titel van de widget');
    const maakConflict = async (nieuweTitel) => {
      await titel.click();
      await titel.press('End');
      await titel.pressSequentially(' (hier)', { delay: 0 });
      await bewaarElders(elders.page, 'w_b9', { title: nieuweTitel });
      await wacht(() => page.getByRole('alert').filter({ hasText: 'intussen in een ander tabblad bewaard' }).isVisible(), 3000);
    };

    await maakConflict('Elders 1');
    const knoppen = await page.getByRole('alert').getByRole('button').allInnerTexts();
    check('B8a: de conflictbanner heeft "Downloaden als bestand" naast de twee keuzes',
      knoppen.some((k) => /Mijn versie bewaren/.test(k)) && knoppen.some((k) => /Andere versie laden/.test(k)) && knoppen.some((k) => /Downloaden als bestand/.test(k)), JSON.stringify(knoppen));
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(200);
    check('390 px: geen horizontale scroll met de conflictbanner', await geenOverloop(page));
    await page.setViewportSize({ width: 1280, height: 900 });
    const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.getByRole('alert').getByRole('button', { name: /Downloaden als bestand/ }).click();
    const bestand = await download;
    check('B8a: de knop downloadt de widget als .widget.json', Boolean(bestand) && /\.widget\.json$/.test(bestand.suggestedFilename()), bestand?.suggestedFilename());
    check('B8a: de banner blijft staan (er werd niets beslist)', await page.getByRole('alert').filter({ hasText: 'intussen in een ander tabblad bewaard' }).isVisible());
    check('B8a: de versie van het andere tabblad staat nog in de opslag', (await titelIn(elders.page, 'w_b9')) === 'Elders 1');

    await enterOp(page, 'Andere versie laden');
    await sleep(300);
    check('B9: na "Andere versie laden" staat de focus op het titelveld', await opTitel(page), JSON.stringify(await focusOp(page)));
    check('"Andere versie laden": het scherm toont de versie van elders', (await titel.inputValue()) === 'Elders 1');

    await maakConflict('Elders 2');
    await enterOp(page, 'Mijn versie bewaren');
    await sleep(400);
    check('B9: na "Mijn versie bewaren" staat de focus op het titelveld', await opTitel(page), JSON.stringify(await focusOp(page)));
    check('"Mijn versie bewaren": mijn titel staat in de opslag', (await titelIn(elders.page, 'w_b9')) === 'Elders 1 (hier)', await titelIn(elders.page, 'w_b9'));
    const fouten = [...editor.errors, ...elders.errors];
    check('geen paginafout', fouten.length === 0, fouten.join(' | '));
    await ctx.close();
  }

  // ── B9: "Opnieuw proberen" en de tekst bij weggaan ────────────────────────
  console.log(' B9. Mislukt bewaren: focus na "Opnieuw proberen" en de echte reden bij weggaan');
  {
    // (a) volle opslag
    const ctx = await freshContext();
    const { page, errors } = await openPage(ctx, 'B9vol');
    await page.goto(BASE + '#/widgets');
    await sleep(500);
    await zetWidgets(page, [quiz({ id: 'w_b9vol', title: 'Toets vol' })]);
    await page.goto(BASE + '#/bewerk/w_b9vol');
    await editorKlaar(page);
    await vulOpslag(page, 0);
    const titel = page.getByLabel('Titel van de widget');
    await titel.click();
    await titel.press('End');
    await titel.pressSequentially(' en nog veel meer tekst'.repeat(10), { delay: 0 });
    await sleep(1300);
    await page.getByRole('button', { name: 'Terug', exact: true }).click({ timeout: 4000 }).catch(() => {});
    const vraag = page.getByRole('dialog', { name: 'Je wijzigingen zijn niet bewaard' });
    await vraag.waitFor({ timeout: 3000 }).catch(() => {});
    const volTekst = (await vraag.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('B9: bij een volle opslag zegt de vraag dat de opslag vol is', /De opslag van dit toestel is vol/.test(volTekst) && /Download de widget eerst als bestand/.test(volTekst), volTekst);
    await vraag.getByRole('button', { name: 'Blijven' }).click().catch(() => {});
    await sleep(300);
    await leegOpslag(page);
    await enterOp(page, 'Opnieuw proberen');
    await sleep(400);
    check('B9: na "Opnieuw proberen" staat de focus op het titelveld', await opTitel(page), JSON.stringify(await focusOp(page)));
    check('"Opnieuw proberen" bewaarde alles', (await titelIn(page, 'w_b9vol')) === await titel.inputValue());
    check('geen paginafout (volle opslag)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // (b) een andere fout dan "vol": de opslag weigert (bv. geblokkeerd in privémodus)
    const ctx = await freshContext();
    const { page, errors } = await openPage(ctx, 'B9geblokkeerd');
    await page.goto(BASE + '#/widgets');
    await sleep(500);
    await zetWidgets(page, [quiz({ id: 'w_b9blok', title: 'Toets geblokkeerd' })]);
    await page.goto(BASE + '#/bewerk/w_b9blok');
    await editorKlaar(page);
    await page.evaluate(() => {
      const echt = Storage.prototype.setItem;
      window.__echteSetItem = echt;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'wf.widgets.v1') throw new DOMException('De opslag is geblokkeerd.', 'SecurityError');
        return echt.call(this, k, v);
      };
    });
    const titel = page.getByLabel('Titel van de widget');
    await titel.click();
    await titel.press('End');
    await titel.pressSequentially(' extra', { delay: 0 });
    await sleep(1300);
    const banner = await alertTekst(page, 'Niet bewaard.');
    check('B9: de banner noemt de echte reden (geen volle opslag)', /Bewaren op dit toestel is mislukt/.test(banner) && !/is vol/.test(banner), banner);
    await page.getByRole('button', { name: 'Terug', exact: true }).click({ timeout: 4000 }).catch(() => {});
    const vraag = page.getByRole('dialog', { name: 'Je wijzigingen zijn niet bewaard' });
    await vraag.waitFor({ timeout: 3000 }).catch(() => {});
    const tekst = (await vraag.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('B9: de vraag bij weggaan zegt níét "de opslag is vol"', tekst.length > 0 && !/\bvol\b/.test(tekst), tekst);
    check('B9: ze noemt wel de echte reden en wat je kan doen', /Bewaren op dit toestel is mislukt/.test(tekst) && /Download de widget eerst als bestand/.test(tekst), tekst);
    await vraag.getByRole('button', { name: 'Blijven' }).click().catch(() => {});
    await page.evaluate(() => { Storage.prototype.setItem = window.__echteSetItem; });
    await enterOp(page, 'Opnieuw proberen');
    await sleep(400);
    check('B9: de opslag werkt weer: "Opnieuw proberen" bewaart en zet de focus op het titelveld',
      (await titelIn(page, 'w_b9blok')) === 'Toets geblokkeerd extra' && (await opTitel(page)), JSON.stringify(await focusOp(page)));
    check('geen paginafout (geblokkeerde opslag)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
// ════════════════════════════════════════════════════════════════════════════
// EINDE P3
// ════════════════════════════════════════════════════════════════════════════

await browser.close();
console.log(failures ? `\n${failures} controle(s) gefaald` : '\nALLE EDITOR-IMPORT-CHECKS GESLAAGD');
process.exit(failures ? 1 : 0);
