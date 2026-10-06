// Rooktest herstelpakket K5: het klasdashboard en de klassenlijst van de leerkracht.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/klassen.mjs
//
// Zaait in localStorage een klas met twee leerlingen met dezelfde naam, twee
// leerplannen met dezelfde doelcode, toewijzingen en inzendingen (ook een die
// nog nagekeken moet worden). Geen AI, geen sleutel, geen verkeer naar buiten.
//
//  KL5   de doelcode van twee leerplannen blijft twee rijen, elk met zijn eigen label
//  KL7   een score die nog nagekeken moet worden heet "voorlopig", nooit 0 procent
//  KL4   dubbele namen: waarschuwing in het dashboard, de klassenlijst, de klaslijst
//        en bij een geplakte lijst; toevoegen van een bestaande naam wordt geweigerd
//  KL9   "Bewaren" blijft uit zolang een naam leeg is
//  KL11  csv met BOM, punten en maximum als aparte getallen
//  KL14  een bestaande opdracht kiezen vult deadline en instructie in
//  A11Y19 één main en één h1 in de lege, de gevulde en de "niet gevonden"-toestand
//  390 px zonder horizontaal scrollen

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
const SLEUTEL = JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-NEP-SLEUTEL-KLASSEN', model: 'm' });
const errors = [];
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Gezaaide inhoud ─────────────────────────────────────────────────────────

const NU = Date.now();
const DEADLINE = NU + 3 * 86400000;
const NOTITIE = 'Maak dit vóór vrijdag; twee pogingen mogen.';
const SETTINGS = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: true, instructions: '' };

const mc = (id, goalCode) => ({ id, type: 'mc', prompt: `Vraag ${id}`, points: 1, options: ['a', 'b'], correctIndex: 0, ...(goalCode ? { goalCode } : {}) });
const open = (id, goalCode, points = 3) => ({ id, type: 'long', prompt: `Open vraag ${id}`, points, ...(goalCode ? { goalCode } : {}) });
const quiz = (id, title, code, questions, curriculumId) => ({
  id, type: 'quiz', title, folderId: null, code, config: { layout: 'single', questions }, settings: SETTINGS,
  createdAt: 1, updatedAt: 1, ...(curriculumId ? { curriculumId } : {}),
});

const WIDGETS = [
  quiz('wA', 'Breuken oefenen', 'WAAAAA', [mc('qa1', 'LPD 3')], 'cur_a'),
  quiz('wB', 'Teksten samenvatten', 'WBBBBB', [mc('qb1', 'LPD 3')], 'cur_b'),
  quiz('wC', 'Open vragen', 'WCCCCC', [mc('qc1', 'LPD 5'), open('qc2', 'LPD 5'), open('qc3', 'LPD 6', 2)], 'cur_a'),
  quiz('wD', 'Nog niet toegewezen', 'WDDDDD', [mc('qd1')]),
  quiz('wE', 'Ook nog niet toegewezen', 'WEEEEE', [mc('qe1')]),
];

const doel = (id, code, text) => ({ id, code, text });
const CURRICULA = [
  {
    id: 'cur_a', title: 'Wiskunde 1e graad', net: 'eigen', subject: 'Wiskunde', level: '1e graad', createdAt: 1, updatedAt: 1,
    goals: [
      doel('ga1', 'LPD 3', 'Wiskundig doel A: breuken optellen en aftrekken'),
      doel('ga2', 'LPD 5', 'Wiskundig doel vijf: de omtrek berekenen'),
      doel('ga3', 'LPD 6', 'Wiskundig doel zes: een oppervlakte schatten'),
    ],
  },
  {
    id: 'cur_b', title: 'Nederlands 1e graad', net: 'eigen', subject: 'Nederlands', level: '1e graad', createdAt: 1, updatedAt: 1,
    goals: [doel('gb1', 'LPD 3', 'Nederlands doel B: een zakelijke tekst samenvatten')],
  },
];

const KLAS = {
  id: 'k1', name: 'Klas 2B', code: 'KLAS2B', schoolYear: '2026-2027', createdAt: 1, updatedAt: 1,
  students: [
    { id: 's1', name: 'Lucas Janssens', number: 1 },
    { id: 's2', name: 'Lucas Janssens', number: 2 },
    { id: 's3', name: 'Emma Peeters', number: 3 },
  ],
};
const LEGE_KLAS = { id: 'k0', name: 'Lege klas', code: 'LEEG01', students: [], createdAt: 1, updatedAt: 1 };

const opdracht = (id, targetId, createdAt, extra = {}) => ({ id, classId: 'k1', kind: 'widget', targetId, createdAt, ...extra });
const ASSIGNMENTS = [
  opdracht('a1', 'wA', 1),
  opdracht('a2', 'wB', 2),
  opdracht('a3', 'wC', 3, { dueAt: DEADLINE, note: NOTITIE }),
];

const inzending = (id, widgetId, studentId, studentName, itemScores, totalEarned, totalMax, status) => ({
  id, widgetId, widgetCode: WIDGETS.find((w) => w.id === widgetId).code, studentName, studentId, classId: 'k1',
  startedAt: NU - 120000, submittedAt: NU - 60000, durationSec: 60, answers: {}, itemScores, totalEarned, totalMax, status,
});
const SUBMISSIONS = [
  inzending('i1', 'wA', 's3', 'Emma Peeters', { qa1: { earned: 1, max: 1, mode: 'auto' } }, 1, 1, 'graded'),
  inzending('i2', 'wB', 's3', 'Emma Peeters', { qb1: { earned: 0, max: 1, mode: 'auto' } }, 0, 1, 'graded'),
  // Lucas (nr 1): één vraag goed, twee open vragen wachten nog op nakijken.
  inzending('i3', 'wC', 's1', 'Lucas Janssens', {
    qc1: { earned: 1, max: 1, mode: 'auto' },
    qc2: { earned: 0, max: 3, mode: 'pending' },
    qc3: { earned: 0, max: 2, mode: 'pending' },
  }, 1, 6, 'submitted'),
];

// ── Browser ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

/**
 * Vers profiel: eerst één keer opstarten (de app zaait zijn voorbeelden), dan de
 * eigen inhoud in localStorage zetten en herladen. `inhoud` bepaalt wat erin komt.
 */
async function freshPage(width, inhoud) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || /ERR_CERT_AUTHORITY_INVALID|ERR_FAILED/.test(m.text())) return;
    errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(({ inhoud, sleutel }) => {
    localStorage.setItem('wf.ai.v1', sleutel);
    localStorage.setItem('wf.classes.seeded.v1', '1'); // geen voorbeeldklas erbij
    for (const [k, v] of Object.entries(inhoud)) localStorage.setItem(k, JSON.stringify(v));
  }, { inhoud, sleutel: SLEUTEL });
  const go = async (hash) => {
    await page.goto(BASE + hash);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(400);
  };
  return { ctx, page, go };
}

const VOL = {
  'wf.classes.v1': [KLAS, LEGE_KLAS],
  'wf.assignments.v1': ASSIGNMENTS,
  'wf.widgets.v1': WIDGETS,
  'wf.submissions.v1': SUBMISSIONS,
  'wf.curricula.v1': CURRICULA,
};
const LEEG = { 'wf.classes.v1': [], 'wf.assignments.v1': [] };

/** Eén main en één h1 op het scherm, en niets dat horizontaal buiten beeld loopt. */
async function structuur(page, naam) {
  const h1 = await page.locator('h1').count();
  const main = await page.locator('main').count();
  check(`${naam}: één h1`, h1 === 1, `h1=${h1}`);
  check(`${naam}: één main`, main === 1, `main=${main}`);
}
async function geenHorizontaleScroll(page, naam) {
  const m = await page.evaluate(() => ({ breedte: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  check(`${naam}: geen horizontaal scrollen (${m.breedte} ≤ ${m.scherm})`, m.breedte <= m.scherm);
}

// ═══ A11Y19 — structuur in de lege, gevulde en foute toestanden ═════════════
console.log('A11Y19. Eén main en één h1');
{
  const { ctx, page, go } = await freshPage(1100, LEEG);
  await go('#/klassen');
  check('klassen leeg: "Nog geen klassen"', await page.getByRole('heading', { name: 'Nog geen klassen' }).isVisible());
  await structuur(page, 'klassen leeg');
  await go('#/klas/bestaat-niet');
  check('onbekende klas: "Klas niet gevonden" is de h1', (await page.locator('h1', { hasText: 'Klas niet gevonden' }).count()) === 1);
  await structuur(page, 'klas niet gevonden');
  await ctx.close();
}
{
  const { ctx, page, go } = await freshPage(1100, VOL);
  await go('#/klassen');
  await structuur(page, 'klassen gevuld');
  await go('#/klas/k0');
  check('klas zonder leerlingen: kop "Nog geen leerlingen"', await page.getByRole('heading', { name: /Nog geen leerlingen/ }).isVisible());
  check('klas zonder leerlingen: h1 is de klasnaam', (await page.locator('h1', { hasText: 'Lege klas' }).count()) === 1);
  await structuur(page, 'klas zonder leerlingen');
  await go('#/klas/k1');
  await structuur(page, 'klasdashboard gevuld');
  await page.getByRole('button', { name: 'Klaslijst', exact: true }).click();
  await sleep(300);
  check('klaslijst-venster is open', await page.getByRole('dialog', { name: 'Klaslijst bewerken' }).isVisible());
  await structuur(page, 'klasdashboard met venster open');
  await ctx.close();
}

// ═══ KL5, KL7, KL4, KL9, KL11, KL14 op het dashboard ════════════════════════
const { ctx, page, go } = await freshPage(1100, VOL);

console.log('KL5. Doelcode in twee leerplannen');
await go('#/klas/k1');
const emma = page.locator('details', { hasText: 'Emma Peeters' });
await emma.locator('summary').click();
await sleep(300);
const emmaRijen = emma.locator('.klas-doelrij');
check('Emma heeft twee doelrijen (LPD 3 uit twee leerplannen)', (await emmaRijen.count()) === 2);
const emmaTekst = await emmaRijen.allInnerTexts();
check('rij uit het wiskundeleerplan toont zijn eigen doeltekst', emmaTekst.some((t) => /LPD 3 — Wiskundig doel A/.test(t)), emmaTekst.join(' | '));
check('rij uit het leerplan Nederlands toont zijn eigen doeltekst', emmaTekst.some((t) => /LPD 3 — Nederlands doel B/.test(t)), emmaTekst.join(' | '));
check('de twee rijen tellen niet samen: 1/1 en 0/1', emmaTekst.some((t) => /1\/1 · 100%/.test(t)) && emmaTekst.some((t) => /0\/1 · 0%/.test(t)), emmaTekst.join(' | '));
const emmaAria = await emma.locator('.scorebar').evaluateAll((a) => a.map((x) => x.getAttribute('aria-label') || ''));
check('de balken noemen het juiste doel voor schermlezers', emmaAria.some((t) => /Wiskundig doel A.*100 procent/.test(t)) && emmaAria.some((t) => /Nederlands doel B.*0 procent/.test(t)), emmaAria.join(' | '));
check('geen duplicaat-sleutelwaarschuwing van React', !errors.some((e) => /same key/.test(e)));

console.log('KL7. Voorlopige scores');
const lucasPaneel = page.locator('details', { hasText: 'Lucas Janssens' }).first();
await lucasPaneel.locator('summary').click();
await sleep(300);
const lucasRijen = await lucasPaneel.locator('.klas-doelrij').allInnerTexts();
check('doel met een open vraag erbij: "(voorlopig)"', lucasRijen.some((t) => /LPD 5.*1\/1 · 100% \(voorlopig\)/s.test(t)), lucasRijen.join(' | '));
check('doel waar alleen nog werk wacht: "nog na te kijken", geen 0%', lucasRijen.some((t) => /LPD 6.*nog na te kijken \(1 vraag\)/s.test(t) && !/0%/.test(t)), lucasRijen.join(' | '));
const lucasBalk = await lucasPaneel.locator('.scorebar').evaluateAll((a) => a.map((x) => x.getAttribute('aria-label') || ''));
check('schermlezers horen "voorlopig" en "nog na te kijken"', lucasBalk.some((t) => /voorlopig/.test(t)) && lucasBalk.some((t) => /nog na te kijken/.test(t)), lucasBalk.join(' | '));
const matrixRijen = await page.locator('table.data tbody tr').allInnerTexts();
// innerText volgt de hoofdletters van de css en plakt het klasnummer vast aan de naam ("1LUCAS JANSSENS").
const rijLucas1 = matrixRijen.find((t) => /^1\s*Lucas Janssens/i.test(t)) ?? '';
check('matrix: score van Lucas 1 heet "17% (voorlopig)"', /17% \(voorlopig\)/.test(rijLucas1), rijLucas1);
check('matrix: "na te kijken" blijft zichtbaar', /na te kijken/.test(rijLucas1), rijLucas1);
const rijLucas2 = matrixRijen.find((t) => /^2\s*Lucas Janssens/i.test(t)) ?? '';
check('matrix: de andere Lucas (andere studentId) heeft niets ingediend', !/voorlopig|ingediend/.test(rijLucas2) && /niet gestart/.test(rijLucas2), rijLucas2);
check('"Nog na te kijken"-melding noemt de oefening', await page.locator('.callout.warn', { hasText: 'Nog na te kijken' }).getByText(/Open vragen \(1\)/).isVisible());

console.log('KL4. Dubbele namen');
const waarschuwing = page.locator('.callout.warn[role="status"]', { hasText: 'meer dan eens in de klas' });
check('dashboard waarschuwt voor "Lucas Janssens"', await waarschuwing.getByText(/“Lucas Janssens” staat meer dan eens in de klas/).isVisible());
await page.getByRole('button', { name: 'Klaslijst aanpassen' }).click();
await sleep(300);
const venster = page.getByRole('dialog', { name: 'Klaslijst bewerken' });
check('klaslijst-venster waarschuwt ook', await venster.getByText(/staat meer dan eens in de klas/).isVisible());
const dubbeleRijen = await venster.locator('input[aria-invalid="true"]').count();
check('beide Lucassen staan gemarkeerd (aria-invalid)', dubbeleRijen === 2, `n=${dubbeleRijen}`);
check('de markering staat ook als tekst naast het veld', (await venster.getByText('dubbele naam', { exact: true }).count()) === 2);
const eersteDubbele = venster.locator('input[aria-invalid="true"]').first();
const beschrijving = await eersteDubbele.evaluate((el) => document.getElementById(el.getAttribute('aria-describedby') || '')?.textContent?.trim() ?? '');
check('aria-describedby wijst naar de reden', /dubbele naam/.test(beschrijving), beschrijving);

// toevoegen van een bestaande naam wordt geweigerd, met het toetsenbord
const nieuwVeld = venster.getByLabel('Leerling toevoegen');
await nieuwVeld.fill('  emma   PEETERS ');
await nieuwVeld.press('Enter');
await sleep(200);
check('toevoegen van "emma peeters" wordt geweigerd met een melding', await venster.getByRole('alert').getByText(/“emma +PEETERS” staat al in de klas/).isVisible());
check('de lijst blijft op 3 leerlingen', await venster.getByText('3 leerlingen in de lijst').isVisible());
check('focus blijft in het invoerveld', await page.evaluate(() => document.activeElement?.getAttribute('placeholder') === 'Voornaam en naam'));
check('invoerveld is gemarkeerd als ongeldig', (await nieuwVeld.getAttribute('aria-invalid')) === 'true');
await nieuwVeld.fill('Emma Peeters B');
check('melding verdwijnt zodra je verder typt', (await venster.getByRole('alert').count()) === 0);
await nieuwVeld.press('Enter');
await sleep(200);
check('een eigen naam wordt wel toegevoegd (4 leerlingen)', await venster.getByText('4 leerlingen in de lijst').isVisible());
check('het invoerveld is weer leeg', (await nieuwVeld.inputValue()) === '');

// geplakte lijst
await venster.getByText('Hele lijst vervangen door geplakte tekst').click();
await venster.getByLabel('Klaslijst plakken').fill('Anna Maes\nAnna Maes\nBert Aerts');
check('geplakte lijst: "1 dubbele naam overgeslagen: Anna Maes"', await venster.getByText('1 dubbele naam overgeslagen: Anna Maes').isVisible());
await venster.getByRole('button', { name: 'Lijst vervangen' }).click();
await sleep(200);
check('na het vervangen blijft de melding staan', await venster.getByText(/Lijst vervangen: 2 leerlingen\. 1 dubbele naam overgeslagen: Anna Maes\./).isVisible());
check('de lijst telt nu 2 leerlingen en de dubbele waarschuwing is weg', await venster.getByText(/2 leerlingen in de lijst/).isVisible() && (await venster.getByText(/staat meer dan eens in de klas/).count()) === 0);

console.log('KL9. Bewaren bij een lege naam');
const bewaren = venster.getByRole('button', { name: 'Bewaren' });
check('Bewaren is aan bij een geldige lijst', await bewaren.isEnabled());
const eersteNaam = venster.getByLabel('Naam van leerling 1');
await eersteNaam.fill('');
check('Bewaren is uit bij een lege naam', await bewaren.isDisabled());
check('status: "Geef elke leerling een naam, of verwijder de lege rij."', await venster.getByText('Geef elke leerling een naam, of verwijder de lege rij.').isVisible());
check('het lege veld is gemarkeerd en benoemd', (await eersteNaam.getAttribute('aria-invalid')) === 'true' && await venster.getByText('geen naam', { exact: true }).isVisible());
await eersteNaam.fill('Anna Maes');
check('Bewaren is weer aan na het invullen', await bewaren.isEnabled());
await venster.getByLabel('Naam van leerling 2').fill('');
check('opnieuw leeg: Bewaren uit', await bewaren.isDisabled());
await venster.getByRole('button', { name: /uit de lijst verwijderen/ }).last().click();
check('de lege rij verwijderen maakt Bewaren weer aan', await bewaren.isEnabled());
await venster.getByRole('button', { name: 'Annuleren' }).click();
await sleep(200);
const naAnnuleren = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.classes.v1')).find((k) => k.id === 'k1').students.length);
check('annuleren verandert niets aan de klas (3 leerlingen)', naAnnuleren === 3, `n=${naAnnuleren}`);

console.log('KL11. Csv-export');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /CSV/ }).click(),
]);
const bytes = readFileSync(await download.path());
check('het bestand begint met een BOM (EF BB BF)', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, [...bytes.slice(0, 3)].map((b) => b.toString(16)).join(' '));
const csv = bytes.toString('utf8').replace(/^﻿/, '');
const csvRegels = csv.split('\n');
check('bestandsnaam eindigt op .csv', /\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
check('kop met aparte kolommen voor punten en maximum', /Open vragen — punten;Open vragen — maximum;Open vragen — % \(score of gelezen\)/.test(csvRegels[0]), csvRegels[0]);
const lucasCsv = csvRegels.find((r) => /^1;Lucas Janssens;/.test(r)) ?? '';
check('Lucas 1: voorlopig, 1 punt van 6, 17 procent — als getallen', /ingediend \(voorlopig\);1;6;17/.test(lucasCsv), lucasCsv);
const emmaCsv = csvRegels.find((r) => /^3;Emma Peeters;/.test(r)) ?? '';
check('Emma: ingediend met punten en maximum apart', /ingediend;1;1;100/.test(emmaCsv) && /ingediend;0;1;0/.test(emmaCsv), emmaCsv);
check('geen "1/6" of "7/10" meer: Excel zou er een datum van maken', !/\d+\/\d+/.test(csv), csv.match(/\d+\/\d+/)?.[0] ?? '');
check('elke rij heeft evenveel kolommen als de kop', csvRegels.every((r) => r.split(';').length === csvRegels[0].split(';').length));

console.log('KL14. Deadline en instructie bij een bestaande opdracht');
await page.getByRole('button', { name: /Opdracht toevoegen/ }).click();
await sleep(300);
const opdrachtVenster = page.getByRole('dialog', { name: 'Opdracht toevoegen' });
await opdrachtVenster.getByLabel('Wat geef je op?').selectOption('widget');
const keuze = opdrachtVenster.getByLabel('Oefening', { exact: true });
const kies = async (titel) => {
  const waarde = await keuze.locator('option', { hasText: titel }).first().getAttribute('value');
  await keuze.selectOption(waarde);
  await sleep(150);
};
const datum = opdrachtVenster.getByLabel(/Deadline/);
const instructie = opdrachtVenster.getByLabel(/Instructie/);
const verwachteDatum = await page.evaluate((t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}, DEADLINE);
await kies('Open vragen');
check('bestaande opdracht met deadline: de datum staat er al in', (await datum.inputValue()) === verwachteDatum, await datum.inputValue());
check('bestaande opdracht met instructie: de tekst staat er al in', (await instructie.inputValue()) === NOTITIE, await instructie.inputValue());
await kies('Breuken oefenen');
check('andere bestaande opdracht zonder deadline: velden zijn weer leeg', (await datum.inputValue()) === '' && (await instructie.inputValue()) === '');
await kies('Nog niet toegewezen');
await instructie.fill('Mijn eigen tekst');
await kies('Ook nog niet toegewezen');
check('wat de leerkracht zelf typte, blijft staan bij een nieuwe opdracht', (await instructie.inputValue()) === 'Mijn eigen tekst');
await kies('Open vragen');
check('terug naar de bestaande opdracht: deadline en instructie komen terug', (await datum.inputValue()) === verwachteDatum && (await instructie.inputValue()) === NOTITIE);
await opdrachtVenster.getByRole('button', { name: 'Toevoegen' }).click();
await sleep(300);
const naBijwerken = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.assignments.v1')).filter((a) => a.classId === 'k1' && a.targetId === 'wC'));
check('"bijwerken" wist de deadline en de instructie niet', naBijwerken.length === 1 && naBijwerken[0].note === NOTITIE && typeof naBijwerken[0].dueAt === 'number', JSON.stringify(naBijwerken));

console.log('Klassenlijst (/klassen)');
await go('#/klassen');
const kaart = page.locator('.card', { hasText: 'Klas 2B' });
check('de kaart van de klas waarschuwt voor de dubbele naam', await kaart.getByText(/“Lucas Janssens” staat meer dan eens in de lijst/).isVisible());
check('de kaart van een klas zonder dubbels doet dat niet', (await page.locator('.card', { hasText: 'Lege klas' }).getByText(/meer dan eens/).count()) === 0);
await page.getByRole('button', { name: /Nieuwe klas/ }).click();
await sleep(300);
const nieuweKlas = page.getByRole('dialog', { name: 'Nieuwe klas' });
await nieuweKlas.getByLabel('Naam van de klas').fill('Klas 3C');
await nieuweKlas.getByLabel(/Klaslijst plakken/).fill('1 Lucas Janssens\n2 Emma Peeters\nLucas Janssens\n3 Lucas Janssens');
check('nieuwe klas: "2 leerlingen herkend"', await nieuweKlas.getByText(/2 leerlingen herkend: Lucas Janssens, Emma Peeters/).isVisible());
check('nieuwe klas: "1 dubbele naam overgeslagen: Lucas Janssens"', await nieuweKlas.getByText(/1 dubbele naam overgeslagen: Lucas Janssens/).isVisible());
await nieuweKlas.getByLabel(/Klaslijst plakken/).fill('Anna\nBert');
check('zonder dubbels verdwijnt de melding', (await nieuweKlas.getByText(/dubbele naam/).count()) === 0);
await ctx.close();

// ═══ 390 px ═════════════════════════════════════════════════════════════════
console.log('390 px');
{
  const { ctx, page, go } = await freshPage(390, VOL);
  await go('#/klassen');
  await geenHorizontaleScroll(page, '/klassen');
  await go('#/klas/k1');
  await geenHorizontaleScroll(page, '/klas/k1');
  for (const naam of ['Emma Peeters', 'Lucas Janssens']) {
    await page.locator('details', { hasText: naam }).first().locator('summary').click();
  }
  await sleep(300);
  await geenHorizontaleScroll(page, '/klas/k1 met doelscores open');
  const rij = await page.locator('.klas-doelrij').first().boundingBox();
  check('doelrijen vallen binnen het scherm', !!rij && rij.x >= 0 && rij.x + rij.width <= 390, JSON.stringify(rij));
  await page.getByRole('button', { name: 'Klaslijst aanpassen' }).click();
  await sleep(300);
  await geenHorizontaleScroll(page, 'klaslijst-venster');
  const venster390 = page.getByRole('dialog', { name: 'Klaslijst bewerken' });
  await venster390.getByLabel('Naam van leerling 1').fill('');
  await geenHorizontaleScroll(page, 'klaslijst-venster met fouten');
  const modal = await venster390.boundingBox();
  check('het venster past in het scherm', !!modal && modal.x >= 0 && modal.x + modal.width <= 390, JSON.stringify(modal));
  await ctx.close();
}

await browser.close();

check('geen pagina- of consolefouten', errors.length === 0, errors.join(' | '));
console.log(failures ? `\n${failures} controle(s) gefaald` : '\nALLE KLASSENCHECKS GESLAAGD');
process.exit(failures ? 1 : 0);
