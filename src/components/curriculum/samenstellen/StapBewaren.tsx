// Stap 3 van "Stel je eigen doelenlijst samen": de naam en een overzicht van de lijst zoals ze bewaard wordt. De lijst komt
// uit `leerplanUitSelectie`; waarschuwingen daarvan staan in een melding. De knop "Bewaar de lijst" staat in de pagina.

import { useMemo } from 'react';
import { BadgeCheck } from 'lucide-react';
import type { Samengesteld } from '../../../lib/doelenSamenstellen';
import { InfoIcon, WarningIcon } from '../../icons';
import { Field } from '../../ui';
import { DoelenPerRubriek, type DoelRij } from '../DoelenPerRubriek';

function aantalDoelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

export function StapBewaren({
  resultaat, titel, voorstel, onTitel, onVoorstel, vak, onVak,
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
}) {
  const { leerplan, bevestigd, waarschuwingen } = resultaat;
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

      {waarschuwingen.length > 0 && (
        <div className="callout warn sam-waarschuwing" role="note">
          <WarningIcon size={20} className="il-callout-icoon" />
          <div className="il-callout-tekst">
            <p><strong>{waarschuwingen.length === 1 ? 'Let op' : 'Let op: enkele dingen'}</strong></p>
            <ul>{waarschuwingen.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        </div>
      )}

      <h3 className="sam-kop">Zo wordt je lijst bewaard</h3>
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
                {aantalDoelen(leerplan.goals.length)} uit {sets} {sets === 1 ? 'set' : 'sets'}. Deze lijst kon niet als nagekeken bevestigd worden. Je kan ze wel
                bewaren; kijk ze later na bij Leerplannen.
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
