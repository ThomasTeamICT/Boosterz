// Hulp voor de sectie "Beroepskwalificaties" (BkSectie.tsx en BkKaart.tsx, docs/STUDIERICHTINGEN.md § 23.7.2): de zinnen die
// niet in `bkWeergave.ts` staan, en de pure logica achter "Bewaar als leerplan" en de knoppen bij de meldingen. Puur: geen
// React, geen opslag, geen netwerk, zodat vitest (zonder DOM) alles kan nakijken.
//
// Waarom de zinnen hier staan en niet in `bkWeergave.ts`: dat bestand hoort bij een ander pakket (K7). Verhuizen kan later
// zonder iets te veranderen: knip de constanten en de kleine functies hieronder en plak ze in `bkWeergave.ts`.
//
// Wat deze logica belooft:
// - "Maak een nieuw leerplan met de lijst van nu" houdt de keuze van de leerkracht: wie 8 van de 12 competenties koos, krijgt
//   de gekozen competenties die nog in de officiële lijst staan, niet stil alle competenties. Een leerplan met meer
//   beroepskwalificaties verliest er geen. Alleen bij "alle competenties" gekozen wordt het opnieuw alle competenties.
// - "Maak een leerplan met de versie van nu" kan een keuze niet overzetten (een nieuwe versie heeft andere competenties):
//   het nieuwe leerplan krijgt alle competenties van de nieuwe versie, en de melding zegt dat vooraf.
// - Een nieuw leerplan krijgt nooit dezelfde titel als een leerplan dat al op het toestel staat.

import type { BkBestand } from '../../../lib/beroepskwalificaties';
import {
  leerplanUitBk,
  selectieVanBkLeerplan,
  titelVoorBkLeerplan,
  vindBkLeerplan,
  type BkKeuze,
  type BkLeerplanUitkomst,
} from '../../../lib/bkLeerplan';
import { BK_NOG_NODIG_BESTAND, BK_ZONDER_BESTAND, bkNietNagekeken, datumTekst } from '../../../lib/bkWeergave';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { aantalCompetentiesMetTekst, bkKaderDoelen } from '../../../lib/dekkingBk';
import type { Doelgroep } from '../../../lib/doelgroep';
import type { RichtingBkRegel } from '../../../lib/richtingBk';
import { samenTitel } from '../../../lib/richtingCursus';
import type { RichtingInfo } from '../../../lib/richtingKader';

// ── Zinnen ──────────────────────────────────────────────────────────────────

/** In `bkNietNagekeken(…)`: de opslag weigerde het leerplan (bv. vol). De opslaglaag meldt zelf al dat de opslag vol is. */
export const BK_OPSLAG_MISLUKT = 'het bewaren op dit toestel is niet gelukt';
/** In `bkNietNagekeken(…)`: een onverwachte fout zonder eigen tekst. */
export const BK_ALGEMENE_FOUT = 'er ging iets mis bij het maken ervan';
/** In `bkNietNagekeken(…)`: van de gekozen competenties staat er na een update geen enkele meer in de officiële lijst. */
export const BK_GEEN_KEUZE_MEER = 'geen enkele competentie die je koos, staat nog in de officiële lijst';
/** Toast: er staat al een leerplan met precies deze competenties (van dezelfde versie) op het toestel. */
export const BK_TOAST_BESTAAT_AL = 'Dit leerplan staat al op dit toestel.';
/** Kop in de lijst competenties voor wat de bron geen soort geeft, als de bron er verder meer dan één soort heeft. */
export const BK_ANDERE_COMPETENTIES = 'Andere competenties';

/**
 * Onder de knop in de kopregel, als de sectie er (nog) niet staat. Die staat pas als het kader van de minimumdoelen klaar
 * is; zolang dat laadt of in fout staat, is de zin waar. Hij mag niet beloven dat het vanzelf komt: bij een fout komt de
 * sectie pas na "Opnieuw proberen" bij de minimumdoelen.
 */
export const BK_KOP_MIST = 'De sectie staat er nog niet: de minimumdoelen van deze richting zijn nog niet geladen. Lukt dat niet, kies dan bij de minimumdoelen ‘Opnieuw proberen’.';

// "Nog nodig: …" bij een knop die nog niet kan (aria-disabled, § 23.7.7). Elke toestand zegt zijn eigen reden.
export const BK_NOG_NODIG_LADEN = 'Nog nodig: even wachten tot de competenties van de beroepskwalificatie geladen zijn.';
export const BK_NOG_NODIG_GEGEVENS = 'Nog nodig: even wachten tot Boosterz de laatste gegevens geladen heeft.';
export const BK_NOG_NODIG_BEZIG = 'Nog nodig: even wachten tot het leerplan bewaard is.';
export const BK_NOG_NODIG_KEUZE = 'Nog nodig: minstens één competentie die je koos en die nog in de officiële lijst staat.';

/**
 * In een melding met een knop die een nieuw leerplan maakt, als dat leerplan er al is (bv. net gemaakt): de knop en de
 * uitleg vooraf zijn dan weg, en deze zin zegt waar het nieuwe leerplan is. Erachter staat "Open het leerplan".
 * "Je hebt al een leerplan met de versie van nu: ‘<titel>’." (bij een aangepaste lijst "met de lijst van nu").
 */
export function bkAlLeerplanVanNu(soort: 'andere-versie' | 'lijst-aangepast', titel: string): string {
  const wat = soort === 'andere-versie' ? 'de versie van nu' : 'de lijst van nu';
  const t = typeof titel === 'string' ? titel.trim() : '';
  return t === '' ? `Je hebt al een leerplan met ${wat}.` : `Je hebt al een leerplan met ${wat}: ‘${t}’.`;
}

/** Na de zin over een onderdeel van de richting dat niet meer in de bron staat (`bkOnderdeelNietMeerInBron`). */
export const BK_LAATST_BEKENDE_BKS = 'Je ziet de laatst bekende beroepskwalificaties.';

/**
 * Boven de kaarten, als een onderdeel van de richting waar de kaarten uit komen twee keer niet gevonden werd
 * (`RichtingBk.onderdeelNietMeerInBron`, § 23.5.7): de kaarten zijn de laatst bekende. Zonder geldige dag zonder datum.
 * "De Vlaamse overheid geeft sinds 3 november 2026 niet meer alle gegevens van deze richting. Je ziet de laatst bekende
 * beroepskwalificaties." Ook waar als maar één variant van de richting wegviel: dan zijn het niet meer álle gegevens.
 */
export function bkOnderdeelNietMeerInBron(sinds: string | undefined): string {
  const datum = datumTekst(sinds);
  return `De Vlaamse overheid geeft ${datum !== '' ? `sinds ${datum} ` : ''}niet meer alle gegevens van deze richting. ${BK_LAATST_BEKENDE_BKS}`;
}

/** Hint bij "Maak een leerplan met de versie van nu" als het oude leerplan maar een deel van de competenties had. */
export function bkHintKeuzeNieuweVersie(gekozen: number): string {
  const deel = gekozen === 1 ? 'de competentie die je koos' : `de ${gekozen} competenties die je koos`;
  return `Het nieuwe leerplan krijgt alle competenties van de nieuwe versie, niet alleen ${deel}: Boosterz kan je keuze niet overzetten naar een andere versie.`;
}

/**
 * Hint bij "Maak een nieuw leerplan met de lijst van nu" als het oude leerplan maar een deel van de competenties had:
 * wat het nieuwe leerplan overhoudt van wat de leerkracht koos, en wat er niet meer in de officiële lijst staat.
 */
export function bkHintKeuzeNieuweLijst(o: { bkTitel: string; behouden: number; weg: number }): string {
  const titel = `‘${o.bkTitel.trim()}’`;
  if (o.behouden <= 0) return `Van ${titel} blijft er niets over: geen enkele competentie die je koos, staat nog in de officiële lijst.`;
  const houdt = o.behouden === 1
    ? 'de ene competentie die je koos en die nog in de officiële lijst staat'
    : `de ${o.behouden} competenties die je koos en die nog in de officiële lijst staan`;
  const weg = o.weg <= 0 ? '' : o.weg === 1 ? ' 1 competentie die je koos, staat er niet meer in.' : ` ${o.weg} competenties die je koos, staan er niet meer in.`;
  return `Van ${titel} houdt het nieuwe leerplan ${houdt}.${weg}`;
}

// ── Waarom een knop nog niet kan ────────────────────────────────────────────

/** "Maak een cursus met deze competenties": kan zodra het bestand van de beroepskwalificatie er is. */
export function redenCursus(o: { laden: boolean; heeftBestand: boolean }): string | undefined {
  if (o.heeftBestand) return undefined;
  return o.laden ? BK_NOG_NODIG_LADEN : BK_NOG_NODIG_BESTAND;
}

/** "Bewaar als leerplan": het bestand, de gegevens van de update (versiemerken) en geen andere bewaaractie bezig. */
export function redenBewaar(o: { laden: boolean; heeftBestand: boolean; kanBewaren: boolean; bezig: boolean }): string | undefined {
  const bestand = redenCursus(o);
  if (bestand !== undefined) return bestand;
  if (!o.kanBewaren) return BK_NOG_NODIG_GEGEVENS;
  return o.bezig ? BK_NOG_NODIG_BEZIG : undefined;
}

/** De knop bij een melding over een bestaand leerplan: het bestand laadt de knop zelf, dus alleen de rest telt. */
export function redenMelding(o: { kanBewaren: boolean; bezig: boolean; zonderKeuze?: boolean }): string | undefined {
  if (o.zonderKeuze === true) return BK_NOG_NODIG_KEUZE;
  if (!o.kanBewaren) return BK_NOG_NODIG_GEGEVENS;
  return o.bezig ? BK_NOG_NODIG_BEZIG : undefined;
}

// ── De competenties van een bestand ─────────────────────────────────────────

/**
 * De BK-versie als kader, zodat de lijst op de kaart dezelfde is als die van het leerplan en de dekking. `bkKaderDoelen`
 * gebruikt van de regel alleen de versie; de rest is hier neutraal.
 */
export function kaderVan(versie: string, bestand: BkBestand) {
  const regel: RichtingBkRegel = { bk: versie, nummer: '', versie: 0, titel: bestand.titel, onderdelen: [], alleOnderdelen: true };
  return bkKaderDoelen({ herkomst: 'api', bks: [regel], bekrachtigingen: [] }, new Map([[versie, bestand]]));
}

/**
 * De ids van de competenties met een tekst, in de volgorde van het bestand: de selectie van "Bewaar als leerplan" (alle
 * competenties, maar nooit een competentie zonder tekst) en van `vindBkLeerplan`.
 */
export function competentieIds(versie: string, bestand: BkBestand): string[] {
  return kaderVan(versie, bestand).map((d) => d.id);
}

// ── Het leerplan van een kaart ──────────────────────────────────────────────

export interface KaartLeerplanIn {
  /** De BK-versies van de kaarten. */
  versies: readonly string[];
  /** De geladen bestanden, per BK-versie. Verplicht: zonder bestanden herkent `vindBkLeerplan` niets na een update. */
  bestanden: ReadonlyMap<string, BkBestand>;
  /** De leerplannen op dit toestel. */
  curricula: readonly Curriculum[];
  /** De doelgroep van de richting. */
  doelgroep: Doelgroep;
  /** BK-versie → versiemerk uit de index. */
  merken: ReadonlyMap<string, string>;
  /** BK-versie → het id van het leerplan dat de sectie net bewaarde (de opslag is misschien nog niet doorgegeven). */
  bewaard: ReadonlyMap<string, string>;
}

/**
 * Per kaart het leerplan achter "Open het leerplan": het nagekeken leerplan met alle competenties (met tekst) van die versie
 * (`vindBkLeerplan`, met de bestanden, dus ook na een update die het leerplan niet raakt, § 23.6.4), anders het leerplan dat
 * de sectie net voor die kaart bewaarde. Een kaart zonder geladen bestand krijgt er geen: dan is niet aan te tonen welke
 * competenties "alle" zijn.
 */
export function leerplanPerKaart(o: KaartLeerplanIn): Map<string, Curriculum> {
  const uit = new Map<string, Curriculum>();
  const curricula = Array.isArray(o.curricula) ? o.curricula : [];
  for (const versie of o.versies) {
    const bestand = o.bestanden.get(versie);
    if (!bestand) continue;
    let l = vindBkLeerplan(curricula, new Map([[versie, competentieIds(versie, bestand)]]), o.doelgroep, o.merken, o.bestanden);
    if (!l) {
      const id = o.bewaard.get(versie);
      l = id !== undefined ? curricula.find((c) => c?.id === id) : undefined;
    }
    if (l) uit.set(versie, l);
  }
  return uit;
}

// ── Wat een nieuw leerplan bevat ────────────────────────────────────────────

/** Waarvoor een nieuw leerplan gemaakt wordt. */
export type BewaarDoel =
  /** "Bewaar als leerplan": alle competenties met een tekst van één versie. */
  | { soort: 'kaart'; versie: string }
  /** "Maak een leerplan met de versie van nu": `leerplan` volgt `oud`, de richting verwijst nu naar `nu`. */
  | { soort: 'andere-versie'; leerplan: Curriculum; oud: string; nu: string }
  /** "Maak een nieuw leerplan met de lijst van nu": de officiële lijst van `bk` veranderde sinds `leerplan` gemaakt werd. */
  | { soort: 'lijst-aangepast'; leerplan: Curriculum; bk: string };

/** De BK-versies van het nieuwe leerplan, in de volgorde van het oude leerplan (bij een nieuwe versie op de plaats van de oude). */
export function versiesVoorDoel(doel: BewaarDoel): string[] {
  if (doel.soort === 'kaart') return [doel.versie];
  const uit: string[] = [];
  for (const versie of selectieVanBkLeerplan(doel.leerplan).keys()) {
    const v = doel.soort === 'andere-versie' && versie === doel.oud ? doel.nu : versie;
    if (!uit.includes(v)) uit.push(v);
  }
  const kern = doel.soort === 'andere-versie' ? doel.nu : doel.bk;
  if (!uit.includes(kern)) uit.push(kern);
  return uit;
}

/** Had het leerplan bij het maken alle competenties van deze versie gekozen? Dan wordt het ook nu weer "alle". */
function alleGekozen(leerplan: Curriculum, versie: string): boolean {
  return (Array.isArray(leerplan.bkVersies) ? leerplan.bkVersies : []).some((m) => m?.bk === versie && m.alle === true);
}

export type Samenstelling =
  /** `ontbreekt`: de eerste versie waarvan het bestand ontbreekt. */
  | { ok: false; ontbreekt: string }
  | {
      ok: true;
      /** Per versie de competenties die in het nieuwe leerplan komen; een versie zonder competenties valt weg. */
      keuzes: BkKeuze[];
      /** Hoeveel gekozen competenties niet meekomen omdat ze niet meer in de officiële lijst staan. */
      weg: number;
      /** Er blijft geen enkele competentie over. */
      leeg: boolean;
    };

/**
 * Welke competenties het nieuwe leerplan krijgt:
 * - `kaart`: alle competenties met een tekst;
 * - `lijst-aangepast`: per versie van het oude leerplan de gekozen competenties die nog in het huidige bestand staan, of
 *   alle competenties van nu als het oude leerplan er alle had;
 * - `andere-versie`: hetzelfde, maar de oude versie wordt de nieuwe met al haar competenties (een keuze uit de oude versie
 *   is niet over te zetten: de competenties van een nieuwe versie zijn andere).
 * `bestanden` moet het bestand van elke versie uit `versiesVoorDoel` hebben.
 */
export function stelSamen(doel: BewaarDoel, bestanden: ReadonlyMap<string, BkBestand>): Samenstelling {
  const keuzes: BkKeuze[] = [];
  let weg = 0;
  const selectie = doel.soort === 'kaart' ? new Map<string, string[]>() : selectieVanBkLeerplan(doel.leerplan);
  for (const versie of versiesVoorDoel(doel)) {
    const bestand = bestanden.get(versie);
    if (!bestand) return { ok: false, ontbreekt: versie };
    const huidig = competentieIds(versie, bestand);
    let ids = huidig;
    if (doel.soort !== 'kaart' && !(doel.soort === 'andere-versie' && versie === doel.nu) && !alleGekozen(doel.leerplan, versie)) {
      const bestaan = new Set(huidig);
      const gekozen = selectie.get(versie) ?? [];
      ids = gekozen.filter((id) => bestaan.has(id));
      weg += gekozen.length - ids.length;
    }
    // "Bewaar als leerplan" geeft ook een lege lijst door: `leerplanUitBk` zegt dan zelf dat er niets te kiezen is.
    if (ids.length > 0 || doel.soort === 'kaart') keuzes.push({ bestand, competenties: ids });
  }
  return { ok: true, keuzes, weg, leeg: keuzes.every((k) => k.competenties.length === 0) };
}

/** De selectie van een samenstelling zoals `vindBkLeerplan` ze vraagt: BK-versie → competenties. */
export function selectieVan(keuzes: readonly BkKeuze[]): Map<string, string[]> {
  return new Map(keuzes.map((k) => [k.bestand.bk, [...k.competenties]] as const));
}

/** De doelgroep van het nieuwe leerplan: bij een melding die van het oude leerplan (zoals "Werk het leerplan bij"). */
export function doelgroepVoorDoel(doel: BewaarDoel, standaard: Doelgroep): Doelgroep {
  return doel.soort === 'kaart' ? standaard : doel.leerplan.doelgroep ?? standaard;
}

// ── Wat de melding vooraf zegt ──────────────────────────────────────────────

export interface MeldingUitleg {
  /** Wat het nieuwe leerplan met de keuze van de leerkracht doet; leeg als het leerplan alle competenties had. */
  hint?: string;
  /** Er blijft niets over: de knop kan niet. */
  zonderKeuze: boolean;
}

/**
 * Wat een knop bij een melding doet met de keuze van de leerkracht, vóór ze klikt. `bkTitel` is de titel van de
 * beroepskwalificatie van de melding ("Onthaalmedewerker"). Zonder het bestand dat de uitleg nodig heeft, geen hint.
 */
export function beschrijfMelding(doel: Exclude<BewaarDoel, { soort: 'kaart' }>, bestanden: ReadonlyMap<string, BkBestand>, bkTitel: string): MeldingUitleg {
  const sam = stelSamen(doel, bestanden);
  const zonderKeuze = sam.ok && sam.leeg;
  const selectie = selectieVanBkLeerplan(doel.leerplan);
  if (doel.soort === 'andere-versie') {
    const gekozen = selectie.get(doel.oud)?.length ?? 0;
    return alleGekozen(doel.leerplan, doel.oud) || gekozen === 0 ? { zonderKeuze } : { hint: bkHintKeuzeNieuweVersie(gekozen), zonderKeuze };
  }
  const bestand = bestanden.get(doel.bk);
  if (!bestand || alleGekozen(doel.leerplan, doel.bk)) return { zonderKeuze };
  const bestaan = new Set(competentieIds(doel.bk, bestand));
  const gekozen = selectie.get(doel.bk) ?? [];
  const behouden = gekozen.filter((id) => bestaan.has(id)).length;
  const weg = gekozen.length - behouden;
  return weg === 0 ? { zonderKeuze } : { hint: bkHintKeuzeNieuweLijst({ bkTitel, behouden, weg }), zonderKeuze };
}

/** Wat een melding met een knop voor een nieuw leerplan toont (§ 23.7.2). */
export type MeldingInhoud =
  /** Het nieuwe leerplan staat er al: de zin met zijn titel en "Open het leerplan"; geen uitleg vooraf en geen knop. */
  | { soort: 'al'; tekst: string; leerplan: Curriculum }
  /** Nog niet: de uitleg vooraf (wat de knop met de keuze van de leerkracht doet) en de knop. */
  | { soort: 'knop'; uitleg: MeldingUitleg };

export interface MeldingIn {
  doel: Exclude<BewaarDoel, { soort: 'kaart' }>;
  /** De geladen bestanden, per BK-versie. */
  bestanden: ReadonlyMap<string, BkBestand>;
  /** De leerplannen op dit toestel. */
  curricula: readonly Curriculum[];
  /** De doelgroep van de richting (bij een melding telt die van het oude leerplan, `doelgroepVoorDoel`). */
  doelgroep: Doelgroep;
  /** BK-versie → versiemerk uit de index. */
  merken: ReadonlyMap<string, string>;
  /** Het id van het leerplan dat de knop van deze melding net maakte. */
  onthouden?: string;
  /** De titel van de beroepskwalificatie van de melding ("Onthaalmedewerker"), voor de uitleg vooraf. */
  bkTitel: string;
}

/**
 * Het leerplan dat de knop van een melding zou maken, als het al op dit toestel staat: het leerplan dat deze knop net maakte
 * (`onthouden`), of een nagekeken leerplan met precies de competenties van de samenstelling (`vindBkLeerplan`, met de
 * bestanden).
 */
export function leerplanVoorMelding(o: Omit<MeldingIn, 'bkTitel'>): Curriculum | undefined {
  const curricula = Array.isArray(o.curricula) ? o.curricula : [];
  const net = o.onthouden !== undefined ? curricula.find((c) => c?.id === o.onthouden) : undefined;
  if (net) return net;
  const sam = stelSamen(o.doel, o.bestanden);
  if (!sam.ok || sam.leeg) return undefined;
  return vindBkLeerplan(curricula, selectieVan(sam.keuzes), doelgroepVoorDoel(o.doel, o.doelgroep), o.merken, o.bestanden);
}

/**
 * Wat de melding toont: staat het nieuwe leerplan er al, dan alleen waar het is (zonder uitleg in de toekomende tijd over een
 * knop die er niet meer is), anders de uitleg en de knop. De waarschuwing over het oude leerplan en de vaste hint blijven
 * in beide gevallen staan: ze kloppen nog.
 */
export function meldingInhoud(o: MeldingIn): MeldingInhoud {
  const al = leerplanVoorMelding(o);
  if (al) return { soort: 'al', tekst: bkAlLeerplanVanNu(o.doel.soort, al.title), leerplan: al };
  return { soort: 'knop', uitleg: beschrijfMelding(o.doel, o.bestanden, o.bkTitel) };
}

// ── De titel ────────────────────────────────────────────────────────────────

const MAX_TITEL = 120;
const SCHEIDER = ' · ';

/** Inkorten tot hoogstens `max` tekens (met "…" als er iets wegviel), zonder een tekenpaar doormidden te knippen. */
function inkorten(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, Math.max(0, max - 1));
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return `${uit.trimEnd()}…`;
}

/** Hoofdletters, witruimte en randen tellen niet bij het vergelijken van titels. */
function titelSleutel(t: string): string {
  return t.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Het stuk dat een tweede leerplan met dezelfde titel onderscheidt: "nieuwe lijst van 11 oktober 2026". */
export function titelToevoeging(soort: BewaarDoel['soort'], vandaag: string): string {
  const datum = datumTekst(vandaag);
  const voor = soort === 'andere-versie' ? 'nieuwe versie' : soort === 'lijst-aangepast' ? 'nieuwe lijst' : '';
  if (voor === '') return datum !== '' ? `van ${datum}` : 'nieuw';
  return datum !== '' ? `${voor} van ${datum}` : voor;
}

/**
 * `basis` met `toevoeging` erachter, hoogstens `max` tekens. Past het niet, dan wordt telkens het langste deel ingekort (zoals
 * bij de andere titels van een richting, `samenTitel`): het onderscheidende stuk en het deel "(7 van 11 competenties)" blijven
 * staan.
 */
function metToevoeging(basis: string, toevoeging: string, max: number): string {
  const delen = basis.split(SCHEIDER);
  const m = /^(.+?)( \(\d+ van \d+ competenties?\))$/.exec(delen[0]);
  const deel = m ? m[2] : '';
  const gekort = samenTitel([m ? m[1] : delen[0], ...delen.slice(1), toevoeging], max - deel.length).split(SCHEIDER);
  return [`${gekort[0]}${deel}`, ...gekort.slice(1)].join(SCHEIDER);
}

/**
 * De titel van het nieuwe leerplan: `basis` zoals ze is, tenzij er al een leerplan met die titel op het toestel staat. Dan
 * komt `toevoeging` erachter (en bij nog een gelijke " (2)", " (3)", …), zodat de leerkracht de leerplannen in de lijst kan
 * onderscheiden. Hoogstens 120 tekens: past het niet, dan wordt de basis ingekort en blijft het onderscheidende stuk staan.
 */
export function uniekeTitel(basis: string, bestaande: readonly string[], toevoeging: string, max = MAX_TITEL): string {
  const gebruikt = new Set(bestaande.map(titelSleutel));
  const kort = inkorten(basis, max);
  if (!gebruikt.has(titelSleutel(kort))) return kort;
  const eerste = metToevoeging(basis, toevoeging, max);
  if (!gebruikt.has(titelSleutel(eerste))) return eerste;
  for (let n = 2; n < 100; n++) {
    const kandidaat = metToevoeging(basis, `${toevoeging} (${n})`, max);
    if (!gebruikt.has(titelSleutel(kandidaat))) return kandidaat;
  }
  return eerste;
}

// ── Het nieuwe leerplan ─────────────────────────────────────────────────────

export type NieuwLeerplan =
  /** Er staat al een nagekeken leerplan met precies deze competenties van deze versies: er komt geen tweede. */
  | { soort: 'bestaat'; leerplan: Curriculum }
  /** Het nieuwe leerplan; bewaren doet de aanroeper alleen als `uitkomst.bevestigd`. */
  | { soort: 'nieuw'; uitkomst: BkLeerplanUitkomst }
  /** Er kan niets gemaakt worden; de tekst is voor de leerkracht, en er is niets bewaard. */
  | { soort: 'fout'; tekst: string };

export interface BouwIn {
  doel: BewaarDoel;
  /** Het bestand van elke versie uit `versiesVoorDoel(doel)`. */
  bestanden: ReadonlyMap<string, BkBestand>;
  info: RichtingInfo;
  doelgroep: Doelgroep;
  /** BK-versie → versiemerk uit de index. */
  merken: ReadonlyMap<string, string>;
  /** De leerplannen op dit toestel, vers uit de opslag. */
  curricula: readonly Curriculum[];
  /** JJJJ-MM-DD. */
  vandaag: string;
}

/**
 * Het leerplan dat een knop in de sectie maakt, zonder iets te bewaren: de samenstelling, het hergebruik van een gelijk
 * leerplan, de titel (met het deel "(8 van 12 competenties)" en onderscheidend) en `leerplanUitBk`. Bewaren, melden en de
 * focus doet het scherm.
 */
export function bouwNieuwLeerplan(o: BouwIn): NieuwLeerplan {
  const sam = stelSamen(o.doel, o.bestanden);
  if (!sam.ok) return { soort: 'fout', tekst: BK_ZONDER_BESTAND };
  if (sam.leeg && o.doel.soort !== 'kaart') return { soort: 'fout', tekst: bkNietNagekeken(BK_GEEN_KEUZE_MEER) };

  const doelgroep = doelgroepVoorDoel(o.doel, o.doelgroep);
  // Met de bestanden: een leerplan dat een update niet raakte (alleen kennis of context veranderde), telt ook.
  const bestaand = vindBkLeerplan(o.curricula, selectieVan(sam.keuzes), doelgroep, o.merken, o.bestanden);
  if (bestaand) return { soort: 'bestaat', leerplan: bestaand };

  // Een deel alleen bij één beroepskwalificatie, zoals de standaardtitel van `leerplanUitBk`.
  const deel = sam.keuzes.length === 1
    ? { gekozen: sam.keuzes[0].competenties.length, totaal: aantalCompetentiesMetTekst(sam.keuzes[0].bestand) }
    : undefined;
  const basis = titelVoorBkLeerplan(o.info, sam.keuzes.map((k) => k.bestand.titel), deel);
  const titel = uniekeTitel(basis, o.curricula.map((c) => c.title), titelToevoeging(o.doel.soort, o.vandaag));
  return { soort: 'nieuw', uitkomst: leerplanUitBk(sam.keuzes, { doelgroep, merken: o.merken, titel }) };
}
