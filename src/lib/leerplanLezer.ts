// ── Leerplanlezer: van leerplantekst naar doelen, zonder AI ─────────────────
//
// Laag 2 (docs/LEERPLANNEN.md § 6 en § 14). De leerkracht leest de pdf van het
// leerplan van zijn net in (of plakt de tekst); deze module haalt er de doelen
// uit: code, tekst, rubriek, niveau en de verwijzingen naar minimumdoelen zoals
// ze in de bron staan. Niets wordt verzonnen of "verbeterd": de doeltekst is de
// brontekst, met alleen de afbreking aan het regeleinde hersteld.
//
// De lezer kiest zelf het nummeringspatroon dat het best past (LPD 12, 1.2.3,
// AAR 2.1, …). Wat hij niet zeker weet, meldt hij in `waarschuwingen`; de
// controlepoort (curriculumCheck.ts) en de leerkracht kijken daarna alles na.
//
// De tekstregels hier (regels samenvoegen, kop- en voetregels, verwijzingsblokken,
// gaten in de nummering) gebruikt de controlepoort ook. Zo vergelijken lezer en
// poort de tekst op precies dezelfde manier.
//
// Pure module: geen opslag, geen netwerk.

import type { CurriculumGoal } from './curriculumTypes';
import { normalizeGoalCode, sanitizeGoal } from './curriculum';
import { zoekVerwijzingBlokken } from './minimumdoelVerwijzing';
import { uid } from './utils';

export interface GelezenDoel {
  code: string;
  tekst: string;
  rubriek?: string;
  /** De verwijzingen naar minimumdoelen letterlijk zoals in de bron, bv. "MD 09.01, 09.03". */
  refsBron?: string;
  niveau?: 'basis' | 'uitbreiding';
  /** Eerste regel van het doel in de bron (vanaf 1). */
  regel: number;
  /** De ruwe regels van dit doel, met "\n". */
  bronFragment: string;
}

export interface LezerResultaat {
  doelen: GelezenDoel[];
  patroon?: { naam: string; voorbeeld: string };
  waarschuwingen: string[];
  /** Aantal kop- en voetregels, paginanummers en paginamarkeringen dat de lezer oversloeg. */
  genegeerdeRegels: number;
}

// ── Gedeelde tekstregels ────────────────────────────────────────────────────

/** Onzichtbare tekens die niets betekenen voor de tekst. */
const ONZICHTBAAR = /[\u00ad\f\u200b\ufeff]/g;
/**
 * Opsommingstekens vooraan een regel: bolletjes, blokjes, pijltjes, de bolletjes uit de lettertypes
 * Symbol en Wingdings (privégebied U+F000–U+F0FF), en "-", "–", "—" of "*" gevolgd door witruimte.
 */
const OPSOMMING = /^(?:(?:[•●○◦▪■▫□►▸‣⁃∙·\uf000-\uf0ff]|[-–—*](?=\s))\s*)+/u;
const LIGATUREN: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
/** Na een afbreekstreepje blijft het streepje (met spatie) staan voor deze woorden: "natuur- en milieu". */
const VOEGWOORDEN = new Set(['en', 'of', 'tot', 'noch']);

/** Ligaturen (ﬁ, ﬂ, ﬀ, ﬃ, ﬄ, ﬅ, ﬆ) uitschrijven. */
export function schrijfLigaturenUit(t: string): string {
  return t.replace(/[ﬀ-ﬆ]/g, (l) => LIGATUREN[l] ?? l);
}

/** Witruimte samengevouwen, onzichtbare tekens weg, getrimd; opsommingstekens blijven. */
function kaal(regel: string): string {
  return regel.replace(ONZICHTBAAR, '').replace(/\s+/g, ' ').trim();
}

/** Zoals `kaal`, en ook zonder opsommingstekens vooraan. */
function schoonRegel(regel: string): string {
  return kaal(regel).replace(OPSOMMING, '').trim();
}

function heeftOpsomming(regel: string): boolean {
  return OPSOMMING.test(kaal(regel));
}

/** Twee regels aan elkaar, met herstel van de afbreking aan het regeleinde. */
function verbind(links: string, rechts: string, zachtAfgebroken: boolean): string {
  if (zachtAfgebroken) return links + rechts;
  const m = /([\p{L}\p{N}])\p{M}*[-\u2010]$/u.exec(links);
  if (!m) return `${links} ${rechts}`;
  const woord = /^\p{L}+/u.exec(rechts)?.[0] ?? '';
  if (VOEGWOORDEN.has(woord)) return `${links} ${rechts}`; // "natuur- en milieu"
  if (/\p{Ll}/u.test(m[1]) && /^\p{Ll}/u.test(rechts)) return links.slice(0, -1) + rechts; // "verwe-" + "ring"
  return links + rechts; // "Noord-" + "Amerika", "CO2-" + "uitstoot": het streepje hoort bij het woord
}

/**
 * Regels samenvoegen tot één tekst: per regel onzichtbare tekens en opsommingstekens vooraan weg en
 * witruimte samengevouwen, lege regels weg, en de afbreking aan het regeleinde hersteld:
 * "verwe-" + "ring" → "verwering"; "natuur-" + "en milieu" → "natuur- en milieu"; een hoofdletter
 * of cijfer na het streepje houdt het streepje ("Noord-Amerika"); een zacht afbreekstreepje (U+00AD)
 * aan het regeleinde plakt de woorddelen aan elkaar. Lezer en controlepoort gebruiken allebei deze
 * functie, zodat ze dezelfde tekst zien.
 */
export function voegRegelsSamen(regels: readonly string[]): string {
  let uit = '';
  let zacht = false;
  for (const ruw of regels) {
    const r = schoonRegel(ruw);
    const eindigtZacht = /\u00ad\s*$/.test(ruw);
    if (!r) continue;
    uit = uit === '' ? r : verbind(uit, r, zacht);
    zacht = eindigtZacht;
  }
  return uit;
}

/** Splitst een tekst in regels (zonder de regeleinden). */
export function splitsRegels(tekst: string): string[] {
  return tekst.split(/\r\n|\r|\n/);
}

/** Verwijswoorden en scheidingstekens die rond een verwijzing mogen staan zonder dat het tekst is. */
const VULSEL = /^(?:[\s,;:/.()–—-]|\ben\b|\bzie\b|\bcf\b|\bvgl\b|→)*$/i;
/** Een label vóór een verwijzing op een eigen regel: "Verwijzing naar minimumdoelen: 09.01". */
const VERWIJS_LABEL = /^(?:(?:verwijzing(?:en)?|link|koppeling|relatie)(?:\s+(?:naar|met))?(?:\s+(?:de|het))?)?$/i;

/**
 * Haalt de verwijzingen naar minimumdoelen uit een tekst: blokken tussen haakjes die alleen een
 * verwijzing bevatten ("(MD 09.01, 09.03)", "(zie ET 9.1)") en losse blokken ("ET 9.1-9.3",
 * "Minimumdoelen: 09.01"). Haakjes waarin ook gewone tekst staat, blijven ongemoeid. Geeft de tekst
 * zonder die blokken (witruimte samengevouwen; geen spatie vóór een leesteken op de plaats van een
 * weggehaald blok; een los streepje of komma vóór een blok aan het einde valt mee weg) en de blokken
 * letterlijk (zonder de haakjes).
 */
export function haalVerwijzingenUit(tekst: string): { tekst: string; blokken: string[] } {
  const weg: { start: number; eind: number; blok: string }[] = [];
  const blijft: { start: number; eind: number }[] = [];
  const reHaakjes = /\(([^()]{1,400})\)/g;
  let m: RegExpExecArray | null;
  while ((m = reHaakjes.exec(tekst)) !== null) {
    const binnen = m[1];
    const blokken = zoekVerwijzingBlokken(binnen);
    if (blokken.length === 0) continue;
    let rest = '';
    let p = 0;
    for (const b of blokken) {
      rest += binnen.slice(p, b.start);
      p = b.eind;
    }
    rest += binnen.slice(p);
    const plaats = { start: m.index, eind: m.index + m[0].length };
    if (VULSEL.test(rest)) weg.push({ ...plaats, blok: binnen.trim() });
    else blijft.push(plaats);
  }
  for (const b of zoekVerwijzingBlokken(tekst)) {
    const overlapt = (o: { start: number; eind: number }) => b.start < o.eind && b.eind > o.start;
    if (blijft.some(overlapt) || weg.some(overlapt)) continue;
    // "zie MD 09.01": het verwijswoord hoort bij het blok.
    let start = b.start;
    const venster = tekst.slice(Math.max(0, start - 20), start);
    const vm = /(?:zie|cf\.?|vgl\.?|→)\s*$/i.exec(venster);
    if (vm) {
      const s = start - vm[0].length;
      const ervoor = s > 0 ? tekst[s - 1] : '';
      if (vm[0].startsWith('→') || !/[\p{L}\p{N}]/u.test(ervoor)) start = s;
    }
    weg.push({ start, eind: b.eind, blok: tekst.slice(start, b.eind).trim() });
  }
  if (weg.length === 0) return { tekst: tekst.replace(/\s+/g, ' ').trim(), blokken: [] };

  weg.sort((a, b) => a.start - b.start);
  let uit = '';
  let p = 0;
  const blokken: string[] = [];
  const leestekenNa = /\s*[.,;:!?)]/y;
  const eindeNa = /\s*$/y;
  for (const w of weg) {
    if (w.start < p) continue;
    uit += tekst.slice(p, w.start);
    blokken.push(w.blok);
    leestekenNa.lastIndex = w.eind;
    eindeNa.lastIndex = w.eind;
    if (leestekenNa.test(tekst)) {
      uit = uit.trimEnd(); // "X (ET 9.1)." → "X."
    } else if (eindeNa.test(tekst)) {
      uit = uit.trimEnd();
      if (/[-–—,;:]$/.test(uit)) uit = uit.slice(0, -1).trimEnd(); // "X – MD 09.01" → "X"
    }
    p = w.eind;
  }
  uit += tekst.slice(p);
  return { tekst: uit.replace(/\s+/g, ' ').trim(), blokken };
}

/** Bestaat de regel alleen uit verwijzingen (eventueel met een label zoals "Verwijzing naar")? */
function isVerwijzingsregel(regel: string): string[] | undefined {
  const v = haalVerwijzingenUit(regel);
  if (v.blokken.length === 0) return undefined;
  const rest = v.tekst.replace(/[\s.,;:()–—-]+/g, ' ').trim();
  return rest === '' || VERWIJS_LABEL.test(rest) ? v.blokken : undefined;
}

// ── Kop- en voetregels ──────────────────────────────────────────────────────

const PAGINAMARKERING = [
  /^[-–—]*\s*(?:p\.?|pag\.?|pagina|blz\.?|bladzijde)\s*\d{1,4}(?:\s*(?:\/|van)\s*\d{1,4})?\s*[-–—]*$/i,
  /^[-–—]+\s*\d{1,4}\s*[-–—]+$/,
];
const PAGINANUMMER = /^\d{1,4}(?:\s*(?:\/|van)\s*\d{1,4})?$/i;
/** Plaatsen vanaf de boven- en onderkant van een pagina waar een kop- of voetregel staat. */
const RAND = 3;
/** Zonder echte paginagrenzen telt een blok tussen lege regels pas als pagina vanaf zoveel regels. */
const MIN_REGELS_PAGINA = 6;
const MIN_PAGINAS = 3;

function isPaginamarkering(k: string): boolean {
  return PAGINAMARKERING.some((re) => re.test(k));
}

/**
 * Welke regels opmaak van de pagina zijn en geen inhoud (0-gebaseerde indexen): paginamarkeringen
 * ("— p. 3 —"), regels met alleen een paginanummer, en kop- en voetregels. Een kop- of voetregel is
 * een regel die op minstens 3 verschillende pagina's identiek voorkomt (of identiek op de cijfers na,
 * als die niet vooraan staan), telkens bij de boven- of onderrand van de pagina (de eerste of laatste
 * 3 regels), en nooit elders. Pagina's zijn de stukken tussen paginamarkeringen of form feeds; zonder
 * die grenzen de blokken tussen lege regels met minstens 6 regels (zo geeft `extractPdfLines` zijn
 * tekst). Een regel die een doel begint, een verwijzing is of met "Uitbreiding" begint, is nooit een
 * kop- of voetregel.
 */
export function kopEnVoetregels(regels: readonly string[]): Set<number> {
  const k = regels.map(kaal);
  const opmaak = new Set<number>();
  const grens = new Set<number>(); // regels waarvóór een nieuwe pagina begint
  let expliciet = false;
  k.forEach((t, i) => {
    if (isPaginamarkering(t)) {
      opmaak.add(i);
      grens.add(i + 1);
      expliciet = true;
    } else if (PAGINANUMMER.test(t)) {
      opmaak.add(i);
    }
    if (regels[i].includes('\f')) {
      grens.add(i);
      expliciet = true;
    }
  });

  // Pagina's opbouwen: lijsten met de indexen van de inhoudsregels.
  const paginas: number[][] = [[]];
  let wachtOpNieuwe = false;
  for (let i = 0; i < regels.length; i++) {
    if (expliciet ? grens.has(i) : wachtOpNieuwe && k[i] !== '') {
      if (paginas[paginas.length - 1].length > 0) paginas.push([]);
      wachtOpNieuwe = false;
    }
    if (k[i] === '') {
      if (!expliciet) wachtOpNieuwe = true;
      continue;
    }
    if (opmaak.has(i)) continue;
    paginas[paginas.length - 1].push(i);
  }

  interface Voorkomen { paginas: Set<number>; buitenRand: boolean; regels: number[] }
  const telling = new Map<string, Voorkomen>();
  const tel = (sleutel: string, pagina: number, telt: boolean, rand: boolean, i: number) => {
    const v = telling.get(sleutel) ?? { paginas: new Set<number>(), buitenRand: false, regels: [] };
    if (!rand) v.buitenRand = true;
    else if (telt) v.paginas.add(pagina);
    v.regels.push(i);
    telling.set(sleutel, v);
  };
  paginas.forEach((pagina, p) => {
    const telt = expliciet || pagina.length >= MIN_REGELS_PAGINA;
    pagina.forEach((i, pos) => {
      const t = schoonRegel(regels[i]);
      if (t.length > 150 || /^uitbreiding/i.test(t) || leesDoelcodeEender(t) || isVerwijzingsregel(t)) return;
      const rand = pos < RAND || pagina.length - 1 - pos < RAND;
      tel(`=${t}`, p, telt, rand, i);
      if (/\d/.test(t) && !/^\d/.test(t)) tel(`#${t.replace(/\d+/g, '#')}`, p, telt, rand, i);
    });
  });
  for (const v of telling.values()) {
    if (v.paginas.size >= MIN_PAGINAS && !v.buitenRand) for (const i of v.regels) opmaak.add(i);
  }
  return opmaak;
}

/**
 * De brontekst zonder opmaak van de pagina en zonder verwijzingsblokken, als één regel. De
 * controlepoort zoekt de doelen ook hierin, zodat een doel dat over een paginagrens loopt (met een
 * kopregel ertussen) of een verwijzing midden in de zin heeft, toch letterlijk gevonden wordt.
 */
export function bronZonderOpmaak(tekst: string): string {
  const regels = splitsRegels(tekst.normalize('NFC'));
  const opmaak = kopEnVoetregels(regels);
  return haalVerwijzingenUit(voegRegelsSamen(regels.filter((_, i) => !opmaak.has(i)))).tekst;
}

// ── Gaten in de nummering ───────────────────────────────────────────────────

export interface NummeringGat {
  /** Wat vóór het laatste getal staat, bv. "LPD " of "2.". */
  reeks: string;
  /** De ontbrekende codes (hoogstens 50). */
  ontbrekend: string[];
  /** Hoeveel codes er ontbreken. */
  aantal: number;
  /** Index (in de meegegeven lijst) van de eerste code na het gat. */
  voorIndex: number;
}

const MAX_ONTBREKEND = 50;

/**
 * Gaten in de laatste numerieke positie per reeks: "LPD 6" en "LPD 8" zonder "LPD 7"; "2.1", "2.2"
 * en "2.4" zonder "2.3"; ook een reeks die niet bij 1 begint. Een nummer telt als aanwezig als een
 * code het heeft, of als dieper genummerde codes eronder staan ("1.2.1" maakt "1.2" aanwezig in de
 * reeks "1."). Een achtervoegsel ("LPD 12U") telt mee als het nummer. Codes worden vergeleken zoals
 * `normalizeGoalCode`.
 */
export function gatenInNummering(codes: readonly string[]): NummeringGat[] {
  interface Reeks { eigen: boolean; nummers: Map<number, number>; breedte: number }
  const reeksen = new Map<string, Reeks>();
  const ontleed: { reeks: string; n: number; i: number; breedte: number }[] = [];
  codes.forEach((ruw, i) => {
    const m = /^(.*?)(\d+)(\D*)$/.exec(normalizeGoalCode(ruw));
    if (!m) return;
    ontleed.push({ reeks: m[1], n: parseInt(m[2], 10), i, breedte: m[2].length });
  });
  const reeksVan = (naam: string): Reeks => {
    let r = reeksen.get(naam);
    if (!r) reeksen.set(naam, (r = { eigen: false, nummers: new Map(), breedte: 1 }));
    return r;
  };
  for (const o of ontleed) {
    const r = reeksVan(o.reeks);
    r.eigen = true;
    if (o.breedte > 1 && String(o.n).length < o.breedte) r.breedte = Math.max(r.breedte, o.breedte);
    if (!r.nummers.has(o.n)) r.nummers.set(o.n, o.i);
  }
  // Dieper genummerde codes maken hun ouder aanwezig: "1.2.1" → nummer 2 in reeks "1.".
  for (const o of ontleed) {
    const m = /^(.*?)(\d+)\.$/.exec(o.reeks);
    if (!m) continue;
    const ouder = reeksen.get(m[1]);
    if (!ouder?.eigen) continue;
    const n = parseInt(m[2], 10);
    const bestaand = ouder.nummers.get(n);
    if (bestaand === undefined || o.i < bestaand) ouder.nummers.set(n, o.i);
  }

  const gaten: NummeringGat[] = [];
  for (const [naam, r] of reeksen) {
    if (!r.eigen) continue;
    const nummers = [...r.nummers.keys()].sort((a, b) => a - b);
    const code = (n: number) => naam + String(n).padStart(r.breedte, '0');
    const voegToe = (van: number, tot: number, voor: number) => {
      const aantal = tot - van + 1;
      const ontbrekend: string[] = [];
      for (let n = van; n <= tot && ontbrekend.length < MAX_ONTBREKEND; n++) ontbrekend.push(code(n));
      gaten.push({ reeks: naam, ontbrekend, aantal, voorIndex: r.nummers.get(voor) ?? 0 });
    };
    if (nummers[0] > 1) voegToe(1, nummers[0] - 1, nummers[0]);
    for (let j = 1; j < nummers.length; j++) {
      if (nummers[j] - nummers[j - 1] > 1) voegToe(nummers[j - 1] + 1, nummers[j] - 1, nummers[j]);
    }
  }
  return gaten.sort((a, b) => a.voorIndex - b.voorIndex || a.reeks.localeCompare(b.reeks));
}

/** "LPD 7 ontbreekt" of "LPD 7 tot LPD 9 ontbreken (3 doelen)". */
export function beschrijfGat(gat: NummeringGat): string {
  const eerste = gat.ontbrekend[0];
  if (gat.aantal === 1) return `${eerste} ontbreekt`;
  const laatste = gat.ontbrekend.length === gat.aantal ? gat.ontbrekend[gat.aantal - 1] : undefined;
  return laatste ? `${eerste} tot ${laatste} ontbreken (${gat.aantal} doelen)` : `${eerste} en ${gat.aantal - 1} volgende ontbreken`;
}

// ── Nummeringspatronen ──────────────────────────────────────────────────────

interface Codetreffer {
  code: string;
  rest: string;
  uitbreiding: boolean;
}

interface Patroon {
  sleutel: string;
  naam: string;
  /** Lager = voorrang bij gelijke score. */
  rang: number;
  /** Eenvoudige nummers tellen maar half: alleen als er niets beters is. */
  zwak: boolean;
  /** Code alleen op een regel, met de doelzin op de volgende regel: vereist "De leerling(en)" erna. */
  streng: boolean;
  lees(regel: string): Codetreffer | null;
  /** Staat er verderop in de regel nog een code van dit patroon, gevolgd door een doelzin? */
  tweedeCode(rest: string): string | undefined;
}

/** "U" vast aan de code of "(U)" erachter: uitbreiding. */
const U_ACHTERVOEGSEL = String.raw`(\s?\(U\)|U(?![\p{L}\p{N}]))?`;
const CODE_EINDE = String.raw`(?=$|[\s:.)–—-])`;
const NUMMER = String.raw`\d{1,3}(?:\.\d{1,3}){0,3}`;
/** Hoofdletterwoorden die geen afkorting van een vak zijn. */
const GEEN_AFKORTING = new Set(['LPD', 'LP', 'MD', 'ET', 'EM', 'DEEL', 'THEMA', 'STAP', 'FASE', 'LES', 'BLZ', 'PAG', 'NR', 'BIJ']);
const STERKE_DOELZIN = /^(?:de\s+)?leerling(?:en)?\b/i;
const DOELZIN = /^["'“‘„(]?\p{Lu}/u;
const VERWIJS_VOOR = /(?<![\p{L}\p{N}])(?:md|et|em|minimumdoel(?:en)?|eindterm(?:en)?)\s*[:.]?\s*$/iu;
/** Aanduiding vlak na de code: "(uitbreiding)", "(uitbreidingsdoel)", "Uitbreidingsdoel:", "Uitbreiding:". */
const UITBREIDING_NA_CODE = /^(?:\(uitbreiding(?:sdoel)?\)|uitbreidingsdoel\b\s*[:.–—-]?|uitbreiding\s*:)\s*/i;
/** "uitbreiding" als aanduiding, niet als gewoon woord ("de uitbreiding van de stad"). */
const UITBREIDING_AANDUIDING = /(?:^|\()\s*uitbreiding(?:sdoel(?:en)?)?\b|uitbreidingsdoel|\(U\)/i;

function isDoelzin(rest: string): boolean {
  return STERKE_DOELZIN.test(rest) || DOELZIN.test(rest);
}

/** Restant na de code: scheidingsteken weg, en een uitbreidingsaanduiding vlak na de code herkend. */
function maakTreffer(code: string, rest: string, uitbreiding: boolean): Codetreffer {
  let r = rest.replace(/^[\s:.)–—-]+/, '');
  const u = UITBREIDING_NA_CODE.exec(r);
  if (u) {
    r = r.slice(u[0].length);
    uitbreiding = true;
  }
  return { code, rest: r, uitbreiding };
}

/** Eindigt de regel op een verwijzing ("… (ET 9.1)", "… MD 09.01.")? Dan is het doel af. */
function eindigtOpVerwijzing(t: string): boolean {
  const blokken = zoekVerwijzingBlokken(t);
  if (blokken.length === 0) return false;
  return t.slice(blokken[blokken.length - 1].eind).replace(/[\s.)]/g, '') === '';
}

function uitAchtervoegsel(u: string | undefined): { vast: string; uitbreiding: boolean } {
  if (!u) return { vast: '', uitbreiding: false };
  return u.trim() === '(U)' ? { vast: '', uitbreiding: true } : { vast: 'U', uitbreiding: true };
}

function zoekTweede(re: RegExp, rest: string, sterk: boolean, filter?: (m: RegExpExecArray) => boolean): string | undefined {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    const na = rest.slice(m.index + m[0].length);
    const ervoor = rest.slice(0, m.index + 1);
    if (VERWIJS_VOOR.test(ervoor)) continue;
    if (filter && !filter(m)) continue;
    if (sterk ? STERKE_DOELZIN.test(na) : isDoelzin(na)) return m[1].trim();
  }
  return undefined;
}

function lpdPatroon(): Patroon {
  const re = new RegExp(String.raw`^LPD\s?(${NUMMER})${U_ACHTERVOEGSEL}${CODE_EINDE}`, 'iu');
  const verder = new RegExp(String.raw`\s(LPD\s?${NUMMER}U?)[\s:.–—-]+`, 'giu');
  return {
    sleutel: 'lpd', naam: 'LPD-nummers', rang: 0, zwak: false, streng: false,
    lees(regel) {
      const m = re.exec(regel);
      if (!m) return null;
      const u = uitAchtervoegsel(m[2]);
      return maakTreffer(`LPD ${m[1]}${u.vast}`, regel.slice(m[0].length), u.uitbreiding);
    },
    tweedeCode: (rest) => zoekTweede(verder, rest, false),
  };
}

function lpPatroon(): Patroon {
  const re = new RegExp(String.raw`^LP(?!\p{L})\s?(${NUMMER})${U_ACHTERVOEGSEL}${CODE_EINDE}`, 'u');
  const verder = new RegExp(String.raw`\s(LP\s?${NUMMER}U?)[\s:.–—-]+`, 'gu');
  return {
    sleutel: 'lp', naam: 'LP-nummers', rang: 1, zwak: false, streng: false,
    lees(regel) {
      const m = re.exec(regel);
      if (!m) return null;
      const u = uitAchtervoegsel(m[2]);
      return maakTreffer(`LP ${m[1]}${u.vast}`, regel.slice(m[0].length), u.uitbreiding);
    },
    tweedeCode: (rest) => zoekTweede(verder, rest, false),
  };
}

function afkortingPatroon(): Patroon {
  const re = new RegExp(String.raw`^([A-Z]{2,5})\s?(${NUMMER})${U_ACHTERVOEGSEL}${CODE_EINDE}`, 'u');
  const verder = new RegExp(String.raw`\s(([A-Z]{2,5})\s?${NUMMER}U?)[\s:.–—-]+`, 'gu');
  return {
    sleutel: 'afkorting', naam: 'afkorting en nummer', rang: 2, zwak: false, streng: false,
    lees(regel) {
      const m = re.exec(regel);
      if (!m || GEEN_AFKORTING.has(m[1])) return null;
      const u = uitAchtervoegsel(m[3]);
      return maakTreffer(`${m[1]} ${m[2]}${u.vast}`, regel.slice(m[0].length), u.uitbreiding);
    },
    tweedeCode: (rest) => zoekTweede(verder, rest, false, (m) => !GEEN_AFKORTING.has(m[2])),
  };
}

/** Samengestelde nummers met precies `diepte` delen: "1.2" (2), "1.2.3" (3), "1.2.3.4" (4). */
function samengesteldPatroon(diepte: number): Patroon {
  const nummer = String.raw`\d{1,2}(?:\.\d{1,3}){${diepte - 1}}(?!\d|\.\d)`;
  const re = new RegExp(String.raw`^(${nummer})\.?${U_ACHTERVOEGSEL}(?=$|[\s:)–—-])`, 'u');
  const verder = new RegExp(String.raw`\s(${nummer})\.?\s+`, 'gu');
  return {
    sleutel: `samengesteld${diepte}`, naam: `samengestelde nummers met ${diepte} delen`, rang: 7 - diepte, zwak: false, streng: true,
    lees(regel) {
      const m = re.exec(regel);
      if (!m) return null;
      const u = uitAchtervoegsel(m[2]);
      return maakTreffer(`${m[1]}${u.vast}`, regel.slice(m[0].length), u.uitbreiding);
    },
    tweedeCode: (rest) => zoekTweede(verder, rest, true),
  };
}

function eenvoudigPatroon(): Patroon {
  const re = /^(\d{1,3})[.)](?=\s)/;
  const verder = /\s(\d{1,3})[.)]\s+/g;
  return {
    sleutel: 'eenvoudig', naam: 'eenvoudige nummers', rang: 9, zwak: true, streng: true,
    lees(regel) {
      const m = re.exec(regel);
      return m ? maakTreffer(m[1], regel.slice(m[0].length), false) : null;
    },
    tweedeCode: (rest) => zoekTweede(verder, rest, true),
  };
}

const PATRONEN: readonly Patroon[] = [
  lpdPatroon(),
  lpPatroon(),
  afkortingPatroon(),
  samengesteldPatroon(4),
  samengesteldPatroon(3),
  samengesteldPatroon(2),
  eenvoudigPatroon(),
];

/** Begint deze (schone) regel met een doelcode van eender welk patroon, gevolgd door een doelzin? */
function leesDoelcodeEender(regel: string): boolean {
  return PATRONEN.some((p) => {
    const t = p.lees(regel);
    return t !== null && t.rest !== '' && (p.streng ? STERKE_DOELZIN.test(t.rest) : isDoelzin(t.rest));
  });
}

// ── De lezer ────────────────────────────────────────────────────────────────

/** Eindigt de tekst als een afgeronde zin? */
function isAfgerond(t: string): boolean {
  return /[.!?]["'”’)\]]*$/.test(t);
}

function eindigtOpAfbreking(t: string): boolean {
  return /[\p{L}\p{N}]\p{M}*[-\u2010]$/u.test(t);
}

/** Korte regel zonder eindpunt die met een hoofdletter begint: zo ziet een rubriekskop eruit. */
function heeftKopvorm(t: string): boolean {
  if (t.length === 0 || t.length >= 90 || /\.$/.test(t)) return false;
  const letter = /\p{L}/u.exec(t)?.[0];
  return letter !== undefined && letter !== letter.toLowerCase() && letter === letter.toUpperCase();
}

/** Een kop die zeker geen vervolg van een doelzin is: met een eigen nummer, of helemaal in hoofdletters. */
function isSterkeKop(t: string): boolean {
  if (/^\d{1,2}(?:\.\d{1,3})*\.?\s+\p{Lu}/u.test(t)) return true;
  const letters = t.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

interface Bezig {
  start: number;
  eind: number;
  code: string;
  delen: string[];
  refsRegels: string[];
  rubriek?: string;
  uitbreiding: boolean;
  viaKop: boolean;
  /** Een verwijzing sloot het doel af: geen tekst meer erbij. */
  gesloten: boolean;
  /** Er kwam een regel tussen die er niet bij hoort: geen tekst meer erbij. */
  onderbroken: boolean;
  inLijst: boolean;
}

/**
 * Leest doelen uit leerplantekst (zie de uitleg bovenaan). Een doel loopt door over de volgende
 * regels tot het volgende doel, een rubriekskop, of een regel die er niet bij hoort. Na een lege
 * regel, een paginamarkering of een kop- of voetregel loopt het alleen door als de volgende regel
 * duidelijk een vervolg is (de vorige eindigde op een afbreekstreepje, of de zin is niet af en de
 * regel begint met een kleine letter): zo blijft een doel heel over een paginagrens.
 */
export function leesLeerplan(tekst: string): LezerResultaat {
  const waarschuwingen: string[] = [];
  // NFC: een é uit twee tekens (e + accent) is dezelfde é, ook voor de afbreking aan het regeleinde.
  const regels = splitsRegels((tekst ?? '').normalize('NFC'));
  const opmaak = kopEnVoetregels(regels);
  const schoon = regels.map(schoonRegel);
  const opsomming = regels.map(heeftOpsomming);
  const leeg = (i: number) => schoon[i] === '' || opmaak.has(i);

  /** Volgende inhoudsregel na i (lege regels en opmaak overgeslagen), binnen `max` regels. */
  const volgende = (i: number, max = 6): number | undefined => {
    for (let j = i + 1; j < regels.length && j <= i + max; j++) if (!leeg(j)) return j;
    return undefined;
  };

  /** Doelstart volgens één patroon: code met doelzin, of code alleen met de doelzin op de volgende regel. */
  const doelStart = (p: Patroon, i: number): (Codetreffer & { sterk: boolean }) | null => {
    if (leeg(i)) return null;
    const t = p.lees(schoon[i]);
    if (!t) return null;
    if (t.rest !== '') return isDoelzin(t.rest) ? { ...t, sterk: STERKE_DOELZIN.test(t.rest) } : null;
    // Code alleen op de regel: de doelzin moet op de volgende regel staan. Bij de strenge patronen
    // (1.2.3, 12.) moet die met "De leerling(en)" beginnen, anders is het eerder een kop.
    const j = volgende(i, 3);
    if (j === undefined || p.lees(schoon[j])) return null;
    const ok = p.streng ? STERKE_DOELZIN.test(schoon[j]) : isDoelzin(schoon[j]);
    return ok ? { ...t, sterk: STERKE_DOELZIN.test(schoon[j]) } : null;
  };

  // 1. Het patroon kiezen: meeste treffers vooraan een regel, "De leerling(en)" telt dubbel.
  const scores = PATRONEN.map((p) => {
    let treffers = 0;
    let sterk = 0;
    let voorbeeld = '';
    for (let i = 0; i < regels.length; i++) {
      const t = doelStart(p, i);
      if (!t) continue;
      treffers++;
      if (t.sterk) sterk++;
      if (!voorbeeld) voorbeeld = t.code;
    }
    const score = (treffers + sterk) * (p.zwak ? 0.5 : 1);
    return { p, treffers, score, voorbeeld };
  })
    .filter((s) => s.treffers >= (s.p.zwak ? 2 : 1))
    .sort((a, b) => b.score - a.score || a.p.rang - b.p.rang);

  const genegeerdeRegels = opmaak.size;
  if (scores.length === 0) {
    waarschuwingen.push(
      'De lezer vond geen nummering van doelen (zoals "LPD 12", "1.2.3" of "AAR 2.1") vooraan een regel. Kijk na of de tekst de doelen met hun code bevat, of voeg de doelen met de hand toe.',
    );
    return { doelen: [], waarschuwingen, genegeerdeRegels };
  }
  const gekozen = scores[0];
  const patroon = gekozen.p;
  if (scores.length > 1 && scores[1].treffers >= 2 && scores[1].score >= 0.8 * gekozen.score) {
    waarschuwingen.push(
      `Twee nummeringen komen ongeveer even vaak voor: ${patroon.naam} (bv. ${gekozen.voorbeeld}, ${gekozen.treffers} keer) en ${scores[1].p.naam} (bv. ${scores[1].voorbeeld}, ${scores[1].treffers} keer). De lezer koos de eerste; kijk na of dat klopt.`,
    );
  }

  const start = regels.map((_, i) => doelStart(patroon, i));

  /** Volgt er (na lege regels, opmaak en andere koppen) een doel? */
  const volgtDoel = (i: number): boolean => {
    let koppen = 0;
    for (let j = i + 1; j < regels.length && j <= i + 12; j++) {
      if (leeg(j)) continue;
      if (start[j]) return true;
      if (heeftKopvorm(schoon[j]) && !opsomming[j] && koppen < 3) {
        koppen++;
        continue;
      }
      return false;
    }
    return false;
  };

  // 2. Doorlopen.
  const doelen: GelezenDoel[] = [];
  let rubriek: string | undefined;
  let uitbreidingModus = false;
  /** Er kwam een kop "Uitbreiding" of "Basis" en nog geen doel sindsdien. */
  let aanduidingNetGezet = false;
  let huidig: Bezig | null = null;
  let grens = false; // lege regel of opmaak sinds de laatste regel van het doel
  let uitbreidingOnzeker: number | undefined;
  let viaKop = 0;
  const tweeKolommen: string[] = [];
  const zonderTekst: string[] = [];

  const sluit = () => {
    if (!huidig) return;
    const samen = voegRegelsSamen(huidig.delen);
    const v = haalVerwijzingenUit(samen);
    const tekstDoel = schrijfLigaturenUit(v.tekst);
    const refs = [...v.blokken, ...huidig.refsRegels];
    if (!tekstDoel) {
      zonderTekst.push(`${huidig.code} (regel ${huidig.start + 1})`);
    } else {
      const doel: GelezenDoel = {
        code: huidig.code,
        tekst: tekstDoel,
        regel: huidig.start + 1,
        bronFragment: regels.slice(huidig.start, huidig.eind + 1).join('\n'),
      };
      if (huidig.rubriek) doel.rubriek = huidig.rubriek;
      if (refs.length > 0) doel.refsBron = refs.join(', ');
      if (huidig.uitbreiding) doel.niveau = 'uitbreiding';
      if (huidig.viaKop) viaKop++;
      if (uitbreidingOnzeker === undefined && UITBREIDING_AANDUIDING.test(tekstDoel)) uitbreidingOnzeker = huidig.start + 1;
      doelen.push(doel);
    }
    huidig = null;
  };

  const isVervolg = (h: Bezig, i: number): boolean => {
    if (h.gesloten || h.onderbroken) return false;
    const t = schoon[i];
    if (h.delen.length === 0) return true; // code alleen op de regel: de tekst volgt
    const vorige = h.delen[h.delen.length - 1];
    if (eindigtOpAfbreking(vorige)) return true;
    const af = isAfgerond(vorige);
    if (!grens) {
      if (!af) return true;
      return opsomming[i] && h.inLijst;
    }
    if (af) return false;
    if (/^\p{Ll}/u.test(t)) return true;
    return opsomming[i] && (h.inLijst || /:$/.test(vorige));
  };

  for (let i = 0; i < regels.length; i++) {
    if (leeg(i)) {
      grens = true;
      continue;
    }
    const t = schoon[i];
    const s = start[i];
    if (s) {
      sluit();
      aanduidingNetGezet = false;
      const extra = patroon.tweedeCode(s.rest);
      if (extra) tweeKolommen.push(`regel ${i + 1} (${s.code} en ${extra})`);
      huidig = {
        start: i,
        eind: i,
        code: s.code,
        delen: s.rest ? [s.rest] : [],
        refsRegels: [],
        rubriek,
        uitbreiding: s.uitbreiding || uitbreidingModus,
        viaKop: !s.uitbreiding && uitbreidingModus,
        gesloten: false,
        onderbroken: false,
        inLijst: false,
      };
      // Een verwijzing achteraan de eerste regel sluit het doel af: "1.2.3 De leerlingen … (ET 9.1)".
      if (eindigtOpVerwijzing(s.rest)) huidig.gesloten = true;
      grens = false;
      continue;
    }

    const refs = isVerwijzingsregel(t);
    if (refs) {
      if (huidig) {
        const h: Bezig = huidig;
        h.refsRegels.push(...refs);
        h.eind = i;
        h.gesloten = true;
      }
      grens = false;
      continue;
    }

    // Rubriekskop of aanduiding "Uitbreiding" / "Basis".
    const kop = heeftKopvorm(t) && !opsomming[i];
    const isUitbreidingKop = kop && /^Uitbreiding/.test(t);
    const isBasisKop = kop && /^Basis(?:doel(?:en)?)?\b/.test(t);
    const huidigLoopt = huidig !== null && isVervolg(huidig, i) && !grens && !isSterkeKop(t);
    if (kop && !huidigLoopt && volgtDoel(i)) {
      sluit();
      if (isUitbreidingKop) {
        uitbreidingModus = true;
        aanduidingNetGezet = true;
      } else if (isBasisKop) {
        uitbreidingModus = false;
        aanduidingNetGezet = true;
      } else {
        rubriek = schrijfLigaturenUit(t);
        // "Uitbreiding" gevolgd door een rubriek: de aanduiding geldt voor die rubriek.
        if (/uitbreidingsdoel/i.test(t)) uitbreidingModus = true;
        else if (!aanduidingNetGezet) uitbreidingModus = false;
      }
      grens = false;
      continue;
    }

    if (huidig && isVervolg(huidig, i)) {
      const h: Bezig = huidig;
      if (opsomming[i]) h.inLijst = true;
      h.delen.push(t);
      h.eind = i;
      // Een verwijzing achteraan deze regel sluit het doel af.
      if (eindigtOpVerwijzing(t)) h.gesloten = true;
      grens = false;
      continue;
    }

    // Een regel die er niet bij hoort: toelichting, inleiding, wenken, …
    if (huidig) {
      const h: Bezig = huidig;
      h.onderbroken = true;
    }
    if (uitbreidingOnzeker === undefined && UITBREIDING_AANDUIDING.test(t)) uitbreidingOnzeker = i + 1;
    grens = false;
  }
  sluit();

  // 3. Waarschuwingen over het resultaat.
  if (doelen.length === 0) {
    waarschuwingen.push('De lezer herkende een nummering, maar vond er geen doelen met tekst bij. Kijk de tekst na.');
  }
  for (const z of zonderTekst) waarschuwingen.push(`Bij ${z} vond de lezer geen doeltekst.`);

  const perCode = new Map<string, number[]>();
  for (const d of doelen) {
    const k = normalizeGoalCode(d.code);
    perCode.set(k, [...(perCode.get(k) ?? []), d.regel]);
  }
  for (const [code, regelsMetCode] of perCode) {
    if (regelsMetCode.length > 1) {
      waarschuwingen.push(
        `De code ${code} komt ${regelsMetCode.length} keer voor (regels ${regelsMetCode.join(', ')}). Bij bewaren blijft alleen het eerste doel met die code over; kijk na welk doel juist is.`,
      );
    }
  }

  for (const gat of gatenInNummering(doelen.map((d) => d.code))) {
    waarschuwingen.push(`${beschrijfGat(gat)}: staat het niet in de bron, of las de lezer het niet?`);
  }

  if (tweeKolommen.length > 0) {
    const toon = tweeKolommen.slice(0, 5).join('; ');
    const meer = tweeKolommen.length > 5 ? ` en nog ${tweeKolommen.length - 5}` : '';
    waarschuwingen.push(
      `Sommige regels bevatten twee doelcodes: ${toon}${meer}. Staat de tekst misschien in twee kolommen? Kijk die doelen extra goed na.`,
    );
  }

  if (viaKop > 0) {
    waarschuwingen.push(
      `${viaKop} ${viaKop === 1 ? 'doel staat' : 'doelen staan'} onder een kop "Uitbreiding" en ${viaKop === 1 ? 'kreeg' : 'kregen'} daarom niveau uitbreiding, tot de volgende rubriek. Kijk na of dat klopt.`,
    );
  }
  if (uitbreidingOnzeker !== undefined) {
    waarschuwingen.push(
      `Het woord "uitbreiding" staat in de tekst (bv. regel ${uitbreidingOnzeker}) op een plaats die de lezer niet kon thuisbrengen. Kijk het niveau (basis of uitbreiding) van de doelen na.`,
    );
  }

  return { doelen, patroon: { naam: patroon.naam, voorbeeld: gekozen.voorbeeld }, waarschuwingen, genegeerdeRegels };
}

/**
 * Gelezen doelen als leerplandoelen, al gesaneerd zoals bij bewaren (`sanitizeGoal`): zo verandert
 * de vingerafdruk niet tussen nakijken, bewaren, exporteren en importeren. Zonder `refs`: die komen
 * uit het oplossen van `refsBron` in de wizard.
 */
export function naarCurriculumGoals(res: LezerResultaat): CurriculumGoal[] {
  const uit: CurriculumGoal[] = [];
  for (const d of res.doelen) {
    const goal = sanitizeGoal({ id: uid(), code: d.code, text: d.tekst, theme: d.rubriek, level: d.niveau, refsBron: d.refsBron });
    if (goal) uit.push(goal);
  }
  return uit;
}
