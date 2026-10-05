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
  /**
   * Afbrekingen aan het regeleinde die de lezer herstelde door woorddelen samen te voegen, leesbaar:
   * "e-|mail → email". Nooit stil: de leerkracht kijkt na of het streepje bij het woord hoort.
   */
  afbrekingen?: string[];
}

export interface LezerResultaat {
  doelen: GelezenDoel[];
  patroon?: { naam: string; voorbeeld: string };
  waarschuwingen: string[];
  /** Aantal kop- en voetregels, paginanummers en paginamarkeringen dat de lezer oversloeg. */
  genegeerdeRegels: number;
}

// ── Gedeelde tekstregels ────────────────────────────────────────────────────

/**
 * Onzichtbare tekens die niets betekenen voor de tekst: zacht afbreekstreepje, form feed, de tekens
 * zonder breedte. Als alternatieven en niet als tekenklasse: U+200D in een tekenklasse is misleidend.
 */
const ONZICHTBAAR = /\u00ad|\f|\u200b|\u200c|\u200d|\u2060|\ufeff/g;
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

/**
 * Hoe twee regels aan elkaar gaan: met een spatie, zonder iets ertussen (het streepje hoort bij het
 * woord: "Noord-" + "Amerika"), of als hersteld woord: het streepje valt weg ("verwe-" + "ring") of
 * een zacht afbreekstreepje plakt de delen. Kijkt alleen naar het einde van de linkerregel, zodat
 * samenvoegen lineair blijft.
 */
function verbinding(links: string, rechts: string, zachtAfgebroken: boolean): 'spatie' | 'plak' | 'zonderStreepje' | 'zacht' {
  if (zachtAfgebroken) return 'zacht';
  const m = /([\p{L}\p{N}])\p{M}*[-\u2010]$/u.exec(links);
  if (!m) return 'spatie';
  const woord = /^\p{L}+/u.exec(rechts)?.[0] ?? '';
  if (VOEGWOORDEN.has(woord)) return 'spatie'; // "natuur- en milieu"
  if (/\p{Ll}/u.test(m[1]) && /^\p{Ll}/u.test(rechts)) return 'zonderStreepje'; // "verwe-" + "ring"
  return 'plak'; // "Noord-" + "Amerika", "CO2-" + "uitstoot": het streepje hoort bij het woord
}

/** Een herstelde afbreking: twee woorddelen aan het regeleinde werden één woord. */
export interface Afbreking {
  /** Het woorddeel vóór het regeleinde, met streepje: "e-". */
  links: string;
  /** Het woorddeel na het regeleinde: "mail". */
  rechts: string;
  /** Het samengevoegde woord: "email". */
  woord: string;
  /** Plaats in de samengevoegde tekst waar het rechterdeel begint. */
  plaats: number;
}

/** "e-|mail → email": zo melden de lezer en de controlepoort een herstelde afbreking. */
export function beschrijfAfbreking(a: Pick<Afbreking, 'links' | 'rechts' | 'woord'>): string {
  return `${a.links}|${a.rechts} → ${a.woord}`;
}

const WOORDDEEL_LINKS = /[\p{L}\p{N}\p{M}\-\u2010]*$/u;
const WOORDDEEL_RECHTS = /^[\p{L}\p{N}\p{M}\-\u2010]*/u;

/**
 * Regels samenvoegen tot één tekst, zoals `voegRegelsSamen`, en elke herstelde afbreking vastleggen
 * (een weggevallen streepje, of een zacht afbreekstreepje aan het regeleinde) met de plaats in de
 * tekst, en waar elke (niet-lege) regel in de tekst begint (`regelBegin`, stijgend). Lineair in de
 * lengte van de tekst: de delen gaan in een lijst en alleen het laatste deel wordt bekeken.
 */
export function voegRegelsSamenMetAfbrekingen(regels: readonly string[]): { tekst: string; afbrekingen: Afbreking[]; regelBegin: number[] } {
  const delen: string[] = [];
  const afbrekingen: Afbreking[] = [];
  const regelBegin: number[] = [];
  let lengte = 0;
  let zacht = false;
  for (const ruw of regels) {
    const r = schoonRegel(ruw);
    const eindigtZacht = /\u00ad\s*$/.test(ruw);
    if (!r) continue;
    if (delen.length > 0) {
      const laatste = delen[delen.length - 1];
      const soort = verbinding(laatste, r, zacht);
      if (soort === 'spatie') {
        delen.push(' ');
        lengte++;
      } else if (soort !== 'plak') {
        const linksWoord = WOORDDEEL_LINKS.exec(laatste)?.[0] ?? '';
        const rechtsWoord = WOORDDEEL_RECHTS.exec(r)?.[0] ?? '';
        if (soort === 'zonderStreepje') {
          delen[delen.length - 1] = laatste.slice(0, -1);
          lengte--;
        }
        afbrekingen.push({
          links: soort === 'zacht' ? `${linksWoord}-` : linksWoord,
          rechts: rechtsWoord,
          woord: (soort === 'zacht' ? linksWoord : linksWoord.slice(0, -1)) + rechtsWoord,
          plaats: lengte,
        });
      }
    }
    regelBegin.push(lengte);
    delen.push(r);
    lengte += r.length;
    zacht = eindigtZacht;
  }
  return { tekst: delen.join(''), afbrekingen, regelBegin };
}

/**
 * Regels samenvoegen tot één tekst: per regel onzichtbare tekens en opsommingstekens vooraan weg en
 * witruimte samengevouwen, lege regels weg, en de afbreking aan het regeleinde hersteld:
 * "verwe-" + "ring" → "verwering"; "natuur-" + "en milieu" → "natuur- en milieu"; een hoofdletter
 * of cijfer na het streepje houdt het streepje ("Noord-Amerika"); een zacht afbreekstreepje (U+00AD)
 * aan het regeleinde plakt de woorddelen aan elkaar. Lezer en controlepoort gebruiken allebei deze
 * functie, zodat ze dezelfde tekst zien. Welke afbrekingen hersteld werden, geeft
 * `voegRegelsSamenMetAfbrekingen`.
 */
export function voegRegelsSamen(regels: readonly string[]): string {
  return voegRegelsSamenMetAfbrekingen(regels).tekst;
}

/**
 * Splitst een tekst in regels (zonder de regeleinden). Regeleinden: "\r\n", "\r", "\n", U+2028 en
 * U+2029. Een form feed (nieuwe pagina) begint een nieuwe regel en blijft vooraan die regel staan,
 * zodat `kopEnVoetregels` de paginagrens nog ziet; voor de tekst zelf is hij onzichtbaar. Lezer en
 * controlepoort gebruiken allebei deze functie.
 */
export function splitsRegels(tekst: string): string[] {
  return tekst.split(/\r\n|\r|\n|\u2028|\u2029|(?=\f)/);
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
  const { tekst: uit, blokken } = verwijzingenEruit(tekst, false);
  return { tekst: uit, blokken };
}

/**
 * Zoals `haalVerwijzingenUit`, met voor elk teken van het resultaat de plaats in `tekst` waar het
 * vandaan komt (`bron[i]`, stijgend). Zo kan de controlepoort een plaats in de oorspronkelijke tekst
 * (bv. een herstelde afbreking) terugvinden in de tekst zonder verwijzingen.
 */
export function haalVerwijzingenUitMetPosities(tekst: string): { tekst: string; blokken: string[]; bron: number[] } {
  const r = verwijzingenEruit(tekst, true);
  return { tekst: r.tekst, blokken: r.blokken, bron: r.bron ?? [] };
}

function isWitruimte(c: number): boolean {
  return (c >= 9 && c <= 13) || c === 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a)
    || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}

function verwijzingenEruit(tekst: string, metPosities: boolean): { tekst: string; blokken: string[]; bron?: number[] } {
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

  // Wat blijft, als stukken [van, tot) van de tekst: lineair, ook bij een lange bron met veel blokken.
  weg.sort((a, b) => a.start - b.start);
  const houd: { van: number; tot: number }[] = [];
  /** Witruimte achteraan het resultaat tot nu toe weghalen (ook over stukken heen). */
  const trimEind = () => {
    while (houd.length > 0) {
      const s = houd[houd.length - 1];
      while (s.tot > s.van && isWitruimte(tekst.charCodeAt(s.tot - 1))) s.tot--;
      if (s.tot > s.van) return;
      houd.pop();
    }
  };
  let p = 0;
  const blokken: string[] = [];
  const leestekenNa = /\s*[.,;:!?)]/y;
  const eindeNa = /\s*$/y;
  for (const w of weg) {
    if (w.start < p) continue;
    if (w.start > p) houd.push({ van: p, tot: w.start });
    blokken.push(w.blok);
    leestekenNa.lastIndex = w.eind;
    eindeNa.lastIndex = w.eind;
    if (leestekenNa.test(tekst)) {
      trimEind(); // "X (ET 9.1)." → "X."
    } else if (eindeNa.test(tekst)) {
      trimEind();
      const s = houd[houd.length - 1];
      if (s && /[-–—,;:]/.test(tekst[s.tot - 1])) {
        s.tot--; // "X – MD 09.01" → "X"
        trimEind();
      }
    }
    p = w.eind;
  }
  if (p < tekst.length) houd.push({ van: p, tot: tekst.length });

  if (!metPosities) {
    return { tekst: houd.map((s) => tekst.slice(s.van, s.tot)).join('').replace(/\s+/g, ' ').trim(), blokken };
  }
  // Witruimte samenvouwen en trimmen, met de herkomst van elk teken.
  const delen: string[] = [];
  const bron: number[] = [];
  let spatie = -1; // plaats van een witruimte die nog een spatie moet worden
  for (const s of houd) {
    let begin = s.van;
    for (let i = s.van; i < s.tot; i++) {
      if (!isWitruimte(tekst.charCodeAt(i))) continue;
      if (i > begin) {
        if (spatie >= 0 && bron.length > 0) {
          delen.push(' ');
          bron.push(spatie);
        }
        delen.push(tekst.slice(begin, i));
        for (let k = begin; k < i; k++) bron.push(k);
        spatie = -1;
      }
      if (spatie < 0) spatie = i;
      begin = i + 1;
    }
    if (s.tot > begin) {
      if (spatie >= 0 && bron.length > 0) {
        delen.push(' ');
        bron.push(spatie);
      }
      delen.push(tekst.slice(begin, s.tot));
      for (let k = begin; k < s.tot; k++) bron.push(k);
      spatie = -1;
    }
  }
  return { tekst: delen.join(''), blokken, bron };
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
 * ("— p. 3 —"), paginanummers, en kop- en voetregels. Een kop- of voetregel is een regel die op
 * minstens 3 verschillende pagina's identiek voorkomt (of identiek op de cijfers na, als die niet
 * vooraan staan), telkens bij de boven- of onderrand van de pagina (de eerste of laatste 3 regels),
 * en nooit elders. Pagina's zijn de stukken tussen paginamarkeringen of form feeds; zonder die grenzen
 * de blokken tussen lege regels met minstens 6 regels (zo geeft `extractPdfLines` zijn tekst). Een
 * regel die een doel begint, een verwijzing is of met "Uitbreiding" begint, is nooit een kop- of
 * voetregel.
 *
 * Een regel met alleen een getal ("12", "3 van 9") is alleen een paginanummer aan de rand van een
 * pagina (de eerste of laatste 3 regels, zoals kop- en voetregels), en niet als hij midden in een zin
 * staat: de regel ervoor is geen afgeronde zin en de regel erna begint met een kleine letter, zonder
 * lege regel of paginagrens ertussen. Zo blijft "tot" / "1000" / "ordenen" gewoon "tot 1000 ordenen".
 */
export function kopEnVoetregels(regels: readonly string[]): Set<number> {
  const k = regels.map(kaal);
  const opmaak = new Set<number>();
  const grens = new Set<number>(); // regels waarvóór een nieuwe pagina begint
  const nummers: number[] = []; // kandidaat-paginanummers
  let expliciet = false;
  k.forEach((t, i) => {
    if (isPaginamarkering(t)) {
      opmaak.add(i);
      grens.add(i + 1);
      expliciet = true;
    } else if (PAGINANUMMER.test(t)) {
      nummers.push(i);
    }
    if (regels[i].includes('\f')) {
      grens.add(i);
      expliciet = true;
    }
  });

  // Pagina's opbouwen: lijsten met de indexen van de inhoudsregels. Een kandidaat-paginanummer telt
  // niet mee als inhoud; we onthouden op welke pagina hij staat en hoeveel regels ervoor.
  const paginas: number[][] = [[]];
  const kandidaten = new Set(nummers);
  const plaatsNummer: { i: number; pagina: number; voor: number }[] = [];
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
    if (kandidaten.has(i)) {
      plaatsNummer.push({ i, pagina: paginas.length - 1, voor: paginas[paginas.length - 1].length });
      continue;
    }
    paginas[paginas.length - 1].push(i);
  }
  for (const { i, pagina, voor } of plaatsNummer) {
    const na = paginas[pagina].length - voor;
    if (voor >= RAND && na >= RAND) continue; // niet aan de rand: inhoud
    const vorige = k[i - 1] ?? '';
    const volgende = k[i + 1] ?? '';
    const aanGrens = vorige === '' || volgende === '' || grens.has(i) || grens.has(i + 1) || opmaak.has(i - 1) || opmaak.has(i + 1);
    const midZin = !aanGrens && !/[.!?:;]["'”’)\]]*$/.test(vorige) && /^\p{Ll}/u.test(schoonRegel(regels[i + 1]));
    if (!midZin) opmaak.add(i);
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

const isCijfer = (c: number) => c >= 48 && c <= 57;

/**
 * Het laatste getal in een code en wat ervoor staat: "LPD 12U" → { reeks: "LPD ", getal: "12" }.
 * Van achter naar voor gelezen, zonder reguliere expressie: lineair, ook voor een heel lange code.
 */
function laatsteGetal(code: string): { reeks: string; getal: string } | null {
  let eind = code.length;
  while (eind > 0 && !isCijfer(code.charCodeAt(eind - 1))) eind--;
  if (eind === 0) return null;
  let begin = eind;
  while (begin > 0 && isCijfer(code.charCodeAt(begin - 1))) begin--;
  return { reeks: code.slice(0, begin), getal: code.slice(begin, eind) };
}

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
    const m = laatsteGetal(normalizeGoalCode(ruw));
    if (!m) return;
    ontleed.push({ reeks: m.reeks, n: parseInt(m.getal, 10), i, breedte: m.getal.length });
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
    // De reeks moet eindigen op "<getal>." (zonder reguliere expressie: lineair, ook voor lange codes).
    if (!o.reeks.endsWith('.') || !isCijfer(o.reeks.charCodeAt(o.reeks.length - 2))) continue;
    const m = laatsteGetal(o.reeks.slice(0, -1));
    if (!m) continue;
    const ouder = reeksen.get(m.reeks);
    if (!ouder?.eigen) continue;
    const n = parseInt(m.getal, 10);
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

/** Loopt het woord door op de volgende regel: een afbreekstreepje of een zacht afbreekstreepje achteraan. */
function eindigtOpAfbreking(t: string): boolean {
  return /[\p{L}\p{N}]\p{M}*[-\u2010]$|\u00ad$/u.test(t);
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

/** Wat na een code staat, is een kop en geen doel(zin): kort, hoofdletter, geen eindpunt, niet "De leerling(en)". */
function isKopRest(rest: string): boolean {
  return rest !== '' && heeftKopvorm(rest) && !STERKE_DOELZIN.test(rest);
}

/** Hoogstens zoveel losse meldingen van dezelfde soort; de rest komt samen in één melding. */
const MAX_MELDINGEN = 20;

function kort(t: string, max: number): string {
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

/** Losse meldingen, en wat boven `MAX_MELDINGEN` uitkomt in één samenvatting (met van elk het doel, bv. "LPD 4"). */
function meldAllemaal<T>(
  waarschuwingen: string[],
  lijst: readonly T[],
  los: (x: T) => string,
  wie: (x: T) => string,
  rest: (doelen: string) => string,
): void {
  for (const x of lijst.slice(0, MAX_MELDINGEN)) waarschuwingen.push(los(x));
  if (lijst.length > MAX_MELDINGEN) waarschuwingen.push(rest(lijst.slice(MAX_MELDINGEN).map(wie).join(', ')));
}

/**
 * Het bladzijdenummer waar regel `i` staat, als de tekst paginamarkeringen heeft ("— p. 3 —", zoals
 * `extractPdfLines` ze zet): de laatste markering vóór die regel. `undefined` zonder markeringen (geplakte tekst).
 */
function bladzijdeBij(regels: readonly string[], i: number): number | undefined {
  for (let j = Math.min(i, regels.length - 1); j >= 0; j--) {
    const k = kaal(regels[j]);
    if (!isPaginamarkering(k)) continue;
    const nr = /\d{1,4}/.exec(k)?.[0];
    return nr === undefined ? undefined : Number(nr);
  }
  return undefined;
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
  /** Een verwijzing sloot het doel af: alleen een regel met een kleine letter komt er nog bij. */
  gesloten: boolean;
  /** Er kwam een regel tussen die er niet bij hoort: geen tekst meer erbij. */
  onderbroken: boolean;
  inLijst: boolean;
}

/**
 * Leest doelen uit leerplantekst (zie de uitleg bovenaan). Een doel loopt door over de volgende
 * regels tot het volgende doel, een rubriekskop, of een regel die er niet bij hoort. Een regel die met
 * een kleine letter begint, is altijd een vervolg (ook na een punt, zoals "o.a." of "t.o.v.", en ook
 * na een lege regel of een paginagrens). Na een lege regel, een paginamarkering of een kop- of
 * voetregel loopt het doel verder alleen door als de volgende regel duidelijk een vervolg is (de vorige
 * eindigde op een afbreekstreepje, of de zin is niet af en er volgt een opsomming): zo blijft een doel
 * heel over een paginagrens.
 *
 * Wat de lezer niet zeker weet, komt in `waarschuwingen`, in gewone taal en met het doel erbij ("bij LPD 4"), niet
 * met een regelnummer (de leerkracht ziet de regels van onze tekst niet; zonder doel staat er de bladzijde, als
 * die uit een paginamarkering te halen is): regels die met een code van het gekozen patroon beginnen maar geen
 * doel werden, doelen in een tweede nummering, herstelde afbrekingen, en een overgeslagen paginanummer midden
 * in een doel.
 */
export function leesLeerplan(tekst: string): LezerResultaat {
  const waarschuwingen: string[] = [];
  // NFC: een é uit twee tekens (e + accent) is dezelfde é, ook voor de afbreking aan het regeleinde.
  const regels = splitsRegels((tekst ?? '').normalize('NFC'));
  const opmaak = kopEnVoetregels(regels);
  const schoon = regels.map(schoonRegel);
  const opsomming = regels.map(heeftOpsomming);
  /** Een zacht afbreekstreepje aan het regeleinde: het woord loopt door op de volgende regel. */
  const zacht = regels.map((r) => /\u00ad\s*$/.test(r));
  const leeg = (i: number) => schoon[i] === '' || opmaak.has(i);
  /** De tekst van regel i zoals hij in een doel komt, met het zachte afbreekstreepje voor het samenvoegen. */
  const deel = (i: number, t: string) => (zacht[i] ? `${t}\u00ad` : t);

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
  const alleScores = PATRONEN.map((p) => {
    let treffers = 0;
    const sterkeRegels: number[] = [];
    let voorbeeld = '';
    for (let i = 0; i < regels.length; i++) {
      const t = doelStart(p, i);
      if (!t) continue;
      treffers++;
      if (t.sterk) sterkeRegels.push(i);
      if (!voorbeeld) voorbeeld = t.code;
    }
    const score = (treffers + sterkeRegels.length) * (p.zwak ? 0.5 : 1);
    return { p, treffers, score, voorbeeld, sterkeRegels };
  });
  const scores = alleScores
    .filter((s) => s.treffers >= (s.p.zwak ? 2 : 1))
    .sort((a, b) => b.score - a.score || a.p.rang - b.p.rang);

  const genegeerdeRegels = opmaak.size;
  if (scores.length === 0) {
    waarschuwingen.push(
      'Boosterz vond geen nummering van doelen (zoals "LPD 12", "1.2.3" of "AAR 2.1") vooraan een regel. Kijk na of de tekst de doelen met hun code bevat.',
    );
    // Wel codes vooraan, maar zonder doelzin erachter: misschien staat het begin van de zin erboven.
    const metCode: string[] = [];
    for (let i = 0; i < regels.length && metCode.length < 5; i++) {
      if (leeg(i)) continue;
      const p = PATRONEN.find((x) => !x.zwak && x.lees(schoon[i]) !== null);
      const t = p?.lees(schoon[i]);
      if (t) metCode.push(t.code);
    }
    if (metCode.length > 0) {
      waarschuwingen.push(
        `Er staan wel codes vooraan een regel (bv. ${metCode.slice(0, 3).join(', ')}), maar zonder doelzin erachter ("De leerlingen …" of een zin met een hoofdletter). Staat het begin van de zin misschien boven de lijst? Kijk na of de tekst de doelen met hun code bevat.`,
      );
    }
    return { doelen: [], waarschuwingen, genegeerdeRegels };
  }
  const gekozen = scores[0];
  const patroon = gekozen.p;
  const bijnaEvenSterk = scores.length > 1 && scores[1].treffers >= 2 && scores[1].score >= 0.8 * gekozen.score ? scores[1].p : undefined;
  if (bijnaEvenSterk) {
    waarschuwingen.push(
      `Twee nummeringen komen ongeveer even vaak voor: nummers zoals ${gekozen.voorbeeld} (${gekozen.treffers} keer) en nummers zoals ${scores[1].voorbeeld} (${scores[1].treffers} keer). Boosterz koos de eerste; kijk na of dat klopt.`,
    );
  }

  const start = regels.map((_, i) => doelStart(patroon, i));

  // Een tweede nummering met doelen die met "De leerling(en)" beginnen, hoe weinig ook: die las de lezer niet.
  for (const s of alleScores) {
    if (s.p === patroon || s.p === bijnaEvenSterk) continue;
    const ongelezen = s.sterkeRegels.filter((i) => !start[i]);
    if (ongelezen.length === 0) continue;
    const eerste = s.p.lees(schoon[ongelezen[0]])?.code ?? '';
    waarschuwingen.push(
      `Er staan ook doelen in een andere nummering: nummers zoals ${eerste}${ongelezen.length > 1 ? ` (${ongelezen.length} keer)` : ''}. Boosterz las alleen nummers zoals ${gekozen.voorbeeld}; kijk na of die doelen erbij horen.`,
    );
  }

  // Regels die met een code van het gekozen patroon beginnen, maar geen doel werden (bv. "LPD 3 aan de hand van …").
  const nietGelezen: { code: string; tekst: string }[] = [];
  for (let i = 0; i < regels.length; i++) {
    if (leeg(i) || start[i]) continue;
    const t = patroon.lees(schoon[i]);
    if (!t || (patroon.streng && isKopRest(t.rest))) continue;
    nietGelezen.push({ code: t.code, tekst: schoon[i] });
  }

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
  /** Paginanummers die sinds de laatste inhoudsregel overgeslagen werden. */
  let overgeslagen: number[] = [];
  const nummerInDoel: { code: string; tekst: string }[] = [];
  /** Het woord "uitbreiding" op een plaats die we niet konden thuisbrengen: bij welk doel, of op welke regel. */
  let uitbreidingOnzeker: { code?: string; regel: number } | undefined;
  let viaKop = 0;
  const tweeKolommen: string[] = [];
  const zonderTekst: string[] = [];

  const sluit = () => {
    if (!huidig) return;
    const samen = voegRegelsSamenMetAfbrekingen(huidig.delen);
    const v = haalVerwijzingenUit(samen.tekst);
    const tekstDoel = schrijfLigaturenUit(v.tekst);
    const refs = [...v.blokken, ...huidig.refsRegels];
    if (!tekstDoel) {
      zonderTekst.push(huidig.code);
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
      // Een afbreking in een verwijzing die uit de tekst ging, hoort niet bij het doel.
      const afbrekingen = samen.afbrekingen.filter((a) => schrijfLigaturenUit(v.tekst).includes(schrijfLigaturenUit(a.woord)));
      if (afbrekingen.length > 0) doel.afbrekingen = afbrekingen.map(beschrijfAfbreking);
      if (huidig.viaKop) viaKop++;
      if (uitbreidingOnzeker === undefined && UITBREIDING_AANDUIDING.test(tekstDoel)) uitbreidingOnzeker = { code: huidig.code, regel: huidig.start };
      doelen.push(doel);
    }
    huidig = null;
  };

  const isVervolg = (h: Bezig, i: number): boolean => {
    if (h.onderbroken) return false;
    const t = schoon[i];
    if (h.delen.length === 0) return !h.gesloten; // code alleen op de regel: de tekst volgt
    // Een kleine letter vooraan: de zin loopt door, ook na "o.a." of "t.o.v." en over een lege regel.
    if (/^\p{Ll}/u.test(t)) return true;
    if (h.gesloten) return false;
    const vorige = h.delen[h.delen.length - 1];
    if (eindigtOpAfbreking(vorige)) return true;
    const af = isAfgerond(vorige);
    if (!grens) {
      if (!af) return true;
      return opsomming[i] && h.inLijst;
    }
    if (af) return false;
    return opsomming[i] && (h.inLijst || /:$/.test(vorige));
  };

  for (let i = 0; i < regels.length; i++) {
    if (leeg(i)) {
      if (opmaak.has(i) && PAGINANUMMER.test(kaal(regels[i]))) overgeslagen.push(i);
      grens = true;
      continue;
    }
    const tussen = overgeslagen;
    overgeslagen = [];
    const t = schoon[i];
    const s = start[i];
    if (s) {
      sluit();
      aanduidingNetGezet = false;
      const extra = patroon.tweedeCode(s.rest);
      if (extra) tweeKolommen.push(`${s.code} en ${extra}`);
      huidig = {
        start: i,
        eind: i,
        code: s.code,
        delen: s.rest ? [deel(i, s.rest)] : [],
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
      h.delen.push(deel(i, t));
      h.eind = i;
      for (const j of tussen) nummerInDoel.push({ code: h.code, tekst: kaal(regels[j]) });
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
    if (uitbreidingOnzeker === undefined && UITBREIDING_AANDUIDING.test(t)) uitbreidingOnzeker = { regel: i };
    grens = false;
  }
  sluit();

  // 3. Waarschuwingen over het resultaat.
  if (doelen.length === 0) {
    waarschuwingen.push('Boosterz herkende een nummering, maar vond er geen doelen met tekst bij. Kijk de tekst na.');
  }
  for (const z of zonderTekst) waarschuwingen.push(`Bij ${z} vond Boosterz geen doeltekst.`);

  meldAllemaal(
    waarschuwingen,
    nietGelezen,
    (x) => `Bij ${x.code} las Boosterz geen doel ("${kort(x.tekst, 60)}"). Kijk na of daar een doel staat.`,
    (x) => x.code,
    (doelen) => `Nog meer codes staan vooraan een regel maar werden geen doel: ${doelen}. Kijk na of daar doelen staan.`,
  );

  const perCode = new Map<string, number>();
  for (const d of doelen) {
    const k = normalizeGoalCode(d.code);
    perCode.set(k, (perCode.get(k) ?? 0) + 1);
  }
  for (const [code, aantal] of perCode) {
    if (aantal > 1) {
      waarschuwingen.push(
        `De code ${code} komt ${aantal} keer voor. Bij bewaren blijft alleen het eerste doel met die code over; kijk na welk doel juist is.`,
      );
    }
  }

  for (const gat of gatenInNummering(doelen.map((d) => d.code))) {
    waarschuwingen.push(`${beschrijfGat(gat)}: staat het niet in de bron, of vond Boosterz het niet?`);
  }

  if (tweeKolommen.length > 0) {
    const toon = tweeKolommen.slice(0, 5).join('; ');
    const meer = tweeKolommen.length > 5 ? ` en nog ${tweeKolommen.length - 5}` : '';
    waarschuwingen.push(
      `Sommige regels bevatten twee doelcodes: ${toon}${meer}. Staat de tekst misschien in twee kolommen? Kijk die doelen extra goed na.`,
    );
  }

  meldAllemaal(
    waarschuwingen,
    doelen.filter((d) => d.afbrekingen !== undefined),
    (d) => `${d.code}: afbreking hersteld: ${(d.afbrekingen ?? []).join(', ')}; kijk na of het streepje bij het woord hoort.`,
    (d) => d.code,
    (doelen) => `Ook bij ${doelen} werd een afbreking hersteld; kijk na of het streepje bij het woord hoort.`,
  );

  meldAllemaal(
    waarschuwingen,
    nummerInDoel,
    (x) => `${x.code}: Boosterz sloeg het getal "${x.tekst}" over als paginanummer, midden in het doel. Kijk na of dat getal bij de tekst hoort.`,
    (x) => x.code,
    (doelen) => `Ook bij ${doelen} sloeg Boosterz een paginanummer over midden in het doel. Kijk na of die getallen bij de tekst horen.`,
  );

  if (viaKop > 0) {
    waarschuwingen.push(
      `${viaKop} ${viaKop === 1 ? 'doel staat' : 'doelen staan'} onder een kop "Uitbreiding" en ${viaKop === 1 ? 'kreeg' : 'kregen'} daarom niveau uitbreiding, tot de volgende rubriek. Kijk na of dat klopt.`,
    );
  }
  if (uitbreidingOnzeker !== undefined) {
    const { code, regel } = uitbreidingOnzeker;
    const pagina = bladzijdeBij(regels, regel);
    const waar = code ? `Bij ${code} staat` : pagina !== undefined ? `Op bladzijde ${pagina} staat` : 'In de tekst staat';
    waarschuwingen.push(
      `${waar} het woord "uitbreiding" op een plaats die Boosterz niet kon thuisbrengen. Kijk het niveau (basis of uitbreiding) van de doelen na.`,
    );
  }

  return { doelen, patroon: { naam: patroon.naam, voorbeeld: gekozen.voorbeeld }, waarschuwingen, genegeerdeRegels };
}

// ── Voor de controlepoort ───────────────────────────────────────────────────

/** Een regel van de bron die met een doelcode begint (volgens eender welk patroon van de lezer). */
export interface CodeRegel {
  /** Regelnummer in de bron (vanaf 1). */
  regel: number;
  /** De code zoals de lezer ze zou geven, bv. "LPD 3". */
  code: string;
  /** Wat na de code staat. */
  rest: string;
  /**
   * Telt als mogelijke doelstart. Niet bij een streng patroon (1.2.3, 12.) waarvan de rest eruitziet
   * als een kop (kort, hoofdletter, geen eindpunt en niet "De leerling(en)"): "2.3 Energie" is een kop.
   */
  telt: boolean;
}

/**
 * Alle regels die met een doelcode beginnen, volgens elk patroon van de lezer, zonder de opmaak van de
 * pagina (`opmaak`, uit `kopEnVoetregels`). De controlepoort zoekt hiermee doelen die in de bron staan
 * maar in het leerplan ontbreken.
 */
export function regelsMetDoelcode(regels: readonly string[], opmaak: ReadonlySet<number>): CodeRegel[] {
  const uit: CodeRegel[] = [];
  regels.forEach((ruw, i) => {
    if (opmaak.has(i)) return;
    const t = schoonRegel(ruw);
    if (!t) return;
    const gezien = new Set<string>();
    for (const p of PATRONEN) {
      const treffer = p.lees(t);
      if (!treffer || gezien.has(treffer.code)) continue;
      gezien.add(treffer.code);
      uit.push({ regel: i + 1, code: treffer.code, rest: treffer.rest, telt: !(p.streng && isKopRest(treffer.rest)) });
    }
  });
  return uit;
}

function escapeRe(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Staat er in een doeltekst nog een doelcode van dezelfde soort als `code`, gevolgd door een doelzin?
 * Dan zijn twee doelen samengevoegd ("De leerlingen kunnen A. LPD 2 De leerlingen kunnen B."). Zelfde
 * soort: dezelfde letters vooraan en evenveel delen in het nummer. Na een code met letters telt een
 * zin met "De leerling(en)", of een zin met een hoofdletter als de code na een zinseinde staat; na een
 * code met alleen cijfers telt alleen "De leerling(en)". Een verwijzing ("MD 09.01 De …") telt niet.
 * Geeft de gevonden code, of `undefined`.
 */
export function samengevoegdeCode(tekst: string, code: string): string | undefined {
  const m = /^(\p{L}{1,6})?\s?(\d{1,3}(?:\.\d{1,3}){0,3})\s?(?:U|\(U\))?$/u.exec(normalizeGoalCode(code));
  if (!m) return undefined;
  const letters = m[1];
  const diepte = m[2].split('.').length;
  const nummer = diepte === 1 ? String.raw`\d{1,3}` : String.raw`\d{1,3}(?:\.\d{1,3}){${diepte - 1}}`;
  const re = letters
    ? new RegExp(String.raw`(?<![\p{L}\p{N}])(${escapeRe(letters)}\s?${nummer}(?:U|\s?\(U\))?)(?![\p{L}\p{N}]|\.\d)[\s:.)–—-]+`, 'giu')
    : diepte === 1
      ? new RegExp(String.raw`(?<![\p{L}\p{N}.])(${nummer})[.)]\s+`, 'gu')
      : new RegExp(String.raw`(?<![\p{L}\p{N}.])(${nummer}U?)(?![\p{L}\p{N}]|\.\d)\.?[\s:)–—-]+`, 'gu');
  let treffer: RegExpExecArray | null;
  while ((treffer = re.exec(tekst)) !== null) {
    const ervoor = tekst.slice(0, treffer.index);
    if (VERWIJS_VOOR.test(ervoor)) continue;
    const na = tekst.slice(treffer.index + treffer[0].length);
    if (STERKE_DOELZIN.test(na)) return treffer[1].trim();
    if (letters && DOELZIN.test(na) && /(?:^|[.!?;:])\s*$/.test(ervoor)) return treffer[1].trim();
  }
  return undefined;
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
