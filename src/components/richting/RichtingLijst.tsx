// De lijst met studierichtingen (docs/STUDIERICHTINGEN.md § 14.2): filters, een kop per graad en 60 richtingen per keer.
//
// De filters staan in de adresbalk (`graad`, `finaliteit`, `zoek`, `meer`, `afgebouwd`), telkens met `replace`: zo laat een
// stap terug uit een richting de lijst zoals ze was. Een ongeldige waarde in de adresbalk wordt stil genegeerd.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BackIcon, InfoIcon } from '../icons';
import { Field } from '../ui';
import { FoutBericht, LaadBericht } from '../curriculum/LaadStatus';
import { MijnRichtingen } from './MijnRichtingen';
import { graadTekst } from '../../lib/doelgroep';
import { datumLeesbaar } from '../../lib/minimumdoelenBron';
import { FINALITEIT_LABEL, filterRichtingen, kenmerkenVan, type RichtingFilter, type RichtingInfo } from '../../lib/richtingKader';
import { STRUCTUUR_NAAMSVERMELDING } from '../../lib/studierichtingen';
import { FOUT_NOG_NIET_OPGEHAALD, type RichtingGegevens } from '../../lib/studierichtingenBron';
import type { Laadstand } from '../../lib/useLaadstand';

/** Zoveel richtingen staan er per keer in de lijst; "Toon meer" voegt er evenveel bij. */
export const RICHTINGEN_PER_KEER = 60;
export const LIJST_ROUTE = '/cursussen/richtingen';
const SAMENSTELLEN_ROUTE = '/leerplannen/samenstellen';
const MAX_ZOEK = 80;
const FINALITEITEN = ['DO', 'DU', 'A'] as const;

/** Wat de lijst en het detail van de pagina krijgen. */
export interface RichtingPaginaProps {
  stand: Laadstand<RichtingGegevens>;
  opnieuw: () => void;
  /** JJJJ-MM-DD: bepaalt wat afgebouwd is. */
  vandaag: string;
}

// ── De adresbalk ────────────────────────────────────────────────────────────

export interface LijstFilters {
  graad?: 1 | 2 | 3;
  finaliteit?: (typeof FINALITEITEN)[number];
  zoek: string;
  meer: boolean;
  afgebouwd: boolean;
}

/** De filters uit de adresbalk. Wat niet klopt, wordt genegeerd; de finaliteit telt niet in de 1ste graad. */
export function leesFilters(params: URLSearchParams): LijstFilters {
  const g = params.get('graad');
  const graad = g === '1' ? 1 : g === '2' ? 2 : g === '3' ? 3 : undefined;
  const f = params.get('finaliteit');
  const finaliteit = FINALITEITEN.find((x) => x === f);
  return {
    ...(graad !== undefined ? { graad } : {}),
    ...(finaliteit !== undefined && graad !== 1 ? { finaliteit } : {}),
    zoek: (params.get('zoek') ?? '').slice(0, MAX_ZOEK),
    meer: params.get('meer') === '1',
    afgebouwd: params.get('afgebouwd') === '1',
  };
}

// ── Gedeelde onderdelen van lijst en detail ─────────────────────────────────

/** De melding als de bestanden van de studierichtingen nog niet in Boosterz staan (nog geen eerste ophaling). */
export function NogGeenData() {
  return (
    <div className="callout ri-melding" role="status">
      <InfoIcon size={20} className="ri-melding-icoon" />
      <div className="ri-melding-tekst">
        <p>
          {FOUT_NOG_NIET_OPGEHAALD} Intussen kan je doelen kiezen met ‘<Link to={SAMENSTELLEN_ROUTE}>Zelf doelen samenstellen</Link>’.
        </p>
      </div>
    </div>
  );
}

/** Eén van de drie toestanden als de gegevens er nog niet zijn: laden, nog niet opgehaald, of een fout. */
export function GegevensStand({ stand, opnieuw }: { stand: Exclude<Laadstand<RichtingGegevens>, { status: 'klaar' }>; opnieuw: () => void }) {
  if (stand.status === 'laden') return <LaadBericht tekst="De studierichtingen worden geladen…" />;
  if (stand.fout === FOUT_NOG_NIET_OPGEHAALD) return <NogGeenData />;
  return <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />;
}

/**
 * "Bron: Vlaamse overheid, Departement Onderwijs en Vorming (API Structuuronderdelen), opgehaald op 9 oktober 2026." (de
 * naamsvermelding begint zelf met "Bron:"). Een `toevoeging` komt tussen haakjes achter de datum.
 */
export function bronTekst(gegevens: RichtingGegevens, toevoeging?: string): string {
  const naam = gegevens.matrix.naamsvermelding.trim() || STRUCTUUR_NAAMSVERMELDING;
  const datum = datumLeesbaar(gegevens.matrix.opgehaald);
  return `${naam}${datum ? `, opgehaald op ${datum}` : ''}${toevoeging ? ` (${toevoeging})` : ''}.`;
}

// ── De lijst ────────────────────────────────────────────────────────────────

const GRADEN: { graad: 1 | 2 | 3 | undefined; kop: string }[] = [
  { graad: 1, kop: graadTekst(1) },
  { graad: 2, kop: graadTekst(2) },
  { graad: 3, kop: graadTekst(3) },
  { graad: undefined, kop: 'Andere' },
];

function RichtingRij({ info, id, lijstZoek }: { info: RichtingInfo; id: string; lijstZoek: string }) {
  return (
    <li>
      <Link id={id} className="ri-rij" to={`${LIJST_ROUTE}/${info.groep.nummer}`} state={{ lijst: lijstZoek }}>
        <span className="ri-rij-titel">{info.groep.titel}</span>
        <span className="ri-rij-meta">{kenmerkenVan(info)}</span>
        {(info.duaal || info.afgebouwd || info.nietMeerInBron !== undefined) && (
          <span className="ri-badges">
            {info.duaal && <span className="badge">Duaal mogelijk</span>}
            {info.afgebouwd && <span className="badge badge-warn">Afgebouwd</span>}
            {info.nietMeerInBron !== undefined && <span className="badge badge-warn">Niet meer in de officiële matrix</span>}
          </span>
        )}
      </Link>
    </li>
  );
}

function telTekst(n: number): string {
  return n === 0 ? 'Geen richting gevonden. Pas de filters aan.' : `${n} ${n === 1 ? 'richting' : 'richtingen'}`;
}

export function RichtingLijst({ stand, opnieuw, vandaag }: RichtingPaginaProps) {
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const filters = useMemo(() => leesFilters(params), [params]);
  const [zoekTekst, setZoekTekst] = useState(filters.zoek);

  const zet = useCallback((patch: Record<string, string | undefined>) => {
    setParams((vorige) => {
      const volgende = new URLSearchParams(vorige);
      for (const [sleutel, waarde] of Object.entries(patch)) {
        if (waarde === undefined || waarde === '') volgende.delete(sleutel);
        else volgende.set(sleutel, waarde);
      }
      return volgende;
    }, { replace: true });
  }, [setParams]);

  // Het zoekveld reageert meteen; de adresbalk volgt even later, zodat niet elke toets de geschiedenis aanraakt. Verandert de
  // adresbalk buiten ons om (een stap terug, een link), dan volgt het veld haar.
  const urlZoek = filters.zoek;
  const geschreven = useRef(urlZoek);
  useEffect(() => {
    if (urlZoek === geschreven.current) return;
    geschreven.current = urlZoek;
    setZoekTekst(urlZoek);
  }, [urlZoek]);
  useEffect(() => {
    const waarde = zoekTekst.trim();
    if (waarde === geschreven.current) return;
    const timer = window.setTimeout(() => {
      geschreven.current = waarde;
      zet({ zoek: waarde || undefined });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [zoekTekst, zet]);

  const matrix = stand.status === 'klaar' ? stand.waarde.matrix : undefined;
  const gefilterd = useMemo(() => {
    if (!matrix) return [];
    const filter: RichtingFilter = {
      ...(filters.graad !== undefined ? { graad: filters.graad } : {}),
      ...(filters.finaliteit !== undefined ? { finaliteit: filters.finaliteit } : {}),
      zoek: zoekTekst,
      ookMeer: filters.meer,
      afgebouwd: filters.afgebouwd,
    };
    return filterRichtingen(matrix, filter, vandaag);
  }, [matrix, filters.graad, filters.finaliteit, filters.meer, filters.afgebouwd, zoekTekst, vandaag]);

  // Per graad een groep, in de volgorde van de graden; "Toon meer" telt over alle groepen heen.
  const geordend = useMemo(
    () => GRADEN.flatMap((g) => gefilterd.filter((i) => i.graad === g.graad).map((info) => ({ info, kop: g.kop }))),
    [gefilterd],
  );
  const filterSleutel = JSON.stringify([filters.graad, filters.finaliteit, zoekTekst, filters.meer, filters.afgebouwd]);
  const [getoond, setGetoond] = useState({ sleutel: filterSleutel, aantal: RICHTINGEN_PER_KEER });
  const aantal = getoond.sleutel === filterSleutel ? getoond.aantal : RICHTINGEN_PER_KEER;
  const zichtbaar = geordend.slice(0, aantal);
  const koppen = GRADEN.map((g) => ({ kop: g.kop, rijen: zichtbaar.map((z, i) => ({ ...z, i })).filter((z) => z.kop === g.kop) })).filter((k) => k.rijen.length > 0);

  // Na "Toon meer" gaat de focus naar de eerste nieuwe richting, anders staat het toetsenbord nog onderaan de oude lijst.
  const focusNaar = useRef<number | null>(null);
  useEffect(() => {
    if (focusNaar.current === null) return;
    document.getElementById(`ri-rij-${focusNaar.current}`)?.focus();
    focusNaar.current = null;
  }, [aantal]);
  const toonMeer = () => {
    focusNaar.current = aantal;
    setGetoond({ sleutel: filterSleutel, aantal: aantal + RICHTINGEN_PER_KEER });
  };

  const kiesGraad = (graad: string) => zet({ graad: graad || undefined, ...(graad === '1' ? { finaliteit: undefined } : {}) });

  return (
    <>
      <Link to="/cursussen" className="btn btn-sm btn-quiet ri-terug"><BackIcon size={16} /> Cursussen</Link>
      <div className="page-head">
        <div className="ri-intro">
          <h1>Doelen en cursussen per studierichting</h1>
          <p className="sub">
            Kies een studierichting en een jaar. Je ziet welke officiële minimumdoelen erbij horen, maakt er meteen een cursus mee en volgt wat je cursussen samen dekken.
          </p>
        </div>
      </div>

      <MijnRichtingen stand={stand} vandaag={vandaag} lijstZoek={search} />

      <details className="callout mat-details ri-hoe">
        <summary>
          <InfoIcon size={20} />
          <span>Hoe werkt dit?</span>
          <span className="ri-chevron" aria-hidden="true" />
        </summary>
        <div className="mat-details-body">
          <p>
            De studierichtingen komen uit de officiële matrix van het secundair onderwijs. Welke minimumdoelen bij een richting horen, komt uit de
            Onderwijsdoelen-API van de Vlaamse overheid. Boosterz haalt beide elke maand op en verzint geen koppelingen.
          </p>
          <p>
            De minimumdoelen gelden per graad, niet per jaar. Welke doelen je in welk jaar behandelt, staat in het leerplan van je net.
          </p>
          <p>
            Leerplannen van de netten levert Boosterz niet mee: ze zijn auteursrechtelijk beschermd. Je vindt ze op de site van je net en leest het leerplan van je school zelf in.
          </p>
        </div>
      </details>

      {stand.status !== 'klaar' && <GegevensStand stand={stand} opnieuw={opnieuw} />}

      {stand.status === 'klaar' && (
        <>
          <div className="ri-filters">
            <fieldset className="ri-fieldset">
              <legend>Graad</legend>
              <div className="ri-radios">
                {[{ w: '', t: 'Alle graden' }, { w: '1', t: graadTekst(1) }, { w: '2', t: graadTekst(2) }, { w: '3', t: graadTekst(3) }].map((o) => (
                  <label key={o.w} className="ri-keuze">
                    <input type="radio" name="ri-graad" checked={String(filters.graad ?? '') === o.w} onChange={() => kiesGraad(o.w)} />
                    <span>{o.t}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {filters.graad !== 1 && (
              <Field label="Finaliteit">
                <select className="select" value={filters.finaliteit ?? ''} onChange={(e) => zet({ finaliteit: e.target.value || undefined })}>
                  <option value="">Alle finaliteiten</option>
                  {FINALITEITEN.map((code) => <option key={code} value={code}>{FINALITEIT_LABEL[code]}</option>)}
                </select>
              </Field>
            )}
            <Field label="Zoek een richting">
              <input
                type="search" className="input" value={zoekTekst} placeholder="bv. Humane wetenschappen" maxLength={MAX_ZOEK}
                autoComplete="off" spellCheck={false} onChange={(e) => setZoekTekst(e.target.value)}
              />
            </Field>
            <label className="ri-vink">
              <input type="checkbox" checked={filters.meer} onChange={(e) => zet({ meer: e.target.checked ? '1' : undefined })} />
              <span>Toon ook 7de jaren, aanloopjaren en buitengewoon secundair onderwijs</span>
            </label>
            <label className="ri-vink">
              <input type="checkbox" checked={filters.afgebouwd} onChange={(e) => zet({ afgebouwd: e.target.checked ? '1' : undefined })} />
              <span>Toon ook afgebouwde richtingen</span>
            </label>
          </div>

          <p className="ri-aantal" aria-live="polite" aria-atomic="true">{telTekst(geordend.length)}</p>

          {koppen.map((k) => (
            <div key={k.kop} className="ri-graad">
              <h2>{k.kop}</h2>
              <ul className="ri-lijst">
                {k.rijen.map((r) => <RichtingRij key={r.info.groep.nummer} info={r.info} id={`ri-rij-${r.i}`} lijstZoek={search} />)}
              </ul>
            </div>
          ))}

          {geordend.length > aantal && (
            <div className="ri-meer">
              <button type="button" className="btn btn-ghost" onClick={toonMeer}>Toon meer</button>
            </div>
          )}

          <p className="ri-bron">{bronTekst(stand.waarde)}</p>
        </>
      )}
    </>
  );
}
