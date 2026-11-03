// Zoeken in de doelen van het basisonderwijs (docs/basisonderwijs/INGANG.md, § Zoeken en beslissing H3): in gewone
// woorden, zonder AI en zonder sleutel. De mechaniek is zuiver; de woordenlijsten zijn een parameter
// (src/lib/basis/zoekwoorden.ts).
//
// Zuiver: geen React, geen fetch, geen opslag en nergens de klok.
//
// Hoe het zoekt.
// - Een vraag van 5 cijfers is een doelnummer, 3.5 of 3.5.4 is een code.
// - Moment-, leerjaar- en vakwoorden worden filters (chips). Stopwoorden vallen weg.
// - Elk ander woord wordt een term: het woord zelf, een lichte stam (magneten wordt magnet en magneet) en de woorden
//   die de tabel ernaast zet.
// - Een woord past op woordbegin. Korte woorden (4 letters of minder) en '='-woorden passen als heel woord, met een
//   buiging erachter. De rubriek telt alleen als heel woord. Nooit op het laatste deel van een samenstelling.
// - Score per term: doelzin 3, rubriek 2, uitbreiding of woordenschat 1. Doelen met alle termen staan eerst.
//   Zijn dat er minder dan 5, dan volgen de doelen met een deel van de woorden apart (`deels`).

import { blokkenAlsTekst, doeltekstBlokken } from './doeltekst';
import { codeVergelijk, EINDMOMENTEN, type DoelBasis } from './doelBasis';
import type { Eindmoment } from './kalender';

export interface Zoekwoorden {
  /** Woorden die niets toevoegen (genormaliseerd). */
  stop: readonly string[];
  /** Een vakwoord of -woordgroep (genormaliseerd) naar vaknummers: het wordt een filter, geen zoekwoord. */
  vak: Readonly<Record<string, readonly number[]>>;
  /** Een gestamd woord van de leerkracht naar extra woorden van de bron; '=' vooraan: alleen als heel woord. */
  ook: Readonly<Record<string, readonly string[]>>;
}

export interface ZoekDoel {
  id: string;
  code: string;
  setId: string;
  eind: Eindmoment;
  vak: number;
  onderwerpNr: string;
  onderwerp: string;
  subthema?: string;
  doelzin: string;
  uitbreiding?: string;
  woordenschat?: string;
}

/** Eén zoekwoord: het woord zelf, zijn stammen en de woorden uit de tabel. */
export interface Term {
  eigen: string;
  alts: string[];
  tabel: string[];
}

export interface Vraag {
  termen: Term[];
  vakken?: number[];
  eind?: Eindmoment[];
  /** De herkende filters in gewone woorden, voor de chips. */
  filters: string[];
  /** Een doelnummer (vraag van 5 cijfers). */
  id?: string;
  /** Een code zoals 3.5 of 3.5.4. */
  code?: string;
}

export interface Treffer {
  doel: ZoekDoel;
  score: number;
  /** Hoeveel termen van de vraag in dit doel passen. */
  termen: number;
  /** Woorden uit de tabel die dit doel raakten waar het eigen woord niet in staat. */
  viaTabel: string[];
}

export interface Groep {
  sleutel: string;
  vak: number;
  onderwerp: string;
  treffers: Treffer[];
}

export interface Uitslag {
  vraag: Vraag;
  /** Doelen met alle termen, best eerst. */
  treffers: Treffer[];
  /** Per vak en onderwerp, in de volgorde van de beste treffer. */
  groepen: Groep[];
  /** Doelen met een deel van de termen, alleen als er minder dan 5 treffers zijn ("Ook met een deel van je woorden:"). */
  deels: Treffer[];
  deelsGroepen: Groep[];
  /** Waar `deels` niet leeg is. */
  versoepeld: boolean;
  /** Geen woorden, wel een vak: de doelen van dat vak. */
  alleenVak: boolean;
  /** Geen woorden en geen vak, wel een moment: het scherm geeft een link naar dat moment. */
  alleenMoment: boolean;
  /** Niets bruikbaars in de vraag (leeg of alleen stopwoorden): het scherm geeft een hulpzin. */
  leeg: boolean;
  /** De woorden uit de tabel waarop meegezocht werd, voor "Ook gezocht op: …". */
  ookGezocht: string[];
}

/** Zo veel treffers met alle woorden: daaronder volgt `deels`. */
export const MIN_TREFFERS = 5;

// ─── Woorden ────────────────────────────────────────────────────────────────

/** Kleine letters zonder accenten, zonder onzichtbare tekens, '&' als 'en', en alleen letters, cijfers en spaties. */
export function normaal(t: string): string {
  return t
    .replace(/[\u200B\u00AD]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Lichte stam: meervoud en verkleinwoord eraf, met een verdubbelde klinker of medeklinker als variant (magneten wordt magnet en magneet). */
export function varianten(t: string): string[] {
  const uit = new Set<string>([t]);
  let s = t;
  if (s.length >= 6 && /(tjes|jes)$/.test(s)) s = s.replace(/t?jes$/, '');
  else if (s.length >= 6 && s.endsWith('en')) s = s.slice(0, -2);
  else if (s.length >= 5 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  uit.add(s);
  const m = s.match(/^(.*[^aeiou])([aeiou])([^aeiou])$/);
  if (m && s !== t) uit.add(`${m[1]}${m[2]}${m[2]}${m[3]}`);
  const d = s.match(/^(.*)([^aeiou])\2$/);
  if (d && s !== t) uit.add(`${d[1]}${d[2]}`);
  return [...uit].filter((x) => x === t || x.length >= 3);
}

// ─── De vraag lezen ─────────────────────────────────────────────────────────

const LEERJAAR_EIND: Record<string, Eindmoment> = { k1: 'K3', k2: 'K3', k3: 'K3', l1: 'L4', l2: 'L4', l3: 'L4', l4: 'L4', l5: 'L6', l6: 'L6' };
const RANG: Record<string, string> = { '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', eerste: '1', tweede: '2', derde: '3', vierde: '4', vijfde: '5', zesde: '6' };

interface MomentLezing {
  rest: string[];
  eind?: Eindmoment[];
  filter?: string;
}

/** Haalt het moment- of leerjaarwoord uit de vraag en geeft de rest terug. 'lager' is alleen een moment in 'lager onderwijs' of als enig woord. */
function leesMoment(w: string[]): MomentLezing {
  const s = ` ${w.join(' ')} `;
  const zonder = (m: RegExpMatchArray): string[] => s.replace(m[0], ' ').split(' ').filter(Boolean);
  let m = s.match(/ (?:einde )?(\d|eerste|tweede|derde) ?(?:ste|de|e)? ?kleuter(?:klas|klassen|s)? /);
  if (m) return { rest: zonder(m), eind: ['K3'], filter: `${RANG[m[1]]}de kleuterklas` };
  m = s.match(/ (?:einde )?(\d|eerste|tweede|derde|vierde|vijfde|zesde) ?(?:ste|de|e)? ?(?:leerjaar|lj) /);
  if (m && RANG[m[1]]) {
    const lj = `l${RANG[m[1]]}`;
    return { rest: zonder(m), eind: [LEERJAAR_EIND[lj]], filter: `${RANG[m[1]]}de leerjaar` };
  }
  m = s.match(/ (?:einde )?(4|6) ?(?:ste|de|e) /);
  if (m) return { rest: zonder(m), eind: [m[1] === '4' ? 'L4' : 'L6'], filter: `einde ${m[1]}de leerjaar` };
  m = s.match(/ (k[123]|l[1-6]) /);
  if (m) return { rest: zonder(m), eind: [LEERJAAR_EIND[m[1]]], filter: m[1].toUpperCase() };
  m = s.match(/ (?:einde )?(kleuters?|kleuterklas|kleuterklassen|kleuteronderwijs) /);
  if (m) return { rest: zonder(m), eind: ['K3'], filter: 'kleuters' };
  m = s.match(/ lager onderwijs /);
  if (m) return { rest: zonder(m), eind: ['L4', 'L6'], filter: 'lager onderwijs' };
  if (w.length === 1 && w[0] === 'lager') return { rest: [], eind: ['L4', 'L6'], filter: 'lager onderwijs' };
  return { rest: w };
}

/** Breekt de vraag in filters en termen. Nooit een fout: een vreemde vraag geeft een vraag zonder termen. */
export function leesVraag(q: string, w: Zoekwoorden): Vraag {
  const kaal = q.trim();
  if (/^\d{5}$/.test(kaal)) return { termen: [], filters: [], id: kaal };
  if (/^\d{1,2}\.\d{1,2}(?:\.\d{1,3})?$/.test(kaal)) return { termen: [], filters: [], code: kaal };

  const stop = new Set(w.stop);
  const filters: string[] = [];
  const mo = leesMoment(normaal(q).split(' ').filter(Boolean));
  if (mo.filter) filters.push(mo.filter);
  const woorden = mo.rest;

  let vakken: number[] | undefined;
  const rest: string[] = [];
  for (let i = 0; i < woorden.length; ) {
    // de langste vakmatch eerst: 3, 2 en dan 1 woord ('w en t', 'muzische vorming')
    let genomen = 0;
    for (const n of [3, 2, 1]) {
      if (i + n > woorden.length) continue;
      const sleutel = woorden.slice(i, i + n).join(' ');
      const nrs = Object.prototype.hasOwnProperty.call(w.vak, sleutel) ? w.vak[sleutel] : undefined;
      if (nrs) {
        vakken = [...new Set([...(vakken ?? []), ...nrs])];
        filters.push(sleutel);
        genomen = n;
        break;
      }
    }
    if (genomen > 0) {
      i += genomen;
      continue;
    }
    if (!stop.has(woorden[i])) rest.push(woorden[i]);
    i++;
  }

  const termen: Term[] = rest.map((eigen) => {
    const alts = varianten(eigen);
    const tabel = [...new Set(alts.flatMap((x) => (Object.prototype.hasOwnProperty.call(w.ook, x) ? w.ook[x] : [])))].filter((x) => !alts.includes(x));
    return { eigen, alts, tabel };
  });
  const vraag: Vraag = { termen, filters };
  if (vakken) vraag.vakken = vakken;
  if (mo.eind) vraag.eind = mo.eind;
  return vraag;
}

// ─── Passen en scoren ───────────────────────────────────────────────────────

interface Velden {
  z: string[];
  r: string[];
  u: string[];
  ws: string[];
}
const veldenVan = new WeakMap<ZoekDoel, Velden>();
function velden(d: ZoekDoel): Velden {
  let v = veldenVan.get(d);
  if (!v) {
    const sp = (t?: string): string[] => (t ? normaal(t).split(' ').filter(Boolean) : []);
    v = { z: sp(d.doelzin), r: sp(`${d.onderwerp} ${d.subthema ?? ''}`), u: sp(d.uitbreiding), ws: sp(d.woordenschat) };
    veldenVan.set(d, v);
  }
  return v;
}

const BUIGING = new Set(['', 'e', 'en', 'n', 's', 'es']);

/** Past dit woord (of deze woordgroep) in de woorden? `heelWoord`: alleen als heel woord, met een buiging erachter. */
function past(woorden: readonly string[], alt: string, heelWoord: boolean): boolean {
  const heel = alt.startsWith('=');
  const a = heel ? alt.slice(1) : alt;
  if (a.includes(' ')) return ` ${woorden.join(' ')} `.includes(` ${a}`);
  const streng = heel || heelWoord || a.length <= 4;
  return woorden.some((w) => w.startsWith(a) && (!streng || BUIGING.has(w.slice(a.length))));
}

function inVeld(v: Velden, alts: readonly string[]): number {
  if (alts.some((a) => past(v.z, a, false))) return 3;
  if (alts.some((a) => past(v.r, a, true))) return 2;
  if (alts.some((a) => past(v.u, a, false) || past(v.ws, a, false))) return 1;
  return 0;
}

/**
 * Gewicht van één term in een doel, met de tabelwoorden die het doel raakten waar het eigen woord niet in staat.
 * `sterk`: het eigen woord staat ergens in het doel, of een tabelwoord staat in de doelzin of de rubriek. Een tabelwoord dat
 * alleen in de uitbreiding of de woordenschat staat (bv. 'licht' voor 'schaduw' in een voorbeeld), is zwak.
 */
function gewicht(d: ZoekDoel, t: Term): { w: number; via: string[]; sterk: boolean } {
  const v = velden(d);
  const eigen = inVeld(v, t.alts);
  if (t.tabel.length === 0) return { w: eigen, via: [], sterk: eigen > 0 };
  const totaal = inVeld(v, [...t.alts, ...t.tabel]);
  const via = eigen > 0 ? [] : t.tabel.filter((a) => inVeld(v, [a]) > 0);
  return { w: totaal, via, sterk: eigen > 0 || totaal >= 2 };
}

// ─── Zoeken ─────────────────────────────────────────────────────────────────

function groepeer(treffers: readonly Treffer[]): Groep[] {
  const uit: Groep[] = [];
  const perSleutel = new Map<string, Groep>();
  for (const t of treffers) {
    const sleutel = `${t.doel.vak}|${t.doel.onderwerpNr}`;
    let g = perSleutel.get(sleutel);
    if (!g) {
      g = { sleutel, vak: t.doel.vak, onderwerp: t.doel.onderwerp, treffers: [] };
      perSleutel.set(sleutel, g);
      uit.push(g);
    }
    g.treffers.push(t);
  }
  return uit;
}

/**
 * Zoekt in de doelen. Met `eigenEind` (het eindmoment van de klas) staan de doelen van dat moment vóór gelijke
 * treffers van andere momenten.
 */
export function zoekDoelen(doelen: readonly ZoekDoel[], vraag: Vraag, opties: { eigenEind?: Eindmoment } = {}): Uitslag {
  const uitslag: Uitslag = {
    vraag,
    treffers: [],
    groepen: [],
    deels: [],
    deelsGroepen: [],
    versoepeld: false,
    alleenVak: false,
    alleenMoment: false,
    leeg: false,
    ookGezocht: [],
  };
  const eigen = opties.eigenEind;
  const vroeg = (d: ZoekDoel): number => (eigen !== undefined && d.eind === eigen ? 0 : 1);
  const kort = (d: ZoekDoel): Treffer => ({ doel: d, score: 0, termen: 0, viaTabel: [] });

  // een doelnummer of een code: dat doel, of die code op elk moment
  if (vraag.id !== undefined || vraag.code !== undefined) {
    const code = vraag.code;
    const gevonden = doelen.filter((d) => (vraag.id !== undefined ? d.id === vraag.id : d.code === code || d.code.startsWith(`${code}.`)));
    uitslag.treffers = gevonden
      .map(kort)
      .sort((a, b) => EINDMOMENTEN.indexOf(a.doel.eind) - EINDMOMENTEN.indexOf(b.doel.eind) || codeVergelijk(a.doel.code, b.doel.code) || (a.doel.id < b.doel.id ? -1 : 1));
    uitslag.groepen = groepeer(uitslag.treffers);
    return uitslag;
  }

  const kandidaten = doelen.filter((d) => (!vraag.vakken || vraag.vakken.includes(d.vak)) && (!vraag.eind || vraag.eind.includes(d.eind)));

  if (vraag.termen.length === 0) {
    if (vraag.vakken) uitslag.alleenVak = true;
    else if (vraag.eind) uitslag.alleenMoment = true;
    else {
      uitslag.leeg = true;
      return uitslag;
    }
    uitslag.treffers = kandidaten
      .map(kort)
      .sort((a, b) => vroeg(a.doel) - vroeg(b.doel) || EINDMOMENTEN.indexOf(a.doel.eind) - EINDMOMENTEN.indexOf(b.doel.eind) || codeVergelijk(a.doel.code, b.doel.code) || (a.doel.id < b.doel.id ? -1 : 1));
    uitslag.groepen = groepeer(uitslag.treffers);
    return uitslag;
  }

  // Bij meer dan één woord telt een woord alleen mee voor "met al je woorden" als het sterk past (zie `gewicht`): anders
  // komt een doel dat één woord via een synoniem in een voorbeeld raakt, boven het doel dat de leerkracht zoekt.
  const meer = vraag.termen.length > 1;
  // Bij meer dan één woord weegt elk woord naar hoe zeldzaam het is in de kandidaten (een woord als 'maken' staat in heel
  // veel doelen en zegt weinig; 'schaduw' of 'licht' zegt veel). Bij één woord verandert dat de volgorde niet.
  const gewichten = vraag.termen.map((t) => {
    if (!meer) return 1;
    const df = kandidaten.reduce((n, d) => (gewicht(d, t).w > 0 ? n + 1 : n), 0);
    return Math.log((kandidaten.length + 1) / (df + 1)) + 1;
  });
  const alle: Treffer[] = [];
  for (const doel of kandidaten) {
    let score = 0;
    let termen = 0;
    const via: string[] = [];
    vraag.termen.forEach((t, i) => {
      const g = gewicht(doel, t);
      // Een zwakke treffer (alleen een tabelwoord in een voorbeeld of de woordenschat) telt bij meer woorden maar voor een kwart.
      score += g.w * gewichten[i] * (meer && !g.sterk ? 0.25 : 1);
      if (g.w > 0 && (!meer || g.sterk)) termen++;
      for (const x of g.via) if (!via.includes(x)) via.push(x);
    });
    // Een doel dat alleen zwak past, blijft achteraan in de deeltreffers staan.
    if (termen > 0 || score > 0) alle.push({ doel, score, termen, viaTabel: via });
  }
  const volgorde = (a: Treffer, b: Treffer): number =>
    b.termen - a.termen ||
    b.score - a.score ||
    vroeg(a.doel) - vroeg(b.doel) ||
    a.doel.doelzin.length - b.doel.doelzin.length ||
    codeVergelijk(a.doel.code, b.doel.code) ||
    (a.doel.id < b.doel.id ? -1 : a.doel.id > b.doel.id ? 1 : 0);
  alle.sort(volgorde);

  const n = vraag.termen.length;
  uitslag.treffers = alle.filter((t) => t.termen === n);
  if (n > 1 && uitslag.treffers.length < MIN_TREFFERS) {
    uitslag.deels = alle.filter((t) => t.termen < n);
    uitslag.versoepeld = uitslag.deels.length > 0;
  }
  uitslag.groepen = groepeer(uitslag.treffers);
  uitslag.deelsGroepen = groepeer(uitslag.deels);

  const via = new Set<string>();
  for (const t of [...uitslag.treffers, ...uitslag.deels]) for (const x of t.viaTabel) via.add(x.startsWith('=') ? x.slice(1) : x);
  uitslag.ookGezocht = [...via];
  return uitslag;
}

/** Maakt van een doel van het deel een zoekdoel. De tekst komt uit de blokken van doeltekst.ts, nooit uit htmlNaarTekst. */
export function zoekDoelVan(d: DoelBasis): ZoekDoel {
  const tekst = (html: string): string => blokkenAlsTekst(doeltekstBlokken(html));
  const z: ZoekDoel = {
    id: d.id,
    code: d.code,
    setId: d.setId,
    eind: d.eind,
    vak: d.vak,
    onderwerpNr: d.onderwerpNr,
    onderwerp: d.onderwerp,
    doelzin: tekst(d.doelzinHtml),
  };
  if (d.subthema !== undefined) z.subthema = d.subthema;
  if (d.uitbreidingHtml !== undefined) z.uitbreiding = tekst(d.uitbreidingHtml);
  if (d.woordenschatHtml !== undefined) z.woordenschat = tekst(d.woordenschatHtml);
  return z;
}
