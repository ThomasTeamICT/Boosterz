// Sets minimumdoelen kiezen: welke sets stellen we voor bij een vak, en hoe lang gelden ze nog?
//
// Licht en puur, zodat zowel de inleeswizard als de editor van de leerplannenpagina (venster "Kies de sets met
// minimumdoelen") dezelfde rangschikking en dezelfde geldigheid tonen, zonder de leesmachine van de wizard
// (leerplanLezer, curriculumCheck) mee te laden. Geen React, geen netwerk.

import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { geldigheidVanDoelen } from './minimumdoelen';
import { geldigheidTekst, geldigheidVan, soortVanSet, zonderAccenten, type GeldigheidCode, type SoortOnderwijs } from './minimumdoelenBron';
import { stelSetsVoor } from './minimumdoelVerwijzing';
import { bevatFrase, competentieFrases } from './vakZoektabel';

// ── Geldigheid ──────────────────────────────────────────────────────────────

/** Geldigheid van een geladen set: uit de kop, en bij oudere bestanden uit de doelen zelf. */
function geldigheidBron(bestand: MinimumdoelenSetBestand) {
  return bestand.set.geldigheid !== undefined ? bestand.set : geldigheidVanDoelen(bestand.doelen);
}

/** 'G' (geldig), 'N' (niet meer geldig), 'O' (onbekend) of `undefined` zonder gegevens. */
export function geldigheidVanBestand(bestand: MinimumdoelenSetBestand): GeldigheidCode | undefined {
  return geldigheidVan(geldigheidBron(bestand));
}

/** "Geldig sinds 2024" of "Niet meer geldig (2019–2025)" voor een geladen set; `undefined` zonder gegevens. */
export function geldigheidTekstVanBestand(bestand: MinimumdoelenSetBestand): string | undefined {
  return geldigheidTekst(geldigheidBron(bestand));
}

function jaarVan(datum: string | undefined): string | undefined {
  return typeof datum === 'string' && /^\d{4}/.test(datum) ? datum.slice(0, 4) : undefined;
}

/**
 * De jaren waarin een set gold, voor in een zin: "1997–2020", "tot 2020", "ze golden sinds 1997". `undefined`
 * zonder jaren. Bedoeld voor een set die niet meer geldt ("Deze minimumdoelen gelden niet meer (1997–2020)").
 */
export function geldigheidJaren(set: { geldigVan?: string; geldigTot?: string }): string | undefined {
  const van = jaarVan(set.geldigVan);
  const tot = jaarVan(set.geldigTot);
  if (van && tot) return van === tot ? van : `${van}–${tot}`;
  if (tot) return `tot ${tot}`;
  if (van) return `ze golden sinds ${van}`;
  return undefined;
}

/** Eén set zoals ze in een lijst staat: de geldigheid uit de index, of afgeleid uit het geladen bestand. */
export interface SetGeldigheid {
  code?: GeldigheidCode;
  tekst?: string;
}

/**
 * De geldigheid van een set voor in een lijst. De index heeft ze (sinds de geldigheid per set erin staat) of niet
 * (oudere index): dan helpt het geladen bestand, als dat er al is. Zonder beide: onbekend.
 */
export function geldigheidVoorLijst(set: MinimumdoelenIndexSet, bestand?: MinimumdoelenSetBestand): SetGeldigheid {
  const uitIndex = geldigheidVan(set);
  if (uitIndex !== undefined) return { code: uitIndex, tekst: geldigheidTekst(set) };
  if (bestand) return { code: geldigheidVanBestand(bestand), tekst: geldigheidTekstVanBestand(bestand) };
  return {};
}

// ── Sets voorstellen bij een vak ────────────────────────────────────────────

export type OnderwijsKeuze = Exclude<SoortOnderwijs, 'ander'>;

/** Woorden uit het vak om sets op te herkennen: "Natuurwetenschappen" → ["natuurwetenschappen"]. */
function vakWoorden(vak: string): string[] {
  return zonderAccenten(vak).split(/[^\p{L}\d]+/u).filter((w) => w.length >= 3);
}

export interface KandidaatOpties {
  graad: string;
  stroom: string;
  onderwijs: OnderwijsKeuze;
  vak: string;
  /** Sets die het leerplan al heeft: die staan altijd bij de kandidaten, vooraan. */
  eigen: readonly string[];
}

/**
 * De sets die we voorstellen: `stelSetsVoor` bij graad en stroom, gefilterd op de soort onderwijs
 * (`soortVanSet`). Sets waarvan de naam het vak noemt komen vóór de rest, en sets die het leerplan al
 * had staan helemaal vooraan. Geen enkele set komt twee keer voor.
 *
 * Een vak als "aardrijkskunde" noemt de naam van "Ruimtelijk bewustzijn" niet, maar hoort er wel bij: de
 * zoektabel (vakZoektabel.ts) laat zulke sets mee vooraan staan. Dat is een hulp bij het zoeken, geen koppeling.
 */
export function kandidaatSets(index: readonly MinimumdoelenIndexSet[], opties: KandidaatOpties): MinimumdoelenIndexSet[] {
  const voorgesteld = stelSetsVoor(index, { graad: opties.graad, stroom: opties.stroom }).filter(
    (s) => soortVanSet(s.naam) === opties.onderwijs,
  );
  const woorden = vakWoorden(opties.vak);
  const frases = [...new Set(woorden.flatMap((w) => competentieFrases(w)))];
  const noemtVak = (s: MinimumdoelenIndexSet) => {
    if (woorden.length === 0) return false;
    const hooi = zonderAccenten(`${s.korteNaam ?? ''} ${s.naam}`);
    const delen = hooi.split(/[^\p{L}\d]+/u);
    return woorden.some((w) => delen.some((d) => d === w || (w.length >= 5 && d.startsWith(w)))) || frases.some((f) => bevatFrase(hooi, f));
  };
  const eigen = opties.eigen.map((id) => index.find((s) => s.id === id)).filter((s): s is MinimumdoelenIndexSet => s !== undefined);
  const gezien = new Set<string>();
  const uit: MinimumdoelenIndexSet[] = [];
  for (const s of [...eigen, ...voorgesteld.filter(noemtVak), ...voorgesteld.filter((s) => !noemtVak(s))]) {
    if (gezien.has(s.id)) continue;
    gezien.add(s.id);
    uit.push(s);
  }
  return uit;
}

// ── Welke stroom? ───────────────────────────────────────────────────────────

/**
 * Staan er sets van de A-stroom én van de B-stroom tussen? Een leerplan is voor één stroom: verwijzingen
 * naar beide stromen zijn bijna altijd een vergissing.
 */
export function gemengdeStromen(sets: readonly { stroom?: string }[]): boolean {
  const stroomVan = (s: { stroom?: string }) => /^([ab])[\s-]*stroom/i.exec((s.stroom ?? '').trim())?.[1].toLowerCase();
  const stromen = new Set(sets.map(stroomVan));
  return stromen.has('a') && stromen.has('b');
}
