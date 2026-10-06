// Rooktest herstelpakket F: de AI-functies bij widgets (AI-studio en AI-paneel in de editor).
//
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &
//   SMOKE_BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node tests/herstel/ai-widgets.mjs
//
// Alles met een nepsleutel en nagebootste AI-antwoorden (page.route): er gaat
// niets naar een echte AI-dienst. Elk scenario lokt een bevestigde fout uit en
// kijkt wat de leerkracht daarvan te zien krijgt. Faalt hard (exit 1) bij een
// mislukte controle of een paginafout.
//
//  AI7   "Vragen bijmaken": geldige invul- en keuzelijstvragen vallen niet weg als "dubbel"
//  AI9   zonder leerplan geen vraag naar doelcodes en geen "…" als code; met leerplan wel
//  AI11  geannuleerde soort of soort zonder bruikbare widget: kaart met "Opnieuw proberen"
//  AI12  puzzelwoorden van meer dan 15 letters worden niet afgekapt maar weggelaten, met melding
//  A11Y18  juist lidwoord in de melding en het label van de titel

import { chromium } from 'playwright-core';

const BASE = (process.env.SMOKE_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}${extra ? ` (${extra})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

// ── Opzet ───────────────────────────────────────────────────────────────────

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

function sse(json) {
  const chunks = [json.slice(0, Math.ceil(json.length / 2)), json.slice(Math.ceil(json.length / 2))];
  return chunks.map((c) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c } }] })}\n\n`).join('')
    + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\ndata: [DONE]\n\n`;
}

/**
 * Vers toestel met een nepsleutel voor Gemini. `antwoord(prompttekst)` geeft het
 * nagebootste AI-antwoord (een object, dat als JSON terugkomt); alle prompts
 * worden bewaard in `prompts`.
 */
async function toestel({ widgets = [], curricula = [], antwoord }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([w, c]) => {
    try {
      if (sessionStorage.getItem('herstel-ai-widgets')) return;
      sessionStorage.setItem('herstel-ai-widgets', '1');
      localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: 'NEP-SLEUTEL-HERSTEL-F', model: 'gemini-3.7-flash' }));
      localStorage.setItem('wf.prefs.v1', JSON.stringify({ theme: 'auto', teacherName: 'T', seeded: true }));
      if (w.length) localStorage.setItem('wf.widgets.v1', JSON.stringify(w));
      if (c.length) localStorage.setItem('wf.curricula.v1', JSON.stringify(c));
    } catch { /* geen opslag: dan blijft het toestel leeg */ }
  }, [widgets, curricula]);
  const prompts = [];
  // Andere AI-diensten bestaan hier niet: nooit een echte oproep.
  await ctx.route(/^https:\/\/(api\.openai\.com|api\.anthropic\.com)\//, (r) => r.abort());
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() || '{}');
    const text = (body.messages || []).map((m) => m.content).join('\n');
    prompts.push(text);
    const json = JSON.stringify(await antwoord(text));
    try {
      await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(json) });
    } catch { /* de pagina brak de aanvraag al af (annuleren) */ }
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, prompts, errs };
}

const soortUitPrompt = (text) => {
  const m = /Maak de volgende widget\(s\): ([a-z, ]+)\./.exec(text);
  return m ? m[1].split(',').map((s) => s.trim())[0] : '';
};

const mcq = (prompt, extra = {}) => ({ type: 'mc', prompt, options: ['juist', 'fout'], correctIndex: 0, ...extra });
const widgetsOpslag = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]'));

async function studio(t, { bron = 'Water verdampt en condenseert.', soorten = [] } = {}) {
  await t.page.goto(BASE + '#/ai-studio', { waitUntil: 'networkidle' });
  await t.page.getByLabel('Bronmateriaal', { exact: true }).fill(bron);
  for (const naam of soorten) await t.page.getByRole('button', { name: naam, exact: true }).click();
}
const genereer = (t) => t.page.getByRole('button', { name: /^Genereer/ }).click();
const wachtOpVoorstellen = (t) => t.page.getByRole('heading', { name: 'Bewaren' }).waitFor({ timeout: 30000 });
const voorstellen = (t) => t.page.locator('input[type=checkbox][aria-label$="bewaren"]').count();
const kaartenOpnieuw = (t) => t.page.getByRole('button', { name: /Opnieuw proberen/ }).count();

async function bewaar(t) {
  await t.page.getByRole('button', { name: /^\d+ widgets? bewaren$/ }).click();
  await t.page.getByText(/Klaar — \d+ widgets? bewaard/).waitFor({ timeout: 10000 });
  return widgetsOpslag(t.page);
}

const QUIZ_WIDGET = {
  id: 'w1', type: 'quiz', title: 'Mijn quiz', folderId: null, code: 'QQQQQQ', createdAt: 1, updatedAt: 1,
  settings: { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: true, instructions: '' },
  config: { layout: 'single', questions: [{ id: 'q0', type: 'mc', prompt: 'Bestaande vraag?', options: ['a', 'b'], correctIndex: 0, points: 1 }] },
};
const KRUISWOORD_WIDGET = {
  ...QUIZ_WIDGET, id: 'w2', type: 'crossword', title: 'Mijn kruiswoord', code: 'CCCCCC',
  config: { entries: [{ id: 'e1', word: 'ZON', clue: 'ster' }, { id: 'e2', word: 'CONDENSATIEWARMTE', clue: 'warmte bij condenseren' }] },
};
const LEERPLAN = {
  id: 'lp1', title: 'Leerplan natuurwetenschappen', net: 'eigen', subject: 'Natuurwetenschappen', level: '1e graad',
  goals: [
    { id: 'g1', code: 'NW 4.1', text: 'De leerling legt verdamping uit.' },
    { id: 'g2', code: 'NW 4.2', text: 'De leerling beschrijft smelten.' },
  ],
  createdAt: 1, updatedAt: 1,
};

// ── AI9: doelcodes ──────────────────────────────────────────────────────────

console.log('AI9. Zonder leerplan: geen vraag naar doelcodes, geen "…" als code');
{
  const t = await toestel({
    antwoord: () => ({
      widgets: [{
        type: 'quiz', title: 'Water',
        config: { questions: [mcq('Wat verdampt er?', { goalCode: '…' }), mcq('Wat condenseert er?', { goalCode: '-' }), mcq('Wat smelt er?')] },
      }],
    }),
  });
  await studio(t);
  await genereer(t);
  await wachtOpVoorstellen(t);
  check('de prompt vraagt niet naar doelcodes', t.prompts.length === 1 && !/goalCode|goalCodes/.test(t.prompts[0]), t.prompts[0]?.slice(0, 120));
  check('de prompt bevat nog wel het vraagschema', /"explanation"/.test(t.prompts[0] ?? ''));
  const opgeslagen = await bewaar(t);
  const vragen = opgeslagen.find((w) => w.type === 'quiz')?.config.questions ?? [];
  check('de drie vragen zijn bewaard', vragen.length === 3, String(vragen.length));
  check('geen enkele vraag draagt "…" of "-" als doelcode', vragen.every((v) => v.goalCode === undefined), JSON.stringify(vragen.map((v) => v.goalCode)));
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

console.log('AI9. Met leerplan: lijst in de prompt, verzonnen of lege codes vallen weg');
{
  const t = await toestel({
    curricula: [LEERPLAN],
    antwoord: () => ({
      widgets: [{
        type: 'quiz', title: 'Water',
        config: { questions: [mcq('Wat verdampt er?', { goalCode: 'nw 4.1' }), mcq('Wat condenseert er?', { goalCode: 'ZZ 9.9' }), mcq('Wat smelt er?', { goalCode: '…' })] },
      }],
    }),
  });
  await studio(t);
  await t.page.locator('#ai-leerplan').selectOption('lp1');
  await t.page.getByRole('button', { name: 'Alles in dit thema' }).click();
  await genereer(t);
  await wachtOpVoorstellen(t);
  check('de prompt bevat de doelenlijst', /- NW 4\.1: De leerling legt verdamping uit\./.test(t.prompts[0] ?? ''));
  check('de prompt vraagt wel naar "goalCode"', /"goalCode" \(UITSLUITEND/.test(t.prompts[0] ?? ''));
  const opgeslagen = await bewaar(t);
  const codes = (opgeslagen.find((w) => w.type === 'quiz')?.config.questions ?? []).map((v) => v.goalCode);
  check('alleen de code uit het leerplan blijft', JSON.stringify(codes) === JSON.stringify(['NW 4.1', undefined, undefined]), JSON.stringify(codes));
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

// ── AI7: vragen bijmaken ────────────────────────────────────────────────────

async function openBijmaken(t, widgetId) {
  await t.page.goto(BASE + `#/bewerk/${widgetId}`, { waitUntil: 'networkidle' });
  await t.page.getByRole('button', { name: /AI-assistent/ }).click();
}

console.log('AI7. Vragen bijmaken: geldige vragen met de standaardopdracht vallen niet weg');
{
  const dd = (text) => ({ type: 'dropdown', prompt: 'Kies telkens het juiste antwoord.', text, points: 1 });
  const nieuw = [
    dd('De hoofdstad van Frankrijk is {Parijs|Lyon|Marseille}.'),
    dd('De hoofdstad van Spanje is {Madrid|Barcelona|Sevilla}.'),
    dd('De hoofdstad van Italië is {Rome|Milaan|Napels}.'),
    { type: 'gap', text: 'Water kookt bij [100] graden.' },
    { type: 'gap', text: 'Water bevriest bij [0] graden.' },
    mcq('Nieuwe mc?', { correctIndex: 1 }),
  ];
  const t = await toestel({ widgets: [QUIZ_WIDGET], antwoord: () => ({ questions: nieuw }) });
  await openBijmaken(t, 'w1');
  await t.page.getByRole('button', { name: /Vragen bijmaken/ }).click();
  await t.page.getByRole('dialog').locator('input[type=number]').fill('6');
  await t.page.getByRole('button', { name: /Voorstel maken/ }).click();
  await t.page.getByText(/^Voorstel:/).waitFor({ timeout: 15000 });
  const kop = await t.page.getByText(/^Voorstel:/).innerText();
  check('alle zes de vragen komen terug als voorstel', /\+6 vragen/.test(kop), kop);
  check('geen melding over weggelaten vragen', (await t.page.getByText(/weggelaten/).count()) === 0);
  check('de prompt vraagt niet naar doelcodes', !/goalCode/.test(t.prompts[0] ?? ''));
  await t.page.getByRole('button', { name: /Toepassen/ }).click();
  const toegepast = await t.page.getByText(/Toegepast: \+6 vragen/).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('na "Toepassen" meldt de toast +6 vragen', toegepast);
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

console.log('AI7. Vragen bijmaken: echte dubbels vallen wel weg, met een melding');
{
  const nieuw = [
    mcq('Bestaande vraag?'), // staat al in de widget
    mcq('Nieuwe vraag A?'),
    mcq('  nieuwe VRAAG a? '), // dezelfde, anders geschreven
    mcq('Nieuwe vraag B?'),
  ];
  const t = await toestel({ widgets: [QUIZ_WIDGET], antwoord: () => ({ questions: nieuw }) });
  await openBijmaken(t, 'w1');
  await t.page.getByRole('button', { name: /Vragen bijmaken/ }).click();
  await t.page.getByRole('button', { name: /Voorstel maken/ }).click();
  await t.page.getByText(/^Voorstel:/).waitFor({ timeout: 15000 });
  const kop = await t.page.getByText(/^Voorstel:/).innerText();
  check('twee nieuwe vragen blijven over', /\+2 vragen/.test(kop), kop);
  check('de melding noemt de twee weggelaten vragen', (await t.page.getByText(/2 vragen stonden al in deze widget of kwamen dubbel voor en zijn weggelaten/).count()) === 1);
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

// ── AI12: lange puzzelwoorden ───────────────────────────────────────────────

console.log('AI12. AI-studio: een woord van meer dan 15 letters wordt weggelaten, niet afgekapt');
{
  const t = await toestel({
    antwoord: (text) => soortUitPrompt(text) === 'wordsearch'
      ? { widgets: [{ type: 'wordsearch', title: 'Zoeker', config: { words: ['verdampingswarmte', 'smeltpunt', 'kookpunt', 'vriespunt'] } }] }
      : { widgets: [{ type: 'crossword', title: 'Kruiswoord', config: { entries: [
        { word: 'bevolkingsdichtheid', clue: 'inwoners per km²' },
        { word: 'zon', clue: 'ster' },
        { word: 'maan', clue: 'satelliet' },
        { word: 'ster', clue: 'lichtpunt' },
      ] } }] },
  });
  await studio(t, { soorten: ['Quiz', 'Kruiswoordraadsel', 'Woordzoeker'] });
  await genereer(t);
  await wachtOpVoorstellen(t);
  check('de prompt zegt hoogstens 15 letters', (t.prompts[0] ?? '').includes('hoogstens 15 letters'));
  const tekst = await t.page.locator('main').innerText();
  check('het afgekapte woord "bevolkingsdicht" staat nergens', !/bevolkingsdicht/i.test(tekst.replace(/bevolkingsdichtheid/gi, '')));
  check('de melding noemt het weggelaten woord', /bevolkingsdichtheid/i.test(tekst) && /langer dan 15 letters/.test(tekst));
  check('de melding noemt "verdampingswarmte"', /verdampingswarmte/i.test(tekst));
  const opgeslagen = await bewaar(t);
  const kruis = opgeslagen.find((w) => w.type === 'crossword')?.config.entries.map((e) => e.word);
  const zoek = opgeslagen.find((w) => w.type === 'wordsearch')?.config.words;
  check('bewaard kruiswoord heeft de drie korte woorden, heel', JSON.stringify(kruis) === JSON.stringify(['zon', 'maan', 'ster']), JSON.stringify(kruis));
  check('bewaarde woordzoeker heeft de drie korte woorden', JSON.stringify(zoek) === JSON.stringify(['smeltpunt', 'kookpunt', 'vriespunt']), JSON.stringify(zoek));
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

console.log('AI12. Editor: items bijmaken meldt enkel het nieuwe lange woord, niet het bestaande');
{
  const t = await toestel({
    widgets: [KRUISWOORD_WIDGET],
    antwoord: () => ({ widgets: [{ type: 'crossword', title: 'K', config: { entries: [
      { word: 'maan', clue: 'satelliet' },
      { word: 'bevolkingsdichtheid', clue: 'inwoners per km²' },
    ] } }] }),
  });
  await openBijmaken(t, 'w2');
  await t.page.getByRole('button', { name: /Items bijmaken/ }).click();
  await t.page.getByRole('button', { name: /Voorstel maken/ }).click();
  await t.page.getByText(/^Voorstel:/).waitFor({ timeout: 15000 });
  const dialoog = await t.page.getByRole('dialog').innerText();
  check('voorstel: één nieuw woord', /\+1 woord/.test(dialoog), dialoog.slice(0, 200));
  check('het lange woord staat er nergens afgekapt in', !/bevolkingsdicht/i.test(dialoog.replace(/bevolkingsdichtheid/gi, '')));
  check('de melding noemt het nieuwe lange woord', /bevolkingsdichtheid/i.test(dialoog) && /langer dan 15 letters/.test(dialoog));
  check('de melding noemt het bestaande lange woord van de leerkracht niet', !/condensatiewarmte/i.test(dialoog));
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

// ── AI11: soorten die hersteld moeten kunnen worden ─────────────────────────

const PAYLOAD = {
  quiz: { type: 'quiz', title: 'Mock quiz', config: { questions: [mcq('2+2?', { options: ['drie', 'vier'], correctIndex: 1 })] } },
  flashcards: { type: 'flashcards', title: 'Mock kaarten', config: { cards: [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }] } },
  pairs: { type: 'pairs', title: 'Mock koppel', config: { pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }] } },
};

console.log('AI11. Annuleren vóór er iets klaar is: kaarten met "Opnieuw proberen", geen lege voorvertoning');
{
  let snel = false;
  const t = await toestel({
    antwoord: async (text) => {
      if (!snel) await sleep(4000);
      return { widgets: [PAYLOAD[soortUitPrompt(text)]].filter(Boolean) };
    },
  });
  await studio(t, { soorten: ['Flitskaarten', 'Koppelspel'] });
  await genereer(t);
  await sleep(700);
  await t.page.getByRole('button', { name: 'Annuleren' }).click();
  await t.page.getByRole('button', { name: /^Genereer/ }).waitFor({ timeout: 5000 });
  await sleep(600);
  check('terug bij de invoer, met de Genereer-knop', (await t.page.getByRole('button', { name: /^Genereer/ }).count()) === 1);
  await t.page.getByRole('button', { name: /Terug naar de voorstellen/ }).click();
  await sleep(300);
  check('drie kaarten met "Opnieuw proberen" (quiz, flitskaarten, koppelspel)', (await kaartenOpnieuw(t)) === 3, String(await kaartenOpnieuw(t)));
  check('elke kaart zegt "Geannuleerd."', (await t.page.getByText('Geannuleerd.', { exact: true }).count()) === 3);
  check('geen widgets in de voorvertoning', (await voorstellen(t)) === 0);
  snel = true;
  if ((await kaartenOpnieuw(t)) > 0) {
    await t.page.getByRole('button', { name: /Opnieuw proberen/ }).first().click();
    await t.page.waitForFunction(() => document.querySelectorAll('input[type=checkbox][aria-label$="bewaren"]').length === 1, null, { timeout: 10000 });
    check('na opnieuw proberen staat de quiz erbij', (await voorstellen(t)) === 1, String(await voorstellen(t)));
    check('de kaart van de quiz is weg, de andere twee blijven', (await kaartenOpnieuw(t)) === 2, String(await kaartenOpnieuw(t)));
  } else {
    check('er is een kaart om opnieuw te proberen', false);
  }
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

console.log('AI11. Soort waarvan alles weggesaneerd wordt: niet "klaar", maar een herstelkaart');
{
  let goed = false;
  const t = await toestel({
    antwoord: () => goed
      ? { widgets: [PAYLOAD.flashcards] }
      : { widgets: [{ type: 'flashcards', title: 'Leeg', config: { cards: [{ front: 'a' }] } }] }, // kaarten zonder achterkant
  });
  await studio(t, { soorten: ['Quiz', 'Flitskaarten'] });
  await genereer(t);
  await wachtOpVoorstellen(t);
  check('één kaart met "Opnieuw proberen"', (await kaartenOpnieuw(t)) === 1);
  check('de kaart zegt "Niets bruikbaars opgeleverd."', (await t.page.getByText('Niets bruikbaars opgeleverd.', { exact: true }).count()) === 1);
  check('de eigen waarschuwing blijft ook zichtbaar', (await t.page.getByText(/was onvolledig en is overgeslagen/).count()) === 1);
  check('nog geen widgets om te bewaren', (await voorstellen(t)) === 0);
  goed = true;
  if ((await kaartenOpnieuw(t)) > 0) {
    await t.page.getByRole('button', { name: /Opnieuw proberen/ }).click();
    await t.page.waitForFunction(() => document.querySelectorAll('input[type=checkbox][aria-label$="bewaren"]').length === 1, null, { timeout: 10000 });
    check('na opnieuw proberen staan de flitskaarten erbij', (await voorstellen(t)) === 1);
    check('de herstelkaart is weg', (await kaartenOpnieuw(t)) === 0);
  } else {
    check('er is een kaart om opnieuw te proberen', false);
  }
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

// ── A11Y18: lidwoord ────────────────────────────────────────────────────────

console.log('A11Y18. Juist lidwoord bij het galgje en het werkblad');
{
  const t = await toestel({
    antwoord: (text) => soortUitPrompt(text) === 'worksheet'
      ? { widgets: [{ type: 'worksheet', title: 'Leeg werkblad', config: { questions: [] } }] }
      : { widgets: [{ type: 'hangman', title: 'Mijn galgje', config: { words: [{ word: 'verdamping', hint: 'water wordt damp' }] } }] },
  });
  await studio(t, { soorten: ['Quiz', 'Galgje', 'Werkblad'] });
  await genereer(t);
  await wachtOpVoorstellen(t);
  const tekst = await t.page.locator('main').innerText();
  check('de melding noemt “Werkblad” zonder lidwoord', tekst.includes('De inhoud van “Werkblad” was onvolledig en is overgeslagen.'));
  check('nergens "van de werkblad" of "van de galgje"', !/van de (werkblad|galgje)/i.test(tekst));
  check('het titelveld heet "Titel (Galgje)"', (await t.page.getByLabel('Titel (Galgje)').count()) === 1);
  check('geen label "Titel van de galgje"', (await t.page.getByLabel(/Titel van de galgje/i).count()) === 0);
  check('geen paginafouten', t.errs.length === 0, t.errs.join('; '));
  await t.ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CONTROLE(S) MISLUKT` : '\nALLE AI-WIDGET CHECKS GESLAAGD ✓');
process.exit(failures ? 1 : 0);
