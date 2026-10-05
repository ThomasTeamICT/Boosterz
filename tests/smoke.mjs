// Volledige rooktest voor Boosterz: draait tegen een preview-build.
//
//   npm run build && npx vite preview --port 4173 &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
//
// Vers browserprofiel per run (seed vult voorbeeldinhoud automatisch).
// Faalt hard (exit 1) bij een mislukte check of bij console-/paginafouten.

import { chromium } from 'playwright-core';
import zlib from 'node:zlib';
import LZString from 'lz-string';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
let failures = 0;

function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ FAIL: ${name}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // De testomgeving onderschept TLS (eigen proxy-CA die deze Chromium niet kent):
  // Google Fonts laadt hier niet en valt terug op de systeemletter. Dat is geen
  // fout van de app — in productie laadt het gewoon.
  if (/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
  errors.push(`console: ${m.text()}`);
});

const go = async (hash) => { await page.goto(BASE + hash, { waitUntil: 'networkidle' }); await sleep(500); };

// ── 1. Startpagina (eerste bezoek) ──────────────────────────────────────────
console.log('1. Startpagina');
await go('/#/');
check('startpagina heeft één h1', (await page.locator('main h1').count()) === 1);
check('eerste bezoek: uitleg "hoe het in elkaar zit"', await page.locator('text=Hoe het in elkaar zit').first().isVisible());
check('38 widgetsoorten op de startpagina', (await page.locator('.start-type-chip').count()) === 38);
check('aparte ingang voor leerlingen', (await page.locator('a[href="#/meedoen"]').count()) >= 1);

// ── 2. Dashboard ────────────────────────────────────────────────────────────
console.log('2. Dashboard');
await go('/#/widgets');
const cardCount = await page.locator('.widget-card').count();
check(`seed-widgets aanwezig (${cardCount})`, cardCount >= 8);
await page.fill('input[type=search]', 'quiz');
await sleep(250);
check('zoeken filtert', (await page.locator('.widget-card').count()) < cardCount);
await page.fill('input[type=search]', '');

// ── 3. Quiz-editor (lazy geladen) ───────────────────────────────────────────
console.log('3. Quiz-editor');
await page.locator('.widget-card', { hasText: 'quiz over België' }).first().click();
await sleep(800);
check('editor geopend', await page.locator('.editor-layout').isVisible());
check('vragen geladen', (await page.locator('.editor-item').count()) >= 8);
check('vraagbank-knop', await page.getByRole('button', { name: /Uit vraagbank/ }).isVisible());
check('bulk-importknop', await page.getByRole('button', { name: /Tekst plakken/ }).isVisible());
await page.getByRole('tab', { name: /Instellingen/ }).click();
check('instellingenpaneel', await page.locator('text=Tijdslimiet').first().isVisible());
check('toetsmodus-instelling', await page.locator('text=Toetsmodus').first().isVisible());
await page.getByRole('tab', { name: /Inhoud/ }).click();

// ── 4. Voorbeeldmodus ───────────────────────────────────────────────────────
console.log('4. Voorbeeldmodus');
await page.getByRole('button', { name: /Uitproberen/ }).click();
await sleep(700);
check('voorbeeldmodus actief', await page.locator('.player-shell').isVisible());
check('vraag zichtbaar', await page.locator('.question-card').first().isVisible());
await page.locator('.answer-option').first().click();
check('antwoord geselecteerd', (await page.locator('.answer-option.selected').count()) === 1);
await page.getByRole('button', { name: /Terug naar bewerken/ }).click();

// ── 5. Leerlingflow via code ────────────────────────────────────────────────
console.log('5. Leerlingflow');
const quiz = await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const w = ws.find((x) => x.title.includes('België'));
  return { id: w.id, code: w.code };
});
await go(`/#/speel/${quiz.code}`);
check('naamscherm', await page.locator('#student-name').isVisible());
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(600);
check('quiz gestart', await page.locator('.question-card').isVisible());
for (let i = 0; i < 12; i++) {
  const opt = page.locator('.answer-option').first();
  if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {});
  const inp = page.locator('.question-card input.input, .question-card textarea.textarea').first();
  if (await inp.isVisible().catch(() => false)) await inp.fill('5').catch(() => {});
  const submit = page.getByRole('button', { name: /Indienen/ });
  if (await submit.isVisible().catch(() => false)) { await submit.click(); break; }
  const next = page.getByRole('button', { name: /Volgende/ });
  if (await next.isVisible().catch(() => false)) await next.click();
  await sleep(150);
}
await sleep(600);
check('resultaatscherm', await page.locator('.result-hero').isVisible());

// ── 6. Resultaten bij de leerkracht ─────────────────────────────────────────
console.log('6. Resultaten');
await go('/#/resultaten');
check('resultatenrij', (await page.locator('table.data tbody tr').count()) >= 1);
await page.locator('table.data tbody tr').first().click();
await sleep(700);
// Er staat een open vraag klaar: de detailpagina opent dan op "Nakijken".
check('detailpagina opent op nakijken', (await page.getByRole('tab', { name: /Nakijken/ }).getAttribute('aria-selected')) === 'true');
await page.getByRole('tab', { name: /Per leerling/ }).click();
await sleep(300);
check('detailpagina', await page.locator('.table-wrap').isVisible());
check('resultaatcode-knop', await page.getByRole('button', { name: /Resultaatcode plakken/ }).isVisible());
check('anonieme CSV-knop', await page.getByRole('button', { name: /CSV zonder namen/ }).isVisible());
await page.locator('table.data tbody tr').first().click();
await sleep(400);
check('inzendingsmodal', await page.locator('.modal').isVisible());
await page.keyboard.press('Escape');

// ── 7. Andere widgettypes (lazy chunks) ─────────────────────────────────────
console.log('7. Widgettypes');
const codes = await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const by = (t) => ws.find((w) => w.type === t)?.code;
  return { crossword: by('crossword'), wordsearch: by('wordsearch'), memory: by('memory'), spinner: by('spinner') };
});
await go(`/#/speel/${codes.crossword}`);
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(700);
check('kruiswoordrooster', (await page.locator('.cross-cell input').count()) > 20);
check('clues zichtbaar', await page.locator('text=Horizontaal').isVisible());
await go(`/#/speel/${codes.wordsearch}`);
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(700);
check('woordzoekerrooster', (await page.locator('.ws-cell').count()) === 100);
await go(`/#/speel/${codes.memory}`);
await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(600);
check('memorykaarten', (await page.locator('.memory-card').count()) === 12);
await go(`/#/speel/${codes.spinner}`);
await sleep(400);
check('rad zichtbaar', await page.locator('svg[role=img]').isVisible());

// ── 8. Delen (QR, Classroom, embed) ─────────────────────────────────────────
console.log('8. Delen');
await go('/#/widgets');
await page.locator('.widget-card').first().locator('button[aria-label^="Acties"]').click();
await page.getByRole('menuitem', { name: /Delen/ }).click();
await sleep(700);
check('delen begint bij de klas', await page.locator('.modal').getByText(/Toewijzen aan een klas/).first().isVisible());
await page.locator('summary', { hasText: 'Meer manieren om te delen' }).click();
await sleep(300);
check('QR-code', await page.locator('img[alt^="QR-code"]').isVisible());
check('Classroom-knop', await page.locator('a', { hasText: 'Google Classroom' }).isVisible());
await page.keyboard.press('Escape');

// ── 9. Print, privacy, hulp, voortgang ──────────────────────────────────────
console.log('9. Vaste pagina\'s');
await go(`/#/print/${quiz.id}`);
check('printweergave', await page.locator('text=Correctiesleutel tonen').isVisible());
await go('/#/privacy');
check('privacypagina', await page.locator('text=Waar staan de gegevens?').isVisible());
await go('/#/hulp');
check('hulppagina', await page.locator('h1', { hasText: 'Hoe werkt Boosterz?' }).isVisible());
check('FAQ aanwezig', (await page.locator('details').count()) >= 6);
await go('/#/voortgang');
check('voortgangspagina rendert', (await page.locator('h1').count()) >= 1);

// ── 10. AI-pagina's (zonder sleutel: nette poort) ───────────────────────────
console.log('10. AI-pagina\'s');
await go('/#/ai-studio');
check('AI-studio met sleutelpoort', await page.locator('text=/sleutel/i').first().isVisible());
await go('/#/ai-instellingen');
check('AI-instellingen rendert', await page.locator('text=/sleutel|aanbieder/i').first().isVisible());

// ── 11. Cursussen: dashboard + deelmodal met LMS-embed ──────────────────────
console.log('11. Cursusdashboard');
await go('/#/cursussen');
const demo = await page.evaluate(() => {
  const cs = JSON.parse(localStorage.getItem('wf.courses.v1'));
  return { id: cs[0].id, code: cs[0].code };
});
check('cursuskaart aanwezig', await page.getByRole('button', { name: /^Acties voor/ }).first().isVisible());
await page.getByRole('button', { name: /^Acties voor/ }).first().click();
await page.getByRole('menuitem', { name: /Delen/ }).click();
await sleep(600);
await page.locator('summary', { hasText: 'Meer manieren om te delen' }).click();
await sleep(300);
check('embed-code voor LMS', (await page.locator('.modal textarea').first().inputValue()).includes('<iframe'));
await page.keyboard.press('Escape');

// ── 12. Cursuseditor: structuur, palet, doelendekking, AI-knop ──────────────
console.log('12. Cursuseditor');
await go(`/#/cursus/bewerk/${demo.id}`);
check('structuurpaneel', await page.locator('text=Hoofdstuk').first().isVisible());
check('blok toevoegen-knop', await page.getByRole('button', { name: /Blok toevoegen/ }).first().isVisible());
check('AI-herwerkknop', await page.locator('button', { hasText: /Herwerk met AI|✨/ }).first().isVisible());
await page.getByRole('button', { name: /Doelendekking/ }).click();
await sleep(400);
check('doelendekking-modal', await page.locator('.modal', { hasText: /doel/i }).isVisible());
await page.keyboard.press('Escape');

// ── 13. Cursusviewer: lezen, notities (persistentie!), zoeken ───────────────
console.log('13. Cursusviewer');
await go(`/#/cursus/lees/${demo.code}`);
if (await page.locator('#course-student-name').isVisible().catch(() => false)) {
  await page.fill('#course-student-name', 'Testlezer');
  await page.getByRole('button', { name: /Start|Aan de slag/ }).first().click();
  await sleep(600);
}
check('cursusinhoud rendert', (await page.locator('.course-block').count()) >= 1
  || await page.locator('text=/verdamping|waterdamp/i').first().isVisible());
const noteBox = page.locator('textarea[placeholder*="onthouden"]').first();
check('notitieveld zichtbaar', await noteBox.isVisible());
await noteBox.fill('Verdamping = water wordt damp door warmte.');
await sleep(900);
await page.reload({ waitUntil: 'networkidle' });
await sleep(700);
check('notitie blijft bewaard na herladen',
  (await page.locator('textarea[placeholder*="onthouden"]').first().inputValue()).includes('Verdamping'));
const zoek = page.locator('input[aria-label="Zoeken in de cursus"]');
check('zoekveld aanwezig', await zoek.isVisible());
await zoek.fill('waterdamp');
await sleep(350);
check('zoeken filtert', await page.locator('text=/resulta(at|ten)/i').first().isVisible());
await zoek.fill('');
check('markeer-als-gelezen-knop', await page.getByRole('button', { name: /Markeer als gelezen/ }).first().isVisible());
await page.getByRole('button', { name: /Markeer als gelezen/ }).first().click();
await sleep(400);

// ── 14. Cursus volgen + printen ─────────────────────────────────────────────
console.log('14. Cursus volgen/printen');
await go(`/#/cursus/volg/${demo.id}`);
check('volgpagina rendert', await page.locator('text=/voortgang|leerling/i').first().isVisible());
await go(`/#/cursus/print/${demo.id}`);
check('printbare cursus', await page.locator('text=/Afdrukken|Inhoud/').first().isVisible());

// ── 15. Meedoen-pagina: 6-tekengrens + widget- én cursuscodes ───────────────
console.log('15. Meedoen');
await go('/#/meedoen');
await page.fill('input[aria-label="Code van 6 tekens"]', 'ABCD');
check('Start uit bij halve code', await page.getByRole('button', { name: /Start/ }).isDisabled());
await page.fill('input[aria-label="Code van 6 tekens"]', quiz.code);
await page.getByRole('button', { name: /Start/ }).click();
await sleep(500);
check('widgetcode werkt', page.url().includes('/speel/'));
await go('/#/meedoen');
await page.fill('input[aria-label="Code van 6 tekens"]', demo.code);
await page.getByRole('button', { name: /Start/ }).click();
await sleep(500);
check('cursuscode werkt', page.url().includes('/cursus/lees/'));

// ── 16. Foutpaden: nette meldingen, geen wit scherm ─────────────────────────
console.log('16. Foutpaden');
await go('/#/speel/XXXXXX');
check('onbekende widgetcode → melding', await page.locator('text=/niet gevonden|geen widget/i').first().isVisible());
await go('/#/cursus/lees/XXXXXX');
check('onbekende cursuscode → melding', await page.locator('text=/niet gevonden/i').first().isVisible());
await go('/#/open?d=rommel');
check('kapotte widgetlink → melding', await page.locator('text=/werkt niet|ongeldig|beschadigd/i').first().isVisible());
await go('/#/cursus/open?d=rommel');
check('kapotte cursuslink → melding', await page.locator('text=/werkt niet|ongeldig|beschadigd/i').first().isVisible());
await go('/#/dit-bestaat-niet');
check('onbekende route → meedoen-pagina', await page.locator('input[aria-label="Code van 6 tekens"]').isVisible());

// ── 17. Pdf-laag: opslag, viewer, markeerstiften, cursusblok ────────────────
console.log('17. Pdf-laag');
// Mini-pdf met correcte xref programmatisch opbouwen (pdf.js-vriendelijk).
function buildTinyPdf() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const streamBody = 'BT /F1 24 Tf 72 770 Td (Markeer mij: de hoofdtitel) Tj ET';
  objs.push(`<</Length ${streamBody.length}>>stream\n${streamBody}\nendstream`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return out;
}
await go('/#/widgets');
await page.evaluate(async (pdfText) => {
  // 1. mini-pdf in IndexedDB (zelfde schema als lib/pdfStore.ts)
  const blob = new Blob([pdfText], { type: 'application/pdf' });
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('wf-files', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('pdfs')) req.result.createObjectStore('pdfs', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const t = req.result.transaction('pdfs', 'readwrite');
      t.objectStore('pdfs').put({ id: 'smoketestpdf', name: 'smoke.pdf', blob, size: blob.size, createdAt: 1 });
      t.oncomplete = () => resolve(null);
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
  // 2. gesplitst werkblad omschakelen naar pdf-bron met markeerlegende
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const sw = ws.find((w) => w.type === 'splitworksheet');
  sw.config.source = {
    kind: 'pdf', title: 'Smoketest-pdf', pdfId: 'smoketestpdf', pdfName: 'smoke.pdf',
    highlightPalette: [
      { color: '#ffd54a', label: 'hoofdtitel' }, { color: '#7cc4ff', label: 'auteur' },
      { color: '#8ce99a', label: 'jaartal' }, { color: '#ffb26b', label: 'e-mail' },
      { color: '#f7a8d8', label: 'extra' },
    ],
  };
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  // 3. pdf-blok in de demo-cursus
  const cs = JSON.parse(localStorage.getItem('wf.courses.v1'));
  cs[0].chapters[0].sections[0].blocks.push({ id: 'smokepdfblock', type: 'pdf', pdfId: 'smoketestpdf', name: 'smoke.pdf', height: 420 });
  localStorage.setItem('wf.courses.v1', JSON.stringify(cs));
}, buildTinyPdf());
const swCode = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => w.type === 'splitworksheet').code);
await go(`/#/speel/${swCode}`);
if (await page.locator('#student-name').isVisible().catch(() => false)) {
  await page.fill('#student-name', 'Testleerling');
  await page.getByRole('button', { name: /Starten/ }).click();
}
await page.waitForSelector('.pdfv-page canvas', { timeout: 15000 }).catch(() => {});
check('pdf rendert in gesplitst werkblad', (await page.locator('.pdfv-page canvas').count()) >= 1);
await sleep(400);
check('tekstlaag aanwezig (markeerbaar)', (await page.locator('.pdfv-text span').count()) >= 1);
check('markeerstiften zichtbaar', (await page.locator('.pdfv-swatch').count()) === 5);
check('vragenkant blijft werken', (await page.locator('.question-card').count()) >= 1);
await go(`/#/cursus/lees/${demo.code}`);
// naar de eerste sectie (daar staat het pdf-blok); de viewer kan elders hervatten
await page.locator('nav[aria-label="Inhoudstafel"] button').first().click().catch(() => {});
await page.waitForSelector('.pdfv-page canvas', { timeout: 15000 }).catch(() => {});
check('pdf-blok rendert in cursus', (await page.locator('.pdfv-page canvas').count()) >= 1);

// ── 18. Uitgebreide vraagtypes ──────────────────────────────────────────────
console.log('18. Nieuwe vraagtypes');
const extraCode = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => w.title.includes('nieuwe vraagtypes'))?.code);
check('voorbeeldwerkblad geseed', !!extraCode);
if (extraCode) {
  await go(`/#/speel/${extraCode}`);
  if (await page.locator('#student-name').isVisible().catch(() => false)) {
    await page.fill('#student-name', 'Testleerling');
    await page.getByRole('button', { name: /Starten/ }).click();
    await sleep(700);
  }
  check('keuzelijst-in-zin rendert', (await page.locator('.question-card select').count()) >= 2);
  check('markeerwoorden klikbaar', (await page.locator('.question-card button[aria-pressed]').count()) >= 3);
  check('invultabel rendert', (await page.locator('.question-card table input').count()) >= 2);
  check('sterren renderen', await page.locator('button[aria-label*="sterren"], button[aria-label*="ster"]').first().isVisible());
  // minimaal invullen: eerste select + een tabelcel + een woord aanklikken
  await page.locator('.question-card select').first().selectOption({ index: 1 }).catch(() => {});
  await page.locator('.question-card table input').first().fill('Brussel').catch(() => {});
  await page.locator('.question-card button[aria-pressed="false"]').first().click().catch(() => {});
  await page.getByRole('button', { name: /Indienen/ }).click();
  await sleep(700);
  check('indienen met nieuwe types werkt', await page.locator('.result-hero').isVisible());
  // editorpalet toont de nieuwe types
  const extraId = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => w.title.includes('nieuwe vraagtypes')).id);
  await go(`/#/bewerk/${extraId}`);
  await page.getByRole('button', { name: /vraag toevoegen|Vraag toevoegen/i }).first().click().catch(() => {});
  await sleep(300);
  check('nieuwe types in vraagpalet', await page.locator('text=/Woorden markeren|Sorteren in categorie/i').first().isVisible());
  await page.keyboard.press('Escape');
}

// ── 19. Media-opslag (afbeeldingen in IndexedDB) ────────────────────────────
console.log('19. Media-opslag');
// Een echte png van 600×400 (zlib) — groot genoeg om verhuisd te worden.
function buildPng(width, height, rgb) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable.push(c >>> 0);
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      // ruis zodat de png niet tot niets comprimeert
      raw[o] = (rgb[0] + x * 7 + y * 3) & 0xff; raw[o + 1] = (rgb[1] + x * 5) & 0xff; raw[o + 2] = (rgb[2] + y * 11) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const png = buildPng(600, 400, [40, 120, 200]);
check(`test-png is groot genoeg (${Math.round(png.length / 1024)} kB)`, png.length > 20000);

// a) uploaden via de afbeeldingskiezer in de editor van een beeldwidget
const ivId = await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  const w = {
    id: 'smokemediawidget', type: 'imageviewer', title: 'Smoke media', folderId: null,
    config: { imageUrl: '', description: 'test' },
    settings: { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' },
    code: 'SMKMED', createdAt: Date.now(), updatedAt: Date.now(),
  };
  ws.unshift(w);
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  return w.id;
});
// Via het dashboard: /bewerk/:id → /bewerk/:id is anders een hash-wissel
// binnen dezelfde pagina; we willen hier een verse editor testen.
await go('/#/widgets');
await go(`/#/bewerk/${ivId}`);
check('editor van de mediawidget geopend', await page.locator('h1, .editor-title, input[value="Smoke media"]').filter({ hasText: /Smoke media/ }).first().isVisible().catch(() => false) || (await page.locator('input[value="Smoke media"]').count()) > 0);
await page.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
await sleep(2500); // verkleinen + IndexedDB + autosave
const afterUpload = await page.evaluate(() => {
  const raw = localStorage.getItem('wf.widgets.v1');
  const w = JSON.parse(raw).find((x) => x.id === 'smokemediawidget');
  const img = document.querySelector('.field img');
  return {
    ref: String(w.config.imageUrl),
    rawHasData: raw.includes('data:image'),
    imgSrc: img ? img.getAttribute('src') : '',
    natural: img ? img.naturalWidth : 0,
  };
});
check('config bevat een wfmedia-verwijzing i.p.v. data-URL', afterUpload.ref.startsWith('wfmedia:m_'));
check('geen data-URL in localStorage na upload', !afterUpload.rawHasData);
check('editor toont de afbeelding via blob:-URL', afterUpload.imgSrc.startsWith('blob:') && afterUpload.natural > 0);

// b) na herladen komt de afbeelding uit IndexedDB terug
await go(`/#/speel/SMKMED`);
await sleep(600);
const afterReload = await page.evaluate(() => {
  const img = document.querySelector('.player-shell img');
  return { src: img ? img.getAttribute('src') : '', natural: img ? img.naturalWidth : 0 };
});
check('speler toont de afbeelding na herladen (blob:)', afterReload.src.startsWith('blob:') && afterReload.natural > 0);

// c) draagbare link bevat de afbeelding als data-URL (deelvenster in de editor)
await go('/#/widgets');
await go(`/#/bewerk/${ivId}`);
await page.getByRole('button', { name: /^Delen$/ }).first().click();
await page.waitForFunction(() => {
  const el = document.querySelector('input[aria-label="Draagbare deellink"]');
  return el && el.value.startsWith('http');
}, null, { timeout: 8000 }).catch(() => {});
const portable = await page.evaluate(() => document.querySelector('input[aria-label="Draagbare deellink"]')?.value ?? '');
const dParam = portable.split('?d=')[1] ?? '';
const decodedPortable = dParam ? (LZString.decompressFromEncodedURIComponent(dParam) ?? '') : '';
check('draagbare link bevat de afbeelding als data-URL', decodedPortable.includes('"data:image/'));
check('draagbare link bevat geen blob:/wfmedia:', !decodedPortable.includes('blob:') && !decodedPortable.includes('wfmedia:'));
await page.keyboard.press('Escape');

// d) migratie: een oude widget met data-URL wordt na het laden verhuisd
const legacyDataUrl = 'data:image/png;base64,' + png.toString('base64');
await page.evaluate((dataUrl) => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
  ws.unshift({
    id: 'smokelegacy', type: 'imageviewer', title: 'Smoke legacy', folderId: null,
    config: { imageUrl: dataUrl, description: 'oud' },
    settings: { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' },
    code: 'SMKLEG', createdAt: Date.now(), updatedAt: Date.now(),
  });
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
}, legacyDataUrl);
await go(`/#/speel/SMKLEG`);
await sleep(2500);
const migrated = await page.evaluate(() => {
  const raw = localStorage.getItem('wf.widgets.v1');
  const w = JSON.parse(raw).find((x) => x.id === 'smokelegacy');
  const img = document.querySelector('.player-shell img');
  return { ref: String(w.config.imageUrl), hasData: raw.includes('data:image'), natural: img ? img.naturalWidth : 0 };
});
check('oude data-URL is naar IndexedDB verhuisd', migrated.ref.startsWith('wfmedia:m_') && !migrated.hasData);
check('speler toont de verhuisde afbeelding', migrated.natural > 0);
await page.reload({ waitUntil: 'networkidle' });
await sleep(600);
check('… ook na herladen', (await page.evaluate(() => document.querySelector('.player-shell img')?.naturalWidth ?? 0)) > 0);

// e) privacypagina telt de media
await go('/#/privacy');
check('privacypagina toont mediateller', await page.locator('text=/Afbeeldingen, audio en bijlagen/').first().isVisible());

// ── 20. Leerplannen ─────────────────────────────────────────────────────────
console.log('20. Leerplannen');
await go('/#/leerplannen');
check('leerplanpagina rendert', await page.getByRole('heading', { name: /Leerplannen/ }).first().isVisible());
check('voorbeeldleerplan geseed', await page.locator('text=/Voorbeeld/').first().isVisible());
const nGoals = await page.evaluate(() => (JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]')[0]?.goals ?? []).length);
check(`voorbeeldleerplan heeft doelen (${nGoals})`, nGoals >= 10);
const demoCoverage = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('wf.courses.v1') || '[]').find((x) => x.title.startsWith('Voorbeeldcursus'));
  return c ? { cur: !!c.curriculumId, codes: c.chapters.flatMap((ch) => ch.sections.flatMap((se) => se.goalCodes || [])).length } : null;
});
check('democursus hangt aan het leerplan met doelcodes', !!demoCoverage && demoCoverage.cur && demoCoverage.codes >= 3);
await go('/#/cursussen');
check('dekkingspercentage op de cursuskaart', await page.locator('text=/%/').first().isVisible());

// ── 20b. Officiële minimumdoelen: lezen, als leerplan bewaren, op slot ──────
console.log('20b. Officiële minimumdoelen');
const curriculaVoor = await page.evaluate(() => localStorage.getItem('wf.curricula.v1'));
const passtOpSmal = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
await go('/#/leerplannen');
check('wegwijzer: drie wegen om te beginnen', (await page.locator('details.lw .lw-weg').count()) === 3);
check('wegwijzer: links naar de netten openen in een nieuw tabblad', (await page.locator('details.lw .lw-links a[target="_blank"][rel*="noopener"]').count()) === 4);
await page.getByRole('link', { name: /Officiële minimumdoelen/ }).first().click();
await page.waitForSelector('.md-sets > li', { timeout: 15000 });
check('pagina Officiële minimumdoelen: één main en één h1', (await page.locator('main').count()) === 1 && (await page.locator('main h1').count()) === 1);
check('h1 is "Officiële minimumdoelen"', /Officiële minimumdoelen/.test(await page.locator('main h1').innerText()));
const nSets = await page.locator('.md-sets > li').count();
check(`lijst met sets (${nSets})`, nSets >= 10);
check('het aantal sets wordt aangekondigd (aria-live)', (await page.locator('.md-aantal[aria-live="polite"]').innerText()).length > 0);
check('naamsvermelding en ophaaldatum staan bovenaan', /Vlaamse overheid/.test(await page.locator('.md-bron').innerText()) && /opgehaald op/.test(await page.locator('.md-bron').innerText()));
// Zoeken (zonder accenten en op nummer), dan de set openen
await page.fill('input[type=search]', 'ruimtelijk bewustzijn 3287');
await sleep(300);
check('zoeken op naam en nummer vindt precies één set', (await page.locator('.md-sets > li').count()) === 1);
await page.locator('.md-sets .md-set').first().click();
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('de set heeft een eigen url (deelbaar)', /#\/leerplannen\/minimumdoelen\/ODS_3287$/.test(page.url()));
check('de zoekterm blijft staan na het kiezen van een set', (await page.inputValue('input[type=search]')) === 'ruimtelijk bewustzijn 3287');
check('de gekozen set is gemarkeerd in de lijst', (await page.locator('.md-set[aria-current="true"]').count()) === 1);
check('de set toont zijn doelen', (await page.locator('.dl-rij').count()) === 8);
check('de code staat in een eigen kolom', await page.locator('.dl-code', { hasText: '09.01' }).first().isVisible());
const doelTeksten = await page.locator('.dl-zin').allInnerTexts();
check('doelteksten zijn gewone tekst, geen HTML', doelTeksten.length === 8 && doelTeksten.every((t) => t.trim().length > 0 && !/<\/?[a-z]/i.test(t)));
check('de bronlink opent in een nieuw tabblad', (await page.locator('.md-acties a[target="_blank"][rel*="noopener"]').count()) === 1);
check('nog steeds één h1 met een set open', (await page.locator('main h1').count()) === 1);

// Gebruik als leerplan: nagekeken en op slot
await page.getByRole('button', { name: /Gebruik als leerplan/ }).click();
await sleep(700);
check('daarna opent het leerplan', await page.getByRole('heading', { level: 1, name: /Ruimtelijk bewustzijn/ }).isVisible());
check('de parameter ?open= is uit de url verdwenen', !/open=/.test(page.url()));
check('label "Nagekeken" (met icoon en tekst)', await page.locator('main .badge', { hasText: /^Nagekeken$/ }).isVisible());
check('label "Officiële minimumdoelen"', await page.locator('main .badge', { hasText: 'Officiële minimumdoelen' }).isVisible());
check('melding: staat op slot', await page.locator('text=/Dit leerplan staat op slot/').isVisible());
check('op slot: geen invoerveld voor de doeltekst', (await page.locator('main textarea').count()) === 0 && (await page.locator('main input.input').count()) === 0);
check('de doelen staan er wel, met verwijzingen', (await page.locator('.dl-rij').count()) === 8 && (await page.locator('.dl-ref').count()) === 8);
check('eigen kopie en exporteren zijn mogelijk', await page.getByRole('button', { name: 'Eigen kopie maken' }).isVisible() && await page.getByRole('button', { name: /Exporteren/ }).isVisible());
const officieel = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').filter((x) => x.herkomst?.methode === 'officieel');
  return { n: c.length, status: c[0]?.controle?.status, goals: c[0]?.goals?.length, sets: c[0]?.minimumdoelenSets, refs: c[0]?.goals?.every((g) => g.refs?.length === 1) };
});
check('opgeslagen: één officieel leerplan, nagekeken, met verwijzingen', officieel.n === 1 && officieel.status === 'gecontroleerd' && officieel.goals === 8 && officieel.sets?.[0] === 'ODS_3287' && officieel.refs === true);
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: het leerplan op slot scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });

// Op de lijst: de kaart draagt de labels; nogmaals gebruiken maakt geen tweede leerplan
await page.getByRole('button', { name: /Alle leerplannen/ }).click();
await sleep(300);
const kaart = page.locator('article.mat-card', { hasText: 'Ruimtelijk bewustzijn' });
check('kaart: label Nagekeken', await kaart.locator('.badge', { hasText: /^Nagekeken$/ }).isVisible());
check('kaart: label Officiële minimumdoelen', await kaart.locator('.badge', { hasText: 'Officiële minimumdoelen' }).isVisible());
check('kaart: door wie en wanneer', await kaart.locator('text=/Nagekeken door Boosterz/').isVisible());
check('kaart: een nagekeken leerplan heet "Bekijken"', await kaart.getByRole('button', { name: /Bekijken/ }).isVisible());
await go('/#/leerplannen/minimumdoelen/ODS_3287');
await page.waitForSelector('.dl-rij', { timeout: 15000 });
await page.getByRole('button', { name: /Gebruik als leerplan/ }).click();
await sleep(700);
const nOfficieel = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').filter((x) => x.herkomst?.methode === 'officieel').length);
check('nogmaals gebruiken opent het bestaande leerplan (geen dubbel)', nOfficieel === 1 && await page.locator('text=/Dit leerplan staat op slot/').isVisible());

// Eigen kopie: bewerkbaar, verwijzingen te verwijderen
await page.getByRole('button', { name: 'Eigen kopie maken' }).click();
await sleep(500);
check('eigen kopie: bewerkbaar met invoervelden', (await page.locator('main textarea').count()) === 8);
check('eigen kopie: label Niet nagekeken', await page.locator('main .badge', { hasText: /^Niet nagekeken$/ }).isVisible());
check('eigen kopie: verwijzingen als labels met een verwijderknop', await page.getByRole('button', { name: 'Verwijzing 09.01 verwijderen' }).isVisible());
await page.getByRole('button', { name: 'Verwijzing 09.01 verwijderen' }).click();
await sleep(300);
check('verwijzing verwijderd', (await page.getByRole('button', { name: 'Verwijzing 09.01 verwijderen' }).count()) === 0 && (await page.locator('.dl-ref').count()) === 7);

// Een nagekeken leerplan waarvan de doelen buiten Boosterz gewijzigd zijn, geldt als gewijzigd
await page.evaluate(() => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const o = lijst.find((x) => x.herkomst?.methode === 'officieel' && x.controle?.status === 'gecontroleerd');
  o.goals[0].text += ' (aangepast)';
  localStorage.setItem('wf.curricula.v1', JSON.stringify(lijst));
});
await page.reload({ waitUntil: 'networkidle' });
await sleep(500);
const gewijzigdeKaart = page.locator('article.mat-card', { hasText: 'Ruimtelijk bewustzijn' }).filter({ has: page.locator('.badge', { hasText: 'Gewijzigd na nakijken' }) });
check('gewijzigd na nakijken: label op de kaart', (await gewijzigdeKaart.count()) === 1);
await gewijzigdeKaart.getByRole('button', { name: /Bewerken/ }).click();
await sleep(400);
check('gewijzigd: waarschuwing en bewerkbaar', await page.locator('text=/gewijzigd sinds het nakijken/').isVisible() && (await page.locator('main textarea').count()) === 8);
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: de editor met waarschuwing scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });

// Terug zoals het was, zodat de volgende onderdelen niets merken
await page.evaluate((v) => { if (v === null) localStorage.removeItem('wf.curricula.v1'); else localStorage.setItem('wf.curricula.v1', v); }, curriculaVoor);

// Smal scherm (390 px): geen horizontaal scrollen
await page.setViewportSize({ width: 390, height: 844 });
await go('/#/leerplannen/minimumdoelen');
await page.waitForSelector('.md-sets > li', { timeout: 15000 });
check('390 px: de lijst met sets scrollt niet horizontaal', await passtOpSmal());
await go('/#/leerplannen/minimumdoelen/ODS_3287');
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('390 px: een geopende set scrollt niet horizontaal', await passtOpSmal());
check('390 px: de set staat boven de lijst, met een knop om naar de lijst te springen', await page.getByRole('button', { name: /Naar de lijst met sets/ }).first().isVisible());
check('390 px: tikdoel "Gebruik als leerplan" is minstens 44 px', (await page.getByRole('button', { name: /Gebruik als leerplan/ }).boundingBox()).height >= 44);
await page.getByRole('button', { name: /Naar de lijst met sets/ }).first().click();
await sleep(200);
check('390 px: de knop zet de focus op het zoekveld', await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search'));
await go('/#/leerplannen');
check('390 px: de leerplannenpagina scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });

// ── 21. Importeren (zonder AI) ──────────────────────────────────────────────
console.log('21. Importeren');
await go('/#/importeren');
check('importpagina rendert', await page.getByRole('heading', { name: /Bestaand materiaal/ }).first().isVisible());
// het plakveld zit in een ingeklapt <details>: eerst openklappen
await page.locator('details:has(textarea[placeholder="Plak hier je tekst…"]) > summary').click();
await sleep(200);
await page.locator('textarea[placeholder="Plak hier je tekst…"]').fill('# Smoke-hoofdstuk\n\n## Sectie een\n\nEerste alinea met **vet**.\n\n| kop A | kop B |\n|---|---|\n| 1 | 2 |\n\n## Sectie twee\n\n- punt een\n- punt twee\n');
await page.getByRole('button', { name: /Tekst toevoegen als bron/ }).click();
await sleep(300);
await page.getByRole('button', { name: /Omzetten naar cursus/ }).first().click();
await sleep(900);
check('zonder AI omgezet: editor geopend', /#\/cursus\/bewerk\//.test(page.url()));
const smokeCourse = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('wf.courses.v1') || '[]').find((x) => x.title === 'Smoke-hoofdstuk');
  return c ? { secties: c.chapters[0]?.sections.length, tabel: c.chapters[0]?.sections[0]?.blocks.some((b) => b.type === 'table') } : null;
});
check('koppen → secties, tabel → tabelblok', !!smokeCourse && smokeCourse.secties === 2 && smokeCourse.tabel === true);

// ── 22. Klassen (leerkracht) ────────────────────────────────────────────────
console.log('22. Klassen');
await go('/#/klassen');
check('klassenpagina rendert', await page.getByRole('heading', { name: /Klassen/ }).first().isVisible());
check('voorbeeldklas geseed', await page.locator('text=/Voorbeeldklas/').first().isVisible());
const klasId = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.classes.v1') || '[]')[0]?.id);
check('voorbeeldklas in opslag', !!klasId);
await go(`/#/klas/${klasId}`);
check('klasoverzicht rendert', await page.getByRole('heading', { name: /Voorbeeldklas/ }).first().isVisible());
check('opdrachten aanwezig', (await page.evaluate(() => JSON.parse(localStorage.getItem('wf.assignments.v1') || '[]').length)) >= 1);
check('matrix leerlingen × opdrachten', (await page.locator('table').count()) >= 1);
await page.getByRole('button', { name: /Klaslink/ }).first().click();
await page.waitForFunction(() => {
  const el = document.querySelector('[aria-label="Klaspakketlink"]');
  return el && /#\/klas\/open\?d=/.test(el.value || el.textContent || '');
}, null, { timeout: 15000 }).catch(() => {});
const klaslink = await page.evaluate(() => { const el = document.querySelector('[aria-label="Klaspakketlink"]'); return el ? (el.value || el.textContent || '') : ''; });
check('klaslink gegenereerd', /#\/klas\/open\?d=/.test(klaslink));
await page.keyboard.press('Escape');

// ── 23. Leerlingflow via klaslink (vers toestel) ────────────────────────────
console.log('23. Leerlingflow');
const ctx2 = await browser.newContext({ viewport: { width: 420, height: 860 } });
const leerling = await ctx2.newPage();
leerling.on('pageerror', (e) => errors.push(`pageerror(leerling): ${e.message}`));
leerling.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`console(leerling): ${m.text()}`); });
await leerling.goto(klaslink.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' });
await sleep(1200);
check('klaspakket overgenomen → leerlinghub', /#\/leerling\//.test(leerling.url()));
check('naam kiezen', await leerling.getByRole('heading', { name: /Wie ben jij/ }).isVisible());
const eerste = leerling.locator('button.btn-ghost').first();
const naam = (await eerste.textContent()) || '';
await eerste.click();
await sleep(500);
check('begroeting met voornaam', await leerling.locator('text=/^Dag /').first().isVisible());
const opdrachten = leerling.locator('[aria-label="Mijn opdrachten"]');
check('opdrachten zichtbaar op het leerlingtoestel', (await opdrachten.locator('a, button').count()) >= 1);
await opdrachten.locator('a, button').first().click();
await sleep(1000);
check('opdracht opent speler of cursus', /#\/(speel|cursus\/lees)\//.test(leerling.url()));
const ctxOpslag = await leerling.evaluate(() => JSON.parse(localStorage.getItem('wf.student.v1') || 'null'));
// de knop toont "12 Naam": het nummer staat vóór de naam
check('klasidentiteit bewaard op het toestel', !!ctxOpslag && !!ctxOpslag.studentId && naam.trim().endsWith(ctxOpslag.studentName));
await ctx2.close();

// ── 24. Inleverpunt: resultaatcode plakken ──────────────────────────────────
console.log('24. Inleverpunt');
const inboxWidget = await page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('wf.widgets.v1')).find((x) => x.type === 'quiz');
  return { id: w.id, code: w.code, qids: w.config.questions.map((q) => q.id) };
});
const inboxSub = {
  id: 'smokeinbox1', widgetId: inboxWidget.id, widgetCode: inboxWidget.code, studentName: 'Codeleerling',
  startedAt: Date.now() - 60000, submittedAt: Date.now(), durationSec: 60,
  answers: { [inboxWidget.qids[0]]: 0 }, itemScores: { [inboxWidget.qids[0]]: { earned: 1, max: 1, mode: 'auto' } },
  totalEarned: 1, totalMax: 1, status: 'graded',
};
const resultCode = 'WF1.' + LZString.compressToEncodedURIComponent(JSON.stringify(inboxSub));
await go('/#/inleverpunt');
check('inleverpunt rendert', await page.getByRole('heading', { name: /Inleverpunt/ }).first().isVisible());
await page.locator('textarea').first().fill(`hier is mijn code: ${resultCode} groetjes`);
await page.getByRole('button', { name: /Codes verwerken/ }).click();
await sleep(600);
check('code herkend en verwerkt', await page.locator('text=/Codeleerling/').first().isVisible());
check('inzending bewaard', await page.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1')).some((s) => s.id === 'smokeinbox1')));
await page.locator('textarea').first().fill(resultCode);
await page.getByRole('button', { name: /Codes verwerken/ }).click();
await sleep(500);
check('dubbele code wordt niet nog eens bewaard', (await page.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1')).filter((s) => s.id === 'smokeinbox1').length)) === 1);

// ── 25. Bestaand materiaal: pdf met structuur → cursus (zonder AI) ─────────
console.log('25. Pdf-import met structuur');
await go('/#/importeren');
await page.locator('input[type=file]').first().setInputFiles(new URL('./fixtures/voorbeeld-cursus.pdf', import.meta.url).pathname);
await page.waitForFunction(() => [...document.querySelectorAll('textarea.textarea')].some((t) => /Kernbegrippen/.test(t.value)), null, { timeout: 30000 }).catch(() => {});
const pdfMd = await page.evaluate(() => [...document.querySelectorAll('textarea.textarea')].map((t) => t.value).find((v) => /Kernbegrippen/.test(v)) ?? '');
check('pdf → markdown met koppen op drie niveaus', /^# Hoofdstuk 1: Proefcursus krachten$/m.test(pdfMd) && /^## 1\. Hoe komen krachten voor\?$/m.test(pdfMd) && /^### 1\.1 Wat is een kracht\?$/m.test(pdfMd));
check('vectorbolletjes worden een lijst', /^- \*\*Vervorming:\*\* een bal die je indrukt\.$/m.test(pdfMd));
check('vet run-in-label blijft één alinea', /\*\*Voorbeeld:\*\* Als je een winkelkar duwt, oefen je een spierkracht uit\. De kar versnelt/.test(pdfMd));
await page.getByLabel(/Wat wordt een sectie/).selectOption('3');
await page.getByRole('button', { name: /Omzetten naar cursus/ }).click();
await page.waitForFunction(() => /#\/cursus\/bewerk\//.test(location.hash), null, { timeout: 30000 });
await sleep(500);
const pdfCourse = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.courses.v1')).find((c) => /Proefcursus/.test(c.title)));
const pdfSections = pdfCourse?.chapters[0]?.sections ?? [];
check('genummerde titels worden secties (+ afgeleide sectie Oefeningen)', pdfSections.map((x) => x.title).join('|') === 'Inleiding|1.1 Wat is een kracht?|1.2 Welke soorten krachten zijn er?|Kernbegrippen|Oefeningen');
const sec11 = pdfSections[1]?.blocks ?? [];
check('labels worden callouts (Voorbeeld → info, Oefening → doel)', sec11.some((b) => b.type === 'callout' && b.kind === 'info') && sec11.some((b) => b.type === 'callout' && b.kind === 'goal'));
check('"Let op" wordt een waarschuwing', (pdfSections[2]?.blocks ?? []).some((b) => b.type === 'callout' && b.kind === 'warn'));
const termsBlock = (pdfSections[3]?.blocks ?? []).find((b) => b.type === 'terms');
check('begrippenlijst wordt een termenblok met 4 termen', termsBlock?.items?.length === 4 && termsBlock.items[0].term === 'Kracht');
const oefSec = pdfCourse?.chapters[0]?.sections.find((x) => x.title === 'Oefeningen');
const oefIds = (oefSec?.blocks ?? []).filter((b) => b.type === 'widget').map((b) => b.widgetId);
const oefTypes = await page.evaluate((ids) => JSON.parse(localStorage.getItem('wf.widgets.v1')).filter((w) => ids.includes(w.id)).map((w) => w.type).sort(), oefIds);
check('oefeningen afgeleid: sectie Oefeningen met begrippenquiz en koppelspel', oefTypes.join() === 'pairs,quiz');
const pdfQuiz = await page.evaluate((ids) => JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => ids.includes(w.id) && w.type === 'quiz'), oefIds);
check('begrippenquiz: 4 meerkeuzevragen met de term als juist antwoord + koppelvraag', pdfQuiz?.config.questions.filter((q) => q.type === 'mc').length === 4 && pdfQuiz.config.questions.every((q) => q.type !== 'mc' || q.options[q.correctIndex] && q.options.length === 4) && pdfQuiz.config.questions.some((q) => q.type === 'match'));

// ── 26. Voorbeeldcursus (bestaand materiaal, 14 hoofdstukken) laden ────────
console.log('26. Voorbeeldcursus laden');
await go('/#/cursussen');
await page.getByRole('button', { name: /Voorbeeldcursus laden/ }).first().click();
await page.waitForFunction(() => (JSON.parse(localStorage.getItem('wf.courses.v1') || '[]')).some((c) => c.id === 'nw-voorbeeld-1e-graad'), null, { timeout: 30000 }).catch(() => {});
const example = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.courses.v1')).find((c) => c.id === 'nw-voorbeeld-1e-graad'));
check('voorbeeldcursus staat in de bibliotheek met 14 hoofdstukken', example?.chapters?.length === 14);
const exSections = (example?.chapters ?? []).flatMap((c) => c.sections);
check('elke sectie draagt doelcodes van het voorbeeldleerplan', exSections.length > 100 && exSections.every((x) => Array.isArray(x.goalCodes) && x.goalCodes.length > 0));
const exBlocks = exSections.flatMap((x) => x.blocks);
check('afbeeldingen uit de pdf\'s zitten erin (≥ 100)', exBlocks.filter((b) => b.type === 'image').length >= 100);
const exWidgets = await page.evaluate((ids) => JSON.parse(localStorage.getItem('wf.widgets.v1')).filter((w) => ids.includes(w.id)).map((w) => ({ id: w.id, type: w.type, code: w.code, title: w.title })), exBlocks.filter((b) => b.type === 'widget').map((b) => b.widgetId));
const exWidgetRefs = exBlocks.filter((b) => b.type === 'widget').length;
check('flitskaarten per hoofdstuk als widgetblok', exWidgets.filter((w) => w.type === 'flashcards' && /^nw-vb-flits-/.test(w.id)).length === 14);
check(`elk widgetblok verwijst naar een meegeleverde widget (${exWidgetRefs})`, exWidgetRefs >= 100 && exWidgets.length === exWidgetRefs);
const exTypes = [...new Set(exWidgets.map((w) => w.type))];
check(`oefeningen in minstens 8 widgettypes (${exTypes.join(', ')})`, exTypes.length >= 8 && ['quiz', 'worksheet', 'pairs', 'exitticket'].every((t) => exTypes.includes(t)));
check('afgeleide oefeningen: begrippenquiz, koppelspel, invuloefeningen en werkblad met opdrachten', exWidgets.filter((w) => /^Begrippenquiz/.test(w.title)).length === 14 && exWidgets.filter((w) => /^Koppelspel/.test(w.title)).length === 14 && exWidgets.filter((w) => /^Invuloefening/.test(w.title)).length >= 50 && exWidgets.filter((w) => /^Opdrachten/.test(w.title)).length >= 10);
check('handgeschreven oefeningen per hoofdstuk (≥ 4)', exWidgets.filter((w) => /^nw-vb-oef-/.test(w.id)).length >= 14 * 4);
// Eén widget van elk type openen in de speler: rendert zonder fouten.
for (const t of exTypes) {
  const w = exWidgets.find((x) => x.type === t && /^nw-vb-oef-/.test(x.id)) ?? exWidgets.find((x) => x.type === t);
  const before = errors.length;
  await go(`/#/speel/${w.code}`);
  await sleep(700);
  const body = await page.evaluate(() => document.body.innerText);
  check(`speler rendert ${t} (${w.title.slice(0, 40)})`, errors.length === before && body.includes(w.title.slice(0, 20)));
}
check('cursus hangt aan het voorbeeldleerplan', example?.curriculumId === 'wf-voorbeeld-nw-1egraad');
await go(`/#/cursus/lees/${example?.code}`);
await page.getByLabel(/Jouw naam/).fill('Testleerling');
await page.getByRole('button', { name: /Start met lezen/ }).click();
await sleep(1000);
check('viewer opent de voorbeeldcursus', await page.locator('text=/Kennismaken met natuurwetenschappen/i').first().isVisible());
// Naar een sectie met een afbeelding: de mindmap van hoofdstuk 1.
await page.locator('a:has-text("Mindmap"), button:has-text("Mindmap")').first().click();
await sleep(1500);
const exImg = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => /voorbeelden\/nw\//.test(i.src)).map((i) => i.naturalWidth));
check('afbeelding uit de pdf rendert in de viewer (naast de app, niet in de opslag)', exImg.length >= 1 && exImg[0] > 0);

// ── Slot ────────────────────────────────────────────────────────────────────
console.log('\n──────────');
if (errors.length) {
  console.log('Console-/paginafouten:');
  for (const e of [...new Set(errors)]) console.log('  •', e.slice(0, 300));
  failures += errors.length;
} else {
  console.log('Geen console- of paginafouten. ✓');
}
console.log(failures === 0 ? 'ALLE CHECKS GESLAAGD ✓' : `${failures} CHECKS GEFAALD ✗`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
