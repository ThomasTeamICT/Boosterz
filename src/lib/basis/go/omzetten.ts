// Omzetten van de ruwe JSON (tools/basis/go/lees_docx.py en lees_xlsx.py) naar de bestanden van public/basis/go/
// (docs/basisonderwijs/GO-LEERPLAN.md, "Import" en "Controles", met de rechtzettingen van de rechter en de antwoorden
// van de eigenaar van 9 november 2026).
//
// - zetLesplanOm: een lesplan (docx) → GoLesplanBestand. De tekst blijft letterlijk; alleen runs met dezelfde opmaak
//   worden samengevoegd, een regeleinde wordt {br:true} en een alinea met alleen witruimte valt weg.
// - zetLeerplanOm: een doelenset (xlsx) → GoLeerplanBestand, met de officiële koppeling (koppelen.ts).
// - controleerLesplanTegenLeerplan: de controles over lesplan en doelenset heen.
// - maakBijMinimumdoel en maakIndex: de omgekeerde index en de index.
//
// Elke afwijking van de vorm (vorm.ts) wordt een Afwijking. Staat ze in bekende-afwijkingen.json (met een reden), dan
// is ze 'bekend' en gaat de import verder; anders stopt tools/basis/go/maak.ts met exit 3. De tekst van het GO! wordt
// nooit verbeterd, en de tekst van een minimumdoel komt nooit uit de Excel.
//
// Zuiver: geen I/O. De sha256 rekent sha256Hex (src/lib/sha256.ts) over canoniek (src/lib/minimumdoelen.ts), zoals de
// uitrolpoort.
import { canoniek } from '../../minimumdoelen';
import { sha256Hex } from '../../sha256';
import { GO_LEEFTIJDEN, isGoLeeftijd } from './leeftijden';
import { slugVan } from './goModel';
import { koppel, vakVanCode, type KoppelUitkomst, type Opzoektabel } from './koppelen';
import {
  GO_MOMENTEN,
  GO_NAAMSVERMELDING,
  GO_STUDIO_URL,
  GO_VAK_CODES,
  GO_VAKKEN,
  KENNISVERWERKINGEN,
  bijMinimumdoelShaInvoer,
  isGoVak,
  leerplanShaInvoer,
  lesplanShaInvoer,
  type Blok,
  type Cel,
  type CelBlok,
  type GoBeeld,
  type GoBijDoel,
  type GoBijMinimumdoelBestand,
  type GoBronBestand,
  type GoDoelInhoud,
  type GoIndex,
  type GoKoppeling,
  type GoLeeftijd,
  type GoLeerplanBestand,
  type GoLeerplandoel,
  type GoLesplanAfgeleid,
  type GoLesplanBestand,
  type GoMinimumdoelRef,
  type GoMoment,
  type GoRubriek,
  type GoTekst,
  type GoTwijfel,
  type GoVak,
  type GoVerwijzingen,
  type GoVia,
  type Kennisverwerking,
  type Regel,
  type Stuk,
  type TekstStuk,
  type Wijzer,
} from './types';
import { isZonderMinimumdoel, regelTekst, splitsVerwijzingen, vetBegin } from './valideer';
import {
  ALINEASTIJLEN,
  BEGRIPPEN_LABEL,
  DIPLOMA_BEGRIPPEN,
  DIPLOMA_NAVIGATOR,
  EMU_PER_PX,
  FICHE_NAVIGATOR,
  ICOON_MEDIA,
  KOL,
  KOLOMMEN,
  KOPPEN_DEEL3,
  KOPRIJ_VULLING,
  LESPLAN_DELEN,
  METAREGELS,
  MIA_LABEL,
  MIA_SCHEIDING,
  MIN_STAPPEN,
  MOMENT_KOLOMMEN,
  OPSOMTEKEN,
  RE_DIPLOMA_KOP,
  RE_DOELREGEL,
  RE_FICHE,
  RE_GO_CODE,
  RE_IKDOEL_KOP,
  RE_LESPLAN_TITEL,
  RIJKOP_LESDOEL,
  RIJKOP_LESKERN,
  RIJKOPPEN_LESOPBOUW,
  RIJSOORTEN_MET_KOPPELING,
  RPR_GEKEND,
  STAPPEN,
  TABELLEN,
  TRAINEN_INLEIDING,
  TYPES,
  VERWACHTE_MINIMUMDOELVAKKEN,
  gewoon,
  isLeeg,
  type RijSoort,
  type TrainenVorm,
} from './vorm';

// ── Ruwe JSON (de uitvoer van de Python-lezers, zonder interpretatie) ─────

export type RuwRun =
  | { t: 'tekst'; tekst: string; b?: boolean; i?: boolean; u?: boolean; strike?: boolean; dstrike?: boolean; vertAlign?: string }
  | { t: 'br'; soort: string }
  | { t: 'tab' }
  | { t: 'beeld'; bestand: string | null; sha1: string | null; breed: number | null; hoog: number | null; rid?: string | null; link?: string | null; naam?: string | null; alt?: string | null };

export interface RuwAlinea {
  t: 'p';
  stijl: string | null;
  stijlen_ruw: string[];
  num: { numId: string; ilvl: number | string; fmt: string | null; start: number | null } | null;
  runs: RuwRun[];
}

export interface RuwCel {
  span: number;
  vmerge: string | null;
  vulling: string | null;
  blokken: RuwBlok[];
}

export interface RuwTabel {
  t: 'tbl';
  rijen: { cellen: RuwCel[] }[];
}

export type RuwBlok = RuwAlinea | RuwTabel | { t: 'onbekend'; tag: string };

/** Grootte en sha256 van het bestand waaruit de lezer de ruwe JSON las (maak.ts vergelijkt ze met het origineel in bron/). */
export interface RuwBron {
  bytes: number;
  sha256: string;
}

export interface RuwDocx {
  bestand: string;
  bron: RuwBron;
  gemaakt: string | null;
  media: { naam: string; bytes: number; sha1: string }[];
  stijlen: Record<string, string>;
  tellingen: Record<string, number>;
  body: RuwBlok[];
}

export interface RuwOpmaakRun {
  t: string;
  strike?: boolean;
  dstrike?: boolean;
  vertAlign?: string;
  /** Cursief: alleen uit een run van de gedeelde tekst, nooit via de celstijl (lees_xlsx.py). */
  i?: boolean;
  cel?: boolean;
}

export interface RuwRij {
  r: number;
  c: (string | null)[];
  opmaak?: Record<string, RuwOpmaakRun[]>;
}

/** Een cel die geen gedeelde tekst, inlineStr of boolean is (n, e, str, d), of een waarde met een Excel-escape. */
export interface RuwVreemdeCel {
  r: number;
  /** De kolom, vanaf 0. */
  k: number;
  soort: string;
  /** Hoogstens 40 tekens. */
  waarde: string;
}

export interface RuwXlsx {
  bestand: string;
  bron: RuwBron;
  gewijzigd: string | null;
  bladnamen: { naam: string; staat: string }[];
  blad: string;
  merged: string[];
  tellingen: Record<string, number>;
  vreemde_cellen: RuwVreemdeCel[];
  /** Rijnummers van verborgen rijen met een waarde. */
  verborgen_rijen: number[];
  /** [van, tot], kolommen vanaf 0. */
  verborgen_kolommen: [number, number][];
  /** Het aantal leden met opmerkingen (xl/comments*.xml, xl/threadedComments/*). */
  opmerkingen: number;
  /** [rij, kolom] van elk anker in de drawing van het blad (rij vanaf 1, kolom vanaf 0; [0, 0] zonder cel). */
  beelden: [number, number][];
  rijen: RuwRij[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isGeheel = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const RE_SHA256 = /^[0-9a-f]{64}$/;

/** Het veld bron van de ruwe JSON: {bytes, sha256} van het gelezen bestand. */
function controleerRuwBron(json: Obj, uit: string[]): void {
  const b = json.bron;
  if (!isObj(b) || !isGeheel(b.bytes) || typeof b.sha256 !== 'string' || !RE_SHA256.test(b.sha256)) uit.push('"bron" ontbreekt of is ongeldig ({bytes, sha256} van het gelezen bestand; lees het bestand opnieuw)');
}

/** Een structurele controle van de ruwe docx-JSON vóór gebruik: de lezer is van ons, maar de invoer niet. */
export function controleerRuwDocx(json: unknown): string[] {
  const uit: string[] = [];
  if (!isObj(json)) return ['de ruwe docx-JSON is geen object'];
  if (typeof json.bestand !== 'string') uit.push('"bestand" ontbreekt');
  controleerRuwBron(json, uit);
  if (json.gemaakt !== null && typeof json.gemaakt !== 'string') uit.push('"gemaakt" is geen tekst');
  if (!Array.isArray(json.media) || !json.media.every((m) => isObj(m) && typeof m.naam === 'string' && typeof m.sha1 === 'string')) uit.push('"media" is ongeldig');
  if (!isObj(json.tellingen)) uit.push('"tellingen" ontbreekt');
  if (!Array.isArray(json.body)) return [...uit, '"body" is geen lijst'];
  const blokken = (l: unknown[], pad: string, diepte: number): void => {
    l.forEach((b, i) => {
      const p = `${pad}[${i}]`;
      if (!isObj(b)) return void uit.push(`${p} is geen object`);
      if (b.t === 'p') {
        if (b.stijl !== null && typeof b.stijl !== 'string') uit.push(`${p}.stijl is ongeldig`);
        if (b.num !== null && !(isObj(b.num) && typeof b.num.numId === 'string')) uit.push(`${p}.num is ongeldig`);
        if (!Array.isArray(b.runs)) return void uit.push(`${p}.runs is geen lijst`);
        b.runs.forEach((r, j) => {
          const rp = `${p}.runs[${j}]`;
          if (!isObj(r)) return void uit.push(`${rp} is geen object`);
          if (r.t === 'tekst' && typeof r.tekst !== 'string') uit.push(`${rp}.tekst is geen tekst`);
          else if (r.t === 'br' && typeof r.soort !== 'string') uit.push(`${rp}.soort ontbreekt`);
          else if (r.t !== 'tekst' && r.t !== 'br' && r.t !== 'tab' && r.t !== 'beeld') uit.push(`${rp} heeft een onbekende soort`);
        });
      } else if (b.t === 'tbl') {
        if (diepte > 1) uit.push(`${p} is te diep genest`);
        if (!Array.isArray(b.rijen)) return void uit.push(`${p}.rijen is geen lijst`);
        b.rijen.forEach((rij, r) => {
          if (!isObj(rij) || !Array.isArray(rij.cellen)) return void uit.push(`${p}.rijen[${r}] is ongeldig`);
          rij.cellen.forEach((c, k) => {
            const cp = `${p}.rijen[${r}].cellen[${k}]`;
            if (!isObj(c) || typeof c.span !== 'number' || !Array.isArray(c.blokken)) return void uit.push(`${cp} is ongeldig`);
            blokken(c.blokken, `${cp}.blokken`, diepte + 1);
          });
        });
      } else if (b.t !== 'onbekend') {
        uit.push(`${p} heeft een onbekende soort`);
      }
    });
  };
  blokken(json.body, 'body', 0);
  return uit.slice(0, 20);
}

/** Een structurele controle van de ruwe xlsx-JSON vóór gebruik. */
export function controleerRuwXlsx(json: unknown): string[] {
  const uit: string[] = [];
  if (!isObj(json)) return ['de ruwe xlsx-JSON is geen object'];
  if (typeof json.bestand !== 'string') uit.push('"bestand" ontbreekt');
  if (typeof json.blad !== 'string') uit.push('"blad" ontbreekt');
  if (json.gewijzigd !== null && typeof json.gewijzigd !== 'string') uit.push('"gewijzigd" is geen tekst');
  if (!Array.isArray(json.bladnamen)) uit.push('"bladnamen" is geen lijst');
  if (!Array.isArray(json.merged)) uit.push('"merged" is geen lijst');
  controleerRuwBron(json, uit);
  if (!isObj(json.tellingen)) uit.push('"tellingen" ontbreekt');
  if (!Array.isArray(json.vreemde_cellen) || !json.vreemde_cellen.every((v) => isObj(v) && isGeheel(v.r, 1) && isGeheel(v.k) && typeof v.soort === 'string' && typeof v.waarde === 'string')) uit.push('"vreemde_cellen" is geen lijst van {r, k, soort, waarde}');
  if (!Array.isArray(json.verborgen_rijen) || !json.verborgen_rijen.every((v) => isGeheel(v, 1))) uit.push('"verborgen_rijen" is geen lijst van rijnummers');
  const paar = (v: unknown) => Array.isArray(v) && v.length === 2 && isGeheel(v[0]) && isGeheel(v[1]);
  if (!Array.isArray(json.verborgen_kolommen) || !json.verborgen_kolommen.every(paar)) uit.push('"verborgen_kolommen" is geen lijst van [van, tot]');
  if (!isGeheel(json.opmerkingen)) uit.push('"opmerkingen" is geen aantal');
  if (!Array.isArray(json.beelden) || !json.beelden.every(paar)) uit.push('"beelden" is geen lijst van [rij, kolom]');
  if (!Array.isArray(json.rijen)) return [...uit, '"rijen" is geen lijst'];
  let vorige = 0;
  json.rijen.forEach((r, i) => {
    if (uit.length > 20) return;
    if (!isObj(r) || typeof r.r !== 'number' || !Array.isArray(r.c)) return void uit.push(`rijen[${i}] is ongeldig`);
    if (r.r <= vorige) uit.push(`rijen[${i}]: de rijnummers lopen niet op`);
    vorige = r.r;
    if (!r.c.every((v) => v === null || typeof v === 'string')) uit.push(`rij ${r.r}: een cel is geen tekst`);
    if (r.opmaak !== undefined && !isObj(r.opmaak)) uit.push(`rij ${r.r}: "opmaak" is ongeldig`);
  });
  return uit.slice(0, 20);
}

// ── Bekende afwijkingen (tools/basis/go/bekende-afwijkingen.json) ─────

interface BekendBasis {
  reden: string;
  /** JJJJ-MM-DD. */
  datum: string;
}

export type BekendeAfwijking = BekendBasis &
  (
    | { soort: 'xlsx-kop'; vak: GoVak; kolom: number; waarde: string }
    | { soort: 'rubriek-met-leeftijd'; vak: GoVak; rij: number; tekst: string }
    | { soort: 'verwijzing-kapot'; doel: string; kolom: 'VLAGGEN' | 'SCHAKELS'; waarde: string }
    | { soort: 'koppeling-voorstel'; doel: string; moment: GoMoment; bronCode: string; voorstel: string }
    | { soort: 'koppeling-ander-vak'; doel: string; moment: GoMoment; code: string }
    | { soort: 'minimumdoelrij'; vak: GoVak; rij: number }
    | { soort: 'minimumdoelrij-is-inhoud'; vak: GoVak; rij: number; doel: string; als: string; tekst: string }
    | { soort: 'opmaak'; vak: GoVak; rij: number; kolom: number; tekst: string; besluit: 'opmaak-bewaren' }
    | { soort: 'xlsx-beeld'; vak: GoVak; rij: number; kolom: number }
    | { soort: 'lesplan-doeltekst'; lesplan: string; doel: string; tekst: string }
    | { soort: 'lesplan-leeftijd'; lesplan: string; doel: string }
    | { soort: 'lessenlijn-variant'; lesplan: string; veld: 'lessenlijn' | 'lessenreeks'; naam: string }
    | { soort: 'lesplan-deel'; lesplan: string; kop: string }
    | {
        soort: 'lesplan-beeld';
        sha1: string;
        lesplannen: string[];
        status: 'getoond' | 'weggelaten';
        bestand?: string;
        alt?: string;
        uitleg?: string;
        /** sha256 van het getoonde bestand (bv. de WebP): maak.ts en de uitrolpoort rekenen het na. */
        sha256?: string;
      }
  );

export type BekendeSoort = BekendeAfwijking['soort'];

const BEKENDE_VELDEN: Readonly<Record<BekendeSoort, { verplicht: readonly string[]; optioneel?: readonly string[] }>> = {
  'xlsx-kop': { verplicht: ['vak', 'kolom', 'waarde'] },
  'rubriek-met-leeftijd': { verplicht: ['vak', 'rij', 'tekst'] },
  'verwijzing-kapot': { verplicht: ['doel', 'kolom', 'waarde'] },
  'koppeling-voorstel': { verplicht: ['doel', 'moment', 'bronCode', 'voorstel'] },
  'koppeling-ander-vak': { verplicht: ['doel', 'moment', 'code'] },
  minimumdoelrij: { verplicht: ['vak', 'rij'] },
  'minimumdoelrij-is-inhoud': { verplicht: ['vak', 'rij', 'doel', 'als', 'tekst'] },
  opmaak: { verplicht: ['vak', 'rij', 'kolom', 'tekst', 'besluit'] },
  'xlsx-beeld': { verplicht: ['vak', 'rij', 'kolom'] },
  'lesplan-doeltekst': { verplicht: ['lesplan', 'doel', 'tekst'] },
  'lesplan-leeftijd': { verplicht: ['lesplan', 'doel'] },
  'lessenlijn-variant': { verplicht: ['lesplan', 'veld', 'naam'] },
  'lesplan-deel': { verplicht: ['lesplan', 'kop'] },
  'lesplan-beeld': { verplicht: ['sha1', 'lesplannen', 'status'], optioneel: ['bestand', 'alt', 'uitleg', 'sha256'] },
};

/** Leest bekende-afwijkingen.json streng: een onbekend veld of een regel zonder reden of datum is een fout. */
export function leesBekendeAfwijkingen(json: unknown): { afwijkingen: BekendeAfwijking[]; fouten: string[] } {
  const fouten: string[] = [];
  if (!isObj(json) || !Array.isArray(json.afwijkingen)) return { afwijkingen: [], fouten: ['bekende-afwijkingen.json heeft geen lijst "afwijkingen"'] };
  for (const k of Object.keys(json)) if (k !== 'afwijkingen' && k !== 'uitleg') fouten.push(`onbekend veld "${k}"`);
  const uit: BekendeAfwijking[] = [];
  json.afwijkingen.forEach((a, i) => {
    const p = `afwijkingen[${i}]`;
    if (!isObj(a) || typeof a.soort !== 'string' || !(a.soort in BEKENDE_VELDEN)) return void fouten.push(`${p}: onbekende soort`);
    const v = BEKENDE_VELDEN[a.soort as BekendeSoort];
    const toegelaten = new Set(['soort', 'reden', 'datum', ...v.verplicht, ...(v.optioneel ?? [])]);
    for (const k of Object.keys(a)) if (!toegelaten.has(k)) fouten.push(`${p}: onbekend veld "${k}"`);
    for (const k of ['reden', 'datum', ...v.verplicht]) if (a[k] === undefined) fouten.push(`${p}: veld "${k}" ontbreekt`);
    if (typeof a.reden !== 'string' || a.reden.trim().length < 10) fouten.push(`${p}: de reden ontbreekt of is te kort`);
    if (typeof a.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.datum)) fouten.push(`${p}: de datum is geen JJJJ-MM-DD`);
    if ('vak' in a && !isGoVak(a.vak)) fouten.push(`${p}: "vak" is geen vakdiscipline`);
    if ('moment' in a && !(GO_MOMENTEN as readonly unknown[]).includes(a.moment)) fouten.push(`${p}: "moment" is geen KO, L4 of L6`);
    const getallen = a.soort === 'verwijzing-kapot' ? ['rij'] : ['rij', 'kolom'];
    for (const k of getallen) if (k in a && (typeof a[k] !== 'number' || !Number.isInteger(a[k]) || (a[k] as number) < 0)) fouten.push(`${p}: "${k}" is geen geheel getal`);
    if (a.soort === 'verwijzing-kapot' && a.kolom !== 'VLAGGEN' && a.kolom !== 'SCHAKELS') fouten.push(`${p}: "kolom" is VLAGGEN of SCHAKELS`);
    if (a.soort === 'lesplan-beeld') {
      if (!Array.isArray(a.lesplannen) || !a.lesplannen.every((x) => typeof x === 'string')) fouten.push(`${p}: "lesplannen" is geen lijst van codes`);
      if (a.status === 'getoond' && (typeof a.bestand !== 'string' || typeof a.alt !== 'string')) fouten.push(`${p}: een getoond beeld heeft "bestand" en "alt"`);
      if (a.status === 'weggelaten' && typeof a.uitleg !== 'string') fouten.push(`${p}: een weggelaten beeld heeft "uitleg"`);
      if (a.status !== 'getoond' && a.status !== 'weggelaten') fouten.push(`${p}: "status" is getoond of weggelaten`);
      if (a.sha256 !== undefined && (typeof a.sha256 !== 'string' || !RE_SHA256.test(a.sha256))) fouten.push(`${p}: "sha256" is geen sha256 (64 hex-tekens, kleine letters)`);
    }
    if (a.soort === 'lessenlijn-variant' && a.veld !== 'lessenlijn' && a.veld !== 'lessenreeks') fouten.push(`${p}: "veld" is lessenlijn of lessenreeks`);
    if (a.soort === 'opmaak' && a.besluit !== 'opmaak-bewaren') fouten.push(`${p}: "besluit" is 'opmaak-bewaren'`);
    for (const k of Object.keys(a)) {
      const w = a[k];
      if (!getallen.includes(k) && k !== 'lesplannen' && typeof w !== 'string') fouten.push(`${p}: "${k}" is geen tekst`);
    }
    uit.push(a as unknown as BekendeAfwijking);
  });
  return { afwijkingen: uit, fouten };
}

/** De bekende afwijkingen, met bijhouden welke gebruikt zijn (een ongebruikte regel komt als 'verouderd' in het rapport). */
export class Bekende {
  private readonly gebruikt = new Set<number>();
  constructor(readonly lijst: readonly BekendeAfwijking[]) {}

  zoek<S extends BekendeSoort>(soort: S, past: (a: Extract<BekendeAfwijking, { soort: S }>) => boolean): Extract<BekendeAfwijking, { soort: S }> | undefined {
    for (let i = 0; i < this.lijst.length; i++) {
      const a = this.lijst[i];
      if (a.soort === soort && past(a as Extract<BekendeAfwijking, { soort: S }>)) {
        this.gebruikt.add(i);
        return a as Extract<BekendeAfwijking, { soort: S }>;
      }
    }
    return undefined;
  }

  ongebruikt(): BekendeAfwijking[] {
    return this.lijst.filter((_, i) => !this.gebruikt.has(i));
  }
}

// ── Afwijkingen ──────────────────────────────────────────────────────

export interface Afwijking {
  /** Kort en vast, bv. 'verwijzing-kapot' of 'lesplan-tabel'. */
  soort: string;
  /** Het bestand: een vakdiscipline (WT) of een lesplancode (LP0065). */
  bestand: string;
  /** De plaats: 'rij 1209', 'deel 4, tabel, rij 3' … */
  waar: string;
  bericht: string;
  /** Gevonden in bekende-afwijkingen.json: dan gaat de import verder. */
  bekend?: { reden: string; datum: string };
}

export class Afwijkingen {
  readonly lijst: Afwijking[] = [];
  constructor(readonly bestand: string) {}

  nieuw(soort: string, waar: string, bericht: string): void {
    this.lijst.push({ soort, bestand: this.bestand, waar, bericht });
  }

  bekend(soort: string, waar: string, bericht: string, b: BekendBasis): void {
    this.lijst.push({ soort, bestand: this.bestand, waar, bericht, bekend: { reden: b.reden, datum: b.datum } });
  }

  /** Bekend als `b` bestaat, anders nieuw. */
  melding(soort: string, waar: string, bericht: string, b: BekendBasis | undefined): void {
    if (b) this.bekend(soort, waar, bericht, b);
    else this.nieuw(soort, waar, bericht);
  }

  get nieuwe(): Afwijking[] {
    return this.lijst.filter((a) => !a.bekend);
  }
}

// ── Kleine hulpfuncties ──────────────────────────────────────────────

const pad3 = (n: number) => String(n).padStart(3, '0');
const isTekstStuk = (s: Stuk): s is TekstStuk => 't' in s;
const vlaggen = (s: TekstStuk) => ['b', 'i', 'u', 's', 'sup'].filter((f) => s[f as keyof TekstStuk] === true).join(',');

/** Voegt aangrenzende tekststukken met dezelfde opmaak samen en laat lege tekststukken weg. */
export function voegSamen(stukken: readonly Stuk[]): Stuk[] {
  const uit: Stuk[] = [];
  for (const s of stukken) {
    if (isTekstStuk(s)) {
      if (s.t === '') continue;
      const vorige = uit[uit.length - 1];
      if (vorige && isTekstStuk(vorige) && vlaggen(vorige) === vlaggen(s)) {
        uit[uit.length - 1] = { ...vorige, t: vorige.t + s.t };
        continue;
      }
      uit.push({ ...s });
    } else {
      uit.push(s);
    }
  }
  return uit;
}

/** Heeft een regel iets zichtbaars: tekst die niet alleen witruimte (ook geen harde spatie) is, of een icoon? */
export function isZichtbaar(r: readonly Stuk[]): boolean {
  return r.some((s) => ('t' in s && s.t.trim() !== '') || 'icoon' in s);
}

/**
 * Tekst om te vergelijken, zoals normaliseerDoeltekst (src/lib/curriculum.ts:360): per regel witruimte samengevouwen
 * en getrimd, lege regels weg. Hier herhaald omdat curriculum.ts de opslag meetrekt; een test legt de gelijkheid vast.
 */
export function normaliseer(t: string): string {
  return t
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter((r) => r !== '')
    .join('\n');
}

/** '2,5-4 jaar, 4-5 jaar' → ['2,5-4', '4-5'], of undefined als het geen geldige, oplopende lijst is. */
export function leesLeeftijden(s: string): GoLeeftijd[] | undefined {
  const delen = s.split(', ');
  const uit: GoLeeftijd[] = [];
  for (const d of delen) {
    const m = /^(.+) jaar$/.exec(d.trim());
    if (!m || !isGoLeeftijd(m[1])) return undefined;
    if (uit.length > 0 && GO_LEEFTIJDEN.indexOf(m[1]) <= GO_LEEFTIJDEN.indexOf(uit[uit.length - 1])) return undefined;
    uit.push(m[1]);
  }
  return uit.length > 0 ? uit : undefined;
}

const leeftijdenTekst = (l: readonly GoLeeftijd[]) => l.map((x) => `${x} jaar`).join(', ');

/** De sha-256 van een bestand zoals de uitrolpoort ze narekent. */
export function shaVan(invoer: unknown): string {
  return sha256Hex(canoniek(invoer));
}

// ══ Lesplan (docx) ════════════════════════════════════════════════════

export interface LesplanBron {
  bytes: number;
  sha256: string;
  /** JJJJ-MM-DD. */
  ingelezen: string;
}

/** Wat de controles over lesplan en doelenset heen nodig hebben, naast het bestand. */
export interface LesplanExtra {
  /** De MIA-blokken in deel 2: titel en items, bij welk doel. */
  mia: { doel: string; titel: string; items: string[]; waar: string }[];
  /** 'Te hanteren begrippen: …' in deel 2. */
  begrippen: { doel: string; begrippen: string[]; waar: string }[];
  /** De regels met een vlag of schakel in deel 3, met de tekst en de leeftijden erachter. */
  verwijzingen: { soort: 'vlag' | 'schakel'; code: string; tekst: string; leeftijden: GoLeeftijd[] | undefined; waar: string }[];
  /** De doelregels bij de diploma's in deel 4. */
  ikDoelKoppen: { code: string; kennisverwerking: Kennisverwerking; leeftijden: GoLeeftijd[] | undefined; waar: string }[];
  /** De vorm van de activiteiten van 'Trainen'. */
  trainenVorm?: TrainenVorm;
  /** Beelden die geen pictogram zijn (de mindmap). */
  beelden: { sha1: string; bron: string; status: GoBeeld['status'] }[];
  /** Aantallen voor het rapport. */
  tellingen: { paginabreuken: number; witregels: number };
}

/** Eén omgezette alinea: een Regel, een beeld, of niets (alleen witruimte). */
type Omgezet =
  | { soort: 'regel'; regel: Regel; stijl: string | null; num: RuwAlinea['num'] }
  | { soort: 'beeld'; beeld: GoBeeld }
  | { soort: 'leeg' };

interface LesplanCtx {
  code: string;
  afw: Afwijkingen;
  bekende: Bekende;
  media: Map<string, { sha1: string }>;
  extra: LesplanExtra;
  /** numId → aantal genummerde items tot nu (Word nummert een numId door over het hele document). */
  nummering: Map<string, number>;
}

function zetAlineaOm(p: RuwAlinea, ctx: LesplanCtx, waar: string): Omgezet {
  if (p.stijl && !ALINEASTIJLEN.has(p.stijl)) ctx.afw.nieuw('docx-stijl', waar, `de alineastijl ${p.stijl} is niet gekend`);
  // Vet via de stijl Strong valt weg (de lezer geeft alleen opmaak van de run zelf door): elke zichtbare run moet zelf vet zijn.
  if (p.stijl === 'Strong' && p.runs.some((r) => r.t === 'tekst' && r.tekst.trim() !== '' && !r.b)) ctx.afw.nieuw('docx-stijl', waar, 'tekst in de stijl Strong zonder eigen vet');
  const stukken: Stuk[] = [];
  const beelden: Extract<RuwRun, { t: 'beeld' }>[] = [];
  for (const r of p.runs) {
    if (r.t === 'tekst') {
      if (r.strike || r.dstrike || r.vertAlign) ctx.afw.nieuw('docx-opmaak', waar, 'doorgehaalde tekst of super-/subschrift in een lesplan (alleen vet, cursief en onderlijnd zijn gekend)');
      if (/\r/.test(r.tekst)) ctx.afw.nieuw('docx-regeleinde', waar, 'een regeleinde \\r in de tekst');
      const opmaak: Omit<TekstStuk, 't'> = {};
      if (r.b) opmaak.b = true;
      if (r.i) opmaak.i = true;
      if (r.u) opmaak.u = true;
      r.tekst.split('\n').forEach((deel, i) => {
        if (i > 0) stukken.push({ br: true });
        if (deel !== '') stukken.push({ t: deel, ...opmaak });
      });
    } else if (r.t === 'br') {
      if (r.soort === 'page') ctx.extra.tellingen.paginabreuken++;
      else if (r.soort === 'regel' || r.soort === 'textWrapping') stukken.push({ br: true });
      else ctx.afw.nieuw('docx-breuk', waar, `een onbekende breuk "${r.soort}"`);
    } else if (r.t === 'tab') {
      ctx.afw.nieuw('docx-tab', waar, 'een tab (w:tab) in de tekst');
    } else if (r.t === 'beeld') {
      const icoon = r.bestand ? ICOON_MEDIA[r.bestand] : undefined;
      if (icoon) stukken.push({ icoon });
      else beelden.push(r);
    }
  }
  const regel = voegSamen(stukken);
  if (beelden.length > 0) {
    if (beelden.length > 1 || isZichtbaar(regel)) {
      ctx.afw.nieuw('docx-beeld', waar, 'een beeld staat in een alinea met tekst of met een ander beeld');
      return { soort: 'leeg' };
    }
    const b = beelden[0];
    const sha1 = b.sha1 ?? '';
    const naam = (b.bestand ?? '').split('/').pop() ?? '';
    const bekend = ctx.bekende.zoek('lesplan-beeld', (a) => a.sha1 === sha1 && a.lesplannen.includes(ctx.code));
    if (!bekend || !b.bestand || !b.breed || !b.hoog) {
      ctx.afw.nieuw('docx-beeld', waar, `een beeld dat geen pictogram is (${naam}, sha1 ${sha1.slice(0, 12)}…) en niet in bekende-afwijkingen.json staat`);
      return { soort: 'leeg' };
    }
    const basis = { soort: 'beeld' as const, bron: naam, breedte: Math.round(b.breed / EMU_PER_PX), hoogte: Math.round(b.hoog / EMU_PER_PX) };
    const beeld: GoBeeld =
      bekend.status === 'getoond'
        ? { ...basis, status: 'getoond', bestand: bekend.bestand ?? '', alt: bekend.alt ?? '', ...(bekend.uitleg ? { uitleg: bekend.uitleg } : {}) }
        : { ...basis, status: 'weggelaten', uitleg: bekend.uitleg ?? '' };
    ctx.afw.bekend('docx-beeld', waar, `beeld ${naam}: ${bekend.status}`, bekend);
    ctx.extra.beelden.push({ sha1, bron: naam, status: bekend.status });
    return { soort: 'beeld', beeld };
  }
  if (!isZichtbaar(regel)) {
    ctx.extra.tellingen.witregels++;
    return { soort: 'leeg' };
  }
  return { soort: 'regel', regel, stijl: p.stijl, num: p.num };
}

const KOPSTIJLEN: Readonly<Record<string, 1 | 2 | 3 | 4>> = { Heading1: 1, Heading2: 2, Heading3: 3, Heading4: 4 };

/** Zet een rij omgezette alinea's om naar blokken; opeenvolgende lijstitems met dezelfde numId worden één lijst. */
function groepeer(items: { o: Omgezet; waar: string }[], ctx: LesplanCtx, inCel: boolean): Blok[] {
  const uit: Blok[] = [];
  let lijst: { blok: Extract<Blok, { soort: 'lijst' }>; numId: string } | undefined;
  for (const { o, waar } of items) {
    if (o.soort === 'leeg') {
      lijst = undefined; // een witregel onderbreekt de lijst, zoals in het origineel
      continue;
    }
    if (o.soort === 'beeld') {
      lijst = undefined;
      uit.push(o.beeld);
      continue;
    }
    const niveau = o.stijl ? KOPSTIJLEN[o.stijl] : undefined;
    if (o.num) {
      if (o.stijl !== 'ListParagraph') ctx.afw.nieuw('docx-lijst', waar, `een lijstitem in de stijl ${String(o.stijl)} (verwacht ListParagraph)`);
      if (String(o.num.ilvl) !== '0') ctx.afw.nieuw('docx-lijst', waar, `lijstniveau ${String(o.num.ilvl)} (alleen niveau 0 is gekend)`);
      if (o.num.fmt !== 'bullet' && o.num.fmt !== 'decimal') ctx.afw.nieuw('docx-lijst', waar, `nummering "${String(o.num.fmt)}" (alleen bullet en decimal zijn gekend)`);
      const genummerd = o.num.fmt === 'decimal';
      if (!lijst || lijst.numId !== o.num.numId) {
        const blok: Extract<Blok, { soort: 'lijst' }> = { soort: 'lijst', genummerd, items: [] };
        if (genummerd) {
          const al = ctx.nummering.get(o.num.numId) ?? 0;
          const start = (o.num.start ?? 1) + al;
          if (start !== 1) blok.start = start;
        }
        lijst = { blok, numId: o.num.numId };
        uit.push(blok);
      }
      lijst.blok.items.push(o.regel);
      if (genummerd) ctx.nummering.set(o.num.numId, (ctx.nummering.get(o.num.numId) ?? 0) + 1);
      continue;
    }
    lijst = undefined;
    if (o.stijl === 'ListParagraph') ctx.afw.nieuw('docx-lijst', waar, 'een alinea in de stijl ListParagraph zonder nummering');
    if (niveau !== undefined) {
      if (inCel) ctx.afw.nieuw('docx-kop-in-cel', waar, 'een kop in een tabelcel');
      else uit.push({ soort: 'kop', niveau, tekst: o.regel });
      continue;
    }
    uit.push({ soort: 'alinea', tekst: o.regel });
  }
  return uit;
}

function zetTabelOm(t: RuwTabel, ctx: LesplanCtx, waar: string, metRijkop: boolean): Extract<Blok, { soort: 'tabel' }> {
  const rijen: Cel[][] = t.rijen.map((rij, r) =>
    rij.cellen.map((c, k) => {
      const cw = `${waar}, rij ${r}, kolom ${k}`;
      if (c.span !== 1) ctx.afw.nieuw('docx-tabel', cw, `een samengevoegde kolom (gridSpan ${c.span})`);
      const items: { o: Omgezet; waar: string }[] = [];
      c.blokken.forEach((b, i) => {
        const bw = `${cw}, alinea ${i}`;
        if (b.t === 'p') items.push({ o: zetAlineaOm(b, ctx, bw), waar: bw });
        else if (b.t === 'tbl') ctx.afw.nieuw('docx-tabel', bw, 'een tabel in een tabel');
        else ctx.afw.nieuw('docx-onbekend', bw, `een onbekend element <${b.tag}>`);
      });
      const blokken = groepeer(items, ctx, true) as CelBlok[];
      const kop = c.vulling === KOPRIJ_VULLING;
      if (kop !== (r === 0)) ctx.afw.nieuw('docx-tabel', cw, kop ? 'een grijze cel buiten de koprij' : 'een cel van de koprij is niet grijs');
      const cel: Cel = { rol: r === 0 ? 'kolomkop' : metRijkop && k === 0 ? 'rijkop' : 'data', blokken };
      if (c.vmerge === 'restart') cel.samengevoegd = 'begin';
      else if (c.vmerge === 'voort' || c.vmerge === 'continue') cel.samengevoegd = 'vervolg';
      else if (c.vmerge !== null) ctx.afw.nieuw('docx-tabel', cw, `een onbekende samenvoeging "${c.vmerge}"`);
      return cel;
    }),
  );
  return { soort: 'tabel', rijen };
}

/** De tekst van een regel met gewone spaties (een harde spatie telt als spatie), zonder witruimte rond. */
const regelGewoon = (r: Regel) => gewoon(regelTekst(r));
/** De tekst van een cel (alle blokken) met gewone spaties. */
const celGewoon = (c: Cel) => gewoon(c.blokken.map((b) => (b.soort === 'alinea' ? regelTekst(b.tekst) : b.soort === 'lijst' ? b.items.map(regelTekst).join('\n') : '')).join('\n'));

/** Begint een regel met een vet tekststuk dat precies `label` is (witruimte rond telt niet)? Geeft de rest. */
function naVetLabel(r: Regel, label: string): string | undefined {
  const eerste = r.find((s) => !('t' in s) || s.t.trim() !== '');
  if (!eerste || !('t' in eerste) || eerste.b !== true || gewoon(eerste.t) !== label) return undefined;
  const plaats = r.indexOf(eerste);
  return regelTekst(r.slice(plaats + 1));
}

/** Een lesplan: ruw → GoLesplanBestand (zonder dat het al gevalideerd is) en wat de controles nodig hebben. */
export function zetLesplanOm(
  ruw: RuwDocx,
  opties: { bekende: Bekende; bron: LesplanBron; afw?: Afwijkingen },
): { bestand: GoLesplanBestand | undefined; extra: LesplanExtra; afwijkingen: Afwijkingen } {
  const code = ruw.bestand.replace(/\.docx$/, '');
  const afw = opties.afw ?? new Afwijkingen(code);
  const extra: LesplanExtra = { mia: [], begrippen: [], verwijzingen: [], ikDoelKoppen: [], beelden: [], tellingen: { paginabreuken: 0, witregels: 0 } };
  const ctx: LesplanCtx = { code, afw, bekende: opties.bekende, media: new Map(ruw.media.map((m) => [m.naam, { sha1: m.sha1 }])), extra, nummering: new Map() };
  const mislukt = () => ({ bestand: undefined, extra, afwijkingen: afw });

  if (!/^LP\d{4}[a-z]?\.docx$/.test(ruw.bestand)) {
    afw.nieuw('lesplan-naam', 'bestand', `de bestandsnaam ${ruw.bestand} is geen LP0000.docx of LP0000a.docx`);
    return mislukt();
  }
  // Wat de lezer telde en wat het GO! nooit gebruikt.
  for (const [k, n] of Object.entries(ruw.tellingen)) {
    const verboden = ['hyperlinks', 'ins', 'del', 'sdt', 'tekstvakken', 'velden', 'veldtekens', 'commentaar_ankers', 'commentaar_verwijzingen', 'tab', 'tabellen_genest', 'pict', 'smartTag', 'fldSimple', 'hyperlink'];
    if (n > 0 && (verboden.includes(k) || /^(run_kind|p_kind|blok_onbekend):/.test(k))) afw.nieuw('docx-element', 'body', `${n} × ${k} (niet gekend in een lesplan)`);
    if (n > 0 && k.startsWith('rpr:') && !RPR_GEKEND.has(k.slice(4))) afw.nieuw('docx-opmaak', 'body', `${n} × ${k} (deze opmaak is niet gekend in een lesplan)`);
  }
  for (const m of ruw.media) {
    if (ICOON_MEDIA[m.naam]) continue;
    if (!opties.bekende.lijst.some((a) => a.soort === 'lesplan-beeld' && a.sha1 === m.sha1)) afw.nieuw('docx-media', m.naam, `een bestand in word/media dat geen gekend pictogram is (sha1 ${m.sha1.slice(0, 12)}…)`);
  }

  // 1. Blokken van de body, gesplitst in delen bij de koppen van niveau 1 en 2.
  const items: { o: Omgezet; waar: string; tabel?: RuwTabel; index: number }[] = [];
  ruw.body.forEach((b, i) => {
    const waar = `body ${i}`;
    if (b.t === 'p') items.push({ o: zetAlineaOm(b, ctx, waar), waar, index: i });
    else if (b.t === 'tbl') items.push({ o: { soort: 'leeg' }, waar, tabel: b, index: i });
    else afw.nieuw('docx-onbekend', waar, `een onbekend element <${b.tag}>`);
  });

  const delen: { nr: number; blokken: Blok[] }[] = [];
  let huidige: { o: Omgezet; waar: string }[] = [];
  let deelBlokken: Blok[] | undefined;
  const sluitAf = () => {
    if (deelBlokken) deelBlokken.push(...groepeer(huidige, ctx, false));
    huidige = [];
  };
  for (const it of items) {
    if (it.tabel) {
      sluitAf();
      if (!deelBlokken) {
        afw.nieuw('lesplan-vorm', it.waar, 'een tabel vóór de titel');
        continue;
      }
      const nr = delen.length - 1;
      deelBlokken.push(zetTabelOm(it.tabel, ctx, `deel ${nr}, blok ${deelBlokken.length}`, nr === 1 || nr === 2 || nr === 4));
      continue;
    }
    const o = it.o;
    const niveau = o.soort === 'regel' && o.stijl ? KOPSTIJLEN[o.stijl] : undefined;
    if (o.soort === 'regel' && (niveau === 1 || niveau === 2)) {
      sluitAf();
      if (niveau === 1 && delen.length > 0) afw.nieuw('lesplan-vorm', it.waar, 'meer dan één kop van niveau 1');
      if (niveau === 2 && delen.length === 0) afw.nieuw('lesplan-vorm', it.waar, 'een kop van niveau 2 vóór de titel');
      deelBlokken = [{ soort: 'kop', niveau, tekst: o.regel }];
      delen.push({ nr: delen.length, blokken: deelBlokken });
      continue;
    }
    if (!deelBlokken) {
      if (o.soort !== 'leeg') afw.nieuw('lesplan-vorm', it.waar, 'tekst vóór de titel (kop van niveau 1)');
      continue;
    }
    huidige.push(it);
  }
  sluitAf();
  if (delen.length === 0) {
    afw.nieuw('lesplan-vorm', 'body', 'geen kop van niveau 1');
    return mislukt();
  }

  // 2. Deel 0: de titel en de metaregels.
  const d0 = delen[0].blokken;
  const h1 = d0[0];
  const titelM = h1.soort === 'kop' && h1.niveau === 1 ? RE_LESPLAN_TITEL.exec(regelGewoon(h1.tekst)) : null;
  if (!titelM) {
    afw.nieuw('lesplan-titel', 'deel 0', 'de titel heeft niet de vorm "Lesplan <code> <titel> (<leeftijd> jaar)"');
    return mislukt();
  }
  const [, titelCode, titel, leeftijdTekst] = titelM;
  if (titelCode !== code) afw.nieuw('lesplan-titel', 'deel 0', `de code in de titel (${titelCode}) is niet die van het bestand (${code})`);
  if (!isGoLeeftijd(leeftijdTekst)) {
    afw.nieuw('lesplan-titel', 'deel 0', `"${leeftijdTekst}" is geen leeftijdsgroep van het GO!`);
    return mislukt();
  }
  const leeftijd = leeftijdTekst;
  const meta = new Map<string, string>();
  if (d0.length !== METAREGELS.length + 1) afw.nieuw('lesplan-metaregels', 'deel 0', `deel 0 heeft ${d0.length - 1} regels onder de titel (verwacht ${METAREGELS.length})`);
  METAREGELS.forEach((label, i) => {
    const b = d0[i + 1];
    const rest = b && b.soort === 'alinea' ? naVetLabel(b.tekst, `${label}:`) : undefined;
    if (rest === undefined || gewoon(rest) === '') afw.nieuw('lesplan-metaregels', `deel 0, blok ${i + 1}`, `verwacht de regel "${label}:" met een vet label`);
    else meta.set(label, gewoon(rest));
  });
  const vakdiscipline = meta.get('Vakdiscipline') ?? '';
  const vak = GO_VAK_CODES.find((v) => GO_VAKKEN[v].naam === vakdiscipline);
  if (!vak) {
    afw.nieuw('lesplan-metaregels', 'deel 0', `"${vakdiscipline}" is geen vakdiscipline van het GO!`);
    return mislukt();
  }
  if (meta.get('Lesplan') !== undefined && meta.get('Lesplan') !== gewoon(`${code} ${titel}`)) afw.nieuw('lesplan-metaregels', 'deel 0', `"Lesplan:" is niet gelijk aan code en titel (${code} ${titel})`);
  const didactischeFiches: GoLesplanAfgeleid['didactischeFiches'] = [];
  const ficheRegel = meta.get('Didactische fiche') ?? '';
  const navPlaats = ficheRegel.indexOf(FICHE_NAVIGATOR.trim());
  const fiches = navPlaats >= 0 ? ficheRegel.slice(0, navPlaats).trim() : ficheRegel;
  if (navPlaats < 0 || !ficheRegel.endsWith(')')) afw.nieuw('lesplan-metaregels', 'deel 0', 'de regel "Didactische fiche:" eindigt niet op het pad in GO! Navigator');
  for (const f of fiches.split('; ')) {
    const m = RE_FICHE.exec(f.trim());
    if (!m) afw.nieuw('lesplan-metaregels', 'deel 0', `"${f}" heeft niet de vorm DF<vak><3 cijfers> <titel>`);
    else if (m[1].slice(2, 4) !== vak) afw.nieuw('lesplan-metaregels', 'deel 0', `de fiche ${m[1]} hoort niet bij ${vak}`);
    else didactischeFiches.push({ code: m[1], titel: m[2] });
  }

  // 3. De koppen van de delen, en koppen van niveau 3 en 4 alleen in deel 3, in de gekende volgorde.
  delen.slice(1).forEach((d, i) => {
    const kop = d.blokken[0].soort === 'kop' ? regelGewoon(d.blokken[0].tekst) : '';
    const verwacht = LESPLAN_DELEN[i];
    if (verwacht !== undefined) {
      if (kop !== verwacht) afw.nieuw('lesplan-delen', `deel ${d.nr}`, `de kop is "${kop}", verwacht "${verwacht}"`);
      return;
    }
    const bekend = opties.bekende.zoek('lesplan-deel', (a) => a.lesplan === code && a.kop === kop);
    afw.melding('lesplan-delen', `deel ${d.nr}`, `een extra deel "${kop}"`, bekend);
  });
  if (delen.length < LESPLAN_DELEN.length + 1) afw.nieuw('lesplan-delen', 'body', `${delen.length - 1} delen, verwacht ${LESPLAN_DELEN.length}`);
  const koppen34: { niveau: number; tekst: string; deel: number }[] = [];
  for (const d of delen) for (const b of d.blokken.slice(1)) if (b.soort === 'kop') koppen34.push({ niveau: b.niveau, tekst: regelGewoon(b.tekst), deel: d.nr });
  if (koppen34.some((k) => k.deel !== 3)) afw.nieuw('lesplan-koppen', 'body', 'koppen van niveau 3 of 4 buiten deel 3');
  const k3 = koppen34.filter((k) => k.deel === 3);
  if (k3.length !== KOPPEN_DEEL3.length || k3.some((k, i) => k.niveau !== KOPPEN_DEEL3[i].niveau || k.tekst !== KOPPEN_DEEL3[i].tekst)) {
    afw.nieuw('lesplan-koppen', 'deel 3', `de tussenkoppen van deel 3 wijken af van de gekende lijst (${k3.map((k) => `${k.niveau}:${k.tekst}`).join(' | ')})`);
  }

  // 4. Tabellen per deel.
  const tabellenVan = (nr: number) => (delen[nr]?.blokken ?? []).map((b, i) => ({ b, i })).filter((x): x is { b: Extract<Blok, { soort: 'tabel' }>; i: number } => x.b.soort === 'tabel');
  for (const d of delen) {
    const verwacht = TABELLEN[d.nr] ?? [];
    const tabellen = tabellenVan(d.nr);
    if (tabellen.length !== verwacht.length) {
      afw.nieuw('lesplan-tabel', `deel ${d.nr}`, `${tabellen.length} tabellen, verwacht ${verwacht.length}`);
      continue;
    }
    tabellen.forEach(({ b, i }, ti) => {
      const vorm = verwacht[ti];
      const waar = `deel ${d.nr}, blok ${i}`;
      if (b.rijen.some((rij) => rij.length !== vorm.kolommen)) afw.nieuw('lesplan-tabel', waar, `niet elke rij heeft ${vorm.kolommen} kolommen`);
      vorm.koppen.forEach((k, kol) => {
        const c = b.rijen[0]?.[kol];
        const r = c?.blokken[0];
        const tekst = c ? celGewoon(c) : undefined;
        const icoonOk = k.icoon === undefined || (r !== undefined && r.soort === 'alinea' && r.tekst.some((s) => 'icoon' in s && s.icoon === k.icoon));
        if (tekst !== k.tekst || !icoonOk || (c && c.blokken.length > 1)) afw.nieuw('lesplan-tabel', `${waar}, kolomkop ${kol}`, `verwacht ${k.icoon ? `het pictogram ${k.icoon} en ` : ''}"${k.tekst}", er staat "${tekst ?? ''}"`);
      });
      if (vorm.rijkoppen) {
        const rijkoppen = b.rijen.slice(1).map((rij) => (rij[0] ? celGewoon(rij[0]) : ''));
        if (rijkoppen.join('|') !== vorm.rijkoppen.join('|')) afw.nieuw('lesplan-tabel', waar, `de rijkoppen zijn ${rijkoppen.join(', ')} (verwacht ${vorm.rijkoppen.join(', ')})`);
      }
    });
  }

  // 5. Afgeleid: deel 2 (leerplandoelen, MIA, begrippen).
  const leerplandoelen: GoLesplanAfgeleid['leerplandoelen'] = [];
  const t2 = tabellenVan(2)[0];
  if (t2 && t2.b.rijen[1]?.[1]) {
    const cel = t2.b.rijen[1][1];
    let miaOpen: { doel: string; titel: string; items: string[]; waar: string } | undefined;
    let vorigDoel: string | undefined;
    cel.blokken.forEach((blok, regel) => {
      const waar: Wijzer = { deel: 2, blok: t2.i, rij: 1, kolom: 1, regel };
      const w = `deel 2, regel ${regel}`;
      if (blok.soort === 'lijst') {
        if (!miaOpen || miaOpen.items.length > 0) afw.nieuw('lesplan-deel2', w, 'een lijst die niet onder een MIA-titel staat');
        else miaOpen.items.push(...blok.items.map((it) => regelGewoon(it)));
        return;
      }
      miaOpen = undefined;
      if (blok.soort !== 'alinea') {
        afw.nieuw('lesplan-deel2', w, 'een beeld bij de leerplandoelen');
        return;
      }
      const tekst = regelGewoon(blok.tekst);
      const m = RE_DOELREGEL.exec(tekst);
      if (m) {
        const [, doelCode, kv, doelTekst, lftTekst] = m;
        const lft = leesLeeftijden(lftTekst);
        const eerste = blok.tekst[0];
        const kvStuk = blok.tekst.find((s) => 't' in s && gewoon(s.t) === `[${kv}]`);
        if (!eerste || !('t' in eerste) || eerste.b !== true || gewoon(eerste.t) !== doelCode) afw.nieuw('lesplan-deel2', w, `de code ${doelCode} staat niet vet vooraan`);
        if (!kvStuk || !('t' in kvStuk) || kvStuk.i !== true) afw.nieuw('lesplan-deel2', w, `[${kv}] staat niet cursief`);
        if (!lft) afw.nieuw('lesplan-deel2', w, `"(${lftTekst})" zijn geen leeftijden van het GO!`);
        else if (leerplandoelen.some((d) => d.code === doelCode)) afw.nieuw('lesplan-deel2', w, `${doelCode} staat er twee keer`);
        else leerplandoelen.push({ code: doelCode, kennisverwerking: kv as Kennisverwerking, leeftijden: lft, tekst: doelTekst, waar });
        vorigDoel = doelCode;
        return;
      }
      const naMia = naVetLabel(blok.tekst, MIA_LABEL);
      if (naMia !== undefined && naMia.startsWith(MIA_SCHEIDING) && vorigDoel) {
        miaOpen = { doel: vorigDoel, titel: gewoon(naMia.slice(MIA_SCHEIDING.length)), items: [], waar: w };
        extra.mia.push(miaOpen);
        return;
      }
      const naBegrip = naVetLabel(blok.tekst, BEGRIPPEN_LABEL);
      if (naBegrip !== undefined && vorigDoel) {
        extra.begrippen.push({ doel: vorigDoel, begrippen: naBegrip.split(',').map(gewoon).filter(Boolean), waar: w });
        return;
      }
      afw.nieuw('lesplan-deel2', w, `een onbekende regel bij de leerplandoelen: "${tekst.slice(0, 80)}"`);
    });
    for (const mia of extra.mia) if (mia.items.length === 0) afw.nieuw('lesplan-deel2', mia.waar, `de MIA "${mia.titel}" heeft geen items`);
  }
  if (leerplandoelen.length === 0) afw.nieuw('lesplan-deel2', 'deel 2', 'geen enkele doelregel gevonden');
  for (const d of leerplandoelen) if (!d.code.startsWith(`${vak}.`)) afw.nieuw('lesplan-deel2', 'deel 2', `${d.code} hoort niet bij de vakdiscipline ${vak}`);

  // 6. Deel 3: vlaggen en schakels, deelconcepten en GO! concepten.
  const vlaggenL: string[] = [];
  const schakelsL: string[] = [];
  (delen[3]?.blokken ?? []).forEach((b, i) => {
    if (b.soort !== 'alinea') return;
    const icoon = b.tekst.find((s): s is { icoon: 'vlag' | 'schakel' } => 'icoon' in s && (s.icoon === 'vlag' || s.icoon === 'schakel'));
    if (!icoon) return;
    const w = `deel 3, blok ${i}`;
    const naIcoon = b.tekst.slice(b.tekst.indexOf(icoon) + 1);
    const codeStuk = naIcoon.find((s) => !('t' in s) || s.t.trim() !== '');
    const codeT = codeStuk && 't' in codeStuk && codeStuk.b === true ? gewoon(codeStuk.t) : '';
    if (b.tekst.indexOf(icoon) !== 0 || !RE_GO_CODE.test(codeT) || b.tekst.filter((s) => 'icoon' in s).length !== 1) {
      afw.nieuw('lesplan-deel3', w, 'een regel met een vlag of schakel heeft niet de vorm pictogram, vette code, tekst');
      return;
    }
    const rest = gewoon(regelTekst(naIcoon.slice(naIcoon.indexOf(codeStuk as Stuk) + 1)));
    const m = /^(.*) \(([^()]+)\)$/.exec(rest);
    extra.verwijzingen.push({ soort: icoon.icoon, code: codeT, tekst: m ? m[1] : rest, leeftijden: m ? leesLeeftijden(m[2]) : undefined, waar: w });
    const l = icoon.icoon === 'vlag' ? vlaggenL : schakelsL;
    if (!l.includes(codeT)) l.push(codeT);
  });
  for (const d of delen) {
    if (d.nr === 3) continue;
    const bezoek = (r: Regel) => r.some((s) => 'icoon' in s && (s.icoon === 'vlag' || s.icoon === 'schakel'));
    const heeft = d.blokken.some((b) => (b.soort === 'alinea' && bezoek(b.tekst)) || (b.soort === 'lijst' && b.items.some(bezoek)) || (b.soort === 'tabel' && b.rijen.some((rij) => rij.some((c) => c.blokken.some((x) => (x.soort === 'alinea' && bezoek(x.tekst)) || (x.soort === 'lijst' && x.items.some(bezoek)))))));
    if (heeft) afw.nieuw('lesplan-deel3', `deel ${d.nr}`, 'een vlag of schakel buiten deel 3');
  }
  const deelconcepten: string[] = [];
  const goConcepten: string[] = [];
  const t3 = tabellenVan(3);
  const celRegels = (c: Cel | undefined) => (c ? c.blokken.flatMap((b) => (b.soort === 'alinea' ? [b.tekst] : b.soort === 'lijst' ? b.items : [])) : []);
  if (t3.length === 3) {
    for (const rij of t3[0].b.rijen.slice(1)) {
      for (const r of celRegels(rij[1])) {
        const x = regelGewoon(r);
        if (x && !deelconcepten.includes(x)) deelconcepten.push(x);
      }
    }
    // Tabel 2: per deelconcept de GO! concepten, als 'GO! concept: uitleg'. Een '-' als uitleg betekent: hoort niet bij
    // dit lesplan (LP0065 toont zo alle deelconcepten). Een deelconcept met minstens één GO! concept met uitleg hoort
    // er wel bij, ook als het niet in de tabel van de diploma's staat (LP0014a).
    for (const rij of t3[1].b.rijen.slice(1)) {
      let metUitleg = false;
      for (const r of celRegels(rij[1])) {
        const x = regelGewoon(r);
        const dp = x.indexOf(':');
        if (dp <= 0) {
          afw.nieuw('lesplan-deel3', 'deel 3, tabel 2', `"${x.slice(0, 60)}" heeft niet de vorm "GO! concept: uitleg"`);
          continue;
        }
        const naam = x.slice(0, dp).trim();
        if (x.slice(dp + 1).trim() === '-') continue;
        metUitleg = true;
        if (!goConcepten.includes(naam)) goConcepten.push(naam);
      }
      const dc = celRegels(rij[0]).map(regelGewoon);
      if (dc.length !== 1) afw.nieuw('lesplan-deel3', 'deel 3, tabel 2', 'een rij zonder precies één deelconcept in de eerste kolom');
      else if (metUitleg && !deelconcepten.includes(dc[0])) deelconcepten.push(dc[0]);
    }
  }

  // 7. Deel 4: de stappen van de leskern en de diploma's.
  const stappen: GoLesplanAfgeleid['stappen'] = [];
  const diplomas: GoLesplanAfgeleid['diplomas'] = [];
  const t4 = tabellenVan(4)[0];
  if (t4) {
    const rijkoppen = t4.b.rijen.map((rij) => (rij[0] ? celGewoon(rij[0]) : ''));
    const leskern = rijkoppen.indexOf(RIJKOP_LESKERN);
    let aantal = 0;
    if (leskern > 0) {
      if (t4.b.rijen[leskern][0].samengevoegd !== 'begin') afw.nieuw('lesplan-deel4', 'deel 4', "de rijkop 'Leskern' is geen begin van een samenvoeging");
      aantal = 1;
      while (t4.b.rijen[leskern + aantal]?.[0]?.samengevoegd === 'vervolg') aantal++;
    }
    const verwacht = [...RIJKOPPEN_LESOPBOUW.slice(0, 3), RIJKOP_LESKERN, ...Array<string>(Math.max(0, aantal - 1)).fill(''), ...RIJKOPPEN_LESOPBOUW.slice(4)];
    if (rijkoppen.slice(1).join('|') !== verwacht.join('|')) afw.nieuw('lesplan-deel4', 'deel 4', `de rijkoppen zijn ${rijkoppen.slice(1).join(', ')}`);
    if (aantal < MIN_STAPPEN || aantal > STAPPEN.length) afw.nieuw('lesplan-deel4', 'deel 4', `${aantal} stappen in de leskern (verwacht ${MIN_STAPPEN} of ${STAPPEN.length})`);
    for (let s = 0; s < aantal && s < STAPPEN.length; s++) {
      const rij = leskern + s;
      const naam = STAPPEN[s];
      for (const kol of [1, 2]) {
        const c = t4.b.rijen[rij]?.[kol];
        const eerste = c?.blokken[0];
        const regel = eerste && eerste.soort === 'alinea' ? regelTekst(eerste.tekst).split('\n')[0] : '';
        if (gewoon(regel) !== `${s + 1}. ${naam}`) afw.nieuw('lesplan-stappen', `deel 4, rij ${rij}, kolom ${kol}`, `de stap begint met "${gewoon(regel)}", verwacht "${s + 1}. ${naam}"`);
      }
      stappen.push({ nr: (s + 1) as 1 | 2 | 3 | 4 | 5 | 6, naam, wat: { deel: 4, blok: t4.i, rij, kolom: 1 }, hoe: { deel: 4, blok: t4.i, rij, kolom: 2 } });
    }
    const lesdoel = rijkoppen.indexOf(RIJKOP_LESDOEL);
    const cel = lesdoel > 0 ? t4.b.rijen[lesdoel][1] : undefined;
    if (cel) {
      const waar: Wijzer = { deel: 4, blok: t4.i, rij: lesdoel, kolom: 1 };
      let diploma: GoLesplanAfgeleid['diplomas'][number] | undefined;
      let ik: { code: string; zinnen: string[] } | undefined;
      let toestand: 'kop' | 'navigator' | 'doel' | 'zinnen' | 'begrippen' = 'kop';
      cel.blokken.forEach((b, regel) => {
        const w = `deel 4, Lesdoel, regel ${regel}`;
        if (b.soort === 'lijst') {
          if (toestand !== 'doel' || !ik) afw.nieuw('lesplan-diploma', w, 'een lijst die niet onder een doelregel van een diploma staat');
          else {
            ik.zinnen.push(...b.items.map((it) => regelTekst(it).trim()));
            toestand = 'zinnen';
          }
          return;
        }
        if (b.soort !== 'alinea') return void afw.nieuw('lesplan-diploma', w, 'een beeld in de rij Lesdoel');
        const tekst = regelGewoon(b.tekst);
        const dk = RE_DIPLOMA_KOP.exec(tekst);
        if (dk) {
          if (!isGoLeeftijd(dk[2])) return void afw.nieuw('lesplan-diploma', w, `"${dk[2]}" is geen leeftijdsgroep`);
          diploma = { naam: dk[1], leeftijd: dk[2], ikDoelen: [], waar };
          diplomas.push(diploma);
          ik = undefined;
          toestand = 'navigator';
          return;
        }
        if (toestand === 'navigator') {
          if (tekst !== DIPLOMA_NAVIGATOR) afw.nieuw('lesplan-diploma', w, 'onder de kop van een diploma staat niet het pad in GO! Navigator');
          toestand = 'doel';
          return;
        }
        const ikm = RE_IKDOEL_KOP.exec(tekst);
        if (ikm && diploma && toestand !== 'begrippen') {
          ik = { code: ikm[1], zinnen: [] };
          diploma.ikDoelen.push(ik);
          extra.ikDoelKoppen.push({ code: ikm[1], kennisverwerking: ikm[2] as Kennisverwerking, leeftijden: leesLeeftijden(ikm[3]), waar: w });
          toestand = 'doel';
          return;
        }
        if (tekst === DIPLOMA_BEGRIPPEN && diploma) {
          toestand = 'begrippen';
          return;
        }
        if (toestand === 'begrippen') return; // de begrippen zelf: alleen in de tekst
        afw.nieuw('lesplan-diploma', w, `een onbekende regel in de rij Lesdoel: "${tekst.slice(0, 80)}"`);
      });
      for (const d of diplomas) {
        if (d.ikDoelen.length === 0) afw.nieuw('lesplan-diploma', `deel 4, diploma ${d.naam}`, 'een diploma zonder doelen');
        for (const x of d.ikDoelen) if (x.zinnen.length === 0) afw.nieuw('lesplan-diploma', `deel 4, diploma ${d.naam}`, `${x.code} zonder ik-doelen`);
        const codes = d.ikDoelen.map((x) => x.code);
        if (new Set(codes).size !== codes.length) afw.nieuw('lesplan-diploma', `deel 4, diploma ${d.naam}`, 'een doel staat twee keer bij hetzelfde diploma');
      }
    }
  }

  // 8. Deel 5: de activiteiten van 'Trainen'.
  const trainen: GoLesplanAfgeleid['trainen'] = [];
  const d5 = delen[5]?.blokken ?? [];
  if (d5.length > 0) {
    const inl = d5[1];
    if (!inl || inl.soort !== 'alinea' || regelGewoon(inl.tekst) !== TRAINEN_INLEIDING) afw.nieuw('lesplan-trainen', 'deel 5', 'de eerste alinea is niet de gekende inleiding');
    const regels: { w: Wijzer; r: Regel; lijst: boolean }[] = [];
    d5.slice(2).forEach((b, j) => {
      const blok = j + 2;
      if (b.soort === 'alinea') regels.push({ w: { deel: 5, blok }, r: b.tekst, lijst: false });
      else if (b.soort === 'lijst') b.items.forEach((r, item) => regels.push({ w: { deel: 5, blok, item }, r, lijst: true }));
      else afw.nieuw('lesplan-trainen', `deel 5, blok ${blok}`, `een ${b.soort} in deel 5`);
    });
    const titels: { plaats: number; vorm: TrainenVorm }[] = [];
    regels.forEach(({ r, lijst }, plaats) => {
      const vorm = titelVorm(r, lijst);
      if (vorm === 'onbekend') afw.nieuw('lesplan-trainen', `deel 5, regel ${plaats}`, `een regel die vet begint maar in geen gekende vorm van een titel past: "${regelGewoon(r).slice(0, 60)}"`);
      else if (vorm) titels.push({ plaats, vorm });
    });
    const vormen = new Set(titels.map((t) => t.vorm));
    if (vormen.size > 1) afw.nieuw('lesplan-trainen', 'deel 5', `titels in meer dan één vorm (${[...vormen].join(', ')})`);
    if (titels.length === 0) {
      const lijsten = new Set(regels.map((x) => x.w.blok));
      if (regels.length > 0 && regels.every((x) => x.lijst) && lijsten.size === 1) {
        extra.trainenVorm = 'geen-titel';
        for (const x of regels) trainen.push({ vanaf: x.w, tot: x.w });
      } else if (regels.length > 0) {
        afw.nieuw('lesplan-trainen', 'deel 5', 'geen titels en geen enkele lijst: een onbekende vorm van Trainen');
      }
    } else {
      extra.trainenVorm = titels[0].vorm;
      if (titels[0].plaats > 0) trainen.push({ vanaf: regels[0].w, tot: regels[titels[0].plaats - 1].w });
      titels.forEach((t, i) => {
        const eind = i + 1 < titels.length ? titels[i + 1].plaats - 1 : regels.length - 1;
        trainen.push({ titel: vetBegin(regels[t.plaats].r), vanaf: regels[t.plaats].w, tot: regels[eind].w });
      });
    }
  }

  // 9. Deel 6: het materiaal (de eerste lijst).
  let materiaal: Wijzer | undefined;
  (delen[6]?.blokken ?? []).forEach((b, blok) => {
    if (b.soort === 'lijst' && !materiaal) materiaal = { deel: 6, blok };
    if (b.soort === 'tabel' || b.soort === 'beeld' || (b.soort === 'kop' && blok > 0)) afw.nieuw('lesplan-materiaal', `deel 6, blok ${blok}`, `een ${b.soort} in deel 6`);
  });
  if (!materiaal) {
    afw.nieuw('lesplan-materiaal', 'deel 6', 'deel 6 heeft geen lijst met materiaal');
    return mislukt();
  }

  const afgeleid: GoLesplanAfgeleid = {
    vakdiscipline,
    vak,
    lessenlijn: meta.get('Lessenlijn') ?? '',
    lessenreeks: meta.get('Lessenreeks') ?? '',
    didactischeFiches,
    leerplandoelen,
    diplomas,
    deelconcepten,
    goConcepten,
    vlaggen: vlaggenL,
    schakels: schakelsL,
    stappen,
    trainen,
    materiaal,
  };
  const bestand: GoLesplanBestand = {
    app: 'boosterz',
    kind: 'go-lesplan',
    v: 1,
    code,
    titel,
    leeftijd,
    delen,
    afgeleid,
    bron: {
      net: 'GO!',
      naamsvermelding: GO_NAAMSVERMELDING,
      waar: 'GO! studio',
      url: GO_STUDIO_URL,
      bestand: { naam: ruw.bestand, bytes: opties.bron.bytes, sha256: opties.bron.sha256, datum: ruw.gemaakt ?? '' },
      ingelezen: opties.bron.ingelezen,
    },
    sha256: '',
  };
  bestand.sha256 = shaVan(lesplanShaInvoer(bestand));
  return { bestand, extra, afwijkingen: afw };
}

/**
 * Is deze regel van deel 5 de titel van een activiteit, en in welke vorm (vorm.ts, TRAINEN_VORMEN)? Undefined: geen
 * titel. 'onbekend': een alinea die vet begint, maar in geen enkele gekende vorm past (dan stopt de import).
 */
export function titelVorm(r: Regel, lijst: boolean): Exclude<TrainenVorm, 'geen-titel'> | 'onbekend' | undefined {
  const vet = vetBegin(r);
  const zichtbaar = r.filter((s) => !('t' in s) || s.t.trim() !== '');
  const alleenVetNa = (vanaf: number) => zichtbaar.slice(vanaf).length > 0 && zichtbaar.slice(vanaf).every((s) => 't' in s && s.b === true);
  // Een lijstitem is alleen een titel als het helemaal vet is; vette beginwoorden van een zin zijn geen titel.
  if (lijst) return alleenVetNa(0) ? 'lijst-vet' : undefined;
  const eerste = zichtbaar[0];
  if (eerste && 't' in eerste && eerste.b !== true && new RegExp(`^${OPSOMTEKEN}\\s*$`).test(eerste.t) && alleenVetNa(1)) return 'opsomteken-vet';
  if (vet === '') return undefined;
  if (alleenVetNa(0)) return 'alinea-vet';
  // Vet, dan meteen een regeleinde, en daarna nog tekst in dezelfde alinea.
  let i = 0;
  while (i < r.length && 't' in r[i] && ((r[i] as TekstStuk).b === true || (r[i] as TekstStuk).t.trim() === '')) i++;
  const naVet = r[i];
  if (naVet && 'br' in naVet && isZichtbaar(r.slice(i + 1))) return 'vet-regeleinde';
  return 'onbekend';
}

// ══ Doelenset (xlsx) ══════════════════════════════════════════════════

/** Een minimumdoel-rij: alleen voor het rapport (de tekst van een minimumdoel komt uit de API). */
export interface MinimumdoelRij {
  rij: number;
  moment: GoMoment;
  /** Letterlijk uit de codekolom ('' als ze leeg is). */
  nummer: string;
  /** De twee tekstkolommen van dat moment, letterlijk. */
  tekst: string;
  status: 'gevonden' | 'bestaat-niet' | 'onleesbaar' | 'geen-code';
  set?: string;
  id?: string;
  bekend?: string;
}

export interface LeerplanTellingen {
  doelzinCodes: number;
  doelzinOfficieel: number;
  doelzinVoorstel: number;
  doelzinProblemen: number;
  inhoudCodes: number;
  inhoudOfficieel: number;
  inhoudProblemen: number;
  twijfelLeeftijd: number;
  twijfelAnderVak: number;
  begrippenZonderLeeftijd: number;
  witruimteCellen: { rij: number; kolom: number }[];
  /** Per vak van de minimumdoelen: hoeveel verwijzingen (doelzin en inhoud). */
  perMinimumdoelvak: Record<string, number>;
}

export interface LeerplanCtx {
  bekende: Bekende;
  tabel: Opzoektabel;
  /** Bestaat dit leerplandoel (in een van de 12 doelensets)? */
  bestaat: (code: string) => boolean;
  bronBestand: GoBronBestand;
  /** JJJJ-MM-DD. */
  ingelezen: string;
}

/** De vakdiscipline van een doelenset volgens de naam van het tabblad. */
export function vakVanBlad(blad: string): GoVak | undefined {
  return GO_VAK_CODES.find((v) => GO_VAKKEN[v].naam === blad);
}

/** Het aantal doelzin-rijen van een ruwe doelenset (om te weten welke codes bestaan, over de sets heen). */
export function telDoelzinnen(ruw: RuwXlsx): number {
  return ruw.rijen.filter((r) => r.c[KOL.type] === 'doelzin').length;
}

export function zetLeerplanOm(
  ruw: RuwXlsx,
  ctx: LeerplanCtx,
): { bestand: GoLeerplanBestand | undefined; minimumdoelRijen: MinimumdoelRij[]; tellingen: LeerplanTellingen; afwijkingen: Afwijkingen; koppelingen: { doel: string; uitkomst: KoppelUitkomst }[] } {
  const vak = vakVanBlad(ruw.blad);
  const afw = new Afwijkingen(vak ?? ruw.bestand);
  const tellingen: LeerplanTellingen = {
    doelzinCodes: 0,
    doelzinOfficieel: 0,
    doelzinVoorstel: 0,
    doelzinProblemen: 0,
    inhoudCodes: 0,
    inhoudOfficieel: 0,
    inhoudProblemen: 0,
    twijfelLeeftijd: 0,
    twijfelAnderVak: 0,
    begrippenZonderLeeftijd: 0,
    witruimteCellen: [],
    perMinimumdoelvak: {},
  };
  const minimumdoelRijen: MinimumdoelRij[] = [];
  const koppelingen: { doel: string; uitkomst: KoppelUitkomst }[] = [];
  const uitkomst = (b?: GoLeerplanBestand) => ({ bestand: b, minimumdoelRijen, tellingen, afwijkingen: afw, koppelingen });
  if (!vak) {
    afw.nieuw('xlsx-blad', 'blad', `het tabblad "${ruw.blad}" is geen vakdiscipline van het GO!`);
    return uitkomst();
  }
  if (ruw.bladnamen.length !== 1) afw.nieuw('xlsx-blad', 'werkboek', `${ruw.bladnamen.length} tabbladen (verwacht één)`);
  if (ruw.merged.length > 0) afw.nieuw('xlsx-blad', 'blad', `${ruw.merged.length} samengevoegde cellen`);
  if (ruw.gewijzigd === null) afw.nieuw('xlsx-blad', 'docProps', 'geen datum (dcterms:modified)');
  // Wat de lezer zag maar niet als tekst overneemt: een cel die geen tekst is komt anders letterlijk als tekst online
  // (bv. #REF! of 0.5 voor 50 %), en wat verborgen is, in een opmerking of in een figuur staat, zou stil verdwijnen.
  for (const v of ruw.vreemde_cellen) {
    afw.nieuw('xlsx-cel', `rij ${v.r}, kolom ${v.k}`, v.soort === 'escape' ? `een Excel-escape (_xHHHH_) in de tekst: "${v.waarde}"` : `een cel die geen tekst is (${v.soort}): "${v.waarde}"`);
  }
  for (const r of ruw.verborgen_rijen) afw.nieuw('xlsx-verborgen', `rij ${r}`, 'een verborgen rij met inhoud');
  for (const [van, tot] of ruw.verborgen_kolommen) afw.nieuw('xlsx-verborgen', van === tot ? `kolom ${van}` : `kolom ${van}-${tot}`, 'een verborgen kolom');
  if (ruw.opmerkingen > 0) afw.nieuw('xlsx-opmerking', 'werkboek', `${ruw.opmerkingen} bestanden met opmerkingen bij cellen (opmerkingen worden niet gelezen)`);
  for (const [r, k] of ruw.beelden) {
    const bekend = ctx.bekende.zoek('xlsx-beeld', (a) => a.vak === vak && a.rij === r && a.kolom === k);
    afw.melding('xlsx-beeld', r === 0 ? 'blad (zonder cel)' : `rij ${r}, kolom ${k}`, 'een beeld, vorm of grafiek op het blad (die worden niet gelezen)', bekend);
  }

  const kop = ruw.rijen[0];
  if (!kop || kop.r !== 1) {
    afw.nieuw('xlsx-kop', 'rij 1', 'de eerste rij is niet de koprij');
    return uitkomst();
  }
  KOLOMMEN.forEach((naam, k) => {
    const waarde = kop.c[k] ?? '';
    if (waarde === naam) return;
    const bekend = ctx.bekende.zoek('xlsx-kop', (a) => a.vak === vak && a.kolom === k && a.waarde === waarde);
    afw.melding('xlsx-kop', `rij 1, kolom ${k}`, `de kolomkop is "${waarde}", verwacht "${naam}"`, bekend);
  });
  if (kop.c.length > KOLOMMEN.length && kop.c.slice(KOLOMMEN.length).some((v) => !isLeeg(v))) afw.nieuw('xlsx-kop', 'rij 1', 'meer dan 24 kolommen');

  const rubrieken: GoRubriek[] = [];
  const stapel: { id: string; niveau: number }[] = [];
  const doelen: GoLeerplandoel[] = [];
  let huidig: GoLeerplandoel | undefined;
  let legeRijVanaf: number | undefined;
  /** Na een minimumdoel-rij hoort geen inhoud meer bij het doel erboven (dat komt niet voor; anders een afwijking). */
  let naMinimumdoel = false;

  const voorstelVoor = (doel: string) => (moment: GoMoment, bronCode: string) => ctx.bekende.zoek('koppeling-voorstel', (a) => a.doel === doel && a.moment === moment && a.bronCode === bronCode)?.voorstel;

  /** Koppelt de codekolommen van een rij; meldt problemen, voorstellen en een vak dat niet verwacht is. */
  const koppelRij = (rij: RuwRij, cel: (k: number) => string | null, doel: GoLeerplandoel | undefined, lft: readonly GoLeeftijd[], doelzin: boolean): GoKoppeling | undefined => {
    const bron: Partial<Record<GoMoment, string>> = {};
    for (const m of GO_MOMENTEN) {
      const v = cel(MOMENT_KOLOMMEN[m].nummer);
      if (!isLeeg(v)) bron[m] = v as string;
    }
    if (Object.keys(bron).length === 0) return undefined;
    const doelCode = doel?.code ?? '';
    const anderVak: { moment: GoMoment; code: string; bekend: BekendBasis | undefined }[] = [];
    const u = koppel(bron, lft, ctx.tabel, {
      voorstel: voorstelVoor(doelCode),
      twijfel: (moment, code) => {
        const mv = vakVanCode(code);
        if (mv === undefined || VERWACHTE_MINIMUMDOELVAKKEN[vak].includes(mv)) return [];
        const bekend = ctx.bekende.zoek('koppeling-ander-vak', (a) => a.doel === doelCode && a.moment === moment && a.code === code);
        anderVak.push({ moment, code, bekend });
        return bekend ? (['ander-vak'] as GoTwijfel[]) : [];
      },
    });
    koppelingen.push({ doel: doelCode, uitkomst: u });
    const w = `rij ${rij.r} (${doelCode})`;
    for (const a of anderVak) afw.melding('koppeling-ander-vak', w, `${a.moment} ${a.code} is een minimumdoel van vak ${vakVanCode(a.code)}, niet van een vak dat ${vak} verwacht`, a.bekend);
    for (const d of u.dubbelzinnig) afw.nieuw('koppeling-dubbelzinnig', w, `${d.moment} ${d.code} vindt ${d.kandidaten.length} doelen (${d.kandidaten.map((k) => `${k.set}/${k.id}`).join(', ')})`);
    for (const d of u.dubbel) afw.nieuw('koppeling-dubbel', w, `${d.moment} ${d.code} staat twee keer`);
    for (const v of u.voorstelZonderDoel) afw.nieuw('koppeling-voorstel', w, `het voorstel ${v.voorstel} voor ${v.moment} "${v.bronCode}" vindt geen doel`);
    for (const p of u.koppeling.problemen) {
      const voorstel = u.koppeling.refs.find((r) => r.status === 'voorstel' && r.bronCode === p.bronCode && r.moment === p.moment);
      const bekend = voorstel ? ctx.bekende.zoek('koppeling-voorstel', (a) => a.doel === doelCode && a.moment === p.moment && a.bronCode === p.bronCode) : undefined;
      afw.melding('koppeling-probleem', w, `${p.moment} "${p.bronCode}": ${p.reden === 'onleesbaar' ? 'geen geldig nummer' : 'dat nummer bestaat niet'}${voorstel ? ` (voorstel ${voorstel.code}, ${voorstel.set}/${voorstel.id})` : ''}`, bekend);
    }
    const aantalCodes = Object.values(bron).reduce((n, t) => n + (t ?? '').split(',').filter((x) => x.trim() !== '').length, 0);
    const officieel = u.koppeling.refs.filter((r) => r.status === 'officieel');
    if (doelzin) {
      tellingen.doelzinCodes += aantalCodes;
      tellingen.doelzinOfficieel += officieel.length;
      tellingen.doelzinVoorstel += u.koppeling.refs.length - officieel.length;
      tellingen.doelzinProblemen += u.koppeling.problemen.length;
    } else {
      tellingen.inhoudCodes += aantalCodes;
      tellingen.inhoudOfficieel += officieel.length;
      tellingen.inhoudProblemen += u.koppeling.problemen.length;
    }
    for (const r of u.koppeling.refs) {
      if (r.twijfel?.includes('moment-buiten-leeftijden') && doelzin) tellingen.twijfelLeeftijd++;
      if (r.twijfel?.includes('ander-vak')) tellingen.twijfelAnderVak++;
      const mv = String(vakVanCode(r.code));
      tellingen.perMinimumdoelvak[mv] = (tellingen.perMinimumdoelvak[mv] ?? 0) + 1;
    }
    return u.koppeling;
  };

  const verwijzingen = (rij: RuwRij, cel: (k: number) => string | null, doel: string, kolom: 'VLAGGEN' | 'SCHAKELS'): GoVerwijzingen => {
    const v = cel(kolom === 'VLAGGEN' ? KOL.vlaggen : KOL.schakels);
    if (isLeeg(v)) return { codes: [], kapot: [] };
    const bron = v as string;
    const codes: string[] = [];
    const kapot: string[] = [];
    for (const d of splitsVerwijzingen(bron)) {
      if (codes.includes(d) || kapot.includes(d)) {
        afw.nieuw('verwijzing-dubbel', `rij ${rij.r} (${doel})`, `${kolom}: "${d}" staat twee keer`);
        continue;
      }
      if (RE_GO_CODE.test(d) && ctx.bestaat(d)) codes.push(d);
      else {
        kapot.push(d);
        const bekend = ctx.bekende.zoek('verwijzing-kapot', (a) => a.doel === doel && a.kolom === kolom && a.waarde === d);
        afw.melding('verwijzing-kapot', `rij ${rij.r} (${doel})`, `${kolom}: "${d}" ${RE_GO_CODE.test(d) ? 'bestaat niet' : 'is geen geldige code'}`, bekend);
      }
    }
    return { bron, codes, kapot };
  };

  /**
   * De letterlijke tekst van een cel, met de opmaak (doorgehaald, superschrift, cursief) als die er is. Doorhaling en
   * super-/subschrift vragen een besluit in bekende-afwijkingen.json (ze kunnen de betekenis van de tekst veranderen);
   * cursief verandert de tekst niet en wordt zonder melding bewaard.
   */
  const goTekst = (rij: RuwRij, k: number, tekst: string): GoTekst => {
    const runs = rij.opmaak?.[String(k)];
    if (!runs) return { tekst };
    if (runs.some((r) => r.strike || r.dstrike || r.vertAlign)) {
      const besluit = ctx.bekende.zoek('opmaak', (a) => a.vak === vak && a.rij === rij.r && a.kolom === k && a.tekst === tekst);
      const soorten = [...new Set(runs.flatMap((r) => [r.strike || r.dstrike ? 'doorgehaald' : '', r.vertAlign ?? ''].filter(Boolean)))].join(', ');
      afw.melding('opmaak', `rij ${rij.r}, kolom ${k}`, `opgemaakte tekst (${soorten}): "${tekst.slice(0, 60)}"`, besluit);
    }
    const stukken: TekstStuk[] = [];
    for (const r of runs) {
      if (r.vertAlign && r.vertAlign !== 'superscript') afw.nieuw('opmaak', `rij ${rij.r}, kolom ${k}`, `${r.vertAlign} wordt niet ondersteund`);
      const s: TekstStuk = { t: r.t };
      if (r.strike || r.dstrike) s.s = true;
      if (r.vertAlign === 'superscript') s.sup = true;
      if (r.i) s.i = true;
      stukken.push(s);
    }
    const opmaak = voegSamen(stukken) as TekstStuk[];
    if (opmaak.map((s) => s.t).join('') !== tekst) {
      afw.nieuw('opmaak', `rij ${rij.r}, kolom ${k}`, 'de opgemaakte stukken geven samen niet de tekst van de cel');
      return { tekst };
    }
    return opmaak.some((s) => s.s || s.sup || s.i) ? { tekst, opmaak } : { tekst };
  };

  let volgnummer = 0;
  for (const rij of ruw.rijen.slice(1)) {
    const cel = (k: number): string | null => rij.c[k] ?? null;
    const w = `rij ${rij.r}`;
    const type = cel(KOL.type) ?? '';
    for (let k = 0; k < rij.c.length; k++) {
      const v = rij.c[k];
      if (v !== null && v !== '' && v.trim() === '') tellingen.witruimteCellen.push({ rij: rij.r, kolom: k });
    }
    if (rij.c.length > KOLOMMEN.length && rij.c.slice(KOLOMMEN.length).some((v) => !isLeeg(v))) afw.nieuw('xlsx-rij', w, 'een waarde voorbij kolom 24');
    if (rij.opmaak) for (const k of Object.keys(rij.opmaak)) if (Number(k) !== KOL.inhoud && !(type === 'minimumdoel')) afw.nieuw('opmaak', `${w}, kolom ${k}`, 'opmaak buiten de kolom INHOUD');

    // Leeftijden: alleen 0 of 1.
    const lft: GoLeeftijd[] = [];
    for (let k = KOL.eersteLeeftijd; k <= KOL.laatsteLeeftijd; k++) {
      const v = cel(k);
      if (v === '1') lft.push(GO_LEEFTIJDEN[k - KOL.eersteLeeftijd]);
      else if (v !== '0' && !isLeeg(v)) afw.nieuw('xlsx-leeftijd', `${w}, kolom ${k}`, `de waarde "${v}" (alleen 0 of 1)`);
    }
    const leegBuiten = (toegelaten: readonly number[], wat: string) => {
      for (let k = 1; k < KOLOMMEN.length; k++) {
        if (toegelaten.includes(k) || (k >= KOL.eersteLeeftijd && k <= KOL.laatsteLeeftijd)) continue;
        if (!isLeeg(cel(k))) afw.nieuw('xlsx-rij', `${w}, kolom ${k}`, `${wat}: een waarde in "${KOLOMMEN[k]}" ("${(cel(k) ?? '').slice(0, 40)}")`);
      }
    };

    if (isLeeg(type)) {
      if (rij.c.some((v, k) => k > 0 && !isLeeg(v) && !(k >= KOL.eersteLeeftijd && k <= KOL.laatsteLeeftijd && v === '0'))) afw.nieuw('xlsx-rij', w, 'een rij zonder TYPE met inhoud');
      legeRijVanaf ??= rij.r;
      continue;
    }
    if (legeRijVanaf !== undefined) {
      afw.nieuw('xlsx-rij', w, `inhoud na de lege rijen (vanaf rij ${legeRijVanaf})`);
      legeRijVanaf = undefined;
    }
    let soort: RijSoort | undefined = TYPES[type];
    if (!soort) {
      afw.nieuw('xlsx-type', w, `het TYPE "${type}" is niet gekend`);
      continue;
    }
    const inhoud = cel(KOL.inhoud);

    if (soort.soort === 'minimumdoel') {
      const alsInhoud = !isLeeg(inhoud) ? ctx.bekende.zoek('minimumdoelrij-is-inhoud', (a) => a.vak === vak && a.rij === rij.r && a.tekst === inhoud) : undefined;
      if (alsInhoud) {
        const als = TYPES[alsInhoud.als];
        if (!als || !RIJSOORTEN_MET_KOPPELING.includes(als.soort) || huidig?.code !== alsInhoud.doel) {
          afw.nieuw('minimumdoelrij', w, `de bekende afwijking zet deze rij bij ${alsInhoud.doel} als "${alsInhoud.als}", maar dat past niet`);
          continue;
        }
        afw.bekend('minimumdoelrij', w, `TYPE 'minimumdoel', maar de tekst "${inhoud}" hoort als "${alsInhoud.als}" bij ${alsInhoud.doel}`, alsInhoud);
        soort = als;
        // Een minimumdoel-rij met tekst draagt geen code: de codekolommen moeten leeg zijn.
        if (GO_MOMENTEN.some((m) => !isLeeg(cel(MOMENT_KOLOMMEN[m].nummer)) || MOMENT_KOLOMMEN[m].tekst.some((k) => !isLeeg(cel(k))))) afw.nieuw('minimumdoelrij', w, 'een minimumdoel-rij die als inhoud geldt, heeft ook een code');
      } else {
        if (!isLeeg(inhoud)) afw.nieuw('minimumdoelrij', w, `een minimumdoel-rij met tekst in INHOUD ("${(inhoud ?? '').slice(0, 60)}")`);
        const bekend = ctx.bekende.zoek('minimumdoelrij', (a) => a.vak === vak && a.rij === rij.r);
        for (const m of GO_MOMENTEN) {
          const nummer = cel(MOMENT_KOLOMMEN[m].nummer) ?? '';
          const tekst = MOMENT_KOLOMMEN[m].tekst.map((k) => cel(k) ?? '').filter((x) => x.trim() !== '').join('\n');
          if (isLeeg(nummer) && tekst === '') continue;
          const r: MinimumdoelRij = { rij: rij.r, moment: m, nummer: nummer.trim(), tekst, status: 'geen-code' };
          if (!isLeeg(nummer)) {
            const kandidaten = /^\d+\.\d+\.\d+$/.test(nummer.trim()) ? ctx.tabel.zoek(m, nummer.trim()) : [];
            if (kandidaten.length === 1) Object.assign(r, { status: 'gevonden', set: kandidaten[0].set, id: kandidaten[0].id });
            else r.status = /^\d+\.\d+\.\d+$/.test(nummer.trim()) ? 'bestaat-niet' : 'onleesbaar';
          }
          if (bekend) r.bekend = bekend.reden;
          minimumdoelRijen.push(r);
        }
        if (bekend) afw.bekend('minimumdoelrij', w, 'een minimumdoel-rij met een fout in de bron (alleen in het rapport)', bekend);
        naMinimumdoel = true;
        if (lft.length > 0) afw.nieuw('minimumdoelrij', w, 'een minimumdoel-rij met een leeftijd');
        leegBuiten([3, 4, 5, 6, 7, 8, 9, 10, 11, KOL.inhoud], 'minimumdoel-rij');
        continue;
      }
    }

    if (soort.soort === 'rubriek') {
      if (isLeeg(inhoud)) afw.nieuw('xlsx-rij', w, `een ${soort.rubriek} zonder tekst`);
      leegBuiten([KOL.inhoud], soort.rubriek);
      if (lft.length > 0) {
        const bekend = ctx.bekende.zoek('rubriek-met-leeftijd', (a) => a.vak === vak && a.rij === rij.r && a.tekst === inhoud);
        afw.melding('rubriek-met-leeftijd', w, `een ${soort.rubriek} met een leeftijd (${leeftijdenTekst(lft)}); een rubriek heeft geen leeftijd, de waarde wordt niet overgenomen`, bekend);
      }
      const niveau = ['onderwerp', 'subthema', 'rubriek', 'subrubriek'].indexOf(soort.rubriek);
      while (stapel.length > 0 && stapel[stapel.length - 1].niveau >= niveau) stapel.pop();
      const id = `${vak}-r${pad3(rubrieken.length + 1)}`;
      const r: GoRubriek = { id, soort: soort.rubriek, ...goTekst(rij, KOL.inhoud, inhoud ?? ''), rij: rij.r };
      if (stapel.length > 0) r.ouder = stapel[stapel.length - 1].id;
      rubrieken.push(r);
      stapel.push({ id, niveau });
      huidig = undefined;
      naMinimumdoel = false;
      continue;
    }

    if (soort.soort === 'doelzin') {
      volgnummer++;
      const code = (cel(KOL.code) ?? '').trim();
      const verwacht = `${vak}.${pad3(volgnummer)}`;
      if (code !== verwacht) afw.nieuw('xlsx-code', w, `de code is "${code}", verwacht ${verwacht}`);
      if (isLeeg(inhoud)) afw.nieuw('xlsx-rij', w, `${code} zonder tekst`);
      const kv = (cel(KOL.kennisverwerking) ?? '').trim();
      if (!(KENNISVERWERKINGEN as readonly string[]).includes(kv)) afw.nieuw('xlsx-rij', w, `kennisverwerking "${kv}" (begrijpen, gebruiken of engageren)`);
      if (lft.length === 0) afw.nieuw('xlsx-leeftijd', w, `${code} zonder leeftijd`);
      leegBuiten([KOL.code, KOL.inhoud, 3, 6, 9, KOL.kennisverwerking, KOL.vlaggen, KOL.schakels], code);
      const rubriek = rubrieken[rubrieken.length - 1]?.id;
      if (!rubriek) afw.nieuw('xlsx-rij', w, `${code} staat niet onder een rubriek`);
      const doel: GoLeerplandoel = {
        code: verwacht,
        rij: rij.r,
        ...goTekst(rij, KOL.inhoud, inhoud ?? ''),
        kennisverwerking: kv as Kennisverwerking,
        leeftijden: lft,
        rubriek: rubriek ?? '',
        inhoud: [],
        minimumdoelen: { bron: {}, refs: [], problemen: [] },
        vlaggen: { codes: [], kapot: [] },
        schakels: { codes: [], kapot: [] },
      };
      doel.minimumdoelen = koppelRij(rij, cel, doel, lft, true) ?? { bron: {}, refs: [], problemen: [] };
      doel.vlaggen = verwijzingen(rij, cel, verwacht, 'VLAGGEN');
      doel.schakels = verwijzingen(rij, cel, verwacht, 'SCHAKELS');
      doelen.push(doel);
      huidig = doel;
      naMinimumdoel = false;
      continue;
    }

    // Inhoud: MIA, begrippen, voorbeelden en voetnoten, onder het laatste doel.
    if (!huidig) {
      afw.nieuw('xlsx-rij', w, `een rij "${type}" die niet onder een doel staat`);
      continue;
    }
    if (naMinimumdoel) afw.nieuw('xlsx-volgorde', w, `een rij "${type}" na een minimumdoel-rij: hoort ze nog bij ${huidig.code}?`);
    if (isLeeg(inhoud)) afw.nieuw('xlsx-rij', w, `een rij "${type}" zonder tekst`);
    const metKoppeling = RIJSOORTEN_MET_KOPPELING.includes(soort.soort);
    leegBuiten(metKoppeling ? [KOL.inhoud, 3, 6, 9] : [KOL.inhoud], `${huidig.code}, ${type}`);
    if (soort.soort !== 'begrip' && lft.length > 0) afw.nieuw('xlsx-leeftijd', w, `een rij "${type}" met een leeftijd`);
    const t = goTekst(rij, KOL.inhoud, inhoud ?? '');
    const kp = metKoppeling ? koppelRij(rij, cel, huidig, huidig.leeftijden, false) : undefined;
    const met = kp ? { koppeling: kp } : {};
    let item: GoDoelInhoud;
    switch (soort.soort) {
      case 'mia-titel':
        item = { soort: 'mia-titel', ...t, rij: rij.r, ...met };
        break;
      case 'mia':
        item = { soort: 'mia', ...t, aanklikbaar: soort.aanklikbaar, rij: rij.r, ...met };
        break;
      case 'begrip':
        if (lft.length === 0) tellingen.begrippenZonderLeeftijd++;
        item = { soort: 'begrip', ...t, leeftijden: lft, rij: rij.r };
        break;
      case 'voorbeelden-titel':
        item = { soort: 'voorbeelden-titel', ...t, rij: rij.r, ...met };
        break;
      case 'voorbeeld':
        item = { soort: 'voorbeeld', ...t, rij: rij.r, ...met };
        break;
      default:
        item = { soort: 'voetnoot', ...t, rij: rij.r };
    }
    huidig.inhoud.push(item);
  }

  if (doelen.length === 0) {
    afw.nieuw('xlsx-rij', 'blad', 'geen enkele doelzin');
    return uitkomst();
  }
  const bestand: GoLeerplanBestand = {
    app: 'boosterz',
    kind: 'go-leerplan',
    v: 1,
    vak,
    naam: GO_VAKKEN[vak].naam,
    rubrieken,
    doelen,
    bron: {
      net: 'GO!',
      naamsvermelding: GO_NAAMSVERMELDING,
      waar: 'GO! Navigator',
      leerplan: 'Het nieuwe GO! leerplan basisonderwijs',
      bestand: ctx.bronBestand,
      ingelezen: ctx.ingelezen,
    },
    sha256: '',
  };
  bestand.sha256 = shaVan(leerplanShaInvoer(bestand));
  return uitkomst(bestand);
}

// ══ Over lesplan en doelenset heen ════════════════════════════════════

/**
 * De controles over lesplan en doelenset heen: elk doel uit deel 2 bestaat met dezelfde code, kennisverwerking en
 * leeftijden; de tekst is gelijk (of een bekende afwijking); de MIA-blokken en begrippen staan letterlijk bij dat doel;
 * de vlaggen en schakels van deel 3 zijn per soort precies die van de doelen (kolommen VLAGGEN en SCHAKELS).
 */
export function controleerLesplanTegenLeerplan(
  lesplan: GoLesplanBestand,
  extra: LesplanExtra,
  leerplannen: ReadonlyMap<GoVak, GoLeerplanBestand>,
  bekende: Bekende,
  afw: Afwijkingen,
): void {
  const zoekDoel = (code: string) => {
    const m = RE_GO_CODE.exec(code);
    if (!m) return undefined;
    return leerplannen.get(m[1] as GoVak)?.doelen[Number(m[2]) - 1];
  };
  const doelen = new Map<string, GoLeerplandoel>();
  for (const d of lesplan.afgeleid.leerplandoelen) {
    const x = zoekDoel(d.code);
    const w = `deel 2, ${d.code}`;
    if (!x || x.code !== d.code) {
      afw.nieuw('lesplan-doel', w, `${d.code} bestaat niet in de doelenset`);
      continue;
    }
    doelen.set(d.code, x);
    if (x.kennisverwerking !== d.kennisverwerking) afw.nieuw('lesplan-doel', w, `kennisverwerking [${d.kennisverwerking}], in de doelenset [${x.kennisverwerking}]`);
    if (x.leeftijden.join('|') !== d.leeftijden.join('|')) afw.nieuw('lesplan-doel', w, `leeftijden (${leeftijdenTekst(d.leeftijden)}), in de doelenset (${leeftijdenTekst(x.leeftijden)})`);
    if (normaliseer(x.tekst) !== normaliseer(d.tekst)) {
      const bekend = bekende.zoek('lesplan-doeltekst', (a) => a.lesplan === lesplan.code && a.doel === d.code && a.tekst === d.tekst);
      afw.melding('lesplan-doeltekst', w, `in het lesplan "${d.tekst}", in de doelenset "${x.tekst}"`, bekend);
    }
  }
  for (const mia of extra.mia) {
    const x = doelen.get(mia.doel);
    if (!x) continue;
    const titelPlaats = x.inhoud.findIndex((i) => i.soort === 'mia-titel' && normaliseer(i.tekst) === normaliseer(mia.titel));
    const items: string[] = [];
    for (let i = titelPlaats + 1; titelPlaats >= 0 && i < x.inhoud.length && x.inhoud[i].soort === 'mia'; i++) items.push(normaliseer(x.inhoud[i].tekst));
    if (titelPlaats < 0) afw.nieuw('lesplan-mia', mia.waar, `de MIA-titel "${mia.titel}" staat niet bij ${mia.doel}`);
    else if (items.join('\n') !== mia.items.map(normaliseer).join('\n')) afw.nieuw('lesplan-mia', mia.waar, `de items van de MIA "${mia.titel}" zijn niet die van ${mia.doel} in de doelenset`);
  }
  for (const b of extra.begrippen) {
    const x = doelen.get(b.doel);
    if (!x) continue;
    for (const begrip of b.begrippen) {
      if (!x.inhoud.some((i) => i.soort === 'begrip' && normaliseer(i.tekst) === normaliseer(begrip))) afw.nieuw('lesplan-begrip', b.waar, `het begrip "${begrip}" staat niet bij ${b.doel}`);
    }
  }
  // Vlaggen en schakels: per soort precies de unie van de kolommen van de doelen uit deel 2.
  for (const [soort, kolom, lijst] of [
    ['vlag', 'vlaggen', lesplan.afgeleid.vlaggen],
    ['schakel', 'schakels', lesplan.afgeleid.schakels],
  ] as const) {
    const verwacht = new Set<string>();
    for (const x of doelen.values()) for (const c of x[kolom].codes) verwacht.add(c);
    const in1 = [...verwacht].filter((c) => !lijst.includes(c));
    const in2 = lijst.filter((c) => !verwacht.has(c));
    if (in1.length > 0 || in2.length > 0) afw.nieuw('lesplan-vlaggen', 'deel 3', `${kolom}: in de doelenset ${[...verwacht].sort().join(', ') || 'geen'}, in het lesplan ${[...lijst].sort().join(', ') || 'geen'}`);
    for (const v of extra.verwijzingen.filter((x) => x.soort === soort)) {
      const x = zoekDoel(v.code);
      if (!x || x.code !== v.code) {
        afw.nieuw('lesplan-vlaggen', v.waar, `${v.code} bestaat niet in de doelensets`);
        continue;
      }
      if (normaliseer(v.tekst) !== normaliseer(x.tekst) || (v.leeftijden ?? []).join('|') !== x.leeftijden.join('|')) {
        afw.nieuw('lesplan-vlaggen', v.waar, `de regel bij ${v.code} is niet de tekst en de leeftijden van de doelenset ("${x.tekst}" (${leeftijdenTekst(x.leeftijden)}))`);
      }
    }
  }
  // De leeftijd van het lesplan komt alleen uit de titel: elk doel uit deel 2 en elk diploma moet die leeftijd hebben.
  for (const [code, x] of doelen) {
    if (x.leeftijden.includes(lesplan.leeftijd)) continue;
    const bekend = bekende.zoek('lesplan-leeftijd', (a) => a.lesplan === lesplan.code && a.doel === code);
    afw.melding('lesplan-leeftijd', `deel 2, ${code}`, `het lesplan is voor ${lesplan.leeftijd} jaar (titel), het doel voor ${leeftijdenTekst(x.leeftijden)}`, bekend);
  }
  for (const d of lesplan.afgeleid.diplomas) {
    if (d.leeftijd !== lesplan.leeftijd) afw.nieuw('lesplan-leeftijd', `deel 4, diploma ${d.naam}`, `het lesplan is voor ${lesplan.leeftijd} jaar (titel), het diploma voor ${d.leeftijd} jaar`);
  }
  for (const ik of extra.ikDoelKoppen) {
    const d = lesplan.afgeleid.leerplandoelen.find((x) => x.code === ik.code);
    if (!d) afw.nieuw('lesplan-diploma', ik.waar, `${ik.code} staat bij een diploma, maar niet in deel 2`);
    else if (d.kennisverwerking !== ik.kennisverwerking || (ik.leeftijden ?? []).join('|') !== d.leeftijden.join('|')) afw.nieuw('lesplan-diploma', ik.waar, `${ik.code}: kennisverwerking of leeftijden anders dan in deel 2`);
  }
}

/**
 * Lessenlijnen en lessenreeksen met dezelfde naam op een schrijfwijze na. De app groepeert de lesplannen van een vak op
 * de letterlijke naam van de lessenlijn (goModel.ts, lessenlijnen) en geeft elke lijn een adres met slugVan: schrijft
 * één lesplan 'Biologie van Organismen' en de rest 'Biologie van organismen', dan zijn dat twee lijnen, en de ene neemt
 * het adres van de andere over ('…-2'). Hetzelfde voor de reeksen binnen een lijn. Per groep met hetzelfde adres wint
 * de schrijfwijze van de meeste lesplannen (bij gelijke stand die van het laagste lesplan); elk lesplan met een andere
 * schrijfwijze krijgt de afwijking 'lessenlijn-variant', tenzij bekende-afwijkingen.json ze voor dat lesplan kent.
 * Alleen over de lesplannen van deze run: dat zijn de lesplannen van de nieuwe index.
 */
export function controleerLessenlijnen(lesplannen: readonly GoLesplanBestand[], bekende: Bekende): Afwijking[] {
  const uit: Afwijking[] = [];
  const perCode = new Map<string, Afwijkingen>();
  const afwVan = (code: string) => {
    const a = perCode.get(code) ?? new Afwijkingen(code);
    perCode.set(code, a);
    return a;
  };
  const gesorteerd = [...lesplannen].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  /** Per groep (zelfde adres) de schrijfwijzen; meldt elk lesplan met een minder gebruikte schrijfwijze. */
  const vergelijk = (groep: readonly GoLesplanBestand[], veld: 'lessenlijn' | 'lessenreeks', waar: string) => {
    const perSlug = new Map<string, GoLesplanBestand[]>();
    for (const l of groep) {
      const s = slugVan(l.afgeleid[veld]);
      perSlug.set(s, [...(perSlug.get(s) ?? []), l]);
    }
    for (const [slug, leden] of perSlug) {
      const perNaam = new Map<string, string[]>();
      for (const l of leden) perNaam.set(l.afgeleid[veld], [...(perNaam.get(l.afgeleid[veld]) ?? []), l.code]);
      if (perNaam.size < 2) continue;
      // Map behoudt de volgorde van invoegen (oplopend op code): bij gelijke stand wint de eerste.
      const [winnaar, winCodes] = [...perNaam].reduce((a, b) => (b[1].length > a[1].length ? b : a));
      for (const [naam, codes] of perNaam) {
        if (naam === winnaar) continue;
        for (const code of codes) {
          const bekend = bekende.zoek('lessenlijn-variant', (a) => a.lesplan === code && a.veld === veld && a.naam === naam);
          afwVan(code).melding('lessenlijn-variant', waar, `"${naam}" en "${winnaar}" (${winCodes.join(', ')}) geven hetzelfde adres (${slug || 'leeg'}), maar zijn niet letterlijk gelijk: de app toont dan twee ${veld === 'lessenlijn' ? 'lessenlijnen' : 'lessenreeksen'}`, bekend);
        }
      }
    }
  };
  for (const vak of GO_VAK_CODES) {
    const vanVak = gesorteerd.filter((l) => l.afgeleid.vak === vak);
    if (vanVak.length === 0) continue;
    vergelijk(vanVak, 'lessenlijn', 'deel 0, Lessenlijn');
    const perLijn = new Map<string, GoLesplanBestand[]>();
    for (const l of vanVak) {
      const s = slugVan(l.afgeleid.lessenlijn);
      perLijn.set(s, [...(perLijn.get(s) ?? []), l]);
    }
    for (const lijn of perLijn.values()) vergelijk(lijn, 'lessenreeks', 'deel 0, Lessenreeks');
  }
  for (const a of perCode.values()) uit.push(...a.lijst);
  return uit;
}

// ══ Omgekeerde index en index ═════════════════════════════════════════

/** Per vak van de minimumdoelen (1-10) het bestand bij-minimumdoel/<vak>.json, met de lesplannen per doel. */
export function maakBijMinimumdoel(leerplannen: readonly GoLeerplanBestand[], lesplannen: readonly GoLesplanBestand[]): GoBijMinimumdoelBestand[] {
  const lesplannenVan = new Map<string, string[]>();
  for (const lp of [...lesplannen].sort((a, b) => (a.code < b.code ? -1 : 1))) {
    for (const d of lp.afgeleid.leerplandoelen) lesplannenVan.set(d.code, [...(lesplannenVan.get(d.code) ?? []), lp.code]);
  }
  const perVak = new Map<number, Map<string, GoBijDoel[]>>();
  for (const lp of leerplannen) {
    for (const doel of lp.doelen) {
      const perId = new Map<string, { ref: GoMinimumdoelRef; via: GoVia[] | undefined }>();
      for (const r of doel.minimumdoelen.refs) perId.set(r.id, { ref: r, via: undefined });
      for (const i of doel.inhoud) {
        if (!('koppeling' in i) || !i.koppeling) continue;
        for (const r of i.koppeling.refs) {
          const via: GoVia = { soort: i.soort, tekst: i.tekst, rij: i.rij, ...(i.opmaak ? { opmaak: i.opmaak } : {}) };
          const al = perId.get(r.id);
          if (!al) perId.set(r.id, { ref: r, via: [via] });
          else if (al.via) al.via.push(via); // de doelzin zelf verwijst niet: alle MIA-rijen erbij
        }
      }
      for (const [id, { ref, via }] of perId) {
        const vak = vakVanCode(ref.code);
        if (vak === undefined) continue;
        const b: GoBijDoel = {
          code: doel.code,
          moment: ref.moment,
          status: ref.status,
          ...(ref.twijfel ? { twijfel: [...ref.twijfel] } : {}),
          ...(ref.bronCode !== undefined ? { bronCode: ref.bronCode } : {}),
          tekst: doel.tekst,
          ...(doel.opmaak ? { opmaak: doel.opmaak } : {}),
          kennisverwerking: doel.kennisverwerking,
          leeftijden: [...doel.leeftijden],
          lesplannen: lesplannenVan.get(doel.code) ?? [],
          ...(via ? { via } : {}),
        };
        const m = perVak.get(vak) ?? new Map<string, GoBijDoel[]>();
        perVak.set(vak, m);
        m.set(id, [...(m.get(id) ?? []), b]);
      }
    }
  }
  return [...perVak.keys()]
    .sort((a, b) => a - b)
    .map((vak) => {
      const m = perVak.get(vak) as Map<string, GoBijDoel[]>;
      const doelen: Record<string, GoBijDoel[]> = {};
      for (const id of [...m.keys()].sort((a, b) => Number(a) - Number(b))) doelen[id] = (m.get(id) as GoBijDoel[]).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
      const bestand: GoBijMinimumdoelBestand = { app: 'boosterz', kind: 'go-bij-minimumdoel', v: 1, vak, doelen, sha256: '' };
      bestand.sha256 = shaVan(bijMinimumdoelShaInvoer(bestand));
      return bestand;
    });
}

export function maakIndex(
  leerplannen: readonly GoLeerplanBestand[],
  bij: readonly GoBijMinimumdoelBestand[],
  lesplannen: readonly GoLesplanBestand[],
  ingelezen: string,
): GoIndex {
  return {
    app: 'boosterz',
    kind: 'go-index',
    v: 1,
    naamsvermelding: GO_NAAMSVERMELDING,
    ingelezen,
    leerplan: [...leerplannen]
      .sort((a, b) => GO_VAK_CODES.indexOf(a.vak) - GO_VAK_CODES.indexOf(b.vak))
      .map((l) => ({
        vak: l.vak,
        naam: l.naam,
        bestand: `leerplan/${l.vak}.json`,
        aantal: l.doelen.length,
        zonderMinimumdoel: l.doelen.filter(isZonderMinimumdoel).length,
        perLeeftijd: Object.fromEntries(GO_LEEFTIJDEN.map((x) => [x, l.doelen.filter((d) => d.leeftijden.includes(x)).length])) as Record<GoLeeftijd, number>,
        bronDatum: l.bron.bestand.datum,
        sha256: l.sha256,
      })),
    bijMinimumdoel: [...bij].sort((a, b) => a.vak - b.vak).map((b) => ({ vak: b.vak, bestand: `bij-minimumdoel/${b.vak}.json`, sha256: b.sha256 })),
    lesplannen: [...lesplannen]
      .sort((a, b) => (a.code < b.code ? -1 : 1))
      .map((l) => ({
        code: l.code,
        titel: l.titel,
        leeftijd: l.leeftijd,
        vak: l.afgeleid.vak,
        lessenlijn: l.afgeleid.lessenlijn,
        lessenreeks: l.afgeleid.lessenreeks,
        doelen: l.afgeleid.leerplandoelen.map((d) => d.code),
        bestand: `lesplannen/${l.code}.json`,
        sha256: l.sha256,
      })),
  };
}
