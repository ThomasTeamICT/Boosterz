import { Modal } from '../ui';
import type { Doelgroep } from '../../lib/doelgroep';

/**
 * Venster "Studierichting van deze cursus" (docs/STUDIERICHTINGEN.md § 12.3 en § 14.5).
 *
 * STUB van de hoofdsessie (I2): de props liggen vast, zodat het richtingenscherm (P8) en de cursushulp (P9)
 * parallel gebouwd kunnen worden. P9 vervangt de inhoud; de props blijven exact zo.
 */
export interface RichtingKiezerModalProps {
  titel: string;
  huidig: Doelgroep | undefined;
  onKies: (d: Doelgroep | undefined) => void;
  onClose: () => void;
}

export function RichtingKiezerModal({ titel, onClose }: RichtingKiezerModalProps) {
  return (
    <Modal title={titel} onClose={onClose}>
      <p>Hier kies je straks de studierichting en het jaar.</p>
    </Modal>
  );
}
