// Venster om sets minimumdoelen te kiezen voor een leerplan dat er nog geen heeft. Nodig voor "Verwijzing
// toevoegen" in de editor van een leerplan: eerst weet het leerplan uit welke sets het kan verwijzen. Zonder
// zoekterm staan de sets die bij het vak, de graad en de stroom van het leerplan passen bovenaan (zoals in de
// inleeswizard: sets die het vak noemen eerst, ook de sleutelcompetentie die erbij hoort); met een zoekterm
// zoek je in alle sets. Bij elke set staat of ze nog geldt. (De inleeswizard heeft een uitgebreidere stap 3; dit is
// de korte weg.)

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { SOORT_LABEL, contextVanSet, filterSets, geldigheidVan, laadIndex, laadSet, oudeVersieIds, soortVanSet } from '../../lib/minimumdoelenBron';
import { geldigheidVoorLijst, kandidaatSets } from '../../lib/setKeuze';
import { useLaadstand } from '../../lib/useLaadstand';
import { Field, Modal } from '../ui';
import { FoutBericht, LaadBericht } from './LaadStatus';
import '../../styles/kiezer.css';

const MAX_GETOOND = 40;
/** Zoveel bestanden tegelijk ophalen om de geldigheid af te leiden (als de index ze niet kent). */
const LAAD_PER_KEER = 10;

function kenmerken(set: MinimumdoelenIndexSet): string {
  const soort = soortVanSet(set.naam);
  return [soort === 'so' ? '' : SOORT_LABEL[soort], set.graad, set.stroom, contextVanSet(set.naam)].filter(Boolean).join(' · ');
}

export function SetsKiezen({
  graad, stroom, vak, gekozen, wizardLink, onKies, onClose,
}: {
  /** Graad en stroom van het leerplan, om passende sets bovenaan te zetten. Leeg = niet filteren. */
  graad: string;
  stroom: string;
  /** Het vak van het leerplan: sets die het vak noemen (of de sleutelcompetentie ervan) komen eerst. */
  vak: string;
  gekozen: readonly string[];
  /** Waar de leerkracht het hele leerplan kan inlezen en koppelen, als alternatief. */
  wizardLink?: string;
  onKies: (setIds: string[]) => void;
  onClose: () => void;
}) {
  const { stand, opnieuw } = useLaadstand('index', laadIndex);
  const [zoek, setZoek] = useState('');
  const [aangevinkt, setAangevinkt] = useState<readonly string[]>(gekozen);
  // De sets die het leerplan al heeft, als tekst: de aanroeper geeft bij elke render een nieuwe lijst.
  const eigenSleutel = gekozen.join('|');

  const lijst = useMemo(() => {
    if (stand.status !== 'klaar') return [];
    const sets = stand.waarde.sets;
    if (zoek.trim()) return filterSets(sets, { zoek, geldigheid: 'alle', graad: '', soort: 'alle' });
    return kandidaatSets(sets, { graad, stroom, onderwijs: 'so', vak, eigen: eigenSleutel === '' ? [] : eigenSleutel.split('|') });
  }, [stand, zoek, graad, stroom, vak, eigenSleutel]);
  const getoond = useMemo(() => lijst.slice(0, MAX_GETOOND), [lijst]);
  const oudeVersies = useMemo(() => oudeVersieIds(stand.status === 'klaar' ? stand.waarde.sets : []), [stand]);

  // Kent de index de geldigheid van een set niet (oudere index), dan leiden we ze af uit het bestand van de set,
  // zoals de wizard dat doet. Alleen voor wat op het scherm staat.
  const [bestanden, setBestanden] = useState<ReadonlyMap<string, MinimumdoelenSetBestand>>(() => new Map());
  // Een set die niet te laden was, proberen we niet telkens opnieuw: de geldigheid blijft dan gewoon leeg.
  const [mislukt, setMislukt] = useState<ReadonlySet<string>>(() => new Set());
  const teLaden = getoond
    .filter((s) => geldigheidVan(s) === undefined && !bestanden.has(s.id) && !mislukt.has(s.id))
    .map((s) => s.id)
    .join('|');
  useEffect(() => {
    if (teLaden === '') return;
    let weg = false;
    const ids = teLaden.split('|');
    void (async () => {
      for (let i = 0; i < ids.length; i += LAAD_PER_KEER) {
        const groep = ids.slice(i, i + LAAD_PER_KEER);
        const uitkomsten = await Promise.allSettled(groep.map((id) => laadSet(id)));
        if (weg) return;
        setBestanden((vorige) => {
          const m = new Map(vorige);
          groep.forEach((id, j) => {
            const u = uitkomsten[j];
            if (u.status === 'fulfilled') m.set(id, u.value);
          });
          return m;
        });
        const gefaald = groep.filter((_, j) => uitkomsten[j].status === 'rejected');
        if (gefaald.length > 0) setMislukt((vorige) => new Set([...vorige, ...gefaald]));
      }
    })();
    return () => { weg = true; };
  }, [teLaden]);

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
          <Field
            label="Zoek een set"
            hint="Op naam, korte naam of nummer (bv. ruimtelijk of ODS_3287). Leeg laten toont de sets bij het vak en de graad van je leerplan."
          >
            <input
              type="search" className="input" value={zoek} autoComplete="off" spellCheck={false} autoFocus
              onChange={(e) => setZoek(e.target.value)}
            />
          </Field>
          <p className="kz-aantal" aria-live="polite" aria-atomic="true">
            {lijst.length === 0 ? 'Geen sets gevonden' : `${lijst.length} ${lijst.length === 1 ? 'set' : 'sets'} gevonden`} · {aangevinkt.length} gekozen
          </p>
          {lijst.length === 0 ? (
            <div className="kz-leeg"><p>Geen sets die hierbij passen. Probeer een kortere zoekterm.</p></div>
          ) : (
            <ul className="kz-sets">
              {getoond.map((s) => {
                const g = geldigheidVoorLijst(s, bestanden.get(s.id));
                const oud = g.code === 'N' || oudeVersies.has(s.id);
                const kenmerk = kenmerken(s);
                return (
                  <li key={s.id}>
                    <label className="kz-setrij">
                      <input type="checkbox" checked={aangevinkt.includes(s.id)} onChange={() => wissel(s.id)} />
                      <span className="kz-settekst">
                        <span className="kz-setnaam">{s.korteNaam || s.naam}{oud ? ' (oude versie)' : ''}</span>
                        <span className="kz-setmeta">
                          {kenmerk && `${kenmerk} · `}
                          {g.tekst && <span className={oud ? 'kz-oud' : undefined}>{g.tekst}</span>}
                          {g.tekst && ' · '}
                          {s.id}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
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
