// Stap 3 van de inleeswizard: minimumdoelen koppelen. Boosterz stelt sets voor bij graad, stroom en soort
// onderwijs, telt per set hoeveel verwijzingen uit de bron erin voorkomen en vinkt de sets met treffers
// vooraf aan. De leerkracht kan sets aan- en afvinken en met het zoekveld andere sets toevoegen.

import { useEffect, useMemo, useState } from 'react';
import type { MinimumdoelenIndexSet } from '../../../lib/minimumdoelen';
import { SOORT_LABEL, contextVanSet, filterSets, geldigheidTekst, soortVanSet } from '../../../lib/minimumdoelenBron';
import { niveauTekst, type OnderwijsKeuze } from '../../../lib/leerplanInlezen';
import { AddIcon, CheckIcon, InfoIcon, SearchIcon, WarningIcon } from '../../icons';
import { Field } from '../../ui';
import { FoutBericht, LaadBericht } from '../LaadStatus';
import type { SetStand } from './useSetKandidaten';

/** Zoveel sets staan er altijd in de lijst; de rest klapt open met "Toon alle sets". */
const ZICHTBAAR = 12;
const MAX_ZOEKRESULTATEN = 8;

function aantal(n: number, enkel: string, meer: string): string {
  return `${n.toLocaleString('nl-BE')} ${n === 1 ? enkel : meer}`;
}

function kenmerken(set: MinimumdoelenIndexSet): string {
  const soort = soortVanSet(set.naam);
  return [soort === 'so' ? '' : SOORT_LABEL[soort], set.graad, set.stroom, contextVanSet(set.naam)].filter(Boolean).join(' · ');
}

export function StapKoppelen({
  stand, onWissel, onToevoegen, onOpnieuw, aantalCodes, aantalDoelenMetVerwijzing, graad, stroom, onderwijs, herkoppelt,
}: {
  stand: SetStand;
  onWissel: (id: string) => void;
  onToevoegen: (set: MinimumdoelenIndexSet) => void;
  onOpnieuw: () => void;
  /** Aantal verschillende verwijzingen (codes) in de bron. */
  aantalCodes: number;
  aantalDoelenMetVerwijzing: number;
  graad: string;
  stroom: string;
  onderwijs: OnderwijsKeuze;
  /** De leerkracht paste in stap 4 al doelen aan: andere sets betekenen dat de verwijzingen opnieuw gekoppeld worden. */
  herkoppelt: boolean;
}) {
  const [alles, setAlles] = useState(false);
  const [zoek, setZoek] = useState('');

  // Een set die ooit aangevinkt stond, blijft in de lijst staan: afvinken laat de rij niet verdwijnen.
  const [aangevinktGeweest, setAangevinktGeweest] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setAangevinktGeweest((vorige) => (stand.gekozen.every((id) => vorige.has(id)) ? vorige : new Set([...vorige, ...stand.gekozen])));
  }, [stand.gekozen]);
  const zichtbaar = useMemo(
    () => stand.kandidaten.filter((k, i) => alles || i < ZICHTBAAR || k.treffers > 0 || stand.gekozen.includes(k.set.id) || aangevinktGeweest.has(k.set.id)),
    [stand.kandidaten, stand.gekozen, aangevinktGeweest, alles],
  );
  const verborgen = stand.kandidaten.length - zichtbaar.length;
  const metTreffers = stand.kandidaten.filter((k) => k.treffers > 0).length;
  const mislukt = stand.kandidaten.filter((k) => k.mislukt).length;

  const zoekResultaten = useMemo(() => {
    if (zoek.trim().length < 2) return null;
    const alle = filterSets(stand.indexSets, { zoek, geldigheid: 'alle', graad: '', soort: 'alle' });
    return { totaal: alle.length, getoond: alle.slice(0, MAX_ZOEKRESULTATEN) };
  }, [zoek, stand.indexSets]);
  const inLijst = useMemo(() => new Set(stand.kandidaten.map((k) => k.set.id)), [stand.kandidaten]);

  const niveau = niveauTekst(graad, stroom);
  const voor = [SOORT_LABEL[onderwijs].toLowerCase(), niveau].filter(Boolean).join(', ');

  return (
    <div className="il-stap-inhoud">
      <p className="il-uitleg">
        Een leerplan verwijst naar de officiële minimumdoelen (bv. “MD 09.01”). Boosterz zoekt de sets waarin die doelen staan, zodat elke verwijzing aan het juiste minimumdoel gekoppeld wordt.
      </p>

      {aantalCodes === 0 ? (
        <div className="callout" role="note">
          <InfoIcon size={20} className="il-callout-icoon" />
          <p>
            In de tekst staan geen verwijzingen naar minimumdoelen. Dat is niet erg: in stap 4 kan je bij elk doel zelf de minimumdoelen kiezen.
            Vink hier de sets aan waaruit je dan wilt kiezen.
          </p>
        </div>
      ) : (
        <p className="il-uitleg">
          Er staan <strong>{aantal(aantalCodes, 'verwijzing', 'verwijzingen')}</strong> in {aantal(aantalDoelenMetVerwijzing, 'doel', 'doelen')}.
        </p>
      )}

      {herkoppelt && (
        <p className="hint il-herkoppel">
          <InfoIcon size={14} className="icon-inline" /> Kies je andere sets, dan worden de verwijzingen van alle doelen opnieuw gekoppeld. Verwijzingen die je zelf aanpaste, kunnen dan verdwijnen.
        </p>
      )}

      {stand.status === 'laden' && (
        <LaadBericht
          tekst={stand.voortgang ? `De sets worden geladen… (${stand.voortgang.geladen} van ${stand.voortgang.totaal})` : 'De officiële minimumdoelen worden geladen…'}
        />
      )}
      {stand.status === 'fout' && <FoutBericht fout={stand.fout ?? 'De officiële minimumdoelen konden niet geladen worden.'} onOpnieuw={onOpnieuw} />}

      {stand.status === 'klaar' && (
        <>
          {mislukt > 0 && (
            <div className="callout warn" role="alert">
              <WarningIcon size={20} className="il-callout-icoon" />
              <div className="il-callout-tekst">
                <p>{aantal(mislukt, 'set kon', 'sets konden')} niet geladen worden. Kijk je internetverbinding na.</p>
                <button type="button" className="btn btn-sm btn-ghost" onClick={onOpnieuw}>Opnieuw proberen</button>
              </div>
            </div>
          )}

          <fieldset className="il-setlijst">
            <legend>Sets waar je leerplan naar verwijst</legend>
            <p className="hint il-setuitleg" role="status">
              {stand.kandidaten.length === 0
                ? `Er zijn geen sets gevonden voor ${voor || 'deze keuze'}. Zoek hieronder een set.`
                : aantalCodes > 0
                  ? `We keken in ${aantal(stand.kandidaten.length, 'set', 'sets')} voor ${voor || 'alle graden'}. ${metTreffers > 0 ? `${aantal(metTreffers, 'set bevat', 'sets bevatten')} verwijzingen uit je leerplan; die staan bovenaan en zijn aangevinkt.` : 'Geen enkele set bevat de verwijzingen uit je leerplan. Zoek hieronder de juiste set.'}`
                  : `Sets voor ${voor || 'alle graden'}.`}
            </p>
            <ul className="il-sets">
              {zichtbaar.map((k) => {
                const getallen = [
                  aantalCodes > 0 && !k.mislukt ? `${aantal(k.treffers, 'treffer', 'treffers')}` : '',
                  typeof k.set.aantal === 'number' ? aantal(k.set.aantal, 'doel', 'doelen') : '',
                ].filter(Boolean).join(' · ');
                const meta = [kenmerken(k.set), k.geldigheidTekst ?? geldigheidTekst(k.set)].filter(Boolean).join(' · ');
                return (
                  <li key={k.set.id}>
                    <label className={`il-set${k.treffers > 0 ? ' met-treffers' : ''}`}>
                      <input type="checkbox" checked={stand.gekozen.includes(k.set.id)} onChange={() => onWissel(k.set.id)} />
                      <span className="il-set-tekst">
                        <span className="il-set-naam">{k.set.korteNaam || k.set.naam}</span>
                        {meta && <span className="il-set-meta">{meta}</span>}
                        <span className="il-set-meta">
                          {k.mislukt ? <strong>Kon niet geladen worden</strong> : getallen}
                          {' · '}{k.set.id}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {verborgen > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAlles(true)}>Toon alle {stand.kandidaten.length} sets</button>
            )}
            {alles && stand.kandidaten.length > ZICHTBAAR && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAlles(false)}>Toon minder sets</button>
            )}
            {stand.nogOver > 0 && (
              <p className="hint">Er passen nog {aantal(stand.nogOver, 'andere set', 'andere sets')} bij deze keuze. Zoek ze hieronder op naam als je ze nodig hebt.</p>
            )}
          </fieldset>

          <div className="il-zoeken">
            <Field label="Een andere set zoeken of toevoegen" hint="Zoek op naam, korte naam of nummer (bv. ruimtelijk of ODS_3287).">
              <input
                id="il-setzoek" type="search" className="input" value={zoek} autoComplete="off" spellCheck={false}
                onChange={(e) => setZoek(e.target.value)}
              />
            </Field>
            {stand.toevoegFout && <p className="il-fout" role="alert">{stand.toevoegFout}</p>}
            {zoekResultaten && (
              <>
                <p className="hint" role="status">
                  {zoekResultaten.totaal === 0
                    ? 'Geen sets gevonden. Probeer een kortere zoekterm.'
                    : zoekResultaten.totaal > MAX_ZOEKRESULTATEN
                      ? `${aantal(zoekResultaten.totaal, 'set', 'sets')} gevonden; de eerste ${MAX_ZOEKRESULTATEN} staan hieronder. Zoek preciezer om er minder te krijgen.`
                      : `${aantal(zoekResultaten.totaal, 'set', 'sets')} gevonden.`}
                </p>
                <ul className="il-zoekresultaten">
                  {zoekResultaten.getoond.map((s) => {
                    const meta = [kenmerken(s), geldigheidTekst(s), s.id].filter(Boolean).join(' · ');
                    return (
                      <li key={s.id}>
                        <span className="il-set-tekst">
                          <span className="il-set-naam">{s.korteNaam || s.naam}</span>
                          <span className="il-set-meta">{meta}</span>
                        </span>
                        {inLijst.has(s.id) && stand.gekozen.includes(s.id) ? (
                          <span className="hint il-aangevinkt"><CheckIcon size={14} className="icon-inline" /> Aangevinkt in de lijst</span>
                        ) : inLijst.has(s.id) ? (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onWissel(s.id)}>
                            <CheckIcon size={16} /> Aanvinken<span className="sr-only">: {s.korteNaam || s.naam} ({s.id})</span>
                          </button>
                        ) : (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onToevoegen(s)}>
                            <AddIcon size={16} /> Toevoegen<span className="sr-only">: {s.korteNaam || s.naam} ({s.id})</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {!zoekResultaten && zoek.trim().length > 0 && (
              <p className="hint"><SearchIcon size={14} className="icon-inline" /> Typ minstens twee tekens.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
