// Het vak met de 3D-kijkdoos (LK-5): opent één kijkdoos als het vak verschijnt, sluit ze als het verdwijnt, en houdt haar
// gelijk met de toestand van de lesmachine. De kijkdoos zelf tekent en meldt wat het kind erin deed (slepen, pijltjes).

import { useEffect, useRef, type MutableRefObject } from 'react';
import { openKijkdoos, type Kijkdoos, type KijkdoosStatus, type SceneToestand } from '../kijkdoos';
import { zelfdeToestand } from '../../../lib/basis/lichtkamer/kijkdoos/toestand';
import type { Voorwerp } from '../../../lib/basis/lichtkamer';

export function Kijkvak({
  doosRef,
  scene,
  bord,
  voorwerp,
  stralen,
  prikkelarm,
  opWijziging,
  opBeschrijving,
  opStatus,
}: {
  doosRef: MutableRefObject<Kijkdoos | null>;
  /** Wat de lesmachine nu wil tonen. */
  scene: SceneToestand;
  bord: boolean;
  voorwerp: Voorwerp;
  stralen: boolean;
  prikkelarm: boolean;
  opWijziging: (t: SceneToestand) => void;
  opBeschrijving: (tekst: string) => void;
  opStatus: (s: KijkdoosStatus) => void;
}) {
  const vak = useRef<HTMLDivElement>(null);
  // De functies en beginwaarden gaan via een ref: de kijkdoos opent één keer en leest ze bij elke melding opnieuw.
  const nu = useRef({ scene, voorwerp, stralen, prikkelarm, opWijziging, opBeschrijving, opStatus });
  nu.current = { scene, voorwerp, stralen, prikkelarm, opWijziging, opBeschrijving, opStatus };

  useEffect(() => {
    const el = vak.current;
    if (!el) return;
    const b = nu.current;
    const d = openKijkdoos(el, {
      toestand: b.scene,
      bord,
      voorwerp: b.voorwerp,
      stralen: b.stralen,
      prikkelarm: b.prikkelarm,
      opWijziging: (t) => nu.current.opWijziging(t),
      opBeschrijving: (tekst) => nu.current.opBeschrijving(tekst),
      opStatus: (s) => nu.current.opStatus(s),
    });
    doosRef.current = d;
    return () => {
      d.sluit();
      if (doosRef.current === d) doosRef.current = null;
    };
  }, [bord, doosRef]);

  useEffect(() => {
    const d = doosRef.current;
    // Staat de kijkdoos al zo (het kind sleepte zelf), dan is er niets te tonen.
    if (d && !zelfdeToestand(d.toestand(), scene)) d.toon(scene);
  }, [scene, doosRef]);
  useEffect(() => doosRef.current?.zetStralen(stralen), [stralen, doosRef]);
  useEffect(() => doosRef.current?.zetPrikkelarm(prikkelarm), [prikkelarm, doosRef]);
  useEffect(() => doosRef.current?.zetVoorwerp(voorwerp), [voorwerp, doosRef]);

  return <div className="b-lk-kijk" ref={vak} />;
}
