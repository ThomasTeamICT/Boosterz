// Het venster "Plan de competenties die nog nergens aan bod komen" op de richtingpagina (docs/STUDIERICHTINGEN.md § 24.6.3):
// in een nieuwe cursus (met een nagekeken leerplan met precies de gekozen competenties) of in een cursus die je al hebt (er
// komen alleen secties bij; een leerplan wordt nooit aangepast). Dit bestand zit in een lui chunk: BkDekking laadt het pas
// bij de klik op de knop.
//
// Het venster volgt `GatenVenster.tsx` (de minimumdoelen) stap voor stap, met de teksten van `BK_PLAN_TEKSTEN` en de logica
// van de competenties: `leerplanVoorBkGaten` voor het leerplan (weg a), `bkVerwijzingen` om cursussen te zoeken en
// `bkGeraamte` om de secties te maken (weg b). Dat bestand blijft onaangeroerd; gedeeld worden alleen `GatenSetsKeuze` en de
// helpers van de sets.
//
// De gegevens (de bijdragen van de cursussen en de dekking) komen uit de momentopname van het blok toen de leerkracht klikte:
// geen tweede berekening. Alleen de bestanden en de versiemerken laadt het venster nog eens (`laadBkGegevens`): ze zitten al
// in het geheugen, dus dat kost geen nieuw verzoek. Zolang dat bezig is of mislukt, kan de primaire knop niet.
//
// Bewaren gaat uitsluitend via `bewaarNieuweGatenCursus` en `bewaarGatenOpCursus`, die vlak voor het schrijven de opslag opnieuw
// lezen; bij een bestaande cursus leest het venster ook het leerplan opnieuw. Een beroepskwalificatie-leerplan wordt hier nooit aangepast (I1): een nieuw leerplan wordt bewaard, een bestaand
// hergebruikt, en bij een bestaande cursus komen er alleen secties bij.
//
// Twee aanvullingen op § 24.6.3, die de paragraaf niet beschrijft:
// - Geeft de Vlaamse overheid een gekozen beroepskwalificatie niet meer (`waarschuwingen` van `leerplanVoorBkGaten`, bij
//   `nieuw` én `hergebruik`), dan opent de cursus niet meteen: de melding blijft staan tot de leerkracht doorklikt, zoals in
//   `NieuweRichtingCursus`. Een toast van drie seconden is te kort voor een zin die ze moet lezen.
// - Mislukt het laden van de bestanden, dan is de foutzin `FOUT_BK`, behalve bij een beschadigd bestand: daar krijgt ze
//   `FOUT_BK_BESCHADIGD`, want opnieuw proberen helpt dan niet (zoals in `BkSectie`).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WarningIcon } from '../../icons';
import { FoutBericht } from '../../curriculum/LaadStatus';
import { Field, Modal, useToast } from '../../ui';
import { GatenSetsKeuze, gekozenOpenDoelen, gekozenOpenSets } from '../../course/MinimumdoelenDekking';
import { FOUT_BK, FOUT_BK_BESCHADIGD } from '../../../lib/beroepskwalificatiesBron';
import { bkGeraamte, cursusVoorBk } from '../../../lib/bkCursus';
import {
  BK_FOUT_LEERPLAN_WEG,
  BK_FOUT_NIET_MEER_IN_LEERPLAN,
  BK_FOUT_VERANDERD,
  BK_GEEN_KANDIDAAT_HINT,
  BK_PLAN_TEKSTEN,
  BK_PLAN_TITEL_HINT,
  BK_PLAN_VENSTER_HINT,
  BK_PLAN_VENSTER_INTRO,
  BK_PLAN_VENSTER_TITEL,
  bkAndereVersieTekst,
  bkFoutBijBestaandeCursus,
  bkGeplandInCursusToast,
  bkNietNagekeken,
  bkPassendTekst,
  bkPlanZonderBestandTekst,
  bkToastCursus,
  bkVoetNodigTekst,
  bkVoorbeeldZin,
  bkZetKnopTekst,
  bkZonderPassendTekst,
} from '../../../lib/bkWeergave';
import type { BkBestand } from '../../../lib/beroepskwalificaties';
import type { Course } from '../../../lib/courseTypes';
import { getCourse, saveCourse, saveCourseGuarded } from '../../../lib/courses';
import { deleteCurriculum, getCurricula, getCurriculum, saveCurriculum } from '../../../lib/curriculum';
import { bkVerwijzingen, bkVersiesOmTeLaden } from '../../../lib/dekkingBk';
import type { CursusBijdrage, MdDekking } from '../../../lib/dekkingMinimumdoelen';
import { bewaarGatenOpCursus, bewaarNieuweGatenCursus, type GatenOpslag } from '../../../lib/gatenCursus';
import { codesVoorDoelen, cursussenVoorGaten, openPerSet, openVerplichteDoelen, selectieVanOpen } from '../../../lib/gatenDichten';
import {
  ANNULEREN_TEKST,
  CURSUS_LEGEND,
  FOUT_OPSLAG_VOL,
  MAAK_CURSUS_TEKST,
  TITEL_LABEL,
  WAAR_BESTAAND,
  WAAR_LEGEND,
  WAAR_NIEUW,
  cursusJaarTekst,
  telJaarTekst,
} from '../../../lib/gatenWeergave';
import type { RichtingBk } from '../../../lib/richtingBk';
import { doelgroepVan, type RichtingInfo, type RichtingKeuze } from '../../../lib/richtingKader';
import { getPrefs } from '../../../lib/storage';
import { useLaadstand } from '../../../lib/useLaadstand';
import { laadBkGegevens, type BkGegevens } from './BkKeuze';
import { BK_NOG_NODIG_GEGEVENS } from './bkSectieHulp';
import { leerplanVoorBkGaten, titelsVoorBkGaten } from './bkGatenHulp';
import '../../../styles/gaten.css';

export interface BkGatenVensterProps {
  info: RichtingInfo;
  /** De keuze van de leerkracht op de pagina, met het jaar: de nieuwe cursus krijgt dat jaar. */
  keuze: RichtingKeuze;
  /** De dekking zoals ze op het scherm stond toen de leerkracht op de knop klikte: het venster werkt met die momentopname. */
  gegevens: {
    kader: RichtingBk;
    dekking: MdDekking;
    bijdragen: readonly CursusBijdrage[];
    bestanden: ReadonlyMap<string, BkBestand>;
    /** De namen van de beroepskwalificaties voor het scherm (twee met dezelfde titel onderscheiden). */
    namen: ReadonlyMap<string, string>;
    /** Het jaar waartoe de telling beperkt is (bij "Alleen het <jaar>"). */
    telJaar?: number;
  };
  onClose(): void;
  /** Na het bewaren: de dekking rekent opnieuw. */
  onGepland(): void;
}

/** De echte opslagfuncties, zoals `gatenCursus.ts` ze vraagt. */
const OPSLAG: GatenOpslag = { saveCurriculum, deleteCurriculum, saveCourse, getCourse, saveCourseGuarded };

type Waar = 'nieuw' | 'bestaand';

/** Na het bewaren van een nieuwe cursus met iets te melden: de knoppen van de melding (zoals in `NieuweRichtingCursus`). */
const OPEN_CURSUS_TEKST = 'Open de cursus';
const NU_NIET_TEKST = 'Nu niet';

/** De cursus is bewaard, maar Boosterz heeft iets te melden: de leerkracht leest eerst en klikt dan door. */
interface Uitslag {
  /** De melding van het gelukken (dezelfde zin als de toast). */
  bewaard: string;
  /** De zin(nen) die niet blokkeren maar die ze moet kennen. */
  waarschuwing: string;
  cursusId: string;
}

/** Het aantal verschillende doelcodes dat op de secties van de cursus staat. */
function aantalCodes(cursus: Course): number {
  const codes = new Set<string>();
  for (const h of cursus.chapters) for (const s of h.sections) for (const c of s.goalCodes ?? []) codes.add(c);
  return codes.size;
}

/** Vandaag als JJJJ-MM-DD op het toestel van de leerkracht (zoals op het richtingenscherm), voor een titel die al bestaat. */
function vandaagLokaal(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`;
}

export function BkGatenVenster({ info, keuze, gegevens, onClose, onGepland }: BkGatenVensterProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const id = useId();
  const idEersteSet = `${id}-set`;
  const idTitel = `${id}-titel`;
  const idEersteCursus = `${id}-cursus`;
  const idNodig = `${id}-nodig`;
  const idGeenKandidaat = `${id}-geen`;
  const radioNaam = `${id}-waar`;
  const cursusNaam = `${id}-welke`;

  /** De beroepskwalificaties die de leerkracht uitvinkte: alles staat standaard aan. */
  const [uit, setUit] = useState<ReadonlySet<string>>(() => new Set());
  const [waar, setWaar] = useState<Waar>('nieuw');
  /** `null`: de titel volgt het voorstel, tot de leerkracht ze zelf aanpast. */
  const [titelEigen, setTitelEigen] = useState<string | null>(null);
  const [cursusId, setCursusId] = useState('');
  /** Een nieuw object bij elke fout, zodat dezelfde fout de focus opnieuw krijgt. */
  const [probleem, setProbleem] = useState<{ tekst: string } | null>(null);
  const [klaar, setKlaar] = useState(false);
  /** Na het bewaren met een waarschuwing: de cursus is er al, de leerkracht leest eerst. */
  const [uitslag, setUitslag] = useState<Uitslag | null>(null);
  const bezig = useRef(false);
  const opent = useRef(false);
  const probleemRef = useRef<HTMLDivElement>(null);
  const uitslagRef = useRef<HTMLDivElement>(null);

  // ── De bestanden en de versiemerken ──
  // Ze zitten al in het geheugen (het blok laadde ze), maar de versiemerken staan in de index: zonder merk herkent
  // `vindBkLeerplan` niets en zou er een dubbel leerplan komen. Tot ze er zijn, kan de primaire knop niet.
  const versies = useMemo(() => bkVersiesOmTeLaden(gegevens.kader), [gegevens.kader]);
  const { stand: laadStand, opnieuw: laadOpnieuw } = useLaadstand<BkGegevens>(`bk-gaten|${versies.join('|')}`, () => laadBkGegevens(versies));
  const geladen = laadStand.status === 'klaar' ? laadStand.waarde : undefined;

  // ── Wat open staat, en wat de leerkracht koos ──
  const open = useMemo(() => openPerSet(openVerplichteDoelen(gegevens.dekking)), [gegevens.dekking]);
  const gekozenSets = useMemo(() => gekozenOpenSets(open, uit), [open, uit]);
  const gekozenDoelen = useMemo(() => gekozenOpenDoelen(open, uit), [open, uit]);
  const setIds = useMemo(() => gekozenSets.map((s) => s.set), [gekozenSets]);
  const bkTitels = useMemo(() => gekozenSets.map((s) => s.setNaam), [gekozenSets]);

  // Beroepskwalificaties waarvan de competenties nog niet in Boosterz staan: die kan je nog niet plannen.
  const zonderBestand = useMemo(
    () => new Set(gegevens.kader.bks.filter((r) => !gegevens.bestanden.has(r.bk)).map((r) => r.bk)).size,
    [gegevens.kader, gegevens.bestanden],
  );

  // ── Welke cursussen passen ──
  // Strikt per `bkVerwijzingen`: een cursus met minimumdoelen is nooit kandidaat (I6).
  const kandidaten = useMemo(() => cursussenVoorGaten(gekozenDoelen, gegevens.bijdragen, bkVerwijzingen), [gekozenDoelen, gegevens.bijdragen]);
  const kanBestaand = kandidaten.kandidaten.length > 0;
  // Verdwijnt de laatste passende cursus door het uitvinken van beroepskwalificaties, dan valt de keuze terug op een nieuwe cursus.
  const effectief: Waar = waar === 'bestaand' && !kanBestaand ? 'nieuw' : waar;
  const kandidaat = effectief === 'bestaand' ? kandidaten.kandidaten.find((c) => c.course.id === cursusId) : undefined;
  const passend = useMemo(
    () => (kandidaat ? codesVoorDoelen(kandidaat.leerplan, gekozenDoelen, bkVerwijzingen) : undefined),
    [kandidaat, gekozenDoelen],
  );

  // ── Titel ──
  const titels = useMemo(() => titelsVoorBkGaten(info, keuze, bkTitels), [info, keuze, bkTitels]);
  const titel = titelEigen ?? titels.cursus;

  // ── Wat er nog ontbreekt ──
  const n = gekozenDoelen.length;
  const k = passend?.inLeerplan.length ?? n;
  const voet = geladen === undefined
    ? BK_NOG_NODIG_GEGEVENS
    : bkVoetNodigTekst({ competenties: n, waar: effectief, titel, cursusGekozen: kandidaat !== undefined });
  const geblokkeerd = voet !== '';
  const knopTekst = effectief === 'nieuw' ? MAAK_CURSUS_TEKST : bkZetKnopTekst(k, n);
  const zin = kandidaat && passend ? bkVoorbeeldZin(kandidaat.course.title || 'Cursus zonder titel', k, n) : undefined;

  const zetSet = (set: string, aan: boolean) => setUit((vorige) => {
    const volgende = new Set(vorige);
    if (aan) volgende.delete(set);
    else volgende.add(set);
    return volgende;
  });

  // Een fout hoort bij de keuze waarmee het misliep: kiest de leerkracht iets anders, dan verdwijnt ze. Ze krijgt de focus,
  // zodat een schermlezer ze voorleest en een toetsenbordgebruiker er niet naast belandt.
  const keuzeSleutel = `${effectief}|${setIds.join(',')}|${kandidaat?.course.id ?? ''}`;
  useEffect(() => { setProbleem(null); }, [keuzeSleutel]);
  useEffect(() => {
    if (!probleem) return;
    probleemRef.current?.scrollIntoView?.({ block: 'nearest' });
    probleemRef.current?.focus();
  }, [probleem]);
  // De melding na het bewaren krijgt de focus: de knop waarmee ze net maakte, is weg, en een schermlezer leest ze voor.
  useEffect(() => {
    if (!uitslag) return;
    uitslagRef.current?.scrollIntoView?.({ block: 'nearest' });
    uitslagRef.current?.focus();
  }, [uitslag]);

  // ── (a) Een nieuwe cursus ──
  const maakNieuweCursus = (g: BkGegevens) => {
    const selectie = selectieVanOpen(open, new Set(setIds));
    const r = leerplanVoorBkGaten({
      info, keuze, selectie, gegevens: { bestanden: g.bestanden, merken: g.merken }, curricula: getCurricula(), vandaag: vandaagLokaal(),
    });
    if (r.soort === 'veranderd') {
      setProbleem({ tekst: BK_FOUT_VERANDERD });
      return;
    }
    if (r.soort === 'niet-nagekeken') {
      setProbleem({ tekst: bkNietNagekeken(r.waarschuwing) });
      return;
    }
    const cursus = cursusVoorBk({
      titel: titel.trim(),
      auteur: getPrefs().teacherName,
      doelgroep: doelgroepVan(info, keuze),
      leerplan: r.leerplan,
      bestanden: g.bestanden,
      start: 'geraamte',
    });
    const bewaard = bewaarNieuweGatenCursus({ leerplan: r.leerplan, nieuwLeerplan: r.soort === 'nieuw', cursus }, OPSLAG);
    if (!bewaard.ok) {
      // De opslaglaag meldt een volle opslag zelf; hier staat alleen dat er niets bewaard is.
      setProbleem({ tekst: FOUT_OPSLAG_VOL });
      return;
    }
    bezig.current = true;
    const gemaakt = bkToastCursus({
      start: 'geraamte', hoofdstukken: cursus.chapters.length, competenties: aantalCodes(cursus), titels: bkTitels, hergebruikt: r.soort === 'hergebruik',
    });
    // Zonder waarschuwing opent de cursus meteen. Met een waarschuwing (de overheid geeft een gekozen kwalificatie niet meer)
    // blijft ze staan tot de leerkracht doorklikt: de cursus is dan al bewaard.
    const waarschuwing = (r.waarschuwingen ?? []).join(' ').trim();
    if (waarschuwing !== '') {
      setUitslag({ bewaard: gemaakt, waarschuwing, cursusId: cursus.id });
      return;
    }
    openCursus(cursus.id, gemaakt);
  };

  /** Naar de editor, met de melding van het gelukken. Dubbel klikken telt niet. */
  const openCursus = (cursusId: string, melding: string) => {
    if (opent.current) return;
    opent.current = true;
    setKlaar(true);
    toast(melding, 'ok');
    navigate(`/cursus/bewerk/${encodeURIComponent(cursusId)}`);
  };

  // ── (b) Een cursus die ze al heeft ──
  const zetInBestaandeCursus = (g: BkGegevens) => {
    if (!kandidaat || !passend) return;
    // Het leerplan komt uit de momentopname van het blok: lees het opnieuw, het kan intussen in een ander tabblad veranderd zijn
    // (de cursus leest `bewaarGatenOpCursus` zelf opnieuw).
    const leerplan = getCurriculum(kandidaat.leerplan.id);
    if (!leerplan) {
      setProbleem({ tekst: BK_FOUT_LEERPLAN_WEG });
      return;
    }
    const vers = codesVoorDoelen(leerplan, gekozenDoelen, bkVerwijzingen);
    if (vers.inLeerplan.length === 0) {
      setProbleem({ tekst: BK_FOUT_NIET_MEER_IN_LEERPLAN });
      return;
    }
    // Een competentie komt altijd via `bkGeraamte`: een sectie per competentie, met kennis en vaardigheden (F3b-B3).
    const r = bewaarGatenOpCursus({
      courseId: kandidaat.course.id,
      leerplan,
      codes: vers.codes,
      geraamte: (lp, codes) => bkGeraamte(lp, g.bestanden, codes),
    }, OPSLAG);
    if (!r.ok) {
      setProbleem({ tekst: bkFoutBijBestaandeCursus(r.reden) });
      return;
    }
    bezig.current = true;
    toast(bkGeplandInCursusToast(vers.inLeerplan.length, r.course.title), 'ok');
    onGepland();
  };

  const maak = () => {
    if (bezig.current || klaar) return;
    if (geladen === undefined) return;
    if (geblokkeerd) {
      // De knop blijft klikbaar en zet de focus op het eerste wat nog ontbreekt.
      const veld = gekozenDoelen.length === 0 ? idEersteSet : effectief === 'nieuw' ? idTitel : idEersteCursus;
      document.getElementById(veld)?.focus();
      return;
    }
    setProbleem(null);
    if (effectief === 'nieuw') maakNieuweCursus(geladen);
    else zetInBestaandeCursus(geladen);
  };

  /**
   * De foutmelding verdwijnt zodra het opnieuw laadt, en met haar de knop waarop de focus stond. Die gaat eerst naar het eerste
   * vakje van het venster, anders valt ze terug op de pagina achter het venster.
   */
  const opnieuwProberen = () => {
    document.getElementById(idEersteSet)?.focus();
    laadOpnieuw();
  };

  const andereVersie = bkAndereVersieTekst(gegevens.dekking.zelfdeNummerAndereSet);
  const zonderBestandTekst = bkPlanZonderBestandTekst(zonderBestand);
  return (
    <Modal
      title={BK_PLAN_VENSTER_TITEL}
      // Na het bewaren is de cursus er al: sluiten laat de dekking opnieuw rekenen, net als na het plannen in een bestaande cursus.
      onClose={uitslag ? onGepland : onClose}
      wide
      footer={(
        <div className="gt-voet">
          {klaar
            ? <p className="gt-nodig" role="status">De cursus wordt geopend…</p>
            : !uitslag && voet && <p id={idNodig} className="gt-nodig">{voet}</p>}
          <div className="gt-knoppen">
            {uitslag
              ? (
                <>
                  <button type="button" className="btn btn-ghost gt-knop" onClick={onGepland}>{NU_NIET_TEKST}</button>
                  <button
                    type="button" className="btn btn-primary gt-knop"
                    aria-disabled={klaar ? 'true' : undefined}
                    onClick={() => openCursus(uitslag.cursusId, uitslag.bewaard)}
                  >
                    {OPEN_CURSUS_TEKST}
                  </button>
                </>
              )
              : (
                <>
                  <button type="button" className="btn btn-ghost gt-knop" onClick={onClose}>{ANNULEREN_TEKST}</button>
                  <button
                    type="button" className="btn btn-primary gt-knop"
                    aria-disabled={geblokkeerd || klaar ? 'true' : undefined}
                    aria-describedby={voet && !klaar ? idNodig : undefined}
                    onClick={maak}
                  >
                    {knopTekst}
                  </button>
                </>
              )}
          </div>
        </div>
      )}
    >
      <div className="gt">
        {uitslag && (
          <div className="callout warn gt-melding" role="status" tabIndex={-1} ref={uitslagRef}>
            <WarningIcon size={18} />
            <div>
              <p>{uitslag.bewaard}</p>
              <p>{uitslag.waarschuwing}</p>
            </div>
          </div>
        )}
        <div hidden={uitslag !== null}>
          <p className="gt-intro">{BK_PLAN_VENSTER_INTRO}</p>
          <p className="gt-hint">{BK_PLAN_VENSTER_HINT}</p>
          {andereVersie !== '' && <p className="gt-hint">{andereVersie}</p>}
          {zonderBestandTekst !== '' && <p className="gt-hint">{zonderBestandTekst}</p>}
          {gegevens.telJaar !== undefined && <p className="gt-hint">{telJaarTekst(gegevens.telJaar)}</p>}

          {/* Mislukt het laden van de bestanden, dan kan de primaire knop niet tot "Opnieuw proberen" gelukt is. */}
          {laadStand.status === 'fout' && (
            <FoutBericht fout={laadStand.fout === FOUT_BK_BESCHADIGD ? FOUT_BK_BESCHADIGD : FOUT_BK} onOpnieuw={opnieuwProberen} />
          )}

          <GatenSetsKeuze sets={open} namen={gegevens.namen} uit={uit} onZet={zetSet} eersteId={idEersteSet} teksten={BK_PLAN_TEKSTEN} />

          <fieldset className="gt-groep">
            <legend>{WAAR_LEGEND}</legend>

            <div className="gt-keuze">
              <label className="gt-keuze-rij">
                <input type="radio" name={radioNaam} checked={effectief === 'nieuw'} onChange={() => setWaar('nieuw')} />
                <span className="gt-keuze-titel">{WAAR_NIEUW}</span>
              </label>
              {effectief === 'nieuw' && (
                <div className="gt-keuze-inhoud">
                  <Field label={TITEL_LABEL} hint={BK_PLAN_TITEL_HINT}>
                    <input
                      id={idTitel} className="input" value={titel} maxLength={120} autoComplete="off"
                      onChange={(e) => setTitelEigen(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="gt-keuze">
              <label className="gt-keuze-rij">
                <input
                  type="radio" name={radioNaam} checked={effectief === 'bestaand'}
                  aria-disabled={kanBestaand ? undefined : 'true'}
                  aria-describedby={kanBestaand ? undefined : idGeenKandidaat}
                  onChange={() => { if (kanBestaand) setWaar('bestaand'); }}
                />
                <span className="gt-keuze-titel">{WAAR_BESTAAND}</span>
              </label>
              {!kanBestaand && <p id={idGeenKandidaat} className="gt-keuze-zin">{BK_GEEN_KANDIDAAT_HINT}</p>}
              {effectief === 'bestaand' && (
                <div className="gt-keuze-inhoud">
                  <fieldset className="gt-cursussen">
                    <legend>{CURSUS_LEGEND}</legend>
                    <ul className="gt-cursuslijst">
                      {kandidaten.kandidaten.map((c, i) => (
                        <li key={c.course.id}>
                          <label className="gt-cursus">
                            <input
                              type="radio" name={cursusNaam} id={i === 0 ? idEersteCursus : undefined}
                              checked={cursusId === c.course.id} onChange={() => setCursusId(c.course.id)}
                            />
                            <span className="gt-cursus-tekst">
                              <span className="gt-cursus-titel">{c.course.title || 'Cursus zonder titel'}</span>
                              <span className="gt-cursus-meta">{cursusJaarTekst(c.course.doelgroep?.jaar)} · {bkPassendTekst(c.passend, n)}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {kandidaten.zonderPassend > 0 && <p className="gt-zonder">{bkZonderPassendTekst(kandidaten.zonderPassend)}</p>}
                  </fieldset>
                  {/* Geen link naar het leerplan: aan een leerplan van een beroepskwalificatie valt niets aan te passen. */}
                  <div className="gt-voorbeeld" aria-live="polite" aria-atomic="true">
                    {zin && <p>{zin}</p>}
                  </div>
                </div>
              )}
            </div>
          </fieldset>
        </div>

        {probleem && (
          <div className="callout err gt-melding" role="alert" tabIndex={-1} ref={probleemRef}>
            <WarningIcon size={18} />
            <div><p>{probleem.tekst}</p></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default BkGatenVenster;
