#!/usr/bin/env node
// Rooktest voor de toestelproef (Playwright, Chromium met een nagebootste camera).
//
//   node node_modules/vite/bin/vite.js preview --port 4183 --strictPort &
//   PROEF_BASE=http://localhost:4183 node tools/prototypes/toestelproef/rooktest.mjs
//
// Chromium: PW_CHROMIUM of /opt/pw-browsers/chromium. Er wordt niets geïnstalleerd.
// De nepcamera speelt een y4m-bestand af met de QR-code van versie 6 op 8 px,
// dat deze test zelf in de tijdelijke map maakt. Exit 0 bij succes; exit 1 met
// een lijst bij een fout.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VERSIES, PIXELS, MARGE, maakCodes } from './maak-proef.mjs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('playwright-core');
}
const { chromium } = playwright;

const BASE = (process.env.PROEF_BASE || 'http://localhost:4183').replace(/\/$/, '');
const PAGINA = `${BASE}/proef/toestelproef.html`;
const CHROMIUM = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const TEMP = '/tmp/claude-0/-home-user-Bookwidgetzzz/6982f99e-483d-5e21-8ce6-7865b4915a00/scratchpad/toestelproef';

const fouten = [];
function check(naam, voorwaarde, detail = '') {
  if (voorwaarde) {
    console.log(`  ok    ${naam}`);
  } else {
    console.log(`  FOUT  ${naam}${detail ? ` (${detail})` : ''}`);
    fouten.push(detail ? `${naam}: ${detail}` : naam);
  }
}

// ── De nepcamera: een y4m-bestand met de QR-code van versie 6 op 8 px ───────

function maakY4m(bestand) {
  const code = maakCodes().find((c) => c.versie === 6 && c.px === 8);
  const B = 640;
  const H = 480;
  const schaal = 8;
  const metMarge = code.modules + 2 * MARGE;
  const x0 = Math.floor((B - metMarge * schaal) / 2);
  const y0 = Math.floor((H - metMarge * schaal) / 2);
  const Y = Buffer.alloc(B * H, 255);
  for (let r = 0; r < code.modules; r += 1) {
    for (let k = 0; k < code.modules; k += 1) {
      if (code.rijen[r][k] !== '1') continue;
      for (let dy = 0; dy < schaal; dy += 1) {
        const rij = y0 + (r + MARGE) * schaal + dy;
        Y.fill(0, rij * B + x0 + (k + MARGE) * schaal, rij * B + x0 + (k + MARGE + 1) * schaal);
      }
    }
  }
  const U = Buffer.alloc((B / 2) * (H / 2), 128);
  const V = Buffer.alloc((B / 2) * (H / 2), 128);
  const kop = Buffer.from(`YUV4MPEG2 W${B} H${H} F30:1 Ip A1:1 C420jpeg\n`);
  const beeld = Buffer.concat([Buffer.from('FRAME\n'), Y, U, V]);
  const frames = Array.from({ length: 5 }, () => beeld);
  writeFileSync(bestand, Buffer.concat([kop, ...frames]));
}

mkdirSync(TEMP, { recursive: true });
const Y4M = path.join(TEMP, 'qr-versie6-8px.y4m');
maakY4m(Y4M);
const CODES = maakCodes();

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${Y4M}`,
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'nl-BE',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();

  const paginaFouten = [];
  const aanvragen = [];
  page.on('pageerror', (e) => paginaFouten.push(`paginafout: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // De browser vraagt zelf om een favicon; de pagina verwijst er niet naar.
    if (/favicon\.ico/.test(m.location().url || '')) return;
    paginaFouten.push(`console: ${m.text()}`);
  });
  page.on('request', (r) => aanvragen.push(r.url()));

  console.log(`Toestelproef openen: ${PAGINA}`);
  await page.goto(PAGINA, { waitUntil: 'load' });

  // ── Opbouw ───────────────────────────────────────────────────────────────
  console.log('Opbouw');
  check('precies één main', (await page.locator('main').count()) === 1);
  check('precies één h1 met de titel', (await page.locator('h1').count()) === 1 && (await page.locator('h1').innerText()) === 'Toestelproef Boosterz');
  check('lang="nl-BE"', (await page.locator('html').getAttribute('lang')) === 'nl-BE');
  check('elke sectie heeft een h2', (await page.locator('section').count()) === (await page.locator('section > h2').count()));
  const zonderNaam = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => {
      const label = el.labels && el.labels.length > 0;
      return !label && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby');
    }).map((el) => el.id || el.name || el.tagName));
  check('elk veld heeft een label', zonderNaam.length === 0, zonderNaam.join(', '));

  // ── (a) De 8 codes ───────────────────────────────────────────────────────
  console.log('Codes tonen');
  for (const versie of VERSIES) {
    for (const px of PIXELS) {
      const c = CODES.find((k) => k.versie === versie && k.px === px);
      await page.check(`input[name="versie"][value="${versie}"]`);
      await page.check(`input[name="px"][value="${px}"]`);
      const lengte = await page.locator('#code-lengte').innerText();
      const svg = page.locator('#codevak svg');
      const breedte = Number(await svg.getAttribute('width'));
      const doos = await svg.boundingBox();
      const verwacht = (c.modules + 2 * MARGE) * px;
      check(`versie ${versie} op ${px} px: ${c.lengte} tekens en ${verwacht} px breed`,
        lengte === `${c.lengte} tekens` && breedte === verwacht && Math.round(doos.width) === verwacht && Math.round(doos.height) === verwacht,
        `lengte ${lengte}, breedte ${breedte}, doos ${doos && Math.round(doos.width)}`);
    }
  }
  await page.check('input[name="versie"][value="10"]');
  await page.check('input[name="px"][value="8"]');
  check('versie 10 op 8 px is 488 px breed', Number(await page.locator('#codevak svg').getAttribute('width')) === 488);

  // ── Toestelkeuze, dan de scanner ─────────────────────────────────────────
  await page.selectOption('#toestel', { label: 'laptop van de leerkracht' });

  console.log('Scanner');
  check('de camera staat nog uit', (await page.locator('#video-vak').isHidden()));
  await page.click('#cam-start');
  try {
    await page.waitForFunction(() => /jsqr/.test(document.getElementById('decoder').textContent), null, { timeout: 15000 });
    check('de decoder is jsqr (geen BarcodeDetector in Chromium op Linux)', true);
  } catch {
    check('de decoder is jsqr', false, await page.locator('#decoder').innerText());
  }
  try {
    await page.waitForFunction(() => {
      const log = document.getElementById('log').textContent;
      return /versie 6/.test(log) && /8 px/.test(log);
    }, null, { timeout: 15000 });
    check('de log toont "versie 6" en "8 px" binnen 15 seconden', true);
  } catch {
    check('de log toont "versie 6" en "8 px" binnen 15 seconden', false, (await page.locator('#log').innerText()).slice(0, 300));
  }
  const logTekst = await page.locator('#log').innerText();
  check('de logregel noemt decoder, tijd, beeld en rekentijd', /decoder jsqr/.test(logTekst) && /\d,\d s na de start/.test(logTekst) && /beeld \d+×\d+/.test(logTekst) && /gemiddeld \d+,\d ms per beeld/.test(logTekst), logTekst.slice(0, 300));
  check('de logregel bevat de inhoud van de code niet', !/PROEF/.test(logTekst.replace(/Proefcode/g, '')) && !/WB1/.test(logTekst));
  check('de camera heeft een naam en een beeldgrootte', (await page.locator('#cam-naam').innerText()) !== 'geen' && /\d+×\d+/.test(await page.locator('#cam-beeld').innerText()));
  const opties = await page.locator('#cam-keuze option').count();
  check('de keuzelijst toont de standaardcamera en minstens één camera', opties >= 2, `${opties} opties`);
  check('het aantal camera\'s staat bij Toestel', /^\d+$/.test(await page.locator('#t-cams').innerText()));

  const transform = () => page.locator('#video').evaluate((v) => getComputedStyle(v).transform);
  check('het beeld is standaard gespiegeld (scaleX(-1))', (await transform()) === 'matrix(-1, 0, 0, 1, 0, 0)', await transform());
  await page.uncheck('#spiegel');
  check('zonder het vinkje is het beeld niet gespiegeld', (await transform()) === 'none', await transform());
  await page.check('#spiegel');
  check('met het vinkje weer gespiegeld', (await transform()) === 'matrix(-1, 0, 0, 1, 0, 0)');

  await page.click('#meting-start');
  check('"Start meting" zet een regel in de log', /Meting op nul gezet/.test(await page.locator('#log').innerText()));
  try {
    await page.waitForFunction(() => (document.getElementById('log').textContent.match(/Proefcode gelezen/g) || []).length >= 2, null, { timeout: 15000 });
    check('na "Start meting" leest de scanner de code opnieuw', true);
  } catch {
    check('na "Start meting" leest de scanner de code opnieuw', false, (await page.locator('#log').innerText()).slice(-300));
  }

  await page.click('#cam-stop');
  check('"Stop de camera" stopt de stream', await page.locator('#video').evaluate((v) => v.srcObject === null) && (await page.locator('#video-vak').isHidden()));

  // Zonder camera: een duidelijke melding, geen crash.
  const zonderCamera = await context.newPage();
  const extraFouten = [];
  zonderCamera.on('pageerror', (e) => extraFouten.push(e.message));
  await zonderCamera.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await zonderCamera.goto(PAGINA, { waitUntil: 'load' });
  await zonderCamera.click('#cam-start');
  const geenCameraMelding = await zonderCamera.locator('#cam-melding').innerText();
  check('zonder camera-ondersteuning: een Nederlandse melding', /Fout: .*camera/.test(geenCameraMelding) && extraFouten.length === 0, geenCameraMelding);
  await zonderCamera.close();

  // ── (c) Stem ─────────────────────────────────────────────────────────────
  console.log('Stem');
  const samenvatting = await page.locator('#stem-samenvatting').innerText();
  const rijen = await page.locator('#stem-rijen tr').count();
  check('de stemsectie toont een lijst of een melding', rijen > 0 || (samenvatting.length > 0 && !/^wordt nagekeken/.test(samenvatting)), samenvatting);
  await page.click('#stem-zeg');
  await page.waitForTimeout(400);
  const stemMelding = await page.locator('#stem-melding').innerText();
  const stemGebruikt = await page.locator('#stem-gebruikt').innerText();
  check('"Zeg" geeft een stem of een melding, zonder fout', stemMelding.length > 0 || /\(nl/i.test(stemGebruikt), `${stemMelding} / ${stemGebruikt}`);

  // ── (d) Opslag ───────────────────────────────────────────────────────────
  console.log('Opslag');
  check('bij het openen is er geen merkje', /^geen merkje/.test(await page.locator('#ls-start').innerText()));
  await page.click('#merkje-zet');
  await page.waitForFunction(() => /Merkje van|merkje van/.test(document.getElementById('idb-nu').textContent), null, { timeout: 8000 });
  check('"Zet een merkje" bewaart in localStorage en IndexedDB', /merkje van/.test(await page.locator('#ls-nu').innerText()) && /merkje van/.test(await page.locator('#idb-nu').innerText()));
  check('de opslag meldt persisted en estimate', !/wordt nagekeken/.test(await page.locator('#s-persisted').innerText()) && !/wordt nagekeken/.test(await page.locator('#s-estimate').innerText()));

  // ── (f) Uitslag, nog voor het herladen ───────────────────────────────────
  console.log('Uitslag');
  await page.click('#kopieer');
  const uitslag = await page.locator('#uitslag-tekst').inputValue();
  let klembord = '';
  try {
    klembord = await page.evaluate(() => navigator.clipboard.readText());
  } catch {
    klembord = '';
  }
  check('de uitslag bevat de toestelkeuze', uitslag.includes('Toestel: laptop van de leerkracht'));
  check('de uitslag bevat de scanner, de stem, de opslag en het toestel', ['Scanner', 'Stem', 'Opslag', 'Toestel', '- Decoder: jsqr', 'Datum:', 'Proefcode gelezen: versie 6, 8 px'].every((s) => uitslag.includes(s)));
  check('de uitslag bevat de uitkomst van het starten van de camera', uitslag.includes('- Camera starten: gestart'), uitslag.split('\n').filter((l) => /Camera starten/.test(l)).join(' | '));
  check('de uitslag bevat de toestemming bij het openen en nu, apart', /- Toestemming voor de camera bij het openen: \S/.test(uitslag) && /- Toestemming voor de camera nu: \S/.test(uitslag));
  check('de uitslag bevat de fouten van BarcodeDetector', /- Fouten van BarcodeDetector: 0/.test(uitslag));
  check('de uitslag bevat het internet bij de laatste stempoging', /- Internet bij de laatste poging: (online|offline)/.test(uitslag), uitslag.split('\n').filter((l) => /Internet bij/.test(l)).join(' | '));
  check('het klembord of het tekstvak heeft de uitslag', klembord === uitslag || uitslag.length > 200, `klembord ${klembord.length} tekens`);
  check('de uitslag bevat geen webadres', !/https?:\/\//.test(uitslag));

  // ── Herladen: het merkje blijft ──────────────────────────────────────────
  console.log('Na herladen');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => /merkje van/.test(document.getElementById('idb-start').textContent) || /niet bruikbaar|geen merkje/.test(document.getElementById('idb-start').textContent), null, { timeout: 8000 });
  check('het merkje staat na herladen nog in localStorage', /^merkje van/.test(await page.locator('#ls-start').innerText()), await page.locator('#ls-start').innerText());
  check('het merkje staat na herladen nog in IndexedDB', /^merkje van/.test(await page.locator('#idb-start').innerText()), await page.locator('#idb-start').innerText());
  await page.click('#merkje-wis');
  await page.waitForFunction(() => /^geen merkje/.test(document.getElementById('idb-nu').textContent), null, { timeout: 8000 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => /^geen merkje/.test(document.getElementById('idb-start').textContent), null, { timeout: 8000 });
  check('"Wis het merkje" wist beide', /^geen merkje/.test(await page.locator('#ls-start').innerText()) && /^geen merkje/.test(await page.locator('#idb-start').innerText()));

  // ── Herstelde gedragingen: fouten tonen zich in de uitslag ───────────────
  console.log('Fouten in de uitslag');
  const lees = async (pagina) => {
    await pagina.click('#kopieer');
    return pagina.locator('#uitslag-tekst').inputValue();
  };

  // De camera mag niet: de oorzaak staat in de uitslag, met de Windows-zin.
  const geweigerd = await context.newPage();
  await geweigerd.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied by system', 'NotAllowedError'));
  });
  await geweigerd.goto(PAGINA, { waitUntil: 'load' });
  await geweigerd.click('#cam-start');
  await geweigerd.waitForFunction(() => /Fout:/.test(document.getElementById('cam-melding').textContent), null, { timeout: 8000 });
  const geweigerdMelding = await geweigerd.locator('#cam-melding').innerText();
  const geweigerdUitslag = await lees(geweigerd);
  check('geen toestemming: de melding noemt Windows', /Windows/.test(geweigerdMelding), geweigerdMelding);
  check('geen toestemming: de uitslag noemt de oorzaak', /- Camera starten: mislukt: .*NotAllowedError: Permission denied by system/.test(geweigerdUitslag), geweigerdUitslag.split('\n').filter((l) => /Camera starten/.test(l)).join(' | '));
  await geweigerd.close();

  // De camera is bezet: een andere oorzaak dan geen toestemming.
  const bezet = await context.newPage();
  await bezet.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Could not start video source', 'NotReadableError'));
  });
  await bezet.goto(PAGINA, { waitUntil: 'load' });
  await bezet.click('#cam-start');
  await bezet.waitForFunction(() => /Fout:/.test(document.getElementById('cam-melding').textContent), null, { timeout: 8000 });
  const bezetUitslag = await lees(bezet);
  check('camera bezet: de uitslag noemt NotReadableError', /- Camera starten: mislukt: .*NotReadableError: Could not start video source/.test(bezetUitslag));
  await bezet.close();

  // Zonder camera-ondersteuning staat dat ook in de uitslag.
  const zonderMd = await context.newPage();
  await zonderMd.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await zonderMd.goto(PAGINA, { waitUntil: 'load' });
  await zonderMd.click('#cam-start');
  const zonderMdUitslag = await lees(zonderMd);
  check('zonder mediaDevices: de uitslag zegt dat de toegang ontbreekt', /- Camera starten: geen toegang tot camera's/.test(zonderMdUitslag));
  await zonderMd.close();

  // Zonder IndexedDB: de eigen melding verschijnt, niet alleen "Error".
  const zonderIdb = await context.newPage();
  await zonderIdb.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await zonderIdb.goto(PAGINA, { waitUntil: 'load' });
  await zonderIdb.waitForFunction(() => /niet bruikbaar/.test(document.getElementById('idb-start').textContent), null, { timeout: 8000 });
  const idbTekst = await zonderIdb.locator('#idb-start').innerText();
  check('zonder IndexedDB: de melding zegt waarom', /IndexedDB ontbreekt/.test(idbTekst), idbTekst);
  await zonderIdb.close();

  // Een BarcodeDetector die bij elk beeld faalt: melding, uitslag, en de beelden tellen niet mee.
  const kapot = await context.newPage();
  await kapot.addInitScript(() => {
    window.BarcodeDetector = class {
      static getSupportedFormats() { return Promise.resolve(['qr_code']); }
      detect() { return Promise.reject(new DOMException('Barcode detection service unavailable.', 'NotSupportedError')); }
    };
  });
  await kapot.goto(PAGINA, { waitUntil: 'load' });
  await kapot.click('#cam-start');
  try {
    await kapot.waitForFunction(() => /faalt bij elk beeld/.test(document.getElementById('cam-melding').textContent), null, { timeout: 15000 });
    check('een kapotte BarcodeDetector geeft een melding', true);
  } catch {
    check('een kapotte BarcodeDetector geeft een melding', false, await kapot.locator('#cam-melding').innerText());
  }
  const kapotUitslag = await lees(kapot);
  check('een kapotte BarcodeDetector staat in de uitslag', /- Fouten van BarcodeDetector: [5-9]\d* \(NotSupportedError: Barcode detection service unavailable\.\)/.test(kapotUitslag), kapotUitslag.split('\n').filter((l) => /Fouten van/.test(l)).join(' | '));
  check('mislukte beelden tellen niet mee in het gemiddelde', /- Beelden bekeken: nog geen/.test(kapotUitslag), kapotUitslag.split('\n').filter((l) => /Beelden bekeken/.test(l)).join(' | '));
  await kapot.close();

  // De toestemming bij het openen blijft staan nadat de stand verandert.
  const toestemming = await context.newPage();
  await toestemming.goto(PAGINA, { waitUntil: 'load' });
  await toestemming.waitForFunction(() => !/wordt nagekeken/.test(document.getElementById('cam-toestemming').textContent), null, { timeout: 8000 });
  const bijOpenen = (await lees(toestemming)).match(/- Toestemming voor de camera bij het openen: (.*)/);
  await context.grantPermissions(['camera', 'clipboard-read', 'clipboard-write']);
  await toestemming.waitForTimeout(500);
  const naToestaan = await lees(toestemming);
  const bijOpenenNa = naToestaan.match(/- Toestemming voor de camera bij het openen: (.*)/);
  check('de toestemming bij het openen blijft staan nadat de stand verandert', bijOpenen && bijOpenenNa && bijOpenen[1] === bijOpenenNa[1], `${bijOpenen && bijOpenen[1]} / ${bijOpenenNa && bijOpenenNa[1]}`);
  check('de toestemming nu volgt de nieuwe stand', /- Toestemming voor de camera nu: toegestaan/.test(naToestaan), naToestaan.split('\n').filter((l) => /Toestemming/.test(l)).join(' | '));

  // De log in de uitslag houdt alles: ook na 45 keer "Start meting".
  await toestemming.click('#cam-start');
  await toestemming.waitForFunction(() => /De camera draait/.test(document.getElementById('cam-melding').textContent), null, { timeout: 15000 });
  for (let i = 0; i < 45; i += 1) await toestemming.click('#meting-start');
  const langeUitslag = await lees(toestemming);
  const nullen = (langeUitslag.match(/Meting op nul gezet\./g) || []).length;
  check('de uitslag houdt de hele log (45 keer "Start meting")', nullen === 45, `${nullen} regels`);
  await toestemming.close();

  // ── Smal scherm, donker, tikdoelen ───────────────────────────────────────
  console.log('Smal scherm en tikdoelen');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.check('input[name="versie"][value="10"]');
  await page.check('input[name="px"][value="8"]');
  const smal = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    vakScroll: document.getElementById('codevak').scrollWidth,
    vakBreed: document.getElementById('codevak').clientWidth,
    vakFocus: document.getElementById('codevak').getAttribute('tabindex'),
  }));
  check('op 390 px scrolt de pagina niet zijwaarts', smal.document <= 390, `scrollWidth ${smal.document}`);
  check('op 390 px scrolt het vak van de code zelf (488 px in een smaller vak)', smal.vakScroll > smal.vakBreed && smal.vakFocus === '0', `${smal.vakScroll} in ${smal.vakBreed}`);
  await page.click('#stem-zeg');
  await page.click('#kopieer');
  const smalNaKnoppen = await page.evaluate(() => document.documentElement.scrollWidth);
  check('na de knoppen scrolt de pagina nog niet zijwaarts', smalNaKnoppen <= 390, String(smalNaKnoppen));

  await page.emulateMedia({ colorScheme: 'dark' });
  const donker = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    achtergrond: getComputedStyle(document.body).backgroundColor,
    svgWit: getComputedStyle(document.querySelector('#codevak')).backgroundColor,
    vulling: document.querySelector('#codevak svg rect').getAttribute('fill'),
    modules: document.querySelector('#codevak svg path').getAttribute('fill'),
  }));
  check('donkere stand: de pagina is donker en scrolt niet zijwaarts', donker.achtergrond === 'rgb(16, 14, 31)' && donker.document <= 390, JSON.stringify(donker));
  check('donkere stand: de code blijft zwart op wit', donker.svgWit === 'rgb(255, 255, 255)' && donker.vulling === '#fff' && donker.modules === '#000');
  await page.emulateMedia({ colorScheme: 'light' });

  const klein = await page.evaluate(() => {
    const teKlein = [];
    const kandidaten = document.querySelectorAll('button, select, textarea, label.keuze, label.vink');
    kandidaten.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.height < 43.5 || r.width < 43.5) teKlein.push(`${el.id || el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return teKlein;
  });
  check('alle knoppen, velden en keuzes zijn minstens 44 px hoog en breed', klein.length === 0, klein.join(', '));

  // Toetsenbord: de eerste Tab-stappen bereiken de toestelkeuze, en de focus is zichtbaar.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: 'load' });
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { id: el.id, omtrek: s.outlineStyle, breedte: s.outlineWidth };
  });
  check('Tab komt eerst bij de toestelkeuze, met een zichtbare focus', focus.id === 'toestel' && focus.omtrek !== 'none' && parseFloat(focus.breedte) >= 2, JSON.stringify(focus));

  // ── Geen externe aanvragen, geen fouten ──────────────────────────────────
  console.log('Aanvragen en fouten');
  const vreemd = aanvragen.filter((u) => u !== PAGINA && !/\/favicon\.ico$/.test(u));
  check('de pagina doet geen enkele aanvraag behalve zichzelf', vreemd.length === 0, vreemd.join(', '));
  check('de pagina laadt zonder console- of paginafouten', paginaFouten.length === 0, paginaFouten.join(' | '));
} catch (e) {
  fouten.push(`onverwachte fout in de test: ${e && e.stack ? e.stack : e}`);
  console.log(`  FOUT  onverwachte fout in de test: ${e && e.message ? e.message : e}`);
} finally {
  await browser.close();
}

if (fouten.length > 0) {
  console.log(`\nTOESTELPROEF ROOKTEST: ${fouten.length} fout(en)`);
  fouten.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('\nTOESTELPROEF ROOKTEST: ALLES GESLAAGD');
