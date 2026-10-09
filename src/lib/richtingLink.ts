// De studierichting in de link van de wizards "Stel je eigen doelenlijst samen" en "Leerplan inlezen"
// (docs/STUDIERICHTINGEN.md § 11.3 en § 14.6).
//
//   ?richting=G-0193&jaar=4&soort=so[&sets=ODS_1,ODS_2][&zelf=ODS_3]
//
// Puur en zonder netwerk: de pagina's laden de gegevens (matrix, koppeling, index) en maken het kader; hier staat wat
// ze daarmee doen. Wat de link vraagt en het kader niet kent, wordt overgeslagen en geteld, zodat het scherm het kan
// melden. Een deelset blijft een deelset (§ 9.5): hier gaat nergens iets naar 'alle' terug en er wordt nergens een
// beperkte lijst kiesbare doelen doorgegeven.

import type { Curriculum } from './curriculumTypes';
import { doelgroepVoorLeerplan, graadTekst, type Doelgroep } from './doelgroep';
import {
  doelgroepVan,
  kaderVingerafdruk,
  selectieVanKader,
  type RichtingInfo,
  type RichtingKader,
  type SoortKeuze,
} from './richtingKader';
import { beginUitKeuze, setsUitParam, type SamenstelKeuze } from './samenstelKeuze';
import type { OnderwijsKeuze } from './setKeuze';
import { GROEP_NUMMER } from './studierichtingen';

/** Vandaag als JJJJ-MM-DD: wat in de matrix afgebouwd is, hangt daarvan af. */
export function vandaag(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── De link lezen ───────────────────────────────────────────────────────────

/** Wat de link over de richting zegt, als ze bruikbaar is. */
export interface RichtingLink {
  /** Groepnummer uit de matrix ("G-0193"). */
  groep: string;
  /** 1 tot 7; wat daarbuiten valt, wordt genegeerd. */
  jaar?: number;
  soort: SoortKeuze;
}

/** Een deel van de link dat er stond maar niet bruikbaar was. Een ontbrekende of lege parameter telt niet. */
export type GenegeerdParam = 'jaar' | 'soort';

export interface RichtingParams {
  /** Staat er een `?richting=` in de link, ook als die leeg of ongeldig is? */
  aanwezig: boolean;
  /** De richting, als het groepnummer de vorm `G-0000` heeft. Of de matrix haar kent, weet alleen de pagina. */
  link?: RichtingLink;
  /**
   * Wat de link voor een bruikbare richting nog vroeg en niet bruikbaar was: een jaar buiten 1 tot 7, een soort dat niet
   * `so` of `buso` is (§ 14.6). Leeg zonder bruikbare richting, want dan wordt de hele link genegeerd. De pagina meldt het
   * met `genegeerdZinnen`.
   */
  genegeerd: GenegeerdParam[];
  /** De ruwe waarden van richting, jaar, soort en zelf: een andere waarde is een nieuwe wizard (sleutel van de pagina). */
  sleutel: string;
}

/** Wat `URLSearchParams` biedt; zo is de functie ook zonder DOM te testen. */
interface ParamBron {
  get(naam: string): string | null;
}

const JAAR = /^[1-7]$/;

export function leesRichtingParams(params: ParamBron): RichtingParams {
  const richting = params.get('richting');
  const jaar = params.get('jaar');
  const soort = params.get('soort');
  const sleutel = [richting, jaar, soort, params.get('zelf')].map((v) => v ?? '').join('|');
  if (richting === null) return { aanwezig: false, genegeerd: [], sleutel };
  const groep = richting.trim();
  if (!GROEP_NUMMER.test(groep)) return { aanwezig: true, genegeerd: [], sleutel };
  const jaarTekst = (jaar ?? '').trim();
  const soortTekst = (soort ?? '').trim();
  const leesJaar = JAAR.test(jaarTekst) ? Number(jaarTekst) : undefined;
  const genegeerd: GenegeerdParam[] = [];
  if (jaarTekst !== '' && leesJaar === undefined) genegeerd.push('jaar');
  if (soortTekst !== '' && soortTekst !== 'so' && soortTekst !== 'buso') genegeerd.push('soort');
  return {
    aanwezig: true,
    link: { groep, ...(leesJaar !== undefined ? { jaar: leesJaar } : {}), soort: soortTekst === 'buso' ? 'buso' : 'so' },
    genegeerd,
    sleutel,
  };
}

/**
 * De router-state van de knop "Verder zonder studierichting": de link verdwijnt als de pagina zonder richting opnieuw
 * monteert, dus de nieuwe pagina zet de focus zelf op haar kop (anders staat een toetsenbordgebruiker weer bovenaan).
 */
export const VERDER_ZONDER_RICHTING = { focusKop: true } as const;

/** Komt de pagina van "Verder zonder studierichting"? (`location.state` is onbetrouwbaar: alles wat niet precies klopt, telt niet.) */
export function komtVanVerderZonderRichting(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { focusKop?: unknown }).focusKop === true;
}

const GENEGEERD_ZIN: Readonly<Record<GenegeerdParam, string>> = {
  jaar: 'Het jaar in de link is niet bruikbaar en werd genegeerd.',
  soort: 'Het soort onderwijs in de link is niet bekend; Boosterz gebruikt gewoon secundair onderwijs.',
};

/** De zinnen voor de melding over wat de link vroeg en niet bruikbaar was: eerst het jaar, dan het soort; niets als er niets te melden is. */
export function genegeerdZinnen(genegeerd: readonly GenegeerdParam[]): string[] {
  return (['jaar', 'soort'] as const).filter((p) => genegeerd.includes(p)).map((p) => GENEGEERD_ZIN[p]);
}

// ── Samenstellen: waar de wizard mee begint ─────────────────────────────────

/** De afzonderlijke delen van `?sets=` en `?zelf=` samen, zonder lege delen en zonder dubbels (ook de ongeldige). */
function gevraagdeSets(...params: (string | null)[]): Set<string> {
  const uit = new Set<string>();
  for (const param of params) {
    if (typeof param !== 'string') continue;
    for (const deel of param.split(',')) {
      const id = deel.trim();
      if (id !== '') uit.add(id);
    }
  }
  return uit;
}

/**
 * Wat uit het kader gekozen wordt voor `?sets=` en `?zelf=`:
 * - zonder `sets` en zonder `zelf`: alle verplichte sets van het kader;
 * - met `sets` (ook een lege lijst): alleen die sets, van het kader (volledig: 'alle', een deel: de nummers van de koppeling);
 * - `zelf`: die sets staan erbij gekozen, met niets aangevinkt (bv. een STEM-set: de bron zegt niet welke doelen bij je vak horen);
 * - een uitbreidingsset komt er alleen in als de link ze uitdrukkelijk noemt.
 * Sets die niet in het kader staan, vallen weg.
 */
export function selectieUitLink(
  kader: RichtingKader,
  opties: { sets: readonly string[] | null; zelf: readonly string[] },
): Map<string, 'alle' | readonly string[]> {
  const zelf = new Set(opties.zelf);
  const verplicht = kader.sets.filter((k) => k.verplicht).map((k) => k.set.id);
  const gevraagd = opties.sets !== null ? [...opties.sets, ...zelf] : zelf.size > 0 ? [...verplicht, ...zelf] : undefined;
  const uitbreiding = gevraagd !== undefined && kader.sets.some((k) => !k.verplicht && gevraagd.includes(k.set.id));
  const selectie = selectieVanKader(kader, { sets: gevraagd, ookUitbreiding: uitbreiding });
  // Een lege lijst betekent "gekozen, niets aangevinkt" (`beginUitKeuze`).
  for (const id of zelf) if (selectie.has(id)) selectie.set(id, []);
  return selectie;
}

/**
 * De keuze waarmee `/leerplannen/samenstellen?richting=…` begint, en hoeveel gevraagde sets niet gekozen konden worden
 * (niet in het kader, ongeldig of boven het maximum): daarvoor meldt de pagina dat ze overgeslagen zijn.
 */
export function beginUitLink(
  kader: RichtingKader,
  setsParam: string | null,
  zelfParam: string | null,
): { keuze: SamenstelKeuze; overgeslagen: number } {
  const selectie = selectieUitLink(kader, { sets: setsParam === null ? null : setsUitParam(setsParam), zelf: setsUitParam(zelfParam) });
  const keuze = beginUitKeuze(selectie);
  const gevraagd = gevraagdeSets(setsParam, zelfParam);
  const gevonden = [...gevraagd].filter((id) => selectie.has(id)).length;
  // Wat het kader gaf maar niet in de keuze paste (meer sets dan één lijst bevat), telt ook als overgeslagen.
  return { keuze, overgeslagen: gevraagd.size - gevonden + (selectie.size - keuze.sets.length) };
}

/**
 * De bewaarde keuze van een lijst (`selectieVanLeerplan`) voor "Kies de doelen opnieuw" (§ 11.2). Wat er vervalt, volgt
 * dezelfde regel en dezelfde telling als `vergelijkMetKader` (richtingCursus.ts), zodat scherm en melding niet uiteenlopen.
 * - Is `leerplan.doelgroep.kader` gelijk aan de vingerafdruk van het kader over de sets van het leerplan, dan is er sinds
 *   het maken niets veranderd in de koppeling: er vervalt NIETS en de keuze blijft precies zoals ze bewaard werd, ook
 *   doelen die de leerkracht zelf toevoegde en sets buiten het kader (die waren nooit gekoppeld).
 *   Hetzelfde geldt voor een eigen kopie (`kind` 'eigen', die volgt de koppeling niet) en voor een kader zonder gegevens.
 * - Anders: een set die niet meer in het kader staat (bv. een oude versie): al haar doelen zijn vervallen. Een nummer dat
 *   niet meer in de koppeling staat: vervallen. Een volledige set met een andere versie dan bij de koppeling: de nummers van
 *   de koppeling zijn niet meer exact bekend, dus alles blijft staan.
 * Een set van het kader waarvan niets overblijft, blijft gekozen met niets aangevinkt, zodat de leerkracht ziet wat er
 * gebeurd is. Er komt niets bij: nieuwe doelen van de koppeling kies je zelf.
 */
export function beginUitBewaarde(
  selectie: ReadonlyMap<string, readonly string[]>,
  kader: RichtingKader,
  leerplan: Pick<Curriculum, 'kind' | 'doelgroep' | 'minimumdoelenSets'>,
): { keuze: SamenstelKeuze; vervallen: number } {
  const kaderZegtNiets = kader.herkomst === 'nog-niet-opgehaald' || (kader.herkomst === 'geen' && kader.sets.length === 0);
  const dg = doelgroepVoorLeerplan(leerplan.doelgroep);
  const setsVanLeerplan = Array.isArray(leerplan.minimumdoelenSets) ? leerplan.minimumdoelenSets : [];
  const ongewijzigd = dg?.kader !== undefined && dg.kader === kaderVingerafdruk(kader, setsVanLeerplan);
  if (leerplan.kind === 'eigen' || kaderZegtNiets || ongewijzigd) return { keuze: beginUitKeuze(selectie), vervallen: 0 };

  const perSet = new Map(kader.sets.map((k) => [k.set.id, k] as const));
  const over = new Map<string, readonly string[]>();
  let vervallen = 0;
  for (const [set, ids] of selectie) {
    const k = perSet.get(set);
    if (k === undefined) {
      vervallen += ids.length;
      continue;
    }
    if (k.volledig && !k.versieGelijk) {
      over.set(set, ids);
      continue;
    }
    const inKader = new Set(k.ids);
    const blijft = ids.filter((id) => inKader.has(id));
    vervallen += ids.length - blijft.length;
    over.set(set, blijft);
  }
  return { keuze: beginUitKeuze(over), vervallen };
}

/**
 * Kan het kader dienen om mee te beginnen? Zonder sets niet: de koppeling is nog niet opgehaald ('nog-niet-opgehaald'),
 * of de bron geeft voor deze richting geen (bruikbare) doelen ('geen').
 */
export function kaderStand(kader: RichtingKader): 'ok' | 'nog-niet-opgehaald' | 'geen' {
  if (kader.sets.length > 0) return 'ok';
  return kader.herkomst === 'nog-niet-opgehaald' ? 'nog-niet-opgehaald' : 'geen';
}

// ── Weergave en bewaren ─────────────────────────────────────────────────────

/** De richting voor in een zin: "Natuurwetenschappen (2de graad)"; buitengewoon onderwijs zonder graad krijgt dat als toelichting. */
export function richtingTekst(info: RichtingInfo): string {
  const titel = info.groep.titel;
  if (info.graad !== undefined) return `${titel} (${graadTekst(info.graad)})`;
  return info.soort === 'buso' ? `${titel} (buitengewoon onderwijs)` : titel;
}

/**
 * De doelgroep die een leerplan bij deze richting krijgt: de richting en het soort onderwijs van het kader, eventueel
 * het vak, en de vingerafdruk van het kader over de sets die echt in het leerplan zitten (`setIds`). Zo vergelijkt
 * `vergelijkMetKader` later met precies dezelfde sets. Zonder `volgtKader`: wie per doel kiest, volgt de koppeling niet
 * automatisch ("Werk het leerplan bij" bestaat dan niet; "Kies de doelen opnieuw" wel). Het jaar haalt
 * `leerplanUitSelectie` er zelf af: een leerplan geldt voor de hele graad.
 */
export function doelgroepBijRichting(info: RichtingInfo, kader: RichtingKader, setIds: readonly string[], vak?: string): Doelgroep {
  const vakTekst = (vak ?? '').trim();
  return { ...doelgroepVan(info, kader.keuze, vakTekst !== '' ? { vak: vakTekst } : undefined), kader: kaderVingerafdruk(kader, setIds) };
}

/** Waar de leerkracht na het bewaren heen gaat: de pagina van de richting, met het jaar (als dat bij de graad past) en het soort onderwijs. */
export function richtingPad(info: RichtingInfo, kader: RichtingKader): string {
  const jaar = doelgroepVan(info, kader.keuze).jaar;
  const vraag = [...(jaar !== undefined ? [`jaar=${jaar}`] : []), `soort=${kader.keuze.soort}`].join('&');
  return `/cursussen/richtingen/${encodeURIComponent(info.groep.nummer)}?${vraag}`;
}

// ── Inlezen: wat vooraf ingevuld wordt ──────────────────────────────────────

/** De graad, stroom en het soort onderwijs van de keuze in de inleeswizard (`LeerplanKeuze`), zoals de richting ze geeft. */
export function invulVoorInlezen(info: RichtingInfo, kader: RichtingKader): { graad: string; stroom: string; onderwijs: OnderwijsKeuze } {
  return {
    graad: info.graad !== undefined ? graadTekst(info.graad) : '',
    // Alleen de 1ste graad kent een stroom.
    stroom: info.graad === 1 && info.stroom ? `${info.stroom}-stroom` : '',
    onderwijs: kader.keuze.soort === 'buso' ? 'buso' : 'so',
  };
}
