// Safari en iPadOS 14.1 nagebootst in Chromium (de ondergrens van Boosterz, zie vite.config.ts en CLAUDE.md).
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/safari14.mjs
//
// Zo bootst dit Safari 14.1 na (zoals de parser en de CSSOM van Safari doen):
//  - css-declaraties die Safari 14.1 niet kent worden weggelaten (aspect-ratio, color-mix(), overflow-wrap: anywhere),
//    selectors met :focus-visible en :has() vallen weg, en inline stijlen met zulke waarden worden genegeerd;
//  - @supports not (aspect-ratio: 1) en @supports not (color: color-mix(…)) gelden, en CSS.supports('aspect-ratio') is false;
//  - color-mix() wordt niet weggelaten maar hernoemd naar de onbekende functie colr-mix(): Safari 14 aanvaardt een
//    declaratie met var() bij het inlezen en maakt ze pas bij het berekenen 'unset' (invalid at computed-value time),
//    zodat een gewone declaratie ervoor niets redt. Chromium doet met colr-mix() hetzelfde;
//  - Array.prototype.at, Object.hasOwn, structuredClone en String.prototype.isWellFormed bestaan niet, zodat de app de
//    oude pdf-worker kiest (de detectie vraagt naar isWellFormed, zonder eval, want de CSP laat geen eval toe).
// Daarna volgt een korte doorloop zonder nabootsing, met de echte CSP: daar moet de gewone worker starten.
// Wat Chromium niet kan tonen (andere API-gaten) blijft een proef op een echte iPad met iPadOS 14.
// Faalt hard (exit 1) bij een mislukte check.

import { chromium } from 'playwright-core';
import postcss from 'postcss';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name} ${detail}`); failures++; }
}

/** De css zoals Safari 14.1 ze leest. */
function s14css(tekst) {
  const root = postcss.parse(tekst);
  root.walkAtRules('supports', (a) => {
    if (/^not\s*\(\s*(aspect-ratio|color:\s*color-mix|color:\s*oklch)/.test(a.params.trim())) a.replaceWith(a.nodes);
  });
  root.walkRules((r) => { if (/:focus-visible|:has\(/.test(r.selector)) r.remove(); });
  root.walkDecls((d) => {
    const v = d.value;
    if (d.prop === 'aspect-ratio') d.remove();
    else if (/color-mix\(/.test(v)) d.value = v.replace(/color-mix\(/g, 'colr-mix(');
    else if (/oklch\(|\d(dvh|svh|lvh)\b/.test(v)) d.remove();
    else if ((d.prop === 'overflow-wrap' || d.prop === 'word-wrap') && v.trim() === 'anywhere') d.remove();
    else if (d.prop === 'accent-color') d.remove();
  });
  return root.toString();
}

const INIT = `(() => {
  const hernoem = (v) => (typeof v === 'string' ? v.replace(/color-mix\\(/g, 'colr-mix(') : v);
  const bad = (prop, v) => {
    const s = String(v);
    if (prop === 'aspectRatio' || prop === 'aspect-ratio') return true;
    if ((prop === 'overflowWrap' || prop === 'overflow-wrap' || prop === 'wordWrap' || prop === 'word-wrap') && s.trim() === 'anywhere') return true;
    return prop === 'accentColor' || prop === 'accent-color';
  };
  const cache = new WeakMap();
  for (const C of [HTMLElement, SVGElement]) {
    const d = Object.getOwnPropertyDescriptor(C.prototype, 'style');
    if (!d) continue;
    Object.defineProperty(C.prototype, 'style', {
      configurable: true, enumerable: d.enumerable, set: d.set,
      get() {
        const real = d.get.call(this);
        let px = cache.get(real);
        if (!px) {
          px = new Proxy(real, {
            get(t, k) { const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v; },
            set(t, k, v) { if (typeof k === 'string' && bad(k, v)) return true; t[k] = hernoem(v); return true; },
          });
          cache.set(real, px);
        }
        return px;
      },
    });
  }
  const sp = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (p, v, pr) { if (bad(p, v)) return; return sp.call(this, p, hernoem(v), pr); };
  const cs = CSS.supports.bind(CSS);
  CSS.supports = (a, b) => (b !== undefined ? !(String(a) === 'aspect-ratio') && !/color-mix\\(/.test(String(b)) && cs(a, b) : !/aspect-ratio|color-mix/.test(String(a)) && cs(a));
  // geen at(), hasOwn, structuredClone en isWellFormed: de app kiest dan de oude pdf-worker
  delete Array.prototype.at; delete String.prototype.at; delete Object.getPrototypeOf(Uint8Array.prototype).at;
  delete Object.hasOwn; delete window.structuredClone; delete String.prototype.isWellFormed;
})();`;

function kleinePdf() {
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  const body = 'BT /F1 24 Tf 72 770 Td (Markeer mij: de hoofdtitel) Tj ET';
  objs.push(`<</Length ${body.length}>>stream\n${body}\nendstream`);
  let uit = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(uit.length); uit += `${i + 1} 0 obj${o}endobj\n`; });
  const xref = uit.length;
  uit += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) uit += `${String(off).padStart(10, '0')} 00000 n \n`;
  return `${uit}trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
}

/** Zet een pdf in een cursusblok van de eerste cursus (draait in de pagina) en geeft de cursuscode terug. */
async function zaaiPdf(pdfTekst) {
  const blob = new Blob([pdfTekst], { type: 'application/pdf' });
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('wf-files', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('pdfs')) req.result.createObjectStore('pdfs', { keyPath: 'id' }); };
    req.onsuccess = () => {
      const t = req.result.transaction('pdfs', 'readwrite');
      t.objectStore('pdfs').put({ id: 's14pdf', name: 'sim.pdf', blob, size: blob.size, createdAt: 1 });
      t.oncomplete = () => resolve(null); t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
  const cs = JSON.parse(localStorage.getItem('wf.courses.v1'));
  cs[0].chapters[0].sections[0].blocks.unshift({ id: 's14pdfblok', type: 'pdf', pdfId: 's14pdf', name: 'sim.pdf', height: 420 });
  localStorage.setItem('wf.courses.v1', JSON.stringify(cs));
  return cs[0].code;
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
await ctx.addInitScript(INIT);
await ctx.route('**/*.css', async (route) => {
  const resp = await route.fetch();
  await route.fulfill({ response: resp, body: s14css(await resp.text()), headers: { ...resp.headers(), 'content-type': 'text/css' } });
});
const page = await ctx.newPage();
const fouten = [];
const opgehaald = [];
page.on('request', (r) => opgehaald.push(r.url()));
page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID|Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text().slice(0, 200)}`); });

await page.goto(`${BASE}/#/widgets`, { waitUntil: 'networkidle' });
await sleep(400);
const codes = await page.evaluate(async (pdfTekst) => {
  const kader = (kleur) => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = kleur; g.fillRect(0, 0, 400, 300);
    return c.toDataURL();
  };
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const basis = ws.find((w) => w.type === 'memory');
  const quiz = ws.find((w) => w.type === 'quiz');
  const nieuw = (id, code, type, config) => ws.push({ ...basis, id, code, type, title: id, config });
  nieuw('s14_mm', 'S14MMD', 'mindmap', { root: 'Water', outline: 'Toestanden\n  vast\nKringloop', studentEditable: false });
  nieuw('s14_med', 'S14MED', 'mediaplayer', { provider: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'v' });
  nieuw('s14_jig', 'S14JIG', 'jigsaw', { imageUrl: kader('#c33'), cols: 3, rows: 3 });
  nieuw('s14_iv', 'S14IVW', 'imageviewer', { imageUrl: kader('#3a6'), description: 'viewer' });
  ws.push({
    ...quiz, id: 's14_lang', code: 'S14LNG', title: 'Lang',
    config: { ...quiz.config, layout: 'single', questions: [{ id: 'q1', type: 'mc', points: 1, prompt: 'Open https://example.org/een/heel/lang/pad/zonder/spaties/erin/om/te/testen/nog/langer en antwoord.', options: ['a', 'b'], correctIndex: 0 }] },
  });
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  return { memory: basis.code, woordzoeker: ws.find((w) => w.type === 'wordsearch')?.code };
}, kleinePdf());
codes.cursus = await page.evaluate(zaaiPdf, kleinePdf());

const speel = async (code) => {
  await page.goto(`${BASE}/#/speel/${code}`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  if (await page.locator('#student-name').isVisible().catch(() => false)) {
    await page.fill('#student-name', 'T');
    await page.getByRole('button', { name: /Starten/ }).click();
    await sleep(700);
  }
};
const maat = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }, sel);

console.log('Safari 14.1 nagebootst');
check('de nabootsing werkt: aspect-ratio ontbreekt', await page.evaluate(() => !CSS.supports('aspect-ratio', '1')));

await speel(codes.memory);
const kaart = await maat('.memory-card');
check('memorykaart is hoger dan 0', !!kaart && kaart.h > 20, JSON.stringify(kaart));
const voorkant = await page.evaluate(() => getComputedStyle(document.querySelector('.memory-face.front')).backgroundColor);
check('memorykaart heeft een voorkant in de accentkleur (niet transparant)', voorkant !== 'rgba(0, 0, 0, 0)' && voorkant !== 'transparent', voorkant);
const topbar = await page.evaluate(() => getComputedStyle(document.querySelector('.player-topbar')).backgroundColor);
check('de topbalk van de speler heeft een achtergrond', topbar !== 'rgba(0, 0, 0, 0)' && topbar !== 'transparent', topbar);

await speel('S14MED');
const video = await maat('.player-shell iframe');
check('videospeler heeft hoogte', !!video && video.h > 50, JSON.stringify(video));

await speel('S14JIG');
const bord = await maat('[role=group][aria-label^="Puzzelbord"]');
const stuk = await maat('[role=group][aria-label^="Puzzelbord"] button');
check('puzzelbord heeft hoogte', !!bord && bord.h > 50, JSON.stringify(bord));
check('puzzelstukjes hebben hoogte', !!stuk && stuk.h > 10, JSON.stringify(stuk));

await speel('S14IVW');
const viewer = await maat('[role=application]');
check('afbeeldingsviewer heeft hoogte', !!viewer && viewer.h > 50, JSON.stringify(viewer));

await speel('S14MMD');
const vullingen = await page.evaluate(() => [...document.querySelectorAll('svg[role=img] rect')].map((r) => getComputedStyle(r).fill));
check('geen mindmapknoop is zwart gevuld', vullingen.length > 0 && !vullingen.includes('rgb(0, 0, 0)'), JSON.stringify([...new Set(vullingen)]));

if (codes.woordzoeker) {
  await speel(codes.woordzoeker);
  const cellen = await page.evaluate(() => {
    const c = document.querySelectorAll('.ws-cell');
    c[1].classList.add('sel');
    const g = (e) => getComputedStyle(e).backgroundColor;
    return { gewoon: g(c[0]), gekozen: g(c[1]) };
  });
  check('een gekozen woordzoekercel ziet er anders uit dan een gewone', cellen.gewoon !== cellen.gekozen, JSON.stringify(cellen));
}

await speel('S14LNG');
const breedte = await page.evaluate(() => document.documentElement.scrollWidth);
check('een lange url in een vraag laat de pagina niet horizontaal scrollen (390 px)', breedte <= 392, `scrollWidth ${breedte}`);

await page.goto(`${BASE}/#/cursus/lees/${codes.cursus}`, { waitUntil: 'networkidle' });
await sleep(400);
if (await page.locator('#course-student-name').isVisible().catch(() => false)) {
  await page.fill('#course-student-name', 'T');
  await page.getByRole('button', { name: /Start|Aan de slag/ }).first().click();
  await sleep(800);
}
await page.waitForSelector('.pdfv-page canvas', { timeout: 20000 }).catch(() => {});
const pdf = await page.evaluate(() => ({ canvas: document.querySelectorAll('.pdfv-page canvas').length, tekst: document.querySelectorAll('.pdfv-text span').length }));
check('een pdf opent met de oude worker, zonder at(), hasOwn en structuredClone', pdf.canvas > 0, JSON.stringify(pdf));

check('alleen de oude pdf-worker is opgehaald, niet de moderne', opgehaald.some((u) => /pdfWorkerOud-/.test(u)) && !opgehaald.some((u) => /pdf\.worker\.min-/.test(u)));
check('geen pagina- of consolefouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
// Tweede doorloop: een gewone browser, zonder nabootsing, met de echte CSP. De gewone worker moet starten.
console.log('\nGewone browser, echte CSP');
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
const page2 = await ctx2.newPage();
const opgehaald2 = [];
page2.on('request', (r) => opgehaald2.push(r.url()));
const fouten2 = [];
page2.on('pageerror', (e) => fouten2.push(`pageerror: ${e.message}`));
page2.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID|Failed to load resource/.test(m.text())) fouten2.push(`console: ${m.text().slice(0, 200)}`); });
await page2.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
await page2.goto(`${BASE}/#/widgets`, { waitUntil: 'networkidle' });
await sleep(400);
const cursus2 = await page2.evaluate(zaaiPdf, kleinePdf());
await page2.goto(`${BASE}/#/cursus/lees/${cursus2}`, { waitUntil: 'networkidle' });
await sleep(400);
if (await page2.locator('#course-student-name').isVisible().catch(() => false)) {
  await page2.fill('#course-student-name', 'T');
  await page2.getByRole('button', { name: /Start|Aan de slag/ }).first().click();
  await sleep(800);
}
await page2.waitForSelector('.pdfv-page canvas', { timeout: 20000 }).catch(() => {});
const pdf2 = await page2.evaluate(() => document.querySelectorAll('.pdfv-page canvas').length);
check('een pdf opent in een gewone browser', pdf2 > 0, String(pdf2));
check('de gewone pdf-worker start en pdfWorkerOud wordt niet opgehaald', opgehaald2.some((u) => /pdf\.worker\.min-.*\.mjs/.test(u)) && !opgehaald2.some((u) => /pdfWorkerOud-/.test(u)), JSON.stringify(opgehaald2.filter((u) => /worker/i.test(u))));
check('gewone browser: geen pagina-, console- of CSP-fouten', fouten2.length === 0, fouten2.slice(0, 3).join(' | '));

// Derde doorloop (LK-9): de Lichtkamer (lespagina en kindscherm) in de nagebootste Safari 14.1, met en zonder WebGL.
console.log('\nLichtkamer in Safari 14.1 nagebootst');
const GEEN_GL = `(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/.test(String(t)) ? null : o.call(this, t, ...r); }; })();`;
async function lichtkamerS14(zonderGl) {
  const label = zonderGl ? 'zonder WebGL' : 'met WebGL';
  const c = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  await c.addInitScript(INIT);
  if (zonderGl) await c.addInitScript(GEEN_GL);
  await c.route('**/*.css', async (route) => {
    const resp = await route.fetch();
    await route.fulfill({ response: resp, body: s14css(await resp.text()), headers: { ...resp.headers(), 'content-type': 'text/css' } });
  });
  const pg = await c.newPage();
  const f = [];
  const hal = [];
  pg.on('request', (r) => hal.push(r.url()));
  pg.on('pageerror', (e) => f.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID|Failed to load resource/.test(m.text())) f.push(`console: ${m.text().slice(0, 200)}`); });
  await pg.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
  const breed = () => pg.evaluate(() => document.documentElement.scrollWidth);

  // De lespagina.
  await pg.goto(`${BASE}/#/basis/pakket/lichtkamer/einde-4de`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('.b-lkp h1', { timeout: 20000 }).catch(() => {});
  check(`lespagina (${label}): de h1 staat er en er is één main`, (await pg.locator('main h1').count()) === 1 && (await pg.locator('main').count()) === 1);
  check(`lespagina (${label}): geen horizontale scroll op 390 px`, (await breed()) <= 392, String(await breed()));
  await pg.getByRole('button', { name: /Probeer de oefeningen uit/ }).click();
  await pg.waitForSelector('.b-lk-les h2', { timeout: 15000 }).catch(() => {});
  check(`lespagina (${label}): na 'Uitproberen' staat de les er, nog steeds met één h1`, (await pg.locator('.b-lk-les h2').count()) >= 1 && (await pg.locator('h1').count()) === 1);

  // Het kindscherm.
  await pg.goto('about:blank');
  await pg.goto(`${BASE}/#/basis/oefen/lichtkamer/einde-4de`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('.b-lk-les h2', { timeout: 20000 }).catch(() => {});
  check(`kindscherm (${label}): de h1 staat er en de keuze met vier tegels is opgebouwd`, (await pg.locator('main h1').count()) === 1 && (await pg.locator('.b-lk-tegel').count()) === 4);
  const tegelH = await pg.evaluate(() => Math.round(document.querySelector('.b-lk-tegel').getBoundingClientRect().height));
  check(`kindscherm (${label}): een tegel heeft een tikdoel van minstens 44 px`, tegelH >= 44, String(tegelH));
  check(`kindscherm (${label}): geen horizontale scroll op 390 px`, (await breed()) <= 392, String(await breed()));
  await pg.locator('.b-lk-tegel', { hasText: 'Drie kaartjes' }).click();
  await pg.waitForSelector('.b-lk-kijk', { timeout: 15000 });
  const terugval = await pg.waitForFunction(() => !!document.querySelector('.b-lk-kijk canvas') || !!document.querySelector('.b-lk-melding'), null, { timeout: 25000 }).then(() => true, () => false);
  check(`kindscherm (${label}): de kijkdoos tekent, of er komt de melding (de terugval)`, terugval);
  const vak = await pg.evaluate(() => Math.round(document.querySelector('.b-lk-kijk').getBoundingClientRect().height));
  check(`kindscherm (${label}): het kijkvak heeft hoogte zonder aspect-ratio (de terugval werkt)`, vak > 100, String(vak));
  if (zonderGl) {
    check('kindscherm (zonder WebGL): three-*.js is niet opgehaald', !hal.some((u) => /\/(three|kijkdoos3d)-[^/]*\.js/.test(u)));
    check('kindscherm (zonder WebGL): de melding noemt WebGL niet', !/webgl/i.test(await pg.locator('.b-lk-melding').innerText()));
  } else if (await pg.locator('.b-lk-kijk canvas').count()) {
    const toestand = await pg.evaluate(() => { const c = document.querySelector('.b-lk-kijk canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); return !!gl && !gl.isContextLost(); });
    check('kindscherm (met WebGL): de WebGL-context leeft', toestand);
  }
  // De rest van de les blijft bruikbaar: een gaatje verzetten, dan de check en 'Wat ik al kan'.
  await pg.getByRole('button', { name: /^Gaatje 3 \(bij het scherm\) hoger$/ }).click().catch(() => {});
  await pg.getByRole('button', { name: /Terug naar de oefeningen/ }).click();
  await pg.locator('.b-lk-tegel', { hasText: 'De check' }).click();
  await pg.waitForSelector('.b-lk-check');
  for (const rx of [/^C: de schaduw valt rechts/, /^groter$/, /^A: gaatje 1 hoog/]) {
    await pg.getByRole('button', { name: rx }).click();
    await pg.getByRole('button', { name: /^(Volgende vraag|Klaar)$/ }).click();
  }
  await pg.waitForSelector('.b-lk-kan', { timeout: 10000 }).catch(() => {});
  const woorden = await pg.locator('.b-lk-kan-rij .b-lk-st').allTextContents();
  check(`kindscherm (${label}): de check werkt en 'Wat ik al kan' toont per doel een woord`, woorden.length === 3 && woorden[0].trim() === 'toont het', JSON.stringify(woorden));
  // De juiste en foute antwoorden hebben ook zonder color-mix een zichtbare achtergrond of rand (geen kleur-alleen, geen leeg).
  await pg.goto('about:blank');
  await pg.goto(`${BASE}/#/basis/oefen/lichtkamer/einde-4de?scherm=check`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('.b-lk-opt');
  await pg.getByRole('button', { name: /^C: de schaduw valt rechts/ }).click();
  const juist = await pg.evaluate(() => { const e = document.querySelector('.b-lk-opt.b-lk-juist'); const s = getComputedStyle(e); return { bg: s.backgroundColor, rand: s.borderTopColor, tekst: e.textContent }; });
  check(`kindscherm (${label}): het juiste antwoord heeft een eigen rand of achtergrond en het woord 'juist'`, /juist/.test(juist.tekst) && (juist.bg !== 'rgba(0, 0, 0, 0)' || juist.rand !== 'rgba(0, 0, 0, 0)'), JSON.stringify(juist));
  check(`kindscherm (${label}): geen pagina-, console- of CSP-fouten`, f.length === 0, f.slice(0, 3).join(' | '));
  await c.close();
}
await lichtkamerS14(false);
await lichtkamerS14(true);

await browser.close();
console.log(failures === 0 ? '\nSafari 14: alles in orde' : `\nSafari 14: ${failures} controle(s) mislukt`);
process.exit(failures === 0 ? 0 : 1);
