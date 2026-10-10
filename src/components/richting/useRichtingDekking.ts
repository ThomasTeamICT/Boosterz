// De berekening van "Wat je cursussen samen dekken" voor één richting (docs/STUDIERICHTINGEN.md § 13.4, § 14.3 en § 22.5).
// Ze staat apart van de sectie (RichtingDekking.tsx), zodat het detail, de lijst "Cursussen voor deze richting", het venster
// om gaten te dichten en het overzicht "Mijn richtingen" dezelfde berekening gebruiken: de getallen wijken nooit af.
//
// Welke cursussen meetellen, rekent `bijdragenVoorKader` (lib/richtingOverzicht.ts). Bij "Alle jaren van de graad" komen de
// getallen ook in de cache van het overzicht (lib/dekkingCache.ts), zodat de lijst ze meteen toont als je terugkeert.

import { useEffect, useMemo, useState } from 'react';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import type { RichtingContext } from './RichtingDoelen';
import type { Course } from '../../lib/courseTypes';
import { bewaarDekkingKort, dekkingGeneratie } from '../../lib/dekkingCache';
import {
  dekkingMinimumdoelen,
  kaderDoelen,
  type CursusBijdrage,
  type CursusInDekking,
  type MdDekking,
} from '../../lib/dekkingMinimumdoelen';
import type { MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { kaderGroepSleutel, type KaderHerkomst, type RichtingKader } from '../../lib/richtingKader';
import { bijdragenVoorKader, kortVan } from '../../lib/richtingOverzicht';
import { setNamenVan } from '../../lib/setNamen';
import type { MatrixBestand } from '../../lib/studierichtingen';
import { getWidgets, onStorageChange } from '../../lib/storage';

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
  /** De cursussen die meetellen, met hun leerplan (fase 2: gaten dichten op een bestaande cursus). */
  bijdragen: readonly CursusBijdrage[];
  /** De setbestanden van het kader, al geladen (fase 2: een leerplan voor de gaten zonder nieuwe verzoeken). */
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>;
  /** Het kader waarover gerekend is. */
  kader: RichtingKader;
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
  const soort = kader.keuze.soort;
  const bijdragen = useMemo(
    () => bijdragenVoorKader({ courses, curricula, info, soort, matrix, vandaag, ...(telJaar !== undefined ? { jaar: telJaar } : {}) }),
    [courses, curricula, info, soort, matrix, vandaag, telJaar],
  );

  // De generatie van de cache bij het begin van de berekening: veranderde de opslag intussen, dan wordt de uitkomst niet bewaard.
  const berekend = useMemo(
    () => (klaar ? { dekking: dekkingMinimumdoelen(kaderDoelen(kader, bestanden), bijdragen, widgets), generatie: dekkingGeneratie() } : undefined),
    [klaar, kader, bestanden, bijdragen, widgets],
  );
  const dekking = berekend?.dekking;

  const sleutel = kaderGroepSleutel(info, soort);
  const eersteGraad = info.graad === 1;
  useEffect(() => {
    if (!berekend || telMee !== 'alle') return;
    bewaarDekkingKort(sleutel, kortVan(berekend.dekking, eersteGraad), berekend.generatie);
  }, [berekend, telMee, sleutel, eersteGraad]);

  const gegevens = useMemo<DekkingGegevens | undefined>(() => {
    if (!dekking) return undefined;
    const leerplanTitels = new Map(bijdragen.map((b) => [b.course.id, b.leerplan?.title]));
    const cursussen = new Map<string, CursusUitkomst>();
    for (const c of dekking.cursussen) {
      const titel = leerplanTitels.get(c.courseId);
      cursussen.set(c.courseId, titel !== undefined ? { ...c, leerplanTitel: titel } : c);
    }
    return {
      dekking,
      cursussen,
      namen: setNamenVan(dekking, bestanden),
      ...(telJaar !== undefined ? { telJaar } : {}),
      bijdragen,
      bestanden,
      kader,
    };
  }, [dekking, bijdragen, bestanden, telJaar, kader]);

  if (kader.sets.length === 0) return { status: 'geen', herkomst: kader.herkomst };
  if (mislukt.length > 0) return { status: 'fout', opnieuw: () => mislukt.forEach(opnieuw) };
  if (!gegevens) return { status: 'laden' };
  return { status: 'klaar', waarde: gegevens };
}
