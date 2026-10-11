// Dekking op de competenties van de beroepskwalificaties (docs/STUDIERICHTINGEN.md § 23.6.9 en F3-B12).
//
// Geen tweede kopie van de regels: de dekking rekent met `dekkingMinimumdoelen` (§ 13.2), met één optie die zegt welke
// verwijzingen van een leerplandoel tellen. Een competentie is hier een "doel van het kader":
// - `set` is de BK-versie ("BK-0390-2"), `id` de competentiecode (het vaste nummer, nooit op het scherm), `code` de
//   doelcode ("BK-0390-2.03") en `tekst` de competentie zoals ze in het leerplan staat (`tekstVanCompetentie`);
// - een verwijzing is een `bkRef` van het leerplandoel (`bk` + `id`), en telt strikt op die twee;
// - dezelfde competentiecode in een andere versie van de beroepskwalificatie telt niet, maar wordt wel geteld in
//   `zelfdeNummerAndereSet` ("3 competenties zouden meetellen als je cursus de versie van nu volgde");
// - elke competentie is verplicht: er zijn geen optionele competenties en geen uitbreiding. `perSet` is dus per BK-versie.
//
// De competenties zonder tekst (na `tekstVanCompetentie` leeg) staan niet in het kader, want ze staan ook niet in het
// leerplan (§ 23.6.4): zo tellen dekking en leerplan dezelfde lijst. Puur: geen opslag, geen DOM, geen netwerk.

import { doelcodesVanBestand, valideerBkBestand, type BkBestand } from './beroepskwalificaties';
import { tekstVanCompetentie } from './bkLeerplan';
import type { CurriculumGoal } from './curriculumTypes';
import { dekkingMinimumdoelen, type CursusBijdrage, type KaderDoel, type MdDekking } from './dekkingMinimumdoelen';
import type { RichtingBk } from './richtingBk';
import type { Widget } from './types';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * De competenties met een tekst van één BK-bestand als doelen van het kader, in de volgorde van het bestand. Eén bron voor
 * `bkKaderDoelen` en `aantalCompetentiesMetTekst`, zodat het scherm en de dekking nooit een andere lijst tellen.
 */
function doelenVanBestand(bk: string, bestand: BkBestand): KaderDoel[] {
  const uit: KaderDoel[] = [];
  const codes = doelcodesVanBestand(bestand);
  const setNaam = bestand.titel.trim();
  const gezien = new Set<string>();
  for (const c of bestand.competenties) {
    if (gezien.has(c.id)) continue;
    gezien.add(c.id);
    const tekst = tekstVanCompetentie(c);
    const code = codes.get(c.id);
    if (tekst === '' || code === undefined) continue;
    const rubriek = typeof c.type === 'string' ? c.type.trim() : '';
    uit.push({ set: bk, setNaam, id: c.id, code, tekst, ...(rubriek ? { rubriek } : {}), optioneel: false, verplichteSet: true });
  }
  return uit;
}

/**
 * De competenties van de beroepskwalificaties van een richting als kader voor de dekking: per BK-versie van `kader.bks`
 * (in hun volgorde) alle competenties met een tekst, in de volgorde van het bestand.
 *
 * - `set` = de BK-versie, `setNaam` = de titel van de beroepskwalificatie, `id` = de competentiecode, `code` = de doelcode
 *   (`doelcodesVanBestand`), `tekst` = `tekstVanCompetentie`, `rubriek` = het soort competentie (als de bron er een geeft);
 *   `optioneel` onwaar en `verplichteSet` waar.
 * - Een BK-versie zonder bruikbaar bestand in `bestanden` (ontbreekt, niet geladen, niet door de validator, of van een
 *   andere versie) levert niets: de oproeper laadt de bestanden van alle BK-versies van het kader.
 * - Een competentie zonder tekst valt weg, en een competentiecode die twee keer voorkomt telt één keer.
 */
export function bkKaderDoelen(kader: RichtingBk, bestanden: ReadonlyMap<string, BkBestand>): KaderDoel[] {
  const uit: KaderDoel[] = [];
  const versies = new Set<string>();
  for (const regel of Array.isArray(kader?.bks) ? kader.bks : []) {
    if (!regel || typeof regel.bk !== 'string' || versies.has(regel.bk)) continue;
    versies.add(regel.bk);
    const bestand = bestanden && typeof bestanden.get === 'function' ? bestanden.get(regel.bk) : undefined;
    if (!bestand || valideerBkBestand(bestand, regel.bk).length > 0) continue;
    uit.push(...doelenVanBestand(regel.bk, bestand));
  }
  return uit;
}

/**
 * Het aantal competenties van één BK-bestand dat het scherm toont en telt: alleen die met een tekst, precies de lijst van
 * `bkKaderDoelen` en van het leerplan (§ 23.6.4). Het aantal in de kop van het bestand (`bestand.aantal`) en in de index
 * (`RichtingBkRegel.aantal`) telt ook competenties zonder tekst mee; gebruik dat nooit voor een zin op het scherm, anders
 * staat er 12 waar het leerplan, de dekking en de lijst er 11 hebben. Een bestand dat niet door de validator komt telt 0.
 */
export function aantalCompetentiesMetTekst(bestand: BkBestand): number {
  if (!bestand || typeof bestand.bk !== 'string' || valideerBkBestand(bestand, bestand.bk).length > 0) return 0;
  return doelenVanBestand(bestand.bk, bestand).length;
}

/**
 * De verwijzingen van een leerplandoel naar competenties, in de vorm die `dekkingMinimumdoelen` verwacht: `set` is de
 * BK-versie (`bkRef.bk`), `id` de competentiecode (`bkRef.id`). Tolerant voor oude of kapotte opslag: een verwijzing zonder
 * beide delen, of een doel zonder `bkRefs`, levert niets op. Een doel met `refs` naar minimumdoelen levert hier niets op.
 */
export function bkVerwijzingen(goal: CurriculumGoal): { set: string; id: string }[] {
  const refs: unknown = isObject(goal) ? goal.bkRefs : undefined;
  if (!Array.isArray(refs)) return [];
  const uit: { set: string; id: string }[] = [];
  for (const r of refs as unknown[]) {
    if (!isObject(r)) continue;
    const set = typeof r.bk === 'string' ? r.bk.trim() : '';
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (set !== '' && id !== '') uit.push({ set, id });
  }
  return uit;
}

/**
 * De dekking van een kader van competenties (`bkKaderDoelen`) door cursussen, elk met haar eigen leerplan: precies
 * `dekkingMinimumdoelen` met `bkVerwijzingen`. Een cursus met een leerplan zonder `bkRefs` telt niet mee
 * ('geen-verwijzingen'), net zoals een BK-cursus niet meetelt in de dekking op minimumdoelen. `perSet` is per BK-versie en
 * `zelfdeNummerAndereSet` telt de competenties die meetellen als de cursus de versie van nu volgde. De `samenvatting` van
 * het resultaat is die van de minimumdoelen en wordt hier niet gebruikt: de zinnen voor het scherm staan in `bkWeergave.ts`.
 */
export function dekkingBk(kader: readonly KaderDoel[], bijdragen: readonly CursusBijdrage[], widgets: readonly Widget[]): MdDekking {
  return dekkingMinimumdoelen(kader, bijdragen, widgets, { verwijzingen: bkVerwijzingen });
}
