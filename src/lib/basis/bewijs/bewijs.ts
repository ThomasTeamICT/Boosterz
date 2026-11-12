// Bewijsrecords, samenvoegen en de status per doel (bouwpakket 3b tot 3d van
// docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md).
//
// Een bewijsrecord zegt: dit kind (een kindcode, nooit een naam) toonde dit bewijs van dit pakket, op deze minuut, juist
// of niet, en waar dat gebeurde. Records komen van gedeelde toestellen, van het eigen toestel van een kind, van een
// beurt aan het bord en van observaties van de leerkracht. Ze komen soms twee keer binnen (opnieuw scannen, twee keer
// een klasbestand inlezen) en in een willekeurige volgorde. Daarom:
//
// - Samenvoegen houdt per ontdubbelsleutel één record over en kiest dat met een vaste, volledige orde. Zo hangt de
//   uitkomst niet af van de volgorde, en verandert twee keer samenvoegen niets (commutatief, associatief, idempotent).
//   De ontdubbelsleutel is kindcode + pakket@versie + bewijs + tijd + toestel (AB, 3c), aangevuld met de uitkomst:
//   twee pogingen in dezelfde minuut op hetzelfde toestel met een andere uitkomst zijn twee gebeurtenissen, en geen van
//   beide mag stil wegvallen. Welke dan telt, beslist de regel per soort, niet het samenvoegen.
// - Binnen één sleutel wint een verplaatst record ('naar') van het origineel, en een latere verplaatsing van een
//   vroegere. Zo blijft een verplaatsing gelden als dezelfde code later nog eens binnenkomt (AB, 7).
// - Welk record telt (geldendeBewijzen): bij een checkvraag het vroegste, bij een oefening en een observatie het
//   laatste, over toestellen heen, per kind na verplaatsen.
// - De status per doel volgt statusVoor uit het prototype (tools/prototypes/lichtkamer/lichtkamer.html r. 960):
//   'toont het' als alle geldende bewijzen voor het doel juist zijn en er minstens twee zijn (of het enige, als het doel
//   maar één bewijs heeft); 'nog wankel' als er minstens één juist is; 'nog niet' als er geen enkel juist is; en
//   'nog geen bewijs' als er voor het doel geen enkel geldend bewijs is. Dat laatste is iets anders dan 'nog niet'.
//
// Zuiver: geen opslag, geen klok (de tijd komt altijd van de aanroeper), geen toeval, geen netwerk. Niets wordt hier
// bewaard. Een record bevat geen naam; saneerRecord laat elk onbekend veld weg.

import { doelSleutelTekst, type DoelSleutel } from './doelSleutel';
import {
  MAX_BEWIJZEN,
  MAX_FOUTPATRONEN,
  MAX_VERSIE,
  TELT,
  bewijsSleutel,
  isPakketcode,
  zoekBewijs,
  type BewijsDef,
  type BewijsIndex,
  type Foutpatroon,
} from './pakket';

/** Het alfabet van makeCode (src/lib/utils.ts): zonder 0/O en 1/I. Kindcodes en toestel-id's gebruiken het. */
export const CODE_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const KINDCODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{2}$/;
const TOESTEL_ID_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/;

export const MAX_TOESTELNUMMER = 32;

/**
 * De tijd van een record is een geheel aantal minuten sinds 1 januari 1970 (UTC). De grenzen weren een eenheidsfout:
 * milliseconden of seconden in plaats van minuten vallen ver buiten dit bereik.
 * MIN_TIJD = 1 januari 2025, MAX_TIJD = 1 januari 2100 (beide 00.00 UTC).
 */
export const MIN_TIJD = 28_928_160;
export const MAX_TIJD = 68_374_080;

export type BronSoort = 'toestel' | 'eigen' | 'bord' | 'observatie';

/**
 * Waar het bewijs vandaan komt:
 * - toestel: een gedeeld klastoestel ('Toestel 2'), met het toestel-id van het klaarzetten en het toestelnummer;
 * - eigen: het eigen toestel van een kind (vanaf het 3de leerjaar), met het toestel-id;
 * - bord: een beurt aan het bord, op het toestel van de leerkracht;
 * - observatie: 'Ik zag het' van de leerkracht.
 */
export type BewijsBron =
  | { soort: 'toestel'; toestelId: string; toestelnummer: number }
  | { soort: 'eigen'; toestelId: string; toestelnummer?: number }
  | { soort: 'bord' }
  | { soort: 'observatie' };

export interface BewijsRecord {
  /** 2 tekens uit CODE_ALFABET. Nooit een naam. */
  kindcode: string;
  pakket: string;
  versie: number;
  /** De plaats van het bewijs in de lijst van die versie (0 tot 31). */
  bewijsnummer: number;
  juist: boolean;
  /** Alleen bij een record dat niet juist is: de plaats van het foutpatroon in de lijst van het bewijs (0 tot 7). */
  foutpatroon?: number;
  /** Minuten sinds 1 januari 1970 (UTC), geheel. */
  tijd: number;
  bron: BewijsBron;
  /** Bij duowerk: de kindcode van het maatje. Het maatje heeft een eigen record. */
  duoMet?: string;
  /** Na verplaatsen door de leerkracht: de kindcode waar het record nu bij hoort. Kan ook de oorspronkelijke zijn. */
  naar?: string;
  /** De minuut van die verplaatsing; staat er altijd bij als `naar` er staat. */
  naarTijd?: number;
}

/** De tijd van een record uit milliseconden sinds 1970 (de klok van de aanroeper): afgerond naar beneden op de minuut. */
export function tijdOpDeMinuut(ms: number): number {
  return Math.floor(ms / 60_000);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function geheelTussen(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

export function isKindcode(x: unknown): x is string {
  return typeof x === 'string' && KINDCODE_RE.test(x);
}

function redenOngeldigeBron(b: unknown): string | null {
  if (!isObject(b)) return 'de bron ontbreekt';
  const heeftId = b.toestelId !== undefined;
  const heeftNr = b.toestelnummer !== undefined;
  const idOk = typeof b.toestelId === 'string' && TOESTEL_ID_RE.test(b.toestelId);
  const nrOk = geheelTussen(b.toestelnummer, 1, MAX_TOESTELNUMMER);
  switch (b.soort) {
    case 'toestel':
      if (!idOk) return 'een gedeeld toestel heeft een toestel-id van 4 tekens nodig';
      if (!nrOk) return `een gedeeld toestel heeft een toestelnummer van 1 tot ${MAX_TOESTELNUMMER} nodig`;
      return null;
    case 'eigen':
      if (!idOk) return 'een eigen toestel heeft een toestel-id van 4 tekens nodig';
      if (heeftNr && !nrOk) return `het toestelnummer moet tussen 1 en ${MAX_TOESTELNUMMER} liggen`;
      return null;
    case 'bord':
    case 'observatie':
      if (heeftId || heeftNr) return `een bron '${b.soort}' heeft geen toestel`;
      return null;
    default:
      return `onbekende bron '${String(b.soort)}'`;
  }
}

/**
 * Waarom dit geen geldig bewijsrecord is, of `null` als het geldig is. Streng: elk gekend veld dat er staat, moet
 * kloppen. Onbekende velden tellen niet (saneerRecord laat ze weg). Werkt op invoer van elke vorm, zonder te crashen.
 */
export function redenOngeldigRecord(x: unknown): string | null {
  if (!isObject(x)) return 'geen object';
  if (!isKindcode(x.kindcode)) return `kindcode '${String(x.kindcode)}' heeft niet 2 tekens uit het alfabet`;
  if (!isPakketcode(x.pakket)) return `pakketcode '${String(x.pakket)}' heeft niet 3 tekens uit A-Z en 0-9`;
  if (!geheelTussen(x.versie, 1, MAX_VERSIE)) return `versie '${String(x.versie)}' ligt niet tussen 1 en ${MAX_VERSIE}`;
  if (!geheelTussen(x.bewijsnummer, 0, MAX_BEWIJZEN - 1)) return `bewijsnummer '${String(x.bewijsnummer)}' ligt niet tussen 0 en ${MAX_BEWIJZEN - 1}`;
  if (typeof x.juist !== 'boolean') return 'juist is geen ja of nee';
  if (x.foutpatroon !== undefined) {
    if (x.juist) return 'een juist record heeft geen foutpatroon';
    if (!geheelTussen(x.foutpatroon, 0, MAX_FOUTPATRONEN - 1)) return `foutpatroon '${String(x.foutpatroon)}' ligt niet tussen 0 en ${MAX_FOUTPATRONEN - 1}`;
  }
  if (!geheelTussen(x.tijd, MIN_TIJD, MAX_TIJD)) return `tijd '${String(x.tijd)}' is geen geheel aantal minuten tussen 2025 en 2100`;
  const bron = redenOngeldigeBron(x.bron);
  if (bron) return bron;
  if (x.duoMet !== undefined) {
    if (!isKindcode(x.duoMet)) return `duoMet '${String(x.duoMet)}' is geen kindcode`;
    if (x.duoMet === x.kindcode) return 'een kind werkt niet in duo met zichzelf';
  }
  if ((x.naar === undefined) !== (x.naarTijd === undefined)) return 'naar en naarTijd staan altijd samen';
  if (x.naar !== undefined) {
    if (!isKindcode(x.naar)) return `naar '${String(x.naar)}' is geen kindcode`;
    if (!geheelTussen(x.naarTijd, MIN_TIJD, MAX_TIJD)) return `naarTijd '${String(x.naarTijd)}' is geen geheel aantal minuten tussen 2025 en 2100`;
  }
  return null;
}

/** Een kopie met een vaste volgorde van de velden, zonder onbekende velden. Alleen voor een geldig record. */
function canoniek(x: BewijsRecord): BewijsRecord {
  const b = x.bron;
  const bron: BewijsBron =
    b.soort === 'toestel'
      ? { soort: 'toestel', toestelId: b.toestelId, toestelnummer: b.toestelnummer }
      : b.soort === 'eigen'
        ? b.toestelnummer === undefined
          ? { soort: 'eigen', toestelId: b.toestelId }
          : { soort: 'eigen', toestelId: b.toestelId, toestelnummer: b.toestelnummer }
        : { soort: b.soort };
  // De volgorde van de sleutels hieronder is de canonieke volgorde (JSON.stringify volgt ze).
  return {
    kindcode: x.kindcode,
    pakket: x.pakket,
    versie: x.versie,
    bewijsnummer: x.bewijsnummer,
    juist: x.juist,
    ...(x.foutpatroon !== undefined ? { foutpatroon: x.foutpatroon } : {}),
    tijd: x.tijd,
    bron,
    ...(x.duoMet !== undefined ? { duoMet: x.duoMet } : {}),
    ...(x.naar !== undefined ? { naar: x.naar, naarTijd: x.naarTijd } : {}),
  };
}

/**
 * Saneert invoer van buiten (een gedecodeerde code, de opslag, een klasbestand): een geldig record in een vaste vorm,
 * zonder onbekende velden, of `null`. De aanroeper meldt een `null`; niets valt stil weg.
 */
export function saneerRecord(x: unknown): BewijsRecord | null {
  return redenOngeldigRecord(x) === null ? canoniek(x as BewijsRecord) : null;
}

function toestelDeel(b: BewijsBron): string {
  switch (b.soort) {
    case 'toestel':
      return `T${b.toestelId}`;
    case 'eigen':
      return `E${b.toestelId}`;
    case 'bord':
      return 'B';
    case 'observatie':
      return 'O';
  }
}

function uitkomst(r: BewijsRecord): string {
  if (r.juist) return 'J';
  return r.foutpatroon === undefined ? 'N' : `F${r.foutpatroon}`;
}

/**
 * De sleutel om te ontdubbelen: kindcode + pakket@versie + bewijs + tijd + toestel + uitkomst. Twee records met dezelfde
 * sleutel zijn dezelfde gebeurtenis; ze verschillen hoogstens in een verplaatsing of in duoMet.
 */
export function ontdubbelSleutel(r: BewijsRecord): string {
  return `${r.kindcode}|${r.pakket}@${r.versie}|${r.bewijsnummer}|${r.tijd}|${toestelDeel(r.bron)}|${uitkomst(r)}`;
}

/** Het kind waar een record bij hoort: na verplaatsen `naar`, anders de kindcode. */
export function kindVan(r: BewijsRecord): string {
  return r.naar ?? r.kindcode;
}

interface Kandidaat {
  r: BewijsRecord;
  /** De canonieke tekst: de laatste beslisser in elke orde, zodat elke keuze vastligt. */
  s: string;
}

function kandidaat(x: BewijsRecord): Kandidaat {
  const reden = redenOngeldigRecord(x);
  if (reden !== null) throw new Error(`Ongeldig bewijsrecord (${reden}). Saneer records van buiten eerst met saneerRecord.`);
  const r = canoniek(x);
  return { r, s: JSON.stringify(r) };
}

/** Gewone tekstvergelijking per teken: niet volgens de taal van het toestel, zodat elk toestel dezelfde volgorde geeft. */
function tekstOrde(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Binnen één ontdubbelsleutel: de laatste verplaatsing wint (geen verplaatsing is de vroegste), daarna de tekst. */
function beterBinnenSleutel(a: Kandidaat, b: Kandidaat): boolean {
  const ta = a.r.naarTijd ?? -1;
  const tb = b.r.naarTijd ?? -1;
  if (ta !== tb) return ta > tb;
  return tekstOrde(a.s, b.s) < 0;
}

function lijstOrde(a: Kandidaat, b: Kandidaat): number {
  return (
    tekstOrde(a.r.kindcode, b.r.kindcode) ||
    tekstOrde(a.r.pakket, b.r.pakket) ||
    a.r.versie - b.r.versie ||
    a.r.bewijsnummer - b.r.bewijsnummer ||
    a.r.tijd - b.r.tijd ||
    tekstOrde(a.s, b.s)
  );
}

function voegSamen(lijsten: readonly (readonly BewijsRecord[])[]): Kandidaat[] {
  const per = new Map<string, Kandidaat>();
  for (const lijst of lijsten) {
    for (const x of lijst) {
      const k = kandidaat(x);
      const sleutel = ontdubbelSleutel(k.r);
      const al = per.get(sleutel);
      if (!al || beterBinnenSleutel(k, al)) per.set(sleutel, k);
    }
  }
  return [...per.values()].sort(lijstOrde);
}

/**
 * Voegt lijsten records samen: per ontdubbelsleutel één record, in een vaste volgorde. De uitkomst hangt niet af van
 * de volgorde van de lijsten of van de records erin, en samenvoegen met het eigen resultaat verandert niets.
 * Verwacht geldige records (gesaneerd aan de rand); een ongeldig record geeft een Error, nooit een stille keuze.
 */
export function samenvoegen(...lijsten: readonly (readonly BewijsRecord[])[]): BewijsRecord[] {
  return voegSamen(lijsten).map((k) => k.r);
}

// ─── Welk record telt ────────────────────────────────────────────────────────

export interface GeldendResultaat {
  /** Per kind (na verplaatsen): per bewijssleutel ('LK4/4c1') het record dat telt. */
  perKind: Map<string, Map<string, BewijsRecord>>;
  /**
   * Records die bij geen gekend pakket, geen gekende versie of geen gekend bewijsnummer horen (bv. van een nieuwere
   * pakketversie dan dit toestel kent). Ze tellen niet mee, maar blijven bewaard en zijn te tonen. Na samenvoegen, in
   * een vaste volgorde.
   */
  onbekend: BewijsRecord[];
}

/**
 * Is `a` beter dan `b` voor een bewijs van deze regel? Eerste telt: de vroegste minuut, bij gelijke minuut eerst het
 * record dat niet juist is (het voorzichtigste eerste antwoord). Laatste telt: de laatste minuut, bij gelijke minuut eerst
 * het juiste record (een poging in dezelfde minuut herstelt meestal een fout). Daarna beslist de canonieke tekst.
 */
function beterVoorRegel(regel: 'eerste' | 'laatste', a: Kandidaat, b: Kandidaat): boolean {
  if (a.r.tijd !== b.r.tijd) return regel === 'eerste' ? a.r.tijd < b.r.tijd : a.r.tijd > b.r.tijd;
  if (a.r.juist !== b.r.juist) return regel === 'eerste' ? !a.r.juist : a.r.juist;
  return tekstOrde(a.s, b.s) < 0;
}

/**
 * Welk record telt, per kind en per bewijs. Voegt eerst samen (zodat een verplaatsing en dubbels altijd goed vallen) en
 * kiest dan per kind en bewijs met de regel van de soort: bij een checkvraag het vroegste record, bij een oefening en
 * een observatie het laatste, over toestellen en pakketversies heen. Een record van een oudere versie telt gewoon mee:
 * door de regel 'alleen achteraan aanvullen' wijst zijn nummer naar hetzelfde bewijs.
 */
export function geldendeBewijzen(records: readonly BewijsRecord[], index: BewijsIndex): GeldendResultaat {
  const gekozen = new Map<string, Map<string, Kandidaat>>();
  const onbekend: BewijsRecord[] = [];
  for (const k of voegSamen([records])) {
    const def = zoekBewijs(index, k.r.pakket, k.r.versie, k.r.bewijsnummer);
    if (!def) {
      onbekend.push(k.r);
      continue;
    }
    const kind = kindVan(k.r);
    const sleutel = bewijsSleutel(k.r.pakket, def.id);
    const regel = TELT[def.soort];
    let vanKind = gekozen.get(kind);
    if (!vanKind) {
      vanKind = new Map();
      gekozen.set(kind, vanKind);
    }
    const al = vanKind.get(sleutel);
    if (!al || beterVoorRegel(regel, k, al)) vanKind.set(sleutel, k);
  }
  const perKind = new Map<string, Map<string, BewijsRecord>>();
  for (const kind of [...gekozen.keys()].sort(tekstOrde)) {
    const vanKind = gekozen.get(kind) as Map<string, Kandidaat>;
    perKind.set(kind, new Map([...vanKind.keys()].sort(tekstOrde).map((s) => [s, (vanKind.get(s) as Kandidaat).r])));
  }
  return { perKind, onbekend };
}

/** Het bewijs bij een record, of `undefined` als het pakket, de versie of het nummer niet gekend is. */
export function bewijsVan(r: BewijsRecord, index: BewijsIndex): BewijsDef | undefined {
  return zoekBewijs(index, r.pakket, r.versie, r.bewijsnummer);
}

/** Het foutpatroon van een record dat niet juist is, of `undefined` (juist, zonder patroon, of onbekend nummer). */
export function foutpatroonVan(r: BewijsRecord, index: BewijsIndex): Foutpatroon | undefined {
  if (r.juist || r.foutpatroon === undefined) return undefined;
  return bewijsVan(r, index)?.foutpatronen[r.foutpatroon];
}

// ─── Status per doel ─────────────────────────────────────────────────────────

export type BewijsStatus = 'toont-het' | 'nog-wankel' | 'nog-niet' | 'nog-geen-bewijs';

export const BEWIJS_STATUSSEN: readonly BewijsStatus[] = ['toont-het', 'nog-wankel', 'nog-niet', 'nog-geen-bewijs'];

/** De woorden bij elke status, zoals in het prototype. Op een scherm altijd samen met een vorm, nooit alleen een kleur. */
export const STATUS_TEKST: Readonly<Record<BewijsStatus, string>> = {
  'toont-het': 'toont het',
  'nog-wankel': 'nog wankel',
  'nog-niet': 'nog niet',
  'nog-geen-bewijs': 'nog geen bewijs',
};

/**
 * De status van één kind voor één doel. `geldend` is de map van dat kind uit geldendeBewijzen (of een eigen map per
 * bewijssleutel met wat telt, bv. in het geheugen van het kindscherm); `undefined` is een kind zonder enig bewijs.
 *
 * Zoals statusVoor in het prototype: van de bewijzen die voor het doel tellen, worden de geldende genomen. Geen enkel:
 * 'nog geen bewijs'. Alle juist en minstens twee (of het enige als het doel maar één bewijs heeft): 'toont het'.
 * Minstens één juist: 'nog wankel'. Anders: 'nog niet'.
 */
export function statusVoor(doel: DoelSleutel, geldend: ReadonlyMap<string, { juist: boolean }> | undefined, index: BewijsIndex): BewijsStatus {
  const sleutels = index.perDoel.get(doelSleutelTekst(doel)) ?? [];
  let aantal = 0;
  let juist = 0;
  for (const s of sleutels) {
    const r = geldend?.get(s);
    if (!r) continue;
    aantal++;
    if (r.juist) juist++;
  }
  if (aantal === 0) return 'nog-geen-bewijs';
  const nodig = Math.min(2, sleutels.length);
  if (juist >= nodig && juist === aantal) return 'toont-het';
  if (juist > 0) return 'nog-wankel';
  return 'nog-niet';
}
