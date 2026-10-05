// ── Leerplan inlezen: de wizard in vier stappen ─────────────────────────────
//
// /leerplannen/inlezen                      een nieuw leerplan inlezen
// /leerplannen/inlezen/:curriculumId        een bestaand leerplan nakijken en bevestigen
//
// Stap 1 welk leerplan, stap 2 de bron (pdf of geplakte tekst, de lezer zoekt de doelen), stap 3
// minimumdoelen koppelen, stap 4 nakijken. Alle regels staan in lib/leerplanInlezen.ts; de stappen zelf in
// components/curriculum/inlezen/. De pagina houdt de staat vast, zodat een stap terug niets kwijtraakt,
// en zet bij elke stapwissel de focus op de kop van de nieuwe stap.
//
// Alles blijft op dit toestel: de pdf wordt in de browser gelezen en niets gaat het toestel af, behalve als de
// leerkracht in stap 2 de AI laat helpen (dan gaat de tekst naar de AI-aanbieder die ze zelf koos).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { Curriculum, CurriculumGoal } from '../lib/curriculumTypes';
import { getCurriculum, isVeiligDoelId, veiligDoelId } from '../lib/curriculum';
import {
  AI_NIEUW_ROUTE, aantalMetVerwijzing, bronKomtOvereen, codesUitDoelen, keuzeUitLeerplan, koppelDoelen, leegRecord, leesNakijkerNaam, legeKeuze,
  maakAiVoorinvulling, ontbreektInKeuze, stelTitelVoor, zegOntbrekend, zoekDoelen,
  type BronGegevens, type Gevonden, type LeerplanKeuze, type Ontbrekend,
} from '../lib/leerplanInlezen';
import { AI_VOORINVULLING_SLEUTEL } from '../lib/leerplanAiOverdracht';
import { isOfficieel } from '../lib/leerplanStatus';
import type { VerwijzingProbleem } from '../lib/minimumdoelVerwijzing';
import { uid } from '../lib/utils';
import { leesPdfBestand, type PdfStand } from '../components/curriculum/inlezen/leesPdf';
import { StapBron } from '../components/curriculum/inlezen/StapBron';
import { StapKoppelen } from '../components/curriculum/inlezen/StapKoppelen';
import { StapLeerplan } from '../components/curriculum/inlezen/StapLeerplan';
import { StapNakijken } from '../components/curriculum/inlezen/StapNakijken';
import { useSetKandidaten, type SetInvoer } from '../components/curriculum/inlezen/useSetKandidaten';
import { BackIcon, InfoIcon, WarningIcon } from '../components/icons';
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
  // Een ander leerplan is een nieuwe wizard: alle staat begint opnieuw.
  return <Wizard key={curriculumId ?? 'nieuw'} curriculumId={curriculumId} />;
}

function Wizard({ curriculumId }: { curriculumId?: string }) {
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
  if (bestaand && isOfficieel(bestaand)) {
    return (
      <div className="page mat-page il-page">
        <div className="page-head"><div><h1>Leerplan nakijken</h1></div></div>
        <div className="callout" role="note">
          <InfoIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>
              <strong>{bestaand.title}</strong> komt rechtstreeks uit de officiële minimumdoelen. Er valt niets in te lezen: de doelen staan letterlijk
              zoals in de officiële bron.
            </p>
            <Link className="btn btn-sm btn-ghost" to={`/leerplannen?open=${encodeURIComponent(bestaand.id)}`}><BackIcon size={16} /> Terug naar het leerplan</Link>
          </div>
        </div>
      </div>
    );
  }
  return <Inlezen bestaand={bestaand} />;
}

// ── De wizard ───────────────────────────────────────────────────────────────

function Inlezen({ bestaand }: { bestaand?: Curriculum }) {
  const navigate = useNavigate();

  const [stap, setStap] = useState<Stap>(bestaand ? 2 : 1);
  const [hoeOpen, setHoeOpen] = useState<boolean | null>(null);

  // Stap 1
  const [keuze, setKeuze] = useState<LeerplanKeuze>(() => (bestaand ? keuzeUitLeerplan(bestaand) : legeKeuze()));
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
  const invoer = useMemo<SetInvoer>(
    () => ({ graad: keuze.graad, stroom: keuze.stroom, onderwijs: keuze.onderwijs, vak: keuze.vak, codes, eigen: bestaand?.minimumdoelenSets ?? GEEN_SETS }),
    [keuze.graad, keuze.stroom, keuze.onderwijs, keuze.vak, codes, bestaand],
  );
  const sets = useSetKandidaten(invoer, stap >= 3);

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
        />
      )}
      {stap === 4 && (
        <StapNakijken
          bestaand={bestaand} keuze={keuze} bron={bron} doelen={doelen} onDoelen={wijzigDoelen} problemen={problemen} onProblemen={setProblemen}
          fragmenten={gevonden?.fragmenten ?? {}} setIds={sets.stand.gekozen} setBestanden={sets.bestanden}
          ingelezenOp={gevonden?.op ?? startTijd} nieuwId={nieuwId} naam={naam} onNaam={setNaam} onNaarStap1={() => naarStap(1)}
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
