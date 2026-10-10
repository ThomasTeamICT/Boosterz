// De weergave "Minimumdoelen" van de doelendekking in de cursuseditor (docs/STUDIERICHTINGEN.md § 13.3 en § 14.5): welke
// officiële minimumdoelen dekt deze cursus, via de verwijzingen van haar leerplan?
//
// Dit bestand wordt lui geladen (GoalCoverage importeert het met React.lazy), zodat het chunk van de cursuseditor klein
// blijft. Het kader is dat van de studierichting van de cursus (haar doelgroep), en anders zijn het de sets van haar
// leerplan. Dit bestand bevat ook de stukken die het richtingenscherm met de editor deelt: de status van een doel, de keuze
// "Toon" en de lijst met sets (RichtingDekking.tsx importeert ze hier).

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, CloseIcon, PlannedIcon, WarningIcon } from '../icons';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { useToast } from '../ui';
import { useSetBestanden } from '../curriculum/samenstellen/useSetBestanden';
import { useRichtingGegevens, useRichtingKader } from '../richting/useRichtingGegevens';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import {
  dekkingMinimumdoelen,
  kaderDoelen,
  setsAlsKader,
  type KaderDoel,
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
  veiligeSetNaam,
  zelfdeNummerZin,
  zichtbareSets,
  type SetGroep,
  type Toon,
} from '../../lib/dekkingWeergave';
import { doelgroepVoorLeerplan, sanitizeDoelgroep, type Doelgroep } from '../../lib/doelgroep';
import { codesVoorDoelen, openPerSet, openVerplichteDoelen, type OpenSet } from '../../lib/gatenDichten';
import {
  ANNULEREN_TEKST,
  DOELEN_HINT,
  DOELEN_LEGEND,
  FOUT_LADEN_GATEN,
  FOUT_NIETS_TE_DOEN,
  PANEEL_TITEL,
  PANEEL_UITLEG,
  PLAN_BIJ_RICHTING_TEKST,
  TOON_DOELEN,
  andereOpenTekst,
  doelRegelTekst,
  editorKnopTekst,
  editorRegel,
  geplandInDezeCursusToast,
  nogNodigTekst,
  paneelZetTekst,
  setVakjeTekst,
  tellerTekst,
} from '../../lib/gatenWeergave';
import { setNamenVan } from '../../lib/setNamen';
import { richtingInfo, type RichtingKader, type RichtingKeuze } from '../../lib/richtingKader';
import type { Widget } from '../../lib/types';
import '../../styles/dekking.css';
import '../../styles/gaten.css';

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

/** De namen van de sets voor het scherm; staat in lib/setNamen.ts, zodat de dekkingsberekening dit scherm niet meelaadt. */
export { setNamenVan };

// ── Gaten dichten: de sets kiezen (het venster op de richtingpagina en het paneel in de editor delen dit) ──

/** De sets die de leerkracht niet uitvinkte. Een set die later bijkomt, staat dus standaard aan. */
export function gekozenOpenSets(sets: readonly OpenSet[], uit: ReadonlySet<string>): OpenSet[] {
  return sets.filter((s) => !uit.has(s.set));
}

/** De doelen van die sets, in de volgorde van het kader. */
export function gekozenOpenDoelen(sets: readonly OpenSet[], uit: ReadonlySet<string>): KaderDoel[] {
  return gekozenOpenSets(sets, uit).flatMap((s) => s.doelen);
}

function DoelenUitklapper({ set, naam }: { set: OpenSet; naam: string }) {
  // De doelen staan pas in de pagina als de set openstaat: een set met honderden doelen blijft zo snel.
  const [open, setOpen] = useState(false);
  return (
    <details className="gt-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{TOON_DOELEN}<span className="sr-only">{` van ‘${naam}’`}</span></summary>
      {open && (
        <ul className="gt-doelen">
          {set.doelen.map((doel) => (
            <li key={doel.id} className="gt-doel">{doelRegelTekst(doel.code, kortTekst(doel.tekst, 160))}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

/**
 * "Welke doelen?": per set een vakje ("Chemie · 9 doelen") met een uitklapper om de doelen te zien, en de teller. De
 * leerkracht kiest per set, niet per doel; per doel bijsturen kan daarna in de cursus. `uit` zijn de sets die ze uitvinkte.
 * Met `alsTekstBijEenSet` staat een enkele set als gewone regel, want er valt niets af te vinken (het paneel in de editor).
 */
export function GatenSetsKeuze({ sets, namen, uit, onZet, eersteId, alsTekstBijEenSet }: {
  sets: readonly OpenSet[];
  /** De namen van de sets voor het scherm (zie `setNamenVan`); een set zonder naam in die lijst krijgt zijn korte naam. */
  namen: ReadonlyMap<string, string>;
  uit: ReadonlySet<string>;
  onZet: (set: string, aan: boolean) => void;
  /** Het id van het eerste vakje, voor de focus als er nog iets ontbreekt. */
  eersteId?: string;
  alsTekstBijEenSet?: boolean;
}) {
  const naamVan = (s: OpenSet) => namen.get(s.set) ?? veiligeSetNaam(s.setNaam);
  if (alsTekstBijEenSet && sets.length === 1) {
    return <p className="gt-eenset">{setVakjeTekst(naamVan(sets[0]), sets[0].doelen.length)}</p>;
  }
  const gekozen = gekozenOpenSets(sets, uit);
  const doelen = gekozen.reduce((som, s) => som + s.doelen.length, 0);
  return (
    <fieldset className="gt-groep">
      <legend>{DOELEN_LEGEND}</legend>
      <p className="gt-uitleg">{DOELEN_HINT}</p>
      <ul className="gt-setlijst">
        {sets.map((s, i) => {
          const naam = naamVan(s);
          return (
            <li key={s.set} className="gt-set">
              <label className="gt-vak">
                <input
                  type="checkbox" id={i === 0 ? eersteId : undefined} checked={!uit.has(s.set)}
                  onChange={(e) => onZet(s.set, e.target.checked)}
                />
                <span>{setVakjeTekst(naam, s.doelen.length)}</span>
              </label>
              <DoelenUitklapper set={s} naam={naam} />
            </li>
          );
        })}
      </ul>
      <p className="gt-teller" aria-live="polite" aria-atomic="true">{tellerTekst(doelen, gekozen.length)}</p>
    </fieldset>
  );
}

// ── De weergave in de editor ────────────────────────────────────────────────

export interface MinimumdoelenDekkingProps {
  course: Course;
  curriculum: Curriculum;
  /** Widgets van dit toestel: de ingebedde exemplaren tellen mee. */
  widgets: Widget[];
  /**
   * Wijzigt de cursus in de editor (`draft.edit`: de functie draait op de laatste stand, de bewaarmotor bewaart). Alleen mét deze
   * prop staat er "Plan ze in deze cursus" (§ 22.4.5).
   */
  onEdit?: (next: (c: Course) => Course) => void;
}

/** Vandaag als JJJJ-MM-DD op het toestel van de leerkracht (zoals op het richtingenscherm). */
function vandaagLokaal(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`;
}

/** Geen enkele set uitgevinkt: het begin van elk paneel. */
const GEEN_SETS_UIT: ReadonlySet<string> = new Set();

/** Wat de editor kan plannen: de open doelen die in het leerplan van deze cursus staan, en het aantal dat er niet in staat. */
interface Plan {
  /** De open doelen met een doelcode in het leerplan van de cursus, per set. */
  perSet: OpenSet[];
  aantal: number;
  /** Open doelen die deze cursus niet dekt en die niet in haar leerplan staan. */
  buitenLeerplan: number;
}

function planVan(dekking: MdDekking, curriculum: Curriculum): Plan {
  const { inLeerplan, nietInLeerplan } = codesVoorDoelen(curriculum, openVerplichteDoelen(dekking));
  return { perSet: openPerSet(inLeerplan), aantal: inLeerplan.length, buitenLeerplan: nietInLeerplan.length };
}

/**
 * "Plan ze in deze cursus" (§ 22.4.5): de open doelen uit het leerplan van deze cursus die nog op geen enkele sectie staan,
 * als lege secties met doelcodes achteraan in de cursus. Een inline paneel in dezelfde weergave, geen tweede venster. Bij de
 * klik laadt de editor `gatenCursus` lui en vraagt `onEdit` de wijziging op de laatste stand van de cursus; de bewaarmotor van de
 * editor bewaart met zijn eigen bewaking en meldingen. Het leerplan blijft zoals het is.
 */
function PlanInCursus({ plan, dekking, curriculum, namen, onEdit, samenvattingRef }: {
  plan: Plan;
  dekking: MdDekking;
  curriculum: Curriculum;
  namen: ReadonlyMap<string, string>;
  onEdit: (next: (c: Course) => Course) => void;
  samenvattingRef: RefObject<HTMLParagraphElement>;
}) {
  const toast = useToast();
  const id = useId();
  const paneelId = `${id}-paneel`;
  const kopId = `${id}-kop`;
  const eersteId = `${id}-eerste`;
  const nodigId = `${id}-nodig`;
  const [open, setOpen] = useState(false);
  /** De sets die de leerkracht uitvinkte; een set die later bijkomt (na een wijziging van de cursus), staat standaard aan. */
  const [uit, setUit] = useState<ReadonlySet<string>>(GEEN_SETS_UIT);
  /** De dekking op het moment van de wijziging: zodra de dekking verandert, gaat de focus terug naar de knop of de samenvatting. */
  const [focusNa, setFocusNa] = useState<MdDekking | null>(null);
  const bezig = useRef(false);
  const knopRef = useRef<HTMLButtonElement>(null);
  const paneelRef = useRef<HTMLDivElement>(null);

  const toonPaneel = open && plan.aantal > 0;
  // Bij één set staat er geen vakje (alsTekstBijEenSet): dan telt ze altijd, ook als de leerkracht ze eerder uitvinkte.
  const effectiefUit = plan.perSet.length === 1 ? GEEN_SETS_UIT : uit;
  const gekozen = useMemo(() => gekozenOpenDoelen(plan.perSet, effectiefUit), [plan.perSet, effectiefUit]);

  useEffect(() => {
    if (!toonPaneel) return;
    paneelRef.current?.scrollIntoView?.({ block: 'nearest' });
    paneelRef.current?.focus();
  }, [toonPaneel]);

  useEffect(() => {
    if (!focusNa || dekking === focusNa) return;
    setFocusNa(null);
    // De knop is weg als er niets meer te plannen valt: dan gaat de focus naar de samenvatting.
    (knopRef.current ?? samenvattingRef.current)?.focus();
  }, [dekking, focusNa, samenvattingRef]);

  const zetSet = (set: string, aan: boolean) => setUit((vorige) => {
    const volgende = new Set(vorige);
    if (aan) volgende.delete(set);
    else volgende.add(set);
    return volgende;
  });

  const annuleer = () => {
    setOpen(false);
    knopRef.current?.focus();
  };

  const zet = () => {
    if (bezig.current) return;
    if (gekozen.length === 0) {
      document.getElementById(eersteId)?.focus();
      return;
    }
    const codes = codesVoorDoelen(curriculum, gekozen).codes;
    bezig.current = true;
    void import('../../lib/gatenCursus').then(
      ({ voegGeplandeSectiesToe }) => {
        let toegevoegd = 0;
        onEdit((c) => {
          const r = voegGeplandeSectiesToe(c, curriculum, codes);
          toegevoegd = r.toegevoegd.length;
          return r.course;
        });
        bezig.current = false;
        if (toegevoegd > 0) {
          toast(geplandInDezeCursusToast(gekozen.length), 'ok');
          setOpen(false);
          setFocusNa(dekking);
        } else {
          toast(FOUT_NIETS_TE_DOEN);
        }
      },
      () => {
        bezig.current = false;
        toast(FOUT_LADEN_GATEN, 'err');
      },
    );
  };

  if (plan.aantal === 0) return null;
  const nodig = gekozen.length === 0 ? nogNodigTekst(['minstens één doel']) : '';
  return (
    <div className="gt-editor">
      <p className="gt-editor-regel">{editorRegel(plan.aantal)}</p>
      <button
        ref={knopRef} type="button" className="btn btn-sm btn-primary gt-editor-knop"
        aria-expanded={toonPaneel} aria-controls={toonPaneel ? paneelId : undefined}
        onClick={() => {
          if (toonPaneel) {
            paneelRef.current?.focus();
            return;
          }
          // Een nieuw paneel begint met alle sets aan.
          setUit(GEEN_SETS_UIT);
          setOpen(true);
        }}
      >
        <PlannedIcon size={16} aria-hidden="true" /> {editorKnopTekst(plan.aantal)}
      </button>
      {toonPaneel && (
        <div ref={paneelRef} id={paneelId} role="group" aria-labelledby={kopId} tabIndex={-1} className="gt-paneel">
          <h3 id={kopId}>{PANEEL_TITEL}</h3>
          <p className="gt-uitleg">{PANEEL_UITLEG}</p>
          <GatenSetsKeuze sets={plan.perSet} namen={namen} uit={effectiefUit} onZet={zetSet} eersteId={eersteId} alsTekstBijEenSet />
          {nodig && <p id={nodigId} className="gt-paneel-nodig">{nodig}</p>}
          <div className="gt-paneel-knoppen">
            <button
              type="button" className="btn btn-sm btn-primary gt-knop" aria-disabled={nodig ? 'true' : undefined}
              aria-describedby={nodig ? nodigId : undefined} onClick={zet}
            >
              {paneelZetTekst(gekozen.length)}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={annuleer}>{ANNULEREN_TEKST}</button>
          </div>
        </div>
      )}
    </div>
  );
}

type Bron = { soort: 'kader'; kader: RichtingKader } | { soort: 'sets'; sets: readonly string[] };

function Berekening({ bron, van, uitleg, doelgroep, course, curriculum, widgets, onEdit }: MinimumdoelenDekkingProps & {
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
  // Plannen kan alleen met `onEdit` (de editor) en alleen bij een klare dekking.
  const plan = useMemo(() => (dekking && onEdit ? planVan(dekking, curriculum) : undefined), [dekking, onEdit, curriculum]);
  const samenvattingRef = useRef<HTMLParagraphElement>(null);

  if (ids.length === 0) return <p className="dk-uitleg">{GEEN_SETS_TEKST}</p>;
  if (mislukt.length > 0) return <FoutBericht fout={FOUT_SETS_DEKKING} onOpnieuw={() => mislukt.forEach(opnieuw)} />;
  if (!dekking) return <LaadBericht tekst={LADEN_SETS_DEKKING} />;

  const buitenKader = bron.soort === 'kader' ? (dekking.cursussen[0]?.buitenKader ?? 0) : 0;
  const optioneel = optioneelZin(dekking.optioneel);
  const zelfdeNummer = zelfdeNummerZin(dekking.zelfdeNummerAndereSet);
  return (
    <div className="dk">
      {uitleg && <p className="dk-uitleg">{uitleg}</p>}
      <p className="dk-samenvatting" aria-live="polite" tabIndex={-1} ref={samenvattingRef}><strong>{samenvattingCursus(dekking, van)}</strong></p>
      {[optioneel, buitenKaderTekst(buitenKader), zelfdeNummer].filter(Boolean).map((zin) => <p key={zin} className="dk-uitleg dk-extra">{zin}</p>)}
      {plan && onEdit && (
        <PlanInCursus plan={plan} dekking={dekking} curriculum={curriculum} namen={namen} onEdit={onEdit} samenvattingRef={samenvattingRef} />
      )}
      <ToonKeuze toon={toon} onToon={setToon} />
      <DekkingPerSet dekking={dekking} toon={toon} namen={namen} />
      {plan && plan.buitenLeerplan > 0 && <p className="gt-andere">{andereOpenTekst(plan.buitenLeerplan)}</p>}
      {plan && plan.buitenLeerplan > 0 && doelgroep && <p className="gt-andere">{PLAN_BIJ_RICHTING_TEKST}</p>}
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
