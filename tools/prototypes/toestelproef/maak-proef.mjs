#!/usr/bin/env node
// Maakt public/proef/toestelproef.html: één zelfstandige proefpagina (geen CDN,
// geen aanvragen) die op echte schooltoestellen meet wat het ontwerp van
// Boosterz voor het basisonderwijs aanneemt. Zie README.md in deze map.
//
//   node tools/prototypes/toestelproef/maak-proef.mjs
//
// Faalt hard (exit 1, Nederlandse melding) als een controle mislukt: dan wordt
// de pagina niet geschreven. Het script is deterministisch: twee keer draaien
// geeft hetzelfde bestand.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '../../..');
const UITVOER = path.join(REPO, 'public', 'proef', 'toestelproef.html');
const JSQR_BRON = path.join(REPO, 'node_modules', 'jsqr', 'dist', 'jsQR.js');

const require = createRequire(path.join(REPO, 'package.json'));
const QRCode = require('qrcode');
const jsQR = require('jsqr').default ?? require('jsqr');

/** De versies en pixels per module die de proef toont (pakket 1, onderdeel a). */
export const VERSIES = [3, 6, 7, 10];
export const PIXELS = [6, 8];
/** Marge rondom de code, in modules (zoals CodeQr in de app). */
export const MARGE = 2;

/** Toegelaten tekens in een WB1-code: 0-9, A-Z en . / - * */
const WB1_TEKENS = /^[0-9A-Z./*-]+$/;
const KIND_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TIJD_ALFABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const UITKOMST_ALFABET = 'JN23456789';

class ControleFout extends Error {}

function eis(voorwaarde, melding) {
  if (!voorwaarde) throw new ControleFout(melding);
}

// ── Synthetische WB1-achtige inhoud ──────────────────────────────────────────

/** Kleine, deterministische toevalsgenerator (mulberry32). */
function toeval(zaad) {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lange cijferreeksen zou qrcode als numeriek segment coderen, en dan haalt de
 * code meer dan 395 tekens. Een echte WB1-code komt daar ook niet aan toe, dus
 * de verzonnen inhoud blijft onder vier cijfers na elkaar.
 */
function beperkCijfers(tekst) {
  let uit = '';
  let reeks = 0;
  for (const teken of tekst) {
    if (teken >= '0' && teken <= '9') {
      reeks += 1;
      if (reeks > 3) {
        uit += 'XYZABCDEFG'[Number(teken)];
        reeks = 0;
        continue;
      }
    } else {
      reeks = 0;
    }
    uit += teken;
  }
  return uit;
}

/**
 * Verzonnen rijen in de vorm van WB1: een kindcode (2), een tijd (3), soms '*'
 * en de kindcode van het maatje, dan bewijsparen (nummer + uitkomst), rijen
 * gescheiden door '-' en pakketten door '/'. Geen echte kinderen, geen namen.
 */
function synthetischeStroom(zaad, minimaleLengte) {
  const r = toeval(zaad);
  const kies = (alfabet) => alfabet[Math.floor(r() * alfabet.length)];
  const kind = () => kies(KIND_ALFABET) + kies(KIND_ALFABET);
  let stroom = 'PRF1';
  let rijen = 0;
  while (stroom.length < minimaleLengte) {
    let rij = kind() + kies(TIJD_ALFABET) + kies(TIJD_ALFABET) + kies(TIJD_ALFABET);
    if (r() < 0.2) rij += `*${kind()}`;
    const paren = 3 + Math.floor(r() * 6);
    for (let i = 0; i < paren; i += 1) rij += kies(TIJD_ALFABET) + kies(UITKOMST_ALFABET);
    stroom += `-${rij}`;
    rijen += 1;
    if (rijen % 5 === 0) stroom += '/PRF1';
  }
  return beperkCijfers(stroom);
}

/** Verzonnen controle van 2 tekens: geen echte WB1-controle, alleen de vorm. */
function proefControle(tekst) {
  let som = 0;
  for (let i = 0; i < tekst.length; i += 1) som = (som + tekst.charCodeAt(i) * (i + 1)) % 1296;
  return TIJD_ALFABET[Math.floor(som / 36)] + TIJD_ALFABET[som % 36];
}

function qrVan(tekst) {
  return QRCode.create(tekst, { errorCorrectionLevel: 'L' });
}

function allesAlfanumeriek(qr) {
  return qr.segments.length > 0 && qr.segments.every((s) => s.mode && s.mode.id === 'Alphanumeric');
}

/** Het grootste aantal alfanumerieke tekens dat bij foutcorrectie L nog in `versie` past. */
export function capaciteit(versie) {
  let groot = 0;
  for (let n = 1; n <= 600; n += 1) {
    const v = qrVan('A'.repeat(n)).version;
    if (v === versie) groot = n;
    if (v > versie) break;
  }
  return groot;
}

/** De tekst van één proefcode: precies de grootste tekst die nog versie `versie` haalt. */
function tekstVoor(versie, px) {
  const lengte = capaciteit(versie);
  eis(lengte > 0, `Versie ${versie} bestaat niet bij foutcorrectie L.`);
  const kop = `WB1.PROEF${String(versie).padStart(2, '0')}${px}.`;
  const stroom = synthetischeStroom(versie * 100 + px, lengte);
  const midden = lengte - kop.length - 3;
  eis(midden > 0, `Versie ${versie} is te klein voor de kop ${kop}.`);
  // Eindigt de inhoud op een scheidingsteken, dan wordt dat een letter: zo staat er nooit '-.' of '/.'
  const inhoud = stroom.slice(0, midden).replace(/[-/*]+$/, (s) => 'A'.repeat(s.length));
  const zonderControle = `${kop}${inhoud}.`;
  return zonderControle + proefControle(zonderControle);
}

// ── Tekenen: een pad van horizontale stroken ────────────────────────────────

/** Een SVG-pad (in modules, met marge) van de donkere modules, per rij in stroken. */
function padVan(qr) {
  const n = qr.modules.size;
  let d = '';
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (!qr.modules.get(y, x)) {
        x += 1;
        continue;
      }
      let eind = x;
      while (eind < n && qr.modules.get(y, eind)) eind += 1;
      const len = eind - x;
      d += `M${x + MARGE} ${y + MARGE}h${len}v1h-${len}z`;
      x = eind;
    }
  }
  return d;
}

/** Leest een pad terug in een RGBA-buffer (wit, zwarte modules), `schaal` pixels per module. */
function rasterVanPad(d, modulesMetMarge, schaal) {
  const breedte = modulesMetMarge * schaal;
  const data = new Uint8ClampedArray(breedte * breedte * 4).fill(255);
  const stroken = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
  let rest = d;
  for (const m of d.matchAll(stroken)) {
    const [x, y, len, terug] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    eis(len === terug, 'Een strook in het pad klopt niet.');
    eis(x + len <= modulesMetMarge && y < modulesMetMarge, 'Een strook valt buiten de code.');
    for (let py = y * schaal; py < (y + 1) * schaal; py += 1) {
      for (let px = x * schaal; px < (x + len) * schaal; px += 1) {
        const i = (py * breedte + px) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  }
  rest = rest.replace(stroken, '');
  eis(rest === '', 'Het pad bevat iets anders dan stroken.');
  return { data, breedte };
}

/**
 * Maakt de 8 proefcodes (versie 3, 6, 7 en 10, elk op 6 en op 8 px). Elke code
 * heeft zijn eigen tekst. Voor de rooktest bewaren we ook de rijen als tekst
 * van '0' en '1'.
 */
export function maakCodes() {
  const codes = [];
  for (const versie of VERSIES) {
    for (const px of PIXELS) {
      const tekst = tekstVoor(versie, px);
      const qr = qrVan(tekst);
      const n = qr.modules.size;
      const rijen = [];
      for (let y = 0; y < n; y += 1) {
        let rij = '';
        for (let x = 0; x < n; x += 1) rij += qr.modules.get(y, x) ? '1' : '0';
        rijen.push(rij);
      }
      codes.push({ versie, px, tekst, lengte: tekst.length, modules: n, d: padVan(qr), rijen, qr });
    }
  }
  return codes;
}

// ── Controles op de codes ────────────────────────────────────────────────────

function controleerCodes(codes) {
  eis(codes.length === VERSIES.length * PIXELS.length, `Verwachtte ${VERSIES.length * PIXELS.length} codes, kreeg er ${codes.length}.`);
  eis(capaciteit(10) === 395, `Versie 10 haalt bij foutcorrectie L ${capaciteit(10)} alfanumerieke tekens, niet 395.`);
  const teksten = new Set();
  for (const c of codes) {
    const naam = `versie ${c.versie} op ${c.px} px`;
    eis(c.tekst.startsWith(`WB1.PROEF${String(c.versie).padStart(2, '0')}${c.px}.`), `${naam}: de tekst begint niet met de kop.`);
    eis(WB1_TEKENS.test(c.tekst), `${naam}: de tekst bevat een teken buiten 0-9, A-Z en . / - *.`);
    eis(!/[.,;:]$/.test(c.tekst), `${naam}: de tekst eindigt op een leesteken.`);
    eis(!teksten.has(c.tekst), `${naam}: dezelfde tekst als een andere code.`);
    teksten.add(c.tekst);

    const qr = qrVan(c.tekst);
    eis(qr.version === c.versie, `${naam}: qrcode haalt versie ${qr.version}.`);
    eis(qr.errorCorrectionLevel.bit === 1, `${naam}: de foutcorrectie is niet L.`);
    eis(allesAlfanumeriek(qr), `${naam}: de tekst wordt niet volledig als alfanumeriek segment gecodeerd (${qr.segments.map((s) => s.mode.id).join(', ')}).`);
    eis(c.lengte === capaciteit(c.versie), `${naam}: de tekst is ${c.lengte} tekens, niet de ${capaciteit(c.versie)} van de versie.`);
    eis(qrVan(`${c.tekst}A`).version === c.versie + 1 || c.versie === 40, `${naam}: één teken extra haalt de volgende versie niet, dus de code is niet gevuld tot het maximum.`);
    eis(c.modules === 17 + 4 * c.versie, `${naam}: ${c.modules} modules in plaats van ${17 + 4 * c.versie}.`);

    // Teruglezen: uit het pad zoals het in de pagina komt, niet uit de matrix.
    const metMarge = c.modules + 2 * MARGE;
    const { data, breedte } = rasterVanPad(c.d, metMarge, c.px);
    const gelezen = jsQR(data, breedte, breedte, { inversionAttempts: 'dontInvert' });
    eis(gelezen !== null, `${naam}: jsqr leest de getekende code niet.`);
    eis(gelezen.data === c.tekst, `${naam}: jsqr leest een andere tekst dan er in de code zit.`);
    eis(gelezen.version === c.versie, `${naam}: jsqr leest versie ${gelezen.version}.`);
  }
}

// ── De pagina ────────────────────────────────────────────────────────────────

const CSS = String.raw`
:root {
  color-scheme: light dark;
  --bg: #f6f5fc;
  --bg-raised: #ffffff;
  --bg-sunken: #edebf7;
  --text: #1a1636;
  --text-soft: #5a5677;
  --line: #e2dff0;
  --brand: #5b3df5;
  --brand-soft: #eeebff;
  --brand-fill: #5b3df5;
  --brand-fill-strong: #4a2fd9;
  --ok-soft: #dcfce7;
  --ok-text: #166534;
  --warn-soft: #fef3c7;
  --warn-text: #92400e;
  --err-soft: #fee2e2;
  --err-text: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #100e1f;
    --bg-raised: #1a1730;
    --bg-sunken: #0b0a18;
    --text: #ebe8f7;
    --text-soft: #aaa5c4;
    --line: #2c2847;
    --brand: #a394ff;
    --brand-soft: #2b2559;
    --ok-soft: #14351f;
    --ok-text: #4ade80;
    --warn-soft: #3a2c0a;
    --warn-text: #fbbf24;
    --err-soft: #431418;
    --err-text: #f87171;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  font-family: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  background: var(--bg);
  color: var(--text);
}
main { max-width: 56rem; margin: 0 auto; padding: 16px; }
h1, h2, h3 { line-height: 1.25; margin: 0 0 0.5em; letter-spacing: -0.01em; }
h1 { font-size: 1.7rem; }
h2 { font-size: 1.3rem; }
h3 { font-size: 1.05rem; margin-top: 1em; }
p { margin: 0 0 0.8em; }
:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; border-radius: 4px; }
.kaart { background: var(--bg-raised); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 16px 0; }
.kaart > :last-child { margin-bottom: 0; }
.zacht { color: var(--text-soft); }
.rij { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; align-items: center; }
.veld { margin: 0 0 12px; max-width: 100%; }
.veld label { display: block; font-weight: 600; margin-bottom: 4px; }
select, textarea {
  display: block;
  width: 100%;
  max-width: 36rem;
  min-height: 44px;
  padding: 8px 12px;
  font: inherit;
  color: var(--text);
  background: var(--bg-raised);
  border: 2px solid var(--text-soft);
  border-radius: 8px;
}
textarea { min-height: 12rem; font-family: ui-monospace, Consolas, monospace; font-size: 0.9rem; overflow-wrap: anywhere; }
.knop {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 16px;
  font: inherit;
  font-weight: 600;
  color: var(--text);
  background: var(--bg-raised);
  border: 2px solid var(--text-soft);
  border-radius: 8px;
  cursor: pointer;
}
.knop:hover:not(:disabled) { background: var(--bg-sunken); }
.knop.primair { color: #fff; background: var(--brand-fill); border-color: var(--brand-fill); }
.knop.primair:hover:not(:disabled) { background: var(--brand-fill-strong); border-color: var(--brand-fill-strong); }
.knop:disabled { opacity: 0.6; cursor: not-allowed; }
fieldset { margin: 0 0 12px; padding: 0; border: 0; min-width: 0; }
legend { padding: 0; font-weight: 600; margin-bottom: 4px; }
.keuzes { display: flex; flex-wrap: wrap; gap: 4px 24px; }
.keuze, .vink {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  background: var(--bg-raised);
  border: 2px solid var(--text-soft);
  border-radius: 8px;
  cursor: pointer;
}
.keuze:has(input:checked) { background: var(--brand-soft); border-color: var(--brand); }
.keuze input, .vink input { width: 22px; height: 22px; margin: 0; accent-color: var(--brand-fill); }
.melding { margin: 0 0 12px; padding: 8px 12px; border-left: 6px solid var(--text-soft); border-radius: 4px; background: var(--bg-sunken); overflow-wrap: anywhere; }
.melding:empty { display: block; margin: 0; padding: 0; border: 0; height: 0; }
.melding.goed { background: var(--ok-soft); color: var(--ok-text); border-left-color: var(--ok-text); }
.melding.letop { background: var(--warn-soft); color: var(--warn-text); border-left-color: var(--warn-text); }
.melding.fout { background: var(--err-soft); color: var(--err-text); border-left-color: var(--err-text); }
.codevak {
  display: block;
  width: fit-content;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  background: #fff;
  border: 2px solid var(--text-soft);
  border-radius: 8px;
}
.codevak svg { display: block; flex: none; max-width: none; }
.videovak { max-width: 640px; margin: 0 0 12px; background: #000; border-radius: 8px; overflow: hidden; }
.videovak video { display: block; width: 100%; max-height: 50vh; object-fit: contain; }
.videovak video.gespiegeld { transform: scaleX(-1); }
.gegevens { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; margin: 0 0 12px; }
.gegevens dt { font-weight: 600; margin-top: 8px; }
.gegevens dd { margin: 0; overflow-wrap: anywhere; }
@media (min-width: 640px) {
  .gegevens { grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr); gap: 4px 16px; }
  .gegevens dt, .gegevens dd { margin-top: 0; }
}
.log {
  max-height: 16rem;
  overflow-y: auto;
  padding: 8px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.log p { margin: 0 0 6px; overflow-wrap: anywhere; }
.tabelvak { max-width: 100%; max-height: 20rem; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { position: sticky; top: 0; background: var(--bg-sunken); }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
ol.stappen { margin: 0; padding-left: 1.4em; }
ol.stappen li { margin-bottom: 0.6em; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;

const BODY = String.raw`
<main id="main">
<header>
<h1>Toestelproef Boosterz</h1>
<p>Deze proef meet op de echte schooltoestellen wat het ontwerp van Boosterz voor het basisonderwijs aanneemt: of de webcam van de laptop van de leerkracht de QR-code op het Chromebook van een kind leest, of het toestel een Nederlandse stem heeft en of het iets onthoudt nadat je afgemeld hebt. De pagina doet geen enkele aanvraag naar het internet, bewaart alleen het merkje dat je zelf zet en bevat geen persoonsgegevens.</p>
<div class="veld">
<label for="toestel">Welk toestel is dit?</label>
<select id="toestel">
<option value="">Kies een toestel</option>
<option value="chromebook-1">Chromebook 1ste graad</option>
<option value="chromebook-3">Chromebook 3de leerjaar</option>
<option value="laptop-leerkracht">laptop van de leerkracht</option>
<option value="digibord">digibord</option>
<option value="ander">ander</option>
</select>
</div>
</header>

<section class="kaart" aria-labelledby="h-uitleg">
<h2 id="h-uitleg">Zo doe je de proef</h2>
<ol class="stappen">
<li>Open deze pagina op elk toestel en kies bovenaan welk toestel het is. Zet de zoom van de browser op 100 procent, anders vallen de pixels van de codes niet meer samen met de pixels van het scherm.</li>
<li>Op een Chromebook: kies bij "Codes tonen" een code en laat ze groot in beeld staan. Zet de helderheid van het scherm hoog.</li>
<li>Op de laptop van de leerkracht: open de pagina liefst in een nieuw of schoon profiel, of kijk in chrome://policy (in Edge: edge://policy) of VideoCaptureAllowedUrls ingesteld staat en schrijf op wat daar staat. Kies dan bij "Scanner" de knop "Start de camera" en daarna "Start meting". De uitslag toont of de browser bij het openen eerst om toestemming voor de camera vroeg. Houd het Chromebook voor de camera tot de log de code toont.</li>
<li>Doe dit eerst met versie 10 op 8 px, dan met versie 7, 6 en 3, en daarna alles nog eens op 6 px. Druk telkens op "Start meting" voor je een nieuwe code voorhoudt.</li>
<li>Zet bij "Opslag" een merkje. Kopieer de uitslag vlak voor je afmeldt, als het merkje er staat, en zet er "voor het afmelden" bij. Meld het toestel af en weer aan, open de pagina opnieuw, kijk of het merkje er nog is en kopieer de uitslag nog eens, met "na het aanmelden" erbij.</li>
<li>Probeer bij "Stem" de zin eerst met internet en dan zonder: laad de pagina, zet daarna het wifi uit en tik opnieuw. Herlaad de pagina niet zonder internet, want ze wordt niet offline bewaard.</li>
<li>Kopieer telkens de uitslag, op elk toestel en na elke proef, en plak ze samen in één bericht, zonder namen van kinderen of leerkrachten.</li>
</ol>
</section>

<section class="kaart" aria-labelledby="h-codes">
<h2 id="h-codes">Codes tonen</h2>
<p>Voor het Chromebook van een kind. Kies een code en houd het scherm stil voor de webcam. Elke code heeft de vorm van een bewijscode van Boosterz (WB1) maar bevat verzonnen inhoud.</p>
<div class="keuzes">
<fieldset>
<legend>Versie van de code</legend>
<div class="keuzes">
<label class="keuze"><input type="radio" name="versie" value="3">Versie 3</label>
<label class="keuze"><input type="radio" name="versie" value="6">Versie 6</label>
<label class="keuze"><input type="radio" name="versie" value="7">Versie 7</label>
<label class="keuze"><input type="radio" name="versie" value="10" checked>Versie 10</label>
</div>
</fieldset>
<fieldset>
<legend>Pixels per module</legend>
<div class="keuzes">
<label class="keuze"><input type="radio" name="px" value="6">6 px</label>
<label class="keuze"><input type="radio" name="px" value="8" checked>8 px</label>
</div>
</fieldset>
</div>
<p id="code-info" aria-live="polite"></p>
<div id="codevak" class="codevak" role="group" aria-label="De QR-code. Is ze breder dan het scherm, dan scrolt dit vak zijwaarts."></div>
</section>

<section class="kaart" aria-labelledby="h-scanner">
<h2 id="h-scanner">Scanner</h2>
<p>Voor de laptop van de leerkracht en het digibord, als daar een webcam op zit. Het beeld blijft op je toestel en gaat nergens heen.</p>
<div class="rij">
<button type="button" id="cam-start" class="knop primair">Start de camera</button>
<button type="button" id="cam-stop" class="knop" disabled>Stop de camera</button>
<button type="button" id="meting-start" class="knop" disabled>Start meting</button>
</div>
<div class="veld">
<label for="cam-keuze">Camera</label>
<select id="cam-keuze"><option value="">Standaardcamera</option></select>
</div>
<div class="rij"><label class="vink"><input type="checkbox" id="spiegel" checked>Spiegel het beeld</label></div>
<p id="cam-melding" class="melding" role="status"></p>
<div id="video-vak" class="videovak" hidden><video id="video" playsinline muted aria-label="Beeld van de camera"></video></div>
<canvas id="werkvlak" hidden></canvas>
<dl class="gegevens">
<dt>Decoder</dt><dd id="decoder">nog niet gestart</dd>
<dt>Toestemming voor de camera</dt><dd id="cam-toestemming">wordt nagekeken</dd>
<dt>Camera in gebruik</dt><dd id="cam-naam">geen</dd>
<dt>Beeld van de camera</dt><dd id="cam-beeld">geen</dd>
<dt>Beelden bekeken</dt><dd id="cam-stat">nog geen</dd>
</dl>
<h3 id="h-log">Log van de meting</h3>
<p class="zacht">De tijd telt vanaf het starten van de camera of vanaf "Start meting".</p>
<div id="log" class="log" role="log" aria-live="polite" aria-labelledby="h-log" tabindex="0"></div>
</section>

<section class="kaart" aria-labelledby="h-stem">
<h2 id="h-stem">Stem</h2>
<p>Een kind dat nog niet leest, hoort wat het moet doen. Hier zie je welke stemmen het toestel heeft en of ze zonder internet werken.</p>
<div class="rij"><button type="button" id="stem-zeg" class="knop primair">Zeg: Wie werkt? Tik op je prentje.</button></div>
<p id="stem-melding" class="melding" role="status"></p>
<dl class="gegevens">
<dt>Gebruikte stem</dt><dd id="stem-gebruikt">nog niet uitgeprobeerd</dd>
<dt>Stemmen op dit toestel</dt><dd id="stem-samenvatting">wordt nagekeken</dd>
</dl>
<div id="stem-vak" class="tabelvak" role="region" aria-label="Alle stemmen van dit toestel" tabindex="0" hidden>
<table>
<caption class="sr-only">Stemmen van dit toestel</caption>
<thead><tr><th scope="col">Naam</th><th scope="col">Taal</th><th scope="col">Werkt zonder internet</th><th scope="col">Standaard</th></tr></thead>
<tbody id="stem-rijen"></tbody>
</table>
</div>
</section>

<section class="kaart" aria-labelledby="h-opslag">
<h2 id="h-opslag">Opslag</h2>
<p>Zet een merkje met het uur. Meld daarna af en weer aan, open de pagina opnieuw en kijk of het merkje er nog is. Zo zie je of afmelden alles wist.</p>
<div class="rij">
<button type="button" id="merkje-zet" class="knop primair">Zet een merkje</button>
<button type="button" id="merkje-wis" class="knop">Wis het merkje</button>
</div>
<p id="opslag-melding" class="melding" role="status"></p>
<dl class="gegevens">
<dt>localStorage bij het openen</dt><dd id="ls-start">wordt nagekeken</dd>
<dt>IndexedDB bij het openen</dt><dd id="idb-start">wordt nagekeken</dd>
<dt>localStorage nu</dt><dd id="ls-nu">wordt nagekeken</dd>
<dt>IndexedDB nu</dt><dd id="idb-nu">wordt nagekeken</dd>
<dt>Blijvende opslag (persisted)</dt><dd id="s-persisted">wordt nagekeken</dd>
<dt>Gebruikt en beschikbaar (estimate)</dt><dd id="s-estimate">wordt nagekeken</dd>
</dl>
</section>

<section class="kaart" aria-labelledby="h-toestel">
<h2 id="h-toestel">Toestel</h2>
<dl class="gegevens">
<dt>Platform</dt><dd id="t-platform"></dd>
<dt>Browser (userAgent)</dt><dd id="t-ua"></dd>
<dt>Scherm</dt><dd id="t-scherm"></dd>
<dt>Venster</dt><dd id="t-venster"></dd>
<dt>Pixelverhouding</dt><dd id="t-dpr"></dd>
<dt>BarcodeDetector</dt><dd id="t-bd">wordt nagekeken</dd>
<dt>Aantal camera's</dt><dd id="t-cams">wordt nagekeken</dd>
<dt>Internet volgens het toestel</dt><dd id="t-online"></dd>
</dl>
</section>

<section class="kaart" aria-labelledby="h-uitslag">
<h2 id="h-uitslag">Uitslag</h2>
<p>Kopieer de uitslag en plak ze in een bericht. Er staan geen persoonsgegevens in; de namen van de camera's wel.</p>
<div class="rij"><button type="button" id="kopieer" class="knop primair">Kopieer de uitslag</button></div>
<p id="uitslag-melding" class="melding" role="status"></p>
<div id="uitslag-vak" class="veld" hidden>
<label for="uitslag-tekst">Uitslag</label>
<textarea id="uitslag-tekst" readonly></textarea>
</div>
</section>
</main>
`;

const CLIENT_JS = String.raw`
(function () {
  'use strict';

  var SLEUTEL = 'boosterz.toestelproef.merkje';
  var DB_NAAM = 'boosterz-toestelproef';
  var STORE = 'merkje';
  var ZIN = 'Wie werkt? Tik op je prentje.';
  var GEEN_MERKJE = 'geen merkje: dit toestel onthoudt niets tussen twee sessies, of de proef is hier nieuw';

  function $(id) { return document.getElementById(id); }
  function komma(x, d) { return x.toFixed(d).replace('.', ','); }
  function fout(e) {
    if (!e) return 'onbekende fout';
    var n = e.name && e.name !== 'Error' ? e.name : '';
    return n ? n + (e.message ? ': ' + e.message : '') : String(e.message || 'onbekende fout');
  }
  var VOORAF = { goed: 'Gelukt: ', letop: 'Let op: ', fout: 'Fout: ' };
  function melding(id, soort, tekst) {
    var el = $(id);
    el.className = 'melding' + (soort ? ' ' + soort : '');
    el.textContent = soort ? VOORAF[soort] + tekst : tekst;
  }
  function wis(id) { var el = $(id); el.className = 'melding'; el.textContent = ''; }
  function uur(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try { return d.toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'medium' }); } catch (e) { return d.toISOString(); }
  }
  function toestelNaam() {
    var s = $('toestel');
    return s.value ? s.options[s.selectedIndex].textContent : 'niet gekozen';
  }

  // ── (a) Codes tonen ──────────────────────────────────────────────────────
  var CODES = JSON.parse($('codes-data').textContent);

  function gekozenCode() {
    var versie = Number(document.querySelector('input[name="versie"]:checked').value);
    var px = Number(document.querySelector('input[name="px"]:checked').value);
    for (var i = 0; i < CODES.length; i += 1) {
      if (CODES[i].versie === versie && CODES[i].px === px) return CODES[i];
    }
    return CODES[0];
  }
  function pasScrollToe() {
    var vak = $('codevak');
    if (vak.scrollWidth > vak.clientWidth) vak.setAttribute('tabindex', '0');
    else vak.removeAttribute('tabindex');
  }
  function toonCode() {
    var c = gekozenCode();
    var n = c.modules + 4;
    var b = n * c.px;
    $('codevak').innerHTML =
      '<svg viewBox="0 0 ' + n + ' ' + n + '" width="' + b + '" height="' + b + '" shape-rendering="crispEdges"' +
      ' role="img" aria-label="QR-code van versie ' + c.versie + ' op ' + c.px + ' pixels per module"' +
      ' data-versie="' + c.versie + '" data-px="' + c.px + '">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path fill="#000" d="' + c.d + '"/></svg>';
    $('code-info').innerHTML = '';
    var tekst = document.createElement('span');
    tekst.textContent = 'Versie ' + c.versie + ', ' + c.px + ' px per module, ' + c.modules + ' × ' + c.modules +
      ' modules met een marge van 2, dus ' + b + ' × ' + b + ' pixels op het scherm. Tekstlengte: ';
    var lengte = document.createElement('strong');
    lengte.id = 'code-lengte';
    lengte.textContent = c.lengte + ' tekens';
    $('code-info').appendChild(tekst);
    $('code-info').appendChild(lengte);
    pasScrollToe();
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="versie"], input[name="px"]'), function (el) {
    el.addEventListener('change', toonCode);
  });
  window.addEventListener('resize', pasScrollToe);

  // ── (e) Toestel ──────────────────────────────────────────────────────────
  var toestel = { barcodeDetector: 'wordt nagekeken', camera: 'wordt nagekeken' };

  function toonVenster() {
    $('t-venster').textContent = window.innerWidth + ' × ' + window.innerHeight + ' pixels';
    $('t-dpr').textContent = String(window.devicePixelRatio || 1);
    pasScrollToe();
  }
  function toonToestel() {
    var uad = navigator.userAgentData;
    $('t-platform').textContent = uad && uad.platform ? uad.platform : 'niet gemeld (zie de browser hieronder)';
    $('t-ua').textContent = navigator.userAgent || 'onbekend';
    $('t-scherm').textContent = screen.width + ' × ' + screen.height + ' pixels';
    $('t-online').textContent = navigator.onLine ? 'online' : 'offline';
    toonVenster();
    var bd = 'nee';
    if ('BarcodeDetector' in window) {
      bd = 'ja';
      try {
        window.BarcodeDetector.getSupportedFormats().then(function (formaten) {
          toestel.barcodeDetector = 'ja, formaten: ' + (formaten.length ? formaten.join(', ') : 'geen');
          $('t-bd').textContent = toestel.barcodeDetector;
        }, function (e) {
          toestel.barcodeDetector = 'ja, maar de formaten zijn niet op te vragen (' + fout(e) + ')';
          $('t-bd').textContent = toestel.barcodeDetector;
        });
        bd = 'ja, formaten worden opgevraagd';
      } catch (e) {
        bd = 'ja, maar de formaten zijn niet op te vragen (' + fout(e) + ')';
      }
    }
    toestel.barcodeDetector = bd;
    $('t-bd').textContent = bd;
  }
  window.addEventListener('resize', toonVenster);
  window.addEventListener('online', function () { $('t-online').textContent = 'online'; });
  window.addEventListener('offline', function () { $('t-online').textContent = 'offline'; });

  // ── (b) Scanner ──────────────────────────────────────────────────────────
  var cam = {
    stream: null, timer: 0, bezig: false, decoder: null, t0: 0, n: 0, somMs: 0,
    vorige: '', vorigeTijd: 0, spiegelAangepast: false, naam: 'geen', beeld: 'geen',
    uitkomst: 'niet geprobeerd', detectFouten: 0, laatsteFout: ''
  };
  var logRegels = [];

  function voegLogToe(tekst) {
    logRegels.push(tekst);
    var log = $('log');
    var p = document.createElement('p');
    p.textContent = tekst;
    log.appendChild(p);
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  function gemiddeldeMs() { return cam.n ? cam.somMs / cam.n : 0; }
  function toonStat() {
    $('cam-stat').textContent = cam.n ? cam.n + ' beelden, gemiddeld ' + komma(gemiddeldeMs(), 1) + ' ms per beeld' : 'nog geen';
  }
  function beeldNu() {
    try {
      var track = cam.stream && cam.stream.getVideoTracks()[0];
      var s = track && track.getSettings ? track.getSettings() : null;
      if (s && s.width && s.height) return s.width + '×' + s.height;
    } catch (e) { /* valt terug op de laatst bekende waarde */ }
    return cam.beeld;
  }
  function zetMeting(stil) {
    cam.t0 = performance.now();
    cam.n = 0;
    cam.somMs = 0;
    cam.vorige = '';
    cam.vorigeTijd = 0;
    if (!stil) voegLogToe('Meting op nul gezet.');
    toonStat();
  }
  function zetSpiegel() { $('video').classList.toggle('gespiegeld', $('spiegel').checked); }

  function stopCamera() {
    if (cam.timer) { clearInterval(cam.timer); cam.timer = 0; }
    if (cam.stream) {
      cam.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* al gestopt */ } });
      cam.stream = null;
    }
    var v = $('video');
    try { v.pause(); } catch (e) { /* geen beeld */ }
    v.srcObject = null;
    $('video-vak').hidden = true;
    $('cam-start').disabled = false;
    $('cam-stop').disabled = true;
    $('meting-start').disabled = true;
  }

  var WINDOWS_CAMERA = 'Kijk ook in Windows: Instellingen, Privacy en beveiliging, Camera, of bij het beheer van de school.';

  function cameraFout(e) {
    var naam = e && e.name;
    if (naam === 'NotAllowedError' || naam === 'SecurityError' || naam === 'PermissionDeniedError') {
      return 'Geen toestemming voor de camera. Sta de camera toe via het slotje of de camera in de adresbalk, of vraag het beheer van de school om dit adres toe te laten, en probeer opnieuw. ' + WINDOWS_CAMERA;
    }
    if (naam === 'NotFoundError' || naam === 'DevicesNotFoundError') return 'Er is geen camera gevonden op dit toestel.';
    if (naam === 'NotReadableError' || naam === 'TrackStartError') return 'De camera is in gebruik door een ander programma of tabblad. Sluit dat en probeer opnieuw. ' + WINDOWS_CAMERA;
    if (naam === 'OverconstrainedError') return 'De gekozen camera is niet beschikbaar. Kies een andere camera of de standaardcamera.';
    return 'De camera startte niet (' + fout(e) + ').';
  }

  function vulCameralijst(huidigId) {
    var md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) {
      toestel.camera = 'niet te tellen';
      $('t-cams').textContent = toestel.camera;
      return Promise.resolve();
    }
    return md.enumerateDevices().then(function (lijst) {
      var cams = lijst.filter(function (d) { return d.kind === 'videoinput'; });
      var sel = $('cam-keuze');
      var behoud = huidigId || sel.value;
      sel.innerHTML = '';
      var standaard = document.createElement('option');
      standaard.value = '';
      standaard.textContent = 'Standaardcamera';
      sel.appendChild(standaard);
      cams.forEach(function (d, i) {
        if (!d.deviceId) return;
        var o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || 'Camera ' + (i + 1) + ' (de naam verschijnt na toestemming)';
        sel.appendChild(o);
      });
      sel.value = behoud;
      if (sel.value !== behoud) sel.value = '';
      toestel.camera = String(cams.length);
      $('t-cams').textContent = toestel.camera;
    }, function () {
      toestel.camera = 'niet te tellen';
      $('t-cams').textContent = toestel.camera;
    });
  }

  function kiesDecoder() {
    var klaar = function () {
      if (typeof window.jsQR === 'function') return { naam: 'jsqr', detector: null, reden: 'BarcodeDetector ontbreekt of leest geen QR-codes' };
      return null;
    };
    if (!('BarcodeDetector' in window)) return Promise.resolve(klaar());
    return window.BarcodeDetector.getSupportedFormats().then(function (formaten) {
      if (formaten.indexOf('qr_code') >= 0) return { naam: 'BarcodeDetector', detector: new window.BarcodeDetector({ formats: ['qr_code'] }), reden: '' };
      return klaar();
    }).catch(function () { return klaar(); });
  }

  function verwerk(tekst) {
    var nu = performance.now();
    var nieuw = tekst !== cam.vorige || nu - cam.vorigeTijd > 1500;
    cam.vorige = tekst;
    cam.vorigeTijd = nu;
    if (!nieuw) return;
    var sec = komma((nu - cam.t0) / 1000, 1) + ' s';
    if (tekst.indexOf('WB1.PROEF') !== 0) {
      voegLogToe('Andere QR-code gelezen, ' + sec + ' na de start van de meting. De inhoud wordt niet getoond.');
      return;
    }
    var m = /^WB1\.PROEF(\d\d)(\d)\./.exec(tekst);
    var wat = m ? 'versie ' + Number(m[1]) + ', ' + m[2] + ' px' : 'versie en px niet te lezen';
    voegLogToe('Proefcode gelezen: ' + wat + ', decoder ' + cam.decoder.naam + ', ' + sec + ' na de start van de meting, beeld ' +
      beeldNu() + ', gemiddeld ' + komma(gemiddeldeMs(), 1) + ' ms per beeld.');
  }

  function tik() {
    if (cam.bezig || !cam.stream || !cam.decoder) return;
    var v = $('video');
    if (v.readyState < 2 || !v.videoWidth) return;
    cam.bezig = true;
    var begin = performance.now();
    var gelezen = [];
    var afgerond = false;
    // Een mislukt beeld telt niet mee in het aantal beelden en het gemiddelde.
    var klaar = function (mislukt) {
      if (afgerond) return;
      afgerond = true;
      if (!mislukt) {
        cam.n += 1;
        cam.somMs += performance.now() - begin;
      }
      toonStat();
      gelezen.forEach(verwerk);
      cam.bezig = false;
    };
    var detectMislukt = function (e) {
      cam.detectFouten += 1;
      cam.laatsteFout = fout(e);
      if (cam.detectFouten === 5) {
        melding('cam-melding', 'fout', 'BarcodeDetector faalt bij elk beeld (' + cam.laatsteFout + ').');
      }
      klaar(true);
    };
    try {
      if (cam.decoder.detector) {
        cam.decoder.detector.detect(v).then(function (gevonden) {
          cam.detectFouten = 0;
          gevonden.forEach(function (b) { if (b.rawValue) gelezen.push(b.rawValue); });
          klaar();
        }, detectMislukt);
      } else {
        var canvas = $('werkvlak');
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        var schaal = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * schaal);
        canvas.height = Math.round(v.videoHeight * schaal);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        var beeld = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var res = window.jsQR(beeld.data, beeld.width, beeld.height, { inversionAttempts: 'dontInvert' });
        if (res && res.data) gelezen.push(res.data);
        klaar();
      }
    } catch (e) {
      // Eén mislukt beeld is geen fout: het volgende komt zo. Blijft het mislukken, dan zegt de pagina het.
      if (cam.decoder.detector) detectMislukt(e);
      else klaar(true);
    }
  }

  function startCamera() {
    stopCamera();
    wis('cam-melding');
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      cam.uitkomst = 'geen toegang tot camera\'s (mediaDevices ontbreekt)';
      melding('cam-melding', 'fout', 'Deze browser geeft de pagina geen toegang tot een camera. Dat kan alleen op een beveiligde verbinding (https). Probeer een andere browser of een ander adres.');
      return Promise.resolve();
    }
    var gekozen = $('cam-keuze').value;
    var video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (gekozen) video.deviceId = { exact: gekozen };
    else video.facingMode = { ideal: 'user' };
    $('cam-start').disabled = true;
    return md.getUserMedia({ video: video, audio: false }).then(function (stream) {
      if (cam.stream) { stream.getTracks().forEach(function (t) { t.stop(); }); return null; }
      cam.stream = stream;
      cam.uitkomst = 'gestart';
      cam.detectFouten = 0;
      cam.laatsteFout = '';
      var track = stream.getVideoTracks()[0];
      var inst = track && track.getSettings ? track.getSettings() : {};
      track.addEventListener('ended', function () {
        if (cam.stream !== stream) return;
        stopCamera();
        cam.uitkomst = 'gestart, daarna gestopt door het toestel of een ander programma';
        melding('cam-melding', 'letop', 'De camera is gestopt. Is ze losgekoppeld of door een ander programma overgenomen?');
      });
      cam.naam = (track && track.label) || 'camera zonder naam';
      cam.beeld = inst.width && inst.height ? inst.width + '×' + inst.height : 'onbekend';
      if (!cam.spiegelAangepast) $('spiegel').checked = inst.facingMode !== 'environment';
      zetSpiegel();
      var v = $('video');
      v.srcObject = stream;
      $('video-vak').hidden = false;
      $('cam-stop').disabled = false;
      $('meting-start').disabled = false;
      $('cam-naam').textContent = cam.naam;
      $('cam-beeld').textContent = cam.beeld + (inst.frameRate ? ', ' + Math.round(inst.frameRate) + ' beelden per seconde' : '');
      var spelen = v.play();
      if (spelen && spelen.catch) spelen.catch(function () { /* het beeld start bij een tik */ });
      return kiesDecoder().then(function (decoder) {
        if (cam.stream !== stream) return null;
        if (!decoder) {
          stopCamera();
          cam.uitkomst = 'mislukt: er is geen decoder om QR-codes te lezen';
          melding('cam-melding', 'fout', 'Er is geen decoder om QR-codes te lezen op dit toestel.');
          return null;
        }
        cam.decoder = decoder;
        $('decoder').textContent = decoder.naam + (decoder.reden ? ' (' + decoder.reden + ')' : '');
        zetMeting(true);
        cam.timer = setInterval(tik, 220);
        melding('cam-melding', 'goed', 'De camera draait. Houd een code voor de camera.');
        return vulCameralijst(inst.deviceId);
      });
    }, function (e) {
      $('cam-start').disabled = false;
      cam.uitkomst = 'mislukt: ' + cameraFout(e) + ' [' + (e && e.name) + (e && e.message ? ': ' + e.message : '') + ']';
      melding('cam-melding', 'fout', cameraFout(e));
      vulCameralijst();
    });
  }

  $('cam-start').addEventListener('click', function () { startCamera(); });
  $('cam-stop').addEventListener('click', function () {
    stopCamera();
    melding('cam-melding', '', 'De camera is gestopt.');
  });
  $('meting-start').addEventListener('click', function () { zetMeting(false); });
  $('spiegel').addEventListener('change', function () { cam.spiegelAangepast = true; zetSpiegel(); });
  $('cam-keuze').addEventListener('change', function () { if (cam.stream) startCamera(); });
  window.addEventListener('pagehide', stopCamera);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', function () { vulCameralijst(); });
  }
  if (typeof window.jsQR !== 'function') {
    $('decoder').textContent = 'jsqr is niet geladen';
  }
  // De stand bij het openen is wat telt voor VideoCaptureAllowedUrls: onchange werkt alleen de stand van nu bij.
  var toestemmingBijOpenen = 'wordt nagekeken';
  function toestemmingOnbekend() {
    toestemmingBijOpenen = 'niet na te kijken';
    $('cam-toestemming').textContent = toestemmingBijOpenen;
  }
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' }).then(function (p) {
        var uitleg = {
          granted: 'toegestaan (door het beleid van de school, of omdat iemand eerder ja zei)',
          prompt: 'de browser vraagt eerst',
          denied: 'geweigerd'
        };
        toestemmingBijOpenen = uitleg[p.state] || p.state;
        $('cam-toestemming').textContent = toestemmingBijOpenen;
        p.onchange = function () { $('cam-toestemming').textContent = uitleg[p.state] || p.state; };
      }, toestemmingOnbekend);
    } else {
      toestemmingOnbekend();
    }
  } catch (e) {
    toestemmingOnbekend();
  }

  // ── (c) Stem ─────────────────────────────────────────────────────────────
  var stem = { gebruikt: 'nog niet uitgeprobeerd', samenvatting: 'wordt nagekeken', uitkomst: 'niet uitgeprobeerd', online: '' };
  var laatsteZin = null;

  function stemmen() {
    try { return window.speechSynthesis.getVoices() || []; } catch (e) { return []; }
  }
  function taalVan(v) { return String(v.lang || '').replace('_', '-').toLowerCase(); }
  function isNl(v) { return taalVan(v) === 'nl' || taalVan(v).indexOf('nl-') === 0; }
  function kiesStem(lijst) {
    var regels = [
      function (t) { return t === 'nl-be'; },
      function (t) { return t === 'nl-nl'; },
      function (t) { return t === 'nl' || t.indexOf('nl-') === 0; }
    ];
    for (var r = 0; r < regels.length; r += 1) {
      for (var i = 0; i < lijst.length; i += 1) {
        if (regels[r](taalVan(lijst[i]))) return lijst[i];
      }
    }
    return null;
  }
  function beschrijf(v) {
    return v.name + ' (' + v.lang + '), ' + (v.localService ? 'werkt zonder internet' : 'heeft internet nodig');
  }
  function toonStemmen() {
    if (!('speechSynthesis' in window)) {
      stem.samenvatting = 'dit toestel heeft geen spraaksynthese (speechSynthesis)';
      $('stem-samenvatting').textContent = stem.samenvatting;
      $('stem-vak').hidden = true;
      return;
    }
    var lijst = stemmen();
    var nl = lijst.filter(isNl);
    var be = nl.filter(function (v) { return taalVan(v) === 'nl-be'; }).length;
    var nlnl = nl.filter(function (v) { return taalVan(v) === 'nl-nl'; }).length;
    stem.samenvatting = lijst.length
      ? lijst.length + ' stemmen, waarvan ' + nl.length + ' Nederlands (nl-BE: ' + be + ', nl-NL: ' + nlnl + ', andere nl: ' + (nl.length - be - nlnl) + ')'
      : 'geen stemmen gemeld (sommige toestellen melden ze pas na een paar seconden)';
    $('stem-samenvatting').textContent = stem.samenvatting;
    var rijen = $('stem-rijen');
    rijen.innerHTML = '';
    lijst.forEach(function (v) {
      var tr = document.createElement('tr');
      [v.name, v.lang, v.localService ? 'ja' : 'nee', v.default ? 'ja' : 'nee'].forEach(function (waarde) {
        var td = document.createElement('td');
        td.textContent = waarde;
        tr.appendChild(td);
      });
      rijen.appendChild(tr);
    });
    $('stem-vak').hidden = lijst.length === 0;
  }
  if ('speechSynthesis' in window) {
    if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', toonStemmen);
    else window.speechSynthesis.onvoiceschanged = toonStemmen;
    setTimeout(toonStemmen, 1000);
    setTimeout(toonStemmen, 3000);
  }
  toonStemmen();

  $('stem-zeg').addEventListener('click', function () {
    wis('stem-melding');
    stem.online = navigator.onLine ? 'online' : 'offline';
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      stem.uitkomst = 'geen spraaksynthese';
      melding('stem-melding', 'letop', 'Dit toestel heeft geen spraaksynthese (speechSynthesis). Er is dus geen stem om te horen.');
      return;
    }
    var lijst = stemmen();
    var gekozen = kiesStem(lijst);
    if (!gekozen) {
      stem.gebruikt = 'geen Nederlandse stem';
      stem.uitkomst = lijst.length ? 'geen Nederlandse stem (nl-BE, nl-NL of nl)' : 'de lijst met stemmen is leeg';
      $('stem-gebruikt').textContent = stem.gebruikt;
      melding('stem-melding', 'letop', lijst.length
        ? 'Geen Nederlandse stem gevonden (nl-BE, nl-NL of nl). De zin wordt niet uitgesproken.'
        : 'De lijst met stemmen is leeg. Wacht een paar seconden en probeer opnieuw.');
      return;
    }
    stem.gebruikt = beschrijf(gekozen);
    $('stem-gebruikt').textContent = stem.gebruikt;
    stem.uitkomst = 'gevraagd, nog geen bericht van de stem';
    try {
      var zin = new window.SpeechSynthesisUtterance(ZIN);
      zin.voice = gekozen;
      zin.lang = gekozen.lang;
      zin.onstart = function () { stem.uitkomst = 'begonnen met spreken'; };
      zin.onend = function () {
        stem.uitkomst = 'klaar met spreken';
        melding('stem-melding', 'goed', 'De stem sprak de zin uit. Hoorde je ze? Noteer het erbij.');
      };
      zin.onerror = function (e) {
        stem.uitkomst = 'fout: ' + (e && e.error ? e.error : 'onbekend');
        melding('stem-melding', 'fout', 'De stem kon de zin niet uitspreken (' + (e && e.error ? e.error : 'onbekende fout') + ').');
      };
      laatsteZin = zin;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(zin);
    } catch (e) {
      stem.uitkomst = 'fout: ' + fout(e);
      melding('stem-melding', 'fout', 'De stem kon niet starten (' + fout(e) + ').');
    }
  });

  // ── (d) Opslag ───────────────────────────────────────────────────────────
  var opslag = {
    lsStart: 'wordt nagekeken', idbStart: 'wordt nagekeken', lsNu: 'wordt nagekeken', idbNu: 'wordt nagekeken',
    persisted: 'wordt nagekeken', estimate: 'wordt nagekeken'
  };

  function lsLees() {
    try {
      var w = localStorage.getItem(SLEUTEL);
      return w ? 'merkje van ' + uur(w) : GEEN_MERKJE;
    } catch (e) { return 'niet bruikbaar (' + fout(e) + ')'; }
  }
  function idbOpen() {
    return new Promise(function (ok, nok) {
      if (!window.indexedDB) { nok(new Error('IndexedDB ontbreekt')); return; }
      var verzoek;
      try { verzoek = window.indexedDB.open(DB_NAAM, 1); } catch (e) { nok(e); return; }
      var klaar = false;
      var wacht = setTimeout(function () {
        if (!klaar) { klaar = true; nok(new Error('IndexedDB antwoordt niet')); }
      }, 4000);
      verzoek.onupgradeneeded = function () { verzoek.result.createObjectStore(STORE); };
      verzoek.onsuccess = function () {
        if (klaar) { verzoek.result.close(); return; }
        klaar = true;
        clearTimeout(wacht);
        ok(verzoek.result);
      };
      verzoek.onerror = function () {
        if (klaar) return;
        klaar = true;
        clearTimeout(wacht);
        nok(verzoek.error || new Error('IndexedDB-fout'));
      };
    });
  }
  function idbDoe(modus, werk) {
    return idbOpen().then(function (db) {
      return new Promise(function (ok, nok) {
        var tx, res;
        try {
          tx = db.transaction(STORE, modus);
          res = werk(tx.objectStore(STORE));
        } catch (e) { db.close(); nok(e); return; }
        tx.oncomplete = function () { db.close(); ok(res && 'result' in res ? res.result : undefined); };
        tx.onerror = tx.onabort = function () { db.close(); nok(tx.error || new Error('transactie mislukt')); };
      });
    });
  }
  function idbLees() {
    return idbDoe('readonly', function (store) { return store.get('merkje'); }).then(
      function (w) { return w ? 'merkje van ' + uur(w) : GEEN_MERKJE; },
      function (e) { return 'niet bruikbaar (' + fout(e) + ')'; }
    );
  }

  function leesAlles(naarStart) {
    var ls = lsLees();
    $('ls-nu').textContent = ls;
    opslag.lsNu = ls;
    if (naarStart) { opslag.lsStart = ls; $('ls-start').textContent = ls; }
    return idbLees().then(function (idb) {
      $('idb-nu').textContent = idb;
      opslag.idbNu = idb;
      if (naarStart) { opslag.idbStart = idb; $('idb-start').textContent = idb; }
    });
  }

  $('merkje-zet').addEventListener('click', function () {
    var nu = new Date().toISOString();
    var problemen = [];
    try { localStorage.setItem(SLEUTEL, nu); } catch (e) { problemen.push('localStorage: ' + fout(e)); }
    idbDoe('readwrite', function (store) { return store.put(nu, 'merkje'); }).then(null, function (e) {
      problemen.push('IndexedDB: ' + fout(e));
    }).then(function () {
      return leesAlles(false);
    }).then(function () {
      if (problemen.length) melding('opslag-melding', 'letop', 'Het merkje kon niet overal bewaard worden. ' + problemen.join('; ') + '.');
      else melding('opslag-melding', 'goed', 'Het merkje van ' + uur(nu) + ' staat in localStorage en in IndexedDB.');
    });
  });
  $('merkje-wis').addEventListener('click', function () {
    var problemen = [];
    try { localStorage.removeItem(SLEUTEL); } catch (e) { problemen.push('localStorage: ' + fout(e)); }
    idbDoe('readwrite', function (store) { return store.delete('merkje'); }).then(null, function (e) {
      problemen.push('IndexedDB: ' + fout(e));
    }).then(function () {
      return leesAlles(false);
    }).then(function () {
      if (problemen.length) melding('opslag-melding', 'letop', 'Het merkje kon niet overal gewist worden. ' + problemen.join('; ') + '.');
      else melding('opslag-melding', 'goed', 'Het merkje is gewist.');
    });
  });

  function megabyte(bytes) { return komma(bytes / 1048576, 1) + ' MB'; }
  function leesBlijvend() {
    var s = navigator.storage;
    if (s && s.persisted) {
      s.persisted().then(function (ja) {
        opslag.persisted = ja ? 'ja, de browser wist de opslag niet zomaar' : 'nee, de browser mag de opslag wissen als de schijf vol raakt';
        $('s-persisted').textContent = opslag.persisted;
      }, function (e) { opslag.persisted = 'niet na te kijken (' + fout(e) + ')'; $('s-persisted').textContent = opslag.persisted; });
    } else {
      opslag.persisted = 'niet beschikbaar in deze browser';
      $('s-persisted').textContent = opslag.persisted;
    }
    if (s && s.estimate) {
      s.estimate().then(function (e) {
        opslag.estimate = megabyte(e.usage || 0) + ' gebruikt van ' + megabyte(e.quota || 0) + ' beschikbaar';
        $('s-estimate').textContent = opslag.estimate;
      }, function (e) { opslag.estimate = 'niet na te kijken (' + fout(e) + ')'; $('s-estimate').textContent = opslag.estimate; });
    } else {
      opslag.estimate = 'niet beschikbaar in deze browser';
      $('s-estimate').textContent = opslag.estimate;
    }
  }

  // ── (f) Uitslag ──────────────────────────────────────────────────────────
  function datumNu() {
    var d = new Date();
    try { return d.toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' }); } catch (e) { return d.toISOString(); }
  }
  function maakUitslag() {
    var uad = navigator.userAgentData;
    var regels = [
      'Toestelproef Boosterz',
      'Datum: ' + datumNu(),
      'Toestel: ' + toestelNaam(),
      '',
      'Scanner',
      '- Decoder: ' + $('decoder').textContent,
      '- Toestemming voor de camera bij het openen: ' + toestemmingBijOpenen,
      '- Toestemming voor de camera nu: ' + $('cam-toestemming').textContent,
      '- Camera starten: ' + cam.uitkomst,
      '- Camera: ' + cam.naam,
      '- Beeld van de camera: ' + $('cam-beeld').textContent,
      '- Beelden bekeken: ' + $('cam-stat').textContent,
      '- Fouten van BarcodeDetector: ' + cam.detectFouten + (cam.laatsteFout ? ' (' + cam.laatsteFout + ')' : ''),
      '- Log van de meting:'
    ];
    if (logRegels.length) logRegels.forEach(function (l) { regels.push('  ' + l); });
    else regels.push('  (nog niets gelezen)');
    regels.push(
      '',
      'Stem',
      '- Stemmen: ' + stem.samenvatting
    );
    stemmen().filter(isNl).forEach(function (v) {
      regels.push('  ' + v.name + ' (' + v.lang + '), zonder internet: ' + (v.localService ? 'ja' : 'nee') + (v.default ? ', standaard' : ''));
    });
    regels.push(
      '- Gebruikte stem: ' + stem.gebruikt,
      '- Internet bij de laatste poging: ' + (stem.online || 'nog geen poging'),
      '- Uitkomst: ' + stem.uitkomst,
      '',
      'Opslag',
      '- localStorage bij het openen: ' + opslag.lsStart,
      '- IndexedDB bij het openen: ' + opslag.idbStart,
      '- localStorage nu: ' + opslag.lsNu,
      '- IndexedDB nu: ' + opslag.idbNu,
      '- Blijvende opslag: ' + opslag.persisted,
      '- Gebruik: ' + opslag.estimate,
      '',
      'Toestel',
      '- Platform: ' + (uad && uad.platform ? uad.platform : 'niet gemeld'),
      '- Browser: ' + (navigator.userAgent || 'onbekend'),
      '- Scherm: ' + screen.width + ' × ' + screen.height + ' pixels',
      '- Venster: ' + window.innerWidth + ' × ' + window.innerHeight + ' pixels',
      '- Pixelverhouding: ' + (window.devicePixelRatio || 1),
      '- BarcodeDetector: ' + toestel.barcodeDetector,
      '- Aantal camera\'s: ' + toestel.camera,
      '- Internet volgens het toestel: ' + (navigator.onLine ? 'online' : 'offline')
    );
    return regels.join('\n');
  }
  $('kopieer').addEventListener('click', function () {
    var tekst = maakUitslag();
    $('uitslag-vak').hidden = false;
    var vak = $('uitslag-tekst');
    vak.value = tekst;
    var verzoek = null;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) verzoek = navigator.clipboard.writeText(tekst);
    } catch (e) { verzoek = null; }
    var zelfKopieren = function () {
      vak.focus();
      vak.select();
      melding('uitslag-melding', 'letop', 'Kopiëren lukte niet. De tekst staat geselecteerd: druk op Ctrl+C om te kopiëren.');
    };
    if (!verzoek) { zelfKopieren(); return; }
    verzoek.then(function () {
      melding('uitslag-melding', 'goed', 'De uitslag staat op het klembord. Plak ze in een bericht.');
    }, zelfKopieren);
  });

  // ── Start ────────────────────────────────────────────────────────────────
  toonCode();
  toonToestel();
  leesBlijvend();
  leesAlles(true).then(null, function () { /* elke lezing meldt zijn eigen fout */ });
  vulCameralijst();
})();
`;

/** Maakt de volledige pagina. Geen datum of toeval erin: hetzelfde resultaat bij elke run. */
export function maakPagina(codes) {
  let jsqrBron = readFileSync(JSQR_BRON, 'utf8');
  const verwijzing = 'http://en.wikipedia.org/wiki/Bresenham';
  eis(jsqrBron.split(verwijzing).length === 2, 'jsQR.js bevat niet precies één verwijzing naar Bresenham meer: pas maak-proef.mjs aan.');
  // Alleen een verwijzing in een opmerking; zonder protocol blijft de pagina vrij van elke webadresstring.
  jsqrBron = jsqrBron.replace(verwijzing, 'en.wikipedia.org/wiki/Bresenham');
  eis(!/<\/script/i.test(jsqrBron), 'jsQR.js bevat </script en kan niet ingevoegd worden.');
  const jsqrPakket = JSON.parse(readFileSync(path.join(REPO, 'node_modules', 'jsqr', 'package.json'), 'utf8'));
  const licentie = `/*! jsQR ${jsqrPakket.version}, licentie ${jsqrPakket.license}, ongewijzigd uit node_modules/jsqr/dist/jsQR.js (op één verwijzing in een opmerking na). De licentietekst staat in het pakket jsqr. */`;

  const gegevens = JSON.stringify(codes.map((c) => ({ versie: c.versie, px: c.px, lengte: c.lengte, modules: c.modules, d: c.d }))).replace(/</g, '\\u003c');

  return [
    '<!doctype html>',
    '<html lang="nl-BE">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    '<title>Toestelproef Boosterz</title>',
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    BODY.trim(),
    `<script type="application/json" id="codes-data">${gegevens}</script>`,
    `<script>\n${licentie}\n${jsqrBron}\n</script>`,
    `<script>${CLIENT_JS}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ── Controles op de pagina ───────────────────────────────────────────────────

function controleerPagina(html, codes) {
  eis(html.startsWith('<!doctype html>'), 'De pagina begint niet met <!doctype html>.');
  eis(/<html lang="nl-BE">/.test(html), 'lang="nl-BE" ontbreekt.');
  eis(/<meta charset="utf-8">/.test(html), 'De charset ontbreekt.');
  eis(/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html), 'De viewport ontbreekt.');
  eis(!/https?:\/\//i.test(html), 'De pagina bevat een webadres (http:// of https://): ze mag geen enkele externe verwijzing hebben.');
  eis(!/<script\b[^>]*\ssrc\s*=/i.test(html), 'De pagina bevat een <script src>.');
  eis(!/<link\b/i.test(html), 'De pagina bevat een <link>.');
  eis(!/<(?:img|iframe|object|embed|video|audio|source|form)\b[^>]*\s(?:src|action|data)\s*=/i.test(html), 'De pagina laadt iets via src, action of data.');
  eis(!/@import|url\(/i.test(html), 'De css haalt iets op via @import of url().');
  eis(!/\b(?:fetch|sendBeacon|importScripts)\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(html), 'De pagina gebruikt een netwerkaanroep.');
  eis((html.match(/<main\b/g) || []).length === 1, 'Er moet precies één <main> zijn.');
  eis((html.match(/<h1\b/g) || []).length === 1, 'Er moet precies één <h1> zijn.');
  eis((html.match(/<script\b/g) || []).length === 3, 'Verwachtte precies drie scripts (gegevens, jsqr, pagina).');
  eis(!/\p{Extended_Pictographic}/u.test(html), 'De pagina bevat een emoji.');
  eis(html.includes('shape-rendering="crispEdges"'), 'shape-rendering crispEdges ontbreekt.');
  eis(Buffer.byteLength(html) < 600_000, `De pagina is ${Buffer.byteLength(html)} bytes: te groot.`);
  for (const c of codes) {
    eis(html.includes(c.d), `Het pad van versie ${c.versie} op ${c.px} px staat niet in de pagina.`);
  }
  // De pagina mag de databases van de app nooit aanraken.
  eis(!html.includes('wf-files'), "De pagina noemt de database 'wf-files' van de app.");
}

function hoofd() {
  try {
    const codes = maakCodes();
    controleerCodes(codes);
    const html = maakPagina(codes);
    controleerPagina(html, codes);
    mkdirSync(path.dirname(UITVOER), { recursive: true });
    writeFileSync(UITVOER, html, 'utf8');
    console.log(`Toestelproef gemaakt: ${path.relative(REPO, UITVOER)} (${Buffer.byteLength(html)} bytes)`);
    for (const c of codes) {
      console.log(`  versie ${String(c.versie).padStart(2)} op ${c.px} px: ${String(c.lengte).padStart(3)} tekens, ${c.modules} modules, ${(c.modules + 2 * MARGE) * c.px} px breed, jsqr leest ze exact terug`);
    }
    console.log('Alle controles geslaagd.');
  } catch (e) {
    if (e instanceof ControleFout) {
      console.error(`Toestelproef niet gemaakt: ${e.message}`);
    } else {
      console.error(`Toestelproef niet gemaakt door een onverwachte fout: ${e && e.stack ? e.stack : e}`);
    }
    process.exit(1);
  }
}

// Vergelijk de echte paden: via een symlink, junction of subst-station moet het script toch draaien.
let isHoofd = false;
try {
  isHoofd = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isHoofd = false;
}
if (isHoofd) hoofd();
