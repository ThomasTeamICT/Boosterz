// Venster "Studierichting van deze cursus" (docs/STUDIERICHTINGEN.md § 12.3 en § 14.5).
//
// Kies een richting uit de matrix van de studierichtingen (graad, zoeken, keuzerondjes) en het jaar; de keuze komt terug als
// `Doelgroep` (`doelgroepVan`). Het venster wordt lui geladen vanuit de cursusinstellingen, zodat de cursuseditor klein blijft.
// Alleen de matrix wordt opgehaald: de doelen van de richting zijn hier niet nodig.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { jaarTekst, type Doelgroep } from '../../lib/doelgroep';
import {
  filterRichtingen,
  kenmerkenVan,
  richtingInfo,
  type RichtingFilter,
  type RichtingInfo,
} from '../../lib/richtingKader';
import { beginFilter, bevestigRichting, huidigeEerst, isOngewijzigd, type KiezerFilter } from '../../lib/richtingVenster';
import { zegOntbreekt } from '../../lib/samenstelKeuze';
import { FOUT_NOG_NIET_OPGEHAALD, laadMatrix } from '../../lib/studierichtingenBron';
import { useLaadstand } from '../../lib/useLaadstand';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { WarningIcon } from '../icons';
import { Field, Modal } from '../ui';
import '../../styles/richtingcursus.css';

/** Props vast (§ 12.3). `onKies(undefined)` is "geen richting"; deze keuzelijst zelf geeft altijd een richting terug. */
export interface RichtingKiezerModalProps {
  titel: string;
  huidig: Doelgroep | undefined;
  onKies: (d: Doelgroep | undefined) => void;
  onClose: () => void;
}

/** Zoveel richtingen staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
const PER_KEER = 30;

type GraadKeuze = '' | '1' | '2' | '3';

const GRADEN: { waarde: GraadKeuze; label: string }[] = [
  { waarde: '', label: 'Alle graden' },
  { waarde: '1', label: '1ste graad' },
  { waarde: '2', label: '2de graad' },
  { waarde: '3', label: '3de graad' },
];

/** Vandaag als JJJJ-MM-DD, op de dag van dit toestel (voor wat afgebouwd is). */
function vandaagTekst(): string {
  const d = new Date();
  const twee = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
}

export function RichtingKiezerModal({ titel, huidig, onKies, onClose }: RichtingKiezerModalProps) {
  const matrix = useLaadstand('richting-matrix', laadMatrix);
  const vandaag = useMemo(() => vandaagTekst(), []);

  /** Waarmee het venster opende: de richting en de graad waarmee de lijst begint. Wijzigingen van `huidig` tellen daarna niet meer mee. */
  const [start] = useState(() => ({
    groep: huidig?.groep,
    graad: huidig?.graad === 1 || huidig?.graad === 2 || huidig?.graad === 3 ? huidig.graad : undefined,
  }));
  /** Wat de leerkracht aan de filters wijzigde; zolang dat niet gebeurde, geldt het beginfilter. */
  const [filterEigen, setFilterEigen] = useState<KiezerFilter | null>(null);
  const [zoek, setZoek] = useState('');
  const [zichtbaar, setZichtbaar] = useState(PER_KEER);
  const [groep, setGroep] = useState<string | null>(huidig?.groep ?? null);
  const [jaar, setJaar] = useState<number | undefined>(huidig?.jaar);
  const [buso, setBuso] = useState(huidig?.soort === 'buso');
  const zoekNu = useDeferredValue(zoek);

  const bestand = matrix.stand.status === 'klaar' ? matrix.stand.waarde : null;
  // De lijst begint zo dat de huidige richting erin staat (ook een 7de jaar of een afgebouwde richting).
  const beginFilterWaarde = useMemo<KiezerFilter>(
    () => (bestand ? beginFilter(bestand, start.groep, start.graad, vandaag) : { graad: start.graad, ookMeer: false, afgebouwd: false }),
    [bestand, start, vandaag],
  );
  const filter = filterEigen ?? beginFilterWaarde;
  const graad: GraadKeuze = filter.graad === undefined ? '' : (String(filter.graad) as GraadKeuze);
  const { ookMeer, afgebouwd } = filter;
  // De richting waarmee het venster opende staat bovenaan de lijst, met haar keuzerondje aangevinkt.
  const lijst = useMemo<RichtingInfo[]>(() => {
    if (!bestand) return [];
    const f: RichtingFilter = { graad: filter.graad, zoek: zoekNu, ookMeer, afgebouwd };
    return huidigeEerst(filterRichtingen(bestand, f, vandaag), start.groep);
  }, [bestand, filter.graad, zoekNu, ookMeer, afgebouwd, vandaag, start]);
  const gekozen = useMemo(() => (bestand && groep ? richtingInfo(bestand, groep, vandaag) : undefined), [bestand, groep, vandaag]);
  const zetFilter = (patch: Partial<KiezerFilter>) => setFilterEigen({ ...filter, ...patch });

  const wijzigFilter = (doe: () => void) => {
    doe();
    setZichtbaar(PER_KEER);
  };

  // "Toon meer" bij de laatste reeks: de knop verdwijnt, dus de focus gaat naar het eerste nieuwe keuzerondje.
  const lijstRef = useRef<HTMLUListElement>(null);
  const focusVanaf = useRef<number | null>(null);
  const toonMeer = () => {
    if (lijst.length <= zichtbaar + PER_KEER) focusVanaf.current = zichtbaar;
    setZichtbaar((z) => z + PER_KEER);
  };
  useEffect(() => {
    const vanaf = focusVanaf.current;
    if (vanaf === null) return;
    focusVanaf.current = null;
    lijstRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]')[vanaf]?.focus();
  }, [zichtbaar]);

  // Focus: de gedeelde Modal zet de focus na 30 ms op het eerste veld dat er dan is. Dat is de knop "Annuleren" in de voet
  // (de lijst laadt nog) of het eerste graadrondje. Zodra de lijst er staat, gaat de focus naar het zoekveld, tenzij de
  // leerkracht de focus intussen zelf in de inhoud zette.
  const inhoudRef = useRef<HTMLDivElement>(null);
  const zoekRef = useRef<HTMLInputElement>(null);
  const lijstKlaar = bestand !== null;
  useEffect(() => {
    if (!lijstKlaar) return undefined;
    const t = setTimeout(() => {
      const actief = document.activeElement;
      const voet = inhoudRef.current?.closest('.modal')?.querySelector('.modal-footer');
      const eersteVeld = inhoudRef.current?.querySelector('input');
      if (!actief || actief === document.body || actief === eersteVeld || voet?.contains(actief)) zoekRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [lijstKlaar]);

  // Het jaar: één jaar of geen jaren is geen keuze; in de 1ste graad volgt het jaar uit de groep (§ 14.3).
  const jarenKeuze = gekozen !== undefined && gekozen.graad !== 1 && gekozen.jaren.length > 1 ? gekozen.jaren : [];
  const jaarBijKeuze = (info: RichtingInfo): number | undefined => {
    if (info.jaren.length === 1) return info.jaren[0];
    if (info.graad === 1) return undefined;
    return jaar !== undefined && info.jaren.includes(jaar) ? jaar : undefined;
  };

  // Dezelfde richting bevestigen zonder iets te wijzigen laat de doelgroep ongemoeid (ook als de kiezer er zelf het enige
  // jaar van de richting bij zou zetten); alleen het jaar wijzigen laat het onderdeel en het vak staan (`bevestigRichting`).
  const kies = () => {
    if (!gekozen) return;
    if (huidig && isOngewijzigd(huidig, { groep, jaar, buso })) {
      onKies(huidig);
      return;
    }
    onKies(bevestigRichting(
      gekozen,
      { groep: gekozen.groep.nummer, jaar: jaarBijKeuze(gekozen), soort: buso && gekozen.kanBuso ? 'buso' : 'so' },
      huidig,
    ));
  };
  const nodig = gekozen ? '' : zegOntbreekt([{ tekst: 'een richting' }]);
  const nodigId = 'rc-kies-nodig';

  const getoond = lijst.slice(0, zichtbaar);
  const aantal = lijst.length;
  const teller = aantal === 0 ? 'Geen richting gevonden. Pas de filters aan.' : aantal === 1 ? '1 richting' : `${aantal} richtingen`;

  return (
    <Modal
      title={titel}
      onClose={onClose}
      footer={(
        <div className="rc-voet">
          {nodig && <p id={nodigId} className="rc-nodig">{nodig}</p>}
          <div className="rc-voet-knoppen">
            <button type="button" className="btn btn-ghost rc-knop" onClick={onClose}>Annuleren</button>
            <button
              type="button" className="btn btn-primary rc-knop" aria-disabled={gekozen ? undefined : 'true'}
              aria-describedby={gekozen ? undefined : nodigId} onClick={kies}
            >
              Kies deze richting
            </button>
          </div>
        </div>
      )}
    >
      <div className="rc rc-kiezer" ref={inhoudRef}>
        {matrix.stand.status === 'laden' && <LaadBericht tekst="De studierichtingen worden geladen…" />}
        {matrix.stand.status === 'fout' && (
          matrix.stand.fout === FOUT_NOG_NIET_OPGEHAALD
            ? (
              <div className="callout warn rc-melding" role="alert">
                <WarningIcon size={18} />
                <p>{matrix.stand.fout}</p>
              </div>
            )
            : <FoutBericht fout={matrix.stand.fout} onOpnieuw={matrix.opnieuw} />
        )}
        {bestand && (
          <>
            <fieldset className="rc-groep">
              <legend>Graad</legend>
              <div className="rc-radiorij">
                {GRADEN.map((g) => (
                  <label key={g.waarde || 'alle'} className="rc-radio">
                    <input
                      type="radio" name="rc-graad" checked={graad === g.waarde}
                      onChange={() => wijzigFilter(() => zetFilter({ graad: g.waarde === '' ? undefined : (Number(g.waarde) as 1 | 2 | 3) }))}
                    />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Zoek een richting">
              <input
                ref={zoekRef} type="search" className="input" value={zoek} placeholder="bv. Humane wetenschappen" autoComplete="off" spellCheck={false}
                onChange={(e) => wijzigFilter(() => setZoek(e.target.value))}
              />
            </Field>
            <label className="rc-vink">
              <input type="checkbox" checked={ookMeer} onChange={(e) => wijzigFilter(() => zetFilter({ ookMeer: e.target.checked }))} />
              <span>Toon ook 7de jaren, aanloopjaren en buitengewoon secundair onderwijs</span>
            </label>
            <label className="rc-vink">
              <input type="checkbox" checked={afgebouwd} onChange={(e) => wijzigFilter(() => zetFilter({ afgebouwd: e.target.checked }))} />
              <span>Toon ook afgebouwde richtingen</span>
            </label>

            <p className="rc-teller" aria-live="polite" aria-atomic="true">{teller}</p>
            {aantal > 0 && (
              <fieldset className="rc-groep rc-richtingen-groep">
                <legend className="sr-only">Studierichting</legend>
                <ul className="rc-richtingen" ref={lijstRef}>
                  {getoond.map((r) => (
                    <li key={r.groep.nummer}>
                      <label className="rc-richting">
                        <input
                          type="radio" name="rc-richting" checked={groep === r.groep.nummer}
                          onChange={() => {
                            setGroep(r.groep.nummer);
                            // Terug naar de richting waarmee het venster opende: haar jaar en soort komen ook terug.
                            const terug = huidig !== undefined && r.groep.nummer === huidig.groep;
                            setJaar(terug ? huidig.jaar : undefined);
                            setBuso(terug && huidig.soort === 'buso');
                          }}
                        />
                        <span className="rc-richting-tekst">
                          <span className="rc-richting-naam">{r.groep.titel}</span>
                          <span className="rc-richting-meta">{kenmerkenVan(r)}</span>
                          {(r.duaal || r.afgebouwd) && (
                            <span className="rc-badges">
                              {r.duaal && <span className="badge badge-brand">Duaal mogelijk</span>}
                              {r.afgebouwd && <span className="badge badge-warn">Afgebouwd</span>}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {aantal > zichtbaar && (
              <div className="rc-meer">
                <button type="button" className="btn btn-ghost" onClick={toonMeer}>
                  Toon meer ({zichtbaar} van {aantal})
                </button>
              </div>
            )}

            <p className="rc-gekozen" aria-live="polite" aria-atomic="true">
              {gekozen ? `Gekozen: ${gekozen.groep.titel} (${kenmerkenVan(gekozen)})` : 'Nog geen richting gekozen.'}
            </p>

            {jarenKeuze.length > 0 && (
              <fieldset className="rc-groep">
                <legend>Jaar</legend>
                <div className="rc-radiorij">
                  {jarenKeuze.map((j) => (
                    <label key={j} className="rc-radio">
                      <input type="radio" name="rc-jaar" checked={jaar === j} onChange={() => setJaar(j)} />
                      <span>{jaarTekst(j)}</span>
                    </label>
                  ))}
                  <label className="rc-radio">
                    <input type="radio" name="rc-jaar" checked={jaar === undefined} onChange={() => setJaar(undefined)} />
                    <span>{jarenKeuze.length === 2 ? 'Beide jaren (de hele graad)' : 'Alle jaren (de hele graad)'}</span>
                  </label>
                </div>
                <p className="rc-uitleg">De minimumdoelen gelden voor de hele graad. Het jaar bepaalt voor welke cursussen je werkt en wat de dekking telt.</p>
              </fieldset>
            )}

            {gekozen?.kanBuso && (
              <label className="rc-vink">
                <input type="checkbox" checked={buso} onChange={(e) => setBuso(e.target.checked)} />
                <span>Buitengewoon secundair onderwijs, opleidingsvorm 4</span>
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
