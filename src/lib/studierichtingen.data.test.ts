import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { canoniek, type MinimumdoelenIndex, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from './minimumdoelen';
import { soortVanSet } from './minimumdoelenBron';
import {
  GROEP_NUMMER,
  groepnummersVanDoel,
  kruiscontrole,
  soortVanGroep,
  stroomVanEersteGraad,
  valideerMatrixBestand,
  valideerRichtingDoelenBestand,
  valideerRichtingDoelenIndex,
  vergelijkGroepnummer,
  vergelijkNatuurlijk,
  type RichtingDoelenSet,
  type StudierichtingGroep,
  type Structuuronderdeel,
} from './studierichtingen';

// ── Datatest: de studierichtingen en hun koppeling met de minimumdoelen ─────
//
// Docs/STUDIERICHTINGEN.md § 7 en § 8. Dit bestand controleert de bestanden die het ophaalscript
// schrijft (public/leerplannen/structuur/): de matrix, de index van de koppeling en één koppelingsbestand
// per groep. Het is bewust onafhankelijk van het script geschreven, alleen uit de invarianten:
//
//   M1 tot M7  de matrix           I1 tot I5  de index           F1 tot F6  de koppelingsbestanden
//
// Elke melding begint met de code van de invariant ("F2: G-0193: …"). De kern is
// `controleerStructuurMap(uit, minimumdoelen)`. Ze draait op:
//   1. de echte map (alleen als de matrix bestaat; richtingdoelen zonder index of matrix is een harde fout),
//   2. de fixtures in tests/fixtures/structuur/uit (altijd, als positief geval),
//   3. kapotte kopieën van die fixtures in een tijdelijke map (de zelftest): een controle die niets vindt,
//      beschermt niets.
//
// De versieregel (§ 7): de koppeling kent per set een versiemerk (`setSha`, de eerste 16 tekens van de
// sha256 van de set in minimumdoelen/index.json). Alleen als dat merk gelijk is aan het huidige, controleren
// we streng of de nummers in het setbestand staan en of `setAantal` klopt. Is het merk anders, dan is de set
// sindsdien bijgewerkt: dat geeft geen fout maar een melding in `info`. Zo breekt geen volgorde van updates
// (bv. een noodrun met alleen de minimumdoelen) de uitrol. De info wordt teruggegeven, in de testnaam
// samengevat en bij de echte map ook uitgeschreven (`infoUitvoer`, met `process.stdout.write`, hoogstens 20
// regels): eslint verbiedt console in src, en zonder uitvoer leest niemand de melding zelf.

/**
 * F6, kruiscontrole met het ordeningskader in de setbestanden. Staat op false tot de eerste echte run (G1)
 * heeft aangetoond dat de geldige SO-sets 0 verschillen geven. Dan wordt ze true: elk verschil in een geldige
 * set van het gewoon secundair is dan een fout. Zolang ze false is, telt ze alleen mee in `info`.
 */
// Sinds de eerste echte run (9 oktober 2026, PR #6): 0 verschillen op de echte data, dus streng.
const KRUISCONTROLE_STRENG = true;

/**
 * F5, `onderwijssoort` ("Buitengewoon") tegenover de soort uit de setnaam (`soortVanSet`). Staat op false tot
 * G1 heeft aangetoond dat beide altijd samenvallen. Dan wordt ze true: elk verschil is een fout. Zolang ze
 * false is, wordt het verschil alleen geteld.
 */
// Sinds de eerste echte run (9 oktober 2026, PR #6): 0 verschillen op de echte data, dus streng.
const ONDERWIJSSOORT_STRENG = true;

/**
 * M5, de verwijzingen vorige, volgende, voorbereidend en vervolg. Staat op false tot G1 heeft aangetoond dat
 * de echte API ze levert. Is het totaal dan 0, dan hebben we ze verkeerd gelezen. Met true wordt een totaal van
 * 0 een fout. Zolang ze false is, worden ze alleen geteld.
 */
// Sinds de eerste echte run (9 oktober 2026, PR #6): 0 verschillen op de echte data, dus streng.
const HISTORIEK_STRENG = true;

// Elke controle leest tientallen setbestanden; op een trage machine of onder last heeft 5 seconden niet altijd genoeg.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STRUCTUUR_MAP = join(ROOT, 'public', 'leerplannen', 'structuur');
const MINIMUMDOELEN_MAP = join(ROOT, 'public', 'leerplannen', 'minimumdoelen');
const FIXTURE_UIT = join(ROOT, 'tests', 'fixtures', 'structuur', 'uit');

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

/** De sha256 van `canoniek(waarde)`, zoals de datatest van de minimumdoelen het doet. */
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

/** "1ste graad", "2de graad", "3de graad" → "1", "2", "3". Elke andere vorm: onbekend. */
function graadVanSet(t: string | undefined): string | undefined {
  const m = t === undefined ? null : /^([123])(?:ste|de|e)\s+graad$/i.exec(t.trim());
  return m === null ? undefined : m[1];
}

/** De eerste 16 hex-tekens van de sha256 van een set in de index van de minimumdoelen: het versiemerk. */
function merkVan(set: { sha256?: string }): string | undefined {
  return typeof set.sha256 === 'string' ? set.sha256.slice(0, 16) : undefined;
}

const CODE_VOLGORDE = [
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'I1', 'I2', 'I3', 'I4', 'I5', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
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

// ── De controle ─────────────────────────────────────────────────────────────

interface Opties {
  /** Standaard `KRUISCONTROLE_STRENG`. */
  kruisStreng?: boolean;
  /** Standaard `ONDERWIJSSOORT_STRENG`. */
  soortStreng?: boolean;
  /** Standaard `HISTORIEK_STRENG`. */
  historiekStreng?: boolean;
}

interface Uitkomst {
  /** Wat niet klopt (leeg = in orde). Elke regel begint met de code van de invariant. */
  fouten: string[];
  /** Wat opvalt maar niet fout is: het versiemerk, de tellingen van M5, F5 en F6. */
  info: string[];
}

interface GroepInfo {
  nummer: string;
  titel: string | undefined;
  graad: string | undefined;
}

interface MatrixInfo {
  /** `sha256` uit de kop. */
  sha256: unknown;
  groepen: GroepInfo[];
}

const DATUMVELDEN_ONDERDEEL = ['begindatum', 'einddatum', 'laatsteWijziging', 'nietMeerInBron'];

/** M1 tot M7. Geeft `undefined` als de matrix niet gelezen kan worden: dan valt er niets te vergelijken. */
function controleerMatrix(pad: string, f: Meldingen, i: Meldingen, opties: Required<Opties>): MatrixInfo | undefined {
  const gelezen = leesJson(pad);
  if ('fout' in gelezen) {
    f.voeg('M1', `studierichtingen.json kan niet gelezen worden: ${gelezen.fout}.`);
    return undefined;
  }
  const m = gelezen.json;
  if (!isObj(m)) {
    f.voeg('M1', 'studierichtingen.json bevat geen object.');
    return undefined;
  }

  // M1: de kop, de aantallen en de sha256.
  if (m.app !== 'boosterz' || m.kind !== 'studierichtingen' || m.v !== 1) f.voeg('M1', 'de kop (app, kind, v) klopt niet.');
  if (!Array.isArray(m.groepen) || !Array.isArray(m.onderdelen)) {
    f.voeg('M1', '"groepen" of "onderdelen" ontbreekt of is geen lijst.');
    return undefined;
  }
  const groepen = m.groepen as unknown[];
  const onderdelen = m.onderdelen as unknown[];
  if (m.aantalGroepen !== groepen.length) f.voeg('M1', `aantalGroepen is ${toon(m.aantalGroepen)}, maar er staan ${groepen.length} groepen in.`);
  if (m.aantalOnderdelen !== onderdelen.length) f.voeg('M1', `aantalOnderdelen is ${toon(m.aantalOnderdelen)}, maar er staan ${onderdelen.length} onderdelen in.`);
  if (m.sha256 !== sha256Van({ groepen, onderdelen })) f.voeg('M1', 'de sha256 komt niet overeen met de groepen en onderdelen.');

  // M2: gesorteerd en uniek; geldige nummers.
  const groepNummers: string[] = [];
  const groepInfo: GroepInfo[] = [];
  groepen.forEach((g, n) => {
    const nr = isObj(g) ? g.nummer : undefined;
    if (typeof nr !== 'string' || !GROEP_NUMMER.test(nr)) {
      f.voeg('M2', `groep ${n + 1}: het nummer ${toon(nr)} past niet op ${GROEP_NUMMER.source}.`);
      return;
    }
    groepNummers.push(nr);
    const o = g as Json;
    groepInfo.push({
      nummer: nr,
      titel: typeof o.titel === 'string' ? o.titel : undefined,
      graad: typeof o.graad === 'string' ? o.graad : undefined,
    });
  });
  controleerVolgorde(groepNummers, vergelijkGroepnummer, (soort, a, b) =>
    f.voeg('M2', soort === 'dubbel' ? `het groepnummer ${b} staat meer dan één keer in de matrix.` : `de groepen ${a} en ${b} staan niet gesorteerd.`));

  const onderdeelNummers: number[] = [];
  onderdelen.forEach((o, n) => {
    const nr = isObj(o) ? o.nummer : undefined;
    if (!isGeheel(nr)) f.voeg('M2', `onderdeel ${n + 1}: het nummer ${toon(nr)} is geen geheel getal groter dan 0.`);
    else onderdeelNummers.push(nr);
  });
  controleerVolgorde(onderdeelNummers, (a, b) => a - b, (soort, a, b) =>
    f.voeg('M2', soort === 'dubbel' ? `het onderdeel ${b} staat meer dan één keer in de matrix.` : `de onderdelen ${a} en ${b} staan niet gesorteerd.`));

  // M3: onderdeel.groep bestaat; groep.onderdelen noemt precies de onderdelen met die groep.
  const bestaand = new Set(groepNummers);
  const echt = new Map<string, number[]>();
  for (const o of onderdelen) {
    if (!isObj(o) || !isGeheel(o.nummer)) continue;
    if (typeof o.groep !== 'string' || !bestaand.has(o.groep)) {
      f.voeg('M3', `onderdeel ${o.nummer}: de groep ${toon(o.groep)} staat niet in de matrix.`);
      continue;
    }
    const lijst = echt.get(o.groep) ?? [];
    lijst.push(o.nummer);
    echt.set(o.groep, lijst);
  }
  for (const g of groepen) {
    if (!isObj(g) || typeof g.nummer !== 'string' || !bestaand.has(g.nummer)) continue;
    const genoemd = lijstVan(g.onderdelen);
    const verwacht = echt.get(g.nummer) ?? [];
    const teVeel = genoemd.filter((n) => !verwacht.includes(n as number));
    const teWeinig = verwacht.filter((n) => !genoemd.includes(n));
    if (teVeel.length > 0) f.voeg('M3', `groep ${g.nummer}: noemt ${teVeel.map(toon).join(', ')}, maar dat hoort niet bij deze groep.`);
    if (teWeinig.length > 0) f.voeg('M3', `groep ${g.nummer}: ${teWeinig.join(', ')} hoort bij deze groep, maar staat niet in "onderdelen".`);
    controleerVolgorde(genoemd.filter(isGeheel), (a, b) => a - b, (soort, a, b) =>
      f.voeg('M2', `groep ${g.nummer}: "onderdelen" ${soort === 'dubbel' ? `noemt ${b} twee keer` : `staat niet gesorteerd (${a} voor ${b})`}.`));
  }

  // M4: geldige datums. Een einddatum vóór de begindatum mag: er zijn geannuleerde 7de jaren.
  const datum = (plaats: string, v: unknown, veld: string) => {
    if (v !== undefined && !isEchteDatum(v)) f.voeg('M4', `${plaats}: "${veld}" ${toon(v)} is geen geldige datum (JJJJ-MM-DD).`);
  };
  for (const g of groepen) if (isObj(g)) datum(`groep ${toon(g.nummer)}`, g.nietMeerInBron, 'nietMeerInBron');
  for (const o of onderdelen) {
    if (!isObj(o)) continue;
    const plaats = `onderdeel ${toon(o.nummer)}`;
    for (const veld of DATUMVELDEN_ONDERDEEL) datum(plaats, o[veld], veld);
    for (const lj of lijstVan(o.leerjaren)) {
      if (!isObj(lj)) continue;
      datum(`${plaats}, leerjaar ${toon(lj.code)}`, lj.begindatum, 'begindatum');
      datum(`${plaats}, leerjaar ${toon(lj.code)}`, lj.einddatum, 'einddatum');
    }
    for (const e of lijstVan(o.erkenningen)) {
      if (!isObj(e)) continue;
      datum(`${plaats}, erkenning ${toon(e.nummer)}`, e.begindatum, 'begindatum');
      datum(`${plaats}, erkenning ${toon(e.nummer)}`, e.einddatum, 'einddatum');
    }
  }

  // M5: de verwijzingen worden geteld. Staan er na G1 geen in de echte data, dan lezen we ze verkeerd.
  const VELDEN_HISTORIEK = ['vorige', 'volgende', 'voorbereidend', 'vervolg'];
  const perVeld = new Map<string, number>(VELDEN_HISTORIEK.map((v) => [v, 0]));
  const onbekend = new Telling();
  const bekendeOnderdelen = new Set(onderdeelNummers);
  for (const o of onderdelen) {
    if (!isObj(o)) continue;
    for (const veld of VELDEN_HISTORIEK) {
      for (const verwijzing of lijstVan(o[veld])) {
        perVeld.set(veld, (perVeld.get(veld) ?? 0) + 1);
        if (!bekendeOnderdelen.has(verwijzing as number)) onbekend.tel(`onderdeel ${toon(o.nummer)} → ${toon(verwijzing)}`);
      }
    }
  }
  const totaalHistoriek = [...perVeld.values()].reduce((a, b) => a + b, 0);
  i.voeg('M5', `${totaalHistoriek} verwijzingen (${VELDEN_HISTORIEK.map((v) => `${v} ${perVeld.get(v)}`).join(', ')}), ${onbekend.n} naar een onderdeel dat niet in de matrix staat${onbekend.tekst()}.`);
  if (opties.historiekStreng && totaalHistoriek === 0) f.voeg('M5', 'de matrix bevat geen enkele verwijzing (vorige, volgende, voorbereidend, vervolg): de API levert ze wel.');

  // M6: de vorm, volgens de validator van de module.
  const vormfouten = valideerMatrixBestand(m);
  for (const t of vormfouten) f.voeg('M6', t);

  // M7: elke gewone groep van de 1ste graad heeft een stroom. Alleen als de vorm in orde is: anders is de
  // indeling in soorten niet betrouwbaar.
  if (vormfouten.length === 0) {
    const alleOnderdelen = onderdelen as Structuuronderdeel[];
    for (const g of groepen as StudierichtingGroep[]) {
      if (g.graad !== '1' || soortVanGroep(g, alleOnderdelen) !== 'gewoon') continue;
      if (stroomVanEersteGraad(g.titel) === undefined) f.voeg('M7', `groep ${g.nummer} ("${g.titel}") is een gewone groep van de 1ste graad, maar de titel noemt geen stroom (A of B).`);
    }
  }

  return { sha256: m.sha256, groepen: groepInfo };
}

interface SetGeladen {
  ids: Set<string>;
  doelen: { id?: string; extra?: Record<string, unknown> }[];
}

const INDEX_STATUSSEN = ['gekoppeld', 'geen', 'nog-niet-opgehaald'];
const INDEX_METHODES = ['api', 'graad-en-stroom'];
const BESTANDSNAAM = /^G-\d{4,6}\.json$/;

/** I1 tot I5 en F1 tot F6. */
function controleerKoppeling(uit: string, minimumdoelen: string, matrix: MatrixInfo, f: Meldingen, i: Meldingen, opties: Required<Opties>): void {
  const map = join(uit, 'richtingdoelen');
  const indexPad = join(map, 'index.json');
  const gelezen = leesJson(indexPad);
  if ('fout' in gelezen) {
    f.voeg('I2', `richtingdoelen/index.json kan niet gelezen worden (${gelezen.fout}): er hoort één regel per groep in te staan.`);
    return;
  }
  const index = gelezen.json;
  if (!isObj(index)) {
    f.voeg('I2', 'richtingdoelen/index.json bevat geen object.');
    return;
  }

  // I1
  if (index.matrixSha256 !== matrix.sha256) f.voeg('I1', 'matrixSha256 in de index is niet gelijk aan de sha256 van de matrix.');

  // De index van de minimumdoelen: de versiemerken en de setbestanden.
  const mdSets = new Map<string, MinimumdoelenIndexSet>();
  const mdGelezen = leesJson(join(minimumdoelen, 'index.json'));
  let mdBeschikbaar = false;
  if ('fout' in mdGelezen) f.voeg('F2', `de index van de minimumdoelen kan niet gelezen worden (${mdGelezen.fout}): de sets kunnen niet nagekeken worden.`);
  else if (!isObj(mdGelezen.json) || !Array.isArray(mdGelezen.json.sets)) f.voeg('F2', 'de index van de minimumdoelen heeft een onverwachte vorm.');
  else {
    mdBeschikbaar = true;
    for (const s of mdGelezen.json.sets as MinimumdoelenIndexSet[]) if (isObj(s) && typeof s.id === 'string') mdSets.set(s.id, s);
  }
  const setCache = new Map<string, SetGeladen | null>();
  const laadSet = (id: string): SetGeladen | undefined => {
    const bekend = setCache.get(id);
    if (bekend !== undefined) return bekend ?? undefined;
    const ingang = mdSets.get(id);
    let uitkomst: SetGeladen | null = null;
    if (ingang !== undefined && typeof ingang.bestand === 'string' && /^ODS_\d+\.json$/.test(ingang.bestand)) {
      const g = leesJson(join(minimumdoelen, ingang.bestand));
      if ('fout' in g || !isObj(g.json) || !Array.isArray(g.json.doelen)) {
        f.voeg('F2', `${id}: het setbestand ${ingang.bestand} kan niet gelezen worden.`);
      } else {
        const doelen = (g.json.doelen as unknown[]).filter(isObj) as SetGeladen['doelen'];
        uitkomst = { ids: new Set(doelen.map((d) => d.id).filter((x): x is string => typeof x === 'string')), doelen };
      }
    } else if (ingang !== undefined) {
      f.voeg('F2', `${id}: de index van de minimumdoelen noemt geen bruikbaar bestand.`);
    }
    setCache.set(id, uitkomst);
    return uitkomst ?? undefined;
  };

  // I3 (de vorm van de index) en I2 (één regel per groep, gesorteerd).
  for (const t of valideerRichtingDoelenIndex(index)) f.voeg('I3', t);
  const regels: Json[] = [];
  lijstVan(index.groepen).forEach((r, n) => {
    if (!isObj(r) || typeof r.groep !== 'string') f.voeg('I2', `regel ${n + 1}: heeft geen groep.`);
    else regels.push(r);
  });
  const regelGroepen = regels.map((r) => r.groep as string);
  controleerVolgorde(regelGroepen, vergelijkGroepnummer, (soort, a, b) =>
    f.voeg('I2', soort === 'dubbel' ? `de index heeft twee regels voor ${b}.` : `de regels ${a} en ${b} staan niet gesorteerd.`));
  const inMatrix = new Map(matrix.groepen.map((g) => [g.nummer, g]));
  const inIndex = new Set(regelGroepen);
  const zonderRegel = matrix.groepen.filter((g) => !inIndex.has(g.nummer)).map((g) => g.nummer);
  const zonderGroep = regelGroepen.filter((g) => !inMatrix.has(g));
  if (zonderRegel.length > 0) f.voeg('I2', `${zonderRegel.length} groepen uit de matrix hebben geen regel in de index (${zonderRegel.slice(0, 5).join(', ')}).`);
  if (zonderGroep.length > 0) f.voeg('I2', `${zonderGroep.length} regels in de index horen bij een groep die niet in de matrix staat (${zonderGroep.slice(0, 5).join(', ')}).`);

  // Verzamelingen voor de versiemerken (F2), de soort (F5) en de kruiscontrole (F6).
  const anderMerk = new Telling();
  let nummersWeg = 0;
  let gelijkMerk = 0;
  const soortVerschil = new Map<string, string>();
  const soortGezien = new Set<string>();
  const koppeling = new Map<string, RichtingDoelenSet[]>();
  const setDoelen = new Map<string, SetGeladen['doelen']>();

  const bestandenInIndex = new Set<string>();
  for (const regel of regels) {
    const groep = regel.groep as string;
    const status = regel.status;
    const methodeRegel = regel.methode;
    const matrixGroep = inMatrix.get(groep);

    // I3: status en methode; graad-en-stroom alleen in de 1ste graad.
    if (typeof status !== 'string' || !INDEX_STATUSSEN.includes(status)) f.voeg('I3', `${groep}: de status ${toon(status)} is onbekend.`);
    if (status === 'gekoppeld') {
      if (typeof methodeRegel !== 'string' || !INDEX_METHODES.includes(methodeRegel)) f.voeg('I3', `${groep}: de methode ${toon(methodeRegel)} is onbekend.`);
      if (methodeRegel === 'graad-en-stroom' && matrixGroep !== undefined && matrixGroep.graad !== '1') {
        f.voeg('I3', `${groep}: de methode graad-en-stroom hoort alleen bij de 1ste graad, maar de groep is graad ${toon(matrixGroep.graad)}.`);
      }
    }

    // I4: de regel tegenover het bestand.
    const bestandsnaam = regel.bestand;
    if (bestandsnaam !== undefined) {
      if (typeof bestandsnaam !== 'string' || !BESTANDSNAAM.test(bestandsnaam)) {
        f.voeg('I4', `${groep}: de bestandsnaam ${toon(bestandsnaam)} is niet bruikbaar.`);
        continue;
      }
      bestandenInIndex.add(bestandsnaam);
    }
    if (status === 'nog-niet-opgehaald') {
      if (bestandsnaam !== undefined) f.voeg('I4', `${groep}: "nog-niet-opgehaald" heeft geen bestand, maar de regel noemt ${bestandsnaam}.`);
      continue;
    }
    if (bestandsnaam === undefined) {
      if (status === 'gekoppeld') f.voeg('I4', `${groep}: een gekoppelde groep heeft een bestand nodig.`);
      continue;
    }
    const g = leesJson(join(map, bestandsnaam));
    if ('fout' in g) {
      f.voeg('I4', `${groep}: het bestand ${bestandsnaam} kan niet gelezen worden (${g.fout}).`);
      continue;
    }
    const b = g.json;
    if (!isObj(b)) {
      f.voeg('I4', `${groep}: ${bestandsnaam} bevat geen object.`);
      continue;
    }
    const sets = lijstVan(b.sets);
    if (status === 'gekoppeld') {
      const verschillen: string[] = [];
      if (regel.aantal !== b.aantal) verschillen.push(`aantal ${toon(regel.aantal)} ≠ ${toon(b.aantal)}`);
      if (regel.sets !== sets.length) verschillen.push(`sets ${toon(regel.sets)} ≠ ${sets.length}`);
      if (regel.sha256 !== b.sha256) verschillen.push('sha256');
      if (regel.opgehaald !== b.opgehaald) verschillen.push(`opgehaald ${toon(regel.opgehaald)} ≠ ${toon(b.opgehaald)}`);
      if (regel.methode !== b.methode) verschillen.push(`methode ${toon(regel.methode)} ≠ ${toon(b.methode)}`);
      if (verschillen.length > 0) f.voeg('I4', `${groep}: de regel in de index wijkt af van ${bestandsnaam} (${verschillen.join('; ')}).`);
    } else if (status === 'geen' && typeof b.nietMeerInBron !== 'string') {
      f.voeg('I4', `${groep}: "geen" met een bestand betekent een laatst bekende koppeling, maar ${bestandsnaam} heeft geen "nietMeerInBron".`);
    }

    // F1: de vorm, de naam, de sha256 en het aantal.
    for (const t of valideerRichtingDoelenBestand(b, groep)) f.voeg('F1', `${groep}: ${t}`);
    if (b.groep !== bestandsnaam.replace(/\.json$/, '')) f.voeg('F1', `${groep}: "groep" in ${bestandsnaam} is ${toon(b.groep)}, niet gelijk aan de bestandsnaam.`);
    if (b.sha256 !== sha256Van(b.sets)) f.voeg('F1', `${groep}: de sha256 komt niet overeen met de sets.`);
    if (!inMatrix.has(groep)) f.voeg('F1', `${groep}: de groep staat niet in de matrix.`);

    const graadGroep = matrixGroep?.graad;
    const stroomGroep = b.methode === 'graad-en-stroom' && matrixGroep?.titel !== undefined ? stroomVanEersteGraad(matrixGroep.titel) : undefined;
    if (b.methode === 'graad-en-stroom' && stroomGroep === undefined && matrixGroep !== undefined) {
      f.voeg('F4', `${groep}: graad-en-stroom, maar de titel van de groep noemt geen stroom.`);
    }

    for (const s of sets) {
      if (!isObj(s) || typeof s.set !== 'string') continue;
      const setId = s.set;
      const ids = lijstVan(s.ids).filter((x): x is string => typeof x === 'string');
      const setAantal = s.setAantal;
      const plaats = `${groep}, ${setId}`;

      // F2: de set staat in de index van de minimumdoelen (altijd).
      const md = mdSets.get(setId);
      if (!mdBeschikbaar) continue;
      if (md === undefined) {
        f.voeg('F2', `${plaats}: de set staat niet in de index van de minimumdoelen.`);
        continue;
      }

      // F5: onderwijssoort tegenover de soort uit de naam, per set één keer geteld. Alleen bij de methode
      // "api": bij "graad-en-stroom" komen de sets uit de index van de minimumdoelen en bestaat het veld niet.
      if (b.methode === 'api') {
        if (typeof s.onderwijssoort === 'string') soortGezien.add(setId);
        const soortOfficieel = typeof s.onderwijssoort === 'string' && s.onderwijssoort.trim().toLowerCase() === 'buitengewoon';
        const soortNaam = soortVanSet(md.naam ?? '') === 'buso';
        if (soortOfficieel !== soortNaam && !soortVerschil.has(setId)) {
          soortVerschil.set(setId, soortOfficieel ? `${setId}: onderwijssoort "Buitengewoon", maar de naam is geen buitengewoon onderwijs` : `${setId}: de naam is buitengewoon onderwijs, maar onderwijssoort is ${toon(s.onderwijssoort)}`);
        }
      }

      // F3: de graad van de set klopt met de graad van de groep (als beide gekend zijn).
      const graadSet = graadVanSet(md.graad);
      if (graadGroep !== undefined && graadSet !== undefined && graadSet !== graadGroep) {
        f.voeg('F3', `${plaats}: de set is "${md.graad}", maar de groep is graad ${graadGroep}.`);
      }

      // F4: graad-en-stroom: de graad en stroom van de set, en elke set volledig.
      if (b.methode === 'graad-en-stroom') {
        if (graadSet !== '1') f.voeg('F4', `${plaats}: een set van de 1ste graad werd verwacht, maar de set is ${toon(md.graad)}.`);
        if (stroomGroep !== undefined && md.stroom !== `${stroomGroep}-stroom`) f.voeg('F4', `${plaats}: de set heeft stroom ${toon(md.stroom)}, de groep ${stroomGroep}-stroom.`);
        if (ids.length !== setAantal) f.voeg('F4', `${plaats}: de set staat er niet volledig in (${ids.length} van ${toon(setAantal)} nummers).`);
      }

      // F2 vervolg, het versiemerk (§ 7): streng bij een gelijk merk, een melding bij een ander.
      const huidig = laadSet(setId);
      if (huidig === undefined) continue;
      if (s.setSha === merkVan(md)) {
        gelijkMerk++;
        if (setAantal !== md.aantal) f.voeg('F2', `${plaats}: setAantal is ${toon(setAantal)}, de set telt ${toon(md.aantal)} doelen (gelijk versiemerk).`);
        const ontbreekt = ids.filter((id) => !huidig.ids.has(id));
        if (ontbreekt.length > 0) f.voeg('F2', `${plaats}: ${ontbreekt.length} nummers staan niet in het setbestand (${ontbreekt.slice(0, 3).join(', ')}), bij een gelijk versiemerk.`);
        if (b.methode === 'api') {
          const lijst = koppeling.get(groep) ?? [];
          lijst.push(s as unknown as RichtingDoelenSet);
          koppeling.set(groep, lijst);
          setDoelen.set(setId, huidig.doelen);
        }
      } else {
        const weg = ids.filter((id) => !huidig.ids.has(id)).length;
        anderMerk.tel(`${plaats}: koppeling ${toon(s.setSha)}, nu ${toon(merkVan(md))}`);
        nummersWeg += weg;
      }
    }
  }

  // I5: in de map staan geen bestanden buiten de index.
  for (const naam of readdirSync(map).sort()) {
    if (naam !== 'index.json' && !bestandenInIndex.has(naam)) f.voeg('I5', `${naam} staat in de map, maar niet in de index.`);
  }

  // Meldingen over de versiemerken, F5 en F6.
  if (anderMerk.n > 0) {
    i.voeg('F2', `${anderMerk.n} sets in de koppeling hebben een ander versiemerk dan de huidige minimumdoelen${anderMerk.tekst()}; ${nummersWeg} nummers staan niet meer in de huidige set. De strenge controle is daar overgeslagen (${gelijkMerk} sets hadden een gelijk merk).`);
  }
  i.voeg('F5', `${soortVerschil.size} van de ${soortGezien.size} sets met een onderwijssoort wijken af van de soort uit hun naam${soortVerschil.size > 0 ? ` (bv. ${[...soortVerschil.values()].slice(0, 3).join('; ')})` : ''}.`);
  if (opties.soortStreng) for (const t of soortVerschil.values()) f.voeg('F5', t);

  const verschillen = kruiscontrole(koppeling, setDoelen);
  const geldigSo = verschillen.filter((v) => {
    const md = mdSets.get(v.set);
    return md !== undefined && md.geldigheid === 'Geldig' && soortVanSet(md.naam ?? '') === 'so';
  });
  i.voeg('F6', `${verschillen.length} verschillen met het ordeningskader in ${new Set(verschillen.map((v) => v.set)).size} sets, ${geldigSo.length} in geldige sets van het gewoon secundair (${koppeling.size} groepen vergeleken).`);
  if (opties.kruisStreng) {
    for (const v of geldigSo) {
      f.voeg('F6', `${v.groep}, ${v.set}: alleen in de koppeling ${v.alleenApi.slice(0, 3).join(', ') || '–'}; alleen in het ordeningskader ${v.alleenOrdeningskader.slice(0, 3).join(', ') || '–'}.`);
    }
  }
}

/**
 * Controleert een map met studierichtingen (`studierichtingen.json` en `richtingdoelen/`) tegen een map met
 * minimumdoelen (`index.json` en de setbestanden). Gooit nooit: een bestand dat niet te lezen is, wordt een fout.
 */
function controleerStructuurMap(uit: string, minimumdoelen: string, opties: Opties = {}): Uitkomst {
  const f = new Meldingen();
  const i = new Meldingen();
  const volledig: Required<Opties> = {
    kruisStreng: opties.kruisStreng ?? KRUISCONTROLE_STRENG,
    soortStreng: opties.soortStreng ?? ONDERWIJSSOORT_STRENG,
    historiekStreng: opties.historiekStreng ?? HISTORIEK_STRENG,
  };
  try {
    const matrix = controleerMatrix(join(uit, 'studierichtingen.json'), f, i, volledig);
    if (matrix !== undefined) controleerKoppeling(uit, minimumdoelen, matrix, f, i, volledig);
  } catch (e) {
    f.voeg('M1', `de controle zelf faalde: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { fouten: f.lijst(), info: i.lijst() };
}

/** "F2 ×1, M5 ×1": een korte samenvatting van de info voor in een testnaam. */
function samenvatting(info: readonly string[] | undefined): string {
  if (info === undefined || info.length === 0) return '';
  const telling = new Map<string, number>();
  for (const regel of info) {
    const code = /^([A-Z]\d):/.exec(regel)?.[1] ?? '?';
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
  const regels = [`studierichtingen: ${info.length} ${info.length === 1 ? 'infomelding' : 'infomeldingen'} bij public/leerplannen/structuur`];
  for (const t of info.slice(0, MAX_INFO_REGELS)) regels.push(`  ${t}`);
  if (info.length > MAX_INFO_REGELS) regels.push(`  … en nog ${info.length - MAX_INFO_REGELS} meldingen`);
  return `${regels.join('\n')}\n`;
}

/**
 * Een harde fout als er koppelingsbestanden staan zonder index of zonder matrix: zo valt een hernoemde of
 * verdwenen index op, in plaats van dat de hele controle stilletjes wegvalt.
 */
function aanwezigheidsfout(heeftMatrix: boolean, doelenBestanden: readonly string[]): string | undefined {
  if (doelenBestanden.length === 0) return undefined;
  if (!doelenBestanden.includes('index.json')) {
    return `public/leerplannen/structuur/richtingdoelen bevat ${doelenBestanden.slice(0, 3).join(', ')}${doelenBestanden.length > 3 ? ', …' : ''} maar geen index.json`;
  }
  if (!heeftMatrix) return 'public/leerplannen/structuur/richtingdoelen bevat bestanden maar studierichtingen.json ontbreekt';
  return undefined;
}

// ── 1. De meegeleverde bestanden ────────────────────────────────────────────
//
// De map public/leerplannen/structuur wordt pas door de workflow "Leerplangegevens bijwerken" gevuld. Bestaat
// de matrix niet, dan valt er niets te controleren en is deze groep overgeslagen (en dus groen). Staan er wel
// koppelingsbestanden maar geen index of geen matrix, dan faalt de test.

const MATRIX_PAD = join(STRUCTUUR_MAP, 'studierichtingen.json');
const DOELEN_MAP = join(STRUCTUUR_MAP, 'richtingdoelen');
const heeftMatrix = existsSync(MATRIX_PAD);
const doelenBestanden = existsSync(DOELEN_MAP) ? readdirSync(DOELEN_MAP).filter((n) => n.endsWith('.json')) : [];
const ontbreekt = aanwezigheidsfout(heeftMatrix, doelenBestanden);
const echt = heeftMatrix ? controleerStructuurMap(STRUCTUUR_MAP, MINIMUMDOELEN_MAP) : undefined;

it.runIf(ontbreekt !== undefined)('de koppelingsbestanden staan niet zonder index en matrix', () => {
  expect.fail(ontbreekt);
});

describe.runIf(heeftMatrix)('meegeleverde studierichtingen (public/leerplannen/structuur)', () => {
  it(`de matrix, de index en alle koppelingsbestanden kloppen${samenvatting(echt?.info)}`, () => {
    // Eerst de info (ook als er fouten zijn), want console mag niet in src: zo ziet wie de test draait de meldingen.
    process.stdout.write(infoUitvoer(echt?.info ?? []));
    expect(echt?.fouten).toEqual([]);
  });
});

describe('aanwezigheidsfout', () => {
  it('geen koppelingsbestanden: niets te melden', () => {
    expect(aanwezigheidsfout(false, [])).toBeUndefined();
    expect(aanwezigheidsfout(true, [])).toBeUndefined();
  });

  it('koppelingsbestanden zonder index.json zijn een harde fout', () => {
    expect(aanwezigheidsfout(true, ['G-0193.json', 'G-0117.json'])).toMatch(/G-0193\.json, G-0117\.json maar geen index\.json/);
    expect(aanwezigheidsfout(false, ['G-0193.json'])).toMatch(/geen index\.json/);
  });

  it('een index zonder matrix is een harde fout', () => {
    expect(aanwezigheidsfout(false, ['index.json'])).toMatch(/studierichtingen\.json ontbreekt/);
  });

  it('matrix, index en bestanden samen zijn in orde', () => {
    expect(aanwezigheidsfout(true, ['index.json', 'G-0193.json'])).toBeUndefined();
  });
});

// ── 2. De fixtures: het positieve geval ─────────────────────────────────────

describe('tests/fixtures/structuur/uit (positief geval)', () => {
  it('geeft geen enkele fout', () => {
    const { fouten } = controleerStructuurMap(FIXTURE_UIT, MINIMUMDOELEN_MAP);
    expect(fouten).toEqual([]);
  });

  it('geeft ook geen fout met alle strenge regels aan, behalve wat de fixtures niet leveren', () => {
    // De fixtures zijn nagebootst: de ordeningskaderkruising en de historiek zijn daar niet bewezen.
    const { fouten } = controleerStructuurMap(FIXTURE_UIT, MINIMUMDOELEN_MAP, { soortStreng: true, historiekStreng: true });
    expect(fouten).toEqual([]);
  });

  it('meldt de tellingen van M5, F5 en F6 in info', () => {
    const { info } = controleerStructuurMap(FIXTURE_UIT, MINIMUMDOELEN_MAP);
    for (const code of ['M5', 'F5', 'F6']) expect(info.some((t) => t.startsWith(`${code}:`)), `info over ${code}`).toBe(true);
  });

  it('de matrix en de koppeling bevatten de soorten groepen die de zelftest nodig heeft', () => {
    const index = JSON.parse(readFileSync(join(FIXTURE_UIT, 'richtingdoelen', 'index.json'), 'utf8')) as { groepen: Json[] };
    const methodes = new Set(index.groepen.filter((r) => r.status === 'gekoppeld').map((r) => r.methode));
    expect([...methodes].sort()).toEqual(['api', 'graad-en-stroom']);
    expect(index.groepen.some((r) => r.status === 'geen')).toBe(true);
  });

  it('een map zonder matrix is een fout en geen uitzondering', () => {
    const { fouten } = controleerStructuurMap(join(tmpdir(), 'bestaat-niet-studierichtingen'), MINIMUMDOELEN_MAP);
    expect(fouten.map((t) => t.slice(0, 3))).toEqual(['M1:']);
  });
});

// ── 3. De zelftest: kapotte kopieën ─────────────────────────────────────────
//
// Elke case maakt een kopie van de fixtures in os.tmpdir(), breekt precies één invariant en eist dat de
// controle die vindt: een melding met de juiste code én met de tekst van de bedoelde controle (`verwacht`),
// zodat een andere controle met dezelfde code de case niet kan redden. De kopie wordt telkens zo hersteld
// dat de rest consistent blijft (aantallen, sha256, de regel in de index), zodat alleen de bedoelde
// invariant breekt.
// Wat een case nodig heeft aan sets bouwt hij uit de huidige minimumdoelen: de zelftest hangt dus niet af van
// de versiemerken in de fixtures.

const tijdelijk: string[] = [];
afterAll(() => {
  for (const map of tijdelijk) rmSync(map, { recursive: true, force: true });
});

function maakKopie(): string {
  const map = mkdtempSync(join(tmpdir(), 'studierichtingen-data-'));
  tijdelijk.push(map);
  cpSync(FIXTURE_UIT, map, { recursive: true });
  return map;
}

const lees = (map: string, ...delen: string[]): Json => JSON.parse(readFileSync(join(map, ...delen), 'utf8')) as Json;
const schrijf = (map: string, delen: string[], json: unknown): void => writeFileSync(join(map, ...delen), `${JSON.stringify(json, null, 2)}\n`);

/** Schrijft de matrix en werkt de aantallen, de sha256 en `matrixSha256` in de index bij. */
function herstelMatrix(map: string, m: Json): void {
  m.aantalGroepen = lijstVan(m.groepen).length;
  m.aantalOnderdelen = lijstVan(m.onderdelen).length;
  m.sha256 = sha256Van({ groepen: m.groepen, onderdelen: m.onderdelen });
  schrijf(map, ['studierichtingen.json'], m);
  const index = lees(map, 'richtingdoelen', 'index.json');
  index.matrixSha256 = m.sha256;
  schrijf(map, ['richtingdoelen', 'index.json'], index);
}

/** Schrijft een koppelingsbestand en werkt `aantal`, `sha256` en de regel in de index bij. */
function herstelBestand(map: string, groep: string, b: Json): void {
  const sets = lijstVan(b.sets) as Json[];
  sets.sort((x, y) => vergelijkNatuurlijk(String(x.set), String(y.set)));
  b.aantal = sets.reduce((som, s) => som + lijstVan(s.ids).length, 0);
  b.sha256 = sha256Van(b.sets);
  schrijf(map, ['richtingdoelen', `${groep}.json`], b);
  const index = lees(map, 'richtingdoelen', 'index.json');
  const regel = lijstVan(index.groepen).find((r) => isObj(r) && r.groep === groep) as Json | undefined;
  if (regel !== undefined) {
    regel.aantal = b.aantal;
    regel.sets = sets.length;
    regel.sha256 = b.sha256;
    schrijf(map, ['richtingdoelen', 'index.json'], index);
  }
}

/** Een set uit de koppeling, gebouwd uit de huidige minimumdoelen (gelijk versiemerk, standaard volledig). */
function setItem(md: MinimumdoelenIndexSet, ids?: string[]): Json {
  const alle = idsVan(md.id);
  return { set: md.id, setSha: merkVan(md), setAantal: md.aantal, ids: ids ?? alle };
}

/** Voegt een set toe aan een koppelingsbestand (een bestaande set met dezelfde naam wordt vervangen). */
function zetSet(b: Json, item: Json): void {
  b.sets = [...lijstVan(b.sets).filter((s) => !isObj(s) || s.set !== item.set), item];
}

let mdIndexCache: MinimumdoelenIndexSet[] | undefined;
const mdIndex = (): MinimumdoelenIndexSet[] => (mdIndexCache ??= (JSON.parse(readFileSync(join(MINIMUMDOELEN_MAP, 'index.json'), 'utf8')) as MinimumdoelenIndex).sets);
const mdSet = (id: string): MinimumdoelenSetBestand => JSON.parse(readFileSync(join(MINIMUMDOELEN_MAP, `${id}.json`), 'utf8')) as MinimumdoelenSetBestand;
const idsVan = (id: string): string[] => [...new Set(mdSet(id).doelen.map((d) => d.id).filter((x): x is string => typeof x === 'string'))].sort(vergelijkNatuurlijk);

/** De eerste set uit de huidige minimumdoelen die aan de voorwaarde voldoet en waarvan elk doel een vast nummer heeft. */
function kiesSet(waar: (s: MinimumdoelenIndexSet) => boolean, minimum = 3): MinimumdoelenIndexSet {
  for (const s of mdIndex()) {
    if (!waar(s) || s.aantal < minimum) continue;
    if (idsVan(s.id).length === s.aantal) return s;
  }
  throw new Error('De zelftest vindt geen passende set in de minimumdoelen.');
}

/** Een voorwaarde voor `kiesSet`: de set heeft de graad van de groep, zodat F3 niet meespeelt. */
const vanGraad = (graad: string) => (s: MinimumdoelenIndexSet) => graadVanSet(s.graad) === graad;

/** De graad van een groep in de matrix van de kopie. */
const graadVan = (map: string, groep: string): string => String(groepInMatrix(map, groep).graad);

/** De eerste groep uit de index met een gekoppeld bestand en een bepaalde methode. */
function kiesGroep(map: string, methode: 'api' | 'graad-en-stroom'): string {
  const regel = lijstVan(lees(map, 'richtingdoelen', 'index.json').groepen).find((r) => isObj(r) && r.status === 'gekoppeld' && r.methode === methode) as Json | undefined;
  if (regel === undefined) throw new Error(`De fixtures hebben geen groep met methode ${methode}.`);
  return regel.groep as string;
}

const leesBestand = (map: string, groep: string): Json => lees(map, 'richtingdoelen', `${groep}.json`);
const groepInMatrix = (map: string, groep: string): Json => {
  const g = lijstVan(lees(map, 'studierichtingen.json').groepen).find((x) => isObj(x) && x.nummer === groep);
  if (!isObj(g)) throw new Error(`De fixtures hebben geen groep ${groep}.`);
  return g;
};
const leesIndex = (map: string): Json => lees(map, 'richtingdoelen', 'index.json');

/** De regel van een groep in de index van een kopie. */
const regelVan = (index: Json, groep: string): Json => {
  const regel = lijstVan(index.groepen).find((r) => isObj(r) && r.groep === groep);
  if (!isObj(regel)) throw new Error(`De index heeft geen regel voor ${groep}.`);
  return regel;
};

interface Case {
  naam: string;
  /** De code van de invariant die de controle moet vinden. */
  code: string;
  /**
   * De tekst van de melding van de bedoelde controle. Een melding met dezelfde code maar van een andere
   * controle (bv. de tweede helft van M3) redt de case dus niet.
   */
  verwacht: RegExp;
  /** Elke melding met deze code hoort bij de bedoelde controle: de breuk is zuiver (alleen waar dat telt). */
  alleen?: boolean;
  breek: (map: string) => void;
  opties?: Opties;
}

const CASES: Case[] = [
  // ── Matrix ──
  {
    naam: 'sha256',
    code: 'M1',
    verwacht: /de sha256 komt niet overeen met de groepen en onderdelen/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      (m.groepen as Json[])[0].titel = `${(m.groepen as Json[])[0].titel as string} (gewijzigd)`;
      schrijf(map, ['studierichtingen.json'], m);
    },
  },
  {
    naam: 'aantalGroepen',
    code: 'M1',
    verwacht: /aantalGroepen is \d+, maar er staan \d+ groepen in/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      m.aantalGroepen = (m.aantalGroepen as number) + 1;
      schrijf(map, ['studierichtingen.json'], m);
    },
  },
  {
    naam: 'aantalOnderdelen',
    code: 'M1',
    verwacht: /aantalOnderdelen is \d+, maar er staan \d+ onderdelen in/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      m.aantalOnderdelen = (m.aantalOnderdelen as number) + 1;
      schrijf(map, ['studierichtingen.json'], m);
    },
  },
  {
    naam: 'kop (app, kind, v)',
    code: 'M1',
    verwacht: /de kop \(app, kind, v\) klopt niet/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      m.v = 2;
      schrijf(map, ['studierichtingen.json'], m);
    },
  },
  {
    naam: 'sortering',
    code: 'M2',
    verwacht: /de groepen G-\d+ en G-\d+ staan niet gesorteerd/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      const groepen = m.groepen as Json[];
      [groepen[0], groepen[1]] = [groepen[1], groepen[0]];
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'dubbel groepnummer',
    code: 'M2',
    verwacht: /het groepnummer G-\d+ staat meer dan één keer in de matrix/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      const groepen = m.groepen as Json[];
      groepen.splice(1, 0, { ...groepen[0] });
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'groepnummer past niet op het patroon',
    code: 'M2',
    verwacht: /groep 1: het nummer "G-12" past niet op /,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      (m.groepen as Json[])[0].nummer = 'G-12';
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'onderdeelnummers niet gesorteerd',
    code: 'M2',
    verwacht: /de onderdelen \d+ en \d+ staan niet gesorteerd/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      const onderdelen = m.onderdelen as Json[];
      [onderdelen[0], onderdelen[1]] = [onderdelen[1], onderdelen[0]];
      herstelMatrix(map, m);
    },
  },
  {
    // Het onderdeel wijst naar een onbekende groep, en de eigen groep noemt het niet meer: zo breekt alleen de
    // eerste helft van M3 (onderdeel.groep) en niet ook "groep.onderdelen noemt precies de onderdelen".
    naam: 'onderdeel van een onbekende groep',
    code: 'M3',
    verwacht: /onderdeel \d+: de groep "G-9998" staat niet in de matrix/,
    alleen: true,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      const groep = (m.groepen as Json[]).find((g) => lijstVan(g.onderdelen).length > 1);
      if (groep === undefined) throw new Error('De fixtures hebben geen groep met meer dan één onderdeel.');
      const genoemd = groep.onderdelen as number[];
      const weg = genoemd.pop();
      const onderdeel = (m.onderdelen as Json[]).find((o) => o.nummer === weg);
      if (onderdeel === undefined) throw new Error(`De fixtures hebben geen onderdeel ${String(weg)}.`);
      onderdeel.groep = 'G-9998';
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'groep noemt een onderdeel dat er niet is',
    code: 'M3',
    verwacht: /groep G-\d+: noemt 99999, maar dat hoort niet bij deze groep/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      (((m.groepen as Json[])[0].onderdelen) as number[]).push(99999);
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'onmogelijke datum',
    code: 'M4',
    verwacht: /onderdeel \d+: "begindatum" "2021-02-30" is geen geldige datum/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      (m.onderdelen as Json[])[0].begindatum = '2021-02-30';
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'geen enkele verwijzing in de historiek (streng)',
    code: 'M5',
    verwacht: /de matrix bevat geen enkele verwijzing/,
    opties: { historiekStreng: true },
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      for (const o of m.onderdelen as Json[]) for (const veld of ['vorige', 'volgende', 'voorbereidend', 'vervolg']) delete o[veld];
      herstelMatrix(map, m);
    },
  },
  {
    // Een veld dat de validator van de module niet kent: de rest van de datatest ziet daar niets van.
    naam: 'onbekend veld in een groep (valideerMatrixBestand)',
    code: 'M6',
    verwacht: /^M6: Groep G-\d+: onbekende velden "onbekendVeld"/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      (m.groepen as Json[])[0].onbekendVeld = 'x';
      herstelMatrix(map, m);
    },
  },
  {
    naam: 'gewone groep van de 1ste graad zonder stroom',
    code: 'M7',
    verwacht: /groep G-\d+ \(".*"\) is een gewone groep van de 1ste graad, maar de titel noemt geen stroom/,
    breek: (map) => {
      const m = lees(map, 'studierichtingen.json');
      const groep = (m.groepen as Json[]).find((g) => g.graad === '1' && stroomVanEersteGraad(String(g.titel)) !== undefined);
      if (groep === undefined) throw new Error('De fixtures hebben geen groep van de 1ste graad met een stroom.');
      groep.titel = 'Eerste leerjaar';
      herstelMatrix(map, m);
    },
  },
  // ── Index ──
  {
    naam: 'matrixSha256 in de index',
    code: 'I1',
    verwacht: /matrixSha256 in de index is niet gelijk aan de sha256 van de matrix/,
    breek: (map) => {
      const index = leesIndex(map);
      index.matrixSha256 = '0'.repeat(64);
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'groep zonder regel in de index',
    code: 'I2',
    verwacht: /\d+ groepen uit de matrix hebben geen regel in de index/,
    breek: (map) => {
      const index = leesIndex(map);
      (index.groepen as Json[]).splice(1, 1);
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'regel in de index voor een groep die niet in de matrix staat',
    code: 'I2',
    verwacht: /\d+ regels in de index horen bij een groep die niet in de matrix staat \(G-9990\)/,
    breek: (map) => {
      const index = leesIndex(map);
      (index.groepen as Json[]).push({ groep: 'G-9990', status: 'nog-niet-opgehaald' });
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'dubbele regel in de index',
    code: 'I2',
    verwacht: /de index heeft twee regels voor G-\d+/,
    breek: (map) => {
      const index = leesIndex(map);
      const regels = index.groepen as Json[];
      regels.splice(1, 0, { ...regels[0] });
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'regels niet gesorteerd',
    code: 'I2',
    verwacht: /de regels G-\d+ en G-\d+ staan niet gesorteerd/,
    breek: (map) => {
      const index = leesIndex(map);
      const regels = index.groepen as Json[];
      [regels[0], regels[1]] = [regels[1], regels[0]];
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'index.json ontbreekt',
    code: 'I2',
    verwacht: /richtingdoelen\/index\.json kan niet gelezen worden \(het bestand bestaat niet\)/,
    breek: (map) => {
      rmSync(join(map, 'richtingdoelen', 'index.json'));
    },
  },
  {
    naam: 'graad-en-stroom buiten de 1ste graad',
    code: 'I3',
    verwacht: /de methode graad-en-stroom hoort alleen bij de 1ste graad/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const index = leesIndex(map);
      regelVan(index, groep).methode = 'graad-en-stroom';
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'onbekende status',
    code: 'I3',
    verwacht: /de status "kapot" is onbekend/,
    breek: (map) => {
      const index = leesIndex(map);
      (index.groepen as Json[])[0].status = 'kapot';
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'index tegenover bestand',
    code: 'I4',
    verwacht: /de regel in de index wijkt af van G-\d+\.json \(aantal \d+ ≠ \d+\)\./,
    breek: (map) => {
      const index = leesIndex(map);
      const regel = regelVan(index, kiesGroep(map, 'api'));
      regel.aantal = (regel.aantal as number) + 1;
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'index tegenover bestand: sha256',
    code: 'I4',
    verwacht: /de regel in de index wijkt af van G-\d+\.json \(sha256\)\./,
    breek: (map) => {
      const index = leesIndex(map);
      regelVan(index, kiesGroep(map, 'api')).sha256 = '0'.repeat(64);
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'index tegenover bestand: opgehaald',
    code: 'I4',
    verwacht: /de regel in de index wijkt af van G-\d+\.json \(opgehaald "2026-10-10T00:00:00Z" ≠ "[^"]+"\)\./,
    breek: (map) => {
      const index = leesIndex(map);
      regelVan(index, kiesGroep(map, 'api')).opgehaald = '2026-10-10T00:00:00Z';
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'index tegenover bestand: sets',
    code: 'I4',
    verwacht: /de regel in de index wijkt af van G-\d+\.json \(sets \d+ ≠ \d+\)\./,
    breek: (map) => {
      const index = leesIndex(map);
      const regel = regelVan(index, kiesGroep(map, 'api'));
      regel.sets = (regel.sets as number) + 1;
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    // Een groep met de methode graad-en-stroom krijgt in de index "api": I3 vindt dat goed, I4 ziet het verschil.
    naam: 'index tegenover bestand: methode',
    code: 'I4',
    verwacht: /de regel in de index wijkt af van G-\d+\.json \(methode "api" ≠ "graad-en-stroom"\)\./,
    breek: (map) => {
      const index = leesIndex(map);
      regelVan(index, kiesGroep(map, 'graad-en-stroom')).methode = 'api';
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'gekoppeld zonder bestand',
    code: 'I4',
    verwacht: /het bestand G-\d+\.json kan niet gelezen worden \(het bestand bestaat niet\)/,
    breek: (map) => {
      rmSync(join(map, 'richtingdoelen', `${kiesGroep(map, 'api')}.json`));
    },
  },
  {
    naam: '"geen" met een bestand zonder nietMeerInBron',
    code: 'I4',
    verwacht: /"geen" met een bestand betekent een laatst bekende koppeling, maar G-\d+\.json heeft geen "nietMeerInBron"/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const index = leesIndex(map);
      const regel = regelVan(index, groep);
      const opgehaald = regel.opgehaald;
      for (const veld of Object.keys(regel)) delete regel[veld];
      Object.assign(regel, { groep, status: 'geen', opgehaald, bestand: `${groep}.json` });
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: '"nog-niet-opgehaald" met een bestand',
    code: 'I4',
    verwacht: /"nog-niet-opgehaald" heeft geen bestand, maar de regel noemt G-\d+\.json/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const index = leesIndex(map);
      const regel = regelVan(index, groep);
      for (const veld of Object.keys(regel)) delete regel[veld];
      Object.assign(regel, { groep, status: 'nog-niet-opgehaald', bestand: `${groep}.json` });
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'bestand buiten de index',
    code: 'I5',
    verwacht: /^I5: G-9999\.json staat in de map, maar niet in de index/,
    breek: (map) => {
      cpSync(join(map, 'richtingdoelen', `${kiesGroep(map, 'api')}.json`), join(map, 'richtingdoelen', 'G-9999.json'));
    },
  },
  // ── Koppelingsbestanden ──
  {
    naam: 'sha256 van een koppelingsbestand',
    code: 'F1',
    verwacht: /G-\d+: de sha256 komt niet overeen met de sets/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      b.sha256 = '0'.repeat(64);
      schrijf(map, ['richtingdoelen', `${groep}.json`], b);
    },
  },
  {
    naam: 'groep gelijk aan de bestandsnaam',
    code: 'F1',
    verwacht: /"groep" in G-\d+\.json is "G-0001", niet gelijk aan de bestandsnaam/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      b.groep = 'G-0001';
      schrijf(map, ['richtingdoelen', `${groep}.json`], b);
    },
  },
  {
    naam: 'aantal is de som van de nummers',
    code: 'F1',
    verwacht: /Kop zegt \d+ doelen, maar de sets bevatten er samen \d+/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      b.aantal = (b.aantal as number) + 1;
      schrijf(map, ['richtingdoelen', `${groep}.json`], b);
    },
  },
  {
    // Een volledig en gezond koppelingsbestand met een regel in de index, maar voor een groep die de matrix niet kent.
    naam: 'koppelingsbestand van een groep buiten de matrix',
    code: 'F1',
    verwacht: /^F1: G-9990: de groep staat niet in de matrix/,
    breek: (map) => {
      const b = leesBestand(map, kiesGroep(map, 'api'));
      b.groep = 'G-9990';
      b.filter = 'structuuronderdeel_groep_nummer=G-9990';
      schrijf(map, ['richtingdoelen', 'G-9990.json'], b);
      const index = leesIndex(map);
      (index.groepen as Json[]).push({
        groep: 'G-9990',
        status: 'gekoppeld',
        methode: 'api',
        aantal: b.aantal,
        sets: lijstVan(b.sets).length,
        sha256: b.sha256,
        opgehaald: b.opgehaald,
        bestand: 'G-9990.json',
      });
      schrijf(map, ['richtingdoelen', 'index.json'], index);
    },
  },
  {
    naam: 'onbekende set',
    code: 'F2',
    verwacht: /ODS_9999999: de set staat niet in de index van de minimumdoelen/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      zetSet(b, { set: 'ODS_9999999', setSha: '0123456789abcdef', setAantal: 2, ids: ['1', '2'] });
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'onbekend nummer bij gelijk versiemerk',
    code: 'F2',
    verwacht: /1 nummers staan niet in het setbestand \(999999999\), bij een gelijk versiemerk/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      const md = kiesSet((s) => s.aantal > 3 && vanGraad(graadVan(map, groep))(s));
      zetSet(b, setItem(md, [...idsVan(md.id).slice(0, 2), '999999999']));
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'setAantal tegenover de index bij gelijk versiemerk',
    code: 'F2',
    verwacht: /setAantal is \d+, de set telt \d+ doelen \(gelijk versiemerk\)/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      const md = kiesSet((s) => s.aantal > 3 && vanGraad(graadVan(map, groep))(s));
      zetSet(b, { ...setItem(md, idsVan(md.id).slice(0, 2)), setAantal: md.aantal + 5 });
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'graadconflict',
    code: 'F3',
    verwacht: /ODS_\d+: de set is "[^"]+", maar de groep is graad \d/,
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      const graadGroep = graadVan(map, groep);
      const andere = kiesSet((s) => graadVanSet(s.graad) !== undefined && graadVanSet(s.graad) !== graadGroep);
      zetSet(b, setItem(andere));
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'graad-en-stroom met een set van de verkeerde stroom',
    code: 'F4',
    verwacht: /de set heeft stroom "[AB]-stroom", de groep [AB]-stroom/,
    breek: (map) => {
      const groep = kiesGroep(map, 'graad-en-stroom');
      const b = leesBestand(map, groep);
      const stroomGroep = stroomVanEersteGraad(String(groepInMatrix(map, groep).titel));
      const andere = stroomGroep === 'A' ? 'B-stroom' : 'A-stroom';
      zetSet(b, setItem(kiesSet((s) => graadVanSet(s.graad) === '1' && s.stroom === andere)));
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'graad-en-stroom met een onvolledige set',
    code: 'F4',
    verwacht: /de set staat er niet volledig in \(\d+ van \d+ nummers\)/,
    breek: (map) => {
      const groep = kiesGroep(map, 'graad-en-stroom');
      const b = leesBestand(map, groep);
      const eerste = (b.sets as Json[])[0];
      eerste.ids = (eerste.ids as string[]).slice(0, -1);
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'graad-en-stroom met een set buiten de 1ste graad',
    code: 'F4',
    verwacht: /een set van de 1ste graad werd verwacht, maar de set is "2de graad"/,
    breek: (map) => {
      const groep = kiesGroep(map, 'graad-en-stroom');
      const b = leesBestand(map, groep);
      zetSet(b, setItem(kiesSet((s) => graadVanSet(s.graad) === '2')));
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'onderwijssoort tegenover de naam (streng)',
    code: 'F5',
    verwacht: /onderwijssoort "Buitengewoon", maar de naam is geen buitengewoon onderwijs/,
    opties: { soortStreng: true },
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      const md = kiesSet((s) => soortVanSet(s.naam ?? '') !== 'buso' && vanGraad(graadVan(map, groep))(s));
      zetSet(b, { ...setItem(md), onderwijssoort: 'Buitengewoon' });
      herstelBestand(map, groep, b);
    },
  },
  {
    naam: 'kruiscontrole met het ordeningskader (streng)',
    code: 'F6',
    verwacht: /ODS_\d+: alleen in de koppeling \S+.*; alleen in het ordeningskader/,
    opties: { kruisStreng: true },
    breek: (map) => {
      const groep = kiesGroep(map, 'api');
      const b = leesBestand(map, groep);
      // Een geldige SO-set waarin het ordeningskader doelen aan een richting geeft, met één nummer dat het
      // ordeningskader niet aan deze groep geeft.
      const md = kiesSet((s) => s.geldigheid === 'Geldig' && soortVanSet(s.naam ?? '') === 'so' && vanGraad(graadVan(map, groep))(s) && mdSet(s.id).doelen.some((d) => groepnummersVanDoel(d).length > 0), 1);
      const vreemd = mdSet(md.id).doelen.find((d) => typeof d.id === 'string' && !groepnummersVanDoel(d).includes(groep));
      if (vreemd === undefined || vreemd.id === undefined) throw new Error('De zelftest vindt geen doel zonder deze groep in het ordeningskader.');
      zetSet(b, setItem(md, [vreemd.id]));
      herstelBestand(map, groep, b);
    },
  },
];

/** De acht gebroken invarianten die het ontwerp (§ 8) minstens in de zelftest eist. */
const VERPLICHT = [
  'sha256',
  'sortering',
  'onbekende set',
  'onbekend nummer bij gelijk versiemerk',
  'graadconflict',
  'index tegenover bestand',
  'dubbel groepnummer',
  'graad-en-stroom buiten de 1ste graad',
];

describe('zelftest: kapotte kopieën van de fixtures', () => {
  const gevonden = new Map<string, string>();

  it.each(CASES.map((c) => [c.naam, c] as const))('vindt: %s', (_naam, c) => {
    const map = maakKopie();
    c.breek(map);
    const { fouten } = controleerStructuurMap(map, MINIMUMDOELEN_MAP, c.opties);
    const vanCode = fouten.filter((t) => t.startsWith(`${c.code}: `));
    const alle = `fouten: ${fouten.join(' | ')}`;
    expect(vanCode.some((t) => c.verwacht.test(t)), `een ${c.code}-melding die past op ${String(c.verwacht)}; ${alle}`).toBe(true);
    if (c.alleen === true) expect(vanCode.filter((t) => !c.verwacht.test(t)), `meldingen van ${c.code} buiten de bedoelde controle; ${alle}`).toEqual([]);
    gevonden.set(c.naam, c.code);
  });

  it('vindt de acht gebroken invarianten uit het ontwerp en minstens tien verschillende codes', () => {
    for (const naam of VERPLICHT) expect(gevonden.has(naam), `"${naam}" is gevonden`).toBe(true);
    expect(new Set(gevonden.values()).size).toBeGreaterThanOrEqual(10);
  });

  it('de cases hebben unieke namen', () => {
    expect(new Set(CASES.map((c) => c.naam)).size).toBe(CASES.length);
  });
});

describe('zelftest: wat geen fout mag zijn', () => {
  it('een einddatum vóór de begindatum (geannuleerde 7de jaren) en een schrikkeldatum zijn geen fout', () => {
    const map = maakKopie();
    const m = lees(map, 'studierichtingen.json');
    const onderdelen = m.onderdelen as Json[];
    onderdelen[0].begindatum = '2021-09-01';
    onderdelen[0].einddatum = '2021-08-31';
    onderdelen[1].begindatum = '2020-02-29';
    herstelMatrix(map, m);
    expect(controleerStructuurMap(map, MINIMUMDOELEN_MAP).fouten).toEqual([]);
  });

  it('een vast nummer in meer sets van één bestand (BuSO-kopie, oude versie) is geen fout', () => {
    // De fixtures bevatten dat al (zoals de echte data): het positieve geval hierboven bewijst dat het mag.
    const gedeeld: string[] = [];
    for (const naam of readdirSync(join(FIXTURE_UIT, 'richtingdoelen'))) {
      if (naam === 'index.json') continue;
      const perId = new Map<string, number>();
      for (const s of lijstVan(lees(FIXTURE_UIT, 'richtingdoelen', naam).sets) as Json[]) {
        for (const id of lijstVan(s.ids)) perId.set(String(id), (perId.get(String(id)) ?? 0) + 1);
      }
      if ([...perId.values()].some((n) => n > 1)) gedeeld.push(naam);
    }
    expect(gedeeld.length, 'koppelingsbestanden waarin een nummer in meer sets staat').toBeGreaterThan(0);
    expect(controleerStructuurMap(FIXTURE_UIT, MINIMUMDOELEN_MAP).fouten).toEqual([]);
  });

  it('een groep zonder doelen ("geen", zonder bestand) is in orde', () => {
    const map = maakKopie();
    const index = leesIndex(map);
    expect((index.groepen as Json[]).some((r) => r.status === 'geen' && r.bestand === undefined)).toBe(true);
    expect(controleerStructuurMap(map, MINIMUMDOELEN_MAP).fouten).toEqual([]);
  });

  it('"geen" met een laatst bekend bestand en nietMeerInBron is in orde', () => {
    const map = maakKopie();
    const groep = kiesGroep(map, 'api');
    const b = leesBestand(map, groep);
    b.nietMeerInBron = '2026-10-09';
    herstelBestand(map, groep, b);
    const index = leesIndex(map);
    const regel = lijstVan(index.groepen).find((r) => isObj(r) && r.groep === groep) as Json;
    const opgehaald = regel.opgehaald;
    for (const veld of Object.keys(regel)) delete regel[veld];
    Object.assign(regel, { groep, status: 'geen', opgehaald, bestand: `${groep}.json`, nietMeerInBron: '2026-10-09' });
    schrijf(map, ['richtingdoelen', 'index.json'], index);
    expect(controleerStructuurMap(map, MINIMUMDOELEN_MAP).fouten).toEqual([]);
  });

  it('een index die bij de matrix hoort zonder koppelingsbestanden ("nog-niet-opgehaald") is in orde', () => {
    const map = maakKopie();
    const groep = kiesGroep(map, 'api');
    rmSync(join(map, 'richtingdoelen', `${groep}.json`));
    const index = leesIndex(map);
    const regel = lijstVan(index.groepen).find((r) => isObj(r) && r.groep === groep) as Json;
    for (const veld of Object.keys(regel)) delete regel[veld];
    Object.assign(regel, { groep, status: 'nog-niet-opgehaald' });
    schrijf(map, ['richtingdoelen', 'index.json'], index);
    expect(controleerStructuurMap(map, MINIMUMDOELEN_MAP).fouten).toEqual([]);
  });

  it('de strenge regels F5 en F6 geven zonder schakelaar alleen een melding', () => {
    for (const naam of ['onderwijssoort tegenover de naam (streng)', 'kruiscontrole met het ordeningskader (streng)']) {
      const c = CASES.find((x) => x.naam === naam) as Case;
      const map = maakKopie();
      c.breek(map);
      const { fouten, info } = controleerStructuurMap(map, MINIMUMDOELEN_MAP);
      expect(fouten, naam).toEqual([]);
      expect(info.some((t) => t.startsWith(`${c.code}: `) && !/^[A-Z]\d: 0 /.test(t)), `info over ${c.code}`).toBe(true);
    }
    expect(KRUISCONTROLE_STRENG).toBe(false);
    expect(ONDERWIJSSOORT_STRENG).toBe(false);
  });
});

// ── 4. Het versiemerk, op een eigen minimale map ────────────────────────────
//
// De versieregel (§ 7) toetsen we op een map die we zelf bouwen: één groep, één set, vier doelen. Zo hangt de
// test niet af van de echte minimumdoelen of van de sets in de fixtures: die veranderen bij elke maandelijkse
// update, en dan zouden tellingen over de hele map verschuiven terwijl de data in orde is.

const MINIMALE_GROEP = 'G-9001';
const MINIMALE_SET = 'ODS_9001';
const MINIMALE_IDS = ['9001001', '9001002', '9001003', '9001004'];
const MINIMALE_TIJD = '2026-10-09T00:00:00Z';
const NAAMSVERMELDING = 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)';

interface MinimaleMap {
  /** De map met `studierichtingen.json` en `richtingdoelen/`. */
  uit: string;
  /** De map met de index en het setbestand van de minimumdoelen. */
  minimumdoelen: string;
  /** Het versiemerk van de set zoals de koppeling het kent. */
  merk: string;
}

function minimaleDoelen(ids: readonly string[]): { id: string; code: string; tekst: string }[] {
  return ids.map((id, n) => ({ id, code: `01.01.0${n + 1}`, tekst: `<p>Testdoel ${n + 1}.</p>` }));
}

/** Schrijft het setbestand van de minimale minimumdoelen, zonder de index aan te raken. */
function schrijfMinimaalSetbestand(minimumdoelen: string, ids: readonly string[]): void {
  schrijf(minimumdoelen, [`${MINIMALE_SET}.json`], { app: 'boosterz', kind: 'minimumdoelen', v: 1, set: { id: MINIMALE_SET }, doelen: minimaleDoelen(ids) });
}

/** Schrijft de index van de minimale minimumdoelen: één set, met het sha256 van de doelen. */
function schrijfMinimaleMdIndex(minimumdoelen: string, ids: readonly string[]): void {
  schrijf(minimumdoelen, ['index.json'], {
    app: 'boosterz',
    kind: 'minimumdoelen-index',
    v: 1,
    naamsvermelding: NAAMSVERMELDING,
    licentie: 'nog te bevestigen',
    sets: [{
      id: MINIMALE_SET,
      naam: 'Secundair onderwijs 2de graad - Testvak - Cesuurdoelen',
      korteNaam: 'Testvak',
      versie: '1.0',
      geldigheid: 'Geldig',
      geldigVan: '2023-09-01',
      graad: '2de graad',
      aantal: ids.length,
      sha256: sha256Van(ids),
      opgehaald: MINIMALE_TIJD,
      bestand: `${MINIMALE_SET}.json`,
    }],
  });
}

/** Een gezonde minimale map: de koppeling kent de set op het huidige versiemerk, met alle vier de nummers. */
function maakMinimaleMap(): MinimaleMap {
  const wortel = mkdtempSync(join(tmpdir(), 'studierichtingen-minimaal-'));
  tijdelijk.push(wortel);
  const uit = join(wortel, 'uit');
  const minimumdoelen = join(wortel, 'minimumdoelen');
  mkdirSync(join(uit, 'richtingdoelen'), { recursive: true });
  mkdirSync(minimumdoelen, { recursive: true });
  schrijfMinimaalSetbestand(minimumdoelen, MINIMALE_IDS);
  schrijfMinimaleMdIndex(minimumdoelen, MINIMALE_IDS);
  const merk = sha256Van(MINIMALE_IDS).slice(0, 16);

  const groepen = [{ nummer: MINIMALE_GROEP, titel: 'Testrichting', graad: '2', finaliteit: 'D', onderwijsniveau: 'Secundair Onderwijs', soortLeerjaar: 'Leerjaar', onderdelen: [9001] }];
  const onderdelen = [{ nummer: 9001, groep: MINIMALE_GROEP, titel: 'Testrichting', onderwijsvorm: 'ASO', begindatum: '2020-09-01', leerjaren: [{ code: '3', omschrijving: 'Derde leerjaar' }], hoofdstructuren: ['311'] }];
  const matrixSha = sha256Van({ groepen, onderdelen });
  schrijf(uit, ['studierichtingen.json'], {
    app: 'boosterz',
    kind: 'studierichtingen',
    v: 1,
    bron: 'https://onderwijs-api-portaal.vlaanderen.be/',
    api: 'https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/structuuronderdelen/v2/structuuronderdeelgroep',
    naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen)',
    licentie: 'nog te bevestigen',
    opgehaald: MINIMALE_TIJD,
    aantalGroepen: 1,
    aantalOnderdelen: 1,
    sha256: matrixSha,
    groepen,
    onderdelen,
  });

  const sets = [{ set: MINIMALE_SET, setSha: merk, setAantal: MINIMALE_IDS.length, ids: [...MINIMALE_IDS] }];
  const bestandSha = sha256Van(sets);
  schrijf(uit, ['richtingdoelen', `${MINIMALE_GROEP}.json`], {
    app: 'boosterz',
    kind: 'richtingdoelen',
    v: 1,
    groep: MINIMALE_GROEP,
    titel: 'Testrichting',
    graad: '2',
    methode: 'api',
    filter: `structuuronderdeel_groep_nummer=${MINIMALE_GROEP}`,
    bron: 'https://www.onderwijsdoelen.be/',
    api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel',
    naamsvermelding: NAAMSVERMELDING,
    licentie: 'nog te bevestigen',
    opgehaald: MINIMALE_TIJD,
    aantal: MINIMALE_IDS.length,
    sha256: bestandSha,
    sets,
  });
  schrijf(uit, ['richtingdoelen', 'index.json'], {
    app: 'boosterz',
    kind: 'richtingdoelen-index',
    v: 1,
    bron: 'https://www.onderwijsdoelen.be/',
    api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen/onderwijsdoel?structuuronderdeel_groep_nummer=',
    naamsvermelding: NAAMSVERMELDING,
    licentie: 'nog te bevestigen',
    matrixSha256: matrixSha,
    groepen: [{ groep: MINIMALE_GROEP, status: 'gekoppeld', methode: 'api', aantal: MINIMALE_IDS.length, sets: 1, sha256: bestandSha, opgehaald: MINIMALE_TIJD, bestand: `${MINIMALE_GROEP}.json` }],
  });
  return { uit, minimumdoelen, merk };
}

describe('zelftest: het versiemerk, op een eigen minimale map', () => {
  it('de minimale map is zelf in orde: geen fout en geen melding over een ander versiemerk', () => {
    const map = maakMinimaleMap();
    // De map moet door de validators van de module komen, anders toetst de rest van dit blok niets.
    expect(valideerMatrixBestand(lees(map.uit, 'studierichtingen.json'))).toEqual([]);
    expect(valideerRichtingDoelenIndex(lees(map.uit, 'richtingdoelen', 'index.json'))).toEqual([]);
    expect(valideerRichtingDoelenBestand(lees(map.uit, 'richtingdoelen', `${MINIMALE_GROEP}.json`), MINIMALE_GROEP)).toEqual([]);
    const { fouten, info } = controleerStructuurMap(map.uit, map.minimumdoelen, { soortStreng: true });
    expect(fouten).toEqual([]);
    expect(info.filter((t) => t.startsWith('F2:'))).toEqual([]);
  });

  it('een set die sindsdien één doel verloor (nieuw versiemerk): geen fout, wel een melding met de juiste tellingen', () => {
    const map = maakMinimaleMap();
    // De maandelijkse update: het setbestand en de index van de minimumdoelen veranderen, de koppeling nog niet.
    const nieuw = MINIMALE_IDS.slice(0, -1);
    schrijfMinimaalSetbestand(map.minimumdoelen, nieuw);
    schrijfMinimaleMdIndex(map.minimumdoelen, nieuw);
    const { fouten, info } = controleerStructuurMap(map.uit, map.minimumdoelen);
    expect(fouten).toEqual([]);
    const melding = info.find((t) => t.startsWith('F2:'));
    expect(melding).toMatch(/^F2: 1 sets in de koppeling hebben een ander versiemerk dan de huidige minimumdoelen/);
    // Eén set in de map: de lijst voorbeelden is dus volledig en de telling is niet afhankelijk van andere sets.
    expect(melding).toContain(`${MINIMALE_GROEP}, ${MINIMALE_SET}: koppeling "${map.merk}", nu "${sha256Van(nieuw).slice(0, 16)}"`);
    expect(melding).toMatch(/; 1 nummers staan niet meer in de huidige set\./);
    expect(melding).toMatch(/\(0 sets hadden een gelijk merk\)/);
  });

  it('een bijgewerkte set waaruit niets verdween (nieuw versiemerk): geen fout, 0 nummers weg', () => {
    const map = maakMinimaleMap();
    const nieuw = [...MINIMALE_IDS, '9001005'];
    schrijfMinimaalSetbestand(map.minimumdoelen, nieuw);
    schrijfMinimaleMdIndex(map.minimumdoelen, nieuw);
    const { fouten, info } = controleerStructuurMap(map.uit, map.minimumdoelen);
    expect(fouten).toEqual([]);
    expect(info.find((t) => t.startsWith('F2:'))).toMatch(/; 0 nummers staan niet meer in de huidige set\./);
  });

  it('hetzelfde verloren doel bij een gelijk versiemerk is wel een fout (het verschil met en zonder nieuw merk)', () => {
    const map = maakMinimaleMap();
    // Alleen het setbestand verliest een doel; de index (en dus het versiemerk) blijft zoals de koppeling het kent.
    schrijfMinimaalSetbestand(map.minimumdoelen, MINIMALE_IDS.slice(0, -1));
    const { fouten, info } = controleerStructuurMap(map.uit, map.minimumdoelen);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/^F2: G-9001, ODS_9001: 1 nummers staan niet in het setbestand \(9001004\), bij een gelijk versiemerk\./);
    expect(info.filter((t) => t.startsWith('F2:'))).toEqual([]);
  });
});

// ── Kleine eigenschappen van de hulpfuncties ────────────────────────────────

describe('hulpfuncties van de datatest', () => {
  it('isEchteDatum', () => {
    expect(isEchteDatum('2026-10-09')).toBe(true);
    expect(isEchteDatum('2024-02-29')).toBe(true);
    for (const slecht of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-1-1', '2026-10-09T00:00:00Z', '', undefined, 20261009]) {
      expect(isEchteDatum(slecht), String(slecht)).toBe(false);
    }
  });

  it('graadVanSet', () => {
    expect(graadVanSet('1ste graad')).toBe('1');
    expect(graadVanSet('2de graad')).toBe('2');
    expect(graadVanSet('3de graad')).toBe('3');
    expect(graadVanSet(undefined)).toBeUndefined();
    expect(graadVanSet('2de en 3de graad')).toBeUndefined();
  });

  it('infoUitvoer: een kopregel, hoogstens 20 meldingen en een teller voor de rest', () => {
    expect(infoUitvoer([])).toBe('');
    expect(infoUitvoer(['M5: a'])).toBe('studierichtingen: 1 infomelding bij public/leerplannen/structuur\n  M5: a\n');
    expect(infoUitvoer(['M5: a', 'F2: b'])).toBe('studierichtingen: 2 infomeldingen bij public/leerplannen/structuur\n  M5: a\n  F2: b\n');
    const exact = infoUitvoer(Array.from({ length: MAX_INFO_REGELS }, (_, n) => `F2: ${n}`));
    expect(exact.trimEnd().split('\n')).toHaveLength(1 + MAX_INFO_REGELS);
    expect(exact).not.toContain('… en nog');
    const lang = infoUitvoer(Array.from({ length: MAX_INFO_REGELS + 5 }, (_, n) => `F2: ${n}`));
    const regels = lang.trimEnd().split('\n');
    expect(regels).toHaveLength(1 + MAX_INFO_REGELS + 1);
    expect(regels[0]).toBe(`studierichtingen: ${MAX_INFO_REGELS + 5} infomeldingen bij public/leerplannen/structuur`);
    expect(regels[regels.length - 1]).toBe('  … en nog 5 meldingen');
  });

  it('samenvatting telt de info per code', () => {
    expect(samenvatting(undefined)).toBe('');
    expect(samenvatting([])).toBe('');
    expect(samenvatting(['F2: a', 'M5: b', 'F2: c'])).toBe(' [info: F2 ×2, M5 ×1]');
  });

  it('Meldingen beperkt elke code en houdt de volgorde van de invarianten aan', () => {
    const m = new Meldingen();
    for (let n = 0; n < MAX_PER_CODE + 5; n++) m.voeg('F1', `fout ${n}`);
    m.voeg('M1', 'eerst');
    const lijst = m.lijst();
    expect(lijst[0]).toBe('M1: eerst');
    expect(lijst).toHaveLength(1 + MAX_PER_CODE + 1);
    expect(lijst[lijst.length - 1]).toBe('F1: … en nog 5 van dezelfde soort');
  });

  it('de gedeelde schakelaars staan op false (tot de eerste echte run)', () => {
    expect([KRUISCONTROLE_STRENG, ONDERWIJSSOORT_STRENG, HISTORIEK_STRENG]).toEqual([false, false, false]);
  });
});
