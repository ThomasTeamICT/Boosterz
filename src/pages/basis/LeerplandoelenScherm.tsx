// #/basis/leerplandoelen/wt?leerjaar=K1: de leerplandoelen van één vakdiscipline van het GO! (docs/basisonderwijs/
// GO-LEERPLAN.md, "3. Leerplandoelen per vak en leeftijd"): de kiezer voor de leeftijd, de onderwerpen, een filter
// 'zonder minimumdoel' en de doelen per onderwerp (h2), subthema (h3), rubriek (h4) en subrubriek (h5). Elke rubriek is een
// kop, een niveau onder haar ouder, zodat een schermlezer de hele indeling kan doorlopen zonder dat er een niveau overgeslagen wordt.
//
// Dit scherm laadt lui (BasisDeel) en laadt één leerplanbestand en de index. Alle tekst van het GO! is letterlijk; de
// minimumdoelen staan als chips (de tekst zelf staat op de leerplandoelpagina, uit de API).
// De groep van het bewaarde leerjaar staat standaard aan; 'Alle leeftijden' zet dat uit zonder iets te bewaren.
// Laadt de index niet, dan staat er boven de lijst een melding met 'Opnieuw proberen': de lesplannen bij de doelen
// ontbreken dan, en stil weglaten zou zeggen dat er geen zijn.

import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoBronvermelding } from '../../components/basis/go/GoBronvermelding';
import { KoppelingChips, type DoelPadFn } from '../../components/basis/go/KoppelingLijst';
import { useDoelPad } from '../../components/basis/go/useDoelPad';
import { LeeftijdKiezer } from '../../components/basis/go/LeeftijdKiezer';
import { GoTekstWeergave } from '../../components/basis/go/MiaBlok';
import { foutVan, useGoIndex, useGoLeerplan, type GoLaadFout } from '../../components/basis/useGo';
import { useBasisKeuze } from '../../components/basis/useBasisKeuze';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { isZonderMinimumdoel, rubriekPad } from '../../lib/basis/go/goModel';
import { GO_LEEFTIJDEN, leerjaarVanLeeftijd, leeftijdLabel, leeftijdenLabel, leeftijdVanLeerjaar } from '../../lib/basis/go/leeftijden';
import { GO_VAKKEN, KENNISVERWERKING_ZIN, type GoIndex, type GoLeeftijd, type GoLeerplandoel, type GoLeerplanBestand, type GoRubriek, type GoVak } from '../../lib/basis/go/types';
import type { LeerjaarBasis } from '../../lib/basis/kalender';
import '../../styles/basis-go.css';

// ── Wat er getoond wordt (zuiver, getest in goSchermen.test.ts) ──────────────

export interface DoelFilter {
  leeftijd?: GoLeeftijd;
  /** Alleen doelen die het leerplan aan geen enkel minimumdoel koppelt (ook niet via een onderdeel). */
  zonderMinimumdoel?: boolean;
  /** Het id van een rubriek: alleen wat daaronder valt. */
  rubriek?: string;
}

export type LijstItem =
  | { soort: 'kop'; rubriek: GoRubriek; /** 2 tot 5 voor h2 tot h5. */ niveau: 2 | 3 | 4 | 5 }
  | { soort: 'doel'; doel: GoLeerplandoel };

/**
 * De doelen die het filter doorlaten, met alleen de koppen waar zo'n doel onder valt, in bronvolgorde. Het niveau van een
 * kop volgt de diepte in de hiërarchie (de bron slaat soms een niveau over), zodat er nooit een kop overgeslagen wordt;
 * een subrubriek is een h5.
 */
export function lijstItems(leerplan: GoLeerplanBestand, filter: DoelFilter): { items: LijstItem[]; aantal: number } {
  const bekend = new Set(leerplan.rubrieken.map((r) => r.id));
  const rubriek = filter.rubriek !== undefined && bekend.has(filter.rubriek) ? filter.rubriek : undefined;
  const pad = new Map<string, GoRubriek[]>();
  const padVan = (id: string): GoRubriek[] => {
    let p = pad.get(id);
    if (!p) {
      p = rubriekPad(leerplan, id);
      pad.set(id, p);
    }
    return p;
  };
  const doelen = leerplan.doelen.filter(
    (d) =>
      (filter.leeftijd === undefined || d.leeftijden.includes(filter.leeftijd)) &&
      (!filter.zonderMinimumdoel || isZonderMinimumdoel(d)) &&
      (rubriek === undefined || padVan(d.rubriek).some((r) => r.id === rubriek)),
  );
  const gebruikt = new Set(doelen.flatMap((d) => padVan(d.rubriek).map((r) => r.id)));
  const rijen: { rij: number; item: LijstItem }[] = [
    ...leerplan.rubrieken
      .filter((r) => gebruikt.has(r.id))
      .map((r) => {
        const diepte = padVan(r.id).length;
        const niveau = Math.min(1 + diepte, 5) as 2 | 3 | 4 | 5;
        return { rij: r.rij, item: { soort: 'kop', rubriek: r, niveau } as LijstItem };
      }),
    ...doelen.map((d) => ({ rij: d.rij, item: { soort: 'doel', doel: d } as LijstItem })),
  ];
  rijen.sort((a, b) => a.rij - b.rij);
  return { items: rijen.map((r) => r.item), aantal: doelen.length };
}

export type LijstBlok = Extract<LijstItem, { soort: 'kop' }> | { soort: 'doelen'; doelen: GoLeerplandoel[] };

/** De items als koppen en lijsten: aangrenzende doelen staan samen in één lijst. */
export function blokkenVan(items: readonly LijstItem[]): LijstBlok[] {
  const uit: LijstBlok[] = [];
  for (const it of items) {
    if (it.soort === 'kop') {
      uit.push(it);
      continue;
    }
    const laatste = uit[uit.length - 1];
    if (laatste?.soort === 'doelen') laatste.doelen.push(it.doel);
    else uit.push({ soort: 'doelen', doelen: [it.doel] });
  }
  return uit;
}

/** Hoeveel doelen er in elke leeftijdsgroep zijn; een doel telt bij elke groep waar het staat. */
export function aantalPerLeeftijd(leerplan: GoLeerplanBestand): Record<GoLeeftijd, number> {
  const uit = Object.fromEntries(GO_LEEFTIJDEN.map((l) => [l, 0])) as Record<GoLeeftijd, number>;
  for (const d of leerplan.doelen) for (const l of d.leeftijden) uit[l]++;
  return uit;
}

/** De onderwerpen om te kiezen: de rubrieken op het hoogste niveau, met hoeveel doelen er onder vallen na de andere filters. */
export function onderwerpKeuzes(leerplan: GoLeerplanBestand, filter: Omit<DoelFilter, 'rubriek'>): { rubriek: GoRubriek; aantal: number }[] {
  const { items } = lijstItems(leerplan, filter);
  const perBoven = new Map<string, number>();
  const bekend = new Map(leerplan.rubrieken.map((r) => [r.id, r] as const));
  for (const d of items) {
    if (d.soort !== 'doel') continue;
    const boven = rubriekPad(leerplan, d.doel.rubriek)[0];
    if (boven) perBoven.set(boven.id, (perBoven.get(boven.id) ?? 0) + 1);
  }
  return [...perBoven].flatMap(([id, aantal]) => {
    const r = bekend.get(id);
    return r ? [{ rubriek: r, aantal }] : [];
  });
}

// ── Onderdelen ──────────────────────────────────────────────────────────────

/** Een lesplan bij een doel, voor de link: de code en, als de index geladen is, de titel. */
export interface LesplanLink {
  code: string;
  titel?: string;
}

/** De tekst van een lesplanlink: 'LP0065 Dieren classificeren'; zonder titel (index niet geladen) alleen de code. */
export const lesplanLinkTekst = (l: LesplanLink): string => (l.titel ? `${l.code} ${l.titel}` : l.code);

// Vanaf 900 px breed is een doel één rij met drie kolommen (code en kennisverwerking, doelzin en leeftijden, minimumdoelen
// en lesplannen); eronder staan de delen onder elkaar, zoals altijd (basis-go.css, '.b-go-lijst').
function Doel({ doel, lesplannen, doelPad }: { doel: GoLeerplandoel; lesplannen: readonly LesplanLink[]; doelPad?: DoelPadFn }) {
  return (
    <li className="b-go-doel" id={`b-go-doel-${doel.code}`}>
      <p className="b-go-doelkop">
        <Link to={basisPad({ s: 'leerplandoel', code: doel.code })} className="b-go-doelcode">
          {doel.code}
          <span className="sr-only"> (open dit leerplandoel)</span>
        </Link>
        <span className="b-go-kv">
          <span className="sr-only">Kennisverwerking: </span>
          {doel.kennisverwerking}
        </span>
      </p>
      <div className="b-go-doelmidden">
        <p className="b-go-tekst b-go-doeltekst">
          <GoTekstWeergave tekst={doel} />
        </p>
        <p className="b-go-leeftijden">({leeftijdenLabel(doel.leeftijden)})</p>
      </div>
      <div className="b-go-doelzij">
        <KoppelingChips doel={doel} doelPad={doelPad} />
        {lesplannen.length > 0 && (
          <p className="b-go-koppeling">
            <span className="b-go-koppeling-kop">{lesplannen.length === 1 ? 'Lesplan: ' : `Lesplannen (${lesplannen.length}): `}</span>
            {lesplannen.map((l, n) => (
              <span key={l.code}>
                <Link to={basisPad({ s: 'lesplan', code: l.code })} className="b-go-lesplanlink">
                  {lesplanLinkTekst(l)}
                  <span className="sr-only"> (lesplan bij {doel.code})</span>
                </Link>
                {n < lesplannen.length - 1 && ','}
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

function Kop({ rubriek, niveau }: { rubriek: GoRubriek; niveau: 2 | 3 | 4 | 5 }): ReactNode {
  const H = `h${niveau}` as 'h2' | 'h3' | 'h4' | 'h5';
  const klasse = rubriek.soort === 'subrubriek' ? 'b-go-kop b-go-subrubriek b-go-tekst' : `b-go-kop b-go-kop-${niveau} b-go-tekst`;
  return (
    <H className={klasse}>
      <GoTekstWeergave tekst={rubriek} />
    </H>
  );
}

export interface LeerplandoelenInhoudProps {
  leerplan: GoLeerplanBestand;
  index?: GoIndex;
  filter: DoelFilter;
  onLeeftijd: (l: GoLeeftijd | undefined) => void;
  onZonder: (aan: boolean) => void;
  /** Het adres van een onderwerp (rubriek) met dezelfde leeftijd, of van het hele vak (zonder rubriek). */
  rubriekPad: (rubriek: string | undefined) => string;
  /** De index laadde niet: de lesplannen bij de doelen ontbreken. Boven de lijst staat dan een melding met 'Opnieuw proberen'. */
  indexFout?: GoLaadFout;
  /** Het adres van een minimumdoel (useDoelPad, één keer per scherm); standaard de gewone set. */
  doelPad?: DoelPadFn;
}

/** De pagina voor een geladen leerplan, zonder zelf iets te laden. */
export function LeerplandoelenInhoud({ leerplan, index, filter, onLeeftijd, onZonder, rubriekPad: naarRubriek, indexFout, doelPad }: LeerplandoelenInhoudProps) {
  const vak = leerplan.vak;
  const { items, aantal } = useMemo(() => lijstItems(leerplan, filter), [leerplan, filter]);
  const keuzes = useMemo(() => onderwerpKeuzes(leerplan, { leeftijd: filter.leeftijd, zonderMinimumdoel: filter.zonderMinimumdoel }), [leerplan, filter.leeftijd, filter.zonderMinimumdoel]);
  const blokken = useMemo(() => blokkenVan(items), [items]);
  const perLeeftijd = useMemo(() => aantalPerLeeftijd(leerplan), [leerplan]);
  const lesplannen = useMemo(() => {
    const uit = new Map<string, LesplanLink[]>();
    if (index) for (const l of index.lesplannen) for (const c of l.doelen) uit.set(c, [...(uit.get(c) ?? []), { code: l.code, titel: l.titel }]);
    return uit;
  }, [index]);
  const zonderAantal = useMemo(() => leerplan.doelen.filter((d) => isZonderMinimumdoel(d)).length, [leerplan]);
  const gekozenRubriek = filter.rubriek !== undefined ? leerplan.rubrieken.find((r) => r.id === filter.rubriek) : undefined;
  const naam = GO_VAKKEN[vak].doelenset;
  // Een lege lijst door de leeftijd alleen (geen vinkje, geen onderwerp): zeg waar het vak wel doelen heeft.
  const eldersLeeftijden = GO_LEEFTIJDEN.filter((l) => perLeeftijd[l] > 0);
  const elders =
    aantal === 0 && filter.leeftijd !== undefined && !filter.zonderMinimumdoel && filter.rubriek === undefined && eldersLeeftijden.length > 0 ? eldersLeeftijden : undefined;

  return (
    <div className="b-doelpagina b-go-pagina b-go-lijst">
      <nav className="b-kruimel" aria-label="Kruimelpad">
        <ol>
          <li>
            <Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link>
          </li>
          <li>
            <span aria-current="page">{GO_VAKKEN[vak].naam}</span>
          </li>
        </ol>
      </nav>
      <h1>Leerplan van het GO!: {naam}</h1>
      <p className="b-lead">
        {leerplan.doelen.length} leerplandoelen, per leeftijd en per onderwerp, met de minimumdoelen waar het leerplan van het GO! ze aan koppelt.
      </p>
      <p className="b-noot">{KENNISVERWERKING_ZIN}</p>
      <GoBronvermelding soort="leerplan" vak={vak} ingelezen={leerplan.bron.ingelezen} />

      <LeeftijdKiezer waarde={filter.leeftijd} onKies={onLeeftijd} aantallen={perLeeftijd} />

      <div className="b-go-filters">
        <label className="b-go-vink">
          <input type="checkbox" checked={filter.zonderMinimumdoel === true} onChange={(e) => onZonder(e.target.checked)} />
          <span>Alleen doelen zonder minimumdoel ({zonderAantal} in dit vak)</span>
        </label>
      </div>

      {keuzes.length > 0 && (
        <nav className="b-go-onderwerpen" aria-label="Onderwerpen van dit vak">
          <ul>
            {keuzes.map(({ rubriek, aantal: n }) => (
              <li key={rubriek.id}>
                <Link to={naarRubriek(rubriek.id)} className="b-go-pil" aria-current={filter.rubriek === rubriek.id ? 'true' : undefined}>
                  <GoTekstWeergave tekst={rubriek} /> <span className="b-go-pil-aantal">({n})</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {gekozenRubriek && (
        <p className="b-noot">
          Je bekijkt alleen <strong><GoTekstWeergave tekst={gekozenRubriek} /></strong>.{' '}
          <Link to={naarRubriek(undefined)} className="b-go-lesplanlink">
            Toon het hele vak
          </Link>
        </p>
      )}

      <p className="b-go-aantal" role="status">
        {elders
          ? `${naam} heeft geen leerplandoelen voor ${leeftijdLabel(filter.leeftijd as GoLeeftijd)}. Wel voor:`
          : aantal === 0
          ? 'Geen leerplandoelen voor deze keuze.'
          : `${aantal} van de ${leerplan.doelen.length} leerplandoelen${filter.leeftijd ? ` voor ${leeftijdLabel(filter.leeftijd)}` : ''}${filter.zonderMinimumdoel ? ', zonder minimumdoel' : ''}.`}
      </p>
      {elders && (
        <div className="b-pillen" role="group" aria-label="Leeftijden met leerplandoelen">
          {elders.map((l) => (
            <button key={l} type="button" className="b-pil-knop" onClick={() => onLeeftijd(l)}>
              {leeftijdLabel(l)}
              <span className="b-go-pil-aantal"> ({perLeeftijd[l]})</span>
            </button>
          ))}
        </div>
      )}
      {indexFout && <FoutBericht fout={indexFout.fout} onOpnieuw={indexFout.opnieuw} naam="lesplannen bij de doelen" />}

      {blokken.map((b, n) =>
        b.soort === 'kop' ? (
          <Kop key={b.rubriek.id} rubriek={b.rubriek} niveau={b.niveau} />
        ) : (
          <ul key={`doelen-${n}`} className="b-go-doelen">
            {b.doelen.map((d) => (
              <Doel key={d.code} doel={d} lesplannen={lesplannen.get(d.code) ?? []} doelPad={doelPad} />
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

// ── Het scherm ──────────────────────────────────────────────────────────────

export function LeerplandoelenScherm({
  vak,
  leerjaar,
  alle,
  rubriek,
  zonder,
}: {
  vak: GoVak;
  leerjaar?: LeerjaarBasis;
  alle?: boolean;
  rubriek?: string;
  zonder?: boolean;
}) {
  const leerplan = useGoLeerplan(vak);
  const indexHook = useGoIndex();
  const index = indexHook.stand;
  const navigate = useNavigate();
  const { keuze } = useBasisKeuze();
  const doelPad = useDoelPad();

  // Het adres wint; zonder leerjaar in het adres staat de groep van het bewaarde leerjaar aan, tenzij je 'Alle leeftijden' koos.
  const effectief: LeerjaarBasis | undefined = leerjaar ?? (alle ? undefined : keuze?.leerjaar);
  const leeftijd = effectief ? leeftijdVanLeerjaar(effectief) : undefined;
  const filter = useMemo<DoelFilter>(() => ({ leeftijd, zonderMinimumdoel: !!zonder, rubriek }), [leeftijd, zonder, rubriek]);

  const kiesLeeftijd = (l: GoLeeftijd | undefined) => {
    navigate(basisPad({ s: 'leerplandoelen', vak, leerjaar: l ? leerjaarVanLeeftijd(l) : undefined, alle: l === undefined || undefined, rubriek, zonder: zonder || undefined }), { replace: true });
  };
  const onZonder = (aan: boolean) => navigate(basisPad({ s: 'leerplandoelen', vak, leerjaar, alle: alle || undefined, rubriek, zonder: aan || undefined }), { replace: true });
  const naarRubriek = (r: string | undefined) =>
    basisPad({ s: 'leerplandoelen', vak, leerjaar: effectief, alle: (!effectief && alle) || undefined, rubriek: r, zonder: zonder || undefined });

  const kop = `Leerplan van het GO!: ${GO_VAKKEN[vak].doelenset}`;
  if (leerplan.stand.status === 'laden') {
    return (
      <div className="b-doelpagina">
        <h1>{kop}</h1>
        <LaadBericht tekst="De leerplandoelen worden geladen" />
      </div>
    );
  }
  if (leerplan.stand.status === 'fout') {
    return (
      <div className="b-doelpagina">
        <h1>{kop}</h1>
        <FoutBericht fout={leerplan.stand.fout} onOpnieuw={leerplan.opnieuw} />
      </div>
    );
  }
  return (
    <LeerplandoelenInhoud
      leerplan={leerplan.stand.waarde}
      index={index.status === 'klaar' ? index.waarde : undefined}
      filter={filter}
      onLeeftijd={kiesLeeftijd}
      onZonder={onZonder}
      rubriekPad={naarRubriek}
      indexFout={foutVan(indexHook)}
      doelPad={doelPad}
    />
  );
}
