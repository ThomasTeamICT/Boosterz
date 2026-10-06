// AI-instellingen: instel-link en verbindingstest, met nagebootst netwerk.
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/ai/instel-link.mjs
//
// Controleert de herstellingen uit de debugronde van oktober 2026:
// - een instel-link vervangt nooit stil een bewaarde sleutel, ook niet met
//   &auto=1 of via een link in een gedeelde cursus;
// - een link naar een eigen aanbieder op een http-adres wordt geweigerd, en
//   de sleutel gaat daarna nog altijd naar de eigen aanbieder;
// - op een toestel zonder sleutel bewaart een gewone instel-link nog altijd
//   automatisch (de testgroep-flow blijft werken);
// - een eigen aanbieder zonder geldig adres, een sleutel met een onzichtbaar
//   teken: een duidelijke fout en géén netwerkaanvraag;
// - "Test de verbinding" meldt geen succes bij een leeg of foutief antwoord;
// - een volle opslag geeft een melding, geen renderfout;
// - een bewaard model buiten de lijst blijft zichtbaar en wordt gebruikt;
// - de keuzelijsten passen op 390 pixels breed.
// Er gaat niets naar het internet: elke aanvraag buiten localhost wordt
// nagebootst of afgebroken. Er is geen echte sleutel nodig.
import pw from 'playwright-core';
import LZString from 'lz-string';

const { chromium } = pw;
const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/+$/, '');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const MIJN_SLEUTEL = 'sk-ant-ECHTE-NEP-SLEUTEL-VAN-LEERKRACHT';
const MIJN = { provider: 'anthropic', apiKey: MIJN_SLEUTEL, model: 'claude-sonnet-5' };

const enc = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const setupLink = (o, auto = true) => `${BASE}/#/ai-instellingen?setup=${enc(o)}${auto ? '&auto=1' : ''}`;

const checks = [];
const check = (naam, ok, detail = '') => {
  checks.push([naam, Boolean(ok)]);
  console.log(`${ok ? '✓' : '✗'} ${naam}${!ok && detail ? ` — ${String(detail).slice(0, 300)}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

/**
 * Eén vers toestel. `seed` komt één keer in wf.ai.v1 (null = geen sleutel);
 * `respond(url, req)` bootst een AI-aanbieder na (undefined = afbreken).
 */
async function toestel({ seed = MIJN, respond, viewport = { width: 1000, height: 900 }, init } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('geseed')) return;
    sessionStorage.setItem('geseed', '1');
    if (s) localStorage.setItem('wf.ai.v1', JSON.stringify(s));
  }, seed);
  if (init) await ctx.addInitScript(init);
  const verzoeken = [];
  await ctx.route(/^https?:\/\/(?!localhost[:/])/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    // Lettertypes en andere GET's: gewoon afbreken. AI-aanvragen zijn POST's.
    if (req.method() !== 'POST') return route.abort();
    const url = req.url();
    verzoeken.push({ url, auth: req.headers()['authorization'] || req.headers()['x-api-key'] || '', body: req.postData() || '' });
    const r = respond?.(url, req);
    if (!r) return route.abort();
    return route.fulfill({ ...r, headers: { ...CORS, ...(r.headers || {}) } });
  });
  // Ook een relatieve url (sleutel naar de eigen origin) moet opvallen.
  await ctx.route(/^http:\/\/localhost:\d+\/.*chat\/completions/, (route) => {
    verzoeken.push({ url: route.request().url(), auth: route.request().headers()['authorization'] || '', body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(e.message));
  return { ctx, page, verzoeken, fouten };
}

const opslag = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wf.ai.v1') || 'null'));
const lichaam = (page) => page.locator('main').innerText();
const testKnop = (page) => page.getByRole('button', { name: /Test de verbinding/ });
const naarAanvaller = (v) => v.filter((x) => x.url.includes('aanvaller.example'));

// ── 1. Bestaande sleutel + link naar een https-aanvaller (auto=1) ───────────
{
  const { ctx, page, verzoeken, fouten } = await toestel();
  await page.goto(setupLink({ provider: 'custom', apiKey: 'aanvaller-sleutel', model: 'x', baseUrl: 'https://aanvaller.example' }), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tekst = await lichaam(page);
  check('1. https-aanvaller met auto=1: bewaarde sleutel blijft ongewijzigd', JSON.stringify(await opslag(page)) === JSON.stringify(MIJN), JSON.stringify(await opslag(page)));
  check('1. de melding noemt de gemaskeerde sleutel die vervangen zou worden', tekst.includes('Deze link vervangt je huidige sleutel (sk-…ACHT).'), tekst.slice(0, 600));
  check('1. de melding toont aanbieder en adres', /Aanbieder: Eigen aanbieder \(OpenAI-compatibel\), adres: aanvaller\.example\. Bewaar alleen als je de afzender vertrouwt/.test(tekst), tekst.slice(0, 600));
  check('1. geen toast "automatisch bewaard"', !(await page.locator('.toast').allInnerTexts()).some((t) => /automatisch bewaard/.test(t)));
  check('1. de sleutel staat niet meer in de adresbalk', !page.url().includes('setup='), page.url());
  check('1. niets verstuurd naar de aanvaller', naarAanvaller(verzoeken).length === 0, JSON.stringify(verzoeken));
  check('1. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 2. Bestaande sleutel + link naar een http-aanvaller: geweigerd ──────────
{
  const { ctx, page, verzoeken, fouten } = await toestel({
    respond: (url) => (url.startsWith('https://api.anthropic.com/') ? { status: 401, contentType: 'application/json', body: '{}' } : undefined),
  });
  await page.goto(setupLink({ provider: 'custom', apiKey: 'aanvaller-sleutel', model: 'x', baseUrl: 'http://aanvaller.example' }), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const alert = await page.getByRole('alert').allInnerTexts();
  check('2. http-aanvaller: de link wordt geweigerd met een duidelijke melding', alert.some((t) => /Instel-link geweigerd\..*eigen aanbieder instellen zonder geldig adres/s.test(t)), JSON.stringify(alert));
  check('2. bewaarde instellingen blijven ongewijzigd', JSON.stringify(await opslag(page)) === JSON.stringify(MIJN));
  check('2. het formulier toont nog de eigen aanbieder', (await page.getByLabel('Aanbieder').inputValue()) === 'anthropic');
  await testKnop(page).click();
  await page.waitForTimeout(1200);
  check('2. daarna gaat de sleutel naar Anthropic, niet naar de aanvaller', naarAanvaller(verzoeken).length === 0 && verzoeken.some((v) => v.url.startsWith('https://api.anthropic.com/') && v.auth === MIJN_SLEUTEL), JSON.stringify(verzoeken.map((v) => v.url)));
  check('2. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 3. Bestaande sleutel + link met een andere Anthropic-sleutel ────────────
{
  const { ctx, page, fouten } = await toestel();
  await page.goto(setupLink({ provider: 'anthropic', apiKey: 'sk-ant-sleutel-van-iemand-anders-1234', model: 'claude-opus-5' }), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tekst = await lichaam(page);
  check('3. andere sleutel bij dezelfde aanbieder: niet stil bewaard', JSON.stringify(await opslag(page)) === JSON.stringify(MIJN));
  check('3. wel ingevuld, met waarschuwing en adres api.anthropic.com', (await page.getByLabel('API-sleutel', { exact: true }).inputValue()) === 'sk-ant-sleutel-van-iemand-anders-1234'
    && tekst.includes('Deze link vervangt je huidige sleutel (sk-…ACHT).') && tekst.includes('adres: api.anthropic.com'), tekst.slice(0, 600));
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await page.waitForTimeout(300);
  check('3. pas na een bewuste klik op Bewaren staat de nieuwe sleutel er', (await opslag(page))?.apiKey === 'sk-ant-sleutel-van-iemand-anders-1234');
  check('3. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 4. Dezelfde aanval via een link in een gedeelde cursus (één klik) ───────
{
  const { ctx, page, verzoeken, fouten } = await toestel({
    respond: (url) => (url.includes('aanvaller.example')
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) }
      : url.startsWith('https://api.anthropic.com/') ? { status: 401, contentType: 'application/json', body: '{}' } : undefined),
  });
  const b64 = enc({ provider: 'custom', apiKey: 'aanvaller-sleutel', model: 'x', baseUrl: 'https://aanvaller.example' });
  const cursus = {
    id: 'c_aanval', title: 'Cursus', author: '', coverEmoji: 'x', code: 'ATK123',
    chapters: [{ id: 'ch1', title: 'H1', sections: [{ id: 's1', title: 'S1', blocks: [{ id: 'b1', type: 'text', markdown: `Lees eerst [de uitleg](#/ai-instellingen?setup=${b64}&auto=1).` }] }] }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true }, createdAt: 1, updatedAt: 1,
  };
  await page.goto(`${BASE}/#/cursus/open?d=${LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, kind: 'cursus', c: cursus, w: [] }))}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const link = page.getByRole('link', { name: 'de uitleg' });
  const gevonden = (await link.count()) > 0;
  if (gevonden) {
    await link.first().click();
    await page.waitForTimeout(1200);
  }
  check('4. cursuslink gevonden en geopend', gevonden && page.url().includes('ai-instellingen'), page.url());
  check('4. cursuslink: bewaarde sleutel blijft ongewijzigd', JSON.stringify(await opslag(page)) === JSON.stringify(MIJN), JSON.stringify(await opslag(page)));
  check('4. cursuslink: de waarschuwing staat in beeld', (await lichaam(page)).includes('Deze link vervangt je huidige sleutel (sk-…ACHT).'));
  // Zoals in het bewijs van de rechter: de leerkracht doet later gewoon een AI-actie.
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  // Wachten tot de instellingenpagina echt weg is (anders houdt React haar state vast).
  await page.getByLabel('API-sleutel', { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
  await page.goto(`${BASE}/#/ai-instellingen`, { waitUntil: 'networkidle' });
  await testKnop(page).click();
  await page.waitForTimeout(1200);
  check('4. cursuslink: later gaat de sleutel naar Anthropic, niets naar de aanvaller', naarAanvaller(verzoeken).length === 0
    && verzoeken.some((v) => v.url.startsWith('https://api.anthropic.com/') && v.auth === MIJN_SLEUTEL), JSON.stringify(verzoeken.map((v) => v.url)));
  check('4. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 5. Leeg toestel + gewone instel-link: bewaart nog altijd automatisch ────
{
  const { ctx, page, fouten } = await toestel({ seed: null });
  const link = { provider: 'gemini', apiKey: 'AIza-testgroep-sleutel-1234', model: 'gemini-3.7-flash' };
  await page.goto(setupLink(link), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tekst = await lichaam(page);
  check('5. leeg toestel: de testgroep-link bewaart automatisch', JSON.stringify(await opslag(page)) === JSON.stringify(link), JSON.stringify(await opslag(page)));
  check('5. de melding "Klaar!" noemt aanbieder, adres en gemaskeerde sleutel', /Klaar!.*aanbieder: Google \(Gemini\), adres: generativelanguage\.googleapis\.com, sleutel AIz…1234/s.test(tekst), tekst.slice(0, 600));
  check('5. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 6. Leeg toestel + eigen aanbieder (https): nooit automatisch ────────────
{
  const { ctx, page, fouten } = await toestel({ seed: null });
  await page.goto(setupLink({ provider: 'custom', apiKey: 'sk-or-v1-testgroep', model: 'meta/llama', baseUrl: 'https://openrouter.ai/api' }), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tekst = await lichaam(page);
  check('6. eigen aanbieder op een leeg toestel: niet bewaard, wel ingevuld', (await opslag(page)) === null
    && (await page.getByLabel('Basisadres (OpenAI-compatibel)').inputValue()) === 'https://openrouter.ai/api', JSON.stringify(await opslag(page)));
  check('6. de melding toont het adres openrouter.ai', /Alles staat al ingevuld\. Aanbieder: Eigen aanbieder \(OpenAI-compatibel\), adres: openrouter\.ai\./.test(tekst), tekst.slice(0, 600));
  check('6. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 7. Kapotte links ────────────────────────────────────────────────────────
{
  const { ctx, page, fouten } = await toestel();
  for (const [naam, url] of [
    ['rommel', `${BASE}/#/ai-instellingen?setup=%%%rommel&auto=1`],
    ['aanbieder "toString"', setupLink({ provider: 'toString', apiKey: 'sk-1234567890' })],
    ['onzichtbaar teken in de sleutel', setupLink({ provider: 'anthropic', apiKey: 'sk-ant-123​4567', model: 'claude-sonnet-5' })],
  ]) {
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const alert = await page.getByRole('alert').allInnerTexts();
    check(`7. ${naam}: geweigerd, instellingen ongewijzigd`, alert.some((t) => t.includes('Instel-link geweigerd.')) && JSON.stringify(await opslag(page)) === JSON.stringify(MIJN), JSON.stringify(alert));
  }
  check('7. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 8. Eigen aanbieder zonder (geldig) adres en een kapotte sleutel ─────────
for (const [naam, seed] of [
  ['leeg adres', { provider: 'custom', apiKey: 'sk-or-v1-GEHEIM1234', model: 'm' }],
  ['adres zonder schema', { provider: 'custom', apiKey: 'sk-or-v1-GEHEIM1234', model: 'm', baseUrl: 'openrouter.ai/api' }],
  ['sleutel met U+200B', { provider: 'anthropic', apiKey: 'sk-ant-api03-abcdef​', model: 'claude-sonnet-5' }],
  ['sleutel met U+2013', { provider: 'anthropic', apiKey: 'sk-ant-api03–abcdef', model: 'claude-sonnet-5' }],
]) {
  const { ctx, page, verzoeken, fouten } = await toestel({ seed, respond: () => ({ status: 401, body: '{}' }) });
  await page.goto(`${BASE}/#/ai-instellingen`, { waitUntil: 'networkidle' });
  await testKnop(page).click();
  await page.waitForTimeout(800);
  const alert = (await page.getByRole('alert').allInnerTexts()).join(' ');
  const verwacht = naam.startsWith('sleutel') ? /onzichtbaar of ongeldig teken\. Plak hem opnieuw\./ : naam === 'leeg adres' ? /basisadres van je eigen aanbieder in/ : /moet met https:\/\/ beginnen/;
  check(`8. ${naam}: duidelijke fout, geen netwerkaanvraag`, verwacht.test(alert) && verzoeken.length === 0 && !(await page.getByText(/Verbinding werkt/).count()), `${alert} | ${JSON.stringify(verzoeken.map((v) => v.url))}`);
  check(`8. ${naam}: geen paginafouten`, fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 9. Verbindingstest met een leeg of foutief antwoord (status 200) ────────
const EIGEN = { provider: 'custom', apiKey: 'sk-test', model: 'm', baseUrl: 'https://llm.example.test' };
for (const [naam, antwoord, verwacht] of [
  ['JSON zonder stroom', { status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }) }, 'ok'],
  ['fout-gebeurtenis in de stroom', { status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } })}\n\n` }, /De AI-dienst meldde een fout: Insufficient credits/],
  ['finish_reason error', { status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: 'error' }] })}\n\ndata: [DONE]\n\n` }, /meldde een fout/],
  ['lege stroom', { status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' }, /De AI-dienst gaf een leeg antwoord\./],
]) {
  const { ctx, page, fouten } = await toestel({ seed: EIGEN, respond: (url) => (url.startsWith('https://llm.example.test/') ? antwoord : undefined) });
  await page.goto(`${BASE}/#/ai-instellingen`, { waitUntil: 'networkidle' });
  await testKnop(page).click();
  await page.waitForTimeout(1000);
  const succes = await page.getByText(/Verbinding werkt/).count();
  const alert = (await page.getByRole('alert').allInnerTexts()).join(' ');
  check(`9. ${naam}: ${verwacht === 'ok' ? 'succes' : 'fout, geen vals succes'}`, verwacht === 'ok' ? succes === 1 && !alert : succes === 0 && verwacht.test(alert), `succes=${succes} alert=${alert}`);
  check(`9. ${naam}: geen paginafouten`, fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 10. Volle opslag: melding in plaats van een renderfout ──────────────────
{
  const { ctx, page, verzoeken, fouten } = await toestel({
    seed: null,
    init: () => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'wf.ai.v1') throw new DOMException('vol', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    },
  });
  await page.goto(`${BASE}/#/ai-instellingen`, { waitUntil: 'networkidle' });
  await page.getByLabel('API-sleutel', { exact: true }).fill('sk-ant-test-123456789');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await page.waitForTimeout(400);
  const toasts = await page.locator('.toast-err').allInnerTexts();
  check('10. Bewaren met volle opslag: foutmelding', toasts.some((t) => /Bewaren lukte niet/.test(t)), JSON.stringify(toasts));
  await testKnop(page).click();
  await page.waitForTimeout(400);
  check('10. Test met volle opslag: geen aanvraag met oude instellingen', verzoeken.length === 0, JSON.stringify(verzoeken.map((v) => v.url)));
  // De pagina staat al open: de link moet ook dan verwerkt worden.
  await page.goto(setupLink({ provider: 'gemini', apiKey: 'AIza-testgroep-sleutel-1234', model: 'gemini-3.7-flash' }), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('10. instel-link met volle opslag: foutmelding, wel ingevuld', (await page.locator('.toast-err').allInnerTexts()).some((t) => /Bewaren lukte niet/.test(t))
    && (await page.getByLabel('API-sleutel', { exact: true }).inputValue()) === 'AIza-testgroep-sleutel-1234');
  check('10. link geopend op de al open pagina: sleutel weg uit de adresbalk', !page.url().includes('setup='), page.url());
  check('10. de pagina staat nog (één h1) en geen paginafouten', (await page.locator('h1').count()) === 1 && fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

// ── 11. Model buiten de lijst, aanbiederwissel en 390 pixels ────────────────
{
  const verzonden = [];
  const { ctx, page, verzoeken, fouten } = await toestel({
    seed: { provider: 'anthropic', apiKey: MIJN_SLEUTEL, model: 'claude-haiku-4-5-20251001' },
    viewport: { width: 390, height: 844 },
    // Eén logregel met een sleutellabel, zodat ook de tabel "Per sleutel" (met kop) verschijnt.
    init: () => {
      if (sessionStorage.getItem('log-geseed')) return;
      sessionStorage.setItem('log-geseed', '1');
      localStorage.setItem('wf.aiusage.v1', JSON.stringify([{ at: 1, task: 'verbindingstest', model: 'claude-sonnet-5', inputTokens: 5, outputTokens: 1, keyLabel: 'sk-…ACHT' }]));
    },
    respond: (url, req) => {
      if (url.startsWith('https://api.anthropic.com/')) verzonden.push(JSON.parse(req.postData() || '{}').model);
      return { status: 401, body: '{}' };
    },
  });
  await page.goto(`${BASE}/#/ai-instellingen`, { waitUntil: 'networkidle' });
  const model = page.getByLabel('Model');
  const getoond = await model.evaluate((el) => el.options[el.selectedIndex]?.text);
  check('11. bewaard model buiten de lijst wordt getoond als zodanig', getoond === 'claude-haiku-4-5-20251001 (niet meer in de lijst)', getoond);
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await testKnop(page).click();
  await page.waitForTimeout(800);
  check('11. wat getoond wordt, is ook wat gebruikt wordt', (await opslag(page)).model === 'claude-haiku-4-5-20251001' && verzonden[0] === 'claude-haiku-4-5-20251001', JSON.stringify(verzonden));

  const koppen = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter((h) => h.closest('main')).map((h) => `${h.tagName.toLowerCase()} ${h.textContent.trim()}`));
  const niveaus = koppen.map((k) => Number(k[1]));
  check('11. koppen: één h1 vooraan, geen sprong in niveau (axe heading-order)', niveaus[0] === 1 && niveaus.filter((n) => n === 1).length === 1
    && niveaus.every((n, i) => i === 0 || n <= niveaus[i - 1] + 1) && koppen.some((k) => k === 'h3 Per sleutel (op dit toestel)'), JSON.stringify(koppen));

  const klassen = await page.evaluate(() => [...document.querySelectorAll('main select')].map((s) => s.className));
  check('11. de keuzelijsten Aanbieder en Model hebben de klasse select', klassen.length >= 2 && klassen.every((k) => k.split(/\s+/).includes('select')), JSON.stringify(klassen));
  const breedte = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    selects: [...document.querySelectorAll('main select')].map((s) => Math.round(s.getBoundingClientRect().right)),
  }));
  check('11. op 390 pixels: geen horizontaal scrollen, keuzelijsten binnen beeld', breedte.pagina <= 390 && breedte.selects.every((r) => r <= 390), JSON.stringify(breedte));

  await page.getByLabel('Aanbieder').selectOption('openai');
  const naWissel = await page.getByLabel('API-sleutel', { exact: true }).inputValue();
  await page.getByLabel('Aanbieder').selectOption('anthropic');
  const terug = await page.getByLabel('API-sleutel', { exact: true }).inputValue();
  check('11. wisselen van aanbieder neemt de sleutel niet mee; terug haalt de bewaarde sleutel', naWissel === '' && terug === MIJN_SLEUTEL, `${naWissel} / ${terug}`);
  check('11. geen aanvragen buiten Anthropic', verzoeken.every((v) => v.url.startsWith('https://api.anthropic.com/')), JSON.stringify(verzoeken.map((v) => v.url)));
  check('11. geen paginafouten', fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}

await browser.close();
const mislukt = checks.filter(([, ok]) => !ok);
console.log(mislukt.length ? `\n${mislukt.length} CONTROLE(S) MISLUKT` : `\nALLE ${checks.length} CHECKS GESLAAGD ✓`);
process.exit(mislukt.length ? 1 : 0);
