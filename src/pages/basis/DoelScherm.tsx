// #/basis/doel/:setId/:doelId: de vaste plek van een doel. Het adres is precies een MinimumdoelRef {set, id}, dus
// andere delen van de app (en latere fasen) kunnen er altijd naar linken.
//
// Bovenaan de doelkaart met de volledige tekst; eronder de delen uit DOEL_DELEN, in vaste volgorde. Een latere fase
// (materiaal, lesplannen, bewijs per doel) voegt een regel aan DOEL_DELEN toe en hoeft niets te herbouwen. Een deel
// zonder inhoud rendert null (en dus ook zijn kop niet).
//
// Soort doel en tweeling horen bij het paar (doel, set): doel 92767 is 'te bereiken op populatieniveau' in ODS_3408 en
// 'na te streven' in ODS_3469. De tweeling is de set van de andere soort onderwijs met hetzelfde vak en eindmoment;
// bij twee kandidaten worden beide geladen en telt de set die het doel bevat. De pagina zegt alleen 'dezelfde tekst'
// als de tekst echt gelijk is.

import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MOMENT_KORT, DoelRij } from '../../components/basis/DoelRij';
import { VolledigeDoeltekst } from '../../components/basis/DoelKaart';
import { WanneerGelden } from '../../components/basis/WanneerGelden';
import { useBasisIndex } from '../../components/basis/useBasisSets';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { useSetBestanden } from '../../components/curriculum/samenstellen/useSetBestanden';
import { basisPad, doelPad } from '../../lib/basis/basisRoutes';
import { EINDMOMENTEN, doelenVanSet, samenvoegen, setsVanVak, zelfdeRubriek, type DoelBasis } from '../../lib/basis/doelBasis';
import { INVOERINGSKALENDER, type Eindmoment, type Schooljaar } from '../../lib/basis/kalender';
import { basisSet, tweelingSets, type BasisSet } from '../../lib/basis/moment';
import { SOORT_DOELEN_LABEL } from '../../lib/basis/momentTeksten';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { huidigSchooljaar } from './VakScherm';
import '../../styles/basis-doelen.css';

/** De doelen van het vak van het doel op alle momenten, en hoe ver het laden is. */
export interface VakDoelen {
  doelen: readonly DoelBasis[];
  /** De momenten waarop het vak een nieuwe set heeft. */
  momenten: ReadonlySet<Eindmoment>;
  klaar: boolean;
  fouten: readonly { id: string; fout: string }[];
  opnieuw: (id: string) => void;
}

export interface DoelDeelProps {
  doel: DoelBasis;
  info: BasisSet;
  alle: readonly MinimumdoelenIndexSet[];
  schooljaar: Schooljaar;
  vak: VakDoelen;
}

function Wanneer({ info, alle, schooljaar }: DoelDeelProps): ReactNode {
  return <WanneerGelden set={info} alleSets={alle} schooljaar={schooljaar} kopId="b-wanneer-kop" kopNiveau={2} toonTweeling={false} />;
}

const LEERLIJN_KOP = 'De leerlijn in deze rubriek';

function Leerlijn({ doel, vak }: DoelDeelProps): ReactNode {
  if (vak.fouten.length > 0) {
    return (
      <section className="b-doeldeel" aria-labelledby="b-leerlijn-kop">
        <h2 id="b-leerlijn-kop">{LEERLIJN_KOP}</h2>
        {vak.fouten.map((f) => (
          <FoutBericht key={f.id} fout={f.fout} naam={f.id} onOpnieuw={() => vak.opnieuw(f.id)} />
        ))}
      </section>
    );
  }
  if (!vak.klaar) {
    return (
      <section className="b-doeldeel" aria-labelledby="b-leerlijn-kop">
        <h2 id="b-leerlijn-kop">{LEERLIJN_KOP}</h2>
        <LaadBericht tekst="De doelen van dit vak worden geladen" />
      </section>
    );
  }
  const { niveau, per } = zelfdeRubriek(doel, vak.doelen);
  if (EINDMOMENTEN.every((m) => per[m].length === 0)) return null;
  return (
    <section className="b-doeldeel" aria-labelledby="b-leerlijn-kop">
      <h2 id="b-leerlijn-kop">{LEERLIJN_KOP}</h2>
      <p className="b-noot">
        {niveau === 'subthema'
          ? `Het onderwerp ${doel.onderwerpNr} ${doel.onderwerp}, subthema ${doel.subthema}, op de drie momenten.`
          : `Het hele onderwerp ${doel.onderwerpNr} ${doel.onderwerp} op de drie momenten.`}{' '}
        De codes lopen niet door, en de bron zegt niet welk doel uit welk ander volgt.
      </p>
      <div className="b-leerlijnkolommen">
        {EINDMOMENTEN.map((m) => (
          <div key={m} className="b-leerlijnkolom">
            <h3>
              {MOMENT_KORT[m]} <span className="b-onderwerp-aantal">({per[m].length})</span>
            </h3>
            {per[m].length > 0 ? (
              <ul className="b-doelrijen">
                {per[m].map((d) => (
                  <li key={`${d.setId}-${d.id}`}>
                    <DoelRij doel={d} dit={d.setId === doel.setId && d.id === doel.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="b-noot">{vak.momenten.has(m) ? 'Op dit moment niet apart vermeld' : 'Geen doelen voor dit moment'}</p>
            )}
          </div>
        ))}
      </div>
      <p>
        <Link to={basisPad({ s: 'leerlijn', soort: doel.soort, vak: doel.vak, onderwerp: doel.onderwerpNr })} className="b-lees-meer">
          Bekijk de leerlijn van dit vak
        </Link>
      </p>
    </section>
  );
}

// Het leerplan van het GO! bij dit minimumdoel laadt lui: zijn gegevens horen niet in de bundel van de doelpagina.
const GoBijDoelDeel = lazy(() => import('../../components/basis/go/GoBijDoel'));
const GO_KOP = 'Leerplan van het GO!';

function GoBijDoel({ doel }: DoelDeelProps): ReactNode {
  return (
    <Suspense fallback={null}>
      <GoBijDoelDeel doel={doel} />
    </Suspense>
  );
}

/** De delen van de doelpagina, in volgorde. Een latere fase voegt hier een regel aan toe. */
export const DOEL_DELEN: readonly { id: string; kop: string; Deel: (p: DoelDeelProps) => ReactNode }[] = [
  { id: 'wanneer', kop: 'Wanneer gelden deze doelen?', Deel: Wanneer },
  { id: 'go', kop: GO_KOP, Deel: GoBijDoel },
  { id: 'leerlijn', kop: LEERLIJN_KOP, Deel: Leerlijn },
];

const SOORT_ONDERWIJS = { bao: 'Gewoon basisonderwijs', bubao: 'Buitengewoon basisonderwijs' } as const;
const SOORT_ZIN = { bao: 'het gewoon basisonderwijs', bubao: 'het buitengewoon basisonderwijs' } as const;

const kleineLetter = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Is de tekst van twee doelen letterlijk dezelfde? */
function zelfdeTekst(a: DoelBasis, b: DoelBasis): boolean {
  return a.code === b.code && a.doelzinHtml === b.doelzinHtml && (a.uitbreidingHtml ?? '') === (b.uitbreidingHtml ?? '') && (a.woordenschatHtml ?? '') === (b.woordenschatHtml ?? '');
}

function Tweeling({ doel, tweeling }: { doel: DoelBasis; tweeling: DoelBasis }) {
  const gelijk = zelfdeTekst(doel, tweeling);
  const daar = tweeling.soortDoel ? `, daar ${kleineLetter(SOORT_DOELEN_LABEL[tweeling.soortDoel])}` : '';
  return (
    <p className="b-tweeling">
      {gelijk ? (
        <>
          Ook in {SOORT_ZIN[tweeling.soort]}: hetzelfde doel (nummer en tekst){daar}.{' '}
        </>
      ) : (
        <>
          Hetzelfde nummer staat ook in {SOORT_ZIN[tweeling.soort]}, maar de tekst is niet dezelfde{daar}.{' '}
        </>
      )}
      <Link to={doelPad({ set: tweeling.setId, id: tweeling.id })}>Bekijk doel {tweeling.code} in {SOORT_ZIN[tweeling.soort]}</Link>
    </p>
  );
}

/** De melding voor een set die niet bestaat of een doel dat er niet in staat. */
export function DoelNietGevonden({ setId, doelId, soort = 'bao' }: { setId: string; doelId: string; soort?: 'bao' | 'bubao' }) {
  return (
    <section className="b-plaats">
      <h1>Dit doel vonden we niet</h1>
      <p>
        Doel {doelId} staat niet in set {setId}. Misschien kreeg de set een nieuw nummer.
      </p>
      <ul className="b-plaats-links">
        <li>
          <Link to={basisPad({ s: 'zoek', soort, vraag: doelId, bereik: 'alles' })}>Zoek naar doel {doelId}</Link>
        </li>
        <li>
          <Link to={basisPad({ s: 'start' })}>Mijn leerjaar</Link>
        </li>
      </ul>
    </section>
  );
}

/** De pagina zonder laden: het doel, zijn set en wat er bij hoort. */
export function DoelInhoud({
  doel,
  info,
  alle,
  vak,
  tweeling,
  schooljaar,
  bron,
}: {
  doel: DoelBasis;
  info: BasisSet;
  alle: readonly MinimumdoelenIndexSet[];
  vak: VakDoelen;
  tweeling?: DoelBasis;
  schooljaar: Schooljaar;
  /** De bronvermelding uit de index, met de ophaaldatum. */
  bron?: string;
}) {
  const vakNaam = INVOERINGSKALENDER.vakken.find((v) => v.nr === doel.vak)?.naam ?? 'Dit vak';
  const rubriek = [doel.onderwerp, doel.subthema].filter((x): x is string => x !== undefined);
  return (
    <div className="b-doelpagina">
      <div className="b-doelkaart-groot">
        <p className="b-rubriekregel">
          {doel.onderwerpNr} {rubriek.join(' › ')}
        </p>
        <h1>Minimumdoel {doel.code}</h1>
        <p className="b-onderregel">
          {MOMENT_KORT[doel.eind]} · {vakNaam}
        </p>
        <VolledigeDoeltekst doel={doel} className="b-doeltekst-groot" />
        <p className="b-badges">
          {doel.soortDoel && <span className="badge badge-brand">{SOORT_DOELEN_LABEL[doel.soortDoel]}</span>}
          <span className="badge">{SOORT_ONDERWIJS[doel.soort]}</span>
        </p>
        {tweeling && <Tweeling doel={doel} tweeling={tweeling} />}
        <p className="b-doelvoet">
          Nummer {doel.id} · set {doel.setId} ·{' '}
          <Link to={basisPad({ s: 'vak', soort: doel.soort, eind: doel.eind, vak: doel.vak })}>Alle doelen van dit vak</Link> ·{' '}
          <Link to={`/leerplannen/minimumdoelen/${doel.setId}`}>Officiële set</Link>
        </p>
      </div>
      {DOEL_DELEN.map((d) => (
        <d.Deel key={d.id} doel={doel} info={info} alle={alle} schooljaar={schooljaar} vak={vak} />
      ))}
      {bron && (
        <p className="b-doelbron">
          {bron} · <Link to="/privacy">Privacy en opslag</Link>
        </p>
      )}
    </div>
  );
}

export function DoelScherm({ setId, doelId }: { setId: string; doelId: string }) {
  const index = useBasisIndex();
  const alle = index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined;
  const indexSet = alle?.find((s) => s.id === setId);
  const info = useMemo(() => (indexSet ? basisSet(indexSet) : undefined), [indexSet]);
  const nieuw = info !== undefined && info.generatie === 'nieuw' && !info.leeg && info.vak !== undefined && info.eindmoment !== undefined;

  // De sets van het vak op elk moment (met de eigen set) en de kandidaten voor de tweeling in de andere soort.
  const vakSets = useMemo(
    () => (alle && info && nieuw && info.vak ? Object.values(setsVanVak(alle, info.soort, info.vak.nr)).flat() : []),
    [alle, info, nieuw],
  );
  const tweelingKand = useMemo(() => (alle && info && nieuw ? tweelingSets(info, alle) : []), [alle, info, nieuw]);
  const ids = useMemo(() => (indexSet ? [...new Set([setId, ...vakSets.map((s) => s.id), ...tweelingKand.map((s) => s.id)])] : []), [indexSet, setId, vakSets, tweelingKand]);
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);

  const doelenVan = (set: MinimumdoelenIndexSet): DoelBasis[] => {
    const b = bestanden.get(set.id);
    const i = basisSet(set);
    return b && i ? doelenVanSet(b, i) : [];
  };

  if (alle === undefined) {
    return (
      <div className="b-doelpagina">
        <h1>Minimumdoel</h1>
        {index.stand.status === 'laden' && <LaadBericht tekst="Het doel wordt geladen" />}
        {index.stand.status === 'fout' && <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />}
      </div>
    );
  }
  if (!indexSet || !info) return <DoelNietGevonden setId={setId} doelId={doelId} />;

  const eigen = stand(setId);
  if (eigen.status !== 'klaar') {
    return (
      <div className="b-doelpagina">
        <h1>Minimumdoel</h1>
        {eigen.status === 'laden' ? <LaadBericht tekst="Het doel wordt geladen" /> : <FoutBericht fout={eigen.fout} onOpnieuw={() => opnieuw(setId)} />}
      </div>
    );
  }
  const doel = doelenVan(indexSet).find((d) => d.id === doelId);
  if (!doel) return <DoelNietGevonden setId={setId} doelId={doelId} soort={info.soort} />;

  const vakKlaar = vakSets.every((s) => stand(s.id).status === 'klaar');
  const fouten = vakSets.flatMap((s) => {
    const st = stand(s.id);
    return st.status === 'fout' ? [{ id: s.id, fout: st.fout }] : [];
  });
  const vak: VakDoelen = {
    doelen: samenvoegen(vakSets.map(doelenVan)),
    momenten: new Set(vakSets.map((s) => basisSet(s)?.eindmoment).filter((m): m is Eindmoment => m !== undefined)),
    klaar: vakKlaar,
    fouten,
    opnieuw,
  };
  const tweeling = tweelingKand.flatMap(doelenVan).find((d) => d.id === doelId);
  const opgehaald = alle.reduce((m, s) => (s.opgehaald > m ? s.opgehaald : m), '');
  const index_ = index.stand.status === 'klaar' ? index.stand.waarde : undefined;
  const bron = index_ ? `${index_.naamsvermelding}${opgehaald ? ` · opgehaald op ${datumLeesbaar(opgehaald)}` : ''}` : undefined;

  return <DoelInhoud doel={doel} info={info} alle={alle} vak={vak} tweeling={tweeling} schooljaar={huidigSchooljaar()} bron={bron} />;
}
