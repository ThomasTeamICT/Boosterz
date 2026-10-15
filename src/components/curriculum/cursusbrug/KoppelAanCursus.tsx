// Venster "Gebruik deze doelen in een cursus" (docs/LEERPLANNEN.md § 16.5): een cursus die de leerkracht al heeft, aan een leerplan
// hangen. Per cursus op dit toestel (nieuwste eerst) staat er een keuzerondje, met eronder waar ze nu aan hangt en hoeveel van
// haar doelcodes in de lijst staan. Hangt de gekozen cursus aan een ander leerplan, dan zegt een melding wat er verandert: alleen
// de koppeling, nooit wat in de cursus staat.
//
// Koppelen gaat via `koppelCursusAanLeerplan`: de cursus wordt opnieuw gelezen, alleen `curriculumId` verandert, en het bewaren is
// bewaakt met `saveCourseGuarded`. Een cursus die intussen elders veranderde, wordt nooit overschreven. Dit bestand wordt pas bij
// de klik geladen (zie CursusBrugKnoppen).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourse, getCourses, saveCourseGuarded } from '../../../lib/courses';
import { getCurricula } from '../../../lib/curriculum';
import type { Curriculum } from '../../../lib/curriculumTypes';
import {
  andereLijstMelding, codesRegel, hangtRegel, KNOP_ANNULEREN, KNOP_KOPPEL, KNOP_MAAK_CURSUS, KNOP_OPEN_CURSUS, koppelFout,
  KOPPEL_GEEN_CURSUSSEN, KOPPEL_TITEL, KOPPEL_WELKE, NOG_NODIG_CURSUS, toastGekoppeld,
} from '../../../lib/cursusBrugTeksten';
import { koppelCursusAanLeerplan, koppelRijen } from '../../../lib/richtingCursus';
import { WarningIcon } from '../../icons';
import { Modal, useToast } from '../../ui';
import '../../../styles/richtingcursus.css';
import '../../../styles/cursusbrug.css';

const NODIG_ID = 'cb-koppel-nodig';

export function KoppelAanCursus({ leerplan, onClose, onMaakCursus }: {
  leerplan: Curriculum;
  onClose: () => void;
  /** Er zijn geen cursussen: de knop "Maak een cursus met deze doelen" opent het andere venster. */
  onMaakCursus: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  // De cursussen en de leerplannen worden gelezen bij het openen; wat intussen elders verandert, vangt het koppelen op
  // (het leest de cursus opnieuw).
  const [rijen] = useState(() => koppelRijen(getCourses(), getCurricula(), leerplan));
  const [gekozenId, setGekozenId] = useState<string | null>(null);
  const [fout, setFout] = useState('');
  const bezig = useRef(false);
  /** Blijft staan na een geslaagde actie (zie NieuweCursusMetLeerplan): een tweede klik op de oude handler doet niets meer. */
  const gedaan = useRef(false);
  const foutRef = useRef<HTMLDivElement>(null);
  const eersteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!fout) return;
    foutRef.current?.scrollIntoView?.({ block: 'nearest' });
    foutRef.current?.focus();
  }, [fout]);

  const gekozen = useMemo(() => rijen.find((r) => r.course.id === gekozenId), [rijen, gekozenId]);
  const ontbreekt = gekozen === undefined;

  const koppel = () => {
    if (bezig.current || gedaan.current) return;
    if (!gekozen) {
      eersteRef.current?.focus();
      return;
    }
    // Hangt ze al aan deze lijst, dan is er niets te koppelen: de knop heet "Open de cursus".
    if (gekozen.dezeLijst) {
      gedaan.current = true;
      navigate(`/cursus/bewerk/${gekozen.course.id}`);
      return;
    }
    bezig.current = true;
    setFout('');
    try {
      const r = koppelCursusAanLeerplan({ courseId: gekozen.course.id, leerplanId: leerplan.id }, { getCourse, saveCourseGuarded });
      if (!r.ok) {
        setFout(koppelFout(r.reden));
        return;
      }
      gedaan.current = true;
      toast(toastGekoppeld(r.course.title, leerplan.title), 'ok');
      navigate(`/cursus/bewerk/${r.course.id}`);
    } finally {
      bezig.current = false;
    }
  };

  return (
    <Modal
      title={KOPPEL_TITEL}
      onClose={onClose}
      wide
      footer={(
        <div className="rc-voet">
          {rijen.length > 0 && ontbreekt && <p id={NODIG_ID} className="rc-nodig">{NOG_NODIG_CURSUS}</p>}
          <div className="rc-voet-knoppen">
            <button type="button" className="btn btn-ghost rc-knop" onClick={onClose}>{KNOP_ANNULEREN}</button>
            {rijen.length > 0 && (
              <button
                type="button" className="btn btn-primary rc-knop" aria-disabled={ontbreekt ? 'true' : undefined}
                aria-describedby={ontbreekt ? NODIG_ID : undefined} onClick={koppel}
              >
                {gekozen?.dezeLijst ? KNOP_OPEN_CURSUS : KNOP_KOPPEL}
              </button>
            )}
          </div>
        </div>
      )}
    >
      <div className="rc">
        {rijen.length === 0 ? (
          <>
            <p className="cb-leeg">{KOPPEL_GEEN_CURSUSSEN}</p>
            <button type="button" className="btn btn-primary rc-knop" onClick={onMaakCursus}>{KNOP_MAAK_CURSUS}</button>
          </>
        ) : (
          <>
            <fieldset className="rc-groep">
              <legend>{KOPPEL_WELKE}</legend>
              <ul className="cb-cursussen">
                {rijen.map((r, i) => (
                  <li key={r.course.id}>
                    <label className="cb-cursus">
                      <input
                        ref={i === 0 ? eersteRef : undefined} type="radio" name="cb-cursus" checked={gekozenId === r.course.id}
                        onChange={() => { setGekozenId(r.course.id); setFout(''); }}
                      />
                      <span className="cb-cursus-tekst">
                        <span className="cb-cursus-titel">{r.course.title}</span>
                        <span className="cb-cursus-meta">{hangtRegel({ dezeLijst: r.dezeLijst, oud: r.oud })}</span>
                        {r.codes && <span className="cb-cursus-meta">{codesRegel(r.codes.passend, r.codes.totaal)}</span>}
                      </span>
                    </label>
                    {/* Een vaste plaats onder elke cursus: de melding verschijnt onder de gekozen cursus (ook op een smal scherm in
                        beeld) en een schermlezer leest ze voor zodra ze verschijnt. */}
                    <div className="cb-melding-rij" aria-live="polite" aria-atomic="true">
                      {gekozenId === r.course.id && r.oud !== undefined && (
                        <div className="callout warn rc-melding">
                          <WarningIcon size={18} />
                          <p>{andereLijstMelding(r.oud, leerplan.title)}</p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          </>
        )}
        {fout && (
          <div className="callout err rc-melding" role="alert" tabIndex={-1} ref={foutRef}>
            <WarningIcon size={18} />
            <p>{fout}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
