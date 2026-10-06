// Rooktest herstelpakket K4: de resultatenschermen van de leerkracht.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/resultaten.mjs
//
// Zaait in localStorage twee leerplannen met dezelfde doelcode, drie klassen,
// twaalf oefeningen en inzendingen (ook een open vraag die nog nagekeken moet
// worden en drie pogingen van dezelfde leerling), en een cursus met voortgang.
// Faalt hard (exit 1) bij een mislukte check, een paginafout of een
// console-fout.
//
//  A11Y2 / KL8   de resultaten zijn met het toetsenbord te bedienen: link naar
//                het detail, knop voor de inzending, zichtbare focus
//  A11Y14        select met naam, schuifkaders met focus en naam, koppen met scope
//  A11Y19        CourseTrackPage: één h1 en één main, ook bij "niet gevonden"
//  KL3           klasfilter met de klassen, melding bij verborgen inzendingen
//  KL5           dezelfde doelcode uit twee leerplannen blijft twee doelen
//  KL6           de doelscore neemt de beste poging (zoals de matrix)
//  KL7           wat nog nagekeken moet worden heet "voorlopig"
//  KL11          CSV met BOM en veilige cellen (ResultsPage en CourseTrackPage)
//  KL12          de inzendingen worden één keer gelezen, niet per widget
//  KL13          resultaatcodes plakken: elke code een eerlijke uitkomst
//  KL15          geen kolomkop voor een hoofdstuk zonder secties

import { chromium } from 'playwright-core';
import LZString from 'lz-string';
import { existsSync, readFileSync } from 'node:fs';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;
const errors = [];

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Gezaaide gegevens ───────────────────────────────────────────────────────

const NU = Date.now();
const UUR = 3600_000;
const INJECTIE = '=HYPERLINK("http://boos.example","klik")';
const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };

function quizWidget(id, code, title, questions, curriculumId) {
  return {
    id, type: 'quiz', title, folderId: null, code, settings: SETTINGS, createdAt: NU - 9 * UUR, updatedAt: NU - 9 * UUR,
    config: { layout: 'single', questions }, ...(curriculumId ? { curriculumId } : {}),
  };
}
const mc = (id, points, goalCode) => ({ id, type: 'mc', prompt: `Vraag ${id}`, points, options: ['a', 'b'], correctIndex: 0, ...(goalCode ? { goalCode } : {}) });
const lang = (id, points, goalCode) => ({ id, type: 'long', prompt: `Open vraag ${id}`, points, ...(goalCode ? { goalCode } : {}) });

const WIDGETS = [
  quizWidget('w-quiz', 'RESQ01', 'Test quiz A', [mc('q1', 1, 'LPD 1'), lang('q2', 3, 'LPD 1')], 'cur-a'),
  quizWidget('w-quizb', 'RESQ02', 'Test quiz B', [mc('qb1', 2, 'LPD 1')], 'cur-b'),
  // tien vulstukken zonder inzendingen: de pagina's moeten ze samen in één keer lezen
  ...Array.from({ length: 10 }, (_, i) => quizWidget(`w-vul${i}`, `RESV${String(i).padStart(2, '0')}`, `Vulquiz ${i + 1}`, [mc('v1', 1)])),
];

const CURRICULA = [
  { id: 'cur-a', title: 'Leerplan A — Wetenschappen', net: 'eigen', subject: 'Wetenschappen', level: '1e graad', goals: [{ id: 'ga1', code: 'LPD 1', text: 'Doel van leerplan A' }], createdAt: NU, updatedAt: NU },
  { id: 'cur-b', title: 'Leerplan B — Techniek', net: 'eigen', subject: 'Techniek', level: '1e graad', goals: [{ id: 'gb1', code: 'LPD 1', text: 'Doel van leerplan B' }], createdAt: NU, updatedAt: NU },
];

const CLASSES = [
  { id: 'k1', name: 'Klas 1A', code: 'KLASAA', students: [{ id: 's-emma', name: 'Emma Peeters', number: 1 }, { id: 's-noah', name: 'Noah Claes', number: 2 }], createdAt: NU, updatedAt: NU },
  { id: 'k2', name: 'Klas 1B', code: 'KLASBB', students: [{ id: 's-lena', name: 'Lena Maes', number: 1 }], createdAt: NU, updatedAt: NU },
  { id: 'k3', name: 'Klas 1C', code: 'KLASCC', students: [{ id: 's-piet', name: 'Piet Wouters', number: 1 }], createdAt: NU, updatedAt: NU },
];

function inzending(id, widgetId, widgetCode, naam, uurGeleden, scores, extra = {}) {
  const itemScores = {};
  let earned = 0;
  let max = 0;
  for (const [qid, [e, m, mode]] of Object.entries(scores)) {
    itemScores[qid] = { earned: e, max: m, mode };
    earned += e;
    max += m;
  }
  const pending = Object.values(itemScores).some((s) => s.mode === 'pending');
  return {
    id, widgetId, widgetCode, studentName: naam, startedAt: NU - uurGeleden * UUR - 60000, submittedAt: NU - uurGeleden * UUR,
    durationSec: 60, answers: Object.fromEntries(Object.keys(scores).map((q) => [q, q === 'q2' ? 'Mijn antwoord' : 0])),
    itemScores, totalEarned: earned, totalMax: max, status: pending ? 'submitted' : 'graded', ...extra,
  };
}

const INZENDINGEN = [
  // Emma (klas 1A): drie pogingen. De beste (4/4) is niet de laatste (0/4); de eerste wacht nog op nakijken.
  inzending('i-emma3', 'w-quiz', 'RESQ01', 'Emma Peeters', 1, { q1: [0, 1, 'auto'], q2: [0, 3, 'manual'] }, { classId: 'k1', studentId: 's-emma' }),
  inzending('i-emma2', 'w-quiz', 'RESQ01', 'Emma Peeters', 2, { q1: [1, 1, 'auto'], q2: [3, 3, 'manual'] }, { classId: 'k1', studentId: 's-emma' }),
  inzending('i-emma1', 'w-quiz', 'RESQ01', 'Emma Peeters', 3, { q1: [0, 1, 'auto'], q2: [0, 3, 'pending'] }, { classId: 'k1', studentId: 's-emma' }),
  // Noah (klas 1A): open vraag nog niet nagekeken
  inzending('i-noah', 'w-quiz', 'RESQ01', 'Noah Claes', 4, { q1: [1, 1, 'auto'], q2: [0, 3, 'pending'] }, { classId: 'k1', studentId: 's-noah' }),
  // Lena (klas 1B)
  inzending('i-lena', 'w-quiz', 'RESQ01', 'Lena Maes', 5, { q1: [1, 1, 'auto'], q2: [2, 3, 'manual'] }, { classId: 'k2', studentId: 's-lena' }),
  // zonder klas, een naam met een formule, en een klas die niet meer bestaat
  inzending('i-gast', 'w-quiz', 'RESQ01', 'Gast', 6, { q1: [0, 1, 'auto'], q2: [3, 3, 'manual'] }),
  inzending('i-inj', 'w-quiz', 'RESQ01', INJECTIE, 7, { q1: [1, 1, 'auto'], q2: [0, 3, 'manual'] }),
  inzending('i-oud', 'w-quiz', 'RESQ01', 'Oud-leerling', 8, { q1: [1, 1, 'auto'], q2: [1, 3, 'manual'] }, { classId: 'k-weg' }),
  // Emma bij het andere leerplan
  inzending('i-emmab', 'w-quizb', 'RESQ02', 'Emma Peeters', 2, { qb1: [1, 2, 'auto'] }, { classId: 'k1', studentId: 's-emma' }),
];

const COURSE = {
  id: 'c-test', title: 'Testcursus', author: '', coverEmoji: 'x', code: 'CURS01', curriculumId: 'cur-a',
  chapters: [
    { id: 'ch1', title: 'Hoofdstuk een', emoji: '', sections: [
      { id: 's1', title: 'Sectie een', blocks: WIDGETS.map((w, i) => ({ id: `b${i}`, type: 'widget', widgetId: w.id })) },
      { id: 's2', title: 'Sectie twee', blocks: [] },
    ] },
    { id: 'ch2', title: 'Leeg hoofdstuk', emoji: '', sections: [] },
    { id: 'ch3', title: 'Hoofdstuk drie', emoji: '', sections: [{ id: 's3', title: 'Sectie drie', blocks: [] }] },
  ],
  settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
  createdAt: NU, updatedAt: NU,
};
const VOORTGANG = [
  { courseId: 'c-test', courseCode: 'CURS01', studentName: 'Emma Peeters', sections: { s1: { openedAt: NU - 5 * UUR, completedAt: NU - 4 * UUR, secondsSpent: 120 }, s2: { openedAt: NU - 3 * UUR, secondsSpent: 30 } }, lastSeenAt: NU - 3 * UUR, startedAt: NU - 5 * UUR },
  { courseId: 'c-test', courseCode: 'CURS01', studentName: INJECTIE, sections: {}, lastSeenAt: NU - 2 * UUR, startedAt: NU - 2 * UUR },
];

const SEED = { WIDGETS, CURRICULA, CLASSES, INZENDINGEN, COURSE, VOORTGANG };

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
// Verzoeken naar buiten (lettertypes) afbreken; alleen de app zelf laadt.
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
await ctx.addInitScript((seed) => {
  if (!location.protocol.startsWith('http')) return; // about:blank heeft geen opslag
  // Tel hoe vaak de inzendingen worden gelezen (KL12).
  const orig = Storage.prototype.getItem;
  window.__subReads = 0;
  Storage.prototype.getItem = function (k) {
    if (k === 'wf.submissions.v1') window.__subReads++;
    return orig.call(this, k);
  };
  if (!localStorage.getItem('wf.widgets.v1')) {
    localStorage.setItem('wf.widgets.v1', JSON.stringify(seed.WIDGETS));
    localStorage.setItem('wf.prefs.v1', JSON.stringify({ seeded: true }));
    localStorage.setItem('wf.curriculum.seeded.v1', '1');
    localStorage.setItem('wf.classes.seeded.v1', '1');
    localStorage.setItem('wf.curricula.v1', JSON.stringify(seed.CURRICULA));
    localStorage.setItem('wf.classes.v1', JSON.stringify(seed.CLASSES));
    localStorage.setItem('wf.submissions.v1', JSON.stringify(seed.INZENDINGEN));
    localStorage.setItem('wf.courses.v1', JSON.stringify([seed.COURSE]));
    localStorage.setItem('wf.courseprogress.v1', JSON.stringify(seed.VOORTGANG));
  }
}, SEED);

const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/ERR_CERT_AUTHORITY_INVALID|ERR_FAILED|Failed to load resource/.test(m.text())) return;
  errors.push(`console: ${m.text()}`);
});

// Telkens een echte nieuwe pagina (via about:blank): zo begint de focus bovenaan en loopt het
// Tab-pad van een leerkracht die de pagina net opent.
const go = async (hash) => {
  await page.goto('about:blank');
  await page.goto(BASE + hash.replace(/^\//, ''), { waitUntil: 'networkidle' });
  await sleep(400);
};
const passtOpSmal = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tellingen = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

/** Tab tot het element waarvoor `test` (in de pagina) waar is; geeft true als het bereikt werd. */
async function tabNaar(test, arg, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(([src, a]) => {
      // eslint-disable-next-line no-new-func
      const f = new Function('el', 'arg', `return (${src})(el, arg);`);
      return !!document.activeElement && f(document.activeElement, a);
    }, [test.toString(), arg]);
    if (hit) return true;
  }
  return false;
}
/** Heeft het element met de focus een zichtbare focusring? */
const focusZichtbaar = () => page.evaluate(() => {
  const s = getComputedStyle(document.activeElement);
  return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
});

// axe-core hoort bij eslint-plugin-jsx-a11y; ontbreekt het, dan slaan we die controles over.
const AXE_PAD = new URL('../../node_modules/axe-core/axe.min.js', import.meta.url);
const AXE = existsSync(AXE_PAD) ? readFileSync(AXE_PAD, 'utf8') : null;
if (!AXE) console.log('  (axe-core niet gevonden: de axe-controles worden overgeslagen)');
const AXE_REGELS = [
  'select-name', 'label', 'button-name', 'link-name', 'scrollable-region-focusable', 'th-has-data-cells',
  'empty-table-header', 'scope-attr-valid', 'td-headers-attr', 'nested-interactive', 'aria-allowed-role',
  'aria-required-attr', 'landmark-one-main', 'page-has-heading-one', 'heading-order',
];
async function axeSchoon(naam) {
  if (!AXE) return;
  if (!(await page.evaluate(() => typeof window.axe !== 'undefined'))) await page.evaluate(AXE);
  const res = await page.evaluate((regels) => window.axe.run(document, { runOnly: { type: 'rule', values: regels } }), AXE_REGELS);
  const fouten = res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  check(`axe: ${naam}`, res.violations.length === 0, fouten.join(' ;; '));
}

/** Download van een klik opvangen: { bytes, tekst }. */
async function download(klik) {
  const [dl] = await Promise.all([page.waitForEvent('download'), klik()]);
  const pad = await dl.path();
  const bytes = readFileSync(pad);
  return { bytes, tekst: bytes.toString('utf8'), naam: dl.suggestedFilename() };
}

const wf1 = (sub) => 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(sub));

// ── 1. Overzicht /resultaten ────────────────────────────────────────────────
console.log('1. Overzicht van alle resultaten');
await go('/#/resultaten');
check('overzicht: één main en één h1', (await tellingen('main')) === 1 && (await tellingen('h1')) === 1);
const rijA = page.locator('table.data tbody tr', { hasText: 'Test quiz A' }).first();
const rijB = page.locator('table.data tbody tr', { hasText: 'Test quiz B' }).first();
check('overzicht: beide oefeningen met inzendingen staan in de tabel', (await rijA.count()) === 1 && (await rijB.count()) === 1);

// KL7: voorlopig
check('KL7: gemiddelde van Test quiz A is voorlopig (er wacht nog nakijkwerk)', /\(voorlopig\)/.test(await rijA.innerText()));
check('KL7: Test quiz A heeft 2 inzendingen om na te kijken', (await rijA.locator('.badge-warn').innerText()).trim() === '2');
check('KL7: Test quiz B is niet voorlopig en klaar', !/voorlopig/.test(await rijB.innerText()) && /klaar/.test(await rijB.innerText()));

// KL5 + KL6: doelscores per leerplan, beste poging
const balken = await page.evaluate(() => [...document.querySelectorAll('.progressbar[role=img]')].map((e) => e.getAttribute('aria-label')));
const balkA = balken.find((b) => b.includes('Doel van leerplan A')) ?? '';
const balkB = balken.find((b) => b.includes('Doel van leerplan B')) ?? '';
check('KL5: dezelfde code LPD 1 uit twee leerplannen blijft twee doelen', balken.filter((b) => b.includes('LPD 1')).length === 2, JSON.stringify(balken));
check('KL5: elk doel draagt de naam van zijn leerplan', balkA.includes('Leerplan A — Wetenschappen') && balkB.includes('Leerplan B — Techniek'), `${balkA} | ${balkB}`);
check('KL6: leerplan A telt de beste poging per leerling (67 %, niet 54 % over alle pogingen)', balkA.includes('67 procent'), balkA);
check('KL7: leerplan A is voorlopig (Noah\'s open vraag telt niet als 0)', /voorlopig/.test(balkA), balkA);
check('KL5: leerplan B apart: 50 % en niet voorlopig', balkB.includes('50 procent') && !/voorlopig/.test(balkB), balkB);
const emmaCel = await page.evaluate(() => {
  const heat = [...document.querySelectorAll('table.data')].find((t) => t.querySelector('thead th')?.textContent.trim() === 'Leerling');
  const th = [...heat.querySelectorAll('thead th')].map((t) => t.textContent.trim());
  const kolom = th.findIndex((t) => t.startsWith('LPD 1 (Leerplan A'));
  const rij = [...heat.querySelectorAll('tbody tr')].find((r) => r.querySelector('th')?.textContent.trim() === 'Emma Peeters');
  return { th, kolom, tekst: kolom >= 0 && rij ? rij.children[kolom]?.textContent.trim() : null };
});
check('heatmap: de kolommen van de twee leerplannen zijn te onderscheiden', emmaCel.th.some((t) => t.startsWith('LPD 1 (Leerplan A')) && emmaCel.th.some((t) => t.startsWith('LPD 1 (Leerplan B')), emmaCel.th.join(' | '));
check('KL6: Emma staat in de heatmap op 100 % (haar beste poging), niet op de laatste', emmaCel.tekst === '100%', String(emmaCel.tekst));

// A11Y14: koppen met scope, schuifkaders
check('A11Y14: elke kop in de tabellen heeft een scope', (await tellingen('table th:not([scope])')) === 0);
const regio = await page.evaluate(() => [...document.querySelectorAll('.table-wrap')].map((e) => ({ r: e.getAttribute('role'), t: e.getAttribute('tabindex'), l: !!e.getAttribute('aria-label') })));
check('A11Y14: elk schuifkader is een benoemd gebied dat de focus kan krijgen', regio.length >= 2 && regio.every((x) => x.r === 'region' && x.t === '0' && x.l), JSON.stringify(regio));

// KL3: klasfilter met de klassen erbij
const filter = page.getByLabel('Klas', { exact: true });
await filter.selectOption('k2');
await sleep(300);
const meldingTekst = async () => (await page.locator('.callout.warn[role=status]').first().innerText().catch(() => ''));
check('KL3: klas 1B toont alleen Lena (1 inzending)', (await page.locator('table.data tbody tr', { hasText: 'Test quiz A' }).first().locator('td').first().innerText()).trim() === '1');
check('KL3: de melding zegt hoeveel inzendingen het filter verbergt (8)', /8 inzendingen zijn verborgen door het klasfilter/.test(await meldingTekst()), await meldingTekst());
await filter.selectOption('none');
await sleep(300);
check('KL3: "Zonder klas" toont ook de inzending van een klas die niet meer bestaat (3, niet 2)', (await page.locator('table.data tbody tr', { hasText: 'Test quiz A' }).first().locator('td').first().innerText()).trim() === '3');
check('KL3: de melding telt 6 verborgen inzendingen', /6 inzendingen zijn verborgen/.test(await meldingTekst()), await meldingTekst());
await filter.selectOption('k3');
await sleep(300);
check('KL3: een klas zonder inzendingen toont geen "nog geen inzendingen" maar een eerlijke melding',
  await page.getByRole('heading', { name: 'Geen inzendingen voor dit klasfilter' }).isVisible() && (await page.getByRole('heading', { name: 'Nog geen inzendingen' }).count()) === 0);
await page.getByRole('button', { name: 'Toon alle klassen' }).click();
await sleep(300);
check('KL3: "Toon alle klassen" zet het filter terug', (await filter.inputValue()) === 'all' && (await rijA.count()) === 1 && (await page.locator('.callout.warn[role=status]').count()) === 0);

// KL12: de inzendingen worden één keer per weergave gelezen, niet per widget (12 widgets)
await go('/#/privacy');
await page.evaluate(() => { window.__subReads = 0; location.hash = '#/resultaten'; });
await page.waitForSelector('[aria-label="Resultaten per widget"] table');
await sleep(500);
const leesOverzicht = await page.evaluate(() => window.__subReads);
check(`KL12: overzicht leest de inzendingen ${leesOverzicht}× voor 12 widgets (niet 12× of meer)`, leesOverzicht >= 1 && leesOverzicht <= 4, String(leesOverzicht));

await axeSchoon('overzicht (bureaublad)');

// A11Y2 / KL8: met het toetsenbord naar het detail
await go('/#/resultaten');
const linkBereikt = await tabNaar((el) => el.tagName === 'A' && el.textContent.includes('Test quiz A') && !!el.closest('table'));
check('A11Y2: de titel in de tabel is met Tab te bereiken (een echte link)', linkBereikt);
check('A11Y2: de link toont een zichtbare focusring', await focusZichtbaar());
await page.keyboard.press('Enter');
await page.waitForFunction(() => /#\/resultaten\/w-quiz$/.test(location.hash), null, { timeout: 5000 }).catch(() => {});
check('A11Y2: Enter op de link opent het detail van de oefening', /#\/resultaten\/w-quiz$/.test(page.url()), page.url());
// de muis blijft werken op de rij
await go('/#/resultaten');
await page.locator('table.data tbody tr', { hasText: 'Test quiz B' }).first().locator('td').nth(1).click();
await page.waitForFunction(() => /#\/resultaten\/w-quizb$/.test(location.hash), null, { timeout: 5000 }).catch(() => {});
check('de muis kan nog altijd op de hele rij klikken', /#\/resultaten\/w-quizb$/.test(page.url()), page.url());

// ── 2. Detail /resultaten/:id ───────────────────────────────────────────────
console.log('2. Resultaten van één oefening');
await go('/#/resultaten/w-quiz');
check('detail: één main en één h1', (await tellingen('main')) === 1 && (await tellingen('h1')) === 1);
const kaarten = await page.evaluate(() => [...document.querySelectorAll('.card.card-pad')].slice(0, 4).map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
check('KL7: "gemiddelde score (voorlopig)" boven de inzendingen', kaarten.some((k) => /gemiddelde score \(voorlopig\)/.test(k)), kaarten.join(' | '));
check('KL7: 2 inzendingen om na te kijken', kaarten.some((k) => /^2 nog na te kijken/.test(k)), kaarten.join(' | '));
check('de nakijktab opent meteen (er wacht werk)', (await page.getByRole('tab', { name: /Nakijken \(2\)/ }).getAttribute('aria-selected')) === 'true');

// A11Y14: select met naam
check('A11Y14: de keuzelijst "Na te kijken vraag" heeft een naam', (await page.getByRole('combobox', { name: 'Na te kijken vraag' }).count()) === 1);
await axeSchoon('detail, tab Nakijken (bureaublad)');

await page.getByRole('tab', { name: 'Per leerling' }).click();
await sleep(200);
check('A11Y14: elke kop in de tabellen heeft een scope', (await tellingen('table th:not([scope])')) === 0);
check('KL7: een inzending die nog nagekeken moet worden heet voorlopig', /voorlopig/.test(await page.locator('table.data tbody tr', { hasText: 'Emma Peeters' }).last().innerText()));
await axeSchoon('detail, tab Per leerling (bureaublad)');

// A11Y2: de inzending met het toetsenbord openen
const knopBereikt = await tabNaar((el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Inzending van Emma Peeters bekijken');
check('A11Y2: de naam van de leerling is een knop die met Tab bereikt wordt', knopBereikt);
check('A11Y2: de knop toont een zichtbare focusring', await focusZichtbaar());
await page.keyboard.press('Enter');
const dialoog = page.getByRole('dialog', { name: 'Inzending van Emma Peeters' });
check('A11Y2: Enter opent de inzending (antwoorden en feedback)', await dialoog.isVisible());
await page.keyboard.press('Escape');
await sleep(300);
check('A11Y2: Escape sluit de inzending en de focus keert terug naar de knop',
  (await dialoog.count()) === 0 && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Inzending van Emma Peeters bekijken'));

// Per vraag: doelen met de leerplannaam, voorlopig
await page.getByRole('tab', { name: 'Per vraag' }).click();
await sleep(300);
const doelTekst = await page.locator('.card', { hasText: 'Beheersing per leerdoel' }).first().innerText();
check('KL5: het doel toont de tekst van het leerplan van de oefening', /LPD 1 — Doel van leerplan A/.test(doelTekst), doelTekst);
check('KL7: de beheersing per leerdoel is voorlopig', /\(voorlopig\)/.test(doelTekst), doelTekst);
await axeSchoon('detail, tab Per vraag (bureaublad)');

// KL11: CSV met BOM en veilige cellen
await page.getByRole('tab', { name: 'Per leerling' }).click();
const csv = await download(() => page.getByRole('button', { name: /CSV exporteren/ }).click());
check('KL11: de CSV van de resultaten begint met een BOM (EF BB BF)', csv.bytes[0] === 0xef && csv.bytes[1] === 0xbb && csv.bytes[2] === 0xbf);
check('KL11: de CSV is utf-8 met ; als scheidingsteken en een kop', csv.tekst.replace(/^﻿/, '').startsWith('Leerling;Ingediend;Duur;Score;Max;Procent;'), csv.tekst.slice(0, 60));
check('KL11: een naam die met = begint, wordt nooit een formule', csv.tekst.includes(`"'=HYPERLINK(""http://boos.example"",""klik"")"`) && !/^=HYPERLINK/m.test(csv.tekst));

// KL13: resultaatcodes plakken met een eerlijke uitkomst
console.log('2b. Resultaatcodes plakken');
const nieuw = (naam, widgetId, code, qid) => wf1({
  id: `code-${naam}`, widgetId, widgetCode: code, studentName: naam, startedAt: NU - 1000, submittedAt: NU - 500 - naam.length,
  durationSec: 1, answers: { [qid]: 0 }, itemScores: { [qid]: { earned: 1, max: 1, mode: 'auto' } }, totalEarned: 1, totalMax: 1, status: 'graded',
});
const codeDezeWidget = nieuw('Codeleerling', 'w-quiz', 'RESQ01', 'q1');
const codeAndereWidget = nieuw('Anderszijn', 'w-quizb', 'RESQ02', 'qb1');
const voor = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1')).length);
await page.getByRole('button', { name: /Resultaatcode plakken/ }).click();
await page.getByLabel('Resultaatcodes', { exact: true }).fill(`${codeDezeWidget}\n${codeAndereWidget}\n${codeDezeWidget}\nWF1.dit-is-afgekapt`);
await page.getByRole('button', { name: 'Importeren' }).click();
await sleep(500);
const uitkomst = await page.getByRole('dialog').locator('[role=status]').innerText();
check('KL13: de melding telt wat nieuw, al aanwezig en ongeldig was', /2 nieuw, 1 al aanwezig, 1 ongeldig/.test(uitkomst), uitkomst);
check('KL13: de melding zegt dat een code bij een andere widget hoort en daar bewaard is', /1 resultaat hoort niet bij deze widget/.test(uitkomst), uitkomst);
check('KL13: elke code die niet lukte, krijgt een regel met uitleg', /Code 3[^]*Stond hier al/.test(uitkomst) && /Code 4[^]*onvolledig of beschadigd/.test(uitkomst), uitkomst);
const na = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1')).map((s) => `${s.widgetId}|${s.studentName}`));
check('KL13: het werk voor deze en voor de andere widget is bewaard, niets dubbel', na.length === voor + 2 && na.includes('w-quiz|Codeleerling') && na.includes('w-quizb|Anderszijn'), `${voor} → ${na.length}`);
await page.getByRole('dialog').getByRole('button', { name: 'Sluiten', exact: true }).last().click();
await sleep(300);
check('na het sluiten staat de nieuwe inzending in de lijst', (await page.locator('table.data tbody tr', { hasText: 'Codeleerling' }).count()) === 1);
// een code die netjes lukt, sluit meteen en meldt het kort
await page.getByRole('button', { name: /Resultaatcode plakken/ }).click();
await page.getByLabel('Resultaatcodes', { exact: true }).fill(nieuw('Netjes', 'w-quiz', 'RESQ01', 'q1'));
await page.getByRole('button', { name: 'Importeren' }).click();
await sleep(500);
check('een volledig geslaagde import sluit meteen en meldt het kort', (await page.getByRole('dialog').count()) === 0 && await page.getByText('1 resultaat geïmporteerd').isVisible());

// ── 3. Cursusvoortgang ──────────────────────────────────────────────────────
console.log('3. Voortgang van een cursus');
await go('/#/cursus/volg/c-test');
check('cursusvoortgang: één main en één h1', (await tellingen('main')) === 1 && (await tellingen('h1')) === 1);
check('cursusvoortgang: de h1 is de titel van de cursus', (await page.locator('h1').innerText()).trim() === 'Testcursus');
const koppen = await page.evaluate(() => {
  const rij1 = [...document.querySelectorAll('table.data thead tr:first-child th')];
  const rij2 = document.querySelectorAll('table.data thead tr:nth-child(2) th').length;
  const groepen = rij1.filter((t) => t.getAttribute('scope') === 'colgroup');
  return { aantal: rij1.length, groepen: groepen.map((t) => t.textContent.trim()), spanSom: groepen.reduce((a, t) => a + t.colSpan, 0), rij2 };
});
check('KL15: geen kolomkop voor een hoofdstuk zonder secties', koppen.groepen.length === 2 && !koppen.groepen.some((g) => g.includes('Leeg')), JSON.stringify(koppen));
check('KL15: de hoofdstukkoppen overspannen precies de sectiekoppen (3)', koppen.spanSom === 3 && koppen.rij2 === 3, JSON.stringify(koppen));
check('A11Y14: elke kop in de tabel heeft een scope en er is geen lege kop', (await tellingen('table th:not([scope])')) === 0 && (await page.evaluate(() => [...document.querySelectorAll('table th')].every((t) => t.textContent.trim() !== ''))));
check('A11Y14: het schuifkader van de tabel is een benoemd gebied met focus', (await tellingen('[role=region][tabindex="0"][aria-label="Leesvoortgang per leerling en sectie"]')) === 1);
check('de leerlingnaam is een rijkop', (await tellingen('table.data tbody th[scope=row]')) === 2);
check('de staat van een sectie is ook voor een schermlezer beschikbaar (gelezen, geopend, niet geopend)',
  await page.evaluate(() => { const t = [...document.querySelectorAll('table.data tbody td .sr-only')].map((e) => e.textContent); return t.includes('gelezen') && t.includes('geopend') && t.includes('nog niet geopend'); }));
const oefeningen = page.locator('.chapter-track-body > div');
check('KL7: een oefening met nakijkwerk heet voorlopig, een die klaar is niet',
  /\(voorlopig\)/.test(await oefeningen.filter({ hasText: 'Test quiz A' }).innerText()) && !/voorlopig/.test(await oefeningen.filter({ hasText: 'Test quiz B' }).innerText()));
await axeSchoon('cursusvoortgang (bureaublad)');

// KL12: de inzendingen één keer gelezen, voor 12 oefeningen
await go('/#/privacy');
await page.evaluate(() => { window.__subReads = 0; location.hash = '#/cursus/volg/c-test'; });
await page.waitForSelector('[aria-label="Leesvoortgang per leerling en sectie"] table');
await sleep(500);
const leesCursus = await page.evaluate(() => window.__subReads);
check(`KL12: cursusvoortgang leest de inzendingen ${leesCursus}× voor 12 oefeningen (niet 12× of meer)`, leesCursus >= 1 && leesCursus <= 4, String(leesCursus));

// KL11: CSV met BOM
const csvC = await download(() => page.getByRole('button', { name: 'CSV', exact: true }).click());
check('KL11: de CSV van de voortgang begint met een BOM (EF BB BF)', csvC.bytes[0] === 0xef && csvC.bytes[1] === 0xbb && csvC.bytes[2] === 0xbf);
check('KL11: de kop van de voortgang-CSV is intact', csvC.tekst.replace(/^﻿/, '').startsWith('naam;voortgang %;laatst gezien;Hoofdstuk een › Sectie een;'), csvC.tekst.slice(0, 80));
check('KL11: een naam die met = begint, wordt nooit een formule', csvC.tekst.includes(`"'=HYPERLINK(""http://boos.example"",""klik"")"`) && !/^=HYPERLINK/m.test(csvC.tekst));
check('KL11: lege secties staan als "niet geopend", zonder apostrof voor een streepje', csvC.tekst.includes('niet geopend') && !csvC.tekst.includes("'-"));
check('KL11: de bestandsnaam is behouden', csvC.naam === 'voortgang - Testcursus.csv', csvC.naam);

// A11Y19: cursus niet gevonden
await go('/#/cursus/volg/bestaat-niet');
check('A11Y19: "cursus niet gevonden" heeft één h1 en één main', (await tellingen('main')) === 1 && (await tellingen('h1')) === 1 && (await page.locator('h1').innerText()).trim() === 'Cursus niet gevonden');

// ── 3b. Doelendekking in de cursuseditor ────────────────────────────────────
console.log('3b. Doelendekking');
await go('/#/cursus/bewerk/c-test');
await page.getByRole('button', { name: /Doelendekking/ }).click();
const dekking = page.getByRole('dialog', { name: 'Doelendekking' });
await dekking.waitFor();
check('KL5: een oefening uit een ander leerplan wordt gemeld en telt niet mee voor de dekking',
  /Deze oefeningen horen bij een ander leerplan en tellen niet mee/.test(await dekking.innerText()));
const andere = await dekking.locator('.callout.warn li').allInnerTexts();
check('KL5: de melding noemt de oefening en haar leerplan', andere.length === 1 && /Test quiz B/.test(andere[0]) && /Leerplan B — Techniek/.test(andere[0]), andere.join(' | '));
check('A11Y14: het schuifkader van de dekkingsmatrix is een benoemd gebied met focus',
  (await dekking.locator('[role=region][tabindex="0"][aria-label="Dekking per leerplandoel en hoofdstuk"]').count()) === 1);
await axeSchoon('doelendekking (bureaublad)');

// ── 4. Smal scherm ──────────────────────────────────────────────────────────
console.log('4. Op 390 pixels');
await page.setViewportSize({ width: 390, height: 844 });
for (const [naam, hash] of [['overzicht', '/#/resultaten'], ['detail', '/#/resultaten/w-quiz'], ['cursusvoortgang', '/#/cursus/volg/c-test']]) {
  await go(hash);
  check(`390 px: ${naam} scrollt niet horizontaal`, await passtOpSmal());
  await axeSchoon(`${naam} (390 px)`);
}
// de brede tabel scrolt in haar eigen kader, dat met het toetsenbord bereikbaar is
await go('/#/cursus/volg/c-test');
const kader = await page.evaluate(() => {
  const e = document.querySelector('[role=region][aria-label="Leesvoortgang per leerling en sectie"]');
  return e ? { scrolt: e.scrollWidth > e.clientWidth + 1, focus: e.tabIndex === 0 } : null;
});
check('390 px: de brede tabel scrolt in haar eigen kader, dat de focus kan krijgen', !!kader && kader.scrolt && kader.focus, JSON.stringify(kader));
await go('/#/resultaten/w-quiz');
await page.getByRole('tab', { name: 'Per leerling' }).click();
await sleep(200);
check('390 px: de lijst per leerling scrolt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1280, height: 900 });

await browser.close();

check('geen pagina- of consolefouten', errors.length === 0, errors.slice(0, 3).join(' | '));
if (failures > 0) {
  console.log(`\n${failures} CHECK(S) MISLUKT`);
  process.exit(1);
}
console.log('\nALLE RESULTATEN-CHECKS GESLAAGD');
