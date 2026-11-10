// De koppeling van een leerplandoel van het GO! aan de minimumdoelen van de overheid, in haar standen (docs/basisonderwijs/
// GO-LEERPLAN.md, "Vijf standen en hoe ze zichtbaar zijn"):
//  - officieel: 'volgens het leerplan van het GO!', met het moment, het nummer en de volledige tekst van het minimumdoel;
//  - officieel met twijfel: dezelfde weergave, met onder 'Hoe zeker is dit?' wat er niet past;
//  - voorstel: alleen voor een kapot nummer (nu MV.040 '6.12'), met de badge 'voorstel, nog niet bevestigd door het GO!';
//  - kapot, zonder voorstel: geen link, wel de zin dat dat nummer niet bestaat of geen geldig nummer is;
//  - zonder minimumdoel: alleen als noch de doelzin, noch een onderdeel van het doel een nummer heeft;
//  - via een onderdeel: een MIA of voorbeeld van het doel is gekoppeld, de doelzin zelf niet.
// De tekst van een minimumdoel komt altijd uit de officiële gegevens (laadSet), nooit uit de Excel van het GO!. Een
// verwijzing naar een doel dat er niet meer staat, krijgt een rustige zin, geen fout.

import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { basisPad } from '../../../lib/basis/basisRoutes';
import { doelenVanSet, type DoelBasis } from '../../../lib/basis/doelBasis';
import { EINDMOMENT_VAN_GO_MOMENT, leeftijdenLabel } from '../../../lib/basis/go/leeftijden';
import {
  GO_VOORSTEL_LABEL,
  type GoKoppeling,
  type GoLeerplandoel,
  type GoMinimumdoelRef,
  type GoMoment,
  type GoTwijfel,
} from '../../../lib/basis/go/types';
import { isZonderMinimumdoel } from '../../../lib/basis/go/goModel';
import { INVOERINGSKALENDER, type Eindmoment } from '../../../lib/basis/kalender';
import { basisSet } from '../../../lib/basis/moment';
import { FoutBericht, LaadBericht } from '../../curriculum/LaadStatus';
import { useSetBestanden } from '../../curriculum/samenstellen/useSetBestanden';
import { VolledigeDoeltekst } from '../DoelKaart';
import { MOMENT_KORT } from '../DoelRij';
import { useBasisIndex } from '../useBasisSets';
import '../../../styles/basis-go.css';

// ── De teksten van de minimumdoelen ─────────────────────────────────────────

/** Wat een scherm weet over de minimumdoelen waar een leerplandoel naar verwijst. */
export type MinimumdoelTeksten =
  | { status: 'laden' }
  | { status: 'fout'; fout: string; opnieuw: () => void }
  /** `vind`: het doel uit de officiële gegevens; undefined als het er niet (meer) in staat. */
  | { status: 'klaar'; vind: (r: { set: string; id: string }) => DoelBasis | undefined };

/** Alle verwijzingen van een leerplandoel: de doelzin en elk onderdeel dat een eigen koppeling heeft. */
export function koppelingenVan(doel: GoLeerplandoel): GoKoppeling[] {
  return [doel.minimumdoelen, ...doel.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? [i.koppeling] : []))];
}

/**
 * Laadt de officiële sets van deze verwijzingen en geeft de teksten terug. Een set die niet meer in de index staat, wordt
 * niet gevraagd: het doel erin telt dan als 'niet meer in de officiële gegevens'.
 */
export function useMinimumdoelTeksten(refs: readonly { set: string }[]): MinimumdoelTeksten {
  const index = useBasisIndex();
  const alle = index.stand.status === 'klaar' ? index.stand.waarde.sets : undefined;
  const sleutel = [...new Set(refs.map((r) => r.set))].sort().join('|');
  const ids = useMemo(() => {
    if (!alle) return [];
    const bestaand = new Set(alle.map((s) => s.id));
    return sleutel === '' ? [] : sleutel.split('|').filter((id) => bestaand.has(id));
  }, [alle, sleutel]);
  const { stand, bestanden, opnieuw } = useSetBestanden(ids);

  const perSet = useMemo(() => {
    const uit = new Map<string, Map<string, DoelBasis>>();
    for (const [id, bestand] of bestanden) {
      const kop = alle?.find((s) => s.id === id);
      const info = kop ? basisSet(kop) : undefined;
      uit.set(id, new Map(info ? doelenVanSet(bestand, info).map((d) => [d.id, d] as const) : []));
    }
    return uit;
  }, [bestanden, alle]);

  if (index.stand.status === 'fout') return { status: 'fout', fout: index.stand.fout, opnieuw: index.opnieuw };
  if (!alle) return { status: 'laden' };
  const fout = ids.map((id) => ({ id, stand: stand(id) })).find((x) => x.stand.status === 'fout');
  if (fout && fout.stand.status === 'fout') return { status: 'fout', fout: fout.stand.fout, opnieuw: () => opnieuw(fout.id) };
  if (ids.some((id) => stand(id).status !== 'klaar')) return { status: 'laden' };
  return { status: 'klaar', vind: (r) => perSet.get(r.set)?.get(r.id) };
}

// ── Teksten ─────────────────────────────────────────────────────────────────

const EINDE_ZIN: Readonly<Record<Eindmoment, string>> = {
  K3: 'het einde van de kleuterklas',
  L4: 'het einde van het 4de leerjaar',
  L6: 'het einde van het 6de leerjaar',
};

/** 'Einde kleuter': het moment van een koppeling. */
export function momentKort(m: GoMoment): string {
  return MOMENT_KORT[EINDMOMENT_VAN_GO_MOMENT[m]];
}

/** De reden van een kapot nummer, als zin: 'Dat is geen geldig nummer' of 'Dat nummer bestaat niet in de officiële minimumdoelen'. */
export function redenZin(reden: 'bestaat-niet' | 'onleesbaar'): string {
  return reden === 'onleesbaar' ? 'Dat is geen geldig nummer' : 'Dat nummer bestaat niet in de officiële minimumdoelen';
}

/** De zin onder 'Hoe zeker is dit?' bij een twijfel; `naamVak` is het vak van het minimumdoel als dat geladen is. */
export function twijfelZin(t: GoTwijfel, r: GoMinimumdoelRef, doel: Pick<GoLeerplandoel, 'code' | 'leeftijden'>, naamVak?: string): string {
  if (t === 'moment-buiten-leeftijden') {
    return `Dit leerplandoel is voor ${leeftijdenLabel(doel.leeftijden)}, maar het leerplan van het GO! koppelt het aan minimumdoel ${r.code}, een doel voor ${EINDE_ZIN[EINDMOMENT_VAN_GO_MOMENT[r.moment]]}. Zo staat het in het leerplan.`;
  }
  return `Het leerplan koppelt ${doel.code} aan minimumdoel ${r.code}, een doel van een ander vak${naamVak ? ` (${naamVak})` : ''} dan dat van dit leerplandoel.`;
}

/** Waar de twijfel over gaat, in een paar woorden: voor in een lijst of een lesplan, naast de chip met die twijfel. */
export const TWIJFEL_KORT: Readonly<Record<GoTwijfel, string>> = {
  'moment-buiten-leeftijden': 'let op: dit moment past niet bij de leeftijd van dit leerplandoel',
  'ander-vak': 'let op: dit minimumdoel hoort bij een ander vak',
};

const vakNaam = (d: DoelBasis | undefined) => (d ? INVOERINGSKALENDER.vakken.find((v) => v.nr === d.vak)?.naam : undefined);
/** Eén verwijzing is één minimumdoel op één moment: het leerplan kan hetzelfde doel bij een onderdeel herhalen. */
const refSleutel = (r: { set: string; id: string; moment: string }) => `${r.set}-${r.id}-${r.moment}`;
/** De verwijzingen zonder dubbels, in de volgorde van de bron; `al` is wat al getoond is. */
function uniek(refs: readonly GoMinimumdoelRef[], al: ReadonlySet<string> = new Set()): GoMinimumdoelRef[] {
  const gezien = new Set(al);
  return refs.filter((r) => {
    const s = refSleutel(r);
    if (gezien.has(s)) return false;
    gezien.add(s);
    return true;
  });
}
/** Het adres van de doelpagina van een koppeling; scherm en lijst geven er desnoods een andere functie voor (zie useDoelPad). */
export type DoelPadFn = (r: { set: string; id: string }) => string;
const GEWOON_DOELPAD: DoelPadFn = (r) => basisPad({ s: 'doel', setId: r.set, doelId: r.id });
/** Het onderdeel waar een koppeling bij hoort, zoals het in een zin staat: 'MIA “Aftrekken:”' of 'voorbeeld “…”'. */
const onderdeelNaam = (i: { soort: string; tekst: string }) => `${i.soort === 'mia-titel' || i.soort === 'mia' ? 'MIA' : 'voorbeeld'} “${i.tekst.trim()}”`;

// ── Een minimumdoel als kaart ───────────────────────────────────────────────

function Voorstel({ r, doel }: { r: GoMinimumdoelRef; doel: GoLeerplandoel }) {
  const reden = [doel.minimumdoelen, ...koppelingenVan(doel)]
    .flatMap((k) => k.problemen)
    .find((p) => p.moment === r.moment && p.bronCode === r.bronCode)?.reden;
  return (
    <p className="b-go-voorstel">
      In het leerplan staat “{r.bronCode}”. {reden ? `${redenZin(reden)}; ` : ''}waarschijnlijk is {r.code} bedoeld.
    </p>
  );
}

function RefKaart({ r, doel, teksten, doelPad }: { r: GoMinimumdoelRef; doel: GoLeerplandoel; teksten: MinimumdoelTeksten; doelPad: DoelPadFn }) {
  const gevonden = teksten.status === 'klaar' ? teksten.vind(r) : undefined;
  return (
    <li className="b-go-ref">
      <p className="b-go-ref-kop">
        <span className="b-go-ref-moment">{momentKort(r.moment)}</span>
        <Link to={doelPad(r)} className="b-go-ref-link">
          Minimumdoel {r.code}
        </Link>
        {r.status === 'voorstel' && <span className="badge badge-warn">{GO_VOORSTEL_LABEL}</span>}
      </p>
      {r.status === 'voorstel' && <Voorstel r={r} doel={doel} />}
      {gevonden ? (
        <VolledigeDoeltekst doel={gevonden} className="b-go-minimumtekst" />
      ) : teksten.status === 'klaar' ? (
        <p className="b-noot">Dit minimumdoel staat niet meer in de officiële gegevens.</p>
      ) : teksten.status === 'laden' ? (
        <LaadBericht tekst={`Minimumdoel ${r.code} wordt geladen`} melden={false} />
      ) : null}
    </li>
  );
}

function Refs({ refs, doel, teksten, doelPad }: { refs: readonly GoMinimumdoelRef[]; doel: GoLeerplandoel; teksten: MinimumdoelTeksten; doelPad: DoelPadFn }) {
  if (refs.length === 0) return null;
  return (
    <ul className="b-go-refs">
      {refs.map((r) => (
        <RefKaart key={refSleutel(r)} r={r} doel={doel} teksten={teksten} doelPad={doelPad} />
      ))}
    </ul>
  );
}

/** De nummers uit de bron die niet gelukt zijn en geen voorstel kregen: geen link, wel een zin. */
function Problemen({ k, refs }: { k: GoKoppeling; refs: readonly GoMinimumdoelRef[] }) {
  const open = k.problemen.filter((p) => !refs.some((r) => r.status === 'voorstel' && r.moment === p.moment && r.bronCode === p.bronCode));
  if (open.length === 0) return null;
  return (
    <ul className="b-go-problemen">
      {open.map((p) => (
        <li key={`${p.moment}-${p.bronCode}`} className="b-noot">
          In het leerplan staat ook “{p.bronCode}” bij {momentKort(p.moment).toLowerCase()}. {redenZin(p.reden)}.
        </li>
      ))}
    </ul>
  );
}

/** De bron letterlijk: 'KO 3.1.3, 3.1.4'. */
function bronTekst(k: GoKoppeling): string {
  return (['KO', 'L4', 'L6'] as const)
    .filter((m) => k.bron[m] !== undefined)
    .map((m) => `${m} ${k.bron[m]}`)
    .join(' · ');
}

// ── De lijst ────────────────────────────────────────────────────────────────

export interface KoppelingLijstProps {
  doel: GoLeerplandoel;
  teksten: MinimumdoelTeksten;
  /** Het adres van een minimumdoel; standaard de gewone set van de koppeling. */
  doelPad?: DoelPadFn;
}

/**
 * Het deel 'Minimumdoelen' van de leerplandoelpagina (h2). Het geeft altijd een antwoord: de koppeling, een kapot nummer,
 * of dat het leerplan het doel aan geen enkel minimumdoel koppelt.
 */
export function KoppelingLijst({ doel, teksten, doelPad = GEWOON_DOELPAD }: KoppelingLijstProps) {
  const k = doel.minimumdoelen;
  const viaOnderdeel = doel.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? [{ i, k: i.koppeling }] : []));
  const bronnen: { wie?: string; tekst: string }[] = [
    ...(bronTekst(k) ? [{ tekst: bronTekst(k) }] : []),
    ...viaOnderdeel.flatMap(({ i, k: kk }) => (bronTekst(kk) ? [{ wie: onderdeelNaam(i), tekst: bronTekst(kk) }] : [])),
  ];
  const refsEerst = uniek(k.refs);
  // Een minimumdoel dat de doelzin al toont, krijgt bij een onderdeel geen tweede kaart maar één korte regel.
  const getoond = new Set(refsEerst.map(refSleutel));
  const perOnderdeel = viaOnderdeel.map(({ i, k: kk }) => {
    const nieuw = uniek(kk.refs, getoond);
    const herhaald = uniek(kk.refs).filter((r) => getoond.has(refSleutel(r)));
    nieuw.forEach((r) => getoond.add(refSleutel(r)));
    return { i, k: kk, nieuw, herhaald };
  });
  const twijfelSleutels = new Set<string>();
  const twijfels = [k.refs, ...viaOnderdeel.map((v) => v.k.refs)]
    .flat()
    .flatMap((r) => (r.twijfel ?? []).map((t) => ({ r, t })))
    .filter(({ r, t }) => {
      const s = `${refSleutel(r)}-${t}`;
      if (twijfelSleutels.has(s)) return false;
      twijfelSleutels.add(s);
      return true;
    });

  return (
    <section className="b-go-deel" aria-labelledby="b-go-mind-kop">
      <h2 id="b-go-mind-kop">Minimumdoelen</h2>
      {isZonderMinimumdoel(doel) ? (
        <p className="b-go-zonder">Het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel.</p>
      ) : (
        <>
          {k.refs.length > 0 && <p className="b-lead">Volgens het leerplan van het GO! hoort dit leerplandoel bij:</p>}
          {teksten.status === 'fout' && <FoutBericht fout={teksten.fout} onOpnieuw={teksten.opnieuw} />}
          <Refs refs={refsEerst} doel={doel} teksten={teksten} doelPad={doelPad} />
          <Problemen k={k} refs={k.refs} />
          {perOnderdeel.map(({ i, k: kk, nieuw, herhaald }) =>
            kk.refs.length > 0 || kk.problemen.length > 0 ? (
              <div key={i.rij} className="b-go-via">
                {nieuw.length > 0 && (
                  <p className="b-lead">
                    Het leerplan koppelt een onderdeel van dit doel ({onderdeelNaam(i)}) aan:
                  </p>
                )}
                <Refs refs={nieuw} doel={doel} teksten={teksten} doelPad={doelPad} />
                {herhaald.length > 0 && (
                  <p className="b-noot">
                    Het leerplan koppelt ook een onderdeel van dit doel ({onderdeelNaam(i)}) aan minimumdoel{' '}
                    {herhaald.map((r) => r.code).join(', ')}, hierboven.
                  </p>
                )}
                <Problemen k={kk} refs={kk.refs} />
              </div>
            ) : null,
          )}
        </>
      )}
      {bronnen.length > 0 && (
        <details className="b-go-uitleg">
          <summary>Zo staat het in het leerplan</summary>
          <ul>
            {bronnen.map((b) => (
              <li key={`${b.wie ?? ''}${b.tekst}`}>
                {b.wie ? `${b.wie}: ` : ''}
                {b.tekst}
              </li>
            ))}
          </ul>
        </details>
      )}
      {twijfels.length > 0 && (
        <details className="b-go-uitleg">
          <summary>Hoe zeker is dit?</summary>
          <ul>
            {twijfels.map(({ r, t }) => {
              const gevonden = teksten.status === 'klaar' ? teksten.vind(r) : undefined;
              return <li key={`${refSleutel(r)}-${t}`}>{twijfelZin(t, r, doel, vakNaam(gevonden))}</li>;
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

// ── Compact: voor een lijst van doelen ──────────────────────────────────────

function Chip({ r, doelPad }: { r: GoMinimumdoelRef; doelPad: DoelPadFn }): ReactNode {
  return (
    <li>
      <Link to={doelPad(r)} className="b-go-chip">
        {momentKort(r.moment)} {r.code}
        <span className="sr-only"> (minimumdoel)</span>
      </Link>
      {r.status === 'voorstel' && <span className="badge badge-warn">{GO_VOORSTEL_LABEL}</span>}
      {/* De twijfel staat bij de chip waar ze over gaat: lijst en lesplan tonen allebei welke chip er niet past. */}
      {(r.twijfel ?? []).map((t) => (
        <span key={t} className="b-noot">
          {TWIJFEL_KORT[t]}
        </span>
      ))}
    </li>
  );
}

/**
 * De koppeling van één leerplandoel in een paar woorden, voor in een lijst of een lesplan: chips die naar de doelpagina
 * leiden, een kapot nummer als tekst, of de zin dat er geen minimumdoel is. Zonder gegevens van de minimumdoelen te laden.
 * `doelPad` komt van het scherm (useDoelPad, één keer per scherm); zonder gaat elke chip naar de gewone set.
 */
export function KoppelingChips({ doel, doelPad = GEWOON_DOELPAD }: { doel: GoLeerplandoel; doelPad?: DoelPadFn }) {
  const k = doel.minimumdoelen;
  const via = doel.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? [{ i, k: i.koppeling }] : []));
  const eerst = uniek(k.refs);
  // Een onderdeel dat hetzelfde minimumdoel nogmaals noemt, geeft geen tweede chip.
  const viaRefs = uniek(via.flatMap((v) => v.k.refs), new Set(eerst.map(refSleutel)));
  const problemen = [k, ...via.map((v) => v.k)].flatMap((kk) => kk.problemen.filter((p) => !kk.refs.some((r) => r.status === 'voorstel' && r.moment === p.moment && r.bronCode === p.bronCode)));
  const twijfel = [...k.refs, ...viaRefs].some((r) => (r.twijfel ?? []).length > 0);
  return (
    <div className="b-go-koppeling">
      <span className="b-go-koppeling-kop">Minimumdoelen: </span>
      {isZonderMinimumdoel(doel) && <span className="b-noot">het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel</span>}
      {eerst.length > 0 && (
        <ul className="b-go-chips">
          {eerst.map((r) => (
            <Chip key={refSleutel(r)} r={r} doelPad={doelPad} />
          ))}
        </ul>
      )}
      {viaRefs.length > 0 && (
        <>
          <span className="b-noot">{eerst.length > 0 ? 'en via een onderdeel van dit doel: ' : 'via een onderdeel van dit doel: '}</span>
          <ul className="b-go-chips">
            {viaRefs.map((r) => (
              <Chip key={refSleutel(r)} r={r} doelPad={doelPad} />
            ))}
          </ul>
        </>
      )}
      {problemen.map((p) => (
        <span key={`${p.moment}-${p.bronCode}`} className="b-noot">
          {' '}
          “{p.bronCode}” ({momentKort(p.moment).toLowerCase()}): {redenZin(p.reden).toLowerCase()}.
        </span>
      ))}
      {twijfel && <span className="b-noot"> Open het leerplandoel voor wat er niet past.</span>}
    </div>
  );
}
