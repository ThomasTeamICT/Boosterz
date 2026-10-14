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
// binnen; de rest zijn types. Uit `gatenWeergave.ts` komt hier bewust alleen een type: zie `nogNodig` en
// `bkFoutBijBestaandeCursus`.

import type { BkMelding } from './bkLeerplan';
import { enkelOfMeer, kortTekst, redenTekst, somLijst, statusTekst } from './dekkingWeergave';
import { percentVan, type NietMeeReden } from './dekkingMinimumdoelen';
import type { foutBijBestaandeCursus, PlanTeksten } from './gatenWeergave';
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

/** "De competenties van ‘Onthaalmedewerker’": de naam waarmee een kaart over zichzelf spreekt. Zonder titel: "deze beroepskwalificatie". */
function competentiesVanKaart(titel: string): string {
  const t = typeof titel === 'string' ? titel.trim() : '';
  return t === '' ? 'De competenties van deze beroepskwalificatie' : `De competenties van ‘${t}’`;
}

/** De laadregel van één kaart: "De competenties van ‘Onthaalmedewerker’ worden geladen…". Het meervoud van de sectie (`BK_LADEN`) klopt voor één kaart niet. */
export function bkKaartLaden(titel: string): string {
  return `${competentiesVanKaart(titel)} worden geladen…`;
}

/**
 * De foutmelding van één kaart: "De competenties van ‘Onthaalmedewerker’ konden niet geladen worden. Controleer je
 * verbinding en probeer opnieuw." Zijn de bestanden beschadigd (`beschadigd`), dan helpt de verbinding niet en zegt de zin dat
 * ze "beschadigd zijn", zoals de melding van de sectie.
 */
export function bkKaartFout(titel: string, beschadigd = false): string {
  return beschadigd
    ? `${competentiesVanKaart(titel)} zijn beschadigd en konden niet gelezen worden. Probeer het later opnieuw.`
    : `${competentiesVanKaart(titel)} konden niet geladen worden. Controleer je verbinding en probeer opnieuw.`;
}

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
  return `Bron: Vlaamse overheid, Onderwijs en Vorming, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen${datum !== '' ? `, opgehaald op ${datum}` : ''}. Boosterz toont de competenties letterlijk en verzint geen koppelingen.`;
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
  return `${eerste} ${bkStaartTekst(d)}`;
}

/**
 * De staart van de samenvatting, zolang niet alles gedekt is: "4 competenties staan al gepland op een sectie die nog leeg
 * is, 1 komt alleen in verdieping aan bod, 11 nog niet." (bij één "1 competentie staat al gepland …"). Gedeeld door
 * `bkSamenvatting` (de richting) en `bkCursusSamenvatting` (de editor), zodat de twee nooit uit elkaar lopen.
 */
export function bkStaartTekst(d: Pick<BkTelling, 'gepland' | 'verdieping' | 'open'>): string {
  const gepland = d.gepland === 1 ? '1 competentie staat al gepland' : `${d.gepland} competenties staan al gepland`;
  const verdieping = d.verdieping === 1 ? '1 komt alleen in verdieping aan bod' : `${d.verdieping} komen alleen in verdieping aan bod`;
  return `${gepland} op een sectie die nog leeg is, ${verdieping}, ${d.open} nog niet.`;
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

// ── Plannen (§ 24) ──────────────────────────────────────────────────────────
//
// Fase 3b: de dekking op competenties in de cursuseditor, het plannen van wat nog nergens aan bod komt (de knop bij de
// richting, het venster en het paneel in de editor). Elke zin van § 24.6 staat hier, letterlijk, met enkelvoud en meervoud.
// Het is de spiegel van `gatenWeergave.ts` (de minimumdoelen), met andere woorden. Een competentie is een de-woord: "Plan ze
// in deze cursus", "Zet ze in deze cursus", "haar leerplan" en "hun beroepskwalificatie" (F3b-B12).
//
// Een percentage staat alleen bij één beroepskwalificatie, nooit samengeteld (F3b-B9). De korte regel van Mijn richtingen en
// de klas (`bkRijZin`) staat niet hier maar in `richtingOverzicht.ts`: die schermen laden dit bestand niet mee.

/** Een aantal als geheel getal van 0 of meer: een negatief of ongeldig aantal wordt 0, zodat er nooit "-1 competenties" staat. */
function geheel(n: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

// De cursuseditor (§ 24.6.1)

/**
 * De samenvatting in de editor (`aria-live`):
 * - één beroepskwalificatie: "Deze cursus dekt 5 van de 12 competenties van Onthaalmedewerker (42 %)." (het percentage is
 *   `percentVan`: 99 en niet 100 zolang er een niet gedekt is);
 * - meer: "Deze cursus dekt 9 van de 25 competenties van 2 beroepskwalificaties.", zonder percentage;
 * - zolang niet alles gedekt is, erachter de staart van `bkSamenvatting` (`bkStaartTekst`).
 *
 * `bks.aantal` is het aantal beroepskwalificaties in de meting en `bks.titel` de naam van de enige (zonder naam staat er
 * "deze beroepskwalificatie"). Bij één competentie in het kader: "Deze cursus dekt de enige competentie van X (100 %).", en
 * zolang ze niet gedekt is "… X nog niet (0 %).". Zonder competenties: "Er zijn geen competenties om te dekken."
 */
export function bkCursusSamenvatting(
  d: Pick<BkTelling, 'totaal' | 'gedekt' | 'gepland' | 'verdieping' | 'open'>,
  bks: { aantal: number; titel?: string },
): string {
  const totaal = geheel(d.totaal);
  if (totaal === 0) return 'Er zijn geen competenties om te dekken.';
  const gedekt = Math.min(geheel(d.gedekt), totaal);
  const aantalBks = geheel(bks.aantal);
  const eenBk = aantalBks <= 1;
  const titel = typeof bks.titel === 'string' ? bks.titel.trim() : '';
  const van = eenBk ? (titel !== '' ? titel : 'deze beroepskwalificatie') : beroepskwalificaties(aantalBks);
  const percent = eenBk ? ` (${percentVan(gedekt, totaal)} %)` : '';
  const eerste = totaal === 1
    ? `Deze cursus dekt de enige competentie van ${van}${gedekt >= 1 ? '' : ' nog niet'}${percent}.`
    : `Deze cursus dekt ${gedekt} van de ${totaal} competenties van ${van}${percent}.`;
  if (gedekt >= totaal) return eerste;
  return `${eerste} ${bkStaartTekst({ gepland: geheel(d.gepland), verdieping: geheel(d.verdieping), open: geheel(d.open) })}`;
}

/**
 * Competenties in het leerplan van de cursus die niet meer in de officiële lijst van hun beroepskwalificatie staan:
 * "2 competenties uit het leerplan van deze cursus staan niet meer in de officiële lijst van hun beroepskwalificatie. Bij de
 * studierichting zie je wat er veranderde." (bij één "1 competentie … staat … haar beroepskwalificatie"). Leeg bij 0.
 */
export function bkBuitenKaderTekst(n: number): string {
  const k = geheel(n);
  if (k < 1) return '';
  return k === 1
    ? '1 competentie uit het leerplan van deze cursus staat niet meer in de officiële lijst van haar beroepskwalificatie. Bij de studierichting zie je wat er veranderde.'
    : `${k} competenties uit het leerplan van deze cursus staan niet meer in de officiële lijst van hun beroepskwalificatie. Bij de studierichting zie je wat er veranderde.`;
}

/** De regel boven de knop: "8 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie." (bij één "1 competentie … staat …"). */
export function bkEditorRegel(n: number): string {
  const k = geheel(n);
  return k === 1
    ? '1 competentie uit het leerplan van deze cursus staat nog op geen enkele sectie.'
    : `${k} competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.`;
}

/** De knop die het paneel opent. Ook bij één competentie "ze": een competentie is een de-woord. */
export const BK_EDITOR_KNOP = 'Plan ze in deze cursus';

/** Onder de kop "Plan in deze cursus" (`PANEEL_TITEL`, dezelfde kop als bij de minimumdoelen). */
export const BK_PANEEL_UITLEG =
  'Boosterz zet ze als lege secties met de doelcode en de kennis en vaardigheden erop achteraan in je cursus, of achteraan in het hoofdstuk van hun beroepskwalificatie. Wat al in de cursus staat, blijft zoals het is.';

/** De vakjes (fieldset) van het paneel en van het venster, bij de competenties. Het vakje zelf is `bkLegende`, de teller `bkTeller`. */
export const BK_PLAN_LEGEND = 'Welke competenties?';
export const BK_PLAN_HINT = 'Vink uit wat in een andere cursus thuishoort.';
export const BK_PLAN_TOON = 'Toon de competenties';
/** Het stuk achter "Nog nodig: " als er nog geen competentie gekozen is. */
export const BK_PLAN_NODIG = 'minstens één competentie';

/** Competenties die deze cursus niet dekt en die niet in haar leerplan staan: "4 andere competenties die deze cursus niet dekt, staan niet in haar leerplan." Leeg bij 0. */
export function bkAndereOpenTekst(n: number): string {
  const k = geheel(n);
  if (k < 1) return '';
  return k === 1
    ? '1 andere competentie die deze cursus niet dekt, staat niet in haar leerplan.'
    : `${k} andere competenties die deze cursus niet dekt, staan niet in haar leerplan.`;
}

/** De toast in de editor: "8 competenties staan nu gepland in deze cursus." (bij één "1 competentie staat nu gepland …"). */
export function bkGeplandInDezeCursusToast(n: number): string {
  const k = geheel(n);
  return `${k === 1 ? '1 competentie staat' : `${k} competenties staan`} nu gepland in deze cursus.`;
}

/** Er is niets te doen: alles staat al op een sectie van de cursus. */
export const BK_FOUT_NIETS_TE_DOEN = 'Deze competenties staan al op een sectie van deze cursus. Er is niets veranderd.';
/** Het leerplan van de cursus werd intussen verwijderd: dezelfde zin als `FOUT_LEERPLAN_WEG` bij de minimumdoelen (hier los van die module). */
export const BK_FOUT_LEERPLAN_WEG = 'Het leerplan van deze cursus bestaat niet meer. Er is niets veranderd.';
/** Het leerplan van de cursus werd intussen aangepast en bevat geen enkele gekozen competentie meer. */
export const BK_FOUT_NIET_MEER_IN_LEERPLAN = 'De gekozen competenties staan intussen niet meer in het leerplan van deze cursus. Er is niets veranderd.';

// De richtingpagina: de knop (§ 24.6.2)

/** De primaire knop onder de samenvatting: "Plan de 17 competenties die nog nergens aan bod komen", bij één "Plan de competentie die nog nergens aan bod komt". */
export function bkPlanKnopTekst(n: number): string {
  const k = geheel(n);
  return k === 1 ? 'Plan de competentie die nog nergens aan bod komt' : `Plan de ${k} competenties die nog nergens aan bod komen`;
}

/** In plaats van de knop, als er geen open competentie meer is. */
export const BK_GEEN_OPEN = 'Er zijn geen competenties meer die nergens aan bod komen.';

// Het venster (§ 24.6.3)

export const BK_PLAN_VENSTER_TITEL = 'Plan de competenties die nog nergens aan bod komen';
export const BK_PLAN_VENSTER_INTRO =
  'Boosterz zet de gekozen competenties als lege secties in een cursus, met de doelcode en de kennis en vaardigheden erop. Zo staan ze gepland; daarna werk je ze zelf uit. Een AI-sleutel heb je niet nodig.';
export const BK_PLAN_VENSTER_HINT = 'Competenties die al gepland staan of alleen in verdieping aan bod komen, blijven waar ze staan.';

/** Beroepskwalificaties waarvan de competenties nog niet in Boosterz staan: "Van 2 beroepskwalificaties staan de competenties nog niet in Boosterz: die kan je nog niet plannen." Leeg bij 0. */
export function bkPlanZonderBestandTekst(n: number): string {
  const k = geheel(n);
  if (k < 1) return '';
  return `Van ${beroepskwalificaties(k)} staan de competenties nog niet in Boosterz: die kan je nog niet plannen.`;
}

export const BK_GEEN_KANDIDAAT_HINT = 'Geen cursus van deze richting heeft een van de gekozen competenties in haar leerplan. Maak er een nieuwe cursus voor.';
export const BK_PLAN_TITEL_HINT = 'Boosterz maakt er een nagekeken leerplan bij met precies deze competenties, of gebruikt het leerplan dat er al is.';

/**
 * Hoeveel van de gekozen competenties in het leerplan van de cursus staan: "3 van de 4 gekozen competenties staan in haar
 * leerplan", "1 van de 4 gekozen competenties staat in haar leerplan" en bij één gekozen "De gekozen competentie staat in haar
 * leerplan" (staat ze er niet in: "… staat niet in haar leerplan"). `k` blijft tussen 0 en `n`; zonder gekozen competenties is er niets te zeggen.
 */
export function bkPassendTekst(k: number, n: number): string {
  const totaal = geheel(n);
  if (totaal < 1) return '';
  const passend = Math.min(geheel(k), totaal);
  if (totaal === 1) return passend >= 1 ? 'De gekozen competentie staat in haar leerplan' : 'De gekozen competentie staat niet in haar leerplan';
  return passend === 1
    ? `1 van de ${totaal} gekozen competenties staat in haar leerplan`
    : `${passend} van de ${totaal} gekozen competenties staan in haar leerplan`;
}

/**
 * Onder de lijst met cursussen: de cursussen die geen beroepskwalificatie volgen of geen van de gekozen competenties in hun
 * leerplan hebben (ook de cursussen met minimumdoelen horen erbij). Leeg bij 0.
 */
export function bkZonderPassendTekst(n: number): string {
  const k = geheel(n);
  if (k < 1) return '';
  return k === 1
    ? '1 andere cursus van deze richting volgt geen beroepskwalificatie of heeft geen van deze competenties in haar leerplan.'
    : `${k} andere cursussen van deze richting volgen geen beroepskwalificatie of hebben geen van deze competenties in hun leerplan.`;
}

/**
 * De voorbeeldzin bij een gekozen cursus (`aria-live`): `k` van de `n` gekozen competenties staan in het leerplan van de
 * cursus.
 * - Alle: "Alle 4 gekozen competenties staan in het leerplan van ‘…’. Ze komen er als lege secties bij, met de kennis en
 *   vaardigheden; wat al in de cursus staat, blijft zoals het is." Bij één gekozen: "De gekozen competentie staat … Ze komt
 *   er als lege sectie bij, …".
 * - Niet alle: "3 gekozen competenties staan niet in het leerplan van ‘…’ en komen er niet bij: Boosterz past een leerplan
 *   nooit zelf aan. Zet ze in een nieuwe cursus." Er is geen link naar het leerplan: aan een BK-leerplan valt niets aan te passen.
 */
export function bkVoorbeeldZin(cursusTitel: string, k: number, n: number): string {
  const totaal = geheel(n);
  if (totaal < 1) return '';
  const passend = Math.min(geheel(k), totaal);
  const titel = `‘${cursusTitel}’`;
  if (passend >= totaal) {
    return totaal === 1
      ? `De gekozen competentie staat in het leerplan van ${titel}. Ze komt er als lege sectie bij, met de kennis en vaardigheden; wat al in de cursus staat, blijft zoals het is.`
      : `Alle ${totaal} gekozen competenties staan in het leerplan van ${titel}. Ze komen er als lege secties bij, met de kennis en vaardigheden; wat al in de cursus staat, blijft zoals het is.`;
  }
  const weg = totaal - passend;
  return weg === 1
    ? `1 gekozen competentie staat niet in het leerplan van ${titel} en komt er niet bij: Boosterz past een leerplan nooit zelf aan. Zet ze in een nieuwe cursus.`
    : `${weg} gekozen competenties staan niet in het leerplan van ${titel} en komen er niet bij: Boosterz past een leerplan nooit zelf aan. Zet ze in een nieuwe cursus.`;
}

/**
 * De primaire knop bij "In een cursus die je al hebt": "Zet ze in deze cursus" (ook bij één gekozen competentie), en als niet
 * alle gekozen competenties in het leerplan staan "Zet de 3 competenties in deze cursus" (enkelvoud "Zet de competentie in
 * deze cursus"). `k` is het aantal dat in het leerplan staat, `n` het aantal gekozen competenties. In het paneel van de editor is `k` = `n`.
 */
export function bkZetKnopTekst(k: number, n: number): string {
  const totaal = geheel(n);
  const passend = geheel(k);
  if (passend >= totaal || passend < 1) return 'Zet ze in deze cursus';
  return passend === 1 ? 'Zet de competentie in deze cursus' : `Zet de ${passend} competenties in deze cursus`;
}

/**
 * "Nog nodig: minstens één competentie en een titel." Leeg zonder delen. Dezelfde opmaak als `nogNodigTekst`
 * (`gatenWeergave.ts`), maar zonder die import: dit bestand zit in het chunk `richtingVenster`, dat ook de klas en de
 * cursuseditor laden zonder de weergave Minimumdoelen. Een import van `gatenWeergave.ts` laat Rollup er daar een eigen chunk
 * van maken (5,7 kB, ±2 kB gzip, een extra aanvraag) en verlengt de preloadlijst in de hoofdbundel (§ 24.8, F3b-B10).
 * Een test bewaakt dat de opmaak gelijk blijft aan `nogNodigTekst` en dat dit bestand geen waarde uit `gatenWeergave.ts` haalt.
 */
function nogNodig(delen: readonly string[]): string {
  if (delen.length === 0) return '';
  const som = delen.length === 1 ? delen[0] : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
  return `Nog nodig: ${som}.`;
}

/** Wat er in de voet staat zolang de knop nog niet kan: "Nog nodig: minstens één competentie en een titel." / "… en een cursus." Leeg als alles er is. */
export function bkVoetNodigTekst(o: { competenties: number; waar: 'nieuw' | 'bestaand'; titel: string; cursusGekozen: boolean }): string {
  const delen: string[] = [];
  if (geheel(o.competenties) < 1) delen.push(BK_PLAN_NODIG);
  if (o.waar === 'nieuw' && (typeof o.titel !== 'string' || o.titel.trim() === '')) delen.push('een titel');
  if (o.waar === 'bestaand' && !o.cursusGekozen) delen.push('een cursus');
  return nogNodig(delen);
}

/** De beroepskwalificaties zijn veranderd terwijl het venster openstond. */
export const BK_FOUT_VERANDERD = 'De beroepskwalificaties zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard.';

/**
 * De fout bij het zetten van competenties in een bestaande cursus (`bewaarGatenOpCursus`): dezelfde meldingen als bij de
 * minimumdoelen (opslag vol, cursus gewijzigd, verwijderd of aan een ander leerplan gehangen), behalve "niets te doen", die
 * over competenties gaat.
 *
 * De vier gedeelde zinnen staan hier nog eens, letterlijk zoals `FOUT_OPSLAG_VOL`, `FOUT_CURSUS_GEWIJZIGD`,
 * `FOUT_CURSUS_VERWIJDERD` en `FOUT_ANDER_LEERPLAN` in `gatenWeergave.ts`, om dezelfde reden als bij `nogNodig`: een import
 * van die constanten (ook alleen de constanten) trekt `gatenWeergave.ts` als eigen chunk naar `richtingVenster`. Een test
 * vergelijkt ze met de bron voor elke reden, en het type van `reden` komt van `foutBijBestaandeCursus` zelf.
 */
export function bkFoutBijBestaandeCursus(reden: Parameters<typeof foutBijBestaandeCursus>[0]): string {
  switch (reden) {
    case 'gewijzigd': return 'Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw.';
    case 'verwijderd': return 'Deze cursus bestaat niet meer. Er is niets veranderd.';
    case 'ander-leerplan': return 'Deze cursus hangt intussen aan een ander leerplan. Er is niets veranderd. Probeer opnieuw.';
    case 'niets-te-doen': return BK_FOUT_NIETS_TE_DOEN;
    default: return 'Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.';
  }
}

/** Na competenties in een bestaande cursus: "4 competenties staan nu gepland in ‘Onthaalmedewerker · 5de jaar’." (bij één "1 competentie staat nu gepland in ‘…’."). */
export function bkGeplandInCursusToast(n: number, cursusTitel: string): string {
  const k = geheel(n);
  return `${k === 1 ? '1 competentie staat' : `${k} competenties staan`} nu gepland in ‘${cursusTitel}’.`;
}

// ── Leerplanpagina en inleespagina (§ 23.7.5) ───────────────────────────────

// De twee labels en de zin voor de inleespagina staan in `bkLabels.ts`, zonder imports: de leerplanpagina en de inleespagina
// halen ze op en mogen daarmee niet de rest van dit bestand (en de dekking) mee binnentrekken. Ze blijven hier bereikbaar.
export { BK_EDITOR_GEWIJZIGD, BK_EDITOR_NAAR_RICHTING, BK_EDITOR_NIET_NAGEKEKEN, BK_LABEL_KOPIE, BK_LABEL_OFFICIEEL, bkInleesTekst } from './bkLabels';

// ── De teksten van de gedeelde schermdelen voor het plannen (3b-I1) ────────

/**
 * De teksten voor `GatenSetsKeuze` en `PlanInCursus` (`gatenWeergave.ts`, 3b-L1) als het om competenties gaat, zoals
 * `MD_PLAN_TEKSTEN` voor de minimumdoelen (§ 24.4 en § 24.6). Alleen een `satisfies` met een type: dit bestand haalt geen
 * waarde uit `gatenWeergave.ts` (zie `nogNodig`). "Competentie" is een de-woord: ook bij één competentie "Plan ze" en
 * "Zet ze" (F3b-B12).
 */
export const BK_PLAN_TEKSTEN = {
  legend: BK_PLAN_LEGEND,
  hint: BK_PLAN_HINT,
  toon: BK_PLAN_TOON,
  vakje: bkLegende,
  teller: bkTeller,
  regel: bkEditorRegel,
  knop: (_n: number) => BK_EDITOR_KNOP,
  uitleg: BK_PANEEL_UITLEG,
  zet: (n: number) => bkZetKnopTekst(n, n),
  toast: bkGeplandInDezeCursusToast,
  nodig: BK_PLAN_NODIG,
  nietsTeDoen: BK_FOUT_NIETS_TE_DOEN,
  leerplanWeg: BK_FOUT_LEERPLAN_WEG,
  nietMeerInLeerplan: BK_FOUT_NIET_MEER_IN_LEERPLAN,
} satisfies PlanTeksten;
