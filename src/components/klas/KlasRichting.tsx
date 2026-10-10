// De cursussen van de studierichting van een klas, in het klasoverzicht (docs/STUDIERICHTINGEN.md § 22.6.3 en § 22.6.4).
//
// Elke cursus voor de richting en het jaar van de klas staat erin, met "Staat in deze klas" of de knop "Toewijzen". Die knop
// opent "Opdracht toevoegen" met de cursus al gekozen (dat venster en het bewaren zitten in het klasoverzicht zelf: één
// bewaarpad voor een opdracht). Op vraag, in een `details`, de dekking van de richting. Dat rekent pas als het openklapt, want
// de matrix en de setbestanden zijn zwaar: wie de klas alleen bekijkt, laadt ze niet.
//
// Het getal van de dekking en de zin eronder komen uit `DekkingKort` (plaats 'klas'). De link "Bekijk per doel wat ze dekken"
// staat hier, want alleen de klas kent het jaar waarmee de richtingpagina moet openen.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { FOUT_LADEN_DEKKING, richtingLinkNaar } from '../../lib/dekkingWeergave';
import type { Doelgroep } from '../../lib/doelgroep';
import { cursussenVoorToewijzen, doelgroepVanCursus } from '../../lib/doelgroepGebruik';
import {
  CURSUSSEN_VOOR_RICHTING_KOP,
  DEKKING_BEZIG,
  DEKKING_LINK,
  DEKKING_SAMENVATTING,
  GEEN_CURSUS_LINK,
  GEEN_CURSUS_ZIN,
  STAAT_IN_KLAS,
  cursusJaarMeta,
} from '../../lib/klasRichtingWeergave';
import { AssignIcon, CheckIcon, WarningIcon } from '../icons';
import '../../styles/klasrichting.css';

// De dekking staat in een eigen chunk (ze haalt de setbestanden van het kader op). We laden die eerst los in (`laadKort`): lukt
// dat niet (offline), dan krijgt de leerkracht een melding in plaats van een fout die de hele klas wegveegt. Een tweede klik
// helpt dan niet, want de browser onthoudt de mislukte import; daarom nodigt de melding uit om de pagina te herladen.
const laadKort = () => import('../richting/DekkingKort');
const DekkingKort = lazy(() => laadKort().then((m) => ({ default: m.DekkingKort })));

type KortStand = 'dicht' | 'laden' | 'klaar' | 'fout';

export interface KlasRichtingProps {
  /** De richting en het jaar van de klas (al gesaneerd door `doelgroepVoorKlas`). */
  doelgroep: Doelgroep;
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  /** De ids van de cursussen die al als opdracht in deze klas staan. */
  inKlas: ReadonlySet<string>;
  /** "Toewijzen": het klasoverzicht opent "Opdracht toevoegen" met deze cursus gekozen. */
  onToewijzen: (course: Course) => void;
  /**
   * Na een toewijzing verdwijnt de knop "Toewijzen": het klasoverzicht geeft hier dan de cursus mee waarvan de titel de focus
   * krijgt. Een nieuw object vraagt opnieuw om focus, ook voor dezelfde cursus.
   */
  focusCursus?: { id: string } | null;
}

export function KlasRichting({ doelgroep, courses, curricula, inKlas, onToewijzen, focusCursus }: KlasRichtingProps) {
  const lijst = useRef<HTMLUListElement>(null);
  const [stand, setStand] = useState<KortStand>('dicht');

  // Wat past bij deze klas: dezelfde richting, en het jaar van de klas of een cursus zonder jaar (zie `pastBijKlas`).
  const passend = useMemo(() => cursussenVoorToewijzen(courses, curricula, doelgroep).passend, [courses, curricula, doelgroep]);
  const richtingPad = richtingLinkNaar(doelgroep);

  useEffect(() => {
    if (focusCursus) lijst.current?.querySelector<HTMLElement>(`a[data-cursus="${CSS.escape(focusCursus.id)}"]`)?.focus();
  }, [focusCursus]);

  const openen = (open: boolean) => {
    if (!open || stand !== 'dicht') return;
    setStand('laden');
    laadKort().then(() => setStand('klaar'), () => setStand('fout'));
  };

  return (
    <div className="kr-cursussen">
      <h3 className="kr-subkop">{CURSUSSEN_VOOR_RICHTING_KOP}</h3>

      {passend.length === 0 ? (
        <p className="kr-leeg">
          {GEEN_CURSUS_ZIN} <Link className="kr-link" to={richtingPad}>{GEEN_CURSUS_LINK}</Link>
        </p>
      ) : (
        <ul className="kr-lijst" ref={lijst}>
          {passend.map((course) => {
            const meta = cursusJaarMeta(doelgroepVanCursus(course, curricula));
            return (
              <li key={course.id} className="kr-rij">
                <div className="kr-rij-tekst">
                  <Link className="kr-titel" to={`/cursus/bewerk/${encodeURIComponent(course.id)}`} data-cursus={course.id}>{course.title}</Link>
                  {meta && <span className="kr-meta">{meta}</span>}
                </div>
                {inKlas.has(course.id) ? (
                  <span className="badge badge-ok kr-badge"><CheckIcon size={14} /> {STAAT_IN_KLAS}</span>
                ) : (
                  <button type="button" className="btn btn-sm btn-ghost kr-knop" onClick={() => onToewijzen(course)}>
                    <AssignIcon size={16} /> Toewijzen<span className="sr-only"> ({course.title})</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="kr-dekking" onToggle={(e) => openen(e.currentTarget.open)}>
        <summary>{DEKKING_SAMENVATTING}</summary>
        <div className="kr-dekking-inhoud">
          {stand === 'laden' && <p className="kr-bezig" role="status">{DEKKING_BEZIG}</p>}
          {stand === 'fout' && <p className="kr-fout" role="alert"><WarningIcon size={16} /> {FOUT_LADEN_DEKKING}</p>}
          {stand === 'klaar' && (
            <Suspense fallback={null}>
              <DekkingKort groep={doelgroep.groep} soort={doelgroep.soort} plaats="klas" titel={doelgroep.titel} />
            </Suspense>
          )}
          <p className="kr-dekking-link"><Link className="kr-link" to={richtingPad}>{DEKKING_LINK}</Link></p>
        </div>
      </details>
    </div>
  );
}
