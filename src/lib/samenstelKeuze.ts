// De keuzelogica achter het scherm "Stel je eigen doelenlijst samen" (stap 1 en 2), zonder scherm en zonder netwerk.
//
// Stap 1 kiest sets, stap 2 kiest per set de doelen. De staat is één onveranderlijk object (`SamenstelKeuze`): elke
// functie geeft een nieuw object terug en laat het oude ongemoeid, zodat een React-staat er rechtstreeks mee werkt.
//
// Per gekozen set weet de staat welke doelen gekozen zijn: `'alle'` (de hele set, ook als de set nog niet geladen is:
// zo staat een nieuw gekozen set meteen helemaal aangevinkt) of een verzameling vaste nummers (`Minimumdoel.id`). De
// doelen die je kan kiezen zijn die met een vast nummer en een tekst (`kiesbareDoelen`), precies zoals in
// `leerplanUitSelectie`. Een gekozen nummer dat niet (meer) in de set staat (een lijst die aangepast wordt nadat de
// bron veranderde), blijft staan, zodat `leerplanUitSelectie` ervoor kan waarschuwen; het telt niet mee in de aantallen.
//
// De bouwer van de lijst zelf is `leerplanUitSelectie` (doelenSamenstellen.ts); hier staat alleen hoe de keuze van de
// leerkracht tot `SetKeuze[]` wordt.

import { MAX_SETS } from './curriculum';
import type { SetKeuze } from './doelenSamenstellen';
import { htmlNaarTekst, type MinimumdoelenSetBestand } from './minimumdoelen';
import { SOORT_LABEL, contextVanSet, doelPastBijZoek, isGeldigSetId, soortVanSet } from './minimumdoelenBron';
import { isAttitude, isOptioneel, themaVanDoel } from './minimumdoelenLeerplan';

/** Hoeveel sets één lijst hoogstens bevat (een grens van het bewaren, zie `MAX_SETS`). */
export const MAX_GEKOZEN_SETS = MAX_SETS;

// ── De staat ────────────────────────────────────────────────────────────────

/** Wat van één set gekozen is: alles, of alleen deze vaste nummers. */
export type SetSelectie = 'alle' | ReadonlySet<string>;

export interface SamenstelKeuze {
  /** De gekozen sets, in de volgorde van kiezen (zo komen ze ook in de lijst). */
  readonly sets: readonly string[];
  /** Per gekozen set wat ervan gekozen is. Elke gekozen set staat er één keer in. */
  readonly selectie: ReadonlyMap<string, SetSelectie>;
}

export type Toestand = 'geen' | 'deel' | 'alle';

/** Een doel dat je kan kiezen: met vast nummer en tekst. */
export interface KiesbaarDoel {
  /** Vast nummer (`Minimumdoel.id`), getrimd. */
  id: string;
  code: string;
  /** Gewone tekst (`htmlNaarTekst`), nooit HTML. */
  tekst: string;
  /** De rubrieken van het doel, bv. "Muzikale opvoeding › Waarnemen". */
  rubriek?: string;
  optioneel: boolean;
  attitude: boolean;
}

export function leegKeuze(): SamenstelKeuze {
  return { sets: [], selectie: new Map() };
}

function maakKeuze(sets: readonly string[], selectie: ReadonlyMap<string, SetSelectie>): SamenstelKeuze {
  return { sets, selectie };
}

/** Sets uit `?sets=ODS_3283,ODS_3343`: alleen geldige ids, zonder dubbels, in volgorde, hoogstens `MAX_GEKOZEN_SETS`. */
export function setsUitParam(param: string | null | undefined): string[] {
  if (typeof param !== 'string') return [];
  const uit: string[] = [];
  for (const deel of param.split(',')) {
    const id = deel.trim();
    if (id !== '' && isGeldigSetId(id) && !uit.includes(id)) uit.push(id);
    if (uit.length >= MAX_GEKOZEN_SETS) break;
  }
  return uit;
}

/**
 * Hoeveel verschillende sets de link vraagt: de niet-lege delen van `?sets=`, zonder dubbels, ook als ze niet geldig zijn
 * of buiten het maximum vallen. Min het aantal gekozen sets is dat het aantal dat overgeslagen werd.
 */
export function aantalGevraagdeSets(param: string | null | undefined): number {
  if (typeof param !== 'string') return 0;
  return new Set(param.split(',').map((deel) => deel.trim()).filter((id) => id !== '')).size;
}

/**
 * Begin met deze sets (`?sets=`). Ongeldige ids en dubbels vallen weg. Elke set is helemaal gekozen, tenzij `leeg`
 * (`?leeg=1`): dan staat er van elke set niets gekozen, bv. om uit een STEM-set alleen de doelen van je vak aan te vinken.
 */
export function beginUitSets(ids: readonly string[], leeg = false): SamenstelKeuze {
  const sets: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && id.trim() !== '' && !sets.includes(id) && sets.length < MAX_GEKOZEN_SETS) sets.push(id);
  }
  return maakKeuze(sets, new Map<string, SetSelectie>(sets.map((id) => [id, leeg ? new Set<string>() : 'alle'])));
}

/**
 * Begin met een bewaarde lijst (`selectieVanLeerplan`): de sets in de volgorde van de lijst, met precies de bewaarde
 * doelen. Een set zonder doelen telt niet mee.
 */
export function beginUitSelectie(selectie: ReadonlyMap<string, readonly string[]>): SamenstelKeuze {
  const sets: string[] = [];
  const uit = new Map<string, SetSelectie>();
  for (const [set, ids] of selectie) {
    if (typeof set !== 'string' || set.trim() === '' || uit.has(set) || sets.length >= MAX_GEKOZEN_SETS) continue;
    const gekozen = new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id.trim() !== ''));
    if (gekozen.size === 0) continue;
    sets.push(set);
    uit.set(set, gekozen);
  }
  return maakKeuze(sets, uit);
}

// ── Sets kiezen (stap 1) ────────────────────────────────────────────────────

/** De korte naam van een set, of anders zijn naam. */
export function setNaam(set: { naam: string; korteNaam?: string }): string {
  return (set.korteNaam ?? '').trim() || set.naam.trim();
}

/**
 * Wat een set onderscheidt van andere sets met dezelfde korte naam: de soort onderwijs (niet bij het gewone secundair),
 * de graad, de stroom en de context uit de volledige naam ("aso", "Pool", …), zoals op de pagina "Officiële minimumdoelen".
 */
export function setKenmerken(set: { naam: string; graad?: string; stroom?: string }): string {
  const soort = soortVanSet(set.naam);
  return [soort === 'so' ? '' : SOORT_LABEL[soort], set.graad, set.stroom, contextVanSet(set.naam)].filter(Boolean).join(' · ');
}

export function isSetGekozen(k: SamenstelKeuze, setId: string): boolean {
  return k.selectie.has(setId);
}

/** Is er nog plaats voor een set? */
export function kanSetToevoegen(k: SamenstelKeuze): boolean {
  return k.sets.length < MAX_GEKOZEN_SETS;
}

/** Voegt een set achteraan toe, helemaal gekozen. Staat ze er al, of is de lijst vol, dan verandert er niets. */
export function voegSetToe(k: SamenstelKeuze, setId: string): SamenstelKeuze {
  if (isSetGekozen(k, setId) || !kanSetToevoegen(k)) return k;
  return maakKeuze([...k.sets, setId], new Map(k.selectie).set(setId, 'alle'));
}

/** Haalt een set weg, met zijn gekozen doelen. */
export function haalSetWeg(k: SamenstelKeuze, setId: string): SamenstelKeuze {
  if (!isSetGekozen(k, setId)) return k;
  const selectie = new Map(k.selectie);
  selectie.delete(setId);
  return maakKeuze(k.sets.filter((s) => s !== setId), selectie);
}

/** Een set aan- of uitvinken in de lijst met sets. */
export function wisselSet(k: SamenstelKeuze, setId: string): SamenstelKeuze {
  return isSetGekozen(k, setId) ? haalSetWeg(k, setId) : voegSetToe(k, setId);
}

// ── Doelen van een set ──────────────────────────────────────────────────────

const KIESBAAR = new WeakMap<MinimumdoelenSetBestand, readonly KiesbaarDoel[]>();

/**
 * De doelen van een set die je kan kiezen, in de volgorde van de set: die met een vast nummer en een tekst (wat overblijft
 * na `htmlNaarTekst`). Een nummer dat twee keer voorkomt, telt één keer. Per bestand één keer berekend.
 */
export function kiesbareDoelen(bestand: MinimumdoelenSetBestand): readonly KiesbaarDoel[] {
  const bewaard = KIESBAAR.get(bestand);
  if (bewaard) return bewaard;
  const uit: KiesbaarDoel[] = [];
  const gezien = new Set<string>();
  for (const doel of Array.isArray(bestand?.doelen) ? bestand.doelen : []) {
    if (typeof doel !== 'object' || doel === null) continue;
    const id = typeof doel.id === 'string' ? doel.id.trim() : '';
    if (id === '' || gezien.has(id)) continue;
    const tekst = typeof doel.tekst === 'string' ? htmlNaarTekst(doel.tekst) : '';
    if (tekst === '') continue;
    gezien.add(id);
    uit.push({
      id,
      code: typeof doel.code === 'string' ? doel.code : String(doel.code ?? ''),
      tekst,
      rubriek: themaVanDoel(doel),
      optioneel: isOptioneel(doel),
      attitude: isAttitude(doel),
    });
  }
  KIESBAAR.set(bestand, uit);
  return uit;
}

/** De vaste nummers die in `selectie` zitten én in `kiesbaar` staan. */
function gekozenIds(selectie: SetSelectie | undefined, kiesbaar: readonly KiesbaarDoel[]): string[] {
  if (selectie === undefined) return [];
  if (selectie === 'alle') return kiesbaar.map((d) => d.id);
  return kiesbaar.filter((d) => selectie.has(d.id)).map((d) => d.id);
}

/** Is dit doel gekozen? (`kiesbaar` van de set: een gekozen nummer dat er niet in staat, telt niet.) */
export function isDoelGekozen(k: SamenstelKeuze, setId: string, doelId: string): boolean {
  const sel = k.selectie.get(setId);
  return sel === 'alle' ? true : sel !== undefined && sel.has(doelId);
}

/** Hoeveel doelen van deze set gekozen zijn. */
export function aantalGekozen(k: SamenstelKeuze, setId: string, kiesbaar: readonly KiesbaarDoel[]): number {
  return gekozenIds(k.selectie.get(setId), kiesbaar).length;
}

/** 'alle' als alle doelen gekozen zijn, 'deel' als een deel, 'geen' als geen (ook voor een set zonder doelen). */
export function toestandVanSet(k: SamenstelKeuze, setId: string, kiesbaar: readonly KiesbaarDoel[]): Toestand {
  const n = aantalGekozen(k, setId, kiesbaar);
  if (n === 0) return 'geen';
  return n === kiesbaar.length ? 'alle' : 'deel';
}

/** Vervangt de selectie van een set, als die set gekozen is. */
function zetSelectie(k: SamenstelKeuze, setId: string, selectie: SetSelectie): SamenstelKeuze {
  if (!isSetGekozen(k, setId)) return k;
  return maakKeuze(k.sets, new Map(k.selectie).set(setId, selectie));
}

/** De hele set aan- of uitvinken. */
export function zetHeleSet(k: SamenstelKeuze, setId: string, aan: boolean): SamenstelKeuze {
  return zetSelectie(k, setId, aan ? 'alle' : new Set<string>());
}

/**
 * Een of meer doelen van een set aan- of uitvinken. `kiesbaar` zijn de doelen van de set: bij een set die 'alle' gekozen
 * was, wordt de selectie eerst die lijst, zodat één doel uitvinken de andere laat staan. Zijn daarna alle doelen gekozen
 * (en staat er geen onbekend nummer bij), dan wordt het weer 'alle'.
 */
export function zetDoelen(k: SamenstelKeuze, setId: string, doelIds: readonly string[], aan: boolean, kiesbaar: readonly KiesbaarDoel[]): SamenstelKeuze {
  const huidig = k.selectie.get(setId);
  if (huidig === undefined) return k;
  const volgende = new Set<string>(huidig === 'alle' ? kiesbaar.map((d) => d.id) : huidig);
  for (const id of doelIds) {
    if (aan) volgende.add(id);
    else volgende.delete(id);
  }
  const bekend = new Set(kiesbaar.map((d) => d.id));
  const compleet = kiesbaar.length > 0 && kiesbaar.every((d) => volgende.has(d.id)) && [...volgende].every((id) => bekend.has(id));
  return zetSelectie(k, setId, compleet ? 'alle' : volgende);
}

/** Eén doel aan- of uitvinken. */
export function zetDoel(k: SamenstelKeuze, setId: string, doelId: string, aan: boolean, kiesbaar: readonly KiesbaarDoel[]): SamenstelKeuze {
  return zetDoelen(k, setId, [doelId], aan, kiesbaar);
}

// ── Zoeken over alle gekozen sets (stap 2) ──────────────────────────────────

/** De doelen die bij de zoekwoorden passen (`zoekTermen`), per set; zonder zoekwoorden alle doelen. */
export function vindDoelen(kiesbaar: ReadonlyMap<string, readonly KiesbaarDoel[]>, termen: readonly string[]): Map<string, KiesbaarDoel[]> {
  const uit = new Map<string, KiesbaarDoel[]>();
  for (const [set, doelen] of kiesbaar) uit.set(set, doelen.filter((d) => doelPastBijZoek(d, termen)));
  return uit;
}

/** Hoeveel doelen er in totaal gevonden zijn. */
export function telGevonden(gevonden: ReadonlyMap<string, readonly KiesbaarDoel[]>): number {
  let n = 0;
  for (const doelen of gevonden.values()) n += doelen.length;
  return n;
}

/** Alle gevonden doelen aan- of uitvinken, in alle sets tegelijk. Doelen die niet gevonden zijn, blijven zoals ze waren. */
export function zetGevonden(
  k: SamenstelKeuze,
  gevonden: ReadonlyMap<string, readonly KiesbaarDoel[]>,
  aan: boolean,
  kiesbaar: ReadonlyMap<string, readonly KiesbaarDoel[]>,
): SamenstelKeuze {
  let uit = k;
  for (const [set, doelen] of gevonden) {
    if (doelen.length === 0) continue;
    uit = zetDoelen(uit, set, doelen.map((d) => d.id), aan, kiesbaar.get(set) ?? []);
  }
  return uit;
}

// ── Totalen en de selectie voor `leerplanUitSelectie` ───────────────────────

export interface Totaal {
  /** Gekozen doelen in de sets die geladen zijn. */
  doelen: number;
  /** Sets met minstens één gekozen doel. */
  sets: number;
}

/** Het totaal over de gekozen sets waarvan de doelen bekend zijn (`kiesbaar` per set-id). */
export function telGekozen(k: SamenstelKeuze, kiesbaar: ReadonlyMap<string, readonly KiesbaarDoel[]>): Totaal {
  let doelen = 0;
  let sets = 0;
  for (const setId of k.sets) {
    const lijst = kiesbaar.get(setId);
    if (!lijst) continue;
    const n = aantalGekozen(k, setId, lijst);
    doelen += n;
    if (n > 0) sets++;
  }
  return { doelen, sets };
}

/**
 * De selectie zoals `leerplanUitSelectie` ze wil: de sets in de volgorde van kiezen, `'alle'` als alle doelen van de set
 * gekozen zijn (en geen onbekend nummer), anders de gekozen nummers. Een set die niet geladen is of waarvan niets gekozen
 * is, valt weg.
 */
export function bouwSetKeuzes(k: SamenstelKeuze, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): SetKeuze[] {
  const uit: SetKeuze[] = [];
  for (const setId of k.sets) {
    const bestand = bestanden.get(setId);
    const sel = k.selectie.get(setId);
    if (!bestand || sel === undefined) continue;
    if (sel === 'alle') {
      uit.push({ bestand, doelen: 'alle' });
      continue;
    }
    if (sel.size === 0) continue;
    const kiesbaar = kiesbareDoelen(bestand);
    const bekend = new Set(kiesbaar.map((d) => d.id));
    const alles = kiesbaar.length > 0 && kiesbaar.every((d) => sel.has(d.id)) && [...sel].every((id) => bekend.has(id));
    uit.push({ bestand, doelen: alles ? 'alle' : [...sel] });
  }
  return uit;
}

// ── Wat ontbreekt ───────────────────────────────────────────────────────────

export interface Ontbreekt {
  /** Het id van het veld dat de focus krijgt als iemand toch op "Volgende" drukt. */
  veld?: string;
  /** Een korte zin zonder hoofdletter of punt, bv. "kies minstens één set". */
  tekst: string;
}

/** "Nog nodig: kies minstens één set." Leeg als er niets ontbreekt. */
export function zegOntbreekt(lijst: readonly Ontbreekt[]): string {
  const delen = lijst.map((o) => o.tekst);
  if (delen.length === 0) return '';
  const som = delen.length === 1 ? delen[0] : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
  return `Nog nodig: ${som}.`;
}

/** Wat er in stap 1 nog ontbreekt: minstens één set. */
export function ontbreektInStap1(k: SamenstelKeuze): Ontbreekt[] {
  return k.sets.length === 0 ? [{ veld: 'sam-zoek', tekst: 'kies minstens één set' }] : [];
}

/**
 * Wat er in stap 2 nog ontbreekt. Zolang een set laadt of niet kon laden, weten we zijn doelen niet; zonder één gekozen
 * doel is er geen lijst.
 */
export function ontbreektInStap2(laden: number, mislukt: number, gekozenDoelen: number): Ontbreekt[] {
  if (laden > 0) return [{ tekst: 'wacht tot de sets geladen zijn' }];
  if (mislukt > 0) return [{ tekst: 'probeer de sets die niet laadden opnieuw, of haal ze weg' }];
  if (gekozenDoelen === 0) return [{ veld: 'sam-doelzoek', tekst: 'kies minstens één doel' }];
  return [];
}

/**
 * Wat er in stap 3 nog ontbreekt: een naam, en minstens één doel in de lijst. Staat er zonder doelen al een melding op de
 * pagina (bv. te veel doelen gekozen), dan verwijst de tekst daarnaar.
 */
export function ontbreektInStap3(titel: string, aantalDoelen: number, heeftMelding = false): Ontbreekt[] {
  const uit: Ontbreekt[] = [];
  if (titel.trim() === '') uit.push({ veld: 'sam-titel', tekst: 'geef de lijst een naam' });
  if (aantalDoelen === 0) uit.push({ tekst: heeftMelding ? 'los de melding hierboven op' : 'kies minstens één doel' });
  return uit;
}
