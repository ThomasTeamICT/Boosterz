// Rooktest herstelpakket P7: de cursuslezer, de afdrukversie, de hulppagina en het startmateriaal.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4304 --strictPort &
//   SMOKE_BASE=http://localhost:4304 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/cursuslezer.mjs
//
// Elk geval krijgt een vers browserprofiel van 390 px breed (een gsm), met de cursus en oefeningen
// vooraf in localStorage gezet. Waar de tijd telt, draait de klok van de pagina nep (page.clock).
// Faalt hard (exit 1) bij een mislukte controle, een paginafout of een consolefout.
//
//  LL1    de deadline verstrijkt terwijl de leerling bezig is: werk blijft staan en wordt bewaard
//  W15d   een lichte accentkleur (#ffe14d) geeft leesbare tekst (contrast >= 4,5)
//  V9     sectie-id "__proto__" of "constructor" laat de lezer niet crashen
//  A11Y11 de foutpagina van een cursuslink brengt een leerling niet naar de leerkrachtschil
//  A11Y12 "Oefening laden…", nooit "widget", op leerlingschermen
//  A11Y19 één main en één h1 per scherm, ook in fout- en leegtoestanden
//  CU13   lege blokken zijn voor een leerling onzichtbaar (lezer en afdruk)
//  CU14   tikdoelen van 44 px in de lezer
//  CU15c  "Als leerling" (?voorbeeld=1): niets wordt bewaard
//  CU15d  de hulp noemt de juiste knoppen voor "Delen als pakket"
//  CU12   de voorbeeldcursus en haar oefeningen tellen niet als eigen materiaal

import { chromium } from 'playwright-core';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;
const errors = [];

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Kleur ───────────────────────────────────────────────────────────────────

function luminantie([r, g, b]) {
  const lin = [r, g, b].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminantie(a), luminantie(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** "#rrggbb" of "rgb(r, g, b)" naar [r, g, b]. */
function naarRgb(s) {
  const t = String(s).trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(t);
  if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(t);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const WIT = [255, 255, 255];

// ── Inhoud ──────────────────────────────────────────────────────────────────

const WIDGET_SETTINGS = {
  accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0,
  requireName: false, instructions: '',
};
const mc = (id, prompt) => ({ id, type: 'mc', prompt, points: 1, options: ['A', 'B', 'C'], correctIndex: 0 });
function quiz(id, title, settings = {}, vragen = [mc('q1', 'Vraag 1'), mc('q2', 'Vraag 2')]) {
  return {
    id, type: 'quiz', title, code: id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0'), folderId: null,
    createdAt: 1, updatedAt: 1, settings: { ...WIDGET_SETTINGS, ...settings }, config: { layout: 'single', questions: vragen },
  };
}
function cursus(id, code, secties, instellingen = {}) {
  return {
    id, title: 'Testcursus', author: 'Juf Test', coverEmoji: '📘', code,
    chapters: [{ id: 'ch1', title: 'Hoofdstuk 1', sections: secties }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true, ...instellingen },
    createdAt: 1, updatedAt: 1,
  };
}
const sectie = (id, title, blocks) => ({ id, title, blocks });
const tekst = (id, markdown) => ({ id, type: 'text', markdown });

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

/**
 * Vers profiel op een gsm. `bewaard` wordt eenmalig in localStorage gezet vóór de app laadt;
 * herladen laat de opslag dus ongemoeid. Verzoeken naar buiten worden afgebroken.
 */
async function open({ courses = [], widgets = [], clock = false, width = 390, height = 844, extra = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(([c, w, e]) => {
    try {
      if (localStorage.getItem('__herstel_gezaaid')) return;
      if (c.length) localStorage.setItem('wf.courses.v1', JSON.stringify(c));
      if (w.length) localStorage.setItem('wf.widgets.v1', JSON.stringify(w));
      for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
      localStorage.setItem('__herstel_gezaaid', '1');
    } catch { /* about:blank heeft geen opslag */ }
  }, [courses, widgets, extra]);
  geopend.push(ctx);
  ctx.setDefaultTimeout(8000); // een ontbrekend element is een gefaalde controle, geen minuten wachten
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  if (clock) await p.clock.install({ time: Date.now() });
  // met nepklok: timers en animatieframes laten lopen, en echte tijd voor netwerk en chunks
  const wacht = async (ms) => { if (clock) await p.clock.runFor(ms); await sleep(ms); };
  return { ctx, p, wacht };
}
const geopend = [];
/** Een geval dat onverwacht stukloopt (time-out, ontbrekend element) telt als gefaalde controle, niet als crash van de hele test. */
async function geval(fn) {
  try { await fn(); } catch (e) { check('onverwachte fout in het geval', false, String(e.message).split('\n')[0]); }
}
const naar = async (p, hash) => { await p.goto(BASE + hash, { waitUntil: 'networkidle' }); await sleep(400); };
const opslag = (p, sleutel) => p.evaluate((k) => localStorage.getItem(k), sleutel);
const opslagJson = async (p, sleutel, leeg = null) => JSON.parse((await opslag(p, sleutel)) ?? 'null') ?? leeg;
const crashed = async (p) => (await p.getByText(/Er ging iets mis/).count()) > 0;

/** Telt main en h1 in het document. */
const structuur = (p) => p.evaluate(() => ({ main: document.querySelectorAll('main').length, h1: document.querySelectorAll('h1').length }));

/** Alle tikbare elementen kleiner dan 44 px (inline tekstlinks, verborgen en schermlezerelementen niet). */
const kleineTikdoelen = (p) => p.evaluate(() => {
  const uit = [];
  const sel = 'button, a[href], input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea, summary, [role=button], label.checkbox-row';
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('.md-body') && el.matches('a')) continue; // link midden in een zin
    if (el.closest('.sr-only') || el.matches('.sr-only, .skip-link')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 43.5 || r.width < 43.5) {
      const naam = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 36);
      uit.push(`${el.tagName.toLowerCase()} "${naam}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return uit;
});
const overloop = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ═════════════════════════════════════════════════════════════════════════════
console.log('LL1. De deadline verstrijkt terwijl de leerling bezig is (cursuslezer)');
await geval(async () => {
  const nu = Date.now();
  const w = quiz('w_deadline', 'Deadline-oefening', { expiresAt: new Date(nu + 60000).toISOString() });
  const c = cursus('c_deadline', 'DLN123', [sectie('s1', 'Les', [tekst('b0', 'Maak de oefening.'), { id: 'b1', type: 'widget', widgetId: 'w_deadline' }])]);
  const { ctx, p, wacht } = await open({ courses: [c], widgets: [w], clock: true });
  await p.goto(BASE + '#/cursus/lees/DLN123', { waitUntil: 'networkidle' });
  await wacht(300);
  await p.locator('.question-card').first().waitFor({ timeout: 15000 }).catch(() => {});
  check('LL1: de oefening start vóór de deadline', await p.locator('.question-card').first().isVisible());
  await p.locator('.answer-option').first().click();
  await p.getByRole('button', { name: /Volgende/ }).click();
  await wacht(300);
  await p.locator('.answer-option').nth(1).click();
  await p.clock.fastForward(120000); // de deadline (1 minuut) verstrijkt tijdens het werken
  await wacht(1100);
  // typen in de notities hertekent de hele lezer: vroeger sloot dat de oefening alsnog af
  await p.locator('textarea[aria-label="Mijn notities bij deze sectie"]').fill('Even noteren');
  await wacht(900);
  check('LL1: na de deadline blijft de oefening staan', await p.locator('.question-card').first().isVisible());
  check('LL1: geen melding "afgesloten" midden in het werk', (await p.getByText(/oefening is afgesloten/).count()) === 0);
  check('LL1: het gekozen antwoord is nog geselecteerd', (await p.locator('.answer-option.selected').count()) === 1);
  await p.getByRole('button', { name: /Indienen/ }).click();
  await wacht(600);
  const subs = (await opslagJson(p, 'wf.submissions.v1', []));
  check('LL1: indienen na de deadline bewaart de inzending', subs.length === 1, `aantal=${subs.length}`);
  check('LL1: "Ingediend" zichtbaar', await p.getByText(/Ingediend — goed gedaan/).first().isVisible());
  // een nieuwe poging kan na de deadline niet meer; het resultaat blijft staan
  await p.getByRole('button', { name: /Opnieuw proberen/ }).click();
  await wacht(300);
  check('LL1: "Opnieuw proberen" na de deadline: de knop verdwijnt', (await p.getByRole('button', { name: /Opnieuw proberen/ }).count()) === 0);
  check('LL1: ... met uitleg', await p.getByText(/deadline is verstreken: opnieuw proberen kan niet meer/).first().isVisible());
  check('LL1: ... en het resultaat blijft staan', await p.getByText(/Ingediend — goed gedaan/).first().isVisible());
  check('LL1: de lezer crasht niet', !(await crashed(p)));
  await ctx.close();
});
await geval(async () => {
  const w = quiz('w_voorbij', 'Voorbije oefening', { expiresAt: new Date(Date.now() - 60000).toISOString() });
  const c = cursus('c_voorbij', 'VRB123', [sectie('s1', 'Les', [{ id: 'b1', type: 'widget', widgetId: 'w_voorbij' }])]);
  const { ctx, p } = await open({ courses: [c], widgets: [w] });
  await naar(p, '#/cursus/lees/VRB123');
  check('LL1: een deadline die al voorbij is bij het openen toont "afgesloten"', await p.getByText(/Deze oefening is afgesloten/).first().isVisible());
  check('LL1: ... zonder speler', (await p.locator('.question-card').count()) === 0);
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('W15d. Een lichte accentkleur geeft leesbare tekst');
await geval(async () => {
  const w = quiz('w_geel', 'Gele oefening', { accentColor: '#ffe14d' });
  const c = cursus('c_geel', 'GEL123', [
    sectie('s1', 'Les', [
      { id: 'b1', type: 'checklist', items: [{ id: 'i1', text: 'een' }, { id: 'i2', text: 'twee' }] },
      { id: 'b2', type: 'widget', widgetId: 'w_geel' },
    ]),
  ], { accentColor: '#ffe14d' });
  const { ctx, p } = await open({ courses: [c], widgets: [w] });
  await naar(p, '#/cursus/lees/GEL123');
  await p.locator('.question-card').first().waitFor({ timeout: 15000 }).catch(() => {});
  const schilAccent = await p.evaluate(() => getComputedStyle(document.querySelector('.player-shell')).getPropertyValue('--player-accent').trim());
  const rgbSchil = naarRgb(schilAccent);
  check(`W15d: accent van de cursus is donkerder gemaakt (${schilAccent})`, !!rgbSchil && contrast(rgbSchil, WIT) >= 4.5, `contrast ${rgbSchil ? contrast(rgbSchil, WIT).toFixed(2) : '?'}`);
  const blokAccent = await p.evaluate(() => getComputedStyle(document.querySelector('.course-block .card[style*="--player-accent"]') ?? document.body).getPropertyValue('--player-accent').trim());
  const rgbBlok = naarRgb(blokAccent);
  check(`W15d: accent van de oefening in de cursus is donkerder gemaakt (${blokAccent})`, !!rgbBlok && contrast(rgbBlok, WIT) >= 4.5, `contrast ${rgbBlok ? contrast(rgbBlok, WIT).toFixed(2) : '?'}`);
  await p.locator('.answer-option').first().click();
  const marker = await p.evaluate(() => {
    const m = document.querySelector('.answer-option.selected .marker');
    if (!m) return null;
    const cs = getComputedStyle(m);
    return { bg: cs.backgroundColor, kleur: cs.color };
  });
  const c1 = marker && naarRgb(marker.bg) && naarRgb(marker.kleur) ? contrast(naarRgb(marker.bg), naarRgb(marker.kleur)) : 0;
  check(`W15d: tekst op de gekozen antwoordmarkering haalt 4,5 (${c1.toFixed(2)})`, c1 >= 4.5);
  const vink = await p.evaluate(() => getComputedStyle(document.querySelector('.checkbox-row input')).accentColor);
  const cv = naarRgb(vink) ? contrast(naarRgb(vink), WIT) : 0;
  check(`W15d: het vinkje van de checklist haalt 4,5 tegen wit (${cv.toFixed(2)})`, cv >= 4.5);
  await ctx.close();
});
await geval(async () => {
  const c = cursus('c_blauw', 'BLA123', [sectie('s1', 'Les', [tekst('b1', 'Hallo')])], { accentColor: '#4f46e5' });
  const { ctx, p } = await open({ courses: [c] });
  await naar(p, '#/cursus/lees/BLA123');
  const accent = await p.evaluate(() => getComputedStyle(document.querySelector('.player-shell')).getPropertyValue('--player-accent').trim());
  check(`W15d: een kleur die al genoeg contrast heeft blijft ongewijzigd (${accent})`, accent.toLowerCase() === '#4f46e5');
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('V9. Sectie-id "__proto__" en "constructor" in een bewaarde cursus');
await geval(async () => {
  const c = cursus('c_proto', 'PRO123', [
    sectie('__proto__', 'Eerste sectie', [tekst('b1', 'Eerste tekst')]),
    sectie('constructor', 'Tweede sectie', [tekst('b2', 'Tweede tekst')]),
  ]);
  const { ctx, p } = await open({ courses: [c] });
  await naar(p, '#/cursus/lees/PRO123');
  check('V9: de lezer opent zonder te crashen', !(await crashed(p)) && (await p.getByText('Eerste tekst').first().isVisible()));
  const notitie = p.locator('textarea[aria-label="Mijn notities bij deze sectie"]');
  await notitie.fill('notitie bij proto');
  await sleep(1000);
  check('V9: de notitie bij sectie "__proto__" werkt', (await notitie.inputValue()) === 'notitie bij proto' && !(await crashed(p)));
  await p.getByRole('button', { name: /Tweede sectie/ }).first().click().catch(async () => {
    await p.getByRole('button', { name: 'Inhoudstafel tonen' }).click();
    await p.getByRole('button', { name: /Tweede sectie/ }).first().click();
  });
  await sleep(500);
  check('V9: naar sectie "constructor" zonder crash', (await p.getByText('Tweede tekst').first().isVisible()) && !(await crashed(p)));
  check('V9: sectie "constructor" start zonder notitie van een ander', (await notitie.inputValue()) === '');
  await notitie.fill('notitie bij constructor');
  await sleep(1000);
  const bewaard = await opslag(p, 'wf.coursenotes.c_proto');
  check('V9: beide notities staan bewaard onder hun eigen sectie', !!bewaard && bewaard.includes('"__proto__":"notitie bij proto"') && bewaard.includes('"constructor":"notitie bij constructor"'), String(bewaard));
  await p.reload({ waitUntil: 'networkidle' });
  await sleep(500);
  const na = await p.locator('textarea[aria-label="Mijn notities bij deze sectie"]').inputValue();
  check('V9: na herladen staat de notitie van de eerste sectie er nog', na === 'notitie bij proto' || na === 'notitie bij constructor', na);
  check('V9: de lezer crasht niet na herladen', !(await crashed(p)));
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('A11Y11. De foutpagina van een cursuslink brengt een leerling niet naar de leerkrachtschil');
await geval(async () => {
  const { ctx, p } = await open();
  await naar(p, '#/cursus/open?d=kapot');
  check('A11Y11: foutmelding staat er', await p.getByRole('heading', { name: 'Deze cursuslink werkt niet' }).first().isVisible());
  const naarStart = await p.locator('a[href="#/"]').count();
  check('A11Y11: geen enkele link naar de startpagina van de leerkracht', naarStart === 0, `links=${naarStart}`);
  const knop = p.getByRole('link', { name: 'Code invoeren' });
  check('A11Y11: wel "Code invoeren"', await knop.isVisible());
  await knop.click();
  await sleep(600);
  check('A11Y11: die brengt je naar /meedoen', p.url().endsWith('#/meedoen'), p.url());
  check('A11Y11: er is geen voorbeeldmateriaal gezaaid (geen widgets in de opslag)', ((await opslagJson(p, 'wf.widgets.v1', [])) ?? []).length === 0);
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('A11Y12. "Oefening laden…" in plaats van "Widget laden…"');
await geval(async () => {
  const w = quiz('w_traag', 'Trage oefening');
  const c = cursus('c_traag', 'TRG123', [sectie('s1', 'Les', [{ id: 'b1', type: 'widget', widgetId: 'w_traag' }])]);
  const { ctx, p } = await open({ courses: [c], widgets: [w] });
  // de speler wordt lui geladen: vertraag zijn onderdeel zodat de wachttekst te zien is
  await ctx.route(/\/assets\/quiz-[^/]*\.js(\?.*)?$/, async (route) => { await sleep(2500); await route.continue(); });
  await p.goto(BASE + '#/cursus/lees/TRG123');
  await sleep(1200);
  check('A11Y12: wachttekst "Oefening laden…"', await p.getByText('Oefening laden…').first().isVisible().catch(() => false));
  check('A11Y12: nergens "widget" in de zichtbare tekst', !/widget/i.test(await p.evaluate(() => document.body.innerText)));
  await p.locator('.question-card').first().waitFor({ timeout: 15000 }).catch(() => {});
  check('A11Y12: ook na het laden nergens "widget"', !/widget/i.test(await p.evaluate(() => document.body.innerText)));
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('CU13. Lege blokken zijn voor een leerling onzichtbaar');
await geval(async () => {
  const c = cursus('c_leeg', 'LEG123', [
    sectie('s1', 'Gemengd', [
      tekst('b1', 'Zichtbare tekst'),
      { id: 'b2', type: 'image', url: '', size: 'normal' },
      { id: 'b3', type: 'widget', widgetId: '' },
      { id: 'b4', type: 'pdf', height: 560 },
      { id: 'b5', type: 'widget', widgetId: 'bestaat-niet' },
      tekst('b6', 'Laatste tekst'),
    ]),
    sectie('s2', 'Alleen leeg', [{ id: 'b7', type: 'image', url: '', size: 'normal' }, { id: 'b8', type: 'widget', widgetId: '' }]),
  ]);
  const { ctx, p } = await open({ courses: [c] });
  await naar(p, '#/cursus/lees/LEG123');
  check('CU13: de ingevulde tekst staat er', (await p.getByText('Zichtbare tekst').first().isVisible()) && (await p.getByText('Laatste tekst').first().isVisible()));
  check('CU13: geen "(geen afbeelding gekozen)"', (await p.getByText(/geen afbeelding gekozen/).count()) === 0);
  check('CU13: geen "(geen pdf gekozen)"', (await p.getByText(/geen pdf gekozen/).count()) === 0);
  check('CU13: de lege oefening toont niets, de ontbrekende oefening nog wel (één melding)', (await p.getByText('Oefening niet gevonden.').count()) === 1);
  check('CU13: er blijven drie blokken over', (await p.locator('.course-block').count()) === 3, `blokken=${await p.locator('.course-block').count()}`);
  await p.getByRole('button', { name: 'Inhoudstafel tonen' }).click();
  await p.getByRole('button', { name: /Alleen leeg/ }).first().click();
  await sleep(500);
  check('CU13: een sectie met enkel lege blokken zegt dat ze leeg is', await p.getByText('Deze sectie is nog leeg.').isVisible());
  await naar(p, '#/cursus/print/c_leeg');
  check('CU13: ook de afdruk slaat lege blokken over', (await p.getByText(/geen afbeelding gekozen|geen pdf gekozen/).count()) === 0 && (await p.getByText('Zichtbare tekst').first().isVisible()));
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('A11Y19 en CU14. Eén main en één h1 per scherm, tikdoelen van 44 px (390 px breed)');
await geval(async () => {
  const w = quiz('w_mini', 'Mini-oefening');
  const c = cursus('c_scherm', 'SCH123', [
    sectie('s1', 'Eerste sectie', [
      tekst('b1', 'Lees dit [en klik hier](https://example.com) voor meer.'),
      { id: 'b2', type: 'checklist', items: [{ id: 'i1', text: 'Eerste punt' }, { id: 'i2', text: 'Tweede punt' }] },
    ]),
    sectie('s2', 'Tweede sectie', [tekst('b3', 'Slot.')]),
  ], { requireName: true });
  const leeg = { ...cursus('c_zonder', 'ZND123', []), chapters: [] };
  const { ctx, p } = await open({ courses: [c, leeg], widgets: [w] });

  const staten = [
    ['naampoort', async () => { await naar(p, '#/cursus/lees/SCH123'); }],
    ['lezen', async () => {
      await naar(p, '#/cursus/lees/SCH123');
      await p.fill('#course-student-name', 'Emma');
      await p.getByRole('button', { name: /Start met lezen/ }).click();
      await sleep(600);
    }],
    ['lezen met inhoudstafel open', async () => {
      await p.getByRole('button', { name: 'Inhoudstafel tonen' }).click();
      await sleep(400);
    }],
    ['laatste sectie (cursus afgewerkt?)', async () => {
      await p.getByRole('button', { name: /Tweede sectie/ }).first().click();
      await sleep(500);
    }],
    ['cursus zonder inhoud', async () => { await naar(p, '#/cursus/lees/ZND123'); }],
    ['cursus niet gevonden', async () => { await naar(p, '#/cursus/lees/NOPE99'); }],
    ['cursuslink werkt niet', async () => { await naar(p, '#/cursus/open?d=kapot'); }],
    ['afdruk', async () => { await naar(p, '#/cursus/print/c_scherm'); }],
    ['afdruk: cursus niet gevonden', async () => { await naar(p, '#/cursus/print/nope'); }],
    ['hulp', async () => { await naar(p, '#/hulp'); }],
  ];
  for (const [naam, ga] of staten) {
    await ga();
    const s = await structuur(p);
    check(`A11Y19 (${naam}): één main en één h1`, s.main === 1 && s.h1 === 1, `main=${s.main} h1=${s.h1}`);
    if (['afdruk', 'afdruk: cursus niet gevonden', 'hulp'].includes(naam)) continue; // leerkrachtscherm: geen tikdoelen van 44 px afgedwongen
    const klein = await kleineTikdoelen(p);
    check(`CU14 (${naam}): alle tikdoelen zijn minstens 44 px`, klein.length === 0, klein.join('; '));
    check(`CU14 (${naam}): geen horizontale scroll`, (await overloop(p)) <= 0, `overloop=${await overloop(p)}`);
  }
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('CU15c. "Als leerling": de lezer bewaart niets');
await geval(async () => {
  const nu = Date.now();
  const w = quiz('w_voorbeeld', 'Voorbeeld-oefening', { maxAttempts: 1 });
  const c = cursus('c_voorbeeld', 'VOO123', [
    sectie('s1', 'Les', [tekst('b1', 'Hallo'), { id: 'b2', type: 'checklist', items: [{ id: 'i1', text: 'Punt' }] }, { id: 'b3', type: 'widget', widgetId: 'w_voorbeeld' }]),
  ], { requireName: true });
  void nu;
  const { ctx, p } = await open({ courses: [c], widgets: [w] });
  await naar(p, '#/cursus/lees/VOO123?voorbeeld=1');
  check('CU15c: geen naampoort in het voorbeeld', (await p.locator('#course-student-name').count()) === 0 && (await p.getByText('Hallo').first().isVisible()));
  check('CU15c: het voorbeeld zegt dat er niets bewaard wordt', await p.getByText('Voorbeeld: niets bewaard').first().isVisible());
  check('CU15c: geen voortgangscode in het voorbeeld', (await p.getByText('Voortgangscode').count()) === 0);
  check('CU15c: het voorbeeld loopt niet over op 390 px', (await overloop(p)) <= 0, `overloop=${await overloop(p)}`);
  const kleinVoorbeeld = await kleineTikdoelen(p);
  check('CU15c: ook in het voorbeeld zijn alle tikdoelen 44 px', kleinVoorbeeld.length === 0, kleinVoorbeeld.join('; '));
  await p.getByRole('checkbox').first().click();
  await p.getByRole('button', { name: /Markeer als gelezen/ }).click();
  await p.locator('textarea[aria-label="Mijn notities bij deze sectie"]').fill('een notitie');
  await sleep(1000);
  check('CU15c: geen "bewaard" bij een notitie', !(await p.locator('[role=status]', { hasText: 'bewaard' }).first().isVisible().catch(() => false)));
  await p.locator('.question-card').first().waitFor({ timeout: 15000 }).catch(() => {});
  await p.locator('.answer-option').first().click();
  await p.getByRole('button', { name: /Volgende/ }).click();
  await sleep(300);
  await p.locator('.answer-option').first().click();
  await p.getByRole('button', { name: /Indienen/ }).click();
  await sleep(800);
  check('CU15c: na het indienen staat er dat niets bewaard is', await p.getByText(/in dit voorbeeld wordt niets bewaard/).first().isVisible());
  check('CU15c: een voorbeeldpoging blijft herhaalbaar (maxAttempts telt niet)', await p.getByRole('button', { name: /Opnieuw proberen/ }).isVisible());
  for (const sleutel of ['wf.courseprogress.v1', 'wf.submissions.v1', 'wf.attempts.v1', 'wf.coursenotes.c_voorbeeld', 'wf.coursename.c_voorbeeld']) {
    const v = await opslag(p, sleutel);
    check(`CU15c: ${sleutel} blijft leeg`, v === null || v === '[]' || v === '{}', String(v).slice(0, 80));
  }
  check('CU15c: de lezer crasht niet', !(await crashed(p)));
  await ctx.close();
});
await geval(async () => {
  // Controle: zonder ?voorbeeld=1 bewaart dezelfde cursus wél voortgang en notities.
  const c = cursus('c_echt', 'ECH123', [sectie('s1', 'Les', [tekst('b1', 'Hallo')])], { requireName: false });
  const { ctx, p } = await open({ courses: [c] });
  await naar(p, '#/cursus/lees/ECH123');
  await p.getByRole('button', { name: /Markeer als gelezen/ }).click();
  await p.locator('textarea[aria-label="Mijn notities bij deze sectie"]').fill('echte notitie');
  await sleep(1000);
  const voortgang = await opslagJson(p, 'wf.courseprogress.v1', []);
  check('CU15c (controle): gewoon lezen bewaart voortgang', Array.isArray(voortgang) && voortgang.length === 1);
  check('CU15c (controle): gewoon lezen bewaart notities', ((await opslag(p, 'wf.coursenotes.c_echt')) ?? '').includes('echte notitie'));
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('CU15d. De hulp noemt de juiste knoppen');
await geval(async () => {
  const { ctx, p } = await open();
  await naar(p, '#/hulp');
  // textContent: de antwoorden staan in dichte <details>-blokken, die innerText overslaat
  const tekstHulp = await p.evaluate(() => document.body.textContent ?? '');
  check('CU15d: "Delen als pakket" staat in de hulp', tekstHulp.includes('Delen als pakket'));
  check('CU15d: ... samen met de knop "Map"', /"Map" en dan "Delen als pakket"/.test(tekstHulp));
  check('CU15d: de oude knopnaam "Map delen" niet meer', !tekstHulp.includes('Map delen'));
  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('CU12. De voorbeeldcursus en haar oefeningen tellen niet als eigen materiaal');
await geval(async () => {
  // Oefeningen van de voorbeeldcursus: geen "Voorbeeld:"-titel, wel de voorbeeldmap.
  const oef = (id, titel) => ({ ...quiz(id, titel), folderId: 'nw-voorbeeld-1e-graad-map' });
  const c = cursus('nw-voorbeeld-1e-graad', 'NWV123', [sectie('s1', 'Les', [tekst('b1', 'Hallo')])]);
  const { ctx, p } = await open({ courses: [c], widgets: [oef('nw-vb-1', 'Begrippenquiz: krachten'), oef('nw-vb-2', 'Koppelspel: soorten')] });
  await naar(p, '#/');
  check('CU12: alleen voorbeeldmateriaal: de startpagina is nog "eerste bezoek"', await p.getByText('Hoe het in elkaar zit').first().isVisible());
  await ctx.close();
});
await geval(async () => {
  const eigen = quiz('w_eigen', 'Mijn eigen quiz');
  const { ctx, p } = await open({ widgets: [eigen] });
  await naar(p, '#/');
  check('CU12 (controle): met een eigen widget toont de startpagina het dashboard', (await p.getByText('Hoe het in elkaar zit').count()) === 0);
  await ctx.close();
});

// ── Slot ────────────────────────────────────────────────────────────────────
console.log('\n──────────');
if (errors.length) {
  console.log('Console-/paginafouten:');
  for (const e of [...new Set(errors)]) console.log('  •', e.slice(0, 300));
  failures += errors.length;
} else {
  console.log('Geen console- of paginafouten. ✓');
}
console.log(failures === 0 ? 'ALLE CURSUSLEZER-CHECKS GESLAAGD ✓' : `${failures} CHECKS GEFAALD ✗`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
