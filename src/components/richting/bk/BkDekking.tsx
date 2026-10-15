// Het tweede blok van "Wat je cursussen samen dekken": de competenties van de beroepskwalificaties
// (docs/STUDIERICHTINGEN.md § 23.7.4). Dit bestand zit in een lui chunk.
//
// Het blok rekent zelf: het laadt de bestanden van de beroepskwalificaties van de richting (`bkVersiesOmTeLaden`), kiest met
// `bijdragenVoorKader` welke cursussen meetellen (dezelfde keuze als de dekking op minimumdoelen, ook als dat blok `geen` is) en
// rekent met `dekkingBkVanRichting`: dezelfde pijplijn als de rij van "Mijn richtingen" en de klas (F3b-B1, I4). De zinnen komen
// uit `bkWeergave.ts` (nooit uit `samenvatting` van het resultaat) en de namen van twee beroepskwalificaties met dezelfde titel
// worden met `uniekeSetNamen` onderscheiden. Nooit op het scherm: een competentiecode, een ADV-nummer, een onderdeelnummer of een
// groepnummer. De getallen van de dekking op minimumdoelen blijven wat ze waren.
//
// Fase 3b (§ 24.6.2, 3b-S2) voegt twee dingen toe:
// - Onder de samenvatting de knop "Plan de … competenties die nog nergens aan bod komen" (of de zin dat er geen meer zijn). Het
//   venster (`BkGatenVenster`) laadt pas bij de klik en werkt met de momentopname van dit blok. Na het plannen in een bestaande
//   cursus sluit het venster en gaat de focus naar de kop van het blok; sluit de leerkracht het zonder te plannen, dan zet het
//   venster de focus zelf terug op de knop.
// - De korte regel voor "Mijn richtingen" en de klas gaat in de cache (`bewaarBkKort`), maar alleen bij "Alle jaren" en zonder
//   variant: met een jaar of een variant rekent het blok iets anders dan de rij (F3b-B7), en dat getal hoort daar niet te staan.

import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { FoutBericht, LaadBericht } from '../../curriculum/LaadStatus';
import { PlannedIcon, RetryIcon, WarningIcon } from '../../icons';
import type { BkBestand } from '../../../lib/beroepskwalificaties';
import { laadBk } from '../../../lib/beroepskwalificatiesBron';
import {
  BK_ANDERE_CURSUSSEN_KOP,
  BK_DEKKING_TITEL,
  BK_GEEN_OPEN,
  BK_LADEN,
  bkAndereVersieTekst,
  bkNietMeetellendeTekst,
  bkPlanKnopTekst,
  bkRedenTekst,
  bkSamenvatting,
} from '../../../lib/bkWeergave';
import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { dekkingBkVanRichting, bkVersiesOmTeLaden } from '../../../lib/dekkingBk';
import { dekkingGeneratie, bewaarBkKort } from '../../../lib/dekkingCache';
import type { MdDekking } from '../../../lib/dekkingMinimumdoelen';
import { uniekeSetNamen, type Toon } from '../../../lib/dekkingWeergave';
import { openVerplichteDoelen } from '../../../lib/gatenDichten';
import { FOUT_LADEN_GATEN } from '../../../lib/gatenWeergave';
import type { RichtingBk } from '../../../lib/richtingBk';
import { kaderGroepSleutel, type RichtingInfo, type RichtingKeuze, type SoortKeuze } from '../../../lib/richtingKader';
import { bijdragenVoorKader, bkKortVan } from '../../../lib/richtingOverzicht';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import { useLaadstand } from '../../../lib/useLaadstand';
import type { BkStand } from '../useRichtingBk';
import { useToestelWidgets, type TelMee } from '../useRichtingDekking';
import type { BkGatenVensterProps } from './BkGatenVenster';
import '../../../styles/dekking.css';
import '../../../styles/gaten.css';

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

// ── De lijst ────────────────────────────────────────────────────────────────
// De uitklappers, "Toon" en de zinnen staan in BkLijst.tsx (ook voor de cursuseditor); ze blijven hier ook uitgevoerd.

import { BkToonKeuze, PerBk, ZonderBestandRegel } from './BkLijst';

export { nogNietGedektZin, ZonderBestandRegel } from './BkLijst';

// ── De cache voor "Mijn richtingen" en de klas ──────────────────────────────

/**
 * Bewaart de korte regel over de competenties van deze richting in de cache (`bewaarBkKort`), met dezelfde getallen als de rij
 * en de klas ze rekenen (I4). Alleen bij "Alle jaren" en zonder variant (F3b-B7): met een jaar of een variant telt dit blok
 * anders dan de rij (`bkKader` maakt voor een variant een ander kader), en dat getal hoort daar niet te staan. `generatie` is
 * `dekkingGeneratie()` bij het begin van de berekening: veranderde de opslag intussen, dan bewaart de cache niets. Geeft terug
 * of het blok de cache mocht vullen.
 */
export function bewaarKortVanDetail(o: {
  info: RichtingInfo;
  /** Het soort onderwijs van het kader (`keuze.soort`): samen met de richting de sleutel van de cache. */
  soort: SoortKeuze;
  telMee: TelMee;
  bk: RichtingBk;
  dekking: MdDekking;
  bestanden: ReadonlyMap<string, unknown>;
  generatie: number;
}): boolean {
  if (o.telMee !== 'alle' || o.bk.onderdeel !== undefined) return false;
  bewaarBkKort(kaderGroepSleutel(o.info, o.soort), bkKortVan(o.dekking, o.bk, o.bestanden), o.generatie);
  return true;
}

// ── Het venster om te plannen ───────────────────────────────────────────────

// Het venster (en wat het zwaar maakt: bkGatenHulp, BkKeuze, bkCursus) wordt pas geladen als de leerkracht op de knop klikt. We
// laden het eerst los (`laadVenster`): lukt dat niet (de verbinding viel weg), dan blijft de pagina zoals ze is, met een melding
// bij de knop, in plaats van dat de pagina met een fout vervangen wordt.
const laadVenster = () => import('./BkGatenVenster');
const BkGatenVenster = lazy(() => laadVenster().then((m) => ({ default: m.BkGatenVenster })));

/**
 * Onder de samenvatting (§ 24.6.2): de knop om de competenties die nog nergens aan bod komen te plannen, of de zin dat er geen
 * meer zijn. De knop opent het venster met de dekking zoals ze nu op het scherm staat.
 */
function PlanBlok({ dekking, laadt, fout, onPlan, knopRef }: {
  dekking: MdDekking;
  laadt: boolean;
  fout: boolean;
  onPlan: () => void;
  knopRef: RefObject<HTMLButtonElement>;
}) {
  const aantal = useMemo(() => openVerplichteDoelen(dekking).length, [dekking]);
  if (aantal === 0) return <p className="gt-geen">{BK_GEEN_OPEN}</p>;
  return (
    <div className="gt-plan">
      <button ref={knopRef} type="button" className="btn btn-primary gt-plan-knop" aria-busy={laadt || undefined} onClick={onPlan}>
        <PlannedIcon size={18} aria-hidden="true" /> {bkPlanKnopTekst(aantal)}
      </button>
      {fout && (
        <div className="callout err gt-melding" role="alert">
          <WarningIcon size={18} aria-hidden="true" />
          <div className="gt-melding-tekst">
            <p>{FOUT_LADEN_GATEN}</p>
            {/* Een mislukte dynamische import onthoudt de browser: een tweede klik doet geen nieuw verzoek, herladen wel. */}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.location.reload()}>
              <RetryIcon size={16} aria-hidden="true" /> Herlaad de pagina
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Het blok ────────────────────────────────────────────────────────────────

export function BkDekking({ info, keuze, bk, courses, curricula, matrix, vandaag, telMee }: BkDekkingProps) {
  const kopId = useId();
  /** De kop van het blok: na "Opnieuw proberen" gaat de focus hierheen, want de knop verdwijnt. */
  const kop = useRef<HTMLHeadingElement>(null);
  // Eén versie één keer, en alleen de versies waarvan de index een bestand kent (dezelfde lijst als de rij en de klas).
  const versies = useMemo(() => bkVersiesOmTeLaden(bk), [bk]);
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
  // Dezelfde berekening als de rij van "Mijn richtingen" en de klas (I4). De generatie van de cache bij het begin van de
  // berekening: veranderde de opslag intussen, dan wordt de uitkomst niet bewaard.
  const berekend = useMemo(
    () => (bestanden ? { dekking: dekkingBkVanRichting({ kader: bk, bestanden, bijdragen, widgets }), bestanden, generatie: dekkingGeneratie() } : undefined),
    [bk, bestanden, bijdragen, widgets],
  );
  const dekking = berekend?.dekking;
  // Twee beroepskwalificaties met dezelfde titel krijgen hun officiële nummer erachter (altijd ná een naam).
  const namen = useMemo(() => (dekking ? uniekeSetNamen(dekking.perSet, (set) => set) : new Map<string, string>()), [dekking]);
  const leerplanTitels = useMemo(() => new Map(bijdragen.map((b) => [b.course.id, b.leerplan?.title])), [bijdragen]);

  // De korte regel voor "Mijn richtingen" en de klas, zodat wie terugkeert naar de lijst het getal meteen ziet.
  useEffect(() => {
    if (berekend) bewaarKortVanDetail({ info, soort, telMee, bk, dekking: berekend.dekking, bestanden: berekend.bestanden, generatie: berekend.generatie });
  }, [berekend, info, soort, telMee, bk]);

  // ── Plannen (§ 24.6.2) ──
  /** De dekking zoals ze stond toen de leerkracht op de knop klikte: het venster werkt met die momentopname. */
  const [venster, setVenster] = useState<BkGatenVensterProps['gegevens'] | null>(null);
  const [laadt, setLaadt] = useState(false);
  const [laadFout, setLaadFout] = useState(false);
  /** Telt op als het venster klaar is met het plannen in een bestaande cursus: dan gaat de focus naar de kop van het blok. */
  const [focusKop, setFocusKop] = useState(0);
  const knopRef = useRef<HTMLButtonElement>(null);
  const laadBezig = useRef(false);

  // Het venster sluit en de knop kan verdwijnen (er is niets meer te plannen): de focus gaat naar de kop van het blok. Dit
  // effect draait na het opruimen van het venster, dat de focus anders terugzet op de knop.
  useEffect(() => {
    if (focusKop > 0) kop.current?.focus();
  }, [focusKop]);

  const plan = () => {
    if (!dekking || !bestanden) return;
    // Beveiligd tegen dubbel klikken: tijdens het laden telt een tweede klik niet.
    if (laadBezig.current) return;
    laadBezig.current = true;
    setLaadFout(false);
    setLaadt(true);
    const gegevens: BkGatenVensterProps['gegevens'] = {
      kader: bk, dekking, bijdragen, bestanden, namen, ...(telJaar !== undefined ? { telJaar } : {}),
    };
    laadVenster().then(
      () => {
        laadBezig.current = false;
        setLaadt(false);
        setVenster(gegevens);
      },
      () => {
        laadBezig.current = false;
        setLaadt(false);
        setLaadFout(true);
      },
    );
  };

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
          {dekking.rijen.length > 0 && <PlanBlok dekking={dekking} laadt={laadt} fout={laadFout} onPlan={plan} knopRef={knopRef} />}
          {dekking.rijen.length > 0 && (
            <>
              <BkToonKeuze toon={toon} onToon={setToon} />
              <PerBk dekking={dekking} toon={toon} namen={namen} />
            </>
          )}
          {nietMee.length > 0 && (
            <div className="dk-cursussen">
              <h4>{BK_ANDERE_CURSUSSEN_KOP}</h4>
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
      {venster && (
        <Suspense fallback={null}>
          <BkGatenVenster
            info={info} keuze={keuze} gegevens={venster}
            onClose={() => setVenster(null)}
            onGepland={() => { setVenster(null); setFocusKop((n) => n + 1); }}
          />
        </Suspense>
      )}
    </div>
  );
}
