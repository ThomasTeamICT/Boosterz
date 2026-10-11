// Eén kaart per beroepskwalificatie in de sectie "Beroepskwalificaties" van een richting (docs/STUDIERICHTINGEN.md § 23.7.2):
// de titel, de meta, de definitie, de competenties met hun kennis en vaardigheden, en de knoppen. De kaart toont wat ze krijgt;
// het laden van haar bestand, het bewaren van een leerplan en het openen van het venster doet de sectie (BkSectie.tsx).
//
// Wat nooit op het scherm komt: de competentiecode, het ADV-nummer, het onderdeelnummer, het groepnummer en een set-id. Het
// BK-nummer staat alleen in de meta, ná de titel. Elk aantal competenties komt uit `aantalCompetentiesMetTekst`, en de lijst
// uit `bkKaderDoelen`: precies de competenties die ook in het leerplan en in de dekking staan.

import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AddIcon, BeroepIcon, GoalIcon, InfoIcon, WarningIcon } from '../../icons';
import { FoutBericht, LaadBericht } from '../../curriculum/LaadStatus';
import type { BkBestand, BkTekst, Competentie } from '../../../lib/beroepskwalificaties';
import {
  BK_DEFINITIE_VRAAG,
  BK_GEEN_KENNIS,
  BK_KENNIS_KOP,
  BK_KNOP_BEWAAR,
  BK_KNOP_CURSUS,
  BK_KNOP_OPEN,
  BK_LADEN,
  BK_NIEUWERE_VERSIE,
  BK_VAARDIGHEDEN_KOP,
  BK_ZONDER_BESTAND,
  bkKaartMeta,
  bkKennisEnVaardigheden,
  bkKnopSrTekst,
  bkNietMeerInBron,
  bkSoortVoorvoegsel,
  bkToonCompetenties,
} from '../../../lib/bkWeergave';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { aantalCompetentiesMetTekst } from '../../../lib/dekkingBk';
import { htmlNaarTekst } from '../../../lib/minimumdoelen';
import type { RichtingBkRegel } from '../../../lib/richtingBk';
import type { Laadstand } from '../../../lib/useLaadstand';
import { BK_ANDERE_COMPETENTIES, kaderVan, redenBewaar, redenCursus } from './bkSectieHulp';

/** Het bestand van één BK-versie: laden, mislukt, of klaar (`null`: het bestand bestaat niet). */
export type BestandStand = Laadstand<BkBestand | null>;

// ── Wat de kaart toont ──────────────────────────────────────────────────────

/** Een competentie zoals ze op de kaart komt: de officiële tekst, het soort, en de kennis en vaardigheden. */
interface Rij {
  /** Alleen als sleutel van de lijst, nooit op het scherm. */
  sleutel: string;
  tekst: string;
  soort: string;
  kennis: BkTekst[];
  vaardigheden: BkTekst[];
}

/** Kennis of vaardigheden als gewone tekst, zonder lege regels. */
function teksten(lijst: readonly BkTekst[] | undefined): BkTekst[] {
  const uit: BkTekst[] = [];
  for (const t of Array.isArray(lijst) ? lijst : []) {
    const tekst = typeof t?.tekst === 'string' ? htmlNaarTekst(t.tekst).replace(/\s+/g, ' ').trim() : '';
    if (tekst !== '') uit.push({ ...(typeof t.type === 'string' && t.type.trim() !== '' ? { type: t.type.trim() } : {}), tekst });
  }
  return uit;
}

function rijenVan(versie: string, bestand: BkBestand): Rij[] {
  const perId = new Map<string, Competentie>();
  for (const c of bestand.competenties) if (!perId.has(c.id)) perId.set(c.id, c);
  return kaderVan(versie, bestand).map((d) => {
    const c = perId.get(d.id);
    return { sleutel: d.id, tekst: d.tekst, soort: d.rubriek ?? '', kennis: teksten(c?.kennis), vaardigheden: teksten(c?.vaardigheden) };
  });
}

/** De competenties per soort, in de volgorde waarin elk soort voor het eerst voorkomt. */
function perSoort(rijen: readonly Rij[]): { soort: string; rijen: Rij[] }[] {
  const groepen = new Map<string, Rij[]>();
  for (const r of rijen) groepen.set(r.soort, [...(groepen.get(r.soort) ?? []), r]);
  return [...groepen].map(([soort, lijst]) => ({ soort, rijen: lijst }));
}

/** "(Basiskennis) " vooraan een regel, alleen als de lijst meer dan één soort heeft. */
function TekstLijst({ kop, lijst }: { kop: string; lijst: readonly BkTekst[] }) {
  if (lijst.length === 0) return null;
  const metSoort = new Set(lijst.map((t) => t.type ?? '')).size > 1;
  return (
    <>
      <h4>{kop}</h4>
      <ul>
        {lijst.map((t, i) => <li key={i}>{metSoort ? bkSoortVoorvoegsel(t.type) : ''}{t.tekst}</li>)}
      </ul>
    </>
  );
}

function CompetentieRij({ rij }: { rij: Rij }) {
  const leeg = rij.kennis.length === 0 && rij.vaardigheden.length === 0;
  return (
    <li className="bk-competentie">
      <p className="bk-comp-tekst">{rij.tekst}</p>
      {leeg ? (
        <p className="bk-leeg">{BK_GEEN_KENNIS}</p>
      ) : (
        <details className="bk-details bk-kv">
          <summary>{bkKennisEnVaardigheden(rij.kennis.length, rij.vaardigheden.length)}</summary>
          <div className="bk-details-body">
            <TekstLijst kop={BK_KENNIS_KOP} lijst={rij.kennis} />
            <TekstLijst kop={BK_VAARDIGHEDEN_KOP} lijst={rij.vaardigheden} />
          </div>
        </details>
      )}
    </li>
  );
}

/** De lijst competenties; met een kop per soort als de bron meer dan één soort geeft. */
function Competenties({ rijen }: { rijen: readonly Rij[] }) {
  const groepen = useMemo(() => perSoort(rijen), [rijen]);
  const meerdere = groepen.length > 1;
  let start = 1;
  return (
    <>
      {groepen.map((g) => {
        const begin = start;
        start += g.rijen.length;
        return (
          <div key={g.soort}>
            {meerdere && <h4 className="bk-soort">{g.soort !== '' ? g.soort : BK_ANDERE_COMPETENTIES}</h4>}
            <ol className="bk-competenties" start={begin}>
              {g.rijen.map((r) => <CompetentieRij key={r.sleutel} rij={r} />)}
            </ol>
          </div>
        );
      })}
    </>
  );
}

// ── De kaart ────────────────────────────────────────────────────────────────

export interface BkKaartProps {
  regel: RichtingBkRegel;
  /** Het bestand van deze BK-versie; `undefined` zolang de sectie het niet gevraagd heeft (of er geen is). */
  stand: BestandStand | undefined;
  /** De namen van de varianten waarin de beroepskwalificatie alleen geldt; leeg = in alle varianten. */
  alleenIn: readonly string[];
  /** Het nagekeken leerplan op dit toestel met alle competenties van deze versie (`vindBkLeerplan`). */
  bestaand: Curriculum | undefined;
  /** "Bewaar als leerplan" kan pas als de sectie het versiemerk van de index kent. */
  kanBewaren: boolean;
  /** Er wordt al een leerplan gemaakt of bijgewerkt. */
  bezig: boolean;
  /** `callout err` onder de knoppen: het leerplan kon niet als nagekeken bewaard worden. */
  fout: string | null;
  /** Na het bewaren: de focus gaat naar "Open het leerplan" zodra die link er staat. */
  focusOpen: boolean;
  onFocusKlaar: () => void;
  onCursus: () => void;
  onBewaar: () => void;
  /** "Opnieuw proberen" na een laadfout van dit bestand. */
  onOpnieuw: () => void;
  /** De meldingen over bestaande leerplannen van deze beroepskwalificatie, onder de knoppen. */
  children?: ReactNode;
}

export function BkKaart({
  regel, stand, alleenIn, bestaand, kanBewaren, bezig, fout, focusOpen, onFocusKlaar, onCursus, onBewaar, onOpnieuw, children,
}: BkKaartProps) {
  const kopId = useId();
  const nodigId = useId();
  const bewaarId = useId();
  const kopRef = useRef<HTMLHeadingElement>(null);
  const openRef = useRef<HTMLAnchorElement>(null);

  const bestand = stand?.status === 'klaar' && stand.waarde !== null ? stand.waarde : undefined;
  const zonderBestand = regel.zonderBestand === true || (stand?.status === 'klaar' && stand.waarde === null);
  const laden = !zonderBestand && (stand === undefined || stand.status === 'laden');
  const mislukt = stand?.status === 'fout' && !zonderBestand ? stand.fout : undefined;

  const rijen = useMemo(() => (bestand ? rijenVan(regel.bk, bestand) : []), [regel.bk, bestand]);
  const meta = bkKaartMeta({
    bk: regel.bk,
    ...(regel.vks !== undefined ? { vks: regel.vks } : {}),
    ...(bestand ? { aantal: aantalCompetentiesMetTekst(bestand) } : {}),
    alleenIn,
    ...(regel.totDatum !== undefined ? { totDatum: regel.totDatum } : {}),
  });
  const definitie = bestand?.definitie ? htmlNaarTekst(bestand.definitie).trim() : '';
  const kan = bestand !== undefined;
  // Elke knop die nog niet kan, zegt waarom (aria-disabled met "Nog nodig: …", § 23.7.7), en elke toestand heeft zijn eigen reden.
  const cursusReden = redenCursus({ laden, heeftBestand: kan });
  const bewaarReden = bestaand ? undefined : redenBewaar({ laden, heeftBestand: kan, kanBewaren, bezig });
  const bewaarEigenReden = bewaarReden !== undefined && bewaarReden !== cursusReden;

  // Na "Bewaar als leerplan" verdwijnt de knop: de focus gaat naar de nieuwe link "Open het leerplan". Alleen als de focus echt
  // verloren ging (de knop is weg): wie intussen elders staat, blijft daar.
  useEffect(() => {
    if (!focusOpen || !bestaand || !openRef.current) return;
    const actief = document.activeElement;
    if (!actief || actief === document.body) openRef.current.focus();
    onFocusKlaar();
  }, [focusOpen, bestaand, onFocusKlaar]);

  return (
    <article className="bk-kaart" aria-labelledby={kopId}>
      <div className="bk-kaart-kop">
        <span className="bk-icoon" aria-hidden="true"><BeroepIcon size={20} /></span>
        <div className="bk-kaart-titel">
          <h3 id={kopId} ref={kopRef} tabIndex={-1}>{regel.titel}</h3>
          {meta !== '' && <p className="bk-meta">{meta}</p>}
        </div>
      </div>

      {regel.nietMeerInBron !== undefined && (
        <div className="callout warn bk-melding" role="note">
          <WarningIcon size={20} className="bk-melding-icoon" />
          <div className="bk-melding-tekst"><p>{bkNietMeerInBron(regel.nietMeerInBron)}</p></div>
        </div>
      )}
      {regel.nieuwereVersie !== undefined && (
        <div className="callout bk-melding" role="note">
          <InfoIcon size={20} className="bk-melding-icoon" />
          <div className="bk-melding-tekst"><p>{BK_NIEUWERE_VERSIE}</p></div>
        </div>
      )}
      {zonderBestand && <p className="bk-leeg">{BK_ZONDER_BESTAND}</p>}
      {laden && <LaadBericht tekst={BK_LADEN} />}
      {mislukt !== undefined && (
        <FoutBericht
          fout={mislukt}
          onOpnieuw={() => {
            onOpnieuw();
            kopRef.current?.focus();
          }}
        />
      )}

      {bestand && definitie !== '' && (
        <details className="bk-details">
          <summary>{BK_DEFINITIE_VRAAG}</summary>
          <div className="bk-details-body"><p className="bk-definitie">{definitie}</p></div>
        </details>
      )}
      {bestand && rijen.length > 0 && (
        <details className="bk-details">
          <summary>{bkToonCompetenties(rijen.length)}</summary>
          <div className="bk-details-body"><Competenties rijen={rijen} /></div>
        </details>
      )}

      <div className="bk-knoppen">
        <button
          type="button" className="btn btn-primary bk-knop" aria-disabled={cursusReden === undefined ? undefined : 'true'}
          aria-describedby={cursusReden === undefined ? undefined : nodigId} onClick={cursusReden === undefined ? onCursus : undefined}
        >
          <AddIcon size={18} /> {BK_KNOP_CURSUS}<span className="sr-only">{bkKnopSrTekst(regel.titel)}</span>
        </button>
        {bestaand ? (
          <Link ref={openRef} className="btn btn-ghost bk-knop" to={`/leerplannen?open=${encodeURIComponent(bestaand.id)}`}>
            <GoalIcon size={18} /> {BK_KNOP_OPEN}
          </Link>
        ) : (
          <button
            type="button" className="btn btn-ghost bk-knop" aria-disabled={bewaarReden === undefined ? undefined : 'true'}
            aria-describedby={bewaarReden === undefined ? undefined : bewaarEigenReden ? bewaarId : nodigId}
            onClick={bewaarReden === undefined ? onBewaar : undefined}
          >
            <GoalIcon size={18} /> {BK_KNOP_BEWAAR}
          </button>
        )}
      </div>
      {cursusReden !== undefined && <p id={nodigId} className="bk-nodig">{cursusReden}</p>}
      {bewaarEigenReden && <p id={bewaarId} className="bk-nodig">{bewaarReden}</p>}
      {fout && (
        <div className="callout err bk-melding" role="alert">
          <WarningIcon size={20} className="bk-melding-icoon" />
          <div className="bk-melding-tekst"><p>{fout}</p></div>
        </div>
      )}
      {children}
    </article>
  );
}
