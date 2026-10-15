// De teksten van de brug van een doelenlijst naar een cursus (docs/LEERPLANNEN.md § 16.4 en § 16.5): het paneel "Je lijst is
// bewaard", het blok "Gebruik in een cursus" op de pagina Leerplannen en de twee vensters "Nieuwe cursus met deze doelen" en
// "Gebruik deze doelen in een cursus".
//
// Puur en licht: geen React, geen opslag, geen netwerk en geen imports, want de pagina's van de wizard en van Leerplannen laden
// dit bestand mee. De zinnen die ook in `gatenWeergave.ts` staan (de fouten bij een volle opslag of een veranderde cursus, "Nog
// nodig", de laadfout) staan hier nog eens, letterlijk: een import ervan trekt `gatenWeergave.ts` als eigen chunk naar die
// pagina's (zie ook `bkWeergave.ts`). Een test vergelijkt ze met de bron. De zinnen staan hier letterlijk zoals in het ontwerp;
// de tests zetten de letterlijke zin ernaast, in enkelvoud en in meervoud. Nooit een set-id, een groepnummer of een doelcode
// in deze teksten.

/** "1 doel", "5 doelen" (zoals `enkelOfMeer` in `dekkingWeergave.ts`). */
function aantal(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`;
}

// ── Na het bewaren (§ 16.4) ─────────────────────────────────────────────────

export const NA_BEWAREN_KOP = 'Je lijst is bewaard';

/**
 * "‘Basisgeletterdheid’ staat bij Leerplannen, met 10 doelen, nagekeken. Hang ze nu aan een cursus: dan zie je in de cursus
 * welke doelen ze dekt." Het stuk ", nagekeken" staat er alleen als de lijst nagekeken is.
 */
export function naBewarenZin(titel: string, doelen: number, nagekeken: boolean): string {
  return `‘${titel}’ staat bij Leerplannen, met ${aantal(doelen, 'doel', 'doelen')}${nagekeken ? ', nagekeken' : ''}. `
    + 'Hang ze nu aan een cursus: dan zie je in de cursus welke doelen ze dekt.';
}

export const KNOP_MAAK_CURSUS = 'Maak een cursus met deze doelen';
export const KNOP_GEBRUIK_IN_CURSUS = 'Gebruik ze in een cursus die je al hebt';
export const LINK_NAAR_LEERPLANNEN = 'Naar je leerplannen';
export const LINK_TERUG_NAAR_RICHTING = 'Terug naar de studierichting';

/** Het pad naar een leerplan op de pagina Leerplannen. */
export function leerplanPad(id: string): string {
  return `/leerplannen?open=${encodeURIComponent(id)}`;
}

// ── Het blok op de pagina Leerplannen (§ 16.5) ──────────────────────────────

export const GEBRUIK_KOP = 'Gebruik in een cursus';
export const GEBRUIK_ZIN = 'Hang deze doelen aan een cursus: dan zie je in de cursus welke doelen ze dekt.';

/** Dezelfde melding als overal waar iets lui laadt (`FOUT_LADEN_GATEN`), voor de twee knoppen. */
export const FOUT_LADEN_VENSTER = 'Dit kon niet geladen worden. Controleer je verbinding en probeer opnieuw.';

// ── Het venster "Nieuwe cursus met deze doelen" (§ 16.5) ────────────────────

export const NIEUW_TITEL = 'Nieuwe cursus met deze doelen';
export const NIEUW_VELD_TITEL = 'Titel van de cursus';
export const NIEUW_HOE = 'Hoe begin je?';
export const KNOP_ANNULEREN = 'Annuleren';
export const KNOP_MAAK_DE_CURSUS = 'Maak de cursus';
/** "Nog nodig: een titel." zolang de titel leeg is (de opmaak van `nogNodigTekst` in `gatenWeergave.ts`). */
export const NOG_NODIG_TITEL = 'Nog nodig: een titel.';

export const BEGIN_GERAAMTE_TITEL = 'Met een geraamte';
export const BEGIN_GERAAMTE_ZIN =
  'Een hoofdstuk per set en een sectie per rubriek, met de doelcodes al op de secties. Je vult ze daarna zelf in.';
export const BEGIN_LEEG_TITEL = 'Met een lege cursus';
export const BEGIN_LEEG_ZIN = 'De cursus hangt aan je lijst. Je zet de doelcodes zelf op je secties.';
export const BEGIN_AI_TITEL = 'Laat de AI een eerste versie maken';
export const BEGIN_AI_ZIN = 'Met je eigen AI-sleutel.';
export const BEGIN_AI_GEEN_SLEUTEL = 'Nog geen AI-sleutel ingesteld.';
export const BEGIN_AI_LINK = 'AI-instellingen';

/** De opslag is vol of geblokkeerd: de cursus is niet bewaard (`FOUT_OPSLAG_VOL` in `gatenWeergave.ts`). */
export const FOUT_CURSUS_NIET_BEWAARD = 'Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.';
/** Iets onverwachts bij het maken: er is niets bewaard. */
export const FOUT_CURSUS_ONVERWACHT = 'De cursus kon niet gemaakt worden. Er is niets bewaard. Probeer het opnieuw.';
/** De overdracht naar de AI lukte niet (de browser liet het niet toe). */
export const FOUT_AI_OVERDRACHT = 'De overdracht naar de AI is niet gelukt. Kies een andere manier om te beginnen.';

/**
 * Na een cursus met een geraamte: "Cursus gemaakt: 3 hoofdstukken, 21 doelcodes klaar op de secties." Is er geen enkele
 * doelcode (een leerplan zonder bruikbare codes), dan is het de zin van de lege cursus.
 */
export function toastCursusMetGeraamte(hoofdstukken: number, doelcodes: number, lijst: string): string {
  if (doelcodes <= 0) return toastLegeCursus(lijst);
  return `Cursus gemaakt: ${aantal(hoofdstukken, 'hoofdstuk', 'hoofdstukken')}, ${aantal(doelcodes, 'doelcode', 'doelcodes')} klaar op de secties.`;
}

/** Na een lege cursus: "Cursus gemaakt. Ze hangt aan ‘Basisgeletterdheid’: zet de doelcodes op je secties." */
export function toastLegeCursus(lijst: string): string {
  return `Cursus gemaakt. Ze hangt aan ‘${lijst}’: zet de doelcodes op je secties.`;
}

// ── Het venster "Gebruik deze doelen in een cursus" (§ 16.5) ────────────────

export const KOPPEL_TITEL = 'Gebruik deze doelen in een cursus';
export const KOPPEL_WELKE = 'Welke cursus?';
export const KOPPEL_GEEN_CURSUSSEN = 'Je hebt nog geen cursussen op dit toestel.';
export const KNOP_KOPPEL = 'Koppel aan deze cursus';
export const KNOP_OPEN_CURSUS = 'Open de cursus';
/** "Nog nodig: een cursus." zolang er geen cursus gekozen is (de opmaak van `nogNodigTekst` in `gatenWeergave.ts`). */
export const NOG_NODIG_CURSUS = 'Nog nodig: een cursus.';

/** Onder een cursus: waar ze nu aan hangt. `oud` is de titel van haar leerplan; `dezeLijst` als ze al aan de lijst hangt. */
export function hangtRegel(o: { dezeLijst: boolean; oud?: string }): string {
  if (o.dezeLijst) return 'Hangt al aan deze lijst';
  return o.oud !== undefined ? `Hangt nu aan ‘${o.oud}’` : 'Nog geen leerplan';
}

/**
 * Onder een cursus met doelcodes: "3 van de 12 doelcodes in deze cursus staan in je lijst." Met één doelcode in de cursus:
 * "1 van de 1 doelcode in deze cursus staat in je lijst." Staat er precies één in de lijst: "1 van de 3 doelcodes in deze
 * cursus staat in je lijst."
 */
export function codesRegel(passend: number, totaal: number): string {
  const werkwoord = passend === 1 ? 'staat' : 'staan';
  return `${passend} van de ${aantal(totaal, 'doelcode', 'doelcodes')} in deze cursus ${werkwoord} in je lijst.`;
}

/** De melding als de gekozen cursus nu aan een ander leerplan hangt. */
export function andereLijstMelding(oud: string, nieuw: string): string {
  return `Deze cursus hangt nu aan ‘${oud}’. Kies je deze lijst, dan telt de doelendekking voortaan op ‘${nieuw}’. `
    + 'Wat in de cursus staat, verandert niet; doelcodes die niet in je lijst staan, zie je in de doelendekking.';
}

/** Na het koppelen: "‘Biologie 4de jaar’ hangt nu aan ‘Basisgeletterdheid’." */
export function toastGekoppeld(cursus: string, lijst: string): string {
  return `‘${cursus}’ hangt nu aan ‘${lijst}’.`;
}

/**
 * De fout als koppelen niet lukte; er is dan niets veranderd aan de cursus. Dezelfde zinnen als `FOUT_CURSUS_GEWIJZIGD`,
 * `FOUT_CURSUS_VERWIJDERD` en `FOUT_OPSLAG_VOL` in `gatenWeergave.ts` (zie boven).
 */
export function koppelFout(reden: 'gewijzigd' | 'verwijderd' | 'mislukt'): string {
  switch (reden) {
    case 'gewijzigd': return 'Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw.';
    case 'verwijderd': return 'Deze cursus bestaat niet meer. Er is niets veranderd.';
    default: return FOUT_CURSUS_NIET_BEWAARD;
  }
}
