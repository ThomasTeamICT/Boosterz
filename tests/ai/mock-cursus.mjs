// Cursus-AI met een nagebootste AI: herwerken, optimaliseren per hoofdstuk en
// sectie vullen, zonder sleutel en zonder internet.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/ai/mock-cursus.mjs
//
// Controleert het herstel uit de debugronde van oktober 2026:
// - optimaliseren laat lange tekst volledig (geen afgeknipte kaders meer);
// - mislukt elk hoofdstuk, dan kan je niet "toepassen", met een zichtbare reden;
// - herwerken van een te grote cursus wordt geweigerd zonder AI-aanvraag;
// - "sectie vullen" voegt altijd achteraan toe en laat media van de AI weg;
// - vanuit een studierichting (overdracht van "Voor een studierichting"): de AI-cursusbouwer opent met vak en
//   doelgroep vooraf ingevuld, en de cursus die eruit komt draagt de doelgroep van de overdracht, nooit een
//   studierichting die de AI zelf in het antwoord zet.
// - de competenties van een beroepskwalificatie (docs/STUDIERICHTINGEN.md § 23.7.3), op de nagebootste matrix en de nagebootste
//   beroepskwalificaties van tests/fixtures: kiezen, één competentie uitvinken (één doel minder), het leerplan en de cursus,
//   hergebruik, het geraamte van een BK-leerplan dat al op het toestel staat en de overdracht naar de AI.
import { readFileSync } from 'node:fs';
import pw from 'playwright-core';
const { chromium } = pw;
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const CORS = { 'access-control-allow-origin': '*' };
const FIXTURES = new URL('../fixtures/', import.meta.url);

/** Tekst van precies `n` tekens, zonder aanhalingstekens of regeleinden. */
const longText = (n, tag) => {
  let out = '';
  for (let i = 1; out.length < n; i++) out += `Zin ${i} van ${tag} gaat over verdamping en condensatie. `;
  return out.slice(0, n);
};
const TEXT = longText(3000, 'tekst');
const CALLOUT = longText(657, 'kader');

const baseCourse = (chapters) => ({
  id: 'c1', title: 'Testcursus', author: '', coverEmoji: '📘', code: 'ABC123',
  settings: { accentColor: '#4f46e5', requireName: true, showProgressToStudent: true },
  createdAt: 1, updatedAt: 1, chapters,
});

const sse = (text) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`
  + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\n`
  + 'data: [DONE]\n\n';

const checks = [];
const check = (naam, ok) => { checks.push([naam, ok]); console.log(`${ok ? '✓' : '✗'} ${naam}`); };

/**
 * Verse browser met één cursus en een nagebootste Gemini. `answer(prompt)` geeft {status, body} of een JSON-object.
 * `extra` (optioneel): `hash` (waar de pagina opent), `curricula` (bewaarde leerplannen), `handoff` (de overdracht in
 * sessionStorage, zoals "Voor een studierichting" ze klaarzet), `fixtures` (de nagebootste matrix van de studierichtingen en de
 * nagebootste beroepskwalificaties uit tests/fixtures, zonder service worker die ze zou onderscheppen); zonder cursus
 * (`course` null) begint de lijst leeg.
 */
async function setup(course, answer, extra = {}) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...(extra.fixtures ? { serviceWorkers: 'block' } : {}) });
  if (extra.fixtures) {
    // Een bestand dat er niet is, geeft een 404, zoals de echte server.
    const serveer = (map, prefix) => (route) => {
      const rest = decodeURIComponent(new URL(route.request().url()).pathname.split(prefix)[1] ?? '');
      let body = null;
      if (/^[\w./-]+$/.test(rest) && !rest.includes('..')) { try { body = readFileSync(new URL(rest, new URL(map, FIXTURES))); } catch { body = null; } }
      if (body === null) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'niet gevonden' });
      return route.fulfill({ status: 200, contentType: 'application/json', body });
    };
    await ctx.route('**/leerplannen/structuur/**', serveer('structuur/uit/', '/leerplannen/structuur/'));
    await ctx.route('**/leerplannen/kwalificaties/**', serveer('kwalificaties/uit/', '/leerplannen/kwalificaties/'));
  }
  await ctx.addInitScript((seed) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: 'test-sleutel', model: 'gemini-3.7-flash' }));
    localStorage.setItem('wf.courses.v1', JSON.stringify(seed.course ? [seed.course] : []));
    localStorage.setItem('wf.prefs.v1', JSON.stringify({ theme: 'auto', teacherName: 'T', seeded: true }));
    if (seed.curricula) localStorage.setItem('wf.curricula.v1', JSON.stringify(seed.curricula));
    if (seed.handoff) sessionStorage.setItem('wf.handoff.v1', JSON.stringify({ ...seed.handoff, at: Date.now() }));
    // Zonder deze vlag zet de lijst een voorbeeldcursus naast de cursus uit de test.
    if (!seed.course) localStorage.setItem('wf.democursus.v1', '1');
  }, { course, curricula: extra.curricula, handoff: extra.handoff });
  const state = { requests: 0, answer };
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*' } });
    state.requests++;
    const prompt = JSON.parse(req.postData() || '{}').messages.map((m) => m.content).join('\n');
    const out = await state.answer(prompt);
    if (out && out.status) {
      return route.fulfill({ status: out.status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: 'overloaded' } }) });
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(JSON.stringify(out)) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + (extra.hash ?? '/#/cursus/bewerk/c1'), { waitUntil: 'networkidle' });
  return { browser, page, state, errs };
}

const storedCourse = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wf.courses.v1'))[0]);
async function waitForStored(page, pred, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    const c = await storedCourse(page);
    if (pred(c) || Date.now() > end) return c;
    await page.waitForTimeout(250);
  }
}

// ── 1. Optimaliseren per hoofdstuk: alles mislukt, dan één opnieuw ─────────
{
  const chapters = [1, 2].map((k) => ({
    id: `ch${k}`, title: `Hoofdstuk ${k}`, emoji: '📗',
    sections: [{ id: `s${k}`, title: `Sectie ${k}`, blocks: [
      { id: `t${k}`, type: 'text', markdown: TEXT },
      { id: `k${k}`, type: 'callout', kind: 'info', title: 'Kader', text: CALLOUT },
      { id: `img${k}`, type: 'image', url: 'https://example.test/schema.png', size: 'normal' },
    ] }],
  }));
  const echoChapter = async (prompt) => {
    await new Promise((r) => setTimeout(r, 1500));
    const i = prompt.indexOf('=== HOOFDSTUK (compact) ===');
    return { chapter: JSON.parse(prompt.slice(i).split('\n').slice(1).join('\n')) };
  };
  const { browser, page, state, errs } = await setup(baseCourse(chapters), () => ({ status: 503 }));
  await page.getByRole('button', { name: /Optimaliseer/ }).click();
  await page.getByRole('button', { name: /Genereren/ }).click();
  const applyBtn = page.getByRole('button', { name: /Optimalisatie toepassen/ });
  await applyBtn.waitFor({ timeout: 20000 });
  check('alle hoofdstukken mislukt: twee foutkaarten', (await page.getByRole('button', { name: /Opnieuw proberen/ }).count()) === 2);
  check('alle hoofdstukken mislukt: toepassen staat uit', await applyBtn.isDisabled());
  check('alle hoofdstukken mislukt: de reden staat erbij', await page.getByText(/Geen enkel hoofdstuk kon geoptimaliseerd worden/).isVisible());

  state.answer = echoChapter;
  await page.getByRole('button', { name: /Opnieuw proberen/ }).first().click();
  await page.waitForTimeout(400);
  check('tijdens opnieuw proberen: kaart blijft, met "Wordt opnieuw geprobeerd"', await page.getByText(/Wordt opnieuw geprobeerd/).isVisible());
  check('tijdens opnieuw proberen: toepassen staat nog uit', await applyBtn.isDisabled());
  await page.getByText(/Wordt opnieuw geprobeerd/).waitFor({ state: 'hidden', timeout: 10000 });
  check('na één geslaagd hoofdstuk: nog één foutkaart', (await page.getByRole('button', { name: /Opnieuw proberen/ }).count()) === 1);
  check('na één geslaagd hoofdstuk: toepassen staat aan', await applyBtn.isEnabled());
  await applyBtn.click();
  check('melding zegt hoeveel hoofdstukken toegepast zijn', await page.getByText(/toegepast op 1 van 2 hoofdstukken/).first().isVisible());
  const after = await waitForStored(page, (c) => c.updatedAt !== 1);
  const blocks1 = after.chapters[0].sections[0].blocks;
  check('tekstblok van 3000 tekens volledig bewaard', blocks1.find((b) => b.type === 'text')?.markdown === TEXT);
  check('kader van 657 tekens volledig bewaard', blocks1.find((b) => b.type === 'callout')?.text === CALLOUT);
  check('afbeelding teruggeplaatst', blocks1.some((b) => b.id === 'img1' && b.type === 'image'));
  check('geen paginafouten (optimaliseren)', errs.length === 0);
  console.log('  aanvragen:', state.requests);
  await browser.close();
}

// ── 2. Herwerken van een te grote cursus: weigeren zonder aanvraag ──────────
{
  const sections = Array.from({ length: 40 }, (_, i) => ({
    id: `s${i}`, title: `Sectie ${i + 1}`, blocks: [{ id: `t${i}`, type: 'text', markdown: TEXT }],
  }));
  const { browser, page, state, errs } = await setup(baseCourse([{ id: 'ch1', title: 'Groot', sections }]), () => ({ status: 503 }));
  await page.getByRole('button', { name: /Herwerk met AI/ }).click();
  await page.getByRole('button', { name: /Genereren/ }).click();
  const alert = page.getByRole('alert').filter({ hasText: /Te groot om in één keer te herwerken/ });
  await alert.waitFor({ timeout: 5000 });
  check('te grote cursus: melding "Te groot om in één keer te herwerken"', await alert.isVisible());
  check('te grote cursus: verwijst naar Optimaliseren (per hoofdstuk)', /kies Optimaliseren \(per hoofdstuk\)/.test(await alert.innerText()));
  check('te grote cursus: geen "Opnieuw proberen" in de melding', (await alert.getByRole('button').count()) === 0);
  check('te grote cursus: geen enkele AI-aanvraag', state.requests === 0);
  check('geen paginafouten (herwerken)', errs.length === 0);
  await browser.close();
}

// ── 2b. Een gewone cursus herwerken gaat wél gewoon door ────────────────────
{
  const sections = [0, 1].map((i) => ({ id: `s${i}`, title: `Sectie ${i + 1}`, blocks: [{ id: `t${i}`, type: 'text', markdown: TEXT }] }));
  const { browser, page, state, errs } = await setup(baseCourse([{ id: 'ch1', title: 'Klein', sections }]), (prompt) => {
    const i = prompt.indexOf('=== HUIDIGE CURSUS (compact) ===');
    return { course: JSON.parse(prompt.slice(i).split('\n').slice(1).join('\n')) };
  });
  await page.getByRole('button', { name: /Herwerk met AI/ }).click();
  await page.getByRole('button', { name: /Genereren/ }).click();
  await page.getByRole('button', { name: /Herwerking toepassen/ }).waitFor({ timeout: 15000 });
  check('gewone cursus: herwerken stuurt één aanvraag en toont de voorvertoning', state.requests === 1);
  check('gewone cursus: geen melding "te groot"', (await page.getByText(/Te groot om in één keer/).count()) === 0);
  check('geen paginafouten (gewone cursus herwerken)', errs.length === 0);
  await browser.close();
}

// ── 3. Sectie vullen: altijd achteraan, media van de AI weg ─────────────────
{
  const course = baseCourse([{ id: 'ch1', title: 'Hoofdstuk 1', sections: [{ id: 's1', title: 'Verdamping', blocks: [
    { id: 'b1', type: 'text', markdown: 'ORIGINELE UITLEG over verdamping die de leerkracht zelf schreef.' },
    { id: 'b2', type: 'image', url: 'https://example.test/schema.png', caption: 'Schema van de kringloop', size: 'normal' },
    { id: 'b3', type: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk', caption: 'Filmpje' },
  ] }] }]);
  const { browser, page, errs } = await setup(course, () => ({
    blocks: [
      { type: 'callout', kind: 'goal', title: 'Doel', text: 'Ik kan uitleggen wat condensatie is.' },
      { type: 'text', markdown: 'Aanvulling: condensatie is het omgekeerde van verdamping.' },
      { type: 'embed', url: 'https://evil.example/login', height: 400 },
      { type: 'image', url: 'https://tracker.example/p.png' },
    ],
  }));
  await page.getByRole('button', { name: /Vul deze sectie met AI/ }).first().click();
  check('sectie vullen: uitleg dat er achteraan aangevuld wordt', await page.getByText(/De nieuwe blokken komen achteraan/).isVisible());
  await page.getByRole('button', { name: /Genereren/ }).click();
  await page.getByText(/blok\(ken\) voor/).waitFor({ timeout: 15000 });
  check('sectie vullen: geen keuze "Bestaande blokken vervangen" meer', (await page.getByText('Bestaande blokken vervangen').count()) === 0);
  check('sectie vullen: twee blokken in de voorvertoning', /^2 blok\(ken\)/.test(await page.getByText(/blok\(ken\) voor/).innerText()));
  check('sectie vullen: waarschuwing over weggelaten media', (await page.getByText('Een mediablok van de AI is weggelaten.').count()) === 2);
  await page.getByRole('button', { name: /^Toepassen$/ }).click();
  const after = await waitForStored(page, (c) => c.chapters[0].sections[0].blocks.length > 3);
  const types = after.chapters[0].sections[0].blocks.map((b) => b.type);
  check(`sectie vullen: bestaande blokken blijven, nieuwe achteraan (${types.join(',')})`, JSON.stringify(types) === JSON.stringify(['text', 'image', 'video', 'callout', 'text']));
  check('geen paginafouten (sectie vullen)', errs.length === 0);
  await browser.close();
}

// ── 4. Vanuit een studierichting: overdracht met doelgroep ───────────────────
{
  // De eigen overdracht van de app draagt geen kader; een andere (of geknoeide) bron wel. Dat mag nooit op de cursus komen.
  const doelgroep = {
    groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so', vak: 'Biologie',
    kader: 'c'.repeat(64), kaderVolledig: 'd'.repeat(64), volgtKader: true,
  };
  const leerplan = {
    id: 'lp1', title: 'Biologie · Natuurwetenschappen · 2de graad', net: 'minimumdoelen', subject: 'Biologie', level: '2de graad',
    createdAt: 1, updatedAt: 1,
    goals: [
      { id: 'g1', code: 'B1.1', text: 'De leerlingen kunnen de bouw van een cel beschrijven.', theme: 'Biologie' },
      { id: 'g2', code: 'B1.2', text: 'De leerlingen kunnen de functie van celorganellen uitleggen.', theme: 'Biologie' },
    ],
    // Zo komt het leerplan uit "Voor een studierichting": met de vingerafdruk van het kader en zonder jaar.
    doelgroep: {
      groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'so', vak: 'Biologie',
      kader: 'a'.repeat(64), kaderVolledig: 'b'.repeat(64), volgtKader: true,
    },
  };
  // De AI zet zelf een studierichting en een ander leerplan in zijn antwoord: dat mag nooit doorwerken.
  const aiCursus = {
    course: {
      title: 'De bouw van de cel', subtitle: '', coverEmoji: '🔬',
      curriculumId: 'verzonnen', doelgroep: { groep: 'G-9999', titel: 'Verzonnen richting', soort: 'so' },
      chapters: [{ title: 'De cel', emoji: '🔬', sections: [
        { title: 'Bouw van de cel', goals: ['Ik kan de cel beschrijven.'], goalCodes: ['B1.1'], optional: false, blocks: [{ type: 'text', markdown: 'Een cel heeft een kern.' }] },
        { title: 'Celorganellen', goals: ['Ik kan celorganellen uitleggen.'], goalCodes: ['B1.2'], optional: false, blocks: [{ type: 'text', markdown: 'Mitochondriën leveren energie.' }] },
      ] }],
    },
  };
  let gezienPrompt = '';
  const { browser, page, state, errs } = await setup(null, (prompt) => { gezienPrompt = prompt; return aiCursus; }, {
    hash: '/#/cursussen?ai=nieuw',
    curricula: [leerplan],
    handoff: { source: '', title: 'Biologie · Natuurwetenschappen · 4de jaar', curriculumId: 'lp1', goalCodes: ['B1.1', 'B1.2'], doelgroep },
  });
  const modal = page.getByRole('dialog', { name: 'AI-cursusbouwer' });
  await modal.waitFor({ timeout: 10000 });
  check('studierichting: de AI-cursusbouwer opent met de overdracht', await modal.isVisible());
  check('studierichting: "Vak / onderwerp" vooraf ingevuld met het vak', (await modal.getByLabel('Vak / onderwerp').inputValue()) === 'Biologie');
  check('studierichting: "Doelgroep" vooraf ingevuld met de studierichting en het jaar, zonder het vak', (await modal.getByLabel('Doelgroep').inputValue()) === 'Natuurwetenschappen · 4de jaar');
  check('studierichting: voorgestelde titel en leerplan overgenomen', (await modal.getByLabel('Voorgestelde titel').inputValue()) === 'Biologie · Natuurwetenschappen · 4de jaar'
    && await modal.getByText('2 van 2 doelen').first().isVisible());
  await modal.getByRole('button', { name: /Genereren/ }).click();
  await modal.getByRole('button', { name: /Cursus aanmaken/ }).waitFor({ timeout: 15000 });
  check('studierichting: vak en doelgroep gaan mee in de opdracht aan de AI', /Vak\/onderwerp: Biologie/.test(gezienPrompt) && /Doelgroep: Natuurwetenschappen · 4de jaar/.test(gezienPrompt));
  await modal.getByRole('button', { name: /Cursus aanmaken/ }).click();
  await page.waitForURL(/#\/cursus\/bewerk\//, { timeout: 15000 });
  const bewaard = await waitForStored(page, (c) => c !== undefined && c.title === 'De bouw van de cel');
  check('studierichting: de cursus draagt de doelgroep van de overdracht (G-0193, 4de jaar, vak Biologie)',
    bewaard.doelgroep?.groep === 'G-0193' && bewaard.doelgroep?.jaar === 4 && bewaard.doelgroep?.vak === 'Biologie' && bewaard.doelgroep?.graad === 2);
  check('studierichting: zonder kader, kaderVolledig en volgtKader (die horen bij het leerplan), ook als de overdracht ze droeg',
    bewaard.doelgroep !== undefined && !('kader' in bewaard.doelgroep) && !('kaderVolledig' in bewaard.doelgroep) && !('volgtKader' in bewaard.doelgroep));
  check('studierichting: wat de AI als studierichting of leerplan verzon, telt niet', bewaard.doelgroep?.groep !== 'G-9999' && bewaard.curriculumId === 'lp1');
  check('studierichting: de doelcodes staan op de secties', JSON.stringify(bewaard.chapters[0].sections.map((s) => s.goalCodes)) === JSON.stringify([['B1.1'], ['B1.2']]));
  // In de editor staat de studierichting bij de cursusinstellingen.
  await page.getByRole('button', { name: /Instellingen/ }).first().click();
  const instellingen = page.getByRole('dialog', { name: 'Cursusinstellingen' });
  check('studierichting: de cursusinstellingen tonen de studierichting', (await instellingen.locator('.rc-waarde').innerText()) === 'Biologie · Natuurwetenschappen · 4de jaar');
  check('studierichting: de overdracht is gewist uit sessionStorage', (await page.evaluate(() => sessionStorage.getItem('wf.handoff.v1'))) === null);

  // "Wijzig" opent de richtingkiezer met een nagebootste lijst van richtingen (de echte staat nog niet in de app).
  const onderdeel = (nummer, groep) => ({
    nummer, groep, titel: `Onderdeel ${nummer}`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
    leerjaren: [{ code: '1' }, { code: '2' }], hoofdstructuren: ['311', '321'],
  });
  const richting = (nummer, titel, onderdelen) => ({ nummer, titel, graad: '2', finaliteit: 'DO', onderdelen });
  const matrix = {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: 3, aantalOnderdelen: 3, sha256: 'ab'.repeat(32),
    groepen: [richting('G-0193', 'Natuurwetenschappen', [1]), richting('G-0194', 'Economie', [2]), richting('G-0900', 'Zeer late richting', [3])],
    onderdelen: [onderdeel(1, 'G-0193'), onderdeel(2, 'G-0194'), onderdeel(3, 'G-0900')],
  };
  await page.route('**/leerplannen/structuur/studierichtingen.json', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(matrix) }));
  const voor = (await storedCourse(page)).doelgroep;
  await instellingen.getByRole('button', { name: 'Wijzig de studierichting' }).click();
  const kiezer = page.getByRole('dialog', { name: 'Studierichting van deze cursus' });
  await kiezer.getByLabel('Zoek een richting').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  check('richtingkiezer: de focus gaat naar het zoekveld zodra de lijst er staat',
    await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search' && document.activeElement.closest('[role="dialog"]')?.getAttribute('aria-label') === 'Studierichting van deze cursus'));
  check('richtingkiezer: de huidige richting staat bovenaan de lijst, aangevinkt',
    (await kiezer.locator('.rc-richting-naam').first().innerText()) === 'Natuurwetenschappen' && await kiezer.locator('input[name="rc-richting"]').first().isChecked());
  await kiezer.getByRole('button', { name: 'Kies deze richting' }).click();
  await kiezer.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(1500);
  const na = (await storedCourse(page)).doelgroep;
  check('richtingkiezer: bevestigen zonder wijziging laat de doelgroep ongemoeid', JSON.stringify(na) === JSON.stringify(voor), { voor, na });
  check('richtingkiezer: de cursusinstellingen tonen nog dezelfde studierichting', (await instellingen.locator('.rc-waarde').innerText()) === 'Biologie · Natuurwetenschappen · 4de jaar');
  check('geen paginafouten (studierichting)', errs.length === 0);
  console.log('  aanvragen:', state.requests);
  await browser.close();
}

// ── 5. De competenties van een beroepskwalificatie (§ 23.7.3) ────────────────
{
  // G-0008 (2de graad, doorstroomfinaliteit A, duaal) heeft in de fixtures twee beroepskwalificaties: Onthaalmedewerker (12
  // competenties) en Recreatief medewerker (13), en ook minimumdoelen. Het venster opent bij de sets; de leerkracht kiest de competenties.
  let gezienPrompt = '';
  const { browser, page, state, errs } = await setup(null, (prompt) => { gezienPrompt = prompt; return { status: 503 }; }, {
    hash: '/#/cursussen/richtingen/G-0008?jaar=3',
    fixtures: true,
  });
  const lees = () => page.evaluate(() => ({
    cursussen: JSON.parse(localStorage.getItem('wf.courses.v1') || '[]'),
    leerplannen: JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]'),
  }));
  const openVenster = async () => {
    await page.getByRole('button', { name: /Maak een cursus voor deze richting/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({ timeout: 10000 });
    return dlg;
  };
  /** Na het maken: wachten tot de editor er echt staat (de route laadt lui), anders breekt een volgende navigatie ze af. */
  const naarEditor = async () => {
    await page.waitForURL(/#\/cursus\/bewerk\//, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  };
  const BK_KEUZE = 'De competenties van een beroepskwalificatie';

  const dlg = await openVenster();
  check('competenties: de vierde keuze staat er, en de standaard blijft "Kies de sets" (er zijn minimumdoelen)',
    (await dlg.locator('input[name="rc-doelen"]').count()) === 4 && await dlg.getByRole('radio', { name: 'Kies de sets voor deze cursus' }).isChecked());
  check('competenties: de tip bij een andere keuze (finaliteit A)', await dlg.getByText('Geef je een beroepsgericht vak? Kies dan de competenties van een beroepskwalificatie.').isVisible());
  await dlg.getByRole('radio', { name: BK_KEUZE }).check();
  await dlg.getByRole('checkbox', { name: 'Alle 12 competenties' }).waitFor({ timeout: 10000 });
  check('competenties: per beroepskwalificatie een fieldset met "naam · n competenties"',
    JSON.stringify(await dlg.locator('fieldset.rc-bk-groep > legend').allInnerTexts()) === JSON.stringify(['Onthaalmedewerker · 12 competenties', 'Recreatief medewerker · 13 competenties']));
  check('competenties: nog niets gekozen: de teller en de voet zeggen het, en maken kan nog niet',
    (await dlg.locator('.rc-teller').innerText()) === 'Je koos nog geen competenties.'
    && (await dlg.locator('.rc-nodig').innerText()) === 'Nog nodig: minstens één competentie.'
    && (await dlg.getByRole('button', { name: 'Maak de cursus' }).getAttribute('aria-disabled')) === 'true');
  check('competenties: de hint bij "Met een geraamte" is die van de competenties',
    (await dlg.locator('#rc-b-geraamte').innerText()).startsWith('Een hoofdstuk per beroepskwalificatie en een sectie per competentie'));

  // Alle 12, dan één uitvinken: 11 doelen (de valkuil: nooit stil de hele beroepskwalificatie)
  await dlg.getByRole('checkbox', { name: 'Alle 12 competenties' }).check();
  await dlg.locator('.rc-bk-details > summary').first().click();
  const eersteRij = dlg.locator('.rc-bk-lijst').first().locator('label').first();
  await eersteRij.locator('input').uncheck();
  check('competenties: "(11 van 12)", "Alle 12" gedeeltelijk aangevinkt en de teller zegt 11',
    (await dlg.locator('.rc-bk-details > summary').first().innerText()) === 'Kies zelf de competenties (11 van 12)'
    && await dlg.getByRole('checkbox', { name: 'Alle 12 competenties' }).evaluate((e) => e.indeterminate && !e.checked)
    && (await dlg.locator('.rc-teller').innerText()) === 'Je koos 11 competenties uit 1 beroepskwalificatie.');
  check('competenties: het titelvoorstel gebruikt de titel van de beroepskwalificatie als vak',
    (await dlg.locator('#rc-titel').inputValue()) === 'Onthaalmedewerker · Assistent dierlijke productie · 3de jaar');
  const rijHoogtes = await dlg.locator('.rc-bk-rij').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h > 0));
  check('competenties: elke rij is minstens 44 px hoog', rijHoogtes.length >= 13 && Math.min(...rijHoogtes) >= 44);
  await dlg.getByRole('button', { name: 'Maak de cursus' }).click();
  await naarEditor();
  let opslag = await lees();
  const cursus = opslag.cursussen.find((c) => c.doelgroep?.groep === 'G-0008');
  const leerplan = opslag.leerplannen.find((l) => l.id === cursus?.curriculumId);
  check('competenties: een nagekeken leerplan van de methode beroepskwalificatie, net beroepskwalificaties',
    leerplan?.herkomst?.methode === 'beroepskwalificatie' && leerplan.net === 'beroepskwalificaties' && leerplan.controle?.status === 'gecontroleerd');
  check('competenties: precies 11 doelen, elk met één bkRef en zonder refs naar minimumdoelen',
    leerplan?.goals.length === 11 && leerplan.goals.every((g) => g.bkRefs?.length === 1 && !(g.refs ?? []).length));
  check('competenties: de uitgevinkte competentie is niet in het leerplan en "alle" staat niet aan',
    !leerplan?.goals.some((g) => g.code === 'BK-0390-2.01') && leerplan?.bkVersies?.[0]?.bk === 'BK-0390-2' && leerplan.bkVersies[0].alle === undefined);
  check('competenties: een hoofdstuk met 11 secties, elk met één doelcode van het leerplan en het blok "Doel in deze sectie"',
    cursus?.chapters.length === 1 && cursus.chapters[0].sections.length === 11
    && cursus.chapters[0].sections.every((s) => s.goalCodes?.length === 1 && s.blocks[0]?.title === 'Doel in deze sectie')
    && JSON.stringify(cursus.chapters[0].sections.map((s) => s.goalCodes[0])) === JSON.stringify(leerplan.goals.map((g) => g.code)));
  check('competenties: de cursus draagt de studierichting, en het leerplan heeft geen jaar en geen kadervelden',
    cursus?.doelgroep?.groep === 'G-0008' && cursus.doelgroep.jaar === 3 && leerplan?.doelgroep?.jaar === undefined && !('kader' in (leerplan?.doelgroep ?? {})));
  check('competenties: geen competentiecode (bkc…) in de titel of ondertitel van de cursus', !/bkc\d/.test(`${cursus?.title} ${cursus?.subtitle}`));
  await page.getByText(/Cursus gemaakt/).first().waitFor({ timeout: 4000 }).catch(() => {});
  check('competenties: de melding "Cursus gemaakt: 1 hoofdstuk, 11 competenties klaar op de secties."',
    (await page.locator('[role="status"]').allInnerTexts()).some((t) => t.includes('Cursus gemaakt: 1 hoofdstuk, 11 competenties klaar op de secties.')));

  // Dezelfde keuze nog eens: het leerplan wordt hergebruikt
  await page.goto(`${BASE}/#/cursussen/richtingen/G-0008?jaar=3`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const dlg2 = await openVenster();
  await dlg2.getByRole('radio', { name: BK_KEUZE }).check();
  await dlg2.getByRole('checkbox', { name: 'Alle 12 competenties' }).waitFor({ timeout: 10000 });
  await dlg2.getByRole('checkbox', { name: 'Alle 12 competenties' }).check();
  await dlg2.locator('.rc-bk-details > summary').first().click();
  await dlg2.locator('.rc-bk-lijst').first().locator('input').first().uncheck();
  await dlg2.getByRole('radio', { name: 'Met een lege cursus' }).check();
  await dlg2.getByRole('button', { name: 'Maak de cursus' }).click();
  await naarEditor();
  opslag = await lees();
  check('hergebruik: nog steeds één BK-leerplan, nu met twee cursussen', opslag.leerplannen.filter((l) => l.herkomst?.methode === 'beroepskwalificatie').length === 1
    && opslag.cursussen.filter((c) => c.curriculumId === leerplan.id).length === 2);
  await page.getByText(/Cursus gemaakt/).first().waitFor({ timeout: 4000 }).catch(() => {});
  check('hergebruik: de melding zegt dat er al een leerplan stond (lege cursus: "met 11 competenties van Onthaalmedewerker")',
    (await page.locator('[role="status"]').allInnerTexts()).some((t) => t.includes('Cursus gemaakt met 11 competenties van Onthaalmedewerker. Er stond al een leerplan met precies deze competenties: de cursus hangt daaraan.')));

  // Een leerplan dat al op dit toestel staat: het BK-leerplan geeft het geraamte van de competenties, met kennis en vaardigheden
  await page.goto(`${BASE}/#/cursussen/richtingen/G-0008?jaar=3`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const dlg3 = await openVenster();
  await dlg3.getByRole('radio', { name: 'Een leerplan dat al op dit toestel staat' }).check();
  check('bestaand BK-leerplan: de hint bij het geraamte is die van de competenties',
    (await dlg3.locator('#rc-b-geraamte').innerText()).startsWith('Een hoofdstuk per beroepskwalificatie en een sectie per competentie'));
  await dlg3.getByRole('button', { name: 'Maak de cursus' }).click();
  await naarEditor();
  opslag = await lees();
  // De nieuwste cursus (de lijst bewaart de nieuwste vooraan, dus niet op de plaats in de lijst vertrouwen).
  const derde = [...opslag.cursussen.filter((c) => c.curriculumId === leerplan.id)].sort((a, b) => b.createdAt - a.createdAt)[0];
  check('bestaand BK-leerplan: één hoofdstuk met 11 secties (niet alles in één sectie "Vakspecifieke competentie")',
    derde?.chapters.length === 1 && derde.chapters[0].sections.length === 11);
  check('bestaand BK-leerplan: secties met "Kennis en vaardigheden uit de beroepskwalificatie"',
    derde?.chapters[0].sections.some((s) => s.blocks.some((b) => b.title === 'Kennis en vaardigheden uit de beroepskwalificatie')));

  // Met AI: de overdracht draagt de doelcodes van de competenties
  await page.goto(`${BASE}/#/cursussen/richtingen/G-0008?jaar=3`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const dlg4 = await openVenster();
  await dlg4.getByRole('radio', { name: BK_KEUZE }).check();
  await dlg4.getByRole('checkbox', { name: 'Alle 13 competenties' }).check();
  await dlg4.getByRole('radio', { name: 'Laat de AI een eerste versie maken' }).check();
  await dlg4.getByRole('button', { name: 'Maak de cursus' }).click();
  await page.waitForURL(/#\/cursussen\?ai=nieuw/, { timeout: 15000 });
  const bouwer = page.getByRole('dialog', { name: 'AI-cursusbouwer' });
  await bouwer.waitFor({ timeout: 10000 });
  check('AI: de cursusbouwer opent met de titel van het voorstel en het nieuwe BK-leerplan met 13 van 13 doelen',
    (await bouwer.getByLabel('Voorgestelde titel').inputValue()) === 'Recreatief medewerker · Assistent dierlijke productie · 3de jaar'
    && await bouwer.getByText('13 van 13 doelen').first().isVisible());
  await bouwer.getByRole('button', { name: /Genereren/ }).click();
  await page.waitForTimeout(1500);
  check('AI: de opdracht aan de AI noemt de doelcodes van de competenties (BK-0464-1.01 …)', /BK-0464-1\.01/.test(gezienPrompt) && /BK-0464-1\.13/.test(gezienPrompt), gezienPrompt.slice(0, 300));
  check('AI: geen competentiecode (bkc…) in de opdracht aan de AI', !/bkc\d/.test(gezienPrompt));
  check('AI: er is voor de AI geen cursus bijgemaakt', (await lees()).cursussen.filter((c) => c.doelgroep?.groep === 'G-0008').length === 3);
  check('geen paginafouten (competenties)', errs.length === 0, errs);
  console.log('  aanvragen:', state.requests);
  await browser.close();
}

// ── 6. Randgevallen van de competentiekeuze: een deel dat niet laadt, en "Opnieuw proberen" ──────────────
{
  const BK_KEUZE = 'De competenties van een beroepskwalificatie';
  const lees = (pad) => readFileSync(new URL(pad, FIXTURES));
  const openVenster = async (page) => {
    await page.getByRole('button', { name: /Maak een cursus voor deze richting/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({ timeout: 10000 });
    return dlg;
  };

  // 6a. Het deel met de vakjes zelf laadt niet (de verbinding valt weg). Het venster sluiten en heropenen helpt niet, want de
  // browser onthoudt een mislukte import tot de pagina herladen wordt: de melding wijst dus naar de pagina.
  {
    const { browser, page, errs } = await setup(null, () => ({ status: 503 }), { hash: '/#/cursussen/richtingen/G-0008?jaar=3', fixtures: true });
    const afgebroken = { n: 0 };
    await page.route('**/assets/BkKeuze-*.js', (route) => { afgebroken.n++; return route.abort('connectionfailed'); });
    const dlg = await openVenster(page);
    await dlg.getByRole('radio', { name: BK_KEUZE }).check();
    const melding = dlg.getByRole('alert').filter({ hasText: 'De keuze van de competenties kon niet getoond worden' });
    await melding.waitFor({ timeout: 10000 });
    const tekst = await melding.innerText();
    check('deel niet geladen: de melding zegt "laad de pagina opnieuw" en noemt het venster niet', /laad de pagina opnieuw/.test(tekst) && !/venster/i.test(tekst));
    check('deel niet geladen: er is een knop "Pagina herladen" van minstens 44 px', await (async () => {
      const knop = melding.getByRole('button', { name: 'Pagina herladen' });
      const doos = (await knop.count()) === 1 ? await knop.boundingBox() : null;
      return doos !== null && doos.height >= 44;
    })());
    check('deel niet geladen: maken kan niet en er staat geen keuze', (await dlg.getByRole('button', { name: 'Maak de cursus' }).getAttribute('aria-disabled')) === 'true'
      && (await dlg.locator('fieldset.rc-bk-groep').count()) === 0 && afgebroken.n >= 1);
    // De verbinding is terug: de knop laadt de pagina opnieuw, en daarna werkt de keuze.
    await page.unroute('**/assets/BkKeuze-*.js');
    await Promise.all([page.waitForEvent('load'), melding.getByRole('button', { name: 'Pagina herladen' }).click()]);
    await page.getByRole('button', { name: /Maak een cursus voor deze richting/ }).waitFor({ timeout: 10000 });
    const dlg2 = await openVenster(page);
    await dlg2.getByRole('radio', { name: BK_KEUZE }).check();
    await dlg2.getByRole('checkbox', { name: 'Alle 12 competenties' }).waitFor({ timeout: 10000 });
    check('deel niet geladen: na het herladen toont het venster de keuze', (await dlg2.locator('fieldset.rc-bk-groep').count()) === 2);
    check('geen paginafouten (deel niet geladen)', errs.length === 0, errs);
    await browser.close();
  }

  // 6b. Het bestand van de ene beroepskwalificatie mislukt: "Opnieuw proberen" laat wat al geladen was staan, en de focus
  // blijft in het venster.
  {
    const { browser, page, errs } = await setup(null, () => ({ status: 503 }), { hash: '/#/cursussen/richtingen/G-0008?jaar=3', fixtures: true });
    const aanvragen = { recreatief: 0, onthaal: 0 };
    await page.route('**/leerplannen/kwalificaties/bk/BK-0390-2.json', (route) => { aanvragen.onthaal++; return route.fallback(); });
    await page.route('**/leerplannen/kwalificaties/bk/BK-0464-1.json', async (route) => {
      aanvragen.recreatief++;
      if (aanvragen.recreatief === 1) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'kapot' });
      await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill({ status: 200, contentType: 'application/json', body: lees('kwalificaties/uit/bk/BK-0464-1.json') });
    });
    const dlg = await openVenster(page);
    await dlg.getByRole('radio', { name: BK_KEUZE }).check();
    await dlg.getByRole('checkbox', { name: 'Alle 12 competenties' }).waitFor({ timeout: 10000 });
    const opnieuw = dlg.getByRole('button', { name: /Opnieuw proberen/ });
    await opnieuw.waitFor({ timeout: 10000 });
    check('opnieuw proberen: de ene beroepskwalificatie staat er, de andere geeft een fout met knop',
      (await dlg.locator('fieldset.rc-bk-groep').count()) === 1 && (await opnieuw.count()) === 1);
    // Een competentie aanvinken in de beroepskwalificatie die wel laadde
    await dlg.locator('.rc-bk-details > summary').first().click();
    await dlg.locator('.rc-bk-lijst').first().locator('input').nth(2).check();
    // "Opnieuw proberen" met het toetsenbord
    await opnieuw.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const nu = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName, inVenster: !!el?.closest('[role="dialog"]'), isBlok: !!el?.classList.contains('rc-bk-blok') };
    });
    check('opnieuw proberen: de focus valt niet op de pagina maar blijft in het venster, op het blok met de keuze', nu.tag !== 'BODY' && nu.inVenster && nu.isBlok);
    check('opnieuw proberen: tijdens het laden blijft de fieldset van de beroepskwalificatie die laadde staan, met haar uitklapper open en haar vinkje',
      (await dlg.locator('fieldset.rc-bk-groep').count()) === 1
      && await dlg.locator('.rc-bk-details').first().evaluate((e) => e.open)
      && (await dlg.locator('.rc-bk-lijst').first().locator('input:checked').count()) === 1
      && (await dlg.getByText('De beroepskwalificaties worden geladen…').count()) > 0);
    await dlg.locator('fieldset.rc-bk-groep').nth(1).waitFor({ timeout: 10000 });
    const daarna = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName, inVenster: !!el?.closest('[role="dialog"]') };
    });
    check('opnieuw proberen: daarna staan beide beroepskwalificaties er, de keuze bleef bewaard en de focus is nog in het venster',
      (await dlg.locator('.rc-bk-details').first().evaluate((e) => e.open))
      && (await dlg.locator('.rc-bk-lijst').first().locator('input:checked').count()) === 1
      && (await dlg.locator('.rc-teller').innerText()) === 'Je koos 1 competentie uit 1 beroepskwalificatie.'
      && daarna.tag !== 'BODY' && daarna.inVenster);
    check('opnieuw proberen: alleen het mislukte bestand is opnieuw opgehaald', aanvragen.recreatief === 2 && aanvragen.onthaal === 1);
    check('geen paginafouten (opnieuw proberen)', errs.length === 0, errs);
    await browser.close();
  }
}

const mislukt = checks.filter(([, ok]) => !ok);
console.log(mislukt.length ? `\n${mislukt.length} CONTROLE(S) MISLUKT` : '\nALLE CHECKS GESLAAGD ✓');
process.exit(mislukt.length ? 1 : 0);
