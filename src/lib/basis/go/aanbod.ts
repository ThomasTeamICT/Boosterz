// Het aanbod in Boosterz bij een lesplan van het GO! (pakket A2-light): per lesplan een manifest
// public/basis/aanbod/<lesplancode>.json dat per onderdeel zegt welke stap van de leskern, welke activiteit van 'Trainen'
// of de vastlegging het ondersteunt, en voor welke leerplandoelen het is. Ontwerp: docs/basisonderwijs/GO-LEERPLAN.md
// (§ Aanbod en § A2) en docs/UITLEGVORMEN.md § 5 (beslissing van de eigenaar van 13 november 2026: kant-en-klaar aanbod
// per lesplan, elk leerplandoel gedekt, de volgorde volgt de stappen van het lesplan).
//
// Zuiver: geen fetch, geen React. Het laden staat in aanbodBron.ts.
//
// Drie controles:
// - lichtGoAanbod: de vorm, bij het laden in de app (zoals lichteControle.ts voor de bestanden van het GO!), zodat een
//   beschadigd bestand een melding geeft in plaats van een scherm dat vastloopt;
// - valideerAanbod: het aanbod tegenover zijn lesplan (fouten, wat niet gedekt is, en of het lesplan veranderde);
// - controleerBordlesTegenOnderdeel: een bordles claimt geen doel dat geen stap behandelt, en omgekeerd.
// De uitrolpoort (aanbodBestanden.test.ts) eist dat alle drie leeg zijn voor elk bestand in public/basis/aanbod/.

import { doelenVan } from '../../bordles/formaat';
import type { BordlesConfig, WidgetTypeId } from '../../types';
import type { GoLesplanBestand } from './types';

/** 'uitleg' is een bordles (uitleg op het bord, docs/UITLEGVORMEN.md); de andere drie komen uit GO-LEERPLAN.md. */
export type GoAanbodSoort = 'uitleg' | 'digibord' | 'oefening' | 'materiaal';
export const GO_AANBOD_SOORTEN: readonly GoAanbodSoort[] = ['uitleg', 'digibord', 'oefening', 'materiaal'];

/** De soort in gewone taal, zoals de leerkracht ze ziet. */
export const GO_AANBOD_SOORT_LABEL: Readonly<Record<GoAanbodSoort, string>> = {
  uitleg: 'Uitleg op het bord',
  digibord: 'Op het digibord',
  oefening: 'Oefening',
  materiaal: 'Materiaal om af te drukken',
};

export type GoStapNr = 1 | 2 | 3 | 4 | 5 | 6;

export interface GoAanbodOnderdeel {
  /** Kleine letters, cijfers en streepjes ('dier-of-plant'): het staat in het adres van het scherm. */
  id: string;
  soort: GoAanbodSoort;
  titel: string;
  /** trainen: de titel letterlijk uit deel 5 (afgeleid.trainen). */
  steunt: { stappen?: GoStapNr[]; trainen?: string[]; vastlegging?: true };
  /** Leerplandoelen uit deel 2 van dat lesplan (afgeleid.leerplandoelen). */
  doelen: string[];
  /** Zo zie je dat het lukt. */
  bewijs?: string;
  /** `bestand` relatief binnen public/basis/aanbod/<lesplancode>/, bv. 'dier-of-plant.json'. */
  widget?: { type: WidgetTypeId; bestand: string };
}

/** public/basis/aanbod/<lesplancode>.json. De volgorde van `onderdelen` is de volgorde waarin de leerkracht ze ziet. */
export interface GoAanbodBestand {
  app: 'boosterz';
  kind: 'go-aanbod';
  v: 1;
  /** Het lesplan waarop dit steunt. Wijkt de sha256 af, dan staat het aanbod op 'na te kijken'. */
  lesplan: { code: string; sha256: string };
  onderdelen: GoAanbodOnderdeel[];
}

/** Een bordles in het aanbod: public/basis/aanbod/<lesplancode>/<bestand>. */
export interface GoAanbodBordles {
  soort: 'bordles';
  titel: string;
  config: BordlesConfig;
}

/**
 * Alle soorten oefeningen van de app. Een vaste lijst, want de registry is een React-bestand. De typecontrole hieronder
 * faalt als er een soort bijkomt in WidgetTypeId en niet hier.
 */
const WIDGET_TYPES = [
  'quiz', 'worksheet', 'exitticket', 'flashcards', 'crossword', 'wordsearch', 'memory', 'hangman', 'pairs', 'timeline',
  'hotspot', 'whiteboard', 'spinner', 'bingo', 'arithmetic', 'dictation', 'poll', 'checklist', 'timer', 'scramble',
  'splitworksheet', 'videoquiz', 'splitwhiteboard', 'jigsaw', 'spotdifference', 'carousel', 'imageviewer', 'beforeafter',
  'framesequence', 'tiptiles', 'randomimages', 'mediaplayer', 'activeplot', 'chart', 'webquest', 'mindmap', 'planner',
  'piano', 'bordles',
] as const satisfies readonly WidgetTypeId[];
type OntbrekendType = Exclude<WidgetTypeId, (typeof WIDGET_TYPES)[number]>;
/** Alleen voor de typecontrole: `true` kan hier alleen staan als WIDGET_TYPES elke WidgetTypeId bevat. */
export const ALLE_WIDGET_TYPES_GEKEND: [OntbrekendType] extends [never] ? true : never = true;

export function isWidgetType(v: unknown): v is WidgetTypeId {
  return typeof v === 'string' && (WIDGET_TYPES as readonly string[]).includes(v);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 80;
const SHA256 = /^[0-9a-f]{64}$/;

/** Is dit een geldige id van een onderdeel (kleine letters, cijfers en streepjes, hoogstens 80 tekens)? */
export function isGeldigeOnderdeelId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= MAX_SLUG && SLUG.test(id);
}

/**
 * Is dit een geldige naam voor het bestand van een onderdeel: een slug met '.json', zonder map, zonder '..' en zonder
 * hoofdletters? Zo haalt de app nooit iets buiten public/basis/aanbod/<code>/ op.
 */
export function isGeldigAanbodBestand(naam: unknown): naam is string {
  if (typeof naam !== 'string' || !naam.endsWith('.json')) return false;
  return isGeldigeOnderdeelId(naam.slice(0, -'.json'.length));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isTekst = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isTekstLijst = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * De vorm van een aanbodbestand, bij het laden in de app. Geeft een lege lijst als de vorm klopt. Of de verwijzingen
 * kloppen tegenover het lesplan, zegt valideerAanbod.
 */
export function lichtGoAanbod(json: unknown): string[] {
  const f: string[] = [];
  if (!isObject(json)) return ['geen object'];
  if (json.app !== 'boosterz') f.push('app is niet boosterz');
  if (json.kind !== 'go-aanbod') f.push('kind is niet go-aanbod');
  if (json.v !== 1) f.push(`onbekende versie (${String(json.v)})`);
  const lp = json.lesplan;
  if (!isObject(lp) || typeof lp.code !== 'string' || typeof lp.sha256 !== 'string' || !SHA256.test(lp.sha256)) {
    f.push('lesplan moet { code, sha256 } zijn, met een sha256 van 64 hexadecimale tekens');
  }
  if (!Array.isArray(json.onderdelen)) {
    f.push('onderdelen is geen lijst');
    return f;
  }
  json.onderdelen.forEach((o: unknown, i: number) => {
    const p = `onderdelen[${i}]`;
    if (!isObject(o)) {
      f.push(`${p} is geen object`);
      return;
    }
    if (typeof o.id !== 'string') f.push(`${p}.id is geen tekst`);
    if (!(GO_AANBOD_SOORTEN as readonly unknown[]).includes(o.soort)) f.push(`${p}.soort is onbekend (${String(o.soort)})`);
    if (!isTekst(o.titel)) f.push(`${p}.titel ontbreekt`);
    const s = o.steunt;
    if (!isObject(s)) f.push(`${p}.steunt is geen object`);
    else {
      if (s.stappen !== undefined && !(Array.isArray(s.stappen) && s.stappen.every((n) => Number.isInteger(n)))) f.push(`${p}.steunt.stappen is geen lijst van gehele getallen`);
      if (s.trainen !== undefined && !isTekstLijst(s.trainen)) f.push(`${p}.steunt.trainen is geen lijst van teksten`);
      if (s.vastlegging !== undefined && s.vastlegging !== true) f.push(`${p}.steunt.vastlegging mag alleen true zijn`);
    }
    if (!isTekstLijst(o.doelen)) f.push(`${p}.doelen is geen lijst van teksten`);
    if (o.bewijs !== undefined && typeof o.bewijs !== 'string') f.push(`${p}.bewijs is geen tekst`);
    if (o.widget !== undefined && (!isObject(o.widget) || typeof o.widget.type !== 'string' || typeof o.widget.bestand !== 'string')) {
      f.push(`${p}.widget moet { type, bestand } zijn`);
    }
  });
  return f;
}

/** De vorm van een bordles-bestand in het aanbod. Of de les zelf klopt, zegt valideerBordles. */
export function lichtAanbodBordles(json: unknown): string[] {
  if (!isObject(json)) return ['geen object'];
  const f: string[] = [];
  if (json.soort !== 'bordles') f.push(`soort is niet bordles (${String(json.soort)})`);
  if (!isTekst(json.titel)) f.push('titel ontbreekt');
  if (!isObject(json.config) || !Array.isArray(json.config.fases)) f.push('config is geen bordles (fases ontbreken)');
  return f;
}

export interface AanbodUitkomst {
  /** Wat niet klopt tegenover het lesplan; leeg in de uitrolpoort. */
  fouten: string[];
  /** De leerplandoelen van het lesplan die door geen enkel onderdeel gedekt worden, in de volgorde van het lesplan. */
  nietGedekt: string[];
  /** De sha256 in het aanbod verschilt van die van het lesplan: het lesplan veranderde sinds het aanbod gemaakt werd. */
  naTeKijken: boolean;
}

/**
 * Het aanbod tegenover zijn lesplan. Verwacht een aanbod dat door lichtGoAanbod kwam.
 * Fouten: de lesplancode klopt niet; een stap bestaat niet in afgeleid.stappen; een titel van 'Trainen' staat niet
 * letterlijk in afgeleid.trainen; een doelcode staat niet in afgeleid.leerplandoelen; een dubbele of ongeldige id; een
 * widgetbestand met een ongeldige naam of een onbekend type; een onderdeel dat nergens op steunt; 'uitleg' zonder bordles
 * of een bordles bij een andere soort.
 */
export function valideerAanbod(aanbod: GoAanbodBestand, lesplan: GoLesplanBestand): AanbodUitkomst {
  const fouten: string[] = [];
  const a = lesplan.afgeleid;
  if (aanbod.lesplan.code !== lesplan.code) fouten.push(`het aanbod hoort bij lesplan ${aanbod.lesplan.code}, niet bij ${lesplan.code}`);

  const stappen = new Set<number>(a.stappen.map((s) => s.nr));
  const trainen = new Set(a.trainen.map((t) => t.titel).filter((t): t is string => typeof t === 'string'));
  const doelenLesplan = a.leerplandoelen.map((d) => d.code);
  const doelSet = new Set(doelenLesplan);
  const ids = new Set<string>();
  const gedekt = new Set<string>();

  for (const o of aanbod.onderdelen) {
    const p = `onderdeel ${JSON.stringify(o.id)}`;
    if (!isGeldigeOnderdeelId(o.id)) fouten.push(`${p}: ongeldige id (alleen kleine letters, cijfers en streepjes)`);
    if (ids.has(o.id)) fouten.push(`${p}: dubbele id`);
    ids.add(o.id);

    const st = o.steunt.stappen ?? [];
    const tr = o.steunt.trainen ?? [];
    if (st.length === 0 && tr.length === 0 && o.steunt.vastlegging !== true) fouten.push(`${p}: steunt op geen stap, geen activiteit van Trainen en niet op de vastlegging`);
    for (const n of st) if (!stappen.has(n)) fouten.push(`${p}: stap ${n} bestaat niet in lesplan ${lesplan.code}`);
    if (new Set(st).size !== st.length) fouten.push(`${p}: een stap staat er twee keer`);
    for (const t of tr) if (!trainen.has(t)) fouten.push(`${p}: de activiteit ${JSON.stringify(t)} staat niet letterlijk in Trainen van lesplan ${lesplan.code}`);

    const gezien = new Set<string>();
    for (const d of o.doelen) {
      if (!doelSet.has(d)) fouten.push(`${p}: doel ${d} staat niet in deel 2 van lesplan ${lesplan.code}`);
      else gedekt.add(d);
      if (gezien.has(d)) fouten.push(`${p}: doel ${d} staat er twee keer`);
      gezien.add(d);
    }

    if (o.widget) {
      if (!isGeldigAanbodBestand(o.widget.bestand)) fouten.push(`${p}: ongeldige bestandsnaam ${JSON.stringify(o.widget.bestand)} (kleine letters, cijfers en streepjes, met .json, zonder map)`);
      if (!isWidgetType(o.widget.type)) fouten.push(`${p}: onbekende soort oefening ${JSON.stringify(o.widget.type)}`);
    }
    const bordles = o.widget?.type === 'bordles';
    if (o.soort === 'uitleg' && !bordles) fouten.push(`${p}: een uitleg op het bord heeft een bordles nodig (widget.type 'bordles')`);
    if (o.soort !== 'uitleg' && bordles) fouten.push(`${p}: een bordles hoort bij de soort 'uitleg'`);
  }

  return {
    fouten,
    nietGedekt: doelenLesplan.filter((d) => !gedekt.has(d)),
    naTeKijken: aanbod.lesplan.sha256 !== lesplan.sha256,
  };
}

/**
 * Een bordles tegenover zijn onderdeel: elk doel van het onderdeel moet in een stap van de bordles staan, en de bordles
 * claimt geen doel dat het onderdeel niet noemt. Geeft een lege lijst als het klopt.
 */
export function controleerBordlesTegenOnderdeel(onderdeel: GoAanbodOnderdeel, config: BordlesConfig): string[] {
  const fouten: string[] = [];
  const inLes = doelenVan(config);
  const inOnderdeel = new Set(onderdeel.doelen);
  for (const d of onderdeel.doelen) if (!inLes.has(d)) fouten.push(`doel ${d} van onderdeel ${JSON.stringify(onderdeel.id)} komt in geen enkele stap van de bordles voor`);
  for (const d of inLes) if (!inOnderdeel.has(d)) fouten.push(`de bordles behandelt doel ${d}, maar onderdeel ${JSON.stringify(onderdeel.id)} noemt het niet`);
  return fouten;
}

// ── Zinnen voor de schermen ──────────────────────────────────────────────────

/** 'a', 'a en b', 'a, b en c'. */
export function enLijst(delen: readonly string[]): string {
  if (delen.length <= 1) return delen.join('');
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** Waar een onderdeel bij hoort, als stuk van een zin: 'stap 2, 3 en 5', 'de activiteit ‘Wie heeft honger?’ uit Trainen'. */
export function steuntDelen(o: GoAanbodOnderdeel): string[] {
  const uit: string[] = [];
  const st = o.steunt.stappen ?? [];
  if (st.length > 0) uit.push(`stap ${enLijst(st.map(String))}`);
  const tr = o.steunt.trainen ?? [];
  if (tr.length === 1) uit.push(`de activiteit ‘${tr[0]}’ uit Trainen`);
  else if (tr.length > 1) uit.push(`de activiteiten ${enLijst(tr.map((t) => `‘${t}’`))} uit Trainen`);
  if (o.steunt.vastlegging) uit.push('de vastlegging');
  return uit;
}

/** 'Dit hoort bij stap 2, 3 en 5 van lesplan LP0065.' */
export function hoortBijZin(o: GoAanbodOnderdeel, code: string): string {
  const delen = steuntDelen(o);
  return delen.length > 0 ? `Dit hoort bij ${enLijst(delen)} van lesplan ${code}.` : `Dit hoort bij lesplan ${code}.`;
}

/** 'Alle 3 leerplandoelen van dit lesplan komen aan bod.' of 'Nog niet gedekt: WT.008, WT.028.' */
export function dekkingZin(nietGedekt: readonly string[], totaal: number): string {
  if (nietGedekt.length === 0) {
    return totaal === 1 ? 'Het leerplandoel van dit lesplan komt aan bod.' : `Alle ${totaal} leerplandoelen van dit lesplan komen aan bod.`;
  }
  return `Nog niet gedekt: ${nietGedekt.join(', ')}.`;
}
