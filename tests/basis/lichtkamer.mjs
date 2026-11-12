// Rooktest van de Lichtkamer (schaduwtheater): de lespagina van de leerkracht, het bordscherm en het kindscherm (LK-9).
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/basis/lichtkamer.mjs
//
// Een andere poort geef je mee met SMOKE_BASE=http://localhost:<poort>. Schermafbeeldingen komen in LK_FOTO (standaard
// <tmp>/lichtkamer-rooktest), nooit in de repo. Faalt (exit 1) bij een mislukte check of bij een console- of paginafout.
// Een check met `bekend()` is een fout in de app die gemeld is: ze staat apart en laat de rest doorlopen (geen exit 1).
//
// Deze test speelt de schermen zoals een leerkracht en een kind ze gebruiken. Ze past de schermen niet aan om groen te
// worden. Het kindscherm gaat met alleen het toetsenbord (Tab, Shift+Tab, Enter, spatie, pijltjes, typen), nooit met een
// muisklik of element.click(). De juiste antwoorden komen uit een eigen nabootsing van de rekenregels van de app, en elk
// antwoord wordt daarna gecontroleerd tegen wat het scherm zegt: klopt de nabootsing niet meer, dan faalt de check met een
// duidelijke melding in plaats van stil verkeerd te lopen.
//
// Wat deze test bewust niet doet: de beeldkwaliteit van de 3D beoordelen (dat is een oog op een echt toestel, LK-11),
// frametijden meten (?meet) en spraak horen.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '');
const FOTO = process.env.LK_FOTO || path.join(os.tmpdir(), 'lichtkamer-rooktest');
fs.mkdirSync(FOTO, { recursive: true });

const LES = `${BASE}/#/basis/pakket/lichtkamer/einde-4de`;
const BORD = `${BASE}/#/basis/bord/lichtkamer/einde-4de`;
const KIND = `${BASE}/#/basis/oefen/lichtkamer/einde-4de`;
const KLOK = '2026-11-02T10:00:00Z';

const errors = [];
const bekendeFouten = [];
let failures = 0;
let checks = 0;

function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ FAIL: ${name}${detail ? ` (${detail})` : ''}`);
    failures++;
  }
  return !!cond;
}
/** Een gemelde fout van de app: rood zolang ze bestaat, maar zonder de rest te blokkeren. */
function bekend(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ✓ ${name} (BEKEND-fout is opgelost: haal de BEKEND-markering weg)`);
  else {
    console.log(`  ~ BEKEND: ${name}${detail ? ` (${detail})` : ''}`);
    bekendeFouten.push(name);
  }
  return !!cond;
}
const kop = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────────────────────── gereedschap ─────────────────────────────────────────────

const CSP_INIT = `document.addEventListener('securitypolicyviolation', (e) => console.error('CSP: ' + e.violatedDirective + ' ' + e.blockedURI));`;

async function maakCtx(browser, breedte, hoogte, { tijd, init } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: breedte, height: hoogte } });
  await ctx.addInitScript(CSP_INIT);
  if (init) await ctx.addInitScript(init);
  ctx.__tijd = tijd;
  return ctx;
}

/** Een pagina met opvang van console- en paginafouten; `fetches` bewaart de adressen van de opgehaalde scripts. */
async function pagina(ctx, label) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  p.__fetches = [];
  p.on('request', (r) => p.__fetches.push(r.url()));
  p.on('pageerror', (e) => errors.push(`pageerror(${label}): ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error' || /ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
    errors.push(`console(${label}): ${m.text().slice(0, 300)}`);
  });
  if (ctx.__tijd) await p.clock.setFixedTime(new Date(ctx.__tijd));
  return p;
}

const foto = async (p, naam) => {
  try {
    await p.screenshot({ path: path.join(FOTO, `${naam}.png`), fullPage: true });
  } catch (e) {
    console.log(`  (schermafbeelding ${naam} mislukt: ${e.message.split('\n')[0]})`);
  }
};

/** Wacht op een toestand in de pagina; geeft false (geen worp) als ze niet komt. */
async function wachtOp(p, fn, arg, ms = 8000) {
  try {
    await p.waitForFunction(fn, arg, { timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/** Een adres dat alleen in de hash verschilt laadt de pagina niet opnieuw: eerst leegmaken, zodat de app echt vers begint. */
const openVers = async (p, url, opties = { waitUntil: 'networkidle' }) => {
  await p.goto('about:blank');
  await p.goto(url, opties);
};

const opslag = (p) =>
  p.evaluate(() => {
    const lees = (s) => JSON.stringify(Object.entries(s).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return { lokaal: lees(localStorage), sessie: lees(sessionStorage) };
  });
const aantal = (p, sel) => p.locator(sel).count();
const tekstVan = (p, sel) => p.evaluate((s) => Array.from(document.querySelectorAll(s)).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).join(' | '), sel);
const h2 = (p) => p.evaluate(() => (document.querySelector('.b-lk-les h2')?.textContent || '').trim());
const fb = (p) => tekstVan(p, '.b-lk-les .b-lk-fb');
const heeftEenKop = async (p) => (await aantal(p, 'main')) === 1 && (await aantal(p, 'h1')) === 1 && (await aantal(p, 'main h1')) === 1;
const passtOpSmal = (p) => p.evaluate(() => ({ breed: document.documentElement.scrollWidth, venster: window.innerWidth }));
const WACHT_OP_DOOS = '.b-lk-kijk canvas';

/** Elke knop, link en elk invoerveld dat zichtbaar is en lager dan 44 px (de skip-link is pas zichtbaar met de focus). */
const kleineTikdoelen = (p) =>
  p.evaluate(() => {
    const uit = [];
    for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
      if (e.classList.contains('skip-link') || e.closest('.sr-only')) continue;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (Math.round(r.height) < 44) {
        const naam = (e.getAttribute('aria-label') || e.textContent || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        uit.push(`${e.tagName.toLowerCase()} "${naam}" ${Math.round(r.height * 10) / 10}px`);
      }
    }
    return uit;
  });

// Toetsenbord: wat is gefocust, en Tab (of Shift+Tab) tot het gefocuste element past.
const actief = (p) =>
  p.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    const naam = (n) => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' ? Array.from(n.childNodes).map(naam).join('') : '');
    const tekst = (e.getAttribute('aria-label') || naam(e) || '').replace(/\s+/g, ' ').trim();
    const groep = e.closest('[role=group]');
    const ouder = e.parentElement;
    return {
      tag: e.tagName.toLowerCase(),
      id: e.id || '',
      klasse: String(e.className || ''),
      tekst: tekst.slice(0, 200),
      waarde: 'value' in e ? e.value : '',
      pressed: e.getAttribute('aria-pressed'),
      groep: groep?.getAttribute('aria-labelledby') || groep?.getAttribute('aria-label') || '',
      volgnr: groep ? Array.from(groep.querySelectorAll('button')).indexOf(e) : -1,
      indialoog: !!e.closest('[role=dialog]'),
      uitgeschakeld: e.disabled === true,
      ouderId: ouder?.id || '',
    };
  });
const knopMet = (rx) => (i) => !!i && (i.tag === 'button' || i.tag === 'a') && (rx instanceof RegExp ? rx.test(i.tekst) : i.tekst === rx);

async function tabTot(p, test, { max = 80, terug = false } = {}) {
  for (let ronde = 0; ronde < 2; ronde++) {
    const richting = (ronde === 0) === !terug ? 'Tab' : 'Shift+Tab';
    for (let i = 0; i < max; i++) {
      if (test(await actief(p))) return actief(p);
      await p.keyboard.press(richting);
    }
  }
  const a = await actief(p);
  return test(a) ? a : null;
}
/** Naar het element met Tab en dan een toets (Enter of Space). Meldt een mislukte check als het niet bereikbaar is. */
async function bereik(p, naam, test, opties) {
  const a = await tabTot(p, test, opties);
  check(`${naam}: bereikbaar met Tab`, !!a);
  return a;
}
async function druk(p, naam, test, toets = 'Enter', opties) {
  const a = await bereik(p, naam, test, opties);
  if (a) await p.keyboard.press(toets);
  return a;
}
const focusOp = async (p, fn) => wachtOp(p, fn, undefined, 4000);

// ──────────────────────────── de rekenregels van de app, nagebootst om de juiste invoer te kiezen ────────────────────────────

// Uit src/lib/basis/lichtkamer/kaartjes.ts: hoogtes van gaatjes en lamp, en wanneer het licht doorkomt.
const GAAT_HOOGTES = [0.35, 0.5, 0.65];
const LAMP_HOOGTES = [0.2, 0.35, 0.5, 0.65, 0.8];
const klem = (v, a, b) => Math.max(a, Math.min(b, v));
const lichtDoor = (k) => {
  const ly = LAMP_HOOGTES[k.lamp];
  const ys = [GAAT_HOOGTES[k.gaten[2]], GAAT_HOOGTES[k.gaten[1]], GAAT_HOOGTES[k.gaten[0]]];
  const stap = ys[0] - ly;
  return Math.abs(ys[1] - ys[0] - stap) < 0.001 && Math.abs(ys[2] - ys[1] - stap) < 0.001;
};
// Uit src/lib/basis/lichtkamer/schaduw.ts (schaduwHoogteBijAfstandCm): de echte schaduwhoogte van de boom, in cm.
const echteHoogteCm = (cm) => {
  const c = cm / 10;
  const f = (1 + c) / c;
  return (0.5 + (1.0 - 0.5) * f) * 10;
};
// De meetlat heeft streepjes van 0,5 cm: lees af op het dichtstbijzijnde streepje (de tolerantie van de app is 0,75 cm).
const aflezing = (cm) => Math.round(echteHoogteCm(cm) * 2) / 2;
const alsTekst = (v, komma) => (komma ? String(v).replace('.', ',') : String(v));

// ───────────────────────────────────────── 1. drie schermen: kop, breedte, tikdoelen ─────────────────────────────────────────

async function schermen(browser) {
  kop('1. De drie schermen openen netjes (390 px breed)');
  const ctx = await maakCtx(browser, 390, 800);
  const lijst = [
    { naam: 'lespagina', url: LES, wacht: 'h1', kleinCheck: false },
    { naam: 'bord', url: BORD, wacht: '.b-lk-les h2', kleinCheck: false },
    { naam: 'kind', url: KIND, wacht: '.b-lk-les h2', kleinCheck: true },
  ];
  for (const s of lijst) {
    const p = await pagina(ctx, `1-${s.naam}`);
    await p.goto(s.url, { waitUntil: 'networkidle' });
    await p.waitForSelector(s.wacht);
    await sleep(300);
    check(`${s.naam}: precies één main en één h1 (de h1 staat in de main)`, await heeftEenKop(p));
    const b = await passtOpSmal(p);
    check(`${s.naam}: op 390 px scrolt niets horizontaal`, b.breed <= b.venster + 1, `scrollWidth ${b.breed}`);
    await foto(p, `01-${s.naam}-390`);
    await p.close();
  }

  // Het kindscherm: elk tikdoel minstens 44 px, op elk beginscherm.
  const beginSchermen = [
    ['keuze', 'Kies een oefening'],
    ['waar-valt-de-schaduw', 'Waar valt de schaduw?'],
    ['drie-kaartjes', 'Drie kaartjes met een gaatje'],
    ['onderzoek-schaduw', 'Onderzoek: lamp dichterbij, schaduw groter?'],
    ['check', 'De check'],
    ['kan', 'Wat ik al kan'],
  ];
  for (const [param, titel] of beginSchermen) {
    const p = await pagina(ctx, `1-kind-${param}`);
    await p.goto(`${KIND}?scherm=${param}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('.b-lk-les h2');
    if (param !== 'keuze' && param !== 'check' && param !== 'kan') await p.waitForSelector(WACHT_OP_DOOS).catch(() => {});
    await sleep(200);
    check(`kind ?scherm=${param}: opent op "${titel}"`, (await h2(p)) === titel, await h2(p));
    check(`kind ?scherm=${param}: één main en één h1`, await heeftEenKop(p));
    const b = await passtOpSmal(p);
    check(`kind ?scherm=${param}: geen horizontale scroll op 390 px`, b.breed <= b.venster + 1, `scrollWidth ${b.breed}`);
    const klein = await kleineTikdoelen(p);
    check(`kind ?scherm=${param}: elke knop, link en elk invoerveld is minstens 44 px hoog`, klein.length === 0, klein.slice(0, 4).join('; '));
    await foto(p, `01-kind-${param}-390`);
    await p.close();
  }
  await ctx.close();
}

// ───────────────────────────────────────── 2. de weg van de leerkracht ─────────────────────────────────────────

async function leerkracht(browser) {
  kop('2. De weg van de leerkracht: tegel, lespagina, uitproberen, kindlink, bord');
  const ctx = await maakCtx(browser, 1280, 900, { tijd: KLOK });
  const p = await pagina(ctx, '2-leerkracht');
  await p.goto(`${BASE}/#/basis`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.b-tegel');
  const tegel = p.locator('a.b-tegel', { hasText: 'Lichtkamer: schaduwtheater' });
  check("de startpagina van #/basis heeft de tegel 'Lichtkamer: schaduwtheater'", (await tegel.count()) === 1);
  await foto(p, '02-startpagina');
  await tegel.click();
  await p.waitForSelector('.b-lkp');
  check('de tegel leidt naar de lespagina', /#\/basis\/pakket\/lichtkamer\/einde-4de/.test(p.url()), p.url());
  check('de lespagina heeft één main en één h1 met de naam van het pakket', (await heeftEenKop(p)) && (await p.locator('h1').innerText()).trim() === 'Lichtkamer: schaduwtheater');

  // De drie doelen: letterlijk uit de officiële set, met kindertaal en 'zo zie je dat het lukt'.
  const geladen = await wachtOp(p, () => document.querySelectorAll('.b-lkp-doeltekst q').length === 3, undefined, 20000);
  check('de drie doelteksten staan er (uit de officiële set)', geladen);
  const doelen = await p.evaluate(() =>
    [...document.querySelectorAll('.b-lkp-doel')].map((d) => ({
      code: d.querySelector('.b-lkp-code')?.textContent?.trim() ?? '',
      tekst: d.querySelector('q')?.textContent?.trim() ?? '',
      kind: /In kindertaal:/.test(d.textContent || ''),
      zie: /Zo zie je dat het lukt:/.test(d.textContent || ''),
    })),
  );
  check('elk doel heeft een code en een tekst van minstens 20 tekens', doelen.length === 3 && doelen.every((d) => d.code && d.tekst.length >= 20), JSON.stringify(doelen.map((d) => [d.code, d.tekst.length])));
  check("elk doel heeft 'In kindertaal' en 'Zo zie je dat het lukt'", doelen.length === 3 && doelen.every((d) => d.kind && d.zie));
  const paginaTekst = await p.locator('main').innerText();
  check('de kop van het deel Doel noemt geen onverwachte foutmelding', !/konden niet geladen worden/.test(paginaTekst));

  // Leerjaar 3: de noot 'je werkt naar deze doelen toe'.
  const l3 = await pagina(ctx, '2-leerjaar3');
  await l3.goto(`${LES}?leerjaar=L3`, { waitUntil: 'networkidle' });
  await l3.waitForSelector('.b-lkp');
  const noot = await l3.locator('.b-lkp-noot').innerText();
  check("?leerjaar=L3: de noot zegt 'Werk je met een 3de leerjaar?' en 'Dan werk je naar deze doelen toe'", /Werk je met een 3de leerjaar\?/.test(noot) && /Dan werk je naar deze doelen toe/.test(noot), noot.slice(0, 80));
  check('?leerjaar=L3: de knop 3de leerjaar is de gekozen (aria-current)', (await l3.locator('.b-lkp-keuze a[aria-current="true"]').innerText()).includes('3de'));
  await l3.close();

  // Uitproberen: de kijkdoos laadt pas na de klik; er wordt niets bewaard.
  const voorOpslag = await opslag(p);
  const drieVoor = p.__fetches.filter((u) => /\/(three|kijkdoos3d)-[^/]*\.js/.test(u)).length;
  check("vóór 'Uitproberen' is three niet opgehaald op de lespagina", drieVoor === 0, p.__fetches.filter((u) => /three|kijkdoos3d/.test(u)).join(', '));
  check('de les is nog niet geopend (geen .b-lk-les op de lespagina)', (await aantal(p, '.b-lk-les')) === 0);
  await p.getByRole('button', { name: /Probeer de oefeningen uit/ }).click();
  await p.waitForSelector('.b-lk-les[data-stand="uitproberen"] h2');
  check("'Uitproberen' opent de les (stand uitproberen)", (await h2(p)) === 'Kies een oefening');
  check('de les heeft op de lespagina geen eigen main of h1', (await aantal(p, 'main')) === 1 && (await aantal(p, 'h1')) === 1);
  await p.locator('.b-lk-les .b-lk-tegel', { hasText: 'Waar valt de schaduw?' }).click();
  await p.waitForSelector(`.b-lk-les ${WACHT_OP_DOOS}`).catch(() => {});
  check("na 'Uitproberen' is three opgehaald", p.__fetches.some((u) => /\/three-[^/]*\.js/.test(u)));
  // Een letter kiezen, naar de volgende ronde, en het kaartjes-paneel aanraken: met de muis mag hier.
  await p.locator('.b-lk-les .b-lk-opt').nth(0).click();
  await p.getByRole('button', { name: 'Volgende ronde' }).click();
  await foto(p, '02-uitproberen');
  const naOpslag = await opslag(p);
  check("na 'Uitproberen' is localStorage byte-gelijk aan ervoor", naOpslag.lokaal === voorOpslag.lokaal, `${voorOpslag.lokaal} -> ${naOpslag.lokaal}`);
  check("na 'Uitproberen' staat er niets in sessionStorage", naOpslag.sessie === voorOpslag.sessie && naOpslag.sessie === '[]', naOpslag.sessie);
  await p.getByRole('button', { name: /Sluit het uitproberen/ }).click();
  check("'Sluit het uitproberen' haalt de les weer weg", (await aantal(p, '.b-lk-les')) === 0);
  await foto(p, '02-lespagina');

  // De kindlink: een volledig adres naar het kindscherm; open het echt. Er staat een QR-code.
  const link = await p.locator('#lkp-kindlink').inputValue();
  check('de kindlink is een volledig adres dat naar het kindscherm wijst', /^https?:\/\/[^/]+\/.*#\/basis\/oefen\/lichtkamer\/einde-4de$/.test(link), link);
  check('de kindlink bevat geen naam en geen klascode (geen query)', !/[?&]/.test(link), link);
  check('er staat een QR-code bij de kindlink', await wachtOp(p, () => !!document.querySelector('.b-lkp-qr img'), undefined, 10000));
  const kind = await pagina(ctx, '2-kindlink');
  await kind.goto(link, { waitUntil: 'networkidle' });
  const opent = await wachtOp(kind, () => !!document.querySelector('main h1') && !!document.querySelector('.b-lk-les h2'), undefined, 15000);
  check('de kindlink opent echt het kindscherm (h1 en de keuze van de oefeningen)', opent && (await kind.locator('h1').innerText()).trim() === 'Lichtkamer: schaduwtheater' && (await h2(kind)) === 'Kies een oefening');
  check('het kindscherm van de link heeft geen "Naar Boosterz" en geen navigatie van de leerkracht', (await kind.locator('a', { hasText: 'Naar Boosterz' }).count()) === 0 && (await kind.locator('main nav, header nav').count()) === 0);
  await kind.close();

  // Het bord.
  await p.getByRole('link', { name: /Open het bord/ }).click();
  await p.waitForSelector('.b-lk-les[data-stand="bord"]');
  check("'Open het bord' leidt naar het bordscherm", /#\/basis\/bord\/lichtkamer\/einde-4de/.test(p.url()) && (await p.evaluate(() => document.documentElement.hasAttribute('data-bord'))), p.url());
  await p.close();
  await ctx.close();
}

// ───────────────────────────────────────── 3 en 4. het kindscherm met alleen het toetsenbord ─────────────────────────────────────────

async function kindToetsenbord(browser) {
  kop('3. Het kindscherm met alleen het toetsenbord');
  const ctx = await maakCtx(browser, 1280, 900);
  const p = await pagina(ctx, '3-kind');
  await p.goto(KIND, { waitUntil: 'networkidle' });
  await p.waitForSelector('.b-lk-les h2');
  await sleep(300);
  const voor = await opslag(p);
  console.log(`  (localStorage bij het openen: ${voor.lokaal}; sessionStorage: ${voor.sessie})`);
  check('de keuze begint met "Kies een oefening" en vier tegels', (await h2(p)) === 'Kies een oefening' && (await aantal(p, '.b-lk-tegel')) === 4);
  check('er is geen naamveld en geen invoerveld op de keuze', (await aantal(p, 'input, textarea, select')) === 0);
  await foto(p, '03-kind-01-keuze');

  // ── Waar valt de schaduw? Drie rondes, met één fout antwoord (B in ronde 1).
  await druk(p, 'tegel "Waar valt de schaduw?"', knopMet(/^Waar valt de schaduw\?/));
  check('na Enter staat de focus op de kop van de oefening', await focusOp(p, () => document.activeElement?.tagName === 'H2' && /Waar valt/.test(document.activeElement.textContent || '')));
  check('de kijkdoos tekent een canvas', await wachtOp(p, () => !!document.querySelector('.b-lk-kijk canvas'), undefined, 20000));
  check('ronde 1 van 3 staat in beeld', /Ronde 1 van 3/.test(await tekstVan(p, '.b-lk-ronde')));
  check('de drie letters hebben een naam met hun plaats op het scherm', (await p.locator('.b-lk-opt').evaluateAll((l) => l.map((e) => e.textContent))).every((t, i) => new RegExp(`letter ${'ABC'[i]}, (links|rechts|in het midden) op het scherm`).test(t)));
  // Juiste letters per ronde: A, B, C (VOLGORDE in rondes.ts: de juiste is de eerste van [juist, kant van de lamp, recht achter]).
  // Ze worden hieronder tegen het scherm gecontroleerd: een andere volgorde in de app geeft een duidelijke fout.
  const juistPerRonde = [0, 1, 2];
  const kies = [1, 1, 2]; // ronde 1: B (fout), ronde 2: B (juist), ronde 3: C (juist)
  let juistGetal = 0;
  for (let r = 0; r < 3; r++) {
    const L = 'ABC'[kies[r]];
    await druk(p, `ronde ${r + 1}: letter ${L}`, (i) => !!i && i.tag === 'button' && new RegExp(`\\(letter ${L},`).test(i.tekst), r === 0 ? 'Space' : 'Enter');
    const uitkomst = await wachtOp(p, () => document.querySelectorAll('.b-lk-les .b-lk-opt.b-lk-juist').length === 1, undefined, 6000);
    check(`ronde ${r + 1}: na het antwoord toont het scherm de juiste letter`, uitkomst);
    const verwachtJuist = kies[r] === juistPerRonde[r];
    const tekst = await fb(p);
    if (verwachtJuist) juistGetal++;
    check(
      `ronde ${r + 1}: letter ${L} is ${verwachtJuist ? 'juist' : 'fout'} en het scherm zegt dat ook`,
      verwachtJuist ? /Juist voorspeld/.test(tekst) : /Kijk naar de lichtstralen/.test(tekst),
      `scherm: "${tekst}"`,
    );
    if (!verwachtJuist) {
      check('ronde 1 (fout): de gekozen letter staat als niet juist, met woord en vorm (niet alleen kleur)', (await aantal(p, '.b-lk-opt.b-lk-fout')) === 1 && /niet juist/.test(await tekstVan(p, '.b-lk-opt.b-lk-fout')));
      check('ronde 1 (fout): de uitleg zegt dat de schaduw aan de andere kant valt', /andere kant|rechtdoor|rechte lijn/.test(await fb(p)));
      await foto(p, '03-kind-02-voorspel-fout');
    }
    if (r < 2) {
      const a = await actief(p);
      check(`ronde ${r + 1}: de focus staat na het antwoord op 'Volgende ronde'`, !!a && a.tekst === 'Volgende ronde', JSON.stringify(a?.tekst));
      await p.keyboard.press('Enter');
      check(`ronde ${r + 2} van 3 begint, met de focus op de eerste letter`, (await wachtOp(p, (n) => new RegExp(`Ronde ${n} van 3`).test(document.querySelector('.b-lk-ronde')?.textContent || ''), r + 2)) && /\(letter A,/.test((await actief(p))?.tekst ?? ''));
    }
  }
  check('na ronde 3 staat "Je hebt alle drie de rondes gedaan."', /alle drie de rondes gedaan/.test(await tekstVan(p, '.b-lk-af')));
  await foto(p, '03-kind-03-voorspel-af');
  await druk(p, "'Terug naar de oefeningen' (Shift+Tab)", knopMet(/^Terug naar de oefeningen/), 'Enter', { terug: true });
  check('terug op de keuze, met de focus op de kop', (await h2(p)) === 'Kies een oefening' && (await focusOp(p, () => document.activeElement?.tagName === 'H2')));
  check("de tegel 'Waar valt de schaduw?' staat nu op 'gedaan' (twee van drie juist)", (await p.locator('.b-lk-tegel', { hasText: 'Waar valt de schaduw?' }).innerText()).includes('gedaan'));
  check('de uitkomst "wat ik al kan" staat nu al op de keuze (er is bewijs)', (await aantal(p, '.b-lk-kan')) === 1);
  console.log(`  (${juistGetal} van 3 rondes juist voorspeld)`);

  // ── Drie kaartjes: tot het licht doorkomt, recht en schuin.
  await druk(p, 'tegel "Drie kaartjes"', knopMet(/^Drie kaartjes/));
  check('de oefening Drie kaartjes opent en de kijkdoos tekent', (await h2(p)) === 'Drie kaartjes met een gaatje' && (await wachtOp(p, () => !!document.querySelector('.b-lk-kijk canvas'), undefined, 20000)));
  let k = { lamp: 2, gaten: [0, 2, 1] }; // beginStand van de app
  const gaatTekst = await p.locator('.b-lk-tabel tbody tr').evaluateAll((r) => r.map((x) => x.querySelector('td')?.textContent?.trim()));
  check('de tabel toont de beginstand: gaatje 1 midden, 2 hoog, 3 laag', gaatTekst.join(',') === 'midden,hoog,laag', gaatTekst.join(','));
  check('zolang er niets gevonden is, staat er geen terugkoppeling', (await aantal(p, '.b-lk-les .b-lk-fb')) === 0);
  const stap = async (naam, test, toets = 'Enter') => {
    await druk(p, naam, test, toets);
    // de nabootsing volgt dezelfde regels
    const m = /^Gaatje (\d)(?: \([^)]*\))? (hoger|lager)$/.exec(naam);
    if (m) {
      const i = { 1: 2, 2: 1, 3: 0 }[m[1]];
      k.gaten = k.gaten.map((g, j) => (j === i ? klem(g + (m[2] === 'hoger' ? 1 : -1), 0, 2) : g));
    } else if (naam === 'Lamp lager') k.lamp = klem(k.lamp - 1, 0, 4);
    else if (naam === 'Lamp hoger') k.lamp = klem(k.lamp + 1, 0, 4);
    await sleep(120);
  };
  const feedbackKlopt = async (omschrijving, verwachtDoor, verwachtTitel) => {
    const t = await fb(p);
    const doorOpScherm = /Er komt licht op het scherm|Ook schuin lukt het/.test(t);
    check(`${omschrijving}: de nabootsing zegt ${verwachtDoor ? 'licht komt door' : 'licht komt niet door'} en het scherm zegt dat ook`, doorOpScherm === verwachtDoor, `scherm: "${t}"`);
    if (verwachtTitel) check(`${omschrijving}: "${verwachtTitel}"`, t.includes(verwachtTitel), `scherm: "${t}"`);
  };
  // Eerst een stand die niet werkt, dan de rechte oplossing: gaatje 3 hoger (midden), gaatje 2 lager (midden).
  await stap('Gaatje 3 (bij het scherm) hoger', knopMet(/^Gaatje 3 \(bij het scherm\) hoger$/));
  check('nog niet recht: de nabootsing zegt dat het licht niet doorkomt', !lichtDoor(k));
  await stap('Gaatje 2 lager', knopMet(/^Gaatje 2 lager$/), 'Space');
  check('de nabootsing: lamp en drie gaatjes in het midden komt licht door', lichtDoor(k));
  await feedbackKlopt('recht', true, 'Er komt licht op het scherm.');
  await foto(p, '03-kind-04-kaartjes-recht');
  // Schuin: de lamp met het pijltje op de kijkdoos omlaag, dan met de knop; daarna de gaatjes mee.
  const doos = await bereik(p, 'de kijkdoos (canvas)', (i) => !!i && i.tag === 'canvas');
  if (doos) {
    await p.keyboard.press('ArrowDown');
    k.lamp = klem(k.lamp - 1, 0, 4);
    await sleep(200);
  }
  await feedbackKlopt('lamp een stand lager via het pijltje', lichtDoor(k), lichtDoor(k) ? null : 'Het licht botst tegen een kaartje.');
  await stap('Lamp lager', knopMet(/^Lamp lager$/));
  await stap('Gaatje 3 (bij het scherm) hoger', knopMet(/^Gaatje 3 \(bij het scherm\) hoger$/));
  check('nog niet schuin genoeg: de nabootsing zegt dat het licht niet doorkomt', !lichtDoor(k));
  await feedbackKlopt('lamp heel laag, gaatje 3 hoog', false, 'Het licht botst tegen een kaartje.');
  await stap('Gaatje 1 (bij de lamp) lager', knopMet(/^Gaatje 1 \(bij de lamp\) lager$/));
  check('de nabootsing: lamp heel laag en de gaatjes laag-midden-hoog liggen op één lijn', lichtDoor(k) && k.lamp === 0);
  await feedbackKlopt('schuin', true, 'Ook schuin lukt het!');
  check('de terugkoppeling heeft een vorm en een woord (icoon en tekst), niet alleen een kleur', (await aantal(p, '.b-lk-fb-ok svg')) === 1);
  await foto(p, '03-kind-05-kaartjes-schuin');
  await druk(p, "'Terug naar de oefeningen'", knopMet(/^Terug naar de oefeningen/), 'Enter', { terug: true });

  // ── Onderzoek: hypothese, lamp op 30, 15 en 10 cm, drie metingen (één met komma, één onleesbaar), conclusie, nakijken.
  await druk(p, 'tegel "Onderzoek"', knopMet(/^Onderzoek/));
  check('de oefening Onderzoek opent en de kijkdoos tekent', /^Onderzoek/.test(await h2(p)) && (await wachtOp(p, () => !!document.querySelector('.b-lk-kijk canvas'), undefined, 20000)));
  const metingen = { 30: aflezing(30), 15: aflezing(15), 10: aflezing(10) };
  console.log(`  (de nabootsing leest de meetlat af: ${JSON.stringify(metingen)} cm; echte hoogtes ${[30, 15, 10].map((c) => echteHoogteCm(c).toFixed(2)).join(', ')} cm)`);
  check('de nabootsing geeft een strikt stijgende rij bij kleinere afstand (dichter = hoger)', metingen[30] < metingen[15] && metingen[15] < metingen[10]);
  const hypo = await druk(p, 'hypothese "De schaduw wordt groter."', (i) => !!i && i.tag === 'button' && i.groep === 'lk-hyp-kop' && i.volgnr === 0, 'Space');
  check('hypothese gekozen (aria-pressed)', !!hypo && (await actief(p)).pressed === 'true');
  const lampKnop = (cm) => knopMet(new RegExp(`^Zet de lamp op ${cm} cm$`));
  const staatOp = async (cm) => (await p.evaluate((c) => [...document.querySelectorAll('.b-lk-les button')].find((b) => new RegExp(`^Zet de lamp op ${c} cm$`).test((b.textContent || '').trim()))?.getAttribute('aria-pressed'), cm)) === 'true';
  check('de lamp begint op 30 cm', await staatOp(30));
  // meting 30 cm: eerst onleesbaar
  await bereik(p, 'veld meting bij 30 cm', (i) => !!i && i.id === 'lk-meting-30');
  await p.keyboard.type('twaalf');
  check('het veld neemt de getypte tekst over', (await actief(p)).waarde === 'twaalf');
  await druk(p, "'Zet de lamp op 15 cm'", lampKnop(15));
  check('de lamp staat op 15 cm (aria-pressed)', await staatOp(15));
  await bereik(p, 'veld meting bij 15 cm', (i) => !!i && i.id === 'lk-meting-15');
  await p.keyboard.type(alsTekst(metingen[15], false));
  // Met het pijltje op de kijkdoos naar 10 cm: ArrowUp is "dichter".
  await bereik(p, 'de kijkdoos (canvas)', (i) => !!i && i.tag === 'canvas', { terug: false });
  await p.keyboard.press('ArrowUp');
  check('met het pijltje omhoog op de kijkdoos staat de lamp op 10 cm', await wachtOp(p, () => [...document.querySelectorAll('.b-lk-les button')].some((b) => /^Zet de lamp op 10 cm$/.test((b.textContent || '').trim()) && b.getAttribute('aria-pressed') === 'true'), undefined, 4000));
  await bereik(p, 'veld meting bij 10 cm', (i) => !!i && i.id === 'lk-meting-10');
  await p.keyboard.type(alsTekst(metingen[10], false));
  await druk(p, "'Mijn onderzoek nakijken'", knopMet(/^Mijn onderzoek nakijken$/));
  await wachtOp(p, () => !!document.querySelector('.b-lk-les .b-lk-fb'), undefined, 4000);
  const onleesbaar = await fb(p);
  check('een onleesbare meting ("twaalf") krijgt de zin "Typ bij 30 cm alleen een getal, zoals 12 of 12,5."', /Typ bij 30 cm alleen een getal, zoals 12 of 12,5/.test(onleesbaar), onleesbaar);
  await foto(p, '03-kind-06-onderzoek-onleesbaar');
  // herstel de meting met een komma
  await bereik(p, 'veld meting bij 30 cm', (i) => !!i && i.id === 'lk-meting-30', { terug: true });
  await p.keyboard.press('Control+A');
  await p.keyboard.type(alsTekst(metingen[30], true));
  const veld30 = (await actief(p)).waarde;
  check(`een meting met komma ("${alsTekst(metingen[30], true)}") blijft staan zoals getypt (geen type=number)`, veld30 === alsTekst(metingen[30], true), veld30);
  check('de oude terugkoppeling verdwijnt zodra het kind iets verandert', (await aantal(p, '.b-lk-les .b-lk-fb')) === 0);
  await druk(p, "'Mijn onderzoek nakijken' (nog zonder conclusie)", knopMet(/^Mijn onderzoek nakijken$/));
  await wachtOp(p, () => !!document.querySelector('.b-lk-les .b-lk-fb'), undefined, 4000);
  check('klopt de meting, maar is er nog geen conclusie: "Je metingen kloppen. Kies nu je conclusie."', /Je metingen kloppen\. Kies nu je conclusie/.test(await fb(p)), await fb(p));
  await druk(p, 'conclusie "Hoe dichter de zaklamp, hoe groter de schaduw."', (i) => !!i && i.tag === 'button' && i.groep === 'lk-con-kop' && i.volgnr === 0, 'Enter');
  await druk(p, "'Mijn onderzoek nakijken'", knopMet(/^Mijn onderzoek nakijken$/));
  const af = await wachtOp(p, () => /Je onderzoek is af/.test(document.querySelector('.b-lk-les .b-lk-fb')?.textContent || ''), undefined, 4000);
  check('"Je onderzoek is af." na juiste metingen en een juiste conclusie', af, await fb(p));
  check('de uitleg noemt de hypothese ("Je hypothese klopte.")', /Je hypothese klopte/.test(await fb(p)));
  await foto(p, '03-kind-07-onderzoek-af');
  await druk(p, "'Terug naar de oefeningen'", knopMet(/^Terug naar de oefeningen/), 'Enter', { terug: true });

  // ── De check: drie vragen. Vraag 1 juist (C), vraag 2 fout (kleiner), vraag 3 juist (A).
  await druk(p, 'tegel "De check"', knopMet(/^De check/));
  check('de check opent met de focus op de kop "De check"', (await h2(p)) === 'De check' && (await focusOp(p, () => document.activeElement?.tagName === 'H2')));
  check('de check heeft de zin "Je eerste antwoord telt."', /Je eerste antwoord telt/.test(await tekstVan(p, '.b-lk-uitleg')));
  const checkPlan = [
    { naam: 'vraag 1: C', rx: /^C: de schaduw valt rechts/, verwachtJuist: true },
    { naam: 'vraag 2: kleiner', rx: /^kleiner$/, verwachtJuist: false },
    { naam: 'vraag 3: A', rx: /^A: gaatje 1 hoog/, verwachtJuist: true },
  ];
  for (let v = 0; v < 3; v++) {
    const q = checkPlan[v];
    check(`vraag ${v + 1} van 3 staat in beeld`, new RegExp(`Vraag ${v + 1} van 3`).test(await tekstVan(p, '.b-lk-ronde')));
    await druk(p, q.naam, (i) => !!i && i.tag === 'button' && i.klasse.includes('b-lk-opt') && q.rx.test(i.tekst), v === 1 ? 'Space' : 'Enter');
    await wachtOp(p, () => document.querySelectorAll('.b-lk-les .b-lk-opt.b-lk-juist').length === 1, undefined, 4000);
    const tekst = await fb(p);
    const juistOpScherm = (await aantal(p, '.b-lk-opt.b-lk-fout')) === 0;
    check(`${q.naam}: de nabootsing zegt ${q.verwachtJuist ? 'juist' : 'fout'} en het scherm zegt dat ook`, juistOpScherm === q.verwachtJuist, `scherm: "${tekst}"`);
    const laatste = v === 2;
    const a = await actief(p);
    check(`${q.naam}: de focus staat na het antwoord op '${laatste ? 'Klaar' : 'Volgende vraag'}'`, !!a && a.tekst === (laatste ? 'Klaar' : 'Volgende vraag'), a?.tekst);
    if (v === 1) await foto(p, '03-kind-08-check-fout');
    await p.keyboard.press('Enter');
    if (!laatste) check(`vraag ${v + 2}: de focus gaat naar de vraag`, await focusOp(p, () => document.activeElement?.id === 'lk-check-vraag'));
  }

  // ── Wat ik al kan.
  check("'Wat ik al kan' opent met de focus op de kop", (await h2(p)) === 'Wat ik al kan' && (await focusOp(p, () => document.activeElement?.tagName === 'H2' && /Wat ik al kan/.test(document.activeElement.textContent || ''))));
  const rijen = await p.locator('.b-lk-kan-rij').evaluateAll((l) => l.map((r) => ({ doel: r.getAttribute('data-doel'), kind: r.querySelector('.b-lk-kan-doel')?.textContent?.trim(), woord: r.querySelector('.b-lk-st')?.textContent?.trim() })));
  const WOORDEN = ['toont het', 'nog wankel', 'nog niet', 'nog geen bewijs'];
  console.log(`  (wat ik al kan: ${rijen.map((r) => `${r.doel}: ${r.woord}`).join('; ')})`);
  check('per doel een woord: drie doelen, elk met een van de vier woorden', rijen.length === 3 && rijen.every((r) => WOORDEN.includes(r.woord || '')), JSON.stringify(rijen));
  check('elk doel heeft een zin in kindertaal', rijen.length === 3 && rijen.every((r) => (r.kind || '').length > 10));
  check('na de hele les heeft elk doel bewijs (geen "nog geen bewijs")', rijen.length === 3 && rijen.every((r) => r.woord !== 'nog geen bewijs'), JSON.stringify(rijen.map((r) => r.woord)));
  check('de vorm van elk woord staat in css (een klasse b-lk-st-<vorm>), zodat het niet alleen een kleur is', (await aantal(p, '.b-lk-kan-rij .b-lk-st[class*="b-lk-st-"]')) === 3);
  await foto(p, '03-kind-09-wat-ik-al-kan');

  // ── 4. Opslag: localStorage byte-gelijk aan ervoor.
  const na = await opslag(p);
  kop('4. Opslag na de volledige les (kindscherm)');
  check('na de volledige les is localStorage byte-gelijk aan ervoor (kindscherm)', na.lokaal === voor.lokaal, `${voor.lokaal} -> ${na.lokaal}`);
  console.log(`  (sessionStorage na de les, bedoeld als spiegel voor herladen: ${na.sessie.slice(0, 140)})`);
  check('de sessionStorage bevat geen namen: alleen de ene sleutel van de les', JSON.parse(na.sessie).every(([s]) => s === 'wf.basis.lichtkamer.les.v1'));
  // Herladen tijdens de les kost niets: 'Wat ik al kan' blijft gevuld.
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.b-lk-les h2');
  check('na herladen staat het bewijs er nog (sessionStorage), de keuze toont "Wat ik al kan"', (await aantal(p, '.b-lk-kan')) === 1 && !/nog geen bewijs/.test(await tekstVan(p, '.b-lk-kan-rij')));
  check('na herladen is localStorage nog steeds gelijk', (await opslag(p)).lokaal === voor.lokaal);
  await ctx.close();
}

// ───────────────────────────────────────── 5. het bord ─────────────────────────────────────────

async function bord(browser) {
  kop('5. Het bord');
  const ctx = await maakCtx(browser, 1600, 900);
  const p = await pagina(ctx, '5-bord');
  await p.goto(BORD, { waitUntil: 'networkidle' });
  await p.waitForSelector('.b-lk-les h2');
  await p.waitForSelector(WACHT_OP_DOOS);
  const voor = await opslag(p);
  check('het bord zet html[data-bord]', await p.evaluate(() => document.documentElement.hasAttribute('data-bord')));
  check('het bord opent op de eerste oefening "Waar valt de schaduw?"', (await h2(p)) === 'Waar valt de schaduw?');

  // Geen naam, geen opslag, voor elke oefening.
  const naamLeeg = async (naam) => {
    const inv = await p.evaluate(() =>
      [...document.querySelectorAll('input, textarea, select')].map((e) => ({ id: e.id, naam: e.getAttribute('name') || '', auto: e.getAttribute('autocomplete') || '', label: (document.querySelector(`label[for="${e.id}"]`)?.textContent || e.getAttribute('aria-label') || '').trim() })),
    );
    const naamvelden = inv.filter((i) => /naam|name|voornaam|klas|code/i.test(`${i.id} ${i.naam} ${i.label}`) || /name/.test(i.auto));
    check(`bord ${naam}: geen naamveld en geen invoerveld voor een naam`, naamvelden.length === 0, JSON.stringify(naamvelden));
    const knoppen = await p.locator('button').evaluateAll((l) => l.map((b) => (b.textContent || '').trim()));
    check(`bord ${naam}: geen opslagknop (opslaan, bewaren, naam)`, knoppen.every((t) => !/opslaan|bewaar|bewaren|mijn naam|naam/i.test(t)), knoppen.filter((t) => /opslaan|bewaar|naam/i.test(t)).join(', '));
    return inv;
  };
  const inv1 = await naamLeeg('Waar valt de schaduw?');
  check('bord Waar valt de schaduw?: helemaal geen invoerveld', inv1.length === 0);
  await foto(p, '05-bord-01-voorspel');

  // De klasvraag: opent met het toetsenbord, vangt de focus, Escape sluit en geeft de focus terug.
  await druk(p, "'Klasvraag'", knopMet(/^Klasvraag$/));
  check('de klasvraag opent als dialoog (role=dialog, aria-modal)', await wachtOp(p, () => document.querySelector('[role=dialog][aria-modal=true]') !== null, undefined, 4000));
  check('de focus staat in de dialoog', (await actief(p))?.indialoog === true);
  let binnen = true;
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press('Tab');
    binnen = binnen && (await actief(p))?.indialoog === true;
  }
  check('de focus blijft in de dialoog bij Tab (focusval, 9 keer)', binnen);
  binnen = true;
  for (let i = 0; i < 5; i++) {
    await p.keyboard.press('Shift+Tab');
    binnen = binnen && (await actief(p))?.indialoog === true;
  }
  check('de focus blijft in de dialoog bij Shift+Tab (5 keer)', binnen);
  await foto(p, '05-bord-02-klasvraag');
  await p.keyboard.press('Escape');
  check('Escape sluit de klasvraag', await wachtOp(p, () => document.querySelector('[role=dialog]') === null, undefined, 4000));
  const terug = await actief(p);
  check("na Escape staat de focus weer op 'Klasvraag'", !!terug && terug.tag === 'button' && /^Klasvraag$/.test(terug.tekst), JSON.stringify(terug?.tekst));

  // PageDown en PageUp, ook met de focus op een knop.
  const volgorde = ['Waar valt de schaduw?', 'Drie kaartjes met een gaatje', 'Onderzoek: lamp dichterbij, schaduw groter?'];
  const naarHuidigeKnop = async () => bereik(p, "een knop (Van voor)", knopMet(/^Van voor$/));
  const wisselVan = async (toets, verwacht, naam) => {
    await naarHuidigeKnop();
    const focusSoort = (await actief(p))?.tag;
    await p.keyboard.press(toets);
    const ok = await wachtOp(p, (t) => (document.querySelector('.b-lk-les h2')?.textContent || '').trim() === t, verwacht, 4000);
    check(`${toets} met de focus op een ${focusSoort}-knop: ${naam}`, ok, await h2(p));
  };
  await wisselVan('PageDown', volgorde[1], 'naar Drie kaartjes');
  check('de klasvraag-knop staat ook bij Drie kaartjes', (await aantal(p, 'button:has-text("Klasvraag")')) === 1);
  await foto(p, '05-bord-03-kaartjes');
  const inv2 = await naamLeeg('Drie kaartjes');
  check('bord Drie kaartjes: geen invoerveld', inv2.length === 0);
  await wisselVan('PageDown', volgorde[2], 'naar Onderzoek');
  const inv3 = await naamLeeg('Onderzoek');
  check('bord Onderzoek: alleen de drie metingvelden (lk-meting-N), geen naam', inv3.every((i) => /^lk-meting-\d+$/.test(i.id)), JSON.stringify(inv3.map((i) => i.id)));
  check('bord Onderzoek: geen klasvraag-knop (die hoort er niet)', (await aantal(p, 'button:has-text("Klasvraag")')) === 0);
  await foto(p, '05-bord-04-onderzoek');
  await wisselVan('PageDown', volgorde[0], 'rond naar Waar valt de schaduw? (na de laatste komt de eerste)');
  await wisselVan('PageUp', volgorde[2], 'rond terug naar Onderzoek');
  await wisselVan('PageUp', volgorde[1], 'naar Drie kaartjes');

  // In een invoerveld doet PageDown niets (het kind of de leerkracht typt een getal).
  await wisselVan('PageDown', volgorde[2], 'naar Onderzoek (opnieuw)');
  await bereik(p, 'veld meting bij 30 cm', (i) => !!i && i.id === 'lk-meting-30');
  await p.keyboard.press('PageDown');
  await sleep(250);
  check('PageDown in een invoerveld wisselt niet van oefening', (await h2(p)).startsWith('Onderzoek'));

  // Spatie toont de uitkomst als geen knop de focus heeft.
  await openVers(p, BORD);
  await p.waitForSelector(WACHT_OP_DOOS);
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  check('vóór de spatie heeft niets de focus en is er geen uitkomst', (await actief(p)) === null && (await aantal(p, '.b-lk-opt.b-lk-juist')) === 0);
  await p.keyboard.press('Space');
  check('spatie zonder gefocuste knop toont de uitkomst (de juiste letter)', await wachtOp(p, () => document.querySelectorAll('.b-lk-les .b-lk-opt.b-lk-juist').length === 1, undefined, 4000));
  check("na de spatie is 'Toon de uitkomst' uitgeschakeld", (await p.getByRole('button', { name: 'Toon de uitkomst' }).isDisabled()));
  await foto(p, '05-bord-05-uitkomst');
  // Spatie met de focus op een knop doet de knop, niet de uitkomst.
  await openVers(p, BORD);
  await p.waitForSelector(WACHT_OP_DOOS);
  await druk(p, "'Van voor'", knopMet(/^Van voor$/), 'Space');
  await sleep(250);
  check('spatie met de focus op een knop toont de uitkomst niet (de knop doet zijn eigen werk)', (await aantal(p, '.b-lk-opt.b-lk-juist')) === 0);

  // Niets bewaard.
  const na = await opslag(p);
  check('na de bordproef is localStorage byte-gelijk aan ervoor', na.lokaal === voor.lokaal, `${voor.lokaal} -> ${na.lokaal}`);
  check('het bord schrijft niets in sessionStorage', na.sessie === '[]' && voor.sessie === '[]', `${voor.sessie} -> ${na.sessie}`);

  // data-bord verdwijnt bij het verlaten (link naar de lespagina, en een gewone navigatie).
  await p.getByRole('link', { name: /Terug naar de lespagina/ }).click();
  await p.waitForSelector('.b-lkp');
  check("'Terug naar de lespagina' brengt je op de lespagina en haalt html[data-bord] weg", !(await p.evaluate(() => document.documentElement.hasAttribute('data-bord'))) && /#\/basis\/pakket\/lichtkamer\/einde-4de/.test(p.url()), p.url());
  await openVers(p, BORD);
  await p.waitForSelector('.b-lk-les h2');
  check('opnieuw op het bord: data-bord staat er weer', await p.evaluate(() => document.documentElement.hasAttribute('data-bord')));
  await p.evaluate(() => { location.hash = '#/basis'; });
  await p.waitForSelector('.b-tegel');
  check('weg van het bord (naar #/basis): data-bord is weg', !(await p.evaluate(() => document.documentElement.hasAttribute('data-bord'))));
  await p.close();
  await ctx.close();
}

// ───────────────────────────────────────── 6. contextverlies ─────────────────────────────────────────

async function contextverlies(browser) {
  kop('6. Nagebootst contextverlies');
  const ctx = await maakCtx(browser, 1280, 900);
  const p = await pagina(ctx, '6-contextverlies');
  await p.goto(`${KIND}?scherm=drie-kaartjes`, { waitUntil: 'networkidle' });
  await p.waitForSelector(WACHT_OP_DOOS);
  await sleep(500);
  const verloren = await p.evaluate(() => {
    const c = document.querySelector('.b-lk-kijk canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    return true;
  });
  check('de proef kan de WebGL-context laten wegvallen (WEBGL_lose_context)', verloren);
  const melding = await wachtOp(p, () => !!document.querySelector('.b-lk-melding[role=alert] button'), undefined, 8000);
  check("contextverlies geeft een melding met de knop 'Tik om de kijkdoos opnieuw te laden'", melding && /Tik om de kijkdoos opnieuw te laden/.test(await tekstVan(p, '.b-lk-melding button')));
  await foto(p, '06-contextverlies');
  check('de melding zegt niets over WebGL of technische termen', !/webgl|context|renderer/i.test(await tekstVan(p, '.b-lk-melding')), await tekstVan(p, '.b-lk-melding'));
  // De rest van de les werkt nog: de gaatjes verzetten kan.
  check('tijdens het contextverlies blijft het paneel bruikbaar (de gaatjes-tabel staat er)', (await aantal(p, '.b-lk-tabel button')) === 6);
  await p.locator('.b-lk-melding button').click();
  const hersteld = await wachtOp(p, () => !!document.querySelector('.b-lk-kijk canvas') && !document.querySelector('.b-lk-melding'), undefined, 20000);
  check('een tik op de knop herstelt de kijkdoos: een nieuw canvas, de melding is weg', hersteld);
  const leeft = await p.evaluate(() => {
    const c = document.querySelector('.b-lk-kijk canvas');
    const gl = c?.getContext('webgl2') || c?.getContext('webgl');
    return !!gl && !gl.isContextLost();
  });
  check('de nieuwe WebGL-context leeft', leeft);
  check('er staat precies één canvas in de kijkdoos', (await aantal(p, '.b-lk-kijk canvas')) === 1);
  await p.close();
  await ctx.close();
}

// ───────────────────────────────────────── 7. geen lek bij herhaald openen ─────────────────────────────────────────

const LEK_INIT = `(() => {
  const oud = HTMLCanvasElement.prototype.getContext;
  window.__gl = [];
  HTMLCanvasElement.prototype.getContext = function (t, ...r) {
    const c = oud.call(this, t, ...r);
    if (c && /webgl/.test(String(t)) && !window.__gl.some((x) => x === c)) window.__gl.push(c);
    return c;
  };
  const tellers = { window: new Set(), document: new Set() };
  const ids = new WeakMap(); let n = 0;
  const id = (f) => { if (!ids.has(f)) ids.set(f, ++n); return ids.get(f); };
  const sleutel = (type, f, o) => type + '|' + id(f) + '|' + (typeof o === 'boolean' ? o : !!(o && o.capture));
  const naam = (t) => (t === window ? 'window' : t === document ? 'document' : null);
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, f, o) { const k = naam(this); if (k && f) tellers[k].add(sleutel(type, f, o)); return add.call(this, type, f, o); };
  EventTarget.prototype.removeEventListener = function (type, f, o) { const k = naam(this); if (k && f) tellers[k].delete(sleutel(type, f, o)); return rem.call(this, type, f, o); };
  window.__lek = () => ({ levend: window.__gl.filter((g) => !g.isContextLost()).length, totaal: window.__gl.length, window: tellers.window.size, document: tellers.document.size, canvassen: document.querySelectorAll('canvas').length });
})();`;

async function lek(browser) {
  kop('7. Tien keer openen en verlaten: geen lek van contexten of luisteraars');
  const ctx = await maakCtx(browser, 1280, 900, { init: LEK_INIT });
  const p = await pagina(ctx, '7-lek');
  await p.goto(`${BASE}/#/basis`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.b-tegel');
  const naarHash = (h) => p.evaluate((x) => { location.hash = x; }, h);
  const open = [];
  const weg = [];
  let maxLevend = 0;
  for (let i = 0; i < 10; i++) {
    await naarHash('#/basis/oefen/lichtkamer/einde-4de?scherm=drie-kaartjes');
    await p.waitForSelector(WACHT_OP_DOOS);
    await sleep(250);
    const o = await p.evaluate(() => window.__lek());
    open.push(o);
    maxLevend = Math.max(maxLevend, o.levend);
    await naarHash('#/basis');
    await p.waitForSelector('.b-tegel');
    await wachtOp(p, () => window.__lek().levend === 0 && window.__lek().canvassen === 0, undefined, 4000);
    weg.push(await p.evaluate(() => window.__lek()));
  }
  console.log(`  (open: levend ${open.map((o) => o.levend).join(',')}; luisteraars window ${open.map((o) => o.window).join(',')}, document ${open.map((o) => o.document).join(',')})`);
  console.log(`  (weg: levend ${weg.map((o) => o.levend).join(',')}; luisteraars window ${weg.map((o) => o.window).join(',')}, document ${weg.map((o) => o.document).join(',')}; contexten gemaakt in totaal ${weg[9].totaal})`);
  check('terwijl het scherm open is, leeft hoogstens één WebGL-context (10 keer)', maxLevend <= 1, `hoogste ${maxLevend}`);
  check('na het verlaten leeft er geen enkele WebGL-context meer (10 keer)', weg.every((o) => o.levend === 0), weg.map((o) => o.levend).join(','));
  check('na het verlaten staat er geen canvas meer in de pagina', weg.every((o) => o.canvassen === 0));
  check("geen groeiend aantal luisteraars op window (open: de laatste is niet groter dan de tweede)", open[9].window <= open[1].window, `${open[1].window} -> ${open[9].window}`);
  check('geen groeiend aantal luisteraars op document (open)', open[9].document <= open[1].document, `${open[1].document} -> ${open[9].document}`);
  check('geen groeiend aantal luisteraars op window en document na het verlaten', weg[9].window <= weg[1].window && weg[9].document <= weg[1].document, `window ${weg[1].window} -> ${weg[9].window}, document ${weg[1].document} -> ${weg[9].document}`);
  check('het aantal luisteraars na het verlaten is niet hoger dan voor het eerste openen (op een kleine marge na)', weg[9].window <= weg[0].window && weg[9].document <= weg[0].document);

  // Haastig: openen en meteen weer verlaten, voor de kijkdoos klaar is (de 3D laadt nog).
  const eerder = errors.length;
  for (let i = 0; i < 5; i++) {
    await naarHash('#/basis/oefen/lichtkamer/einde-4de?scherm=onderzoek-schaduw');
    await p.waitForSelector('.b-lk-les h2');
    await naarHash('#/basis');
    await p.waitForSelector('.b-tegel');
  }
  await sleep(1500);
  const na = await p.evaluate(() => window.__lek());
  check('haastig 5 keer openen en meteen verlaten: daarna leeft geen WebGL-context en staat er geen canvas', na.levend === 0 && na.canvassen === 0, JSON.stringify(na));
  check('haastig openen en verlaten geeft geen console- of paginafout', errors.length === eerder, errors.slice(eerder).join(' | '));
  // Wissel tussen de oefeningen binnen één scherm (bord): ook daar blijft het bij één context.
  await naarHash('#/basis/bord/lichtkamer/einde-4de');
  await p.waitForSelector(WACHT_OP_DOOS);
  for (const toets of ['PageDown', 'PageDown', 'PageDown', 'PageUp']) {
    await p.keyboard.press(toets);
    await sleep(250);
  }
  await sleep(600);
  const bordLek = await p.evaluate(() => window.__lek());
  check('op het bord: na vier keer wisselen van oefening leeft hoogstens één WebGL-context', bordLek.levend <= 1 && bordLek.canvassen <= 1, JSON.stringify(bordLek));
  await naarHash('#/basis');
  await p.waitForSelector('.b-tegel');
  await wachtOp(p, () => window.__lek().levend === 0, undefined, 4000);
  check('weg van het bord: geen levende WebGL-context', (await p.evaluate(() => window.__lek().levend)) === 0);
  await p.close();
  await ctx.close();
}

// ───────────────────────────────────────── 8. zonder WebGL ─────────────────────────────────────────

const GEEN_GL_INIT = `(() => {
  const oud = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) {
    if (/webgl/.test(String(t))) return null;
    return oud.call(this, t, ...r);
  };
})();`;

async function zonderWebGL(browser) {
  kop('8. Zonder WebGL: melding in kindertaal, three niet opgehaald, check en "Wat ik al kan" werken');
  const ctx = await maakCtx(browser, 1280, 900, { init: GEEN_GL_INIT });
  const p = await pagina(ctx, '8-geen-webgl');
  const alsKleinGeheel = (u) => /\/(three|kijkdoos3d)-[^/]*\.js/.test(u);
  for (const [param, titel] of [['drie-kaartjes', 'Drie kaartjes met een gaatje'], ['waar-valt-de-schaduw', 'Waar valt de schaduw?'], ['onderzoek-schaduw', 'Onderzoek']]) {
    await openVers(p, `${KIND}?scherm=${param}`);
    await p.waitForSelector('.b-lk-les h2');
    check(`${titel}: het scherm opent echt op deze oefening`, (await h2(p)).startsWith(titel.split(':')[0]), await h2(p));
    const melding = await wachtOp(p, () => !!document.querySelector('.b-lk-melding'), undefined, 6000);
    const tekst = await tekstVan(p, '.b-lk-melding');
    check(`${titel}: zonder WebGL staat er een melding in de kijkdoos`, melding && tekst.length > 20, tekst);
    check(`${titel}: de melding noemt WebGL niet en gebruikt kindertaal (juf of meester)`, !/webgl|context|renderer|three/i.test(tekst) && /juf of meester/.test(tekst), tekst);
    check(`${titel}: de oefening zegt dat de kijkdoos nodig is en wijst naar de check`, /kijkdoos nodig/.test(await fb(p)) && (await aantal(p, '.b-lk-paneel button:has-text("Naar de check")')) === 1, await fb(p));
    check(`${titel}: er staat geen canvas`, (await aantal(p, 'canvas')) === 0);
    check(`${titel}: zonder kijkdoos staan er geen dode knoppen (Van voor, Schuin, Lamp, Lichtstralen) onder het lege vak`, (await aantal(p, '.b-lk-balk button')) === 0, `${await aantal(p, '.b-lk-balk button')} knoppen doen niets`);
  }
  await foto(p, '08-geen-webgl-oefening');
  check('zonder WebGL is three-*.js en kijkdoos3d-*.js niet opgehaald', !p.__fetches.some(alsKleinGeheel), p.__fetches.filter(alsKleinGeheel).join(', '));
  // Van de melding naar de check, en door de check heen (met de muis: het toetsenbord is al in 3 bewezen).
  await openVers(p, `${KIND}?scherm=drie-kaartjes`);
  await p.waitForSelector('.b-lk-melding');
  await p.getByRole('button', { name: 'Naar de check' }).click();
  await p.waitForSelector('.b-lk-check');
  check("'Naar de check' opent de check", (await h2(p)) === 'De check');
  for (const rx of [/^C: de schaduw valt rechts/, /^groter$/, /^A: gaatje 1 hoog/]) {
    await p.getByRole('button', { name: rx }).click();
    await p.getByRole('button', { name: /^(Volgende vraag|Klaar)$/ }).click();
  }
  await p.waitForSelector('.b-lk-kan');
  const rijen = await p.locator('.b-lk-kan-rij .b-lk-st').allTextContents();
  // De check dekt alleen doel 92767 (4c1 tot 4c3); de andere twee doelen krijgen hun bewijs uit de oefeningen, en die hebben
  // de kijkdoos nodig. Zonder WebGL staan ze dus (terecht) op 'nog geen bewijs'.
  const woorden = rijen.map((w) => w.trim());
  check("zonder WebGL werkt de check tot en met 'Wat ik al kan': drie doelen, het eerste (de check) op 'toont het'", woorden.length === 3 && woorden[0] === 'toont het', JSON.stringify(woorden));
  console.log(`  (zonder WebGL staan de andere twee doelen op: ${woorden.slice(1).join(', ')}: hun bewijs komt alleen uit de oefeningen met de kijkdoos)`);
  await foto(p, '08-geen-webgl-wat-ik-al-kan');
  check('zonder WebGL staat er een knop om terug te gaan naar de oefeningen', (await aantal(p, 'button:has-text("Kies een oefening")')) === 1);
  check('na de hele proef zonder WebGL is three nog steeds niet opgehaald', !p.__fetches.some(alsKleinGeheel));
  await p.close();
  await ctx.close();
}

// ───────────────────────────────────────── 9. three alleen waar het hoort ─────────────────────────────────────────

async function alleenWaarHetHoort(browser) {
  kop('9. three en kijkdoos3d worden alleen opgehaald waar het hoort');
  const ctx = await maakCtx(browser, 1280, 900, { tijd: KLOK });
  const drie = (u) => /\/(three|kijkdoos3d)-[^/]*\.js/.test(u);
  for (const [naam, url, wacht] of [
    ['de startpagina van de app (#/)', `${BASE}/#/`, 'main'],
    ['#/basis', `${BASE}/#/basis`, '.b-tegel'],
    ['#/basis/go', `${BASE}/#/basis/go`, 'main h1'],
    ['de lespagina (vóór Uitproberen)', LES, '.b-lkp'],
  ]) {
    const p = await pagina(ctx, `9-${naam}`);
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.waitForSelector(wacht);
    await sleep(800);
    const gevonden = p.__fetches.filter(drie);
    check(`${naam}: geen three-*.js of kijkdoos3d-*.js opgehaald`, gevonden.length === 0, gevonden.join(', '));
    await p.close();
  }
  // Het kind en het bord halen ze wel op.
  for (const [naam, url] of [['het bord', `${BORD}?scherm=drie-kaartjes`], ['het kindscherm (Drie kaartjes)', `${KIND}?scherm=drie-kaartjes`]]) {
    const p = await pagina(ctx, `9-${naam}`);
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.waitForSelector(WACHT_OP_DOOS);
    check(`${naam}: three-*.js en kijkdoos3d-*.js zijn opgehaald (de kijkdoos tekent)`, p.__fetches.some((u) => /\/three-[^/]*\.js/.test(u)) && p.__fetches.some((u) => /\/kijkdoos3d-[^/]*\.js/.test(u)));
    await p.close();
  }
  // Het kindscherm op de keuze (zonder oefening te openen): nog geen three.
  const p = await pagina(ctx, '9-kindkeuze');
  await p.goto(KIND, { waitUntil: 'networkidle' });
  await p.waitForSelector('.b-lk-les h2');
  await sleep(500);
  check('het kindscherm op de keuze haalt three nog niet op (pas bij een oefening)', !p.__fetches.some(drie), p.__fetches.filter(drie).join(', '));
  await p.close();
  await ctx.close();
}

// ───────────────────────────────────────────── uitvoeren ─────────────────────────────────────────────

const start = Date.now();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
try {
  console.log('Lichtkamer: schaduwtheater');
  const sectie = async (naam, fn) => {
    const t = Date.now();
    try {
      await fn(browser);
    } catch (e) {
      failures++;
      console.log(`  ✗ FAIL: de sectie "${naam}" stopte met een uitzondering: ${String(e.message).split('\n')[0]}`);
      errors.push(`sectie ${naam}: ${String(e.stack || e).split('\n').slice(0, 3).join(' / ')}`);
    }
    console.log(`  (${naam}: ${((Date.now() - t) / 1000).toFixed(1)} s)`);
  };
  await sectie('schermen', schermen);
  await sectie('leerkracht', leerkracht);
  await sectie('kind', kindToetsenbord);
  await sectie('bord', bord);
  await sectie('contextverlies', contextverlies);
  await sectie('lek', lek);
  await sectie('zonder webgl', zonderWebGL);
  await sectie('three alleen waar het hoort', alleenWaarHetHoort);
} finally {
  await browser.close();
}
const duur = ((Date.now() - start) / 1000).toFixed(1);

if (errors.length) {
  console.log(`\n${errors.length} console-/paginafout(en):`);
  for (const e of errors) console.log(`  - ${e}`);
}
if (bekendeFouten.length) {
  console.log(`\n${bekendeFouten.length} BEKENDE fout(en) in de app (gemeld, laten de test niet falen):`);
  for (const b of bekendeFouten) console.log(`  ~ ${b}`);
}
console.log(`\n${checks} checks. Duur: ${duur} s. Schermafbeeldingen: ${FOTO}`);
console.log(failures || errors.length ? `\n${failures} check(s) mislukt, ${errors.length} fout(en).` : `\nAlle checks van de Lichtkamer zijn groen${bekendeFouten.length ? ` (op ${bekendeFouten.length} bekende fout(en) na)` : ''}.`);
process.exit(failures || errors.length ? 1 : 0);
