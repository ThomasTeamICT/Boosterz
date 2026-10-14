// Competenties plannen die nog nergens aan bod komen: het leerplan voor een nieuwe cursus en de voorgestelde titels
// (docs/STUDIERICHTINGEN.md § 24.4 onder "3b-L2", beslissingen F3b-B2, F3b-B3 en F3b-B5, invarianten I1 en I2). Het venster
// `BkGatenVenster.tsx` gebruikt dit bij "In een nieuwe cursus" (weg a); bewaren doet het venster met `bewaarNieuweGatenCursus`.
//
// Wat deze logica belooft:
// - Een deel blijft een deel (I2, § 9.5): de selectie is per BK-versie altijd een lijst competentiecodes (`selectieVanOpen`).
//   4 open competenties van 12 geven precies 4 doelen, zonder `alle`. Alleen als elke competentie met een tekst gekozen is,
//   krijgt het leerplan `alle`, en dan is het leerplan van "Bewaar als leerplan" (op dit toestel) precies dit leerplan.
// - Strikt (F3b-B5): heeft een gekozen BK-versie geen bestand of geen versiemerk, hoort het bestand bij een andere versie, of
//   staat een gekozen code niet (meer) met een tekst in het bestand, dan `veranderd`. Er valt nooit stil iets weg: dan zou
//   het venster minder plannen dan de leerkracht koos, of een leerplan maken dat `vindBkLeerplan` nooit herkent.
// - Index en bestand van dezelfde update: hoort een gekozen bestand niet bij het versiemerk van de index (bv. een verouderde
//   kopie uit de service worker), dan altijd `niet-nagekeken`, met de zin van `leerplanUitBk`, en nooit hergebruik. Zo
//   hangt de uitkomst niet af van wat er op het toestel staat, en bouwt een cursus nooit het geraamte uit het ene bestand
//   op doelteksten uit het andere.
// - Geen dubbel leerplan: een nagekeken leerplan met precies deze competenties (van deze richting, met de versiemerken van
//   nu of na een update die het niet raakte) wordt hergebruikt (`vindBkLeerplan`, met de bestanden).
// - Wat niet blokkeert, gaat niet verloren: geeft de Vlaamse overheid een gekozen beroepskwalificatie niet meer, dan staat
//   de zin van `leerplanUitBk` in `waarschuwingen`, bij `nieuw` én bij `hergebruik`.
// - Een nieuw leerplan is nagekeken en bevat precies de selectie, met `alle` alleen bij alles en het versiemerk van de
//   index. Klopt dat niet, dan `niet-nagekeken`, en bewaart het venster niets.
// - Niets wordt bewaard of aangepast (I1): beide functies zijn puur, op `Date.now()` en `uid()` in `leerplanUitBk` na.
//   Een hergebruikt leerplan komt ongewijzigd terug, zelfde object.
// - Een titel heeft hoogstens 120 tekens. "Aanvulling", het deel "(4 van 12 competenties)" en het onderscheidende stuk
//   ("van 14 oktober 2026") blijven altijd staan; ingekort wordt telkens het langste andere stuk. Nooit een competentiecode.

import type { BkBestand } from '../../../lib/beroepskwalificaties';
import { leerplanUitBk, selectieVanBkLeerplan, titelVoorBkLeerplan, vindBkLeerplan, type BkKeuze } from '../../../lib/bkLeerplan';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { aantalCompetentiesMetTekst, bkKaderVanVersies } from '../../../lib/dekkingBk';
import { doelgroepVoorLeerplan, graadTekst } from '../../../lib/doelgroep';
import { voorstelCursusTitel } from '../../../lib/richtingCursus';
import { doelgroepVan, type RichtingInfo, type RichtingKeuze } from '../../../lib/richtingKader';
import { titelToevoeging } from './bkSectieHulp';

// ── Types ───────────────────────────────────────────────────────────────────

export type BkGatenLeerplan =
  /**
   * Een nagekeken leerplan met precies de gekozen competenties: `hergebruik` staat al op dit toestel, `nieuw` moet nog
   * bewaard worden. `waarschuwingen`: wat niet blokkeert maar de leerkracht moet weten (nu: de Vlaamse overheid geeft een
   * gekozen beroepskwalificatie niet meer), als volledige zinnen met een punt, zoals `leerplanVoorKeuze` in BkKeuze ze
   * teruggeeft. `leerplanVoorBkGaten` zet altijd een lijst (leeg als er niets te melden is); optioneel in het type, zodat
   * de vorm van § 24.4 blijft gelden.
   */
  | { soort: 'hergebruik' | 'nieuw'; leerplan: Curriculum; waarschuwingen?: string[] }
  /**
   * Het leerplan kon niet als nagekeken gemaakt worden: niets bewaren. `waarschuwing` is de eerste waarschuwing, in gewone
   * taal en zonder punt aan het eind, zodat het venster ze in `bkNietNagekeken(…)` kan zetten.
   */
  | { soort: 'niet-nagekeken'; waarschuwing: string }
  /**
   * De gegevens passen niet meer bij de keuze (een gekozen versie zonder bestand of versiemerk, of een gekozen competentie
   * die niet meer met een tekst in het bestand staat): niets bewaren, het venster vraagt opnieuw te beginnen.
   */
  | { soort: 'veranderd' };

export interface BkGatenLeerplanIn {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  /** Per BK-versie de gekozen competentiecodes, altijd als lijst (`selectieVanOpen`), in de volgorde van het kader. */
  selectie: ReadonlyMap<string, readonly string[]>;
  /** Uit `laadBkGegevens`: de bestanden per BK-versie en de versiemerken uit de index. */
  gegevens: { bestanden: ReadonlyMap<string, BkBestand>; merken: ReadonlyMap<string, string> };
  /** De leerplannen op dit toestel, vers uit de opslag bij de klik. */
  curricula: readonly Curriculum[];
  /** JJJJ-MM-DD, voor het onderscheidende stuk van een titel die al bestaat. */
  vandaag: string;
}

// ── Teksten ─────────────────────────────────────────────────────────────────

/**
 * In `bkNietNagekeken(…)`: het leerplan werd nagekeken, maar bevat niet precies wat gekozen is (een competentie te veel of
 * te weinig, "alle" bij een deel, of het versiemerk van een andere update). Dan liever niets dan een leerplan dat later
 * niet herkend wordt of stil alle competenties volgt.
 */
export const BK_GATEN_NIET_PRECIES = 'het leerplan zou niet precies de gekozen competenties bevatten';

/** Zonder keuze: de zin van `leerplanUitBk`, zonder punt. */
const KIES_MINSTENS_EEN = 'Kies minstens één competentie';

const AANVULLING = 'Aanvulling';
const SCHEIDER = ' · ';
const MAX_TITEL = 120;
const VERANDERD: BkGatenLeerplan = { soort: 'veranderd' };

// ── Kleine hulp ─────────────────────────────────────────────────────────────

function tekstOfLeeg(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** "a", "a en b", "a, b en c" (zoals de titel van een BK-leerplan). */
function somLijst(delen: readonly string[]): string {
  return delen.length <= 1 ? (delen[0] ?? '') : `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

function competenties(n: number): string {
  return `${n} ${n === 1 ? 'competentie' : 'competenties'}`;
}

/** Inkorten tot hoogstens `max` tekens (met "…" als er iets wegviel), zonder een tekenpaar doormidden te knippen. */
function inkorten(t: string, max: number): string {
  if (t.length <= max) return t;
  let uit = t.slice(0, Math.max(0, max - 1));
  const laatste = uit.charCodeAt(uit.length - 1);
  if (laatste >= 0xd800 && laatste <= 0xdbff) uit = uit.slice(0, -1);
  return `${uit.trimEnd()}…`;
}

/** Hoofdletters, witruimte en randen tellen niet bij het vergelijken van titels (zoals `uniekeTitel`). */
function titelSleutel(t: string): string {
  return t.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Dezelfde versies, met per versie dezelfde competenties (de volgorde telt niet). */
function zelfdeSelectie(a: ReadonlyMap<string, readonly string[]>, b: ReadonlyMap<string, readonly string[]>): boolean {
  if (a.size !== b.size) return false;
  for (const [bk, ids] of a) {
    const andere = b.get(bk);
    if (andere === undefined) return false;
    const eigen = new Set(ids);
    const hun = new Set(andere);
    if (eigen.size !== hun.size || [...eigen].some((id) => !hun.has(id))) return false;
  }
  return true;
}

/**
 * De selectie zoals ze binnenkomt, gecontroleerd: per versie (getrimd) de codes (getrimd, elk één keer, in de gegeven
 * volgorde). `undefined` als er iets in staat dat geen versie of geen code is: dat valt niet stil weg. Een versie met een
 * lege lijst is niet gekozen en valt weg (er gaat niets verloren).
 */
function gecontroleerdeSelectie(selectie: ReadonlyMap<string, readonly string[]>): Map<string, string[]> | undefined {
  const uit = new Map<string, string[]>();
  if (!selectie || typeof selectie[Symbol.iterator] !== 'function') return undefined;
  for (const [versieRuw, idsRuw] of selectie) {
    const versie = tekstOfLeeg(versieRuw);
    if (versie === '' || !Array.isArray(idsRuw)) return undefined;
    const ids = uit.get(versie) ?? [];
    for (const id of idsRuw as readonly unknown[]) {
      const t = tekstOfLeeg(id);
      if (t === '') return undefined;
      if (!ids.includes(t)) ids.push(t);
    }
    if (ids.length > 0) uit.set(versie, ids);
  }
  return uit;
}

// ── Titels ──────────────────────────────────────────────────────────────────

/** Een stuk van een titel: `tekst` mag ingekort worden (tenzij `vast`), `staart` blijft altijd achter de tekst staan. */
interface Stuk {
  tekst: string;
  staart?: string;
  vast?: true;
}

/**
 * Stukken samen met " · ", hoogstens `max` tekens. Past het niet, dan wordt telkens de langste tekst van een stuk dat niet
 * vast is, ingekort (zoals `samenTitel`). Een `staart` en een vast stuk blijven staan. Alleen als ook dat niet volstaat
 * (in de praktijk nooit), wordt het geheel ingekort.
 */
function samenMetVasteStukken(stukken: readonly Stuk[], max: number): string {
  const lijst = stukken.map((s) => ({ ...s }));
  const geheel = () => lijst.map((s) => `${s.tekst}${s.staart ?? ''}`).join(SCHEIDER);
  for (let ronde = 0; ronde < 50; ronde++) {
    const teLang = geheel().length - max;
    if (teLang <= 0) break;
    let langste = -1;
    lijst.forEach((s, i) => {
      if (s.vast !== true && (langste < 0 || s.tekst.length > lijst[langste].tekst.length)) langste = i;
    });
    if (langste < 0) break;
    const voor = lijst[langste].tekst;
    const na = inkorten(voor, Math.max(1, voor.length - teLang));
    if (na.length >= voor.length) break;
    lijst[langste].tekst = na;
  }
  return inkorten(geheel(), max);
}

/** Het deel "(4 van 12 competenties)" zoals de titel van een BK-leerplan het zet: alleen bij een echt deel. */
function deelTekst(deel: { gekozen: number; totaal: number } | undefined): string {
  if (!deel || !Number.isInteger(deel.gekozen) || !Number.isInteger(deel.totaal) || deel.gekozen < 0 || deel.gekozen >= deel.totaal) return '';
  return ` (${deel.gekozen} van ${competenties(deel.totaal)})`;
}

/**
 * De stukken van de titel van het leerplan, zoals `titelVoorBkLeerplan` ze samenzet, met "Aanvulling" vooraan: de namen
 * van de beroepskwalificaties met het deel erachter, de richting, de graad en bij een richting van het buitengewoon
 * onderwijs "buitengewoon". "Aanvulling" en het deel blijven altijd staan.
 */
function leerplanStukken(info: RichtingInfo, titels: readonly string[], deel?: { gekozen: number; totaal: number }): Stuk[] {
  const naam = somLijst([...new Set((Array.isArray(titels) ? titels : []).map(tekstOfLeeg).filter((t) => t !== ''))]);
  const staart = deelTekst(deel);
  const stukken: Stuk[] = [{ tekst: AANVULLING, vast: true }];
  if (naam !== '') stukken.push({ tekst: naam, staart });
  else if (staart !== '') stukken.push({ tekst: staart.trim(), vast: true });
  const richting = [info.groep.titel, info.graad !== undefined ? graadTekst(info.graad) : '', info.soort === 'buso' ? 'buitengewoon' : ''];
  for (const r of richting) {
    const t = tekstOfLeeg(r);
    if (t !== '') stukken.push({ tekst: t });
  }
  return stukken;
}

/**
 * "Aanvulling · " + `titelVoorBkLeerplan(…)`, hoogstens 120 tekens. Past dat niet, dan dezelfde stukken, ingekort zonder
 * "Aanvulling" en het deel te verliezen (`titelVoorBkLeerplan` rekent zelf met 120 tekens, zonder het voorvoegsel).
 */
function leerplanTitel(info: RichtingInfo, titels: readonly string[], deel?: { gekozen: number; totaal: number }): string {
  const basis = titelVoorBkLeerplan(info, Array.isArray(titels) ? titels : [], deel);
  const formule = basis.trim() === '' ? AANVULLING : `${AANVULLING}${SCHEIDER}${basis}`;
  return formule.length <= MAX_TITEL ? formule : samenMetVasteStukken(leerplanStukken(info, titels, deel), MAX_TITEL);
}

/**
 * Zoals `uniekeTitel` (bkSectieHulp.ts): `basis` als er nog geen leerplan met die titel op het toestel staat, anders met
 * `toevoeging` erachter (en bij nog een gelijke " (2)", " (3)", …). Het verschil: hier staat "Aanvulling" vooraan, en
 * `uniekeTitel` zoekt het deel alleen in het eerste stuk. Bij het inkorten blijven "Aanvulling", het deel en de toevoeging
 * dus staan. Hoogstens 120 tekens.
 */
function uniekeAanvullingTitel(basis: string, stukken: readonly Stuk[], bestaande: readonly string[], toevoeging: string): string {
  const gebruikt = new Set(bestaande.map(titelSleutel));
  if (!gebruikt.has(titelSleutel(basis))) return basis;
  const met = (extra: string) => samenMetVasteStukken([...stukken, { tekst: extra, vast: true }], MAX_TITEL);
  const eerste = met(toevoeging);
  if (!gebruikt.has(titelSleutel(eerste))) return eerste;
  for (let n = 2; n < 100; n++) {
    const kandidaat = met(`${toevoeging} (${n})`);
    if (!gebruikt.has(titelSleutel(kandidaat))) return kandidaat;
  }
  return eerste;
}

/**
 * De voorgestelde titels voor een nieuwe cursus met competenties die nog nergens aan bod komen (§ 24.4), hoogstens 120
 * tekens en zonder competentiecode:
 * - `cursus`: bij één beroepskwalificatie haar titel als vak ("Onthaalmedewerker · Onthaal en recreatie · 5de jaar"),
 *   bij meer (of zonder titel) "Aanvulling" als vak; het jaar komt van `keuze`;
 * - `leerplan`: "Aanvulling · " + `titelVoorBkLeerplan(info, titels, deel)`, bv.
 *   "Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Onthaal en recreatie · 3de graad". Is dat te lang, dan
 *   wordt het langste stuk ingekort; "Aanvulling" en het deel blijven staan.
 *
 * `titels` zijn de titels van de gekozen beroepskwalificaties, één per versie; `deel` alleen bij één beroepskwalificatie.
 */
export function titelsVoorBkGaten(
  info: RichtingInfo,
  keuze: RichtingKeuze,
  titels: readonly string[],
  deel?: { gekozen: number; totaal: number },
): { cursus: string; leerplan: string } {
  const lijst = Array.isArray(titels) ? titels : [];
  const enige = lijst.length === 1 ? tekstOfLeeg(lijst[0]) : '';
  const vak = enige !== '' ? enige : AANVULLING;
  return {
    cursus: voorstelCursusTitel({ ...doelgroepVan(info, keuze), vak }),
    leerplan: leerplanTitel(info, lijst, deel),
  };
}

// ── Het leerplan ────────────────────────────────────────────────────────────

/**
 * Bevat het nieuwe leerplan precies de selectie? Dezelfde competenties per versie, elke versie één keer in `bkVersies`,
 * `alle` alleen als elke competentie met een tekst van die versie gekozen is, en het versiemerk van de index.
 */
function preciesGekozen(leerplan: Curriculum, gevraagd: ReadonlyMap<string, readonly string[]>, keuzes: readonly BkKeuze[], merken: ReadonlyMap<string, string>): boolean {
  if (!zelfdeSelectie(selectieVanBkLeerplan(leerplan), gevraagd)) return false;
  const versies = Array.isArray(leerplan.bkVersies) ? leerplan.bkVersies : [];
  if (versies.length !== keuzes.length) return false;
  return keuzes.every((k) => {
    const m = versies.find((v) => v?.bk === k.bestand.bk);
    const alles = k.competenties.length === aantalCompetentiesMetTekst(k.bestand);
    return m !== undefined && (m.alle === true) === alles && m.sha === merken.get(k.bestand.bk);
  });
}

/** De eerste waarschuwing zonder punt aan het eind (het venster zet er ". Er is niets bewaard." achter). */
function zonderPunt(w: string | undefined): string {
  return tekstOfLeeg(w).replace(/[.\s]+$/, '');
}

/** Het versiemerk van een bestand: de eerste 16 tekens van zijn sha256, zoals in de index (`merkVanBestand` in bkLeerplan.ts). */
function merkVanBestand(b: BkBestand): string {
  return typeof b.sha256 === 'string' ? b.sha256.slice(0, 16) : '';
}

/**
 * Bij `hergebruik` de waarschuwing die `leerplanUitBk` zonder te blokkeren geeft (bkLeerplan.ts): één zin per gekozen
 * versie waarvan het bestand `nietMeerInBron` heeft, letterlijk dezelfde, in de volgorde van de keuze. `hergebruik` roept
 * `leerplanUitBk` niet aan; een test bewaakt dat `nieuw` en `hergebruik` dezelfde zinnen geven.
 */
function nietMeerGegeven(keuzes: readonly BkKeuze[]): string[] {
  return keuzes
    .filter((k) => typeof k.bestand.nietMeerInBron === 'string')
    .map((k) => `De Vlaamse overheid geeft ‘${k.bestand.titel}’ (${k.bestand.bk}) niet meer. Het leerplan gebruikt de laatst bekende competenties.`);
}

/**
 * Het leerplan voor een nieuwe cursus met de gekozen competenties die nog nergens aan bod komen (§ 24.4, weg a):
 * 1. Per gekozen versie een bestand van die versie, een versiemerk en een tekst voor elke gekozen code; anders `veranderd`.
 *    Hoort een bestand niet bij het versiemerk van de index (een andere update), dan meteen `niet-nagekeken`, met de zin
 *    van `leerplanUitBk`: vóór het hergebruik, zodat een leerplan op het toestel de uitkomst niet verandert.
 * 2. Een nagekeken leerplan met precies deze competenties op dit toestel (`vindBkLeerplan`, met de bestanden, van deze
 *    richting): `hergebruik`. Zo geeft hetzelfde gat twee keer plannen hetzelfde leerplan, en geven alle 12 van 12 het
 *    leerplan van "Bewaar als leerplan".
 * 3. Anders `leerplanUitBk` met de doelgroep van de richting (zonder jaar), de versiemerken en een titel met "Aanvulling"
 *    vooraan die nog niet op het toestel staat.
 * 4. Niet bevestigd, of niet precies de selectie (`preciesGekozen`): `niet-nagekeken`. Anders `nieuw`; bewaren doet het venster.
 * Bij `nieuw` en `hergebruik` staan in `waarschuwingen` de zinnen die niet blokkeren.
 */
export function leerplanVoorBkGaten(o: BkGatenLeerplanIn): BkGatenLeerplan {
  const gevraagd = gecontroleerdeSelectie(o.selectie);
  const bestanden = o.gegevens?.bestanden;
  const merken = o.gegevens?.merken;
  if (gevraagd === undefined || !(bestanden instanceof Map) || !(merken instanceof Map)) return VERANDERD;
  if (gevraagd.size === 0) return { soort: 'niet-nagekeken', waarschuwing: KIES_MINSTENS_EEN };

  // 1. Strikt: alles wat gekozen is, moet er zijn. Nooit stil een versie of een competentie overslaan. Een versie zonder
  //    bruikbaar bestand van die versie heeft geen competenties met een tekst in het kader.
  const metTekst = new Map<string, Set<string>>();
  for (const doel of bkKaderVanVersies([...gevraagd.keys()], bestanden)) {
    const ids = metTekst.get(doel.set) ?? new Set<string>();
    ids.add(doel.id);
    metTekst.set(doel.set, ids);
  }
  const keuzes: BkKeuze[] = [];
  let andereUpdate = false;
  for (const [versie, ids] of gevraagd) {
    const bestand = bestanden.get(versie);
    const merk = merken.get(versie);
    const bestaan = metTekst.get(versie);
    if (!bestand || typeof merk !== 'string' || merk.trim() === '' || !bestaan || ids.some((id) => !bestaan.has(id))) return VERANDERD;
    if (merkVanBestand(bestand) !== merk) andereUpdate = true;
    keuzes.push({ bestand, competenties: ids });
  }

  // De doelgroep van de richting, zonder jaar: een leerplan geldt voor de hele graad.
  const doelgroep = doelgroepVoorLeerplan(doelgroepVan(o.info, o.keuze));
  if (!doelgroep) return VERANDERD;

  // Index en bestand van een andere update (bv. een verouderde kopie uit de service worker): nooit hergebruik en nooit een
  // nieuw leerplan. `vindBkLeerplan` vergelijkt bij een gelijk merk alleen het leerplan met de index, niet met het bestand;
  // de cursus zou dan het geraamte uit dit bestand bouwen op doelteksten uit een ander. De uitleg is die van `leerplanUitBk`
  // ("De gegevens van … horen niet bij de laatste update …"), dezelfde als zonder passend leerplan op het toestel.
  if (andereUpdate) {
    const u = leerplanUitBk(keuzes, { doelgroep, merken });
    return { soort: 'niet-nagekeken', waarschuwing: (u.bevestigd ? '' : zonderPunt(u.waarschuwingen[0])) || BK_GATEN_NIET_PRECIES };
  }
  const curricula = Array.isArray(o.curricula) ? o.curricula : [];

  // 2. Hergebruik, met de bestanden: ook een leerplan dat een update niet raakte, telt.
  const bestaand = vindBkLeerplan(curricula, gevraagd, doelgroep, merken, bestanden);
  if (bestaand) return { soort: 'hergebruik', leerplan: bestaand, waarschuwingen: nietMeerGegeven(keuzes) };

  // 3. Een nieuw leerplan, met een titel die nog niet op het toestel staat.
  const titels = keuzes.map((k) => k.bestand.titel.trim());
  const deel = keuzes.length === 1 ? { gekozen: keuzes[0].competenties.length, totaal: aantalCompetentiesMetTekst(keuzes[0].bestand) } : undefined;
  const bestaandeTitels = curricula.map((c) => c?.title).filter((t): t is string => typeof t === 'string');
  const titel = uniekeAanvullingTitel(
    titelsVoorBkGaten(o.info, o.keuze, titels, deel).leerplan,
    leerplanStukken(o.info, titels, deel),
    bestaandeTitels,
    titelToevoeging('kaart', o.vandaag),
  );
  const u = leerplanUitBk(keuzes, { doelgroep, merken, titel });

  // 4. Alleen een nagekeken leerplan met precies de selectie.
  if (!u.bevestigd) return { soort: 'niet-nagekeken', waarschuwing: zonderPunt(u.waarschuwingen[0]) || BK_GATEN_NIET_PRECIES };
  if (!preciesGekozen(u.leerplan, gevraagd, keuzes, merken)) return { soort: 'niet-nagekeken', waarschuwing: BK_GATEN_NIET_PRECIES };
  return { soort: 'nieuw', leerplan: u.leerplan, waarschuwingen: [...u.waarschuwingen] };
}
