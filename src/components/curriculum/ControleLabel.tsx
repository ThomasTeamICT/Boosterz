// Het label "Nagekeken / Niet nagekeken / Gewijzigd na nakijken" van een leerplan: altijd icoon én
// tekst, nooit alleen kleur. De status zelf (en haar afleiding) staat in lib/leerplanStatus.ts.

import { BadgeCheck, CircleDashed, Landmark, PencilLine } from 'lucide-react';
import { BK_LABEL_KOPIE, BK_LABEL_OFFICIEEL } from '../../lib/bkWeergave';
import type { ControleStatus, Curriculum } from '../../lib/curriculumTypes';
import { STATUS_LABEL, isBkLeerplan, isSamengesteld } from '../../lib/leerplanStatus';
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

/** Waar de doelen van een officieel leerplan vandaan komen: een hele set, een zelf gekozen lijst of de competenties van beroepskwalificaties. */
export type OfficieelSoort = 'set' | 'samengesteld' | 'bk';

const OFFICIEEL_TEKST: Record<OfficieelSoort, { label: string; kopie: string }> = {
  set: { label: 'Officiële minimumdoelen', kopie: 'Kopie van officiële minimumdoelen' },
  samengesteld: { label: 'Officiële doelen, zelf gekozen', kopie: 'Kopie van officiële doelen, zelf gekozen' },
  bk: { label: BK_LABEL_OFFICIEEL, kopie: BK_LABEL_KOPIE },
};

/** Het soort officiële bron van een leerplan dat `uitOfficieleBron` is: de competenties van beroepskwalificaties, een samengestelde lijst, of een hele set. */
export function officieelSoort(cur: Curriculum): OfficieelSoort {
  if (isBkLeerplan(cur)) return 'bk';
  return isSamengesteld(cur) ? 'samengesteld' : 'set';
}

/**
 * Label voor een leerplan dat uit een officiële bron komt: een hele set ("Officiële minimumdoelen"), een lijst die de
 * leerkracht zelf samenstelde uit één of meer sets ("Officiële doelen, zelf gekozen") of de competenties van beroepskwalificaties
 * ("Officiële beroepskwalificatie"). Een eigen kopie ervan is niet meer officieel (je kan alles aanpassen): die heet dan "kopie van".
 */
export function OfficieelLabel({ eigenKopie = false, soort = 'set' }: { eigenKopie?: boolean; soort?: OfficieelSoort }) {
  const tekst = OFFICIEEL_TEKST[soort];
  return (
    <span className="badge badge-brand">
      <Landmark size={16} />
      {eigenKopie ? tekst.kopie : tekst.label}
    </span>
  );
}
