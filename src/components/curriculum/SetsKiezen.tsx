// Venster om sets minimumdoelen te kiezen voor een leerplan dat er nog geen heeft. Nodig voor "Verwijzing
// toevoegen" in de editor van een leerplan: eerst weet het leerplan uit welke sets het kan verwijzen. Zonder
// zoekterm staan de sets die bij de graad en stroom van het leerplan passen bovenaan; met een zoekterm
// zoek je in alle sets. (De inleeswizard heeft een uitgebreidere stap 3; dit is de korte weg.)

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { SOORT_LABEL, contextVanSet, filterSets, geldigheidTekst, laadIndex, soortVanSet } from '../../lib/minimumdoelenBron';
import { stelSetsVoor } from '../../lib/minimumdoelVerwijzing';
import { useLaadstand } from '../../lib/useLaadstand';
import { Field, Modal } from '../ui';
import { FoutBericht, LaadBericht } from './LaadStatus';
import '../../styles/kiezer.css';

const MAX_GETOOND = 40;

function meta(set: MinimumdoelenIndexSet): string {
  const soort = soortVanSet(set.naam);
  return [soort === 'so' ? '' : SOORT_LABEL[soort], set.graad, set.stroom, contextVanSet(set.naam), geldigheidTekst(set), set.id].filter(Boolean).join(' · ');
}

export function SetsKiezen({
  graad, stroom, gekozen, wizardLink, onKies, onClose,
}: {
  /** Graad en stroom van het leerplan, om passende sets bovenaan te zetten. Leeg = niet filteren. */
  graad: string;
  stroom: string;
  gekozen: readonly string[];
  /** Waar de leerkracht het hele leerplan kan inlezen en koppelen, als alternatief. */
  wizardLink?: string;
  onKies: (setIds: string[]) => void;
  onClose: () => void;
}) {
  const { stand, opnieuw } = useLaadstand('index', laadIndex);
  const [zoek, setZoek] = useState('');
  const [aangevinkt, setAangevinkt] = useState<readonly string[]>(gekozen);

  const lijst = useMemo(() => {
    if (stand.status !== 'klaar') return [];
    const sets = stand.waarde.sets;
    if (zoek.trim()) return filterSets(sets, { zoek, geldigheid: 'alle', graad: '', soort: 'alle' });
    return stelSetsVoor(sets, { graad, stroom }).filter((s) => soortVanSet(s.naam) === 'so');
  }, [stand, zoek, graad, stroom]);

  const wissel = (id: string) => setAangevinkt((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  return (
    <Modal
      title="Kies de sets met minimumdoelen"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button type="button" className="btn btn-primary" disabled={aangevinkt.length === 0} onClick={() => onKies([...aangevinkt])}>
            Sets bewaren ({aangevinkt.length})
          </button>
        </>
      }
    >
      <p className="kz-uitleg">
        Kies de sets waar dit leerplan naar verwijst. Daarna kan je bij elk doel de minimumdoelen aanwijzen.
        {wizardLink && <> Liever het hele leerplan inlezen en laten koppelen? Gebruik dan <Link to={wizardLink}>Nakijken en bevestigen</Link>.</>}
      </p>
      {stand.status === 'laden' && <LaadBericht tekst="De sets worden geladen…" />}
      {stand.status === 'fout' && <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />}
      {stand.status === 'klaar' && (
        <>
          <Field label="Zoek een set" hint="Op naam, korte naam of nummer (bv. ruimtelijk of ODS_3287). Leeg laten toont de sets bij de graad van je leerplan.">
            <input type="search" className="input" value={zoek} autoComplete="off" spellCheck={false} onChange={(e) => setZoek(e.target.value)} />
          </Field>
          <p className="kz-aantal" aria-live="polite" aria-atomic="true">
            {lijst.length === 0 ? 'Geen sets gevonden' : `${lijst.length} ${lijst.length === 1 ? 'set' : 'sets'} gevonden`} · {aangevinkt.length} gekozen
          </p>
          {lijst.length === 0 ? (
            <div className="kz-leeg"><p>Geen sets die hierbij passen. Probeer een kortere zoekterm.</p></div>
          ) : (
            <ul className="kz-sets">
              {lijst.slice(0, MAX_GETOOND).map((s) => (
                <li key={s.id}>
                  <label className="kz-setrij">
                    <input type="checkbox" checked={aangevinkt.includes(s.id)} onChange={() => wissel(s.id)} />
                    <span className="kz-settekst">
                      <span className="kz-setnaam">{s.korteNaam || s.naam}</span>
                      <span className="kz-setmeta">{meta(s)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {lijst.length > MAX_GETOOND && (
            <p className="hint">Alleen de eerste {MAX_GETOOND} sets staan hier. Zoek preciezer om de juiste te vinden.</p>
          )}
        </>
      )}
    </Modal>
  );
}
