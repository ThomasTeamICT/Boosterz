// Rooktest herstelpakket GEDEELD (debugronde oktober 2026): gedeelde inhoud,
// klaspakketten en cursusbestanden.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/gedeeld.mjs
//
//  LL3  Een nieuwere versie via een klaspakket werkt een oefening/cursus bij;
//       een oudere versie (oude link) zet niets terug.
//  V3   Een klaspakket met een cursus en oefening die de leerkracht al heeft
//       en wijzigde: eerst een vraag (bijwerken, eigen versie houden, kopie).
//  V3   Hetzelfde bij een cursusbestand op de cursuspagina.
//  CU4  Exporteren zet de geüploade pdf in het bestand; importeren zet hem terug.
//  CU15a Een ongewijzigd eigen bestand terug importeren vraagt niets.
//  LL9  "Link of bestand zelf openen" na een kapotte klaslink toont het loket.
//  LL12 Een geplakte klaslink met %2B of spaties werkt.
//
// Herstelpakket H1 (cursuslink, /cursus/open):
//  S1   Een cursus uit een bestand (back-up) of het voorbeeld is eigen werk:
//       een link met dezelfde id's vervangt ze niet stil, er komt een vraag.
//  S3   Een eigen oefening in een zuivere cursus: de link vraagt eerst en
//       noemt de oefening; "Bijwerken" vervangt alleen wat de vraag noemde.
//  G4   Eerst een gedeeltelijke link, daarna de volledige met dezelfde
//       versie: alle hoofdstukken. Leerlinglink v1 → v2 werkt stil bij.
//
// Per scenario een vers browserprofiel; verzoeken naar buiten worden
// afgebroken. Faalt hard (exit 1) bij een mislukte controle of paginafout.

import { chromium } from 'playwright-core';
import LZString from 'lz-string';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lz = (o) => LZString.compressToEncodedURIComponent(JSON.stringify(o));

// ── Inhoud ──────────────────────────────────────────────────────────────────

const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };

function quiz({ id = 'w_ged', title, answer, updatedAt }) {
  return {
    id, type: 'quiz', title, folderId: null, code: 'GED001', createdAt: 1, updatedAt, settings: SETTINGS,
    config: { questions: [{ id: 'q1', type: 'tf', prompt: 'Water kookt bij 100 °C.', points: 1, answer }] },
  };
}

function cursus({ id = 'c_ged', title, updatedAt, widgetId = 'w_ged', extra = [] }) {
  return {
    id, title, author: '', coverEmoji: '💧', code: 'CGED01', createdAt: 1, updatedAt,
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    chapters: [{ id: 'ch1', title: 'Hoofdstuk', sections: [{ id: 's1', title: 'Sectie', optional: false, blocks: [
      { id: 'b1', type: 'text', markdown: 'Tekst' },
      { id: 'b2', type: 'widget', widgetId },
      ...extra,
    ] }] }],
  };
}

function pakket(c, w, code = 'KLASGD') {
  return {
    v: 1, kind: 'klas',
    klas: { id: 'k_' + code, name: 'Klas ' + code, code, students: [{ id: 'l1', name: 'Emma' }, { id: 'l2', name: 'Noah' }], createdAt: 1, updatedAt: 1 },
    opdrachten: [
      { id: 'a1', classId: 'k_' + code, kind: 'course', targetId: c.id, createdAt: 2, course: c, widgets: [w] },
      { id: 'a2', classId: 'k_' + code, kind: 'widget', targetId: w.id, createdAt: 1, widget: w },
    ],
  };
}
const pakketLink = (p) => `${BASE}#/klas/open?d=${lz(p)}`;

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

async function freshPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(BASE);
  return { ctx, page, errors };
}

const opslag = (page) => page.evaluate(() => ({
  widgets: JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]'),
  courses: JSON.parse(localStorage.getItem('wf.courses.v1') || '[]'),
  packs: JSON.parse(localStorage.getItem('wf.classpacks.v1') || '[]'),
}));
const vind = (lijst, id) => lijst.find((x) => x.id === id);

/** Pakketlink openen en wachten tot de hub of de vraag er staat. */
async function openPakket(page, p) {
  await page.goto(pakketLink(p));
  await page.waitForFunction(
    () => /#\/leerling\//.test(location.hash) || [...document.querySelectorAll('h1')].some((h) => /Er staat al een versie/.test(h.textContent || '')),
    null, { timeout: 10000 },
  ).catch(() => {});
  await sleep(300);
}
const opHub = (page) => /#\/leerling\//.test(page.url());
const vraagZichtbaar = (page) => page.getByRole('heading', { level: 1, name: /Er staat al een versie op dit toestel/ }).isVisible().catch(() => false);

async function geenOverloop(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Pdf in IndexedDB zetten, lezen of wissen (zelfde database als lib/idb.ts). */
async function idb(page, actie, rec) {
  return page.evaluate(async ({ actie, rec }) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('wf-files', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const uit = await new Promise((res, rej) => {
      const t = db.transaction('pdfs', actie === 'lees' ? 'readonly' : 'readwrite');
      const s = t.objectStore('pdfs');
      let out = null;
      if (actie === 'zet') {
        const blob = new Blob([rec.text], { type: 'application/pdf' });
        s.put({ id: rec.id, name: rec.name, blob, size: blob.size, createdAt: Date.now() });
      } else if (actie === 'wis') {
        s.delete(rec.id);
      } else {
        const g = s.get(rec.id);
        g.onsuccess = () => { out = g.result ? { name: g.result.name, size: g.result.size, type: g.result.blob.type } : null; };
      }
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
    db.close();
    return uit;
  }, { actie, rec });
}

const NU = Date.now();

// ── LL3: een nieuwere versie werkt bij, een oudere nooit ────────────────────

console.log('LL3. Klaspakket opnieuw: v1 → v2 → v1 op het toestel van een leerling');
{
  const t = await freshPage();
  const v1 = pakket(cursus({ title: 'Cursus v1', updatedAt: NU - 7200_000 }), quiz({ title: 'Quiz v1', answer: false, updatedAt: NU - 7200_000 }));
  const v2 = pakket(cursus({ title: 'Cursus v2', updatedAt: NU - 3600_000 }), quiz({ title: 'Quiz v2', answer: true, updatedAt: NU - 3600_000 }));

  await openPakket(t.page, v1);
  check('v1: zonder vraag naar de leerlinghub', opHub(t.page) && !(await vraagZichtbaar(t.page)));
  let s = await opslag(t.page);
  check('v1: oefening en cursus bewaard met de versie van de bron', vind(s.widgets, 'w_ged')?.updatedAt === NU - 7200_000 && vind(s.courses, 'c_ged')?.title === 'Cursus v1');

  await openPakket(t.page, v2);
  check('v2 (nieuwer): geen vraag, naar de hub', opHub(t.page) && !(await vraagZichtbaar(t.page)));
  s = await opslag(t.page);
  const w = vind(s.widgets, 'w_ged');
  check('v2: oefening bijgewerkt, met de verbeterde sleutel', w?.title === 'Quiz v2' && w?.config.questions[0].answer === true, JSON.stringify(w?.config.questions[0]));
  check('v2: cursus bijgewerkt', vind(s.courses, 'c_ged')?.title === 'Cursus v2');

  await openPakket(t.page, v1);
  check('oude link (v1) opnieuw: geen vraag', opHub(t.page) && !(await vraagZichtbaar(t.page)));
  s = await opslag(t.page);
  check('oude link zet niets terug: oefening blijft v2', vind(s.widgets, 'w_ged')?.title === 'Quiz v2' && vind(s.widgets, 'w_ged')?.config.questions[0].answer === true);
  check('oude link zet niets terug: cursus blijft v2', vind(s.courses, 'c_ged')?.title === 'Cursus v2');
  check('LL3: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ── V3: klaspakket met eigen werk van de leerkracht ─────────────────────────

console.log('V3. Klaspakket met een cursus en oefening die de leerkracht al heeft en wijzigde');
{
  const t = await freshPage();
  // Eigen werk: zelf gemaakt en tien minuten geleden nog aangepast.
  const eigenCursus = cursus({ title: 'Mijn cursus', updatedAt: NU - 600_000 });
  const eigenQuiz = quiz({ title: 'Mijn quiz', answer: true, updatedAt: NU - 600_000 });
  await t.page.evaluate(({ c, w }) => {
    localStorage.setItem('wf.courses.v1', JSON.stringify([c]));
    localStorage.setItem('wf.widgets.v1', JSON.stringify([w]));
  }, { c: eigenCursus, w: eigenQuiz });
  // Een geknutseld pakket met dezelfde id's en een versie "uit de toekomst".
  const kaap = pakket(cursus({ title: 'Gekaapt', updatedAt: NU + 10 ** 9 }), quiz({ title: 'Gekaapte quiz', answer: false, updatedAt: NU + 10 ** 9 }), 'KAAP01');

  await openPakket(t.page, kaap);
  check('vraag verschijnt vóór er iets overschreven wordt', await vraagZichtbaar(t.page));
  check('vraag noemt de cursus en de oefening (niet "widget")',
    await t.page.getByText(/Cursus:\s*Gekaapt/).first().isVisible().catch(() => false) &&
    await t.page.getByText(/Oefening:\s*Gekaapte quiz/).first().isVisible().catch(() => false) &&
    !(await t.page.locator('main').innerText()).toLowerCase().includes('widget'));
  let s = await opslag(t.page);
  check('terwijl de vraag openstaat, is er niets veranderd', vind(s.courses, 'c_ged')?.title === 'Mijn cursus' && vind(s.widgets, 'w_ged')?.title === 'Mijn quiz');
  check('vraag: één main en één h1', (await t.page.locator('main').count()) === 1 && (await t.page.locator('h1').count()) === 1);
  const knoppen = ['Bijwerken naar de nieuwe versie', 'Mijn versie houden', 'Als kopie bewaren'];
  const hoogtes = [];
  for (const k of knoppen) {
    const b = t.page.getByRole('button', { name: k });
    hoogtes.push((await b.boundingBox().catch(() => null))?.height ?? 0);
  }
  check('drie keuzes, elk minstens 44 px hoog', hoogtes.every((h) => h >= 44), hoogtes.join(','));
  check('vraag op 390 px zonder horizontaal scrollen', await geenOverloop(t.page));

  await t.page.getByRole('button', { name: 'Mijn versie houden' }).click();
  await t.page.waitForURL(/#\/leerling\//, { timeout: 8000 }).catch(() => {});
  s = await opslag(t.page);
  check('"Mijn versie houden": naar de hub, eigen cursus en oefening ongewijzigd',
    opHub(t.page) && vind(s.courses, 'c_ged')?.title === 'Mijn cursus' && vind(s.widgets, 'w_ged')?.title === 'Mijn quiz');

  await openPakket(t.page, kaap);
  check('opnieuw geopend: opnieuw de vraag (eigen werk blijft eigen werk)', await vraagZichtbaar(t.page));
  await t.page.getByRole('button', { name: 'Als kopie bewaren' }).click();
  await t.page.waitForURL(/#\/leerling\//, { timeout: 8000 }).catch(() => {});
  s = await opslag(t.page);
  const kopieCursus = s.courses.find((c) => c.title === 'Gekaapt (kopie)');
  const kopieQuiz = s.widgets.find((w) => w.title === 'Gekaapte quiz (kopie)');
  check('"Als kopie bewaren": eigen werk ongewijzigd', vind(s.courses, 'c_ged')?.title === 'Mijn cursus' && vind(s.widgets, 'w_ged')?.title === 'Mijn quiz');
  check('"Als kopie bewaren": kopieën staan ernaast met een eigen id', !!kopieCursus && !!kopieQuiz && kopieCursus.id !== 'c_ged' && kopieQuiz.id !== 'w_ged');
  const blok = kopieCursus?.chapters[0].sections[0].blocks.find((b) => b.type === 'widget');
  check('de kopie van de cursus wijst naar de kopie van de oefening', blok?.widgetId === kopieQuiz?.id);
  const opdr = s.packs.find((p) => p.klas.code === 'KAAP01')?.opdrachten ?? [];
  check('de opdrachten van het pakket wijzen naar de kopieën',
    opdr.find((a) => a.kind === 'course')?.targetId === kopieCursus?.id && opdr.find((a) => a.kind === 'widget')?.targetId === kopieQuiz?.id,
    JSON.stringify(opdr.map((a) => a.targetId)));

  await openPakket(t.page, kaap);
  check('derde keer: weer de vraag', await vraagZichtbaar(t.page));
  await t.page.getByRole('button', { name: 'Bijwerken naar de nieuwe versie' }).click();
  await t.page.waitForURL(/#\/leerling\//, { timeout: 8000 }).catch(() => {});
  s = await opslag(t.page);
  check('"Bijwerken": cursus en oefening vervangen door de versie uit het pakket',
    vind(s.courses, 'c_ged')?.title === 'Gekaapt' && vind(s.widgets, 'w_ged')?.title === 'Gekaapte quiz');
  check('V3 pakket: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ── CU4 + CU15a + V3: cursusbestand op de cursuspagina ─────────────────────

console.log('CU4/CU15a/V3. Cursusbestand exporteren en terug importeren');
{
  const t = await freshPage({ width: 1280, height: 900 });
  const pdfBlok = { id: 'b3', type: 'pdf', pdfId: 'pdf_ged', name: 'werkblad.pdf' };
  const eigen = cursus({ id: 'c_bestand', title: 'Cursus met pdf', updatedAt: NU - 600_000, extra: [pdfBlok] });
  await t.page.evaluate(({ c, w }) => {
    localStorage.setItem('wf.courses.v1', JSON.stringify([c]));
    localStorage.setItem('wf.widgets.v1', JSON.stringify([w]));
  }, { c: eigen, w: quiz({ title: 'Mijn quiz', answer: true, updatedAt: NU - 600_000 }) });
  await idb(t.page, 'zet', { id: 'pdf_ged', name: 'werkblad.pdf', text: '%PDF-1.4\n% rooktest\n' });
  await t.page.goto(BASE + '#/cursussen');
  await t.page.getByRole('heading', { name: 'Cursus met pdf' }).waitFor({ timeout: 10000 }).catch(() => {});

  // Exporteren via het menu van de cursus.
  await t.page.getByRole('button', { name: 'Acties voor Cursus met pdf' }).click();
  const [download] = await Promise.all([
    t.page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
    t.page.getByRole('menuitem', { name: /Exporteren/ }).click().catch(() => t.page.getByText('Exporteren').first().click()),
  ]);
  let bestand = null;
  if (download) {
    const pad = await download.path();
    bestand = JSON.parse((await import('node:fs')).readFileSync(pad, 'utf8'));
  }
  check('export bevat de geüploade pdf (CU4)', bestand?.pdfs?.[0]?.id === 'pdf_ged' && bestand.pdfs[0].dataUrl.startsWith('data:application/pdf;base64,'), JSON.stringify(bestand?.pdfs?.map((p) => p.id)));

  const importeer = async (json, naam = 'cursus.json') => {
    await t.page.locator('input[type=file][accept*="json"]').first().setInputFiles({ name: naam, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await sleep(1200);
  };
  const modalOpen = () => t.page.getByRole('dialog').filter({ hasText: 'Er staat al een versie op dit toestel' }).isVisible().catch(() => false);

  if (bestand) {
    // CU15a: eigen ongewijzigd bestand terug → geen vraag.
    await importeer(bestand);
    check('eigen ongewijzigd bestand terug: geen vraag (CU15a)', !(await modalOpen()));
    check('melding: stond al zo op dit toestel', await t.page.getByText(/stond al zo op dit toestel/).first().isVisible().catch(() => false));

    // CU4: pdf kwijt → import zet hem terug.
    await idb(t.page, 'wis', { id: 'pdf_ged' });
    check('pdf even weg uit IndexedDB', (await idb(t.page, 'lees', { id: 'pdf_ged' })) === null);
    await importeer(bestand);
    const terug = await idb(t.page, 'lees', { id: 'pdf_ged' });
    check('import zet de pdf terug (CU4)', terug?.name === 'werkblad.pdf' && terug.type === 'application/pdf' && terug.size > 0, JSON.stringify(terug));
    check('melding noemt de teruggezette pdf', await t.page.getByText(/pdf teruggezet/).first().isVisible().catch(() => false));

    // V3: een andere versie van de eigen cursus en widget.
    const ander = JSON.parse(JSON.stringify(bestand));
    ander.course.title = 'Versie collega';
    ander.widgets[0].title = 'Quiz collega';
    await importeer(ander, 'collega.json');
    check('andere versie: de vraag verschijnt', await modalOpen());
    check('de vraag noemt cursus en widget', await t.page.getByRole('dialog').getByText(/Cursus\s*“Versie collega”/).isVisible().catch(() => false)
      && await t.page.getByRole('dialog').getByText(/Widget\s*“Quiz collega”/).isVisible().catch(() => false));
    await t.page.getByRole('button', { name: 'Mijn versie houden' }).click();
    await sleep(800);
    let s = await opslag(t.page);
    check('"Mijn versie houden": cursus en widget ongewijzigd', vind(s.courses, 'c_bestand')?.title === 'Cursus met pdf' && vind(s.widgets, 'w_ged')?.title === 'Mijn quiz');

    await importeer(ander, 'collega.json');
    await t.page.getByRole('button', { name: 'Als kopie bewaren' }).click();
    await sleep(800);
    s = await opslag(t.page);
    const kopie = s.courses.find((c) => c.title === 'Versie collega (kopie)');
    check('"Als kopie bewaren": kopie ernaast, eigen cursus onaangeroerd', !!kopie && kopie.id !== 'c_bestand' && vind(s.courses, 'c_bestand')?.title === 'Cursus met pdf');

    await importeer(ander, 'collega.json');
    await t.page.getByRole('button', { name: 'Annuleren' }).click();
    await sleep(500);
    s = await opslag(t.page);
    check('Annuleren: niets veranderd', vind(s.courses, 'c_bestand')?.title === 'Cursus met pdf' && !(await modalOpen()));

    await importeer(ander, 'collega.json');
    await t.page.getByRole('button', { name: 'Vervangen door de versie uit het bestand' }).click();
    await sleep(800);
    s = await opslag(t.page);
    check('"Vervangen": de versie uit het bestand staat er', vind(s.courses, 'c_bestand')?.title === 'Versie collega' && vind(s.widgets, 'w_ged')?.title === 'Quiz collega');
  }
  check('cursusbestand: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ── H1: cursuslinks (/cursus/open) ──────────────────────────────────────────

const cursusLink = (c, w = [], partial = false) => `${BASE}#/cursus/open?d=${lz({ v: 1, kind: 'cursus', c, w, ...(partial ? { partial: true } : {}) })}`;

/** Cursuslink openen en wachten tot de lezer of de vraag er staat. */
async function openCursusLink(page, url) {
  await page.goto(url);
  await page.waitForFunction(
    () => /#\/cursus\/lees\//.test(location.hash) || [...document.querySelectorAll('h1')].some((h) => /bijwerken\?/.test(h.textContent || '')),
    null, { timeout: 10000 },
  ).catch(() => {});
  await sleep(300);
}
const inLezer = (page) => /#\/cursus\/lees\//.test(page.url());
const linkVraag = (page) => page.getByRole('heading', { level: 1, name: /bijwerken\?/ }).isVisible().catch(() => false);
const genoemd = (page) => page.getByRole('list', { name: 'Oefeningen die zouden veranderen' }).innerText().catch(() => '');
const register = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wf.gedeeld.v1') || '{"c":[],"w":[]}'));

/** Cursus met hoofdstukken [id, tekst]. */
function cursusMet({ id = 'c_g4', title = 'Cursus G4', updatedAt, hoofdstukken }) {
  return {
    id, title, author: '', coverEmoji: '💧', code: 'CG4001', createdAt: 1, updatedAt,
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    chapters: hoofdstukken.map(([hid, tekst]) => ({
      id: hid, title: 'Hoofdstuk ' + hid,
      sections: [{ id: 's-' + hid, title: 'Sectie', optional: false, blocks: [{ id: 'b-' + hid, type: 'text', markdown: tekst }] }],
    })),
  };
}
const tekstenVan = (c) => (c?.chapters ?? []).map((ch) => ch.sections[0].blocks[0].markdown);

console.log('S1. Teruggezette back-up: een leerlinglink met dezelfde id\'s vervangt ze niet stil');
{
  const t = await freshPage({ width: 1280, height: 900 });
  await t.page.goto(BASE + '#/cursussen');
  await t.page.locator('input[type=file][accept*="json"]').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  const backup = {
    app: 'boosterz', kind: 'cursus', v: 1,
    course: cursus({ id: 'c_back', title: 'Mijn back-up', updatedAt: NU - 600_000, widgetId: 'w_back' }),
    widgets: [quiz({ id: 'w_back', title: 'Mijn quiz', answer: true, updatedAt: NU - 600_000 })],
  };
  backup.widgets[0].code = 'BACK01';
  await t.page.locator('input[type=file][accept*="json"]').first().setInputFiles({ name: 'back-up.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await t.page.getByText(/Mijn back-up" geïmporteerd/).first().waitFor({ timeout: 8000 }).catch(() => {});
  let s = await opslag(t.page);
  check('back-up teruggezet', vind(s.courses, 'c_back')?.title === 'Mijn back-up' && vind(s.widgets, 'w_back')?.title === 'Mijn quiz');
  const reg = await register(t.page);
  check('een bestand komt niet in het register van gedeelde kopieën', !reg.c.some(([id]) => id === 'c_back') && !reg.w.some(([id]) => id === 'w_back'), JSON.stringify(reg));

  // Een leerling met de deellink past de cursus aan en deelt ze opnieuw.
  const nepQuiz = { ...quiz({ id: 'w_back', title: 'Nagemaakte quiz', answer: false, updatedAt: NU - 1000 }), code: 'BACK01' };
  const nep = cursusLink(cursus({ id: 'c_back', title: 'Nagemaakt', updatedAt: NU - 1000, widgetId: 'w_back' }), [nepQuiz]);
  await openCursusLink(t.page, nep);
  check('nagemaakte link: eerst een vraag', await linkVraag(t.page) && !inLezer(t.page));
  check('de vraag noemt de cursus en de oefening',
    await t.page.getByRole('heading', { level: 1, name: 'Cursus bijwerken?' }).isVisible().catch(() => false)
    && /Mijn quiz/.test(await genoemd(t.page)));
  s = await opslag(t.page);
  check('terwijl de vraag openstaat, is er niets veranderd', vind(s.courses, 'c_back')?.title === 'Mijn back-up' && vind(s.widgets, 'w_back')?.title === 'Mijn quiz');
  await t.page.getByRole('button', { name: 'Huidige versie behouden en openen' }).click({ timeout: 5000 }).catch(() => {});
  await t.page.waitForURL(/#\/cursus\/lees\//, { timeout: 8000 }).catch(() => {});
  s = await opslag(t.page);
  check('"Huidige versie behouden": de lezer opent, back-up ongewijzigd',
    inLezer(t.page) && vind(s.courses, 'c_back')?.title === 'Mijn back-up' && vind(s.widgets, 'w_back')?.title === 'Mijn quiz');
  check('S1 back-up: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

console.log('S1. Voorbeeldcursus: een link met dezelfde id vervangt ze niet stil');
{
  const t = await freshPage({ width: 1280, height: 900 });
  await t.page.goto(BASE + '#/cursussen?voorbeeld=1');
  await t.page.waitForFunction(
    () => JSON.parse(localStorage.getItem('wf.courses.v1') || '[]').some((c) => c.id === 'nw-voorbeeld-1e-graad'),
    null, { timeout: 60000 },
  ).catch(() => {});
  let s = await opslag(t.page);
  const voorbeeld = vind(s.courses, 'nw-voorbeeld-1e-graad');
  check('voorbeeldcursus geladen', !!voorbeeld);
  const reg = await register(t.page);
  check('het voorbeeld komt niet in het register van gedeelde kopieën', !reg.c.some(([id]) => id === 'nw-voorbeeld-1e-graad'), JSON.stringify(reg.c));
  if (voorbeeld) {
    const nep = cursusLink(cursus({ id: 'nw-voorbeeld-1e-graad', title: 'Nagemaakt voorbeeld', updatedAt: NU - 1000, widgetId: 'w_nep' }), []);
    await openCursusLink(t.page, nep);
    check('link met de id van het voorbeeld: eerst een vraag', await linkVraag(t.page) && !inLezer(t.page));
    await t.page.getByRole('button', { name: 'Huidige versie behouden en openen' }).click({ timeout: 5000 }).catch(() => {});
    await t.page.waitForURL(/#\/cursus\/lees\//, { timeout: 8000 }).catch(() => {});
    s = await opslag(t.page);
    const na = vind(s.courses, 'nw-voorbeeld-1e-graad');
    check('"Huidige versie behouden": voorbeeld ongewijzigd en de lezer opent met de eigen code',
      inLezer(t.page) && na?.title === voorbeeld.title && na?.chapters.length === voorbeeld.chapters.length && t.page.url().includes('/cursus/lees/' + voorbeeld.code));
  }
  check('S1 voorbeeld: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

console.log('S3. Eigen oefening in een zuivere cursus: de link vraagt eerst en noemt de oefening');
{
  const t = await freshPage();
  const v1 = cursus({ title: 'Cursus v1', updatedAt: NU - 7200_000 });
  await openCursusLink(t.page, cursusLink(v1, [quiz({ title: 'Quiz v1', answer: false, updatedAt: NU - 7200_000 })]));
  check('v1: zonder vraag de lezer in', inLezer(t.page) && !(await linkVraag(t.page)));
  // De leerling (of leerkracht) past de oefening zelf aan: eigen werk.
  await t.page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
    const w = ws.find((x) => x.id === 'w_ged');
    w.title = 'Mijn eigen quiz';
    w.updatedAt = Date.now();
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  });
  // De bron maakt daarna een nieuwere versie (stempel ná de eigen bewerking).
  await sleep(50);
  const T2 = Date.now();
  const v2 = cursusLink(cursus({ title: 'Cursus v2', updatedAt: T2 }), [quiz({ title: 'Quiz v2', answer: true, updatedAt: T2 })]);
  await openCursusLink(t.page, v2);
  check('v2: eerst een vraag (de oefening is eigen werk)', await linkVraag(t.page) && !inLezer(t.page));
  check('de vraag gaat over de oefening en noemt ze bij naam',
    await t.page.getByRole('heading', { level: 1, name: 'Oefening bijwerken?' }).isVisible().catch(() => false)
    && /Mijn eigen quiz/.test(await genoemd(t.page)) && /Quiz v2/.test(await genoemd(t.page)));
  const tekst = (await t.page.locator('main').innerText()).toLowerCase();
  check('leerlingtaal: "oefening", nooit "widget"', tekst.includes('oefening') && !tekst.includes('widget'));
  check('vraag: één main en één h1', (await t.page.locator('main').count()) === 1 && (await t.page.locator('h1').count()) === 1);
  const hoogtes = [];
  for (const k of ['Bijwerken en openen', 'Huidige versie behouden en openen']) {
    hoogtes.push((await t.page.getByRole('button', { name: k }).boundingBox().catch(() => null))?.height ?? 0);
  }
  check('twee keuzes, elk minstens 44 px hoog', hoogtes.every((h) => h >= 44), hoogtes.join(','));
  check('vraag op 390 px zonder horizontaal scrollen', await geenOverloop(t.page));

  await t.page.getByRole('button', { name: 'Huidige versie behouden en openen' }).click({ timeout: 5000 }).catch(() => {});
  await t.page.waitForURL(/#\/cursus\/lees\//, { timeout: 8000 }).catch(() => {});
  let s = await opslag(t.page);
  check('"Huidige versie behouden": eigen oefening blijft', inLezer(t.page) && vind(s.widgets, 'w_ged')?.title === 'Mijn eigen quiz');

  await openCursusLink(t.page, v2);
  check('opnieuw geopend: weer de vraag', await linkVraag(t.page));
  await t.page.getByRole('button', { name: 'Bijwerken en openen' }).click({ timeout: 5000 }).catch(() => {});
  await t.page.waitForURL(/#\/cursus\/lees\//, { timeout: 8000 }).catch(() => {});
  s = await opslag(t.page);
  const w = vind(s.widgets, 'w_ged');
  check('"Bijwerken": de genoemde oefening en de zuivere cursus zijn bijgewerkt',
    inLezer(t.page) && w?.title === 'Quiz v2' && w?.config.questions[0].answer === true && vind(s.courses, 'c_ged')?.title === 'Cursus v2');
  check('S3: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

console.log('S3. "Bijwerken" vervangt alleen wat de vraag noemde');
{
  const t = await freshPage();
  // Eigen werk van de leerkracht: cursus en oefening, tien minuten geleden aangepast.
  await t.page.evaluate(({ c, w }) => {
    localStorage.setItem('wf.courses.v1', JSON.stringify([c]));
    localStorage.setItem('wf.widgets.v1', JSON.stringify([w]));
  }, { c: cursus({ title: 'Mijn cursus', updatedAt: NU - 600_000 }), w: quiz({ title: 'Mijn quiz', answer: true, updatedAt: NU - 600_000 }) });
  // Een oude cursus (twee uur oud) met een nieuwere oefening en een tweede oefening.
  const tweede = { ...quiz({ id: 'w_twee', title: 'Tweede uit de link', answer: false, updatedAt: NU - 1000 }), code: 'TWEE01' };
  const url = cursusLink(cursus({ title: 'Oude cursus', updatedAt: NU - 7200_000 }), [quiz({ title: 'Quiz uit de link', answer: false, updatedAt: NU - 1000 }), tweede]);
  await openCursusLink(t.page, url);
  check('vraag over de oefening, niet over de (oudere) cursus',
    await t.page.getByRole('heading', { level: 1, name: 'Oefening bijwerken?' }).isVisible().catch(() => false)
    && /Mijn quiz/.test(await genoemd(t.page)) && !/Tweede/.test(await genoemd(t.page)));
  // Terwijl de vraag openstaat, verschijnt er (bv. vanuit een ander tabblad)
  // een eigen oefening met dezelfde id, ouder dan die uit de link. De vraag
  // noemde ze niet, dus "Bijwerken" mag ze niet vervangen.
  await t.page.evaluate(({ w }) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
    ws.push(w);
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  }, { w: { ...tweede, title: 'Mijn tweede quiz', updatedAt: NU - 5000 } });
  await t.page.getByRole('button', { name: 'Bijwerken en openen' }).click({ timeout: 5000 }).catch(() => {});
  await t.page.waitForURL(/#\/cursus\/lees\//, { timeout: 8000 }).catch(() => {});
  const s = await opslag(t.page);
  check('de genoemde oefening is bijgewerkt', vind(s.widgets, 'w_ged')?.title === 'Quiz uit de link');
  check('een eigen oefening die de vraag niet noemde, blijft', vind(s.widgets, 'w_twee')?.title === 'Mijn tweede quiz');
  check('de oudere cursus uit de link zet de eigen cursus niet terug', vind(s.courses, 'c_ged')?.title === 'Mijn cursus');
  check('S3 alleen genoemd: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

console.log('G4 en LL3. Gedeeltelijke link, daarna de volledige met dezelfde versie; v1 → v2 stil');
{
  const t = await freshPage();
  const V = NU - 7200_000;
  const vol = cursusMet({ updatedAt: V, hoofdstukken: [['h1', 'a1'], ['h2', 'a2'], ['h3', 'a3']] });
  await openCursusLink(t.page, cursusLink({ ...vol, chapters: [vol.chapters[0]] }, [], true));
  let s = await opslag(t.page);
  check('gedeeltelijke link: lezer, één hoofdstuk', inLezer(t.page) && tekstenVan(vind(s.courses, 'c_g4')).join() === 'a1');
  await openCursusLink(t.page, cursusLink(vol));
  s = await opslag(t.page);
  check('volledige link met dezelfde versie: geen vraag, alle hoofdstukken',
    inLezer(t.page) && !(await linkVraag(t.page)) && tekstenVan(vind(s.courses, 'c_g4')).join() === 'a1,a2,a3', tekstenVan(vind(s.courses, 'c_g4')).join());

  // Tweede cursus: eerst volledig v1, daarna v2 in twee gedeeltelijke links.
  const b = (over) => cursusMet({ id: 'c_g4b', title: 'Cursus G4b', ...over });
  const b1 = b({ updatedAt: V, hoofdstukken: [['h1', 'a1'], ['h2', 'a2'], ['h3', 'a3']] });
  await openCursusLink(t.page, cursusLink(b1));
  s = await opslag(t.page);
  check('leerlinglink v1 (volledig): drie hoofdstukken', tekstenVan(vind(s.courses, 'c_g4b')).join() === 'a1,a2,a3');
  const b2 = b({ title: 'Cursus G4b v2', updatedAt: NU - 3600_000, hoofdstukken: [['h1', 'a1'], ['h2', 'N2'], ['h3', 'N3']] });
  await openCursusLink(t.page, cursusLink({ ...b2, chapters: [b2.chapters[1]] }, [], true));
  await openCursusLink(t.page, cursusLink({ ...b2, chapters: [b2.chapters[2]] }, [], true));
  s = await opslag(t.page);
  check('twee gedeeltelijke links van v2: samen de nieuwe stand, zonder vraag',
    inLezer(t.page) && !(await linkVraag(t.page)) && tekstenVan(vind(s.courses, 'c_g4b')).join() === 'a1,N2,N3', tekstenVan(vind(s.courses, 'c_g4b')).join());

  const b3 = b({ title: 'Cursus G4b v3', updatedAt: NU - 1000, hoofdstukken: [['h1', 'V3'], ['h2', 'N2'], ['h3', 'N3']] });
  await openCursusLink(t.page, cursusLink(b3));
  s = await opslag(t.page);
  check('leerlinglink v3 (nieuwer): stil bijgewerkt', inLezer(t.page) && !(await linkVraag(t.page)) && vind(s.courses, 'c_g4b')?.title === 'Cursus G4b v3');
  await openCursusLink(t.page, cursusLink(b1));
  s = await opslag(t.page);
  check('oude volledige link (v1) daarna: geen vraag, zet niets terug',
    inLezer(t.page) && !(await linkVraag(t.page)) && vind(s.courses, 'c_g4b')?.title === 'Cursus G4b v3' && tekstenVan(vind(s.courses, 'c_g4b')).join() === 'V3,N2,N3');
  check('G4: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ── LL9 en LL12: het loket ──────────────────────────────────────────────────

console.log('LL9/LL12. Kapotte klaslink en geplakte links');
{
  const t = await freshPage();
  await t.page.goto(BASE + '#/klas/open?d=kapot');
  await t.page.getByText(/Deze klaslink werkt niet/).waitFor({ timeout: 8000 }).catch(() => {});
  await t.page.getByRole('button', { name: 'Link of bestand zelf openen' }).click({ timeout: 5000 }).catch(() => {});
  await sleep(500);
  check('LL9: het plakveld verschijnt (geen eindeloze laadmelding)', await t.page.getByLabel('Klaslink plakken').isVisible().catch(() => false));
  check('LL9: de kapotte d= is uit de link', !/[?&]d=/.test(t.page.url()));

  // Een pakket waarvan de link een "+" bevat.
  let p = null;
  let d = '';
  for (let i = 0; i < 50 && !d.includes('+'); i++) {
    p = pakket(cursus({ title: 'Plakcursus ' + i, updatedAt: NU - 1000 }), quiz({ title: 'Plakquiz', answer: true, updatedAt: NU - 1000 }), 'PLAK' + String(i).padStart(2, '0'));
    d = lz(p);
  }
  check('proef heeft een link met "+"', d.includes('+'));
  for (const [naam, tekst] of [
    ['%2B-codering', `${BASE}#/klas/open?d=${d.replace(/\+/g, '%2B')}`],
    ['spaties in plaats van +', `${BASE}#/klas/open?d=${d.replace(/\+/g, ' ')}`],
  ]) {
    await t.page.goto(BASE + '#/klas/open');
    await t.page.getByLabel('Klaslink plakken').fill(tekst, { timeout: 8000 }).catch(() => {});
    await t.page.getByRole('button', { name: 'Openen' }).click({ timeout: 3000 }).catch(() => {});
    await t.page.waitForURL(/#\/leerling\//, { timeout: 8000 }).catch(() => {});
    check(`LL12: geplakte link met ${naam} opent de klas`, opHub(t.page), t.page.url().slice(-40));
  }
  check('loket: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

console.log('Loket: terug naar het loket terwijl de hub nog laadt');
{
  // De hub wordt traag geladen; de leerling keert meteen terug. React houdt de
  // loketpagina dan verborgen bij; ze moet toch opnieuw het plakveld tonen.
  const t = await freshPage();
  await t.ctx.route(/ClassStudentPage-[^/]*\.js/, async (r) => { await sleep(2500); await r.continue(); });
  const p = pakket(cursus({ title: 'Traag', updatedAt: NU - 1000 }), quiz({ title: 'Traag', answer: true, updatedAt: NU - 1000 }), 'TRAAG1');
  await t.page.goto(BASE + '#/klas/open');
  await t.page.getByLabel('Klaslink plakken').fill(pakketLink(p), { timeout: 8000 }).catch(() => {});
  await t.page.getByRole('button', { name: 'Openen' }).click({ timeout: 3000 }).catch(() => {});
  await t.page.waitForURL(/#\/leerling\//, { timeout: 8000 }).catch(() => {});
  await t.page.goto(BASE + '#/klas/open');
  await sleep(3500);
  check('terug op het loket: het plakveld staat er (niet eindeloos "klaargezet")', await t.page.getByLabel('Klaslink plakken').isVisible().catch(() => false));
  check('traag laden: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} controle(s) gefaald` : '\nALLE GEDEELD-CHECKS GESLAAGD');
process.exit(failures ? 1 : 0);
