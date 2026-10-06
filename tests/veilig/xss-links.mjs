// Rooktest beveiliging: gedeelde inhoud mag nooit script uitvoeren in de app.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/veilig/xss-links.mjs
//
// Elke aanval probeert de (nep-)API-sleutel uit localStorage te lezen en in
// window.__xss te zetten. Per geval een vers browserprofiel; verzoeken naar
// buiten worden afgebroken. Faalt hard (exit 1) als window.__xss ergens gezet
// wordt, als de app crasht of bij een paginafout.
//
//  V1  javascript:-URL's in een pdf-blok, bijlage, gesplitst werkblad (pdf en
//      video), klaspakket — via een link én als al bewaarde inhoud.
//  V7  svg en html als same-origin blob:-URL ("openen in nieuw tabblad"):
//      svg blijft data:, al de rest krijgt een passief type.
//  V9  id's als "__proto__" of "constructor" laten het leesscherm niet crashen.

import { chromium } from 'playwright-core';
import LZString from 'lz-string';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
const ORIGIN = new URL(BASE).origin;
const SLEUTEL = JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-NEP-SLEUTEL-ROOKTEST', model: 'm' });
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Aanvalsladingen ─────────────────────────────────────────────────────────

const LEES = 'window.__xss=localStorage.getItem("wf.ai.v1")';
const LEES_PARENT = 'window.parent.__xss=window.parent.localStorage.getItem("wf.ai.v1")';
const JS_VARIANTEN = {
  'javascript:': `javascript:${LEES_PARENT};void 0`,
  '" JaVaScRiPt:" (hoofdletters, spatie)': ` JaVaScRiPt:${LEES_PARENT};void 0`,
  '"\\u0001javascript:" (controleteken)': `\u0001javascript:${LEES_PARENT};void 0`,
  '"java\\tscript:" (tab)': `java\tscript:${LEES_PARENT};void 0`,
  'data:text/html': `data:text/html,<script>try{${LEES_PARENT}}catch(e){}</script>`,
};
const OPVULLING = '<!--' + 'x'.repeat(3000) + '-->'; // groot genoeg om naar IndexedDB te verhuizen
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" onload='${LEES}'><rect width="200" height="100" fill="red"/>${OPVULLING}</svg>`;
const HTML = `<html><body><script>${LEES}</script>${OPVULLING}</body></html>`;
const b64 = (s) => Buffer.from(s).toString('base64');
const SVG_DATA_URL = 'data:image/svg+xml;base64,' + b64(SVG);
const HTML_DATA_URL = 'data:text/html;base64,' + b64(HTML);

// ── Inhoud ──────────────────────────────────────────────────────────────────

function course(blocks, extra = {}) {
  return {
    id: 'c_aanval', title: 'Cursus', author: '', coverEmoji: 'x', code: 'ATK123',
    chapters: [{ id: 'ch1', title: 'H1', sections: [{ id: 's1', title: 'S1', blocks }] }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    createdAt: 1, updatedAt: 1, ...extra,
  };
}
const lz = (o) => LZString.compressToEncodedURIComponent(JSON.stringify(o));
const courseLink = (c) => `${BASE}#/cursus/open?d=${lz({ v: 1, kind: 'cursus', c, w: [] })}`;
const widgetLink = (w) => `${BASE}#/open?d=${lz({ v: 1, w })}`;
const WIDGET_SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

/** Vers profiel met de nep-sleutel; geeft { ctx, page, errors } terug. */
async function freshPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(BASE);
  await page.evaluate((k) => localStorage.setItem('wf.ai.v1', k), SLEUTEL);
  return { ctx, page, errors };
}

async function xss(page) {
  return page.evaluate(() => window.__xss).catch(() => undefined);
}
async function crashed(page) {
  return (await page.getByText(/Er ging iets mis/).count()) > 0;
}
/** Geen script gelopen, geen crash, geen paginafout. */
async function veilig(naam, { page, errors }) {
  const x = await xss(page);
  check(`${naam}: geen script uitgevoerd`, x === undefined, `__xss=${String(x).slice(0, 40)}`);
  check(`${naam}: app crasht niet`, !(await crashed(page)));
  check(`${naam}: geen paginafout`, errors.length === 0, errors.join(' | '));
}

/**
 * "Openen in nieuw tabblad": de URL top-level openen. Veilig als er niets
 * draait in de origin van de app (download, of eigen ondoorzichtige origin).
 */
async function openInNieuwTabblad(ctx, url) {
  const p2 = await ctx.newPage();
  let download = false;
  try {
    await p2.goto(url, { timeout: 5000 });
  } catch (e) {
    download = /download/i.test(e.message);
  }
  await sleep(600);
  const info = await p2.evaluate(() => ({ origin: location.origin, xss: window.__xss })).catch(() => ({ origin: '?', xss: undefined }));
  await p2.close();
  return { ...info, download };
}

/** Bestanden rechtstreeks in IndexedDB zetten (zoals een oudere versie ze bewaarde). */
async function zetBestanden(page, recs) {
  await page.evaluate(async (recs) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('wf-files', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const t = db.transaction('pdfs', 'readwrite');
      for (const x of recs) {
        const blob = new Blob([x.text], { type: x.type });
        t.objectStore('pdfs').put({ id: x.id, name: x.name, blob, size: blob.size, createdAt: Date.now() });
      }
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  }, recs);
}

// ── V1: javascript:-URL's ───────────────────────────────────────────────────

console.log('V1a. Cursuslink met pdf-blok (nul klikken)');
for (const [naam, url] of Object.entries(JS_VARIANTEN)) {
  const t = await freshPage();
  await t.page.goto(courseLink(course([{ id: 'b1', type: 'pdf', url, height: 300 }, { id: 'b2', type: 'text', markdown: 'Tekst na de pdf' }])));
  await sleep(3500);
  const iframes = await t.page.locator('iframe').evaluateAll((a) => a.map((x) => x.getAttribute('src') || ''));
  check(`pdf ${naam}: geen iframe met een niet-web-adres`, iframes.every((s) => /^https?:\/\//.test(s)), JSON.stringify(iframes));
  await veilig(`pdf ${naam}`, t);
  await t.ctx.close();
}

console.log('V1b. Al bewaarde cursus met pdf-blok (controle bij gebruik, PdfViewer)');
for (const [naam, url] of Object.entries(JS_VARIANTEN)) {
  const t = await freshPage();
  await t.page.evaluate((c) => localStorage.setItem('wf.courses.v1', JSON.stringify([c])), course([{ id: 'b1', type: 'pdf', url, height: 300 }]));
  await t.page.goto(`${BASE}#/cursus/lees/ATK123`);
  await sleep(3500);
  check(`bewaard pdf ${naam}: melding "alleen https://"`, await t.page.getByText(/alleen https:\/\/-adressen/).first().isVisible().catch(() => false));
  check(`bewaard pdf ${naam}: geen iframe`, (await t.page.locator('iframe').count()) === 0);
  await veilig(`bewaard pdf ${naam}`, t);
  await t.ctx.close();
}

console.log('V1c. Bijlage met javascript:-dataUrl (link + klik)');
for (const [waar, opzet] of [
  ['via cursuslink', async (page, c) => page.goto(courseLink(c))],
  ['al bewaard', async (page, c) => { await page.evaluate((c) => localStorage.setItem('wf.courses.v1', JSON.stringify([c])), c); await page.goto(`${BASE}#/cursus/lees/ATK123`); }],
]) {
  for (const [naam, url] of Object.entries(JS_VARIANTEN)) {
    const t = await freshPage();
    await opzet(t.page, course([{ id: 'b1', type: 'attachment', name: 'huiswerk.pdf', dataUrl: url.replaceAll('window.parent.', 'window.') }]));
    await sleep(3000);
    check(`bijlage ${waar} ${naam}: kaart staat er`, await t.page.getByText('huiswerk.pdf').first().isVisible().catch(() => false));
    const hrefs = await t.page.locator('a[download]').evaluateAll((a) => a.map((x) => x.getAttribute('href') || ''));
    check(`bijlage ${waar} ${naam}: geen downloadlink met dit adres`, hrefs.every((h) => h.startsWith('data:') || h.startsWith('blob:')), JSON.stringify(hrefs).slice(0, 80));
    await t.page.getByText('huiswerk.pdf').first().click().catch(() => {});
    await sleep(800);
    await veilig(`bijlage ${waar} ${naam}`, t);
    await t.ctx.close();
  }
}

console.log('V1d. Deellink gesplitst werkblad met pdfUrl (na "Starten")');
for (const [naam, url] of Object.entries(JS_VARIANTEN)) {
  const t = await freshPage();
  const w = {
    id: 'w_a', type: 'splitworksheet', title: 'Opdracht', code: 'ATK999', folderId: null, createdAt: 1, updatedAt: 1, settings: WIDGET_SETTINGS,
    config: { source: { kind: 'pdf', pdfUrl: url }, questions: [{ id: 'q1', type: 'short', prompt: 'Vraag?', points: 1, accepted: ['a'], caseSensitive: false }] },
  };
  await t.page.goto(widgetLink(w));
  await sleep(2500);
  await t.page.getByRole('button', { name: /Starten/ }).first().click({ timeout: 4000 }).catch(() => {});
  await sleep(3000);
  check(`werkblad-pdf ${naam}: melding "alleen https://"`, await t.page.getByText(/alleen https:\/\/-adressen/).first().isVisible().catch(() => false));
  check(`werkblad-pdf ${naam}: geen iframe`, (await t.page.locator('iframe').count()) === 0);
  await veilig(`werkblad-pdf ${naam}`, t);
  await t.ctx.close();
}

console.log('V1e. Klaspakket met een cursus met pdf-blok');
{
  const t = await freshPage();
  const c = course([{ id: 'b1', type: 'pdf', url: JS_VARIANTEN['javascript:'], height: 300 }, { id: 'b2', type: 'attachment', name: 'huiswerk.pdf', dataUrl: `javascript:${LEES};void 0` }], { id: 'c_pack', code: 'PCK123' });
  const pack = {
    v: 1, kind: 'klas', klas: { id: 'k1', name: '1A', code: 'KLAS11', students: [{ id: 'l1', name: 'Emma' }], createdAt: 1, updatedAt: 1 },
    opdrachten: [{ id: 'o1', classId: 'k1', kind: 'course', targetId: 'c_pack', createdAt: 1, course: c, widgets: [] }],
  };
  await t.page.goto(`${BASE}#/klas/open?d=${lz(pack)}`);
  await sleep(3000);
  const emma = t.page.getByRole('button', { name: /Emma/ });
  if (await emma.count()) { await emma.first().click(); await sleep(1000); }
  const start = t.page.getByRole('link', { name: /^Starten/ }).or(t.page.getByRole('button', { name: /^Starten/ })).first();
  if (await start.count()) { await start.click(); await sleep(3500); }
  await t.page.locator('a[download]').first().click({ timeout: 1000 }).catch(() => {});
  await sleep(500);
  const bewaard = await t.page.evaluate(() => localStorage.getItem('wf.courses.v1') || '');
  check('klaspakket: bewaarde cursus bevat geen javascript:', !/javascript:/i.test(bewaard));
  await veilig('klaspakket', t);
  await t.ctx.close();
}

console.log('V1f. Video-link in gesplitst werkblad en gesplitst bord');
for (const type of ['splitworksheet', 'splitwhiteboard']) {
  const t = await freshPage();
  const source = { kind: 'video', videoUrl: `javascript:${LEES};void 0` };
  const config = type === 'splitwhiteboard'
    ? { source, prompt: 'Teken' }
    : { source, questions: [{ id: 'q1', type: 'short', prompt: 'V?', points: 1, accepted: ['a'], caseSensitive: false }] };
  await t.page.goto(widgetLink({ id: 'w_v', type, title: 'T', code: 'VID999', folderId: null, createdAt: 1, updatedAt: 1, settings: WIDGET_SETTINGS, config }));
  await sleep(2500);
  await t.page.getByRole('button', { name: /Starten/ }).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(1500);
  check(`${type} video: melding staat er`, await t.page.getByText(/kan niet ingesloten worden/).first().isVisible().catch(() => false));
  check(`${type} video: geen link naar het javascript:-adres`, (await t.page.getByRole('link', { name: /Open de video/ }).count()) === 0);
  await veilig(`${type} video`, t);
  await t.ctx.close();
}

// ── V7: svg en html als blob:-URL ───────────────────────────────────────────

console.log('V7a. Svg-afbeelding uit een cursuslink blijft data: (ook na herladen)');
{
  const t = await freshPage();
  await t.page.goto(courseLink(course([{ id: 'b1', type: 'image', url: SVG_DATA_URL, caption: 'foto' }])));
  await sleep(5000);
  await t.page.reload();
  await sleep(3500);
  const img = t.page.locator('figure img').first();
  const src = await img.evaluate((x) => x.src).catch(() => '');
  check('svg: img-bron is een data:-URL, geen blob:', src.startsWith('data:image/svg+xml'), src.slice(0, 40));
  check('svg: afbeelding wordt getoond', (await img.evaluate((x) => x.naturalWidth).catch(() => 0)) > 0);
  const tab = await openInNieuwTabblad(t.ctx, src);
  check('svg: "afbeelding openen in nieuw tabblad" leest de sleutel niet', tab.xss === undefined && tab.origin !== ORIGIN, JSON.stringify(tab));
  await veilig('svg uit cursuslink', t);
  await t.ctx.close();
}

console.log('V7b. Html-bijlage: na verhuizen naar IndexedDB geen html-blob:-URL');
{
  const t = await freshPage();
  await t.page.goto(courseLink(course([{ id: 'b1', type: 'attachment', name: 'werkblad.pdf', dataUrl: HTML_DATA_URL }])));
  await sleep(5000);
  await t.page.reload();
  await sleep(3500);
  const href = await t.page.locator('a[download]').first().getAttribute('href').catch(() => '');
  check('html-bijlage: er is een downloadlink', !!href);
  const tab = await openInNieuwTabblad(t.ctx, href);
  check('html-bijlage: "link openen in nieuw tabblad" voert niets uit in de app', tab.xss === undefined, JSON.stringify(tab));
  await veilig('html-bijlage', t);
  await t.ctx.close();
}

console.log('V7c. Al bewaarde records (oudere versie): svg blijft zichtbaar, html wordt niet uitgevoerd');
{
  const t = await freshPage();
  await zetBestanden(t.page, [
    { id: 'm_svgoud', name: 'tekening.svg', type: 'image/svg+xml', text: SVG },
    { id: 'm_htmloud', name: 'pagina.html', type: 'text/html', text: HTML },
  ]);
  await t.page.evaluate((c) => localStorage.setItem('wf.courses.v1', JSON.stringify([c])), course([
    { id: 'b1', type: 'image', url: 'wfmedia:m_svgoud', caption: 'oude svg' },
    { id: 'b2', type: 'attachment', name: 'pagina.html', dataUrl: 'wfmedia:m_htmloud' },
  ]));
  await t.page.goto(`${BASE}#/cursus/lees/ATK123`);
  await t.page.reload();
  await sleep(3500);
  const img = t.page.locator('figure img').first();
  const src = await img.evaluate((x) => x.src).catch(() => '');
  check('oude svg: wordt een data:-URL', src.startsWith('data:image/svg+xml'), src.slice(0, 40));
  check('oude svg: afbeelding wordt getoond', (await img.evaluate((x) => x.naturalWidth).catch(() => 0)) > 0);
  const href = await t.page.locator('a[download]').first().getAttribute('href').catch(() => '');
  check('oude html: downloadlink is een blob:', (href || '').startsWith('blob:'), href);
  const tab = await openInNieuwTabblad(t.ctx, href);
  check('oude html: openen in nieuw tabblad voert niets uit', tab.xss === undefined, JSON.stringify(tab));
  check('oude svg: verwijzing blijft in de opslag', (await t.page.evaluate(() => localStorage.getItem('wf.courses.v1') || '')).includes('wfmedia:m_svgoud'));
  await veilig('oude records', t);
  await t.ctx.close();
}

console.log('V7d. Resultaatcode met een svg-"tekening" en ingeleverd html-bestand van een leerling');
{
  const t = await freshPage();
  const w = {
    id: 'w_wb', type: 'whiteboard', title: 'Tekenopdracht', code: 'TEKEN1', folderId: null, createdAt: 1, updatedAt: 1,
    settings: { ...WIDGET_SETTINGS, requireName: true }, config: { prompt: 'Teken iets' },
  };
  const sub = {
    id: 's_x', widgetId: 'w_wb', widgetCode: 'TEKEN1', studentName: 'Emma', startedAt: 1, submittedAt: Date.now(), durationSec: 5,
    answers: { tekening: SVG_DATA_URL }, itemScores: null, totalEarned: 0, totalMax: 0, status: 'submitted',
  };
  await t.page.evaluate((w) => localStorage.setItem('wf.widgets.v1', JSON.stringify([w])), w);
  await t.page.goto(`${BASE}#/inleverpunt`);
  await sleep(2000);
  await t.page.locator('textarea').first().fill('WF1.' + lz(sub));
  await t.page.getByRole('button', { name: /Toevoegen|Verwerken|Inlezen|Importeren|Bewaren/i }).first().click().catch(() => {});
  await sleep(2500);
  await t.page.reload();
  await sleep(2500);
  check('resultaatcode: svg-tekening staat niet als verwijzing in de opslag', !(await t.page.evaluate(() => localStorage.getItem('wf.submissions.v1') || '')).includes('wfmedia:'));
  await t.page.goto(`${BASE}#/resultaten/w_wb`);
  await sleep(2500);
  await t.page.getByText('Emma').first().click().catch(() => {});
  await sleep(1500);
  const srcs = await t.page.locator('img').evaluateAll((a) => a.map((x) => x.src));
  check('resultaatcode: geen blob:-afbeelding op de resultatenpagina', srcs.every((s) => !s.startsWith('blob:')), JSON.stringify(srcs.map((s) => s.slice(0, 30))));
  for (const s of srcs.filter((s) => s.startsWith('data:image/svg'))) {
    const tab = await openInNieuwTabblad(t.ctx, s);
    check('resultaatcode: tekening in nieuw tabblad leest de sleutel niet', tab.xss === undefined && tab.origin !== ORIGIN, JSON.stringify(tab));
  }
  await veilig('resultaatcode svg', t);
  await t.ctx.close();
}
{
  const t = await freshPage();
  const w = {
    id: 'w_up', type: 'quiz', title: 'Inleveren', code: 'UPLD01', folderId: null, createdAt: 1, updatedAt: 1, settings: { ...WIDGET_SETTINGS, requireName: true },
    config: { questions: [{ id: 'q1', type: 'upload', prompt: 'Lever je verslag in', points: 1, accept: '', maxMb: 2 }] },
  };
  const sub = {
    id: 's_up', widgetId: 'w_up', widgetCode: 'UPLD01', studentName: 'Emma', startedAt: 1, submittedAt: Date.now(), durationSec: 5,
    answers: { q1: { name: 'verslag.html', size: HTML.length, fileId: 'f_leerling' } }, itemScores: null, totalEarned: 0, totalMax: 1, status: 'submitted',
  };
  await zetBestanden(t.page, [{ id: 'f_leerling', name: 'verslag.html', type: 'text/html', text: HTML }]);
  await t.page.evaluate(([w, s]) => { localStorage.setItem('wf.widgets.v1', JSON.stringify([w])); localStorage.setItem('wf.submissions.v1', JSON.stringify([s])); }, [w, sub]);
  await t.page.goto(`${BASE}#/resultaten/w_up`);
  await sleep(2500);
  await t.page.getByText('Emma').first().click().catch(() => {});
  await sleep(1500);
  const href = await t.page.locator('a[download="verslag.html"]').first().getAttribute('href').catch(() => null);
  check('leerlingbestand: downloadlink staat er', !!href);
  if (href) {
    const tab = await openInNieuwTabblad(t.ctx, href);
    check('leerlingbestand: html in nieuw tabblad voert niets uit', tab.xss === undefined, JSON.stringify(tab));
  }
  await veilig('leerlingbestand', t);
  await t.ctx.close();
}

// ── V9: id's uit Object.prototype ───────────────────────────────────────────

console.log('V9. Sectie-id "__proto__" of "constructor"');
for (const id of ['__proto__', 'constructor']) {
  const t = await freshPage();
  const c = course([{ id: 'b1', type: 'text', markdown: 'Hallo' }, { id: 'b2', type: 'checklist', items: [{ id: 'i1', text: 'a' }] }]);
  c.chapters[0].sections[0].id = id;
  c.chapters[0].id = id;
  await t.page.goto(courseLink(c));
  await sleep(4000);
  await t.page.getByRole('checkbox').first().click().catch(() => {});
  await sleep(500);
  for (const route of ['#/cursus/lees/ATK123', '#/cursussen', '#/cursus/volg/c_aanval']) {
    await t.page.goto(BASE + route);
    await sleep(1500);
    check(`id ${id}: ${route} crasht niet`, !(await crashed(t.page)));
  }
  const proto = await t.page.evaluate(() => ['secondsSpent', 'completedAt', 'checks', 'blocks'].filter((k) => k in {}));
  check(`id ${id}: Object.prototype onaangeroerd`, proto.length === 0, proto.join(','));
  await veilig(`id ${id}`, t);
  await t.ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} controle(s) gefaald` : '\nAlle controles geslaagd');
process.exit(failures ? 1 : 0);
