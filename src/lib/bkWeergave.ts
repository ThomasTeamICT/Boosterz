// Teksten en kleine hulpen voor de schermen over beroepskwalificaties (docs/STUDIERICHTINGEN.md § 23.7).
//
// Elke zin met een getal of een naam staat hier, met enkelvoud en meervoud, zodat ze getest zijn en de schermen (de sectie
// bij de richting, het venster "Nieuwe cursus", de dekking en de leerplanpagina) geen eigen zinnen bouwen. Ook de vaste
// zinnen staan hier, letterlijk zoals in § 23.7, zodat de schermen elkaar niet tegenspreken.
//
// Wat nooit in een tekst komt: een competentiecode, een ADV-nummer, een onderdeelnummer, een groepnummer of een set-id. Het
// BK-nummer ("BK-0390-2") staat alleen als bijkomende info in de meta van een kaart (`kaartMeta`, die op het scherm onder
// de titel staat), en verder alleen in namen die van de bron komen; nooit als enige naam, nooit in een kop of een knop.
// De doelcode ("BK-0390-2.03") is wel een code voor de leerkracht, zoals de codes van een leerplan; ze staat in de regel
// van een competentie (`competentieRegel`) en op de secties van het geraamte.
//
// Elk aantal competenties dat hier als getal binnenkomt, is het aantal met een tekst (`aantalCompetentiesMetTekst` in
// `dekkingBk.ts`), niet `bestand.aantal` of `RichtingBkRegel.aantal`: die tellen ook competenties zonder tekst mee, terwijl
// het leerplan, de dekking en de lijst ze weglaten (§ 23.6.4). Anders staat er 12 waar de lijst er 11 toont.
//
// Puur: geen React, geen opslag, geen netwerk. Alleen `percentVan` en de hulpen van de minimumdoelen komen als waarde
// binnen; de rest zijn types.

import type { BkMelding } from './bkLeerplan';
import { enkelOfMeer, kortTekst, redenTekst, somLijst, statusTekst } from './dekkingWeergave';
import { percentVan, type NietMeeReden } from './dekkingMinimumdoelen';
import type { BekrachtigingSoort } from './richtingBk';

// ── Kleine hulpen ───────────────────────────────────────────────────────────

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const BK_VERSIE = /^BK-\d{3,6}-\d{1,4}$/;

/**
 * "31 augustus 2027" uit "2027-08-31" (of een tijdstip dat met die dag begint). Leeg voor iets dat geen echte dag is: een
 * zin met een ontbrekende datum kan dan beter wegblijven dan kapotte tekst tonen.
 */
export function datumTekst(datum: string | undefined): string {
  const m = typeof datum === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(datum) : null;
  if (!m) return '';
  const maand = Number(m[2]);
  const dag = Number(m[3]);
  return maand >= 1 && maand <= 12 && dag >= 1 && dag <= 31 ? `${dag} ${MAANDEN[maand - 1]} ${m[1]}` : '';
}

/** Titels zonder lege, zonder dubbels, in de gegeven volgorde. */
function uniekeTitels(titels: readonly string[]): string[] {
  const uit: string[] = [];
  for (const t of Array.isArray(titels) ? titels : []) {
    const naam = typeof t === 'string' ? t.trim() : '';
    if (naam !== '' && !uit.includes(naam)) uit.push(naam);
  }
  return uit;
}

const competenties = (n: number) => enkelOfMeer(n, 'competentie', 'competenties');
const beroepskwalificaties = (n: number) => enkelOfMeer(n, 'beroepskwalificatie', 'beroepskwalificaties');

// ── Kopregel onder de titel van de richting (§ 23.7.1) ──────────────────────

/** De knop naast de kopregel: scrolt naar de sectie en zet de focus op haar kop. */
export const BK_KOP_KNOP = 'Naar de beroepskwalificaties';

/**
 * De kopregel: tot drie beroepskwalificaties met naam ("Beroepskwalificaties: Onthaalmedewerker en Recreatief
 * medewerker."), bij meer de eerste drie en het aantal andere ("… Baliemedewerker en 2 andere."). Leeg zonder titels:
 * dan staat er geen regel.
 */
export function bkKopRegel(titels: readonly string[]): string {
  const lijst = uniekeTitels(titels);
  if (lijst.length === 0) return '';
  if (lijst.length <= 3) return `Beroepskwalificaties: ${somLijst(lijst)}.`;
  return `Beroepskwalificaties: ${lijst.slice(0, 3).join(', ')} en ${lijst.length - 3} andere.`;
}

// ── De sectie (§ 23.7.2) ────────────────────────────────────────────────────

export const BK_SECTIE_TITEL = 'Beroepskwalificaties';
export const BK_LADEN = 'De beroepskwalificaties worden geladen…';
export const BK_NOG_NIET_OPGEHAALD = 'De beroepskwalificaties van deze richting zijn nog niet opgehaald. Boosterz haalt ze elke maand op bij de Vlaamse overheid.';
export const BK_GEEN = 'De officiële bron koppelt geen beroepskwalificatie aan deze richting. De beroepsgerichte doelen staan dan in het leerplan van je net.';

/** "Bij deze richting horen 2 beroepskwalificaties." / "Bij deze richting hoort 1 beroepskwalificatie." Zonder: "… hoort geen …". */
export function bkIntroAantal(n: number): string {
  if (n <= 0) return 'Bij deze richting hoort geen beroepskwalificatie.';
  return n === 1 ? 'Bij deze richting hoort 1 beroepskwalificatie.' : `Bij deze richting horen ${n} beroepskwalificaties.`;
}

export const BK_INTRO_UITLEG = 'Een beroepskwalificatie beschrijft wat iemand moet kunnen om een beroep uit te oefenen: de competenties, met de kennis en vaardigheden die erbij horen. De beroepsgerichte vorming van de richting is erop gebouwd; de minimumdoelen hierboven gaan vooral over de basisvorming.';

export const BK_NIVEAU_VRAAG = 'Wat betekent het niveau?';
export const BK_NIVEAU_UITLEG = 'Het niveau in de Vlaamse kwalificatiestructuur gaat van 1 tot 8. Hoe hoger, hoe zelfstandiger en complexer het werk.';

export interface KaartMetaIn {
  /** BK-versie, bv. "BK-0390-2": komt als officieel nummer achter de rest. */
  bk: string;
  /** Niveau 1 tot 8; zonder valt dat deel weg. */
  vks?: number;
  /**
   * Aantal competenties met een tekst in het bestand (`aantalCompetentiesMetTekst(bestand)`, de lijst van het leerplan en de
   * dekking); zonder bestand valt dat deel weg. Nooit `bestand.aantal` of `RichtingBkRegel.aantal`: die tellen ook
   * competenties zonder tekst mee.
   */
  aantal?: number;
  /** De namen van de varianten (`variantLabels`) waarin de beroepskwalificatie alleen geldt; leeg of weg = in alle varianten. */
  alleenIn?: readonly string[];
  /** JJJJ-MM-DD: de laatste dag waarop de beroepskwalificatie bij de richting hoort. */
  totDatum?: string;
}

/**
 * De meta onder de titel van een kaart: "Niveau 3 · 12 competenties · officieel nummer BK-0390-2", met erachter
 * " · alleen in: duaal" en/of " · loopt af op 31 augustus 2027" als dat geldt. Het nummer staat dus na de titel (die er
 * boven staat) en nooit als enige naam. Een ongeldig nummer of een ongeldige datum valt weg.
 */
export function bkKaartMeta(o: KaartMetaIn): string {
  const delen: string[] = [];
  if (typeof o.vks === 'number' && Number.isInteger(o.vks) && o.vks >= 1 && o.vks <= 8) delen.push(`Niveau ${o.vks}`);
  if (typeof o.aantal === 'number' && Number.isInteger(o.aantal) && o.aantal >= 0) delen.push(competenties(o.aantal));
  if (typeof o.bk === 'string' && BK_VERSIE.test(o.bk)) delen.push(`officieel nummer ${o.bk}`);
  let tekst = delen.join(' · ');
  const alleen = uniekeTitels(o.alleenIn ?? []);
  if (alleen.length > 0) tekst += `${tekst ? ' · ' : ''}alleen in: ${alleen.join(', ')}`;
  const einde = datumTekst(o.totDatum);
  if (einde !== '') tekst += `${tekst ? ' · ' : ''}loopt af op ${einde}`;
  return tekst;
}

export const BK_DEFINITIE_VRAAG = 'Wat houdt dit beroep in?';

/** "Toon de 12 competenties", bij één "Toon de competentie". */
export function bkToonCompetenties(n: number): string {
  if (n <= 0) return 'Geen competenties';
  return n === 1 ? 'Toon de competentie' : `Toon de ${n} competenties`;
}

/** "Kennis en vaardigheden (8 + 5)": het aantal kennisteksten en het aantal vaardigheden. */
export function bkKennisEnVaardigheden(kennis: number, vaardigheden: number): string {
  return `Kennis en vaardigheden (${Math.max(0, kennis)} + ${Math.max(0, vaardigheden)})`;
}
export const BK_KENNIS_KOP = 'Kennis';
export const BK_VAARDIGHEDEN_KOP = 'Vaardigheden';
export const BK_GEEN_KENNIS = 'De bron geeft bij deze competentie geen kennis of vaardigheden.';

/** Het soort competentie vooraan een competentie: "(Vakspecifieke competentie) ". Leeg zonder soort. */
export function bkSoortVoorvoegsel(soort: string | undefined): string {
  const t = typeof soort === 'string' ? soort.trim() : '';
  return t === '' ? '' : `(${t}) `;
}

export const BK_KNOP_CURSUS = 'Maak een cursus met deze competenties';
export const BK_KNOP_BEWAAR = 'Bewaar als leerplan';
export const BK_KNOP_OPEN = 'Open het leerplan';

/** Het stuk dat alleen een schermlezer hoort, achter een knop: " (Onthaalmedewerker)". Leeg zonder titel. */
export function bkKnopSrTekst(titel: string): string {
  const t = typeof titel === 'string' ? titel.trim() : '';
  return t === '' ? '' : ` (${t})`;
}

export const BK_NIEUWERE_VERSIE = 'Er bestaat een nieuwere erkende versie van deze beroepskwalificatie. De richting verwijst nog naar deze versie; Boosterz volgt de richting.';

/** "De Vlaamse overheid geeft deze versie sinds 3 december 2026 niet meer. Je ziet de laatst bekende competenties." */
export function bkNietMeerInBron(sinds: string | undefined): string {
  const datum = datumTekst(sinds);
  return `De Vlaamse overheid geeft deze versie ${datum !== '' ? `sinds ${datum} ` : ''}niet meer. Je ziet de laatst bekende competenties.`;
}

export const BK_ZONDER_BESTAND = 'De competenties van deze beroepskwalificatie staan nog niet in Boosterz. Boosterz vraagt ze bij de volgende maandelijkse update opnieuw.';
export const BK_NOG_NODIG_BESTAND = 'Nog nodig: de competenties van de beroepskwalificatie.';

export const BK_TOAST_BEWAARD = 'Leerplan bewaard en nagekeken.';
export const BK_TOAST_BIJGEWERKT = 'Leerplan bijgewerkt. De doelcodes in je cursussen blijven dezelfde.';

/** Het leerplan kon niet nagekeken bewaard worden: "… kon niet als nagekeken bewaard worden: <waarschuwing>. Er is niets bewaard." */
export function bkNietNagekeken(waarschuwing: string): string {
  const w = typeof waarschuwing === 'string' ? waarschuwing.trim().replace(/[.\s]+$/, '') : '';
  return w === ''
    ? 'Het leerplan kon niet als nagekeken bewaard worden. Er is niets bewaard.'
    : `Het leerplan kon niet als nagekeken bewaard worden: ${w}. Er is niets bewaard.`;
}

// Meldingen na een maandelijkse update (§ 23.6.6 en § 23.7.2).

export const BK_KNOP_ANDERE_VERSIE = 'Maak een leerplan met de versie van nu';
export const BK_HINT_ANDERE_VERSIE = 'Je cursussen blijven aan het oude leerplan hangen. De doelcodes van de nieuwe versie zijn andere: koppel een cursus pas om nadat je haar doelcodes nakeek.';
export const BK_KNOP_BIJWERKEN = 'Werk het leerplan bij';
export const BK_KNOP_NIEUWE_LIJST = 'Maak een nieuw leerplan met de lijst van nu';

/**
 * De tekst van een melding van `vergelijkMetBk`. `bkTitel` is de titel van de beroepskwalificatie ("Onthaalmedewerker"),
 * `leerplanTitel` die van het leerplan van de leerkracht. Het nummer van de versie komt er niet in.
 */
export function bkMeldingTekst(m: BkMelding, o: { bkTitel: string; leerplanTitel: string }): string {
  const bk = `‘${o.bkTitel}’`;
  const leerplan = `‘${o.leerplanTitel}’`;
  switch (m.soort) {
    case 'andere-versie':
      return `Je leerplan ${leerplan} volgt een vorige versie van ${bk}. De richting verwijst nu naar een nieuwe versie. Boosterz past je leerplan niet zelf aan.`;
    case 'tekst-aangepast':
      return `De officiële tekst van ${competenties(m.aantal)} van ${bk} werd aangepast sinds je ${leerplan} maakte.`;
    case 'lijst-aangepast':
      return `De officiële lijst competenties van ${bk} werd aangepast sinds je ${leerplan} maakte.`;
    default:
      return `Je leerplan ${leerplan} volgt ${bk}, maar die beroepskwalificatie hoort volgens de officiële bron niet meer bij deze richting. Je leerplan blijft werken.`;
  }
}

/** "Vanaf 1 september 2027 hoort bij deze richting: Onthaalmedewerker en Baliemedewerker." Leeg zonder geldige datum of titels. */
export function bkToekomstTekst(vanaf: string, titels: readonly string[]): string {
  const datum = datumTekst(vanaf);
  const lijst = uniekeTitels(titels);
  return datum === '' || lijst.length === 0 ? '' : `Vanaf ${datum} hoort bij deze richting: ${somLijst(lijst)}.`;
}

/** "Wat leerlingen in deze richting kunnen behalen (5)". */
export function bkBehaalbaarSamenvatting(n: number): string {
  return `Wat leerlingen in deze richting kunnen behalen (${Math.max(0, n)})`;
}

/**
 * De naam van een studiebekrachtiging met haar soort erachter: " (onderwijskwalificatie)", " (beroepskwalificatie)" of
 * " (deelkwalificatie)". De namen van de bron noemen hun soort meestal al ("Bewijs van beroepskwalificatie Onthaalmedewerker
 * (BK-0390-2)"): dan blijft de naam zoals ze is, anders stond de soort er twee keer. Bij het soort ‘ander’ blijft alleen de
 * naam.
 */
export function bkBekrachtigingTekst(naam: string, soort: BekrachtigingSoort): string {
  const n = typeof naam === 'string' ? naam.trim() : '';
  switch (soort) {
    case 'onderwijskwalificatie':
    case 'beroepskwalificatie':
    case 'deelkwalificatie':
      return n.toLowerCase().includes(soort) ? n : `${n} (${soort})`;
    default:
      return n;
  }
}

export const BK_DEELKWALIFICATIE_HINT = 'Een deelkwalificatie is een deel van een beroepskwalificatie. Welke competenties erbij horen, staat niet in de gegevens die Boosterz ophaalt.';

/**
 * De bronregel onder de sectie. `opgehaald` is het tijdstip (of de dag) waarop de koppeling opgehaald werd; zonder geldige
 * dag valt "opgehaald op …" weg.
 */
export function bkBronregel(opgehaald?: string): string {
  const datum = datumTekst(opgehaald);
  return `Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen${datum !== '' ? `, opgehaald op ${datum}` : ''}. Boosterz toont de competenties letterlijk en verzint geen koppelingen.`;
}

/** De bestaande zin bij de doelen van een richting, als het kader beroepskwalificaties heeft (vervangt "… staan in het leerplan van je net."). */
export const BK_ZIN_RICHTING = 'De beroepsgerichte vorming staat in de beroepskwalificaties van deze richting, verderop op deze pagina.';
/** Dezelfde zin in het venster "Nieuwe cursus". */
export const BK_ZIN_VENSTER = 'De beroepsgerichte vorming staat in de beroepskwalificaties van deze richting: kies daarvoor ‘De competenties van een beroepskwalificatie’.';

// ── Het venster "Nieuwe cursus" (§ 23.7.3) ──────────────────────────────────

export const BK_KEUZE_LABEL = 'De competenties van een beroepskwalificatie';
export const BK_KEUZE_HINT = 'Boosterz maakt een nagekeken leerplan met precies de competenties die je kiest. Minimumdoelen en competenties komen in aparte leerplannen: een cursus volgt één leerplan.';
export const BK_KEUZE_TIP = 'Geef je een beroepsgericht vak? Kies dan de competenties van een beroepskwalificatie.';
export const BK_GERAAMTE_HINT = 'Een hoofdstuk per beroepskwalificatie en een sectie per competentie, met de doelcode en de kennis en vaardigheden erop. Zolang een sectie leeg is, telt ze als ‘gepland’, nog niet als gedekt.';
export const BK_VENSTER_LADEN = BK_LADEN;
export const BK_VENSTER_FOUT = 'Een beroepskwalificatie kon niet geladen worden. Probeer opnieuw.';

/** De legende van de vakjes van één beroepskwalificatie: "Onthaalmedewerker · 12 competenties". */
export function bkLegende(titel: string, aantal: number): string {
  return `${typeof titel === 'string' ? titel.trim() : ''} · ${competenties(aantal)}`;
}

/** Het vakje voor alle competenties: "Alle 12 competenties", bij één "De enige competentie". */
export function bkAlleCompetenties(n: number): string {
  if (n <= 0) return 'Geen competenties';
  return n === 1 ? 'De enige competentie' : `Alle ${n} competenties`;
}

/** De samenvatting van "Kies zelf de competenties (12 van 12)". */
export function bkKiesZelf(gekozen: number, totaal: number): string {
  return `Kies zelf de competenties (${Math.max(0, gekozen)} van ${Math.max(0, totaal)})`;
}

/**
 * De teller onder de vakjes: "Je koos 12 competenties uit 1 beroepskwalificatie.", "Je koos 25 competenties uit 2
 * beroepskwalificaties.", "Je koos 1 competentie uit 1 beroepskwalificatie." en "Je koos nog geen competenties.". Met
 * competenties maar zonder beroepskwalificaties (kan niet) telt het als één.
 */
export function bkTeller(aantalCompetenties: number, aantalBks: number): string {
  if (aantalCompetenties <= 0) return 'Je koos nog geen competenties.';
  return `Je koos ${competenties(aantalCompetenties)} uit ${beroepskwalificaties(Math.max(1, aantalBks))}.`;
}

/**
 * De voet van het venster: wat er nog nodig is om de cursus te maken ("Nog nodig: een titel, minstens één competentie."), of
 * leeg als alles er is.
 */
export function bkNogNodig(o: { titel: boolean; competenties: boolean }): string {
  const delen: string[] = [];
  if (o.titel) delen.push('een titel');
  if (o.competenties) delen.push('minstens één competentie');
  return delen.length === 0 ? '' : `Nog nodig: ${delen.join(', ')}.`;
}

export const BK_TOAST_HERGEBRUIK = ' Er stond al een leerplan met precies deze competenties: de cursus hangt daaraan.';

/**
 * De melding na "Maak de cursus":
 * - met een geraamte: "Cursus gemaakt: 1 hoofdstuk, 12 competenties klaar op de secties.";
 * - leeg: "Cursus gemaakt met 12 competenties van Onthaalmedewerker." (bij meer beroepskwalificaties "van 2 beroepskwalificaties");
 * - `hergebruikt`: erachter dat er al een leerplan met precies deze competenties stond.
 */
export function bkToastCursus(o: { start: 'geraamte' | 'leeg'; hoofdstukken: number; competenties: number; titels: readonly string[]; hergebruikt?: boolean }): string {
  const lijst = uniekeTitels(o.titels);
  const basis = o.start === 'geraamte'
    ? `Cursus gemaakt: ${enkelOfMeer(o.hoofdstukken, 'hoofdstuk', 'hoofdstukken')}, ${competenties(o.competenties)} klaar op de secties.`
    : `Cursus gemaakt met ${competenties(o.competenties)} van ${lijst.length === 1 ? lijst[0] : beroepskwalificaties(lijst.length)}.`;
  return o.hergebruikt === true ? `${basis}${BK_TOAST_HERGEBRUIK}` : basis;
}

// ── Dekking (§ 23.7.4) ──────────────────────────────────────────────────────

export const BK_DEKKING_TITEL = 'Competenties van de beroepskwalificaties';
export const BK_MD_TITEL = 'Minimumdoelen';
export const BK_TOON_ALLE = 'Alle competenties';
export const BK_TOON_OPEN = 'Nog niet gedekt';

/** Wat de zinnen nodig hebben van een dekking: een volledige `MdDekking` voldoet. */
export interface BkTelling {
  totaal: number;
  gedekt: number;
  gepland: number;
  verdieping: number;
  open: number;
  /** Alle cursussen van de richting; alleen die met `telt` tellen hier mee. */
  cursussen: readonly { telt: boolean }[];
}

function competentiesVan(totaal: number): string {
  return totaal === 1 ? 'de enige competentie' : `de ${totaal} competenties`;
}

/**
 * De samenvatting van het blok (§ 23.7.4): "Je cursussen dekken 9 van de 25 competenties." en, zolang er iets niet gedekt
 * is, "4 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 11 nog niet."
 * (bij één "1 competentie staat al gepland …"). Zonder cursus met competenties: "Nog geen cursus met competenties van deze
 * beroepskwalificaties: de dekking is 0 van de 25 competenties." Er is geen percentage in de zin: dat staat bij elke
 * beroepskwalificatie (`bkSetSamenvatting`).
 */
export function bkSamenvatting(d: BkTelling): string {
  if (d.totaal <= 0) return 'Er zijn geen competenties om te dekken.';
  const metBk = (Array.isArray(d.cursussen) ? d.cursussen : []).filter((c) => c && c.telt).length;
  if (metBk === 0) return `Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van ${competentiesVan(d.totaal)}.`;
  const eerste = `Je cursussen dekken ${d.gedekt} van ${competentiesVan(d.totaal)}.`;
  if (d.gedekt >= d.totaal) return eerste;
  const gepland = d.gepland === 1 ? '1 competentie staat al gepland' : `${d.gepland} competenties staan al gepland`;
  const verdieping = d.verdieping === 1 ? '1 komt alleen in verdieping aan bod' : `${d.verdieping} komen alleen in verdieping aan bod`;
  return `${eerste} ${gepland} op een sectie die nog leeg is, ${verdieping}, ${d.open} nog niet.`;
}

/**
 * De samenvatting van één beroepskwalificatie: "Onthaalmedewerker: 5 van 12 gedekt (42 %)". Het percentage is `percentVan`:
 * 99 en niet 100 zolang er een competentie niet gedekt is.
 */
export function bkSetSamenvatting(naam: string, gedekt: number, totaal: number): string {
  return `${typeof naam === 'string' ? naam.trim() : ''}: ${gedekt} van ${totaal} gedekt (${percentVan(gedekt, totaal)} %)`;
}

/** De regel van een competentie in de lijst: "<doelcode> — <tekst>" (de tekst ingekort tot `max` tekens op een woordgrens). */
export function bkCompetentieRegel(code: string, tekst: string, max = 200): string {
  return `${typeof code === 'string' ? code.trim() : ''} — ${kortTekst(typeof tekst === 'string' ? tekst : '', max)}`;
}

/**
 * De status van een competentie: "Gedekt in ‘<cursus>’", "Gepland in ‘<cursus>’ (de sectie is nog leeg)", "Alleen in
 * verdieping (‘<cursus>’)" of "Nog niet gedekt". Dezelfde zinnen als bij de minimumdoelen.
 */
export const bkStatusTekst = statusTekst;

/** "4 cursussen van deze richting volgen geen beroepskwalificatie en tellen hier niet mee." / "1 cursus … volgt … telt …". Leeg bij 0. */
export function bkNietMeetellendeTekst(n: number): string {
  if (n <= 0) return '';
  return n === 1
    ? '1 cursus van deze richting volgt geen beroepskwalificatie en telt hier niet mee.'
    : `${n} cursussen van deze richting volgen geen beroepskwalificatie en tellen hier niet mee.`;
}

/**
 * De reden waarom een cursus niet meetelt. Zonder leerplan of met een leerplan dat niet op dit toestel staat dezelfde zin
 * als bij de minimumdoelen; een leerplan zonder competenties volgt geen beroepskwalificatie.
 */
export function bkRedenTekst(reden: NietMeeReden, leerplanTitel?: string): string {
  if (reden !== 'geen-verwijzingen') return redenTekst(reden, leerplanTitel);
  return leerplanTitel
    ? `Telt niet mee: het leerplan ‘${leerplanTitel}’ volgt geen beroepskwalificatie.`
    : 'Telt niet mee: het leerplan van deze cursus volgt geen beroepskwalificatie.';
}

/**
 * "3 competenties zouden meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij
 * ‘Beroepskwalificaties’." (bij één "1 competentie zou meetellen …"). Leeg bij 0.
 */
export function bkAndereVersieTekst(n: number): string {
  if (n <= 0) return '';
  const begin = n === 1 ? '1 competentie zou' : `${n} competenties zouden`;
  return `${begin} meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij ‘Beroepskwalificaties’.`;
}

/** In het blok "Minimumdoelen": de reden bij een cursus die een beroepskwalificatie volgt (in plaats van "… verwijst niet naar minimumdoelen."). */
export const BK_MD_REDEN_BK_CURSUS = 'Telt hier niet mee: deze cursus volgt een beroepskwalificatie (zie ‘Competenties van de beroepskwalificaties’).';
/** Bij een cursus in "Cursussen voor deze richting" die een beroepskwalificatie volgt. */
export const BK_CURSUS_VOLGT_BK = 'Volgt een beroepskwalificatie: zie ‘Competenties van de beroepskwalificaties’ hieronder.';

// ── Leerplanpagina en inleespagina (§ 23.7.5) ───────────────────────────────

export const BK_LABEL_OFFICIEEL = 'Officiële beroepskwalificatie';
export const BK_LABEL_KOPIE = 'Kopie van een officiële beroepskwalificatie';

/** De zin op de inleespagina bij een BK-leerplan. */
export function bkInleesTekst(titel: string): string {
  return `${typeof titel === 'string' ? titel.trim() : ''} komt rechtstreeks uit een officiële beroepskwalificatie. Er valt niets in te lezen: de competenties staan letterlijk zoals in de officiële bron.`;
}
