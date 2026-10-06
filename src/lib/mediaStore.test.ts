import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectMediaRefs, configureMediaStore, countUnresolvedMedia, dataUrlToBlob, findLargeDataUrls, inlineMedia,
  mediaKeysInStorage, mediaSizeForUrl, mediaStats, MEDIA_REF_PREFIX, migrateDataUrls, parseWithMedia,
  preloadMedia, pruneOrphanMedia, replaceMedia, resolveMediaRef, storeMedia, stringifyWithMedia,
  type MediaBackend,
} from './mediaStore';
import type { FileRecord } from './idb';

// ── Testomgeving: geheugen-IndexedDB, nep-localStorage, nep-blob-URL's ──────

function memoryBackend(seed: FileRecord[] = []) {
  const map = new Map<string, FileRecord>(seed.map((r) => [r.id, r]));
  const backend: MediaBackend = {
    getAll: async () => [...map.values()],
    get: async (id) => map.get(id),
    put: async (rec) => { map.set(rec.id, rec); },
    delete: async (id) => { map.delete(id); },
    clear: async () => { map.clear(); },
  };
  return { backend, map };
}

function memoryStorage(init: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(init));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage;
}

let urlCounter = 0;
const urlToBlob = new Map<string, Blob>();
function setup(opts: { records?: FileRecord[]; storage?: Record<string, string>; backend?: MediaBackend } = {}) {
  const mem = memoryBackend(opts.records);
  const backend = opts.backend ?? mem.backend;
  const map = mem.map;
  const storage = memoryStorage(opts.storage);
  urlToBlob.clear();
  configureMediaStore({
    backend,
    storage: () => storage,
    preloadTimeoutMs: 4000,
    createObjectUrl: (blob) => {
      const url = `blob:test/${++urlCounter}`;
      urlToBlob.set(url, blob);
      return url;
    },
    revokeObjectUrl: () => {},
  });
  return { backend, map, storage };
}

/** Een base64-data-URL van precies `bytes` bytes (png-mimetype, inhoud willekeurig maar deterministisch). */
function fakeDataUrl(bytes: number, seed = 1): string {
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) arr[i] = (i * 31 + seed * 7) & 0xff;
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(bin)}`;
}

async function blobText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

beforeEach(() => {
  setup();
});

// ── Data-URL's ──────────────────────────────────────────────────────────────

describe('dataUrlToBlob', () => {
  it('decodeert een base64-data-URL naar een blob met het juiste mimetype', async () => {
    const blob = dataUrlToBlob('data:text/plain;base64,' + btoa('hallo'));
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('text/plain');
    expect(await blobText(blob!)).toBe('hallo');
  });

  it('weigert een data-URL zonder base64 en gewone URL\'s', () => {
    expect(dataUrlToBlob('data:image/svg+xml;utf8,<svg/>')).toBeNull();
    expect(dataUrlToBlob('https://example.org/foto.png')).toBeNull();
  });
});

describe('findLargeDataUrls', () => {
  it('vindt alleen hele JSON-stringwaarden die een grote data-URL zijn', () => {
    const big = fakeDataUrl(3000);
    const small = fakeDataUrl(100);
    const raw = JSON.stringify({ a: big, b: small, c: `zie ${big}`, d: [big] });
    expect(findLargeDataUrls(raw)).toEqual([big]);
  });

  it('geeft niets terug zonder base64 in de tekst', () => {
    expect(findLargeDataUrls('{"a":"blob:x"}')).toEqual([]);
  });
});

// ── Bewaren, lezen, schrijven ───────────────────────────────────────────────

describe('storeMedia + reviver/replacer', () => {
  it('geeft dezelfde URL voor dezelfde inhoud (inhoudsgebaseerd id) en bewaart één record', async () => {
    const { map } = setup();
    const a = await storeMedia(new Blob(['abc'], { type: 'text/plain' }), 'a.txt');
    const b = await storeMedia(new Blob(['abc'], { type: 'text/plain' }), 'b.txt');
    expect(a).toBe(b);
    expect(map.size).toBe(1);
    expect([...map.keys()][0]).toMatch(/^m_[0-9a-f]{32}$/);
  });

  it('schrijft blob:-URL\'s als verwijzing weg en leest ze weer als blob:-URL', async () => {
    setup();
    const url = await storeMedia(new Blob(['png']));
    const json = stringifyWithMedia({ title: 'x', config: { imageUrl: url, items: [{ img: url }] } });
    expect(json).not.toContain('blob:');
    const refs = collectMediaRefs(json);
    expect(refs.size).toBe(1);
    const back = parseWithMedia<{ config: { imageUrl: string; items: { img: string }[] } }>(json);
    expect(back.config.imageUrl).toBe(url);
    expect(back.config.items[0].img).toBe(url);
  });

  it('laat onbekende blob:-URL\'s en gewone strings met rust', () => {
    expect(replaceMedia('', 'blob:onbekend')).toBe('blob:onbekend');
    expect(replaceMedia('', 'https://x/y.png')).toBe('https://x/y.png');
    expect(replaceMedia('', 42)).toBe(42);
  });

  it('geeft een onbekende verwijzing ongewijzigd terug (nooit een placeholder die bewaard zou worden)', async () => {
    setup();
    await preloadMedia();
    const ref = MEDIA_REF_PREFIX + 'm_bestaatniet';
    expect(resolveMediaRef(ref)).toBe(ref);
    // en dat blijft zo na de achtergrondpoging
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaRef(ref)).toBe(ref);
  });

  it('laadt een verwijzing die pas later in de achterkant verschijnt bij (ander tabblad)', async () => {
    const { map } = setup();
    await preloadMedia();
    const rec: FileRecord = { id: 'm_later', name: '', blob: new Blob(['x']), size: 1, createdAt: Date.now() };
    map.set(rec.id, rec);
    const ref = MEDIA_REF_PREFIX + 'm_later';
    expect(resolveMediaRef(ref)).toBe(ref); // nog niet in het geheugen: achtergrondlading gestart
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaRef(ref)).toMatch(/^blob:/);
  });

  it('preload brengt bestaande records in het geheugen', async () => {
    setup({ records: [{ id: 'm_1', name: 'a', blob: new Blob(['aaaa']), size: 4, createdAt: 1 }] });
    await preloadMedia();
    expect(resolveMediaRef(MEDIA_REF_PREFIX + 'm_1')).toMatch(/^blob:/);
    expect(mediaStats()).toEqual({ count: 1, bytes: 4 });
  });
});

// ── Inline voor delen ───────────────────────────────────────────────────────

describe('inlineMedia', () => {
  it('maakt van blob:-URL\'s en verwijzingen weer data-URL\'s, in een diepe kopie', async () => {
    setup();
    const url = await storeMedia(new Blob(['hallo'], { type: 'text/plain' }));
    const ref = stringifyWithMedia(url).slice(1, -1);
    const src = { a: url, b: { c: [ref, 'tekst'] }, n: 3 };
    const out = await inlineMedia(src);
    expect(out).not.toBe(src);
    expect(out.a).toBe('data:text/plain;base64,' + btoa('hallo'));
    expect(out.b.c[0]).toBe(out.a);
    expect(out.b.c[1]).toBe('tekst');
    expect(out.n).toBe(3);
    expect(src.a).toBe(url); // origineel onaangeroerd
  });

  it('laat een verwijzing zonder blob ongewijzigd', async () => {
    setup();
    await preloadMedia();
    const out = await inlineMedia({ x: MEDIA_REF_PREFIX + 'm_weg' });
    expect(out.x).toBe(MEDIA_REF_PREFIX + 'm_weg');
  });
});

// ── Migratie van bestaande opslag ───────────────────────────────────────────

describe('migrateDataUrls', () => {
  it('verhuist grote data-URL\'s naar de achterkant en laat kleine staan', async () => {
    const big = fakeDataUrl(4000);
    const small = fakeDataUrl(64);
    const widgets = [{ id: 'w1', config: { imageUrl: big, icon: small, pairs: [{ img: big }] } }];
    const { map, storage } = setup({ storage: { 'wf.widgets.v1': JSON.stringify(widgets) } });
    const moved = await migrateDataUrls(['wf.widgets.v1']);
    expect(moved).toBe(1); // één unieke data-URL, op twee plaatsen
    expect(map.size).toBe(1);
    const raw = storage.getItem('wf.widgets.v1')!;
    expect(raw).not.toContain(big);
    expect(raw).toContain(small);
    expect(collectMediaRefs(raw).size).toBe(1);
    // en na het lezen staat er weer iets bruikbaars
    const back = parseWithMedia<typeof widgets>(raw);
    expect(back[0].config.imageUrl).toMatch(/^blob:/);
    expect(back[0].config.pairs[0].img).toBe(back[0].config.imageUrl);
    // de bytes kloppen
    const blob = [...map.values()][0].blob;
    const original = dataUrlToBlob(big)!;
    expect(await blob.arrayBuffer()).toEqual(await original.arrayBuffer());
  });

  it('overschrijft geen tussentijdse wijziging: vervangt exact de strings in de verse inhoud', async () => {
    const big = fakeDataUrl(4000);
    setup();
    // Eigen opslag met een haakje: tussen de eerste lezing en het terugschrijven
    // komt een autosave binnen die een nieuwe titel wegschrijft (en de data-URL
    // nog even houdt). Die titel mag de migratie niet overschrijven.
    let injected = false;
    const data = new Map<string, string>([['wf.widgets.v1', JSON.stringify([{ id: 'w1', title: 'oud', img: big }])]]);
    const hooked = {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => {
        const v = data.get(k) ?? null;
        if (!injected && v) {
          injected = true;
          // tussen de eerste lezing en het terugschrijven komt een autosave binnen
          data.set(k, JSON.stringify([{ id: 'w1', title: 'nieuw', img: big }]));
        }
        return v;
      },
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
      clear: () => data.clear(),
    } as Storage;
    configureMediaStore({ storage: () => hooked });
    await migrateDataUrls(['wf.widgets.v1']);
    const raw = data.get('wf.widgets.v1')!;
    expect(raw).toContain('"nieuw"');
    expect(raw).not.toContain(big);
  });

  it('de replacer kent een verhuisde data-URL, zodat een editor met de oude waarde in het geheugen geen ping-pong veroorzaakt', async () => {
    const big = fakeDataUrl(4000);
    setup({ storage: { 'wf.widgets.v1': JSON.stringify([{ img: big }]) } });
    await migrateDataUrls(['wf.widgets.v1']);
    const json = stringifyWithMedia({ img: big });
    expect(json).not.toContain(big);
    expect(collectMediaRefs(json).size).toBe(1);
  });
});

// ── Wezen opruimen ──────────────────────────────────────────────────────────

describe('pruneOrphanMedia', () => {
  it('verwijdert oude blobs zonder verwijzing, maar nooit jonge of gebruikte', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    const { map } = setup({
      records: [
        { id: 'm_used', name: '', blob: new Blob(['a']), size: 1, createdAt: old },
        { id: 'm_orphan', name: '', blob: new Blob(['b']), size: 1, createdAt: old },
        { id: 'm_fresh', name: '', blob: new Blob(['c']), size: 1, createdAt: Date.now() },
      ],
      storage: {
        'wf.widgets.v1': JSON.stringify([{ img: MEDIA_REF_PREFIX + 'm_used' }]),
        'wf.autosave.x.y': JSON.stringify({ answers: {} }),
      },
    });
    const removed = await pruneOrphanMedia();
    expect(removed).toBe(1);
    expect([...map.keys()].sort()).toEqual(['m_fresh', 'm_used']);
  });

  it('wist geen oude wees die net opnieuw gekozen is (zelfde inhoud, nog niet bewaard)', async () => {
    const blob = new Blob(['zelfde-afbeelding'], { type: 'image/png' });
    const eerst = setup();
    await storeMedia(blob);
    const [rec] = [...eerst.map.values()];
    // Later: hetzelfde record staat als oude wees in de achterkant.
    const { map } = setup({ records: [{ ...rec, createdAt: Date.now() - 60 * 60 * 1000 }] });
    await preloadMedia();
    await storeMedia(blob); // de leerkracht kiest dezelfde afbeelding opnieuw
    expect(await pruneOrphanMedia()).toBe(0);
    expect(map.has(rec.id)).toBe(true);
  });

  it('beperkt zich tot `only` (na het verwijderen van één widget)', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    const { map } = setup({
      records: [
        { id: 'm_a', name: '', blob: new Blob(['a']), size: 1, createdAt: old },
        { id: 'm_b', name: '', blob: new Blob(['b']), size: 1, createdAt: old },
      ],
      storage: {},
    });
    expect(await pruneOrphanMedia({ only: ['m_a'] })).toBe(1);
    expect([...map.keys()]).toEqual(['m_b']);
  });

  it('gooit niets weg als de sjablonen of cursussen er nog naar verwijzen', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    const { map } = setup({
      records: [{ id: 'm_t', name: '', blob: new Blob(['t']), size: 1, createdAt: old }],
      storage: { 'wf.customtemplates.v1': JSON.stringify([{ widget: { config: { img: MEDIA_REF_PREFIX + 'm_t' } } }]) },
    });
    expect(await pruneOrphanMedia()).toBe(0);
    expect(map.size).toBe(1);
  });
});

// ── Robuustheid ─────────────────────────────────────────────────────────────

describe('preloadMedia', () => {
  it('geeft het op na de tijdslimiet als IndexedDB nooit antwoordt, en lost daarna per verwijzing op', async () => {
    const hang = new Promise<FileRecord[]>(() => {});
    const later: FileRecord = { id: 'm_late', name: '', blob: new Blob(['l']), size: 1, createdAt: 1 };
    const { backend } = memoryBackend([later]);
    setup({ backend: { ...backend, getAll: () => hang } });
    configureMediaStore({ preloadTimeoutMs: 20 });
    const t0 = Date.now();
    await preloadMedia();
    expect(Date.now() - t0).toBeLessThan(1000);
    // de migratie wacht op preload en mag dus niet blijven hangen
    await expect(migrateDataUrls(['wf.widgets.v1'])).resolves.toBe(0);
    // en losse verwijzingen worden alsnog per stuk opgehaald
    const ref = MEDIA_REF_PREFIX + 'm_late';
    expect(resolveMediaRef(ref)).toBe(ref);
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaRef(ref)).toMatch(/^blob:/);
  });

  it('maakt geen object-URL voor media die nooit getoond wordt', async () => {
    setup({ records: [{ id: 'm_1', name: '', blob: new Blob(['a']), size: 1, createdAt: 1 }] });
    const before = urlCounter;
    await preloadMedia();
    expect(urlCounter).toBe(before);
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_1');
    expect(urlCounter).toBe(before + 1);
  });
});

describe('na het opruimen van een blob', () => {
  it('schrijft een editor die de blob:-URL nog vasthoudt tóch een verwijzing weg, nooit een dode blob:-string', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    setup({ records: [{ id: 'm_x', name: '', blob: new Blob(['x']), size: 1, createdAt: old }], storage: {} });
    await preloadMedia();
    const url = resolveMediaRef(MEDIA_REF_PREFIX + 'm_x');
    expect(await pruneOrphanMedia()).toBe(1);
    expect(replaceMedia('', url)).toBe(MEDIA_REF_PREFIX + 'm_x');
  });
});

describe('hulpfuncties', () => {
  it('mediaKeysInStorage neemt de autosave-sleutels mee', () => {
    setup({ storage: { 'wf.autosave.w1.jan': '{}', 'wf.prefs.v1': '{}' } });
    const keys = mediaKeysInStorage();
    expect(keys).toContain('wf.widgets.v1');
    expect(keys).toContain('wf.autosave.w1.jan');
    expect(keys).not.toContain('wf.prefs.v1');
  });

  it('countUnresolvedMedia telt open verwijzingen en onbekende blob:-URL\'s', () => {
    expect(countUnresolvedMedia({ a: MEDIA_REF_PREFIX + 'm_1', b: ['blob:x', 'data:image/png;base64,AA'], c: 'tekst wfmedia: in prosa' })).toBe(2);
  });

  it('mediaSizeForUrl kent de grootte van een bewaarde blob', async () => {
    setup();
    const url = await storeMedia(new Blob(['12345']));
    expect(mediaSizeForUrl(url)).toBe(5);
    expect(mediaSizeForUrl('blob:onbekend')).toBeNull();
  });
});

// ── Veiligheid: nooit een blob:-URL met een actief type (V7) ───────────────

function b64(text: string): string {
  return btoa(text);
}
/** Svg met een onload-script, groot genoeg om normaal verhuisd te worden. */
const KWAADAARDIGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss=1"><rect width="9" height="9"/><!--' + 'x'.repeat(3000) + '--></svg>';
const KWAADAARDIGE_HTML = '<html><body><script>window.__xss=1</script><!--' + 'x'.repeat(3000) + '--></body></html>';

describe('veilige blob:-URL\'s', () => {
  it('maakt van een bewaard html-record een blob:-URL met type application/octet-stream (bytes ongewijzigd)', async () => {
    setup({ records: [{ id: 'm_html', name: '', blob: new Blob([KWAADAARDIGE_HTML], { type: 'text/html' }), size: 1, createdAt: 1 }] });
    await preloadMedia();
    const url = resolveMediaRef(MEDIA_REF_PREFIX + 'm_html');
    expect(url).toMatch(/^blob:/);
    const blob = urlToBlob.get(url)!;
    expect(blob.type).toBe('application/octet-stream');
    expect(await blobText(blob)).toBe(KWAADAARDIGE_HTML);
  });

  it('houdt een passief type, maar zonder parameters (een komma kan een tweede type smokkelen)', async () => {
    setup({
      records: [
        { id: 'm_png', name: '', blob: new Blob(['p'], { type: 'image/png' }), size: 1, createdAt: 1 },
        { id: 'm_list', name: '', blob: new Blob(['q'], { type: 'image/png;x=1,text/html' }), size: 1, createdAt: 1 },
        { id: 'm_leeg', name: '', blob: new Blob(['r']), size: 1, createdAt: 1 },
        { id: 'm_xhtml', name: '', blob: new Blob(['s'], { type: 'application/xhtml+xml' }), size: 1, createdAt: 1 },
      ],
    });
    await preloadMedia();
    const type = (id: string) => urlToBlob.get(resolveMediaRef(MEDIA_REF_PREFIX + id))!.type;
    expect(type('m_png')).toBe('image/png');
    expect(type('m_list')).toBe('image/png');
    expect(type('m_leeg')).toBe('application/octet-stream');
    expect(type('m_xhtml')).toBe('application/octet-stream');
  });

  it('ook een record dat pas later (ander tabblad) binnenkomt krijgt een veilig type', async () => {
    const { map } = setup();
    await preloadMedia();
    map.set('m_laat', { id: 'm_laat', name: '', blob: new Blob(['<b>x</b>'], { type: 'text/html' }), size: 8, createdAt: 1 });
    const ref = MEDIA_REF_PREFIX + 'm_laat';
    expect(resolveMediaRef(ref)).toBe(ref);
    await new Promise((r) => setTimeout(r, 0));
    expect(urlToBlob.get(resolveMediaRef(ref))!.type).toBe('application/octet-stream');
  });

  it('storeMedia bewaart een html-bestand als application/octet-stream', async () => {
    const { map } = setup();
    const url = await storeMedia(new Blob([KWAADAARDIGE_HTML], { type: 'text/html' }), 'werkblad.html');
    expect(urlToBlob.get(url)!.type).toBe('application/octet-stream');
    expect([...map.values()][0].blob.type).toBe('application/octet-stream');
    expect(await blobText([...map.values()][0].blob)).toBe(KWAADAARDIGE_HTML);
  });

  it('dataUrlToBlob: passief blijft, svg blijft svg, al de rest wordt application/octet-stream', () => {
    expect(dataUrlToBlob('data:image/png;base64,' + b64('p'))!.type).toBe('image/png');
    expect(dataUrlToBlob('data:IMAGE/PNG;base64,' + b64('p'))!.type).toBe('image/png');
    expect(dataUrlToBlob('data:image/svg+xml;base64,' + b64('<svg/>'))!.type).toBe('image/svg+xml');
    expect(dataUrlToBlob('data:text/html;base64,' + b64('<b>'))!.type).toBe('application/octet-stream');
    expect(dataUrlToBlob('data:application/xhtml+xml;charset=utf-8;base64,' + b64('<b>'))!.type).toBe('application/octet-stream');
  });
});

describe('svg blijft een data:-URL (V7)', () => {
  const svgDataUrl = 'data:image/svg+xml;base64,' + b64(KWAADAARDIGE_SVG);

  it('storeMedia bewaart svg niet en geeft een data:-URL terug', async () => {
    const { map } = setup();
    const before = urlCounter;
    const url = await storeMedia(new Blob([KWAADAARDIGE_SVG], { type: 'image/svg+xml' }), 'tekening.svg');
    expect(url).toBe(svgDataUrl);
    expect(map.size).toBe(0);
    expect(urlCounter).toBe(before);
  });

  it('de migratie laat svg-data-URL\'s staan en verhuist html als application/octet-stream', async () => {
    const htmlDataUrl = 'data:text/html;base64,' + b64(KWAADAARDIGE_HTML);
    expect(findLargeDataUrls(JSON.stringify({ a: svgDataUrl, b: htmlDataUrl }))).toEqual([htmlDataUrl]);
    const { map, storage } = setup({ storage: { 'wf.courses.v1': JSON.stringify([{ img: svgDataUrl, bijlage: htmlDataUrl }]) } });
    expect(await migrateDataUrls(['wf.courses.v1'])).toBe(1);
    const raw = storage.getItem('wf.courses.v1')!;
    expect(raw).toContain(svgDataUrl);
    expect(raw).not.toContain(htmlDataUrl);
    expect(map.size).toBe(1);
    expect([...map.values()][0].blob.type).toBe('application/octet-stream');
    const back = parseWithMedia<{ img: string; bijlage: string }[]>(raw);
    expect(back[0].img).toBe(svgDataUrl);
    expect(urlToBlob.get(back[0].bijlage)!.type).toBe('application/octet-stream');
  });

  it('een al bewaard svg-record wordt een data:-URL (geen blob:), en bewaren schrijft weer de verwijzing', async () => {
    setup({ records: [{ id: 'm_svg', name: '', blob: new Blob([KWAADAARDIGE_SVG], { type: 'image/svg+xml' }), size: 9, createdAt: 1 }] });
    const before = urlCounter;
    await preloadMedia();
    const ref = MEDIA_REF_PREFIX + 'm_svg';
    const url = resolveMediaRef(ref);
    expect(url).toBe(svgDataUrl);
    expect(urlCounter).toBe(before); // geen object-URL gemaakt
    expect(stringifyWithMedia({ img: url })).toBe(JSON.stringify({ img: ref }));
    expect(parseWithMedia<{ img: string }>(JSON.stringify({ img: ref })).img).toBe(svgDataUrl);
    // delen: de svg gaat als data-URL mee
    expect((await inlineMedia({ img: ref })).img).toBe(svgDataUrl);
  });

  it('ook een kleine svg en een svg met parameters in het type', async () => {
    const klein = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    setup({ records: [{ id: 'm_k', name: '', blob: new Blob([klein], { type: 'image/svg+xml;charset=utf-8' }), size: 1, createdAt: 1 }] });
    await preloadMedia();
    const url = resolveMediaRef(MEDIA_REF_PREFIX + 'm_k');
    expect(url).toBe('data:image/svg+xml;base64,' + b64(klein));
    expect(replaceMedia('', url)).toBe(MEDIA_REF_PREFIX + 'm_k');
  });

  it('een svg-record dat pas later binnenkomt wordt ook een data:-URL', async () => {
    const { map } = setup();
    await preloadMedia();
    map.set('m_svg2', { id: 'm_svg2', name: '', blob: new Blob([KWAADAARDIGE_SVG], { type: 'image/svg+xml' }), size: 1, createdAt: 1 });
    const ref = MEDIA_REF_PREFIX + 'm_svg2';
    expect(resolveMediaRef(ref)).toBe(ref);
    await new Promise((r) => setTimeout(r, 20));
    expect(resolveMediaRef(ref)).toBe(svgDataUrl);
  });

  it('na het opruimen van een svg-record blijft de data-URL zelf bewaard (geen dode verwijzing)', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    setup({ records: [{ id: 'm_weg', name: '', blob: new Blob([KWAADAARDIGE_SVG], { type: 'image/svg+xml' }), size: 1, createdAt: old }], storage: {} });
    await preloadMedia();
    const url = resolveMediaRef(MEDIA_REF_PREFIX + 'm_weg');
    expect(url).toBe(svgDataUrl);
    expect(await pruneOrphanMedia()).toBe(1);
    expect(replaceMedia('', url)).toBe(url);
  });
});

// ── Andere tabbladen: niets wissen wat elders nog op het scherm staat (P1) ──
//
// Twee tabbladen = twee instanties van deze module (vi.resetModules), met
// dezelfde IndexedDB (geheugen-backend), dezelfde localStorage en één
// nagebootste LockManager voor de hele origin, zoals in de browser.

interface NepSlot { name: string; mode: LockMode; tab: string }

/** Nagebootste navigator.locks: gedeelde sloten worden meteen toegekend. */
function nepLocks() {
  const held: NepSlot[] = [];
  const pending: NepSlot[] = [];
  let tab = 'A';
  const locks = {
    request: vi.fn((name: string, opts: LockOptions, cb: LockGrantedCallback<unknown>): Promise<unknown> => {
      const mode = opts.mode ?? 'exclusive';
      held.push({ name, mode, tab });
      return Promise.resolve().then(() => cb({ name, mode } as Lock));
    }),
    query: vi.fn(async (): Promise<LockManagerSnapshot> => ({
      held: held.map(({ name, mode }) => ({ name, mode, clientId: 'c' })),
      pending: pending.map(({ name, mode }) => ({ name, mode, clientId: 'c' })),
    })),
  };
  return {
    locks,
    held,
    pending,
    /** Wat hierna gevraagd wordt, komt uit dit tabblad. */
    vanuit(t: string) { tab = t; },
    /** Tabblad sluiten: de browser geeft zijn sloten vrij. */
    sluit(t: string) { for (let i = held.length - 1; i >= 0; i--) if (held[i].tab === t) held.splice(i, 1); },
    sloten: () => held.filter((l) => l.name.startsWith('wf-media-tabblad:')),
  };
}

const OUD = () => Date.now() - 60 * 60 * 1000;
const rec = (id: string, createdAt = OUD()): FileRecord => ({ id, name: '', blob: new Blob([id]), size: 1, createdAt });

/** Een tweede tabblad: verse module, zelfde opslag. */
async function tweedeTabblad(backend: MediaBackend, storage: Storage) {
  vi.resetModules();
  const mod = await import('./mediaStore');
  mod.configureMediaStore({ backend, storage: () => storage, createObjectUrl: () => `blob:b/${++urlCounter}`, revokeObjectUrl: () => {} });
  return mod;
}

describe('pruneOrphanMedia en andere tabbladen (Web Locks)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Tabblad A met een gebruikte en een verweesde (oude) blob. */
  function tweeBlobs() {
    const env = setup({
      records: [rec('m_used'), rec('m_wees')],
      storage: { 'wf.widgets.v1': JSON.stringify([{ img: MEDIA_REF_PREFIX + 'm_used' }]) },
    });
    const del = vi.spyOn(env.backend, 'delete');
    return { ...env, del };
  }

  it('een ander tabblad toont media: een oude wees blijft staan en er wordt niets gewist', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map, del } = tweeBlobs();
    // tabblad B toont een afbeelding (en neemt zo het slot)
    nep.vanuit('B');
    const B = await tweedeTabblad(backend, storage);
    await B.preloadMedia();
    expect(B.resolveMediaRef(MEDIA_REF_PREFIX + 'm_used')).toMatch(/^blob:/);
    // tabblad A toont ook iets en start de opruimronde
    nep.vanuit('A');
    await preloadMedia();
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_used');
    expect(nep.sloten()).toHaveLength(2);
    expect(await pruneOrphanMedia()).toBe(0);
    expect(del).not.toHaveBeenCalled();
    expect([...map.keys()].sort()).toEqual(['m_used', 'm_wees']);
  });

  it('ook een vers tabblad zonder eigen slot (opstart van "Als leerling") wist niets', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map, del } = tweeBlobs();
    nep.vanuit('B');
    const B = await tweedeTabblad(backend, storage);
    await B.storeMedia(new Blob(['nieuw, nog niet bewaard'], { type: 'image/png' }));
    nep.vanuit('A');
    expect(await pruneOrphanMedia()).toBe(0);
    expect(del).not.toHaveBeenCalled();
    expect(map.has('m_wees')).toBe(true);
  });

  it('na het verwijderen van een widget (only) blijft de blob staan zolang een ander tabblad media toont', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map, del } = tweeBlobs();
    nep.vanuit('B');
    const B = await tweedeTabblad(backend, storage);
    await B.preloadMedia();
    B.resolveMediaRef(MEDIA_REF_PREFIX + 'm_wees'); // de editor in B toont de afbeelding van de verwijderde widget
    nep.vanuit('A');
    expect(await pruneOrphanMedia({ only: ['m_wees'] })).toBe(0);
    expect(del).not.toHaveBeenCalled();
    expect(map.has('m_wees')).toBe(true);
  });

  it('alleen het eigen slot: de oude wees wordt gewist', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { map } = tweeBlobs();
    await preloadMedia();
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_used');
    await storeMedia(new Blob(['nog iets'], { type: 'image/png' }));
    expect(nep.sloten()).toHaveLength(1); // één keer per tabblad
    expect(await pruneOrphanMedia()).toBe(1);
    expect(map.has('m_wees')).toBe(false);
    expect(map.has('m_used')).toBe(true);
  });

  it('is het andere tabblad gesloten, dan ruimt de volgende ronde de wees alsnog op (geen blijvend lek)', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map } = tweeBlobs();
    nep.vanuit('B');
    const B = await tweedeTabblad(backend, storage);
    await B.preloadMedia();
    B.resolveMediaRef(MEDIA_REF_PREFIX + 'm_used');
    nep.vanuit('A');
    expect(await pruneOrphanMedia()).toBe(0);
    nep.sluit('B');
    expect(await pruneOrphanMedia()).toBe(1);
    expect(map.has('m_wees')).toBe(false);
  });

  it('minAgeMs: 0 (leerlinggegevens wissen) wist ook als een ander tabblad media toont', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map, del } = tweeBlobs();
    nep.vanuit('B');
    const B = await tweedeTabblad(backend, storage);
    await B.preloadMedia();
    B.resolveMediaRef(MEDIA_REF_PREFIX + 'm_used');
    nep.vanuit('A');
    expect(await pruneOrphanMedia({ only: ['m_wees', 'm_used'], minAgeMs: 0 })).toBe(1);
    expect(del).toHaveBeenCalledWith('m_wees');
    expect(map.has('m_wees')).toBe(false);
    expect(map.has('m_used')).toBe(true); // wat nog gebruikt wordt, blijft
    expect(nep.locks.query).not.toHaveBeenCalled();
  });

  it('zonder Web Locks: het oude gedrag (de leeftijdsgrens alleen)', async () => {
    vi.stubGlobal('navigator', {});
    const { map } = tweeBlobs();
    await preloadMedia();
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_used');
    expect(await pruneOrphanMedia()).toBe(1);
    expect(map.has('m_wees')).toBe(false);
  });

  it('zonder navigator (geen browser): het oude gedrag', async () => {
    vi.stubGlobal('navigator', undefined);
    const { map } = tweeBlobs();
    await storeMedia(new Blob(['x'], { type: 'image/png' }));
    expect(await pruneOrphanMedia()).toBe(1);
    expect(map.has('m_wees')).toBe(false);
  });

  it('een ander tabblad dat nog wacht op het slot telt ook mee', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { del } = tweeBlobs();
    nep.pending.push({ name: 'wf-media-tabblad:ander', mode: 'shared', tab: 'B' });
    expect(await pruneOrphanMedia()).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it('sloten met een andere naam tellen niet mee', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { map } = tweeBlobs();
    nep.held.push({ name: 'iets-anders', mode: 'exclusive', tab: 'B' });
    expect(await pruneOrphanMedia()).toBe(1);
    expect(map.has('m_wees')).toBe(false);
  });

  it('lukt query() niet, dan wordt er niets gewist (bij twijfel)', async () => {
    const nep = nepLocks();
    nep.locks.query.mockRejectedValue(new Error('kapot'));
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { del } = tweeBlobs();
    expect(await pruneOrphanMedia()).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it('komt er tijdens de opruimronde een tabblad met media bij, dan stopt het wissen meteen', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map } = setup({ records: [rec('m_w1'), rec('m_w2'), rec('m_w3')], storage: {} });
    let B: typeof import('./mediaStore') | null = null;
    const del = backend.delete;
    backend.delete = async (id) => {
      await del(id);
      if (!B) {
        // net na de eerste wisbeurt opent de leerkracht een tweede tabblad
        nep.vanuit('B');
        B = await tweedeTabblad(backend, storage);
        await B.storeMedia(new Blob(['B kiest een afbeelding'], { type: 'image/png' }));
        nep.vanuit('A');
      }
    };
    expect(await pruneOrphanMedia()).toBe(1);
    expect(map.size).toBe(3); // twee wezen + de nieuwe blob van B
  });

  it('het slot is gedeeld, wordt pas genomen bij het inlezen of bewaren van media, en één keer per tabblad', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    setup({ records: [rec('m_a'), rec('m_b')] });
    await preloadMedia();
    await pruneOrphanMedia({ only: [] });
    expect(nep.locks.request).not.toHaveBeenCalled();
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_a');
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_b');
    await storeMedia(new Blob(['c'], { type: 'image/png' }));
    expect(nep.locks.request).toHaveBeenCalledTimes(1);
    const [naam, opties] = nep.locks.request.mock.calls[0];
    expect(naam).toMatch(/^wf-media-tabblad:/);
    expect(opties).toEqual({ mode: 'shared' });
  });

  it('ook een verwijzing waarvan de blob nog geladen moet worden, neemt het slot', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend, storage, map } = setup({ records: [rec('m_used')], storage: {} });
    nep.vanuit('B');
    const B = await tweedeTabblad(backend, storage);
    // B leest een verwijzing vóór IndexedDB klaar is: nog geen blob:-URL, wel de verwijzing in het geheugen
    expect(B.resolveMediaRef(MEDIA_REF_PREFIX + 'm_used')).toBe(MEDIA_REF_PREFIX + 'm_used');
    nep.vanuit('A');
    expect(await pruneOrphanMedia()).toBe(0);
    expect(map.has('m_used')).toBe(true);
  });

  it('storeMedia neemt het slot vóór het bewaren', async () => {
    const nep = nepLocks();
    vi.stubGlobal('navigator', { locks: nep.locks });
    const { backend } = setup();
    let slotenBijPut = -1;
    const put = backend.put;
    backend.put = async (r) => {
      slotenBijPut = nep.sloten().length;
      await put(r);
    };
    await storeMedia(new Blob(['nieuw'], { type: 'image/png' }));
    expect(slotenBijPut).toBe(1);
  });

  it('mislukt de eigen aanvraag, dan probeert het tabblad het bij de volgende keer opnieuw', async () => {
    const nep = nepLocks();
    nep.locks.request.mockImplementationOnce(() => Promise.reject(new Error('nog niet')));
    vi.stubGlobal('navigator', { locks: nep.locks });
    setup({ records: [rec('m_a')] });
    await preloadMedia();
    resolveMediaRef(MEDIA_REF_PREFIX + 'm_a');
    await new Promise((r) => setTimeout(r, 0));
    expect(nep.sloten()).toHaveLength(0);
    await storeMedia(new Blob(['b'], { type: 'image/png' }));
    expect(nep.locks.request).toHaveBeenCalledTimes(2);
    expect(nep.sloten()).toHaveLength(1);
  });

  it('een gooiende request() breekt het tonen niet', async () => {
    const nep = nepLocks();
    nep.locks.request.mockImplementation(() => { throw new Error('SecurityError'); });
    vi.stubGlobal('navigator', { locks: nep.locks });
    setup({ records: [rec('m_a')] });
    await preloadMedia();
    expect(resolveMediaRef(MEDIA_REF_PREFIX + 'm_a')).toMatch(/^blob:/);
  });
});
