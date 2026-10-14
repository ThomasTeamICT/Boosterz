// De dekking van een richting in één regel, voor het overzicht "Mijn richtingen" en voor de klas (docs/STUDIERICHTINGEN.md
// § 22.5). De props liggen vast (B3 gebruikt ze in de klas). Deze component wordt lui geladen: de berekening vraagt de
// setbestanden van het kader.
//
// - Dezelfde getallen als het detail van de richting (F2-B10): ze rekent met `useRichtingKader` en `useRichtingDekking` met
//   `telMee = 'alle'`. Daarin staat ook de cache van het overzicht (lib/dekkingCache.ts): ze leest die eerst en rekent alleen
//   als ze leeg is, en het detail vult ze bij "Alle jaren van de graad".
// - `plaats="rij"`: pas rekenen als de rij zichtbaar is (IntersectionObserver met 200 px marge; zonder IntersectionObserver
//   meteen) en dan één richting tegelijk (`useBeurt`). `plaats="klas"`: meteen, zonder wachtrij.
// - De opslag (cursussen, leerplannen) wordt pas gelezen als de rij aan de beurt is: zo parst een lijst van tien richtingen
//   haar niet tien keer. Verandert er iets in de opslag, dan vervalt een uitkomst en rekent de rij opnieuw.
// - Niets in localStorage. Geen `aria-live` bij een rij (veel rijen zouden te veel voorlezen); de regel is te lezen als je erop
//   komt. In de klas staat er één regel, die wel meldt dat ze klaar is.
// - Staat de matrix nog niet in Boosterz (`FOUT_NOG_NIET_OPGEHAALD`), dan zwijgt een rij: de lijst met richtingen toont dan
//   de melding `NogGeenData` en heeft dus geen rijen. De klas heeft die melding niet, dus daar zegt de kaart het zelf.
// - Geen link "Bekijk per doel wat ze dekken" in deze component: de props kennen het jaar van de klas niet, de klas wel
//   (`richtingLinkNaar` in lib/dekkingWeergave.ts).
//
// Fase 3b (§ 24.4 en § 24.6.4): onder de regel over de minimumdoelen komt een tweede regel over de competenties van de
// beroepskwalificaties, alleen bij een richting die er kan hebben (`kanBkHebben`; een richting met doorstroomfinaliteit vraagt
// dus nooit iets op in kwalificaties/).
// - Dezelfde pijplijn als het detail (I4): `bkKortVoorRichting` in lib/bkOverzicht.ts, dat alleen lui geladen wordt. De rij en
//   de klas rekenen zoals het detail bij "Alle jaren" en zonder variant.
// - Een rij vraagt voor de BK-regel een eigen beurt (`useBeurt`, dezelfde wachtrij) pas als haar regel over de minimumdoelen
//   er is (F3b-B8): eerst wat er al was, nooit twee berekeningen tegelijk. De klas rekent meteen, zonder beurt.
// - De BK-regel zelf staat er in rij én klas pas als de regel over de minimumdoelen er is (§ 24.6.4): ook een BK-zin uit de cache
//   wacht erop, en in de klas rekent de BK-berekening wel al, maar toont ze zich pas daarna. Zo staan "wordt berekend…" en een
//   uitkomst nooit even samen onder elkaar.
// - De uitkomst staat in de BK-cache van het geheugen (`bewaarBkKort`, lib/dekkingCache.ts), nooit in localStorage. Ook "er valt
//   niets te zeggen" staat er (als een BK-kort zonder beroepskwalificaties, dat `bkRijZin` leeg laat): een tweede bezoek aan de
//   lijst toont dan geen "wordt berekend…" meer en vraagt geen beurt.
// - De zin zelf komt uit `bkRijZin` (lib/richtingOverzicht.ts): rij en klas tonen dezelfde zin.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { RetryIcon } from '../icons';
import { useBeurt } from './rijWachtrij';
import { useRichtingDekking } from './useRichtingDekking';
import { useRichtingGegevens, useRichtingKader } from './useRichtingGegevens';
import type { bkKortVoorRichting } from '../../lib/bkOverzicht';
import { getCourses } from '../../lib/courses';
import { getCurricula } from '../../lib/curriculum';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { bewaarBkKort, dekkingGeneratie, leesBkKort, leesDekkingKort } from '../../lib/dekkingCache';
import { richtingMetGraad } from '../../lib/dekkingWeergave';
import {
  doelgroepVan,
  kaderGroepSleutel,
  richtingInfo,
  type KaderHerkomst,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
  type SoortKeuze,
} from '../../lib/richtingKader';
import { vandaag } from '../../lib/richtingLink';
import {
  bkRijZin,
  dekkingRijZin,
  kanBkHebben,
  klasDekkingZin,
  kortVan,
  type BkKort,
  type DekkingKortGetallen,
} from '../../lib/richtingOverzicht';
import { getWidgets, onStorageChange } from '../../lib/storage';
import { GROEP_NUMMER, type MatrixBestand } from '../../lib/studierichtingen';
import { FOUT_NOG_NIET_OPGEHAALD } from '../../lib/studierichtingenBron';
import type { Widget } from '../../lib/types';
import '../../styles/mijnrichtingen.css';

export interface DekkingKortProps {
  groep: string;
  soort: SoortKeuze;
  /** 'rij' wacht op zichtbaarheid en op zijn beurt; 'klas' rekent meteen (in een open details). */
  plaats: 'rij' | 'klas';
  /** Voor de sr-only bij "Opnieuw proberen". */
  titel: string;
}

// ── Teksten (§ 22.5.4, letterlijk) ──────────────────────────────────────────

const TEKST_BEZIG = 'De dekking wordt berekend…';
const TEKST_FOUT = 'De dekking kon niet berekend worden.';
const TEKST_GEEN_KADER = 'De officiële bron koppelt geen minimumdoelen aan deze richting.';
const TEKST_NOG_NIET_OPGEHAALD = 'De doelen van deze richting zijn nog niet opgehaald.';
// Dezelfde zin staat in MijnRichtingen.tsx; die component importeert deze niet, anders zou de lui geladen kaart niet meer lui zijn.
const TEKST_NIET_IN_MATRIX = 'Deze richting staat niet (meer) in de officiële matrix.';
// De regel over de competenties (§ 24.6.4, letterlijk). De zin met de getallen zelf is `bkRijZin`. Zonder getal, dus hier zoals
// de zinnen over de minimumdoelen hierboven.
const BK_TEKST_BEZIG = 'De dekking op de competenties wordt berekend…';
const BK_TEKST_FOUT = 'De dekking op de competenties kon niet berekend worden.';

// ── Wat een berekening oplevert ─────────────────────────────────────────────

type Uitkomst =
  | { soort: 'kort'; kort: DekkingKortGetallen }
  | { soort: 'geen'; herkomst: KaderHerkomst }
  | { soort: 'fout' };

/** Meldt een uitkomst, met het getal van de opslagstand (`dekkingGeneratie`) waarmee ze gerekend is. */
type MeldUitkomst = (gen: number, uitkomst: Uitkomst) => void;

/** De cursussen en leerplannen van dit toestel, met de opslagstand waarbij ze gelezen zijn. */
interface Opslag {
  gen: number;
  courses: Course[];
  curricula: Curriculum[];
}

function leesOpslag(): Opslag {
  // De generatie eerst: verandert de opslag tussen twee regels, dan is de uitkomst ouder dan haar generatie en dus niet geldig.
  const gen = dekkingGeneratie();
  return { gen, courses: getCourses(), curricula: getCurricula() };
}

// ── De regel over de competenties van de beroepskwalificaties ───────────────

/**
 * Wat een BK-berekening oplevert. `geen`: er valt niets te zeggen (de richting heeft geen beroepskwalificaties, of de koppeling
 * kent ze niet), dus er komt geen regel; de cache onthoudt dat (`BK_NIETS_TE_ZEGGEN`). `fout`: `chunk` als het luie deel zelf niet laadde (opnieuw klikken helpt dan niet, de
 * browser onthoudt de mislukte import: herladen wel), anders een bestand dat niet laadde (opnieuw proberen helpt).
 */
export type BkUitkomst =
  | { soort: 'kort'; kort: BkKort }
  | { soort: 'geen' }
  | { soort: 'fout'; chunk: boolean };

type BkMelder = (gen: number, uitkomst: BkUitkomst) => void;

/** Wat `berekenBk` van het luie deel nodig heeft: alleen de functie. In een test een nagebootste. */
export interface BkOverzichtDeel {
  bkKortVoorRichting: typeof bkKortVoorRichting;
}

const laadBkOverzicht = (): Promise<BkOverzichtDeel> => import('../../lib/bkOverzicht');

/**
 * Wat de BK-cache bewaart als er niets te zeggen valt: een kort zonder beroepskwalificaties. `bkRijZin` geeft er '' voor (geen
 * regel) en `schoonBkKort` accepteert het, dus het BK-type en de cache blijven zoals ze zijn. Zonder dit zou elke terugkeer naar de
 * lijst opnieuw "wordt berekend…" tonen, om het daarna weer weg te halen, en elke keer een beurt in de wachtrij kosten. Een kort
 * met echte beroepskwalificaties heeft altijd `bks` > 0, dus dit kan nooit met een echte uitkomst verward worden.
 */
const BK_NIETS_TE_ZEGGEN: BkKort = { soort: 'zonder-cursus', bks: 0 };

/**
 * Eén berekening van de regel over de competenties (§ 24.4): het luie deel laden, rekenen en de korte regel bewaren in de cache
 * van het geheugen (met de generatie van het begin, zodat een wijziging intussen de uitkomst niet bewaart). Gooit nooit: een
 * mislukking is een `fout`, met `chunk` als alleen het luie deel zelf niet laadde.
 */
export async function berekenBk(
  o: { info: RichtingInfo; soort: SoortKeuze; sleutel: string; matrix: MatrixBestand; nu: string; opslag: Opslag; widgets: readonly Widget[] },
  laad: () => Promise<BkOverzichtDeel> = laadBkOverzicht,
): Promise<BkUitkomst> {
  let deel: BkOverzichtDeel;
  try {
    deel = await laad();
  } catch {
    return { soort: 'fout', chunk: true };
  }
  try {
    const r = await deel.bkKortVoorRichting({
      info: o.info, soort: o.soort, courses: o.opslag.courses, curricula: o.opslag.curricula, matrix: o.matrix, vandaag: o.nu,
      widgets: o.widgets,
    });
    if (r.soort === 'geen') {
      bewaarBkKort(o.sleutel, BK_NIETS_TE_ZEGGEN, o.opslag.gen);
      return { soort: 'geen' };
    }
    bewaarBkKort(o.sleutel, r.kort, o.opslag.gen);
    return { soort: 'kort', kort: r.kort };
  } catch {
    return { soort: 'fout', chunk: false };
  }
}

/**
 * Rekent de regel over de competenties voor één richting. Wordt pas gemonteerd als de rij aan de beurt is (in de klas meteen).
 * Verandert de opslag intussen, dan rekent ze opnieuw met de nieuwe gegevens, zoals `Berekening` voor de minimumdoelen.
 */
function BkBerekening({ info, soort, sleutel, matrix, nu, meld }: {
  info: RichtingInfo;
  soort: SoortKeuze;
  sleutel: string;
  matrix: MatrixBestand;
  nu: string;
  meld: BkMelder;
}) {
  const [opslag, setOpslag] = useState(leesOpslag);
  // De luisteraar van de cache (dekkingGeneratie) is al aangemeld en komt dus eerst: `leesOpslag` ziet de nieuwe generatie.
  useEffect(() => onStorageChange(() => setOpslag(leesOpslag())), []);
  useEffect(() => {
    let weg = false;
    berekenBk({ info, soort, sleutel, matrix, nu, opslag, widgets: getWidgets() }).then((uitkomst) => {
      if (!weg) meld(opslag.gen, uitkomst);
    });
    return () => { weg = true; };
  }, [info, soort, sleutel, matrix, nu, opslag, meld]);
  return null;
}

/** Wat de tweede regel toont. Geen toestand: geen regel (de richting kan geen beroepskwalificaties hebben, of er is niets te zeggen). */
export type BkToestand =
  | { soort: 'bezig' }
  | { soort: 'kort'; kort: BkKort }
  | { soort: 'fout'; chunk: boolean };

/**
 * De tweede regel van de kaart (§ 24.6.4). De zin met getallen is `bkRijZin`; is die leeg (geen competenties om te dekken), dan
 * staat er niets. Bij een fout: "Opnieuw proberen", of "Herlaad de pagina" als het luie deel zelf niet laadde.
 */
export function BkRegel({ toestand, titel, tekstRef, onOpnieuw }: {
  toestand: BkToestand;
  /** Voor de sr-only bij "Opnieuw proberen". */
  titel: string;
  tekstRef: RefObject<HTMLParagraphElement>;
  onOpnieuw: () => void;
}) {
  const zin = toestand.soort === 'kort' ? bkRijZin(toestand.kort) : toestand.soort === 'fout' ? BK_TEKST_FOUT : BK_TEKST_BEZIG;
  if (zin === '') return null;
  const chunk = toestand.soort === 'fout' && toestand.chunk;
  return (
    <>
      <p ref={tekstRef} className="mr-tekst mr-tekst-bk" tabIndex={-1}>{zin}</p>
      {toestand.soort === 'fout' && (
        // Een mislukte dynamische import onthoudt de browser: nog eens proberen doet geen nieuw verzoek, herladen wel.
        <button type="button" className="btn btn-sm btn-ghost mr-opnieuw" onClick={chunk ? () => window.location.reload() : onOpnieuw}>
          <RetryIcon size={16} /> {chunk ? 'Herlaad de pagina' : 'Opnieuw proberen'}<span className="sr-only"> (competenties van {titel})</span>
        </button>
      )}
    </>
  );
}

/** De dekking zelf, voor een kader dat geladen is. */
function MetKader({ info, keuze, kader, opslag, matrix, nu, meld }: {
  info: RichtingInfo;
  keuze: RichtingKeuze;
  kader: RichtingKader;
  opslag: Opslag;
  matrix: MatrixBestand;
  nu: string;
  meld: MeldUitkomst;
}) {
  const stand = useRichtingDekking({ info, keuze, kader, curricula: opslag.curricula }, opslag.courses, matrix, nu, 'alle');
  const status = stand.status;
  const waarde = stand.status === 'klaar' ? stand.waarde : undefined;
  const herkomst = stand.status === 'geen' ? stand.herkomst : undefined;
  const eersteGraad = info.graad === 1;
  const gen = opslag.gen;
  useEffect(() => {
    if (status === 'klaar' && waarde) meld(gen, { soort: 'kort', kort: kortVan(waarde.dekking, eersteGraad) });
    else if (status === 'geen' && herkomst !== undefined) meld(gen, { soort: 'geen', herkomst });
    else if (status === 'fout') meld(gen, { soort: 'fout' });
  }, [status, waarde, herkomst, eersteGraad, gen, meld]);
  return null;
}

/** Laadt het kader van de richting en rekent dan de dekking. Wordt pas gemonteerd als de rij aan de beurt is. */
function Berekening({ info, soort, matrix, nu, meld }: {
  info: RichtingInfo;
  soort: SoortKeuze;
  matrix: MatrixBestand;
  nu: string;
  meld: MeldUitkomst;
}) {
  const [opslag, setOpslag] = useState(leesOpslag);
  // De luisteraar van de cache (dekkingGeneratie) is al aangemeld en komt dus eerst: `leesOpslag` ziet de nieuwe generatie.
  useEffect(() => onStorageChange(() => setOpslag(leesOpslag())), []);
  const groep = info.groep.nummer;
  // Het kader hangt alleen van de richting en het soort onderwijs af, niet van het jaar of de variant.
  const keuze = useMemo<RichtingKeuze>(() => ({ groep, soort }), [groep, soort]);
  const { stand } = useRichtingKader(info, keuze);
  const gen = opslag.gen;
  const kaderFout = stand.status === 'fout';
  useEffect(() => {
    if (kaderFout) meld(gen, { soort: 'fout' });
  }, [kaderFout, gen, meld]);
  if (stand.status !== 'klaar') return null;
  return <MetKader info={info} keuze={keuze} kader={stand.waarde.kader} opslag={opslag} matrix={matrix} nu={nu} meld={meld} />;
}

// ── De kaart ────────────────────────────────────────────────────────────────

function geenKaderTekst(herkomst: KaderHerkomst): string {
  return herkomst === 'nog-niet-opgehaald' ? TEKST_NOG_NIET_OPGEHAALD : TEKST_GEEN_KADER;
}

/** Is de rij zichtbaar (met een marge van 200 px)? Zonder IntersectionObserver meteen; eenmaal zichtbaar blijft ze het. */
function useZichtbaar(meteen: boolean, ref: RefObject<Element>): boolean {
  const [zichtbaar, setZichtbaar] = useState(meteen || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (zichtbaar || !el) return;
    const io = new IntersectionObserver((regels) => {
      if (regels.some((r) => r.isIntersecting)) {
        setZichtbaar(true);
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [zichtbaar, ref]);
  return zichtbaar;
}

export function DekkingKort({ groep, soort, plaats, titel }: DekkingKortProps) {
  const { stand, opnieuw: opnieuwGegevens } = useRichtingGegevens();
  const nu = useMemo(vandaag, []);
  const kaart = useRef<HTMLDivElement>(null);
  const tekstRef = useRef<HTMLParagraphElement>(null);
  const zichtbaar = useZichtbaar(plaats === 'klas', kaart);

  // Een wijziging in de opslag laat een uitkomst vervallen: de cache is dan al leeg en de generatie hoger.
  const [, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);
  const gen = dekkingGeneratie();
  const [resultaat, setResultaat] = useState<{ gen: number; uitkomst: Uitkomst } | null>(null);
  const uitkomst = resultaat && resultaat.gen === gen ? resultaat.uitkomst : undefined;

  const matrix = stand.status === 'klaar' ? stand.waarde.matrix : undefined;
  const info = useMemo(
    () => (matrix && GROEP_NUMMER.test(groep) ? richtingInfo(matrix, groep, nu) : undefined),
    [matrix, groep, nu],
  );
  // Dezelfde sleutel als het detail: het soort onderwijs zoals het kader het neemt (een buitengewoon soort telt niet voor elke richting).
  const effectiefSoort = info ? doelgroepVan(info, { groep: info.groep.nummer, soort }).soort : soort;
  const sleutel = info ? kaderGroepSleutel(info, effectiefSoort) : undefined;
  const bewaard = sleutel !== undefined ? leesDekkingKort(sleutel) : undefined;

  const nodig = info !== undefined && bewaard === undefined && uitkomst === undefined;
  const beurt = useBeurt(plaats === 'rij' && zichtbaar && nodig);
  const mag = nodig && (plaats === 'klas' || beurt.aanDeBeurt);
  const geefBeurtTerug = beurt.klaar;

  const meld = useCallback<MeldUitkomst>((g, u) => {
    // Veranderde de opslag intussen, dan is deze uitkomst van vroeger: de berekening loopt door met de nieuwe gegevens.
    if (g !== dekkingGeneratie()) return;
    setResultaat({ gen: g, uitkomst: u });
    geefBeurtTerug();
  }, [geefBeurtTerug]);

  // De regel over de competenties (§ 24.4). Alleen bij een richting die beroepskwalificaties kan hebben. Een rij vraagt haar beurt
  // pas als haar regel over de minimumdoelen er is (een uitkomst of een getal in de cache): eerst wat er al was, en nooit twee
  // berekeningen tegelijk (F3b-B8). De klas rekent meteen.
  const kanBk = info !== undefined && kanBkHebben(info);
  const bewaardBk = sleutel !== undefined && kanBk ? leesBkKort(sleutel) : undefined;
  const [bkResultaat, setBkResultaat] = useState<{ gen: number; uitkomst: BkUitkomst } | null>(null);
  const bkUitkomst = bkResultaat && bkResultaat.gen === gen ? bkResultaat.uitkomst : undefined;
  const bkTekstRef = useRef<HTMLParagraphElement>(null);
  const mdKlaar = bewaard !== undefined || uitkomst !== undefined;
  const nodigBk = kanBk && sleutel !== undefined && bewaardBk === undefined && bkUitkomst === undefined;
  const bkBeurt = useBeurt(plaats === 'rij' && zichtbaar && nodigBk && mdKlaar);
  const magBk = nodigBk && (plaats === 'klas' || bkBeurt.aanDeBeurt);
  const geefBkBeurtTerug = bkBeurt.klaar;

  const meldBk = useCallback<BkMelder>((g, u) => {
    if (g !== dekkingGeneratie()) return;
    setBkResultaat({ gen: g, uitkomst: u });
    // De beurt gaat terug, ook na een fout: een mislukte rij houdt de rest niet op.
    geefBkBeurtTerug();
  }, [geefBkBeurtTerug]);

  // Nog niet opgehaald. Bij een rij zegt de melding van de lijstpagina (NogGeenData) het al, dus daar staat niets. De klas heeft
  // die melding niet: daar zegt de kaart het, zonder knop, want opnieuw proberen haalt niets op wat er nog niet staat.
  const nogNietOpgehaald = stand.status === 'fout' && stand.fout === FOUT_NOG_NIET_OPGEHAALD;
  if (nogNietOpgehaald && plaats === 'rij') return null;

  let tekst = TEKST_BEZIG;
  let opnieuw: (() => void) | undefined;
  if (nogNietOpgehaald) {
    tekst = TEKST_NOG_NIET_OPGEHAALD;
  } else if (stand.status === 'fout') {
    tekst = TEKST_FOUT;
    opnieuw = opnieuwGegevens;
  } else if (stand.status === 'klaar' && !info) {
    tekst = TEKST_NIET_IN_MATRIX;
  } else if (info) {
    const kort = bewaard ?? (uitkomst?.soort === 'kort' ? uitkomst.kort : undefined);
    if (kort) {
      tekst = plaats === 'klas' ? klasDekkingZin(richtingMetGraad(info.groep.titel, info.graad), kort) : dekkingRijZin(kort);
    } else if (uitkomst?.soort === 'geen') {
      tekst = geenKaderTekst(uitkomst.herkomst);
    } else if (uitkomst?.soort === 'fout') {
      tekst = TEKST_FOUT;
      opnieuw = () => setResultaat(null);
    }
  }

  const probeerOpnieuw = () => {
    // De knop verdwijnt: de focus gaat naar de regel, die daarna "wordt berekend…" zegt.
    tekstRef.current?.focus();
    opnieuw?.();
  };

  // De tweede regel, in rij en klas pas als de regel over de minimumdoelen er is (§ 24.6.4). Daarna: een bewaarde of berekende
  // uitkomst en een fout blijven staan, en anders staat er "bezig". `geen` en een richting zonder beroepskwalificaties: geen regel.
  let bkToestand: BkToestand | undefined;
  if (info && kanBk && mdKlaar) {
    const bkKort = bewaardBk ?? (bkUitkomst?.soort === 'kort' ? bkUitkomst.kort : undefined);
    if (bkKort) bkToestand = { soort: 'kort', kort: bkKort };
    else if (bkUitkomst?.soort === 'fout') bkToestand = { soort: 'fout', chunk: bkUitkomst.chunk };
    else if (bkUitkomst === undefined) bkToestand = { soort: 'bezig' };
  }
  const probeerBkOpnieuw = () => {
    bkTekstRef.current?.focus();
    setBkResultaat(null);
  };

  return (
    <div ref={kaart} className={plaats === 'klas' ? 'mr-kaart mr-kaart-vrij' : 'mr-kaart'} {...(plaats === 'klas' ? { 'aria-live': 'polite' as const } : {})}>
      <p ref={tekstRef} className="mr-tekst" tabIndex={-1}>{tekst}</p>
      {opnieuw && (
        <button type="button" className="btn btn-sm btn-ghost mr-opnieuw" onClick={probeerOpnieuw}>
          <RetryIcon size={16} /> Opnieuw proberen<span className="sr-only"> ({titel})</span>
        </button>
      )}
      {bkToestand && <BkRegel toestand={bkToestand} titel={titel} tekstRef={bkTekstRef} onOpnieuw={probeerBkOpnieuw} />}
      {mag && info && matrix && <Berekening info={info} soort={soort} matrix={matrix} nu={nu} meld={meld} />}
      {magBk && info && matrix && sleutel !== undefined && (
        <BkBerekening info={info} soort={effectiefSoort} sleutel={sleutel} matrix={matrix} nu={nu} meld={meldBk} />
      )}
    </div>
  );
}

export default DekkingKort;
