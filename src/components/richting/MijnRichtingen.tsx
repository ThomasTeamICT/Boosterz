// "Mijn richtingen" bovenaan de lijst met studierichtingen (docs/STUDIERICHTINGEN.md § 22.5, F2.3): de richtingen waarvoor je
// cursussen of klassen hebt op dit toestel, met wat je cursussen samen dekken.
//
// - De rijen komen meteen uit de opslag, zonder netwerk (`mijnRichtingen`). Zodra de matrix er is, komt de titel daaruit.
// - De dekking per rij staat in `DekkingKort`, dat lui geladen wordt en pas rekent als de rij zichtbaar is, één richting
//   tegelijk. Hier staat alleen wat er zonder berekening te zeggen valt: een richting die niet (meer) in de matrix staat, en
//   een richting zonder cursus.
// - Zonder rijen geen blok. Nooit een groepnummer op het scherm.

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RetryIcon } from '../icons';
import type { DekkingKortProps } from './DekkingKort';
import type { Course } from '../../lib/courseTypes';
import { getCourses } from '../../lib/courses';
import type { ClassGroup } from '../../lib/classTypes';
import { getClasses } from '../../lib/classes';
import { getCurricula } from '../../lib/curriculum';
import { probeOnline } from '../../lib/offline';
import type { Curriculum } from '../../lib/curriculumTypes';
import { richtingInfo, type RichtingInfo, type SoortKeuze } from '../../lib/richtingKader';
import { linkVoorRij, mijnRichtingen, mijnRichtingMeta, type MijnRichting } from '../../lib/richtingOverzicht';
import { onStorageChange } from '../../lib/storage';
import { vergelijkGroepnummer } from '../../lib/studierichtingen';
import type { RichtingGegevens } from '../../lib/studierichtingenBron';
import type { Laadstand } from '../../lib/useLaadstand';
import '../../styles/mijnrichtingen.css';

// ── Teksten (§ 22.5.4, letterlijk) ──────────────────────────────────────────

const TEKST_BEZIG = 'De dekking wordt berekend…';
const TEKST_FOUT = 'De dekking kon niet berekend worden.';
const TEKST_GEEN_CURSUS = 'Nog geen cursus voor deze richting.';
// Dezelfde zin staat in DekkingKort.tsx; die component importeren we hier niet, want ze wordt lui geladen.
const TEKST_NIET_IN_MATRIX = 'Deze richting staat niet (meer) in de officiële matrix.';
/** Een rij zonder titel (geen enkele cursus of klas bewaarde er een) die ook niet in de matrix staat. */
const TITEL_ONBEKEND = 'Studierichting';

// ── De dekking van een rij: lui geladen ─────────────────────────────────────

type KaartType = ComponentType<DekkingKortProps>;

let kaartBelofte: Promise<KaartType> | null = null;
let geladenKaart: KaartType | null = null;

/**
 * Laadt `DekkingKort` één keer voor alle rijen. Mislukt het (offline), dan wordt de belofte gewist, zodat "Opnieuw proberen"
 * het echt nog eens vraagt. We laden zelf (zoals GoalCoverage met zijn weergave "Minimumdoelen") in plaats van met
 * `React.lazy`: een mislukte import hoort bij één rij een melding te geven, niet de hele pagina te laten verdwijnen.
 */
function laadKaart(): Promise<KaartType> {
  if (!kaartBelofte) {
    const belofte = import('./DekkingKort').then((m) => {
      geladenKaart = m.default;
      return m.default;
    });
    kaartBelofte = belofte;
    belofte.catch(() => {
      if (kaartBelofte === belofte) kaartBelofte = null;
    });
  }
  return kaartBelofte;
}

type KaartStand = { status: 'laden' } | { status: 'klaar'; Kaart: KaartType } | { status: 'fout' };

function DekkingVanRij({ groep, soort, titel }: { groep: string; soort: SoortKeuze; titel: string }) {
  const [stand, setStand] = useState<KaartStand>(() => (geladenKaart ? { status: 'klaar', Kaart: geladenKaart } : { status: 'laden' }));
  const [poging, setPoging] = useState(0);
  const tekst = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let weg = false;
    laadKaart().then(
      (Kaart) => { if (!weg) setStand({ status: 'klaar', Kaart }); },
      async () => {
        // Een mislukte import laat zich in dezelfde pagina meestal niet herhalen (de browser onthoudt de mislukking, en na een
        // nieuwe uitgave bestaat het bestand niet meer). Mislukt ook de tweede poging terwijl er verbinding is, dan herladen we
        // de pagina: wat je deed zit in de opslag en de adresbalk, dus er gaat niets verloren.
        if (poging > 0 && !weg && (await probeOnline(new URL('./', document.baseURI).href, navigator.onLine))) {
          window.location.reload();
          return;
        }
        if (!weg) setStand({ status: 'fout' });
      },
    );
    return () => { weg = true; };
  }, [poging]);

  if (stand.status === 'klaar') {
    const Kaart = stand.Kaart;
    return <Kaart groep={groep} soort={soort} plaats="rij" titel={titel} />;
  }
  const fout = stand.status === 'fout';
  const opnieuw = () => {
    // De knop verdwijnt: de focus gaat naar de regel, die daarna "wordt berekend…" zegt.
    tekst.current?.focus();
    setStand({ status: 'laden' });
    setPoging((p) => p + 1);
  };
  return (
    <div className="mr-kaart">
      <p ref={tekst} className="mr-tekst" tabIndex={-1}>{fout ? TEKST_FOUT : TEKST_BEZIG}</p>
      {fout && (
        <button type="button" className="btn btn-sm btn-ghost mr-opnieuw" onClick={opnieuw}>
          <RetryIcon size={16} /> Opnieuw proberen<span className="sr-only"> ({titel})</span>
        </button>
      )}
    </div>
  );
}

// ── De rijen ────────────────────────────────────────────────────────────────

interface Opslag {
  courses: Course[];
  curricula: Curriculum[];
  klassen: ClassGroup[];
}

function leesOpslag(): Opslag {
  return { courses: getCourses(), curricula: getCurricula(), klassen: getClasses() };
}

interface RijMetInfo {
  rij: MijnRichting;
  /** `undefined`: de matrix is er nog niet, of de groep staat er niet in (zie `matrixKlaar`). */
  info: RichtingInfo | undefined;
  titel: string;
}

function Rij({ item, matrixKlaar, gegevensStand, lijstZoek }: {
  item: RijMetInfo;
  matrixKlaar: boolean;
  gegevensStand: Laadstand<RichtingGegevens>['status'];
  lijstZoek: string;
}) {
  const { rij, info, titel } = item;
  const nietInMatrix = matrixKlaar && info === undefined;
  const meta = mijnRichtingMeta(rij, info?.afgebouwd ? { afgebouwd: true } : undefined);
  const kop = (
    <>
      <span className="mr-titel">{titel}</span>
      <span className="mr-meta">{meta}</span>
    </>
  );

  let dekking: ReactNode = null;
  if (nietInMatrix) dekking = <div className="mr-kaart"><p className="mr-tekst">{TEKST_NIET_IN_MATRIX}</p></div>;
  else if (rij.cursussen === 0) dekking = <div className="mr-kaart"><p className="mr-tekst">{TEKST_GEEN_CURSUS}</p></div>;
  else if (info) dekking = <DekkingVanRij groep={rij.groep} soort={rij.soort} titel={titel} />;
  // Zonder matrix: tijdens het laden zeggen we dat de dekking komt; mislukt het laden of is de matrix er nog niet, dan zegt de
  // pagina dat zelf (GegevensStand) en blijft de rij stil.
  else if (gegevensStand === 'laden') dekking = <div className="mr-kaart"><p className="mr-tekst">{TEKST_BEZIG}</p></div>;

  return (
    <li className="mr-rij">
      {nietInMatrix
        ? <div className="mr-kop">{kop}</div>
        : <Link className="mr-kop mr-link" to={linkVoorRij(rij)} state={{ lijst: lijstZoek }}>{kop}</Link>}
      {dekking}
    </li>
  );
}

/** Op titel (nederlands), dan op groepnummer, dan gewoon vóór buitengewoon; wat niet in de matrix staat achteraan. */
function sorteer(rijen: RijMetInfo[]): RijMetInfo[] {
  return [...rijen].sort((a, b) =>
    (a.info === undefined ? 1 : 0) - (b.info === undefined ? 1 : 0)
    || a.titel.localeCompare(b.titel, 'nl', { sensitivity: 'base' })
    || vergelijkGroepnummer(a.rij.groep, b.rij.groep)
    || (a.rij.soort === b.rij.soort ? 0 : a.rij.soort === 'so' ? -1 : 1));
}

export function MijnRichtingen({ stand, vandaag, lijstZoek }: {
  stand: Laadstand<RichtingGegevens>;
  /** JJJJ-MM-DD: bepaalt wat afgebouwd is. */
  vandaag: string;
  /** De adresbalk van de lijst, zodat "Alle richtingen" in de richting de lijst terugbrengt zoals ze was. */
  lijstZoek: string;
}) {
  // Cursussen, leerplannen en klassen van dit toestel; ze lezen opnieuw als er elders (ook in een ander tabblad) iets bewaard wordt.
  const [opslag, setOpslag] = useState(leesOpslag);
  useEffect(() => onStorageChange(() => setOpslag(leesOpslag())), []);

  const rijen = useMemo(() => mijnRichtingen(opslag), [opslag]);
  const matrix = stand.status === 'klaar' ? stand.waarde.matrix : undefined;
  const items = useMemo<RijMetInfo[]>(() => {
    const uit = rijen.map<RijMetInfo>((rij) => {
      const info = matrix ? richtingInfo(matrix, rij.groep, vandaag) : undefined;
      return { rij, info, titel: info?.groep.titel ?? (rij.titel || TITEL_ONBEKEND) };
    });
    // Zonder matrix blijft de volgorde van `mijnRichtingen` (op de bewaarde titel); met matrix sorteren we op de echte titel.
    return matrix ? sorteer(uit) : uit;
  }, [rijen, matrix, vandaag]);

  if (items.length === 0) return null;
  return (
    <section className="mr" aria-labelledby="mr-kop">
      <h2 id="mr-kop">Mijn richtingen</h2>
      <p className="hint mr-hint">De richtingen waarvoor je cursussen of klassen hebt op dit toestel, met wat je cursussen samen dekken.</p>
      <ul className="mr-lijst">
        {items.map((item) => (
          <Rij key={item.rij.sleutel} item={item} matrixKlaar={matrix !== undefined} gegevensStand={stand.status} lijstZoek={lijstZoek} />
        ))}
      </ul>
    </section>
  );
}
