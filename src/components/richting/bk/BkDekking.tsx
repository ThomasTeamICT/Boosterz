// Het tweede blok van "Wat je cursussen samen dekken": de competenties van de beroepskwalificaties
// (docs/STUDIERICHTINGEN.md § 23.7.4). Dit bestand zit in een lui chunk.
//
// Het blok rekent zelf: het laadt de bestanden van de beroepskwalificaties van de richting, kiest met `bijdragenVoorKader` welke
// cursussen meetellen (dezelfde keuze als de dekking op minimumdoelen, ook als dat blok `geen` is) en rekent met `dekkingBk`. De
// zinnen komen uit `bkWeergave.ts` (nooit uit `samenvatting` van het resultaat) en de namen van twee beroepskwalificaties met
// dezelfde titel worden met `uniekeSetNamen` onderscheiden. Nooit op het scherm: een competentiecode, een ADV-nummer, een
// onderdeelnummer of een groepnummer. De getallen van de dekking op minimumdoelen blijven wat ze waren.

import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoelStatus } from '../../course/MinimumdoelenDekking';
import { FoutBericht, LaadBericht } from '../../curriculum/LaadStatus';
import type { BkBestand } from '../../../lib/beroepskwalificaties';
import { laadBk } from '../../../lib/beroepskwalificatiesBron';
import {
  BK_DEKKING_TITEL,
  BK_LADEN,
  BK_TOON_ALLE,
  BK_TOON_OPEN,
  BK_ZONDER_BESTAND,
  bkAndereVersieTekst,
  bkCompetentieRegel,
  bkNietMeetellendeTekst,
  bkRedenTekst,
  bkSamenvatting,
  bkSetSamenvatting,
} from '../../../lib/bkWeergave';
import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { bkKaderDoelen, dekkingBk } from '../../../lib/dekkingBk';
import type { MdDekking, MdRij } from '../../../lib/dekkingMinimumdoelen';
import { enkelOfMeer, groepeerPerSet, uniekeSetNamen, zichtbareSets, type SetGroep, type Toon } from '../../../lib/dekkingWeergave';
import type { RichtingBk } from '../../../lib/richtingBk';
import type { RichtingInfo, RichtingKeuze } from '../../../lib/richtingKader';
import { bijdragenVoorKader } from '../../../lib/richtingOverzicht';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import { useLaadstand } from '../../../lib/useLaadstand';
import type { BkStand } from '../useRichtingBk';
import { useToestelWidgets, type TelMee } from '../useRichtingDekking';
import '../../../styles/dekking.css';

export interface BkDekkingProps {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  /** Het BK-kader, klaar en met minstens één BK. */
  bk: RichtingBk;
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  matrix: MatrixBestand;
  /** JJJJ-MM-DD. */
  vandaag: string;
  /** "Tel mee" van de sectie: het geldt voor beide blokken. */
  telMee: TelMee;
}

/** Wat het richtingenscherm aan "Wat je cursussen samen dekken" meegeeft voor dit blok (de rest heeft de sectie al). */
export interface BkDekkingInvoer {
  /** Het BK-kader van `useRichtingBk`: het blok staat er alleen als het klaar is en minstens één BK heeft. */
  stand: BkStand;
  courses: readonly Course[];
  curricula: readonly Curriculum[];
  matrix: MatrixBestand;
  vandaag: string;
}

// ── De bestanden laden ──────────────────────────────────────────────────────

/**
 * De bestanden van alle BK-versies die er een hebben. Een versie die de index zonder bestand noemt, wordt niet gevraagd (een
 * 404 is een consolefout); een bestand dat er toch niet blijkt te zijn (`null`), ontbreekt in de uitkomst. Een mislukt
 * verzoek gooit de fout van de lader, die in gewone taal staat.
 */
async function laadAlle(versies: readonly string[]): Promise<Map<string, BkBestand>> {
  const bestanden = await Promise.all(versies.map((v) => laadBk(v)));
  const uit = new Map<string, BkBestand>();
  versies.forEach((v, i) => {
    const b = bestanden[i];
    if (b) uit.set(v, b);
  });
  return uit;
}

// ── Kleine stukken ──────────────────────────────────────────────────────────

/**
 * De zin boven de beroepskwalificaties bij "Nog niet gedekt": ze staan dicht, dus de zin zegt ook wat er te doen valt.
 * Enkelvoud en meervoud. Geëxporteerd voor de test; de zin hoort bij de andere zinnen in `lib/bkWeergave.ts` (I3).
 */
export function nogNietGedektZin(competenties: number, beroepskwalificaties: number): string {
  if (competenties <= 0) return 'Alle competenties zijn gedekt.';
  const inBks = enkelOfMeer(beroepskwalificaties, 'beroepskwalificatie', 'beroepskwalificaties');
  const open = beroepskwalificaties === 1 ? 'de beroepskwalificatie' : 'een beroepskwalificatie';
  return competenties === 1
    ? `1 competentie in ${inBks} is nog niet gedekt. Open ${open} om ze te zien.`
    : `${competenties} competenties in ${inBks} zijn nog niet gedekt. Open ${open} om ze te zien.`;
}

/**
 * De regel voor een beroepskwalificatie waarvan het bestand ontbreekt: de titel in het vet, een punt en de uitleg. Een punt of
 * spaties achteraan de titel vallen weg (de regel zet zelf een punt), een lege titel valt weg met haar punt. Geëxporteerd voor
 * de test; de zin hoort bij de andere zinnen in `lib/bkWeergave.ts` (I3).
 */
export function ZonderBestandRegel({ titel }: { titel: string }) {
  const naam = typeof titel === 'string' ? titel.trim().replace(/[.\s]+$/, '') : '';
  return (
    <p className="dk-uitleg">
      {naam !== '' && <><strong>{naam}</strong>. </>}
      {BK_ZONDER_BESTAND}
    </p>
  );
}

/** De radio "Toon": alle competenties, of alleen wat nog niet gedekt is. */
function ToonKeuze({ toon, onToon }: { toon: Toon; onToon: (t: Toon) => void }) {
  const naam = useId();
  return (
    <fieldset className="dk-fieldset">
      <legend>Toon</legend>
      <div className="dk-radios">
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={toon === 'alle'} onChange={() => onToon('alle')} />
          <span>{BK_TOON_ALLE}</span>
        </label>
        <label className="dk-keuze">
          <input type="radio" name={naam} checked={toon === 'open'} onChange={() => onToon('open')} />
          <span>{BK_TOON_OPEN}</span>
        </label>
      </div>
    </fieldset>
  );
}

function RijStatus({ rij }: { rij: MdRij }) {
  return (
    <li className="dk-doel">
      <p className="dk-doel-tekst">{bkCompetentieRegel(rij.doel.code, rij.doel.tekst)}</p>
      <DoelStatus rij={rij} />
    </li>
  );
}

/** Eén beroepskwalificatie: een uitklapper met haar competenties. Ze staan pas in de pagina als ze openstaat. */
function BkUitklapper({ groep, naam }: { groep: SetGroep; naam: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="dk-set" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{bkSetSamenvatting(naam, groep.gedekt, groep.totaal)}</summary>
      {/* Bij "Nog niet gedekt" staan alleen de beroepskwalificaties met iets dat open is (zichtbareSets): een lege lijst komt dus niet voor. */}
      {open && groep.rijen.length > 0 && (
        <ul className="dk-doelen">
          {groep.rijen.map((rij) => <RijStatus key={`${rij.doel.set}|${rij.doel.id}`} rij={rij} />)}
        </ul>
      )}
    </details>
  );
}

function PerBk({ dekking, toon, namen }: { dekking: MdDekking; toon: Toon; namen: ReadonlyMap<string, string> }) {
  const groepen = useMemo(() => zichtbareSets(groepeerPerSet(dekking, toon), toon), [dekking, toon]);
  // De beroepskwalificaties staan dicht: zonder deze zin zou "Nog niet gedekt" niets zichtbaar of hoorbaar veranderen. De regel
  // staat er altijd (ook leeg), want een live-gebied moet er al staan voor de tekst verandert.
  const zin = toon === 'open' && dekking.rijen.length > 0
    ? nogNietGedektZin(groepen.reduce((n, g) => n + g.rijen.length, 0), groepen.length)
    : '';
  return (
    <>
      <p className="dk-toon-zin" aria-live="polite">{zin}</p>
      <div className="dk-sets">
        {groepen.map((g) => <BkUitklapper key={g.set} groep={g} naam={namen.get(g.set) ?? g.setNaam} />)}
      </div>
    </>
  );
}

// ── Het blok ────────────────────────────────────────────────────────────────

export function BkDekking({ info, keuze, bk, courses, curricula, matrix, vandaag, telMee }: BkDekkingProps) {
  const kopId = useId();
  /** De kop van het blok: na "Opnieuw proberen" gaat de focus hierheen, want de knop verdwijnt. */
  const kop = useRef<HTMLHeadingElement>(null);
  // Eén versie één keer, en alleen de versies waarvan de index een bestand kent.
  const versies = useMemo(() => [...new Set(bk.bks.filter((r) => r.zonderBestand !== true).map((r) => r.bk))], [bk.bks]);
  const { stand, opnieuw } = useLaadstand<Map<string, BkBestand>>(`bk-dekking|${versies.join('|')}`, () => laadAlle(versies));
  // De oefeningen van dit toestel tellen mee voor wat een cursus behandelt (zoals bij de minimumdoelen).
  const widgets = useToestelWidgets();
  const [toon, setToon] = useState<Toon>('alle');

  // Dezelfde cursussen als de dekking op minimumdoelen, ook als dat blok er niet is.
  const telJaar = telMee === 'jaar' ? keuze.jaar : undefined;
  const soort = keuze.soort;
  const bijdragen = useMemo(
    () => bijdragenVoorKader({ courses, curricula, info, soort, matrix, vandaag, ...(telJaar !== undefined ? { jaar: telJaar } : {}) }),
    [courses, curricula, info, soort, matrix, vandaag, telJaar],
  );
  const bestanden = stand.status === 'klaar' ? stand.waarde : undefined;
  const kader = useMemo(() => (bestanden ? bkKaderDoelen(bk, bestanden) : undefined), [bk, bestanden]);
  const dekking = useMemo(() => (kader ? dekkingBk(kader, bijdragen, widgets) : undefined), [kader, bijdragen, widgets]);
  // Twee beroepskwalificaties met dezelfde titel krijgen hun officiële nummer erachter (altijd ná een naam).
  const namen = useMemo(() => (dekking ? uniekeSetNamen(dekking.perSet, (set) => set) : new Map<string, string>()), [dekking]);
  const leerplanTitels = useMemo(() => new Map(bijdragen.map((b) => [b.course.id, b.leerplan?.title])), [bijdragen]);

  // Beroepskwalificaties zonder bestand tellen niet mee: dat zeggen we erbij, anders lijkt de dekking kleiner dan ze is.
  const zonderBestand = bestanden ? bk.bks.filter((r) => !bestanden.has(r.bk)) : [];
  const nietMee = dekking ? dekking.cursussen.filter((c) => !c.telt) : [];
  const andereVersie = dekking ? bkAndereVersieTekst(dekking.zelfdeNummerAndereSet) : '';

  return (
    <div className="dk-bk" aria-labelledby={kopId} role="group">
      <h3 id={kopId} ref={kop} tabIndex={-1} className="dk-blokkop">{BK_DEKKING_TITEL}</h3>
      {stand.status === 'laden' && <LaadBericht tekst={BK_LADEN} />}
      {/* De knop verdwijnt zodra het opnieuw laadt: de focus gaat eerst naar de kop, anders valt hij terug op de pagina. */}
      {stand.status === 'fout' && <FoutBericht fout={stand.fout} onOpnieuw={() => { kop.current?.focus(); opnieuw(); }} />}
      {dekking && (
        <>
          {zonderBestand.map((r) => <ZonderBestandRegel key={r.bk} titel={r.titel} />)}
          {(dekking.rijen.length > 0 || zonderBestand.length === 0) && (
            <div aria-live="polite">
              <p className="dk-samenvatting"><strong>{bkSamenvatting(dekking)}</strong></p>
              {andereVersie !== '' && <p className="dk-uitleg dk-extra">{andereVersie}</p>}
            </div>
          )}
          {dekking.rijen.length > 0 && (
            <>
              <ToonKeuze toon={toon} onToon={setToon} />
              <PerBk dekking={dekking} toon={toon} namen={namen} />
            </>
          )}
          {nietMee.length > 0 && (
            <div className="dk-cursussen">
              <h4>Cursussen die niet meetellen</h4>
              <p className="dk-uitleg">{bkNietMeetellendeTekst(nietMee.length)}</p>
              <ul className="dk-cursuslijst">
                {nietMee.map((c) => (
                  <li key={c.courseId} className="dk-cursus">
                    <Link className="dk-cursus-titel" to={`/cursus/bewerk/${encodeURIComponent(c.courseId)}`}>{c.titel}</Link>
                    <span className="dk-cursus-reden">{bkRedenTekst(c.reden ?? 'geen-leerplan', leerplanTitels.get(c.courseId))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
