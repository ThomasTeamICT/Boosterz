// Test voor de stand "dossier" (ronde 7) van tools/verkenning/verken-onderwijs-api.mjs (docs/ONDERWIJS-API.md § 5).
// Het script draait als apart Node-proces tegen een nagebootste http-API op 127.0.0.1, met een herkenbare nepsleutel
// en een kleine nagebootste matrix. Er gaat nooit een verzoek naar de echte API en het rapport komt in een tijdelijke
// map. Een tweede lokale server speelt "een andere host": die mag nooit een verzoek krijgen.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
/** Een herkenbare nepsleutel: ze mag nergens in de uitvoer of het rapport staan. */
const SLEUTEL = 'test-sleutel-1234';
/** Een sleutelvormige reeks (letters en cijfers) die een antwoord zelf meelevert. */
const LANG_GEHEIM = 'sk9Xq2LmZ7vB4nT8wR3yC6dF1hJ5aE0u';
/** Hoogstens zoveel bytes per logboekregel. */
const MAX_REGEL = 8 * 1024;
const KC = '/kwalificaties-en-curriculum';
/** De echte API-host, zoals het script zelf die kent als het geen nagebootste server meekrijgt (de hulpfuncties draaien in dit proces). */
const API_BASIS = 'https://onderwijs.api.vlaanderen.be';
const BK = `${KC}/beroepskwalificaties/v2/beroepskwalificatie`;
const SO = `${KC}/structuuronderdelen/v2/structuuronderdeel`;
const DETAIL = `${KC}/structuuronderdelen/v2/structuuronderdeel_detail`;
const EXTRA = `${KC}/extra/dossierdeel/42`;
const EXTRA_TWEEDE = `${KC}/extra/dossierdeel/43`;
const EXTRA_DERDE = `${KC}/extra/dossierdeel/99`;
const PDF_GEHEIM = 'PDF-GEHEIM-INHOUD';

// De drie onderdelen die de nagebootste matrix oplevert, en wat de server als dossier terugstuurt.
const ADV_A = 'ADV-0102';
const ADV_DU = 'ADV-0201';
const ADV_DO = 'ADV-0301';
const LANG_TEKST = 'lange tekst '.repeat(200);
const MIDDEL_TEKST = 'middel '.repeat(200);

type Rec = Record<string, any>;
type Uitkomst = { code: number; stdout: string; stderr: string };
type Verzoek = { methode: string; url: string; sleutel: string | undefined };
type Scenario = 'normaal' | 'breed' | 'kapot' | 'leeg' | 'bk-vreemd';
type Dossier = 'json' | 'pdf' | 'html' | '404' | 'doorverwijzing' | 'pdf-tekst' | 'pdf-zonder-type' | 'tekst' | 'tekst-zonder-type' | 'json-vijandig' | 'json-tweede';
type Opties = { scenario?: Scenario; dossier?: Record<string, Dossier>; matrix?: string; env?: Record<string, string | undefined> };

let TMP = '';
let MATRIX = '';
let MATRIX_ZONDER_DU = '';
let server: Server;
let ander: Server;
let basis = '';
let anderBasis = '';
let scenario: Scenario = 'normaal';
let dossierPer: Record<string, Dossier> = {};
let verzoeken: Verzoek[] = [];
let anderVerzoeken: string[] = [];

const STANDAARD: Record<string, Dossier> = { [ADV_A]: 'json', [ADV_DU]: 'pdf', [ADV_DO]: 'html' };

// ── De nagebootste matrix ───────────────────────────────────────────────────

const onderdeel = (nummer: number, groep: string, extra: Rec = {}): Rec => ({
  nummer,
  groep,
  titel: `Richting ${nummer}`,
  hoofdstructuren: ['311'],
  begindatum: '2020-09-01',
  erkenningen: [{ nummer: `ADV-${String(nummer).padStart(4, '0')}`, status: 'ERKEND', begindatum: '2020-09-01' }],
  ...extra,
});

const GROEPEN = [
  { nummer: 'G-1', titel: 'Bouw', graad: '3', finaliteit: 'A' },
  { nummer: 'G-2', titel: 'Hout', graad: '2', finaliteit: 'A' },
  { nummer: 'G-3', titel: 'Zorg', graad: '3', finaliteit: 'DU' },
  { nummer: 'G-4', titel: 'Wetenschappen', graad: '3', finaliteit: 'DO' },
];
const erkenning = (nummer: string, begindatum: string, extra: Rec = {}) => ({ nummer, status: 'ERKEND', begindatum, ...extra });
const ONDERDELEN: Rec[] = [
  // vijf onderdelen die niet mogen: aanloopjaar, afgebouwd, andere hoofdstructuur, nog niet begonnen, duaal
  onderdeel(1, 'G-1', { aanloop: true }),
  onderdeel(2, 'G-1', { einddatum: '2024-08-31' }),
  onderdeel(3, 'G-1', { hoofdstructuren: ['321'] }),
  onderdeel(4, 'G-1', { begindatum: '2999-09-01' }),
  onderdeel(5, 'G-1', { duaal: true }),
  // A in de 2de graad komt na A in de 3de graad
  onderdeel(10, 'G-2'),
  // het nieuwste ADV dat vandaag geldt is ADV-0102 (niet het afgelopen, niet het toekomstige, niet het oudere)
  onderdeel(11, 'G-1', {
    erkenningen: [erkenning('ADV-0102', '2020-09-01'), erkenning('ADV-0101', '2017-09-01', { einddatum: '2024-08-31' }), erkenning('ADV-0103', '2999-09-01'), erkenning('ADV-0100', '2018-09-01')],
  }),
  onderdeel(21, 'G-3', { erkenningen: [erkenning(ADV_DU, '2020-09-01')] }),
  onderdeel(31, 'G-4', { erkenningen: [erkenning(ADV_DO, '2020-09-01')] }),
];

// ── De nagebootste API ──────────────────────────────────────────────────────

function stuur(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

/** Scenario "breed": driehonderd extra velden, zodat de veldnamen over meer regels verdeeld moeten worden. */
const ruis = (n = 300): Rec => (scenario === 'breed' ? Object.fromEntries(Array.from({ length: n }, (_, i) => [`ruisveld_${String(i).padStart(3, '0')}`, `waarde ${i} van het ruisveld`])) : {});

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0xe2, 0xe3, 0xcf, 0xd3, 0x00, 0x01, 0x02]), Buffer.from(`${PDF_GEHEIM} ${SLEUTEL} ${LANG_GEHEIM}`)]);

/** Een pdf zonder 0-byte en zonder %PDF- op byte 0: een regeleinde ervoor, alleen ASCII, met titel, auteur en codes erin. */
const PDF_TEKST = Buffer.from(`\r\n%PDF-1.4\n1 0 obj << /Title (${PDF_GEHEIM}) /Author (GEHEIM-AUTEUR) >> endobj\n(ODS_PDF_GEHEIM BK-9999-9 ADV-9999 ${SLEUTEL})\n%%EOF\n`);

function dossierAntwoord(adv: string, res: ServerResponse) {
  if (scenario === 'leeg') return stuur(res, 200, '', 'application/json');
  const soort = dossierPer[adv] ?? '404';
  if (soort === 'pdf') return stuur(res, 200, PDF, 'application/pdf');
  // een pdf met een verkeerd of ontbrekend content-type, zodat alleen de bytes het verraden
  if (soort === 'pdf-tekst') return stuur(res, 200, PDF_TEKST, 'text/plain');
  if (soort === 'pdf-zonder-type') {
    res.writeHead(200);
    return res.end(PDF_TEKST);
  }
  if (soort === 'tekst') return stuur(res, 200, 'Gewone tekst over het dossier.', 'text/plain; charset=utf-8');
  if (soort === 'tekst-zonder-type') {
    res.writeHead(200);
    return res.end('Gewone tekst zonder content-type.');
  }
  // links die het script niet mag volgen, vóór de enige die wel mag; daarna nog een tweede die mag maar over de grens gaat
  if (soort === 'json-vijandig') {
    return stuur(res, 200, {
      titel: 'Dossier met lastige links',
      links: [
        `${basis}/logout`,
        `${basis}/p/prive/x`,
        `${basis}${KC}/../../etc/passwd`,
        `${basis}${KC}/extra/../dossierdeel/42`,
        `${basis}${KC}/extra%2f..%2fdossierdeel/42`,
        `${basis}${KC}/%2e%2e/%2E%2e/etc/passwd`,
        `${basis}${EXTRA}?x=1`,
        `${basis}${EXTRA_DERDE}`,
      ],
      relatief: ['/logout', `${KC}/../../etc/passwd`],
    });
  }
  if (soort === 'json-tweede') return stuur(res, 200, { titel: 'Tweede dossier', links: [`${basis}${EXTRA_TWEEDE}`] });
  if (soort === 'html') {
    return stuur(
      res,
      200,
      `<!doctype html><html><head><title>Curriculumdossier\n  Bouw</title></head><body>Zie <a href="https://dossier.example.org/prive/pad?id=7">dossier</a>, <a href="${basis}${DETAIL}/${adv}">detail</a> en BK-0390-2, ODS_HTML_1 en de eindtermen. ${SLEUTEL}</body></html>`,
      'text/html; charset=utf-8',
    );
  }
  if (soort === 'doorverwijzing') {
    res.writeHead(302, { location: `${anderBasis}/doorverwezen/geheim` });
    return res.end();
  }
  if (soort === '404') return stuur(res, 404, { message: 'Er werd geen data gevonden.' });
  return stuur(res, 200, {
    titel: 'Curriculumdossier Bouw',
    versie: '1',
    onderwijsdoelen: [{ set: 'ODS_ABC_123', omschrijving: 'Eindtermen basisvorming' }],
    kwalificaties: [{ code: 'BK-0390-2', titel: 'Onthaalmedewerker' }],
    links: [
      { rel: 'self', href: `${basis}${DETAIL}/${adv}/curriculumdossier?token=abc` },
      { rel: 'extra', href: `${basis}${EXTRA}?x=1` },
      { rel: 'bron', href: `${anderBasis}/geheim-pad/dossier.pdf?token=zzz` },
      { rel: 'website', href: 'https://www.onderwijs.vlaanderen.be/nl/curriculumdossier-privepad?id=7' },
    ],
    opmerking: `Aangemeld met ${SLEUTEL} en token ${LANG_GEHEIM}`,
    ...ruis(450), // meer dan de 400 velden die per antwoord gemeld worden
  });
}

const bkDetail1 = () => ({
  beroepskwalificatie: {
    titel: 'Lasser',
    vks_niveau: 3,
    status: 'ERKEND',
    competenties: [
      {
        competentie_type: 'Kerntaak',
        nr: 1,
        competentie_code: 'bkc0000001',
        waarde: 'Lassen met de hand',
        kennis: [{ kennis_code: 'k1', waarde: LANG_TEKST, niveau: { code: 'N1', omschrijving: 'Basis' }, ...ruis(100) }],
        vaardigheden: [],
        referenties: [{ type: 'ISCO', code: '7212', omschrijving: 'Lassers' }],
      },
      { competentie_type: 'Kerntaak', nr: 2, competentie_code: 'bkc0000002', waarde: MIDDEL_TEKST, kennis: [], vaardigheden: [{ vaardigheid_code: 'v1', waarde: 'Kan lassen' }], referenties: [] },
      { competentie_type: 'Generiek', nr: 3, competentie_code: 'bkc0000003', waarde: scenario === 'breed' ? 'woord '.repeat(4000) : 'Veilig werken', kennis: [{ kennis_code: 'k3', waarde: 'Veiligheid' }], vaardigheden: [], referenties: [] },
    ],
  },
  opmerking: `Aangemeld met ${SLEUTEL} en token ${LANG_GEHEIM}`,
});

const bkDetail2 = () => ({
  beroepskwalificatie: {
    titel: 'Kok',
    competenties: [
      { competentie_type: { code: 'Kerntaak', omschrijving: 'Kerntaak' }, competentie_code: 'bkc0000002', waarde: 'Koken', kennis: ['Kennis van hygiëne'], vaardigheden: [], referenties: [] },
      { competentie_type: { code: 'Generiek' }, competentie_code: 'bkc0000009', waarde: 'Samenwerken', kennis: [], vaardigheden: [{ vaardigheid_code: 'v9', waarde: 'Kan samenwerken' }], referenties: [] },
    ],
  },
});

const onderdeelA = () => ({
  structuuronderdeel_nummer: 11,
  titel: 'Bouw',
  structuuronderdeel_details: [
    {
      structuuronderdeel_detail_nummer: 'ADV-0100',
      beroepskwalificaties: [
        // versie_nr_lang die geen BK-versie is: nooit in een pad (`..` en `.` zouden de lijst zelf opvragen)
        ...(scenario === 'bk-vreemd' ? ['..', '.', 'abc', '../x', 'BK-12', 'BK-1-2/3'].map((lang) => ({ beroepskwalificatie_nr: 'BK-X', versie_nr_lang: lang, titel: 'Vreemd' })) : []),
        // api_url naar een andere host: mag nooit gevolgd worden
        { beroepskwalificatie_nr: 'BK-0001', versie_nr_kort: '1', versie_nr_lang: 'BK-0001-1', titel: 'Lasser', api_url: `${anderBasis}/bk/BK-0001-1` },
        { beroepskwalificatie_nr: 'BK-0002', versie_nr_kort: '3', versie_nr_lang: 'BK-0002-3', titel: 'Kok', api_url: `${basis}${BK}/BK-0002-3` },
        { beroepskwalificatie_nr: 'BK-0003', versie_nr_kort: '1', versie_nr_lang: 'BK-0003-1', titel: 'Bakker' },
      ],
      studiebekrachtigingen: [
        { onderwijskwalificatie: true, uitgebreide_naam: 'Diploma secundair onderwijs', beroepskwalificatie: { versie_nr_lang: 'BK-0001-1', titel: 'Lasser' } },
        { onderwijskwalificatie: false, uitgebreide_naam: 'Deelkwalificatie', deelkwalificatie: 'BK-0130-5-DBK-01' },
        { onderwijskwalificatie: true, uitgebreide_naam: 'Tweede diploma', beroepskwalificatie: { versie_nr_lang: 'BK-0002-3', titel: 'Kok' } },
      ],
    },
    {
      structuuronderdeel_detail_nummer: ADV_A,
      beroepskwalificaties: [{ beroepskwalificatie_nr: 'BK-0001', versie_nr_kort: '1', versie_nr_lang: 'BK-0001-1', titel: 'Lasser' }],
      studiebekrachtigingen: [
        { onderwijskwalificatie: true, uitgebreide_naam: 'Diploma', beroepskwalificatie: { versie_nr_lang: 'BK-0001-1', titel: 'Lasser' } },
        { uitgebreide_naam: 'Zonder vlag' },
      ],
    },
  ],
  ...ruis(),
});

function antwoord(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', basis);
  verzoeken.push({ methode: req.method || '?', url: `${url.pathname}${url.search}`, sleutel: req.headers['x-api-key'] as string | undefined });
  if (scenario === 'kapot') return stuur(res, 500, `Fout ${SLEUTEL} ${LANG_GEHEIM}`, 'text/plain');
  const p = url.pathname;
  const dossierMatch = new RegExp(`^${DETAIL}/(ADV-\\d+)/curriculumdossier$`).exec(p);
  if (dossierMatch) return dossierAntwoord(dossierMatch[1], res);
  const detailMatch = new RegExp(`^${DETAIL}/(ADV-\\d+)$`).exec(p);
  if (detailMatch) {
    if (scenario === 'leeg') return stuur(res, 200, {});
    return stuur(res, 200, {
      structuuronderdeel_detail_nummer: detailMatch[1],
      status: 'ERKEND',
      curriculumdossier: `${basis}${DETAIL}/${detailMatch[1]}/curriculumdossier`,
      notitie: `sleutel ${SLEUTEL} en ${LANG_GEHEIM}`,
      // de sleutel als veldnaam: ook die gaat niet mee naar buiten
      [SLEUTEL]: 'veldnaam is de sleutel',
      ...ruis(),
    });
  }
  const so = new RegExp(`^${SO}/(\\d+)$`).exec(p);
  if (so) {
    if (scenario === 'leeg') return stuur(res, 200, {});
    if (so[1] === '11') return stuur(res, 200, onderdeelA());
    return stuur(res, 200, { structuuronderdeel_nummer: Number(so[1]), structuuronderdeel_details: [] });
  }
  if (p === `${BK}/BK-0001-1`) return stuur(res, 200, bkDetail1());
  if (p === `${BK}/BK-0002-3`) return stuur(res, 200, bkDetail2());
  if (p === EXTRA || p === EXTRA_TWEEDE || p === EXTRA_DERDE) return stuur(res, 200, { onderdeel: 'extra', ok: true });
  return stuur(res, 404, { message: 'Er werd geen data gevonden.' });
}

// ── Het script draaien ──────────────────────────────────────────────────────

function draai(o: Opties = {}): Promise<Uitkomst> {
  scenario = o.scenario ?? 'normaal';
  dossierPer = o.dossier ?? { ...STANDAARD };
  verzoeken = [];
  anderVerzoeken = [];
  rmSync(rapportBestand(), { force: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_PROXY: '127.0.0.1,localhost',
    ONDERWIJSDOELEN_WACHT_FACTOR: '0',
    VERKENNING_UIT: TMP,
    VERKENNING_API_BASIS: basis,
    VERKENNING_STRUCTUUR: o.matrix ?? MATRIX,
    ONDERWIJSDOELEN_API_KEY: SLEUTEL,
  };
  for (const [k, v] of Object.entries(o.env ?? {})) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return new Promise((klaar) => {
    execFile(process.execPath, [SCRIPT, '--dossier'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (fout, stdout, stderr) => {
      const code = fout ? (typeof (fout as { code?: unknown }).code === 'number' ? (fout as { code: number }).code : 1) : 0;
      klaar({ code, stdout, stderr });
    });
  });
}

const regelsMet = (stdout: string, voorvoegsel: string): Rec[] =>
  stdout
    .split('\n')
    .filter((l) => l.startsWith(`${voorvoegsel}|`))
    .map((l) => JSON.parse(l.slice(voorvoegsel.length + 1)) as Rec);

const rapportBestand = () => join(TMP, 'dossier.json');
const leesRapport = () => JSON.parse(readFileSync(rapportBestand(), 'utf8')) as Rec;
/** De hoofdregel van een oproep (niet de regels met veldnamen of verwijzingen). */
const hoofd = (regels: Rec[], stap: string, adres?: string) => regels.find((r) => r.stap === stap && r.deel === undefined && (adres === undefined || r.adres === adres));
const geldigeRegels = (stdout: string) => {
  for (const regel of stdout.split('\n').filter(Boolean)) {
    expect(Buffer.byteLength(regel, 'utf8'), regel.slice(0, 80)).toBeLessThanOrEqual(MAX_REGEL);
    expect(() => JSON.parse(regel.slice(regel.indexOf('|') + 1)), regel.slice(0, 80)).not.toThrow();
  }
};

beforeAll(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'verken-dossier-'));
  MATRIX = join(TMP, 'matrix.json');
  MATRIX_ZONDER_DU = join(TMP, 'matrix-zonder-du.json');
  writeFileSync(MATRIX, JSON.stringify({ groepen: GROEPEN, onderdelen: ONDERDELEN }));
  writeFileSync(MATRIX_ZONDER_DU, JSON.stringify({ groepen: GROEPEN, onderdelen: ONDERDELEN.filter((o) => o.nummer !== 21) }));
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

describe('stand dossier: een gewone run (json, pdf en html)', () => {
  let u: Uitkomst;
  let regels: Rec[];
  let samen: Rec[];
  let gezien: Verzoek[];
  let gezienAnder: string[];
  let bestand: string;

  beforeAll(async () => {
    u = await draai();
    regels = regelsMet(u.stdout, 'DOSSIER');
    samen = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING');
    gezien = [...verzoeken];
    gezienAnder = [...anderVerzoeken];
    bestand = existsSync(rapportBestand()) ? readFileSync(rapportBestand(), 'utf8') : '';
  });

  it('loopt door zonder te crashen en sluit af met een samenvatting', () => {
    expect(u.code, u.stderr).toBe(0);
    expect(u.stderr).toBe(''); // een gewone sleutel geeft geen waarschuwing
    expect(samen.map((s) => s.deel)).toEqual(['dossiers', 'bk', 'studiebekrachtigingen', 'conclusie', 'klaar']);
    expect(samen[samen.length - 1]).toEqual({ deel: 'klaar', oproepen: gezien.length, maxOproepen: 30 });
  });

  it('houdt elke logboekregel onder 8 KB en geldige JSON', () => {
    const alle = u.stdout.split('\n').filter(Boolean);
    expect(alle.every((l) => l.startsWith('DOSSIER|') || l.startsWith('DOSSIER-SAMENVATTING|'))).toBe(true);
    geldigeRegels(u.stdout);
    expect(regels.length).toBeGreaterThan(15);
  });

  it('doet hoogstens 30 oproepen: alleen GET, elk adres één keer, alleen naar de eigen server', () => {
    // drie keer detail en dossier (6), het eigen pad uit het dossier (1), het onderdeel (1) en twee beroepskwalificaties (2)
    expect(gezien.map((v) => v.url).sort()).toEqual(
      [
        `${DETAIL}/${ADV_A}`,
        `${DETAIL}/${ADV_A}/curriculumdossier`,
        EXTRA,
        `${DETAIL}/${ADV_DU}`,
        `${DETAIL}/${ADV_DU}/curriculumdossier`,
        `${DETAIL}/${ADV_DO}`,
        `${DETAIL}/${ADV_DO}/curriculumdossier`,
        `${SO}/11`,
        `${BK}/BK-0001-1`,
        `${BK}/BK-0002-3`,
      ].sort(),
    );
    expect(gezien.every((v) => v.methode === 'GET')).toBe(true);
    expect(new Set(gezien.map((v) => v.url)).size).toBe(gezien.length);
  });

  it('stuurt de sleutel alleen naar de eigen server en volgt geen link naar een andere host', () => {
    expect(gezien.every((v) => v.sleutel === SLEUTEL)).toBe(true);
    expect(gezienAnder).toEqual([]);
    // de beroepskwalificatie met een api_url naar de andere host is via het eigen pad gevraagd
    expect(gezien.some((v) => v.url === `${BK}/BK-0001-1`)).toBe(true);
  });

  it('toont de nepsleutel en sleutelvormige reeksen nergens, ook niet in het rapportbestand', () => {
    expect(bestand).not.toBe('');
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(LANG_GEHEIM);
    }
    expect(u.stdout).toContain('<verborgen>');
  });

  it('kiest per finaliteit het nieuwste ADV-nummer dat vandaag geldt', () => {
    const v = hoofd(regels, 'voorbeelden') as Rec;
    expect(v.bron).toBe('repo');
    expect(v.ontbreekt).toEqual([]);
    expect(v.onderdelen.map((o: Rec) => [o.finaliteit, o.nr, o.adv, o.advGeldig, o.graad, o.duaal])).toEqual([
      ['A', 11, ADV_A, true, '3', false],
      ['DU', 21, ADV_DU, true, '3', false],
      ['DO', 31, ADV_DO, true, '3', false],
    ]);
    expect(v.bk).toEqual({ nr: 11, vast: false });
  });

  it('beschrijft een JSON-dossier: soort, grootte, veldnamen met proef, verwijzingen en adressen (pad of host)', () => {
    const adres = `${DETAIL}/${ADV_A}/curriculumdossier`;
    const d = hoofd(regels, 'dossier', adres) as Rec;
    expect(d).toEqual(expect.objectContaining({ status: 200, soort: 'json', contentType: 'application/json', adv: ADV_A, finaliteit: 'A' }));
    expect(d.grootte).toBeGreaterThan(100);
    expect(d.wortel).toEqual(expect.arrayContaining(['titel', 'onderwijsdoelen', 'kwalificaties', 'links']));
    // het ADV-nummer staat in het pad van de eigen link
    expect(d.verwijst).toEqual({ onderwijsdoelen: true, bk: true, adv: true, apiPaden: 2, andereHosts: 2 });

    const velden = regels.filter((r) => r.stap === 'dossier' && r.deel === 'velden' && r.adres === adres).reduce<Rec>((acc, r) => ({ ...acc, ...r.velden }), {});
    expect(velden['onderwijsdoelen[].set']).toBe('string ODS_ABC_123');
    expect(velden['links[].href']).toMatch(/^string http/);
    expect(velden.titel).toBe('string Curriculumdossier Bouw');
    expect(velden.onderwijsdoelen).toMatch(/^array \[1\]/);

    const v = regels.find((r) => r.stap === 'dossier' && r.deel === 'verwijzingen' && r.adres === adres) as Rec;
    expect(v.ods).toEqual([{ code: 'ODS_ABC_123', veld: 'onderwijsdoelen[].set' }]);
    expect(Object.keys(v.doelVelden)).toEqual(['onderwijsdoelen']);
    expect(v.doelWoorden.eindterm.aantal).toBeGreaterThan(0);
    expect(v.bk).toEqual([{ code: 'BK-0390-2', veld: 'kwalificaties[].code' }]);
    // op de eigen API-host alleen het pad zonder query, bij een andere host alleen de host
    expect(v.api.map((a: Rec) => a.pad)).toEqual([`${DETAIL}/${ADV_A}/curriculumdossier`, EXTRA]);
    expect(v.andere.map((a: Rec) => a.host).sort()).toEqual([new URL(anderBasis).host, 'www.onderwijs.vlaanderen.be'].sort());
    for (const verboden of ['token=abc', 'token=zzz', 'x=1', '/geheim-pad', 'dossier.pdf', 'curriculumdossier-privepad', 'id=7']) {
      expect(u.stdout, verboden).not.toContain(verboden);
      expect(bestand, verboden).not.toContain(verboden);
    }
  });

  it('volgt het eigen API-pad uit het dossier precies één keer en geen ander adres', () => {
    expect(gezien.filter((v) => v.url === EXTRA)).toHaveLength(1); // zonder de query
    const eigen = hoofd(regels, 'dossier-pad') as Rec;
    expect(eigen).toEqual(expect.objectContaining({ adres: EXTRA, status: 200, soort: 'json', adv: ADV_A, via: 'curriculumdossier' }));
    // de html-pagina verwijst naar het detail dat al opgehaald was: niet nog eens
    expect(regels.filter((r) => r.stap === 'dossier-pad' && r.deel === undefined)).toHaveLength(1);
    expect(gezien.filter((v) => v.url === `${DETAIL}/${ADV_DO}`)).toHaveLength(1);
  });

  it('bewaart en logt een pdf niet: alleen type en grootte', () => {
    const adres = `${DETAIL}/${ADV_DU}/curriculumdossier`;
    const d = hoofd(regels, 'dossier', adres) as Rec;
    expect(d).toEqual({ stap: 'dossier', adres, adv: ADV_DU, finaliteit: 'DU', onderdeel: 21, status: 200, contentType: 'application/pdf', grootte: PDF.length, soort: 'pdf' });
    expect(regels.filter((r) => r.adres === adres && r.deel !== undefined)).toEqual([]); // geen veldnamen, geen verwijzingen
    const inRapport = leesRapport().regels.find((r: Rec) => r.stap === 'dossier' && r.adres === adres) as Rec;
    expect(Object.keys(inRapport).sort()).toEqual(['adres', 'adv', 'contentType', 'finaliteit', 'grootte', 'onderdeel', 'soort', 'stap', 'status']);
    for (const tekst of [u.stdout, bestand]) {
      expect(tekst).not.toContain(PDF_GEHEIM);
      expect(tekst).not.toContain('%PDF');
    }
    expect(bestand).not.toContain('\\u0000');
  });

  it('beschrijft een html-dossier met zijn titel, en een nieuwe regel in de titel valt weg', () => {
    const d = hoofd(regels, 'dossier', `${DETAIL}/${ADV_DO}/curriculumdossier`) as Rec;
    expect(d).toEqual(expect.objectContaining({ status: 200, soort: 'html', titel: 'Curriculumdossier Bouw', contentType: 'text/html; charset=utf-8' }));
    expect(d.verwijst).toEqual(expect.objectContaining({ onderwijsdoelen: true, bk: true, andereHosts: 1 }));
    expect(d.velden).toBeUndefined();
    expect(u.stdout).not.toContain('dossier.example.org/prive');
    expect(u.stdout).toContain('dossier.example.org');
  });

  it('beschrijft de volledige vorm van twee beroepskwalificaties: competenties per type, codes en langste waarde', () => {
    const a = hoofd(regels, 'bk', `${BK}/BK-0001-1`) as Rec;
    expect(a.competenties).toEqual({
      veld: 'beroepskwalificatie.competenties',
      aantal: 3,
      perType: { Kerntaak: 2, Generiek: 1 },
      aantalCodes: 3,
      uniekeCodes: 3,
      langsteWaarde: MIDDEL_TEKST.length,
      langsteWaardeOveral: { lengte: LANG_TEKST.length, veld: 'beroepskwalificatie.competenties[].kennis[].waarde' },
    });
    expect(a.aantallen).toEqual([
      { kennis: 1, vaardigheden: 0, referenties: 1 },
      { kennis: 0, vaardigheden: 1, referenties: 0 },
    ]);
    expect(Object.keys(a.competentieVelden)).toEqual(expect.arrayContaining(['competentie_type', 'competentie_code', 'waarde', 'kennis', 'vaardigheden', 'referenties']));
    const b = hoofd(regels, 'bk', `${BK}/BK-0002-3`) as Rec;
    // het type kan ook een object zijn
    expect(b.competenties.perType).toEqual({ Kerntaak: 1, Generiek: 1 });
    expect(b.competenties.aantal).toBe(2);
    // de oproepen zelf: status, grootte en veldnamen tot drie niveaus
    expect(hoofd(regels, 'bk-detail', `${BK}/BK-0001-1`)).toEqual(expect.objectContaining({ status: 200, soort: 'json', versie: 'BK-0001-1', via: 'versie_nr_lang', erkenning: 'ADV-0100' }));
    const velden = regels.filter((r) => r.stap === 'bk-detail' && r.deel === 'velden' && r.adres === `${BK}/BK-0001-1`).reduce<Rec>((acc, r) => ({ ...acc, ...r.velden }), {});
    expect(velden['beroepskwalificatie.competenties[].competentie_code']).toBe('string bkc0000001');
  });

  it('geeft per competentie de volledige vorm van één element van kennis, vaardigheden en referenties', () => {
    const vorm = (versie: string, element: string) => regels.find((r) => r.stap === 'bk-vorm' && r.versie === versie && r.element === element) as Rec;
    const kennis = vorm('BK-0001-1', 'kennis');
    expect(kennis).toEqual(expect.objectContaining({ uitCompetentie: 0, aantalInCompetentie: 1, type: 'object' }));
    expect(Object.keys(kennis.velden)).toEqual(['kennis_code', 'waarde', 'niveau', 'niveau.code', 'niveau.omschrijving']);
    expect(kennis.velden.niveau).toBe('object {2}');
    expect(kennis.velden.waarde).toMatch(/^string lange tekst lange tekst/);
    expect(kennis.proef.waarde.length).toBeLessThanOrEqual(200);
    // kennis is leeg bij de tweede competentie, maar de vaardigheden komen daar vandaan
    expect(vorm('BK-0001-1', 'vaardigheden')).toEqual(expect.objectContaining({ uitCompetentie: 1, type: 'object' }));
    expect(Object.keys(vorm('BK-0001-1', 'referenties').velden)).toEqual(['type', 'code', 'omschrijving']);
    // een element kan ook gewone tekst zijn
    expect(vorm('BK-0002-3', 'kennis')).toEqual(expect.objectContaining({ type: 'string', lengte: 'Kennis van hygiëne'.length, proef: 'Kennis van hygiëne' }));
    expect(vorm('BK-0002-3', 'referenties')).toEqual(expect.objectContaining({ geen: 'geen element in de eerste twee competenties' }));
  });

  it('vergelijkt de competentie_codes van de twee beroepskwalificaties', () => {
    const v = hoofd(regels, 'bk-vergelijking') as Rec;
    expect(v).toEqual({ stap: 'bk-vergelijking', versies: ['BK-0001-1', 'BK-0002-3'], gedeeld: 1, voorbeelden: ['bkc0000002'], uniek: [3, 2] });
    const conclusie = samen.find((s) => s.deel === 'conclusie') as Rec;
    expect(conclusie.gedeeldeCompetentieCodes).toBe(1);
  });

  it('telt de studiebekrachtigingen van het onderdeel en geeft de vorm van een eerste en een afwijkend element', () => {
    const s = hoofd(regels, 'studiebekrachtigingen') as Rec;
    expect(s.adres).toBe(`${SO}/11`);
    expect(s.totaal).toBe(5);
    expect(s.arrays).toEqual([{ veld: 'structuuronderdeel_details[].studiebekrachtigingen', aantal: 5 }]);
    expect(s.onderwijskwalificatie).toEqual({ waar: 3, onwaar: 1, anders: 0, ontbreekt: 1 });
    const eerste = regels.find((r) => r.stap === 'studiebekrachtiging-vorm' && r.welke === 'eerste') as Rec;
    expect(Object.keys(eerste.velden)).toEqual(['onderwijskwalificatie', 'uitgebreide_naam', 'beroepskwalificatie', 'beroepskwalificatie.versie_nr_lang', 'beroepskwalificatie.titel']);
    expect(eerste.velden.onderwijskwalificatie).toBe('boolean true');
    const afwijkend = regels.find((r) => r.stap === 'studiebekrachtiging-vorm' && r.welke === 'afwijkend') as Rec;
    expect(Object.keys(afwijkend.velden)).toEqual(['onderwijskwalificatie', 'uitgebreide_naam', 'deelkwalificatie']);
    expect(afwijkend.proef.deelkwalificatie).toBe('BK-0130-5-DBK-01');
  });

  it('vat samen: het soort dossier, de verwijzingen en de vorm van een competentie', () => {
    const c = samen.find((s) => s.deel === 'conclusie') as Rec;
    expect(c.dossier).toEqual({
      algemeen: 'gemengd',
      per: [
        { adv: ADV_A, soort: 'json' },
        { adv: ADV_DU, soort: 'pdf' },
        { adv: ADV_DO, soort: 'html' },
      ],
    });
    expect(c.verwijstNaarOnderwijsdoelen).toBe('ja');
    expect(c.verwijstNaarBk).toBe('ja');
    expect(c.eigenApiPad).toEqual([{ adv: ADV_A, status: 200, soort: 'json' }]);
    expect(c.competentie).toEqual(
      expect.objectContaining({ versie: 'BK-0001-1', types: ['Kerntaak', 'Generiek'], langsteWaarde: LANG_TEKST.length, vaardigheden: expect.arrayContaining(['vaardigheid_code', 'waarde']) }),
    );
    expect(c.competentie.kennis).toEqual(['kennis_code', 'waarde', 'niveau', 'niveau.code', 'niveau.omschrijving']);
    expect(c.studiebekrachtigingen).toEqual({ totaal: 5, onderwijskwalificatie: 3 });
    const dossiers = samen.find((s) => s.deel === 'dossiers') as Rec;
    expect(dossiers.lijst.map((d: Rec) => [d.adv, d.dossier.soort, d.dossier.status])).toEqual([
      [ADV_A, 'json', 200],
      [ADV_DU, 'pdf', 200],
      [ADV_DO, 'html', 200],
    ]);
    expect(dossiers.lijst[0].eigenPad).toEqual(expect.objectContaining({ adres: EXTRA, status: 200 }));
  });

  it('schrijft in het rapport de volledige vorm van elke bevinding, zonder de regels met veldnamen te herhalen', () => {
    const rapport = leesRapport();
    const hoofdregels = regels.filter((r) => r.deel === undefined);
    expect(rapport.regels).toHaveLength(hoofdregels.length);
    expect(rapport.samenvatting).toHaveLength(samen.length);
    expect(rapport.oproepen).toBe(gezien.length);
    expect(rapport.maxOproepen).toBe(30);
    const d = rapport.regels.find((r: Rec) => r.stap === 'dossier' && r.adv === ADV_A) as Rec;
    expect(d.velden['onderwijsdoelen[].set']).toBe('string ODS_ABC_123');
    expect(d.verwijzingen.ods[0].code).toBe('ODS_ABC_123');
    const bk = rapport.regels.find((r: Rec) => r.stap === 'bk' && r.versie === 'BK-0001-1') as Rec;
    expect(bk.codes).toEqual(['bkc0000001', 'bkc0000002', 'bkc0000003']);
  });
});

describe('stand dossier: een sleutel met een nieuwe regel', () => {
  it('gebruikt de getrimde sleutel, waarschuwt zonder de waarde en laat de sleutel nergens uitlekken', async () => {
    const u = await draai({ env: { ONDERWIJSDOELEN_API_KEY: `${SLEUTEL}\n` } });
    const bestand = readFileSync(rapportBestand(), 'utf8');
    expect(u.code, u.stderr).toBe(0);
    expect(u.stderr).toContain('Waarschuwing');
    expect(verzoeken.length).toBeGreaterThan(5);
    expect(verzoeken.every((v) => v.sleutel === SLEUTEL)).toBe(true);
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(LANG_GEHEIM);
    }
    geldigeRegels(u.stdout);
  });
});

describe('stand dossier: andere vormen van een dossier', () => {
  it('404 bij elk dossier: meldt 404, onbekend of het verwijst, en loopt door naar de beroepskwalificaties', async () => {
    const u = await draai({ dossier: {} });
    expect(u.code, u.stderr).toBe(0);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const c = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING').find((s) => s.deel === 'conclusie') as Rec;
    expect(c.dossier.algemeen).toBe('404');
    expect(c.verwijstNaarOnderwijsdoelen).toMatch(/^onbekend/);
    expect(c.verwijstNaarBk).toMatch(/^onbekend/);
    expect(c.eigenApiPad).toEqual([]);
    expect(hoofd(regels, 'dossier', `${DETAIL}/${ADV_A}/curriculumdossier`)).toEqual(expect.objectContaining({ status: 404, soort: 'json' }));
    expect(regels.filter((r) => r.stap === 'bk')).toHaveLength(2);
    expect(verzoeken.some((v) => v.url === EXTRA)).toBe(false);
  });

  it('een doorverwijzing wordt vastgelegd (alleen de host) en niet gevolgd', async () => {
    const u = await draai({ dossier: { [ADV_A]: 'doorverwijzing', [ADV_DU]: 'doorverwijzing', [ADV_DO]: 'doorverwijzing' } });
    expect(u.code, u.stderr).toBe(0);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const d = hoofd(regels, 'dossier', `${DETAIL}/${ADV_A}/curriculumdossier`) as Rec;
    expect(d).toEqual(expect.objectContaining({ status: 302, soort: 'doorverwijzing', doorverwijzing: new URL(anderBasis).host }));
    expect(u.stdout).not.toContain('/doorverwezen');
    expect(anderVerzoeken).toEqual([]);
    const c = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING').find((s) => s.deel === 'conclusie') as Rec;
    expect(c.dossier.algemeen).toBe('status 302');
  });

  it('een leeg antwoord of een onbekende vorm laat het script niet crashen', async () => {
    const u = await draai({ scenario: 'leeg' });
    expect(u.code, u.stderr).toBe(0);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const samen = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING');
    expect(hoofd(regels, 'dossier', `${DETAIL}/${ADV_A}/curriculumdossier`)).toEqual(expect.objectContaining({ status: 200, soort: 'leeg' }));
    expect(regels.find((r) => r.stap === 'bk' && r.overgeslagen)?.overgeslagen).toMatch(/versie_nr_lang/);
    expect(hoofd(regels, 'studiebekrachtigingen')).toEqual(expect.objectContaining({ totaal: 0, reden: 'geen veld studiebekrachtigingen in het antwoord' }));
    expect(samen[samen.length - 1].deel).toBe('klaar');
    expect((samen.find((s) => s.deel === 'conclusie') as Rec).dossier.algemeen).toBe('leeg');
  });

  it('elk antwoord een fout met de sleutel erin: het script blijft draaien en toont niets van de sleutel', async () => {
    const u = await draai({ scenario: 'kapot' });
    expect(u.code, u.stderr).toBe(0);
    const bestand = readFileSync(rapportBestand(), 'utf8');
    for (const tekst of [u.stdout, u.stderr, bestand]) {
      expect(tekst).not.toContain(SLEUTEL);
      expect(tekst).not.toContain(LANG_GEHEIM);
    }
    const samen = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING');
    expect((samen.find((s) => s.deel === 'conclusie') as Rec).dossier.algemeen).toBe('status 500');
    expect(samen[samen.length - 1].deel).toBe('klaar');
    geldigeRegels(u.stdout);
  });
});

describe('stand dossier: de grens van het aantal oproepen', () => {
  it('stopt bij een lagere grens, meldt wat overgeslagen is en sluit toch af', async () => {
    const u = await draai({ env: { VERKENNING_DOSSIER_MAX: '4' } });
    expect(u.code, u.stderr).toBe(0);
    expect(verzoeken).toHaveLength(4);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    expect(regels.filter((r) => r.overgeslagen === 'grens van oproepen bereikt').length).toBeGreaterThanOrEqual(3);
    const samen = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING');
    expect(samen[samen.length - 1]).toEqual({ deel: 'klaar', oproepen: 4, maxOproepen: 4 });
  });

  it('laat zich niet verhogen: boven de 30 of onzin geldt de grens van 30', async () => {
    for (const waarde of ['99', 'abc', '-1', '2.5']) {
      const u = await draai({ env: { VERKENNING_DOSSIER_MAX: waarde } });
      expect(u.code, u.stderr).toBe(0);
      const samen = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING');
      expect(samen[samen.length - 1].maxOproepen, waarde).toBe(30);
      expect(verzoeken.length, waarde).toBeLessThanOrEqual(30);
    }
  });
});

describe('stand dossier: de matrix', () => {
  it('valt terug op ADV-0842, ADV-0843 en onderdeel 504 als de matrix ontbreekt, en meldt dat', async () => {
    const u = await draai({ matrix: join(TMP, 'bestaat-niet.json') });
    expect(u.code, u.stderr).toBe(0);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const v = hoofd(regels, 'voorbeelden') as Rec;
    expect(v.bron).toBe('vast');
    expect(v.reden).toBe('de matrix ontbreekt of is onbruikbaar');
    expect(v.onderdelen.map((o: Rec) => o.adv)).toEqual(['ADV-0842', 'ADV-0843']);
    expect(v.bk).toEqual({ nr: 504, vast: true });
    const urls = verzoeken.map((x) => x.url);
    expect(urls).toEqual(expect.arrayContaining([`${DETAIL}/ADV-0842`, `${DETAIL}/ADV-0842/curriculumdossier`, `${DETAIL}/ADV-0843`, `${DETAIL}/ADV-0843/curriculumdossier`, `${SO}/504`]));
    expect(urls).toHaveLength(5);
    // zonder beroepskwalificaties bij onderdeel 504 meldt het script dat en gaat het door
    expect(regels.find((r) => r.stap === 'bk' && r.overgeslagen)?.overgeslagen).toMatch(/versie_nr_lang/);
    const samen = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING');
    expect(samen[samen.length - 1].deel).toBe('klaar');
  });

  it('valt ook terug als het bestand geen geldige JSON is', async () => {
    const kapot = join(TMP, 'matrix-kapot.json');
    writeFileSync(kapot, '{"groepen": [');
    const u = await draai({ matrix: kapot });
    expect(u.code, u.stderr).toBe(0);
    expect((hoofd(regelsMet(u.stdout, 'DOSSIER'), 'voorbeelden') as Rec).bron).toBe('vast');
  });

  it('meldt een ontbrekende finaliteit en gaat verder met de andere twee', async () => {
    const u = await draai({ matrix: MATRIX_ZONDER_DU });
    expect(u.code, u.stderr).toBe(0);
    const v = hoofd(regelsMet(u.stdout, 'DOSSIER'), 'voorbeelden') as Rec;
    expect(v.bron).toBe('repo');
    expect(v.ontbreekt).toEqual(['DU']);
    expect(v.onderdelen.map((o: Rec) => o.finaliteit)).toEqual(['A', 'DO']);
    expect(verzoeken.map((x) => x.url)).not.toContain(`${DETAIL}/${ADV_DU}`);
  });
});

describe('stand dossier: de lengte van een logboekregel', () => {
  it('verdeelt veldnamen over meer regels en houdt elke regel onder 8 KB en geldig, ook bij een tekst van 24 KB', async () => {
    const u = await draai({ scenario: 'breed' });
    expect(u.code, u.stderr).toBe(0);
    geldigeRegels(u.stdout);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const adres = `${DETAIL}/${ADV_A}/curriculumdossier`;
    const delen = regels.filter((r) => r.stap === 'dossier' && r.deel === 'velden' && r.adres === adres);
    expect(delen.length).toBeGreaterThanOrEqual(4);
    expect(delen.map((r) => r.nr)).toEqual(delen.map((_, i) => i + 1));
    expect(delen.every((r) => r.van === delen.length && r.ingekort === undefined)).toBe(true);
    // de eerste ruim 380 van de 450 ruisvelden staan er (na de vijftien gewone velden), over de regels verdeeld
    const namen = new Set(delen.flatMap((r) => Object.keys(r.velden)));
    for (let i = 0; i < 380; i += 1) expect(namen.has(`ruisveld_${String(i).padStart(3, '0')}`)).toBe(true);
    const hoofdRegel = hoofd(regels, 'dossier', adres) as Rec;
    expect(hoofdRegel.ingekort).toBeUndefined();
    expect(hoofdRegel.aantalVelden).toBe(400); // het maximum per antwoord; het rapport houdt dezelfde 400
    expect(Object.keys(leesRapport().regels.find((r: Rec) => r.stap === 'dossier' && r.adv === ADV_A).velden)).toHaveLength(400);
    // de langste waarde-tekst wordt gemeld, niet afgedrukt
    const bk = hoofd(regels, 'bk', `${BK}/BK-0001-1`) as Rec;
    expect(bk.competenties.langsteWaarde).toBe('woord '.repeat(4000).length);
    // het kennis-element met honderd extra velden blijft binnen de regel (de velden zijn begrensd op 60)
    const kennis = regels.find((r) => r.stap === 'bk-vorm' && r.versie === 'BK-0001-1' && r.element === 'kennis') as Rec;
    expect(Object.keys(kennis.velden).length).toBeLessThanOrEqual(60);
  });
});

describe('stand dossier: een pdf die zich verstopt, en een tekst zonder tekstueel type', () => {
  // De pdf heeft een regeleinde voor %PDF-, geen 0-byte in de eerste 2048 bytes en een onschuldig of ontbrekend content-type.
  it.each(['pdf-tekst', 'pdf-zonder-type'] as const)('%s wordt als pdf herkend: alleen type en grootte, niets uit de inhoud', async (soort) => {
    const u = await draai({ dossier: { [ADV_A]: soort, [ADV_DU]: soort, [ADV_DO]: soort } });
    expect(u.code, u.stderr).toBe(0);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const bestand = readFileSync(rapportBestand(), 'utf8');
    for (const [adv, finaliteit, nr] of [[ADV_A, 'A', 11], [ADV_DU, 'DU', 21], [ADV_DO, 'DO', 31]] as const) {
      const adres = `${DETAIL}/${adv}/curriculumdossier`;
      const d = hoofd(regels, 'dossier', adres) as Rec;
      expect(d).toEqual({
        stap: 'dossier',
        adres,
        adv,
        finaliteit,
        onderdeel: nr,
        status: 200,
        contentType: soort === 'pdf-tekst' ? 'text/plain' : null,
        grootte: PDF_TEKST.length,
        soort: 'pdf',
      });
      expect(regels.filter((r) => r.adres === adres && r.deel !== undefined)).toEqual([]); // geen veldnamen, geen verwijzingen
    }
    for (const tekst of [u.stdout, bestand]) {
      for (const verboden of [PDF_GEHEIM, 'GEHEIM-AUTEUR', 'ODS_PDF_GEHEIM', 'BK-9999-9', 'ADV-9999', '%PDF', 'obj <<']) expect(tekst, verboden).not.toContain(verboden);
    }
    const c = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING').find((x) => x.deel === 'conclusie') as Rec;
    expect(c.dossier.algemeen).toBe('pdf');
    expect(c.verwijstNaarOnderwijsdoelen).toMatch(/^onbekend/);
    expect(c.verwijstNaarBk).toMatch(/^onbekend/);
    expect(c.eigenApiPad).toEqual([]);
    expect(verzoeken.some((v) => v.url === EXTRA)).toBe(false);
  });

  it('het begin van een tekst staat alleen in het logboek bij een tekstueel content-type', async () => {
    const u = await draai({ dossier: { [ADV_A]: 'tekst', [ADV_DU]: 'tekst-zonder-type', [ADV_DO]: '404' } });
    expect(u.code, u.stderr).toBe(0);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    const a = hoofd(regels, 'dossier', `${DETAIL}/${ADV_A}/curriculumdossier`) as Rec;
    expect(a).toEqual(expect.objectContaining({ soort: 'tekst', contentType: 'text/plain; charset=utf-8', begin: 'Gewone tekst over het dossier.' }));
    const du = hoofd(regels, 'dossier', `${DETAIL}/${ADV_DU}/curriculumdossier`) as Rec;
    expect(du.soort).toBe('tekst');
    expect(du.begin).toBeUndefined();
    expect(u.stdout).not.toContain('zonder content-type');
  });
});

describe('stand dossier: welke adressen het script volgt', () => {
  // Zonder de lastige links: detail en dossier van elk van de drie erkenningen, de ene eigen pad, het onderdeel en twee BK's.
  const GEWOON = [
    `${DETAIL}/${ADV_A}`,
    `${DETAIL}/${ADV_A}/curriculumdossier`,
    EXTRA,
    `${DETAIL}/${ADV_DU}`,
    `${DETAIL}/${ADV_DU}/curriculumdossier`,
    `${DETAIL}/${ADV_DO}`,
    `${DETAIL}/${ADV_DO}/curriculumdossier`,
    `${SO}/11`,
    `${BK}/BK-0001-1`,
    `${BK}/BK-0002-3`,
  ].sort();

  it('volgt een absolute link op de API-host alleen met een toegelaten voorvoegsel en zonder . of .. in het pad', async () => {
    const u = await draai({ dossier: { [ADV_A]: 'json-vijandig', [ADV_DU]: 'pdf', [ADV_DO]: 'html' } });
    expect(u.code, u.stderr).toBe(0);
    // /logout, /p/prive/x, /etc/passwd en de padvormen met .., %2e en %2f krijgen geen verzoek: alleen de ene geldige link
    expect(verzoeken.map((v) => v.url).sort()).toEqual(GEWOON);
    expect(verzoeken.every((v) => v.methode === 'GET')).toBe(true);
    expect(anderVerzoeken).toEqual([]);
    // het opgevraagde adres is het gelogde adres
    const regels = regelsMet(u.stdout, 'DOSSIER');
    expect(hoofd(regels, 'dossier-pad')).toEqual(expect.objectContaining({ adres: EXTRA, status: 200, soort: 'json' }));
    // de verwijzingen staan in het logboek als genormaliseerd pad: nooit een segment .. of een versluierde schuine streep
    const v = regels.find((r) => r.stap === 'dossier' && r.deel === 'verwijzingen' && r.adres === `${DETAIL}/${ADV_A}/curriculumdossier`) as Rec;
    expect(v.api.length).toBeGreaterThan(3);
    for (const a of v.api) expect(a.pad).not.toMatch(/(^|\/)\.\.?(\/|$)/);
    // geen enkel gevolgd adres in de samenvatting buiten het ene toegelaten pad
    const c = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING').find((x) => x.deel === 'conclusie') as Rec;
    expect(c.eigenApiPad).toEqual([{ adv: ADV_A, status: 200, soort: 'json' }]);
  });

  it('volgt in totaal één eigen pad: een tweede dossier met een ander toegelaten pad blijft ongevolgd', async () => {
    const u = await draai({ dossier: { [ADV_A]: 'json', [ADV_DU]: 'json-tweede', [ADV_DO]: 'json-vijandig' } });
    expect(u.code, u.stderr).toBe(0);
    const urls = verzoeken.map((v) => v.url);
    expect(urls.filter((x) => x === EXTRA)).toHaveLength(1);
    expect(urls).not.toContain(EXTRA_TWEEDE);
    expect(urls).not.toContain(EXTRA_DERDE);
    expect(regelsMet(u.stdout, 'DOSSIER').filter((r) => r.stap === 'dossier-pad' && r.deel === undefined)).toHaveLength(1);
    const c = regelsMet(u.stdout, 'DOSSIER-SAMENVATTING').find((x) => x.deel === 'conclusie') as Rec;
    expect(c.eigenApiPad).toHaveLength(1);
  });

  it('neemt het eigen pad van het eerste dossier dat er een heeft, ook als de vorige dossiers geen leesbare verwijzing hadden', async () => {
    const u = await draai({ dossier: { [ADV_A]: '404', [ADV_DU]: 'json-tweede', [ADV_DO]: 'json-vijandig' } });
    expect(u.code, u.stderr).toBe(0);
    const urls = verzoeken.map((v) => v.url);
    expect(urls).toContain(EXTRA_TWEEDE);
    expect(urls).not.toContain(EXTRA);
  });

  it('vraagt een versie_nr_lang die geen BK-versie is (.., ., abc, BK-12) nooit op', async () => {
    const u = await draai({ scenario: 'bk-vreemd' });
    expect(u.code, u.stderr).toBe(0);
    // ook niet `${KC}/beroepskwalificaties/v2/` (wat `..` zou worden): precies dezelfde tien adressen als gewoonlijk
    expect(verzoeken.map((v) => v.url).sort()).toEqual(GEWOON);
    const regels = regelsMet(u.stdout, 'DOSSIER');
    expect(regels.filter((r) => r.stap === 'bk-detail' && r.deel === undefined).map((r) => r.versie)).toEqual(['BK-0001-1', 'BK-0002-3']);
  });
});

// ── Hulpfuncties van het script ─────────────────────────────────────────────

describe('hulpfuncties van de stand dossier', () => {
  const laad = async () => (await import(/* @vite-ignore */ pathToFileURL(SCRIPT).href)) as Record<string, any>;
  const VANDAAG = '2026-10-10';
  // Tekens die in de bron onzichtbaar of verwarrend zijn, daarom met hun code.
  const FF = String.fromCharCode(0xfffd);
  const BOM = String.fromCharCode(0xfeff);
  const matrix = (onderdelen: Rec[], groepen: Rec[] = GROEPEN) => ({ groepen, onderdelen });

  it('kiest A, DU en DO uit de nagebootste matrix, met het nieuwste ADV dat vandaag geldt', async () => {
    const m = await laad();
    const k = m.kiesDossiers(matrix(ONDERDELEN), VANDAAG);
    expect(k.bron).toBe('repo');
    expect(k.onderdelen.map((o: Rec) => [o.finaliteit, o.nr, o.adv])).toEqual([
      ['A', 11, 'ADV-0102'],
      ['DU', 21, ADV_DU],
      ['DO', 31, ADV_DO],
    ]);
    expect(k.bk).toEqual({ nr: 11, vast: false });
  });

  it('kiest uit de echte matrix in de repo drie onderdelen met een ADV-nummer, A in de 3de graad', async () => {
    const m = await laad();
    const data = JSON.parse(readFileSync(join(ROOT, 'public', 'leerplannen', 'structuur', 'studierichtingen.json'), 'utf8'));
    const k = m.kiesDossiers(data, VANDAAG);
    expect(k.bron).toBe('repo');
    expect(k.ontbreekt).toEqual([]);
    expect(k.onderdelen.map((o: Rec) => o.finaliteit)).toEqual(['A', 'DU', 'DO']);
    expect(k.onderdelen.every((o: Rec) => /^ADV-\d+$/.test(o.adv) && o.advGeldig === true)).toBe(true);
    expect(new Set(k.onderdelen.map((o: Rec) => o.adv)).size).toBe(3);
    expect(k.onderdelen[0].graad).toBe('3');
    expect(k.bk.nr).toBe(k.onderdelen[0].nr);
  });

  it('neemt een duaal onderdeel of een andere graad alleen als er niets beters is', async () => {
    const m = await laad();
    const alleenDuaalTweedeGraad = m.kiesDossiers(
      matrix([onderdeel(7, 'G-2', { duaal: true })], GROEPEN),
      VANDAAG,
    );
    expect(alleenDuaalTweedeGraad.onderdelen.map((o: Rec) => o.nr)).toEqual([7]);
    expect(alleenDuaalTweedeGraad.ontbreekt).toEqual(['DU', 'DO']);
    // zonder A valt het onderdeel voor de beroepskwalificaties terug op de vaste keuze
    const zonderA = m.kiesDossiers(matrix(ONDERDELEN.filter((o) => o.groep !== 'G-1' && o.groep !== 'G-2')), VANDAAG);
    expect(zonderA.ontbreekt).toEqual(['A']);
    expect(zonderA.bk).toEqual({ nr: 504, vast: true });
  });

  it('meldt een ADV dat niet meer geldt als zo (advGeldig false) en slaat een ongeldig nummer over', async () => {
    const m = await laad();
    const k = m.kiesDossiers(matrix([onderdeel(7, 'G-1', { erkenningen: [erkenning('ADV-0070', '2010-09-01', { einddatum: '2020-08-31' }), erkenning('geen-nummer', '2010-09-01')] })]), VANDAAG);
    expect(k.onderdelen[0]).toEqual(expect.objectContaining({ adv: 'ADV-0070', advGeldig: false }));
  });

  it('valt terug op de vaste keuze zonder bruikbare matrix of zonder bruikbaar onderdeel', async () => {
    const m = await laad();
    for (const kapot of [null, undefined, {}, { groepen: 'x', onderdelen: [] }]) {
      const k = m.kiesDossiers(kapot, VANDAAG);
      expect(k.bron).toBe('vast');
      expect(k.onderdelen.map((o: Rec) => o.adv)).toEqual(['ADV-0842', 'ADV-0843']);
      expect(k.bk).toEqual({ nr: 504, vast: true });
    }
    const leeg = m.kiesDossiers(matrix([onderdeel(1, 'G-1', { aanloop: true })]), VANDAAG);
    expect(leeg.bron).toBe('vast');
    expect(leeg.reden).toBe('geen bruikbaar onderdeel in de matrix');
  });

  it('leesAntwoord herkent json, pdf, binair, html, tekst en leeg, ook zonder passend content-type', async () => {
    const m = await laad();
    const lees = (inhoud: string | Buffer, soort = '') => m.leesAntwoord({ buffer: Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud), soort });
    expect(lees('%PDF-1.4 inhoud')).toEqual({ soort: 'pdf' });
    expect(lees('niets', 'application/pdf')).toEqual({ soort: 'pdf' });
    expect(lees('{"a": 1}', 'text/plain').soort).toBe('json');
    expect(lees('﻿[1, 2]', 'application/json').json).toEqual([1, 2]);
    expect(lees('{"a": 1}', 'application/octet-stream').soort).toBe('json');
    expect(lees(Buffer.from([1, 2, 0, 3]), 'text/plain')).toEqual({ soort: 'binair' });
    expect(lees('x', 'application/zip')).toEqual({ soort: 'binair' });
    expect(lees('gewoon', 'application/octet-stream')).toEqual({ soort: 'binair' });
    expect(lees('<html><title> Dossier\n x </title></html>', 'text/html')).toEqual(expect.objectContaining({ soort: 'html', titel: 'Dossier x' }));
    expect(lees('<!DOCTYPE html><p>zonder titel</p>').titel).toBeNull();
    expect(lees('gewone tekst', 'text/plain').soort).toBe('tekst');
    expect(lees('{kapot', 'application/json').soort).toBe('tekst');
    expect(lees('42', 'application/json').soort).toBe('tekst'); // een los getal is geen dossier
    expect(lees('')).toEqual({ soort: 'leeg' });
    expect(m.leesAntwoord({})).toEqual({ soort: 'leeg' });
  });

  it('speurDossier bewaart van een adres op de API-host alleen het pad en van een andere host alleen de host', async () => {
    const m = await laad();
    const s = m.speurDossier({
      a: {
        b: ['https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/x/y?token=geheim#frag', 'zie https://voorbeeld.example.org/prive/pad?id=1.'],
        c: '/kwalificaties-en-curriculum/v2/iets?x=1',
        d: 'ODS_ABC-1 en BK-0390-2 en ADV-0842',
      },
      onderwijsdoelen_url: 'x',
      tekst: 'Eindtermen en minimumdoelen',
    });
    expect([...s.api.keys()]).toEqual(['/kwalificaties-en-curriculum/x/y', '/kwalificaties-en-curriculum/v2/iets']);
    expect([...s.andere.keys()]).toEqual(['voorbeeld.example.org']);
    expect(s.andere.get('voorbeeld.example.org').aantal).toBe(1);
    expect([...s.ods.keys()]).toEqual(['ODS_ABC-1']);
    expect([...s.bk.keys()]).toEqual(['BK-0390-2']);
    expect([...s.adv.keys()]).toEqual(['ADV-0842']);
    expect([...s.doelVelden.keys()]).toEqual(['onderwijsdoelen_url']);
    expect([...s.doelWoorden.keys()].sort()).toEqual(['eindterm', 'minimumdoel']);
    expect(JSON.stringify([...s.api.keys(), ...s.andere.keys()])).not.toMatch(/geheim|prive|id=1/);
    // een lege of vreemde waarde crasht niet
    for (const w of [null, undefined, 5, '', [], {}, [[[]]]]) expect(() => m.speurDossier(w)).not.toThrow();
  });

  it('analyseerBk vindt de ondiepste lijst competenties en meldt een antwoord zonder lijst', async () => {
    const m = await laad();
    expect(m.analyseerBk({ titel: 'zonder' }).competenties).toBeNull();
    expect(m.analyseerBk(null).competenties).toBeNull();
    const a = m.analyseerBk({
      diep: { weg: { competenties: [{ competentie_code: 'x1', waarde: 'a'.repeat(5000) }] } },
      competenties: [{ competentie_code: 'c1', competentie_type: null, waarde: 'kort' }, { competentie_code: 'c1', competentie_type: 7 }, 'geen object'],
    });
    expect(a.competenties).toEqual(expect.objectContaining({ veld: 'competenties', aantal: 2, perType: { ontbreekt: 1, '7': 1 }, aantalCodes: 2, uniekeCodes: 1, langsteWaarde: 4 }));
    expect(a.competenties.langsteWaardeOveral.lengte).toBe(5000);
    expect(a.vormen).toEqual({ kennis: null, vaardigheden: null, referenties: null });
  });

  it('analyseerBekrachtigingen telt onderwijskwalificatie waar, onwaar, tekst en ontbrekend', async () => {
    const m = await laad();
    const a = m.analyseerBekrachtigingen({
      structuuronderdeel_details: [{ studiebekrachtigingen: [{ onderwijskwalificatie: true }, { onderwijskwalificatie: 'TRUE' }, { onderwijskwalificatie: 'false' }, { onderwijskwalificatie: 3 }, {}] }, { studiebekrachtigingen: [] }],
    });
    expect(a.totaal).toBe(5);
    expect(a.onderwijskwalificatie).toEqual({ waar: 2, onwaar: 1, anders: 1, ontbreekt: 1 });
    expect(a.andere).toEqual({});
    expect(m.analyseerBekrachtigingen({}).totaal).toBe(0);
  });

  it('leesAntwoord herkent een pdf met een regeleinde, spatie of BOM ervoor, ook als text/plain of zonder type', async () => {
    const m = await laad();
    const lees = (inhoud: string | Buffer, soort = '') => m.leesAntwoord({ buffer: Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud), soort });
    const romp = '%PDF-1.4\n1 0 obj << /Title (GEHEIM-PDF-TITEL) >> endobj\n';
    for (const voor of ['\n', '\r\n', ' ', '\n\n\n ', BOM, `${BOM}\n`]) {
      expect(lees(voor + romp, 'text/plain'), JSON.stringify(voor)).toEqual({ soort: 'pdf' });
      expect(lees(voor + romp), JSON.stringify(voor)).toEqual({ soort: 'pdf' });
    }
    // net binnen de eerste 1024 bytes wel, daarbuiten niet (dan beslist de rest van de controle)
    expect(lees(`${' '.repeat(1019)}%PDF-1.4`)).toEqual({ soort: 'pdf' });
    expect(lees(`${' '.repeat(1020)}%PDF-1.4`).soort).toBe('tekst');
  });

  it('leesAntwoord telt tekst met U+FFFD of stuurtekens als binair, maar laat gewone tekst en leesbare JSON staan', async () => {
    const m = await laad();
    const lees = (inhoud: string | Buffer, soort = '') => m.leesAntwoord({ buffer: Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud), soort });
    // bytes die geen UTF-8 zijn, zonder 0-byte en zonder %PDF-
    expect(lees(Buffer.from([0x41, 0xe2, 0xe3, 0xcf, 0xd3, 0x42]), 'text/plain')).toEqual({ soort: 'binair' });
    expect(lees(Buffer.from([0x41, 0xe2, 0xe3, 0xcf, 0xd3, 0x42]))).toEqual({ soort: 'binair' });
    expect(lees(`tekst met ${FF} erin`, 'text/html')).toEqual({ soort: 'binair' });
    expect(lees('tekst met \u0001 stuurteken')).toEqual({ soort: 'binair' });
    expect(lees('tekst met \u007F')).toEqual({ soort: 'binair' });
    expect(lees('<html><title>x</title>\u0008</html>', 'text/html')).toEqual({ soort: 'binair' });
    // tab, nieuwe regel en wagenterugloop blijven gewone tekst
    expect(lees('regel een\r\n\tregel twee\n', 'text/plain')).toEqual({ soort: 'tekst', tekst: 'regel een\r\n\tregel twee\n' });
    // gewone accenten ook
    expect(lees('Eindtermen: één, twee, drië', 'text/plain').soort).toBe('tekst');
    // leesbare JSON blijft JSON, ook met één U+FFFD in een waarde
    expect(lees(`{"naam": "kapot ${FF} teken"}`, 'application/json')).toEqual({ soort: 'json', json: { naam: `kapot ${FF} teken` } });
    // JSON die niet te lezen is en stuurtekens bevat, is binair
    expect(lees('{kapot\u0002', 'application/json')).toEqual({ soort: 'binair' });
  });

  it('toegelatenApiPad geeft alleen een pad terug met een van de vier voorvoegsels, genormaliseerd en zonder versluiering', async () => {
    const m = await laad();
    const goed = [
      `${KC}/structuuronderdelen/v2/structuuronderdeel_detail/ADV-0842`,
      '/onderwijsdoelen/v1/onderwijsdoelen',
      '/instellingsgegevens/v1/x',
      '/app-opleidingsinhouden/v1/secundair-onderwijs/opleidingsinhoud/ADV-0842',
      `${KC}/bk/BK-0390-2`,
      `${KC}/a%20b/c`,
    ];
    for (const p of goed) expect(m.toegelatenApiPad(p), p).toBe(p);
    const fout = [
      '/logout',
      '/p/prive/x',
      '/',
      '/etc/passwd',
      '//voorbeeld.example.org/kwalificaties-en-curriculum/x',
      KC, // zonder schuine streep erna
      '/kwalificaties-en-curriculumx/y', // lijkt op een voorvoegsel maar is het niet
      `${KC}/../../etc/passwd`,
      `${KC}/a/../b`,
      `${KC}/a/./b`,
      `${KC}/..`,
      `${KC}/.`,
      `${KC}/%2e%2e/%2E%2e/etc`,
      `${KC}/a%2fb`,
      `${KC}/a%2Fb`,
      `${KC}/a%5cb`,
      `${KC}/a\\b`,
      `${KC}/a%00b`,
      `${KC}/a?x=1`,
      `${KC}/a#x`,
      `${KC}/a b`,
      `${KC}/${'x'.repeat(300)}`,
      'kwalificaties-en-curriculum/x',
      '',
    ];
    for (const p of fout) expect(m.toegelatenApiPad(p), JSON.stringify(p)).toBeNull();
    for (const p of [null, undefined, 5, {}, []]) expect(m.toegelatenApiPad(p)).toBeNull();
  });

  it('speurDossier zet een pad in api, maar in volgbaar alleen als het script het mag volgen', async () => {
    const m = await laad();
    const s = m.speurDossier({
      a: [
        `${API_BASIS}/logout`,
        `${API_BASIS}${KC}/../../etc/passwd`,
        `${API_BASIS}${KC}/x/../y`,
        `${API_BASIS}${KC}/a%2fb`,
        `${API_BASIS}${KC}/goed/een?token=geheim`,
        `${API_BASIS}/onderwijsdoelen/v1/goed-twee#frag`,
      ],
      b: `${KC}/relatief/goed`,
      c: `${KC}/relatief/../slecht`,
    });
    // alles op de API-host in api, genormaliseerd (zonder query of fragment); /etc/passwd zoals een browser het zou vragen
    expect([...s.api.keys()]).toEqual([
      '/logout',
      '/etc/passwd',
      `${KC}/y`,
      `${KC}/a%2fb`,
      `${KC}/goed/een`,
      '/onderwijsdoelen/v1/goed-twee',
      `${KC}/relatief/goed`,
      `${KC}/slecht`,
    ]);
    expect([...s.volgbaar.keys()]).toEqual([`${KC}/goed/een`, '/onderwijsdoelen/v1/goed-twee', `${KC}/relatief/goed`]);
    expect(JSON.stringify([...s.api.keys()])).not.toContain('geheim');
  });

  it('kiesDossiers telt NIET_ERKEND en GEANNULEERD niet als erkend, ook niet als de data vandaag gelden', async () => {
    const m = await laad();
    const geldt = { begindatum: '2025-09-01' };
    // het nieuwste ADV is NIET_ERKEND (data in orde): het oudere erkende ADV wint en geldt
    const a = m.kiesDossiers(
      matrix([onderdeel(7, 'G-1', { erkenningen: [erkenning('ADV-0070', '2020-09-01'), { nummer: 'ADV-0071', status: 'NIET_ERKEND', ...geldt }, { nummer: 'ADV-0072', status: 'GEANNULEERD', ...geldt }] })]),
      VANDAAG,
    );
    expect(a.onderdelen[0]).toEqual(expect.objectContaining({ adv: 'ADV-0070', advGeldig: true }));
    // alleen niet-erkende erkenningen: het laatste uit de lijst, gemeld als niet geldend
    const b = m.kiesDossiers(matrix([onderdeel(7, 'G-1', { erkenningen: [{ nummer: 'ADV-0071', status: 'NIET_ERKEND', ...geldt }] })]), VANDAAG);
    expect(b.onderdelen[0]).toEqual(expect.objectContaining({ adv: 'ADV-0071', advGeldig: false }));
    // ERKEND in een andere schrijfwijze, met witruimte, of zonder status telt wel mee
    for (const status of ['erkend', ' ERKEND ', 'Erkend', undefined]) {
      const c = m.kiesDossiers(matrix([onderdeel(7, 'G-1', { erkenningen: [{ nummer: 'ADV-0073', ...(status === undefined ? {} : { status }), ...geldt }] })]), VANDAAG);
      expect(c.onderdelen[0], String(status)).toEqual(expect.objectContaining({ adv: 'ADV-0073', advGeldig: true }));
    }
    // een onderdeel met een echt erkend ADV gaat voor een lager nummer met alleen een niet-erkend ADV
    const d = m.kiesDossiers(
      matrix([onderdeel(7, 'G-1', { erkenningen: [{ nummer: 'ADV-0071', status: 'NIET_ERKEND', ...geldt }] }), onderdeel(9, 'G-1', { erkenningen: [erkenning('ADV-0090', '2020-09-01')] })]),
      VANDAAG,
    );
    expect(d.onderdelen[0]).toEqual(expect.objectContaining({ nr: 9, adv: 'ADV-0090', advGeldig: true }));
  });

  it('de vaste terugval hoort bij de echte matrix: onderdeel 504 heeft ADV-0842 en finaliteit A, 505 heeft ADV-0843', async () => {
    const m = await laad();
    const data = JSON.parse(readFileSync(join(ROOT, 'public', 'leerplannen', 'structuur', 'studierichtingen.json'), 'utf8')) as { groepen: Rec[]; onderdelen: Rec[] };
    const vast = m.kiesDossiers(null, VANDAAG);
    expect(vast.onderdelen.map((o: Rec) => o.adv)).toEqual(['ADV-0842', 'ADV-0843']);
    for (const [adv, nr] of [['ADV-0842', vast.bk.nr], ['ADV-0843', 505]] as const) {
      const o = data.onderdelen.find((x) => x.nummer === nr) as Rec;
      expect(o, `onderdeel ${nr}`).toBeDefined();
      expect(o.erkenningen.map((e: Rec) => e.nummer), `onderdeel ${nr}`).toContain(adv);
      expect(data.groepen.find((g) => g.nummer === o.groep)?.finaliteit, `onderdeel ${nr}`).toBe('A');
    }
    expect(vast.bk).toEqual({ nr: 504, vast: true });
  });
});
