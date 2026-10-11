// ── Leerplan inlezen: de wizard in vier stappen ─────────────────────────────
//
// /leerplannen/inlezen                      een nieuw leerplan inlezen
// /leerplannen/inlezen/:curriculumId        een bestaand leerplan nakijken en bevestigen
// /leerplannen/inlezen?richting=G-0193&jaar=4&soort=so   een leerplan inlezen voor een studierichting: graad, stroom (1ste graad)
//                                           en soort onderwijs staan vooraf ingevuld, in stap 3 staan de sets van die richting
//                                           (en alleen die: andere sets zoekt de leerkracht zelf) en het leerplan bewaart de richting
//
// Stap 1 welk leerplan, stap 2 de bron (pdf of geplakte tekst, de lezer zoekt de doelen), stap 3
// minimumdoelen koppelen, stap 4 nakijken. Alle regels staan in lib/leerplanInlezen.ts; de stappen zelf in
// components/curriculum/inlezen/. De pagina houdt de staat vast, zodat een stap terug niets kwijtraakt,
// en zet bij elke stapwissel de focus op de kop van de nieuwe stap.
//
// Alles blijft op dit toestel: de pdf wordt in de browser gelezen en niets gaat het toestel af, behalve als de
// leerkracht in stap 2 de AI laat helpen (dan gaat de tekst naar de AI-aanbieder die ze zelf koos).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { Curriculum, CurriculumGoal } from '../lib/curriculumTypes';
import { getCurriculum, isVeiligDoelId, veiligDoelId } from '../lib/curriculum';
import {
  AI_NIEUW_ROUTE, aantalMetVerwijzing, bronKomtOvereen, codesUitDoelen, keuzeUitLeerplan, koppelDoelen, leegRecord, leesNakijkerNaam, legeKeuze,
  maakAiVoorinvulling, ontbreektInKeuze, stelTitelVoor, zegOntbrekend, zoekDoelen,
  type BronGegevens, type Gevonden, type LeerplanKeuze, type Ontbrekend,
} from '../lib/leerplanInlezen';
import { AI_VOORINVULLING_SLEUTEL } from '../lib/leerplanAiOverdracht';
import { bkInleesTekst } from '../lib/bkWeergave';
import { isBkLeerplan, isSamengesteld, uitOfficieleBron } from '../lib/leerplanStatus';
import type { RichtingInfo, RichtingKader } from '../lib/richtingKader';
import {
  doelgroepBijRichting, genegeerdZinnen, invulVoorInlezen, kaderStand, leesRichtingParams, richtingTekst,
  VERDER_ZONDER_RICHTING, type GenegeerdParam, type RichtingLink, type RichtingParams,
} from '../lib/richtingLink';
import type { VerwijzingProbleem } from '../lib/minimumdoelVerwijzing';
import { uid } from '../lib/utils';
import { leesPdfBestand, type PdfStand } from '../components/curriculum/inlezen/leesPdf';
import { StapBron } from '../components/curriculum/inlezen/StapBron';
import { StapKoppelen } from '../components/curriculum/inlezen/StapKoppelen';
import { StapLeerplan } from '../components/curriculum/inlezen/StapLeerplan';
import { StapNakijken } from '../components/curriculum/inlezen/StapNakijken';
import { useSetKandidaten, type SetInvoer } from '../components/curriculum/inlezen/useSetKandidaten';
import { FoutBericht, LaadBericht } from '../components/curriculum/LaadStatus';
import { BackIcon, InfoIcon, WarningIcon } from '../components/icons';
import { useFocusNaVerderZonderRichting, useRichtingUitLink } from '../components/richting/useRichtingUitLink';
import { ConfirmModal } from '../components/ui';
import '../styles/materiaal.css';
import '../styles/leerplan.css';
import '../styles/inlezen.css';

type Stap = 1 | 2 | 3 | 4;

const STAPPEN: readonly { nr: Stap; kort: string; titel: string }[] = [
  { nr: 1, kort: 'Welk leerplan?', titel: 'Welk leerplan?' },
  { nr: 2, kort: 'De bron', titel: 'De bron' },
  { nr: 3, kort: 'Minimumdoelen', titel: 'Minimumdoelen koppelen' },
  { nr: 4, kort: 'Nakijken', titel: 'Nakijken' },
];

const HOE_WERKT_HET = [
  { kop: 'Welk leerplan?', zin: 'Je kiest het net, het vak, de graad en de stroom van je leerplan.' },
  { kop: 'De bron', zin: 'Je leest de pdf van het leerplan in of plakt de tekst, en Boosterz zoekt de doelen.' },
  { kop: 'Minimumdoelen koppelen', zin: 'Boosterz koppelt de verwijzingen in je leerplan aan de officiële minimumdoelen.' },
  { kop: 'Nakijken', zin: 'Je vergelijkt elk doel met de bron en bevestigt dat het klopt, of je bewaart het leerplan om het later na te kijken.' },
];

const GEEN_SETS: readonly string[] = [];

// ── De pagina: een nieuw of een bestaand leerplan ───────────────────────────

export function LeerplanInlezenPage() {
  const { curriculumId } = useParams();
  const [params] = useSearchParams();
  // Een bestaand leerplan heeft zijn eigen studierichting: een richting in de link telt alleen voor een nieuw leerplan.
  const richting = leesRichtingParams(curriculumId ? new URLSearchParams() : params);
  // Een ander leerplan of een andere richting, jaar of soort is een nieuwe wizard: alle staat begint opnieuw.
  return <Wizard key={`${curriculumId ?? 'nieuw'}|${richting.sleutel}`} curriculumId={curriculumId} richting={richting} />;
}

function Wizard({ curriculumId, richting }: { curriculumId?: string; richting: RichtingParams }) {
  const bestaand = useMemo(() => {
    const cur = curriculumId ? getCurriculum(curriculumId) : undefined;
    // Een doel-id als "constructor" (uit een bestand van iemand anders, bewaard vóór het saneren dat weigerde) krijgt een nieuw id.
    return cur ? { ...cur, goals: cur.goals.map((g) => (isVeiligDoelId(g.id) ? g : { ...g, id: veiligDoelId(g.id) })) } : undefined;
  }, [curriculumId]);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  if (curriculumId && !bestaand) {
    return (
      <div className="page mat-page il-page">
        <div className="page-head"><div><h1>Leerplan nakijken</h1></div></div>
        <div className="callout warn" role="alert">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>Dit leerplan werd niet gevonden. Misschien is het verwijderd.</p>
            <Link className="btn btn-sm btn-ghost" to="/leerplannen"><BackIcon size={16} /> Naar de leerplannen</Link>
          </div>
        </div>
      </div>
    );
  }
  // Een hele officiële set, een zelf samengestelde lijst en de competenties van beroepskwalificaties komen letterlijk uit de
  // officiële bron: daar is niets in te lezen.
  if (bestaand && uitOfficieleBron(bestaand)) {
    const aanpasbaar = isSamengesteld(bestaand) && bestaand.kind !== 'eigen';
    // Bij een beroepskwalificatie staat de zin in bkWeergave.ts; de titel blijft vet, zoals bij de minimumdoelen.
    const bkTitel = bestaand.title.trim();
    const bkZin = isBkLeerplan(bestaand) ? bkInleesTekst(bestaand.title) : '';
    const bkTitelVet = bkTitel !== '' && bkZin.startsWith(bkTitel);
    return (
      <div className="page mat-page il-page">
        <div className="page-head"><div><h1>Leerplan nakijken</h1></div></div>
        <div className="callout" role="note">
          <InfoIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>
              {bkZin !== '' ? (
                bkTitelVet ? <><strong>{bkTitel}</strong>{bkZin.slice(bkTitel.length)}</> : bkZin
              ) : (
                <>
                  <strong>{bestaand.title}</strong> komt rechtstreeks uit de officiële minimumdoelen. Er valt niets in te lezen: de doelen staan letterlijk
                  zoals in de officiële bron.
                </>
              )}
              {aanpasbaar && ' Wil je andere doelen kiezen? Pas de keuze aan: de lijst wordt dan opnieuw nagekeken.'}
            </p>
            <div className="lp-acties">
              <Link className="btn btn-sm btn-ghost" to={`/leerplannen?open=${encodeURIComponent(bestaand.id)}`}><BackIcon size={16} /> Terug naar het leerplan</Link>
              {aanpasbaar && <Link className="btn btn-sm btn-ghost" to={`/leerplannen/samenstellen/${encodeURIComponent(bestaand.id)}`}>Keuze aanpassen</Link>}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (richting.link) return <MetRichting link={richting.link} genegeerd={richting.genegeerd} />;
  return <Inlezen bestaand={bestaand} onbekendeRichting={richting.aanwezig} />;
}

// ── Met een studierichting: eerst de gegevens, dan pas de wizard ────────────

/**
 * Laadt de matrix, de koppeling, de index en het kader van de richting uit de link en monteert de wizard pas als alles
 * er is, zodat stap 1 meteen goed ingevuld is. Kent de matrix de richting niet, dan begint de wizard met een melding.
 */
function MetRichting({ link, genegeerd }: { link: RichtingLink; genegeerd: readonly GenegeerdParam[] }) {
  const r = useRichtingUitLink(link);
  if (r.status === 'laden' || r.status === 'fout') {
    return (
      <div className="page mat-page il-page">
        <Link to="/leerplannen" className="btn btn-sm btn-quiet il-terug"><BackIcon size={16} /> Leerplannen</Link>
        <div className="page-head">
          <div className="il-intro">
            <h1>Leerplan inlezen</h1>
          </div>
        </div>
        {r.status === 'laden'
          ? <LaadBericht tekst="De studierichting en haar doelen worden geladen…" />
          : (
            <>
              <FoutBericht fout={r.fout} onOpnieuw={r.opnieuw} />
              <p><Link className="btn btn-sm btn-ghost" to="/leerplannen/inlezen" state={VERDER_ZONDER_RICHTING}>Verder zonder studierichting</Link></p>
            </>
          )}
      </div>
    );
  }
  if (r.status === 'onbekend') return <Inlezen onbekendeRichting />;
  return <Inlezen richting={{ info: r.info, kader: r.kader }} genegeerd={genegeerd} />;
}

/** Een studierichting met haar kader. */
interface RichtingMetKader {
  info: RichtingInfo;
  kader: RichtingKader;
}

/** De melding over de richting in de link, boven de stappen. */
function RichtingMelding({
  richting, onbekend, genegeerd,
}: {
  richting?: RichtingMetKader;
  onbekend: boolean;
  /** Wat de link nog vroeg en niet bruikbaar was (jaar, soort). */
  genegeerd: readonly GenegeerdParam[];
}) {
  // De zin over een jaar of soort dat niet bruikbaar was, staat los van de melding over het kader: ze geldt altijd als de richting bekend is.
  const zinnen = richting ? genegeerdZinnen(genegeerd) : [];
  return (
    <>
      <KaderMelding richting={richting} onbekend={onbekend} />
      {zinnen.length > 0 && (
        <div className="callout warn" role="note">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            {zinnen.map((zin) => <p key={zin}>{zin}</p>)}
          </div>
        </div>
      )}
    </>
  );
}

function KaderMelding({ richting, onbekend }: { richting?: RichtingMetKader; onbekend: boolean }) {
  if (!richting) {
    if (!onbekend) return null;
    return (
      <div className="callout warn" role="note">
        <WarningIcon size={20} className="il-callout-icoon" />
        <div className="il-callout-tekst">
          <p>Deze link noemt een studierichting die Boosterz niet (meer) kent. Je begint met een lege keuze.</p>
        </div>
      </div>
    );
  }
  const tekst = richtingTekst(richting.info);
  const stand = kaderStand(richting.kader);
  return (
    <div className={stand === 'ok' ? 'callout' : 'callout warn'} role="note">
      {stand === 'ok' ? <InfoIcon size={20} className="il-callout-icoon" /> : <WarningIcon size={20} className="il-callout-icoon" />}
      <div className="il-callout-tekst">
        <p>
          Je leest een leerplan in voor <strong>{tekst}</strong>.{' '}
          {stand === 'ok' && 'Boosterz toont de sets van die richting; andere sets zoek je zelf.'}
          {stand === 'nog-niet-opgehaald' && 'De doelen van die studierichting zijn nog niet opgehaald, dus Boosterz kan de sets van die richting niet tonen.'}
          {stand === 'geen' && 'De officiële bron koppelt geen minimumdoelen aan die studierichting, dus Boosterz kan de sets van die richting niet tonen.'}
        </p>
      </div>
    </div>
  );
}

// ── De wizard ───────────────────────────────────────────────────────────────

function Inlezen({
  bestaand, richting, onbekendeRichting = false, genegeerd = [],
}: {
  bestaand?: Curriculum;
  /** De studierichting uit de link (alleen bij een nieuw leerplan), met haar kader. */
  richting?: RichtingMetKader;
  /** Er staat een richting in de link die Boosterz niet kent. */
  onbekendeRichting?: boolean;
  /** Wat de link nog vroeg en niet bruikbaar was (jaar, soort); alleen met een richting. */
  genegeerd?: readonly GenegeerdParam[];
}) {
  const navigate = useNavigate();

  const [stap, setStap] = useState<Stap>(bestaand ? 2 : 1);
  const [hoeOpen, setHoeOpen] = useState<boolean | null>(null);

  // Stap 1
  const [keuze, setKeuze] = useState<LeerplanKeuze>(() => {
    if (bestaand) return keuzeUitLeerplan(bestaand);
    // Graad, stroom (1ste graad) en soort onderwijs volgen uit de richting; de rest vult de leerkracht zelf in.
    return richting ? { ...legeKeuze(), ...invulVoorInlezen(richting.info, richting.kader) } : legeKeuze();
  });
  const [titelEigen, setTitelEigen] = useState(bestaand !== undefined);

  // Stap 2
  const [methode, setMethode] = useState<'pdf' | 'tekst'>('pdf');
  const [pdf, setPdf] = useState<PdfStand>({ status: 'leeg' });
  const [tekst, setTekst] = useState('');
  const [gevonden, setGevonden] = useState<Gevonden | null>(null);
  const [gevondenTekst, setGevondenTekst] = useState('');
  const [zoekt, setZoekt] = useState(false);
  const [vraagOpnieuwZoeken, setVraagOpnieuwZoeken] = useState(false);

  // Stap 4: het werk aan de doelen (blijft staan als je een stap terug gaat)
  const [doelen, setDoelen] = useState<CurriculumGoal[]>(() => bestaand?.goals ?? []);
  const [problemen, setProblemen] = useState<Record<string, VerwijzingProbleem[]>>(() => leegRecord());
  const [bewerkt, setBewerkt] = useState(false);
  const [koppelSleutel, setKoppelSleutel] = useState<string | null>(null);
  const [naam, setNaam] = useState(leesNakijkerNaam);
  const [nieuwId] = useState(uid);
  const [startTijd] = useState(Date.now);

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

  // ── De bron die nu geldt ──
  const bron = useMemo<BronGegevens | null>(() => {
    if (methode === 'pdf') return pdf.status === 'klaar' ? pdf.bron : null;
    return tekst.trim() ? { methode: 'tekst', tekst, afgekapt: false } : null;
  }, [methode, pdf, tekst]);
  const verouderd = gevonden !== null && bron?.tekst !== gevondenTekst;
  const overeen = useMemo(() => (bestaand && bron ? bronKomtOvereen(bestaand.herkomst, bron) : undefined), [bestaand, bron]);

  // ── Stap 3: sets ──
  const startDoelen = useMemo(() => gevonden?.goals ?? bestaand?.goals ?? [], [gevonden, bestaand]);
  const codes = useMemo(() => codesUitDoelen(startDoelen), [startDoelen]);
  const aantalDoelenMetVerwijzing = useMemo(() => aantalMetVerwijzing(startDoelen), [startDoelen]);
  // De sets van het kader van de richting, als dat iets zegt: die komen vooraan (en de lijst blijft daartoe beperkt).
  const richtingSets = useMemo(
    () => (richting && kaderStand(richting.kader) === 'ok' ? richting.kader.sets.map((k) => k.set.id) : undefined),
    [richting],
  );
  const invoer = useMemo<SetInvoer>(
    () => ({
      graad: keuze.graad, stroom: keuze.stroom, onderwijs: keuze.onderwijs, vak: keuze.vak, codes, eigen: bestaand?.minimumdoelenSets ?? GEEN_SETS,
      ...(richtingSets ? { richtingSets } : {}),
    }),
    [keuze.graad, keuze.stroom, keuze.onderwijs, keuze.vak, codes, bestaand, richtingSets],
  );
  const sets = useSetKandidaten(invoer, stap >= 3);
  // De studierichting van het leerplan, met de sets die echt gekozen zijn en het vak uit stap 1. Stabiel, want StapNakijken bouwt er het ontwerp mee.
  const doelgroep = useMemo(
    () => (richting ? doelgroepBijRichting(richting.info, richting.kader, sets.stand.gekozen, keuze.vak) : undefined),
    [richting, sets.stand.gekozen, keuze.vak],
  );

  // ── Wijzigingen ──
  const wijzigKeuze = (patch: Partial<LeerplanKeuze>) =>
    setKeuze((k) => {
      const nieuw = { ...k, ...patch };
      if (!titelEigen) nieuw.titel = stelTitelVoor(nieuw);
      return nieuw;
    });
  const wijzigTitel = (titel: string) => {
    setTitelEigen(titel.trim() !== '' && titel !== stelTitelVoor(keuze));
    setKeuze((k) => ({ ...k, titel }));
  };
  const wijzigDoelen = useCallback((fn: (d: CurriculumGoal[]) => CurriculumGoal[]) => {
    setDoelen(fn);
    setBewerkt(true);
  }, []);

  const kiesPdf = async (file: File) => {
    setPdf({ status: 'bezig', naam: file.name });
    setPdf(await leesPdfBestand(file));
  };

  const doeZoeken = async () => {
    if (!bron) return;
    setVraagOpnieuwZoeken(false);
    setZoekt(true);
    // Even ruimte voor het scherm: een lang leerplan kan een paar seconden duren.
    await new Promise((r) => window.setTimeout(r, 30));
    const g = zoekDoelen(bron.tekst);
    setGevonden(g);
    setGevondenTekst(bron.tekst);
    setDoelen(g.goals);
    setProblemen(leegRecord());
    setKoppelSleutel(null);
    setBewerkt(false);
    setZoekt(false);
  };
  const zoek = () => {
    // Wie in stap 4 al doelen aanpaste, verliest die door opnieuw te zoeken: eerst vragen.
    if (gevonden && bewerkt) setVraagOpnieuwZoeken(true);
    else void doeZoeken();
  };

  // ── Van stap naar stap ──
  const ontbreekt: Ontbrekend[] = useMemo(() => {
    if (stap === 1) return ontbreektInKeuze(keuze);
    if (stap === 2) {
      if (!bron) return [{ veld: methode === 'pdf' ? 'il-pdf-knop' : 'il-tekst', tekst: methode === 'pdf' ? 'lees een pdf in' : 'plak de tekst van het leerplan' }];
      if (bestaand) return [];
      if (zoekt) return [{ tekst: 'wacht tot de doelen gezocht zijn' }];
      if (!gevonden) return [{ veld: 'il-zoek-knop', tekst: 'klik op “Doelen zoeken”' }];
      if (verouderd) return [{ veld: 'il-zoek-knop', tekst: 'zoek de doelen opnieuw, want de bron is gewijzigd' }];
      // De melding "Geen doelen gevonden" in stap 2 legt het al uit: hier niet nog eens.
      if (gevonden.goals.length === 0) return [{ veld: 'il-geen', elders: 'il-gevonden-kop', tekst: 'kies een bron waarin doelen staan, want er zijn er geen gevonden' }];
      return [];
    }
    if (stap === 3 && sets.stand.status === 'laden') return [{ tekst: 'wacht tot de sets geladen zijn' }];
    return [];
  }, [stap, keuze, bron, methode, bestaand, zoekt, gevonden, verouderd, sets.stand.status]);

  const gekozenBestanden = () => sets.stand.gekozen.map((id) => sets.bestanden.get(id)).filter((b) => b !== undefined);
  const koppelSleutelNu = () => `${[...sets.stand.gekozen].sort().join('|')}#${gevonden?.op ?? 'bestaand'}`;
  /** Verwijzingen uit de bron koppelen aan de gekozen sets; zonder sets blijft alles zoals het was. */
  const koppel = () => {
    const bestanden = gekozenBestanden();
    setKoppelSleutel(koppelSleutelNu());
    if (bestanden.length === 0) {
      setProblemen(leegRecord());
      return;
    }
    const r = koppelDoelen(doelen, bestanden, { alleenZonderRefs: bestaand !== undefined });
    setDoelen(r.goals);
    setProblemen(r.problemen);
  };
  const naarStap = (nieuw: Stap) => {
    // De koppeling loopt opnieuw als je andere sets koos (of andere doelen zocht) sinds de vorige keer.
    if (nieuw === 4 && koppelSleutel !== koppelSleutelNu()) koppel();
    setStap(nieuw);
  };

  const volgende = () => {
    if (ontbreekt.length > 0) {
      const veld = ontbreekt.find((o) => o.veld)?.veld;
      if (veld) document.getElementById(veld)?.focus();
      return;
    }
    naarStap((stap + 1) as Stap);
  };

  // Legt een ander stuk pagina al uit wat er ontbreekt, dan verwijst de knop daarheen en staat het er niet nog eens onder.
  const uitleg = ontbreekt.length > 0 && ontbreekt.every((o) => o.elders !== undefined) ? ontbreekt[0].elders : undefined;

  const huidig = STAPPEN[stap - 1];
  const terugNaar = bestaand ? `/leerplannen?open=${encodeURIComponent(bestaand.id)}` : '/leerplannen';

  return (
    <div className="page mat-page il-page">
      <Link to={terugNaar} className="btn btn-sm btn-quiet il-terug"><BackIcon size={16} /> {bestaand ? 'Terug naar het leerplan' : 'Leerplannen'}</Link>
      <div className="page-head">
        <div className="il-intro">
          <h1>{bestaand ? 'Leerplan nakijken' : 'Leerplan inlezen'}</h1>
          <p className="sub">
            {bestaand
              ? `Kijk “${bestaand.title}” na met de bron erbij, en bevestig dat de doelen kloppen.`
              : 'In vier stappen haal je de doelen uit het leerplan van je net en koppel je ze aan de officiële minimumdoelen.'}
          </p>
        </div>
      </div>

      {stap < 4 && <RichtingMelding richting={richting} onbekend={onbekendeRichting} genegeerd={genegeerd} />}

      <details
        className="callout mat-details il-hoe" open={hoeOpen ?? false}
        onToggle={(e) => setHoeOpen(e.currentTarget.open)}
      >
        <summary>
          <InfoIcon size={20} />
          <span>Hoe werkt inlezen?</span>
          <ChevronDown size={18} className="mat-chevron" />
        </summary>
        <div className="mat-details-body">
          <ol className="il-hoe-lijst">
            {HOE_WERKT_HET.map((h) => <li key={h.kop}><strong>{h.kop}{h.kop.endsWith('?') ? '' : '.'}</strong> {h.zin}</li>)}
          </ol>
        </div>
      </details>

      <ol className="il-stappen" aria-label="De vier stappen">
        {STAPPEN.map((s) => (
          <li key={s.nr} className={`il-stap${s.nr === stap ? ' huidig' : ''}${s.nr < stap ? ' klaar' : ''}`} aria-current={s.nr === stap ? 'step' : undefined}>
            <span className="il-stap-nr" aria-hidden="true">{s.nr < stap ? <Check size={16} /> : s.nr}</span>
            <span className="il-stap-naam">{s.kort}</span>
            {s.nr < stap && <span className="sr-only"> (klaar)</span>}
            {s.nr === stap && <span className="sr-only"> (huidige stap)</span>}
          </li>
        ))}
      </ol>

      <h2 className="il-stapkop" tabIndex={-1} ref={kopRef}>Stap {stap} van 4: {huidig.titel}</h2>

      {stap === 1 && <StapLeerplan keuze={keuze} onChange={wijzigKeuze} onTitel={wijzigTitel} />}
      {stap === 2 && (
        <StapBron
          bestaand={bestaand} methode={methode} onMethode={setMethode} pdf={pdf} onPdf={(f) => void kiesPdf(f)}
          tekst={tekst} onTekst={setTekst} bron={bron} gevonden={gevonden} verouderd={verouderd} bezig={zoekt}
          onZoek={zoek} onAI={() => navigate(AI_NIEUW_ROUTE, { state: { [AI_VOORINVULLING_SLEUTEL]: maakAiVoorinvulling(keuze, bron) } })}
          overeen={overeen}
        />
      )}
      {stap === 3 && (
        <StapKoppelen
          stand={sets.stand} onWissel={sets.wissel} onToevoegen={(s) => void sets.voegToe(s)} onOpnieuw={sets.opnieuw}
          aantalCodes={codes.length} aantalDoelenMetVerwijzing={aantalDoelenMetVerwijzing}
          graad={keuze.graad} stroom={keuze.stroom} onderwijs={keuze.onderwijs} herkoppelt={bewerkt && !bestaand}
          verbergSetId={richting !== undefined} voorRichting={richting && richtingSets ? richtingTekst(richting.info) : undefined}
        />
      )}
      {stap === 4 && (
        <StapNakijken
          bestaand={bestaand} keuze={keuze} bron={bron} doelen={doelen} onDoelen={wijzigDoelen} problemen={problemen} onProblemen={setProblemen}
          fragmenten={gevonden?.fragmenten ?? {}} setIds={sets.stand.gekozen} setBestanden={sets.bestanden}
          ingelezenOp={gevonden?.op ?? startTijd} nieuwId={nieuwId} naam={naam} onNaam={setNaam} onNaarStap1={() => naarStap(1)}
          doelgroep={doelgroep}
        />
      )}

      <div className="il-nav">
        {stap > 1 && (
          <button type="button" className="btn btn-ghost" onClick={() => naarStap((stap - 1) as Stap)}>
            <BackIcon size={18} /> Terug
          </button>
        )}
        {stap < 4 && (
          <button
            type="button" className="btn btn-primary il-volgende" aria-disabled={ontbreekt.length > 0 ? 'true' : undefined}
            aria-describedby={ontbreekt.length > 0 ? (uitleg ?? 'il-ontbreekt') : undefined} onClick={volgende}
          >
            Volgende <ArrowRight size={18} />
          </button>
        )}
      </div>
      {stap < 4 && ontbreekt.length > 0 && uitleg === undefined && <p id="il-ontbreekt" className="il-ontbreekt">{zegOntbrekend(ontbreekt)}</p>}

      {vraagOpnieuwZoeken && (
        <ConfirmModal
          title="Opnieuw zoeken?" confirmLabel="Opnieuw zoeken" danger={false}
          message="Je hebt in stap 4 al doelen aangepast. Als je opnieuw zoekt, gaan die aanpassingen verloren."
          onConfirm={() => void doeZoeken()} onClose={() => setVraagOpnieuwZoeken(false)}
        />
      )}
    </div>
  );
}
