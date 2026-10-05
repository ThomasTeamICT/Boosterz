// ── Officiële minimumdoelen: de wettelijke basis, letterlijk uit de bron ────
//
// /leerplannen/minimumdoelen           lijst met sets, met zoeken en filters
// /leerplannen/minimumdoelen/:setId    dezelfde pagina met één set open (deelbaar)
//
// De bestanden staan naast de app (public/leerplannen/minimumdoelen/) en worden pas opgehaald als
// iemand ze opent (lib/minimumdoelenBron.ts). De doelteksten zijn vaak HTML: ze gaan door
// htmlNaarTekst en komen als gewone tekst op het scherm, nooit als HTML.
// "Gebruik als leerplan" maakt een nagekeken leerplan rechtstreeks uit de set (lib/minimumdoelenLeerplan.ts).

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ExternalLink, ListTree, LoaderCircle } from 'lucide-react';
import { controleStatus, getCurricula, saveCurriculum } from '../lib/curriculum';
import { geldigheidVanDoelen, htmlNaarTekst, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from '../lib/minimumdoelen';
import {
  FOUT_NIET_GELADEN, SOORT_LABEL, contextVanSet, datumLeesbaar, filterSets, geldigheidTekst, graadOpties, indexHeeftGeldigheid,
  laadIndex, laadSet, soortVanSet, veiligeLink, type GeldigheidCode, type SoortOnderwijs,
} from '../lib/minimumdoelenBron';
import { isAttitude, isOptioneel, leerplanUitSet, themaVanDoel, vindLeerplanVoorSet } from '../lib/minimumdoelenLeerplan';
import { DoelenPerRubriek, type DoelRij } from '../components/curriculum/DoelenPerRubriek';
import { Field, useToast } from '../components/ui';
import { BackIcon, InfoIcon, RetryIcon, WarningIcon } from '../components/icons';
import '../styles/minimumdoelen.css';

const BASIS_ROUTE = '/leerplannen/minimumdoelen';
/** Zoveel sets staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
const STAP = 60;
const SMAL_SCHERM = '(max-width: 899px)';

type Geldigheid = GeldigheidCode | 'alle';
const GELDIGHEID_KNOPPEN: { id: Geldigheid; label: string }[] = [
  { id: 'G', label: 'Geldig' },
  { id: 'N', label: 'Niet meer geldig' },
  { id: 'O', label: 'Onbekend' },
  { id: 'alle', label: 'Alle' },
];
const SOORT_VOLGORDE: SoortOnderwijs[] = ['so', 'buso', 'vwo', 'ander'];

// ── Laden met opnieuw proberen ──────────────────────────────────────────────

type Laadstand<T> = { status: 'laden' } | { status: 'klaar'; waarde: T } | { status: 'fout'; fout: string };
const LADEN = { status: 'laden' } as const;

/** Haalt iets op en onthoudt de uitkomst per sleutel; een andere sleutel begint meteen weer bij "laden". */
function useLaadstand<T>(sleutel: string, laad: () => Promise<T>): { stand: Laadstand<T>; opnieuw: () => void } {
  const [poging, setPoging] = useState(0);
  const volledig = `${sleutel}#${poging}`;
  const [uitkomst, setUitkomst] = useState<{ sleutel: string; stand: Laadstand<T> } | null>(null);
  const laadRef = useRef(laad);
  laadRef.current = laad;
  useEffect(() => {
    let weg = false;
    laadRef.current().then(
      (waarde) => { if (!weg) setUitkomst({ sleutel: volledig, stand: { status: 'klaar', waarde } }); },
      (e: unknown) => { if (!weg) setUitkomst({ sleutel: volledig, stand: { status: 'fout', fout: e instanceof Error ? e.message : FOUT_NIET_GELADEN } }); },
    );
    return () => { weg = true; };
  }, [volledig]);
  const stand: Laadstand<T> = uitkomst && uitkomst.sleutel === volledig ? uitkomst.stand : LADEN;
  return { stand, opnieuw: () => setPoging((p) => p + 1) };
}

function LaadBericht({ tekst }: { tekst: string }) {
  return (
    <div className="md-status" role="status">
      <LoaderCircle size={20} className="md-spin" aria-hidden="true" />
      <span>{tekst}</span>
    </div>
  );
}

function FoutBericht({ fout, onOpnieuw }: { fout: string; onOpnieuw: () => void }) {
  return (
    <div className="callout err md-fout" role="alert">
      <WarningIcon size={20} />
      <div className="md-fout-tekst">
        <p>{fout}</p>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onOpnieuw}><RetryIcon size={16} /> Opnieuw proberen</button>
      </div>
    </div>
  );
}

// ── De pagina ───────────────────────────────────────────────────────────────

export function MinimumdoelenPage() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const index = useLaadstand('index', laadIndex);

  const [zoek, setZoek] = useState('');
  // null = de standaard: "Geldig", maar alleen als de index een geldigheid kent.
  const [geldigheidKeuze, setGeldigheidKeuze] = useState<Geldigheid | null>(null);
  const [graad, setGraad] = useState('');
  const [soort, setSoort] = useState<SoortOnderwijs | 'alle'>('alle');
  const [zichtbaar, setZichtbaar] = useState(STAP);

  const zoekRef = useRef<HTMLInputElement>(null);
  const paneelRef = useRef<HTMLElement>(null);

  const sets = useMemo<MinimumdoelenIndexSet[]>(() => (index.stand.status === 'klaar' ? index.stand.waarde.sets : []), [index.stand]);
  const heeftGeldigheid = useMemo(() => indexHeeftGeldigheid(sets), [sets]);
  const geldigheid: Geldigheid = heeftGeldigheid ? (geldigheidKeuze ?? 'G') : 'alle';
  const graden = useMemo(() => graadOpties(sets), [sets]);
  const soorten = useMemo(() => {
    const aanwezig = new Set(sets.map((s) => soortVanSet(s.naam)));
    return SOORT_VOLGORDE.filter((s) => aanwezig.has(s));
  }, [sets]);
  const gefilterd = useMemo(() => filterSets(sets, { zoek, geldigheid, graad, soort }), [sets, zoek, geldigheid, graad, soort]);
  const laatstOpgehaald = useMemo(() => sets.reduce((m, s) => (s.opgehaald > m ? s.opgehaald : m), ''), [sets]);
  const gekozen = setId ? sets.find((s) => s.id === setId) : undefined;

  // Een andere set op een smal scherm: de set staat boven de lijst, dus daarheen springen.
  const vorigeSet = useRef(setId);
  useEffect(() => {
    if (vorigeSet.current === setId) return;
    vorigeSet.current = setId;
    if (setId && typeof window.matchMedia === 'function' && window.matchMedia(SMAL_SCHERM).matches) {
      window.scrollTo(0, 0);
      paneelRef.current?.focus({ preventScroll: true });
    }
  }, [setId]);

  const naarLijst = () => {
    zoekRef.current?.focus();
  };

  const kies = (id: string) => navigate(`${BASIS_ROUTE}/${id}`);
  // Elke wijziging van een filter begint weer bij de eerste sets.
  const zetZoek = (v: string) => { setZoek(v); setZichtbaar(STAP); };
  const zetGeldigheid = (v: Geldigheid) => { setGeldigheidKeuze(v); setZichtbaar(STAP); };
  const zetGraad = (v: string) => { setGraad(v); setZichtbaar(STAP); };
  const zetSoort = (v: SoortOnderwijs | 'alle') => { setSoort(v); setZichtbaar(STAP); };
  const wisFilters = () => {
    setZoek('');
    setGeldigheidKeuze('alle');
    setGraad('');
    setSoort('alle');
    setZichtbaar(STAP);
  };

  return (
    <div className="page mat-page md-page">
      <Link to="/leerplannen" className="btn btn-sm btn-quiet md-terug"><BackIcon size={16} /> Leerplannen</Link>
      <div className="page-head">
        <div className="md-intro">
          <h1>Officiële minimumdoelen</h1>
          <p className="sub">
            Minimumdoelen zijn de wettelijke basis van de Vlaamse overheid: voor elk net dezelfde. Hier staan ze
            letterlijk zoals ze in de officiële bron staan. Kies een set en gebruik ze als leerplan.
          </p>
          {index.stand.status === 'klaar' && (
            <p className="md-bron">
              {index.stand.waarde.naamsvermelding}
              {laatstOpgehaald && <> · opgehaald op {datumLeesbaar(laatstOpgehaald)}</>}
            </p>
          )}
        </div>
      </div>

      <div className={`md-layout${setId ? ' heeft-set' : ''}`}>
        <div className="md-lijstkolom">
          {index.stand.status === 'laden' && <LaadBericht tekst="De sets worden geladen…" />}
          {index.stand.status === 'fout' && <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />}
          {index.stand.status === 'klaar' && (
            <>
              <div className="md-filters">
                <Field label="Zoek een set" hint="Op naam, korte naam of nummer (bv. ODS_3287)">
                  <input
                    ref={zoekRef} type="search" className="input" value={zoek} placeholder="bv. aardrijkskunde"
                    autoComplete="off" spellCheck={false}
                    onChange={(e) => zetZoek(e.target.value)}
                  />
                </Field>
                {heeftGeldigheid && (
                  <fieldset className="md-groep">
                    <legend>Geldigheid</legend>
                    <div className="md-chips">
                      {GELDIGHEID_KNOPPEN.map((k) => (
                        <button
                          key={k.id} type="button" className="md-chip" aria-pressed={geldigheid === k.id}
                          onClick={() => zetGeldigheid(k.id)}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="md-selecten">
                  <Field label="Graad">
                    <select className="select" value={graad} onChange={(e) => zetGraad(e.target.value)}>
                      <option value="">Alle graden</option>
                      {graden.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Soort onderwijs">
                    <select
                      className="select" value={soort}
                      onChange={(e) => zetSoort(e.target.value as SoortOnderwijs | 'alle')}
                    >
                      <option value="alle">Alle soorten</option>
                      {soorten.map((s) => <option key={s} value={s}>{SOORT_LABEL[s]}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <p className="md-aantal" aria-live="polite" aria-atomic="true">
                {gefilterd.length === 0 ? 'Geen sets gevonden' : `${gefilterd.length} ${gefilterd.length === 1 ? 'set' : 'sets'} gevonden`}
              </p>

              {gefilterd.length === 0 ? (
                <div className="md-leeg">
                  <p><strong>Geen sets die hierbij passen.</strong></p>
                  <p>Probeer een kortere zoekterm, een andere graad of soort, of toon ook de sets die niet meer geldig of onbekend zijn.</p>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={wisFilters}>Toon alle sets</button>
                </div>
              ) : (
                <>
                  <ul className="md-sets" aria-label="Sets minimumdoelen">
                    {gefilterd.slice(0, zichtbaar).map((s) => <SetKnop key={s.id} set={s} gekozen={s.id === setId} onKies={kies} />)}
                  </ul>
                  {gefilterd.length > zichtbaar && (
                    <div className="md-meer">
                      <button type="button" className="btn btn-ghost" onClick={() => setZichtbaar((z) => z + STAP)}>
                        Toon meer sets ({zichtbaar} van {gefilterd.length})
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="md-setkolom">
          {setId ? (
            <SetPaneel key={setId} setId={setId} indexSet={gekozen} paneelRef={paneelRef} onNaarLijst={naarLijst} />
          ) : (
            <div className="card md-placeholder">
              <h2>Kies een set</h2>
              <p>Kies links een set om de doelen te lezen. Daarna kan je ze met één klik als leerplan bewaren.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Eén set in de lijst ─────────────────────────────────────────────────────

function SetKnop({ set, gekozen, onKies }: { set: MinimumdoelenIndexSet; gekozen: boolean; onKies: (id: string) => void }) {
  const soort = soortVanSet(set.naam);
  const kenmerken = [soort === 'so' ? '' : SOORT_LABEL[soort], set.graad, set.stroom, contextVanSet(set.naam)].filter(Boolean).join(' · ');
  const geldig = geldigheidTekst(set);
  const doelen = typeof set.aantal === 'number' ? `${set.aantal} ${set.aantal === 1 ? 'doel' : 'doelen'}` : '';
  return (
    <li>
      <button type="button" className="md-set" aria-current={gekozen ? 'true' : undefined} onClick={() => onKies(set.id)}>
        <span className="md-set-naam">{set.korteNaam || set.naam}</span>
        {kenmerken && <span className="md-set-meta">{kenmerken}</span>}
        {(geldig || doelen) && (
          <span className="md-set-meta">
            {geldig && <span className="md-set-geldig">{geldig}</span>}
            {geldig && doelen && ' · '}
            {doelen}
          </span>
        )}
      </button>
    </li>
  );
}

// ── De gekozen set ──────────────────────────────────────────────────────────

function maakRijen(bestand: MinimumdoelenSetBestand): DoelRij[] {
  return bestand.doelen.map((doel, i) => {
    const attitude = isAttitude(doel);
    const optioneel = isOptioneel(doel);
    return {
      key: doel.id ?? `${doel.code}#${i}`,
      code: doel.code,
      tekst: htmlNaarTekst(doel.tekst),
      rubriek: themaVanDoel(doel),
      labels: attitude || optioneel ? (
        <>
          {attitude && <span className="badge">Attitude</span>}
          {optioneel && <span className="badge badge-warn">Optioneel</span>}
        </>
      ) : undefined,
    };
  });
}

function aantalDoelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

function SetPaneel({
  setId, indexSet, paneelRef, onNaarLijst,
}: {
  setId: string;
  /** De regel uit de index, als die al geladen is: dan staat de naam er meteen. */
  indexSet?: MinimumdoelenIndexSet;
  paneelRef: RefObject<HTMLElement>;
  onNaarLijst: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { stand, opnieuw } = useLaadstand(setId, () => laadSet(setId));
  const bestand = stand.status === 'klaar' ? stand.waarde : undefined;
  const rijen = useMemo(() => (bestand ? maakRijen(bestand) : []), [bestand]);

  const kop = bestand?.set ?? indexSet;
  // Een set zonder geldigheid in de kop (oudere bestanden): afleiden uit de doelen zelf.
  const geldigheid = bestand ? (bestand.set.geldigheid !== undefined ? bestand.set : geldigheidVanDoelen(bestand.doelen)) : indexSet;
  const bronLink = veiligeLink(bestand?.set.bron);

  const feiten: { naam: string; waarde: string }[] = [];
  if (kop) {
    feiten.push({ naam: 'Soort onderwijs', waarde: SOORT_LABEL[soortVanSet(kop.naam)] });
    if (kop.graad) feiten.push({ naam: 'Graad', waarde: kop.graad });
    if (kop.stroom) feiten.push({ naam: 'Stroom', waarde: kop.stroom });
    if (kop.leerjaar) feiten.push({ naam: 'Leerjaar', waarde: kop.leerjaar });
    if (kop.versie) feiten.push({ naam: 'Versie', waarde: kop.versie });
    const g = geldigheid ? geldigheidTekst(geldigheid) : undefined;
    if (g) feiten.push({ naam: 'Geldigheid', waarde: g });
    if (typeof kop.aantal === 'number') feiten.push({ naam: 'Aantal doelen', waarde: String(kop.aantal) });
    feiten.push({ naam: 'Nummer van de set', waarde: kop.id });
  }

  const gebruik = (b: MinimumdoelenSetBestand) => {
    const bestaand = vindLeerplanVoorSet(getCurricula(), b);
    if (bestaand) {
      toast(`Je had dit leerplan al bewaard: ${bestaand.title}`, 'info');
      navigate(`/leerplannen?open=${encodeURIComponent(bestaand.id)}`);
      return;
    }
    const { leerplan, waarschuwingen } = leerplanUitSet(b);
    if (leerplan.goals.length === 0) {
      toast('Deze set bevat geen doelen die je kan overnemen.', 'err');
      return;
    }
    // Mislukt het bewaren (opslag vol), dan meldt de opslaglaag dat zelf: dan blijven we hier.
    if (!saveCurriculum(leerplan)) return;
    const extra = waarschuwingen.length > 0 ? ` ${waarschuwingen.join(' ')}` : '';
    const status = controleStatus(leerplan) === 'gecontroleerd' ? 'nagekeken' : 'nog niet nagekeken';
    toast(`Leerplan bewaard: ${leerplan.title} (${aantalDoelen(leerplan.goals.length)}, ${status}).${extra}`, 'ok');
    navigate(`/leerplannen?open=${encodeURIComponent(leerplan.id)}`);
  };

  return (
    <section className="card md-setpaneel" aria-labelledby="md-set-kop" tabIndex={-1} ref={paneelRef}>
      <div className="md-kop">
        <h2 id="md-set-kop">{kop?.naam ?? `Set ${setId}`}</h2>
        {stand.status === 'klaar' && <p className="sr-only" role="status">Set geladen: {aantalDoelen(stand.waarde.doelen.length)}.</p>}
      </div>
      {feiten.length > 0 && (
        <dl className="md-feiten">
          {feiten.map((f) => (
            <div key={f.naam}>
              <dt>{f.naam}</dt>
              <dd>{f.waarde}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="md-acties">
        <button type="button" className="btn btn-primary" disabled={!bestand} onClick={() => bestand && gebruik(bestand)}>
          <ListTree size={18} /> Gebruik als leerplan
        </button>
        {bronLink && (
          <a className="btn btn-ghost" href={bronLink} target="_blank" rel="noopener noreferrer">
            Bekijk op onderwijsdoelen.be <ExternalLink size={16} />
            <span className="sr-only"> (opent in een nieuw tabblad)</span>
          </a>
        )}
        <button type="button" className="btn btn-ghost md-naarlijst" onClick={onNaarLijst}>
          <ArrowDown size={16} /> Naar de lijst met sets
        </button>
      </div>
      <p className="md-uitleg">
        <InfoIcon size={16} className="icon-inline" /> Je krijgt een leerplan dat al nagekeken is: de doelen staan letterlijk zoals in de officiële bron.
      </p>

      {stand.status === 'laden' && <LaadBericht tekst="De doelen worden geladen…" />}
      {stand.status === 'fout' && <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />}
      {bestand && (
        <>
          <h2 className="md-doelen-kop">Doelen ({bestand.doelen.length})</h2>
          <DoelenPerRubriek rijen={rijen} />
          <p className="md-voet">
            {bestand.set.naamsvermelding}
            {bestand.set.opgehaald && <> · opgehaald op {datumLeesbaar(bestand.set.opgehaald)}</>}
          </p>
          <button type="button" className="btn btn-ghost md-naarlijst" onClick={onNaarLijst}>
            <ArrowDown size={16} /> Naar de lijst met sets
          </button>
        </>
      )}
    </section>
  );
}
