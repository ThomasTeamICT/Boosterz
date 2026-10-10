// ── Doelgroep: voor welke studierichting (en welk jaar) een cursus of leerplan is ──
//
// Eén optioneel veld op `Course` en op `Curriculum` (docs/STUDIERICHTINGEN.md § 10). De sleutel is het groepnummer
// uit de matrix van de studierichtingen ("G-0193"): dat is op elk toestel hetzelfde, een leerplan-id niet. Zo reist de
// richting mee met een deellink, een cursusbestand en een klaspakket.
//
// Alles wat binnenkomt (bestand, link, pakket, overdracht, opslag) gaat door `sanitizeDoelgroep`. Die maakt altijd een
// nieuw object met alleen de gekende sleutels en is idempotent. De doelgroep telt nooit mee in de vingerafdruk van de
// doelen, en de AI kan ze nooit invullen (zie `sanitizeAICourse`).
//
// Puur en zonder imports: dit bestand mag nergens anders van afhangen.

export interface Doelgroep {
  /** Groepnummer uit de matrix ("G-0193"): de sleutel, gelijk op elk toestel. */
  groep: string;
  /** Momentopname voor de weergave: de titel van de groep of van het gekozen onderdeel. Eén regel, hoogstens 160 tekens. */
  titel: string;
  /** Ontbreekt bij het buitengewoon onderwijs (zonder graad) en bij OKAN. */
  graad?: 1 | 2 | 3;
  /** 1 tot 7, past bij de graad (1: 1–2, 2: 3–4, 3: 5–7). Leeg = de hele graad; op een leerplan altijd leeg. */
  jaar?: number;
  soort: 'so' | 'buso';
  /** Nummer van het gekozen onderdeel (basisoptie, variant): alleen voor de weergave. */
  onderdeel?: number;
  /** Vrije tekst, hoogstens 80 tekens: alleen weergave en voorstel, geen koppeling. */
  vak?: string;
  /**
   * Vingerafdruk van het doelenkader bij het maken (64 hex-tekens); alleen zinvol op een leerplan. Telt de nummers van
   * de deelsets en welke sets volledig zijn, niet de inhoud van een volledige set (zie `kaderVingerafdruk`).
   */
  kader?: string;
  /**
   * Vingerafdruk van de inhoud van de volledige sets bij het maken (64 hex-tekens, zie `volledigeSetsVingerafdruk`).
   * Alleen samen met `kader`; leerplannen van vóór oktober 2026 hebben ze niet.
   */
  kaderVolledig?: string;
  /** Leerplan gemaakt per set: "Werk het leerplan bij" mag nieuwe doelen van de koppeling toevoegen. */
  volgtKader?: true;
  /**
   * Nieuw (fase 2, § 22.3). Per set van het leerplan die bij het bewaren in het kader van de richting stond: haar afdruk
   * (`setAfdruk`, 16 kleine hex-tekens). Aanwezig (ook leeg) = nieuw formaat: dan beslist alleen dit veld wat er met het
   * kader vergeleken wordt, en een set zonder afdruk wordt nooit vergeleken (zie `veranderdSindsLeerplan`). Alleen samen
   * met een geldig `kader`, alleen op een leerplan, hoogstens 50 sets. Verander het formaat nooit.
   */
  setAfdrukken?: Record<string, string>;
}

export const MAX_DOELGROEP_TITEL = 160;
export const MAX_DOELGROEP_VAK = 80;
/** Hoogstens zoveel sets in `setAfdrukken`: zoveel sets kan één leerplan bevatten (`MAX_SETS` in curriculum.ts). */
export const MAX_SET_AFDRUKKEN = 50;

const GROEP = /^G-\d{4,6}$/;
const KADER = /^[0-9a-f]{64}$/;
/** Een set-id zoals `SET_ID` in curriculum.ts. `__proto__` en `constructor` passen hier nooit op. */
const SET_ID = /^ODS_\d{1,9}$/;
const SET_AFDRUK = /^[0-9a-f]{16}$/;
const MAX_ONDERDEEL = 999999;
/** Jaren per graad: 1ste graad 1–2, 2de graad 3–4, 3de graad 5–7 (het 7de jaar hoort bij de 3de graad). */
const JAREN: Readonly<Record<1 | 2 | 3, readonly [number, number]>> = { 1: [1, 2], 2: [3, 4], 3: [5, 7] };

/** Alleen een eigen eigenschap: nooit iets uit het prototype (ook niet als dat vervuild is). */
function eigen(o: object, sleutel: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, sleutel) ? (o as Record<string, unknown>)[sleutel] : undefined;
}

/**
 * Eén regel tekst: witruimte en stuurtekens worden één spatie, getrimd, hoogstens `max` tekens, zonder een tekenpaar
 * (emoji, …) doormidden te knippen. Twee keer toepassen geeft hetzelfde.
 */
function eenRegel(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  let t = v.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
  if (t.length > max) {
    t = t.slice(0, max);
    const laatste = t.charCodeAt(t.length - 1);
    if (laatste >= 0xd800 && laatste <= 0xdbff) t = t.slice(0, -1);
    t = t.trim();
  }
  return t;
}

function leesGraad(v: unknown): 1 | 2 | 3 | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*[1-3]\s*$/.test(v) ? Number(v) : NaN;
  return n === 1 || n === 2 || n === 3 ? n : undefined;
}

function leesJaar(v: unknown, graad: 1 | 2 | 3 | undefined): number | undefined {
  if (graad === undefined || typeof v !== 'number' || !Number.isInteger(v)) return undefined;
  const [van, tot] = JAREN[graad];
  return v >= van && v <= tot ? v : undefined;
}

/**
 * De afdrukken per set uit onbetrouwbare invoer, of `undefined` als het geen gewoon object is (een array ook niet).
 * Alleen eigen eigenschappen; een sleutel moet een set-id zijn, een waarde 16 kleine hex-tekens; de rest valt weg.
 * Sleutels gesorteerd op code-eenheid, hoogstens `MAX_SET_AFDRUKKEN` (de eerste na het sorteren). Altijd een nieuw
 * object. Een echt leeg object blijft (een leerplan zonder sets in het kader). Had het object wel sleutels maar blijft
 * er niets over (geknoeid, of een formaat dat deze versie niet kent), dan ook `undefined`: dan geldt de oude regel met
 * `kader` en `kaderVolledig`, en niet stil "nooit iets vergelijken". Idempotent.
 */
function leesSetAfdrukken(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const sleutels = Object.keys(v);
  // Elke waarde één keer lezen: wat nagekeken is, is ook wat bewaard wordt.
  const geldig: [string, string][] = [];
  for (const set of sleutels) {
    if (!SET_ID.test(set)) continue;
    const afdruk = eigen(v, set);
    if (typeof afdruk === 'string' && SET_AFDRUK.test(afdruk)) geldig.push([set, afdruk]);
  }
  if (sleutels.length > 0 && geldig.length === 0) return undefined;
  geldig.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const uit: Record<string, string> = {};
  for (const [set, afdruk] of geldig.slice(0, MAX_SET_AFDRUKKEN)) uit[set] = afdruk;
  return uit;
}

/**
 * Een doelgroep uit onbetrouwbare invoer (bestand, link, pakket, overdracht, opslag), of `undefined` als het geen
 * object is of het groepnummer niet klopt. Altijd een nieuw object met alleen de gekende sleutels. Idempotent.
 *
 * - `titel`: één regel, getrimd, hoogstens 160 tekens; leeg wordt het groepnummer.
 * - `graad`: 1 tot 3, ook als tekst. `jaar`: een geheel getal dat bij de graad past; zonder graad valt het weg.
 * - `soort`: alleen `buso` bij precies 'buso', anders `so`.
 * - `onderdeel`: een geheel getal van 1 tot 999999. `vak`: één regel, hoogstens 80 tekens; leeg valt weg.
 * - `kader`: alleen 64 kleine hex-tekens. `kaderVolledig`: ook, en alleen samen met een geldig `kader`.
 *   `volgtKader`: alleen `true`.
 * - `setAfdrukken`: alleen samen met een geldig `kader` en als gewoon object, en niet als alles erin ongeldig was;
 *   zie `leesSetAfdrukken`.
 */
export function sanitizeDoelgroep(raw: unknown): Doelgroep | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const groep = eigen(raw, 'groep');
  if (typeof groep !== 'string' || !GROEP.test(groep)) return undefined;
  const uit: Doelgroep = {
    groep,
    titel: eenRegel(eigen(raw, 'titel'), MAX_DOELGROEP_TITEL) || groep,
    soort: eigen(raw, 'soort') === 'buso' ? 'buso' : 'so',
  };
  const graad = leesGraad(eigen(raw, 'graad'));
  if (graad !== undefined) uit.graad = graad;
  const jaar = leesJaar(eigen(raw, 'jaar'), graad);
  if (jaar !== undefined) uit.jaar = jaar;
  const onderdeel = eigen(raw, 'onderdeel');
  if (typeof onderdeel === 'number' && Number.isInteger(onderdeel) && onderdeel >= 1 && onderdeel <= MAX_ONDERDEEL) {
    uit.onderdeel = onderdeel;
  }
  const vak = eenRegel(eigen(raw, 'vak'), MAX_DOELGROEP_VAK);
  if (vak) uit.vak = vak;
  const kader = eigen(raw, 'kader');
  if (typeof kader === 'string' && KADER.test(kader)) {
    uit.kader = kader;
    // Zonder `kader` zegt de afdruk van de volledige sets niets (zie `veranderdSindsLeerplan`): wie `kader` weghaalt
    // (een eigen kopie, een cursus), verliest ze zo bij het volgende saneren ook.
    const kaderVolledig = eigen(raw, 'kaderVolledig');
    if (typeof kaderVolledig === 'string' && KADER.test(kaderVolledig)) uit.kaderVolledig = kaderVolledig;
    // Ook de afdrukken per set alleen samen met `kader`: een oudere app-versie die ze wegsaneert, valt zo terug op de
    // oude regel met `kader` en `kaderVolledig`, en wie `kader` weghaalt, verliest ze bij het volgende saneren ook.
    const setAfdrukken = leesSetAfdrukken(eigen(raw, 'setAfdrukken'));
    if (setAfdrukken !== undefined) uit.setAfdrukken = setAfdrukken;
  }
  if (eigen(raw, 'volgtKader') === true) uit.volgtKader = true;
  return uit;
}

/**
 * De doelgroep van een leerplan: zoals `sanitizeDoelgroep`, maar altijd zonder jaar. Een leerplan geldt voor de hele
 * graad (§ 10.1); een jaar erop zou een cursus zonder eigen doelgroep (die de doelgroep van haar leerplan overneemt)
 * stil uit de andere jaren van de graad houden. Idempotent.
 */
export function doelgroepVoorLeerplan(raw: unknown): Doelgroep | undefined {
  const d = sanitizeDoelgroep(raw);
  if (!d) return undefined;
  delete d.jaar;
  return d;
}

/**
 * Een nieuw object zonder de velden die bij de koppeling van een leerplan horen: `kader`, `kaderVolledig`,
 * `setAfdrukken` en `volgtKader`. De rest blijft zoals ze is (dit saneert niet). Voor een eigen kopie, een cursus en
 * een klas: die volgen de officiële koppeling niet.
 */
export function zonderKaderVelden(d: Doelgroep): Doelgroep {
  const { kader: _k, kaderVolledig: _kv, setAfdrukken: _s, volgtKader: _v, ...rest } = d;
  void _k; void _kv; void _s; void _v;
  return rest;
}

/**
 * De doelgroep van een cursus: zoals `sanitizeDoelgroep` (met jaar), maar zonder `kader`, `kaderVolledig`,
 * `setAfdrukken` en `volgtKader` (`zonderKaderVelden`): die horen bij een leerplan, niet bij een cursus. Ze vallen
 * altijd samen weg, ook als de invoer (een overdracht, een leerplan, een geknutseld bestand) ze draagt. Idempotent.
 */
export function doelgroepVoorCursus(raw: unknown): Doelgroep | undefined {
  const d = sanitizeDoelgroep(raw);
  return d ? zonderKaderVelden(d) : undefined;
}

/**
 * De doelgroep van een klas (§ 22.6.1): gesaneerd, en dan alleen een witte lijst: `groep`, `titel`, `graad`, `jaar`,
 * `soort` en `onderdeel`. Geen vak (dat hoort bij de cursus) en geen kadervelden (een klas is geen leerplan). Een veld
 * dat later bij de doelgroep komt, belandt zo nooit per vergissing op een klas. Idempotent.
 */
export function doelgroepVoorKlas(raw: unknown): Doelgroep | undefined {
  const d = sanitizeDoelgroep(raw);
  if (!d) return undefined;
  const uit: Doelgroep = { groep: d.groep, titel: d.titel, soort: d.soort };
  if (d.graad !== undefined) uit.graad = d.graad;
  if (d.jaar !== undefined) uit.jaar = d.jaar;
  if (d.onderdeel !== undefined) uit.onderdeel = d.onderdeel;
  return uit;
}

/** Rangtelwoord in cijfers: 1ste, 2de, …, 8ste, …, 20ste. */
function rangtal(n: number): string {
  return `${n}${n === 1 || n === 8 || n >= 20 ? 'ste' : 'de'}`;
}

/** "1ste jaar" … "7de jaar". Leeg voor iets dat geen positief geheel getal is. */
export function jaarTekst(jaar: number): string {
  return Number.isInteger(jaar) && jaar >= 1 ? `${rangtal(jaar)} jaar` : '';
}

/** "1ste graad", "2de graad", "3de graad". Leeg voor iets anders. */
export function graadTekst(graad: 1 | 2 | 3): string {
  return graad === 1 || graad === 2 || graad === 3 ? `${rangtal(graad)} graad` : '';
}

/**
 * De doelgroep in één regel, voor de leerkracht:
 * - "Biologie · Natuurwetenschappen · 4de jaar" (met jaar), "Natuurwetenschappen · 2de graad" (zonder jaar);
 * - in de 1ste graad alleen de titel, want die noemt het leerjaar al: "Tweede leerjaar A: Stem-wetenschappen";
 * - buitengewoon onderwijs krijgt " · buitengewoon (OV4)" (een gewone richting in opleidingsvorm 4) of
 *   " · buitengewoon" (een richting van het buitengewoon onderwijs zelf, zonder graad).
 * `zonderVak` laat het vak weg. Saneert eerst; leeg als er geen geldige doelgroep is.
 */
export function doelgroepTekst(d: Doelgroep, opties?: { zonderVak?: boolean }): string {
  const g = sanitizeDoelgroep(d);
  if (!g) return '';
  const delen: string[] = [];
  if (g.vak && !opties?.zonderVak) delen.push(g.vak);
  delen.push(g.titel);
  if (g.graad !== undefined && g.graad !== 1) delen.push(g.jaar !== undefined ? jaarTekst(g.jaar) : graadTekst(g.graad));
  if (g.soort === 'buso') delen.push(g.graad !== undefined ? 'buitengewoon (OV4)' : 'buitengewoon');
  return delen.join(' · ');
}

/** Dezelfde richting: hetzelfde groepnummer en dezelfde soort onderwijs. Onwaar als er één ontbreekt of ongeldig is. */
export function zelfdeRichting(a: Doelgroep | undefined, b: Doelgroep | undefined): boolean {
  const x = sanitizeDoelgroep(a);
  const y = sanitizeDoelgroep(b);
  return x !== undefined && y !== undefined && x.groep === y.groep && x.soort === y.soort;
}
