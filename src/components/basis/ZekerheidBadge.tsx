// De zekerheid van een gegeven in het basisdeel, altijd als tekst: een badge "waarschijnlijk" of "nog onzeker".
// Bij 'zeker' komt er niets.

import type { Zekerheid } from '../../lib/basis/kalender';
import { zekerheidLabel } from '../../lib/basis/momentTeksten';

export function ZekerheidBadge({ zekerheid }: { zekerheid: Zekerheid }) {
  const label = zekerheidLabel(zekerheid);
  return label ? <span className="badge badge-warn">{label}</span> : null;
}
