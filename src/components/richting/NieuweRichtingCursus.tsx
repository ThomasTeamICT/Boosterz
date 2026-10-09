import { Modal } from '../ui';
import type { RichtingInfo, RichtingKader, RichtingKeuze } from '../../lib/richtingKader';
import { graadTekst, jaarTekst } from '../../lib/doelgroep';

/**
 * Venster "Nieuwe cursus voor deze richting" (docs/STUDIERICHTINGEN.md § 12.3 en § 14.4).
 *
 * STUB van de hoofdsessie (I2): de props liggen vast, zodat het richtingenscherm (P8) en de cursushulp (P9)
 * parallel gebouwd kunnen worden. P9 vervangt de inhoud; de props blijven exact zo.
 */
export interface NieuweRichtingCursusProps {
  info: RichtingInfo;
  kader: RichtingKader;
  keuze: RichtingKeuze;
  onClose: () => void;
}

export function NieuweRichtingCursus({ info, keuze, onClose }: NieuweRichtingCursusProps) {
  const wanneer = keuze.jaar !== undefined ? jaarTekst(keuze.jaar) : info.graad !== undefined ? graadTekst(info.graad) : '';
  return (
    <Modal title={`Nieuwe cursus voor ${info.groep.titel}${wanneer ? ` · ${wanneer}` : ''}`} onClose={onClose}>
      <p>Hier kies je straks welke doelen deze cursus behandelt.</p>
    </Modal>
  );
}
