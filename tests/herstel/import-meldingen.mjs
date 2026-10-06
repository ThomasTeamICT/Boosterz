// Rooktest herstelpakket P4 (debugronde oktober 2026): eerlijke meldingen en
// geen halve toestand bij het importeren van een cursus of tekstbestand.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/import-meldingen.mjs
//
//  B2  Een cursusbestand dat alleen een widget vervangt, zegt dat ("bleef
//      gelijk; 1 widget … vervangen"), niet "niets veranderd".
//  B3  Een cursusimport die niet past (volle opslag): de widget uit die poging
//      is weer weg; "als kopie" nog eens proberen maakt geen tweede kopie;
//      na opruimen lukt het met precies één kopie.
//  B7  Een tekstbestand in UTF-8 met één verdwaalde ANSI-byte blijft leesbaar
//      (geen "Ã©"), met een eigen waarschuwing; ANSI en UTF-16 zonder BOM
//      lezen nog altijd goed.
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

function quiz({ id, title, updatedAt }) {
  return {
    id, type: 'quiz', title, folderId: null, code: id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, 'X'),
    createdAt: 1, updatedAt, settings: SETTINGS,
    config: { questions: [{ id: 'q1', type: 'tf', prompt: 'Water kookt bij 100 °C.', points: 1, answer: true }] },
  };
}

function cursus({ id, title, updatedAt, tekst = 'Uren werk.', widgetId }) {
  return {
    id, title, author: '', coverEmoji: '💧', code: 'CEIGEN', createdAt: 1, updatedAt,
    settings: { accentColor: '#0891b2', requireName: false, showProgressToStudent: true },
    chapters: [{ id: 'ch1', title: 'Verdamping', sections: [{ id: 's1', title: 'Wat is verdamping?', optional: false, blocks: [
      { id: 'b1', type: 'text', markdown: tekst },
      { id: 'b2', type: 'widget', widgetId },
    ] }] }],
  };
}

const bestandVan = (course, widgets) => Buffer.from(JSON.stringify({ app: 'boosterz', kind: 'cursus', v: 1, course, widgets, pdfs: [] }));

/** UTF-16 zonder BOM. */
function utf16(s, le) {
  return Buffer.from([...s].flatMap((c) => {
    const u = c.charCodeAt(0);
    return le ? [u & 0xff, u >> 8] : [u >> 8, u & 0xff];
  }));
}

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

async function freshContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  return ctx;
}

async function openPage(ctx, label) {
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message.slice(0, 200)}`));
  page.on('dialog', async (d) => { dialogs.push({ type: d.type(), message: d.message().slice(0, 120) }); await d.dismiss(); });
  return { page, errors, dialogs };
}

const opslag = (page) => page.evaluate(() => ({
  widgets: JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]'),
  courses: JSON.parse(localStorage.getItem('wf.courses.v1') || '[]'),
}));

async function zet(page, { widgets, courses }) {
  await page.evaluate(({ widgets, courses }) => {
    localStorage.setItem('wf.widgets.v1', JSON.stringify(widgets));
    localStorage.setItem('wf.courses.v1', JSON.stringify(courses));
    localStorage.removeItem('wf.gedeeld.v1'); // geen register: dit is eigen werk
  }, { widgets, courses });
}

/** Vult localStorage tot ze vol is en maakt daarna (ongeveer) `vrij` tekens vrij. De vulling heeft geen "wf."-sleutel. */
async function vulOpslag(page, vrij = 0) {
  return page.evaluate((vrij) => {
    const keys = [];
    let i = 0;
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

const bronKaart = (page) => page.locator('.card').filter({ has: page.getByLabel('Titel van deze bron') });
const kaartTekst = async (page) => (await bronKaart(page).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
const vraag = (page) => page.getByRole('dialog', { name: 'Er staat al een versie op dit toestel' });

async function naarImporteren(page) {
  await page.goto(BASE + '#/importeren');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await sleep(400);
}

async function kies(page, knop) {
  await page.getByRole('button', { name: /Nu importeren/ }).click({ timeout: 4000 });
  await vraag(page).waitFor({ timeout: 4000 });
  await vraag(page).getByRole('button', { name: knop }).click({ timeout: 4000 });
  await sleep(800);
}

// ── B2: alleen een widget vervangen ─────────────────────────────────────────

console.log('B2. Cursusbestand dat alleen een widget vervangt');
{
  const ctx = await freshContext();
  const { page, errors } = await openPage(ctx, 'B2');
  await naarImporteren(page);
  const nu = Date.now();
  await zet(page, {
    widgets: [quiz({ id: 'w_quiz', title: 'MIJN AANGEPASTE QUIZ', updatedAt: nu - 1000 })],
    courses: [cursus({ id: 'c_b2', title: 'De waterkringloop', updatedAt: nu - 60_000, widgetId: 'w_quiz' })],
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json',
    buffer: bestandVan(
      cursus({ id: 'c_b2', title: 'De waterkringloop', updatedAt: nu - 3_600_000, widgetId: 'w_quiz' }),
      [quiz({ id: 'w_quiz', title: 'BESTAND QUIZ', updatedAt: nu - 3_600_000 })]
    ),
  });
  await sleep(500);
  await page.getByRole('button', { name: /Nu importeren/ }).click({ timeout: 4000 });
  await vraag(page).waitFor({ timeout: 4000 });
  const lijst = await vraag(page).innerText();
  check('de vraag noemt alleen de widget (de cursus zelf is gelijk)', /Widget/.test(lijst) && !/Cursus\s*“/.test(lijst), lijst.slice(0, 200));
  await vraag(page).getByRole('button', { name: 'Vervangen door de versie uit het bestand' }).click();
  await sleep(800);
  const tekst = await kaartTekst(page);
  const s = await opslag(page);
  check('de widget is vervangen', s.widgets.find((w) => w.id === 'w_quiz')?.title === 'BESTAND QUIZ');
  check('de cursus is onaangeroerd', s.courses.length === 1 && s.courses[0].updatedAt === nu - 60_000, JSON.stringify(s.courses.map((c) => c.updatedAt)));
  check('de kaart zegt dat de cursus gelijk bleef en welke widget vervangen is',
    /De cursus “De waterkringloop” bleef gelijk; 1 widget \(“BESTAND QUIZ”\) is vervangen door de versie uit het bestand/.test(tekst), tekst.slice(0, 300));
  check('de kaart zegt niet "niets veranderd"', !/niets veranderd|stond al zo/.test(tekst));
  check('het label zegt "bijgewerkt"', /bijgewerkt/.test(tekst), tekst.slice(0, 200));
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── B3: een mislukte cursusimport laat geen halve toestand achter ───────────

console.log('B3. Cursusimport die niet past (volle opslag), "als kopie"');
{
  const ctx = await freshContext();
  const { page, errors } = await openPage(ctx, 'B3');
  await naarImporteren(page);
  const nu = Date.now();
  await zet(page, {
    widgets: [quiz({ id: 'w_b3', title: 'MIJN QUIZ', updatedAt: nu - 1000 })],
    courses: [cursus({ id: 'c_b3', title: 'LOKAAL', updatedAt: nu - 1000, widgetId: 'w_b3' })],
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'groot.json', mimeType: 'application/json',
    buffer: bestandVan(
      cursus({ id: 'c_b3', title: 'BESTAND', updatedAt: nu - 3_600_000, tekst: 'y'.repeat(30_000), widgetId: 'w_b3' }),
      [quiz({ id: 'w_b3', title: 'BESTAND QUIZ', updatedAt: nu - 3_600_000 })]
    ),
  });
  await sleep(500);
  const vol = await vulOpslag(page, 5000); // ruimte voor een widget, niet voor de cursus van 30.000 tekens
  console.log(`  (opslag gevuld: ${vol.stukken} stukken, ${vol.vrijgemaakt} tekens vrijgemaakt)`);

  for (const poging of [1, 2]) {
    await kies(page, 'Als kopie bewaren');
    const s = await opslag(page);
    const titels = s.widgets.map((w) => w.title);
    check(`poging ${poging}: geen widget-kopie achtergelaten`, JSON.stringify(titels) === '["MIJN QUIZ"]', JSON.stringify(titels));
    check(`poging ${poging}: geen cursuskopie`, JSON.stringify(s.courses.map((c) => c.title)) === '["LOKAAL"]', JSON.stringify(s.courses.map((c) => c.title)));
    const status = await page.locator('p[role=status]').first().innerText().catch(() => '');
    check(`poging ${poging}: de melding zegt eerlijk dat de cursus niet bewaard is en wat weggehaald werd`,
      /is niet bewaard: de opslag van dit toestel is vol/.test(status) && /weer weggehaald/.test(status), status.slice(0, 260));
    check(`poging ${poging}: "Nu importeren" blijft staan om opnieuw te proberen`, await page.getByRole('button', { name: /Nu importeren/ }).isVisible());
  }

  await leegOpslag(page);
  await kies(page, 'Als kopie bewaren');
  const s = await opslag(page);
  const widgetTitels = s.widgets.map((w) => w.title).sort();
  check('na opruimen: precies één widget-kopie', JSON.stringify(widgetTitels) === JSON.stringify(['BESTAND QUIZ (kopie)', 'MIJN QUIZ']), JSON.stringify(widgetTitels));
  check('na opruimen: de cursuskopie staat erbij', s.courses.some((c) => c.title === 'BESTAND (kopie)'), JSON.stringify(s.courses.map((c) => c.title)));
  const tekst = await kaartTekst(page);
  check('de kaart zegt dat het ernaast als kopie staat', /ernaast als kopie/.test(tekst) && !/niet bewaard/.test(tekst), tekst.slice(0, 300));
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── B7: tekstcodering ───────────────────────────────────────────────────────

console.log('B7. Tekstbestanden: UTF-8 met een verdwaalde byte, ANSI en UTF-16');
{
  const ctx = await freshContext();
  const { page, errors } = await openPage(ctx, 'B7');
  await naarImporteren(page);

  // UTF-8 met één ANSI-é op het einde van een regel.
  const goed = Buffer.from('Eén café, één crème brûlée; vraag;antwoord\n', 'utf8');
  await page.locator('input[type=file]').setInputFiles({
    name: 'verdwaald.txt', mimeType: 'text/plain', buffer: Buffer.concat([goed, Buffer.from([0xe9, 0x0a])]),
  });
  await page.getByLabel(/Geëxtraheerde tekst/).first().waitFor({ timeout: 6000 });
  let tekst = await page.getByLabel(/Geëxtraheerde tekst/).first().inputValue();
  let kaart = await kaartTekst(page);
  check('UTF-8 met één verdwaalde byte: accenten blijven goed', tekst.includes('Eén café, één crème brûlée'), JSON.stringify(tekst));
  check('geen "Ã©" (het hele bestand is niet als ANSI gelezen)', !tekst.includes('Ã'));
  check('hoogstens één vervangteken', tekst.split('�').length - 1 === 1, String(tekst.split('�').length - 1));
  check('eigen waarschuwing: enkele tekens konden niet gelezen worden', /Enkele tekens .* konden niet gelezen worden/.test(kaart), kaart.slice(0, 300));
  check('en geen ANSI-waarschuwing', !/ANSI/.test(kaart));
  await bronKaart(page).first().getByRole('button', { name: /verwijderen uit deze lijst/ }).click();

  // Echte ANSI blijft ANSI.
  await page.locator('input[type=file]').setInputFiles({
    name: 'ansi.csv', mimeType: 'text/csv',
    buffer: Buffer.from([...'naam;woord\nEmma;café\nNoah;één crème'].map((c) => c.charCodeAt(0))),
  });
  await page.getByLabel(/Geëxtraheerde tekst/).first().waitFor({ timeout: 6000 });
  tekst = await page.getByLabel(/Geëxtraheerde tekst/).first().inputValue();
  kaart = await kaartTekst(page);
  check('echte ANSI-csv: nog altijd leesbaar', tekst.includes('Emma;café') && tekst.includes('Noah;één crème') && !tekst.includes('�'), JSON.stringify(tekst));
  check('echte ANSI-csv: met de ANSI-waarschuwing', /ANSI/.test(kaart));
  await bronKaart(page).first().getByRole('button', { name: /verwijderen uit deze lijst/ }).click();

  // UTF-16 zonder BOM (zoals sommige exports).
  await page.locator('input[type=file]').setInputFiles({
    name: 'utf16.txt', mimeType: 'text/plain', buffer: utf16('naam;woord\nEmma;café\nNoah;één\n', true),
  });
  await page.getByLabel(/Geëxtraheerde tekst/).first().waitFor({ timeout: 6000 });
  tekst = await page.getByLabel(/Geëxtraheerde tekst/).first().inputValue();
  check('UTF-16 zonder BOM: leesbaar, zonder NUL-tekens', tekst.includes('Emma;café') && tekst.includes('Noah;één') && !tekst.includes('\u0000'), JSON.stringify(tekst));
  check('geen paginafout', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} controle(s) gefaald` : '\nALLE IMPORT-MELDINGEN-CHECKS GESLAAGD');
process.exit(failures ? 1 : 0);
