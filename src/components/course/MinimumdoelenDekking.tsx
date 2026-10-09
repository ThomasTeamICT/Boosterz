// De weergave "Minimumdoelen" van de doelendekking in de cursuseditor (docs/STUDIERICHTINGEN.md § 13.3 en § 14.5): welke
// officiële minimumdoelen dekt deze cursus, via de verwijzingen van haar leerplan?
//
// Dit bestand wordt lui geladen (GoalCoverage importeert het met React.lazy), zodat het chunk van de cursuseditor klein
// blijft. Het kader is dat van de studierichting van de cursus (haar doelgroep), en anders zijn het de sets van haar
// leerplan. Dit bestand bevat ook de stukken die het richtingenscherm met de editor deelt: de status van een doel, de keuze
// "Toon" en de lijst met sets (RichtingDekking.tsx importeert ze hier).

import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, CloseIcon, PlannedIcon, WarningIcon } from '../icons';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import { useRichtingGegevens, useRichtingKader } from '../richting/useRichtingGegevens';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import {
  dekkingMinimumdoelen,
  kaderDoelen,
  setsAlsKader,
  type MdDekking,
  type MdRij,
  type MdStatus,
} from '../../lib/dekkingMinimumdoelen';
import {
  FOUT_SETS_DEKKING,
  GEEN_SETS_TEKST,
  KADER_LEEG_NOOT,
  KADER_NOG_NIET_NOOT,
  LADEN_SETS_DEKKING,
  RICHTING_ONBEKEND_NOOT,
  buitenKaderTekst,
  groepeerPerSet,
  kortTekst,
  legeSetTekst,
  nogNietGedektZin,
  optioneelZin,
  richtingLinkNaar,
  richtingLinkTekst,
  richtingMetGraad,
  samenvattingCursus,
  setSamenvatting,
  statusTekst,
  uniekeSetNamen,
  veiligeSetNaam,
  zelfdeNummerZin,
  zichtbareSets,
  type SetGroep,
  type Toon,
} from '../../lib/dekkingWeergave';
import { doelgroepVoorLeerplan, sanitizeDoelgroep, type Doelgroep } from '../../lib/doelgroep';
import type { MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { contextVanSet } from '../../lib/minimumdoelenBron';
import { richtingInfo, type RichtingKader, type RichtingKeuze } from '../../lib/richtingKader';
import type { Widget } from '../../lib/types';
import '../../styles/dekking.css';

// ── Wat het richtingenscherm en de editor delen ─────────────────────────────

const STATUS_ICOON: Record<MdStatus, typeof CheckIcon> = {
  gedekt: CheckIcon,
  gepland: PlannedIcon,
  verdieping: WarningIcon,
  open: CloseIcon,
};

/** De status van een doel: icoon én tekst (§ 14.3), met een kleur die erbij past. */
export function DoelStatus({ rij }: { rij: Pick<MdRij, 'status' | 'via'> }) {
  const Icoon = STATUS_ICOON[rij.status];
  return (
    <p className={`dk-status dk-status-${rij.status}`}>
      <Icoon size={16} aria-hidden="true" />
      <span>{statusTekst(rij)}</span>
    </p>
  );
}

/** De radio "Toon": alle doelen, of alleen wat nog niet gedekt is. */
export function ToonKeuze({ toon, onToon }: { toon: Toon; onToon: (t: Toon) => void }) {
  const naam = useId();
  return (
    <fieldset className="dk-fieldset">
      <legend>Toon</legend>
      <div className="dk-radios">
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={toon === 'alle'} onChange={() => onToon('alle')} />
          <span>Alle doelen</span>
        </label>
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={toon === 'open'} onChange={() => onToon('open')} />
          <span>Nog niet gedekt</span>
        </label>
      </div>
    </fieldset>
  );
}

function SetUitklapper({ groep, naam, toon }: { groep: SetGroep; naam: string; toon: Toon }) {
  // De doelen staan pas in de pagina als de set openstaat: een richting met honderden doelen blijft zo snel.
  const [open, setOpen] = useState(false);
  return (
    <details className="dk-set" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{setSamenvatting(naam, groep.gedekt, groep.totaal)}</summary>
      {open && (groep.rijen.length === 0 ? (
        <p className="dk-leeg">{legeSetTekst(toon)}</p>
      ) : (
        <ul className="dk-doelen">
          {groep.rijen.map((rij) => {
            const { doel } = rij;
            const tag = !doel.verplichteSet ? 'uitbreidingsdoel' : doel.optioneel ? 'optioneel' : '';
            return (
              <li key={`${doel.set}|${doel.id}`} className="dk-doel">
                <div className="dk-doel-kop">
                  {doel.code !== '' && <span className="dk-code">{doel.code}</span>}
                  {tag !== '' && <span className="dk-tag">{tag}</span>}
                </div>
                {doel.tekst !== '' && <p className="dk-doel-tekst">{kortTekst(doel.tekst)}</p>}
                <DoelStatus rij={rij} />
              </li>
            );
          })}
        </ul>
      ))}
    </details>
  );
}

/**
 * Per set een uitklapper met de doelen en hun status. `namen` geeft per set de naam voor het scherm (zie `setNamenVan`);
 * een set zonder naam in die lijst krijgt zijn korte naam, zonder set-id.
 */
export function DekkingPerSet({ dekking, toon, namen }: { dekking: MdDekking; toon: Toon; namen: ReadonlyMap<string, string> }) {
  const groepen = useMemo(() => zichtbareSets(groepeerPerSet(dekking, toon), toon), [dekking, toon]);
  // De sets staan standaard dicht: zonder deze zin zou de keuze "Nog niet gedekt" niets zichtbaar of hoorbaar veranderen. De regel
  // staat er altijd (ook leeg), want een live-gebied moet er al staan voor de tekst verandert.
  const zin = toon === 'open' && dekking.rijen.length > 0
    ? nogNietGedektZin(groepen.reduce((n, g) => n + g.rijen.length, 0), groepen.length)
    : '';
  return (
    <>
      <p className="dk-toon-zin" aria-live="polite">{zin}</p>
      <div className="dk-sets">
        {groepen.map((g) => <SetUitklapper key={g.set} groep={g} naam={namen.get(g.set) ?? veiligeSetNaam(g.setNaam)} toon={toon} />)}
      </div>
    </>
  );
}

/** De namen van de sets voor het scherm: dubbele korte namen krijgen de context erachter ("Pool · Domein"). */
export function setNamenVan(dekking: Pick<MdDekking, 'perSet'>, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>): Map<string, string> {
  return uniekeSetNamen(dekking.perSet, (set) => {
    const naam = bestanden.get(set)?.set.naam;
    return typeof naam === 'string' ? contextVanSet(naam) : '';
  });
}

// ── De weergave in de editor ────────────────────────────────────────────────

export interface MinimumdoelenDekkingProps {
  course: Course;
  curriculum: Curriculum;
  /** Widgets van dit toestel: de ingebedde exemplaren tellen mee. */
  widgets: Widget[];
}

/** Vandaag als JJJJ-MM-DD op het toestel van de leerkracht (zoals op het richtingenscherm). */
function vandaagLokaal(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`;
}

type Bron = { soort: 'kader'; kader: RichtingKader } | { soort: 'sets'; sets: readonly string[] };

function Berekening({ bron, van, uitleg, doelgroep, course, curriculum, widgets }: MinimumdoelenDekkingProps & {
  bron: Bron;
  /** Waarvan de cursus de doelen dekt, voor in de samenvatting. */
  van: string;
  /** Een korte uitleg boven de samenvatting. */
  uitleg?: string;
  /** Alleen met een kader van de richting: dan staat onderaan de link naar de dekking van alle cursussen. */
  doelgroep?: Doelgroep;
}) {
  const ids = useMemo(
    () => (bron.soort === 'kader' ? bron.kader.sets.map((k) => k.set.id) : [...new Set(bron.sets.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean))]),
    [bron],
  );
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);
  const mislukt = ids.filter((id) => stand(id).status === 'fout');
  const laden = ids.some((id) => stand(id).status === 'laden');
  const klaar = !laden && mislukt.length === 0;
  const [toon, setToon] = useState<Toon>('alle');

  const dekking = useMemo(() => {
    if (!klaar) return undefined;
    const doelen = bron.soort === 'kader' ? kaderDoelen(bron.kader, bestanden) : setsAlsKader(ids, bestanden);
    return dekkingMinimumdoelen(doelen, [{ course, leerplan: curriculum }], widgets);
  }, [klaar, bron, ids, bestanden, course, curriculum, widgets]);
  const namen = useMemo(() => (dekking ? setNamenVan(dekking, bestanden) : new Map<string, string>()), [dekking, bestanden]);

  if (ids.length === 0) return <p className="dk-uitleg">{GEEN_SETS_TEKST}</p>;
  if (mislukt.length > 0) return <FoutBericht fout={FOUT_SETS_DEKKING} onOpnieuw={() => mislukt.forEach(opnieuw)} />;
  if (!dekking) return <LaadBericht tekst={LADEN_SETS_DEKKING} />;

  const buitenKader = bron.soort === 'kader' ? (dekking.cursussen[0]?.buitenKader ?? 0) : 0;
  const optioneel = optioneelZin(dekking.optioneel);
  const zelfdeNummer = zelfdeNummerZin(dekking.zelfdeNummerAndereSet);
  return (
    <div className="dk">
      {uitleg && <p className="dk-uitleg">{uitleg}</p>}
      <p className="dk-samenvatting" aria-live="polite"><strong>{samenvattingCursus(dekking, van)}</strong></p>
      {[optioneel, buitenKaderTekst(buitenKader), zelfdeNummer].filter(Boolean).map((zin) => <p key={zin} className="dk-uitleg dk-extra">{zin}</p>)}
      <ToonKeuze toon={toon} onToon={setToon} />
      <DekkingPerSet dekking={dekking} toon={toon} namen={namen} />
      {doelgroep && (
        <p className="dk-link"><Link to={richtingLinkNaar(doelgroep)}>{richtingLinkTekst(doelgroep.titel)}</Link></p>
      )}
    </div>
  );
}

/** Een cursus zonder bruikbare richting: gemeten tegen de sets van haar leerplan, met eventueel een noot waarom. */
function MetSets(props: MinimumdoelenDekkingProps & { noot?: string }) {
  const { noot, ...rest } = props;
  const bron = useMemo<Bron>(() => ({ soort: 'sets', sets: rest.curriculum.minimumdoelenSets ?? [] }), [rest.curriculum.minimumdoelenSets]);
  return <Berekening {...rest} bron={bron} van="de sets van je leerplan" uitleg={noot} />;
}

/** De sets van de richting zelf: de matrix, het kader van de richting en dan de setbestanden. */
function MetRichting({ doelgroep, ...basis }: MinimumdoelenDekkingProps & { doelgroep: Doelgroep }) {
  const gegevens = useRichtingGegevens();
  const vandaag = useMemo(vandaagLokaal, []);
  const matrix = gegevens.stand.status === 'klaar' ? gegevens.stand.waarde.matrix : undefined;
  const info = useMemo(() => (matrix ? richtingInfo(matrix, doelgroep.groep, vandaag) : undefined), [matrix, doelgroep.groep, vandaag]);
  // Het kader hangt niet van het jaar af: alleen van de richting en het soort onderwijs.
  const keuze = useMemo<RichtingKeuze | undefined>(() => (info ? { groep: doelgroep.groep, soort: doelgroep.soort } : undefined), [info, doelgroep.groep, doelgroep.soort]);
  const kaderStand = useRichtingKader(info, keuze);

  if (gegevens.stand.status === 'fout') return <FoutBericht fout={gegevens.stand.fout} onOpnieuw={gegevens.opnieuw} />;
  if (gegevens.stand.status === 'laden') return <LaadBericht tekst="De studierichting wordt geladen…" />;
  if (!info) return <MetSets {...basis} noot={RICHTING_ONBEKEND_NOOT} />;
  if (kaderStand.stand.status === 'fout') return <FoutBericht fout={kaderStand.stand.fout} onOpnieuw={kaderStand.opnieuw} />;
  if (kaderStand.stand.status === 'laden') return <LaadBericht tekst="De minimumdoelen worden geladen…" />;
  const kader = kaderStand.stand.waarde.kader;
  if (kader.sets.length === 0) {
    // "Nog niet opgehaald" is iets anders dan "de bron koppelt er geen": de noot noemt de juiste reden.
    return <MetSets {...basis} noot={kader.herkomst === 'nog-niet-opgehaald' ? KADER_NOG_NIET_NOOT : KADER_LEEG_NOOT} />;
  }
  return (
    <Berekening
      {...basis}
      bron={{ soort: 'kader', kader }}
      van={richtingMetGraad(doelgroep.titel, doelgroep.graad)}
      doelgroep={doelgroep}
    />
  );
}

/**
 * Wat deze cursus van de officiële minimumdoelen dekt. Met een studierichting (de doelgroep van de cursus, of anders van haar
 * leerplan) is het kader dat van de richting; zonder zijn het de sets van het leerplan.
 */
export function MinimumdoelenDekking(props: MinimumdoelenDekkingProps) {
  const { course, curriculum } = props;
  const doelgroep = useMemo(
    () => sanitizeDoelgroep(course.doelgroep) ?? doelgroepVoorLeerplan(curriculum.doelgroep),
    [course.doelgroep, curriculum.doelgroep],
  );
  return doelgroep ? <MetRichting {...props} doelgroep={doelgroep} /> : <MetSets {...props} />;
}
