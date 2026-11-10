// Gedragstests voor de service worker. We draaien het ECHTE sjabloon
// (serviceWorker.js, aangevuld door renderServiceWorker zoals bij de build)
// tegen nagebootste browser-API's: een netwerk dat we online en offline
// zetten, een CacheStorage in het geheugen en events die we zelf afvuren.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { assetRefs as buildAssetRefs, renderServiceWorker, type ServiceWorkerConfig } from '../lib/swBuild';

const TEMPLATE = readFileSync(new URL('./serviceWorker.js', import.meta.url), 'utf8');

// ── Nagebootste Request, Response, Cache en CacheStorage ────────────────────

interface ResInit {
  status?: number;
  type?: string;
  redirected?: boolean;
  headers?: Record<string, string>;
}

class FakeResponse {
  status: number;
  type: string;
  redirected: boolean;
  headers: Headers;
  bodyUsed = false;
  constructor(public body: string, init: ResInit = {}) {
    this.status = init.status ?? 200;
    this.type = init.type ?? 'default';
    this.redirected = init.redirected ?? false;
    this.headers = new Headers(init.headers ?? {});
  }
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
  async text() {
    if (this.bodyUsed) throw new TypeError('body already used');
    this.bodyUsed = true;
    return this.body;
  }
  clone() {
    if (this.bodyUsed) throw new TypeError('body already used');
    return new FakeResponse(this.body, { status: this.status, type: this.type, redirected: this.redirected });
  }
}

interface ReqInit {
  method?: string;
  mode?: string;
  cache?: string;
  headers?: Record<string, string>;
}

class FakeRequest {
  url: string;
  method: string;
  mode: string;
  cache: string;
  headers: Headers;
  constructor(input: string | FakeRequest, init: ReqInit = {}) {
    const base = typeof input === 'string' ? null : input;
    this.url = typeof input === 'string' ? input : input.url;
    this.method = init.method ?? base?.method ?? 'GET';
    // Zoals de spec: een navigatie kopiëren met extra opties maakt er same-origin van.
    const mode = init.mode ?? base?.mode ?? 'cors';
    this.mode = base && mode === 'navigate' ? 'same-origin' : mode;
    this.cache = init.cache ?? base?.cache ?? 'default';
    this.headers = new Headers(init.headers ?? {});
  }
}

const keyOf = (r: string | { url: string }) => (typeof r === 'string' ? r : r.url);

class FakeCache {
  store = new Map<string, FakeResponse>();
  async match(r: string | { url: string }) {
    const hit = this.store.get(keyOf(r));
    return hit ? hit.clone() : undefined;
  }
  async put(r: string | { url: string }, res: FakeResponse) {
    if (res.bodyUsed) throw new TypeError('body already used');
    this.store.set(keyOf(r), res.clone());
    res.bodyUsed = true;
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }));
  }
  async delete(r: string | { url: string }) {
    return this.store.delete(keyOf(r));
  }
}

class FakeCacheStorage {
  map = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.map.has(name)) this.map.set(name, new FakeCache());
    return this.map.get(name)!;
  }
  async keys() {
    return [...this.map.keys()];
  }
  async delete(name: string) {
    return this.map.delete(name);
  }
  get(name: string) {
    return this.map.get(name);
  }
}

// ── Een service worker opstarten in een zandbak ─────────────────────────────

const ORIGIN = 'https://thomasteamict.github.io';

const CONFIG: ServiceWorkerConfig = {
  version: 'v1aaaaaaaaaa',
  entry: 'assets/index-AAA.js',
  precache: ['assets/index-AAA.js', 'assets/index-CSS.css', 'manifest.webmanifest', 'icon.svg'],
  known: [
    'assets/index-AAA.js',
    'assets/index-CSS.css',
    'assets/quiz-QQQ.js',
    'assets/pdf-PPP.js',
    'icon.svg',
    'manifest.webmanifest',
    'voorbeelden/cursus.json',
    'voorbeelden/nw/h01-01.jpg',
  ],
};

const html = (entry: string, css = 'assets/index-CSS.css') =>
  `<!doctype html><html><head><script type="module" crossorigin src="./${entry}"></script>` +
  `<link rel="stylesheet" crossorigin href="./${css}"></head><body><div id="root"></div></body></html>`;

function boot(opts: { scopePath?: string; config?: ServiceWorkerConfig; caches?: FakeCacheStorage } = {}) {
  const scopePath = opts.scopePath ?? '/Boosterz/';
  const root = ORIGIN + scopePath;
  const config = opts.config ?? CONFIG;
  const caches = opts.caches ?? new FakeCacheStorage();

  // Netwerk: url → antwoord. Onbekend = 404. `offline` = elke fetch faalt.
  const net = {
    offline: false,
    routes: new Map<string, () => FakeResponse>(),
    calls: [] as { url: string; cache: string }[],
    serve(path: string, body: string, init: ResInit = {}) {
      this.routes.set(root + path, () => new FakeResponse(body, { type: 'basic', ...init }));
    },
  };
  net.serve('', html(config.entry));
  net.serve('index.html', html(config.entry));
  for (const p of config.known) net.serve(p, `inhoud van ${p}`);

  const fetch = vi.fn(async (input: string | FakeRequest, init: ReqInit = {}) => {
    const url = keyOf(input);
    const cache = init.cache ?? (typeof input === 'string' ? 'default' : input.cache);
    net.calls.push({ url, cache });
    if (net.offline) throw new TypeError('Failed to fetch');
    const route = net.routes.get(url);
    return route ? route() : new FakeResponse('niet gevonden', { status: 404, type: 'basic' });
  });

  const handlers: Record<string, (ev: unknown) => void> = {};
  const windows: { id: string }[] = [];
  const self = {
    location: { href: root + 'sw.js', origin: ORIGIN },
    addEventListener: (type: string, fn: (ev: unknown) => void) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => windows) },
  };

  const source = renderServiceWorker(TEMPLATE, config);
  const internals = new Function('self', 'caches', 'fetch', 'Request', 'Response', `${source}\n;return { routeFor, assetRefs, SHELL_CACHE, FILES_CACHE };`)(
    self,
    caches,
    fetch,
    FakeRequest,
    FakeResponse
  ) as { routeFor: (r: FakeRequest) => string | null; assetRefs: (h: string) => string[]; SHELL_CACHE: string; FILES_CACHE: string };

  async function settle(waits: Promise<unknown>[]) {
    for (let i = 0; i < waits.length; i++) await waits[i].catch(() => {});
  }

  return {
    root,
    net,
    fetch,
    caches,
    self,
    windows,
    internals,
    shell: () => caches.get(internals.SHELL_CACHE),
    files: () => caches.get(internals.FILES_CACHE),
    async install() {
      const waits: Promise<unknown>[] = [];
      handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    },
    async activate() {
      const waits: Promise<unknown>[] = [];
      handlers.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    },
    async message(data: unknown, source: { id: string } | null = null) {
      const waits: Promise<unknown>[] = [];
      handlers.message({ data, source, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    },
    async request(path: string, init: ReqInit = {}) {
      const url = /^[a-z]+:/.test(path) ? path : root + path;
      const request = new FakeRequest(url, init);
      let responded: Promise<FakeResponse> | null = null;
      const waits: Promise<unknown>[] = [];
      handlers.fetch({
        request,
        respondWith: (p: Promise<FakeResponse>) => {
          responded = Promise.resolve(p);
        },
        waitUntil: (p: Promise<unknown>) => waits.push(p),
      });
      if (!responded) return { handled: false as const };
      try {
        const response = await (responded as Promise<FakeResponse>);
        await settle(waits);
        return { handled: true as const, response, error: null };
      } catch (error) {
        await settle(waits);
        return { handled: true as const, response: null, error };
      }
    },
  };
}

async function installed(opts?: Parameters<typeof boot>[0]) {
  const sw = boot(opts);
  await sw.install();
  await sw.activate();
  sw.net.calls.length = 0;
  sw.fetch.mockClear();
  return sw;
}

// ── Installatie ─────────────────────────────────────────────────────────────

describe('installatie (voorcache)', () => {
  it('bewaart index.html, de hoofdbundel, de css, het manifest en het icoon; niets lazy', async () => {
    const sw = boot();
    await sw.install();
    expect([...sw.shell()!.store.keys()]).toEqual([sw.root + 'index.html']);
    expect([...sw.files()!.store.keys()].sort()).toEqual(
      ['assets/index-AAA.js', 'assets/index-CSS.css', 'icon.svg', 'manifest.webmanifest'].map((p) => sw.root + p)
    );
    expect(sw.net.calls.some((c) => c.url.includes('quiz') || c.url.includes('pdf') || c.url.includes('voorbeelden'))).toBe(false);
  });

  it('index.html, manifest en icoon langs de HTTP-cache heen; gehashte bestanden gewoon', async () => {
    const sw = boot();
    await sw.install();
    const mode = (p: string) => sw.net.calls.find((c) => c.url === sw.root + p)?.cache;
    expect(mode('index.html')).toBe('reload');
    expect(mode('manifest.webmanifest')).toBe('reload');
    expect(mode('icon.svg')).toBe('reload');
    expect(mode('assets/index-AAA.js')).toBe('default');
  });

  it('weigert te installeren als index.html bij een andere build hoort (CDN nog niet bij)', async () => {
    const sw = boot();
    sw.net.serve('index.html', html('assets/index-OUD.js'));
    await expect(sw.install()).rejects.toThrow(/andere build/);
    expect(sw.shell()?.store.size ?? 0).toBe(0);
  });

  it('een ontbrekend bestand laat de installatie mislukken, zonder schil', async () => {
    const sw = boot();
    sw.net.routes.delete(sw.root + 'assets/index-CSS.css');
    await expect(sw.install()).rejects.toThrow(/index-CSS\.css/);
    expect(sw.shell()?.store.size ?? 0).toBe(0);
  });

  it('offline installeren mislukt (en de browser probeert later opnieuw)', async () => {
    const sw = boot();
    sw.net.offline = true;
    await expect(sw.install()).rejects.toThrow();
  });

  it('haalt ongewijzigde gehashte bestanden van een vorige versie niet opnieuw op', async () => {
    const caches = new FakeCacheStorage();
    const v1 = boot({ caches });
    await v1.install();
    const v2 = boot({ caches, config: { ...CONFIG, version: 'v2bbbbbbbbbb' } });
    await v2.install();
    expect(v2.net.calls.map((c) => c.url)).not.toContain(v2.root + 'assets/index-AAA.js');
    expect(v2.net.calls.map((c) => c.url)).toContain(v2.root + 'index.html');
  });
});

// ── Activatie ───────────────────────────────────────────────────────────────

describe('activatie (opruimen)', () => {
  it('ruimt eigen schilcaches van vorige versies en bestanden buiten de build op; neemt pagina’s over', async () => {
    const caches = new FakeCacheStorage();
    const v1 = boot({ caches, config: { ...CONFIG, version: 'v1aaaaaaaaaa', known: [...CONFIG.known, 'assets/oud-OOO.js'] } });
    await v1.install();
    await v1.activate();
    await v1.request('assets/oud-OOO.js');
    await v1.request('voorbeelden/nw/h01-01.jpg');
    // Een item met query (bv. van een oudere versie van deze service worker).
    (await caches.open('boosterz /Boosterz/ files')).store.set(v1.root + 'voorbeelden/cursus.json?x=1', new FakeResponse('x'));
    // Andere apps op dezelfde origin (github.io!) en een submap met dezelfde prefix.
    await caches.open('boosterz /Ander/ shell zzzzzzzzzzzz');
    await caches.open('boosterz /Boosterz/test/ files');
    await caches.open('iets-anders');

    const v2 = boot({ caches, config: { ...CONFIG, version: 'v2bbbbbbbbbb' } });
    await v2.install();
    await v2.activate();

    expect((await caches.keys()).sort()).toEqual(
      ['boosterz /Ander/ shell zzzzzzzzzzzz', 'boosterz /Boosterz/ files', 'boosterz /Boosterz/ shell v2bbbbbbbbbb', 'boosterz /Boosterz/test/ files', 'iets-anders'].sort()
    );
    const files = [...v2.files()!.store.keys()];
    expect(files).not.toContain(v2.root + 'assets/oud-OOO.js');
    expect(files).not.toContain(v2.root + 'voorbeelden/cursus.json?x=1');
    expect(files).toContain(v2.root + 'voorbeelden/nw/h01-01.jpg');
    expect(files).toContain(v2.root + 'assets/index-AAA.js');
    expect(v2.self.clients.claim).toHaveBeenCalled();
  });

  it('roept nooit skipWaiting aan bij installatie of activatie', async () => {
    const sw = boot();
    await sw.install();
    await sw.activate();
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });
});

// ── Na een uitrol: al bewaarde chunks meenemen ──────────────────────────────

describe('na een uitrol: wat al bewaard was, blijft offline beschikbaar', () => {
  const v1: ServiceWorkerConfig = {
    version: 'v1aaaaaaaaaa',
    entry: 'assets/index-AAAAAAAA.js',
    precache: ['assets/index-AAAAAAAA.js'],
    known: ['assets/index-AAAAAAAA.js', 'assets/quiz-AAAAAAAA.js', 'assets/pdf-AAAAAAAA.js', 'assets/use-foo-AAAAAAAA.js'],
  };
  // Nieuwe hashes (met een streepje erin: dat mag in een Rollup-hash) en één nieuwe chunk.
  const v2: ServiceWorkerConfig = {
    version: 'v2bbbbbbbbbb',
    entry: 'assets/index-BBBBBBBB.js',
    precache: ['assets/index-BBBBBBBB.js'],
    known: ['assets/index-BBBBBBBB.js', 'assets/quiz-BBB-BBBB.js', 'assets/pdf-BBBBBBBB.js', 'assets/use-foo-BBBBBBBB.js', 'assets/nieuw-BBBBBBBB.js'],
  };
  const rel = (sw: { root: string }, urls: string[]) => urls.map((u) => u.replace(sw.root, '')).sort();

  it('haalt bij de installatie de nieuwe versie op van wat al bewaard was, en alleen dat', async () => {
    const caches = new FakeCacheStorage();
    const a = boot({ caches, config: v1 });
    await a.install();
    await a.activate();
    await a.request('assets/quiz-AAAAAAAA.js'); // de leerling opende deze oefening
    await a.request('assets/use-foo-AAAAAAAA.js');

    const b = boot({ caches, config: v2 });
    await b.install();
    const fetched = rel(b, b.net.calls.map((c) => c.url));
    expect(fetched).toContain('assets/quiz-BBB-BBBB.js');
    expect(fetched).toContain('assets/use-foo-BBBBBBBB.js');
    expect(fetched).not.toContain('assets/pdf-BBBBBBBB.js'); // nooit geopend: niet ophalen
    expect(fetched).not.toContain('assets/nieuw-BBBBBBBB.js');

    await b.activate();
    expect(rel(b, [...b.files()!.store.keys()])).toEqual(['assets/index-BBBBBBBB.js', 'assets/quiz-BBB-BBBB.js', 'assets/use-foo-BBBBBBBB.js']);
    b.net.offline = true;
    expect(await (await b.request('assets/quiz-BBB-BBBB.js')).response!.text()).toBe('inhoud van assets/quiz-BBB-BBBB.js');
  });

  it('lukt dat meenemen niet, dan slaagt de installatie toch', async () => {
    const caches = new FakeCacheStorage();
    const a = boot({ caches, config: v1 });
    await a.install();
    await a.request('assets/quiz-AAAAAAAA.js');
    const b = boot({ caches, config: v2 });
    b.net.routes.delete(b.root + 'assets/quiz-BBB-BBBB.js');
    await expect(b.install()).resolves.toBeUndefined();
    expect(b.shell()!.store.size).toBe(1);
    expect(b.files()!.store.has(b.root + 'assets/quiz-BBB-BBBB.js')).toBe(false);
  });
});

// ── Wat de service worker ongemoeid laat ────────────────────────────────────

describe('verzoeken die nooit in de cache komen', () => {
  it('andere origins: AI-API’s en Google Fonts', async () => {
    const sw = await installed();
    for (const url of [
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent',
      'https://api.openai.com/v1/chat/completions',
      'https://api.anthropic.com/v1/messages',
      'https://fonts.googleapis.com/css2?family=Outfit',
      'https://fonts.gstatic.com/s/outfit/v1/x.woff2',
    ]) {
      expect((await sw.request(url)).handled, url).toBe(false);
    }
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it('POST, HEAD en bereikverzoeken', async () => {
    const sw = await installed();
    expect((await sw.request('assets/index-AAA.js', { method: 'POST' })).handled).toBe(false);
    expect((await sw.request('', { method: 'HEAD' })).handled).toBe(false);
    expect((await sw.request('voorbeelden/film.mp4', { headers: { range: 'bytes=0-' } })).handled).toBe(false);
  });

  it('blob:, data: en paden buiten de eigen map', async () => {
    const sw = await installed();
    expect((await sw.request(`blob:${ORIGIN}/1234-5678`)).handled).toBe(false);
    expect((await sw.request('data:text/plain,hallo')).handled).toBe(false);
    expect((await sw.request(ORIGIN + '/Ander/assets/index-X.js')).handled).toBe(false);
    expect((await sw.request(ORIGIN + '/Boosterzzz/index.html', { mode: 'navigate' })).handled).toBe(false);
  });

  it('sw.js zelf', async () => {
    const sw = await installed();
    expect((await sw.request('sw.js')).handled).toBe(false);
  });

  it('only-if-cached buiten same-origin (Chrome devtools)', async () => {
    const sw = await installed();
    expect((await sw.request('assets/index-AAA.js', { cache: 'only-if-cached', mode: 'no-cors' })).handled).toBe(false);
  });
});

// ── Navigaties ──────────────────────────────────────────────────────────────

describe('navigaties: netwerk eerst', () => {
  it('online: altijd het netwerk, met revalidatie van de HTTP-cache', async () => {
    const sw = await installed();
    sw.net.serve('', html('assets/index-AAA.js') + '<!-- nieuw -->');
    const r = await sw.request('', { mode: 'navigate' });
    expect(await r.response!.text()).toContain('<!-- nieuw -->');
    expect(sw.net.calls[0]).toEqual({ url: sw.root, cache: 'no-cache' });
  });

  it('een nieuwe uitrol: de nieuwe index.html verschijnt meteen en wordt de schil zodra haar bundels bewaard zijn', async () => {
    const sw = await installed();
    sw.net.serve('', html('assets/index-NIEUW.js', 'assets/index-CSS2.css'));
    sw.net.serve('assets/index-NIEUW.js', 'nieuwe bundel');
    sw.net.serve('assets/index-CSS2.css', 'nieuwe css');
    const r = await sw.request('', { mode: 'navigate' });
    expect(await r.response!.text()).toContain('index-NIEUW.js');
    expect(await (await sw.shell()!.match(sw.root + 'index.html'))!.text()).toContain('index-NIEUW.js');
    expect(sw.files()!.store.has(sw.root + 'assets/index-NIEUW.js')).toBe(true);
    expect(sw.files()!.store.has(sw.root + 'assets/index-CSS2.css')).toBe(true);
  });

  it('valt de verbinding weg vóór de nieuwe bundels binnen zijn, dan blijft de vorige (werkende) schil staan', async () => {
    const sw = await installed();
    sw.net.serve('', html('assets/index-NIEUW.js'));
    // index-NIEUW.js bestaat (nog) niet op het netwerk → 404
    await sw.request('', { mode: 'navigate' });
    expect(await (await sw.shell()!.match(sw.root + 'index.html'))!.text()).toContain('index-AAA.js');
  });

  it('een html-pagina zonder bundels (bv. een foutpagina) wordt nooit de schil', async () => {
    const sw = await installed();
    sw.net.serve('', '<html><body>Onderhoud</body></html>');
    await sw.request('', { mode: 'navigate' });
    expect(await (await sw.shell()!.match(sw.root + 'index.html'))!.text()).toContain('index-AAA.js');
  });

  it('offline: de bewaarde schil, voor / en voor index.html', async () => {
    const sw = await installed();
    sw.net.offline = true;
    for (const path of ['', 'index.html', '?utm=x']) {
      const r = await sw.request(path, { mode: 'navigate' });
      expect(r.response!.status, path).toBe(200);
      expect(await r.response!.text(), path).toContain('index-AAA.js');
    }
  });

  it('serverfout (5xx) op de schil: de bewaarde schil; een 404 gaat gewoon door', async () => {
    const sw = await installed();
    sw.net.serve('', 'Service Unavailable', { status: 503 });
    expect(await (await sw.request('', { mode: 'navigate' })).response!.text()).toContain('index-AAA.js');
    sw.net.serve('', 'weg', { status: 404 });
    expect((await sw.request('', { mode: 'navigate' })).response!.status).toBe(404);
  });

  it('offline zonder bewaarde schil: een eigen offline-pagina, nooit de foutpagina van de browser', async () => {
    const sw = boot(); // geïnstalleerd noch geactiveerd: geen schil
    sw.net.offline = true;
    const r = await sw.request('', { mode: 'navigate' });
    expect(r.response!.status).toBe(503);
    const text = await r.response!.text();
    expect(text).toContain('Je bent offline');
    expect(text).toContain('Opnieuw proberen');
    expect(text).toContain('Je antwoorden en materiaal blijven bewaard');
  });

  it('offline navigeren naar een ander bestand: de bewaarde kopie, anders de offline-pagina', async () => {
    const sw = await installed();
    await sw.request('voorbeelden/nw/h01-01.jpg');
    sw.net.offline = true;
    expect(await (await sw.request('voorbeelden/nw/h01-01.jpg', { mode: 'navigate' })).response!.text()).toBe('inhoud van voorbeelden/nw/h01-01.jpg');
    expect((await sw.request('voorbeelden/nooit.html', { mode: 'navigate' })).response!.status).toBe(503);
  });

  it('bewaart een omgeleid antwoord nooit als schil', async () => {
    const sw = await installed();
    sw.net.serve('', html('assets/index-NIEUW.js'), { redirected: true });
    sw.net.serve('assets/index-NIEUW.js', 'nieuw');
    await sw.request('', { mode: 'navigate' });
    expect(await (await sw.shell()!.match(sw.root + 'index.html'))!.text()).toContain('index-AAA.js');
  });
});

// ── Gehashte bestanden en andere eigen bestanden ────────────────────────────

describe('assets/: cache eerst', () => {
  it('bewaard: uit de cache, zonder netwerk', async () => {
    const sw = await installed();
    const r = await sw.request('assets/index-AAA.js');
    expect(await r.response!.text()).toBe('inhoud van assets/index-AAA.js');
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it('eerste gebruik van een lazy chunk: van het netwerk, daarna bewaard (ook offline)', async () => {
    const sw = await installed();
    expect(sw.files()!.store.has(sw.root + 'assets/quiz-QQQ.js')).toBe(false);
    await sw.request('assets/quiz-QQQ.js');
    expect(sw.files()!.store.has(sw.root + 'assets/quiz-QQQ.js')).toBe(true);
    sw.net.offline = true;
    expect(await (await sw.request('assets/quiz-QQQ.js')).response!.text()).toBe('inhoud van assets/quiz-QQQ.js');
  });

  it('offline en nooit geladen: een netwerkfout (de app toont dan haar offline-melding)', async () => {
    const sw = await installed();
    sw.net.offline = true;
    const r = await sw.request('assets/pdf-PPP.js');
    expect(r.handled).toBe(true);
    expect(r.error).toBeInstanceOf(TypeError);
  });

  it('bewaart geen foutantwoorden, omleidingen of URL’s met een query', async () => {
    const sw = await installed();
    await sw.request('assets/bestaat-niet.js');
    sw.net.serve('assets/omweg-R.js', 'x', { redirected: true });
    await sw.request('assets/omweg-R.js');
    sw.net.serve('assets/quiz-QQQ.js?v=2', 'met query');
    expect(await (await sw.request('assets/quiz-QQQ.js?v=2')).response!.text()).toBe('met query');
    expect(sw.files()!.store.has(sw.root + 'assets/bestaat-niet.js')).toBe(false);
    expect(sw.files()!.store.has(sw.root + 'assets/omweg-R.js')).toBe(false);
    expect(sw.files()!.store.has(sw.root + 'assets/quiz-QQQ.js?v=2')).toBe(false);
  });
});

describe('andere eigen bestanden: netwerk eerst', () => {
  it('online: altijd de netwerkversie, en die wordt bewaard', async () => {
    const sw = await installed();
    await sw.request('voorbeelden/cursus.json');
    sw.net.serve('voorbeelden/cursus.json', 'nieuwe cursus');
    expect(await (await sw.request('voorbeelden/cursus.json')).response!.text()).toBe('nieuwe cursus');
    sw.net.offline = true;
    expect(await (await sw.request('voorbeelden/cursus.json')).response!.text()).toBe('nieuwe cursus');
  });

  it('offline en nooit geladen: een netwerkfout', async () => {
    const sw = await installed();
    sw.net.offline = true;
    expect((await sw.request('voorbeelden/nw/h01-01.jpg')).error).toBeInstanceOf(TypeError);
  });
});

// ── Berichten van de pagina ─────────────────────────────────────────────────

describe("bericht 'boosterz:cache-urls' (eerste bezoek)", () => {
  it('bewaart alleen eigen bestanden van deze build', async () => {
    const sw = await installed();
    await sw.message({
      type: 'boosterz:cache-urls',
      urls: [
        sw.root + 'assets/quiz-QQQ.js',
        sw.root + 'assets/onbekend-X.js',
        sw.root + 'voorbeelden/nw/h01-01.jpg',
        sw.root + 'basis/go/onbekend.json',
        sw.root + 'voorbeelden/nw/h01-01.jpg?v=2',
        sw.root + 'index.html',
        sw.root + 'sw.js',
        ORIGIN + '/Ander/assets/quiz-QQQ.js',
        ORIGIN + '/Ander/voorbeelden/nw/h01-01.jpg',
        'https://api.openai.com/v1/x',
        42,
      ],
    });
    expect(sw.net.calls.map((c) => c.url)).toEqual([sw.root + 'assets/quiz-QQQ.js', sw.root + 'voorbeelden/nw/h01-01.jpg']);
    expect(sw.files()!.store.has(sw.root + 'assets/quiz-QQQ.js')).toBe(true);
    expect(sw.files()!.store.has(sw.root + 'voorbeelden/nw/h01-01.jpg')).toBe(true);
    expect(sw.files()!.store.has(sw.root + 'basis/go/onbekend.json')).toBe(false);
  });

  it('een gegevensbestand dat bij het eerste bezoek al geladen was, werkt daarna offline', async () => {
    const sw = await installed();
    await sw.message({ type: 'boosterz:cache-urls', urls: [sw.root + 'voorbeelden/nw/h01-01.jpg'] });
    sw.net.offline = true;
    expect(await (await sw.request('voorbeelden/nw/h01-01.jpg')).response!.text()).toBe('inhoud van voorbeelden/nw/h01-01.jpg');
  });

  it('vreemde berichten doen niets', async () => {
    const sw = await installed();
    await sw.message(null);
    await sw.message('boosterz:cache-urls');
    await sw.message({ type: 'boosterz:cache-urls', urls: 'geen lijst' });
    expect(sw.fetch).not.toHaveBeenCalled();
  });
});

describe("bericht 'boosterz:activate' (update overnemen)", () => {
  const entry = ORIGIN + '/Boosterz/assets/index-AAA.js';

  it('neemt over als de vrager het enige venster is en al deze build draait', async () => {
    const sw = boot();
    await sw.install();
    sw.windows.push({ id: 'tab1' });
    await sw.message({ type: 'boosterz:activate', entry }, { id: 'tab1' });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('wacht als er nog een ander venster open is (bv. een leerling midden in een toets)', async () => {
    const sw = boot();
    await sw.install();
    sw.windows.push({ id: 'tab1' }, { id: 'toets' });
    await sw.message({ type: 'boosterz:activate', entry }, { id: 'tab1' });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('wacht als de vrager nog een oudere build draait', async () => {
    const sw = boot();
    await sw.install();
    sw.windows.push({ id: 'tab1' });
    await sw.message({ type: 'boosterz:activate', entry: ORIGIN + '/Boosterz/assets/index-OUD.js' }, { id: 'tab1' });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('wacht zonder afzender of als het enige venster een ander is', async () => {
    const sw = boot();
    await sw.install();
    sw.windows.push({ id: 'ander' });
    await sw.message({ type: 'boosterz:activate', entry }, null);
    await sw.message({ type: 'boosterz:activate', entry }, { id: 'tab1' });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });
});

// ── Lokale preview op / ─────────────────────────────────────────────────────

describe('scope op / (lokale preview)', () => {
  it('werkt ook wanneer de app in de wortel staat', async () => {
    const sw = await installed({ scopePath: '/' });
    expect(sw.internals.SHELL_CACHE).toBe('boosterz / shell v1aaaaaaaaaa');
    expect((await sw.request('assets/index-AAA.js')).response).toBeTruthy();
    sw.net.offline = true;
    expect(await (await sw.request('', { mode: 'navigate' })).response!.text()).toContain('index-AAA.js');
    expect((await sw.request('https://api.anthropic.com/v1/messages')).handled).toBe(false);
  });
});

describe('sjabloon en build lezen index.html op dezelfde manier', () => {
  it('assetRefs is gelijk', async () => {
    const sw = boot();
    const samples = [
      html('assets/index-AAA.js'),
      '<link rel="modulepreload" href="./assets/v-1.js"><script src=\'assets/x-2.js\'></script><img src="voorbeelden/a.jpg">',
      '<p>niets</p>',
    ];
    for (const s of samples) expect(sw.internals.assetRefs(s)).toEqual(buildAssetRefs(s));
  });
});
