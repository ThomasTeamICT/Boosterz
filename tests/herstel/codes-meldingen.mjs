// Rooktest herstelpakket H2 (debugronde oktober 2026): eerlijke meldingen bij
// codes inlezen en een strengere controle van resultaatcodes.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/codes-meldingen.mjs
//
//  G5   Volle opslag tijdens het inlezen van codes in het Inleverpunt: wat niet
//       bewaard werd, blijft (volledig) in het tekstvak staan en de lijst zegt
//       waarom; na ruimte maken lukt "opnieuw verwerken".
//  S4   Een code met een object als reflectie (en andere ongetypte meta-
//       antwoorden) komt gesaneerd binnen; het detail in Resultaten crasht niet,
//       ook niet bij een inzending die al ongetypt bewaard stond.
//  S2   Een kleine code die uitpakt tot megabytes wordt geweigerd met een
//       melding; een echte tekening (data-URL) niet.
//  G15  "Mijn versie houden" bij een cursusbestand met een pdf laat geen
//       pdf zonder verwijzing achter in IndexedDB; "Vervangen" en "Als kopie"
//       zetten hem wel terug. Een mislukte export meldt dat.
//
// Per scenario een vers browserprofiel; verzoeken naar buiten worden
// afgebroken. Faalt hard (exit 1) bij een mislukte controle of paginafout.

import { chromium } from 'playwright-core';
import LZString from 'lz-string';
import { randomBytes } from 'node:crypto';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lz = (o) => LZString.compressToEncodedURIComponent(JSON.stringify(o));
const code = (o) => 'WF1.' + lz(o);

// ── Inhoud ──────────────────────────────────────────────────────────────────

const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };
const NU = Date.now();

const WIDGET = {
  id: 'w_cm', type: 'quiz', title: 'Meldingenquiz', folderId: null, code: 'CMC001', createdAt: 1, updatedAt: 1, settings: SETTINGS,
  config: { questions: [{ id: 'q1', type: 'tf', prompt: 'Water kookt bij 100 °C.', points: 1, answer: true }] },
};

function inzending(over = {}) {
  return {
    id: 'cm-x', widgetId: 'w_cm', widgetCode: 'CMC001', studentName: 'Emma', startedAt: NU - 60000, submittedAt: NU,
    durationSec: 60, answers: { q1: true }, itemScores: { q1: { earned: 1, max: 1, mode: 'auto' } },
    totalEarned: 1, totalMax: 1, status: 'graded', ...over,
  };
}

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

/** Vers profiel met één widget in de opslag; geeft { ctx, page, errors } terug. */
async function freshPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE);
  await sleep(600);
  await page.evaluate((w) => {
    localStorage.setItem('wf.widgets.v1', JSON.stringify([w]));
    localStorage.setItem('wf.prefs.v1', JSON.stringify({ theme: 'auto', teacherName: 'T', seeded: true }));
    localStorage.setItem('wf.classes.seeded.v1', '1');
  }, WIDGET);
  return { ctx, page, errors };
}

const subs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]'));
const geenOverloop = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Vult localStorage tot er `laat` tekens vrij zijn (in een eigen sleutel, buiten de app). */
function vulOpslag(page, laat) {
  return page.evaluate((laat) => {
    const KEY = 'test.vulling';
    localStorage.removeItem(KEY);
    let cur = '';
    let stuk = 1 << 20;
    while (stuk >= 1) {
      try {
        localStorage.setItem(KEY, cur + 'x'.repeat(stuk));
        cur += 'x'.repeat(stuk);
      } catch { stuk >>= 1; }
    }
    localStorage.setItem(KEY, cur.slice(0, cur.length - laat));
    return cur.length - laat;
  }, laat);
}

async function openInleverpunt(page) {
  await page.goto(BASE + '#/inleverpunt');
  await page.getByRole('heading', { level: 1, name: /Inleverpunt/ }).waitFor({ timeout: 10000 });
  await sleep(300);
}
const verwerk = async (page) => {
  // Staat het tekstvak leeg, dan is de knop uit: dat is geen reden om te crashen, de controles melden het.
  await page.getByRole('button', { name: /Codes verwerken/ }).click({ timeout: 5000 }).catch(() => {});
  await sleep(1200);
};
const tekstvak = (page) => page.locator('#inbox-codes');
const melding = (page) => page.locator('p.hint[role=status]').innerText();
const codesIn = async (page) => (await tekstvak(page).inputValue()).split(/\s+/).filter(Boolean);

/** Pdf in IndexedDB lezen (zelfde database als lib/idb.ts). */
async function pdfInDb(page, id) {
  return page.evaluate(async (id) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('wf-files', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pdfs')) r.result.createObjectStore('pdfs', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const uit = await new Promise((res, rej) => {
      const t = db.transaction('pdfs', 'readonly');
      const g = t.objectStore('pdfs').get(id);
      let out = null;
      g.onsuccess = () => { out = g.result ? { name: g.result.name, size: g.result.size } : null; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
    db.close();
    return uit;
  }, id);
}

// ═══ G5: volle opslag tijdens het inlezen ═══════════════════════════════════
console.log('G5. Volle opslag tijdens het inlezen van codes (Inleverpunt, 390 px)');
{
  const t = await freshPage({ width: 390, height: 844 });
  const N = 12;
  const codes = Array.from({ length: N }, (_, i) => code(inzending({
    id: `cm-${i + 1}`, studentName: `Leerling ${i + 1}`, submittedAt: NU + i, answers: { q1: true, notitie: 'z'.repeat(300) },
  })));
  await openInleverpunt(t.page);
  await tekstvak(t.page).fill(`Hier zijn de codes van de klas:\n${codes.join('\n')}\nGroetjes`);
  await vulOpslag(t.page, 4000);
  await verwerk(t.page);

  const bewaardIds = new Set((await subs(t.page)).map((s) => s.id));
  const nietBewaard = codes.filter((_, i) => !bewaardIds.has(`cm-${i + 1}`));
  check(`een deel is bewaard, een deel niet (${bewaardIds.size} van ${N} bewaard)`, bewaardIds.size >= 1 && bewaardIds.size < N);
  const staat = await codesIn(t.page);
  check('de niet-bewaarde codes staan nog volledig in het tekstvak, de bewaarde niet', JSON.stringify(staat) === JSON.stringify(nietBewaard), `${staat.length} in het tekstvak, ${nietBewaard.length} niet bewaard`);
  const tekst = await melding(t.page);
  check('de melding zegt dat er codes in het tekstvak blijven staan', /niet verwerkt/.test(tekst) && /in het tekstvak/.test(tekst), tekst);
  check('de lijst legt uit dat de opslag vol is', await t.page.getByText(/Niet bewaard: de opslag van dit toestel is vol/).first().isVisible().catch(() => false));
  check('de lijst noemt het niet "onleesbaar of beschadigd"', (await t.page.getByText(/onvolledig of beschadigd/).count()) === 0);
  check('geen horizontale scroll op 390 px', await geenOverloop(t.page));

  // Ruimte maken en opnieuw verwerken: de rest lukt nu, niets wordt dubbel.
  await t.page.evaluate(() => localStorage.removeItem('test.vulling'));
  await verwerk(t.page);
  const alle = await subs(t.page);
  check('na ruimte maken zijn alle codes bewaard', alle.length === N && new Set(alle.map((s) => s.id)).size === N, `${alle.length} bewaard`);
  check('het tekstvak is nu leeg', (await tekstvak(t.page).inputValue()) === '');
  check('G5: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ═══ S4: ongetypte meta-antwoorden ══════════════════════════════════════════
console.log('S4. Een object als reflectie laat het detail niet crashen');
{
  const t = await freshPage();
  const slecht = {
    q1: true, _doelreflectie: { boem: 1 }, _hints: [1, 2], _zekerheid: { q1: { x: 1 } }, _doel: 'nee',
    _foutenanalyse: { volgendeKeer: { x: 1 }, labels: { q1: 'constructor' } }, _sourceHighlights: 'nee',
  };
  await openInleverpunt(t.page);
  await tekstvak(t.page).fill(code(inzending({ id: 'cm-code', answers: slecht })));
  await verwerk(t.page);
  const bewaard = (await subs(t.page)).find((s) => s.id === 'cm-code');
  check('de code is bewaard', !!bewaard);
  const sleutels = Object.keys(bewaard?.answers ?? {}).sort();
  // alleen de foutenanalyse houdt een geldig deel: de labels (tekst), niet de volgendeKeer (object)
  check('de ongetypte meta-antwoorden zijn niet bewaard', JSON.stringify(sleutels) === JSON.stringify(['_foutenanalyse', 'q1']), sleutels.join(','));
  check('van de foutenanalyse bleven alleen de labels over', JSON.stringify(bewaard?.answers?._foutenanalyse) === JSON.stringify({ labels: { q1: 'constructor' } }));

  await t.page.goto(BASE + '#/resultaten/w_cm');
  await t.page.getByRole('button', { name: 'Inzending van Emma bekijken' }).click();
  const dialoog = t.page.getByRole('dialog', { name: 'Inzending van Emma' });
  await dialoog.waitFor({ timeout: 8000 }).catch(() => {});
  check('het detail van de code opent', await dialoog.isVisible().catch(() => false));
  await t.page.keyboard.press('Escape');

  // Een inzending die al ongetypt bewaard stond (van vóór de sanering).
  await t.page.evaluate(({ s }) => {
    const alle = JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]');
    alle.unshift(s);
    localStorage.setItem('wf.submissions.v1', JSON.stringify(alle));
  }, {
    s: inzending({
      id: 'cm-oud', studentName: 'Oud', submittedAt: NU - 5000,
      answers: {
        q1: true, _doelreflectie: { boem: 1 }, _hints: [1, 2, null], _zekerheid: { q1: 7 }, _doel: { proces: { x: 1 }, streef: 'veel' },
        _foutenanalyse: { volgendeKeer: ['x'], labels: { q1: 'constructor' } }, _sourceHighlights: [null, { id: 1 }],
      },
    }),
  });
  await t.page.reload();
  await t.page.getByRole('button', { name: 'Inzending van Oud bekijken' }).click();
  const oud = t.page.getByRole('dialog', { name: 'Inzending van Oud' });
  await oud.waitFor({ timeout: 8000 }).catch(() => {});
  check('ook een al ongetypt bewaarde inzending opent zonder crash', await oud.isVisible().catch(() => false));
  check('S4: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ═══ S2: een te grote code ══════════════════════════════════════════════════
console.log('S2. Een kleine code die uitpakt tot megabytes wordt geweigerd');
{
  const t = await freshPage();
  const groot = code(inzending({ id: 'cm-groot', studentName: 'Groot', answers: { q1: true, x: 'a'.repeat(1_500_000) } }));
  const tekening = 'data:image/jpeg;base64,' + randomBytes(150_000).toString('base64');
  const echt = code(inzending({ id: 'cm-tekening', studentName: 'Tekenaar', submittedAt: NU + 1, answers: { q1: true, tekening } }));
  const goed = code(inzending({ id: 'cm-goed', studentName: 'Goed', submittedAt: NU + 2 }));
  check('de code is klein, het antwoord groot', groot.length < 5000, `${groot.length} tekens`);
  await openInleverpunt(t.page);
  await tekstvak(t.page).fill(`${groot}\n${echt}\n${goed}`);
  await verwerk(t.page);
  const s = await subs(t.page);
  const ids = s.map((x) => x.id);
  check('de te grote code is niet bewaard', !ids.includes('cm-groot'));
  const raw = await t.page.evaluate(() => (localStorage.getItem('wf.submissions.v1') || '').length);
  check('de opslag bleef klein', raw < 400_000, `${raw} tekens`);
  check('een echte tekening (150 kB) en een gewone code zijn wel bewaard', ids.includes('cm-tekening') && ids.includes('cm-goed'));
  check('de lijst zegt waarom de code geweigerd is', await t.page.getByText(/Niet bewaard: deze code bevat veel meer antwoorden of tekst/).first().isVisible().catch(() => false));
  check('de lijst noemt het niet "beschadigd"', (await t.page.getByText(/onvolledig of beschadigd/).count()) === 0);
  const staat = await codesIn(t.page);
  check('de geweigerde code blijft in het tekstvak, de rest niet', staat.length === 1 && staat[0] === groot);
  check('S2: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
  await t.ctx.close();
}

// ═══ G15: pdf's bij een cursusbestand en een mislukte export ════════════════
console.log('G15. Cursusbestand met pdf: pas na de keuze, alleen voor wat bewaard wordt');
{
  const PDF = '%PDF-1.4\n% rooktest H2\n';
  const blok = (pdfId) => ({ id: 'b_pdf', type: 'pdf', pdfId, name: 'bron.pdf' });
  const cursus = (title, extra = []) => ({
    id: 'c_g15', title, author: '', coverEmoji: '📘', code: 'CG1500', createdAt: 1, updatedAt: NU,
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    chapters: [{ id: 'ch1', title: 'Hoofdstuk', sections: [{ id: 's1', title: 'Sectie', optional: false, blocks: [{ id: 'b1', type: 'text', markdown: 'Tekst' }, ...extra] }] }],
  });
  const bestand = {
    app: 'boosterz', kind: 'cursus', v: 1,
    course: cursus('Versie uit het bestand', [blok('pdf_h2')]), widgets: [],
    pdfs: [{ id: 'pdf_h2', name: 'bron.pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.from(PDF).toString('base64') }],
  };
  const importeer = async (page, naam = 'cursus.json') => {
    await page.locator('input[type=file][accept*="json"]').first().setInputFiles({ name: naam, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bestand)) });
    await page.getByRole('dialog').filter({ hasText: 'Er staat al een versie op dit toestel' }).waitFor({ timeout: 8000 }).catch(() => {});
  };
  const eigenCursus = (page) => page.evaluate((c) => localStorage.setItem('wf.courses.v1', JSON.stringify([c])), cursus('Mijn eigen versie'));

  // "Mijn versie houden": geen pdf zonder verwijzing; daarna "Als kopie bewaren": wel.
  {
    const t = await freshPage();
    await eigenCursus(t.page);
    await t.page.goto(BASE + '#/cursussen');
    await t.page.getByRole('heading', { name: 'Mijn eigen versie' }).waitFor({ timeout: 10000 }).catch(() => {});
    await importeer(t.page);
    check('de vraag verschijnt', await t.page.getByRole('dialog').filter({ hasText: 'Er staat al een versie op dit toestel' }).isVisible().catch(() => false));
    check('vóór de keuze staat de pdf nog niet in IndexedDB', (await pdfInDb(t.page, 'pdf_h2')) === null);
    await t.page.getByRole('button', { name: 'Mijn versie houden' }).click();
    await sleep(1200);
    const c = await t.page.evaluate(() => JSON.parse(localStorage.getItem('wf.courses.v1') || '[]'));
    check('"Mijn versie houden": de eigen cursus bleef staan', c.length === 1 && c[0].title === 'Mijn eigen versie');
    check('"Mijn versie houden": geen pdf zonder verwijzing in IndexedDB', (await pdfInDb(t.page, 'pdf_h2')) === null);
    check('de melding zegt dat de eigen versie bleef staan', await t.page.getByText(/je eigen versie bleef staan/).first().isVisible().catch(() => false));
    check('en noemt geen teruggezette pdf', (await t.page.getByText(/pdf teruggezet/).count()) === 0);

    await importeer(t.page);
    await t.page.getByRole('button', { name: 'Als kopie bewaren' }).click();
    await sleep(1200);
    check('"Als kopie bewaren": de pdf van de kopie staat er wel', (await pdfInDb(t.page, 'pdf_h2'))?.name === 'bron.pdf');
    check('G15 houden/kopie: geen paginafout', t.errors.length === 0, t.errors.join(' | '));
    await t.ctx.close();
  }

  // "Vervangen": de pdf komt mee.
  {
    const t = await freshPage();
    await eigenCursus(t.page);
    await t.page.goto(BASE + '#/cursussen');
    await t.page.getByRole('heading', { name: 'Mijn eigen versie' }).waitFor({ timeout: 10000 }).catch(() => {});
    await importeer(t.page);
    await t.page.getByRole('button', { name: 'Vervangen door de versie uit het bestand' }).click();
    await sleep(1200);
    check('"Vervangen": de pdf staat in IndexedDB', (await pdfInDb(t.page, 'pdf_h2'))?.name === 'bron.pdf');
    check('de melding noemt de teruggezette pdf', await t.page.getByText(/pdf teruggezet/).first().isVisible().catch(() => false));
    await t.ctx.close();
  }

  // Een mislukte export meldt dat.
  {
    const t = await freshPage();
    await eigenCursus(t.page);
    await t.page.goto(BASE + '#/cursussen');
    await t.page.getByRole('heading', { name: 'Mijn eigen versie' }).waitFor({ timeout: 10000 }).catch(() => {});
    await t.page.evaluate(() => {
      const orig = JSON.stringify;
      JSON.stringify = function (v, ...rest) {
        if (v && typeof v === 'object' && v.kind === 'cursus') throw new Error('te groot');
        return orig.call(this, v, ...rest);
      };
    });
    await t.page.getByRole('button', { name: 'Acties voor Mijn eigen versie' }).click();
    await t.page.getByRole('menuitem', { name: /Exporteren/ }).click();
    await sleep(1000);
    check('een mislukte export toont een melding', await t.page.getByText(/Exporteren mislukt/).first().isVisible().catch(() => false));
    check('geen onverwerkte paginafout', t.errors.length === 0, t.errors.join(' | '));
    await t.ctx.close();
  }
}

console.log('');
await browser.close();
if (failures > 0) {
  console.log(`${failures} CHECK(S) GEFAALD`);
  process.exit(1);
}
console.log('ALLE CODES-MELDINGEN CHECKS GESLAAGD');
