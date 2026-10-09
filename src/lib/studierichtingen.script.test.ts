// Integratietests voor tools/leerplannen/haal-studierichtingen.mjs (docs/STUDIERICHTINGEN.md § 5 en § 16)
// en tools/leerplannen/maak-nagebootste-koppeling.mjs (§ 3.6). Het script draait als apart Node-proces,
// met opgeslagen antwoorden (--bron-*) of tegen een nagebootste http-API op 127.0.0.1. Er gaat nooit een
// verzoek naar de echte API, en alles wat geschreven wordt, staat in een tijdelijke map (eisRapport).
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { canoniek, type MinimumdoelenIndex } from './minimumdoelen';
import {
  STRUCTUUR_API,
  valideerMatrixBestand,
  valideerRichtingDoelenBestand,
  valideerRichtingDoelenIndex,
  type MatrixBestand,
  type RichtingDoelenBestand,
  type RichtingDoelenIndex,
} from './studierichtingen';

// Elke test start Node als apart proces, soms een paar keer na elkaar.
vi.setConfig({ testTimeout: 60_000 });

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'tools', 'leerplannen', 'haal-studierichtingen.mjs');
const MAAK = join(ROOT, 'tools', 'leerplannen', 'maak-nagebootste-koppeling.mjs');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'structuur');
const ECHTE_MINIMUMDOELEN = join(ROOT, 'public', 'leerplannen', 'minimumdoelen');
/** Een herkenbare nepsleutel: hij mag nergens in de uitvoer staan. */
const SLEUTEL = 'test-sleutel-1234';
const NU = '2026-10-09T00:00:00Z';
const VANDAAG = '2026-10-09';
const OFFICIELE_DOELEN_API = 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel';

type Rec = Record<string, unknown>;
type Uitkomst = { status: number; stdout: string; stderr: string };

// ── Hulpfuncties ────────────────────────────────────────────────────────────

let TMP = '';
let MD = ''; // nagebootste minimumdoelen (tijdelijk)

const leesJson = <T>(pad: string): T => JSON.parse(readFileSync(pad, 'utf8')) as T;
const sha256Van = (waarde: unknown) => createHash('sha256').update(canoniek(waarde), 'utf8').digest('hex');
const kopie = <T>(waarde: T): T => JSON.parse(JSON.stringify(waarde)) as T;

/** Omgeving zonder de sleutel en de adressen van de ontwikkelaar, zonder wachttijden, met `extra` erbovenop. */
function maakEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ONDERWIJSDOELEN_WACHT_FACTOR: '0' };
  delete env.ONDERWIJSDOELEN_API_KEY;
  delete env.ONDERWIJSDOELEN_API_BASE;
  delete env.STRUCTUURONDERDELEN_API_BASE;
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

/**
 * Zonder --uit en --rapport schrijft het script in de repo zelf (public/leerplannen/structuur en
 * tools/leerplannen/rapport): een test mag dat nooit. Beide moeten in de tijdelijke map van het systeem staan.
 */
function eisRapport(args: string[]) {
  const tmp = realpathSync(tmpdir());
  for (const optie of ['--uit', '--rapport']) {
    const i = args.indexOf(optie);
    if (i < 0) throw new Error(`Geef in een test altijd ${optie} mee.`);
    const pad = resolve(args[i + 1]);
    if (!pad.startsWith(tmp + sep) && !pad.startsWith(resolve(tmpdir()) + sep)) throw new Error(`${optie} moet in ${tmp} staan, niet in ${pad}.`);
  }
}

function draai(args: string[], extra: Record<string, string | undefined> = {}): Uitkomst {
  eisRapport(args);
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: maakEnv(extra), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const f = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: f.status ?? 1, stdout: f.stdout ?? '', stderr: f.stderr ?? '' };
  }
}

/** Asynchroon, zodat de http-server in dit proces ondertussen kan antwoorden. */
function draaiAsync(args: string[], extra: Record<string, string | undefined> = {}): Promise<Uitkomst> {
  eisRapport(args);
  return new Promise((klaar) => {
    execFile(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: maakEnv(extra), encoding: 'utf8' }, (fout, stdout, stderr) => {
      klaar({ status: fout ? (typeof fout.code === 'number' ? fout.code : 1) : 0, stdout, stderr });
    });
  });
}

/** Alle bestanden onder een map (relatief pad → inhoud en wijzigingstijd). */
function momentopname(map: string): Record<string, { tekst: string; mtime: number }> {
  const uit: Record<string, { tekst: string; mtime: number }> = {};
  if (!existsSync(map)) return uit;
  const loop = (dir: string, prefix: string) => {
    for (const naam of readdirSync(dir).sort()) {
      const pad = join(dir, naam);
      if (statSync(pad).isDirectory()) loop(pad, `${prefix}${naam}/`);
      else uit[`${prefix}${naam}`] = { tekst: readFileSync(pad, 'utf8'), mtime: statSync(pad).mtimeMs };
    }
  };
  loop(map, '');
  return uit;
}

const inhoud = (map: string) => Object.fromEntries(Object.entries(momentopname(map)).map(([k, v]) => [k, v.tekst]));

/** stdout, stderr, het rapport en elk geschreven bestand samen: daarin mag de sleutel nooit staan. */
function alleUitvoer(run: Uitkomst, ...mappenOfBestanden: string[]): string {
  const delen = [run.stdout, run.stderr];
  for (const p of mappenOfBestanden) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) delen.push(...Object.values(inhoud(p)));
    else delen.push(readFileSync(p, 'utf8'));
  }
  return delen.join('\n');
}

// ── Nagebootste minimumdoelen (een paar sets, met index) ────────────────────

interface TestDoel { id: string; code: string; groepen?: string[] }
interface TestSet { id: string; naam: string; graad: string; stroom?: string; geldigheid: string; doelen: TestDoel[] }

const tag = (groepen: string[]) => ({
  titels: { '1': { titel: 'Rubriek', ordeningskader: { type: 'wetenschapsdomein_onderdeel', studierichtingen: groepen.map((g) => ({ waarde: 'Richting', structuuronderdeel_groep_nummer: g })) } } },
});
const doelen = (prefix: number, n: number, tags: Record<number, string[]> = {}): TestDoel[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(prefix * 1000 + i + 1), code: `1.${i + 1}`, ...(tags[i + 1] ? { groepen: tags[i + 1] } : {}) }));

const SETS: TestSet[] = [
  { id: 'ODS_9101', naam: 'Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen', graad: '2de graad', geldigheid: 'Geldig', doelen: doelen(9101, 4, { 1: ['G-0193'], 2: ['G-0193'], 3: ['G-0117'] }) },
  { id: 'ODS_9102', naam: 'Secundair onderwijs 2de graad aso, kso, tso Finaliteit doorstroom -  Competenties in het Nederlands - Eindtermen', graad: '2de graad', geldigheid: 'Geldig', doelen: doelen(9102, 3) },
  // De BuSO-kopie deelt haar vaste nummers met de gewone set, zoals in de echte gegevens.
  { id: 'ODS_9103', naam: 'Buitengewoon Secundair onderwijs 2de graad aso, kso, tso Finaliteit doorstroom Opleidingsvorm 4 -  Competenties in het Nederlands - Eindtermen', graad: '2de graad', geldigheid: 'Geldig', doelen: doelen(9102, 3) },
  { id: 'ODS_9104', naam: 'Secundair onderwijs 1ste graad A-stroom - Nederlands - Eindtermen', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Geldig', doelen: doelen(9104, 2) },
  { id: 'ODS_9105', naam: 'Secundair onderwijs 1ste graad B-stroom - Nederlands - Eindtermen', graad: '1ste graad', stroom: 'B-stroom', geldigheid: 'Geldig', doelen: doelen(9105, 1) },
  { id: 'ODS_9106', naam: 'Secundair onderwijs 3de graad aso, kso, tso Finaliteit doorstroom -  Wiskunde - Eindtermen', graad: '3de graad', geldigheid: 'Geldig', doelen: doelen(9106, 2) },
];
const setVan = (id: string) => SETS.find((s) => s.id === id) as TestSet;

function maakMinimumdoelen(map: string, sets: TestSet[] = SETS) {
  mkdirSync(map, { recursive: true });
  const index: MinimumdoelenIndex = { app: 'boosterz', kind: 'minimumdoelen-index', v: 1, naamsvermelding: 'test', licentie: 'nog te bevestigen', sets: [] };
  for (const s of sets) {
    const lijst = s.doelen.map((d) => ({ id: d.id, code: d.code, tekst: `Doel ${d.code}`, type: 'Eindtermen', ...(d.groepen ? { extra: tag(d.groepen) } : {}) }));
    const sha256 = sha256Van(lijst);
    const kop = { id: s.id, naam: s.naam, apiId: s.id.slice(4), versie: '2.1', geldigheid: s.geldigheid, graad: s.graad, ...(s.stroom ? { stroom: s.stroom } : {}), sleutelcompetenties: [], bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'nog te bevestigen', opgehaald: '2026-10-05T13:11:11Z', aantal: lijst.length, sha256 };
    writeFileSync(join(map, `${s.id}.json`), JSON.stringify({ app: 'boosterz', kind: 'minimumdoelen', v: 1, set: kop, doelen: lijst }));
    index.sets.push({ id: s.id, naam: s.naam, versie: '2.1', geldigheid: s.geldigheid, graad: s.graad, ...(s.stroom ? { stroom: s.stroom } : {}), aantal: lijst.length, sha256, opgehaald: kop.opgehaald, bestand: `${s.id}.json` });
  }
  writeFileSync(join(map, 'index.json'), JSON.stringify(index));
}

const setSha = (id: string) => leesJson<MinimumdoelenIndex>(join(MD, 'index.json')).sets.find((s) => s.id === id)?.sha256.slice(0, 16);

// ── Nagebootste API-antwoorden: matrix ──────────────────────────────────────

const code = (c: string, omschrijving?: string) => (omschrijving ? { code: c, omschrijving } : { code: c });

function onderdeel(nummer: number, titel: string, extra: Rec = {}): Rec {
  return {
    structuuronderdeel_nummer: nummer,
    titel,
    api_url: `${STRUCTUUR_API}/structuuronderdeel/${nummer}`,
    begindatum: '2021-09-01',
    hoofdstructuren: [code('311', 'Secundair onderwijs'), code('321')],
    leerjaren: [code('2', 'Tweede leerjaar'), code('1', 'Eerste leerjaar')],
    ...extra,
  };
}

function groep(nummer: string, titel: string, velden: Rec, onderdelen: Rec[]): Rec {
  return { structuuronderdeel_groep_nummer: nummer, titel, ...velden, structuuronderdelen: onderdelen };
}

/** Zeven 7de jaren (404 in de koppeling): zo kan één groep verdwijnen zonder massaverlies (D6). */
const ZEVENDE = Array.from({ length: 7 }, (_, i) =>
  groep(`G-04${20 + i}`, `Zevende jaar ${i + 1}`, { graad: code('3'), type_7de_leerjaar: code('BSO_TIJDELIJK') }, [onderdeel(4200 + i, `Zevende jaar ${i + 1}`, { leerjaren: [code('3')] })]),
);

const BASIS_GROEPEN: Rec[] = [
  groep('G-0193', 'Natuurwetenschappen', { graad: code('2', 'Tweede graad'), finaliteit: code('DO') }, [onderdeel(247, 'Natuurwetenschappen', { ov4_mogelijk: true })]),
  groep('G-0117', 'Humane wetenschappen', { graad: code('2', 'Tweede graad'), finaliteit: code('DO') }, [onderdeel(129, 'Humane wetenschappen', { ov4_mogelijk: true })]),
  groep('G-0307', 'Eerste leerjaar A', { graad: code('1', 'Eerste graad') }, [onderdeel(379, 'Eerste leerjaar A', { begindatum: '2019-09-01', leerjaren: [code('1')] })]),
  groep('G-0009', 'Assistent plantaardige productie', { finaliteit: code('A'), opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } }, [
    onderdeel(9, 'Assistent plantaardige productie', { hoofdstructuren: [code('321')], leerjaren: [code('1')] }),
  ]),
  ...ZEVENDE,
];

const STRUCTUUR_PAD = '/kwalificaties-en-curriculum/structuuronderdelen/v2';

/** Pagina's in de vorm van de API (feiten A): de lijst onder structuuronderdeel_groepen, links.next.href met een spatie, meta. */
function matrixPaginas(groepen: Rec[], grootte = 5, basis = 'https://onderwijs.api.vlaanderen.be'): Rec[] {
  const aantal = Math.max(1, Math.ceil(groepen.length / grootte));
  const href = (n: number) => `${basis}${STRUCTUUR_PAD}/structuuronderdeelgroep?page=${n}&sort=titel asc`;
  return Array.from({ length: aantal }, (_, i) => {
    const lijst = groepen.slice(i * grootte, (i + 1) * grootte);
    const links: Rec = { self: { href: href(i + 1) } };
    if (i + 1 < aantal) links.next = { href: href(i + 2) };
    return { structuuronderdeel_groepen: lijst, links, meta: { total_elements: groepen.length, total_pages: aantal, number: i + 1, size: grootte, last: i + 1 === aantal } };
  });
}

// ── Nagebootste API-antwoorden: koppeling ───────────────────────────────────

function record(setId: string, doelId: string, extra: Rec = {}): Rec {
  const s = setVan(setId);
  const d = s.doelen.find((x) => x.id === doelId) as TestDoel;
  const buso = s.naam.startsWith('Buitengewoon');
  return {
    '@id': Number(d.id),
    code: d.code,
    omschrijving: `Doel ${d.code}`,
    onderwijsdoel_type: 'Eindtermen',
    onderwijsdoelenset: { onderwijsdoelenset_id: Number(s.id.slice(4)), onderwijsdoelenset: s.naam, onderwijsstructuur: { onderwijssoort: buso ? 'Buitengewoon' : '', graad: s.graad } },
    ...extra,
  };
}

const heleSet = (setId: string) => setVan(setId).doelen.map((d) => record(setId, d.id));
const pagina = (member: Rec[], totalItems: number = member.length): Rec => ({ gegevens: { member, totalItems } });

const RECORDS_G0193 = () => [record('ODS_9101', '9101001'), record('ODS_9101', '9101002'), ...heleSet('ODS_9102'), ...heleSet('ODS_9103')];
const RECORDS_G0117 = () => [record('ODS_9101', '9101003'), ...heleSet('ODS_9102'), ...heleSet('ODS_9103')];

function koppelingBron(groepen: Rec[] = BASIS_GROEPEN, over: Record<string, unknown> = {}, totaal: unknown = 24019): Rec {
  const uit: Record<string, unknown> = {};
  for (const g of groepen) uit[g.structuuronderdeel_groep_nummer as string] = { status: 404 };
  if (uit['G-0193']) uit['G-0193'] = pagina(RECORDS_G0193());
  if (uit['G-0117']) uit['G-0117'] = pagina(RECORDS_G0117());
  return { totaal, groepen: { ...uit, ...over } };
}

// ── Opstelling per test ─────────────────────────────────────────────────────

let teller = 0;
interface Opstelling { map: string; uit: string; rapport: string; matrix: string; koppeling: string }
function opstelling(naam: string): Opstelling {
  const map = join(TMP, `${++teller}-${naam}`);
  mkdirSync(map, { recursive: true });
  return { map, uit: join(map, 'uit'), rapport: join(map, 'rapport.json'), matrix: join(map, 'matrix.json'), koppeling: join(map, 'koppeling.json') };
}

interface BronRun { matrix?: unknown; koppeling?: unknown; args?: string[]; env?: Record<string, string | undefined>; nu?: string | null; vandaag?: string; md?: string }
function draaiBron(o: Opstelling, run: BronRun = {}): Uitkomst {
  const args = ['--minimumdoelen', run.md ?? MD, '--uit', o.uit, '--rapport', o.rapport, '--vandaag', run.vandaag ?? VANDAAG];
  if (run.matrix !== null) {
    writeFileSync(o.matrix, JSON.stringify(run.matrix ?? matrixPaginas(BASIS_GROEPEN)));
    args.push('--bron-matrix', o.matrix);
  }
  if (run.koppeling !== null) {
    writeFileSync(o.koppeling, JSON.stringify(run.koppeling ?? koppelingBron()));
    args.push('--bron-koppeling', o.koppeling);
  }
  if (run.nu !== null) args.push('--nu', run.nu ?? NU);
  return draai([...args, ...(run.args ?? [])], run.env);
}

const rapportVan = (o: Opstelling) => leesJson<Rec & { fout: string | null; problemen: string[]; waarschuwingen: string[]; koppeling: Rec; matrix: Rec }>(o.rapport);
const matrixVan = (o: Opstelling) => leesJson<MatrixBestand>(join(o.uit, 'studierichtingen.json'));
const indexVan = (o: Opstelling) => leesJson<RichtingDoelenIndex>(join(o.uit, 'richtingdoelen', 'index.json'));
const bestandVan = (o: Opstelling, g: string) => leesJson<RichtingDoelenBestand>(join(o.uit, 'richtingdoelen', `${g}.json`));
const regelVan = (o: Opstelling, g: string) => indexVan(o).groepen.find((r) => r.groep === g);

/** Een stop: de verwachte exitcode, een rapport met de fout, en verder niets geschreven. */
function eisStop(o: Opstelling, run: Uitkomst, code: number, melding: RegExp, voor: ReturnType<typeof momentopname> = {}) {
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(code);
  expect(run.stderr).toMatch(melding);
  expect(momentopname(o.uit)).toEqual(voor);
  const rapport = rapportVan(o);
  expect(rapport.fout).toMatch(melding);
}

/** Controleert de uitvoer op de vorm van § 3 en op de samenhang tussen index en bestanden (I1, I4, I5). */
function controleerUitvoer(uit: string) {
  const matrix = leesJson<MatrixBestand>(join(uit, 'studierichtingen.json'));
  expect(valideerMatrixBestand(matrix)).toEqual([]);
  expect(matrix.sha256).toBe(sha256Van({ groepen: matrix.groepen, onderdelen: matrix.onderdelen }));
  const index = leesJson<RichtingDoelenIndex>(join(uit, 'richtingdoelen', 'index.json'));
  expect(valideerRichtingDoelenIndex(index)).toEqual([]);
  expect(index.matrixSha256).toBe(matrix.sha256);
  expect(index.groepen.map((r) => r.groep)).toEqual(matrix.groepen.map((g) => g.nummer));
  const bestanden = readdirSync(join(uit, 'richtingdoelen')).filter((f) => f !== 'index.json').sort();
  expect(bestanden).toEqual(index.groepen.filter((r) => r.bestand).map((r) => r.bestand).sort());
  for (const r of index.groepen) {
    if (!r.bestand) continue;
    const b = leesJson<RichtingDoelenBestand>(join(uit, 'richtingdoelen', r.bestand));
    expect(valideerRichtingDoelenBestand(b, r.groep)).toEqual([]);
    expect(b.sha256).toBe(sha256Van(b.sets));
    if (r.status === 'gekoppeld') expect({ aantal: b.aantal, sets: b.sets.length, sha256: b.sha256, opgehaald: b.opgehaald, methode: b.methode }).toEqual({ aantal: r.aantal, sets: r.sets, sha256: r.sha256, opgehaald: r.opgehaald, methode: r.methode });
    else expect(b.nietMeerInBron).toBeDefined();
  }
  // Elke tekst eindigt op een regeleinde; de kop staat met 2 spaties, daarna één record per regel.
  for (const tekst of Object.values(inhoud(uit))) {
    expect(tekst.endsWith('}\n')).toBe(true);
    expect(tekst.startsWith('{\n  "app": "boosterz",\n')).toBe(true);
  }
}

beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), 'studierichtingen-script-'));
  MD = join(TMP, 'minimumdoelen');
  maakMinimumdoelen(MD);
});
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ── Met opgeslagen antwoorden (--bron-*) ────────────────────────────────────

describe('haal-studierichtingen.mjs met opgeslagen antwoorden', () => {
  it('schrijft de matrix, de index en de koppelingsbestanden zoals in § 3', () => {
    const o = opstelling('basis');
    const run = draaiBron(o);
    expect(run.status, run.stderr).toBe(0);
    controleerUitvoer(o.uit);

    const matrix = matrixVan(o);
    expect(matrix).toMatchObject({
      app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'https://onderwijs-api-portaal.vlaanderen.be/',
      api: `${STRUCTUUR_API}/structuuronderdeelgroep`, licentie: 'nog te bevestigen', opgehaald: NU, aantalGroepen: 11, aantalOnderdelen: 11,
    });
    expect(matrix.groepen.map((g) => g.nummer)).toEqual(['G-0009', 'G-0117', 'G-0193', 'G-0307', ...ZEVENDE.map((g) => g.structuuronderdeel_groep_nummer)]);
    const g0193 = matrix.groepen.find((g) => g.nummer === 'G-0193');
    expect(g0193).toEqual({ nummer: 'G-0193', titel: 'Natuurwetenschappen', graad: '2', finaliteit: 'DO', onderdelen: [247] });
    expect(matrix.onderdelen.find((o2) => o2.nummer === 247)).toMatchObject({ groep: 'G-0193', ov4: true, leerjaren: [{ code: '1' }, { code: '2' }], hoofdstructuren: ['311', '321'] });
    expect(JSON.stringify(matrix)).not.toContain('api_url');

    const index = indexVan(o);
    expect(index).toMatchObject({ kind: 'richtingdoelen-index', api: `${OFFICIELE_DOELEN_API}?structuuronderdeel_groep_nummer=` });
    expect(index.groepen.map((r) => [r.groep, r.status, r.methode ?? null])).toEqual([
      ['G-0009', 'geen', null],
      ['G-0117', 'gekoppeld', 'api'],
      ['G-0193', 'gekoppeld', 'api'],
      ['G-0307', 'gekoppeld', 'graad-en-stroom'],
      ...ZEVENDE.map((g) => [g.structuuronderdeel_groep_nummer, 'geen', null]),
    ]);
    expect(regelVan(o, 'G-0009')).toEqual({ groep: 'G-0009', status: 'geen', opgehaald: NU });

    const b = bestandVan(o, 'G-0193');
    expect(b).toMatchObject({ kind: 'richtingdoelen', groep: 'G-0193', titel: 'Natuurwetenschappen', graad: '2', methode: 'api', filter: 'structuuronderdeel_groep_nummer=G-0193', api: OFFICIELE_DOELEN_API, opgehaald: NU, aantal: 8 });
    expect(b.sets).toEqual([
      { set: 'ODS_9101', setSha: setSha('ODS_9101'), setAantal: 4, ids: ['9101001', '9101002'] },
      { set: 'ODS_9102', setSha: setSha('ODS_9102'), setAantal: 3, ids: ['9102001', '9102002', '9102003'] },
      { set: 'ODS_9103', onderwijssoort: 'Buitengewoon', setSha: setSha('ODS_9103'), setAantal: 3, ids: ['9102001', '9102002', '9102003'] },
    ]);
    const eerste = bestandVan(o, 'G-0307');
    expect(eerste).toMatchObject({ methode: 'graad-en-stroom', graad: '1', filter: 'graad=1ste graad; stroom=A-stroom (regel van Boosterz: de bron koppelt de 1ste graad niet per richting)' });
    expect(eerste.sets).toEqual([{ set: 'ODS_9104', setSha: setSha('ODS_9104'), setAantal: 2, ids: ['9104001', '9104002'] }]);

    const rapport = rapportVan(o);
    expect(rapport).toMatchObject({ bron: 'bestand', stand: 'alles', verzoeken: 0, fout: null, geschreven: { bestanden: 5 } });
    expect(typeof rapport.duurSeconden).toBe('number');
    const omvang = rapport.omvang as Record<string, number>;
    expect(omvang).toMatchObject({ koppelingBestanden: 3, matrixBytes: readFileSync(join(o.uit, 'studierichtingen.json')).length });
    expect(omvang.koppelingBytes).toBeGreaterThan(0);
    expect(rapport.matrix).toMatchObject({ paginas: 3, lijstPad: 'structuuronderdeel_groepen', totaalVolgensApi: 11, groepen: 11, perSoort: { gewoon: 3, zevende: 7, buso: 1, aanloop: 0, ander: 0 } });
    expect(rapport.koppeling).toMatchObject({ totaalZonderFilter: 24019, gekoppeld: 2, graadEnStroom: 1, geen: 8, nogNietOpgehaald: 0, geenPerSoort: { zevende: 7, buso: 1 } });
    expect(rapport.koppeling.eersteGraadPerStroom).toEqual({ A: 1, B: 0 });
    // Uit een bronbestand is {"status": 404} meteen het eindantwoord: geen tweede ronde.
    expect(rapport.koppeling.tweedeRonde).toEqual({ groepen: 0, verzoeken: 0 });
    expect(rapport.koppeling.ordeningskader).toEqual({ getagd: 2, groepen: 2, zonderKoppeling: [], nietMeegeteld: [] });
    expect(rapport.waarschuwingen.filter((w) => w.startsWith('D8'))).toEqual([]);
    expect(rapport.koppeling.kruiscontrole).toMatchObject({ setsBekeken: 1, verschillen: 0 });
  });

  it('een tweede run met dezelfde invoer raakt geen enkel bestand aan (bytes en wijzigingstijd)', () => {
    const o = opstelling('tweede-run');
    expect(draaiBron(o).status).toBe(0);
    const voor = momentopname(o.uit);
    const run = draaiBron(o, { nu: '2026-11-03T05:41:12Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(momentopname(o.uit)).toEqual(voor);
    expect(run.stdout).toMatch(/Geschreven: 0 bestanden/);
    expect(rapportVan(o).koppeling).toMatchObject({ nieuw: [], gewijzigd: [], ongewijzigd: ['G-0117', 'G-0193', 'G-0307'], index: 'ongewijzigd' });
  });

  it('de uitvoer hangt niet af van de volgorde van de invoer', () => {
    const a = opstelling('volgorde-a');
    expect(draaiBron(a).status).toBe(0);
    // Andere volgorde van groepen, onderdelen, leerjaren en records, en andere pagina's.
    const omgekeerd = kopie(BASIS_GROEPEN).reverse().map((g) => ({ ...g, structuuronderdelen: (g.structuuronderdelen as Rec[]).map((o2) => ({ ...o2, leerjaren: [...(o2.leerjaren as Rec[])].reverse() })).reverse() }));
    const r193 = RECORDS_G0193().reverse();
    const b = opstelling('volgorde-b');
    const run = draaiBron(b, {
      matrix: matrixPaginas(omgekeerd, 2),
      koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': [pagina(r193.slice(0, 5), 8), pagina(r193.slice(5), 8)], 'G-0117': pagina(RECORDS_G0117().reverse()) }),
    });
    expect(run.status, run.stderr).toBe(0);
    expect(inhoud(b.uit)).toEqual(inhoud(a.uit));
    // Ook een lijst groepen zonder pagina's geeft hetzelfde.
    const c = opstelling('volgorde-c');
    expect(draaiBron(c, { matrix: omgekeerd }).status).toBe(0);
    expect(inhoud(c.uit)).toEqual(inhoud(a.uit));
  });

  it('voegt letterlijk gelijke doelen samen en meldt dat', () => {
    const o = opstelling('dubbels');
    const records = [...RECORDS_G0193(), record('ODS_9102', '9102001')];
    const run = draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina(records) }) });
    expect(run.status, run.stderr).toBe(0);
    expect(bestandVan(o, 'G-0193').aantal).toBe(8);
    expect(rapportVan(o).koppeling).toMatchObject({ samengevoegdeDubbels: 1 });
  });

  describe('harde poorten: de juiste exitcode, en niets geschreven behalve het rapport', () => {
    it('geen enkele groep → 2', () => {
      const o = opstelling('geen-groepen');
      eisStop(o, draaiBron(o, { matrix: [{ structuuronderdeel_groepen: [], meta: { total_elements: 0 } }] }), 2, /Geen enkele groep ontvangen/);
      const o2 = opstelling('geen-groepen-lijst');
      eisStop(o2, draaiBron(o2, { matrix: [] }), 2, /Geen enkele groep ontvangen/);
    });

    it('matrix onvolledig (aantal groepen ≠ meta.total_elements) → 1', () => {
      const o = opstelling('matrix-onvolledig');
      const kort = matrixPaginas(BASIS_GROEPEN).slice(0, 2);
      eisStop(o, draaiBron(o, { matrix: kort }), 1, /Matrix onvolledig: 10 groepen ontvangen, maar meta\.total_elements zegt 11/);
    });

    it('L1: meta.total_elements ontbreekt → 3', () => {
      const o = opstelling('matrix-totaal');
      const paginas = matrixPaginas(BASIS_GROEPEN);
      delete (paginas[1].meta as Rec).total_elements;
      eisStop(o, draaiBron(o, { matrix: paginas }), 3, /L1: matrix, pagina 2: meta\.total_elements ontbreekt/);
    });

    it('L1: het lijstpad is niet duidelijk (twee lijsten, of een ander pad op een volgende pagina) → 3', () => {
      const o = opstelling('lijstpad');
      const paginas = matrixPaginas(BASIS_GROEPEN);
      paginas[0].ook = { groepen: [BASIS_GROEPEN[0]] };
      eisStop(o, draaiBron(o, { matrix: paginas }), 3, /L1: matrix, pagina 1: Op de pagina staan 2 lijsten met groepen/);
      const o2 = opstelling('lijstpad-2');
      const p2 = matrixPaginas(BASIS_GROEPEN);
      p2[1].groepen = p2[1].structuuronderdeel_groepen;
      delete p2[1].structuuronderdeel_groepen;
      eisStop(o2, draaiBron(o2, { matrix: p2 }), 3, /L1: matrix, pagina 2: de groepen staan onder "groepen", op pagina 1 onder "structuuronderdeel_groepen"/);
      const o3 = opstelling('lijstpad-3');
      eisStop(o3, draaiBron(o3, { matrix: [{ data: [], meta: { total_elements: 3 } }] }), 3, /L1: .*geen lijst met groepen/);
    });

    it('D1: een dubbel groepnummer, een onderdeel in twee groepen of een groep zonder geldig nummer → 3', () => {
      const o = opstelling('d1-groep');
      eisStop(o, draaiBron(o, { matrix: matrixPaginas([...BASIS_GROEPEN, kopie(BASIS_GROEPEN[0])]) }), 3, /D1: groep G-0193 staat er meer dan één keer in/);
      const o2 = opstelling('d1-onderdeel');
      const extra = groep('G-0500', 'Dubbel onderdeel', { graad: code('2') }, [onderdeel(247, 'Natuurwetenschappen')]);
      eisStop(o2, draaiBron(o2, { matrix: matrixPaginas([...BASIS_GROEPEN, extra]) }), 3, /D1: onderdeel 247 staat in groep G-0193 en in groep G-0500/);
      const o3 = opstelling('d1-nummer');
      const zonder = groep('G-12', 'Zonder geldig nummer', {}, [onderdeel(999, 'x')]);
      eisStop(o3, draaiBron(o3, { matrix: matrixPaginas([...BASIS_GROEPEN, zonder]) }), 3, /D1: Een groep \("Zonder geldig nummer"\) heeft geen geldig nummer/);
      const o4 = opstelling('d1-onderdeelnummer');
      const fout = groep('G-0501', 'Onderdeel zonder nummer', { graad: code('2') }, [{ ...onderdeel(501, 'x'), structuuronderdeel_nummer: 'abc' }]);
      eisStop(o4, draaiBron(o4, { matrix: matrixPaginas([...BASIS_GROEPEN, fout]) }), 3, /D1: Groep G-0501: onderdeel 1 .*geen geheel getal/);
    });

    it('koppeling onvolledig (aantal records ≠ totalItems, of dezelfde eerste record op twee pagina\'s) → 1', () => {
      const o = opstelling('koppeling-onvolledig');
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina(RECORDS_G0193(), 9) }) }), 1, /Koppeling onvolledig: G-0193: 8 doelen ontvangen, totalItems zegt 9/);
      const o2 = opstelling('koppeling-zelfde-pagina');
      const r = RECORDS_G0193();
      eisStop(o2, draaiBron(o2, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': [pagina(r.slice(0, 4), 8), pagina(r.slice(0, 4), 8)] }) }), 1, /Koppeling onvolledig: G-0193, pagina 2 begint met hetzelfde doel/);
    });

    it('L1: totalItems of het totaal zonder filter ontbreekt → 3', () => {
      const o = opstelling('totalitems');
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': { gegevens: { member: RECORDS_G0193() } } }) }), 3, /L1: G-0193: gegevens\.totalItems ontbreekt/);
      const o2 = opstelling('totaal-zonder-filter');
      eisStop(o2, draaiBron(o2, { koppeling: koppelingBron(BASIS_GROEPEN, {}, 'veel') }), 3, /L1: het totaal zonder filter \(totalItems\) ontbreekt/);
      const o3 = opstelling('geen-member');
      eisStop(o3, draaiBron(o3, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': { gegevens: { totalItems: 8, items: [] } } }) }), 3, /L1: G-0193, pagina 1: geen lijst met doelen/);
    });

    it('D2: de filter wordt genegeerd (totalItems ≥ het totaal zonder filter, of > 5000) → 3', () => {
      const o = opstelling('d2-totaal');
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina(RECORDS_G0193(), 24019) }) }), 3, /D2: G-0193 geeft 24019 doelen .*de filter lijkt niet meer te werken/);
      const o2 = opstelling('d2-5000');
      eisStop(o2, draaiBron(o2, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina(RECORDS_G0193(), 5001) }, 100000) }), 3, /D2: G-0193 geeft 5001 doelen/);
    });

    it('D3: een set of een nummer dat niet in de minimumdoelen staat → 3, met de melding dat ze achterlopen', () => {
      const o = opstelling('d3-set');
      const vreemd = record('ODS_9102', '9102001', { onderwijsdoelenset: { onderwijsdoelenset_id: 9999, onderwijsdoelenset: 'Onbekende set', onderwijsstructuur: { graad: '2de graad' } } });
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina([...RECORDS_G0193(), vreemd]) }) }), 3, /D3: G-0193: de set ODS_9999 staat niet in minimumdoelen\/index\.json.*lopen achter op de API\. Start de workflow met ‘alles’/);
      const o2 = opstelling('d3-nummer');
      const nieuw = record('ODS_9102', '9102001', { '@id': 9102999 });
      eisStop(o2, draaiBron(o2, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina([...RECORDS_G0193(), nieuw]) }) }), 3, /D3: G-0193, ODS_9102: 1 nummer\(s\) staan niet in het setbestand \(9102999\).*lopen achter/);
    });

    it('D4: de graad van een set verschilt van die van de groep → 3', () => {
      const o = opstelling('d4');
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina([...RECORDS_G0193(), ...heleSet('ODS_9106')]) }) }), 3, /D4: G-0193 \(graad 2\) krijgt ODS_9106 \(3de graad\)/);
    });

    it('D5: twee soorten onderwijs in één set van één groep → 3', () => {
      const o = opstelling('d5');
      const r = RECORDS_G0193();
      const anders = r.map((x, i) => (i === 2 ? record('ODS_9102', '9102001', { onderwijsdoelenset: { ...(x.onderwijsdoelenset as Rec), onderwijsstructuur: { onderwijssoort: 'Buitengewoon', graad: '2de graad' } } }) : x));
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina(anders) }) }), 3, /D5: G-0193, ODS_9102: meer dan één soort onderwijs \("\(leeg\)", "Buitengewoon"\)/);
    });

    it('D7: een doel zonder vast nummer of zonder set → 3', () => {
      const o = opstelling('d7-nummer');
      const zonder = record('ODS_9102', '9102001');
      delete zonder['@id'];
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina([...RECORDS_G0193().slice(1), zonder]) }) }), 3, /D7: G-0193, ODS_9102: een doel zonder vast nummer/);
      const o2 = opstelling('d7-set');
      const geenSet = record('ODS_9102', '9102001');
      delete geenSet.onderwijsdoelenset;
      eisStop(o2, draaiBron(o2, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': pagina([...RECORDS_G0193().slice(1), geenSet]) }) }), 3, /D7: G-0193: een doel zonder set/);
    });

    it('D6: massaverlies in de matrix (meer dan 10 % minder groepen) → 3, en het bestaande bestand blijft', () => {
      const o = opstelling('d6-matrix');
      expect(draaiBron(o).status).toBe(0);
      const voor = momentopname(o.uit);
      const minder = BASIS_GROEPEN.filter((g) => !String(g.structuuronderdeel_groep_nummer).startsWith('G-042')).concat(ZEVENDE.slice(0, 5));
      eisStop(o, draaiBron(o, { matrix: matrixPaginas(minder), koppeling: koppelingBron(minder) }), 3, /D6: het aantal groepen daalt van 11 naar 9/, voor);
    });

    it('D6: meer dan max(5, 10 %) van de gekoppelde groepen valt naar "geen" → 3', () => {
      const groepen = Array.from({ length: 7 }, (_, i) => groep(`G-06${10 + i}`, `Richting ${i + 1}`, { graad: code('2'), finaliteit: code('DO') }, [onderdeel(6100 + i, `Richting ${i + 1}`)]));
      const o = opstelling('d6-koppeling');
      const gekoppeld = Object.fromEntries(groepen.map((g) => [g.structuuronderdeel_groep_nummer as string, pagina(heleSet('ODS_9102'))]));
      // Zonder de getagde groepen van ODS_9101 in de matrix telt D8 hier niet mee.
      expect(draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: { totaal: 24019, groepen: gekoppeld } }).status).toBe(0);
      const voor = momentopname(o.uit);
      const alle404 = Object.fromEntries(groepen.map((g) => [g.structuuronderdeel_groep_nummer as string, { status: 404 }]));
      eisStop(o, draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: { totaal: 24019, groepen: alle404 } }), 3, /D6: 7 van de 7 gekoppelde groepen hebben nu geen doelen meer/, voor);
    });

    it('D6: bij een volledige run is minder dan de helft van de gewone groepen (2de en 3de graad) gekoppeld → 3', () => {
      const o = opstelling('d6-helft');
      const extra = groep('G-0201', 'Nog een richting', { graad: code('2'), finaliteit: code('DO') }, [onderdeel(201, 'Nog een richting')]);
      const groepen = [...BASIS_GROEPEN, extra];
      eisStop(o, draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: koppelingBron(groepen, { 'G-0117': { status: 404 } }) }), 3, /D6: maar 1 van de 3 gewone groepen van de 2de en 3de graad zijn gekoppeld/);
    });

    it('D8: een groep uit het ordeningskader zonder koppeling → 3 ("de filter lijkt niet meer te werken")', () => {
      const o = opstelling('d8');
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0117': { status: 404 } }) }), 3, /Ordeningskader zonder koppeling: de filter lijkt niet meer te werken: D8: G-0117 staat in het ordeningskader/);
      expect(rapportVan(o).problemen).toEqual(['D8: G-0117 staat in het ordeningskader van een geldige set, maar heeft geen koppeling.']);
    });

    it('D8: een getagde groep die niet meetelt, staat met de reden in de waarschuwingen (niet stil weg)', () => {
      // Doel 4 van ODS_9101 tagt vijf groepen die elk om een andere reden niet meetellen.
      const md = join(TMP, 'minimumdoelen-d8');
      const sets = SETS.map((s) => (s.id === 'ODS_9101' ? { ...s, doelen: doelen(9101, 4, { 1: ['G-0193'], 2: ['G-0193'], 3: ['G-0117'], 4: ['G-0009', 'G-0307', 'G-0420', 'G-0601', 'G-0602'] }) } : s));
      maakMinimumdoelen(md, sets);
      const afgebouwd = groep('G-0602', 'Afgebouwde richting', { graad: code('2'), finaliteit: code('DO') }, [onderdeel(602, 'Afgebouwde richting', { einddatum: '2025-08-31' })]);
      const groepen = [...BASIS_GROEPEN, afgebouwd];
      const o = opstelling('d8-niet-meegeteld');
      const run = draaiBron(o, { md, matrix: matrixPaginas(groepen), koppeling: koppelingBron(groepen) });
      expect(run.status, run.stderr).toBe(0);
      const verwacht = [
        { groep: 'G-0009', reden: 'is geen gewone groep (soort buso)' },
        { groep: 'G-0307', reden: 'hoort niet bij de 2de of 3de graad (graad 1)' },
        { groep: 'G-0420', reden: 'is geen gewone groep (soort zevende)' },
        { groep: 'G-0601', reden: 'staat niet in de matrix', nietInMatrix: true },
        { groep: 'G-0602', reden: 'is afgebouwd (elk onderdeel voorbij zijn einddatum op 2026-10-09)' },
      ];
      const rapport = rapportVan(o);
      expect(rapport.koppeling.ordeningskader).toEqual({ getagd: 7, groepen: 2, zonderKoppeling: [], nietMeegeteld: verwacht });
      const d8 = verwacht.map((x) => `D8: ${x.groep} staat in het ordeningskader van een geldige set, maar telt niet mee: ${x.reden}.`);
      expect(rapport.waarschuwingen.filter((w) => w.startsWith('D8'))).toEqual(d8);
      expect(run.stdout).toContain(`Let op: ${d8[3]}`);

      // Een maand later staat G-0117 niet meer in de bron: ook dat is een reden, met de datum.
      const zonder = groepen.filter((g) => g.structuuronderdeel_groep_nummer !== 'G-0117');
      const run2 = draaiBron(o, { md, matrix: matrixPaginas(zonder), koppeling: koppelingBron(zonder), nu: '2026-11-03T05:41:12Z', vandaag: '2026-11-03' });
      expect(run2.status, run2.stderr).toBe(0);
      const rapport2 = rapportVan(o);
      expect(rapport2.koppeling.ordeningskader).toMatchObject({ getagd: 7, groepen: 1, zonderKoppeling: [] });
      expect(rapport2.waarschuwingen).toContain('D8: G-0117 staat in het ordeningskader van een geldige set, maar telt niet mee: staat niet meer in de bron (sinds 2026-11-03).');
      // Een proefrun is geen volledige run: daar komt D8 niet aan bod.
      const run3 = draaiBron(o, { md, matrix: matrixPaginas(zonder), koppeling: koppelingBron(zonder), args: ['--groepen', 'G-0193'], nu: '2026-11-04T05:41:12Z', vandaag: '2026-11-04' });
      expect(run3.status, run3.stderr).toBe(0);
      expect(rapportVan(o).waarschuwingen.filter((w) => w.startsWith('D8'))).toEqual([]);
    });

    it('D8: een getagde groep die niet in de matrix staat → 3 vanaf 100 groepen; met 99 groepen een waarschuwing', () => {
      // G-0117 is getagd in ODS_9101, maar staat niet in de matrix; de rest is opvulling (7de jaren, 404).
      const vulling = (n: number) =>
        Array.from({ length: n }, (_, i) => groep(`G-2${String(i).padStart(3, '0')}`, `Opvulling ${i + 1}`, { graad: code('3'), type_7de_leerjaar: code('BSO_TIJDELIJK') }, [onderdeel(20000 + i, `Opvulling ${i + 1}`, { leerjaren: [code('3')] })]));
      const zonderG0117 = BASIS_GROEPEN.filter((g) => g.structuuronderdeel_groep_nummer !== 'G-0117');
      const melding = 'D8: G-0117 staat in het ordeningskader van een geldige set, maar telt niet mee: staat niet in de matrix.';

      const groepen99 = [...zonderG0117, ...vulling(99 - zonderG0117.length)];
      const o99 = opstelling('d8-99');
      const run99 = draaiBron(o99, { matrix: matrixPaginas(groepen99, 50), koppeling: koppelingBron(groepen99) });
      expect(run99.status, run99.stderr).toBe(0);
      expect(matrixVan(o99).aantalGroepen).toBe(99);
      expect(rapportVan(o99).waarschuwingen).toContain(melding);

      const groepen100 = [...zonderG0117, ...vulling(100 - zonderG0117.length)];
      const o100 = opstelling('d8-100');
      const run100 = draaiBron(o100, { matrix: matrixPaginas(groepen100, 50), koppeling: koppelingBron(groepen100) });
      eisStop(o100, run100, 3, /Ordeningskader niet in de matrix: D8: G-0117 staat in het ordeningskader van een geldige set, maar niet in de matrix \(100 groepen\)\. De matrix is onvolledig/);
      const rapport = rapportVan(o100);
      expect(rapport.problemen).toEqual(['D8: G-0117 staat in het ordeningskader van een geldige set, maar niet in de matrix (100 groepen).']);
      expect(rapport.waarschuwingen).toContain(melding);
    });

    it('een andere HTTP-status in de bron, of geen antwoord voor een groep → 1', () => {
      const o = opstelling('bron-500');
      eisStop(o, draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0193': { status: 500 } }) }), 1, /G-0193: de bron antwoordt met HTTP 500/);
      const o2 = opstelling('bron-ontbreekt');
      const k = koppelingBron();
      delete (k.groepen as Rec)['G-0117'];
      eisStop(o2, draaiBron(o2, { koppeling: k }), 1, /heeft geen antwoord voor G-0117/);
    });

    it('de sleutel in de gegevens → 1; de sleutel staat nergens in de uitvoer', () => {
      const o = opstelling('sleutel-in-gegevens');
      const groepen = kopie(BASIS_GROEPEN);
      groepen[0].titel = `Natuurwetenschappen ${SLEUTEL}`;
      const run = draaiBron(o, { matrix: matrixPaginas(groepen), env: { ONDERWIJSDOELEN_API_KEY: SLEUTEL } });
      eisStop(o, run, 1, /De opgehaalde gegevens bevatten de API-sleutel/);
      expect(alleUitvoer(run, o.rapport, o.uit)).not.toContain(SLEUTEL);
    });
  });

  describe('404, de 1ste graad en verdwenen gegevens', () => {
    it('twee keer 404: "geen", en een bestaand bestand blijft staan met nietMeerInBron (tot het terugkomt)', () => {
      const o = opstelling('geen-blijft');
      expect(draaiBron(o).status).toBe(0);
      const sets = bestandVan(o, 'G-0117').sets;
      // G-0117 valt weg; de 404-regel van D8 geldt niet voor een proefrun met --groepen.
      const run = draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0117': { status: 404 } }), args: ['--groepen', 'G-0117'], nu: '2026-11-03T05:41:12Z', vandaag: '2026-11-03' });
      expect(run.status, run.stderr).toBe(0);
      expect(regelVan(o, 'G-0117')).toEqual({ groep: 'G-0117', status: 'geen', opgehaald: '2026-11-03T05:41:12Z', nietMeerInBron: '2026-11-03', bestand: 'G-0117.json' });
      const b = bestandVan(o, 'G-0117');
      expect(b).toMatchObject({ nietMeerInBron: '2026-11-03', opgehaald: NU, methode: 'api' });
      expect(b.sets).toEqual(sets);
      expect(rapportVan(o).koppeling).toMatchObject({ nuZonderDoelen: ['G-0117'], geenPerSoort: { gewoon: 1 } });
      controleerUitvoer(o.uit);

      // Een maand later, nog steeds 404: de datum blijft, er verandert niets.
      const voor = momentopname(o.uit);
      const run2 = draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0117': { status: 404 } }), args: ['--groepen', 'G-0117'], nu: '2026-12-03T05:41:12Z', vandaag: '2026-12-03' });
      expect(run2.status, run2.stderr).toBe(0);
      expect(momentopname(o.uit)).toEqual(voor);

      // De koppeling komt terug: het veld valt weg.
      const run3 = draaiBron(o, { nu: '2027-01-03T05:41:12Z', vandaag: '2027-01-03' });
      expect(run3.status, run3.stderr).toBe(0);
      expect(bestandVan(o, 'G-0117').nietMeerInBron).toBeUndefined();
      expect(regelVan(o, 'G-0117')).toMatchObject({ status: 'gekoppeld', opgehaald: '2027-01-03T05:41:12Z' });
      controleerUitvoer(o.uit);
    });

    it('de 1ste graad krijgt de methode graad-en-stroom; bij 200 de methode api, met een melding', () => {
      const o = opstelling('eerste-graad-api');
      const run = draaiBron(o, { koppeling: koppelingBron(BASIS_GROEPEN, { 'G-0307': pagina(heleSet('ODS_9104')) }) });
      expect(run.status, run.stderr).toBe(0);
      expect(bestandVan(o, 'G-0307')).toMatchObject({ methode: 'api', filter: 'structuuronderdeel_groep_nummer=G-0307' });
      expect(rapportVan(o).koppeling).toMatchObject({ eersteGraadNuGekoppeld: ['G-0307'] });
      expect(run.stdout).toMatch(/Let op: G-0307 \(1ste graad\) heeft nu wél een koppeling in de bron/);
    });

    it('een verdwenen groep of onderdeel blijft staan met nietMeerInBron; de datum blijft; wat terugkomt, verliest het veld', () => {
      const o = opstelling('verdwenen');
      expect(draaiBron(o).status).toBe(0);
      // G-0009 verdwijnt; G-0193 krijgt onderdeel 248 in plaats van 247; G-0117 wordt afgebouwd.
      const zonder = kopie(BASIS_GROEPEN).filter((g) => g.structuuronderdeel_groep_nummer !== 'G-0009');
      zonder[0].structuuronderdelen = [onderdeel(248, 'Natuurwetenschappen (nieuw)')];
      zonder[1].structuuronderdelen = [onderdeel(129, 'Humane wetenschappen', { ov4_mogelijk: true, einddatum: '2026-10-31' })];
      const run = draaiBron(o, { matrix: matrixPaginas(zonder), koppeling: koppelingBron(zonder), nu: '2026-11-03T05:41:12Z', vandaag: '2026-11-03' });
      expect(run.status, run.stderr).toBe(0);
      const m = matrixVan(o);
      expect(m.groepen.find((g) => g.nummer === 'G-0009')).toMatchObject({ nietMeerInBron: '2026-11-03', onderdelen: [9] });
      expect(m.onderdelen.find((x) => x.nummer === 9)).toMatchObject({ groep: 'G-0009', nietMeerInBron: '2026-11-03' });
      expect(m.groepen.find((g) => g.nummer === 'G-0193')).toMatchObject({ onderdelen: [247, 248] });
      expect(m.groepen.find((g) => g.nummer === 'G-0193')?.nietMeerInBron).toBeUndefined();
      expect(m.onderdelen.find((x) => x.nummer === 247)).toMatchObject({ nietMeerInBron: '2026-11-03' });
      expect(regelVan(o, 'G-0009')).toEqual({ groep: 'G-0009', status: 'geen', opgehaald: NU });
      expect(rapportVan(o).matrix).toMatchObject({ nietMeerInBron: ['G-0009'], onderdelenNietMeerInBron: [9, 247], nieuw: [], gewijzigd: ['G-0117', 'G-0193'], afgebouwdSindsVorige: ['G-0117'] });
      controleerUitvoer(o.uit);

      const voor = momentopname(o.uit);
      expect(draaiBron(o, { matrix: matrixPaginas(zonder), koppeling: koppelingBron(zonder), nu: '2026-12-03T05:41:12Z', vandaag: '2026-12-03' }).status).toBe(0);
      expect(momentopname(o.uit)).toEqual(voor);

      const terug = draaiBron(o, { nu: '2027-01-03T05:41:12Z', vandaag: '2027-01-03' });
      expect(terug.status, terug.stderr).toBe(0);
      const m2 = matrixVan(o);
      expect(m2.groepen.find((g) => g.nummer === 'G-0009')?.nietMeerInBron).toBeUndefined();
      expect(m2.onderdelen.find((x) => x.nummer === 248)).toMatchObject({ nietMeerInBron: '2027-01-03' });
      expect(rapportVan(o).matrix).toMatchObject({ terugInBron: ['G-0009'] });
      controleerUitvoer(o.uit);
    });

    it('een verdwenen groep waarvan elk onderdeel nu in een andere groep staat → 3', () => {
      const o = opstelling('verhuisd');
      expect(draaiBron(o).status).toBe(0);
      const voor = momentopname(o.uit);
      const groepen = kopie(BASIS_GROEPEN).filter((g) => g.structuuronderdeel_groep_nummer !== 'G-0009');
      groepen.push(groep('G-0010', 'Assistent plantaardige productie (nieuw)', { opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } }, [onderdeel(9, 'Assistent plantaardige productie', { hoofdstructuren: [code('321')] })]));
      eisStop(o, draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: koppelingBron(groepen) }), 3, /D1: groep G-0009 staat niet meer in de bron en al haar onderdelen staan nu in een andere groep/, voor);
    });
  });

  describe('--alleen, --groepen en de opties', () => {
    it('--alleen matrix werkt de matrix en de index bij, zonder de koppeling', () => {
      const o = opstelling('alleen-matrix');
      expect(draaiBron(o).status).toBe(0);
      const g0193 = momentopname(join(o.uit, 'richtingdoelen'))['G-0193.json'];
      const nieuw = groep('G-0202', 'Nieuwe richting', { graad: code('2'), finaliteit: code('DU') }, [onderdeel(202, 'Nieuwe richting')]);
      const run = draaiBron(o, { matrix: matrixPaginas([...BASIS_GROEPEN, nieuw]), koppeling: null, args: ['--alleen', 'matrix'], nu: '2026-11-03T05:41:12Z' });
      expect(run.status, run.stderr).toBe(0);
      expect(regelVan(o, 'G-0202')).toEqual({ groep: 'G-0202', status: 'nog-niet-opgehaald' });
      expect(indexVan(o).matrixSha256).toBe(matrixVan(o).sha256);
      expect(regelVan(o, 'G-0193')).toMatchObject({ status: 'gekoppeld', opgehaald: NU });
      expect(momentopname(join(o.uit, 'richtingdoelen'))['G-0193.json']).toEqual(g0193);
      expect(rapportVan(o).koppeling).toMatchObject({ verzoeken: 0, nogNietOpgehaald: 1 });
      controleerUitvoer(o.uit);

      // Daarna --alleen koppeling: leest het bestaande matrixbestand en koppelt de nieuwe groep.
      const run2 = draaiBron(o, { matrix: null, koppeling: koppelingBron([...BASIS_GROEPEN, nieuw], { 'G-0202': pagina(heleSet('ODS_9102')) }), args: ['--alleen', 'koppeling'], nu: '2026-11-04T05:41:12Z' });
      expect(run2.status, run2.stderr).toBe(0);
      expect(regelVan(o, 'G-0202')).toMatchObject({ status: 'gekoppeld', methode: 'api', aantal: 3, opgehaald: '2026-11-04T05:41:12Z' });
      expect(rapportVan(o).matrix).toMatchObject({ bestand: 'niet opgehaald (--alleen koppeling)' });
      controleerUitvoer(o.uit);
    });

    it('--groepen koppelt alleen die groepen en raakt de andere bestanden niet aan', () => {
      const o = opstelling('groepen');
      expect(draaiBron(o).status).toBe(0);
      const voor = momentopname(o.uit);
      const nieuw = groep('G-0203', 'Nog niet opgehaald', { graad: code('2'), finaliteit: code('DO') }, [onderdeel(203, 'Nog niet opgehaald')]);
      const groepen = [...BASIS_GROEPEN, nieuw];
      // G-0193 verandert (één doel minder); G-0117 zou ook veranderen, maar hoort niet bij de proefrun.
      const k = koppelingBron(groepen, { 'G-0193': pagina(RECORDS_G0193().slice(1)), 'G-0117': { status: 404 } });
      const run = draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: k, args: ['--groepen', 'G-0193'], nu: '2026-11-03T05:41:12Z' });
      expect(run.status, run.stderr).toBe(0);
      const na = momentopname(o.uit);
      for (const pad of ['richtingdoelen/G-0117.json', 'richtingdoelen/G-0307.json']) expect(na[pad]).toEqual(voor[pad]);
      expect(na['richtingdoelen/G-0193.json']).not.toEqual(voor['richtingdoelen/G-0193.json']);
      expect(regelVan(o, 'G-0117')).toMatchObject({ status: 'gekoppeld', opgehaald: NU });
      expect(regelVan(o, 'G-0193')).toMatchObject({ status: 'gekoppeld', aantal: 7, opgehaald: '2026-11-03T05:41:12Z' });
      expect(regelVan(o, 'G-0203')).toEqual({ groep: 'G-0203', status: 'nog-niet-opgehaald' });
      expect(rapportVan(o)).toMatchObject({ proefrunGroepen: ['G-0193'], koppeling: { gewijzigd: ['G-0193'] } });
      // De regel van G-0307 komt uit de vorige run: hij telt mee, met de stroom uit zijn bestand.
      expect(rapportVan(o).koppeling).toMatchObject({ graadEnStroom: 1, eersteGraadPerStroom: { A: 1, B: 0 } });
      controleerUitvoer(o.uit);
    });

    it('eersteGraadPerStroom telt de groepen met methode graad-en-stroom per stroom, over de hele index', () => {
      const b = groep('G-0308', 'Eerste leerjaar B', { graad: code('1', 'Eerste graad') }, [onderdeel(380, 'Eerste leerjaar B', { begindatum: '2019-09-01', leerjaren: [code('1')] })]);
      const a2 = groep('G-0311', 'Tweede leerjaar A', { graad: code('1', 'Eerste graad') }, [onderdeel(908, 'Tweede leerjaar A', { leerjaren: [code('2')] })]);
      const groepen = [...BASIS_GROEPEN, b, a2];
      const o = opstelling('per-stroom');
      const run = draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: koppelingBron(groepen) });
      expect(run.status, run.stderr).toBe(0);
      expect(rapportVan(o).koppeling).toMatchObject({ graadEnStroom: 3, eersteGraadPerStroom: { A: 2, B: 1 } });
      expect(bestandVan(o, 'G-0308').sets.map((s) => s.set)).toEqual(['ODS_9105']);
      expect(run.stdout).toMatch(/1ste graad per stroom 3 \(A 2, B 1\)/);
      // --alleen matrix koppelt niets, maar telt de regels die er al staan.
      const run2 = draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: null, args: ['--alleen', 'matrix'], nu: '2026-11-03T05:41:12Z' });
      expect(run2.status, run2.stderr).toBe(0);
      expect(rapportVan(o).koppeling).toMatchObject({ graadEnStroom: 3, eersteGraadPerStroom: { A: 2, B: 1 } });
      // G-0308 krijgt nu wél doelen in de bron: methode api, en niet meer bij de stroom B.
      const run3 = draaiBron(o, { matrix: matrixPaginas(groepen), koppeling: koppelingBron(groepen, { 'G-0308': pagina(heleSet('ODS_9105')) }), nu: '2026-11-04T05:41:12Z' });
      expect(run3.status, run3.stderr).toBe(0);
      expect(rapportVan(o).koppeling).toMatchObject({ graadEnStroom: 2, eersteGraadPerStroom: { A: 2, B: 0 }, eersteGraadNuGekoppeld: ['G-0308'] });
    });

    it('ongeldige opties → 1, en niets geschreven', () => {
      const gevallen: [string, BronRun, RegExp][] = [
        ['groepen-vorm', { args: ['--groepen', 'G-12'] }, /--groepen is ongeldig: elk groepnummer heeft de vorm G-0117/],
        ['groepen-te-veel', { args: ['--groepen', Array.from({ length: 51 }, (_, i) => `G-${String(1000 + i)}`).join(',')] }, /hoogstens 50 groepen/],
        ['groepen-dubbel', { args: ['--groepen', 'G-0193,G-0193'] }, /een groep staat er meer dan één keer in/],
        ['groepen-onbekend', { args: ['--groepen', 'G-0999'] }, /G-0999 staat niet \(meer\) in de matrix/],
        ['groepen-matrix', { koppeling: null, args: ['--alleen', 'matrix', '--groepen', 'G-0193'] }, /--groepen past niet bij --alleen matrix/],
        ['alleen', { args: ['--alleen', 'alle'] }, /--alleen moet "alles", "matrix" of "koppeling" zijn/],
        ['koppeling-zonder-matrix', { matrix: null, args: ['--alleen', 'koppeling'] }, /--alleen koppeling heeft het matrixbestand nodig/],
        ['bron-matrix-bij-koppeling', { args: ['--alleen', 'koppeling'] }, /--bron-matrix past niet bij --alleen koppeling/],
        ['vandaag', { vandaag: '2026-02-30' }, /--vandaag moet een datum JJJJ-MM-DD zijn/],
        ['nu', { nu: '9 oktober' }, /--nu moet een tijdstip/],
        ['nu-met-api', { koppeling: null }, /--nu kan alleen als niets via de API gaat/],
        ['onbekend', { args: ['--snel'] }, /Onbekende optie: --snel/],
        ['dubbel', { args: ['--vandaag', '2026-10-10'] }, /De optie --vandaag staat er meer dan één keer/],
        ['geen-sleutel', { koppeling: null, nu: null }, /ONDERWIJSDOELEN_API_KEY ontbreekt/],
      ];
      for (const [naam, run, melding] of gevallen) {
        const o = opstelling(`optie-${naam}`);
        const uitkomst = draaiBron(o, run);
        expect(uitkomst.status, `${naam}: ${uitkomst.stderr}`).toBe(1);
        expect(uitkomst.stderr, naam).toMatch(melding);
        expect(existsSync(o.uit), naam).toBe(false);
      }
    });

    it('een kapotte bestaande toestand → 1, en er wordt niets bijgeschreven', () => {
      const o = opstelling('kapot');
      expect(draaiBron(o).status).toBe(0);
      writeFileSync(join(o.uit, 'richtingdoelen', 'G-0999.json'), readFileSync(join(o.uit, 'richtingdoelen', 'G-0193.json'), 'utf8').replace(/G-0193/g, 'G-0999'));
      const voor = momentopname(o.uit);
      eisStop(o, draaiBron(o), 1, /De bestaande bestanden in .* kloppen niet: .*G-0999/, voor);
      const o2 = opstelling('kapot-index');
      expect(draaiBron(o2).status).toBe(0);
      rmSync(join(o2.uit, 'studierichtingen.json'));
      const voor2 = momentopname(o2.uit);
      eisStop(o2, draaiBron(o2), 1, /De index van de koppeling staat er, maar studierichtingen\.json niet/, voor2);
    });
  });
});

// ── Met een nagebootste http-API ────────────────────────────────────────────

describe('haal-studierichtingen.mjs tegen een nagebootste http-API', () => {
  interface Verzoek { url: string; headers: IncomingHttpHeaders }
  type Gedrag = (req: IncomingMessage, res: ServerResponse, url: URL, nr: number) => void;
  let server: Server;
  let ander: Server;
  let basis = '';
  let anderBasis = '';
  let verzoeken: Verzoek[] = [];
  let anderVerzoeken: Verzoek[] = [];
  let gedrag: Gedrag;
  let groepen: Rec[] = BASIS_GROEPEN;
  let koppeling: Rec = koppelingBron();

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  /** De groepnummers van de verzoeken naar de koppeling, in de volgorde waarin ze binnenkwamen. */
  const groepVolgorde = (lijst: Verzoek[]) =>
    lijst.map((v) => new URL(v.url, 'http://127.0.0.1').searchParams.get('structuuronderdeel_groep_nummer')).filter((g): g is string => g !== null);
  /** De groepen van BASIS_GROEPEN in de volgorde van het script (vergelijkGroepnummer). */
  const ALLE_BASIS = BASIS_GROEPEN.map((g) => g.structuuronderdeel_groep_nummer as string).sort();

  /** De standaard-API: matrix in pagina's van 5 met een spatie in links.next.href, en de koppeling uit `koppeling`. */
  const standaard: Gedrag = (_req, res, url) => {
    if (url.pathname === `${STRUCTUUR_PAD}/structuuronderdeelgroep`) {
      const paginas = matrixPaginas(groepen, 5, basis);
      const nr = Number(url.searchParams.get('page') ?? '1');
      if (!paginas[nr - 1]) return json(res, 404, { fout: 'geen pagina' });
      return json(res, 200, paginas[nr - 1]);
    }
    if (url.pathname === '/onderwijsdoelen/onderwijsdoel') {
      const g = url.searchParams.get('structuuronderdeel_groep_nummer');
      if (g === null) return json(res, 200, pagina([{ '@id': 1 }], koppeling.totaal as number));
      const antwoord = (koppeling.groepen as Rec)[g];
      if (antwoord === undefined || (antwoord as Rec).status === 404) return json(res, 404, { message: 'Not Found' });
      const lijst = Array.isArray(antwoord) ? antwoord : [antwoord];
      const nr = Number(url.searchParams.get('paginanr'));
      return lijst[nr - 1] ? json(res, 200, lijst[nr - 1]) : json(res, 404, { message: 'Not Found' });
    }
    json(res, 404, { fout: 'onbekend pad' });
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      verzoeken.push({ url: req.url ?? '', headers: req.headers });
      gedrag(req, res, new URL(req.url ?? '/', basis), verzoeken.length);
    });
    ander = createServer((req, res) => {
      anderVerzoeken.push({ url: req.url ?? '', headers: req.headers });
      json(res, 200, {});
    });
    await new Promise<void>((klaar) => server.listen(0, '127.0.0.1', klaar));
    await new Promise<void>((klaar) => ander.listen(0, '127.0.0.1', klaar));
    basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    anderBasis = `http://127.0.0.1:${(ander.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((klaar) => server.close(klaar));
    await new Promise((klaar) => ander.close(klaar));
  });

  async function haal(naam: string, args: string[] = [], env: Record<string, string | undefined> = {}) {
    verzoeken = [];
    anderVerzoeken = [];
    const o = opstelling(naam);
    const run = await draaiAsync(['--minimumdoelen', MD, '--uit', o.uit, '--rapport', o.rapport, '--vandaag', VANDAAG, ...args], {
      ONDERWIJSDOELEN_API_KEY: SLEUTEL,
      ONDERWIJSDOELEN_API_BASE: `${basis}/onderwijsdoelen`,
      STRUCTUURONDERDELEN_API_BASE: `${basis}${STRUCTUUR_PAD}`,
      ...env,
    });
    return { o, run };
  }

  const begin = () => {
    groepen = BASIS_GROEPEN;
    koppeling = koppelingBron();
    gedrag = standaard;
  };

  it('haalt alles op met de sleutel, volgt links.next.href met een spatie als %20, en lekt de sleutel nergens', async () => {
    begin();
    const { o, run } = await haal('api-ok');
    expect(run.status, run.stderr).toBe(0);
    controleerUitvoer(o.uit);
    const urls = verzoeken.map((v) => v.url);
    expect(urls.slice(0, 3)).toEqual([
      `${STRUCTUUR_PAD}/structuuronderdeelgroep`,
      `${STRUCTUUR_PAD}/structuuronderdeelgroep?page=2&sort=titel%20asc`,
      `${STRUCTUUR_PAD}/structuuronderdeelgroep?page=3&sort=titel%20asc`,
    ]);
    expect(urls[3]).toBe('/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=1');
    expect(urls).toContain('/onderwijsdoelen/onderwijsdoel?paginanr=1&rijen_per_pagina=500&structuuronderdeel_groep_nummer=G-0193');
    // 404 bij een groep: één nieuwe poging, pas in de tweede ronde (na alle groepen). De 9 groepen met een
    // 404 (8 zonder doelen en G-0307 van de 1ste graad) geven elk 2 verzoeken.
    expect(urls.filter((u) => u.endsWith('G-0009'))).toHaveLength(2);
    const met404 = ['G-0009', 'G-0307', ...ZEVENDE.map((g) => g.structuuronderdeel_groep_nummer as string)];
    expect(groepVolgorde(verzoeken)).toEqual([...ALLE_BASIS, ...met404]);
    expect(run.stdout).toMatch(/G-0009: 404 op pagina 1; nog één poging in de tweede ronde\./);
    expect(run.stdout).toMatch(/Tweede ronde: 9 groepen met een 404 op pagina 1, 9 verzoeken\./);
    expect(rapportVan(o).koppeling).toMatchObject({ tweedeRonde: { groepen: 9, verzoeken: 9 }, gekoppeld: 2, graadEnStroom: 1, geen: 8, eersteGraadPerStroom: { A: 1, B: 0 } });
    for (const v of verzoeken) {
      expect(v.headers['x-api-key']).toBe(SLEUTEL);
      expect(v.headers.accept).toBe('application/json');
    }
    expect(bestandVan(o, 'G-0193').api).toBe(OFFICIELE_DOELEN_API); // niet de testbasis
    expect(matrixVan(o).api).toBe(`${STRUCTUUR_API}/structuuronderdeelgroep`);
    const rapport = rapportVan(o);
    expect(rapport).toMatchObject({ bron: 'api', verzoeken: verzoeken.length, matrix: { verzoeken: 3 }, koppeling: { verzoeken: verzoeken.length - 3, voorbeeld404: '{"message":"Not Found"}' } });
    expect(alleUitvoer(run, o.rapport, o.uit)).not.toContain(SLEUTEL);
  });

  it('een volgende-link naar een andere origin → 1, zonder verzoek naar die origin', async () => {
    begin();
    gedrag = (req, res, url, nr) => {
      if (url.pathname.endsWith('/structuuronderdeelgroep')) {
        const p = matrixPaginas(groepen, 5, basis)[0];
        p.links = { next: { href: `${anderBasis}${STRUCTUUR_PAD}/structuuronderdeelgroep?page=2` } };
        return json(res, 200, p);
      }
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-andere-origin');
    eisStop(o, run, 1, /Matrix, pagina 1: de volgende pagina staat op een andere origin/);
    expect(verzoeken).toHaveLength(1);
    expect(anderVerzoeken).toHaveLength(0);
  });

  it('een lus in de paginering → 1', async () => {
    begin();
    gedrag = (req, res, url, nr) => {
      if (url.pathname.endsWith('/structuuronderdeelgroep') && url.searchParams.get('page') === '2') {
        const p = matrixPaginas(groepen, 5, basis)[1];
        p.links = { next: { href: `${basis}${STRUCTUUR_PAD}/structuuronderdeelgroep?page=2&sort=titel asc` } };
        return json(res, 200, p);
      }
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-lus');
    eisStop(o, run, 1, /Matrix, pagina 3: die pagina is al opgehaald \(een lus in de paginering\)/);
    expect(verzoeken).toHaveLength(2);
  });

  it('een antwoord dat geen JSON is → 1', async () => {
    begin();
    gedrag = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>onderhoud</html>');
    };
    const { o, run } = await haal('api-geen-json');
    eisStop(o, run, 1, /Matrix, pagina 1: het antwoord is geen geldige JSON/);
  });

  it('een doorverwijzing → 1, zonder tweede verzoek', async () => {
    begin();
    gedrag = (_req, res) => {
      res.writeHead(302, { location: `${anderBasis}/elders` });
      res.end();
    };
    const { o, run } = await haal('api-doorverwijzing');
    eisStop(o, run, 1, /de API stuurt door \(HTTP 302 naar http:\/\/127\.0\.0\.1:\d+\)\. Het script volgt geen doorverwijzingen/);
    expect(verzoeken).toHaveLength(1);
    expect(anderVerzoeken).toHaveLength(0);
  });

  it('401 → 1 zonder nieuwe poging, en de sleutel uit het antwoord lekt niet', async () => {
    begin();
    gedrag = (_req, res) => json(res, 401, { message: `sleutel ${SLEUTEL} is ongeldig` });
    const { o, run } = await haal('api-401');
    eisStop(o, run, 1, /de API weigert de sleutel \(HTTP 401\)/);
    expect(verzoeken).toHaveLength(1);
    expect(alleUitvoer(run, o.rapport)).not.toContain(SLEUTEL);
  });

  it('probeert het opnieuw bij 503 en 429', async () => {
    begin();
    gedrag = (req, res, url, nr) => {
      if (nr === 1) return json(res, 503, {});
      if (nr === 2) return json(res, 429, {});
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-opnieuw');
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Matrix, pagina 1: opnieuw proberen \(1\/4\) na HTTP 503/);
    expect(run.stdout).toMatch(/opnieuw proberen \(2\/4\) na HTTP 429/);
    controleerUitvoer(o.uit);
  });

  it('één keer 404 en daarna 200 → gekoppeld (in de tweede ronde); twee keer 404 → geen', async () => {
    begin();
    // G-0193 in twee pagina's: in de tweede ronde tellen beide verzoeken mee.
    const r = RECORDS_G0193();
    koppeling = koppelingBron(BASIS_GROEPEN, { 'G-0193': [pagina(r.slice(0, 5), 8), pagina(r.slice(5), 8)] });
    let eerste = true;
    gedrag = (req, res, url, nr) => {
      if (url.searchParams.get('structuuronderdeel_groep_nummer') === 'G-0193' && eerste) {
        eerste = false;
        return json(res, 404, { message: 'Not Found' });
      }
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-404-200');
    expect(run.status, run.stderr).toBe(0);
    expect(verzoeken.filter((v) => v.url.includes('G-0193'))).toHaveLength(3);
    // De eerste ronde vraagt alle groepen; de tweede ronde de groepen met een 404, in volgorde.
    const tweede = ['G-0009', 'G-0193', 'G-0193', 'G-0307', ...ZEVENDE.map((g) => g.structuuronderdeel_groep_nummer as string)];
    expect(groepVolgorde(verzoeken)).toEqual([...ALLE_BASIS, ...tweede]);
    expect(regelVan(o, 'G-0193')).toMatchObject({ status: 'gekoppeld', methode: 'api', aantal: 8 });
    expect(regelVan(o, 'G-0009')).toMatchObject({ status: 'geen' });
    const rapport = rapportVan(o);
    expect(rapport.waarschuwingen).toContain('G-0193: eerst 404, bij de nieuwe poging wel doelen.');
    // 10 groepen in de tweede ronde; G-0193 heeft er 2 pagina's, dus 11 verzoeken.
    expect(rapport.koppeling).toMatchObject({ tweedeRonde: { groepen: 10, verzoeken: 11 }, gekoppeld: 2, graadEnStroom: 1, geen: 8 });
    controleerUitvoer(o.uit);
  });

  it('een stop in de tweede ronde → 1, niets geschreven, en de telling van de tweede ronde staat in het rapport', async () => {
    begin();
    let g0009 = 0;
    gedrag = (req, res, url, nr) => {
      // G-0009: eerst 404 (eerste ronde), daarna altijd 503 (tweede ronde).
      if (url.searchParams.get('structuuronderdeel_groep_nummer') === 'G-0009') return ++g0009 === 1 ? json(res, 404, { message: 'Not Found' }) : json(res, 503, {});
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-stop-tweede-ronde');
    eisStop(o, run, 1, /G-0009, pagina 1 \(tweede ronde\) lukte niet na 4 nieuwe pogingen \(HTTP 503\)\./);
    expect(g0009).toBe(6);
    expect(rapportVan(o).koppeling).toMatchObject({ tweedeRonde: { groepen: 9, verzoeken: 5 } });
  });

  it.each([503, 429])('altijd HTTP %i → 1 na 4 nieuwe pogingen (5 verzoeken), en niets geschreven', async (status) => {
    begin();
    gedrag = (_req, res) => json(res, status, {});
    const { o, run } = await haal(`api-altijd-${status}`);
    eisStop(o, run, 1, new RegExp(`Matrix, pagina 1 lukte niet na 4 nieuwe pogingen \\(HTTP ${status}\\)\\.`));
    expect(verzoeken).toHaveLength(5);
    expect(run.stdout).toMatch(new RegExp(`Matrix, pagina 1: opnieuw proberen \\(4/4\\) na HTTP ${status}\\.`));
    expect(rapportVan(o)).toMatchObject({ verzoeken: 5, matrix: { verzoeken: 5 }, koppeling: { verzoeken: 0 } });
  });

  it('een afgebroken verbinding, ook bij elke nieuwe poging → 1, en niets geschreven', async () => {
    begin();
    gedrag = (req) => {
      req.socket.destroy();
    };
    const { o, run } = await haal('api-afgebroken');
    eisStop(o, run, 1, /Matrix, pagina 1 lukte niet na 4 nieuwe pogingen \(netwerkfout \([A-Za-z_]+\)\)\./);
    expect(verzoeken).toHaveLength(5);
  });

  it('altijd HTTP 503 voor één groep, midden in de koppeling → 1, en geen enkel bestand (geen halve update)', async () => {
    begin();
    gedrag = (req, res, url, nr) => {
      if (url.searchParams.get('structuuronderdeel_groep_nummer') === 'G-0193') return json(res, 503, {});
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-503-koppeling');
    eisStop(o, run, 1, /G-0193, pagina 1 lukte niet na 4 nieuwe pogingen \(HTTP 503\)\./);
    expect(verzoeken.filter((v) => v.url.includes('G-0193'))).toHaveLength(5);
    expect(rapportVan(o).koppeling).toMatchObject({ gekoppeld: 0 });
  });

  it('de sleutel in een 404-antwoord, als veldnaam en in een waarde: nergens in de uitvoer, wel ***', async () => {
    begin();
    // G-0307 (1ste graad) krijgt een titel zonder stroom met de sleutel erin, en een veld dat zo heet.
    groepen = BASIS_GROEPEN.map((g) => (g.structuuronderdeel_groep_nummer === 'G-0307' ? { ...g, titel: `Eerste graad ${SLEUTEL}`, [SLEUTEL]: `waarde ${SLEUTEL}` } : g));
    gedrag = (req, res, url, nr) => {
      const g = url.searchParams.get('structuuronderdeel_groep_nummer');
      const antwoord = g === null ? undefined : ((koppeling.groepen as Rec)[g] as Rec | undefined);
      if (antwoord?.status === 404) return json(res, 404, { message: `Not Found voor sleutel ${SLEUTEL}` });
      standaard(req, res, url, nr);
    };
    const { o, run } = await haal('api-sleutel-overal');
    // Eerst het lek zelf: stdout, stderr, het rapport en de uitvoermap.
    expect(run.status, run.stderr).toBe(3);
    expect(alleUitvoer(run, o.rapport, o.uit)).not.toContain(SLEUTEL);
    expect(run.stderr).toContain('***');
    // Na twee keer 404 voor G-0307 valt de stroom niet af te leiden: stop, en de titel staat in de melding.
    eisStop(o, run, 3, /de stroom van de 1ste graad valt niet af te leiden uit de titel "Eerste graad \*\*\*"/);
    const rapport = rapportVan(o);
    // voorbeeld404 (via veilig), de veldinventaris (alleen via schoon in schrijfRapport), de fout en de problemen.
    expect(rapport.koppeling.voorbeeld404).toBe('{"message":"Not Found voor sleutel ***"}');
    expect(Object.keys(rapport.matrix.veldInventaris as Rec)).toContain('groep.***');
    expect(rapport.fout).toContain('***');
    expect(rapport.problemen.join(' ')).toContain('***');
  });

  it('een 404 op een latere pagina → 1', async () => {
    begin();
    koppeling = koppelingBron(BASIS_GROEPEN, { 'G-0193': [pagina(RECORDS_G0193().slice(0, 5), 8)] });
    const { o, run } = await haal('api-404-later');
    eisStop(o, run, 1, /G-0193, pagina 2: de API antwoordde met HTTP 404/);
  });

  it('--alleen matrix doet geen enkel verzoek naar de Onderwijsdoelen-API', async () => {
    begin();
    const { o, run } = await haal('api-alleen-matrix', ['--alleen', 'matrix']);
    expect(run.status, run.stderr).toBe(0);
    expect(verzoeken.map((v) => v.url).filter((u) => u.startsWith('/onderwijsdoelen'))).toEqual([]);
    expect(verzoeken).toHaveLength(3);
    expect(indexVan(o).groepen.every((r) => r.status === 'nog-niet-opgehaald')).toBe(true);
    controleerUitvoer(o.uit);
  });

  it('STRUCTUURONDERDELEN_API_BASE op een andere origin → 1, zonder verzoek', async () => {
    begin();
    const { o, run } = await haal('api-structuur-origin', [], { STRUCTUURONDERDELEN_API_BASE: `${anderBasis}${STRUCTUUR_PAD}` });
    eisStop(o, run, 1, /STRUCTUURONDERDELEN_API_BASE moet dezelfde origin hebben als ONDERWIJSDOELEN_API_BASE/);
    expect(verzoeken).toHaveLength(0);
    expect(anderVerzoeken).toHaveLength(0);
  });

  it('de filter wordt genegeerd → 3 meteen na pagina 1 van die groep', async () => {
    begin();
    koppeling = koppelingBron(BASIS_GROEPEN, { 'G-0117': pagina(RECORDS_G0117(), 24019) });
    const { o, run } = await haal('api-filter');
    eisStop(o, run, 3, /D2: G-0117 geeft 24019 doelen/);
    expect(verzoeken.filter((v) => v.url.includes('G-0117'))).toHaveLength(1);
  });
});

// ── De fixtures (§ 3.6) ─────────────────────────────────────────────────────

/**
 * De velden van een set in minimumdoelen/index.json waarvan de fixtures afhangen (de inhoud van een set zit
 * in zijn sha256). Dezelfde lijst staat in tools/leerplannen/maak-nagebootste-koppeling.mjs.
 */
const VINGERAFDRUK_VELDEN = ['id', 'sha256', 'aantal', 'geldigheid', 'graad', 'stroom', 'leerjaar', 'naam', 'korteNaam', 'versie'] as const;

/** sha256 van canoniek(de sets, gesorteerd op id, met alleen VINGERAFDRUK_VELDEN), zoals het hulpscript. */
function vingerafdrukVan(index: { sets: readonly object[] }): string {
  const sets = index.sets
    .map((s) => {
      const r = s as Rec;
      return Object.fromEntries(VINGERAFDRUK_VELDEN.filter((v) => r[v] !== undefined).map((v) => [v, r[v]]));
    })
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  return sha256Van(sets);
}

/**
 * De verwachte uitvoer in tests/fixtures/structuur/uit hangt af van de hele echte index (welke sets er
 * zijn, hun inhoud, geldigheid, graad, stroom, …). Na een maandelijkse update van de minimumdoelen klopt
 * ze niet meer: dan slaan de twee tests hieronder over in plaats van de update-PR te blokkeren. Klopt de
 * vingerafdruk in api/koppeling.json met de huidige index, dan draaien ze wel.
 */
function fixturesActueel(): boolean {
  try {
    const index = leesJson<MinimumdoelenIndex>(join(ECHTE_MINIMUMDOELEN, 'index.json'));
    const afdruk = leesJson<Rec>(join(FIXTURES, 'api', 'koppeling.json')).vingerafdrukMinimumdoelen;
    return typeof afdruk === 'string' && afdruk === vingerafdrukVan(index);
  } catch {
    return false;
  }
}
const FIXTURES_ACTUEEL = fixturesActueel();
/** Een overgeslagen test zegt in zijn naam waarom, en wat je dan doet (geen console-uitvoer in src). */
const BIJ_OVERSLAAN = FIXTURES_ACTUEEL
  ? ''
  : ' [OVERGESLAGEN: public/leerplannen/minimumdoelen/index.json veranderde sinds de fixtures. Maak ze opnieuw zoals in docs/STUDIERICHTINGEN.md § 3.6: maak-nagebootste-koppeling.mjs, daarna haal-studierichtingen.mjs naar tests/fixtures/structuur/uit]';

describe('fixtures in tests/fixtures/structuur', () => {
  it('bevatten de 9 groepen van § 3.6, met de vorm van de API', () => {
    const paginas = leesJson<Rec[]>(join(FIXTURES, 'api', 'matrix.json'));
    expect(paginas.length).toBeGreaterThan(1);
    expect((paginas[0].links as { next: { href: string } }).next.href).toContain(' ');
    expect(paginas.every((p) => (p.meta as Rec).total_elements === 9)).toBe(true);
    const matrix = leesJson<MatrixBestand>(join(FIXTURES, 'uit', 'studierichtingen.json'));
    expect(matrix.groepen.map((g) => g.nummer)).toEqual(['G-0002', 'G-0008', 'G-0009', 'G-0117', 'G-0193', 'G-0307', 'G-0311', 'G-0327', 'G-0429']);
    const g = (nr: string) => matrix.groepen.find((x) => x.nummer === nr);
    const o = (nr: number) => matrix.onderdelen.find((x) => x.nummer === nr);
    expect(g('G-0193')).toMatchObject({ titel: 'Natuurwetenschappen', graad: '2', finaliteit: 'DO' });
    expect(o(247)).toMatchObject({ ov4: true });
    expect([g('G-0117')?.graad, g('G-0327')?.graad]).toEqual(['2', '3']);
    expect(g('G-0307')).toMatchObject({ titel: 'Eerste leerjaar A', graad: '1' });
    expect(g('G-0311')).toMatchObject({ titel: 'Tweede leerjaar A', onderdelen: [908, 915] });
    expect(g('G-0008')).toMatchObject({ finaliteit: 'A', onderdelen: [8, 565] });
    expect([o(8), o(565)]).toMatchObject([{ duaal: true }, { duaal: true, aanloop: true }]);
    expect(g('G-0002')).toMatchObject({ type7: 'BSO_TIJDELIJK' });
    expect(o(2)).toMatchObject({ einddatum: '2025-08-31', volgende: [680] });
    expect(o(680)).toMatchObject({ groep: 'G-0429', vorige: [2] });
    expect(g('G-0009')?.graad).toBeUndefined();
    expect(g('G-0009')?.opleidingsvorm).toBeDefined();
    const index = leesJson<RichtingDoelenIndex>(join(FIXTURES, 'uit', 'richtingdoelen', 'index.json'));
    expect(Object.fromEntries(index.groepen.map((r) => [r.groep, r.methode ?? r.status]))).toEqual({
      'G-0002': 'geen', 'G-0008': 'api', 'G-0009': 'geen', 'G-0117': 'api', 'G-0193': 'api',
      'G-0307': 'graad-en-stroom', 'G-0311': 'graad-en-stroom', 'G-0327': 'api', 'G-0429': 'geen',
    });
    controleerUitvoer(join(FIXTURES, 'uit'));
    const koppeling = leesJson<Rec>(join(FIXTURES, 'api', 'koppeling.json'));
    expect(koppeling.nagebootst).toMatch(/NAGEBOOTSTE koppeling .*GEEN officiële koppeling/);
    expect(koppeling.totaal).toBe(24019);
    expect(koppeling.vingerafdrukMinimumdoelen).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maak-nagebootste-koppeling.mjs en deze test berekenen dezelfde vingerafdruk (anders sloegen de fixturetests altijd over)', () => {
    // Op de echte index: daar komt elk veld van VINGERAFDRUK_VELDEN voor (stroom en leerjaar in een deel van de sets).
    const index = leesJson<MinimumdoelenIndex>(join(ECHTE_MINIMUMDOELEN, 'index.json'));
    for (const veld of VINGERAFDRUK_VELDEN) expect(index.sets.some((s) => (s as unknown as Rec)[veld] !== undefined), veld).toBe(true);
    const uit = join(opstelling('vingerafdruk').map, 'koppeling.json');
    const stdout = execFileSync(process.execPath, [MAAK, '--uit', uit], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const afdruk = vingerafdrukVan(index);
    expect(leesJson<Rec>(uit).vingerafdrukMinimumdoelen).toBe(afdruk);
    expect(stdout).toContain(`Vingerafdruk van minimumdoelen/index.json (${index.sets.length} sets): ${afdruk}.`);
  });

  it('de vingerafdruk verandert met elk gebruikt veld (eerste en laatste set) en met de lijst van sets, niet met een ongebruikt veld', () => {
    const index = leesJson<MinimumdoelenIndex>(join(ECHTE_MINIMUMDOELEN, 'index.json'));
    const basis = vingerafdrukVan(index);
    const met = (i: number, veld: string, waarde: unknown) => {
      const k = kopie(index);
      (k.sets[i] as unknown as Rec)[veld] = waarde;
      return vingerafdrukVan(k);
    };
    const laatste = index.sets.length - 1;
    for (const veld of VINGERAFDRUK_VELDEN) {
      // Gewijzigd in de eerste en de laatste set, en toegevoegd waar het ontbrak.
      expect(met(0, veld, 'anders'), `${veld} (eerste set)`).not.toBe(basis);
      expect(met(laatste, veld, 'anders'), `${veld} (laatste set)`).not.toBe(basis);
    }
    expect(met(0, 'aantal', (index.sets[0].aantal as number) + 1)).not.toBe(basis);
    // Een set erbij of eraf, en een andere volgorde in de index.
    const k = kopie(index);
    expect(vingerafdrukVan({ sets: k.sets.slice(1) })).not.toBe(basis);
    expect(vingerafdrukVan({ sets: [...k.sets, { ...k.sets[0], id: 'ODS_999999' }] })).not.toBe(basis);
    expect(vingerafdrukVan({ sets: [...k.sets].reverse() })).toBe(basis);
    // opgehaald, geldigVan, geldigTot en bestand gebruiken de fixtures niet: geen reden om over te slaan.
    for (const veld of ['opgehaald', 'geldigVan', 'geldigTot', 'bestand']) expect(met(0, veld, 'anders'), veld).toBe(basis);
  });

  it.skipIf(!FIXTURES_ACTUEEL)(`opnieuw draaien op tests/fixtures/structuur/api geeft byte voor byte tests/fixtures/structuur/uit${BIJ_OVERSLAAN}`, () => {
    const o = opstelling('fixtures');
    const run = draai([
      '--bron-matrix', join(FIXTURES, 'api', 'matrix.json'),
      '--bron-koppeling', join(FIXTURES, 'api', 'koppeling.json'),
      '--nu', NU, '--vandaag', VANDAAG,
      '--minimumdoelen', ECHTE_MINIMUMDOELEN, '--uit', o.uit, '--rapport', o.rapport,
    ]);
    expect(run.status, run.stderr).toBe(0);
    expect(inhoud(o.uit)).toEqual(inhoud(join(FIXTURES, 'uit')));
    const rapport = rapportVan(o);
    expect(rapport.waarschuwingen[0]).toMatch(/NAGEBOOTSTE koppeling/);
    // Zachte controles (§ 5.4): 644 (voorbereidend op 8) staat niet in de 9 groepen van de fixtures.
    expect(rapport.matrix.onbekendeVerwijzingen).toEqual({ aantal: 1, voorbeelden: [{ onderdeel: 8, veld: 'voorbereidend', nummer: 644 }] });
    expect(rapport.matrix.veldenInExtra).toMatchObject({ 'onderdeel.hoofdstructuren': 16 });
    expect(rapport.koppeling).toMatchObject({ graadEnStroom: 2, eersteGraadPerStroom: { A: 2, B: 0 }, tweedeRonde: { groepen: 0, verzoeken: 0 } });
    // D8 op 9 groepen: de getagde groepen die niet in de matrix staan, zijn een waarschuwing, geen stop.
    const ok = rapport.koppeling.ordeningskader as { getagd: number; groepen: number; zonderKoppeling: string[]; nietMeegeteld: { groep: string; reden: string }[] };
    expect(ok.groepen).toBe(3);
    expect(ok.zonderKoppeling).toEqual([]);
    expect(ok.nietMeegeteld).toHaveLength(ok.getagd - ok.groepen);
    expect(ok.nietMeegeteld.every((x) => x.reden === 'staat niet in de matrix')).toBe(true);
    expect(rapport.waarschuwingen.filter((w) => w.startsWith('D8: '))).toHaveLength(ok.getagd - ok.groepen);
  });

  it.skipIf(!FIXTURES_ACTUEEL)(`maak-nagebootste-koppeling.mjs maakt api/koppeling.json opnieuw en zegt dat ze nagebootst is${BIJ_OVERSLAAN}`, () => {
    const o = opstelling('maak');
    const uit = join(o.map, 'koppeling.json');
    const stdout = execFileSync(process.execPath, [MAAK, '--uit', uit], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(stdout).toMatch(/NAGEBOOTSTE koppeling \(geen officiële koppeling\)/);
    expect(stdout).toMatch(/Let op: NAGEBOOTST, geen officiële koppeling/);
    expect(readFileSync(uit, 'utf8')).toBe(readFileSync(join(FIXTURES, 'api', 'koppeling.json'), 'utf8'));
    expect(readFileSync(MAAK, 'utf8')).toMatch(/NAGEBOOTSTE koppeling[\s\S]*GEEN officiële koppeling/);
  });
});
