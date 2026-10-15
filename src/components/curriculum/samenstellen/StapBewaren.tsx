// Stap 3 van "Stel je eigen doelenlijst samen": de naam en een overzicht van de lijst zoals ze bewaard wordt. De lijst komt
// uit `leerplanUitSelectie`; waarschuwingen daarvan staan in een melding. De knop "Bewaar de lijst" staat in de pagina.
// Bevat de lijst tweelingen (dezelfde sets voor het gewoon en het buitengewoon onderwijs) of mengt ze de A- en de B-stroom,
// dan staat er boven "Let op" een melding met één klik om het op te lossen (docs/LEERPLANNEN.md § 16.3).

import { useMemo, type RefObject } from 'react';
import { BadgeCheck } from 'lucide-react';
import type { Samengesteld } from '../../../lib/doelenSamenstellen';
import { ZIN_LIJST_MENGT_STROMEN, zinTweelingenInLijst } from '../../../lib/samenstelKeuze';
import { InfoIcon, WarningIcon } from '../../icons';
import { Field } from '../../ui';
import { DoelenPerRubriek, type DoelRij } from '../DoelenPerRubriek';

function aantalDoelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

/**
 * Wat er na "zie de melding hierboven" staat bij een lijst die niet als nagekeken bevestigd kon worden. Normaal kan de leerkracht
 * ze toch bewaren (met het label ‘niet nagekeken’). Met een studierichting bewaart de pagina enkel een lijst die nagekeken is:
 * dan is er één zin, zonder het advies erachter (dat zegt hetzelfde).
 */
export function nietBevestigdTekst(alleenNagekeken: boolean): string {
  return alleenNagekeken
    ? 'Los dit op om de lijst te kunnen bewaren.'
    : 'Je kan ze wel bewaren; ze krijgt dan het label ‘niet nagekeken’. Pas je keuze aan om dat op te lossen.';
}

/** De meldingen met een eenklikoplossing in stap 3, en wat de pagina daarvoor aanlevert. */
export interface SturingStap3 {
  /** Hoeveel sets van elk (gewoon en buitengewoon) in de lijst staan als ze elkaars tweeling zijn; `undefined` = geen melding. */
  tweelingen?: number;
  /** De lijst mengt de A- en de B-stroom: toon de melding. */
  mengtStromen?: boolean;
  onTweeling: (keuze: 'so' | 'buso' | 'allebei') => void;
  onStroom: (keuze: 'A-stroom' | 'B-stroom' | 'allebei') => void;
  /** De statusregel na een eenklikactie ("De sets voor … zijn weggehaald. Je lijst telt nu … doelen."); leeg = niets. */
  status: string;
  /** Waarschuwingen die de tweelingmelding vervangt: ze staan dan niet ook nog in "Let op". */
  verberg: readonly string[];
}

export function StapBewaren({
  resultaat, titel, voorstel, onTitel, onVoorstel, vak, onVak, alleenNagekeken = false, sturing, kopRef,
}: {
  resultaat: Samengesteld;
  titel: string;
  /** De naam die Boosterz voorstelt; leeg als er niets gekozen is. */
  voorstel: string;
  onTitel: (titel: string) => void;
  /** Terug naar het voorstel (alleen als de naam aangepast is). */
  onVoorstel: () => void;
  vak: string;
  onVak: (vak: string) => void;
  /** Met een studierichting bewaart de pagina alleen een lijst die nagekeken is: dan kan een lijst die dat niet is, niet bewaard worden. */
  alleenNagekeken?: boolean;
  /** De eenklikmeldingen over tweelingen en stromen; zonder: alleen de gewone waarschuwingen. */
  sturing?: SturingStap3;
  /** De focus gaat na een eenklikactie naar de kop "Zo wordt je lijst bewaard". */
  kopRef?: RefObject<HTMLHeadingElement>;
}) {
  const { leerplan, bevestigd } = resultaat;
  const verberg = sturing?.verberg ?? [];
  const waarschuwingen = verberg.length > 0 ? resultaat.waarschuwingen.filter((w) => !verberg.includes(w)) : resultaat.waarschuwingen;
  const rijen = useMemo<DoelRij[]>(() => leerplan.goals.map((g) => ({
    key: g.id,
    code: g.code,
    tekst: g.text,
    rubriek: g.theme,
    labels: g.note?.trim().toLowerCase() === 'optioneel' ? <span className="badge badge-warn">Optioneel</span> : undefined,
  })), [leerplan.goals]);
  const sets = leerplan.minimumdoelenSets?.length ?? 0;
  const naamAangepast = titel.trim() !== voorstel.trim() && voorstel !== '';

  return (
    <div className="il-stap-inhoud sam-stap">
      <div className="sam-velden">
        <Field label="Naam van de lijst" hint="Je ziet de lijst onder deze naam bij Leerplannen.">
          <input id="sam-titel" className="input" value={titel} onChange={(e) => onTitel(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Vak" hint="Niet verplicht, bv. Natuurwetenschappen.">
          <input id="sam-vak" className="input" value={vak} onChange={(e) => onVak(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      {naamAangepast && (
        <p className="sam-voorstel">
          <button type="button" className="btn btn-sm btn-quiet" onClick={onVoorstel}>Gebruik het voorstel: {voorstel}</button>
        </p>
      )}

      {sturing?.tweelingen !== undefined && (
        <div className="callout warn sam-sturing" role="group" aria-label="Voor welke leerlingen is deze lijst?">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>{zinTweelingenInLijst(sturing.tweelingen)}</p>
            <div className="sam-sturing-knoppen">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sturing.onTweeling('so')}>Gewoon secundair onderwijs</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sturing.onTweeling('buso')}>Buitengewoon secundair onderwijs</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sturing.onTweeling('allebei')}>Allebei houden</button>
            </div>
          </div>
        </div>
      )}
      {sturing?.mengtStromen && (
        <div className="callout warn sam-sturing" role="group" aria-label="Voor welke stroom is deze lijst?">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p>{ZIN_LIJST_MENGT_STROMEN}</p>
            <div className="sam-sturing-knoppen">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sturing.onStroom('A-stroom')}>A-stroom</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sturing.onStroom('B-stroom')}>B-stroom</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sturing.onStroom('allebei')}>Allebei houden</button>
            </div>
          </div>
        </div>
      )}
      {sturing && <p className="sam-status" aria-live="polite" aria-atomic="true">{sturing.status}</p>}

      {waarschuwingen.length > 0 && (
        <div className="callout warn sam-waarschuwing" role="note">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p><strong>{waarschuwingen.length === 1 ? 'Let op' : 'Let op: enkele dingen'}</strong></p>
            <ul>{waarschuwingen.map((w, i) => <li key={`${i}:${w}`}>{w}</li>)}</ul>
          </div>
        </div>
      )}

      <h3 className="sam-kop" tabIndex={-1} ref={kopRef}>Zo wordt je lijst bewaard</h3>
      {leerplan.goals.length > 0 && (
        bevestigd ? (
          <p className="sam-nagekeken">
            <BadgeCheck size={18} className="icon-inline" aria-hidden="true" /> {aantalDoelen(leerplan.goals.length)} uit {sets} {sets === 1 ? 'set' : 'sets'}.
            Elk doel staat letterlijk zoals in de officiële bron, dus de lijst is meteen nagekeken.
          </p>
        ) : (
          <div className="callout warn" role="note">
            <InfoIcon size={20} className="il-callout-icoon" />
            <div className="il-callout-tekst">
              <p>
                {aantalDoelen(leerplan.goals.length)} uit {sets} {sets === 1 ? 'set' : 'sets'}. Deze lijst kon niet als nagekeken bevestigd worden: zie de melding
                hierboven. {nietBevestigdTekst(alleenNagekeken)}
              </p>
            </div>
          </div>
        )
      )}
      {leerplan.goals.length === 0 ? (
        <p className="hint">Er zijn nog geen doelen gekozen. Ga terug naar stap 2 om doelen te kiezen.</p>
      ) : (
        <DoelenPerRubriek rijen={rijen} />
      )}
    </div>
  );
}
