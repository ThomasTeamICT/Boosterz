// Volledige set schermafbeeldingen van Boosterz, voor UX-reviews en voor/na-vergelijkingen.
//
//   node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tools/ux/screenshots.mjs <uitmap> [sets]
//
// sets: desktop-licht, mobiel-licht, desktop-donker (standaard alle drie).
// Elke set start op een vers toestel met realistische data: de seed, de
// voorbeeldcursus, een inzending en de voorbeeldklas. De AI wordt nooit
// aangeroepen: voor het AI-scherm "met sleutel" staat er een nepsleutel.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const OUT = process.argv[2];
if (!OUT) { console.error('gebruik: node tools/ux/screenshots.mjs <uitmap> [sets…]'); process.exit(1); }
const SETS = {
  'desktop-licht': { viewport: { width: 1360, height: 900 }, colorScheme: 'light' },
  'mobiel-licht': { viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  'desktop-donker': { viewport: { width: 1360, height: 900 }, colorScheme: 'dark' },
};
const wanted = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(SETS);
const MAX_H = 3600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const index = [];

for (const setName of wanted) {
  const opts = SETS[setName];
  if (!opts) { console.error(`onbekende set: ${setName}`); continue; }
  const dir = path.join(OUT, setName);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  const go = async (hash) => { await page.goto(BASE + '/' + hash, { waitUntil: 'networkidle' }); await sleep(700); };
  let n = 0;
  const shot = async (name, note = '') => {
    n++;
    const file = `${String(n).padStart(2, '0')}-${name}.png`;
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const vw = opts.viewport.width;
    await page.screenshot({ path: path.join(dir, file), fullPage: true, clip: { x: 0, y: 0, width: vw, height: Math.min(h, MAX_H) } });
    index.push({ set: setName, file: path.join(setName, file), name, url: page.url().replace(BASE, ''), hoogte: h, afgeknipt: h > MAX_H, note });
    console.log(`  ${setName} ${file}${h > MAX_H ? ` (afgeknipt op ${MAX_H} van ${h}px)` : ''}`);
  };

  // ── Data klaarzetten ──────────────────────────────────────────────────────
  await go('#/');
  await go('#/cursussen');
  await page.getByRole('button', { name: /Voorbeeldcursus laden/ }).first().click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('wf.courses.v1') || '[]')).some((c) => c.id === 'nw-voorbeeld-1e-graad'), null, { timeout: 30000 });
  const data = await page.evaluate(() => {
    const widgets = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
    const quiz = widgets.find((w) => w.type === 'quiz' && /België/.test(w.title)) || widgets.find((w) => w.type === 'quiz');
    const byType = (t) => widgets.find((w) => w.type === t && !/^nw-vb-/.test(w.id)) || widgets.find((w) => w.type === t);
    const q = quiz.config.questions;
    const sub = (id, naam, goed) => ({
      id, widgetId: quiz.id, widgetCode: quiz.code, studentName: naam, startedAt: Date.now() - 600000, submittedAt: Date.now() - 300000, durationSec: 240,
      answers: Object.fromEntries(q.filter((x) => x.type === 'mc').map((x) => [x.id, goed ? x.correctIndex : (x.correctIndex + 1) % x.options.length])),
      itemScores: Object.fromEntries(q.filter((x) => x.type === 'mc').map((x) => [x.id, { earned: goed ? 1 : 0, max: 1, mode: 'auto' }])),
      totalEarned: goed ? q.filter((x) => x.type === 'mc').length : 0, totalMax: q.filter((x) => x.type === 'mc').length, status: 'graded',
    });
    const subs = JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]');
    subs.push(sub('ux1', 'Lotte', true), sub('ux2', 'Yassin', false));
    localStorage.setItem('wf.submissions.v1', JSON.stringify(subs));
    const courses = JSON.parse(localStorage.getItem('wf.courses.v1') || '[]');
    const demo = courses.find((c) => /waterkringloop/i.test(c.title));
    return {
      quiz: { id: quiz.id, code: quiz.code },
      flash: byType('flashcards'), split: byType('splitworksheet'), mindmap: byType('mindmap'), memory: byType('memory'), worksheet: byType('worksheet'),
      demoId: demo?.id, klasId: JSON.parse(localStorage.getItem('wf.classes.v1') || '[]')[0]?.id,
    };
  });

  // ── Leerkracht ────────────────────────────────────────────────────────────
  await go('#/'); await shot('start');
  await go('#/widgets'); await shot('widgets');
  await go('#/nieuw'); await shot('nieuwe-widget');
  await go(`#/bewerk/${data.quiz.id}`); await shot('widget-editor-quiz');
  await go(`#/print/${data.quiz.id}`); await shot('widget-afdrukken');
  await go('#/resultaten'); await shot('resultaten-overzicht');
  await go(`#/resultaten/${data.quiz.id}`); await shot('resultaten-quiz');
  await go('#/cursussen'); await shot('cursussen');
  await go('#/cursus/bewerk/nw-voorbeeld-1e-graad'); await shot('cursus-editor');
  await go('#/cursus/volg/nw-voorbeeld-1e-graad'); await shot('cursus-opvolgen');
  if (data.demoId) { await go(`#/cursus/print/${data.demoId}`); await shot('cursus-afdrukken'); }
  await go('#/leerplannen'); await shot('leerplannen');
  await go('#/klassen'); await shot('klassen');
  if (data.klasId) { await go(`#/klas/${data.klasId}`); await shot('klas-overzicht'); }
  await go('#/inleverpunt'); await shot('inleverpunt');
  await go('#/importeren'); await shot('importeren');
  await go('#/ai-studio'); await shot('ai-studio-zonder-sleutel');
  await go('#/ai-instellingen'); await shot('ai-instellingen');
  await go('#/hulp'); await shot('hulp');
  await go('#/privacy'); await shot('privacy');
  await go('#/bestaat-niet'); await shot('niet-gevonden');

  // ── Leerling ──────────────────────────────────────────────────────────────
  await go(`#/speel/${data.quiz.code}`); await shot('speler-quiz');
  for (const k of ['flash', 'split', 'mindmap', 'memory', 'worksheet']) {
    if (data[k]) { await go(`#/speel/${data[k].code}`); await shot(`speler-${data[k].type}`); }
  }
  await go('#/meedoen'); await shot('meedoen-code');
  await go('#/voortgang'); await shot('voortgang');
  await go('#/cursus/lees/NWVBAA'); await shot('cursus-lezer-naam');
  await page.getByLabel(/Jouw naam/).fill('Lotte');
  await page.getByRole('button', { name: /Start met lezen/ }).click();
  await sleep(900); await shot('cursus-lezer-start');
  await page.locator('a:has-text("3.1 Welke weg"), button:has-text("3.1 Welke weg")').first().click().catch(() => {});
  await sleep(1200); await shot('cursus-lezer-sectie');
  if (data.klasId) {
    await go(`#/klas/${data.klasId}`);
    await page.getByRole('button', { name: /Link voor je leerlingen/ }).first().click().catch(() => {});
    await page.waitForFunction(() => { const el = document.querySelector('input[aria-label="Link voor je leerlingen"]'); return el && /#\/klas\/open\?d=/.test(el.value || el.textContent || ''); }, null, { timeout: 15000 }).catch(() => {});
    await shot('klaslink-delen');
    const link = await page.evaluate(() => { const el = document.querySelector('input[aria-label="Link voor je leerlingen"]'); return el ? (el.value || el.textContent || '') : ''; });
    if (link) {
      await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await sleep(1200);
      await shot('leerling-kies-naam');
      await page.locator('button.btn-ghost').first().click().catch(() => {});
      await sleep(700); await shot('leerling-hub');
    }
  }

  // ── AI-scherm met (nep)sleutel: alleen het formulier, geen aanroep ────────
  await page.evaluate(() => localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: 'demo-sleutel-voor-schermafbeelding', model: 'gemini-3.7-flash' })));
  await go('#/ai-studio'); await shot('ai-studio-met-sleutel');

  if (errors.length) console.log(`  ${setName}: ${errors.length} fout(en)\n   ` + errors.slice(0, 5).join('\n   '));
  index.push({ set: setName, fouten: errors });
  await context.close();
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
await browser.close();
console.log(`Klaar: ${index.filter((x) => x.file).length} schermafbeeldingen in ${OUT}`);
