// Het kadertje "Doelen in deze sectie" dat het geraamte van een cursus op elke sectie zet (richtingCursus.ts), en het
// bijwerken ervan als de leerkracht in de editor de doelen van de sectie wijzigt.
//
// Puur en zonder netwerk of DOM. Bewaren doet de aanroeper.

import type { CourseBlock } from './courseTypes';
import { normalizeGoalCode, normalizeGoalCodes, shortGoalText } from './curriculum';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';

/** De titel van het doelenkadertje dat het geraamte zet: zo herkennen we het later terug. */
export const TITEL_DOELEN_KADERTJE = 'Doelen in deze sectie';

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

/** Het leerplandoel bij een (genormaliseerde) code: het eerste met die code, zoals `geraamteHoofdstukken` het kiest. */
function doelVoorCode(leerplan: Curriculum, code: string): CurriculumGoal | undefined {
  return leerplan.goals.find((g) => normalizeGoalCode(typeof g?.code === 'string' ? g.code : '') === code);
}

/**
 * De tekst van het doelenkadertje voor deze codes zoals het geraamte ze zet: per code een regel "<code> — <volledige zin>",
 * in de volgorde van de codes. Een code die niet in het leerplan staat, krijgt geen regel (er valt niets van te tonen).
 */
export function doelenKadertjeTekst(codes: readonly string[] | undefined, leerplan: Curriculum): string {
  return normalizeGoalCodes(codes)
    .flatMap((code) => {
      const goal = doelVoorCode(leerplan, code);
      return goal ? [doelRegel(code, goal.text)] : [];
    })
    .join('\n');
}

/** Dezelfde tekst zoals het geraamte ze tot oktober 2026 zette: de doeltekst afgekapt op `OUDE_REGEL_TEKST` tekens. */
function oudeDoelenKadertjeTekst(codes: readonly string[] | undefined, leerplan: Curriculum): string {
  return normalizeGoalCodes(codes)
    .flatMap((code) => {
      const goal = doelVoorCode(leerplan, code);
      return goal ? [`${code} — ${shortGoalText(typeof goal.text === 'string' ? goal.text : '', OUDE_REGEL_TEKST)}`] : [];
    })
    .join('\n');
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
  const gemaakt = new Set([doelenKadertjeTekst(vorigeCodes, leerplan), oudeDoelenKadertjeTekst(vorigeCodes, leerplan)]);
  const nieuw = doelenKadertjeTekst(nieuweCodes, leerplan);
  let veranderd = false;
  const uit = blokken.map((b) => {
    if (!isGeraamteKadertje(b) || !gemaakt.has(b.text) || b.text === nieuw) return b;
    veranderd = true;
    return { ...b, text: nieuw };
  });
  return veranderd ? uit : (blokken as CourseBlock[]);
}
