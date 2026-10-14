// De korte regel over de competenties van de beroepskwalificaties in "Mijn richtingen" en in de klas (docs/STUDIERICHTINGEN.md
// § 24.4, F3b-B1, F3b-B7, F3b-B8 en F3b-B10). Dit bestand wordt alleen lui geladen, vanuit `DekkingKort`, en pas als de
// regel over de minimumdoelen van die rij er al is.
//
// Eén pijplijn voor het detail, de rij en de klas (I4): `bijdragenVoorKader`, dan `dekkingBkVanRichting` en `bkKortVan`.
// De rij en de klas rekenen zoals het detail bij "Alle jaren" en zonder variant: `bkKader(…, { groep, soort }, vandaag)`
// en geen jaar.
//
// Zuinig met verzoeken (I5, § 23.15 R11):
// - Een richting die geen beroepskwalificaties kan hebben (`kanBkHebben`), vraagt niets: ook de koppeling niet.
// - Telt geen enkele cursus mee voor de competenties (`heeftBkCursus`), dan komen er alleen de koppeling en de index
//   bij, en geen enkel BK-bestand: dat is net het signaal om te plannen.
// - Een versie die de index zonder bestand noemt, wordt nooit gevraagd (`bkVersiesOmTeLaden`).
//
// De koppeling, de index en de bestanden komen via `BkLaders`: in de app de gedeelde laders van beroepskwalificatiesBron.ts
// (één verzoek per bestand, ook als tien rijen het vragen), in een test een nagebootste. Puur op de laders na: geen React,
// geen opslag, geen klok (`vandaag` komt van de aanroeper). Nooit een code of nummer in een tekst: dit bestand maakt er geen.

import type { BkBestand, BkIndex, KoppelingBestand } from './beroepskwalificaties';
import { laadBk, laadBkIndex, laadBkKoppeling } from './beroepskwalificatiesBron';
import type { Course } from './courseTypes';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { bkVerwijzingen, bkVersiesOmTeLaden, dekkingBkVanRichting } from './dekkingBk';
import type { CursusBijdrage } from './dekkingMinimumdoelen';
import { bkKader } from './richtingBk';
import type { RichtingInfo, SoortKeuze } from './richtingKader';
import {
  bijdragenVoorKader,
  bkKortVan,
  bkKortZonderCursus,
  kanBkHebben,
  type BkKort,
} from './richtingOverzicht';
import type { MatrixBestand } from './studierichtingen';
import type { Widget } from './types';

/** Waar de koppeling, de index en de BK-bestanden vandaan komen. `null`: het bestand bestaat (nog) niet. */
export interface BkLaders {
  koppeling(): Promise<KoppelingBestand | null>;
  index(): Promise<BkIndex | null>;
  bk(versie: string): Promise<BkBestand | null>;
}

/** De gedeelde laders van de app: elk bestand één keer opgehaald, een mislukte poging wordt gewist. */
const STANDAARD_LADERS: BkLaders = { koppeling: laadBkKoppeling, index: laadBkIndex, bk: laadBk };

/**
 * Telt minstens één van deze cursussen mee voor de competenties van beroepskwalificaties? Gelijk aan
 * `dekkingBk(kader, bijdragen, widgets).cursussen.some((c) => c.telt)`, voor elk kader en elke lijst oefeningen (I8):
 * of een cursus meetelt, hangt alleen van haarzelf en haar leerplan af. Daarom kan een rij zonder BK-cursus de BK-bestanden
 * overslaan. Dezelfde drie voorwaarden als de dekking, zonder iets uit te rekenen: de cursus hangt aan een leerplan
 * (`curriculumId`), dat leerplan staat op dit toestel (en is dat leerplan), en minstens één doel ervan heeft een bruikbare
 * verwijzing naar een competentie (`bkVerwijzingen`). De eigenschapstest in `bkOverzicht.test.ts` houdt dit gelijk aan de
 * dekking zelf.
 */
export function heeftBkCursus(bijdragen: readonly CursusBijdrage[]): boolean {
  return bijdragen.some((b) => {
    const course: Course | undefined = b?.course;
    const leerplan: Curriculum | undefined = b?.leerplan;
    const cid = typeof course?.curriculumId === 'string' ? course.curriculumId : '';
    if (cid === '' || !leerplan || leerplan.id !== cid) return false;
    const goals: unknown = leerplan.goals;
    return Array.isArray(goals) && goals.some((g) => !!g && typeof g === 'object' && bkVerwijzingen(g as CurriculumGoal).length > 0);
  });
}

/**
 * De korte regel over de competenties voor één richting (één rij of één klas): `{ soort: 'kort', kort }`, of `{ soort: 'geen' }`
 * als er niets te zeggen valt (de richting kan geen beroepskwalificaties hebben, de koppeling kent er geen of is er nog niet).
 *
 * 1. Kan de richting er geen hebben (`kanBkHebben`): `geen`, zonder enig verzoek.
 * 2. De koppeling en de index laden (gedeelde beloftes), dan `bkKader` voor de hele richting (geen variant). Is de herkomst
 *    niet `api`, of zijn er geen beroepskwalificaties: `geen`.
 * 3. `bijdragenVoorKader` zonder jaar: alle jaren van de graad, zoals het detail bij "Alle jaren".
 * 4. Telt geen enkele cursus mee (`heeftBkCursus` onwaar): `bkKortZonderCursus`, zonder BK-bestanden.
 * 5. Anders de bestanden van `bkVersiesOmTeLaden`, dan `dekkingBkVanRichting` en `bkKortVan`.
 *
 * Gooit de fout van de lader als een bestand niet geladen kan worden (de aanroeper toont dan "Opnieuw proberen").
 * `soort` is het soort onderwijs van het kader (`effectiefSoort` van de rij), `widgets` de oefeningen van dit toestel.
 */
export async function bkKortVoorRichting(
  o: {
    info: RichtingInfo;
    soort: SoortKeuze;
    courses: readonly Course[];
    curricula: readonly Curriculum[];
    matrix: MatrixBestand;
    vandaag: string;
    widgets: readonly Widget[];
  },
  laders: BkLaders = STANDAARD_LADERS,
): Promise<{ soort: 'kort'; kort: BkKort } | { soort: 'geen' }> {
  const { info, soort, courses, curricula, matrix, vandaag, widgets } = o;
  if (!kanBkHebben(info)) return { soort: 'geen' };

  const [koppeling, index] = await Promise.all([laders.koppeling(), laders.index()]);
  const kader = bkKader(koppeling, index, info, { groep: info.groep.nummer, soort }, vandaag);
  if (kader.herkomst !== 'api' || kader.bks.length === 0) return { soort: 'geen' };

  const bijdragen = bijdragenVoorKader({ courses, curricula, info, soort, matrix, vandaag });
  if (!heeftBkCursus(bijdragen)) return { soort: 'kort', kort: bkKortZonderCursus(kader) };

  const versies = bkVersiesOmTeLaden(kader);
  const geladen = await Promise.all(versies.map((v) => laders.bk(v)));
  const bestanden = new Map<string, BkBestand>();
  versies.forEach((v, i) => {
    const b = geladen[i];
    if (b) bestanden.set(v, b);
  });
  const dekking = dekkingBkVanRichting({ kader, bestanden, bijdragen, widgets });
  return { soort: 'kort', kort: bkKortVan(dekking, kader, bestanden) };
}
