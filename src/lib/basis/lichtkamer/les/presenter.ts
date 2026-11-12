// De presentertoetsen op het digibord. Zuiver: uit (toets, soort gefocust element, toestand) volgt een actie of niets.
//
// PageDown en PageUp gaan naar de volgende of vorige oefening, ook als een knop de focus heeft. Spatie toont de
// uitkomst, maar alleen als geen knop, link of invoerveld de focus heeft (daar doet spatie al iets). In een
// invoerveld doet geen enkele presentertoets iets. Zo kan de leerkracht met een presenter bladeren zonder dat een
// getypt getal of een tikje op een knop verstoord wordt.

import type { LesOefening } from '../lesmateriaal';
import { OEFENING_VOLGORDE } from './teksten';

export type FocusSoort = 'geen' | 'knop' | 'link' | 'invoer' | 'tab' | 'overig';

export type PresenterContext = {
  stand: 'kind' | 'bord' | 'uitproberen';
  /** De oefening in beeld, of null (bv. een keuzescherm). */
  oefening: LesOefening | null;
  /** De uitkomst van de oefening is al getoond. */
  uitkomstGetoond: boolean;
};

export type PresenterActie = { type: 'volgende-oefening' } | { type: 'vorige-oefening' } | { type: 'toon-uitkomst' };

/** Vertaalt een gefocust element naar zijn soort; de component leest tag, rol en bewerkbaarheid uit het DOM. */
export function focusSoort(tag: string | null | undefined, rol: string | null | undefined, bewerkbaar: boolean): FocusSoort {
  const t = (tag ?? '').toLowerCase();
  if (bewerkbaar || t === 'input' || t === 'select' || t === 'textarea') return 'invoer';
  if (rol === 'tab') return 'tab';
  if (t === 'button' || t === 'summary' || rol === 'button' || rol === 'switch' || rol === 'checkbox' || rol === 'radio') return 'knop';
  if (t === 'a' || rol === 'link') return 'link';
  if (t === '' || t === 'body' || t === 'html') return 'geen';
  return 'overig';
}

export function presenterActie(toets: string, focus: FocusSoort, ctx: PresenterContext): PresenterActie | null {
  if (ctx.stand !== 'bord') return null;
  if (focus === 'invoer') return null;
  if (toets === 'PageDown') return { type: 'volgende-oefening' };
  if (toets === 'PageUp') return { type: 'vorige-oefening' };
  if (toets === ' ' || toets === 'Spacebar') {
    if (focus !== 'geen' && focus !== 'overig') return null;
    return ctx.oefening === 'waar-valt-de-schaduw' && !ctx.uitkomstGetoond ? { type: 'toon-uitkomst' } : null;
  }
  return null;
}

/** De volgende of vorige oefening, rond: na de laatste komt weer de eerste (zoals in het prototype). */
export function naastOefening(huidig: LesOefening | null, richting: 'volgende' | 'vorige'): LesOefening {
  const n = OEFENING_VOLGORDE.length;
  const i = huidig ? OEFENING_VOLGORDE.indexOf(huidig) : -1;
  if (i < 0) return OEFENING_VOLGORDE[richting === 'volgende' ? 0 : n - 1] as LesOefening;
  return OEFENING_VOLGORDE[(i + (richting === 'volgende' ? 1 : n - 1)) % n] as LesOefening;
}
