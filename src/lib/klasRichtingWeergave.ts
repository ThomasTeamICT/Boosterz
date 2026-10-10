// Teksten en kleine hulpen voor een klas met een studierichting (docs/STUDIERICHTINGEN.md § 22.6.4).
//
// Alle zinnen met een getal of een richting erin staan hier, met enkelvoud en meervoud, zodat ze getest zijn en de schermen
// (klasoverzicht, "Opdracht toevoegen", "Toewijzen vanuit een cursus", de richtingpagina en "Mijn klassen") geen eigen
// zinnen bouwen. Puur: geen React, geen opslag, geen netwerk. Licht: alleen `doelgroep.ts` en `doelgroepGebruik.ts` (die
// zelf alleen `doelgroep.ts` en types halen), want ook ShareModal en de klaslijst importeren dit bestand en mogen er niets
// zwaars mee binnenhalen. Nooit een groepnummer op het scherm.

import type { Course } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { doelgroepTekst, jaarTekst, type Doelgroep } from './doelgroep';
import { doelgroepVanCursus } from './doelgroepGebruik';

// ── Kleine hulpen ───────────────────────────────────────────────────────────

/** "1 leerling", "22 leerlingen", "0 leerlingen". */
export function leerlingenTekst(n: number): string {
  return `${n} ${n === 1 ? 'leerling' : 'leerlingen'}`;
}

/**
 * De richting van een klas of cursus in één regel voor een kop of een keuzelijst: "Natuurwetenschappen · 4de jaar". Zonder
 * vak (een klas heeft er geen, en bij een cursus hoort het vak niet bij de groep). Leeg zonder geldige doelgroep.
 */
export function richtingZonderVak(d: Doelgroep | undefined): string {
  return d ? doelgroepTekst(d, { zonderVak: true }) : '';
}

// ── Het klasoverzicht: de sectie "Studierichting" ───────────────────────────

export const KLAS_RICHTING_KOP = 'Studierichting';
export const KLAS_RICHTING_UITLEG =
  'Koppel deze klas aan een studierichting en een jaar. Dan zie je hier de cursussen van die richting, en bij ‘Opdracht toevoegen’ staan ze bovenaan.';
export const KIES_RICHTING_KNOP = 'Kies een studierichting';
export const KIEZER_TITEL = 'Studierichting van deze klas';
/** De bestaande tekst uit de cursusinstellingen, zodat de leerkracht overal dezelfde melding krijgt. */
export const KIEZER_LADEN_MISLUKT =
  'De lijst met studierichtingen kon niet geladen worden. Controleer je verbinding en herlaad de pagina.';

/** Melding na het kiezen: "Studierichting van ‘4NWA’: Natuurwetenschappen · 4de jaar." */
export function richtingGekozenTekst(klasNaam: string, d: Doelgroep): string {
  return `Studierichting van ‘${klasNaam}’: ${doelgroepTekst(d)}.`;
}

/** Melding na "Geen richting". */
export function richtingWeggehaaldTekst(klasNaam: string): string {
  return `‘${klasNaam}’ heeft geen studierichting meer.`;
}

export const FOUT_RICHTING_NIET_BEWAARD =
  'De studierichting kon niet bewaard worden: de opslag van dit toestel is vol of geblokkeerd.';
export const FOUT_KLAS_BESTAAT_NIET_MEER = 'Deze klas bestaat niet meer op dit toestel.';

/** De foutmelding bij een mislukte `zetKlasRichting`. */
export function foutVoorUitslag(uitslag: 'weg' | 'mislukt'): string {
  return uitslag === 'weg' ? FOUT_KLAS_BESTAAT_NIET_MEER : FOUT_RICHTING_NIET_BEWAARD;
}

// ── De cursussen van de richting, in het klasoverzicht ──────────────────────

export const CURSUSSEN_VOOR_RICHTING_KOP = 'Cursussen voor deze richting';
export const CURSUSSEN_LADEN = 'De cursussen voor deze richting worden geladen…';
export const FOUT_CURSUSSEN_LADEN =
  'De cursussen voor deze richting konden niet geladen worden. Controleer je verbinding en herlaad de pagina.';
export const STAAT_IN_KLAS = 'Staat in deze klas';
export const GEEN_CURSUS_ZIN = 'Nog geen cursus voor deze richting op dit toestel.';
export const GEEN_CURSUS_LINK = 'Maak er een bij de studierichting';
export const DEKKING_SAMENVATTING = 'Toon wat je cursussen voor deze richting dekken';
export const DEKKING_BEZIG = 'De dekking wordt berekend…';
export const DEKKING_LINK = 'Bekijk per doel wat ze dekken';

/**
 * Wat achter de titel van een cursus staat: "4de jaar" voor een cursus van één jaar, "hele graad" voor een cursus zonder
 * jaar. Een richting zonder graad (buitengewoon onderwijs) heeft geen jaren om uit te kiezen: dan staat er niets.
 */
export function cursusJaarMeta(d: Doelgroep | undefined): string {
  if (!d) return '';
  if (d.jaar !== undefined) return jaarTekst(d.jaar);
  return d.graad !== undefined ? 'hele graad' : '';
}

// ── "Opdracht toevoegen" en "Toewijzen vanuit een cursus" ───────────────────

export const ANDERE_CURSUSSEN = 'Andere cursussen';
export const ANDERE_KLASSEN = 'Andere klassen';
export const CURSUSSEN_BOVENAAN_HINT = 'De cursussen voor de studierichting van deze klas staan bovenaan.';

/** Het label van de eerste groep in de keuzelijst met cursussen: "Voor Natuurwetenschappen · 4de jaar". */
export function cursussenVoorLabel(klas: Doelgroep): string {
  return `Voor ${richtingZonderVak(klas)}`;
}

/** Het label van de eerste groep in de keuzelijst met klassen: "Klassen voor Natuurwetenschappen · 4de jaar". */
export function klassenVoorLabel(cursus: Doelgroep): string {
  return `Klassen voor ${richtingZonderVak(cursus)}`;
}

// ── Mijn klassen ────────────────────────────────────────────────────────────

/** Wat achter de klascode-regel komt: " · Natuurwetenschappen · 4de jaar". Leeg als de klas geen richting heeft. */
export function richtingAchterKlascode(d: Doelgroep | undefined): string {
  const tekst = richtingZonderVak(d);
  return tekst ? ` · ${tekst}` : '';
}

// ── De richtingpagina: "Klassen van deze richting" ──────────────────────────

export const KLASSEN_VAN_RICHTING_KOP = 'Klassen van deze richting';
export const GEEN_KLAS_ZIN = 'Nog geen klas met deze studierichting. Je kiest de studierichting van een klas in het klasoverzicht.';
export const GEEN_KLAS_LINK = 'Naar mijn klassen';

/**
 * De regel onder de naam van een klas: "4de jaar · 22 leerlingen", "Hele graad · 22 leerlingen" (een klas zonder jaar) en
 * "1 leerling". `heleGraad` is of de richting een graad heeft: zonder graad (buitengewoon onderwijs) staan alleen de leerlingen.
 */
export function klasMeta(o: { jaar?: number; heleGraad: boolean; leerlingen: number }): string {
  const delen: string[] = [];
  if (o.jaar !== undefined) {
    const jaar = jaarTekst(o.jaar);
    if (jaar) delen.push(jaar);
  } else if (o.heleGraad) {
    delen.push('Hele graad');
  }
  delen.push(leerlingenTekst(o.leerlingen));
  return delen.join(' · ');
}

/**
 * De cursussen van een richting op dit toestel: dezelfde keuze als de lijst "Cursussen voor deze richting" op de richtingpagina
 * (de doelgroep van de cursus of van haar leerplan heeft dit groepnummer en dit soort onderwijs, ongeacht het jaar). De zin
 * "2 van de 3 cursussen van deze richting staan in deze klas." staat onder die lijst en telt dus precies dezelfde cursussen:
 * een cursus voor een ander jaar dan dat van de klas telt mee in het totaal, en ook als de klas ze als opdracht kreeg.
 */
export function cursussenVanRichting(
  courses: readonly Course[],
  curricula: readonly Curriculum[],
  groep: string,
  soort: 'so' | 'buso',
): Course[] {
  return courses.filter((c) => {
    const d = doelgroepVanCursus(c, curricula);
    return d !== undefined && d.groep === groep && d.soort === soort;
  });
}

/**
 * Hoeveel van de cursussen van de richting er als opdracht in een klas staan: "2 van de 3 cursussen van deze richting
 * staan in deze klas." (1 van de 3: "staat"). Bij één cursus: "De cursus van deze richting staat in deze klas." of "… staat
 * nog niet in deze klas." Zonder cursussen is er niets te zeggen: dan blijft de regel leeg.
 */
export function cursussenInKlasZin(inKlas: number, totaal: number): string {
  if (!Number.isFinite(totaal) || totaal <= 0) return '';
  const n = Math.max(0, Math.min(Math.floor(inKlas), totaal));
  if (totaal === 1) return n === 1 ? 'De cursus van deze richting staat in deze klas.' : 'De cursus van deze richting staat nog niet in deze klas.';
  return `${n} van de ${totaal} cursussen van deze richting ${n === 1 ? 'staat' : 'staan'} in deze klas.`;
}
