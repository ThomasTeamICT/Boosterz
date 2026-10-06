// Rooktest herstelpakket CSP + lettertypes + privacy (debugronde oktober 2026).
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/csp-privacy.mjs
//
//  V1   de gebouwde index.html heeft een Content-Security-Policy (meta) met de
//       verwachte richtlijnen; een ingespoten inline script, een inline
//       gebeurtenisattribuut en javascript:-URL's worden geblokkeerd; het
//       vangnet-script (via zijn hash) en de YouTube-iframe-API werken wel.
//  V5   geen enkel verzoek naar Google Fonts; de lettertypes komen van de app
//       zelf, zijn echt in gebruik en werken offline (voorcache); de videoquiz
//       gebruikt youtube-nocookie.com; de privacytekst is eerlijk.
//  V6   "Alle inzendingen & leerlinggegevens wissen" laat geen ingeleverde
//       bestanden achter, ook niet van werk dat nog niet ingediend was; de
//       knop werkt ook zonder inzendingen.
//  A11Y19  privacypagina: één main, één h1, kopniveaus zonder sprongen.
//
// Elke stap in een vers browserprofiel. Verzoeken naar buiten worden
// afgebroken of nagebootst (nooit een echt extern verzoek). Exit-code 1 bij
// een fout.

import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import LZString from 'lz-string';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
const ORIGIN = new URL(BASE).origin;
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lz = (o) => LZString.compressToEncodedURIComponent(JSON.stringify(o));
const widgetLink = (w) => `${BASE}#/open?d=${lz({ v: 1, w })}`;
const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: true, instructions: '' };
const widget = (id, type, code, config, over = {}) => ({
  id, type, title: `Test ${type}`, code, folderId: null, createdAt: 1, updatedAt: 1, settings: { ...SETTINGS, ...over }, config,
});
const uploadQuiz = (id, code) => widget(id, 'quiz', code, {
  layout: 'scroll',
  questions: [{ id: 'q1', type: 'upload', prompt: 'Lever je bestand in', points: 1, maxMb: 2 }],
});
const shortQuiz = widget('w_kort', 'quiz', 'KORT01', {
  layout: 'scroll', questions: [{ id: 'q1', type: 'short', prompt: 'Hoofdstad van België?', points: 1, accepted: ['Brussel'], caseSensitive: false }],
}, { requireName: false });
const VIDEO_ID = 'dQw4w9WgXcQ';
const videoQuiz = widget('w_video', 'videoquiz', 'VIDEO1', {
  videoUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  checkpoints: [
    { id: 'c1', timeSec: 30, question: { id: 'vq1', type: 'tf', prompt: 'Klopt dit?', points: 1, answer: true } },
    { id: 'c2', timeSec: 60, question: { id: 'vq2', type: 'mc', prompt: 'Welke kleur?', points: 1, options: ['rood', 'groen', 'blauw'], correctIndex: 0 } },
  ],
}, { requireName: false });

const GOOGLE_FONTS = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;
const CSP_TEKST = /Content Security Policy|Refused to/i;

/** Nagebootste YouTube-iframe-API: noteert de opties en tekent een kader zoals de echte. */
const NEP_YT_API = `
window.__ytApiGeladen = true;
window.YT = {
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  Player: function (el, opts) {
    window.__ytOpts = { host: opts.host, videoId: opts.videoId };
    var f = document.createElement('iframe');
    f.src = (opts.host || 'https://www.youtube.com') + '/embed/' + opts.videoId + '?enablejsapi=1';
    (typeof el === 'string' ? document.getElementById(el) : el).appendChild(f);
    var self = this;
    this.getCurrentTime = function () { return 0; };
    this.getPlayerState = function () { return -1; };
    this.pauseVideo = function () {};
    this.playVideo = function () {};
    this.destroy = function () { f.remove(); };
    setTimeout(function () { if (opts.events && opts.events.onReady) opts.events.onReady({ target: self }); }, 20);
  },
};
if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
`;

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

/**
 * Vers profiel. Noteert elk verzoek (ook naar buiten), CSP-meldingen en
 * paginafouten. Externe verzoeken worden afgebroken, tenzij `nep` ze beantwoordt.
 */
async function freshPage({ nep = {}, serviceWorkers = 'block' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers });
  const verzoeken = [];
  const csp = [];
  const errors = [];
  ctx.on('request', (r) => verzoeken.push(r.url()));
  if (serviceWorkers === 'block') {
    await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => {
      const url = r.request().url();
      for (const [prefix, body] of Object.entries(nep)) {
        if (url.startsWith(prefix)) return r.fulfill({ status: 200, contentType: body.type, body: body.body });
      }
      return r.abort();
    });
  }
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI || ''}`.trim());
    });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (CSP_TEKST.test(m.text())) csp.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  return { ctx, page, verzoeken, csp, errors };
}

const cspEvents = (page) => page.evaluate(() => window.__csp ?? []).catch(() => []);

/** Alle records in de bestandsopslag (IndexedDB wf-files/pdfs): id en naam. */
async function idbRecords(page) {
  return page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('wf-files');
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('pdfs')) { db.close(); res([]); return; }
      const q = db.transaction('pdfs').objectStore('pdfs').getAll();
      q.onsuccess = () => { res(q.result.map((x) => ({ id: x.id, name: x.name }))); db.close(); };
      q.onerror = () => { res([]); db.close(); };
    };
    r.onerror = () => res([]);
  }));
}

// ── 1. CSP in de gebouwde index.html ────────────────────────────────────────

console.log('1. CSP-meta in de build');
const html = await (await fetch(BASE)).text();
const metaMatch = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
check('index.html heeft een CSP-meta', !!metaMatch);
const policy = metaMatch?.[1] ?? '';
const dirs = Object.fromEntries(policy.split(';').map((p) => p.trim().split(/\s+/)).filter((p) => p[0]).map(([n, ...v]) => [n, v]));
check('precies script-src, object-src en base-uri', JSON.stringify(Object.keys(dirs).sort()) === JSON.stringify(['base-uri', 'object-src', 'script-src']), policy);
check("script-src: 'self', een sha256-hash en https://www.youtube.com", (dirs['script-src'] ?? [])[0] === "'self'"
  && (dirs['script-src'] ?? []).some((v) => /^'sha256-[A-Za-z0-9+/]+=*'$/.test(v)) && (dirs['script-src'] ?? []).includes('https://www.youtube.com'), policy);
check("object-src 'none' en base-uri 'self'", (dirs['object-src'] ?? []).join() === "'none'" && (dirs['base-uri'] ?? []).join() === "'self'");
check("geen 'unsafe-inline', 'unsafe-eval' of 'unsafe-hashes'", !/'unsafe-/.test(policy));
check('geen default-src, connect-src, img-src, frame-src of style-src', !/(default|connect|img|frame|style)-src/.test(policy));
const metaPos = html.indexOf('http-equiv="Content-Security-Policy"');
check('de CSP-meta staat vóór elk script en elke link', metaPos > 0 && metaPos < html.indexOf('<script') && metaPos < html.indexOf('<link'));
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const hashes = inline.map((t) => `'sha256-${createHash('sha256').update(t.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`);
check(`elk inline script (${inline.length}) staat met zijn hash in de CSP`, inline.length >= 1 && hashes.every((h) => (dirs['script-src'] ?? []).includes(h)));
const htmlZonderCommentaar = html.replace(/<!--[\s\S]*?-->/g, '');
check('geen Google Fonts, preconnect of onload= in index.html', !/fonts\.googleapis|fonts\.gstatic|preconnect|\sonload=/.test(htmlZonderCommentaar));

// ── 2. De CSP blokkeert, de app werkt ───────────────────────────────────────

console.log('2. CSP blokkeert ingespoten scripts, de app werkt');
{
  const t = await freshPage();
  await t.page.goto(BASE + '#/');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  await sleep(800);
  check('startpagina laadt onder de CSP, zonder CSP-meldingen', t.csp.length === 0 && (await cspEvents(t.page)).length === 0, t.csp.join(' | '));
  check('CSP-meta staat ook in het geladen document', (await t.page.locator('meta[http-equiv="Content-Security-Policy"]').count()) === 1);

  const voor = (await cspEvents(t.page)).length;
  await t.page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.head.appendChild(s);
  });
  await sleep(300);
  check('ingespoten inline script draait niet', (await t.page.evaluate(() => window.__inline)) === undefined);
  const naInline = await cspEvents(t.page);
  check('... en de browser meldt een CSP-overtreding (script-src)', naInline.length > voor && /script-src/.test(naInline.at(-1)), naInline.join(' | '));

  await t.page.evaluate(() => {
    const d = document.createElement('div');
    d.setAttribute('onclick', 'window.__handler = 1');
    document.body.appendChild(d);
    d.click();
  });
  await sleep(300);
  check('inline gebeurtenisattribuut (onclick=) draait niet', (await t.page.evaluate(() => window.__handler)) === undefined);

  await t.page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'javascript:window.__xss=localStorage.length;void 0';
    a.textContent = 'klik';
    document.body.appendChild(a);
    a.click();
  });
  await sleep(500);
  check('javascript:-link: geen script uitgevoerd', (await t.page.evaluate(() => window.__xss)) === undefined);

  await t.page.evaluate(() => {
    const f = document.createElement('iframe');
    f.src = 'javascript:parent.__xssFrame=parent.localStorage.length;void 0';
    document.body.appendChild(f);
  });
  await sleep(800);
  check('iframe met javascript:-adres (de V1-aanval): geen script uitgevoerd', (await t.page.evaluate(() => window.__xssFrame)) === undefined);
  const alle = await cspEvents(t.page);
  check('elke poging gaf een CSP-overtreding', alle.length >= voor + 4, alle.join(' | '));
  check('geen paginafouten', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}
{
  const t = await freshPage();
  await t.page.route(/\/assets\/index-[\w-]+\.js$/, (r) => r.abort());
  await t.page.goto(BASE + '#/');
  await sleep(1500);
  check('vangnet-script (inline, via hash) draait onder de CSP', (await t.page.locator('body').innerText()).includes('Boosterz kon niet laden'));
  check('... zonder CSP-melding', t.csp.length === 0 && (await cspEvents(t.page)).length === 0, t.csp.join(' | '));
  await t.ctx.close();
}

// ── 3. Geen Google, lettertypes van de app zelf ─────────────────────────────

console.log('3. Geen verzoek naar Google; lettertypes van de app zelf');
{
  const t = await freshPage();
  const cdp = await t.ctx.newCDPSession(t.page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  /**
   * Welke lettertypes de browser echt gebruikt voor de tekst in dit element
   * ("eigen" = uit een @font-face, niet een systeemletter). Outfit is
   * variabel: de browser noemt het "Outfit Thin" (de basisinstantie).
   */
  const gebruikteLetters = async (selector) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return [];
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (eigen)' : ''}`);
  };
  const lettertypes = () => t.page.evaluate(async () => {
    await document.fonts.ready;
    return {
      atkinson: document.fonts.check('16px "Atkinson Hyperlegible"'),
      outfit: document.fonts.check('700 16px Outfit'),
      geladen: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
      bestanden: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.woff2(\?|$)/.test(n)),
    };
  });

  for (const [naam, url, actie] of [
    ['startpagina /', BASE + '#/'],
    ['leerlingingang /#/meedoen', BASE + '#/meedoen'],
    ['leerlingscherm (quiz via deellink)', widgetLink(shortQuiz), async (p) => {
      await p.getByRole('button', { name: /Starten/ }).first().click({ timeout: 8000 });
      await p.getByText('Hoofdstad van België?').first().waitFor({ timeout: 8000 });
    }],
  ]) {
    const start = t.verzoeken.length;
    await t.page.goto(url);
    await t.page.locator('main h1, main h2').first().waitFor({ timeout: 15000 });
    if (actie) await actie(t.page);
    await sleep(1200);
    const hier = t.verzoeken.slice(start);
    const google = hier.filter((u) => GOOGLE_FONTS.test(u));
    const extern = hier.filter((u) => !u.startsWith(ORIGIN) && !/^(data|blob):/.test(u));
    check(`${naam}: geen verzoek naar fonts.googleapis.com of fonts.gstatic.com`, google.length === 0, google.join(' '));
    check(`${naam}: helemaal geen verzoek naar buiten`, extern.length === 0, extern.slice(0, 3).join(' '));
    const l = await lettertypes();
    check(`${naam}: Atkinson Hyperlegible geladen (document.fonts.check)`, l.atkinson === true && l.geladen.some((f) => f.startsWith('Atkinson Hyperlegible')), JSON.stringify(l.geladen));
    check(`${naam}: lettertypes komen van de app zelf (assets/*.woff2)`, l.bestanden.length > 0 && l.bestanden.every((b) => b.startsWith(`${ORIGIN}/assets/`)), l.bestanden.join(' '));
    check(`${naam}: geen CSP-meldingen`, t.csp.length === 0, t.csp.join(' | '));
  }
  // Op de leerlingingang: de tekst staat echt in Atkinson, de kop in Outfit.
  await t.page.goto(BASE + '#/meedoen');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  await t.page.evaluate(() => document.fonts.ready);
  const tekst = await gebruikteLetters('main p');
  const kop = await gebruikteLetters('main h1');
  check('lopende tekst wordt echt in Atkinson Hyperlegible getekend', tekst.includes('Atkinson Hyperlegible (eigen)'), tekst.join(', '));
  check('koppen worden echt in Outfit getekend', kop.some((f) => /^Outfit.* \(eigen\)$/.test(f)), kop.join(', '));
  check('geen paginafouten', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ── 4. Lettertypes offline (voorcache van de service worker) ────────────────

console.log('4. Lettertypes werken offline');
{
  const t = await freshPage({ serviceWorkers: 'allow' });
  const swTekst = await (await fetch(BASE + 'sw.js')).text();
  const precache = JSON.parse(/const BOOSTERZ = (\{.*\});/.exec(swTekst)?.[1] ?? '{}').precache ?? [];
  const fontsInPrecache = precache.filter((f) => f.endsWith('.woff2'));
  check(`sw.js zet de 8 lettertypebestanden in de voorcache (${fontsInPrecache.length})`, fontsInPrecache.length === 8, fontsInPrecache.join(' '));
  await t.page.goto(BASE + '#/meedoen');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  const actief = await t.page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then((r) => !!r.active),
    new Promise((res) => setTimeout(() => res(false), 15000)),
  ]));
  check('service worker is actief', actief === true);
  const bewaard = await t.page.evaluate(async () => {
    const urls = [];
    for (const n of await caches.keys()) {
      const c = await caches.open(n);
      for (const r of await c.keys()) urls.push(r.url);
    }
    return urls.filter((u) => u.endsWith('.woff2'));
  });
  check('alle lettertypes staan in de cache van de service worker', bewaard.length === 8, `${bewaard.length} bewaard`);

  await t.ctx.setOffline(true);
  const p2 = await t.ctx.newPage();
  await p2.goto(BASE + '#/meedoen');
  await p2.locator('main h1').first().waitFor({ timeout: 15000 });
  const offline = await p2.evaluate(async () => {
    // cursief en latin-ext zijn bij het eerste bezoek nog niet gebruikt: alleen de voorcache heeft ze
    const faces = [
      ...(await document.fonts.load('16px "Atkinson Hyperlegible"')),
      ...(await document.fonts.load('italic 16px "Atkinson Hyperlegible"')),
      ...(await document.fonts.load('700 16px "Atkinson Hyperlegible"', 'ąę')),
      ...(await document.fonts.load('800 16px Outfit')),
    ];
    return { aantal: faces.length, statussen: faces.map((f) => `${f.family} ${f.weight} ${f.style} ${f.status}`) };
  });
  check('offline: gewoon, cursief, latin-ext en Outfit laden uit de cache', offline.aantal >= 4 && offline.statussen.every((s) => s.endsWith('loaded')), offline.statussen.join(' | '));
  await t.ctx.close();
}

// ── 5. Videoquiz: youtube-nocookie ──────────────────────────────────────────

console.log('5. Videoquiz gebruikt youtube-nocookie.com');
{
  const t = await freshPage({ nep: { 'https://www.youtube.com/iframe_api': { type: 'text/javascript', body: NEP_YT_API } } });
  await t.page.goto(widgetLink(videoQuiz));
  await t.page.getByRole('button', { name: /Starten/ }).first().click({ timeout: 8000 });
  await sleep(2000);
  check('YouTube-iframe-API laadt onder de CSP (script van www.youtube.com)', (await t.page.evaluate(() => window.__ytApiGeladen)) === true);
  const opts = await t.page.evaluate(() => window.__ytOpts);
  check('new YT.Player krijgt host https://www.youtube-nocookie.com', opts?.host === 'https://www.youtube-nocookie.com', JSON.stringify(opts));
  const srcs = await t.page.locator('iframe').evaluateAll((a) => a.map((f) => f.getAttribute('src') || ''));
  check('het spelerkader komt van youtube-nocookie.com', srcs.length > 0 && srcs.every((s) => s.startsWith('https://www.youtube-nocookie.com/embed/')), srcs.join(' '));
  check('geen CSP-meldingen', t.csp.length === 0 && (await cspEvents(t.page)).length === 0, t.csp.join(' | '));
  check('geen verzoek naar www.youtube.com/embed (zonder nocookie)', !t.verzoeken.some((u) => u.startsWith('https://www.youtube.com/embed')));
  await t.ctx.close();
}
{
  // Zonder YouTube-API (geblokkeerd netwerk): de terugvalweergave na 5 s.
  const t = await freshPage();
  await t.page.goto(widgetLink(videoQuiz));
  await t.page.getByRole('button', { name: /Starten/ }).first().click({ timeout: 8000 });
  await t.page.getByText(/De interactieve videospeler kon niet geladen worden/).waitFor({ timeout: 12000 });
  const srcs = await t.page.locator('iframe').evaluateAll((a) => a.map((f) => f.getAttribute('src') || ''));
  check('terugvalkader komt van youtube-nocookie.com', srcs.length === 1 && srcs[0] === `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`, srcs.join(' '));
  await t.ctx.close();
}
{
  // Voorbeeld in de editor.
  const t = await freshPage();
  await t.page.goto(BASE + '#/');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  await t.page.evaluate((w) => {
    const alle = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
    localStorage.setItem('wf.widgets.v1', JSON.stringify([w, ...alle.filter((x) => x.id !== w.id)]));
  }, videoQuiz);
  await t.page.goto(`${BASE}#/bewerk/${videoQuiz.id}`);
  await t.page.locator('iframe[title="Voorbeeld van de gekozen video"]').waitFor({ timeout: 15000 });
  const src = await t.page.locator('iframe[title="Voorbeeld van de gekozen video"]').getAttribute('src');
  check('voorbeeld in de editor komt van youtube-nocookie.com', src === `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`, src);
  // Het juiste antwoord verwijderen maakt geen andere optie stil juist (removeOptionAt).
  const radios = t.page.locator('input[type=radio][aria-label$="is het juiste antwoord"]');
  check('meerkeuzevraag: optie 1 is juist', (await radios.count()) === 3 && (await radios.first().isChecked()));
  await t.page.getByRole('button', { name: 'Optie verwijderen' }).first().click();
  await sleep(300);
  const aangevinkt = await radios.evaluateAll((rs) => rs.filter((r) => r.checked).length);
  check('na het verwijderen van het juiste antwoord is geen andere optie juist', (await radios.count()) === 2 && aangevinkt === 0, `${aangevinkt} aangevinkt`);
  check('de editor meldt "Nog geen juist antwoord aangeduid"', await t.page.getByText('Nog geen juist antwoord aangeduid').first().isVisible());
  check('geen CSP-meldingen in de editor', t.csp.length === 0, t.csp.join(' | '));
  await t.ctx.close();
}

// ── 6. Privacypagina: eerlijk, toegankelijk, wissen wist alles ──────────────

console.log('6. Privacypagina');
const startUpload = async (page, w, naam, bestandsnaam) => {
  await page.goto(widgetLink(w));
  await page.locator('#student-name').fill(naam, { timeout: 10000 });
  await page.getByRole('button', { name: /Starten/ }).first().click();
  await page.getByText('Lever je bestand in').first().waitFor({ timeout: 8000 });
  await page.locator('input[type=file]').first().setInputFiles({ name: bestandsnaam, mimeType: 'text/plain', buffer: Buffer.from(`werk van ${naam}`) });
  await page.getByText(bestandsnaam).first().waitFor({ timeout: 8000 });
  await sleep(1200); // autosave
};
{
  const t = await freshPage();
  await t.page.goto(BASE + '#/privacy');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  check('één main en één h1', (await t.page.locator('main').count()) === 1 && (await t.page.locator('h1').count()) === 1);
  const niveaus = await t.page.locator('main :is(h1, h2, h3, h4, h5, h6)').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
  check(`kopniveaus zonder sprongen (${niveaus.join(' ')})`, niveaus[0] === 1 && niveaus.every((n, i) => i === 0 || n <= niveaus[i - 1] + 1));
  const tekst = await t.page.locator('main').innerText();
  check('de onjuiste belofte "niets naar het internet" is weg', !/niets naar het internet/i.test(tekst));
  check('de tekst noemt wat wél naar buiten gaat: GitHub Pages, YouTube/Vimeo, eigen links en kaders, de AI-aanbieder',
    /GitHub Pages/.test(tekst) && /YouTube en Vimeo/.test(tekst) && /youtube-nocookie\.com/.test(tekst) && /ingesloten kader/.test(tekst) && /AI-aanbieder/.test(tekst));
  check('de wisknop staat uit op een leeg toestel', await t.page.getByRole('button', { name: /Alle inzendingen/ }).isDisabled());
  await t.page.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  const breedte = await t.page.evaluate(() => document.documentElement.scrollWidth);
  check(`390 px: geen horizontaal scrollen (${breedte} px)`, breedte <= 390);
  await t.ctx.close();
}
{
  // V6a: alleen tussentijds werk met een ingeleverd bestand, geen enkele inzending.
  const t = await freshPage();
  await startUpload(t.page, uploadQuiz('w_up1', 'UPLD01'), 'Emma', 'werk-emma.txt');
  const voor = await idbRecords(t.page);
  const autosave = await t.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('wf.autosave.')));
  check('voor het wissen: het bestand staat in IndexedDB en in het tussentijdse werk', voor.some((r) => r.name === 'werk-emma.txt') && autosave.length === 1, JSON.stringify(voor));
  await t.page.goto(BASE + '#/privacy');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  const knop = t.page.getByRole('button', { name: /Alle inzendingen/ });
  check('de wisknop werkt ook zonder inzendingen (er is tussentijds werk)', await knop.isEnabled());
  await knop.click();
  const dialoog = t.page.getByRole('dialog');
  check('de bevestiging noemt ingeleverde bestanden en wat blijft staan', /ingeleverde bestanden/.test(await dialoog.innerText()) && /Klaslijsten en je feedbackbank blijven staan/.test(await dialoog.innerText()));
  await dialoog.getByRole('button', { name: 'Verwijderen' }).click();
  await sleep(2000);
  const na = await idbRecords(t.page);
  check('na het wissen: geen ingeleverd bestand meer in IndexedDB', !na.some((r) => voor.some((v) => v.id === r.id && !v.id.startsWith('m_'))), JSON.stringify(na));
  check('na het wissen: geen tussentijds werk meer', (await t.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('wf.autosave.')).length)) === 0);
  check('geen paginafouten', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}
{
  // V6b: een ingediend bestand én een nog niet ingediend bestand.
  const t = await freshPage();
  await startUpload(t.page, uploadQuiz('w_up2', 'UPLD02'), 'Noor', 'ingediend-noor.txt');
  await t.page.getByRole('button', { name: /Indienen/ }).first().click();
  await sleep(1500);
  const subs = await t.page.evaluate(() => localStorage.getItem('wf.submissions.v1') || '');
  check('de inzending verwijst naar het ingediende bestand', /"fileId":"[\w-]+"/.test(subs));
  await startUpload(t.page, uploadQuiz('w_up3', 'UPLD03'), 'Lars', 'bezig-lars.txt');
  const voor = await idbRecords(t.page);
  check('voor het wissen: twee ingeleverde bestanden', ['ingediend-noor.txt', 'bezig-lars.txt'].every((n) => voor.some((r) => r.name === n)), JSON.stringify(voor));
  await t.page.goto(BASE + '#/privacy');
  await t.page.locator('main h1').first().waitFor({ timeout: 15000 });
  await t.page.getByRole('button', { name: /Alle inzendingen/ }).click();
  await t.page.getByRole('dialog').getByRole('button', { name: 'Verwijderen' }).click();
  await sleep(2000);
  const na = await idbRecords(t.page);
  check('na het wissen: geen enkel ingeleverd bestand meer', !na.some((r) => /\.txt$/.test(r.name)), JSON.stringify(na));
  check('na het wissen: geen inzendingen meer', (await t.page.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]').length)) === 0);
  check('de knop staat daarna weer uit', await t.page.getByRole('button', { name: /Alle inzendingen/ }).isDisabled());
  check('geen paginafouten', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALLE CSP-, LETTERTYPE- EN PRIVACYCHECKS GESLAAGD' : `\n${failures} CHECK(S) GEFAALD`);
process.exit(failures === 0 ? 0 : 1);
