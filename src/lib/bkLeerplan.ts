// Het leerplan met de competenties van een of meer beroepskwalificaties (docs/STUDIERICHTINGEN.md § 23.6.4 tot § 23.6.6).
//
// Een competentie wordt een gewoon doel: de doelcode is de BK-versie, een punt en een volgnummer ("BK-0390-2.03"), de
// tekst komt letterlijk uit het BK-bestand, en een apart veld `bkRefs` wijst naar de competentie (nooit `refs`: dat
// betekent overal "minimumdoel"). Omdat elk doel tegen zijn BK-bestand nagekeken kan worden, krijgt het leerplan meteen
// de status "nagekeken", door de officiële bron. Een BK-leerplan is nooit gemengd met minimumdoelen (F3-B8).
//
// Wat altijd geldt voor een leerplan dat als nagekeken terugkomt (`bevestigd`):
// - het bevat precies de gekozen competenties, niets meer en niets minder (ook niet na het saneren): een deel van een
//   beroepskwalificatie blijft een deel (§ 9.5), er gaat nooit stil iets naar "alle competenties";
// - elk doel is één competentie, met de tekst letterlijk zoals `tekstVanCompetentie` ze geeft (de nakijkpoort kijkt dat na);
// - geen competentie staat er twee keer in, en van een BK-nummer staat er hoogstens één versie in;
// - de codes zijn uniek (ook na `normalizeGoalCode`), hoogstens 60 tekens, en beginnen met hun eigen BK-versie en een punt;
// - het versiemerk in `bkVersies` is dat van het bestand waartegen nagekeken werd;
// - dezelfde selectie (in dezelfde volgorde van de BK's) geeft dezelfde doelen en dus dezelfde vingerafdruk.
//
// Een nieuwe BK-versie of een tekstcorrectie verandert een bewaard leerplan nooit vanzelf (§ 23.6.7): `vergelijkMetBk`
// meldt het alleen; de leerkracht beslist met een klik.
//
// Berichten zijn voor de leerkracht: gewone taal, nooit een competentiecode, set-id of groepnummer. Het BK-nummer mag
// (het is de officiële, openbare aanduiding), altijd na de titel. Puur, op `Date.now()` en `uid()` na: bewaren doet de
// aanroeper met `saveCurriculum`.

import {
  BK_BRON,
  COMPETENTIE_CODE,
  MAX_BK_PER_LEERPLAN,
  doelcodesVanBestand,
  splitsBk,
  valideerBkBestand,
  vergelijkBkVersie,
  type BkBestand,
  type Competentie,
} from './beroepskwalificaties';
import {
  MAX_DOELCODE,
  MAX_DOELEN,
  MAX_DOELTHEMA,
  bevestigLeerplan,
  createCurriculum,
  doelenVingerafdruk,
  normaliseerDoeltekst,
  normalizeGoalCode,
  sanitizeCurriculum,
} from './curriculum';
// Alleen types: de grote nakijkpoort voor leerplannen van een net (curriculumCheck.ts) is hier niet nodig.
import type { Bevinding, BevindingSoort, ControleRapport, DoelRapport } from './curriculumCheck';
import type { BkVersieMerk, Curriculum, CurriculumGoal, CurriculumHerkomst } from './curriculumTypes';
import { doelgroepVoorLeerplan, graadTekst, sanitizeDoelgroep, zonderKaderVelden, type Doelgroep } from './doelgroep';
import { effectieveStatus, isBkLeerplan } from './leerplanStatus';
import { htmlNaarTekst } from './minimumdoelen';
import { NAGEKEKEN_DOOR_BRON } from './minimumdoelenLeerplan';
import type { RichtingBk } from './richtingBk';
import { samenTitel } from './richtingCursus';
import type { RichtingInfo } from './richtingKader';
import { uid } from './utils';

// ── API ─────────────────────────────────────────────────────────────────────

/** Wat uit één BK-versie gekozen wordt: ALTIJD een lijst competentiecodes, nooit 'alle'. */
export interface BkKeuze {
  bestand: BkBestand;
  competenties: readonly string[];
}

export interface BkLeerplanOpties {
  /** De studierichting (gesaneerd, zonder jaar en zonder kadervelden op het leerplan). */
  doelgroep: Doelgroep;
  /**
   * BK-versie → de eerste 16 hex-tekens van haar sha256 in de index. Wijkt het merk af van dat van het meegegeven
   * bestand, dan horen index en bestand niet bij dezelfde update: dan niets bevestigen.
   */
  merken: ReadonlyMap<string, string>;
  /** Getrimd; leeg: een titel uit de titels en de doelgroep (bij `bestaand`: de titel van `bestaand`). */
  titel?: string;
  /** Komt in `subject`; leeg: de titel van de beroepskwalificatie, bij meer "Beroepsgerichte vorming". */
  vak?: string;
  /**
   * "Werk het leerplan bij" (zelfde versie, tekstcorrectie): moet een BK-leerplan zijn (geen eigen kopie) met precies
   * dezelfde competenties per BK-versie, anders gooit `leerplanUitBk` een `Error`. Het id, `createdAt` en de code per
   * competentie blijven; teksten en versiemerken zijn nieuw; het leerplan wordt opnieuw nagekeken.
   */
  bestaand?: Curriculum;
}

export interface BkLeerplanUitkomst {
  /** Gesaneerd; nagekeken als `bevestigd`. Kon er niets gebouwd worden: zonder doelen en zonder nakijkstatus. */
  leerplan: Curriculum;
  rapport: ControleRapport;
  bevestigd: boolean;
  /** In gewone taal. Is `bevestigd` onwaar, dan zegt de eerste waarschuwing waarom: dan bewaart de aanroeper niets. */
  waarschuwingen: string[];
}

export type BkMelding =
  /** De richting verwijst nu naar een andere versie van hetzelfde nummer (`nu`). */
  | { soort: 'andere-versie'; bk: string; nu: string }
  /** Geen versie van dit nummer meer in het kader van de richting (alleen bij herkomst 'api'). */
  | { soort: 'niet-meer-bij-richting'; bk: string }
  /** Zelfde lijst, andere officiële tekst bij `aantal` competenties: "Werk het leerplan bij". */
  | { soort: 'tekst-aangepast'; bk: string; aantal: number }
  /** Een gekozen competentie staat niet meer in de versie, of er kwam er een bij terwijl alle competenties gekozen waren. */
  | { soort: 'lijst-aangepast'; bk: string };

// ── Teksten en kleine hulp ──────────────────────────────────────────────────

const MAX_TITEL = 120;
const MAX_BRON = 500;
const SCHEIDER_THEMA = ' › ';
const VAK_MEER = 'Beroepsgerichte vorming';

const FOUT_GEEN_BK_LEERPLAN = 'Alleen een nagekeken leerplan met de competenties van een beroepskwalificatie kan zo bijgewerkt worden.';
const FOUT_LIJST_ANDERS = 'De lijst competenties is veranderd sinds het leerplan gemaakt werd. Maak een nieuw leerplan met de lijst van nu.';

function competenties(n: number): string {
  return `${n} ${n === 1 ? 'competentie' : 'competenties'}`;
}

function tekstOfLeeg(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** "a", "a en b", "a, b en c". */
function somLijst(delen: readonly string[]): string {
  return delen.length <= 1 ? (delen[0] ?? '') : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** Inkorten tot hoogstens `max` tekens (met "…" als er iets wegviel), zonder een tekenpaar doormidden te knippen. */
function inkorten(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, Math.max(0, max - 1));
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return `${uit.trimEnd()}…`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Een bestand dat door de validator van K1 komt (en dus bij zijn eigen `bk` hoort). */
function isBruikbaarBestand(b: unknown): b is BkBestand {
  return isObject(b) && typeof b.bk === 'string' && valideerBkBestand(b, b.bk).length === 0;
}

/** Het versiemerk van een bestand: de eerste 16 tekens van zijn sha256 (gelijk aan die in de index). */
function merkVanBestand(b: BkBestand): string {
  return b.sha256.slice(0, 16);
}

/** "‘Onthaalmedewerker’ (BK-0390-2)": de titel, met het officiële nummer erachter. */
function bkInBericht(b: Pick<BkBestand, 'titel' | 'bk'>): string {
  return `‘${b.titel}’ (${b.bk})`;
}

/** De competenties van een bestand als Map (de code is altijd een Map-sleutel, nooit een objecteigenschap). */
function competentiesVan(b: BkBestand): Map<string, Competentie> {
  const uit = new Map<string, Competentie>();
  for (const c of Array.isArray(b.competenties) ? b.competenties : []) {
    if (isObject(c) && typeof c.id === 'string' && COMPETENTIE_CODE.test(c.id) && !uit.has(c.id)) uit.set(c.id, c);
  }
  return uit;
}

/**
 * De tekst van een competentie zoals ze in een leerplan staat: `waarde` uit de bron, zonder HTML (`htmlNaarTekst`) en
 * met regels zoals elke doeltekst (`normaliseerDoeltekst`). De bouwer en de nakijkpoort gebruiken allebei deze functie.
 * Is ze leeg (bv. "<p>&nbsp;</p>"), dan kan de competentie geen doel worden: een doel zonder tekst valt weg bij het
 * saneren. `leerplanUitBk` slaat zo'n competentie over (met een waarschuwing) en telt ze niet mee bij "alle".
 */
export function tekstVanCompetentie(c: Competentie): string {
  return normaliseerDoeltekst(htmlNaarTekst(typeof c?.tekst === 'string' ? c.tekst : ''));
}

/**
 * De competenties van een bestand die een doel kunnen worden: met een tekst na `tekstVanCompetentie`. Hierop rekenen
 * "alle competenties", het deel "(8 van 12 competenties)" en de vergelijking na een update.
 */
function competentiesMetTekst(b: BkBestand): Map<string, Competentie> {
  const uit = new Map<string, Competentie>();
  for (const [id, c] of competentiesVan(b)) if (tekstVanCompetentie(c) !== '') uit.set(id, c);
  return uit;
}

/** Dezelfde selectie: dezelfde BK-versies, met per versie dezelfde competenties (de volgorde en dubbels tellen niet). */
function zelfdeSelectie(a: ReadonlyMap<string, readonly string[]>, b: ReadonlyMap<string, readonly string[]>): boolean {
  if (a.size !== b.size) return false;
  for (const [bk, ids] of a) {
    const andere = b.get(bk);
    if (andere === undefined) return false;
    const eigen = new Set(ids);
    const hun = new Set(andere);
    if (eigen.size !== hun.size || [...eigen].some((id) => !hun.has(id))) return false;
  }
  return true;
}

/** Een selectie zonder lege of ongeldige delen: BK-versie → competentiecodes (getrimd, uniek). Lege versies vallen weg. */
function gesaneerdeSelectie(selectie: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  if (!(selectie instanceof Map)) return uit;
  for (const [bk, ids] of selectie) {
    const versie = tekstOfLeeg(bk);
    if (splitsBk(versie) === undefined) continue;
    const lijst = uit.get(versie) ?? [];
    for (const id of Array.isArray(ids) ? (ids as readonly unknown[]) : []) {
      const t = tekstOfLeeg(id);
      if (t !== '' && !lijst.includes(t)) lijst.push(t);
    }
    if (lijst.length > 0) uit.set(versie, lijst);
  }
  return uit;
}

// ── Titel en bron ───────────────────────────────────────────────────────────

/**
 * Een titel uit de namen van de beroepskwalificaties en de delen van de richting, hoogstens 120 tekens. Het deel
 * " (8 van 12 competenties)" blijft altijd staan: past het niet, dan worden eerst de namen ingekort.
 */
function titelUit(titels: readonly string[], richting: readonly string[], deel?: { gekozen: number; totaal: number }): string {
  const namen = [...new Set(titels.map(tekstOfLeeg).filter((t) => t !== ''))];
  let naam = somLijst(namen);
  const delen = richting.map(tekstOfLeeg).filter((d) => d !== '');
  if (deel && Number.isInteger(deel.gekozen) && Number.isInteger(deel.totaal) && deel.gekozen >= 0 && deel.gekozen < deel.totaal) {
    const achter = ` (${deel.gekozen} van ${competenties(deel.totaal)})`;
    const rest = delen.join(' · ').length + (delen.length > 0 ? 3 : 0);
    const ruimte = MAX_TITEL - rest - achter.length;
    if (naam.length > ruimte) naam = inkorten(naam, Math.max(10, ruimte));
    naam = naam === '' ? achter.trim() : `${naam}${achter}`;
  }
  return samenTitel([naam, ...delen], MAX_TITEL);
}

/**
 * De titel van een BK-leerplan (hoogstens 120 tekens):
 * - "Onthaalmedewerker · Onthaal en recreatie · 3de graad";
 * - "Onthaalmedewerker en Recreatief medewerker · Onthaal en recreatie · 3de graad";
 * - met een deel: "Onthaalmedewerker (8 van 12 competenties) · Onthaal en recreatie · 3de graad";
 * - een richting van het buitengewoon onderwijs krijgt "buitengewoon" erachter.
 */
export function titelVoorBkLeerplan(info: RichtingInfo, titels: readonly string[], deel?: { gekozen: number; totaal: number }): string {
  const richting = [info.groep.titel, info.graad !== undefined ? graadTekst(info.graad) : '', info.soort === 'buso' ? 'buitengewoon' : ''];
  return titelUit(titels, richting, deel);
}

/** "Vlaamse kwalificatiestructuur: Onthaalmedewerker (BK-0390-2) · Recreatief medewerker (BK-0464-1)", hoogstens 500 tekens. */
function bronTekst(bestanden: readonly BkBestand[]): string {
  return inkorten(`Vlaamse kwalificatiestructuur: ${bestanden.map((b) => `${b.titel.trim()} (${b.bk})`).join(' · ')}`, MAX_BRON);
}

// ── De selectie van een bewaard leerplan ────────────────────────────────────

/**
 * De selectie van een bewaard BK-leerplan: BK-versie → competentiecodes, zonder dubbels, in de volgorde van de doelen.
 * De versies staan in de volgorde van `bkVersies`; een verwijzing naar een versie die daar niet in staat (een geknoeid
 * bestand), komt erachter, zodat niets stil verdwijnt (de poort keurt zo'n leerplan af). Leeg voor een ander leerplan.
 */
export function selectieVanBkLeerplan(cur: Curriculum): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  if (!cur || !isBkLeerplan(cur)) return uit;
  const perBk = new Map<string, string[]>();
  const gezien = new Set<string>();
  for (const goal of Array.isArray(cur.goals) ? cur.goals : []) {
    for (const ref of Array.isArray(goal?.bkRefs) ? goal.bkRefs : []) {
      const bk = tekstOfLeeg(ref?.bk);
      const id = tekstOfLeeg(ref?.id);
      if (bk === '' || id === '' || gezien.has(`${bk}\u0000${id}`)) continue;
      gezien.add(`${bk}\u0000${id}`);
      const ids = perBk.get(bk) ?? [];
      ids.push(id);
      perBk.set(bk, ids);
    }
  }
  for (const m of Array.isArray(cur.bkVersies) ? cur.bkVersies : []) {
    const ids = typeof m?.bk === 'string' ? perBk.get(m.bk) : undefined;
    if (ids && !uit.has(m.bk)) uit.set(m.bk, ids);
  }
  for (const [bk, ids] of perBk) if (!uit.has(bk)) uit.set(bk, ids);
  return uit;
}

// ── De nakijkpoort ──────────────────────────────────────────────────────────

/**
 * De nakijkpoort van een BK-leerplan (`curriculumCheck.ts` blijft ongewijzigd; `bevestigLeerplan` doet de rest). Van
 * `bestanden` tellen alleen de bestanden die door de validator komen; elk één keer per versie. Fout als:
 *
 * 1. de methode niet `beroepskwalificatie` is, een doel `refs` heeft, of het leerplan `minimumdoelenSets` heeft;
 * 2. een doel niet precies één `bkRef` heeft, naar een versie uit `bkVersies` waarvan het bestand meegegeven is; ook als
 *    het versiemerk in `bkVersies` niet dat van het meegegeven bestand is, of een versie uit `bkVersies` geen doel heeft;
 * 3. de competentie niet in dat bestand staat, geen tekst heeft, of de tekst niet gelijk is aan `tekstVanCompetentie`;
 * 4. een competentie twee keer voorkomt, een versie twee keer in `bkVersies` staat, of er twee versies van hetzelfde
 *    BK-nummer in staan;
 * 5. een code niet uniek is (na `normalizeGoalCode`), langer is dan 60 tekens, of niet begint met de eigen BK-versie en
 *    een punt (met iets erachter);
 * 6. het leerplan meer dan 20 BK's of 5000 doelen heeft, of geen enkel doel.
 *
 * De poort eist bewust niet dat een code gelijk is aan wat `doelcodesVanBestand` nu zou geven: "Werk het leerplan bij"
 * houdt de oude codes. Het rapport heeft `dekking: []`.
 */
export function controleerBkLeerplan(cur: Curriculum, bestanden: readonly BkBestand[]): ControleRapport {
  const bevindingen: Bevinding[] = [];
  const fout = (soort: BevindingSoort, bericht: string, goal?: CurriculumGoal) => {
    const b: Bevinding = { soort, ernst: 'fout', bericht };
    if (goal && typeof goal.id === 'string') b.doelId = goal.id;
    if (goal && typeof goal.code === 'string' && goal.code !== '') b.code = goal.code;
    bevindingen.push(b);
  };
  const goals: CurriculumGoal[] = Array.isArray(cur?.goals) ? cur.goals : [];

  // 1. Soort leerplan.
  if (cur?.herkomst?.methode !== 'beroepskwalificatie') {
    fout('herkomst', 'Dit leerplan komt niet uit een beroepskwalificatie: het kan zo niet nagekeken worden.');
  }
  const sets: unknown = cur?.minimumdoelenSets;
  if (sets !== undefined && !(Array.isArray(sets) && sets.length === 0)) {
    fout('verwijzing', 'Een leerplan met competenties noemt geen sets minimumdoelen: minimumdoelen en competenties komen in aparte leerplannen.');
  }

  // 6. Grenzen.
  if (goals.length === 0) fout('volledig', 'Het leerplan heeft geen doelen.');
  if (goals.length > MAX_DOELEN) fout('volledig', `Het leerplan heeft ${goals.length} doelen. Eén leerplan kan hoogstens ${MAX_DOELEN} doelen bevatten.`);

  // De bestanden: alleen bruikbare, één per versie.
  const bestandVan = new Map<string, BkBestand>();
  for (const b of Array.isArray(bestanden) ? bestanden : []) {
    if (isBruikbaarBestand(b) && !bestandVan.has(b.bk)) bestandVan.set(b.bk, b);
  }
  // Zonder bestand is er geen titel: dan een neutrale naam met het officiële nummer erachter, nooit het nummer alleen.
  const naamVan = (bk: string) => {
    const b = bestandVan.get(bk);
    return b ? bkInBericht(b) : splitsBk(bk) ? `een beroepskwalificatie (${bk})` : 'een onbekende beroepskwalificatie';
  };

  // De versies van het leerplan.
  const versies: unknown[] = Array.isArray(cur?.bkVersies) ? cur.bkVersies : [];
  const merkVan = new Map<string, string>();
  for (const m of versies) {
    const bk = isObject(m) && typeof m.bk === 'string' && splitsBk(m.bk) ? m.bk : undefined;
    if (bk === undefined) {
      fout('verwijzing', 'Een beroepskwalificatie van het leerplan heeft geen geldig nummer.');
      continue;
    }
    if (merkVan.has(bk)) {
      fout('volledig', `${naamVan(bk)} staat twee keer in de lijst beroepskwalificaties van het leerplan.`);
      continue;
    }
    const sha = isObject(m) && typeof m.sha === 'string' ? m.sha : '';
    merkVan.set(bk, sha);
    const b = bestandVan.get(bk);
    if (!b) fout('verwijzing', `De competenties van ${naamVan(bk)} zijn niet geladen: het leerplan kan niet nagekeken worden.`);
    else if (sha !== merkVanBestand(b)) fout('verwijzing', `Het leerplan noemt een andere versie van de gegevens van ${naamVan(bk)} dan de versie die nagekeken werd.`);
  }
  if (merkVan.size > MAX_BK_PER_LEERPLAN) {
    fout('volledig', `Het leerplan noemt ${merkVan.size} beroepskwalificaties. Eén leerplan kan hoogstens ${MAX_BK_PER_LEERPLAN} beroepskwalificaties bevatten.`);
  }

  // Per doel.
  const perDoel = new Map<string, DoelRapport>();
  const codes = new Set<string>();
  const competentieGezien = new Set<string>();
  const bksVanDoelen = new Set<string>();
  const competentiesPerBk = new Map<string, Map<string, Competentie>>();
  let letterlijk = 0;
  let nietLetterlijk = 0;
  let verwijzingen = 0;
  let verwijzingenOk = 0;
  goals.forEach((goal, i) => {
    if (!isObject(goal)) {
      fout('volledig', `Doel ${i + 1} is geen doel.`);
      return;
    }
    const code = typeof goal.code === 'string' ? normalizeGoalCode(goal.code) : '';
    const wie = code !== '' ? `Doel ${code}` : `Doel ${i + 1} (zonder code)`;
    const rapport: DoelRapport = { letterlijk: 'onbekend', verwijzingen: 'probleem' };
    if (typeof goal.id === 'string') perDoel.set(goal.id, rapport);

    const refs: unknown = goal.refs;
    if (refs !== undefined && !(Array.isArray(refs) && refs.length === 0)) {
      fout('verwijzing', `${wie} verwijst naar minimumdoelen. Een leerplan met competenties verwijst alleen naar competenties.`, goal);
    }

    const bkRefs: unknown[] = Array.isArray(goal.bkRefs) ? goal.bkRefs : [];
    verwijzingen += bkRefs.length;
    if (bkRefs.length !== 1) {
      fout('verwijzing', bkRefs.length === 0
        ? `${wie} verwijst naar geen enkele competentie.`
        : `${wie} verwijst naar ${bkRefs.length} competenties. Elk doel is precies één competentie.`, goal);
      return;
    }
    const ref = bkRefs[0];
    const bk = isObject(ref) && typeof ref.bk === 'string' && splitsBk(ref.bk) ? ref.bk : undefined;
    const id = isObject(ref) && typeof ref.id === 'string' ? ref.id : undefined;
    if (bk === undefined || id === undefined) {
      fout('verwijzing', `${wie} verwijst naar een competentie zonder geldig nummer.`, goal);
      return;
    }
    bksVanDoelen.add(bk);

    // 5. De code.
    if (code === '') fout('volledig', `${wie} heeft geen code.`, goal);
    else {
      if (codes.has(code)) fout('volledig', `De code ${code} staat er meer dan één keer in.`, goal);
      codes.add(code);
      if (code.length > MAX_DOELCODE) fout('volledig', `${wie} heeft een code van meer dan ${MAX_DOELCODE} tekens.`, goal);
      if (!code.startsWith(`${bk}.`) || code.length === bk.length + 1) {
        fout('volledig', `${wie}: de code begint niet met het nummer van de eigen beroepskwalificatie (${bk}) en een punt.`, goal);
      }
    }

    // 4. Elke competentie één keer.
    const sleutel = `${bk}\u0000${id}`;
    if (competentieGezien.has(sleutel)) fout('volledig', `${wie}: deze competentie van ${naamVan(bk)} staat er meer dan één keer in.`, goal);
    competentieGezien.add(sleutel);

    // 2. Een versie van het leerplan, met een meegegeven bestand.
    if (!merkVan.has(bk)) {
      fout('verwijzing', `${wie} verwijst naar ${naamVan(bk)}, maar die staat niet in de lijst beroepskwalificaties van het leerplan.`, goal);
      return;
    }
    const bestand = bestandVan.get(bk);
    if (!bestand) {
      fout('verwijzing', `${wie}: de competenties van ${naamVan(bk)} zijn niet geladen.`, goal);
      return;
    }

    // 3. De competentie en haar tekst.
    let lijst = competentiesPerBk.get(bk);
    if (!lijst) {
      lijst = competentiesVan(bestand);
      competentiesPerBk.set(bk, lijst);
    }
    const c = lijst.get(id);
    if (!c) {
      fout('verwijzing', `${wie} verwijst naar een competentie die niet in ${naamVan(bk)} staat.`, goal);
      return;
    }
    rapport.verwijzingen = 'ok';
    verwijzingenOk++;
    const officieel = tekstVanCompetentie(c);
    rapport.vindplaats = officieel;
    if (officieel === '') {
      // Een doel zonder tekst valt weg bij het saneren: zo'n competentie hoort nooit in een nagekeken leerplan.
      rapport.letterlijk = 'nee';
      nietLetterlijk++;
      fout('letterlijk', `${wie}: de competentie in ${naamVan(bk)} heeft geen tekst.`, goal);
    } else if (typeof goal.text === 'string' && goal.text === officieel) {
      rapport.letterlijk = 'ja';
      letterlijk++;
    } else {
      rapport.letterlijk = 'nee';
      nietLetterlijk++;
      fout('letterlijk', `${wie}: de tekst is niet letterlijk die van de competentie in ${naamVan(bk)}.`, goal);
    }
  });

  // 4. Hoogstens één versie per BK-nummer (in de versies en in de doelen samen).
  const perNummer = new Map<string, string[]>();
  for (const bk of new Set([...merkVan.keys(), ...bksVanDoelen])) {
    const nummer = (splitsBk(bk) as { nummer: string }).nummer;
    perNummer.set(nummer, [...(perNummer.get(nummer) ?? []), bk]);
  }
  for (const lijst of perNummer.values()) {
    if (lijst.length > 1) {
      const gesorteerd = [...lijst].sort(vergelijkBkVersie);
      fout('volledig', `Het leerplan bevat ${gesorteerd.length} versies van dezelfde beroepskwalificatie (${gesorteerd.join(', ')}). Kies er één.`);
    }
  }
  // 2. Elke versie van het leerplan heeft minstens één doel; 6. hoogstens 20 BK's in de doelen.
  for (const bk of merkVan.keys()) {
    if (!bksVanDoelen.has(bk)) fout('volledig', `${naamVan(bk)} staat in de lijst beroepskwalificaties van het leerplan, maar geen enkel doel komt eruit.`);
  }
  if (bksVanDoelen.size > MAX_BK_PER_LEERPLAN && merkVan.size <= MAX_BK_PER_LEERPLAN) {
    fout('volledig', `De doelen komen uit ${bksVanDoelen.size} beroepskwalificaties. Eén leerplan kan hoogstens ${MAX_BK_PER_LEERPLAN} beroepskwalificaties bevatten.`);
  }

  let doelenSha256 = '';
  try {
    doelenSha256 = doelenVingerafdruk(goals);
  } catch {
    // Doelen die geen objecten zijn: hierboven al een fout, en een lege vingerafdruk past nooit bij `bevestigLeerplan`.
  }
  const fouten = bevindingen.length;
  const delen = [
    `${letterlijk} van ${competenties(goals.length)} letterlijk`,
    verwijzingen > 0 ? `${verwijzingenOk} van ${verwijzingen} ${verwijzingen === 1 ? 'verwijzing' : 'verwijzingen'} in orde` : 'geen verwijzingen',
    fouten > 0 ? `${fouten} ${fouten === 1 ? 'fout' : 'fouten'}` : 'geen fouten',
  ];
  return {
    bevindingen,
    perDoel: Object.fromEntries(perDoel),
    tellers: { doelen: goals.length, letterlijk, nietLetterlijk, verwijzingen, verwijzingenOk },
    dekking: [],
    kanBevestigen: fouten === 0,
    samenvatting: `${delen.join(', ')}.`,
    doelenSha256,
  };
}

// ── Het leerplan bouwen ─────────────────────────────────────────────────────

interface Gekozen {
  bestand: BkBestand;
  /** De gekozen codes die in het bestand staan en een tekst hebben, in de volgorde van het bestand. */
  ids: string[];
  /** Gekozen codes die niet (meer) in het bestand staan. */
  onbekend: number;
  /** Gekozen codes die in het bestand staan, maar zonder tekst (`tekstVanCompetentie` is leeg): ze worden overgeslagen. */
  zonderTekst: number;
  /** Alle competenties met een tekst zijn gekozen. */
  alle: boolean;
  /** Het aantal competenties met een tekst in het bestand. */
  totaal: number;
}

/** De keuzes per versie samengevoegd (een versie die twee keer gekozen is, telt één keer), in de gekozen volgorde. */
function voegKeuzesSamen(keuzes: readonly BkKeuze[]): { gekozen: Gekozen[]; onbruikbaar: number } {
  const perBk = new Map<string, { bestand: BkBestand; gevraagd: Set<string> }>();
  let onbruikbaar = 0;
  for (const keuze of Array.isArray(keuzes) ? keuzes : []) {
    const bestand = keuze?.bestand;
    if (!isBruikbaarBestand(bestand)) {
      onbruikbaar++;
      continue;
    }
    const k = perBk.get(bestand.bk) ?? { bestand, gevraagd: new Set<string>() };
    perBk.set(bestand.bk, k);
    for (const id of Array.isArray(keuze.competenties) ? (keuze.competenties as readonly unknown[]) : []) {
      const t = tekstOfLeeg(id);
      if (t !== '') k.gevraagd.add(t);
    }
  }
  const gekozen: Gekozen[] = [];
  for (const { bestand, gevraagd } of perBk.values()) {
    const lijst = competentiesVan(bestand);
    const metTekst = competentiesMetTekst(bestand);
    const ids = [...metTekst.keys()].filter((id) => gevraagd.has(id));
    const onbekend = [...gevraagd].filter((id) => !lijst.has(id)).length;
    const zonderTekst = [...gevraagd].filter((id) => lijst.has(id) && !metTekst.has(id)).length;
    gekozen.push({ bestand, ids, onbekend, zonderTekst, alle: ids.length > 0 && ids.length === metTekst.size, totaal: metTekst.size });
  }
  return { gekozen, onbruikbaar };
}

/** Het thema van een doel: "<BK-titel> › <soort competentie>", met " (BK-0390)" bij twee gekozen BK's met dezelfde titel. */
function themasVan(gekozen: readonly Gekozen[]): Map<string, string> {
  const telTitel = new Map<string, number>();
  for (const g of gekozen) telTitel.set(g.bestand.titel.trim(), (telTitel.get(g.bestand.titel.trim()) ?? 0) + 1);
  const uit = new Map<string, string>();
  for (const g of gekozen) {
    const titel = g.bestand.titel.trim();
    uit.set(g.bestand.bk, (telTitel.get(titel) ?? 0) > 1 ? `${titel} (${g.bestand.nummer})` : titel);
  }
  return uit;
}

function themaMet(titel: string, type: string | undefined): string {
  const t = tekstOfLeeg(type);
  return inkorten(t !== '' ? `${titel}${SCHEIDER_THEMA}${t}` : titel, MAX_DOELTHEMA);
}

function refSleutels(goals: readonly CurriculumGoal[]): string[] {
  return goals.map((g) => (g.bkRefs ?? []).map((r) => `${r.bk}\u0000${r.id}`).join('\u0001'));
}

function merkSleutels(m: readonly BkVersieMerk[] | undefined): string {
  return (m ?? []).map((x) => `${x.bk}|${x.sha}|${x.alle === true ? 1 : 0}`).join(',');
}

/** De codes van een bestaand leerplan per competentie (`bk` + code), van de doelen met precies één verwijzing. */
function codesVanBestaand(bestaand: Curriculum | undefined): Map<string, string> {
  const uit = new Map<string, string>();
  for (const goal of Array.isArray(bestaand?.goals) ? (bestaand as Curriculum).goals : []) {
    const refs = Array.isArray(goal?.bkRefs) ? goal.bkRefs : [];
    if (refs.length !== 1 || typeof goal.code !== 'string') continue;
    const sleutel = `${refs[0].bk}\u0000${refs[0].id}`;
    if (!uit.has(sleutel)) uit.set(sleutel, normalizeGoalCode(goal.code));
  }
  return uit;
}

/**
 * Een leerplan met de gekozen competenties, nagekeken met de BK-bestanden als bron (door `NAGEKEKEN_DOOR_BRON`).
 *
 * - Volgorde: de BK's in de volgorde van `keuzes`, de competenties in de volgorde van het bestand (niet die van de
 *   selectie). Een versie zonder gekozen competenties valt weg; een versie die twee keer gekozen is, telt één keer.
 * - Een gekozen competentie zonder tekst (`tekstVanCompetentie` leeg) wordt overgeslagen, met een waarschuwing: ze kan
 *   geen doel worden. "Alle competenties" en het deel "(8 van 12)" tellen alleen de competenties met een tekst.
 * - Per competentie één doel: `code` uit `doelcodesVanBestand` (bij `bestaand`: de code die de competentie al had),
 *   `text` = `tekstVanCompetentie`, `theme` = "<BK-titel> › <soort>", `bkRefs: [{ bk, id }]`; geen `refs`, geen `note`.
 * - Het leerplan: net `beroepskwalificaties`, soort `leerplan`, methode `beroepskwalificatie`, `bkVersies` met het
 *   versiemerk van elk bestand (en `alle` als alle competenties gekozen zijn), de doelgroep zonder jaar en kadervelden.
 *
 * Niet bevestigd (geen doelen, geen nakijkstatus; de eerste waarschuwing zegt waarom): geen enkele competentie, een
 * bestand dat niet gelezen kan worden, een gekozen code die niet (meer) in het bestand staat, een versiemerk dat niet bij
 * het bestand past, meer dan 20 BK's of 5000 competenties. Valt bij het saneren een doel of een verwijzing weg, of vindt
 * de poort een fout, dan ook niet bevestigd: dan het gesaneerde leerplan zonder nakijkstatus. In geen van die gevallen
 * bewaart de aanroeper iets.
 *
 * Gooit een `Error` als `bestaand` geen BK-leerplan is, een eigen kopie is, of niet precies dezelfde competenties per
 * versie heeft: het scherm biedt dan "Maak een nieuw leerplan" aan.
 */
export function leerplanUitBk(keuzes: readonly BkKeuze[], o: BkLeerplanOpties): BkLeerplanUitkomst {
  const bestaand = o?.bestaand;
  if (bestaand && (!isBkLeerplan(bestaand) || bestaand.kind === 'eigen')) throw new Error(FOUT_GEEN_BK_LEERPLAN);
  const waarschuwingen: string[] = [];
  const blokkerend: string[] = [];

  const { gekozen: alleGekozen, onbruikbaar } = voegKeuzesSamen(keuzes);
  if (onbruikbaar > 0) {
    blokkerend.push(onbruikbaar === 1
      ? 'De competenties van een beroepskwalificatie konden niet gelezen worden. Probeer opnieuw.'
      : `De competenties van ${onbruikbaar} beroepskwalificaties konden niet gelezen worden. Probeer opnieuw.`);
  }
  for (const g of alleGekozen) {
    if (g.onbekend > 0) {
      blokkerend.push(`${g.onbekend === 1 ? '1 gekozen competentie staat' : `${g.onbekend} gekozen competenties staan`} niet (meer) in ${bkInBericht(g.bestand)}. Kies de competenties opnieuw.`);
    }
    if (g.zonderTekst > 0) {
      waarschuwingen.push(g.zonderTekst === 1
        ? `1 gekozen competentie van ${bkInBericht(g.bestand)} heeft geen tekst in de officiële bron. Ze werd overgeslagen.`
        : `${g.zonderTekst} gekozen competenties van ${bkInBericht(g.bestand)} hebben geen tekst in de officiële bron. Ze werden overgeslagen.`);
    }
  }
  const gekozen = alleGekozen.filter((g) => g.ids.length > 0);

  // Bijwerken mag alleen met precies dezelfde competenties. Een bestand dat niet gelezen kon worden, is geen andere
  // lijst: dan niets bevestigen (hieronder), zonder fout.
  if (bestaand && onbruikbaar === 0) {
    const nieuw = new Map(gekozen.map((g) => [g.bestand.bk, g.ids] as const));
    if (alleGekozen.some((g) => g.onbekend > 0) || !zelfdeSelectie(nieuw, selectieVanBkLeerplan(bestaand))) throw new Error(FOUT_LIJST_ANDERS);
  }

  for (const g of gekozen) {
    const index = o?.merken instanceof Map ? o.merken.get(g.bestand.bk) : undefined;
    if (index !== undefined && index !== merkVanBestand(g.bestand)) {
      blokkerend.push(`De gegevens van ${bkInBericht(g.bestand)} op dit toestel horen niet bij de laatste update. Laad de pagina opnieuw en probeer nog eens.`);
    }
    if (typeof g.bestand.nietMeerInBron === 'string') {
      waarschuwingen.push(`De Vlaamse overheid geeft ${bkInBericht(g.bestand)} niet meer. Het leerplan gebruikt de laatst bekende competenties.`);
    }
  }

  const bestanden = gekozen.map((g) => g.bestand);
  const titels = bestanden.map((b) => b.titel.trim());
  const totaal = gekozen.reduce((som, g) => som + g.ids.length, 0);
  const dg = doelgroepVoorLeerplan(o?.doelgroep) ?? doelgroepVoorLeerplan(bestaand?.doelgroep);
  const doelgroep = dg ? zonderKaderVelden(dg) : undefined;
  const nu = Date.now();
  const herkomst: CurriculumHerkomst = { methode: 'beroepskwalificatie', bronUrl: BK_BRON, ingelezenOp: nu };
  const deel = gekozen.length === 1 && !gekozen[0].alle ? { gekozen: totaal, totaal: gekozen[0].totaal } : undefined;
  // Zoals de titels van de andere leerplannen van een richting (doelgroep.ts): buitengewoon onderwijs krijgt dat erachter.
  const buso = doelgroep?.soort === 'buso' ? (doelgroep.graad !== undefined ? 'buitengewoon (OV4)' : 'buitengewoon') : '';
  const standaardTitel = titelUit(titels, [doelgroep?.titel ?? '', doelgroep?.graad !== undefined ? graadTekst(doelgroep.graad) : '', buso], deel);
  const kop = {
    title: tekstOfLeeg(o?.titel) || tekstOfLeeg(bestaand?.title) || standaardTitel || 'Leerplan met competenties',
    net: 'beroepskwalificaties' as const,
    subject: tekstOfLeeg(o?.vak) || tekstOfLeeg(bestaand?.subject) || (titels.length === 1 ? titels[0] : VAK_MEER),
    level: doelgroep?.graad !== undefined ? graadTekst(doelgroep.graad) : '',
    kind: 'leerplan' as const,
    source: bronTekst(bestanden),
    herkomst,
    bkVersies: gekozen.map((g): BkVersieMerk => ({ bk: g.bestand.bk, sha: merkVanBestand(g.bestand), ...(g.alle ? { alle: true as const } : {}) })),
    ...(doelgroep ? { doelgroep } : {}),
    ...(bestaand ? { id: bestaand.id, createdAt: bestaand.createdAt } : {}),
    updatedAt: nu,
  };

  const zonderDoelen = (waarom: readonly string[]): BkLeerplanUitkomst => {
    const leeg = createCurriculum({ ...kop, goals: [] });
    return { leerplan: leeg, rapport: controleerBkLeerplan(leeg, bestanden), bevestigd: false, waarschuwingen: [...waarom, ...waarschuwingen] };
  };
  if (blokkerend.length > 0) return zonderDoelen(blokkerend);
  if (totaal === 0) return zonderDoelen(['Kies minstens één competentie.']);
  if (gekozen.length > MAX_BK_PER_LEERPLAN) {
    return zonderDoelen([`Je koos competenties uit ${gekozen.length} beroepskwalificaties. Eén leerplan kan hoogstens ${MAX_BK_PER_LEERPLAN} beroepskwalificaties bevatten: kies er minder.`]);
  }
  if (totaal > MAX_DOELEN) {
    return zonderDoelen([`Je koos ${totaal} competenties. Eén leerplan kan hoogstens ${MAX_DOELEN} doelen bevatten: kies er minder.`]);
  }

  const themas = themasVan(gekozen);
  const oudeCodes = codesVanBestaand(bestaand);
  const goals: CurriculumGoal[] = [];
  for (const g of gekozen) {
    const lijst = competentiesVan(g.bestand);
    const nieuweCodes = doelcodesVanBestand(g.bestand);
    for (const id of g.ids) {
      const c = lijst.get(id) as Competentie;
      goals.push({
        id: uid(),
        code: oudeCodes.get(`${g.bestand.bk}\u0000${id}`) ?? nieuweCodes.get(id) ?? '',
        text: tekstVanCompetentie(c),
        theme: themaMet(themas.get(g.bestand.bk) ?? g.bestand.titel, c.type),
        bkRefs: [{ bk: g.bestand.bk, id }],
      });
    }
  }

  // Eerst saneren zoals bewaren en importeren dat doen, dan pas nakijken: zo is de vingerafdruk die van de doelen zoals
  // ze na exporteren en importeren terugkomen. Daarna nagaan dat precies de gekozen competenties overblijven.
  const ruw = createCurriculum({ ...kop, goals });
  const gesaneerd = sanitizeCurriculum(ruw);
  const voor = refSleutels(goals);
  const na = gesaneerd ? refSleutels(gesaneerd.goals) : [];
  if (!gesaneerd || na.length !== voor.length || na.some((s, i) => s !== voor[i]) || merkSleutels(gesaneerd.bkVersies) !== merkSleutels(kop.bkVersies)) {
    const weg = goals.length - (gesaneerd?.goals.length ?? 0);
    const leerplan: Curriculum = { ...(gesaneerd ?? ruw) };
    delete leerplan.controle;
    return {
      leerplan,
      rapport: controleerBkLeerplan(leerplan, bestanden),
      bevestigd: false,
      waarschuwingen: [
        weg > 0
          ? `${competenties(weg)} ${weg === 1 ? 'viel' : 'vielen'} weg bij het bewaren. Het leerplan kon niet als nagekeken bevestigd worden.`
          : 'Niet alle gekozen competenties bleven ongewijzigd bij het bewaren. Het leerplan kon niet als nagekeken bevestigd worden.',
        ...waarschuwingen,
      ],
    };
  }

  const zonderStatus: Curriculum = { ...gesaneerd };
  delete zonderStatus.controle;
  const rapport = controleerBkLeerplan(zonderStatus, bestanden);
  if (!rapport.kanBevestigen) {
    const eerste = rapport.bevindingen.find((b) => b.ernst === 'fout')?.bericht ?? '';
    return {
      leerplan: zonderStatus,
      rapport,
      bevestigd: false,
      waarschuwingen: [`Het leerplan kon niet als nagekeken bevestigd worden, want het nakijken vond een probleem: ${eerste}`, ...waarschuwingen],
    };
  }
  const n = zonderStatus.goals.length;
  const samenvatting = gekozen.length === 1
    ? `Letterlijk overgenomen uit de beroepskwalificatie ${titels[0]} (${deel ? `${n} van ${competenties(deel.totaal)}` : competenties(n)}).`
    : `Letterlijk overgenomen uit ${gekozen.length} beroepskwalificaties (${competenties(n)}).`;
  const leerplan = bevestigLeerplan(zonderStatus, { door: NAGEKEKEN_DOOR_BRON, rapport, samenvatting });
  return { leerplan, rapport, bevestigd: true, waarschuwingen };
}

// ── Hergebruik ──────────────────────────────────────────────────────────────

/**
 * Het BK-leerplan op dit toestel met precies deze selectie, zodat er geen tweede, gelijk leerplan in de opslag komt. Het
 * past als het een BK-leerplan is, geen eigen kopie (`kind` 'eigen'), nagekeken (`effectieveStatus` 'gecontroleerd'),
 * niet van een andere richting (`groep`; zonder doelgroep telt dat niet), met dezelfde competenties per versie (de
 * volgorde telt niet) én per versie hetzelfde versiemerk als nu (`merken`). Ontbreekt een merk in `merken`, dan past
 * niets: dezelfde versie is dan niet aan te tonen. De eerste die past, dus de nieuwste. Een lege selectie past nooit.
 * Een competentie zonder tekst (`tekstVanCompetentie` leeg) staat nooit in een BK-leerplan: laat ze uit `selectie`.
 */
export function vindBkLeerplan(
  curricula: readonly Curriculum[],
  selectie: ReadonlyMap<string, readonly string[]>,
  doelgroep: Doelgroep,
  merken: ReadonlyMap<string, string>,
): Curriculum | undefined {
  const gewenst = gesaneerdeSelectie(selectie);
  if (gewenst.size === 0) return undefined;
  const groep = sanitizeDoelgroep(doelgroep)?.groep;
  for (const c of Array.isArray(curricula) ? curricula : []) {
    if (!c || !isBkLeerplan(c) || c.kind === 'eigen') continue;
    const groepVanLeerplan = sanitizeDoelgroep(c.doelgroep)?.groep;
    if (groep !== undefined && groepVanLeerplan !== undefined && groepVanLeerplan !== groep) continue;
    if (!zelfdeSelectie(gewenst, selectieVanBkLeerplan(c))) continue;
    const merkLijst: readonly BkVersieMerk[] = Array.isArray(c.bkVersies) ? c.bkVersies : [];
    const versies = new Map(merkLijst.map((m) => [m?.bk, m?.sha] as const));
    if (versies.size !== gewenst.size) continue;
    const zelfdeMerk = [...gewenst.keys()].every((bk) => {
      const nu = merken instanceof Map ? merken.get(bk) : undefined;
      return nu !== undefined && versies.get(bk) === nu;
    });
    // De nakijkstatus rekent over alle doelen: pas bekijken als selectie en merken kloppen.
    if (zelfdeMerk && effectieveStatus(c) === 'gecontroleerd') return c;
  }
  return undefined;
}

// ── Na een maandelijkse update ──────────────────────────────────────────────

/**
 * Wat er veranderde sinds het BK-leerplan gemaakt werd (§ 23.6.6). Pure vergelijking: het leerplan verandert nooit, en
 * een nieuwe versie wordt nooit in een bestaand leerplan geschoven. Leeg voor een eigen kopie of een ander leerplan.
 * Per versie van het leerplan hoogstens één melding, in de volgorde van `bkVersies`:
 *
 * - bij herkomst 'api': staat de versie niet meer in het kader, dan `andere-versie` (met de hoogste andere versie van
 *   hetzelfde nummer in het kader) of `niet-meer-bij-richting`;
 * - anders, alleen als het versiemerk in de index (`merken`) anders is dan bij het maken, per competentie vergelijken
 *   met het huidige bestand (sleutel `bk` + code): ontbreekt een gekozen competentie, of staat er bij `alle` een nieuwe
 *   in het bestand, dan `lijst-aangepast`; verschillen alleen teksten, dan `tekst-aangepast` met het aantal; anders
 *   niets (kennis of context veranderde: niets te doen).
 *
 * Ontbreekt het merk in de index of het bestand (404, onbruikbaar, laden mislukt), of hoort het bestand niet bij het merk
 * in de index (index en bestand van een andere update), dan geen melding over teksten of de lijst: liever geen melding
 * dan een valse.
 *
 * `kader` is het kader van de hele richting (`bkKader` zonder gekozen onderdeel): met het kader van één variant zou een
 * BK die alleen in een andere variant hoort, vals "niet meer bij de richting" melden. Is het toch het kader van één
 * variant (`kader.onderdeel`), dan komen er geen meldingen `andere-versie` of `niet-meer-bij-richting`.
 *
 * Een competentie zonder tekst telt als niet in het bestand: een gekozen competentie die haar tekst verloor, past de
 * lijst aan; een nieuwe competentie zonder tekst bij `alle` niet.
 */
export function vergelijkMetBk(
  leerplan: Curriculum,
  kader: RichtingBk,
  bestanden: ReadonlyMap<string, BkBestand>,
  merken: ReadonlyMap<string, string>,
): BkMelding[] {
  if (!leerplan || !isBkLeerplan(leerplan) || leerplan.kind === 'eigen') return [];
  const selectie = selectieVanBkLeerplan(leerplan);
  const merkVan = new Map<string, BkVersieMerk>();
  for (const m of Array.isArray(leerplan.bkVersies) ? leerplan.bkVersies : []) {
    if (m && typeof m.bk === 'string' && !merkVan.has(m.bk)) merkVan.set(m.bk, m);
  }
  const tekstVan = new Map<string, string>();
  for (const goal of Array.isArray(leerplan.goals) ? leerplan.goals : []) {
    const refs = Array.isArray(goal?.bkRefs) ? goal.bkRefs : [];
    if (refs.length !== 1) continue;
    const sleutel = `${refs[0].bk}\u0000${refs[0].id}`;
    if (!tekstVan.has(sleutel)) tekstVan.set(sleutel, typeof goal.text === 'string' ? goal.text : '');
  }
  // Alleen het kader van de hele richting zegt welke versies er niet (meer) bij horen.
  const metApi = kader?.herkomst === 'api' && Array.isArray(kader.bks) && kader.onderdeel === undefined;
  const inKader = new Set(metApi ? kader.bks.map((b) => b.bk) : []);

  const uit: BkMelding[] = [];
  for (const bk of new Set([...merkVan.keys(), ...selectie.keys()])) {
    const delen = splitsBk(bk);
    if (!delen) continue;
    if (metApi && !inKader.has(bk)) {
      const anderen = kader.bks.filter((b) => b.bk !== bk && splitsBk(b.bk)?.nummer === delen.nummer).map((b) => b.bk).sort(vergelijkBkVersie);
      uit.push(anderen.length > 0 ? { soort: 'andere-versie', bk, nu: anderen[anderen.length - 1] } : { soort: 'niet-meer-bij-richting', bk });
      continue;
    }
    const merk = merkVan.get(bk);
    const nuMerk = merken instanceof Map ? merken.get(bk) : undefined;
    if (!merk || nuMerk === undefined || merk.sha === nuMerk) continue;
    const bestand = bestanden instanceof Map ? bestanden.get(bk) : undefined;
    // Alleen een bruikbaar bestand van deze versie, en precies het bestand waar het merk in de index bij hoort.
    if (!isBruikbaarBestand(bestand) || bestand.bk !== bk || merkVanBestand(bestand) !== nuMerk) continue;
    const huidig = competentiesMetTekst(bestand);
    const ids = selectie.get(bk) ?? [];
    const gekozen = new Set(ids);
    if (ids.some((id) => !huidig.has(id)) || (merk.alle === true && [...huidig.keys()].some((id) => !gekozen.has(id)))) {
      uit.push({ soort: 'lijst-aangepast', bk });
      continue;
    }
    const aantal = ids.filter((id) => tekstVan.get(`${bk}\u0000${id}`) !== tekstVanCompetentie(huidig.get(id) as Competentie)).length;
    if (aantal > 0) uit.push({ soort: 'tekst-aangepast', bk, aantal });
  }
  return uit;
}
