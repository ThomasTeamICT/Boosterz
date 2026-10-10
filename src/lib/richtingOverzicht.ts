// "Mijn richtingen" en "een klas bij een richting": de logica (docs/STUDIERICHTINGEN.md § 22.5.3, F2.3 en F2.4).
//
// - `bijdragenVoorKader`: welke cursussen meetellen voor het kader van een richting. Dezelfde berekening als het detail
//   van de richting (F2-B10): het getal waarop je klikt, is het getal dat je daarna ziet.
// - `mijnRichtingen`: de rijen van het overzicht, zonder netwerk en zonder matrix, uit de cursussen, hun leerplannen en
//   de klassen van dit toestel.
// - De zinnen met getallen (meta van een rij, dekking van een rij of een klas) staan hier, met enkelvoud en meervoud,
//   zodat de schermen geen eigen zinnen bouwen.
//
// Puur: geen React, geen opslag, geen netwerk, geen klok (`vandaag` komt van de aanroeper). Nooit een groepnummer in een
// tekst voor het scherm.

import type { ClassGroup } from './classTypes';
import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { cursussenVoorRichting, type CursusBijdrage, type MdDekking } from './dekkingMinimumdoelen';
import { enkelOfMeer, richtingLinkNaar, somLijst } from './dekkingWeergave';
import { doelgroepVoorKlas, graadTekst, jaarTekst, type Doelgroep } from './doelgroep';
import { doelgroepVanCursus } from './doelgroepGebruik';
import { kaderGroepSleutel, richtingInfo, type RichtingInfo, type SoortKeuze } from './richtingKader';
import { vergelijkGroepnummer, type MatrixBestand } from './studierichtingen';

// ── Welke cursussen tellen mee voor het kader ───────────────────────────────

/**
 * De cursussen die meetellen voor het doelenkader van een richting, elk met haar leerplan (als het op dit toestel staat),
 * in de volgorde van `courses`.
 *
 * Een cursus hoort erbij als haar doelgroep dezelfde `kaderGroepSleutel` heeft als de richting (`soort` is het soort
 * onderwijs van het kader): in de 1ste graad horen het 1ste en het 2de leerjaar van een stroom dus samen. Voor een
 * andere groep zoekt de functie de richting op in de matrix; een groep die niet in de matrix staat, hoort nergens bij.
 * `jaar`: alleen cursussen met dat jaar of zonder jaar (zie `cursussenVoorRichting`).
 *
 * Dit is precies de berekening die `useRichtingDekking` deed voor ze hier kwam; de test vergelijkt ze met een letterlijke
 * kopie van die oude code.
 */
export function bijdragenVoorKader(o: {
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  info: RichtingInfo;
  soort: SoortKeuze;
  matrix: MatrixBestand;
  vandaag: string;
  jaar?: number;
}): CursusBijdrage[] {
  const { courses, curricula, info, soort, matrix, vandaag, jaar } = o;
  const eigenSleutel = kaderGroepSleutel(info, soort);
  const anderen = new Map<string, RichtingInfo | undefined>();
  const hoort = (d: Doelgroep): boolean => {
    let i: RichtingInfo | undefined = info;
    if (d.groep !== info.groep.nummer) {
      if (!anderen.has(d.groep)) anderen.set(d.groep, richtingInfo(matrix, d.groep, vandaag));
      i = anderen.get(d.groep);
    }
    return i !== undefined && kaderGroepSleutel(i, d.soort) === eigenSleutel;
  };
  return cursussenVoorRichting(courses, curricula, hoort, jaar);
}

// ── Mijn richtingen ─────────────────────────────────────────────────────────

/** Eén rij van het overzicht: één richting (groepnummer) in één soort onderwijs. */
export interface MijnRichting {
  /** `groep|soort`, bv. "G-0193|so": de sleutel van de rij (nooit op het scherm). */
  sleutel: string;
  groep: string;
  soort: SoortKeuze;
  /**
   * De titel zoals de nieuwste doelgroep van de rij ze bewaarde; het scherm neemt die van de matrix zodra ze er is.
   * Leeg als geen enkele doelgroep van de rij een echte titel bewaarde (een doelgroep zonder titel krijgt bij het saneren
   * het groepnummer als titel, en dat mag nooit op het scherm): het scherm toont dan de titel van de matrix of een
   * neutrale tekst.
   */
  titel: string;
  graad?: 1 | 2 | 3;
  /** Aantal cursussen met deze richting (haar eigen doelgroep, anders die van haar leerplan). */
  cursussen: number;
  /** Aantal klassen met deze richting. */
  klassen: number;
  /**
   * De verschillende jaren (oplopend) van alle cursussen en klassen van de rij samen; leeg als geen enkele een jaar heeft.
   * Alleen voor de link (`linkVoorRij`), samen met `zonderJaar`.
   */
  jaren: number[];
  /** De verschillende jaren (oplopend) van de cursussen alleen; leeg als geen enkele cursus een jaar heeft. Voor de meta. */
  cursusJaren: number[];
  /** Minstens één cursus of klas van de rij heeft geen jaar: die geldt voor de hele graad, dus de rij deelt dan geen jaar. */
  zonderJaar: boolean;
}

/** Een klas telt hier mee met haar doelgroep, en (als maat voor "nieuwste") met haar `updatedAt`. */
type KlasVoorOverzicht = Pick<ClassGroup, 'doelgroep'> & { updatedAt?: number };

interface Rij {
  sleutel: string;
  groep: string;
  soort: SoortKeuze;
  titel: string;
  titelTijd: number;
  graad?: 1 | 2 | 3;
  cursussen: number;
  klassen: number;
  jaren: Set<number>;
  cursusJaren: Set<number>;
  zonderJaar: boolean;
}

function tijdVan(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * De richtingen waarvoor deze gebruiker cursussen of klassen heeft (§ 22.5.1), zonder matrix en zonder netwerk.
 *
 * - Een cursus telt via `doelgroepVanCursus` (haar eigen doelgroep, anders die van haar leerplan); een klas via haar
 *   `doelgroep`. Wat geen geldige doelgroep heeft, telt nergens.
 * - Eén rij per groepnummer en soort onderwijs: 1A en 2A (G-0307 en G-0311) zijn twee rijen, gewoon en buitengewoon
 *   onderwijs van dezelfde groep ook.
 * - Een richting met alleen een leerplan telt niet (V5).
 * - `titel` is die van de doelgroep met de nieuwste `updatedAt` (van de cursus of de klas); bij gelijke tijd de eerste in
 *   de volgorde cursussen, dan klassen. Een titel gelijk aan het groepnummer (zo vult het saneren een ontbrekende titel
 *   aan) telt niet: heeft een andere doelgroep van de rij een echte titel, dan geldt die, anders is `titel` leeg.
 * - `jaren` (alle cursussen en klassen, voor de link) en `cursusJaren` (alleen de cursussen, voor de meta) staan apart;
 *   `zonderJaar` onthoudt of een cursus of klas geen jaar heeft, want die geldt voor de hele graad.
 * - Volgorde: op titel (nederlands, zonder verschil in hoofdletters en accenten; een lege titel achteraan), dan op
 *   groepnummer, dan gewoon vóór buitengewoon. Welke groepen niet in de matrix staan, weet alleen het scherm: dat zet ze achteraan.
 */
export function mijnRichtingen(o: {
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  klassen: readonly KlasVoorOverzicht[];
}): MijnRichting[] {
  const rijen = new Map<string, Rij>();
  const tel = (d: Doelgroep | undefined, tijd: number, soortTeller: 'cursussen' | 'klassen'): void => {
    if (!d) return;
    const sleutel = `${d.groep}|${d.soort}`;
    let r = rijen.get(sleutel);
    if (!r) {
      r = {
        sleutel, groep: d.groep, soort: d.soort, titel: '', titelTijd: 0, cursussen: 0, klassen: 0,
        jaren: new Set(), cursusJaren: new Set(), zonderJaar: false,
      };
      rijen.set(sleutel, r);
    }
    // Een titel gelijk aan het groepnummer is geen titel: `sanitizeDoelgroep` vult die in als er geen was.
    if (d.titel !== d.groep && (r.titel === '' || tijd > r.titelTijd)) {
      r.titel = d.titel;
      r.titelTijd = tijd;
    }
    if (r.graad === undefined && d.graad !== undefined) r.graad = d.graad;
    if (d.jaar === undefined) {
      r.zonderJaar = true;
    } else {
      r.jaren.add(d.jaar);
      if (soortTeller === 'cursussen') r.cursusJaren.add(d.jaar);
    }
    r[soortTeller] += 1;
  };
  for (const course of o.courses) {
    if (!course) continue;
    tel(doelgroepVanCursus(course, o.curricula), tijdVan(course.updatedAt), 'cursussen');
  }
  for (const klas of o.klassen) {
    if (!klas) continue;
    // Een klas uit de opslag is al gesaneerd; wat hier binnenkomt (een test, een pakket) wordt het zekerheidshalve nog eens.
    tel(doelgroepVoorKlas(klas.doelgroep), tijdVan(klas.updatedAt), 'klassen');
  }
  return [...rijen.values()]
    .map<MijnRichting>((r) => ({
      sleutel: r.sleutel,
      groep: r.groep,
      soort: r.soort,
      titel: r.titel,
      ...(r.graad !== undefined ? { graad: r.graad } : {}),
      cursussen: r.cursussen,
      klassen: r.klassen,
      jaren: [...r.jaren].sort((a, b) => a - b),
      cursusJaren: [...r.cursusJaren].sort((a, b) => a - b),
      zonderJaar: r.zonderJaar,
    }))
    .sort((a, b) =>
      // Een rij zonder titel achteraan: het scherm zoekt de titel in de matrix en sorteert dan opnieuw.
      (a.titel === '' ? 1 : 0) - (b.titel === '' ? 1 : 0)
      || a.titel.localeCompare(b.titel, 'nl', { sensitivity: 'base' })
      || vergelijkGroepnummer(a.groep, b.groep)
      || (a.soort === b.soort ? 0 : a.soort === 'so' ? -1 : 1));
}

/** "3de jaar", "3de en 4de jaar", "5de, 6de en 7de jaar". Leeg zonder jaren. */
function jarenTekst(jaren: readonly number[]): string {
  const delen = jaren.map((j) => jaarTekst(j).replace(/ jaar$/, '')).filter(Boolean);
  return delen.length === 0 ? '' : `${somLijst(delen)} jaar`;
}

/**
 * De regel onder de titel van een rij: "2de graad · 3 cursussen (3de en 4de jaar) · 1 klas", "1 cursus", "nog geen
 * cursus · 2 klassen". Een richting van het buitengewoon onderwijs krijgt " · buitengewoon (OV4)" (zonder graad:
 * " · buitengewoon"). Of de richting afgebouwd is, staat niet in de rij maar in de matrix: de aanroeper geeft
 * `{ afgebouwd: true }` mee, dan staat er " · afgebouwd" achter.
 */
export function mijnRichtingMeta(r: MijnRichting, opties?: { afgebouwd?: boolean }): string {
  const delen: string[] = [];
  if (r.graad !== undefined) delen.push(graadTekst(r.graad));
  if (r.cursussen > 0) {
    // Alleen de jaren van de cursussen: een klas van een ander jaar zegt niets over wat de cursussen dekken.
    const jaren = jarenTekst(r.cursusJaren);
    delen.push(`${enkelOfMeer(r.cursussen, 'cursus', 'cursussen')}${jaren ? ` (${jaren})` : ''}`);
  } else {
    delen.push('nog geen cursus');
  }
  if (r.klassen > 0) delen.push(enkelOfMeer(r.klassen, 'klas', 'klassen'));
  if (r.soort === 'buso') delen.push(r.graad !== undefined ? 'buitengewoon (OV4)' : 'buitengewoon');
  if (opties?.afgebouwd) delen.push('afgebouwd');
  return delen.join(' · ');
}

/**
 * De link van een rij naar de pagina van de richting: met `?jaar=<j>` alleen als álle cursussen en klassen van de rij
 * hetzelfde jaar hebben, en `soort=buso` voor het buitengewoon onderwijs. Bij gemengde jaren, geen jaar, of een cursus of
 * klas zonder jaar (die geldt voor de hele graad) staat er geen jaar in de link.
 */
export function linkVoorRij(r: MijnRichting): string {
  const gedeeld = r.jaren.length === 1 && !r.zonderJaar;
  return richtingLinkNaar({ groep: r.groep, soort: r.soort, ...(gedeeld ? { jaar: r.jaren[0] } : {}) });
}

// ── De dekking in een zin ───────────────────────────────────────────────────

/** Alleen getallen, voor de rij en de klas: wat de dekking van een richting kort zegt. */
export interface DekkingKortGetallen {
  /** Verplichte minimumdoelen van het kader. */
  totaal: number;
  gedekt: number;
  /** Staan al gepland op een sectie die nog leeg is. */
  gepland: number;
  /** Zoals `MdDekking.percent`: nooit 100 zolang een verplicht doel niet gedekt is. */
  percent: number;
  /** De 1ste graad: het 1ste en het 2de jaar tellen samen. */
  eersteGraad: boolean;
}

/** De getallen van een dekking, voor de rij en de klas. Dezelfde getallen als het detail (`MdDekking`). */
export function kortVan(d: MdDekking, eersteGraad: boolean): DekkingKortGetallen {
  return { totaal: d.totaal, gedekt: d.gedekt, gepland: d.gepland, percent: d.percent, eersteGraad };
}

/** "de 171 minimumdoelen", en bij één doel "het enige minimumdoel". */
function minimumdoelen(n: number): string {
  return n === 1 ? 'het enige minimumdoel' : `de ${n} minimumdoelen`;
}

/** In de 1ste graad: de uitleg erachter, omdat de dekking over de hele graad gaat. */
const EERSTE_GRAAD_ZIN_KORT = 'Het 1ste en het 2de jaar tellen samen.';

/** " 4 staan gepland." / " 1 staat gepland." (leeg zonder geplande doelen) en in de 1ste graad de uitleg erachter. */
function staart(d: DekkingKortGetallen): string {
  const gepland = d.gepland > 0 ? (d.gepland === 1 ? ' 1 staat gepland.' : ` ${d.gepland} staan gepland.`) : '';
  return `${gepland}${d.eersteGraad ? ` ${EERSTE_GRAAD_ZIN_KORT}` : ''}`;
}

const GEEN_VERPLICHTE_DOELEN = 'Er zijn geen verplichte minimumdoelen om te dekken.';

/**
 * De dekking in een rij van "Mijn richtingen": "Je cursussen dekken 9 van de 171 minimumdoelen (5 %)." met erbij
 * " 4 staan gepland." (" 1 staat gepland.") en, in de 1ste graad, " Het 1ste en het 2de jaar tellen samen.".
 * Zonder verplichte doelen: "Er zijn geen verplichte minimumdoelen om te dekken." en niets erachter.
 */
export function dekkingRijZin(d: DekkingKortGetallen): string {
  if (d.totaal <= 0) return GEEN_VERPLICHTE_DOELEN;
  return `Je cursussen dekken ${d.gedekt} van ${minimumdoelen(d.totaal)} (${d.percent} %).${staart(d)}`;
}

/**
 * De dekking in het klasoverzicht (F2.4): "Je cursussen voor Natuurwetenschappen (2de graad) dekken 9 van de 171
 * minimumdoelen (5 %)." `richtingMetGraad` is de richting al in zijn zin (`richtingMetGraad` in dekkingWeergave.ts). Het
 * getal gaat over de hele richting, niet over wat deze klas kreeg (V4). Met dezelfde staart als de rij.
 */
export function klasDekkingZin(richtingMetGraad: string, d: DekkingKortGetallen): string {
  if (d.totaal <= 0) return GEEN_VERPLICHTE_DOELEN;
  return `Je cursussen voor ${richtingMetGraad} dekken ${d.gedekt} van ${minimumdoelen(d.totaal)} (${d.percent} %).${staart(d)}`;
}
