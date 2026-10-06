// Stap 1 van "Stel je eigen doelenlijst samen": sets kiezen. Zoeken en filteren werken zoals op de pagina "Officiële
// minimumdoelen"; elke set heeft een selectievakje. Bovenaan staan de gekozen sets, in de volgorde van kiezen, met een knop
// om een set weg te halen en een teller die een schermlezer voorleest.

import { useEffect, useMemo, useRef } from 'react';
import type { MinimumdoelenIndexSet } from '../../../lib/minimumdoelen';
import {
  SOORT_LABEL, filterSets, geldigheidTekst, geldigheidVan, graadOpties, indexHeeftGeldigheid, oudeVersieIds, soortVanSet, type SoortOnderwijs,
} from '../../../lib/minimumdoelenBron';
import { MAX_GEKOZEN_SETS, isSetGekozen, kanSetToevoegen, setKenmerken, setNaam, type SamenstelKeuze } from '../../../lib/samenstelKeuze';
import { CloseIcon } from '../../icons';
import { Field } from '../../ui';

/** Zoveel sets staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
export const SETS_PER_KEER = 60;
const SOORT_VOLGORDE: SoortOnderwijs[] = ['so', 'buso', 'vwo', 'ander'];

export interface SetFilterStaat {
  zoek: string;
  /** Oude versies die niet meer gelden: standaard verborgen. */
  toonOud: boolean;
  graad: string;
  soort: SoortOnderwijs | 'alle';
}

export const BEGIN_FILTER: SetFilterStaat = { zoek: '', toonOud: false, graad: '', soort: 'alle' };

function aantalSets(n: number): string {
  return `${n} ${n === 1 ? 'set' : 'sets'}`;
}

export function StapSets({
  sets, keuze, filter, zichtbaar, onFilter, onMeer, onWissel, onWeg,
}: {
  sets: readonly MinimumdoelenIndexSet[];
  keuze: SamenstelKeuze;
  filter: SetFilterStaat;
  zichtbaar: number;
  onFilter: (patch: Partial<SetFilterStaat>) => void;
  onMeer: () => void;
  onWissel: (id: string) => void;
  onWeg: (id: string) => void;
}) {
  const gekozenKopRef = useRef<HTMLHeadingElement>(null);
  const heeftGeldigheid = useMemo(() => indexHeeftGeldigheid(sets), [sets]);
  const geldigheid = heeftGeldigheid && !filter.toonOud ? 'actueel' : 'alle';
  const graden = useMemo(() => graadOpties(sets), [sets]);
  const soorten = useMemo(() => {
    const aanwezig = new Set(sets.map((s) => soortVanSet(s.naam)));
    return SOORT_VOLGORDE.filter((s) => aanwezig.has(s));
  }, [sets]);
  const oud = useMemo(() => oudeVersieIds(sets), [sets]);
  const perId = useMemo(() => new Map(sets.map((s) => [s.id, s] as const)), [sets]);
  const gefilterd = useMemo(
    () => filterSets(sets, { zoek: filter.zoek, geldigheid, graad: filter.graad, soort: filter.soort }),
    [sets, filter.zoek, geldigheid, filter.graad, filter.soort],
  );
  // Hoeveel oude versies er bij deze filters verborgen zijn: dat zeggen we bij het vinkje.
  const verborgenOud = useMemo(
    () => (geldigheid === 'actueel' ? filterSets(sets, { zoek: filter.zoek, geldigheid: 'alle', graad: filter.graad, soort: filter.soort }).length - gefilterd.length : 0),
    [sets, geldigheid, filter.zoek, filter.graad, filter.soort, gefilterd.length],
  );
  const vol = !kanSetToevoegen(keuze);

  const weg = (id: string) => {
    onWeg(id);
    // De knop verdwijnt: de focus gaat naar de kop van de gekozen sets, anders is hij kwijt.
    gekozenKopRef.current?.focus();
  };

  // "Toon alle sets" in de lege toestand: de knop verdwijnt, dus de focus gaat naar het zoekveld.
  const toonAlle = () => {
    onFilter({ ...BEGIN_FILTER, toonOud: true });
    document.getElementById('sam-zoek')?.focus();
  };

  // "Toon meer sets" bij de laatste reeks: de knop verdwijnt, dus de focus gaat naar het eerste nieuwe selectievakje.
  // `focusVanaf` onthoudt hoeveel sets er stonden; het effect zet de focus nadat de nieuwe reeks getoond is.
  const lijstRef = useRef<HTMLUListElement>(null);
  const focusVanaf = useRef<number | null>(null);
  const meer = () => {
    if (gefilterd.length <= zichtbaar + SETS_PER_KEER) focusVanaf.current = zichtbaar;
    onMeer();
  };
  useEffect(() => {
    const vanaf = focusVanaf.current;
    if (vanaf === null) return;
    focusVanaf.current = null;
    lijstRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[vanaf]?.focus();
  }, [zichtbaar]);

  return (
    <div className="il-stap-inhoud sam-stap">
      <section className="sam-gekozen" aria-labelledby="sam-gekozen-kop">
        <h3 id="sam-gekozen-kop" tabIndex={-1} ref={gekozenKopRef}>Gekozen sets</h3>
        <p className="sam-teller" aria-live="polite" aria-atomic="true">
          {keuze.sets.length === 0 ? 'Nog geen sets gekozen' : `${aantalSets(keuze.sets.length)} gekozen`}
        </p>
        {keuze.sets.length > 0 && (
          <ul className="sam-chips">
            {keuze.sets.map((id) => {
              const s = perId.get(id);
              const naam = s ? `${setNaam(s)}${oud.has(id) ? ' (oude versie)' : ''}` : id;
              const kenmerk = s ? setKenmerken(s) : '';
              return (
                <li key={id} className="sam-chip">
                  <span className="sam-chip-tekst">
                    <span className="sam-chip-naam">{naam}</span>
                    {kenmerk && <span className="sam-chip-meta">{kenmerk}</span>}
                  </span>
                  <button type="button" className="sam-chip-weg" onClick={() => weg(id)} aria-label={`Haal ${naam}${kenmerk ? ` (${kenmerk})` : ''} weg`}>
                    <CloseIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {vol && <p className="hint">Je kan hoogstens {MAX_GEKOZEN_SETS} sets kiezen. Haal er eerst een weg om een andere te kiezen.</p>}
      </section>

      <h3 className="sam-kop">Zoek en kies sets</h3>
      <div className="sam-filters">
        <Field label="Zoek een set" hint="Op naam of nummer, bv. ‘basisgeletterdheid’ of ODS_3343. Een vak als aardrijkskunde vindt ook ‘Ruimtelijk bewustzijn’.">
          <input
            id="sam-zoek" type="search" className="input" value={filter.zoek} placeholder="bv. basisgeletterdheid"
            autoComplete="off" spellCheck={false} onChange={(e) => onFilter({ zoek: e.target.value })}
          />
        </Field>
        <div className="sam-selecten">
          <Field label="Graad">
            <select className="select" value={filter.graad} onChange={(e) => onFilter({ graad: e.target.value })}>
              <option value="">Alle graden</option>
              {graden.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Soort onderwijs">
            <select className="select" value={filter.soort} onChange={(e) => onFilter({ soort: e.target.value as SoortOnderwijs | 'alle' })}>
              <option value="alle">Alle soorten</option>
              {soorten.map((s) => <option key={s} value={s}>{SOORT_LABEL[s]}</option>)}
            </select>
          </Field>
        </div>
        {heeftGeldigheid && (
          <div className="sam-oud">
            <label className="sam-oud-label">
              <input type="checkbox" checked={filter.toonOud} onChange={(e) => onFilter({ toonOud: e.target.checked })} />
              <span>Toon ook oude versies die niet meer gelden</span>
            </label>
            <p className="sam-oud-hint">
              {filter.toonOud
                ? 'Oude versies staan in de lijst met “(oude versie)” achter hun naam. Je hebt ze alleen nodig voor oudere leerplannen of cursussen.'
                : verborgenOud > 0
                  ? `${verborgenOud} oude ${verborgenOud === 1 ? 'versie' : 'versies'} verborgen. Je hebt ze alleen nodig voor oudere leerplannen of cursussen.`
                  : 'Alleen sets die nu gelden.'}
            </p>
          </div>
        )}
      </div>

      <p className="sam-teller" aria-live="polite" aria-atomic="true">
        {gefilterd.length === 0 ? 'Geen sets gevonden' : `${aantalSets(gefilterd.length)} gevonden`}
      </p>

      {gefilterd.length === 0 ? (
        <div className="sam-leeg">
          <p><strong>Geen sets die hierbij passen.</strong></p>
          <p>Probeer een kortere zoekterm, een andere graad of soort, of toon ook de oude versies.</p>
          <button type="button" className="btn btn-sm btn-ghost" onClick={toonAlle}>Toon alle sets</button>
        </div>
      ) : (
        <>
          <ul className="sam-sets" aria-label="Sets minimumdoelen" ref={lijstRef}>
            {gefilterd.slice(0, zichtbaar).map((s) => {
              const gekozen = isSetGekozen(keuze, s.id);
              const isOud = oud.has(s.id);
              const geldig = geldigheidTekst(s);
              const kenmerk = setKenmerken(s);
              return (
                <li key={s.id}>
                  <label className="sam-set">
                    <input type="checkbox" checked={gekozen} disabled={!gekozen && vol} onChange={() => onWissel(s.id)} />
                    <span className="sam-set-tekst">
                      <span className="sam-set-naam">{setNaam(s)}{isOud ? ' (oude versie)' : ''}</span>
                      {kenmerk && <span className="sam-set-meta">{kenmerk}</span>}
                      <span className="sam-set-meta">
                        {geldig && <span className={`sam-set-geldig${isOud || geldigheidVan(s) === 'N' ? ' oud' : ''}`}>{geldig}</span>}
                        {geldig && ' · '}
                        {`${s.aantal} ${s.aantal === 1 ? 'doel' : 'doelen'} · ${s.id}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {gefilterd.length > zichtbaar && (
            <div className="sam-meer">
              <button type="button" className="btn btn-ghost" onClick={meer}>
                Toon meer sets ({zichtbaar} van {gefilterd.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
