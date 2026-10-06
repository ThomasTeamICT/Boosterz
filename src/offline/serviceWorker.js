/* global BOOSTERZ, self, caches, fetch, Request, Response, URL, setTimeout, clearTimeout */
// ── Boosterz: service worker (offline-schil) ────────────────────────────────
//
// Dit is een SJABLOON. De build (vite.config.ts, plugin `offlineShell`) zet er
// een regel `const BOOSTERZ = {…}` voor en schrijft het resultaat naar
// dist/sw.js. BOOSTERZ bevat:
//   version   hash van deze build; zit in de naam van de schilcache
//   entry     de hoofdbundel, bv. "assets/index-abc123.js"
//   precache  wat bij de installatie bewaard wordt: de hoofdbundel (js, css),
//             het manifest en het icoon. index.html komt er altijd bij.
//   known     alle bestanden van deze build (assets/ en public/): wat daar
//             niet in staat, ruimen we bij de activatie op.
//
// Strategie per soort verzoek:
//   navigatie (index.html)  netwerk eerst, de bewaarde schil als terugval,
//                           en anders een eigen offline-pagina
//   assets/…                cache eerst: gehashte namen, dus onveranderlijk
//   andere eigen bestanden  netwerk eerst, cache als terugval
//                           (manifest, voorbeelden/…)
//   al de rest              ongemoeid: andere origins (AI-API's, video's,
//                           externe afbeeldingen), POST, Range, blob:, data:,
//                           sw.js zelf
//
// Updates mogen nooit blijven hangen. Daarom:
//   - navigaties gaan altijd eerst naar het netwerk (met revalidatie van de
//     HTTP-cache), dus een nieuwe uitrol verschijnt bij het volgende laden;
//   - de bewaarde schil verwijst nooit naar een bestand dat niet bewaard is:
//     een nieuwe index.html wordt pas bewaard nadat de bundels waarnaar ze
//     verwijst in de cache staan;
//   - bij de installatie van een nieuwe versie haalt de service worker ook de
//     nieuwe versie op van elke chunk die op dit toestel al bewaard was: wat
//     een leerling al eens opende, blijft zo ook na een uitrol offline werken;
//   - een nieuwe service worker neemt nooit zomaar een open pagina over. Hij
//     wacht, tenzij de enige open pagina al dezelfde build draait (zie
//     'boosterz:activate'). Niemand herlaadt een pagina: alleen de volgende
//     navigatie gebruikt de nieuwe versie.

// De map van de app, waar sw.js staat: bv. https://…/Boosterz/ of http://localhost:4187/
const ROOT = new URL('./', self.location.href).href;
const ROOT_PATH = new URL(ROOT).pathname;

// Cachenamen. Een spatie scheidt de delen: die komt nooit onge-escaped in een
// URL-pad voor. Zo ruimen twee apps op dezelfde origin (github.io deelt één
// origin over alle projecten) nooit elkaars caches op.
const PREFIX = 'boosterz ' + ROOT_PATH + ' ';
const SHELL_CACHE = PREFIX + 'shell ' + BOOSTERZ.version; // index.html van deze versie
const FILES_CACHE = PREFIX + 'files'; // alle andere bestanden, gedeeld over versies

const INDEX_URL = ROOT + 'index.html';
const ENTRY_URL = ROOT + BOOSTERZ.entry;
const KNOWN = new Set(BOOSTERZ.known);

// ── Installatie: de kleine voorcache ────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Geen skipWaiting: bij de eerste installatie is er niets om op te wachten,
  // en bij een update mag een open pagina niet van onder zich weggetrokken worden.
  event.waitUntil(precache());
});

async function precache() {
  // index.html altijd van het netwerk, langs de HTTP-cache heen: een oude
  // index.html in de voorcache zou naar bundels verwijzen die we niet bewaren.
  const res = await fetch(INDEX_URL, { cache: 'reload' });
  if (!res.ok) throw new Error('Boosterz: index.html niet bereikbaar (' + res.status + ')');
  const html = await res.text();
  // Tijdens een uitrol kan het CDN nog even de vorige index.html geven. Dan
  // liever niet installeren: de browser probeert het bij de volgende navigatie opnieuw.
  if (!html.includes(BOOSTERZ.entry)) {
    throw new Error('Boosterz: index.html hoort bij een andere build; installatie later opnieuw');
  }
  const files = await caches.open(FILES_CACHE);
  for (const path of BOOSTERZ.precache) {
    const url = ROOT + path;
    const hashed = path.startsWith('assets/');
    // Gehashte bestanden die er al zijn (ongewijzigd sinds de vorige versie) niet opnieuw ophalen.
    if (hashed && (await files.match(url, { ignoreVary: true }))) continue;
    const r = await fetch(url, { cache: hashed ? 'default' : 'reload' });
    if (!cacheable(r)) throw new Error('Boosterz: ' + path + ' niet bereikbaar (' + r.status + ')');
    await files.put(url, r);
  }
  // De schil als laatste: pas als alles waarnaar ze verwijst, bewaard is.
  const shell = await caches.open(SHELL_CACHE);
  await shell.put(INDEX_URL, htmlResponse(html, 200));
  // Daarna, zonder dat het de installatie kan doen mislukken: wat hier al
  // bewaard was, ook in zijn nieuwe versie bewaren. Hooguit een minuut.
  let timer;
  await Promise.race([carryOver(files), new Promise((resolve) => (timer = setTimeout(resolve, 60000)))]);
  clearTimeout(timer);
}

/** "assets/quiz-C1J3x4w3.js" → "assets/quiz.js": de bestandsnaam zonder hash. */
function chunkBase(path) {
  const m = /^(assets\/.+)-[\w-]{8}(\.\w+)$/.exec(path);
  return m ? m[1] + m[2] : null;
}

/**
 * Na een uitrol heeft bijna elke chunk een nieuwe hash (ze importeren de
 * hoofdbundel, en die verandert bijna altijd). Een oefening die een leerling
 * al eens opende, zou offline dus niet meer openen tot ze online opnieuw
 * geladen werd. Daarom halen we bij de installatie de nieuwe versie op van
 * elke chunk die op dit toestel al bewaard was, en alleen die.
 */
async function carryOver(files) {
  const byBase = new Map();
  for (const path of KNOWN) {
    const base = chunkBase(path);
    if (base) byBase.set(base, [...(byBase.get(base) || []), path]);
  }
  const wanted = new Set();
  for (const request of await files.keys()) {
    const path = pathInApp(request.url);
    if (path === null || KNOWN.has(path)) continue;
    for (const next of byBase.get(chunkBase(path)) || []) wanted.add(next);
  }
  for (const path of wanted) {
    const url = ROOT + path;
    try {
      if (await files.match(url, { ignoreVary: true })) continue;
      const res = await fetch(url);
      if (cacheable(res)) await files.put(url, res);
    } catch {
      // niet erg: dan bij het eerste gebruik
    }
  }
}

// ── Activatie: oude versies opruimen ────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

async function activate() {
  // 1. Schilcaches van vorige versies weg (alleen de onze: zelfde prefix).
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(PREFIX) && name !== SHELL_CACHE && name !== FILES_CACHE)
      .map((name) => caches.delete(name))
  );
  // 2. Bestanden die niet meer bij deze build horen, weg. Ongewijzigde chunks
  //    (zelfde hash) blijven, zodat wat al eens geopend werd offline blijft werken.
  const files = await caches.open(FILES_CACHE);
  for (const request of await files.keys()) {
    const path = pathInApp(request.url);
    if (path === null || !KNOWN.has(path)) await files.delete(request);
  }
  // 3. Pagina's die nog geen service worker hadden (het allereerste bezoek)
  //    meteen bedienen, zodat de chunks die ze nog laden ook bewaard worden.
  //    Er wordt niets herladen; de pagina merkt dit niet.
  await self.clients.claim();
}

// ── Verzoeken ───────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const route = routeFor(event.request);
  if (route === 'navigate') onNavigate(event);
  else if (route === 'asset') onAsset(event);
  else if (route === 'file') onFile(event);
  // anders: niets doen, de browser handelt het verzoek zelf af
});

/** Welke strategie? `null` = de service worker bemoeit zich er niet mee. */
function routeFor(request) {
  if (request.method !== 'GET') return null;
  // Bereikverzoeken (audio, video) geven 206-antwoorden: die horen niet in de cache.
  if (request.headers.has('range')) return null;
  // Bekende Chrome-eigenaardigheid (devtools): fetch() zou hier falen.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null; // blob:, data:, …
  if (url.origin !== self.location.origin) return null; // AI-API's, video's, …
  if (!url.pathname.startsWith(ROOT_PATH)) return null; // buiten onze map
  if (request.mode === 'navigate') return 'navigate';
  const path = url.pathname.slice(ROOT_PATH.length);
  if (path === 'sw.js') return null;
  if (path.startsWith('assets/')) return 'asset';
  return 'file';
}

/** Pad binnen de app (gedecodeerd), of `null` als de URL er niet bij hoort of een query heeft. */
function pathInApp(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== self.location.origin || url.search || !url.pathname.startsWith(ROOT_PATH)) return null;
  try {
    return decodeURIComponent(url.pathname.slice(ROOT_PATH.length));
  } catch {
    return null;
  }
}

function isShellPath(url) {
  const path = url.pathname.slice(ROOT_PATH.length);
  return path === '' || path === 'index.html';
}

function cacheable(res) {
  return Boolean(res) && res.status === 200 && res.type === 'basic' && !res.redirected;
}

async function matchFile(url) {
  const files = await caches.open(FILES_CACHE);
  return files.match(url, { ignoreVary: true });
}

// Navigatie: netwerk eerst (revalideren, dus nooit een verouderde index.html
// uit de HTTP-cache), met de bewaarde schil als terugval.
function onNavigate(event) {
  const url = new URL(event.request.url);
  let refresh = Promise.resolve();
  const response = fetch(revalidating(event.request))
    .then((res) => {
      if (!isShellPath(url)) return res;
      if (cacheable(res)) {
        refresh = refreshShell(res.clone());
        return res;
      }
      // Serverfout (bv. GitHub Pages even onbereikbaar): liever de bewaarde schil.
      if (res.status >= 500) return cachedShell().then((shell) => shell || res);
      return res;
    })
    .catch(() => offlineNavigation(url));
  event.respondWith(response);
  event.waitUntil(response.then(() => refresh).catch(() => {}));
}

/**
 * Dezelfde navigatie, maar met revalidatie van de HTTP-cache (GitHub Pages
 * geeft index.html tien minuten houdbaarheid). Lukt dat kopiëren niet, dan het
 * originele verzoek: nooit een reden om op de cache terug te vallen.
 */
function revalidating(request) {
  try {
    return new Request(request, { cache: 'no-cache' });
  } catch {
    return request;
  }
}

async function cachedShell() {
  const shell = await caches.open(SHELL_CACHE);
  return (await shell.match(INDEX_URL)) || null;
}

async function offlineNavigation(url) {
  const hit = isShellPath(url) ? await cachedShell() : await matchFile(url.href);
  return hit || offlinePage();
}

/**
 * Bewaar een net opgehaalde index.html als nieuwe schil, maar pas nadat alle
 * bundels waarnaar ze verwijst in de cache staan. Lukt dat niet (verbinding
 * valt weg), dan blijft de vorige schil staan: die werkt nog volledig.
 */
async function refreshShell(response) {
  try {
    const html = await response.text();
    const refs = assetRefs(html);
    if (refs.length === 0) return; // geen Boosterz-schil
    const files = await caches.open(FILES_CACHE);
    for (const ref of refs) {
      const url = ROOT + ref;
      if (await files.match(url, { ignoreVary: true })) continue;
      const res = await fetch(url);
      if (!cacheable(res)) return;
      await files.put(url, res);
    }
    const shell = await caches.open(SHELL_CACHE);
    await shell.put(INDEX_URL, htmlResponse(html, 200));
  } catch {
    // niet erg: de vorige schil blijft staan
  }
}

/** De bundels waarnaar een index.html verwijst: <script src>, <link href> in assets/. */
function assetRefs(html) {
  const refs = new Set();
  const re = /\s(?:src|href)=["'](?:\.\/)?(assets\/[^"'?#]+)["']/g;
  let m;
  while ((m = re.exec(html))) refs.add(m[1]);
  return [...refs];
}

// Gehashte bestanden: cache eerst. Wat nog niet bewaard is, halen we op en bewaren we.
function onAsset(event) {
  event.respondWith(
    (async () => {
      const hit = await matchFile(event.request.url);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (cacheable(res) && pathInApp(event.request.url) !== null) {
        const copy = res.clone();
        event.waitUntil(caches.open(FILES_CACHE).then((c) => c.put(event.request.url, copy)).catch(() => {}));
      }
      return res;
    })()
  );
}

// Andere eigen bestanden: netwerk eerst, zodat een gewijzigd voorbeeldbestand
// meteen verschijnt; offline de laatst bewaarde versie.
function onFile(event) {
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request);
        if (cacheable(res) && pathInApp(event.request.url) !== null) {
          const copy = res.clone();
          event.waitUntil(caches.open(FILES_CACHE).then((c) => c.put(event.request.url, copy)).catch(() => {}));
        }
        return res;
      } catch (err) {
        const hit = await matchFile(event.request.url);
        if (hit) return hit;
        throw err;
      }
    })()
  );
}

// ── Berichten van de pagina ─────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'boosterz:cache-urls') event.waitUntil(cacheUrls(data.urls));
  else if (data.type === 'boosterz:activate') event.waitUntil(activateIfAlone(event.source, data.entry));
});

/**
 * Bij het allereerste bezoek laadde de pagina al chunks vóór deze service
 * worker bestond. De pagina stuurt die lijst; wij bewaren alleen bestanden in
 * assets/ die bij deze build horen.
 */
async function cacheUrls(urls) {
  if (!Array.isArray(urls)) return;
  const files = await caches.open(FILES_CACHE);
  for (const raw of urls.slice(0, 300)) {
    if (typeof raw !== 'string') continue;
    const path = pathInApp(raw);
    if (path === null || !path.startsWith('assets/') || !KNOWN.has(path)) continue;
    const url = ROOT + path;
    try {
      if (await files.match(url, { ignoreVary: true })) continue;
      const res = await fetch(url);
      if (cacheable(res)) await files.put(url, res);
    } catch {
      // volgende keer beter
    }
  }
}

/**
 * Een wachtende nieuwe versie neemt alleen over als dat niemand kan storen:
 * er is precies één open venster, dat is de vrager, en die draait al exact
 * deze build (zelfde hoofdbundel). Dan verandert er voor die pagina niets
 * zichtbaars; ze wordt niet herladen. Draait er ergens nog een oudere versie
 * (een leerling midden in een toets in een ander tabblad), dan wachten we tot
 * die gesloten is. Nieuwe navigaties krijgen hoe dan ook de nieuwe index.html,
 * want navigaties gaan netwerk eerst.
 */
async function activateIfAlone(source, entry) {
  if (entry !== ENTRY_URL || !source) return;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.length !== 1 || windows[0].id !== source.id) return;
  await self.skipWaiting();
}

// ── Hulpjes ─────────────────────────────────────────────────────────────────

function htmlResponse(html, status) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Laatste vangnet voor een navigatie zonder netwerk en zonder bewaarde kopie. */
function offlinePage() {
  const html =
    '<!doctype html><html lang="nl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light dark"><title>Offline · Boosterz</title>' +
    '<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;' +
    'background:Canvas;color:CanvasText;padding:20px;box-sizing:border-box}' +
    'main{max-width:440px;text-align:center}h1{font-size:1.3rem}p{line-height:1.5}' +
    'button{font:inherit;font-weight:700;padding:10px 18px;border-radius:10px;border:0;' +
    'background:#5b3df5;color:#fff;cursor:pointer}button:focus-visible{outline:3px solid #ff6a2a;outline-offset:2px}</style>' +
    '</head><body><main><h1>Je bent offline</h1>' +
    '<p>Dit deel van Boosterz werd op dit toestel nog niet geopend. ' +
    'Je antwoorden en materiaal blijven bewaard.</p>' +
    '<button type="button" onclick="location.reload()">Opnieuw proberen</button>' +
    '</main></body></html>';
  return new Response(html, {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
