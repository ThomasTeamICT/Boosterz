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
import { htmlNaarTekst, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from './minimumdoelen';
import { doelPastBijZoek, isGeldigSetId, setKenmerken, soortVanSet, zijnTweeling, type SoortOnderwijs, type StroomFilter } from './minimumdoelenBron';
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

/**
 * Begin met een keuze per set (bv. `selectieVanKader` van een studierichting): de sets in de volgorde van de lijst,
 * `'alle'` voor een hele set, anders precies de genoemde vaste nummers. Anders dan bij `beginUitSelectie` telt een
 * set met een lege lijst wél mee: ze is gekozen, maar er staat nog niets aangevinkt (zoals `beginUitSets` met `leeg`).
 * Een set die twee keer voorkomt telt één keer; hoogstens `MAX_GEKOZEN_SETS` sets.
 *
 * Een lijst nummers blijft een lijst: ook als ze toevallig alle doelen van de set noemt, wordt ze hier geen `'alle'`.
 * (Het omzetten naar `'alle'` gebeurt pas bij het aan- en uitvinken of in `bouwSetKeuzes`, op de kiesbare doelen van de
 * hele set. Zie `docs/STUDIERICHTINGEN.md` § 9.5.)
 */
export function beginUitKeuze(selectie: ReadonlyMap<string, 'alle' | readonly string[]>): SamenstelKeuze {
  const sets: string[] = [];
  const uit = new Map<string, SetSelectie>();
  for (const [set, ids] of selectie) {
    if (typeof set !== 'string' || set.trim() === '' || uit.has(set) || sets.length >= MAX_GEKOZEN_SETS) continue;
    sets.push(set);
    uit.set(set, ids === 'alle' ? 'alle' : new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id.trim() !== '')));
  }
  return maakKeuze(sets, uit);
}

// ── Sets kiezen (stap 1) ────────────────────────────────────────────────────

/** De korte naam van een set, of anders zijn naam. */
export function setNaam(set: { naam: string; korteNaam?: string }): string {
  return (set.korteNaam ?? '').trim() || set.naam.trim();
}

// `setKenmerken` staat in minimumdoelenBron.ts (ook de waarschuwingen in doelenSamenstellen.ts gebruiken het); hier opnieuw
// aangeboden, want het scherm haalt het van hier.
export { setKenmerken };

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

// ── Sturen: voor welke leerlingen is de lijst? (docs/LEERPLANNEN.md § 16.2 en § 16.3) ──
//
// Veel sets bestaan in meer versies: voor de A- en de B-stroom (1ste graad) en voor het gewoon en het buitengewoon onderwijs
// (de "tweeling" van een SO-set, op naam herkend: `zijnTweeling`). Het scherm vraagt eerst voor welke leerlingen de lijst is,
// laat de rest weg, en waarschuwt (met één klik om het op te lossen) als de keuze toch meer dan één groep mengt. Dit stuurt
// alleen; de echte controle op vaste nummers blijft die van `leerplanUitSelectie`.

/** De graad waarin sets in stromen bestaan: alleen daar toont het scherm de keuze van de stroom. */
export const GRAAD_MET_STROMEN = '1ste graad';

/** Het deel van de filterstaat van stap 1 dat bij "Voor welke leerlingen is deze lijst?" hoort. */
export interface LeerlingenFilter {
  soort: SoortOnderwijs | 'alle';
  graad: string;
  stroom: StroomFilter;
}

/** Wat de sturing van een set nodig heeft (een indexregel volstaat). */
export type SetVoorSturing = Pick<MinimumdoelenIndexSet, 'naam' | 'versie' | 'graad' | 'stroom'>;

const ZONDER_SETS: LeerlingenFilter = { soort: 'so', graad: '', stroom: '' };

/**
 * De beginwaarden van het blok. Een nieuwe lijst zonder sets (in de link of bewaard): gewoon secundair onderwijs, alle graden,
 * beide stromen. Zijn er sets, dan volgt het blok die sets, zodat er geen set uit beeld verdwijnt: allemaal buitengewoon →
 * "buso", allemaal gewoon → "so" (idem volwassenenonderwijs), gemengd → "alle"; één gemeenschappelijke graad en (in de 1ste
 * graad) stroom worden overgenomen. Een set die de index niet kent, telt niet mee.
 */
export function beginLeerlingen(setIds: readonly string[], perId: ReadonlyMap<string, SetVoorSturing>): LeerlingenFilter {
  const sets = setIds.map((id) => perId.get(id)).filter((s): s is SetVoorSturing => s !== undefined);
  if (sets.length === 0) return { ...ZONDER_SETS };
  const soorten = new Set(sets.map((s) => soortVanSet(s.naam)));
  const enige = soorten.size === 1 ? [...soorten][0] : undefined;
  const soort: SoortOnderwijs | 'alle' = enige === 'so' || enige === 'buso' || enige === 'vwo' ? enige : 'alle';
  const graden = new Set(sets.map((s) => (s.graad ?? '').trim()));
  const graad = graden.size === 1 ? [...graden][0] : '';
  // Een set zonder stroom valt nooit weg door de stroomfilter; de stroom van de andere sets telt dus.
  const stromen = new Set(sets.map((s) => (s.stroom ?? '').trim()).filter((st) => st !== ''));
  const enigeStroom = stromen.size === 1 ? [...stromen][0] : '';
  const stroom: StroomFilter = graad === GRAAD_MET_STROMEN && (enigeStroom === 'A-stroom' || enigeStroom === 'B-stroom') ? enigeStroom : '';
  return { soort, graad, stroom };
}

/**
 * Een wijziging in de filterstaat. Alleen in de 1ste graad bestaat er een stroom: een andere graad (of alle graden) zet de
 * stroom terug op "allebei".
 */
export function pasLeerlingenToe<T extends LeerlingenFilter>(huidig: T, patch: Partial<T>): T {
  const volgende = { ...huidig, ...patch };
  return volgende.graad === GRAAD_MET_STROMEN ? volgende : { ...volgende, stroom: '' };
}

/** Een SO-set en zijn BuSO-tweeling, allebei in dezelfde keuze (`zijnTweeling`). */
export interface TweelingPaar {
  so: string;
  buso: string;
}

/** De SO/BuSO-paren onder deze sets, in de volgorde van de SO-sets (dan van de BuSO-sets). Een set die de index niet kent, telt niet mee. */
export function tweelingParen(setIds: readonly string[], perId: ReadonlyMap<string, SetVoorSturing>): TweelingPaar[] {
  const kennen = setIds.flatMap((id) => {
    const set = perId.get(id);
    return set ? [{ id, set, soort: soortVanSet(set.naam) }] : [];
  });
  const uit: TweelingPaar[] = [];
  for (const a of kennen.filter((k) => k.soort === 'so')) {
    for (const b of kennen.filter((k) => k.soort === 'buso')) {
      if (zijnTweeling(a.set, b.set)) uit.push({ so: a.id, buso: b.id });
    }
  }
  return uit;
}

/** De sets die in een paar zitten (voor de zin bij een gekozen set). */
export function setsMetTweeling(paren: readonly TweelingPaar[]): Set<string> {
  return new Set(paren.flatMap((p) => [p.so, p.buso]));
}

/** Hoeveel sets van elke soort in de paren zitten ("{k} sets van elk"): het aantal verschillende SO-sets. */
export function aantalPerSoort(paren: readonly TweelingPaar[]): number {
  return new Set(paren.map((p) => p.so)).size;
}

/** Welke stromen onder deze sets voorkomen; een set zonder stroom telt niet mee. */
export function stromenIn(setIds: readonly string[], perId: ReadonlyMap<string, SetVoorSturing>): Set<'A-stroom' | 'B-stroom'> {
  const uit = new Set<'A-stroom' | 'B-stroom'>();
  for (const id of setIds) {
    const stroom = perId.get(id)?.stroom?.trim();
    if (stroom === 'A-stroom' || stroom === 'B-stroom') uit.add(stroom);
  }
  return uit;
}

/** Zitten onder deze sets zowel sets van het gewoon als van het buitengewoon secundair onderwijs? */
export function mengtGewoonEnBuitengewoon(setIds: readonly string[], perId: ReadonlyMap<string, SetVoorSturing>): boolean {
  const soorten = new Set(setIds.flatMap((id) => {
    const set = perId.get(id);
    return set ? [soortVanSet(set.naam)] : [];
  }));
  return soorten.has('so') && soorten.has('buso');
}

/** Zitten onder deze sets zowel sets van de A- als van de B-stroom? */
export function mengtStromen(setIds: readonly string[], perId: ReadonlyMap<string, SetVoorSturing>): boolean {
  return stromenIn(setIds, perId).size === 2;
}

/**
 * Haalt de tweelingen van de andere soort weg: houd je het gewoon onderwijs ('so'), dan gaan de BuSO-sets weg die een
 * SO-tweeling in de keuze hebben, en omgekeerd. Een set zonder tweeling blijft.
 */
export function haalTweelingenWeg(
  k: SamenstelKeuze,
  perId: ReadonlyMap<string, SetVoorSturing>,
  behoud: 'so' | 'buso',
  /**
   * De sets waarover de melding de paren telde (in stap 3: de sets met minstens één doel in de lijst). Zonder deze lijst
   * tellen alle sets van de keuze. Zo gaat een set nooit weg omdat haar tweeling er staat zonder één gekozen doel.
   */
  binnen?: readonly string[],
): SamenstelKeuze {
  const weg = new Set(tweelingParen(binnen ?? k.sets, perId).map((p) => (behoud === 'so' ? p.buso : p.so)));
  return k.sets.reduce((acc, id) => (weg.has(id) ? haalSetWeg(acc, id) : acc), k);
}

/** Haalt de sets van de andere stroom weg. Een set zonder stroom blijft. */
export function haalStroomWeg(k: SamenstelKeuze, perId: ReadonlyMap<string, SetVoorSturing>, behoud: 'A-stroom' | 'B-stroom'): SamenstelKeuze {
  const andere = behoud === 'A-stroom' ? 'B-stroom' : 'A-stroom';
  return k.sets.reduce((acc, id) => (perId.get(id)?.stroom?.trim() === andere ? haalSetWeg(acc, id) : acc), k);
}

// De zinnen van het sturen staan hier, zodat ze samen met de logica getest worden.

/** Onder de kenmerken van een gekozen set waarvan de tweeling ook gekozen is. */
export const ZIN_TWEELING_GEKOZEN = 'Dezelfde doelen als een andere set die je koos. Je hebt er maar één nodig.';
/** Onder de gekozen sets, als ze van het gewoon én het buitengewoon onderwijs zijn. */
export const ZIN_GEWOON_EN_BUITENGEWOON = 'Je koos sets voor het gewoon én het buitengewoon onderwijs. Een lijst is meestal voor één groep leerlingen.';
/** Onder de gekozen sets, als ze van de A- én de B-stroom zijn. */
export const ZIN_A_EN_B = 'Je koos sets voor de A-stroom én de B-stroom. Een lijst is meestal voor één stroom.';
/** In stap 3, als de lijst sets van de A- én de B-stroom mengt. */
export const ZIN_LIJST_MENGT_STROMEN = 'Je lijst mengt sets voor de A-stroom en de B-stroom. Voor welke stroom is ze?';

function aantalSets(n: number): string {
  return `${n} ${n === 1 ? 'set' : 'sets'}`;
}

/** Onder de resultaten van stap 1, als de keuze van het blok sets verbergt. */
export function zinVerborgenSets(n: number): string {
  return n === 1 ? '1 set voor andere leerlingen staat niet in de lijst.' : `${n} sets voor andere leerlingen staan niet in de lijst.`;
}

/** In stap 3, als de lijst dezelfde doelen voor het gewoon en het buitengewoon onderwijs bevat; `k` = het aantal sets van elk. */
export function zinTweelingenInLijst(k: number): string {
  return `Je koos dezelfde doelen twee keer: voor het gewoon en voor het buitengewoon secundair onderwijs (${aantalSets(k)} van elk). Een lijst is meestal voor één groep leerlingen. Voor wie is deze lijst?`;
}

/** Wat een van de eenklikknoppen van stap 3 houdt. */
export type Behoud = 'so' | 'buso' | 'A-stroom' | 'B-stroom';

/** De statusregel na het weghalen: welke sets weg zijn en hoeveel doelen de lijst nu telt. */
export function zinNaWeghalen(behoud: Behoud, doelen: number): string {
  const weg = behoud === 'so' ? 'het buitengewoon onderwijs' : behoud === 'buso' ? 'het gewoon onderwijs' : behoud === 'A-stroom' ? 'de B-stroom' : 'de A-stroom';
  return `De sets voor ${weg} zijn weggehaald. Je lijst telt nu ${doelen} ${doelen === 1 ? 'doel' : 'doelen'}.`;
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
