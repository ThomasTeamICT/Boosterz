// "Mijn richtingen" en "een klas bij een richting": de logica (docs/STUDIERICHTINGEN.md § 22.5.3, F2.3 en F2.4).
//
// - `bijdragenVoorKader`: welke cursussen meetellen voor het kader van een richting. Dezelfde berekening als het detail
//   van de richting (F2-B10): het getal waarop je klikt, is het getal dat je daarna ziet.
// - `mijnRichtingen`: de rijen van het overzicht, zonder netwerk en zonder matrix, uit de cursussen, hun leerplannen en
//   de klassen van dit toestel.
// - De zinnen met getallen (meta van een rij, dekking van een rij of een klas) staan hier, met enkelvoud en meervoud,
//   zodat de schermen geen eigen zinnen bouwen.
// - De korte regel over de competenties van de beroepskwalificaties (fase 3b, § 24.4): `kanBkHebben`, `BkKort` en de
//   zin ervoor. Dit bestand zit in het gedeelde chunk van "Mijn richtingen" en de klas: het blijft licht, de zware logica
//   (`bkOverzicht.ts`) komt pas op vraag.
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
import type { RichtingBk } from './richtingBk';
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

// ── Beroepskwalificaties in de rij en de klas (§ 24.4 en § 24.6.4) ──────────

/**
 * Kan deze richting beroepskwalificaties hebben? Ja bij finaliteit A of DU, bij een 7de jaar, een aanloopjaar, het
 * buitengewoon onderwijs en de andere opleidingen (basisverpleegkunde heeft er een, G1 stap 3), zolang de richting niet
 * afgebouwd is. Nee bij doorstroomfinaliteit en in de 1ste graad: daar koppelt de officiële bron er geen (G1 stap 3:
 * 0 van de 59 en 0 van de 22 onderdelen).
 *
 * De poort van elk verzoek naar `public/leerplannen/kwalificaties/` (een 404 daar is een consolefout, § 23.15 R11, en
 * F3b-B10): wie dit niet eerst vraagt, haalt niets op. Ze stond in `useRichtingBk.ts`, dat ze verder uitvoert.
 */
export function kanBkHebben(info: RichtingInfo): boolean {
  if (info.afgebouwd) return false;
  const finaliteit = info.groep.finaliteit;
  if (finaliteit === 'A' || finaliteit === 'DU') return true;
  return info.soort === 'zevende' || info.soort === 'aanloop' || info.soort === 'buso' || info.soort === 'ander';
}

/**
 * Wat de rij en de klas kort zeggen over de competenties van de beroepskwalificaties van een richting. Alleen aantallen
 * en een titel, nooit een code (I7), en nooit een samengeteld percentage (W8, F3b-B9): `percent` staat er alleen bij
 * één beroepskwalificatie en is dan het percentage van die ene.
 *
 * - `zonder-cursus`: geen enkele cursus van de richting telt mee voor de competenties (er zijn geen bestanden geladen).
 *   `bks` is het aantal beroepskwalificaties (BK-versies) van de richting, `titel` hun titel als het er één is.
 * - `getallen`: er telt minstens één cursus mee. `bks` is het aantal beroepskwalificaties waarvan de competenties in de
 *   dekking zitten, `zonderBestand` het aantal van de richting waarvan de competenties nog niet in Boosterz staan.
 */
export type BkKort =
  | { soort: 'zonder-cursus'; bks: number; titel?: string }
  | {
    soort: 'getallen'; bks: number; titel?: string; totaal: number; gedekt: number; gepland: number;
    percent?: number; zonderBestand: number;
  };

/** De BK-versies van een kader, elk één keer, in de volgorde van het kader (tolerant voor kapotte invoer). */
function versiesVanKader(kader: Pick<RichtingBk, 'bks'>): RichtingBk['bks'] {
  const gezien = new Set<string>();
  const uit: RichtingBk['bks'] = [];
  for (const regel of Array.isArray(kader?.bks) ? kader.bks : []) {
    if (!regel || typeof regel.bk !== 'string' || gezien.has(regel.bk)) continue;
    gezien.add(regel.bk);
    uit.push(regel);
  }
  return uit;
}

function schoneTitel(titel: unknown): string {
  return typeof titel === 'string' ? titel.trim() : '';
}

/** Er telt geen enkele cursus mee: het aantal beroepskwalificaties en, bij één, haar titel uit het kader. */
export function bkKortZonderCursus(kader: Pick<RichtingBk, 'bks'>): BkKort {
  const regels = versiesVanKader(kader);
  const titel = regels.length === 1 ? schoneTitel(regels[0].titel) : '';
  return { soort: 'zonder-cursus', bks: regels.length, ...(titel !== '' ? { titel } : {}) };
}

/**
 * De getallen van een BK-dekking voor de rij en de klas. Telt geen enkele cursus mee, dan is het `bkKortZonderCursus`.
 * Anders komen `bks` en `titel` uit `d.perSet` (de beroepskwalificaties met competenties in de dekking), `percent` van `d`
 * alleen bij één beroepskwalificatie, en is `zonderBestand` het aantal beroepskwalificaties van het kader waarvan
 * `bestanden` het bestand niet heeft. Dezelfde getallen als het detail (I4): dat bewaart ze met deze functie.
 */
export function bkKortVan(d: MdDekking, kader: Pick<RichtingBk, 'bks'>, bestanden: ReadonlyMap<string, unknown>): BkKort {
  const cursussen = Array.isArray(d.cursussen) ? d.cursussen : [];
  if (!cursussen.some((c) => c && c.telt)) return bkKortZonderCursus(kader);
  const perSet = Array.isArray(d.perSet) ? d.perSet : [];
  const titel = perSet.length === 1 ? schoneTitel(perSet[0].setNaam) : '';
  const zonderBestand = versiesVanKader(kader).filter((r) => !bestanden.has(r.bk)).length;
  return {
    soort: 'getallen',
    bks: perSet.length,
    ...(titel !== '' ? { titel } : {}),
    totaal: d.totaal,
    gedekt: d.gedekt,
    gepland: d.gepland,
    ...(perSet.length === 1 ? { percent: d.percent } : {}),
    zonderBestand,
  };
}

/** Een titel op het einde van een zin: zonder punten of spaties achteraan, want de zin zet zelf een punt. */
function titelInZin(titel: string): string {
  return titel.replace(/[.\s]+$/, '');
}

/**
 * De korte regel over de competenties, voor de rij én de klas (§ 24.6.4):
 * - "Je cursussen dekken 5 van de 12 competenties van Onthaalmedewerker (42 %)." met erachter " 3 staan gepland."
 *   (" 1 staat gepland.");
 * - bij meer beroepskwalificaties "Je cursussen dekken 9 van de 25 competenties van 2 beroepskwalificaties.", zonder
 *   percentage;
 * - zijn er beroepskwalificaties zonder bestand: erachter " Van 1 beroepskwalificatie staan de competenties nog niet in
 *   Boosterz.";
 * - telt geen enkele cursus mee: "Nog geen cursus met de competenties van Onthaalmedewerker." (bij meer: "… van de 2
 *   beroepskwalificaties.").
 * Leeg bij getallen met totaal 0 en bij een kort zonder beroepskwalificaties: dan valt er niets te zeggen.
 */
export function bkRijZin(k: BkKort): string {
  const titel = k.bks === 1 && typeof k.titel === 'string' ? titelInZin(k.titel.trim()) : '';
  if (k.soort === 'zonder-cursus') {
    if (k.bks <= 0) return '';
    const van = titel !== '' ? titel : k.bks === 1 ? 'de beroepskwalificatie' : `de ${k.bks} beroepskwalificaties`;
    return `Nog geen cursus met de competenties van ${van}.`;
  }
  if (k.totaal <= 0) return '';
  const van = titel !== '' ? titel : enkelOfMeer(k.bks, 'beroepskwalificatie', 'beroepskwalificaties');
  // Een percentage alleen bij één beroepskwalificatie: samengeteld zegt het niets (W8).
  const percent = k.bks === 1 && typeof k.percent === 'number' && Number.isFinite(k.percent) ? ` (${k.percent} %)` : '';
  const competenties = k.totaal === 1 ? 'de enige competentie' : `de ${k.totaal} competenties`;
  const gepland = k.gepland > 0 ? (k.gepland === 1 ? ' 1 staat gepland.' : ` ${k.gepland} staan gepland.`) : '';
  const zonderBestand = k.zonderBestand > 0
    ? ` Van ${enkelOfMeer(k.zonderBestand, 'beroepskwalificatie', 'beroepskwalificaties')} staan de competenties nog niet in Boosterz.`
    : '';
  return `Je cursussen dekken ${k.gedekt} van ${competenties} van ${van}${percent}.${gepland}${zonderBestand}`;
}
