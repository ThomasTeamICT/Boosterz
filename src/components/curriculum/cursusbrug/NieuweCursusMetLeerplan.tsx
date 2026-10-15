// Venster "Nieuwe cursus met deze doelen" (docs/LEERPLANNEN.md § 16.5): een nieuwe cursus die aan een leerplan hangt dat al op dit
// toestel staat. De leerkracht geeft de cursus een titel en kiest hoe ze begint: met een geraamte (een hoofdstuk per set, een
// sectie per rubriek en de doelcodes al op de secties), met een lege cursus, of met de AI (alleen met een eigen sleutel; het
// venster geeft het leerplan door aan de cursusbouwer). Zonder AI maakt het venster de cursus zelf (`cursusVoorRichting`, met
// de doelgroep van het leerplan als die er is) en zegt het nooit "gemaakt" bij een volle opslag.
//
// Het leerplan wordt hier niet bewaard of aangepast: het staat er al. Dit bestand wordt pas bij de klik geladen (zie
// CursusBrugKnoppen), want richtingCursus is zwaar.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasAIKey } from '../../../lib/ai';
import { saveCourse } from '../../../lib/courses';
import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import {
  BEGIN_AI_GEEN_SLEUTEL, BEGIN_AI_LINK, BEGIN_AI_TITEL, BEGIN_AI_ZIN, BEGIN_GERAAMTE_TITEL, BEGIN_GERAAMTE_ZIN, BEGIN_LEEG_TITEL,
  BEGIN_LEEG_ZIN, FOUT_AI_OVERDRACHT, FOUT_CURSUS_NIET_BEWAARD, FOUT_CURSUS_ONVERWACHT, KNOP_ANNULEREN, KNOP_MAAK_DE_CURSUS,
  NIEUW_HOE, NIEUW_TITEL, NIEUW_VELD_TITEL, NOG_NODIG_TITEL, toastCursusMetGeraamte, toastLegeCursus,
} from '../../../lib/cursusBrugTeksten';
import { doelgroepVoorCursus } from '../../../lib/doelgroep';
import { setHandoff } from '../../../lib/handoff';
import { cursusVoorRichting, type Startvorm } from '../../../lib/richtingCursus';
import { getPrefs } from '../../../lib/storage';
import { WarningIcon } from '../../icons';
import { Field, Modal, useToast } from '../../ui';
import '../../../styles/richtingcursus.css';
import '../../../styles/cursusbrug.css';

type Begin = Startvorm | 'ai';

const ID_TITEL = 'cb-nieuw-titel';
const NODIG_ID = 'cb-nieuw-nodig';

/** Het aantal verschillende doelcodes dat op de secties van de cursus staat. */
function aantalCodes(cursus: Course): number {
  const codes = new Set<string>();
  for (const h of cursus.chapters) for (const s of h.sections) for (const c of s.goalCodes ?? []) codes.add(c);
  return codes.size;
}

export function NieuweCursusMetLeerplan({ leerplan, onClose }: {
  leerplan: Curriculum;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [titel, setTitel] = useState(leerplan.title);
  const [begin, setBegin] = useState<Begin>('geraamte');
  const [probleem, setProbleem] = useState('');
  /** De cursus is gemaakt en het scherm gaat verder: een tweede klik telt niet meer. */
  const [klaar, setKlaar] = useState(false);
  const bezig = useRef(false);
  /**
   * Blijft staan na een geslaagde actie. Een ref, geen state: laadt de editor nog, dan kan het venster (een portal) even
   * blijven staan met de oude handler, en die ziet een ref wel (een tweede klik maakt anders een tweede cursus).
   */
  const gedaan = useRef(false);
  const probleemRef = useRef<HTMLDivElement>(null);

  // De melding krijgt de focus, zodat een schermlezer ze voorleest en een toetsenbordgebruiker er niet naast belandt.
  useEffect(() => {
    if (!probleem) return;
    probleemRef.current?.scrollIntoView?.({ block: 'nearest' });
    probleemRef.current?.focus();
  }, [probleem]);

  const metSleutel = hasAIKey();
  const titelLeeg = titel.trim() === '';

  const maak = () => {
    if (bezig.current || gedaan.current || klaar) return;
    if (titelLeeg) {
      document.getElementById(ID_TITEL)?.focus();
      return;
    }
    setProbleem('');
    bezig.current = true;
    try {
      const naam = titel.trim();
      if (begin === 'ai') {
        // De cursusbouwer krijgt het leerplan en de titel; welke doelen ze gebruikt, kiest de leerkracht daar.
        const doelgroep = doelgroepVoorCursus(leerplan.doelgroep);
        const overgedragen = setHandoff({
          source: '', title: naam, curriculumId: leerplan.id, goalCodes: [], ...(doelgroep ? { doelgroep } : {}),
        });
        if (!overgedragen) {
          setProbleem(FOUT_AI_OVERDRACHT);
          return;
        }
        gedaan.current = true;
        setKlaar(true);
        navigate('/cursussen?ai=nieuw');
        return;
      }
      const cursus = cursusVoorRichting({ titel: naam, auteur: getPrefs().teacherName, doelgroep: leerplan.doelgroep, leerplan, start: begin });
      // De uitkomst wordt gecontroleerd: een volle of geblokkeerde opslag mag nooit "Cursus gemaakt" zeggen.
      if (!saveCourse(cursus)) {
        setProbleem(FOUT_CURSUS_NIET_BEWAARD);
        return;
      }
      const codes = aantalCodes(cursus);
      gedaan.current = true;
      setKlaar(true);
      toast(begin === 'geraamte' ? toastCursusMetGeraamte(cursus.chapters.length, codes, leerplan.title) : toastLegeCursus(leerplan.title), 'ok');
      navigate(`/cursus/bewerk/${cursus.id}`);
    } catch {
      setProbleem(FOUT_CURSUS_ONVERWACHT);
    } finally {
      bezig.current = false;
    }
  };

  return (
    <Modal
      title={NIEUW_TITEL}
      onClose={onClose}
      wide
      footer={(
        <div className="rc-voet">
          {titelLeeg && <p id={NODIG_ID} className="rc-nodig">{NOG_NODIG_TITEL}</p>}
          <div className="rc-voet-knoppen">
            <button type="button" className="btn btn-ghost rc-knop" onClick={onClose}>{KNOP_ANNULEREN}</button>
            <button
              type="button" className="btn btn-primary rc-knop" aria-disabled={titelLeeg || klaar ? 'true' : undefined}
              aria-describedby={titelLeeg ? NODIG_ID : undefined} onClick={maak}
            >
              {KNOP_MAAK_DE_CURSUS}
            </button>
          </div>
        </div>
      )}
    >
      <div className="rc">
        <Field label={NIEUW_VELD_TITEL}>
          <input
            id={ID_TITEL} className="input" value={titel} maxLength={120} autoComplete="off" required aria-required="true"
            onChange={(e) => setTitel(e.target.value)}
          />
        </Field>

        <fieldset className="rc-groep">
          <legend>{NIEUW_HOE}</legend>
          <div className="rc-keuze">
            <label className="rc-keuze-rij">
              <input type="radio" name="cb-begin" checked={begin === 'geraamte'} aria-describedby="cb-b-geraamte" onChange={() => setBegin('geraamte')} />
              <span className="rc-keuze-titel">{BEGIN_GERAAMTE_TITEL}</span>
            </label>
            <p id="cb-b-geraamte" className="rc-keuze-zin">{BEGIN_GERAAMTE_ZIN}</p>
          </div>
          <div className="rc-keuze">
            <label className="rc-keuze-rij">
              <input type="radio" name="cb-begin" checked={begin === 'leeg'} aria-describedby="cb-b-leeg" onChange={() => setBegin('leeg')} />
              <span className="rc-keuze-titel">{BEGIN_LEEG_TITEL}</span>
            </label>
            <p id="cb-b-leeg" className="rc-keuze-zin">{BEGIN_LEEG_ZIN}</p>
          </div>
          <div className="rc-keuze">
            <label className="rc-keuze-rij">
              <input
                type="radio" name="cb-begin" checked={begin === 'ai'} aria-describedby="cb-b-ai"
                aria-disabled={metSleutel ? undefined : 'true'}
                onChange={() => { if (metSleutel) setBegin('ai'); }}
              />
              <span className="rc-keuze-titel">{BEGIN_AI_TITEL}</span>
            </label>
            <p id="cb-b-ai" className="rc-keuze-zin">
              {metSleutel
                ? BEGIN_AI_ZIN
                : (
                  <>
                    {BEGIN_AI_GEEN_SLEUTEL} <Link to="/ai-instellingen">{BEGIN_AI_LINK}</Link>
                  </>
                )}
            </p>
          </div>
        </fieldset>

        {probleem && (
          <div className="callout err rc-melding" role="alert" tabIndex={-1} ref={probleemRef}>
            <WarningIcon size={18} />
            <p>{probleem}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
