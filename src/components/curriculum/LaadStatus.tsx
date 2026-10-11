// Meldingen bij het laden van de officiële minimumdoelen: een rustige "bezig"-regel en een foutmelding
// met "Opnieuw proberen". Gedeeld door het venster MinimumdoelKiezer en de inleeswizard.

import { LoaderCircle } from 'lucide-react';
import { RetryIcon, WarningIcon } from '../icons';
import '../../styles/kiezer.css';

/**
 * `melden={false}`: de regel is er alleen om te zien, zonder `role="status"`. Voor een regel die naast een andere statusregel
 * staat (bv. één per kaart in een lijst, onder de statusregel van de lijst zelf).
 */
export function LaadBericht({ tekst, melden = true }: { tekst: string; melden?: boolean }) {
  return (
    <div className="kz-status" role={melden ? 'status' : undefined}>
      <LoaderCircle size={20} className="kz-spin" aria-hidden="true" />
      <span>{tekst}</span>
    </div>
  );
}

/**
 * `naam`: waarover de fout gaat, als er meer foutmeldingen naast elkaar staan (één per kaart). Een schermlezer hoort die naam
 * achter "Opnieuw proberen" ("Opnieuw proberen (Onthaalmedewerker)"), zodat de knoppen uit elkaar te houden zijn.
 */
export function FoutBericht({ fout, onOpnieuw, naam }: { fout: string; onOpnieuw: () => void; naam?: string }) {
  const srNaam = typeof naam === 'string' ? naam.trim() : '';
  return (
    <div className="callout err kz-fout" role="alert">
      <WarningIcon size={20} />
      <div className="kz-fout-tekst">
        <p>{fout}</p>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onOpnieuw}><RetryIcon size={16} /> Opnieuw proberen{srNaam !== '' && <span className="sr-only"> ({srNaam})</span>}</button>
      </div>
    </div>
  );
}
