import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  ADV_NUMMER,
  BK_INDEX_KIND,
  BK_VERSIE,
  COMPETENTIE_CODE,
  DBK_NUMMER,
  KOPPELING_KIND,
  bkBestandVan,
  doelcodesVanBestand,
  erkenningenOp,
  splitsBk,
  valideerBkBestand,
  valideerBkIndex,
  valideerKoppelingBestand,
  vergelijkBekrachtiging,
  vergelijkBkVersie,
  vergelijkErkenning,
  type Erkenning,
} from './beroepskwalificaties';
import { normaliseerDoeltekst, normalizeGoalCode } from './curriculum';
import { canoniek, htmlNaarTekst } from './minimumdoelen';
import { isAfgebouwd, soortVanGroep, valideerMatrixBestand, type StudierichtingGroep, type Structuuronderdeel } from './studierichtingen';

// De controle gooit nooit (zie `controleerKwalificatieMap`). Om dat vangnet te kunnen testen, loopt de validator van
// de koppeling door een spion die standaard het echte gedrag geeft; één test laat hem eenmalig een uitzondering gooien.
vi.mock('./beroepskwalificaties', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./beroepskwalificaties')>();
  return { ...echt, valideerKoppelingBestand: vi.fn(echt.valideerKoppelingBestand) };
});

// ── Datatest: de beroepskwalificaties per richting ──────────────────────────
//
// Docs/STUDIERICHTINGEN.md § 23.5.11. Dit bestand controleert de bestanden die het ophaalscript schrijft
// (public/leerplannen/kwalificaties/): de koppeling, de index van de BK-versies en één bestand per BK-versie.
// Het is bewust onafhankelijk van het script geschreven, alleen uit de invarianten:
//
//   KP1 tot KP8  de koppeling      BX1 tot BX4  de index      BB1 tot BB5  de BK-bestanden      (BC1 komt in G1)
//
// Elke melding begint met de code van de invariant ("KP5: BK-0464-1 hoort bij …"). De kern is
// `controleerKwalificatieMap(uit, structuur, opties)`. Ze draait op:
//   1. de echte map (alleen als ze bestaat; BK-bestanden zonder index zijn een harde fout),
//   2. de fixtures in tests/fixtures/kwalificaties/uit (altijd, als positief geval, met een vaste datum),
//   3. kapotte kopieën van die fixtures in een tijdelijke map (de zelftest): een controle die niets vindt,
//      beschermt niets.
//
// Mild en streng. Wat de eerste echte run (G1, regel 11) nog moet bevestigen, staat achter een schakelaar
// hieronder. Zolang die op false staat, telt de controle alleen mee in `info` (met een telling en een paar
// voorbeelden); met true wordt elk geval een fout. G1 zet ze op true waar de telling op de echte data 0 is.
//
// De datum. "Een erkenning van nu" rekent met de datum van vandaag (UTC) bij de echte map, en met een vaste
// datum bij de fixtures. Dat kan de test niet laten kantelen met de tijd: KP5 vraagt BK's van erkenningen
// van nu of later, en wat verstrijkt (een erkenning die afloopt) valt uit de eis, niets komt erbij. De
// bestanden wissen ook niets (F3-B4). KP6 is de uitzondering en staat daarom mild tot G1.
//
// De info wordt teruggegeven, in de testnaam samengevat en bij de echte map ook uitgeschreven (`infoUitvoer`,
// met `process.stdout.write`, hoogstens 20 regels): eslint verbiedt console in src, en zonder uitvoer leest
// niemand de melding zelf.

// De vier schakelaars hieronder stonden op false tot de eerste volledige run (G1 stap 3, run 38089367245, 10 oktober
// 2026). Die telde op de echte data telkens 0 gevallen (BB4 0 van 274, BB5 0 van 274, KP6 0 van 92, KP7 0 van 833), dus
// staan ze sinds G1 stap 4 op true: elk geval is een fout.

/** BB4, `nr` van elke competentie: een geheel getal en uniek in de versie. */
const NR_STRENG = true;

/** BB5, geen HTML-tags in de teksten van de competenties. */
const TEKST_STRENG = true;

/**
 * KP6, elk geldig gewoon onderdeel van de 3de graad A (geen aanloop, status "opgehaald") heeft een
 * beroepskwalificatie in een erkenning van nu.
 */
const BK_A3_STRENG = true;

/**
 * KP7, de ADV-nummers van een record tegenover de matrix. Streng alleen bij dezelfde matrix als die van de koppeling
 * (`matrixSha256`), net als KP3: is de matrix nieuwer, dan is een verschil info (R7, de noodinvoer).
 */
const ERKENNING_KRUIS_STRENG = true;

// Elke controle leest tientallen bestanden; op een trage machine of onder last heeft 5 seconden niet altijd genoeg.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STRUCTUUR_MAP = join(ROOT, 'public', 'leerplannen', 'structuur');
const KWALIFICATIES_MAP = join(ROOT, 'public', 'leerplannen', 'kwalificaties');
const FIXTURE_UIT = join(ROOT, 'tests', 'fixtures', 'kwalificaties', 'uit');
const FIXTURE_STRUCTUUR = join(ROOT, 'tests', 'fixtures', 'structuur', 'uit');
/** De datum waarmee de fixtures gemaakt zijn (`--vandaag` in tests/fixtures/kwalificaties/LEESMIJ.md). */
const FIXTURE_VANDAAG = '2026-10-10';
/** Vandaag, voor de vaste verwachtingen op de echte map (BC1). */
const VANDAAG_ECHT = new Date().toISOString().slice(0, 10);

// ── Hulpfuncties ────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function lijstVan(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function isGeheel(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function toon(v: unknown): string {
  const t = JSON.stringify(v);
  return t === undefined ? String(v) : t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/** De sha256 van `canoniek(waarde)`, zoals de datatests van de minimumdoelen en de studierichtingen het doen. */
function sha256Van(waarde: unknown): string {
  return createHash('sha256').update(canoniek(waarde), 'utf8').digest('hex');
}

function leesJson(pad: string): { json: unknown } | { fout: string } {
  if (!existsSync(pad)) return { fout: 'het bestand bestaat niet' };
  try {
    return { json: JSON.parse(readFileSync(pad, 'utf8')) as unknown };
  } catch (e) {
    return { fout: e instanceof Error ? e.message : String(e) };
  }
}

/** Een echte kalenderdatum JJJJ-MM-DD (30 februari bestaat niet). */
function isEchteDatum(t: unknown): boolean {
  if (typeof t !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m === null) return false;
  const [jaar, maand, dag] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(0);
  d.setUTCFullYear(jaar, maand - 1, dag);
  return d.getUTCFullYear() === jaar && d.getUTCMonth() === maand - 1 && d.getUTCDate() === dag;
}

/** Een tijdstip in UTC zoals het script het schrijft: JJJJ-MM-DDTUU:MM:SS(.mmm)Z. */
function isTijdstip(t: unknown): boolean {
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(t) && isEchteDatum(t.slice(0, 10));
}

/** "1 onderdeel", "2 onderdelen". */
function meervoud(n: number, een: string, meer: string): string {
  return `${n} ${n === 1 ? een : meer}`;
}

/** De datum van vandaag (UTC) als JJJJ-MM-DD. */
function vandaagUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Een HTML-tag (`<b>`, `</p>`, `<br/>`): een `<` met direct een letter. Entiteiten tellen niet mee. */
const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/;

const CODE_VOLGORDE = [
  'KP1', 'KP2', 'KP3', 'KP4', 'KP5', 'KP6', 'KP7', 'KP8', 'BX1', 'BX2', 'BX3', 'BX4', 'BB1', 'BB2', 'BB3', 'BB4', 'BB5', 'BC1',
];
/** Zoveel meldingen per code blijven staan; een kapot bestand geeft anders duizend regels. */
const MAX_PER_CODE = 12;

/** Verzamelt meldingen per code, in de volgorde van de invarianten, en beperkt elke code. */
class Meldingen {
  private readonly perCode = new Map<string, string[]>();

  voeg(code: string, tekst: string): void {
    let lijst = this.perCode.get(code);
    if (lijst === undefined) this.perCode.set(code, (lijst = []));
    lijst.push(`${code}: ${tekst}`);
  }

  lijst(): string[] {
    const rang = (c: string) => {
      const i = CODE_VOLGORDE.indexOf(c);
      return i < 0 ? CODE_VOLGORDE.length : i;
    };
    const uit: string[] = [];
    for (const code of [...this.perCode.keys()].sort((a, b) => rang(a) - rang(b))) {
      const regels = this.perCode.get(code) ?? [];
      uit.push(...regels.slice(0, MAX_PER_CODE));
      if (regels.length > MAX_PER_CODE) uit.push(`${code}: … en nog ${regels.length - MAX_PER_CODE} van dezelfde soort`);
    }
    return uit;
  }
}

/** Een telling met een paar voorbeelden, voor de samenvattende meldingen in `info`. */
class Telling {
  n = 0;
  private readonly voorbeelden: string[] = [];

  tel(voorbeeld: string): void {
    this.n++;
    if (this.voorbeelden.length < 3) this.voorbeelden.push(voorbeeld);
  }

  tekst(): string {
    return this.voorbeelden.length === 0 ? '' : ` (bv. ${this.voorbeelden.join('; ')})`;
  }
}

/** Controleert een lijst op volgorde: oplopend en zonder dubbels. */
function controleerVolgorde<T>(lijst: readonly T[], vergelijk: (a: T, b: T) => number, melding: (soort: 'dubbel' | 'volgorde', a: T, b: T) => void): void {
  for (let n = 1; n < lijst.length; n++) {
    const c = vergelijk(lijst[n - 1], lijst[n]);
    if (c === 0) melding('dubbel', lijst[n - 1], lijst[n]);
    else if (c > 0) melding('volgorde', lijst[n - 1], lijst[n]);
  }
}

/** De BK-versies van een erkenning, uit een bestand dat misschien kapot is. */
function bksVan(e: unknown): string[] {
  if (!isObj(e)) return [];
  return lijstVan(e.bks).flatMap((k) => (isObj(k) && typeof k.bk === 'string' ? [k.bk] : []));
}

// ── De controle ─────────────────────────────────────────────────────────────

interface Opties {
  /** JJJJ-MM-DD; standaard vandaag. De fixtures gebruiken `FIXTURE_VANDAAG`. */
  vandaag?: string;
  /** Standaard false; de echte map gebruikt `BK_A3_STRENG`. */
  a3Streng?: boolean;
  /** Standaard false; de echte map gebruikt `ERKENNING_KRUIS_STRENG`. Geldt alleen bij een gelijke `matrixSha256`. */
  kruisStreng?: boolean;
  /** Standaard false; de echte map gebruikt `NR_STRENG`. */
  nrStreng?: boolean;
  /** Standaard false; de echte map gebruikt `TEKST_STRENG`. */
  tekstStreng?: boolean;
}

interface Uitkomst {
  /** Wat niet klopt (leeg = in orde). Elke regel begint met de code van de invariant. */
  fouten: string[];
  /** Wat opvalt maar niet fout is: de tellingen van KP6, KP7, BB4 en BB5 en een overzicht. */
  info: string[];
}

interface MatrixOnderdeel {
  groep: string;
  aanloop: boolean;
  /** Voor KP7: de ADV-nummers van de erkenningen in de matrix, met hun einddatum (JJJJ-MM-DD) als de matrix er een noemt. */
  advs: { nummer: string; einddatum?: string }[];
}

interface MatrixInfo {
  sha256: unknown;
  onderdelen: Map<number, MatrixOnderdeel>;
  /** Alleen als `valideerMatrixBestand` [] gaf: dan klopt de indeling in soorten (KP6). */
  getypeerd?: { groepen: StudierichtingGroep[]; onderdelen: Structuuronderdeel[] };
}

/** Leest de matrix van de studierichtingen. Geeft `undefined` als ze niet gelezen kan worden. */
function leesMatrix(structuur: string, f: Meldingen, i: Meldingen): MatrixInfo | undefined {
  const gelezen = leesJson(join(structuur, 'studierichtingen.json'));
  if ('fout' in gelezen) {
    f.voeg('KP2', `studierichtingen.json kan niet gelezen worden (${gelezen.fout}): de koppeling kan er niet tegen gecontroleerd worden.`);
    return undefined;
  }
  const m = gelezen.json;
  if (!isObj(m) || !Array.isArray(m.groepen) || !Array.isArray(m.onderdelen)) {
    f.voeg('KP2', 'studierichtingen.json heeft niet de vorm van de matrix (groepen en onderdelen): de koppeling kan er niet tegen gecontroleerd worden.');
    return undefined;
  }
  const onderdelen = new Map<number, MatrixOnderdeel>();
  for (const o of m.onderdelen) {
    if (!isObj(o) || !isGeheel(o.nummer) || typeof o.groep !== 'string') continue;
    const advs = lijstVan(o.erkenningen).flatMap((e) =>
      isObj(e) && typeof e.nummer === 'string' ? [{ nummer: e.nummer, ...(isEchteDatum(e.einddatum) ? { einddatum: e.einddatum as string } : {}) }] : []);
    onderdelen.set(o.nummer, { groep: o.groep, aanloop: o.aanloop === true, advs });
  }
  const info: MatrixInfo = { sha256: m.sha256, onderdelen };
  // De matrix controleert de datatest van de studierichtingen. Is hun vorm niet in orde, dan is de indeling in
  // soorten hier niet betrouwbaar: KP6 valt dan weg, met een melding.
  const vorm = valideerMatrixBestand(m);
  if (vorm.length === 0) info.getypeerd = { groepen: m.groepen as StudierichtingGroep[], onderdelen: m.onderdelen as Structuuronderdeel[] };
  else i.voeg('KP2', `studierichtingen.json is zelf niet in orde (${vorm.length} meldingen, bv. ${vorm[0]}): KP6 is overgeslagen.`);
  return info;
}

const STATUSSEN = ['opgehaald', 'niet-gevonden', 'nog-niet-opgehaald'];

/** KP4 voor één record: status, tijdstip en datums, ADV-nummers, BK- en DBK-nummers en de volgorde van de lijsten. */
function controleerRecord(r: Json, f: Meldingen): void {
  const plaats = `onderdeel ${toon(r.onderdeel)}`;
  if (typeof r.status !== 'string' || !STATUSSEN.includes(r.status)) f.voeg('KP4', `${plaats}: de status ${toon(r.status)} is onbekend.`);
  if (r.status === 'opgehaald' && !Array.isArray(r.erkenningen)) f.voeg('KP4', `${plaats}: "opgehaald" heeft een lijst "erkenningen" nodig.`);
  if (r.opgehaald !== undefined && !isTijdstip(r.opgehaald)) f.voeg('KP4', `${plaats}: "opgehaald" ${toon(r.opgehaald)} is geen tijdstip.`);
  if (r.nietMeerInBron !== undefined && !isEchteDatum(r.nietMeerInBron)) f.voeg('KP4', `${plaats}: "nietMeerInBron" ${toon(r.nietMeerInBron)} is geen geldige datum (JJJJ-MM-DD).`);
  if (!Array.isArray(r.erkenningen)) return;

  const goede: Erkenning[] = [];
  for (const e of r.erkenningen) {
    if (!isObj(e)) {
      f.voeg('KP4', `${plaats}: een erkenning is geen object.`);
      continue;
    }
    const waar = `${plaats}, ${typeof e.adv === 'string' ? e.adv : 'een erkenning zonder ADV-nummer'}`;
    if (typeof e.adv !== 'string' || !ADV_NUMMER.test(e.adv)) f.voeg('KP4', `${waar}: het ADV-nummer ${toon(e.adv)} past niet op ADV-0000.`);
    for (const veld of ['begindatum', 'einddatum']) {
      if (e[veld] !== undefined && !isEchteDatum(e[veld])) f.voeg('KP4', `${waar}: "${veld}" ${toon(e[veld])} is geen geldige datum (JJJJ-MM-DD).`);
    }
    if (!Array.isArray(e.bks)) {
      f.voeg('KP4', `${waar}: "bks" ontbreekt of is geen lijst.`);
    } else {
      const versies: string[] = [];
      for (const k of e.bks) {
        const bk = isObj(k) ? k.bk : undefined;
        if (typeof bk !== 'string' || !BK_VERSIE.test(bk)) f.voeg('KP4', `${waar}: de beroepskwalificatie ${toon(bk)} past niet op BK-0000-0.`);
        else versies.push(bk);
      }
      if (versies.length === e.bks.length) {
        controleerVolgorde(versies, vergelijkBkVersie, (soort, a, b) =>
          f.voeg('KP4', `${waar}: ${soort === 'dubbel' ? `de beroepskwalificatie ${b} staat er meer dan één keer in` : `de beroepskwalificaties ${a} en ${b} staan niet gesorteerd`}.`));
      }
    }
    if (!Array.isArray(e.bekrachtigingen)) {
      f.voeg('KP4', `${waar}: "bekrachtigingen" ontbreekt of is geen lijst.`);
    } else {
      const goed: Json[] = [];
      for (const b of e.bekrachtigingen) {
        if (!isObj(b)) {
          f.voeg('KP4', `${waar}: een studiebekrachtiging is geen object.`);
          continue;
        }
        let netjes = typeof b.naam === 'string';
        if (b.bk !== undefined && (typeof b.bk !== 'string' || !BK_VERSIE.test(b.bk))) {
          f.voeg('KP4', `${waar}: de beroepskwalificatie ${toon(b.bk)} van een studiebekrachtiging past niet op BK-0000-0.`);
          netjes = false;
        }
        if (b.dbk !== undefined && (typeof b.dbk !== 'string' || !DBK_NUMMER.test(b.dbk))) {
          f.voeg('KP4', `${waar}: de deelkwalificatie ${toon(b.dbk)} past niet op BK-0000-0-DBK-00.`);
          netjes = false;
        }
        if (netjes) goed.push(b);
      }
      if (goed.length === e.bekrachtigingen.length) {
        controleerVolgorde(goed, (a, b) => vergelijkBekrachtiging(a as never, b as never), (soort, a, b) =>
          f.voeg('KP4', `${waar}: ${soort === 'dubbel' ? `de studiebekrachtiging ${toon(b.naam)} staat er meer dan één keer in` : `de studiebekrachtigingen ${toon(a.naam)} en ${toon(b.naam)} staan niet gesorteerd`}.`));
      }
    }
    if (typeof e.adv === 'string' && (e.begindatum === undefined || typeof e.begindatum === 'string')) goede.push(e as unknown as Erkenning);
  }
  if (goede.length === r.erkenningen.length) {
    controleerVolgorde(goede, vergelijkErkenning, (soort, a, b) =>
      f.voeg('KP4', `${plaats}: ${soort === 'dubbel' ? `de erkenning ${b.adv} staat er meer dan één keer in` : `de erkenningen ${a.adv} en ${b.adv} staan niet gesorteerd (eerst op begindatum, dan op ADV-nummer)`}.`));
    const advs = goede.map((e) => e.adv);
    const dubbel = advs.filter((a, n) => advs.indexOf(a) !== n);
    if (dubbel.length > 0) f.voeg('KP4', `${plaats}: de erkenning ${[...new Set(dubbel)].join(', ')} staat er meer dan één keer in.`);
  }
}

/** De dag (JJJJ-MM-DD) van het "opgehaald" van een record, als dat een geldig tijdstip is. */
function ophaaldagVan(r: Json): string | undefined {
  return isTijdstip(r.opgehaald) ? (r.opgehaald as string).slice(0, 10) : undefined;
}

/**
 * KP8 (K8, streng): de koppeling is slank. Geen `extra` bij een BK-verwijzing of een studiebekrachtiging (de app gebruikt
 * het niet; de veldinventaris van het rapport telt de velden), en geen erkenning met een einddatum vóór de ophaaldatum
 * van haar record (`opgehaald` als dag): die was al afgelopen toen het onderdeel opgehaald werd. De validator van de app
 * aanvaardt de oude vorm nog; de datatest eist de vorm die het script schrijft.
 */
function controleerSlank(records: Json[], f: Meldingen): void {
  for (const r of records) {
    if (!Array.isArray(r.erkenningen)) continue;
    const plaats = `onderdeel ${toon(r.onderdeel)}`;
    const dag = ophaaldagVan(r);
    for (const e of r.erkenningen) {
      if (!isObj(e)) continue;
      const waar = `${plaats}, ${typeof e.adv === 'string' ? e.adv : 'een erkenning zonder ADV-nummer'}`;
      if (dag !== undefined && isEchteDatum(e.einddatum) && (e.einddatum as string) < dag) {
        f.voeg('KP8', `${waar}: de erkenning liep af op ${e.einddatum as string}, vóór de ophaaldatum ${dag}; ze hoort niet in de koppeling.`);
      }
      for (const k of lijstVan(e.bks)) {
        if (isObj(k) && Object.prototype.hasOwnProperty.call(k, 'extra')) f.voeg('KP8', `${waar}: de beroepskwalificatie ${toon(k.bk)} heeft "extra"; dat hoort niet in de koppeling.`);
      }
      for (const b of lijstVan(e.bekrachtigingen)) {
        if (isObj(b) && Object.prototype.hasOwnProperty.call(b, 'extra')) f.voeg('KP8', `${waar}: de studiebekrachtiging ${toon(b.naam)} heeft "extra"; dat hoort niet in de koppeling.`);
      }
    }
  }
}

/** De erkenningen van een record, voor `erkenningenOp`. */
function erkenningenVan(r: Json): Erkenning[] {
  return lijstVan(r.erkenningen).filter(isObj) as unknown as Erkenning[];
}

/** KP1 tot KP4 en KP6, KP7. Geeft de records terug voor KP5. */
function controleerKoppeling(uit: string, matrix: MatrixInfo | undefined, f: Meldingen, i: Meldingen, o: Required<Opties>): Json[] | undefined {
  const gelezen = leesJson(join(uit, 'koppeling.json'));
  if ('fout' in gelezen) {
    f.voeg('KP1', `koppeling.json kan niet gelezen worden (${gelezen.fout}): er hoort één record per onderdeel van de matrix in te staan.`);
    return undefined;
  }
  const k = gelezen.json;
  if (!isObj(k)) {
    f.voeg('KP1', 'koppeling.json bevat geen object.');
    return undefined;
  }

  // KP1: de kop, het aantal, de sha256 en de vorm volgens de validator van de module.
  if (k.app !== 'boosterz' || k.kind !== KOPPELING_KIND || k.v !== 1) f.voeg('KP1', 'de kop (app, kind, v) klopt niet.');
  if (!Array.isArray(k.onderdelen)) {
    f.voeg('KP1', '"onderdelen" ontbreekt of is geen lijst.');
    return undefined;
  }
  const alle = k.onderdelen as unknown[];
  if (k.aantalOnderdelen !== alle.length) f.voeg('KP1', `aantalOnderdelen is ${toon(k.aantalOnderdelen)}, maar er staan ${alle.length} onderdelen in.`);
  if (k.sha256 !== sha256Van(alle)) f.voeg('KP1', 'de sha256 komt niet overeen met de onderdelen.');
  for (const t of valideerKoppelingBestand(k)) f.voeg('KP1', t);
  const records = alle.filter(isObj);

  // KP2: gesorteerd en uniek; elk onderdeel staat in de matrix (de matrix wist niets).
  const nummers = records.flatMap((r) => (isGeheel(r.onderdeel) ? [r.onderdeel] : []));
  controleerVolgorde(nummers, (a, b) => a - b, (soort, a, b) =>
    f.voeg('KP2', soort === 'dubbel' ? `het onderdeel ${b} staat meer dan één keer in de koppeling.` : `de onderdelen ${a} en ${b} staan niet gesorteerd.`));
  if (matrix !== undefined) {
    for (const nr of new Set(nummers)) {
      if (!matrix.onderdelen.has(nr)) f.voeg('KP2', `onderdeel ${nr} staat niet in de matrix (de matrix wist niets, dus een onderdeel hoort er nog in te staan).`);
    }
  }

  // Hoort de koppeling bij deze matrix (`matrixStandVan`)? Eén waarde voor KP3 en KP7, zodat ze nooit uiteenlopen.
  const stand = matrixStandVan(k.matrixSha256, matrix);
  const zelfdeMatrix = stand === 'zelfde';

  // KP3: dezelfde groep als in de matrix, en één record per onderdeel van de matrix. Streng bij een gelijke
  // matrixSha256; anders is de matrix sindsdien bijgewerkt (een run met alleen de studierichtingen of zonder de
  // beroepskwalificaties) en is het info.
  if (matrix !== undefined) {
    const gezien = new Set(nummers);
    const anderGroep: string[] = [];
    for (const r of records) {
      const m = isGeheel(r.onderdeel) ? matrix.onderdelen.get(r.onderdeel) : undefined;
      if (m !== undefined && r.groep !== m.groep) anderGroep.push(`onderdeel ${String(r.onderdeel)}: de groep is ${toon(r.groep)}, maar de matrix zegt ${m.groep}.`);
    }
    const zonderRecord = [...matrix.onderdelen.keys()].filter((nr) => !gezien.has(nr)).sort((a, b) => a - b);
    if (zelfdeMatrix) {
      for (const t of anderGroep) f.voeg('KP3', t);
      if (zonderRecord.length > 0) {
        f.voeg('KP3', `${meervoud(zonderRecord.length, 'onderdeel van de matrix heeft', 'onderdelen van de matrix hebben')} geen record in de koppeling (${zonderRecord.slice(0, 5).join(', ')}).`);
      }
    } else {
      i.voeg('KP3', `matrixSha256 in de koppeling is niet gelijk aan de sha256 van de matrix (een run met alleen de studierichtingen?): ${meervoud(zonderRecord.length, 'onderdeel', 'onderdelen')} zonder record, ${anderGroep.length} met een andere groep. Dat is geen fout zolang de hashes verschillen.`);
    }
  }

  // KP4: de vorm van elk record. KP8: de slanke vorm (K8).
  for (const r of records) controleerRecord(r, f);
  controleerSlank(records, f);

  // Een overzicht, ook als alles klopt.
  const perStatus = (s: string) => records.filter((r) => r.status === s).length;
  const metBk = records.filter((r) => erkenningenOp(erkenningenVan(r), o.vandaag).nu.some((e) => bksVan(e).length > 0)).length;
  i.voeg('KP1', `${meervoud(records.length, 'onderdeel', 'onderdelen')} in de koppeling: ${perStatus('opgehaald')} opgehaald, ${perStatus('niet-gevonden')} niet gevonden, ${perStatus('nog-niet-opgehaald')} nog niet opgehaald; ${metBk} met een beroepskwalificatie in een erkenning van nu (op ${o.vandaag}).`);

  controleerDerdeGraadA(records, matrix, f, i, o);
  controleerErkenningenTegenMatrix(records, matrix, stand, f, i, o);
  return records;
}

/**
 * Hoort de koppeling bij de matrix? Het script zet `matrixSha256` op de sha256 van de matrix die het las.
 * - `zelfde`: gelijk. KP3 en KP7 zijn streng.
 * - `nieuwer`: een geldige sha256, maar een andere. De matrix is sindsdien bijgewerkt in een run zonder de
 *   beroepskwalificaties (`studierichtingen` of `zonder-beroepskwalificaties`): KP3 en KP7 zijn info, geen fout (R7).
 * - `onbekend`: `matrixSha256` ontbreekt of is geen sha256. Ook dan zijn KP3 en KP7 info, zoals KP3 het altijd deed
 *   (alleen een gelijke waarde is streng). Dat is veilig: KP1 maakt van die kop zelf al een harde fout
 *   (`valideerKoppelingBestand`), dus de controle blijft rood, en KP3 en KP7 stapelen er geen gevolgfouten op die de echte
 *   oorzaak verbergen. Zonder matrix is het ook `onbekend`, maar dan vallen KP3 en KP7 helemaal weg (KP2 is dan rood).
 * Missen beide de sha256, dan is dat `zelfde` (streng), net als de vergelijking van KP3 altijd deed; KP1 is dan ook rood.
 */
type MatrixStand = 'zelfde' | 'nieuwer' | 'onbekend';

function matrixStandVan(matrixSha256: unknown, matrix: MatrixInfo | undefined): MatrixStand {
  if (matrix === undefined) return 'onbekend';
  if (matrixSha256 === matrix.sha256) return 'zelfde';
  return typeof matrixSha256 === 'string' && /^[0-9a-f]{64}$/.test(matrixSha256) ? 'nieuwer' : 'onbekend';
}

/**
 * KP6: elk geldig gewoon onderdeel van de 3de graad A, geen aanloop, met status "opgehaald", heeft een BK in
 * een erkenning van nu. Geldig is: niet `nietMeerInBron` en niet afgebouwd. Mild tot G1 (`BK_A3_STRENG`).
 */
function controleerDerdeGraadA(records: Json[], matrix: MatrixInfo | undefined, f: Meldingen, i: Meldingen, o: Required<Opties>): void {
  if (matrix?.getypeerd === undefined) return;
  const { groepen, onderdelen } = matrix.getypeerd;
  const groepVan = new Map(groepen.map((g) => [g.nummer, g] as const));
  const onderdeelVan = new Map(onderdelen.map((x) => [x.nummer, x] as const));
  const soortVan = new Map<string, string>();
  let totaal = 0;
  const zonder = new Telling();
  for (const r of records) {
    if (r.status !== 'opgehaald' || !isGeheel(r.onderdeel)) continue;
    const m = onderdeelVan.get(r.onderdeel);
    const g = m === undefined ? undefined : groepVan.get(m.groep);
    if (m === undefined || g === undefined || g.graad !== '3' || g.finaliteit !== 'A') continue;
    if (m.aanloop === true || m.nietMeerInBron !== undefined || isAfgebouwd(m, o.vandaag)) continue;
    if (!soortVan.has(g.nummer)) soortVan.set(g.nummer, soortVanGroep(g, onderdelen));
    if (soortVan.get(g.nummer) !== 'gewoon') continue;
    totaal++;
    if (erkenningenOp(erkenningenVan(r), o.vandaag).nu.some((e) => bksVan(e).length > 0)) continue;
    zonder.tel(`onderdeel ${r.onderdeel} (${g.nummer})`);
    if (o.a3Streng) f.voeg('KP6', `onderdeel ${r.onderdeel} (${g.nummer}) is een geldig gewoon onderdeel van de 3de graad A, maar heeft geen beroepskwalificatie in een erkenning van nu.`);
  }
  i.voeg('KP6', `geldige gewone onderdelen van de 3de graad A (geen aanloop, opgehaald) zonder beroepskwalificatie in een erkenning van nu: ${zonder.n} van de ${totaal}${zonder.tekst()}.`);
}

/**
 * KP7: waar de oorzaak te vinden is als een ADV-nummer van de matrix in de koppeling ontbreekt. De datatest ziet het
 * detail van de API niet, het rapport van het script wel: het detail noemt de erkenning niet, of (sinds K8) het detail
 * sloot ze al af vóór de ophaaldatum terwijl de matrix ze nog open laat. Dat laatste gebeurt vooral bij een run met
 * alleen de beroepskwalificaties: die gebruikt de matrix uit de repo, en die kan een maand oud zijn (T2).
 */
function oorzaakOntbrekend(dag: string | undefined): string {
  const wanneer = dag === undefined ? 'het ophalen' : `de ophaaldatum ${dag}`;
  return `Zie het rapport van het script: noemt het detail ze niet (onderdelen.advVerschilMetMatrix), of liep ze volgens het detail al af vóór ${wanneer} terwijl de matrix een latere of geen einddatum noemt (onderdelen.erkenningVerschilMetMatrix; K8 laat ze dan weg)? Is de matrix verouderd (een run met alleen de beroepskwalificaties), haal ze dan eerst opnieuw op: onderdelen = alles.`;
}

/**
 * KP7: de ADV-nummers van een opgehaald record tegenover de matrix, in beide richtingen. Streng sinds G1 stap 4
 * (`ERKENNING_KRUIS_STRENG`). Sinds K8 bewaart de koppeling geen erkenning die al afgelopen was bij het ophalen: een
 * erkenning die volgens de matrix vóór de ophaaldatum van het record afliep, hoeft er dus niet in te staan. Noemt de
 * matrix een latere of geen einddatum, dan blijft het een fout (zoals een ADV-nummer dat de matrix nog niet kent): de
 * matrix en het detail verschillen dan, en een run `alles` ververst de matrix. De melding zegt waar de oorzaak staat
 * (`oorzaakOntbrekend`).
 *
 * Net als KP3 is dat alleen streng bij dezelfde matrix (`matrixStandVan`: `matrixSha256` van de koppeling is de sha256 van
 * de matrix). Is de matrix nieuwer (een run met alleen de studierichtingen of zonder de beroepskwalificaties), dan zegt een
 * verschil niets over de koppeling: het wordt info, met een telling en een paar voorbeelden, zodat zo'n noodrun niet
 * strandt op de beroepskwalificaties (R7). Zonder geldige `matrixSha256` ook, met een eigen zin (KP1 is dan al rood).
 */
function controleerErkenningenTegenMatrix(records: Json[], matrix: MatrixInfo | undefined, stand: MatrixStand, f: Meldingen, i: Meldingen, o: Required<Opties>): void {
  if (matrix === undefined) return;
  const zelfdeMatrix = stand === 'zelfde';
  let totaal = 0;
  const verschil = new Telling();
  /** Streng, maar een andere matrix: de ADV-verschillen die anders een fout waren. */
  const nieuwereMatrix = new Telling();
  for (const r of records) {
    if (r.status !== 'opgehaald' || !isGeheel(r.onderdeel)) continue;
    const m = matrix.onderdelen.get(r.onderdeel);
    if (m === undefined) continue;
    totaal++;
    const inKoppeling = new Set(erkenningenVan(r).flatMap((e) => (typeof e.adv === 'string' ? [e.adv] : [])));
    const inMatrix = new Set(m.advs.map((a) => a.nummer));
    const dag = ophaaldagVan(r);
    const verwachtInKoppeling = m.advs.filter((a) => !(dag !== undefined && a.einddatum !== undefined && a.einddatum < dag)).map((a) => a.nummer);
    const alleenKoppeling = [...inKoppeling].filter((a) => !inMatrix.has(a)).sort();
    const alleenMatrix = [...new Set(verwachtInKoppeling)].filter((a) => !inKoppeling.has(a)).sort();
    if (alleenKoppeling.length === 0 && alleenMatrix.length === 0) continue;
    verschil.tel(`onderdeel ${r.onderdeel}`);
    if (!o.kruisStreng) continue;
    if (!zelfdeMatrix) {
      for (const a of alleenKoppeling) nieuwereMatrix.tel(`onderdeel ${r.onderdeel}: ${a} alleen in de koppeling`);
      for (const a of alleenMatrix) nieuwereMatrix.tel(`onderdeel ${r.onderdeel}: ${a} alleen in de matrix`);
      continue;
    }
    for (const a of alleenKoppeling) f.voeg('KP7', `onderdeel ${r.onderdeel}: ${a} staat in de koppeling, maar niet in de matrix.`);
    for (const a of alleenMatrix) f.voeg('KP7', `onderdeel ${r.onderdeel}: ${a} staat in de matrix, maar niet in de koppeling. ${oorzaakOntbrekend(dag)}`);
  }
  i.voeg('KP7', `opgehaalde onderdelen met andere ADV-nummers dan de matrix: ${verschil.n} van de ${totaal}${verschil.tekst()}.`);
  if (nieuwereMatrix.n > 0) {
    const reden = stand === 'nieuwer'
      ? 'matrixSha256 in de koppeling is niet gelijk aan de sha256 van de matrix: de matrix is nieuwer dan de koppeling (een run met alleen de studierichtingen of zonder de beroepskwalificaties).'
      : 'de koppeling noemt geen geldige matrixSha256 (zie KP1): het is niet te zeggen bij welke matrix ze hoort.';
    i.voeg('KP7', `${reden} ${meervoud(nieuwereMatrix.n, 'ADV-verschil is', 'ADV-verschillen zijn')} daarom geen fout${nieuwereMatrix.tekst()}; een run met onderdelen = alles zet de koppeling en de matrix weer gelijk.`);
  }
}

/**
 * KP5: elke BK van een erkenning die nu geldt of later begint, staat in de index (met bestand, of nietGevonden of
 * onbruikbaar). Omgekeerd ook: een indexregel met "nietMeerGekoppeld" hoort bij een versie die geen enkele
 * erkenning nog noemt (§ 23.5.2): niet in een erkenning van nu, niet in een afgelopen erkenning, en niet in een
 * record dat "niet-gevonden" is maar zijn laatst bekende erkenningen houdt. Het veld hoort te vallen zodra de
 * versie terugkomt.
 */
function controleerIndexTegenKoppeling(records: Json[], regels: Json[], vandaag: string, f: Meldingen): void {
  const regelVan = new Map<string, Json>();
  for (const r of regels) if (typeof r.bk === 'string') regelVan.set(r.bk, r);
  const gevraagd = new Map<string, string>();
  const genoemd = new Map<string, string>();
  for (const r of records) {
    for (const e of erkenningenVan(r)) {
      for (const bk of bksVan(e)) if (!genoemd.has(bk)) genoemd.set(bk, `onderdeel ${String(r.onderdeel)}, ${String(e.adv)}`);
    }
    if (!isGeheel(r.onderdeel)) continue;
    const { nu, toekomst } = erkenningenOp(erkenningenVan(r), vandaag);
    for (const e of [...nu, ...toekomst]) {
      for (const bk of bksVan(e)) if (!gevraagd.has(bk)) gevraagd.set(bk, `onderdeel ${r.onderdeel}, ${e.adv}`);
    }
  }
  for (const [bk, plaats] of [...gevraagd].sort((a, b) => vergelijkBkVersie(a[0], b[0]))) {
    const regel = regelVan.get(bk);
    if (regel === undefined) f.voeg('KP5', `${bk} hoort bij een erkenning van nu of later (${plaats}), maar staat niet in de index.`);
    else if (regel.bestand === undefined && regel.nietGevonden !== true && regel.onbruikbaar !== true) {
      f.voeg('KP5', `${bk} staat in de index zonder "bestand", "nietGevonden" of "onbruikbaar" (${plaats}).`);
    }
  }
  for (const r of regels) {
    const plaats = typeof r.bk === 'string' && r.nietMeerGekoppeld !== undefined ? genoemd.get(r.bk) : undefined;
    if (plaats !== undefined) f.voeg('KP5', `${String(r.bk)} heeft "nietMeerGekoppeld" (${toon(r.nietMeerGekoppeld)}) in de index, maar een erkenning noemt de versie nog (${plaats}).`);
  }
}

/** BX1 en BX2. Geeft de regels terug voor KP5, BX3 en BX4. */
function controleerIndex(uit: string, f: Meldingen, i: Meldingen): Json[] | undefined {
  const gelezen = leesJson(join(uit, 'index.json'));
  if ('fout' in gelezen) {
    f.voeg('BX1', `index.json kan niet gelezen worden (${gelezen.fout}): er hoort één regel per BK-versie in te staan.`);
    return undefined;
  }
  const index = gelezen.json;
  if (!isObj(index)) {
    f.voeg('BX1', 'index.json bevat geen object.');
    return undefined;
  }
  if (index.app !== 'boosterz' || index.kind !== BK_INDEX_KIND || index.v !== 1) f.voeg('BX1', 'de kop (app, kind, v) klopt niet.');
  if (!Array.isArray(index.bks)) {
    f.voeg('BX1', '"bks" ontbreekt of is geen lijst.');
    return undefined;
  }
  if (index.sha256 !== sha256Van(index.bks)) f.voeg('BX1', 'de sha256 komt niet overeen met de bks.');
  for (const t of valideerBkIndex(index)) f.voeg('BX1', t);
  const regels = index.bks.filter(isObj);

  // BX2: gesorteerd met vergelijkBkVersie en uniek; nummer en versie horen bij bk.
  const versies = regels.flatMap((r) => (typeof r.bk === 'string' ? [r.bk] : []));
  controleerVolgorde(versies, vergelijkBkVersie, (soort, a, b) =>
    f.voeg('BX2', soort === 'dubbel' ? `de versie ${b} staat meer dan één keer in de index.` : `de versies ${a} en ${b} staan niet gesorteerd.`));
  for (const r of regels) {
    const delen = typeof r.bk === 'string' ? splitsBk(r.bk) : undefined;
    if (delen === undefined) f.voeg('BX2', `${toon(r.bk)} past niet op BK-0000-0.`);
    else if (r.nummer !== delen.nummer || r.versie !== delen.versie) f.voeg('BX2', `${String(r.bk)}: "nummer" ${toon(r.nummer)} en "versie" ${toon(r.versie)} horen niet bij de versie in "bk".`);
  }

  const aantal = (waar: (r: Json) => boolean) => regels.filter(waar).length;
  i.voeg('BX1', `${meervoud(regels.length, 'BK-versie', 'BK-versies')} in de index: ${aantal((r) => r.bestand !== undefined)} met bestand, ${aantal((r) => r.nietGevonden === true)} niet gevonden, ${aantal((r) => r.onbruikbaar === true)} onbruikbaar, ${aantal((r) => r.nietMeerGekoppeld !== undefined)} niet meer gekoppeld.`);
  return regels;
}

/** De doelcodes van één BK-versie (BB3): uniek, hoogstens 60 tekens, met het voorvoegsel van de versie, en door `normalizeGoalCode` onveranderd. */
function controleerDoelcodes(bk: string, aantalCompetenties: number, codes: ReadonlyMap<string, string>): string[] {
  const fouten: string[] = [];
  if (codes.size !== aantalCompetenties) {
    fouten.push(`${bk}: ${meervoud(aantalCompetenties, 'competentie', 'competenties')}, maar ${meervoud(codes.size, 'doelcode', 'doelcodes')}: de doelcodes zijn niet uniek, of een competentie heeft er geen.`);
  }
  const waarden = [...codes.values()];
  for (const c of new Set(waarden.filter((w, n) => waarden.indexOf(w) !== n))) fouten.push(`${bk}: de doelcode ${c} komt meer dan één keer voor: de doelcodes zijn niet uniek.`);
  for (const c of waarden) {
    if (c.length > 60) fouten.push(`${bk}: de doelcode ${c} is langer dan 60 tekens.`);
    if (!c.startsWith(`${bk}.`)) fouten.push(`${bk}: de doelcode ${c} begint niet met "${bk}.".`);
    const n = normalizeGoalCode(c);
    if (n !== c) fouten.push(`${bk}: normalizeGoalCode verandert de doelcode ${c} in ${n}.`);
  }
  return fouten;
}

/** Is een tekst leeg nadat de HTML omgezet is (zoals de app het doet met `tekstVanCompetentie`)? */
function leegNaOmzetting(t: unknown): boolean {
  return typeof t !== 'string' || normaliseerDoeltekst(htmlNaarTekst(t)).trim() === '';
}

interface BkTellers {
  bestanden: number;
  nr: Telling;
  html: Telling;
}

/** De sha256 van een BK-bestand: `sha256(canoniek({bk, titel, status, vks, definitie, competenties, extra}))`. */
function bkSha256(b: Json): string {
  return sha256Van({ bk: b.bk, titel: b.titel, status: b.status, vks: b.vks, definitie: b.definitie, competenties: b.competenties, extra: b.extra });
}

/** BB1 tot BB5 voor één BK-bestand. `bk` komt uit de bestandsnaam in de index. */
function controleerBkInhoud(bk: string, naam: string, b: Json, f: Meldingen, t: BkTellers, o: Required<Opties>): void {
  // BB1: de vorm, de naam, de sha256 en het aantal.
  for (const m of valideerBkBestand(b, bk)) f.voeg('BB1', `${bk}: ${m}`);
  if (b.bk !== bk) f.voeg('BB1', `${naam}: "bk" in het bestand is ${toon(b.bk)}, niet gelijk aan de bestandsnaam.`);
  if (b.sha256 !== bkSha256(b)) f.voeg('BB1', `${bk}: de sha256 komt niet overeen met de inhoud.`);
  if (!Array.isArray(b.competenties)) return;
  const competenties = b.competenties.filter(isObj);
  if (b.aantal !== b.competenties.length) f.voeg('BB1', `${bk}: aantal is ${toon(b.aantal)}, maar er staan ${b.competenties.length} competenties in.`);

  // BB2: unieke competentiecodes op het patroon; elke tekst, kennis en vaardigheid is niet leeg na omzetting.
  const ids = new Set<string>();
  competenties.forEach((c, n) => {
    const waar = `${bk}, competentie ${n + 1}`;
    if (typeof c.id !== 'string' || !COMPETENTIE_CODE.test(c.id)) f.voeg('BB2', `${waar}: de competentiecode ${toon(c.id)} past niet op ${COMPETENTIE_CODE.source}.`);
    else if (ids.has(c.id)) f.voeg('BB2', `${waar}: de competentiecode ${c.id} staat meer dan één keer in het bestand.`);
    else ids.add(c.id);
    if (leegNaOmzetting(c.tekst)) f.voeg('BB2', `${waar}: de tekst is leeg na het omzetten van HTML.`);
    for (const [veld, naamVeld] of [['kennis', 'kennis'], ['vaardigheden', 'vaardigheid']] as const) {
      lijstVan(c[veld]).forEach((x, k) => {
        if (!isObj(x) || leegNaOmzetting(x.tekst)) f.voeg('BB2', `${waar}: ${naamVeld} ${k + 1} is leeg na het omzetten van HTML.`);
      });
    }
  });

  // BB3: de doelcodes.
  const codes = doelcodesVanBestand({ bk, competenties: competenties as never });
  for (const m of controleerDoelcodes(bk, competenties.length, codes)) f.voeg('BB3', m);

  // BB4: nr is een geheel getal en uniek in de versie. Mild tot G1.
  const nrs = competenties.map((c) => c.nr);
  const zonderNr = nrs.filter((x) => !isGeheel(x)).length;
  const perNr = new Map<number, number>();
  for (const x of nrs) if (isGeheel(x)) perNr.set(x, (perNr.get(x) ?? 0) + 1);
  const dubbeleNr = [...perNr].filter(([, n]) => n > 1).map(([x]) => x);
  if (zonderNr > 0 || dubbeleNr.length > 0) {
    const delen = [zonderNr > 0 ? `${zonderNr} zonder geheel nr` : '', dubbeleNr.length > 0 ? `nr ${dubbeleNr.join(', ')} komt meer dan één keer voor` : ''].filter((x) => x !== '');
    t.nr.tel(`${bk}: ${delen.join(', ')}`);
    if (o.nrStreng) f.voeg('BB4', `${bk}: ${delen.join(' en ')} (de doelcode volgt dan de plaats in het bestand).`);
  }

  // BB5: geen HTML-tags in de teksten. Mild tot G1.
  let metHtml = 0;
  for (const c of competenties) {
    const teksten = [c.tekst, ...lijstVan(c.kennis).map((x) => (isObj(x) ? x.tekst : undefined)), ...lijstVan(c.vaardigheden).map((x) => (isObj(x) ? x.tekst : undefined))];
    metHtml += teksten.filter((x) => typeof x === 'string' && HTML_TAG.test(x)).length;
  }
  if (metHtml > 0) {
    t.html.tel(`${bk}: ${metHtml} ${metHtml === 1 ? 'tekst' : 'teksten'}`);
    if (o.tekstStreng) f.voeg('BB5', `${bk}: ${metHtml} ${metHtml === 1 ? 'tekst bevat' : 'teksten bevatten'} een HTML-tag.`);
  }
}

/** BX3 en BX4, en BB1 tot BB5 voor elk bestand dat de index noemt. */
function controleerBkBestanden(uit: string, regels: Json[], f: Meldingen, i: Meldingen, o: Required<Opties>): void {
  const tellers: BkTellers = { bestanden: 0, nr: new Telling(), html: new Telling() };
  const bekend = new Set<string>();
  for (const r of regels) {
    const bk = typeof r.bk === 'string' && BK_VERSIE.test(r.bk) ? r.bk : undefined;
    if (bk === undefined) continue;
    if (r.bestand === undefined) {
      // Zonder bestand: de versie was nooit op te halen (nietGevonden) of onbruikbaar.
      if ((r.nietGevonden === true) === (r.onbruikbaar === true)) f.voeg('BX3', `${bk}: zonder "bestand" staat er precies één van "nietGevonden" en "onbruikbaar".`);
      continue;
    }
    const pad = bkBestandVan(bk);
    if (r.bestand !== pad) f.voeg('BX3', `${bk}: "bestand" is ${toon(r.bestand)}, maar moet ${pad} zijn.`);
    bekend.add(`${bk}.json`);
    const g = leesJson(join(uit, pad));
    if ('fout' in g) {
      f.voeg('BX3', `${bk}: het bestand ${pad} kan niet gelezen worden (${g.fout}).`);
      continue;
    }
    const b = g.json;
    if (!isObj(b)) {
      f.voeg('BX3', `${bk}: ${pad} bevat geen object.`);
      continue;
    }
    const verschillen: string[] = [];
    if (r.sha256 !== b.sha256) verschillen.push('sha256');
    if (r.aantal !== b.aantal) verschillen.push(`aantal ${toon(r.aantal)} ≠ ${toon(b.aantal)}`);
    if (r.titel !== b.titel) verschillen.push(`titel ${toon(r.titel)} ≠ ${toon(b.titel)}`);
    if (r.opgehaald !== b.opgehaald) verschillen.push(`opgehaald ${toon(r.opgehaald)} ≠ ${toon(b.opgehaald)}`);
    if (verschillen.length > 0) f.voeg('BX3', `${bk}: de regel in de index wijkt af van ${pad} (${verschillen.join('; ')}).`);
    tellers.bestanden++;
    controleerBkInhoud(bk, `${bk}.json`, b, f, tellers, o);
  }

  // BX4: geen bestanden in bk/ buiten de index.
  const map = join(uit, 'bk');
  if (existsSync(map)) {
    for (const naam of readdirSync(map).sort()) {
      if (!bekend.has(naam)) f.voeg('BX4', `bk/${naam} staat in de map, maar niet in de index.`);
    }
  }

  i.voeg('BB4', `BK-bestanden met een competentie zonder geheel nr of met een dubbel nr: ${tellers.nr.n} van de ${tellers.bestanden}${tellers.nr.tekst()}.`);
  i.voeg('BB5', `BK-bestanden met een HTML-tag in een tekst: ${tellers.html.n} van de ${tellers.bestanden}${tellers.html.tekst()}.`);
}

/**
 * Controleert een map met beroepskwalificaties (`koppeling.json`, `index.json` en `bk/`) tegen een map met
 * studierichtingen (`studierichtingen.json`). Gooit nooit: een bestand dat niet te lezen is, wordt een fout.
 */
function controleerKwalificatieMap(uit: string, structuur: string, opties: Opties = {}): Uitkomst {
  const f = new Meldingen();
  const i = new Meldingen();
  const volledig: Required<Opties> = {
    vandaag: opties.vandaag ?? vandaagUtc(),
    // Standaard mild: de zelftests en de fixtures bepalen zelf wat streng is. De echte map gebruikt de
    // gedeelde schakelaars hieronder (ECHTE_OPTIES).
    a3Streng: opties.a3Streng ?? false,
    kruisStreng: opties.kruisStreng ?? false,
    nrStreng: opties.nrStreng ?? false,
    tekstStreng: opties.tekstStreng ?? false,
  };
  try {
    const matrix = leesMatrix(structuur, f, i);
    const records = controleerKoppeling(uit, matrix, f, i, volledig);
    const regels = controleerIndex(uit, f, i);
    if (records !== undefined && regels !== undefined) controleerIndexTegenKoppeling(records, regels, volledig.vandaag, f);
    controleerBkBestanden(uit, regels ?? [], f, i, volledig);
  } catch (e) {
    f.voeg('KP1', `de controle zelf faalde: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { fouten: f.lijst(), info: i.lijst() };
}

/** "KP6 ×1, BB4 ×1": een korte samenvatting van de info voor in een testnaam. */
function samenvatting(info: readonly string[] | undefined): string {
  if (info === undefined || info.length === 0) return '';
  const telling = new Map<string, number>();
  for (const regel of info) {
    const code = /^([A-Z]{2}\d):/.exec(regel)?.[1] ?? '?';
    telling.set(code, (telling.get(code) ?? 0) + 1);
  }
  return ` [info: ${[...telling].map(([c, n]) => `${c} ×${n}`).join(', ')}]`;
}

/** Zoveel infomeldingen schrijven we uit bij de echte map; van de rest geven we alleen het aantal. */
const MAX_INFO_REGELS = 20;

/**
 * De infomeldingen bij de echte map als tekst voor de uitvoer van de test: een kopregel met het aantal, de
 * eerste `MAX_INFO_REGELS` meldingen en een teller voor de rest. Leeg als er niets te melden valt.
 */
function infoUitvoer(info: readonly string[]): string {
  if (info.length === 0) return '';
  const regels = [`beroepskwalificaties: ${info.length} ${info.length === 1 ? 'infomelding' : 'infomeldingen'} bij public/leerplannen/kwalificaties`];
  for (const t of info.slice(0, MAX_INFO_REGELS)) regels.push(`  ${t}`);
  if (info.length > MAX_INFO_REGELS) regels.push(`  … en nog ${info.length - MAX_INFO_REGELS} meldingen`);
  return `${regels.join('\n')}\n`;
}

/**
 * Een harde fout als er BK-bestanden staan zonder index: zo valt een hernoemde of verdwenen index op, in
 * plaats van dat de hele controle stilletjes wegvalt.
 */
function aanwezigheidsfout(heeftIndex: boolean, bkBestanden: readonly string[]): string | undefined {
  if (bkBestanden.length === 0 || heeftIndex) return undefined;
  return `public/leerplannen/kwalificaties/bk bevat ${bkBestanden.slice(0, 3).join(', ')}${bkBestanden.length > 3 ? ', …' : ''} maar er is geen index.json`;
}

// ── 1. De meegeleverde bestanden ────────────────────────────────────────────
//
// De map public/leerplannen/kwalificaties wordt pas door de workflow "Leerplangegevens bijwerken" gevuld, na
// de eerste echte run (G1). Bestaat de map niet, dan valt er niets te controleren: de test slaat dan over en
// meldt dat in de uitvoer. Staan er BK-bestanden zonder index, dan faalt de test.

const heeftMap = existsSync(KWALIFICATIES_MAP);
const bkBestanden = existsSync(join(KWALIFICATIES_MAP, 'bk')) ? readdirSync(join(KWALIFICATIES_MAP, 'bk')).filter((n) => n.endsWith('.json')) : [];
const ontbreekt = aanwezigheidsfout(existsSync(join(KWALIFICATIES_MAP, 'index.json')), bkBestanden);
/** De echte map volgt de gedeelde schakelaars bovenaan (sinds G1 stap 4 aan). */
const ECHTE_OPTIES: Opties = { a3Streng: BK_A3_STRENG, kruisStreng: ERKENNING_KRUIS_STRENG, nrStreng: NR_STRENG, tekstStreng: TEKST_STRENG };
const echt = heeftMap ? controleerKwalificatieMap(KWALIFICATIES_MAP, STRUCTUUR_MAP, ECHTE_OPTIES) : undefined;

/** De regel die in de uitvoer staat als de echte map nog niet bestaat. */
const OVERSLAAN_REGEL = 'beroepskwalificaties: public/leerplannen/kwalificaties bestaat nog niet; de echte map wordt overgeslagen tot de eerste echte run (G1). De fixtures worden wel gecontroleerd.';

it.runIf(ontbreekt !== undefined)('de BK-bestanden staan niet zonder index', () => {
  expect.fail(ontbreekt);
});

it.runIf(!heeftMap)('overgeslagen: public/leerplannen/kwalificaties bestaat nog niet (de eerste echte run volgt)', () => {
  process.stdout.write(`${OVERSLAAN_REGEL}\n`);
  expect(ontbreekt).toBeUndefined();
});

describe.runIf(heeftMap)('meegeleverde beroepskwalificaties (public/leerplannen/kwalificaties)', () => {
  it(`de koppeling, de index en alle BK-bestanden kloppen${samenvatting(echt?.info)}`, () => {
    // Eerst de info (ook als er fouten zijn), want console mag niet in src: zo ziet wie de test draait de meldingen.
    process.stdout.write(infoUitvoer(echt?.info ?? []));
    expect(echt?.fouten).toEqual([]);
  });

  // BC1 (G1 stap 4): een vaste verwachting uit de verkenning (ronde 6 en 7) en de eerste volledige run. Onderdeel 504
  // (Onthaal en recreatie) heeft in ADV-0842 precies BK-0390-2 (12 competenties) en BK-0464-1 (13), zonder gedeelde
  // competentiecodes. Alleen zolang ADV-0842 geldt en de index die versies met een bestand noemt: een latere erkenning of
  // een nieuwe versie maakt de verwachting zinloos, niet fout.
  it('BC1: onderdeel 504 heeft in ADV-0842 precies Onthaalmedewerker (12) en Recreatief medewerker (13)', () => {
    const koppeling = JSON.parse(readFileSync(join(KWALIFICATIES_MAP, 'koppeling.json'), 'utf8')) as {
      onderdelen: { onderdeel: number; erkenningen?: { adv: string; einddatum?: string | null; bks?: { bk: string }[] }[] }[];
    };
    const index = JSON.parse(readFileSync(join(KWALIFICATIES_MAP, 'index.json'), 'utf8')) as { bks: { bk: string; bestand?: string }[] };
    const erkenning = koppeling.onderdelen.find((o) => o.onderdeel === 504)?.erkenningen?.find((e) => e.adv === 'ADV-0842');
    const verwacht = ['BK-0390-2', 'BK-0464-1'];
    const metBestand = verwacht.every((bk) => index.bks.some((b) => b.bk === bk && typeof b.bestand === 'string'));
    const geldt = erkenning !== undefined && (!erkenning.einddatum || erkenning.einddatum >= VANDAAG_ECHT);
    if (!geldt || !metBestand) {
      process.stdout.write('beroepskwalificaties: BC1 overgeslagen (ADV-0842 geldt niet meer of de index noemt de versies niet met een bestand).\n');
      return;
    }
    expect((erkenning.bks ?? []).map((b) => b.bk).sort()).toEqual(verwacht);
    const codes = verwacht.map((bk) => {
      const bestand = JSON.parse(readFileSync(join(KWALIFICATIES_MAP, 'bk', `${bk}.json`), 'utf8')) as { competenties: { id: string }[] };
      return bestand.competenties.map((c) => c.id);
    });
    expect(codes.map((c) => c.length)).toEqual([12, 13]);
    expect(codes[0].filter((id) => codes[1].includes(id))).toEqual([]);
  });
});

describe('aanwezigheidsfout', () => {
  it('geen BK-bestanden: niets te melden', () => {
    expect(aanwezigheidsfout(false, [])).toBeUndefined();
    expect(aanwezigheidsfout(true, [])).toBeUndefined();
  });

  it('BK-bestanden zonder index.json zijn een harde fout', () => {
    expect(aanwezigheidsfout(false, ['BK-0390-2.json', 'BK-0464-1.json'])).toMatch(/BK-0390-2\.json, BK-0464-1\.json maar er is geen index\.json/);
    expect(aanwezigheidsfout(false, ['a.json', 'b.json', 'c.json', 'd.json'])).toMatch(/a\.json, b\.json, c\.json, … maar/);
  });

  it('index en bestanden samen zijn in orde', () => {
    expect(aanwezigheidsfout(true, ['BK-0390-2.json'])).toBeUndefined();
  });
});

// ── 2. De fixtures: het positieve geval ─────────────────────────────────────

const FIXTURE_OPTIES: Opties = { vandaag: FIXTURE_VANDAAG };

describe('tests/fixtures/kwalificaties/uit (positief geval)', () => {
  it('geeft geen enkele fout', () => {
    const { fouten } = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, FIXTURE_OPTIES);
    expect(fouten).toEqual([]);
  });

  it('geeft ook geen fout met KP6 streng: de fixtures hebben geen gewoon onderdeel van de 3de graad A', () => {
    const { fouten, info } = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, { ...FIXTURE_OPTIES, a3Streng: true });
    expect(fouten).toEqual([]);
    expect(info.find((t) => t.startsWith('KP6:'))).toMatch(/^KP6: .*: 0 van de 0\.$/);
  });

  it('de fixtures leveren bewust precies drie dingen die streng een fout zijn: een nr dat ontbreekt, HTML en een ADV-nummer dat de matrix niet kent', () => {
    // BK-9999-1 heeft een competentie zonder nr en een <b> in een tekst; onderdeel 10 heeft een toekomstige erkenning
    // (ADV-1999) die niet in de matrix staat. De rest van de fixtures is gewoon in orde.
    const nr = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, { ...FIXTURE_OPTIES, nrStreng: true }).fouten;
    expect(nr.map((t) => t.slice(0, 4))).toEqual(['BB4:']);
    expect(nr[0]).toMatch(/BK-9999-1: 1 zonder geheel nr/);
    const tekst = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, { ...FIXTURE_OPTIES, tekstStreng: true }).fouten;
    expect(tekst.map((t) => t.slice(0, 4))).toEqual(['BB5:']);
    expect(tekst[0]).toMatch(/BK-9999-1: 1 tekst bevat een HTML-tag/);
    const kruis = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, { ...FIXTURE_OPTIES, kruisStreng: true }).fouten;
    expect(kruis).toEqual(['KP7: onderdeel 10: ADV-1999 staat in de koppeling, maar niet in de matrix.']);
  });

  it('meldt de tellingen van KP1, KP6, KP7, BX1, BB4 en BB5 in info, ook de gevallen die mild blijven', () => {
    const { info } = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, FIXTURE_OPTIES);
    for (const code of ['KP1', 'KP6', 'KP7', 'BX1', 'BB4', 'BB5']) expect(info.some((t) => t.startsWith(`${code}:`)), `info over ${code}`).toBe(true);
    // De getallen komen uit de bestanden (`fixtureTellingen`); vast staan alleen de bewust gebroken gevallen:
    // BK-9999-1 (geen nr, een HTML-tag) en onderdeel 10 (een ADV-nummer dat de matrix niet kent).
    const n = fixtureTellingen();
    expect(info.find((t) => t.startsWith('KP1:'))).toBe(
      `KP1: ${n.onderdelen} onderdelen in de koppeling: ${n.opgehaald} opgehaald, ${n.nietGevonden} niet gevonden, ${n.nogNietOpgehaald} nog niet opgehaald; ${n.metBkNu} met een beroepskwalificatie in een erkenning van nu (op ${FIXTURE_VANDAAG}).`,
    );
    expect(info.find((t) => t.startsWith('BX1:'))).toBe(
      `BX1: ${n.bks} BK-versies in de index: ${n.metBestand} met bestand, ${n.bkNietGevonden} niet gevonden, ${n.onbruikbaar} onbruikbaar, ${n.nietMeerGekoppeld} niet meer gekoppeld.`,
    );
    expect(info.find((t) => t.startsWith('BB4:'))).toMatch(new RegExp(`^BB4: .*: 1 van de ${n.metBestand} \\(bv\\. BK-9999-1: 1 zonder geheel nr\\)\\.$`));
    expect(info.find((t) => t.startsWith('BB5:'))).toMatch(new RegExp(`^BB5: .*: 1 van de ${n.metBestand} \\(bv\\. BK-9999-1: 1 tekst\\)\\.$`));
    expect(info.find((t) => t.startsWith('KP7:'))).toMatch(new RegExp(`^KP7: .*: 1 van de ${n.opgehaaldInMatrix} \\(bv\\. onderdeel 10\\)\\.$`));
  });

  it('de fixtures bevatten de soorten gevallen die de zelftest nodig heeft', () => {
    const koppeling = lees(FIXTURE_UIT, 'koppeling.json');
    const records = koppeling.onderdelen as Json[];
    expect(new Set(records.map((r) => r.status))).toEqual(new Set(STATUSSEN));
    const index = lees(FIXTURE_UIT, 'index.json');
    const regels = index.bks as Json[];
    expect(regels.some((r) => r.nietGevonden === true && r.bestand === undefined)).toBe(true);
    expect(regels.filter((r) => r.bestand !== undefined).length).toBeGreaterThanOrEqual(3);
    // K8: de afgelopen erkenningen van 8 (ADV-0917, met BK-0390-1) en 565 (ADV-0960) liepen af vóór het ophalen: ze
    // staan niet in de koppeling, en BK-0390-1 niet in de index. De zelftest maakt zo'n erkenning zelf waar nodig.
    expect(regels.some((r) => r.bk === 'BK-0390-1')).toBe(false);
    expect(JSON.stringify(koppeling)).not.toMatch(/BK-0390-1|ADV-0917|ADV-0960|"extra"/);
  });

  it('zonder datum rekent de controle met vandaag (UTC)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2030-05-05T23:30:00Z'));
      const { info } = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR);
      expect(info.find((t) => t.startsWith('KP1:'))).toContain('(op 2030-05-05)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('een map zonder koppeling, index en matrix is een fout en geen uitzondering', () => {
    const leeg = join(tmpdir(), 'bestaat-niet-kwalificaties');
    const { fouten } = controleerKwalificatieMap(leeg, join(tmpdir(), 'bestaat-niet-structuur'), FIXTURE_OPTIES);
    expect(fouten.map((t) => t.slice(0, 4))).toEqual(['KP1:', 'KP2:', 'BX1:']);
  });
});

// ── 3. De zelftest: kapotte kopieën ─────────────────────────────────────────
//
// Elke case maakt een kopie van de fixtures (en van de matrix) in os.tmpdir(), breekt precies één invariant en
// eist dat de controle die vindt: een melding met de juiste code én met de tekst van de bedoelde controle
// (`verwacht`), zodat een andere controle met dezelfde code de case niet kan redden. De kopie wordt telkens zo
// hersteld dat de rest consistent blijft (aantallen, sha256, de regel in de index), zodat alleen de bedoelde
// invariant breekt.

const tijdelijk: string[] = [];
afterAll(() => {
  for (const map of tijdelijk) rmSync(map, { recursive: true, force: true });
});

interface Kopie {
  uit: string;
  structuur: string;
}

function maakKopie(): Kopie {
  const wortel = mkdtempSync(join(tmpdir(), 'kwalificaties-data-'));
  tijdelijk.push(wortel);
  const uit = join(wortel, 'uit');
  const structuur = join(wortel, 'structuur');
  cpSync(FIXTURE_UIT, uit, { recursive: true });
  mkdirSync(structuur);
  cpSync(join(FIXTURE_STRUCTUUR, 'studierichtingen.json'), join(structuur, 'studierichtingen.json'));
  return { uit, structuur };
}

const lees = (map: string, ...delen: string[]): Json => JSON.parse(readFileSync(join(map, ...delen), 'utf8')) as Json;
const schrijf = (map: string, delen: string[], json: unknown): void => writeFileSync(join(map, ...delen), `${JSON.stringify(json, null, 2)}\n`);

const leesKoppeling = (k: Kopie): Json => lees(k.uit, 'koppeling.json');
const recordsVan = (kop: Json): Json[] => kop.onderdelen as Json[];
const recordVan = (kop: Json, nr: number): Json => {
  const r = recordsVan(kop).find((x) => x.onderdeel === nr);
  if (r === undefined) throw new Error(`De fixtures hebben geen onderdeel ${nr}.`);
  return r;
};
const erkenningenVanRecord = (kop: Json, nr: number): Json[] => recordVan(kop, nr).erkenningen as Json[];
/** Eén erkenning van een record, op haar ADV-nummer (de plaats hangt af van welke erkenningen de koppeling bewaart). */
const erkenningVan = (kop: Json, nr: number, adv: string): Json => {
  const e = erkenningenVanRecord(kop, nr).find((x) => x.adv === adv);
  if (e === undefined) throw new Error(`De fixtures hebben geen erkenning ${adv} bij onderdeel ${nr}.`);
  return e;
};

/** ADV-0917 van onderdeel 8 zoals de koppeling vóór K8 ze bewaarde (begin 2021-09-01, met BK-0390-1), met dit einde. */
const afgelopenErkenning = (einddatum: string): Json => ({
  adv: 'ADV-0917', versie: 'S-8-V1', status: 'ERKEND', begindatum: '2021-09-01', einddatum, bks: [{ bk: 'BK-0390-1', titel: 'Onthaalmedewerker' }], bekrachtigingen: [],
});

/** Schrijft de koppeling en werkt `aantalOnderdelen` en de sha256 bij. */
function herstelKoppeling(k: Kopie, kop: Json): void {
  kop.aantalOnderdelen = recordsVan(kop).length;
  kop.sha256 = sha256Van(kop.onderdelen);
  schrijf(k.uit, ['koppeling.json'], kop);
}

const leesIndex = (k: Kopie): Json => lees(k.uit, 'index.json');
const regelsVan = (index: Json): Json[] => index.bks as Json[];
const regelVan = (index: Json, bk: string): Json => {
  const r = regelsVan(index).find((x) => x.bk === bk);
  if (r === undefined) throw new Error(`De index heeft geen regel voor ${bk}.`);
  return r;
};

/** Schrijft de index en werkt de sha256 bij. */
function herstelIndex(k: Kopie, index: Json): void {
  index.sha256 = sha256Van(index.bks);
  schrijf(k.uit, ['index.json'], index);
}

const leesBk = (k: Kopie, bk: string): Json => lees(k.uit, 'bk', `${bk}.json`);

/**
 * Schrijft een BK-bestand en werkt de sha256 (en het aantal, tenzij `bewaarAantal`) bij, en de regel in de
 * index met de sha256 en het aantal van het bestand.
 */
function herstelBk(k: Kopie, bk: string, b: Json, bewaarAantal = false): void {
  if (!bewaarAantal) b.aantal = lijstVan(b.competenties).length;
  b.sha256 = bkSha256(b);
  schrijf(k.uit, ['bk', `${bk}.json`], b);
  const index = leesIndex(k);
  const regel = regelVan(index, bk);
  regel.sha256 = b.sha256;
  regel.aantal = b.aantal;
  herstelIndex(k, index);
}

const competentiesVan = (b: Json): Json[] => b.competenties as Json[];

/** Het aantal competenties van BK-0390-2 in de fixtures, uit het bestand zelf (de cases rond `aantal` rekenen ermee). */
const AANTAL_0390_2 = competentiesVan(lees(FIXTURE_UIT, 'bk', 'BK-0390-2.json')).length;

/**
 * De eerste twee BK-versies van ADV-1612 (onderdeel 8) en de eerste twee in de index, zoals ze in de fixtures
 * staan. De sorteer-cases wisselen ze om en verwachten dan een melding met precies die twee. Staat er later
 * een versie bij (BK-0390-10 komt tussen BK-0390-2 en BK-0464-1), dan lopen de namen vanzelf mee.
 */
const [ADV_1612_EERSTE, ADV_1612_TWEEDE] = (erkenningVan(lees(FIXTURE_UIT, 'koppeling.json'), 8, 'ADV-1612').bks as Json[]).map((x) => String(x.bk));
const [INDEX_EERSTE, INDEX_TWEEDE] = regelsVan(lees(FIXTURE_UIT, 'index.json')).map((x) => String(x.bk));

/**
 * De tellingen van de fixtures in `uit/`, rechtstreeks uit de bestanden geteld en niet vastgelegd. Vul je de
 * fixtures aan (bv. met BK-0390-10) en maak je `uit/` opnieuw, dan lopen de verwachtingen vanzelf mee. Vast
 * staan alleen de bewust gebroken gevallen (BK-9999-1, onderdeel 10) en wat de cases zelf aanpassen.
 */
function fixtureTellingen() {
  const records = recordsVan(lees(FIXTURE_UIT, 'koppeling.json'));
  const regels = regelsVan(lees(FIXTURE_UIT, 'index.json'));
  const inMatrix = new Set((lees(FIXTURE_STRUCTUUR, 'studierichtingen.json').onderdelen as Json[]).map((o) => o.nummer));
  const aantalRecords = (status: string) => records.filter((r) => r.status === status).length;
  const aantalRegels = (waar: (r: Json) => boolean) => regels.filter(waar).length;
  return {
    onderdelen: records.length,
    opgehaald: aantalRecords('opgehaald'),
    nietGevonden: aantalRecords('niet-gevonden'),
    nogNietOpgehaald: aantalRecords('nog-niet-opgehaald'),
    /** De opgehaalde onderdelen die ook in de matrix staan: de noemer van KP7. */
    opgehaaldInMatrix: records.filter((r) => r.status === 'opgehaald' && inMatrix.has(r.onderdeel)).length,
    metBkNu: records.filter((r) => erkenningenOp(erkenningenVan(r), FIXTURE_VANDAAG).nu.some((e) => bksVan(e).length > 0)).length,
    bks: regels.length,
    /** Ook de noemer van BB4 en BB5. */
    metBestand: aantalRegels((r) => r.bestand !== undefined),
    bkNietGevonden: aantalRegels((r) => r.nietGevonden === true),
    onbruikbaar: aantalRegels((r) => r.onbruikbaar === true),
    nietMeerGekoppeld: aantalRegels((r) => r.nietMeerGekoppeld !== undefined),
  };
}

/** Schrijft de matrix en werkt de aantallen, de sha256 en `matrixSha256` in de koppeling bij. */
function herstelMatrix(k: Kopie, m: Json): void {
  m.aantalGroepen = lijstVan(m.groepen).length;
  m.aantalOnderdelen = lijstVan(m.onderdelen).length;
  m.sha256 = sha256Van({ groepen: m.groepen, onderdelen: m.onderdelen });
  schrijf(k.structuur, ['studierichtingen.json'], m);
  const kop = leesKoppeling(k);
  kop.matrixSha256 = m.sha256;
  herstelKoppeling(k, kop);
}

const leesMatrixKopie = (k: Kopie): Json => lees(k.structuur, 'studierichtingen.json');

/** Maakt van G-0008 een groep van de 3de graad A: onderdeel 8 is dan een gewoon onderdeel dat een BK nodig heeft (KP6). */
function maakDerdeGraadA(k: Kopie): void {
  const m = leesMatrixKopie(k);
  const g = (m.groepen as Json[]).find((x) => x.nummer === 'G-0008');
  if (g === undefined) throw new Error('De fixtures hebben geen groep G-0008.');
  g.graad = '3';
  g.finaliteit = 'A';
  herstelMatrix(k, m);
}

interface Case {
  naam: string;
  /** De code van de invariant die de controle moet vinden. */
  code: string;
  /**
   * De tekst van de melding van de bedoelde controle. Een melding met dezelfde code maar van een andere
   * controle redt de case dus niet.
   */
  verwacht: RegExp;
  /** Elke melding met deze code hoort bij de bedoelde controle: de breuk is zuiver (alleen waar dat telt). */
  alleen?: boolean;
  breek: (k: Kopie) => void;
  opties?: Opties;
  /** Alleen bij een schakelaar: wat de info zonder die schakelaar over deze breuk zegt (een voorbeeld in de telling). */
  info?: RegExp;
}

const CASES: Case[] = [
  // ── Koppeling ──
  {
    naam: 'sha256 van de koppeling',
    code: 'KP1',
    verwacht: /de sha256 komt niet overeen met de onderdelen/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 9).opgehaald = '2026-10-11T00:00:00Z';
      schrijf(k.uit, ['koppeling.json'], kop);
    },
  },
  {
    naam: 'aantalOnderdelen',
    code: 'KP1',
    verwacht: /aantalOnderdelen is \d+, maar er staan \d+ onderdelen in/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      kop.aantalOnderdelen = (kop.aantalOnderdelen as number) + 1;
      schrijf(k.uit, ['koppeling.json'], kop);
    },
  },
  {
    naam: 'kop van de koppeling (app, kind, v)',
    code: 'KP1',
    verwacht: /de kop \(app, kind, v\) klopt niet/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      kop.v = 2;
      schrijf(k.uit, ['koppeling.json'], kop);
    },
  },
  {
    naam: 'vorm van de koppeling volgens de validator',
    code: 'KP1',
    verwacht: /"bekrachtigingen" ontbreekt of is geen lijst/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      delete erkenningenVanRecord(kop, 247)[0].bekrachtigingen;
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'koppeling.json is geen object',
    code: 'KP1',
    verwacht: /koppeling\.json bevat geen object/,
    breek: (k) => {
      writeFileSync(join(k.uit, 'koppeling.json'), '[]\n');
    },
  },
  {
    naam: 'koppeling zonder lijst onderdelen',
    code: 'KP1',
    verwacht: /"onderdelen" ontbreekt of is geen lijst/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      delete kop.onderdelen;
      schrijf(k.uit, ['koppeling.json'], kop);
    },
  },
  {
    naam: 'sortering van de onderdelen',
    code: 'KP2',
    verwacht: /de onderdelen \d+ en \d+ staan niet gesorteerd/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const r = recordsVan(kop);
      [r[0], r[1]] = [r[1], r[0]];
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'dubbel onderdeel',
    code: 'KP2',
    verwacht: /het onderdeel 2 staat meer dan één keer in de koppeling/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordsVan(kop).splice(1, 0, { ...recordsVan(kop)[0] });
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'onderdeel dat niet in de matrix staat',
    code: 'KP2',
    verwacht: /onderdeel 99999 staat niet in de matrix/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordsVan(kop).push({ onderdeel: 99999, groep: 'G-0002', status: 'nog-niet-opgehaald' });
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'matrix zonder groepen en onderdelen',
    code: 'KP2',
    verwacht: /studierichtingen\.json heeft niet de vorm van de matrix/,
    breek: (k) => {
      schrijf(k.structuur, ['studierichtingen.json'], { app: 'boosterz' });
    },
  },
  {
    naam: 'matrix ontbreekt',
    code: 'KP2',
    verwacht: /studierichtingen\.json kan niet gelezen worden \(het bestand bestaat niet\)/,
    breek: (k) => {
      rmSync(join(k.structuur, 'studierichtingen.json'));
    },
  },
  {
    naam: 'een andere groep dan de matrix',
    code: 'KP3',
    verwacht: /onderdeel 8: de groep is "G-0009", maar de matrix zegt G-0008/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 8).groep = 'G-0009';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'onderdeel van de matrix zonder record',
    code: 'KP3',
    verwacht: /1 onderdeel van de matrix heeft geen record in de koppeling \(2\)/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      kop.onderdelen = recordsVan(kop).filter((r) => r.onderdeel !== 2);
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'ongeldige status',
    code: 'KP4',
    verwacht: /onderdeel 9: de status "kapot" is onbekend/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 9).status = 'kapot';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'opgehaald zonder erkenningen',
    code: 'KP4',
    verwacht: /onderdeel 129: "opgehaald" heeft een lijst "erkenningen" nodig/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      delete recordVan(kop, 129).erkenningen;
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'opgehaald is geen tijdstip',
    code: 'KP4',
    verwacht: /onderdeel 9: "opgehaald" "2026-10-10" is geen tijdstip/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 9).opgehaald = '2026-10-10';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'ongeldige datum in een erkenning',
    code: 'KP4',
    verwacht: /ADV-1062: "begindatum" "2023-02-30" is geen geldige datum/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      erkenningVan(kop, 10, 'ADV-1062').begindatum = '2023-02-30';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'ongeldige datum nietMeerInBron',
    code: 'KP4',
    verwacht: /onderdeel 931: "nietMeerInBron" "2026-13-01" is geen geldige datum/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 931).nietMeerInBron = '2026-13-01';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'ADV-nummer dat niet past',
    code: 'KP4',
    verwacht: /het ADV-nummer "adv12" past niet op ADV-0000/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      erkenningenVanRecord(kop, 129)[0].adv = 'adv12';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'bk die niet op BK_VERSIE past',
    code: 'KP4',
    verwacht: /de beroepskwalificatie "BK-12" past niet op BK-0000-0/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      ((erkenningVan(kop, 8, 'ADV-1612').bks as Json[])[0]).bk = 'BK-12';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'dbk die niet op DBK_NUMMER past',
    code: 'KP4',
    verwacht: /de deelkwalificatie "DBK-1" past niet op BK-0000-0-DBK-00/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const b = (erkenningVan(kop, 8, 'ADV-1612').bekrachtigingen as Json[]).find((x) => x.dbk !== undefined);
      if (b === undefined) throw new Error('De fixtures hebben geen deelkwalificatie bij onderdeel 8.');
      b.dbk = 'DBK-1';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'erkenningen niet gesorteerd',
    code: 'KP4',
    verwacht: /onderdeel 10: de erkenningen ADV-1999 en ADV-1062 staan niet gesorteerd/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 10).erkenningen = [...erkenningenVanRecord(kop, 10)].reverse();
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'bks niet gesorteerd',
    code: 'KP4',
    verwacht: new RegExp(`ADV-1612: de beroepskwalificaties ${ADV_1612_TWEEDE} en ${ADV_1612_EERSTE} staan niet gesorteerd`),
    breek: (k) => {
      const kop = leesKoppeling(k);
      const e = erkenningVan(kop, 8, 'ADV-1612');
      const [eerste, tweede, ...rest] = e.bks as Json[];
      e.bks = [tweede, eerste, ...rest];
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'studiebekrachtigingen niet gesorteerd',
    code: 'KP4',
    verwacht: /ADV-1612: de studiebekrachtigingen .* staan niet gesorteerd/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const e = erkenningVan(kop, 8, 'ADV-1612');
      e.bekrachtigingen = [...(e.bekrachtigingen as Json[])].reverse();
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'erkenning zonder lijst bks',
    code: 'KP4',
    verwacht: /ADV-0671: "bks" ontbreekt of is geen lijst/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      delete erkenningenVanRecord(kop, 129)[0].bks;
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'erkenning zonder lijst bekrachtigingen',
    code: 'KP4',
    verwacht: /ADV-0674: "bekrachtigingen" ontbreekt of is geen lijst/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      delete erkenningenVanRecord(kop, 247)[0].bekrachtigingen;
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'een erkenning die geen object is',
    code: 'KP4',
    verwacht: /onderdeel 247: een erkenning is geen object/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      recordVan(kop, 247).erkenningen = [...erkenningenVanRecord(kop, 247), 5];
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'een studiebekrachtiging die geen object is',
    code: 'KP4',
    verwacht: /ADV-1612: een studiebekrachtiging is geen object/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const e = erkenningVan(kop, 8, 'ADV-1612');
      e.bekrachtigingen = [...(e.bekrachtigingen as Json[]), 5];
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'bk van een studiebekrachtiging die niet op BK_VERSIE past',
    code: 'KP4',
    verwacht: /de beroepskwalificatie "BK-1" van een studiebekrachtiging past niet op BK-0000-0/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const b = (erkenningVan(kop, 8, 'ADV-1612').bekrachtigingen as Json[]).find((x) => x.bk !== undefined);
      if (b === undefined) throw new Error('De fixtures hebben geen studiebekrachtiging met een bk bij onderdeel 8.');
      b.bk = 'BK-1';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'hetzelfde ADV-nummer twee keer, met een andere begindatum',
    code: 'KP4',
    verwacht: /onderdeel 8: de erkenning ADV-1612 staat er meer dan één keer in/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const lijst = erkenningenVanRecord(kop, 8);
      lijst.push({ ...erkenningVan(kop, 8, 'ADV-1612'), begindatum: '2024-09-01' });
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'BK van een erkenning van nu zonder indexregel',
    code: 'KP5',
    verwacht: /BK-0464-1 hoort bij een erkenning van nu of later \(onderdeel 8, ADV-1612\), maar staat niet in de index/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      index.bks = regelsVan(index).filter((r) => r.bk !== 'BK-0464-1');
      herstelIndex(k, index);
      rmSync(join(k.uit, 'bk', 'BK-0464-1.json'));
    },
  },
  {
    naam: 'BK van een erkenning van later zonder indexregel',
    code: 'KP5',
    verwacht: /BK-9999-2 hoort bij een erkenning van nu of later \(onderdeel 10, ADV-1999\), maar staat niet in de index/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      index.bks = regelsVan(index).filter((r) => r.bk !== 'BK-9999-2');
      herstelIndex(k, index);
      rmSync(join(k.uit, 'bk', 'BK-9999-2.json'));
    },
  },
  {
    naam: 'indexregel zonder bestand en zonder nietGevonden (KP5)',
    code: 'KP5',
    verwacht: /BK-9999-3 staat in de index zonder "bestand", "nietGevonden" of "onbruikbaar"/,
    breek: (k) => {
      const index = leesIndex(k);
      delete regelVan(index, 'BK-9999-3').nietGevonden;
      herstelIndex(k, index);
    },
  },
  {
    naam: 'BK van een erkenning van nu in een record "niet-gevonden" zonder indexregel',
    code: 'KP5',
    verwacht: /BK-9999-4 hoort bij een erkenning van nu of later \(onderdeel 9, ADV-1100\), maar staat niet in de index/,
    alleen: true,
    breek: (k) => {
      // Twee keer 404: het record houdt zijn laatst bekende erkenningen (met nietMeerInBron), en die tellen mee.
      const kop = leesKoppeling(k);
      const r = recordVan(kop, 9);
      r.status = 'niet-gevonden';
      r.nietMeerInBron = '2026-10-10';
      erkenningenVanRecord(kop, 9)[0].bks = [{ bk: 'BK-9999-4', titel: 'Nagebootste beroepskwalificatie' }];
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'nietMeerGekoppeld op een versie die een erkenning van nu nog noemt',
    code: 'KP5',
    verwacht: /BK-9999-1 heeft "nietMeerGekoppeld" \("2026-10-01"\) in de index, maar een erkenning noemt de versie nog \(onderdeel 10, ADV-1062\)/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-9999-1').nietMeerGekoppeld = '2026-10-01';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'nietMeerGekoppeld op een versie die alleen een afgelopen erkenning nog noemt',
    code: 'KP5',
    verwacht: /BK-9999-1 heeft "nietMeerGekoppeld" \("2026-10-01"\) in de index, maar een erkenning noemt de versie nog \(onderdeel 10, ADV-1062\)/,
    alleen: true,
    breek: (k) => {
      // ADV-1062 is afgelopen en noemt de versie nog: "geen enkele erkenning, afgelopen of niet" is dan niet waar. Ze
      // liep af na de ophaaldatum van haar record (een record van een vroegere run), dus ze staat er terecht (KP8).
      const kop = leesKoppeling(k);
      recordVan(kop, 10).opgehaald = '2025-08-01T00:00:00Z';
      erkenningVan(kop, 10, 'ADV-1062').einddatum = '2025-08-31';
      herstelKoppeling(k, kop);
      const index = leesIndex(k);
      regelVan(index, 'BK-9999-1').nietMeerGekoppeld = '2026-10-01';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'nietMeerGekoppeld op een versie die alleen een record "niet-gevonden" nog noemt',
    code: 'KP5',
    verwacht: /BK-9999-3 heeft "nietMeerGekoppeld" \("2026-10-01"\) in de index, maar een erkenning noemt de versie nog \(onderdeel 12, ADV-1224\)/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      const r = recordVan(kop, 12);
      r.status = 'niet-gevonden';
      r.nietMeerInBron = '2026-10-10';
      herstelKoppeling(k, kop);
      const index = leesIndex(k);
      regelVan(index, 'BK-9999-3').nietMeerGekoppeld = '2026-10-01';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'KP6 streng: een gewoon onderdeel van de 3de graad A zonder BK',
    code: 'KP6',
    verwacht: /onderdeel 8 \(G-0008\) is een geldig gewoon onderdeel van de 3de graad A, maar heeft geen beroepskwalificatie in een erkenning van nu/,
    alleen: true,
    opties: { a3Streng: true },
    info: /onderdeel 8 \(G-0008\)/,
    breek: (k) => {
      maakDerdeGraadA(k);
      const kop = leesKoppeling(k);
      erkenningVan(kop, 8, 'ADV-1612').bks = [];
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'KP7 streng: een ADV-nummer dat de matrix niet kent',
    code: 'KP7',
    verwacht: /onderdeel 129: ADV-0999 staat in de koppeling, maar niet in de matrix/,
    opties: { kruisStreng: true },
    info: /onderdeel 129/,
    breek: (k) => {
      const kop = leesKoppeling(k);
      erkenningenVanRecord(kop, 129)[0].adv = 'ADV-0999';
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'KP7 streng: een ADV-nummer van de matrix dat in de koppeling ontbreekt',
    code: 'KP7',
    verwacht: /onderdeel 8: ADV-1612 staat in de matrix, maar niet in de koppeling/,
    opties: { kruisStreng: true },
    info: /onderdeel 8[;)]/,
    breek: (k) => {
      // ADV-0917 (in de matrix tot 2024-08-31) ontbreekt ook, maar die was al afgelopen bij het ophalen (K8): geen melding.
      const kop = leesKoppeling(k);
      recordVan(kop, 8).erkenningen = erkenningenVanRecord(kop, 8).filter((e) => e.adv !== 'ADV-1612');
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'KP7 streng: een erkenning die volgens de matrix pas na de ophaaldatum afliep, hoort er nog in',
    code: 'KP7',
    verwacht: /onderdeel 8: ADV-0917 staat in de matrix, maar niet in de koppeling/,
    opties: { kruisStreng: true },
    info: /onderdeel 8[;)]/,
    breek: (k) => {
      // Het record van 8 komt van een run op 2024-08-01: ADV-0917 (tot 2024-08-31) gold toen nog en had erin moeten staan.
      const kop = leesKoppeling(k);
      recordVan(kop, 8).opgehaald = '2024-08-01T00:00:00Z';
      herstelKoppeling(k, kop);
    },
  },

  // ── De slanke vorm (K8) ──
  {
    naam: 'KP8: een erkenning die al afgelopen was bij het ophalen',
    code: 'KP8',
    verwacht: /onderdeel 8, ADV-0917: de erkenning liep af op 2024-08-31, vóór de ophaaldatum 2026-10-10; ze hoort niet in de koppeling/,
    alleen: true,
    breek: (k) => {
      // Zoals de koppeling vóór K8: ADV-0917 (met BK-0390-1) liep af op 2024-08-31.
      const kop = leesKoppeling(k);
      erkenningenVanRecord(kop, 8).unshift(afgelopenErkenning('2024-08-31'));
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'KP8: extra bij een BK-verwijzing',
    code: 'KP8',
    verwacht: new RegExp(`onderdeel 8, ADV-1612: de beroepskwalificatie "${ADV_1612_EERSTE}" heeft "extra"; dat hoort niet in de koppeling`),
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      (erkenningVan(kop, 8, 'ADV-1612').bks as Json[])[0].extra = { volledigheid: 'Volledig' };
      herstelKoppeling(k, kop);
    },
  },
  {
    naam: 'KP8: extra bij een studiebekrachtiging',
    code: 'KP8',
    verwacht: /onderdeel 8, ADV-1612: de studiebekrachtiging ".+ heeft "extra"; dat hoort niet in de koppeling/,
    alleen: true,
    breek: (k) => {
      const kop = leesKoppeling(k);
      (erkenningVan(kop, 8, 'ADV-1612').bekrachtigingen as Json[])[0].extra = { categorie: 'Bewijs', led_bewijstype: 'Bewijs van beroepskwalificatie' };
      herstelKoppeling(k, kop);
    },
  },

  // ── Index ──
  {
    naam: 'sha256 van de index',
    code: 'BX1',
    verwacht: /de sha256 komt niet overeen met de bks/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0390-2').status = 'GEANNULEERD';
      schrijf(k.uit, ['index.json'], index);
    },
  },
  {
    naam: 'kop van de index (app, kind, v)',
    code: 'BX1',
    verwacht: /de kop \(app, kind, v\) klopt niet/,
    breek: (k) => {
      const index = leesIndex(k);
      index.kind = 'iets-anders';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'vorm van de index volgens de validator',
    code: 'BX1',
    verwacht: /"vks" is geen geheel getal van 1 tot 8/,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0390-2').vks = 99;
      herstelIndex(k, index);
    },
  },
  {
    naam: 'index.json is geen object',
    code: 'BX1',
    verwacht: /index\.json bevat geen object/,
    breek: (k) => {
      writeFileSync(join(k.uit, 'index.json'), '[]\n');
    },
  },
  {
    naam: 'index zonder lijst bks',
    code: 'BX1',
    verwacht: /"bks" ontbreekt of is geen lijst/,
    breek: (k) => {
      const index = leesIndex(k);
      delete index.bks;
      schrijf(k.uit, ['index.json'], index);
    },
  },
  {
    naam: 'bk in de index die niet op BK_VERSIE past',
    code: 'BX2',
    verwacht: /"BK-12" past niet op BK-0000-0/,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0464-1').bk = 'BK-12';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'sortering van de index',
    code: 'BX2',
    verwacht: new RegExp(`de versies ${INDEX_TWEEDE} en ${INDEX_EERSTE} staan niet gesorteerd`),
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      const r = regelsVan(index);
      [r[0], r[1]] = [r[1], r[0]];
      herstelIndex(k, index);
    },
  },
  {
    naam: 'dubbele versie in de index',
    code: 'BX2',
    verwacht: /de versie BK-0390-2 staat meer dan één keer in de index/,
    breek: (k) => {
      const index = leesIndex(k);
      regelsVan(index).splice(1, 0, { ...regelsVan(index)[0] });
      herstelIndex(k, index);
    },
  },
  {
    naam: 'nummer en versie horen niet bij bk',
    code: 'BX2',
    verwacht: /BK-0464-1: "nummer" "BK-0464" en "versie" 9 horen niet bij de versie in "bk"/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0464-1').versie = 9;
      herstelIndex(k, index);
    },
  },
  {
    naam: 'bestand dat de index noemt ontbreekt',
    code: 'BX3',
    verwacht: /BK-9999-2: het bestand bk\/BK-9999-2\.json kan niet gelezen worden/,
    alleen: true,
    breek: (k) => {
      rmSync(join(k.uit, 'bk', 'BK-9999-2.json'));
    },
  },
  {
    naam: 'bestand van een BK is geen object',
    code: 'BX3',
    verwacht: /BK-9999-2: bk\/BK-9999-2\.json bevat geen object/,
    alleen: true,
    breek: (k) => {
      writeFileSync(join(k.uit, 'bk', 'BK-9999-2.json'), '[]\n');
    },
  },
  {
    naam: 'sha256 in de index tegenover het bestand',
    code: 'BX3',
    verwacht: /BK-0390-2: de regel in de index wijkt af van bk\/BK-0390-2\.json \(sha256\)/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0390-2').sha256 = 'a'.repeat(64);
      herstelIndex(k, index);
    },
  },
  {
    naam: 'aantal in de index tegenover het bestand',
    code: 'BX3',
    verwacht: new RegExp(`BK-0390-2: de regel in de index wijkt af van bk/BK-0390-2\\.json \\(aantal ${AANTAL_0390_2 - 1} ≠ ${AANTAL_0390_2}\\)`),
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0390-2').aantal = AANTAL_0390_2 - 1;
      herstelIndex(k, index);
    },
  },
  {
    naam: 'titel in de index tegenover het bestand',
    code: 'BX3',
    verwacht: /BK-0390-2: de regel in de index wijkt af van bk\/BK-0390-2\.json \(titel "Een andere titel" ≠ "Onthaalmedewerker"\)/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0390-2').titel = 'Een andere titel';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'opgehaald in de index tegenover het bestand',
    code: 'BX3',
    verwacht: /BK-0390-2: de regel in de index wijkt af van bk\/BK-0390-2\.json \(opgehaald "2026-10-11T00:00:00Z" ≠ "2026-10-10T00:00:00Z"\)/,
    alleen: true,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0390-2').opgehaald = '2026-10-11T00:00:00Z';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'indexregel zonder bestand en zonder nietGevonden (BX3)',
    code: 'BX3',
    verwacht: /BK-9999-3: zonder "bestand" staat er precies één van "nietGevonden" en "onbruikbaar"/,
    breek: (k) => {
      const index = leesIndex(k);
      delete regelVan(index, 'BK-9999-3').nietGevonden;
      herstelIndex(k, index);
    },
  },
  {
    naam: 'bestand in de index wijst naar een ander bestand',
    code: 'BX3',
    verwacht: /BK-0464-1: "bestand" is "bk\/BK-0390-2\.json", maar moet bk\/BK-0464-1\.json zijn/,
    breek: (k) => {
      const index = leesIndex(k);
      regelVan(index, 'BK-0464-1').bestand = 'bk/BK-0390-2.json';
      herstelIndex(k, index);
    },
  },
  {
    naam: 'bestand buiten de index',
    code: 'BX4',
    verwacht: /bk\/BK-0390-9\.json staat in de map, maar niet in de index/,
    alleen: true,
    breek: (k) => {
      cpSync(join(k.uit, 'bk', 'BK-0390-2.json'), join(k.uit, 'bk', 'BK-0390-9.json'));
    },
  },

  // ── BK-bestanden ──
  {
    naam: 'sha256 van een BK-bestand',
    code: 'BB1',
    verwacht: /BK-9999-2: de sha256 komt niet overeen met de inhoud/,
    alleen: true,
    breek: (k) => {
      const b = leesBk(k, 'BK-9999-2');
      b.definitie = `${b.definitie as string} (gewijzigd)`;
      schrijf(k.uit, ['bk', 'BK-9999-2.json'], b);
    },
  },
  {
    naam: 'aantal van het bestand',
    code: 'BB1',
    verwacht: new RegExp(`BK-0390-2: aantal is ${AANTAL_0390_2}, maar er staan ${AANTAL_0390_2 - 1} competenties in`),
    breek: (k) => {
      const b = leesBk(k, 'BK-0390-2');
      competentiesVan(b).pop();
      herstelBk(k, 'BK-0390-2', b, true);
    },
  },
  {
    naam: 'bk tegenover de bestandsnaam',
    code: 'BB1',
    verwacht: /BK-9999-2\.json: "bk" in het bestand is "BK-9999-5", niet gelijk aan de bestandsnaam/,
    breek: (k) => {
      const b = leesBk(k, 'BK-9999-2');
      b.bk = 'BK-9999-5';
      b.versie = 5;
      herstelBk(k, 'BK-9999-2', b);
    },
  },
  {
    naam: 'kind van een BK-bestand',
    code: 'BB1',
    verwacht: /"kind" moet "beroepskwalificatie" zijn/,
    breek: (k) => {
      const b = leesBk(k, 'BK-9999-2');
      b.kind = 'iets-anders';
      herstelBk(k, 'BK-9999-2', b);
    },
  },
  {
    naam: 'vorm van een BK-bestand volgens de validator',
    code: 'BB1',
    verwacht: /"kennis" ontbreekt of is geen lijst/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0464-1');
      delete competentiesVan(b)[2].kennis;
      herstelBk(k, 'BK-0464-1', b);
    },
  },
  {
    naam: 'dubbele competentiecode',
    code: 'BB2',
    verwacht: /BK-9999-2, competentie 2: de competentiecode bkc9999101 staat meer dan één keer in het bestand/,
    breek: (k) => {
      const b = leesBk(k, 'BK-9999-2');
      const c = competentiesVan(b);
      c[1].id = c[0].id;
      herstelBk(k, 'BK-9999-2', b);
    },
  },
  {
    naam: 'competentiecode die niet op het patroon past',
    code: 'BB2',
    verwacht: /BK-0390-2, competentie 3: de competentiecode "bkc 9039003" past niet op/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0390-2');
      competentiesVan(b)[2].id = 'bkc 9039003';
      herstelBk(k, 'BK-0390-2', b);
    },
  },
  {
    naam: 'tekst van een competentie is leeg na omzetting',
    code: 'BB2',
    verwacht: /BK-0390-2, competentie 4: de tekst is leeg na het omzetten van HTML/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0390-2');
      competentiesVan(b)[3].tekst = '<p>&nbsp;</p><br/>';
      herstelBk(k, 'BK-0390-2', b);
    },
  },
  {
    naam: 'kennis is leeg na omzetting',
    code: 'BB2',
    verwacht: /BK-0390-2, competentie 5: kennis 1 is leeg na het omzetten van HTML/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0390-2');
      ((competentiesVan(b)[4].kennis as Json[])[0]).tekst = '<br>';
      herstelBk(k, 'BK-0390-2', b);
    },
  },
  {
    naam: 'vaardigheid is leeg na omzetting',
    code: 'BB2',
    verwacht: /BK-0390-2, competentie 6: vaardigheid 1 is leeg na het omzetten van HTML/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0390-2');
      ((competentiesVan(b)[5].vaardigheden as Json[])[0]).tekst = '<p> </p>';
      herstelBk(k, 'BK-0390-2', b);
    },
  },
  {
    naam: 'doelcode niet uniek',
    code: 'BB3',
    verwacht: /BK-9999-2: 2 competenties, maar 1 doelcode: de doelcodes zijn niet uniek/,
    breek: (k) => {
      // Twee competenties met dezelfde code krijgen samen één doelcode.
      const b = leesBk(k, 'BK-9999-2');
      const c = competentiesVan(b);
      c[1].id = c[0].id;
      herstelBk(k, 'BK-9999-2', b);
    },
  },
  {
    naam: 'BB4 streng: een competentie zonder nr',
    code: 'BB4',
    verwacht: /BK-0464-1: 1 zonder geheel nr \(de doelcode volgt dan de plaats in het bestand\)/,
    opties: { nrStreng: true },
    info: /BK-0464-1: 1 zonder geheel nr/,
    breek: (k) => {
      // De laatste competentie: een competentie zonder nr hoort achteraan (de validator eist die volgorde).
      const b = leesBk(k, 'BK-0464-1');
      const c = competentiesVan(b);
      delete c[c.length - 1].nr;
      herstelBk(k, 'BK-0464-1', b);
    },
  },
  {
    naam: 'BB4 streng: een nr dat twee keer voorkomt',
    code: 'BB4',
    verwacht: /BK-0390-2: nr 1 komt meer dan één keer voor/,
    opties: { nrStreng: true },
    info: /BK-0390-2: nr 1 komt meer dan één keer voor/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0390-2');
      competentiesVan(b)[1].nr = 1;
      herstelBk(k, 'BK-0390-2', b);
    },
  },
  {
    naam: 'BB5 streng: een HTML-tag in een tekst',
    code: 'BB5',
    verwacht: /BK-0464-1: 1 tekst bevat een HTML-tag/,
    opties: { tekstStreng: true },
    info: /BK-0464-1: 1 tekst/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0464-1');
      ((competentiesVan(b)[1].kennis as Json[])[0]).tekst = 'Kennis van <i>veilig</i> werken';
      herstelBk(k, 'BK-0464-1', b);
    },
  },
  {
    naam: 'BB5 streng: een HTML-tag in de tekst van een competentie',
    code: 'BB5',
    verwacht: /BK-0464-1: 1 tekst bevat een HTML-tag/,
    opties: { tekstStreng: true },
    info: /BK-0464-1: 1 tekst/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0464-1');
      competentiesVan(b)[2].tekst = 'Werkt <strong>veilig</strong>';
      herstelBk(k, 'BK-0464-1', b);
    },
  },
  {
    naam: 'BB5 streng: een HTML-tag in een vaardigheid',
    code: 'BB5',
    verwacht: /BK-0464-1: 1 tekst bevat een HTML-tag/,
    opties: { tekstStreng: true },
    info: /BK-0464-1: 1 tekst/,
    breek: (k) => {
      const b = leesBk(k, 'BK-0464-1');
      ((competentiesVan(b)[3].vaardigheden as Json[])[0]).tekst = 'Past <b>toe</b>';
      herstelBk(k, 'BK-0464-1', b);
    },
  },
];

/** De tien gebroken invarianten die het ontwerp (§ 23.5.11) minstens in de zelftest eist. */
const VERPLICHT = [
  'sha256 van de koppeling',
  'sortering van de onderdelen',
  'bestand buiten de index',
  'BK van een erkenning van nu zonder indexregel',
  'dubbele competentiecode',
  'bk tegenover de bestandsnaam',
  'onderdeel dat niet in de matrix staat',
  'aantal van het bestand',
  'ongeldige status',
  'doelcode niet uniek',
];

describe('zelftest: kapotte kopieën van de fixtures', () => {
  const gevonden = new Map<string, string>();

  it.each(CASES.map((c) => [c.naam, c] as const))('vindt: %s', (_naam, c) => {
    const k = maakKopie();
    c.breek(k);
    const { fouten } = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, ...c.opties });
    const vanCode = fouten.filter((t) => t.startsWith(`${c.code}: `));
    const alle = `fouten: ${fouten.join(' | ')}`;
    expect(vanCode.some((t) => c.verwacht.test(t)), `een ${c.code}-melding die past op ${String(c.verwacht)}; ${alle}`).toBe(true);
    if (c.alleen === true) expect(vanCode.filter((t) => !c.verwacht.test(t)), `meldingen van ${c.code} buiten de bedoelde controle; ${alle}`).toEqual([]);
    gevonden.set(c.naam, c.code);
  });

  it('vindt de tien gebroken invarianten uit het ontwerp en minstens tien verschillende codes', () => {
    for (const naam of VERPLICHT) expect(gevonden.has(naam), `"${naam}" is gevonden`).toBe(true);
    expect(new Set(gevonden.values()).size).toBeGreaterThanOrEqual(10);
  });

  it('elke code van KP1 tot BB5 heeft minstens één case', () => {
    const codes = new Set(CASES.map((c) => c.code));
    for (const code of CODE_VOLGORDE.filter((c) => c !== 'BC1')) expect(codes.has(code), `een case voor ${code}`).toBe(true);
  });

  it('de cases hebben unieke namen', () => {
    expect(new Set(CASES.map((c) => c.naam)).size).toBe(CASES.length);
  });
});

describe('zelftest: wat geen fout mag zijn', () => {
  it('een BK die alleen in een afgelopen erkenning staat, hoeft niet in de index (KP5)', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    // ADV-0917 loopt af op de ophaaldag zelf: ze staat terecht in de koppeling (KP8), en BK-0390-1 staat niet in de index.
    erkenningenVanRecord(kop, 8).unshift(afgelopenErkenning('2026-10-10'));
    herstelKoppeling(k, kop);
    expect(regelsVan(leesIndex(k)).some((r) => r.bk === 'BK-0390-1')).toBe(false);
    // Een dag later is ze afgelopen: geen fout.
    expect(controleerKwalificatieMap(k.uit, k.structuur, { vandaag: '2026-10-11' }).fouten).toEqual([]);
    // Op de ophaaldag gold ze nog: dan hoort BK-0390-1 wel in de index.
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten).toEqual([
      'KP5: BK-0390-1 hoort bij een erkenning van nu of later (onderdeel 8, ADV-0917), maar staat niet in de index.',
    ]);
  });

  it('KP8: een erkenning die op de ophaaldag zelf of later afloopt, is in orde; de dag is die van het eigen record', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    erkenningenVanRecord(kop, 8).unshift(afgelopenErkenning('2026-10-10'));
    herstelKoppeling(k, kop);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { vandaag: '2026-10-11' }).fouten).toEqual([]);
    // Met een einde in 2024 is ze in orde voor een record van een run uit 2024, niet voor een record van 2026.
    const kop2 = leesKoppeling(k);
    erkenningVan(kop2, 8, 'ADV-0917').einddatum = '2024-08-31';
    recordVan(kop2, 8).opgehaald = '2024-08-31T23:59:59Z';
    herstelKoppeling(k, kop2);
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten).toEqual([]);
    recordVan(kop2, 8).opgehaald = '2024-09-01T00:00:00Z';
    herstelKoppeling(k, kop2);
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten).toEqual([
      'KP8: onderdeel 8, ADV-0917: de erkenning liep af op 2024-08-31, vóór de ophaaldatum 2024-09-01; ze hoort niet in de koppeling.',
    ]);
  });

  it('KP8: de oude vorm (vóór K8) haalt de validator van de app (KP1), maar de datatest eist de slanke vorm', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    for (const r of recordsVan(kop)) {
      for (const e of lijstVan(r.erkenningen) as Json[]) {
        for (const b of e.bks as Json[]) b.extra = { volledigheid: 'Volledig' };
        for (const b of e.bekrachtigingen as Json[]) b.extra = { categorie: 'Bewijs' };
      }
    }
    erkenningenVanRecord(kop, 8).unshift(afgelopenErkenning('2024-08-31'));
    herstelKoppeling(k, kop);
    expect(valideerKoppelingBestand(kop)).toEqual([]);
    const { fouten } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    expect(fouten.length).toBeGreaterThan(0);
    expect(fouten.filter((t) => !t.startsWith('KP8: '))).toEqual([]);
    expect(fouten).toContain('KP8: onderdeel 8, ADV-0917: de erkenning liep af op 2024-08-31, vóór de ophaaldatum 2026-10-10; ze hoort niet in de koppeling.');
    expect(fouten.some((t) => /heeft "extra"/.test(t))).toBe(true);
  });

  it('KP5 rekent met de datum: een erkenning van later vraagt haar BK, een erkenning die afgelopen is niet meer', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    // ADV-1999 begint op 2027-09-01 en loopt af op 2027-12-31.
    erkenningenVanRecord(kop, 10)[1].einddatum = '2027-12-31';
    herstelKoppeling(k, kop);
    const index = leesIndex(k);
    index.bks = regelsVan(index).filter((r) => r.bk !== 'BK-9999-2');
    herstelIndex(k, index);
    rmSync(join(k.uit, 'bk', 'BK-9999-2.json'));
    // Op 2026-10-10 is ze een erkenning van later: BK-9999-2 moet in de index staan.
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten.filter((t) => t.startsWith('KP5:'))).toHaveLength(1);
    // Op 2028-01-01 is ze afgelopen: de BK is niet meer nodig (de bestanden wissen niets, dus een BK die ooit gekoppeld was, blijft ook staan).
    expect(controleerKwalificatieMap(k.uit, k.structuur, { vandaag: '2028-01-01' }).fouten.filter((t) => t.startsWith('KP5:'))).toEqual([]);
  });

  it('een versie met nietMeerGekoppeld of nietMeerInBron (en een bestand) is in orde, zolang geen erkenning de versie nog noemt', () => {
    const k = maakKopie();
    // BK-9999-2 staat alleen in de toekomstige erkenning ADV-1999. Valt die BK uit de koppeling, dan noemt geen
    // enkele erkenning de versie nog; haar bestand blijft staan (niets wissen) en de index krijgt de datum.
    const kop = leesKoppeling(k);
    expect(JSON.stringify(kop).split('BK-9999-2')).toHaveLength(2);
    erkenningenVanRecord(kop, 10)[1].bks = [];
    herstelKoppeling(k, kop);
    const index = leesIndex(k);
    regelVan(index, 'BK-9999-2').nietMeerGekoppeld = '2026-10-01';
    regelVan(index, 'BK-0464-1').nietMeerInBron = '2026-10-02';
    herstelIndex(k, index);
    const { fouten, info } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    expect(fouten).toEqual([]);
    expect(info.find((t) => t.startsWith('BX1:'))).toMatch(/, 1 niet meer gekoppeld\.$/);
  });

  it('een onbruikbare versie zonder bestand (onbruikbaar: true) is in orde', () => {
    const k = maakKopie();
    const index = leesIndex(k);
    const regel = regelVan(index, 'BK-9999-3');
    delete regel.nietGevonden;
    regel.onbruikbaar = true;
    herstelIndex(k, index);
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten).toEqual([]);
  });

  it('een record "niet-gevonden" met de laatst bekende erkenningen en een record "nog-niet-opgehaald" zijn in orde', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    // Onderdeel 9 was opgehaald; nu twee keer 404: de erkenningen blijven, met nietMeerInBron.
    const r = recordVan(kop, 9);
    r.status = 'niet-gevonden';
    r.nietMeerInBron = '2026-10-10';
    herstelKoppeling(k, kop);
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten).toEqual([]);
  });

  it('een andere matrix (matrixSha256 verschilt) geeft geen fout bij KP3, maar wel info; een onderdeel dat de matrix niet meer kent blijft een fout (KP2)', () => {
    const k = maakKopie();
    const m = leesMatrixKopie(k);
    // De matrix kreeg sindsdien een nieuw onderdeel (een run met alleen de studierichtingen).
    (m.onderdelen as Json[]).push({ ...(m.onderdelen as Json[])[0], nummer: 99998 });
    m.sha256 = sha256Van({ groepen: m.groepen, onderdelen: m.onderdelen });
    m.aantalOnderdelen = (m.onderdelen as Json[]).length;
    schrijf(k.structuur, ['studierichtingen.json'], m);
    const { fouten, info } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    expect(fouten.filter((t) => t.startsWith('KP3:'))).toEqual([]);
    expect(info.find((t) => t.startsWith('KP3:'))).toMatch(/matrixSha256 in de koppeling is niet gelijk aan de sha256 van de matrix .*: 1 onderdeel zonder record/);
    // Zelfde matrix, maar zonder het onderdeel 8: de koppeling kent dan een onderdeel dat de matrix niet kent.
    const m2 = leesMatrixKopie(k);
    m2.onderdelen = (m2.onderdelen as Json[]).filter((o) => o.nummer !== 8);
    m2.sha256 = sha256Van({ groepen: m2.groepen, onderdelen: m2.onderdelen });
    schrijf(k.structuur, ['studierichtingen.json'], m2);
    expect(controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES).fouten.some((t) => /^KP2: onderdeel 8 staat niet in de matrix/.test(t))).toBe(true);
  });

  /**
   * Een kopie met een nieuwere matrix, zoals na een run met alleen de studierichtingen of `zonder-beroepskwalificaties`:
   * onderdeel 129 kreeg er de erkenning ADV-2000 bij (een nieuw schooljaar), de koppeling bleef zoals ze was. De
   * matrix zelf is in orde; alleen `matrixSha256` van de koppeling hoort nog bij de oude matrix.
   */
  function metNieuwereMatrix(): Kopie {
    const k = maakKopie();
    const m = leesMatrixKopie(k);
    const o = (m.onderdelen as Json[]).find((x) => x.nummer === 129);
    if (o === undefined) throw new Error('De matrix van de fixtures heeft geen onderdeel 129.');
    (o.erkenningen as Json[]).push({ nummer: 'ADV-2000', status: 'ERKEND', begindatum: '2026-09-01' });
    ((o.extra as Json).structuuronderdeel_details as Json[]).push({ status: { omschrijving: 'Erkend' } });
    m.sha256 = sha256Van({ groepen: m.groepen, onderdelen: m.onderdelen });
    schrijf(k.structuur, ['studierichtingen.json'], m);
    expect(valideerMatrixBestand(m)).toEqual([]);
    expect(leesKoppeling(k).matrixSha256).not.toBe(m.sha256);
    return k;
  }

  it('een andere matrix (matrixSha256 verschilt) geeft ook bij KP7 streng geen fout, maar wel info met de reden; bij dezelfde matrix blijft hetzelfde ADV-verschil een fout', () => {
    const k = metNieuwereMatrix();
    const anders = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true });
    // ADV-1999 (onderdeel 10, de fixtures) en ADV-2000 (onderdeel 129, de nieuwere matrix) zijn bij dezelfde matrix een fout.
    expect(anders.fouten).toEqual([]);
    const kp7 = anders.info.filter((t) => t.startsWith('KP7:'));
    expect(kp7).toHaveLength(2);
    expect(kp7[0]).toMatch(/^KP7: opgehaalde onderdelen met andere ADV-nummers dan de matrix: 2 van de \d+ \(bv\. onderdeel 10; onderdeel 129\)\.$/);
    expect(kp7[1]).toBe(
      'KP7: matrixSha256 in de koppeling is niet gelijk aan de sha256 van de matrix: de matrix is nieuwer dan de koppeling (een run met alleen de studierichtingen of zonder de beroepskwalificaties). 2 ADV-verschillen zijn daarom geen fout (bv. onderdeel 10: ADV-1999 alleen in de koppeling; onderdeel 129: ADV-2000 alleen in de matrix); een run met onderdelen = alles zet de koppeling en de matrix weer gelijk.',
    );
    expect(anders.info.some((t) => t.startsWith('KP3: matrixSha256 in de koppeling is niet gelijk'))).toBe(true);
    // Mild zegt de telling het al: de uitleg hoort alleen bij wat streng een fout zou zijn.
    const mild = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    expect(mild.fouten).toEqual([]);
    expect(mild.info.filter((t) => t.startsWith('KP7:'))).toEqual([kp7[0]]);

    // Dezelfde bestanden, maar de koppeling hoort nu bij deze matrix (alleen matrixSha256 verandert): weer streng.
    const kop = leesKoppeling(k);
    kop.matrixSha256 = leesMatrixKopie(k).sha256;
    herstelKoppeling(k, kop);
    const zelfde = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true });
    expect(zelfde.fouten).toEqual([
      'KP7: onderdeel 10: ADV-1999 staat in de koppeling, maar niet in de matrix.',
      `KP7: onderdeel 129: ADV-2000 staat in de matrix, maar niet in de koppeling. ${oorzaakOntbrekend('2026-10-10')}`,
    ]);
    expect(zelfde.info.filter((t) => t.startsWith('KP7:'))).toEqual([kp7[0]]);
    expect(zelfde.info.some((t) => t.startsWith('KP3: matrixSha256'))).toBe(false);
  });

  it('zonder matrixSha256 in de koppeling doet KP7 wat KP3 doet (info), en blijft de controle rood door KP1', () => {
    // Bij de fixtures zelf, met de matrix waar ze bij horen: alleen het veld ontbreekt.
    const k = maakKopie();
    const kop = leesKoppeling(k);
    delete kop.matrixSha256;
    herstelKoppeling(k, kop);
    const { fouten, info } = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true });
    expect(fouten).toEqual(['KP1: Kop: "matrixSha256" is geen sha256 (64 hex-tekens).']);
    expect(info.some((t) => t.startsWith('KP3: matrixSha256 in de koppeling is niet gelijk'))).toBe(true);
    // De zin zegt niet dat de matrix nieuwer is: dat is zonder matrixSha256 niet te weten.
    expect(info.filter((t) => t.startsWith('KP7:')).slice(1)).toEqual([
      'KP7: de koppeling noemt geen geldige matrixSha256 (zie KP1): het is niet te zeggen bij welke matrix ze hoort. 1 ADV-verschil is daarom geen fout (bv. onderdeel 10: ADV-1999 alleen in de koppeling); een run met onderdelen = alles zet de koppeling en de matrix weer gelijk.',
    ]);
  });

  it('de strenge regels KP6, KP7, BB4 en BB5 geven zonder schakelaar alleen een melding', () => {
    for (const naam of [
      'KP6 streng: een gewoon onderdeel van de 3de graad A zonder BK',
      'KP7 streng: een ADV-nummer dat de matrix niet kent',
      'KP7 streng: een ADV-nummer van de matrix dat in de koppeling ontbreekt',
      'KP7 streng: een erkenning die volgens de matrix pas na de ophaaldatum afliep, hoort er nog in',
      'BB4 streng: een competentie zonder nr',
      'BB4 streng: een nr dat twee keer voorkomt',
      'BB5 streng: een HTML-tag in een tekst',
      'BB5 streng: een HTML-tag in de tekst van een competentie',
      'BB5 streng: een HTML-tag in een vaardigheid',
    ]) {
      const c = CASES.find((x) => x.naam === naam) as Case;
      const k = maakKopie();
      c.breek(k);
      const { fouten, info } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
      expect(fouten, naam).toEqual([]);
      expect(info.some((t) => t.startsWith(`${c.code}: `) && (c.info as RegExp).test(t)), `info over ${c.code} die past op ${String(c.info)}; info: ${info.join(' | ')}`).toBe(true);
    }
  });

  it('KP6 telt alleen opgehaalde, geldige, gewone onderdelen: aanloop, afgebouwd, niet opgehaald en een andere soort tellen niet', () => {
    const k = maakKopie();
    maakDerdeGraadA(k);
    // Onderdeel 8 en 565 (aanloop) hebben een BK: in orde, en maar één onderdeel telt.
    const basis = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true });
    expect(basis.fouten).toEqual([]);
    expect(basis.info.find((t) => t.startsWith('KP6:'))).toMatch(/^KP6: .*: 0 van de 1\.$/);
    // Zonder BK bij het aanloopjaar 565: telt niet mee.
    const kop = leesKoppeling(k);
    erkenningVan(kop, 565, 'ADV-1609').bks = [];
    herstelKoppeling(k, kop);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true }).fouten).toEqual([]);
    // Niet opgehaald: telt niet mee.
    const kop2 = leesKoppeling(k);
    const r8 = recordVan(kop2, 8);
    const bewaard = { ...r8 };
    for (const veld of ['opgehaald', 'erkenningen']) delete r8[veld];
    r8.status = 'nog-niet-opgehaald';
    herstelKoppeling(k, kop2);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true }).fouten.filter((t) => t.startsWith('KP6:'))).toEqual([]);
    // Terug, maar met een BK-loze erkenning van nu: nu telt het wel, op de datum van vandaag.
    Object.assign(r8, bewaard);
    ((r8.erkenningen as Json[]).find((e) => e.adv === 'ADV-1612') as Json).bks = [];
    herstelKoppeling(k, kop2);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true }).fouten.filter((t) => t.startsWith('KP6:'))).toHaveLength(1);
    // Afgebouwd (einddatum in het verleden): telt niet meer mee.
    const m = leesMatrixKopie(k);
    const o8 = (m.onderdelen as Json[]).find((o) => o.nummer === 8) as Json;
    o8.einddatum = '2026-08-31';
    herstelMatrix(k, m);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true }).fouten.filter((t) => t.startsWith('KP6:'))).toEqual([]);
    // Niet meer in de bron (nietMeerInBron in de matrix): telt niet meer mee.
    delete o8.einddatum;
    o8.nietMeerInBron = '2026-09-01';
    herstelMatrix(k, m);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true }).fouten.filter((t) => t.startsWith('KP6:'))).toEqual([]);
    // Zonder die datum telt het weer.
    delete o8.nietMeerInBron;
    herstelMatrix(k, m);
    expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true }).fouten.filter((t) => t.startsWith('KP6:'))).toHaveLength(1);
    // Een groep van een andere soort (hier een 7de jaar, type7) met graad 3 en finaliteit A telt niet mee.
    const g = (m.groepen as Json[]).find((x) => x.nummer === 'G-0008') as Json;
    g.type7 = 'BSO_TIJDELIJK';
    herstelMatrix(k, m);
    const zevende = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true });
    expect(zevende.fouten.filter((t) => t.startsWith('KP6:'))).toEqual([]);
    expect(zevende.info.find((t) => t.startsWith('KP6:'))).toMatch(/: 0 van de 0\.$/);
  });

  it('een matrix die zelf niet in orde is, laat KP6 weg met een melding en geeft geen uitzondering', () => {
    const k = maakKopie();
    const m = leesMatrixKopie(k);
    (m.groepen as Json[])[0].nummer = 'G-12';
    herstelMatrix(k, m);
    const { fouten, info } = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, a3Streng: true });
    expect(fouten.some((t) => t.startsWith('KP6:'))).toBe(false);
    expect(info.some((t) => /^KP2: studierichtingen\.json is zelf niet in orde .*KP6 is overgeslagen/.test(t))).toBe(true);
    expect(info.some((t) => t.startsWith('KP6:'))).toBe(false);
  });
});

describe('KP7 en een verouderde matrix (K8)', () => {
  /** Een kopie waarin de matrix ADV-0917 van onderdeel 8 open laat (of tot `einde`); de koppeling hoort bij die matrix. */
  function metMatrixEinde(einde: string | undefined): Kopie {
    const k = maakKopie();
    const m = leesMatrixKopie(k);
    const o = (m.onderdelen as Json[]).find((x) => x.nummer === 8);
    const e = lijstVan(o?.erkenningen).find((x) => isObj(x) && x.nummer === 'ADV-0917');
    if (!isObj(e)) throw new Error('De matrix van de fixtures heeft geen ADV-0917 bij onderdeel 8.');
    if (einde === undefined) delete e.einddatum;
    else e.einddatum = einde;
    herstelMatrix(k, m);
    return k;
  }
  const ADV_1999 = 'KP7: onderdeel 10: ADV-1999 staat in de koppeling, maar niet in de matrix.';

  it('het detail sloot ADV-0917 af vóór het ophalen (K8 liet ze weg), de verouderde matrix noemt ze open: streng een fout die de oorzaak noemt, mild alleen info', () => {
    // Zoals een run met alleen de beroepskwalificaties met een matrix van een maand oud (T2): de koppeling is juist.
    const k = metMatrixEinde(undefined);
    expect(erkenningenVanRecord(leesKoppeling(k), 8).map((e) => e.adv)).not.toContain('ADV-0917');
    const streng = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true });
    expect(streng.fouten).toEqual([
      'KP7: onderdeel 8: ADV-0917 staat in de matrix, maar niet in de koppeling. Zie het rapport van het script: noemt het detail ze niet (onderdelen.advVerschilMetMatrix), of liep ze volgens het detail al af vóór de ophaaldatum 2026-10-10 terwijl de matrix een latere of geen einddatum noemt (onderdelen.erkenningVerschilMetMatrix; K8 laat ze dan weg)? Is de matrix verouderd (een run met alleen de beroepskwalificaties), haal ze dan eerst opnieuw op: onderdelen = alles.',
      ADV_1999,
    ]);
    const mild = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    expect(mild.fouten).toEqual([]);
    expect(mild.info.find((t) => t.startsWith('KP7:'))).toMatch(/: 2 van de \d+ \(bv\. onderdeel 8.*onderdeel 10\)\.$/);
  });

  it('met een ververste matrix die de einddatum kent (vóór de ophaaldatum), is er niets meer aan de hand; op of na de ophaaldatum wel', () => {
    for (const einde of ['2024-08-31', '2026-10-09']) {
      const k = metMatrixEinde(einde);
      expect(controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true }).fouten, einde).toEqual([ADV_1999]);
    }
    // Liep ze volgens de matrix pas op de ophaaldag af, dan gold ze bij het ophalen nog en hoort ze in de koppeling.
    const k = metMatrixEinde('2026-10-10');
    const fouten = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true }).fouten;
    expect(fouten).toHaveLength(2);
    expect(fouten[0]).toMatch(/^KP7: onderdeel 8: ADV-0917 staat in de matrix, maar niet in de koppeling\. Zie het rapport van het script: .*vóór de ophaaldatum 2026-10-10 /);
  });

  it('zonder geldige ophaaldatum noemt de melding "het ophalen"', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    delete recordVan(kop, 8).opgehaald;
    herstelKoppeling(k, kop);
    const fouten = controleerKwalificatieMap(k.uit, k.structuur, { ...FIXTURE_OPTIES, kruisStreng: true }).fouten.filter((t) => t.startsWith('KP7: onderdeel 8:'));
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/^KP7: onderdeel 8: ADV-0917 staat in de matrix, maar niet in de koppeling\. .*af vóór het ophalen terwijl/);
  });
});

describe('zelftest: de controle gooit nooit', () => {
  const niemandsObject = [null, 5];
  const geenUitzondering = (fouten: readonly string[]) => expect(fouten.filter((t) => t.includes('de controle zelf faalde'))).toEqual([]);

  it('een koppeling met records die geen object zijn (null, een getal) geeft fouten en geen uitzondering', () => {
    const k = maakKopie();
    const kop = leesKoppeling(k);
    recordsVan(kop).push(...(niemandsObject as unknown as Json[]));
    herstelKoppeling(k, kop);
    const { fouten } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    geenUitzondering(fouten);
    expect(fouten.filter((t) => t.startsWith('KP1: ') && /is geen object/.test(t))).toHaveLength(2);
    expect(fouten.filter((t) => !t.startsWith('KP1: '))).toEqual([]);
  });

  it('een index met regels die geen object zijn (null, een getal) geeft fouten en geen uitzondering', () => {
    const k = maakKopie();
    const index = leesIndex(k);
    regelsVan(index).push(...(niemandsObject as unknown as Json[]));
    herstelIndex(k, index);
    const { fouten } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    geenUitzondering(fouten);
    expect(fouten.filter((t) => t.startsWith('BX1: ') && /is geen object/.test(t))).toHaveLength(2);
    expect(fouten.filter((t) => !t.startsWith('BX1: '))).toEqual([]);
  });

  it('een BK-bestand met competenties die geen object zijn (null, een getal) geeft fouten en geen uitzondering', () => {
    const k = maakKopie();
    const b = leesBk(k, 'BK-9999-2');
    competentiesVan(b).push(...(niemandsObject as unknown as Json[]));
    herstelBk(k, 'BK-9999-2', b);
    const { fouten } = controleerKwalificatieMap(k.uit, k.structuur, FIXTURE_OPTIES);
    geenUitzondering(fouten);
    expect(fouten.some((t) => t.startsWith('BB1: ') && /is geen object/.test(t))).toBe(true);
  });

  it('een uitzondering midden in de controle wordt een fout met de reden en geen uitzondering', () => {
    vi.mocked(valideerKoppelingBestand).mockImplementationOnce(() => {
      throw new Error('nagebootste uitzondering');
    });
    const uitkomst = controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, FIXTURE_OPTIES);
    expect(uitkomst.fouten).toContain('KP1: de controle zelf faalde: nagebootste uitzondering');
    // Wat geen Error is, komt als tekst terug.
    vi.mocked(valideerKoppelingBestand).mockImplementationOnce(() => {
      throw 'een losse tekst';
    });
    expect(controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, FIXTURE_OPTIES).fouten).toContain('KP1: de controle zelf faalde: een losse tekst');
    // Daarna werkt de controle weer gewoon, met het echte gedrag.
    expect(controleerKwalificatieMap(FIXTURE_UIT, FIXTURE_STRUCTUUR, FIXTURE_OPTIES).fouten).toEqual([]);
  });
});

// ── 4. De doelcodes (BB3) en de hulpfuncties ────────────────────────────────
//
// De doelcodes komen uit `doelcodesVanBestand`, dat ze altijd uniek, kort en met het juiste voorvoegsel maakt.
// De controle moet ook slagen als dat ooit niet meer zo is: we voeren ze daarom een hand gemaakte tabel.

describe('controleerDoelcodes (BB3)', () => {
  const tabel = (...paren: [string, string][]) => new Map(paren);

  it('een gewone tabel geeft geen enkele fout', () => {
    expect(controleerDoelcodes('BK-0390-2', 2, tabel(['a', 'BK-0390-2.01'], ['b', 'BK-0390-2.02']))).toEqual([]);
  });

  it('twee competenties met dezelfde doelcode', () => {
    expect(controleerDoelcodes('BK-0390-2', 2, tabel(['a', 'BK-0390-2.01'], ['b', 'BK-0390-2.01']))).toEqual(['BK-0390-2: de doelcode BK-0390-2.01 komt meer dan één keer voor: de doelcodes zijn niet uniek.']);
  });

  it('een competentie zonder doelcode', () => {
    expect(controleerDoelcodes('BK-0390-2', 2, tabel(['a', 'BK-0390-2.01']))).toEqual(['BK-0390-2: 2 competenties, maar 1 doelcode: de doelcodes zijn niet uniek, of een competentie heeft er geen.']);
  });

  it('een doelcode van meer dan 60 tekens', () => {
    const lang = `BK-0390-2.${'1'.repeat(51)}`;
    expect(lang).toHaveLength(61);
    expect(controleerDoelcodes('BK-0390-2', 1, tabel(['a', lang]))).toEqual([`BK-0390-2: de doelcode ${lang} is langer dan 60 tekens.`]);
    expect(controleerDoelcodes('BK-0390-2', 1, tabel(['a', lang.slice(0, 60)]))).toEqual([]);
  });

  it('een doelcode met het voorvoegsel van een andere versie', () => {
    expect(controleerDoelcodes('BK-0390-2', 1, tabel(['a', 'BK-0390-3.01']))).toEqual(['BK-0390-2: de doelcode BK-0390-3.01 begint niet met "BK-0390-2.".']);
    expect(controleerDoelcodes('BK-0390-2', 1, tabel(['a', 'BK-0390-2']))).toHaveLength(1);
  });

  it('een doelcode die normalizeGoalCode verandert (kleine letters, dubbele spatie)', () => {
    expect(controleerDoelcodes('BK-0390-2', 1, tabel(['a', 'BK-0390-2.a']))).toEqual(['BK-0390-2: normalizeGoalCode verandert de doelcode BK-0390-2.a in BK-0390-2.A.']);
    expect(controleerDoelcodes('BK-0390-2', 1, tabel(['a', 'BK-0390-2.0  1']))).toHaveLength(1);
  });

  it('de echte doelcodes van de fixtures zijn in orde, met nr en met de terugval op de plaats', () => {
    const metNr = doelcodesVanBestand(leesBk({ uit: FIXTURE_UIT, structuur: FIXTURE_STRUCTUUR }, 'BK-0390-2') as never);
    expect([...metNr.values()].slice(0, 2)).toEqual(['BK-0390-2.01', 'BK-0390-2.02']);
    const zonderNr = doelcodesVanBestand(leesBk({ uit: FIXTURE_UIT, structuur: FIXTURE_STRUCTUUR }, 'BK-9999-1') as never);
    expect([...zonderNr.values()]).toEqual(['BK-9999-1.01', 'BK-9999-1.02', 'BK-9999-1.03']);
  });
});

describe('hulpfuncties van de datatest', () => {
  it('isEchteDatum en isTijdstip', () => {
    expect(isEchteDatum('2024-02-29')).toBe(true);
    expect(isEchteDatum('2023-02-29')).toBe(false);
    expect(isEchteDatum('2026-13-01')).toBe(false);
    expect(isEchteDatum('2026-10-10T00:00:00Z')).toBe(false);
    expect(isEchteDatum(undefined)).toBe(false);
    expect(isTijdstip('2026-10-10T00:00:00Z')).toBe(true);
    expect(isTijdstip('2026-10-10T00:00:00.123Z')).toBe(true);
    expect(isTijdstip('2026-10-10')).toBe(false);
    expect(isTijdstip('2026-02-30T00:00:00Z')).toBe(false);
  });

  it('vandaagUtc geeft een echte datum', () => {
    expect(isEchteDatum(vandaagUtc())).toBe(true);
  });

  it('HTML_TAG ziet tags maar geen entiteiten of een kleiner-dan-teken', () => {
    for (const t of ['<b>x</b>', 'a<br/>b', '<p class="x">y', '</i>']) expect(HTML_TAG.test(t), t).toBe(true);
    for (const t of ['a &amp; b', '3 < 4 en 5 > 2', 'x<5', 'gewone tekst']) expect(HTML_TAG.test(t), t).toBe(false);
  });

  it('leegNaOmzetting: HTML zonder tekst is leeg, een tekst niet', () => {
    for (const t of ['', '   ', '<br>', '<p>&nbsp;</p>', undefined, 5]) expect(leegNaOmzetting(t), String(t)).toBe(true);
    for (const t of ['a', '<b>a</b>', 'x &amp; y']) expect(leegNaOmzetting(t), t).toBe(false);
  });

  it('infoUitvoer: een kopregel, hoogstens 20 meldingen en een teller voor de rest', () => {
    expect(infoUitvoer([])).toBe('');
    expect(infoUitvoer(['KP6: a'])).toBe('beroepskwalificaties: 1 infomelding bij public/leerplannen/kwalificaties\n  KP6: a\n');
    expect(infoUitvoer(['KP6: a', 'BB4: b'])).toBe('beroepskwalificaties: 2 infomeldingen bij public/leerplannen/kwalificaties\n  KP6: a\n  BB4: b\n');
    const exact = infoUitvoer(Array.from({ length: MAX_INFO_REGELS }, (_, n) => `BB4: ${n}`));
    expect(exact.trimEnd().split('\n')).toHaveLength(1 + MAX_INFO_REGELS);
    expect(exact).not.toContain('… en nog');
    const lang = infoUitvoer(Array.from({ length: MAX_INFO_REGELS + 5 }, (_, n) => `BB4: ${n}`));
    const regels = lang.trimEnd().split('\n');
    expect(regels).toHaveLength(1 + MAX_INFO_REGELS + 1);
    expect(regels[regels.length - 1]).toBe('  … en nog 5 meldingen');
  });

  it('samenvatting telt de info per code', () => {
    expect(samenvatting(undefined)).toBe('');
    expect(samenvatting([])).toBe('');
    expect(samenvatting(['KP1: a', 'KP6: b', 'KP6: c', 'BB4: d'])).toBe(' [info: KP1 ×1, KP6 ×2, BB4 ×1]');
  });

  it('Meldingen beperkt elke code en houdt de volgorde van de invarianten aan', () => {
    const m = new Meldingen();
    for (let n = 0; n < MAX_PER_CODE + 5; n++) m.voeg('BB1', `${n}`);
    m.voeg('KP1', 'eerst');
    m.voeg('ZZ9', 'onbekende code, achteraan');
    const lijst = m.lijst();
    expect(lijst[0]).toBe('KP1: eerst');
    expect(lijst).toHaveLength(1 + MAX_PER_CODE + 1 + 1);
    expect(lijst[MAX_PER_CODE + 1]).toBe('BB1: … en nog 5 van dezelfde soort');
    expect(lijst[lijst.length - 1]).toBe('ZZ9: onbekende code, achteraan');
  });

  it('matrixStandVan: alleen een gelijke waarde is "zelfde"; een andere sha256 is "nieuwer"; de rest "onbekend"', () => {
    const sha = 'a'.repeat(64);
    const matrix = (sha256: unknown): MatrixInfo => ({ sha256, onderdelen: new Map() });
    expect(matrixStandVan(sha, matrix(sha))).toBe('zelfde');
    expect(matrixStandVan('b'.repeat(64), matrix(sha))).toBe('nieuwer');
    for (const x of [undefined, null, 5, '', 'abc', 'A'.repeat(64), `${'a'.repeat(63)}g`]) expect(matrixStandVan(x, matrix(sha)), String(x)).toBe('onbekend');
    expect(matrixStandVan(sha, undefined)).toBe('onbekend');
    // Zoals KP3 altijd vergeleek: missen beide de sha256, dan is het "zelfde" (streng); KP1 is dan al rood.
    expect(matrixStandVan(undefined, matrix(undefined))).toBe('zelfde');
  });

  it('Telling bewaart hoogstens drie voorbeelden', () => {
    const t = new Telling();
    expect(t.tekst()).toBe('');
    for (const x of ['a', 'b', 'c', 'd']) t.tel(x);
    expect(t.n).toBe(4);
    expect(t.tekst()).toBe(' (bv. a; b; c)');
  });

  it('de gedeelde schakelaars staan aan sinds G1 stap 4, en gelden alleen voor de echte map', () => {
    // G1 stap 3 telde op de echte data 0 gevallen voor elk van de vier; stap 4 zette ze op true (§ 23.5.13).
    expect([NR_STRENG, TEKST_STRENG, BK_A3_STRENG, ERKENNING_KRUIS_STRENG]).toEqual([true, true, true, true]);
    expect(ECHTE_OPTIES).toEqual({ a3Streng: true, kruisStreng: true, nrStreng: true, tekstStreng: true });
    // De fixtures en de zelftest draaien zonder schakelaars, tenzij een case er een aanzet.
    expect(FIXTURE_OPTIES).toEqual({ vandaag: '2026-10-10' });
  });

  it('de schakelaars en de uitzondering van de fixtures horen bij elkaar: de fixtures zijn het bewijs dat streng werkt', () => {
    for (const code of ['KP6', 'KP7', 'BB4', 'BB5']) expect(CASES.some((c) => c.code === code && c.opties !== undefined), `een strenge case voor ${code}`).toBe(true);
    // Zonder schakelaar is zo'n breuk alleen info: de case zegt welke.
    for (const c of CASES.filter((x) => x.opties !== undefined)) expect(c.info, `de info bij ${c.naam}`).toBeInstanceOf(RegExp);
  });
});

// BC1 (onderdeel 504 in ADV-0842 heeft precies BK-0390-2 en BK-0464-1) staat bij de echte map hierboven; de fixtures
// hebben onderdeel 504 niet.
