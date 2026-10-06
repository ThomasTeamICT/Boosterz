// Importeren vanaf de widgetpagina (map-pakket en losse widget): eerlijk
// tellen wat bewaard is, ook bij een volle opslag (debugronde okt. 2026, OP2).
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/widgets-importeren.mjs
import { chromium } from 'playwright-core';
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173';
let fails = 0;
const check = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const quiz = (i) => ({ id: 'q' + i, type: 'quiz', title: 'Pakketquiz ' + i, folderId: null, code: 'PKQ00' + i,
  config: { questions: [{ id: 'v1', type: 'tf', prompt: 'Klopt dit?', answer: true, points: 1 }], layout: 'single' },
  settings: { accentColor: '#4f46e5' }, createdAt: 1, updatedAt: 1 });
const pack = JSON.stringify({ app: 'boosterz', kind: 'pakket', v: 1, meta: { naam: 'Vakgroep test', auteur: 'x', datum: '2026-10-06', aantal: 3 }, widgets: [quiz(1), quiz(2), quiz(3)] });
const enkel = JSON.stringify({ ...quiz(9), title: 'Losse quiz' });
async function run(vol) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' });
  const voor = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').length);
  if (vol) {
    await page.evaluate(() => {
      let lo = 0, hi = 6_000_000;
      while (hi - lo > 200) { const mid = (lo + hi) >> 1; try { localStorage.setItem('wf.vulling', 'x'.repeat(mid)); lo = mid; } catch { hi = mid; } }
      localStorage.setItem('wf.vulling', 'x'.repeat(lo));
    });
  }
  const input = page.locator('input[type=file][accept="application/json,.json"]');
  await input.setInputFiles({ name: 'pakket.json', mimeType: 'application/json', buffer: Buffer.from(pack) });
  await page.getByRole('dialog', { name: /Vakgroeppakket importeren/ }).waitFor({ timeout: 5000 });
  await page.getByRole('dialog').getByRole('button', { name: /importeren/i }).last().click();
  await page.waitForTimeout(800);
  const toastTxt = await page.locator('.toast, [role=status]').allInnerTexts();
  const na = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').length);
  const mappen = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.folders.v1') || '[]').map((f) => f.name));
  console.log(vol ? '[vol]' : '[normaal]', 'widgets', voor, '->', na, 'mappen', JSON.stringify(mappen), 'meldingen', JSON.stringify(toastTxt));
  if (!vol) {
    check('pakket: 3 widgets bewaard', na - voor === 3);
    check('pakket: melding zegt 3 widgets geïmporteerd in de map', toastTxt.some((t) => /3 widgets geïmporteerd in de map “Vakgroep test”/.test(t)));
    await input.setInputFiles({ name: 'quiz.widget.json', mimeType: 'application/json', buffer: Buffer.from(enkel) });
    await page.waitForTimeout(800);
    const t2 = await page.locator('.toast, [role=status]').allInnerTexts();
    const na2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').length);
    check('losse widget bewaard', na2 - na === 1);
    check('losse widget: melding geïmporteerd', t2.some((t) => /“Losse quiz” geïmporteerd/.test(t)));
  } else {
    check('vol: niets bewaard', na === voor);
    check('vol: melding zegt eerlijk dat niets bewaard is', toastTxt.some((t) => /Geen enkele widget bewaard/.test(t)));
    check('vol: geen lege map achtergebleven', !mappen.includes('Vakgroep test'));
    await input.setInputFiles({ name: 'quiz.widget.json', mimeType: 'application/json', buffer: Buffer.from(enkel) });
    await page.waitForTimeout(800);
    const t2 = await page.locator('.toast, [role=status]').allInnerTexts();
    check('vol: losse widget meldt opslag vol, niet "geïmporteerd"', t2.some((t) => /opslag van dit toestel is vol/.test(t)) && !t2.some((t) => /“Losse quiz” geïmporteerd/.test(t)));
  }
  check('geen paginafouten', errors.length === 0);
  await ctx.close();
}
await run(false);
await run(true);
await browser.close();
console.log(fails ? `${fails} CHECKS MISLUKT` : 'ALLE IMPORTCHECKS GESLAAGD');
process.exit(fails ? 1 : 0);
