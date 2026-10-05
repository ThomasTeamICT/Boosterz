// Meldingen bij het laden van de officiële minimumdoelen: een rustige "bezig"-regel en een foutmelding
// met "Opnieuw proberen". Gedeeld door het venster MinimumdoelKiezer en de inleeswizard.

import { LoaderCircle } from 'lucide-react';
import { RetryIcon, WarningIcon } from '../icons';
import '../../styles/kiezer.css';

export function LaadBericht({ tekst }: { tekst: string }) {
  return (
    <div className="kz-status" role="status">
      <LoaderCircle size={20} className="kz-spin" aria-hidden="true" />
      <span>{tekst}</span>
    </div>
  );
}

export function FoutBericht({ fout, onOpnieuw }: { fout: string; onOpnieuw: () => void }) {
  return (
    <div className="callout err kz-fout" role="alert">
      <WarningIcon size={20} />
      <div className="kz-fout-tekst">
        <p>{fout}</p>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onOpnieuw}><RetryIcon size={16} /> Opnieuw proberen</button>
      </div>
    </div>
  );
}
