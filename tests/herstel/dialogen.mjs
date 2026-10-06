// Bevestigingsvensters: schermlezers horen bij het openen ook de vraag zelf
// (aria-describedby), niet alleen de titel (debugronde okt. 2026, B9).
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/dialogen.mjs
import { chromium } from 'playwright-core';
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173';
let fails = 0;
const check = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '/#/widgets', { waitUntil: 'networkidle' });
// Verwijderen via het menu van de eerste widget.
await page.getByRole('button', { name: /Meer acties|Acties/ }).first().click();
await page.getByRole('menuitem', { name: 'Verwijderen' }).click();
const dlg = page.getByRole('dialog', { name: 'Widget verwijderen?' });
await dlg.waitFor({ timeout: 5000 });
const uitleg = await dlg.evaluate((d) => document.getElementById(d.getAttribute('aria-describedby') || '')?.textContent || '');
check('verwijdervenster: aria-describedby wijst naar de vraag', /worden definitief verwijderd/.test(uitleg));
await page.keyboard.press('Escape');
// Een groot venster met een formulier krijgt geen beschrijving (anders leest de schermlezer alles voor).
await page.goto(BASE + '/#/klassen', { waitUntil: 'networkidle' });
const nieuw = page.getByRole('button', { name: /Nieuwe klas/ }).first();
await nieuw.waitFor({ timeout: 8000 });
await nieuw.click();
const form = page.getByRole('dialog', { name: 'Nieuwe klas' });
await form.waitFor({ timeout: 5000 });
check('formuliervenster: geen aria-describedby', (await form.getAttribute('aria-describedby')) === null);
await page.keyboard.press('Escape');
check('geen paginafouten', errors.length === 0);
await browser.close();
console.log(fails ? `${fails} CHECKS MISLUKT` : 'ALLE DIALOOGCHECKS GESLAAGD');
process.exit(fails ? 1 : 0);
