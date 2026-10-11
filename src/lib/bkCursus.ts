// Het geraamte van een cursus met de competenties van een beroepskwalificatie (docs/STUDIERICHTINGEN.md § 23.6.9, F3-B10).
//
// Een BK-leerplan heeft een doel per competentie (bkLeerplan.ts). De cursus daarvoor krijgt:
// - een hoofdstuk per BK-versie (het eerste deel van het thema van haar doelen: de titel van de beroepskwalificatie);
// - daarin een sectie per competentie, met de titel uit haar tekst en de doelcode al op de sectie (`goalCodes`);
// - twee doelen-callouts: "Doel in deze sectie" (de code en de competentie) en, als de bron kennis of vaardigheden bij
//   die competentie geeft, "Kennis en vaardigheden uit de beroepskwalificatie" (hoogstens 12 regels, daarna één zin die
//   naar de studierichting verwijst, waar ze volledig staan).
//
// Beide blokken zijn doelen-callouts: een sectie met alleen die blokken telt in de dekking als ‘gepland’, nog niet als
// gedekt (`sectieHeeftInhoud`), net als bij het geraamte van de minimumdoelen (§ 12.2). Zoals daar staat elke gekozen code
// in precies één niet-optionele sectie, zodat `sanitizeCourse` alles laat staan.
//
// Een cursus verandert hier nooit achteraf (N6): het geraamte bestaat alleen bij het maken. Puur: geen opslag, geen
// netwerk, geen DOM. Op `uid()` na altijd hetzelfde resultaat voor dezelfde invoer.

import type { BkBestand, Competentie } from './beroepskwalificaties';
import type { Course, CourseChapter, CourseSection } from './courseTypes';
import { normalizeGoalCode, shortGoalText } from './curriculum';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import type { Doelgroep } from './doelgroep';
import { htmlNaarTekst } from './minimumdoelen';
import { cursusVoorRichting, type Startvorm } from './richtingCursus';
import { uid } from './utils';

// ── Grenzen en teksten ──────────────────────────────────────────────────────

/** Titels van hoofdstukken en secties zijn hoogstens zo lang (zoals bij het geraamte van de minimumdoelen). */
const MAX_TITEL = 120;
/** De titel van een sectie: het begin van de competentie. */
const MAX_SECTIETITEL = 110;
/** Hoeveel tekens een regel kennis of vaardigheid heeft, met het voorvoegsel erbij. */
const MAX_REGEL = 300;
/** Hoeveel regels kennis en vaardigheden in een sectie komen; de rest staat bij de studierichting. */
const MAX_REGELS = 12;
const SCHEIDER_THEMA = ' › ';
const TITEL_DOEL = 'Doel in deze sectie';
const TITEL_KENNIS = 'Kennis en vaardigheden uit de beroepskwalificatie';
const VOORVOEGSEL_KENNIS = 'Kennis: ';
const VOORVOEGSEL_VAARDIGHEID = 'Vaardigheid: ';
const TERUGVAL_HOOFDSTUK = 'Competenties';
const TERUGVAL_SECTIE = 'Competentie';

/** De zin na de twaalfde regel: hoeveel er niet in de sectie staan, en waar ze wel te vinden zijn. */
function restRegel(n: number): string {
  return `… en nog ${n}: zie ‘Beroepskwalificaties’ bij de studierichting.`;
}

// ── Kleine hulp ─────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Minstens één letter of cijfer: zo kan `sanitizeCourse` een code nooit laten vallen (zoals in richtingCursus.ts). */
function heeftInhoud(v: string): boolean {
  return /[\p{L}\p{N}]/u.test(v);
}

/** Tekst inkorten tot hoogstens `max` tekens (met "…" als er iets wegviel), zonder een tekenpaar doormidden te knippen. */
function inkort(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, Math.max(0, max - 1));
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return `${uit.trimEnd()}…`;
}

/** Gewone tekst op één regel: zonder regeleinden en dubbele spaties. */
function eenRegel(t: unknown): string {
  return typeof t === 'string' ? t.trim().replace(/\s+/g, ' ') : '';
}

/** Een tekst uit de bron (kan HTML bevatten, zoals `tekstVanCompetentie` ze ook omzet) op één regel. */
function bronRegel(t: unknown): string {
  return typeof t === 'string' ? eenRegel(htmlNaarTekst(t)) : '';
}

/** Het eerste deel van een thema (vóór " › "); een thema dat op " ›" eindigt is gewoon het deel ervoor. Leeg zonder thema. */
function eersteDeelThema(thema: unknown): string {
  const t = (typeof thema === 'string' ? thema : '').trim().replace(/\s*›$/, '');
  const i = t.indexOf(SCHEIDER_THEMA);
  return (i < 0 ? t : t.slice(0, i)).trim();
}

/** Het bestand van een BK-versie, alleen als het echt van die versie is en een lijst competenties heeft. */
function bestandVan(bestanden: ReadonlyMap<string, BkBestand> | undefined, bk: string): BkBestand | undefined {
  if (!bestanden || typeof bestanden.get !== 'function') return undefined;
  const b = bestanden.get(bk);
  return isObject(b) && b.bk === bk && Array.isArray(b.competenties) ? b : undefined;
}

/** De competenties van een bestand op hun code (de eerste wint, zoals bij de doelcodes). */
function competentiesOpCode(b: BkBestand): Map<string, Competentie> {
  const uit = new Map<string, Competentie>();
  for (const c of b.competenties) if (isObject(c) && typeof c.id === 'string' && !uit.has(c.id)) uit.set(c.id, c);
  return uit;
}

/**
 * De regels van het blok "Kennis en vaardigheden": eerst alle kennis, dan alle vaardigheden, in de volgorde van de bron.
 * Elke regel hoogstens 300 tekens (met het voorvoegsel erbij). Meer dan 12: de eerste 12 en dan één zin met het aantal
 * dat er niet staat. Leeg als de bron bij deze competentie geen kennis en geen vaardigheden geeft.
 */
function kennisRegels(c: Competentie): string[] {
  const regels: string[] = [];
  const voeg = (lijst: unknown, voorvoegsel: string) => {
    for (const x of Array.isArray(lijst) ? lijst : []) {
      const tekst = bronRegel(isObject(x) ? x.tekst : undefined);
      if (tekst !== '') regels.push(shortGoalText(`${voorvoegsel}${tekst}`, MAX_REGEL));
    }
  };
  voeg(c.kennis, VOORVOEGSEL_KENNIS);
  voeg(c.vaardigheden, VOORVOEGSEL_VAARDIGHEID);
  if (regels.length <= MAX_REGELS) return regels;
  return [...regels.slice(0, MAX_REGELS), restRegel(regels.length - MAX_REGELS)];
}

// ── Het geraamte ────────────────────────────────────────────────────────────

interface GeraamteHoofdstuk {
  titel: string;
  secties: CourseSection[];
}

/**
 * De hoofdstukken van een cursus met de competenties van een BK-leerplan op de secties:
 * - een hoofdstuk per BK-versie, in de volgorde waarin die in het leerplan voorkomt, met als titel het eerste deel van het
 *   thema van haar doelen (de titel van de beroepskwalificatie), hoogstens 120 tekens;
 * - daarin een sectie per competentie, in de volgorde van het leerplan: de titel is `shortGoalText(tekst, 110)`, `goalCodes`
 *   is de code van het doel, en de sectie is nooit optioneel;
 * - blok 1: een callout van het soort 'goal', "Doel in deze sectie", met "<code> — <tekst>";
 * - blok 2, alleen als `bestanden` het bestand van die BK-versie heeft en de competentie kennis of vaardigheden geeft: een
 *   callout 'goal', "Kennis en vaardigheden uit de beroepskwalificatie", met per regel "Kennis: …" of "Vaardigheid: …"
 *   (elke regel hoogstens 300 tekens), hoogstens 12 regels, en daarna "… en nog <n>: zie ‘Beroepskwalificaties’ bij de
 *   studierichting." met het aantal dat er niet staat. Ontbreekt het bestand, dan geen blok 2 voor die beroepskwalificatie.
 *
 * Beide blokken zijn doelen-callouts: de sectie telt in de dekking als ‘gepland’, niet als gedekt. Elke code staat in
 * precies één sectie (§ 12.2). `codes` beperkt tot die doelcodes (de volgorde is die van het leerplan, hoofdletters en
 * witruimte tellen niet). Een doel zonder bruikbare code, of met een code die al voorkwam, wordt overgeslagen. Een doel
 * zonder verwijzing naar een competentie krijgt wel een sectie (zonder blok 2), onder een hoofdstuk met zijn thema.
 * Zonder doelen is het resultaat leeg.
 */
export function bkGeraamte(leerplan: Curriculum, bestanden: ReadonlyMap<string, BkBestand>, codes?: readonly string[]): CourseChapter[] {
  const gewenst = codes ? new Set(codes.map((c) => normalizeGoalCode(typeof c === 'string' ? c : ''))) : undefined;
  const gezien = new Set<string>();
  const hoofdstukken = new Map<string, GeraamteHoofdstuk>();
  const opCode = new Map<string, Map<string, Competentie>>();

  for (const goal of (Array.isArray(leerplan?.goals) ? leerplan.goals : []) as (CurriculumGoal | null | undefined)[]) {
    if (!isObject(goal)) continue;
    const code = normalizeGoalCode(typeof goal.code === 'string' ? goal.code : '');
    if (!heeftInhoud(code) || gezien.has(code) || (gewenst && !gewenst.has(code))) continue;
    gezien.add(code);

    const ref = Array.isArray(goal.bkRefs) ? goal.bkRefs[0] : undefined;
    const bk = isObject(ref) && typeof ref.bk === 'string' && ref.bk !== '' ? ref.bk : undefined;
    const id = isObject(ref) && typeof ref.id === 'string' ? ref.id : undefined;
    const bestand = bk !== undefined ? bestandVan(bestanden, bk) : undefined;
    let competentie: Competentie | undefined;
    if (bk !== undefined && bestand && id !== undefined) {
      let lijst = opCode.get(bk);
      if (!lijst) {
        lijst = competentiesOpCode(bestand);
        opCode.set(bk, lijst);
      }
      competentie = lijst.get(id);
    }

    const titel = inkort(eersteDeelThema(goal.theme) || eenRegel(bestand?.titel) || TERUGVAL_HOOFDSTUK, MAX_TITEL);
    const sleutel = bk !== undefined ? `bk\u0000${bk}` : `thema\u0000${titel}`;
    const hoofdstuk = hoofdstukken.get(sleutel) ?? { titel, secties: [] };
    hoofdstukken.set(sleutel, hoofdstuk);

    const tekst = eenRegel(goal.text);
    const blokken: CourseSection['blocks'] = [
      { id: uid(), type: 'callout', kind: 'goal', title: TITEL_DOEL, text: tekst !== '' ? `${code} — ${tekst}` : code },
    ];
    const regels = competentie ? kennisRegels(competentie) : [];
    if (regels.length > 0) blokken.push({ id: uid(), type: 'callout', kind: 'goal', title: TITEL_KENNIS, text: regels.join('\n') });
    hoofdstuk.secties.push({
      id: uid(),
      title: inkort(shortGoalText(tekst, MAX_SECTIETITEL) || TERUGVAL_SECTIE, MAX_TITEL),
      blocks: blokken,
      goalCodes: [code],
    });
  }

  return [...hoofdstukken.values()].map((h): CourseChapter => ({ id: uid(), title: h.titel, sections: h.secties }));
}

/**
 * Een nieuwe cursus voor de competenties van een BK-leerplan, zonder AI: `cursusVoorRichting` met bij `geraamte` het
 * geraamte van `bkGeraamte`. Met `leeg`, of als het leerplan geen bruikbare doelen heeft, blijft het ene lege hoofdstuk van
 * `createCourse` staan (het valt dan niet terug op het geraamte van de minimumdoelen, dat alle competenties in één sectie
 * zou zetten). Bewaren doet de aanroeper.
 */
export function cursusVoorBk(o: {
  titel: string;
  auteur: string;
  doelgroep: Doelgroep;
  leerplan: Curriculum;
  bestanden: ReadonlyMap<string, BkBestand>;
  codes?: readonly string[];
  start: Startvorm;
}): Course {
  return cursusVoorRichting({
    titel: o.titel,
    auteur: o.auteur,
    doelgroep: o.doelgroep,
    leerplan: o.leerplan,
    codes: o.codes,
    start: o.start,
    hoofdstukken: o.start === 'geraamte' ? bkGeraamte(o.leerplan, o.bestanden, o.codes) : undefined,
  });
}
