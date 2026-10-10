// Integratietests voor tools/leerplannen/haal-beroepskwalificaties.mjs (docs/STUDIERICHTINGEN.md § 23.5.4 tot
// § 23.5.8, § 23.5.10 en § 23.5.12, pakket K2). Het script draait als apart Node-proces, met opgeslagen
// antwoorden (--bron-*) of tegen een nagebootste http-API op 127.0.0.1 (de testbasis van onderwijsApi.mjs), met
// ONDERWIJSDOELEN_WACHT_FACTOR=0. Er gaat nooit een verzoek naar de echte API, de sleutel is de nepsleutel
// test-sleutel-1234, en alles wat geschreven wordt, staat in een tijdelijke map (eisTijdelijk).
//
// De antwoorden komen uit tests/fixtures/kwalificaties/api/ (nagebootst, in de vorm van het uittreksel van ronde 6
// en 7 in api/ruw/); de verwachte uitvoer staat in tests/fixtures/kwalificaties/uit/.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BK_API,
  BK_INDEX_API,
  KOPPELING_API,
  doelcodesVanBestand,
  erkenningenOp,
  valideerBkBestand,
  valideerBkIndex,
  valideerKoppelingBestand,
  type BkBestand,
  type BkIndex,
  type KoppelingBestand,
} from './beroepskwalificaties';
import { canoniek } from './minimumdoelen';
import { valideerMatrixBestand, type MatrixBestand } from './studierichtingen';

// Elke test start Node als apart proces, soms een paar keer na elkaar.
vi.setConfig({ testTimeout: 60_000 });

type Rec = Record<string, any>;
type Uitkomst = { status: number; stdout: string; stderr: string };

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'tools', 'leerplannen', 'haal-beroepskwalificaties.mjs');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'kwalificaties');
const STRUCTUUR = join(ROOT, 'tests', 'fixtures', 'structuur', 'uit');
/** Een herkenbare nepsleutel: hij mag nergens in de uitvoer staan. */
const SLEUTEL = 'test-sleutel-1234';
const NU = '2026-10-10T00:00:00Z';
const VANDAAG = '2026-10-10';
const ECHTE_ORIGIN = 'https://onderwijs.api.vlaanderen.be';
const SO_PAD = '/kwalificaties-en-curriculum/structuuronderdelen/v2';
const BK_PAD = '/kwalificaties-en-curriculum/beroepskwalificaties/v2';

const leesJson = <T = Rec>(pad: string): T => JSON.parse(readFileSync(pad, 'utf8')) as T;
const kopie = <T>(waarde: T): T => JSON.parse(JSON.stringify(waarde)) as T;
const sha256Van = (waarde: unknown) => createHash('sha256').update(canoniek(waarde), 'utf8').digest('hex');

const LIJST = leesJson<Rec[]>(join(FIXTURES, 'api', 'lijst.json'));
const ONDERDELEN = leesJson(join(FIXTURES, 'api', 'onderdelen.json'));
const BKS = leesJson(join(FIXTURES, 'api', 'bks.json'));

// ── Hulpfuncties ────────────────────────────────────────────────────────────

let TMP = '';

/** Omgeving zonder de sleutel en de adressen van de ontwikkelaar, zonder wachttijden, met `extra` erbovenop. */
function maakEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ONDERWIJSDOELEN_WACHT_FACTOR: '0' };
  for (const k of ['ONDERWIJSDOELEN_API_KEY', 'ONDERWIJSDOELEN_API_BASE', 'STRUCTUURONDERDELEN_API_BASE', 'BEROEPSKWALIFICATIES_API_BASE']) delete env[k];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

/**
 * Zonder --uit en --rapport schrijft het script in de repo zelf (public/leerplannen/kwalificaties en
 * tools/leerplannen/rapport): een test mag dat nooit. Beide moeten in de tijdelijke map van het systeem staan
 * (ook in de vorm --uit=<pad>; een relatief of leeg pad telt vanaf de werkmap `cwd` van het script).
 */
function eisTijdelijk(args: string[], cwd = ROOT) {
  const tmp = [realpathSync(tmpdir()), resolve(tmpdir())];
  for (const optie of ['--uit', '--rapport']) {
    const i = args.findIndex((a) => a === optie || a.startsWith(`${optie}=`));
    if (i < 0) throw new Error(`Geef in een test altijd ${optie} mee.`);
    const pad = resolve(cwd, args[i] === optie ? args[i + 1] : args[i].slice(optie.length + 1));
    if (!tmp.some((t) => pad.startsWith(t + sep))) throw new Error(`${optie} moet in ${tmp[0]} staan, niet in ${pad}.`);
  }
}

function draai(args: string[], extra: Record<string, string | undefined> = {}, cwd = ROOT): Uitkomst {
  eisTijdelijk(args, cwd);
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, env: maakEnv(extra), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const f = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: f.status ?? 1, stdout: f.stdout ?? '', stderr: f.stderr ?? '' };
  }
}

/** Asynchroon, zodat de http-server in dit proces ondertussen kan antwoorden. */
function draaiAsync(args: string[], extra: Record<string, string | undefined> = {}): Promise<Uitkomst> {
  eisTijdelijk(args);
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
function alleUitvoer(run: Uitkomst, ...paden: string[]): string {
  const delen = [run.stdout, run.stderr];
  for (const p of paden) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) delen.push(...Object.values(inhoud(p)));
    else delen.push(readFileSync(p, 'utf8'));
  }
  return delen.join('\n');
}

// ── Opstelling per test ─────────────────────────────────────────────────────

let teller = 0;
interface Opstelling { map: string; uit: string; rapport: string }
function opstelling(naam: string): Opstelling {
  const map = join(TMP, `${++teller}-${naam}`);
  mkdirSync(map, { recursive: true });
  return { map, uit: join(map, 'uit'), rapport: join(map, 'rapport.json') };
}

interface BronRun {
  lijst?: unknown;
  onderdelen?: unknown;
  bks?: unknown;
  zonderLijst?: boolean;
  args?: string[];
  env?: Record<string, string | undefined>;
  nu?: string;
  vandaag?: string;
  structuur?: string;
}

let bronTeller = 0;
/** De bronbestanden in de map van de opstelling (telkens nieuwe) en de argumenten van een run met --bron-*. */
function bronArgs(o: Opstelling, run: BronRun = {}): string[] {
  const n = ++bronTeller;
  const schrijf = (naam: string, waarde: unknown) => {
    const pad = join(o.map, `${naam}-${n}.json`);
    writeFileSync(pad, JSON.stringify(waarde));
    return pad;
  };
  const args = ['--structuur', run.structuur ?? STRUCTUUR, '--uit', o.uit, '--rapport', o.rapport, '--vandaag', run.vandaag ?? VANDAAG, '--nu', run.nu ?? NU];
  args.push('--bron-onderdelen', schrijf('onderdelen', run.onderdelen ?? ONDERDELEN), '--bron-bks', schrijf('bks', run.bks ?? BKS));
  if (run.zonderLijst) args.push('--zonder-lijst');
  else args.push('--bron-lijst', schrijf('lijst', run.lijst ?? LIJST));
  return [...args, ...(run.args ?? [])];
}
/** De namen van de bronbestanden die `bronArgs` schrijft. */
const BRONBESTAND = /^(lijst|onderdelen|bks)-\d+\.json$/;

/** Draait met --bron-*: de antwoorden komen in de map van de opstelling, telkens in nieuwe bestanden. */
function draaiBron(o: Opstelling, run: BronRun = {}): Uitkomst {
  return draai(bronArgs(o, run), run.env);
}

/** Vervangt een optie en haar waarde in een lijst argumenten door `door` (bv. "--rapport="). */
function vervangOptie(args: string[], optie: string, door: string[]): string[] {
  const i = args.indexOf(optie);
  if (i < 0) throw new Error(`${optie} staat niet in de argumenten.`);
  return [...args.slice(0, i), ...door, ...args.slice(i + 2)];
}

const rapportVan = (o: Opstelling) => leesJson(o.rapport);
const koppelingVan = (o: Opstelling) => leesJson<KoppelingBestand>(join(o.uit, 'koppeling.json'));
const indexVan = (o: Opstelling) => leesJson<BkIndex>(join(o.uit, 'index.json'));
const bkVan = (o: Opstelling, bk: string) => leesJson<BkBestand>(join(o.uit, 'bk', `${bk}.json`));
const recordVan = (o: Opstelling, nr: number) => koppelingVan(o).onderdelen.find((r) => r.onderdeel === nr) as Rec;
const regelVan = (o: Opstelling, bk: string) => indexVan(o).bks.find((r) => r.bk === bk) as Rec;

/** Een kopie van de onderdelen met één detail aangepast. */
function metOnderdeel(nr: number, pas: (d: Rec) => Rec | void, bron: Rec = ONDERDELEN): Rec {
  const uit = kopie(bron);
  const d = uit[String(nr)];
  const nieuw = pas(d);
  if (nieuw !== undefined) uit[String(nr)] = nieuw;
  return uit;
}

/** Een kopie van de BK-versies met één detail aangepast (of toegevoegd). */
function metBk(bk: string, pas: (d: Rec) => Rec | void, bron: Rec = BKS): Rec {
  const uit = kopie(bron);
  const d = uit[bk];
  const nieuw = pas(d);
  if (nieuw !== undefined) uit[bk] = nieuw;
  return uit;
}

/** Een nagebootst BK-detail voor een andere versie: een kopie van het detail van `van`, met de versie `bk`. */
function bkDetail(bk: string, van = 'BK-9999-2'): Rec {
  const d = kopie(BKS[van]);
  Object.assign(d.beroepskwalificatie, { versie_nr_lang: bk, versie_nr_kort: Number(bk.split('-')[2]) });
  return d;
}

/** Past de index in een uitvoermap aan en zet een kloppende sha256, zodat alleen de bedoelde controle afgaat. */
function pasIndexAan(uit: string, pas: (bks: Rec[]) => Rec[]) {
  const pad = join(uit, 'index.json');
  const index = leesJson(pad);
  index.bks = pas(index.bks as Rec[]);
  index.sha256 = sha256Van(index.bks);
  writeFileSync(pad, `${JSON.stringify(index, null, 2)}\n`);
}

/** Onderdelen met een BK in een erkenning van nu, en de unieke BK-versies van nu (zoals P6 a en b tellen). */
function telNu(k: KoppelingBestand, vandaag = VANDAAG) {
  const versies = new Set<string>();
  let onderdelen = 0;
  for (const r of k.onderdelen) {
    const bks = erkenningenOp(r.erkenningen ?? [], vandaag).nu.flatMap((e) => e.bks.map((b) => b.bk));
    if (bks.length > 0) onderdelen++;
    for (const bk of bks) versies.add(bk);
  }
  return { onderdelen, versies: versies.size };
}

/** De erkenning van nu van onderdeel 8 (ADV-1612) in een detail. */
const erkenning8 = (d: Rec): Rec => (d.structuuronderdeel_details as Rec[]).find((e) => e.structuuronderdeel_detail_nummer === 'ADV-1612') as Rec;
const bkRef = (nr: string, kort: number, titel: string): Rec => ({ beroepskwalificatie_nr: nr, versie_nr_kort: kort, versie_nr_lang: `${nr}-${kort}`, titel, api_url: `${ECHTE_ORIGIN}/beroepskwalificatie/v1/${nr}-${kort}` });

/** Zet de lijst met beroepskwalificaties van de erkenning van nu van een onderdeel. */
function zetBks(bron: Rec, nr: number, refs: Rec[]): Rec {
  return metOnderdeel(nr, (d) => {
    const nu = (d.structuuronderdeel_details as Rec[]).filter((e) => !e.einddatum && (e.begindatum ?? '') <= VANDAAG && e.status);
    nu[nu.length - 1].beroepskwalificaties = refs;
  }, bron);
}

/** Een matrix in een tijdelijke map: de matrix van de fixtures, aangepast, met een nieuwe sha256. */
function maakMatrix(o: Opstelling, pas: (m: MatrixBestand) => void): string {
  const m = leesJson<MatrixBestand>(join(STRUCTUUR, 'studierichtingen.json'));
  pas(m);
  m.sha256 = sha256Van({ groepen: m.groepen, onderdelen: m.onderdelen });
  expect(valideerMatrixBestand(m)).toEqual([]);
  const map = join(o.map, 'structuur');
  mkdirSync(map, { recursive: true });
  writeFileSync(join(map, 'studierichtingen.json'), JSON.stringify(m));
  return map;
}

/** Een stop: de verwachte exitcode, een rapport met de fout, en verder niets geschreven. */
function eisStop(o: Opstelling, run: Uitkomst, code: number, melding: RegExp, voor: ReturnType<typeof momentopname> = {}) {
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(code);
  expect(run.stderr).toMatch(melding);
  expect(momentopname(o.uit)).toEqual(voor);
  expect(rapportVan(o).fout).toMatch(melding);
}

/**
 * Controleert de uitvoer op de vorm van § 23.5.2 en op de samenhang: de validators, de sha256's, één record per
 * onderdeel van de matrix, de index en de bestanden (BX3, BX4), en elke BK van een erkenning van nu of later in
 * de index (KP5).
 */
function controleerUitvoer(uit: string, vandaag = VANDAAG, structuur = STRUCTUUR) {
  const matrix = leesJson<MatrixBestand>(join(structuur, 'studierichtingen.json'));
  const k = leesJson<KoppelingBestand>(join(uit, 'koppeling.json'));
  expect(valideerKoppelingBestand(k)).toEqual([]);
  expect(k.sha256).toBe(sha256Van(k.onderdelen));
  expect(k.matrixSha256).toBe(matrix.sha256);
  expect(k.onderdelen.map((r) => [r.onderdeel, r.groep])).toEqual(matrix.onderdelen.map((o) => [o.nummer, o.groep]));
  const index = leesJson<BkIndex>(join(uit, 'index.json'));
  expect(valideerBkIndex(index)).toEqual([]);
  expect(index.sha256).toBe(sha256Van(index.bks));
  const bestanden = existsSync(join(uit, 'bk')) ? readdirSync(join(uit, 'bk')).sort() : [];
  expect(bestanden.map((f) => `bk/${f}`)).toEqual(index.bks.filter((r) => r.bestand).map((r) => r.bestand).sort());
  for (const r of index.bks) {
    if (!r.bestand) continue;
    const b = leesJson<BkBestand>(join(uit, r.bestand));
    expect(valideerBkBestand(b, r.bk)).toEqual([]);
    const { bk, titel, status, vks, definitie, competenties, extra } = b;
    expect(b.sha256).toBe(sha256Van({ bk, titel, status, vks, definitie, competenties, extra }));
    expect({ sha256: b.sha256, aantal: b.aantal, titel: b.titel, opgehaald: b.opgehaald }).toEqual({ sha256: r.sha256, aantal: r.aantal, titel: r.titel, opgehaald: r.opgehaald });
    const codes = [...doelcodesVanBestand(b).values()];
    expect(new Set(codes).size).toBe(b.competenties.length);
  }
  const inIndex = new Set(index.bks.map((r) => r.bk));
  for (const r of k.onderdelen) {
    const { nu, toekomst } = erkenningenOp(r.erkenningen ?? [], vandaag);
    for (const e of [...nu, ...toekomst]) for (const b of e.bks) expect(inIndex.has(b.bk), `${r.onderdeel}: ${b.bk}`).toBe(true);
  }
  for (const [naam, tekst] of Object.entries(inhoud(uit))) {
    expect(tekst.startsWith('{\n  "app": "boosterz",\n'), naam).toBe(true);
    expect(tekst.endsWith('}\n'), naam).toBe(true);
    expect(tekst, naam).not.toMatch(/api_url|curriculumdossier|127\.0\.0\.1|localhost/);
  }
}

beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), 'beroepskwalificaties-script-'));
});
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ── De fixtures ─────────────────────────────────────────────────────────────

describe('fixtures in tests/fixtures/kwalificaties', () => {
  it('de nagebootste antwoorden zeggen dat ze nagebootst zijn en noemen geen sleutel', () => {
    expect(ONDERDELEN.nagebootst).toMatch(/geen officiële koppeling/);
    expect(BKS.nagebootst).toMatch(/geen officiële koppeling/);
    for (const naam of ['lijst.json', 'onderdelen.json', 'bks.json']) expect(readFileSync(join(FIXTURES, 'api', naam), 'utf8')).not.toMatch(/x-api-key|sleutel-/i);
  });

  it('uit/ haalt de validators, de sha256 en de samenhang met de matrix van de structuurfixtures', () => {
    controleerUitvoer(join(FIXTURES, 'uit'));
  });

  it('opnieuw draaien op tests/fixtures/kwalificaties/api geeft byte voor byte tests/fixtures/kwalificaties/uit', () => {
    const o = opstelling('fixtures');
    const run = draai([
      '--bron-lijst', join(FIXTURES, 'api', 'lijst.json'),
      '--bron-onderdelen', join(FIXTURES, 'api', 'onderdelen.json'),
      '--bron-bks', join(FIXTURES, 'api', 'bks.json'),
      '--nu', NU, '--vandaag', VANDAAG, '--structuur', STRUCTUUR, '--uit', o.uit, '--rapport', o.rapport,
    ]);
    expect(run.status, run.stderr).toBe(0);
    expect(inhoud(o.uit)).toEqual(inhoud(join(FIXTURES, 'uit')));
    // Ook op een kopie van uit/ als bestaande toestand verandert er niets (bytes en wijzigingstijd).
    const o2 = opstelling('fixtures-opnieuw');
    cpSync(join(FIXTURES, 'uit'), o2.uit, { recursive: true });
    const voor = momentopname(o2.uit);
    const run2 = draaiBron(o2, { nu: '2026-11-03T06:10:00Z', vandaag: '2026-11-03' });
    expect(run2.status, run2.stderr).toBe(0);
    expect(momentopname(o2.uit)).toEqual(voor);
  });
});

// ── Met opgeslagen antwoorden (--bron-*) ────────────────────────────────────

describe('haal-beroepskwalificaties.mjs met opgeslagen antwoorden', () => {
  it('schrijft de koppeling, de index en een bestand per BK-versie zoals in § 23.5.2', () => {
    const o = opstelling('basis');
    const run = draaiBron(o);
    expect(run.status, run.stderr).toBe(0);
    controleerUitvoer(o.uit);

    const k = koppelingVan(o);
    expect(k).toMatchObject({ kind: 'richtingkwalificaties', api: KOPPELING_API, opgehaald: NU, aantalOnderdelen: 16, licentie: 'nog te bevestigen' });
    const statussen = Object.fromEntries(k.onderdelen.map((r) => [r.onderdeel, r.status]));
    // 2 en 11 zijn afgebouwd (einddatum 2025-08-31): niet gevraagd. 931 gaf 404.
    expect(statussen).toEqual({
      2: 'nog-niet-opgehaald', 8: 'opgehaald', 9: 'opgehaald', 10: 'opgehaald', 11: 'nog-niet-opgehaald', 12: 'opgehaald', 129: 'opgehaald', 247: 'opgehaald',
      379: 'opgehaald', 417: 'opgehaald', 565: 'opgehaald', 679: 'opgehaald', 680: 'opgehaald', 908: 'opgehaald', 915: 'opgehaald', 931: 'niet-gevonden',
    });
    const r8 = recordVan(o, 8);
    expect(r8.erkenningen.map((e: Rec) => [e.adv, e.begindatum, e.einddatum ?? null, e.bks.map((b: Rec) => b.bk)])).toEqual([
      ['ADV-0917', '2021-09-01', '2024-08-31', ['BK-0390-1']],
      ['ADV-1612', '2023-09-01', null, ['BK-0390-2', 'BK-0464-1']],
    ]);
    const bekr = r8.erkenningen[1].bekrachtigingen as Rec[];
    expect(bekr).toHaveLength(5);
    expect(bekr.filter((b) => b.onderwijskwalificatie === true)).toHaveLength(1);
    expect(bekr.filter((b) => b.dbk === 'BK-0390-2-DBK-01')).toHaveLength(1);
    expect(bekr.map((b) => b.bk ?? null)).toEqual(['BK-0390-2', 'BK-0464-1', null, null, null]);
    // T2: de afgelopen erkenning van 565 heeft in het detail geen status of datums: die komen uit de matrix.
    expect(recordVan(o, 565).erkenningen[0]).toMatchObject({ adv: 'ADV-0960', status: 'ERKEND', begindatum: '2021-09-01', einddatum: '2024-08-31', bks: [] });
    expect(recordVan(o, 9).erkenningen[0]).toMatchObject({ adv: 'ADV-1100', bks: [], geenLijst: true });
    expect(recordVan(o, 247).erkenningen[0].geenLijst).toBeUndefined();
    expect(recordVan(o, 10).erkenningen.map((e: Rec) => e.bks.map((b: Rec) => b.bk))).toEqual([['BK-9999-1'], ['BK-9999-2']]);
    expect(recordVan(o, 931)).toEqual({ onderdeel: 931, groep: 'G-0009', status: 'niet-gevonden', nietMeerInBron: VANDAAG });
    expect(recordVan(o, 11)).toEqual({ onderdeel: 11, groep: 'G-0009', status: 'nog-niet-opgehaald' });

    const index = indexVan(o);
    expect(index).toMatchObject({ kind: 'beroepskwalificaties-index', api: BK_INDEX_API, lijstTotaal: 3, opgehaald: NU });
    // BK-0390-1 staat alleen in een afgelopen erkenning: niet gevraagd, geen regel.
    expect(index.bks.map((r) => r.bk)).toEqual(['BK-0390-2', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2', 'BK-9999-3']);
    expect(regelVan(o, 'BK-0390-2')).toMatchObject({ nummer: 'BK-0390', versie: 2, titel: 'Onthaalmedewerker', vks: 3, status: 'ERKEND', aantal: 12, bestand: 'bk/BK-0390-2.json', laatstErkend: 'BK-0390-2' });
    expect(regelVan(o, 'BK-9999-1').laatstErkend).toBe('BK-9999-2');
    expect(regelVan(o, 'BK-9999-3')).toEqual({ bk: 'BK-9999-3', nummer: 'BK-9999', versie: 3, opgehaald: NU, laatstErkend: 'BK-9999-2', nietGevonden: true });

    const b = bkVan(o, 'BK-0390-2');
    expect(b).toMatchObject({ kind: 'beroepskwalificatie', bk: 'BK-0390-2', api: `${BK_API}/beroepskwalificatie/BK-0390-2`, aantal: 12 });
    expect(b.competenties[0]).toEqual({
      id: 'bkc0045062', nr: 1, type: 'Vakspecifieke competentie', tekst: 'Werkt in teamverband',
      kennis: [{ type: 'Kennis', tekst: 'Kennis van de bedrijfscultuur, procedures en regels in functie van de uitvoering van dit beroep' }],
      vaardigheden: [{ type: 'Cognitieve vaardigheden', tekst: 'Wisselt informatie uit met collega’s en eindverantwoordelijke' }],
      referenties: ['co 01993'],
    });
    expect(doelcodesVanBestand(b).get('bkc0045062')).toBe('BK-0390-2.01');
    expect(Object.keys(b.extra ?? {})).toEqual(['autonomie', 'domeinen', 'erkenningsdatum', 'erkenningsjaar', 'handelingscontext', 'led_onderwerp', 'omgevingscontext', 'omschrijving_kort', 'synoniemen', 'verantwoordelijkheid']);
    // BK-9999-1: een competentie zonder nr, dus de doelcodes volgen de plaats.
    const b9 = bkVan(o, 'BK-9999-1');
    expect(b9.competenties.map((c) => [c.id, c.nr ?? null])).toEqual([['bkc9999101', 1], ['bkc9999102', 2], ['bkc9999103', null]]);
    expect([...doelcodesVanBestand(b9).values()]).toEqual(['BK-9999-1.01', 'BK-9999-1.02', 'BK-9999-1.03']);
    expect(bkVan(o, 'BK-0464-1').aantal).toBe(13);

    const r = rapportVan(o);
    expect(r).toMatchObject({ bron: 'bestand', proef: null, verzoeken: 0, fout: null, problemen: [], geschreven: { bestanden: 6 }, bestanden: { koppeling: 'nieuw', index: 'nieuw' } });
    expect(r.teBevestigen).toHaveLength(10);
    expect(r.lijst).toMatchObject({ paginas: 2, pad: 'gegevens', totaal: 3, ontvangen: 3, volledig: true, nietInLijst: [], nieuwereVersie: [{ bk: 'BK-9999-1', laatstErkend: 'BK-9999-2' }] });
    expect(r.onderdelen).toMatchObject({
      gevraagd: 14, opgehaald: 13, nietGevonden: 1, nietGevondenOnderdelen: [931], toekomst: 1, geenLijst: 8, uitMatrix: 1, erkenningenNu: { 0: 0, 1: 13, meer: 0 },
      perSoortGraadFinaliteit: { 'gewoon|2|A': { metBk: 2, zonderBk: 0 }, 'buso|-|A': { metBk: 2, zonderBk: 1 }, 'gewoon|2|DO': { metBk: 0, zonderBk: 2 } },
      advVerschilMetMatrix: [{ onderdeel: 10, alleenInDetail: ['ADV-1999'], alleenInMatrix: [] }],
      toekomstAndereLijst: [{ onderdeel: 10, adv: 'ADV-1999', begindatum: '2027-09-01', bks: ['BK-9999-2'] }],
    });
    expect(r.onderdelen.nieuw).toContainEqual({ onderdeel: 565, bk: 'BK-0464-1' });
    expect(r.bks).toMatchObject({
      gevraagd: 5, nieuw: ['BK-0390-2', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2'], nietGevonden: ['BK-9999-3'], onbruikbaar: [], inhoudVeranderd: [],
      competenties: { totaal: 30, zonderNr: 1, dubbelNr: 0, metHtml: 1 },
      versieOverlap: [{ nummer: 'BK-9999', van: 'BK-9999-1', naar: 'BK-9999-2', codes: [3, 2], gedeeld: 1, aandeel: 0.33, tekstenGelijk: false }],
    });
    expect(r.bekrachtigingen).toMatchObject({ totaal: 6, onderwijskwalificatie: 1, dbk: 1, vormOnbekend: 0 });
    expect(r.omvang).toEqual({ bestanden: 6, bytes: Object.values(inhoud(o.uit)).reduce((s, t) => s + Buffer.byteLength(t), 0) });
    expect(r.waarschuwingen.join('\n')).toMatch(/HTML in de tekst/);
    expect(r.waarschuwingen.join('\n')).toMatch(/De bron van de onderdelen zegt: geen officiële koppeling/);
  });

  it('een tweede run raakt niets aan (bytes en wijzigingstijd), ook met kennis in een andere volgorde', () => {
    const o = opstelling('tweede-run');
    expect(draaiBron(o).status).toBe(0);
    const voor = momentopname(o.uit);
    const run = draaiBron(o, { nu: '2026-11-03T05:41:12Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(momentopname(o.uit)).toEqual(voor);
    expect(run.stdout).toMatch(/Geschreven: 0 bestanden/);
    // T6: kennis en vaardigheden in een andere volgorde in de API: de oude volgorde (en het oude bestand) blijft.
    const omgekeerd = metBk('BK-9999-1', (d) => {
      for (const c of d.beroepskwalificatie.competenties as Rec[]) {
        c.kennis.reverse();
        c.vaardigheden.reverse();
      }
    });
    expect((omgekeerd['BK-9999-1'].beroepskwalificatie.competenties[0].kennis as Rec[]).map((x) => x.waarde)[0]).toBe('Kennis van de derde regel');
    const run2 = draaiBron(o, { bks: omgekeerd, nu: '2026-12-03T05:41:12Z', vandaag: '2026-12-03' });
    expect(run2.status, run2.stderr).toBe(0);
    expect(momentopname(o.uit)).toEqual(voor);
    expect(rapportVan(o).bks).toMatchObject({ nieuw: [], inhoudVeranderd: [], ongewijzigd: 4 });
    expect(rapportVan(o).bestanden).toEqual({ koppeling: 'ongewijzigd', index: 'ongewijzigd' });
  });

  it('T6 ook in de koppeling: een lijst in "extra" in een andere volgorde laat het record (en zijn "opgehaald") staan', () => {
    const o = opstelling('t6-koppeling');
    const met = (lijst: string[]) => metOnderdeel(8, (d) => {
      erkenning8(d).talen = lijst;
    });
    expect(draaiBron(o, { onderdelen: met(['nl', 'fr', 'en']) }).status).toBe(0);
    expect(recordVan(o, 8).erkenningen[1].extra).toEqual({ talen: ['nl', 'fr', 'en'] });
    const voor = momentopname(o.uit);
    const run = draaiBron(o, { onderdelen: met(['en', 'nl', 'fr']), nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(momentopname(o.uit)).toEqual(voor);
    // Een echte verandering in die lijst geeft wel een nieuw "opgehaald" voor dat record (en alleen dat).
    const run2 = draaiBron(o, { onderdelen: met(['nl', 'fr']), nu: '2026-12-03T06:00:00Z', vandaag: '2026-12-03' });
    expect(run2.status, run2.stderr).toBe(0);
    expect(recordVan(o, 8)).toMatchObject({ opgehaald: '2026-12-03T06:00:00Z' });
    expect(recordVan(o, 565).opgehaald).toBe(NU);
    expect(koppelingVan(o).opgehaald).toBe('2026-12-03T06:00:00Z');
  });

  it('de uitvoer hangt niet af van de volgorde van de invoer', () => {
    const a = opstelling('volgorde-a');
    expect(draaiBron(a).status).toBe(0);
    // Elke sleutelvolgorde omgekeerd, en de lijsten die het script zelf ordent ook (erkenningen, BK's,
    // studiebekrachtigingen, competenties, referenties, de elementen van de lijst).
    const GEORDEND = ['structuuronderdeel_details', 'beroepskwalificaties', 'studiebekrachtigingen', 'competenties', 'referenties', 'gegevens'];
    const hussel = (v: unknown, sleutel = ''): unknown => {
      if (Array.isArray(v)) {
        const lijst = v.map((x) => hussel(x));
        return GEORDEND.includes(sleutel) ? lijst.reverse() : lijst;
      }
      if (typeof v === 'object' && v !== null) {
        const uit: Rec = {};
        for (const k of Object.keys(v).reverse()) uit[k] = hussel((v as Rec)[k], k);
        return uit;
      }
      return v;
    };
    const b = opstelling('volgorde-b');
    const run = draaiBron(b, { onderdelen: hussel(ONDERDELEN), bks: hussel(BKS), lijst: hussel(LIJST) });
    expect(run.status, run.stderr).toBe(0);
    expect(inhoud(b.uit)).toEqual(inhoud(a.uit));
    // Ook één pagina met alle beroepskwalificaties geeft hetzelfde.
    const c = opstelling('volgorde-c');
    const eenPagina = { ...kopie(LIJST[0]), gegevens: [...LIJST[1].gegevens, ...LIJST[0].gegevens], links: {} };
    expect(draaiBron(c, { lijst: eenPagina }).status).toBe(0);
    expect(inhoud(c.uit)).toEqual(inhoud(a.uit));
  });

  it('een nieuwe inhoud van een bestaande versie: nieuw bestand, andere sha256, gemeld als "inhoud veranderd"', () => {
    const o = opstelling('inhoud-veranderd');
    expect(draaiBron(o).status).toBe(0);
    const voor = momentopname(o.uit);
    const shaVoor = regelVan(o, 'BK-0390-2').sha256;
    const nieuw = metBk('BK-0390-2', (d) => {
      d.beroepskwalificatie.competenties[1].waarde = 'Een verbeterde tekst van competentie 2';
    });
    const run = draaiBron(o, { bks: nieuw, nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    const na = momentopname(o.uit);
    expect(Object.keys(na).filter((f) => na[f].tekst !== voor[f].tekst)).toEqual(['bk/BK-0390-2.json', 'index.json']);
    expect(bkVan(o, 'BK-0390-2')).toMatchObject({ opgehaald: '2026-11-03T06:00:00Z' });
    expect(regelVan(o, 'BK-0390-2').sha256).not.toBe(shaVoor);
    expect(rapportVan(o).bks.inhoudVeranderd).toEqual(['BK-0390-2']);
    expect(run.stdout).toMatch(/inhoud veranderd 1 \(BK-0390-2\)/);
    controleerUitvoer(o.uit, '2026-11-03');
  });

  it('een onvolledige lijst geeft 0 met een waarschuwing en houdt laatstErkend en lijstTotaal', () => {
    const o = opstelling('lijst-onvolledig');
    expect(draaiBron(o).status).toBe(0);
    // Alleen pagina 1, die nu zegt dat BK-0390-3 de laatst erkende versie is: de lijst telt niet mee.
    const pagina = kopie(LIJST[0]);
    pagina.gegevens[0].laatst_erkende_versie = { versie_nr_kort: 3, versie_nr_lang: 'BK-0390-3', titel: 'Onthaalmedewerker' };
    pagina.meta.total_elements = 604;
    const run = draaiBron(o, { lijst: [pagina], nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/BK-lijst: onvolledig, niet gebruikt/);
    const r = rapportVan(o);
    expect(r.lijst).toMatchObject({ volledig: false, totaal: 604, ontvangen: 2 });
    expect(r.waarschuwingen.join('\n')).toMatch(/De BK-lijst is onvolledig \(2 ontvangen, meta\.total_elements zegt 604\.\)/);
    expect(regelVan(o, 'BK-0390-2').laatstErkend).toBe('BK-0390-2');
    expect(indexVan(o).lijstTotaal).toBe(3);
    // Zonder meta.total_elements, of met een lijst die niet te vinden is: ook onvolledig, ook exit 0.
    const zonderTotaal = kopie(LIJST).map((p) => ({ ...p, meta: {} }));
    const run2 = draaiBron(o, { lijst: zonderTotaal, nu: '2026-11-04T06:00:00Z', vandaag: '2026-11-04' });
    expect(run2.status, run2.stderr).toBe(0);
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/meta\.total_elements ontbreekt/);
    const run3 = draaiBron(o, { lijst: { content: [] }, nu: '2026-11-05T06:00:00Z', vandaag: '2026-11-05' });
    expect(run3.status, run3.stderr).toBe(0);
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/geen lijst met beroepskwalificaties/);
    expect(regelVan(o, 'BK-0390-2').laatstErkend).toBe('BK-0390-2');
    controleerUitvoer(o.uit, '2026-11-05');
  });

  it('--onderdelen en --zonder-lijst raken de andere records niet aan', () => {
    const o = opstelling('proefrun');
    expect(draaiBron(o).status).toBe(0);
    const voor = koppelingVan(o);
    const indexVoor = indexVan(o);
    // Andere antwoorden voor 10 en voor de lijst: die worden niet gevraagd, dus niets verandert eraan.
    let onderdelen = zetBks(ONDERDELEN, 10, []);
    onderdelen = metOnderdeel(8, (d) => {
      erkenning8(d).studiebekrachtigingen.pop();
    }, onderdelen);
    const run = draaiBron(o, { onderdelen, zonderLijst: true, args: ['--onderdelen', '8'], nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    const na = koppelingVan(o);
    for (const r of na.onderdelen) {
      if (r.onderdeel === 8) continue;
      expect(r, `onderdeel ${r.onderdeel}`).toEqual(voor.onderdelen.find((x) => x.onderdeel === r.onderdeel));
    }
    expect(recordVan(o, 8).opgehaald).toBe('2026-11-03T06:00:00Z');
    expect(recordVan(o, 8).erkenningen[1].bekrachtigingen).toHaveLength(4);
    expect(indexVan(o).bks).toEqual(indexVoor.bks);
    expect(indexVan(o).lijstTotaal).toBe(3);
    expect(rapportVan(o)).toMatchObject({ proef: [8], zonderLijst: true, onderdelen: { gevraagd: 1 }, bks: { gevraagd: 2 }, lijst: { overgeslagen: true, paginas: 0 } });

    // Een proefrun in een lege map: de andere onderdelen krijgen "nog-niet-opgehaald".
    const leeg = opstelling('proefrun-leeg');
    const run2 = draaiBron(leeg, { args: ['--onderdelen', '565,8'] });
    expect(run2.status, run2.stderr).toBe(0);
    expect(koppelingVan(leeg).onderdelen.filter((r) => r.status !== 'nog-niet-opgehaald').map((r) => r.onderdeel)).toEqual([8, 565]);
    expect(indexVan(leeg).bks.map((r) => r.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
    controleerUitvoer(leeg.uit);
  });

  it('een 404 in de bron: het record blijft met zijn laatst bekende koppeling, een BK-bestand blijft met nietMeerInBron', () => {
    const o = opstelling('niet-meer-in-bron');
    expect(draaiBron(o).status).toBe(0);
    const voor = koppelingVan(o);
    const bkVoor = bkVan(o, 'BK-0390-2');
    const weg = { onderdelen: metOnderdeel(565, () => ({ status: 404 })), bks: metBk('BK-0390-2', () => ({ status: 404 })) };
    const run = draaiBron(o, { ...weg, nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    const oud565 = voor.onderdelen.find((r) => r.onderdeel === 565) as Rec;
    expect(recordVan(o, 565)).toEqual({ ...oud565, status: 'niet-gevonden', nietMeerInBron: '2026-11-03' });
    const b = bkVan(o, 'BK-0390-2');
    expect(b).toEqual({ ...bkVoor, nietMeerInBron: '2026-11-03' });
    expect(regelVan(o, 'BK-0390-2')).toMatchObject({ nietMeerInBron: '2026-11-03', opgehaald: NU, sha256: bkVoor.sha256 });
    expect(rapportVan(o).bks.nietMeerInBron).toEqual(['BK-0390-2']);
    controleerUitvoer(o.uit, '2026-11-03');
    // Een volgende run met hetzelfde: de datum blijft, en niets wordt aangeraakt.
    const tussen = momentopname(o.uit);
    const run2 = draaiBron(o, { ...weg, nu: '2026-12-03T06:00:00Z', vandaag: '2026-12-03' });
    expect(run2.status, run2.stderr).toBe(0);
    expect(momentopname(o.uit)).toEqual(tussen);
    // Komen ze terug, dan valt nietMeerInBron weg.
    const run3 = draaiBron(o, { nu: '2027-01-05T06:00:00Z', vandaag: '2027-01-05' });
    expect(run3.status, run3.stderr).toBe(0);
    expect(recordVan(o, 565)).toMatchObject({ status: 'opgehaald', opgehaald: '2027-01-05T06:00:00Z' });
    expect(recordVan(o, 565).nietMeerInBron).toBeUndefined();
    expect(bkVan(o, 'BK-0390-2').nietMeerInBron).toBeUndefined();
    expect(regelVan(o, 'BK-0390-2').nietMeerInBron).toBeUndefined();
    controleerUitvoer(o.uit, '2027-01-05');
  });

  it('nietMeerGekoppeld houdt zijn datum en valt weg als de versie terugkomt', () => {
    const o = opstelling('niet-meer-gekoppeld');
    expect(draaiBron(o).status).toBe(0);
    const bestandVoor = momentopname(o.uit)['bk/BK-0390-2.json'];
    // Onderdeel 8 verwijst voortaan naar BK-0390-3 in plaats van BK-0390-2.
    const onderdelen = zetBks(ONDERDELEN, 8, [bkRef('BK-0464', 1, 'Recreatief medewerker'), bkRef('BK-0390', 3, 'Onthaalmedewerker')]);
    const bks = metBk('BK-0390-3', () => {
      const d = kopie(BKS['BK-0390-2']);
      Object.assign(d.beroepskwalificatie, { versie_nr_lang: 'BK-0390-3', versie_nr_kort: 3 });
      return d;
    });
    const run = draaiBron(o, { onderdelen, bks, nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(regelVan(o, 'BK-0390-2').nietMeerGekoppeld).toBe('2026-11-03');
    expect(regelVan(o, 'BK-0390-3').nietMeerGekoppeld).toBeUndefined();
    expect(momentopname(o.uit)['bk/BK-0390-2.json']).toEqual(bestandVoor);
    const r = rapportVan(o);
    expect(r.onderdelen.andereVersie).toEqual([{ onderdeel: 8, van: 'BK-0390-2', naar: 'BK-0390-3' }]);
    expect(r.bks).toMatchObject({ nieuw: ['BK-0390-3'], nietMeerGekoppeld: ['BK-0390-2'] });
    controleerUitvoer(o.uit, '2026-11-03');
    // Een maand later met hetzelfde: de datum blijft.
    const run2 = draaiBron(o, { onderdelen, bks, nu: '2026-12-03T06:00:00Z', vandaag: '2026-12-03' });
    expect(run2.status, run2.stderr).toBe(0);
    expect(run2.stdout).toMatch(/Geschreven: 0 bestanden/);
    expect(regelVan(o, 'BK-0390-2').nietMeerGekoppeld).toBe('2026-11-03');
    // De versie komt terug: het veld valt weg (en de andere versie krijgt het).
    const run3 = draaiBron(o, { nu: '2027-01-05T06:00:00Z', vandaag: '2027-01-05' });
    expect(run3.status, run3.stderr).toBe(0);
    expect(regelVan(o, 'BK-0390-2').nietMeerGekoppeld).toBeUndefined();
    expect(regelVan(o, 'BK-0390-3').nietMeerGekoppeld).toBe('2027-01-05');
    expect(existsSync(join(o.uit, 'bk', 'BK-0390-3.json'))).toBe(true);
    controleerUitvoer(o.uit, '2027-01-05');
  });

  it('een onbruikbare versie houdt haar oude bestand; zonder oud bestand krijgt ze "onbruikbaar"', () => {
    const o = opstelling('onbruikbaar');
    expect(draaiBron(o).status).toBe(0);
    const voor = momentopname(o.uit);
    const kapot = metBk('BK-0464-1', (d) => {
      delete d.beroepskwalificatie.competenties[1].competentie_code;
    });
    const run = draaiBron(o, { bks: kapot, nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(momentopname(o.uit)).toEqual(voor);
    expect(rapportVan(o).bks.onbruikbaar).toEqual(['BK-0464-1']);
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/BK-0464-1: onbruikbaar; het laatst bekende bestand blijft ongewijzigd/);

    const leeg = opstelling('onbruikbaar-nieuw');
    const run2 = draaiBron(leeg, { bks: kapot });
    expect(run2.status, run2.stderr).toBe(0);
    expect(regelVan(leeg, 'BK-0464-1')).toEqual({ bk: 'BK-0464-1', nummer: 'BK-0464', versie: 1, opgehaald: NU, laatstErkend: 'BK-0464-1', onbruikbaar: true });
    expect(existsSync(join(leeg.uit, 'bk', 'BK-0464-1.json'))).toBe(false);
    controleerUitvoer(leeg.uit);
  });

  it('een extra-veld van 30 kB valt weg met een waarschuwing', () => {
    const o = opstelling('groot-veld');
    const onderdelen = metOnderdeel(8, (d) => {
      erkenning8(d).bijlage = 'x'.repeat(30_000);
    });
    const run = draaiBron(o, { onderdelen });
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(join(o.uit, 'koppeling.json'), 'utf8')).not.toContain('bijlage');
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/ADV-1612: het veld "bijlage" weegt 3\d{4} bytes \(meer dan 20000\) en valt weg/);
    controleerUitvoer(o.uit);
  });

  it('T2: een open einde in het detail blijft open, ook als de matrix een einddatum noemt; het verschil en elke aanvulling staan in het rapport', () => {
    const o = opstelling('t2-open-einde');
    // De matrix in de repo kan tot een maand oud zijn: daar loopt ADV-1612 af op 2026-01-31, het detail laat ze open.
    const map = maakMatrix(o, (m) => {
      const e = (m.onderdelen.find((x) => x.nummer === 8)?.erkenningen ?? []).find((x) => x.nummer === 'ADV-1612') as Rec;
      e.einddatum = '2026-01-31';
    });
    const run = draaiBron(o, { structuur: map });
    expect(run.status, run.stderr).toBe(0);
    const e = recordVan(o, 8).erkenningen[1] as Rec;
    expect(e).toMatchObject({ adv: 'ADV-1612', status: 'ERKEND', begindatum: '2023-09-01' });
    expect(e.einddatum).toBeUndefined();
    expect(erkenningenOp(recordVan(o, 8).erkenningen, VANDAAG).nu.map((x) => x.adv)).toEqual(['ADV-1612']);
    expect(telNu(koppelingVan(o))).toEqual({ onderdelen: 4, versies: 4 });
    const r = rapportVan(o);
    expect(r.onderdelen).toMatchObject({
      uitMatrix: 1, verschilMetMatrix: 1,
      aanvullingenUitMatrix: [{ onderdeel: 565, adv: 'ADV-0960', velden: ['status', 'begindatum', 'einddatum'] }],
      erkenningVerschilMetMatrix: [{ onderdeel: 8, adv: 'ADV-1612', veld: 'einddatum', detail: null, matrix: '2026-01-31' }],
    });
    const w = r.waarschuwingen.join('\n');
    expect(w).toMatch(/T2: bij 1 erkenning komt een veld uit de matrix, omdat het detail het niet noemt \(onderdeel 565, ADV-0960: status, begindatum, einddatum\)/);
    expect(w).toMatch(/verschillen 1 keer in de status of de datums van een erkenning; het detail telt \(onderdeel 8, ADV-1612: einddatum in het detail open, in de matrix 2026-01-31\)/);
    // Zonder de verouderde einddatum in de matrix: dezelfde koppeling (op de matrix na).
    const o2 = opstelling('t2-open-einde-gewoon');
    expect(draaiBron(o2).status).toBe(0);
    expect(koppelingVan(o).onderdelen).toEqual(koppelingVan(o2).onderdelen);
    expect(rapportVan(o2).onderdelen).toMatchObject({ verschilMetMatrix: 0, erkenningVerschilMetMatrix: [] });
  });

  it('T2 per veld: status en begindatum uit de matrix als het detail ze niet noemt; de einddatum alleen als het detail geen enkele datum geeft', () => {
    const o = opstelling('t2-per-veld');
    const map = maakMatrix(o, (m) => {
      const e = (m.onderdelen.find((x) => x.nummer === 8)?.erkenningen ?? []).find((x) => x.nummer === 'ADV-1612') as Rec;
      e.einddatum = '2026-01-31';
    });
    const onderdelen = metOnderdeel(8, (d) => {
      // ADV-1612 met een begindatum maar zonder status; ADV-0917 (afgelopen) met een status maar zonder datums.
      delete erkenning8(d).status;
      const oud = (d.structuuronderdeel_details as Rec[]).find((x) => x.structuuronderdeel_detail_nummer === 'ADV-0917') as Rec;
      delete oud.begindatum;
      delete oud.einddatum;
    });
    const run = draaiBron(o, { structuur: map, onderdelen });
    expect(run.status, run.stderr).toBe(0);
    expect(recordVan(o, 8).erkenningen.map((e: Rec) => [e.adv, e.status, e.begindatum, e.einddatum ?? null])).toEqual([
      ['ADV-0917', 'ERKEND', '2021-09-01', '2024-08-31'],
      ['ADV-1612', 'ERKEND', '2023-09-01', null],
    ]);
    // ADV-0917 blijft afgelopen: BK-0390-1 wordt niet gevraagd (anders: "geen antwoord voor BK-0390-1", exit 1).
    expect(indexVan(o).bks.map((r) => r.bk)).not.toContain('BK-0390-1');
    expect(rapportVan(o).onderdelen).toMatchObject({
      uitMatrix: 3,
      aanvullingenUitMatrix: [
        { onderdeel: 8, adv: 'ADV-0917', velden: ['begindatum', 'einddatum'] },
        { onderdeel: 8, adv: 'ADV-1612', velden: ['status'] },
        { onderdeel: 565, adv: 'ADV-0960', velden: ['status', 'begindatum', 'einddatum'] },
      ],
      erkenningVerschilMetMatrix: [{ onderdeel: 8, adv: 'ADV-1612', veld: 'einddatum', detail: null, matrix: '2026-01-31' }],
    });
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/T2: bij 3 erkenningen komen een veld uit de matrix/);
  });

  it('een versie die alleen nog in een afgelopen erkenning staat, blijft gekoppeld (geen nietMeerGekoppeld)', () => {
    const o = opstelling('genoemd-afgelopen');
    expect(draaiBron(o).status).toBe(0);
    // ADV-1612 loopt af op 2026-09-30; een nieuwe erkenning ADV-2000 vanaf 2026-10-01 noemt BK-0390-3 en BK-0464-1.
    const onderdelen = metOnderdeel(8, (d) => {
      const e = erkenning8(d);
      e.einddatum = '2026-09-30';
      const nieuw: Rec = { ...kopie(e), structuuronderdeel_detail_nummer: 'ADV-2000', structuuronderdeel_detail_versie: 'S-8-V3', begindatum: '2026-10-01', studiebekrachtigingen: [] };
      delete nieuw.einddatum;
      nieuw.beroepskwalificaties = [bkRef('BK-0390', 3, 'Onthaalmedewerker'), bkRef('BK-0464', 1, 'Recreatief medewerker')];
      (d.structuuronderdeel_details as Rec[]).push(nieuw);
    });
    const bks = metBk('BK-0390-3', () => bkDetail('BK-0390-3', 'BK-0390-2'));
    const run = draaiBron(o, { onderdelen, bks, nu: '2026-11-03T06:00:00Z', vandaag: '2026-11-03' });
    expect(run.status, run.stderr).toBe(0);
    expect(recordVan(o, 8).erkenningen.map((e: Rec) => [e.adv, e.bks.map((b: Rec) => b.bk)])).toEqual([
      ['ADV-0917', ['BK-0390-1']],
      ['ADV-1612', ['BK-0390-2', 'BK-0464-1']],
      ['ADV-2000', ['BK-0390-3', 'BK-0464-1']],
    ]);
    expect(regelVan(o, 'BK-0390-2')).toMatchObject({ bestand: 'bk/BK-0390-2.json', opgehaald: NU });
    expect(regelVan(o, 'BK-0390-2').nietMeerGekoppeld).toBeUndefined();
    const r = rapportVan(o);
    expect(r.bks.nietMeerGekoppeld).toEqual([]);
    expect(r.onderdelen.andereVersie).toEqual([{ onderdeel: 8, van: 'BK-0390-2', naar: 'BK-0390-3' }]);
    controleerUitvoer(o.uit, '2026-11-03');
  });

  it('versie 10 en hoger: numeriek gesorteerd (BK-0390-2 vóór BK-0390-10); een dubbel nummer in de lijst: de hoogste versie telt, in elke volgorde', () => {
    const bks = metBk('BK-0390-10', () => bkDetail('BK-0390-10', 'BK-0390-2'));
    const onderdelen = zetBks(ONDERDELEN, 8, [bkRef('BK-0464', 1, 'Recreatief medewerker'), bkRef('BK-0390', 10, 'Onthaalmedewerker'), bkRef('BK-0390', 2, 'Onthaalmedewerker')]);
    // BK-0390 staat twee keer in de lijst: met laatst erkend BK-0390-2 en met BK-0390-10.
    const dubbel = { ...kopie(LIJST[0].gegevens[0]), laatst_erkende_versie: { versie_nr_kort: 10, versie_nr_lang: 'BK-0390-10', titel: 'Onthaalmedewerker' } };
    const metTotaal = (paginas: Rec[]): Rec[] => paginas.map((p) => ({ ...p, meta: { ...p.meta, total_elements: 4 } }));
    const lijstA = metTotaal(kopie(LIJST));
    lijstA[1].gegevens.push(dubbel); // eerst versie 2, dan 10
    const lijstB = metTotaal(kopie(LIJST));
    lijstB[0].gegevens.unshift(dubbel); // eerst versie 10, dan 2
    const a = opstelling('versie-10-a');
    const runA = draaiBron(a, { onderdelen, bks, lijst: lijstA });
    expect(runA.status, runA.stderr).toBe(0);
    const b = opstelling('versie-10-b');
    const runB = draaiBron(b, { onderdelen, bks, lijst: lijstB });
    expect(runB.status, runB.stderr).toBe(0);
    expect(inhoud(b.uit)).toEqual(inhoud(a.uit));
    controleerUitvoer(a.uit);
    expect(indexVan(a).bks.map((r) => r.bk)).toEqual(['BK-0390-2', 'BK-0390-10', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2', 'BK-9999-3']);
    expect(recordVan(a, 8).erkenningen[1].bks.map((x: Rec) => x.bk)).toEqual(['BK-0390-2', 'BK-0390-10', 'BK-0464-1']);
    expect(regelVan(a, 'BK-0390-2').laatstErkend).toBe('BK-0390-10');
    expect(regelVan(a, 'BK-0390-10')).toMatchObject({ nummer: 'BK-0390', versie: 10, bestand: 'bk/BK-0390-10.json', laatstErkend: 'BK-0390-10' });
    expect(doelcodesVanBestand(bkVan(a, 'BK-0390-10')).get('bkc0045062')).toBe('BK-0390-10.01');
    for (const o of [a, b]) {
      const r = rapportVan(o);
      expect(r.lijst).toMatchObject({ volledig: true, totaal: 4, ontvangen: 4 });
      expect(r.lijst.nieuwereVersie).toEqual([{ bk: 'BK-0390-2', laatstErkend: 'BK-0390-10' }, { bk: 'BK-9999-1', laatstErkend: 'BK-9999-2' }]);
      expect(r.waarschuwingen.join('\n')).toMatch(/BK-lijst: BK-0390 staat er meer dan één keer, met een andere laatst erkende versie \(BK-0390-(2|10) en BK-0390-(10|2)\); de hoogste telt/);
      expect(r.bks.versieOverlap[0]).toMatchObject({ nummer: 'BK-0390', van: 'BK-0390-2', naar: 'BK-0390-10', gedeeld: 12, tekstenGelijk: true });
    }
  });

  describe('de sleutel nergens: elke laag die haar weghaalt', () => {
    // De lagen zijn bewust dubbel: `veilig` in de catch en in `meld` (stderr), `veilig` in de catch en `schoon` in
    // schrijfRapport (rapport.fout). Deze tests falen als beide lagen van een paar weg zijn; `log` en `schoon` voor
    // de rest van het rapport zijn de enige laag voor wat ze doorgeven, en hebben elk een eigen test.
    const env = { ONDERWIJSDOELEN_API_KEY: SLEUTEL };

    it('de sleutel in het pad van een optie bij een fout: stderr en rapport.fout tonen <verborgen> (veilig in de catch en in meld)', () => {
      const o = opstelling('sleutel-in-pad');
      const run = draaiBron(o, { structuur: join(o.map, SLEUTEL), env });
      eisStop(o, run, 1, /Geen bruikbare matrix: .*<verborgen>.*ontbreekt/);
      expect(rapportVan(o).fout).toContain('<verborgen>');
      expect(alleUitvoer(run, o.rapport)).not.toContain(SLEUTEL);
    });

    it('de sleutel in het rapportpad bij een geslaagde run: de logregel toont <verborgen> (veilig in log)', () => {
      const map = join(TMP, `${++teller}-sleutel-in-rapportpad`);
      mkdirSync(map, { recursive: true });
      const o: Opstelling = { map, uit: join(map, 'uit'), rapport: join(map, SLEUTEL, 'rapport.json') };
      const run = draaiBron(o, { env });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toMatch(/Rapport: .*<verborgen>[/\\]rapport\.json/);
      expect(alleUitvoer(run, o.rapport, o.uit)).not.toContain(SLEUTEL);
    });

    it('de sleutel als veldnaam in een antwoord: alleen het rapport noemt veldnamen, en daar staat <verborgen> (schoon in schrijfRapport)', () => {
      const o = opstelling('sleutel-als-veldnaam');
      const onderdelen = metOnderdeel(8, (d) => {
        d[SLEUTEL] = 'x';
      });
      const run = draaiBron(o, { onderdelen, env });
      expect(run.status, run.stderr).toBe(0);
      // De veldnaam komt alleen in de veldinventaris van het rapport; de gegevens zijn die van de fixtures.
      expect(inhoud(o.uit)).toEqual(inhoud(join(FIXTURES, 'uit')));
      expect(rapportVan(o).onderdelen.veldInventaris['<verborgen>']).toBe(1);
      expect(alleUitvoer(run, o.rapport, o.uit)).not.toContain(SLEUTEL);
    });
  });

  it('--help toont de opties', () => {
    const o = opstelling('hulp');
    const run = draai(['--help', '--uit', o.uit, '--rapport', o.rapport]);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/Gebruik: node tools\/leerplannen\/haal-beroepskwalificaties\.mjs/);
    expect(existsSync(o.uit)).toBe(false);
  });

  describe('harde poorten: de juiste exitcode, en niets geschreven behalve het rapport', () => {
    it('P1: ongeldige opties → 1', () => {
      const gevallen: [string[], RegExp][] = [
        [['--onbekend', 'x'], /Onbekende optie: --onbekend/],
        [['--onderdelen', '0'], /--onderdelen is ongeldig/],
        [['--onderdelen', '8,x'], /--onderdelen is ongeldig/],
        [['--onderdelen', '8,8'], /meer dan één keer/],
        [['--onderdelen', Array.from({ length: 51 }, (_, i) => i + 1).join(',')], /hoogstens 50 onderdelen/],
        [['--onderdelen', '99999'], /99999 staat niet in de matrix/],
        [['--zonder-lijst=ja'], /Bij --zonder-lijst hoort geen waarde/],
        [['--uit', join(TMP, 'ander-uit')], /De optie --uit staat er meer dan één keer/],
        [['--zonder-lijst', '--zonder-lijst'], /De optie --zonder-lijst staat er meer dan één keer/],
      ];
      for (const [args, melding] of gevallen) {
        const o = opstelling('opties');
        eisStop(o, draaiBron(o, { args }), 1, melding);
      }
      expect(existsSync(join(TMP, 'ander-uit'))).toBe(false);
      // Een lege waarde wordt nooit de huidige map: --uit= in een eigen werkmap schrijft daar niets.
      const leeg = opstelling('lege-uit');
      const runLeeg = draai(vervangOptie(bronArgs(leeg), '--uit', ['--uit=']), {}, leeg.map);
      expect(runLeeg.status, runLeeg.stdout).toBe(1);
      expect(runLeeg.stderr).toMatch(/Bij --uit hoort een waarde; ze is leeg/);
      expect(readdirSync(leeg.map).filter((f) => !BRONBESTAND.test(f))).toEqual(['rapport.json']);
      expect(rapportVan(leeg).fout).toMatch(/Bij --uit hoort een waarde; ze is leeg/);
      const ov = opstelling('vandaag');
      eisStop(ov, draaiBron(ov, { vandaag: '2026-02-30' }), 1, /--vandaag moet een datum/);
      const o = opstelling('zonder-lijst-en-bron');
      eisStop(o, draaiBron(o, { args: ['--zonder-lijst'] }), 1, /--zonder-lijst past niet bij --bron-lijst/);
      // --nu kan alleen zonder API.
      const o2 = opstelling('nu-met-api');
      eisStop(o2, draai(['--nu', NU, '--structuur', STRUCTUUR, '--uit', o2.uit, '--rapport', o2.rapport], { ONDERWIJSDOELEN_API_KEY: SLEUTEL }), 1, /--nu kan alleen als niets via de API gaat/);
    });

    it('P1: geen sleutel, of een basis op een andere origin → 1, zonder verzoek', () => {
      const o = opstelling('geen-sleutel');
      eisStop(o, draai(['--structuur', STRUCTUUR, '--uit', o.uit, '--rapport', o.rapport]), 1, /ONDERWIJSDOELEN_API_KEY ontbreekt/);
      const o2 = opstelling('andere-basis');
      const run = draai(['--structuur', STRUCTUUR, '--uit', o2.uit, '--rapport', o2.rapport], {
        ONDERWIJSDOELEN_API_KEY: SLEUTEL,
        BEROEPSKWALIFICATIES_API_BASE: 'https://example.org/kwalificaties-en-curriculum/beroepskwalificaties/v2',
      });
      eisStop(o2, run, 1, /BEROEPSKWALIFICATIES_API_BASE moet met https:\/\/onderwijs\.api\.vlaanderen\.be beginnen/);
      expect(alleUitvoer(run, o2.rapport)).not.toContain(SLEUTEL);
    });

    it('P1: een rapportpad dat niet kan → 1 meteen, vóór het ophalen, en er is niets geschreven (ook het rapport niet)', () => {
      // Een bestaande map.
      const o = opstelling('rapport-is-map');
      const run = draaiBron({ ...o, rapport: o.map });
      expect(run.status, run.stdout).toBe(1);
      expect(run.stderr).toMatch(/Het rapport .* kan niet geschreven worden \(EISDIR\)\. Er is niets geschreven\./);
      expect(run.stdout).not.toMatch(/Matrix:|Geschreven/);
      expect(existsSync(o.uit)).toBe(false);
      // Een lege waarde (anders de huidige map), in een eigen werkmap.
      const o2 = opstelling('rapport-leeg');
      const run2 = draai(vervangOptie(bronArgs(o2), '--rapport', ['--rapport=']), {}, o2.map);
      expect(run2.status, run2.stdout).toBe(1);
      expect(run2.stderr).toMatch(/Bij --rapport hoort een bestand; de waarde is leeg/);
      expect(readdirSync(o2.map).filter((f) => !BRONBESTAND.test(f))).toEqual([]);
      // In de uitvoermap, in de structuurmap, of een bronbestand: het rapport zou gegevens overschrijven.
      const o3 = opstelling('rapport-in-uit');
      const run3 = draaiBron({ ...o3, rapport: join(o3.uit, 'rapport.json') });
      expect(run3.status).toBe(1);
      expect(run3.stderr).toMatch(/--rapport .* mag niet in de map van --uit/);
      expect(existsSync(o3.uit)).toBe(false);
      const o4 = opstelling('rapport-in-structuur');
      const map = maakMatrix(o4, () => undefined);
      const matrixVoor = readFileSync(join(map, 'studierichtingen.json'), 'utf8');
      const run4 = draaiBron({ ...o4, rapport: join(map, 'studierichtingen.json') }, { structuur: map });
      expect(run4.status).toBe(1);
      expect(run4.stderr).toMatch(/--rapport .* mag niet in de map van --structuur/);
      expect(readFileSync(join(map, 'studierichtingen.json'), 'utf8')).toBe(matrixVoor);
      expect(existsSync(o4.uit)).toBe(false);
      const o5 = opstelling('rapport-is-bron');
      const args = bronArgs(o5);
      const bron = args[args.indexOf('--bron-onderdelen') + 1];
      const bronVoor = readFileSync(bron, 'utf8');
      const run5 = draai(vervangOptie(args, '--rapport', ['--rapport', bron]));
      expect(run5.status).toBe(1);
      expect(run5.stderr).toMatch(/--rapport mag niet hetzelfde bestand zijn als --bron-onderdelen/);
      expect(readFileSync(bron, 'utf8')).toBe(bronVoor);
      expect(existsSync(o5.uit)).toBe(false);
    });

    it('P1: geen bruikbare matrix → 1', () => {
      const o = opstelling('geen-matrix');
      eisStop(o, draaiBron(o, { structuur: join(o.map, 'bestaat-niet') }), 1, /Geen bruikbare matrix: .*ontbreekt/);
      const o2 = opstelling('matrix-sha');
      const map = maakMatrix(o2, () => undefined);
      const m = leesJson(join(map, 'studierichtingen.json'));
      m.sha256 = '0'.repeat(64);
      writeFileSync(join(map, 'studierichtingen.json'), JSON.stringify(m));
      eisStop(o2, draaiBron(o2, { structuur: map }), 1, /Geen bruikbare matrix .*de sha256 klopt niet/);
    });

    it('P1: een ander antwoord dan 200 of 404, of een ontbrekend antwoord in de bron → 1', () => {
      const o = opstelling('bron-500');
      eisStop(o, draaiBron(o, { onderdelen: metOnderdeel(8, () => ({ status: 500 })) }), 1, /Onderdeel 8: de bron antwoordt met HTTP 500/);
      const o2 = opstelling('bron-ontbreekt');
      eisStop(o2, draaiBron(o2, { bks: Object.fromEntries(Object.entries(BKS).filter(([k]) => k !== 'BK-0464-1')) }), 1, /geen antwoord voor BK-0464-1/);
      const o3 = opstelling('bron-sleutel');
      eisStop(o3, draaiBron(o3, { onderdelen: { ...ONDERDELEN, onzin: {} } }), 1, /onbekende sleutel "onzin"/);
    });

    it('P1: bestaande bestanden die niet kloppen → 1, en er verandert niets', () => {
      const o = opstelling('bestaand-kapot');
      expect(draaiBron(o).status).toBe(0);
      const pad = join(o.uit, 'koppeling.json');
      writeFileSync(pad, readFileSync(pad, 'utf8').replace('"onderdeel":9,', '"onderdeel":9,"x":1,'));
      let voor = momentopname(o.uit);
      eisStop(o, draaiBron(o), 1, /De bestaande bestanden .* kloppen niet: koppeling\.json/, voor);
      // Een bestand in bk/ dat de index niet noemt.
      const o2 = opstelling('bestaand-vreemd');
      expect(draaiBron(o2).status).toBe(0);
      cpSync(join(o2.uit, 'bk', 'BK-9999-2.json'), join(o2.uit, 'bk', 'rommel.json'));
      voor = momentopname(o2.uit);
      eisStop(o2, draaiBron(o2), 1, /bk\/rommel\.json: een onbekend bestand/, voor);
      // Een BK-bestand waarvan de sha256 niet klopt.
      const o3 = opstelling('bestaand-sha');
      expect(draaiBron(o3).status).toBe(0);
      const bkPad = join(o3.uit, 'bk', 'BK-9999-2.json');
      writeFileSync(bkPad, readFileSync(bkPad, 'utf8').replace('Plant het eigen werk', 'Plant het werk'));
      voor = momentopname(o3.uit);
      eisStop(o3, draaiBron(o3), 1, /bk\/BK-9999-2\.json: de sha256 klopt niet/, voor);
    });

    it('P1: de bestaande bestanden passen niet bij elkaar of bij de matrix → 1, en er verandert niets', () => {
      const zonderG0117 = (o: Opstelling) => maakMatrix(o, (m) => {
        m.onderdelen = m.onderdelen.filter((x) => x.nummer !== 129);
        m.groepen = m.groepen.filter((g) => g.nummer !== 'G-0117');
        Object.assign(m, { aantalOnderdelen: m.onderdelen.length, aantalGroepen: m.groepen.length });
      });
      const gevallen: { naam: string; pas: (o: Opstelling) => void; run?: (o: Opstelling) => BronRun; melding: RegExp }[] = [
        { naam: 'koppeling-zonder-index', pas: (o) => rmSync(join(o.uit, 'index.json')), melding: /koppeling\.json staat er, maar index\.json niet/ },
        { naam: 'index-zonder-koppeling', pas: (o) => rmSync(join(o.uit, 'koppeling.json')), melding: /index\.json staat er, maar koppeling\.json niet/ },
        {
          naam: 'bk-zonder-index',
          pas: (o) => {
            rmSync(join(o.uit, 'index.json'));
            rmSync(join(o.uit, 'koppeling.json'));
          },
          melding: /In bk\/ staan bestanden zonder index/,
        },
        { naam: 'onderdeel-niet-in-matrix', pas: () => undefined, run: (o) => ({ structuur: zonderG0117(o) }), melding: /De koppeling noemt onderdelen die niet in de matrix staan: 129\./ },
        {
          naam: 'bestand-niet-in-index',
          pas: (o) => pasIndexAan(o.uit, (bks) => bks.filter((r) => r.bk !== 'BK-9999-2')),
          melding: /bk\/BK-9999-2\.json staat er, maar de index noemt het niet/,
        },
        { naam: 'index-noemt-ontbrekend-bestand', pas: (o) => rmSync(join(o.uit, 'bk', 'BK-9999-2.json')), melding: /De index noemt bk\/BK-9999-2\.json, maar dat bestand ontbreekt/ },
        {
          naam: 'kop-past-niet-bij-index',
          // "opgehaald" telt niet in de sha256: het bestand zelf blijft geldig, alleen de index klopt niet meer.
          pas: (o) => {
            const pad = join(o.uit, 'bk', 'BK-0390-2.json');
            writeFileSync(pad, readFileSync(pad, 'utf8').replace(`"opgehaald": "${NU}"`, '"opgehaald": "2026-10-11T00:00:00Z"'));
          },
          melding: /bk\/BK-0390-2\.json: de kop klopt niet met de regel in de index/,
        },
      ];
      for (const g of gevallen) {
        const o = opstelling(`bestaand-${g.naam}`);
        expect(draaiBron(o).status).toBe(0);
        g.pas(o);
        const voor = momentopname(o.uit);
        eisStop(o, draaiBron(o, g.run?.(o) ?? {}), 1, g.melding, voor);
      }
    });

    it('P1: de sleutel in de opgehaalde gegevens → 1, niets geschreven, en de sleutel nergens', () => {
      const o = opstelling('sleutel-in-data');
      const bks = metBk('BK-9999-2', (d) => {
        d.beroepskwalificatie.competenties[1].waarde = `Plant met ${SLEUTEL}`;
      });
      const run = draaiBron(o, { bks, env: { ONDERWIJSDOELEN_API_KEY: SLEUTEL } });
      eisStop(o, run, 1, /bevatten de API-sleutel/);
      expect(alleUitvoer(run, o.rapport)).not.toContain(SLEUTEL);
    });

    it('P2: geen enkel onderdeel te vragen, of geen enkel detail ontvangen → 2', () => {
      const o = opstelling('niets-te-vragen');
      const map = maakMatrix(o, (m) => {
        for (const x of m.onderdelen) x.nietMeerInBron = '2026-01-01';
      });
      eisStop(o, draaiBron(o, { structuur: map }), 2, /geen enkel onderdeel te vragen/);
      const o2 = opstelling('niets-ontvangen');
      eisStop(o2, draaiBron(o2, { args: ['--onderdelen', '931'] }), 2, /Geen enkel detail ontvangen/);
    });

    it('P3: het detail negeert het nummer of de versie → 3', () => {
      const gevallen: [BronRun, RegExp][] = [
        [{ onderdelen: metOnderdeel(8, (d) => { d.structuuronderdeel_nummer = 9; }) }, /P3: Onderdeel 8: het detail gaat over onderdeel 9/],
        [{ onderdelen: metOnderdeel(8, (d) => { delete d.structuuronderdeel_nummer; d.nummer = 8; }) }, /P3: Onderdeel 8: het detail noemt geen eigen nummer/],
        [{ bks: metBk('BK-0390-2', (d) => { Object.assign(d.beroepskwalificatie, { versie_nr_lang: 'BK-0390-3', versie_nr_kort: 3 }); }) }, /P3: BK-0390-2: het detail gaat over BK-0390-3/],
        [{ bks: metBk('BK-0390-2', () => ({ gegevens: [], totalItems: 0 })) }, /P3: BK-0390-2: het antwoord heeft geen object "beroepskwalificatie"/],
      ];
      for (const [run, melding] of gevallen) {
        const o = opstelling('p3');
        eisStop(o, draaiBron(o, run), 3, melding);
        expect(rapportVan(o).problemen.join('\n')).toMatch(melding);
      }
    });

    it('P4: een BK-verwijzing die niet past of niet bij haar nummer hoort → 3', () => {
      const o = opstelling('p4-past-niet');
      const onderdelen = metOnderdeel(8, (d) => {
        erkenning8(d).beroepskwalificaties.push({ versie_nr_lang: 'BK-39', titel: 'Kapot' });
      });
      eisStop(o, draaiBron(o, { onderdelen }), 3, /P4: Onderdeel 8, ADV-1612: een beroepskwalificatie is niet te lezen/);
      const o2 = opstelling('p4-ander-nummer');
      const onderdelen2 = metOnderdeel(8, (d) => {
        erkenning8(d).beroepskwalificaties.push({ beroepskwalificatie_nr: 'BK-0390', versie_nr_kort: 2, versie_nr_lang: 'BK-0391-2' });
      });
      eisStop(o2, draaiBron(o2, { onderdelen: onderdelen2 }), 3, /P4: .*de versie BK-0391-2 begint niet met haar nummer BK-0390/);
    });

    it('P5: de koppeling lijkt niet meer te werken (3de graad A zonder BK) → 3, maar niet in een proefrun', () => {
      const o = opstelling('p5');
      // In deze matrix is G-0008 een richting van de 3de graad: onderdeel 8 telt dan mee voor P5.
      const map = maakMatrix(o, (m) => {
        (m.groepen.find((g) => g.nummer === 'G-0008') as Rec).graad = '3';
      });
      const zonder = zetBks(ONDERDELEN, 8, []);
      eisStop(o, draaiBron(o, { structuur: map, onderdelen: zonder }), 3, /P5: maar 0 van de 1 gewone onderdelen van de 3de graad met finaliteit A/);
      // Met de BK's van de fixtures haalt dezelfde matrix P5 wel.
      const o2 = opstelling('p5-ok');
      expect(draaiBron(o2, { structuur: map }).status).toBe(0);
      expect(rapportVan(o2).onderdelen.derdeGraadA).toEqual({ onderdelen: 1, metBk: 1 });
      // Een proefrun telt niet voor P5.
      const o3 = opstelling('p5-proef');
      expect(draaiBron(o3, { structuur: map, onderdelen: zonder, args: ['--onderdelen', '8'] }).status).toBe(0);
    });

    it('P6 (a): het aantal onderdelen met een BK nu daalt met meer dan 10 % → 3', () => {
      const o = opstelling('p6a');
      expect(draaiBron(o).status).toBe(0);
      const voor = momentopname(o.uit);
      let onderdelen = zetBks(ONDERDELEN, 8, []);
      onderdelen = zetBks(onderdelen, 565, []);
      eisStop(o, draaiBron(o, { onderdelen }), 3, /P6 \(a\): het aantal onderdelen met een beroepskwalificatie in een erkenning van nu daalt van 4 naar 2/, voor);
    });

    it('P6 (b): het aantal unieke gekoppelde BK-versies daalt met meer dan 10 % → 3', () => {
      const o = opstelling('p6b');
      expect(draaiBron(o).status).toBe(0);
      const voor = momentopname(o.uit);
      const ref = bkRef('BK-0390', 2, 'Onthaalmedewerker');
      let onderdelen = ONDERDELEN;
      for (const nr of [8, 565, 10, 12]) onderdelen = zetBks(onderdelen, nr, [ref]);
      const run = draaiBron(o, { onderdelen });
      eisStop(o, run, 3, /P6 \(b\): het aantal unieke gekoppelde BK-versies daalt van 4 naar 1/, voor);
      expect(run.stderr).not.toMatch(/P6 \(a\)/);
    });

    it('P5 op de grens: precies 50 % mag nog (0); minder → 3', () => {
      // G-0008 (onderdeel 8, met BK) en G-0193 (onderdeel 247, een lege lijst) worden gewone richtingen van de
      // 3de graad A: 1 van de 2 heeft een BK nu.
      const derdeGraadA = (m: MatrixBestand, groepen: string[]) => {
        for (const g of m.groepen) if (groepen.includes(g.nummer)) Object.assign(g, { graad: '3', finaliteit: 'A' });
      };
      const o = opstelling('p5-grens');
      const map = maakMatrix(o, (m) => derdeGraadA(m, ['G-0008', 'G-0193']));
      const run = draaiBron(o, { structuur: map });
      expect(run.status, run.stderr).toBe(0);
      expect(rapportVan(o).onderdelen.derdeGraadA).toEqual({ onderdelen: 2, metBk: 1 });
      // Met G-0117 (onderdeel 129, zonder lijst) erbij: 1 van de 3.
      const o2 = opstelling('p5-grens-over');
      const map2 = maakMatrix(o2, (m) => derdeGraadA(m, ['G-0008', 'G-0193', 'G-0117']));
      eisStop(o2, draaiBron(o2, { structuur: map2 }), 3, /P5: maar 1 van de 3 gewone onderdelen van de 3de graad met finaliteit A/);
    });

    it('P6 (a) op de grens: precies 10 % minder onderdelen met een BK nu mag nog (0); meer → 3', () => {
      const ref = [bkRef('BK-0390', 2, 'Onthaalmedewerker')];
      const extra = [9, 129, 247, 379, 417, 679];
      const met = (nrs: number[]) => nrs.reduce((bron, nr) => zetBks(bron, nr, ref), ONDERDELEN);
      const o = opstelling('p6a-grens');
      expect(draaiBron(o, { onderdelen: met(extra) }).status).toBe(0);
      expect(telNu(koppelingVan(o)).onderdelen).toBe(10);
      const o2 = opstelling('p6a-grens-over');
      cpSync(o.uit, o2.uit, { recursive: true });
      const voor2 = momentopname(o2.uit);
      // 10 → 9: precies 10 %.
      const run = draaiBron(o, { onderdelen: met(extra.slice(0, 5)) });
      expect(run.status, run.stderr).toBe(0);
      expect(telNu(koppelingVan(o)).onderdelen).toBe(9);
      // 10 → 8: 20 %.
      eisStop(o2, draaiBron(o2, { onderdelen: met(extra.slice(0, 4)) }), 3, /P6 \(a\): het aantal onderdelen met een beroepskwalificatie in een erkenning van nu daalt van 10 naar 8/, voor2);
    });

    it('P6 (b) op de grens: precies 10 % minder unieke BK-versies mag nog (0); meer → 3', () => {
      const extra = ['BK-9990-1', 'BK-9991-1', 'BK-9992-1', 'BK-9993-1', 'BK-9994-1', 'BK-9995-1'];
      const bks = extra.reduce((bron, bk) => metBk(bk, () => bkDetail(bk), bron), BKS);
      const refs = (lijst: string[]) => [
        bkRef('BK-0390', 2, 'Onthaalmedewerker'), bkRef('BK-0464', 1, 'Recreatief medewerker'), ...lijst.map((bk) => bkRef(bk.slice(0, 7), 1, 'Nagebootste beroepskwalificatie')),
      ];
      const o = opstelling('p6b-grens');
      expect(draaiBron(o, { onderdelen: zetBks(ONDERDELEN, 8, refs(extra)), bks }).status).toBe(0);
      expect(telNu(koppelingVan(o))).toEqual({ onderdelen: 4, versies: 10 });
      const o2 = opstelling('p6b-grens-over');
      cpSync(o.uit, o2.uit, { recursive: true });
      const voor2 = momentopname(o2.uit);
      // 10 → 9: precies 10 %.
      const run = draaiBron(o, { onderdelen: zetBks(ONDERDELEN, 8, refs(extra.slice(0, 5))), bks });
      expect(run.status, run.stderr).toBe(0);
      expect(telNu(koppelingVan(o)).versies).toBe(9);
      // 10 → 8: 20 %.
      const run2 = draaiBron(o2, { onderdelen: zetBks(ONDERDELEN, 8, refs(extra.slice(0, 4))), bks });
      eisStop(o2, run2, 3, /P6 \(b\): het aantal unieke gekoppelde BK-versies daalt van 10 naar 8/, voor2);
      expect(run2.stderr).not.toMatch(/P6 \(a\)/);
    });

    it('P6 (c): meer dan max(5, 5 %) van de onderdelen geeft twee keer 404 → 3 (5 mag nog)', () => {
      const weg = (nrs: number[]) => nrs.reduce((bron, nr) => metOnderdeel(nr, () => ({ status: 404 }), bron), ONDERDELEN);
      const o = opstelling('p6c-ok');
      expect(draaiBron(o, { onderdelen: weg([129, 247, 379, 417]) }).status).toBe(0);
      expect(rapportVan(o).onderdelen.nietGevonden).toBe(5);
      const o2 = opstelling('p6c');
      eisStop(o2, draaiBron(o2, { onderdelen: weg([129, 247, 379, 417, 908]) }), 3, /P6 \(c\): 6 van de 14 gevraagde onderdelen gaven twee keer 404/);
    });

    it('P6 (d): meer dan max(3, 5 %) van de BK-versies geeft twee keer 404 → 3 (3 mag nog)', () => {
      const weg = (bks: string[]) => bks.reduce((bron, bk) => metBk(bk, () => ({ status: 404 }), bron), BKS);
      const o = opstelling('p6d-ok');
      expect(draaiBron(o, { bks: weg(['BK-9999-1', 'BK-9999-2']) }).status).toBe(0);
      expect(rapportVan(o).bks.nietGevonden).toEqual(['BK-9999-1', 'BK-9999-2', 'BK-9999-3']);
      const o2 = opstelling('p6d');
      eisStop(o2, draaiBron(o2, { bks: weg(['BK-0464-1', 'BK-9999-1', 'BK-9999-2']) }), 3, /P6 \(d\): 4 van de 5 gevraagde BK-versies gaven twee keer 404/);
    });

    // Niet getest, bewust: de interne netten "KP5" (een BK van nu of later die niet in de gebouwde index staat) en
    // `controleerGebouwd` (een gebouwd bestand dat zijn eigen validator niet haalt). Met gewone invoer gaan ze
    // nooit af: stap 4 vraagt elke BK van nu en later, en stap 7 bouwt alleen wat normaliseer* aanvaardde. Ze
    // vangen een fout in het script zelf. Haal ze niet weg omdat geen test ze raakt: ze moeten exit 3 geven
    // vóór er iets geschreven wordt.

    it('P7: meer dan max(3, 2 %) van de BK-versies is onbruikbaar → 3 (3 mag nog)', () => {
      const kapot = (bks: string[]) => bks.reduce((bron, bk) => metBk(bk, (d) => { d.beroepskwalificatie.competenties[0].waarde = ''; }, bron), BKS);
      const o = opstelling('p7-ok');
      expect(draaiBron(o, { bks: kapot(['BK-0390-2', 'BK-0464-1', 'BK-9999-1']) }).status).toBe(0);
      expect(rapportVan(o).bks.onbruikbaar).toEqual(['BK-0390-2', 'BK-0464-1', 'BK-9999-1']);
      const o2 = opstelling('p7');
      eisStop(o2, draaiBron(o2, { bks: kapot(['BK-0390-2', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2']) }), 3, /P7: 4 van de 5 gevraagde BK-versies zijn onbruikbaar/);
    });
  });
});

// ── Met een nagebootste http-API ────────────────────────────────────────────

describe('haal-beroepskwalificaties.mjs met een nagebootste http-API', () => {
  interface Verzoek { url: string; methode: string; headers: IncomingHttpHeaders }
  type Gedrag = (url: URL, res: ServerResponse, nr: number) => void;
  let server: Server;
  let ander: Server;
  let basis = '';
  let anderBasis = '';
  let verzoeken: Verzoek[] = [];
  let anderVerzoeken: Verzoek[] = [];
  let gedrag: Gedrag;
  let onderdelen: Rec = ONDERDELEN;
  let bks: Rec = BKS;
  let lijst: Rec[] = LIJST;

  const json = (res: ServerResponse, status: number, body: unknown, koppen: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...koppen });
    res.end(JSON.stringify(body));
  };
  /** De adressen in de antwoorden wijzen naar de testserver (api_url, links, curriculumdossier). */
  const naarBasis = (v: unknown) => JSON.parse(JSON.stringify(v).split(ECHTE_ORIGIN).join(basis)) as unknown;
  /** De vorm van een 404 uit ronde 6 en 7. */
  const ONDERDEEL_404 = { code: 'NotFound', message: 'Not Found', type: 'tag:oracle.com,2020:error/NotFound', instance: 'tag:oracle.com,2020:ecid/nagebootst' };
  const BK_404 = { uitzonderingen: [{ identificatie: 31004, diagnose: 'Er werd geen data gevonden.', type: 'FOUT' }] };
  const isStatus = (a: unknown, kenmerk: string) => typeof a === 'object' && a !== null && 'status' in a && !(kenmerk in a);

  const standaard: Gedrag = (url, res) => {
    if (url.pathname === `${BK_PAD}/beroepskwalificatie`) {
      const pagina = lijst[Number(url.searchParams.get('page') ?? '0')];
      return pagina ? json(res, 200, naarBasis(pagina)) : json(res, 404, BK_404);
    }
    let m = new RegExp(`^${SO_PAD}/structuuronderdeel/(\\d+)$`).exec(url.pathname);
    if (m) {
      const a = onderdelen[m[1]];
      return a === undefined || isStatus(a, 'structuuronderdeel_nummer') ? json(res, 404, ONDERDEEL_404) : json(res, 200, naarBasis(a));
    }
    m = new RegExp(`^${BK_PAD}/beroepskwalificatie/(BK-[0-9-]+)$`).exec(url.pathname);
    if (m) {
      const a = bks[m[1]];
      return a === undefined || isStatus(a, 'beroepskwalificatie') ? json(res, 404, BK_404) : json(res, 200, naarBasis(a));
    }
    json(res, 404, { fout: 'onbekend pad' });
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      verzoeken.push({ url: req.url ?? '', methode: req.method ?? '', headers: req.headers });
      gedrag(new URL(req.url ?? '/', basis), res, verzoeken.length);
    });
    ander = createServer((req, res) => {
      anderVerzoeken.push({ url: req.url ?? '', methode: req.method ?? '', headers: req.headers });
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

  const begin = () => {
    onderdelen = ONDERDELEN;
    bks = BKS;
    lijst = LIJST;
    gedrag = standaard;
  };

  async function haal(naam: string, args: string[] = [], env: Record<string, string | undefined> = {}, o: Opstelling = opstelling(naam)) {
    verzoeken = [];
    anderVerzoeken = [];
    const run = await draaiAsync(['--structuur', STRUCTUUR, '--uit', o.uit, '--rapport', o.rapport, '--vandaag', VANDAAG, ...args], {
      ONDERWIJSDOELEN_API_KEY: SLEUTEL,
      ONDERWIJSDOELEN_API_BASE: `${basis}/onderwijsdoelen`,
      STRUCTUURONDERDELEN_API_BASE: `${basis}${SO_PAD}`,
      BEROEPSKWALIFICATIES_API_BASE: `${basis}${BK_PAD}`,
      ...env,
    });
    return { o, run };
  }

  const ONDERDELEN_GEVRAAGD = [8, 9, 10, 12, 129, 247, 379, 417, 565, 679, 680, 908, 915, 931];
  const VERWACHT = [
    `${BK_PAD}/beroepskwalificatie`,
    `${BK_PAD}/beroepskwalificatie?page=1`,
    ...ONDERDELEN_GEVRAAGD.map((n) => `${SO_PAD}/structuuronderdeel/${n}`),
    `${SO_PAD}/structuuronderdeel/931`, // tweede ronde, na alle andere
    ...['BK-0390-2', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2', 'BK-9999-3'].map((bk) => `${BK_PAD}/beroepskwalificatie/${bk}`),
    `${BK_PAD}/beroepskwalificatie/BK-9999-3`, // tweede ronde
  ];

  it('haalt alles op met de sleutel, volgt nooit een api_url of curriculumdossier, en lekt de sleutel nergens', async () => {
    begin();
    const { o, run } = await haal('api-ok');
    expect(run.status, run.stderr).toBe(0);
    controleerUitvoer(o.uit);
    expect(verzoeken.map((v) => v.url)).toEqual(VERWACHT);
    for (const v of verzoeken) {
      expect(v.methode).toBe('GET');
      expect(v.headers['x-api-key']).toBe(SLEUTEL);
      expect(v.headers.accept).toBe('application/json');
    }
    expect(verzoeken.some((v) => /curriculumdossier|\/beroepskwalificatie\/v1\/|structuuronderdeel\/11$|BK-0390-1/.test(v.url))).toBe(false);
    expect(anderVerzoeken).toHaveLength(0);
    const r = rapportVan(o);
    expect(r).toMatchObject({
      bron: 'api', verzoeken: VERWACHT.length, lijst: { verzoeken: 2, volledig: true }, onderdelen: { verzoeken: 15, tweedeRonde: { onderdelen: 1, verzoeken: 1 }, nietGevonden: 1 },
      bks: { verzoeken: 6, tweedeRonde: { versies: 1, verzoeken: 1 }, nietGevonden: ['BK-9999-3'] },
    });
    expect(r.voorbeeld404).toContain('NotFound');
    expect(run.stdout).toMatch(/Onderdeel 931: 404; nog één poging in de tweede ronde\./);
    expect(alleUitvoer(run, o.rapport, o.uit)).not.toContain(SLEUTEL);
    // Dezelfde inhoud als met --bron-*: op een kopie van uit/ verandert er niets.
    const o2 = opstelling('api-zelfde-inhoud');
    cpSync(join(FIXTURES, 'uit'), o2.uit, { recursive: true });
    const voor = momentopname(o2.uit);
    const { run: run2 } = await haal('api-zelfde-inhoud', [], {}, o2);
    expect(run2.status, run2.stderr).toBe(0);
    expect(momentopname(o2.uit)).toEqual(voor);
    expect(alleUitvoer(run2, o2.rapport)).not.toContain(SLEUTEL);
  });

  it('één keer 404 en daarna 200 → opgehaald, in de tweede ronde na alle andere', async () => {
    begin();
    const eerste = new Set<string>();
    gedrag = (url, res, nr) => {
      const p = url.pathname;
      if ((p.endsWith('/structuuronderdeel/12') || p.endsWith('/beroepskwalificatie/BK-9999-2')) && !eerste.has(p)) {
        eerste.add(p);
        return json(res, 404, p.includes('BK-') ? BK_404 : ONDERDEEL_404);
      }
      standaard(url, res, nr);
    };
    const { o, run } = await haal('api-404-dan-200');
    expect(run.status, run.stderr).toBe(0);
    const urls = verzoeken.map((v) => v.url);
    expect(urls.slice(2, 18)).toEqual([...ONDERDELEN_GEVRAAGD.map((n) => `${SO_PAD}/structuuronderdeel/${n}`), `${SO_PAD}/structuuronderdeel/12`, `${SO_PAD}/structuuronderdeel/931`]);
    expect(urls.slice(18)).toEqual([
      ...['BK-0390-2', 'BK-0464-1', 'BK-9999-1', 'BK-9999-2', 'BK-9999-3'].map((bk) => `${BK_PAD}/beroepskwalificatie/${bk}`),
      `${BK_PAD}/beroepskwalificatie/BK-9999-2`,
      `${BK_PAD}/beroepskwalificatie/BK-9999-3`,
    ]);
    expect(recordVan(o, 12).status).toBe('opgehaald');
    expect(regelVan(o, 'BK-9999-2').bestand).toBe('bk/BK-9999-2.json');
    expect(rapportVan(o)).toMatchObject({ onderdelen: { tweedeRonde: { onderdelen: 2, verzoeken: 2 } }, bks: { tweedeRonde: { versies: 2, verzoeken: 2 } } });
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/Onderdeel 12: eerst 404, bij de nieuwe poging wel een detail/);
    // Zelfde inhoud als zonder de 404's (op het tijdstip "opgehaald" na).
    const zonderTijd = (t: string) => t.replace(/"opgehaald": "[^"]+"/g, '"opgehaald": "…"');
    expect(zonderTijd(readFileSync(join(o.uit, 'bk', 'BK-9999-2.json'), 'utf8'))).toBe(zonderTijd(readFileSync(join(FIXTURES, 'uit', 'bk', 'BK-9999-2.json'), 'utf8')));
  });

  it('een volgende link naar een andere origin → 1, zonder verzoek naar die origin', async () => {
    begin();
    lijst = kopie(LIJST);
    lijst[0].links.next = { href: `${anderBasis}${BK_PAD}/beroepskwalificatie?page=1` };
    const { o, run } = await haal('api-andere-origin');
    eisStop(o, run, 1, /BK-lijst, pagina 1: de volgende pagina staat op een andere origin/);
    expect(verzoeken).toHaveLength(1);
    expect(anderVerzoeken).toHaveLength(0);
  });

  it('een volgende link naar een ander pad (een api_url) → 1, zonder dat verzoek', async () => {
    begin();
    lijst = kopie(LIJST);
    lijst[0].links.next = { href: `${ECHTE_ORIGIN}/beroepskwalificatie/v1/BK-0390-2` };
    const { o, run } = await haal('api-ander-pad');
    eisStop(o, run, 1, /BK-lijst, pagina 1: de volgende pagina staat op een ander pad/);
    expect(verzoeken.map((v) => v.url)).toEqual([`${BK_PAD}/beroepskwalificatie`]);
  });

  it('een lus in de paginering → 1', async () => {
    begin();
    lijst = kopie(LIJST);
    lijst[1].links.next = { href: `${ECHTE_ORIGIN}${BK_PAD}/beroepskwalificatie?page=1` };
    // Pagina 2 zegt niet dat ze de laatste is, en het totaal is nog niet bereikt.
    lijst[1].meta = { ...lijst[1].meta, total_elements: 30, last: false };
    lijst[0].meta.total_elements = 30;
    const { o, run } = await haal('api-lus');
    eisStop(o, run, 1, /BK-lijst, pagina 3: die pagina is al opgehaald \(een lus in de paginering\)/);
    expect(verzoeken).toHaveLength(2);
  });

  const LIJST_PAD = `${BK_PAD}/beroepskwalificatie`;
  const isLijst = (url: URL) => url.pathname === LIJST_PAD;
  const lijstVerzoeken = () => verzoeken.filter((v) => v.url === LIJST_PAD || v.url.startsWith(`${LIJST_PAD}?`));

  it('de BK-lijst is een zachte bron (F3-B6): een HTTP-fout na de nieuwe pogingen, een 404, geen JSON of een netwerkfout maakt ze onvolledig → 0, en niets verandert', async () => {
    const gevallen: [string, Gedrag, RegExp, number][] = [
      ['lijst-503', (url, res, nr) => (isLijst(url) ? json(res, 503, {}) : standaard(url, res, nr)), /pagina 1: BK-lijst, pagina 1 lukte niet na 4 nieuwe pogingen \(HTTP 503\)/, 5],
      [
        'lijst-404-op-pagina-2',
        (url, res, nr) => (isLijst(url) && url.searchParams.get('page') === '1' ? json(res, 404, BK_404) : standaard(url, res, nr)),
        /pagina 2: BK-lijst, pagina 2: de API antwoordde met HTTP 404\./,
        2,
      ],
      [
        'lijst-geen-json',
        (url, res, nr) => {
          if (!isLijst(url)) return standaard(url, res, nr);
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<html>onderhoud</html>');
        },
        /pagina 1: BK-lijst, pagina 1: het antwoord is geen geldige JSON\./,
        1,
      ],
      [
        'lijst-netwerkfout',
        (url, res, nr) => {
          if (isLijst(url)) res.destroy();
          else standaard(url, res, nr);
        },
        /pagina 1: BK-lijst, pagina 1 lukte niet na 4 nieuwe pogingen \(netwerkfout/,
        5,
      ],
    ];
    for (const [naam, g, melding, aantal] of gevallen) {
      begin();
      gedrag = g;
      const o = opstelling(naam);
      cpSync(join(FIXTURES, 'uit'), o.uit, { recursive: true });
      const voor = momentopname(o.uit);
      const { run } = await haal(naam, [], {}, o);
      expect(run.status, `${naam}: ${run.stderr}`).toBe(0);
      // laatstErkend en lijstTotaal blijven; de rest is dezelfde inhoud: er verandert niets.
      expect(momentopname(o.uit), naam).toEqual(voor);
      expect(lijstVerzoeken(), naam).toHaveLength(aantal);
      const r = rapportVan(o);
      expect(r.lijst, naam).toMatchObject({ volledig: false, verzoeken: aantal });
      expect(r.fout, naam).toBeNull();
      expect(r.waarschuwingen.join('\n'), naam).toMatch(/De BK-lijst is onvolledig/);
      expect(r.waarschuwingen.join('\n'), naam).toMatch(melding);
      expect(run.stdout, naam).toMatch(/BK-lijst: onvolledig, niet gebruikt/);
      expect(alleUitvoer(run, o.rapport), naam).not.toContain(SLEUTEL);
    }
    // 403 op de lijst blijft hard (de sleutel); 401, een doorverwijzing, een andere origin en een lus: zie de andere tests.
    begin();
    gedrag = (url, res, nr) => (isLijst(url) ? json(res, 403, { message: 'Forbidden' }) : standaard(url, res, nr));
    const { o, run } = await haal('lijst-403');
    eisStop(o, run, 1, /BK-lijst, pagina 1: de API weigert de sleutel \(HTTP 403\)/);
    expect(verzoeken).toHaveLength(1);
  });

  it('een lijst die nooit eindigt: na 100 pagina\'s stopt het bladeren en is de lijst onvolledig → 0', async () => {
    begin();
    gedrag = (url, res, nr) => {
      if (!isLijst(url)) return standaard(url, res, nr);
      const p = Number(url.searchParams.get('page') ?? '0');
      const nummer = `BK-${5000 + p}`;
      json(res, 200, {
        gegevens: [{ beroepskwalificatie_nr: nummer, laatst_erkende_versie: { versie_nr_kort: 1, versie_nr_lang: `${nummer}-1`, titel: 'Nagebootste beroepskwalificatie' } }],
        meta: { total_elements: 100000 },
        links: { next: { href: `${basis}${LIJST_PAD}?page=${p + 1}` } },
      });
    };
    const { o, run } = await haal('api-eindeloze-lijst', ['--onderdelen', '565']);
    expect(run.status, run.stderr).toBe(0);
    expect(lijstVerzoeken()).toHaveLength(100);
    expect(lijstVerzoeken().slice(-1)[0]?.url).toBe(`${LIJST_PAD}?page=99`);
    expect(rapportVan(o).lijst).toMatchObject({ verzoeken: 100, paginas: 100, ontvangen: 100, volledig: false });
    expect(rapportVan(o).waarschuwingen.join('\n')).toMatch(/na 100 pagina's nog geen einde/);
    expect(indexVan(o).lijstTotaal).toBeUndefined();
    expect(regelVan(o, 'BK-0464-1').laatstErkend).toBeUndefined();
  });

  it('een doorverwijzing → 1, zonder tweede verzoek (ook niet op dezelfde origin)', async () => {
    begin();
    gedrag = (_url, res) => json(res, 302, {}, { location: `${anderBasis}/elders` });
    const { o, run } = await haal('api-doorverwijzing');
    eisStop(o, run, 1, /BK-lijst, pagina 1: de API stuurt door \(HTTP 302/);
    expect(verzoeken).toHaveLength(1);
    expect(anderVerzoeken).toHaveLength(0);
    // Op het detail van een onderdeel, naar dezelfde origin.
    begin();
    gedrag = (url, res, nr) => (url.pathname.endsWith('/structuuronderdeel/9') ? json(res, 301, {}, { location: `${basis}${SO_PAD}/structuuronderdeel/10` }) : standaard(url, res, nr));
    const { o: o2, run: run2 } = await haal('api-doorverwijzing-detail');
    eisStop(o2, run2, 1, /Onderdeel 9: de API stuurt door \(HTTP 301/);
    expect(verzoeken.map((v) => v.url).slice(-2)).toEqual([`${SO_PAD}/structuuronderdeel/8`, `${SO_PAD}/structuuronderdeel/9`]);
  });

  it('401 → 1, zonder nieuwe poging; een andere status op een detail → 1; geen JSON → 1', async () => {
    begin();
    gedrag = (_url, res) => json(res, 401, { message: 'Unauthorized' });
    const { o, run } = await haal('api-401');
    eisStop(o, run, 1, /de API weigert de sleutel \(HTTP 401\)/);
    expect(verzoeken).toHaveLength(1);
    begin();
    gedrag = (url, res, nr) => (url.pathname.endsWith('/beroepskwalificatie/BK-0464-1') ? json(res, 400, { message: 'Bad Request' }) : standaard(url, res, nr));
    const { o: o2, run: run2 } = await haal('api-400');
    eisStop(o2, run2, 1, /BK-0464-1: de API antwoordde met HTTP 400/);
    begin();
    gedrag = (url, res, nr) => {
      if (!url.pathname.endsWith('/structuuronderdeel/10')) return standaard(url, res, nr);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>onderhoud</html>');
    };
    const { o: o3, run: run3 } = await haal('api-geen-json');
    eisStop(o3, run3, 1, /Onderdeel 10: het antwoord is geen geldige JSON/);
  });

  it('429 en 5xx: nieuwe pogingen (zonder wachten in de test), daarna gewoon verder', async () => {
    begin();
    let fouten = 0;
    gedrag = (url, res, nr) => {
      if (url.pathname.endsWith('/structuuronderdeel/8') && fouten < 2) {
        fouten++;
        return json(res, fouten === 1 ? 429 : 503, {});
      }
      standaard(url, res, nr);
    };
    const { o, run } = await haal('api-herhaal');
    expect(run.status, run.stderr).toBe(0);
    expect(verzoeken.filter((v) => v.url.endsWith('/structuuronderdeel/8'))).toHaveLength(3);
    expect(run.stdout).toMatch(/Onderdeel 8: opnieuw proberen \(1\/4\) na HTTP 429/);
    controleerUitvoer(o.uit);
  });

  it('de sleutel in een antwoord → 1, niets geschreven, en de sleutel nergens', async () => {
    begin();
    bks = metBk('BK-0464-1', (d) => {
      d.beroepskwalificatie.competenties[0].kennis[0].waarde = `Kennis van ${SLEUTEL}`;
    });
    const { o, run } = await haal('api-sleutel-in-antwoord');
    eisStop(o, run, 1, /bevatten de API-sleutel/);
    expect(alleUitvoer(run, o.rapport)).not.toContain(SLEUTEL);
  });

  it('--zonder-lijst vraagt de lijst niet; --onderdelen vraagt alleen die onderdelen', async () => {
    begin();
    const { o, run } = await haal('api-proef', ['--zonder-lijst', '--onderdelen', '565']);
    expect(run.status, run.stderr).toBe(0);
    expect(verzoeken.map((v) => v.url)).toEqual([`${SO_PAD}/structuuronderdeel/565`, `${BK_PAD}/beroepskwalificatie/BK-0464-1`]);
    expect(rapportVan(o)).toMatchObject({ bron: 'api', proef: [565], lijst: { verzoeken: 0, overgeslagen: true } });
    expect(indexVan(o).lijstTotaal).toBeUndefined();
    expect(regelVan(o, 'BK-0464-1').laatstErkend).toBeUndefined();
    controleerUitvoer(o.uit);
  });
});
