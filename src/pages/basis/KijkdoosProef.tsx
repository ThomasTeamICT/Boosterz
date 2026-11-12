// Voorlopige ontwikkelpagina van de kijkdoos van de Lichtkamer (LK-5): #/basis/proef/kijkdoos.
//
// Nergens naar gelinkt. Ze toont de kijkdoos met eenvoudige knoppen, zodat de kijkdoos te openen, te sluiten en te
// vergelijken is met het prototype zolang de echte schermen er niet zijn. De panelen (LK-6) en de drie schermen (LK-8)
// vervangen deze pagina; dan verdwijnen dit bestand, de tak 'kijkdoosproef' in basisRoutes.ts en BasisDeel.tsx.
//
// Zoekopdracht (voor de proefscripts): ?scene=voorspel|kaartjes|onderzoek, ?stand=auto|hoog|midden|laag, ?bord=1,
// ?voorwerp=boom|huis|kind, ?meet (de meetstand van de kijkdoos zelf).
//
// Met ?les=kind, ?les=bord of ?les=uitproberen toont de pagina in plaats van de losse kijkdoos de les van LK-6
// (LichtkamerLes: oefeningen, check, klasvraag, 'Wat ik al kan'). Bij ?les=bord zet ze html[data-bord], zoals het
// echte scherm van LK-8 het zal doen. Met ?scherm=keuze|waar-valt-de-schaduw|drie-kaartjes|onderzoek-schaduw|check|kan
// opent de les meteen op dat scherm.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LichtkamerLes, type LesScherm, type LesStand } from '../../components/basis/lichtkamer/LichtkamerLes';
import { useKindBewijs } from '../../components/basis/lichtkamer/useKindBewijs';
import {
  GAAT_HOOGTES,
  STANDAARD_AFSTANDEN,
  VOORWERPEN,
  beginStand as beginKaartjes,
  zetGat,
  zetLamp,
  type Voorwerp,
} from '../../lib/basis/lichtkamer';
import { openKijkdoos, type Kijkdoos, type KijkdoosStatus, type SceneToestand, type StandKeuze, type Zicht } from '../../components/basis/kijkdoos';
import '../../styles/basis-lichtkamer.css';

const SCENE_NAAM = { voorspel: 'Waar valt de schaduw?', kaartjes: 'Drie kaartjes', onderzoek: 'Onderzoek' } as const;
const STAND_KEUZES: StandKeuze[] = ['auto', 'hoog', 'midden', 'laag'];
const ZICHT_NAAM: Record<Zicht, string> = { voor: 'Voor', schuin: 'Schuin', opzij: 'Opzij', boven: 'Boven' };
const GAAT_NAAM = ['laag', 'midden', 'hoog'];

function beginToestand(scene: string | null): SceneToestand {
  if (scene === 'kaartjes') return { scene: 'kaartjes', stand: beginKaartjes() };
  if (scene === 'onderzoek') return { scene: 'onderzoek', afstandCm: 30 };
  return { scene: 'voorspel', ronde: 0, getoond: false };
}

declare global {
  interface Window {
    /** Alleen op deze ontwikkelpagina: de open kijkdoos, voor de proefscripts. */
    __lkKijkdoos?: Kijkdoos | null;
  }
}

const LES_STANDEN: readonly LesStand[] = ['kind', 'bord', 'uitproberen'];
const LES_SCHERMEN: readonly LesScherm[] = ['keuze', 'waar-valt-de-schaduw', 'drie-kaartjes', 'onderzoek-schaduw', 'check', 'kan'];

function LesProef({ stand, scherm }: { stand: LesStand; scherm?: LesScherm }) {
  // Alleen het kindscherm spiegelt zijn bewijs (naar de sessionStorage van het tabblad); het bord en uitproberen niet.
  const kindBewijs = useKindBewijs();
  useEffect(() => {
    if (stand !== 'bord') return;
    const html = document.documentElement;
    html.dataset.bord = '';
    return () => {
      delete html.dataset.bord;
    };
  }, [stand]);
  return (
    <section className="b-lk-proef">
      <h1>Proef: de les van de Lichtkamer ({stand})</h1>
      <p>Een ontwikkelpagina voor de les van het schaduwtheater (einde 4de leerjaar). Ze verdwijnt als de schermen van LK-8 klaar zijn.</p>
      <LichtkamerLes stand={stand} bewijs={stand === 'kind' ? kindBewijs : null} beginScherm={scherm} />
    </section>
  );
}

export function KijkdoosProef() {
  const { search } = useLocation();
  const [p] = useState(() => new URLSearchParams(search));
  const les = (LES_STANDEN as readonly string[]).includes(p.get('les') ?? '') ? (p.get('les') as LesStand) : null;
  const scherm = (LES_SCHERMEN as readonly string[]).includes(p.get('scherm') ?? '') ? (p.get('scherm') as LesScherm) : undefined;
  return les ? <LesProef stand={les} scherm={scherm} /> : <LosseKijkdoos p={p} />;
}

function LosseKijkdoos({ p }: { p: URLSearchParams }) {
  const vak = useRef<HTMLDivElement>(null);
  const doosRef = useRef<Kijkdoos | null>(null);
  const [open, setOpen] = useState(true);
  const [keer, setKeer] = useState(0);
  const [status, setStatus] = useState<KijkdoosStatus>('laden');
  const [toestand, setToestand] = useState<SceneToestand>(() => beginToestand(p.get('scene')));
  const [stand, setStand] = useState<StandKeuze>(() => (STAND_KEUZES as string[]).includes(p.get('stand') ?? '') ? (p.get('stand') as StandKeuze) : 'auto');
  const [voorwerp, setVoorwerp] = useState<Voorwerp>(() => ((VOORWERPEN as string[]).includes(p.get('voorwerp') ?? '') ? (p.get('voorwerp') as Voorwerp) : 'boom'));
  const [stralen, setStralen] = useState(false);
  const [kalm, setKalm] = useState(false);
  const [beschrijving, setBeschrijving] = useState('');
  const [huidigeStand, setHuidigeStand] = useState<string>('');

  // Eén kijkdoos per keer dat ze opent; de rest gaat via de methodes.
  const begin = useRef({ toestand, stand, voorwerp, stralen, kalm });
  begin.current = { toestand, stand, voorwerp, stralen, kalm };
  useEffect(() => {
    const el = vak.current;
    if (!open || !el) return;
    const b = begin.current;
    const d = openKijkdoos(el, {
      toestand: b.toestand,
      stand: b.stand,
      bord: p.get('bord') === '1',
      voorwerp: b.voorwerp,
      stralen: b.stralen,
      prikkelarm: b.kalm,
      opWijziging: (t) => setToestand(t),
      opBeschrijving: (t) => setBeschrijving(t),
      opStatus: (s) => {
        setStatus(s);
        setHuidigeStand(d.stand ?? '');
      },
    });
    doosRef.current = d;
    window.__lkKijkdoos = d;
    return () => {
      d.sluit();
      doosRef.current = null;
      window.__lkKijkdoos = null;
    };
  }, [open, keer, p]);

  const toon = (t: SceneToestand) => {
    setToestand(t);
    doosRef.current?.toon(t);
  };

  return (
    <section className="b-lk-proef">
      <h1>Proef: de kijkdoos van de Lichtkamer</h1>
      <p>
        Een ontwikkelpagina voor de kijkdoos van het schaduwtheater (einde 4de leerjaar). Ze verdwijnt als de schermen van de
        Lichtkamer klaar zijn. Er wordt niets bewaard.
      </p>

      <div className="b-lk-doos">
        <div className="b-lk-kijk" ref={vak} id="kijkdoos-vak" />
      </div>
      <p className="b-lk-proef-status" id="kijkdoos-status">
        Status: <strong>{open ? status : 'gesloten'}</strong>
        {huidigeStand ? `, stand ${huidigeStand}` : ''}
      </p>
      <p aria-live="polite" id="kijkdoos-beschrijving">
        {beschrijving}
      </p>

      <div className="b-lk-proef-rij" role="group" aria-label="Oefening">
        {(Object.keys(SCENE_NAAM) as (keyof typeof SCENE_NAAM)[]).map((s) => (
          <button key={s} type="button" className="b-knop" aria-pressed={toestand.scene === s} onClick={() => toon(beginToestand(s))}>
            {SCENE_NAAM[s]}
          </button>
        ))}
      </div>

      {toestand.scene === 'voorspel' && (
        <div className="b-lk-proef-rij" role="group" aria-label="Rondes">
          {[0, 1, 2].map((r) => (
            <button
              key={r}
              type="button"
              className="b-knop"
              aria-pressed={toestand.ronde === r}
              onClick={() => toon({ scene: 'voorspel', ronde: r, getoond: false })}
            >
              Ronde {r + 1}
            </button>
          ))}
          <button type="button" className="b-knop" aria-pressed={toestand.getoond} onClick={() => toon({ ...toestand, getoond: !toestand.getoond })}>
            Toon de schaduw
          </button>
        </div>
      )}
      {toestand.scene === 'kaartjes' && (
        <div className="b-lk-proef-rij" role="group" aria-label="Kaartjes">
          <button type="button" className="b-knop" onClick={() => toon({ scene: 'kaartjes', stand: zetLamp(toestand.stand, 1) })}>
            Lamp hoger
          </button>
          <button type="button" className="b-knop" onClick={() => toon({ scene: 'kaartjes', stand: zetLamp(toestand.stand, -1) })}>
            Lamp lager
          </button>
          {[2, 1, 0].map((i) => (
            <button
              key={i}
              type="button"
              className="b-knop"
              onClick={() => toon({ scene: 'kaartjes', stand: zetGat(toestand.stand, i, toestand.stand.gaten[i] === GAAT_HOOGTES.length - 1 ? -2 : 1) })}
            >
              Gaatje {3 - i}: {GAAT_NAAM[toestand.stand.gaten[i] as number]}
            </button>
          ))}
        </div>
      )}
      {toestand.scene === 'onderzoek' && (
        <div className="b-lk-proef-rij" role="group" aria-label="Afstand">
          {[...STANDAARD_AFSTANDEN].map((cm) => (
            <button
              key={cm}
              type="button"
              className="b-knop"
              aria-pressed={Math.abs(toestand.afstandCm - cm) < 0.05}
              onClick={() => toon({ scene: 'onderzoek', afstandCm: cm })}
            >
              {cm} cm
            </button>
          ))}
          <span>Nu: {toestand.afstandCm.toFixed(1).replace('.', ',')} cm</span>
        </div>
      )}

      <div className="b-lk-proef-rij" role="group" aria-label="Kijken">
        {(Object.keys(ZICHT_NAAM) as Zicht[]).map((z) => (
          <button key={z} type="button" className="b-knop" onClick={() => doosRef.current?.zetZicht(z)}>
            {ZICHT_NAAM[z]}
          </button>
        ))}
        <button
          type="button"
          className="b-knop"
          aria-pressed={stralen}
          onClick={() => {
            setStralen(!stralen);
            doosRef.current?.zetStralen(!stralen);
          }}
        >
          Stralen
        </button>
        <button
          type="button"
          className="b-knop"
          aria-pressed={kalm}
          onClick={() => {
            setKalm(!kalm);
            doosRef.current?.zetPrikkelarm(!kalm);
          }}
        >
          Prikkelarm
        </button>
      </div>

      <div className="b-lk-proef-rij">
        <label>
          Voorwerp{' '}
          <select
            value={voorwerp}
            onChange={(e) => {
              const v = e.target.value as Voorwerp;
              setVoorwerp(v);
              doosRef.current?.zetVoorwerp(v);
            }}
          >
            {VOORWERPEN.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stand{' '}
          <select
            value={stand}
            onChange={(e) => {
              const s = e.target.value as StandKeuze;
              setStand(s);
              doosRef.current?.zetStand(s);
            }}
          >
            {STAND_KEUZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="b-knop" id="kijkdoos-open" aria-pressed={open} onClick={() => setOpen(!open)}>
          {open ? 'Sluit de kijkdoos' : 'Open de kijkdoos'}
        </button>
        <button type="button" className="b-knop" onClick={() => setKeer((k) => k + 1)} disabled={!open}>
          Opnieuw openen
        </button>
      </div>
    </section>
  );
}
