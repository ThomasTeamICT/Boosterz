// Volledige rooktest voor Boosterz: draait tegen een preview-build.
//
//   npm run build && npx vite preview --port 4173 &
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
//
// Vers browserprofiel per run (seed vult voorbeeldinhoud automatisch).
// Faalt hard (exit 1) bij een mislukte check of bij console-/paginafouten.

import { chromium } from 'playwright-core';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
check('wegwijzer: vier wegen om te beginnen', (await page.locator('details.lw .lw-weg').count()) === 4);
check('wegwijzer: een korte keuzehulp boven de vier kaarten', /Volgt je school het leerplan van een net \(KOV, GO!, OVSG of POV\)\? Kies ‘Leerplan van je net inlezen’\. Wil je enkel de wettelijke basis\? Kies ‘Officiële minimumdoelen’\. Wil je zelf doelen kiezen uit de minimumdoelen, bv\. voor basisgeletterdheid of voor je vak\? Kies ‘Zelf doelen samenstellen’\. Kreeg je een bestand van een collega\? Kies ‘Bestand van een collega’\./.test(await page.locator('details.lw .lw-keuzehulp').innerText()));
check('wegwijzer: de minimumdoelen-kaart zegt "Kies een set die nog geldt"', /De doelen komen letterlijk uit de officiële bron\. Kies een set die nog geldt\./.test(await page.locator('details.lw .lw-weg').first().innerText()));
check('kop van de leerplannenpagina: "Leerplan inlezen" eerst, en "Bestand van een collega" in plaats van "JSON importeren"', JSON.stringify((await page.locator('.page-head-actions .btn').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['Leerplan inlezen', 'Officiële minimumdoelen', 'Bestand van een collega', 'Blanco leerplan']) && (await page.locator('.page-head-actions a.btn-primary', { hasText: 'Leerplan inlezen' }).count()) === 1);
check('de netten-tip zegt dat de AI de tekst wel van het toestel haalt', /blijft op dit toestel, behalve als je de AI laat helpen\./.test(await page.locator('details.lw .lw-tip').last().innerText()));
check('wegwijzer: links naar de netten openen in een nieuw tabblad', (await page.locator('details.lw .lw-links a[target="_blank"][rel*="noopener"]').count()) === 4);
await page.getByRole('link', { name: /Officiële minimumdoelen/ }).first().click();
await page.waitForSelector('.md-sets > li', { timeout: 15000 });
check('pagina Officiële minimumdoelen: één main en één h1', (await page.locator('main').count()) === 1 && (await page.locator('main h1').count()) === 1);
check('uitleg over de sets en wat er (nog) niet in zit', /De minimumdoelen zijn verdeeld in sets: per vak of sleutelcompetentie, per graad en per stroom\./.test(await page.locator('.md-intro').innerText()) && /alleen de minimumdoelen van het secundair onderwijs \(ook buitengewoon secundair\) en van het volwassenenonderwijs, niet die van het basisonderwijs\./.test(await page.locator('.md-intro').innerText()));
check('h1 is "Officiële minimumdoelen"', /Officiële minimumdoelen/.test(await page.locator('main h1').innerText()));
const nSets = await page.locator('.md-sets > li').count();
check(`lijst met sets (${nSets})`, nSets >= 10);
check('het aantal sets wordt aangekondigd (aria-live)', (await page.locator('.md-aantal[aria-live="polite"]').innerText()).length > 0);
check('naamsvermelding en ophaaldatum staan bovenaan', /Vlaamse overheid/.test(await page.locator('.md-bron').innerText()) && /opgehaald op/.test(await page.locator('.md-bron').innerText()));
// Zoeken (zonder accenten en op nummer), dan de set openen
await page.fill('.md-filters input[type=search]', 'ruimtelijk bewustzijn 3287');
await sleep(300);
check('zoeken op naam en nummer vindt precies één set', (await page.locator('.md-sets > li').count()) === 1);
await page.locator('.md-sets .md-set').first().click();
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('de set heeft een eigen url (deelbaar)', /#\/leerplannen\/minimumdoelen\/ODS_3287$/.test(page.url()));
check('na het kiezen van een set staat de focus op de set, ook op een breed scherm', await page.evaluate(() => document.activeElement?.classList.contains('md-setpaneel')));
check('"Naar de lijst met sets" staat ook op een breed scherm', await page.locator('.md-naarlijst').first().isVisible());
check('een set die nog geldt heeft geen waarschuwing en heet "Gebruik als leerplan"', (await page.locator('.md-verouderd').count()) === 0 && (await page.getByRole('button', { name: 'Gebruik als leerplan' }).isVisible()));
check('de zoekterm blijft staan na het kiezen van een set', (await page.inputValue('.md-filters input[type=search]')) === 'ruimtelijk bewustzijn 3287');
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
check('de doelen staan er wel; een officieel leerplan toont geen verwijzingslabels (de verwijzingen blijven in de gegevens)', (await page.locator('.dl-rij').count()) === 8 && (await page.locator('.dl-ref').count()) === 0);
check('na "Gebruik als leerplan" staat de focus op de h1 van het leerplan', await page.evaluate(() => document.activeElement?.tagName === 'H1' && document.activeElement === document.querySelector('main h1')));
check('de bronlink noemt de hostnaam', (await page.locator('.lp-info a', { hasText: /^Bekijk de bron \(www\.onderwijsdoelen\.be\)/ }).count()) === 1);
check('een officieel leerplan krijgt geen deel-hint', (await page.locator('.lp-deelhint').count()) === 0);
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

// ── 20b-2. Een set die niet meer geldt, zoeken op vak, een set die niet bestaat ──
console.log('20b-2. Verouderde set, zoeken op vak, onbekende set');
await go('/#/leerplannen/minimumdoelen');
await page.waitForSelector('.md-sets > li', { timeout: 15000 });
await page.fill('input[type=search]', 'aardrijkskunde');
await sleep(300);
const vakSets = await page.locator('.md-sets > li').allInnerTexts();
check('zoeken op "aardrijkskunde" vindt ook "Ruimtelijk bewustzijn" (hulp bij het zoeken)', vakSets.some((t) => /Ruimtelijk bewustzijn/.test(t)));
check('oude versies staan standaard niet in de lijst, met een melding hoeveel er verborgen zijn', !vakSets.some((t) => /Niet meer geldig|Oudere versie/.test(t)) && /oude versies? verborgen/.test(await page.locator('.md-oud-hint').innerText()));
await page.getByLabel('Toon ook oude versies die niet meer gelden').check();
await sleep(300);
check('… en verschijnen met het vinkje "Toon ook oude versies"', (await page.locator('.md-sets > li').allInnerTexts()).some((t) => /Niet meer geldig/.test(t)));
await page.getByLabel('Toon ook oude versies die niet meer gelden').uncheck();
await go('/#/leerplannen/minimumdoelen/ODS_2118');
await page.waitForSelector('.md-feiten', { timeout: 15000 });
await page.waitForSelector('.md-verouderd', { timeout: 15000 });
const oudeNoot = await page.locator('.md-verouderd[role="note"]').innerText();
check('niet meer geldige set (ODS_2118): een blok met role="note" met de jaren en de set van nu voor dit vak', /^Deze minimumdoelen gelden niet meer \(1997–2020\)\. Sinds 2019 zijn de eindtermen niet meer per vak geordend, maar per sleutelcompetentie\. De doelen van nu voor aardrijkskunde staan in:/.test(oudeNoot) && await page.locator('.md-verouderd').getByRole('link', { name: 'Open ‘Ruimtelijk bewustzijn’' }).isVisible());
check('… het blok staat boven de knop en de knop heet "Toch als leerplan gebruiken"', await page.evaluate(() => { const n = document.querySelector('.md-verouderd'); const k = document.querySelector('.md-acties'); return !!n && !!k && (n.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }) && (await page.getByRole('button', { name: 'Toch als leerplan gebruiken' }).isVisible()) && (await page.getByRole('button', { name: 'Gebruik als leerplan' }).count()) === 0);
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: een niet meer geldige set scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });
await page.locator('.md-verouderd').getByRole('link', { name: 'Open ‘Ruimtelijk bewustzijn’' }).click();
await page.waitForSelector('.md-feiten', { timeout: 15000 });
check('de knop in de waarschuwing opent de set van nu (ODS_3287), zonder waarschuwing', /ODS_3287/.test(page.url()) && (await page.locator('.md-verouderd').count()) === 0);
await go('/#/leerplannen/minimumdoelen/ODS_2447');
await page.waitForSelector('.md-verouderd', { timeout: 15000 });
check('een oudere versie (ODS_2447) wijst de nieuwere versie aan', /Er is een nieuwere versie van deze set/.test(await page.locator('.md-verouderd').innerText()) && await page.locator('.md-verouderd').getByRole('link', { name: 'Open ‘Ruimtelijk bewustzijn’' }).isVisible());
// Geldigheid "Onbekend" naast een geldige set met dezelfde naam: versie 2.0 van STEM 3de graad doorstroom.
await go('/#/leerplannen/minimumdoelen/ODS_2787');
await page.waitForSelector('.md-verouderd', { timeout: 15000 });
check('een oudere versie met geldigheid "Onbekend" (ODS_2787) heet zo en wijst de versie van nu aan (ODS_3069)', /^Dit is een oudere versie van deze set\. Er is een nieuwere versie die nu geldt: gebruik die\./.test(await page.locator('.md-verouderd').innerText()) && /Oudere versie/.test(await page.locator('.md-feiten').innerText()) && (await page.locator('.md-verouderd a[href$="/ODS_3069"]').count()) === 1);
// Een STEM-set: uitleg voor een leek, zoeken in de doelen, en (2de graad) de sets per vak.
await go('/#/leerplannen/minimumdoelen/ODS_3283');
await page.waitForSelector('.md-stem', { timeout: 15000 });
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('STEM-set (ODS_3283): een uitleg met role="note" dat wiskunde, natuurwetenschappen en techniek samen zitten en dat het leerplan van het net zegt wat bij je vak hoort', /Wiskunde, natuurwetenschappen en techniek zitten samen in deze set\..*leerplan van je net/s.test(await page.locator('.md-stem[role="note"]').innerText()) && (await page.locator('.md-verouderd').count()) === 0);
const voorbeeld = page.locator('.md-stem-zoek button').first();
const woord = (await voorbeeld.innerText()).trim();
await voorbeeld.click();
await sleep(200);
const gevondenDoelen = await page.locator('.dl-rij').count();
check(`een voorbeeldwoord ("${woord}") zoekt in de doelen: het zoekveld heeft de focus, minder doelen, en het aantal staat erbij`, (await page.inputValue('.md-doelzoek input')) === woord && (await page.evaluate(() => document.activeElement?.closest('.md-doelzoek') !== null)) && gevondenDoelen > 0 && gevondenDoelen < 44 && new RegExp(`^${gevondenDoelen} van 44 doelen$`).test((await page.locator('.md-doelzoek-aantal').innerText()).trim()));
await page.fill('.md-doelzoek input', 'zzgeenwoord');
await sleep(200);
check('zoeken zonder resultaat zegt het en biedt "Toon alle doelen"', /Geen doelen met ‘zzgeenwoord’/.test(await page.locator('.md-setpaneel .md-leeg').innerText()) && (await page.locator('.dl-rij').count()) === 0);
await page.getByRole('button', { name: 'Toon alle doelen' }).click();
await sleep(200);
check('… en "Toon alle doelen" toont ze weer allemaal', (await page.locator('.dl-rij').count()) === 44);
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: een STEM-set met uitleg en zoekveld scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });
await go('/#/leerplannen/minimumdoelen/ODS_3020');
await page.waitForSelector('.md-stem', { timeout: 15000 });
check('STEM-set 2de graad (ODS_3020): de uitleg wijst de sets per vak aan (biologie, chemie, fysica)', (await page.locator('.md-stem a').allInnerTexts()).map((t) => t.trim()).filter((t) => t.startsWith('Open ')).join('|') === 'Open ‘Biologie’|Open ‘Chemie’|Open ‘Fysica’');
await go('/#/leerplannen/minimumdoelen/ODS_3287');
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('een set die geen STEM-set is, krijgt geen STEM-uitleg; een kleine set geen zoekveld', (await page.locator('.md-stem').count()) === 0 && (await page.locator('.md-doelzoek').count()) === 0);
await go('/#/leerplannen/minimumdoelen/ODS_2118');
await page.waitForSelector('.md-verouderd', { timeout: 15000 });
await page.getByRole('button', { name: 'Toch als leerplan gebruiken' }).click();
await page.waitForSelector('text=/Dit leerplan staat op slot/', { timeout: 10000 });
check('het leerplan van een oude set heet "(niet meer geldig)" en heeft geen "Geldig vanaf"', /\(niet meer geldig\)$/.test(await page.locator('main h1').innerText()) && !/Geldig vanaf/.test(await page.locator('.lp-info').innerText()));
check('… en de focus staat op de h1', await page.evaluate(() => document.activeElement === document.querySelector('main h1')));
for (const id of ['ODS_999999', 'foo']) {
  await go(`/#/leerplannen/minimumdoelen/${id}`);
  check(`onbekende set (${id}): "Set niet gevonden" met uitleg, zonder "Opnieuw proberen"`, /^Set niet gevonden$/.test(await page.locator('#md-set-kop').innerText()) && /Deze set bestaat niet\. Kies een set uit de lijst\./.test(await page.locator('.md-setpaneel').innerText()) && (await page.getByRole('button', { name: /Opnieuw proberen/ }).count()) === 0);
}
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

// ── 20b-3. Eigen doelenlijst samenstellen ───────────────────────────────────
console.log('20b-3. Eigen doelenlijst samenstellen');
const volgende = () => page.getByRole('button', { name: /^Volgende/ });
// De knoppen van de wizard zijn "aria-disabled" (niet "disabled"): zo blijven ze vindbaar en leggen ze uit waarom niet.
const geblokkeerd = async (knop) => (await knop.getAttribute('aria-disabled')) === 'true';
const samVoor = await page.evaluate(() => localStorage.getItem('wf.curricula.v1'));
const samLijsten = () => page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').filter((c) => c.herkomst?.methode === 'samengesteld'));
const samKop = async () => (await page.locator('h2.il-stapkop').innerText()).trim();
const samTotaal = async () => (await page.locator('.sam-totaal').innerText()).trim();

// Ingangen: wegwijzer, intro van de minimumdoelen, setpaneel en STEM-uitleg
await go('/#/leerplannen');
check('wegwijzer: vier wegen, met "Zelf doelen samenstellen" erbij', (await page.locator('details.lw .lw-weg').count()) === 4 && (await page.locator('details.lw a[href="#/leerplannen/samenstellen"]').count()) === 1);
check('wegwijzer: de zin bij "Zelf doelen samenstellen" en de keuzehulp noemen basisgeletterdheid en de STEM-set', /Kies hele sets of losse doelen uit de officiële minimumdoelen, bv\. voor basisgeletterdheid of de doelen van jouw vak uit de STEM-set\./.test(await page.locator('details.lw a[href="#/leerplannen/samenstellen"]').innerText()) && /Kies ‘Zelf doelen samenstellen’/.test(await page.locator('details.lw .lw-keuzehulp').innerText()));
await go('/#/leerplannen/minimumdoelen/ODS_3283');
await page.waitForSelector('.md-stem', { timeout: 15000 });
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('pagina Officiële minimumdoelen: in de intro een link "Stel je eigen doelenlijst samen"', (await page.locator('.md-intro a[href="#/leerplannen/samenstellen"]', { hasText: 'Stel je eigen doelenlijst samen' }).count()) === 1);
check('de STEM-uitleg zegt "Wil je alleen de doelen van je vak? Kies ze uit deze set." met een link', /Wil je alleen de doelen van je vak\? Kies ze uit deze set\./.test(await page.locator('.md-stem').innerText()) && (await page.locator('.md-stem a[href="#/leerplannen/samenstellen?sets=ODS_3283"]').count()) === 1);
check('het setpaneel heeft "Kies doelen uit deze set"', (await page.locator('.md-acties a[href="#/leerplannen/samenstellen?sets=ODS_3283"]', { hasText: 'Kies doelen uit deze set' }).count()) === 1);

// Het scherm: één main en één h1, "Volgende" zonder set zegt wat ontbreekt
await go('/#/leerplannen/samenstellen');
await page.waitForSelector('.sam-sets > li', { timeout: 15000 });
check('samenstellen: één main en één h1 "Stel je eigen doelenlijst samen"', (await page.locator('main').count()) === 1 && (await page.locator('main h1').count()) === 1 && /^Stel je eigen doelenlijst samen$/.test(await page.locator('main h1').innerText()));
check('samenstellen: korte uitleg dat de doelen letterlijk blijven en de lijst meteen nagekeken is', /letterlijk zoals in de officiële bron, dus je lijst is meteen nagekeken/.test(await page.locator('.il-intro').innerText()) && (await page.getByRole('link', { name: /Leerplannen/ }).first().isVisible()));
check('stap 1: stapaanduiding "Stap 1 van 3: Sets kiezen"', (await samKop()) === 'Stap 1 van 3: Sets kiezen' && (await page.locator('ol.il-stappen li').count()) === 3 && (await page.locator('ol.il-stappen li[aria-current="step"]').count()) === 1);
check('stap 1: zonder set is "Volgende" geblokkeerd en zegt de pagina wat ontbreekt', (await geblokkeerd(volgende())) && /^Nog nodig: kies minstens één set\.$/.test((await page.locator('#il-ontbreekt').innerText()).trim()) && /^Nog geen sets gekozen$/.test((await page.locator('.sam-gekozen .sam-teller').innerText()).trim()));
await volgende().click({ force: true });
await sleep(200);
check('stap 1: "Volgende" zonder set blijft in stap 1 en zet de focus op het zoekveld', (await samKop()) === 'Stap 1 van 3: Sets kiezen' && (await page.evaluate(() => document.activeElement?.id)) === 'sam-zoek');

// Zoeken, filteren en de drie A-stroomsets van basisgeletterdheid kiezen
check('stap 1: het aantal gevonden sets staat in een aria-live-zone', (await page.locator('.sam-teller[aria-live="polite"]').count()) >= 2);
await page.fill('#sam-zoek', 'basisgeletterdheid');
await page.getByLabel('Graad', { exact: true }).selectOption('1ste graad');
await page.getByLabel('Soort onderwijs', { exact: true }).selectOption('so');
await sleep(300);
const samRij = (re) => page.locator('.sam-set').filter({ hasText: re }).filter({ hasText: /A-stroom/ });
check('stap 1: zoeken op "basisgeletterdheid" in de 1ste graad vindt de sets, zonder oude versies', (await page.locator('.sam-sets > li').count()) === 6 && !(await page.locator('.sam-sets').innerText()).includes('(oude versie)') && /oude versies? verborgen/.test(await page.locator('.sam-oud-hint').innerText()));
await page.getByLabel('Toon ook oude versies die niet meer gelden').check();
await sleep(300);
check('… en met het vinkje staan de oude versies er ook, met "(oude versie)" achter de naam', (await page.locator('.sam-sets > li').count()) > 6 && (await page.locator('.sam-sets').innerText()).includes('(oude versie)'));
await page.getByLabel('Toon ook oude versies die niet meer gelden').uncheck();
await sleep(300);
for (const re of [/Nederlands/, /STEM/, /Digitale competenties/]) await samRij(re).locator('input').check();
await sleep(200);
check('stap 1: de gekozen sets staan bovenaan in volgorde van kiezen, met de teller "3 sets gekozen"', (await page.locator('.sam-chip').count()) === 3 && /^3 sets gekozen$/.test((await page.locator('.sam-gekozen .sam-teller').innerText()).trim()) && /^Nederlands/.test(await page.locator('.sam-chip').first().innerText()));
check('stap 1: elke set heeft een echt label en een selectievakje', (await page.locator('.sam-set input[type=checkbox]').count()) === 6 && (await page.locator('.sam-set input:checked').count()) === 3);
await page.getByRole('button', { name: /^Haal Digitale competenties/ }).click();
await sleep(200);
check('stap 1: een set weghalen kan met de knop bij de gekozen set; de focus blijft in de pagina', (await page.locator('.sam-chip').count()) === 2 && /^2 sets gekozen$/.test((await page.locator('.sam-gekozen .sam-teller').innerText()).trim()) && (await page.evaluate(() => document.activeElement?.closest('.sam-gekozen') !== null)));
await samRij(/Digitale competenties/).locator('input').check();
await sleep(200);

// Stap 2: 10 doelen uit 3 sets
await volgende().click();
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
check('stap 2: de focus staat op de kop "Stap 2 van 3: Doelen kiezen"', (await samKop()) === 'Stap 2 van 3: Doelen kiezen' && (await page.evaluate(() => document.activeElement === document.querySelector('h2.il-stapkop'))));
check('stap 2: "Je koos 10 doelen uit 3 sets." in een aria-live-zone', (await samTotaal()) === 'Je koos 10 doelen uit 3 sets.' && (await page.locator('.sam-totaal[aria-live="polite"]').count()) === 1);
check('stap 2: een blok per set, helemaal aangevinkt, met "3 van 3 gekozen"', (await page.locator('.sam-blok').count()) === 3 && (await page.locator('.sam-hele input:checked').count()) === 3 && /3 van 3 gekozen/.test(await page.locator('.sam-telling').first().innerText()) && (await page.locator('.sam-doel input:checked').count()) === 10);
check('stap 2: bij de STEM-set staat dat de bron de doelen niet per vak indeelt', (await page.locator('.sam-blok', { hasText: 'STEM' }).locator('.sam-stem', { hasText: 'De bron deelt de doelen van deze set niet per vak in' }).count()) === 1);
check('stap 2: de doelen hebben een echt label met code en letterlijke tekst', (await page.locator('label.sam-doel .sam-doel-code', { hasText: 'BG02.01' }).count()) === 1 && /^De leerling/.test((await page.locator('.sam-doel-zin').first().innerText()).trim()));
// Op de tekst klikken vinkt het doel uit; de set krijgt de toestand "een deel"
await page.locator('.sam-blok').first().locator('.sam-doel-zin').first().click();
await sleep(200);
const samHeleEerste = page.locator('.sam-blok').first().locator('.sam-hele input');
check('stap 2: een doel uitvinken door op de tekst te klikken: "2 van 3 gekozen", "Hele set" half (indeterminate), totaal 9', /2 van 3 gekozen/.test(await page.locator('.sam-telling').first().innerText()) && (await samHeleEerste.evaluate((e) => e.indeterminate)) === true && !(await samHeleEerste.isChecked()) && (await samTotaal()) === 'Je koos 9 doelen uit 3 sets.');
await samHeleEerste.click();
await sleep(200);
check('stap 2: een klik op "Hele set" als maar een deel gekozen is, vinkt alles aan (3 van 3, totaal 10)', /3 van 3 gekozen/.test(await page.locator('.sam-telling').first().innerText()) && (await samHeleEerste.isChecked()) && (await samHeleEerste.evaluate((e) => e.indeterminate)) === false && (await samTotaal()) === 'Je koos 10 doelen uit 3 sets.');
await samHeleEerste.uncheck();
await sleep(200);
check('stap 2: "Hele set" uitvinken geeft 0 van 3 en vinkt alle doelen van de set uit', /0 van 3 gekozen/.test(await page.locator('.sam-telling').first().innerText()) && (await page.locator('.sam-blok').first().locator('.sam-doel input:checked').count()) === 0 && (await samTotaal()) === 'Je koos 7 doelen uit 2 sets.');
await samHeleEerste.check();
await sleep(200);
check('stap 2: "Hele set" aanvinken vinkt ze weer allemaal aan', /3 van 3 gekozen/.test(await page.locator('.sam-telling').first().innerText()) && (await samHeleEerste.isChecked()) && (await samHeleEerste.evaluate((e) => e.indeterminate)) === false && (await samTotaal()) === 'Je koos 10 doelen uit 3 sets.');
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: stap 2 scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });

// Stap 3: naam en bewaren
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
await sleep(300);
check('stap 3: de kop, het voorstel voor de naam en het vak (niet verplicht)', (await samKop()) === 'Stap 3 van 3: Naam en bewaren' && (await page.inputValue('#sam-titel')) === 'Basisgeletterdheid · 1ste graad A-stroom' && (await page.inputValue('#sam-vak')) === '' && (await page.locator('label[for="sam-vak"]').innerText()).trim() === 'Vak');
check('stap 3: het overzicht toont de 10 doelen, per set gegroepeerd, en zegt dat de lijst meteen nagekeken is', (await page.locator('.dl-rij').count()) === 10 && (await page.locator('.dl-rubriek').count()) === 3 && /meteen nagekeken/.test(await page.locator('.sam-nagekeken').innerText()));
await page.fill('#sam-titel', '');
check('stap 3: zonder naam is "Bewaar de lijst" geblokkeerd en zegt de pagina wat ontbreekt', (await geblokkeerd(page.getByRole('button', { name: 'Bewaar de lijst' }))) && /^Nog nodig: geef de lijst een naam\.$/.test((await page.locator('#il-ontbreekt').innerText()).trim()));
await page.getByRole('button', { name: 'Bewaar de lijst' }).click({ force: true });
await sleep(200);
check('stap 3: "Bewaar de lijst" zonder naam zet de focus op het naamveld en bewaart niets', (await page.evaluate(() => document.activeElement?.id)) === 'sam-titel' && (await samLijsten()).length === 0);
await page.getByRole('button', { name: /^Gebruik het voorstel/ }).click();
check('stap 3: "Gebruik het voorstel" zet de naam terug', (await page.inputValue('#sam-titel')) === 'Basisgeletterdheid · 1ste graad A-stroom');
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: stap 3 scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });
await page.getByRole('button', { name: 'Bewaar de lijst' }).click();
await page.waitForSelector('text=/Dit leerplan staat op slot/', { timeout: 10000 });
check('bewaren: een toast "Lijst bewaard: … (10 doelen, nagekeken)"', /Lijst bewaard: Basisgeletterdheid · 1ste graad A-stroom \(10 doelen, nagekeken\)/.test(await page.locator('.toast-stack').innerText()));
check('bewaren: de lijst opent bij Leerplannen, nagekeken, met 10 doelen en het label "Officiële doelen, zelf gekozen"', /#\/leerplannen/.test(page.url()) && !/open=/.test(page.url()) && await page.locator('main .badge', { hasText: /^Nagekeken$/ }).isVisible() && await page.locator('main .badge', { hasText: /^Officiële doelen, zelf gekozen$/ }).isVisible() && (await page.locator('.dl-rij').count()) === 10 && (await page.locator('.dl-ref').count()) === 0);
check('een samengestelde lijst is vrij te delen (geen deel-hint) en heeft "Keuze aanpassen" naast "Eigen kopie maken"', (await page.locator('.lp-deelhint').count()) === 0 && await page.getByRole('link', { name: 'Keuze aanpassen' }).isVisible() && await page.getByRole('button', { name: 'Eigen kopie maken' }).isVisible());
const samEerste = await samLijsten();
check('opgeslagen: één samengestelde lijst, nagekeken, 10 doelen, drie sets, elk doel met één verwijzing', samEerste.length === 1 && samEerste[0].controle?.status === 'gecontroleerd' && samEerste[0].goals.length === 10 && samEerste[0].minimumdoelenSets?.length === 3 && samEerste[0].goals.every((g) => g.refs?.length === 1) && samEerste[0].kind === 'leerplan');
const samId = samEerste[0]?.id;
await page.getByRole('button', { name: /Alle leerplannen/ }).click();
await sleep(300);
const samKaart = page.locator('article.mat-card', { hasText: 'Basisgeletterdheid' });
check('de kaart bij Leerplannen: Nagekeken, 10 doelen en het label "Officiële doelen, zelf gekozen"', (await samKaart.count()) === 1 && await samKaart.locator('.badge', { hasText: /^Nagekeken$/ }).isVisible() && await samKaart.locator('.badge', { hasText: /^Officiële doelen, zelf gekozen$/ }).isVisible() && /10 doelen/.test(await samKaart.innerText()));

// Keuze aanpassen: stap 2 met dezelfde keuze, één doel uitvinken, bewaren: 9 doelen en geen tweede lijst
await samKaart.getByRole('button', { name: /Bekijken/ }).click();
await page.getByRole('link', { name: 'Keuze aanpassen' }).click();
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
check('aanpassen: /leerplannen/samenstellen/<id>, h1 "Doelenlijst aanpassen", begint bij stap 2 met dezelfde keuze', page.url().endsWith(`#/leerplannen/samenstellen/${samId}`) && /^Doelenlijst aanpassen$/.test(await page.locator('main h1').innerText()) && (await samKop()) === 'Stap 2 van 3: Doelen kiezen' && (await samTotaal()) === 'Je koos 10 doelen uit 3 sets.' && (await page.locator('.sam-hele input:checked').count()) === 3);
check('aanpassen: een nagekeken lijst krijgt geen waarschuwing over eigen aanpassingen', (await page.locator('.sam-gewijzigd').count()) === 0);
await page.locator('.sam-blok').nth(1).locator('.sam-doel input').first().uncheck();
await sleep(200);
check('aanpassen: één doel uitvinken geeft 9 doelen', (await samTotaal()) === 'Je koos 9 doelen uit 3 sets.');
await page.getByRole('button', { name: /^Terug/ }).click();
await sleep(200);
check('aanpassen: een stap terug bewaart de keuze (stap 1 toont nog 3 gekozen sets)', (await samKop()) === 'Stap 1 van 3: Sets kiezen' && /^3 sets gekozen$/.test((await page.locator('.sam-gekozen .sam-teller').innerText()).trim()));
await volgende().click();
await sleep(300);
check('aanpassen: weer vooruit toont nog steeds 9 doelen', (await samTotaal()) === 'Je koos 9 doelen uit 3 sets.');
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
check('aanpassen: stap 3 toont de bewaarde naam', (await page.inputValue('#sam-titel')) === 'Basisgeletterdheid · 1ste graad A-stroom' && (await page.locator('.dl-rij').count()) === 9);
await page.getByRole('button', { name: 'Bewaar de lijst' }).click();
await page.waitForSelector('text=/Dit leerplan staat op slot/', { timeout: 10000 });
const samTweede = await samLijsten();
check('aanpassen: bewaren geeft 9 doelen, nog steeds nagekeken, zelfde id en geen tweede lijst', samTweede.length === 1 && samTweede[0].id === samId && samTweede[0].goals.length === 9 && samTweede[0].controle?.status === 'gecontroleerd' && (await page.locator('.dl-rij').count()) === 9 && (await page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').length)) === JSON.parse(samVoor || '[]').length + 1);

// Een eigen aanpassing in de doelen: de pagina waarschuwt dat die verloren gaat
await page.evaluate((id) => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const c = lijst.find((x) => x.id === id);
  c.goals[0].text += ' (aangepast)';
  localStorage.setItem('wf.curricula.v1', JSON.stringify(lijst));
}, samId);
await go(`/#/leerplannen/samenstellen/${samId}`);
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
check('aanpassen: bij een lijst die gewijzigd is na het nakijken staat bovenaan een waarschuwing dat eigen aanpassingen verloren gaan', /eigen aanpassingen verloren/.test(await page.locator('.sam-gewijzigd[role="note"]').innerText()));
await page.evaluate((id) => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const c = lijst.find((x) => x.id === id);
  c.goals[0].text = c.goals[0].text.replace(' (aangepast)', '');
  localStorage.setItem('wf.curricula.v1', JSON.stringify(lijst));
}, samId);

// Een eigen kopie, een ander leerplan en een lijst die niet bestaat: een duidelijke melding en een link terug
await go(`/#/leerplannen?open=${samId}`);
await page.getByRole('button', { name: 'Eigen kopie maken' }).click();
await sleep(500);
check('een eigen kopie van een samengestelde lijst heet "Kopie van officiële doelen, zelf gekozen" en heeft geen "Keuze aanpassen"', await page.locator('main .badge', { hasText: /^Kopie van officiële doelen, zelf gekozen$/ }).isVisible() && (await page.getByRole('link', { name: 'Keuze aanpassen' }).count()) === 0);
const samKopieId = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').find((c) => c.kind === 'eigen' && c.herkomst?.methode === 'samengesteld')?.id);
await go(`/#/leerplannen/samenstellen/${samKopieId}`);
check('aanpassen van een eigen kopie: een melding en geen wizard', /is een eigen kopie/.test(await page.locator('.callout[role="alert"]').innerText()) && (await page.locator('h2.il-stapkop').count()) === 0 && /^Doelenlijst aanpassen$/.test(await page.locator('main h1').innerText()) && await page.getByRole('link', { name: /Terug naar het leerplan/ }).last().isVisible());
const samVoorbeeldId = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').find((c) => c.example)?.id);
await go(`/#/leerplannen/samenstellen/${samVoorbeeldId}`);
check('aanpassen van een leerplan dat niet samengesteld is: een melding en een link terug', /niet zelf samengesteld/.test(await page.locator('.callout[role="alert"]').innerText()) && (await page.locator('h2.il-stapkop').count()) === 0);
await go('/#/leerplannen/samenstellen/bestaat-niet');
check('aanpassen van een lijst die niet bestaat: "werd niet gevonden" met een link naar de leerplannen', /werd niet gevonden/.test(await page.locator('.callout[role="alert"]').innerText()) && await page.getByRole('link', { name: /Naar de leerplannen/ }).isVisible() && (await page.locator('main h1').count()) === 1);
await go(`/#/leerplannen/inlezen/${samId}`);
check('de inleeswizard zegt bij een samengestelde lijst dat er niets in te lezen valt en wijst naar "Keuze aanpassen"', /Er valt niets in te lezen/.test(await page.locator('.callout[role="note"]').innerText()) && await page.getByRole('link', { name: 'Keuze aanpassen' }).isVisible());

// Vanuit de minimumdoelen: alleen de natuurwetenschappen uit de STEM-set (ODS_3283)
await go('/#/leerplannen/minimumdoelen/ODS_3283');
await page.waitForSelector('.dl-rij', { timeout: 15000 });
await page.getByRole('link', { name: 'Kies doelen uit deze set' }).click();
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
check('vanuit de set: /leerplannen/samenstellen?sets=ODS_3283 begint bij stap 2 met de STEM-set helemaal aangevinkt', /#\/leerplannen\/samenstellen\?sets=ODS_3283$/.test(page.url()) && (await samKop()) === 'Stap 2 van 3: Doelen kiezen' && (await page.locator('.sam-blok').count()) === 1 && (await samTotaal()) === 'Je koos 44 doelen uit 1 set.');
const samStemHele = page.locator('.sam-hele input');
await samStemHele.uncheck();
await sleep(200);
check('vanuit de set: "Hele set" uitvinken geeft "Je koos nog geen doelen." en "Volgende" zegt wat ontbreekt', (await samTotaal()) === 'Je koos nog geen doelen.' && (await geblokkeerd(volgende())) && /^Nog nodig: kies minstens één doel\.$/.test((await page.locator('#il-ontbreekt').innerText()).trim()));
await volgende().click({ force: true });
await sleep(200);
check('vanuit de set: "Volgende" zonder doel blijft in stap 2 en zet de focus op het zoekveld', (await samKop()) === 'Stap 2 van 3: Doelen kiezen' && (await page.evaluate(() => document.activeElement?.id)) === 'sam-doelzoek');
check('de knoppen voor gevonden doelen zijn uit zolang er niet gezocht is', await page.getByRole('button', { name: 'Vink de gevonden doelen aan' }).isDisabled() && await page.getByRole('button', { name: 'Vink de gevonden doelen uit' }).isDisabled());
await page.fill('#sam-doelzoek', 'energie');
await sleep(300);
const samGevondenTekst = (await page.locator('.sam-doelzoek .sam-teller').innerText()).trim();
const samGevonden = Number((/^(\d+) doelen? gevonden$/.exec(samGevondenTekst) ?? [])[1]);
check(`zoeken op "energie" over de gekozen sets toont het aantal gevonden doelen (${samGevonden}) en alleen die doelen`, samGevonden > 0 && samGevonden < 44 && (await page.locator('.sam-doel').count()) === samGevonden);
await page.getByRole('button', { name: 'Vink de gevonden doelen aan' }).click();
await sleep(200);
check('"Vink de gevonden doelen aan" kiest precies de gevonden doelen', (await samTotaal()) === `Je koos ${samGevonden} doelen uit 1 set.` && (await page.locator('.sam-doel input:checked').count()) === samGevonden && (await samStemHele.evaluate((e) => e.indeterminate)) === true);
await page.getByRole('button', { name: 'Vink de gevonden doelen uit' }).click();
await sleep(200);
check('"Vink de gevonden doelen uit" vinkt ze weer uit', (await samTotaal()) === 'Je koos nog geen doelen.');
await page.getByRole('button', { name: 'Vink de gevonden doelen aan' }).click();
await sleep(200);
await page.fill('#sam-doelzoek', 'zzgeenwoord');
await sleep(200);
check('zoeken zonder resultaat zegt het en laat de keuze ongemoeid', /Geen doelen gevonden/.test(await page.locator('.sam-doelzoek .sam-teller').innerText()) && /Geen doelen met ‘zzgeenwoord’/.test(await page.locator('.sam-blok').innerText()) && (await samTotaal()) === `Je koos ${samGevonden} doelen uit 1 set.`);
await page.fill('#sam-doelzoek', '');
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
check('stap 3 voor de STEM-set: een voorstel voor de naam en in het overzicht alleen de gekozen doelen', (await page.inputValue('#sam-titel')).trim().length > 0 && (await page.locator('.dl-rij').count()) === samGevonden);
await page.fill('#sam-titel', 'Natuurwetenschappen uit STEM');
await page.fill('#sam-vak', 'Natuurwetenschappen');
await page.getByRole('button', { name: 'Bewaar de lijst' }).click();
await page.waitForSelector('text=/Dit leerplan staat op slot/', { timeout: 10000 });
const samStemLijst = (await samLijsten()).find((c) => c.title === 'Natuurwetenschappen uit STEM');
check(`de lijst met de gevonden doelen is bewaard: ${samGevonden} doelen, nagekeken, vak "Natuurwetenschappen", naast de eerste lijst`, !!samStemLijst && samStemLijst.goals.length === samGevonden && samStemLijst.controle?.status === 'gecontroleerd' && samStemLijst.subject === 'Natuurwetenschappen' && (await samLijsten()).filter((c) => c.kind !== 'eigen').length === 2 && /Natuurwetenschappen uit STEM/.test(await page.locator('main h1').innerText()));

// Dezelfde code in twee gekozen sets (Nederlands in de A- en de B-stroom): de codes krijgen een onderscheid, ook in de codekolom
await go('/#/leerplannen/samenstellen?sets=ODS_3343,ODS_3351');
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
const samCodes = (await page.locator('.dl-code').allInnerTexts()).map((t) => t.trim());
check('twee sets met dezelfde codes: "BG02.01 (A)" en "BG02.01 (B)", en een voorstel voor de naam zonder stroom', samCodes.includes('BG02.01 (A)') && samCodes.includes('BG02.01 (B)') && new Set(samCodes).size === samCodes.length && (await page.inputValue('#sam-titel')) === 'Basisgeletterdheid Nederlands · 1ste graad');
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: doelen met langere codes in stap 3 scrollen niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });

// Een set die niet meer geldt: een label in stap 2 en een waarschuwing in stap 3, maar bewaren kan
await go('/#/leerplannen/samenstellen?sets=ODS_2118');
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
check('een set die niet meer geldt (ODS_2118): in stap 2 het label "Niet meer geldig"', (await page.locator('.sam-blok .badge', { hasText: 'Niet meer geldig' }).count()) === 1);
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
check('… en in stap 3 een waarschuwing (role="note") dat de set niet meer geldt, zonder het bewaren te blokkeren', /geldt niet meer/.test(await page.locator('.sam-waarschuwing[role="note"]').innerText()) && !(await geblokkeerd(page.getByRole('button', { name: 'Bewaar de lijst' }))));

// Een set uit de link die niet bestaat, en 390 px voor stap 1
await go('/#/leerplannen/samenstellen?sets=ODS_999999');
await page.waitForSelector('.sam-sets > li', { timeout: 15000 });
check('een set uit de link die niet bestaat wordt overgeslagen, met een melding, en de wizard begint bij stap 1', (await samKop()) === 'Stap 1 van 3: Sets kiezen' && /bestaat niet/.test(await page.locator('.callout[role="note"]').innerText()));
await page.setViewportSize({ width: 390, height: 844 });
await go('/#/leerplannen/samenstellen');
await page.waitForSelector('.sam-sets > li', { timeout: 15000 });
check('390 px: stap 1 scrollt niet horizontaal', await passtOpSmal());
await page.fill('#sam-zoek', 'basisgeletterdheid');
await page.getByLabel('Graad', { exact: true }).selectOption('1ste graad');
await sleep(300);
await page.locator('.sam-set').filter({ hasText: /STEM/ }).filter({ hasText: /A-stroom/ }).first().locator('input').check();
check('390 px: stap 1 met een gekozen set scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });
// Terug zoals het was, zodat de volgende onderdelen niets merken
await page.evaluate((v) => { if (v === null) localStorage.removeItem('wf.curricula.v1'); else localStorage.setItem('wf.curricula.v1', v); }, samVoor);

// ── 20c. Leerplan inlezen: de wizard in vier stappen ────────────────────────
console.log('20c. Leerplan inlezen');
const wizardVoor = await page.evaluate(() => ({ lijst: localStorage.getItem('wf.curricula.v1'), naam: localStorage.getItem('wf.nakijker.naam') }));
// NAGEMAAKTE tekst in de opmaak van een leerplan: geen echte leerplantekst (auteursrecht).
// De verwijzingen wijzen naar de echte set ODS_3287 (1ste graad A-stroom, ruimtelijk bewustzijn).
const WIZARD_TEKST = [
  'Testleerplan aardrijkskunde (nagemaakt, geen echt leerplan)',
  '',
  'Ruimte en kaarten',
  'LPD 1 De leerlingen situeren plaatsen op een kaart met behulp van een legende en een schaal. (MD 09.01)',
  'LPD 2 De leerlingen verklaren het verschil tussen absolute en relatieve ligging van een plaats. (MD 09.02, 09.03)',
  'LPD 3 De leerlingen vergelijken landschappen in verschillende werelddelen met elkaar. (MD 09.07)',
].join('\n');
const wizKop = async () => (await page.locator('h2.il-stapkop').innerText()).trim();
const wachtOpSamenvatting = () => page.waitForFunction(() => /letterlijk/.test(document.querySelector('.il-samenvatting-tekst')?.textContent || ''), null, { timeout: 15000 });
const wachtOpBevestigen = () => page.waitForFunction(() => document.querySelector('button.il-bevestig')?.getAttribute('aria-disabled') === null, null, { timeout: 8000 });

// Ingang: de knop in de kop en de wegwijzer, niet meer "Uit tekst of pdf"
await go('/#/leerplannen');
check('leerplannenpagina: knop "Leerplan inlezen" (en niet meer "Uit tekst of pdf")', (await page.getByRole('link', { name: /^Leerplan inlezen$/ }).count()) >= 1 && (await page.getByRole('button', { name: /Uit tekst of pdf/ }).count()) === 0);
check('wegwijzer: "Leerplan van je net inlezen" gaat naar de wizard', (await page.locator('details.lw a[href="#/leerplannen/inlezen"]').count()) === 1);
await page.getByRole('link', { name: /^Leerplan inlezen$/ }).first().click();
await page.waitForSelector('h2.il-stapkop');
check('wizard: /leerplannen/inlezen, één main en één h1 "Leerplan inlezen"', /#\/leerplannen\/inlezen$/.test(page.url()) && (await page.locator('main').count()) === 1 && (await page.locator('main h1').count()) === 1 && /^Leerplan inlezen$/.test(await page.locator('main h1').innerText()));
check('wizard: stappenaanduiding "Stap 1 van 4: Welk leerplan?"', (await wizKop()) === 'Stap 1 van 4: Welk leerplan?' && (await page.locator('ol.il-stappen li[aria-current="step"]').count()) === 1);
check('wizard: inklapbaar "Hoe werkt inlezen?" met vier stappen, standaard dicht', (await page.locator('details.il-hoe summary', { hasText: 'Hoe werkt inlezen?' }).count()) === 1 && (await page.locator('details.il-hoe li').count()) === 4 && (await page.evaluate(() => document.querySelector('details.il-hoe').open)) === false);
check('stap 1: het veld heet "Stroom (alleen 1ste graad)"', (await page.locator('.field', { has: page.locator('#il-stroom') }).locator('label').innerText()).trim() === 'Stroom (alleen 1ste graad)');

// Stap 1: zolang het nodige ontbreekt, kan je niet verder, en de pagina zegt wat er ontbreekt
check('stap 1: volgende is geblokkeerd en zegt wat ontbreekt', (await geblokkeerd(volgende())) && /Nog nodig: kies een net, vul het vak in/.test(await page.locator('#il-ontbreekt').innerText()));
// Een geblokkeerde knop vervaagt niet (geen opacity): gestippelde rand, en tekst die leesbaar blijft, ook in het donker.
const contrastVan = (sel) => page.evaluate((q) => {
  const cs = getComputedStyle(document.querySelector(q));
  const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const a = lum(rgb(cs.color)); const b = lum(rgb(cs.backgroundColor));
  return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), opacity: cs.opacity, rand: cs.borderStyle };
}, sel);
const geblokkeerdLicht = await contrastVan('.il-volgende');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await sleep(150);
const geblokkeerdDonker = await contrastVan('.il-volgende');
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
await sleep(150);
check(`een geblokkeerde knop: geen opacity, gestippelde rand en tekstcontrast minstens 4,5 : 1 (licht ${geblokkeerdLicht.ratio.toFixed(1)}, donker ${geblokkeerdDonker.ratio.toFixed(1)})`, [geblokkeerdLicht, geblokkeerdDonker].every((m) => m.opacity === '1' && m.rand === 'dashed' && m.ratio >= 4.5));
await volgende().click({ force: true });
await sleep(200);
check('stap 1: een klik op het geblokkeerde knop wijst het eerste ontbrekende veld aan', (await page.evaluate(() => document.activeElement?.id)) === 'il-net' && /Stap 1 van 4/.test(await wizKop()));
await page.selectOption('#il-net', 'kov');
await page.fill('#il-vak', 'Aardrijkskunde');
check('stap 1: de titel wordt voorgesteld uit de rest', (await page.inputValue('#il-titel')) === 'Aardrijkskunde (KOV)');
await page.selectOption('#il-graad', '1ste graad');
await page.selectOption('#il-stroom', 'A-stroom');
await page.fill('#il-code', 'I-Aar-a');
await page.fill('#il-versie', '2024');
const wizTitel = 'Aardrijkskunde 1ste graad A-stroom (KOV I-Aar-a)';
check('stap 1: de voorgestelde titel volgt graad, stroom en leerplancode', (await page.inputValue('#il-titel')) === wizTitel);
check('stap 1: hulp voor het net en een link naar de minimumdoelen', (await page.locator('details.il-hulp .lw-links a[target="_blank"]').count()) === 4 && (await page.locator('a[href="#/leerplannen/minimumdoelen"]').count()) >= 1);
check('stap 1: soort onderwijs staat standaard op gewoon secundair', (await page.inputValue('#il-onderwijs')) === 'so');
check('stap 1: volgende kan nu', !(await geblokkeerd(volgende())));
await volgende().click();
await sleep(300);

// Stap 2: de bron (geplakte tekst)
check('stap 2: de focus gaat naar de kop van de nieuwe stap', (await wizKop()) === 'Stap 2 van 4: De bron' && (await page.evaluate(() => document.activeElement?.tagName === 'H2')));
check('stap 2: volgende is geblokkeerd tot er doelen gevonden zijn', (await geblokkeerd(volgende())) && /Nog nodig: lees een pdf in/.test(await page.locator('#il-ontbreekt').innerText()));
check('stap 2: pdf is aanbevolen en staat voorop', await page.locator('.il-keuze', { hasText: 'Aanbevolen' }).locator('input').isChecked());
await page.locator('input[name="il-methode"]').nth(1).check();
await page.fill('#il-tekst', WIZARD_TEKST);
await page.getByRole('button', { name: 'Doelen zoeken' }).click();
await page.waitForSelector('.il-preview');
const gevondenTekst = await page.locator('.il-resultaat').innerText();
check('stap 2: 3 doelen gevonden met het herkende patroon in gewone taal', /3 doelen gevonden/.test(gevondenTekst) && /Herkend: genummerde doelen zoals LPD 1/.test(gevondenTekst) && !/LPD-nummers/.test(gevondenTekst));
check('stap 2: de verwijzingen worden geteld; de regel over kop- en voetregels staat er niet bij 0', /3 doelen met een verwijzing naar minimumdoelen/.test(gevondenTekst) && !/Bladzijdenummers en koppen overgeslagen/.test(gevondenTekst) && !/kop- en voetregels/.test(gevondenTekst));
check('stap 2: voorvertoning met code, tekst, rubriek en verwijzing', (await page.locator('.il-preview > li').count()) === 3 && /Verwijzing: MD 09\.02, 09\.03/.test(gevondenTekst) && /Rubriek: Ruimte en kaarten/.test(gevondenTekst));
check('stap 2: volgende kan nu', !(await geblokkeerd(volgende())));
await volgende().click();

// Stap 3: de sets
await page.waitForSelector('.il-sets', { timeout: 30000 });
await sleep(300);
check('stap 3: stapkop en verwijzingen uit de bron geteld', (await wizKop()) === 'Stap 3 van 4: Minimumdoelen koppelen' && /4 verwijzingen/.test(await page.locator('.il-stap-inhoud').innerText()));
const setMd = page.locator('.il-set', { hasText: 'ODS_3287' });
check('stap 3: de set ODS_3287 staat er met "4 van je verwijzingen" en is vooraf aangevinkt', (await setMd.count()) === 1 && /4 van je verwijzingen/.test(await setMd.innerText()) && !/treffer/.test(await setMd.innerText()) && (await setMd.locator('input').isChecked()));
const setOud = page.locator('.il-set', { hasText: 'ODS_2447' });
// Kent de index de geldigheid (pull request #3), dan stelt de wizard de oude versie niet eens voor; anders staat ze erbij, niet aangevinkt.
const oudeAanwezig = (await setOud.count()) === 1;
const setUitleg = await page.locator('.il-setuitleg').innerText();
check('stap 3: de zin rekent uit wat aangevinkt staat', oudeAanwezig
  ? /Je verwijzingen staan in 2 sets\. De set die nu geldt, staat aangevinkt; de oude versie niet\. Klopt dat\? Klik dan op Volgende\./.test(setUitleg)
  : /Je verwijzingen staan in 1 set\. Die set staat aangevinkt\. Klopt dat\? Klik dan op Volgende\./.test(setUitleg));
if (oudeAanwezig) {
  check('stap 3: een oude versie (niet meer geldig) staat niet vooraf aangevinkt en heet "(oude versie)"', !(await setOud.locator('input').isChecked()) && /\(oude versie\)/.test(await setOud.innerText()));
  await setOud.locator('input').check();
  check('stap 3: vinkt de leerkracht de oude versie ook aan, dan zegt de zin dat ze allebei aanstaan', /Ze staan allemaal aangevinkt\./.test(await page.locator('.il-setuitleg').innerText()));
  await setOud.locator('input').uncheck();
}
check('stap 3: bij één stroom (A) geen melding over twee stromen', (await page.locator('.il-stroommelding').count()) === 0);
check('stap 3: andere sets toevoegen kan met een zoekveld', await page.locator('#il-setzoek').isVisible());
await page.fill('#il-setzoek', 'duurzaamheid 3288');
await sleep(200);
check('stap 3: het zoekveld vindt een set uit de lijst en laat ze aanvinken', (await page.locator('.il-zoekresultaten > li').count()) === 1 && (await page.getByRole('button', { name: /^Aanvinken/ }).count()) === 1);
await page.getByRole('button', { name: /^Aanvinken/ }).click();
check('stap 3: de aangevinkte set staat aangevinkt in de lijst', await page.locator('.il-set', { hasText: 'ODS_3288' }).locator('input').isChecked());
await page.locator('.il-set', { hasText: 'ODS_3288' }).locator('input').uncheck();
await page.fill('#il-setzoek', 'ruimtelijk 3303');
await sleep(200);
check('stap 3: het zoekveld vindt een set die niet in de lijst staat en laat ze toevoegen', (await page.locator('.il-zoekresultaten > li').count()) === 1 && (await page.getByRole('button', { name: /^Toevoegen/ }).count()) === 1);
await page.getByRole('button', { name: /^Toevoegen/ }).click();
await page.waitForSelector('.il-set:has-text("ODS_3303")');
check('stap 3: een toegevoegde set staat aangevinkt in de lijst', await page.locator('.il-set', { hasText: 'ODS_3303' }).locator('input').isChecked());
await page.locator('.il-set', { hasText: 'ODS_3303' }).locator('input').uncheck();
await page.fill('#il-setzoek', 'ruimtelijk 2467');
await sleep(200);
await page.getByRole('button', { name: /^Toevoegen/ }).click();
await page.waitForSelector('.il-set:has-text("ODS_2467")');
check('stap 3: sets van de A- én de B-stroom aangevinkt: "Je leerplan is voor één stroom"', /Je leerplan is voor één stroom\. Vink de sets van de andere stroom af, of kies de stroom in stap 1\./.test(await page.locator('.il-stroommelding').innerText()));
await page.locator('.il-set', { hasText: 'ODS_2467' }).locator('input').uncheck();
await sleep(200);
check('stap 3: de melding verdwijnt als de andere stroom afgevinkt is', (await page.locator('.il-stroommelding').count()) === 0);
await volgende().click();

// Stap 4: nakijken
await wachtOpSamenvatting();
check('stap 4: samenvatting en tellers bovenaan', /3 van 3 doelen letterlijk, 4 van 4 verwijzingen in orde/.test(await page.locator('.il-samenvatting-tekst').innerText()) && (await page.locator('.il-tellers > div').count()) === 6);
check('stap 4: een kaart per doel, elk "Letterlijk in de bron"', (await page.locator('.il-doel').count()) === 3 && (await page.locator('.il-doel .badge-ok', { hasText: 'Letterlijk in de bron' }).count()) === 3);
check('stap 4: de verwijzingen zijn opgelost tot labels (met verwijderknop)', (await page.locator('.il-doel .dl-ref').count()) === 4 && (await page.getByRole('button', { name: 'Verwijzing 09.02 verwijderen' }).count()) === 1);
check('stap 4: "Bekijk in de bron" per doel', (await page.locator('.il-doel').first().locator('details.il-brondetails summary').count()) === 1);
check('stap 4: nog steeds één main en één h1', (await page.locator('main').count()) === 1 && (await page.locator('main h1').count()) === 1);
check('stap 4: de uitleg zegt dat Boosterz een doel te kort of te lang kan afbakenen (en niet "de lezer")', /Boosterz kan een doel te kort of te lang afgebakend hebben\. Vergelijk elke tekst met de bron en pas aan\./.test(await page.locator('.il-stap-inhoud > .il-uitleg').first().innerText()) && !/\blezer\b/.test(await page.locator('main').innerText()));
check('stap 4: bij het naamveld staat dat de naam ook bij een export hoort', /Je naam komt bij het leerplan, ook als je het exporteert\./.test(await page.locator('.il-naamveld').innerText()));
const bevestig = page.locator('button.il-bevestig');
check('stap 4: bevestigen is geblokkeerd en zegt precies waarom', (await geblokkeerd(bevestig)) && /Vul je naam in/.test(await page.locator('#il-redenen').innerText()) && /Vink aan dat je elk doel met de bron hebt vergeleken/.test(await page.locator('#il-redenen').innerText()));
await page.fill('#il-naam', 'Test Nakijker');
check('stap 4: met een naam alleen blijft bevestigen geblokkeerd zolang het vinkje niet aan staat', (await geblokkeerd(bevestig)) && !/Vul je naam in/.test(await page.locator('#il-redenen').innerText()) && /Vink aan/.test(await page.locator('#il-redenen').innerText()));
await bevestig.click({ force: true });
await sleep(400);
check('stap 4: een klik op het geblokkeerde knop bewaart niets', /#\/leerplannen\/inlezen$/.test(page.url()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').some((c) => c.title.startsWith('Aardrijkskunde 1ste graad')))) === false);

// Een doel waarvan je de tekst wijzigt, wordt "Niet letterlijk gevonden"
const doel1 = page.getByRole('textbox', { name: 'Tekst van doel 1' });
const doel1Origineel = await doel1.inputValue();
await doel1.fill(`${doel1Origineel} (aangepast)`);
await page.waitForFunction(() => document.querySelectorAll('.il-doel .badge-err').length === 1, null, { timeout: 8000 });
check('een gewijzigd doel: "Niet letterlijk gevonden"', (await page.locator('.il-doel .badge', { hasText: 'Niet letterlijk gevonden' }).count()) === 1);
check('… onder "Los dit eerst op", met een link naar het doel', (await page.getByRole('heading', { name: /Los dit eerst op/ }).count()) === 1 && (await page.getByRole('button', { name: /^Ga naar LPD 1/ }).count()) === 1 && (await page.getByText('Moet opgelost').count()) === 0);
await page.getByLabel('Ik heb elk doel met de bron vergeleken').check();
await sleep(200);
check('… en bevestigen is geblokkeerd met de reden', (await geblokkeerd(bevestig)) && /Los eerst 1 punt op \(zie ‘Los dit eerst op’\)\./.test(await page.locator('#il-redenen').innerText()));
await doel1.fill(doel1Origineel);
await page.waitForFunction(() => document.querySelectorAll('.il-doel .badge-err').length === 0, null, { timeout: 8000 });
await wachtOpBevestigen();
check('na herstel van de tekst kan bevestigen weer', !(await geblokkeerd(bevestig)));

// Smal scherm (390 px): elke stap, en de keuzes blijven staan bij een stap terug
await page.setViewportSize({ width: 390, height: 844 });
await sleep(300);
check('390 px: stap 4 scrollt niet horizontaal', await passtOpSmal());
check('390 px: tikdoelen van Terug en bevestigen zijn minstens 44 px', (await page.getByRole('button', { name: /^Terug/ }).boundingBox()).height >= 44 && (await bevestig.boundingBox()).height >= 44);
await page.getByRole('button', { name: /^Terug/ }).click();
await page.waitForSelector('.il-sets', { timeout: 30000 });
await sleep(300);
check('390 px: stap 3 scrollt niet horizontaal; de aangevinkte set is onthouden', (await passtOpSmal()) && (await page.locator('.il-set', { hasText: 'ODS_3287' }).locator('input').isChecked()));
await page.getByRole('button', { name: /^Terug/ }).click();
await sleep(300);
check('390 px: stap 2 scrollt niet horizontaal; de gevonden doelen zijn onthouden', (await passtOpSmal()) && (await page.locator('.il-preview > li').count()) === 3);
await page.getByRole('button', { name: /^Terug/ }).click();
await sleep(300);
check('390 px: stap 1 scrollt niet horizontaal; de keuzes zijn onthouden', (await passtOpSmal()) && (await page.inputValue('#il-net')) === 'kov' && (await page.inputValue('#il-titel')) === wizTitel);
check('390 px: de stappenaanduiding blijft leesbaar (geen woorden midden in het woord afgebroken)', await page.evaluate(() => [...document.querySelectorAll('.il-stap-naam')].every((e) => e.scrollWidth <= e.clientWidth + 1)));
await volgende().click();
await sleep(300);
await volgende().click();
await page.waitForSelector('.il-sets', { timeout: 30000 });
await volgende().click();
await wachtOpSamenvatting();
check('390 px: opnieuw bij stap 4; de naam is onthouden en de doelen staan er nog', (await page.inputValue('#il-naam')) === 'Test Nakijker' && (await page.locator('.il-doel').count()) === 3);
await page.setViewportSize({ width: 1360, height: 900 });
await sleep(200);

// Bevestigen: het leerplan staat bij de leerplannen, nagekeken en op slot
await page.getByLabel('Ik heb elk doel met de bron vergeleken').check();
await wachtOpBevestigen();
await page.locator('button.il-bevestig').click();
await page.waitForSelector('text=/Dit leerplan staat op slot/', { timeout: 10000 });
check('bevestigd: /leerplannen opent het leerplan en de parameter ?open= verdwijnt', /#\/leerplannen$/.test(page.url()) && (await page.getByRole('heading', { level: 1, name: wizTitel }).isVisible()));
check('bevestigd: de focus staat op de h1 van het leerplan', await page.evaluate(() => document.activeElement === document.querySelector('main h1')));
check('een nagekeken leerplan van een net toont de verwijzingen wel, en de hint over delen', (await page.locator('.dl-ref .sr-only', { hasText: /^Verwijst naar minimumdoel 09\.0\d/ }).count()) === 4 && !/ODS_/.test((await page.locator('.dl-ref .sr-only').allInnerTexts()).join(' ')) && /Deel een leerplan van je net alleen met collega’s van je school\./.test(await page.locator('.lp-deelhint').innerText()));
check('bevestigd: label "Nagekeken" en door wie', (await page.locator('main .badge', { hasText: /^Nagekeken$/ }).isVisible()) && (await page.locator('text=/Nagekeken door Test Nakijker/').first().isVisible()));
check('bevestigd: de doelen staan op slot, met de verwijzingen als labels', (await page.locator('main textarea').count()) === 0 && (await page.locator('.dl-rij').count()) === 3 && (await page.locator('.dl-ref').count()) === 4);
const wizOpgeslagen = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').find((x) => x.title.startsWith('Aardrijkskunde 1ste graad'));
  return c ? {
    status: c.controle?.status, door: c.controle?.door, goals: c.goals.length, refs: c.goals.reduce((n, g) => n + (g.refs?.length ?? 0), 0), sets: c.minimumdoelenSets,
    kind: c.kind, net: c.net, level: c.level, methode: c.herkomst?.methode, code: c.herkomst?.leerplancode, versie: c.herkomst?.versie, sha: c.herkomst?.bronSha256,
    vingerafdruk: c.controle?.doelenSha256, naam: localStorage.getItem('wf.nakijker.naam'),
  } : null;
});
check('opgeslagen: nagekeken door de leerkracht, met herkomst, sets, verwijzingen en vingerafdrukken', !!wizOpgeslagen && wizOpgeslagen.status === 'gecontroleerd' && wizOpgeslagen.door === 'Test Nakijker' && wizOpgeslagen.goals === 3 && wizOpgeslagen.refs === 4 && wizOpgeslagen.sets?.length === 1 && wizOpgeslagen.sets[0] === 'ODS_3287' && wizOpgeslagen.kind === 'leerplan' && wizOpgeslagen.net === 'kov' && wizOpgeslagen.level === '1ste graad A-stroom' && wizOpgeslagen.methode === 'tekst' && wizOpgeslagen.code === 'I-Aar-a' && wizOpgeslagen.versie === '2024' && /^[0-9a-f]{64}$/.test(wizOpgeslagen.sha) && /^[0-9a-f]{64}$/.test(wizOpgeslagen.vingerafdruk));
check('de naam van de nakijker wordt op dit toestel onthouden (wf.nakijker.naam)', wizOpgeslagen?.naam === 'Test Nakijker');
await page.getByRole('button', { name: /Alle leerplannen/ }).click();
await sleep(300);
check('de leerplannenpagina toont het leerplan als "Nagekeken"', (await page.locator('article.mat-card', { hasText: wizTitel }).locator('.badge', { hasText: /^Nagekeken$/ }).count()) === 1);

// Een tweede leerplan met een pdf: bewaren zonder nakijken, verwijzing toevoegen in de editor, dan nakijken en bevestigen
const pdfPad = new URL('./fixtures/voorbeeld-cursus.pdf', import.meta.url).pathname;
const pdfSha = createHash('sha256').update(readFileSync(pdfPad)).digest('hex');
const aantalVoor = await page.evaluate(() => JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').length);
await go('/#/leerplannen/inlezen');
await page.selectOption('#il-net', 'go');
await page.fill('#il-vak', 'Natuurwetenschappen');
await volgende().click();
await sleep(300);
await page.setInputFiles('#il-pdf', pdfPad);
await page.waitForSelector('.il-pdfstand .il-ok', { timeout: 30000 });
check('stap 2 (pdf): het aantal gelezen pagina’s wordt getoond', /voorbeeld-cursus\.pdf.*2 pagina’s gelezen/.test(await page.locator('.il-pdfstand').innerText()));
await page.getByRole('button', { name: 'Doelen zoeken' }).click();
await page.waitForSelector('.il-preview');
check('stap 2 (pdf): doelen gevonden, geen verwijzingen naar minimumdoelen', /Geen verwijzingen naar minimumdoelen/.test(await page.locator('.il-resultaat').innerText()));
await volgende().click();
await page.waitForSelector('.il-sets', { timeout: 30000 });
check('stap 3: zonder verwijzingen in de tekst zegt de pagina dat je ze in stap 4 per doel kiest, en staat er niets aangevinkt', /geen verwijzingen naar minimumdoelen/.test(await page.locator('.il-stap-inhoud').innerText()) && (await page.locator('.il-set input:checked').count()) === 0);
await volgende().click();
await wachtOpSamenvatting();
await page.getByRole('button', { name: 'Bewaren zonder nakijken' }).click();
await page.waitForSelector('main h1');
await sleep(600);
const pdfOpgeslagen = await page.evaluate(() => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const c = lijst.find((x) => x.title.startsWith('Natuurwetenschappen'));
  return c ? { n: lijst.length, status: c.controle?.status, goals: c.goals.length, methode: c.herkomst?.methode, naam: c.herkomst?.bronNaam, sha: c.herkomst?.bronSha256, sets: c.minimumdoelenSets } : null;
});
check('bewaren zonder nakijken: bewaard als niet nagekeken, met de vingerafdruk van de pdf', !!pdfOpgeslagen && pdfOpgeslagen.n === aantalVoor + 1 && pdfOpgeslagen.status === undefined && pdfOpgeslagen.methode === 'pdf' && pdfOpgeslagen.naam === 'voorbeeld-cursus.pdf' && pdfOpgeslagen.sha === pdfSha && pdfOpgeslagen.goals === 2 && pdfOpgeslagen.sets === undefined);
check('bewaren zonder nakijken: de editor opent met "Niet nagekeken"', (await page.locator('main .badge', { hasText: /^Niet nagekeken$/ }).isVisible()) && (await page.locator('main textarea').count()) === 2);
check('bewaren zonder nakijken: de focus staat op de h1 van de editor', await page.evaluate(() => document.activeElement === document.querySelector('main h1')));
check('editor: "Doelen toevoegen met AI" in plaats van "Doelen uit tekst of pdf"', (await page.getByRole('button', { name: 'Doelen toevoegen met AI' }).count()) === 1 && (await page.getByRole('button', { name: /Doelen uit tekst of pdf/ }).count()) === 0);
check('editor: onder het label "Niet nagekeken" staat wat dat betekent', /De doelen zijn nog niet met de bron vergeleken\. Kijk ze na om ze vast te leggen\./.test(await page.locator('.lp-labeluitleg').innerText()));
check('editor: bij exporteren de raad om een leerplan van je net alleen met collega’s van je school te delen', /Deel een leerplan van je net alleen met collega’s van je school\./.test(await page.locator('.lp-deelhint').innerText()));
check('editor: knop "Nakijken en bevestigen" en per doel "Verwijzing toevoegen"', (await page.getByRole('link', { name: 'Nakijken en bevestigen' }).isVisible()) && (await page.getByRole('button', { name: /^Verwijzing toevoegen/ }).count()) === 2);

// De editor: een leerplan zonder sets laat eerst sets kiezen, dan de minimumdoelen
await page.getByRole('button', { name: /^Verwijzing toevoegen/ }).first().click();
await page.getByRole('dialog', { name: 'Kies de sets met minimumdoelen' }).waitFor();
await page.getByRole('dialog').getByRole('searchbox').waitFor();
check('editor: het zoekveld in het venster met sets heeft meteen de focus', await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search'));
await page.waitForFunction(() => /geldig/i.test(document.querySelector('.kz-setrij .kz-setmeta')?.textContent || ''), null, { timeout: 30000 });
const kzRijen = await page.getByRole('dialog').locator('.kz-setrij').allInnerTexts();
check('editor: de sets bij het vak staan bovenaan, met de geldigheid bij elke rij', kzRijen.length >= 5 && /natuurwetenschappen|STEM/i.test(kzRijen[0]) && kzRijen.slice(0, 5).every((r) => /geldig/i.test(r)));
await page.getByRole('dialog').getByRole('searchbox').fill('ruimtelijk bewustzijn 3287');
await sleep(250);
check('editor: sets kiezen zoekt op naam en nummer', (await page.getByRole('dialog').locator('.kz-setrij').count()) === 1);
await page.getByRole('dialog').locator('.kz-setrij input').check();
await page.getByRole('dialog').getByRole('button', { name: /^Sets bewaren \(1\)/ }).click();
await page.getByRole('dialog', { name: /Minimumdoelen kiezen voor/ }).waitFor();
await page.getByRole('dialog').locator('.kz-rij').first().waitFor({ timeout: 15000 });
check('editor: ook het zoekveld voor de minimumdoelen heeft meteen de focus', await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search'));
check('editor: het venster toont de doelen van de set met een vakje per doel', (await page.getByRole('dialog').locator('.kz-rij input[type=checkbox]').count()) === 8);
await page.getByRole('dialog').getByRole('searchbox').fill('09.04');
await sleep(250);
check('editor: zoeken op code vindt één minimumdoel', (await page.getByRole('dialog').locator('.kz-rij').count()) === 1);
await page.getByRole('dialog').locator('.kz-rij input').check();
await page.getByRole('dialog').getByRole('button', { name: /^Verwijzingen bewaren \(1\)/ }).click();
await sleep(400);
check('editor: de gekozen verwijzing staat als label bij het doel', await page.getByRole('button', { name: 'Verwijzing 09.04 verwijderen' }).isVisible());
const metSet = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').find((x) => x.title.startsWith('Natuurwetenschappen'));
  return { sets: c?.minimumdoelenSets, refs: c?.goals[0]?.refs };
});
check('editor: de set staat nu op het leerplan en de verwijzing bij het eerste doel', metSet.sets?.[0] === 'ODS_3287' && metSet.refs?.length === 1 && metSet.refs[0].code === '09.04' && typeof metSet.refs[0].id === 'string');

// Een bestaand leerplan nakijken
await page.getByRole('link', { name: 'Nakijken en bevestigen' }).click();
await page.waitForSelector('h2.il-stapkop');
check('bestaand leerplan: /leerplannen/inlezen/<id>, h1 "Leerplan nakijken" en begin bij stap 2', /#\/leerplannen\/inlezen\/[^/]+$/.test(page.url()) && /^Leerplan nakijken$/.test(await page.locator('main h1').innerText()) && (await wizKop()) === 'Stap 2 van 4: De bron');
check('bestaand leerplan: volgende is geblokkeerd tot de bron opnieuw ingelezen is', await geblokkeerd(volgende()));
await page.setInputFiles('#il-pdf', pdfPad);
await page.waitForSelector('.il-pdfstand .il-ok', { timeout: 30000 });
await sleep(200);
check('bestaand leerplan: dezelfde pdf wordt herkend aan de vingerafdruk', /dezelfde bron/.test(await page.locator('.il-stap-inhoud').innerText()));
check('bestaand leerplan: geen "Doelen zoeken", de doelen blijven zoals ze zijn', (await page.getByRole('button', { name: 'Doelen zoeken' }).count()) === 0 && !(await geblokkeerd(volgende())));
await volgende().click();
await page.waitForSelector('.il-sets', { timeout: 30000 });
await sleep(300);
check('bestaand leerplan: stap 3 heeft de sets van het leerplan vooraf gekozen', (await page.locator('.il-set', { hasText: 'ODS_3287' }).locator('input').isChecked()) && (await page.locator('.il-set input:checked').count()) === 1);
await volgende().click();
await wachtOpSamenvatting();
check('bestaand leerplan: stap 4 toont de bestaande doelen en hun verwijzing', (await page.locator('.il-doel').count()) === 2 && (await page.getByRole('button', { name: 'Verwijzing 09.04 verwijderen' }).count()) === 1);
check('bestaand leerplan: de naam van de vorige keer staat al ingevuld', (await page.inputValue('#il-naam')) === 'Test Nakijker');
await page.getByLabel('Ik heb elk doel met de bron vergeleken').check();
await wachtOpBevestigen();
await page.locator('button.il-bevestig').click();
await page.waitForSelector('text=/Dit leerplan staat op slot/', { timeout: 10000 });
const bijgewerkt = await page.evaluate(() => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const c = lijst.find((x) => x.title.startsWith('Natuurwetenschappen'));
  return { n: lijst.length, status: c?.controle?.status, door: c?.controle?.door, goals: c?.goals.length, ref: c?.goals[0]?.refs?.[0]?.code };
});
check('bestaand leerplan bevestigd: hetzelfde leerplan bijgewerkt (geen kopie), nagekeken, met zijn verwijzing', bijgewerkt.n === aantalVoor + 1 && bijgewerkt.status === 'gecontroleerd' && bijgewerkt.door === 'Test Nakijker' && bijgewerkt.goals === 2 && bijgewerkt.ref === '09.04');

// Zonder stroom gekozen: sets van de A- én de B-stroom, een dubbelzinnige verwijzing en de tip over de leerplancode
await go('/#/leerplannen/inlezen');
await page.selectOption('#il-net', 'kov');
await page.fill('#il-vak', 'Aardrijkskunde');
await page.selectOption('#il-graad', '1ste graad');
await volgende().click();
await sleep(300);
await page.locator('input[name="il-methode"]').nth(1).check();
await page.fill('#il-tekst', `— p. 1 —\n${WIZARD_TEKST.replace('LPD 3', '— p. 2 —\nLPD 3')}`);
await page.getByRole('button', { name: 'Doelen zoeken' }).click();
await page.waitForSelector('.il-preview');
check('stap 2: paginamarkeringen worden overgeslagen en gemeld als "Bladzijdenummers en koppen overgeslagen (2 regels)"', /Bladzijdenummers en koppen overgeslagen \(2 regels\)/.test(await page.locator('.il-resultaat').innerText()) && /3 doelen gevonden/.test(await page.locator('.il-resultaat').innerText()));
await volgende().click();
await page.waitForSelector('.il-sets', { timeout: 60000 });
await sleep(500);
check('zonder stroom: de A- én de B-stroom staan aangevinkt en de pagina zegt dat een leerplan voor één stroom is', /Je leerplan is voor één stroom\. Vink de sets van de andere stroom af, of kies de stroom in stap 1\./.test(await page.locator('.il-stroommelding').innerText()));
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: stap 3 met de melding over twee stromen scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });
await volgende().click();
await wachtOpSamenvatting();
const kandidaten = (await page.locator('.il-kandidaat-titel').allInnerTexts()).map((t) => t.trim());
check('stap 4: een dubbelzinnige verwijzing noemt graad en stroom bij de set ("09.01 · Ruimtelijk bewustzijn, 1ste graad A-stroom (ODS_3287, geldig sinds 2024)")', kandidaten.some((t) => t === '09.01 · Ruimtelijk bewustzijn, 1ste graad A-stroom (ODS_3287, geldig sinds 2024)') && kandidaten.some((t) => /^09\.01 · Ruimtelijk bewustzijn, 1ste graad B-stroom \(ODS_\d+, geldig sinds 2024\)$/.test(t)));
check('stap 4: de verborgen tekst bij een verwijzing noemt de set bij naam, zonder ODS-nummer', (await page.locator('.il-doel .dl-ref .sr-only', { hasText: /^Verwijst naar minimumdoel 09\.07 \(Ruimtelijk bewustzijn\)$/ }).count()) === 1 && !/ODS_/.test((await page.locator('.il-doel .dl-ref .sr-only').allInnerTexts()).join(' ')));
check('stap 4: zonder leerplancode een tip (geen waarschuwing) met een knop "Naar stap 1"', /Je vulde geen leerplancode in \(stap 1\)\. Dat mag, maar met een code herken je het leerplan later makkelijker\./.test(await page.locator('.il-groep-info').innerText()) && (await page.locator('.il-groep-waarschuwing', { hasText: 'leerplancode' }).count()) === 0 && (await page.getByRole('button', { name: 'Naar stap 1' }).count()) === 1);
await page.getByRole('button', { name: 'Naar stap 1' }).click();
await sleep(250);
check('de knop "Naar stap 1" brengt je naar stap 1, met de focus op de kop', (await wizKop()) === 'Stap 1 van 4: Welk leerplan?' && (await page.evaluate(() => document.activeElement?.tagName === 'H2')));

// Een bestand van een collega: te groot, en met wat er wegvalt (en een gevaarlijk doel-id)
await go('/#/leerplannen');
await page.setInputFiles('input[type=file][accept*="json"]', { name: 'groot.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 16, 32) });
check('een bestand groter dan 2 MB wordt geweigerd met een duidelijke melding', await page.locator('text=/Dit bestand is groter dan 2 MB/').first().isVisible());
const importProef = JSON.stringify({
  app: 'boosterz', kind: 'leerplan', v: 2,
  curriculum: {
    title: 'Importproef', net: 'eigen', subject: 'Test', level: '',
    goals: [
      { id: 'constructor', code: 'LPD 1', text: 'De leerlingen tellen.' },
      { id: '__proto__', code: 'LPD 2', text: 'De leerlingen meten.' },
      { code: 'LPD 2', text: 'Een dubbele code.' },
      { code: 'LPD 3', text: 'x'.repeat(10100) },
      { code: 'LPD 4', text: '' },
    ],
  },
});
await page.setInputFiles('input[type=file][accept*="json"]', { name: 'importproef.json', mimeType: 'application/json', buffer: Buffer.from(importProef) });
await page.waitForSelector('text=/Importproef.*geïmporteerd/');
const importMelding = await page.locator('text=/Importproef.*geïmporteerd/').first().innerText();
check('bestand importeren: de melding zegt wat wegviel en wat ingekort werd', /\(3 doelen\)\. Let op: 2 doelen vielen weg \(.*\); bij 1 doel is een te lange tekst ingekort\. Kijk het leerplan na\./.test(importMelding));
check('bestand importeren: de focus staat op de h1 van het nieuwe leerplan', await page.evaluate(() => document.activeElement === document.querySelector('main h1')) && /^Importproef$/.test(await page.locator('main h1').innerText()));
const importOpgeslagen = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]').find((x) => x.title === 'Importproef');
  return c ? { ids: c.goals.map((g) => g.id), lengtes: c.goals.map((g) => g.text.length) } : null;
});
check('bestand importeren: elk doel-id is veilig ("constructor" en "__proto__" zijn vervangen) en de lange tekst is op 10.000 tekens gekapt', !!importOpgeslagen && importOpgeslagen.ids.length === 3 && importOpgeslagen.ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id) && !['constructor', '__proto__'].includes(id)) && importOpgeslagen.lengtes[2] === 10000);
// Dit leerplan nakijken in de wizard (de plek waar per doel-id wordt opgezocht) werkt gewoon
await page.getByRole('link', { name: 'Nakijken en bevestigen' }).click();
await page.waitForSelector('h2.il-stapkop');
await page.locator('input[name="il-methode"]').nth(1).check();
await page.fill('#il-tekst', 'LPD 1 De leerlingen tellen.\nLPD 2 De leerlingen meten.');
await volgende().click();
await page.waitForSelector('.il-sets', { timeout: 60000 });
await volgende().click();
await wachtOpSamenvatting();
check('wizard met een eerder gevaarlijk doel-id: alle doelen staan er, het eerste "Letterlijk in de bron"', (await page.locator('.il-doel').count()) === 3 && (await page.locator('.il-doel').first().locator('.badge-ok', { hasText: 'Letterlijk in de bron' }).count()) === 1);

// Privacy: wat er over leerplannen staat
await go('/#/privacy');
check('privacy: leerplannen bevatten bij een nagekeken leerplan de naam van wie nakeek', /doelenlijsten die je invoerde of inlas, en bij een nagekeken leerplan de naam die je bij het nakijken invulde \(die gaat mee als je exporteert\)/.test(await page.locator('main').innerText()));

// Onbekend leerplan, AI als laatste redmiddel, ?ai=nieuw
await go('/#/leerplannen/inlezen/bestaat-niet');
check('onbekend leerplan: nette melding met een link terug', (await page.locator('text=/Dit leerplan werd niet gevonden/').isVisible()) && (await page.getByRole('link', { name: /Naar de leerplannen/ }).isVisible()) && (await page.locator('main h1').count()) === 1);
await go('/#/leerplannen/inlezen');
await page.selectOption('#il-net', 'eigen');
await page.fill('#il-vak', 'Test');
await volgende().click();
await sleep(300);
await page.locator('input[name="il-methode"]').nth(1).check();
await page.fill('#il-tekst', 'Dit is een inleiding zonder enig doel.\nNog een zin zonder nummering.');
await page.getByRole('button', { name: 'Doelen zoeken' }).click();
await page.waitForSelector('.il-geen');
check('stap 2: zonder doelen uitleg wat er mis kan zijn en een AI-knop als laatste redmiddel', (await page.locator('.il-resultaat h3', { hasText: 'Geen doelen gevonden' }).count()) === 1 && (await page.getByRole('button', { name: 'Laat de AI het proberen' }).isVisible()) && (await geblokkeerd(volgende())));
check('stap 2: zonder doelen één melding (niet drie): geen waarschuwingenblok en geen "Nog nodig" onder de knop', (await page.locator('.il-waarschuwingen').count()) === 0 && (await page.locator('#il-ontbreekt').count()) === 0 && (await page.locator('.il-resultaat').count()) === 1 && /Kijk na of de tekst de doelen met hun code bevat/.test(await page.locator('.il-geen').innerText()) && !/met de hand|\blezer\b/.test(await page.locator('.il-resultaat').innerText()));
check('stap 2: de uitwegen: bij de AI-knop staat dat je een eigen sleutel nodig hebt, en je kan een blanco leerplan maken', /Daarvoor heb je een eigen AI-sleutel nodig; de tekst gaat dan naar je AI-aanbieder\./.test(await page.locator('.il-geen').innerText()) && (await page.getByRole('link', { name: 'maak een blanco leerplan' }).getAttribute('href')) === '#/leerplannen?nieuw=1' && /Of maak een blanco leerplan en voeg de doelen zelf toe\./.test(await page.locator('.il-geen').innerText()));
check('stap 2: de knop Volgende verwijst naar de melding en een klik erop zet de focus erop', (await page.locator('.il-volgende').getAttribute('aria-describedby')) === 'il-gevonden-kop' && await (async () => { await page.locator('.il-volgende').click({ force: true }); return page.evaluate(() => document.activeElement?.id === 'il-geen'); })());
await page.getByRole('button', { name: 'Laat de AI het proberen' }).click();
await page.getByRole('dialog', { name: /Leerplan uit tekst of pdf/ }).waitFor({ timeout: 10000 });
check('?ai=nieuw opent het AI-venster en de parameter verdwijnt uit de url', !/ai=/.test(page.url()) && /#\/leerplannen$/.test(page.url()));
const gateTekst = await page.getByRole('dialog').innerText();
check('zonder sleutel zegt het venster dat je een AI-sleutel nodig hebt, zonder het over widgets en cursussen te hebben', /Voor deze hulp heb je een eigen AI-sleutel nodig/.test(gateTekst) && !/widgets en cursussen/.test(gateTekst));
await page.keyboard.press('Escape');
// Met een sleutel: het venster is vooraf ingevuld met de tekst en de keuzes uit stap 1
await page.evaluate(() => localStorage.setItem('wf.ai.v1', JSON.stringify({ provider: 'gemini', apiKey: 'test-sleutel', model: 'gemini-3.7-flash' })));
await go('/#/leerplannen/inlezen');
await page.selectOption('#il-net', 'kov');
await page.fill('#il-vak', 'Aardrijkskunde');
await page.selectOption('#il-graad', '1ste graad');
await page.selectOption('#il-stroom', 'A-stroom');
await volgende().click();
await sleep(300);
await page.locator('input[name="il-methode"]').nth(1).check();
await page.fill('#il-tekst', 'Dit is een inleiding zonder enig doel.\nNog een zin zonder nummering.');
await page.getByRole('button', { name: 'Doelen zoeken' }).click();
await page.waitForSelector('.il-geen');
await page.getByRole('button', { name: 'Laat de AI het proberen' }).click();
await page.getByRole('dialog', { name: /Leerplan uit tekst of pdf/ }).waitFor({ timeout: 10000 });
check('met een sleutel: het AI-venster is vooraf ingevuld met de tekst en de keuzes uit stap 1', (await page.getByRole('dialog').getByLabel('Leerplantekst').inputValue()) === 'Dit is een inleiding zonder enig doel.\nNog een zin zonder nummering.' && (await page.getByRole('dialog').getByLabel('Vak').inputValue()) === 'Aardrijkskunde' && (await page.getByRole('dialog').getByLabel('Niveau').inputValue()) === '1ste graad A-stroom' && (await page.getByRole('dialog').getByLabel('Titel van het leerplan').inputValue()) === 'Aardrijkskunde 1ste graad A-stroom (KOV)');
check('het AI-venster zegt waar de tekst heen gaat', /De tekst die je hier plakt, gaat naar de AI-aanbieder die je bij de AI-instellingen koos\./.test(await page.getByRole('dialog').innerText()) && !/Alles blijft op dit toestel/.test(await page.getByRole('dialog').innerText()));
await page.evaluate(() => localStorage.removeItem('wf.ai.v1'));
await page.keyboard.press('Escape');
await go('/#/leerplannen?ai=nieuw');
check('?ai=nieuw werkt ook rechtstreeks', await page.getByRole('dialog', { name: /Leerplan uit tekst of pdf/ }).isVisible());
await page.keyboard.press('Escape');

// Terug zoals het was, zodat de volgende onderdelen niets merken
await page.evaluate((v) => {
  if (v.lijst === null) localStorage.removeItem('wf.curricula.v1'); else localStorage.setItem('wf.curricula.v1', v.lijst);
  if (v.naam === null) localStorage.removeItem('wf.nakijker.naam'); else localStorage.setItem('wf.nakijker.naam', v.naam);
}, wizardVoor);

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
