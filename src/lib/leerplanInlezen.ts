// ── Leerplan inlezen: de pure logica achter de wizard ───────────────────────
//
// De wizard (pages/LeerplanInlezenPage.tsx) leidt de leerkracht in vier stappen van het leerplan van
// zijn net naar een bewaard, nagekeken leerplan: welk leerplan, de bron (pdf of tekst), de koppeling
// met de officiële minimumdoelen, en het nakijken. Alles wat zonder scherm kan, staat hier en is
// getest: keuzes en titel, wat er nog ontbreekt, doelen zoeken, sets voorstellen, verwijzingen
// koppelen, doelen aanpassen, het ontwerp bouwen en de redenen waarom bevestigen nog niet kan.
//
// Het eigenlijke werk doen de kernmodules: leerplanLezer (tekst naar doelen), minimumdoelVerwijzing
// (verwijzingen oplossen), curriculumCheck (de nakijkpoort) en curriculum (saneren, bevestigen).
// Pure module: geen React, geen netwerk. Alleen het onthouden van de naam van de nakijker raakt
// localStorage, altijd in try/catch.

import type { Curriculum, CurriculumGoal, CurriculumHerkomst, CurriculumNet, MinimumdoelRef } from './curriculumTypes';
import type { Bevinding, BevindingErnst, ControleRapport } from './curriculumCheck';
import { createCurriculum, normalizeGoalCode, sanitizeCurriculum, sanitizeGoal } from './curriculum';
import { doelgroepVoorLeerplan, type Doelgroep } from './doelgroep';
import { leesNiveau, niveauTekst } from './leerplanNiveau';
import { NET_KEUZES } from './leerplanNetten';
import { leesLeerplan, naarCurriculumGoals, type LezerResultaat } from './leerplanLezer';
import type { Minimumdoel, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import type { GeldigheidCode } from './minimumdoelenBron';
import { geldigheidTekstVanBestand, geldigheidVanBestand, type OnderwijsKeuze } from './setKeuze';
import { losVerwijzingenOp, normaliseerMdCode, vindVerwijzingen, type VerwijzingProbleem } from './minimumdoelVerwijzing';
import { sha256Hex } from './sha256';

// De AI-weg en wat de wizard daarbij meegeeft, staan in een apart, licht bestand: de leerplannenpagina leest het ook.
export { AI_NIEUW_ROUTE, maakAiVoorinvulling, type AiVoorinvulling } from './leerplanAiOverdracht';

// De rangschikking van sets en de geldigheid staan in setKeuze.ts (ook de editor van de leerplannen gebruikt ze).
export { geldigheidTekstVanBestand, geldigheidVanBestand, kandidaatSets, gemengdeStromen, type KandidaatOpties, type OnderwijsKeuze } from './setKeuze';

// ── Stap 1: welk leerplan? ──────────────────────────────────────────────────

export { GRAAD_OPTIES, STROOM_OPTIES, leesNiveau, niveauTekst } from './leerplanNiveau';

export const ONDERWIJS_OPTIES: readonly { id: OnderwijsKeuze; label: string }[] = [
  { id: 'so', label: 'Gewoon secundair onderwijs' },
  { id: 'buso', label: 'Buitengewoon secundair onderwijs' },
  { id: 'vwo', label: 'Volwassenenonderwijs' },
];

export interface LeerplanKeuze {
  /** Leeg zolang de leerkracht nog geen net koos. */
  net: CurriculumNet | '';
  vak: string;
  onderwijs: OnderwijsKeuze;
  /** Leeg = geen graad. */
  graad: string;
  /** Leeg = geen stroom of finaliteit. */
  stroom: string;
  leerplancode: string;
  versie: string;
  titel: string;
}

export function legeKeuze(): LeerplanKeuze {
  return { net: '', vak: '', onderwijs: 'so', graad: '', stroom: '', leerplancode: '', versie: '', titel: '' };
}

/**
 * Een titel uit de rest: "Aardrijkskunde 1ste graad A-stroom (KOV I-Aar-a)". Zonder vak geeft ze niets:
 * een titel zonder vak zegt te weinig om voor te stellen.
 */
export function stelTitelVoor(k: Pick<LeerplanKeuze, 'net' | 'vak' | 'graad' | 'stroom' | 'leerplancode'>): string {
  const vak = k.vak.trim();
  if (!vak) return '';
  const kort = NET_KEUZES.find((n) => n.id === k.net)?.kort ?? '';
  const achter = [kort, k.leerplancode.trim()].filter(Boolean).join(' ');
  return [vak, niveauTekst(k.graad, k.stroom)].filter(Boolean).join(' ') + (achter ? ` (${achter})` : '');
}

/** De keuzes van een bestaand leerplan, om het nog eens na te kijken. */
export function keuzeUitLeerplan(cur: Curriculum): LeerplanKeuze {
  const niveau = leesNiveau(cur.level);
  return {
    net: cur.net,
    vak: cur.subject,
    onderwijs: 'so',
    graad: niveau.graad,
    stroom: niveau.stroom,
    leerplancode: cur.herkomst?.leerplancode ?? '',
    versie: cur.herkomst?.versie ?? '',
    titel: cur.title,
  };
}

/** Wat er nog ontbreekt: `veld` is het id van het invoerveld dat de pagina dan kan aanwijzen. */
export interface Ontbrekend {
  veld?: string;
  /** Een korte zin zonder hoofdletter of punt, bv. "vul het vak in". */
  tekst: string;
  /**
   * Het id van een stuk pagina dat dit al uitlegt (bv. de melding "Geen doelen gevonden"). De pagina zegt het
   * dan niet nog eens onder de knop, maar verwijst de knop ernaar. Zo staat er één melding en geen drie.
   */
  elders?: string;
}

export function ontbreektInKeuze(k: LeerplanKeuze): Ontbrekend[] {
  const uit: Ontbrekend[] = [];
  if (k.net === '') uit.push({ veld: 'il-net', tekst: 'kies een net' });
  if (!k.vak.trim()) uit.push({ veld: 'il-vak', tekst: 'vul het vak in' });
  if (!k.titel.trim()) uit.push({ veld: 'il-titel', tekst: 'geef het leerplan een titel' });
  return uit;
}

/** "kies een net, vul het vak in en geef het leerplan een titel" */
export function somLijst(delen: readonly string[]): string {
  if (delen.length <= 1) return delen.join('');
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** "Nog nodig: kies een net en vul het vak in." Leeg als er niets ontbreekt. */
export function zegOntbrekend(lijst: readonly Ontbrekend[]): string {
  return lijst.length === 0 ? '' : `Nog nodig: ${somLijst(lijst.map((o) => o.tekst))}.`;
}

// ── Opzoeken op doel-id ─────────────────────────────────────────────────────

/**
 * Een lege opzoektabel op doel-id, zonder prototype: een id als "constructor" of "__proto__" (uit een bestand van
 * iemand anders) zoekt dan nooit iets op wat in elk object zit. Voor wat de wizard per doel bijhoudt (`problemen`,
 * `fragmenten`). `sanitizeGoal` laat zulke id's trouwens niet meer door; dit is de tweede grendel.
 */
export function leegRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** Een kopie van een opzoektabel zonder prototype, zonder de sleutels in `weg`. */
export function kopieerRecord<T>(bron: Readonly<Record<string, T>>, weg: readonly string[] = []): Record<string, T> {
  const uit = leegRecord<T>();
  for (const k of Object.keys(bron)) if (!weg.includes(k)) uit[k] = bron[k];
  return uit;
}

/** Het item bij een doel-id, ook uit een gewone tabel (bv. `rapport.perDoel`): alleen een eigen sleutel telt. */
export function opId<T>(bron: Readonly<Record<string, T>> | undefined, id: string): T | undefined {
  return bron !== undefined && Object.prototype.hasOwnProperty.call(bron, id) ? bron[id] : undefined;
}

// ── Stap 2: de bron ─────────────────────────────────────────────────────────

/** Groter dan dit lezen we niet in (zoals de andere pdf-knop in de app). */
export const MAX_PDF_MB = 25;

export interface BronGegevens {
  methode: 'pdf' | 'tekst';
  tekst: string;
  /** Bestandsnaam van de pdf. */
  bronNaam?: string;
  /** Vingerafdruk van de pdf-bytes; bij geplakte tekst rekent `bronHash` ze uit de tekst. */
  bronSha256?: string;
  /** Aantal gelezen pagina's van de pdf. */
  paginas?: number;
  /** Aantal pagina's dat de pdf heeft (meer dan `paginas` als ze afgekapt is). */
  paginasTotaal?: number;
  /** Niet alles is gelezen: nakijken kan dan niet bevestigd worden. */
  afgekapt: boolean;
}

/** De vingerafdruk van de bron: die van de bytes (pdf) of van de tekst (geplakte tekst). */
export function bronHash(b: BronGegevens): string {
  return b.bronSha256 ?? sha256Hex(b.tekst);
}

/**
 * Is dit dezelfde bron als waarmee het leerplan ooit ingelezen werd? `undefined` als dat niet na te gaan
 * valt: geen vingerafdruk bewaard, of een andere manier van inlezen (een pdf en geplakte tekst uit
 * dezelfde pdf hebben een andere vingerafdruk).
 */
export function bronKomtOvereen(herkomst: CurriculumHerkomst | undefined, bron: BronGegevens): boolean | undefined {
  if (!herkomst?.bronSha256 || herkomst.methode !== bron.methode) return undefined;
  return herkomst.bronSha256 === bronHash(bron);
}

export interface Gevonden {
  resultaat: LezerResultaat;
  /** De gelezen doelen als leerplandoelen, zonder `refs` (die volgen in stap 3). */
  goals: CurriculumGoal[];
  /** Per doel (op `id`) de ruwe regels uit de bron, voor "Bekijk in de bron". */
  fragmenten: Record<string, string>;
  /** Wanneer de doelen gelezen werden (ms). */
  op: number;
}

/**
 * Leest de doelen uit de tekst met de leerplanlezer. Elk doel gaat afzonderlijk door
 * `naarCurriculumGoals`, zodat de ruwe regels van de lezer aan het juiste doel blijven hangen, ook als
 * de lezer een doel zonder tekst oversloeg.
 */
export function zoekDoelen(tekst: string, op: number = Date.now()): Gevonden {
  const resultaat = leesLeerplan(tekst);
  const goals: CurriculumGoal[] = [];
  const fragmenten = leegRecord<string>();
  for (const doel of resultaat.doelen) {
    const goal = naarCurriculumGoals({ doelen: [doel], waarschuwingen: [], genegeerdeRegels: 0 })[0];
    if (!goal) continue;
    goals.push(goal);
    fragmenten[goal.id] = doel.bronFragment;
  }
  return { resultaat, goals, fragmenten, op };
}

// ── Stap 3: minimumdoelen koppelen ──────────────────────────────────────────

/** Zoveel sets laden we per keer; evenveel als de cache van `laadSet` onthoudt. */
export const LAAD_PER_KEER = 40;
/** Zoveel sets laden we hoogstens vooraf; wat daarbuiten valt, zoekt de leerkracht zelf. */
export const LAAD_MAX = 120;

/**
 * De verwijzingen (codes) in de doelen: uit `refsBron` en uit de verwijzingen die er al zijn, ontdubbeld
 * op de genormaliseerde code, in volgorde van het eerste voorkomen, letterlijk zoals in de bron.
 */
export function codesUitDoelen(goals: readonly CurriculumGoal[]): string[] {
  const uit: string[] = [];
  const gezien = new Set<string>();
  const voeg = (code: string) => {
    const sleutel = normaliseerMdCode(code);
    if (!sleutel || gezien.has(sleutel)) return;
    gezien.add(sleutel);
    uit.push(code);
  };
  for (const g of goals) {
    for (const code of vindVerwijzingen(g.refsBron ?? '')) voeg(code);
    for (const r of g.refs ?? []) voeg(r.code);
  }
  return uit;
}

/** Hoeveel doelen verwijzen in de bron naar minimumdoelen? */
export function aantalMetVerwijzing(goals: readonly CurriculumGoal[]): number {
  return goals.filter((g) => vindVerwijzingen(g.refsBron ?? '').length > 0).length;
}

export interface SetKandidaat {
  set: MinimumdoelenIndexSet;
  /** Ontbreekt zolang de set niet geladen is, of als laden mislukte. */
  bestand?: MinimumdoelenSetBestand;
  /** Hoeveel van de codes uit de verwijzingen in deze set voorkomen. */
  treffers: number;
  /** Die codes, genormaliseerd (`normaliseerMdCode`). */
  codes: string[];
  /** 'N' = niet meer geldig. `undefined` = onbekend. */
  geldigheid?: GeldigheidCode;
  /** "Geldig sinds 2024", "Niet meer geldig (2019–2025)", … Leeg als er niets over bekend is. */
  geldigheidTekst?: string;
  /** Laden van deze set mislukte. */
  mislukt?: boolean;
}

/** Een kandidaat voor een set, met het aantal treffers van de codes uit de verwijzingen. */
export function maakKandidaat(set: MinimumdoelenIndexSet, bestand: MinimumdoelenSetBestand | undefined, codes: readonly string[]): SetKandidaat {
  if (!bestand) return { set, treffers: 0, codes: [], mislukt: true };
  const inSet = new Set(bestand.doelen.map((d) => normaliseerMdCode(d.code)));
  const gevonden: string[] = [];
  for (const code of codes) {
    const sleutel = normaliseerMdCode(code);
    if (sleutel && inSet.has(sleutel) && !gevonden.includes(sleutel)) gevonden.push(sleutel);
  }
  return { set, bestand, treffers: gevonden.length, codes: gevonden, geldigheid: geldigheidVanBestand(bestand), geldigheidTekst: geldigheidTekstVanBestand(bestand) };
}

/** Meeste treffers eerst; bij evenveel treffers blijft de volgorde zoals ze was. */
export function rangschik(kandidaten: readonly SetKandidaat[]): SetKandidaat[] {
  return kandidaten.map((k, i) => ({ k, i })).sort((a, b) => b.k.treffers - a.k.treffers || a.i - b.i).map((p) => p.k);
}

/**
 * Welke sets staan vooraf aangevinkt? Alle sets met treffers, behalve sets die niet meer geldig zijn:
 * die hebben vaak dezelfde codes als hun opvolger, en twee sets met dezelfde codes maken elke
 * verwijzing dubbelzinnig. Een set die niet meer geldig is, gaat toch mee als hij een code dekt die
 * geen enkele geldige set met treffers heeft: dan verwijst het leerplan duidelijk naar de oude set.
 */
export function kiesVooraf(kandidaten: readonly SetKandidaat[]): string[] {
  const metTreffers = kandidaten.filter((k) => k.treffers > 0);
  const geldig = metTreffers.filter((k) => k.geldigheid !== 'N');
  const gedekt = new Set(geldig.flatMap((k) => k.codes));
  const uit = geldig.map((k) => k.set.id);
  for (const k of metTreffers.filter((k) => k.geldigheid === 'N')) {
    if (k.codes.every((c) => gedekt.has(c))) continue;
    uit.push(k.set.id);
    for (const c of k.codes) gedekt.add(c);
  }
  return uit;
}

function telTekst(n: number, enkel: string, meer: string): string {
  return `${n.toLocaleString('nl-BE')} ${n === 1 ? enkel : meer}`;
}

/**
 * Wat stap 3 zegt over de sets waarin de verwijzingen van het leerplan staan, uitgerekend uit wat er echt
 * aangevinkt staat (`gekozen`): niet wat Boosterz vooraf aanvinkte, want de leerkracht kan dat veranderd hebben.
 * "Je verwijzingen staan in 2 sets. De set die nu geldt, staat aangevinkt; de oude versie niet. Klopt dat? Klik dan op Volgende."
 */
export function beschrijfSetKeuze(kandidaten: readonly SetKandidaat[], gekozen: readonly string[]): string {
  const met = kandidaten.filter((k) => k.treffers > 0 && !k.mislukt);
  if (met.length === 0) return 'Geen enkele set bevat de verwijzingen uit je leerplan. Zoek hieronder de juiste set.';
  const aan = met.filter((k) => gekozen.includes(k.set.id));
  const af = met.filter((k) => !gekozen.includes(k.set.id));
  const intro = `Je verwijzingen staan in ${telTekst(met.length, 'set', 'sets')}.`;
  if (aan.length === 0) {
    const zin = met.length === 1 ? 'Die set staat niet aangevinkt.' : 'Geen enkele staat aangevinkt.';
    return `${intro} ${zin} Vink de juiste set aan, anders kan Boosterz je verwijzingen niet koppelen.`;
  }
  let midden: string;
  if (af.length === 0) {
    midden = met.length === 1 ? 'Die set staat aangevinkt.' : 'Ze staan allemaal aangevinkt.';
  } else if (af.every((k) => k.geldigheid === 'N') && aan.every((k) => k.geldigheid !== 'N')) {
    midden = aan.length === 1 && af.length === 1
      ? 'De set die nu geldt, staat aangevinkt; de oude versie niet.'
      : 'De sets die nu gelden, staan aangevinkt; de oude versies niet.';
  } else {
    midden = `${aan.length} van de ${met.length} ${aan.length === 1 ? 'staat' : 'staan'} aangevinkt.`;
  }
  return `${intro} ${midden} Klopt dat? Klik dan op Volgende.`;
}

export interface KoppelResultaat {
  goals: CurriculumGoal[];
  /** Per doel (op `id`) de verwijzingen die niet op één minimumdoel pasten. */
  problemen: Record<string, VerwijzingProbleem[]>;
  /** Aantal verwijzingen dat gekoppeld is. */
  gekoppeld: number;
  /** Aantal verwijzingen dat niet gekoppeld kon worden (onbekend of dubbelzinnig). */
  nietGekoppeld: number;
}

/**
 * Koppelt de verwijzingen uit de bron (`refsBron`) van elk doel aan de gekozen sets met
 * `losVerwijzingenOp`. Een doel zonder verwijzing in de bron blijft zoals het is. Met
 * `alleenZonderRefs` (een bestaand leerplan) blijven doelen die al verwijzingen hebben onaangeroerd:
 * wie er een verwijderde, krijgt ze niet terug.
 */
export function koppelDoelen(
  goals: readonly CurriculumGoal[],
  sets: readonly MinimumdoelenSetBestand[],
  opties: { alleenZonderRefs?: boolean } = {},
): KoppelResultaat {
  const problemen = leegRecord<VerwijzingProbleem[]>();
  let gekoppeld = 0;
  let nietGekoppeld = 0;
  const uit = goals.map((goal): CurriculumGoal => {
    if (opties.alleenZonderRefs && goal.refs && goal.refs.length > 0) {
      gekoppeld += goal.refs.length;
      return goal;
    }
    const codes = vindVerwijzingen(goal.refsBron ?? '');
    if (codes.length === 0) return goal;
    const { refs, problemen: open } = losVerwijzingenOp(codes, sets);
    gekoppeld += refs.length;
    nietGekoppeld += open.length;
    if (open.length > 0) problemen[goal.id] = open;
    const { refs: _oud, ...zonder } = goal;
    return refs.length > 0 ? { ...zonder, refs } : zonder;
  });
  return { goals: uit, problemen, gekoppeld, nietGekoppeld };
}

/** Het minimumdoel waar een verwijzing naar wijst, als de set geladen is. */
export function zoekMinimumdoel(sets: ReadonlyMap<string, MinimumdoelenSetBestand>, ref: MinimumdoelRef): Minimumdoel | undefined {
  return sets.get(ref.set)?.doelen.find((d) => d.id === ref.id);
}

// ── Stap 4: nakijken ────────────────────────────────────────────────────────

/** Eén doel aanpassen (alleen code en tekst: de lezer kan verkeerd knippen). */
export function pasDoelAan(goals: readonly CurriculumGoal[], id: string, patch: Partial<Pick<CurriculumGoal, 'code' | 'text'>>): CurriculumGoal[] {
  return goals.map((g) => (g.id === id ? { ...g, ...patch } : g));
}

export function verwijderDoel(goals: readonly CurriculumGoal[], id: string): CurriculumGoal[] {
  return goals.filter((g) => g.id !== id);
}

/** De verwijzingen van een doel vervangen. Een lege lijst haalt het veld weg. */
export function zetRefs(goals: readonly CurriculumGoal[], id: string, refs: readonly MinimumdoelRef[]): CurriculumGoal[] {
  return goals.map((g) => {
    if (g.id !== id) return g;
    const { refs: _oud, ...zonder } = g;
    return refs.length > 0 ? { ...zonder, refs: refs.map((r) => ({ ...r })) } : zonder;
  });
}

export function verwijderRef(goals: readonly CurriculumGoal[], id: string, index: number): CurriculumGoal[] {
  const doel = goals.find((g) => g.id === id);
  return zetRefs(goals, id, (doel?.refs ?? []).filter((_, i) => i !== index));
}

/**
 * Haalt de problemen weg die door deze verwijzingen opgelost zijn: een probleem met dezelfde (genormaliseerde)
 * code als een van de verwijzingen. Een lijst zonder problemen verdwijnt uit het overzicht.
 */
export function ruimProblemenOp(
  problemen: Readonly<Record<string, VerwijzingProbleem[]>>,
  goalId: string,
  refs: readonly MinimumdoelRef[],
): Record<string, VerwijzingProbleem[]> {
  const nu = opId(problemen, goalId);
  if (!nu) return kopieerRecord(problemen);
  const opgelost = new Set(refs.map((r) => normaliseerMdCode(r.code)));
  const rest = nu.filter((p) => !opgelost.has(normaliseerMdCode(p.code)));
  const uit = kopieerRecord(problemen, [goalId]);
  if (rest.length > 0) uit[goalId] = rest;
  return uit;
}

/** Eén verwijzing bij een doel zetten (niet twee keer dezelfde). */
export function voegRefToe(goals: readonly CurriculumGoal[], id: string, ref: MinimumdoelRef): CurriculumGoal[] {
  const bestaand = goals.find((g) => g.id === id)?.refs ?? [];
  if (bestaand.some((r) => r.set === ref.set && r.id === ref.id)) return [...goals];
  return zetRefs(goals, id, [...bestaand, ref]);
}

/** Kiest één kandidaat voor een dubbelzinnige verwijzing: de verwijzing erbij, het probleem weg. */
export function kiesKandidaat(
  goals: readonly CurriculumGoal[],
  problemen: Readonly<Record<string, VerwijzingProbleem[]>>,
  goalId: string,
  ref: MinimumdoelRef,
): { goals: CurriculumGoal[]; problemen: Record<string, VerwijzingProbleem[]> } {
  return { goals: voegRefToe(goals, goalId, ref), problemen: ruimProblemenOp(problemen, goalId, [ref]) };
}

/**
 * Wat de nakijkpoort niet ziet omdat het ontwerp eerst gesaneerd wordt (`sanitizeCurriculum`): een doel
 * zonder tekst valt weg, een dubbele code laat het tweede doel vallen en een doel zonder code krijgt
 * stil een nummer. Dat mag de leerkracht niet ontgaan, dus melden we het hier als fout (en bevestigen
 * kan dan niet).
 */
export function vindDoelProblemen(goals: readonly CurriculumGoal[]): Bevinding[] {
  const uit: Bevinding[] = [];
  const eerste = new Map<string, number>();
  goals.forEach((goal, i) => {
    const code = normalizeGoalCode(goal.code ?? '');
    const naam = code || `Doel ${i + 1}`;
    if (!(goal.text ?? '').trim()) {
      uit.push({ soort: 'volledig', ernst: 'fout', doelId: goal.id, code: goal.code, bericht: `${naam} heeft geen tekst. Vul de tekst in of verwijder het doel.` });
    }
    if (!code) {
      uit.push({ soort: 'volledig', ernst: 'fout', doelId: goal.id, bericht: `Doel ${i + 1} heeft geen code. Geef het een code of verwijder het doel.` });
      return;
    }
    const vorige = eerste.get(code);
    if (vorige === undefined) {
      eerste.set(code, i);
      return;
    }
    uit.push({
      soort: 'volledig',
      ernst: 'fout',
      doelId: goal.id,
      code: goal.code,
      bericht: `De code ${code} komt meer dan één keer voor (doel ${vorige + 1} en doel ${i + 1}). Elke code moet uniek zijn.`,
    });
  });
  return uit;
}

/**
 * Het niveau van het leerplan: uit graad en stroom, tenzij die nog dezelfde zijn als wat uit het bestaande
 * (vrije) niveau te lezen was. Dan blijft de tekst van de leerkracht staan, ook als ze meer zei dan graad en stroom.
 */
function niveauVoorOpslag(graad: string, stroom: string, bestaand: string): string {
  const nieuw = niveauTekst(graad, stroom);
  const oud = leesNiveau(bestaand);
  return niveauTekst(oud.graad, oud.stroom) === nieuw ? bestaand : nieuw || bestaand;
}

export interface OntwerpOpties {
  /** Het leerplan dat nagekeken wordt, bij een bestaand leerplan. */
  bestaand?: Curriculum;
  keuze: LeerplanKeuze;
  bron: Pick<BronGegevens, 'methode' | 'bronNaam' | 'bronSha256'>;
  goals: readonly CurriculumGoal[];
  setIds: readonly string[];
  /** Wanneer de bron ingelezen werd (ms). */
  ingelezenOp: number;
  /** Het id van een nieuw leerplan, zodat het niet bij elke aanpassing een ander wordt. */
  id?: string;
  /**
   * Studierichting van het leerplan (gesaneerd, zonder jaar: zie `doelgroepVoorLeerplan`). Zonder (geldige) doelgroep
   * blijft die van `bestaand`.
   */
  doelgroep?: Doelgroep;
}

/**
 * Het ontwerp-leerplan: nieuw met `createCurriculum` (soort 'leerplan', herkomst uit de bron), of het
 * bestaande leerplan met de aangepaste gegevens en doelen (zelfde id, `controle` blijft staan tot
 * bevestigd of gewijzigd). De studierichting is die van `o.doelgroep`, anders die van `bestaand`; ze telt
 * niet mee in de vingerafdruk. Nog niet gesaneerd: zie `saneerOntwerp`.
 */
export function bouwOntwerp(o: OntwerpOpties): Curriculum {
  const k = o.keuze;
  const bestaandNiveau = o.bestaand?.level ?? '';
  const herkomst: CurriculumHerkomst = {
    ...(o.bestaand?.herkomst ?? {}),
    methode: o.bron.methode,
    ingelezenOp: o.bestaand?.herkomst?.ingelezenOp ?? o.ingelezenOp,
  };
  const zet = (veld: 'leerplancode' | 'versie' | 'bronNaam' | 'bronSha256', waarde: string | undefined) => {
    const w = waarde?.trim();
    if (w) herkomst[veld] = w;
    else delete herkomst[veld];
  };
  zet('leerplancode', k.leerplancode);
  zet('versie', k.versie);
  zet('bronNaam', o.bron.bronNaam);
  zet('bronSha256', o.bron.bronSha256);

  const gegevens = {
    title: k.titel.trim(),
    net: k.net === '' ? 'eigen' : k.net,
    subject: k.vak.trim(),
    level: niveauVoorOpslag(k.graad, k.stroom, bestaandNiveau),
    herkomst,
    minimumdoelenSets: o.setIds.length > 0 ? [...o.setIds] : undefined,
    goals: o.goals.map((g) => ({ ...g })),
  };
  const doelgroep = doelgroepVoorLeerplan(o.doelgroep) ?? doelgroepVoorLeerplan(o.bestaand?.doelgroep);
  if (o.bestaand) {
    const uit: Curriculum = { ...o.bestaand, ...gegevens };
    // Nooit de ongesaneerde doelgroep van `bestaand` doorgeven (bv. uit de opslag, die niet saneert).
    if (doelgroep) uit.doelgroep = doelgroep;
    else delete uit.doelgroep;
    return uit;
  }
  return createCurriculum({
    ...gegevens, kind: 'leerplan', ...(doelgroep ? { doelgroep } : {}), ...(o.id ? { id: o.id } : {}),
    createdAt: o.ingelezenOp, updatedAt: o.ingelezenOp,
  });
}

/**
 * Saneert het ontwerp zoals een export en import dat doen (`sanitizeCurriculum`): zo is de
 * vingerafdruk die bij het bevestigen hoort, die van de doelen zoals ze terugkomen. `null` zonder
 * bruikbare doelen.
 */
export function saneerOntwerp(ontwerp: Curriculum): Curriculum | null {
  return sanitizeCurriculum(ontwerp);
}

/**
 * De doelen zoals "Bewaren zonder nakijken" ze bewaart als er doelproblemen zijn (`vindDoelProblemen`):
 * elk doel afzonderlijk gesaneerd, zonder er een te laten vallen om een dubbele code. De editor van de
 * leerplannenpagina waarschuwt daar zelf voor.
 */
export function bewaarbareDoelen(goals: readonly CurriculumGoal[]): CurriculumGoal[] {
  const uit: CurriculumGoal[] = [];
  for (const g of goals) {
    const doel = sanitizeGoal(g);
    if (doel) uit.push(doel);
  }
  return uit;
}

// ── Bevindingen en bevestigen ───────────────────────────────────────────────

export const ERNST_TITEL: Record<BevindingErnst, string> = {
  fout: 'Los dit eerst op',
  waarschuwing: 'Kijk dit na',
  info: 'Ter info',
};

const ERNST_VOLGORDE: readonly BevindingErnst[] = ['fout', 'waarschuwing', 'info'];

export interface BevindingGroep {
  ernst: BevindingErnst;
  titel: string;
  items: Bevinding[];
}

/** De bevindingen per ernst, in de volgorde "Los dit eerst op", "Kijk dit na", "Ter info"; lege groepen vallen weg. */
export function groepeerBevindingen(bevindingen: readonly Bevinding[]): BevindingGroep[] {
  return ERNST_VOLGORDE.map((ernst) => ({ ernst, titel: ERNST_TITEL[ernst], items: bevindingen.filter((b) => b.ernst === ernst) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Alle bevindingen: eerst de doelproblemen, dan die van de nakijkpoort, gesorteerd op ernst. */
export function alleBevindingen(rapport: ControleRapport | undefined, doelProblemen: readonly Bevinding[]): Bevinding[] {
  return [...doelProblemen, ...(rapport?.bevindingen ?? [])];
}

/**
 * De bevinding dat het leerplan geen leerplancode heeft (alleen een tip: ernst 'info', soort 'herkomst'). Stap 4
 * zet er een knop "Naar stap 1" bij, want daar vul je de code in.
 */
export function isLeerplancodeBevinding(b: Bevinding): boolean {
  return b.soort === 'herkomst' && b.ernst === 'info';
}

export function aantalFouten(bevindingen: readonly Bevinding[]): number {
  return bevindingen.filter((b) => b.ernst === 'fout').length;
}

/** "Los eerst 2 punten op (zie ‘Los dit eerst op’)." Zo heet de groep met die punten in het overzicht. */
export function puntenTekst(n: number): string {
  return `Los eerst ${n} ${n === 1 ? 'punt' : 'punten'} op (zie ‘${ERNST_TITEL.fout}’).`;
}

export interface BevestigStand {
  /** Er is een ontwerp met minstens één doel. */
  heeftOntwerp: boolean;
  /** Er is een bron (pdf of tekst) om mee te vergelijken. */
  heeftBron: boolean;
  /** De nakijkpoort heeft het ontwerp zoals het nu is nagekeken (niet een eerdere versie). */
  rapportFris: boolean;
  /** Aantal fouten (poort en doelproblemen samen). */
  fouten: number;
  naam: string;
  /** "Ik heb elk doel met de bron vergeleken." */
  vergeleken: boolean;
}

/**
 * Waarom "Bevestigen als nagekeken" nog niet kan, in gewone taal en in de volgorde waarin de
 * leerkracht ze oplost. Leeg = bevestigen kan. Een niet volledig gelezen bron komt als fout van de
 * poort mee in `fouten`.
 */
export function redenenGeenBevestiging(s: BevestigStand): string[] {
  const uit: string[] = [];
  if (!s.heeftOntwerp) {
    uit.push('Er zijn geen doelen om na te kijken.');
    return uit;
  }
  if (!s.heeftBron) uit.push('Er is geen bron om de doelen mee te vergelijken. Lees het leerplan eerst in (stap 2).');
  if (!s.rapportFris) uit.push('Het nakijken loopt nog. Wacht even tot de samenvatting klaar is.');
  else if (s.fouten > 0) uit.push(puntenTekst(s.fouten));
  if (!s.naam.trim()) uit.push('Vul je naam in.');
  if (!s.vergeleken) uit.push('Vink aan dat je elk doel met de bron hebt vergeleken.');
  return uit;
}

// ── De naam van de nakijker onthouden ───────────────────────────────────────

export const NAKIJKER_NAAM_SLEUTEL = 'wf.nakijker.naam';

/** De naam die de leerkracht vorige keer invulde; leeg als er niets bewaard is of localStorage niet werkt. */
export function leesNakijkerNaam(): string {
  try {
    return localStorage.getItem(NAKIJKER_NAAM_SLEUTEL) ?? '';
  } catch {
    return '';
  }
}

/** Onthoudt de naam op dit toestel. Mislukt het, dan merkt niemand er iets van: de naam moet dan opnieuw ingevuld. */
export function bewaarNakijkerNaam(naam: string): void {
  try {
    localStorage.setItem(NAKIJKER_NAAM_SLEUTEL, naam.trim());
  } catch {
    // genegeerd: het is een gemak, geen gegeven
  }
}
