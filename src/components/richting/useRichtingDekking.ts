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
import type { Curriculum } from '../../lib/curriculumTypes';
import type { MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { isBkLeerplan } from '../../lib/leerplanStatus';
import { kaderGroepSleutel, type KaderHerkomst, type RichtingKader } from '../../lib/richtingKader';
import { bijdragenVoorKader, kortVan } from '../../lib/richtingOverzicht';
import { setNamenVan } from '../../lib/setNamen';
import type { MatrixBestand } from '../../lib/studierichtingen';
import { getWidgets, onStorageChange } from '../../lib/storage';
import type { Widget } from '../../lib/types';

/** Welke cursussen meetellen: alle jaren van de graad, of alleen het gekozen jaar. */
export type TelMee = 'alle' | 'jaar';

/**
 * Bestaat dit leerplan uit de competenties van beroepskwalificaties, zodat het blok "Competenties van de beroepskwalificaties"
 * (BkDekking) het meetelt? Dat is zo bij de methode `beroepskwalificatie` én minstens één doel met een bruikbare `bkRef`
 * (`bk` en `id` niet leeg): dezelfde test als `dekkingBk` (`bkVerwijzingen` in lib/dekkingBk.ts). Een BK-leerplan zonder
 * `bkRefs` (bewaard door een oudere app of geïmporteerd, § 23.6.7 N7) telt daar niet mee, dus de zinnen bij de minimumdoelen en
 * in de cursuslijst mogen er ook niet naar verwijzen. De test staat hier en niet in `dekkingBk.ts`, omdat dat bestand in het
 * luie deel `bk` zit en deze module op de richtingenpagina zelf; `useRichtingDekking.test.ts` houdt de twee gelijk.
 */
export function volgtBkCompetenties(leerplan: Curriculum | undefined): boolean {
  if (!leerplan || !isBkLeerplan(leerplan)) return false;
  const goals: unknown = leerplan.goals;
  return Array.isArray(goals) && goals.some((g: unknown) => {
    const refs: unknown = g && typeof g === 'object' ? (g as { bkRefs?: unknown }).bkRefs : undefined;
    return Array.isArray(refs) && refs.some((r: unknown) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
      const { bk, id } = r as { bk?: unknown; id?: unknown };
      return typeof bk === 'string' && bk.trim() !== '' && typeof id === 'string' && id.trim() !== '';
    });
  });
}

/**
 * Een cursus in de berekening, met de titel van haar leerplan erbij (voor de reden "het leerplan verwijst niet naar
 * minimumdoelen"). `volgtBk`: haar leerplan bestaat uit de competenties van beroepskwalificaties (`volgtBkCompetenties`,
 * § 23.7.4). Dat verandert niets aan de getallen van de minimumdoelen, alleen aan de tekst die erbij staat.
 */
export interface CursusUitkomst extends CursusInDekking {
  leerplanTitel?: string;
  volgtBk?: boolean;
}

/**
 * Per cursus-id wat de berekening van haar zegt, met de titel van haar leerplan en of dat leerplan de competenties van
 * beroepskwalificaties volgt (`volgtBkCompetenties`). Een cursus zonder van beide staat er zoals de berekening ze gaf.
 */
export function cursussenUitkomst(dekking: MdDekking, bijdragen: readonly CursusBijdrage[]): Map<string, CursusUitkomst> {
  const leerplannen = new Map(bijdragen.map((b) => [b.course.id, b.leerplan]));
  const cursussen = new Map<string, CursusUitkomst>();
  for (const c of dekking.cursussen) {
    const leerplan = leerplannen.get(c.courseId);
    const titel = leerplan?.title;
    const volgtBk = volgtBkCompetenties(leerplan);
    cursussen.set(
      c.courseId,
      titel !== undefined || volgtBk ? { ...c, ...(titel !== undefined ? { leerplanTitel: titel } : {}), ...(volgtBk ? { volgtBk: true } : {}) } : c,
    );
  }
  return cursussen;
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
 * De oefeningen van dit toestel: ze tellen mee voor wat een cursus behandelt en lezen opnieuw als er elders (ook in een ander
 * tabblad) iets bewaard wordt. Gedeeld door de dekking op minimumdoelen en die op competenties.
 */
export function useToestelWidgets(): Widget[] {
  const [widgets, setWidgets] = useState(getWidgets);
  useEffect(() => onStorageChange(() => setWidgets(getWidgets())), []);
  return widgets;
}

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

  // De oefeningen van dit toestel tellen mee voor wat een cursus behandelt.
  const widgets = useToestelWidgets();

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
    return {
      dekking,
      cursussen: cursussenUitkomst(dekking, bijdragen),
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
