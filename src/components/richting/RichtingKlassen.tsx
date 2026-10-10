// De sectie "Klassen van deze richting" op het detail van een richting (docs/STUDIERICHTINGEN.md § 22.6.3 en § 22.6.4).
//
// Een klas hoort bij de richting als haar doelgroep dezelfde groep en hetzelfde soort onderwijs heeft (1A en 2A zijn twee
// richtingen). Elke klas is een link naar het klasoverzicht, met haar jaar en het aantal leerlingen, en hoeveel van de
// cursussen van de richting er als opdracht in staan. Die zin telt dezelfde cursussen als de lijst "Cursussen voor deze
// richting" erboven (alle jaren van de richting), zodat het getal en de lijst nooit van elkaar afwijken. Alleen lezen: de
// richting van een klas kies je in het klasoverzicht. Geen namen van leerlingen, alleen hun aantal.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Assignment, ClassGroup } from '../../lib/classTypes';
import { getAssignments, getClasses } from '../../lib/classes';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { klassenVanRichting } from '../../lib/doelgroepGebruik';
import {
  GEEN_KLAS_LINK,
  GEEN_KLAS_ZIN,
  KLASSEN_VAN_RICHTING_KOP,
  cursussenInKlasZin,
  cursussenVanRichting,
  klasMeta,
} from '../../lib/klasRichtingWeergave';
import type { RichtingInfo, SoortKeuze } from '../../lib/richtingKader';
import { onStorageChange } from '../../lib/storage';
import '../../styles/klasrichting.css';

export interface RichtingKlassenProps {
  info: RichtingInfo;
  soort: SoortKeuze;
  /** De cursussen en leerplannen van dit toestel, voor "2 van de 3 cursussen van deze richting staan in deze klas." */
  courses: readonly Course[];
  curricula: readonly Curriculum[];
}

/** Klassen en opdrachten van dit toestel. */
interface Opslag {
  klassen: ClassGroup[];
  opdrachten: Assignment[];
}

function leesOpslag(): Opslag {
  return { klassen: getClasses(), opdrachten: getAssignments() };
}

export function RichtingKlassen({ info, soort, courses, curricula }: RichtingKlassenProps) {
  // Klassen en opdrachten lezen opnieuw als er elders (ook in een ander tabblad) iets bewaard wordt.
  const [opslag, setOpslag] = useState<Opslag>(leesOpslag);
  useEffect(() => onStorageChange(() => setOpslag(leesOpslag())), []);

  // Dezelfde cursussen als in de lijst "Cursussen voor deze richting" (RichtingCursussen): de richting en het soort, elk jaar.
  const richtingCursussen = useMemo(
    () => cursussenVanRichting(courses, curricula, info.groep.nummer, soort),
    [courses, curricula, info.groep.nummer, soort],
  );

  const rijen = useMemo(
    () => klassenVanRichting(opslag.klassen, info.groep.nummer, soort).map((klas) => {
      const toegewezen = new Set(opslag.opdrachten.filter((a) => a.classId === klas.id && a.kind === 'course').map((a) => a.targetId));
      return {
        klas,
        meta: klasMeta({ jaar: klas.doelgroep?.jaar, heleGraad: info.graad !== undefined, leerlingen: klas.students.length }),
        zin: cursussenInKlasZin(richtingCursussen.filter((c) => toegewezen.has(c.id)).length, richtingCursussen.length),
      };
    }),
    [opslag, info.groep.nummer, info.graad, soort, richtingCursussen],
  );

  return (
    <section className="ri-sectie" aria-labelledby="ri-klassen-kop">
      <h2 id="ri-klassen-kop">{KLASSEN_VAN_RICHTING_KOP}</h2>

      {rijen.length === 0 ? (
        <p className="ri-leeg">
          {GEEN_KLAS_ZIN} <Link className="kr-link" to="/klassen">{GEEN_KLAS_LINK}</Link>
        </p>
      ) : (
        <ul className="ri-items">
          {rijen.map(({ klas, meta, zin }) => (
            <li key={klas.id} className="ri-item">
              <div className="ri-item-tekst">
                <Link className="ri-item-titel" to={`/klas/${encodeURIComponent(klas.id)}`}>{klas.name}</Link>
                <span className="ri-item-meta ri-item-blok">{meta}</span>
                {zin && <span className="ri-item-meta ri-item-blok">{zin}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
