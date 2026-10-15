// De twee knoppen van de brug van een doelenlijst naar een cursus (docs/LEERPLANNEN.md § 16.4 en § 16.5): "Maak een cursus met
// deze doelen" en "Gebruik ze in een cursus die je al hebt". Ze staan in het paneel na het bewaren (NaBewaren) en op de pagina
// Leerplannen (GebruikInCursus). De vensters zelf (en wat ze zwaar maakt: richtingCursus) laden pas bij de klik.
//
// We laden het venster eerst los in (`laadNieuw`, `laadKoppel`): lukt dat niet (de verbinding viel weg), dan blijft de pagina zoals
// ze is, met een melding bij de knoppen, in plaats van dat de pagina met een fout vervangen wordt. Een mislukte dynamische import
// onthoudt de browser: een tweede klik doet dan geen nieuw verzoek, herladen wel.

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { FOUT_LADEN_VENSTER, KNOP_GEBRUIK_IN_CURSUS, KNOP_MAAK_CURSUS } from '../../../lib/cursusBrugTeksten';
import { RetryIcon, WarningIcon } from '../../icons';
import '../../../styles/cursusbrug.css';

const laadNieuw = () => import('./NieuweCursusMetLeerplan');
const laadKoppel = () => import('./KoppelAanCursus');
const NieuweCursusMetLeerplan = lazy(() => laadNieuw().then((m) => ({ default: m.NieuweCursusMetLeerplan })));
const KoppelAanCursus = lazy(() => laadKoppel().then((m) => ({ default: m.KoppelAanCursus })));

type Venster = 'nieuw' | 'koppel';

export function CursusBrugKnoppen({ leerplan }: { leerplan: Curriculum }) {
  const [open, setOpen] = useState<Venster | null>(null);
  /** Welke knop er laadt: de knop krijgt `aria-busy` en een tweede klik telt niet. */
  const [laadt, setLaadt] = useState<Venster | null>(null);
  const [fout, setFout] = useState(false);
  const bezig = useRef(false);
  const weg = useRef(false);
  useEffect(() => {
    weg.current = false;
    return () => { weg.current = true; };
  }, []);

  const toon = (welk: Venster) => {
    // Beveiligd tegen dubbel klikken: tijdens het laden telt een tweede klik niet.
    if (bezig.current) return;
    bezig.current = true;
    setFout(false);
    setLaadt(welk);
    (welk === 'nieuw' ? laadNieuw : laadKoppel)().then(
      () => {
        bezig.current = false;
        if (weg.current) return;
        setLaadt(null);
        setOpen(welk);
      },
      () => {
        bezig.current = false;
        if (weg.current) return;
        setLaadt(null);
        setFout(true);
      },
    );
  };

  return (
    <div className="cb-knoppen">
      <div className="cb-knoppen-rij">
        <button type="button" className="btn btn-primary" aria-busy={laadt === 'nieuw' || undefined} onClick={() => toon('nieuw')}>
          {KNOP_MAAK_CURSUS}
        </button>
        <button type="button" className="btn btn-ghost" aria-busy={laadt === 'koppel' || undefined} onClick={() => toon('koppel')}>
          {KNOP_GEBRUIK_IN_CURSUS}
        </button>
      </div>
      {fout && (
        <div className="callout err cb-melding" role="alert">
          <WarningIcon size={18} aria-hidden="true" />
          <div>
            <p>{FOUT_LADEN_VENSTER}</p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.location.reload()}>
              <RetryIcon size={16} aria-hidden="true" /> Herlaad de pagina
            </button>
          </div>
        </div>
      )}
      {open === 'nieuw' && (
        <Suspense fallback={null}>
          <NieuweCursusMetLeerplan leerplan={leerplan} onClose={() => setOpen(null)} />
        </Suspense>
      )}
      {open === 'koppel' && (
        <Suspense fallback={null}>
          {/* Het ene venster sluit eerst (de focus gaat terug naar de knop), dan opent het andere. */}
          <KoppelAanCursus leerplan={leerplan} onClose={() => setOpen(null)} onMaakCursus={() => { setOpen(null); toon('nieuw'); }} />
        </Suspense>
      )}
    </div>
  );
}
