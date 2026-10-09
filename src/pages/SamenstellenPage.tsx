// ── Stel je eigen doelenlijst samen: de wizard in drie stappen ──────────────
//
// /leerplannen/samenstellen                       een nieuwe lijst
// /leerplannen/samenstellen?sets=ODS_1,ODS_2      met deze sets vooraf gekozen, helemaal aangevinkt (begint bij stap 2)
// /leerplannen/samenstellen?sets=ODS_1&leeg=1     met deze set vooraf gekozen maar niets aangevinkt (bv. de STEM-set)
// /leerplannen/samenstellen/:curriculumId         de keuze van een bewaarde lijst aanpassen (begint bij stap 2)
// /leerplannen/samenstellen?richting=G-0193&jaar=4&soort=so[&sets=ODS_1,ODS_2][&zelf=ODS_3]
//                                                 begint bij stap 2 met de doelen die de officiële bron aan de studierichting
//                                                 koppelt, eventueel beperkt tot `sets`; de sets in `zelf` staan gekozen met
//                                                 niets aangevinkt (bv. een STEM-set). Na het bewaren: de pagina van de richting.
// /leerplannen/samenstellen/:curriculumId?richting=…  de bewaarde keuze, zonder de doelen die het kader niet meer kent
//
// Met ?richting laadt de pagina eerst de matrix, de koppeling en de index (zoals ze nu de index laadt) en monteert de wizard
// pas daarna. Een onbekende of ongeldige richting geeft een melding en een lege keuze. Zonder ?richting verandert er niets.
//
// Stap 1 kiest sets, stap 2 de doelen (hele sets of losse doelen), stap 3 geeft de lijst een naam en bewaart ze. De doelen
// blijven letterlijk zoals in de officiële bron, dus de lijst is meteen nagekeken (lib/doelenSamenstellen.ts). De keuzelogica
// staat in lib/samenstelKeuze.ts, de stappen in components/curriculum/samenstellen/. De pagina houdt de staat vast, zodat een
// stap terug niets kwijtraakt, en zet bij elke stapwissel de focus op de kop van de nieuwe stap.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import type { Curriculum } from '../lib/curriculumTypes';
import type { MinimumdoelenIndexSet } from '../lib/minimumdoelen';
import { getCurriculum, saveCurriculum } from '../lib/curriculum';
import { leerplanUitSelectie, selectieVanLeerplan, telSelectie, voorstelTitel } from '../lib/doelenSamenstellen';
import { effectieveStatus, isSamengesteld } from '../lib/leerplanStatus';
import { laadIndex, oudeVersieIds } from '../lib/minimumdoelenBron';
import { titelVoorRichtingLeerplan } from '../lib/richtingCursus';
import type { RichtingInfo, RichtingKader } from '../lib/richtingKader';
import {
  beginUitBewaarde, beginUitLink, doelgroepBijRichting, genegeerdZinnen, kaderStand, leesRichtingParams, richtingPad,
  richtingTekst, VERDER_ZONDER_RICHTING, type GenegeerdParam, type RichtingLink, type RichtingParams,
} from '../lib/richtingLink';
import {
  aantalGevraagdeSets, beginUitSelectie, beginUitSets, bouwSetKeuzes, haalSetWeg, kiesbareDoelen, leegKeuze, ontbreektInStap1, ontbreektInStap2,
  ontbreektInStap3, setsUitParam, telGekozen, wisselSet, zegOntbreekt, type Ontbreekt, type SamenstelKeuze,
} from '../lib/samenstelKeuze';
import { useLaadstand } from '../lib/useLaadstand';
import { FoutBericht, LaadBericht } from '../components/curriculum/LaadStatus';
import { StapBewaren } from '../components/curriculum/samenstellen/StapBewaren';
import { StapDoelen } from '../components/curriculum/samenstellen/StapDoelen';
import { BEGIN_FILTER, SETS_PER_KEER, StapSets, type SetFilterStaat } from '../components/curriculum/samenstellen/StapSets';
import { useSetBestanden } from '../components/curriculum/samenstellen/useSetBestanden';
import { useFocusNaVerderZonderRichting, useRichtingUitLink } from '../components/richting/useRichtingUitLink';
import { BackIcon, InfoIcon, WarningIcon } from '../components/icons';
import { useToast } from '../components/ui';
import '../styles/materiaal.css';
import '../styles/leerplan.css';
import '../styles/inlezen.css';
import '../styles/samenstellen.css';

type Stap = 1 | 2 | 3;

const STAPPEN: readonly { nr: Stap; kort: string; titel: string }[] = [
  { nr: 1, kort: 'Sets kiezen', titel: 'Sets kiezen' },
  { nr: 2, kort: 'Doelen kiezen', titel: 'Doelen kiezen' },
  { nr: 3, kort: 'Naam en bewaren', titel: 'Naam en bewaren' },
];

function aantalDoelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

// ── De pagina: een nieuwe lijst of een bewaarde lijst aanpassen ─────────────

export function SamenstellenPage() {
  const { curriculumId } = useParams();
  const [params] = useSearchParams();
  const setsParam = params.get('sets');
  const leeg = params.get('leeg') === '1';
  const zelfParam = params.get('zelf');
  const richting = leesRichtingParams(params);
  // Een andere lijst, andere sets of een andere richting, ander jaar of ander soort in de link is een nieuwe wizard: alle staat begint opnieuw.
  return (
    <Samenstellen
      key={`${curriculumId ?? ''}?${setsParam ?? ''}&${leeg ? 'leeg' : 'alles'}&${richting.sleutel}`}
      curriculumId={curriculumId} setsParam={setsParam} zelfParam={zelfParam} leeg={leeg} richting={richting}
    />
  );
}

type Probleem = 'ontbreekt' | 'niet-samengesteld' | 'eigen-kopie';

/** Waarom een lijst niet aan te passen is; `undefined` als het kan. */
function probleemMet(cur: Curriculum | undefined): Probleem | undefined {
  if (!cur) return 'ontbreekt';
  if (!isSamengesteld(cur)) return 'niet-samengesteld';
  if (cur.kind === 'eigen') return 'eigen-kopie';
  return undefined;
}

function Samenstellen({
  curriculumId, setsParam, zelfParam, leeg, richting,
}: {
  curriculumId?: string;
  setsParam: string | null;
  zelfParam: string | null;
  leeg: boolean;
  richting: RichtingParams;
}) {
  const bewerken = curriculumId !== undefined;
  const bestaand = useMemo(() => (curriculumId ? getCurriculum(curriculumId) : undefined), [curriculumId]);
  const probleem = bewerken ? probleemMet(bestaand) : undefined;
  const index = useLaadstand('index', laadIndex);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const terugNaar = bestaand ? `/leerplannen?open=${encodeURIComponent(bestaand.id)}` : '/leerplannen';

  return (
    <div className="page mat-page il-page sam-page">
      <Link to={terugNaar} className="btn btn-sm btn-quiet il-terug">
        <BackIcon size={16} /> {bestaand ? 'Terug naar het leerplan' : 'Leerplannen'}
      </Link>
      <div className="page-head">
        <div className="il-intro">
          <h1>{bewerken ? 'Doelenlijst aanpassen' : 'Stel je eigen doelenlijst samen'}</h1>
          <p className="sub">
            {bewerken && bestaand && !probleem
              ? `Pas de keuze van “${bestaand.title}” aan. `
              : ''}
            De doelen blijven letterlijk zoals in de officiële bron, dus je lijst is meteen nagekeken. Kies hele sets of losse doelen,
            uit één of meer sets.
          </p>
        </div>
      </div>

      {probleem ? (
        <ProbleemMelding probleem={probleem} cur={bestaand} />
      ) : richting.link ? (
        <MetRichting link={richting.link} genegeerd={richting.genegeerd} bestaand={bestaand} setsParam={setsParam} zelfParam={zelfParam} leeg={leeg} />
      ) : index.stand.status === 'laden' ? (
        <LaadBericht tekst="De sets worden geladen…" />
      ) : index.stand.status === 'fout' ? (
        <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />
      ) : (
        <Wizard
          sets={index.stand.waarde.sets} bestaand={bestaand} setsParam={setsParam} zelfParam={zelfParam} leeg={leeg}
          onbekendeRichting={richting.aanwezig}
        />
      )}
    </div>
  );
}

// ── Met een studierichting: eerst de gegevens, dan pas de wizard ────────────

/**
 * Laadt de matrix, de koppeling, de index en het kader van de richting uit de link en monteert de wizard pas als alles
 * er is, zodat de wizard meteen met de goede keuze begint. Kent de matrix de richting niet, dan begint de wizard met
 * een melding en een lege keuze.
 */
function MetRichting({
  link, genegeerd, bestaand, setsParam, zelfParam, leeg,
}: {
  link: RichtingLink;
  /** Wat de link nog vroeg en niet bruikbaar was (jaar, soort). */
  genegeerd: readonly GenegeerdParam[];
  bestaand?: Curriculum;
  setsParam: string | null;
  zelfParam: string | null;
  leeg: boolean;
}) {
  const r = useRichtingUitLink(link);
  const zonderRichting = bestaand ? `/leerplannen/samenstellen/${encodeURIComponent(bestaand.id)}` : '/leerplannen/samenstellen';

  if (r.status === 'laden') return <LaadBericht tekst="De studierichting en haar doelen worden geladen…" />;
  if (r.status === 'fout') return <RichtingFout fout={r.fout} onOpnieuw={r.opnieuw} zonderRichting={zonderRichting} />;
  if (r.status === 'onbekend') {
    return <Wizard sets={r.sets} bestaand={bestaand} setsParam={setsParam} zelfParam={zelfParam} leeg={leeg} onbekendeRichting />;
  }
  return (
    <Wizard
      sets={r.sets} bestaand={bestaand} setsParam={setsParam} zelfParam={zelfParam} leeg={leeg}
      richting={{ info: r.info, kader: r.kader }} genegeerd={genegeerd}
    />
  );
}

/** De studierichting kon niet geladen worden: opnieuw proberen, of verder zonder richting. */
function RichtingFout({ fout, onOpnieuw, zonderRichting }: { fout: string; onOpnieuw: () => void; zonderRichting: string }) {
  return (
    <>
      <FoutBericht fout={fout} onOpnieuw={onOpnieuw} />
      <p>
        <Link className="btn btn-sm btn-ghost" to={zonderRichting} state={VERDER_ZONDER_RICHTING}>Verder zonder studierichting</Link>
      </p>
    </>
  );
}

// ── Een lijst die niet aan te passen is ─────────────────────────────────────

function ProbleemMelding({ probleem, cur }: { probleem: Probleem; cur?: Curriculum }) {
  return (
    <div className="callout warn" role="alert">
      <WarningIcon size={20} className="il-callout-icoon" />
      <div className="il-callout-tekst">
        {probleem === 'ontbreekt' && <p>Deze doelenlijst werd niet gevonden. Misschien is ze verwijderd.</p>}
        {probleem === 'niet-samengesteld' && (
          <p>
            <strong>{cur?.title}</strong> is niet zelf samengesteld uit de officiële minimumdoelen. Daarom kan je de keuze hier niet aanpassen.
          </p>
        )}
        {probleem === 'eigen-kopie' && (
          <p>
            <strong>{cur?.title}</strong> is een eigen kopie. Die pas je aan in de editor van het leerplan, want ze hoeft niet meer gelijk te zijn aan de
            officiële bron. Wil je andere doelen kiezen? Stel dan een nieuwe doelenlijst samen.
          </p>
        )}
        <div className="lp-acties">
          {cur
            ? <Link className="btn btn-sm btn-ghost" to={`/leerplannen?open=${encodeURIComponent(cur.id)}`}><BackIcon size={16} /> Terug naar het leerplan</Link>
            : <Link className="btn btn-sm btn-ghost" to="/leerplannen"><BackIcon size={16} /> Naar de leerplannen</Link>}
          <Link className="btn btn-sm btn-ghost" to="/leerplannen/samenstellen">Stel een nieuwe doelenlijst samen</Link>
        </div>
      </div>
    </div>
  );
}

// ── De wizard ───────────────────────────────────────────────────────────────

/** Een studierichting met haar kader: wat de wizard nodig heeft om met de koppeling te beginnen en de richting te bewaren. */
interface RichtingMetKader {
  info: RichtingInfo;
  kader: RichtingKader;
}

interface Begin {
  keuze: SamenstelKeuze;
  /** Gevraagde sets uit de link die niet gekozen konden worden. */
  overgeslagen: number;
  /** Doelen van een bewaarde lijst die het kader niet meer kent (alleen met een richting). */
  vervallen: number;
}

function beginKeuze(o: {
  bestaand?: Curriculum;
  setsParam: string | null;
  zelfParam: string | null;
  leeg: boolean;
  bekend: ReadonlySet<string>;
  richting?: RichtingMetKader;
  onbekendeRichting: boolean;
}): Begin {
  const { bestaand, richting } = o;
  // Met een richting: de koppeling van de bron (of de bewaarde keuze zonder de vervallen doelen), maar alleen als het kader iets zegt.
  if (richting && kaderStand(richting.kader) === 'ok') {
    if (bestaand) {
      const { keuze, vervallen } = beginUitBewaarde(selectieVanLeerplan(bestaand), richting.kader, bestaand);
      return { keuze, overgeslagen: 0, vervallen };
    }
    const { keuze, overgeslagen } = beginUitLink(richting.kader, o.setsParam, o.zelfParam);
    return { keuze, overgeslagen, vervallen: 0 };
  }
  if (bestaand) return { keuze: beginUitSelectie(selectieVanLeerplan(bestaand)), overgeslagen: 0, vervallen: 0 };
  // Een richting zonder bruikbaar kader of een richting die we niet kennen: "je begint met een lege keuze".
  if (richting || o.onbekendeRichting) return { keuze: leegKeuze(), overgeslagen: 0, vervallen: 0 };
  const keuze = beginUitSets(setsUitParam(o.setsParam).filter((id) => o.bekend.has(id)), o.leeg);
  // Sets uit de link die niet bestaan, ongeldig zijn of boven het maximum vallen, worden overgeslagen: dat zeggen we, in stap 1 en 2.
  return { keuze, overgeslagen: Math.max(0, aantalGevraagdeSets(o.setsParam) - keuze.sets.length), vervallen: 0 };
}

/**
 * De melding bovenaan over de richting in de link: waar de wizard mee begon, of waarom ze met een lege keuze (of de
 * bewaarde keuze) begon. Niets als er geen richting in de link staat, of als er niets te melden is.
 */
function RichtingMelding({
  richting, onbekend, bestaand, begin, genegeerd,
}: {
  richting?: RichtingMetKader;
  onbekend: boolean;
  bestaand: boolean;
  begin: Begin;
  /** Wat de link nog vroeg en niet bruikbaar was (jaar, soort). */
  genegeerd: readonly GenegeerdParam[];
}) {
  // De zin over een jaar of soort dat niet bruikbaar was, staat los van de melding over het kader: ze geldt altijd als de richting bekend is.
  const zinnen = richting ? genegeerdZinnen(genegeerd) : [];
  return (
    <>
      <KaderMelding richting={richting} onbekend={onbekend} bestaand={bestaand} begin={begin} />
      {zinnen.length > 0 && (
        <Melding soort="warn">
          {zinnen.map((zin) => <p key={zin}>{zin}</p>)}
        </Melding>
      )}
    </>
  );
}

function KaderMelding({
  richting, onbekend, bestaand, begin,
}: {
  richting?: RichtingMetKader;
  onbekend: boolean;
  bestaand: boolean;
  begin: Begin;
}) {
  if (onbekend && !richting) {
    return (
      <Melding soort="warn">
        <p>Deze link noemt een studierichting die Boosterz niet (meer) kent. Je begint met {bestaand ? 'de bewaarde' : 'een lege'} keuze.</p>
      </Melding>
    );
  }
  if (!richting) return null;
  const tekst = richtingTekst(richting.info);
  const stand = kaderStand(richting.kader);
  if (stand !== 'ok') {
    return (
      <Melding soort="warn">
        {bestaand
          ? <p>De doelen van de studierichting <strong>{tekst}</strong> konden niet vergeleken worden met de officiële bron. Je begint met de bewaarde keuze.</p>
          : stand === 'nog-niet-opgehaald'
            ? <p>De doelen van de studierichting <strong>{tekst}</strong> zijn nog niet opgehaald. Je begint met een lege keuze.</p>
            : <p>De officiële bron koppelt geen minimumdoelen aan de studierichting <strong>{tekst}</strong>. Je begint met een lege keuze.</p>}
      </Melding>
    );
  }
  if (bestaand) {
    return begin.vervallen > 0 ? (
      <Melding soort="warn">
        <p>
          {begin.vervallen === 1
            ? '1 doel staat niet (meer) in de koppeling van de officiële bron en is niet aangevinkt.'
            : `${begin.vervallen} doelen staan niet (meer) in de koppeling van de officiële bron en zijn niet aangevinkt.`}
        </p>
      </Melding>
    ) : (
      <Melding soort="info"><p>Je begint met de keuze die je bewaarde.</p></Melding>
    );
  }
  if (begin.keuze.sets.length === 0) return null;
  return (
    <Melding soort="info">
      <p>Je begint met de doelen die de officiële bron aan de studierichting <strong>{tekst}</strong> koppelt. Vink uit wat je niet nodig hebt.</p>
      {richting.kader.herkomst === 'graad-en-stroom' && (
        <p>In de 1ste graad koppelt de officiële bron de doelen niet per richting of basisoptie, maar per stroom.</p>
      )}
    </Melding>
  );
}

function Melding({ soort, children }: { soort: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className={soort === 'warn' ? 'callout warn' : 'callout'} role="note">
      {soort === 'warn' ? <WarningIcon size={20} className="il-callout-icoon" /> : <InfoIcon size={20} className="il-callout-icoon" />}
      <div className="il-callout-tekst">{children}</div>
    </div>
  );
}

function Wizard({
  sets, bestaand, setsParam, zelfParam, leeg, richting, onbekendeRichting = false, genegeerd = [],
}: {
  sets: readonly MinimumdoelenIndexSet[];
  bestaand?: Curriculum;
  setsParam: string | null;
  /** `?zelf=`: sets die gekozen staan met niets aangevinkt (alleen met een richting). */
  zelfParam: string | null;
  /** `?leeg=1`: de sets uit de link staan gekozen, maar met niets aangevinkt. */
  leeg: boolean;
  /** De studierichting uit de link, met haar kader. */
  richting?: RichtingMetKader;
  /** Er staat een richting in de link die Boosterz niet kent. */
  onbekendeRichting?: boolean;
  /** Wat de link nog vroeg en niet bruikbaar was (jaar, soort); alleen met een richting. */
  genegeerd?: readonly GenegeerdParam[];
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const [begin] = useState(() => beginKeuze({ bestaand, setsParam, zelfParam, leeg, bekend: new Set(sets.map((s) => s.id)), richting, onbekendeRichting }));
  const [keuze, setKeuze] = useState<SamenstelKeuze>(begin.keuze);
  const [stap, setStap] = useState<Stap>(begin.keuze.sets.length > 0 ? 2 : 1);
  const linkOvergeslagen = begin.overgeslagen;

  // Stap 1
  const [filter, setFilter] = useState<SetFilterStaat>(BEGIN_FILTER);
  const [zichtbaar, setZichtbaar] = useState(SETS_PER_KEER);
  // Stap 2
  const [zoekDoel, setZoekDoel] = useState('');
  // Stap 3: de naam volgt het voorstel zolang de leerkracht haar niet zelf aanpaste; een bewaarde lijst houdt haar naam.
  const [titelEigen, setTitelEigen] = useState(bestaand !== undefined);
  const [titelTekst, setTitelTekst] = useState(bestaand?.title ?? '');
  const [vak, setVak] = useState(bestaand?.subject ?? '');
  const bewaard = useRef(false);

  // ── Focus: bij elke stapwissel naar de kop van de nieuwe stap ──
  const kopRef = useRef<HTMLHeadingElement>(null);
  const vorigeStap = useRef(stap);
  useEffect(() => {
    if (vorigeStap.current === stap) return;
    vorigeStap.current = stap;
    kopRef.current?.focus();
  }, [stap]);
  // Na "Verder zonder studierichting" verdween de knop met de richting uit de link: de focus gaat naar de kop van de stap, niet naar de body.
  useFocusNaVerderZonderRichting(kopRef);

  // ── De sets en hun doelen ──
  const indexSets = useMemo(() => new Map(sets.map((s) => [s.id, s] as const)), [sets]);
  const oud = useMemo(() => oudeVersieIds(sets), [sets]);
  const { stand, bestanden, opnieuw } = useSetBestanden(keuze.sets);
  const kiesbaar = useMemo(() => new Map([...bestanden].map(([id, b]) => [id, kiesbareDoelen(b)] as const)), [bestanden]);
  const totaal = useMemo(() => telGekozen(keuze, kiesbaar), [keuze, kiesbaar]);
  const laden = keuze.sets.filter((id) => stand(id).status === 'laden').length;
  const mislukt = keuze.sets.filter((id) => stand(id).status === 'fout').length;

  // ── De lijst zoals ze bewaard wordt (alleen in stap 3) ──
  const keuzes = useMemo(() => bouwSetKeuzes(keuze, bestanden), [keuze, bestanden]);
  // Met een richting: de sets die echt in de lijst komen (met minstens één doel). Daarover gaan de titel en de vingerafdruk van het kader.
  const setIds = useMemo(
    () => (richting ? keuzes.filter((k) => telSelectie([k]) > 0).map((k) => k.bestand.set.id) : []),
    [richting, keuzes],
  );
  const voorstelBasis = useMemo(() => {
    if (richting) return setIds.length > 0 ? titelVoorRichtingLeerplan(richting.info, richting.kader, setIds) : '';
    return keuzes.length > 0 ? voorstelTitel(keuzes.map((s) => s.bestand.set)) : '';
  }, [richting, setIds, keuzes]);
  // Met een richting en een vak ("Biologie · Natuurwetenschappen · 2de graad"): het voorstel volgt het vak dat de leerkracht intikt.
  const vakTekst = vak.trim();
  const voorstel = richting && setIds.length > 0 && vakTekst !== ''
    ? titelVoorRichtingLeerplan(richting.info, richting.kader, setIds, vakTekst)
    : voorstelBasis;
  const titel = titelEigen ? titelTekst : voorstel;
  const doelgroepBasis = useMemo(
    () => (richting ? doelgroepBijRichting(richting.info, richting.kader, setIds) : undefined),
    [richting, setIds],
  );
  // Het overzicht hangt niet af van de naam (en het vak): anders loopt de hele controle bij elke toets opnieuw. Bij het bewaren wel.
  const resultaat = useMemo(
    () => (stap === 3
      ? leerplanUitSelectie(keuzes, { titel: voorstelBasis, bestaand, oudeVersies: oud, ...(doelgroepBasis ? { doelgroep: doelgroepBasis } : {}) })
      : undefined),
    [stap, keuzes, voorstelBasis, bestaand, oud, doelgroepBasis],
  );

  // ── Wijzigingen ──
  const wijzigFilter = (patch: Partial<SetFilterStaat>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setZichtbaar(SETS_PER_KEER);
  };
  const wijzigTitel = (t: string) => {
    setTitelEigen(true);
    setTitelTekst(t);
  };
  // "Haal deze set weg" na een laadfout in stap 2: de knop verdwijnt, dus de focus gaat naar de kop van de stap.
  const weg = (id: string) => {
    setKeuze((k) => haalSetWeg(k, id));
    kopRef.current?.focus();
  };

  // ── Van stap naar stap ──
  const ontbreekt = useMemo(() => {
    if (stap === 1) return ontbreektInStap1(keuze);
    if (stap === 2) return ontbreektInStap2(laden, mislukt, totaal.doelen);
    const n = resultaat?.leerplan.goals.length ?? 0;
    const lijst: Ontbreekt[] = ontbreektInStap3(titel, n, (resultaat?.waarschuwingen.length ?? 0) > 0);
    // Met een richting bewaren we alleen een nagekeken leerplan: de melding hierboven zegt waarom het niet lukt.
    if (richting && resultaat && n > 0 && !resultaat.bevestigd) lijst.push({ tekst: 'los de melding hierboven op' });
    return lijst;
  }, [stap, keuze, laden, mislukt, totaal.doelen, titel, resultaat, richting]);

  const focusOpVeld = () => {
    const veld = ontbreekt.find((o) => o.veld)?.veld;
    if (veld) document.getElementById(veld)?.focus();
  };
  const volgende = () => {
    if (ontbreekt.length > 0) {
      focusOpVeld();
      return;
    }
    setStap((s) => (s < 3 ? ((s + 1) as Stap) : s));
  };

  const bewaar = () => {
    if (ontbreekt.length > 0) {
      focusOpVeld();
      return;
    }
    if (bewaard.current) return;
    try {
      const r = leerplanUitSelectie(keuzes, {
        titel: titel.trim(), vak: vakTekst, bestaand, oudeVersies: oud,
        ...(richting ? { doelgroep: doelgroepBijRichting(richting.info, richting.kader, setIds, vakTekst) } : {}),
      });
      if (r.leerplan.goals.length === 0) {
        toast('Kies minstens één doel.', 'err');
        return;
      }
      // Een leerplan voor een richting is altijd nagekeken: anders bewaren we niets en zeggen we waarom.
      if (richting && !r.bevestigd) {
        toast(r.waarschuwingen[0] ?? 'De lijst kon niet als nagekeken bevestigd worden en is niet bewaard.', 'err');
        return;
      }
      // Lukt het bewaren niet (opslag vol), dan meldt de opslaglaag dat zelf: dan blijven we hier.
      if (!saveCurriculum(r.leerplan)) return;
      bewaard.current = true;
      if (richting) {
        toast('Leerplan bewaard en nagekeken. Maak er nu een cursus mee.', 'ok');
        navigate(richtingPad(richting.info, richting.kader));
        return;
      }
      toast(`Lijst bewaard: ${r.leerplan.title} (${aantalDoelen(r.leerplan.goals.length)}, ${r.bevestigd ? 'nagekeken' : 'nog niet nagekeken'})`, 'ok');
      navigate(`/leerplannen?open=${encodeURIComponent(r.leerplan.id)}`);
    } catch {
      toast('Bewaren is niet gelukt. Probeer het opnieuw.', 'err');
    }
  };

  const huidig = STAPPEN[stap - 1];
  const bestaandeStatus = bestaand ? effectieveStatus(bestaand) : undefined;

  return (
    <>
      {bestaandeStatus === 'gewijzigd' && (
        <div className="callout warn sam-gewijzigd" role="note">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>
              <strong>Je hebt de doelen van deze lijst zelf aangepast na het nakijken.</strong> Bewaar je de lijst opnieuw, dan wordt ze weer samengesteld uit de
              officiële doelen en gaan je eigen aanpassingen verloren.
            </p>
          </div>
        </div>
      )}
      {bestaandeStatus === 'niet-gecontroleerd' && (
        <div className="callout warn sam-gewijzigd" role="note">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>
              <strong>Deze lijst is niet nagekeken.</strong> Bewaar je ze opnieuw, dan wordt ze opnieuw samengesteld uit de officiële doelen; wat je zelf in de
              doelen veranderde, gaat dan verloren.
            </p>
          </div>
        </div>
      )}
      {stap < 3 && <RichtingMelding richting={richting} onbekend={onbekendeRichting} bestaand={bestaand !== undefined} begin={begin} genegeerd={genegeerd} />}
      {linkOvergeslagen > 0 && stap < 3 && (
        <div className="callout warn" role="note">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>
              {linkOvergeslagen === 1
                ? 'Een gevraagde set werd niet gevonden en is overgeslagen.'
                : `${linkOvergeslagen} gevraagde sets konden niet gekozen worden en zijn overgeslagen.`}
            </p>
          </div>
        </div>
      )}

      <ol className="il-stappen sam-stappen" aria-label="De drie stappen">
        {STAPPEN.map((s) => (
          <li key={s.nr} className={`il-stap${s.nr === stap ? ' huidig' : ''}${s.nr < stap ? ' klaar' : ''}`} aria-current={s.nr === stap ? 'step' : undefined}>
            <span className="il-stap-nr" aria-hidden="true">{s.nr < stap ? <Check size={16} /> : s.nr}</span>
            <span className="il-stap-naam">{s.kort}</span>
            {s.nr < stap && <span className="sr-only"> (klaar)</span>}
            {s.nr === stap && <span className="sr-only"> (huidige stap)</span>}
          </li>
        ))}
      </ol>

      <h2 className="il-stapkop" tabIndex={-1} ref={kopRef}>Stap {stap} van 3: {huidig.titel}</h2>

      {stap === 1 && (
        <StapSets
          sets={sets} keuze={keuze} filter={filter} zichtbaar={zichtbaar} onFilter={wijzigFilter}
          onMeer={() => setZichtbaar((z) => z + SETS_PER_KEER)}
          onWissel={(id) => setKeuze((k) => wisselSet(k, id))} onWeg={(id) => setKeuze((k) => haalSetWeg(k, id))}
          verbergSetId={richting !== undefined}
        />
      )}
      {stap === 2 && (
        <StapDoelen
          keuze={keuze} onKeuze={setKeuze} indexSets={indexSets} oud={oud} stand={stand} kiesbaar={kiesbaar} laden={laden}
          zoek={zoekDoel} onZoek={setZoekDoel} onOpnieuw={opnieuw} onWeg={weg} verbergSetId={richting !== undefined}
        />
      )}
      {stap === 3 && resultaat && (
        <StapBewaren
          resultaat={resultaat} titel={titel} voorstel={voorstel} onTitel={wijzigTitel} onVoorstel={() => setTitelEigen(false)}
          vak={vak} onVak={setVak} alleenNagekeken={richting !== undefined}
        />
      )}

      <div className="il-nav">
        {stap > 1 && (
          <button type="button" className="btn btn-ghost" onClick={() => setStap((s) => (s > 1 ? ((s - 1) as Stap) : s))}>
            <BackIcon size={18} /> Terug
          </button>
        )}
        {stap < 3 ? (
          <button
            type="button" className="btn btn-primary il-volgende" aria-disabled={ontbreekt.length > 0 ? 'true' : undefined}
            aria-describedby={ontbreekt.length > 0 ? 'il-ontbreekt' : undefined} onClick={volgende}
          >
            Volgende <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="button" className="btn btn-primary il-volgende sam-bewaar" aria-disabled={ontbreekt.length > 0 ? 'true' : undefined}
            aria-describedby={ontbreekt.length > 0 ? 'il-ontbreekt' : undefined} onClick={bewaar}
          >
            <Check size={18} /> Bewaar de lijst
          </button>
        )}
      </div>
      {ontbreekt.length > 0 && <p id="il-ontbreekt" className="il-ontbreekt">{zegOntbreekt(ontbreekt)}</p>}
    </>
  );
}
