// #/basis/lesplan/LP0065: een lesplan van het GO!, letterlijk en volledig, met bovenaan wat je in één blik wil weten.
// Opbouw (docs/basisonderwijs/GO-LEERPLAN.md, "1. Lesplanpagina"):
//   kruimelpad, de letterlijke Heading1 als h1, de onderregel, het bronkader, 'Ga naar', 'In het kort' (afgeleid, met alleen
//   letterlijke stukken en een link naar hun plaats in het lesplan) en daarna de volledige tekst in de volgorde van de bron.
// Dit scherm laadt lui (BasisDeel). Het leerplan van het vak komt er pas na het lesplan bij, voor de chips met de
// minimumdoelen; de tekst van een minimumdoel zelf staat hier nooit, die staat op de doelpagina.
// ?stap=3 springt naar de derde stap van de leskern: de focus gaat naar de kop van die stap.

import { useEffect, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MOMENT_KORT } from '../../components/basis/DoelRij';
import { GoBronvermelding } from '../../components/basis/go/GoBronvermelding';
import { GoBlok, GoBlokken, GoRegel, GoTekstOptiesProvider, gaNaarId, regelTekst, useGoTekstOpties, wijzerId } from '../../components/basis/go/GoTekst';
import { useGoIndex, useGoLeerplan, useGoLesplan } from '../../components/basis/useGo';
import { ZekerheidBadge } from '../../components/basis/ZekerheidBadge';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { lessenlijnen } from '../../lib/basis/go/goModel';
import {
  EINDMOMENT_VAN_GO_MOMENT,
  GO_LEESBRIL_ZEKERHEID,
  leerjaarVanLeeftijd,
  leeftijdLabel,
  leeftijdenLabel,
  meestalTekst,
} from '../../lib/basis/go/leeftijden';
import { GO_VOORSTEL_LABEL, type Cel, type GoIndex, type GoLeerplandoel, type GoLesplanBestand, type GoMinimumdoelRef, type GoTwijfel, type Regel, type Wijzer } from '../../lib/basis/go/types';
import { isZonderMinimumdoel } from '../../lib/basis/go/valideer';
import { vakVanDoelcode } from '../../lib/basis/go/goModel';
import '../../styles/basis-lesplan.css';

// ── Pure hulpfuncties (getest in goComponenten.test.ts) ──────────────────────

/** Het adres van een leerplandoel als de code bestaat in de index (vak bekend en nummer binnen het aantal), anders undefined. */
export function maakDoelLink(index: GoIndex | undefined): ((code: string) => string | undefined) | undefined {
  if (!index) return undefined;
  const aantal = new Map(index.leerplan.map((l) => [l.vak as string, l.aantal]));
  return (code) => {
    const vak = vakVanDoelcode(code);
    const max = vak ? aantal.get(vak) : undefined;
    const nr = Number(code.slice(3));
    return vak && max !== undefined && nr >= 1 && nr <= max ? basisPad({ s: 'leerplandoel', code }) : undefined;
  };
}

/** De cel die een wijzer aanwijst (deel, blok, rij en kolom); undefined als de wijzer geen cel aanwijst. */
export function celVanWijzer(lesplan: GoLesplanBestand, w: Wijzer): Cel | undefined {
  const blok = lesplan.delen[w.deel]?.blokken[w.blok];
  if (blok?.soort !== 'tabel' || w.rij === undefined || w.kolom === undefined) return undefined;
  return blok.rijen[w.rij]?.[w.kolom];
}

/** Het aantal regels van een blok: de items van een lijst, anders 1; 0 als de wijzer niets aanwijst. */
export function aantalRegels(lesplan: GoLesplanBestand, w: Wijzer): number {
  const blok = lesplan.delen[w.deel]?.blokken[w.blok];
  if (!blok) return 0;
  return blok.soort === 'lijst' ? blok.items.length : 1;
}

/**
 * De tekst uit de kolom Wat? van een stap, zonder de kop van de stap zelf ('1. Verkennen'): alleen de alinea's, letterlijk.
 * Staat er geen kop in de cel, dan alle alinea's.
 */
export function stapWat(lesplan: GoLesplanBestand, wat: Wijzer, nr: number): Regel[] {
  const cel = celVanWijzer(lesplan, wat);
  if (!cel) return [];
  const alineas = cel.blokken.flatMap((b) => (b.soort === 'alinea' ? [b.tekst] : []));
  const eerste = alineas[0];
  return eerste && regelTekst(eerste).trimStart().startsWith(`${nr}.`) ? alineas.slice(1) : alineas;
}

const TWIJFEL_TEKST: Readonly<Record<GoTwijfel, string>> = {
  'moment-buiten-leeftijden': 'let op: dit moment past niet bij de leeftijden van het doel',
  'ander-vak': 'let op: dit nummer hoort bij een ander vak',
};

/** De korte naam van de onderdelen in 'Ga naar'. De naam zonder cijfer uit de kop is de terugval. */
const GA_NAAR: Readonly<Record<number, string>> = {
  1: 'Wat moet de leraar weten',
  2: 'Doelen',
  3: 'Samenhang',
  4: 'Lesopbouw',
  5: 'Trainen',
  6: 'Materiaal',
  7: 'Bijlagen',
};

/** De ankers van 'Ga naar': één per deel vanaf 1, met de id van de kop. */
export function gaNaarLijst(lesplan: GoLesplanBestand): { nr: number; label: string; id: string }[] {
  return lesplan.delen
    .filter((d) => d.nr >= 1)
    .map((d) => {
      const kop = d.blokken[0];
      const uitKop = kop?.soort === 'kop' ? regelTekst(kop.tekst).replace(/^\s*\d+\.\s*/, '').trim() : `Deel ${d.nr}`;
      return { nr: d.nr, label: GA_NAAR[d.nr] ?? uitKop, id: wijzerId({ deel: d.nr, blok: 0 }) };
    });
}

// ── Koppelingen met de minimumdoelen ────────────────────────────────────────

export type Koppelingen =
  | { status: 'laden' }
  | { status: 'fout'; fout: string; opnieuw: () => void }
  | { status: 'klaar'; perCode: ReadonlyMap<string, GoLeerplandoel> };

function RefChip({ r }: { r: GoMinimumdoelRef }) {
  return (
    <>
      <Link to={basisPad({ s: 'doel', setId: r.set, doelId: r.id })} className="b-lp-chip">
        {MOMENT_KORT[EINDMOMENT_VAN_GO_MOMENT[r.moment]]} {r.code}
      </Link>
      {r.status === 'voorstel' && (
        <span className="badge badge-warn">
          {GO_VOORSTEL_LABEL}
          {r.bronCode ? ` (in de bron staat "${r.bronCode}")` : ''}
        </span>
      )}
      {r.twijfel?.map((t) => (
        <span key={t} className="b-lp-twijfel">{TWIJFEL_TEKST[t]}</span>
      ))}
    </>
  );
}

/** De minimumdoelen van één leerplandoel als chips, of de zin waarom er geen zijn; null als we het niet kunnen weten. */
export function Minimumdoelen({ doel }: { doel: GoLeerplandoel }) {
  const viaMia = doel.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? i.koppeling.refs : []));
  const problemen = doel.minimumdoelen.problemen.filter((p) => !doel.minimumdoelen.refs.some((r) => r.bronCode === p.bronCode));
  return (
    <div className="b-lp-minimum">
      <span className="b-lp-minimum-kop">Minimumdoelen: </span>
      {doel.minimumdoelen.refs.length > 0 && (
        <ul className="b-lp-chips">
          {doel.minimumdoelen.refs.map((r) => (
            <li key={`${r.set}-${r.id}`}><RefChip r={r} /></li>
          ))}
        </ul>
      )}
      {doel.minimumdoelen.refs.length === 0 && viaMia.length > 0 && (
        <>
          <span>alleen een onderdeel van dit doel is gekoppeld: </span>
          <ul className="b-lp-chips">
            {viaMia.map((r) => (
              <li key={`${r.set}-${r.id}`}><RefChip r={r} /></li>
            ))}
          </ul>
        </>
      )}
      {problemen.map((p) => (
        <span key={`${p.moment}-${p.bronCode}`} className="b-lp-twijfel">
          {p.reden === 'onleesbaar' ? `"${p.bronCode}" is geen geldig nummer` : `"${p.bronCode}" bestaat niet in de officiële minimumdoelen`}
        </span>
      ))}
      {isZonderMinimumdoel(doel) && <span>zonder minimumdoel (het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel)</span>}
    </div>
  );
}

// ── In het kort ──────────────────────────────────────────────────────────────

/** Een link naar een plek in het lesplan zelf: zet de focus daar, zonder van adres te veranderen. */
function NaarPlek({ code, ids, children }: { code: string; ids: string[]; children: ReactNode }) {
  return (
    <Link
      to={basisPad({ s: 'lesplan', code })}
      className="b-lp-naarplek"
      onClick={(e) => {
        e.preventDefault();
        gaNaarId(...ids);
      }}
    >
      {children}
    </Link>
  );
}

function plekIds(w: Wijzer): string[] {
  const ids = [wijzerId(w)];
  if (w.item !== undefined) ids.push(wijzerId({ ...w, item: undefined }));
  if (w.regel !== undefined) ids.push(wijzerId({ ...w, regel: undefined, item: undefined }));
  return ids;
}

function InHetKort({ lesplan, koppelingen }: { lesplan: GoLesplanBestand; koppelingen: Koppelingen }) {
  const a = lesplan.afgeleid;
  const code = lesplan.code;
  const materiaal = aantalRegels(lesplan, a.materiaal);
  return (
    <section className="b-lp-kort" aria-labelledby="lp-kort-kop">
      <h2 id="lp-kort-kop">In het kort</h2>

      <h3>Leerplandoelen</h3>
      {koppelingen.status === 'laden' && <LaadBericht tekst="De minimumdoelen worden geladen" melden={false} />}
      {koppelingen.status === 'fout' && <FoutBericht fout={koppelingen.fout} onOpnieuw={koppelingen.opnieuw} />}
      <ul className="b-lp-lijst">
        {a.leerplandoelen.map((d) => {
          const doel = koppelingen.status === 'klaar' && vakVanDoelcode(d.code) === a.vak ? koppelingen.perCode.get(d.code) : undefined;
          return (
            <li key={d.code} className="b-lp-doel">
              <p>
                <strong className="b-lp-code">{d.code}</strong>{' '}
                <span className="b-lp-kv"><span className="sr-only">Kennisverwerking: </span>{d.kennisverwerking}</span>{' '}
                {d.tekst} <span className="b-lp-leeftijden">({leeftijdenLabel(d.leeftijden)})</span>
              </p>
              <p className="b-lp-links">
                <DoelLink code={d.code} />
                <NaarPlek code={code} ids={plekIds(d.waar)}>
                  In het lesplan<span className="sr-only"> bij {d.code}</span>
                </NaarPlek>
              </p>
              {doel && <Minimumdoelen doel={doel} />}
            </li>
          );
        })}
      </ul>

      {a.diplomas.length > 0 && (
        <>
          <h3>Ik-doelen per diploma</h3>
          <ul className="b-lp-lijst">
            {a.diplomas.map((dip) => (
              <li key={`${dip.naam}-${dip.leeftijd}`} className="b-lp-doel">
                <p>
                  <strong>{dip.naam}</strong> <span className="b-lp-leeftijden">({leeftijdLabel(dip.leeftijd)})</span>{' '}
                  <NaarPlek code={code} ids={plekIds(dip.waar)}>
                    In het lesplan<span className="sr-only"> bij het diploma {dip.naam}</span>
                  </NaarPlek>
                </p>
                <ul className="b-lp-ik">
                  {dip.ikDoelen.map((ik) => (
                    <li key={ik.code}>
                      <strong className="b-lp-code">{ik.code}</strong> {ik.zinnen.join(' ')}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {a.stappen.length > 0 && (
        <>
          <h3>Lesverloop</h3>
          <ol className="b-lp-lijst b-lp-stappen">
            {a.stappen.map((s) => {
              const wat = stapWat(lesplan, s.wat, s.nr);
              return (
                <li key={s.nr}>
                  <NaarPlek code={code} ids={[wijzerId({ ...s.wat, regel: 0 }), wijzerId(s.wat)]}>
                    {s.nr}. {s.naam}
                  </NaarPlek>
                  {wat.length > 0 && (
                    <span className="b-lp-wat">
                      {wat.map((r, n) => (
                        <span key={n}>
                          {' '}
                          <GoRegel regel={r} />
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {materiaal > 0 && (
        <>
          <h3>Materiaal</h3>
          <p>
            <NaarPlek code={code} ids={plekIds(a.materiaal)}>
              Het materiaal bij dit lesplan
            </NaarPlek>{' '}
            <span className="b-lp-leeftijden">({materiaal} {materiaal === 1 ? 'regel' : 'regels'})</span>
          </p>
        </>
      )}
    </section>
  );
}

/** Een link naar de leerplandoelpagina, alleen als de code bestaat (anders niets). */
function DoelLink({ code }: { code: string }) {
  const naar = useGoTekstOpties().doelLink?.(code);
  return naar ? (
    <Link to={naar} className="b-lp-naarplek">
      Het leerplandoel<span className="sr-only"> {code}</span>
    </Link>
  ) : null;
}

// ── De pagina ────────────────────────────────────────────────────────────────

function Kruimel({ lesplan, index }: { lesplan: GoLesplanBestand; index: GoIndex | undefined }) {
  const a = lesplan.afgeleid;
  const leerjaar = leerjaarVanLeeftijd(lesplan.leeftijd);
  const lijn = index ? lessenlijnen(index, { vak: a.vak }).find((l) => l.naam === a.lessenlijn) : undefined;
  return (
    <nav className="b-kruimel" aria-label="Kruimelpad">
      <ol>
        <li><Link to={basisPad({ s: 'lesplannen' })}>Lesplannen</Link></li>
        <li><Link to={basisPad({ s: 'lesplannen', leerjaar })}>{leeftijdLabel(lesplan.leeftijd)}</Link></li>
        <li><Link to={basisPad({ s: 'lesplannen', leerjaar, vak: a.vak })}>{a.vakdiscipline}</Link></li>
        <li>
          {lijn ? <Link to={basisPad({ s: 'lessenlijn', vak: a.vak, lijn: lijn.slug, leerjaar })}>{a.lessenlijn}</Link> : a.lessenlijn}
        </li>
        <li><span aria-current="page">{lesplan.code}</span></li>
      </ol>
    </nav>
  );
}

/** De pagina voor een geladen lesplan, zonder zelf iets te laden: de index (voor links) en de koppelingen komen van buiten. */
export function LesplanInhoud({ lesplan, index, koppelingen }: { lesplan: GoLesplanBestand; index?: GoIndex; koppelingen: Koppelingen }) {
  const a = lesplan.afgeleid;
  const doelLink = useMemo(() => maakDoelLink(index), [index]);
  const opties = useMemo(() => ({ doelLink }), [doelLink]);
  const kop = lesplan.delen[0]?.blokken[0];
  const meta = lesplan.delen[0]?.blokken.slice(1) ?? [];
  const ganaar = gaNaarLijst(lesplan);
  const bron = lesplan.bron;
  return (
    <GoTekstOptiesProvider opties={opties}>
        <div className="b-lesplan">
          <Kruimel lesplan={lesplan} index={index} />
          <h1 className="b-lp-h1" id={wijzerId({ deel: 0, blok: 0 })}>
            {kop?.soort === 'kop' ? <GoRegel regel={kop.tekst} /> : `Lesplan ${lesplan.code} ${lesplan.titel} (${leeftijdLabel(lesplan.leeftijd)})`}
          </h1>
          <p className="b-onderregel">
            {a.vakdiscipline} · {a.lessenlijn} › {a.lessenreeks} · {leeftijdLabel(lesplan.leeftijd)} ({meestalTekst(lesplan.leeftijd)}){' '}
            <ZekerheidBadge zekerheid={GO_LEESBRIL_ZEKERHEID} />
          </p>
          <GoBronvermelding soort="lesplan" code={lesplan.code} url={bron.url} ingelezen={bron.ingelezen} />

          <nav className="b-lp-ganaar" aria-label="Ga naar">
            <ul>
              {ganaar.map((g) => (
                <li key={g.nr}>
                  <Link
                    to={basisPad({ s: 'lesplan', code: lesplan.code })}
                    onClick={(e) => {
                      e.preventDefault();
                      gaNaarId(g.id);
                    }}
                  >
                    {g.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <InHetKort lesplan={lesplan} koppelingen={koppelingen} />

          <div className="b-lp-tekst">
            {meta.length > 0 && (
              <div className="b-lp-meta">
                {meta.map((b, n) => (
                  <GoBlok key={n} blok={b} pad={{ deel: 0, blok: n + 1 }} />
                ))}
              </div>
            )}
            {lesplan.delen.slice(1).map((d) => (
              <section key={d.nr} className="b-lp-deel" aria-labelledby={wijzerId({ deel: d.nr, blok: 0 })}>
                <GoBlokken blokken={d.blokken} deel={d.nr} />
              </section>
            ))}
          </div>
        </div>
    </GoTekstOptiesProvider>
  );
}

/** Laadt het leerplan van het vak van het lesplan, voor de chips met minimumdoelen; het lesplan zelf staat er al. */
function LesplanPagina({ lesplan, stap }: { lesplan: GoLesplanBestand; stap?: number }) {
  const index = useGoIndex().stand;
  const leerplan = useGoLeerplan(lesplan.afgeleid.vak);

  const koppelingen = useMemo<Koppelingen>(() => {
    if (leerplan.stand.status === 'laden') return { status: 'laden' };
    if (leerplan.stand.status === 'fout') return { status: 'fout', fout: leerplan.stand.fout, opnieuw: leerplan.opnieuw };
    return { status: 'klaar', perCode: new Map(leerplan.stand.waarde.doelen.map((d) => [d.code, d])) };
  }, [leerplan]);

  useEffect(() => {
    if (stap === undefined) return;
    const s = lesplan.afgeleid.stappen.find((x) => x.nr === stap);
    if (s) gaNaarId(wijzerId({ ...s.wat, regel: 0 }), wijzerId(s.wat));
  }, [lesplan, stap]);

  return <LesplanInhoud lesplan={lesplan} index={index.status === 'klaar' ? index.waarde : undefined} koppelingen={koppelingen} />;
}

function NietGevonden({ code }: { code: string }) {
  return (
    <section className="b-plaats">
      <h1>Dit lesplan vonden we niet</h1>
      <p>Er is geen lesplan van het GO! met de code {code} in Boosterz.</p>
      <ul className="b-plaats-links">
        <li><Link to={basisPad({ s: 'lesplannen' })}>Alle lesplannen</Link></li>
        <li><Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link></li>
      </ul>
    </section>
  );
}

export function LesplanScherm({ code, stap }: { code: string; stap?: number }) {
  const { stand, opnieuw } = useGoLesplan(code);
  if (stand.status === 'laden') {
    return (
      <div className="b-lesplan">
        <h1 className="b-lp-h1">Lesplan {code}</h1>
        <LaadBericht tekst="Het lesplan wordt geladen" />
      </div>
    );
  }
  if (stand.status === 'fout') {
    if (/bestaat niet/.test(stand.fout)) return <NietGevonden code={code} />;
    return (
      <div className="b-lesplan">
        <h1 className="b-lp-h1">Lesplan {code}</h1>
        <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />
      </div>
    );
  }
  return <LesplanPagina lesplan={stand.waarde} stap={stap} />;
}
