// Test voor tools/leerplannen/onderwijsApi.mjs (docs/STUDIERICHTINGEN.md § 23.5.4 en § 23.5.8, pakket K1).
// De hulp draait in dit proces tegen een nagebootste API op 127.0.0.1, met de herkenbare nepsleutel
// test-sleutel-1234. Er gaat nooit een verzoek naar de echte API. Een tweede lokale server speelt "een
// andere host": die mag nooit een verzoek krijgen.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HULP = join(ROOT, 'tools', 'leerplannen', 'onderwijsApi.mjs');
/** Een herkenbare nepsleutel: ze mag nergens in de uitvoer staan. */
const SLEUTEL = 'test-sleutel-1234';

type Schoonmaak = {
  schoon: (t: unknown) => string;
  veilig: (t: unknown) => string;
  kort: (t: unknown, n?: number) => string;
  bevatSleutel: (t: unknown) => boolean;
};
type Antwoord = { status: 200; json: unknown } | { status: 404; tekst: string };
type Api = Schoonmaak & {
  origin: string;
  basis: Record<string, string>;
  teller: { verzoeken: number; perSoort: Record<string, number> };
  haalJson: (adres: string, wat: string, soort?: string, o?: { mag404?: boolean }) => Promise<Antwoord>;
  adres: (basis: string, ...delen: unknown[]) => string;
};
type FoutKlasse = new (bericht: string, code?: number) => Error & { code: number };
interface Module extends Schoonmaak {
  ECHTE_ORIGIN: string;
  PAUZE_MS: number;
  HERHAAL_WACHT_MS: readonly number[];
  VERZOEK_TIMEOUT_MS: number;
  VERBORGEN: string;
  Fout: FoutKlasse;
  wachtFactorUit: (env: Record<string, string | undefined>) => number;
  sleutelVormen: (ruw: unknown) => string[];
  maakSchoonmaak: (ruw: unknown) => Schoonmaak;
  leesSleutel: (env: Record<string, string | undefined>, waarschuw?: (t: string) => void) => string;
  controleerBasis: (waarde: unknown, naam: string) => string;
  leesBasissen: (lijst: [string, string][], env: Record<string, string | undefined>) => { origin: string; basis: Record<string, string> };
  adres: (basis: string, ...delen: unknown[]) => string;
  maakOnderwijsApi: (o: {
    basissen: [string, string][];
    env?: Record<string, string | undefined>;
    log?: (t: string) => void;
    waarschuw?: (t: string) => void;
    pauzeMs?: number;
    timeoutMs?: number;
    herhaalWachtMs?: number[];
  }) => Api;
}

let H: Module;

// ── De nagebootste API ──────────────────────────────────────────────────────

type Verzoek = { methode: string; pad: string; sleutel: string | undefined; accept: string | undefined; tijd: number };
type Behandelaar = (req: IncomingMessage, res: ServerResponse, n: number) => void;

let server: Server;
let ander: Server;
let basis = '';
let anderBasis = '';
let verzoeken: Verzoek[] = [];
let anderVerzoeken = 0;
/** Wat de server per pad doet; n = het hoeveelste verzoek naar dat pad (vanaf 1). */
let routes: Record<string, Behandelaar> = {};
/** Het aantal verzoeken per pad in de lopende test. */
let perPad = new Map<string, number>();

function stuur(res: ServerResponse, status: number, body: unknown, kop: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...kop });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function start(behandel: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; basis: string }> {
  const s = createServer(behandel);
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  return { server: s, basis: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  H = (await import(/* @vite-ignore */ pathToFileURL(HULP).href)) as Module;
  ({ server, basis } = await start((req, res) => {
    const pad = (req.url ?? '').split('?')[0];
    verzoeken.push({ methode: req.method ?? '', pad, sleutel: req.headers['x-api-key'] as string | undefined, accept: req.headers.accept, tijd: Date.now() });
    const n = (perPad.get(pad) ?? 0) + 1;
    perPad.set(pad, n);
    const r = Object.prototype.hasOwnProperty.call(routes, pad) ? routes[pad] : undefined;
    if (r) r(req, res, n);
    else stuur(res, 404, { code: 'NotFound', message: 'Er werd geen data gevonden.' });
  }));
  ({ server: ander, basis: anderBasis } = await start((_req, res) => {
    anderVerzoeken++;
    stuur(res, 200, { gestolen: true });
  }));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => ander.close(() => resolve()));
});

beforeEach(() => {
  verzoeken = [];
  anderVerzoeken = 0;
  routes = {};
  perPad = new Map();
});

const ENV = (extra: Record<string, string | undefined> = {}) => ({
  ONDERWIJSDOELEN_API_KEY: SLEUTEL,
  ONDERWIJSDOELEN_WACHT_FACTOR: '0',
  ONDERWIJSDOELEN_API_BASE: `${basis}/onderwijsdoelen`,
  STRUCTUURONDERDELEN_API_BASE: `${basis}/kwalificaties-en-curriculum/structuuronderdelen/v2`,
  BEROEPSKWALIFICATIES_API_BASE: `${basis}/kwalificaties-en-curriculum/beroepskwalificaties/v2`,
  ...extra,
});

const BASISSEN: [string, string][] = [
  ['ONDERWIJSDOELEN_API_BASE', 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen'],
  ['STRUCTUURONDERDELEN_API_BASE', 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2'],
  ['BEROEPSKWALIFICATIES_API_BASE', 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2'],
];

/** Een API-hulp tegen de nagebootste server, met alle logregels in `logs`. */
function maak(extra: Record<string, string | undefined> = {}, opties: { timeoutMs?: number } = {}) {
  const logs: string[] = [];
  const waarschuwingen: string[] = [];
  const api = H.maakOnderwijsApi({ basissen: BASISSEN, env: ENV(extra), log: (t) => logs.push(t), waarschuw: (t) => waarschuwingen.push(t), ...opties });
  return { api, logs, waarschuwingen };
}

const BK = '/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/BK-0390-2';
const bkAdres = (api: Api) => api.adres(api.basis.BEROEPSKWALIFICATIES_API_BASE, 'beroepskwalificatie', 'BK-0390-2');

/** Vangt de Fout van een belofte (of faalt als er geen komt). */
async function fout(p: Promise<unknown>): Promise<Error & { code: number }> {
  try {
    await p;
  } catch (e) {
    return e as Error & { code: number };
  }
  throw new Error('Er kwam geen fout.');
}

/** Een server-antwoord dat de sleutel in alle vormen terugstuurt. */
const echo = (req: IncomingMessage) => {
  const s = String(req.headers['x-api-key']);
  return `sleutel=${s} json=${JSON.stringify(s)} url=${encodeURIComponent(s)}`;
};

// ── Sleutel en schoonmaak ───────────────────────────────────────────────────

describe('sleutel', () => {
  it('leest de sleutel getrimd en waarschuwt één keer zonder de waarde', () => {
    const w: string[] = [];
    expect(H.leesSleutel({ ONDERWIJSDOELEN_API_KEY: `  ${SLEUTEL}\n` }, (t) => w.push(t))).toBe(SLEUTEL);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/witruimte of een nieuwe regel/);
    expect(w.join(' ')).not.toContain(SLEUTEL);
    const geen: string[] = [];
    expect(H.leesSleutel({ ONDERWIJSDOELEN_API_KEY: SLEUTEL }, (t) => geen.push(t))).toBe(SLEUTEL);
    expect(geen).toEqual([]);
  });

  it.each([
    ['ontbreekt', undefined, /ontbreekt/],
    ['leeg', '   ', /ontbreekt/],
    ['een nieuwe regel in het midden', 'test-sleutel\n-1234', /meer dan één regel/],
    ['een spatie in het midden', 'test sleutel 1234', /spaties/],
    ['een stuurteken', 'test-sleutel-\u00071234', /stuurtekens/],
    ['tekens buiten ASCII', 'test-sleutel-1234é', /buiten ASCII/],
    ['te kort', 'abc123', /te kort/],
  ])('weigert een sleutel die %s is (Fout 1, zonder de waarde)', (_naam, ruw, melding) => {
    let e: (Error & { code?: number }) | undefined;
    try {
      H.leesSleutel({ ONDERWIJSDOELEN_API_KEY: ruw }, () => undefined);
    } catch (x) {
      e = x as Error & { code?: number };
    }
    expect(e?.code).toBe(1);
    expect(e?.message).toMatch(melding);
    if (ruw && ruw.trim().length >= 4) expect(e?.message).not.toContain(ruw.trim());
  });
});

describe('schoonmaak', () => {
  it('wist de sleutel ruw, getrimd, per regel en in JSON- en URL-vorm', () => {
    const ruw = '  abc/def+ghi"jkl\n  tweede-regel  ';
    const s = H.maakSchoonmaak(ruw);
    const vormen = [ruw, ruw.trim(), 'abc/def+ghi"jkl', 'tweede-regel', JSON.stringify('abc/def+ghi"jkl').slice(1, -1), encodeURIComponent('abc/def+ghi"jkl'), encodeURIComponent('tweede-regel')];
    for (const v of vormen) {
      expect(s.schoon(`voor ${v} na`)).toBe(`voor ${H.VERBORGEN} na`);
      expect(s.bevatSleutel(`x${v}x`)).toBe(true);
    }
    expect(s.bevatSleutel('niets geheims')).toBe(false);
    const lijst = H.sleutelVormen(ruw);
    expect(lijst).toContain(ruw);
    expect(lijst.map((v) => v.length)).toEqual([...lijst.map((v) => v.length)].sort((a, b) => b - a));
  });

  it('veilig: geen stuurtekens, regeleinden of workflow-opdrachten; kort kapt af', () => {
    const s = H.maakSchoonmaak(SLEUTEL);
    expect(s.veilig(`a\nb\r\u2028c\u0000${SLEUTEL}`)).toBe(`a b c ${H.VERBORGEN}`);
    expect(s.veilig('::set-output name=x::y')).toBe(': :set-output name=x::y');
    expect(s.veilig('  ::error::boe')).toBe('  : :error::boe');
    expect(s.kort('x'.repeat(400))).toHaveLength(300);
    expect(s.kort(`${'y'.repeat(10)}${SLEUTEL}`, 15)).toBe(`${'y'.repeat(10)}<ver…`);
  });

  it('zonder sleutel verandert er niets, en korte delen (< 4 tekens) wissen geen gewone tekst', () => {
    expect(H.maakSchoonmaak('').schoon('alles blijft')).toBe('alles blijft');
    expect(H.maakSchoonmaak(undefined).bevatSleutel('x')).toBe(false);
    expect(H.maakSchoonmaak('ab\ncdefghij').schoon('ab en cdefghij')).toBe(`ab en ${H.VERBORGEN}`);
  });

  it('de standaardfuncties lezen de sleutel uit process.env, ook als die verandert', () => {
    const oud = process.env.ONDERWIJSDOELEN_API_KEY;
    try {
      process.env.ONDERWIJSDOELEN_API_KEY = SLEUTEL;
      expect(H.veilig(`x ${SLEUTEL}`)).toBe(`x ${H.VERBORGEN}`);
      expect(H.bevatSleutel(encodeURIComponent(SLEUTEL))).toBe(true);
      process.env.ONDERWIJSDOELEN_API_KEY = 'een-andere-sleutel';
      expect(H.schoon(`x ${SLEUTEL}`)).toBe(`x ${SLEUTEL}`);
      expect(H.kort('een-andere-sleutel', 100)).toBe(H.VERBORGEN);
    } finally {
      if (oud === undefined) delete process.env.ONDERWIJSDOELEN_API_KEY;
      else process.env.ONDERWIJSDOELEN_API_KEY = oud;
    }
  });
});

describe('wachtfactor', () => {
  it('leest ONDERWIJSDOELEN_WACHT_FACTOR: een getal ≥ 0, anders 1', () => {
    expect(H.wachtFactorUit({ ONDERWIJSDOELEN_WACHT_FACTOR: '0' })).toBe(0);
    expect(H.wachtFactorUit({ ONDERWIJSDOELEN_WACHT_FACTOR: '0.5' })).toBe(0.5);
    for (const fout of [undefined, '', ' ', 'x', '-1', 'Infinity']) expect(H.wachtFactorUit({ ONDERWIJSDOELEN_WACHT_FACTOR: fout })).toBe(1);
    expect(H.PAUZE_MS).toBe(250);
    expect([...H.HERHAAL_WACHT_MS]).toEqual([2000, 4000, 8000, 16000]);
    expect(H.VERZOEK_TIMEOUT_MS).toBe(60000);
  });
});

// ── Adressen ────────────────────────────────────────────────────────────────

describe('basisadressen', () => {
  it.each([
    ['https://onderwijs.api.vlaanderen.be', 'https://onderwijs.api.vlaanderen.be'],
    ['https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/', 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2'],
    ['https://ONDERWIJS.api.vlaanderen.be:443/onderwijsdoelen', 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen'],
    ['http://127.0.0.1:4301/api', 'http://127.0.0.1:4301/api'],
    ['http://localhost:9', 'http://localhost:9'],
    ['http://[::1]:8080/x', 'http://[::1]:8080/x'],
  ])('aanvaardt %s', (waarde, verwacht) => {
    expect(H.controleerBasis(waarde, 'X')).toBe(verwacht);
  });

  it.each([
    ['http://onderwijs.api.vlaanderen.be'],
    ['https://onderwijs.api.vlaanderen.be.voorbeeld.org'],
    ['https://andere.api.vlaanderen.be'],
    ['https://onderwijs-acceptatie.api.vlaanderen.be'],
    ['https://onderwijs.api.vlaanderen.be:444'],
    ['https://gebruiker:wachtwoord@onderwijs.api.vlaanderen.be'],
    ['https://onderwijs.api.vlaanderen.be/x?sleutel=1'],
    ['https://onderwijs.api.vlaanderen.be/x#y'],
    ['https://localhost:4301'],
    ['http://192.168.1.10:80'],
    ['ftp://onderwijs.api.vlaanderen.be'],
    ['geen adres'],
  ])('weigert %s (Fout 1)', (waarde) => {
    let e: (Error & { code?: number }) | undefined;
    try {
      H.controleerBasis(waarde, 'BEROEPSKWALIFICATIES_API_BASE');
    } catch (x) {
      e = x as Error & { code?: number };
    }
    expect(e?.code).toBe(1);
    expect(e?.message).toMatch(/^BEROEPSKWALIFICATIES_API_BASE /);
  });

  it('de eerste basis bepaalt de origin; een andere origin is Fout 1; leeg = standaard', () => {
    expect(H.leesBasissen(BASISSEN, {})).toEqual({
      origin: 'https://onderwijs.api.vlaanderen.be',
      basis: Object.fromEntries(BASISSEN),
    });
    expect(H.leesBasissen(BASISSEN, { ONDERWIJSDOELEN_API_BASE: '', STRUCTUURONDERDELEN_API_BASE: '  ' }).origin).toBe('https://onderwijs.api.vlaanderen.be');
    expect(H.leesBasissen(BASISSEN, ENV()).origin).toBe(basis);
    expect(() => H.leesBasissen(BASISSEN, { BEROEPSKWALIFICATIES_API_BASE: `${basis}/bk` })).toThrow(/BEROEPSKWALIFICATIES_API_BASE moet dezelfde origin hebben als ONDERWIJSDOELEN_API_BASE/);
    expect(() => H.leesBasissen(BASISSEN, ENV({ STRUCTUURONDERDELEN_API_BASE: 'https://onderwijs.api.vlaanderen.be/x' }))).toThrow(/dezelfde origin/);
    expect(() => H.leesBasissen([], {})).toThrow();
  });

  it('bouwt adressen met encodeURIComponent per deel', () => {
    expect(H.adres('https://onderwijs.api.vlaanderen.be/v2/', 'structuuronderdeel', 504)).toBe('https://onderwijs.api.vlaanderen.be/v2/structuuronderdeel/504');
    expect(H.adres('http://127.0.0.1:1', 'beroepskwalificatie', '../a b?c')).toBe('http://127.0.0.1:1/beroepskwalificatie/..%2Fa%20b%3Fc');
  });

  it('maakOnderwijsApi weigert zonder sleutel of met een vreemde basis, voor er iets gevraagd wordt', () => {
    expect(() => H.maakOnderwijsApi({ basissen: BASISSEN, env: ENV({ ONDERWIJSDOELEN_API_KEY: undefined }) })).toThrow(/ONDERWIJSDOELEN_API_KEY ontbreekt/);
    expect(() => H.maakOnderwijsApi({ basissen: BASISSEN, env: ENV({ ONDERWIJSDOELEN_API_BASE: 'https://voorbeeld.org' }) })).toThrow(/moet met https:\/\/onderwijs\.api\.vlaanderen\.be beginnen/);
    expect(verzoeken).toEqual([]);
  });
});

// ── Verzoeken ───────────────────────────────────────────────────────────────

describe('haalJson', () => {
  afterEach(() => {
    expect(anderVerzoeken).toBe(0);
  });

  it('één GET met de getrimde sleutel in x-api-key, naar de basis; telt per soort', async () => {
    routes[BK] = (_req, res) => stuur(res, 200, { beroepskwalificatie: { versie_nr_lang: 'BK-0390-2' } });
    const { api, logs, waarschuwingen } = maak({ ONDERWIJSDOELEN_API_KEY: ` ${SLEUTEL}\n` });
    const r = await api.haalJson(bkAdres(api), 'BK-0390-2', 'bk');
    expect(r).toEqual({ status: 200, json: { beroepskwalificatie: { versie_nr_lang: 'BK-0390-2' } } });
    expect(verzoeken).toHaveLength(1);
    expect(verzoeken[0]).toMatchObject({ methode: 'GET', pad: BK, sleutel: SLEUTEL, accept: 'application/json' });
    expect(api.teller.verzoeken).toBe(1);
    expect({ ...api.teller.perSoort }).toEqual({ bk: 1 });
    expect(logs).toEqual([]);
    expect(waarschuwingen).toHaveLength(1);
    expect(api.bevatSleutel(` ${SLEUTEL}\n`)).toBe(true);
  });

  it.each([301, 302, 303, 307, 308])('een doorverwijzing (HTTP %i) wordt niet gevolgd: Fout 1, één verzoek', async (status) => {
    routes[BK] = (_req, res) => stuur(res, status, '', { location: `${anderBasis}/steel?k=${SLEUTEL}` });
    const { api } = maak();
    const e = await fout(api.haalJson(bkAdres(api), 'BK-0390-2'));
    expect(e.code).toBe(1);
    expect(e.message).toMatch(new RegExp(`stuurt door \\(HTTP ${status} naar ${anderBasis.replace(/[.]/g, '\\.')}\\)`));
    expect(e.message).not.toContain(SLEUTEL);
    expect(verzoeken).toHaveLength(1);
  });

  it.each([401, 403])('HTTP %i: de API weigert de sleutel, Fout 1 zonder nieuwe poging', async (status) => {
    routes[BK] = (req, res) => stuur(res, status, echo(req));
    const { api, logs } = maak();
    const e = await fout(api.haalJson(bkAdres(api), 'BK-0390-2'));
    expect(e).toMatchObject({ code: 1 });
    expect(e.message).toMatch(new RegExp(`weigert de sleutel \\(HTTP ${status}\\)`));
    expect(verzoeken).toHaveLength(1);
    expect(logs).toEqual([]);
  });

  it('404 zonder mag404 is Fout 1; met mag404 komt de body terug, ingekort en zonder sleutel', async () => {
    routes[BK] = (req, res) => stuur(res, 404, `${echo(req)} ${'x'.repeat(2000)}`);
    const { api } = maak();
    expect((await fout(api.haalJson(bkAdres(api), 'BK-0390-2'))).message).toMatch(/HTTP 404/);
    const r = await api.haalJson(bkAdres(api), 'BK-0390-2', 'bk', { mag404: true });
    expect(r.status).toBe(404);
    const tekst = (r as { tekst: string }).tekst;
    expect(tekst.length).toBeLessThanOrEqual(500);
    expect(tekst).toContain(`sleutel=${H.VERBORGEN} json="${H.VERBORGEN}" url=${H.VERBORGEN}`);
    expect(tekst).not.toContain(SLEUTEL);
    expect(verzoeken).toHaveLength(2);
  });

  it.each([400, 405, 410, 422])('een andere fout (HTTP %i) is Fout 1 zonder nieuwe poging', async (status) => {
    routes[BK] = (req, res) => stuur(res, status, echo(req));
    const { api } = maak();
    const e = await fout(api.haalJson(bkAdres(api), 'BK-0390-2'));
    expect(e.code).toBe(1);
    expect(e.message).toMatch(new RegExp(`HTTP ${status}`));
    expect(verzoeken).toHaveLength(1);
  });

  it('429 en 5xx: nieuwe pogingen, met een veilige logregel per poging', async () => {
    routes[BK] = (req, res, n) => (n <= 2 ? stuur(res, n === 1 ? 429 : 503, echo(req)) : stuur(res, 200, { ok: true }));
    const { api, logs } = maak();
    expect(await api.haalJson(bkAdres(api), `BK-0390-2 ${SLEUTEL}`)).toEqual({ status: 200, json: { ok: true } });
    expect(verzoeken).toHaveLength(3);
    expect(logs).toEqual([
      `BK-0390-2 ${H.VERBORGEN}: opnieuw proberen (1/4) na HTTP 429.`,
      `BK-0390-2 ${H.VERBORGEN}: opnieuw proberen (2/4) na HTTP 503.`,
    ]);
  });

  it('na vier nieuwe pogingen (vijf verzoeken) is het Fout 1', async () => {
    routes[BK] = (req, res) => stuur(res, 500, echo(req));
    const { api, logs } = maak();
    const e = await fout(api.haalJson(bkAdres(api), 'BK-0390-2'));
    expect(e.code).toBe(1);
    expect(e.message).toBe('BK-0390-2 lukte niet na 4 nieuwe pogingen (HTTP 500).');
    expect(verzoeken).toHaveLength(5);
    expect(logs).toHaveLength(4);
  });

  it('een netwerkfout geeft een nieuwe poging', async () => {
    routes[BK] = (req, res, n) => (n === 1 ? req.socket.destroy() : stuur(res, 200, [1, 2]));
    const { api, logs } = maak();
    expect(await api.haalJson(bkAdres(api), 'BK-0390-2')).toEqual({ status: 200, json: [1, 2] });
    expect(verzoeken).toHaveLength(2);
    expect(logs[0]).toMatch(/opnieuw proberen \(1\/4\) na netwerkfout \(/);
  });

  it('een time-out geeft nieuwe pogingen, en daarna Fout 1', async () => {
    routes[BK] = () => undefined; // de server antwoordt nooit
    const { api, logs } = maak({}, { timeoutMs: 100 });
    const e = await fout(api.haalJson(bkAdres(api), 'BK-0390-2'));
    expect(e.code).toBe(1);
    expect(e.message).toMatch(/lukte niet na 4 nieuwe pogingen \(netwerkfout \(TimeoutError\)\)/);
    expect(verzoeken).toHaveLength(5);
    expect(logs).toHaveLength(4);
  }, 20_000);

  it('geen geldige JSON is Fout 1 zonder nieuwe poging', async () => {
    routes[BK] = (_req, res) => stuur(res, 200, '<html>onderhoud</html>', { 'content-type': 'text/html' });
    const { api } = maak();
    expect((await fout(api.haalJson(bkAdres(api), 'BK-0390-2'))).message).toMatch(/geen geldige JSON/);
    expect(verzoeken).toHaveLength(1);
  });

  it('een adres op een andere origin, met een wachtwoord of ongeldig: Fout 1 zonder verzoek', async () => {
    const { api } = maak();
    for (const doel of [`${anderBasis}${BK}`, `https://onderwijs.api.vlaanderen.be${BK}`, basis.replace('http://', 'http://ik:geheim@') + BK, 'geen adres', `${basis.replace('127.0.0.1', 'localhost')}${BK}`]) {
      const e = await fout(api.haalJson(doel, 'BK-0390-2'));
      expect(e.code).toBe(1);
    }
    expect(verzoeken).toEqual([]);
    expect(api.teller.verzoeken).toBe(0);
  });

  it('een api_url in een antwoord wordt nooit gevraagd', async () => {
    routes[BK] = (_req, res) => stuur(res, 200, { api_url: `${anderBasis}/beroepskwalificatie/v1/BK-0390-2`, links: { next: { href: `${basis}/volgende` } } });
    const { api } = maak();
    await api.haalJson(bkAdres(api), 'BK-0390-2');
    expect(verzoeken.map((v) => v.pad)).toEqual([BK]);
  });

  it('wacht minstens de pauze (× wachtfactor) tussen twee verzoeken', async () => {
    routes[BK] = (_req, res) => stuur(res, 200, {});
    const { api } = maak({ ONDERWIJSDOELEN_WACHT_FACTOR: '0.4' }); // 250 ms × 0,4 = 100 ms
    for (let i = 0; i < 3; i++) await api.haalJson(bkAdres(api), 'BK-0390-2');
    expect(verzoeken).toHaveLength(3);
    for (let i = 1; i < verzoeken.length; i++) expect(verzoeken[i].tijd - verzoeken[i - 1].tijd).toBeGreaterThanOrEqual(95);
  });

  it('de nepsleutel staat nergens in meldingen, logregels of 404-tekst', async () => {
    const uitvoer: string[] = [];
    routes[BK] = (req, res, n) => (n <= 2 ? stuur(res, 502, echo(req)) : stuur(res, 404, echo(req)));
    const { api, logs } = maak();
    const r = await api.haalJson(bkAdres(api), `BK ${SLEUTEL}`, 'bk', { mag404: true });
    uitvoer.push(JSON.stringify(r), ...logs);
    routes[BK] = (req, res) => stuur(res, 403, echo(req));
    uitvoer.push((await fout(api.haalJson(bkAdres(api), `BK ${JSON.stringify(SLEUTEL)}`))).message);
    routes[BK] = (req, res) => stuur(res, 302, echo(req), { location: `${anderBasis}/${encodeURIComponent(SLEUTEL)}` });
    uitvoer.push((await fout(api.haalJson(bkAdres(api), `BK ${encodeURIComponent(SLEUTEL)}`))).message);
    const alles = uitvoer.join('\n');
    expect(alles).toContain(H.VERBORGEN);
    for (const vorm of [SLEUTEL, JSON.stringify(SLEUTEL), encodeURIComponent(SLEUTEL)]) expect(alles).not.toContain(vorm);
    expect(api.bevatSleutel(alles)).toBe(false);
  });
});
