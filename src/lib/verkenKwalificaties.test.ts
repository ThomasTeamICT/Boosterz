// Test voor de stand "kwalificaties" van tools/verkenning/verken-onderwijs-api.mjs (docs/ONDERWIJS-API.md § 5).
// Het script draait als apart Node-proces tegen een nagebootste http-API op 127.0.0.1, met een herkenbare
// nepsleutel. Er gaat nooit een verzoek naar de echte API en het rapport komt in een tijdelijke map.
// Een tweede lokale server speelt "een andere host": die mag nooit een verzoek krijgen.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Elke run start Node als apart proces.
vi.setConfig({ testTimeout: 60_000 });

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'tools', 'verkenning', 'verken-onderwijs-api.mjs');
const MATRIX = join(ROOT, 'public', 'leerplannen', 'structuur', 'studierichtingen.json');
/** Een herkenbare nepsleutel: ze mag nergens in de uitvoer of het rapport staan. */
const SLEUTEL = 'test-sleutel-1234';
/** Hoogstens zoveel bytes per logboekregel. */
const MAX_REGEL = 8 * 1024;
/** Een sleutelvormige reeks (letters en cijfers) die een antwoord zelf meelevert. */
const LANG_GEHEIM = 'sk9Xq2LmZ7vB4nT8wR3yC6dF1hJ5aE0u';
const KC = '/kwalificaties-en-curriculum';
const BK = `${KC}/beroepskwalificaties/v2/beroepskwalificatie`;
const SO = `${KC}/structuuronderdelen/v2/structuuronderdeel`;
const TRAJECT = `${KC}/trajecten/v1/opleidingstraject`;

type Rec = Record<string, any>;
type Uitkomst = { code: number; stdout: string; stderr: string };
type Verzoek = { methode: string; url: string; sleutel: string | undefined };
type Scenario = 'normaal' | 'kapot' | 'leeg' | 'namen' | 'breed' | 'negeert' | 'zondertotaal' | 'ids';

let TMP = '';
let server: Server;
let ander: Server;
let basis = '';
let anderBasis = '';
let scenario: Scenario = 'normaal';
let verzoeken: Verzoek[] = [];
let anderVerzoeken: string[] = [];
let soTeller = 0;
let eersteNummer = '';

// ── De nagebootste API ──────────────────────────────────────────────────────

function stuur(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const nietGevonden = (res: ServerResponse) => stuur(res, 404, { message: 'niet gevonden' });

/** Scenario "breed": zeshonderd extra velden per element, zodat de logboekregels de grens van 8 KB overschrijden. */
const ruis = (): Rec =>
  scenario === 'breed' ? Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`ruisveld_${String(i).padStart(3, '0')}`, i % 2 ? `waarde ${i}` : i])) : {};

function bkItems() {
  return [
    // api_url op de eigen server: mag gevolgd worden
    { beroepskwalificatie_nummer: 'BK-0001', titel: 'Lasser', api_url: `${basis}${BK}/BK-0001`, sector: { code: 'S1', omschrijving: 'Metaal' }, ...ruis() },
    // api_url naar een andere host: mag nooit gevolgd worden
    { beroepskwalificatie_nummer: 'BK-0002', titel: 'Kok', api_url: `${anderBasis}/beroepskwalificatie/BK-0002`, ...ruis() },
    { beroepskwalificatie_nummer: 'BK-0003', titel: 'Bakker', ...ruis() },
  ];
}

function antwoordNormaal(url: URL, res: ServerResponse) {
  const p = url.pathname;
  const q = url.searchParams;
  if (p === BK) {
    // De lijst staat onder "data", het totaal onder meta.total_elements, en "links" komt eerst.
    const lijst = { links: [{ rel: 'self', href: `${basis}${BK}` }], meta: { total_elements: 3, page: 1 }, data: bkItems() };
    if (q.has('structuuronderdeel_nummer')) return stuur(res, 200, lijst); // genegeerd: zelfde totaal
    if (q.has('structuuronderdeel')) return stuur(res, 200, '<html><body>Zoeken</body></html>', 'text/html');
    if (q.has('adv')) return stuur(res, 200, { meta: { total_elements: 1 }, data: [bkItems()[0]] }); // werkt
    if (q.has('adv_nummer')) {
      if (/^ADV/.test(q.get('adv_nummer') || '')) {
        res.writeHead(302, { location: `${anderBasis}/doorverwezen` });
        return res.end();
      }
      return nietGevonden(res);
    }
    if (q.has('opleidingsinhoud')) return stuur(res, 500, `Interne fout bij ${SLEUTEL}`, 'text/plain');
    if (q.has('sector')) return nietGevonden(res);
    return stuur(res, 200, lijst);
  }
  if (p === `${BK}/BK-0001`) {
    return stuur(res, 200, {
      beroepskwalificatie_nummer: 'BK-0001',
      titel: 'Lasser',
      opleidingen: [{ structuuronderdeel_nummer: 505, adv_nummer: 'ADV-1608', onderwijskwalificatie: { code: 'OK-1', titel: 'Diploma secundair onderwijs' } }],
      sectoren: [{ code: 'S1', omschrijving: 'Metaal' }],
      competenties: [{ code: 'C1', titel: 'Lassen met de hand' }],
      opmerking: `Aangemeld met ${SLEUTEL} en token ${LANG_GEHEIM}`,
      bewijs: { api_key: LANG_GEHEIM },
      ...ruis(),
    });
  }
  if (p === `${BK}/BK-0003`) return stuur(res, 200, '<!doctype html><html><body>Geen JSON</body></html>', 'text/html');
  if (p === `${BK}/BK-0004`) {
    return stuur(res, 200, { beroepskwalificatie_nummer: 'BK-0004', titel: 'Monteur', opleidingen: [{ structuuronderdeel_nummer: Number(eersteNummer), adv_nummer: 'ADV-1608' }] });
  }
  const so = new RegExp(`^${SO}/(\\d+)$`).exec(p);
  if (so) {
    soTeller++;
    if (soTeller === 1) {
      eersteNummer = so[1];
      return stuur(res, 200, {
        structuuronderdeel_nummer: Number(so[1]),
        titel: 'Een richting',
        structuuronderdeel_details: [{ structuuronderdeel_detail_nummer: 'ADV-1608', status: { code: 'ERKEND' } }],
        beroepskwalificaties: [{ beroepskwalificatie_nummer: 'BK-0001', titel: 'Lasser' }, { beroepskwalificatie_nummer: 'BK-0004' }],
        onderwijskwalificaties: [],
        // de sleutel als veldnaam en in een tekst: ook die gaan niet mee naar buiten
        [SLEUTEL]: 'veldnaam is de sleutel',
        notitie: `sleutel ${SLEUTEL} en ${LANG_GEHEIM}`,
        ...ruis(),
      });
    }
    if (soTeller === 2) return stuur(res, 200, '<html><body>Onderhoud</body></html>', 'text/html');
    if (soTeller === 3) return nietGevonden(res);
    if (soTeller === 4) return stuur(res, 200, [{ nummer: 1, kwalificatie: { code: 'K1' } }]);
    return stuur(res, 200, 'null');
  }
  if (new RegExp(`^${SO}/\\d+/beroepskwalificaties$`).test(p)) return stuur(res, 200, [{ beroepskwalificatie_nummer: 'BK-0001' }]);
  if (p === TRAJECT) return stuur(res, 200, { items: ['OT-1', 'OT-2', 'OT-3', 'OT-4'].map((id) => ({ opleidingstraject_id: id, titel: `Traject ${id}` })) });
  if (p === `${TRAJECT}/OT-1`) return stuur(res, 200, { opleidingstraject_id: 'OT-1', titel: 'Traject OT-1', duaal: true });
  if (p === `${KC}/onderwijskwalificaties/v2/onderwijskwalificatie`) return stuur(res, 200, { onderwijskwalificaties: [{ code: 'OK-1', titel: 'Diploma' }] });
  if (p === `${KC}/opleidingsprofielen`) return stuur(res, 401, { message: 'geen toegang' });
  return nietGevonden(res);
}

function antwoord(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', basis);
  verzoeken.push({ methode: req.method || '?', url: `${url.pathname}${url.search}`, sleutel: req.headers['x-api-key'] as string | undefined });
  if (scenario === 'kapot') {
    // Een afgebroken JSON voor de lijst, overal elders een fout met de sleutel erin.
    if (url.pathname === BK) return stuur(res, 200, '{"data": [{"beroepskwalificatie_nummer": "BK-9', 'application/json');
    return stuur(res, 500, `Fout ${SLEUTEL} ${LANG_GEHEIM}`, 'text/plain');
  }
  if (scenario === 'leeg') return stuur(res, 200, url.pathname === BK ? {} : []);
  if (scenario === 'negeert' && url.pathname === BK) {
    // Negeert elk filter en geeft nooit een totaal of een herkenbaar id.
    return stuur(res, 200, { data: [{ titel: 'Lasser' }, { titel: 'Kok' }] });
  }
  if (scenario === 'zondertotaal' && url.pathname === BK) {
    // Geen totaal en geen id: alleen de lijst zelf kan vergeleken worden.
    const q = url.searchParams;
    const lijst = [{ titel: 'Lasser' }, { titel: 'Kok' }, { titel: 'Bakker' }];
    if (q.has('adv')) return stuur(res, 200, { data: lijst.slice(0, 1) }); // korter: werkt
    if (q.has('structuuronderdeel')) return stuur(res, 200, { data: [...lijst].reverse() }); // even lang, ander eerste element: werkt
    if (q.has('opleidingsinhoud')) return stuur(res, 200, { bericht: 'geen resultaten' }); // niets om mee te vergelijken: onbekend
    if (q.has('sector')) return nietGevonden(res);
    return stuur(res, 200, { data: lijst }); // de basislijst, structuuronderdeel_nummer en adv_nummer: negeren het filter
  }
  if (scenario === 'ids') {
    // Het id staat niet als BK-… in de waarde, en een geneste sector.code komt vóór het eigen nummer.
    const p = url.pathname;
    if (p === BK) {
      const data = ['0001', '0002', '0003'].map((nr, i) => ({ sector: { code: i < 2 ? 'X' : 'Y' }, beroepskwalificatie_nummer: nr, titel: `BK ${nr}` }));
      return stuur(res, 200, { meta: { total_elements: 3 }, data });
    }
    if (new RegExp(`^${BK}/\\d+$`).test(p)) return stuur(res, 200, { beroepskwalificatie_nummer: p.split('/').pop(), titel: 'detail' });
    if (p === TRAJECT) return stuur(res, 200, { items: ['OT-1', 'OT-2'].map((id) => ({ sector: { code: 'X' }, opleidingstraject_id: id, titel: `Traject ${id}` })) });
    if (new RegExp(`^${TRAJECT}/OT-\\d+$`).test(p)) return stuur(res, 200, { opleidingstraject_id: p.split('/').pop() });
  }
  if (scenario === 'namen') {
    // Details met veldnamen die passen, maar zonder BK-codes of ADV-nummers; vijftig ruisvelden komen eerst.
    const so = new RegExp(`^${SO}/(\\d+)$`).exec(url.pathname);
    if (so) {
      const o: Rec = {};
      for (let i = 0; i < 50; i++) o[`structuuronderdeel_veld_${i}`] = i;
      o.structuuronderdeel_nummer = Number(so[1]);
      o.beroepskwalificaties = [];
      return stuur(res, 200, o);
    }
    const bk = new RegExp(`^${BK}/(BK-\\d+)$`).exec(url.pathname);
    if (bk) return stuur(res, 200, { beroepskwalificatie_nummer: bk[1], opleidingen: [] });
  }
  return antwoordNormaal(url, res);
}

// ── Het script draaien ──────────────────────────────────────────────────────

function draai(sc: Scenario = 'normaal', extra: Record<string, string | undefined> = {}): Promise<Uitkomst> {
  scenario = sc;
  verzoeken = [];
  anderVerzoeken = [];
  soTeller = 0;
  eersteNummer = '';
  rmSync(rapportBestand(), { force: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_PROXY: '127.0.0.1,localhost',
    ONDERWIJSDOELEN_WACHT_FACTOR: '0',
    VERKENNING_UIT: TMP,
    VERKENNING_API_BASIS: basis,
    ONDERWIJSDOELEN_API_KEY: SLEUTEL,
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return new Promise((klaar) => {
    execFile(process.execPath, [SCRIPT, '--kwalificaties'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (fout, stdout, stderr) => {
      const code = fout ? (typeof (fout as { code?: unknown }).code === 'number' ? ((fout as { code: number }).code) : 1) : 0;
      klaar({ code, stdout, stderr });
    });
  });
}

const regelsMet = (stdout: string, voorvoegsel: string): Rec[] =>
  stdout
    .split('\n')
    .filter((l) => l.startsWith(`${voorvoegsel}|`))
    .map((l) => JSON.parse(l.slice(voorvoegsel.length + 1)) as Rec);

const rapportBestand = () => join(TMP, 'kwalificaties.json');

beforeAll(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'verken-kwal-'));
  await Promise.all([
    new Promise<void>((klaar) => {
      server = createServer(antwoord).listen(0, '127.0.0.1', () => {
        basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        klaar();
      });
    }),
    new Promise<void>((klaar) => {
      ander = createServer((req, res) => {
        anderVerzoeken.push(req.url || '?');
        stuur(res, 200, {});
      }).listen(0, '127.0.0.1', () => {
        anderBasis = `http://127.0.0.1:${(ander.address() as AddressInfo).port}`;
        klaar();
      });
    }),
  ]);
});

afterAll(async () => {
  await Promise.all([new Promise((klaar) => server.close(klaar)), new Promise((klaar) => ander.close(klaar))]);
  rmSync(TMP, { recursive: true, force: true });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('stand kwalificaties: een gewone run', () => {
  // Eén run; de tests kijken naar een momentopname van wat de server zag en wat het script schreef.
  let u: Uitkomst;
  let kwal: Rec[];
  let samen: Rec[];
  let gezien: Verzoek[];
  let gezienAnder: string[];
  let nummer1: string;
  let bestand: string;

  beforeAll(async () => {
    u = await draai('normaal');
    kwal = regelsMet(u.stdout, 'KWAL');
    samen = regelsMet(u.stdout, 'KWAL-SAMENVATTING');
    gezien = [...verzoeken];
    gezienAnder = [...anderVerzoeken];
    nummer1 = eersteNummer;
    bestand = existsSync(rapportBestand()) ? readFileSync(rapportBestand(), 'utf8') : '';
  });

  it('loopt door zonder te crashen en sluit af met een samenvatting', () => {
    expect(u.code, u.stderr).toBe(0);
    expect(u.stderr).toBe(''); // een gewone sleutel geeft geen waarschuwing
    expect(samen.map((s) => s.deel)).toEqual(['bk', 'onderdelen', 'koppelingen', 'filters', 'adressen', 'conclusie', 'klaar']);
    expect(samen[samen.length - 1].oproepen).toBe(gezien.length);
  });

  it('houdt de uitvoer compact: één geldige JSON-regel per bevinding', () => {
    const regels = u.stdout.split('\n').filter(Boolean);
    expect(regels.length).toBeLessThan(120);
    expect(regels.every((l) => l.startsWith('KWAL|') || l.startsWith('KWAL-SAMENVATTING|'))).toBe(true);
    expect(Math.max(...regels.map((l) => Buffer.byteLength(l, 'utf8')))).toBeLessThanOrEqual(MAX_REGEL);
    expect(kwal.length).toBeGreaterThan(15);
  });

  it('doet hoogstens 60 oproepen: alleen GET, elk adres één keer, alles onder kwalificaties-en-curriculum', () => {
    expect(gezien.length).toBeGreaterThan(15);
    expect(gezien.length).toBeLessThanOrEqual(60);
    expect(gezien.every((v) => v.methode === 'GET')).toBe(true);
    expect(new Set(gezien.map((v) => v.url)).size).toBe(gezien.length);
    expect(gezien.every((v) => v.url.startsWith(KC))).toBe(true);
  });

  it('stuurt de sleutel alleen naar de eigen server en volgt geen doorverwijzing of link naar een andere host', () => {
    expect(gezien.every((v) => v.sleutel === SLEUTEL)).toBe(true);
    expect(gezienAnder).toEqual([]);
    // De 302 naar de andere host is vastgelegd, maar niet gevolgd.
    const filter = kwal.find((r) => r.stap === 'filter' && r.filter?.naam === 'adv_nummer' && r.doorverwijzing);
    expect(filter?.status).toBe(302);
    expect(filter?.doorverwijzing).toContain('/doorverwezen');
    // BK-0002 had een api_url naar de andere host: het detail is via het eigen pad gevraagd.
    expect(gezien.some((v) => v.url === `${BK}/BK-0002`)).toBe(true);
  });

  it('toont de nepsleutel en sleutelvormige reeksen nergens, ook niet in het rapportbestand', () => {
    expect(bestand).not.toBe('');
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(LANG_GEHEIM);
    }
    expect(u.stdout).toContain('<verborgen>');
  });

  it('schrijft hetzelfde in het rapport als in het logboek', () => {
    const rapport = JSON.parse(bestand) as Rec;
    expect(rapport.regels).toHaveLength(kwal.length);
    expect(rapport.samenvatting).toHaveLength(samen.length);
    expect(rapport.oproepen).toBe(gezien.length);
  });

  it('beschrijft de lijst van beroepskwalificaties: een lijst onder een andere sleutel, totaal en veldnamen', () => {
    const lijst = kwal.find((r) => r.stap === 'bk-lijst');
    expect(lijst?.status).toBe(200);
    expect(lijst?.lijst).toEqual({ pad: 'data', lengte: 3 });
    expect(lijst?.totaal).toBe(3);
    expect(Object.keys(lijst?.velden)).toContain('data[].beroepskwalificatie_nummer');
    expect(Object.keys(lijst?.itemVelden)).toEqual(expect.arrayContaining(['beroepskwalificatie_nummer', 'titel', 'sector.code']));
  });

  it('haalt het detail van drie BK\'s en geeft per veld een korte proef', () => {
    const details = kwal.filter((r) => r.stap === 'bk-detail');
    expect(details.map((d) => d.status)).toEqual([200, 404, 200]);
    expect(details[2].html).toBe(true); // HTML in plaats van JSON
    const eerste = details[0];
    expect(Object.keys(eerste.velden)).toEqual(
      expect.arrayContaining(['beroepskwalificatie_nummer', 'opleidingen', 'opleidingen[].structuuronderdeel_nummer', 'opleidingen[].adv_nummer', 'sectoren', 'competenties']),
    );
    expect(eerste.proef.titel).toBe('Lasser');
    expect(eerste.proef['opleidingen[].adv_nummer']).toBe('ADV-1608');
    // velden die naar opleidingen, ADV, onderwijskwalificaties, sectoren of competenties wijzen
    expect(Object.keys(eerste.relevant)).toEqual(expect.arrayContaining(['opleidingen', 'opleidingen[].onderwijskwalificatie', 'sectoren', 'competenties']));
    expect(eerste.adv).toEqual(expect.objectContaining({ 'ADV-1608': expect.any(String) }));
  });

  it('bevraagt vijf onderdelen en overleeft een lijst, html, 404 en een leeg antwoord als detail', () => {
    const onderdelen = kwal.filter((r) => r.stap === 'onderdeel-detail');
    expect(onderdelen).toHaveLength(5);
    expect(onderdelen.map((o) => o.status)).toEqual([200, 200, 404, 200, 200]);
    expect(onderdelen[1].html).toBe(true);
    expect(onderdelen[4].json).toBe(false);
    expect(onderdelen.slice(0, 4).every((o) => o.voorbeeld && o.voorbeeld.nr > 0)).toBe(true);
    const volledig = onderdelen[0];
    expect(Object.keys(volledig.velden)).toEqual(
      expect.arrayContaining(['structuuronderdeel_details', 'structuuronderdeel_details[].structuuronderdeel_detail_nummer', 'beroepskwalificaties', 'beroepskwalificaties[].beroepskwalificatie_nummer', 'onderwijskwalificaties']),
    );
    expect(volledig.bk).toEqual(expect.objectContaining({ 'BK-0001': 'beroepskwalificaties[].beroepskwalificatie_nummer' }));
  });

  it('kiest vier onderdelen met arbeidsmarktfinaliteit (2de en 3de graad, één duaal) en één met doorstroomfinaliteit', () => {
    const v = kwal.find((r) => r.stap === 'voorbeelden');
    expect(v?.bron).toBe('repo');
    expect(v?.arbeidsmarkt).toHaveLength(4);
    expect(v?.doorstroom).toHaveLength(1);
  });

  it('bevraagt trajecten: de lijst en drie details, ook als er maar één bestaat', () => {
    expect(kwal.find((r) => r.stap === 'traject-lijst')?.lijst).toEqual({ pad: 'items', lengte: 4 });
    expect(kwal.filter((r) => r.stap === 'traject-detail').map((r) => r.status)).toEqual([200, 404, 404]);
  });

  it('probeert de kandidaat-adressen met status en eerste veldnamen', () => {
    const adressen = kwal.filter((r) => r.stap === 'adres');
    expect(adressen.map((a) => a.naam)).toEqual([
      'onderwijskwalificaties v1 enkelvoud',
      'onderwijskwalificaties v2 enkelvoud',
      'onderwijskwalificaties v1 meervoud',
      'onderwijskwalificaties v2 meervoud',
      'structuuronderdeel/{nummer}/beroepskwalificaties',
      'structuuronderdeel/{nummer}/kwalificaties',
      'opleidingsprofielen',
    ]);
    expect(adressen.map((a) => a.status)).toEqual([404, 200, 404, 404, 200, 404, 401]);
    expect(adressen[1].eersteVelden).toEqual(expect.arrayContaining(['code', 'titel']));
  });

  it('meldt per filter of hij werkt, genegeerd wordt of faalt', () => {
    const filters = samen.find((s) => s.deel === 'filters') as Rec;
    expect(filters.werken).toEqual(['adv']);
    expect(filters.genegeerd).toEqual(['structuuronderdeel_nummer']);
    expect(filters.fout).toEqual(expect.arrayContaining(['sector:404', 'opleidingsinhoud:500']));
    // 200 met html en een doorverwijzing zijn niet te beoordelen: "onbekend", met de reden
    expect(filters.onbekend).toEqual(expect.arrayContaining(['structuuronderdeel:geen JSON', 'adv_nummer:status 302']));
    // 200 met html en een doorverwijzing zijn geen werkende filters
    expect(filters.werken).not.toContain('structuuronderdeel');
    expect(filters.werken).not.toContain('adv_nummer');
    const adv = kwal.find((r) => r.stap === 'filter' && r.filter?.naam === 'adv');
    expect(adv?.filter).toEqual(expect.objectContaining({ werking: 'werkt', totaal: 1, referentie: 3, eersteIds: ['BK-0001'] }));
  });

  it('volgt een BK uit het detail van een onderdeel terug en ziet de verwijzing naar het onderdeel', () => {
    const terug = kwal.find((r) => r.stap === 'bk-detail-via-onderdeel');
    expect(terug?.adres).toBe(`${BK}/BK-0004`);
    expect(terug?.terugverwijzing).toEqual({ onderdeel: Number(nummer1), adv: true, nummer: true });
    // BK-0001 was al bevraagd: niet nog eens
    expect(gezien.filter((v) => v.url === `${BK}/BK-0001`)).toHaveLength(1);
  });

  it('vat samen welke velden, filters en adressen een koppeling geven', () => {
    const koppelingen = samen.find((s) => s.deel === 'koppelingen') as Rec;
    const lijst = koppelingen.lijst as Rec[];
    expect(lijst).toContainEqual(expect.objectContaining({ van: 'structuuronderdeel', naar: 'beroepskwalificatie', via: 'veld (waarde)', pad: 'beroepskwalificaties[].beroepskwalificatie_nummer', voorbeeld: 'BK-0001' }));
    expect(lijst).toContainEqual(expect.objectContaining({ van: 'beroepskwalificatie', naar: 'adv', via: 'veld (waarde)', voorbeeld: 'ADV-1608' }));
    expect(lijst).toContainEqual(expect.objectContaining({ via: 'filter', naam: 'adv', totaal: 1, referentie: 3 }));
    expect(lijst).toContainEqual(expect.objectContaining({ via: 'adres', aantal: 1 }));
    expect(lijst.some((k) => k.via === 'terugverwijzing' && k.bewijs?.adv === true)).toBe(true);
    const conclusie = samen.find((s) => s.deel === 'conclusie') as Rec;
    expect(conclusie.terugverwijzingBevestigd).toBe(true);
    expect(conclusie.structuuronderdeelNaarBk).toMatch(/^ja/);
    expect(conclusie.bkNaarStructuuronderdeel).toMatch(/^ja/);
    const adressen = samen.find((s) => s.deel === 'adressen') as Rec;
    expect(adressen.bereikbaar.map((a: Rec) => a.naam)).toEqual(expect.arrayContaining(['onderwijskwalificaties v2 enkelvoud', 'structuuronderdeel/{nummer}/beroepskwalificaties']));
    expect(adressen.niet).toContainEqual({ naam: 'opleidingsprofielen', status: 401 });
  });
});

describe('stand kwalificaties: rare of kapotte antwoorden', () => {
  it('loopt door als alles een fout geeft of afgebroken JSON, en houdt de sleutel buiten beeld', async () => {
    const u = await draai('kapot');
    expect(u.code, u.stderr).toBe(0);
    const samen = regelsMet(u.stdout, 'KWAL-SAMENVATTING');
    expect(samen[samen.length - 1].deel).toBe('klaar');
    const lijst = regelsMet(u.stdout, 'KWAL').find((r) => r.stap === 'bk-lijst');
    expect(lijst?.json).toBe(false);
    expect(lijst?.begin).toContain('beroepskwalificatie_nummer');
    // geen basislijst: geen filters, wel de overige stappen
    expect(regelsMet(u.stdout, 'KWAL').some((r) => r.stap === 'filters' && r.overgeslagen)).toBe(true);
    expect(verzoeken.length).toBeLessThanOrEqual(60);
    const bestand = readFileSync(rapportBestand(), 'utf8');
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(LANG_GEHEIM);
    }
    expect(anderVerzoeken).toEqual([]);
  });

  it('loopt door als de antwoorden leeg zijn (een leeg object of een lege lijst)', async () => {
    const u = await draai('leeg');
    expect(u.code, u.stderr).toBe(0);
    const samen = regelsMet(u.stdout, 'KWAL-SAMENVATTING');
    expect(samen[samen.length - 1].deel).toBe('klaar');
    const conclusie = samen.find((s) => s.deel === 'conclusie') as Rec;
    expect(conclusie.structuuronderdeelNaarBk).toMatch(/^niet gevonden/);
    expect(verzoeken.every((v) => v.sleutel === SLEUTEL && v.methode === 'GET')).toBe(true);
    expect(anderVerzoeken).toEqual([]);
  });
});

describe('stand kwalificaties: alleen veldnamen, geen codes', () => {
  it('geeft sterke velden voorrang op ruis en zegt "mogelijk" in plaats van "ja"', async () => {
    const u = await draai('namen');
    expect(u.code, u.stderr).toBe(0);
    const kwal = regelsMet(u.stdout, 'KWAL');
    const samen = regelsMet(u.stdout, 'KWAL-SAMENVATTING');
    const eerste = kwal.find((r) => r.stap === 'onderdeel-detail' && r.status === 200);
    expect(Object.keys(eerste?.relevant ?? {})).toContain('beroepskwalificaties');
    const conclusie = samen.find((s) => s.deel === 'conclusie') as Rec;
    expect(conclusie.structuuronderdeelNaarBk).toMatch(/^mogelijk/);
    expect(conclusie.bkNaarStructuuronderdeel).toMatch(/^mogelijk/);
    expect(conclusie.terugverwijzingBevestigd).toBe(false);
    expect(kwal.some((r) => r.stap === 'bk-detail-via-onderdeel')).toBe(false);
  });
});

describe('stand kwalificaties: veiligheid van de aanroep', () => {
  it('weigert zonder sleutel en doet geen enkel verzoek', async () => {
    const u = await draai('normaal', { ONDERWIJSDOELEN_API_KEY: undefined });
    expect(u.code).toBe(1);
    expect(u.stderr).toContain('ONDERWIJSDOELEN_API_KEY');
    expect(verzoeken).toHaveLength(0);
    expect(existsSync(rapportBestand())).toBe(false);
  });

  it('weigert een basisadres dat geen lokale testserver is, zodat de sleutel nooit elders heen gaat', async () => {
    for (const vreemd of ['https://example.org', 'http://example.org', 'http://127.0.0.1.example.org:8080', 'geen adres']) {
      const u = await draai('normaal', { VERKENNING_API_BASIS: vreemd });
      expect(u.code, vreemd).not.toBe(0);
      expect(u.stdout, vreemd).not.toContain('KWAL');
      expect(u.stdout + u.stderr).not.toContain(SLEUTEL);
      expect(verzoeken, vreemd).toHaveLength(0);
    }
  });
});

describe('stand kwalificaties: een geheim met witruimte of nieuwe regels', () => {
  const varianten: Array<[string, string]> = [
    ['een nieuwe regel op het einde', `${SLEUTEL}\n`],
    ['spaties aan beide kanten', `  ${SLEUTEL}  `],
    ['tab, CRLF en een nieuwe regel ervoor', `\n\t${SLEUTEL}\r\n`],
  ];

  it.each(varianten)('%s: de getrimde sleutel gaat in de kop en staat nergens in stdout, stderr of rapport', async (_naam, geheim) => {
    const u = await draai('normaal', { ONDERWIJSDOELEN_API_KEY: geheim });
    expect(u.code, u.stderr).toBe(0);
    // fetch stuurt de getrimde sleutel, en de nepserver geeft hem terug in een foutmelding (500) en in velden
    expect(verzoeken.length).toBeGreaterThan(15);
    expect(verzoeken.every((v) => v.sleutel === SLEUTEL)).toBe(true);
    expect(u.stdout).toContain('Interne fout bij <verborgen>');
    const bestand = readFileSync(rapportBestand(), 'utf8');
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(LANG_GEHEIM);
    }
    // één waarschuwing bij het opstarten, zonder de waarde
    expect(u.stderr).toContain('witruimte');
    expect(u.stderr.match(/Waarschuwing/g)).toHaveLength(1);
  });

  it('een geheim met meerdere regels: geen enkele regel komt in stdout, stderr of rapport, ook niet in de foutmelding van fetch', async () => {
    const tweede = 'andere-regel-5678';
    const u = await draai('normaal', { ONDERWIJSDOELEN_API_KEY: `${SLEUTEL}\n${tweede}\n` });
    // fetch weigert zo'n kop; het script loopt toch door en meldt het bij het opstarten
    expect(u.code, u.stderr).toBe(0);
    expect(verzoeken).toHaveLength(0);
    expect(u.stderr).toContain('meerdere regels');
    expect(regelsMet(u.stdout, 'KWAL').some((r) => typeof r.fout === 'string')).toBe(true);
    const bestand = readFileSync(rapportBestand(), 'utf8');
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(tweede);
    }
  });

  it('een geheim met alleen witruimte telt als ontbrekend', async () => {
    const u = await draai('normaal', { ONDERWIJSDOELEN_API_KEY: ' \n ' });
    expect(u.code).toBe(1);
    expect(u.stderr).toContain('ONDERWIJSDOELEN_API_KEY ontbreekt');
    expect(verzoeken).toHaveLength(0);
  });
});

describe('stand kwalificaties: de conclusie over een filter', () => {
  it('zegt "genegeerd" en nooit "werkt" als de server alle filters negeert en geen totaal of id geeft', async () => {
    const u = await draai('negeert');
    expect(u.code, u.stderr).toBe(0);
    const kwal = regelsMet(u.stdout, 'KWAL');
    const samen = regelsMet(u.stdout, 'KWAL-SAMENVATTING');
    const lijst = kwal.find((r) => r.stap === 'bk-lijst');
    expect(lijst?.totaal).toBeUndefined();
    expect(lijst?.idVeld).toBeNull(); // geen herkenbaar id
    const filters = kwal.filter((r) => r.stap === 'filter' && r.status === 200);
    expect(filters.length).toBeGreaterThanOrEqual(4);
    expect(filters.every((r) => r.filter.werking === 'genegeerd' && r.filter.vergeleken === 'lijst')).toBe(true);
    const samenvatting = samen.find((s) => s.deel === 'filters') as Rec;
    expect(samenvatting.werken).toEqual([]);
    expect(samenvatting.genegeerd.length).toBe(filters.length);
    expect((samen.find((s) => s.deel === 'conclusie') as Rec).werkendeFilters).toBe(0);
  });

  it('beslist alleen als de vergelijking kan: lengte en eerste element, anders "onbekend" (ook in de samenvatting)', async () => {
    const u = await draai('zondertotaal');
    expect(u.code, u.stderr).toBe(0);
    const kwal = regelsMet(u.stdout, 'KWAL');
    const filter = (naam: string) => kwal.find((r) => r.stap === 'filter' && r.filter?.naam === naam)?.filter;
    expect(filter('adv')).toEqual(expect.objectContaining({ werking: 'werkt', vergeleken: 'lijst', lengte: 1 }));
    expect(filter('structuuronderdeel')).toEqual(expect.objectContaining({ werking: 'werkt', vergeleken: 'lijst', lengte: 3 }));
    expect(filter('structuuronderdeel_nummer')).toEqual(expect.objectContaining({ werking: 'genegeerd', vergeleken: 'lijst' }));
    expect(filter('opleidingsinhoud')).toEqual(expect.objectContaining({ werking: 'onbekend', reden: 'geen totaal of lijst om mee te vergelijken' }));
    expect(filter('opleidingsinhoud')?.vergeleken).toBeUndefined();
    const samenvatting = regelsMet(u.stdout, 'KWAL-SAMENVATTING').find((s) => s.deel === 'filters') as Rec;
    expect(samenvatting.werken).toEqual(['structuuronderdeel', 'adv']);
    expect(samenvatting.genegeerd).toEqual(expect.arrayContaining(['structuuronderdeel_nummer', 'adv_nummer']));
    expect(samenvatting.onbekend).toEqual(['opleidingsinhoud:geen totaal of lijst om mee te vergelijken']);
    expect(samenvatting.fout).toEqual(['sector:404']);
  });
});

describe('stand kwalificaties: de lengte van een logboekregel', () => {
  it('houdt elke regel onder 8 KB en geldig, bij zeshonderd velden per element; het rapport houdt alles', async () => {
    const u = await draai('breed');
    expect(u.code, u.stderr).toBe(0);
    const regels = u.stdout.split('\n').filter(Boolean);
    for (const regel of regels) {
      expect(Buffer.byteLength(regel, 'utf8')).toBeLessThanOrEqual(MAX_REGEL);
      expect(() => JSON.parse(regel.slice(regel.indexOf('|') + 1))).not.toThrow();
    }
    const kwal = regelsMet(u.stdout, 'KWAL');
    const rapport = JSON.parse(readFileSync(rapportBestand(), 'utf8')) as { regels: Rec[] };
    expect(rapport.regels).toHaveLength(kwal.length);
    const ingekort = kwal.map((r, i) => ({ r, volledig: rapport.regels[i] })).filter((x) => x.r.ingekort === true);
    expect(ingekort.length).toBeGreaterThanOrEqual(2);
    // de lijst en de details met 600 velden zijn ingekort; het rapport heeft de volledige regel
    expect(ingekort.some((x) => x.r.stap === 'bk-lijst')).toBe(true);
    expect(ingekort.some((x) => x.r.stap === 'bk-detail')).toBe(true);
    const lijstLog = kwal.find((r) => r.stap === 'bk-lijst') as Rec;
    const lijstRapport = rapport.regels.find((r) => r.stap === 'bk-lijst') as Rec;
    expect(Object.keys(lijstRapport.velden).length).toBeGreaterThan(Object.keys(lijstLog.velden).length);
    expect(Object.keys(lijstRapport.itemVelden).length).toBeGreaterThan(200);
    expect(kwal.filter((r) => r.stap !== 'bk-lijst' && r.stap !== 'bk-detail' && r.stap !== 'onderdeel-detail').every((r) => r.ingekort === undefined)).toBe(true);
    for (const { r, volledig } of ingekort) {
      expect(volledig.ingekort).toBeUndefined();
      // eerst `proef`, pas daarna `velden`, `itemVelden` en `relevant`
      const aantal = (o: Rec | undefined) => Object.keys(o ?? {}).length;
      for (const veld of ['velden', 'itemVelden', 'relevant']) {
        if (aantal(r[veld]) < aantal(volledig[veld])) expect(aantal(r.proef), `${r.stap}: ${veld} is gekrompen, proef moest al weg zijn`).toBe(0);
      }
      // de kern van de regel blijft staan
      expect(r.stap).toBe(volledig.stap);
      expect(r.adres).toBe(volledig.adres);
      expect(r.status).toBe(volledig.status);
    }
    const bestand = readFileSync(rapportBestand(), 'utf8');
    for (const tekst of [u.stdout, u.stderr, bestand]) expect(tekst).not.toContain(SLEUTEL);
  });
});

describe('stand kwalificaties: het id van een element', () => {
  it('kiest het eigen nummer vóór een geneste code, en meldt in de regel van de lijst welk veld gekozen is', async () => {
    const u = await draai('ids');
    expect(u.code, u.stderr).toBe(0);
    const kwal = regelsMet(u.stdout, 'KWAL');
    const adressen = verzoeken.map((v) => v.url);
    // de BK's zijn bevraagd via het eigen nummer, niet via sector.code (X of Y)
    expect(adressen).toEqual(expect.arrayContaining([`${BK}/0001`, `${BK}/0002`, `${BK}/0003`]));
    expect(adressen).not.toContain(`${BK}/X`);
    expect(adressen).not.toContain(`${BK}/Y`);
    expect(kwal.find((r) => r.stap === 'bk-lijst')?.idVeld).toBe('beroepskwalificatie_nummer');
    const bk = regelsMet(u.stdout, 'KWAL-SAMENVATTING').find((s) => s.deel === 'bk') as Rec;
    expect(bk.idVeld).toBe('beroepskwalificatie_nummer');
    // hetzelfde voor de trajecten
    expect(adressen).toEqual(expect.arrayContaining([`${TRAJECT}/OT-1`, `${TRAJECT}/OT-2`]));
    expect(adressen).not.toContain(`${TRAJECT}/X`);
    expect(kwal.find((r) => r.stap === 'traject-lijst')?.idVeld).toBe('opleidingstraject_id');
  });
});

// ── Hulpfuncties van het script ─────────────────────────────────────────────

describe('hulpfuncties van het verkenningsscript', () => {
  const laad = async () => (await import(/* @vite-ignore */ pathToFileURL(SCRIPT).href)) as Record<string, any>;
  const VANDAAG = '2026-10-10';

  it('gebruikt zonder omgevingsvariabele de echte API', async () => {
    const bewaard = process.env.VERKENNING_API_BASIS;
    delete process.env.VERKENNING_API_BASIS;
    try {
      const m = await laad();
      expect(m.API).toBe('https://onderwijs.api.vlaanderen.be');
    } finally {
      if (bewaard !== undefined) process.env.VERKENNING_API_BASIS = bewaard;
    }
  });

  it('kiest uit de echte matrix vier onderdelen met arbeidsmarktfinaliteit en één met doorstroomfinaliteit', async () => {
    const m = await laad();
    const data = JSON.parse(readFileSync(MATRIX, 'utf8'));
    const k = m.kiesVoorbeelden(data, VANDAAG);
    expect(k.bron).toBe('repo');
    expect(k.arbeidsmarkt).toHaveLength(4);
    expect(new Set(k.arbeidsmarkt.map((x: Rec) => x.nr)).size).toBe(4);
    expect(k.arbeidsmarkt.every((x: Rec) => x.finaliteit === 'A')).toBe(true);
    const graden = new Set(k.arbeidsmarkt.map((x: Rec) => x.graad));
    expect(graden.has('2') && graden.has('3')).toBe(true);
    expect(k.arbeidsmarkt.filter((x: Rec) => x.duaal)).toHaveLength(1);
    expect(k.arbeidsmarkt.every((x: Rec) => /^ADV-\d+$/.test(x.adv))).toBe(true);
    expect(k.doorstroom).toHaveLength(1);
    expect(k.doorstroom[0].finaliteit).toBe('DO');
  });

  it('valt terug op vaste nummers zonder bruikbare matrix', async () => {
    const m = await laad();
    for (const kapot of [null, undefined, {}, { groepen: 'x', onderdelen: [] }]) {
      const k = m.kiesVoorbeelden(kapot, VANDAAG);
      expect(k.bron).toBe('vast');
      expect(k.arbeidsmarkt.map((x: Rec) => x.nr)).toEqual([1, 505, 564]);
      expect(k.doorstroom).toEqual([]);
    }
  });

  it('slaat afgebouwde onderdelen, aanloopjaren en onderdelen buiten het gewone voltijdse onderwijs over', async () => {
    const m = await laad();
    const onderdeel = (nummer: number, extra: Rec = {}) => ({ nummer, groep: 'G-1', titel: `Richting ${nummer}`, hoofdstructuren: ['311'], begindatum: '2020-09-01', ...extra });
    const data = {
      groepen: [{ nummer: 'G-1', titel: 'Groep', graad: '3', finaliteit: 'A' }],
      onderdelen: [
        onderdeel(1, { einddatum: '2025-08-31' }),
        onderdeel(2, { aanloop: true }),
        onderdeel(3, { hoofdstructuren: ['321'] }),
        onderdeel(4, { begindatum: '2030-09-01' }),
        onderdeel(5, {
          erkenningen: [
            { nummer: 'ADV-1', status: 'ERKEND', einddatum: '2024-08-31' },
            { nummer: 'ADV-2', status: 'ERKEND' },
          ],
        }),
      ],
    };
    const k = m.kiesVoorbeelden(data, VANDAAG);
    expect(k.arbeidsmarkt.map((x: Rec) => x.nr)).toEqual([5]);
    expect(k.arbeidsmarkt[0].adv).toBe('ADV-2');
    expect(k.doorstroom).toEqual([]);
  });

  it('snoeit een antwoord af op drie niveaus veldnamen, ook bij een veld __proto__', async () => {
    const m = await laad();
    const json = JSON.parse('{"__proto__": {"a": 1}, "b": {"c": {"d": {"e": 1}}}, "lijst": [{"x": {"y": {"z": {"w": 1}}}}]}');
    const paden = [...m.velden(m.snoei(json)).keys()] as string[];
    expect(paden).toEqual(expect.arrayContaining(['__proto__', 'b', 'b.c', 'b.c.d', 'lijst', 'lijst[]', 'lijst[].x', 'lijst[].x.y']));
    expect(paden).not.toContain('b.c.d.e');
    expect(paden).not.toContain('lijst[].x.y.z');
  });

  it('haalt de eigen sleutel uit elke tekst die schoon() passeert', async () => {
    const m = await laad();
    const bewaard = process.env.ONDERWIJSDOELEN_API_KEY;
    process.env.ONDERWIJSDOELEN_API_KEY = SLEUTEL;
    try {
      expect(m.schoon(`fout bij ${SLEUTEL}, nog eens ${encodeURIComponent(SLEUTEL)}`)).not.toContain(SLEUTEL);
      expect(m.schoon('gewone tekst blijft staan')).toBe('gewone tekst blijft staan');
    } finally {
      if (bewaard === undefined) delete process.env.ONDERWIJSDOELEN_API_KEY;
      else process.env.ONDERWIJSDOELEN_API_KEY = bewaard;
    }
  });

  it('haalt ook de getrimde sleutel en elke regel van een geheim met meerdere regels uit een tekst, in ruwe, JSON- en URL-vorm', async () => {
    const m = await laad();
    const bewaard = process.env.ONDERWIJSDOELEN_API_KEY;
    const een = 'eerste/regel=1234';
    const twee = 'tweede "regel" 5678';
    try {
      for (const geheim of [`${een}\n`, `  ${een} `, `\r\n${een}\t`, `${een}\n\n${twee}\r\n`]) {
        process.env.ONDERWIJSDOELEN_API_KEY = geheim;
        const delen = geheim.includes('regel" 5678') ? [een, twee] : [een];
        for (const deel of delen) {
          for (const vorm of [deel, JSON.stringify(deel).slice(1, -1), encodeURIComponent(deel)]) {
            expect(m.schoon(`x ${vorm} y`), JSON.stringify(geheim)).toBe('x <verborgen> y');
          }
          // in een regel staat de tekst JSON-geëscaped: ook dan blijft er niets van de sleutel over
          expect(m.maakRegel('T', { a: `x ${deel} y` }), JSON.stringify(geheim)).toBe('T|{"a":"x <verborgen> y"}');
        }
        expect(m.schoon('niets bijzonders')).toBe('niets bijzonders');
      }
      // een korte regel (minder dan 4 tekens) wordt niet gewist: dat zou gewone tekst slopen
      process.env.ONDERWIJSDOELEN_API_KEY = `${een}\nab`;
      expect(m.schoon('een tab en ab blijven staan')).toBe('een tab en ab blijven staan');
    } finally {
      if (bewaard === undefined) delete process.env.ONDERWIJSDOELEN_API_KEY;
      else process.env.ONDERWIJSDOELEN_API_KEY = bewaard;
    }
  });

  it('maakRegel: laat een korte regel ongemoeid en krimpt een lange regel tot geldige JSON van hoogstens de grens', async () => {
    const m = await laad();
    expect(m.maakRegel('KWAL', { stap: 'a', velden: { x: 'string' } })).toBe('KWAL|{"stap":"a","velden":{"x":"string"}}');
    const veld = (voor: string, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${voor}${i}`, 'string']));
    const groot = { stap: 'b', adres: '/x', status: 200, proef: veld('p', 150), velden: veld('v', 250), itemVelden: veld('i', 250), relevant: veld('r', 60), links: ['a'] };
    const regel: string = m.maakRegel('KWAL', groot);
    expect(Buffer.byteLength(regel, 'utf8')).toBeLessThanOrEqual(8 * 1024);
    const o = JSON.parse(regel.slice('KWAL|'.length));
    expect(o).toEqual(expect.objectContaining({ stap: 'b', adres: '/x', status: 200, ingekort: true, links: ['a'] }));
    // eerst `proef`: pas als die leeg is, gaat er iets van `velden`, `itemVelden` of `relevant` af
    expect(Object.keys(o.proef).length).toBe(0);
    expect(Object.keys(o.velden).length + Object.keys(o.itemVelden).length).toBeGreaterThan(0);
    // alleen `proef` te groot: de rest blijft heel
    const alleenProef = m.maakRegel('KWAL', { stap: 'c', proef: veld('p', 150), velden: veld('v', 20) }, 2000);
    const p = JSON.parse(alleenProef.slice('KWAL|'.length));
    expect(p.ingekort).toBe(true);
    expect(Object.keys(p.velden)).toHaveLength(20);
    expect(Object.keys(p.proef).length).toBeLessThan(150);
    // de grens geldt in bytes, ook met tekens van meerdere bytes
    const breed = m.maakRegel('KWAL', { stap: 'd', velden: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`\u00e9\u00e8\u00ea${i}`.repeat(4), 'string'])) });
    expect(Buffer.byteLength(breed, 'utf8')).toBeLessThanOrEqual(8 * 1024);
    expect(JSON.parse(breed.slice('KWAL|'.length)).ingekort).toBe(true);
    // niets te krimpen (een lange tekst): alleen de naam van de stap blijft over, nog steeds geldige JSON
    const rest = m.maakRegel('KWAL', { stap: 'e', tekst: 'x'.repeat(20_000) });
    expect(Buffer.byteLength(rest, 'utf8')).toBeLessThanOrEqual(8 * 1024);
    expect(JSON.parse(rest.slice('KWAL|'.length))).toEqual({ ingekort: true, fout: 'regel te lang', stap: 'e' });
  });

  it('idVan: velden van het element zelf gaan vóór geneste velden, in de volgorde van het antwoord', async () => {
    const m = await laad();
    const sector = { code: 'X' };
    expect(m.idVan({ sector, beroepskwalificatie_nummer: '0001' })).toEqual({ pad: 'beroepskwalificatie_nummer', waarde: '0001' });
    expect(m.idVan({ sector, beroepskwalificatie_nummer: '0001' }, /^BK-/)).toEqual({ pad: 'beroepskwalificatie_nummer', waarde: '0001' });
    expect(m.idVan({ sector, titel: 'Lasser', id: 7, nummer: 8 })).toEqual({ pad: 'id', waarde: '7' });
    // een waarde die bij het patroon past, gaat vóór een veld dat alleen een passende naam heeft; ook dan eerst het eigen veld
    expect(m.idVan({ sector: { code: 'BK-9' }, ref: 'BK-1', id: 3 }, /^BK-/)).toEqual({ pad: 'ref', waarde: 'BK-1' });
    // alleen geneste velden: die tellen wel mee, de diepste het laatst
    expect(m.idVan({ sector: { diep: { nr: 5 } }, andere: { id: 6 } })).toEqual({ pad: 'andere.id', waarde: '6' });
    expect(m.idVan({ titel: 'zonder id' })).toBeNull();
    expect(m.idVan([{ id: 1 }])).toBeNull();
  });
});
