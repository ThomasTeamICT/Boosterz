// ── De controlepoort voor leerplannen (docs/LEERPLANNEN.md § 7) ─────────────
//
// Een pure functie zonder model. Een leerplan dat als nagekeken bevestigd wordt, moet letterlijk en
// volledig uit de bron komen, met kloppende verwijzingen. De poort kijkt na wat een script kan zien;
// de mens kijkt de rest na. Pas als er geen enkele fout is, mag een mens het leerplan als nagekeken
// bevestigen (`kanBevestigen`, en `bevestigLeerplan` in curriculum.ts eist dat).
//
// - Letterlijk: elk doel staat in de bron, op woordgrenzen, en loopt in de bron niet verder (dan is
//   het afgekapt). Zonder bron is er niets na te kijken: dat is een fout. Een officieel leerplan
//   (herkomst "officieel") heeft de set zelf als bron: elke tekst moet gelijk zijn aan die van het
//   minimumdoel waar hij naar verwijst, en elk doel van de set moet erin staan.
// - Volledig: geen dubbele of ontbrekende codes, geen doel dat in de bron vooraan een regel staat maar
//   in het leerplan ontbreekt, geen twee doelen in één, geen afgekapte bron.
// - Verwijzingen: elke verwijzing bestaat in een meegegeven set, met de juiste code, en klopt met de
//   verwijzing zoals ze in de bron staat (`refsBron`).
// - Herkomst: ingevuld, met de vingerafdruk van het bronbestand bij een pdf of geplakte tekst.
//
// De berichten zijn voor de leerkracht: gewone taal, en "nakijken" in plaats van "controleren".

import type { Curriculum, CurriculumGoal, MinimumdoelRef } from './curriculumTypes';
import { doelenVingerafdruk, normaliseerDoeltekst, normalizeGoalCode } from './curriculum';
import {
  beschrijfAfbreking,
  beschrijfGat,
  gatenInNummering,
  haalVerwijzingenUitMetPosities,
  kopEnVoetregels,
  regelsMetDoelcode,
  samengevoegdeCode,
  schrijfLigaturenUit,
  splitsRegels,
  voegRegelsSamenMetAfbrekingen,
} from './leerplanLezer';
import { normaliseerMdCode, zoekVerwijzingBlokken, type VerwijzingBlok } from './minimumdoelVerwijzing';
import { htmlNaarTekst, type MinimumdoelenSetBestand } from './minimumdoelen';

export type BevindingSoort = 'letterlijk' | 'volledig' | 'verwijzing' | 'herkomst' | 'dekking';
export type BevindingErnst = 'fout' | 'waarschuwing' | 'info';

export interface Bevinding {
  soort: BevindingSoort;
  ernst: BevindingErnst;
  doelId?: string;
  code?: string;
  bericht: string;
}

export interface DoelRapport {
  letterlijk: 'ja' | 'nee' | 'onbekend';
  /** ±200 tekens bron rond de vondst (genormaliseerd), met "…" waar afgeknipt; bij een officieel doel de officiële tekst. */
  vindplaats?: string;
  verwijzingen: 'ok' | 'probleem' | 'geen';
  /** Afbrekingen aan het regeleinde die in de vindplaats hersteld werden, bv. "e-|mail → email". */
  afbrekingen?: string[];
}

export interface ControleRapport {
  bevindingen: Bevinding[];
  perDoel: Record<string, DoelRapport>;
  tellers: { doelen: number; letterlijk: number; nietLetterlijk: number; verwijzingen: number; verwijzingenOk: number };
  dekking: { set: string; naam: string; nietGedekt: MinimumdoelRef[] }[];
  kanBevestigen: boolean;
  samenvatting: string;
  /**
   * Vingerafdruk (`doelenVingerafdruk`) van de doelen waarop de poort liep, precies zoals ze
   * meegegeven werden. `bevestigLeerplan` weigert als de (gesaneerde) doelen een andere hebben.
   */
  doelenSha256: string;
}

export interface ControleOpties {
  /**
   * De brontekst (pdf of geplakte tekst). Zonder bron kan niets nagekeken worden (een fout), behalve
   * bij een officieel leerplan: daar zijn de sets de bron.
   */
  bronTekst?: string;
  /** De sets minimumdoelen waar het leerplan naar verwijst. Een verwijzing naar een andere set is een fout. */
  sets?: MinimumdoelenSetBestand[];
  /** De bron is niet volledig gelezen (zie `extractPdfLines`). */
  bronAfgekapt?: boolean;
}

// ── Normaliseren voor de vergelijking ───────────────────────────────────────

const AANHALINGSTEKENS_ENKEL = /[‘’‚‛′‹›`´]/g;
const AANHALINGSTEKENS_DUBBEL = /[“”„‟″«»]/g;
const STREEPJES = /[\u2010\u2011\u2012–—―\u2212]/g;
// Als alternatieven en niet als tekenklasse: de verbinder U+200D in een tekenklasse is misleidend.
const NULBREEDTE = /\u200b|\u200c|\u200d|\u2060|\ufeff/g;

/** Per regel, vóór het samenvoegen: tekens zonder breedte weg en ligaturen uitgeschreven (de lengte verandert). */
function perRegel(regel: string): string {
  return schrijfLigaturenUit(regel.replace(NULBREEDTE, ''));
}

/** Na het samenvoegen: aanhalingstekens en streepjes gelijktrekken (teken voor teken, de lengte blijft). */
function tekensGelijk(t: string): string {
  return t.replace(AANHALINGSTEKENS_ENKEL, "'").replace(AANHALINGSTEKENS_DUBBEL, '"').replace(STREEPJES, '-');
}

/**
 * Tekst klaarmaken om te vergelijken: NFC; tekens zonder breedte en zachte afbreekstreepjes weg;
 * ligaturen uitgeschreven; regels samengevoegd zoals in de lezer (`voegRegelsSamen`: afbreking aan het
 * regeleinde hersteld, "verwe-" + "ring" → "verwering", "natuur-" + "en milieu" blijft "natuur- en
 * milieu"; opsommingstekens vooraan een regel weg; witruimte één spatie); typografische
 * aanhalingstekens en apostrofs gelijkgetrokken; en- en em-streepjes (en verwante) → "-". Hoofdletters
 * blijven tellen. De regels worden gesplitst zoals in de lezer (`splitsRegels`).
 */
export function normaliseerVoorVergelijking(t: string): string {
  return tekensGelijk(voegRegelsSamenMetAfbrekingen(splitsRegels(t.normalize('NFC')).map(perRegel)).tekst);
}

/** Een genormaliseerde bron, met de plaatsen waar een afbreking hersteld werd. */
interface BronVariant {
  tekst: string;
  afbrekingen: { plaats: number; beschrijving: string }[];
  /** Waar een regel van de bron begint (stijgend). */
  regelBegin: number[];
}

/** Begint op plaats `k` een regel van de bron (of is het het einde van de tekst)? */
function opRegelBegin(variant: BronVariant, k: number): boolean {
  if (k >= variant.tekst.length) return true;
  const i = eersteVanaf(variant.regelBegin, k);
  return i < variant.regelBegin.length && variant.regelBegin[i] === k;
}

/** Eerste index i met `stijgend[i] >= waarde` (binair zoeken). */
function eersteVanaf(stijgend: readonly number[], waarde: number): number {
  let laag = 0;
  let hoog = stijgend.length;
  while (laag < hoog) {
    const midden = (laag + hoog) >> 1;
    if (stijgend[midden] < waarde) laag = midden + 1;
    else hoog = midden;
  }
  return laag;
}

/**
 * De bron in twee vormen: (1) alle regels samengevoegd; (2) zonder kop- en voetregels, paginanummers
 * en paginamarkeringen, en zonder verwijzingsblokken, zodat een doel over een paginagrens of met een
 * verwijzing midden in de zin toch letterlijk gevonden wordt. Bij elke vorm de herstelde afbrekingen
 * met hun plaats, om ze per doel te melden.
 */
function bereidBronVoor(bron: string): { varianten: BronVariant[]; regels: string[]; opmaak: Set<number> } {
  const regels = splitsRegels(bron.normalize('NFC'));
  const opmaak = kopEnVoetregels(regels);
  const genormaliseerd = regels.map(perRegel);

  const een = voegRegelsSamenMetAfbrekingen(genormaliseerd);
  const eerste: BronVariant = {
    tekst: tekensGelijk(een.tekst),
    afbrekingen: een.afbrekingen.map((a) => ({ plaats: a.plaats, beschrijving: beschrijfAfbreking(a) })),
    regelBegin: een.regelBegin,
  };

  const twee = voegRegelsSamenMetAfbrekingen(genormaliseerd.filter((_, i) => !opmaak.has(i)));
  const zonder = haalVerwijzingenUitMetPosities(twee.tekst);
  const tweede: BronVariant = { tekst: tekensGelijk(zonder.tekst), afbrekingen: [], regelBegin: [] };
  for (const b of twee.regelBegin) {
    const k = eersteVanaf(zonder.bron, b);
    if (k < zonder.bron.length && tweede.regelBegin[tweede.regelBegin.length - 1] !== k) tweede.regelBegin.push(k);
  }
  for (const a of twee.afbrekingen) {
    const k = eersteVanaf(zonder.bron, a.plaats);
    // Alleen als het begin van het rechterdeel bleef staan (niet in een weggehaalde verwijzing).
    if (k < zonder.bron.length && zonder.bron[k] === a.plaats) tweede.afbrekingen.push({ plaats: k, beschrijving: beschrijfAfbreking(a) });
  }
  return { varianten: tweede.tekst === eerste.tekst ? [eerste] : [eerste, tweede], regels, opmaak };
}

// ── Hulp ────────────────────────────────────────────────────────────────────

const ERNST_VOLGORDE: Record<BevindingErnst, number> = { fout: 0, waarschuwing: 1, info: 2 };
const VINDPLAATS_MARGE = 200;
const CITAAT = 40;
/** Zoveel vindplaatsen van een doeltekst bekijken we hoogstens per vorm van de bron. */
const MAX_VINDPLAATSEN = 2000;

function meervoud(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`;
}

function kort(t: string, max: number, vanachter = false): string {
  if (t.length <= max) return t;
  return vanachter ? `…${t.slice(t.length - max).trimStart()}` : `${t.slice(0, max).trimEnd()}…`;
}

function uitsnede(bron: string, start: number, lengte: number): string {
  const van = Math.max(0, start - VINDPLAATS_MARGE);
  const tot = Math.min(bron.length, start + lengte + VINDPLAATS_MARGE);
  return `${van > 0 ? '…' : ''}${bron.slice(van, tot)}${tot < bron.length ? '…' : ''}`;
}

const KERN = 12;

/**
 * De langste beginreeks van `t` die in een van de bronnen staat, met de plaats ervan. Eerst de
 * plaatsen waar de eerste 12 tekens staan, en vanaf elk daarvan zo ver mogelijk vergelijken; staan
 * zelfs die 12 tekens nergens, dan binair zoeken op een korter begin (vinden is monotoon: een korter
 * begin vind je altijd als een langer gevonden is). Zo blijft het snel, ook bij een verkeerde bron.
 */
function langsteBegin(t: string, bronnen: readonly string[]): { lengte: number; bron?: string; plaats: number } {
  let beste: { lengte: number; bron?: string; plaats: number } = { lengte: 0, plaats: -1 };
  const kern = t.slice(0, KERN);
  for (const bron of bronnen) {
    for (let p = bron.indexOf(kern); p >= 0; p = bron.indexOf(kern, p + 1)) {
      let k = kern.length;
      while (k < t.length && bron.charCodeAt(p + k) === t.charCodeAt(k)) k++;
      if (k > beste.lengte) beste = { lengte: k, bron, plaats: p };
      if (k === t.length) return beste;
    }
  }
  if (beste.lengte > 0) return beste;
  let laag = 0;
  let hoog = kern.length - 1;
  while (laag < hoog) {
    const midden = Math.ceil((laag + hoog) / 2);
    if (bronnen.some((b) => b.includes(t.slice(0, midden)))) laag = midden;
    else hoog = midden - 1;
  }
  if (laag === 0) return beste;
  const deel = t.slice(0, laag);
  const bron = bronnen.find((b) => b.includes(deel));
  return bron === undefined ? beste : { lengte: laag, bron, plaats: bron.indexOf(deel) };
}

/** Hoe heet een doel in een bericht: zijn code, of "Doel n" zonder code. */
function naamVan(code: string, index: number): string {
  return code.trim() || `Doel ${index + 1}`;
}

function escapeRe(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const isWoordteken = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}\p{M}]/u.test(c);

/** Wat tussen een code en de doeltekst mag staan: witruimte, ":", ".", "(U)", "(uitbreiding)", opsommingstekens, … */
const TUSSEN_CODE_EN_TEKST = String.raw`(?:\s|[:.)\]–—-]|\(U\)|\(uitbreiding(?:sdoel)?\)|uitbreidingsdoel\s*:?|uitbreiding\s*:|[•●○◦▪■▫□►▸‣⁃∙·])*`;

/**
 * Een reguliere expressie die vastlegt dat de code van een doel vlak vóór de tekst staat (aan het
 * einde van wat ervoor staat). Tolerant voor spaties tussen letters en cijfers ("LPD12"), een "U" of
 * "(U)" achter de code, en `TUSSEN_CODE_EN_TEKST`.
 */
function codeVoorRegex(code: string): RegExp | undefined {
  const basis = normalizeGoalCode(code).replace(/\s?\(U\)$/, '').replace(/(\d)U$/, '$1');
  if (!basis) return undefined;
  const patroon = escapeRe(basis.replace(/(\p{L})(\d)/gu, '$1 $2')).replace(/ /g, String.raw`\s?`);
  return new RegExp(String.raw`(?<![\p{L}\p{N}.])${patroon}(?:\s?U|\s?\(U\))?${TUSSEN_CODE_EN_TEKST}$`, 'iu');
}

/** Een doeltekst die zo eindigt, is een afgeronde zin (of lijst): na normalisatie zijn de aanhalingstekens recht. */
const SLOTTEKEN = /[.!?;:)\]"'…]$/;

/**
 * Loopt de bron na een vondst (van `plaats` tot `eind`) verder, zodat het doel afgekapt lijkt? Witruimte,
 * verwijzingsblokken (ook tussen haakjes, ook met "zie") en een komma, puntkomma of dubbelpunt worden
 * overgeslagen. Afgekapt: daarna volgt een kleine letter, of, bij een doel zonder slotteken (punt, …),
 * een letter op dezelfde regel van de bron ("De leerlingen situeren" in "… situeren België op …").
 * Geeft het stuk tekst dat volgt, of `undefined`.
 */
function loopDoor(variant: BronVariant, eind: number, doeltekst: string): string | undefined {
  const bron = variant.tekst;
  let k = eind;
  for (let stap = 0; stap < 6; stap++) {
    while (bron[k] === ' ') k++;
    const haakje = bron[k] === '(' ? 1 : 0;
    const venster = bron.slice(k + haakje, k + haakje + 420);
    const verwijswoord = /^(?:zie|cf\.?|vgl\.?)\s*/i.exec(venster)?.[0].length ?? 0;
    const blok = zoekVerwijzingBlokken(venster.slice(verwijswoord))[0];
    if (blok && blok.start === 0) {
      let na = k + haakje + verwijswoord + blok.eind;
      if (haakje) {
        const sluit = bron.indexOf(')', na);
        if (sluit < 0 || sluit - na > 20) break;
        na = sluit + 1;
      }
      k = na;
      continue;
    }
    if (bron[k] === ',' || bron[k] === ';' || bron[k] === ':') {
      k++;
      continue;
    }
    break;
  }
  const rest = bron.slice(k, k + CITAAT + 1); // één teken meer: zo krijgt een ingekort citaat "…"
  if (/^\p{Ll}/u.test(rest)) return rest;
  if (!SLOTTEKEN.test(doeltekst) && /^\p{L}/u.test(rest) && !opRegelBegin(variant, k)) return rest;
  return undefined;
}

interface Vondst {
  variant: BronVariant;
  plaats: number;
  lengte: number;
  /** De bron loopt na de vondst verder met een kleine letter: wat volgt. */
  afgekapt?: string;
  codeOk: boolean;
}

/**
 * Zoekt een (genormaliseerde) doeltekst in de bron. Een vondst moet op woordgrenzen beginnen en
 * eindigen. Van de vondsten krijgt de voorkeur: niet afgekapt en met de code ervoor, dan niet
 * afgekapt, dan de eerste. `deelVanWoord`: de tekst staat er alleen midden in een woord.
 */
function zoekDoel(tekst: string, code: string, varianten: readonly BronVariant[]): { vondst?: Vondst; deelVanWoord: boolean } {
  const codeRe = code.trim() ? codeVoorRegex(code) : undefined;
  let beste: Vondst | undefined;
  let besteScore = -1;
  let deelVanWoord = false;
  for (const variant of varianten) {
    const bron = variant.tekst;
    let n = 0;
    for (let p = bron.indexOf(tekst); p >= 0 && n < MAX_VINDPLAATSEN; p = bron.indexOf(tekst, p + 1), n++) {
      const e = p + tekst.length;
      const beginOk = p === 0 || !(isWoordteken(bron[p - 1]) && isWoordteken(tekst[0]));
      const eindOk = e === bron.length || !(isWoordteken(bron[e]) && isWoordteken(tekst[tekst.length - 1]));
      if (!beginOk || !eindOk) {
        deelVanWoord = true;
        continue;
      }
      const afgekapt = loopDoor(variant, e, tekst);
      const codeOk = codeRe === undefined || codeRe.test(bron.slice(Math.max(0, p - 80), p));
      const score = (afgekapt === undefined ? 2 : 0) + (codeOk ? 1 : 0);
      if (score > besteScore) {
        beste = { variant, plaats: p, lengte: tekst.length, afgekapt, codeOk };
        besteScore = score;
        if (score === 3) return { vondst: beste, deelVanWoord };
      }
    }
  }
  return { vondst: beste, deelVanWoord };
}

/** Sleutel om doelcodes te vergelijken: hoofdletters, zonder spaties en zonder "U" of "(U)" achteraan. */
function codeSleutel(code: string): string {
  return normalizeGoalCode(code).replace(/\s+/g, '').replace(/\(U\)$/, '').replace(/(\d)U$/, '$1');
}

/** De reeks van een code: alles vóór het laatste getal ("LPD12" → "LPD", "1.2.3" → "1.2."). */
function reeksVan(sleutel: string): string | undefined {
  const m = /^(.*?)\d+$/.exec(sleutel.length <= 80 ? sleutel : '');
  return m ? m[1] : undefined;
}

/** Een genormaliseerde code van een minimumdoel als getallen, of `undefined`. */
function getallen(code: string): number[] | undefined {
  const n = normaliseerMdCode(code);
  return n ? n.split('.').map((d) => parseInt(d, 10)) : undefined;
}

function vergelijkGetallen(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * Ligt een code in een reeks die niet uitgeschreven kon worden ("09.08-10.02")? Alleen codes met
 * evenveel delen als de uiteinden; een omgekeerde reeks ("1.5-1.2") telt van klein naar groot. Zijn de
 * uiteinden niet vergelijkbaar (een verschillend aantal delen), dan ligt geen enkele code erin.
 */
function inReeks(code: string, reeks: { van: string; tot: string }): boolean {
  const c = getallen(code);
  const a = getallen(reeks.van);
  const b = getallen(reeks.tot);
  if (!c || !a || !b || a.length !== b.length || c.length !== a.length) return false;
  const [laag, hoog] = vergelijkGetallen(a, b) <= 0 ? [a, b] : [b, a];
  return vergelijkGetallen(laag, c) <= 0 && vergelijkGetallen(c, hoog) <= 0;
}

/** "MD 09.08-10.02": de aanduiding van het blok, met de uiteinden van de reeks. */
function reeksNaam(blok: VerwijzingBlok, reeks: { van: string; tot: string }): string {
  const aanduiding = blok.tekst.slice(0, blok.tekst.search(/\d/)).trim();
  return `${aanduiding ? `${aanduiding} ` : ''}${reeks.van}-${reeks.tot}`;
}

interface SetInfo {
  naam: string;
  /** Per vast nummer: de code en de ruwe (HTML-)tekst. */
  doelen: Map<string, { code: string; tekst: string }>;
}

// ── De poort ────────────────────────────────────────────────────────────────

/**
 * Kijkt een leerplan na tegen zijn bron en de minimumdoelen (zie de uitleg bovenaan en § 7 van het
 * ontwerp). Letterlijk betekent: de genormaliseerde doeltekst staat in de genormaliseerde bron, op
 * woordgrenzen, en de bron loopt daarna niet verder met een kleine letter. Een doel mag over een
 * paginagrens lopen (kop- en voetregels, paginanummers, paginamarkeringen) en een verwijzing naar een
 * minimumdoel mag uit de zin gehaald zijn; verder moet elk teken kloppen.
 *
 * Grens van de volledigheidscontrole: een regel van de bron die vooraan een doelcode heeft, geeft een
 * fout als het leerplan geen doel met die code heeft, maar alleen voor codes uit een reeks waar het
 * leerplan al doelen van heeft (dezelfde letters en hetzelfde voorvoegsel tot het laatste nummer: bij
 * doelen "LPD 1", "LPD 2" telt "LPD 3", bij "1.2.1" telt "1.2.5", niet "1.3.1" of "09.01"). Een regel
 * waarvan de rest eruitziet als een kop ("2.3 Energie") telt niet bij een samengesteld nummer, en bij
 * gewone nummers ("7.") telt een regel alleen als er "De leerling(en)" na staat: genummerde lijsten in
 * wenken mogen geen fout geven.
 */
export function controleerLeerplan(cur: Curriculum, opties: ControleOpties = {}): ControleRapport {
  const goals: CurriculumGoal[] = (Array.isArray(cur.goals) ? cur.goals : []).filter(
    (g): g is CurriculumGoal => g !== null && typeof g === 'object',
  );
  const bevindingen: (Bevinding & { plaats: number; volg: number })[] = [];
  const voeg = (b: Bevinding, plaats = -1) => bevindingen.push({ ...b, plaats, volg: bevindingen.length });
  const perDoel: Record<string, DoelRapport> = {};
  const tellers = { doelen: goals.length, letterlijk: 0, nietLetterlijk: 0, verwijzingen: 0, verwijzingenOk: 0 };
  const officieel = cur.herkomst?.methode === 'officieel';
  const codeVan = (g: CurriculumGoal) => (typeof g.code === 'string' ? g.code : '');
  const refsVan = (g: CurriculumGoal): MinimumdoelRef[] =>
    (Array.isArray(g.refs) ? g.refs : []).filter((r): r is MinimumdoelRef => r !== null && typeof r === 'object');

  // De sets, per id.
  const sets = (opties.sets ?? []).filter((s) => s && s.set && typeof s.set.id === 'string' && Array.isArray(s.doelen));
  const setsOpId = new Map<string, SetInfo>();
  for (const s of sets) {
    if (setsOpId.has(s.set.id)) continue;
    const doelen = new Map<string, { code: string; tekst: string }>();
    for (const d of s.doelen) {
      if (d && typeof d.id === 'string' && d.id.trim() !== '') doelen.set(d.id, { code: String(d.code ?? ''), tekst: typeof d.tekst === 'string' ? d.tekst : '' });
    }
    setsOpId.set(s.set.id, { naam: s.set.korteNaam?.trim() || s.set.naam, doelen });
  }
  const officieleTekst = new Map<string, string>();
  const tekstVanSetdoel = (doel: { tekst: string }): string => {
    let t = officieleTekst.get(doel.tekst);
    if (t === undefined) officieleTekst.set(doel.tekst, (t = normaliseerDoeltekst(htmlNaarTekst(doel.tekst))));
    return t;
  };

  /**
   * Een officieel doel tegen zijn set: de tekst moet gelijk zijn aan die van elk minimumdoel waar het
   * naar verwijst (zoals bewaard: `normaliseerDoeltekst(htmlNaarTekst(…))`). Geeft het probleem, of
   * niets, en de officiële tekst als vindplaats.
   */
  const vergelijkMetSet = (goal: CurriculumGoal, naam: string): { bericht?: string; vindplaats?: string } => {
    const tekst = normaliseerDoeltekst(typeof goal.text === 'string' ? goal.text : '');
    const refs = refsVan(goal);
    if (!tekst) return { bericht: `${naam} heeft geen tekst.` };
    if (refs.length === 0) return { bericht: `${naam} verwijst niet naar een officieel minimumdoel: zonder verwijzing kan de tekst niet nagekeken worden.` };
    let vindplaats: string | undefined;
    for (const ref of refs) {
      const doel = setsOpId.get(ref.set)?.doelen.get(ref.id);
      if (!doel) {
        return { bericht: `${naam} kan niet met de officiële tekst vergeleken worden: minimumdoel ${ref.code || ref.id} (${ref.set}) zit niet in de meegegeven sets.`, vindplaats };
      }
      const officiele = tekstVanSetdoel(doel);
      vindplaats ??= kort(officiele, 2 * VINDPLAATS_MARGE);
      if (officiele === tekst) continue;
      let k = 0;
      while (k < tekst.length && tekst[k] === officiele[k]) k++;
      const waar = k === 0
        ? ''
        : ` Tot "${kort(tekst.slice(0, k).trimEnd(), CITAAT, true)}" klopt het; daarna loopt het mis bij "${kort(tekst.slice(k).trimStart() || '(einde van het doel)', CITAAT)}".`;
      return { bericht: `${naam} is niet gelijk aan de officiële tekst van minimumdoel ${doel.code} (${ref.set}).${waar}`, vindplaats };
    }
    return { vindplaats };
  };

  // Elk doel een eigen rapport; een dubbel intern nummer zou een rapport overschrijven.
  const eersteMetId = new Map<string, number>();
  goals.forEach((goal, index) => {
    perDoel[goal.id] = { letterlijk: 'onbekend', verwijzingen: 'geen' };
    const eerder = eersteMetId.get(goal.id);
    if (eerder === undefined) eersteMetId.set(goal.id, index);
    else {
      voeg(
        { soort: 'volledig', ernst: 'fout', doelId: goal.id, bericht: `Doel ${eerder + 1} en doel ${index + 1} hebben hetzelfde interne nummer. Bewaar het leerplan opnieuw en kijk het dan na.` },
        index,
      );
    }
  });

  // ── Letterlijk ──
  const metBron = !officieel && typeof opties.bronTekst === 'string';
  const voorbereid = metBron ? bereidBronVoor(opties.bronTekst as string) : undefined;
  const bronnen = voorbereid?.varianten.map((v) => v.tekst) ?? [];
  if (!officieel && !metBron) {
    voeg({
      soort: 'letterlijk',
      ernst: 'fout',
      bericht: 'Lees de bron in om te kunnen nakijken: zonder bron is niet na te gaan of de doelen letterlijk overgenomen zijn.',
    });
  }

  goals.forEach((goal, index) => {
    const rapport = perDoel[goal.id];
    const naam = naamVan(codeVan(goal), index);
    const ruweTekst = typeof goal.text === 'string' ? goal.text : '';
    const fout = (bericht: string, soort: BevindingSoort = 'letterlijk') => voeg({ soort, ernst: 'fout', doelId: goal.id, code: goal.code, bericht }, index);

    if (officieel) {
      // De bron is de set zelf: elke tekst gelijk aan die van het minimumdoel waar hij naar verwijst.
      const { bericht, vindplaats } = vergelijkMetSet(goal, naam);
      if (vindplaats !== undefined) rapport.vindplaats = vindplaats;
      if (bericht !== undefined) {
        rapport.letterlijk = 'nee';
        tellers.nietLetterlijk++;
        fout(bericht);
      } else {
        rapport.letterlijk = 'ja';
        tellers.letterlijk++;
      }
      return;
    }
    if (!metBron || !voorbereid) return;

    const tekst = normaliseerVoorVergelijking(ruweTekst);
    if (!tekst) {
      rapport.letterlijk = 'nee';
      tellers.nietLetterlijk++;
      return fout(`${naam} heeft geen tekst.`);
    }
    const { vondst, deelVanWoord } = zoekDoel(tekst, codeVan(goal), voorbereid.varianten);
    if (vondst) {
      rapport.vindplaats = uitsnede(vondst.variant.tekst, vondst.plaats, vondst.lengte);
      const afbrekingen = vondst.variant.afbrekingen
        .filter((a) => a.plaats > vondst.plaats && a.plaats < vondst.plaats + vondst.lengte)
        .map((a) => a.beschrijving);
      if (afbrekingen.length > 0) {
        rapport.afbrekingen = afbrekingen;
        voeg(
          { soort: 'letterlijk', ernst: 'waarschuwing', doelId: goal.id, code: goal.code, bericht: `${naam}: afbreking hersteld: ${afbrekingen.join(', ')}; kijk na of het streepje bij het woord hoort.` },
          index,
        );
      }
      if (vondst.afgekapt !== undefined) {
        rapport.letterlijk = 'nee';
        tellers.nietLetterlijk++;
        return fout(`${naam} lijkt afgekapt: in de bron loopt de tekst verder met "${kort(vondst.afgekapt, CITAAT)}". Neem het volledige doel over.`);
      }
      rapport.letterlijk = 'ja';
      tellers.letterlijk++;
      if (!vondst.codeOk) {
        voeg(
          {
            soort: 'letterlijk',
            ernst: 'waarschuwing',
            doelId: goal.id,
            code: goal.code,
            bericht: `Bij ${naam} staan code en tekst niet samen in de bron: vlak vóór de tekst staat niet "${codeVan(goal).trim()}". Kijk na of de tekst bij de juiste code hoort.`,
          },
          index,
        );
      }
      return;
    }

    rapport.letterlijk = 'nee';
    tellers.nietLetterlijk++;
    if (deelVanWoord) {
      return fout(`${naam} staat in de bron alleen als deel van een langer woord ("${kort(tekst, CITAAT)}"): begin en einde van het doel moeten op een woordgrens liggen.`);
    }
    const begin = langsteBegin(tekst, bronnen);
    const goed = tekst.slice(0, begin.lengte);
    const rest = tekst.slice(begin.lengte);
    if (begin.lengte === 0) {
      return fout(`${naam} staat niet letterlijk in de bron: al het begin ("${kort(rest, CITAAT)}") is niet terug te vinden.`);
    }
    if (begin.lengte >= 15 && begin.bron !== undefined) rapport.vindplaats = uitsnede(begin.bron, begin.plaats, begin.lengte);
    return fout(`${naam} staat niet letterlijk in de bron. Tot "${kort(goed.trimEnd(), CITAAT, true)}" klopt het; daarna loopt het mis bij "${kort(rest.trimStart(), CITAAT)}".`);
  });

  // ── Volledig ──
  if (goals.length === 0) voeg({ soort: 'volledig', ernst: 'fout', bericht: 'Het leerplan heeft geen doelen.' });
  if (opties.bronAfgekapt) {
    voeg({
      soort: 'volledig',
      ernst: 'fout',
      bericht: 'De bron is niet volledig gelezen (te veel pagina’s of tekst), dus er kunnen doelen ontbreken. Lees dan alleen de pagina’s met de doelen in: kopieer ze en kies ‘Tekst plakken’.',
    });
  }
  const eersteMetCode = new Map<string, number>();
  goals.forEach((goal, index) => {
    const code = normalizeGoalCode(codeVan(goal));
    if (!code) {
      voeg({ soort: 'volledig', ernst: 'fout', doelId: goal.id, bericht: `${naamVan('', index)} heeft geen code.` }, index);
      return;
    }
    const eerder = eersteMetCode.get(code);
    if (eerder === undefined) {
      eersteMetCode.set(code, index);
      return;
    }
    voeg(
      {
        soort: 'volledig',
        ernst: 'fout',
        doelId: goal.id,
        code: goal.code,
        bericht: `De code ${code} komt meer dan één keer voor (doel ${eerder + 1} en doel ${index + 1}). Elke code moet uniek zijn.`,
      },
      index,
    );
  });
  for (const gat of gatenInNummering(goals.map(codeVan))) {
    const na = goals[gat.voorIndex];
    const enkel = gat.aantal === 1;
    voeg(
      {
        soort: 'volledig',
        ernst: 'waarschuwing',
        doelId: na?.id,
        code: gat.ontbrekend[0],
        bericht: `${beschrijfGat(gat)}; ${enkel ? 'staat het niet in de bron of vond Boosterz het niet?' : 'staan ze niet in de bron of vond Boosterz ze niet?'}`,
      },
      gat.voorIndex,
    );
  }
  // Twee doelen in één: een andere doelcode met een doelzin midden in de tekst.
  if (!officieel) {
    goals.forEach((goal, index) => {
      const ander = samengevoegdeCode(typeof goal.text === 'string' ? goal.text : '', codeVan(goal));
      if (ander === undefined) return;
      voeg(
        {
          soort: 'volledig',
          ernst: 'fout',
          doelId: goal.id,
          code: goal.code,
          bericht: `${naamVan(codeVan(goal), index)} bevat ook het begin van een ander doel (${ander}): twee doelen lijken samengevoegd. Splits ze in twee doelen.`,
        },
        index,
      );
    });
  }
  // Een doel dat in de bron vooraan een regel staat, maar in het leerplan ontbreekt (zie de grens hierboven).
  if (voorbereid) {
    const sleutels = new Set(goals.map((g) => codeSleutel(codeVan(g))).filter((k) => /\d$/.test(k)));
    const reeksen = new Set([...sleutels].map(reeksVan).filter((r): r is string => r !== undefined));
    const gemeld = new Set<string>();
    for (const r of regelsMetDoelcode(voorbereid.regels, voorbereid.opmaak)) {
      const sleutel = codeSleutel(r.code);
      const reeks = reeksVan(sleutel);
      if (!r.telt || reeks === undefined || !reeksen.has(reeks) || sleutels.has(sleutel) || gemeld.has(sleutel)) continue;
      if (reeks === '' && !/^(?:de\s+)?leerling(?:en)?\b/i.test(r.rest)) continue; // gewone nummers: alleen met "De leerling(en)"
      gemeld.add(sleutel);
      voeg({
        soort: 'volledig',
        ernst: 'fout',
        code: r.code,
        bericht: `In de bron begint een regel met ${r.code} ("${kort(r.rest, CITAAT)}"), maar het leerplan heeft geen doel ${r.code}. Ontbreekt dat doel?`,
      });
    }
  }

  // ── Verwijzingen ──
  const gedekt = new Set<string>();
  goals.forEach((goal, index) => {
    const rapport = perDoel[goal.id];
    const naam = naamVan(codeVan(goal), index);
    const refs = refsVan(goal);
    const refsBron = typeof goal.refsBron === 'string' ? goal.refsBron.trim() : '';
    let allesOk = true;
    const probleem = (bericht: string) => {
      allesOk = false;
      voeg({ soort: 'verwijzing', ernst: 'fout', doelId: goal.id, code: goal.code, bericht }, index);
    };
    if (refs.length === 0) {
      if (refsBron) {
        rapport.verwijzingen = 'probleem';
        probleem(`${naam} verwijst in de bron naar "${kort(refsBron, 80)}", maar de verwijzing is nog niet gekoppeld aan een minimumdoel.`);
      }
      return;
    }

    // Wat de bron noemt: de codes (reeksen uitgeschreven) en de reeksen die niet uitgeschreven konden worden.
    const blokken = refsBron ? zoekVerwijzingBlokken(refsBron) : [];
    const bronCodes = new Map<string, string>();
    for (const b of blokken) {
      for (const c of b.codes) {
        const n = normaliseerMdCode(c);
        if (n && !bronCodes.has(n)) bronCodes.set(n, c);
      }
    }
    const onvolledig = blokken.flatMap((b) => (b.onvolledigeReeksen ?? []).map((reeks) => ({ blok: b, reeks })));

    const gekoppeld = new Set<string>();
    for (const ref of refs) {
      tellers.verwijzingen++;
      gedekt.add(`${ref.set}\u0000${ref.id}`);
      const wie = `${ref.code || ref.id} (${ref.set})`;
      const set = setsOpId.get(ref.set);
      if (!set) {
        gekoppeld.add(normaliseerMdCode(ref.code ?? ''));
        probleem(`${naam} verwijst naar ${wie}, maar die set is niet meegegeven: zonder de set kan de verwijzing niet nagekeken worden.`);
        continue;
      }
      const doel = set.doelen.get(ref.id);
      if (!doel) {
        probleem(`${naam} verwijst naar ${wie}, maar dat minimumdoel bestaat niet in de set ${set.naam}.`);
        continue;
      }
      const n = normaliseerMdCode(doel.code);
      gekoppeld.add(n);
      let ok = true;
      if ((ref.code ?? '').trim() !== doel.code.trim()) {
        ok = false;
        probleem(`${naam} verwijst naar minimumdoel ${doel.code} van ${set.naam}, maar de verwijzing noemt het "${ref.code}". Koppel het juiste doel.`);
      }
      if (refsBron && !bronCodes.has(n) && !onvolledig.some((o) => inReeks(doel.code, o.reeks))) {
        ok = false;
        probleem(`${naam} is gekoppeld aan minimumdoel ${doel.code} (${set.naam}), maar de bron noemt dat doel niet ("${kort(refsBron, 80)}").`);
      }
      if (ok) tellers.verwijzingenOk++;
    }
    for (const [n, letterlijk] of bronCodes) {
      if (!gekoppeld.has(n)) probleem(`${naam} verwijst in de bron naar ${letterlijk}, maar die verwijzing is niet gekoppeld aan een minimumdoel.`);
    }
    // Een reeks die niet uitgeschreven kon worden: alle doelen van de sets in die reeks moeten gekoppeld
    // zijn. Zonder sets, of met uiteinden van een verschillend aantal delen, kan de poort dat niet zien.
    for (const { blok, reeks } of onvolledig) {
      const van = getallen(reeks.van);
      const tot = getallen(reeks.tot);
      const vergelijkbaar = setsOpId.size > 0 && van !== undefined && tot !== undefined && van.length === tot.length;
      const nodig = new Map<string, string>();
      if (vergelijkbaar) {
        for (const set of setsOpId.values()) {
          for (const d of set.doelen.values()) if (inReeks(d.code, reeks) === true) nodig.set(normaliseerMdCode(d.code), d.code);
        }
      }
      const ontbreekt = [...nodig].filter(([n]) => !gekoppeld.has(n)).map(([, c]) => c);
      if (!vergelijkbaar || ontbreekt.length > 0) {
        const lijst = ontbreekt.length > 0 ? ` (nog niet gekoppeld: ${ontbreekt.slice(0, 10).join(', ')}${ontbreekt.length > 10 ? ', …' : ''})` : '';
        probleem(`${naam}: de reeks ${reeksNaam(blok, reeks)} kon niet volledig gelezen worden; koppel de verwijzingen zelf${lijst}.`);
      }
    }
    rapport.verwijzingen = allesOk ? 'ok' : 'probleem';
  });

  // ── Herkomst ──
  const herkomst = cur.herkomst;
  if (!herkomst) {
    voeg({ soort: 'herkomst', ernst: 'fout', bericht: 'De herkomst ontbreekt: vul in waar het leerplan vandaan komt (net, leerplancode, versie, bron).' });
  }
  if (herkomst && (herkomst.methode === 'pdf' || herkomst.methode === 'tekst') && !herkomst.bronSha256) {
    voeg({ soort: 'herkomst', ernst: 'fout', bericht: 'De vingerafdruk van het bronbestand ontbreekt: zonder die vingerafdruk kan niemand nagaan uit welke bron de doelen komen. Lees de bron opnieuw in.' });
  }
  if (cur.net !== 'eigen' && cur.net !== 'minimumdoelen' && !herkomst?.leerplancode?.trim()) {
    // Alleen een tip: de code is niet nodig om na te kijken, wel om het leerplan later te herkennen.
    voeg({ soort: 'herkomst', ernst: 'info', bericht: 'Je vulde geen leerplancode in (stap 1). Dat mag, maar met een code herken je het leerplan later makkelijker.' });
  }

  // ── Dekking ──
  const dekking: ControleRapport['dekking'] = [];
  for (const [setId, set] of setsOpId) {
    const nietGedekt: MinimumdoelRef[] = [];
    for (const [id, doel] of set.doelen) if (!gedekt.has(`${setId}\u0000${id}`)) nietGedekt.push({ set: setId, id, code: doel.code });
    dekking.push({ set: setId, naam: set.naam, nietGedekt });
    if (nietGedekt.length === 0) continue;
    voeg({
      soort: 'dekking',
      ernst: 'info',
      bericht: `${nietGedekt.length} van de ${set.doelen.size} minimumdoelen van ${set.naam} (${setId}) ${nietGedekt.length === 1 ? 'wordt' : 'worden'} door geen enkel leerplandoel gedekt.`,
    });
    // Een officieel leerplan bevat elk doel van zijn set (met tekst): anders is het niet volledig.
    if (officieel) {
      const ontbreekt = nietGedekt.filter((r) => tekstVanSetdoel(set.doelen.get(r.id) ?? { tekst: '' }) !== '');
      if (ontbreekt.length > 0) {
        voeg({
          soort: 'volledig',
          ernst: 'fout',
          bericht: `${meervoud(ontbreekt.length, 'minimumdoel', 'minimumdoelen')} van ${set.naam} (${setId}) ${ontbreekt.length === 1 ? 'ontbreekt' : 'ontbreken'} in het leerplan (bv. ${ontbreekt.slice(0, 5).map((r) => r.code).join(', ')}). Een officieel leerplan bevat alle doelen van de set.`,
        });
      }
    }
  }

  // ── Samen ──
  bevindingen.sort((a, b) => ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst] || a.plaats - b.plaats || a.volg - b.volg);
  const uit: Bevinding[] = bevindingen.map(({ plaats: _plaats, volg: _volg, ...b }) => b);
  const fouten = uit.filter((b) => b.ernst === 'fout').length;
  const waarschuwingen = uit.filter((b) => b.ernst === 'waarschuwing').length;

  const delen: string[] = [];
  const doelWoord = goals.length === 1 ? 'doel' : 'doelen';
  delen.push(
    metBron || officieel
      ? `${tellers.letterlijk} van ${goals.length} ${doelWoord} letterlijk`
      : `${goals.length} ${doelWoord}, letterlijk niet nagekeken (geen bron)`,
  );
  delen.push(tellers.verwijzingen > 0 ? `${tellers.verwijzingenOk} van ${tellers.verwijzingen} ${tellers.verwijzingen === 1 ? 'verwijzing' : 'verwijzingen'} in orde` : 'geen verwijzingen');
  if (fouten > 0) delen.push(meervoud(fouten, 'fout', 'fouten'));
  if (waarschuwingen > 0) delen.push(meervoud(waarschuwingen, 'waarschuwing', 'waarschuwingen'));
  if (fouten === 0 && waarschuwingen === 0) delen.push('geen fouten of waarschuwingen');

  return {
    bevindingen: uit,
    perDoel,
    tellers,
    dekking,
    kanBevestigen: fouten === 0,
    samenvatting: `${delen.join(', ')}.`,
    doelenSha256: doelenVingerafdruk(goals),
  };
}
