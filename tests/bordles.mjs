// Rooktest voor de bordles (docs/UITLEGVORMEN.md, BL-9): draait tegen een preview-build.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/bordles.mjs
//
// Maakt een nieuwe bordles (start van de voorbeeldles Pythagoras) en doorloopt ze als leerling:
// de instapvraag, Kijk mee met de hand die tekent, de waaromvraag, Doe mee met gekende fouten en
// hints, Zoek de fout, Alleen met de zekerheidsvraag, en het indienen. Daarna de bordstand en
// een smal scherm. Faalt hard bij een mislukte check of bij console- of paginafouten.

import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
let page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
  errors.push(`console: ${m.text()}`);
});

console.log('Bordles: nieuwe oefening');
await page.goto(`${BASE}/#/nieuw`, { waitUntil: 'networkidle' });
await sleep(400);
const tegel = page.getByRole('button', { name: /Bordles/ }).or(page.getByRole('link', { name: /Bordles/ })).first();
check('de soort "Bordles" staat bij de nieuwe oefeningen', (await tegel.count()) === 1);
await tegel.click();
await page.waitForURL(/#\/bewerk\//, { timeout: 10000 });
await page.waitForSelector('.bl-editor', { timeout: 10000 });
await sleep(800);
check('de editor start van de voorbeeldles (4 fases)', /4 fases/.test(await page.locator('.bl-editor .hint').first().innerText()));
check('de editor meldt geen fouten in de voorbeeldles', (await page.locator('.bl-editor .callout').count()) === 0);

// bewaren gebeurt automatisch; zoek de code van de nieuwe oefening
await sleep(1500);
const code = await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
  const w = ws.filter((x) => x.type === 'bordles').sort((a, b) => b.createdAt - a.createdAt)[0];
  return w && w.config && w.config.fases && w.config.fases.length ? w.code : null;
});
check('de bordles is bewaard met de voorbeeldles', !!code);

console.log('Bordles: als leerling');
await page.goto(`${BASE}/#/speel/${code}`, { waitUntil: 'networkidle' });
await sleep(500);
const naam = page.getByLabel(/naam/i).first();
if (await naam.count()) { await naam.fill('Testleerling'); await page.keyboard.press('Enter'); }
const start = page.getByRole('button', { name: /^(Start|Begin|Starten)/ }).first();
if (await start.count()) await start.click();
await page.waitForSelector('.bl-les', { timeout: 10000 });
check('het leerdoel staat bovenaan', /stelling van Pythagoras/.test(await page.locator('.bl-leerdoel').innerText()));

// Instap: fout antwoord → samen bekijken
await page.fill('.bl-input', '17');
await page.getByRole('button', { name: 'Controleer' }).click();
check('instap fout: eerlijk juist antwoord en "we bekijken het samen"', /13.*samen/.test(await page.locator('.bl-feedback').innerText()));
await page.getByRole('button', { name: 'Verder' }).click();
await sleep(300);

// Kijk mee: de hand tekent (normaal tempo)
await page.evaluate(() => localStorage.removeItem('boosterz-bordles-snelheid'));
await sleep(600);
check('de hand staat op het bord tijdens het tekenen', (await page.locator('.bl-hand').getAttribute('opacity')) === '1');
check('het deeldoel van de eerste stap staat er', (await page.locator('.bl-deeldoel').innerText()) === 'Herken de driehoek');
await page.locator('.bl-bord').click(); // afmaken
check('tik op het bord: de hand verdwijnt meteen', (await page.locator('.bl-hand').getAttribute('opacity')) === '0');

// snelheid 'meteen' voor de rest van de test
await page.getByRole('button', { name: 'Meteen' }).click();
let volgende = page.getByRole('button', { name: /^(Volgende|Afronden)$/ });
for (let i = 0; i < 5; i++) await volgende.click();
check('stap 6: een waaromvraag blokkeert Volgende', await volgende.isDisabled());
await page.getByRole('button', { name: /allebei werkt/ }).click();
check('foute keuze: uitleg en kies opnieuw', /Kies opnieuw/.test(await page.locator('.bl-feedback').innerText()));
await page.getByRole('button', { name: /vierkanten op de zijden/ }).click();
check('juiste keuze: Volgende kan weer', !(await volgende.isDisabled()));
await volgende.click(); await volgende.click();
check('vervangen: het "?" bij c is een 5 geworden', await page.locator('.bl-bord text', { hasText: /^5$/ }).count() >= 1);
await volgende.click();

// Doe mee
check('Doe mee is de huidige fase', (await page.locator('.bl-fases [aria-current="step"]').innerText()) === 'Doe mee');
for (let i = 0; i < 3; i++) await volgende.click();
check('invulstap: Volgende geblokkeerd', await volgende.isDisabled());
await page.fill('.bl-input', '14');
await page.getByRole('button', { name: 'Controleer' }).click();
check('gekende fout 14: gerichte uitleg', /6 \+ 8/.test(await page.locator('.bl-feedback').innerText()));
check('na de eerste fout verschijnt hint 1', (await page.locator('.bl-hints li').count()) === 1);
await page.fill('.bl-input', '100');
await page.getByRole('button', { name: 'Controleer' }).click();
check('juist: c² = 100 staat op het bord', await page.locator('.bl-bord text', { hasText: '36 + 64 = 100' }).count() === 1);
await volgende.click();
for (const a of ['1', '2', '3']) { await page.fill('.bl-input', a); await page.getByRole('button', { name: 'Controleer' }).click(); }
check('na drie fouten: de oplossing wordt getoond', /oplossing is 10/.test(await page.locator('.bl-feedback').innerText()));
await volgende.click();

// Zoek de fout
check('Zoek de fout is de huidige fase', (await page.locator('.bl-fases [aria-current="step"]').innerText()) === 'Zoek de fout');
await volgende.click();
await page.getByRole('button', { name: /vierkantswortel te nemen/ }).click();
await volgende.click();
check('de verbetering staat op het bord', await page.locator('.bl-bord text', { hasText: '√289 = 17' }).count() === 1);
await volgende.click();

// Alleen, met zekerheid
await volgende.click();
await page.fill('.bl-input', '15');
await page.getByRole('button', { name: 'Controleer' }).click();
check('zonder zekerheid: eerst kiezen', /hoe zeker/.test(await page.locator('.bl-feedback').innerText()));
await page.getByRole('button', { name: 'Twijfel' }).click();
await page.getByRole('button', { name: 'Controleer' }).click();
check('juist met twijfel: eerlijke feedback', /twijfelde/.test(await page.locator('.bl-feedback').innerText()));
await volgende.click();
await page.keyboard.press('ArrowRight');
await sleep(300);
check('pijltoets op de laatste stap dient niet in', !(await page.locator('.result-hero').isVisible()));
await page.getByRole('button', { name: 'Afronden' }).click();
await sleep(500);
check('het resultaatscherm verschijnt', await page.locator('.result-hero').isVisible());
const samenvatting = await page.locator('.bl-samenvatting').innerText();
check('samenvatting: met hulp, oplossing getoond, zonder hulp', /met hulp/.test(samenvatting) && /oplossing getoond/.test(samenvatting) && /zonder hulp/.test(samenvatting));
const inzending = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]');
  return s[s.length - 1] || null;
});
check('een inzending is bewaard met 4 telende stappen', !!inzending && inzending.totalMax === 4);
check('de inzending telt 3 van 4 (oplossing getoond telt niet)', !!inzending && inzending.totalEarned === 3);

console.log('Bordles: bordstand en klein scherm');
await page.getByRole('button', { name: 'De les nog eens bekijken' }).click();
await page.waitForSelector('.bl-les');
check('nog eens bekijken: de melding dat de les al ingediend is', await page.locator('.bl-al-ingediend').isVisible());
await page.getByRole('button', { name: 'Normaal' }).click();
await sleep(500);
check('nog eens bekijken: de hand tekent opnieuw', (await page.locator('.bl-hand').getAttribute('opacity')) === '1');
// vers opnieuw openen (zelfde toestel, nieuw tabblad zonder ingediende poging): het klasmoment
// staat bij een stap die nog niet opgelost is
const widgets = await page.evaluate(() => localStorage.getItem('wf.widgets.v1'));
const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page2.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page2.evaluate((w) => localStorage.setItem('wf.widgets.v1', w), widgets);
await page2.goto(`${BASE}/#/speel/${code}`, { waitUntil: 'networkidle' });
await page2.getByLabel('Jouw naam').fill('Bord');
await page2.getByRole('button', { name: 'Starten' }).click();
await page2.waitForSelector('.bl-les', { timeout: 10000 });
page = page2;
volgende = page.getByRole('button', { name: /^(Volgende|Afronden)$/ });
await page.getByRole('button', { name: 'Meteen' }).click();
await page.getByRole('button', { name: 'Doe mee' }).click();
await page.getByLabel('Bordstand').check();
for (let i = 0; i < 3; i++) await volgende.click();
check('bordstand: klasmoment met "Toon de oplossing"', await page.locator('.bl-klasmoment').isVisible());
await page.setViewportSize({ width: 390, height: 844 });
await sleep(300);
const breed = await page.evaluate(() => document.documentElement.scrollWidth);
check('390 pixels breed: geen horizontaal scrollen', breed <= 392);

check('geen console- of paginafouten', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
console.log(failures ? `\n${failures} check(s) mislukt` : '\nAlle checks geslaagd');
process.exit(failures ? 1 : 0);
