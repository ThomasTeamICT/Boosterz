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

const OFFICIEEL_TEKST = {
  set: { label: 'Officiële minimumdoelen', kopie: 'Kopie van officiële minimumdoelen' },
  samengesteld: { label: 'Officiële doelen, zelf gekozen', kopie: 'Kopie van officiële doelen, zelf gekozen' },
} as const;

/**
 * Label voor een leerplan dat uit de officiële minimumdoelen komt: een hele set ("Officiële minimumdoelen") of een lijst die
 * de leerkracht zelf samenstelde uit één of meer sets ("Officiële doelen, zelf gekozen"). Een eigen kopie ervan is niet meer
 * officieel (je kan alles aanpassen): die heet dan "kopie van".
 */
export function OfficieelLabel({ eigenKopie = false, samengesteld = false }: { eigenKopie?: boolean; samengesteld?: boolean }) {
  const tekst = samengesteld ? OFFICIEEL_TEKST.samengesteld : OFFICIEEL_TEKST.set;
  return (
    <span className="badge badge-brand">
      <Landmark size={16} />
      {eigenKopie ? tekst.kopie : tekst.label}
    </span>
  );
}
