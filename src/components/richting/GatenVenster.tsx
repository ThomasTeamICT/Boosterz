// Venster "Plan wat nog nergens aan bod komt" (docs/STUDIERICHTINGEN.md § 22.4.2, § 22.4.3 en § 22.4.7).
//
// De leerkracht kiest per set welke open doelen (verplichte minimumdoelen die nog nergens aan bod komen) ze wil plannen, en
// of ze in een nieuwe cursus komen of in een cursus die ze al heeft. Het venster zet ze als lege secties met doelcodes in een
// cursus, zodat ze meteen als "gepland" tellen. Alle rekenwerk staat in lib/gatenDichten.ts en lib/gatenCursus.ts; de
// teksten met getallen in lib/gatenWeergave.ts. Hier staan alleen de keuzes, het bewaren en de meldingen.
//
// De gegevens (de bijdragen van de cursussen, de setbestanden en het kader) komen uit de dekking die op het scherm stond toen
// de leerkracht klikte (`DekkingGegevens`): een momentopname, geen tweede berekening en geen nieuwe verzoeken. Bewaren gaat
// alleen via `bewaarNieuweGatenCursus` en `bewaarGatenOpCursus`, die vlak voor het schrijven de opslag opnieuw lezen.
//
// Dit bestand wordt lui geladen, pas bij de klik op "Plan de … doelen die nog nergens aan bod komen".

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WarningIcon } from '../icons';
import { Field, Modal, useToast } from '../ui';
import { GatenSetsKeuze, gekozenOpenDoelen, gekozenOpenSets } from '../course/MinimumdoelenDekking';
import type { DekkingGegevens } from './useRichtingDekking';
import type { Course } from '../../lib/courseTypes';
import { getCourse, saveCourse, saveCourseGuarded } from '../../lib/courses';
import { deleteCurriculum, getCurricula, saveCurriculum } from '../../lib/curriculum';
import {
  codesVoorDoelen,
  cursussenVoorGaten,
  openNietVerplicht,
  openPerSet,
  openVerplichteDoelen,
  selectieVanOpen,
} from '../../lib/gatenDichten';
import { bewaarGatenOpCursus, bewaarNieuweGatenCursus, leerplanVoorGaten, titelsVoorGaten, type GatenOpslag } from '../../lib/gatenCursus';
import {
  ANNULEREN_TEKST,
  CURSUS_LEGEND,
  FOUT_OPSLAG_VOL,
  FOUT_SETS_VERANDERD,
  GEEN_KANDIDAAT_HINT,
  MAAK_CURSUS_TEKST,
  OF_KIES_NIEUW_TEKST,
  OPEN_LEERPLAN_TEKST,
  TITEL_HINT,
  TITEL_LABEL,
  VENSTER_HINT,
  VENSTER_INTRO,
  VENSTER_TITEL,
  WAAR_BESTAAND,
  WAAR_LEGEND,
  WAAR_NIEUW,
  cursusGemaaktToast,
  cursusJaarTekst,
  foutBijBestaandeCursus,
  geplandInCursusToast,
  nietNagekekenFout,
  optioneleHintTekst,
  passendTekst,
  telJaarTekst,
  voetNodigTekst,
  voorbeeldZin,
  zetKnopTekst,
  zonderPassendTekst,
} from '../../lib/gatenWeergave';
import { cursusVoorRichting } from '../../lib/richtingCursus';
import { doelgroepVan, type RichtingInfo, type RichtingKeuze } from '../../lib/richtingKader';
import { getPrefs } from '../../lib/storage';
import '../../styles/gaten.css';

export interface GatenVensterProps {
  info: RichtingInfo;
  /** De keuze van de leerkracht op de pagina, met het jaar: de nieuwe cursus krijgt dat jaar. */
  keuze: RichtingKeuze;
  /** De dekking zoals ze op het scherm stond toen de leerkracht klikte (een momentopname). */
  gegevens: DekkingGegevens;
  onClose: () => void;
  /** De doelen staan nu gepland in een bestaande cursus: de pagina sluit het venster en zet de focus op de kop van de sectie. */
  onGepland: () => void;
}

/** De echte opslagfuncties, zoals `gatenCursus.ts` ze vraagt. */
const OPSLAG: GatenOpslag = { saveCurriculum, deleteCurriculum, saveCourse, getCourse, saveCourseGuarded };

type Waar = 'nieuw' | 'bestaand';

/** Het aantal verschillende doelcodes dat op de secties van de cursus staat. */
function aantalCodes(cursus: Course): number {
  const codes = new Set<string>();
  for (const h of cursus.chapters) for (const s of h.sections) for (const c of s.goalCodes ?? []) codes.add(c);
  return codes.size;
}

export function GatenVenster({ info, keuze, gegevens, onClose, onGepland }: GatenVensterProps) {
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

  /** De sets die de leerkracht uitvinkte: alles staat standaard aan. */
  const [uit, setUit] = useState<ReadonlySet<string>>(() => new Set());
  const [waar, setWaar] = useState<Waar>('nieuw');
  /** `null`: de titel volgt het voorstel, tot de leerkracht ze zelf aanpast. */
  const [titelEigen, setTitelEigen] = useState<string | null>(null);
  const [cursusId, setCursusId] = useState('');
  /** Een nieuw object bij elke fout, zodat dezelfde fout de focus opnieuw krijgt. */
  const [probleem, setProbleem] = useState<{ tekst: string } | null>(null);
  const [klaar, setKlaar] = useState(false);
  const bezig = useRef(false);
  const probleemRef = useRef<HTMLDivElement>(null);

  // ── Wat open staat, en wat de leerkracht koos ──
  const open = useMemo(() => openPerSet(openVerplichteDoelen(gegevens.dekking)), [gegevens]);
  const nietVerplicht = useMemo(() => openNietVerplicht(gegevens.dekking), [gegevens]);
  const gekozenSets = useMemo(() => gekozenOpenSets(open, uit), [open, uit]);
  const gekozenDoelen = useMemo(() => gekozenOpenDoelen(open, uit), [open, uit]);
  const setIds = useMemo(() => gekozenSets.map((s) => s.set), [gekozenSets]);

  // ── Welke cursussen passen ──
  const kandidaten = useMemo(() => cursussenVoorGaten(gekozenDoelen, gegevens.bijdragen), [gekozenDoelen, gegevens]);
  const kanBestaand = kandidaten.kandidaten.length > 0;
  // Verdwijnt de laatste passende cursus door het uitvinken van sets, dan valt de keuze terug op een nieuwe cursus.
  const effectief: Waar = waar === 'bestaand' && !kanBestaand ? 'nieuw' : waar;
  const kandidaat = effectief === 'bestaand' ? kandidaten.kandidaten.find((c) => c.course.id === cursusId) : undefined;
  const passend = useMemo(() => (kandidaat ? codesVoorDoelen(kandidaat.leerplan, gekozenDoelen) : undefined), [kandidaat, gekozenDoelen]);

  // ── Titel ──
  const titels = useMemo(
    () => titelsVoorGaten(info, gegevens.kader, keuze, setIds, gegevens.namen),
    [info, gegevens, keuze, setIds],
  );
  const titel = titelEigen ?? titels.cursus;

  // ── Wat er nog ontbreekt ──
  const voet = voetNodigTekst({ doelen: gekozenDoelen.length, waar: effectief, titel, cursusGekozen: kandidaat !== undefined });
  const geblokkeerd = voet !== '';
  const k = passend?.inLeerplan.length ?? gekozenDoelen.length;
  const n = gekozenDoelen.length;
  const knopTekst = effectief === 'nieuw' ? MAAK_CURSUS_TEKST : zetKnopTekst(k, n);
  const zin = kandidaat && passend ? voorbeeldZin(kandidaat.course.title || 'Cursus zonder titel', k, n) : undefined;

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

  // ── (a) Een nieuwe cursus ──
  const maakNieuweCursus = () => {
    const selectie = selectieVanOpen(open, new Set(setIds));
    const r = leerplanVoorGaten({ info, kader: gegevens.kader, selectie, bestanden: gegevens.bestanden, curricula: getCurricula() });
    if (r.soort === 'veranderd') {
      setProbleem({ tekst: FOUT_SETS_VERANDERD });
      return;
    }
    if (r.soort === 'niet-nagekeken') {
      setProbleem({ tekst: nietNagekekenFout(r.waarschuwing) });
      return;
    }
    const cursus = cursusVoorRichting({
      titel: titel.trim(),
      auteur: getPrefs().teacherName,
      doelgroep: doelgroepVan(info, keuze),
      leerplan: r.leerplan,
      start: 'geraamte',
    });
    const bewaard = bewaarNieuweGatenCursus({ leerplan: r.leerplan, nieuwLeerplan: r.soort === 'nieuw', cursus }, OPSLAG);
    if (!bewaard.ok) {
      // De opslaglaag meldt een volle opslag zelf; hier staat alleen dat er niets bewaard is.
      setProbleem({ tekst: FOUT_OPSLAG_VOL });
      return;
    }
    bezig.current = true;
    setKlaar(true);
    toast(cursusGemaaktToast(cursus.chapters.length, aantalCodes(cursus), r.soort === 'hergebruik'), 'ok');
    navigate(`/cursus/bewerk/${encodeURIComponent(cursus.id)}`);
  };

  // ── (b) Een cursus die ze al heeft ──
  const zetInBestaandeCursus = () => {
    if (!kandidaat || !passend) return;
    const r = bewaarGatenOpCursus({ courseId: kandidaat.course.id, leerplan: kandidaat.leerplan, codes: passend.codes }, OPSLAG);
    if (!r.ok) {
      setProbleem({ tekst: foutBijBestaandeCursus(r.reden) });
      return;
    }
    bezig.current = true;
    toast(geplandInCursusToast(passend.inLeerplan.length, r.course.title), 'ok');
    onGepland();
  };

  const maak = () => {
    if (bezig.current || klaar) return;
    if (geblokkeerd) {
      // De knop blijft klikbaar en zet de focus op het eerste wat nog ontbreekt.
      const veld = gekozenDoelen.length === 0 ? idEersteSet : effectief === 'nieuw' ? idTitel : idEersteCursus;
      document.getElementById(veld)?.focus();
      return;
    }
    setProbleem(null);
    if (effectief === 'nieuw') maakNieuweCursus();
    else zetInBestaandeCursus();
  };

  const optioneleHint = optioneleHintTekst(nietVerplicht);
  return (
    <Modal
      title={VENSTER_TITEL}
      onClose={onClose}
      wide
      footer={(
        <div className="gt-voet">
          {klaar
            ? <p className="gt-nodig" role="status">De cursus wordt geopend…</p>
            : voet && <p id={idNodig} className="gt-nodig">{voet}</p>}
          <div className="gt-knoppen">
            <button type="button" className="btn btn-ghost gt-knop" onClick={onClose}>{ANNULEREN_TEKST}</button>
            <button
              type="button" className="btn btn-primary gt-knop"
              aria-disabled={geblokkeerd || klaar ? 'true' : undefined}
              aria-describedby={voet && !klaar ? idNodig : undefined}
              onClick={maak}
            >
              {knopTekst}
            </button>
          </div>
        </div>
      )}
    >
      <div className="gt">
        <p className="gt-intro">{VENSTER_INTRO}</p>
        <p className="gt-hint">{VENSTER_HINT}</p>
        {optioneleHint && <p className="gt-hint">{optioneleHint}</p>}
        {gegevens.telJaar !== undefined && <p className="gt-hint">{telJaarTekst(gegevens.telJaar)}</p>}

        <GatenSetsKeuze sets={open} namen={gegevens.namen} uit={uit} onZet={zetSet} eersteId={idEersteSet} />

        <fieldset className="gt-groep">
          <legend>{WAAR_LEGEND}</legend>

          <div className="gt-keuze">
            <label className="gt-keuze-rij">
              <input type="radio" name={radioNaam} checked={effectief === 'nieuw'} onChange={() => setWaar('nieuw')} />
              <span className="gt-keuze-titel">{WAAR_NIEUW}</span>
            </label>
            {effectief === 'nieuw' && (
              <div className="gt-keuze-inhoud">
                <Field label={TITEL_LABEL} hint={TITEL_HINT}>
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
            {!kanBestaand && <p id={idGeenKandidaat} className="gt-keuze-zin">{GEEN_KANDIDAAT_HINT}</p>}
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
                            <span className="gt-cursus-meta">{cursusJaarTekst(c.course.doelgroep?.jaar)} · {passendTekst(c.passend, n)}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {kandidaten.zonderPassend > 0 && <p className="gt-zonder">{zonderPassendTekst(kandidaten.zonderPassend)}</p>}
                </fieldset>
                <div className="gt-voorbeeld" aria-live="polite" aria-atomic="true">
                  {kandidaat && zin && (
                    <>
                      <p>{zin.tekst}</p>
                      {zin.metLink && (
                        <p>
                          <Link className="gt-link" to={`/leerplannen?open=${encodeURIComponent(kandidaat.leerplan.id)}`}>{OPEN_LEERPLAN_TEKST}</Link>{' '}
                          {OF_KIES_NIEUW_TEKST}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </fieldset>

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

export default GatenVenster;
