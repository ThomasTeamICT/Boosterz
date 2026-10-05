// Venster om minimumdoelen aan te wijzen: de doelen van de gekozen sets, per set en rubriek, met een
// zoekveld (op code en tekst, zonder accenten) en een vakje per doel. Geeft de gekozen verwijzingen
// terug (set + vast nummer + code). Wat het doel al had, staat aangevinkt. Gebruikt in stap 4 van de
// inleeswizard en in de editor van een leerplan.
//
// Toetsenbord en schermlezer: de Modal vangt de focus en sluit met Escape; elk doel is een vakje met als
// naam zijn code en tekst; het aantal gevonden en gekozen doelen wordt aangekondigd.

import { useMemo, useState } from 'react';
import type { MinimumdoelRef } from '../../lib/curriculumTypes';
import { filterKiezerRijen, kiezerSets, refSleutel, resultaatVanKiezer, type KiezerRij } from '../../lib/minimumdoelKiezen';
import type { MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { laadSet } from '../../lib/minimumdoelenBron';
import { useLaadstand } from '../../lib/useLaadstand';
import { Field, Modal } from '../ui';
import { FoutBericht, LaadBericht } from './LaadStatus';
import '../../styles/kiezer.css';

/** Zoveel doelen staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
const STAP = 200;

interface Groep { rubriek: string; rijen: KiezerRij[] }
interface ZichtbareSet { setId: string; naam: string; groepen: Groep[] }

/** De rijen per set en rubriek, in volgorde van het eerste voorkomen, met samen hoogstens `max` rijen. */
function groepeer(sets: readonly { setId: string; naam: string; rijen: KiezerRij[] }[], max: number): ZichtbareSet[] {
  let over = max;
  const uit: ZichtbareSet[] = [];
  for (const s of sets) {
    if (over <= 0) break;
    const groepen = new Map<string, Groep>();
    for (const r of s.rijen.slice(0, over)) {
      const g = groepen.get(r.rubriek) ?? { rubriek: r.rubriek, rijen: [] };
      g.rijen.push(r);
      groepen.set(r.rubriek, g);
    }
    over -= Math.min(over, s.rijen.length);
    uit.push({ setId: s.setId, naam: s.naam, groepen: [...groepen.values()] });
  }
  return uit;
}

export function MinimumdoelKiezer({
  setIds, gekozen, voorgeladen, titel = 'Minimumdoelen kiezen', onKies, onClose,
}: {
  /** De sets waaruit gekozen wordt, in deze volgorde. */
  setIds: readonly string[];
  /** Wat het doel al heeft: staat aangevinkt. */
  gekozen: readonly MinimumdoelRef[];
  /** Sets die de aanroeper al geladen heeft: die worden niet nog eens opgehaald. */
  voorgeladen?: ReadonlyMap<string, MinimumdoelenSetBestand>;
  titel?: string;
  onKies: (verwijzingen: MinimumdoelRef[]) => void;
  onClose: () => void;
}) {
  const { stand, opnieuw } = useLaadstand(setIds.join('|'), () =>
    Promise.all(setIds.map((id) => voorgeladen?.get(id) ?? laadSet(id))),
  );
  const [zoek, setZoek] = useState('');
  const [limiet, setLimiet] = useState(STAP);
  const [aangevinkt, setAangevinkt] = useState<ReadonlySet<string>>(() => new Set(gekozen.map(refSleutel)));

  const sets = useMemo(() => (stand.status === 'klaar' ? kiezerSets(stand.waarde) : []), [stand]);
  const gefilterd = useMemo(() => sets.map((s) => ({ ...s, rijen: filterKiezerRijen(s.rijen, zoek) })).filter((s) => s.rijen.length > 0), [sets, zoek]);
  const totaal = gefilterd.reduce((n, s) => n + s.rijen.length, 0);
  const zichtbaar = useMemo(() => groepeer(gefilterd, limiet), [gefilterd, limiet]);
  const aantalGekozen = sets.reduce((n, s) => n + s.rijen.filter((r) => aangevinkt.has(r.sleutel)).length, 0);

  const wissel = (sleutel: string) =>
    setAangevinkt((vorige) => {
      const nieuw = new Set(vorige);
      if (nieuw.has(sleutel)) nieuw.delete(sleutel);
      else nieuw.add(sleutel);
      return nieuw;
    });

  return (
    <Modal
      title={titel}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button type="button" className="btn btn-primary" disabled={stand.status !== 'klaar'} onClick={() => onKies(resultaatVanKiezer(sets, gekozen, aangevinkt))}>
            Verwijzingen bewaren{stand.status === 'klaar' ? ` (${aantalGekozen})` : ''}
          </button>
        </>
      }
    >
      <p className="kz-uitleg">Vink de minimumdoelen aan waar dit doel naar verwijst. Je kan zoeken op code of op een woord uit de tekst.</p>
      {setIds.length === 0 && <div className="kz-leeg"><p>Er zijn geen sets gekozen om uit te kiezen.</p></div>}
      {setIds.length > 0 && stand.status === 'laden' && <LaadBericht tekst="De minimumdoelen worden geladen…" />}
      {stand.status === 'fout' && <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />}
      {stand.status === 'klaar' && (
        <>
          <Field label="Zoek een minimumdoel" hint="Op code (bv. 09.02) of op een woord uit de tekst">
            <input
              type="search" className="input" value={zoek} autoComplete="off" spellCheck={false}
              onChange={(e) => { setZoek(e.target.value); setLimiet(STAP); }}
            />
          </Field>
          <p className="kz-aantal" aria-live="polite" aria-atomic="true">
            {totaal === 0 ? 'Geen minimumdoelen gevonden' : `${totaal} ${totaal === 1 ? 'minimumdoel' : 'minimumdoelen'} gevonden`} · {aantalGekozen} gekozen
          </p>
          {totaal === 0 && (
            <div className="kz-leeg"><p>{zoek.trim() ? 'Er is geen minimumdoel dat bij deze zoekterm past. Probeer een kortere zoekterm.' : 'Deze sets bevatten geen minimumdoelen die je kan aanwijzen.'}</p></div>
          )}
          {zichtbaar.map((s) => (
            <section key={s.setId} className="kz-set" aria-labelledby={`kz-set-${s.setId}`}>
              <h3 id={`kz-set-${s.setId}`} className="kz-set-kop">{s.naam}</h3>
              {s.groepen.map((g) => (
                <fieldset key={g.rubriek || '__zonder'} className="kz-groep">
                  <legend className={g.rubriek ? 'kz-rubriek' : 'sr-only'}>{g.rubriek || `Doelen van ${s.naam}`}</legend>
                  <ul className="kz-lijst">
                    {g.rijen.map((r) => (
                      <li key={r.sleutel}>
                        <label className="kz-rij">
                          <input type="checkbox" checked={aangevinkt.has(r.sleutel)} onChange={() => wissel(r.sleutel)} />
                          <span className="kz-code">{r.ref.code}</span>
                          <span className="kz-tekst">{r.tekst}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ))}
            </section>
          ))}
          {totaal > limiet && (
            <div className="kz-meer">
              <button type="button" className="btn btn-ghost" onClick={() => setLimiet((l) => l + STAP)}>Toon meer ({limiet} van {totaal})</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
