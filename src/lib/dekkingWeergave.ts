// Teksten en kleine hulpen voor de schermen over de dekking op de minimumdoelen (docs/STUDIERICHTINGEN.md § 14.3 en § 14.5).
//
// Alle zinnen met een getal staan hier, met enkelvoud en meervoud, zodat ze getest zijn en de schermen geen eigen zinnen
// bouwen. Puur: geen React, geen opslag, geen netwerk. De zware modules (dekkingMinimumdoelen, curriculumTypes) komen hier
// alleen als type binnen, want de cursuseditor importeert dit bestand statisch en moet klein blijven.

import type { Curriculum } from './curriculumTypes';
import type { MdDekking, MdRij, MdStatus, NietMeeReden } from './dekkingMinimumdoelen';
import { graadTekst, jaarTekst } from './doelgroep';

// ── Kleine hulpen ───────────────────────────────────────────────────────────

/** "1 doel", "5 doelen". */
export function enkelOfMeer(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`;
}

/** "a", "a en b", "a, b en c". */
export function somLijst(delen: readonly string[]): string {
  return delen.length <= 1 ? (delen[0] ?? '') : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** "‘a’", "‘a’ en ‘b’": de titels van cursussen, elk één keer, in de volgorde waarin ze voorkomen. */
export function titelsLijst(titels: readonly string[]): string {
  return somLijst([...new Set(titels)].map((t) => `‘${t}’`));
}

/** Een lange doeltekst inkorten op een woordgrens, met een beletselteken. Korte tekst blijft zoals ze is. */
export function kortTekst(tekst: string, max = 200): string {
  const t = tekst.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const stuk = t.slice(0, max);
  const spatie = stuk.lastIndexOf(' ');
  return `${(spatie > max * 0.6 ? stuk.slice(0, spatie) : stuk).replace(/[\s,;:.\-–]+$/, '')}…`;
}

/** Een setnaam voor het scherm: nooit een set-id. Een naam die alleen uit een id bestaat, wordt "Een set". */
export function veiligeSetNaam(naam: string): string {
  const t = naam.replace(/\s*\(ODS_\d+\)/g, '').replace(/ODS_\d+/g, 'een set').replace(/\s+/g, ' ').trim();
  if (t === '') return 'Een set';
  return t === 'een set' ? 'Een set' : t;
}

/**
 * Namen die bij meer dan één set voorkomen, krijgen de context erachter (`context` geeft die per set, bv. "Pool · Domein");
 * is er geen context of blijven twee namen gelijk, dan komt er een volgnummer bij. Een unieke naam blijft ongemoeid.
 */
export function uniekeSetNamen(
  sets: readonly { set: string; setNaam: string }[],
  context: (set: string) => string = () => '',
): Map<string, string> {
  const namen = sets.map((s) => veiligeSetNaam(s.setNaam));
  const tellen = new Map<string, number>();
  for (const n of namen) tellen.set(n, (tellen.get(n) ?? 0) + 1);
  const eerste = sets.map((s, i) => {
    if ((tellen.get(namen[i]) ?? 0) < 2) return namen[i];
    const c = veiligeSetNaam(context(s.set)).replace(/^Een set$/, '');
    return c ? `${namen[i]} (${c})` : namen[i];
  });
  const opnieuw = new Map<string, number>();
  for (const n of eerste) opnieuw.set(n, (opnieuw.get(n) ?? 0) + 1);
  const gezien = new Map<string, number>();
  const uit = new Map<string, string>();
  sets.forEach((s, i) => {
    const n = eerste[i];
    if ((opnieuw.get(n) ?? 0) < 2) {
      uit.set(s.set, n);
      return;
    }
    const nr = (gezien.get(n) ?? 0) + 1;
    gezien.set(n, nr);
    uit.set(s.set, `${n} (${nr})`);
  });
  return uit;
}

// ── De status van een doel ──────────────────────────────────────────────────

/** De volledige zin bij een doel (§ 14.3): wie het dekt, wat er gepland staat, of dat het nog open is. */
export function statusTekst(rij: { status: MdStatus; via: readonly { courseTitle: string; status: Exclude<MdStatus, 'open'> }[] }): string {
  const titels = (status: Exclude<MdStatus, 'open'>) => titelsLijst(rij.via.filter((v) => v.status === status).map((v) => v.courseTitle));
  switch (rij.status) {
    case 'gedekt': return `Gedekt in ${titels('gedekt')}`;
    case 'gepland': return `Gepland in ${titels('gepland')} (de sectie is nog leeg)`;
    case 'verdieping': return `Alleen in verdieping (${titels('verdieping')})`;
    default: return 'Nog niet gedekt';
  }
}

export type Toon = 'alle' | 'open';

/** "Nog niet gedekt" is alles wat niet echt gedekt is: ook wat alleen gepland staat of alleen in verdieping aan bod komt. */
export function isNogNietGedekt(status: MdStatus): boolean {
  return status !== 'gedekt';
}

export interface SetGroep {
  set: string;
  setNaam: string;
  /** Alle doelen van de set (ook de optionele), zoals in de samenvatting. */
  totaal: number;
  gedekt: number;
  /** De rijen die bij de keuze "Toon" horen. */
  rijen: MdRij[];
}

/** De doelen per set, in de volgorde van het kader, met alleen de rijen die bij `toon` horen. */
export function groepeerPerSet(dekking: Pick<MdDekking, 'rijen' | 'perSet'>, toon: Toon): SetGroep[] {
  const perSet = new Map<string, MdRij[]>();
  for (const rij of dekking.rijen) {
    if (toon === 'open' && !isNogNietGedekt(rij.status)) continue;
    const lijst = perSet.get(rij.doel.set);
    if (lijst) lijst.push(rij);
    else perSet.set(rij.doel.set, [rij]);
  }
  return dekking.perSet.map((s) => ({ set: s.set, setNaam: s.setNaam, totaal: s.totaal, gedekt: s.gedekt, rijen: perSet.get(s.set) ?? [] }));
}

/**
 * De sets die bij de keuze "Toon" op het scherm staan. Bij "Alle doelen" alle sets; bij "Nog niet gedekt" alleen de sets met
 * minstens één doel dat nog niet gedekt is, want een dichte set zonder iets om te tonen zou de keuze onzichtbaar maken.
 */
export function zichtbareSets(groepen: readonly SetGroep[], toon: Toon): SetGroep[] {
  return toon === 'open' ? groepen.filter((g) => g.rijen.length > 0) : [...groepen];
}

/**
 * De zin boven de sets bij de keuze "Nog niet gedekt": hoeveel doelen in hoeveel sets (de sets zelf staan dicht, dus de zin zegt
 * ook wat er te doen valt). Zonder doelen die nog niet gedekt zijn: "Alle doelen zijn gedekt."
 */
export function nogNietGedektZin(doelen: number, sets: number): string {
  if (doelen <= 0) return 'Alle doelen zijn gedekt.';
  const inSets = enkelOfMeer(sets, 'set', 'sets');
  const open = sets === 1 ? 'de set' : 'een set';
  return doelen === 1
    ? `1 doel in ${inSets} is nog niet gedekt. Open ${open} om het te zien.`
    : `${doelen} doelen in ${inSets} zijn nog niet gedekt. Open ${open} om ze te zien.`;
}

/** De samenvatting van een set: "Biologie: 6 van 8 gedekt". */
export function setSamenvatting(naam: string, gedekt: number, totaal: number): string {
  return `${naam}: ${gedekt} van ${totaal} gedekt`;
}

/** De zin in een set waar niets (meer) te tonen valt. */
export function legeSetTekst(toon: Toon): string {
  return toon === 'open' ? 'Alle doelen van deze set zijn gedekt.' : 'Deze set heeft geen doelen.';
}

// ── De samenvatting ─────────────────────────────────────────────────────────

/** Wat de zinnen nodig hebben van een dekking: een volledige `MdDekking` voldoet. */
export type DekkingTelling = Pick<MdDekking, 'totaal' | 'gedekt' | 'gepland' | 'verdieping' | 'open' | 'percent' | 'optioneel' | 'zelfdeNummerAndereSet'> & {
  rijen: readonly unknown[];
  cursussen: readonly unknown[];
};

/** "de 229 minimumdoelen", en bij één doel "het enige minimumdoel". */
function minimumdoelen(n: number): string {
  return n === 1 ? 'het enige minimumdoel' : `de ${n} minimumdoelen`;
}

/** "<g> doelen staan al gepland op een sectie die nog leeg is, <v> komen alleen in verdieping aan bod, <o> nog niet." */
function restZin(d: Pick<DekkingTelling, 'gepland' | 'verdieping' | 'open'>): string {
  const gepland = d.gepland === 1 ? '1 doel staat al gepland' : `${d.gepland} doelen staan al gepland`;
  const verdieping = d.verdieping === 1 ? '1 komt alleen in verdieping aan bod' : `${d.verdieping} komen alleen in verdieping aan bod`;
  return `${gepland} op een sectie die nog leeg is, ${verdieping}, ${d.open} nog niet.`;
}

function geenDoelenZin(d: Pick<DekkingTelling, 'rijen' | 'totaal'>): string {
  return d.rijen.length === 0 ? 'Er zijn geen minimumdoelen om te dekken.' : 'Er zijn geen verplichte minimumdoelen om te dekken.';
}

/**
 * De samenvatting over alle cursussen van een richting (§ 14.3): "Je cursussen dekken <c> van de <N> minimumdoelen (<p> %)." en,
 * zolang er iets niet gedekt is, "<g> doelen staan al gepland … <o> nog niet.". Zonder cursussen: "Nog geen cursus voor deze
 * richting: de dekking is 0 van de <N> doelen." `jaar` is het jaar waarop de telling beperkt is: dan zegt de zin dat er voor dat
 * jaar nog geen cursus is.
 */
export function samenvattingRichting(d: DekkingTelling, jaar?: number): string {
  if (d.rijen.length === 0 || d.totaal === 0) return geenDoelenZin(d);
  if (d.cursussen.length === 0) {
    const waarvoor = jaar !== undefined && jaarTekst(jaar) ? `het ${jaarTekst(jaar)}` : 'deze richting';
    return `Nog geen cursus voor ${waarvoor}: de dekking is 0 van ${d.totaal === 1 ? 'het enige doel' : `de ${d.totaal} doelen`}.`;
  }
  const eerste = `Je cursussen dekken ${d.gedekt} van ${minimumdoelen(d.totaal)} (${d.percent} %).`;
  return d.gedekt === d.totaal ? eerste : `${eerste} ${restZin(d)}`;
}

/**
 * De richting waarvan een cursus de doelen dekt, voor in de zin hieronder: "Latijn (2de graad)". Zonder graad (buitengewoon
 * onderwijs) alleen de titel.
 */
export function richtingMetGraad(titel: string, graad?: 1 | 2 | 3): string {
  const g = graad !== undefined ? graadTekst(graad) : '';
  return g ? `${titel} (${g})` : titel;
}

/**
 * De samenvatting van één cursus (§ 14.5): "Deze cursus dekt <c> van de <N> minimumdoelen van <richting> (<graad>)." of, voor een
 * cursus zonder richting, "… van de sets van je leerplan." (`van`: "Latijn (2de graad)" of "de sets van je leerplan"). Daarna,
 * zolang er iets niet gedekt is, dezelfde tweede zin als bij de richting.
 */
export function samenvattingCursus(d: DekkingTelling, van: string): string {
  if (d.rijen.length === 0 || d.totaal === 0) return geenDoelenZin(d);
  const eerste = `Deze cursus dekt ${d.gedekt} van ${minimumdoelen(d.totaal)} van ${van}.`;
  return d.gedekt === d.totaal ? eerste : `${eerste} ${restZin(d)}`;
}

/** "Daarnaast zijn er <k> optionele doelen en uitbreidingsdoelen. Die tellen niet mee in het percentage (<j> gedekt)." Leeg zonder zulke doelen. */
export function optioneelZin(o: { totaal: number; gedekt: number }): string {
  if (o.totaal <= 0) return '';
  return o.totaal === 1
    ? `Daarnaast is er 1 optioneel doel of uitbreidingsdoel. Dat telt niet mee in het percentage (${o.gedekt} gedekt).`
    : `Daarnaast zijn er ${o.totaal} optionele doelen en uitbreidingsdoelen. Die tellen niet mee in het percentage (${o.gedekt} gedekt).`;
}

/** "<n> doelen zouden ook meetellen als verwijzingen naar een andere versie of soort van dezelfde set meetellen." Leeg bij 0. */
export function zelfdeNummerZin(n: number): string {
  if (n <= 0) return '';
  return `${n === 1 ? '1 doel zou' : `${n} doelen zouden`} ook meetellen als verwijzingen naar een andere versie of soort van dezelfde set meetellen.`;
}

/** In de 1ste graad tellen het 1ste en het 2de jaar samen (§ 14.3). */
export const EERSTE_GRAAD_ZIN = 'In de 1ste graad tellen de cursussen van het 1ste en het 2de jaar samen: de minimumdoelen gelden voor de hele graad.';

/** De ene zin als een richting geen doelen heeft om tegen te meten (geen kader-sets): geen dekkingsblok, wel een eerlijk antwoord. */
export function geenDekkingTekst(herkomst: string): string {
  return herkomst === 'nog-niet-opgehaald'
    ? 'De doelen van deze richting zijn nog niet opgehaald, dus er valt nog niets te dekken.'
    : 'De officiële bron koppelt geen minimumdoelen aan deze richting, dus er is niets om je cursussen tegen te meten.';
}

/** In de editor: het leerplan noemt geen sets met minimumdoelen, dus er is niets om tegen te meten. */
export const GEEN_SETS_TEKST = 'Het leerplan van deze cursus noemt geen sets met minimumdoelen, dus er is niets om je cursus tegen te meten.';
/** In de editor: de studierichting van de cursus is er niet meer, dus de cursus wordt tegen de sets van haar leerplan gemeten. */
export const RICHTING_ONBEKEND_NOOT = 'De studierichting van deze cursus staat niet (meer) in de officiële matrix. Hieronder staan de sets van je leerplan.';
/** In de editor: de officiële bron koppelt geen minimumdoelen aan de richting van de cursus. */
export const KADER_LEEG_NOOT = 'De officiële bron koppelt geen minimumdoelen aan de studierichting van deze cursus. Hieronder staan de sets van je leerplan.';
/** In de editor: de doelen van de richting van de cursus zijn nog niet opgehaald (dat is iets anders dan: de bron koppelt er geen). */
export const KADER_NOG_NIET_NOOT = 'De doelen van de studierichting van deze cursus zijn nog niet opgehaald. Hieronder staan de sets van je leerplan.';

/** Bij "Tel mee", zolang er geen jaar gekozen is: alleen de telling over de hele graad kan dan. */
export const KIES_JAAR_HINT = 'Kies bij ‘Voor welk jaar?’ een jaar om alleen dat jaar te tellen.';

/** De melding als de setbestanden niet allemaal laadden: zonder alle sets zou de dekking te klein uitvallen. */
export const FOUT_SETS_DEKKING = 'Niet alle sets konden geladen worden, dus de dekking kan nu niet berekend worden. Controleer je verbinding en probeer opnieuw.';
export const LADEN_SETS_DEKKING = 'De sets worden geladen…';
/** In de editor: het onderdeel met de dekking op de minimumdoelen laadde niet. Opnieuw klikken helpt niet, herladen wel. */
export const FOUT_LADEN_DEKKING = 'De dekking op de minimumdoelen kon niet geladen worden. Controleer je verbinding en herlaad de pagina.';

// ── De cursussen ────────────────────────────────────────────────────────────

/** De reden waarom een cursus niet meetelt (§ 14.3). `leerplanTitel` hoort bij 'geen-verwijzingen'. */
export function redenTekst(reden: NietMeeReden, leerplanTitel?: string): string {
  switch (reden) {
    case 'geen-leerplan': return 'Telt niet mee: deze cursus hangt aan geen leerplan. Kies er een in de instellingen van de cursus.';
    case 'leerplan-ontbreekt': return 'Telt niet mee: het leerplan van deze cursus staat niet op dit toestel.';
    default: return leerplanTitel
      ? `Telt niet mee: het leerplan ‘${leerplanTitel}’ verwijst niet naar minimumdoelen.`
      : 'Telt niet mee: het leerplan van deze cursus verwijst niet naar minimumdoelen.';
  }
}

/** "<k> verwijzingen van deze cursus horen niet bij deze richting, of wijzen naar een andere versie van een set." Leeg bij 0. */
export function buitenKaderTekst(k: number): string {
  if (k <= 0) return '';
  return k === 1
    ? '1 verwijzing van deze cursus hoort niet bij deze richting, of wijst naar een andere versie van een set.'
    : `${k} verwijzingen van deze cursus horen niet bij deze richting, of wijzen naar een andere versie van een set.`;
}

export interface CursusRegelIn {
  telt: boolean;
  reden?: NietMeeReden;
  draagtBij: number;
  buitenKader: number;
  leerplanTitel?: string;
}

/** Wat bij een cursus staat: "Telt mee voor <n> doelen" of de reden, en eventueel de zin over verwijzingen buiten het kader. */
export function cursusRegel(c: CursusRegelIn): { hoofd: string; extra?: string } {
  if (!c.telt) return { hoofd: redenTekst(c.reden ?? 'geen-leerplan', c.leerplanTitel) };
  const extra = buitenKaderTekst(c.buitenKader);
  return { hoofd: `Telt mee voor ${enkelOfMeer(c.draagtBij, 'doel', 'doelen')}`, ...(extra ? { extra } : {}) };
}

/** Een cursus van een ander jaar dan het jaar dat de telling kiest. */
export function buitenJaarTekst(jaar: number): string {
  return `Telt nu niet mee: je telt alleen het ${jaarTekst(jaar)}.`;
}

// ── De editor: schakelaar, geplande doelen en de link ───────────────────────

/** De regel in de weergave "Leerplan": "<n> doelen staan alleen op secties die nog leeg zijn: die zijn gepland, nog niet uitgewerkt." */
export function geplandeRegel(n: number): string {
  return n === 1
    ? '1 doel staat alleen op secties die nog leeg zijn: dat is gepland, nog niet uitgewerkt.'
    : `${n} doelen staan alleen op secties die nog leeg zijn: die zijn gepland, nog niet uitgewerkt.`;
}

function bruikbaarId(id: unknown): boolean {
  return typeof id === 'string' ? id.trim() !== '' : typeof id === 'number' && Number.isFinite(id);
}

/** Heeft minstens één doel van het leerplan een bruikbare verwijzing (set + vast nummer)? Zo niet, dan is er geen weergave "Minimumdoelen". */
export function leerplanHeeftVerwijzingen(leerplan: Pick<Curriculum, 'goals'> | undefined): boolean {
  const goals: unknown = leerplan?.goals;
  if (!Array.isArray(goals)) return false;
  return goals.some((g: unknown) => {
    const refs: unknown = g && typeof g === 'object' ? (g as { refs?: unknown }).refs : undefined;
    return Array.isArray(refs) && refs.some((r: unknown) => {
      if (!r || typeof r !== 'object') return false;
      const { set, id } = r as { set?: unknown; id?: unknown };
      return typeof set === 'string' && set.trim() !== '' && bruikbaarId(id);
    });
  });
}

/** De tekst van de link naar de dekking van de hele richting. */
export function richtingLinkTekst(titel: string): string {
  return `Bekijk wat al je cursussen voor ${titel} samen dekken`;
}

/** De link naar de richting, met het jaar van de doelgroep (en het soort onderwijs als dat buitengewoon is). */
export function richtingLinkNaar(doelgroep: { groep: string; jaar?: number; soort: 'so' | 'buso' }): string {
  const p = new URLSearchParams();
  if (doelgroep.jaar !== undefined) p.set('jaar', String(doelgroep.jaar));
  if (doelgroep.soort === 'buso') p.set('soort', 'buso');
  const zoek = p.toString();
  return `/cursussen/richtingen/${encodeURIComponent(doelgroep.groep)}${zoek ? `?${zoek}` : ''}`;
}
