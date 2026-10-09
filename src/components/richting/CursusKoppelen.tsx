// Venster "Bestaande cursus koppelen" (docs/STUDIERICHTINGEN.md § 14.3): een cursus zonder studierichting aan deze richting
// hangen, met een jaar. De cursussen die de meeste doelen van de richting raken, staan bovenaan.
//
// Bewaren gebeurt met `saveCourseGuarded` op de versie die de leerkracht zag: is de cursus intussen elders aangepast, dan
// wordt er niets overschreven.

import { useMemo, useState } from 'react';
import { Field, Modal, useToast } from '../ui';
import { WarningIcon } from '../icons';
import { saveCourseGuarded } from '../../lib/courses';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { jaarTekst } from '../../lib/doelgroep';
import { doelgroepVan } from '../../lib/richtingKader';
import { aantalDoelen, doelgroepVanCursus, kaderSleutelsVan, raaktDoelen, type RichtingContext } from './RichtingDoelen';

/** De melding bij een bewaarpoging die niet lukte; leeg als de opslaglaag het zelf meldt (volle opslag). */
export function bewaarFout(reden: 'gewijzigd' | 'verwijderd' | 'mislukt'): string {
  if (reden === 'gewijzigd') return 'Deze cursus werd intussen elders aangepast. Probeer opnieuw.';
  if (reden === 'verwijderd') return 'Deze cursus bestaat niet meer.';
  return '';
}

export function CursusKoppelen({
  info, keuze, kader, curricula, courses, onClose,
}: Pick<RichtingContext, 'info' | 'keuze' | 'kader' | 'curricula'> & { courses: readonly Course[]; onClose: () => void }) {
  const toast = useToast();
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [jaar, setJaar] = useState(keuze.jaar !== undefined ? String(keuze.jaar) : '');
  const [fout, setFout] = useState('');
  const [geprobeerd, setGeprobeerd] = useState(false);

  const kaderSleutels = useMemo(() => kaderSleutelsVan(kader), [kader]);
  const kandidaten = useMemo(
    () => courses
      .filter((c) => doelgroepVanCursus(c, curricula) === undefined)
      .map((c) => ({ c, raakt: raaktDoelen(c, curricula.find((l: Curriculum) => l.id === c.curriculumId), kaderSleutels) }))
      .sort((a, b) => b.raakt - a.raakt || a.c.title.localeCompare(b.c.title, 'nl')),
    [courses, curricula, kaderSleutels],
  );
  // In de 1ste graad (en bij een zevende jaar) volgt het jaar uit de richting: dan is er niets te kiezen.
  const kiesJaar = info.graad !== undefined && info.jaren.length > 1;

  const koppel = () => {
    const kandidaat = kandidaten.find((k) => k.c.id === gekozen);
    if (!kandidaat) {
      setGeprobeerd(true);
      return;
    }
    const gekozenJaar = kiesJaar ? (jaar === '' ? undefined : Number(jaar)) : keuze.jaar;
    const doelgroep = doelgroepVan(info, {
      groep: info.groep.nummer,
      soort: kader.keuze.soort,
      ...(gekozenJaar !== undefined ? { jaar: gekozenJaar } : {}),
      ...(keuze.onderdeel !== undefined ? { onderdeel: keuze.onderdeel } : {}),
    });
    const r = saveCourseGuarded({ ...kandidaat.c, doelgroep }, kandidaat.c.updatedAt);
    if (!r.ok) {
      setFout(bewaarFout(r.reason));
      return;
    }
    toast(`Cursus gekoppeld aan ${info.groep.titel}.`, 'ok');
    onClose();
  };

  const ontbreekt = gekozen === null;
  return (
    <Modal
      title="Bestaande cursus koppelen"
      onClose={onClose}
      footer={kandidaten.length === 0 ? (
        <button type="button" className="btn btn-ghost" onClick={onClose}>Sluiten</button>
      ) : (
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button
            type="button" className="btn btn-primary ri-knop" aria-disabled={ontbreekt ? 'true' : undefined}
            aria-describedby={ontbreekt ? 'ri-koppel-ontbreekt' : undefined} onClick={koppel}
          >
            Koppel
          </button>
        </>
      )}
    >
      {/* Het venster staat via een portal buiten .ri-page: de regels voor smalle schermen hangen aan deze klasse. */}
      <div className="ri-venster">
        {kandidaten.length === 0 ? (
          <p>Er zijn geen cursussen zonder richting.</p>
        ) : (
          <>
            <p className="ri-uitleg">Kies een cursus zonder studierichting. De cursussen die de meeste doelen van deze richting raken, staan bovenaan.</p>
            <fieldset className="ri-fieldset">
              <legend>Welke cursus?</legend>
              <ul className="ri-cursuskeuzes">
                {kandidaten.map(({ c, raakt }) => (
                  <li key={c.id}>
                    <label className="ri-cursuskeuze">
                      <input type="radio" name="ri-cursus" checked={gekozen === c.id} onChange={() => { setGekozen(c.id); setFout(''); }} />
                      <span className="ri-cursuskeuze-tekst">
                        <span className="ri-cursuskeuze-titel">{c.title}</span>
                        <span className="ri-cursuskeuze-meta">raakt {aantalDoelen(raakt)} van deze richting</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            {kiesJaar && (
              <Field label="Jaar">
                <select className="select" value={jaar} onChange={(e) => setJaar(e.target.value)}>
                  <option value="">Hele graad</option>
                  {info.jaren.map((j) => <option key={j} value={String(j)}>{jaarTekst(j)}</option>)}
                </select>
              </Field>
            )}
            {ontbreekt && <p id="ri-koppel-ontbreekt" className="ri-ontbreekt" role={geprobeerd ? 'alert' : undefined}>Nog nodig: kies een cursus.</p>}
          </>
        )}
        {fout && (
          <div className="callout err ri-melding" role="alert">
            <WarningIcon size={20} className="ri-melding-icoon" />
            <div className="ri-melding-tekst"><p>{fout}</p></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
