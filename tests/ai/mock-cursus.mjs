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
// - "sectie vullen" voegt altijd achteraan toe en laat media van de AI weg.
import pw from 'playwright-core';
const { chromium } = pw;
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const CORS = { 'access-control-allow-origin': '*' };

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

/** Verse browser met één cursus en een nagebootste Gemini. `answer(prompt)` geeft {status, body} of een JSON-object. */
async function setup(course, answer) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript((c) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: 'test-sleutel', model: 'gemini-3.7-flash' }));
    localStorage.setItem('wf.courses.v1', JSON.stringify([c]));
    localStorage.setItem('wf.prefs.v1', JSON.stringify({ theme: 'auto', teacherName: 'T', seeded: true }));
  }, course);
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
  await page.goto(BASE + '/#/cursus/bewerk/c1', { waitUntil: 'networkidle' });
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

const mislukt = checks.filter(([, ok]) => !ok);
console.log(mislukt.length ? `\n${mislukt.length} CONTROLE(S) MISLUKT` : '\nALLE CHECKS GESLAAGD ✓');
process.exit(mislukt.length ? 1 : 0);
