// De vaste Vlaamse teksten van het momentmodel (bouwstap 2b, zie docs/basisonderwijs/MOMENTMODEL.md).
//
// Alle zinnen die het blok "Wanneer gelden deze doelen?" uit het model haalt, staan hier op één plaats: de
// labels, de uitleg bij de zekerheid, de zinnen over de golf en de bronnen, en de kleine functies die er een zin
// van maken. Het blok zelf (WanneerGelden) bouwt er alleen de opmaak omheen.
//
// Afspraken: nooit het woord 'nagekeken' (dat is voor wat een mens of de nakijkpoort gecontroleerd heeft; de
// kalender is samengesteld, niet nagekeken) en nooit een zin die een koppeling van een oude op een nieuwe set
// beweert: die staat niet in de bron.

import { datumLeesbaar } from '../minimumdoelenBron';
import {
  INVOERINGSKALENDER,
  LEERJAREN_BASIS,
  nagelezenOp,
  type BronHoe,
  type Eindmoment,
  type Golf,
  type Invoeringskalender,
  type LeerjaarBasis,
  type MomentKalender,
  type Schooljaar,
  type Zekerheid,
} from './kalender';
import type { BasisSet, InvoeringReden, InvoeringStatus, SoortDoelen } from './moment';

// ─── Labels ─────────────────────────────────────────────────────────────────

export const EINDMOMENT_LABEL = {
  K3: 'Einde kleuteronderwijs (3de kleuterklas)',
  L4: 'Einde 4de leerjaar',
  L6: 'Einde 6de leerjaar',
} satisfies Record<Eindmoment, string>;

export const MOMENT_OUD_LABEL = {
  kleuter: 'Kleuteronderwijs',
  lager: 'Lager onderwijs (één set voor alle leerjaren)',
} satisfies Record<MomentKalender, string>;

export const SOORT_DOELEN_LABEL = {
  populatie: 'Te bereiken op populatieniveau',
  individueel: 'Te bereiken op individueel niveau',
  nastreven: 'Na te streven',
  ontwikkelingsdoelen: 'Ontwikkelingsdoelen (oud)',
  eindtermen: 'Eindtermen (oud)',
} satisfies Record<SoortDoelen, string>;

/**
 * 'vervangen' zegt alleen dat de oude set voor dat leerjaar niet meer verplicht is. Het noemt geen nieuwe set: de
 * koppeling van oude op nieuwe vakken staat niet in de bron.
 */
export const STATUS_LABEL = {
  verplicht: 'verplicht',
  mag: 'mag al',
  geldt: 'geldt nog',
  vervangen: 'niet meer verplicht',
  vervallen: 'geldt niet meer',
  'nog-niet': 'nog niet',
} satisfies Record<InvoeringStatus, string>;

/** De volgorde van de delen in de lijn 'Dit schooljaar'. */
export const STATUS_VOLGORDE: readonly InvoeringStatus[] = ['verplicht', 'mag', 'geldt', 'vervangen', 'vervallen', 'nog-niet'];

/** Het label van een badge. Bij 'zeker' komt er geen badge. */
export const ZEKERHEID_LABEL = {
  waarschijnlijk: 'waarschijnlijk',
  onzeker: 'nog onzeker',
} satisfies Record<Exclude<Zekerheid, 'zeker'>, string>;

export function zekerheidLabel(zekerheid: Zekerheid): string | undefined {
  return zekerheid === 'zeker' ? undefined : ZEKERHEID_LABEL[zekerheid];
}

/** Eén uitlegzin per zekerheid of reden die in het blok voorkomt. */
export const ZEKERHEID_UITLEG = {
  waarschijnlijk:
    'Waarschijnlijk: afgeleid uit het decreet zoals Klasse en de Codex het citeren. De officiële tabel van de Vlaamse overheid is nog niet nagelezen.',
  onzeker:
    'Nog onzeker: de oude doelen eindigen op dezelfde dagen als in het gewoon basisonderwijs, maar of de invoering per leerjaar hier ook zo loopt, is nog niet bevestigd.',
  'einddatum-buiten-kalender': 'Nog onzeker: de einddatum van deze set past niet in de kalender van de app. Kijk de officiële bron na.',
  'onbekend-vak': 'Nog onzeker: dit vak staat nog niet in de kalender van de app.',
} satisfies Record<'waarschijnlijk' | 'onzeker' | 'einddatum-buiten-kalender' | 'onbekend-vak', string>;

/** De uitlegzin bij een zekerheid en een eventuele reden; niets bij 'zeker' of bij een reden die geen uitleg nodig heeft. */
export function zekerheidUitleg(zekerheid: Zekerheid, reden?: InvoeringReden): string | undefined {
  if (reden === 'einddatum-buiten-kalender' || reden === 'onbekend-vak') return ZEKERHEID_UITLEG[reden];
  if (zekerheid === 'zeker') return undefined;
  return ZEKERHEID_UITLEG[zekerheid];
}

/** Hoe een bron gekend is. */
export const BRON_HOE_LABEL = {
  gegevens: 'officiële gegevens',
  gelezen: 'nagelezen',
  zoekfragment: 'zoekresultaat (niet geopend)',
  afgeleid: 'afgeleid',
  'nog-te-lezen': 'nog te lezen',
} satisfies Record<BronHoe, string>;

// ─── De golf ────────────────────────────────────────────────────────────────

/** Eén zin over de golf van het vak van een nieuwe set. */
export const GOLF_TEKST = {
  1: 'Dit vak hoort bij de eerste golf (Nederlands, wiskunde, wetenschap en techniek).',
  2: 'Dit vak hoort bij de tweede golf (de andere vakken).',
} satisfies Record<Golf, string>;

/** Waarom de golf van een vak niet vaststaat; er is geen uitleg bij 'zeker'. */
export const GOLF_ZEKERHEID_UITLEG = {
  waarschijnlijk:
    'Waarschijnlijk: er bestaat geen oude set met dezelfde naam in de gegevens om dit mee na te rekenen. De golf steunt op het decreet zoals zoekresultaten het citeren.',
  onzeker: 'Nog onzeker: bij dit vak is niet bevestigd tot welke golf het hoort.',
} satisfies Record<Exclude<Zekerheid, 'zeker'>, string>;

// ─── Leerjaren ──────────────────────────────────────────────────────────────

function ordinaal(n: number): string {
  return n === 1 ? '1ste' : `${n}de`;
}

function opsomming(delen: readonly string[]): string {
  if (delen.length <= 1) return delen.join('');
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/**
 * Leerjaren als zin. ['L1','L2','L3'] geeft '1ste, 2de en 3de leerjaar', ['K1','K2','K3'] '1ste, 2de en 3de kleuterklas'.
 * Met lidwoord wordt dat 'het 1ste, 2de en 3de leerjaar' of 'de 1ste, 2de en 3de kleuterklas'. Kleuterklassen en
 * leerjaren door elkaar komen na elkaar, verbonden met 'en'. Een lege lijst geeft ''.
 */
export function leerjarenTekst(lj: readonly LeerjaarBasis[], metLidwoord = false): string {
  const gekozen = LEERJAREN_BASIS.filter((x) => lj.includes(x));
  const nummers = (letter: 'K' | 'L') =>
    gekozen.filter((x) => x.startsWith(letter)).map((x) => ordinaal(Number(x.slice(1))));
  const delen: string[] = [];
  const kleuter = nummers('K');
  if (kleuter.length > 0) delen.push(`${metLidwoord ? 'de ' : ''}${opsomming(kleuter)} kleuterklas`);
  const lager = nummers('L');
  if (lager.length > 0) delen.push(`${metLidwoord ? 'het ' : ''}${opsomming(lager)} leerjaar`);
  return delen.join(' en ');
}

// ─── Zinnen van het blok ────────────────────────────────────────────────────

const eerstehoofdletter = (tekst: string): string => (tekst === '' ? tekst : tekst[0].toUpperCase() + tekst.slice(1));

/**
 * Voor wie de doelen zijn. Een nieuwe set heeft een eindmoment: 'Doelen voor het einde van het 4de leerjaar. Het 1ste,
 * 2de en 3de leerjaar werken ernaartoe; het leerplan van je net legt de tussenstappen vast.' Een oude set geldt voor
 * het hele moment, en het woord volgt de soort doelen (eindtermen of ontwikkelingsdoelen), niet het moment: de oude
 * lagere sets van het buitengewoon onderwijs zijn ontwikkelingsdoelen.
 */
export function voorWieTekst(set: Pick<BasisSet, 'generatie' | 'moment' | 'eindmoment' | 'leerjaren' | 'soortDoelen'>): string {
  if (set.generatie === 'oud') {
    const wat = set.soortDoelen === 'eindtermen' ? 'eindtermen' : set.soortDoelen === 'ontwikkelingsdoelen' ? 'ontwikkelingsdoelen' : 'doelen';
    const waarvoor = set.moment === 'kleuter' ? 'het hele kleuteronderwijs' : 'het hele lager onderwijs';
    return `Oude ${wat} voor ${waarvoor}.`;
  }
  const einde =
    set.eindmoment === 'K3'
      ? 'het einde van het kleuteronderwijs'
      : set.eindmoment === 'L6'
        ? 'het einde van het 6de leerjaar'
        : set.eindmoment === 'L4'
          ? 'het einde van het 4de leerjaar'
          : undefined;
  if (!einde) return 'Nieuwe minimumdoelen.';
  const werkenToe = set.leerjaren.filter((x) => x !== set.eindmoment);
  const zin = `Doelen voor ${einde}.`;
  if (werkenToe.length === 0) return zin;
  const werkwoord = werkenToe.length === 1 ? 'werkt' : 'werken';
  return `${zin} ${eerstehoofdletter(leerjarenTekst(werkenToe, true))} ${werkwoord} ernaartoe; het leerplan van je net legt de tussenstappen vast.`;
}

/** Eén deel van de lijn 'Dit schooljaar': 'verplicht in het 1ste, 2de en 3de leerjaar'. */
export function statusDeel(status: InvoeringStatus, leerjaren: readonly LeerjaarBasis[]): string {
  return `${STATUS_LABEL[status]} in ${leerjarenTekst(leerjaren, true)}`;
}

/**
 * Wat er met de oude doelen is voor leerjaren waar de nieuwe minimumdoelen al verplicht zijn. Noemt bewust geen set:
 * welke nieuwe set de plaats van een oude set inneemt, staat niet in de bron.
 */
export function vervangenTekst(leerjaren: readonly LeerjaarBasis[]): string {
  return `Niet meer verplicht voor ${leerjarenTekst(leerjaren, true)}: daar gelden de nieuwe minimumdoelen.`;
}

/** De melding voor een set die helemaal vervallen is; 'geldTotEnMet' is het laatste schooljaar waarin de set gold. */
export function vervallenTekst(geldTotEnMet: Schooljaar): string {
  return `Deze doelen gelden niet meer sinds 1 september ${geldTotEnMet + 1}.`;
}

/** Het zinnetje onderaan het blok over hoe de kalender tot stand kwam. */
export function samengesteldTekst(k: Invoeringskalender = INVOERINGSKALENDER): string {
  const begin = `Kalender samengesteld op ${datumLeesbaar(k.samengesteldOp)} uit de einddata in de officiële gegevens en uit zoekresultaten`;
  const gelezen = nagelezenOp(k);
  return gelezen === undefined
    ? `${begin}. De officiële tekst is nog niet nagelezen.`
    : `${begin} en nagelezen in de officiële tekst op ${datumLeesbaar(gelezen)}.`;
}
