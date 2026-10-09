// De sectie "Cursussen voor deze richting" (docs/STUDIERICHTINGEN.md § 14.3): de cursussen van de richting op dit toestel,
// een bestaande cursus koppelen, een cursus weer losmaken, en een cursus waarvan het leerplan ontbreekt aan het leerplan
// van de richting hangen.
//
// Een cursus hoort bij een richting via haar eigen doelgroep, of anders via de doelgroep van haar leerplan
// (`doelgroepVanCursus`). Bewaren gebeurt altijd met `saveCourseGuarded`: nooit iets overschrijven wat je niet zag.

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinkIcon, WarningIcon } from '../icons';
import { ConfirmModal, useToast } from '../ui';
import { CursusKoppelen, bewaarFout } from './CursusKoppelen';
import { saveCourseGuarded, type GuardedSaveResult } from '../../lib/courses';
import type { Course } from '../../lib/courseTypes';
import { deleteCurriculum, saveCurriculum } from '../../lib/curriculum';
import { buitenJaarTekst, cursusRegel } from '../../lib/dekkingWeergave';
import { jaarTekst } from '../../lib/doelgroep';
import { passendeCodes } from '../../lib/richtingCursus';
import { cursusBijRichting } from '../../lib/richtingWeergave';
import type { DekkingGegevens } from './RichtingDekking';
import {
  doelgroepVanCursus,
  leerplanVanHeleRichting,
  nietNagekekenTekst,
  type LeerplanVanRichting,
  type RichtingContext,
} from './RichtingDoelen';

type Mislukt = Exclude<GuardedSaveResult, { ok: true }>;

/** Een cursus die we aan het leerplan van de richting willen hangen, maar waarvan niet alle doelcodes erin staan. */
interface Vraag {
  course: Course;
  resultaat: LeerplanVanRichting;
  passend: number;
  totaal: number;
}

export function RichtingCursussen({ info, keuze, kader, indexSets, curricula, courses, dekking }: RichtingContext & {
  courses: readonly Course[];
  /** De dekking van de richting (dezelfde berekening als de sectie "Wat je cursussen samen dekken"); leeg zolang ze niet klaar is. */
  dekking?: DekkingGegevens;
}) {
  const toast = useToast();
  const [koppelOpen, setKoppelOpen] = useState(false);
  const [bezigId, setBezigId] = useState<string | null>(null);
  const [fout, setFout] = useState<{ id: string; tekst: string } | null>(null);
  const [vraag, setVraag] = useState<Vraag | null>(null);
  /** De kop van de sectie: na een actie waarbij de knop verdwijnt, gaat de focus hierheen. */
  const kop = useRef<HTMLHeadingElement>(null);

  const soort = kader.keuze.soort;
  const rijen = useMemo(
    () => courses
      .map((course) => {
        const doelgroep = doelgroepVanCursus(course, curricula);
        const leerplan = course.curriculumId ? curricula.find((l) => l.id === course.curriculumId) : undefined;
        return { course, doelgroep, leerplan, plaats: cursusBijRichting(course, leerplan, doelgroep) };
      })
      .filter((r) => r.doelgroep?.groep === info.groep.nummer && r.doelgroep.soort === soort)
      .sort((a, b) => a.course.title.localeCompare(b.course.title, 'nl') || (a.course.id < b.course.id ? -1 : 1)),
    [courses, curricula, info.groep.nummer, soort],
  );

  const meld = (id: string, r: Mislukt) => {
    const tekst = bewaarFout(r.reason);
    if (tekst) setFout({ id, tekst });
  };

  const haalWeg = (course: Course) => {
    setFout(null);
    const zonder: Course = { ...course };
    delete zonder.doelgroep;
    const r = saveCourseGuarded(zonder, course.updatedAt);
    if (!r.ok) {
      meld(course.id, r);
      return;
    }
    kop.current?.focus();
    toast(`‘${course.title}’ hoort niet meer bij deze richting.`, 'ok');
  };

  /** Hangt de cursus aan het leerplan; maakt en bewaart dat leerplan eerst als het nog niet bestond, en draait dat terug als de cursus niet bewaard raakt. */
  const koppelAanLeerplan = (course: Course, resultaat: LeerplanVanRichting) => {
    const nieuw = !resultaat.bestaand;
    if (nieuw && !saveCurriculum(resultaat.leerplan)) return;
    const r = saveCourseGuarded({ ...course, curriculumId: resultaat.leerplan.id }, course.updatedAt);
    if (!r.ok) {
      if (nieuw) deleteCurriculum(resultaat.leerplan.id);
      meld(course.id, r);
      return;
    }
    kop.current?.focus();
    toast(`Cursus gekoppeld aan het leerplan ‘${resultaat.leerplan.title}’.`, 'ok');
  };

  const zoekLeerplan = async (course: Course) => {
    if (bezigId !== null) return;
    setBezigId(course.id);
    setFout(null);
    try {
      const resultaat = await leerplanVanHeleRichting({ info, keuze, kader, indexSets });
      if (!resultaat.bevestigd) {
        setFout({ id: course.id, tekst: nietNagekekenTekst(resultaat.waarschuwingen) });
        return;
      }
      const { passend, totaal } = passendeCodes(course, resultaat.leerplan);
      if (passend < totaal) {
        setVraag({ course, resultaat, passend, totaal });
        return;
      }
      koppelAanLeerplan(course, resultaat);
    } catch {
      setFout({ id: course.id, tekst: 'Het leerplan van de richting kon niet gemaakt worden. Controleer je verbinding en probeer opnieuw.' });
    } finally {
      setBezigId(null);
    }
  };

  return (
    <section className="ri-sectie" aria-labelledby="ri-cursussen-kop">
      <h2 id="ri-cursussen-kop" ref={kop} tabIndex={-1}>Cursussen voor deze richting</h2>

      {rijen.length === 0 ? (
        <p className="ri-leeg">Nog geen cursussen voor deze richting.</p>
      ) : (
        <ul className="ri-items">
          {rijen.map(({ course, doelgroep, leerplan, plaats }) => {
            const meta = [
              doelgroep?.jaar !== undefined ? jaarTekst(doelgroep.jaar) : doelgroep?.graad !== undefined ? 'Hele graad' : '',
              doelgroep?.vak ?? '',
              leerplan ? `Leerplan: ${leerplan.title}` : course.curriculumId ? 'Het leerplan staat niet op dit toestel' : 'Geen leerplan',
            ].filter(Boolean).join(' · ');
            const leerplanOntbreekt = course.curriculumId !== undefined && leerplan === undefined;
            // "Telt mee voor <n> doelen" of de reden, uit de berekening van de dekking. Een cursus van een ander jaar dan het
            // jaar dat "Tel mee" kiest, zit er niet in.
            const uitkomst = dekking?.cursussen.get(course.id);
            const telt: { hoofd: string; extra?: string } | undefined = uitkomst ? cursusRegel(uitkomst) : dekking?.telJaar !== undefined ? { hoofd: buitenJaarTekst(dekking.telJaar) } : undefined;
            return (
              <li key={course.id} className="ri-item">
                <div className="ri-item-rij">
                  <div className="ri-item-tekst">
                    <Link className="ri-item-titel" to={`/cursus/bewerk/${encodeURIComponent(course.id)}`}>{course.title}</Link>
                    <span className="ri-item-meta ri-item-blok">{meta}</span>
                    {telt && <span className="ri-item-meta ri-item-blok">{telt.hoofd}</span>}
                    {telt?.extra && <span className="ri-item-meta ri-item-blok">{telt.extra}</span>}
                    {plaats.viaLeerplan && leerplan && (
                      <span className="ri-item-meta ri-item-blok">Hoort bij deze richting via het leerplan ‘{leerplan.title}’.</span>
                    )}
                  </div>
                  <div className="ri-item-knoppen">
                    {leerplanOntbreekt && (
                      <button
                        type="button" className="btn btn-sm btn-ghost ri-knop" aria-disabled={bezigId !== null ? 'true' : undefined}
                        onClick={() => void zoekLeerplan(course)}
                      >
                        <LinkIcon size={16} /> Koppel aan het leerplan van deze richting<span className="sr-only"> ({course.title})</span>
                      </button>
                    )}
                    {plaats.kanWeghalen && (
                      <button type="button" className="btn btn-sm btn-ghost ri-knop" onClick={() => haalWeg(course)}>
                        Haal weg uit deze richting<span className="sr-only"> ({course.title})</span>
                      </button>
                    )}
                  </div>
                </div>
                {bezigId === course.id && <p className="ri-bezig" role="status">De sets worden geladen en nagekeken…</p>}
                {fout?.id === course.id && (
                  <div className="callout err ri-melding" role="alert">
                    <WarningIcon size={20} className="ri-melding-icoon" />
                    <div className="ri-melding-tekst"><p>{fout.tekst}</p></div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="ri-acties">
        <button type="button" className="btn btn-ghost ri-knop" onClick={() => setKoppelOpen(true)}>
          <LinkIcon size={18} /> Koppel een bestaande cursus
        </button>
      </div>

      {koppelOpen && (
        <CursusKoppelen info={info} keuze={keuze} kader={kader} curricula={curricula} courses={courses} onClose={() => setKoppelOpen(false)} />
      )}
      {vraag && (
        <ConfirmModal
          title="Doelcodes passen niet"
          message={`${vraag.totaal - vraag.passend} van de ${vraag.totaal} doelcodes van deze cursus staan niet in dat leerplan. Toch koppelen?`}
          confirmLabel="Toch koppelen"
          danger={false}
          onConfirm={() => koppelAanLeerplan(vraag.course, vraag.resultaat)}
          onClose={() => setVraag(null)}
        />
      )}
    </section>
  );
}
