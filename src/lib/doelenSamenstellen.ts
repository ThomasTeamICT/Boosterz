// Een eigen doelenlijst samenstellen uit de officiële minimumdoelen (docs/LEERPLANNEN.md § 10).
//
// De leerkracht kiest hele sets en/of losse doelen uit één of meer sets, bv. basisgeletterdheid in de 1ste graad
// A-stroom (de sets Nederlands, STEM en digitale competenties), of alleen de doelen over natuurwetenschappen uit de
// STEM-set. De doelen blijven letterlijk zoals in de bron en houden hun verwijzing (set + vast nummer). Omdat elk doel
// tegen zijn set nagekeken kan worden, krijgt de lijst meteen de status "nagekeken", door de officiële bron, net als
// "Gebruik als leerplan" voor één hele set (`leerplanUitSet` in minimumdoelenLeerplan.ts).
//
// Wat altijd geldt voor een lijst die als nagekeken terugkomt (`bevestigd`):
// - ze bevat precies de gekozen doelen met tekst en vast nummer, niets meer en niets minder (ook niet na het saneren);
// - elk doel is één officieel minimumdoel, met de tekst letterlijk zoals in de set (de controlepoort kijkt dat na);
// - geen minimumdoel staat er twee keer in, en elke verwijzing wijst naar een set uit `minimumdoelenSets`;
// - de codes zijn uniek (ook na `normalizeGoalCode`) en hoogstens `MAX_DOELCODE` tekens lang;
// - opnieuw samenstellen met dezelfde selectie (`selectieVanLeerplan`) geeft dezelfde doelen en dus dezelfde
//   vingerafdruk.
//
// Puur, op `Date.now()` en `uid()` na: bewaren doet de aanroeper met `saveCurriculum`.

import type { Curriculum, CurriculumGoal, CurriculumHerkomst } from './curriculumTypes';
import {
  MAX_DOELCODE, MAX_DOELEN, MAX_DOELTHEMA, MAX_SETS, bevestigLeerplan, createCurriculum, normalizeGoalCode, sanitizeCurriculum,
} from './curriculum';
import { controleerLeerplan, type ControleRapport } from './curriculumCheck';
import { htmlNaarTekst, NAAMSVERMELDING, type Minimumdoel, type MinimumdoelenSetBestand, type MinimumdoelenSetKop } from './minimumdoelen';
import { contextVanSet, datumLeesbaar, zonderAccenten } from './minimumdoelenBron';
import { NAGEKEKEN_DOOR_BRON, isOptioneel, themaVanDoel, uniekeCodes } from './minimumdoelenLeerplan';
import { geldigheidVanBestand } from './setKeuze';
import { uid } from './utils';

// ── API ─────────────────────────────────────────────────────────────────────

export interface SetKeuze {
  bestand: MinimumdoelenSetBestand;
  /** 'alle' = de hele set; anders de vaste nummers (`id`, de @id uit de API) van de gekozen doelen. */
  doelen: 'alle' | readonly string[];
}

export interface SamenstelOpties {
  /** Getrimd; leeg → `voorstelTitel(...)`. */
  titel: string;
  /** Komt in `subject`. */
  vak?: string;
  /**
   * Opnieuw samenstellen van een bewaarde lijst: zelfde id en createdAt, nieuwe updatedAt. Een doel dat er al in stond,
   * houdt zijn code; een code van een ander (ook een weggelaten) minimumdoel gaat nooit naar een nieuw doel (zie
   * `kenCodesToe`). Moet zelf een samengestelde lijst zijn (herkomst "samengesteld"), anders gooit
   * `leerplanUitSelectie` een `Error`: zo kan een ander leerplan nooit per vergissing overschreven worden.
   */
  bestaand?: Curriculum;
  /** Ids van sets die een oude versie zijn (`oudeVersieIds`): geeft een waarschuwing. */
  oudeVersies?: ReadonlySet<string>;
}

export interface Samengesteld {
  /** Gesaneerd; nagekeken als `bevestigd`. Zonder gekozen doelen: `goals` leeg (en niet gesaneerd: dat kan niet zonder doelen). */
  leerplan: Curriculum;
  rapport: ControleRapport;
  bevestigd: boolean;
  /** In gewone taal: overgeslagen doelen (zonder vast nummer of tekst), gekozen doelen die niet (meer) in de set staan, oude versies. */
  waarschuwingen: string[];
}

export interface SamengesteldBevestigd {
  /** Gesaneerd; met status "gecontroleerd" als `bevestigd`, anders zonder nakijkstatus. */
  leerplan: Curriculum;
  rapport: ControleRapport;
  bevestigd: boolean;
}

// ── Hulp ────────────────────────────────────────────────────────────────────

function doelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Tekst inkorten tot `max` tekens zonder een tekenpaar doormidden te knippen, met "…" als er iets wegviel. */
function inkorten(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, max - 1);
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return `${uit.trimEnd()}…`;
}

/** Tekst inkorten tot `max` tekens zonder "…" (voor codes), zonder een tekenpaar doormidden te knippen. */
function kap(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, Math.max(0, max));
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return uit.trim();
}

function korteNaam(set: { naam: string; korteNaam?: string }): string {
  return (typeof set.korteNaam === 'string' ? set.korteNaam.trim() : '') || (typeof set.naam === 'string' ? set.naam.trim() : '');
}

function tekstOfLeeg(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** "1ste graad A-stroom", "2de graad", of leeg. */
function niveauVan(set: { graad?: string; stroom?: string }): string {
  return [tekstOfLeeg(set.graad), tekstOfLeeg(set.stroom)].filter(Boolean).join(' ');
}

/** Graad en stroom als alle sets ze delen; anders alleen wat ze delen (of leeg). */
function gedeeldNiveau(sets: readonly { graad?: string; stroom?: string }[]): string {
  if (sets.length === 0) return '';
  const graden = new Set(sets.map((s) => tekstOfLeeg(s.graad)));
  const stromen = new Set(sets.map((s) => tekstOfLeeg(s.stroom)));
  return [graden.size === 1 ? [...graden][0] : '', stromen.size === 1 ? [...stromen][0] : ''].filter(Boolean).join(' ');
}

/** "Nederlands (ODS_3343)": hoe een set in een waarschuwing heet. */
function setInBericht(set: MinimumdoelenSetKop): string {
  return `${korteNaam(set) || 'Set'} (${set.id})`;
}

function isBruikbaarBestand(b: unknown): b is MinimumdoelenSetBestand {
  if (!isObject(b) || !isObject(b.set) || !Array.isArray(b.doelen)) return false;
  return typeof b.set.id === 'string' && b.set.id.trim() !== '';
}

// ── De selectie lezen ───────────────────────────────────────────────────────

/** De keuzes per set: een set die twee keer gekozen is, telt één keer (op de plaats van de eerste keer, met het eerste bestand). */
interface Keuze {
  bestand: MinimumdoelenSetBestand;
  alle: boolean;
  ids: Set<string>;
}

function voegKeuzesSamen(keuzes: readonly SetKeuze[]): Keuze[] {
  const perSet = new Map<string, Keuze>();
  for (const keuze of Array.isArray(keuzes) ? keuzes : []) {
    if (!isObject(keuze) || !isBruikbaarBestand(keuze.bestand)) continue;
    const id = keuze.bestand.set.id;
    let k = perSet.get(id);
    if (!k) {
      k = { bestand: keuze.bestand, alle: false, ids: new Set() };
      perSet.set(id, k);
    }
    if (keuze.doelen === 'alle') k.alle = true;
    else if (Array.isArray(keuze.doelen)) {
      for (const d of keuze.doelen as readonly unknown[]) {
        const t = tekstOfLeeg(d);
        if (t !== '') k.ids.add(t);
      }
    }
  }
  return [...perSet.values()];
}

interface GekozenDoel {
  doel: Minimumdoel;
  /** Vast nummer, getrimd. */
  id: string;
  /** `htmlNaarTekst` van de doeltekst. */
  tekst: string;
  /** De code zoals in "Gebruik als leerplan" (`uniekeCodes` over de hele set). */
  code: string;
}

/**
 * De gekozen doelen van één set, in de volgorde van de set. Bruikbaar zijn doelen met een vast nummer en een tekst,
 * precies zoals in `leerplanUitSet`; de codes worden over al die doelen berekend, zodat een code dezelfde is als in
 * "Gebruik als leerplan".
 */
function kiesUitSet(keuze: Keuze): { doelen: GekozenDoel[]; waarschuwingen: string[] } {
  const { bestand, alle, ids } = keuze;
  const naam = setInBericht(bestand.set);
  const bruikbaar: { doel: Minimumdoel; id: string; tekst: string }[] = [];
  let zonderId = 0;
  const zonderTekst: string[] = [];
  for (const doel of bestand.doelen) {
    if (!isObject(doel)) {
      zonderId++;
      continue;
    }
    const id = tekstOfLeeg(doel.id);
    if (id === '') {
      zonderId++;
      continue;
    }
    const tekst = typeof doel.tekst === 'string' ? htmlNaarTekst(doel.tekst) : '';
    if (tekst === '') zonderTekst.push(id);
    else bruikbaar.push({ doel, id, tekst });
  }
  const codes = uniekeCodes(bruikbaar.map((b) => b.doel));
  const alleDoelen = bruikbaar.map((b, i) => ({ ...b, code: codes[i] }));

  const waarschuwingen: string[] = [];
  const overgeslagen = (n: number, waarom: string) => {
    if (n > 0) waarschuwingen.push(`${naam}: ${doelen(n)} ${waarom} ${n === 1 ? 'is' : 'zijn'} overgeslagen.`);
  };
  if (alle) {
    overgeslagen(zonderId, 'zonder vast nummer');
    overgeslagen(zonderTekst.length, 'zonder tekst');
    return { doelen: alleDoelen, waarschuwingen };
  }

  const gekozen = alleDoelen.filter((d) => ids.has(d.id));
  const metTekst = new Set(alleDoelen.map((d) => d.id));
  const zonderTekstSet = new Set(zonderTekst);
  overgeslagen([...ids].filter((id) => zonderTekstSet.has(id)).length, 'zonder tekst');
  const weg = [...ids].filter((id) => !metTekst.has(id) && !zonderTekstSet.has(id)).length;
  if (weg > 0) {
    waarschuwingen.push(`${naam}: ${weg === 1 ? '1 gekozen doel staat' : `${weg} gekozen doelen staan`} niet (meer) in de set en ${weg === 1 ? 'is' : 'zijn'} weggelaten.`);
  }
  return { doelen: gekozen, waarschuwingen };
}

// ── Rubrieken en codes ──────────────────────────────────────────────────────

/** Hoe lang de naam van een set in een rubriek hoogstens is: de rubriek van het doel moet er nog bij passen. */
const MAX_SETLABEL = 200;

/**
 * Per gekozen set de naam waaronder zijn doelen gegroepeerd staan: de korte naam; met de context van de set
 * (`contextVanSet`) als twee gekozen sets dezelfde korte naam hebben en de context ze onderscheidt; met graad en
 * stroom als die niet voor alle gekozen sets dezelfde zijn (anders staan ze in `level`); en het set-id als twee namen
 * dan nog gelijk zijn (bv. twee versies van dezelfde set).
 */
function setLabels(koppen: readonly MinimumdoelenSetKop[]): string[] {
  const basis = koppen.map((k) => korteNaam(k) || k.id);
  const sleutel = (t: string) => zonderAccenten(t).replace(/\s+/g, ' ').trim();
  const niveauVerschilt = new Set(koppen.map(niveauVan)).size > 1;
  const labels = koppen.map((k, i) => {
    const delen = [basis[i]];
    const groep = koppen.filter((_, j) => sleutel(basis[j]) === sleutel(basis[i]));
    if (groep.length > 1 && new Set(groep.map((g) => contextVanSet(g.naam ?? ''))).size > 1) {
      const context = contextVanSet(k.naam ?? '');
      if (context) delen.push(context);
    }
    if (niveauVerschilt) {
      const niveau = niveauVan(k);
      if (niveau) delen.push(niveau);
    }
    return delen.join(' · ');
  });
  const telling = new Map<string, number>();
  for (const l of labels) telling.set(sleutel(l), (telling.get(sleutel(l)) ?? 0) + 1);
  return labels.map((l, i) => inkorten((telling.get(sleutel(l)) ?? 0) > 1 ? `${l} (${koppen[i].id})` : l, MAX_SETLABEL));
}

/** De rubriek van een doel in de lijst: de naam van de set, gevolgd door de rubriek van het doel, binnen `MAX_DOELTHEMA`. */
function themaMet(setLabel: string, rubriek: string | undefined): string {
  return inkorten(rubriek ? `${setLabel} › ${rubriek}` : setLabel, MAX_DOELTHEMA);
}

/** "A-stroom" → "A"; een andere stroom blijft zoals ze is. */
function stroomKort(stroom: string | undefined): string {
  const s = tekstOfLeeg(stroom);
  const m = /^([a-z])-stroom$/i.exec(s);
  return m ? m[1].toUpperCase() : s;
}

/**
 * Wat sets met dezelfde code van elkaar onderscheidt, in deze volgorde: de stroom ("A", "B"), de graad, graad en
 * stroom samen, en anders het set-id. Het eerste dat voor elke set van de groep ingevuld en verschillend is.
 */
function onderscheidVoor(groep: readonly MinimumdoelenSetKop[]): string[] {
  const kandidaten: ((k: MinimumdoelenSetKop) => string)[] = [
    (k) => stroomKort(k.stroom),
    (k) => tekstOfLeeg(k.graad),
    (k) => [tekstOfLeeg(k.graad), stroomKort(k.stroom)].filter(Boolean).join(' '),
  ];
  for (const kandidaat of kandidaten) {
    const waarden = groep.map((k) => normalizeGoalCode(kandidaat(k)));
    if (waarden.every((w) => w !== '') && new Set(waarden).size === waarden.length) return waarden;
  }
  return groep.map((k) => normalizeGoalCode(k.id));
}

/** "BG02.01" + "A" → "BG02.01 (A)", ingekort zodat het onderscheid er altijd bij past (hoogstens `MAX_DOELCODE`). */
function metOnderscheid(code: string, onderscheid: string): string {
  const staart = ` (${kap(onderscheid, 30)})`;
  return normalizeGoalCode(`${kap(code, MAX_DOELCODE - staart.length)}${staart}`);
}

function refSleutel(set: string, id: string): string {
  return `${set}\u0000${id}`;
}

/**
 * Wat een bewaarde lijst al vastlegde (bij opnieuw samenstellen). `vast`: per minimumdoel (set + vast nummer) zijn
 * code van toen. `gereserveerd`: elke code die toen al bestond; die gaat nooit naar een ander minimumdoel, ook niet als
 * het oude doel weggelaten is, zodat een koppeling in een cursus nooit stil naar een ander doel wijst. Een code die
 * toen meer dan eens voorkwam (een gewijzigd bestand), hoort bij het eerste doel met die code: daar wees een koppeling
 * ook naar (`findGoalByCode`). Een code van meer dan `MAX_DOELCODE` tekens blijft niet, maar is wel gereserveerd.
 */
function codesVanBestaand(bestaand: Curriculum | undefined): { vast: Map<string, string>; gereserveerd: Set<string> } {
  const vast = new Map<string, string>();
  const eigenaar = new Map<string, string>();
  for (const goal of Array.isArray(bestaand?.goals) ? bestaand.goals : []) {
    if (!isObject(goal) || typeof goal.code !== 'string') continue;
    const code = normalizeGoalCode(goal.code);
    if (code === '') continue;
    const ref = (Array.isArray(goal.refs) ? goal.refs : []).find((r) => isObject(r) && tekstOfLeeg(r.set) !== '' && tekstOfLeeg(r.id) !== '');
    const sleutel = ref ? refSleutel(tekstOfLeeg(ref.set), tekstOfLeeg(ref.id)) : '';
    if (!eigenaar.has(code)) eigenaar.set(code, sleutel);
    if (sleutel !== '' && eigenaar.get(code) === sleutel && code.length <= MAX_DOELCODE && !vast.has(sleutel)) vast.set(sleutel, code);
  }
  return { vast, gereserveerd: new Set(eigenaar.keys()) };
}

interface CodeInvoer {
  setIndex: number;
  /** Set + vast nummer van het minimumdoel (`refSleutel`). */
  sleutel: string;
  /** De code zoals in "Gebruik als leerplan". */
  code: string;
}

/**
 * De codes van de lijst.
 * - Opnieuw samenstellen (`bestaand`): een doel dat al in de lijst stond, houdt zijn code van toen (`codesVanBestaand`).
 *   Zo veranderen bestaande codes niet als je een set toevoegt of weglaat.
 * - Een ander doel krijgt binnen zijn set de code van "Gebruik als leerplan" (`uniekeCodes`). Komt die code (na
 *   `normalizeGoalCode`) in meer dan één gekozen set voor, dan krijgt ze een onderscheid erbij (`onderscheidVoor`), bv.
 *   "BG02.01 (A)" en "BG02.01 (B)"; zonder `bestaand` in elk van die sets, zodat de code niet afhangt van de volgorde
 *   van de sets. Hoorde de code in `bestaand` bij een ander minimumdoel, dan krijgt ze ook een onderscheid (de stroom,
 *   de graad, graad en stroom, of het set-id van de eigen set).
 * - Elke code is hoogstens `MAX_DOELCODE` tekens; wat dan nog dubbel of gereserveerd is, krijgt "-2", "-3", … (nooit
 *   de code van een ander doel, en nooit een gereserveerde code).
 */
function kenCodesToe(lijst: readonly CodeInvoer[], koppen: readonly MinimumdoelenSetKop[], bestaand?: Curriculum): string[] {
  const { vast, gereserveerd } = codesVanBestaand(bestaand);
  const lokaal = lijst.map((d) => normalizeGoalCode(d.code));
  const setsMetCode = new Map<string, Set<number>>();
  lokaal.forEach((c, i) => {
    const sets = setsMetCode.get(c) ?? new Set<number>();
    sets.add(lijst[i].setIndex);
    setsMetCode.set(c, sets);
  });
  const onderscheidPerGroep = new Map<string, Map<number, string>>();
  const kandidaten = lokaal.map((c, i): { code: string; vast: boolean } => {
    const oud = vast.get(lijst[i].sleutel);
    if (oud !== undefined) return { code: oud, vast: true };
    const sets = setsMetCode.get(c);
    if (!sets || sets.size < 2) {
      const gewoon = normalizeGoalCode(kap(c, MAX_DOELCODE));
      if (!gereserveerd.has(gewoon)) return { code: gewoon, vast: false };
      // De code hoorde bij een ander minimumdoel: het onderscheid van de eigen set erbij.
      return { code: metOnderscheid(c, onderscheidVoor([koppen[lijst[i].setIndex]])[0]), vast: false };
    }
    const volgorde = [...sets].sort((a, b) => a - b);
    const groepSleutel = volgorde.join(',');
    let perSet = onderscheidPerGroep.get(groepSleutel);
    if (!perSet) {
      const waarden = onderscheidVoor(volgorde.map((s) => koppen[s]));
      perSet = new Map(volgorde.map((s, j) => [s, waarden[j]]));
      onderscheidPerGroep.set(groepSleutel, perSet);
    }
    return { code: metOnderscheid(c, perSet.get(lijst[i].setIndex) ?? ''), vast: false };
  });

  // Vaste codes eerst: ze zijn uniek (elke code één eigenaar, elk minimumdoel één code) en een ander doel neemt ze nooit in.
  const gebruikt = new Set(kandidaten.filter((k) => k.vast).map((k) => k.code));
  const bezet = new Set([...kandidaten.map((k) => k.code), ...gereserveerd]);
  return kandidaten.map(({ code, vast: isVast }) => {
    if (isVast) return code;
    if (!gebruikt.has(code) && !gereserveerd.has(code)) {
      gebruikt.add(code);
      return code;
    }
    for (let n = 2; ; n++) {
      const staart = `-${n}`;
      const uniek = normalizeGoalCode(`${kap(code, MAX_DOELCODE - staart.length)}${staart}`);
      if (!gebruikt.has(uniek) && !bezet.has(uniek)) {
        gebruikt.add(uniek);
        return uniek;
      }
    }
  });
}

// ── Kop van de lijst ────────────────────────────────────────────────────────

/** Hoe lang de opsomming van de sets in `source` hoogstens is. */
const MAX_BRONLIJST = 1000;

/**
 * "Samengesteld uit de officiële minimumdoelen: Nederlands (ODS_3343), …. Bron: … (opgehaald 5 oktober 2026)". Bij
 * heel veel sets worden de laatste samengevat ("en 12 andere sets").
 */
function bronTekst(koppen: readonly MinimumdoelenSetKop[]): string {
  const namen = koppen.map((k) => `${korteNaam(k) || 'Set'} (${k.id})`);
  let lijst = namen.join(', ');
  if (lijst.length > MAX_BRONLIJST) {
    let n = namen.length;
    const metRest = (aantal: number) => {
      const rest = namen.length - aantal;
      return `${namen.slice(0, aantal).join(', ')} en ${rest} andere ${rest === 1 ? 'set' : 'sets'}`;
    };
    while (n > 1 && metRest(n - 1).length > MAX_BRONLIJST) n--;
    lijst = inkorten(metRest(Math.max(1, n - 1)), MAX_BRONLIJST);
  }
  const naamsvermelding = koppen.map((k) => tekstOfLeeg(k.naamsvermelding)).find(Boolean) || NAAMSVERMELDING;
  const datums = [...new Set(koppen.map((k) => tekstOfLeeg(k.opgehaald)).filter(Boolean))].sort();
  const eerste = datums.length > 0 ? datumLeesbaar(datums[0]) : '';
  const laatste = datums.length > 0 ? datumLeesbaar(datums[datums.length - 1]) : '';
  const opgehaald = eerste === '' ? '' : eerste === laatste ? ` (opgehaald ${eerste})` : ` (opgehaald tussen ${eerste} en ${laatste})`;
  return `Samengesteld uit de officiële minimumdoelen: ${lijst}. ${naamsvermelding}${opgehaald}`;
}

/**
 * Een titel als voorstel, bv. "Basisgeletterdheid · 1ste graad A-stroom" of "Eigen selectie minimumdoelen · 1ste graad
 * A-stroom". Hebben alle sets dezelfde korte naam (één set, of dezelfde set in twee stromen): "<korte naam> (eigen
 * selectie)", of "Basisgeletterdheid <korte naam>". Graad en stroom staan erachter voor zover alle sets ze delen.
 */
export function voorstelTitel(sets: readonly { naam: string; korteNaam?: string; graad?: string; stroom?: string }[]): string {
  const lijst = (Array.isArray(sets) ? sets : []).filter((s) => typeof s === 'object' && s !== null);
  const basisgeletterdheid = lijst.length > 0 && lijst.every((s) => zonderAccenten(tekstOfLeeg(s.naam)).includes('basisgeletterdheid'));
  // Eén naam als alle sets dezelfde korte naam hebben (bv. Nederlands in de A- en de B-stroom).
  const namen = new Set(lijst.map((s) => korteNaam(s)));
  const enigeNaam = namen.size === 1 ? [...namen][0] : '';
  let naam: string;
  if (basisgeletterdheid) naam = enigeNaam ? `Basisgeletterdheid ${enigeNaam}` : 'Basisgeletterdheid';
  else if (enigeNaam) naam = `${enigeNaam} (eigen selectie)`;
  else naam = 'Eigen selectie minimumdoelen';
  const niveau = gedeeldNiveau(lijst);
  return niveau ? `${naam} · ${niveau}` : naam;
}

/** Hoeveel doelen een selectie telt (met 'alle' = alle doelen met vast nummer en tekst). Zoveel doelen krijgt de lijst. */
export function telSelectie(keuzes: readonly SetKeuze[]): number {
  return voegKeuzesSamen(keuzes).reduce((som, k) => som + kiesUitSet(k).doelen.length, 0);
}

// ── Bevestigen ──────────────────────────────────────────────────────────────

/**
 * Bevestigt een samengestelde lijst (herkomst "samengesteld"), het tegenstuk van `bevestigUitOfficieleSet`: saneert
 * ze, haalt de nakijkstatus weg, draait de controlepoort met de sets als bron (elke tekst gelijk aan die van zijn
 * minimumdoel, elk minimumdoel één keer, elke verwijzing naar een set van de lijst) en bevestigt ze alleen als de poort
 * geen fouten vindt. Van `bestanden` tellen alleen de sets uit `minimumdoelenSets` van de lijst (elk één keer): een
 * set die er niet bij hoort, kan niets goedkeuren. Zonder (of met een lege) `door` is de nakijker `NAGEKEKEN_DOOR_BRON`.
 * Gooit een `Error` als de herkomst niet "samengesteld" is.
 */
export function bevestigSamengesteld(
  cur: Curriculum,
  bestanden: readonly MinimumdoelenSetBestand[],
  opts: { door?: string; samenvatting?: string; op?: number } = {},
): SamengesteldBevestigd {
  if (cur?.herkomst?.methode !== 'samengesteld') {
    throw new Error('Alleen een lijst die uit de officiële minimumdoelen samengesteld is, kan zo bevestigd worden.');
  }
  const gesaneerd = sanitizeCurriculum(cur);
  const zonderStatus: Curriculum = { ...(gesaneerd ?? cur) };
  delete zonderStatus.controle;
  const vanLijst = new Set(zonderStatus.minimumdoelenSets ?? []);
  const sets: MinimumdoelenSetBestand[] = [];
  for (const b of Array.isArray(bestanden) ? bestanden : []) {
    if (isBruikbaarBestand(b) && vanLijst.has(b.set.id) && !sets.some((s) => s.set.id === b.set.id)) sets.push(b);
  }
  const rapport = controleerLeerplan(zonderStatus, { sets });
  if (!gesaneerd || !rapport.kanBevestigen) return { leerplan: zonderStatus, rapport, bevestigd: false };
  const door = tekstOfLeeg(opts?.door) || NAGEKEKEN_DOOR_BRON;
  const leerplan = bevestigLeerplan(zonderStatus, { door, rapport, samenvatting: opts?.samenvatting, op: opts?.op });
  return { leerplan, rapport, bevestigd: true };
}

// ── Samenstellen ────────────────────────────────────────────────────────────

function refSleutels(goals: readonly CurriculumGoal[]): string[] {
  return goals.map((g) => (g.refs ?? []).map((r) => refSleutel(r.set, r.id)).join('\u0001'));
}

/**
 * Stelt een doelenlijst samen uit de gekozen sets en doelen, en bevestigt ze als nagekeken met de officiële sets als
 * bron (`bevestigSamengesteld`, door `NAGEKEKEN_DOOR_BRON`).
 *
 * - Volgorde: de sets in de volgorde van `keuzes`, de doelen in de volgorde van de set (niet die van de selectie). Een
 *   set zonder gekozen doelen valt weg; een set die twee keer gekozen is, telt één keer (de keuzes samen).
 * - Per doel zoals "Gebruik als leerplan": de tekst via `htmlNaarTekst`, een verwijzing naar zichzelf (set + vast
 *   nummer + code), "Optioneel" als toelichting bij een optioneel doel. Een doel zonder vast nummer of tekst wordt
 *   overgeslagen, met een waarschuwing.
 * - `theme`: de naam van de set (zie `setLabels`), gevolgd door " › " en de rubriek van het doel.
 * - `code`: zie `kenCodesToe`; bij `bestaand` houdt een doel dat er al in stond zijn code.
 * - Meer dan `MAX_SETS` sets of `MAX_DOELEN` doelen, of helemaal geen doel: geen doelen, niet bevestigd, met een
 *   waarschuwing. Valt bij het saneren toch een doel weg, dan wordt de lijst niet bevestigd: een nagekeken lijst
 *   bevat altijd precies wat gekozen is.
 */
export function leerplanUitSelectie(keuzes: readonly SetKeuze[], opties: SamenstelOpties): Samengesteld {
  const bestaand = opties?.bestaand;
  if (bestaand && bestaand.herkomst?.methode !== 'samengesteld') {
    throw new Error('Alleen een lijst die uit de officiële minimumdoelen samengesteld is, kan opnieuw samengesteld worden.');
  }
  const waarschuwingen: string[] = [];
  const gekozenSets: { bestand: MinimumdoelenSetBestand; doelen: GekozenDoel[] }[] = [];
  for (const keuze of voegKeuzesSamen(keuzes)) {
    const r = kiesUitSet(keuze);
    waarschuwingen.push(...r.waarschuwingen);
    if (r.doelen.length > 0) gekozenSets.push({ bestand: keuze.bestand, doelen: r.doelen });
  }
  for (const { bestand } of gekozenSets) {
    if (geldigheidVanBestand(bestand) === 'N') {
      waarschuwingen.push(`${setInBericht(bestand.set)} geldt niet meer. Gebruik liever de minimumdoelen die nu gelden.`);
    } else if (opties?.oudeVersies?.has(bestand.set.id)) {
      waarschuwingen.push(`${setInBericht(bestand.set)} is een oudere versie. Gebruik liever de versie die nu geldt.`);
    }
  }

  const koppen = gekozenSets.map((g) => g.bestand.set);
  const bestanden = gekozenSets.map((g) => g.bestand);
  const totaal = gekozenSets.reduce((som, g) => som + g.doelen.length, 0);
  const titel = tekstOfLeeg(opties?.titel) || voorstelTitel(koppen);
  const nu = Date.now();
  const herkomst: CurriculumHerkomst = { methode: 'samengesteld', ingelezenOp: nu };
  const kop = {
    title: titel,
    net: 'minimumdoelen' as const,
    subject: tekstOfLeeg(opties?.vak),
    level: gedeeldNiveau(koppen),
    kind: 'leerplan' as const,
    source: bronTekst(koppen),
    herkomst,
    minimumdoelenSets: koppen.map((k) => k.id),
    ...(bestaand ? { id: bestaand.id, createdAt: bestaand.createdAt } : {}),
    updatedAt: nu,
  };

  const zonderDoelen = (waarom: string): Samengesteld => {
    waarschuwingen.push(waarom);
    const leeg = createCurriculum({ ...kop, goals: [] });
    return { leerplan: leeg, rapport: controleerLeerplan(leeg, { sets: bestanden }), bevestigd: false, waarschuwingen };
  };
  if (totaal === 0) return zonderDoelen('Kies minstens één doel.');
  if (gekozenSets.length > MAX_SETS) {
    return zonderDoelen(`Je koos doelen uit ${gekozenSets.length} sets. Eén lijst kan doelen uit hoogstens ${MAX_SETS} sets bevatten: kies minder sets.`);
  }
  if (totaal > MAX_DOELEN) {
    return zonderDoelen(`Je koos ${totaal} doelen. Eén lijst kan hoogstens ${MAX_DOELEN} doelen bevatten: kies minder doelen.`);
  }

  const labels = setLabels(koppen);
  const plat = gekozenSets.flatMap((g, setIndex) => g.doelen.map((d) => ({ setIndex, d })));
  const codes = kenCodesToe(plat.map(({ setIndex, d }) => ({ setIndex, sleutel: refSleutel(koppen[setIndex].id, d.id), code: d.code })), koppen, bestaand);
  const goals: CurriculumGoal[] = plat.map(({ setIndex, d }, i) => {
    const goal: CurriculumGoal = {
      id: uid(),
      code: codes[i],
      text: d.tekst,
      theme: themaMet(labels[setIndex], themaVanDoel(d.doel)),
      refs: [{ set: koppen[setIndex].id, id: d.id, code: typeof d.doel.code === 'string' ? d.doel.code : String(d.doel.code ?? '') }],
    };
    if (isOptioneel(d.doel)) goal.note = 'Optioneel';
    return goal;
  });

  // Eerst saneren zoals bewaren en importeren dat doen, dan pas nakijken: zo is de vingerafdruk die van de doelen zoals
  // ze na exporteren en importeren terugkomen. Een selectie mag onvolledig zijn, dus de poort ziet een doel dat bij het
  // saneren wegvalt niet: daarom hier nagaan dat precies de gekozen doelen overblijven.
  const ruw = createCurriculum({ ...kop, goals });
  const gesaneerd = sanitizeCurriculum(ruw);
  const sleutelsVoor = refSleutels(goals);
  const sleutelsNa = gesaneerd ? refSleutels(gesaneerd.goals) : [];
  if (!gesaneerd || sleutelsNa.length !== sleutelsVoor.length || sleutelsNa.some((s, i) => s !== sleutelsVoor[i])
    || (gesaneerd.minimumdoelenSets ?? []).join(',') !== kop.minimumdoelenSets.join(',')) {
    const weg = goals.length - (gesaneerd?.goals.length ?? 0);
    waarschuwingen.push(weg > 0
      ? `${doelen(weg)} ${weg === 1 ? 'viel' : 'vielen'} weg bij het bewaren. De lijst kon niet als nagekeken bevestigd worden.`
      : 'Niet alle gekozen doelen bleven ongewijzigd bij het bewaren. De lijst kon niet als nagekeken bevestigd worden.');
    const leerplan = gesaneerd ?? ruw;
    return { leerplan, rapport: controleerLeerplan(leerplan, { sets: bestanden }), bevestigd: false, waarschuwingen };
  }

  const n = koppen.length;
  const samenvatting = n === 1
    ? `Letterlijk overgenomen uit de officiële set ${koppen[0].id} (${doelen(gesaneerd.goals.length)}), zelf gekozen.`
    : `Letterlijk overgenomen uit ${n} officiële sets (${doelen(gesaneerd.goals.length)}), zelf gekozen.`;
  const { leerplan, rapport, bevestigd } = bevestigSamengesteld(gesaneerd, bestanden, { door: NAGEKEKEN_DOOR_BRON, samenvatting });
  if (!bevestigd) {
    const eerste = rapport.bevindingen.find((b) => b.ernst === 'fout')?.bericht ?? '';
    waarschuwingen.push(`De lijst kon niet als nagekeken bevestigd worden, want het nakijken vond een probleem: ${eerste}`);
  }
  return { leerplan, rapport, bevestigd, waarschuwingen };
}

/**
 * De selectie van een bewaarde samengestelde lijst: set-id → doel-ids (vaste nummers), zonder dubbels, in de volgorde
 * van de doelen. De sets staan in de volgorde van `minimumdoelenSets`; een verwijzing naar een set die daar niet in
 * staat (een geknoeid bestand), komt erachter, zodat niets stil verdwijnt (de poort keurt zo'n lijst af). Leeg voor
 * een ander leerplan. Met de geladen sets en `bestaand` geeft `leerplanUitSelectie` dan dezelfde doelen terug.
 */
export function selectieVanLeerplan(cur: Curriculum): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  if (!cur || cur.herkomst?.methode !== 'samengesteld') return uit;
  const perSet = new Map<string, string[]>();
  const gezien = new Set<string>();
  for (const goal of Array.isArray(cur.goals) ? cur.goals : []) {
    for (const ref of Array.isArray(goal?.refs) ? goal.refs : []) {
      const set = tekstOfLeeg(ref?.set);
      const id = tekstOfLeeg(ref?.id);
      if (set === '' || id === '' || gezien.has(`${set}\u0000${id}`)) continue;
      gezien.add(`${set}\u0000${id}`);
      const ids = perSet.get(set) ?? [];
      ids.push(id);
      perSet.set(set, ids);
    }
  }
  for (const set of Array.isArray(cur.minimumdoelenSets) ? cur.minimumdoelenSets : []) {
    const ids = typeof set === 'string' ? perSet.get(set) : undefined;
    if (ids && !uit.has(set)) uit.set(set, ids);
  }
  for (const [set, ids] of perSet) if (!uit.has(set)) uit.set(set, ids);
  return uit;
}
