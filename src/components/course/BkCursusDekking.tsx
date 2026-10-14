// De dekking op competenties in de cursuseditor (docs/STUDIERICHTINGEN.md § 24.6.1): bij "Doelendekking" met de keuze
// "Beroepskwalificatie" het percentage per beroepskwalificatie, per competentie gedekt, gepland of open, en "Plan ze in deze
// cursus". Het kader is de BK-versies van het eigen leerplan (F3b-B6), nooit de koppeling van een richting: de editor vraagt
// alleen de index en de bestanden van die versies, en een versie waarvan de index geen bestand noemt, wordt nooit gevraagd
// (een 404 is een consolefout). Dit bestand zit in een lui chunk: GoalCoverage laadt het pas bij de klik.
//
// De zinnen staan in `bkWeergave.ts` en `dekkingWeergave.ts`; de lijst (`PerBk`) in `bk/BkLijst.tsx`. Bewaren doet de editor:
// de cursus verandert alleen via `onEdit`, en alleen doordat er secties bijkomen. Het leerplan verandert nooit.

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WarningIcon } from '../icons';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { BkToonKeuze, PerBk, ZonderBestandRegel } from '../richting/bk/BkLijst';
import { PlanInCursus, planVan, type PlanSmaak } from './MinimumdoelenDekking';
import type { BkBestand } from '../../lib/beroepskwalificaties';
import { laadBk, laadBkIndex } from '../../lib/beroepskwalificatiesBron';
import {
  BK_DEKKING_TITEL,
  BK_LADEN,
  BK_PLAN_TEKSTEN,
  bkAndereOpenTekst,
  bkBuitenKaderTekst,
  bkCursusSamenvatting,
  bkNietMeerInBron,
} from '../../lib/bkWeergave';
import { selectieVanBkLeerplan } from '../../lib/bkLeerplan';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { bkKaderVanVersies, bkVerwijzingen, dekkingBk } from '../../lib/dekkingBk';
import { richtingLinkNaar, richtingLinkTekst, uniekeSetNamen, type Toon } from '../../lib/dekkingWeergave';
import { doelgroepVoorLeerplan, sanitizeDoelgroep } from '../../lib/doelgroep';
import { PLAN_BIJ_RICHTING_TEKST } from '../../lib/gatenWeergave';
import type { Widget } from '../../lib/types';
import { useLaadstand } from '../../lib/useLaadstand';
import '../../styles/dekking.css';

export interface BkCursusDekkingProps {
  /** De cursus zoals ze in de editor staat. */
  course: Course;
  /** Het leerplan van de cursus: een BK-leerplan (`isBkLeerplan`). */
  curriculum: Curriculum;
  /** De oefeningen van dit toestel (wat een sectie behandelt). */
  widgets: Widget[];
  /** Secties toevoegen ("Zet ze in deze cursus"): alleen via de editor, die bewaart. Zonder: alleen kijken. */
  onEdit?: (next: (c: Course) => Course) => void;
}

// ── De bestanden laden ──────────────────────────────────────────────────────

/** Wat de editor van de officiële gegevens nodig heeft: de bestanden van de versies van het leerplan, en hun titels uit de index. */
export interface BkEditorGegevens {
  /** BK-versie → haar bestand. Een versie zonder bestand (de index kent er geen, of het bestand is er niet) staat er niet in. */
  bestanden: Map<string, BkBestand>;
  /** BK-versie → de titel in de index, voor de regel bij een versie zonder bestand. */
  titels: Map<string, string>;
}

/**
 * Laadt de gegevens van de BK-versies van een leerplan: eerst de index, dan alleen de bestanden van de versies die de index met
 * een bestand noemt. Zonder index (nog niet opgehaald) staan alle versies bij "zonder bestand". Nooit de koppeling van een
 * richting, en nooit een verzoek voor een versie zonder bestand. Een mislukt verzoek gooit de fout van de lader, die in gewone
 * taal staat.
 */
export async function laadBkEditorGegevens(versies: readonly string[]): Promise<BkEditorGegevens> {
  const index = await laadBkIndex();
  const titels = new Map<string, string>();
  const metBestand: string[] = [];
  for (const versie of versies) {
    const regel = index?.bks.find((r) => r.bk === versie);
    if (!regel) continue;
    if (typeof regel.titel === 'string' && regel.titel.trim() !== '') titels.set(versie, regel.titel.trim());
    if (typeof regel.bestand === 'string' && regel.bestand.trim() !== '') metBestand.push(versie);
  }
  const geladen = await Promise.all(metBestand.map((v) => laadBk(v)));
  const bestanden = new Map<string, BkBestand>();
  metBestand.forEach((v, i) => {
    const b = geladen[i];
    if (b) bestanden.set(v, b);
  });
  return { bestanden, titels };
}

/** De titel van een beroepskwalificatie volgens het leerplan: het eerste deel van het thema van haar eerste doel. Leeg zonder. */
function titelUitLeerplan(curriculum: Curriculum, versie: string): string {
  for (const goal of Array.isArray(curriculum.goals) ? curriculum.goals : []) {
    if (typeof goal?.theme !== 'string' || !Array.isArray(goal.bkRefs) || !goal.bkRefs.some((r) => r?.bk === versie)) continue;
    const titel = goal.theme.split('›')[0].trim();
    if (titel !== '') return titel;
  }
  return '';
}

// ── Plannen ─────────────────────────────────────────────────────────────────

/**
 * Wat "Plan ze in deze cursus" bij competenties anders doet dan bij minimumdoelen (§ 24.4): de zinnen van `BK_PLAN_TEKSTEN`, de
 * `bkRefs` van het leerplan als verwijzingen, en de secties via `bkGeraamte`: een sectie per competentie, met kennis en
 * vaardigheden, in het hoofdstuk van haar beroepskwalificatie (nooit `geraamteHoofdstukken`, dat alle competenties in één
 * sectie zou zetten). Beide modules laden pas bij de klik. Het leerplan blijft zoals het is.
 */
export function bkPlanSmaak(bestanden: ReadonlyMap<string, BkBestand>): PlanSmaak {
  return {
    teksten: BK_PLAN_TEKSTEN,
    verwijzingen: bkVerwijzingen,
    laadVoegToe: () => Promise.all([import('../../lib/gatenCursus'), import('../../lib/bkCursus')]).then(
      ([gaten, bk]) => (c, l, codes) => gaten.voegGeplandeSectiesToe(c, l, codes, (lp, cs) => bk.bkGeraamte(lp, bestanden, cs)),
    ),
  };
}

// ── De weergave ─────────────────────────────────────────────────────────────

function Inhoud({ course, curriculum, widgets, onEdit, versies, gegevens }: BkCursusDekkingProps & {
  versies: readonly string[];
  gegevens: BkEditorGegevens;
}) {
  const { bestanden, titels } = gegevens;
  const [toon, setToon] = useState<Toon>('alle');
  const samenvattingRef = useRef<HTMLParagraphElement>(null);

  const kader = useMemo(() => bkKaderVanVersies(versies, bestanden), [versies, bestanden]);
  const dekking = useMemo(() => dekkingBk(kader, [{ course, leerplan: curriculum }], widgets), [kader, course, curriculum, widgets]);
  // Twee beroepskwalificaties met dezelfde titel krijgen hun officiële nummer erachter (altijd ná een naam).
  const namen = useMemo(() => uniekeSetNamen(dekking.perSet, (set) => set), [dekking]);
  // Plannen kan alleen met `onEdit` (de editor): zonder is dit alleen kijken.
  const plan = useMemo(() => (onEdit ? planVan(dekking, curriculum, bkVerwijzingen) : undefined), [dekking, onEdit, curriculum]);
  const smaak = useMemo(() => bkPlanSmaak(bestanden), [bestanden]);
  const doelgroep = useMemo(
    () => sanitizeDoelgroep(course.doelgroep) ?? doelgroepVoorLeerplan(curriculum.doelgroep),
    [course.doelgroep, curriculum.doelgroep],
  );

  // Een beroepskwalificatie zonder bestand telt niet mee: dat zeggen we erbij, anders lijkt de dekking kleiner dan ze is.
  const zonderBestand = versies.filter((v) => !bestanden.has(v));
  // De competenties van het leerplan die niet (meer) in het bestand van hun beroepskwalificatie staan, ook die op geen enkele
  // sectie: `cursussen[0].buitenKader` telt alleen wat de cursus al behandelt. Zonder alle bestanden is het kader onvolledig en
  // zou "niet meer in de lijst" te veel tellen.
  const buitenKader = useMemo(() => {
    if (versies.some((v) => !bestanden.has(v))) return 0;
    const inKader = new Set(kader.map((d) => `${d.set}\u0000${d.id}`));
    let n = 0;
    for (const [bk, ids] of selectieVanBkLeerplan(curriculum)) for (const id of ids) if (!inKader.has(`${bk}\u0000${id}`)) n++;
    return n;
  }, [versies, bestanden, kader, curriculum]);
  const meerdere = versies.length > 1;
  const enige = dekking.perSet.length === 1 ? dekking.perSet[0] : undefined;
  const naamVan = (versie: string) => namen.get(versie) ?? bestanden.get(versie)?.titel.trim() ?? '';

  return (
    <>
      {zonderBestand.map((v) => <ZonderBestandRegel key={v} titel={titels.get(v) ?? titelUitLeerplan(curriculum, v)} />)}
      {versies.filter((v) => typeof bestanden.get(v)?.nietMeerInBron === 'string').map((v) => (
        <div key={v} className="callout warn dk-melding" role="note">
          <WarningIcon size={16} aria-hidden />
          <div className="dk-melding-tekst">
            <p>
              {meerdere && <><strong>{naamVan(v)}</strong>. </>}
              {bkNietMeerInBron(bestanden.get(v)?.nietMeerInBron)}
            </p>
          </div>
        </div>
      ))}
      {(dekking.rijen.length > 0 || zonderBestand.length === 0) && (
        <p className="dk-samenvatting" aria-live="polite" tabIndex={-1} ref={samenvattingRef}>
          <strong>
            {bkCursusSamenvatting(dekking, { aantal: dekking.perSet.length, titel: enige ? (namen.get(enige.set) ?? enige.setNaam) : undefined })}
          </strong>
        </p>
      )}
      {buitenKader > 0 && <p className="dk-uitleg dk-extra">{bkBuitenKaderTekst(buitenKader)}</p>}
      {plan && onEdit && (
        <PlanInCursus
          plan={plan} dekking={dekking} curriculum={curriculum} namen={namen} onEdit={onEdit}
          samenvattingRef={samenvattingRef} smaak={smaak}
        />
      )}
      {dekking.rijen.length > 0 && (
        <>
          <BkToonKeuze toon={toon} onToon={setToon} />
          <PerBk dekking={dekking} toon={toon} namen={namen} />
        </>
      )}
      {plan && plan.buitenLeerplan > 0 && <p className="gt-andere">{bkAndereOpenTekst(plan.buitenLeerplan)}</p>}
      {plan && plan.buitenLeerplan > 0 && doelgroep && <p className="gt-andere">{PLAN_BIJ_RICHTING_TEKST}</p>}
      {doelgroep && (
        <p className="dk-link"><Link to={richtingLinkNaar(doelgroep)}>{richtingLinkTekst(doelgroep.titel)}</Link></p>
      )}
    </>
  );
}

/**
 * Wat deze cursus van de competenties van haar beroepskwalificaties dekt. Laadt de index en de bestanden van de BK-versies van
 * het leerplan; zolang dat bezig is of mislukte, staat er een melding en blijft de rest van de editor zoals ze was.
 */
export function BkCursusDekking(props: BkCursusDekkingProps) {
  const { curriculum } = props;
  const versies = useMemo(() => [...selectieVanBkLeerplan(curriculum).keys()], [curriculum]);
  const { stand, opnieuw } = useLaadstand<BkEditorGegevens>(`bk-cursus|${versies.join('|')}`, () => laadBkEditorGegevens(versies));
  /** De knop "Opnieuw proberen" verdwijnt zodra het opnieuw laadt: de focus gaat eerst naar het blok, anders valt hij terug op de pagina. */
  const blok = useRef<HTMLDivElement>(null);
  return (
    <div className="dk" role="group" aria-label={BK_DEKKING_TITEL} tabIndex={-1} ref={blok}>
      {stand.status === 'laden' && <LaadBericht tekst={BK_LADEN} />}
      {stand.status === 'fout' && <FoutBericht fout={stand.fout} onOpnieuw={() => { blok.current?.focus(); opnieuw(); }} />}
      {stand.status === 'klaar' && <Inhoud {...props} versies={versies} gegevens={stand.waarde} />}
    </div>
  );
}
