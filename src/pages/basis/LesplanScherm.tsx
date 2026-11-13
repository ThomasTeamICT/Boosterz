// #/basis/lesplan/LP0065: een lesplan van het GO!, letterlijk en volledig, met bovenaan wat je in één blik wil weten.
// Opbouw (docs/basisonderwijs/GO-LEERPLAN.md, "1. Lesplanpagina"):
//   kruimelpad, de letterlijke Heading1 als h1, de onderregel, het bronkader, 'Ga naar', 'In het kort' (afgeleid, met alleen
//   letterlijke stukken en een link naar hun plaats in het lesplan) en daarna de volledige tekst in de volgorde van de bron.
// Dit scherm laadt lui (BasisDeel). De index vertrekt samen met het lesplan; zodra ze er is, vertrekt ook het leerplan van
// het vak (voor de chips met de minimumdoelen), zonder op het lesplan te wachten. De tekst van een minimumdoel zelf staat
// hier nooit, die staat op de doelpagina. Laadt de index niet, dan zegt 'In het kort' dat (de links ontbreken dan).
// ?stap=3 springt naar de derde stap van de leskern: de focus gaat naar de kop van die stap.

import { useEffect, useLayoutEffect, useMemo, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PrintIcon } from '../../components/icons';
import { KoppelingChips, type DoelPadFn } from '../../components/basis/go/KoppelingLijst';
import { useDoelPad } from '../../components/basis/go/useDoelPad';
import { GoBronvermelding } from '../../components/basis/go/GoBronvermelding';
import { IkZinnen } from '../../components/basis/go/IkZinnen';
import { GoBlok, GoBlokken, GoRegel, GoTekstOptiesProvider, gaNaarId, regelTekst, useGoTekstOpties, wijzerId } from '../../components/basis/go/GoTekst';
import { foutVan, useGoIndex, useGoLeerplan, useGoLesplan, type GoLaadFout, type MetOpnieuw } from '../../components/basis/useGo';
import { useGoAanbod } from '../../components/basis/useAanbod';
import { ZekerheidBadge } from '../../components/basis/ZekerheidBadge';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { isGoNietGevonden, laadGoLeerplan } from '../../lib/basis/go/goBron';
import { lessenlijnen, lesplanVanCode, maakDoelLink, vakVanDoelcode } from '../../lib/basis/go/goModel';
import {
  GO_LEESBRIL_ZEKERHEID,
  leerjaarVanLeeftijd,
  leeftijdLabel,
  leeftijdenLabel,
  meestalTekst,
} from '../../lib/basis/go/leeftijden';
import { dekkingZin, GO_AANBOD_SOORT_LABEL, valideerAanbod, type GoAanbodBestand, type GoAanbodOnderdeel } from '../../lib/basis/go/aanbod';
import { FOUT_AANBOD_GEEN_VERBINDING } from '../../lib/basis/go/aanbodBron';
import { KENNISVERWERKING_ZIN, type Cel, type GoIndex, type GoLeerplandoel, type GoLesplanBestand, type Regel, type Wijzer } from '../../lib/basis/go/types';
import '../../styles/basis-lesplan.css';

// ── Pure hulpfuncties (getest in goComponenten.test.ts) ──────────────────────

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
 * De tekst uit de kolom Wat? van een stap, zonder de kop van de stap zelf ('1. Verkennen'): de alinea's en de items van een
 * lijst, letterlijk, in de volgorde van de cel. Staat er geen kop in de cel, dan alles.
 */
export function stapWat(lesplan: GoLesplanBestand, wat: Wijzer, nr: number): Regel[] {
  const cel = celVanWijzer(lesplan, wat);
  if (!cel) return [];
  const alineas = cel.blokken.flatMap((b) => (b.soort === 'alinea' ? [b.tekst] : b.soort === 'lijst' ? b.items : []));
  const eerste = alineas[0];
  return eerste && regelTekst(eerste).trimStart().startsWith(`${nr}.`) ? alineas.slice(1) : alineas;
}

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

/**
 * Het aanbod in Boosterz bij dit lesplan. 'geen': er is geen aanbod (404) of het laadt nog; dan staat er niets, ook geen
 * kopje. 'fout' met `offline`: we weten niet of er aanbod is; dat staat er rustig, zonder kopje.
 */
export type AanbodStand =
  | { status: 'geen' }
  | { status: 'fout'; fout: string; offline: boolean; opnieuw: () => void }
  | { status: 'klaar'; aanbod: GoAanbodBestand };

// ── In het kort ──────────────────────────────────────────────────────────────

/**
 * Een link naar een plek in het lesplan zelf: zet de focus daar, zonder van adres te veranderen. Met `stap` heeft de link het
 * adres van die stap (?stap=3), zodat 'in een nieuw tabblad openen' en doorsturen werken; `className` komt erbij
 * (b-lp-scherm voor wat op papier een dode link is).
 */
function NaarPlek({ code, ids, stap, className, children }: { code: string; ids: string[]; stap?: number; className?: string; children: ReactNode }) {
  return (
    <Link
      to={basisPad({ s: 'lesplan', code, stap })}
      className={className ? `b-lp-naarplek ${className}` : 'b-lp-naarplek'}
      onClick={(e) => {
        if (!gewoneKlik(e)) return;
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

/**
 * De plekken waar de link naar een diploma landt. Alle diploma's van een lesplan wijzen naar dezelfde cel (Lesdoel); daarin
 * staat de naam van het diploma als eigen alinea, en daar hoort de focus te komen. Zonder treffer valt het terug op de cel.
 * De zoekregel is dezelfde als in valideer.ts: de alinea is het diploma met leeftijd, of eindigt op ': <diploma met leeftijd>'.
 */
export function diplomaIds(lesplan: GoLesplanBestand, dip: GoLesplanBestand['afgeleid']['diplomas'][number]): string[] {
  const kop = `${dip.naam} ${leeftijdLabel(dip.leeftijd)}`;
  const cel = celVanWijzer(lesplan, dip.waar);
  const g = cel?.blokken.findIndex((b) => {
    if (b.soort !== 'alinea') return false;
    const tekst = regelTekst(b.tekst).replace(/\s+/g, ' ').trim();
    return tekst === kop || tekst.endsWith(`: ${kop}`);
  });
  if (g === undefined || g < 0) return plekIds(dip.waar);
  return [wijzerId({ ...dip.waar, regel: g }), wijzerId(dip.waar)];
}

/** Een gewone klik springt binnen de pagina; ctrl, cmd, shift, alt of een andere knop laat de browser de link zelf openen. */
function gewoneKlik(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** `indexFout`: de index laadde niet, dus de links naar de leerplandoelen ontbreken; dat staat er dan, met 'Opnieuw proberen'. */
function InHetKort({ lesplan, koppelingen, indexFout, doelPad, aanbod }: { lesplan: GoLesplanBestand; koppelingen: Koppelingen; indexFout?: GoLaadFout; doelPad?: DoelPadFn; aanbod?: AanbodStand }) {
  const a = lesplan.afgeleid;
  const code = lesplan.code;
  const materiaal = aantalRegels(lesplan, a.materiaal);
  return (
    <section className="b-lp-kort" aria-labelledby="lp-kort-kop">
      <h2 id="lp-kort-kop">In het kort</h2>
      <p className="b-lp-noot">Dit overzicht maakt Boosterz. De zinnen staan letterlijk in het lesplan hieronder; de minimumdoelen komen uit het leerplan van het GO!</p>

      <div className="b-lp-kort-in">
        <div className="b-lp-kort-kolom">
          <h3>Leerplandoelen</h3>
          <p className="b-noot">{KENNISVERWERKING_ZIN}</p>
          {koppelingen.status === 'laden' && <LaadBericht tekst="De minimumdoelen worden geladen" melden={false} />}
          {koppelingen.status === 'fout' && <FoutBericht fout={koppelingen.fout} onOpnieuw={koppelingen.opnieuw} naam="minimumdoelen" />}
          {indexFout && <FoutBericht fout={indexFout.fout} onOpnieuw={indexFout.opnieuw} naam="links naar de leerplandoelen" />}
          <ul className="b-lp-lijst">
            {a.leerplandoelen.map((d) => {
              const doel = koppelingen.status === 'klaar' && vakVanDoelcode(d.code) === a.vak ? koppelingen.perCode.get(d.code) : undefined;
              return (
                <li key={d.code} className="b-lp-doel">
                  <p>
                    <DoelCode code={d.code} />{' '}
                    <span className="b-lp-kv"><span className="sr-only">Kennisverwerking: </span>{d.kennisverwerking}</span>{' '}
                    {d.tekst} <span className="b-lp-leeftijden">({leeftijdenLabel(d.leeftijden)})</span>
                  </p>
                  <div className="b-lp-doelregel">
                    <NaarPlek code={code} ids={plekIds(d.waar)} className="b-lp-scherm">
                      In het lesplan<span className="sr-only"> bij {d.code}</span>
                    </NaarPlek>
                    {doel && <KoppelingChips doel={doel} doelPad={doelPad} />}
                  </div>
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
                      <NaarPlek code={code} ids={diplomaIds(lesplan, dip)} className="b-lp-scherm">
                        In het lesplan<span className="sr-only"> bij het diploma {dip.naam}</span>
                      </NaarPlek>
                    </p>
                    <ul className="b-lp-ik">
                      {dip.ikDoelen.map((ik) => (
                        <li key={ik.code}>
                          <strong className="b-lp-code">{ik.code}</strong>
                          <IkZinnen zinnen={ik.zinnen} className="b-lp-ikzinnen" />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="b-lp-kort-kolom">
          {a.stappen.length > 0 && (
            <>
              <h3>Lesverloop</h3>
              <ol className="b-lp-lijst b-lp-stappen">
                {a.stappen.map((s) => {
                  const wat = stapWat(lesplan, s.wat, s.nr);
                  return (
                    <li key={s.nr}>
                      <NaarPlek code={code} ids={[wijzerId({ ...s.wat, regel: 0 }), wijzerId(s.wat)]} stap={s.nr}>
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
            <div className="b-lp-scherm">
              <h3>Materiaal</h3>
              <p>
                <NaarPlek code={code} ids={plekIds(a.materiaal)}>
                  Het materiaal bij dit lesplan
                </NaarPlek>{' '}
                <span className="b-lp-leeftijden">({materiaal} {materiaal === 1 ? 'punt' : 'punten'})</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {aanbod && <AanbodInHetKort lesplan={lesplan} aanbod={aanbod} />}
    </section>
  );
}

/** Waar een onderdeel bij hoort: de stappen (met hun naam en een link naar de stap), de activiteiten van Trainen en de vastlegging. */
function SteuntOp({ lesplan, onderdeel }: { lesplan: GoLesplanBestand; onderdeel: GoAanbodOnderdeel }) {
  const a = lesplan.afgeleid;
  const delen: ReactNode[] = [];
  for (const nr of onderdeel.steunt.stappen ?? []) {
    const s = a.stappen.find((x) => x.nr === nr);
    delen.push(
      s ? (
        <NaarPlek key={`s${nr}`} code={lesplan.code} ids={[wijzerId({ ...s.wat, regel: 0 }), wijzerId(s.wat)]} stap={nr}>
          stap {nr} ({s.naam})
        </NaarPlek>
      ) : (
        <span key={`s${nr}`}>stap {nr}</span>
      ),
    );
  }
  for (const titel of onderdeel.steunt.trainen ?? []) {
    const t = a.trainen.find((x) => x.titel === titel);
    delen.push(
      t ? (
        <NaarPlek key={`t${titel}`} code={lesplan.code} ids={plekIds(t.vanaf)}>
          de activiteit ‘{titel}’ uit Trainen
        </NaarPlek>
      ) : (
        <span key={`t${titel}`}>de activiteit ‘{titel}’ uit Trainen</span>
      ),
    );
  }
  if (onderdeel.steunt.vastlegging) delen.push(<span key="v">de vastlegging</span>);
  if (delen.length === 0) return null;
  return (
    <p className="b-lp-aanbod-steunt">
      Bij{' '}
      {delen.map((d, i) => (
        <span key={i}>
          {i > 0 && (i === delen.length - 1 ? ' en ' : ', ')}
          {d}
        </span>
      ))}
    </p>
  );
}

/**
 * 'Aanbod in Boosterz' in 'In het kort': de onderdelen in de volgorde van het manifest, met de soort in gewone taal, waar ze
 * bij horen, de doelcodes en bij een bordles een link 'Op het bord'. Daaronder de dekkingszin (wat niet gedekt is, staat er
 * altijd). Is het lesplan veranderd sinds het aanbod gemaakt werd, of verwijst het aanbod naar iets wat er niet (meer) staat,
 * dan staat dat er duidelijk boven.
 */
function AanbodInHetKort({ lesplan, aanbod }: { lesplan: GoLesplanBestand; aanbod: AanbodStand }) {
  const uitkomst = useMemo(() => (aanbod.status === 'klaar' ? valideerAanbod(aanbod.aanbod, lesplan) : undefined), [aanbod, lesplan]);
  if (aanbod.status === 'geen') return null;
  if (aanbod.status === 'fout') {
    return aanbod.offline ? (
      <p className="b-lp-aanbod-stil b-lp-scherm">
        Of er bij dit lesplan aanbod in Boosterz is, konden we niet nagaan: er is geen verbinding.{' '}
        <button type="button" className="b-knop" onClick={aanbod.opnieuw}>
          Opnieuw proberen<span className="sr-only"> (aanbod in Boosterz)</span>
        </button>
      </p>
    ) : (
      <div className="b-lp-scherm">
        <FoutBericht fout={aanbod.fout} onOpnieuw={aanbod.opnieuw} naam="aanbod in Boosterz" />
      </div>
    );
  }
  if (!uitkomst) return null;
  if (uitkomst.fouten.length > 0) console.warn('Boosterz: het aanbod past niet bij het lesplan', uitkomst.fouten.slice(0, 5));
  const totaal = lesplan.afgeleid.leerplandoelen.length;
  return (
    <div className="b-lp-aanbod">
      <h3>Aanbod in Boosterz</h3>
      {uitkomst.naTeKijken && (
        <p className="b-lp-aanbod-let" role="note">
          <strong>Na te kijken:</strong> het lesplan is veranderd sinds dit aanbod gemaakt werd. Kijk na of het nog past.
        </p>
      )}
      {uitkomst.fouten.length > 0 && (
        <p className="b-lp-aanbod-let" role="note">
          <strong>Na te kijken:</strong> een deel van dit aanbod verwijst naar iets wat niet (meer) in dit lesplan staat.
        </p>
      )}
      <ol className="b-lp-lijst b-lp-aanbod-lijst">
        {aanbod.aanbod.onderdelen.map((o) => (
          <li key={o.id} className="b-lp-doel">
            <p>
              <strong className="b-lp-aanbod-titel">{o.titel}</strong>{' '}
              <span className="b-lp-kv">{GO_AANBOD_SOORT_LABEL[o.soort]}</span>
            </p>
            <SteuntOp lesplan={lesplan} onderdeel={o} />
            {o.doelen.length > 0 && (
              <p className="b-lp-aanbod-doelen">
                <span className="sr-only">Leerplandoelen: </span>
                {o.doelen.map((d, i) => (
                  <span key={d}>
                    {i > 0 && ', '}
                    <DoelCode code={d} />
                  </span>
                ))}
              </p>
            )}
            {o.widget?.type === 'bordles' && (
              <p className="b-lp-scherm">
                <Link
                  to={basisPad({ s: 'aanbod', code: lesplan.code, onderdeel: o.id })}
                  className="b-knop b-lp-aanbod-bord"
                  aria-label={`Op het bord: ${o.titel}`}
                >
                  Op het bord
                </Link>
              </p>
            )}
          </li>
        ))}
      </ol>
      <p className={uitkomst.nietGedekt.length > 0 ? 'b-lp-aanbod-dekking b-lp-aanbod-open' : 'b-lp-aanbod-dekking'}>
        {dekkingZin(uitkomst.nietGedekt, totaal)}
      </p>
    </div>
  );
}

/** De code van een leerplandoel: een link naar de leerplandoelpagina als de code bestaat, anders gewone vette tekst. */
function DoelCode({ code }: { code: string }) {
  const naar = useGoTekstOpties().doelLink?.(code);
  return naar ? (
    <Link to={naar} className="b-lp-naarplek b-lp-code">
      <span className="sr-only">Leerplandoel </span>
      {code}
    </Link>
  ) : (
    <strong className="b-lp-code">{code}</strong>
  );
}

// ── De pagina ────────────────────────────────────────────────────────────────

function Kruimel({ lesplan, index }: { lesplan: GoLesplanBestand; index: GoIndex | undefined }) {
  const a = lesplan.afgeleid;
  const leerjaar = leerjaarVanLeeftijd(lesplan.leeftijd);
  const lijn = index ? lessenlijnen(index, { vak: a.vak }).find((l) => l.naam === a.lessenlijn) : undefined;
  return (
    <nav className="b-kruimel" aria-label="Kruimelpad">
      <ol>
        <li><Link to={basisPad({ s: 'lesplannen', alle: true })}>Lesplannen</Link></li>
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

/**
 * De pagina voor een geladen lesplan, zonder zelf iets te laden: de index (voor links) en de koppelingen komen van buiten.
 * `indexFout`: de index laadde niet; 'In het kort' zegt dat, met 'Opnieuw proberen'.
 */
export function LesplanInhoud({ lesplan, index, koppelingen, indexFout, doelPad, aanbod }: { lesplan: GoLesplanBestand; index?: GoIndex; koppelingen: Koppelingen; indexFout?: GoLaadFout; doelPad?: DoelPadFn; aanbod?: AanbodStand }) {
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

          <p className="b-lp-acties">
            <button type="button" className="b-knop" onClick={() => window.print()}>
              <PrintIcon size={18} aria-hidden="true" /> Afdrukken
            </button>
          </p>

          <nav className="b-lp-ganaar" aria-label="Ga naar">
            <ul>
              {[{ nr: 0, label: 'In het kort', id: 'lp-kort-kop' }, ...ganaar].map((g) => (
                <li key={g.nr}>
                  <Link
                    to={basisPad({ s: 'lesplan', code: lesplan.code })}
                    onClick={(e) => {
                      if (!gewoneKlik(e)) return;
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

          <InHetKort lesplan={lesplan} koppelingen={koppelingen} indexFout={indexFout} doelPad={doelPad} aanbod={aanbod} />

          <p className="b-lp-grens">Hieronder het volledige lesplan van het GO!, letterlijk overgenomen.</p>
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

/** Laadt het leerplan van het vak van het lesplan, voor de chips met minimumdoelen; het lesplan en de index komen van LesplanScherm. */
function LesplanPagina({ lesplan, stap, index }: { lesplan: GoLesplanBestand; stap?: number; index: MetOpnieuw<GoIndex> }) {
  const leerplan = useGoLeerplan(lesplan.afgeleid.vak);
  const doelPad = useDoelPad();
  const aanbodLaden = useGoAanbod(lesplan.code);
  const aanbod = useMemo<AanbodStand>(() => {
    const st = aanbodLaden.stand;
    if (st.status === 'fout') return { status: 'fout', fout: st.fout, offline: st.fout === FOUT_AANBOD_GEEN_VERBINDING, opnieuw: aanbodLaden.opnieuw };
    if (st.status === 'klaar' && st.waarde) return { status: 'klaar', aanbod: st.waarde };
    return { status: 'geen' };
  }, [aanbodLaden]);

  const koppelingen = useMemo<Koppelingen>(() => {
    if (leerplan.stand.status === 'laden') return { status: 'laden' };
    if (leerplan.stand.status === 'fout') return { status: 'fout', fout: leerplan.stand.fout, opnieuw: leerplan.opnieuw };
    return { status: 'klaar', perCode: new Map(leerplan.stand.waarde.doelen.map((d) => [d.code, d])) };
  }, [leerplan]);

  // De kleverige balk 'Ga naar' staat op deze pagina: het attribuut geeft de scroll-padding eronder (basis-lesplan.css).
  // Geen :has() in de css, want dat kent Safari pas vanaf 15.4 (het basisdeel richt zich op Safari 14).
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-ganaar', '');
    return () => html.removeAttribute('data-ganaar');
  }, []);

  useEffect(() => {
    if (stap === undefined) return;
    const s = lesplan.afgeleid.stappen.find((x) => x.nr === stap);
    if (s) gaNaarId(wijzerId({ ...s.wat, regel: 0 }), wijzerId(s.wat));
  }, [lesplan, stap]);

  return (
    <LesplanInhoud
      lesplan={lesplan}
      index={index.stand.status === 'klaar' ? index.stand.waarde : undefined}
      koppelingen={koppelingen}
      indexFout={foutVan(index)}
      doelPad={doelPad}
      aanbod={aanbod}
    />
  );
}

function NietGevonden({ code }: { code: string }) {
  return (
    <section className="b-plaats">
      <h1>Dit lesplan vonden we niet</h1>
      <p>Er is geen lesplan van het GO! met de code {code} in Boosterz.</p>
      <ul className="b-plaats-links">
        <li><Link to={basisPad({ s: 'lesplannen', alle: true })}>Alle lesplannen</Link></li>
        <li><Link to={basisPad({ s: 'go' })}>Leerplan en lesplannen van het GO!</Link></li>
      </ul>
    </section>
  );
}

export function LesplanScherm({ code, stap }: { code: string; stap?: number }) {
  const { stand, opnieuw } = useGoLesplan(code);
  // De index vertrekt samen met het lesplan (zelfde commit). Ze zegt al het vak van het lesplan: zo vertrekt het leerplan
  // ook vóór het lesplan binnen is. useGoLeerplan in LesplanPagina krijgt dan dezelfde belofte (de cache in goBron.ts);
  // een mislukte voorlading wordt daar opnieuw geprobeerd.
  const index = useGoIndex();
  const vakUitIndex = index.stand.status === 'klaar' ? lesplanVanCode(index.stand.waarde, code)?.vak : undefined;
  useEffect(() => {
    if (vakUitIndex) laadGoLeerplan(vakUitIndex).catch(() => {});
  }, [vakUitIndex]);

  if (stand.status === 'laden') {
    return (
      <div className="b-lesplan">
        <h1 className="b-lp-h1">Lesplan {code}</h1>
        <LaadBericht tekst="Het lesplan wordt geladen" />
      </div>
    );
  }
  if (stand.status === 'fout') {
    if (isGoNietGevonden(stand.fout)) return <NietGevonden code={code} />;
    return (
      <div className="b-lesplan">
        <h1 className="b-lp-h1">Lesplan {code}</h1>
        <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />
      </div>
    );
  }
  return <LesplanPagina lesplan={stand.waarde} stap={stap} index={index} />;
}
