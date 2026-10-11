// Eén studierichting (docs/STUDIERICHTINGEN.md § 14.3): kop, de keuze van jaar, soort onderwijs en variant, en daaronder de
// secties met de officiële minimumdoelen, de leerplannen en de cursussen van de richting.
//
// De keuze staat in de adresbalk: `?jaar=4&soort=buso&variant=<nummer>`. Alles wordt tegen de richting gecontroleerd; wat niet
// klopt, wordt stil genegeerd. Het kader (welke doelen bij de richting horen) hangt niet van het jaar af: een ander jaar laadt
// dus niets opnieuw.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BackIcon, WarningIcon } from '../icons';
import { Field } from '../ui';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { RichtingCursussen } from './RichtingCursussen';
import { RichtingDekking } from './RichtingDekking';
import { RichtingKlassen } from './RichtingKlassen';
import { useRichtingDekking, type TelMee } from './useRichtingDekking';
import { RichtingDoelen, useBestaandLeerplan, type RichtingContext } from './RichtingDoelen';
import { RichtingLeerplannen } from './RichtingLeerplannen';
import { GegevensStand, LIJST_ROUTE, bronTekst, type RichtingPaginaProps } from './RichtingLijst';
import { useRichtingKader } from './useRichtingGegevens';
import { bksVan, useLuiDeel, useRichtingBk, type BkStand } from './useRichtingBk';
import type { BkSectieProps } from './bk/BkSectie';
import type { Course } from '../../lib/courseTypes';
import { getCourses } from '../../lib/courses';
import { getCurricula } from '../../lib/curriculum';
import type { Curriculum } from '../../lib/curriculumTypes';
import { graadTekst, jaarTekst } from '../../lib/doelgroep';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import { geldigeOnderdelen, kenmerkenVan, richtingInfo, type RichtingInfo, type RichtingKeuze, type SoortKeuze } from '../../lib/richtingKader';
import { richtingLinkTeksten, variantLabels } from '../../lib/richtingWeergave';
import { GROEP_NUMMER, type MatrixBestand, type StudierichtingGroep } from '../../lib/studierichtingen';
import { onStorageChange } from '../../lib/storage';

// ── De keuze uit de adresbalk ───────────────────────────────────────────────
// De onderdelen waaruit een variant te kiezen valt, komen uit `geldigeOnderdelen` (richtingKader.ts): geldig en nog in de
// bron, of bij een afgebouwde richting alle die nog in de bron staan.

/**
 * De keuze van de leerkracht uit de adresbalk, gecontroleerd tegen de richting:
 * - `jaar` moet een van de jaren van de richting zijn; heeft de richting maar één jaar (de 1ste graad, een zevende jaar), dan is
 *   dat het jaar, wat er ook staat;
 * - `soort=buso` telt alleen als de richting buitengewoon onderwijs kan zijn (`kanBuso`); een richting van het buitengewoon
 *   onderwijs zelf is altijd `buso`;
 * - `variant` moet een geldig onderdeel van de richting zijn, en telt alleen als er meer dan één is.
 */
export function leesKeuze(params: URLSearchParams, info: RichtingInfo, vandaag: string): RichtingKeuze {
  const heeftJaren = info.graad !== undefined && info.jaren.length > 0;
  const jaarRuw = params.get('jaar');
  let jaar: number | undefined;
  if (heeftJaren && info.jaren.length === 1) jaar = info.jaren[0];
  else if (heeftJaren && jaarRuw !== null && /^\d{1,2}$/.test(jaarRuw) && info.jaren.includes(Number(jaarRuw))) jaar = Number(jaarRuw);

  const soort: SoortKeuze = info.soort === 'buso' || (info.kanBuso && params.get('soort') === 'buso') ? 'buso' : 'so';

  const onderdelen = geldigeOnderdelen(info, vandaag);
  const variantRuw = params.get('variant');
  const onderdeel = onderdelen.length > 1 && variantRuw !== null && /^\d{1,6}$/.test(variantRuw)
    ? onderdelen.find((o) => o.nummer === Number(variantRuw))?.nummer
    : undefined;

  return { groep: info.groep.nummer, soort, ...(jaar !== undefined ? { jaar } : {}), ...(onderdeel !== undefined ? { onderdeel } : {}) };
}

// ── De kop ──────────────────────────────────────────────────────────────────

function GroepLink({ groep, tekst }: { groep: StudierichtingGroep; tekst: string }) {
  return <Link className="ri-richting-link" to={`${LIJST_ROUTE}/${groep.nummer}`}>{tekst}</Link>;
}

/** "a", "a en b", "a, b en c" van links. `teksten` geeft per richting de tekst van de link (met de kenmerken erbij). */
function Links({ groepen, teksten }: { groepen: readonly StudierichtingGroep[]; teksten: ReadonlyMap<string, string> }) {
  return (
    <>
      {groepen.map((g, i) => (
        <span key={g.nummer}>
          {i > 0 && (i === groepen.length - 1 ? ' en ' : ', ')}
          <GroepLink groep={g} tekst={teksten.get(g.nummer) ?? g.titel} />
        </span>
      ))}
    </>
  );
}

function ZelfdeNaam({ info, matrix, vandaag }: { info: RichtingInfo; matrix: MatrixBestand; vandaag: string }) {
  const perGraad = useMemo(() => {
    const uit = new Map<number, StudierichtingGroep[]>();
    for (const g of info.zelfdeNaam) {
      const graad = Number(g.graad);
      if (graad !== 1 && graad !== 2 && graad !== 3) continue;
      uit.set(graad, [...(uit.get(graad) ?? []), g]);
    }
    return uit;
  }, [info.zelfdeNaam]);
  // De zin noemt de graad al; de link zegt wat de richting daar onderscheidt (de jaren, en zo nodig de finaliteit of de vorm).
  const teksten = useMemo(() => {
    const uit = new Map<string, string>();
    for (const groepen of perGraad.values()) {
      for (const [nummer, tekst] of richtingLinkTeksten(matrix, groepen, vandaag, { zonderGraad: true })) uit.set(nummer, tekst);
    }
    return uit;
  }, [perGraad, matrix, vandaag]);
  return (
    <>
      {[...perGraad].sort((a, b) => a[0] - b[0]).map(([graad, groepen]) => (
        <p key={graad} className="ri-zelfde">
          Deze richting bestaat ook in de {graadTekst(graad as 1 | 2 | 3)}: <Links groepen={groepen} teksten={teksten} />.
        </p>
      ))}
    </>
  );
}

// ── Beroepskwalificaties (§ 23.7): lui, alleen als de richting er kan hebben ──
// De kopregel en de sectie zitten samen in een lui chunk. Het wordt pas geladen als `useRichtingBk` iets te tonen heeft;
// lukt het laden niet, dan blijft de rest van de pagina staan.

const laadBkSectie = () => import('./bk/BkSectie');
const FOUT_BK_DEEL = 'De beroepskwalificaties konden niet getoond worden. Controleer je verbinding en herlaad de pagina.';

/** De kopregel onder de titel: alleen met minstens één beroepskwalificatie. */
function BkKopRegelLui({ stand }: { stand: BkStand }) {
  const heeft = bksVan(stand).length > 0;
  const deel = useLuiDeel(laadBkSectie, heeft);
  if (stand.status !== 'klaar' || !heeft || deel === undefined || deel === 'fout') return null;
  return <deel.BkKopRegel bk={stand.waarde} />;
}

/** De sectie "Beroepskwalificaties", voor elke richting die er kan hebben (wat ze toont, beslist de sectie zelf). */
function BkSectieLui(props: BkSectieProps) {
  const stand = props.context.bk;
  const nodig = stand !== undefined && stand.status !== 'niet-van-toepassing';
  const deel = useLuiDeel(laadBkSectie, nodig);
  if (!nodig || deel === undefined) return null;
  if (deel === 'fout') {
    if (bksVan(stand).length === 0) return null;
    return (
      <section className="ri-sectie" aria-labelledby="ri-bk-kop">
        <h2 id="ri-bk-kop" tabIndex={-1}>Beroepskwalificaties</h2>
        <div className="callout err ri-melding" role="alert">
          <WarningIcon size={20} className="ri-melding-icoon" />
          <div className="ri-melding-tekst"><p>{FOUT_BK_DEEL}</p></div>
        </div>
      </section>
    );
  }
  return <deel.BkSectie {...props} />;
}

// ── Het detail ──────────────────────────────────────────────────────────────

function Terug({ lijstZoek }: { lijstZoek: string }) {
  return <Link to={`${LIJST_ROUTE}${lijstZoek}`} className="btn btn-sm btn-quiet ri-terug"><BackIcon size={16} /> Alle richtingen</Link>;
}

/** Waar "Alle richtingen" naartoe gaat: de lijst zoals je ze verliet (de filters zitten in de adresbalk van de lijst). */
function useLijstZoek(): string {
  const { state } = useLocation();
  const zoek: unknown = (state as { lijst?: unknown } | null)?.lijst;
  return typeof zoek === 'string' && /^\?[\w=&%.+-]{0,400}$/.test(zoek) ? zoek : '';
}

export function RichtingDetail({ groep, stand, opnieuw, vandaag }: RichtingPaginaProps & { groep: string }) {
  const lijstZoek = useLijstZoek();
  const gegevens = stand.status === 'klaar' ? stand.waarde : undefined;
  const matrix = gegevens?.matrix;
  const info = useMemo(
    () => (matrix && GROEP_NUMMER.test(groep) ? richtingInfo(matrix, groep, vandaag) : undefined),
    [matrix, groep, vandaag],
  );

  if (stand.status !== 'klaar') {
    return (
      <>
        <Terug lijstZoek={lijstZoek} />
        <div className="page-head"><div className="ri-intro"><h1>Studierichting</h1></div></div>
        <GegevensStand stand={stand} opnieuw={opnieuw} />
      </>
    );
  }
  if (!info || !gegevens) {
    return (
      <>
        <div className="page-head">
          <div className="ri-intro">
            <h1>Studierichting niet gevonden</h1>
            <p className="sub">Deze studierichting bestaat niet (meer) in de matrix.</p>
          </div>
        </div>
        <Link to={LIJST_ROUTE} className="btn btn-ghost ri-knop">Alle richtingen</Link>
      </>
    );
  }
  return <RichtingInhoud key={info.groep.nummer} info={info} matrix={gegevens.matrix} bron={bronTekst(gegevens, `nummer in de matrix: ${info.groep.nummer}`)} indexSets={gegevens.index.sets} vandaag={vandaag} lijstZoek={lijstZoek} />;
}

/**
 * De secties die het kader van de richting nodig hebben. Het leerplan van de hele richting dat al op dit toestel staat, wordt
 * hier één keer bepaald: "Open het leerplan" (bij de doelen) en de lijst met leerplannen zeggen zo hetzelfde. Hetzelfde geldt
 * voor de dekking: ze wordt hier één keer berekend, en de lijst met cursussen en de sectie "Wat je cursussen samen dekken"
 * tonen allebei die berekening.
 */
function KaderSecties({ context, courses, matrix, vandaag, telMee, onTelMee, opnieuwBk }: {
  context: RichtingContext;
  courses: readonly Course[];
  matrix: MatrixBestand;
  vandaag: string;
  telMee: TelMee;
  onTelMee: (t: TelMee) => void;
  /** Het BK-kader opnieuw laden na een fout. */
  opnieuwBk: () => void;
}) {
  const [gevondenId, setGevondenId] = useState<string | null>(null);
  const bestaandLeerplan = useBestaandLeerplan(context, gevondenId);
  const dekking = useRichtingDekking(context, courses, matrix, vandaag, telMee);
  return (
    <>
      <RichtingDoelen {...context} bestaandLeerplan={bestaandLeerplan} onLeerplanGevonden={setGevondenId} />
      <BkSectieLui context={context} courses={courses} vandaag={vandaag} opnieuw={opnieuwBk} />
      <RichtingLeerplannen {...context} bestaandLeerplan={bestaandLeerplan} />
      <RichtingCursussen {...context} courses={courses} dekking={dekking.status === 'klaar' ? dekking.waarde : undefined} telMee={telMee} />
      <RichtingKlassen info={context.info} soort={context.kader.keuze.soort} courses={courses} curricula={context.curricula} />
      <RichtingDekking
        info={context.info} keuze={context.keuze} stand={dekking} telMee={telMee} onTelMee={onTelMee}
        bk={{ stand: context.bk ?? { status: 'niet-van-toepassing' }, courses, curricula: context.curricula, matrix, vandaag }}
      />
    </>
  );
}

function RichtingInhoud({ info, matrix, bron, indexSets, vandaag, lijstZoek }: {
  info: RichtingInfo;
  matrix: MatrixBestand;
  bron: string;
  indexSets: RichtingContext['indexSets'];
  vandaag: string;
  lijstZoek: string;
}) {
  const [params, setParams] = useSearchParams();
  const keuze = useMemo(() => leesKeuze(params, info, vandaag), [params, info, vandaag]);

  const zet = useCallback((patch: Record<string, string | undefined>) => {
    setParams((vorige) => {
      const volgende = new URLSearchParams(vorige);
      for (const [sleutel, waarde] of Object.entries(patch)) {
        if (waarde === undefined || waarde === '') volgende.delete(sleutel);
        else volgende.set(sleutel, waarde);
      }
      return volgende;
    }, { replace: true });
  }, [setParams]);

  // Het kader hangt niet van het jaar af (alleen van de richting, het soort onderwijs en de variant): een ander jaar laadt niets opnieuw.
  const kaderKeuze = useMemo<RichtingKeuze>(
    () => ({ groep: keuze.groep, soort: keuze.soort, ...(keuze.onderdeel !== undefined ? { onderdeel: keuze.onderdeel } : {}) }),
    [keuze.groep, keuze.soort, keuze.onderdeel],
  );
  const kaderStand = useRichtingKader(info, kaderKeuze);
  // De beroepskwalificaties hangen alleen van de richting en de variant af (§ 23.6.9); ze laden naast het kader.
  const bk = useRichtingBk(info, kaderKeuze, vandaag);
  // Welke cursussen de dekking telt (de keuze blijft staan als het kader opnieuw laadt, bv. bij een ander soort onderwijs).
  const [telMee, setTelMee] = useState<TelMee>('alle');

  // Leerplannen en cursussen van dit toestel; ze lezen opnieuw als er elders (ook in een ander tabblad) iets bewaard wordt.
  const [curricula, setCurricula] = useState<Curriculum[]>(getCurricula);
  const [courses, setCourses] = useState<Course[]>(getCourses);
  useEffect(() => onStorageChange(() => {
    setCurricula(getCurricula());
    setCourses(getCourses());
  }), []);

  const onderdelen = useMemo(() => geldigeOnderdelen(info, vandaag), [info, vandaag]);
  const varianten = useMemo(() => (onderdelen.length > 1 ? variantLabels(onderdelen, vandaag) : []), [onderdelen, vandaag]);
  const opvolgerTeksten = useMemo(() => richtingLinkTeksten(matrix, info.opvolgers, vandaag), [matrix, info.opvolgers, vandaag]);
  const kiesJaar = info.graad !== undefined && info.jaren.length > 1;
  const kiesSoort = info.kanBuso && info.soort !== 'buso';

  const kader = kaderStand.stand.status === 'klaar' ? kaderStand.stand.waarde.kader : undefined;
  const context: RichtingContext | undefined = kader ? { info, keuze, kader, indexSets, curricula, bk: bk.stand } : undefined;

  return (
    <>
      <Terug lijstZoek={lijstZoek} />
      <div className="page-head">
        <div className="ri-intro">
          <h1>{info.groep.titel}</h1>
          <p className="sub">{kenmerkenVan(info)}</p>
          {/* Pas met het kader: de sectie waar de knop naartoe gaat, staat in de secties die het kader nodig hebben. */}
          {context && <BkKopRegelLui stand={bk.stand} />}
        </div>
      </div>

      <ZelfdeNaam info={info} matrix={matrix} vandaag={vandaag} />
      {info.afgebouwd && (
        <div className="callout warn ri-melding" role="note">
          <WarningIcon size={20} className="ri-melding-icoon" />
          <div className="ri-melding-tekst">
            <p>Deze richting is afgebouwd{info.afgebouwdSinds ? ` sinds ${datumLeesbaar(info.afgebouwdSinds)}` : ''}.</p>
            {info.opvolgers.length > 0 && (
              <p>{info.opvolgers.length === 1 ? 'Opvolger' : 'Opvolgers'}: <Links groepen={info.opvolgers} teksten={opvolgerTeksten} /></p>
            )}
          </div>
        </div>
      )}
      {info.nietMeerInBron !== undefined && (
        <div className="callout warn ri-melding" role="note">
          <WarningIcon size={20} className="ri-melding-icoon" />
          <div className="ri-melding-tekst">
            <p>Deze richting staat sinds {datumLeesbaar(info.nietMeerInBron)} niet meer in de officiële matrix.</p>
          </div>
        </div>
      )}

      {(kiesJaar || kiesSoort || varianten.length > 0) && (
        <div className="ri-keuzes">
          {kiesJaar && (
            <fieldset className="ri-fieldset">
              <legend>Voor welk jaar?</legend>
              <div className="ri-radios">
                {info.jaren.map((j) => (
                  <label key={j} className="ri-keuze">
                    <input type="radio" name="ri-jaar" checked={keuze.jaar === j} onChange={() => zet({ jaar: String(j) })} />
                    <span>{jaarTekst(j)}</span>
                  </label>
                ))}
                <label className="ri-keuze">
                  <input type="radio" name="ri-jaar" checked={keuze.jaar === undefined} onChange={() => zet({ jaar: undefined })} />
                  <span>{info.jaren.length === 2 ? 'Beide jaren' : 'Alle jaren'} (de hele graad)</span>
                </label>
              </div>
              <p className="hint">De minimumdoelen gelden voor de hele graad. Het jaar bepaalt voor welke cursussen je werkt en wat de dekking telt.</p>
            </fieldset>
          )}
          {kiesSoort && (
            <fieldset className="ri-fieldset">
              <legend>Soort onderwijs</legend>
              <div className="ri-radios">
                <label className="ri-keuze">
                  <input type="radio" name="ri-soort" checked={keuze.soort === 'so'} onChange={() => zet({ soort: undefined })} />
                  <span>Gewoon secundair onderwijs</span>
                </label>
                <label className="ri-keuze">
                  <input type="radio" name="ri-soort" checked={keuze.soort === 'buso'} onChange={() => zet({ soort: 'buso' })} />
                  <span>Buitengewoon secundair onderwijs, opleidingsvorm 4</span>
                </label>
              </div>
            </fieldset>
          )}
          {varianten.length > 0 && (
            <Field label="Variant">
              <select className="select" value={keuze.onderdeel !== undefined ? String(keuze.onderdeel) : ''} onChange={(e) => zet({ variant: e.target.value || undefined })}>
                <option value="">Alle varianten</option>
                {varianten.map((v) => <option key={v.nummer} value={String(v.nummer)}>{v.label}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}

      {kaderStand.stand.status === 'laden' && (
        <section className="ri-sectie" aria-labelledby="ri-doelen-kop">
          <h2 id="ri-doelen-kop">De officiële minimumdoelen</h2>
          <LaadBericht tekst="De minimumdoelen worden geladen…" />
        </section>
      )}
      {kaderStand.stand.status === 'fout' && (
        <section className="ri-sectie" aria-labelledby="ri-doelen-kop">
          <h2 id="ri-doelen-kop">De officiële minimumdoelen</h2>
          <FoutBericht fout={kaderStand.stand.fout} onOpnieuw={kaderStand.opnieuw} />
        </section>
      )}

      {context && (
        <KaderSecties context={context} courses={courses} matrix={matrix} vandaag={vandaag} telMee={telMee} onTelMee={setTelMee} opnieuwBk={bk.opnieuw} />
      )}

      <p className="ri-bron">{bron}</p>
    </>
  );
}
