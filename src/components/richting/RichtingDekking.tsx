// De sectie "Wat je cursussen samen dekken" van een richting (docs/STUDIERICHTINGEN.md § 13.4 en § 14.3): welke officiële
// minimumdoelen dekken al je cursussen voor deze richting samen, welke staan alleen gepland, en welke cursussen tellen niet mee.
//
// De berekening zelf staat in lib/dekkingMinimumdoelen.ts. Dit bestand haalt de setbestanden op (met de bestaande lader), kiest
// de cursussen die meetellen en doet de berekening één keer: `useRichtingDekking`. Het resultaat gaat naar deze sectie én naar
// de lijst "Cursussen voor deze richting" (RichtingCursussen), zodat de twee nooit van elkaar afwijken.

import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DekkingPerSet, ToonKeuze, setNamenVan } from '../course/MinimumdoelenDekking';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import type { RichtingContext } from './RichtingDoelen';
import type { Course } from '../../lib/courseTypes';
import {
  cursussenVoorRichting,
  dekkingMinimumdoelen,
  kaderDoelen,
  type CursusInDekking,
  type MdDekking,
} from '../../lib/dekkingMinimumdoelen';
import {
  EERSTE_GRAAD_ZIN,
  FOUT_SETS_DEKKING,
  KIES_JAAR_HINT,
  LADEN_SETS_DEKKING,
  cursusRegel,
  geenDekkingTekst,
  optioneelZin,
  samenvattingRichting,
  zelfdeNummerZin,
  type Toon,
} from '../../lib/dekkingWeergave';
import { jaarTekst, type Doelgroep } from '../../lib/doelgroep';
import { kaderGroepSleutel, richtingInfo, type KaderHerkomst, type RichtingInfo, type RichtingKeuze } from '../../lib/richtingKader';
import type { MatrixBestand } from '../../lib/studierichtingen';
import { getWidgets, onStorageChange } from '../../lib/storage';
import '../../styles/dekking.css';

// ── De berekening ───────────────────────────────────────────────────────────

/** Welke cursussen meetellen: alle jaren van de graad, of alleen het gekozen jaar. */
export type TelMee = 'alle' | 'jaar';

/** Een cursus in de berekening, met de titel van haar leerplan erbij (voor de reden "het leerplan verwijst niet naar minimumdoelen"). */
export interface CursusUitkomst extends CursusInDekking {
  leerplanTitel?: string;
}

export interface DekkingGegevens {
  dekking: MdDekking;
  /** Per cursus-id wat de berekening van haar zegt. Een cursus die door "Tel mee" valt, staat er niet in. */
  cursussen: ReadonlyMap<string, CursusUitkomst>;
  /** De namen van de sets voor het scherm. */
  namen: ReadonlyMap<string, string>;
  /** Het jaar waartoe de telling beperkt is (alleen bij "Alleen het <jaar>"). */
  telJaar?: number;
}

export type DekkingStand =
  /** De richting heeft geen sets in haar kader: geen dekkingsblok, alleen een eerlijke zin. */
  | { status: 'geen'; herkomst: KaderHerkomst }
  | { status: 'laden' }
  | { status: 'fout'; opnieuw: () => void }
  | { status: 'klaar'; waarde: DekkingGegevens };

/**
 * De dekking van de cursussen van een richting. De setbestanden van het kader worden geladen met `useSetBestanden`; zolang er
 * één laadt of mislukt, is er geen dekking (een ontbrekende set zou de dekking te klein maken). Een cursus telt mee als haar
 * doelgroep dezelfde `kaderGroepSleutel` heeft als de richting: in de 1ste graad horen het 1ste en het 2de jaar van een stroom
 * dus samen. `telMee === 'jaar'` telt alleen cursussen van het gekozen jaar (en cursussen zonder jaar).
 */
export function useRichtingDekking(
  { info, keuze, kader, curricula }: Pick<RichtingContext, 'info' | 'keuze' | 'kader' | 'curricula'>,
  courses: readonly Course[],
  matrix: MatrixBestand,
  vandaag: string,
  telMee: TelMee,
): DekkingStand {
  const ids = useMemo(() => kader.sets.map((k) => k.set.id), [kader]);
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);
  const mislukt = ids.filter((id) => stand(id).status === 'fout');
  const laden = ids.some((id) => stand(id).status === 'laden');
  const klaar = ids.length > 0 && !laden && mislukt.length === 0;

  // De oefeningen van dit toestel tellen mee voor wat een cursus behandelt; ze lezen opnieuw als er elders iets bewaard wordt.
  const [widgets, setWidgets] = useState(getWidgets);
  useEffect(() => onStorageChange(() => setWidgets(getWidgets())), []);

  const telJaar = telMee === 'jaar' ? keuze.jaar : undefined;
  const eigenSleutel = kaderGroepSleutel(info, kader.keuze.soort);
  const bijdragen = useMemo(() => {
    const anderen = new Map<string, RichtingInfo | undefined>();
    const hoort = (d: Doelgroep): boolean => {
      let i: RichtingInfo | undefined = info;
      if (d.groep !== info.groep.nummer) {
        if (!anderen.has(d.groep)) anderen.set(d.groep, richtingInfo(matrix, d.groep, vandaag));
        i = anderen.get(d.groep);
      }
      return i !== undefined && kaderGroepSleutel(i, d.soort) === eigenSleutel;
    };
    return cursussenVoorRichting(courses, curricula, hoort, telJaar);
  }, [courses, curricula, info, matrix, vandaag, eigenSleutel, telJaar]);

  const dekking = useMemo(
    () => (klaar ? dekkingMinimumdoelen(kaderDoelen(kader, bestanden), bijdragen, widgets) : undefined),
    [klaar, kader, bestanden, bijdragen, widgets],
  );
  const gegevens = useMemo<DekkingGegevens | undefined>(() => {
    if (!dekking) return undefined;
    const leerplanTitels = new Map(bijdragen.map((b) => [b.course.id, b.leerplan?.title]));
    const cursussen = new Map<string, CursusUitkomst>();
    for (const c of dekking.cursussen) {
      const titel = leerplanTitels.get(c.courseId);
      cursussen.set(c.courseId, titel !== undefined ? { ...c, leerplanTitel: titel } : c);
    }
    return { dekking, cursussen, namen: setNamenVan(dekking, bestanden), ...(telJaar !== undefined ? { telJaar } : {}) };
  }, [dekking, bijdragen, bestanden, telJaar]);

  if (kader.sets.length === 0) return { status: 'geen', herkomst: kader.herkomst };
  if (mislukt.length > 0) return { status: 'fout', opnieuw: () => mislukt.forEach(opnieuw) };
  if (!gegevens) return { status: 'laden' };
  return { status: 'klaar', waarde: gegevens };
}

// ── De sectie ───────────────────────────────────────────────────────────────

function TelMeeKeuze({ info, keuze, telMee, onTelMee }: {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  telMee: TelMee;
  onTelMee: (t: TelMee) => void;
}) {
  const naam = useId();
  // Een richting zonder graad (buitengewoon onderwijs) heeft geen jaren om uit te kiezen.
  if (info.graad === undefined) return null;
  return (
    <fieldset className="dk-fieldset">
      <legend>Tel mee</legend>
      <div className="dk-radios">
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={telMee === 'alle' || keuze.jaar === undefined} onChange={() => onTelMee('alle')} />
          <span>Alle jaren van de graad</span>
        </label>
        {keuze.jaar !== undefined && (
          <label className="dk-keuze">
            <input type="radio" name={naam} checked={telMee === 'jaar'} onChange={() => onTelMee('jaar')} />
            <span>Alleen het {jaarTekst(keuze.jaar)}</span>
          </label>
        )}
      </div>
      {keuze.jaar === undefined && info.jaren.length > 1 && <p className="dk-uitleg dk-uitleg-blok">{KIES_JAAR_HINT}</p>}
    </fieldset>
  );
}

function DekkingInhoud({ info, gegevens }: { info: RichtingInfo; gegevens: DekkingGegevens }) {
  const [toon, setToon] = useState<Toon>('alle');
  const { dekking, cursussen, namen, telJaar } = gegevens;
  const extra = [optioneelZin(dekking.optioneel), zelfdeNummerZin(dekking.zelfdeNummerAndereSet)].filter(Boolean);
  const nietMee = [...cursussen.values()].filter((c) => !c.telt);
  return (
    <>
      {info.graad === 1 && telJaar === undefined && <p className="dk-uitleg dk-uitleg-blok">{EERSTE_GRAAD_ZIN}</p>}
      <div aria-live="polite">
        <p className="dk-samenvatting"><strong>{samenvattingRichting(dekking, telJaar)}</strong></p>
        {extra.map((zin) => <p key={zin} className="dk-uitleg dk-extra">{zin}</p>)}
      </div>
      <ToonKeuze toon={toon} onToon={setToon} />
      <DekkingPerSet dekking={dekking} toon={toon} namen={namen} />
      {nietMee.length > 0 && (
        <div className="dk-cursussen">
          <h3>Cursussen die niet meetellen</h3>
          <ul className="dk-cursuslijst">
            {nietMee.map((c) => (
              <li key={c.courseId} className="dk-cursus">
                <Link className="dk-cursus-titel" to={`/cursus/bewerk/${encodeURIComponent(c.courseId)}`}>{c.titel}</Link>
                <span className="dk-cursus-reden">{cursusRegel(c).hoofd}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function RichtingDekking({ info, keuze, stand, telMee, onTelMee }: {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  stand: DekkingStand;
  telMee: TelMee;
  onTelMee: (t: TelMee) => void;
}) {
  return (
    <section className="ri-sectie dk" aria-labelledby="ri-dekking-kop">
      <h2 id="ri-dekking-kop">Wat je cursussen samen dekken</h2>
      {stand.status === 'geen' ? (
        <p>{geenDekkingTekst(stand.herkomst)}</p>
      ) : (
        <>
          <TelMeeKeuze info={info} keuze={keuze} telMee={telMee} onTelMee={onTelMee} />
          {stand.status === 'laden' && <LaadBericht tekst={LADEN_SETS_DEKKING} />}
          {stand.status === 'fout' && <FoutBericht fout={FOUT_SETS_DEKKING} onOpnieuw={stand.opnieuw} />}
          {stand.status === 'klaar' && <DekkingInhoud info={info} gegevens={stand.waarde} />}
        </>
      )}
    </section>
  );
}
