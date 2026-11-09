// De validator van de bestanden in public/basis/go/ (docs/basisonderwijs/GO-LEERPLAN.md, "Gegevensmodel").
//
// Zuiver en zonder crypto, zoals valideerSetBestand in src/lib/minimumdoelen.ts. Dezelfde validator draait in de import
// (tools/basis/go/maak.ts, vóór het schrijven), in de uitrolpoort (goBestanden.test.ts) en in de app bij het laden.
// Een lege lijst betekent 'in orde'. Een validator gooit nooit: loopt er toch iets vast, dan wordt het bestand
// geweigerd met één melding.
//
// Wat hij afdwingt:
// - Strikt: een onbekend veld is een fout. Zo glipt er nooit metadata mee (namen van makers, Drive-id's).
// - Waarden: enums, codepatronen en lengtegrenzen; leeftijden zonder dubbels en in volgorde.
// - Leerplan: codes van 001 tot N met het voorvoegsel van het bestand; rubrieken en ouders zoals ze uit de
//   bronvolgorde volgen; inhoud tussen het doel en de volgende doel- of rubriekrij.
// - Koppeling: elke code uit de bronkolommen staat precies één keer verantwoord (officiële ref of probleem); een
//   voorstel hoort bij een probleem met hetzelfde moment en dezelfde letterlijke bronCode; de twijfel
//   'moment-buiten-leeftijden' staat er als en alleen als de regel van momentPastBijLeeftijden dat zegt.
// - Tekst: `opmaak` geeft samen precies `tekst`; aangrenzende stukken met dezelfde opmaak zijn samengevoegd.
// - Lesplan: elke wijzer bestaat, en de afgeleide tekst staat letterlijk op die plek.
// - Persoonsgegevens: geen e-mailadres en geen telefoonnummer (smal patroon, nagerekend op de echte bron).
import { GO_LEEFTIJDEN, isLeeftijdenlijst, leeftijdenLabel, leeftijdLabel, momentPastBijLeeftijden } from './leeftijden';
import {
  GO_ICONEN,
  GO_MOMENTEN,
  GO_NAAMSVERMELDING,
  GO_RUBRIEK_SOORTEN,
  GO_TWIJFELS,
  GO_VAK_CODES,
  GO_VAKKEN,
  KENNISVERWERKINGEN,
  isGoVak,
  type Blok,
  type Cel,
  type GoIcoon,
  type GoLeeftijd,
  type GoLeerplandoel,
  type GoLesplanBestand,
  type GoMoment,
  type GoRubriekSoort,
  type GoVak,
  type Regel,
  type TekstStuk,
  type Wijzer,
} from './types';

const MAX_FOUTEN = 100;
/** Ruim boven de langste tekst in de bron (842 tekens in een MIA, ±520 in een lesplanalinea). */
const MAX_TEKST = 10000;
/** Codes, namen, titels, lessenlijnen. */
const MAX_KORT = 300;
/** De codekolommen van één rij. */
const MAX_CODEKOLOM = 1000;
const MAX_INDEX = 100000;

const RE_SHA = /^[0-9a-f]{64}$/;
const RE_LEERPLANDOEL = /^(?:AA|BU|FR|GE|IT|LL|LO|MV|NL|SV|WI|WT)\.\d{3}$/;
const RE_LESPLAN = /^LP\d{4}[a-z]?$/;
const RE_FICHE = /^DF[A-Z]{2}\d{3}$/;
const RE_SET = /^ODS_\d+$/;
const RE_ID = /^[1-9]\d*$/;
/** Een code van een minimumdoel van het basisonderwijs: vak 1 tot 10, dan twee getallen. */
const RE_MINIMUMDOEL_CODE = /^(?:[1-9]|10)\.\d+\.\d+$/;
/** De vorm cijfer.cijfer.cijfer: wat niet zo is, is 'onleesbaar'. */
const RE_CODEVORM = /^\d+\.\d+\.\d+$/;
const RE_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DATUMTIJD = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/;
const RE_MEDIANAAM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const RE_BEELDBESTAND = /^beelden\/[A-Za-z0-9][A-Za-z0-9_-]{0,199}\.(?:webp|png|jpg)$/;
const RE_STUDIO_URL = /^https:\/\/studio\.g-o\.be\/[^\s"'<>\\]*$/;

type Obj = Record<string, unknown>;

// ── Meldingen ────────────────────────────────────────────────────────
class Melder {
  readonly fouten: string[] = [];
  private meer = 0;

  fout(pad: string, bericht: string): void {
    if (this.fouten.length < MAX_FOUTEN) this.fouten.push(pad ? `${pad}: ${bericht}` : bericht);
    else this.meer++;
  }

  get aantal(): number {
    return this.fouten.length + this.meer;
  }

  uitkomst(): string[] {
    return this.meer > 0 ? [...this.fouten, `… en nog ${this.meer} fouten`] : [...this.fouten];
  }
}

/** Voert een controle uit die nooit gooit: loopt ze vast, dan wordt het bestand geweigerd. */
function veilig(controle: (m: Melder) => void, json: unknown): string[] {
  const m = new Melder();
  try {
    controle(m);
    for (const p of zoekPersoonsgegevens(json)) m.fout(p.pad, p.soort === 'e-mail' ? 'lijkt een e-mailadres te bevatten' : 'lijkt een telefoonnummer te bevatten');
  } catch (e) {
    return [`De controle liep vast (${e instanceof Error ? e.message : String(e)}); het bestand wordt geweigerd.`];
  }
  return m.uitkomst();
}

function kort(v: unknown, max = 60): string {
  let s: string;
  try {
    s = typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v));
  } catch {
    s = typeof v; // bv. een kringverwijzing in een object in het geheugen
  }
  return s.length > max ? `${s.slice(0, max - 3)}…` : s;
}

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function heeft(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
}

/** Een object met precies deze velden: elk verplicht veld aanwezig, geen onbekend veld. */
function object(m: Melder, v: unknown, pad: string, verplicht: readonly string[], optioneel: readonly string[] = []): Obj | undefined {
  if (!isObj(v)) {
    m.fout(pad, 'is geen object');
    return undefined;
  }
  const toegelaten = new Set([...verplicht, ...optioneel]);
  for (const k of Object.keys(v)) if (!toegelaten.has(k)) m.fout(pad, `onbekend veld "${kort(k)}"`);
  for (const k of verplicht) if (!heeft(v, k)) m.fout(pad, `veld "${k}" ontbreekt`);
  return v;
}

function isTekst(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Een tekst die niet leeg of alleen witruimte is, hoogstens `max` tekens. Letterlijk: witruimte vooraan of achteraan mag. */
function tekst(m: Melder, v: unknown, pad: string, max = MAX_TEKST): string | undefined {
  if (!isTekst(v)) {
    m.fout(pad, 'moet een niet-lege tekst zijn');
    return undefined;
  }
  if (v.length > max) {
    m.fout(pad, `is langer dan ${max} tekens`);
    return undefined;
  }
  return v;
}

function patroon(m: Melder, v: unknown, pad: string, re: RegExp, wat: string): string | undefined {
  if (typeof v !== 'string' || !re.test(v)) {
    m.fout(pad, `${kort(v)} is geen ${wat}`);
    return undefined;
  }
  return v;
}

function keuze<T extends string>(m: Melder, v: unknown, pad: string, waarden: readonly T[], wat: string): T | undefined {
  if (typeof v !== 'string' || !(waarden as readonly string[]).includes(v)) {
    m.fout(pad, `${kort(v)} is geen ${wat} (${waarden.join(', ')})`);
    return undefined;
  }
  return v as T;
}

function geheel(m: Melder, v: unknown, pad: string, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    m.fout(pad, `${kort(v)} is geen geheel getal van ${min} tot ${max}`);
    return undefined;
  }
  return v;
}

function lijst(m: Melder, v: unknown, pad: string, nietLeeg = false): unknown[] | undefined {
  if (!Array.isArray(v)) {
    m.fout(pad, 'is geen lijst');
    return undefined;
  }
  if (nietLeeg && v.length === 0) {
    m.fout(pad, 'is leeg');
    return undefined;
  }
  // Een gat (een lijst in het geheugen na `delete`) zou forEach stil overslaan; JSON kent geen gaten.
  for (let i = 0; i < v.length; i++) {
    if (!(i in v)) {
      m.fout(`${pad}[${i}]`, 'ontbreekt (een gat in de lijst)');
      return undefined;
    }
  }
  return v;
}

function vast(m: Melder, o: Obj, k: string, pad: string, waarde: unknown): void {
  if (heeft(o, k) && o[k] !== waarde) m.fout(pad, `"${k}" moet ${JSON.stringify(waarde)} zijn`);
}

function sha(m: Melder, v: unknown, pad: string): void {
  patroon(m, v, pad, RE_SHA, 'geldige sha-256 (64 kleine hexadecimale tekens)');
}

/** Een bestaande kalenderdag, zonder Date (de zuivere modules van src/lib/basis raken de klok niet aan). */
function isGeldigeDatum(j: string, mnd: string, d: string): boolean {
  const jaar = Number(j);
  const maand = Number(mnd);
  const dag = Number(d);
  if (jaar < 2000 || jaar > 2200 || maand < 1 || maand > 12 || dag < 1) return false;
  const schrikkel = (jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0;
  const dagen = maand === 2 ? (schrikkel ? 29 : 28) : [4, 6, 9, 11].includes(maand) ? 30 : 31;
  return dag <= dagen;
}

function datum(m: Melder, v: unknown, pad: string): void {
  const r = typeof v === 'string' ? RE_DATUM.exec(v) : null;
  if (!r || !isGeldigeDatum(r[1], r[2], r[3])) m.fout(pad, `${kort(v)} is geen geldige datum (JJJJ-MM-DD)`);
}

function datumTijd(m: Melder, v: unknown, pad: string): void {
  const r = typeof v === 'string' ? RE_DATUMTIJD.exec(v) : null;
  if (!r || !isGeldigeDatum(r[1], r[2], r[3])) m.fout(pad, `${kort(v)} is geen geldige ISO-datum`);
}

function leeftijden(m: Melder, v: unknown, pad: string, nietLeeg: boolean): GoLeeftijd[] | undefined {
  if (!isLeeftijdenlijst(v)) {
    m.fout(pad, `moet een lijst leeftijden zijn, zonder dubbels en in volgorde (${GO_LEEFTIJDEN.join(', ')})`);
    return undefined;
  }
  if (nietLeeg && v.length === 0) {
    m.fout(pad, 'moet minstens één leeftijd hebben');
    return undefined;
  }
  return v;
}

/** Een lijst teksten zonder dubbels; `re` geeft het patroon van elke tekst. */
function unieke(m: Melder, v: unknown, pad: string, opties: { re?: RegExp; wat?: string; nietLeeg?: boolean; oplopend?: boolean }): string[] | undefined {
  const l = lijst(m, v, pad, opties.nietLeeg);
  if (!l) return undefined;
  const uit: string[] = [];
  const gezien = new Set<string>();
  l.forEach((x, i) => {
    const p = `${pad}[${i}]`;
    const s = opties.re ? patroon(m, x, p, opties.re, opties.wat ?? 'geldige waarde') : tekst(m, x, p, MAX_KORT);
    if (s === undefined) return;
    if (gezien.has(s)) m.fout(p, `"${kort(s)}" staat er meer dan één keer`);
    else if (opties.oplopend && uit.length > 0 && uit[uit.length - 1] > s) m.fout(p, `"${kort(s)}" staat niet in oplopende volgorde`);
    gezien.add(s);
    uit.push(s);
  });
  return uit;
}

function isVeiligeBestandsnaam(v: unknown, extensie: string): v is string {
  if (typeof v !== 'string' || v.length > 200 || !v.endsWith(extensie) || v.length === extensie.length) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 32 || c === 127 || v[i] === '/' || v[i] === '\\') return false;
  }
  return v.trim() === v;
}

// ── Tekst en opmaak ──────────────────────────────────────────────────
const TEKST_VLAGGEN = ['b', 'i', 'u', 's', 'sup'] as const;

function vlaggenVan(s: TekstStuk): string {
  return TEKST_VLAGGEN.filter((f) => s[f] === true).join(',');
}

function isTekstStuk(s: unknown): s is TekstStuk {
  return isObj(s) && typeof s.t === 'string';
}

/** Een stuk; geeft zijn soort terug, of undefined als het fout is. */
function stuk(m: Melder, v: unknown, pad: string, alleenTekst: boolean): 'tekst' | 'br' | 'icoon' | undefined {
  if (!isObj(v)) {
    m.fout(pad, 'is geen stuk');
    return undefined;
  }
  if (heeft(v, 't')) {
    const o = object(m, v, pad, ['t'], TEKST_VLAGGEN);
    if (!o) return undefined;
    let goed = true;
    if (typeof o.t !== 'string' || o.t === '') {
      m.fout(pad, '"t" moet een niet-lege tekst zijn');
      goed = false;
    } else if (o.t.length > MAX_TEKST) {
      m.fout(pad, `"t" is langer dan ${MAX_TEKST} tekens`);
      goed = false;
    }
    for (const f of TEKST_VLAGGEN) {
      if (heeft(o, f) && o[f] !== true) {
        m.fout(pad, `"${f}" staat er alleen als het true is`);
        goed = false;
      }
    }
    return goed ? 'tekst' : undefined;
  }
  if (alleenTekst) {
    m.fout(pad, 'hier mogen alleen tekststukken staan');
    return undefined;
  }
  if (heeft(v, 'br')) {
    const o = object(m, v, pad, ['br']);
    if (!o || o.br !== true) {
      m.fout(pad, '"br" moet true zijn');
      return undefined;
    }
    return 'br';
  }
  if (heeft(v, 'icoon')) {
    const o = object(m, v, pad, ['icoon']);
    if (!o || keuze(m, o.icoon, `${pad}.icoon`, GO_ICONEN, 'geldig icoon') === undefined) return undefined;
    return 'icoon';
  }
  m.fout(pad, 'is geen tekst, regeleinde of icoon');
  return undefined;
}

/**
 * Een Regel: niet leeg, geldige stukken, aangrenzende tekststukken met dezelfde opmaak samengevoegd. Met `zichtbaar`
 * moet er tekst (niet alleen witruimte) of een icoon in staan: geen lege alinea's.
 */
function regel(m: Melder, v: unknown, pad: string, opties: { alleenTekst: boolean; zichtbaar: boolean }): Regel | undefined {
  const l = lijst(m, v, pad, true);
  if (!l) return undefined;
  let goed = true;
  let zichtbaar = false;
  let vorige: string | undefined;
  l.forEach((s, i) => {
    const soort = stuk(m, s, `${pad}[${i}]`, opties.alleenTekst);
    if (soort === undefined) {
      goed = false;
      vorige = undefined;
      return;
    }
    if (soort === 'tekst' && isTekstStuk(s)) {
      const vl = vlaggenVan(s);
      if (vorige === vl) {
        m.fout(`${pad}[${i}]`, 'heeft dezelfde opmaak als het stuk ervoor en is niet samengevoegd');
        goed = false;
      }
      vorige = vl;
      if (s.t.trim() !== '') zichtbaar = true;
    } else {
      vorige = undefined;
      if (soort === 'icoon') zichtbaar = true;
    }
  });
  if (opties.zichtbaar && goed && !zichtbaar) {
    m.fout(pad, 'bevat geen tekst en geen icoon (lege alinea)');
    goed = false;
  }
  return goed ? (l as Regel) : undefined;
}

/**
 * De velden `tekst` en `opmaak` van een letterlijke tekst uit een doelenset. `opmaak` staat er alleen als er een
 * opgemaakt stuk in zit, en geeft samen precies `tekst`.
 */
function goTekst(m: Melder, o: Obj, pad: string): string | undefined {
  const t = tekst(m, o.tekst, `${pad}.tekst`);
  if (heeft(o, 'opmaak')) {
    const r = regel(m, o.opmaak, `${pad}.opmaak`, { alleenTekst: true, zichtbaar: false });
    if (r) {
      const stukken = r as TekstStuk[];
      if (!stukken.some((s) => vlaggenVan(s) !== '')) m.fout(`${pad}.opmaak`, 'heeft geen opgemaakt stuk; laat "opmaak" dan weg');
      if (t !== undefined && stukken.map((s) => s.t).join('') !== t) m.fout(`${pad}.opmaak`, 'geeft samen niet precies dezelfde tekst als "tekst"');
    }
  }
  return t;
}

/** De tekst van een Regel: tekststukken letterlijk, een regeleinde als '\n', een icoon als niets. */
export function regelTekst(r: Regel): string {
  let uit = '';
  for (const s of r) {
    if ('t' in s) uit += s.t;
    else if ('br' in s) uit += '\n';
  }
  return uit;
}

export function blokTekst(b: Blok): string {
  switch (b.soort) {
    case 'kop':
    case 'alinea':
      return regelTekst(b.tekst);
    case 'lijst':
      return b.items.map(regelTekst).join('\n');
    case 'tabel':
      return b.rijen.map((rij) => rij.map(celTekst).join('\n')).join('\n');
    default:
      return '';
  }
}

export function celTekst(c: Cel): string {
  return c.blokken.map(blokTekst).join('\n');
}

/** Witruimte (ook een harde spatie) als één spatie: om een stapnaam te vergelijken ('2.' + NBSP + 'Voorkeursinstructie'). */
function gewoneSpaties(s: string): string {
  return s.replace(/\s+/g, ' ');
}

/** Wat een wijzer aanwijst: een blok, een cel of een lijstitem; undefined als hij naar niets wijst. */
function opWijzer(lesplan: { delen: GoLesplanBestand['delen'] }, w: Wijzer): { blok: Blok } | { cel: Cel } | { item: Regel } | undefined {
  const deel = Array.isArray(lesplan.delen) ? lesplan.delen.find((d) => d.nr === w.deel) : undefined;
  const blok = deel?.blokken[w.blok];
  if (!blok) return undefined;
  const inTabel = w.rij !== undefined || w.kolom !== undefined;
  if (w.regel !== undefined && !inTabel) return undefined;
  let doel: Blok | Cel;
  if (inTabel) {
    if (w.rij === undefined || w.kolom === undefined || blok.soort !== 'tabel') return undefined;
    const cel = blok.rijen[w.rij]?.[w.kolom];
    if (!cel) return undefined;
    if (w.regel !== undefined) {
      const b = cel.blokken[w.regel];
      if (!b) return undefined;
      doel = b;
    } else {
      doel = cel;
    }
  } else {
    doel = blok;
  }
  if (w.item !== undefined) {
    if (!('soort' in doel) || doel.soort !== 'lijst') return undefined;
    const item = doel.items[w.item];
    return item ? { item } : undefined;
  }
  return 'soort' in doel ? { blok: doel } : { cel: doel };
}

/**
 * De tekst op de plek van een wijzer, of undefined als de wijzer naar niets wijst. Een wijzer naar een cel geeft de
 * tekst van de hele cel; met `regel` die van één blok in de cel; met `item` die van één lijstitem.
 */
export function tekstOpWijzer(lesplan: { delen: GoLesplanBestand['delen'] }, w: Wijzer): string | undefined {
  const doel = opWijzer(lesplan, w);
  if (!doel) return undefined;
  if ('item' in doel) return regelTekst(doel.item);
  return 'blok' in doel ? blokTekst(doel.blok) : celTekst(doel.cel);
}

/** De Regel op de plek van een wijzer: een kop, een alinea of een lijstitem. Anders undefined. */
export function regelOpWijzer(lesplan: { delen: GoLesplanBestand['delen'] }, w: Wijzer): Regel | undefined {
  const doel = opWijzer(lesplan, w);
  if (!doel) return undefined;
  if ('item' in doel) return doel.item;
  if ('blok' in doel && (doel.blok.soort === 'kop' || doel.blok.soort === 'alinea')) return doel.blok.tekst;
  return undefined;
}

/** De regels van een tekst, elk met gewone spaties en zonder witruimte vooraan of achteraan. */
function regelsVan(s: string): string[] {
  return s.split('\n').map((r) => gewoneSpaties(r).trim());
}

/**
 * Het vette begin van een regel: de eerste vette stukken na een opsommingsteken of witruimte. Zo staat de titel van een
 * activiteit van 'Trainen' in alle vijf de vormen ('Titel', '• Titel', 'Titel tekst…', 'Titel' + regeleinde + tekst).
 */
export function vetBegin(r: Regel): string {
  let i = 0;
  while (i < r.length) {
    const s = r[i];
    if ('icoon' in s || ('t' in s && s.b !== true && /^[\s•·o–-]*$/u.test(s.t))) i++;
    else break;
  }
  let uit = '';
  for (; i < r.length; i++) {
    const s = r[i];
    if (!('t' in s) || s.b !== true) break;
    uit += s.t;
  }
  return gewoneSpaties(uit).trim();
}

/** Staat de code (al nagekeken op RE_LEERPLANDOEL) in de tekst, zonder cijfer erachter? */
function bevatCode(tekst: string, code: string): boolean {
  return new RegExp(`(?<![A-Z])${code.replace('.', '\\.')}(?!\\d)`).test(tekst);
}

/** Begint `vanaf` niet na het einde van `tot`? Een veld dat bij `tot` ontbreekt, betekent: tot het einde van dat deel. */
export function wijzerVoorOfGelijk(vanaf: Wijzer, tot: Wijzer): boolean {
  const velden = ['deel', 'blok', 'rij', 'kolom', 'regel', 'item'] as const;
  for (const f of velden) {
    const a = vanaf[f];
    const b = tot[f];
    if (a === undefined && b === undefined) continue;
    const x = a ?? -1;
    const y = b ?? Number.POSITIVE_INFINITY;
    if (x !== y) return x < y;
  }
  return true;
}

// ── Codes splitsen (dezelfde regel als de import) ────────────────────
/** De codekolommen van een rij: gesplitst op komma, zonder witruimte rond elk deel, lege delen weg. */
export function splitsCodes(bron: string): string[] {
  return bron
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** De kolommen VLAGGEN en SCHAKELS: gesplitst op komma of puntkomma. */
export function splitsVerwijzingen(bron: string): string[] {
  return bron
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * 'Zonder minimumdoel' (rechtzetting 2 van de rechter): noch de doelzin, noch een MIA- of voorbeeldrij van het doel
 * draagt een code. Een doel met alleen een kapotte code is 'kapot', niet 'zonder minimumdoel'.
 */
export function isZonderMinimumdoel(doel: GoLeerplandoel): boolean {
  return Object.keys(doel.minimumdoelen.bron).length === 0 && doel.inhoud.every((i) => !('koppeling' in i) || i.koppeling === undefined);
}

// ── Persoonsgegevens ─────────────────────────────────────────────────
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
/**
 * Belgische telefoonnummers, smal: een datum ('03/07/2018') of een groot getal ('1 412 164 992') mag nooit treffen.
 * Vóór het nummer geen letter, cijfer, punt, komma of schuine streep; erna geen letter, cijfer of decimaal. Zonder de
 * grens op letters zou een sha-256 in hex ('…a0912345678f…') kunnen treffen.
 */
const RE_TELEFOON: readonly RegExp[] = [
  // +32 9 123 45 67, 0032 475 12 34 56, +32 (0)9 …
  /(?<![\p{L}\p{N}.,/+])(?:\+|00)32[ ./-]?(?:\(0\)[ .]?)?[1-9](?:[ ./-]?\d){7,8}(?![\p{L}\p{N}]|[.,]\d)/u,
  // gsm: 0475 12 34 56, 0475/12.34.56, 0475123456
  /(?<![\p{L}\p{N}.,/])04[5-9]\d(?:[ ./-]?\d){6}(?![\p{L}\p{N}]|[.,]\d)/u,
  // vast, zone van één cijfer: 09 123 45 67, 02/123.45.67
  /(?<![\p{L}\p{N}.,/])0[2349][ /.]?\d{3}[ .]?\d{2}[ .]?\d{2}(?![\p{L}\p{N}]|[.,]\d)/u,
  // vast, zone van twee cijfers: 050 12 34 56, 015/12.34.56
  /(?<![\p{L}\p{N}.,/])0[1-9]\d[ /.]?\d{2}[ .]?\d{2}[ .]?\d{2}(?![\p{L}\p{N}]|[.,]\d)/u,
];

function persoonsgegeven(s: string): 'e-mail' | 'telefoon' | undefined {
  if (s.includes('@') && RE_EMAIL.test(s)) return 'e-mail';
  if (/\d{2}/.test(s.replace(/[ ./-]/g, '')) && RE_TELEFOON.some((re) => re.test(s))) return 'telefoon';
  return undefined;
}

/**
 * Zoekt in elke tekst (waarden en sleutels) naar een e-mailadres of een telefoonnummer. Geeft alleen de plaats terug,
 * nooit het gevonden nummer: een melding mag zelf geen persoonsgegeven verspreiden.
 */
export function zoekPersoonsgegevens(json: unknown): { pad: string; soort: 'e-mail' | 'telefoon' }[] {
  const uit: { pad: string; soort: 'e-mail' | 'telefoon' }[] = [];
  const gezien = new WeakSet<object>();
  const stapel: [unknown, string][] = [[json, '']];
  while (stapel.length > 0) {
    const [v, pad] = stapel.pop() as [unknown, string];
    if (typeof v === 'string') {
      const soort = persoonsgegeven(v);
      if (soort) uit.push({ pad: pad || '(bestand)', soort });
    } else if (typeof v === 'object' && v !== null) {
      if (gezien.has(v)) continue;
      gezien.add(v);
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i--) stapel.push([v[i], `${pad}[${i}]`]);
      } else {
        const sleutels = Object.keys(v);
        for (let i = sleutels.length - 1; i >= 0; i--) {
          const k = sleutels[i];
          const p = pad ? `${pad}.${k}` : k;
          const soort = persoonsgegeven(k);
          if (soort) uit.push({ pad: `${pad || '(bestand)'} (sleutel)`, soort });
          stapel.push([(v as Obj)[k], p]);
        }
      }
    }
  }
  return uit;
}

// ── Koppeling naar minimumdoelen ─────────────────────────────────────
function twijfels(m: Melder, v: unknown, pad: string): string[] | undefined {
  const l = lijst(m, v, pad, true);
  if (!l) return undefined;
  const uit: string[] = [];
  let vorige = -1;
  l.forEach((x, i) => {
    const t = keuze(m, x, `${pad}[${i}]`, GO_TWIJFELS, 'geldige twijfel');
    if (t === undefined) return;
    const plaats = GO_TWIJFELS.indexOf(t);
    if (plaats <= vorige) m.fout(`${pad}[${i}]`, 'twijfels staan zonder dubbels en in de volgorde van GO_TWIJFELS');
    vorige = Math.max(vorige, plaats);
    uit.push(t);
  });
  return uit;
}

/** De twijfel 'moment-buiten-leeftijden' staat er als en alleen als het moment niet bij de leeftijden past. */
function controleerLeeftijdTwijfel(m: Melder, pad: string, moment: GoMoment, lft: readonly GoLeeftijd[], tw: readonly string[] | undefined): void {
  const moet = !momentPastBijLeeftijden(moment, lft);
  const staat = (tw ?? []).includes('moment-buiten-leeftijden');
  if (moet && !staat) m.fout(pad, `het moment ${moment} past niet bij ${leeftijdenLabel(lft) || 'geen leeftijden'}: twijfel 'moment-buiten-leeftijden' ontbreekt`);
  if (!moet && staat) m.fout(pad, `twijfel 'moment-buiten-leeftijden' klopt niet: ${moment} past bij ${leeftijdenLabel(lft)}`);
}

/**
 * Een GoKoppeling. `lft` zijn de leeftijden van het doel (ook voor een koppeling op een MIA-rij, die zelf geen
 * leeftijd heeft). Met `nietLeeg` moet er een bron zijn (een koppeling op een inhoudsrij).
 */
function koppeling(m: Melder, v: unknown, pad: string, lft: readonly GoLeeftijd[] | undefined, nietLeeg: boolean): void {
  const o = object(m, v, pad, ['bron', 'refs', 'problemen']);
  if (!o) return;
  const codes = new Map<GoMoment, string[]>();
  if (!isObj(o.bron)) {
    m.fout(`${pad}.bron`, 'is geen object');
  } else {
    for (const k of Object.keys(o.bron)) {
      if (!(GO_MOMENTEN as readonly string[]).includes(k)) {
        m.fout(`${pad}.bron`, `onbekend moment "${kort(k)}"`);
        continue;
      }
      const t = tekst(m, o.bron[k], `${pad}.bron.${k}`, MAX_CODEKOLOM);
      if (t === undefined) continue;
      const delen = splitsCodes(t);
      if (delen.length === 0) m.fout(`${pad}.bron.${k}`, 'bevat geen code');
      codes.set(k as GoMoment, delen);
    }
    if (nietLeeg && Object.keys(o.bron).length === 0) m.fout(`${pad}.bron`, 'is leeg; laat de koppeling dan weg');
  }

  // Welke (moment, code) is verantwoord, en hoe.
  const officieel = new Set<string>();
  const probleem = new Set<string>();
  const voorstel = new Set<string>();
  const sleutel = (mo: string, c: string) => `${mo}\u0000${c}`;
  const inBron = (mo: GoMoment | undefined, c: string | undefined) => mo !== undefined && c !== undefined && (codes.get(mo) ?? []).includes(c);

  const problemen = lijst(m, o.problemen, `${pad}.problemen`);
  problemen?.forEach((p, i) => {
    const pp = `${pad}.problemen[${i}]`;
    const po = object(m, p, pp, ['moment', 'bronCode', 'reden']);
    if (!po) return;
    const mo = keuze(m, po.moment, `${pp}.moment`, GO_MOMENTEN, 'geldig moment');
    const bc = tekst(m, po.bronCode, `${pp}.bronCode`, MAX_KORT);
    const reden = keuze(m, po.reden, `${pp}.reden`, ['bestaat-niet', 'onleesbaar'] as const, 'geldige reden');
    if (mo === undefined || bc === undefined) return;
    if (!inBron(mo, bc)) m.fout(pp, `"${kort(bc)}" staat niet in de bron bij ${mo}`);
    if (reden !== undefined) {
      const juist = RE_CODEVORM.test(bc) ? 'bestaat-niet' : 'onleesbaar';
      if (reden !== juist) m.fout(`${pp}.reden`, `bij "${kort(bc)}" hoort de reden '${juist}'`);
    }
    const s = sleutel(mo, bc);
    if (probleem.has(s)) m.fout(pp, `het probleem ${mo} "${kort(bc)}" staat er meer dan één keer`);
    probleem.add(s);
  });

  const refs = lijst(m, o.refs, `${pad}.refs`);
  const doelen = new Set<string>();
  refs?.forEach((r, i) => {
    const rp = `${pad}.refs[${i}]`;
    const ro = object(m, r, rp, ['set', 'id', 'code', 'moment', 'status'], ['twijfel', 'bronCode']);
    if (!ro) return;
    const set = patroon(m, ro.set, `${rp}.set`, RE_SET, 'geldige set (ODS_…)');
    const id = patroon(m, ro.id, `${rp}.id`, RE_ID, 'geldig vast nummer');
    const code = patroon(m, ro.code, `${rp}.code`, RE_MINIMUMDOEL_CODE, 'geldige code van een minimumdoel');
    const mo = keuze(m, ro.moment, `${rp}.moment`, GO_MOMENTEN, 'geldig moment');
    const status = keuze(m, ro.status, `${rp}.status`, ['officieel', 'voorstel'] as const, 'geldige status');
    const tw = heeft(ro, 'twijfel') ? twijfels(m, ro.twijfel, `${rp}.twijfel`) : undefined;
    if (mo !== undefined && lft !== undefined) controleerLeeftijdTwijfel(m, rp, mo, lft, tw);
    if (set !== undefined && id !== undefined) {
      const s = `${set}/${id}`;
      if (doelen.has(s)) m.fout(rp, `het minimumdoel ${s} staat er meer dan één keer`);
      doelen.add(s);
    }
    if (status === 'officieel') {
      if (heeft(ro, 'bronCode')) m.fout(rp, 'een officiële koppeling heeft geen "bronCode"; de code staat letterlijk in de bron');
      if (mo !== undefined && code !== undefined) {
        if (!inBron(mo, code)) m.fout(rp, `de code ${code} staat niet in de bron bij ${mo}`);
        const s = sleutel(mo, code);
        if (officieel.has(s)) m.fout(rp, `${mo} ${code} staat er meer dan één keer`);
        if (probleem.has(s)) m.fout(rp, `${mo} ${code} staat zowel als koppeling als als probleem`);
        officieel.add(s);
      }
    } else if (status === 'voorstel') {
      const bc = heeft(ro, 'bronCode') ? tekst(m, ro.bronCode, `${rp}.bronCode`, MAX_KORT) : undefined;
      if (!heeft(ro, 'bronCode')) m.fout(rp, 'een voorstel heeft een "bronCode": wat er letterlijk in de bron staat');
      if (mo !== undefined && bc !== undefined) {
        const s = sleutel(mo, bc);
        if (!probleem.has(s)) m.fout(rp, `bij een voorstel hoort een probleem met hetzelfde moment en dezelfde bronCode (${mo} "${kort(bc)}")`);
        if (voorstel.has(s)) m.fout(rp, `er is al een voorstel voor ${mo} "${kort(bc)}"`);
        if (bc === code) m.fout(rp, 'een voorstel stelt een andere code voor dan de bron');
        voorstel.add(s);
      }
    }
  });

  // Elke code uit de bron is verantwoord.
  for (const [mo, delen] of codes) {
    for (const c of delen) {
      const s = sleutel(mo, c);
      if (!officieel.has(s) && !probleem.has(s)) m.fout(pad, `de code "${kort(c)}" bij ${mo} is niet verantwoord (geen koppeling en geen probleem)`);
    }
  }
}

/** De kolom VLAGGEN of SCHAKELS. Een code van het eigen vak moet bestaan; een kapotte waarde van het eigen vak niet. */
function verwijzingen(m: Melder, v: unknown, pad: string, vak: GoVak | undefined, aantal: number): void {
  const o = object(m, v, pad, ['codes', 'kapot'], ['bron']);
  if (!o) return;
  const codes = unieke(m, o.codes, `${pad}.codes`, { re: RE_LEERPLANDOEL, wat: 'geldige code van een leerplandoel' }) ?? [];
  const kapot = unieke(m, o.kapot, `${pad}.kapot`, {}) ?? [];
  const bestaat = (c: string) => vak !== undefined && c.startsWith(`${vak}.`) && Number(c.slice(3)) >= 1 && Number(c.slice(3)) <= aantal;
  const eigen = (c: string) => vak !== undefined && c.startsWith(`${vak}.`);
  if (!heeft(o, 'bron')) {
    if (codes.length > 0 || kapot.length > 0) m.fout(pad, 'zonder "bron" zijn "codes" en "kapot" leeg');
    return;
  }
  const b = tekst(m, o.bron, `${pad}.bron`, MAX_CODEKOLOM);
  if (b === undefined) return;
  const delen = splitsVerwijzingen(b);
  if (delen.length === 0) m.fout(`${pad}.bron`, 'bevat geen verwijzing');
  for (const c of codes) {
    if (!delen.includes(c)) m.fout(`${pad}.codes`, `"${c}" staat niet in de bron`);
    if (eigen(c) && !bestaat(c)) m.fout(`${pad}.codes`, `${c} bestaat niet in dit leerplan; zet het bij "kapot"`);
    if (kapot.includes(c)) m.fout(`${pad}.kapot`, `"${c}" staat ook bij "codes"`);
  }
  for (const k of kapot) {
    if (!delen.includes(k)) m.fout(`${pad}.kapot`, `"${kort(k)}" staat niet in de bron`);
    if (RE_LEERPLANDOEL.test(k) && bestaat(k)) m.fout(`${pad}.kapot`, `${k} bestaat wel; zet het bij "codes"`);
  }
  for (const d of delen) {
    if (!codes.includes(d) && !kapot.includes(d)) m.fout(pad, `"${kort(d)}" uit de bron staat niet bij "codes" en niet bij "kapot"`);
  }
}

// ── Lesplan: blokken ─────────────────────────────────────────────────
function beeld(m: Melder, v: Obj, pad: string): void {
  const status = keuze(m, v.status, `${pad}.status`, ['getoond', 'weggelaten'] as const, 'geldige status');
  if (status === undefined) return;
  const basis = ['soort', 'bron', 'breedte', 'hoogte', 'status'];
  const o = status === 'getoond' ? object(m, v, pad, [...basis, 'bestand', 'alt'], ['uitleg']) : object(m, v, pad, [...basis, 'uitleg']);
  if (!o) return;
  patroon(m, o.bron, `${pad}.bron`, RE_MEDIANAAM, 'geldige naam in word/media');
  geheel(m, o.breedte, `${pad}.breedte`, 1, 20000);
  geheel(m, o.hoogte, `${pad}.hoogte`, 1, 20000);
  if (status === 'getoond') {
    patroon(m, o.bestand, `${pad}.bestand`, RE_BEELDBESTAND, "geldig pad ('beelden/<naam>' op .webp, .png of .jpg)");
    tekst(m, o.alt, `${pad}.alt`);
    if (heeft(o, 'uitleg')) tekst(m, o.uitleg, `${pad}.uitleg`);
  } else {
    tekst(m, o.uitleg, `${pad}.uitleg`);
  }
}

function blok(m: Melder, v: unknown, pad: string, inCel: boolean): void {
  if (!isObj(v)) {
    m.fout(pad, 'is geen blok');
    return;
  }
  switch (v.soort) {
    case 'kop': {
      if (inCel) {
        m.fout(pad, 'een cel bevat geen kop');
        return;
      }
      const o = object(m, v, pad, ['soort', 'niveau', 'tekst']);
      if (!o) return;
      geheel(m, o.niveau, `${pad}.niveau`, 1, 4);
      regel(m, o.tekst, `${pad}.tekst`, { alleenTekst: false, zichtbaar: true });
      return;
    }
    case 'alinea': {
      const o = object(m, v, pad, ['soort', 'tekst']);
      if (o) regel(m, o.tekst, `${pad}.tekst`, { alleenTekst: false, zichtbaar: true });
      return;
    }
    case 'lijst': {
      const o = object(m, v, pad, ['soort', 'genummerd', 'items'], ['start']);
      if (!o) return;
      if (typeof o.genummerd !== 'boolean') m.fout(`${pad}.genummerd`, 'moet true of false zijn');
      if (heeft(o, 'start')) {
        if (o.genummerd !== true) m.fout(`${pad}.start`, 'alleen een genummerde lijst heeft een start');
        geheel(m, o.start, `${pad}.start`, 2, 1000);
      }
      lijst(m, o.items, `${pad}.items`, true)?.forEach((it, i) => regel(m, it, `${pad}.items[${i}]`, { alleenTekst: false, zichtbaar: true }));
      return;
    }
    case 'tabel': {
      if (inCel) {
        m.fout(pad, 'een cel bevat geen tabel');
        return;
      }
      const o = object(m, v, pad, ['soort', 'rijen']);
      if (o) tabel(m, o.rijen, `${pad}.rijen`);
      return;
    }
    case 'beeld':
      beeld(m, v, pad);
      return;
    default:
      m.fout(pad, `onbekende soort blok ${kort(v.soort)}`);
  }
}

function tabel(m: Melder, v: unknown, pad: string): void {
  const rijen = lijst(m, v, pad, true);
  if (!rijen) return;
  let breedte: number | undefined;
  const samen: (string | undefined)[][] = [];
  rijen.forEach((rij, r) => {
    const rp = `${pad}[${r}]`;
    const cellen = lijst(m, rij, rp, true);
    samen.push([]);
    if (!cellen) return;
    if (breedte === undefined) breedte = cellen.length;
    else if (cellen.length !== breedte) m.fout(rp, `heeft ${cellen.length} cellen, de eerste rij ${breedte}`);
    cellen.forEach((c, k) => {
      const cp = `${rp}[${k}]`;
      const o = object(m, c, cp, ['rol', 'blokken'], ['samengevoegd']);
      if (!o) return;
      keuze(m, o.rol, `${cp}.rol`, ['kolomkop', 'rijkop', 'data'] as const, 'geldige rol');
      const sg = heeft(o, 'samengevoegd') ? keuze(m, o.samengevoegd, `${cp}.samengevoegd`, ['begin', 'vervolg'] as const, 'geldige samenvoeging') : undefined;
      samen[r][k] = sg;
      const blokken = lijst(m, o.blokken, `${cp}.blokken`);
      blokken?.forEach((b, i) => blok(m, b, `${cp}.blokken[${i}]`, true));
      if (sg === 'vervolg' && blokken && blokken.length > 0) m.fout(cp, 'een vervolgcel van een samenvoeging is leeg (anders verdwijnt er tekst)');
    });
  });
  samen.forEach((rij, r) => {
    rij.forEach((sg, k) => {
      if (sg === 'vervolg') {
        const boven = r > 0 ? samen[r - 1][k] : undefined;
        if (boven !== 'begin' && boven !== 'vervolg') m.fout(`${pad}[${r}][${k}]`, "een vervolgcel staat onder een cel met 'begin' of 'vervolg'");
      } else if (sg === 'begin') {
        if (samen[r + 1]?.[k] !== 'vervolg') m.fout(`${pad}[${r}][${k}]`, "onder een cel met 'begin' staat een vervolgcel");
      }
    });
  });
}

function wijzer(m: Melder, v: unknown, pad: string): Wijzer | undefined {
  const o = object(m, v, pad, ['deel', 'blok'], ['rij', 'kolom', 'regel', 'item']);
  if (!o) return undefined;
  const fouten = m.aantal;
  for (const k of ['deel', 'blok', 'rij', 'kolom', 'regel', 'item']) if (heeft(o, k)) geheel(m, o[k], `${pad}.${k}`, 0, MAX_INDEX);
  if (heeft(o, 'rij') !== heeft(o, 'kolom')) m.fout(pad, '"rij" en "kolom" staan er samen of niet');
  if (heeft(o, 'regel') && !heeft(o, 'rij')) m.fout(pad, '"regel" (een blok in een cel) kan alleen met "rij" en "kolom"');
  return m.aantal === fouten ? (o as unknown as Wijzer) : undefined;
}

// ── Lesplan ──────────────────────────────────────────────────────────
function bronBestand(m: Melder, v: unknown, pad: string, extensie: string, naam?: string): void {
  const o = object(m, v, pad, ['naam', 'bytes', 'sha256', 'datum']);
  if (!o) return;
  if (!isVeiligeBestandsnaam(o.naam, extensie)) m.fout(`${pad}.naam`, `${kort(o.naam)} is geen bestandsnaam op ${extensie} (zonder pad)`);
  else if (naam !== undefined && o.naam !== naam) m.fout(`${pad}.naam`, `moet "${naam}" zijn`);
  geheel(m, o.bytes, `${pad}.bytes`, 1, 200_000_000);
  sha(m, o.sha256, `${pad}.sha256`);
  datumTijd(m, o.datum, `${pad}.datum`);
}

/** De delen van een lesplan; geeft true als ze structureel in orde zijn (dan kunnen de wijzers nagekeken worden). */
function delen(m: Melder, v: unknown, pad: string): boolean {
  const fouten = m.aantal;
  const l = lijst(m, v, pad, true);
  if (!l) return false;
  l.forEach((d, i) => {
    const dp = `${pad}[${i}]`;
    const o = object(m, d, dp, ['nr', 'blokken']);
    if (!o) return;
    if (o.nr !== i) m.fout(`${dp}.nr`, `moet ${i} zijn (de delen lopen door vanaf 0)`);
    const blokken = lijst(m, o.blokken, `${dp}.blokken`, true);
    blokken?.forEach((b, j) => {
      const bp = `${dp}.blokken[${j}]`;
      blok(m, b, bp, false);
      if (!isObj(b)) return;
      const niveau = b.soort === 'kop' ? b.niveau : undefined;
      if (j === 0) {
        const verwacht = i === 0 ? 1 : 2;
        if (niveau !== verwacht) m.fout(bp, `deel ${i} begint met een kop van niveau ${verwacht}`);
      } else if (niveau === 1 || niveau === 2) {
        m.fout(bp, `een kop van niveau ${String(niveau)} staat alleen bovenaan een deel`);
      } else if (i === 0 && niveau !== undefined) {
        m.fout(bp, 'deel 0 (de kop van het lesplan) heeft geen tussenkoppen');
      }
    });
  });
  return m.aantal === fouten;
}

/**
 * Controleert een afgeleide tekst op zijn plek. `plek` undefined: de wijzer wijst naar niets. `klopt` krijgt de tekst
 * van de plek; `wat` en `beschrijving` dienen voor de melding.
 */
function opZijnPlek(m: Melder, pad: string, plek: string | undefined, klopt: (plek: string) => boolean, beschrijving: string, wat: string): void {
  if (plek === undefined) m.fout(pad, 'de wijzer wijst naar niets');
  else if (!klopt(plek)) m.fout(pad, `${beschrijving} "${kort(wat, 200)}" staat niet letterlijk op die plek`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** De labels van de metaregels in deel 0 ('Vakdiscipline: Wetenschap en techniek'). */
const METAREGELS = { vakdiscipline: 'Vakdiscipline', lessenlijn: 'Lessenlijn', lessenreeks: 'Lessenreeks' } as const;

function iconenIn(blokken: readonly Blok[]): Set<GoIcoon> {
  const uit = new Set<GoIcoon>();
  const regelIconen = (r: Regel) => r.forEach((s) => 'icoon' in s && uit.add(s.icoon));
  const bezoek = (b: Blok) => {
    if (b.soort === 'kop' || b.soort === 'alinea') regelIconen(b.tekst);
    else if (b.soort === 'lijst') b.items.forEach(regelIconen);
    else if (b.soort === 'tabel') b.rijen.forEach((rij) => rij.forEach((c) => c.blokken.forEach(bezoek)));
  };
  blokken.forEach(bezoek);
  return uit;
}

/**
 * De afgeleide gegevens: eerst de vorm, daarna (als de delen in orde zijn) of alles letterlijk op zijn plek staat. Zo
 * strikt als de bron toelaat: een ingekorte tekst ('Biologie' voor 'Biologie van organismen') geldt niet.
 */
function afgeleid(m: Melder, v: unknown, pad: string, lesplan: GoLesplanBestand | undefined): void {
  const o = object(m, v, pad, [
    'vakdiscipline',
    'vak',
    'lessenlijn',
    'lessenreeks',
    'didactischeFiches',
    'leerplandoelen',
    'diplomas',
    'deelconcepten',
    'goConcepten',
    'vlaggen',
    'schakels',
    'stappen',
    'trainen',
    'materiaal',
  ]);
  if (!o) return;
  const opPlek = (w: Wijzer | undefined) => (w && lesplan ? tekstOpWijzer(lesplan, w) : undefined);
  const deelTekst = (nr: number) => {
    const d = lesplan?.delen.find((x) => x.nr === nr);
    return d ? d.blokken.map(blokTekst).join('\n') : undefined;
  };
  const kop = deelTekst(0);
  const samenhang = deelTekst(3);
  const gewoon = (s: string) => gewoneSpaties(s).trim();

  const vak = keuze(m, o.vak, `${pad}.vak`, GO_VAK_CODES, 'geldige vakdiscipline');
  const vakdiscipline = tekst(m, o.vakdiscipline, `${pad}.vakdiscipline`, MAX_KORT);
  if (vak !== undefined && vakdiscipline !== undefined && vakdiscipline !== GO_VAKKEN[vak].naam) m.fout(`${pad}.vakdiscipline`, `moet "${GO_VAKKEN[vak].naam}" zijn bij ${vak}`);
  for (const k of ['vakdiscipline', 'lessenlijn', 'lessenreeks'] as const) {
    const t = k === 'vakdiscipline' ? vakdiscipline : tekst(m, o[k], `${pad}.${k}`, MAX_KORT);
    if (t === undefined || !lesplan) continue;
    const regel = `${METAREGELS[k]}: ${gewoon(t)}`;
    opZijnPlek(m, `${pad}.${k}`, kop, (p) => regelsVan(p).includes(regel), 'de regel', regel);
  }

  const fiches = lijst(m, o.didactischeFiches, `${pad}.didactischeFiches`, true);
  const ficheCodes = new Set<string>();
  fiches?.forEach((f, i) => {
    const fp = `${pad}.didactischeFiches[${i}]`;
    const fo = object(m, f, fp, ['code', 'titel']);
    if (!fo) return;
    const code = patroon(m, fo.code, `${fp}.code`, RE_FICHE, 'geldige code van een didactische fiche (DF<vak><3 cijfers>)');
    const titel = tekst(m, fo.titel, `${fp}.titel`, MAX_KORT);
    if (code !== undefined) {
      if (ficheCodes.has(code)) m.fout(fp, `de fiche ${code} staat er meer dan één keer`);
      ficheCodes.add(code);
    }
    if (code === undefined || titel === undefined || !lesplan) return;
    // 'Didactische fiche: DFWT005 Titel; DFWT004 Titel (GO! Navigator > …)': de titel loopt tot ';', ' (' of het einde.
    const re = new RegExp(`(?:^|: |; )${escapeRegExp(`${code} ${gewoon(titel)}`)}(?=;| \\(|$)`);
    opZijnPlek(m, fp, kop, (p) => regelsVan(p).some((r) => re.test(r)), 'de fiche', `${code} ${titel}`);
  });

  const doelen = lijst(m, o.leerplandoelen, `${pad}.leerplandoelen`, true);
  const doelCodes = new Set<string>();
  doelen?.forEach((d, i) => {
    const dp = `${pad}.leerplandoelen[${i}]`;
    const dobj = object(m, d, dp, ['code', 'kennisverwerking', 'leeftijden', 'tekst', 'waar']);
    if (!dobj) return;
    const code = patroon(m, dobj.code, `${dp}.code`, RE_LEERPLANDOEL, 'geldige code van een leerplandoel');
    const kv = keuze(m, dobj.kennisverwerking, `${dp}.kennisverwerking`, KENNISVERWERKINGEN, 'geldige kennisverwerking');
    const lft = leeftijden(m, dobj.leeftijden, `${dp}.leeftijden`, true);
    const t = tekst(m, dobj.tekst, `${dp}.tekst`);
    const w = wijzer(m, dobj.waar, `${dp}.waar`);
    if (code !== undefined) {
      if (doelCodes.has(code)) m.fout(dp, `${code} staat er meer dan één keer`);
      doelCodes.add(code);
    }
    if (!lesplan || !w || code === undefined || kv === undefined || lft === undefined || t === undefined) return;
    // De doelregel van deel 2, precies: 'WT.001 [begrijpen] Herkennen het organisme dier. (2,5-4 jaar)'.
    const r = regelOpWijzer(lesplan, w);
    const verwacht = `${code} [${kv}] ${gewoon(t)} (${leeftijdenLabel(lft)})`;
    if (r === undefined) m.fout(`${dp}.waar`, opPlek(w) === undefined ? 'de wijzer wijst naar niets' : 'de wijzer wijst geen alinea of lijstitem aan');
    else if (gewoon(regelTekst(r)) !== verwacht) m.fout(`${dp}.waar`, `de doelregel moet precies "${kort(verwacht, 400)}" zijn, er staat "${kort(gewoon(regelTekst(r)), 400)}"`);
  });

  lijst(m, o.diplomas, `${pad}.diplomas`)?.forEach((d, i) => {
    const dp = `${pad}.diplomas[${i}]`;
    const dobj = object(m, d, dp, ['naam', 'leeftijd', 'ikDoelen', 'waar']);
    if (!dobj) return;
    const naam = tekst(m, dobj.naam, `${dp}.naam`, MAX_KORT);
    const lft = keuze(m, dobj.leeftijd, `${dp}.leeftijd`, GO_LEEFTIJDEN, 'geldige leeftijd');
    const w = wijzer(m, dobj.waar, `${dp}.waar`);
    const plek = opPlek(w);
    const meten = Boolean(lesplan && w);
    if (meten && naam !== undefined && lft !== undefined) {
      // '… vanuit het diploma: De dierenkenner 2,5-4 jaar' of een regel met alleen 'De dierenkenner 2,5-4 jaar'.
      const kopregel = `${gewoon(naam)} ${leeftijdLabel(lft)}`;
      opZijnPlek(m, `${dp}.waar`, plek, (p) => regelsVan(p).some((r) => r === kopregel || r.endsWith(`: ${kopregel}`)), 'het diploma', kopregel);
    }
    const ikCodes = new Set<string>();
    lijst(m, dobj.ikDoelen, `${dp}.ikDoelen`, true)?.forEach((ik, j) => {
      const ip = `${dp}.ikDoelen[${j}]`;
      const io = object(m, ik, ip, ['code', 'zinnen']);
      if (!io) return;
      const code = patroon(m, io.code, `${ip}.code`, RE_LEERPLANDOEL, 'geldige code van een leerplandoel');
      if (code !== undefined) {
        if (ikCodes.has(code)) m.fout(ip, `${code} staat meer dan één keer bij dit diploma`);
        ikCodes.add(code);
        if (meten) opZijnPlek(m, `${ip}.code`, plek, (p) => bevatCode(p, code), 'de code', code);
      }
      lijst(m, io.zinnen, `${ip}.zinnen`, true)?.forEach((z, k) => {
        const zin = tekst(m, z, `${ip}.zinnen[${k}]`);
        if (zin !== undefined && meten) opZijnPlek(m, `${ip}.zinnen[${k}]`, plek, (p) => gewoneSpaties(p).includes(gewoon(zin)), 'de zin', zin);
      });
    });
  });

  // Een deelconcept is een hele regel in deel 3; een GO! concept een hele regel of het begin ervan tot een dubbelpunt.
  unieke(m, o.deelconcepten, `${pad}.deelconcepten`, {})?.forEach((x, i) => {
    if (lesplan) opZijnPlek(m, `${pad}.deelconcepten[${i}]`, samenhang, (p) => regelsVan(p).includes(gewoon(x)), 'het deelconcept (deel 3)', x);
  });
  unieke(m, o.goConcepten, `${pad}.goConcepten`, {})?.forEach((x, i) => {
    const g = gewoon(x);
    if (lesplan) opZijnPlek(m, `${pad}.goConcepten[${i}]`, samenhang, (p) => regelsVan(p).some((r) => r === g || r.startsWith(`${g}:`)), 'het GO! concept (deel 3)', x);
  });
  const iconen = lesplan?.delen.find((x) => x.nr === 3)?.blokken;
  for (const [k, icoon] of [
    ['vlaggen', 'vlag'],
    ['schakels', 'schakel'],
  ] as const) {
    const l = unieke(m, o[k], `${pad}.${k}`, { re: RE_LEERPLANDOEL, wat: 'geldige code van een leerplandoel' });
    if (!lesplan || !l) continue;
    l.forEach((c, i) => opZijnPlek(m, `${pad}.${k}[${i}]`, samenhang, (p) => bevatCode(p, c), 'de code (deel 3)', c));
    const heeftIcoon = iconen ? iconenIn(iconen).has(icoon) : false;
    if (l.length > 0 && !heeftIcoon) m.fout(`${pad}.${k}`, `deel 3 heeft geen pictogram ${icoon}`);
    if (l.length === 0 && heeftIcoon) m.fout(`${pad}.${k}`, `deel 3 heeft een pictogram ${icoon}, maar de lijst is leeg`);
  }

  lijst(m, o.stappen, `${pad}.stappen`, true)?.forEach((s, i) => {
    const sp = `${pad}.stappen[${i}]`;
    const so = object(m, s, sp, ['nr', 'naam', 'wat', 'hoe']);
    if (!so) return;
    if (so.nr !== i + 1 || i >= 6) m.fout(`${sp}.nr`, `moet ${i + 1} zijn (de stappen lopen door vanaf 1, hoogstens 6)`);
    const naam = tekst(m, so.naam, `${sp}.naam`, MAX_KORT);
    for (const k of ['wat', 'hoe']) {
      const w = wijzer(m, so[k], `${sp}.${k}`);
      if (!lesplan || !w || naam === undefined) continue;
      // De eerste regel van de cel is precies 'nummer. naam'; een harde spatie telt als spatie, witruimte achteraan mag.
      const stap = `${i + 1}. ${gewoon(naam)}`;
      opZijnPlek(m, `${sp}.${k}`, opPlek(w), (p) => regelsVan(p)[0] === stap, 'de stap', stap);
    }
  });

  lijst(m, o.trainen, `${pad}.trainen`)?.forEach((t, i) => {
    const tp = `${pad}.trainen[${i}]`;
    const to = object(m, t, tp, ['vanaf', 'tot'], ['titel']);
    if (!to) return;
    const vanaf = wijzer(m, to.vanaf, `${tp}.vanaf`);
    const tot = wijzer(m, to.tot, `${tp}.tot`);
    const titel = heeft(to, 'titel') ? tekst(m, to.titel, `${tp}.titel`, MAX_KORT) : undefined;
    if (!lesplan || !vanaf || !tot) return;
    if (opPlek(vanaf) === undefined) m.fout(`${tp}.vanaf`, 'de wijzer wijst naar niets');
    else if (titel !== undefined) {
      // De titel is precies het vette begin van de alinea of het lijstitem waar de activiteit begint.
      const r = regelOpWijzer(lesplan, vanaf);
      if (r === undefined) m.fout(`${tp}.vanaf`, 'de wijzer wijst geen alinea of lijstitem aan');
      else if (vetBegin(r) !== gewoon(titel)) m.fout(`${tp}.vanaf`, `de titel "${kort(titel)}" is niet het vette begin van die regel ("${kort(vetBegin(r))}")`);
    }
    if (opPlek(tot) === undefined) m.fout(`${tp}.tot`, 'de wijzer wijst naar niets');
    if (vanaf.deel !== tot.deel) m.fout(tp, '"vanaf" en "tot" liggen in hetzelfde deel');
    else if (!wijzerVoorOfGelijk(vanaf, tot)) m.fout(tp, '"vanaf" ligt na "tot"');
  });

  const mat = wijzer(m, o.materiaal, `${pad}.materiaal`);
  if (lesplan && mat && opPlek(mat) === undefined) m.fout(`${pad}.materiaal`, 'de wijzer wijst naar niets');
}

/** valideerGoLesplan: public/basis/go/lesplannen/<code>.json. */
export function valideerGoLesplan(json: unknown): string[] {
  return veilig((m) => {
    const o = object(m, json, '', ['app', 'kind', 'v', 'code', 'titel', 'leeftijd', 'delen', 'afgeleid', 'bron', 'sha256']);
    if (!o) return;
    vast(m, o, 'app', '', 'boosterz');
    vast(m, o, 'kind', '', 'go-lesplan');
    vast(m, o, 'v', '', 1);
    const code = patroon(m, o.code, 'code', RE_LESPLAN, 'geldige lesplancode (LP0000 of LP0000a)');
    const titel = tekst(m, o.titel, 'titel', MAX_KORT);
    const lft = keuze(m, o.leeftijd, 'leeftijd', GO_LEEFTIJDEN, 'geldige leeftijd');
    const delenGoed = delen(m, o.delen, 'delen');
    const lesplan = delenGoed ? (o as unknown as GoLesplanBestand) : undefined;
    if (lesplan && code !== undefined && titel !== undefined && lft !== undefined) {
      const h1 = lesplan.delen[0].blokken[0];
      const verwacht = `Lesplan ${code} ${titel} (${leeftijdLabel(lft)})`;
      if (h1.soort === 'kop' && regelTekst(h1.tekst).trim() !== verwacht) m.fout('delen[0].blokken[0]', `de titel moet "${kort(verwacht)}" zijn`);
    }
    afgeleid(m, o.afgeleid, 'afgeleid', lesplan);
    const bron = object(m, o.bron, 'bron', ['net', 'naamsvermelding', 'waar', 'url', 'bestand', 'ingelezen']);
    if (bron) {
      vast(m, bron, 'net', 'bron', 'GO!');
      vast(m, bron, 'naamsvermelding', 'bron', GO_NAAMSVERMELDING);
      vast(m, bron, 'waar', 'bron', 'GO! studio');
      patroon(m, bron.url, 'bron.url', RE_STUDIO_URL, 'geldige link naar GO! studio (https://studio.g-o.be/…)');
      bronBestand(m, bron.bestand, 'bron.bestand', '.docx', code !== undefined ? `${code}.docx` : undefined);
      datum(m, bron.ingelezen, 'bron.ingelezen');
    }
    sha(m, o.sha256, 'sha256');
  }, json);
}

// ── Leerplan ─────────────────────────────────────────────────────────
const INHOUD_VELDEN: Readonly<Record<string, { verplicht: readonly string[]; optioneel: readonly string[] }>> = {
  'mia-titel': { verplicht: ['soort', 'tekst', 'rij'], optioneel: ['opmaak', 'koppeling'] },
  mia: { verplicht: ['soort', 'tekst', 'aanklikbaar', 'rij'], optioneel: ['opmaak', 'koppeling'] },
  begrip: { verplicht: ['soort', 'tekst', 'leeftijden', 'rij'], optioneel: ['opmaak'] },
  'voorbeelden-titel': { verplicht: ['soort', 'tekst', 'rij'], optioneel: ['opmaak', 'koppeling'] },
  voorbeeld: { verplicht: ['soort', 'tekst', 'rij'], optioneel: ['opmaak', 'koppeling'] },
  voetnoot: { verplicht: ['soort', 'tekst', 'rij'], optioneel: ['opmaak'] },
};
const INHOUD_SOORTEN = Object.keys(INHOUD_VELDEN);
const VIA_SOORTEN = ['mia-titel', 'mia', 'voorbeelden-titel', 'voorbeeld'] as const;

const pad3 = (n: number) => String(n).padStart(3, '0');

/** valideerGoLeerplan: public/basis/go/leerplan/<vak>.json. */
export function valideerGoLeerplan(json: unknown): string[] {
  return veilig((m) => {
    const o = object(m, json, '', ['app', 'kind', 'v', 'vak', 'naam', 'rubrieken', 'doelen', 'bron', 'sha256']);
    if (!o) return;
    vast(m, o, 'app', '', 'boosterz');
    vast(m, o, 'kind', '', 'go-leerplan');
    vast(m, o, 'v', '', 1);
    const vak = keuze(m, o.vak, 'vak', GO_VAK_CODES, 'geldige vakdiscipline');
    const naam = tekst(m, o.naam, 'naam', MAX_KORT);
    if (vak !== undefined && naam !== undefined && naam !== GO_VAKKEN[vak].naam) m.fout('naam', `moet "${GO_VAKKEN[vak].naam}" zijn bij ${vak}`);

    // Rubrieken: volgnummer, rij oplopend, ouder = de dichtstbijzijnde rubriek erboven van een hoger niveau.
    const rubrieken: { id: string; rij: number }[] = [];
    const stapel: { id: string; niveau: number }[] = [];
    lijst(m, o.rubrieken, 'rubrieken')?.forEach((r, i) => {
      const rp = `rubrieken[${i}]`;
      const ro = object(m, r, rp, ['id', 'soort', 'tekst', 'rij'], ['opmaak', 'ouder']);
      if (!ro) return;
      const id = vak !== undefined ? `${vak}-r${pad3(i + 1)}` : undefined;
      if (id !== undefined && ro.id !== id) m.fout(`${rp}.id`, `moet "${id}" zijn (een volgnummer in bronvolgorde)`);
      const soort = keuze<GoRubriekSoort>(m, ro.soort, `${rp}.soort`, GO_RUBRIEK_SOORTEN, 'geldige soort rubriek');
      goTekst(m, ro, rp);
      const rij = geheel(m, ro.rij, `${rp}.rij`, 1, 1_000_000);
      if (rij !== undefined && rubrieken.length > 0 && rij <= rubrieken[rubrieken.length - 1].rij) m.fout(`${rp}.rij`, 'de rubrieken staan in bronvolgorde (rij oplopend)');
      if (soort === undefined || id === undefined || rij === undefined) return;
      const niveau = GO_RUBRIEK_SOORTEN.indexOf(soort);
      while (stapel.length > 0 && stapel[stapel.length - 1].niveau >= niveau) stapel.pop();
      const ouder = stapel.length > 0 ? stapel[stapel.length - 1].id : undefined;
      if (ouder === undefined && heeft(ro, 'ouder')) m.fout(`${rp}.ouder`, 'er staat geen rubriek van een hoger niveau boven; laat "ouder" weg');
      if (ouder !== undefined && ro.ouder !== ouder) m.fout(`${rp}.ouder`, `moet "${ouder}" zijn (de dichtstbijzijnde rubriek erboven van een hoger niveau)`);
      stapel.push({ id, niveau });
      rubrieken.push({ id, rij });
    });

    const doelen = lijst(m, o.doelen, 'doelen', true) ?? [];
    const aantal = doelen.length;
    // De rijen van de doelen, om de inhoud af te bakenen tot de volgende doel- of rubriekrij.
    const doelRijen = doelen.map((d) => (isObj(d) && typeof d.rij === 'number' ? d.rij : undefined));
    const ankers = [...rubrieken.map((r) => r.rij), ...doelRijen.filter((r): r is number => r !== undefined)].sort((a, b) => a - b);
    const volgendAnker = (rij: number) => ankers.find((a) => a > rij);
    let vorigeRij = 0;
    doelen.forEach((d, i) => {
      const verwachteCode = vak !== undefined ? `${vak}.${pad3(i + 1)}` : undefined;
      const dp = `doelen[${i}]${isObj(d) && typeof d.code === 'string' ? ` (${kort(d.code)})` : ''}`;
      const dobj = object(m, d, dp, ['code', 'tekst', 'rij', 'kennisverwerking', 'leeftijden', 'rubriek', 'inhoud', 'minimumdoelen', 'vlaggen', 'schakels'], ['opmaak']);
      if (!dobj) return;
      if (verwachteCode !== undefined && dobj.code !== verwachteCode) m.fout(`${dp}.code`, `moet "${verwachteCode}" zijn (de codes lopen door van 001 tot ${pad3(aantal)})`);
      goTekst(m, dobj, dp);
      const rij = geheel(m, dobj.rij, `${dp}.rij`, 1, 1_000_000);
      keuze(m, dobj.kennisverwerking, `${dp}.kennisverwerking`, KENNISVERWERKINGEN, 'geldige kennisverwerking');
      const lft = leeftijden(m, dobj.leeftijden, `${dp}.leeftijden`, true);
      if (rij !== undefined) {
        if (rij <= vorigeRij) m.fout(`${dp}.rij`, 'de doelen staan in bronvolgorde (rij oplopend)');
        if (rubrieken.some((r) => r.rij === rij)) m.fout(`${dp}.rij`, 'op die rij staat een rubriek');
        vorigeRij = Math.max(vorigeRij, rij);
        const erboven = rubrieken.filter((r) => r.rij < rij);
        const verwacht = erboven.length > 0 ? erboven[erboven.length - 1].id : undefined;
        if (verwacht === undefined) m.fout(`${dp}.rubriek`, 'er staat geen rubriek boven dit doel');
        else if (dobj.rubriek !== verwacht) m.fout(`${dp}.rubriek`, `moet "${verwacht}" zijn (de laatste rubriek erboven)`);
      }

      // Inhoud: tussen het doel en de volgende doel- of rubriekrij, rij oplopend.
      const grens = rij !== undefined ? volgendAnker(rij) : undefined;
      let vorigeInhoud = rij ?? 0;
      lijst(m, dobj.inhoud, `${dp}.inhoud`)?.forEach((x, j) => {
        const ip = `${dp}.inhoud[${j}]`;
        if (!isObj(x)) {
          m.fout(ip, 'is geen object');
          return;
        }
        const soort = keuze(m, x.soort, `${ip}.soort`, INHOUD_SOORTEN, 'geldige soort inhoud');
        if (soort === undefined) return;
        const io = object(m, x, ip, INHOUD_VELDEN[soort].verplicht, INHOUD_VELDEN[soort].optioneel);
        if (!io) return;
        goTekst(m, io, ip);
        const ir = geheel(m, io.rij, `${ip}.rij`, 1, 1_000_000);
        if (ir !== undefined) {
          if (ir <= vorigeInhoud) m.fout(`${ip}.rij`, 'staat niet na het doel en na de inhoud ervoor');
          if (grens !== undefined && ir >= grens) m.fout(`${ip}.rij`, `staat na de volgende doel- of rubriekrij (${grens})`);
          vorigeInhoud = Math.max(vorigeInhoud, ir);
        }
        if (soort === 'mia' && typeof io.aanklikbaar !== 'boolean') m.fout(`${ip}.aanklikbaar`, 'moet true of false zijn');
        if (soort === 'begrip') leeftijden(m, io.leeftijden, `${ip}.leeftijden`, false);
        if (heeft(io, 'koppeling')) koppeling(m, io.koppeling, `${ip}.koppeling`, lft, true);
      });

      koppeling(m, dobj.minimumdoelen, `${dp}.minimumdoelen`, lft, false);
      verwijzingen(m, dobj.vlaggen, `${dp}.vlaggen`, vak, aantal);
      verwijzingen(m, dobj.schakels, `${dp}.schakels`, vak, aantal);
    });

    const bron = object(m, o.bron, 'bron', ['net', 'naamsvermelding', 'waar', 'leerplan', 'bestand', 'ingelezen']);
    if (bron) {
      vast(m, bron, 'net', 'bron', 'GO!');
      vast(m, bron, 'naamsvermelding', 'bron', GO_NAAMSVERMELDING);
      vast(m, bron, 'waar', 'bron', 'GO! Navigator');
      vast(m, bron, 'leerplan', 'bron', 'Het nieuwe GO! leerplan basisonderwijs');
      bronBestand(m, bron.bestand, 'bron.bestand', '.xlsx');
      datum(m, bron.ingelezen, 'bron.ingelezen');
    }
    sha(m, o.sha256, 'sha256');
  }, json);
}

// ── Omgekeerd: per minimumdoel ───────────────────────────────────────
/** valideerGoBijMinimumdoel: public/basis/go/bij-minimumdoel/<vak>.json. */
export function valideerGoBijMinimumdoel(json: unknown): string[] {
  return veilig((m) => {
    const o = object(m, json, '', ['app', 'kind', 'v', 'vak', 'doelen', 'sha256']);
    if (!o) return;
    vast(m, o, 'app', '', 'boosterz');
    vast(m, o, 'kind', '', 'go-bij-minimumdoel');
    vast(m, o, 'v', '', 1);
    geheel(m, o.vak, 'vak', 1, 10);
    if (!isObj(o.doelen)) {
      m.fout('doelen', 'is geen object');
    } else {
      for (const id of Object.keys(o.doelen)) {
        const ip = `doelen.${kort(id)}`;
        if (!RE_ID.test(id)) {
          m.fout(ip, 'de sleutel is het vaste nummer van een minimumdoel (alleen cijfers)');
          continue;
        }
        let vorige: string | undefined;
        lijst(m, o.doelen[id], ip, true)?.forEach((b, i) => {
          const bp = `${ip}[${i}]`;
          const bo = object(m, b, bp, ['code', 'moment', 'status', 'tekst', 'kennisverwerking', 'leeftijden', 'lesplannen'], ['opmaak', 'twijfel', 'bronCode', 'via']);
          if (!bo) return;
          const code = patroon(m, bo.code, `${bp}.code`, RE_LEERPLANDOEL, 'geldige code van een leerplandoel');
          if (code !== undefined) {
            if (vorige !== undefined && code <= vorige) m.fout(`${bp}.code`, 'per minimumdoel staat elke code één keer, oplopend');
            vorige = code;
          }
          const mo = keuze(m, bo.moment, `${bp}.moment`, GO_MOMENTEN, 'geldig moment');
          const status = keuze(m, bo.status, `${bp}.status`, ['officieel', 'voorstel'] as const, 'geldige status');
          const tw = heeft(bo, 'twijfel') ? twijfels(m, bo.twijfel, `${bp}.twijfel`) : undefined;
          if (status === 'voorstel' && !heeft(bo, 'bronCode')) m.fout(bp, 'een voorstel heeft een "bronCode"');
          if (status === 'officieel' && heeft(bo, 'bronCode')) m.fout(bp, 'alleen een voorstel heeft een "bronCode"');
          if (heeft(bo, 'bronCode')) tekst(m, bo.bronCode, `${bp}.bronCode`, MAX_KORT);
          goTekst(m, bo, bp);
          keuze(m, bo.kennisverwerking, `${bp}.kennisverwerking`, KENNISVERWERKINGEN, 'geldige kennisverwerking');
          const lft = leeftijden(m, bo.leeftijden, `${bp}.leeftijden`, true);
          if (mo !== undefined && lft !== undefined) controleerLeeftijdTwijfel(m, bp, mo, lft, tw);
          unieke(m, bo.lesplannen, `${bp}.lesplannen`, { re: RE_LESPLAN, wat: 'geldige lesplancode', oplopend: true });
          if (heeft(bo, 'via')) {
            let vorigeRij = 0;
            lijst(m, bo.via, `${bp}.via`, true)?.forEach((v, j) => {
              const vp = `${bp}.via[${j}]`;
              const vo = object(m, v, vp, ['soort', 'tekst', 'rij'], ['opmaak']);
              if (!vo) return;
              keuze(m, vo.soort, `${vp}.soort`, VIA_SOORTEN, 'geldige soort inhoud met een koppeling');
              goTekst(m, vo, vp);
              const rij = geheel(m, vo.rij, `${vp}.rij`, 1, 1_000_000);
              if (rij !== undefined) {
                if (rij <= vorigeRij) m.fout(`${vp}.rij`, 'staat niet in bronvolgorde');
                vorigeRij = rij;
              }
            });
          }
        });
      }
    }
    sha(m, o.sha256, 'sha256');
  }, json);
}

// ── Index ────────────────────────────────────────────────────────────
/** valideerGoIndex: public/basis/go/index.json. */
export function valideerGoIndex(json: unknown): string[] {
  return veilig((m) => {
    const o = object(m, json, '', ['app', 'kind', 'v', 'naamsvermelding', 'ingelezen', 'leerplan', 'bijMinimumdoel', 'lesplannen']);
    if (!o) return;
    vast(m, o, 'app', '', 'boosterz');
    vast(m, o, 'kind', '', 'go-index');
    vast(m, o, 'v', '', 1);
    vast(m, o, 'naamsvermelding', '', GO_NAAMSVERMELDING);
    datum(m, o.ingelezen, 'ingelezen');

    let vorigVak = -1;
    lijst(m, o.leerplan, 'leerplan')?.forEach((l, i) => {
      const lp = `leerplan[${i}]`;
      const lo = object(m, l, lp, ['vak', 'naam', 'bestand', 'aantal', 'zonderMinimumdoel', 'perLeeftijd', 'bronDatum', 'sha256']);
      if (!lo) return;
      const vak = keuze(m, lo.vak, `${lp}.vak`, GO_VAK_CODES, 'geldige vakdiscipline');
      if (vak !== undefined) {
        const plaats = GO_VAK_CODES.indexOf(vak);
        if (plaats <= vorigVak) m.fout(`${lp}.vak`, 'elk vak één keer, in de volgorde van GO_VAK_CODES');
        vorigVak = Math.max(vorigVak, plaats);
        if (lo.naam !== GO_VAKKEN[vak].naam) m.fout(`${lp}.naam`, `moet "${GO_VAKKEN[vak].naam}" zijn`);
        if (lo.bestand !== `leerplan/${vak}.json`) m.fout(`${lp}.bestand`, `moet "leerplan/${vak}.json" zijn`);
      }
      const aantal = geheel(m, lo.aantal, `${lp}.aantal`, 1, 100000);
      geheel(m, lo.zonderMinimumdoel, `${lp}.zonderMinimumdoel`, 0, aantal ?? 100000);
      const per = object(m, lo.perLeeftijd, `${lp}.perLeeftijd`, GO_LEEFTIJDEN);
      if (per) for (const l of GO_LEEFTIJDEN) if (heeft(per, l)) geheel(m, per[l], `${lp}.perLeeftijd.${l}`, 0, aantal ?? 100000);
      datumTijd(m, lo.bronDatum, `${lp}.bronDatum`);
      sha(m, lo.sha256, `${lp}.sha256`);
    });

    let vorigNr = 0;
    lijst(m, o.bijMinimumdoel, 'bijMinimumdoel')?.forEach((b, i) => {
      const bp = `bijMinimumdoel[${i}]`;
      const bo = object(m, b, bp, ['vak', 'bestand', 'sha256']);
      if (!bo) return;
      const nr = geheel(m, bo.vak, `${bp}.vak`, 1, 10);
      if (nr !== undefined) {
        if (nr <= vorigNr) m.fout(`${bp}.vak`, 'elk vak één keer, oplopend');
        vorigNr = Math.max(vorigNr, nr);
        if (bo.bestand !== `bij-minimumdoel/${nr}.json`) m.fout(`${bp}.bestand`, `moet "bij-minimumdoel/${nr}.json" zijn`);
      }
      sha(m, bo.sha256, `${bp}.sha256`);
    });

    let vorigeCode: string | undefined;
    lijst(m, o.lesplannen, 'lesplannen')?.forEach((l, i) => {
      const lp = `lesplannen[${i}]`;
      const lo = object(m, l, lp, ['code', 'titel', 'leeftijd', 'vak', 'lessenlijn', 'lessenreeks', 'doelen', 'bestand', 'sha256']);
      if (!lo) return;
      const code = patroon(m, lo.code, `${lp}.code`, RE_LESPLAN, 'geldige lesplancode');
      if (code !== undefined) {
        if (vorigeCode !== undefined && code <= vorigeCode) m.fout(`${lp}.code`, 'elk lesplan één keer, oplopend op code');
        vorigeCode = code;
        if (lo.bestand !== `lesplannen/${code}.json`) m.fout(`${lp}.bestand`, `moet "lesplannen/${code}.json" zijn`);
      }
      tekst(m, lo.titel, `${lp}.titel`, MAX_KORT);
      keuze(m, lo.leeftijd, `${lp}.leeftijd`, GO_LEEFTIJDEN, 'geldige leeftijd');
      if (!isGoVak(lo.vak)) m.fout(`${lp}.vak`, `${kort(lo.vak)} is geen geldige vakdiscipline`);
      tekst(m, lo.lessenlijn, `${lp}.lessenlijn`, MAX_KORT);
      tekst(m, lo.lessenreeks, `${lp}.lessenreeks`, MAX_KORT);
      unieke(m, lo.doelen, `${lp}.doelen`, { re: RE_LEERPLANDOEL, wat: 'geldige code van een leerplandoel', nietLeeg: true });
      sha(m, lo.sha256, `${lp}.sha256`);
    });
  }, json);
}
