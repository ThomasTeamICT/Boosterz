// #/basis/leerlijn/:soort[?leerjaar=L3] (alle vakken) en #/basis/leerlijn/:soort/:vak[?leerjaar=L3][&onderwerp=3.5]
// (de leerlijn van één vak).
//
// De leerlijn zet per onderwerp de doelen van de drie eindmomenten naast elkaar (LeerlijnTabel). De pagina laadt de
// sets van het vak op elk moment (2 tot 4). Ze beweert geen verband tussen doelen: de codes lopen niet door en de bron
// zegt niet welk doel uit welk ander volgt. Het leerjaar van de leerkracht (uit de url, anders de bewaarde keuze voor
// dezelfde soort) kleurt zijn kolom en zegt '(je leerjaar)'. Gewoon of buitengewoon kan hier gewisseld worden.

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GoVakLinks } from '../../components/basis/go/GoVakLinks';
import { MOMENT_KORT } from '../../components/basis/DoelRij';
import { LeerlijnTabel } from '../../components/basis/LeerlijnTabel';
import { RubriekenLijst, ga, onderwerpKopId } from '../../components/basis/RubriekenLijst';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { useBasisIndex } from '../../components/basis/useBasisSets';
import { vakIcoon, vakTint } from '../../components/basis/vakIconen';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { useSetBestanden } from '../../components/curriculum/samenstellen/useSetBestanden';
import { basisPad } from '../../lib/basis/basisRoutes';
import { EINDMOMENTEN, doelenVanSet, leerlijnVanVak, samenvoegen, setsVanVak, type DoelBasis, type LeerlijnOnderwerp, type Onderwerp } from '../../lib/basis/doelBasis';
import { INVOERINGSKALENDER, WERKT_NAAR, type Eindmoment, type LeerjaarBasis, type SoortBasis } from '../../lib/basis/kalender';
import { basisSet } from '../../lib/basis/moment';
import { leerjarenTekst } from '../../lib/basis/momentTeksten';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { SoortLinks } from './MomentScherm';
import '../../styles/basis-doelen.css';
import '../../styles/basis-leerlijn.css';

/** Het leerjaar van de leerkracht: dat in de url, anders het bewaarde leerjaar als het bij dezelfde soort hoort. */
export function useEigenLeerjaar(soort: SoortBasis, leerjaar?: LeerjaarBasis): LeerjaarBasis | undefined {
  const { keuze } = useBasisKeuze();
  return leerjaar ?? (keuze?.soort === soort ? keuze.leerjaar : undefined);
}

const TALEN = new Set(['Nederlands', 'Frans', 'ICT']);

/** De vaknaam midden in een zin: 'Wetenschap en techniek' wordt 'wetenschap en techniek', 'Nederlands' blijft. */
export function vakInZin(naam: string): string {
  return TALEN.has(naam) ? naam : naam.charAt(0).toLowerCase() + naam.slice(1);
}

const vakNaam = (vak: number): string => INVOERINGSKALENDER.vakken.find((v) => v.nr === vak)?.naam ?? 'Dit vak';

// ─── Alle vakken ─────────────────────────────────────────────────────────────

function eindenVan(alle: readonly MinimumdoelenIndexSet[], soort: SoortBasis, vak: number): Eindmoment[] {
  const per = setsVanVak(alle, soort, vak);
  return EINDMOMENTEN.filter((m) => (per[m]?.length ?? 0) > 0);
}

/** De pagina met de tien vaktegels, zonder laden. `alle` geeft per tegel de momenten waarop het vak doelen heeft. */
export function LeerlijnenInhoud({ soort, leerjaar, alle }: { soort: SoortBasis; leerjaar?: LeerjaarBasis; alle?: readonly MinimumdoelenIndexSet[] }) {
  return (
    <>
      <p className="b-lead">
        Kies een vak. Je ziet dan per onderwerp de doelen van het einde van de kleuterklas, het 4de en het 6de leerjaar naast elkaar.
      </p>
      <div className="b-schakelaars">
        <SoortLinks soort={soort} naar={(s) => ({ s: 'leerlijnen', soort: s, leerjaar })} />
      </div>
      <ul className="b-kaarten">
        {INVOERINGSKALENDER.vakken.map((v) => {
          const Icoon = vakIcoon(v.nr);
          const einden = alle ? eindenVan(alle, soort, v.nr) : undefined;
          return (
            <li key={v.nr}>
              <Link to={basisPad({ s: 'leerlijn', soort, vak: v.nr, leerjaar })} className="b-vakkaart">
                <span className="b-vaktegel" style={{ ['--h' as string]: vakTint(v.nr) }} aria-hidden="true">
                  <Icoon size={24} />
                </span>
                <span className="b-vakkaart-tekst">
                  <span className="b-vakkaart-naam">{v.naam}</span>
                  {einden && einden.length > 0 && <span className="b-vakkaart-sub">{einden.map((m) => MOMENT_KORT[m]).join(' · ')}</span>}
                  {einden && einden.length === 0 && <span className="b-vakkaart-sub">Geen nieuwe doelen in de gegevens</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function LeerlijnenScherm({ soort, leerjaar }: { soort: SoortBasis; leerjaar?: LeerjaarBasis }) {
  const index = useBasisIndex();
  const eigen = useEigenLeerjaar(soort, leerjaar);
  return (
    <div className="b-leerlijnpagina">
      <h1>Leerlijnen</h1>
      {index.stand.status === 'fout' && <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />}
      <LeerlijnenInhoud soort={soort} leerjaar={eigen} alle={index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined} />
    </div>
  );
}

// ─── De leerlijn van een vak ─────────────────────────────────────────────────

/** De rubrieken als knoppen voor RubriekenLijst: onderwerp, naam en het totaal over de drie momenten. */
function alsOnderwerpen(lijn: readonly LeerlijnOnderwerp[]): Onderwerp[] {
  return lijn.map((o) => ({ nr: o.nr, naam: o.naam, aantal: o.aantal.K3 + o.aantal.L4 + o.aantal.L6, subthemas: [] }));
}

export interface LeerlijnInhoudProps {
  soort: SoortBasis;
  vak: number;
  leerjaar?: LeerjaarBasis;
  onderwerp?: string;
  doelen: readonly DoelBasis[];
  /** De momenten waarop het vak een nieuwe set heeft. */
  momenten: ReadonlySet<Eindmoment>;
  /** Forceer de kaartweergave van de tabellen (voor tests). */
  smal?: boolean;
}

/** De leerlijn van een vak zonder laden. */
export function LeerlijnInhoud({ soort, vak, leerjaar, onderwerp, doelen, momenten, smal }: LeerlijnInhoudProps) {
  const naam = vakNaam(vak);
  const Icoon = vakIcoon(vak);
  const lijn = useMemo(() => leerlijnVanVak(doelen), [doelen]);
  const eigen = leerjaar ? WERKT_NAAR[leerjaar] : undefined;

  // ?onderwerp scrolt naar het onderwerp, zodra de tabellen er staan.
  const aantal = lijn.length;
  useEffect(() => {
    if (onderwerp && aantal > 0) ga(onderwerp);
  }, [onderwerp, aantal]);

  return (
    <>
      <nav className="b-kruimel" aria-label="Kruimelpad">
        <ol>
          <li>
            <Link to={basisPad({ s: 'leerlijnen', soort, leerjaar })}>Leerlijnen</Link>
          </li>
          <li aria-current="page">{naam}</li>
        </ol>
      </nav>
      <h1 className="b-vakkop">
        <span className="b-vaktegel" style={{ ['--h' as string]: vakTint(vak) }} aria-hidden="true">
          <Icoon size={24} />
        </span>
        <span>Leerlijn {vakInZin(naam)}</span>
      </h1>
      <p className="b-lead">
        Per onderwerp staan de doelen van de drie momenten naast elkaar. De codes lopen niet door, en de bron zegt niet welk doel uit welk ander volgt.
      </p>
      {leerjaar && eigen && (
        <p className="b-noot">
          Je {leerjarenTekst([leerjaar])} werkt naar {MOMENT_KORT[eigen].toLowerCase()}: die kolom is gemarkeerd met &quot;(je leerjaar)&quot;.
        </p>
      )}
      <div className="b-schakelaars">
        <SoortLinks soort={soort} naar={(s) => ({ s: 'leerlijn', soort: s, vak, leerjaar, onderwerp })} />
      </div>
      {lijn.length === 0 ? (
        <p className="b-noot">{naam} heeft geen nieuwe doelen in de gegevens. Kijk bij Officiële minimumdoelen voor de oude eindtermen of ontwikkelingsdoelen.</p>
      ) : (
        <>
          <RubriekenLijst onderwerpen={alsOnderwerpen(lijn)} />
          {lijn.map((o) => (
            <section key={o.nr} className="b-onderwerp" aria-labelledby={onderwerpKopId(o.nr)}>
              <h2 id={onderwerpKopId(o.nr)} tabIndex={-1}>
                {o.nr} {o.naam}
              </h2>
              <LeerlijnTabel onderwerp={o} eigen={eigen} momenten={momenten} smal={smal} />
            </section>
          ))}
        </>
      )}
      <p className="b-vakkoppelingen">
        {EINDMOMENTEN.filter((m) => momenten.has(m)).map((m) => (
          <Link key={m} to={basisPad({ s: 'vak', soort, eind: m, vak, leerjaar: leerjaar && WERKT_NAAR[leerjaar] === m ? leerjaar : undefined })} className="b-lees-meer">
            Alle doelen: {MOMENT_KORT[m].toLowerCase()}
          </Link>
        ))}
        <GoVakLinks vak={vak} leerjaar={leerjaar} />
      </p>
    </>
  );
}

export function LeerlijnScherm({ soort, vak, leerjaar, onderwerp }: { soort: SoortBasis; vak: number; leerjaar?: LeerjaarBasis; onderwerp?: string }) {
  const index = useBasisIndex();
  const eigen = useEigenLeerjaar(soort, leerjaar);
  const alle = index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined;
  const indexSets = useMemo(() => (alle ? Object.values(setsVanVak(alle, soort, vak)).flat() : []), [alle, soort, vak]);
  const ids = useMemo(() => indexSets.map((s) => s.id), [indexSets]);
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);

  const sets = useMemo(
    () => indexSets.flatMap((set) => {
      const info = basisSet(set);
      return info ? [{ set, info }] : [];
    }),
    [indexSets],
  );
  const doelen = useMemo(
    () => samenvoegen(sets.map((s) => { const b = bestanden.get(s.set.id); return b ? doelenVanSet(b, s.info) : []; })),
    [sets, bestanden],
  );
  const momenten = useMemo(() => new Set(sets.map((s) => s.info.eindmoment).filter((m): m is Eindmoment => m !== undefined)), [sets]);

  const naam = vakNaam(vak);
  const fouten = ids.filter((id) => stand(id).status === 'fout');
  const klaar = ids.every((id) => stand(id).status === 'klaar');

  return (
    <div className="b-leerlijnpagina">
      {alle === undefined ? (
        <>
          <h1>Leerlijn {vakInZin(naam)}</h1>
          {index.stand.status === 'laden' && <LaadBericht tekst="De doelen worden geladen" />}
          {index.stand.status === 'fout' && <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />}
        </>
      ) : !klaar ? (
        <>
          <h1>Leerlijn {vakInZin(naam)}</h1>
          {fouten.length === 0 && <LaadBericht tekst={`De doelen worden geladen (${ids.length} ${ids.length === 1 ? 'set' : 'sets'})`} />}
          {fouten.map((id) => {
            const s = stand(id);
            return s.status === 'fout' ? <FoutBericht key={id} fout={s.fout} naam={id} onOpnieuw={() => opnieuw(id)} /> : null;
          })}
        </>
      ) : (
        <LeerlijnInhoud soort={soort} vak={vak} leerjaar={eigen} onderwerp={onderwerp} doelen={doelen} momenten={momenten} />
      )}
    </div>
  );
}
