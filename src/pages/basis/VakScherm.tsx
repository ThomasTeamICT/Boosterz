// #/basis/vak/:soort/:eind/:vak[?leerjaar=L3][&onderwerp=3.5]: één vak op één moment, per rubriek. De pagina laadt de
// één of twee sets van het vak (het kleuter-Nederlands en kleuter-wiskunde van het gewoon onderwijs hebben er twee) en
// voegt ze samen op code. Elk doel staat er volledig en letterlijk: doelzin, uitbreiding en woordenschat.
//
// Komt de leerkracht van haar leerjaar, dan staat bovenaan wat het momentmodel voor dat leerjaar zegt. ?onderwerp
// scrolt naar een onderwerp. Een leerjaar dat niet naar dit moment werkt, wordt al door de padlezer genegeerd.

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DoelKaart } from '../../components/basis/DoelKaart';
import { MOMENT_KORT } from '../../components/basis/DoelRij';
import { RubriekenLijst, ga, onderwerpKopId } from '../../components/basis/RubriekenLijst';
import { ZekerheidBadge } from '../../components/basis/ZekerheidBadge';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { useBasisIndex } from '../../components/basis/useBasisSets';
import { aantalTekst } from '../../components/basis/VakKaart';
import { vakIcoon, vakTint } from '../../components/basis/vakIconen';
import { GoVakLinks } from '../../components/basis/go/GoVakLinks';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { useSetBestanden } from '../../components/curriculum/samenstellen/useSetBestanden';
import { basisPad } from '../../lib/basis/basisRoutes';
import { doelenVanSet, rubrieken, samenvoegen, setsVoorVak, telPerSoort, type DoelBasis } from '../../lib/basis/doelBasis';
import {
  INVOERINGSKALENDER,
  schooljaarTekst,
  schooljaarVanDatum,
  type Eindmoment,
  type LeerjaarBasis,
  type Schooljaar,
  type SoortBasis,
} from '../../lib/basis/kalender';
import { basisSet, invoering, laagsteZekerheid, type BasisSet, type Invoering } from '../../lib/basis/moment';
import { STATUS_LABEL, leerjarenTekst } from '../../lib/basis/momentTeksten';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { EINDE_TEKST, SoortLinks } from './MomentScherm';
import '../../styles/basis-doelen.css';

/** Het schooljaar van vandaag. De klok wordt hier gelezen, nooit in src/lib/basis. */
export function huidigSchooljaar(): Schooljaar {
  return schooljaarVanDatum(new Date()) ?? new Date().getFullYear();
}

export interface VakSet {
  set: MinimumdoelenIndexSet;
  info: BasisSet;
}

/** De zin 'Voor je 3de leerjaar: verplicht in 2026-2027' uit de invoeringen van de sets van het vak. */
export function statusRegel(leerjaar: LeerjaarBasis, invoeringen: readonly Invoering[], schooljaar: Schooljaar): { tekst: string; zekerheid: ReturnType<typeof laagsteZekerheid> } | undefined {
  const eerste = invoeringen[0];
  if (!eerste) return undefined;
  const sj = schooljaarTekst(schooljaar);
  const vanaf = invoeringen.find((i) => i.verplichtVanaf !== undefined)?.verplichtVanaf;
  let wat: string;
  if (eerste.status === 'verplicht') wat = `verplicht in ${sj}`;
  else if (eerste.status === 'mag') wat = `mag al in ${sj}${vanaf !== undefined ? `, verplicht vanaf ${schooljaarTekst(vanaf)}` : ''}`;
  else wat = `${STATUS_LABEL[eerste.status]} in ${sj}`;
  return { tekst: `Voor je ${leerjarenTekst([leerjaar])}: ${wat}`, zekerheid: laagsteZekerheid(invoeringen.map((i) => i.zekerheid)) };
}

export function VakInhoud({
  soort,
  eind,
  vak,
  leerjaar,
  onderwerp,
  sets,
  doelen,
  schooljaar,
}: {
  soort: SoortBasis;
  eind: Eindmoment;
  vak: number;
  leerjaar?: LeerjaarBasis;
  onderwerp?: string;
  sets: readonly VakSet[];
  doelen: readonly DoelBasis[];
  schooljaar: Schooljaar;
}) {
  const { keuze } = useBasisKeuze();
  const naam = INVOERINGSKALENDER.vakken.find((v) => v.nr === vak)?.naam ?? 'Vak';
  const onderwerpen = useMemo(() => rubrieken(doelen), [doelen]);
  const perSoort = telPerSoort(sets.map((s) => ({ soortDoelen: s.info.soortDoelen, aantal: doelen.filter((d) => d.setId === s.set.id).length })));
  const toonSoort = perSoort.length > 1;
  const status = leerjaar
    ? statusRegel(
        leerjaar,
        sets.flatMap((s) => invoering(s.info, leerjaar, schooljaar) ?? []),
        schooljaar,
      )
    : undefined;
  const isMijn = leerjaar !== undefined && keuze?.soort === soort && keuze.leerjaar === leerjaar;

  // ?onderwerp scrolt naar het onderwerp, zodra de doelen er staan.
  const aantal = doelen.length;
  useEffect(() => {
    if (onderwerp && aantal > 0) ga(onderwerp);
  }, [onderwerp, aantal]);

  return (
    <>
      <nav className="b-kruimel" aria-label="Kruimelpad">
        <ol>
          <li>
            {leerjaar ? (
              <Link to={basisPad({ s: 'leerjaar', soort, leerjaar })}>
                {isMijn ? 'Mijn leerjaar' : 'Leerjaar'}: {leerjarenTekst([leerjaar])}
              </Link>
            ) : (
              <Link to={basisPad({ s: 'moment', soort, eind })}>Doelen › {MOMENT_KORT[eind]}</Link>
            )}
          </li>
          <li aria-current="page">{naam}</li>
        </ol>
      </nav>
      <VakKop vak={vak} naam={naam} />
      <p className="b-lead">
        Doelen voor {EINDE_TEKST[eind]}
        {doelen.length > 0 && <> · {aantalTekst(doelen.length, perSoort)}</>}
      </p>
      {status && (
        <p className="b-statusregel">
          {status.tekst} <ZekerheidBadge zekerheid={status.zekerheid} />
        </p>
      )}
      <div className="b-schakelaars">
        <SoortLinks soort={soort} naar={(s) => ({ s: 'vak', soort: s, eind, vak, leerjaar })} />
      </div>

      {sets.length === 0 ? (
        <p className="b-noot">
          {naam} heeft geen nieuwe doelen voor {EINDE_TEKST[eind]}. Misschien staat het vak wel op een ander moment: kijk dan bij de leerlijn van dit vak.
        </p>
      ) : (
        <>
          <RubriekenLijst onderwerpen={onderwerpen} />
          {onderwerpen.map((o) => (
            <section key={o.nr} className="b-onderwerp" aria-labelledby={onderwerpKopId(o.nr)}>
              <h2 id={onderwerpKopId(o.nr)} tabIndex={-1}>
                {o.nr} {o.naam} <span className="b-onderwerp-aantal">({o.aantal})</span>
              </h2>
              {o.subthemas.map((g, i) => (
                <div key={g.naam ?? `zonder-${i}`} className="b-subthema">
                  {g.naam !== undefined && <h3>{g.naam}</h3>}
                  <ol className="b-doelen">
                    {g.doelen.map((d) => (
                      <DoelKaart key={`${d.setId}-${d.id}`} doel={d} toonSoort={toonSoort} />
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ))}
        </>
      )}

      <p className="b-vakkoppelingen">
        <Link to={basisPad({ s: 'leerlijn', soort, vak, leerjaar })} className="b-lees-meer">
          Leerlijn van dit vak
        </Link>
        <GoVakLinks vak={vak} leerjaar={leerjaar} />
        {sets.map((s) => (
          <Link key={s.set.id} to={`/leerplannen/minimumdoelen/${s.set.id}`} className="b-lees-meer">
            Officiële set{sets.length > 1 ? ` ${s.set.id}` : ''}
          </Link>
        ))}
      </p>
    </>
  );
}

function VakKop({ vak, naam }: { vak: number; naam: string }) {
  const Icoon = vakIcoon(vak);
  return (
    <h1 className="b-vakkop">
      <span className="b-vaktegel" style={{ ['--h' as string]: vakTint(vak) }} aria-hidden="true">
        <Icoon size={24} />
      </span>
      <span>{naam}</span>
    </h1>
  );
}

export function VakScherm({
  soort,
  eind,
  vak,
  leerjaar,
  onderwerp,
}: {
  soort: SoortBasis;
  eind: Eindmoment;
  vak: number;
  leerjaar?: LeerjaarBasis;
  onderwerp?: string;
}) {
  const index = useBasisIndex();
  const alle = index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined;
  const indexSets = useMemo(() => (alle ? setsVoorVak(alle, soort, eind, vak) : []), [alle, soort, eind, vak]);
  const ids = useMemo(() => indexSets.map((s) => s.id), [indexSets]);
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);

  const sets: VakSet[] = useMemo(
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
  const naam = INVOERINGSKALENDER.vakken.find((v) => v.nr === vak)?.naam ?? 'Vak';
  const fouten = ids.filter((id) => stand(id).status === 'fout');
  const klaar = ids.every((id) => stand(id).status === 'klaar');

  return (
    <div className="b-vakpagina">
      {alle === undefined ? (
        <>
          <h1>{naam}</h1>
          {index.stand.status === 'laden' && <LaadBericht tekst="De doelen worden geladen" />}
          {index.stand.status === 'fout' && <FoutBericht fout={index.stand.fout} onOpnieuw={index.opnieuw} />}
        </>
      ) : !klaar ? (
        <>
          <h1>{naam}</h1>
          {fouten.length === 0 && <LaadBericht tekst={`De doelen worden geladen (${ids.length} ${ids.length === 1 ? 'set' : 'sets'})`} />}
          {fouten.map((id) => {
            const s = stand(id);
            return s.status === 'fout' ? <FoutBericht key={id} fout={s.fout} naam={id} onOpnieuw={() => opnieuw(id)} /> : null;
          })}
        </>
      ) : (
        <VakInhoud soort={soort} eind={eind} vak={vak} leerjaar={leerjaar} onderwerp={onderwerp} sets={sets} doelen={doelen} schooljaar={huidigSchooljaar()} />
      )}
    </div>
  );
}
