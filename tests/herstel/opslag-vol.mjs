// Volle opslag: de app zegt eerlijk dat iets niet bewaard is, in plaats van
// naar een scherm te sturen dat "niet gevonden" toont (debugronde okt. 2026, G8).
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/opslag-vol.mjs
import { chromium } from 'playwright-core';
import LZString from 'lz-string';
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173';
let fails = 0; const check = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) fails++; };
const lz = (o) => LZString.compressToEncodedURIComponent(JSON.stringify(o));
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const vul = (page) => page.evaluate(() => {
  let lo = 0, hi = 6_000_000;
  while (hi - lo > 50) { const mid = (lo + hi) >> 1; try { localStorage.setItem('wf.vulling', 'x'.repeat(mid)); lo = mid; } catch { hi = mid; } }
  localStorage.setItem('wf.vulling', 'x'.repeat(lo));
});
// 1. Cursuslink bij volle opslag
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/#/meedoen', { waitUntil: 'networkidle' });
  await vul(page);
  const c = { id: 'c_vol', title: 'Volle cursus', author: '', coverEmoji: '💧', code: 'CVOL01', createdAt: 1, updatedAt: 2,
    chapters: [{ id: 'h1', title: 'H1', emoji: '', sections: [{ id: 's1', title: 'S1', goals: [], blocks: [{ id: 'b1', type: 'text', markdown: 'x'.repeat(2000) }] }] }] };
  await page.goto(`${BASE}/#/cursus/open?d=${lz({ v: 1, kind: 'cursus', c, w: [] })}`);
  await page.waitForTimeout(1500);
  const h1 = await page.locator('h1').allInnerTexts();
  console.log('h1:', JSON.stringify(h1), 'url', page.url().slice(-40));
  check('cursuslink bij volle opslag: eerlijke melding', h1.some((t) => /kon niet bewaard worden/.test(t)));
  check('één h1', h1.length === 1);
  check('geen paginafouten', errors.length === 0);
  await ctx.close();
}
// 2. Nieuwe widget bij volle opslag
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/#/nieuw', { waitUntil: 'networkidle' });
  await vul(page);
  await page.getByRole('button', { name: /Quiz/ }).first().click();
  await page.waitForTimeout(800);
  const meldingen = await page.locator('.toast, [role=status]').allInnerTexts();
  console.log('url', page.url().slice(-30), 'meldingen', JSON.stringify(meldingen).slice(0, 200));
  check('nieuwe widget bij volle opslag: blijft op /nieuw', /#\/nieuw/.test(page.url()));
  check('nieuwe widget bij volle opslag: melding', meldingen.some((t) => /Niet aangemaakt/.test(t)));
  check('geen paginafouten', errors.length === 0);
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} CHECKS MISLUKT` : 'ALLE OPSLAG-VOL-CHECKS GESLAAGD'); process.exit(fails ? 1 : 0);
