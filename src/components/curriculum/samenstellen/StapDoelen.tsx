// Stap 2 van "Stel je eigen doelenlijst samen": doelen kiezen. Per gekozen set een blok met "Hele set" (drie toestanden:
// geen, een deel, alles), een teller en de doelen als selectievakjes, gegroepeerd per rubriek. Eén zoekveld zoekt over alle
// gekozen sets, met knoppen om de gevonden doelen aan of uit te vinken. Een nieuwe set staat helemaal aangevinkt.

import { useMemo, type CSSProperties } from 'react';
import type { MinimumdoelenIndexSet } from '../../../lib/minimumdoelen';
import { geldigheidTekst, geldigheidVan, isStemSet, zoekTermen } from '../../../lib/minimumdoelenBron';
import {
  aantalGekozen, isDoelGekozen, setKenmerken, setNaam, telGekozen, telGevonden, toestandVanSet, vindDoelen, zetDoel, zetGevonden, zetHeleSet,
  type KiesbaarDoel, type SamenstelKeuze, type Toestand,
} from '../../../lib/samenstelKeuze';
import { InfoIcon } from '../../icons';
import { Field } from '../../ui';
import { groepeerPerRubriek, type DoelRij } from '../DoelenPerRubriek';
import { FoutBericht, LaadBericht } from '../LaadStatus';
import type { SetStand } from './useSetBestanden';

/** Vanaf zoveel kiesbare doelen heeft een STEM-set uitleg nodig; een kleine STEM-set kies je gewoon helemaal. */
const STEM_MIN_DOELEN = 10;

function aantalDoelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

/** "Je koos 10 doelen uit 3 sets." */
export function totaalTekst(doelen: number, sets: number): string {
  if (doelen === 0) return 'Je koos nog geen doelen.';
  return `Je koos ${aantalDoelen(doelen)} uit ${sets} ${sets === 1 ? 'set' : 'sets'}.`;
}

export function StapDoelen({
  keuze, onKeuze, indexSets, oud, stand, kiesbaar, laden, zoek, onZoek, onOpnieuw, onWeg,
}: {
  keuze: SamenstelKeuze;
  /** Past de keuze aan; werkt op de nieuwste staat, ook bij twee klikken kort na elkaar. */
  onKeuze: (wijzig: (k: SamenstelKeuze) => SamenstelKeuze) => void;
  indexSets: ReadonlyMap<string, MinimumdoelenIndexSet>;
  oud: ReadonlySet<string>;
  stand: (id: string) => SetStand;
  /** De kiesbare doelen van de sets die geladen zijn. */
  kiesbaar: ReadonlyMap<string, readonly KiesbaarDoel[]>;
  /** Hoeveel sets nog laden. */
  laden: number;
  zoek: string;
  onZoek: (zoek: string) => void;
  onOpnieuw: (id: string) => void;
  onWeg: (id: string) => void;
}) {
  const termen = useMemo(() => zoekTermen(zoek), [zoek]);
  const zoekt = termen.length > 0;
  const gevonden = useMemo(() => vindDoelen(kiesbaar, termen), [kiesbaar, termen]);
  const aantalGevonden = telGevonden(gevonden);
  const totaal = telGekozen(keuze, kiesbaar);

  return (
    <div className="il-stap-inhoud sam-stap">
      <p className="sam-totaal" aria-live="polite" aria-atomic="true">
        {laden > 0 ? 'De doelen worden geladen…' : totaalTekst(totaal.doelen, totaal.sets)}
      </p>

      <div className="sam-doelzoek">
        <Field label="Zoek in de doelen" hint="Op een woord, een code of een rubriek, in alle gekozen sets samen.">
          <input
            id="sam-doelzoek" type="search" className="input" value={zoek} placeholder="bv. energie"
            autoComplete="off" spellCheck={false} onChange={(e) => onZoek(e.target.value)}
          />
        </Field>
        <p className="sam-teller" aria-live="polite" aria-atomic="true">
          {zoekt ? `${aantalGevonden === 0 ? 'Geen doelen' : aantalDoelen(aantalGevonden)} gevonden` : ''}
        </p>
        <div className="sam-doelzoek-acties">
          <button
            type="button" className="btn btn-sm btn-ghost" disabled={!zoekt || aantalGevonden === 0}
            onClick={() => onKeuze((k) => zetGevonden(k, gevonden, true, kiesbaar))}
          >
            Vink de gevonden doelen aan
          </button>
          <button
            type="button" className="btn btn-sm btn-ghost" disabled={!zoekt || aantalGevonden === 0}
            onClick={() => onKeuze((k) => zetGevonden(k, gevonden, false, kiesbaar))}
          >
            Vink de gevonden doelen uit
          </button>
        </div>
        {!zoekt && <p className="hint sam-doelzoek-hint">Zoek een woord om een deel van de doelen in één keer aan of uit te vinken.</p>}
      </div>

      <div className="sam-blokken">
        {keuze.sets.map((id) => (
          <SetBlok
            key={id} setId={id} keuze={keuze} onKeuze={onKeuze} indexSet={indexSets.get(id)} oud={oud.has(id)} stand={stand(id)}
            kiesbaar={kiesbaar.get(id)} getoond={gevonden.get(id)} zoekt={zoekt} zoekTekst={zoek.trim()}
            onOpnieuw={() => onOpnieuw(id)} onWeg={() => onWeg(id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Eén set ─────────────────────────────────────────────────────────────────

function SetBlok({
  setId, keuze, onKeuze, indexSet, oud, stand, kiesbaar, getoond, zoekt, zoekTekst, onOpnieuw, onWeg,
}: {
  setId: string;
  keuze: SamenstelKeuze;
  onKeuze: (wijzig: (k: SamenstelKeuze) => SamenstelKeuze) => void;
  indexSet?: MinimumdoelenIndexSet;
  oud: boolean;
  stand: SetStand;
  kiesbaar?: readonly KiesbaarDoel[];
  /** De doelen die bij de zoekopdracht passen; zonder zoekopdracht alle. */
  getoond?: readonly KiesbaarDoel[];
  zoekt: boolean;
  zoekTekst: string;
  onOpnieuw: () => void;
  onWeg: () => void;
}) {
  const kop = stand.status === 'klaar' ? stand.bestand.set : indexSet;
  const naam = kop ? setNaam(kop) : setId;
  const kenmerk = kop ? setKenmerken(kop) : '';
  const geldigheid = kop ? geldigheidTekst(kop) : undefined;
  const verouderd = oud || (kop !== undefined && geldigheidVan(kop) === 'N');
  const kopId = `sam-set-${setId}`;

  return (
    <section className="card card-pad sam-blok" aria-labelledby={kopId}>
      <div className="sam-blok-kop">
        <h3 id={kopId}>
          {naam}
          {kenmerk && <span className="sr-only"> ({kenmerk})</span>}
        </h3>
        {verouderd && <span className="badge badge-warn">{kop && geldigheidVan(kop) === 'N' ? 'Niet meer geldig' : 'Oude versie'}</span>}
      </div>
      <p className="sam-blok-meta">{[kenmerk, geldigheid, setId].filter(Boolean).join(' · ')}</p>

      {stand.status === 'laden' && <LaadBericht tekst="De doelen worden geladen…" />}
      {stand.status === 'fout' && (
        <>
          <FoutBericht fout={stand.fout} onOpnieuw={onOpnieuw} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onWeg}>Haal deze set weg</button>
        </>
      )}
      {stand.status === 'klaar' && kiesbaar && (
        <GeladenSet
          setId={setId} naam={naam} kenmerk={kenmerk} keuze={keuze} onKeuze={onKeuze} kiesbaar={kiesbaar} getoond={getoond ?? kiesbaar}
          zoekt={zoekt} zoekTekst={zoekTekst} stem={isStemSet(stand.bestand.set)}
          zonderNummer={stand.bestand.doelen.length - kiesbaar.length}
        />
      )}
    </section>
  );
}

const TOESTAND_TEKST: Record<Toestand, string> = { geen: 'niets gekozen', deel: 'een deel gekozen', alle: 'alles gekozen' };

function GeladenSet({
  setId, naam, kenmerk, keuze, onKeuze, kiesbaar, getoond, zoekt, zoekTekst, stem, zonderNummer,
}: {
  setId: string;
  naam: string;
  /** Wat de set onderscheidt van andere sets met dezelfde naam (bv. de stroom); leeg als er niets is. */
  kenmerk: string;
  keuze: SamenstelKeuze;
  onKeuze: (wijzig: (k: SamenstelKeuze) => SamenstelKeuze) => void;
  kiesbaar: readonly KiesbaarDoel[];
  getoond: readonly KiesbaarDoel[];
  zoekt: boolean;
  zoekTekst: string;
  stem: boolean;
  /** Doelen in de set die je niet kan kiezen (geen vast nummer of geen tekst). */
  zonderNummer: number;
}) {
  const toestand = toestandVanSet(keuze, setId, kiesbaar);
  const gekozen = aantalGekozen(keuze, setId, kiesbaar);
  // Twee sets met dezelfde naam (bv. Nederlands in de A- en de B-stroom) moeten voor een schermlezer te onderscheiden zijn.
  const voluit = kenmerk ? `${naam} (${kenmerk})` : naam;
  const groepen = useMemo(() => {
    const rijen: DoelRij[] = getoond.map((d) => ({ key: d.id, code: d.code, tekst: d.tekst, rubriek: d.rubriek }));
    return groepeerPerRubriek(rijen);
  }, [getoond]);
  const perId = useMemo(() => new Map(getoond.map((d) => [d.id, d] as const)), [getoond]);
  // De codekolom is zo breed als de langste code van de set (met een grens), ook als de zoekopdracht er maar enkele toont.
  const codeBreedte = useMemo(() => Math.min(16, Math.max(4, kiesbaar.reduce((m, d) => Math.max(m, d.code.length), 0))) + 1, [kiesbaar]);
  const metKoppen = groepen.some((g) => g.rubriek !== '');

  return (
    <div className="sam-geladen" style={{ '--sam-code': `${codeBreedte}ch` } as CSSProperties}>
      <div className="sam-hele-rij">
        <label className="sam-hele">
          <input
            type="checkbox" checked={toestand === 'alle'} aria-label={`Hele set ${voluit}`}
            ref={(el) => { if (el) el.indeterminate = toestand === 'deel'; }}
            onChange={(e) => onKeuze((k) => zetHeleSet(k, setId, e.target.checked))}
          />
          <span>Hele set</span>
        </label>
        <span className="sam-telling">
          {gekozen} van {kiesbaar.length} gekozen
          <span className="sr-only"> ({TOESTAND_TEKST[toestand]})</span>
        </span>
      </div>

      {stem && kiesbaar.length >= STEM_MIN_DOELEN && (
        <p className="sam-stem">
          <InfoIcon size={16} className="icon-inline" /> In deze set staan wiskunde, natuurwetenschappen en techniek samen
          {toestand === 'alle'
            ? `, en nu zijn alle ${kiesbaar.length} doelen gekozen. Wil je alleen de doelen van je vak? Vink eerst ‘Hele set’ uit. Zoek daarna met een woord uit je vak (bv. ‘energie’) en vink de gevonden doelen aan.`
            : '. Zoek met een woord uit je vak (bv. ‘energie’) en vink de gevonden doelen aan.'}
        </p>
      )}
      {zonderNummer > 0 && (
        <p className="hint">{aantalDoelen(zonderNummer)} zonder vast nummer of tekst {zonderNummer === 1 ? 'staat' : 'staan'} hier niet bij: die kan je niet kiezen.</p>
      )}

      {kiesbaar.length === 0 ? (
        <p className="hint">Deze set bevat geen doelen die je kan kiezen.</p>
      ) : getoond.length === 0 ? (
        <p className="hint">Geen doelen met ‘{zoekTekst}’ in deze set.</p>
      ) : (
        groepen.map((groep) => (
          <div key={groep.rubriek || '__zonder'} className="sam-groep">
            {metKoppen && <h4 className="sam-rubriek">{groep.rubriek || 'Overige doelen'}</h4>}
            <ul className="sam-doelen" aria-label={groep.rubriek ? `Doelen van ${voluit}: ${groep.rubriek}` : `Doelen van ${voluit}`}>
              {groep.rijen.map((rij) => {
                const d = perId.get(rij.key);
                if (!d) return null;
                return (
                  <li key={d.id}>
                    <label className="sam-doel">
                      <input
                        type="checkbox" checked={isDoelGekozen(keuze, setId, d.id)}
                        onChange={(e) => onKeuze((k) => zetDoel(k, setId, d.id, e.target.checked, kiesbaar))}
                      />
                      <span className="sam-doel-code">{d.code}</span>
                      <span className="sam-doel-tekst">
                        <span className="sam-doel-zin">{d.tekst}</span>
                        {(d.attitude || d.optioneel) && (
                          <span className="sam-doel-labels">
                            {d.attitude && <span className="badge">Attitude</span>}
                            {d.optioneel && <span className="badge badge-warn">Optioneel</span>}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      {zoekt && getoond.length > 0 && getoond.length < kiesbaar.length && (
        <p className="hint">{getoond.length} van {aantalDoelen(kiesbaar.length)} staan hier. ‘Hele set’ geldt voor alle doelen van de set.</p>
      )}
    </div>
  );
}
