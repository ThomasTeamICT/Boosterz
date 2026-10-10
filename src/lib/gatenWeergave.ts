// Teksten voor de schermen om gaten te dichten (docs/STUDIERICHTINGEN.md § 22.4.7): de knop op de richtingpagina, het venster
// "Plan wat nog nergens aan bod komt" en het paneel "Plan in deze cursus" in de cursuseditor.
//
// Alle zinnen met een getal staan hier, met enkelvoud en meervoud, zodat ze getest zijn en de schermen geen eigen zinnen
// bouwen. Puur en licht: geen React, geen opslag, geen netwerk, en alleen kleine imports, want de cursuseditor laadt dit
// bestand mee met de weergave "Minimumdoelen". Nooit een set-id, groepnummer of competentiecode in een tekst.

import { enkelOfMeer } from './dekkingWeergave';
import { jaarTekst } from './doelgroep';

// ── Kleine hulpen ───────────────────────────────────────────────────────────

/**
 * "Nog nodig: minstens één doel en een titel." Leeg zonder delen. Dezelfde opmaak als `zegOntbreekt` (samenstelKeuze.ts), maar
 * zonder die zware module: de editor laadt dit bestand mee. Een test bewaakt dat de twee gelijk lopen.
 */
export function nogNodigTekst(delen: readonly string[]): string {
  if (delen.length === 0) return '';
  const som = delen.length === 1 ? delen[0] : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
  return `Nog nodig: ${som}.`;
}

// ── Richtingpagina: de knop ─────────────────────────────────────────────────

/** De primaire knop onder de samenvatting: "Plan de 37 doelen die nog nergens aan bod komen". */
export function planKnopTekst(n: number): string {
  return n === 1 ? 'Plan het doel dat nog nergens aan bod komt' : `Plan de ${n} doelen die nog nergens aan bod komen`;
}

/** Als er geen enkel open verplicht doel meer is. */
export const GEEN_OPEN_TEKST = 'Er zijn geen verplichte minimumdoelen meer die nergens aan bod komen.';

/** Het venster of het onderdeel erin laadde niet (de verbinding viel weg). */
export const FOUT_LADEN_GATEN = 'Dit kon niet geladen worden. Controleer je verbinding en probeer opnieuw.';

// ── Het venster ─────────────────────────────────────────────────────────────

export const VENSTER_TITEL = 'Plan wat nog nergens aan bod komt';
export const VENSTER_INTRO =
  'Boosterz zet de gekozen doelen als lege secties in een cursus, met de doelcodes erop. Zo staan ze gepland; daarna werk je ze zelf uit. Een AI-sleutel heb je niet nodig.';
export const VENSTER_HINT = 'Doelen die al gepland staan of alleen in verdieping aan bod komen, blijven waar ze staan.';

/** Alleen als er optionele doelen of uitbreidingsdoelen zijn die nog nergens aan bod komen. Leeg bij 0. */
export function optioneleHintTekst(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  return n === 1
    ? 'Het optionele doel of uitbreidingsdoel dat nog nergens aan bod komt, zit er niet in.'
    : `De ${n} optionele doelen en uitbreidingsdoelen die nog nergens aan bod komen, zitten er niet in.`;
}

/** Bij "Tel mee: alleen het jaar". */
export function telJaarTekst(jaar: number): string {
  return `Je telt nu alleen de cursussen van het ${jaarTekst(jaar)}.`;
}

export const DOELEN_LEGEND = 'Welke doelen?';
export const DOELEN_HINT = 'Vink uit wat in een andere cursus thuishoort.';
export const TOON_DOELEN = 'Toon de doelen';

/** Het vakje van een set: "Chemie · 9 doelen" / "Chemie · 1 doel". */
export function setVakjeTekst(naam: string, doelen: number): string {
  return `${naam} · ${enkelOfMeer(doelen, 'doel', 'doelen')}`;
}

/** Eén doel in de uitklapper: "09.01 — korte tekst". Zonder code alleen de tekst, zonder tekst alleen de code. */
export function doelRegelTekst(code: string, tekst: string): string {
  const c = code.trim();
  const t = tekst.trim();
  if (c !== '' && t !== '') return `${c} — ${t}`;
  return c !== '' ? c : t;
}

/** De teller onder de vakjes: "Je koos 21 doelen uit 3 sets." */
export function tellerTekst(doelen: number, sets: number): string {
  if (doelen < 1 || sets < 1) return 'Je koos nog geen doelen.';
  return `Je koos ${enkelOfMeer(doelen, 'doel', 'doelen')} uit ${enkelOfMeer(sets, 'set', 'sets')}.`;
}

export const WAAR_LEGEND = 'Waar komen ze?';
export const WAAR_NIEUW = 'In een nieuwe cursus';
export const WAAR_BESTAAND = 'In een cursus die je al hebt';
export const GEEN_KANDIDAAT_HINT =
  'Geen cursus van deze richting heeft een van de gekozen doelen in haar leerplan. Maak er een nieuwe cursus voor, of pas eerst het leerplan van een cursus aan bij Leerplannen.';
export const TITEL_LABEL = 'Titel van de cursus';
export const TITEL_HINT = 'Boosterz maakt er een nagekeken leerplan bij met precies deze doelen, of gebruikt het leerplan dat er al is.';
export const CURSUS_LEGEND = 'Welke cursus?';

/** De meta van een cursus in de lijst: "4de jaar" of "hele graad" (een cursus zonder jaar geldt voor de hele graad). */
export function cursusJaarTekst(jaar: number | undefined): string {
  return jaar !== undefined && jaarTekst(jaar) !== '' ? jaarTekst(jaar) : 'hele graad';
}

/** Hoeveel van de gekozen doelen in het leerplan van de cursus staan: "17 van de 21 gekozen doelen staan in haar leerplan". */
export function passendTekst(k: number, n: number): string {
  if (n === 1) return 'Het gekozen doel staat in haar leerplan';
  return k === 1
    ? `1 van de ${n} gekozen doelen staat in haar leerplan`
    : `${k} van de ${n} gekozen doelen staan in haar leerplan`;
}

/** Onder de lijst met cursussen: de cursussen met een leerplan waarin geen enkel gekozen doel staat. Leeg bij 0. */
export function zonderPassendTekst(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  return n === 1
    ? '1 andere cursus van deze richting heeft geen van deze doelen in haar leerplan.'
    : `${n} andere cursussen van deze richting hebben geen van deze doelen in hun leerplan.`;
}

export const OPEN_LEERPLAN_TEKST = 'Open het leerplan';
/** Het stuk na de link "Open het leerplan" (alleen als niet alle gekozen doelen in het leerplan staan). */
export const OF_KIES_NIEUW_TEKST = `of kies ‘${WAAR_NIEUW}’.`;

/** De voorbeeldzin bij een gekozen cursus: `k` van de `n` gekozen doelen staan in het leerplan van de cursus. */
export interface VoorbeeldZin {
  tekst: string;
  /** Staan niet alle gekozen doelen in het leerplan: dan volgen de link "Open het leerplan" en `OF_KIES_NIEUW_TEKST`. */
  metLink: boolean;
}

export function voorbeeldZin(cursusTitel: string, k: number, n: number): VoorbeeldZin {
  const titel = `‘${cursusTitel}’`;
  if (k >= n) {
    return {
      tekst: n === 1
        ? `Het gekozen doel staat in het leerplan van ${titel}. Het komt er als lege sectie bij; wat al in de cursus staat, blijft zoals het is.`
        : `Alle ${n} gekozen doelen staan in het leerplan van ${titel}. Ze komen er als lege secties bij; wat al in de cursus staat, blijft zoals het is.`,
      metLink: false,
    };
  }
  const weg = n - k;
  return {
    tekst: weg === 1
      ? `1 gekozen doel staat niet in het leerplan van ${titel} en komt er niet bij: Boosterz past een leerplan nooit zelf aan.`
      : `${weg} gekozen doelen staan niet in het leerplan van ${titel} en komen er niet bij: Boosterz past een leerplan nooit zelf aan.`,
    metLink: true,
  };
}

export const ANNULEREN_TEKST = 'Annuleren';
export const MAAK_CURSUS_TEKST = 'Maak de cursus';

/**
 * De primaire knop bij "In een cursus die je al hebt": "Zet ze in deze cursus", en als niet alle gekozen doelen in het
 * leerplan staan "Zet de 4 doelen in deze cursus" (enkelvoud "Zet het doel in deze cursus"). Is er maar één gekozen doel
 * (`n` = 1), dan past de knop bij de voorbeeldzin "Het gekozen doel staat in het leerplan van …": "Zet het in deze cursus".
 */
export function zetKnopTekst(k: number, n: number): string {
  if (k >= n || k < 1) return n === 1 ? 'Zet het in deze cursus' : 'Zet ze in deze cursus';
  return k === 1 ? 'Zet het doel in deze cursus' : `Zet de ${k} doelen in deze cursus`;
}

/** Wat er in de voet staat zolang de knop nog niet kan: "Nog nodig: minstens één doel en een titel." */
export function voetNodigTekst(o: { doelen: number; waar: 'nieuw' | 'bestaand'; titel: string; cursusGekozen: boolean }): string {
  const delen: string[] = [];
  if (o.doelen < 1) delen.push('minstens één doel');
  if (o.waar === 'nieuw' && o.titel.trim() === '') delen.push('een titel');
  if (o.waar === 'bestaand' && !o.cursusGekozen) delen.push('een cursus');
  return nogNodigTekst(delen);
}

// ── Fouten en toasts ────────────────────────────────────────────────────────

/** Het leerplan werd niet bevestigd. `waarschuwing` is de eerste waarschuwing zonder punt aan het eind en zonder set-id. */
export function nietNagekekenFout(waarschuwing: string): string {
  const w = waarschuwing.trim().replace(/[.\s]+$/, '');
  return `Het leerplan kon niet als nagekeken bewaard worden: ${w}. Er is niets bewaard.`;
}

export const FOUT_SETS_VERANDERD = 'De sets zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard.';
export const FOUT_OPSLAG_VOL = 'Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.';
export const FOUT_CURSUS_GEWIJZIGD = 'Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw.';
export const FOUT_CURSUS_VERWIJDERD = 'Deze cursus bestaat niet meer. Er is niets veranderd.';
export const FOUT_ANDER_LEERPLAN = 'Deze cursus hangt intussen aan een ander leerplan. Er is niets veranderd. Probeer opnieuw.';
export const FOUT_NIETS_TE_DOEN = 'Deze doelen staan al op een sectie van deze cursus. Er is niets veranderd.';

/** De fout bij het zetten van doelen in een bestaande cursus (`bewaarGatenOpCursus`). */
export function foutBijBestaandeCursus(reden: 'gewijzigd' | 'verwijderd' | 'mislukt' | 'ander-leerplan' | 'niets-te-doen'): string {
  switch (reden) {
    case 'gewijzigd': return FOUT_CURSUS_GEWIJZIGD;
    case 'verwijderd': return FOUT_CURSUS_VERWIJDERD;
    case 'ander-leerplan': return FOUT_ANDER_LEERPLAN;
    case 'niets-te-doen': return FOUT_NIETS_TE_DOEN;
    default: return FOUT_OPSLAG_VOL;
  }
}

/** Na een nieuwe cursus: "Cursus gemaakt: 3 hoofdstukken, 21 doelcodes klaar op de secties." en bij hergebruik de zin erachter. */
export function cursusGemaaktToast(hoofdstukken: number, codes: number, hergebruikt: boolean): string {
  const basis = `Cursus gemaakt: ${enkelOfMeer(hoofdstukken, 'hoofdstuk', 'hoofdstukken')}, ${enkelOfMeer(codes, 'doelcode', 'doelcodes')} klaar op de secties.`;
  return hergebruikt ? `${basis} Er stond al een leerplan met precies deze doelen: de cursus hangt daaraan.` : basis;
}

/** Na doelen in een bestaande cursus: "21 doelen staan nu gepland in ‘Biologie 4de jaar’." */
export function geplandInCursusToast(n: number, cursusTitel: string): string {
  return `${n === 1 ? '1 doel staat' : `${n} doelen staan`} nu gepland in ‘${cursusTitel}’.`;
}

// ── De cursuseditor ─────────────────────────────────────────────────────────

/** De regel boven de knop: "3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie." */
export function editorRegel(n: number): string {
  return n === 1
    ? '1 doel uit het leerplan van deze cursus staat nog op geen enkele sectie.'
    : `${n} doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.`;
}

/** De knop die het paneel opent. */
export function editorKnopTekst(n: number): string {
  return n === 1 ? 'Plan het in deze cursus' : 'Plan ze in deze cursus';
}

export const PANEEL_TITEL = 'Plan in deze cursus';
export const PANEEL_UITLEG =
  'Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.';

/** De knop in het paneel zet alle gekozen doelen (`n`) in de cursus: "Zet ze in deze cursus", bij één doel "Zet het in deze cursus". */
export function paneelZetTekst(n: number): string {
  return zetKnopTekst(n, n);
}

/** Open doelen die deze cursus niet dekt en die niet in haar leerplan staan. Leeg bij 0. */
export function andereOpenTekst(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  return n === 1
    ? '1 ander doel dat deze cursus niet dekt, staat niet in haar leerplan.'
    : `${n} andere doelen die deze cursus niet dekt, staan niet in haar leerplan.`;
}

/** Bij een cursus met een studierichting, vóór de link naar de richting. */
export const PLAN_BIJ_RICHTING_TEKST = 'Wat geen enkele cursus behandelt, plan je bij de studierichting.';

/** De toast in de editor: "3 doelen staan nu gepland in deze cursus." */
export function geplandInDezeCursusToast(n: number): string {
  return `${n === 1 ? '1 doel staat' : `${n} doelen staan`} nu gepland in deze cursus.`;
}
