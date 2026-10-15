// Stap 1 van "Stel je eigen doelenlijst samen": sets kiezen. Bovenaan staat de vraag voor welke leerlingen de lijst is (gewoon of
// buitengewoon onderwijs, graad, stroom): Boosterz toont dan alleen de sets voor die leerlingen (docs/LEERPLANNEN.md § 16.2).
// Zoeken en filteren werken verder zoals op de pagina "Officiële minimumdoelen"; elke set heeft een selectievakje. Daaronder
// staan de gekozen sets, in de volgorde van kiezen, met een knop om een set weg te halen en een teller die een schermlezer
// voorleest. Kiest de leerkracht sets die niet bij elkaar horen (een set en zijn tweeling, de A- en de B-stroom), dan zegt een
// melding onder de gekozen sets het.

import { useEffect, useMemo, useRef } from 'react';
import type { MinimumdoelenIndexSet } from '../../../lib/minimumdoelen';
import {
  filterSets, geldigheidTekst, geldigheidVan, graadOpties, indexHeeftGeldigheid, oudeVersieIds, type SoortOnderwijs, type StroomFilter,
} from '../../../lib/minimumdoelenBron';
import {
  GRAAD_MET_STROMEN, MAX_GEKOZEN_SETS, ZIN_A_EN_B, ZIN_GEWOON_EN_BUITENGEWOON, ZIN_TWEELING_GEKOZEN, isSetGekozen, kanSetToevoegen,
  mengtGewoonEnBuitengewoon, mengtStromen, setKenmerken, setNaam, setsMetTweeling, tweelingParen, zinVerborgenSets, type LeerlingenFilter,
  type SamenstelKeuze,
} from '../../../lib/samenstelKeuze';
import { CloseIcon, WarningIcon } from '../../icons';
import { Field } from '../../ui';

/** Zoveel sets staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
export const SETS_PER_KEER = 60;

/** De filterstaat van stap 1: het blok "Voor welke leerlingen" (soort, graad, stroom), de zoektekst en de oude versies. */
export interface SetFilterStaat extends LeerlingenFilter {
  zoek: string;
  /** Oude versies die niet meer gelden: standaard verborgen. */
  toonOud: boolean;
}

/** Een nieuwe lijst: gewoon secundair onderwijs, alle graden, beide stromen. */
export const BEGIN_FILTER: SetFilterStaat = { zoek: '', toonOud: false, graad: '', soort: 'so', stroom: '' };

const ONDERWIJS_KEUZES: readonly { waarde: SoortOnderwijs | 'alle'; label: string }[] = [
  { waarde: 'so', label: 'Gewoon secundair onderwijs' },
  { waarde: 'buso', label: 'Buitengewoon secundair onderwijs' },
  { waarde: 'vwo', label: 'Volwassenenonderwijs' },
  { waarde: 'alle', label: 'Alle sets' },
];

const STROOM_KEUZES: readonly { waarde: StroomFilter; label: string }[] = [
  { waarde: 'A-stroom', label: 'A-stroom' },
  { waarde: 'B-stroom', label: 'B-stroom' },
  { waarde: '', label: 'Allebei' },
];

function aantalSets(n: number): string {
  return `${n} ${n === 1 ? 'set' : 'sets'}`;
}

export function StapSets({
  sets, keuze, filter, zichtbaar, onFilter, onMeer, onWissel, onWeg, verbergSetId = false,
}: {
  sets: readonly MinimumdoelenIndexSet[];
  keuze: SamenstelKeuze;
  filter: SetFilterStaat;
  zichtbaar: number;
  onFilter: (patch: Partial<SetFilterStaat>) => void;
  onMeer: () => void;
  onWissel: (id: string) => void;
  onWeg: (id: string) => void;
  /** Met een studierichting in de link staat er nergens een set-id op het scherm (zoeken op nummer blijft werken). */
  verbergSetId?: boolean;
}) {
  const gekozenKopRef = useRef<HTMLHeadingElement>(null);
  const heeftGeldigheid = useMemo(() => indexHeeftGeldigheid(sets), [sets]);
  const geldigheid = heeftGeldigheid && !filter.toonOud ? 'actueel' : 'alle';
  const graden = useMemo(() => graadOpties(sets), [sets]);
  const oud = useMemo(() => oudeVersieIds(sets), [sets]);
  const perId = useMemo(() => new Map(sets.map((s) => [s.id, s] as const)), [sets]);
  const gefilterd = useMemo(
    () => filterSets(sets, { zoek: filter.zoek, geldigheid, graad: filter.graad, soort: filter.soort, stroom: filter.stroom }),
    [sets, filter.zoek, geldigheid, filter.graad, filter.soort, filter.stroom],
  );
  // Hoeveel oude versies er bij deze filters verborgen zijn: dat zeggen we bij het vinkje.
  const verborgenOud = useMemo(
    () => (geldigheid === 'actueel'
      ? filterSets(sets, { zoek: filter.zoek, geldigheid: 'alle', graad: filter.graad, soort: filter.soort, stroom: filter.stroom }).length - gefilterd.length
      : 0),
    [sets, geldigheid, filter.zoek, filter.graad, filter.soort, filter.stroom, gefilterd.length],
  );
  // Hoeveel sets alleen wegvallen door het blok "Voor welke leerlingen" (soort onderwijs en stroom): dat zeggen we onder de resultaten.
  const verborgenLeerlingen = useMemo(
    () => filterSets(sets, { zoek: filter.zoek, geldigheid, graad: filter.graad, soort: 'alle', stroom: '' }).length - gefilterd.length,
    [sets, filter.zoek, geldigheid, filter.graad, gefilterd.length],
  );
  const vol = !kanSetToevoegen(keuze);
  // Sturen bij de gekozen sets: welke sets hebben hun tweeling ook gekozen, en mengt de keuze groepen leerlingen?
  const tweelingGekozen = useMemo(() => setsMetTweeling(tweelingParen(keuze.sets, perId)), [keuze.sets, perId]);
  const mengtSoort = useMemo(() => mengtGewoonEnBuitengewoon(keuze.sets, perId), [keuze.sets, perId]);
  const mengtStroom = useMemo(() => mengtStromen(keuze.sets, perId), [keuze.sets, perId]);

  const weg = (id: string) => {
    onWeg(id);
    // De knop verdwijnt: de focus gaat naar de kop van de gekozen sets, anders is hij kwijt.
    gekozenKopRef.current?.focus();
  };

  // "Toon alle sets" in de lege toestand: de knop verdwijnt, dus de focus gaat naar het zoekveld.
  const toonAlle = () => {
    onFilter({ ...BEGIN_FILTER, toonOud: true, soort: 'alle' });
    document.getElementById('sam-zoek')?.focus();
  };

  // "Toon alle sets" onder de resultaten: de sets voor andere leerlingen komen erbij (alleen soort en stroom veranderen).
  // De knop verdwijnt, dus de focus gaat naar het zoekveld.
  const toonAlleLeerlingen = () => {
    onFilter({ soort: 'alle', stroom: '' });
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
      <section className="sam-leerlingen" aria-labelledby="sam-leerlingen-kop">
        <h3 id="sam-leerlingen-kop">Voor welke leerlingen is deze lijst?</h3>
        <p className="sam-leerlingen-uitleg">
          Boosterz toont dan alleen de sets voor die leerlingen. Veel sets bestaan in meer versies: voor de A- en de B-stroom, en voor het gewoon
          en het buitengewoon onderwijs.
        </p>
        <fieldset className="sam-fieldset">
          <legend>Onderwijs</legend>
          <div className="sam-radios">
            {ONDERWIJS_KEUZES.map((k) => (
              <label key={k.waarde} className="sam-keuze">
                <input type="radio" name="sam-onderwijs" checked={filter.soort === k.waarde} onChange={() => onFilter({ soort: k.waarde })} />
                <span>{k.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sam-selecten">
          <Field label="Graad">
            <select className="select" value={filter.graad} onChange={(e) => onFilter({ graad: e.target.value })}>
              <option value="">Alle graden</option>
              {graden.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>
        {filter.graad === GRAAD_MET_STROMEN && (
          <fieldset className="sam-fieldset">
            <legend>Stroom</legend>
            <div className="sam-radios">
              {STROOM_KEUZES.map((k) => (
                <label key={k.label} className="sam-keuze">
                  <input type="radio" name="sam-stroom" checked={filter.stroom === k.waarde} onChange={() => onFilter({ stroom: k.waarde })} />
                  <span>{k.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <section className="sam-gekozen" aria-labelledby="sam-gekozen-kop">
        <h3 id="sam-gekozen-kop" tabIndex={-1} ref={gekozenKopRef}>Gekozen sets</h3>
        <p className="sam-teller" aria-live="polite" aria-atomic="true">
          {keuze.sets.length === 0 ? 'Nog geen sets gekozen' : `${aantalSets(keuze.sets.length)} gekozen`}
        </p>
        {keuze.sets.length > 0 && (
          <ul className="sam-chips">
            {keuze.sets.map((id) => {
              const s = perId.get(id);
              const naam = s ? `${setNaam(s)}${oud.has(id) ? ' (oude versie)' : ''}` : verbergSetId ? 'Onbekende set' : id;
              const kenmerk = s ? setKenmerken(s) : '';
              return (
                <li key={id} className="sam-chip">
                  <span className="sam-chip-tekst">
                    <span className="sam-chip-naam">{naam}</span>
                    {kenmerk && <span className="sam-chip-meta">{kenmerk}</span>}
                    {tweelingGekozen.has(id) && (
                      <span className="sam-chip-waarschuwing">
                        <WarningIcon size={14} aria-hidden="true" />
                        <span>{ZIN_TWEELING_GEKOZEN}</span>
                      </span>
                    )}
                  </span>
                  <button type="button" className="sam-chip-weg" onClick={() => weg(id)} aria-label={`Haal ${naam}${kenmerk ? ` (${kenmerk})` : ''} weg`}>
                    <CloseIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="sam-meldingen" aria-live="polite">
          {mengtSoort && (
            <p className="sam-melding"><WarningIcon size={18} aria-hidden="true" /><span>{ZIN_GEWOON_EN_BUITENGEWOON}</span></p>
          )}
          {mengtStroom && (
            <p className="sam-melding"><WarningIcon size={18} aria-hidden="true" /><span>{ZIN_A_EN_B}</span></p>
          )}
        </div>
        {vol && <p className="hint">Je kan hoogstens {MAX_GEKOZEN_SETS} sets kiezen. Haal er eerst een weg om een andere te kiezen.</p>}
      </section>

      <h3 className="sam-kop">Zoek en kies sets</h3>
      <div className="sam-filters">
        <Field
          label="Zoek een set"
          hint={verbergSetId
            ? 'Op naam, bv. ‘basisgeletterdheid’. Een vak als aardrijkskunde vindt ook ‘Ruimtelijk bewustzijn’.'
            : 'Op naam of nummer, bv. ‘basisgeletterdheid’ of ODS_3343. Een vak als aardrijkskunde vindt ook ‘Ruimtelijk bewustzijn’.'}
        >
          <input
            id="sam-zoek" type="search" className="input" value={filter.zoek} placeholder="bv. basisgeletterdheid"
            autoComplete="off" spellCheck={false} onChange={(e) => onFilter({ zoek: e.target.value })}
          />
        </Field>
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
          <p>Probeer een kortere zoekterm, een andere graad of ander onderwijs, of toon ook de oude versies.</p>
          {verborgenLeerlingen === 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={toonAlle}>Toon alle sets</button>}
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
                        {`${s.aantal} ${s.aantal === 1 ? 'doel' : 'doelen'}${verbergSetId ? '' : ` · ${s.id}`}`}
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

      {verborgenLeerlingen > 0 && (
        <div className="sam-verborgen">
          <p>{zinVerborgenSets(verborgenLeerlingen)}</p>
          <button type="button" className="btn btn-sm btn-ghost" onClick={toonAlleLeerlingen}>Toon alle sets</button>
        </div>
      )}
    </div>
  );
}
