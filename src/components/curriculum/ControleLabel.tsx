// Het label "Nagekeken / Niet nagekeken / Gewijzigd na nakijken" van een leerplan: altijd icoon én
// tekst, nooit alleen kleur. De status zelf (en haar afleiding) staat in lib/leerplanStatus.ts.

import { BadgeCheck, CircleDashed, Landmark, PencilLine } from 'lucide-react';
import type { ControleStatus } from '../../lib/curriculumTypes';
import { STATUS_LABEL } from '../../lib/leerplanStatus';
import '../../styles/leerplan.css';

const ICOON = { gecontroleerd: BadgeCheck, gewijzigd: PencilLine, 'niet-gecontroleerd': CircleDashed } as const;
const KLASSE: Record<ControleStatus, string> = {
  gecontroleerd: 'badge badge-ok',
  gewijzigd: 'badge badge-warn',
  'niet-gecontroleerd': 'badge',
};

export function ControleLabel({ status }: { status: ControleStatus }) {
  const Icoon = ICOON[status];
  return (
    <span className={KLASSE[status]}>
      <Icoon size={16} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Label voor een leerplan dat uit de officiële minimumdoelen komt. Een eigen kopie ervan is niet
 * meer officieel (je kan alles aanpassen): die heet dan "kopie van".
 */
export function OfficieelLabel({ eigenKopie = false }: { eigenKopie?: boolean }) {
  return (
    <span className="badge badge-brand">
      <Landmark size={16} />
      {eigenKopie ? 'Kopie van officiële minimumdoelen' : 'Officiële minimumdoelen'}
    </span>
  );
}
