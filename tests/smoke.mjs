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
// Wachten op de rij in plaats van een vaste pauze: onder last laadt de lijst later.
await page.locator('table.data tbody tr').first().waitFor({ timeout: 8000 }).catch(() => {});
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
check('kop van de leerplannenpagina: "Leerplan inlezen" eerst, en "Bestand van een collega" in plaats van "JSON importeren"', JSON.stringify((await page.locator('.page-head-actions .btn').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['Leerplan inlezen', 'Officiële minimumdoelen', 'Zelf doelen samenstellen', 'Bestand van een collega', 'Blanco leerplan']) && (await page.locator('.page-head-actions a.btn-primary', { hasText: 'Leerplan inlezen' }).count()) === 1);
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
check('Leerplannen: bovenaan een knop "Zelf doelen samenstellen" naar het scherm, naast "Officiële minimumdoelen"', (await page.locator('.page-head-actions a.btn[href="#/leerplannen/samenstellen"]', { hasText: 'Zelf doelen samenstellen' }).count()) === 1 && (await page.locator('.page-head-actions a.btn[href="#/leerplannen/minimumdoelen"]').count()) === 1);
await go('/#/leerplannen/minimumdoelen/ODS_3283');
await page.waitForSelector('.md-stem', { timeout: 15000 });
await page.waitForSelector('.dl-rij', { timeout: 15000 });
check('pagina Officiële minimumdoelen: in de intro een link "Stel je eigen doelenlijst samen"', (await page.locator('.md-intro a[href="#/leerplannen/samenstellen"]', { hasText: 'Stel je eigen doelenlijst samen' }).count()) === 1);
check('de STEM-uitleg zegt "Wil je alleen de doelen van je vak? Kies ze uit deze set." met een link', /Wil je alleen de doelen van je vak\? Kies ze uit deze set\./.test(await page.locator('.md-stem').innerText()) && (await page.locator('.md-stem a[href="#/leerplannen/samenstellen?sets=ODS_3283&leeg=1"]').count()) === 1);
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
check('stap 2: een kleine STEM-set (minder dan 10 doelen) krijgt geen STEM-uitleg', (await page.locator('.sam-blok', { hasText: 'STEM' }).count()) === 1 && (await page.locator('.sam-stem').count()) === 0);
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

// Een samengestelde lijst die niet nagekeken is: dezelfde waarschuwing bij "Keuze aanpassen" en in de editor van het leerplan
const samControle = await page.evaluate((id) => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const c = lijst.find((x) => x.id === id);
  const oud = c.controle;
  delete c.controle;
  localStorage.setItem('wf.curricula.v1', JSON.stringify(lijst));
  return oud;
}, samId);
// Eerst naar een andere pagina: een pagina die al openstaat, leest de opslag niet opnieuw
await go('/#/leerplannen/minimumdoelen');
await go(`/#/leerplannen/samenstellen/${samId}`);
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
check('aanpassen: bij een lijst die niet nagekeken is staat bovenaan "Deze lijst is niet nagekeken" met de waarschuwing dat eigen aanpassingen verloren gaan', /^Deze lijst is niet nagekeken\. Bewaar je ze opnieuw, dan wordt ze opnieuw samengesteld uit de officiële doelen; wat je zelf in de doelen veranderde, gaat dan verloren\.$/.test((await page.locator('.sam-gewijzigd[role="note"]').innerText()).trim()));
await go(`/#/leerplannen?open=${samId}`);
check('editor: bij "Niet nagekeken" staat bij "Keuze aanpassen" dezelfde waarschuwing', /Pas de keuze aan en bewaar de lijst opnieuw om het nog eens te proberen\. Bewaar je ze opnieuw, dan wordt ze opnieuw samengesteld uit de officiële doelen; wat je zelf in de doelen veranderde, gaat dan verloren\./.test(await page.locator('.lp-labeluitleg').innerText()) && await page.getByRole('link', { name: 'Keuze aanpassen' }).isVisible());
await page.evaluate(({ id, controle }) => {
  const lijst = JSON.parse(localStorage.getItem('wf.curricula.v1') || '[]');
  const c = lijst.find((x) => x.id === id);
  c.controle = controle;
  localStorage.setItem('wf.curricula.v1', JSON.stringify(lijst));
}, { id: samId, controle: samControle });
await go('/#/leerplannen/minimumdoelen');

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
check('vanuit de set: de STEM-uitleg zegt dat alle 44 doelen gekozen zijn en dat je eerst "Hele set" uitvinkt', /^In deze set staan wiskunde, natuurwetenschappen en techniek samen, en nu zijn alle 44 doelen gekozen\. Wil je alleen de doelen van je vak\? Vink eerst ‘Hele set’ uit\. Zoek daarna met een woord uit je vak \(bv\. ‘energie’\) en vink de gevonden doelen aan\.$/.test((await page.locator('.sam-stem').innerText()).trim()) && !/De bron deelt/.test(await page.locator('.sam-blok').innerText()));
await samStemHele.uncheck();
await sleep(200);
check('vanuit de set: met niets gekozen staat in de STEM-uitleg alleen nog de zoektip', /^In deze set staan wiskunde, natuurwetenschappen en techniek samen\. Zoek met een woord uit je vak \(bv\. ‘energie’\) en vink de gevonden doelen aan\.$/.test((await page.locator('.sam-stem').innerText()).trim()));
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

// De STEM-link op de pagina Officiële minimumdoelen opent de set met NIETS aangevinkt: alleen "energie" geeft 3 doelen
await go('/#/leerplannen/samenstellen?sets=ODS_3283');
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(200);
check('?sets=ODS_3283 zonder "leeg": de hele STEM-set staat gekozen (44 doelen)', (await samTotaal()) === 'Je koos 44 doelen uit 1 set.');
await page.evaluate(() => { location.hash = '#/leerplannen/samenstellen?sets=ODS_3283&leeg=1'; });
await sleep(500);
check('een link met ?leeg=1 begint de pagina opnieuw, met niets gekozen', (await samTotaal()) === 'Je koos nog geen doelen.' && (await page.locator('.sam-doel input:checked').count()) === 0);
await go('/#/leerplannen/minimumdoelen/ODS_3283');
await page.waitForSelector('.md-stem', { timeout: 15000 });
await page.locator('.md-stem').getByRole('link', { name: 'Kies ze uit deze set' }).click();
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
check('STEM-link: /leerplannen/samenstellen?sets=ODS_3283&leeg=1 begint bij stap 2 met de set gekozen maar niets aangevinkt', /#\/leerplannen\/samenstellen\?sets=ODS_3283&leeg=1$/.test(page.url()) && (await samKop()) === 'Stap 2 van 3: Doelen kiezen' && (await page.locator('.sam-blok').count()) === 1 && (await samTotaal()) === 'Je koos nog geen doelen.' && (await page.locator('.sam-doel input:checked').count()) === 0 && !(await page.locator('.sam-hele input').isChecked()) && /0 van 44 gekozen/.test(await page.locator('.sam-telling').innerText()));
await page.fill('#sam-doelzoek', 'energie');
await sleep(300);
check('STEM-link: zoeken op "energie" vindt 3 doelen', /^3 doelen gevonden$/.test((await page.locator('.sam-doelzoek .sam-teller').innerText()).trim()));
await page.getByRole('button', { name: 'Vink de gevonden doelen aan' }).click();
await sleep(200);
check('STEM-link: "Vink de gevonden doelen aan" geeft "Je koos 3 doelen uit 1 set."', (await samTotaal()) === 'Je koos 3 doelen uit 1 set.' && (await page.locator('.sam-doel input:checked').count()) === 3 && /3 van 44 gekozen/.test(await page.locator('.sam-telling').innerText()));

// Dezelfde code in twee gekozen sets (Nederlands in de A- en de B-stroom): de codes krijgen een onderscheid, ook in de codekolom
await go('/#/leerplannen/samenstellen?sets=ODS_3343,ODS_3351');
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
const samHeleNamen = await page.locator('.sam-hele input').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const samLijstNamen = await page.locator('.sam-doelen').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const samKoppen = await page.locator('.sam-blok h3').allInnerTexts();
check('twee sets met dezelfde naam: "Hele set", de lijst en de kop zijn voor een schermlezer te onderscheiden (met de stroom)', samHeleNamen.length === 2 && new Set(samHeleNamen).size === 2 && samHeleNamen.every((n) => /^Hele set Nederlands \(.*(A|B)-stroom.*\)$/.test(n ?? '')) && new Set(samLijstNamen).size === 2 && samLijstNamen.every((n) => /^Doelen van Nederlands \(.*(A|B)-stroom.*\)$/.test(n ?? '')) && new Set(samKoppen.map((t) => t.replace(/\s+/g, ' ').trim())).size === 2);
check('twee sets met dezelfde naam: de twee regio\'s hebben een verschillende naam', (await page.getByRole('region', { name: /^Nederlands.*A-stroom/ }).count()) === 1 && (await page.getByRole('region', { name: /^Nederlands.*B-stroom/ }).count()) === 1 && (await page.locator('.sam-blok h3 .sr-only').count()) === 2);
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

// Twee sets die niet meer gelden: de waarschuwingen staan netjes samen in één melding met een lijst, ook op 390 px
await go('/#/leerplannen/samenstellen?sets=ODS_2118,ODS_2443');
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
check('stap 3: meer dan één waarschuwing staat in één melding ("Let op: enkele dingen") met een lijst', (await page.locator('.sam-waarschuwing').count()) === 1 && /^Let op: enkele dingen/.test((await page.locator('.sam-waarschuwing').innerText()).trim()) && (await page.locator('.sam-waarschuwing ul > li').count()) >= 2 && /ODS_2118/.test(await page.locator('.sam-waarschuwing').innerText()) && /ODS_2443/.test(await page.locator('.sam-waarschuwing').innerText()));
await page.setViewportSize({ width: 390, height: 844 });
await sleep(200);
check('390 px: stap 3 met meerdere waarschuwingen scrollt niet horizontaal', await passtOpSmal());
await page.setViewportSize({ width: 1360, height: 900 });

// Een set uit de link die niet bestaat, en 390 px voor stap 1
await go('/#/leerplannen/samenstellen?sets=ODS_999999');
await page.waitForSelector('.sam-sets > li', { timeout: 15000 });
check('een set uit de link die niet bestaat wordt overgeslagen, met een melding, en de wizard begint bij stap 1', (await samKop()) === 'Stap 1 van 3: Sets kiezen' && /^Een gevraagde set werd niet gevonden en is overgeslagen\.$/.test((await page.locator('.callout[role="note"]').innerText()).trim()));
await go('/#/leerplannen/samenstellen?sets=foo,bar');
await page.waitForSelector('.sam-sets > li', { timeout: 15000 });
check('?sets=foo,bar: stap 1 met de melding dat 2 gevraagde sets overgeslagen zijn', (await samKop()) === 'Stap 1 van 3: Sets kiezen' && /^2 gevraagde sets konden niet gekozen worden en zijn overgeslagen\.$/.test((await page.locator('.callout[role="note"]').innerText()).trim()));
await go('/#/leerplannen/samenstellen?sets=ODS_3343,ODS_999999,foo');
await page.waitForSelector('.sam-blok .sam-doel', { timeout: 15000 });
await sleep(300);
check('?sets= met een goede, een onbekende en een ongeldige set: stap 2 met de melding dat 2 gevraagde sets overgeslagen zijn', (await samKop()) === 'Stap 2 van 3: Doelen kiezen' && (await page.locator('.sam-blok').count()) === 1 && /^2 gevraagde sets konden niet gekozen worden en zijn overgeslagen\.$/.test((await page.locator('.callout[role="note"]').innerText()).trim()));
await volgende().click();
await page.waitForSelector('#sam-titel', { timeout: 15000 });
check('… in stap 3 staat de melding er niet meer, en met "Terug" weer wel', (await page.locator('.callout', { hasText: 'overgeslagen' }).count()) === 0 && (await (async () => { await page.getByRole('button', { name: /^Terug/ }).click(); await sleep(200); return page.locator('.callout', { hasText: 'gevraagde sets konden niet gekozen worden' }).count(); })()) === 1);

// "Toon meer sets" bij de laatste reeks en "Toon alle sets" zonder resultaat: de focus blijft in de lijst of gaat naar het zoekveld
await go('/#/leerplannen/samenstellen');
await page.waitForSelector('.sam-sets > li', { timeout: 15000 });
await page.getByLabel('Graad', { exact: true }).selectOption('1ste graad');
await sleep(300);
check('stap 1: de 1ste graad toont 60 van de 80 sets met "Toon meer sets"', (await page.locator('.sam-sets > li').count()) === 60 && await page.getByRole('button', { name: /^Toon meer sets/ }).isVisible());
await page.getByRole('button', { name: /^Toon meer sets/ }).click();
await sleep(300);
check('stap 1: "Toon meer sets" bij de laatste reeks zet de focus op het eerste nieuwe selectievakje', (await page.locator('.sam-sets > li').count()) === 80 && (await page.getByRole('button', { name: /^Toon meer sets/ }).count()) === 0 && (await page.evaluate(() => document.activeElement === document.querySelectorAll('.sam-sets > li input')[60])));
await page.fill('#sam-zoek', 'zzgeenset');
await sleep(300);
check('stap 1: een zoekopdracht zonder resultaat toont "Geen sets die hierbij passen"', /Geen sets die hierbij passen/.test(await page.locator('.sam-leeg').innerText()));
await page.getByRole('button', { name: 'Toon alle sets' }).click();
await sleep(300);
check('stap 1: "Toon alle sets" zet de focus op het zoekveld', (await page.locator('.sam-sets > li').count()) > 0 && (await page.evaluate(() => document.activeElement?.id)) === 'sam-zoek' && (await page.inputValue('#sam-zoek')) === '');

// "Haal deze set weg" na een laadfout in stap 2: de focus gaat naar de kop van de stap. Eigen pagina zonder service worker,
// anders ziet de test het ophalen van het bestand niet.
const foutContext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1360, height: 900 } });
const foutPagina = await foutContext.newPage();
await foutPagina.route('**/leerplannen/minimumdoelen/ODS_2119.json', (r) => r.abort());
await foutPagina.goto(BASE + '/#/leerplannen/samenstellen?sets=ODS_2119', { waitUntil: 'networkidle' });
await foutPagina.waitForSelector('button:has-text("Haal deze set weg")', { timeout: 15000 });
check('stap 2: een set die niet laadt toont een fout met "Haal deze set weg"', /^Stap 2 van 3: Doelen kiezen$/.test((await foutPagina.locator('h2.il-stapkop').innerText()).trim()) && (await foutPagina.getByRole('button', { name: 'Haal deze set weg' }).count()) === 1);
await foutPagina.getByRole('button', { name: 'Haal deze set weg' }).click();
await sleep(300);
check('stap 2: na "Haal deze set weg" staat de focus op de kop van de stap', (await foutPagina.evaluate(() => document.activeElement === document.querySelector('h2.il-stapkop'))) && (await foutPagina.locator('.sam-blok').count()) === 0);
await foutContext.close();
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

// ── 27. Afdruk: de toets verklapt de antwoorden niet ────────────────────────
console.log('27. Afdruk verklapt de antwoorden niet');
{
  const pq = await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('wf.widgets.v1')).find((x) => x.title === 'Voorbeeld: quiz over België');
    const qs = w.config.questions;
    return { id: w.id, match: qs.find((q) => q.type === 'match'), order: qs.find((q) => q.type === 'order') };
  });
  const designRight = pq.match.pairs.map((p) => p.right);
  const designItems = pq.order.items;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sameSet = (a, b) => same([...a].sort(), [...b].sort());
  const printedColumns = async () => {
    await page.locator('main ol', { hasText: designItems[0] }).first().waitFor();
    const rightCol = await page.locator('main ol', { hasText: pq.match.pairs[0].right }).locator('li').allInnerTexts();
    const leftCol = await page.locator('main ol', { hasText: pq.match.pairs[0].left }).locator('li').allInnerTexts();
    const orderCol = await page.locator('main ol', { hasText: designItems[0] }).locator('li').allInnerTexts();
    return { rightCol: rightCol.map((t) => t.trim()), leftCol: leftCol.map((t) => t.trim()), orderCol: orderCol.map((t) => t.trim()) };
  };

  await go(`/#/print/${pq.id}`);
  await page.locator('main h1').waitFor();
  check('afdruk: één main en één h1', (await page.locator('main').count()) === 1 && (await page.locator('h1').count()) === 1);
  const zonder = await printedColumns();
  const orderZonder = zonder.orderCol.map((t) => t.replace(/^_+\s*/, '').trim());
  check('zonder sleutel: koppelvraag toont de rechterkolom niet in de juiste volgorde', sameSet(zonder.rightCol, designRight) && !same(zonder.rightCol, designRight));
  check('zonder sleutel: ordenvraag toont de stappen niet in de juiste volgorde', sameSet(orderZonder, designItems) && !same(orderZonder, designItems));
  check('zonder sleutel: nergens een sleutel zichtbaar', !/\(plaats \d+\)/.test(await page.locator('main').innerText()));

  // Opnieuw laden: dezelfde volgorde (vast per vraag, geen toeval per render)
  await go(`/#/print/${pq.id}`);
  const nogmaals = await printedColumns();
  check('de afgedrukte volgorde ligt vast bij elke render', same(nogmaals.rightCol, zonder.rightCol) && same(nogmaals.orderCol, zonder.orderCol));

  await page.getByLabel('Correctiesleutel tonen').check();
  await sleep(300);
  const met = await printedColumns();
  check('met sleutel: dezelfde rechterkolom als zonder sleutel', same(met.rightCol, zonder.rightCol));
  const letterOk = pq.match.pairs.every((p, i) => {
    const m = /\(([a-z]+)\)\s*$/.exec(met.leftCol[i] ?? '');
    return !!m && met.rightCol[m[1].charCodeAt(0) - 97] === p.right;
  });
  check('met sleutel: de letter bij elk linkeritem wijst naar het juiste rechteritem', letterOk);
  const placeOk = met.orderCol.length === designItems.length && met.orderCol.every((t) => {
    const m = /^_+\s*(.*?)\s*\(plaats (\d+)\)\s*$/.exec(t);
    return !!m && designItems[Number(m[2]) - 1] === m[1];
  });
  check('met sleutel: het plaatsnummer bij elke stap is de juiste plaats', placeOk);

  // Donker thema: de bedieningsbalk blijft leesbaar, het papier blijft zwart op wit
  const themaVoor = await page.evaluate(() => { const v = document.documentElement.getAttribute('data-theme'); document.documentElement.setAttribute('data-theme', 'dark'); return v; });
  await sleep(200);
  const kleuren = await page.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const label = document.querySelector('label.checkbox-row span');
    const bar = document.querySelector('header.topbar');
    const fg = getComputedStyle(label).color;
    const bg = getComputedStyle(bar).backgroundColor;
    const [l1, l2] = [lum(parse(fg)), lum(parse(bg))].sort((a, b) => b - a);
    return { fg, bg, contrast: (l1 + 0.05) / (l2 + 0.05), paper: getComputedStyle(document.querySelector('main')).color };
  });
  check(`donker thema: "Correctiesleutel tonen" heeft voldoende contrast (${kleuren.contrast.toFixed(1)}:1)`, kleuren.contrast >= 4.5);
  check('donker thema: het papier blijft zwart op wit', kleuren.paper === 'rgb(17, 17, 17)');
  await page.evaluate((v) => { if (v === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v); }, themaVoor);

  // Smal scherm: de rij Naam/Klas/Datum loopt niet over
  await page.setViewportSize({ width: 390, height: 844 });
  await go(`/#/print/${pq.id}`);
  await page.locator('main h1').waitFor();
  const breedte = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(`op 390 px geen horizontale scroll (${breedte.scroll} ≤ ${breedte.client})`, breedte.scroll <= breedte.client);
  await page.setViewportSize({ width: 1360, height: 900 });

  // Niet-gevonden: eigen main en h1
  await go('/#/print/xxx');
  await page.locator('main h1').waitFor();
  check('niet-gevonden-afdruk heeft één main en één h1', (await page.locator('main').count()) === 1 && (await page.locator('main h1').count()) === 1 && (await page.locator('h1').count()) === 1);
}

// ── 26b. Woordspellen: Galgje en Husselwoorden ──────────────────────────────
console.log('26b. Woordspellen');
const spelSettings = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };
const spelWidget = (type, code, config, over = {}) => ({
  id: `smoke-ws-${code}`, type, title: `Smoke ${type} ${code}`, folderId: null, config,
  settings: { ...spelSettings, ...over }, code, createdAt: Date.now(), updatedAt: Date.now(),
});
const spelWidgets = [
  spelWidget('hangman', 'SMKGLG', { words: [{ word: 'België', hint: '' }], maxErrors: 6 }),
  spelWidget('hangman', 'SMKGLL', { words: [{ word: 'onwaarschijnlijkheden', hint: '' }], maxErrors: 6 }),
  spelWidget('hangman', 'SMKGLE', { words: [], maxErrors: 8 }),
  spelWidget('scramble', 'SMKHUE', { mode: 'sentence', items: [] }),
  spelWidget('scramble', 'SMKHUS', { mode: 'word', items: [{ id: 'a', text: 'boom', hint: '' }] }),
  spelWidget('wordsearch', 'SMKWZD', { words: ['huis', 'Huis', 'boom'], size: 8, allowDiagonal: false, allowReverse: false }),
  spelWidget('crossword', 'SMKKWD', { entries: [{ id: 'e1', word: 'huis', clue: 'een woning' }, { id: 'e2', word: 'Huis', clue: 'een gebouw' }, { id: 'e3', word: 'sluis', clue: 'bij een kanaal' }] }),
];
await page.evaluate((ws) => {
  const all = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
  localStorage.setItem('wf.widgets.v1', JSON.stringify([...ws, ...all.filter((w) => !ws.some((x) => x.id === w.id))]));
}, spelWidgets);
const spelStarten = async (code) => {
  await go(`/#/speel/${code}`);
  const naamveld = page.locator('#student-name');
  if (await naamveld.count()) await naamveld.fill('Testleerling');
  await page.getByRole('button', { name: /Starten/ }).click();
  await sleep(500);
};
const spelOpgeslagen = (id) => page.evaluate((i) => JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => w.id === i)?.config, id);

// Galgje: "België" is op te lossen met gewone letters
await spelStarten('SMKGLG');
check('Galgje: de kansen hebben één toegankelijke naam (role=img)', (await page.locator('[role=img][aria-label="Nog 6 van 6 kansen"]').count()) === 1);
check('Galgje: woord voor schermlezers (sr-only), leeg waar nog niets geraden is', (await page.locator('.sr-only', { hasText: /^Woord: leeg leeg leeg leeg leeg leeg$/ }).count()) === 1);
check('Galgje: het zichtbare woord is verborgen voor schermlezers', (await page.locator('p[aria-hidden=true]', { hasText: '______' }).count()) === 1);
{
  const b = await page.locator('.letter-key').first().boundingBox();
  check('Galgje: lettertoetsen zijn minstens 44 px breed en hoog', b.width >= 44 && b.height >= 44);
}
await page.locator('.letter-key', { hasText: /^Z$/ }).click();
check('Galgje: een foute letter kost een kans (zichtbaar voor schermlezers)', (await page.locator('[role=img][aria-label="Nog 5 van 6 kansen"]').count()) === 1);
// toetsenbord: na Enter op een letter blijft de focus op de knop staan
await page.locator('.letter-key', { hasText: /^A$/ }).focus();
await page.keyboard.press('Enter');
await sleep(150);
check('Galgje: na Enter op een letter blijft de focus op de letterknop', await page.evaluate(() => /^Letter A/.test(document.activeElement?.getAttribute('aria-label') || '')));
await page.keyboard.press('Enter');
check('Galgje: dezelfde letter nog eens kiezen kost geen extra kans', (await page.locator('[role=img][aria-label="Nog 4 van 6 kansen"]').count()) === 1);
await page.locator('.letter-key', { hasText: /^E$/ }).click();
check('Galgje: E toont ook Ë (en kost geen kans)', (await page.locator('.sr-only', { hasText: /^Woord: leeg E leeg leeg leeg Ë$/ }).count()) === 1
  && (await page.locator('[role=img][aria-label="Nog 4 van 6 kansen"]').count()) === 1);
for (const l of 'BLGI') await page.locator('.letter-key:not([aria-disabled=true])', { hasText: new RegExp(`^${l}$`) }).click();
await sleep(300);
check('Galgje: "België" opgelost met B, E, L, G en I', await page.locator('text=Geraden!').first().isVisible());

// Galgje op 390 px: een lang woord loopt niet uit beeld
await page.setViewportSize({ width: 390, height: 844 });
await spelStarten('SMKGLL');
check('390 px: Galgje met een woord van 21 letters scrolt niet horizontaal', await passtOpSmal());
const galgjeWoord = await page.locator('p[aria-hidden=true]', { hasText: '_____' }).first().boundingBox();
check('390 px: het woord blijft binnen het scherm', galgjeWoord.x >= 0 && galgjeWoord.x + galgjeWoord.width <= 391);
const galgjeToetsen = await page.locator('.letter-key').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, r.right]; }));
check('390 px: alle 26 lettertoetsen zijn minstens 44 × 44 en passen in het scherm', galgjeToetsen.length === 26 && galgjeToetsen.every(([w, h, r]) => w >= 44 && h >= 44 && r <= 390));

// Husselwoorden op 390 px: de knoppenrij past
await spelStarten('SMKHUS');
check('390 px: Husselwoorden scrolt niet horizontaal', await passtOpSmal());
const hussel = await page.getByRole('button', { name: /Wissen|Controleren|Overslaan/ }).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.right, r.height]; }));
check('390 px: Wissen, Controleren en Overslaan passen binnen het scherm met 44 px hoogte', hussel.length === 3 && hussel.every(([r, h]) => r <= 390 && h >= 44));
await page.setViewportSize({ width: 1360, height: 900 });

// Galgje-editor: een hint typen blijft staan zoals getypt
await go('/#/widgets');
await go('/#/bewerk/smoke-ws-SMKGLE');
const galgjeVeld = page.getByLabel('Woorden en hints');
await galgjeVeld.click();
await page.keyboard.type('appel: een stuk fruit', { delay: 15 });
await sleep(700);
check('Galgje-editor: "appel: een stuk fruit" blijft zo in het tekstveld staan', (await galgjeVeld.inputValue()) === 'appel: een stuk fruit');
check('Galgje-editor: woord en hint zijn gescheiden bewaard', JSON.stringify((await spelOpgeslagen('smoke-ws-SMKGLE')).words) === JSON.stringify([{ word: 'appel', hint: 'een stuk fruit' }]));
check('Galgje-editor: uitleg over een dubbelepunt in de zin', await page.locator('text=/Staat er zelf een dubbelepunt/').first().isVisible());

// Husselwoorden-editor: een uur met dubbelepunt wordt niet gesplitst
await go('/#/widgets');
await go('/#/bewerk/smoke-ws-SMKHUE');
const husselVeld = page.getByLabel('Zinnen', { exact: true });
await husselVeld.click();
await page.keyboard.type('Het is 12:30 nu.', { delay: 15 });
await sleep(700);
check('Husselwoorden-editor: "Het is 12:30 nu." blijft heel in het tekstveld', (await husselVeld.inputValue()) === 'Het is 12:30 nu.');
const husselOpgeslagen = (await spelOpgeslagen('smoke-ws-SMKHUE')).items;
check('Husselwoorden-editor: de zin is niet gesplitst in zin en hint', husselOpgeslagen.length === 1 && husselOpgeslagen[0].text === 'Het is 12:30 nu.' && !husselOpgeslagen[0].hint);

// Tijd om: Galgje en Husselwoorden dienen de deelscore in
{
  const tijdWidgets = [
    spelWidget('hangman', 'SMKTIJ', { words: [{ word: 'boom', hint: '' }], maxErrors: 8 }, { timeLimitMin: 1 }),
    spelWidget('scramble', 'SMKTIK', { mode: 'word', items: [{ id: 'a', text: 'boom', hint: '' }] }, { timeLimitMin: 1 }),
  ];
  const tijdCtx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await tijdCtx.addInitScript((ws) => {
    if (!localStorage.getItem('wf.widgets.v1')) {
      localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
      localStorage.setItem('wf.prefs.v1', JSON.stringify({ seeded: true }));
    }
  }, tijdWidgets);
  const tijd = await tijdCtx.newPage();
  tijd.on('pageerror', (e) => errors.push(`pageerror(tijd): ${e.message}`));
  tijd.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`console(tijd): ${m.text()}`); });
  await tijd.clock.install();
  for (const [code, tekst, naam] of [['SMKTIJ', /Spel afgelopen!/, 'Galgje'], ['SMKTIK', /^Klaar!$/, 'Husselwoorden']]) {
    await tijd.goto(`${BASE}/#/speel/${code}`, { waitUntil: 'networkidle' });
    await tijd.getByRole('button', { name: /Starten/ }).click();
    await tijd.clock.runFor(2000);
    await tijd.clock.runFor(62000);
    await tijd.waitForTimeout(500);
    check(`${naam}: bij tijd om verschijnt het resultaatscherm met de deelscore`, await tijd.getByRole('heading', { name: tekst }).isVisible() && await tijd.getByText(/Je behaalde/).first().isVisible());
    const inzendingen = await tijd.evaluate((c) => JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]').filter((s) => s.widgetCode === c), code);
    check(`${naam}: bij tijd om is de deelscore bewaard`, inzendingen.length === 1 && inzendingen[0].totalEarned === 0 && inzendingen[0].totalMax === 1);
  }
  await tijdCtx.close();
}

// Dubbele woorden: "huis" en "Huis" tellen als één woord
await spelStarten('SMKWZD');
check('woordzoeker: "huis" en "Huis" geven samen één woord (0 / 2 gevonden)', await page.locator('.badge', { hasText: '0 / 2 gevonden' }).first().isVisible());
await spelStarten('SMKKWD');
check('kruiswoord: "huis" en "Huis" staan samen één keer in het rooster (0 / 2 woorden)', await page.locator('.badge', { hasText: '0 / 2 woorden' }).first().isVisible());
await go('/#/widgets');
await go('/#/bewerk/smoke-ws-SMKKWD');
check('kruiswoord-editor: melding over het dubbele woord', await page.locator('text=/Dubbele woorden staan maar één keer in het rooster/').first().isVisible());
// ── 28. Leerlinghub: inleveren, voorlopige scores, Mijn voortgang ───────────
console.log('28. Leerlinghub en Mijn voortgang (gsm)');
{
  const ctx28 = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const ll = await ctx28.newPage();
  ll.on('pageerror', (e) => errors.push(`pageerror(hub): ${e.message}`));
  ll.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID|Failed to load resource/.test(m.text())) errors.push(`console(hub): ${m.text()}`); });
  const goLl = async (hash) => { await ll.goto(BASE + hash, { waitUntil: 'networkidle' }); await sleep(500); };
  const actief = () => ll.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName ?? '', tekst: (a?.textContent ?? '').trim().slice(0, 60) }; });

  const mkQ = (id, title, code, qs, showScore = true) => ({
    id, type: 'quiz', title, folderId: null, code,
    config: { layout: 'single', questions: qs },
    settings: { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore, timeLimitMin: 0, maxAttempts: 0, requireName: true, instructions: '' },
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  const mcQ = (id) => ({ id, type: 'mc', prompt: 'Vraag ' + id, points: 1, options: ['A', 'B', 'C'], correctIndex: 0 });
  const wOpen = mkQ('w28open', 'Oefening met open vragen', 'SMK281', [mcQ('q1'), { id: 'q2', type: 'long', prompt: 'Leg uit', points: 3, modelAnswer: '' }]);
  const wGeenScore = mkQ('w28geen', 'Oefening zonder score', 'SMK282', [mcQ('q1')], false);
  const wGewoon = mkQ('w28gewoon', 'Gewone oefening', 'SMK283', [mcQ('q1')]);
  const klas28 = { id: 'k28', name: '2B', code: 'SMK280', students: [{ id: 's1', name: 'Anna Peeters' }, { id: 's2', name: 'Bram Janssens' }], createdAt: 1, updatedAt: 1 };
  const pack28 = {
    v: 1, kind: 'klas', klas: klas28,
    opdrachten: [wOpen, wGeenScore, wGewoon].map((w, i) => ({ id: 'a28' + i, classId: 'k28', kind: 'widget', targetId: w.id, createdAt: 10 - i, widget: w })),
  };
  const nu = Date.now();
  const sub = (id, widget, naam, sid, extra) => ({
    id, widgetId: widget.id, widgetCode: widget.code, studentName: naam, studentId: sid,
    startedAt: nu - 90000, submittedAt: nu - extra.ago, durationSec: 60, answers: {},
    itemScores: null, totalEarned: 3, totalMax: 4, status: 'graded', ...extra.rest,
  });
  const subsAnna = [
    sub('sm28a', wOpen, 'Anna Peeters', 's1', { ago: 1000, rest: { status: 'submitted', totalEarned: 1, totalMax: 4, itemScores: { q1: { earned: 1, max: 1, mode: 'auto' }, q2: { earned: 0, max: 3, mode: 'pending' } } } }),
    sub('sm28b', wGeenScore, 'Anna Peeters', 's1', { ago: 2000, rest: {} }),
    sub('sm28c', wGewoon, 'Anna Peeters', 's1', { ago: 3000, rest: {} }),
  ];
  const zaaiInzendingen = (lijst) => ll.evaluate((l) => localStorage.setItem('wf.submissions.v1', JSON.stringify(l)), lijst);

  await goLl('/#/klas/open?d=' + LZString.compressToEncodedURIComponent(JSON.stringify(pack28)));
  await sleep(700);
  check('klaspakket opent de leerlinghub met de naamlijst', /#\/leerling\/SMK280/i.test(ll.url()) && await ll.getByRole('heading', { name: /Wie ben jij/ }).isVisible());

  // A11Y6: na het kiezen van een naam landt de focus op de begroeting, niet op body
  await ll.getByRole('button', { name: /Anna Peeters/ }).click();
  await sleep(400);
  const naKiezen = await actief();
  check(`focus valt na het kiezen op de begroeting (${naKiezen.tag} "${naKiezen.tekst}")`, naKiezen.tag === 'H1' && /^Dag Anna/.test(naKiezen.tekst));

  await zaaiInzendingen(subsAnna);
  await ll.reload({ waitUntil: 'networkidle' });
  await sleep(700);
  const naLaden = await actief();
  check('bij het laden met een bekende leerling pakt de focus niets af', naLaden.tag !== 'H1');
  check('hub: één main en één h1', (await ll.locator('main').count()) === 1 && (await ll.locator('h1').count()) === 1);

  // KL7 + Nieuw-2: voorlopige score, "Score tonen" uit
  const regel = async (titel) => ((await ll.locator('article', { hasText: titel }).first().locator('p.hint').first().innerText()) || '').replace(/\s+/g, ' ').trim();
  const r1 = await regel('Oefening met open vragen');
  check(`open vragen wachten: "${r1}" zonder percentage`, /^Ingediend · nog na te kijken$/.test(r1));
  const r2 = await regel('Oefening zonder score');
  check(`"Score tonen" uit: "${r2}" zonder percentage`, r2 === 'Ingediend');
  const r3 = await regel('Gewone oefening');
  check(`nagekeken oefening toont het percentage: "${r3}"`, r3 === 'Ingediend · 75%');

  const inlever = ll.locator('section[aria-label=Inleveren]');
  const kaart = (titel) => inlever.locator('div.card', { hasText: titel }).first();
  check('inlevercode van een wachtende oefening: percentage als voorlopig', /25% \(voorlopig\)/.test(await kaart('Oefening met open vragen').innerText()));
  const kaartGeen = await kaart('Oefening zonder score').innerText();
  check('inlevercode van een oefening zonder score toont geen percentage', !/%/.test(kaartGeen));
  const kaartGewoon = await kaart('Gewone oefening').innerText();
  check('inlevercode van een nagekeken oefening: percentage zonder "voorlopig"', /75%/.test(kaartGewoon) && !/voorlopig/.test(kaartGewoon));

  // LL2: kopiëren vinkt niets af, "Doorgegeven" wel, en terugzetten kan
  const gewoon = kaart('Gewone oefening');
  await gewoon.getByRole('button', { name: /Toon mijn code/ }).click();
  await sleep(500);
  await gewoon.getByRole('button', { name: /^Kopiëren$/ }).click();
  await sleep(500);
  check('na "Kopiëren" meldt de app dat de code gekopieerd is', await ll.getByText(/Code gekopieerd/).first().isVisible());
  check('na "Kopiëren" staat de code er nog (niet afgevinkt)', (await gewoon.getByRole('button', { name: /Doorgegeven/ }).count()) === 1 && (await gewoon.getByRole('button', { name: /^Kopiëren$/ }).count()) === 1);
  check('na "Kopiëren" is er niets doorgegeven opgeslagen', (await ll.evaluate(() => JSON.parse(localStorage.getItem('wf.handed.v1') || '[]').length)) === 0);
  check('zonder doorgegeven codes is er geen knop "Toon doorgegeven codes"', (await inlever.getByRole('button', { name: /Toon doorgegeven codes/ }).count()) === 0);

  await gewoon.getByRole('button', { name: /Doorgegeven/ }).click();
  await sleep(400);
  check('na "Doorgegeven" verdwijnt de kaart uit de lijst', (await inlever.locator('div.card', { hasText: 'Gewone oefening' }).count()) === 0);
  const toon = inlever.getByRole('button', { name: 'Toon doorgegeven codes' });
  check('"Toon doorgegeven codes" staat er, dicht', (await toon.count()) === 1 && (await toon.getAttribute('aria-expanded')) === 'false');
  await toon.click();
  await sleep(300);
  check('"Toon doorgegeven codes" toont de afgevinkte code', (await toon.getAttribute('aria-expanded')) === 'true' && /Gewone oefening/.test(await inlever.locator('#doorgegeven-codes').innerText()));
  const hoogtes = await Promise.all([toon, inlever.getByRole('button', { name: /Toch opnieuw tonen/ }).first()].map(async (b) => (await b.boundingBox())?.height ?? 0));
  check(`de nieuwe knoppen zijn minstens 44 px hoog (${hoogtes.map((h) => Math.round(h)).join(' en ')})`, hoogtes.every((h) => h >= 43.5));
  await inlever.getByRole('button', { name: /Toch opnieuw tonen/ }).first().click();
  await sleep(500);
  check('"Toch opnieuw tonen" zet de code terug in de lijst', (await inlever.locator('div.card', { hasText: 'Gewone oefening' }).count()) >= 1 && (await ll.evaluate(() => JSON.parse(localStorage.getItem('wf.handed.v1') || '[]').length)) === 0);
  const naTerugzetten = await actief();
  check(`na terugzetten staat de focus op "Toon mijn code" (${naTerugzetten.tag} "${naTerugzetten.tekst}")`, /Toon mijn code/.test(naTerugzetten.tekst));

  // LL6: Bram ziet niet standaard de resultaten van Anna
  await ll.getByRole('button', { name: /Niet jij\? Wissel\./ }).click();
  await sleep(300);
  await ll.getByRole('button', { name: /Bram Janssens/ }).click();
  await sleep(400);
  await goLl('/#/voortgang');
  check('Mijn voortgang: één main en één h1', (await ll.locator('main').count()) === 1 && (await ll.locator('h1').count()) === 1);
  check('Mijn voortgang: Bram staat geselecteerd, niet Anna', (await ll.locator('#voortgang-naam').inputValue()) === 'Bram Janssens');
  const bramTekst = await ll.locator('main').innerText();
  check('Mijn voortgang: Bram ziet de pogingen van Anna niet', !/Poging 1/.test(bramTekst) && /Geen inzendingen voor deze naam/.test(bramTekst));

  // zonder klasidentiteit en met twee namen: eerst zelf kiezen, export uit tot dan
  await ll.evaluate(() => localStorage.removeItem('wf.student.v1'));
  await zaaiInzendingen([...subsAnna, sub('sm28d', wGewoon, 'Bram Janssens', 's2', { ago: 500, rest: {} })]);
  await ll.reload({ waitUntil: 'networkidle' });
  await sleep(600);
  check('twee namen, geen identiteit: de keuze staat op "Kies je naam"', (await ll.locator('#voortgang-naam').inputValue()) === '' && (await ll.locator('#voortgang-naam option', { hasText: 'Kies je naam' }).count()) === 1);
  check('twee namen, geen identiteit: exporteren is uitgeschakeld', await ll.getByRole('button', { name: /Voortgang.*exporteren/ }).isDisabled());
  check('twee namen, geen identiteit: geen pogingen van iemand getoond', (await ll.locator('section[aria-label^="Voortgang voor"]').count()) === 0 && /Kies eerst je naam/.test(await ll.locator('main').innerText()));
  await ll.locator('#voortgang-naam').selectOption('Anna Peeters');
  await sleep(300);
  check('na een naam kiezen verschijnen de pogingen en kan er geëxporteerd worden', (await ll.locator('section[aria-label^="Voortgang voor"]').count()) >= 1 && await ll.getByRole('button', { name: /Voortgang van Anna Peeters exporteren/ }).isEnabled());

  // precies één naam: die is meteen gekozen; en de widgetwoorden zijn weg
  await zaaiInzendingen([...subsAnna, sub('sm28e', { id: 'weg28', code: 'WEG280' }, 'Anna Peeters', 's1', { ago: 4000, rest: {} })]);
  await ll.reload({ waitUntil: 'networkidle' });
  await sleep(600);
  check('precies één naam op het toestel: die is gekozen', (await ll.locator('#voortgang-naam').inputValue()) === 'Anna Peeters');
  const voortgangTekst = await ll.locator('main').innerText();
  check('een oefening die niet meer op het toestel staat heet "oefening", niet "widget"', /Deze oefening staat niet \(meer\) op dit toestel/.test(voortgangTekst) && !/widget/i.test(voortgangTekst));
  check('het logo gaat naar /meedoen (leerlingschil), niet naar de startpagina', (await ll.locator('header a.topbar-logo').getAttribute('href')) === '#/meedoen');

  await ctx28.close();
}
// ── 29. Leerlingschermen op 390 px: tikdoelen, overloop, afdrukken ──────────
// Herstel uit de debugronde: één centrale regel in leerling.css geeft de gedeelde
// knoppen, keuzelijsten en uitklapkoppen 44 px; lange woorden en url's breken af;
// bingo past op een gsm; en afdrukken gebruikt altijd de lichte tokens.
console.log('29. Leerlingschermen op 390 px');
await page.setViewportSize({ width: 390, height: 844 });
const overloop = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const hoogtes = (selector) => page.evaluate((s) => [...document.querySelectorAll(s)]
  .filter((e) => e.getClientRects().length > 0)
  .map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10), selector);
const minstens44 = (lijst) => lijst.length > 0 && lijst.every((h) => h >= 44);

// Eigen testmateriaal in de opslag: een bingo met lange begrippen, een hotspot,
// galgje, een whiteboard, een quiz met een lange url in de vraag en een cursus
// met uitklapblok. Het staat los van de voorbeeldinhoud.
const prik = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#cde"/></svg>');
await page.evaluate(({ prik: afbeelding }) => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
  const instellingen = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '' };
  const maak = (type, code, config, title) => ({ id: `w-${code}`, type, title, folderId: null, config, settings: { ...instellingen }, code, createdAt: 1, updatedAt: 1 });
  const begrippen = ['fotosynthese', 'ademhaling', 'celdeling', 'evenwicht', 'zwaartekracht', 'verdamping', 'stofwisseling', 'bloeiwijze', 'waterkringloop', 'ecosysteem', 'voedselketen', 'koolstofdioxide', 'zuurstof', 'chloroplast', 'mitochondrie', 'ribosoom', 'kernmembraan', 'dwarsdoorsnede', 'lichtenergie', 'glucose', 'zetmeel', 'cellulose', 'eiwitten', 'vetten', 'vitamines'];
  const quiz = ws.find((w) => w.type === 'quiz');
  const urlQuiz = { ...structuredClone(quiz), id: 'w-URL390', code: 'URL390', title: 'Quiz met lange url', settings: { ...instellingen } };
  urlQuiz.config.questions[0] = { ...urlQuiz.config.questions[0], prompt: `Lees https://voorbeeld.example/${'abcdefghij'.repeat(20)}einde en antwoord.` };
  ws.push(
    maak('bingo', 'BNG390', { items: begrippen, size: 5, freeCenter: true }, 'Bingo met lange begrippen'),
    maak('hotspot', 'HOT390', { imageUrl: afbeelding, mode: 'explore', hotspots: [{ id: 'h1', x: 50, y: 50, label: 'Midden' }] }, 'Hotspot'),
    maak('hangman', 'HNG390', { words: [{ word: 'fotosynthese', hint: 'planten' }], maxErrors: 6 }, 'Galgje'),
    maak('whiteboard', 'WBD390', { prompt: 'Teken iets' }, 'Whiteboard'),
    urlQuiz
  );
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  const cursussen = JSON.parse(localStorage.getItem('wf.courses.v1') || '[]');
  cursussen.push({
    id: 'smoke-390-cursus', title: 'Cursus voor het afdrukken', author: 'Rooktest', coverEmoji: '📘', code: 'TIK390',
    chapters: [{ id: 'h1', title: 'Hoofdstuk', sections: [{ id: 's1', title: 'Sectie', blocks: [
      { id: 'b1', type: 'text', markdown: 'Een alinea die op papier donker moet zijn, ook in het donkere thema.' },
      { id: 'b2', type: 'accordion', items: [{ id: 'a1', title: 'Check jezelf', text: 'Het antwoord.' }, { id: 'a2', title: 'Nog een vraag', text: 'Nog een antwoord.' }] },
    ] }] }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    createdAt: 1, updatedAt: 1,
  });
  localStorage.setItem('wf.courses.v1', JSON.stringify(cursussen));
}, { prik });

// 27a. /voortgang: select en knoppen minstens 44 px (er staan inzendingen van eerdere secties)
await go('/#/voortgang');
check('/voortgang op 390 px: keuzelijst "Wie ben jij?" minstens 44 px hoog', minstens44(await hoogtes('.player-shell .select')));
check('/voortgang op 390 px: kleine knoppen (exporteren, importeren, meedoen) minstens 44 px hoog', minstens44(await hoogtes('.player-shell .btn-sm')));
check('/voortgang op 390 px: logo-link minstens 44 px hoog', minstens44(await hoogtes('.player-shell .topbar-logo')));
check('/voortgang op 390 px: geen horizontale overloop', (await overloop()) <= 0);

// 27b. Uitklapkoppen in een cursus (summary) minstens 44 px, en het pijltje blijft
await go('/#/cursus/lees/TIK390');
await page.locator('.course-block details summary').first().waitFor({ timeout: 8000 }).catch(() => {});
check('cursus op 390 px: uitklapkoppen (summary) minstens 44 px hoog', minstens44(await hoogtes('.player-shell summary')));
check('cursus op 390 px: uitklapkop houdt zijn pijltje (display: list-item)', await page.evaluate(() => getComputedStyle(document.querySelector('.player-shell summary')).display === 'list-item'));
check('cursus op 390 px: geen horizontale overloop', (await overloop()) <= 0);
// Codeblok in cursustekst: we zetten een <pre><code> met een zeer lange regel in een .md-body
// (renderMarkdown levert hetzelfde element) en meten het resultaat.
const codeblok = await page.evaluate(() => {
  const doel = document.querySelector('.player-shell .md-body');
  doel.insertAdjacentHTML('beforeend', `<pre id="smoke-pre"><code>const x = "${'a'.repeat(160)}";</code></pre>`);
  const pre = document.getElementById('smoke-pre');
  const code = pre.querySelector('code');
  const cp = getComputedStyle(pre);
  const cc = getComputedStyle(code);
  return {
    breedte: pre.getBoundingClientRect().width,
    scherm: document.documentElement.clientWidth,
    overloop: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    preRand: cp.borderTopWidth, preAchtergrond: cp.backgroundColor, wrap: cp.whiteSpace,
    codeRand: cc.borderTopWidth, codeAchtergrond: cc.backgroundColor, codePadding: cc.paddingLeft,
  };
});
check(`codeblok op 390 px: lange regel breekt af (blok ${Math.round(codeblok.breedte)} px, overloop ${codeblok.overloop})`, codeblok.overloop <= 0 && codeblok.breedte <= codeblok.scherm && codeblok.wrap === 'pre-wrap');
check('codeblok: kader en achtergrond op het blok, niet op de code erin', codeblok.preRand === '1px' && codeblok.preAchtergrond !== 'rgba(0, 0, 0, 0)' && codeblok.codeRand === '0px' && codeblok.codeAchtergrond === 'rgba(0, 0, 0, 0)' && codeblok.codePadding === '0px');

// 27c. Resultaatscherm van de quiz: de badge "wordt beoordeeld" mag niet buiten beeld lopen
await go(`/#/speel/${quiz.code}`);
await page.fill('#student-name', 'Smalle leerling');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(600);
for (let i = 0; i < 14; i++) {
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
check('quiz op 390 px: resultaatscherm bereikt', await page.locator('.result-hero').isVisible());
check('quiz op 390 px: badge "wordt beoordeeld" staat op het resultaatscherm', (await page.locator('.badge', { hasText: 'wordt beoordeeld' }).count()) >= 1);
check('quiz op 390 px: resultaatscherm zonder horizontale overloop', (await overloop()) <= 0);

// 27d. Lange url in een vraag breekt af i.p.v. de pagina breder te maken
await go('/#/speel/URL390');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(600);
check('quiz op 390 px: vraag met lange url zichtbaar', await page.locator('.question-prompt', { hasText: 'voorbeeld.example' }).first().isVisible());
check('quiz op 390 px: lange url in de vraag geeft geen horizontale overloop', (await overloop()) <= 0);

// 27e. Bingo met lange begrippen: raster binnen het scherm, vrije vakje leesbaar
await go('/#/speel/BNG390');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(500);
const bingo = await page.evaluate(() => {
  const kanaal = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (css) => { const [r, g, b] = css.match(/[\d.]+/g).map(Number); return 0.2126 * kanaal(r) + 0.7152 * kanaal(g) + 0.0722 * kanaal(b); };
  const vrij = document.querySelector('.bingo-cell.free');
  const cs = getComputedStyle(vrij);
  const [hoog, laag] = [lum(cs.color), lum(cs.backgroundColor)].sort((a, b) => b - a);
  return {
    cellen: document.querySelectorAll('.bingo-cell').length,
    rechts: Math.max(...[...document.querySelectorAll('.bingo-cell')].map((c) => c.getBoundingClientRect().right)),
    breedte: document.documentElement.clientWidth,
    contrast: (hoog + 0.05) / (laag + 0.05),
    doorhaling: cs.textDecorationLine,
  };
});
check('bingo op 390 px: 25 vakjes', bingo.cellen === 25);
check(`bingo op 390 px: raster binnen het scherm (rechterrand ${Math.round(bingo.rechts)} van ${bingo.breedte})`, bingo.rechts <= bingo.breedte);
check('bingo op 390 px: geen horizontale overloop', (await overloop()) <= 0);
check(`bingo: tekst in het vrije vakje haalt 4,5 : 1 (${bingo.contrast.toFixed(1)} : 1) en is niet doorgehaald`, bingo.contrast >= 4.5 && bingo.doorhaling === 'none');
// Het leespaneel "Aa" (portal buiten .player-shell): knoppen en vinkjes minstens 44 px
await page.locator('button[aria-controls="a11y-panel"]').click();
await sleep(300);
check('leespaneel "Aa" op 390 px: knoppen minstens 44 px hoog', minstens44(await hoogtes('.a11y-panel .btn')));
check('leespaneel "Aa" op 390 px: de sluitknop is ook 44 px breed', await page.evaluate(() => [...document.querySelectorAll('.a11y-panel .btn-icon')].every((e) => e.getBoundingClientRect().width >= 44)));
check('leespaneel "Aa" op 390 px: keuzevakjes (rijen) minstens 44 px hoog', minstens44(await hoogtes('.a11y-panel .checkbox-row')));
await page.keyboard.press('Escape');

// 27f. Hotspot: stip blijft 30 px, tikvlak 44 px; galgje en whiteboard krijgen 44 px
await go('/#/speel/HOT390');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(500);
const stip = await page.evaluate(() => {
  const dot = document.querySelector('.hotspot-dot');
  const r = dot.getBoundingClientRect();
  const midden = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  // 20 px naast het midden ligt buiten de stip (straal 15) maar binnen het tikvlak (straal 22)
  const geraakt = document.elementFromPoint(midden.x + 20, midden.y);
  return { zichtbaar: Math.round(r.width), tikvlak: getComputedStyle(dot, '::after').width, raakt: geraakt === dot };
});
check(`hotspot op 390 px: zichtbare stip blijft 30 px (${stip.zichtbaar})`, stip.zichtbaar === 30);
check(`hotspot op 390 px: tikvlak is 44 px (${stip.tikvlak}) en vangt een tik naast de stip`, stip.tikvlak === '44px' && stip.raakt);
await go('/#/speel/HNG390');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(500);
check('galgje op 390 px: lettertoetsen minstens 44 px breed', await page.evaluate(() => { const k = [...document.querySelectorAll('.letter-key')]; return k.length >= 20 && k.every((e) => e.getBoundingClientRect().width >= 44); }));
check('galgje op 390 px: geen horizontale overloop', (await overloop()) <= 0);
await go('/#/speel/WBD390');
await page.getByRole('button', { name: /Starten/ }).click();
await sleep(500);
check('whiteboard op 390 px: kleurstaaltjes 44 × 44', await page.evaluate(() => { const k = [...document.querySelectorAll('.wb-swatch')]; return k.length >= 3 && k.every((e) => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }); }));

// 27g. Een cursus afdrukken in het donkere thema geeft donkere tekst op wit papier
await go('/#/cursus/print/smoke-390-cursus');
await page.locator('main h1, h1').first().waitFor({ timeout: 8000 }).catch(() => {});
const themaVoor = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
const tekstKleuren = () => page.evaluate(() => {
  const kanaal = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (css) => { const [r, g, b] = css.match(/[\d.]+/g).map(Number); return 0.2126 * kanaal(r) + 0.7152 * kanaal(g) + 0.0722 * kanaal(b); };
  const tegen = (fg, bg) => { const [hoog, laag] = [lum(fg), lum(bg)].sort((a, b) => b - a); return (hoog + 0.05) / (laag + 0.05); };
  const achtergrond = getComputedStyle(document.body).backgroundColor;
  const kleur = (el) => getComputedStyle(el).color;
  return {
    achtergrond,
    body: tegen(kleur(document.body), achtergrond),
    h1: tegen(kleur(document.querySelector('h1')), achtergrond),
    alinea: tegen(kleur(document.querySelector('.md-body p')), achtergrond),
  };
});
const opScherm = await tekstKleuren();
check(`afdrukken: het donkere thema is op het scherm echt donker (tekst/achtergrond ${opScherm.body.toFixed(1)} : 1, achtergrond ${opScherm.achtergrond})`, opScherm.achtergrond !== 'rgb(255, 255, 255)' && opScherm.body >= 7);
await page.emulateMedia({ media: 'print' });
await sleep(200);
const opPapier = await tekstKleuren();
check(`afdrukken in donker thema: witte achtergrond (${opPapier.achtergrond})`, opPapier.achtergrond === 'rgb(255, 255, 255)');
check(`afdrukken in donker thema: donkere tekst op wit (body ${opPapier.body.toFixed(1)}, kop ${opPapier.h1.toFixed(1)}, alinea ${opPapier.alinea.toFixed(1)} : 1)`, opPapier.body >= 7 && opPapier.h1 >= 7 && opPapier.alinea >= 7);
await page.emulateMedia({ media: null });
await page.evaluate((t) => { if (t === null) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; }, themaVoor);
await page.setViewportSize({ width: 1360, height: 900 });
// ── 30. Quiz: optie verwijderen, hintladder, getalvelden, nabespreking ──────
console.log('30. Quiz-editor en -speler (debugronde)');
await page.evaluate(() => {
  const ws = JSON.parse(localStorage.getItem('wf.widgets.v1')).filter((w) => !String(w.id).startsWith('smoke-qfix-'));
  const settings = {
    accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true,
    timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: '',
  };
  const now = Date.now();
  ws.push({
    id: 'smoke-qfix-ed', type: 'quiz', title: 'Rooktest quiz-editor', folderId: null, code: 'QFIXED',
    createdAt: now, updatedAt: now, settings,
    config: {
      layout: 'single',
      questions: [
        { id: 'qf1', type: 'mc', prompt: 'Wat is de hoofdstad van België?', points: 1, explanation: 'x',
          options: ['Parijs', 'Lyon', 'Brussel', 'Gent'], correctIndex: 2 },
        { id: 'qf2', type: 'number', prompt: 'Hoeveel is 3 - 8?', points: 1, explanation: 'x', answer: 0, tolerance: 0 },
      ],
    },
  });
  ws.push({
    id: 'smoke-qfix-sp', type: 'quiz', title: 'Rooktest quiz-speler', folderId: null, code: 'QFIXSP',
    createdAt: now, updatedAt: now, settings,
    config: {
      layout: 'single',
      questions: [
        { id: 'qs1', type: 'mc', prompt: 'Wat is de hoofdstad van België?', points: 1, explanation: '',
          options: ['Antwerpen', 'Brussel', 'Gent'], correctIndex: 1 },
        { id: 'qs2', type: 'tf', prompt: 'De zon is een ster.', points: 1, explanation: '', answer: true },
      ],
    },
  });
  localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
});
const qfixStored = () => page.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1')).find((w) => w.id === 'smoke-qfix-ed').config.questions);
await go('/#/bewerk/smoke-qfix-ed');
await page.waitForSelector('.editor-item', { timeout: 10000 }).catch(() => {});
const qfixMc = page.locator('.editor-item').nth(0);
// W1: een foute optie vóór het juiste antwoord verwijderen
await qfixMc.getByRole('button', { name: 'Optie 1 verwijderen' }).click();
await sleep(900);
let qf = await qfixStored();
check('optie verwijderen: de optie is echt weg', JSON.stringify(qf[0].options) === JSON.stringify(['Lyon', 'Brussel', 'Gent']));
check('optie verwijderen: het juiste antwoord blijft "Brussel"', qf[0].options[qf[0].correctIndex] === 'Brussel');
check('optie verwijderen: het vinkje in de editor volgt mee',
  (await qfixMc.locator('input[type=radio]').evaluateAll((es) => es.findIndex((e) => e.checked))) === 1);
// het juiste antwoord zelf verwijderen: geen juist antwoord meer, en dat wordt gemeld
await qfixMc.getByRole('button', { name: 'Optie 2 verwijderen' }).click();
await sleep(900);
qf = await qfixStored();
check('juiste optie verwijderen: geen andere optie stil juist gemaakt', qf[0].correctIndex === -1 && qf[0].options.join() === 'Lyon,Gent');
check('juiste optie verwijderen: melding in de editor', await qfixMc.locator('text=Nog geen juist antwoord aangeduid').isVisible());
check('juiste optie verwijderen: vraag-check meldt het', await page.locator('aside li', { hasText: 'Geen juist antwoord aangeduid' }).first().isVisible());
// W2: hint toevoegen en typen met spaties
await qfixMc.locator('summary', { hasText: 'Extra: afbeelding' }).click();
await qfixMc.getByRole('button', { name: '+ Hint toevoegen' }).click();
const hint1 = qfixMc.getByLabel('Hint 1', { exact: true });
check('hint toevoegen: er verschijnt een invulveld', await hint1.isVisible().catch(() => false));
await hint1.click();
await page.keyboard.type('herlees de vraag ', { delay: 20 });
await sleep(900);
qf = await qfixStored();
check('hint typen: spaties blijven staan (veld en opslag)',
  (await hint1.inputValue()) === 'herlees de vraag ' && qf[0].hints?.[0] === 'herlees de vraag ');
// W13: negatief getal en decimale komma in het getalveld
const qfixNum = page.locator('.editor-item').nth(1).getByLabel('Juiste antwoord', { exact: true });
await qfixNum.click();
await qfixNum.press('Control+a');
await page.keyboard.type('-5', { delay: 60 });
await sleep(900);
qf = await qfixStored();
check('getalveld: "-5" wordt -5 (niet 5)', qf[1].answer === -5 && (await qfixNum.inputValue()) === '-5');
await qfixNum.press('Control+a');
await page.keyboard.type('2,5', { delay: 60 });
await qfixNum.blur();
await sleep(900);
qf = await qfixStored();
check('getalveld: "2,5" wordt 2,5 (niet 25)', qf[1].answer === 2.5 && (await qfixNum.inputValue()) === '2,5');
// A11Y6 + A11Y10: speler, één vraag per scherm, nabespreking
await go('/#/speel/QFIXSP');
// zonder verplichte naam is er geen naamveld, wel de knop "Starten"
if (await page.locator('#student-name').isVisible().catch(() => false)) await page.fill('#student-name', 'Testleerling');
await page.getByRole('button', { name: /Starten/ }).click();
await page.waitForSelector('.question-card', { timeout: 10000 }).catch(() => {});
await page.locator('.answer-option', { hasText: 'Antwerpen' }).click();
await page.getByRole('button', { name: /Volgende/ }).click();
await sleep(300);
check('na "Volgende" ligt de focus in de nieuwe vraag',
  await page.evaluate(() => !!document.activeElement?.closest('.quiz-vraag-focus') && document.body.innerText.includes('De zon is een ster.')));
await page.locator('.answer-option', { hasText: 'Juist' }).first().click();
await page.getByRole('button', { name: /Indienen/ }).click();
await sleep(700);
const qfixFout = page.locator('.question-card').filter({ has: page.locator('.badge', { hasText: '0/1' }) }).first();
check('nabespreking: fout gekozen optie zegt "jouw keuze" (niet alleen kleur)',
  await qfixFout.locator('.answer-option.incorrect', { hasText: 'jouw keuze' }).isVisible().catch(() => false));
check('nabespreking: juiste optie zegt "goed antwoord"',
  await qfixFout.locator('.answer-option.correct', { hasText: 'goed antwoord' }).isVisible().catch(() => false));
// ── 31. Toegankelijkheid: skiplink, modals, paginatitel, themawissel ────────
console.log('31. Toegankelijkheid: skiplink, modals, paginatitel, themawissel');
const actief = () => page.evaluate(() => {
  const e = document.activeElement;
  return {
    id: e?.id ?? '',
    tag: e?.tagName.toLowerCase() ?? '',
    tekst: (e?.getAttribute('aria-label') || e?.textContent || '').trim().slice(0, 40),
    inModal: !!e?.closest('.modal'),
    inLade: !!e?.closest('.drawer'),
  };
});
// Een verse lading (niet enkel een hashwissel), zodat ook de titel bij het opstarten gemeten wordt.
const vers = async (hash) => { await page.goto('about:blank'); await go(hash); };
// Tab n keer en geef terug hoeveel keer de focus buiten de modal viel (en of een <summary> de focus kreeg).
const tabInModal = async (n) => {
  let buiten = 0; let summary = false;
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const a = await actief();
    if (!a.inModal) buiten++;
    if (a.tag === 'summary') summary = true;
  }
  return { buiten, summary };
};

// Skiplink: "#main" is in een hash-router een route (/main), dus de link moet de focus verplaatsen.
await vers('/#/widgets');
await page.keyboard.press('Tab');
check('skiplink is het eerste tabstop', (await actief()).tekst === 'Naar de inhoud');
await page.keyboard.press('Enter');
await sleep(300);
check('skiplink: de route blijft /widgets (geen sprong naar /main)', page.url().includes('#/widgets'));
check('skiplink: de focus staat op main', (await actief()).id === 'main');

// Invulmodal van een sjabloon: getypte tekst blijft in het veld waarin je typt.
await go('/#/nieuw');
await page.locator('section[aria-labelledby=cat-templates] button.type-card', { hasText: 'Diagnostische instap' }).click();
await sleep(500);
const sjVelden = page.locator('.modal input.input');
const sjAantal = await sjVelden.count();
check(`sjabloonmodal heeft meerdere invulvelden (${sjAantal})`, sjAantal >= 2);
const sjVoor = await sjVelden.evaluateAll((els) => els.map((e) => e.value));
await sjVelden.nth(1).click();
await page.keyboard.type('abc', { delay: 40 });
await sleep(200);
const sjNa = await sjVelden.evaluateAll((els) => els.map((e) => e.value));
check('sjabloonmodal: "abc" in veld 2 blijft in veld 2', sjNa[1] === 'abc' && sjNa[0] === sjVoor[0] && sjNa[2] === sjVoor[2]);
check('sjabloonmodal: de focus blijft in veld 2', await page.evaluate(() => document.activeElement === document.querySelectorAll('.modal input.input')[1]));
await page.keyboard.press('Escape');
await sleep(300);
check('Escape sluit de sjabloonmodal', (await page.locator('.modal').count()) === 0);

// Focus keert na Escape terug bij de knop die de modal opende, ook als een veld autoFocus heeft.
await go('/#/klassen');
await page.getByRole('button', { name: /Nieuwe klas/ }).first().focus();
await page.keyboard.press('Enter');
await sleep(500);
check('Nieuwe klas: de modal opent met de focus erin', (await actief()).inModal);
await page.keyboard.press('Escape');
await sleep(300);
check('Nieuwe klas: Escape sluit de modal', (await page.locator('.modal').count()) === 0);
const naKlas = await actief();
check('Nieuwe klas: Escape zet de focus terug op de knop "Nieuwe klas"', naKlas.tag === 'button' && naKlas.tekst.includes('Nieuwe klas'));

// Focusval van de deelmodal: ook <summary> telt mee en een dichte <details> verbergt zijn knoppen.
await go('/#/widgets');
await page.locator('.widget-card').first().locator('button[aria-label^="Acties"]').click();
await page.getByRole('menuitem', { name: /Delen/ }).click();
await sleep(700);
const dicht = await tabInModal(25);
check('deelmodal (details dicht): Tab blijft binnen de modal', dicht.buiten === 0);
check('deelmodal (details dicht): de samenvatting is bereikbaar met Tab', dicht.summary);
await page.locator('.modal summary', { hasText: 'Meer manieren om te delen' }).click();
await sleep(300);
const open = await tabInModal(30);
check('deelmodal (details open): Tab blijft binnen de modal', open.buiten === 0);
await page.keyboard.press('Escape');
await sleep(300);

// Paginatitel: volgt de route, ook zonder herladen; op leerlingroutes nooit "widget".
await vers('/#/klassen');
check(`titel op /klassen begint met "Klassen" (${await page.title()})`, (await page.title()).startsWith('Klassen'));
await page.locator('.topnav a', { hasText: 'Resultaten' }).click();
await sleep(400);
check('titel volgt een routewissel zonder herladen', (await page.title()).startsWith('Resultaten'));
await vers(`/#/speel/${quiz.code}`);
check(`titel op een oefening: "Oefening" (${await page.title()})`, (await page.title()).startsWith('Oefening'));
await vers('/#/meedoen');
check('titel op /meedoen: "Meedoen", zonder "widget"', (await page.title()).startsWith('Meedoen') && !/widget/i.test(await page.title()));

// Themawissel in "Meer": de menuknop blijft bestaan, dus de focus blijft op "Thema".
await go('/#/');
await page.getByRole('button', { name: 'Meer', exact: true }).click();
await sleep(200);
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await sleep(300);
check('themawissel: de focus blijft op het menu-item "Thema"', (await actief()).tekst.startsWith('Thema'));
await page.keyboard.press('Enter');
await page.keyboard.press('Enter'); // drie keer: weer terug op "automatisch"
await sleep(300);
const naThema = await actief();
check('themawissel: na een volledige ronde staat de focus nog op "Thema" (automatisch)', naThema.tekst.startsWith('Thema') && /automatisch/.test(naThema.tekst));
await page.keyboard.press('Escape');

// Dezelfde themawissel in de lade op smalle schermen: de focus blijft in de lade.
await page.setViewportSize({ width: 390, height: 800 });
await go('/#/');
await page.getByRole('button', { name: 'Menu openen' }).click();
await sleep(300);
await page.locator('.drawer button', { hasText: /Thema/ }).click();
await sleep(300);
const ladeThema = await actief();
check('themawissel in de lade: de focus blijft op "Thema"', ladeThema.inLade && ladeThema.tekst.startsWith('Thema'));
await page.locator('.drawer button', { hasText: /Thema/ }).click();
await page.locator('.drawer button', { hasText: /Thema/ }).click(); // terug op "automatisch"
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1360, height: 900 });
// ── 32. Leerlingpad: deadline, tijdslimiet, pogingen, focus (debugronde okt. 2026) ──
// Elk geval in een vers toestel van 390 px breed, via een draagbare link. Waar
// de tijd telt, draait de klok van de pagina nep (page.clock): fastForward
// is een toestel dat sliep of een tabblad op de achtergrond.
console.log('32. Leerlingpad: deadline, tijd, pogingen, focus');
const llLink = (w) => `${BASE}/#/open?d=${LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, w }))}`;
const llSettings = { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: true, instructions: '' };
const llWidget = (id, type, title, config, settings = {}) => ({
  id, type, title, folderId: null, code: id.toUpperCase().slice(0, 6), config,
  settings: { ...llSettings, ...settings }, createdAt: Date.now(), updatedAt: Date.now(),
});
const llQuiz = (id, title, questions, settings) => llWidget(id, 'quiz', title, { layout: 'single', questions }, settings);
const llMc = (id, prompt) => ({ id, type: 'mc', prompt, points: 1, options: ['A', 'B', 'C'], correctIndex: 0 });
const llOpen = async ({ clock = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror(27): ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`console(27): ${m.text()}`); });
  if (clock) await p.clock.install({ time: Date.now() });
  // met nepklok: timers en animatieframes laten lopen, en echte tijd voor netwerk en chunks
  const wacht = async (ms) => { if (clock) await p.clock.runFor(ms); await sleep(ms); };
  return { ctx, p, wacht };
};
const llSubs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]'));
const llFocus = (p) => p.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  return a.matches('.result-hero h2') ? 'resultaatkop' : a.tagName.toLowerCase();
});
const llTimer = async (p) => {
  const m = /(\d+):(\d\d)/.exec(await p.locator('[role=timer]').innerText().catch(() => ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};
const llStart = async (p, wacht, naam) => {
  if (naam !== undefined) await p.fill('#student-name', naam);
  await p.getByRole('button', { name: 'Starten' }).click();
  await wacht(500);
};

// LL1 + A11Y6 + LL14: de deadline verstrijkt terwijl de leerling bezig is
for (const metTijd of [true, false]) {
  const label = metTijd ? 'met tijdslimiet' : 'zonder tijdslimiet';
  const { ctx, p, wacht } = await llOpen({ clock: true });
  const w = llQuiz(metTijd ? 'dlmet1' : 'dlzon1', `Deadline ${label}`, [llMc('q1', 'Vraag 1'), llMc('q2', 'Vraag 2')], {
    timeLimitMin: metTijd ? 10 : 0, expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  await p.goto(llLink(w), { waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'Emma');
  check(`A11Y6 (${label}): na "Starten" staat de focus niet op body`, (await llFocus(p)) !== 'body');
  await p.locator('.answer-option').first().click();
  await p.getByRole('button', { name: /Volgende/ }).click();
  await wacht(200);
  await p.locator('.answer-option').first().click();
  await p.clock.fastForward(120000); // de deadline (1 min) verstrijkt tijdens het werken
  await wacht(1100);
  check(`LL1 (${label}): na de deadline blijft de speler staan`, (await p.locator('.question-card').first().isVisible()) && (await p.locator('text=Deze opdracht is afgesloten').count()) === 0);
  await p.getByRole('button', { name: /Indienen/ }).click();
  await wacht(600);
  await p.locator('input[aria-label="Resultaatcode"]').waitFor({ timeout: 10000 }).catch(() => {});
  check(`LL1 (${label}): indienen na de deadline bewaart de inzending`, (await llSubs(p)).length === 1);
  check(`LL1 (${label}): resultaat en resultaatcode zichtbaar`, (await p.locator('.result-hero').first().isVisible()) && (await p.locator('input[aria-label="Resultaatcode"]').isVisible()));
  check(`A11Y6 (${label}): na het indienen staat de focus op de kop van het resultaat`, (await llFocus(p)) === 'resultaatkop');
  if (metTijd) {
    await p.getByRole('button', { name: 'Code kopiëren' }).first().waitFor({ timeout: 10000 }).catch(() => {});
    check('LL14: één knop "Code kopiëren", geen "QR kopiëren"', (await p.getByRole('button', { name: 'Code kopiëren' }).count()) === 1 && (await p.getByRole('button', { name: /QR kopi/ }).count()) === 0);
  } else {
    // Een verse start ná de deadline kan wel niet meer: herladen ...
    await p.reload({ waitUntil: 'networkidle' });
    await wacht(300);
    check('LL1: na de deadline opnieuw openen toont "afgesloten"', await p.locator('text=Deze opdracht is afgesloten').isVisible());
    // ... en ook niet wie op de startpoort bleef staan tot na de deadline.
    const nu = await p.evaluate(() => Date.now());
    const w2 = llQuiz('dlpoo1', 'Deadline op de startpoort', [llMc('q1', 'Vraag 1')], { expiresAt: new Date(nu + 60000).toISOString() });
    await p.goto(llLink(w2), { waitUntil: 'networkidle' });
    await wacht(300);
    await p.fill('#student-name', 'Emma');
    await p.clock.fastForward(120000);
    await llStart(p, wacht);
    check('LL1: starten na de deadline (poort bleef open) toont "afgesloten"', (await p.locator('text=Deze opdracht is afgesloten').isVisible()) && (await p.locator('.question-card').count()) === 0);
  }
  await ctx.close();
}

// LL5: de tijdslimiet loopt door terwijl het toestel slaapt
{
  const { ctx, p, wacht } = await llOpen({ clock: true });
  const w = llQuiz('tijd01', 'Toets met tijd', [llMc('q1', 'Vraag 1'), llMc('q2', 'Vraag 2')], { timeLimitMin: 2 });
  await p.goto(llLink(w), { waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'Emma');
  await wacht(2000);
  const t0 = await llTimer(p);
  check(`LL5: de timer loopt (${t0} s over)`, t0 >= 110 && t0 <= 119);
  await p.clock.fastForward('05:00'); // laptop dicht, vijf minuten later weer open
  await wacht(1100);
  check(`LL5: na 5 minuten slaap is de tijd om (timer ${await llTimer(p)} s)`, (await llTimer(p)) === 0);
  check('LL5: de quiz is bij "tijd om" automatisch ingediend', (await llSubs(p)).length === 1 && (await p.locator('.result-hero').first().isVisible()));
  await ctx.close();
}
// LL5: herladen met een spatie achter de naam geeft geen nieuwe tijd
{
  const { ctx, p, wacht } = await llOpen({ clock: true });
  const w = llQuiz('tijd02', 'Hervatten met tijd', [llMc('q1', 'Vraag 1'), llMc('q2', 'Vraag 2'), llMc('q3', 'Vraag 3')], { timeLimitMin: 5 });
  await p.goto(llLink(w), { waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'Emma');
  await p.locator('.answer-option').nth(1).click();
  await p.getByRole('button', { name: /Volgende/ }).click();
  await wacht(300);
  await p.clock.fastForward(60000);
  await wacht(1100);
  await p.reload({ waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'emma ');
  const t1 = await llTimer(p);
  check(`LL5: herladen met "emma " geeft geen nieuwe tijd (${t1} s over, max. 240)`, t1 > 0 && t1 <= 240);
  await ctx.close();
}
// W5: zonder inzendingen belooft de melding geen automatisch indienen
{
  const { ctx, p, wacht } = await llOpen({ clock: true });
  const w = llWidget('tegel1', 'tiptiles', 'Tegels met tijd', { tiles: [{ id: 't1', title: 'Kracht', text: 'Een duw of een trek.' }] }, { timeLimitMin: 1 });
  await p.goto(llLink(w), { waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht);
  await p.clock.fastForward('02:00');
  await wacht(1100);
  const melding = p.locator('.callout.err', { hasText: 'De tijd is om' });
  check('W5: "De tijd is om!" verschijnt', await melding.isVisible());
  check('W5: oefening zonder inzendingen belooft geen automatisch indienen', !/ingediend/.test(await melding.innerText().catch(() => 'ingediend')));
  await ctx.close();
}

// LL8: een poging telt bij het indienen, niet bij het starten (kruiswoord, max. 1)
{
  const { ctx, p, wacht } = await llOpen();
  const w = llWidget('kruis1', 'crossword', 'Kruiswoord met één kans', {
    entries: [{ id: 'e1', word: 'boom', clue: 'Groeit in het bos' }, { id: 'e2', word: 'maan', clue: 'Schijnt in de nacht' }],
  }, { maxAttempts: 1 });
  await p.goto(llLink(w), { waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'Lotte');
  check('LL8: kruiswoord gestart', (await p.locator('.cross-cell input').count()) > 0);
  await p.reload({ waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'Lotte');
  check('LL8: herladen kost geen poging', (await p.locator('.cross-cell input').count()) > 0 && (await p.locator('text=Maximaal aantal pogingen').count()) === 0);
  await p.getByRole('button', { name: /Indienen/ }).click();
  await wacht(600);
  check('LL8: indienen bewaart één inzending', (await llSubs(p)).length === 1);
  await p.reload({ waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'lotte ');
  check('LL8: na één keer indienen (max. 1) is de opdracht geblokkeerd', await p.locator('text=Maximaal aantal pogingen bereikt').isVisible());
  await ctx.close();
}

// LL4 + LL15: een andere draagbare link in hetzelfde tabblad; de bewaarknop
{
  const { ctx, p, wacht } = await llOpen();
  const A = llQuiz('wisa01', 'Oefening A', [llMc('q1', 'Vraag A1'), llMc('q2', 'Vraag A2')], { instructions: 'Instructie A' });
  const B = llQuiz('wisb01', 'Oefening B', [llMc('q1', 'Vraag B1')], { instructions: 'Instructie B' });
  await p.goto(llLink(A), { waitUntil: 'networkidle' });
  await wacht(300);
  const bewaar = p.getByRole('button', { name: 'Leerkracht? Bewaar bij je materiaal' });
  const box = await bewaar.boundingBox();
  check('LL15: bewaarknop zonder "widget", minstens 44 px hoog', !!box && box.height >= 44);
  check('LL15: geen horizontaal scrollen op 390 px', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await bewaar.click();
  await wacht(300);
  check('LL15: melding "Bewaard bij je materiaal"', await p.locator('text=Bewaard bij je materiaal').first().isVisible());
  await llStart(p, wacht, 'Emma');
  check('LL4: oefening A speelt', (await p.locator('.question-card', { hasText: 'Vraag A1' }).count()) === 1);
  await p.evaluate((h) => { location.hash = h; }, new URL(llLink(B)).hash);
  await wacht(800);
  check('LL4: na een hashwissel de startpoort van B (titel, instructie, leeg naamveld)',
    (await p.locator('.player-topbar .title').innerText()) === 'Oefening B'
    && (await p.locator('text=Instructie B').isVisible())
    && (await p.inputValue('#student-name')) === ''
    && (await p.locator('.question-card').count()) === 0);
  check('LL4: de bewaarknop geldt weer voor B', await p.getByRole('button', { name: 'Leerkracht? Bewaar bij je materiaal' }).isEnabled());
  await ctx.close();
}

// LL7: zonder naamplicht toch tonen als welke klasleerling je werkt
{
  const { ctx, p, wacht } = await llOpen();
  await p.goto(`${BASE}/#/meedoen`, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('wf.student.v1', JSON.stringify({ classId: 'c1', classCode: 'KLAS12', className: '1A', studentId: 's1', studentName: 'Anna Peeters' })));
  await p.goto(llLink(llQuiz('anon01', 'Zonder naamplicht', [llMc('q1', 'Vraag 1')], { requireName: false })), { waitUntil: 'networkidle' });
  await wacht(400);
  check('LL7: startpoort toont "Je werkt als Anna Peeters" met "Wissel"', (await p.locator('text=Je werkt als').isVisible()) && (await p.getByRole('button', { name: /Niet jij\? Wissel/ }).isVisible()));
  await p.getByRole('button', { name: /Niet jij\? Wissel/ }).click();
  await wacht(200);
  check('LL7: na "Wissel" geen klasidentiteit en geen verplicht naamveld', (await p.evaluate(() => localStorage.getItem('wf.student.v1'))) === null && (await p.locator('#student-name').count()) === 0);
  await ctx.close();
}

// LL11: een ingeleverd bestand reist niet mee in de resultaatcode
{
  const { ctx, p, wacht } = await llOpen();
  await p.goto(llLink(llQuiz('upl001', 'Verslag inleveren', [{ id: 'u1', type: 'upload', prompt: 'Lever je verslag in', points: 2, maxMb: 2 }])), { waitUntil: 'networkidle' });
  await wacht(300);
  await llStart(p, wacht, 'Emma');
  await p.setInputFiles('.question-card input[type=file]', { name: 'verslag.txt', mimeType: 'text/plain', buffer: Buffer.from('Mijn verslag') });
  await wacht(600);
  await p.getByRole('button', { name: /Indienen/ }).click();
  await wacht(800);
  check('LL11: resultaatkaart zegt dat het bestand apart bezorgd moet worden', await p.locator('.callout', { hasText: 'Je bestand ‘verslag.txt’ zit niet in deze code' }).isVisible());
  await ctx.close();
}

// A11Y11: de meedoen-pagina leidt leerlingen niet naar de leerkrachtschil
{
  const { ctx, p, wacht } = await llOpen();
  await p.goto(`${BASE}/#/meedoen`, { waitUntil: 'networkidle' });
  await wacht(400);
  check('A11Y11: geen link naar #/ in de leerlingtopbalk', (await p.locator('header a[href="#/"]').count()) === 0);
  await p.locator('header .topbar-logo').click();
  await wacht(500);
  check('A11Y11: tik op het logo: blijft op meedoen, geen voorbeeldmateriaal', /#\/meedoen$/.test(p.url()) && (await p.evaluate(() => JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]').length)) === 0);
  check('A11Y11: leerkrachten hebben een eigen link "Ik ben leerkracht"', (await p.locator('.join-links a[href="#/"]', { hasText: 'Ik ben leerkracht' }).count()) === 1);
  await p.goto(`${BASE}/#/open?d=rommel`, { waitUntil: 'networkidle' });
  await wacht(300);
  check('A11Y11: kapotte deellink verwijst naar "Code invoeren", niet naar de leerkrachtschil', (await p.locator('a[href="#/meedoen"]', { hasText: 'Code invoeren' }).count()) === 1 && (await p.locator('a[href="#/"]').count()) === 0);
  await ctx.close();
}

// ── 33. QR van de draagbare link is leesbaar (of eerlijk te lang) ───────────
console.log('33. QR van de draagbare link');
{
  // Links van ±524, ±1700 en ±2240 tekens (de laatste blijft ruim onder
  // QR_MAX_CHARS) en één boven QR_MAX_CHARS (2300). Elke widget heeft
  // onsamendrukbare tekst in de instructie; de aantallen zijn geijkt op de
  // lz-stringcompressie. jsQR draait in de pagina, op de echte afbeelding van
  // de deelmodal én op een schermafdruk van wat de leerkracht op een
  // 1x-scherm ziet.
  const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const willekeurig = (n) => { let x = 7; let s = ''; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += ALFABET[x % ALFABET.length]; } return s; };
  const gevallen = [
    { id: 'smokeqr1', code: 'SMKQR1', tekens: 70, minLink: 450 },
    { id: 'smokeqr2', code: 'SMKQR2', tekens: 1040, minLink: 1500 },
    { id: 'smokeqr3', code: 'SMKQR3', tekens: 1500, minLink: 2000 },
    { id: 'smokeqr4', code: 'SMKQR4', tekens: 1700, minLink: 2301 },
  ];
  await page.evaluate((lijst) => {
    const ws = JSON.parse(localStorage.getItem('wf.widgets.v1'));
    for (const g of lijst) {
      ws.unshift({
        id: g.id, type: 'imageviewer', title: `Smoke QR ${g.code.slice(-1)}`, folderId: null,
        config: { imageUrl: '', description: 'test' },
        settings: { accentColor: '#4f46e5', shuffle: false, showFeedback: true, showScore: true, timeLimitMin: 0, maxAttempts: 0, requireName: false, instructions: g.tekst },
        code: g.code, createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
    localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
  }, gevallen.map((g) => ({ ...g, tekst: willekeurig(g.tekens) })));

  const jsqrBron = readFileSync(new URL('../node_modules/jsqr/dist/jsQR.js', import.meta.url), 'utf8');
  const lees = (src) => page.evaluate(async (bron) => {
    if (typeof window.jsQR !== 'function') (0, eval)(bron.js);
    const img = new Image();
    img.src = bron.src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(d.data, d.width, d.height);
    return r ? r.data : null;
  }, { src, js: jsqrBron });

  const QR_ALT = 'img[alt^="QR-code van de draagbare link"]';
  for (const g of gevallen) {
    await go('/#/widgets');
    await go(`/#/bewerk/${g.id}`);
    await page.getByRole('button', { name: /^Delen$/ }).first().click();
    await page.waitForFunction(() => /^http/.test(document.querySelector('input[aria-label="Draagbare deellink"]')?.value ?? ''), null, { timeout: 8000 }).catch(() => {});
    await page.locator('summary', { hasText: 'Meer manieren om te delen' }).click();
    await page.waitForSelector(`${QR_ALT}, .modal .callout:has-text("Te groot voor een QR-code")`, { timeout: 10000 }).catch(() => {});
    const link = await page.locator('input[aria-label="Draagbare deellink"]').inputValue();
    const lang = link.length > 2300;
    console.log(`  – link van ${link.length} tekens${lang ? ' (boven QR_MAX_CHARS)' : ''}`);
    check(`link van ${link.length} tekens ligt in het bedoelde bereik`, link.length >= g.minLink && (g.minLink > 2300 || link.length <= 2300));

    const qrImg = page.locator(QR_ALT);
    if (lang) {
      check('te lange link: geen QR-afbeelding', (await qrImg.count()) === 0);
      const uitleg = page.locator('.modal .callout', { hasText: 'Te groot voor een QR-code' });
      check('te lange link: duidelijke uitleg met de reden', await uitleg.isVisible() && /te veel/.test(await uitleg.innerText()) && /Kopieer de link/.test(await uitleg.innerText()));
      check('te lange link: kopieerknop "Link kopiëren" als alternatief', await uitleg.getByRole('button', { name: 'Link kopiëren' }).isVisible());
      await page.keyboard.press('Escape');
      continue;
    }
    check('QR-afbeelding zichtbaar', await qrImg.isVisible());
    const m = await qrImg.evaluate((img) => {
      const r = img.getBoundingClientRect();
      return { natuurlijk: img.naturalWidth, breedte: r.width, rendering: getComputedStyle(img).imageRendering };
    });
    const modules = m.natuurlijk / 4;
    check(`gehele schaal: ${m.natuurlijk} px is een veelvoud van 4 (${modules} modules)`, Number.isInteger(modules));
    check(`QR is minstens 200 css-px breed (${Math.round(m.breedte)})`, m.breedte >= 200);
    check(`minstens 2 css-px per module (${(m.breedte / modules).toFixed(2)})`, m.breedte / modules >= 2 - 1e-9);
    check('geheel aantal css-px per module (scherp)', Math.abs(m.breedte / modules - Math.round(m.breedte / modules)) < 1e-6);
    check('image-rendering: pixelated', m.rendering === 'pixelated');
    const src = await qrImg.getAttribute('src');
    check('jsQR leest de afbeelding en vindt precies de link terug', (await lees(src)) === link);
    const scherm = await qrImg.screenshot();
    check('jsQR leest ook de QR zoals hij op een 1x-scherm staat', (await lees(`data:image/png;base64,${scherm.toString('base64')}`)) === link);
    check('"QR downloaden" biedt een png aan', (await page.locator('.modal a[download$=".png"]', { hasText: 'QR downloaden' }).getAttribute('download')) === `qr-${g.code}.png`);
    check('"Link kopiëren" naast de QR', await page.locator('.modal').getByRole('button', { name: 'Link kopiëren' }).isVisible());

    if (g === gevallen[2]) {
      // Smal scherm (390 px): de modal en de pagina scrollen niet horizontaal.
      await page.setViewportSize({ width: 390, height: 844 });
      await sleep(300);
      const smal = await page.evaluate(() => {
        const body = document.querySelector('.modal-body');
        const img = document.querySelector('.modal img[alt^="QR-code van de draagbare link"]');
        const kader = body.getBoundingClientRect();
        const r = img.getBoundingClientRect();
        return {
          pagina: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          modal: body.scrollWidth <= body.clientWidth,
          binnen: r.left >= kader.left - 1 && r.right <= kader.right + 1,
        };
      });
      check('op 390 px: pagina scrolt niet horizontaal', smal.pagina);
      check('op 390 px: de modal scrolt niet horizontaal en de QR past erin', smal.modal && smal.binnen);
      await page.setViewportSize({ width: 1360, height: 900 });
      await sleep(200);
    }
    await page.keyboard.press('Escape');
  }
}

// ── 34. Toetsenbord: woordzoeker en zoek-de-verschillen ─────────────────────
console.log('34. Toetsenbordbediening: woordzoeker en zoek-de-verschillen');
{
  const pngUrl = (rgb) => `data:image/png;base64,${buildPng(40, 30, rgb).toString('base64')}`;
  const sdWidgets = [
    spelWidget('spotdifference', 'SMKZDV', {
      imageA: pngUrl([40, 120, 200]), imageB: pngUrl([40, 120, 200]),
      differences: [
        { id: 'd1', x: 25, y: 30, radius: 6, label: '' },
        { id: 'd2', x: 70, y: 40, radius: 6, label: 'de boom' },
        { id: 'd3', x: 50, y: 80, radius: 6, label: '' },
      ],
    }),
    spelWidget('spotdifference', 'SMKZDL', { imageA: '', imageB: '', differences: [] }),
  ];
  await page.setViewportSize({ width: 1360, height: 900 });
  await go('/#/widgets');
  await page.evaluate((ws) => {
    const all = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
    localStorage.setItem('wf.widgets.v1', JSON.stringify([...ws, ...all.filter((w) => !ws.some((x) => x.id === w.id))]));
  }, sdWidgets);
  const voorbeeldWz = await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('wf.widgets.v1')).find((x) => x.type === 'wordsearch' && x.title === 'Voorbeeld: woordzoeker weer');
    return w ? { code: w.code, words: w.config.words } : null;
  });
  check('de voorbeeld-woordzoeker staat in de bibliotheek', !!voorbeeldWz);

  const live = () => page.evaluate(() => [...document.querySelectorAll('[role=status].sr-only')].map((e) => (e.textContent || '').replace(/ /g, '').trim()).join('|'));
  const tabNaar = async (selector) => {
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate((s) => !!document.activeElement?.matches(s), selector)) return i + 1;
    }
    return -1;
  };

  // ── Woordzoeker ──
  await spelStarten(voorbeeldWz.code);
  const wz = await page.evaluate(() => {
    const g = document.querySelector('.ws-grid');
    const cellen = [...g.querySelectorAll('td')];
    return {
      rol: g.getAttribute('role'),
      naam: g.getAttribute('aria-label'),
      uitleg: document.getElementById(g.getAttribute('aria-describedby') || '')?.textContent || '',
      aantal: cellen.length,
      gridcells: cellen.filter((c) => c.getAttribute('role') === 'gridcell').length,
      rijen: g.querySelectorAll('tr[role=row]').length,
      tab0: cellen.filter((c) => c.getAttribute('tabindex') === '0').length,
      tabMin: cellen.filter((c) => c.getAttribute('tabindex') === '-1').length,
      labelsOk: cellen.every((c) => /^Rij \d+, kolom \d+: [A-Z]$/.test(c.getAttribute('aria-label') || '')),
    };
  });
  check('woordzoeker: een rooster (role=grid) met naam en uitleg over het toetsenbord', wz.rol === 'grid' && wz.naam === 'Woordzoeker' && /pijltjes en Enter/.test(wz.uitleg));
  check('woordzoeker: 100 gridcells in 10 rijen, elk met een label "Rij 3, kolom 5: K"', wz.aantal === 100 && wz.gridcells === 100 && wz.rijen === 10 && wz.labelsOk);
  check('woordzoeker: roving tabindex, één cel met tabindex 0 en 99 met -1', wz.tab0 === 1 && wz.tabMin === 99);
  const tabs = await tabNaar('.ws-cell');
  check('woordzoeker: met Tab kom je in het rooster, op de eerste cel', tabs > 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).startsWith('Rij 1, kolom 1:'));
  const cel = () => page.evaluate(() => document.activeElement?.dataset?.ws ?? '');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  check('woordzoeker: pijltjes verplaatsen de focus (rij 2, kolom 2)', (await cel()) === '1,1');
  await page.keyboard.press('End');
  check('woordzoeker: End gaat naar de laatste kolom van de rij', (await cel()) === '9,1');
  await page.keyboard.press('ArrowRight');
  check('woordzoeker: aan de rand blijft de focus staan', (await cel()) === '9,1');
  await page.keyboard.press('Home');
  check('woordzoeker: Home gaat naar de eerste kolom', (await cel()) === '0,1');
  await page.keyboard.press('Control+Home');
  check('woordzoeker: Ctrl+Home gaat naar de eerste cel', (await cel()) === '0,0');
  check('woordzoeker: na het verplaatsen is de focuscel de enige met tabindex 0', await page.evaluate(() => { const t = [...document.querySelectorAll('.ws-cell[tabindex="0"]')]; return t.length === 1 && t[0] === document.activeElement; }));
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { stijl: cs.outlineStyle, breedte: parseFloat(cs.outlineWidth) }; });
  check('woordzoeker: de focuscel heeft een zichtbare focusring', ring.stijl === 'solid' && ring.breedte >= 2);

  // Enter zet het begin, Escape annuleert
  await page.keyboard.press('Enter');
  check('woordzoeker: Enter kiest het begin (cel gemarkeerd, aria-selected, melding)', (await page.locator('.ws-cell.sel').count()) === 1 && (await page.locator('.ws-cell[aria-selected=true]').count()) === 1 && /Begin gekozen/.test(await live()));
  await page.keyboard.press('Escape');
  check('woordzoeker: Escape annuleert de selectie en meldt het', (await page.locator('.ws-cell.sel').count()) === 0 && /Selectie geannuleerd/.test(await live()));
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  check('woordzoeker: spatie kiest ook; de selectie volgt de focus', (await page.locator('.ws-cell.sel').count()) === 2);
  await page.keyboard.press('Space');
  check('woordzoeker: twee letters zijn geen woord: "Geen woord"', /Geen woord/.test(await live()) && (await page.locator('.ws-cell.sel').count()) === 0 && (await page.locator('.ws-cell.found').count()) === 0);

  // Alle woorden vinden met alleen toetsen
  const rooster = await page.evaluate(() => {
    const r = [];
    for (const td of document.querySelectorAll('.ws-cell')) {
      const [x, y] = td.dataset.ws.split(',').map(Number);
      (r[y] ??= [])[x] = td.getAttribute('aria-label').slice(-1);
    }
    return r;
  });
  const richtingen = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];
  const vindWoord = (woord) => {
    const n = rooster.length;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const [dx, dy] of richtingen) {
      let ok = true;
      for (let i = 0; i < woord.length && ok; i++) ok = rooster[y + dy * i]?.[x + dx * i] === woord[i];
      if (ok) return { van: [x, y], tot: [x + dx * (woord.length - 1), y + dy * (woord.length - 1)] };
    }
    return null;
  };
  const naarCel = async (x, y) => {
    const [cx, cy] = (await cel()).split(',').map(Number);
    for (let i = 0; i < Math.abs(x - cx); i++) await page.keyboard.press(x > cx ? 'ArrowRight' : 'ArrowLeft');
    for (let i = 0; i < Math.abs(y - cy); i++) await page.keyboard.press(y > cy ? 'ArrowDown' : 'ArrowUp');
  };
  const woorden = voorbeeldWz.words.map((w) => w.toUpperCase());
  let gevonden = 0;
  for (const w of woorden) {
    const plek = vindWoord(w);
    if (!plek) { check(`woordzoeker: ${w} staat in het rooster`, false); continue; }
    await naarCel(...plek.van); await page.keyboard.press('Enter');
    await naarCel(...plek.tot); await page.keyboard.press('Enter');
    gevonden++;
    if (gevonden < woorden.length) {
      check(`woordzoeker: met toetsen gevonden: ${w} (melding "Gevonden: ${w}")`, (await live()).includes(`Gevonden: ${w}`) && await page.locator('.badge', { hasText: `${gevonden} / ${woorden.length} gevonden` }).first().isVisible());
    }
  }
  await sleep(300);
  check(`woordzoeker: alle ${woorden.length} woorden met alleen toetsen gevonden`, await page.locator('text=/Alle woorden gevonden/').first().isVisible());

  // Slepen met de muis blijft werken
  await page.getByRole('button', { name: /Opnieuw/ }).click();
  await sleep(300);
  {
    const plek = vindWoord(woorden[0]);
    const doos = async ([x, y]) => (await page.locator(`.ws-cell[data-ws="${x},${y}"]`).boundingBox());
    const a = await doos(plek.van); const b = await doos(plek.tot);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    await sleep(200);
    check('woordzoeker: slepen met de muis vindt nog altijd een woord', await page.locator('.badge', { hasText: `1 / ${woorden.length} gevonden` }).first().isVisible() && (await page.locator('.ws-cell.found').count()) === woorden[0].length);
  }

  // 390 px
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/#/widgets'); // een hash-wissel naar dezelfde code zou het lopende spel laten staan
  await spelStarten(voorbeeldWz.code);
  check('390 px: de woordzoeker scrolt niet horizontaal', await passtOpSmal());
  await tabNaar('.ws-cell');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight');
  check('390 px: ook met toetsenbordfocus en een selectie scrolt niets horizontaal', await passtOpSmal());
  check('390 px: alle cellen blijven binnen het scherm', await page.locator('.ws-cell').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().right <= 391)));

  // ── Zoek de verschillen ──
  await page.setViewportSize({ width: 1360, height: 900 });
  await spelStarten('SMKZDV');
  const sd = await page.evaluate(() => {
    const s = document.querySelector('.spotdifference-stage');
    return { rol: s?.getAttribute('role'), tab: s?.getAttribute('tabindex'), label: s?.getAttribute('aria-label') || '', kruisje: s ? getComputedStyle(s.querySelector('[data-testid=sd-cursor]')).display : '' };
  });
  check('zoek de verschillen: afbeelding B is focusbaar en heeft een label met uitleg', sd.tab === '0' && sd.rol === 'application' && /pijltjestoetsen/.test(sd.label) && /Enter/.test(sd.label));
  check('zoek de verschillen: het kruisje is verborgen zolang er geen toetsenbordfocus is', sd.kruisje === 'none');
  check('zoek de verschillen: er is geen verborgen knop per verschil (geen verklapper)', (await page.locator('.spotdifference-stage button, .spotdifference-stage [tabindex]:not(.spotdifference-stage)').count()) === 0);
  const sdTabs = await tabNaar('.spotdifference-stage');
  check('zoek de verschillen: met Tab kom je op afbeelding B', sdTabs > 0);
  const kruisje = () => page.evaluate(() => { const k = document.querySelector('[data-testid=sd-cursor]'); return { x: k.style.left, y: k.style.top, d: getComputedStyle(k).display }; });
  const k0 = await kruisje();
  check('zoek de verschillen: bij focus verschijnt het kruisje in het midden (50 % / 50 %)', k0.d !== 'none' && k0.x === '50%' && k0.y === '50%');
  const sdRing = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { stijl: cs.outlineStyle, breedte: parseFloat(cs.outlineWidth) }; });
  check('zoek de verschillen: afbeelding B heeft een zichtbare focusring', sdRing.stijl === 'solid' && sdRing.breedte >= 2);
  const badgeTekst = () => page.locator('.badge').allTextContents().then((t) => t.join(' | '));
  const sdMelding = () => page.locator('[role=status][aria-live=assertive]').textContent();
  await page.keyboard.press('Enter');
  check('zoek de verschillen: Enter op een lege plek meldt "Daar zit geen verschil" en telt 1 fout', /Daar zit geen verschil/.test(await sdMelding()) && /1 fout/.test(await badgeTekst()));
  await page.keyboard.press('Enter');
  check('zoek de verschillen: nog eens Enter telt een tweede fout', /2 fout/.test(await badgeTekst()));
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  const k1 = await kruisje();
  check('zoek de verschillen: pijltjes verschuiven het kruisje met 5 % (nu 25 % / 30 %)', k1.x === '25%' && k1.y === '30%');
  await page.keyboard.press('Shift+ArrowRight');
  check('zoek de verschillen: Shift+pijl verschuift met 1 %', (await kruisje()).x === '26%');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Enter');
  check('zoek de verschillen: Enter op het eerste verschil vindt het ("Juist! … 1 van 3")', /Juist!.*1 van 3/.test(await sdMelding()) && /1 \/ 3 gevonden/.test(await badgeTekst()));
  await page.keyboard.press('Space');
  check('zoek de verschillen: hetzelfde verschil nog eens controleren is geen fout', /al gevonden/.test(await sdMelding()) && /2 fout/.test(await badgeTekst()));
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
  check('zoek de verschillen: het kruisje blijft binnen de afbeelding (0 %)', (await kruisje()).x === '0%');
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('zoek de verschillen: tweede verschil gevonden, met zijn label', /de boom/.test(await sdMelding()) && /2 \/ 3 gevonden/.test(await badgeTekst()));
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(300);
  check('zoek de verschillen: alle drie de verschillen met alleen toetsen gevonden', await page.locator('text=/Alle verschillen gevonden/').first().isVisible());

  // 390 px
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/#/widgets');
  await spelStarten('SMKZDV');
  await tabNaar('.spotdifference-stage');
  await page.keyboard.press('ArrowRight');
  check('390 px: zoek de verschillen scrolt niet horizontaal, ook niet met toetsenbordfocus', await passtOpSmal());

  // Zonder afbeeldingen: "oefening", nooit "widget"
  await spelStarten('SMKZDL');
  const leegTekst = await page.locator('main').innerText();
  check('zoek de verschillen zonder afbeeldingen: "Deze oefening heeft nog geen…", geen "widget"', /Deze oefening heeft nog geen twee afbeeldingen/.test(leegTekst) && !/widget/i.test(leegTekst));
  await page.setViewportSize({ width: 1360, height: 900 });
}

// ── 35. Spelers: tijd om, rekenen, koppelspel, tijdlijn, sneltoetsen ────────
// Herstel uit de debugronde (widgets): negen spelers lazen "tijd om" niet, de
// rekenoefening verloor de focus en kon geen negatieve getallen typen, het
// koppelspel telde dubbele rechtertekst fout, de tijdlijn kon al juist beginnen.
console.log('35. Spelers: tijd om, rekenen, koppelspel, tijdlijn (debugronde)');
await page.setViewportSize({ width: 1360, height: 900 });
const prik31 = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#cde"/></svg>');
const kaarten31 = [{ id: 'f1', front: 'een', back: 'one' }, { id: 'f2', front: 'twee', back: 'two' }, { id: 'f3', front: 'drie', back: 'three' }];
const spelers31 = [
  spelWidget('arithmetic', 'SMKRKN', { ops: ['add'], min: 1, max: 5, count: 3, tables: [] }),
  spelWidget('pairs', 'SMKKPD', { pairs: [{ id: 'p1', left: 'a', right: 'x' }, { id: 'p2', left: 'b', right: 'x' }, { id: 'p3', left: 'c', right: 'x' }, { id: 'p4', left: 'd', right: 'x' }, { id: 'p5', left: 'e', right: 'y' }] }),
  spelWidget('pairs', 'SMKKPE', { pairs: [{ id: 'p1', left: 'a', right: 'b' }, { id: 'p2', left: 'c', right: 'd' }] }),
  spelWidget('timeline', 'SMKTLN', { mode: 'exercise', events: [{ id: 'e1', date: '1900', title: 'Eerste' }, { id: 'e2', date: '2000', title: 'Tweede' }] }),
  spelWidget('flashcards', 'SMKFLK', { autoFlipSec: 0, cards: kaarten31 }),
  spelWidget('carousel', 'SMKCRS', { slides: [1, 2, 3].map((n) => ({ id: `s${n}`, imageUrl: prik31, caption: `Dia ${n}` })) }),
  spelWidget('whiteboard', 'SMKWBK', { prompt: 'Teken iets' }),
  spelWidget('beforeafter', 'SMKBNA', { imageBefore: prik31, imageAfter: prik31, labelBefore: 'Voor', labelAfter: 'Na' }),
  spelWidget('beforeafter', 'SMKBNL', { imageBefore: '', imageAfter: '', labelBefore: 'Voor', labelAfter: 'Na' }),
  spelWidget('mediaplayer', 'SMKMPL', { provider: 'youtube', videoUrl: '', title: '' }),
];
await page.evaluate((ws) => {
  const all = JSON.parse(localStorage.getItem('wf.widgets.v1') || '[]');
  localStorage.setItem('wf.widgets.v1', JSON.stringify([...ws, ...all.filter((w) => !ws.some((x) => x.id === w.id))]));
}, spelers31);

// W6: rekenoefening, de focus blijft in het antwoordveld (readOnly i.p.v. disabled)
await spelStarten('SMKRKN');
{
  const veld = page.getByLabel('Jouw antwoord', { exact: true });
  const som = async () => {
    const t = (await page.locator('div.card.card-pad[aria-live=polite]').first().innerText()).split('\n')[0];
    const m = t.match(/(\d+) \+ (\d+)/);
    return String(Number(m[1]) + Number(m[2]));
  };
  const opVeld = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Jouw antwoord');
  await page.keyboard.type(await som());
  await page.keyboard.press('Enter');
  check('rekenen: na Enter staat de focus nog in het antwoordveld', await opVeld());
  check('rekenen: tijdens de feedback is het veld readOnly (niet uitgeschakeld)', await veld.evaluate((e) => e.readOnly && !e.disabled));
  await sleep(900);
  check('rekenen: na de feedback staat de volgende som er, met de focus in het veld', await page.getByText('Oefening 2 / 3').first().isVisible() && await opVeld());
  await page.keyboard.type('7');
  check('rekenen: meteen doortypen zonder te klikken werkt', (await veld.inputValue()) === '7');
}

// W13: rekenoefening-editor, negatieve getallen en 0 kunnen getypt worden
await go('/#/bewerk/smoke-ws-SMKRKN');
{
  const klein = page.getByLabel('Kleinste getal', { exact: true });
  const groot = page.getByLabel('Grootste getal', { exact: true });
  await klein.waitFor({ timeout: 10000 }).catch(() => {});
  await klein.click();
  await klein.press('Control+a');
  await page.keyboard.type('-5', { delay: 60 });
  await groot.click();
  await groot.press('Control+a');
  await page.keyboard.type('0', { delay: 60 });
  await sleep(900);
  const rekenCfg = await spelOpgeslagen('smoke-ws-SMKRKN');
  check('rekenen-editor: "-5" wordt -5 als kleinste getal', rekenCfg.min === -5 && (await klein.inputValue()) === '-5');
  check('rekenen-editor: "0" blijft 0 als grootste getal (geen terugval op 10)', rekenCfg.max === 0 && (await groot.inputValue()) === '0');
}

// W10: koppelspel met vier keer dezelfde rechtertekst: elke "x"-kaart is juist voor elke linkerkaart
// (met vier gelijke kaarten faalt de oude koppeling op id's in 23 van de 24 schuddingen)
await go('/#/widgets'); // zelfde url opnieuw laden doet niets: eerst weg van het eindscherm
await spelStarten('SMKKPD');
{
  const kaart = (t) => page.locator('.answer-option', { hasText: new RegExp(`^${t}$`) });
  for (const [i, links] of ['a', 'b', 'c', 'd'].entries()) {
    await kaart(links).click();
    await kaart('x').nth(i).click();
  }
  check('koppelspel: vier keer dezelfde rechtertekst, elke "x"-kaart past bij elke linkerkaart (0 fouten)', await page.locator('.badge-err', { hasText: '0 fouten' }).isVisible());
  await kaart('e').click();
  await kaart('y').click();
  check('koppelspel: alles gekoppeld met 0 fouten',
    await page.getByRole('heading', { name: 'Alles gekoppeld!' }).isVisible() && await page.getByText(/met 0 fouten/).first().isVisible());
}

// W9: de geschudde beginvolgorde is nooit meteen de juiste (twee items: altijd omgekeerd)
{
  let tijdlijnJuistBegonnen = 0;
  let koppelJuistBegonnen = 0;
  for (let i = 0; i < 6; i++) {
    await spelStarten('SMKTLN');
    if ((await page.locator('.order-item strong').first().innerText()) === 'Eerste') tijdlijnJuistBegonnen++;
    await spelStarten('SMKKPE');
    // linkerkolom: a, c; de rechterkolom mag niet meteen b, d zijn
    const knoppen = await page.locator('.answer-option').evaluateAll((es) => es.map((e) => e.textContent));
    if (knoppen[2] === 'b' && knoppen[3] === 'd') koppelJuistBegonnen++;
  }
  check('tijdlijn: in 6 keer starten staat de eerste gebeurtenis nooit meteen bovenaan', tijdlijnJuistBegonnen === 0);
  check('koppelspel: in 6 keer starten staat de rechterkolom nooit meteen naast de juiste links', koppelJuistBegonnen === 0);
}

// W15b: flitskaarten, zichtbare sneltoetsen en pijltjes negeren invoervelden
await spelStarten('SMKFLK');
check('flitskaarten: de sneltoetsen staan zichtbaar op het scherm', await page.getByText('Sneltoetsen: ← nog eens herhalen · → die ken ik · spatie: omdraaien').isVisible());
await page.keyboard.press('ArrowRight');
check('flitskaarten: pijl rechts beoordeelt de kaart (kaart 2 van 3)', await page.getByText('Kaart 2 / 3').first().isVisible());
await page.evaluate(() => {
  const i = document.createElement('input');
  i.id = 'smoke-invoer-flits';
  const s = document.createElement('select');
  s.id = 'smoke-keuze-flits';
  s.innerHTML = '<option>a</option><option>b</option>';
  document.body.append(i, s);
  i.focus();
});
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft');
check('flitskaarten: pijltjes in een invoerveld beoordelen geen kaart', await page.getByText('Kaart 2 / 3').first().isVisible());
await page.locator('#smoke-keuze-flits').focus();
await page.keyboard.press('ArrowRight');
check('flitskaarten: pijltjes in een keuzelijst beoordelen geen kaart', await page.getByText('Kaart 2 / 3').first().isVisible());
await page.evaluate(() => { document.activeElement?.blur(); });
await page.keyboard.press('ArrowLeft');
check('flitskaarten: buiten invoervelden werkt pijl links wel (kaart 3 van 3)', await page.getByText('Kaart 3 / 3').first().isVisible());

// W12: carrouselbolletjes hebben een tikvlak van minstens 44 px
await go('/#/speel/SMKCRS');
await page.getByRole('button', { name: /Ga naar dia 1/ }).waitFor({ timeout: 10000 }).catch(() => {});
{
  const bolletjes = await page.getByRole('button', { name: /Ga naar dia/ }).evaluateAll((es) => es.map((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; }));
  check('carrousel: drie bolletjes, elk minstens 44 × 44 px', bolletjes.length === 3 && bolletjes.every(([b, h]) => b >= 44 && h >= 44));
}

// Whiteboard: kleuren met een naam, en de dikteknoppen tonen een focusring
await spelStarten('SMKWBK');
check('whiteboard: kleurknoppen hebben een kleurnaam ("Kleur rood")',
  (await page.getByRole('button', { name: 'Kleur rood', exact: true }).count()) === 1 && (await page.getByRole('button', { name: /^Kleur #/ }).count()) === 0);
{
  await page.getByRole('button', { name: 'Kleur zwart', exact: true }).focus();
  let label = '';
  for (let i = 0; i < 12 && !label.startsWith('Dikte'); i++) {
    await page.keyboard.press('Tab');
    label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  }
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return { stijl: c.outlineStyle, breedte: parseFloat(c.outlineWidth) }; });
  check('whiteboard: de dikteknop heeft een zichtbare focusring bij het toetsenbord', label.startsWith('Dikte') && ring.stijl !== 'none' && ring.breedte >= 2);
  const gekozen = await page.getByRole('button', { name: 'Dikte 6', exact: true }).evaluate((e) => getComputedStyle(e).boxShadow);
  check('whiteboard: de gekozen dikte blijft zichtbaar (schaduw i.p.v. outline)', gekozen !== 'none');
}

// W14: teksten zonder "widget" en zonder valse "geregistreerd"
await go('/#/speel/SMKBNL');
check('voor/na zonder afbeeldingen: zegt "oefening", niet "widget"', await page.getByText(/Deze oefening heeft nog geen voor- en na-afbeelding/).isVisible());
await go('/#/speel/SMKMPL');
check('video zonder link: zegt "de oefening na te kijken", niet "widget"', await page.getByText(/Vraag je leerkracht om de oefening na te kijken/).isVisible());
await go('/#/speel/SMKBNA');
await page.getByRole('slider').first().focus();
await page.keyboard.press('ArrowRight');
check('voor/na: na het verkennen staat er "Je hebt beide afbeeldingen verkend." (geen "geregistreerd")',
  (await page.getByText('Je hebt beide afbeeldingen verkend.').isVisible()) && (await page.getByText(/geregistreerd/i).count()) === 0);

// Tijd om: elke speler dient de deelscore eenmalig in en toont daarna het resultaatscherm
{
  const hotspots31 = [{ id: 'h1', x: 25, y: 30, label: 'Eén' }, { id: 'h2', x: 70, y: 60, label: 'Twee' }];
  const kopTijd = (p) => p.getByRole('heading', { name: 'De tijd is om!' });
  const kaartKlik = (p, t) => p.locator('.answer-option', { hasText: new RegExp(`^${t}$`) });
  const tijdSpelers = [
    { naam: 'Koppelspel', w: spelWidget('pairs', 'SMKTP1', { pairs: [{ id: 'p1', left: 'a', right: 'b' }, { id: 'p2', left: 'c', right: 'd' }] }, { timeLimitMin: 1 }),
      voor: async (p) => { await kaartKlik(p, 'a').click(); await kaartKlik(p, 'b').click(); }, zichtbaar: kopTijd, verdiend: 1, max: 2 },
    { naam: 'Tijdlijn', w: spelWidget('timeline', 'SMKTP2', { mode: 'exercise', events: [{ id: 'e1', date: '1900', title: 'Eerste' }, { id: 'e2', date: '2000', title: 'Tweede' }, { id: 'e3', date: '2100', title: 'Derde' }] }, { timeLimitMin: 1 }),
      zichtbaar: kopTijd, max: 3 },
    { naam: 'Memory', w: spelWidget('memory', 'SMKTP3', { pairs: [{ id: 'm1', a: 'x', b: 'y' }, { id: 'm2', a: 'p', b: 'q' }] }, { timeLimitMin: 1 }),
      zichtbaar: kopTijd, verdiend: 0, max: 2 },
    { naam: 'Bingo', w: spelWidget('bingo', 'SMKTP4', { items: ['een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen'], size: 3, freeCenter: true }, { timeLimitMin: 1 }),
      zichtbaar: kopTijd, verdiend: 0, max: 1 },
    { naam: 'Flitskaarten', w: spelWidget('flashcards', 'SMKTP5', { autoFlipSec: 0, cards: kaarten31 }, { timeLimitMin: 1 }),
      voor: async (p) => { await p.getByText('Kaart 1 / 3').first().waitFor(); await p.keyboard.press('ArrowRight'); }, zichtbaar: kopTijd, verdiend: 1, max: 3 },
    { naam: 'Checklist', w: spelWidget('checklist', 'SMKTP6', { title: 'Stappen', items: [{ id: 'c1', text: 'Eerst dit' }, { id: 'c2', text: 'Dan dat' }] }, { timeLimitMin: 1 }),
      voor: async (p) => { await p.getByRole('checkbox').first().check(); }, zichtbaar: kopTijd, verdiend: 1, max: 2 },
    { naam: 'Aanwijzen (hotspot)', w: spelWidget('hotspot', 'SMKTP7', { imageUrl: prik31, mode: 'quiz', hotspots: hotspots31 }, { timeLimitMin: 1 }),
      zichtbaar: kopTijd, verdiend: 0, max: 2 },
    { naam: 'Verkennen (hotspot)', w: spelWidget('hotspot', 'SMKTP8', { imageUrl: prik31, mode: 'explore', hotspots: hotspots31 }, { timeLimitMin: 1 }),
      voor: async (p) => { await p.getByRole('button', { name: 'Punt 1' }).click(); },
      zichtbaar: (p) => p.getByText('De tijd is om. Je verkende 1 van de 2 punten.'), verdiend: 0, max: 0 },
    { naam: 'Peiling', w: spelWidget('poll', 'SMKTP9', { question: 'Kies', options: ['Ja', 'Nee'], allowMultiple: false, showResults: true }, { timeLimitMin: 1 }),
      voor: async (p) => { await p.locator('.answer-option', { hasText: 'Ja' }).click(); },
      zichtbaar: (p) => p.getByText('Bedankt voor je stem! Dit zijn de stemmen op dit toestel:'), verdiend: 0, max: 0 },
    { naam: 'Rekenen', w: spelWidget('arithmetic', 'SMKTPA', { ops: ['add'], min: 1, max: 5, count: 3, tables: [] }, { timeLimitMin: 1 }),
      voor: async (p) => {
        const t = (await p.locator('div.card.card-pad[aria-live=polite]').first().innerText()).split('\n')[0];
        const m = t.match(/(\d+) \+ (\d+)/);
        await p.keyboard.type(String(Number(m[1]) + Number(m[2])));
      },
      zichtbaar: (p) => p.getByRole('heading', { name: 'Verbetering' }), verdiend: 1, max: 3,
      // het scherm toont dezelfde score als de inzending (het laatst getypte antwoord telt mee)
      tekst: /Je behaalde 1 van 3 punten/ },
  ];
  const tijdCtx31 = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await tijdCtx31.addInitScript((ws) => {
    if (!localStorage.getItem('wf.widgets.v1')) {
      localStorage.setItem('wf.widgets.v1', JSON.stringify(ws));
      localStorage.setItem('wf.prefs.v1', JSON.stringify({ seeded: true }));
    }
  }, tijdSpelers.map((t) => t.w));
  const tijd31 = await tijdCtx31.newPage();
  tijd31.on('pageerror', (e) => errors.push(`pageerror(tijd31): ${e.message}`));
  tijd31.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) errors.push(`console(tijd31): ${m.text()}`); });
  await tijd31.clock.install();
  for (const t of tijdSpelers) {
    await tijd31.goto(`${BASE}/#/speel/${t.w.code}`, { waitUntil: 'networkidle' });
    await tijd31.getByRole('button', { name: /Starten/ }).click();
    if (t.voor) await t.voor(tijd31);
    await tijd31.clock.runFor(2000);
    await tijd31.clock.runFor(62000);
    await tijd31.waitForTimeout(500);
    check(`${t.naam}: bij tijd om verschijnt het resultaatscherm`, await t.zichtbaar(tijd31).first().isVisible());
    const inzendingen = await tijd31.evaluate((c) => JSON.parse(localStorage.getItem('wf.submissions.v1') || '[]').filter((s) => s.widgetCode === c), t.w.code);
    check(`${t.naam}: bij tijd om is er precies 1 inzending bewaard`, inzendingen.length === 1);
    check(`${t.naam}: de deelscore klopt (${t.verdiend ?? '?'} van ${t.max})`,
      inzendingen.length === 1 && inzendingen[0].totalMax === t.max && (t.verdiend === undefined || inzendingen[0].totalEarned === t.verdiend));
    if (t.tekst) check(`${t.naam}: het resultaatscherm toont dezelfde score als de inzending`, await tijd31.getByText(t.tekst).first().isVisible());
    check(`${t.naam}: de leerling kan niet doorwerken (geen "Opnieuw"-knop)`, (await tijd31.getByRole('button', { name: /^Opnieuw/ }).count()) === 0);
  }
  await tijdCtx31.close();
}

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
