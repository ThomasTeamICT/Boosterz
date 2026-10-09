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
import { ArrowDown, ExternalLink, ListChecks, ListTree, LoaderCircle } from 'lucide-react';
import { controleStatus, getCurricula, saveCurriculum } from '../lib/curriculum';
import { geldigheidVanDoelen, htmlNaarTekst, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from '../lib/minimumdoelen';
import {
  FOUT_NIET_GELADEN, SOORT_LABEL, contextVanSet, datumLeesbaar, doelPastBijZoek, filterSets, geldigheidTekst, geldigheidVan, graadOpties,
  indexHeeftGeldigheid, isGeldigSetId, isStemSet, laadIndex, laadSet, opvolgersVan, oudeVersieIds, soortVanSet, vakSetsBijStem, veiligeLink,
  zoekTermen, zoekVoorbeelden, type SoortOnderwijs,
} from '../lib/minimumdoelenBron';
import { geldigheidJaren } from '../lib/setKeuze';
import { isAttitude, isOptioneel, leerplanUitSet, themaVanDoel, vindLeerplanVoorSet } from '../lib/minimumdoelenLeerplan';
import { DoelenPerRubriek, type DoelRij } from '../components/curriculum/DoelenPerRubriek';
import { Field, useToast } from '../components/ui';
import { BackIcon, InfoIcon, RetryIcon, WarningIcon } from '../components/icons';
import '../styles/minimumdoelen.css';

const BASIS_ROUTE = '/leerplannen/minimumdoelen';
/** Het scherm om een eigen doelenlijst samen te stellen; `?sets=<id>` kiest er al een set. */
const SAMENSTELLEN_ROUTE = '/leerplannen/samenstellen';
/** Zoveel sets staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
const STAP = 60;
const SMAL_SCHERM = '(max-width: 899px)';

const SOORT_VOLGORDE: SoortOnderwijs[] = ['so', 'buso', 'vwo', 'ander'];
/** Vanaf zoveel doelen staat er een zoekveld boven de doelen van een set. */
const ZOEK_IN_DOELEN_VANAF = 10;
/** Een set met geldigheid "Onbekend" naast een geldige set met dezelfde naam. */
const OUDERE_VERSIE = 'Oudere versie';

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
  // Standaard geen oude versies (lib/minimumdoelenBron.ts, `oudeVersieIds`); die komen er op vraag bij.
  const [toonOud, setToonOud] = useState(false);
  const [graad, setGraad] = useState('');
  const [soort, setSoort] = useState<SoortOnderwijs | 'alle'>('alle');
  const [zichtbaar, setZichtbaar] = useState(STAP);

  const zoekRef = useRef<HTMLInputElement>(null);
  const paneelRef = useRef<HTMLElement>(null);

  const sets = useMemo<MinimumdoelenIndexSet[]>(() => (index.stand.status === 'klaar' ? index.stand.waarde.sets : []), [index.stand]);
  const heeftGeldigheid = useMemo(() => indexHeeftGeldigheid(sets), [sets]);
  const geldigheid = heeftGeldigheid && !toonOud ? 'actueel' : 'alle';
  const graden = useMemo(() => graadOpties(sets), [sets]);
  const soorten = useMemo(() => {
    const aanwezig = new Set(sets.map((s) => soortVanSet(s.naam)));
    return SOORT_VOLGORDE.filter((s) => aanwezig.has(s));
  }, [sets]);
  const gefilterd = useMemo(() => filterSets(sets, { zoek, geldigheid, graad, soort }), [sets, zoek, geldigheid, graad, soort]);
  // Hoeveel oude versies er bij deze filters verborgen zijn: dat zeggen we bij het vinkje.
  const verborgenOud = useMemo(
    () => (geldigheid === 'actueel' ? filterSets(sets, { zoek, geldigheid: 'alle', graad, soort }).length - gefilterd.length : 0),
    [sets, zoek, geldigheid, graad, soort, gefilterd.length],
  );
  const laatstOpgehaald = useMemo(() => sets.reduce((m, s) => (s.opgehaald > m ? s.opgehaald : m), ''), [sets]);
  const gekozen = setId ? sets.find((s) => s.id === setId) : undefined;
  const oud = useMemo(() => oudeVersieIds(sets), [sets]);

  // Een andere set gekozen: de focus gaat naar de set (ook op een breed scherm, anders blijft het toetsenbord in de
  // lijst staan en moet je er eerst doorheen tabben). Op een smal scherm staat de set boven de lijst: dan ook omhoog.
  const vorigeSet = useRef(setId);
  useEffect(() => {
    if (vorigeSet.current === setId) return;
    vorigeSet.current = setId;
    if (!setId) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia(SMAL_SCHERM).matches) window.scrollTo(0, 0);
    paneelRef.current?.focus({ preventScroll: true });
  }, [setId]);

  const naarLijst = () => {
    zoekRef.current?.focus();
  };

  const kies = (id: string) => navigate(`${BASIS_ROUTE}/${id}`);
  // Vanuit de waarschuwing bij een oude set: de sets die nu gelden voor dezelfde graad en soort.
  const toonActueel = (set: MinimumdoelenIndexSet) => {
    setZoek('');
    setToonOud(false);
    setGraad(set.graad ?? '');
    setSoort(soortVanSet(set.naam));
    setZichtbaar(STAP);
    zoekRef.current?.focus();
  };
  // Elke wijziging van een filter begint weer bij de eerste sets.
  const zetZoek = (v: string) => { setZoek(v); setZichtbaar(STAP); };
  const zetToonOud = (v: boolean) => { setToonOud(v); setZichtbaar(STAP); };
  const zetGraad = (v: string) => { setGraad(v); setZichtbaar(STAP); };
  const zetSoort = (v: SoortOnderwijs | 'alle') => { setSoort(v); setZichtbaar(STAP); };
  const wisFilters = () => {
    setZoek('');
    setToonOud(true);
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
          <p className="md-toelichting">De minimumdoelen zijn verdeeld in sets: per vak of sleutelcompetentie, per graad en per stroom.</p>
          <p className="md-toelichting">
            Geef je les in een bepaalde studierichting? Bekijk welke doelen erbij horen bij{' '}
            <Link to="/cursussen/richtingen">Doelen per studierichting</Link>.
          </p>
          <p className="md-toelichting">
            Voorlopig staan hier alleen de minimumdoelen van het secundair onderwijs (ook buitengewoon secundair) en van het
            volwassenenonderwijs, niet die van het basisonderwijs.
          </p>
          <p className="md-toelichting">
            Wil je doelen uit meerdere sets, of maar een deel van een set? <Link to={SAMENSTELLEN_ROUTE}>Stel je eigen doelenlijst samen</Link>.
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
                <Field label="Zoek een set" hint="Op naam, korte naam of nummer (bv. ODS_3287). Een vak als aardrijkskunde vindt ook ‘Ruimtelijk bewustzijn’.">
                  <input
                    ref={zoekRef} type="search" className="input" value={zoek} placeholder="bv. aardrijkskunde"
                    autoComplete="off" spellCheck={false}
                    onChange={(e) => zetZoek(e.target.value)}
                  />
                </Field>
                {heeftGeldigheid && (
                  <div className="md-oud">
                    <label className="md-oud-label">
                      <input type="checkbox" checked={toonOud} onChange={(e) => zetToonOud(e.target.checked)} />
                      <span>Toon ook oude versies die niet meer gelden</span>
                    </label>
                    <p className="md-oud-hint">
                      {toonOud
                        ? 'Oude versies staan in de lijst met “Niet meer geldig” of “Oudere versie”. Je hebt ze alleen nodig voor oudere leerplannen of cursussen.'
                        : verborgenOud > 0
                          ? `${verborgenOud} oude ${verborgenOud === 1 ? 'versie' : 'versies'} verborgen. Je hebt ze alleen nodig voor oudere leerplannen of cursussen.`
                          : 'Alleen sets die nu gelden.'}
                    </p>
                  </div>
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
                  <p>Probeer een kortere zoekterm, een andere graad of soort, of toon ook de oude versies.</p>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={wisFilters}>Toon alle sets</button>
                </div>
              ) : (
                <>
                  <ul className="md-sets" aria-label="Sets minimumdoelen">
                    {gefilterd.slice(0, zichtbaar).map((s) => <SetKnop key={s.id} set={s} oud={oud.has(s.id)} gekozen={s.id === setId} onKies={kies} />)}
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
          {setId && (!isGeldigSetId(setId) || (index.stand.status === 'klaar' && !gekozen)) ? (
            // Een nummer dat geen set kan zijn, of dat niet in de lijst staat: niets ophalen en niet "Opnieuw proberen" aanbieden.
            <SetNietGevonden paneelRef={paneelRef} onNaarLijst={naarLijst} />
          ) : setId && index.stand.status === 'laden' ? (
            // Eerst de lijst: pas dan weten we of de set bestaat.
            <section className="card md-setpaneel" aria-label="Set" tabIndex={-1} ref={paneelRef}>
              <LaadBericht tekst="De set wordt geladen…" />
            </section>
          ) : setId ? (
            <SetPaneel
              key={setId} setId={setId} indexSet={gekozen} alleSets={sets} paneelRef={paneelRef} onNaarLijst={naarLijst}
              onToonActueel={toonActueel}
            />
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

function SetKnop({ set, oud, gekozen, onKies }: { set: MinimumdoelenIndexSet; oud: boolean; gekozen: boolean; onKies: (id: string) => void }) {
  const soort = soortVanSet(set.naam);
  const kenmerken = [soort === 'so' ? '' : SOORT_LABEL[soort], set.graad, set.stroom, contextVanSet(set.naam)].filter(Boolean).join(' · ');
  const geldig = oud && geldigheidVan(set) === 'O' ? OUDERE_VERSIE : geldigheidTekst(set);
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

// ── Een set die niet bestaat ────────────────────────────────────────────────

function SetNietGevonden({ paneelRef, onNaarLijst }: { paneelRef: RefObject<HTMLElement>; onNaarLijst: () => void }) {
  return (
    <section className="card md-setpaneel" aria-labelledby="md-set-kop" tabIndex={-1} ref={paneelRef}>
      <h2 id="md-set-kop">Set niet gevonden</h2>
      <p>Deze set bestaat niet. Kies een set uit de lijst.</p>
      <button type="button" className="btn btn-ghost md-naarlijst" onClick={onNaarLijst}>
        <ArrowDown size={16} /> Naar de lijst met sets
      </button>
    </section>
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
  setId, indexSet, alleSets, paneelRef, onNaarLijst, onToonActueel,
}: {
  setId: string;
  /** De regel uit de index, als die al geladen is: dan staat de naam er meteen. */
  indexSet?: MinimumdoelenIndexSet;
  /** Alle sets van de index: om bij een oude set de opvolger aan te wijzen. */
  alleSets: readonly MinimumdoelenIndexSet[];
  paneelRef: RefObject<HTMLElement>;
  onNaarLijst: () => void;
  onToonActueel: (set: MinimumdoelenIndexSet) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { stand, opnieuw } = useLaadstand(setId, () => laadSet(setId));
  const bestand = stand.status === 'klaar' ? stand.waarde : undefined;
  const rijen = useMemo(() => (bestand ? maakRijen(bestand) : []), [bestand]);
  // Zoeken in de doelen: alleen wat je ziet, "Gebruik als leerplan" neemt altijd de hele set.
  const [zoekDoel, setZoekDoel] = useState('');
  const zoekDoelRef = useRef<HTMLInputElement>(null);
  const termen = useMemo(() => zoekTermen(zoekDoel), [zoekDoel]);
  const getoondeRijen = useMemo(() => rijen.filter((r) => doelPastBijZoek(r, termen)), [rijen, termen]);
  const kanZoeken = rijen.length >= ZOEK_IN_DOELEN_VANAF;

  const kop = bestand?.set ?? indexSet;
  // Een set zonder geldigheid in de kop (oudere bestanden): afleiden uit de doelen zelf.
  const geldigheid = bestand ? (bestand.set.geldigheid !== undefined ? bestand.set : geldigheidVanDoelen(bestand.doelen)) : indexSet;
  const bronLink = veiligeLink(bestand?.set.bron);
  // Een set die niet meer geldt of een oudere versie is, mag je nog gebruiken, maar de leerkracht moet het weten.
  const code = geldigheid !== undefined ? geldigheidVan(geldigheid) : undefined;
  const oudereVersie = code === 'O' && indexSet !== undefined && oudeVersieIds(alleSets).has(indexSet.id);
  const verouderd = code === 'N' || oudereVersie;
  const jaren = geldigheid ? geldigheidJaren(geldigheid) : undefined;
  const opvolgers = useMemo(() => (verouderd && indexSet ? opvolgersVan(indexSet, alleSets) : undefined), [verouderd, indexSet, alleSets]);
  // Een STEM-set bundelt wiskunde, natuurwetenschappen en techniek: dat zeggen we, met hulp om de eigen doelen te vinden.
  const stem = !verouderd && kop !== undefined && isStemSet(kop);
  const vakSets = useMemo(() => (stem && indexSet ? vakSetsBijStem(indexSet, alleSets) : []), [stem, indexSet, alleSets]);
  const voorbeelden = useMemo(() => (stem ? zoekVoorbeelden(rijen) : []), [stem, rijen]);
  const zoekOp = (woord: string) => {
    setZoekDoel(woord);
    zoekDoelRef.current?.focus();
  };

  const feiten: { naam: string; waarde: string }[] = [];
  if (kop) {
    feiten.push({ naam: 'Soort onderwijs', waarde: SOORT_LABEL[soortVanSet(kop.naam)] });
    if (kop.graad) feiten.push({ naam: 'Graad', waarde: kop.graad });
    if (kop.stroom) feiten.push({ naam: 'Stroom', waarde: kop.stroom });
    if (kop.leerjaar) feiten.push({ naam: 'Leerjaar', waarde: kop.leerjaar });
    if (kop.versie) feiten.push({ naam: 'Versie', waarde: kop.versie });
    const g = oudereVersie ? `${OUDERE_VERSIE} (de bron vermeldt geen geldigheid)` : geldigheid ? geldigheidTekst(geldigheid) : undefined;
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
    const { leerplan, waarschuwingen } = leerplanUitSet(b, { oudereVersie });
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

      {verouderd && (
        <div className="callout warn md-verouderd" role="note">
          <WarningIcon size={20} className="md-verouderd-icoon" />
          <div className="md-verouderd-tekst">
            {oudereVersie && opvolgers?.soort === 'versie' ? (
              <p>Dit is een oudere versie van deze set. Er is een nieuwere versie die nu geldt: gebruik die.</p>
            ) : oudereVersie ? (
              <p>Dit is een oudere versie van deze set. Kies liever een set die nu geldt.</p>
            ) : opvolgers?.soort === 'versie' ? (
              <p>
                Deze versie geldt niet meer{jaren ? ` (${jaren})` : ''}. Er is een nieuwere versie van deze set: gebruik die.
              </p>
            ) : opvolgers?.soort === 'vak' ? (
              <p>
                Deze minimumdoelen gelden niet meer{jaren ? ` (${jaren})` : ''}. Sinds 2019 zijn de eindtermen niet meer per vak
                geordend, maar per sleutelcompetentie. De doelen van nu voor {kop?.korteNaam ? <strong>{kop.korteNaam.toLowerCase()}</strong> : 'dit vak'}
                {' '}staan in:
              </p>
            ) : (
              <p>
                Deze minimumdoelen gelden niet meer{jaren ? ` (${jaren})` : ''}. Kies liever een set die nu geldt
                {indexSet?.graad ? ` voor de ${indexSet.graad}${indexSet.stroom ? ` ${indexSet.stroom}` : ''}` : ''}.
              </p>
            )}
            {opvolgers && opvolgers.sets.length > 0 ? (
              <ul className="md-opvolgers">
                {opvolgers.sets.map((o, i) => (
                  <li key={o.id}>
                    {/* De grootste set eerst en opvallend; een tweede set met dezelfde naam (bv. basisgeletterdheid) krijgt zijn eigen kenmerk erbij. */}
                    <Link to={`${BASIS_ROUTE}/${o.id}`} className={`btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-ghost'}`}>
                      Open ‘{o.korteNaam || o.naam}’
                      {opvolgers.sets.some((x) => x.id !== o.id && (x.korteNaam || x.naam) === (o.korteNaam || o.naam)) && contextVanSet(o.naam)
                        ? ` · ${contextVanSet(o.naam)}`
                        : ''}
                    </Link>
                    <span className="md-opvolger-info">
                      {[o.graad, o.stroom, contextVanSet(o.naam), `${o.aantal} doelen`, geldigheidTekst(o)].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : indexSet ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onToonActueel(indexSet)}>
                Toon de sets die nu gelden{indexSet.graad ? ` voor de ${indexSet.graad}` : ''}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {stem && (
        <div className="callout md-stem" role="note">
          <InfoIcon size={20} className="md-stem-icoon" />
          <div className="md-stem-tekst">
            <p>
              <strong>Wiskunde, natuurwetenschappen en techniek zitten samen in deze set.</strong> De officiële bron zegt niet
              welk doel bij welk vak hoort: dat staat in het leerplan van je net. Baseer een cursus dus op dat leerplan; deze
              minimumdoelen zijn de ondergrens die de overheid vastlegt.
            </p>
            <p>
              Wil je alleen de doelen van je vak? <Link to={`${SAMENSTELLEN_ROUTE}?sets=${setId}&leeg=1`}>Kies ze uit deze set</Link>.
            </p>
            {kanZoeken && (
              <div className="md-stem-zoek">
                <span>Zoek de doelen van je vak met een woord{voorbeelden.length > 0 ? ', bv.' : '.'}</span>
                {voorbeelden.map((w) => (
                  <button key={w} type="button" className="btn btn-sm btn-ghost" onClick={() => zoekOp(w)}>{w}</button>
                ))}
              </div>
            )}
            {vakSets.length > 0 && (
              <>
                <p>Voor sommige studierichtingen zijn er in de {kop?.graad ?? 'deze graad'} ook aparte sets per vak:</p>
                <ul className="md-opvolgers">
                  {vakSets.map((o) => (
                    <li key={o.id}>
                      <Link to={`${BASIS_ROUTE}/${o.id}`} className="btn btn-sm btn-ghost">Open ‘{o.korteNaam || o.naam}’</Link>
                      <span className="md-opvolger-info">{[contextVanSet(o.naam), aantalDoelen(o.aantal)].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <div className="md-acties">
        <button type="button" className="btn btn-primary" disabled={!bestand} onClick={() => bestand && gebruik(bestand)}>
          <ListTree size={18} /> {verouderd ? 'Toch als leerplan gebruiken' : 'Gebruik als leerplan'}
        </button>
        <Link className="btn btn-ghost" to={`${SAMENSTELLEN_ROUTE}?sets=${setId}`}>
          <ListChecks size={18} /> Kies doelen uit deze set
        </Link>
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
          {kanZoeken && (
            <div className="md-doelzoek">
              <Field label="Zoek in de doelen" hint="Op een woord of een code. ‘Gebruik als leerplan’ neemt altijd de hele set.">
                <input
                  ref={zoekDoelRef} type="search" className="input" value={zoekDoel}
                  placeholder={voorbeelden[0] ? `bv. ${voorbeelden[0]}` : 'bv. een woord of een code'}
                  autoComplete="off" spellCheck={false}
                  onChange={(e) => setZoekDoel(e.target.value)}
                />
              </Field>
              <p className="md-doelzoek-aantal" aria-live="polite" aria-atomic="true">
                {termen.length > 0 ? `${getoondeRijen.length} van ${aantalDoelen(rijen.length)}` : ''}
              </p>
            </div>
          )}
          {getoondeRijen.length === 0 && termen.length > 0 ? (
            <div className="md-leeg">
              <p><strong>Geen doelen met ‘{zoekDoel.trim()}’.</strong> Probeer een ander of korter woord.</p>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => zoekOp('')}>Toon alle doelen</button>
            </div>
          ) : (
            <DoelenPerRubriek rijen={getoondeRijen} />
          )}
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
