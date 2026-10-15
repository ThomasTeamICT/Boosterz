// Het kadertje "Doelen in deze sectie" dat het geraamte van een cursus op elke sectie zet (richtingCursus.ts), en het
// bijwerken ervan als de leerkracht in de editor de doelen van de sectie wijzigt.
//
// Puur en zonder netwerk of DOM. Bewaren doet de aanroeper.

import type { CourseBlock } from './courseTypes';
import { normalizeGoalCode, normalizeGoalCodes, shortGoalText } from './curriculum';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { TITEL_DOELEN_KADERTJE } from './doelenKadertjeTitel';

export { TITEL_DOELEN_KADERTJE };

/**
 * Tot oktober 2026 kapte het geraamte de doeltekst in dit kadertje af op zoveel tekens. Zulke kadertjes herkennen we nog
 * als "door de app gemaakt" (zie `werkDoelenKadertjeBij`); nieuwe kadertjes tonen de volledige zin.
 */
const OUDE_REGEL_TEKST = 90;

type KadertjeBlok = Extract<CourseBlock, { type: 'callout' }>;

/** Een doeltekst op één regel, met de volledige zin. */
function doelZin(text: unknown): string {
  return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
}

/** Eén regel van het kadertje: "<code> — <volledige zin>", of alleen de code als het doel geen tekst heeft. */
export function doelRegel(code: string, text: unknown): string {
  const zin = doelZin(text);
  return zin === '' ? code : `${code} — ${zin}`;
}

/** Is dit blok het doelenkadertje dat het geraamte maakt (callout, soort 'goal', titel "Doelen in deze sectie")? */
function isGeraamteKadertje(b: CourseBlock): b is KadertjeBlok {
  return !!b && typeof b === 'object' && b.type === 'callout' && b.kind === 'goal' && b.title === TITEL_DOELEN_KADERTJE;
}

/** Het eerste leerplandoel per (genormaliseerde) code, zoals `geraamteHoofdstukken` het kiest. Eén keer opgebouwd, dan een opzoeking per code. */
function doelenPerCode(leerplan: Curriculum): Map<string, CurriculumGoal> {
  const uit = new Map<string, CurriculumGoal>();
  for (const goal of leerplan.goals) {
    const code = normalizeGoalCode(typeof goal?.code === 'string' ? goal.code : '');
    if (!uit.has(code)) uit.set(code, goal);
  }
  return uit;
}

/** Per code (die in het leerplan staat) een regel, in de volgorde van de codes. Een code die niet in het leerplan staat, krijgt geen regel. */
function kadertjeRegels(
  codes: readonly string[] | undefined,
  doelen: ReadonlyMap<string, CurriculumGoal>,
  regel: (code: string, goal: CurriculumGoal) => string,
): string {
  return normalizeGoalCodes(codes)
    .flatMap((code) => {
      const goal = doelen.get(code);
      return goal ? [regel(code, goal)] : [];
    })
    .join('\n');
}

/** De regel die het geraamte voor een doel zet. */
const geraamteRegel = (code: string, goal: CurriculumGoal): string => doelRegel(code, goal.text);

/**
 * De tekst van het doelenkadertje voor deze codes zoals het geraamte ze zet: per code een regel "<code> — <volledige zin>",
 * in de volgorde van de codes. Een code die niet in het leerplan staat, krijgt geen regel (er valt niets van te tonen).
 */
export function doelenKadertjeTekst(codes: readonly string[] | undefined, leerplan: Curriculum): string {
  return kadertjeRegels(codes, doelenPerCode(leerplan), geraamteRegel);
}

/** Dezelfde tekst zoals het geraamte ze tot oktober 2026 zette: de doeltekst afgekapt op `OUDE_REGEL_TEKST` tekens. */
function oudeKadertjeTekst(codes: readonly string[] | undefined, doelen: ReadonlyMap<string, CurriculumGoal>): string {
  return kadertjeRegels(codes, doelen, (code, goal) => `${code} — ${shortGoalText(typeof goal.text === 'string' ? goal.text : '', OUDE_REGEL_TEKST)}`);
}

/**
 * Werkt het doelenkadertje van een sectie bij nadat de doelcodes van die sectie veranderden (een doel losgekoppeld of
 * toegevoegd in de editor). Geeft de blokken terug, of precies dezelfde lijst als er niets te doen is.
 *
 * Alleen een kadertje dat de app zelf maakte en dat niemand aanpaste, wordt aangeraakt. Dat bepalen we zo, zonder dat er
 * iets extra bewaard hoeft te worden: het blok is een callout van het soort 'goal' met precies de titel "Doelen in deze
 * sectie", EN zijn tekst is letterlijk wat het geraamte voor de VORIGE doelcodes van de sectie zou zetten (met volledige
 * zinnen, of afgekapt zoals oudere cursussen ze nog hebben). Wijkt er één teken af, dan typte de leerkracht erin (of
 * veranderde de codevolgorde, het leerplan of de tekst van een doel), en blijven we er met onze handen af. Ook een
 * kadertje met een andere titel of een ander soort (bv. "Kennis en vaardigheden uit de beroepskwalificatie") blijft altijd
 * ongemoeid. Zonder leerplan weten we de doelteksten niet, dus ook dan verandert er niets.
 *
 * Zijn er geen doelen meer, dan wordt de tekst van het kadertje leeg: het blok blijft staan (zodat het later weer
 * gevuld kan worden) en de leerling ziet het niet (BlockRenderer).
 */
export function werkDoelenKadertjeBij(
  blokken: readonly CourseBlock[],
  vorigeCodes: readonly string[] | undefined,
  nieuweCodes: readonly string[] | undefined,
  leerplan: Curriculum | undefined,
): CourseBlock[] {
  if (!leerplan || !Array.isArray(leerplan.goals)) return blokken as CourseBlock[];
  // Zonder kadertje van het geraamte is er niets bij te werken: dan ook geen werk voor het leerplan.
  if (!blokken.some(isGeraamteKadertje)) return blokken as CourseBlock[];
  const doelen = doelenPerCode(leerplan);
  const gemaakt = new Set([kadertjeRegels(vorigeCodes, doelen, geraamteRegel), oudeKadertjeTekst(vorigeCodes, doelen)]);
  const nieuw = kadertjeRegels(nieuweCodes, doelen, geraamteRegel);
  let veranderd = false;
  const uit = blokken.map((b) => {
    if (!isGeraamteKadertje(b) || !gemaakt.has(b.text) || b.text === nieuw) return b;
    veranderd = true;
    return { ...b, text: nieuw };
  });
  return veranderd ? uit : (blokken as CourseBlock[]);
}
