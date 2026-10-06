// ── Stel je eigen doelenlijst samen: de wizard in drie stappen ──────────────
//
// /leerplannen/samenstellen                       een nieuwe lijst
// /leerplannen/samenstellen?sets=ODS_1,ODS_2      met deze sets vooraf gekozen, helemaal aangevinkt (begint bij stap 2)
// /leerplannen/samenstellen?sets=ODS_1&leeg=1     met deze set vooraf gekozen maar niets aangevinkt (bv. de STEM-set)
// /leerplannen/samenstellen/:curriculumId         de keuze van een bewaarde lijst aanpassen (begint bij stap 2)
//
// Stap 1 kiest sets, stap 2 de doelen (hele sets of losse doelen), stap 3 geeft de lijst een naam en bewaart ze. De doelen
// blijven letterlijk zoals in de officiële bron, dus de lijst is meteen nagekeken (lib/doelenSamenstellen.ts). De keuzelogica
// staat in lib/samenstelKeuze.ts, de stappen in components/curriculum/samenstellen/. De pagina houdt de staat vast, zodat een
// stap terug niets kwijtraakt, en zet bij elke stapwissel de focus op de kop van de nieuwe stap.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import type { Curriculum } from '../lib/curriculumTypes';
import type { MinimumdoelenIndexSet } from '../lib/minimumdoelen';
import { getCurriculum, saveCurriculum } from '../lib/curriculum';
import { leerplanUitSelectie, selectieVanLeerplan, voorstelTitel } from '../lib/doelenSamenstellen';
import { effectieveStatus, isSamengesteld } from '../lib/leerplanStatus';
import { laadIndex, oudeVersieIds } from '../lib/minimumdoelenBron';
import {
  aantalGevraagdeSets, beginUitSelectie, beginUitSets, bouwSetKeuzes, haalSetWeg, kiesbareDoelen, ontbreektInStap1, ontbreektInStap2, ontbreektInStap3,
  setsUitParam, telGekozen, wisselSet, zegOntbreekt, type SamenstelKeuze,
} from '../lib/samenstelKeuze';
import { useLaadstand } from '../lib/useLaadstand';
import { FoutBericht, LaadBericht } from '../components/curriculum/LaadStatus';
import { StapBewaren } from '../components/curriculum/samenstellen/StapBewaren';
import { StapDoelen } from '../components/curriculum/samenstellen/StapDoelen';
import { BEGIN_FILTER, SETS_PER_KEER, StapSets, type SetFilterStaat } from '../components/curriculum/samenstellen/StapSets';
import { useSetBestanden } from '../components/curriculum/samenstellen/useSetBestanden';
import { BackIcon, WarningIcon } from '../components/icons';
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
  // Een andere lijst of andere sets in de link is een nieuwe wizard: alle staat begint opnieuw.
  return <Samenstellen key={`${curriculumId ?? ''}?${setsParam ?? ''}&${leeg ? 'leeg' : 'alles'}`} curriculumId={curriculumId} setsParam={setsParam} leeg={leeg} />;
}

type Probleem = 'ontbreekt' | 'niet-samengesteld' | 'eigen-kopie';

/** Waarom een lijst niet aan te passen is; `undefined` als het kan. */
function probleemMet(cur: Curriculum | undefined): Probleem | undefined {
  if (!cur) return 'ontbreekt';
  if (!isSamengesteld(cur)) return 'niet-samengesteld';
  if (cur.kind === 'eigen') return 'eigen-kopie';
  return undefined;
}

function Samenstellen({ curriculumId, setsParam, leeg }: { curriculumId?: string; setsParam: string | null; leeg: boolean }) {
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
      ) : index.stand.status === 'laden' ? (
        <LaadBericht tekst="De sets worden geladen…" />
      ) : index.stand.status === 'fout' ? (
        <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />
      ) : (
        <Wizard sets={index.stand.waarde.sets} bestaand={bestaand} setsParam={setsParam} leeg={leeg} />
      )}
    </div>
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

function beginKeuze(bestaand: Curriculum | undefined, setsParam: string | null, leeg: boolean, bekend: ReadonlySet<string>): SamenstelKeuze {
  if (bestaand) return beginUitSelectie(selectieVanLeerplan(bestaand));
  return beginUitSets(setsUitParam(setsParam).filter((id) => bekend.has(id)), leeg);
}

function Wizard({
  sets, bestaand, setsParam, leeg,
}: {
  sets: readonly MinimumdoelenIndexSet[];
  bestaand?: Curriculum;
  setsParam: string | null;
  /** `?leeg=1`: de sets uit de link staan gekozen, maar met niets aangevinkt. */
  leeg: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const [begin] = useState(() => beginKeuze(bestaand, setsParam, leeg, new Set(sets.map((s) => s.id))));
  const [keuze, setKeuze] = useState<SamenstelKeuze>(begin);
  const [stap, setStap] = useState<Stap>(begin.sets.length > 0 ? 2 : 1);
  // Sets uit de link die niet bestaan, ongeldig zijn of boven het maximum vallen, worden overgeslagen: dat zeggen we, in stap 1 en 2.
  const [linkOvergeslagen] = useState(() => (bestaand ? 0 : Math.max(0, aantalGevraagdeSets(setsParam) - begin.sets.length)));

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
  const voorstel = useMemo(() => (keuzes.length > 0 ? voorstelTitel(keuzes.map((s) => s.bestand.set)) : ''), [keuzes]);
  const titel = titelEigen ? titelTekst : voorstel;
  // Het overzicht hangt niet af van de naam: anders loopt de hele controle bij elke toets opnieuw. Bij het bewaren wel.
  const resultaat = useMemo(
    () => (stap === 3 ? leerplanUitSelectie(keuzes, { titel: voorstel, bestaand, oudeVersies: oud }) : undefined),
    [stap, keuzes, voorstel, bestaand, oud],
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
    return ontbreektInStap3(titel, n, (resultaat?.waarschuwingen.length ?? 0) > 0);
  }, [stap, keuze, laden, mislukt, totaal.doelen, titel, resultaat]);

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
      const r = leerplanUitSelectie(keuzes, { titel: titel.trim(), vak: vak.trim(), bestaand, oudeVersies: oud });
      if (r.leerplan.goals.length === 0) {
        toast('Kies minstens één doel.', 'err');
        return;
      }
      // Lukt het bewaren niet (opslag vol), dan meldt de opslaglaag dat zelf: dan blijven we hier.
      if (!saveCurriculum(r.leerplan)) return;
      bewaard.current = true;
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
        />
      )}
      {stap === 2 && (
        <StapDoelen
          keuze={keuze} onKeuze={setKeuze} indexSets={indexSets} oud={oud} stand={stand} kiesbaar={kiesbaar} laden={laden}
          zoek={zoekDoel} onZoek={setZoekDoel} onOpnieuw={opnieuw} onWeg={weg}
        />
      )}
      {stap === 3 && resultaat && (
        <StapBewaren
          resultaat={resultaat} titel={titel} voorstel={voorstel} onTitel={wijzigTitel} onVoorstel={() => setTitelEigen(false)}
          vak={vak} onVak={setVak}
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
